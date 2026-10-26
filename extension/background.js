// Symbiot in your own Chrome: the service worker. It talks to nothing but Symbiot's native host
// (com.symbiot.chrome), which Chrome starts for this extension alone: no port is open, and no page
// or other program can reach it. It works only in the tabs it opened, in a window and a "Symbiot"
// tab group of its own, and only on sites Chrome has allowed it one by one (its toolbar button
// asks). It never uses chrome.debugger, so a site sees plain Chrome, signed in as you.
// What it runs in a page is page.js, which ships with it; the app names a function there, never code.
const HOST = "com.symbiot.chrome";
let port = null, stopped = false;
const pieces = {}; // Upload's files on their way in, by key

// Its window, its tabs (one per site) and the sites waiting for your Allow, kept across the worker's restarts.
const get = async (k, d) => ((await chrome.storage.session.get(k))[k] ?? d);
const put = (k, v) => chrome.storage.session.set({ [k]: v });
const asks = async () => (await chrome.storage.local.get("asks")).asks || [];

function send(m) { try { if (port) port.postMessage(m); } catch (e) { port = null; } }
async function hello() {
  const { origins = [] } = await chrome.permissions.getAll();
  return { event: "hello", version: chrome.runtime.getManifest().version, origins, asks: await asks(), stopped };
}
function connect() {
  if (port || stopped) return;
  try { port = chrome.runtime.connectNative(HOST); } catch (e) { port = null; return; }
  port.onMessage.addListener((m) => { onMessage(m); });
  port.onDisconnect.addListener(() => { port = null; badge(""); if (!stopped) setTimeout(connect, 5000); });
  hello().then(send);
}

async function onMessage(m) {
  if (!m || typeof m !== "object" || m.event) return; // the host's ping keeps this worker awake
  const { id, op } = m;
  try { send({ id, ...(await (OPS[op] || (() => ({ error: `Unknown request "${op}".` })))(m)) }); }
  catch (e) { send({ id, error: String((e && e.message) || e) }); }
}

// A site is Chrome's to allow: once you press Allow on the toolbar button, never by itself.
const originOf = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : ""; } catch (e) { return ""; } };
async function allowed(url) {
  const o = originOf(url); if (!o) return false;
  return chrome.permissions.contains({ origins: [o + "/*"] });
}
async function askFor(url) {
  const o = originOf(url), a = await asks();
  if (o && !a.includes(o)) await chrome.storage.local.set({ asks: [...a, o].slice(-20) });
  badge("!");
}
function badge(t) { try { chrome.action.setBadgeText({ text: t }); chrome.action.setBadgeBackgroundColor({ color: "#B42318" }); } catch (e) {} }

// Its own window, never focused, and its tab for a site in a "Symbiot" group there.
async function windowOf() {
  const w = await get("win", 0);
  if (w) { try { await chrome.windows.get(w); return w; } catch (e) {} }
  const made = await chrome.windows.create({ focused: false, width: 1280, height: 900, type: "normal" });
  await put("win", made.id); await put("tabs", {});
  return made.id;
}
async function tabFor(url) {
  const win = await windowOf(), tabs = await get("tabs", {}), host = new URL(url).host;
  let id = tabs[host];
  if (id) { try { const t = await chrome.tabs.get(id); if (t.windowId !== win) id = 0; } catch (e) { id = 0; } }
  if (id) await chrome.tabs.update(id, { url, active: true });
  else {
    const made = await chrome.tabs.create({ windowId: win, url, active: true }); id = made.id;
    // the blank tab a new window opens with goes once there's a real one
    for (const t of await chrome.tabs.query({ windowId: win })) if (t.id !== id && !Object.values(tabs).includes(t.id)) chrome.tabs.remove(t.id).catch(() => {});
    tabs[host] = id; await put("tabs", tabs);
    // its group, or a new one when that's gone
    const fresh = { tabIds: [id], createProperties: { windowId: win } }, had = await get("group", 0);
    try {
      let g; try { g = await chrome.tabs.group(had ? { tabIds: [id], groupId: had } : fresh); } catch (e) { g = await chrome.tabs.group(fresh); }
      await put("group", g); await chrome.tabGroups.update(g, { title: "Symbiot", color: "cyan" });
    } catch (e) {}
  }
  await loaded(id);
  return id;
}
async function mine(id) { return Object.values(await get("tabs", {})).includes(id); }
// Loaded, then a moment for what the page draws after
async function loaded(id, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const t = await chrome.tabs.get(id); if (t.status === "complete") break; await sleep(200); }
  await sleep(800);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A function of page.js, by name, in the tab: the page's answer.
async function inPage(tab, fn, args = []) {
  await chrome.scripting.executeScript({ target: { tabId: tab }, files: ["page.js"] });
  const [r] = await chrome.scripting.executeScript({ target: { tabId: tab }, func: (n, a) => (self.__symbiot && self.__symbiot[n] ? self.__symbiot[n](...a) : { error: "no " + n }), args: [fn, args] });
  return r && r.result;
}
// The tab as it is now: what's on it, the window's size (and screen pixels to a page pixel), its picture if Chrome gives one.
async function look(tab) {
  const t = await chrome.tabs.get(tab);
  const info = await inPage(tab, "collect"), seen = await inPage(tab, "block"), view = await inPage(tab, "view");
  // a picture needs access to every site, which it doesn't ask for: without one, Symbiot draws the page
  let png = "";
  try { await chrome.tabs.update(tab, { active: true }); png = (await chrome.tabs.captureVisibleTab(t.windowId, { format: "png" })).replace(/^data:image\/png;base64,/, ""); }
  catch (e) {}
  return { tab, info, seen, view, png };
}

