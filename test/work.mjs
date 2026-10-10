// Work (work.mjs): an agent's run as it happens, from Claude Code's stream-json
// (the shape checked against a real run) or another agent's plain text.
// Isolated HOME (set before the modules load).
//
//   node test/work.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-work-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { parseRun, lastRunText, finalOf, describe, testsIn } = await import("../work.mjs");
const { withStream, workOf } = await import("../agents.mjs");

const T = Date.UTC(2026, 9, 6, 8, 0, 0), ts = (s) => new Date(T + s * 1000).toISOString();
const A = (blocks, s) => JSON.stringify({ type: "assistant", message: { content: blocks }, timestamp: ts(s) });
const U = (blocks, s) => JSON.stringify({ type: "user", message: { content: blocks }, timestamp: ts(s) });
const use = (id, name, input) => ({ type: "tool_use", id, name, input });
const res = (id, content, is_error = false) => ({ type: "tool_result", tool_use_id: id, content, ...(is_error ? { is_error } : {}) });
const running = [
  JSON.stringify({ type: "system", subtype: "hook_started" }),
  JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-5-5[1m]", tools: [] }),
  A([{ type: "thinking", thinking: "" }], 1),
  A([{ type: "text", text: "I'll check the tests first, then fix the sender attribution." }], 2),
  A([use("t1", "TaskCreate", { subject: "Fix WhatsApp sender attribution", activeForm: "Fixing WhatsApp sender attribution" })], 3),
  U([res("t1", "Task #1 created successfully: Fix WhatsApp sender attribution")], 3),
  A([use("t2", "TaskCreate", { subject: "Add a test", activeForm: "Adding a test" })], 4),
  U([res("t2", "Task #2 created successfully: Add a test")], 4),
  A([use("t3", "TaskUpdate", { taskId: "1", status: "in_progress" })], 5),
  A([use("q1", "ToolSearch", { query: "select:Read" })], 5),
  A([use("r1", "Read", { file_path: "/home/x/orca/projects/symbiot/watch.mjs" })], 6),
  U([res("r1", "1\timport …")], 6.12),
  A([use("e1", "Edit", { file_path: "/home/x/orca/projects/symbiot/watch.mjs", old_string: "a", new_string: "b" })], 20),
  U([res("e1", "The file has been updated.")], 20.3),
  A([use("e2", "Edit", { file_path: "/home/x/orca/projects/symbiot/watch.mjs" })], 40),
  U([res("e2", "updated")], 40.2),
  A([use("w1", "Write", { file_path: "/home/x/orca/projects/symbiot/test/fixtures.mjs" })], 70),
  U([res("w1", "ok")], 70.1),
  A([use("m1", "mcp__claude_ai_Google_Drive__search_files", { query: "x" })], 80),
  U([res("m1", [{ type: "text", text: "2 files" }])], 81),
  A([use("b1", "Bash", { command: "npm test", description: "Run the test suite" })], 90),
  U([res("b1", "✓ load: 30 passed, 0 failed\n✓ 390 passed, 1 failed")], 150),
  A([use("b2", "Bash", { command: "lsof -i :99" })], 160),
  U([res("b2", "permission denied", true)], 160.5),
  A([use("t4", "TaskUpdate", { taskId: "1", status: "completed" }), use("t5", "TaskUpdate", { taskId: "2", status: "in_progress" })], 170),
  JSON.stringify({ type: "rate_limit_event" }),
].join("\n");

