// symbiot — goals: what the user asked for, owned until it's done, then closed with a breakdown.
// An audit of 16-21 Oct 2026 found 20 things the user asked for: 7 done and verified, 3 done with
// nobody telling them, 5 stalled with nothing to resume them, 2 dropped, 3 still going. Symbiot's
// unit of work was a task line or a run: a task was done once it was ticked, a handover once it
// reported back, a wait resumed only on an email reply, and nothing said what the user had asked
// for, where it ended, or what was left. Lanes showed 0 open items with goals in them unmet, and
// the user asked "where are we" seven times in a day.
//
// A goal is a row "goal:<id>" in the job record (jobs.mjs): the user's own words, a one-line
// done-when, and its children, each a key in that same record or the ledgers beside it:
//   task:<id>    a task on the Workdesk (tasks.json)
//   run:<id>     an agent run, read from its end record (agents.mjs runOutcome)
//   handoff:<id> a handover (lanes.mjs ledger), and the runs and handovers that came of it
//   wait:<id>    an email that waits on a reply (handback.mjs awaiting.json)
// It's made where the user asks for work (mind.mjs converse, /api/tasks/add); the runs, handovers
// and waits that follow in its folders are taken in by the tick (adopt). Its state rolls up from
// them (rollUp), and goalsTick, every 10 minutes, follows it through:
//   waiting on the user    → one card, unless Home already has one for that work
//   waiting on a lane      → the run on the handover is made to go, under the hourly cap
//   waiting on a reply     → at 24h a drafted nudge on a card (sent only on the user's word);
//                            at 72h the card says it's stalled
//   waiting on a time      → the run starts again when that time comes
//   nothing moving for 24h → "Stalled: …" on Home
//   everything ended       → judged against its done-when: met is "Done: <goal>", a breakdown under
//                            Reports, a card and a notification; not met gets one run asked what's
//                            left, then "Not finished: <goal>: <what's missing>". Never closed silently.
// Its cards are questions on Home like any other (path "goal:<id>"), answered through
// agents.mjs answerQuestions (onGoalAnswer, set by server.mjs).
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { CONFIG_DIR, loadTasks, clipWords, jobWords, readState, writeJsonAtomic, sameTask } from "./core.mjs";
import { goalRows, putGoal, loadJobs, ENDED } from "./jobs.mjs";
import { sentAt } from "./handback.mjs";

const DAY = 86400e3, H = 3600e3, DEAD_RUN = 3 * H; // runs that hang are stopped after 45 minutes (agents.mjs runsTick)
const GOALS_DIR = join(CONFIG_DIR, "drafts"); // a goal's breakdown is a report in a folder of its own there (act-<id>)
const STALL_AFTER = DAY, NUDGE_AFTER = DAY, SURFACE_AFTER = 3 * DAY, WAIT_OLD = 7 * DAY, LEFT_TRIES = 1;
const CARDS_FILE = join(CONFIG_DIR, "goal-cards.json"); // the old-wait cards' "keep waiting" (an email wait isn't a goal)
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const folderOf = (g) => join(GOALS_DIR, "act-" + g.key.slice(5));

