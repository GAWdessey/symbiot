// symbiot — Links: one button per standard work site (Gmail, Outlook, GitHub,
// Slack, Teams, Jira…), so linking your work is a click, not a list of sites to
// type in one by one. Linking a site does three things at once:
//   - opens it in Symbiot's browser (headless.mjs signIn), where you sign in the
//     usual way, with the site's own login, SSO and 2FA (Symbiot never sees a password);
//   - trusts its domains (Screens' Press and Type go ahead there without asking);
//   - watches its inbox or notifications page (watch.mjs), so what arrives there
//     reaches the Dashboard, Standup and Week: your week, from all of your work.
// Whether a link works is read from its watch: signed in, signed out, or still
// waiting for you to sign in.
//
// For a whole company, links.json (in Symbiot's config folder, or the file
// SYMBIOT_LINKS names) adds the company's own sites and hides the ones it
// doesn't use, so everyone gets the same buttons:
//   { "links": [{ "id": "jira", "name": "Jira", "group": "Work", "url": "https://acme.atlassian.net/jira/your-work", "hosts": ["acme.atlassian.net"] }],
//     "hide": ["whatsapp"] }
// An entry with a built-in's id replaces it. Linking stays in the app: like
// trusted sites, there's no command an agent could call to link a site itself.
//
// What's linked is config.linked: { <id>: { at, watch?, hosts: [trusted by the link] } }.
import { can } from "./licence.mjs";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { CONFIG_DIR, loadConfig, saveConfig } from "./core.mjs";
import { siteUrl, signIn, readPage, trustedSites, trustSite, untrustSite, sessionCookie } from "./headless.mjs";
import { watchState, addWatch, removeWatch, checkWatch, GITHUB_INBOX } from "./watch.mjs";

