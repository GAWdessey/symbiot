// A card is a conversation with its agent (home.mjs cardTalk, asksdone.mjs talk): what the user types
// on a card that is a question ("did you fix the force app", no question mark, 22 Oct 2026) is
// answered on the card, the card's question stays open, and the talk goes with the answer when it
// comes. Isolated HOME.
//
//   node test/cardtalk.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-cardtalk-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const S = await import("../asksdone.mjs");
const H = await import("../home.mjs");
const A = await import("../agents.mjs");

const run = join(CFG, "drafts", "act-0phone1"); mkdirSync(join(run, ".symbiot"), { recursive: true });
const Q = "Can you wake your phone and open Symbiot on it, so the phone code check can carry on?";
writeFileSync(join(run, ".symbiot", "QUESTIONS.md"), `## Questions\n\n### ${Q}\n- 👤 You (only you: the phone in your hand): unlock the phone and open Symbiot\n- Skip this part\n`);
writeFileSync(join(run, ".symbiot", "TASKS.md"), "## Tasks\n- [~] (waits on the user opening Symbiot on the phone) the phone code check\n");
try {
  console.log("CARD TALK — a question on a card is a question, mark or no mark");
  ok("\"did you fix the force app\" is a question", S.asksBack("did you fix the force app") && S.asksBack("what happened to the last run") && S.asksBack("is it live"));
  ok("…an answer isn't: a yes, a pick, a plain instruction", !S.asksBack("yes") && !S.asksBack("Skip this part", ["Skip this part"]) && !S.asksBack("open it on the work profile"));

  console.log("CARD TALK — the agent replies on the card, and the card stays open");
  let saw = "";
  const ask = async (sys, prompt) => { saw = sys + "\n" + prompt; return JSON.stringify({ reply: "Not yet: the phone dropped off the network at 06:40, so the check is waiting for it. Open Symbiot on it and I carry on." }); };
  const t = await H.cardTalk(run, [{ q: Q, a: "did you fix the force app" }], { ask });
  ok("a reply comes back, the user's words and the agent's, in order", t && t.ok && t.talk.length === 2 && t.talk[0].from === "you" && t.talk[1].from === "agent" && /dropped off the network/.test(t.reply), t);
  ok("the agent saw the card's question, its options, what the run waits on, and the user's words", /Can you wake your phone/.test(saw) && /Skip this part/.test(saw) && /waits on the user opening Symbiot/.test(saw) && /did you fix the force app/.test(saw), saw.slice(0, 400));
  ok("nothing was saved as the card's answer", !existsSync(join(run, ".symbiot", "ANSWERS.md")) || !/force app/.test(readFileSync(join(run, ".symbiot", "ANSWERS.md"), "utf8")));
  const open = A.agentQuestions(run, "").questions.find((q) => q.q === Q);
  ok("the card's question is still open, carrying the talk", open && open.talk && open.talk.length === 2, open);
  ok("an answer isn't talk: it's left to answerQuestions", (await H.cardTalk(run, [{ q: Q, a: "Skip this part" }], { ask })) === null);

  console.log("CARD TALK — the talk goes with the answer, then the card's talk is done");
  const r = A.answerQuestions(run, [{ q: Q, a: "Skip this part" }]);
  const ans = readFileSync(join(run, ".symbiot", "ANSWERS.md"), "utf8");
  ok("the answer carries what was said on the card", r && r.ok && /Skip this part/.test(ans) && /On this card, before this answer/.test(ans) && /The user: did you fix the force app/.test(ans) && /You: Not yet: the phone dropped off/.test(ans), ans.slice(-500));
  ok("…and the card's talk is cleared", S.talkOf(run, Q).length === 0);

  console.log("CARD TALK — the report a card links to belongs to that card's agent");
  const rep = { id: "rep1", title: "DRAFT, NOT SENT: note to Remy", file: "act-0phone1 · DRAFT-NOTE.md", name: "DRAFT-NOTE.md", folder: run, text: "# DRAFT, NOT SENT: note to Remy\n\nHi Remy, …" };
  const QR = "The note to Remy: it is not sent. Send it?";
  const linkedQs = () => [{ q: QR, options: ["Go ahead", "Skip"], report: { id: "rep1", title: rep.title } }];
  let answered = null;
  const ra = await H.reportAsk("rep1", "send it, but drop the last line", { ask: async () => JSON.stringify({ reply: "general chat" }), deps: { read: () => rep, questions: linkedQs, answer: (p, rows, o) => { answered = { p, rows, o }; return { ok: true, rerun: "r1" }; } } });
  ok("an answer typed in the report answers its card, to that card's agent, and says so", answered && answered.p === run && answered.rows[0].q === QR && answered.rows[0].a === "send it, but drop the last line" && answered.o.rerun && /Sent to its agent as your answer/.test(ra.answer), [ra, answered]);
  let saw2 = "";
  const rq = await H.reportAsk("rep1", "did you already send this one", { ask: async (sys, p) => { saw2 = sys + p; return JSON.stringify({ reply: "No, it's a draft: nothing went out." }); }, deps: { read: () => rep, questions: linkedQs, answer: () => { throw new Error("not an answer"); } } });
  ok("…a question there is talk on that card, answered by its agent with the report in front of it", rq.answer === "No, it's a draft: nothing went out." && rq.card === QR && /Hi Remy/.test(saw2) && S.talkOf(run, QR).length === 2, [rq, saw2.slice(-300)]);

  console.log("CARD TALK — typed words on a Go ahead / Skip card decide it only when they say yes or no");
  const said = H.homeAnswer("needs:/nowhere", { text: "ive already answered" });
  ok("\"ive already answered\" isn't a Go ahead: it's said to the card's agent", said && said.talk === true && said.text === "ive already answered", said);
  ok("…nor is a question", H.homeAnswer("needs:/nowhere", { text: "did you send it already" }).talk === true);
  ok("…a yes and a no still decide it", !H.homeAnswer("needs:/nowhere", { text: "yes, send it" }).talk && !H.homeAnswer("needs:/nowhere", { text: "skip" }).talk);

  console.log("CARD TALK — typed words on a step card (👤: \"Did you allow the mic?\") are its answer, done only when they say so");
  // 22 Oct 2026: "start it so i can press the allow mic button" and "nothing at that local host" each went to the run
  // as "Done: the user did it (…)"; it checked, found the mic wasn't allowed, and the card came back.
  ok("\"did it\" is a statement, \"did it work\" a question", !S.asksBack("did it") && !S.asksBack("did it, she spoke") && S.asksBack("did it work"));
  ok("done only when the words say so", S.saysDone("i did") && S.saysDone("allowed the mic") && S.saysDone("already allowed it") && S.saysDone("did it") && S.saysDone("yes"));
  ok("…not a request, a problem, a question or a no", !S.saysDone("start it so i can press the allow mic button") && !S.saysDone("nothing at that local host") && !S.saysDone("i allowed it but she isnt speaking") && !S.saysDone("cant approve, there is no approve button") && !S.saysDone("did it work") && !S.saysDone("is it on?"));
  const mic = join(CFG, "drafts", "act-0mic01"), msym = join(mic, ".symbiot"); mkdirSync(msym, { recursive: true });
  const STEP = { what: "Open the coach page in Chrome and allow microphone access so the coach's voice can be heard", kind: "step", key: "mic1" };
  const answersOf = () => readFileSync(join(msym, "ANSWERS.md"), "utf8").split("### ").pop();
  const stepDeps = (log) => ({ agents: () => [{ id: "m1", path: mic, startedAt: Date.now() - 600000, endedAt: Date.now() - 60000, needs: STEP }], settle: () => { log.settled++; }, run: () => { log.ran++; return { id: "m2" }; }, unchanged: () => [], releaseNotIn: () => null, running: () => false });
  for (const [words, done] of [["start it so i can press the allow mic button", false], ["nothing at that local host", false], ["i did", true], ["already allowed it", true]]) {
    const log = { settled: 0, ran: 0 }, r = H.homeAnswer("needs:m1", { text: words }, stepDeps(log)), a = answersOf();
    ok(`"${words}": saved against the step, the card settled, its agent started${done ? ", as done" : ", not as done"}`, r.ok && !r.talk && log.settled === 1 && log.ran === 1 && a.startsWith(STEP.what) && a.includes(words) && (done ? /^Done: the user did it/m.test(a.split("\n")[1]) : /didn't say this step is done/.test(a) && !/Done: the user did it/.test(a)), [r, log, a.slice(0, 300)]);
    S.endTalk(mic, STEP.what);
  }
  { const log = { settled: 0, ran: 0 }, d = { ...stepDeps(log), run: () => { log.ran++; return { blocked: true, note: "The lane is paused." }; } };
    const r = H.homeAnswer("needs:m1", { text: "allowed it" }, d);
    ok("its agent can't start this second: the answer is still saved, the card settles, and it says so (no \"didn't start\" error, no resend)", r.ok && !r.error && log.settled === 1 && /Saved as your answer/.test(r.said) && /lane is paused/.test(r.said) && /allowed it/.test(answersOf()), [r, log]); }
  ok("a question on a step card is still talk with its agent", H.homeAnswer("needs:m1", { text: "is it running yet" }, stepDeps({ settled: 0, ran: 0 })).talk === true);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} cardtalk: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
