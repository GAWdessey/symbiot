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
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { CONFIG_DIR, readState, writeJsonAtomic, loadConfig } from "./core.mjs";
import { actSites } from "./chromegate.mjs";

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
// The user's own Chrome, to read (2026-10-20). Claude in Chrome's extension, in their everyday
// Chrome with its native host registered, lets a Claude run (claude --chrome) open, read and close
// tabs of its own there, signed in as the user, where sites see a person's browser: from a
// sandboxed lane, Cloudflare's dashboard and GitHub read signed in with no human check. Reading
// only: the tools that click, type, fill or take the screen aren't allowed, so nothing is sent,
// posted or paid as the user from there. Each site also needs the user's own Allow in the
// extension. config.chromeAgents: false turns it off.
const CHROME_READ = ["tabs_context_mcp", "tabs_create_mcp", "navigate", "get_page_text", "read_page", "find", "tabs_close_mcp"].map((t) => "mcp__claude-in-chrome__" + t);
// ...and, on the sites the user switched acting on for (config.chromeAct), the ones that click, type
// and fill: the membrane (guard.mjs, chromegate.mjs) lets them act there only, and holds a send, a
// post, a payment or a delete until the user says Go on its card (review of 20 Oct 2026, proposal 1)
const CHROME_ACT = ["computer", "form_input", "file_upload"].map((t) => "mcp__claude-in-chrome__" + t);
const CHROME_HOST = "com.anthropic.claude_code_browser_extension.json";
function chromeHostDirs(home = homedir(), platform = process.platform) {
  if (platform === "linux") return [".config/google-chrome", ".config/chromium", ".config/BraveSoftware/Brave-Browser", ".config/microsoft-edge"].map((d) => join(home, d, "NativeMessagingHosts"));
  if (platform === "darwin") return ["Google/Chrome", "Chromium", "BraveSoftware/Brave-Browser", "Microsoft Edge"].map((d) => join(home, "Library/Application Support", d, "NativeMessagingHosts"));
  return []; // Windows registers it in the registry: not read here yet
}
function realChrome({ cfg = loadConfig(), home, platform } = {}) {
  if (cfg && cfg.chromeAgents === false) return false;
  return chromeHostDirs(home, platform).some((d) => existsSync(join(d, CHROME_HOST)));
}
const CHROME_BRIEF = "- The user's own Chrome is yours to READ, through the Claude in Chrome tools (mcp__claude-in-chrome__*): it's signed in as them, and sites see a person's browser there, so a site that blocks the Symbiot Browser or isn't signed in there (Cloudflare's dashboard, a cloud console) reads fine. The order: the site's API, CLI or a connector first; then their Chrome; then `symbiot screens`. Work only in your own tab group (tabs_context_mcp with createIfEmpty, then tabs_create_mcp), never in their tabs, and close yours when done. There you can only open, read and close: a click, a typed word, a send or a payment goes through `symbiot screens`, which asks the user first, or a question. If it says Claude needs permission for a site, ask the user to allow that one site in the Claude extension (give its address), not to sign in.";
// The sites the user lets agents act on in their Chrome, said in the brief beside the reading rule.
const chromeActLine = (sites) => `- On ${sites.map((h) => "`" + h + "`").join(", ")} the user also lets you ACT in their Chrome (mcp__claude-in-chrome__computer to click, type and press keys, form_input to fill): open the page with navigate first, in your own tab, and give every click, key, type and fill an action_summary saying truthfully what it does ("Sends the reply to pat@example.com"). Symbiot's membrane holds whatever sends, posts, pays or deletes until the user says Go: when it does, ask exactly as it tells you (one question, its id, one option) and stop; once they say Go, do that same action again and it goes through, once. Pressing Enter or Return (or typing a line break) counts as a send. After a click or an Enter the tab may be on another site, so if the membrane says it doesn't know where the tab is, check with tabs_context_mcp, then go on. Anywhere else, their Chrome stays read-only.`;
function browserBrief(ready = realChrome(), sites = (() => { try { return actSites(); } catch { return []; } })()) {
  return [...(ready ? [CHROME_BRIEF] : []), ...(ready && sites.length ? [chromeActLine(sites)] : []), `- Never ask the user to sign in to a site in the Symbiot Browser to read or check something there: first try the site's API, its CLI or a connector, with keys from the project's env, the vault or (through \`ops\`) the server's secrets, and ask only for a key you can't find anywhere. The Symbiot Browser can't hold a sign-in to ${failingSites().map((e) => `${e.host} (use ${e.route})`).join("; ")}: an ask to sign in to one of them there never reaches the user.`];
}

export { CHROME_ACT, KNOWN, failingSites, signInSite, blockedSignIn, signInDone, apiOptions, apiRoute, browserBrief, realChrome, chromeHostDirs, CHROME_READ, CHROME_BRIEF };