try {
  console.log("A RUN AS IT HAPPENS — from Claude Code's stream");
  const w = parseRun(running);
  ok("it's a stream, with its model", w.stream && w.model === "claude-opus-5-5[1m]", [w.stream, w.model]);
  ok("its to-do list, from TaskCreate/TaskUpdate, with what's in progress", w.todos.length === 2 && w.todos[0].status === "completed" && w.todos[1].status === "in_progress" && w.todos[1].active === "Adding a test", w.todos);
  ok("doing now: the in-progress to-do's own words", w.doing === "Adding a test", w.doing);
  ok("bookkeeping isn't work: no TaskCreate, TaskUpdate or ToolSearch steps", w.steps.every((s) => !/Task|ToolSearch/.test(s.verb + s.target)) && w.steps.length === 7, w.steps.map((s) => s.verb + " " + s.target));
  ok("steps in plain words: read, edited, wrote, used a connector, ran", w.steps[0].verb === "Read" && w.steps[0].target === "symbiot/watch.mjs" && w.steps[1].verb === "Edited" && w.steps[3].verb === "Wrote" && w.steps[4].kind === "connector" && /Google Drive/.test(w.steps[4].target) && w.steps[5].target === "Run the test suite", w.steps.map((s) => [s.verb, s.target]));
  ok("each step's time from call to result", w.steps[0].ms === 120 && w.steps[5].ms === 60000, [w.steps[0].ms, w.steps[5].ms]);
  ok("a test run's tally is read from its output (summed across suites)", w.tests && w.tests.passed === 420 && w.tests.failed === 1 && w.steps[5].tests.failed === 1, w.tests);
  ok("a failed step is marked, counted and says why", w.steps[6].status === "error" && w.errors === 1 && /permission denied/.test(w.steps[6].note), w.steps[6]);
  ok("files it changed, and how often", w.files["symbiot/watch.mjs"] === 2 && w.files["test/fixtures.mjs"] === 1, w.files);
  ok("what it said between steps", w.said[0] === "I'll check the tests first, then fix the sender attribution.", w.said);
  ok("its pace over time (steps per minute, for a sparkline)", w.pace.length >= 2 && w.pace.reduce((a, b) => a + b, 0) === 7, w.pace);
  const done = parseRun(running + "\n" + JSON.stringify({ type: "result", subtype: "success", result: "Fixed it and added a test.", total_cost_usd: 0.42, num_turns: 14, usage: { input_tokens: 100, output_tokens: 900, cache_read_input_tokens: 9000 } }));
  ok("finished: its answer, cost, turns and tokens, and nothing 'doing' any more", done.final === "Fixed it and added a test." && done.cost === 0.42 && done.turns === 14 && done.tokens === 10000 && done.doing === "", [done.final, done.cost, done.turns, done.tokens, done.doing]);
  const todo = parseRun([JSON.stringify({ type: "system", subtype: "init", model: "m" }), A([use("x", "TodoWrite", { todos: [{ content: "One", status: "completed", activeForm: "Doing one" }, { content: "Two", status: "in_progress", activeForm: "Doing two" }] })], 1)].join("\n"));
  ok("the older TodoWrite list works the same", todo.todos.length === 2 && todo.doing === "Doing two", todo);

  console.log("ANOTHER AGENT — plain text");
  const plain = parseRun("Applied edit to watch.mjs\nRunning tests...\nAll good: the fix is in.");
  ok("not a stream: its last lines are what it said, and its final words", !plain.stream && plain.said.length === 3 && /fix is in/.test(plain.final), plain);
  ok("a log's newest run only, past its header and command", lastRunText("\n=== a 2026 ===\n$ cmd\nold\n=== b 2026 ===\n$ cmd2\nnew line") === "new line", lastRunText("\n=== a 2026 ===\n$ cmd\nold\n=== b 2026 ===\n$ cmd2\nnew line"));
  ok("finalOf reads a streaming run's answer, not its JSON", finalOf("\n=== x 2026 ===\n$ claude -p\n" + running + "\n" + JSON.stringify({ type: "result", result: "Done." })) === "Done.", "");

  console.log("SMALL PARTS");
  ok("tool names in plain words", describe("Grep", { pattern: "foo" }).verb === "Searched for" && describe("WebSearch", { query: "q" }).kind === "web" && describe("Task", { description: "look" }).kind === "agent", "");
  ok("test tallies in the usual shapes", testsIn("12 passed, 0 failed").passed === 12 && testsIn("Tests: 3 failed, 40 passed").failed === 3 && testsIn("nothing here") === null, [testsIn("Tests: 3 failed, 40 passed")]);

  console.log("RUNS STREAM — and the Agents tab gets the work");
  ok("a claude -p command streams its steps", withStream('claude -p "{prompt}" --permission-mode acceptEdits') === 'claude -p "{prompt}" --permission-mode acceptEdits --output-format stream-json --verbose', "");
  ok("…once; and never another agent, an Orca tab or a command with its own format", withStream(withStream('claude -p "x"')).match(/stream-json/g).length === 1 && withStream('codex exec "x"') === 'codex exec "x"' && withStream("orca-ide terminal create --command \"claude x\"") === "orca-ide terminal create --command \"claude x\"" && withStream('claude -p "x" --output-format text') === 'claude -p "x" --output-format text', "");
  const repo = join(HOME, "r"); mkdirSync(join(repo, ".symbiot"), { recursive: true });
  writeFileSync(join(repo, ".symbiot", "TASKS.md"), "## Tasks\n- [x] one\n- [ ] two\n- [ ] three\n");
  const wo = workOf(repo, "\n=== r " + ts(0) + " ===\n$ claude -p …\n" + running);
  ok("its work, how far through TASKS.md it is, and readable text instead of JSON", wo.work && wo.work.doing === "Adding a test" && wo.progress.done === 1 && wo.progress.total === 3 && !/\{"type"/.test(wo.tail), [wo.progress, wo.tail.slice(0, 80)]);
  ok("another agent: no work view, the log's end as before", workOf(repo, "\n=== r x ===\n$ codex\nhello").work === null && /hello/.test(workOf(repo, "\n=== r x ===\n$ codex\nhello").tail), "");
  console.log("HOW FAR ALONG — a run's step in its brief's plan, on Home (steve and argena, 2026-10-08: only 'Agents working: 2')");
  const { briefPlan, stepOf, runLine, STALL_MS } = await import("../work.mjs");
  const brief = "## Tasks\n- [x] old\n- [ ] Argena (v6.7). Do these in order. 1) Device pass on v6.7. Earlier today it got three hotfixes. 2) Look and feel, plus a zoned world. This is Garth's priority, with monsters. 3) Wire the class bible into the game, starting with core class apprenticeships. 4) Symbiot slow loop v0. Monsters use behaviour cards.\n";
  const plan = briefPlan(brief);
  ok("a brief's numbered steps, each a short label (v6.7 isn't a sentence's end)", plan.map((p) => p.label).join(" | ") === "Device pass on v6.7 | Look and feel, plus a zoned world | Wire the class bible into the game | Symbiot slow loop v0", plan.map((p) => p.label));
  ok("…none without numbered steps, or with only one", briefPlan("- [ ] Fix the login bug.").length === 0 && briefPlan("- [ ] 1) Just this.").length === 0, "");
  ok("its step, from what it says: 'step 1 done' is the next one", stepOf(plan, ["Fresh install works.", "Device pass done. Moving to step 2 (art direction)."]) === 2 && stepOf(plan, ["Step 1 is done."]) === 2, "");
  ok("…two words of a step's label name it, in order, only forward", stepOf(plan, ["Device pass going well"]) === 1 && stepOf(plan, ["Step 3: wiring the bible", "Device pass recheck"]) === 3, "");
  ok("…a step's other words, or one word of its label, don't: 'the monsters' isn't step 4, 'wiring the map' isn't step 3", stepOf(plan, ["Step 2: art.", "Shooting the monsters and the map screens.", "Wiring the map into sky and fog."]) === 2, "");
  const busy = parseRun([A([{ type: "text", text: "Step 2: look and feel. Shooting the monsters, camp and gates." }], 0), A([use("g1", "Bash", { command: "godot", description: "Render the marsh" })], 1)].join("\n"));
  const rl = runLine({ plan, step: stepOf(plan, busy.talk), work: busy, now: T + 60000 });
  ok("Home's line: step N of M, its label, and what it's on now", rl.line === "step 2 of 4: look and feel, plus a zoned world · shooting the monsters, camp and gates" && rl.step === 2 && rl.of === 4 && !rl.quiet, rl);
  ok("…quiet past STALL_MS since its last move (a heartbeat isn't one), with the minutes", runLine({ plan, step: 2, work: busy, now: T + 1000 + STALL_MS + 5 * 60000 }).quiet === 25, runLine({ plan, step: 2, work: busy, now: T + STALL_MS + 5 * 60000 }));
  const hb = (s) => JSON.stringify({ type: "tool_progress", tool_use_id: "g2-heartbeat-0", tool_name: "Bash", parent_tool_use_id: "g2", elapsed_time_seconds: s, heartbeat: true });
  const longRun = [A([use("g2", "Bash", { command: "pip install x", description: "Install x" })], 0), hb(30), hb(270)].join("\n");
  const lr = parseRun(longRun), fresh = parseRun(A([use("g2", "Bash", { command: "pip install x", description: "Install x" })], 0));
  ok("a long call's heartbeat shows how long it has run in the doing line", /· running 4m$/.test(lr.doing) && lr.moved === parseRun(A([use("g2", "Bash", { command: "pip install x", description: "Install x" })], 0)).moved, lr.doing);
  ok("…a step with no heartbeat yet reads as before", fresh.doing && !/running/.test(fresh.doing), fresh.doing);
  ok("…a finished step ignores a late heartbeat", !/running/.test(parseRun([A([use("g3", "Bash", { command: "ls" })], 0), JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "g3", content: "x" }] } }), JSON.stringify({ type: "tool_progress", parent_tool_use_id: "g3", elapsed_time_seconds: 600 })].join("\n")).doing), "");
  const loop = parseRun([1, 2, 3, 4, 5].map((i) => A([use("l" + i, "Bash", { command: "curl x", description: "Poll the server" })], i)).join("\n"));
  ok("…going round: its last steps all the same call", loop.looping === true && runLine({ work: loop, now: T + 6000 }).looping === true && !busy.looping, "");
  ok("…no plan: what it's on, still a line", runLine({ work: busy, now: T }).line === "shooting the monsters, camp and gates", runLine({ work: busy, now: T }).line);
  writeFileSync(join(repo, ".symbiot", "TASKS.md"), brief);
  const wl = workOf(repo, "\n=== r " + ts(0) + " ===\n$ claude -p …\n" + [A([{ type: "text", text: "Step 2: look and feel. Shooting the monsters, camp and gates." }], 0)].join("\n"));
  ok("the Agents list carries it (workOf line); a finished run doesn't", wl.line && wl.line.step === 2 && !workOf(repo, "\n=== r x ===\n$ claude -p …\n" + JSON.stringify({ type: "result", result: "done" })).line, wl.line);
  console.log("HOW LONG IT HAS LEFT — a range from the lane's past runs, and what's queued behind it");
  const { estimate, estimateWords, runsInLog, noteDuration, loadDurations } = await import("../estimate.mjs");
  const M = 60000, past = [10, 12, 15, 20, 25, 30, 1, 1].map((m, i) => ({ at: i, kind: i > 5 ? "answer" : "brief", ms: m * M }));
  const e1 = estimate({ path: "/x", elapsed: 5 * M, runs: past, durations: [] });
  ok("a brief run 5 min in, its lane's briefs took 10–30 min: what's left, as a range", e1 && e1.left === "8–20 min" && estimateWords(e1) === "8–20 min left", e1);
  const e2 = estimate({ path: "/x", elapsed: 5 * M, queued: 2, runs: past, durations: [] });
  ok("…tasks held for its next run add that run to the total", /^\+2 queued: /.test(estimateWords(e2).split(" · ")[1] || "") && e2.total, estimateWords(e2));
  ok("…judged on the runs that lasted longer than this one has so far, never the 1-minute replies", estimate({ path: "/x", kind: "answer", elapsed: 9 * M, runs: past, durations: [] }).left === "4–15 min", estimate({ path: "/x", kind: "answer", elapsed: 9 * M, runs: past, durations: [] }));
  const e3 = estimate({ path: "/x", elapsed: 40 * M, runs: past, durations: [] });
  ok("…past nearly all of them: longer than usual, with what usual is, not '1 min left'", e3.over && estimateWords(e3).startsWith("longer than its usual"), e3);
  ok("…too little to go on: none", estimate({ path: "/x", elapsed: M, runs: past.slice(0, 2), durations: [] }) === null, "");
  const typed = [1, 2, 3].map(() => ({ path: "/x", kind: "brief", task: "Fix the login crash", ms: 4 * M })), typeOf = (t) => (/fix/i.test(t) ? "Fixes" : "Other");
  ok("…the same lane and kind of task first (durations Symbiot saw end)", estimate({ path: "/x", type: "Fixes", typeOf, elapsed: M, runs: past, durations: typed }).from === "lane+type", "");
  const lg = join(HOME, "est.log");
  writeFileSync(lg, "\n=== r 2026-10-08T09:00:00.000Z ===\n$ claude -p \"Read .symbiot/TASKS.md\"\n" + JSON.stringify({ type: "assistant", message: { content: [] } }) + "\n" + JSON.stringify({ duration_api_ms: 1, type: "result", duration_ms: 600000 }) + "\n=== r 2026-10-08T10:00:00.000Z ===\n$ claude -p \"The user has answered: …\"\n");
  ok("a log's finished runs, by kind, from each run's result (its keys in any order)", JSON.stringify(runsInLog(lg).map((r) => [r.kind, r.ms])) === '[["brief",600000]]', runsInLog(lg));
  writeFileSync(lg, readFileSync(lg, "utf8") + JSON.stringify({ type: "result", duration_ms: 60000 }) + "\n");
  ok("…and only what's been added is read next time", JSON.stringify(runsInLog(lg).map((r) => r.kind)) === '["brief","answer"]', runsInLog(lg));
  const df = join(HOME, "durations.json"); noteDuration({ path: "/x", cmd: "claude -p x", task: "Fix it", ms: 5 * M }, df);
  ok("a run Symbiot saw end is kept with its lane, kind and task", loadDurations(df)[0].kind === "brief" && loadDurations(df)[0].task === "Fix it", loadDurations(df));
  const { noteCost, loadCosts } = await import("../estimate.mjs"), { parseRun: pr } = await import("../work.mjs");
  const cf = join(HOME, "costs.json"), res = pr(JSON.stringify({ type: "result", result: "ok", total_cost_usd: 0.42, num_turns: 7, modelUsage: { "claude-sonnet-5": { costUSD: 0.42 } } }));
  ok("a result's per-model usage is kept", res.cost === 0.42 && res.modelUsage && res.modelUsage["claude-sonnet-5"].costUSD === 0.42, res);
  noteCost({ path: "/x", cmd: "claude -p x", task: "Fix it", model: "claude-sonnet-5", cost: res.cost, turns: res.turns, ms: 5 * M, ok: false, modelUsage: res.modelUsage }, cf);
  noteCost({ path: "/x", cmd: "claude -p x", cost: null }, cf); // no cost in the log: nothing to record
  ok("a run's cost is kept, failed ones too, with path, cost and a real boolean ok", loadCosts(cf).length === 1 && loadCosts(cf)[0].path === "/x" && loadCosts(cf)[0].cost === 0.42 && loadCosts(cf)[0].ok === false, loadCosts(cf));
  console.log("A BIG LOG — only the newest run is read, from the end, and kept until the file changes");
  const { readRunLog } = await import("../work.mjs");
  const big = join(HOME, "big", ".symbiot"); mkdirSync(big, { recursive: true });
  const blob = "x".repeat(1024 * 1024); // a screenshot an agent read, as it lands in the log
  let txt = ""; for (let i = 0; i < 40; i++) txt += `\n=== r 2026-10-0${1 + (i % 9)}T08:00:00.000Z ===\n$ claude -p x\n` + JSON.stringify({ type: "user", message: { content: [{ type: "image", data: blob }] } }) + "\n" + JSON.stringify({ type: "result", result: "run " + i }) + "\n";
  writeFileSync(join(big, "agent.log"), txt);
  let t0 = Date.now(); const last = readRunLog(join(big, "agent.log")); const took = Date.now() - t0;
  ok("a 40 MB log of 40 runs gives just the newest run, header and all", last.startsWith("\n=== r ") && /"run 39"/.test(last) && !/"run 38"/.test(last) && last.length < 1.2 * 1024 * 1024, [last.length, last.slice(0, 40)]);
  ok("…and parses as before", parseRun(lastRunText(last)).final === "run 39", parseRun(lastRunText(last)).final);
  t0 = Date.now(); readRunLog(join(big, "agent.log")); ok("…asked again, it's kept: no read", Date.now() - t0 < 5, [took, Date.now() - t0]);
  writeFileSync(join(big, "agent.log"), txt + "\n=== r 2026-10-09T09:00:00.000Z ===\n$ claude -p x\n" + JSON.stringify({ type: "result", result: "run 40" }) + "\n");
  ok("…a new run in the file is read fresh", /"run 40"/.test(readRunLog(join(big, "agent.log"))), "");
  writeFileSync(join(big, "agent.log"), "no header at all\n");
  ok("…a log with no header is all of it; no log is empty", readRunLog(join(big, "agent.log")) === "no header at all\n" && readRunLog(join(big, "none.log")) === "", "");
  const { track } = await import("../agents.mjs");
  const rot = join(HOME, "rot"); mkdirSync(join(rot, ".symbiot"), { recursive: true }); writeFileSync(join(rot, ".symbiot", "agent.log"), "\n=== old ===\n" + "y".repeat(9 * 1024 * 1024));
  const { readFileSync: rf, statSync: sf } = await import("node:fs");
  track("rot", "echo fresh", rot);
  for (let i = 0; i < 50 && !/fresh\n/.test(rf(join(rot, ".symbiot", "agent.log"), "utf8")); i++) await new Promise((r) => setTimeout(r, 100));
  ok("a log past 8 MB starts afresh at the next run; the old one is kept as agent.log.old", /fresh/.test(rf(join(rot, ".symbiot", "agent.log"), "utf8")) && sf(join(rot, ".symbiot", "agent.log")).size < 4096 && sf(join(rot, ".symbiot", "agent.log.old")).size > 9 * 1024 * 1024, "");
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} work: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
