// Home's chat knows how the work it handed off stands (home.mjs noteHanded/handedState/homeContext):
// "is everything done?" was a guess because nothing listed what the chat had handed over.
// Isolated HOME (set before the modules load).
//
//   node test/handed.mjs
//
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
  const later = handedState({ now, ledger: JSON.parse(readFileSync(path, "utf8")), tasks, list: [...list, { path: map.symbiot, status: "done", startedAt: now + 60000, ask: { questions: [] } }], map }).find((x) => x.id === "t2");
  ok("…but not once a run in its lane has started since (19 Oct 2026: still \"never started\" after the gate cleared)", later.status === "its agent has picked it up since", later);
  ok("in review", by("t3") === "done, waiting for their OK", by("t3"));
  ok("older than 7 days drops", !by("t4"));
  ok("waiting on an answer beats running", by("t5") === "waiting on their answer", by("t5"));
  ok("removed task is said so", by("t6") === "no longer on the Workdesk", by("t6"));
  const ctx = homeContext({ you: [], feeds: [], working: 0, runs: [], lanes: [], handed: st, at: now });
  ok("Home's talk lists them", /Handed off from this chat[\s\S]*- symbiot: fix the card \(never started[^\n]*\n- daaymn: photos \(done\)/.test(ctx), ctx);
  ok("none says none", /Handed off from this chat[^\n]*\n- none/.test(homeContext({ you: [], feeds: [], working: 0, runs: [], lanes: [], at: now })));
  console.log("DIGEST — what Home sees of each agent: steps, the question, the answer, the result, and no second ask");
  const { agentDigest, garthLedger } = await import("../home.mjs"), { recordDone, isDone } = await import("../asksdone.mjs");
  const dir = join(HOME, "dummy"); mkdirSync(join(dir, ".symbiot"), { recursive: true });
  const asked = "Which npm account owns the package?";
  writeFileSync(join(dir, ".symbiot", "ANSWERS.md"), `# Answers\n\n### ${asked}\nGAWdessey\n_answered 2026-10-13_\n`);
  const dl = [{ name: "Agent: npm", path: dir, status: "running", startedAt: now - 6e4, work: { steps: [{ verb: "Ran", target: "npm whoami", status: "done" }, { verb: "Ran", target: "npm publish", status: "error", note: "403 forbidden" }] }, ask: { questions: [{ q: asked }] } },
    { name: "Agent: done", path: join(HOME, "d2"), status: "done", endedAt: now - 3600e3, exitCode: 0, tail: "Installed version 0.64.0." }];
  const dg = agentDigest({ now, list: dl, map: { symbiot: dir }, tasks: [{ repo: "symbiot", text: "a" }, { repo: "symbiot", text: "b", done: true }] });
  ok("running agent: lane, queue, steps with failures, question and Garth's answer", dg[0].lane === "symbiot" && dg[0].queued === 1 && dg[0].steps[1] === "Ran npm publish (failed: 403 forbidden)" && dg[0].asks[0] === asked && dg[0].answers[0].a === "GAWdessey", dg[0]);
  ok("finished agent: its outcome", dg[1].outcome === "Installed version 0.64.0." && !dg[1].running, dg[1]);
  recordDone(asked, "GAWdessey");
  const cx = homeContext({ you: [], feeds: [], working: 0, runs: [], lanes: [], digest: dg, ledger: garthLedger(), at: now });
  ok("Home's talk carries step, question, answer, result and the ledger", /last steps: [^\n]*failed: 403[\s\S]*asked Garth: Which npm[\s\S]*Garth answered "Which npm account[^"]*": GAWdessey[\s\S]*outcome: Installed version 0\.64\.0\.[\s\S]*Already answered by Garth[^\n]*\n- [\d-]+ Which npm account[^\n]*→ GAWdessey/.test(cx), cx);
  ok("an ask he already answered is suppressed", isDone(asked) && isDone("which npm account owns the package"));
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
{
  const { finishedState } = await import("../home.mjs"), t = Date.now();
  const f = finishedState({ now: t, list: [
    { name: "Steve", status: "done", endedAt: t - 3600e3, exitCode: 0, tail: "Pulled and installed;\n  version is 0.63.11.", changed: ["a", "b"], ask: { questions: [{ q: "Which npm account?" }] } },
    { name: "Old", status: "done", endedAt: t - 3 * 864e5, exitCode: 0, tail: "x" },
    { name: "Live", status: "running", startedAt: t },
    { name: "Broke", status: "done", endedAt: t - 60e3, exitCode: 1, tail: "" }] });
  ok("Home sees agents finished in the last day, newest first, not older or running ones", f.length === 2 && f[0].name === "Broke" && f[1].name === "Steve", f);
  ok("…with how each ended, what it said last, its questions and files changed", f[0].end === "failed (exit 1)" && f[1].said === "Pulled and installed; version is 0.63.11." && f[1].asks[0] === "Which npm account?" && f[1].changed === 2, f);
  const c = homeContext({ you: [], feeds: [], working: 0, runs: [], lanes: [], finished: f, at: t });
  ok("…and the chat's context carries them", /Agents finished in the last 24h[^\n]*\n[\s\S]*- Steve: finished, 2 files changed; asked: Which npm account\?; said: Pulled and installed; version is 0\.63\.11\./.test(c), c);
}
console.log(`\n${fail ? "✗" : "✓"} handed: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
