// Answered "Only the user can do" cards stay answered (28 Oct 2026). The bookly goal's card asked "Do you
// approve the opt-out wording I drafted?" (the card writer's words for the run's "Not built: The wording for
// the opt-out still needs your OK."). The user answered it in Home's chat and in the card's own chat, which
// started the bookly agent with the standard wording, and had a decision on record never to be asked again.
// The card came back each time, and the goal stayed "waiting on the user". Isolated HOME.
//
//   node test/answeredcards.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-answered-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };
const S = await import("../asksdone.mjs");
const H = await import("../home.mjs");
const G = await import("../goals.mjs");
const J = await import("../jobs.mjs");

const RAW = "Not built: The wording for the opt-out still needs your OK.";
const SHOWN = "Do you approve the opt-out wording I drafted?";
const DECISION = { id: "3303fffa", name: "Bookly opt-out wording", kind: "decision", facts: [{ text: "28 Oct 2026: The user was frustrated at being asked repeatedly to OK the opt-out wording. Use the standard 'Reply STOP to opt out' line and don't ask him to approve the wording again.", ts: 1, where: "Card" }], ts: 1 };
const lane = join(HOME, "work", "bookly"); mkdirSync(join(lane, ".symbiot"), { recursive: true });
const MIN = 60e3, HR = 3600e3;

