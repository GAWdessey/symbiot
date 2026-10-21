// One look per tick: Home, the work scene and the Agents list are built once on the 10 s
// tick and the routes read what it built, and Approve doesn't hold its request for the
// whole ship (20 Oct 2026: WORK_KEEP 8 s was shorter than the tick, /api/home took 3.2 s,
// Approve held its request for up to 709 s). Isolated HOME, set before the modules load.
//
//   node test/snapshot.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-snapshot-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_VAULT = "file";
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { homeState, homeTick, HOME_LOOKED, workScene, forgetWork, WORK_KEEP } = await import("../home.mjs");
const { agentsNow, forgetAgents, AGENTS_KEEP, HANDOFFS } = await import("../agents.mjs");
const { shipJob, shipJobOf } = await import("../tasks.mjs");

try {
  console.log("THE WORK SCENE — the tick builds it, the routes read it");
  ok("it's kept longer than the 10 s tick, so the tick's build is the one the routes get", WORK_KEEP > 10000, WORK_KEEP);
  const w1 = workScene(), w2 = workScene();
  ok("two looks in a row: the second reads the first's build", w1 === w2);
  const w3 = workScene({ fresh: true });
  ok("the tick (fresh) builds it afresh…", w3 !== w1);
  ok("…and that build is what the next look reads", workScene() === w3);
  forgetWork();
  ok("after something you did (a POST): built afresh", workScene() !== w3);

  console.log("THE AGENTS LIST — built once for every screen that shows it");
  const a1 = agentsNow(), a2 = agentsNow();
  ok("two asks in a row share one build", a1 === a2);
  ok("…until it's older than its keep", agentsNow({ now: Date.now() + AGENTS_KEEP + 1 }) !== a1);
  const a3 = agentsNow(); forgetAgents();
  ok("forgotten (a POST): built afresh", agentsNow() !== a3);
  const a4 = agentsNow(), dir = join(HOME, "lane"); mkdirSync(join(dir, ".symbiot"), { recursive: true });
  HANDOFFS.unshift({ id: "h1", name: "lane", path: dir, log: join(dir, ".symbiot", "agent.log"), status: "running", startedAt: Date.now() });
  const a5 = agentsNow();
  ok("a run starting builds it afresh, with the run in it", a5 !== a4 && a5.some((a) => a.id === "h1"), a5.map((a) => a.id));
  HANDOFFS[0].status = "done"; HANDOFFS[0].endedAt = Date.now();
  ok("…and so does its end", agentsNow() !== a5 && agentsNow().find((a) => a.id === "h1").status === "done");
  HANDOFFS.shift();

  console.log("HOME — built on the tick while someone is looking");
  const h1 = homeState();
  homeTick();
  const h2 = homeState();
  ok("looked at just now: the tick builds it, and the look reads that build", h2 !== h1 && h2.at >= h1.at);
  homeTick({ now: Date.now() + HOME_LOOKED + 1 });
  ok("nobody looking for a while: the tick builds nothing", homeState() === h2);
  // the work scene reads Home's cards from the job record (jobs.mjs): that read is the tick's, not a look
  const T0 = Date.now(), h3 = homeState({ fresh: true }); await sleep(1100);
  workScene({ fresh: true }); homeTick({ now: T0 + HOME_LOOKED + 500 });
  ok("…and the work scene reading Home on the tick doesn't count as someone looking", homeState({ tick: true }) === h3);

  console.log("APPROVE — a job, not a request held for the whole ship");
  const quick = await shipJob("quick", async () => ({ error: "Nothing awaiting review for quick." }), { wait: 200 });
  ok("a quick answer (a refusal) comes back as it is", quick.error === "Nothing awaiting review for quick." && !quick.job, quick);
  ok("…and leaves no job behind", shipJobOf("quick").none === true, shipJobOf("quick"));
  let finish; const slow = new Promise((r) => { finish = r; });
  const t0 = Date.now(), first = await shipJob("slow", () => slow, { wait: 100 });
  ok("a long ship answers at once with its job", first.job === "slow" && first.working && Date.now() - t0 < 1000, first);
  ok("…which says it's still going", shipJobOf("slow").working === true, shipJobOf("slow"));
  const again = await shipJob("slow", async () => ({ ok: true, twice: true }), { wait: 100 });
  ok("a second Approve meanwhile doesn't start another ship", again.working && !again.twice, again);
  finish({ ok: true, pr: "https://github.com/o/r/pull/1", approved: 2 });
  await sleep(20);
  const got = shipJobOf("slow");
  ok("once it's done, the card reads how it went", got.done && got.result.pr === "https://github.com/o/r/pull/1" && got.result.approved === 2, got);
  const boom = await shipJob("boom", async () => { await sleep(150); throw new Error("git fell over"); }, { wait: 50 });
  await sleep(200);
  ok("a ship that throws ends as an error on the card, not a job going forever", boom.job && shipJobOf("boom").done && /git fell over/.test(shipJobOf("boom").result.error), shipJobOf("boom"));
  ok("a finished job is forgotten after a while", shipJobOf("slow", Date.now() + 31 * 60000).none === true);
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
