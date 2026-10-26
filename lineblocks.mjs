// symbiot — sites that refuse this computer's internet connection itself, and a check of the line.
// On 26 Oct 2026 a registrar's client zone answered 403 "Blocked - Insecure Proxy" to the
// Symbiot Browser. It wasn't the browser: plain curl got the same page, because one
// IP-reputation list calls this computer's home address a proxy. No browser on this computer
// gets past that, the user's own Chrome included, so asking them to "sign in in your Chrome"
// for it can't work: the step is their phone, on mobile data. So:
// - lineBlock: a page that says so (a short block page that names this computer's address or
//   calls it a proxy or VPN). headless.mjs collect() checks every page Screens reads, and the
//   site is recorded (noteBlocked) with the page's own review link when it has one.
// - lineStep / lineBrief: a card's step on such a site becomes the phone on mobile data, and
//   every brief names those sites, so a run doesn't retry them here.
// - checkLine: Settings → Connections asks two free reputation lists whether this computer's
//   address is listed as a proxy, only when the user presses Check (it sends them the address).
import { join } from "node:path";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";

const FILE = () => join(CONFIG_DIR, "line-blocks.json");
const load = () => { const o = readState(FILE(), (x) => x && typeof x === "object" && !Array.isArray(x)) || {}; return { sites: Array.isArray(o.sites) ? o.sites : [], line: o.line && typeof o.line === "object" ? o.line : null }; };
const save = (o) => { try { writeJsonAtomic(FILE(), { sites: o.sites.slice(-50), line: o.line }, { mode: 0o600 }); return true; } catch { return false; } };
const bare = (h) => String(h || "").toLowerCase().replace(/^www\./, "");

// A block page about the connection, not the person: { why, ip } or null. Only a short page
// counts (a block page is a few lines), so an article that talks about proxies isn't one.
const PROXY = /\binsecure proxy\b|\b(?:proxy|vpn|anonymi[sz](?:er|ing)(?: proxy| service)?)\b[^.\n]{0,60}\b(?:blocked|not (?:allowed|permitted|supported)|detected|denied)\b|\b(?:blocked|denied|not allowed)\b[^.\n]{0,40}\b(?:proxy|vpn)\b/i;
const NAMES_IP = /\byour (?:ip|internet|network)(?: address)?(?: is|:)?\s*((?:\d{1,3}\.){3}\d{1,3})\b/i;
const REFUSED = /\b(?:blocked|denied|forbidden|403|not allowed|restricted|refused)\b/i;
function lineBlock(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 2500) return null;
  const ip = (t.match(NAMES_IP) || [])[1] || "";
  if (PROXY.test(t)) return { why: /\bvpn\b/i.test(t) && !/\bproxy\b/i.test(t) ? "it calls this computer's connection a VPN" : "it calls this computer's connection a proxy", ip };
  if (ip && REFUSED.test(t)) return { why: "it refuses this computer's internet address", ip };
  return null;
}
// Record a site that refused this computer's connection: the entry, or null.
function noteBlocked(host, block, { review = "", at = new Date().toISOString().slice(0, 10) } = {}) {
  host = bare(host); if (!host || !block) return null;
  const o = load(), e = { host, why: block.why, ...(block.ip ? { ip: block.ip } : {}), ...(review ? { review: String(review).slice(0, 300) } : {}), at };
  o.sites = [...o.sites.filter((x) => x.host !== host), e]; save(o);
  return e;
}
function blockedSites() { return load().sites.filter((x) => x && x.host); }
function forgetBlocked(host) { host = bare(host); const o = load(), n = o.sites.length; o.sites = o.sites.filter((x) => x.host !== host); save(o); return { ok: o.sites.length < n, sites: o.sites }; }
const onHost = (h, x) => { h = bare(h); return h === x || h.endsWith("." + x) || x.endsWith("." + h); };
// The recorded site a text names (a host or an address in it): the entry, or null.
const HOSTS = /\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/gi;
function blockedIn(text) {
  const sites = blockedSites(); if (!sites.length) return null;
  for (const m of String(text || "").matchAll(HOSTS)) { const hit = sites.find((x) => onHost(m[1], x.host)); if (hit) return hit; }
  return null;
}
// The user's step on a site that refuses this computer's connection: on their phone, on mobile
// data, with why and the site's review form. Anything else comes back as it was.
const IN_CHROME = /\s+(?:in|from|using|through)\s+your (?:own |everyday )?Chrome(?:\s*\([^)]*\))?/i;
function lineStep(text) {
  const t = String(text || ""), e = /mobile data/i.test(t) ? null : blockedIn(t);
  if (!e || !(/^\W*👤/u.test(t) || /\b(?:sign|log)[ -]?in\b|\bChrome\b/i.test(t))) return t;
  const why = `${e.host} refuses this computer's connection${e.review ? "; to have it unblocked, its review form is " + e.review : ""}`;
  const rec = t.match(/\s*\(recommended\)\s*$/i), body = rec ? t.slice(0, rec.index) : t;
  const said = IN_CHROME.test(body) ? body.replace(new RegExp(IN_CHROME.source, "gi"), " on your phone, on mobile data (not Wi-Fi),") : body.replace(/[.\s]*$/, "") + ", on your phone, on mobile data (not Wi-Fi)";
  const tidy = said.replace(/,\s*,/g, ",").replace(/,(\s*[;:.]|$)/, "$1"), stop = /\.\s*$/.test(tidy) ? "." : "";
  return `${tidy.replace(/[.\s]+$/, "")} (${why})${stop}${rec ? " (recommended)" : ""}`;
}
// For every brief: the sites known to refuse this computer's connection.
function lineBrief(sites = blockedSites()) {
  if (!sites.length) return "";
  return `- These sites refuse this computer's internet connection itself (a block page that names its address or calls it a proxy or VPN), so no browser here gets in, the user's own Chrome included: ${sites.map((x) => `${x.host} (since ${x.at}${x.review ? "; review form " + x.review : ""})`).join(", ")}. Don't retry them from here: use the site's API if it has one, else a step there is the user's, on their phone on mobile data (not Wi-Fi), with the exact address and values. Settings → Connections lists them, with a check of the line.`;
}

