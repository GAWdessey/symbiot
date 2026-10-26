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
// Adding a payment method is money too, never a free step: a card asked the user to add their card
// under an ad account's Billing setup to claim an ads credit, said nothing of money, and the site
// reserved some R425 on the card minutes later (23 Oct 2026). addsPayment: the text has someone add
// a card, a payment method or billing details, claim a credit, start a trial or accept paid terms.
// warnsHold: it says plainly that money may be held or taken.
const ADD_VERB = String.raw`\b(?:add(?:s|ing)?|sav(?:e|es|ing)|enter(?:s|ing)?|link(?:s|ing)?|put(?:s|ting)?|set(?:s|ting)? up|attach(?:es|ing)?|connect(?:s|ing)?|updat(?:e|es|ing))\s+(?:in\s+)?(?:the\s+|a\s+|an\s+|your\s+|his\s+|her\s+|their\s+|my\s+)?(?:new\s+)?(?:[\w'’-]+\s+){0,2}?`;
// a card: one that pays (credit, debit, a company's), or any card where billing, payment or ads are named too
const PAY_CARD = new RegExp(ADD_VERB + String.raw`(?:(?:credit|debit|bank|payment|company|business|visa|mastercard)\s+card|card (?:details|number)|payment (?:method|details|info(?:rmation)?)|billing(?: (?:details|info(?:rmation)?|method|account|profile))?)\b|\bbilling setup\b|\bclaim(?:s|ing)?\s+(?:the\s+|a\s+|an\s+|your\s+|their\s+)?(?:[\w'’$€£,.-]+\s+){0,3}?(?:credits?|coupons?|vouchers?|promo(?:tion)?s?)\b|\bstart(?:s|ing)?\s+(?:the\s+|a\s+|your\s+)?(?:free\s+)?trial\b|\baccept(?:s|ing)?\s+(?:the\s+)?(?:[\w-]+\s+){0,3}?(?:billing|payment|paid|ads?|advertising|subscription|commercial|purchase|sales)\s+(?:[\w-]+\s+)?terms\b`, "i");
const ANY_CARD = new RegExp(ADD_VERB + String.raw`card\b`, "i"), MONEYISH = /\b(?:billing|payment|pay|ads?|advertising|credit|charge|subscription|checkout|invoice|plan|campaign manager)\b/i;
const addsPayment = (text) => { const t = String(text || ""); return PAY_CARD.test(t) || (ANY_CARD.test(t) && MONEYISH.test(t)); };
// "hold" is money only when it's on a card, of an amount or placed ("Hold the credit" is waiting, not money)
const WARNS_HOLD = /\b(?:(?:a|the) (?:temporary |small |short |pre-?authori[sz]ation )?hold (?:of|on|for|about|around|up to)|holds? (?:of |about |around |up to )?(?:R\s?\d+|[$€£]\s?\d+)|held on (?:the|your|his|her|their) card|place[sd]? (?:a |an )?(?:temporary |small )?(?:hold|reservation)|reserv(?:e|es|ed|ation)\b(?:\s+\S+){0,3}?\s+(?:on (?:the|your|his|her|their|a) card|R\s?\d+|[$€£]\s?\d+|money|funds|an amount)|pre-?auth\w*|(?:may|might|can|will|could|often|usually) (?:place a |put a )?(?:hold|reserve)\b|authori[sz]ation (?:charge|hold)|verification (?:charge|amount)|temporary charge|(?:may|might|can|will|could) (?:charge|take|bill|debit|deduct)|charges? (?:it|your|the|his|their) card|(?:a |be )?charged)\b/i;
// "nothing is charged", "you won't be billed": that's calling it free, not a warning
const SAYS_FREE = /\b(?:nothing (?:is|will be|gets|would be) (?:charged|held|taken|billed)|(?:won'?t|will not|wouldn'?t|isn'?t|is not|not) (?:be )?(?:charged|held|billed|taken)|no (?:charge|hold|cost|fee)s?|free of charge)\b/gi;
const warnsHold = (text) => WARNS_HOLD.test(String(text || "").replace(SAYS_FREE, " "));
const HOLD_WARNING = "Adding a card can cost money: the site may place a hold or a charge on it straight away, even before anything is bought.";
// An action that saves a card, billing details, claims a credit or accepts paid terms: held like a payment.
const ADDS_PAYMENT_ACT = /^(?:adds?|saves?|enters?|submits?|links?|attaches?|connects?|updates?|claims?|redeems?|accepts?|starts?|activates?|applies|apply|confirms?|sets?)$/i;
function heldFor(summary, host = "") {
  const s = String(summary || "").trim(), words = s.split(/\s+/).filter(Boolean), verb = (words[0] || "").replace(/[^A-Za-z]/g, "");
  if (words.length && words.length <= 3 && isSend({ kind: "button", label: s }, host)) return "send";
  // "Adds the company card under Billing setup", "Clicks Save card", "Claims the ads credit": money, held for a Go
  { const v = /^(?:clicks?|press(?:es)?|taps?|hits?|selects?|chooses?|activates?)$/i.test(verb) ? (words[1] || "").replace(/[^A-Za-z]/g, "") : verb, rest = /^(?:clicks?|press(?:es)?|taps?|hits?|selects?|chooses?)$/i.test(verb) ? words.slice(1).join(" ") : s;
    if (ADDS_PAYMENT_ACT.test(v) && (addsPayment(rest) || /^(?:save|add|link)\s+(?:a\s+|new\s+)*card$/i.test(rest.trim()))) return "pay"; } // a bare "Save card" button pays too
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

export { MAIL_HOSTS, POSTS, isSend, heldFor, addsPayment, warnsHold, HOLD_WARNING };