try {
  console.log("ANSWERED CARDS — an answer given in the card writer's words closes the run's card too");
  ok("Home's chat answered the shown wording only: the run's own wording isn't answered yet", S.recordDone(SHOWN, "answered in chat: im not approving this again") && S.isDone(SHOWN) && !S.isDone(RAW));
  ok("…but a card showing either wording is answered (Home checks it after the card writer)", S.cardDone({ q: SHOWN, raw: RAW }) && !S.cardDone({ q: RAW, raw: RAW }));
  const say = H.settleFromChat({ you: [{ kind: "ask", id: "goal:fce35f2b:user", path: "goal:fce35f2b", q: SHOWN, raw: RAW }] }, [SHOWN], "im not approving this again", { reply: () => ({ ok: true }) });
  ok("settled from Home's chat: recorded in both wordings, so the run's card is answered as well", say === 1 && S.isDone(RAW) && S.isDone(SHOWN));

  console.log("ANSWERED CARDS — a goal doesn't stay waiting on the user for a question that's answered");
  const g0 = Date.now() - 4 * HR;
  const goal = G.openGoal("okay we need to focus ALL our resources on bookly, do a proper scan of it for me please we want to do a pilot in november", { lane: "bookly", path: lane, now: g0 });
  J.track("run:f6f748b3", { kind: "agent", path: lane, lane: "bookly", text: "a run", state: "waiting", waitingOn: "user", what: RAW, outcome: true }, { now: g0 + 10 * MIN });
  const ctx = (o = {}) => ({ tasks: [], ledger: { handoffs: [] }, waits: [], map: { bookly: lane }, running: () => false, jobs: J.loadJobs(), ...o });
  const gg = { ...G.goalById(goal.key) }; G.adopt(gg, ctx());
  ok("its run's question answered: the goal isn't waiting on the user", gg.children.includes("run:f6f748b3") && !(G.rollUp(gg, ctx()).waitingOn === "user"), G.rollUp(gg, ctx()));
  ok("…while unanswered, it is", G.rollUp(gg, ctx({ answered: () => false })).waitingOn === "user", G.rollUp(gg, ctx({ answered: () => false })));

  console.log("ANSWERED CARDS — a later run in the same folder takes the wait over");
  J.track("run:5661a623", { kind: "agent", path: lane, lane: "bookly", text: "a run", state: "paused", waitingOn: "", what: "", summary: "Deploy the merged the caller call fixes to the live caller and ring your phone once?", outcome: true }, { now: g0 + 3 * HR });
  const g2 = { ...G.goalById(goal.key) }; G.adopt(g2, ctx({ answered: () => false }));
  const kid = G.rollUp(g2, ctx({ answered: () => false })).kids.find((k) => k.key === "run:f6f748b3");
  ok("the 05:16 run's wait is superseded by the run that ended after it, though that one didn't finish", kid && kid.state === "ended" && kid.superseded === "run:5661a623" && G.rollUp(g2, ctx({ answered: () => false })).waitingOn !== "user", [kid, G.rollUp(g2, ctx({ answered: () => false })).state]);
  J.track("run:later-ask", { kind: "agent", path: lane, lane: "bookly", text: "a run", state: "waiting", waitingOn: "user", what: "Deploy the merged the caller call fixes and ring your phone?", outcome: true }, { now: g0 + 3.5 * HR });
  const g3 = { ...G.goalById(goal.key) }; G.adopt(g3, ctx({ answered: () => false }));
  ok("…and the newest run's own question is the one the goal waits on", G.rollUp(g3, ctx({ answered: () => false })).waitingOn === "user" && /Deploy the merged the caller/.test(G.rollUp(g3, ctx({ answered: () => false })).what), G.rollUp(g3, ctx({ answered: () => false })));

  console.log("ANSWERED CARDS — a decision never to ask again settles the card, in any wording");
  const nodes = [DECISION, { name: "Agents acting on their own", kind: "preference", facts: [{ text: "never ask before acting again" }] }];
  ok("the run's wording and the card writer's are both settled by it", S.decidedBy({ q: RAW, repo: "bookly" }, { nodes }) && S.decidedBy({ q: SHOWN, repo: "bookly" }, { nodes }).name === "Bookly opt-out wording");
  ok("…a card on another subject, or sharing one word, isn't", !S.decidedBy({ q: "Deploy the merged the caller call fixes to the live caller and ring your phone once?", repo: "bookly" }, { nodes }) && !S.decidedBy({ q: "Approve the wording of the newsletter?", repo: "bookly" }, { nodes }));
  ok("…nor is a decision that doesn't say not to ask", !S.decidedBy({ q: SHOWN, repo: "bookly" }, { nodes: [{ ...DECISION, facts: [{ text: "Use the standard 'Reply STOP to opt out' line." }] }] }));
  writeFileSync(join(CFG, "mind.json"), JSON.stringify({ nodes: [DECISION], log: [] }));
  const closed = [];
  const st = H.homeState({ fresh: true, deps: { board: () => ({ cards: [] }), pending: () => [], agents: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, repos: () => ({ bookly: lane }), search: () => ({ searching: false, at: 0, list: [] }), confirmed: () => true, waits: () => [], clashes: () => [], seesInbox: () => true, agentGone: () => "", signedOut: () => [], stuck: () => [], agentCmd: () => "claude", drafts: () => [], stalls: () => [], tasks: () => [], rootsSet: () => true, marketing: () => false, phone: () => ({}), dismissed: () => ({}), cardText: () => ({}), syncJobs: () => {}, intuition: () => [], overrides: () => [], reviewHolds: () => [], pairedPhone: () => false,
    goalCards: () => [{ kind: "ask", id: "goal:fce35f2b:user", path: "goal:fce35f2b", repo: "bookly", title: "Your goal", sub: "Not built", q: "Not built: The wording for the opt-out still needs your OK, again.", options: ["I've done it", "Drop it"] }, { kind: "ask", id: "goal:other:user", path: "goal:other", repo: "bookly", title: "Your goal", q: "Sign in to console.cloud.google.com as pat@example.com?", options: ["I'm signed in", "Drop it"] }],
    closeDecided: (y, d) => closed.push([y.id, d.name]) } });
  ok("on Home: the decided card isn't shown and its run is given the decision; the other card stays", !st.you.some((y) => y.id === "goal:fce35f2b:user") && st.you.some((y) => y.id === "goal:other:user") && closed.length === 1 && closed[0][1] === "Bookly opt-out wording", [st.you.map((y) => y.id), closed]);

  console.log("ANSWERED CARDS — a reply in the card's chat that starts its work closes the card");
  const run = join(CFG, "drafts", "act-bookly1"); mkdirSync(join(run, ".symbiot"), { recursive: true });
  writeFileSync(join(run, ".symbiot", "TASKS.md"), "## Tasks\n- [~] build the opt-out line (waits on the user's OK for the wording)\n");
  let saw = ""; const shut = [];
  const reply = "Too many times, sorry. I've started the bookly agent with the standard 'Reply STOP to opt out' wording, so it builds now.";
  const t = await H.cardTalk(run, [{ q: RAW, a: "how many times are you going to ask me? whats blocking this?" }], { force: true, alias: SHOWN, deps: { close: (p, card, a, o) => shut.push({ p, card, a, o }) },
    ask: async (sys, p) => { saw = sys + "\n" + p; return JSON.stringify({ reply, settled: [RAW] }); } });
  ok("the card is closed, not kept with its talk, and says so", t && t.ok && t.closed && !t.talk && /This card is closed/.test(t.said), t);
  ok("…its run is given the answer, in both wordings", shut.length === 1 && shut[0].p === run && shut[0].card.q === RAW && shut[0].card.alias === SHOWN && /how many times are you going to ask me/.test(shut[0].a) && /Reply STOP to opt out/.test(shut[0].a), shut);
  ok("…the model was told the card closes when it answers it or starts its work", /put its question in "settled"/.test(saw) && /"settled"/.test(saw), saw.slice(0, 300));
  const shut2 = [];
  const t2 = await H.cardTalk(run, [{ q: RAW, a: "what does the opt-out line say now?" }], { force: true, deps: { close: (...a) => shut2.push(a) }, ask: async () => JSON.stringify({ reply: "Right now: 'Say stop anytime and we won't call again.'" }) });
  ok("a plain question on it is talk: the card stays open", t2 && t2.talk && !t2.closed && shut2.length === 0, t2);
  const t3 = await H.cardTalk(run, [{ q: RAW, a: "fine" }], { force: true, deps: { close: (...a) => shut2.push(a) }, ask: async () => JSON.stringify({ reply: "ok", settled: ["Can I send the invoice?"] }) });
  ok("…and the model can't close another card from this one", t3 && t3.talk && !t3.closed && shut2.length === 0, t3);

  console.log("ANSWERED CARDS — closing a card: recorded, and its run told");
  const answered = [], settled = [], ran = [];
  H.closeCard(run, { q: RAW, alias: SHOWN }, "Answered on the card: \"go\"", { started: true, lane: "bookly", deps: { questions: () => [], answer: (...a) => answered.push(a), settle: (p) => settled.push(p), run: (p) => ran.push(p) } });
  const ans = readFileSync(join(run, ".symbiot", "ANSWERS.md"), "utf8");
  ok("a step it waits on: ANSWERS.md has the answer, its record settled, not started twice", /Answered on the card: "go"/.test(ans) && settled.length === 1 && ran.length === 0 && answered.length === 0, [ans, settled, ran]);
  const RAW2 = "Can the caller say \"stop anytime\" in the opening of broker and consumer calls?";
  H.closeCard(run, { q: RAW2 }, "Answered on the card: \"use the standard line\"", { started: false, deps: { questions: () => [{ q: RAW2, options: [] }], answer: (...a) => answered.push(a), settle: (p) => settled.push(p), run: (p) => ran.push(p) } });
  ok("a question in QUESTIONS.md: answered there, and its agent started on it", answered.length === 1 && answered[0][1][0].q === RAW2 && answered[0][2].rerun === true && S.isDone(RAW2), answered);
  ok("…the card is answered for every agent from then on", S.cardDone({ q: RAW2 }) && !existsSync(join(process.cwd(), "goal:fce35f2b")));
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} answeredcards: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
