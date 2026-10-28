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
// chain: how many handovers in a row led here; past MAX_CHAIN no agent is started on
// it, so two lanes can't hand the same thing back and forth forever. To a repo it's
// still added to that lane's tasks (blocked), for its next run: dropped, ops's
// User-Agent fix for symbiot was only found in lanes.json (2026-10-12).
import { join, basename, dirname, resolve, relative } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, utimesSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { CONFIG_DIR, loadTasks, clipWords, loadConfig, readState, writeJsonAtomic, sameTask } from "./core.mjs";
import { runRecord } from "./jobs.mjs";
import { runHandoff, runningHandoff, waitingFor, runOpen, autoStart, settleRecord, agentQuestions, findOrcaCli, installAllowlist, writeTasks, workOf, loadRuns, allAnswers } from "./agents.mjs";
import { addTask, removeTask, pushTasks, pendingReview, approveChanges, workingDiff, setHandedLookup } from "./tasks.mjs";
import { actNow, actBrief } from "./mind.mjs";
import { laneMap, nearLane } from "./scan.mjs";
import { parseRun, lastRunText, readRunLog, runStarted } from "./work.mjs";
import { OPS, parseHandoffs } from "./handover.mjs";
import { laneReach, unreachable, serverOnly } from "./reach.mjs";

const LEDGER = join(CONFIG_DIR, "lanes.json");
const ACT_DIR = join(CONFIG_DIR, "drafts");
const MAX_KEEP = 200, MAX_CHAIN = 4, TAIL = 4000;

function loadLedger() { try { const d = readState(LEDGER); return { handoffs: Array.isArray(d.handoffs) ? d.handoffs : [] }; } catch { return { handoffs: [] }; } }
// It can name accounts and what's in them: yours only (0600).
function saveLedger(d) { try { writeJsonAtomic(LEDGER, { handoffs: d.handoffs.slice(-MAX_KEEP) }, { indent: 1, mode: 0o600 }); return true; } catch { return false; } }
const readSym = (path, f) => { if (f === "agent.log") return readRunLog(join(path, ".symbiot", f)); try { return readFileSync(join(path, ".symbiot", f), "utf8"); } catch { return ""; } };
const firstLine = (t) => String(t || "").split("\n").find((l) => l.trim()) || "";

