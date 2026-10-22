// A run's record (agents.mjs runOutcome, jobs.mjs): how a run ended is worked out once, when it
// ends, and every screen and restart reads that one record, instead of each guessing from ticks,
// last words and the questions file and disagreeing (21 Oct 2026). Isolated HOME; no agent starts.
//
//   node test/outcome.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-outcome-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const C = join(HOME, ".config", "symbiot"); mkdirSync(C, { recursive: true });
writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")], agentCmd: 'claude -p "{prompt}"', agentSandbox: false }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const A = await import("../agents.mjs");
const J = await import("../jobs.mjs");
const L = await import("../lanes.mjs");

const lane = join(HOME, "work", "bookly"); mkdirSync(join(lane, ".symbiot"), { recursive: true });
const put = (f, t) => writeFileSync(join(lane, ".symbiot", f), t);
const none = { files: 0, final: "", questions: [], waiting: null, needs: null };
const end = (tasks, o = {}, code = 0) => { put("TASKS.md", tasks); return A.runOutcome(lane, { id: "x", startedAt: 0 }, code, { ...none, ...o }); };
try {
  console.log("OUTCOME — one state for how a run ended");
  ok("a question of the user's: waiting on the user, with the question", (() => { const r = end("- [x] a\n", { questions: [{ q: "Which plan?" }] }); return r.state === "waiting" && r.waitingOn === "user" && r.what === "Which plan?"; })());
  ok("a step of theirs (a need from its words): waiting on the user", end("- [x] a\n", { needs: { what: "press Set up a meeting" } }).waitingOn === "user");
  put("HANDOFF.md", "### ops\nRead the delivered count.\n");
  const l = end("## Tasks\n- [x] a\n- [~] (waits on ops: the delivered count read) Find the 16 Oct count\n");
  ok("a [~] item handed to a lane: waiting on that lane, saying what", l.state === "waiting" && l.waitingOn === "lane" && /^ops: the delivered count read$/.test(l.what) && l.task === "Find the 16 Oct count", l); // the note without its "waits on", and the job beside it
  put("HANDOFF.md", "");
  ok("…on a reply from outside: waiting on a third party", end("- [~] (waits on Dana's reply to the redirect email) QA\n").waitingOn === "third party");
  ok("…on a time: waiting on the time", end("- [~] (stays waiting until 10:38 tomorrow) the window\n").waitingOn === "time");
  ok("…on the user's own step: waiting on them", end("- [~] (waits on the user unparking the lanes) restart\n").waitingOn === "user");
  const p = end("- [~] (waits on Dana's reply) QA\n- [ ] the footer\n");
  ok("a waiting item with other work left: paused (it carries on with that), what it waits on kept", p.state === "paused" && /Dana/.test(p.what), p);
  ok("open items, nothing waiting: paused", end("- [x] a\n- [ ] b\n").state === "paused");
  ok("files changed, every item done: review, for Approve", (() => { const r = end("- [x] a\n", { files: 3 }); return r.state === "review" && r.waitingOn === "user"; })());
  ok("nothing left: done", end("- [x] a\n").state === "done");
  ok("an error exit: failed", end("- [ ] a\n", {}, 1).state === "failed");
  ok("stopped on purpose (SIGTERM: a stall, Stop, an update): not failed", end("- [ ] a\n", {}, 143).state === "paused" && end("- [x] a\n", {}, null).state === "done");
  ok("its summary: the first paragraph of its own last words, plain", end("- [x] a\n", { final: "**The fix is live.** All 46 cases passed.\n\nDetails here." }).summary === "The fix is live. All 46 cases passed.");

  console.log("OUTCOME — the record, and what reads it");
  J.track("run:r1", { kind: "agent", lane: "bookly", path: lane, text: "bookly", state: "running" }, { now: 1000 });
  J.track("run:r1", { ...l, outcome: true }, { now: 2000 });
  ok("kept on the job record, with what it waits on", J.recordOf("r1").state === "waiting" && J.runRecord(lane).waitingOn === "lane" && /^ops: the delivered count read$/.test(J.runRecord(lane).what) && J.runRecord(lane).task === "Find the 16 Oct count");
  ok("…and the chat reads it there", /bookly: stopped, waiting, waiting on lane \(ops: the delivered count read/.test(J.jobsLines({ now: 3000 }).join("\n")), J.jobsLines({ now: 3000 }));
  J.track("run:old", { kind: "agent", lane: "x", path: join(HOME, "work", "x"), text: "x", state: "done" });
  ok("a run before this release has no record to read (null): the screens fall back", J.recordOf("old") === null && J.runRecord(join(HOME, "work", "x")) === null);
  ok("runPhase reads it: waiting, paused, failed, finished", A.runPhase({ status: "done", outcome: { state: "waiting" } }) === "waiting" && A.runPhase({ status: "done", outcome: { state: "paused" } }) === "paused" && A.runPhase({ status: "done", outcome: { state: "review" } }) === "finished" && A.runPhase({ status: "done", outcome: { state: "failed" } }) === "failed");
  ok("…over its own guess (all ticked would have been Finished)", A.runPhase({ status: "done", progress: { done: 5, total: 5 }, outcome: { state: "waiting" } }) === "waiting");
  J.syncOnUser([], { now: Date.now() + 10 * 60e3 });
  ok("a waiting run record isn't cleared because no card is up for it", J.runRecord(lane).state === "waiting" && J.runRecord(lane).waitingOn === "lane");

  const { workScene } = await import("../home.mjs");
  const ws = workScene({ deps: { repos: () => ({ bookly: lane }), pending: () => [], tasks: () => [],
    agents: () => [{ id: "r1", name: "bookly", path: lane, status: "done", startedAt: Date.now() - 60e3, work: { final: "All done here." }, outcome: { state: "waiting", waitingOn: "lane", what: "ops: the delivered count", summary: "Handed the count to ops." } }] } });
  const dp = ws.projects.find((x) => x.repo === "bookly");
  ok("the Workdesk's line and state for a lane are its run's record, not its last words' guess", dp && dp.summary === "Handed the count to ops." && dp.state === "waiting on ops", dp);
  console.log("OUTCOME — restarts read it");
  const rr = (p, s, w = "") => { J.track("run:" + p, { kind: "agent", path: lane, text: "bookly", state: "running" }); J.track("run:" + p, { state: s, waitingOn: w, outcome: true }); };
  put("TASKS.md", "- [ ] the footer\n"); put("agent.log", ""); const old = new Date(Date.now() - 3600e3); utimesSync(join(lane, ".symbiot", "agent.log"), old, old);
  const started = [], go = (x) => (started.push(x), { id: "s" + started.length });
  rr("w1", "waiting", "user");
  ok("a lane whose run waits on the user isn't started again", A.continueLanes({ run: go, runs: () => [{ path: lane }] }).length === 0 && !started.length, started);
  rr("p1", "paused");
  ok("…one that stopped with work it can still do is", A.continueLanes({ run: go, runs: () => [{ path: lane }] }).length === 1, started);
  const runs = [], r = (p, o) => (runs.push({ p, ...o }), { id: "j" });
  const e = { from: { path: lane, lane: "bookly" }, to: { lane: "ops" }, text: "Read the count" }, o = { text: "Done: 182 delivered.", settled: true };
  put("TASKS.md", "- [~] (waits on ops) the count\n");
  L.report(e, o, { run: r, running: () => false, waiting: () => null, auto: () => true, record: () => ({ state: "waiting", waitingOn: "user" }), settle: () => {} });
  ok("a handover report doesn't start a lane waiting on the user", runs.length === 0, runs);
  let settled = "";
  L.report(e, o, { run: r, running: () => false, waiting: () => null, auto: () => true, record: () => ({ state: "waiting", waitingOn: "lane" }), settle: (p, n) => { settled = n; } });
  ok("…a lane waiting on that handover is moved on and started, forced, though only its waiting item is left", runs.length === 1 && runs[0].force === true && /ops reported back/.test(settled), [runs, settled]);

  console.log("OUTCOME — an answer moves a waiting record on");
  rr("w2", "waiting", "user"); writeFileSync(join(C, "runs.json"), JSON.stringify([{ path: lane, name: "bookly", startedAt: Date.now() - 60e3 }]));
  put("QUESTIONS.md", "## Questions\n\n### Which plan should the page show?\n- R7 a day\n- R35 a week\n");
  const a = A.answerQuestions(lane, [{ q: "Which plan should the page show?", a: "R7 a day" }]);
  ok("answered: its record is paused, no longer waiting on the user", a.ok && J.runRecord(lane).state === "paused" && J.runRecord(lane).note === "answered", [a, J.runRecord(lane)]);
} catch (err) { ok("ran", false, String((err && err.stack) || err)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} outcome: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
