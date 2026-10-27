// A task under a name that's no lane (tasks.mjs laneOfRepo, placeTasks, refileTask, unplacedTasks;
// home.mjs unplacedCards): f3440e9ee59f sat queued under "symbiot-825733", a copy of the repo's
// folder, and 3a7c3f92ebe9 and 81cc1e7f7528 under an ops run's title, "Agent: **Resume the
// bookly.co.za jobs…", with nothing to pick them up (16 Oct 2026). A name that stands for a lane
// goes to it; one that stands for none is put to you on Home; and any task can be re-filed in
// another lane from its row on the Workdesk. Isolated HOME.
//
//   node test/refile.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-refile-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const T = await import("../tasks.mjs");
const H = await import("../home.mjs");
const LANES = ["symbiot", "bookly", "marketing", "ops"];
const AGENT = "Agent: **Resume the bookly.co.za jobs that were blocked…";

try {
  console.log("THE LANE A NAME STANDS FOR");
  ok("a lane's own name, in any case", T.laneOfRepo("symbiot", LANES) === "symbiot" && T.laneOfRepo("Bookly", LANES) === "bookly");
  ok("a copy of a repo's folder (symbiot-825733) is that repo's lane", T.laneOfRepo("symbiot-825733", LANES) === "symbiot");
  ok("an ops run's folder is ops", T.laneOfRepo("act-304032d6", LANES) === "ops");
  ok("a name nearly a lane's (a typo) is that lane", T.laneOfRepo("symbio", LANES) === "symbiot");
  ok("a name that's a lane's folder (old-name living in ~/newdir) is that lane", T.laneOfRepo("newdir", ["old-name", "ops"], { newdir: "old-name" }) === "old-name");
  ok("…a folder name for a lane that isn't there stands for none", T.laneOfRepo("newdir", LANES, { newdir: "gone" }) === "");
  ok("an ops run's title stands for none: it isn't guessed from a word in it", T.laneOfRepo(AGENT, LANES) === "");
  ok("…nor does a name like no lane", T.laneOfRepo("quokka", LANES) === "" && T.laneOfRepo("", LANES) === "");

  console.log("ON THE LIST ALREADY — sync puts them in their lane");
  const list = () => [
    { id: "f3440e9ee59f", text: "Fix a Symbiot flaw: Cloudflare's human check fails in the Symbiot Browser", repo: "symbiot-825733", done: false, ts: 1 },
    { id: "057c1abd8b13", text: "Workdesk task f3440e9ee59f was filed under lane 'symbiot-825733', which is not a real lane. It belongs here. Full text of the task: Fix a Symbiot flaw: Cloudflare's human check fails in the Symbiot Browser. Example: 3a7c3f92ebe9 had the same fault.", repo: "symbiot", done: false, ts: 2 },
    { id: "aaaaaaaaaaaa", text: "Make the Workdesk's filter remember its lane", repo: "Symbio", done: false, ts: 3 },
    { id: "3a7c3f92ebe9", text: "Move bookly.co.za's domains.co.za account out of Alex's name", repo: AGENT, done: false, ts: 4 },
    { id: "bbbbbbbbbbbb", text: "Ship the fix", repo: "symbiot-123abc", review: true, done: false, ts: 5 },
    { id: "81cc1e7f7528", text: "Add the token to SMS Portal's inbound webhook on switch day", repo: AGENT, done: false, ts: 6 },
    { id: "c3e9e4e294ff", text: "Workdesk task 81cc1e7f7528 was filed under an agent's name, not a lane. It is yours: Add the token to SMS Portal's inbound webhook on switch day.", repo: "bookly", done: false, ts: 7 },
    { id: "ffffffffffff", text: "Move the domain's account into Acme Inc's name", repo: AGENT, done: false, ts: 8 },
    { id: "999999999999", text: "Task ffffffffffff is yours: Move the domain's account into Acme Inc's name.", repo: "bookly", done: true, archived: true, ts: 9 },
    { id: "888888888888", text: "Task 3a7c3f92ebe9 is yours: Move bookly.co.za's domains.co.za account out of Alex's name", repo: "bookly", done: true, archived: true, cancelled: true, ts: 10 },
  ];
  const t = list(), n = T.placeTasks(t, LANES, 1000), by = (id) => t.find((x) => x.id === id);
  ok("one another task in its lane names (a handover of it) is merged into that one: its job is done there", by("f3440e9ee59f").archived && by("f3440e9ee59f").merged && by("f3440e9ee59f").removedBy === "057c1abd8b13", by("f3440e9ee59f"));
  ok("one with no such task goes to the lane its name stands for, saying where it was", by("aaaaaaaaaaaa").repo === "symbiot" && !by("aaaaaaaaaaaa").archived && by("aaaaaaaaaaaa").refiled.from === "Symbio", by("aaaaaaaaaaaa"));
  ok("one whose name stands for no lane keeps it, though a task elsewhere mentions its id (as an example, its words not carried)", by("3a7c3f92ebe9").repo === AGENT && !by("3a7c3f92ebe9").refiled, by("3a7c3f92ebe9"));
  ok("…unless a lane's task names its id (ops handed it on): merged into that one", by("81cc1e7f7528").archived && by("81cc1e7f7528").removedBy === "c3e9e4e294ff", by("81cc1e7f7528"));
  ok("…or names it and was done there since", by("ffffffffffff").archived && by("ffffffffffff").removedBy === "999999999999", by("ffffffffffff"));
  ok("…but not one you removed", !by("3a7c3f92ebe9").archived, by("3a7c3f92ebe9"));
  ok("one waiting for your OK is left where it is", by("bbbbbbbbbbbb").repo === "symbiot-123abc", by("bbbbbbbbbbbb"));
  ok("…and it counts what it moved", n === 4, n);

  console.log("ON HOME — a task no lane picks up is put to you");
  const left = T.unplacedTasks(t, LANES);
  ok("what's still under a name that's no lane, by that name", Object.keys(left).length === 1 && left[AGENT].length === 1 && left[AGENT][0].id === "3a7c3f92ebe9", left);
  ok("…none when no lanes were read (nothing is known to be wrong)", Object.keys(T.unplacedTasks(t, ["ops"])).length === 0);
  const two = [...t, { id: "eeeeeeeeeeee", text: "Add the token to SMS Portal's inbound webhook on switch day", repo: AGENT, done: false, ts: 6 }];
  const cards = H.unplacedCards(two, LANES), c = cards[0];
  ok("a card per name, opening the Workdesk on them", cards.length === 1 && c.kind === "lane" && c.shape === "tasks" && c.repo === AGENT, cards);
  ok("…saying in plain words what's wrong and what to do", /^2 tasks are under “Resume the bookly\.co\.za jobs/.test(c.title) && /which is no lane$/.test(c.title) && /nothing picks them up/.test(c.sub) && /and 1 more\. Pick their lane on the Workdesk$/.test(c.sub) && !/\*/.test(c.title + c.sub), c);

  console.log("RE-FILED FROM THE WORKDESK");
  let saved = null; const store = list(), io = { load: () => store, save: (x) => { saved = x; }, names: LANES };
  const r = T.refileTask("3a7c3f92ebe9", "bookly", io);
  ok("a task goes to the lane picked, saying where it was", r.ok && r.repo === "bookly" && saved && saved.find((x) => x.id === "3a7c3f92ebe9").repo === "bookly" && saved.find((x) => x.id === "3a7c3f92ebe9").refiled.from === AGENT, [r, saved && saved.find((x) => x.id === "3a7c3f92ebe9")]);
  ok("…a lane's name as typed is that lane", T.refileTask("aaaaaaaaaaaa", "Marketing", io).repo === "marketing");
  ok("…not a name that's no lane", /no lane called quokka/.test(T.refileTask("aaaaaaaaaaaa", "quokka", io).error || ""));
  ok("…nor one waiting for your OK", /approve it or send it back/.test(T.refileTask("bbbbbbbbbbbb", "bookly", io).error || ""));
  ok("…nor one that's gone", /isn't open/.test(T.refileTask("nope", "bookly", io).error || ""));
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} refile: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
