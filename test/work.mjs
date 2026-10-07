// Work (work.mjs): an agent's run as it happens, from Claude Code's stream-json
// (the shape checked against a real run) or another agent's plain text.
// Isolated HOME (set before the modules load).
//
//   node test/work.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
