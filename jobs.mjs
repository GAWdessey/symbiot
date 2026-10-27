// "Where are we?" from one record. Each job (an agent run, a PR, an email) has one row in
// ~/.config/symbiot/jobs.json, written by the code paths that already know the truth
// (actNow, afterShip, markLive, settleSent), never worked out from text. Home's chat and
// `symbiot status` answer from it, and say there's no record rather than guess (20 Oct 2026:
// 17 of 120 replies took back a merged-vs-live or running-vs-queued answer).
import { join } from "node:path";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";

const FILE = join(CONFIG_DIR, "jobs.json");
const MAX_KEEP = 300, DAY = 86400e3;
// asked → queued (its turn is coming) → running → done, or review (done, waits on Approve) → approved
// (merge queued) → blocked (GitHub won't merge it: conflicts or a failed check, probes.mjs actOn; back to approved when it clears) → merged → live; email jobs end at sent. failed is a run or step that stopped.
// An agent run ends (agents.mjs runOutcome) as one of: waiting (on the user, a lane, a third party
// or a time, with what), paused (open work left, nothing waiting), review, done or failed.
const STATES = ["asked", "queued", "running", "done", "review", "approved", "blocked", "merged", "live", "sent", "failed", "waiting", "paused"];
const WAITING = ["user", "lane", "third party", "time", ""];
const SAYS = { asked: "asked, not started", queued: "queued, not started yet", running: "running now", done: "finished, nothing to approve", review: "done, waiting for Approve", approved: "approved, merge queued (not merged yet)", blocked: "approved, but GitHub is blocking the merge", merged: "merged, not live", live: "live and checked", sent: "sent", failed: "failed", waiting: "stopped, waiting", paused: "stopped with work left, nothing waiting"};
const ENDED = new Set(["done", "live", "sent", "failed"]);

const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
function loadJobs() { const d = readState(FILE, (v) => v && typeof v === "object" && Array.isArray(v.jobs)); return d ? d.jobs.filter((j) => j && j.key) : []; }
// a card that left Home, or a task that left the Workdesk, a day ago is dropped, so neither pushes PRs and runs out of the record
const passing = (j, now) => (String(j.key).startsWith("you:") || j.kind === "task") && ENDED.has(j.state) && now - j.changed > DAY;
// An open goal (goals.mjs) is always kept: 300 newer rows of runs and cards mustn't push out what
// the user asked for while it's still owed.
const owed = (j) => j.kind === "goal" && !ENDED.has(j.state);
function saveJobs(jobs, now = Date.now()) {
  try { const keep = jobs.filter((j) => !passing(j, now)), goals = keep.filter(owed); writeJsonAtomic(FILE, { jobs: [...keep.filter((j) => !owed(j)).slice(-Math.max(50, MAX_KEEP - goals.length)), ...goals] }, { indent: 1, mode: 0o600 }); return true; } catch { return false; }
}
// A new state, the old one kept in its history with when it began.
function shift(j, state, now) { if (state === j.state) return; j.history = [...(j.history || []), { state: j.state, at: j.changed }].slice(-8); j.state = state; j.changed = now; }

// A folder's older run records left waiting or paused are over once a later run there finishes: it
// worked from the same TASKS.md, and its end is the folder's state now (runRecord reads only the
// newest). Left as they were, the goal over them (goals.mjs) asked the user for a step the later run
// had done: "Can I redeploy the server now…" five times on 26 Oct 2026, with three paused records
// beside it that would have held the goal open for good.
const FINISHED = new Set(["done", "review"]);
function supersede(jobs, j, now) {
  for (const x of jobs) if (x !== j && x.outcome && String(x.key).startsWith("run:") && x.path === j.path && (x.at || 0) < (j.at || 0) && (x.state === "waiting" || x.state === "paused")) { shift(x, "done", now); x.waitingOn = ""; x.note = `superseded: ${j.key}, a later run here, finished`; }
}

