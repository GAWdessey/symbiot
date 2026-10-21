// An approval card carries its own approval, and isn't raised again once it was given.
// The case: marketing asked "open the two Symbiot drafts under Marketing and press Approve on each"
// for documents that have no Approve button, after Pat had said "do these two" in Home chat.
//
//   node test/approval.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const HOME = mkdtempSync(join(tmpdir(), "symbiot-approval-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 300) : "")); } };
const { isApprovalAsk, approvalText, approvedBefore } = await import("../asksdone.mjs");
const { needsOf } = await import("../agents.mjs");
const ASK = "You (only you: your approval): open the two Symbiot drafts dated 2026-10-20 under Marketing and press Approve on each; I then schedule the blog post and keep the Show HN paste-ready text for 15:00";
const step = "👤 " + ASK;
const folder = (n) => { const p = join(HOME, n); mkdirSync(join(p, ".symbiot"), { recursive: true }); return p; };
try {
  console.log("APPROVAL CARDS");
  ok("the card text is recognised as an approval ask", isApprovalAsk(ASK));
  ok("an ordinary sign-in step is not", !isApprovalAsk("sign in to npmjs.com and type your password"));
  const t = approvalText("open the two Symbiot drafts dated 2026-10-20 under Marketing and press Approve on each; I then schedule the blog post");
  ok("the card text no longer sends him to press a button elsewhere", /^Approve the two Symbiot drafts dated 2026-10-20; I then schedule/.test(t) && !/press Approve/i.test(t), t);

  // 1. first ask: the card itself carries the approval (an "approve" card: Go ahead / Skip), not a "do it yourself" step
  const a = folder("marketing");
  const n = needsOf(a, { waiting: { step }, end: Date.now() });
  ok("a first ask becomes an approve card (Go ahead on the card is the approval)", n && n.kind === "approve" && n.asked === true, n);
  ok("its text asks for an OK, not for pressing Approve", n && /^Approve the two Symbiot drafts/.test(n.what) && !/press Approve/i.test(n.what), n && n.what);

  // 2. already approved in chat: no card
  writeFileSync(join(CFG, "mind.json"), JSON.stringify({ nodes: [], log: [
    { ts: Date.now() - 5000, where: "Home", role: "assistant", text: "Want me to schedule the two Symbiot launch drafts dated 2026-10-20, the blog post and the Show HN post, for approval under Marketing?" },
    { ts: Date.now() - 4000, where: "Home", role: "user", text: "do these two" }] }));
  ok("approved in Home chat: not asked again", needsOf(folder("marketing2"), { waiting: { step }, end: Date.now() }) === null);

  // 3. already approved in a task brief
  writeFileSync(join(CFG, "mind.json"), JSON.stringify({ nodes: [], log: [] }));
  writeFileSync(join(CFG, "tasks.json"), JSON.stringify([{ id: "e2b90489af3d", text: "[Symbiot] The user approved the two Symbiot launch drafts: the blog post and the Show HN post, dated 2026-10-20 under Marketing. Schedule them." }]));
  ok("approved in a task brief: not asked again", needsOf(folder("marketing3"), { waiting: { step }, end: Date.now() }) === null);

  // 4. already answered in the folder's ANSWERS.md
  writeFileSync(join(CFG, "tasks.json"), "[]");
  const b = folder("marketing4");
  writeFileSync(join(b, ".symbiot", "ANSWERS.md"), `# Answers\n\n### ${ASK}\nDone: the user did it (cant approve, there is no approve button). Check it worked, then carry on.\n`);
  ok("approved in an earlier answer: not asked again", needsOf(b, { waiting: { step }, end: Date.now() }) === null);

  // 5. a different approval isn't swallowed, and a chat "no" is not an approval
  writeFileSync(join(CFG, "mind.json"), JSON.stringify({ nodes: [], log: [
    { ts: Date.now() - 5000, where: "Home", role: "assistant", text: "Schedule the two Symbiot launch drafts dated 2026-10-20 under Marketing?" },
    { ts: Date.now() - 4000, where: "Home", role: "user", text: "no not yet" }] }));
  ok("a chat 'no' doesn't count as approval", needsOf(folder("marketing5"), { waiting: { step }, end: Date.now() }) !== null);
  ok("approvals of other things aren't matched", !approvedBefore("Approve the invoice for Acme before it is paid on Friday", { turns: [{ role: "assistant", text: "Schedule the two Symbiot launch drafts?" }, { role: "user", text: "yes do it" }] }));
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