// Is this computer's address on a proxy list? Its public address, then two free lists that
// answer without a key. { ip, lists: [{ name, proxy, kind }], listed, at } or { error }.
const LISTS = [
  { name: "ip-api.com", url: (ip) => `http://ip-api.com/json/${ip}?fields=status,proxy,hosting,mobile`, read: (j) => (j && j.status === "success" ? { proxy: !!j.proxy, kind: j.mobile ? "a mobile connection" : j.hosting ? "a data centre" : j.proxy ? "a proxy" : "a home or office connection" } : null) },
  { name: "proxycheck.io", url: (ip) => `https://proxycheck.io/v2/${ip}?vpn=1&risk=1`, read: (j, ip) => { const r = j && j[ip]; return r ? { proxy: r.proxy === "yes", kind: r.proxy === "yes" ? (r.type ? "a " + String(r.type).toLowerCase() : "a proxy") : String(r.type || "").toLowerCase() === "residential" ? "a home connection" : "not a proxy" } : null; } },
];
async function getJson(url, ms = 6000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal, headers: { accept: "application/json" } }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
}
async function checkLine({ get = getJson, now = Date.now() } = {}) {
  if (process.env.SYMBIOT_NO_NET === "1") return { error: "Checking is switched off here (SYMBIOT_NO_NET)." };
  const me = await get("https://api.ipify.org?format=json"), ip = me && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(me.ip || "")) ? me.ip : "";
  if (!ip) return { error: "Couldn't find this computer's internet address. Check the connection and try again." };
  const lists = (await Promise.all(LISTS.map(async (l) => { const r = l.read(await get(l.url(ip)), ip); return r ? { name: l.name, ...r } : { name: l.name, error: "didn't answer" }; })));
  const line = { ip, lists, listed: lists.some((x) => x.proxy), at: now };
  const o = load(); o.line = line; save(o);
  return line;
}
function lineState() { const o = load(); return { line: o.line, sites: o.sites }; }

export { lineBlock, noteBlocked, blockedSites, forgetBlocked, blockedIn, lineStep, lineBrief, checkLine, lineState, LISTS };
