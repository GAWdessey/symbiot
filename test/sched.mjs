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
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
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
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} sched: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
