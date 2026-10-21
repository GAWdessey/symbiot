// Home's hands on the agents (control.mjs, mind.mjs "control"): stop, cancel, redirect, answer,
// front and merge, run through the chat with stand-ins for the agent side. Isolated HOME.
//
//   node test/control.mjs
//
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-control-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { control } = await import("../control.mjs");
const { converse, rulesFor } = await import("../mind.mjs");
const { homeContext } = await import("../home.mjs");
const { buildTasksMd } = await import("../tasks.mjs");

const a = join(HOME, "a"), b = join(HOME, "b");
mkdirSync(join(a, ".symbiot"), { recursive: true }); mkdirSync(join(b, ".symbiot"), { recursive: true });
const map = { move: a, npm: b };
let tasks = [{ id: "t1", text: "one", repo: "move" }, { id: "t2", text: "two", repo: "move" }, { id: "t3", text: "three", repo: "npm" }];
const calls = { stopped: [], parked: [], answered: [], started: [] }, live = new Set([a, b]);
const deps = {
  map, load: () => tasks, save: (t) => { tasks = t; },
  running: (p) => live.has(p) ? { id: "r", pid: 1 } : null,
  stop: (p) => { calls.stopped.push(p); live.delete(p); return true; },
  park: (p, on) => calls.parked.push([p, on]),
  questions: (p) => p === b ? [{ q: "Close the window?", options: [] }] : [],
  answer: (p, rows) => { calls.answered.push([p, rows]); return { ok: true, saved: 1 }; },
  start: (p) => { calls.started.push(p); return { id: "n" }; },
};
try {
  console.log("CONTROL — each op");
  let r = control([{ op: "stop", id: "run:" + b }], deps);
  ok("stop ends the run and pauses the lane", r[0].ok && calls.stopped[0] === b && calls.parked[0][0] === b && calls.parked[0][1] === true, r);
  r = control([{ op: "stop", id: "npm" }], deps);
  ok("stop with nothing running says so, no fake success", r[0].error && !r[0].ok, r);
  r = control([{ op: "stop", id: "nonsense" }], deps);
  ok("stop of an unknown agent is an error", !!r[0].error, r);
  r = control([{ op: "cancel", id: "t2" }], deps);
  ok("cancel archives the task", r[0].ok && tasks.find((t) => t.id === "t2").archived === true, r);
  ok("cancel of a missing task is an error", !!control([{ op: "cancel", id: "zz" }], deps)[0].error);
  r = control([{ op: "front", id: "t3" }], deps);
  ok("front moves the task first and flags it", r[0].ok && tasks[0].id === "t3" && tasks[0].first > 0, r);
  const md = buildTasksMd("x", {}, [{ text: "plain" }, { text: "moved up", first: 1 }]);
  ok("a task moved to the front is listed first in the brief", /### Urgent: do these first[\s\S]*moved up[\s\S]*### /.test(md) && md.indexOf("moved up") < md.indexOf("plain"));
  r = control([{ op: "answer", id: "ask:" + b, text: "No, leave it open" }], deps);
  ok("answer gives the open question the text", r[0].ok && calls.answered[0][1][0].q === "Close the window?" && calls.answered[0][1][0].a === "No, leave it open", r);
  ok("answer to an agent with no question is an error", !!control([{ op: "answer", id: "ask:" + a, text: "x" }], deps)[0].error);
  live.add(a);
  r = control([{ op: "redirect", id: "move", text: "Skip the npm step, another agent has it" }], deps);
  ok("redirect writes the note and stops the run", r[0].ok && calls.stopped.includes(a) && /Skip the npm step/.test(readFileSync(join(a, ".symbiot", "ANSWERS.md"), "utf8")), r);
  live.add(a); live.add(b);
  r = control([{ op: "merge", id: "run:" + a, into: "npm" }], deps);
  ok("merge stops the duplicate and tells the keeper it owns the job", r[0].ok && /owns it/.test(readFileSync(join(b, ".symbiot", "ANSWERS.md"), "utf8")) && !live.has(a) && live.has(b), r);
  ok("merge into itself is refused", !!control([{ op: "merge", id: "move", into: "move" }], deps)[0].error);
  ok("unknown ops and junk are dropped; at most 5 run", control([{ op: "format-disk" }, null, "x"], deps).length === 0 && control(Array(9).fill({ op: "cancel", id: "zz" }), deps).length === 5);

  console.log("CONTROL — through Home's chat");
  ok("the rules describe control only for Home", /"control":/.test(rulesFor([], "", true, true, [], true)) && !/"control":/.test(rulesFor([], "", true, true, [])));
  live.add(b); calls.stopped.length = 0;
  const reply = JSON.stringify({ reply: "Stopping the second one.", do: null, control: [{ op: "stop", id: "run:" + b }] });
  const res = await converse({ where: "Home", nav: true, control: true, question: "stop the npm one", ask: async () => reply, map, act: { control: (ops) => control(ops, deps) } });
  ok("the chat runs the op and says what happened", calls.stopped[0] === b && /Stopped/.test(res.reply) && res.control[0].ok, res);
  live.clear();
  const res2 = await converse({ where: "Home", nav: true, control: true, question: "stop it", ask: async () => reply, map, act: { control: (ops) => control(ops, deps) } });
  ok("a failed op is owned first, plainly", /^I couldn't stop:/.test(res2.reply), res2.reply);
  const claim = JSON.stringify({ reply: "Sorted, I've told Robin's agent it can run python.", do: null, control: [{ op: "answer", id: "ask:" + a, text: "yes, allow it" }] });
  const res3 = await converse({ where: "Home", nav: true, control: true, question: "tell robin yes", ask: async () => claim, map, act: { control: (ops) => control(ops, deps) } });
  ok("a failed answer is never reported as done: the model's \"Sorted\" is dropped", /^I couldn't answer:/.test(res3.reply) && !/Sorted/.test(res3.reply) && /don't count it as done/.test(res3.reply), res3.reply);
  ok("…and the words aren't lost: they're left as a note for its next run", /yes, allow it/.test(readFileSync(join(a, ".symbiot", "ANSWERS.md"), "utf8")), "");
  ok("homeContext lists the ids it can act on", /\[run:\/x\] .*Robin/.test(homeContext({ you: [{ id: "ask:/y", title: "T", sub: "s" }], feeds: [], lanes: [], runs: [{ id: "run:/x", name: "Robin", line: "working", started: 0 }], working: 1, at: 1 })) && /Agents asking[^\n]*ask:\/y \(T\)/.test(homeContext({ you: [{ id: "ask:/y", title: "T", sub: "s" }], feeds: [], lanes: [], runs: [], working: 0, at: 1 })));
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
