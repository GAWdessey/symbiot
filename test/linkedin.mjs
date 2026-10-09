// The Dashboard's LinkedIn card (watch.mjs): its brief covers every item the card
// lists, messages called out on their own, and a new badge ("Messaging, 1 new
// notification") is read out into who and what (linkedinDetail). On 2026-10-09 the
// card listed a message and two notifications, and the brief said only "LinkedIn
// shows only 2 new notifications". Isolated HOME; the page and LinkedIn's lists are
// stand-ins, so no browser starts.
//
//   node test/linkedin.mjs
//
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-linkedin-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({ watchBrief: true }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };

const W = await import("../watch.mjs");
const LISTS = {
  messages: [{ name: "Ann Lee", preview: "Are you free Tuesday for a demo?", time: "10:50", unread: true }, { name: "Bob Smit", preview: "Thanks, all good", time: "Mon", unread: false }],
  notifications: [
    { text: "Thabo Nkosi commented on your post: how much is this for a team of 5?", actor: "Thabo Nkosi", href: "https://www.linkedin.com/feed/update/urn:li:activity:1/", unread: true },
    { text: "Lerato Dube and 3 others reacted to your post: Symbiot: a first look", actor: "Lerato Dube", unread: true },
    { text: "Your post has 120 impressions", unread: false }],
};
const badge = (label) => ({ kind: "link", label, href: label.startsWith("Messaging") ? "https://www.linkedin.com/messaging/" : "https://www.linkedin.com/notifications/" });

try {
  console.log("LINKEDIN — a badge read out into who and what");
  const looked = [];
  const out = await W.linkedinDetail([{ text: "Messaging, 1 new notification" }, { text: "Notifications, 2 new notifications" }, { text: "Jobs" }], async (k) => { looked.push(k); return { items: LISTS[k] }; });
  ok("both lists are read, once each", looked.join() === "messages,notifications", looked);
  ok("the unread message: who and what they said", out.some((x) => x.li === "message" && x.sender === "Ann Lee" && x.text === "Message from Ann Lee: Are you free Tuesday for a demo?"), out);
  ok("a read conversation isn't news", !out.some((x) => /Bob Smit/.test(x.text)), out);
  ok("each unread notification: its words, who did it and what kind", out.some((x) => x.li === "notification" && x.actor === "Thabo Nkosi" && x.type === "comment" && /team of 5/.test(x.text) && /activity:1/.test(x.href)) && out.some((x) => x.type === "reaction" && x.actor === "Lerato Dube"), out);
  ok("anything else passes through as it was", out.some((x) => x.text === "Jobs"), out);
  const kept = await W.linkedinDetail([{ text: "Messaging, 1 new notification" }], async () => ({ busy: true }));
  ok("a list that can't be read keeps the badge", kept.length === 1 && kept[0].text === "Messaging, 1 new notification", kept);
  const none = await W.linkedinDetail([{ text: "Notifications, 1 new notification" }], async () => ({ items: [{ text: "A", unread: false }, { text: "B", unread: false }] }));
  ok("none marked unread: the badge's count, newest first", none.length === 1 && none[0].text === "A", none);
  ok("kinds: comment, mention, invitation, profile view", W.liType("Sam mentioned you in a comment") === "mention" && W.liType("Jo sent you an invitation to connect") === "invitation" && W.liType("You appeared in 9 searches this week") === "profile view" && W.liType("Ann commented on this") === "comment", "");

  console.log("LINKEDIN — the brief covers every item the card lists, messages first");
  const w = W.addWatch({ site: "https://www.linkedin.com/notifications/" });
  ok("a LinkedIn watch", w && w.id && /linkedin\.com/.test(w.url), w);
  let page = { url: "https://www.linkedin.com/notifications/", items: [badge("Home"), badge("Notifications")] };
  const briefed = [];
  const opts = (look) => ({ read: async () => page, notify: () => {}, linkedin: look, brief: async (news, name, o) => { briefed.push({ news: news.map((n) => ({ text: n.text, li: n.li })), o }); return "Messages: Ann Lee asks about a demo."; } });
  await W.checkWatch(w.id, opts(async (k) => ({ items: LISTS[k] }))); // the first read learns what's there
  // the morning of 10/7: a message, while the hidden browser was busy (the badge stays as it was)
  page = { ...page, items: [badge("Home"), badge("Messaging, 1 new notification"), badge("Notifications")] };
  const r1 = await W.checkWatch(w.id, opts(async () => ({ busy: true })));
  ok("a message LinkedIn's list couldn't show: the badge is news", (r1.new || []).some((n) => n.text === "Messaging, 1 new notification"), r1.new);
  // 10/9: two notifications, read out
  page = { ...page, items: [badge("Home"), badge("Messaging, 1 new notification"), badge("Notifications, 2 new notifications")] };
  const r2 = await W.checkWatch(w.id, opts(async (k) => ({ items: LISTS[k] })));
  ok("the two notifications are news, by who and what", (r2.new || []).length === 2 && r2.new.every((n) => n.li === "notification" && n.actor && n.type), r2.new);
  const last = briefed[briefed.length - 1];
  ok("the brief is told it's LinkedIn", last && last.o && last.o.social === true, last && last.o);
  ok("the brief gets every item the card lists, the earlier message too", last && last.news.length === 3 && last.news.some((n) => n.text === "Messaging, 1 new notification") && last.news.filter((n) => n.li === "notification").length === 2, last && last.news);
  ok("and what it said is the card's brief", W.watchBoard(72).cards.find((c) => c.id === w.id).brief.text === "Messages: Ann Lee asks about a demo.", W.watchBoard(72).cards);
  const r3 = await W.checkWatch(w.id, opts(async (k) => ({ items: LISTS[k] })));
  ok("read again with nothing new: nothing is news twice", !(r3.new || []).length, r3.new);
  const card = W.watchBoard(72).cards.find((c) => c.id === w.id);
  ok("the card lists all three", card.items.length === 3, card.items.map((n) => n.text));
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} linkedin: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
