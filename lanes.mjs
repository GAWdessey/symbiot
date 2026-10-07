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
// it starts when it's free), done (reported back) or error (reported back too).
// chain: how many handovers in a row led here; past MAX_CHAIN it stops, so two
// lanes can't hand the same thing back and forth forever.
import { join, basename } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, chmodSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { CONFIG_DIR, loadTasks, clipWords } from "./core.mjs";
import { runHandoff, runningHandoff, waitingFor, agentQuestions } from "./agents.mjs";
import { addTask, pushTasks } from "./tasks.mjs";
import { actNow } from "./mind.mjs";
import { repoPathMap } from "./scan.mjs";
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

// Pick up what a folder's agent handed over and start the lanes it named.
// Each handover is started once (its key: where from, which lane, what).
function dispatch(path, { map = repoPathMap(), act = actNow, run = runHandoff, add = addTask, push = pushTasks, now = Date.now(), ledger = loadLedger() } = {}) {
  const asked = parseHandoffs(readSym(path, "HANDOFF.md")); if (!asked.length) return [];
  const from = { lane: laneOf(path, map), path }, parent = ledger.handoffs.filter((h) => h.to.path === path).pop(), chain = (parent ? parent.chain : 0) + 1;
  const started = [];
  for (const h of asked) {
    const key = createHash("sha1").update(path + "\n" + h.lane.toLowerCase() + "\n" + h.text).digest("hex").slice(0, 16);
    if (ledger.handoffs.some((x) => x.key === key)) continue;
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
        Object.assign(e, { to, task: t.id, status: r.id && !r.busy && !r.blocked ? "started" : "held", ...(r.id ? { job: r.id } : {}) });
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
function lanesTick({ map = repoPathMap(), act = actNow, run = runHandoff, running = runningHandoff, add = addTask, push = pushTasks, tasks, now = Date.now() } = {}) {
  const ledger = loadLedger();
  let acts = []; try { acts = readdirSync(ACT_DIR).filter((d) => d.startsWith("act-")).map((d) => join(ACT_DIR, d)); } catch {}
  const started = [];
  for (const path of [...Object.values(map), ...acts]) if (existsSync(join(path, ".symbiot", "HANDOFF.md"))) started.push(...dispatch(path, { map, act, run, add, push, now, ledger }));
  const t = tasks || loadTasks(), reported = [];
  for (const e of ledger.handoffs) {
    if (e.reportedAt || running(e.from.path)) continue; // the one that asked reads it when it's started again, so not mid-run
    const o = outcome(e, { tasks: t, running }); if (!o) continue;
    if (report(e, o, { run, running, now })) { e.reportedAt = now; if (e.status !== "error") e.status = "done"; e.result = o.text; reported.push(e); }
  }
  if (started.length || reported.length) saveLedger(ledger);
  return { started, reported };
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
    const row = { id: e.id, from: e.from.lane, to: e.to.lane, text: clipWords(firstLine(e.text), 160), ...(e.text.trim() !== firstLine(e.text).trim() || e.text.length > 160 ? { full: e.text } : {}), at: e.at, status: e.status, ...(e.error ? { error: e.error } : {}), ...(e.result ? { result: e.result } : {}), times: 1 };
    byKey.set(k, row); out.push(row);
  }
  return { handoffs: out.slice(0, 30) };
}

export { LEDGER, MAX_CHAIN, loadLedger, laneOf, lastRunStart, dispatch, outcome, report, lanesTick, lanesState, aboutIt, partlyDone };
