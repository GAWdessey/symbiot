// A run that stops making progress is handled by Symbiot itself (stall.mjs, agents.mjs
// runsTick): 19 Oct 2026, the symbiot lane's run sat 30+ minutes on one check with 7
// tasks behind it, and Home only labelled it "(no progress in 30 min)". A fake stalled
// run (a sleeping process, a stream log whose last step is old): stopped and started again
// once with a note on where it stuck; stalled again, its lane paused and one urgent card
// on Home with Start it again / Leave it paused. Isolated HOME, throwaway folders.
//
//   node test/stall.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-stall-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const { parseRun } = await import("../work.mjs");
const { stalledFor, whereStuck, loadStall, STALL_FILE } = await import("../stall.mjs");
const { runsTick } = await import("../agents.mjs");
const { troubles, homeAnswer } = await import("../home.mjs");

const sleeper = () => spawn(process.execPath, ["-e", "setInterval(() => {}, 1e9)"], { detached: true, stdio: "ignore" });
const gone = (pid) => { try { process.kill(pid, 0); return false; } catch (e) { return e.code !== "EPERM"; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (t) => new Date(t).toISOString();
const said = (t, text) => JSON.stringify({ type: "assistant", timestamp: iso(t), message: { content: [{ type: "text", text }] } });
const call = (t, id, cmd) => JSON.stringify({ type: "assistant", timestamp: iso(t), message: { content: [{ type: "tool_use", id, name: "Bash", input: { command: cmd, description: cmd } }] } });
const back = (t, id) => JSON.stringify({ type: "user", timestamp: iso(t), message: { content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] } });
const thinking = JSON.stringify({ type: "system", subtype: "thinking_tokens", estimated_tokens: 150 });
const log = (lines) => ["=== symbiot " + iso(Date.now()) + " ===", "$ claude -p ...", "", ...lines].join("\n") + "\n";
const kids = [];

try {
  console.log("WHAT A STALL IS — no new step, with nothing of its own still going");
  const t0 = Date.now(), min = 60000, at = (m) => ({ now: t0 + m * min, startedAt: t0, stallMs: 20 * min, hangMs: 45 * min });
  const idle = parseRun(log([said(t0, "Checking the rest of the path with a one-option question:"), call(t0, "a", "grep -n labels plain.mjs"), back(t0, "a"), thinking, thinking]));
  ok("thinking with no step for 25 minutes is a stall (its log still grows, so the hang rule never saw it)", stalledFor(idle, at(25)) === 25, stalledFor(idle, at(25)));
  ok("…but not at 15", stalledFor(idle, at(15)) === 0);
  const inFlight = parseRun(log([said(t0, "Running the full suite"), call(t0, "b", "npm test")]));
  ok("a command still running isn't a stall at 25 minutes (a full test suite runs 15)", stalledFor(inFlight, at(25)) === 0);
  ok("…until the hang time (45 min)", stalledFor(inFlight, at(50)) === 50);
  const bg = parseRun(log([call(t0, "c", "npm test"), JSON.stringify({ type: "system", subtype: "task_started", task_id: "k1", is_backgrounded: true }), back(t0, "c"), said(t0, "Waiting for the suite.")]));
  ok("a command it left running in the background counts as still going", bg.bg === 1 && stalledFor(bg, at(25)) === 0, bg.bg);
  const bgDone = parseRun(log([call(t0, "c", "npm test"), JSON.stringify({ type: "system", subtype: "task_started", task_id: "k1", is_backgrounded: true }), back(t0, "c"), JSON.stringify({ type: "system", subtype: "task_notification", task_id: "k1", status: "completed" })]));
  ok("…until it reports back", bgDone.bg === 0 && stalledFor(bgDone, at(25)) === 25);
  ok("a plain log (another agent, no steps in it) is left to the hang rule", stalledFor(parseRun("=== x ===\n$ aider\n\nhello\n"), at(60)) === 0);
  ok("a run that's said its last words isn't stalled", stalledFor(parseRun(log([JSON.stringify({ type: "result", result: "done" })])), at(60)) === 0);
  const w = whereStuck(idle, "# Tasks\n- [x] done one\n- [ ] Fix the stuck agent flaw\n- [ ] Next\n");
  ok("where it got stuck: what it said it was doing, its last step and the item", /one-option question/.test(w.where) && /grep -n labels/.test(w.step) && w.task === "Fix the stuck agent flaw", w);

  console.log("THE FIRST STALL — stopped, started again once, with a note to skip that step");
  const repo = mkdtempSync(join(tmpdir(), "symbiot-stall-repo-")), sym = join(repo, ".symbiot"); mkdirSync(sym);
  writeFileSync(join(sym, "TASKS.md"), "# Tasks\n- [ ] Fix the stuck agent flaw\n- [ ] Second task\n");
  writeFileSync(join(CFG, "runs.json"), JSON.stringify([{ path: repo, name: "symbiot", startedAt: t0 }]));
  const run1 = sleeper(); kids.push(run1);
  writeFileSync(join(sym, "agent.pid"), JSON.stringify({ pid: run1.pid, id: "run1", startedAt: Date.now() - 1000, owner: 1 }));
  writeFileSync(join(sym, "agent.log"), log([said(Date.now(), "Checking the rest of the path (option filters, labels, answering) with a one-option question:"), call(Date.now(), "d", "grep -n labels plain.mjs"), back(Date.now(), "d"), thinking]));
  const started = [], parked = [];
  const deps = (m, more = {}) => ({ now: Date.now() + m * min, hang: 45 * min, stall: 20 * min, start: (p) => { started.push(p); return { id: "run2" }; }, park: (p, on) => parked.push([p, on]), ...more });
  const early = runsTick(deps(10));
  ok("ten minutes in: left alone", !early.stalled.length && !gone(run1.pid), early);
  const t1 = runsTick(deps(25));
  ok("25 minutes with no step: stopped as stalled", t1.stalled.includes(repo) && t1.stopped.includes(repo), t1);
  for (let i = 0; i < 40 && !gone(run1.pid); i++) await wait(100);
  ok("its process got the signal", gone(run1.pid));
  const rec1 = loadStall(repo);
  ok("the record: first stall, to start again, naming where it stuck", rec1 && rec1.count === 1 && rec1.restart === true && /one-option question/.test(rec1.where) && rec1.task === "Fix the stuck agent flaw" && rec1.run === "run1", rec1);
  ok("its log says why", /stopped by Symbiot .*no progress for 25 minutes, stuck on: .*one-option question/.test(readFileSync(join(sym, "agent.log"), "utf8")));
  const carry = readFileSync(join(sym, "CARRYON.md"), "utf8");
  ok("the next run's note names where it stuck and says to skip that step and keep the changes", /Where it got stuck: .*one-option question/.test(carry) && /Skip that step/.test(carry) && /changes are still in the folder/.test(carry) && /The item it was on: Fix the stuck agent flaw/.test(carry), carry);
  ok("and ANSWERS.md says so too, for a run that resumes instead", /### From Symbiot: your last run got stuck\n.*one-option question/.test(readFileSync(join(sym, "ANSWERS.md"), "utf8")));
  ok("nothing parked the first time", !parked.length, parked);
  ok("its changes aren't touched (TASKS.md as it was)", /- \[ \] Fix the stuck agent flaw/.test(readFileSync(join(sym, "TASKS.md"), "utf8")));
  try { rmSync(join(sym, "agent.pid")); } catch {} // its exit took the lock
  const t2 = runsTick(deps(26));
  ok("once it's gone: started again, once", started.length === 1 && started[0] === repo && t2.restarted.includes(repo), [started, t2]);
  ok("…and the record says so", loadStall(repo).restart === false && loadStall(repo).rerun === "run2");
  runsTick(deps(27));
  ok("the next minute doesn't start it a second time", started.length === 1);

  console.log("THE SECOND STALL — its lane paused, and one urgent card for you");
  const run2 = sleeper(); kids.push(run2);
  writeFileSync(join(sym, "agent.pid"), JSON.stringify({ pid: run2.pid, id: "run2", startedAt: Date.now() - 1000, owner: 1 }));
  writeFileSync(join(sym, "agent.log"), log([said(Date.now(), "Checking the option labels once more"), thinking]));
  const t3 = runsTick(deps(30));
  ok("stalled again: stopped", t3.stalled.includes(repo), t3);
  for (let i = 0; i < 40 && !gone(run2.pid); i++) await wait(100);
  const rec2 = loadStall(repo);
  ok("the record: second stall, a card, no restart", rec2.count === 2 && rec2.card === true && !rec2.restart, rec2);
  ok("its lane is paused, so its queued tasks don't start the same stuck run", parked.length === 1 && parked[0][0] === repo && parked[0][1] === true, parked);
  try { rmSync(join(sym, "agent.pid")); } catch {}
  runsTick(deps(31));
  ok("and nothing starts it again by itself", started.length === 1);
  const stalls = [{ path: repo, card: true, run: "run2", where: rec2.where, task: rec2.task }];
  const failed = { path: repo, id: "run2", status: "failed", exitCode: 143, endedAt: Date.now(), tail: "Terminated" };
  const cards = troubles({ stalls, list: [failed], map: { symbiot: repo }, named: (p, n) => n });
  ok("Home: one urgent card naming the agent and what it stuck on", cards.length === 1 && cards[0].urgent && cards[0].fix === "stalled" && /symbiot/.test(cards[0].title) && /option labels/.test(cards[0].q) && cards[0].options.length === 2, cards);
  ok("…with a real choice, not a label: start it again (recommended) or leave it paused", /Start it again.*\(recommended\)/.test(cards[0].options[0]) && /Leave it paused/.test(cards[0].options[1]));
  ok("the run Symbiot stopped doesn't also show as a run that failed", !cards.some((c) => c.fix === "failed"));
  ok("the first stall (restarting by itself) has no card", troubles({ stalls: [{ path: repo, card: false, run: "run1" }], list: [{ ...failed, id: "run1" }], map: { symbiot: repo }, named: (p, n) => n }).length === 0);

  console.log("YOUR ANSWER ON THE CARD");
  const ran = [], unparked = [];
  const ans = { running: () => null, park: (p, on) => unparked.push([p, on]), run: (p) => { ran.push(p); return { id: "run3" }; } };
  const no = homeAnswer("stalled:" + repo, { pick: 1 }, ans);
  ok("Leave it paused: stays paused, card gone", no.ok && !ran.length && !unparked.length && loadStall(repo).card === false, no);
  writeFileSync(join(sym, STALL_FILE), JSON.stringify(rec2));
  const go = homeAnswer("stalled:" + repo, { pick: 0 }, ans);
  ok("Start it again: unpaused and started", go.ok && ran[0] === repo && unparked[0][0] === repo && unparked[0][1] === false, go);
  ok("…told to leave that item and carry on with the others", /stalled twice on: .*option labels.*Leave that item unticked/.test(readFileSync(join(sym, "ANSWERS.md"), "utf8")));
  ok("…and the card's gone", loadStall(repo).card === false);
  ok("answering a card that's gone says so", !!homeAnswer("stalled:" + repo, { pick: 0 }, ans).error);
  rmSync(repo, { recursive: true, force: true });
} finally {
  for (const k of kids) { try { process.kill(-k.pid, "SIGKILL"); } catch {} try { k.kill("SIGKILL"); } catch {} }
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