// The standard sites. url is where you sign in and, with watch, the page that's
// read for what's new; hosts are trusted along with it.
const CATALOG = [
  { id: "gmail", name: "Gmail", group: "Mail", url: "https://mail.google.com/mail/u/0/#inbox", hosts: ["mail.google.com"], watch: true },
  { id: "outlook", name: "Outlook", group: "Mail", url: "https://outlook.office.com/mail/", hosts: ["outlook.office.com", "outlook.office365.com", "outlook.live.com"], watch: true },
  { id: "gcal", name: "Google Calendar", group: "Calendar", url: "https://calendar.google.com/calendar/r/agenda", hosts: ["calendar.google.com"], watch: true },
  { id: "outlookcal", name: "Outlook Calendar", group: "Calendar", url: "https://outlook.office.com/calendar/view/agenda", hosts: ["outlook.office.com", "outlook.office365.com"], watch: true },
  { id: "github", name: "GitHub", group: "Code", url: GITHUB_INBOX, hosts: ["github.com"], watch: true },
  { id: "gitlab", name: "GitLab", group: "Code", url: "https://gitlab.com/dashboard/todos", hosts: ["gitlab.com"], watch: true },
  { id: "slack", name: "Slack", group: "Chat", url: "https://app.slack.com/client", hosts: ["app.slack.com"], watch: true },
  { id: "teams", name: "Microsoft Teams", group: "Chat", url: "https://teams.microsoft.com/", hosts: ["teams.microsoft.com"], watch: true },
  { id: "whatsapp", name: "WhatsApp", group: "Chat", url: "https://web.whatsapp.com/", hosts: ["web.whatsapp.com"], watch: true },
  { id: "jira", name: "Jira & Confluence", group: "Work", url: "https://home.atlassian.com/", hosts: ["atlassian.net", "home.atlassian.com"], watch: true },
  { id: "linear", name: "Linear", group: "Work", url: "https://linear.app/", hosts: ["linear.app"], watch: true },
  { id: "asana", name: "Asana", group: "Work", url: "https://app.asana.com/", hosts: ["app.asana.com"], watch: true },
  { id: "trello", name: "Trello", group: "Work", url: "https://trello.com/", hosts: ["trello.com"] },
  { id: "gdrive", name: "Google Drive", group: "Docs", url: "https://drive.google.com/drive/recent", hosts: ["drive.google.com", "docs.google.com"] },
  { id: "notion", name: "Notion", group: "Docs", url: "https://www.notion.so/", hosts: ["notion.so"] },
  { id: "hubspot", name: "HubSpot", group: "Sales", url: "https://app.hubspot.com/", hosts: ["app.hubspot.com"] },
  { id: "salesforce", name: "Salesforce", group: "Sales", url: "https://login.salesforce.com/", hosts: ["salesforce.com", "lightning.force.com"] },
  // its notifications: comments and mentions on your posts (post.mjs flags likely
  // customers); signed in, `symbiot post voice --linkedin` reads your own posts
  { id: "linkedin", name: "LinkedIn", group: "Social", url: "https://www.linkedin.com/notifications/", hosts: ["linkedin.com"], watch: true },
];
const GROUPS = ["Mail", "Calendar", "Code", "Chat", "Work", "Docs", "Sales", "Social"];
// Any other site, added by you (Settings → Connections → Add a site): domains.co.za, a
// supplier's portal. config.sites: [{ id, name, url, hosts }], linked like the buttons.
const OWN = "Your sites";

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const linksFile = () => process.env.SYMBIOT_LINKS || join(CONFIG_DIR, "links.json");
// One entry from links.json, tidied, or null if it can't be linked.
function cleanEntry(e) {
  if (!e || typeof e !== "object") return null;
  const url = siteUrl(e.url), id = String(e.id || hostOf(url)).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40);
  if (!url || !id) return null;
  const hosts = [...new Set([hostOf(url), ...(Array.isArray(e.hosts) ? e.hosts : [])].map((h) => hostOf(siteUrl(h))).filter(Boolean))];
  return { id, name: String(e.name || hostOf(url)).trim().slice(0, 60), group: String(e.group || "Company").trim().slice(0, 30), url, hosts, ...(e.watch ? { watch: true } : {}), company: true };
}
// The buttons everyone gets: the built-ins, then the company file's (an entry
// with a built-in's id replaces it; hide drops ids). A broken file is ignored,
// and said so.
function catalog() {
  let file = null, error = "";
  try { file = JSON.parse(readFileSync(linksFile(), "utf8")); } catch (e) { if (e && e.code !== "ENOENT") error = `${linksFile()} isn't valid JSON, so it was skipped.`; }
  const extra = ((file && Array.isArray(file.links) && file.links) || []).map(cleanEntry).filter(Boolean);
  const hide = new Set(((file && Array.isArray(file.hide) && file.hide) || []).map((x) => String(x).toLowerCase()));
  const own = ownSites().map((e) => ({ ...cleanEntry(e), group: OWN, own: true, company: false })).filter((e) => e.id);
  const byId = new Map(); for (const e of [...CATALOG, ...extra, ...own]) if (!(e.own && byId.has(e.id))) byId.set(e.id, e);
  const list = [...byId.values()].filter((e) => !hide.has(e.id));
  return { list, error, file: file ? linksFile() : "" };
}

function ownSites() { const s = loadConfig().sites; return Array.isArray(s) ? s.filter((x) => x && typeof x === "object" && x.id && x.url) : []; }
function linked() { const l = loadConfig().linked; return l && typeof l === "object" && !Array.isArray(l) ? l : {}; }
function saveLinked(l) { const cfg = loadConfig(); if (Object.keys(l).length) cfg.linked = l; else delete cfg.linked; return saveConfig(cfg); }

// Where a link stands, from its watch. state: "off" (not linked), "signin" (linked,
// not read signed in yet: sign in in the window, then close it), "ok" (read
// signed in), "signedout" or "error".
function stateOf(e, l, watches) {
  if (!l) return { state: "off" };
  const w = l.watch && watches.find((x) => x.id === l.watch);
  if (!e.watch) return { state: l.ok ? "ok" : "signin", ...(l.checked ? { checked: l.checked } : {}), ...(!l.ok && l.note ? { note: l.note } : {}) };
  if (!w) return { state: "error", note: "Its watch was removed. Link it again." };
  // signed out only once it has been read signed in: a read before you've
  // finished signing in in the window is still "sign in"
  if (w.error && /^Signed out/.test(w.error)) return w.checked ? { state: "signedout", note: "Signed out: click it to sign in again." } : { state: "signin" };
  if (w.checked) return { state: "ok", checked: w.checked, ...(w.error ? { note: w.error } : {}) };
  return { state: "signin", ...(w.error && !/in use|busy|already running|Symbiot Browser is open/i.test(w.error) ? { note: w.error } : {}) };
}
function linksState() {
  const c = catalog(), l = linked(), watches = watchState().watches;
  const items = c.list.map((e) => ({ id: e.id, name: e.name, group: e.group, url: e.url, ...(e.company ? { company: true } : {}), ...(e.own ? { own: true } : {}), ...stateOf(e, l[e.id], watches) }));
  const groups = [...new Set([...GROUPS, ...items.map((x) => x.group).filter((g) => g !== OWN), OWN])].filter((g) => items.some((x) => x.group === g));
  return { items, groups, linked: items.filter((x) => x.state !== "off").length, ...(c.file ? { file: c.file } : {}), ...(c.error ? { error: c.error } : {}) };
}

