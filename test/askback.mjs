// An answer that asks back, and a question asked again in new words (asksdone.mjs asksBack,
// heldBy; agents.mjs repeatAnswer; home.mjs). On 20 Oct 2026 Pat answered the Paddle question
// four times with "explain to me what paddle is for", "must i ask again?" and "put it in reports
// so i can read it": every run asked for the price ids again, worded differently, and the reply he
// typed on its "👤 You" card was passed on as "The user says it's done". Isolated HOME.
//
//   node test/askback.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-askback-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const C = join(HOME, ".config", "symbiot");
mkdirSync(C, { recursive: true });
writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")] }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const S = await import("../asksdone.mjs");
const a = await import("../agents.mjs");
const { homeAnswer } = await import("../home.mjs");

const lane = join(HOME, "work", "symbiot"), sym = join(lane, ".symbiot");
mkdirSync(sym, { recursive: true });
writeFileSync(join(C, "runs.json"), JSON.stringify([{ path: lane, name: "Agent: symbiot", startedAt: Date.now() }]));
const ask = (q, ctx = "Paddle needs them before the buy buttons can go on the site.") => writeFileSync(join(sym, "QUESTIONS.md"), `# Questions\n\n## Questions\n\n### ${q}\n${ctx}\n- 👤 You (only you: your Paddle account): paste the two price ids (recommended)\n- Skip this part\n`);
const answers = () => readFileSync(join(sym, "ANSWERS.md"), "utf8");
try {
  console.log("1) WHICH REPLIES ASK BACK");
  for (const t of ["before this, can you explain to me what paddle is for?", "must i ask again? or are you stuck on this?", "until i read something telling me what paddle is and why we need it, we arent doing anything", "put it in reports so i can read it", "write it up for me"])
    ok(`asks back: ${t}`, S.asksBack(t));
  for (const t of ["garth@symbiot.co.za", "yes", "skip", "Keep both as written (recommended unless the registered name differs)", "👤 You: sign up at paddle.com", "Done: signed in"])
    ok(`an answer: ${t}`, !S.asksBack(t, ["Keep both as written (recommended unless the registered name differs)"]));
  ok("...an option picked word for word isn't asking back, even with a question mark in it", !S.asksBack("Why not both?", ["Why not both? (recommended)"]));

  console.log("2) ON THE WORKDESK: A REPLY THAT ASKS BACK");
  ask("What are the Paddle price ids and sandbox key for Symbiot Pro?");
  const r1 = a.answerQuestions(lane, [{ q: "What are the Paddle price ids and sandbox key for Symbiot Pro?", a: "before this, can you explain to me what paddle is for?" }]);
  ok("it's saved", r1.ok && r1.saved === 1, r1);
  ok("...with the run told to write it up for Reports first, and not to ask again", /didn't answer this: they asked you for something first/.test(answers()) && /shows under Reports/.test(answers()) && /Don't ask this question again, in any words/.test(answers()), answers());
  const rec = S.doneList().find((x) => /price ids/.test(x.q));
  ok("...and on the shared record as asked back, in the user's own words", rec && rec.back === true && rec.a === "before this, can you explain to me what paddle is for?", rec);
  ok("...which the lane's brief says", /they asked back first: "before this, can you explain/.test(S.doneBrief("symbiot").join("\n")), S.doneBrief("symbiot"));
  ok("every brief has the rule", /asking for something \(to explain it, write it up, put it in Reports\)/.test(S.standingBrief().join("\n")));

  console.log("3) THE SAME QUESTION, ASKED AGAIN IN NEW WORDS");
  for (const q of ["Ready to give me the Paddle price ids and sandbox key for Symbiot Pro?", "Can you send the Paddle price ids and sandbox key, or should this wait?", "Do you still want a payment company (Paddle) to take the money for Symbiot Pro?"]) {
    ask(q);
    const aq = a.agentQuestions(lane, "symbiot");
    ok(`never reaches the user: ${q}`, aq.questions.length === 0 && aq.known && aq.known.length === 1 && /asked back: "before this, can you explain/.test(aq.known[0].a) && /Write it up for them now/.test(aq.known[0].a), aq);
  }
  const d = a.autoDecide(lane);
  ok("...Symbiot answers it in ANSWERS.md itself", d && d.decided === 1 && /### Do you still want a payment company[^\n]*\nYou, or another agent on this, asked this already/.test(answers()), [d, answers().slice(-600)]);
  ok("a different question on Symbiot still reaches the user", (ask("Should the home page show the phone app first?", "Most visitors come from a phone."), a.agentQuestions(lane, "symbiot").questions.length === 1));

  console.log("4) ONCE THE WRITE-UP IS IN REPORTS");
  ask("Ready for the Paddle price ids and sandbox key for Symbiot Pro?");
  const rep = join(sym, "PADDLE-EXPLAINED.md");
  writeFileSync(rep, "# Paddle: what it is and whether Symbiot needs it\n\nIt takes the payment.\n");
  const held = a.agentQuestions(lane, "symbiot");
  ok("not read yet: still held, and the run is pointed at the report it wrote", held.questions.length === 0 && /"Paddle: what it is and whether Symbiot needs it" is in Reports \(\.symbiot\/PADDLE-EXPLAINED\.md\)/.test(held.known[0].a), held);
  const t = new Date(Date.now() + 5000); utimesSync(rep, t, t);
  const mt = Math.round(t.getTime()), id = createHash("sha1").update(rep).digest("hex").slice(0, 12);
  writeFileSync(join(C, "reports.json"), JSON.stringify({ seen: { [id]: mt } }));
  ok("read: the question can reach the user again", a.agentQuestions(lane, "symbiot").questions.length === 1, a.agentQuestions(lane, "symbiot"));

  console.log("5) A PLAIN ANSWER: THE SAME QUESTION WORDED AGAIN IS ANSWERED FROM IT");
  ask("Which email should the Symbiot Paddle account use?", "Paddle's sign-up asks for one.");
  a.answerQuestions(lane, [{ q: "Which email should the Symbiot Paddle account use?", a: "garth@symbiot.co.za" }]);
  ask("Which email address should the Symbiot Paddle account use?", "It's for the sign-up.");
  const again = a.agentQuestions(lane, "symbiot");
  ok("...never reaching the user", again.questions.length === 0 && /the user answered: "garth@symbiot\.co\.za"/.test(again.known[0].a), again);
  ask("Which email should the Symbiot Paddle account send receipts from: sales@ or pat@?", "Paddle sends them.");
  ok("...but a question on a different point is still asked", a.agentQuestions(lane, "symbiot").questions.length === 1, a.agentQuestions(lane, "symbiot"));

  console.log("6) ON HOME: YOUR OWN WORDS ON A \"👤 YOU\" CARD");
  writeFileSync(join(sym, "PADDLE-WHAT-IT-IS.md"), "# Paddle: what it is and whether Symbiot needs it\n\nWritten by the run that asked.\n");
  const card = { id: "r1", path: lane, startedAt: Date.now() - 60000, endedAt: Date.now() - 1000, needs: { key: "k1", kind: "step", what: "The Paddle sign-up and the site's buy buttons still need your account and its price ids." } };
  let settled = 0, ran = 0, recorded;
  const deps = { agents: () => [card], settle: () => settled++, run: () => { ran++; return { id: "run2" }; }, unchanged: () => [{ name: ".symbiot/PRO-PRODUCT-DESCRIPTION.md", at: Date.now() - 86400000 }] };
  const h = homeAnswer("needs:r1", { text: "put it in reports so i can read it(4th time i am asking)" }, deps);
  const last = answers().split("### ").pop();
  ok("isn't passed on as \"done\"", !/says it's done|Done: the user did it/.test(last) && /hasn't done this step\. The user didn't answer this: they asked you for something first/.test(last) && /write it up now/.test(last), last);
  ok("...its agent starts on it, and the card goes", h.ok && ran === 1 && settled === 1 && h.rerun === "run2", h);
  ok("...and the user is told where to read it, as the run wrote it already", /It's written already: Reports → "Paddle: what it is and whether Symbiot needs it"/.test(h.said) && h.report, h);
  recorded = S.doneList().find((x) => /buy buttons/.test(x.q));
  ok("...recorded as asked back, in their words", recorded && recorded.back && /^put it in reports/.test(recorded.a), recorded);
  const done = homeAnswer("needs:r1", { pick: 0 }, { ...deps, unchanged: () => [] });
  ok("a plain Done it still says done", done.ok && /Done: the user did it/.test(answers().split("### ").pop()), [done, answers().split("### ").pop()]);
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
