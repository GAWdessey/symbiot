// symbiot — Lanes: agents hand work to each other, so it keeps moving without
// you. Each agent has its own lane: a repo, or ops (everything outside one: this
// computer, accounts, services, connectors; a run of its own, mind.mjs actNow).
// When one needs another lane's job done, it writes it to its .symbiot/HANDOFF.md
// (handover.mjs: a "### <lane>" heading, then what's needed). Every 20 seconds
// the app (lanesTick) starts that lane's agent on it: a repo lane gets it as a
// task and a run there, the way Send to repos does; ops gets a run of its own.
// When the agent that took it over is done, what it did goes back to the agent
// that asked, in its .symbiot/ANSWERS.md, and that agent is started again to
// carry on. You only see what no agent can do, as a question in the Agents tab.
//
// The ledger, ~/.config/symbiot/lanes.json: { handoffs: [{ id, key, from: { lane,
// path }, to: { lane, path }, text, at, chain, status, job?, task?, error?,
// result?, reportedAt? }] }. status: started, held (that lane's agent was busy:
// it starts when it's free), blocked (it didn't start, and nothing running there will
// start it: note says why), done (reported back) or error (reported back too).
// chain: how many handovers in a row led here; past MAX_CHAIN it stops, so two
// lanes can't hand the same thing back and forth forever.
import { join, basename, dirname, resolve, relative } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, chmodSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { CONFIG_DIR, loadTasks, clipWords } from "./core.mjs";
import { runHandoff, runningHandoff, waitingFor, agentQuestions, findOrcaCli, installAllowlist, writeTasks } from "./agents.mjs";
import { addTask, removeTask, pushTasks } from "./tasks.mjs";
import { actNow, actBrief } from "./mind.mjs";
import { laneMap } from "./scan.mjs";
import { parseRun, lastRunText, readRunLog } from "./work.mjs";
import { OPS, parseHandoffs } from "./handover.mjs";

const LEDGER = join(CONFIG_DIR, "lanes.json");
const ACT_DIR = join(CONFIG_DIR, "drafts");
const MAX_KEEP = 200, MAX_CHAIN = 4, TAIL = 4000;

function loadLedger() { try { const d = JSON.parse(readFileSync(LEDGER, "utf8")); return { handoffs: Array.isArray(d.handoffs) ? d.handoffs : [] }; } catch { return { handoffs: [] }; } }
// It can name accounts and what's in them: yours only (0600).
function saveLedger(d) { try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(LEDGER, JSON.stringify({ handoffs: d.handoffs.slice(-MAX_KEEP) }, null, 1), { mode: 0o600 }); try { chmodSync(LEDGER, 0o600); } catch {} return true; } catch { return false; } }
const readSym = (path, f) => { if (f === "agent.log") return readRunLog(join(path, ".symbiot", f)); try { return readFileSync(join(path, ".symbiot", f), "utf8"); } catch { return ""; } };
const firstLine = (t) => String(t || "").split("\n").find((l) => l.trim()) || "";

// A folder's lane: the repo it is, or ops for a run of its own.
function laneOf(path, map) {
  if (path.startsWith(ACT_DIR)) return OPS;
  const hit = Object.entries(map).find(([, p]) => p === path);
  return hit ? hit[0] : basename(path);
}
// The lane a handover names, as a folder: a repo (any case), or ops. null if none.
function laneTarget(lane, map) {
  if (lane.toLowerCase() === OPS) return { lane: OPS, path: "" };
  const name = Object.keys(map).find((n) => n.toLowerCase() === lane.toLowerCase());
  return name ? { lane: name, path: map[name] } : null;
}
// Where a handover to a repo stands once its agent was asked to start (runHandoff's
// result): started; held behind a run that's really going there; or blocked, with why.
// self: licenceGate's reason (Symbiot's own code) — unlike parked or a Pro limit, no
// one will ever unblock it by waiting, so outcome() reports it back right away.
const startedAs = (r) => r.id && !r.busy && !r.blocked ? { status: "started", job: r.id } : r.busy ? { status: "held", ...(r.id ? { job: r.id } : {}) } : { status: "blocked", note: String(r.note || "its agent didn't start").slice(0, 200), ...(r.self ? { self: true } : {}) };