// Link one: trust its hosts, watch its page, open it to sign in (in the Symbiot Browser). Clicking a link
// that's already there just opens it again to sign in (signed out, or a second
// account). Gives { ok, url, item } or { error }.
// what counts as an inbox or chat for Free's one
const INBOX_GROUPS = new Set(["Mail", "Calendar", "Chat", "Social"]);
async function linkSite(id, { open = signIn } = {}) {
  const e = catalog().list.find((x) => x.id === id);
  if (!e) return { error: `No link called ${id}.` };
  const l = linked(), had = l[id], before = new Set(trustedSites()), added = [];
  if (!had && INBOX_GROUPS.has(e.group)) { // Free connects one inbox or chat (licence.mjs)
    const n = Object.keys(l).filter((k) => { const x = catalog().list.find((c) => c.id === k); return x && INBOX_GROUPS.has(x.group); }).length;
    const ok = can("inboxes", { count: n }); if (!ok.ok) return { error: ok.why, pro: true };
  }
  for (const h of e.hosts) if (!before.has(h)) { const r = trustSite(h); if (r && r.ok) added.push(h); }
  let watch = had && had.watch;
  if (e.watch && !(watch && watchState().watches.some((x) => x.id === watch))) {
    const w = addWatch({ site: e.url, name: e.name, every: 15 });
    if (w.error) { for (const h of added) untrustSite(h); return { error: w.error }; }
    watch = w.id;
  }
  l[id] = { at: (had && had.at) || Date.now(), ...(watch ? { watch } : {}), hosts: [...new Set([...((had && had.hosts) || []), ...added])] };
  saveLinked(l);
  const r = await open(e.url);
  return r.error ? { error: r.error, item: linksState().items.find((x) => x.id === id) } : { ok: true, url: r.url, item: linksState().items.find((x) => x.id === id) };
}
// Read it now: its watch, or for a site that isn't watched, its page, to see
// that it's signed in. Gives the item as it stands after.
async function checkLink(id, { check = checkWatch, read = readPage, cookie = sessionCookie } = {}) {
  const e = catalog().list.find((x) => x.id === id), l = linked();
  if (!e || !l[id]) return { error: `${e ? e.name : id} isn't linked.` };
  if (l[id].watch) { const r = await check(l[id].watch); if (r && r.busy) return { busy: true, item: linksState().items.find((x) => x.id === id) }; }
  else {
    // a site whose session cookie is known: signed in when it's in the profile, no page needed
    const k = cookie(e.hosts);
    let p = null, note = "";
    if (!(k && k.found)) {
      try { p = await read(e.url, { password: true }); } catch (err) { p = { error: String((err && err.message) || err) }; }
      if (p && p.busy) return { busy: true, item: linksState().items.find((x) => x.id === id) };
      // not confirmed: say what was found, rather than only "sign in" again
      if (!p || p.error || p.login) note = foundNote(e, k, p);
    }
    const l2 = linked(); if (!l2[id]) return { error: `${e.name} isn't linked.` };
    const ok = !!((k && k.found) || (p && !p.error && !p.login));
    const { note: _, ...was } = l2[id];
    l2[id] = { ...was, ok, checked: Date.now(), ...(note ? { note } : {}) }; saveLinked(l2);
  }
  return { ok: true, item: linksState().items.find((x) => x.id === id) };
}
// What a check that couldn't confirm a sign-in found, in a line for the site's card.
function foundNote(e, k, p) {
  const err = p && p.error ? String(p.error).replace(/\s+/g, " ").slice(0, 160) : "";
  if (k && k.found === false && p && p.login) return `${e.name} showed its sign-in page, and its session cookie (${k.cookie}) isn't saved: sign in there again.`;
  if (k && k.found === false) return `No session cookie (${k.cookie}) for ${k.host} yet: the page may still be loading or saving. Symbiot checks again in a moment.${err ? " The page: " + err : ""}`;
  if (p && p.login) return `${e.name} showed its sign-in page: if you've just signed in, it may still be saving. Symbiot checks again in a moment.`;
  return `Couldn't check ${e.name} just now${err ? " (" + err + ")" : ""}. That isn't a sign-out: Symbiot checks again in a moment.`;
}
// Unlink: stop watching it, and untrust the hosts this link trusted (never ones
// you trusted yourself). A host another link still uses (Outlook and Outlook
// Calendar share one) passes to that link instead, so it goes when the last
// link using it does. You stay signed in to the site in Symbiot's browser until
// you sign out there.
function unlinkSite(id) {
  const l = linked(), had = l[id]; if (!had) return { error: `${id} isn't linked.` };
  delete l[id];
  if (had.watch) removeWatch(had.watch);
  const list = catalog().list;
  for (const h of had.hosts || []) {
    const heir = Object.keys(l).find((k) => { const e = list.find((x) => x.id === k); return e && e.hosts.includes(h); });
    if (heir) l[heir] = { ...l[heir], hosts: [...new Set([...(l[heir].hosts || []), h])] };
    else untrustSite(h);
  }
  saveLinked(l);
  if (ownSites().some((x) => x.id === id)) { const cfg = loadConfig(); cfg.sites = ownSites().filter((x) => x.id !== id); if (!cfg.sites.length) delete cfg.sites; saveConfig(cfg); }
  return { ok: true, ...linksState() };
}
// Add a site that isn't one of the buttons, and link it: trusted, opened in the Symbiot
// Browser to sign in, checked when you click Done there (server.mjs /api/browser/done). A site that is one (gmail,
// linkedin.com) links that one. input: a host or a web address, best the page you see
// once signed in (www.domains.co.za/client/dashboard), so the check can tell.
async function addSite(input, opts = {}) {
  const url = siteUrl(input), host = hostOf(url);
  if (!url || !host || !host.includes(".")) return { error: "Give the site: a host like domains.co.za, or the page you see once you're signed in." };
  const known = catalog().list.find((e) => !e.own && e.hosts.some((h) => host === h || host.endsWith("." + h)));
  if (known) return linkSite(known.id, opts);
  const id = "site-" + host.replace(/[^a-z0-9]+/g, "-").slice(0, 34), cfg = loadConfig(), had = ownSites().find((x) => x.id === id);
  cfg.sites = [...ownSites().filter((x) => x.id !== id), { id, name: host, url: had && /^https?:\/\/[^/]+\/?$/.test(url) ? had.url : url, hosts: [host] }];
  saveConfig(cfg);
  return linkSite(id, opts);
}
// A card or a reply that asks you to sign in to a site (an agent's "sign in to
// domains.co.za in Symbiot's browser"): which, so it carries a button that opens it
// in the Symbiot Browser (addSite). { site, name } or null. A site among the buttons by its name (LinkedIn) too.
const ASKS_SIGNIN = /\b(?:sign(?:ed)?[ -]?in|log[ -]?in)(?:\s+again)?(?:\s+(?:to|at|on|into))?\s+(?:your\s+|the\s+)?/gi;
function signInAsked(text) {
  const t = String(text || "");
  for (const m of t.matchAll(ASKS_SIGNIN)) {
    const rest = t.slice(m.index + m[0].length, m.index + m[0].length + 80);
    const d = rest.match(/^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s"'`)]*)?/i);
    if (d && !/\.(?:md|json|mjs|js|txt|env|pem)$/i.test(d[1])) return { site: (d[1] + (d[2] || "")).replace(/[.,;:]+$/, ""), name: d[1].toLowerCase().replace(/^www\./, "") };
    const e = catalog().list.find((x) => new RegExp("^" + x.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(rest));
    if (e) return { site: e.hosts[0], name: e.name, id: e.id };
  }
  return null;
}

export { CATALOG, catalog, cleanEntry, linksState, linkSite, checkLink, unlinkSite, addSite, ownSites, signInAsked, OWN };