// A folder's lane: the repo it is, or ops for a run of its own.
function laneOf(path, map) {
  if (path.startsWith(ACT_DIR)) return OPS;
  const hit = Object.entries(map).find(([, p]) => p === path);
  return hit ? hit[0] : basename(path);
}
// The project an agent folder's work is for, from the record, never from its words (review of 20
// Oct 2026, Q4: "why are these under bookly?", "for what project is it?"): a lane's own folder is
// that lane; an ops run, the lane chat started it for (handoff.json "for", mind.mjs actNow) or the
// lane that handed it over (lanes.json), back through ops runs that handed it on. "" when nothing
// says: the card says "no project".
function projectOf(path, { map = laneMap(), ledger = loadLedger() } = {}) {
  let p = String(path || "");
  for (let hop = 0; p && hop < 4; hop++) {
    if (!p.startsWith(ACT_DIR)) { const hit = Object.entries(map || {}).find(([, q]) => q === p); return hit ? hit[0] : ""; }
    let f = ""; try { f = String(JSON.parse(readFileSync(join(p, ".symbiot", "handoff.json"), "utf8")).for || ""); } catch {}
    if (f) return f;
    const row = (ledger.handoffs || []).slice().reverse().find((x) => x.to && x.to.path === p && x.from);
    if (!row) return "";
    if (row.from.lane !== OPS && !String(row.from.path || "").startsWith(ACT_DIR)) return row.from.lane || "";
    p = String(row.from.path || "");
  }
  return "";
}
// The lane a handover names, as a folder: a repo (any case), or ops. A name that's nearly a
// lane's (a typo, a word more or less: "symbio", "robin lane", "Quartz-app") is that lane
// (nearLane), when only one fits. null when none does: dispatch sends it to ops, told the name,
// rather than erroring (one errored and sat for 8 days, 16 Oct 2026).
function laneTarget(lane, map) {
  if (lane.toLowerCase() === OPS) return { lane: OPS, path: "" };
  const name = Object.keys(map).find((n) => n.toLowerCase() === lane.toLowerCase()) || nearLane(lane, Object.keys(map));
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
// still open (a repo). null when there's none, or when the handover says it's a
// new job: bookly's "New job, not a replacement: restart Wren…" (12 Oct 2026) was
// alike enough to queue behind a 40-minute run on the earlier one.
const NOT_A_REWRITE = /\b(new|separate|another|different) (job|task|handover)\b|\bnot an? (replacement|rewrite|new version)\b|\bdoesn't replace\b/i;
function supersedes(h, from, ledger, { running, tasks }) {
  if (NOT_A_REWRITE.test(firstLine(h.text))) return null;
  return ledger.handoffs.slice().reverse().find((x) => x.from.path === from.path && x.to.lane.toLowerCase() === h.lane.toLowerCase() && !x.reportedAt && (x.status === "started" || x.status === "held" || x.status === "blocked") && x.text !== h.text && alike(x.text, h.text)
    && (x.to.lane === OPS ? !!x.to.path && !!runOpen(x.to.path, { running }) : !!x.task && tasks().some((t) => t.id === x.task && !t.done && !t.archived && !t.review))) || null;
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

// Two ops runs worked bookly.co.za's move at once (12 Oct 2026): a brief, then
// "resume the blocked jobs", then "an addition to the 12:51 brief", then job 6,
// each a run of its own, since their words were too different to count as one
// handover rewritten (alike). They took turns texting the user sign-in PINs,
// overwrote each other's sections of one audit file, and one credited the user
// with a nameserver switch the other had made. So: a handover to ops that names
// a run that's still on its job (its folder, act-…, which HANDOFF.md's Sent list gives),
// running or waiting (runOpen), is an addition to that run, never a second one. It waits in that
// run's folder and lands when the run ends (at once, for one that waits), resuming the same
// conversation (the way a rewritten one does), with a note in its ANSWERS.md. One that names
// none and isn't about the same job (relatedTo) starts a run of its own, whose brief lists the
// ops runs already going (opsGoing).
const runName = (p) => basename(p || ""), HELD = "TASKS.next.md"; // agents.mjs writeTasks's held brief
// …and a handover that names a run of the same asker that has ended goes back into that run's folder
// too, not a new one: "Add to run act-c10094d4 (do not start a second copy)" opened act-0f535f70, and
// "Add to run act-0f535f70" opened act-f3aa65f5, a chain of three folders on one job (22 Oct 2026).
// ended: true on such a row; the caller starts its run there.
function addsTo(h, from, ledger, { running, open = (p) => runOpen(p, { running }), exists = existsSync }) {
  if (h.lane.toLowerCase() !== OPS) return null;
  const names = new Set(String(h.text).match(/\bact-[0-9a-f]+\b/g) || []); if (!names.size) return null;
  const named = (x) => x.to.lane === OPS && x.from.path === from.path && /^act-[0-9a-f]+$/.test(runName(x.to.path)) && names.has(runName(x.to.path));
  const live = ledger.handoffs.slice().reverse().find((x) => named(x) && !x.reportedAt && (x.status === "started" || x.status === "held") && !!open(x.to.path));
  if (live) return live;
  const back = ledger.handoffs.slice().reverse().find((x) => named(x) && x.to.path && exists(x.to.path)); // already reported back: still its folder, never a second one beside it
  if (back) return Object.assign(back, { ended: !running(back.to.path) });
  // a run another lane handed over, or one started from Home or a chat: it's still that run's, under a row of the asker's own (dispatch)
  const p = [...names].map((n) => join(ACT_DIR, n)).find((d) => !ledger.handoffs.some((x) => x.to.path === d && x.from.path === from.path) && !!open(d));
  return p ? { fresh: true, to: { lane: OPS, path: p } } : null;
}
// A handover to ops that names no run, about the job one of the asker's ops runs is still on (fewer of
// its words in common than a rewrite, supersedes): an addition to that run. "Re-run the phone code check
// on the user's Galaxy A26" started a run of its own beside the one waiting on that check (21 Oct 2026).
// A job of its own says so ("New job:", NOT_A_REWRITE), and starts one.
function relatedTo(h, from, ledger, { running, open = (p) => runOpen(p, { running }) }) {
  if (h.lane.toLowerCase() !== OPS || NOT_A_REWRITE.test(firstLine(h.text))) return null;
  return ledger.handoffs.slice().reverse().find((x) => x.to.lane === OPS && x.from.path === from.path && !x.reportedAt && (x.status === "started" || x.status === "held")
    && !!x.to.path && x.text !== h.text && alike(x.text, h.text, 0.4) && !!open(x.to.path)) || null;
}
// What a brief already waiting in that folder asks (actBrief quotes it), so a second
// addition before the run ends joins the first rather than replacing it.
function heldRequest(md) {
  const lines = String(md || "").split("\n"), at = lines.findIndex((l) => /^The user asked Symbiot for this:/.test(l)); if (at < 0) return "";
  const out = []; for (const l of lines.slice(at + 1)) { if (/^>/.test(l)) out.push(l.replace(/^> ?/, "")); else if (out.length && l.trim()) break; }
  return out.join("\n").trim();
}
function extend(e, text, { now, title, context, running = runningHandoff }) {
  const p = e.to.path;
  try {
    const before = heldRequest(readSym(p, HELD)), md = actBrief(before ? `${before}\n\n---\n\n${text}` : text, { title, context, now });
    if (running(p)) writeFileSync(join(p, ".symbiot", HELD), md); else writeTasks(p, md); // its run ended just now: it lands, and lanesTick starts it
    const file = join(p, ".symbiot", "ANSWERS.md"), had = existsSync(file) ? readFileSync(file, "utf8") : "# Answers\n";
    writeFileSync(file, `${had.replace(/\s*$/, "")}\n\n### More from ${e.from.lane} while you ran\n${e.from.lane} added to what it handed you: TASKS.md has it. It adds to the work you were on, it doesn't replace it, so carry on from what you've done and do this as well.\n_symbiot (handover) ${new Date(now).toISOString().slice(0, 10)}_\n`);
    return { ok: true };
  } catch (err) { return { error: "Couldn't add it to the run already going: " + ((err && err.message) || err) }; }
}
// The ops runs going right now, for a new ops run's brief, so it works with them
// rather than over them: [{ run, path, by?, at?, what }], newest first. From the
// ledger (who handed it over, when) and the drafts folder (a run started from
// Home or a chat has no row there).
function opsGoing({ ledger, running, dirs } = {}) {
  if (!dirs) { try { dirs = readdirSync(ACT_DIR).filter((d) => d.startsWith("act-")).map((d) => join(ACT_DIR, d)); } catch { dirs = []; } }
  const out = new Map();
  for (const x of ledger.handoffs.slice().reverse()) if (x.to.lane === OPS && x.to.path && !x.reportedAt && x.status !== "error" && !out.has(x.to.path) && running(x.to.path)) out.set(x.to.path, { run: runName(x.to.path), path: x.to.path, by: x.from.lane, at: x.at, what: firstLine(x.text) });
  for (const p of dirs) if (!out.has(p) && running(p)) { let name = ""; try { name = JSON.parse(readSym(p, "handoff.json")).name || ""; } catch {} out.set(p, { run: runName(p), path: p, what: String(name).replace(/^Agent:\s*/, "") }); }
  return [...out.values()].slice(0, 6);
}
function alongsideNote(going) {
  if (!going.length) return "";
  return `## Other ops runs going now
Other ops agents are working right now, each in its own folder. If what you were handed touches what one of them is on (the same site, account, server or file), work with it, not over it:
- Read its \`.symbiot/\` files first (its TASKS.md, its reports, the end of its agent.log) to see how far it has got, and don't redo its steps. A sign-in it's in the middle of is its own: pressing Sign In again can text the user a new PIN and spoil the one it waits on.
- A file outside your folder that another run may write too (a lane's report, say): read it again just before you write, add a section of your own headed with your run's folder name, and never rewrite or delete what another run wrote. Better: write your findings in your own \`.symbiot/\`, and name that file in your last message.
- Something you find done that you didn't do: check that run's log before saying who did it, rather than guessing it was the user.
- If all of what you were handed is already in hand there, don't do it twice: say so in your last message, naming that run, and tick your task.

${going.map((g) => `- \`${g.run}\` (${tilde(g.path)})${g.by ? `, handed over by ${g.by}${g.at ? ` at ${stamp(g.at)}` : ""}` : ""}: "${clipWords(g.what.replace(/\*\*/g, ""), 120)}"`).join("\n")}`;
}

// What a repo lane's task says after a handover: who sent it, and the servers it names
// that the lane can't reach from its sandbox, so it does the code and sends the server
// part to ops rather than back (ops gave bookly a live .env change, 13 Oct 2026).
function handedBy(from, lane, text, reach) {
  const far = unreachable(text, lane, reach);
  return `(handed over by ${from.lane})${far.length ? ` Symbiot: ${lane} runs in a sandbox and can't reach ${far.join(" or ")}. Do the code part here, and hand what has to change on ${far.length > 1 ? "those servers" : "that server"} to ${OPS}, saying what.` : ""}`;
}
// The handover that led to this run, if one did: a row into this folder whose words are in
// the folder's brief (an ops brief quotes it; a repo's task line is it, reworded at most).
// Before, the last row ever into the folder was the parent, so a lane that had once taken a
// handover had every later one counted as the same chain, and ordinary requests were
// refused as loops or parked for the next run (46 of 155 rows at 4 or more, 15 Oct 2026). A loose
// word match counted too: bookly's own Meta-template task looked like a handover about a Meta
// template, took its chain (7) and every handover after it to ops errored (16 Oct 2026): it has to
// be nearly the same words.
function parentOf(path, ledger, md) {
  md = String(md || "");
  const tasks = /^## Tasks\s*$/m.test(md) ? md.split(/^## Tasks\s*$/m)[1].split(/^## /m)[0].split("\n").filter((l) => /^\s*-\s*\[ \]/.test(l)).join("\n") : md; // a lane's open tasks only: its brief's other lines (recent commits, "bookly: 2 uncommitted") matched a handover by chance
  const lines = tasks.split("\n").map((l) => l.replace(/^\s*(?:>\s?|-\s*\[[ xX]\]\s*)/, "").trim()).filter(Boolean);
  for (const h of ledger.handoffs.slice().reverse()) {
    if (h.to.path !== path || h.status === "error") continue;
    const head = firstLine(h.text).trim(), cut = head.slice(0, 80);
    if (lines.some((l) => (cut.length >= 12 ? l.includes(cut) : l === head) || alike(l, head, 0.85, 4))) return h;
  }
  return null;
}
// The handovers a chain came through, newest first: the parent, its parent… (rows from
// before 16 Oct 2026 don't name theirs, so the line stops there).
function ancestry(parent, ledger, most = 20) {
  const out = []; let h = parent;
  while (h && out.length < most && !out.includes(h)) { out.push(h); h = h.parent ? ledger.handoffs.find((x) => x.id === h.parent) : null; }
  return out;
}
// Past MAX_CHAIN a handover is a loop only when it's the same job coming round again (most
// of its words in one the chain came through), or past three times that. A long job two lanes
// work on together is new work at each step (bookly does the code, ops puts it live, ops finds
// the next thing, bookly fixes it): counting every step stalled it (16 Oct 2026).
function loops(text, chain, line) {
  if (chain <= MAX_CHAIN) return false;
  if (chain > MAX_CHAIN * 3) return true;
  const head = firstLine(text).replace(/^New job:\s*/i, "");
  return line.some((a) => alike(firstLine(a.text).replace(/^New job:\s*/i, ""), head));
}
const LOOP_SAID = (n) => `${n} handovers in a row led here, and this one is the same job coming round again, so it wasn't started. Do it yourself if you can; if not, it's on Home for the user to start or skip.`;
// Pick up what a folder's agent handed over and start the lanes it named.
// Each handover is started once (its key: where from, which lane, what).
function dispatch(path, { map = laneMap(), act = actNow, run = runHandoff, add = addTask, push = pushTasks, drop = removeTask, running = runningHandoff, refresh = resupply, more = extend, tasks = loadTasks, now = Date.now(), ledger = loadLedger(), dirs, reach } = {}) {
  const asked = parseHandoffs(readSym(path, "HANDOFF.md")); if (!asked.length) return [];
  const reachOf = () => { if (reach === undefined) { try { reach = laneReach({}); } catch { reach = null; } } return reach; };
  const from = { lane: laneOf(path, map), path }, parent = parentOf(path, ledger, readSym(path, "TASKS.md")), chain = (parent ? parent.chain : 0) + 1, line = ancestry(parent, ledger);
  const started = [];
  for (const h of asked) {
    const key = keyOf(path, h);
    if (ledger.handoffs.some((x) => x.key === key || (x.was || []).includes(key) || (x.adds || []).includes(key))) continue;
    const named = addsTo(h, from, ledger, { running }), prior = !named && supersedes(h, from, ledger, { running, tasks }), into = named || (!prior && relatedTo(h, from, ledger, { running }));
    if (into) {
      const ended = !!into.ended; delete into.ended;
      const r = more(into.fresh ? { from, to: into.to } : into, h.text, { now, running, title: `handed over by ${from.lane}`, context: `${from.lane}'s agent (in ${path}) handed this over, and carries on once it's done.` });
      // a run of someone else's: a row of the asker's own, so the run's report comes back to it too
      if (!r.error && into.fresh) { const e = { id: randomBytes(4).toString("hex"), key, from, to: into.to, text: h.text, at: now, chain, ...(parent ? { parent: parent.id } : {}), status: "started", adds: [key], added: 1 }; ledger.handoffs.push(e); started.push(e); continue; }
      if (!r.error) {
        Object.assign(into, { adds: [...(into.adds || []), key], at: now, added: (into.added || 0) + 1 });
        if (ended) { delete into.reportedAt; into.status = "started"; const s = run(into.to.path) || {}; Object.assign(into, startedAs(s)); } // its run had ended: it carries on in its own folder
        started.push(into); continue;
      }
    }
    if (prior) {
      const was = [...(prior.was || []), prior.key];
      if (prior.to.lane === OPS) {
        const r = refresh(prior, h.text, { now, title: `handed over by ${from.lane}`, context: `${from.lane}'s agent (in ${path}) handed this over, and carries on once it's done.` });
        if (r.error) { Object.assign(prior, { status: "error", error: r.error, text: h.text, key, was }); started.push(prior); continue; }
        Object.assign(prior, { text: h.text, key, was, at: now, superseded: (prior.superseded || 0) + 1 });
      } else {
        drop(prior.task);
        const t = add(h.text, prior.to.lane, { after: handedBy(from, prior.to.lane, h.text, reachOf()) });
        if (t.error) { Object.assign(prior, { status: "error", error: t.error, text: h.text, key, was }); started.push(prior); continue; }
        push({ repo: prior.to.lane });
        const r = run(prior.to.path) || {};
        Object.assign(prior, { text: h.text, key, was, at: now, task: t.id, superseded: (prior.superseded || 0) + 1, ...startedAs(r) });
      }
      started.push(prior); continue;
    }
    const e = { id: randomBytes(4).toString("hex"), key, from, to: { lane: h.lane, path: "" }, text: h.text, at: now, chain, ...(parent ? { parent: parent.id } : {}), status: "started" };
    let to = laneTarget(h.lane, map); const looped = loops(h.text, chain, line);
    // a lane that doesn't exist (a name nearLane couldn't place, a folder that's no lane): ops takes it,
    // told the name, rather than an error that sits (16 Oct 2026); from ops itself, it's ops's own to place
    if (!to && from.lane !== OPS) { e.rerouted = { from: h.lane, why: `there's no lane called ${h.lane}`, noLane: true }; to = { lane: OPS, path: "" }; e.to = { ...to }; }
    // a job that's all on a server the lane can't reach goes to ops, which can, rather than to a lane that can only hand it on
    const far = to && to.lane !== OPS && to.lane.toLowerCase() !== from.lane.toLowerCase() ? serverOnly(h.text, to.lane, reachOf()) : [];
    if (far.length && !looped) { e.rerouted = { from: to.lane, why: `${to.lane} runs in a sandbox and can't reach ${far.join(" or ")}` }; to = { lane: OPS, path: "" }; e.to = { ...to }; }
    if (looped && (!to || to.lane === OPS || to.lane.toLowerCase() === from.lane.toLowerCase())) Object.assign(e, { status: "error", error: LOOP_SAID(MAX_CHAIN) });
    else if (!to) Object.assign(e, { status: "error", error: `There's no lane called ${h.lane}. You are ops, the lane that takes whatever no repo lane does: do it yourself. Lanes: ops, or a repo: ${Object.keys(map).slice(0, 30).join(", ")}.` });
    else if (to.lane.toLowerCase() === from.lane.toLowerCase()) Object.assign(e, { status: "error", error: `${to.lane} is your own lane: do it yourself.` });
    else if (to.lane === OPS) {
      const why = !e.rerouted ? "" : e.rerouted.noLane ? ` It named a lane that doesn't exist (${e.rerouted.from}), so Symbiot sent it to you: work out where that work belongs (a folder on this computer, or a repo lane by another name: ${Object.keys(map).slice(0, 30).join(", ")}) and do it, or hand it to the right lane by its real name.` : ` It was for ${e.rerouted.from}, but ${e.rerouted.why}, so Symbiot sent it to you: do it here, and if there's code to change in ${e.rerouted.from}, hand that part to ${e.rerouted.from}.`;
      const r = act(h.text, { title: `handed over by ${from.lane}`, context: `${from.lane}'s agent (in ${path}) handed this over, and carries on once it's done.${why}`, alongside: [alongsideNote(opsGoing({ ledger, running, dirs })), sharedFor(path, h.text, { ledger, now })].filter(Boolean).join("\n\n"), now });
      if (r.error) Object.assign(e, { status: "error", error: r.error });
      else Object.assign(e, { to: { lane: OPS, path: r.dir }, job: r.job });
    } else {
      const t = add(h.text, to.lane, { after: handedBy(from, to.lane, h.text, reachOf()) }); // whole: a long one links to the rest
      if (t.error) Object.assign(e, { status: "error", error: t.error });
      else {
        push({ repo: to.lane });
        if (looped) Object.assign(e, { to, task: t.id, status: "blocked", note: `${MAX_CHAIN} handovers in a row led here and this is the same job coming round again, so no agent was started on it: it waits in ${to.lane}'s tasks for its next run` });
        else { noteShared(to.path, sharedFor(path, h.text, { ledger, now })); const r = run(to.path) || {}; Object.assign(e, { to, task: t.id, ...startedAs(r) }); }
      }
    }
    ledger.handoffs.push(e); started.push(e);
  }
  noteSent(path, asked, ledger);
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
function lastRunStart(path) { return runStarted(readSym(path, "agent.log")); }
const openQuestions = (path) => /^###\s+/m.test(readSym(path, "QUESTIONS.md").split(/^##\s+Suggestions/m)[0]);
// A question the user can see: one Home shows as a card (not answered, not judged an agent's or Symbiot's).
// A handover row said "it has a question for you" for a QUESTIONS.md heading Home had no card for (28 Oct 2026).
const shownQuestions = (path) => { if (!openQuestions(path)) return false; try { return agentQuestions(path, "").questions.length > 0; } catch { return true; } };
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
  if (e.status === "error") return { text: `Couldn't hand it over: ${e.error}`, settled: true };
  // Symbiot's own code: no agent will ever start there to clear this, so say so now
  // rather than waiting forever (a parked lane or a Pro limit can still clear on its
  // own, so only this, self-marked reason short-circuits the wait below).
  if (e.status === "blocked" && e.self) return { text: `${e.note} It's on ${e.to.lane}'s own task list now, on the Workdesk for the user to pick up — no agent will start it, so don't hand this over again.`, settled: true };
  const p = e.to.path; if (!p || running(p)) return null;
  if (lastRunStart(p) < e.at) return null; // its run hasn't started yet (held while that lane was busy)
  if (openQuestions(p) && !/^- \[x\]/im.test(readSym(p, "TASKS.md"))) return null; // waiting on the user, in that lane
  const words = lastWords(p);
  if (e.to.lane === OPS) {
    const ticked = /^- \[x\]/im.test(readSym(p, "TASKS.md"));
    return { text: `${ticked ? "Done" : "It stopped without finishing"} (the ops agent).${words ? `\n\nWhat it said:\n${words}` : ""}`, settled: ticked, ...(ticked ? {} : { stopped: true }) };
  }
  const t = tasks.find((x) => x.id === e.task);
  const done = t && (t.review || t.done || t.archived), about = aboutIt(words, e.text);
  return { ...(done ? {} : { stopped: true }), text: `${done ? `Done in ${e.to.lane}: the task is ticked, and its changes wait for the user's review in Symbiot` : `${e.to.lane}'s agent stopped without ticking it`}.${about ? `\n\nWhat it said about this:\n${about}` : words ? `\n\nIts last message was about other work in ${e.to.lane}, not this.` : ""}`, settled: !!done };
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
// What a folder handed over that hasn't come back yet, each with where it stands,
// for that lane's block (Agents, Home): the sections of its HANDOFF.md not sent
// yet, and the ledger's handovers from it, with how far the receiving run has got.
// whatsapp_module's test-number handover sat from 07:33 (2026-10-12) behind ops's
// run on its earlier version, and nothing on its block said so, so the user
// answered as if ops already had it. [{ lane, text, gone, why, doing?, progress? }]:
// gone, its lane has it (why says how it's going); otherwise why says what it waits on.
const keyOf = (path, h) => createHash("sha1").update(path + "\n" + h.lane.toLowerCase() + "\n" + h.text).digest("hex").slice(0, 16);
const findSent = (ledger, key) => ledger.handoffs.slice().reverse().find((x) => x.key === key) || ledger.handoffs.slice().reverse().find((x) => (x.was || []).includes(key) || (x.adds || []).includes(key));
// What the run there is doing and how far through its tasks it is.
function runWork(p) { try { const { work, progress } = workOf(p, readSym(p, "agent.log")); const t = work && (work.todos || []).find((x) => x.status === "in_progress"); return { doing: clipWords(String((t && t.active) || (work && work.doing) || ""), 100), progress }; } catch { return {}; } }
function handingOf(path, { ledger, map, running = runningHandoff, now = Date.now(), changedAt, work = runWork } = {}) {
  if (!path) return [];
  ledger = ledger || loadLedger();
  const asked = parseHandoffs(readSym(path, "HANDOFF.md"));
  const mine = ledger.handoffs.filter((x) => x.from.path === path && !x.skipped && now - (x.at || 0) < STUCK_FOR && (x.status === "error" ? !pastIt(x, ledger.handoffs) : !x.reportedAt && x.status !== "done")); // one that couldn't go stays until you Allow or Skip it
  if (!asked.length && !mine.length) return [];
  map = map || laneMap();
  if (changedAt == null) try { changedAt = statSync(join(path, ".symbiot", "HANDOFF.md")).mtimeMs; } catch { changedAt = now; }
  const scanned = path.startsWith(ACT_DIR) || Object.values(map).includes(path), out = [];
  const short = (t) => clipWords(firstLine(t).replace(/\*\*/g, ""), 120);
  for (const h of asked) {
    if (findSent(ledger, keyOf(path, h))) continue; // sent: the ledger's row says where it stands
    const age = now - changedAt, row = (why) => out.push({ lane: h.lane, text: short(h.text), gone: false, why });
    if (!scanned) row("Not sent: Symbiot doesn't have this folder as a lane, so it never reads its HANDOFF.md");
    else if (age < 60000) row("Not sent yet: Symbiot picks it up within 20 seconds");
    else row(`Not sent after ${ago(age)}: Symbiot only sends handovers while its app is open`);
  }
  for (const e of mine.slice().reverse()) {
    // Handed on again by the lane it went to (symbiot → steve → ops): the row names both lanes, and
    // says where the second stands when that's a question for you (spec of 25 Oct 2026: the chain was hard to follow).
    const on = e.to.path ? ledger.handoffs.filter((x) => x.from.path === e.to.path && (x.at || 0) >= (e.at || 0) && !x.skipped && !x.reportedAt && x.status !== "done" && x.status !== "error").pop() : null;
    const then = on && on.to && on.to.lane && on.to.lane !== e.to.lane ? { then: on.to.lane, ...(on.to.path && shownQuestions(on.to.path) ? { askLane: on.to.lane, thenAsks: true } : {}) } : {};
    const row = (gone, why, more = {}) => out.push({ lane: e.to.lane, text: short(e.text), gone, why: then.thenAsks ? "Sent: its agent asked you something first" : why, ...more, ...then });
    if (e.status === "error") { row(false, `Couldn't hand it over: ${e.error || "it didn't start"}`); continue; }
    const p = e.to.path, going = !!(p && running(p)), began = p ? lastRunStart(p) : 0;
    if (began < e.at && going) row(true, e.added ? `Sent: ${runName(p)} is on it now, and does what you added when it's through` : e.superseded ? `Sent: ${e.to.lane} is on the earlier version now (its run started ${ago(now - began)} ago), and gets this one when that run ends` : `Sent, and queued: ${e.to.lane}'s agent is busy, and starts on it when that run ends`);
    else if (began < e.at && e.status === "blocked") row(false, `Sent, but it didn't start: ${e.note || "its agent didn't start"}`);
    else if (began < e.at) row(true, `Sent: ${e.to.lane}'s agent starts on it when it's free`);
    else if (going) { const w = work(p) || {}; row(true, "Sent: its agent is on it now", { ...(w.doing ? { doing: w.doing } : {}), ...(w.progress ? { progress: w.progress } : {}) }); }
    else if (shownQuestions(p)) row(true, "Sent: its agent asked you something first");
    else row(true, "Sent: its run ended, and what it did comes back within 20 seconds");
  }
  return out.slice(0, 6);
}
const ago = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? "under a minute" : m < 120 ? `${m} min` : `${Math.round(m / 60)} hours`; };
// Once what's in a HANDOFF.md has gone, the file says so instead of still reading
// like a handover waiting to go: whatsapp_module's agent saw its file still there
// and told the user it hadn't been sent, while ops had both its handovers running
// (2026-10-12). The sections become a dated list of what went where, newest first;
// a new "### <lane>" section added to it is sent as usual.
const stamp = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
function sentState(e, key) {
  if (e.status === "error") return `couldn't hand it over: ${String(e.error || "it didn't start").replace(/\.$/, "")}`;
  if ((e.adds || []).includes(key)) return `added to ${runName(e.to.path)}, the ops run already on what it adds to: it does this next, in the same conversation`;
  if (e.key !== key) return "sent earlier, and replaced since by a newer version";
  if (e.superseded && e.to.lane === OPS && e.pickedAt) return `replaces the version sent earlier: ops's run ${runName(e.to.path)} started on it at ${stamp(e.pickedAt).slice(11)}`;
  if (e.superseded) return e.to.lane === OPS ? `replaces the version sent earlier: ops's run ${runName(e.to.path)} is on that one, and gets this when that run ends` : `replaces the version sent earlier, as a task in ${e.to.lane}`;
  if (e.status === "held") return `queued in ${e.to.lane}: its agent was busy, and starts on it when that run ends`;
  if (e.status === "blocked") return `added to ${e.to.lane}'s tasks, but its agent didn't start (${String(e.note || "").replace(/\.$/, "")})`;
  if (e.allowedAt) return `the user let it through, and ops's agent started on it, as run ${runName(e.to.path)}`;
  if (e.rerouted && e.to.lane === OPS && e.to.path) return `sent to ops instead of ${e.rerouted.from} (${e.rerouted.why}), and ops's agent started on it, as run ${runName(e.to.path)}`;
  return e.to.lane === OPS && e.to.path ? `ops's agent started on it, as run ${runName(e.to.path)} (name that in a handover that adds to it while it runs)` : `${e.to.lane}'s agent started on it`;
}
const sentLine = (e, key, text) => `- ${stamp(e.at || Date.now())} → **${e.to.lane}**: ${sentState(e, key)}. ${sentWhat(text)}`;
const sentWhat = (text) => `"${clipWords(firstLine(text).replace(/\*\*/g, ""), 100)}"`;
function noteSent(path, asked, ledger) {
  const file = join(path, ".symbiot", "HANDOFF.md");
  const rows = asked.map((h) => { const key = keyOf(path, h), e = findSent(ledger, key); return e ? sentLine(e, key, h.text) : null; });
  if (!rows.length || rows.some((r) => !r)) return false;
  const had = readSym(path, "HANDOFF.md");
  if (JSON.stringify(parseHandoffs(had)) !== JSON.stringify(asked)) return false; // its agent is writing to it: next pass
  const lines = had.split("\n"), at = lines.findIndex((l) => /^##\s+Sent\s*$/.test(l)), before = [];
  if (at >= 0) for (const l of lines.slice(at + 1)) { if (/^#/.test(l)) break; if (/^- /.test(l)) before.push(l); }
  const md = `# Handovers: sent\nSymbiot sent what was in this file to its lane, so nothing here waits to go. Each lane's agent works on it (the Agents tab shows how far it has got), and what it did comes back to you in \`.symbiot/ANSWERS.md\`. To hand over something else, or a changed version of one below, add a \`### <lane>\` section to this file: Symbiot sends it within 20 seconds.\n\n## Sent\n${[...rows, ...before].slice(0, 12).join("\n")}\n`;
  try { writeFileSync(file, md); return true; } catch { return false; }
}
// Tell the agent that asked: the result as an answer in its ANSWERS.md, then
// start it again to carry on (unless it's still running: it reads it next time).
// Not past a step of the user's it waits on (a key for .env, "don't start another
// run until it's in"): that run starts by itself once the step's done. Forced only
// when the handover settled something (done, or it never will be): "it stopped
// without finishing" gives a lane waiting on it nothing new, and forcing it started
// that lane again on every such report (the 14 Oct 2026 audit). Unforced, it starts
// only if its last run wasn't waiting on the same things (agents.mjs blockedAgain).
// Only a lane with an open task is started at all (with none, its next run reads the report),
// and it counts towards the lane's automatic starts in an hour (agents.mjs autoStart): every ops
// report restarted Bookly, which handed ops the next read, and the two lanes ping-ponged
// through 18 runs on one open item (21 Oct 2026). Past the cap, the start is kept as due.
// The asking lane's newest run record (agents.mjs runOutcome) decides first: one waiting on this
// handover is moved on and started, even with only that waiting item left; one waiting on the user,
// a reply or a time isn't started for a report that doesn't change that (0.68.1).
function report(e, o, { run = runHandoff, running = runningHandoff, waiting = waitingFor, auto = autoStart, record = runRecord, settle = settleRecord, now = Date.now() } = {}) {
  const p = e.from.path, file = join(p, ".symbiot", "ANSWERS.md");
  try {
    mkdirSync(join(p, ".symbiot"), { recursive: true });
    const had = existsSync(file) ? readFileSync(file, "utf8") : "# Answers\nAnswers to your questions, and what other lanes did with what you handed over, newest last.\n";
    writeFileSync(file, `${had.replace(/\s*$/, "")}\n\n### Handed over to ${e.to.lane}: ${clipWords(firstLine(e.text), 120)}\n${o.text}\n_answered by symbiot (handover) ${new Date(now).toISOString().slice(0, 10)}_\n`);
  } catch { return false; }
  const rec = (() => { try { return record(p); } catch { return null; } })();
  if (rec && rec.state === "waiting" && rec.waitingOn !== "lane") return true;
  const waitsHere = !!rec && rec.state === "waiting" && rec.waitingOn === "lane";
  if (waitsHere) settle(p, `${e.to.lane} reported back`);
  if (!running(p) && (waitsHere || /^\s*(?:[-*+]|\d+[.)])\s*\[ \]/m.test(readSym(p, "TASKS.md"))) && auto(p, { now, key: `handover:${e.id || firstLine(e.text)}` })) run(p, { force: waitsHere || (!!o.settled && !waiting(p)) });
  return true;
}

// A handover with no outcome for STALE_AFTER: its run never began, its folder is gone, or its
// lane is waiting on the user (an unanswered question there). The asker is told so, once, rather
// than waiting forever (two "started" rows sat 8 days on ops questions nobody had answered,
// 16 Oct 2026). Not settled: the asker's next run starts only if it has something new to go
// on (agents.mjs blockedAgain), and the row stays open for the real outcome when it comes.
const STALE_AFTER = 3 * 86400000;
const openQuestionTitles = (p) => { try { return (agentQuestions(p, "").questions || []).map((x) => x.q); } catch { return []; } };
function staleOutcome(e, { now = Date.now(), running = runningHandoff } = {}) {
  if (!(e.status === "started" || e.status === "held") || e.reportedAt || now - (e.at || 0) < STALE_AFTER) return null;
  const p = e.to.path; if (!p || running(p)) return null;
  const days = Math.round((now - e.at) / 86400000);
  if (!existsSync(p)) return { text: `Not done: the folder ${e.to.lane}'s run had (${p}) is gone, and nothing ran on it in ${days} days. If it still matters, hand it over again.`, settled: false };
  if (lastRunStart(p) < e.at) return { text: `Not done: no run has started on it in ${e.to.lane} in ${days} days${e.note ? ` (${e.note})` : ""}. If it still matters, hand it over again, or do what you can of it yourself.`, settled: false };
  const q = openQuestionTitles(p);
  if (q.length) return { text: `Not done yet: ${e.to.lane}'s agent asked the user ${days} days ago and has no answer: "${clipWords(q[0], 160)}". It carries on once they answer (the question is on the Workdesk). Carry on with what doesn't depend on it.`, settled: false };
  return null;
}
// One pass: start what's been handed over, from every lane, then report back
// what's done. The app runs it every 20 seconds.
function lanesTick({ map = laneMap(), act = actNow, run = runHandoff, running = runningHandoff, add = addTask, push = pushTasks, tasks, now = Date.now(), relink = orcaRelink } = {}) {
  const ledger = loadLedger();
  let acts = []; try { acts = readdirSync(ACT_DIR).filter((d) => d.startsWith("act-")).map((d) => join(ACT_DIR, d)); } catch {}
  const started = [];
  for (const path of [...Object.values(map), ...acts]) if (existsSync(join(path, ".symbiot", "HANDOFF.md"))) started.push(...dispatch(path, { map, act, run, add, push, running, now, ledger, ...(tasks ? { tasks: () => tasks } : {}) }));
  const t = tasks || loadTasks(), reported = []; let picked = 0;
  for (const e of ledger.handoffs) {
    // a superseded ops run that ended where nothing started its new brief (another process ran it): start it here
    if ((e.superseded || e.added) && !e.reportedAt && e.status !== "error" && e.to.lane === OPS && e.to.path && !running(e.to.path) && lastRunStart(e.to.path) < e.at) { const r = run(e.to.path, { force: true }) || {}; if (r.id && !r.busy) e.job = r.id; }
    // ...and once a run there starts on it, the asker's Sent line says so, naming it: "gets it when
    // that run ends" stayed put, and bookly's agent, checking another ops run that had ended, thought
    // nothing had started and sent it again (12 Oct 2026)
    if (e.superseded && !e.pickedAt && !e.reportedAt && e.status !== "error" && e.to.lane === OPS && e.to.path) { const b = lastRunStart(e.to.path); if (b >= e.at) { e.pickedAt = b; resent(e, (l) => /: replaces the version sent earlier: ops's run /.test(l)); picked++; } }
    if (e.reportedAt || running(e.from.path)) continue; // the one that asked reads it when it's started again, so not mid-run
    const o = outcome(e, { tasks: t, running });
    // nothing to report yet, for days: the asker is told where it stands, once (staleOutcome), and the row stays open for the real outcome
    if (!o) { const s = !e.stale && staleOutcome(e, { now, running }); if (s && report(e, s, { run, running, now })) { e.stale = now; e.result = s.text; reported.push(e); } continue; }
    // one that came back without finishing is "stopped", not "done": 93 of 108 handovers read done by
    // 21 Oct 2026, finished or not, and the work they were for was taken as done (goals.mjs reads this)
    if (report(e, o, { run, running, now })) { e.reportedAt = now; if (e.status !== "error") e.status = o.stopped ? "stopped" : "done"; e.result = o.text; reported.push(e); }
  }
  if (started.length || reported.length || picked) saveLedger(ledger);
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
function alike(a, b, share = 0.5, least = 3) {
  const x = keyWords(a), y = keyWords(b), [s, l] = x.size <= y.size ? [x, y] : [y, x]; if (s.size < least) return false;
  let n = 0; for (const w of s) if (l.has(w)) n++;
  return n / s.size >= share;
}
// A lane's question about work it handed over, once that work is done: whatsapp_module
// asked "Can I reach prod-box myself to put the WhatsApp module back?" after its two
// handovers to ops stopped, and kept asking on Home after ops had put it back and ticked
// it (2026-10-12). It's out of date when three quarters of its words (prod-box counts
// whole) are in one of this lane's handovers from the last week, the one it's most about,
// and the lane that took it has ticked it in its TASKS.md. { lane, text } for the card, or null.
const DONE_WITHIN = 7 * 86400000, ASK_SKIP = new Set(["can", "the", "and", "for", "you", "now", "how", "its", "it's", "myself", "yourself", ...COMMON]);
const askWords = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).map((w) => w.replace(/^[-']+|[-']+$/g, "")).filter((w) => w.length > 2 && !ASK_SKIP.has(w)).map((w) => w.replace(/s$/, "")));
function doneSince(path, q, { ledger = loadLedger(), now = Date.now(), read = readSym } = {}) {
  const want = askWords(q); if (!path || want.size < 3) return null;
  let best = null, top = 0.75; // the handover it's most about, newest first on a tie
  for (const h of ledger.handoffs.slice().reverse()) {
    if (h.from.path !== path || h.skipped || h.status === "error" || !h.to.path || now - (h.at || 0) > DONE_WITHIN) continue;
    const has = askWords(firstLine(h.text)); let n = 0; for (const w of want) if (has.has(w)) n++;
    if (n / want.size > top || (!best && n / want.size === top)) { best = h; top = n / want.size; }
  }
  if (!best) return null;
  // an ask to reply, send or tell someone is done only by a handover that did that: "Should I
  // reply to Dana that her Vodacom test reached us?" was closed as done by ops's trace of that
  // same test, which sent nothing, and Dana had no answer for hours (21 Oct 2026)
  const SENDS = /\b(?:repl(?:y|ied|ies)|send|sent|email|mail|messag|tell|told|post|invite|notif|let \w+ know)/i;
  if (SENDS.test(q) && !SENDS.test(best.text)) return null;
  const head = firstLine(best.text), ticked = read(best.to.path, "TASKS.md").split("\n").filter((l) => /^\s*(?:[-*+]|\d+[.)])\s*\[[xX]\]/.test(l));
  return ticked.some((l) => alike(l, head)) ? { lane: best.to.lane, text: clipWords(head.replace(/\*\*/g, "").replace(/^What['’]s needed:\s*/i, ""), 120) } : null;
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
  return lastRunStart(e.from.path) > e.at && /^- \[x\]/im.test(md) && !/^\s*- \[[ ~]\]/m.test(md); // a [~] item still waits, maybe on this very handover
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
// (Edit(path) covers Write; a Write(path) rule is never consulted, and //path is absolute: agents.mjs GUARD)
const dirRules = (dirs) => dirs.flatMap((d) => [`Read(/${d}/**)`, `Edit(/${d}/**)`]).concat(dirs.length ? ["Bash(mv:*)", "Bash(git mv:*)", "Bash(mkdir:*)", "Bash(ls:*)", "Bash(find:*)"] : []);
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
  saveLedger(ledger); resent(e, (l) => /^- .*: couldn't hand it over: /.test(l));
  return { ok: true, job: r.job, dirs };
}
// Its Sent line in the asking folder's HANDOFF.md said "couldn't hand it over", and
// stayed so after Allow (12 Oct 2026): the agent that sent it read that and thought
// nothing ran, so it asked again. That line now says it started, and as which run.
// Its Sent line, the one of the lines that match, rewritten to say where it stands now.
function resent(e, was) {
  const file = join(e.from.path, ".symbiot", "HANDOFF.md"), what = sentWhat(e.text);
  try {
    const had = readFileSync(file, "utf8");
    const md = had.split("\n").map((l) => was(l) && l.endsWith(what) ? sentLine(e, e.key, e.text) : l).join("\n");
    if (md !== had) writeFileSync(file, md);
  } catch {}
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
// A handover can rename a lane's folder (CallForge AI → bookly), and the run that
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
// Where a started handover really is, for the row's label: the ledger says "started" for good, so a
// run that ended, or asked the user something, still read "working on it" (25 Oct 2026: two steve → ops rows
// sat there for hours with no ops run). { stage } is running | asks | ended | queued, or nothing.
function stageOf(e, { running = runningHandoff, status = e.status } = {}) {
  if (status !== "started" || !e.to.path || e.reportedAt) return {};
  const p = e.to.path;
  if (running(p)) return { stage: "running" };
  if (lastRunStart(p) < e.at) return { stage: "queued" };
  return { stage: openQuestions(p) ? "asks" : "ended" };
}
// Whether a row counts as under way on the Workdesk: not one that reported back, was dropped (Skip),
// couldn't go, or whose run ended with nothing left for the user (25 Oct 2026: "under way" counted 13,
// a Kaggle submission done hours before and a "Permission denied" job among them).
const underWay = (e, row) => !e.reportedAt && !e.skipped && ["started", "held", "blocked"].includes(row.status) && row.stage !== "ended";
function lanesState() {
  const out = [], byKey = new Map();
  for (const e of loadLedger().handoffs.slice().reverse()) {
    const k = [e.from.lane, e.to.lane, firstLine(e.text).replace(/\s+/g, " ").trim()].join("\n").toLowerCase();
    if (byKey.has(k)) { byKey.get(k).times++; continue; }
    const row = { id: e.id, from: e.from.lane, to: e.to.lane, text: clipWords(firstLine(e.text), 160), ...(e.text.trim() !== firstLine(e.text).trim() || e.text.length > 160 ? { full: e.text } : {}), at: e.at, status: (e.status === "held" || e.status === "blocked") && e.to.path && lastRunStart(e.to.path) >= e.at ? "started" : e.status, ...(e.status === "blocked" && e.note ? { note: e.note } : {}), ...(e.error ? { error: e.error } : {}), ...(e.result ? { result: e.result } : {}), ...(e.skipped ? { skipped: true } : {}), times: 1 };
    Object.assign(row, stageOf(e, { status: row.status })); row.live = underWay(e, row);
    byKey.set(k, row); out.push(row);
  }
  return { handoffs: out.slice(0, 30) };
}

// ---- one answer, every agent on that work ------------------------------------------
// the user gave the same answer to the same project three times (13 Oct 2026): orbit_platform's
// read-only investigation asked "Send the Supabase ticket about orbit_avm now?", the ops run it
// had handed the prod-box checks to asked about two shell histories for the same orbit_avm dump,
// and one reply ("first check if orbit_avm is saved somewhere else") settled both. So what the
// user answers one agent (on Home, the Workdesk or a phone: agents.mjs answerQuestions, through
// onAnswered) is saved for the others on the same work as well: the folders a handover links to
// it, either way and one more step, and any agent whose open question or task names the same
// thing (an id such as orbit_avm, an address, a domain). Each gets it in its ANSWERS.md and
// decides whether it settles its own question; one with a question open and no run going starts
// on it. Kept in SHARED too, so a run that starts on that work later is told (sharedFor).
const SHARED = join(CONFIG_DIR, "answers-shared.json"), SHARED_KEEP = 200, LINK_DAYS = 14;
// What names the work: an id with an underscore (orbit_avm), an IPv4 address, a domain.
// Not the domain of an email address, nor a host every agent names (gmail.com, claude.ai,
// github.com) or the user's own: on those one answer reached six lanes (15 Oct 2026).
const TOPIC = /(?<![@\w.-])(?:[a-z][a-z0-9]*(?:_[a-z0-9]+)+|\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|co\.za|io|dev|net|org|app|ai))\b/gi;
const COMMON_HOSTS = new Set(["gmail.com", "googlemail.com", "outlook.com", "outlook.live.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com", "claude.ai", "claude.com", "anthropic.com", "platform.claude.com", "console.anthropic.com", "github.com", "gitlab.com", "google.com", "accounts.google.com", "microsoft.com", "login.microsoftonline.com", "teams.microsoft.com", "openai.com", "platform.openai.com", "npmjs.com", "www.npmjs.com", "localhost", "example.com", "whatsapp.com", "web.whatsapp.com", "linkedin.com", "www.linkedin.com", "facebook.com", "business.facebook.com", "x.com", "twitter.com", "reddit.com", "www.reddit.com"]);
// The user's own domains: their email addresses' and their company's (config.profile, config.mail), and any linked site's
function ownHosts(cfg = loadConfig()) {
  const out = new Set(), add = (s) => { for (const m of String(s || "").toLowerCase().matchAll(/@([a-z0-9.-]+\.[a-z]{2,})|\b((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|co\.za|io|dev|net|org|app|ai))\b/g)) { const h = m[1] || m[2]; if (h) { out.add(h); out.add(h.replace(/^www\./, "")); } } };
  try { const p = (cfg && cfg.profile) || {}; add(p.email); add(p.domain); add(p.company); add(p.site); for (const e of (cfg && cfg.mail && cfg.mail.addresses) || []) add(e); } catch {}
  return out;
}
const topicsOf = (t, own = ownHosts()) => new Set((String(t || "").match(TOPIC) || []).map((x) => x.toLowerCase()).filter((x) => x.length >= 5 && !COMMON_HOSTS.has(x) && !own.has(x) && !own.has(x.replace(/^www\./, ""))));
function loadShared() { try { const l = readState(SHARED); return Array.isArray(l) ? l : []; } catch { return []; } }
const whoAnswers = (cfg = loadConfig()) => String(((cfg && cfg.profile) || {}).name || "").trim().split(/\s+/)[0] || "the user";
// The folders a handover links to path, either way, and one step on (the run orbit_platform
// handed prod-box's checks to, and anything that run handed on), within LINK_DAYS: what a
// new run's brief is told (sharedFor). open: only a handover still open (its job hasn't
// reported back), and only one step, for whom an answer goes to (answerReaches): over 14 days
// and two steps every lane linked every other, and one answer reached them all (20 Oct 2026).
const isOpen = (x) => !x.reportedAt && !["done", "stopped", "error", "failed"].includes(x.status);
function linkedPaths(path, { ledger = loadLedger(), now = Date.now(), open = false } = {}) {
  const edges = ledger.handoffs.filter((x) => x.from && x.to && x.from.path && x.to.path && now - (x.at || 0) < LINK_DAYS * 86400000 && (!open || isOpen(x)));
  const seen = new Set([path]); let edge = [path];
  for (let step = 0; step < (open ? 1 : 2); step++) {
    const next = [];
    for (const p of edge) for (const x of edges) for (const [a, b] of [[x.from.path, x.to.path], [x.to.path, x.from.path]]) if (a === p && !seen.has(b)) { seen.add(b); next.push(b); }
    edge = next;
  }
  seen.delete(path); return [...seen];
}
// An agent folder still on its work: a question open, a run going, or a task unticked.
function onIt(p, running) {
  const qs = (() => { try { return agentQuestions(p, "").questions || []; } catch { return []; } })();
  const open = /^\s*-\s*\[ \]/m.test(readSym(p, "TASKS.md"));
  return { qs, going: !!running(p), open, live: qs.length > 0 || !!running(p) || open };
}
// What an agent folder is about, for topics: its open questions and its open tasks.
const asksOf = (qs) => qs.map((q) => `${q.q} ${q.context || ""}`).join("\n");
const aboutOf = (p, qs) => [...qs.map((q) => `${q.q} ${q.context || ""}`), ...readSym(p, "TASKS.md").split("\n").filter((l) => /^\s*-\s*\[ \]/.test(l))].join("\n");
// The other agents an answer at path concerns: [{ path, lane, why: "handover" | topic, qs, going, asks }].
// asks: the answer bears on a question of its own (names the same thing, or it's the same
// question): only then is it started on it (shareAnswer), a handover or not. An open task or a
// handover alone isn't enough: every lane had an old question open, so every answer started
// them all, to say "nothing here needed doing" (183 of 365 runs under a minute, 16-20 Oct 2026).
function answerReaches(path, text, { ledger = loadLedger(), runs = () => loadRuns(), running = runningHandoff, map = laneMap(), now = Date.now(), asked = [] } = {}) {
  const out = new Map(), topics = topicsOf(text);
  const bears = (qs) => [...topicsOf(asksOf(qs))].some((t) => topics.has(t)) || qs.some((q) => asked.some((a) => sameTask(q.q, a)));
  for (const p of linkedPaths(path, { ledger, now, open: true })) { const o = onIt(p, running); if (o.live && existsSync(p)) out.set(p, { path: p, lane: laneOf(p, map), why: "handover", qs: o.qs, going: o.going, asks: bears(o.qs) }); }
  if (topics.size) for (const p of [...new Set(runs().map((r) => r && r.path).filter(Boolean))]) {
    if (p === path || out.has(p) || !existsSync(p)) continue;
    const o = onIt(p, running); if (!o.live) continue;
    const hit = [...topicsOf(aboutOf(p, o.qs))].find((t) => topics.has(t));
    if (hit) out.set(p, { path: p, lane: laneOf(p, map), why: hit, qs: o.qs, going: o.going, asks: bears(o.qs) });
  }
  return [...out.values()];
}
const shareKey = (path, q, a) => createHash("sha1").update(path + "\n" + q + "\n" + a).digest("hex").slice(0, 16);
// The user answered rows ([{ q, a }]) of the agent at path: each other agent on that work gets
// them in its ANSWERS.md, with what to do; one with a question open and no run going starts on
// them, when the answer bears on that question: a question of its own names the same thing,
// or is the same question. One that matched only on a task's words gets it as background, starts
// nothing, and it doesn't count as an answer for it (agents.mjs userAnswers): the user's Outlook
// answers to ops reached the symbiot lane "about outlook.live.com too" (14 Oct 2026).
// Gives [{ path, lane, why, started? }]. card: the question's words as Home showed them.
function shareAnswer(path, rows, { run = runHandoff, now = Date.now(), cfg = loadConfig(), ...o } = {}) {
  rows = (rows || []).filter((x) => x && x.q && String(x.a || "").trim()); if (!rows.length) return [];
  const map = o.map || laneMap(), from = laneOf(path, map), who = whoAnswers(cfg), list = loadShared();
  const fresh = rows.filter((x) => !list.some((y) => y.key === shareKey(path, x.q, x.a))); if (!fresh.length) return [];
  const reach = answerReaches(path, fresh.map((x) => `${x.q}\n${x.a}`).join("\n"), { ...o, map, now, asked: fresh.map((x) => x.q) });
  const day = new Date(now).toISOString().slice(0, 10), out = [];
  for (const r of reach) {
    const file = join(r.path, ".symbiot", "ANSWERS.md"), had = existsSync(file) ? readFileSync(file, "utf8") : "# Answers from the user\n";
    const why = r.why === "handover" ? `it's on the same work as you (one of you handed it to the other)` : `it's about ${r.why} too`, bears = !!r.asks;
    const md = fresh.map((x) => `\n### ${who}'s answer to ${from}, on the same work as you\n${who} answered another agent's question, and ${why}:\n> ${clipWords(x.q.replace(/\s+/g, " "), 300)}\n\n${who}'s answer: ${x.a.trim()}\n\nIf it settles a question of yours (one open in .symbiot/QUESTIONS.md, or one you were about to ask), use it and don't ask: take that question out of QUESTIONS.md and say "answered by ${who}'s reply to ${from}: \"${clipWords(x.q.replace(/\s+/g, " "), 80)}\"" in your last message. If it settles only part, ask only the part that's left. If it doesn't bear on yours, carry on as you were.\n_shared by Symbiot ${day}${bears ? "" : " (background)"}_\n`).join("");
    // background: the file's time stays, so the note isn't "an answer since the last run" to nothingToDo or resumeFor
    try { mkdirSync(join(r.path, ".symbiot"), { recursive: true }); let st = null; try { st = statSync(file); } catch {} writeFileSync(file, had.replace(/\s*$/, "\n") + md); if (!bears && st) utimesSync(file, st.atime, st.mtime); } catch { continue; }
    const row = { path: r.path, lane: r.lane, why: r.why };
    // a question of its own waits on the user: it starts now and decides, rather than waiting to be answered too
    if (bears && r.qs.length && !r.going) { const e = run(r.path) || {}; if (e.id && !e.busy && !e.blocked) row.started = e.id; }
    out.push(row);
  }
  const at = new Date(now).toISOString();
  for (const x of fresh) list.push({ key: shareKey(path, x.q, x.a), at, from: path, lane: from, q: clipWords(x.q, 300), a: String(x.a).trim().slice(0, 2000), topics: [...topicsOf(`${x.q}\n${x.a}`)], to: out.map((r) => r.path) });
  try { writeJsonAtomic(SHARED, list.slice(-SHARED_KEEP), { indent: 1 }); } catch {}
  return out;
}
// A repo lane's run reads them in its ANSWERS.md (its TASKS.md is a brief for many tasks), once.
function noteShared(p, block) {
  if (!block || !p) return;
  const file = join(p, ".symbiot", "ANSWERS.md");
  try { const had = existsSync(file) ? readFileSync(file, "utf8") : "# Answers from the user\n"; if (allAnswers(p).includes(block.split("\n").slice(2).join("\n"))) return; mkdirSync(join(p, ".symbiot"), { recursive: true }); writeFileSync(file, had.replace(/\s*$/, "\n") + "\n" + block.replace(/^## /, "### ") + "\n"); } catch {}
}
// The newest answer shared with the agent at p (shareAnswer), for its card on Home: { lane, a, at, who } or null.
function sharedTo(p, { now = Date.now(), within = 2 * 86400000, cfg = loadConfig() } = {}) {
  const x = loadShared().slice().reverse().find((y) => (y.to || []).includes(p) && now - Date.parse(y.at || 0) < within);
  return x ? { lane: x.lane, a: clipWords(String(x.a).replace(/\s+/g, " "), 200), at: x.at, who: whoAnswers(cfg) } : null;
}
// What the user already answered on the work a new run starts on (a handover from path, about
// text): the answers given at path or a folder linked to it, or naming the same thing. For its
// brief, so it checks those before asking anything. "" when none.
function sharedFor(path, text, { ledger = loadLedger(), now = Date.now(), cfg = loadConfig(), max = 6 } = {}) {
  const near = new Set([path, ...linkedPaths(path, { ledger, now })]), topics = topicsOf(text), who = whoAnswers(cfg);
  const l = loadShared().filter((x) => now - Date.parse(x.at || 0) < LINK_DAYS * 86400000 && (near.has(x.from) || (x.topics || []).some((t) => topics.has(t)))).slice(-max);
  if (!l.length) return "";
  return `## What ${who} has already answered on this work\nBefore you ask ${who} anything, check these: if one settles it, use it and don't ask.\n${l.map((x) => `- ${x.lane} asked "${clipWords(x.q.replace(/\s+/g, " "), 160)}": ${clipWords(x.a.replace(/\s+/g, " "), 300)} (${String(x.at).slice(0, 10)})`).join("\n")}`;
}

// Changes made in a lane's folder for a job that lane handed over (quartz's handoff to ops, which
// edits quartz's folder) are tied to that handoff, not shown as "changes without a task" for the
// user to approve. Once the receiving runs are over they go up as a PR on their own, with
// auto-merge on green CI, unless they look like they hold a secret: those wait for the user.
const HANDED_FOR = 7 * 86400000, HELD_AGAIN = 30 * 60000;
const SECRET_FILE = /(^|\/)(\.env(\..*)?|.*\.(pem|key|jks|keystore|p12|pfx)|id_(rsa|dsa|ecdsa|ed25519)|\.npmrc|\.netrc|key\.properties|.*credentials.*\.json|.*service[-_]?account.*\.json)$/i;
const SECRET_TEXT = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /\bgithub_pat_[A-Za-z0-9_]{30,}/, /\bsk-[A-Za-z0-9_-]{20,}/, /\bAIza[0-9A-Za-z_-]{35}/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/, /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, /^\+(?!.*(?:getenv|process\.env|ENV\[|environ|properties\.get)).*\b(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|storepass|keypass)\w*\s*[:=]\s*["']?(?![\s"'$<{(]|\w*(?:null|none|example|changeme|xxx|your))[^\s"']{8,}/im];
// Why a set of changes shouldn't go up unseen, or "" when nothing looks like a secret.
function secretIn(files, diff) {
  const f = (files || []).find((x) => SECRET_FILE.test(x.file)); if (f) return `${f.file} looks like a key or credentials file`;
  return SECRET_TEXT.some((re) => re.test(String(diff || ""))) ? "the changes contain something that looks like a key, token or password" : "";
}
const HELD_HANDED = new Map(); // path -> { sig, why, at }: what was held back or failed, so it isn't tried every 20 s
const sigOf = (files) => (files || []).map((x) => x.st + x.file).sort().join("|");
function handedFor(path, { ledger = loadLedger(), now = Date.now() } = {}) {
  return ledger.handoffs.filter((x) => x.from && x.from.path === path && x.status !== "error" && !x.skipped && now - (x.at || 0) < HANDED_FOR);
}
// The handoff behind a lane's pending changes: { text, to, held? }, or null when none of its own made them.
function handedLookup(path, wc, { ledger, now = Date.now() } = {}) {
  const rows = handedFor(path, { ledger, now }); if (!rows.length) return null;
  const last = rows[rows.length - 1], h = HELD_HANDED.get(path), held = h && h.sig === sigOf(wc && wc.files) ? h.why : "";
  return { text: clipWords(String(last.text || "").split("\n")[0], 120), to: last.to.lane, ...(held ? { held } : {}) };
}
setHandedLookup((path, wc) => handedLookup(path, wc));
// One pass (the app runs it every 20 seconds): ship the lanes' handed-over changes. Returns what it did.
async function shipHanded({ review = pendingReview, ship = approveChanges, diff = workingDiff, running = runningHandoff, ledger = loadLedger(), now = Date.now() } = {}) {
  const done = [];
  for (const r of review({ kept: true })) {
    if (!r.untasked || !r.path || r.running || r.unsent || !(r.files || []).length || r.round) continue;
    const rows = handedFor(r.path, { ledger, now }); if (!rows.length) continue;
    if (rows.some((x) => x.to.path && running(x.to.path)) || running(r.path)) continue; // the run that made them isn't over
    const sig = sigOf(r.files), had = HELD_HANDED.get(r.path);
    if (had && had.sig === sig && now - had.at < HELD_AGAIN) continue;
    const why = secretIn(r.files, diff(r.path));
    if (why) { HELD_HANDED.set(r.path, { sig, why: `${why}: check it before it goes up`, at: now }); done.push({ repo: r.repo, held: why }); continue; }
    const res = await ship(r.repo, { autoMerge: true });
    if (res.error) { HELD_HANDED.set(r.path, { sig, why: `it didn't go up by itself: ${res.error}`, at: now }); done.push({ repo: r.repo, error: res.error }); }
    else { HELD_HANDED.delete(r.path); done.push({ repo: r.repo, pr: res.pr || "", commit: res.commit || "" }); }
  }
  return done;
}

export { projectOf, handedFor, handedLookup, secretIn, shipHanded, HELD_HANDED, nearLane, laneTarget, staleOutcome, STALE_AFTER, ancestry, loops, shareAnswer, sharedFor, sharedTo, answerReaches, linkedPaths, topicsOf, ownHosts, COMMON_HOSTS, parentOf, SHARED, LEDGER, MAX_CHAIN, loadLedger, laneOf, lastRunStart, dispatch, outcome, report, handingOf, lanesTick, lanesState, stageOf, underWay, aboutIt, partlyDone, remoteKey, orcaMoves, orcaRelink, stuckHandovers, allowHandover, skipHandover, namedDirs, alike, doneSince };