// A handover whose text changed while the run doing the earlier version is still
// going (the LinkedIn auto-poster spec reached ops twice, on top of a run already
// building it) supersedes that run rather than starting a second one: the same
// ledger row takes the new text, and the lane's agent gets it once it's free.
// Ops: the new brief waits in that run's folder (writeTasks holds it while it
// runs; it lands and starts there, resuming the same conversation, when it exits),
// with a note in its ANSWERS.md saying what changed. A repo: the earlier task
// gives way to the new one. The earlier row: same asker, same lane, not reported
// back, about the same thing (alike), and its run still going (ops) or its task
// still open (a repo). null when there's none.
function supersedes(h, from, ledger, { running, tasks }) {
  return ledger.handoffs.slice().reverse().find((x) => x.from.path === from.path && x.to.lane.toLowerCase() === h.lane.toLowerCase() && !x.reportedAt && (x.status === "started" || x.status === "held" || x.status === "blocked") && x.text !== h.text && alike(x.text, h.text)
    && (x.to.lane === OPS ? !!x.to.path && !!running(x.to.path) : !!x.task && tasks().some((t) => t.id === x.task && !t.done && !t.archived && !t.review))) || null;
}
function resupply(e, text, { now, title, context }) {
  const p = e.to.path;
  try {
    writeTasks(p, actBrief(text, { title, context, now }));
    const file = join(p, ".symbiot", "ANSWERS.md"), had = existsSync(file) ? readFileSync(file, "utf8") : "# Answers\n";
    writeFileSync(file, `${had.replace(/\s*$/, "")}\n\n### The handover changed while you ran\n${e.from.lane} rewrote what it handed over: TASKS.md has the new version, and it replaces the one you started on. Carry on from what you've done, to the new version.\n_symbiot (handover) ${new Date(now).toISOString().slice(0, 10)}_\n`);
    return { ok: true };
  } catch (err) { return { error: "Couldn't hand the new version to the run already going: " + ((err && err.message) || err) }; }
}

// Pick up what a folder's agent handed over and start the lanes it named.
// Each handover is started once (its key: where from, which lane, what).
function dispatch(path, { map = laneMap(), act = actNow, run = runHandoff, add = addTask, push = pushTasks, drop = removeTask, running = runningHandoff, refresh = resupply, tasks = loadTasks, now = Date.now(), ledger = loadLedger() } = {}) {
  const asked = parseHandoffs(readSym(path, "HANDOFF.md")); if (!asked.length) return [];
  const from = { lane: laneOf(path, map), path }, parent = ledger.handoffs.filter((h) => h.to.path === path).pop(), chain = (parent ? parent.chain : 0) + 1;
  const started = [];
  for (const h of asked) {
    const key = createHash("sha1").update(path + "\n" + h.lane.toLowerCase() + "\n" + h.text).digest("hex").slice(0, 16);
    if (ledger.handoffs.some((x) => x.key === key || (x.was || []).includes(key))) continue;
    const prior = supersedes(h, from, ledger, { running, tasks });
    if (prior) {
      const was = [...(prior.was || []), prior.key];
      if (prior.to.lane === OPS) {
        const r = refresh(prior, h.text, { now, title: `handed over by ${from.lane}`, context: `${from.lane}'s agent (in ${path}) handed this over, and carries on once it's done.` });
        if (r.error) { Object.assign(prior, { status: "error", error: r.error, text: h.text, key, was }); started.push(prior); continue; }
        Object.assign(prior, { text: h.text, key, was, at: now, superseded: (prior.superseded || 0) + 1 });
      } else {
        drop(prior.task);
        const t = add(h.text, prior.to.lane, { after: `(handed over by ${from.lane})` });
        if (t.error) { Object.assign(prior, { status: "error", error: t.error, text: h.text, key, was }); started.push(prior); continue; }
        push({ repo: prior.to.lane });
        const r = run(prior.to.path) || {};
        Object.assign(prior, { text: h.text, key, was, at: now, task: t.id, superseded: (prior.superseded || 0) + 1, ...startedAs(r) });
      }
      started.push(prior); continue;
    }
    const e = { id: randomBytes(4).toString("hex"), key, from, to: { lane: h.lane, path: "" }, text: h.text, at: now, chain, status: "started" };
    const to = laneTarget(h.lane, map);
    if (chain > MAX_CHAIN) Object.assign(e, { status: "error", error: `${MAX_CHAIN} handovers in a row led here, so this one wasn't started. Do it yourself, or ask the user.` });
    else if (!to) Object.assign(e, { status: "error", error: `There's no lane called ${h.lane}. Lanes: ops, or a repo: ${Object.keys(map).slice(0, 30).join(", ")}.` });
    else if (to.lane.toLowerCase() === from.lane.toLowerCase()) Object.assign(e, { status: "error", error: `${to.lane} is your own lane: do it yourself.` });
    else if (to.lane === OPS) {
      const r = act(h.text, { title: `handed over by ${from.lane}`, context: `${from.lane}'s agent (in ${path}) handed this over, and carries on once it's done.`, now });
      if (r.error) Object.assign(e, { status: "error", error: r.error });
      else Object.assign(e, { to: { lane: OPS, path: r.dir }, job: r.job });
    } else {
      const t = add(h.text, to.lane, { after: `(handed over by ${from.lane})` }); // whole: a long one links to the rest
      if (t.error) Object.assign(e, { status: "error", error: t.error });
      else {
        push({ repo: to.lane });
        const r = run(to.path) || {};
        Object.assign(e, { to, task: t.id, ...startedAs(r) });
      }
    }
    ledger.handoffs.push(e); started.push(e);
  }
  return started;
}

