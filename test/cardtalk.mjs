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
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} cardtalk: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
