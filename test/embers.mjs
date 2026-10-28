// Embers: every amber orb on Home stands for something only the user can act on. On
// 19 Oct 2026 Home showed 5 amber orbs (the symbiot lane's waiting tasks, each "waiting on
// your answer") under an empty "Only the user can do": the lane's agent waited on a step
// (waiting.json) whose card was gone, so nothing behind the orbs could be acted on, and the
// step (a key to paste) had been done on Home already. Isolated HOME, set before the modules load.
//
//   node test/embers.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-embers-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_VAULT = "file";
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { homeState, workScene, homeAnswer, dismissCard, cardKey } = await import("../home.mjs");
const { waitingFor, needsOf } = await import("../agents.mjs");
const { saveSecret } = await import("../vault.mjs");
const { onUser, loadJobs, syncTasks } = await import("../jobs.mjs");

const LANE = join(HOME, "symbiot"), STEP = "👤 You (only you: your Lemon Squeezy sign-in): at app.lemonsqueezy.com in your own Chrome, in test mode, make a store called Symbiot, then under Settings → API make a key and paste it on Home, where it's saved to the vault by itself";
mkdirSync(join(LANE, ".symbiot"), { recursive: true });
const wait = (at = Date.now() - 60000, step = STEP) => writeFileSync(join(LANE, ".symbiot", "waiting.json"), JSON.stringify({ step, files: [], at }));
// the lane's last run, ended, as agentsList gives it: waiting and needs read from its folder now
let runs = 0; // each wait is a new run's (Skip drops a card by its run's id)
const run = (id = "w" + ++runs) => { const w = waitingFor(LANE); return { id, name: "symbiot", path: LANE, status: "done", startedAt: Date.now() - 3600000, endedAt: Date.now() - 120000, ask: { questions: [] }, waiting: w, needs: needsOf(LANE, { waiting: w, end: Date.now() - 120000 }) }; };
const TASKS = ["Lemon Squeezy checkout", "Renewal keys", "One-button cards", "Plan drafts", "Deploy only site changes", "Next free day"].map((t, i) => ({ id: "t" + i, text: t, repo: "symbiot", ts: Date.now() - 3600000 }));
const deps = (agents) => ({ agents: () => agents, pending: () => [], tasks: () => TASKS, repos: () => ({ symbiot: LANE }), stuck: () => [], drafts: () => [], parked: () => [], cmd: () => "claude -p", brief: () => ({ at: 0, tasks: [] }), lastRun: () => 0, beside: () => new Set(), config: () => ({ peakGuard: false }), board: () => ({ cards: [] }), reports: () => ({ count: 0 }), lanes: () => ({ handoffs: [] }), marketing: () => false, phone: () => ({}), next: {} });
// What Home lights: a needs-you orb per card, and on the work view an orb per waiting task (5 at most) that has a card to open.
// Home writes its cards to the job record and the work view reads them back from it (jobs.mjs onUser), as the app does.
function embers(agents, { record = true } = {}) {
  const d = deps(agents), h = homeState({ fresh: true, deps: d }), w = workScene({ deps: record ? { ...d, onUser: () => onUser() } : d });
  const lit = w.waiting.slice(0, 5).filter((x) => x.why.path), cards = h.you.filter((y) => y.fix === "needs");
  return { h, w, lit, cards, behind: lit.filter((x) => cards.some((y) => y.path === x.why.path)) };
}