// What an agent said last: its log after the newest run's header.
function lastWords(path) {
  const log = readSym(path, "agent.log"), at = log.lastIndexOf("\n=== "); if (at < 0) return "";
  const w = parseRun(lastRunText(log)); // a streaming run: its final answer, not its JSON
  const run = w.stream ? (w.final || w.said.join("\n")) : log.slice(at).split("\n").slice(3).join("\n").trim(); // past the header and the command
  return run.length > TAIL ? "…" + run.slice(-TAIL).replace(/^\S*\s+/, "") : run; // from a word on, not mid-word
}
// When the newest run in a folder started (its log header), or 0.
function lastRunStart(path) { const log = readSym(path, "agent.log"), m = [...log.matchAll(/^=== .* (\d{4}-\d\d-\d\dT[\d:.]+Z) ===$/gm)].pop(); return m ? Date.parse(m[1]) || 0 : 0; }
const openQuestions = (path) => /^###\s+/m.test(readSym(path, "QUESTIONS.md").split(/^##\s+Suggestions/m)[0]);
// A repo lane's run does a whole brief, so its last words cover every task in it,
// not just the one handed over (ops heard about a first-run audit and a posting
// test, three times, in reply to its four gaps). Only the lines about this one
// go back: those sharing most of its words. "" when it said nothing about it.
const COMMON = new Set(["with", "that", "this", "from", "have", "will", "your", "them", "then", "what", "when", "into", "about", "there", "their", "which", "would", "could", "should", "while", "please"]);
const keyWords = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !COMMON.has(w)).map((w) => w.replace(/s$/, "")));
function aboutIt(words, text) {
  const want = keyWords(firstLine(text)); if (want.size < 2) return words;
  const hits = String(words || "").split(/\n+/).filter((l) => { const has = keyWords(l); let n = 0; for (const w of want) if (has.has(w)) n++; return n >= 2 && n / want.size >= 0.25; });
  return hits.join("\n").trim();
}

