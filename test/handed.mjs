// Home's chat knows how the work it handed off stands (home.mjs noteHanded/handedState/homeContext):
// "is everything done?" was a guess because nothing listed what the chat had handed over.
// Isolated HOME (set before the modules load).
//
//   node test/handed.mjs
//
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-handed-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { noteHanded, handedState, homeContext } = await import("../home.mjs");
const path = join(HOME, "handed.json"), now = Date.now(), map = { daaymn: "/p/daaymn", symbiot: "/p/symbiot", steve: "/p/steve", argena: "/p/argena" };
try {
  console.log("HANDED — what Home's chat handed off");
  ok("an error or a no-lane result isn't kept", !noteHanded({ error: "x" }, "a", { path, now }) && !noteHanded({ ok: true }, "a", { path, now }));
  noteHanded({ ok: true, lane: "argena", task: "t4" }, "old one", { path, now: now - 8 * 864e5 });
  noteHanded({ ok: true, lane: "daaymn", task: "t1" }, "photos", { path, now });
  noteHanded({ ok: true, lane: "symbiot", task: "t2", notStarted: "its agent didn't start." }, "fix the card", { path, now });
  noteHanded({ ok: true, lane: "steve", id: "t3" }, "run it", { path, now });
  noteHanded({ ok: true, lane: "argena", task: "t5" }, "ask one", { path, now });
  noteHanded({ ok: true, lane: "steve", task: "t6" }, "gone", { path, now });
  const tasks = [{ id: "t1", done: true }, { id: "t2", done: false }, { id: "t3", done: false, review: true }, { id: "t5", done: false }];
  const list = [{ path: "/p/argena", status: "running", ask: { questions: [{ q: "which?" }] } }];
  const st = handedState({ now, ledger: JSON.parse(readFileSync(path, "utf8")), tasks, list, map });
  const by = (id) => (st.find((x) => x.id === id) || {}).status;
  ok("done", by("t1") === "done", st);
  ok("never started says why", /^never started: its agent didn't start$/.test(by("t2")), by("t2"));
  ok("in review", by("t3") === "done, waiting for their OK", by("t3"));
  ok("older than 7 days drops", !by("t4"));
  ok("waiting on an answer beats running", by("t5") === "waiting on their answer", by("t5"));
  ok("removed task is said so", by("t6") === "no longer on the Workdesk", by("t6"));
  const ctx = homeContext({ you: [], feeds: [], working: 0, runs: [], lanes: [], handed: st, at: now });
  ok("Home's talk lists them", /Handed off from this chat[\s\S]*- symbiot: fix the card \(never started[^\n]*\n- daaymn: photos \(done\)/.test(ctx), ctx);
  ok("none says none", /Handed off from this chat[^\n]*\n- none/.test(homeContext({ you: [], feeds: [], working: 0, runs: [], lanes: [], at: now })));
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} handed: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