// ---- making a goal, and its children ---------------------------------------------
// The user's words, what it was handed to (a run, a task) and where. done-when is filled in after
// (doneWhenFor), so asking never waits on it.
function openGoal(words, { child = "", lane = "", path = "", now = Date.now() } = {}) {
  words = String(words || "").trim(); if (!words) return null;
  const g = { key: "goal:" + randomBytes(4).toString("hex"), kind: "goal", lane: clip(lane, 60), text: clip(words, 140), asked: words.slice(0, 1500), doneWhen: "", children: [], paths: [], state: "running", waitingOn: "", what: "", at: now, changed: now, moved: now, history: [] };
  if (child) g.children.push(child);
  if (path) g.paths.push(path);
  putGoal(g, { now }); return g;
}
const goalById = (id, { jobs = loadJobs() } = {}) => jobs.find((j) => j.key === (String(id).startsWith("goal:") ? id : "goal:" + id)) || null;
const goalOf = (childKey, { jobs = loadJobs() } = {}) => goalRows({ jobs }).find((g) => (g.children || []).includes(childKey)) || null;
function linkChild(id, key, { path = "", now = Date.now() } = {}) {
  const g = goalById(id); if (!g || !key) return null;
  if (!g.children.includes(key)) g.children.push(key);
  if (path && !g.paths.includes(path)) g.paths.push(path);
  g.changed = now; putGoal(g, { now }); return g;
}
// ---- what is a goal --------------------------------------------------------------
// Only a request for work with an outcome is one. On 22 Oct 2026, 26 "goals" were open, one per
// message: "yes", "1", "proceeed", "do it yourself", "who makes these cards?", "give me a list of
// whats open so i can be disappointed in you". The list said almost nothing was finished because
// almost nothing in it was a goal. A question, an answer, a one-word reply, a complaint or a status
// ask never opens one; an instruction about work already going joins its goal instead.
const NOT_WORK = [
  /^\W*(?:yes|yeah|yep|yup|no|nope|ok|okay|sure|thanks|thank you|cheers|proce+d|go ahead|go for it|do it|done|skip|stop|fine|great|cool|perfect|\d+)\W*$/i, // a bare reply
  /\?\s*(?:\(the user attached[^)]*\))?\s*$/i, // a question
  /^\s*(?:did|do (?:you|we|i|they)|does|is|are|was|were|why|what|whats|what's|how|when|where|who|which|have (?:you|we)|has|can i|should i)\b/i, // a question without its mark ("do it yourself" isn't one)
  /\b(?:wtf|what the f|where are we|what'?s open|list of what|status of|patience|disappoint|annoy|frustrat|is (?:it|this) broken|it'?s broken)\b/i, // a complaint or a status ask
];
const FOLLOW_UP = /^\W*(?:\S+\s+){0,5}\S*\W*$/; // six words or fewer
const REFERS = /\b(?:it|this|that|these|those|them|again|yourself|instead|too|now)\b/i;
const plainlyNotWork = (w) => { const t = String(w || "").replace(/\(The user attached[^)]*\)/gi, "").trim(); return !t || NOT_WORK.some((r) => r.test(t)); };
// "new" (opens a goal), "follow" (joins the goal it's about) or "none". With an AI (write), the
// words are judged; without one, only the plain rules: anything they don't rule out is new, unless
// it's a short line pointing at something already going ("do it yourself", "check it again").
async function goalKind(words, { write } = {}) {
  const t = String(words || "").trim();
  if (plainlyNotWork(t)) return "none";
  const short = FOLLOW_UP.test(t) && REFERS.test(t);
  if (typeof write !== "function") return short ? "follow" : "new";
  try {
    const r = await write("You sort one message a person sent to their AI assistant. Answer JSON only: {\"kind\":\"new\"|\"follow\"|\"none\"}. new: a fresh request for work with an outcome (build, fix, send, find out and report, set up). follow: an instruction or new information about work already going (\"do it yourself\", \"email from domains just landed\", \"he already sent the prompts, use them\"). none: a question, an answer to a question, a reply, a complaint, a thank-you, or asking for status.", `The message:\n${t.slice(0, 1500)}`, { fast: true, kind: "triage" });
    const k = ((r && typeof r.text === "string" ? r.text : "").match(/"kind"\s*:\s*"(new|follow|none)"/) || [])[1];
    if (k) return k;
  } catch {}
  return short ? "follow" : "new";
}
const WORDS = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(" ").filter((w) => w.length > 3));
// The open goal a follow-up is about: the one already in that folder, else the busiest one in its
// lane that shares words with it, else the lane's newest. null when the lane has none open.
function goalToJoin(words, { lane = "", path = "", jobs = loadJobs(), now = Date.now() } = {}) {
  const open = goalRows({ jobs }).filter((g) => !ENDED.has(g.state) && !g.dropped && now - (g.changed || g.at || 0) < 3 * DAY);
  if (path) { const here = open.filter((g) => (g.paths || []).includes(path)).sort((a, b) => (b.changed || 0) - (a.changed || 0))[0]; if (here) return here; }
  if (!lane) return null;
  const mine = open.filter((g) => g.lane === lane); if (!mine.length) return null;
  const w = WORDS(words), score = (g) => [...WORDS(g.asked || g.text)].filter((x) => w.has(x)).length;
  return mine.sort((a, b) => score(b) - score(a) || (b.changed || 0) - (a.changed || 0))[0];
}
// Where the user's words go: a new goal, the goal they follow up, or none at all.
async function goalFor(words, { child = "", lane = "", path = "", now = Date.now(), write } = {}) {
  const kind = await goalKind(words, { write });
  if (kind === "none") return null;
  if (kind === "new") return openGoal(words, { child, lane, path, now }); // new work in a lane with a goal open is a goal of its own
  const join = goalToJoin(words, { lane, path, now });
  return join ? (child ? linkChild(join.key, child, { path, now }) : join) : null;
}
// The rows opened before this rule from a question, a reply or a remark: closed as not a goal, kept
// in the record's history and off every surface (jobs.mjs goalRows). Once each.
function tidyGoals({ jobs = loadJobs(), now = Date.now() } = {}) {
  let n = 0;
  for (const g of jobs.filter((j) => j.kind === "goal" && !j.notGoal && !j.sorted)) {
    if (plainlyNotWork(g.asked || g.text)) { putGoal({ ...g, notGoal: true, sorted: true, state: "done", waitingOn: "", note: "not a goal: a question, a reply or a remark", history: [...(g.history || []), { state: g.state, at: g.changed }].slice(-8), changed: now }, { now }); n++; }
    else putGoal({ ...g, sorted: true }, { now });
  }
  return n;
}

// One line of what "done" means for it, from the user's words; the words themselves without an AI.
async function doneWhenFor(g, { write } = {}) {
  let line = "";
  if (write) {
    try {
      const r = await write("You turn a request into one plain line saying what will be true when it's done, checkable from what the agents report (a reply sent and received, a fix live, a count known). No preamble, no quotes.", `The request:\n${g.asked}`, { fast: true, kind: "triage" });
      line = clip(r && r.text, 200);
    } catch {}
  }
  const cur = goalById(g.key); if (!cur) return null;
  cur.doneWhen = line || clip(g.asked, 200); putGoal(cur); return cur;
}

