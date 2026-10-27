// A lane's run that ticked its tasks and changed nothing (tasks.mjs closeUnchanged): its tasks close
// as done by themselves, with no Approve waiting on the user. Read-only runs that changed nothing
// waited on the user's OK all the same (23 Oct 2026). Isolated HOME.
//
//   node test/unchanged.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-unchanged-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const T = await import("../tasks.mjs");
const C = await import("../core.mjs");

try {
  console.log("A RUN THAT CHANGED NOTHING — its ticked tasks close by themselves");
  const task = (id, repo) => ({ id, text: `Check ${id}`, repo, review: true, done: false, archived: false });
  C.saveTasks([task("a1", "atlas"), task("b1", "reef"), task("c1", "coral"), task("d1", "delta"), task("e1", "echo"), { id: "f1", text: "Open one", repo: "atlas" }]);
  const lane = (repo, more = {}) => ({ repo, path: "/w/" + repo, tasks: C.loadTasks().filter((x) => x.repo === repo && x.review), files: [], ...more });
  const review = () => [lane("atlas"), lane("reef", { files: ["app.mjs"] }), lane("coral", { running: true }), lane("delta", { unsent: { why: "push" } }), lane("echo")];
  const closed = T.closeUnchanged({ review, ahead: (p) => (p === "/w/echo" ? 2 : 0) });
  const t = C.loadTasks(), byId = Object.fromEntries(t.map((x) => [x.id, x]));
  ok("ticked, nothing changed, nothing unsent: closed as done, no Approve", closed.map((x) => x.id).join() === "a1" && byId.a1.done && byId.a1.archived && !byId.a1.review && byId.a1.unchanged, closed);
  ok("…its lane's open tasks stay open", !byId.f1.done && !byId.f1.archived, byId.f1);
  ok("files changed: still waits for Approve", byId.b1.review && !byId.b1.done);
  ok("a run still there, or work approved but not on GitHub: left alone", byId.c1.review && byId.d1.review);
  ok("commits here not on GitHub yet: left for Approve to send", byId.e1.review && !byId.e1.done);
  ok("nothing to close: nothing written", T.closeUnchanged({ review: () => [], ahead: () => 0 }).length === 0);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} unchanged: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
