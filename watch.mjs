// symbiot — Watch: keep track of a mapped web page (your Gmail inbox, GitHub's
// notifications) while the app runs. Every few minutes Symbiot reads the page
// again in its hidden browser (headless.mjs readPage: no screenshot, nothing
// pressed or typed) and compares what's listed there with what it has seen
// before. What's new is kept, newest first, and you get a notification. The
// first read only learns what's there, so it never announces your whole inbox.
// An agent reads what's new with `symbiot watch new`, and can act on it with
// `symbiot screens press` / `type`.
//
// GitHub's notifications (github.com/notifications) are read through `gh`
// when it's signed in, not the page: see readGitHub.
//
// Stored in ~/.config/symbiot/watch.json, readable by you only:
// { watches: [{ id, name, url, every (minutes), added, last, checked?, error?, via?, seen: [key…] }],
//   news: [{ id, watch, name, ts, text, href? }],
//   briefs: [{ id, watch, name, ts, count, text }] }
// `last` is when it was last read, `checked` when a read last worked; `seen`
// holds what's been listed, as itemKey()s. A brief is your AI's read of one
// batch of news (config.watchBrief switches it on), with the same `ts`.
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { CONFIG_DIR, loadConfig, saveConfig } from "./core.mjs";
import { readPage, siteUrl } from "./headless.mjs";
import { loadScreens } from "./screens.mjs";
import { desktopNotify } from "./desktop.mjs";
import { resolveProvider, write } from "./ai.mjs";

const WATCH_FILE = join(CONFIG_DIR, "watch.json");
const EVERY = [5, 15, 30, 60]; // minutes between reads
const MAX_WATCHES = 12, MAX_SEEN = 1000, MAX_NEWS = 200, MAX_PER_READ = 25, MAX_BRIEFS = 50;

function loadWatch() {
  const list = (d, k) => (Array.isArray(d[k]) ? d[k] : []);
  try { const d = JSON.parse(readFileSync(WATCH_FILE, "utf8")); return { watches: list(d, "watches"), news: list(d, "news"), briefs: list(d, "briefs") }; }
  catch { return { watches: [], news: [], briefs: [] }; }
}
// What's new can be your mail's senders and subjects, so it's yours only (0600).
function saveWatch(d) {
  try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(WATCH_FILE, JSON.stringify(d, null, 2), { mode: 0o600 }); try { chmodSync(WATCH_FILE, 0o600); } catch {} return true; }
  catch { return false; }
}
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const everyOf = (v, def) => (EVERY.includes(Number(v)) ? Number(v) : def);

// ---- what's on the page, and what's new ----------------------------------------
// What a page lists: its rows (an inbox, a table of notifications), else its
// links. Each { text, href? }, the whole text of a long row (headless.mjs keeps it).
const tidy = (s) => String(s || "").replace(/^\s*unread\s*,?\s*/i, "").replace(/\s+/g, " ").trim();
function itemsOf(page) {
  const all = (page && page.items) || [], rows = all.filter((r) => r.kind === "row");
  return (rows.length ? rows : all.filter((r) => r.kind === "link"))
    .filter((r) => r.label && r.label !== r.kind)
    .map((r) => ({ text: tidy(r.text || r.label), ...(r.href ? { href: r.href } : {}) }))
    .filter((x) => x.text.length > 2);
}
// The same item from one read to the next, though its time reads differently
// ("9:05 AM" today, "Oct 5" tomorrow, "2 hours ago") or it's been read or starred.
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const WHEN = [
  /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\b\.?)?/gi,                                     // 9:05 AM, 08:24
  new RegExp(`\\b${MONTH}\\s+\\d{1,2}\\b(?:,?\\s+\\d{4}\\b)?`, "gi"),                         // Oct 5, Oct 5, 2026
  new RegExp(`\\b\\d{1,2}\\s+${MONTH}(?=\\W|$)(?:\\s+\\d{4}\\b)?`, "gi"),                      // 5 Oct
  /\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/g,                                                      // 10/5/26, 2026-10-05
  /\b(?:\d+|an?)\s+(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\s+ago\b/gi,
  /\b(?:just now|yesterday|today)\b/gi,
  /\b(?:unread|not starred|starred)\b/gi,
];
function itemKey(text) {
  let s = String(text || "").toLowerCase();
  for (const re of WHEN) s = s.replace(re, " ");
  return s.replace(/[\s,;·•|]+/g, " ").trim().slice(0, 240);
}
// The items not seen before, top first, and the keys of everything listed now.
// An item can bring its own key (GitHub's: its thread and when it changed).
function newItems(seen, items) {
  const known = new Set(seen), keys = new Set(), fresh = [];
  for (const it of items) {
    const k = it.key || itemKey(it.text); if (!k || keys.has(k)) continue;
    keys.add(k); if (!known.has(k)) fresh.push(it);
  }
  return { fresh, keys: [...keys] };
}
// Remember what's listed now as the most recent, and forget the oldest.
function remember(seen, keys) { const now = new Set(keys); return [...(seen || []).filter((k) => !now.has(k)), ...keys].slice(-MAX_SEEN); }