try {
  console.log("A STEP WITH ITS CARD — the orbs and the card match");
  wait();
  let e = embers([run("r1")]);
  ok("the waiting step is a card under Needs you", e.cards.length === 1 && e.cards[0].id === "needs:r1" && /lemonsqueezy\.com/.test(e.cards[0].q), e.h.you);
  ok("…and each lit waiting task opens that card (5 orbs, 5 with a card behind them)", e.lit.length === 5 && e.behind.length === e.lit.length, e.w.waiting.map((x) => x.why));
  ok("…saying it waits on a step of the user's, not on an answer to a question", /step only you can do/.test(e.lit[0].why.text), e.lit[0].why);

  console.log("THE CARD GONE — no orb with nothing behind it, and the lane isn't held");
  homeAnswer("needs:r1", { pick: 1 }, { agents: () => [run("r1")] });
  e = embers([run("r1")]);
  ok("Skip on the card: no card, and no lit orb", e.cards.length === 0 && e.lit.length === 0, { you: e.h.you, why: e.w.waiting.map((x) => x.why) });
  ok("…and the lane's wait is cleared, so its agent can start", waitingFor(LANE) === null && !existsSync(join(LANE, ".symbiot", "waiting.json")));

  wait(Date.now() - 30000, STEP.replace("a store called Symbiot", "the Symbiot store"));
  const card = embers([run()]).cards[0];
  ok("a new wait brings its card back", !!card && card.fix === "needs", card);
  dismissCard(cardKey(card));
  e = embers([run()]);
  ok("dismissed with ×: no card, no lit orb, the wait cleared", e.cards.length === 0 && e.lit.length === 0 && waitingFor(LANE) === null, e.w.waiting.map((x) => x.why));

  console.log("THE STEP DONE ON HOME — a pasted key clears it");
  wait(Date.now() - 30000, STEP.replace("make a store called Symbiot", "check the Symbiot store"));
  ok("(the wait holds before the key is pasted)", !!waitingFor(LANE));
  saveSecret("lemon squeezy api key (test mode)", "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln");
  e = embers([run()]);
  ok("the key saved after the wait began meets the step: the wait goes, with its card and its orbs", waitingFor(LANE) === null && e.cards.length === 0 && e.lit.length === 0, e.w.waiting.map((x) => x.why));
  const ans = readFileSync(join(LANE, ".symbiot", "ANSWERS.md"), "utf8");
  ok("…and its agent is told it's done and where the key is (by name, never the key)", /Done: the user pasted it on Home, and it's in Symbiot's vault as "lemon squeezy api key \(test mode\)"/.test(ans) && !ans.includes("eyJ"), ans);

  console.log("A SITE'S OWN SETTINGS ARE NOT SYMBIOT'S");
  const { answerQuestions } = await import("../agents.mjs");
  const LS = join(HOME, "ls"), gh = join(HOME, "gh"); for (const d of [LS, gh]) mkdirSync(join(d, ".symbiot"), { recursive: true });
  writeFileSync(join(HOME, ".config", "symbiot", "runs.json"), JSON.stringify([LS, gh].map((path) => ({ path, name: "x", startedAt: Date.now() - 60000 }))));
  writeFileSync(join(LS, ".symbiot", "QUESTIONS.md"), `## Questions\n### How should the test store get made?\n- ${STEP} (recommended)\n- 🤖 Agent: try it another way\n`);
  writeFileSync(join(gh, ".symbiot", "QUESTIONS.md"), "## Questions\n### Allow gh again?\n- 👤 You: allow gh in Settings\n- Skip this part\n");
  const an = answerQuestions(LS, [{ q: "How should the test store get made?", a: STEP }]);
  ok("a step under a site's Settings → API doesn't say the agent waits on its command in Settings → Handoff", an.yours && !/agent command|Settings → Handoff/.test(an.note || "") && waitingFor(LS) && !waitingFor(LS).cmd, an);
  ok("…while \"allow gh in Settings\" still does", /agent command \(Settings → Handoff\)/.test(answerQuestions(gh, [{ q: "Allow gh again?", a: "👤 You: allow gh in Settings" }]).note || ""));

  console.log("EVERY ORB IS SOMETHING TO ACT ON");
  // not a key to paste: the vault holds that one by now, so Home rightly shows no card for it
  const PHONE_STEP = "👤 You (only you: your phone): tap Yes on the sign-in prompt your phone shows for app.lemonsqueezy.com";
  wait(Date.now() - 30000);
  const asks = { id: "r2", name: "atlas", path: join(HOME, "atlas"), status: "done", startedAt: Date.now() - 600000, endedAt: Date.now() - 1000, ask: { questions: [{ q: "Which number should the test call go to?", options: ["Yours (recommended)", "Skip"] }] } };
  e = embers([asks]);
  ok("a lane waiting on no card (wait file left, step already met) lights nothing", e.lit.length === 0, e.w.waiting.map((x) => x.why));
  ok("…while a lane with a question lights its tasks, each opening that question's card", embers([asks, { ...asks, id: "r3", name: "symbiot", path: LANE, ask: { questions: [{ q: "Monthly or yearly first?" }] } }]).lit.every((x) => x.why.path === LANE));
  for (const [what, ag] of [["a step with its card", () => (wait(Date.now() + 1000, PHONE_STEP), [run()])], ["that card dismissed", () => { const c = embers([run()]).cards[0]; if (c) dismissCard(cardKey(c)); return [run()]; }], ["nothing at all", () => []]]) {
    const x = embers(ag());
    ok(`the count of embers equals the count of things the user can act on (${what}: ${x.lit.length})`, x.lit.length === x.behind.length && (x.lit.length > 0) === (x.cards.length > 0) && (what !== "a step with its card" || x.lit.length === 5), { lit: x.lit.length, behind: x.behind.length, cards: x.cards.length });
  }

  console.log("A CARD WITH NO QUESTION IN IT — never under Needs you, and its lane's tasks say what really holds them");
  // 27 Oct 2026: "another lane needs you / They wait on you for." held three another lane tasks: two "prepare this fully,
  // then ask" tasks and a CI read blocked by GitHub billing
  const { blankAsk } = await import("../needs.mjs");
  ok("a card cut off on \"for\" is blank", blankAsk({ kind: "ask", raw: "", q: "They wait on you for.", sub: "They wait on you for." }) && !blankAsk({ kind: "ask", q: "Which account should I sign in with?" }));
  ok("…and a run whose last words point at its Workdesk questions leaves no card", needsOf(LANE, { final: "Ten items stay [~]. They wait on you for `{#kea-realtime-turns}` and `{#ns-switch}` on Workdesk.", end: Date.now() - 1000 }) === null);
  wait(Date.now() + 3000, PHONE_STEP.replace("tap Yes", "tap Allow"));
  const PREP = { id: "p1", text: "Prepare this fully, then ask the user for their OK in .symbiot/QUESTIONS.md before doing the outward part: switch another lane.co.za's name servers", repo: "symbiot", ts: Date.now() - 3600000 };
  const CI = { id: "p2", text: "Read the CI result for PR 596", repo: "symbiot", ts: Date.now() - 3600000 };
  const pd = { ...deps([run()]), tasks: () => [PREP, CI, TASKS[0]], brief: () => ({ at: 0, tasks: [CI.text] }), waiting: (p, t) => (t === CI.text ? "waits on: GitHub billing, which blocks every CI run" : ""), named: () => true };
  const pw = workScene({ deps: pd }).waiting, whyOf = (id) => (pw.find((x) => x.id === "task:" + id) || {}).why || {};
  ok("a prepare-then-ask task isn't held by the lane's step: it prepares first and asks after", whyOf("p1").kind !== "step" && !whyOf("p1").noGo, whyOf("p1"));
  ok("…a task marked [~] on GitHub billing says that, not that it waits on the user", whyOf("p2").kind === "waiting" && /GitHub billing/.test(whyOf("p2").text), whyOf("p2"));
  ok("…and one the step does hold names the step", whyOf("t0").kind === "step" && /tap Allow/.test(whyOf("t0").text), whyOf("t0"));

  console.log("THE ORBS READ HOME'S CARDS FROM THE JOB RECORD");
  const shut = { id: "r9", name: "atlas", path: join(HOME, "atlas"), status: "done", startedAt: Date.now() - 600000, endedAt: Date.now() - 1000, ask: { questions: [{ q: "Can you close the Symbiot Browser so I can carry on?", options: ["Done (recommended)", "Skip"] }] } };
  const CT = [{ id: "c1", text: "Call flow", repo: "atlas", ts: Date.now() - 3600000 }], cd = { ...deps([shut]), repos: () => ({ symbiot: LANE, atlas: shut.path }), tasks: () => CT };
  homeState({ fresh: true, deps: cd });
  const lit = (w) => w.waiting.filter((x) => x.why.path);
  ok("a question Home drops (close the Symbiot Browser is an agent's wait) is no card", !homeState({ fresh: true, deps: cd }).you.some((y) => y.path === shut.path));
  ok("…and lights no orb, read from the record", lit(workScene({ deps: { ...cd, onUser: () => onUser() } })).length === 0, workScene({ deps: { ...cd, onUser: () => onUser() } }).waiting.map((x) => x.why));
  ok("…where counting the agent's own questions lit one (the old way)", lit(workScene({ deps: cd })).length === 1);
  wait(Date.now() + 2000, PHONE_STEP.replace("tap Yes", "press Yes"));
  const h9 = homeState({ fresh: true, deps: deps([run("r10")]) }), rec = onUser();
  ok("every card on Home is a job waiting on the user, and nothing else is", rec.length === h9.youCount && h9.you.every((y) => rec.some((r) => r.id === y.id)), { rec, you: h9.you.map((y) => y.id) });
  const w9 = workScene({ deps: { ...deps([run("r10")]), onUser: () => onUser(), syncTasks } }), held9 = loadJobs().filter((j) => j.kind === "task" && j.state === "queued" && j.waitingOn === "user");
  ok("the tasks behind lit orbs are on the record as queued, waiting on the user", held9.length === TASKS.length && lit(w9).length === TASKS.length, loadJobs().filter((j) => j.kind === "task").map((j) => [j.key, j.state, j.waitingOn]));
  homeState({ fresh: true, deps: deps([]) });
  ok("a card that left Home is done on the record", !onUser().some((y) => y.id === "needs:r10") && loadJobs().some((j) => j.key === "you:needs:r10" && j.state === "done"), loadJobs().map((j) => [j.key, j.state]));
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
