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

  // Real rows from the watch news (24 Oct 2026, names changed): an inbox row has only the sender's
  // name, subject and snippet; a LinkedIn item its own words, a type and who (actor, sender).
  console.log("EVERY CHANNEL: ONE CHECK");
  const mailW = { url }, liW = { url: "https://www.linkedin.com/notifications/" }, waW = { url: "https://web.whatsapp.com/" };
  const MAIL_SYSTEM = [
    "LinkedIn Job Alerts, Senior Data Scientist at Itonga Resourcing, 17 Oct, Itonga Resourcing Senior Data Scientist",
    "LinkedIn, Garth White, here are your instructions on installing a LinkedIn Insight Tag, 23 Oct, Here's the code",
    "LinkedIn, Garth, you turned on two-step-verification, 23 Oct",
    "LinkedIn <invitations@linkedin.com> Sam Reed wants to connect",
    "Sam Reed via LinkedIn <messages-noreply@linkedin.com> Sam sent you a message",
    "LinkedIn <notifications-noreply@linkedin.com> You appeared in 12 searches this week",
    "Property24 No-Reply, Townhouse to rent in Weltevreden Park - Property24, 10:08, ENQUIRY CONFIRMATION",
    "Mail Delivery Subsy., Delivery Status Notification (Failure), 06:33, Address not found",
    "noreply, Your Paystack One Time Password, 13:47, Multi-Factor Authentication",
    "inContact, FNB:-) R429.90 reserved for purchase @ Liquorshop, 09:47, Dear valued customer",
    "Google, You shared some Google Account data with Suno, 08:46",
    "Medium Daily Digest, 5 stories for you, 07:00",
    "Fly.io, Your weekly analytics: 1,204 impressions, 07:00",
  ];
  for (const t of MAIL_SYSTEM) ok("mail from a system sender is automated: " + t.slice(0, 50), W.systemSender({ text: t }, mailW) && !W.needsYou({ text: t }, mailW));
  const people = ["Lindiwe Tebogo, 46 Bavitana - Garth Aden White, has attachment, 14:26, Good day Garth, Thank you for your interest in the property",
    "Tsepang Madela, 46 Bavitana R7250 - Rental Application Requirements, 15 Oct", "Sam Can you send the quote by Friday?"];
  for (const t of people) ok("mail a person wrote still needs you: " + t.slice(0, 40), !W.systemSender({ text: t }, mailW) && W.needsYou({ text: t }, mailW));

  const LI_SYSTEM = [
    { text: "Notifications, 3 new notifications" }, { text: "Network, 1 new notification" }, { text: "Reactivate Premium" }, { text: "Say happy belated birthday" },
    { text: "Sam Reed and 4 others reacted to your post", li: "notification", type: "reaction", actor: "Sam Reed" },
    { text: "Sam Reed reacted to your reply", li: "notification", type: "reply", actor: "Sam Reed" },
    { text: "Your profile was viewed by 9 people. See who viewed your profile", li: "notification", type: "profile view" },
    { text: "You appeared in 14 searches this week", li: "notification", type: "profile view" },
    { text: "Senior Data Scientist at Itonga Resourcing and 9 more jobs for you", li: "notification", type: "job" },
    { text: "Sam Reed accepted your invitation", li: "notification", type: "invitation" },
    { text: "Your post has 1,204 impressions. View analytics", li: "notification", type: "post" },
    { text: "Message from LinkedIn Premium: Try Premium for R0", li: "message", sender: "LinkedIn Premium" },
    { text: "Message from Acme Recruiting · Sponsored: We're hiring", li: "message", sender: "Acme Recruiting · Sponsored" },
  ];
  for (const n of LI_SYSTEM) ok("a LinkedIn notification nobody reads a reply to is automated: " + n.text.slice(0, 45), W.systemSender(n, liW) && !W.needsYou(n, liW));
  const LI_PEOPLE = [
    { text: "Message from Thandi Mokoena: Hi Garth, is Symbiot free for a team of five?", li: "message", sender: "Thandi Mokoena" },
    { text: "Thandi Mokoena commented on your post: how do I install it?", li: "notification", type: "comment", actor: "Thandi Mokoena" },
    { text: "Thandi Mokoena mentioned you in a comment", li: "notification", type: "mention", actor: "Thandi Mokoena" },
    { text: "Thandi Mokoena replied to your comment", li: "notification", type: "reply", actor: "Thandi Mokoena" },
    { text: "Messaging, 1 new message" },
  ];
  for (const n of LI_PEOPLE) ok("a LinkedIn message or comment a person wrote still needs you: " + n.text.slice(0, 45), !W.systemSender(n, liW) && W.needsYou(n, liW));
  const WA_SYSTEM = ["1 unread message WhatsApp Business 08:48 You received a one-time passcode.", "Facebook 08:59 Did you just add an email address?",
    "Checkers 14:55 Welcome to the Checkers WhatsApp channel!", "+1 (555) 655-9920 17:18 This business is now using a secure service from Meta to manage this chat."];
  for (const t of WA_SYSTEM) ok("a WhatsApp chat from a system sender is automated: " + t.slice(0, 40), W.systemSender({ text: t, from: "them" }, waW) && !W.needsYou({ text: t, from: "them" }, waW));
  ok("a WhatsApp chat from a person still needs you", W.needsYou({ text: "1 unread message Francois Huyzers 07:49 Lol what do you mean ? 1", from: "them" }, waW));

  console.log("NO DRAFT A REPLY ON LINKEDIN'S OWN, ONE ON A PERSON'S");
  const liUrl = "https://www.linkedin.com/notifications/";
  writeFileSync(W.WATCH_FILE, JSON.stringify({ watches: [{ id: "li", url: liUrl, name: "LinkedIn", every: 60 }], briefs: [], news: [
    { id: "l1", watch: "li", text: "Your profile was viewed by 9 people. See who viewed your profile", li: "notification", type: "profile view", ts: Date.now() },
    { id: "l2", watch: "li", text: "Message from Thandi Mokoena: Hi Garth, is Symbiot free for a team of five?", li: "message", sender: "Thandi Mokoena", ts: Date.now() },
    { id: "l3", watch: "li", text: "Senior Data Scientist at Itonga Resourcing and 9 more jobs for you", li: "notification", type: "job", ts: Date.now() },
  ] }));
  const st = W.watchState().news, l1 = st.find((x) => x.id === "l1"), l2 = st.find((x) => x.id === "l2");
  ok("a profile view is marked automated, with no reply mark (so no Draft a reply button)", l1.automated === true && !l1.social, l1);
  ok("a person's LinkedIn message keeps its reply mark", l2.social === true && !l2.automated, l2);
  const card = W.watchBoard(24).cards.find((c) => c.id === "li");
  ok("the LinkedIn card counts only the person's message as waiting on you", card.count === 1 && card.items.filter((n) => n.need).map((n) => n.id).join() === "l2", card.items.map((n) => [n.id, n.need]));
  const li3 = W.draftReply("l3", { run: () => ({ id: "x" }) });
  ok("Draft a reply refuses LinkedIn's own notification, saying why", li3.error && /LinkedIn's own notification/.test(li3.error), li3);
  const li2 = W.draftReply("l2", { run: () => ({ id: "x" }) });
  ok("…but not a person's message (it gets past the check)", !(li2.error && /nobody reads a reply/.test(li2.error)), li2);
  const nP = { id: "l9", text: "Thandi Mokoena commented on your post", ts: Date.now() };
  ok("the LinkedIn brief tells the agent not to draft for LinkedIn's own or a sponsor", /NOT REPLYABLE/.test(W.socialBrief(nP, { id: "li", url: liUrl, name: "LinkedIn" })) && /LinkedIn's own/.test(W.socialBrief(nP, { id: "li", url: liUrl, name: "LinkedIn" })));
  ok("the WhatsApp brief tells it not to draft for a business or bot account", /NOT REPLYABLE/.test(W.chatBrief(nP, { id: "wa", url: "https://web.whatsapp.com/", name: "WhatsApp" })));
  ok("the send brief tells it not to send to LinkedIn itself or a business account", /not a person/.test(W.sendBrief({ to: "x", text: "hi", platform: "LinkedIn", kind: "social" })));
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
