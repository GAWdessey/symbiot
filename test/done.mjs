// Done is checked, not said (done.mjs, agents.mjs runHandoff): each item a run newly ticks is checked
// against what its own log shows it did; one without the evidence its kind needs is reopened with
// what's missing and the run goes again, and after two tries it waits on the user. Isolated HOME.
//
//   node test/done.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-done-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const D = await import("../done.mjs");
const A = await import("../agents.mjs");
// a stream-json log: tool calls and what came back
let n = 0;
const call = (name, input, out = "", error = false) => { const id = "t" + (++n); return [JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } }), JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: out, is_error: error }] } })].join("\n"); };
const log = (...c) => c.join("\n");
try {
  console.log("WHAT A RUN DID — read from its log");
  const ev = D.evidenceOf(log(call("Edit", { file_path: "/r/a.mjs" }), call("Bash", { command: "npm test" }, "✓ 12 passed, 0 failed"), call("mcp__claude_ai_Gmail__send_message", { to: "x" }, "sent")));
  ok("its edits, commands with what came back, and other tools, in order", ev.edits[0].file === "/r/a.mjs" && ev.commands[0].cmd === "npm test" && /12 passed/.test(ev.commands[0].out) && ev.tools[0].name === "mcp__claude_ai_Gmail__send_message" && ev.edits[0].i < ev.commands[0].i);
  ok("what kind of item: a change, a send, a deploy, finding out, a draft", D.kindOf("Fix the login button") === "code" && D.kindOf("Send the invoice to the client") === "send" && D.kindOf("Deploy the API to the server") === "deploy" && D.kindOf("Find out why the build fails") === "look" && D.kindOf("Draft a reply to the broker") === "draft" && D.kindOf("Renew the domain", { ops: true }) === "other");

  console.log("THE EVIDENCE EACH NEEDS");
  const j = (item, ...c) => D.judge(item, D.evidenceOf(log(...c)), { hasTests: true });
  ok("a change, tested after its last edit and passing: done", j("Fix the login button", call("Edit", { file_path: "a" }), call("Bash", { command: "npm test" }, "40 passed, 0 failed")).ok);
  ok("…tests run before the last edit only: not done", !j("Fix the login button", call("Bash", { command: "npm test" }, "40 passed, 0 failed"), call("Edit", { file_path: "a" })).ok);
  ok("…the last run failing: not done", /failed/.test(j("Fix the login button", call("Edit", { file_path: "a" }), call("Bash", { command: "npm test" }, "39 passed, 1 failed")).missing || ""));
  ok("…nothing changed: not done", /changed no files/.test(D.judge("Fix the login button", D.evidenceOf(""), { hasTests: true }).missing || ""));
  ok("…no tests in the repo: a change is enough", D.judge("Fix the login button", D.evidenceOf(log(call("Edit", { file_path: "a" }))), { hasTests: false }).ok);
  ok("a send with a check that it landed, or a connector's send that worked: done", j("Send the invoice to the client", call("Bash", { command: "symbiot screens verify https://mail.example/sent --expect \"Invoice\"" }, "✓ found: Invoice")).ok && j("Reply to the broker", call("mcp__claude_ai_Gmail__send_message", {}, "ok")).ok);
  ok("…a send nothing shows went out, or only a draft made: not done", !j("Send the invoice to the client", call("Bash", { command: "symbiot screens press Send" }, "pressed")).ok && !j("Send the invoice to the client", call("mcp__claude_ai_Gmail__create_draft", {}, "ok")).ok);
  ok("a deploy with a check of the live address after it: done; without, or the check before it: not", j("Deploy the API to the server", call("Bash", { command: "ssh box 'cd app && git pull && pm2 restart api'" }, "ok"), call("Bash", { command: "curl -s https://api.example.com/health" }, "ok")).ok && !j("Deploy the API to the server", call("Bash", { command: "curl -s https://api.example.com/health" }, "ok"), call("Bash", { command: "ssh box restart" }, "ok")).ok);

  console.log("TWICE OVER — what sent one item to run after run (24 Oct 2026)");
  const steve = "Chat is read-only (your rule of 2026-10-18), but two older replies still start a learning goal during a chat turn";
  ok("code in a repo's lane that only mentions replies or sending is code, not a send; one that starts by sending still is", D.kindOf(steve) === "code" && D.kindOf("Symbiot slow loop v0: the server reads the fight log and sends back 1 line") === "code" && D.kindOf("Reply to the broker") === "send" && D.kindOf("Agent: send the invoice") === "send" && D.kindOf("Send: reply to Kaggle on Gmail", { ops: true }) === "send");
  ok("the check that it landed counts run through node too (`node $S screens verify`)", j("Send the approved reply to Sonora", call("Bash", { command: "S=/x/symbiot/index.mjs; timeout 100 node $S screens verify \"https://mail.google.com/mail/u/0/#sent\" --expect \"try Cover\"" }, "{\"ok\":true,\"found\":true}")).ok);
  ok("a send reopened says not to send it again before looking", /Don't send it again before you look/.test(j("Send the invoice to the client").missing || ""));
  { // symbiot-fb9214, 25 Oct 2026: ticked with "the fix was already done" in the last words only; reopened, a second run flipped it to [~]
    const said = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "The one task is ticked. I didn't change any code because the fix was already done." }] } });
    ok("…the same said in the run's last words, not on the item, is done too", D.judge("A failed skip brings back dead buttons", D.evidenceOf(said), { hasTests: true }).ok && !D.judge("A failed skip brings back dead buttons", D.evidenceOf(""), { hasTests: true }).ok);
    ok("…and a reopened no-change item says to tick it with a note, not to mark it waiting", !/\[~\]/.test(D.judge("Fix the button", D.evidenceOf(""), { hasTests: true }).missing) && /tick it with a one-line note/.test(D.judge("Fix the button", D.evidenceOf(""), { hasTests: true }).missing));
  }
  ok("a code item ticked as already done or no longer applying, with no change, is done",D.judge("Next zone: Meadow Zone — already done in world.gd, no change needed", D.evidenceOf(""), { hasTests: true }).ok && D.judge("PR gamerepo#1 has conflicts — no longer applies: PR is mergeable", D.evidenceOf(""), { hasTests: true }).ok && !D.judge("Next zone: Meadow Zone", D.evidenceOf(""), { hasTests: true }).ok);
  const sl = join(HOME, "work", "sends"); mkdirSync(join(sl, ".symbiot"), { recursive: true });
  const s1 = D.settleDone(sl, { md: "## Tasks\n- [x] Send the approved reply to Sonora\n", ops: true, log: "" });
  const s2 = D.settleDone(sl, { md: "## Tasks\n- [x] Send the approved reply to Sonora — verified: Gmail showed Message sent.\n", ops: true, log: "" });
  ok("re-ticked with a note of its own, it's the same item: the second try waits on the user, not a third run", s1.reopened.length === 1 && s2.waiting.length === 1 && s2.reopened.length === 0 && Object.keys(D.checksOf(sl)).length === 1, [s2, D.checksOf(sl)]);

  console.log("AT THE RUN'S END — reopened with what's missing, then the user's after two tries");
  const lane = join(HOME, "work", "shop"); mkdirSync(join(lane, ".symbiot"), { recursive: true });
  const md = "## Tasks\n- [x] Old item ticked before\n- [x] Fix the login button\n- [ ] Something else\n";
  const r1 = D.settleDone(lane, { md, before: ["Old item ticked before"], log: log(call("Edit", { file_path: "a" })), hasTests: true });
  ok("only what this run ticked is checked; the change with no test run is reopened, saying why", r1.reopened.length === 1 && /^- \[ \] Fix the login button — not done yet: the tests weren't run/m.test(r1.md) && /^- \[x\] Old item ticked before$/m.test(r1.md), r1.md);
  const md2 = r1.md.replace(/^- \[ \] Fix the login button — not done yet:.*$/m, "- [x] Fix the login button — not done yet: the tests weren't run after the last change.");
  const r2 = D.settleDone(lane, { md: md2, before: ["Old item ticked before"], log: log(call("Edit", { file_path: "a" })), hasTests: true });
  ok("ticked again without it: it waits on the user, saying what couldn't be confirmed", r2.waiting.length === 1 && /^- \[~\] \(waits on the user: Symbiot couldn't confirm it's done after 2 tries: the tests weren't run after the last change\) Fix the login button$/m.test(r2.md), r2.md);
  const r3 = D.settleDone(lane, { md: "## Tasks\n- [x] Fix the logout button\n", before: [], log: log(call("Edit", { file_path: "a" }), call("Bash", { command: "npm test" }, "3 passed, 0 failed")), hasTests: true });
  ok("one with its evidence is checked and stays ticked", r3.checked.length === 1 && /^- \[x\] Fix the logout button$/m.test(r3.md) && D.checksOf(lane)["Fix the logout button"].ok);

  console.log("THE RUN — a tick without its evidence is reopened, and the run goes again on it");
  const rl = join(HOME, "work", "app"); mkdirSync(join(rl, ".symbiot"), { recursive: true }); execSync("git init -q", { cwd: rl });
  writeFileSync(join(rl, "package.json"), JSON.stringify({ name: "app", scripts: { test: "node t.js" } }));
  writeFileSync(join(rl, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Fix the price rounding\n");
  const stub = join(HOME, "stub.mjs");
  writeFileSync(stub, `import { appendFileSync, readFileSync, writeFileSync } from "node:fs"; import { join } from "node:path";
const [prompt, dir] = process.argv.slice(2); appendFileSync(join(dir, ".symbiot", "prompts.txt"), prompt + "\\n---\\n");
const md = readFileSync(join(dir, ".symbiot", "TASKS.md"), "utf8");
if (/^- \\[ \\] Fix the price rounding$/m.test(md)) { // the first time: edits, ticks, never tests
  console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "e1", name: "Edit", input: { file_path: join(dir, "price.js") } }] } }));
  console.log(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "e1", content: "ok" }] } }));
  writeFileSync(join(dir, "price.js"), "x"); writeFileSync(join(dir, ".symbiot", "TASKS.md"), md.replace("- [ ] Fix the price rounding", "- [x] Fix the price rounding"));
}`);
  A.setHandoffCmd(`"${process.execPath}" ${stub} "{prompt}" {dir}`);
  A.runHandoff(rl, { force: true });
  const pf = join(rl, ".symbiot", "prompts.txt"), runs = () => (existsSync(pf) ? readFileSync(pf, "utf8").split("---").filter((x) => x.trim()).length : 0);
  for (let i = 0; i < 200 && runs() < 2; i++) await new Promise((r) => setTimeout(r, 50));
  const after = readFileSync(join(rl, ".symbiot", "TASKS.md"), "utf8");
  ok("its tick is undone with what's missing, and a second run starts on it", /^- \[ \] Fix the price rounding — not done yet: the tests weren't run/m.test(after) && runs() >= 2, [after, runs()]);
  A.setHandoffCmd("");
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} done: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
