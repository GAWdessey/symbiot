// A queued run Symbiot decides not to start leaves one line saying why (.symbiot/not-started.log). Isolated HOME.
//   node test/notstarted.mjs
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const HOME = mkdtempSync(join(tmpdir(), "symbiot-notstarted-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const C = join(HOME, ".config", "symbiot"); mkdirSync(C, { recursive: true });
writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")] }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const a = await import("../agents.mjs");
const lane = join(HOME, "work", "lane"), sym = join(lane, ".symbiot");
mkdirSync(sym, { recursive: true });
const log = join(sym, "not-started.log"), lines = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
try {
  console.log("1) THE REASON IS LOGGED ONCE, AND AGAIN WHEN IT CHANGES");
  ok("first reason is written", a.notStarted(lane, "the hourly cap is used", 1000) === true);
  ok("the same reason again is not", a.notStarted(lane, "the hourly cap is used", 61000) === false);
  ok("a different reason is", a.notStarted(lane, "the lane is parked", 121000) === true);
  const l = lines();
  ok("two lines, each with a time and the reason", l.length === 2 && /^\d{4}-.*Z not started: the hourly cap is used$/.test(l[0]) && /not started: the lane is parked$/.test(l[1]), l);

  console.log("2) continueLanes NAMES WHY A LANE WITH OPEN WORK STARTED NOTHING");
  rmSync(log, { force: true });
  writeFileSync(join(sym, "TASKS.md"), "# t\n- [ ] do a thing\n");
  writeFileSync(join(sym, "agent.log"), "x");
  writeFileSync(join(C, "runs.json"), JSON.stringify([{ path: lane, name: "Agent: lane", startedAt: Date.now() }]));
  let started = 0;
  a.continueLanes({ now: Date.now(), run: () => { started++; return { busy: true }; } }); // ended just now: too soon
  ok("too soon is named", lines().some((x) => /ended under 2 minutes ago/.test(x)), lines());
  a.continueLanes({ now: Date.now() + 10 * 60000, run: () => { started++; return { blocked: true, note: "Claude is down" }; } });
  ok("a blocked start is named with its note", lines().some((x) => /start was blocked: Claude is down/.test(x)), lines());
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