const OPS = {
  hello,
  // open url in its tab for that site and give what's on it
  async map({ url }) {
    if (!originOf(url)) return { error: "Only a web address (https://…) can be opened." };
    if (!(await allowed(url))) { await askFor(url); return { error: "not allowed", origin: originOf(url) }; }
    return look(await tabFor(url));
  },
  // its tab for url's site, left as it is when it's still at url (what was typed there stays), else opened there
  async tab({ url }) {
    if (!originOf(url)) return { error: "Only a web address (https://…) can be opened." };
    if (!(await allowed(url))) { await askFor(url); return { error: "not allowed", origin: originOf(url) }; }
    const id = (await get("tabs", {}))[new URL(url).host], bare = (u) => String(u || "").split("#")[0];
    if (id) { try { const t = await chrome.tabs.get(id); if (bare(t.url) === bare(url)) return { tab: id, same: true }; } catch (e) {} }
    return { tab: await tabFor(url), same: false };
  },
  // the tab as it is now, without opening it again
  async look({ tab }) {
    if (!(await mine(tab))) return { error: "That tab isn't one of Symbiot's." };
    const t = await chrome.tabs.get(tab);
    if (!(await allowed(t.url))) { await askFor(t.url); return { error: "not allowed", origin: originOf(t.url) }; }
    return look(tab);
  },
  // a function of page.js in one of its tabs, on a site that's allowed
  async run({ tab, fn, args }) {
    if (!(await mine(tab))) return { error: "That tab isn't one of Symbiot's." };
    const t = await chrome.tabs.get(tab);
    if (!(await allowed(t.url))) { await askFor(t.url); return { error: "not allowed", origin: originOf(t.url) }; }
    return { result: await inPage(tab, String(fn), Array.isArray(args) ? args : []) };
  },
  // a file for Upload, a piece at a time (a message from Symbiot carries at most 1 MB), kept here till attach
  async put({ key, file, part, parts, data }) {
    const k = String(key); if (!pieces[k]) pieces[k] = { at: Date.now(), files: [] };
    const f = pieces[k].files[file] = pieces[k].files[file] || { parts: [], n: parts };
    f.parts[part] = String(data || "");
    for (const [x, v] of Object.entries(pieces)) if (Date.now() - v.at > 600000) delete pieces[x];
    return { ok: true };
  },
  // the pieces put together, into the file box page.js found in one of its tabs
  async attach({ tab, key, files }) {
    const got = pieces[String(key)]; delete pieces[String(key)];
    if (!got) return { error: "The file didn't arrive whole. Try the upload again." };
    if (!(await mine(tab))) return { error: "That tab isn't one of Symbiot's." };
    const t = await chrome.tabs.get(tab);
    if (!(await allowed(t.url))) { await askFor(t.url); return { error: "not allowed", origin: originOf(t.url) }; }
    const list = (files || []).map((m, i) => { const f = got.files[i]; return f && f.parts.length === f.n && f.parts.every((x) => typeof x === "string") ? { name: String(m.name || "file"), type: String(m.type || ""), b64: f.parts.join("") } : null; });
    if (!list.length || list.some((x) => !x)) return { error: "The file didn't arrive whole. Try the upload again." };
    return { result: await inPage(tab, "attach", [list]) };
  },
  async wait({ tab, ms }) { if (await mine(tab)) await loaded(tab, Math.min(60000, Number(ms) || 30000)); return { ok: true }; },
  stop,
};

// Stop: its tabs close and it lets go of Symbiot until you press Start again.
async function stop() {
  stopped = true; await chrome.storage.local.set({ stopped: true });
  const tabs = Object.values(await get("tabs", {}));
  if (tabs.length) await chrome.tabs.remove(tabs).catch(() => {});
  await put("tabs", {});
  // after its answer goes back, when Symbiot asked for it
  setTimeout(() => { if (port) { try { port.disconnect(); } catch (e) {} port = null; } badge(""); }, 0);
  return { ok: true };
}
async function start() { stopped = false; await chrome.storage.local.set({ stopped: false }); connect(); }

// The toolbar button's page: whether Symbiot is connected, the sites to allow, Stop and Start.
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  (async () => {
    if (m.op === "state") return { connected: !!port, stopped, asks: await asks(), origins: (await chrome.permissions.getAll()).origins || [] };
    if (m.op === "allowed") { const a = (await asks()).filter((o) => o !== m.origin); await chrome.storage.local.set({ asks: a }); if (!a.length) badge(""); send(await hello()); return { ok: true }; }
    if (m.op === "forget") { await chrome.permissions.remove({ origins: [m.origin + "/*"] }); send(await hello()); return { ok: true }; }
    if (m.op === "stop") return stop();
    if (m.op === "start") { await start(); return { ok: true }; }
    return { error: "unknown" };
  })().then(reply, (e) => reply({ error: String(e) }));
  return true;
});

chrome.tabs.onRemoved.addListener(async (id) => { const t = await get("tabs", {}); for (const [h, v] of Object.entries(t)) if (v === id) delete t[h]; await put("tabs", t); });
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.alarms.create("symbiot", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(connect);
chrome.storage.local.get("stopped").then((s) => { stopped = !!s.stopped; connect(); });
