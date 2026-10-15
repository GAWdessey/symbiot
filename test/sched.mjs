// Run scheduling (agents.mjs, lanes.mjs): fewer pointless runs, no run killed for no
// reason, nothing that just stops. From the 15 Oct 2026 recon: Claude down (a session
// limit, an expired sign-in) relaunched the same lanes every few seconds; a handover's
// report or a shared answer forced a run in a lane with nothing open; ops runs that
// came up empty were never held (the guard needed git); continueLanes took reworded
// tasks for new ones; a lane's handover chain counted unrelated hops; ~ in the sandbox.
// Isolated HOME (set before the modules load); no agent is started.
//
//   node test/sched.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-sched-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const C = join(HOME, ".config", "symbiot");
mkdirSync(C, { recursive: true });
// a stand-in `claude` first on PATH: a start that slips through must never reach the real one
const BIN = join(HOME, "bin"); mkdirSync(BIN); writeFileSync(join(BIN, "claude"), '#!/bin/sh\necho \'{"type":"result","subtype":"success","is_error":false,"result":"stand-in","total_cost_usd":0,"num_turns":1}\'\n'); spawnSync("chmod", ["755", join(BIN, "claude")]);
process.env.PATH = BIN + ":" + process.env.PATH; process.env.SYMBIOT_CLAUDE_CMD = join(BIN, "claude");
writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")], agentCmd: 'claude -p "{prompt}"', agentSandbox: false }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const put = (dir, f, text) => { mkdirSync(join(dir, ".symbiot"), { recursive: true }); writeFileSync(join(dir, ".symbiot", f), text); };
const read = (dir, f) => { try { return readFileSync(join(dir, ".symbiot", f), "utf8"); } catch { return ""; } };
const git = (cwd, ...a) => spawnSync("git", ["-C", cwd, "-c", "user.email=t@t", "-c", "user.name=t", ...a], { encoding: "utf8" });
// a finished run's log: its header, its command, and what Claude's result line said
const logOf = (cmd, result, { ok: fine = true, cost = 0, at = new Date() } = {}) => `\n=== lane ${at.toISOString()} ===\n$ ${cmd}\n${JSON.stringify({ type: "system", subtype: "init", model: "claude-sonnet-5-5" })}\n${JSON.stringify({ type: "result", subtype: "success", is_error: !fine, result, total_cost_usd: cost, num_turns: fine ? 3 : 1 })}\n`;

const a = await import("../agents.mjs");