// ---- where each child stands ---------------------------------------------------------
// { at, state: active | waiting | ended, waitingOn, what, path, ok (ended done, not failed or stopped), summary }
function childState(key, ctx) {
  const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  if (kind === "task") {
    const t = ctx.tasks.find((x) => x.id === id);
    if (!t || t.removed) return { state: "ended", ok: false, what: "removed from the Workdesk" };
    if (t.done || t.archived) return { state: "ended", ok: true, path: ctx.map[t.repo] || "" };
    if (t.review) return { state: "waiting", waitingOn: "user", what: "its changes wait for Approve", path: ctx.map[t.repo] || "" };
    return { state: "active", path: ctx.map[t.repo] || "" };
  }
  if (kind === "run") {
    const j = ctx.jobs.find((x) => x.key === key); if (!j) return { state: "active" };
    if (ctx.running(j.path)) return { state: "active", path: j.path };
    if (j.state === "running" && (ctx.now || Date.now()) - (j.changed || j.at || 0) > DEAD_RUN) return { state: "ended", path: j.path, at: j.changed, summary: "its end wasn't recorded: nothing has run there since" }; // a record still "running" with nothing running there held its goal open for good
    if (j.state === "waiting") { // the job it's on (its [~] item, or an ops run's own request), for the card's "I'm on it: …"
      const job = jobWords(j.task || (j.lane === "agent" || /^act-/.test(String(j.lane || "")) ? j.text : ""));
      return { state: "waiting", waitingOn: j.waitingOn, what: j.what, path: j.path, at: j.changed, summary: j.summary, ...(job ? { task: job } : {}), ...(j.bare ? { bare: true } : {}) };
    }
    if (j.state === "review") return { state: "waiting", waitingOn: "user", what: "its changes wait for Approve", path: j.path, at: j.changed, summary: j.summary };
    if (j.state === "paused") return { state: "active", path: j.path, summary: j.summary };
    if (ENDED.has(j.state) || j.state === "approved" || j.state === "merged") return { state: "ended", ok: j.state !== "failed", path: j.path, at: j.changed, summary: j.summary || j.note || "" };
    return { state: "active", path: j.path };
  }
  if (kind === "handoff") {
    const h = ctx.ledger.handoffs.find((x) => x.id === id); if (!h) return { state: "ended", ok: false, what: "the handover is gone from the ledger" };
    if (h.status === "error") return { state: "ended", ok: false, what: `it couldn't be handed over: ${clip(h.error, 120)}` };
    if (h.reportedAt) return { state: "ended", ok: h.status !== "stopped", path: h.to.path, at: h.reportedAt, summary: clip(h.result, 400) };
    return { state: "waiting", waitingOn: "lane", what: `${h.to.lane}: ${clipWords(String(h.text).split("\n")[0], 90)}`, path: h.to.path, at: h.at, handoff: h };
  }
  if (kind === "wait") {
    const w = ctx.waits.find((x) => x.id === id); if (!w) return { state: "ended", ok: false };
    if (w.status === "waiting") return { state: "waiting", waitingOn: "third party", what: `a reply from ${w.to} about "${clip(w.subject, 80)}"`, at: sentAt(w), wait: w };
    return { state: "ended", ok: w.status === "replied", summary: w.reply ? clip(w.reply, 300) : "" };
  }
  return { state: "ended", ok: true };
}
// The runs, handovers and waits in its folders since it was asked for, which it didn't have yet:
// every run in its folders after it began, each handover from them (and from those, down the
// chain), and each email wait they started. A folder's later runs stop being its once its task is done.
// A lane's folder is shared: every goal there took every run in it, and every folder those runs or
// their handovers reached, so the two marketing goals took all of webapp's runs and showed its
// 'faceVerificationEnabled' release as their blocker, and stayed open with both their tasks long
// approved (24 Oct 2026). So a folder another child reached is the goal's only when it's a run's own
// (an ops folder, a copy beside a lane); in a shared one, a run that says which item it's on joins
// only when that item is the goal's; and once all its tasks are done, later runs there aren't its.
const OWN_FOLDER = (p) => /\/drafts\/act-[^/]+\/?$|\/worktrees\/[^/]+\/?$/.test(String(p || ""));
const wordsOf = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
function sameItem(a, b) { // an item and a clipped copy of it (a run's record cuts it mid-word)
  if (sameTask(a, b)) return true;
  const x = wordsOf(a), y = wordsOf(b), [sh, lo] = x.length < y.length ? [x, y] : [y, x], head = sh.slice(0, -1);
  return head.length >= 6 && head.every((w, i) => lo[i] === w);
}
function goalTasks(g, ctx) { return g.children.filter((k) => k.startsWith("task:")).map((k) => ctx.tasks.find((t) => "task:" + t.id === k)).filter(Boolean); }
function tasksDoneAt(g, ctx) { // when the last of its tasks was done, or 0 while one is open (or none says when)
  const ts = goalTasks(g, ctx); if (!ts.length) return 0;
  let at = 0; for (const t of ts) { if (!(t.done || t.archived)) return 0; const w = Number(t.doneAt || t.approvedAt || t.archivedAt) || 0; if (!w) return 0; at = Math.max(at, w); }
  return at;
}
function runBelongs(g, j, ctx, done = tasksDoneAt(g, ctx)) {
  if (OWN_FOLDER(j.path)) return true;
  if (done && (j.at || 0) > done) return false;
  if (!j.task) return true;
  return [g.asked || g.text, ...goalTasks(g, ctx).map((t) => t.text)].some((t) => sameItem(t, j.task));
}
function adopt(g, ctx) {
  const before = g.children.length, done = tasksDoneAt(g, ctx), first = g.children[0];
  const handOf = (k) => ctx.ledger.handoffs.find((h) => "handoff:" + h.id === k), runOf = (k) => ctx.jobs.find((x) => x.key === k);
  // a lane folder only a handover reached isn't its (the old rule took it whole): its runs there are the handover's own
  const wasHanded = g.children.map(handOf).filter(Boolean), reached = new Set(wasHanded.map((h) => h.to && h.to.path).filter((p) => p && !OWN_FOLDER(p) && p !== g.paths[0]));
  const paths = new Set(g.paths.filter((p) => !reached.has(p)));
  const own = (p) => p && paths.has(p);
  const mine = (j) => !!j && String(j.key).startsWith("run:") && (OWN_FOLDER(j.path) || own(j.path)) && (j.at || 0) >= g.at && runBelongs(g, j, ctx, done);
  // a handover from a shared folder is its only when the run that made it is: one run works a lane's
  // folder at a time, so that's the last one started there before the handover was sent
  const madeByMine = (h) => { if (OWN_FOLDER(h.from.path)) return true; let by = null; for (const j of ctx.jobs) if (String(j.key).startsWith("run:") && j.path === h.from.path && (j.at || 0) <= (h.at || 0) && (!by || (j.at || 0) > (by.at || 0))) by = j; return !!by && mine(by); };
  // its handovers, rebuilt by those rules each time (a chain from one that wasn't its goes too), and down their chains
  const hands = [];
  for (let pass = 0; pass < 3; pass++) for (const h of ctx.ledger.handoffs) if (!hands.includes(h) && (h.at || 0) >= g.at && ((own(h.from.path) && madeByMine(h)) || hands.some((x) => x.id === h.parent))) { hands.push(h); if (h.to.path && OWN_FOLDER(h.to.path)) paths.add(h.to.path); }
  const byHand = new Set(hands.map((h) => h.job && "run:" + h.job).filter(Boolean));
  // the rest it had: a run only if it's still its (in its folders, on its item, before its tasks were done) or a handover's own
  const rest = g.children.filter((k, i) => i > 0 && !k.startsWith("handoff:") && (!k.startsWith("run:") || byHand.has(k) || ((j) => !j || mine(j))(runOf(k))));
  g.children = [...(first ? [first] : []), ...hands.map((h) => "handoff:" + h.id).filter((k) => k !== first), ...rest.filter((k) => !hands.some((h) => "handoff:" + h.id === k))];
  for (const k of byHand) if (!g.children.includes(k) && runOf(k)) g.children.push(k);
  for (const k of g.children) { const c = childState(k, ctx); if (c.path && OWN_FOLDER(c.path)) paths.add(c.path); }
  for (const j of ctx.jobs) if (!g.children.includes(j.key) && j.path && own(j.path) && mine(j)) g.children.push(j.key);
  for (const w of ctx.waits) if (w.from && own(w.from.path) && (w.at || 0) >= g.at && !g.children.includes("wait:" + w.id)) g.children.push("wait:" + w.id);
  g.paths = [...paths];
  return g.children.length - before;
}
// The goal's state, from its children: one waiting on the user first, then any still going, then
// one waiting on a lane, a reply or a time; all ended is "ended" (judged by closeOut).
function rollUp(g, ctx) {
  const kids = g.children.map((k) => ({ key: k, ...childState(k, ctx) }));
  const first = (f) => kids.find(f);
  const u = first((c) => c.state === "waiting" && c.waitingOn === "user");
  if (u) return { state: "waiting", waitingOn: "user", what: clip(u.what, 200), since: u.at || 0, kids };
  if (first((c) => c.state === "active")) return { state: "running", waitingOn: "", what: "", kids };
  for (const on of ["lane", "third party", "time"]) { const c = first((x) => x.state === "waiting" && x.waitingOn === on); if (c) return { state: "waiting", waitingOn: on, what: clip(c.what, 200), since: c.at || 0, kids }; }
  if (!kids.length) return { state: "running", waitingOn: "", what: "", kids };
  return { state: "ended", waitingOn: "", what: "", kids };
}

