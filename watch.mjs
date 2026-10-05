// symbiot — Watch: keep track of a mapped web page (your Gmail inbox, GitHub's
// notifications) while the app runs. Every few minutes Symbiot reads the page
// again in its hidden browser (headless.mjs readPage: no screenshot, nothing
// pressed or typed) and compares what's listed there with what it has seen
// before. What's new is kept, newest first, and you get a notification. The
// first read only learns what's there, so it never announces your whole inbox.
// An agent reads what's new with `symbiot watch new`, and can act on it with
// `symbiot screens press` / `type`.
//
// Stored in ~/.config/symbiot/watch.json, readable by you only:
// { watches: [{ id, name, url, every (minutes), added, last, checked?, error?, seen: [key…] }],
//   news: [{ id, watch, name, ts, text, href? }] }
// `last` is when it was last read, `checked` when a read last worked; `seen`
// holds what's been listed, as itemKey()s.
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { CONFIG_DIR } from "./core.mjs";
import { readPage, siteUrl } from "./headless.mjs";
import { loadScreens } from "./screens.mjs";
import { desktopNotify } from "./desktop.mjs";

const WATCH_FILE = join(CONFIG_DIR, "watch.json");
const EVERY = [5, 15, 30, 60]; // minutes between reads
const MAX_WATCHES = 12, MAX_SEEN = 1000, MAX_NEWS = 200, MAX_PER_READ = 25;

function loadWatch() {
  try { const d = JSON.parse(readFileSync(WATCH_FILE, "utf8")); return { watches: Array.isArray(d.watches) ? d.watches : [], news: Array.isArray(d.news) ? d.news : [] }; }
  catch { return { watches: [], news: [] }; }
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
function newItems(seen, items) {
  const known = new Set(seen), keys = new Set(), fresh = [];
  for (const it of items) {
    const k = itemKey(it.text); if (!k || keys.has(k)) continue;
    keys.add(k); if (!known.has(k)) fresh.push(it);
  }
  return { fresh, keys: [...keys] };
}
// Remember what's listed now as the most recent, and forget the oldest.
function remember(seen, keys) { const now = new Set(keys); return [...(seen || []).filter((k) => !now.has(k)), ...keys].slice(-MAX_SEEN); }

// ---- watches -------------------------------------------------------------------
const view = (w) => ({ id: w.id, name: w.name, url: w.url, every: w.every, added: w.added, last: w.last || 0, ...(w.checked ? { checked: w.checked } : {}), ...(w.error ? { error: w.error } : {}), known: (w.seen || []).length });
function watchState() { const d = loadWatch(); return { watches: d.watches.map(view), news: d.news.slice(0, 50), every: EVERY }; }

// Watch a mapped page (`screen`: its id) or a site (`site`). Watching the same
// address again just changes how often.
function addWatch({ screen, site, every, name } = {}) {
  const s = screen ? loadScreens().find((x) => x.id === screen) : null;
  if (screen && !s) return { error: `No screen ${screen}.` };
  if (s && !s.page) return { error: "Watch reads a web page you mapped (Map page). A screenshot of your screen can't be read again by itself." };
  const url = s ? s.page.url : siteUrl(site);
  if (!url) return { error: "Give a mapped page or a site to watch: gmail, github.com/notifications or a web address." };
  const d = loadWatch(), had = d.watches.find((w) => w.url === url);
  if (had) { had.every = everyOf(every, had.every); return saveWatch(d) ? view(had) : { error: "Couldn't write " + WATCH_FILE + "." }; }
  if (d.watches.length >= MAX_WATCHES) return { error: `You're watching ${MAX_WATCHES} pages already. Stop watching one first.` };
  const w = { id: randomBytes(4).toString("hex"), name: String(name || (s && s.name) || hostOf(url)).trim().slice(0, 80) || hostOf(url), url, every: everyOf(every, 15), added: Date.now(), last: 0, seen: [] };
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
  d.watches = d.watches.filter((x) => x.id !== id); d.news = d.news.filter((n) => n.watch !== id);
  saveWatch(d); return { ok: true };
}
function clearNews() { const d = loadWatch(); d.news = []; saveWatch(d); return { ok: true }; }
// What's new in the last `hours`, newest first (what an agent reads).
function newsSince(hours = 24, now = Date.now()) { return loadWatch().news.filter((n) => n.ts >= now - hours * 3600000); }

// Read a watched page now and note what's new. `read` and `notify` are
// headless.mjs's readPage and a desktop notification (the tests pass their own).
// Gives the watch, plus `new` (what was new) or `learned` (the first read), or
// `busy` when the hidden browser is in use (nothing changes: it's read later).
async function checkWatch(id, { read = readPage, notify = desktopNotify } = {}) {
  const w0 = loadWatch().watches.find((x) => x.id === id); if (!w0) return { error: `No watch ${id}.` };
  const page = (await read(w0.url)) || { error: "Nothing came back from the page." };
  if (page.busy) return { ...view(w0), busy: true };
  // read again: the file may have changed while the page loaded
  const d = loadWatch(), w = d.watches.find((x) => x.id === id); if (!w) return { error: "That watch was removed." };
  w.last = Date.now();
  const items = page.error || page.login ? [] : itemsOf(page), before = w.error || "";
  if (page.login) w.error = `Signed out of ${hostOf(page.url) || hostOf(w.url)}. Under Screens, type ${hostOf(w.url)} and click Sign in, sign in once and close the window.`;
  else if (page.error) w.error = page.error;
  else if (!items.length) w.error = "Found nothing listed on the page this time.";
  if (page.error || page.login || !items.length) {
    saveWatch(d);
    // signed out needs you; the rest (the browser busy with Sign in, a slow page) usually passes by itself
    if (page.login && w.error !== before) notify("Symbiot", `${w.name}: ${w.error}`);
    return view(w);
  }
  delete w.error;
  const first = !w.checked, { fresh, keys } = newItems(w.seen, items);
  w.seen = remember(w.seen, keys); w.checked = w.last;
  const news = first ? [] : fresh.slice(0, MAX_PER_READ).map((it) => ({ id: randomBytes(4).toString("hex"), watch: w.id, name: w.name, ts: w.last, text: it.text.slice(0, 300), ...(it.href ? { href: it.href } : {}) }));
  d.news = [...news, ...d.news].slice(0, MAX_NEWS);
  saveWatch(d);
  if (news.length) notify(`${news.length} new · ${w.name.slice(0, 50)}`, news.slice(0, 3).map((n) => n.text.slice(0, 90)).join("\n") + (news.length > 3 ? `\n…and ${news.length - 3} more in Symbiot` : ""));
  return { ...view(w), ...(first ? { learned: keys.length } : { new: news }) };
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

export { WATCH_FILE, EVERY, itemsOf, itemKey, newItems, remember, watchState, addWatch, setEvery, removeWatch, clearNews, newsSince, checkWatch, dueWatches, startWatches };
