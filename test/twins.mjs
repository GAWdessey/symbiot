// Two things the intuition dry run found on 22 Oct 2026: every email wait read "waiting since 0 min
// ago" (its sent time is kept as a number and was read with Date.parse), and four runs worked the
// same job at once in four folders (agents.mjs twinRunning: one live ops run per goal). Isolated HOME.
//
//   node test/twins.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-twins-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const B = await import("../handback.mjs");
const A = await import("../agents.mjs");
const G = await import("../goals.mjs");
try {
  console.log("EMAIL WAITS — how long they've waited comes from when the email was sent");
  const week = Date.now() - 7 * 86400000;
  ok("a sent time kept as a number is that time (it read as NaN, so 'now')", B.sentAt({ sent: week, at: Date.now() }) === week);
  ok("…an ISO date too, and with neither, when it was noted", B.sentAt({ sent: new Date(week).toISOString() }) === week && B.sentAt({ at: 123 }) === 123 && B.sentAt({ sent: "not a date", at: 5 }) === 5);
  const st = G.childState("wait:w1", { waits: [{ id: "w1", status: "waiting", to: "a@example.com", subject: "the move", sent: week, at: Date.now() }], tasks: [], jobs: [], ledger: { handoffs: [] }, running: () => false, map: {} });
  ok("a goal waiting on that reply waits since the send, not since Symbiot noted it", st && st.state === "waiting" && st.at === week, st);

  const I = await import("../intuition.mjs");
  const dg = I.digest({ jobs: [], waits: [{ id: "w2", status: "waiting", to: "b@example.com", subject: "the move", sent: week, at: Date.now() }], rules: [], chat: [] });
  ok("…and the intuition digest says it's waited 7 days, not 0 min", /waiting since 7 days ago/.test(dg.text) && !/waiting since 0 min ago/.test(dg.text), dg.text.slice(0, 400));

  console.log("TWIN RUNS — one live ops run per piece of work");
  const ops = (n) => join(CFG, "drafts", n), a = ops("act-aaaa1111"), b = ops("act-bbbb2222"), c = ops("act-cccc3333"), lane = join(HOME, "work", "atlas");
  const goals = () => [{ key: "goal:g1", state: "waiting", paths: [a, b, lane] }, { key: "goal:g2", state: "done", paths: [c, a] }];
  ok("a second ops folder on the same goal waits while the first runs", A.twinRunning(b, { goals, running: (p) => p === a }) === a);
  ok("…not when nothing else on it runs", A.twinRunning(b, { goals, running: () => false }) === null);
  ok("…a repo lane on the goal is never held back by it, nor is an ops run held by a goal that's done", A.twinRunning(lane, { goals, running: (p) => p === a }) === null && A.twinRunning(c, { goals, running: (p) => p === a }) === null);
  ok("…nor one on a different piece of work", A.twinRunning(ops("act-dddd4444"), { goals, running: () => true }) === null);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} twins: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