// ---- closing a goal ------------------------------------------------------------------
// Whether its done-when is met, from what its children ended with. Conservative: not met unless
// the record shows it. null with no AI to judge (the breakdown then says it isn't verified).
async function judgeDone(g, kids, { write } = {}) {
  if (!write) return null;
  const lines = kids.map((c) => `- ${c.key}: ${c.state}${c.ok === false ? " (did not finish)" : ""}${c.summary ? `: ${clip(c.summary, 500)}` : ""}${c.what ? ` (${clip(c.what, 160)})` : ""}`).join("\n");
  let r; try { r = await write(`You check whether what the user asked for is done, from the agents' own records. Be strict: met only if the records show the done-when is true (sent, live, known, confirmed), not that work was attempted or handed on. Answer JSON only: {"met":true|false,"done":["what was done, with any PR, commit or link named in the records"],"verified":"how the records show it, or what's unverified","left":"what's missing, empty if met"}.`, `What the user asked for:\n${g.asked}\n\nDone when: ${g.doneWhen || g.asked}\n\nThe records:\n${lines}`, { fast: true, kind: "triage" }); } catch { return null; }
  const m = String((r && r.text) || "").match(/\{[\s\S]*\}/); if (!m) return null;
  try { const o = JSON.parse(m[0]); return { met: o.met === true, done: Array.isArray(o.done) ? o.done.map((x) => clip(x, 300)).slice(0, 12) : [], verified: clip(o.verified, 400), left: clip(o.left, 400) }; } catch { return null; }
}
const costOf = (g, ctx) => { let usd = 0, ms = 0; for (const k of g.children.filter((x) => x.startsWith("run:"))) { const j = ctx.jobs.find((x) => x.key === k); if (j) { usd += Number(j.cost) || 0; ms += Math.max(0, (j.changed || 0) - (j.at || 0)); } } return { usd, ms }; };
// The breakdown, under Reports in the goal's own folder: what was asked, what was done, how it's
// known, what's left or declined, and the time and cost. { file, name }.
function writeBreakdown(g, v, kind, ctx, now = Date.now()) {
  const dir = join(folderOf(g), ".symbiot"); try { mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch {}
  const head = kind === "done" ? `Done: ${g.text}` : kind === "dropped" ? `Dropped: ${g.text}` : `Not finished: ${g.text}`;
  const { usd, ms } = costOf(g, ctx), mins = Math.round((now - g.at) / 60000);
  const kids = (v && v.kids) || rollUp(g, ctx).kids;
  const md = [`# ${head}`, "", `**Asked** ${new Date(g.at).toLocaleString("en-ZA", { hour12: false })}: ${g.asked}`, "", `**Done when:** ${g.doneWhen || "(not set)"}`, "",
    "## What was done", ...(v && v.done && v.done.length ? v.done.map((x) => `- ${x}`) : kids.filter((c) => c.summary).map((c) => `- ${clip(c.summary, 300)}`)), "",
    "## How it's known", v && v.verified ? v.verified : "Not verified: no AI was there to check the records against the done-when.", "",
    "## What's left", (v && v.left) || (kind === "done" ? "Nothing." : kind === "dropped" ? "Dropped by the user." : "Not recorded."), "",
    "## The work under it", ...kids.map((c) => `- ${c.key}: ${c.state}${c.ok === false ? " (didn't finish)" : ""}${c.what ? `, ${clip(c.what, 140)}` : ""}`), "",
    `Took ${mins < 120 ? `${mins} min` : `${Math.round(mins / 60)} h`} from asking${usd ? `, about $${usd.toFixed(2)} of agent time` : ""}${ms ? ` (${Math.round(ms / 60000)} agent-minutes)` : ""}.`, ""].join("\n");
  const name = `${kind === "done" ? "DONE" : kind === "dropped" ? "DROPPED" : "NOT-FINISHED"}-${g.key.slice(5)}.md`;
  try { writeFileSync(join(dir, name), md); } catch {}
  return { file: join(dir, name), name, folder: folderOf(g) };
}
function close(g, kind, v, ctx, deps, now) {
  const r = writeBreakdown(g, v, kind, ctx, now);
  g.state = "done"; g.waitingOn = ""; g.what = ""; g.changed = now;
  g.closed = { kind: kind === "done" ? "done" : kind === "dropped" ? "dropped" : "not", at: now, report: r.name, folder: r.folder, ...(v && v.left ? { missing: v.left } : {}) };
  g.card = kind === "dropped" ? null : { kind: kind === "done" ? "done" : "notdone", q: kind === "done" ? `Done: ${g.text}` : `Not finished: ${g.text}: ${clip((v && v.left) || "see its breakdown", 160)}`, options: kind === "done" ? ["Got it"] : ["Try again", "Drop it"], at: now };
  try { (deps.notify || (() => {}))(kind === "done" ? "Done" : "Not finished", clip(g.text, 120)); } catch {}
}

// The sentence of a run's last words that says what it needs from the user ("…creating the account
// and sending the ticket need your yes."), so a card's one ask isn't lost after "The move isn't done.".
const NEEDS_USER = /\b(?:you|your|the user|garth(?:'s)?)\b|\byes\b|\bok\b|approv|go-?ahead|sign[- ]?in|password|\bcode\b/i, YES_ASK = /\byes\b|\bok\b|approv|go-?ahead/i;
function askIn(said) {
  const s = String(said || "").replace(/\s+/g, " ").trim().match(/[^.!?]+(?:[.!?]+|$)/g) || [];
  return (s.find((x) => NEEDS_USER.test(x)) || s.join(" ")).trim();
}
// ---- the tick ----------------------------------------------------------------------
// deps: { write (ai.mjs), running(path), start(path) → run entry, autoStart(path) → bool,
//   ops(request, opts) → { job, dir } (mind.mjs actNow), notify(title, body), settle(path, note),
//   tasks, ledger, waits, jobs, map }. Returns what it did, for the log and the tests.
async function goalsTick(deps = {}, { now = Date.now() } = {}) {
  const ctx = { tasks: deps.tasks || loadTasks(), ledger: deps.ledger || { handoffs: [] }, waits: deps.waits || [], jobs: deps.jobs || loadJobs(), map: deps.map || {}, running: deps.running || (() => false), now };
  const did = [];
  if (!deps.jobs) { try { tidyGoals({ now }); ctx.jobs = loadJobs(); } catch {} }
  for (const g0 of goalRows({ jobs: ctx.jobs })) {
    if (ENDED.has(g0.state) || g0.dropped) continue;
    const g = { ...g0, children: [...(g0.children || [])], paths: [...(g0.paths || [])] };
    if (!g.doneWhen && deps.write) { const d = await doneWhenFor(g, { write: deps.write }); if (d) g.doneWhen = d.doneWhen; }
    adopt(g, ctx);
    const r = rollUp(g, ctx), sig = `${r.state}|${r.waitingOn}|${r.what}|${g.children.length}|${r.kids.filter((c) => c.state === "ended").length}`;
    if (sig !== g.sig) { g.sig = sig; g.moved = now; if (g.card && g.card.kind === "stalled") g.card = null; }
    g.state = r.state === "ended" ? "running" : r.state; g.waitingOn = r.waitingOn; g.what = r.what;
    if (r.state === "waiting") g.since = g.since && g.sinceOn === r.waitingOn ? g.since : (r.since || now), g.sinceOn = r.waitingOn; else { g.since = 0; g.sinceOn = ""; }
    const start = (path, why) => { if (!path || ctx.running(path)) return false; if (deps.autoStart && !deps.autoStart(path)) return false; const e = deps.start ? deps.start(path) : null; if (e && e.id) { did.push({ goal: g.key, started: path, why }); return true; } return false; };
    if (r.state === "ended") {
      const v = await judgeDone(g, r.kids, deps);
      if (!v && !deps.write) { const ok = r.kids.every((c) => c.ok !== false); close(g, ok ? "done" : "not", { kids: r.kids, left: ok ? "" : "some of its work didn't finish" }, ctx, deps, now); did.push({ goal: g.key, closed: ok ? "done" : "not" }); } // no AI to judge: closed as its parts ended, and the breakdown says it isn't verified
      else if (v && v.met) { close(g, "done", { ...v, kids: r.kids }, ctx, deps, now); did.push({ goal: g.key, closed: "done" }); }
      else if ((g.leftTries || 0) < LEFT_TRIES && deps.ops) {
        g.leftTries = (g.leftTries || 0) + 1;
        const e = deps.ops(`What's left on this, and do it: ${g.asked}\n\nDone when: ${g.doneWhen || g.asked}\n\nWhat was found missing: ${(v && v.left) || "nothing judged it done"}. Check the earlier runs' reports first and don't redo what they finished. If something only the user can do is all that's left, ask it in QUESTIONS.md.`, { title: `What's left on: ${clip(g.text, 60)}` });
        if (e && (e.job || e.dir)) { if (e.job) g.children.push("run:" + e.job); if (e.dir) g.paths.push(e.dir); did.push({ goal: g.key, whatsLeft: e.job || e.dir }); }
      } else { close(g, "not", v ? { ...v, kids: r.kids } : { left: "every part of it ended, and nothing shows it's done", kids: r.kids }, ctx, deps, now); did.push({ goal: g.key, closed: "not" }); }
    } else if (r.state === "waiting") {
      const c = r.kids.find((x) => x.state === "waiting" && x.waitingOn === r.waitingOn) || {};
      if (r.waitingOn === "user") {
        const carded = (deps.cardPaths || new Set()); // Home has a card for that work already: one card, not two
        // the card is the step it waits on, in the run's words (its record's `what`), never the user's
        // own request echoed back: "no as discussed we have created the …company…" was all one showed
        // (22 Oct 2026). No step on record, no card: there's nothing to decide.
        // It says who's doing the work: the agent, on its job (task), with what it has done so far (done),
        // then the one thing it needs. A [~] item with no note (bare) was only the task: its words aren't
        // the user's step, so the run's own last words ask instead ("Move bookly.co.za into a … Copy them
        // into a…" read as the user's job, and they asked "how should i know you are the one thats
        // manning it not me", 22 Oct 2026).
        const ask = c.bare && c.summary ? askIn(c.summary) : r.what, yes = c.bare && YES_ASK.test(ask);
        if (!(c.path && carded.has(c.path)) && (!g.card || g.card.kind !== "user") && ask) g.card = { kind: "user", q: clip(ask, 300), options: [yes ? "Go ahead" : "I've done it", "Drop it"], ...(c.task ? { task: clip(c.task, 120) } : {}), ...(c.summary && !c.bare ? { done: clip(c.summary, 240) } : {}), at: now };
        // a card the card writer found isn't theirs (needs.mjs notTheirs: "Is it moved yet?") goes back to
        // the run: it checks for itself and carries on, under the hourly cap, never a card again for it
        if (g.card && g.card.kind === "user" && deps.notTheirs && deps.notTheirs(g.card) && c.path && !ctx.running(c.path)) {
          if (deps.settle) { try { deps.settle(c.path, "not the user's: find it yourself (Symbiot's vault, the linked mailboxes and connectors, the user's files) and carry on"); } catch {} }
          if (start(c.path, "the card for this asked for something you can find or check yourself: look in Symbiot's vault, the linked mailboxes and connectors and the user's files first, carry on, and ask the user only for what none of them has") !== false) { g.card = null; did.push({ goal: g.key, checking: c.path }); }
        }
      } else if (r.waitingOn === "lane" && c.handoff && c.path && now - (c.at || now) > H) {
        start(c.path, `${c.handoff.to.lane} hadn't started on it`);
      } else if (r.waitingOn === "third party") {
        const waited = now - (g.since || now);
        if (waited > NUDGE_AFTER && !g.nudge) {
          let text = ""; if (deps.write) { try { text = clip((await deps.write("Write a short, polite follow-up message (two or three sentences, no subject line, no sign-off) chasing a reply. Plain words.", `What we're waiting for: ${r.what}\nThe work it's for: ${g.asked}`, { fast: true, kind: "triage" })).text, 800); } catch {} }
          g.nudge = { text: text || `Just following up on my earlier message: could you let me know where this stands? Thanks.`, at: now };
          g.card = { kind: "nudge", q: `Still waiting on ${clip(r.what, 140)} (since ${new Date(g.since).toLocaleDateString("en-ZA")}). Send this follow-up? "${clip(g.nudge.text, 300)}"`, options: ["Send the follow-up as drafted", "Keep waiting", "Drop it"], at: now };
        } else if (waited > SURFACE_AFTER && g.card && g.card.kind === "nudge" && !g.card.stalled) { g.card = { ...g.card, stalled: true, q: `No reply in ${Math.round(waited / DAY)} days: ${g.card.q}` }; }
      } else if (r.waitingOn === "time" && c.path) {
        const until = deps.until ? deps.until(c.what, now) : 0;
        if (until && until <= now && start(c.path, "the time it waited for came") && deps.settle) deps.settle(c.path, "the time it waited for came");
      }
    }
    if (g.state !== "done" && now - (g.moved || g.at) > STALL_AFTER && (!g.card || g.card.kind === "user")) g.card = { kind: "stalled", q: `Stalled: ${g.text}, ${g.waitingOn ? `waiting on ${g.waitingOn === "user" ? "you" : g.waitingOn}${g.what ? ` (${clip(g.what, 120)})` : ""}` : "with nothing moving"} since ${new Date(g.moved || g.at).toLocaleString("en-ZA", { hour12: false })}`, options: ["Look into it now", "Keep waiting", "Drop it"], at: now };
    g.history = g.history || [];
    if (JSON.stringify(g) !== JSON.stringify(g0)) putGoal(g, { now });
  }
  return did;
}

// ---- Home ----------------------------------------------------------------------------
// The goals' cards, and an email that's waited a week (handback.mjs), as Home questions.
function loadCardsFile() { return readState(CARDS_FILE, (x) => x && typeof x === "object") || {}; }
function goalCards({ jobs = loadJobs(), waits = [], now = Date.now() } = {}) {
  const out = [];
  for (const g of goalRows({ jobs })) {
    if (!g.card || g.card.seen) continue;
    out.push({ kind: "ask", id: `goal:${g.key.slice(5)}:${g.card.kind}`, path: g.key, repo: g.lane || "", title: g.card.kind === "done" ? "Done" : g.card.kind === "notdone" ? "Not finished" : "Your goal", sub: clip(g.card.q, 90), q: g.card.q, options: g.card.options, goal: g.key.slice(5), ...(g.card.task ? { task: g.card.task } : {}), ...(g.card.done ? { done: g.card.done } : {}), ...(g.closed && g.closed.report ? { goalReport: { folder: g.closed.folder, name: g.closed.report } } : {}) });
  }
  const kept = loadCardsFile().kept || {};
  for (const w of waits) {
    const sent = sentAt(w);
    if (w.status !== "waiting" || !sent || now - sent < WAIT_OLD || (kept[w.id] && kept[w.id] > now)) continue;
    out.push({ kind: "ask", id: `goal:wait:${w.id}`, path: `goal:wait:${w.id}`, repo: (w.from && w.from.lane) || "", title: "Still no reply", sub: clip(`${w.to}: ${w.subject}`, 90), q: `No reply in ${Math.round((now - sent) / DAY)} days from ${w.to} about "${clip(w.subject, 100)}". Keep waiting for it?`, options: ["Keep waiting", "Stop waiting"] });
  }
  return out;
}
// An answer on one of those cards (agents.mjs answerQuestions, path "goal:<id>" or "goal:wait:<id>").
// deps: as goalsTick's, plus stop(waitId) (handback.mjs stopWaiting).
function goalAnswer(path, answers = [], deps = {}, { now = Date.now() } = {}) {
  const a = String(((answers || [])[0] || {}).a || "").trim(), is = (x) => a.toLowerCase().startsWith(x.toLowerCase());
  if (!a) return { error: "Pick or type at least one answer." };
  if (path.startsWith("goal:wait:")) {
    const id = path.slice(10);
    if (is("Stop waiting")) { try { deps.stop && deps.stop(id); } catch {} return { ok: true, said: "Stopped waiting for it." }; }
    const d = loadCardsFile(); d.kept = { ...(d.kept || {}), [id]: now + WAIT_OLD }; try { writeJsonAtomic(CARDS_FILE, d, { indent: 1 }); } catch {}
    return { ok: true, said: "Kept waiting; it'll come up again in a week." };
  }
  const g = goalById(path); if (!g) return { error: "That goal isn't on record any more." };
  const ctx = { tasks: deps.tasks || loadTasks(), ledger: deps.ledger || { handoffs: [] }, waits: deps.waits || [], jobs: deps.jobs || loadJobs(), map: deps.map || {}, running: deps.running || (() => false), now };
  const kind = g.card && g.card.kind; let said = "Noted.";
  if (is("Drop it")) { close(g, "dropped", { left: "Dropped by the user." }, ctx, deps, now); g.dropped = true; said = "Dropped. Its breakdown is under Reports."; }
  else if (kind === "done" || is("Got it")) { if (g.card) g.card = { ...g.card, seen: now }; said = "Done and closed."; }
  else if (is("Keep waiting")) { g.card = null; g.moved = now; if (g.nudge) g.nudge = { ...g.nudge, at: now }; said = "Kept waiting; it'll come up again if nothing moves."; }
  else if (is("Send the follow-up") && deps.ops && g.nudge) {
    const r = rollUp(g, ctx), w = r.kids.find((c) => c.wait);
    const e = deps.ops(`Send this follow-up exactly as written, as a reply on the same thread${w ? ` ("${w.wait.subject}", to ${w.wait.to})` : ""}. The user approved this text word for word on Home just now:\n\n${g.nudge.text}`, { title: `Follow-up: ${clip(g.text, 60)}` });
    if (e && e.job) g.children.push("run:" + e.job); if (e && e.dir) g.paths.push(e.dir);
    g.card = null; g.moved = now; said = e && (e.job || e.dir) ? "The follow-up is going out as drafted." : `It didn't start: ${(e && e.error) || "no agent"}`;
  } else if (is("I've done it") || is("Go ahead")) { // Go ahead: the yes a run's own words asked for (goalsTick askIn)
    const why = is("Go ahead") ? "the user said go ahead" : "the user did their step";
    for (const c of rollUp(g, ctx).kids.filter((x) => x.state === "waiting" && x.waitingOn === "user" && x.path)) { try { deps.settle && deps.settle(c.path, why); } catch {} try { deps.start && deps.start(c.path); } catch {} }
    g.card = null; g.moved = now; said = "Thanks: its work carries on.";
  } else if (is("Try again") || is("Look into it now")) {
    g.leftTries = 0; g.card = null; g.moved = now;
    if (g.state === "done") { g.state = "running"; g.closed = null; }
    const e = deps.ops ? deps.ops(`Look into this and finish it: ${g.asked}\n\nDone when: ${g.doneWhen || g.asked}\n\nRead the earlier runs' reports first (its breakdown is in Reports) and don't redo what they finished. If something only the user can do is all that's left, ask it in QUESTIONS.md.`, { title: `Finish: ${clip(g.text, 60)}` }) : null;
    if (e && e.job) g.children.push("run:" + e.job); if (e && e.dir) g.paths.push(e.dir);
    said = e && (e.job || e.dir) ? "An agent is on it now." : `It didn't start: ${(e && e.error) || "no agent"}`;
  } else { g.card = null; g.moved = now; g.note = clip(a, 200); }
  putGoal(g, { now });
  return { ok: true, saved: 1, said };
}

export { goalKind, goalFor, goalToJoin, tidyGoals, plainlyNotWork, openGoal, linkChild, goalById, goalOf, doneWhenFor, childState, adopt, rollUp, judgeDone, writeBreakdown, goalsTick, goalCards, goalAnswer, folderOf, STALL_AFTER, NUDGE_AFTER, SURFACE_AFTER, WAIT_OLD };
