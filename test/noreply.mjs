// A reply to a no-reply sender (24 Oct 2026: Symbiot offered to draft replies to Kaggle's
// no-reply mail, Garth said yes, and the sent reply bounced). Isolated HOME.
//
//   node test/noreply.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-noreply-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const W = await import("../watch.mjs");

try {
  const url = "https://mail.google.com/mail/u/0/#inbox";
  writeFileSync(W.WATCH_FILE, JSON.stringify({ watches: [{ id: "w1", url, name: "Gmail", every: 60 }], briefs: [], news: [
    { id: "n1", watch: "w1", text: "Kaggle no-reply@kaggle.com Welcome to the competition", ts: Date.now() },
    { id: "n2", watch: "w1", text: "Kaggle Your competition entry is confirmed", ts: Date.now() },
  ] }));
  console.log("AN AUTOMATED EMAIL ISN'T DRAFTED");
  const dr = W.draftReply("n1", { run: () => ({ id: "x" }) });
  ok("Draft a reply refuses an email from a no-reply address, saying why", dr.error && /automated email/.test(dr.error), dr);

  console.log("AN AGENT THAT FINDS THE SENDER AUTOMATED");
  const dir = join(W.DRAFTS_DIR, "n2");
  mkdirSync(join(dir, ".symbiot"), { recursive: true });
  writeFileSync(join(dir, ".symbiot", "handoff.json"), JSON.stringify({ name: "Draft: x", env: { SYMBIOT_DRAFT: "1" }, draft: { kind: "mail", platform: "Gmail", state: "drafting" } }));
  writeFileSync(join(dir, ".symbiot", "TASKS.md"), "# Draft a reply: Gmail\n\n## Tasks\n- [x] Draft a reply to: Kaggle\n\n## The reply\nNOT REPLYABLE: noreply@kaggle.com\n");
  ok("its NOT REPLYABLE note is no reply to OK: no card", W.draftCard(dir) === null);
  ok("a drafted To: that is a no-reply address is no card either", (() => { const d2 = join(W.DRAFTS_DIR, "n3"); mkdirSync(join(d2, ".symbiot"), { recursive: true }); writeFileSync(join(d2, ".symbiot", "handoff.json"), JSON.stringify({ draft: { kind: "mail", state: "drafting" } })); writeFileSync(join(d2, ".symbiot", "TASKS.md"), "## Tasks\n- [x] Draft a reply to: y\n\n## The reply\nTo: no-reply@kaggle.com\nThanks!\n"); return W.draftCard(d2) === null; })());
  ok("…settled: the draft is dropped, nothing left waiting", W.draftCards().length === 0 && JSON.parse(readFileSync(join(dir, ".symbiot", "handoff.json"), "utf8")).draft.state === "skipped");
  const n2 = JSON.parse(readFileSync(W.WATCH_FILE, "utf8")).news.find((x) => x.id === "n2");
  ok("…and that email is marked automated, so it stops waiting on you", n2.automated === true && !W.needsYou(n2, { url }), n2);
  ok("a normal email from a person is not called automated", !W.automatedMail("Sam Can you send the quote by Friday?"));
  const b = W.draftBrief({ id: "n9", text: "Sam Can you send the quote by Friday?", ts: Date.now() }, { id: "w1", url, name: "Gmail" });
  ok("the brief tells the agent to check the sender and not draft for an automated one", /NOT REPLYABLE/.test(b) && /no-reply or automated sender/.test(b));
  ok("the send brief tells it not to send to a no-reply address", /don't send/.test(W.sendBrief({ to: "Sam", text: "hi", platform: "Gmail", kind: "mail" })));
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
