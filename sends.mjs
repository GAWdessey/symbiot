// symbiot — what sends, posts, pays or deletes: one rule, for Symbiot's own browser (headless.mjs,
// a mapped button's label) and for an agent acting in the user's own Chrome (chromegate.mjs, what
// the action says it does). Kept apart and small: the membrane's hook imports it on every tool call.

// Mail sends with "send"; elsewhere a reply, comment or post goes out too. "Reply" in a mail app
// only opens a draft.
const MAIL_HOSTS = /^(mail\.google\.com|outlook\.(live|office|office365)\.com)$/;
const POSTS = /\b(post|reply|comment|submit|publish|share|repost|tweet)\b/i;
// A button that sends: r is a region { kind, label } (headless.mjs mapPage), host the page's.
// A label that opens, edits or saves something only names a post, it doesn't post it: "Edit post",
// "View post", "Save draft". On 22 Oct 2026 "Chooses Edit post for the 29 Oct post" was held as a
// send. "Schedule" stays a send: a scheduled post goes out by itself.
const NOT_SENDING = /^\s*(?:edit|open|view|see|show|preview|save|draft|copy|manage|change|reschedule|rename|select|expand|close|cancel editing|more|options)\b/i;
const isSend = (r, host = "") => /^(button|menu item)$/.test(r.kind || "button") && !NOT_SENDING.test(r.label || "") && (/\bsend\b/i.test(r.label || "") || (!MAIL_HOSTS.test(host) && POSTS.test(r.label || "")));
// A message typed to the user's own AI coach or agent in a test they asked for reaches no person:
// "Sends the greeting to Lerato in the test call" was held (22 Oct 2026). Only when it says it's a
// test with an AI (call, chat, session) and names no address, number, inbox or channel a person reads.
const TEST_WITH_AI = /\b(?:test|demo|trial)\s+(?:call|chat|session|conversation|run)\b/i, REACHES_PEOPLE = /@|\+?\d[\d\s-]{6,}|\b(?:email|e-mail|sms|text message|whatsapp|inbox|dm|direct message|channel|group|customer|client|team|broker|everyone|all)\b/i;
// What an action that says what it does (`summary`: "Sends the drafted reply to pat@example.com",
// "Opens the Posts tab") needs the user's Go for: "send", "pay", "delete" or "". Its leading verb
// says it ("Opens the payment settings" pays nothing); a summary of a word or three ("Send",
// "Post reply") is read as a button's label, as isSend reads one.
const SEND_VERBS = /^(?:sends?|sending|posts?|publish(?:es)?|submits?|repl(?:y|ies)|comments?|shares?|reposts?|tweets?|messages?|emails?|invites?|forwards?)$/i;
const PAY_VERBS = /^(?:pays?|purchases?|buys?|orders?|transfers?|donates?|subscribes?|upgrades?|tops?|checks?)$/i;
const DELETE_VERBS = /^(?:deletes?|removes?|erases?|destroys?|revokes?|empties|empty|wipes?|cancels?|closes?|unpublish(?:es)?|archives?)$/i;
const PAYS = /\b(?:pay(?:ment)?|purchase|checkout|order|card|invoice|billing|subscription|plan)\b/i;
function heldFor(summary, host = "") {
  const s = String(summary || "").trim(), words = s.split(/\s+/).filter(Boolean), verb = (words[0] || "").replace(/[^A-Za-z]/g, "");
  if (words.length && words.length <= 3 && isSend({ kind: "button", label: s }, host)) return "send";
  // "Clicks the Send button", "Presses Pay now", "Taps Delete": what's pressed is a button, read as its label
  if (/^(?:clicks?|press(?:es)?|taps?|hits?|selects?|chooses?|activates?)$/i.test(verb)) {
    const what = words.slice(1).join(" ");
    if (!/^clicks?$/i.test(verb) && /(?:^|[\s+])(?:the\s+)?(?:enter|return)\b/i.test(what)) return "send"; // "Presses Enter", "Hits ctrl+Return": a message box sends on it (a click on "Return policy" doesn't)
    if (/\b(?:pay|pay now|buy|purchase|checkout|place order|confirm (?:and )?pay)\b/i.test(what)) return "pay";
    if (/\b(?:delete|remove|erase|destroy|revoke)\b/i.test(what)) return "delete";
    if (isSend({ kind: "button", label: what }, host)) return "send";
  }
  { const to = s.match(/\bto (send|post|submit|publish|reply|pay|purchase|delete|remove)\b/i); if (to) return /pay|purchase/i.test(to[1]) ? "pay" : /delete|remove/i.test(to[1]) ? "delete" : "send"; }
  if (/^confirms?$/i.test(verb) || /^places?$/i.test(verb) || /^completes?$/i.test(verb)) return PAYS.test(s) ? "pay" : DELETE_VERBS.test(words[1] || "") ? "delete" : SEND_VERBS.test((words[1] || "").replace(/[^A-Za-z]/g, "")) ? "send" : "";
  if (PAY_VERBS.test(verb) && !/^(?:checks?|tops?)$/i.test(verb)) return "pay";
  if (/^checks?$/i.test(verb) && /^out$/i.test(words[1] || "")) return "pay";
  if (/^closes?$/i.test(verb) || /^cancels?$/i.test(verb)) return /\b(?:account|subscription|plan|order|booking)\b/i.test(s) ? "delete" : "";
  if (/^archives?$/i.test(verb)) return "";
  if (DELETE_VERBS.test(verb)) return "delete";
  if (SEND_VERBS.test(verb)) return TEST_WITH_AI.test(s) && !REACHES_PEOPLE.test(s) ? "" : "send";
  if (/\band (?:sends?|posts?|submits?|publish(?:es)?)\b/i.test(s)) return "send";
  return "";
}

export { MAIL_HOSTS, POSTS, isSend, heldFor };
