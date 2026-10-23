// The app's background work in one registry (timers.mjs, server.mjs): each job named, never run twice at
// once, its failures kept instead of dropped, its state readable (/api/timers) (23 Oct 2026).
//
//   node test/timers.mjs
//
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const T = await import("../timers.mjs");
// a clock the test turns by hand
const made = []; const clock = { setInterval: (f, ms) => (made.push({ f, ms, kind: "every" }), made.length), setTimeout: (f, ms) => (made.push({ f, ms, kind: "first" }), made.length), clearInterval: () => {} };
const flush = () => new Promise((r) => setTimeout(r, 10));
try {
  let n = 0;
  const j = T.every("sync job", 1000, () => { n++; }, { first: 50, clock });
  ok("a job: its interval, and a first run sooner when asked", made.some((m) => m.kind === "every" && m.ms === 1000) && made.some((m) => m.kind === "first" && m.ms === 50));
  made.find((m) => m.kind === "every").f(); made.find((m) => m.kind === "every").f();
  ok("each tick runs it and counts it", n === 2 && j.runs === 2 && !j.running);
  let release; const slow = T.every("slow job", 1000, () => new Promise((r) => { release = r; }), { clock });
  const tick = made[made.length - 1].f; tick(); tick(); tick();
  ok("never twice at once: ticks while it's going are skipped, and counted", slow.running && slow.skipped === 2 && slow.runs === 0);
  release(); await flush();
  ok("…and it's done when its promise is", !slow.running && slow.runs === 1);
  let boom = true; const b = T.every("flaky job", 1000, () => { if (boom) throw new Error("disk full"); }, { clock }), bt = made[made.length - 1].f;
  bt();
  let st = T.timersState().find((x) => x.name === "flaky job");
  ok("a throw is kept, not dropped: the job says it failed and what it said", st.state === "failed" && st.error === "disk full" && b.fails === 1, st);
  boom = false; await new Promise((r) => setTimeout(r, 5)); bt();
  st = T.timersState().find((x) => x.name === "flaky job");
  ok("…and is idle again once a run goes through, the last error still there to see", st.state === "idle" && st.fails === 1 && st.runs === 2, st);
  const rj = T.every("rejecting job", 1000, () => Promise.reject(new Error("timeout")), { clock }); made[made.length - 1].f(); await flush();
  ok("a rejected promise is a failure too", T.timersState().find((x) => x.name === "rejecting job").state === "failed" && rj.error === "timeout");
  ok("runNow runs one by name, as its tick would", T.runNow("sync job") && n === 3 && !T.runNow("no such job"));
  T.stopAll();
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const bare = server.split("\n").filter((l) => /setInterval\(/.test(l) && !/const w = setInterval\(\(\) => \{ const b = workGoing\(\)/.test(l));
  ok("the server's background work all goes through the registry (but the update's own wait)", bare.length === 0, bare.map((l) => l.trim().slice(0, 100)));
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
console.log(`\n${fail ? "✗" : "✓"} timers: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
