// Urgent work goes first (agents.mjs urgentFirst, tasks.mjs, mind.mjs): "symbiot
// keeps crashing" waited behind a routine run in its own lane and 5 more tasks, and
// Pat parked meridian and robin by hand (2026-10-08). Isolated HOME (set before the
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

const { isUrgent, urgentFirst, urgentDone, urgentSweep, urgentState, isParked } = await import("../agents.mjs");
const { buildTasksMd } = await import("../tasks.mjs");
const { actIn, converse } = await import("../mind.mjs");
const cfg = () => JSON.parse(readFileSync(join(CFG, "config.json"), "utf8"));
const lane = (name) => { const p = join(HOME, "projects", name); mkdirSync(join(p, ".symbiot"), { recursive: true }); return p; };
const symbiot = lane("symbiot"), robin = lane("robin"), meridian = lane("meridian"), quiet = lane("quiet"), mine = lane("mine");
const map = { symbiot, robin, meridian, quiet, mine };

try {
  console.log("URGENT — what counts");
  for (const t of ["symiot keep crashing", "still crashing", "URGENT, do this first: the app", "Symbiot won't start since the update", "fix the login, it comes first", "this takes priority over the layout"])
    ok(`urgent: "${t}"`, isUrgent(t), t);
  // no capitals rule: SMTP made a task urgent and killed the lane's run mid-edit (15 Oct 2026)
  for (const t of ["Fix the Home page layout. It's broken in the running app", "Read .symbiot/TASKS.md and ANSWERS.md first", "Update the README and CHANGELOG", "Add an API key field", "run the tests in a way that can't crash him", "that is what SHOULD happen", "Fix the SMTP relay", "Add CORS headers", "Store a UUID per device", "Set up NGINX", "add a GDPR notice"])
    ok(`routine: "${t}"`, !isUrgent(t), t);
  const { urgentStop } = await import("../agents.mjs");
  ok("only an outright urgent/crash stops a run already going; \"comes first\" queues it", urgentStop("URGENT: fix it") && urgentStop("symbiot keeps crashing") && !urgentStop("fix the login, it comes first") && !urgentStop("this takes priority over the layout"), "");

  console.log("URGENT — the brief puts it on top, whatever kind it is");
  const md = buildTasksMd("symbiot", {}, [{ text: "Fix the Home page layout" }, { text: "Add a Docs page for the changelog" }, { text: "URGENT, do this first. Symbiot keeps crashing; update the docs after" }]);
  const tasks = md.slice(md.indexOf("## Tasks"));
  ok("an Urgent section comes before Fixes", /### Urgent: do these first[\s\S]*keeps crashing[\s\S]*### Fixes/.test(tasks), tasks.slice(0, 400));
  ok("the urgent task is in it once", (tasks.match(/keeps crashing/g) || []).length === 1, tasks.slice(0, 400));
  ok("no Urgent section when nothing is", !/### Urgent/.test(buildTasksMd("symbiot", {}, [{ text: "Fix the Home page layout" }])), "");

  console.log("URGENT — the other lanes park, the lane's routine run stops");
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ parked: [mine] }));
  writeFileSync(join(meridian, ".symbiot", "TASKS.next.md"), "## Tasks\n- [ ] the class bible\n"); // waiting behind its run
  const going = new Set([symbiot, robin, mine]), stopped = [];
  const running = (p) => (going.has(p) ? { id: "run-" + p.split("/").pop(), pid: 1 } : null);
  writeFileSync(join(symbiot, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Fix the Home page layout\n"); // the routine run's brief
  const u1 = urgentFirst(symbiot, { lanes: map, running, stop: (p) => { stopped.push(p); return true; } });
  ok("robin (running) and meridian (work waiting) park; a quiet lane doesn't", u1.parked.join() === "robin,meridian", u1);
  ok("a lane you parked yourself isn't counted as Symbiot's", !cfg().urgent.parked.includes(mine) && cfg().parked.includes(mine), cfg());
  ok("they're parked in config, in that order", cfg().parked.join() === [mine, robin, meridian].join(), cfg().parked);
  ok("symbiot's routine run is stopped so the urgent one starts now", u1.stopped && stopped.join() === symbiot, { u1, stopped });

  console.log("URGENT — a second urgent message doesn't stop the urgent run");
  going.delete(symbiot); going.add(symbiot); // the urgent run, started after the stop
  const st = urgentState(); st.runs.push("run-symbiot"); writeFileSync(join(CFG, "config.json"), JSON.stringify({ ...cfg(), urgent: st }));
  stopped.length = 0;
  const u2 = urgentFirst(symbiot, { lanes: map, running, stop: (p) => { stopped.push(p); return true; } });
  ok("'still crashing' leaves the run that's on it alone", !u2.stopped && !stopped.length, { u2, stopped });
  ok("nothing parks twice", !u2.parked.length && cfg().parked.join() === [mine, robin, meridian].join(), [u2, cfg().parked]);

  console.log("URGENT — when it's done, the parked work resumes in its old order");
  going.delete(symbiot);
  const started = [];
  const d = urgentDone(symbiot, "run-symbiot", { running, start: (p) => { started.push(p); return { id: "n-" + p }; } });
  ok("robin and meridian are unparked, in that order; yours stays parked", d && d.unparked.join() === [robin, meridian].join() && cfg().parked.join() === mine, [d, cfg().parked]);
  ok("meridian's waiting work starts", started.includes(meridian) || (d && d.resumed.includes(meridian)), [started, d]);
  ok("the urgent state is cleared", !urgentState(), cfg());
  ok("a run that wasn't the urgent one ending changes nothing", urgentDone(symbiot, "run-other", { running }) === null, "");

  console.log("URGENT — the sweep lets go if the app restarted under it");
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ parked: [robin], urgent: { at: Date.now(), paths: [symbiot], parked: [robin], runs: ["gone"] } }));
  ok("its run isn't going any more: robin is unparked", !!urgentSweep({ running: () => null, start: () => null }) && !(cfg().parked || []).length && !urgentState(), cfg());
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ parked: [robin], urgent: { at: Date.now(), paths: [symbiot], parked: [robin], runs: [] } }));
  ok("one that hasn't started yet holds", urgentSweep({ running: () => null }) === null && cfg().parked.join() === robin, cfg());
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ parked: [robin], urgent: { at: Date.now() - 3 * 60e3, paths: [symbiot], parked: [robin], runs: [] } }));
  ok("one whose run never started lets go after a couple of minutes, not 6 hours", !!urgentSweep({ running: () => null, start: () => null }) && !(cfg().parked || []).length && !urgentState(), cfg());
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ parked: [robin], urgent: { at: Date.now() - 3 * 60e3, paths: [symbiot], parked: [robin], runs: [] } }));
  ok("…but holds while a run is going in the urgent lane", urgentSweep({ running: (p) => (p === symbiot ? { id: "r" } : null) }) === null && cfg().parked.join() === robin, cfg());
  ok("…but not past 6 hours", !!urgentSweep({ running: () => null, now: Date.now() + 7 * 3600e3, start: () => null }) && !(cfg().parked || []).length, cfg());

  console.log("URGENT — Home's hand-over says what got parked");
  writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
  const add = (text, l) => ({ id: "t1", text, repo: l }), push = () => ({ written: [{}] });
  const firstCalls = [];
  const a1 = actIn("symbiot keeps crashing", "symbiot", { map, add, push, run: () => ({ busy: true }), first: (p, o) => { firstCalls.push(p); return { parked: ["robin", "meridian"], stopped: true, o }; } });
  ok("an urgent ask parks the rest and says so", firstCalls.join() === symbiot && a1.urgent && a1.urgent.parked.join() === "robin,meridian", a1);
  const a2 = actIn("Fix the Home page layout", "symbiot", { map, add, push, run: () => ({ busy: true }), first: () => { throw new Error("called"); } });
  ok("a routine one doesn't", !a2.urgent && a2.queued, a2);

  // 2026-10-09: symbiot was parked, so every urgent ask there parked marketing, started
  // nothing, and Home said "it's already on urgent work, and takes this next" with 0 running.
  console.log("URGENT — a parked lane: unparked for it, and it starts");
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ parked: [symbiot] }));
  going.clear(); going.add(robin);
  const realRun = (p) => (isParked(p) ? { blocked: true, parked: true, note: "Parked: its tasks start no agent runs until you unpark it." } : { id: "job-1" });
  const b1 = actIn("URGENT: the answer box on Home wipes what I type", "symbiot", { map, add, push, run: realRun, first: (p, o) => urgentFirst(p, { ...o, running }) });
  ok("it's unparked and its run starts", b1.job === "job-1" && !b1.queued && !b1.notStarted && b1.urgent.unparked && !(cfg().parked || []).includes(symbiot), [b1, cfg()]);
  ok("the lane with a run going parks", b1.urgent.parked.join() === "robin" && cfg().urgent.parked.join() === robin, cfg());

  console.log("URGENT — one that can't start takes its parking back");
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ parked: [mine] }));
  const b2 = actIn("URGENT: fix it", "symbiot", { map, add, push, run: () => ({ blocked: true, questions: 2, note: "Not started: its last run's 2 questions are unanswered." }), first: (p, o) => urgentFirst(p, { ...o, running }) });
  ok("it says it didn't start, and why", !b2.job && !b2.queued && /questions are unanswered/.test(b2.notStarted || ""), b2);
  ok("no urgent record is left, and only your own park stays", !cfg().urgent && cfg().parked.join() === mine, cfg());
  ok("and it doesn't claim to have parked anything", !b2.urgent.parked.length, b2.urgent);

  console.log("URGENT — a run already on urgent work counts as the urgent run");
  writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
  writeFileSync(join(symbiot, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] URGENT: the crash\n");
  going.add(symbiot);
  const u3 = urgentFirst(symbiot, { lanes: map, running, stop: () => { throw new Error("stopped the urgent run"); } });
  ok("it says busy on urgent work, and its id is noted, so its end resumes the rest", u3.busy === "urgent" && cfg().urgent.runs.includes("run-symbiot"), [u3, cfg()]);
  going.delete(symbiot);

  console.log("URGENT — the reply says only what happened");
  const said = async (did) => (await converse({ where: "Home", question: "fix it now", map: { symbiot }, ask: async () => JSON.stringify({ reply: "On it.", do: { agent: "fix it", repo: "symbiot" } }), act: { agent: async () => ({ lane: "symbiot", ok: true, ...did }) } })).reply;
  const r1 = await said({ notStarted: "Parked: its tasks start no agent runs until you unpark it.", urgent: { parked: [], unparked: false } });
  ok("didn't start: says so, never 'already on urgent work' or queued", /not started: Parked/.test(r1) && !/^On it/.test(r1) && !/already on|takes this next|starts once|Parked till/.test(r1), r1);
  const r2 = await said({ job: "j", urgent: { parked: ["marketing"], unparked: true, stopped: false } });
  ok("started: says it started, that it was unparked, and what's parked", /started on it now/.test(r2) && /was parked; I unparked it/.test(r2) && /Parked till it's done: marketing/.test(r2) && !/takes this next/.test(r2), r2);
  const r3 = await said({ queued: true, behind: "urgent", urgent: { parked: [], busy: "urgent" } });
  ok("behind a live urgent run: 'takes this next'", /takes this next/.test(r3), r3);
  const r4 = await said({ notStarted: "Not started: your step comes first." });
  ok("a routine one that didn't start says so too", /not started/.test(r4) && !/on it/i.test(r4) && !/starts once|started on it/.test(r4), r4);
  const keep = (await converse({ where: "Home", question: "here's the key", map: { symbiot }, ask: async () => JSON.stringify({ reply: "Saved it to the vault as \"lemon squeezy api key\".", do: { agent: "wire checkout", repo: "symbiot" } }), act: { agent: async () => ({ lane: "symbiot", ok: true, notStarted: "Not started: your step comes first." }) } })).reply;
  ok("…keeping what the reply said when it claimed nothing (19 Oct 2026: a saved key's reply became the canned not-started line)", /^Saved it to the vault/.test(keep) && /not started/.test(keep), keep);

  // 20 Oct 2026: "can i please have the paddle report?" and "why are these under bookly?" became
  // "Urgent, so it goes first … Parked till it's done: bookly": the chat model wrote "before
  // anything else" into its hand-over, and that was what isUrgent read.
  console.log("URGENT — only the user's own words make it urgent");
  writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
  const calls = [], rec = (p, o) => { calls.push([p, o]); return { parked: [], stopped: false }; };
  const c1 = actIn("Label each card with its lane. Do this before anything else.", "robin", { map, add, push, run: () => ({ id: "j1" }), first: rec, said: "why are these under bookly?", self: "symbiot" });
  ok("the chat's rewrite saying \"before anything else\" isn't urgent", !calls.length && !c1.urgent && c1.job === "j1", c1);
  const c2 = actIn("Look at the bot", "robin", { map, add, push, run: () => ({ id: "j2" }), first: rec, said: "URGENT robin's bot is down", self: "symbiot" });
  ok("their own \"urgent\" is", calls.length === 1 && calls[0][0] === robin && calls[0][1].others && c2.urgent, calls);

  console.log("URGENT — a fix to Symbiot parks no other lane");
  calls.length = 0;
  writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
  going.clear(); going.add(robin);
  const c3 = actIn("Fix the crash on open", "symbiot", { map, add, push, run: () => ({ id: "j3" }), first: (p, o) => { calls.push([p, o]); return urgentFirst(p, { ...o, running }); }, said: "symbiot keeps crashing", self: "symbiot" });
  ok("it's urgent in its own lane and starts", c3.job === "j3" && c3.urgent && calls.length === 1 && calls[0][1].others === false, c3);
  ok("robin, at work, isn't parked", !c3.urgent.parked.length && !isParked(robin) && !(cfg().urgent || { parked: [] }).parked.length, [c3.urgent, cfg()]);
  writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
  const c3b = urgentFirst(symbiot, { lanes: map, running, others: false, stop: () => true });
  ok("urgentFirst with others: false parks nothing, whatever runs", !c3b.parked.length && !isParked(robin), c3b);
  going.clear();
  writeFileSync(join(CFG, "config.json"), JSON.stringify({}));

  console.log("URGENT — a Symbiot flaw raised in chat waits for Go unless they ask for it");
  const got = [], addR = (text, l, o) => { got.push([text, l, o]); return { id: "t" + got.length, text, repo: l }; }, never = () => { throw new Error("started"); };
  const c4 = actIn("Say which lane each idea is for on its card", "symbiot", { map, add: addR, push: never, run: never, first: never, said: "why are these under bookly?", self: "symbiot" });
  ok("a question about it: noted, not started, nothing parked", c4.ok && c4.later && !c4.job && !c4.urgent, c4);
  ok("…with what they said, waiting for Go", got[0][1] === "symbiot" && got[0][2].later === true && got[0][2].said === "why are these under bookly?", got[0]);
  for (const t of ["can i please have the paddle report?", "fix it", "fix that now", "go ahead", "symbiot keeps crashing", "can you make the cards say the lane"]) {
    got.length = 0;
    const c = actIn("The task", "symbiot", { map, add: addR, push, run: () => ({ id: "j" }), first: rec, said: t, self: "symbiot" });
    ok(`asked for: "${t}" starts it`, c.job === "j" && !c.later && got[0][2].later === false, [c, got[0]]);
  }
  for (const t of ["and now we are doing nothing? why?", "why are these under bookly?", "the card today said the wrong lane", "that's wrong"]) {
    const c = actIn("The task", "symbiot", { map, add: addR, push: never, run: never, first: never, said: t, self: "symbiot" });
    ok(`not asked for: "${t}" waits`, c.later, c);
  }
  const c5 = actIn("Fix the robin login", "robin", { map, add: addR, push, run: () => ({ id: "j5" }), first: never, said: "that's wrong", self: "symbiot" });
  ok("another lane's work isn't held back", c5.job === "j5" && !c5.later, c5);
  const fromChat = [];
  const r5 = (await converse({ where: "Home", question: "why are these under bookly?", map: { symbiot }, ask: async () => JSON.stringify({ reply: "I got that wrong. I've started a fix in the symbiot lane.", do: { agent: "label cards", repo: "symbiot" } }), act: { agent: async (req, known, repo, said) => { fromChat.push(said); return { lane: "symbiot", ok: true, later: true, task: "t1" }; } } }));
  ok("the chat hands the user's own words to the hand-over", fromChat[0] === "why are these under bookly?", fromChat);
  ok("its reply says it's noted for Go, never that a fix started", /Noted as a Symbiot bug/.test(r5.reply) && !/started a fix/.test(r5.reply) && /waits/.test(r5.spoken || ""), r5);
  const { userWords } = await import("../agents.mjs");
  const uw = userWords(["- [ ] Label each card with its lane. Why: the user asked twice.", "- [ ] Fix the login"], [{ id: "a", text: "Label each card with its lane. Why: the user asked twice.", said: "why are these under bookly?" }]);
  ok("a model is picked by what the user said for a chat-written task, and a line of theirs as it is", uw === "why are these under bookly?\n- [ ] Fix the login", uw);
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} urgent: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