// Record a job's state: one row per key, its first words kept, every change dated.
// patch: { state, waitingOn?, text?, lane?, path?, kind?, pr?, note? }. Never throws: a job that can't
// be recorded must not stop the run or the merge it describes.
function track(key, patch = {}, { now = Date.now() } = {}) {
  try {
    key = String(key || ""); if (!key) return null;
    const state = STATES.includes(patch.state) ? patch.state : null;
    const jobs = loadJobs(); let j = jobs.find((x) => x.key === key);
    if (!j) { if (!state) return null; j = { key, kind: patch.kind || "", lane: "", text: "", state, waitingOn: "", at: now, changed: now, history: [] }; jobs.push(j); }
    if (patch.kind) j.kind = patch.kind;
    if (patch.lane) j.lane = clip(patch.lane, 60);
    if (patch.text && !j.text) j.text = clip(patch.text, 140);
    if (patch.pr) j.pr = String(patch.pr);
    if (patch.path) j.path = String(patch.path);
    if (patch.note !== undefined) j.note = clip(patch.note, 200);
    if (patch.what !== undefined) j.what = clip(patch.what, 200);
    if (patch.summary !== undefined) j.summary = clip(patch.summary, 400);
    // a waiting run's job, and whether its [~] item said what it waits on (bare: it didn't): goals.mjs
    // words the card from them. Each run's end sets them afresh, so an older run's don't linger.
    if (patch.outcome || patch.task !== undefined) { if (patch.task) j.task = clip(patch.task, 140); else delete j.task; }
    if (patch.outcome || patch.bare !== undefined) { if (patch.bare) j.bare = true; else delete j.bare; }
    if (patch.outcome) j.outcome = true; // written by a run's end (agents.mjs runOutcome): the screens read this, not their own guess
    if (state) shift(j, state, now);
    if (patch.waitingOn !== undefined) j.waitingOn = WAITING.includes(patch.waitingOn) ? patch.waitingOn : "";
    if (ENDED.has(j.state) && patch.waitingOn === undefined && j.state !== "sent") j.waitingOn = "";
    if (j.state === "sent" && patch.waitingOn === undefined) j.waitingOn = "third party";
    if (patch.outcome && FINISHED.has(j.state) && j.path && key.startsWith("run:")) supersede(jobs, j, now);
    saveJobs(jobs, typeof now === "number" ? now : Date.now()); return j;
  } catch { return null; }
}
// The jobs of a PR, found by the repo and its number: a task's own card carries both.
const prKey = (repo, pr) => `pr:${repo}#${String(pr).replace(/^.*\/pull\//, "").replace(/\D/g, "") || pr}`;

