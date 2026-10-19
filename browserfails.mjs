// symbiot — Sites the Symbiot Browser can't hold a sign-in for, and the asks that
// would send the user to sign in to one there anyway.
// On 16 Oct 2026 Twilio's login (twilio.com/login) failed Cloudflare's "verify you are
// human" check in the agent-driven browser, even when the user clicked it himself; on
// 19 Oct a run still put "Sign in to Twilio's console in the Symbiot browser" on Home,
// and it came back after he'd answered "done" twice that day. A site like that is
// read through its API, its CLI or a connector, never a browser sign-in:
// - KNOWN: the sites known to fail there, each with the way round it.
// - Learned: a site the user signed in to when asked whose check still failed (the
//   run asked again after the "done"): the browser can't hold it, so it's never asked again.
// Every brief lists them (browserBrief), and Home turns a sign-in card for one into
// "the browser can't hold this sign-in", where Go ahead sends its agent the API route.
import { join } from "node:path";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";

const KNOWN = [
  { host: "twilio.com", name: "Twilio", names: /^twilio/i, why: "its login fails Cloudflare's human check there",
    route: "Twilio's REST API with the account SID and auth token or an API key (from the project's env or the server's secrets), e.g. GET /2010-04-01/Accounts/{sid}/Balance.json" },
  { host: "dash.cloudflare.com", also: ["cloudflare.com"], name: "Cloudflare", names: /^cloudflare/i, why: "its dashboard's human check fails there",
    route: "Cloudflare's API with an API token, or wrangler" },
  { host: "accounts.google.com", also: ["google.com"], name: "Google", names: /^(?:google|gmail)\b/i, why: "Google's sign-in refuses a browser an agent drives",
    route: "the Google connector (Gmail, Drive, Calendar) or Google's API" },
];
const FILE = () => join(CONFIG_DIR, "browser-fails.json");
const load = () => { const o = readState(FILE(), (x) => x && typeof x === "object" && !Array.isArray(x)) || {}; return { learned: Array.isArray(o.learned) ? o.learned : [], done: Array.isArray(o.done) ? o.done : [] }; };
const save = (o) => { try { writeJsonAtomic(FILE(), { learned: o.learned.slice(-50), done: o.done.slice(-100) }, { mode: 0o600 }); return true; } catch { return false; } };

// Every site that can't be signed in to there: the known ones, then the learned ones.
function failingSites() {
  const own = new Set(KNOWN.map((k) => k.host));
  return [...KNOWN, ...load().learned.filter((l) => l && l.host && !own.has(l.host)).map((l) => ({ host: l.host, name: l.name || l.host, why: l.why || "you signed in when asked and the run still couldn't read it", route: "its API, its CLI or a connector", learned: l.at || "" }))];
}
const bare = (h) => String(h || "").toLowerCase().replace(/^www\./, "");
const onHost = (h, e) => { h = bare(h); return [e.host, ...(e.also || [])].some((x) => h === x || h.endsWith("." + x)); };

// The site an ask sends the user to sign in to: "sign in to Twilio's console", "log in at
// twilio.com/login", "sign in again to dash.cloudflare.com". { host, name } or null.
const ASKS = /\b(?:sign(?:ed|ing)?[ -]?in|log(?:ged|ging)?[ -]?in)(?:\s+again)?(?:\s+(?:to|at|on|into|with))?\s+/gi;
const DOMAIN = /\b((?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/[^\s"'`)]*)?/i;
function signInSite(text) {
  const t = String(text || "");
  for (const m of t.matchAll(ASKS)) {
    const rest = t.slice(m.index + m[0].length, m.index + m[0].length + 60);
    const d = rest.match(DOMAIN), near = d && d.index <= 24 && !/\.(?:md|json|mjs|js|txt|env|pem)$/i.test(d[1]) ? bare(d[1]) : "";
    const k = failingSites().find((e) => (near && onHost(near, e)) || (e.names && e.names.test(rest.replace(/^(?:(?:your|the|my|its|an?)\s+)+/i, "")))) || null;
    if (k) return { host: near && onHost(near, k) ? near : k.host, name: k.name };
    if (near) return { host: near, name: near };
  }
  return null;
}
// The entry an ask is for, when it asks for a sign-in the Symbiot Browser can't hold: a
// known or learned site, or (since: when the asking run ended) one the user already
// signed in to when asked before then, which is learned now. The entry, or null.
function blockedSignIn(text, since = 0) {
  const s = signInSite(text); if (!s) return null;
  const all = failingSites(), hit = all.find((e) => onHost(s.host, e)); if (hit) return hit;
  const o = load(), d = o.done.find((x) => x.host === s.host);
  if (!d || !since || !(Number(d.at) < Number(since))) return null;
  o.learned.push({ host: s.host, name: s.name, at: new Date().toISOString().slice(0, 10), why: "you signed in when asked and the run still couldn't read it" });
  o.done = o.done.filter((x) => x.host !== s.host); save(o);
  return failingSites().find((e) => e.host === s.host) || null;
}
// The user answered "done" to a sign-in ask: when it's asked again after this, the
// browser didn't hold it (blockedSignIn). Returns the site, or null if it isn't a sign-in ask.
function signInDone(text, at = Date.now()) {
  const s = signInSite(text); if (!s) return null;
  const o = load(); o.done = [...o.done.filter((x) => x.host !== s.host), { host: s.host, at }]; save(o);
  return s;
}
// A question's options (QUESTIONS.md): one that has the user sign in to such a site is the
// agent's, through the site's API, with nothing for the user to do. A skip stays as it is.
function apiOptions(options) {
  const out = (options || []).map(String).map((o) => {
    if (/^\W*skip\b/i.test(o)) return o;
    const e = blockedSignIn(o); if (!e) return o;
    return `🤖 Agent: reach ${e.name} through ${e.route}, not a sign-in in the Symbiot Browser, which can't hold it${/\(recommended\)\s*$/i.test(o) ? " (recommended)" : ""}`;
  });
  return out.filter((o, i) => out.indexOf(o) === i);
}
// What the asking agent is told instead of the user being asked.
const apiRoute = (e) => `The Symbiot Browser can't hold the sign-in to ${e.host} (${e.why}), so don't ask the user to sign in there again. Use ${e.route} instead. Look for the key in the project's env, the vault (\`symbiot secret list\`) or, through ops, the server's secrets, and ask the user only for a key that isn't anywhere.`;
// For every brief: the sites never to ask a browser sign-in for, and the way round each.
function browserBrief() {
  return [`- Never ask the user to sign in to a site in the Symbiot Browser to read or check something there: first try the site's API, its CLI or a connector, with keys from the project's env, the vault or (through \`ops\`) the server's secrets, and ask only for a key you can't find anywhere. The Symbiot Browser can't hold a sign-in to ${failingSites().map((e) => `${e.host} (use ${e.route})`).join("; ")}: an ask to sign in to one of them there never reaches the user.`];
}

export { KNOWN, failingSites, signInSite, blockedSignIn, signInDone, apiOptions, apiRoute, browserBrief };
