// Urgent work goes first (agents.mjs urgentFirst, tasks.mjs, mind.mjs): "symbiot
// keeps crashing" waited behind a routine run in its own lane and 5 more tasks, and
// Garth parked argena and steve by hand (2026-10-08). Isolated HOME (set before the
// modules load); runs are stand-ins.
//
//   node test/urgent.mjs
//
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-urgent-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { isUrgent, urgentFirst, urgentDone, urgentSweep, urgentState } = await import("../agents.mjs");
const { buildTasksMd } = await import("../tasks.mjs");
const { actIn } = await import("../mind.mjs");
const cfg = () => JSON.parse(readFileSync(join(CFG, "config.json"), "utf8"));
const lane = (name) => { const p = join(HOME, "projects", name); mkdirSync(join(p, ".symbiot"), { recursive: true }); return p; };
const symbiot = lane("symbiot"), steve = lane("steve"), argena = lane("argena"), quiet = lane("quiet"), mine = lane("mine");
const map = { symbiot, steve, argena, quiet, mine };

try {
  console.log("URGENT — what counts");
  for (const t of ["symiot keep crashing", "still crashing", "URGENT, do this first: the app", "Symbiot won't start since the update", "that is what SHOULD happen", "fix the login, it comes first", "this takes priority over the layout"])
    ok(`urgent: "${t}"`, isUrgent(t), t);
  for (const t of ["Fix the Home page layout. It's broken in the running app", "Read .symbiot/TASKS.md and ANSWERS.md first", "Update the README and CHANGELOG", "Add an API key field", "run the tests in a way that can't crash him"])
    ok(`routine: "${t}"`, !isUrgent(t), t);

  console.log("URGENT — the brief puts it on top, whatever kind it is");
  const md = buildTasksMd("symbiot", {}, [{ text: "Fix the Home page layout" }, { text: "Add a Docs page for the changelog" }, { text: "URGENT, do this first. Symbiot keeps crashing; update the docs after" }]);
  const tasks = md.slice(md.indexOf("## Tasks"));
  ok("an Urgent section comes before Fixes", /### Urgent: do these first[\s\S]*keeps crashing[\s\S]*### Fixes/.test(tasks), tasks.slice(0, 400));
  ok("the urgent task is in it once", (tasks.match(/keeps crashing/g) || []).length === 1, tasks.slice(0, 400));
  ok("no Urgent section when nothing is", !/### Urgent/.test(buildTasksMd("symbiot", {}, [{ text: "Fix the Home page layout" }])), "");

  console.log("URGENT — the other lanes park, the lane's routine run stops");
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ parked: [mine] }));
  writeFileSync(join(argena, ".symbiot", "TASKS.next.md"), "## Tasks\n- [ ] the class bible\n"); // waiting behind its run
  const going = new Set([symbiot, steve, mine]), stopped = [];
  const running = (p) => (going.has(p) ? { id: "run-" + p.split("/").pop(), pid: 1 } : null);
  writeFileSync(join(symbiot, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Fix the Home page layout\n"); // the routine run's brief
  const u1 = urgentFirst(symbiot, { lanes: map, running, stop: (p) => { stopped.push(p); return true; } });
  ok("steve (running) and argena (work waiting) park; a quiet lane doesn't", u1.parked.join() === "steve,argena", u1);
  ok("a lane you parked yourself isn't counted as Symbiot's", !cfg().urgent.parked.includes(mine) && cfg().parked.includes(mine), cfg());
  ok("they're parked in config, in that order", cfg().parked.join() === [mine, steve, argena].join(), cfg().parked);
  ok("symbiot's routine run is stopped so the urgent one starts now", u1.stopped && stopped.join() === symbiot, { u1, stopped });

  console.log("URGENT — a second urgent message doesn't stop the urgent run");
  going.delete(symbiot); going.add(symbiot); // the urgent run, started after the stop
  const st = urgentState(); st.runs.push("run-symbiot"); writeFileSync(join(CFG, "config.json"), JSON.stringify({ ...cfg(), urgent: st }));
  stopped.length = 0;
  const u2 = urgentFirst(symbiot, { lanes: map, running, stop: (p) => { stopped.push(p); return true; } });
  ok("'still crashing' leaves the run that's on it alone", !u2.stopped && !stopped.length, { u2, stopped });
  ok("nothing parks twice", !u2.parked.length && cfg().parked.join() === [mine, steve, argena].join(), [u2, cfg().parked]);

  console.log("URGENT — when it's done, the parked work resumes in its old order");
  going.delete(symbiot);
  const started = [];
  const d = urgentDone(symbiot, "run-symbiot", { running, start: (p) => { started.push(p); return { id: "n-" + p }; } });
  ok("steve and argena are unparked, in that order; yours stays parked", d && d.unparked.join() === [steve, argena].join() && cfg().parked.join() === mine, [d, cfg().parked]);
  ok("argena's waiting work starts", started.includes(argena) || (d && d.resumed.includes(argena)), [started, d]);
  ok("the urgent state is cleared", !urgentState(), cfg());
  ok("a run that wasn't the urgent one ending changes nothing", urgentDone(symbiot, "run-other", { running }) === null, "");

  console.log("URGENT — the sweep lets go if the app restarted under it");
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ parked: [steve], urgent: { at: Date.now(), paths: [symbiot], parked: [steve], runs: ["gone"] } }));
  ok("its run isn't going any more: steve is unparked", !!urgentSweep({ running: () => null, start: () => null }) && !(cfg().parked || []).length && !urgentState(), cfg());
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ parked: [steve], urgent: { at: Date.now(), paths: [symbiot], parked: [steve], runs: [] } }));
  ok("one that hasn't started yet holds", urgentSweep({ running: () => null }) === null && cfg().parked.join() === steve, cfg());
  ok("…but not past 6 hours", !!urgentSweep({ running: () => null, now: Date.now() + 7 * 3600e3, start: () => null }) && !(cfg().parked || []).length, cfg());

  console.log("URGENT — Home's hand-over says what got parked");
  writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
  const add = (text, l) => ({ id: "t1", text, repo: l }), push = () => ({ written: [{}] });
  const firstCalls = [];
  const a1 = actIn("symbiot keeps crashing", "symbiot", { map, add, push, run: () => ({ busy: true }), first: (p, o) => { firstCalls.push(p); return { parked: ["steve", "argena"], stopped: true, o }; } });
  ok("an urgent ask parks the rest and says so", firstCalls.join() === symbiot && a1.urgent && a1.urgent.parked.join() === "steve,argena", a1);
  const a2 = actIn("Fix the Home page layout", "symbiot", { map, add, push, run: () => ({ busy: true }), first: () => { throw new Error("called"); } });
  ok("a routine one doesn't", !a2.urgent && a2.queued, a2);
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} urgent: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