try {
  console.log("1) CLAUDE DOWN — every start pauses until it's back, and starts come a few seconds apart");
  const now = Date.now() + 120000; // a little ahead: the pause it makes must still hold when runHandoff reads the clock
  const lim = a.claudeDownIn("You've hit your session limit · resets 8:50am (Africa/Johannesburg)", now);
  ok("a session limit is read, with when it resets", lim && lim.kind === "limit" && lim.resets === "8:50am" && new Date(lim.until).getHours() === 8 && new Date(lim.until).getMinutes() === 51, lim);
  ok("a reset time already past today is tomorrow's", a.resetTime("3am", now) > now && new Date(a.resetTime("3am", now)).getDate() === new Date(now).getDate() + 1, a.resetTime("3am", now));
  ok("an unreadable reset time falls back to an hour", a.claudeDownIn("session limit · resets soon", now).until === now + 3600000, a.claudeDownIn("session limit · resets soon", now));
  ok("an expired sign-in is read", (a.claudeDownIn("Failed to authenticate: OAuth session expired and could not be refreshed") || {}).kind === "auth");
  ok("two runs refreshing one token is read", (a.claudeDownIn("Failed to refresh OAuth token: another Claude Code process is refreshing") || {}).kind === "refresh");
  ok("a run that worked isn't Claude down", a.claudeDownIn("Done: I added the session limit regex and ticked the task.") === null);

  const lane = join(HOME, "work", "coral"); mkdirSync(lane, { recursive: true }); git(lane, "init", "-q");
  put(lane, "TASKS.md", "## Tasks\n- [ ] Fix the reader\n");
  put(lane, "agent.log", logOf('claude -p "x"', "You've hit your session limit · resets 8:50am (Africa/Johannesburg)", { ok: false }));
  ok("a run that ended on the limit pauses every start", a.noteClaudeDown(lane, now) === "limit" && existsSync(a.PAUSE_FILE), read(C, "paused.json"));
  const p1 = a.claudePause({ now });
  ok("the pause says why and until when, in plain words", p1 && p1.kind === "limit" && /session limit is used up \(it resets 8:50am\), so no run starts before/.test(p1.note), p1);
  const r1 = a.runHandoff(lane);
  ok("runHandoff starts nothing while it holds, forced or not", r1 && r1.blocked && r1.down === "limit" && a.runHandoff(lane, { force: true }).down === "limit", r1);
  ok("…and the pause lifts once the time is past", a.claudePause({ now: lim.until + 1 }) === null && !existsSync(a.PAUSE_FILE));
  put(lane, "agent.log", logOf('claude -p "x"', "I added the session limit regex and ticked the task.", { ok: true, cost: 0.4 }));
  ok("a run that worked and merely mentioned a limit pauses nothing", a.noteClaudeDown(lane, now) === "" && !existsSync(a.PAUSE_FILE));
  put(lane, "agent.log", logOf('claude -p "x"', "Failed to authenticate: OAuth session expired and could not be refreshed", { ok: false }));
  ok("an expired sign-in pauses until Claude Code is signed in again", a.noteClaudeDown(lane, now) === "auth" && (a.claudePause({ now, ready: () => false }) || {}).kind === "auth" && /Sign in to Claude Code again/.test(a.claudePause({ now, ready: () => false }).note));
  ok("…asked once a minute, not on every tick", a.claudePause({ now: now + 1000, ready: () => { throw new Error("asked again"); } }).kind === "auth");
  ok("…and lifts once it is", a.claudePause({ now: now + 61000, ready: () => true }) === null && !existsSync(a.PAUSE_FILE));
  const t0 = Date.now() + 600000, g0 = a.startGap(t0), g1 = a.startGap(t0), g2 = a.startGap(t0), g3 = a.startGap(t0 + 60000);
  ok("starts in one tick are spaced a few seconds apart; a later one isn't held", g0 === 0 && g1 === 3000 && g2 === 6000 && g3 === 0, [g0, g1, g2, g3]);
  const { homeState } = await import("../home.mjs");
  writeFileSync(a.PAUSE_FILE, JSON.stringify({ kind: "limit", why: "Claude's session limit is used up", until: Date.now() + 3600000, resets: "8:50am" }));
  const hs = homeState({ fresh: true });
  const card = (hs.you || []).find((c) => c.id === "setup:claude");
  ok("Home shows one card for it", card && /Claude is out/.test(card.title) && /session limit/.test(card.sub), (hs.you || []).map((c) => c.id));
  rmSync(a.PAUSE_FILE, { force: true });

  console.log("2) POINTLESS RUNS — a time-gated task waits for its time; notes aren't answers; empty ops runs are held; a reworded task is the same task");
  const { waitUntil, RECHECK } = await import("../work.mjs");
  const t = Date.parse("2026-10-14T06:15:00"), at = (ms) => { const d = new Date(ms); return `${d.getDate()} Oct ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; }; // local time, as the run's own clock
  ok("\"at 08:50\" is 08:50 today", at(waitUntil("Nothing to do yet: the templates are still pending. I'll check again at 08:50.", t)) === "14 Oct 8:51", at(waitUntil("check again at 08:50", t)));
  ok("\"until week 1 closes tomorrow, 15 Oct\" is the 15th", at(waitUntil("Nothing is due until week 1 closes tomorrow, 15 Oct.", t)) === "15 Oct 8:00", at(waitUntil("Nothing is due until week 1 closes tomorrow, 15 Oct.", t)));
  ok("\"before week 1 ends on 15 October\" too", at(waitUntil("Waiting for the clip, once it's closed, before week 1 ends on 15 October.", t)) === "15 Oct 8:00");
  ok("\"in 2 hours\"", waitUntil("The switch is pending; I'll check again in 2 hours.", t) === t + 7200000);
  ok("\"once X is live\" with no time is a recheck in a few hours, not every few minutes", waitUntil("Nothing to do until the WhatsApp number switch is live; waiting on Meta.", t) === t + RECHECK);
  ok("a run that isn't waiting gives no time", waitUntil("Done: fixed the reader and ticked the task.", t) === 0);

  // the lane's tasks are all ticked: a handover's report isn't news, the user's answer is
  put(lane, "TASKS.md", "## Tasks\n- [x] Fix the reader\n");
  put(lane, "ANSWERS.md", "# Answers\n");
  writeFileSync(join(lane, ".symbiot", a.ANSWERS_SEEN), JSON.stringify({ at: Date.now(), answers: a.answersDigest(lane) }));
  ok("every task ticked, nothing answered: nothing to do", /every task in coral's .symbiot\/TASKS.md is ticked and no answer has come in/.test(a.nothingToDo(lane)), a.nothingToDo(lane));
  put(lane, "ANSWERS.md", read(lane, "ANSWERS.md") + "\n### Handed over to ops: restart the relay\nDone (the ops agent).\n_answered by symbiot (handover) 2026-10-15_\n");
  ok("a handover's report back isn't an answer: still nothing to do", !!a.nothingToDo(lane) && !a.newAnswers(lane));
  put(lane, "ANSWERS.md", read(lane, "ANSWERS.md") + "\n### Garth's answer to ops, on the same work as you\nbackground\n_shared by Symbiot 2026-10-15 (background)_\n");
  ok("nor a shared answer in the background", !!a.nothingToDo(lane));
  put(lane, "ANSWERS.md", read(lane, "ANSWERS.md") + "\n### Which relay?\nThe SMTP one.\n_answered 2026-10-15_\n");
  ok("the user's own answer is", a.nothingToDo(lane) === "" && a.newAnswers(lane));

  // an ops folder (no git): a run that changed nothing is held, until the time it named
  const ops = join(C, "drafts", "act-abc123"); mkdirSync(ops, { recursive: true });
  put(ops, "TASKS.md", "## Tasks\n- [ ] Once production Dailify's WhatsApp number switch is live, move the templates\n");
  put(ops, "agent.log", logOf('claude -p "x"', "Nothing to do yet: the number switch isn't live. I'll check again at 08:50.", { ok: true, cost: 0.2 }));
  const before = a.dirtyState(ops), ticks = 0;
  ok("a folder with no git still has a state to compare (its files, Symbiot's bookkeeping aside)", before && Object.keys(before).join() === ".symbiot/TASKS.md", before);
  a.noteBlocked(ops, 'claude -p "x"', Date.now() - 60000, 0, { dirtyBefore: before, ticksBefore: ticks });
  const b1 = JSON.parse(read(ops, "blocked.json") || "null");
  ok("an empty ops run is held, with when it said to look again", b1 && b1.empty && b1.until > Date.now() && new Date(b1.until).getHours() === 8, b1);
  const held = a.blockedAgain(ops, 'claude -p "x"');
  ok("…so the next trigger starts nothing, and the note says when it will", held && held.empty && /It starts again at .*8:51/.test(held.note), held);
  ok("…until that time comes", a.blockedAgain(ops, 'claude -p "x"', { now: b1.until + 1 }) === null);
  put(ops, "REPORT.md", "# What I found\n");
  ok("a run that wrote a report isn't empty", a.noteBlocked(ops, 'claude -p "x"', Date.now() - 60000, 0, { dirtyBefore: before, ticksBefore: ticks }) === undefined && !existsSync(join(ops, ".symbiot", "blocked.json")));

  // continueLanes: the agent reworded the open task; it's the same task, not a new one
  const lane2 = join(HOME, "work", "steve"); mkdirSync(join(lane2, ".symbiot"), { recursive: true });
  put(lane2, "TASKS.md", "## Tasks\n- [ ] Add the weekly digest email, with a test\n");
  put(lane2, "agent.log", "=== steve 2026-10-15T05:00:00.000Z ===\n$ x\n");
  const runs = () => [{ path: lane2, name: "steve", startedAt: 1 }], started = [];
  const go = (p) => { started.push(p); return { id: "j" + started.length }; };
  const later = Date.now() + 10 * 60000;
  ok("a lane with an open task starts again", a.continueLanes({ now: later, run: go, runs }).length === 1, started);
  put(lane2, "TASKS.md", "## Tasks\n- [ ] Add the weekly digest email, with a test — in progress: the template is done, the send is next\n");
  ok("…not again when its agent only reworded the task", a.continueLanes({ now: later + 1, run: go, runs }).length === 0, started);
  put(lane2, "TASKS.md", "## Tasks\n- [ ] Add the weekly digest email, with a test\n- [ ] Fix the sign-in page on phones\n");
  ok("…but again on a task it didn't have", a.continueLanes({ now: later + 2, run: go, runs }).length === 1, started);

  console.log("3) ANSWER FAN-OUT — mail domains and everyone's hosts aren't topics; a background share doesn't look like an answer");
  const { topicsOf, ownHosts, shareAnswer } = await import("../lanes.mjs");
  const tp = topicsOf("mail garth@gmail.com about claude.ai, github.com and evra_avm on dailify.co.za and 10.0.0.12", ownHosts({ profile: { email: "garth@ghost-ai.co.za" } }));
  ok("an id, a domain and an address are topics; an email's domain, claude.ai and github.com aren't", [...tp].sort().join(" ") === "10.0.0.12 dailify.co.za evra_avm", [...tp]);
  ok("the user's own domain isn't one either", !topicsOf("the ghost-ai.co.za mailbox", ownHosts({ profile: { email: "garth@ghost-ai.co.za" } })).size && ownHosts({ profile: { email: "garth@ghost-ai.co.za" } }).has("ghost-ai.co.za"));
  const asker = join(HOME, "work", "evra"), bystander = join(HOME, "work", "voxi");
  for (const d of [asker, bystander]) mkdirSync(join(d, ".symbiot"), { recursive: true });
  put(asker, "QUESTIONS.md", "## Questions\n### Send the Supabase ticket about evra_avm now?\n- yes\n- no\n");
  put(bystander, "TASKS.md", "## Tasks\n- [ ] Tidy the evra_avm export script\n"); put(bystander, "ANSWERS.md", "# Answers\n");
  const old = Date.now() - 3600000; utimesSync(join(bystander, ".symbiot", "ANSWERS.md"), new Date(old), new Date(old));
  const sh = shareAnswer(asker, [{ q: "Send the Supabase ticket about evra_avm now?", a: "first check if evra_avm is saved somewhere else" }], { run: () => ({ id: "no" }), map: { evra: asker, voxi: bystander }, runs: () => [{ path: asker }, { path: bystander }], running: () => null, ledger: { handoffs: [] }, cfg: {} });
  ok("a lane matched only on a task's words gets the answer as background, and starts nothing", sh.length === 1 && sh[0].path === bystander && !sh[0].started && /\(background\)/.test(read(bystander, "ANSWERS.md")), sh);
  ok("…and its ANSWERS.md keeps its time, so it isn't an answer since the last run", Math.abs(statSync(join(bystander, ".symbiot", "ANSWERS.md")).mtimeMs - old) < 1000, statSync(join(bystander, ".symbiot", "ANSWERS.md")).mtimeMs - old);

  console.log("4) QUESTIONS THAT VANISHED — every ops folder with an open question is listed, not just the 60 newest runs");
  const oldOps = join(C, "drafts", "act-old12345"); mkdirSync(join(oldOps, ".symbiot"), { recursive: true });
  put(oldOps, "handoff.json", JSON.stringify({ name: "Agent: submit the Google app for verification" }));
  put(oldOps, "TASKS.md", "## Tasks\n- [ ] Submit the Google app for verification\n");
  put(oldOps, "QUESTIONS.md", "## Questions\n### Which Google account owns the app?\nIt needs the owner.\n- 👤 You (only you: your account): say which\n- Skip this part\n");
  put(oldOps, "agent.log", logOf('claude -p "x"', "Asked in QUESTIONS.md which account owns the app.", { ok: true, cost: 0.1, at: new Date(Date.now() - 5 * 86400000) }));
  const answeredOps = join(C, "drafts", "act-done6789"); mkdirSync(join(answeredOps, ".symbiot"), { recursive: true });
  put(answeredOps, "QUESTIONS.md", "## Questions\n### Send it now?\n- yes\n- no\n"); put(answeredOps, "ANSWERS.md", "# Answers\n### Send it now?\nyes\n_answered 2026-10-10_\n");
  const qf = a.questionFolders(Date.now() + 60000); // past the 30 s the list is kept (Home listed it in 1)
  ok("a folder with a question still open is found, named, dated from its run; an answered one isn't", qf.length === 1 && qf[0].path === oldOps && /Google app/.test(qf[0].name) && qf[0].startedAt > 0, qf);
  const er = a.earlierRuns().find((r) => r.path === oldOps);
  ok("…and listed like a run from before the app started, question and all", er && er.earlier && er.ask.questions.length === 1 && /Which Google account/.test(er.ask.questions[0].q), er && er.ask);
  ok("…so it can be answered", a.knownRun(oldOps) && a.answerQuestions(oldOps, [{ q: "Which Google account owns the app?", a: "the ops one" }]).ok);
  ok("the listing is cached (reread every 30 s, a folder only when its files changed)", a.questionFolders(Date.now() + 60001) === qf);

  console.log("5) THE SANDBOX — ~ as a knowledge folder never opens all of home, nor Symbiot's or Claude's settings");
  writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")], agentCmd: 'claude -p "{prompt}"', knowledgeFolders: [{ path: HOME }, { path: join(HOME, "Company") }] }));
  mkdirSync(join(HOME, "Company"), { recursive: true }); mkdirSync(join(HOME, "Downloads"), { recursive: true });
  ok("wideRoot: ~, /, ~/.config and ~/.claude are wide; a project folder or ~/Company isn't", a.wideRoot(HOME) && a.wideRoot("/") && a.wideRoot(join(HOME, ".config")) && a.wideRoot(join(HOME, ".claude")) && !a.wideRoot(join(HOME, "Company")) && !a.wideRoot(lane));
  const W = a.sandboxWrites(lane, `claude -p "x" --add-dir "${HOME}"`);
  ok("a run's writable folders: its repo, ~/Company and the caches, never ~", W[0] === lane && W.includes(join(HOME, "Company")) && !W.includes(HOME), W);
  const D = a.sandboxDenies([lane, join(C, "screens")]);
  ok("its commands can't write Symbiot's own files (config, tasks, the sandbox folder) nor Claude's, while screens/ it was given stays open", D.includes(join(C, "config.json")) && D.includes(join(HOME, ".claude")) && D.includes(join(HOME, ".claude.json")) && !D.includes(join(C, "screens")) && !D.some((d) => d === C), D);
  const scoped = a.withScope('claude -p "{prompt}"', lane);
  ok("--add-dir (read and write) gets ~/Company but never ~", scoped.includes(`--add-dir "${join(HOME, "Company")}"`) && !scoped.includes(`--add-dir "${HOME}"`), scoped);
  ok("inWork: ~/Company is the user's work; ~/Downloads and ~/x.sh aren't, with ~ as a knowledge folder", a.inWork(join(HOME, "Company", "notes.md")) && !a.inWork(join(HOME, "Downloads")) && !a.inWork(join(HOME, "x.sh")) && !a.inWork(join(HOME, ".claude", "settings.json")));

  console.log("6) ONE AGENT PER FOLDER — the folder is claimed before the slow part; held-back runs stay held from every path");
  const lk = join(lane, ".symbiot", "agent.pid");
  ok("a claim takes the folder: runningHandoff says busy, runHandoff starts nothing", a.claimLock(lk) && (a.runningHandoff(lane) || {}).claim === true && a.runHandoff(lane, { force: true }).busy === true, a.runningHandoff(lane));
  ok("…and can't be claimed twice", !a.claimLock(lk));
  writeFileSync(lk, JSON.stringify({ claim: true, owner: 2147483646, startedAt: Date.now() }));
  ok("a claim whose process is gone is stale: taken over", a.claimLock(lk) && JSON.parse(readFileSync(lk, "utf8")).owner === process.pid);
  writeFileSync(lk, JSON.stringify({ claim: true, owner: process.pid, startedAt: Date.now() - 120000 }));
  ok("…as is one older than a minute (its start never followed)", a.runningHandoff(lane) === null && a.claimLock(lk));
  rmSync(lk, { force: true });
  put(lane, "TASKS.md", "## Tasks\n- [ ] Fix the reader\n"); put(lane, "QUESTIONS.md", "## Questions\n### Which reader?\n- a\n- b\n");
  writeFileSync(join(lane, ".symbiot", "QUESTIONS.md"), read(lane, "QUESTIONS.md"));
  a.noteBlocked(lane, a.runCmdOf(lane), Date.now() - 60000, 0, { dirtyBefore: {}, ticksBefore: 0 });
  ok("a run held on its questions is held by continueLanes too: both hash the same command (the guard was dead before)", !!a.blockedAgain(lane, a.runCmdOf(lane)) && a.continueLanes({ now: Date.now() + 10 * 60000, run: () => { throw new Error("started"); }, runs: () => [{ path: lane, name: "coral", startedAt: 1 }] }).length === 0);
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} sched: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
