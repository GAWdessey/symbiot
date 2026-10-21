// What a question asking for a code a site sends looks like, and the code in a message: the
// phone passes such a code on (phone.mjs), and the shared record of answers never keeps one
// (asksdone.mjs). Its own module, so asksdone.mjs can use it without importing phone.mjs.
// A question that waits for a code a site sends ("type the 6-digit code Zoho texted you"):
// { site, key } with the site it's from, or null. One with no site named isn't offered: the
// phone passes a code on only for the site it was asked for, and only one you switched on.
const CODE_ASK = /\b(?:sms|text(?:ed)?|verification|verify|one[- ]time|otp|2fa|two[- ]factor|security|log[- ]?in|sign[- ]in|confirmation|\d[- ]digit)\b[^.\n]{0,50}\bcodes?\b|\bcodes?\b[^.\n]{0,40}\b(?:sms|texted|text message|sent (?:to )?your phone|on your phone)\b/i;
const SITE_IN = /\b((?:[a-z0-9-]+\.)+(?:com|co\.za|io|dev|net|org|app|ai|me|co))\b/i, SITE_NAMED = /\b(?:from|by|that|the|your)\s+([A-Z][\w&-]{1,30})\s+(?:sent|texted|sends|texts|code|sms)\b/;
const siteKey = (s) => { const h = String(s || "").toLowerCase().replace(/^www\./, ""); return h.includes(".") ? h.split(".").filter((x) => !["com", "co", "za", "io", "dev", "net", "org", "app", "ai", "me", "accounts", "login", "auth", "mail", "my", "cp"].includes(x)).pop() || h.split(".")[0] : h; };
// A card that quotes another card's code ask ("find the card "What's the code x.dev texted you?"")
// isn't waiting for that code: on 21 Oct 2026 ops's own question did, and the phone offered it the
// button too, beside the card really waiting. Quoted words don't count.
const QUOTED = /"[^"\n]{1,300}"|“[^”\n]{1,300}”/g;
function codeAsk(q) {
  const all = [q && q.q, ...((q && q.options) || []), q && q.shown, q && q.context].filter(Boolean).join("\n"), own = all.replace(QUOTED, " ");
  if (!CODE_ASK.test(own)) return null;
  const t = SITE_IN.test(own) || SITE_NAMED.test(own) ? own : all; // a site only quoted ("the code "zoho.com" sent") is still the site
  const d = (t.match(SITE_IN) || [])[1], n = (t.match(SITE_NAMED) || [])[1], site = d ? d.toLowerCase().replace(/^www\./, "") : n || "";
  const key = siteKey(site); return key && key.length >= 3 ? { site, key } : null;
}
// The code in a notification's words, or "": only with a word that says it's a code, and only
// the code (the rest of the message never leaves the phone).
function codeIn(text) {
  const t = String(text || "").slice(0, 600); if (!/\b(?:code|otp|pin|passcode|verification|verify|one[- ]time)\b/i.test(t)) return "";
  const year = (x) => /^(19|20)\d\d$/.test(x); // "expires in 2026" isn't the code
  const m = [...t.matchAll(/\b(?:code|otp|pin|passcode)\b[^0-9A-Z\n]{0,24}?\b(\d{3}[ -]\d{3}|\d{4,8}|[A-Z0-9]{3,5}-[A-Z0-9]{3,5})\b/gi), ...t.matchAll(/\b(\d{3}[ -]\d{3}|\d{4,8})\b(?=[^\d\n]{0,30}\b(?:is your|is the|code)\b)/gi)].map((x) => x[1]).find((x) => !year(x));
  if (m) return m.replace(/[ ]/g, "");
  const nums = [...new Set(t.match(/\b\d{4,8}\b/g) || [])].filter((x) => !year(x));
  return nums.length === 1 ? nums[0] : "";
}

export { CODE_ASK, QUOTED, codeAsk, codeIn, siteKey };