// ---- GitHub, through gh --------------------------------------------------------
// Review requests, failed CI runs and mentions read better from GitHub's API than
// from its page: with the GitHub CLI signed in (gh auth login), Symbiot asks it
// for your unread notifications. No browser, no Sign in. Without gh, the page is
// read like any other.
const GITHUB_INBOX = "https://github.com/notifications";
const isGitHubInbox = (url) => /^https:\/\/(www\.)?github\.com\/notifications(?:[/?#]|$)/i.test(String(url || ""));
const REASON = { review_requested: "Review requested", approval_requested: "Approval requested", mention: "Mentioned", team_mention: "Team mentioned", assign: "Assigned", security_alert: "Security alert", invitation: "Invitation", comment: "New comment", state_change: "Changed" };
// The page on github.com for a notification (its subject's url is the API's).
function githubHref(n) {
  const repo = (n.repository && n.repository.html_url) || "", api = String((n.subject && n.subject.url) || "");
  const m = api.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/(pulls|issues|commits|releases)\/([^/]+)$/);
  if (m) return m[2] === "releases" ? `https://github.com/${m[1]}/releases` : `https://github.com/${m[1]}/${{ pulls: "pull", issues: "issues", commits: "commit" }[m[2]]}/${m[3]}`;
  if (n.subject && /^(CheckSuite|WorkflowRun)$/.test(n.subject.type) && repo) return repo + "/actions";
  return repo || GITHUB_INBOX;
}
// GET /notifications's answer as items. Each is keyed by its thread and when it
// last changed: a CI run failing again on the same branch, or a new comment on a
// pull request, is new again.
function githubItems(list) {
  return (Array.isArray(list) ? list : []).filter((n) => n && n.id && n.subject && n.subject.title).map((n) => {
    const why = n.reason === "ci_activity" ? "" : REASON[n.reason] || "";
    const repo = (n.repository && n.repository.full_name) || "";
    return { text: [why, repo, n.subject.title].filter(Boolean).join(" · ").slice(0, 300), href: githubHref(n), key: `github ${n.id} ${n.updated_at || ""}` };
  });
}
// Your unread notifications through gh, as a page Watch reads ({ url, list,
// via }), or null when gh isn't there or isn't signed in (then the page is read).
function readGitHub() {
  return new Promise((resolve) => {
    execFile("gh", ["api", "notifications?per_page=50"], { timeout: 30000, maxBuffer: 8 << 20, windowsHide: true }, (err, out) => {
      if (err) return resolve(null);
      try { resolve({ url: GITHUB_INBOX, list: githubItems(JSON.parse(out)), via: "gh" }); } catch { resolve(null); }
    });
  });
}

// ---- the brief -------------------------------------------------------------------
// Switched on, your AI reads each batch of news (what the page lists: for mail,
// the sender, subject and Gmail's one-line preview) and says what needs you and
// what can wait. That's in the app and in the notification. A local Ollama model
// keeps it all on this computer.
const briefOn = () => !!loadConfig().watchBrief;
function setBrief(on) { const cfg = loadConfig(); if (on) cfg.watchBrief = true; else delete cfg.watchBrief; return saveConfig(cfg) ? { brief: !!on } : { error: "Couldn't write the config file." }; }
async function briefOf(news, name) {
  if (!resolveProvider()) return "";
  const system = `You triage what just arrived on a page someone watches: their email inbox, or their GitHub notifications. ` +
    `In at most 3 short lines of plain text, first what needs them (and why, in a few words), then what can wait. ` +
    `Name things by sender and subject so they can find them. Use only what's shown; never guess at what a message says beyond it. No preamble, no markdown.`;
  const text = await write(system, `New on ${name}:\n${news.map((n) => "- " + n.text).join("\n")}\n\nWhat needs me, and what can wait?`);
  return text && !/^\(?couldn't reach the model/i.test(text) ? text.trim().slice(0, 600) : "";
}

// ---- watches -------------------------------------------------------------------
const view = (w) => ({ id: w.id, name: w.name, url: w.url, every: w.every, added: w.added, last: w.last || 0, ...(w.checked ? { checked: w.checked } : {}), ...(w.error ? { error: w.error } : {}), ...(w.via ? { via: w.via } : {}), known: (w.seen || []).length });
function watchState() { const d = loadWatch(); return { watches: d.watches.map(view), news: d.news.slice(0, 50), briefs: d.briefs.slice(0, 10), brief: briefOn(), every: EVERY }; }

// Watch a mapped page (`screen`: its id) or a site (`site`; "github" is GitHub's
// notifications). Watching the same address again just changes how often.
function addWatch({ screen, site, every, name } = {}) {
  const s = screen ? loadScreens().find((x) => x.id === screen) : null;
  if (screen && !s) return { error: `No screen ${screen}.` };
  if (s && !s.page) return { error: "Watch reads a web page you mapped (Map page). A screenshot of your screen can't be read again by itself." };
  const url = s ? s.page.url : /^\s*(https?:\/\/)?(www\.)?github(\.com)?\/?\s*$/i.test(String(site || "")) ? GITHUB_INBOX : siteUrl(site);
  if (!url) return { error: "Give a mapped page or a site to watch: gmail, github or a web address." };
  const d = loadWatch(), had = d.watches.find((w) => w.url === url);
  if (had) { had.every = everyOf(every, had.every); return saveWatch(d) ? view(had) : { error: "Couldn't write " + WATCH_FILE + "." }; }
  if (d.watches.length >= MAX_WATCHES) return { error: `You're watching ${MAX_WATCHES} pages already. Stop watching one first.` };
  const fallback = isGitHubInbox(url) ? "GitHub notifications" : hostOf(url);
  const w = { id: randomBytes(4).toString("hex"), name: String(name || (s && s.name) || fallback).trim().slice(0, 80) || fallback, url, every: everyOf(every, 15), added: Date.now(), last: 0, seen: [] };
  d.watches.push(w);
  return saveWatch(d) ? view(w) : { error: "Couldn't write " + WATCH_FILE + "." };
}
function setEvery(id, every) {
  const d = loadWatch(), w = d.watches.find((x) => x.id === id); if (!w) return { error: `No watch ${id}.` };
  if (!EVERY.includes(Number(every))) return { error: `Every ${EVERY.join(", ")} minutes.` };
  w.every = Number(every); saveWatch(d); return view(w);
}
// Stop watching, and forget what it found.
function removeWatch(id) {
  const d = loadWatch(); if (!d.watches.some((x) => x.id === id)) return { error: `No watch ${id}.` };
  d.watches = d.watches.filter((x) => x.id !== id); d.news = d.news.filter((n) => n.watch !== id); d.briefs = d.briefs.filter((n) => n.watch !== id);
  saveWatch(d); return { ok: true };
}
function clearNews() { const d = loadWatch(); d.news = []; d.briefs = []; saveWatch(d); return { ok: true }; }
// What's new in the last `hours`, newest first (what an agent reads).
function newsSince(hours = 24, now = Date.now()) { return loadWatch().news.filter((n) => n.ts >= now - hours * 3600000); }
// What's new after `ts` (exclusive), and its briefs: what the phone asks for.
function newsAfter(ts) { const d = loadWatch(), t = Number(ts) || 0; return { news: d.news.filter((n) => n.ts > t), briefs: d.briefs.filter((b) => b.ts > t) }; }

// ---- for Standup: "3 emails waiting on you" ------------------------------------
// What a watch lists, as a noun: mail, GitHub notifications, else new things on it.
function kindOf(url) {
  const h = hostOf(url);
  if (isGitHubInbox(url)) return ["GitHub notification", "GitHub notifications"];
  if (/^(mail|webmail)\.|^outlook\.(live|office|office365)\.com$/.test(h)) return ["email", "emails"];
  return null;
}
// What's new on each page you watch in the last `hours`: [{ name, count, label,
// items }], label like "3 emails" or "2 new on Jira".
function waitingOn(hours = 24, now = Date.now()) {
  const d = loadWatch(), out = new Map();
  for (const n of d.news.filter((x) => x.ts >= now - hours * 3600000)) {
    const w = d.watches.find((x) => x.id === n.watch); if (!w) continue;
    const g = out.get(w.id) || { name: w.name, url: w.url, items: [] }; g.items.push(n.text); out.set(w.id, g);
  }
  return [...out.values()].map((g) => {
    const k = kindOf(g.url), count = g.items.length;
    return { name: g.name, count, label: k ? `${count} ${k[count === 1 ? 0 : 1]}` : `${count} new on ${g.name}`, items: g.items };
  });
}

// A batch of news as one notification: how many and where, then the brief if
// there is one, else the first few. The phone (phone.mjs) shows the same.
function newsNotice(news, name, brief = "") {
  return [`${news.length} new · ${String(name).slice(0, 50)}`,
    brief || news.slice(0, 3).map((n) => n.text.slice(0, 90)).join("\n") + (news.length > 3 ? `\n…and ${news.length - 3} more in Symbiot` : "")];
}

// Read a watched page now and note what's new. `read`, `github`, `notify` and
// `brief` are headless.mjs's readPage, readGitHub, a desktop notification and
// briefOf (the tests pass their own). Gives the watch, plus `new` (what was new)
// and `brief`, or `learned` (the first read), or `busy` when the hidden browser
// is in use (nothing changes: it's read later).
async function checkWatch(id, { read = readPage, github = readGitHub, notify = desktopNotify, brief = briefOf } = {}) {
  const w0 = loadWatch().watches.find((x) => x.id === id); if (!w0) return { error: `No watch ${id}.` };
  const page = (isGitHubInbox(w0.url) && await github()) || (await read(w0.url)) || { error: "Nothing came back from the page." };
  if (page.busy) return { ...view(w0), busy: true };
  // read again: the file may have changed while the page loaded
  const d = loadWatch(), w = d.watches.find((x) => x.id === id); if (!w) return { error: "That watch was removed." };
  w.last = Date.now();
  // through gh, a list with nothing unread is a good read; a page always lists something
  const items = page.error || page.login ? [] : page.list || itemsOf(page), before = w.error || "";
  if (page.login) w.error = `Signed out of ${hostOf(page.url) || hostOf(w.url)}. Under Screens, type ${hostOf(w.url)} and click Sign in, sign in once and close the window.` + (isGitHubInbox(w.url) ? " Or sign in the GitHub CLI (gh auth login): Symbiot then reads your notifications through it." : "");
  else if (page.error) w.error = page.error;
  else if (!items.length && !page.list) w.error = "Found nothing listed on the page this time.";
  if (page.error || page.login || (!items.length && !page.list)) {
    saveWatch(d);
    // signed out needs you; the rest (the browser busy with Sign in, a slow page) usually passes by itself
    if (page.login && w.error !== before) notify("Symbiot", `${w.name}: ${w.error}`);
    return view(w);
  }
  delete w.error;
  // read another way than last time (gh, or the page while gh is out): the same
  // things look different, so learn them again rather than announce them all
  const first = !w.checked || (w.via || "") !== (page.via || ""), { fresh, keys } = newItems(w.seen, items);
  if (page.via) w.via = page.via; else delete w.via;
  w.seen = remember(w.seen, keys); w.checked = w.last;
  const news = first ? [] : fresh.slice(0, MAX_PER_READ).map((it) => ({ id: randomBytes(4).toString("hex"), watch: w.id, name: w.name, ts: w.last, text: it.text.slice(0, 300), ...(it.href ? { href: it.href } : {}) }));
  d.news = [...news, ...d.news].slice(0, MAX_NEWS);
  saveWatch(d);
  if (first) return { ...view(w), learned: keys.length };
  let said = "";
  if (news.length && briefOn()) {
    said = await brief(news, w.name).catch(() => "");
    if (said) { const d2 = loadWatch(); d2.briefs = [{ id: randomBytes(4).toString("hex"), watch: w.id, name: w.name, ts: w.last, count: news.length, text: said }, ...d2.briefs].slice(0, MAX_BRIEFS); saveWatch(d2); }
  }
  if (news.length) notify(...newsNotice(news, w.name, said));
  return { ...view(w), new: news, ...(said ? { brief: said } : {}) };
}
// The watches that are due, longest-waiting first.
function dueWatches(now = Date.now()) { return loadWatch().watches.filter((w) => now - (w.last || 0) >= w.every * 60000).sort((a, b) => (a.last || 0) - (b.last || 0)); }

// While the app runs: once a minute, read the watches that are due, one at a
// time. Returns a stop function.
function startWatches(opts = {}) {
  let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try { for (const w of dueWatches()) { const r = await checkWatch(w.id, opts); if (r && r.busy) break; } }
    catch {} finally { busy = false; }
  };
  const first = setTimeout(tick, 20000), every = setInterval(tick, 60 * 1000);
  first.unref(); every.unref();
  return () => { clearTimeout(first); clearInterval(every); };
}

export { WATCH_FILE, EVERY, GITHUB_INBOX, itemsOf, itemKey, newItems, remember, isGitHubInbox, githubItems, readGitHub, setBrief, briefOf, newsNotice, watchState, addWatch, setEvery, removeWatch, clearNews, newsSince, newsAfter, waitingOn, checkWatch, dueWatches, startWatches };