// Is it done? Ops: its run ended (ticked or not). A repo: the task it was given
// is ticked or its run ended, and no agent is working there. Waiting on the
// user's answer to a question there isn't done: that's in the Agents tab.
function outcome(e, { tasks = loadTasks(), running = runningHandoff } = {}) {
  if (e.status === "error") return { text: `Couldn't hand it over: ${e.error}` };
  // Symbiot's own code: no agent will ever start there to clear this, so say so now
  // rather than waiting forever (a parked lane or a Pro limit can still clear on its
  // own, so only this, self-marked reason short-circuits the wait below).
  if (e.status === "blocked" && e.self) return { text: `${e.note} It's on ${e.to.lane}'s own task list now, on the Workdesk for the user to pick up — no agent will start it, so don't hand this over again.` };
  const p = e.to.path; if (!p || running(p)) return null;
  if (lastRunStart(p) < e.at) return null; // its run hasn't started yet (held while that lane was busy)
  if (openQuestions(p) && !/^- \[x\]/im.test(readSym(p, "TASKS.md"))) return null; // waiting on the user, in that lane
  const words = lastWords(p);
  if (e.to.lane === OPS) {
    const ticked = /^- \[x\]/im.test(readSym(p, "TASKS.md"));
    return { text: `${ticked ? "Done" : "It stopped without finishing"} (the ops agent).${words ? `\n\nWhat it said:\n${words}` : ""}` };
  }
  const t = tasks.find((x) => x.id === e.task);
  const done = t && (t.review || t.done || t.archived), about = aboutIt(words, e.text);
  return { text: `${done ? `Done in ${e.to.lane}: the task is ticked, and its changes wait for the user's review in Symbiot` : `${e.to.lane}'s agent stopped without ticking it`}.${about ? `\n\nWhat it said about this:\n${about}` : words ? `\n\nIts last message was about other work in ${e.to.lane}, not this.` : ""}` };
}
// A run that stopped partway: questions to the user still open, or work it
// handed to another lane that hasn't come back (the ledger, or HANDOFF.md not
// picked up yet). The review card says what it waits on, rather than calling its
// changes "uncommitted, with no ticked task". null when it waits on nothing.
function partlyDone(path, { ledger = loadLedger() } = {}) {
  if (!path) return null;
  let questions = 0; try { questions = agentQuestions(path, "").questions.length; } catch {}
  const mine = ledger.handoffs.filter((h) => h.from.path === path);
  const handed = mine.filter((h) => !h.reportedAt && h.status !== "error").map((h) => ({ lane: h.to.lane, text: clipWords(firstLine(h.text), 90) }));
  for (const h of parseHandoffs(readSym(path, "HANDOFF.md"))) if (!mine.some((x) => x.to.lane.toLowerCase() === h.lane.toLowerCase() && x.text === h.text)) handed.push({ lane: h.lane, text: clipWords(firstLine(h.text), 90) });
  return questions || handed.length ? { questions, handed: handed.slice(0, 3) } : null;
}
// Tell the agent that asked: the result as an answer in its ANSWERS.md, then
// start it again to carry on (unless it's still running: it reads it next time).
// Not past a step of the user's it waits on (a key for .env, "don't start another
// run until it's in"): that run starts by itself once the step's done.
function report(e, o, { run = runHandoff, running = runningHandoff, waiting = waitingFor, now = Date.now() } = {}) {
  const p = e.from.path, file = join(p, ".symbiot", "ANSWERS.md");
  try {
    mkdirSync(join(p, ".symbiot"), { recursive: true });
    const had = existsSync(file) ? readFileSync(file, "utf8") : "# Answers\nAnswers to your questions, and what other lanes did with what you handed over, newest last.\n";
    writeFileSync(file, `${had.replace(/\s*$/, "")}\n\n### Handed over to ${e.to.lane}: ${clipWords(firstLine(e.text), 120)}\n${o.text}\n_answered by symbiot (handover) ${new Date(now).toISOString().slice(0, 10)}_\n`);
  } catch { return false; }
  if (!running(p)) run(p, { force: !waiting(p) });
  return true;
}

// One pass: start what's been handed over, from every lane, then report back
// what's done. The app runs it every 20 seconds.
function lanesTick({ map = laneMap(), act = actNow, run = runHandoff, running = runningHandoff, add = addTask, push = pushTasks, tasks, now = Date.now(), relink = orcaRelink } = {}) {
  const ledger = loadLedger();
  let acts = []; try { acts = readdirSync(ACT_DIR).filter((d) => d.startsWith("act-")).map((d) => join(ACT_DIR, d)); } catch {}
  const started = [];
  for (const path of [...Object.values(map), ...acts]) if (existsSync(join(path, ".symbiot", "HANDOFF.md"))) started.push(...dispatch(path, { map, act, run, add, push, running, now, ledger, ...(tasks ? { tasks: () => tasks } : {}) }));
  const t = tasks || loadTasks(), reported = [];
  for (const e of ledger.handoffs) {
    // a superseded ops run that ended where nothing started its new brief (another process ran it): start it here
    if (e.superseded && !e.reportedAt && e.status !== "error" && e.to.lane === OPS && e.to.path && !running(e.to.path) && lastRunStart(e.to.path) < e.at) { const r = run(e.to.path, { force: true }) || {}; if (r.id && !r.busy) e.job = r.id; }
    if (e.reportedAt || running(e.from.path)) continue; // the one that asked reads it when it's started again, so not mid-run
    const o = outcome(e, { tasks: t, running }); if (!o) continue;
    if (report(e, o, { run, running, now })) { e.reportedAt = now; if (e.status !== "error") e.status = "done"; e.result = o.text; reported.push(e); }
  }
  if (started.length || reported.length) saveLedger(ledger);
  if (reported.length) relink({ map }).catch(() => {}); // a handover may have renamed a lane's folder
  return { started, reported };
}