// What's open now, and what ended in the last day, newest first.
function jobsNow({ now = Date.now(), jobs = loadJobs() } = {}) {
  jobs = jobs.filter((j) => !String(j.key).startsWith("you:")); // the cards: onUser
  const open = jobs.filter((j) => !ENDED.has(j.state) || (j.state === "sent" && now - j.changed < 7 * DAY)).sort((a, b) => b.changed - a.changed);
  const ended = jobs.filter((j) => ENDED.has(j.state) && j.state !== "sent" && now - j.changed < DAY).sort((a, b) => b.changed - a.changed);
  return { open, ended };
}
// Jobs parked on someone or something else (a lane, a third party, a time): not running, so
// Home's agents don't show them, and not the user's, so no card. Newest per lane; none for a
// lane whose job is running. Home draws them with who and what they wait on (22 Oct 2026: 100
// texts staged and held for a yes, and Home said only "symbiot working on it").
function parkedJobs({ now = Date.now(), jobs = loadJobs() } = {}) {
  const live = new Set(jobs.filter((j) => j.state === "running" && j.lane).map((j) => j.lane)), seen = new Set(), out = [];
  for (const j of jobs.filter((x) => x.state === "waiting" && ["lane", "third party", "time"].includes(x.waitingOn) && !isCard(x) && x.kind !== "task" && x.kind !== "goal").sort((a, b) => b.changed - a.changed)) {
    const l = j.lane || j.key; if (live.has(j.lane) || seen.has(l)) continue; seen.add(l);
    const what = clip(j.what || j.note, 110), who = j.waitingOn === "lane" ? (clip(String(j.what || "").split(":")[0], 30) || "another lane") : j.waitingOn === "time" ? "a set time" : "someone outside";
    out.push({ id: "job:" + j.key, lane: j.lane || "", text: clip(String(j.text || j.key).replace(/^(Agent:\s*)?(New job:\s*)?/i, ""), 90), who, on: j.waitingOn, why: what, at: j.changed, since: Math.max(0, now - j.changed) });
  }
  return out;
}
const whenOf = (t, now) => { const m = Math.max(0, Math.round((now - t) / 60e3)); return m < 2 ? "just now" : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
function jobLine(j, now = Date.now()) {
  return `${j.lane ? `[${j.lane}] ` : ""}${j.text || j.key}: ${SAYS[j.state] || j.state}${j.waitingOn ? `, waiting on ${j.waitingOn === "user" ? "the user" : j.waitingOn}` : ""}${j.what ? ` (${j.what})` : ""} (since ${whenOf(j.changed, now)})${j.note ? ` — ${j.note}` : ""}`;
}
// For the chat's context: the one record to answer "where are we?" from. The goals the user asked
// for come first (goals.mjs): what they wanted, where it stands, what it waits on; the runs, tasks and
// cards under them after. "Where are we" was asked seven times on 21 Oct 2026 and answered from runs.
function goalLine(g, now = Date.now()) {
  const st = g.state === "done" ? (g.closed && g.closed.kind === "not" ? `not finished: ${g.closed.missing || "see its report"}` : g.closed && g.closed.kind === "dropped" ? "dropped" : "done") : g.waitingOn ? `waiting on ${g.waitingOn === "user" ? "the user" : g.waitingOn}${g.what ? ` (${g.what})` : ""}` : SAYS[g.state] || g.state;
  return `${g.lane ? `[${g.lane}] ` : ""}${g.text}: ${st} (asked ${whenOf(g.at, now)}, last moved ${whenOf(g.moved || g.changed, now)})${g.doneWhen ? `; done when: ${g.doneWhen}` : ""}`;
}
function jobsLines({ now = Date.now(), jobs } = {}) {
  const all = jobs || loadJobs(), gs = all.filter((j) => j.kind === "goal" && (!ENDED.has(j.state) || now - j.changed < 3 * DAY)).sort((a, b) => b.at - a.at);
  const goalHead = gs.length ? ["Goals the user asked for (each owned until it's done; answer 'where are we' from these first):", ...gs.slice(0, 12).map((g) => `- ${goalLine(g, now)}`)] : [];
  const { open, ended } = jobsNow({ now, jobs: all.filter((j) => j.kind !== "goal") });
  const head = "Job record (one row per job, written when its state changed; answer 'where are we / is it merged / is it live / is it running' from this ONLY, and say you have no record of a job that isn't here, never infer one. 'merged' is not 'live'; 'asked' and 'queued' are not 'running'):";
  return [...goalHead, head, ...(open.length ? open.slice(0, 15).map((j) => `- ${jobLine(j, now)}`) : ["- nothing open"]), ...(ended.length ? ["Ended in the last 24h:", ...ended.slice(0, 8).map((j) => `- ${jobLine(j, now)}`)] : [])];
}
// `symbiot status`: the same record, for a terminal.
function jobsText({ now = Date.now(), jobs = loadJobs() } = {}) {
  const { open, ended } = jobsNow({ now, jobs }), you = onUser({ jobs });
  if (!open.length && !ended.length && !you.length) return "No jobs on record yet.";
  return [...(you.length ? [`Only you can do (${you.length}):`, ...you.map((y) => `  ${y.lane ? `[${y.lane}] ` : ""}${y.text}`)] : []), ...(open.length ? ["Open:", ...open.map((j) => "  " + jobLine(j, now))] : ["Nothing open."]), ...(ended.length ? ["Ended in the last 24h:", ...ended.map((j) => "  " + jobLine(j, now))] : [])].join("\n");
}
// Only what's waiting on the user: the one list the ember balls, the "needs you" cards and the phone can read.
const waitingOnUser = ({ jobs = loadJobs() } = {}) => jobs.filter((j) => j.waitingOn === "user" && !ENDED.has(j.state));

// What's on the user is what Home's "Only the user can do" holds, all of it (home.mjs homeState,
// after its filters: answered already, held in the vault, one agent's step asked twice, dismissed).
// Each card is a job ("you:" + its id) waiting on the user; one that left Home is done. The ember
// orbs (workScene), the phone's lists and the chat read this, never their own count of agents'
// questions: on 19 Oct 2026 5 orbs were lit with nothing behind them, and the phone listed
// questions Home had dropped. A job waiting on the user elsewhere (a run for Approve, a PR's deploy
// ask) still is only while its lane has a card here; after GRACE it waits on nobody.
const CARD = "you:", GRACE = 120e3;
const isCard = (j) => String(j.key).startsWith(CARD);
const cardOf = (y) => ({ id: String(y.id || ""), kind: y.kind || "", title: clip(y.title, 90), ...(y.sub ? { sub: clip(y.sub, 160) } : {}), ...(y.fix ? { fix: y.fix } : {}), ...(y.path ? { path: y.path } : {}), ...(y.ok ? { ok: true } : {}), ...(y.q ? { q: clip(y.q, 300) } : {}) });
function syncOnUser(cards = [], { now = Date.now() } = {}) {
  try {
    const jobs = loadJobs(), byKey = new Map(jobs.map((j) => [j.key, j])), on = new Set(), lanes = new Set(), paths = new Set();
    let changed = false;
    const move = (j, state, waitingOn, note) => { shift(j, state, now); j.waitingOn = waitingOn; if (note !== undefined) j.note = note; changed = true; };
    for (const y of cards) {
      if (!y || !y.id) continue;
      const key = CARD + y.id, text = clip(`${y.title || ""}${y.sub ? `: ${y.sub}` : ""}`, 140), card = cardOf(y);
      on.add(key); if (y.repo) lanes.add(y.repo); if (y.path) paths.add(y.path);
      let j = byKey.get(key);
      if (!j) { j = { key, kind: "card", lane: clip(y.repo, 60), text, state: "asked", waitingOn: "user", at: now, changed: now, history: [], card }; jobs.push(j); byKey.set(key, j); changed = true; continue; }
      if (j.state !== "asked" || j.waitingOn !== "user") move(j, "asked", "user", "");
      if (j.text !== text || JSON.stringify(j.card) !== JSON.stringify(card) || j.lane !== clip(y.repo, 60)) { j.text = text; j.card = card; j.lane = clip(y.repo, 60); changed = true; }
    }
    for (const j of jobs) {
      if (isCard(j)) { if (!on.has(j.key) && !ENDED.has(j.state)) move(j, "done", "", "off Home: answered, done or dismissed"); continue; }
      if (j.kind === "task" || j.waitingOn !== "user" || ENDED.has(j.state) || now - j.changed < GRACE) continue; // a task's wait is syncTasks', read off these same cards
      if (j.outcome && j.state === "waiting") continue; // a run's own record of what it waits on moves when that comes (agents.mjs settleRecord), not when a card goes
      if ((j.lane && lanes.has(j.lane)) || (j.path && paths.has(j.path))) continue;
      if (j.state === "review") move(j, "done", "", "no Approve for it on Home any more"); else move(j, j.state, "");
    }
    if (changed) saveJobs(jobs, now);
    return jobs.filter((j) => isCard(j) && on.has(j.key));
  } catch { return []; }
}
// Each open task where the Workdesk has it (home.mjs workScene's waiting list, every tick): on
// it now is running, its turn coming is queued, held on a card of the user's waits on the user,
// blocked is asked with why. A task that left the list is done there (a run, Approve or a send
// takes it from there). Its note is why, as of when its state last changed.
const TASK_STATE = { working: ["running", ""], queued: ["queued", "lane"], beside: ["queued", ""], next: ["queued", ""], peak: ["queued", "time"], asks: ["queued", "user"], step: ["queued", "user"], approve: ["queued", "user"], waiting: ["waiting", ""], elsewhere: ["waiting", "another computer"] }; // waiting: its agent marked it [~], the note says on what
function syncTasks(items = [], { now = Date.now() } = {}) {
  try {
    const jobs = loadJobs(), byKey = new Map(jobs.map((j) => [j.key, j])), on = new Set();
    let changed = false;
    for (const t of items) {
      const id = String(t.id || "").replace(/^task:/, ""); if (!id) continue;
      const key = "task:" + id, [state, waitingOn] = TASK_STATE[t.why && t.why.kind] || ["asked", ""], note = clip(t.why && t.why.text, 200);
      on.add(key);
      let j = byKey.get(key);
      if (!j) { jobs.push({ key, kind: "task", lane: clip(t.repo, 60), text: clip(t.text, 140), state, waitingOn, note, at: now, changed: now, history: [] }); changed = true; continue; }
      if (j.state === state && j.waitingOn === waitingOn) continue;
      shift(j, state, now); j.waitingOn = waitingOn; j.note = note; changed = true;
    }
    for (const j of jobs) if (j.kind === "task" && !on.has(j.key) && ["asked", "queued", "running"].includes(j.state)) { shift(j, "done", now); j.waitingOn = ""; j.note = "left the waiting list: finished, in review, or closed"; changed = true; }
    if (changed) saveJobs(jobs, now);
    return changed;
  } catch { return false; }
}
// The cards on record now: { lane, path, kind, fix, id, ok, text }, the same list Home shows.
const onUser = ({ jobs = loadJobs() } = {}) => jobs.filter((j) => isCard(j) && j.waitingOn === "user" && !ENDED.has(j.state)).map((j) => ({ ...(j.card || {}), lane: j.lane || "", text: j.text }));
// A lane's work went up (deploy.mjs afterShip): its runs that waited for Approve are done, in that PR.
function landed(lane, pr, { now = Date.now() } = {}) {
  try {
    const jobs = loadJobs(); let n = 0;
    for (const j of jobs) if (!isCard(j) && j.lane === lane && j.state === "review") { shift(j, "done", now); j.waitingOn = ""; j.note = `approved, in PR ${String(pr).replace(/^.*\/pull\//, "#")}`; n++; }
    if (n) saveJobs(jobs, now);
    return n;
  } catch { return 0; }
}

// The newest record of an agent run in this folder that its end wrote (runOutcome): what every
// screen and every restart reads, or null for a folder with none yet (a run before 0.68.1).
function runRecord(path, { jobs = loadJobs() } = {}) {
  let best = null; for (const j of jobs) if (j.outcome && String(j.key).startsWith("run:") && j.path === path && (!best || (j.at || 0) >= (best.at || 0))) best = j;
  return best;
}
const recordOf = (id, { jobs = loadJobs() } = {}) => { const j = jobs.find((x) => x.key === "run:" + id); return j && j.outcome ? j : null; };
// ---- goals (goals.mjs): rows "goal:<id>", kind "goal", in this same record ----------------
const goalRows = ({ jobs = loadJobs() } = {}) => jobs.filter((j) => j.kind === "goal" && !j.notGoal); // a row closed as not a goal (goals.mjs tidyGoals) is history only
function putGoal(g, { now = Date.now() } = {}) {
  try { const jobs = loadJobs(), i = jobs.findIndex((j) => j.key === g.key); if (i < 0) jobs.push(g); else jobs[i] = g; return saveJobs(jobs, now); } catch { return false; }
}
export { parkedJobs, goalRows, putGoal, FINISHED, goalLine, saveJobs, shift, ENDED, runRecord, recordOf, track, loadJobs, jobsNow, jobsLines, jobsText, jobLine, waitingOnUser, syncOnUser, syncTasks, onUser, landed, prKey, isCard, STATES, FILE };