// ---- a handover that couldn't start: yours to unblock, on Home ---------------------
// A handover that errored (an ops run limited to its folder handed "needs a run that
// can edit ~/Company" to ops, its own lane; a lane that doesn't exist; too long a
// chain) went back to the agent that asked, and stopped there: Home said nothing
// needed you. Now it's a question on Home (homeState) for STUCK_FOR, until you
// answer it or something like it goes through another way. Allow starts it as a
// run of its own, allowed to read, edit and move files in the folders it names
// (that run only: its .claude/settings.local.json), and its result goes back to the
// agent that asked, as any handover's does; Skip lets it go.
const STUCK_FOR = 3 * 86400000;
const tilde = (p) => { const h = homedir(); return p === h ? "~" : p.startsWith(h + "/") ? "~" + p.slice(h.length) : p; };
// Two handovers about the same thing: most of the shorter one's words in the other.
function alike(a, b) {
  const x = keyWords(a), y = keyWords(b), [s, l] = x.size <= y.size ? [x, y] : [y, x]; if (s.size < 3) return false;
  let n = 0; for (const w of s) if (l.has(w)) n++;
  return n / s.size >= 0.5;
}
// The folders a handover names that a run would need: ones on this computer, not
// the asking run's own, not Symbiot's, not your home itself or a hidden one in it
// (~/.ssh). A file named in one counts as the folder it's in. Outermost only, 3 at most.
function namedDirs(text, own = "", { exists = (p) => { try { return statSync(p); } catch { return null; } } } = {}) {
  const home = homedir(), out = [];
  const roots = ["~", "/home", "/Users", "/srv", "/opt", "/mnt", "/media", home].map((r) => r.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|");
  for (const m of String(text || "").matchAll(new RegExp(`(?:^|[\\s\`'"(])((?:${roots})\\/[^\\s\`'",;)]+)`, "g"))) {
    let p = resolve(m[1].replace(/^~(?=\/)/, home).replace(/[.:]+$/, "")); const st = exists(p); if (!st) continue;
    if (!st.isDirectory()) p = dirname(p);
    const rel = relative(home, p);
    if (p === home || p === "/" || (!rel.startsWith("..") && rel.split("/")[0].startsWith(".")) || p.startsWith(CONFIG_DIR) || (own && (p === own || p.startsWith(own + "/")))) continue;
    out.push(p);
  }
  return [...new Set(out)].filter((p, i, all) => !all.some((q) => q !== p && p.startsWith(q + "/"))).slice(0, 3);
}
// It went through since another way: the same thing handed over again (or done,
// after it), or the run that asked has run again and ticked all it had.
function pastIt(e, hs) {
  if (hs.some((x) => x !== e && x.status !== "error" && Math.max(x.at || 0, x.reportedAt || 0) > e.at && alike(x.text, e.text))) return true;
  const md = readSym(e.from.path, "TASKS.md");
  return lastRunStart(e.from.path) > e.at && /^- \[x\]/im.test(md) && !/^\s*- \[ \]/m.test(md);
}
// The errored handovers that still wait on you, newest first:
// [{ id, from, text, error, at, dirs, q, options }].
function stuckHandovers({ ledger = loadLedger(), now = Date.now(), dirsOf = namedDirs, within = STUCK_FOR } = {}) {
  const hs = ledger.handoffs, out = [];
  hs.forEach((e) => {
    if (e.status !== "error" || e.skipped || now - (e.at || 0) > within) return;
    if (pastIt(e, hs)) return;
    const dirs = dirsOf(e.text, e.from.path);
    out.unshift({ id: e.id, from: e.from, text: e.text, error: e.error || "", at: e.at, dirs,
      q: dirs.length ? `Allow this run access to ${dirs.map(tilde).join(" and ")}?` : `${e.from.lane}'s handover didn't start (${String(e.error || "").replace(/[.:]\s.*$|\.$/, "")}). Start it as a run of its own?`,
      options: [dirs.length ? "Allow (recommended)" : "Start it (recommended)", "Skip"] });
  });
  return out;
}
// The rules a run gets for the folders you allowed it: read, edit and move files
// there (git mv too), nothing wide.
const dirRules = (dirs) => dirs.flatMap((d) => [`Read(/${d}/**)`, `Edit(/${d}/**)`, `Write(/${d}/**)`]).concat(dirs.length ? ["Bash(mv:*)", "Bash(git mv:*)", "Bash(mkdir:*)", "Bash(ls:*)", "Bash(find:*)"] : []);
function grantDirs(dir, dirs) {
  if (!dirs.length) return null;
  try { writeFileSync(join(dir, ".symbiot", "allowlist.proposed.json"), JSON.stringify({ permissions: { allow: dirRules(dirs), additionalDirectories: dirs } }, null, 2) + "\n"); } catch { return null; }
  return installAllowlist(dir);
}
// Allow (or Start it): a run of its own on what was handed over, with what you
// said added, allowed into the folders it names. The ledger's entry becomes that
// handover, started, so its result goes back to the agent that asked. { ok, job, dirs } or { error }.
function allowHandover(id, { note = "", act = actNow, run = runHandoff, now = Date.now(), dirsOf = namedDirs } = {}) {
  const ledger = loadLedger(), e = ledger.handoffs.find((x) => x.id === id);
  if (!e || e.status !== "error" || e.skipped) return { error: "That handover isn't waiting on you any more." };
  const dirs = dirsOf(e.text, e.from.path), said = String(note || "").trim().slice(0, 2000);
  const r = act(e.text + (said ? `\n\nThe user said: ${said}` : ""), { now, title: `handed over by ${e.from.lane}`,
    context: `${e.from.lane}'s agent (in ${e.from.path}) handed this over, and carries on once it's done.${dirs.length ? ` The user allowed this run to read, edit and move files in ${dirs.join(", ")}.` : ""}`,
    run: (dir, o) => { grantDirs(dir, dirs); return run(dir, o); } });
  if (!r || r.error) return { error: (r && r.error) || "The run didn't start." };
  Object.assign(e, { status: "started", to: { lane: OPS, path: r.dir }, job: r.job, at: now, allowedAt: now });
  delete e.error; delete e.reportedAt; delete e.result;
  saveLedger(ledger);
  return { ok: true, job: r.job, dirs };
}
// Skip: it stops asking, and the agent that handed it over reads that you skipped it.
function skipHandover(id, { now = Date.now() } = {}) {
  const ledger = loadLedger(), e = ledger.handoffs.find((x) => x.id === id);
  if (!e || e.status !== "error") return { error: "That handover isn't waiting on you any more." };
  e.skipped = now; saveLedger(ledger);
  const file = join(e.from.path, ".symbiot", "ANSWERS.md");
  try { if (existsSync(join(e.from.path, ".symbiot"))) writeFileSync(file, `${(existsSync(file) ? readFileSync(file, "utf8") : "# Answers\n").replace(/\s*$/, "")}\n\n### Handed over to ${e.to.lane}: ${clipWords(firstLine(e.text), 120)}\nThe user skipped it: don't hand it over again.\n_answered ${new Date(now).toISOString().slice(0, 10)}_\n`); } catch {}
  return { ok: true };
}

// ---- Orca, kept pointing at the lanes ---------------------------------------------
// A handover can rename a lane's folder (CallForge AI → dailify), and the run that
// did it can't tell Orca (its CLI is outside what a run may do), so Orca keeps a
// path that's gone. After a handover comes back, and when the app starts, each repo
// Orca has at a path that's gone is added again where it is now: the scanned repo
// with the GitHub remote Orca kept for it, else the one with its name. Orca's CLI
// can't drop the old entry: it shows as missing there until you remove it.
const remoteKey = (url) => String(url || "").trim().replace(/^[a-z+]+:\/\//i, "").replace(/^[^@/]+@/, "").replace(/:(?!\d)/, "/").replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase();
const gitRemote = (path) => new Promise((res) => execFile("git", ["-C", path, "remote", "get-url", "origin"], { timeout: 5000, encoding: "utf8" }, (e, out) => res(e ? "" : out)));
const runOrca = (cli, args) => new Promise((res) => execFile(cli, args, { timeout: 20000, encoding: "utf8" }, (e, out) => res(e ? "" : out)));
// Orca's repos ({ path, displayName, gitRemoteIdentity }) whose folder is gone, each
// with where it is now: [{ from, to, name }]. Only a single match moves it.
async function orcaMoves(repos, map, { remoteOf = gitRemote, exists = existsSync } = {}) {
  const known = new Set(repos.map((r) => r.path)), free = Object.values(map).filter((p) => !known.has(p) && exists(p)), remotes = new Map();
  const remote = async (p) => { if (!remotes.has(p)) remotes.set(p, remoteKey(await remoteOf(p))); return remotes.get(p); };
  const moves = [];
  for (const r of repos) {
    if (!r.path || exists(r.path)) continue;
    const key = remoteKey((r.gitRemoteIdentity || {}).canonicalKey), hit = [];
    if (key) for (const p of free) if ((await remote(p)) === key) hit.push(p);
    if (!hit.length) { const names = [r.displayName, basename(r.path)].filter(Boolean).map((s) => s.toLowerCase()); hit.push(...free.filter((p) => names.includes(basename(p).toLowerCase()))); }
    if (hit.length === 1 && !moves.some((m) => m.to === hit[0])) moves.push({ from: r.path, to: hit[0], name: r.displayName || basename(hit[0]) });
  }
  return moves;
}
// Add each moved repo again in Orca, where it is now. Nothing when Orca isn't
// installed or isn't running (its CLI can't reach it), and never from a sandbox
// (symbiot app --fresh): that Orca is your real one. { moves: [{ from, to, name, ok }] }
async function orcaRelink({ map, cli, orca = runOrca, remoteOf } = {}) {
  if (process.env.SYMBIOT_SANDBOX) return { moves: [] };
  cli = cli ?? findOrcaCli(); if (!cli) return { moves: [] };
  let repos = []; try { repos = JSON.parse(await orca(cli, ["repo", "list", "--json"])).result.repos || []; } catch { return { moves: [] }; }
  const moves = await orcaMoves(repos, map || laneMap(), { remoteOf });
  for (const m of moves) m.ok = /"ok":\s*true/.test(await orca(cli, ["repo", "add", "--path", m.to, "--json"]));
  return { moves };
}
// The Agents tab's list: newest first. Each shows its first line; full, all of a
// longer one, and result, all of what came back, open under it. What reads the
// same (one lane to the same lane, the same first line: a run that handed it
// over twice) is one row, the newest, with how many times (times).
function lanesState() {
  const out = [], byKey = new Map();
  for (const e of loadLedger().handoffs.slice().reverse()) {
    const k = [e.from.lane, e.to.lane, firstLine(e.text).replace(/\s+/g, " ").trim()].join("\n").toLowerCase();
    if (byKey.has(k)) { byKey.get(k).times++; continue; }
    const row = { id: e.id, from: e.from.lane, to: e.to.lane, text: clipWords(firstLine(e.text), 160), ...(e.text.trim() !== firstLine(e.text).trim() || e.text.length > 160 ? { full: e.text } : {}), at: e.at, status: (e.status === "held" || e.status === "blocked") && e.to.path && lastRunStart(e.to.path) >= e.at ? "started" : e.status, ...(e.status === "blocked" && e.note ? { note: e.note } : {}), ...(e.error ? { error: e.error } : {}), ...(e.result ? { result: e.result } : {}), times: 1 };
    byKey.set(k, row); out.push(row);
  }
  return { handoffs: out.slice(0, 30) };
}

export { LEDGER, MAX_CHAIN, loadLedger, laneOf, lastRunStart, dispatch, outcome, report, lanesTick, lanesState, aboutIt, partlyDone, remoteKey, orcaMoves, orcaRelink, stuckHandovers, allowHandover, skipHandover, namedDirs, alike };
