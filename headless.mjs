// symbiot — Screens, headless: open a web page in a browser nobody sees, take its
// screenshot and map every button, link and field on it by itself, as a screen
// whose regions are already named (screens.mjs). Nothing to bring to the front,
// nothing to drag. Each region keeps how to find it again (a CSS selector), so it
// can be pressed (or a field typed into) in that same hidden browser, which maps
// the page it lands on: map → press → map is how an agent finds its way around a
// site. On a site you trust (Settings), that goes ahead without asking. In the
// app the browser stays open for a few minutes after each action, so the next
// one carries on from the page as it is (type into a field, then press Send).
// readPage reads a page without saving a screen, for Watch (watch.mjs).
//
// It drives Chrome / Chromium / Edge / Brave over the DevTools protocol on a pipe
// (--remote-debugging-pipe: commands in on fd 3, replies out on fd 4, each JSON
// message ending in a NUL byte), so it needs no npm packages and opens no port.
// The browser keeps its own profile in ~/.config/symbiot/browser: sign in to a
// site once there (signIn opens it as a normal window) and later maps see it
// signed in. It's separate from your everyday browser profile.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { CONFIG_DIR, chromeBinary, loadConfig, saveConfig } from "./core.mjs";
import { loadScreens, addPageScreen, center } from "./screens.mjs";

const PROFILE = join(CONFIG_DIR, "browser");
const VIEW = { w: 1280, h: 800 }; // the page's size: a laptop-sized window
const TIMEOUT = 90000;            // the most one map, press or type may take
const START = 30000;              // the most the browser may take to start

// What the user typed, as a web address: a URL, a host ("github.com/pulls"), or a
// site's name ("gmail" -> https://gmail.com). "open gmail" works too. "" if none.
function siteUrl(input) {
  let s = String(input || "").trim().replace(/^open\s+/i, "");
  if (!s || /\s/.test(s)) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s) || /^localhost:\d/i.test(s)) {
    if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/i.test(s)) s = "http://" + s;
    else if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#].*)?$/i.test(s)) s = "https://" + s;
    else if (/^[a-z0-9-]+$/i.test(s)) s = "https://" + s.toLowerCase() + ".com";
    else return "";
  }
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname ? u.href : ""; } catch { return ""; }
}

// The browser's flags. The same profile and password store headless and not, so
// a sign-in made in the window is readable by the hidden browser.
function browserArgs(headless, url = "about:blank") {
  return [
    ...(headless ? ["--headless=new", "--hide-scrollbars", "--mute-audio", "--remote-debugging-pipe", `--window-size=${VIEW.w},${VIEW.h}`] : ["--new-window"]),
    "--user-data-dir=" + PROFILE, "--no-first-run", "--no-default-browser-check",
    ...(process.platform === "linux" ? ["--password-store=basic"] : process.platform === "darwin" ? ["--use-mock-keychain"] : []),
    url,
  ];
}

// A DevTools connection over the browser's pipe: send(method, params, session)
// gives the result (or throws its error); until(test, ms) waits for an event.
function connect(proc) {
  let next = 1, buf = Buffer.alloc(0), closed = false;
  const waiting = new Map(), listeners = new Set();
  proc.stdio[4].on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (let end; (end = buf.indexOf(0)) >= 0; buf = buf.subarray(end + 1)) {
      let m; try { m = JSON.parse(buf.subarray(0, end).toString("utf8")); } catch { continue; }
      if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.reject(new Error(`${w.method}: ${m.error.message}`)) : w.resolve(m.result || {}); }
      else for (const f of [...listeners]) f(m);
    }
  });
  const gone = () => { closed = true; for (const w of waiting.values()) w.reject(new Error("The browser closed.")); waiting.clear(); for (const f of [...listeners]) f(null); };
  proc.on("exit", gone); proc.stdio[4].on("error", gone); proc.stdio[3].on("error", () => {});
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    if (closed) return reject(new Error("The browser closed."));
    const id = next++; waiting.set(id, { resolve, reject, method });
    proc.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  });
  const until = (test, ms) => new Promise((resolve) => {
    const t = setTimeout(() => done(null), ms);
    const f = (m) => { if (m === null) done(null); else if (test(m)) done(m); };
    function done(v) { clearTimeout(t); listeners.delete(f); resolve(v); }
    listeners.add(f);
  });
  return { send, until, on: (f) => listeners.add(f), closed: () => closed };
}

// One browser at a time: they share a profile, and Chrome locks it.
let queue = Promise.resolve();
const oneAtATime = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

// The hidden browser, while it's open: { proc, c, page, shown, timer }. shown is
// the id of the screen last mapped from its page, which is what the page shows
// now. keepBrowserOpen(ms) keeps it open that long after each action (the app
// does); with 0, a one-off `symbiot screens` command, it closes after each one.
let live = null, KEEP = 0;
function keepBrowserOpen(ms) { KEEP = Math.max(0, Number(ms) || 0); if (!KEEP && live && !live.busy) closeBrowser(); }
const browserOpen = () => !!(live && !live.c.closed());
// Don't leave it running when Symbiot exits (a restart, Ctrl+C).
process.once("exit", () => { if (live && live.proc.exitCode === null) try { live.proc.kill("SIGKILL"); } catch {} });

// Start the hidden browser and open a tab: { proc, c, page: { send, until, idle } }.
async function launch() {
  const chrome = chromeBinary();
  if (!chrome) throw new Error(process.platform === "android" || process.env.SYMBIOT_ANDROID_APP === "1"
    ? "Mapping a page needs a desktop browser (Chrome, Chromium, Edge or Brave), which a phone doesn't have. Map pages from Symbiot on your computer."
    : "Mapping a page needs Chrome, Chromium, Edge or Brave, and none was found.");
  mkdirSync(PROFILE, { recursive: true, mode: 0o700 });
  const proc = spawn(chrome, browserArgs(true), { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  let err = ""; proc.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
  const failed = new Promise((resolve, reject) => { proc.on("error", reject); }); failed.catch(() => {});
  const c = connect(proc), b = { proc, c, shown: "", timer: null };
  const kill = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, START);
  try {
    const run = (async () => {
      let targetId;
      try { ({ targetId } = await c.send("Target.createTarget", { url: "about:blank" })); }
      catch (e) {
        // A second Chrome on a profile that's open hands over to the first and exits.
        if (existsSync(join(PROFILE, "SingletonLock")) || /existing browser session|ProcessSingleton/i.test(err)) throw new Error("Symbiot's browser is already open, in a window (Sign in) or in another Symbiot: close that, then try again.");
        throw new Error("The browser didn't start: " + ((err.trim().split("\n").pop()) || e.message));
      }
      const { sessionId } = await c.send("Target.attachToTarget", { targetId, flatten: true });
      const send = (method, params) => c.send(method, params, sessionId);
      const until = (method, ms) => c.until((m) => m.sessionId === sessionId && m.method === method, ms);
      // Requests in flight, so "loaded" can wait for a page that fills itself in.
      const inflight = new Set();
      c.on((m) => {
        if (!m || m.sessionId !== sessionId) return;
        if (m.method === "Network.requestWillBeSent") inflight.add(m.params.requestId);
        else if (m.method === "Network.loadingFinished" || m.method === "Network.loadingFailed") inflight.delete(m.params.requestId);
      });
      // Quiet: no more than one request (a long poll, say) open for 600 ms, or 8 s at most.
      const idle = async () => {
        const end = Date.now() + 8000; let calm = 0;
        await sleep(400);
        while (Date.now() < end && calm < 600) { await sleep(100); calm = inflight.size <= 1 ? calm + 100 : 0; }
      };
      await send("Page.enable"); await send("Network.enable");
      await send("Emulation.setDeviceMetricsOverride", { width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1, mobile: false });
      // Sites serve "HeadlessChrome" something else (or a block page): look like the browser it is.
      const { userAgent } = await c.send("Browser.getVersion");
      if (userAgent) await send("Network.setUserAgentOverride", { userAgent: userAgent.replace(/HeadlessChrome/g, "Chrome") });
      b.page = { send, until, idle };
      return b;
    })();
    return await Promise.race([run, failed]);
  } catch (e) { await shut(b); throw e; }
  finally { clearTimeout(kill); }
}
async function shut(b) {
  if (!b) return;
  clearTimeout(b.timer); if (live === b) live = null;
  if (!b.c.closed()) { try { await Promise.race([b.c.send("Browser.close"), sleep(3000)]); } catch {} }
  if (b.proc.exitCode === null) try { b.proc.kill("SIGKILL"); } catch {}
}
// Close the hidden browser now (the Sign in window needs its profile).
function closeBrowser() { return shut(live); }

// Give fn the hidden browser's page (the open one, else a new one), and what it
// shows (b.shown). After: kept open for KEEP ms, or closed; closed on an error,
// so the next action starts afresh.
async function withPage(fn, keep = true) {
  if (live && live.c.closed()) await shut(live);
  let b = live;
  if (b) clearTimeout(b.timer); else b = live = await launch();
  b.busy = true;
  const kill = setTimeout(() => { try { b.proc.kill("SIGKILL"); } catch {} }, TIMEOUT);
  try {
    const r = await fn(b.page, b);
    // stay: nothing changed on the page, so it shows what fn left in b.shown
    if (r && r.stay) delete r.stay; else b.shown = r && r.id && !r.error ? r.id : "";
    return r;
  } catch (e) { await shut(b); throw e; }
  finally {
    clearTimeout(kill); b.busy = false;
    if (live === b && KEEP && keep && !b.c.closed()) b.timer = setTimeout(() => oneAtATime(() => live === b && !b.busy ? shut(b) : null), KEEP);
    else await shut(b);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(page, url) {
  const loaded = page.until("Page.loadEventFired", 30000);
  const r = await page.send("Page.navigate", { url });
  if (r.errorText) throw new Error(`Couldn't open ${url} (${r.errorText}).`);
  await loaded; await page.idle();
}

// Runs in the page: scroller() is what scrolls it, as a mouse wheel would find it.
// That's the part under the middle of the window that scrolls (Gmail's list of
// mail scrolls inside the page, not the page), if it fills half the window or the
// page itself doesn't scroll; else the page; else the biggest part that scrolls.
// null when it all fits.
const SCROLLER = `function scroller() {
  const W = innerWidth, H = innerHeight, d = document.scrollingElement || document.documentElement;
  const can = (e) => e.scrollHeight - e.clientHeight > 1 && /^(auto|scroll|overlay)$/.test(getComputedStyle(e).overflowY);
  const seen = (e) => { const b = e.getBoundingClientRect(); return Math.max(0, Math.min(W, b.right) - Math.max(0, b.left)) * Math.max(0, Math.min(H, b.bottom) - Math.max(0, b.top)); };
  const page = d.scrollHeight - H > 1 && ![document.documentElement, document.body].some((e) => e && /^(hidden|clip)$/.test(getComputedStyle(e).overflowY));
  let mid = null;
  for (let e = document.elementFromPoint(W / 2, H / 2); e && e !== document.documentElement; e = e.parentElement) if (can(e)) { mid = e; break; }
  if (mid && (!page || seen(mid) >= W * H / 2)) return mid;
  if (page) return d;
  let best = null, most = 100 * 100;
  for (const e of document.querySelectorAll('body, body *')) if (e.scrollHeight - e.clientHeight > 1 && can(e)) { const a = seen(e); if (a > most) { best = e; most = a; } }
  return best;
}`;

// Runs in the page: everything you could click or type in that's on screen now
// and not covered, as { label, kind, x, y, w, h, selector, href? } in CSS pixels
// of the viewport (= the screenshot's, at scale 1). Inside a matched button or
// link, a part of the same kind is the same thing, so only the outer one counts.
// And how far down it's scrolled: { y, max, selector? } (no selector: the page
// itself), when there's more than the window shows.
const COLLECT = `(() => { ${SCROLLER}
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[contenteditable=""],[contenteditable=true],[onclick],' +
    ['button','link','tab','menuitem','menuitemcheckbox','menuitemradio','option','checkbox','radio','switch','combobox','textbox','searchbox','row','treeitem'].map((r) => '[role=' + r + ']').join(',');
  const W = innerWidth, H = innerHeight, out = [], kinds = new Map();
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const kindOf = (e) => {
    const t = e.tagName.toLowerCase(), r = (e.getAttribute('role') || '').toLowerCase(), ty = (e.getAttribute('type') || 'text').toLowerCase();
    if (t === 'input') return /^(button|submit|reset|image)$/.test(ty) ? 'button' : /^(checkbox|radio)$/.test(ty) ? ty : 'field';
    if (t === 'textarea' || e.isContentEditable || /^(textbox|searchbox)$/.test(r)) return 'field';
    if (t === 'select' || r === 'combobox') return 'menu';
    if (r === 'checkbox' || r === 'switch' || r === 'menuitemcheckbox') return 'checkbox';
    if (r === 'radio' || r === 'menuitemradio') return 'radio';
    if (r === 'tab') return 'tab';
    if (r === 'menuitem' || r === 'option' || r === 'treeitem') return 'menu item';
    if (r === 'row') return 'row';
    if (t === 'a' || r === 'link') return 'link';
    return 'button';
  };
  const labelOf = (e) => {
    let s = clean(e.getAttribute('aria-label')); if (s) return s;
    const by = e.getAttribute('aria-labelledby');
    if (by) { s = clean(by.split(/\\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ')); if (s) return s; }
    if (e.labels && e.labels[0]) { s = clean(e.labels[0].textContent); if (s) return s; }
    if (e.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(e.type)) { s = clean(e.value); if (s) return s; }
    s = clean(e.innerText); if (s) return s;
    for (const a of ['placeholder', 'title', 'name', 'alt']) { s = clean(e.getAttribute(a)); if (s) return s; }
    const img = e.querySelector('img[alt],svg title,[aria-label]');
    return img ? clean(img.getAttribute('alt') || img.getAttribute('aria-label') || img.textContent) : '';
  };
  const unique = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch (x) { return false; } };
  const cssPath = (e) => {
    const parts = [];
    for (let n = e; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      if (n.id && unique('#' + CSS.escape(n.id))) { parts.unshift('#' + CSS.escape(n.id)); break; }
      let p = n.tagName.toLowerCase();
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      if (same.length > 1) p += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      parts.unshift(p);
    }
    return parts.join(' > ');
  };
  for (const e of document.querySelectorAll(SEL)) {
    if (out.length >= 200) break;
    if (e.disabled || e.closest('[aria-hidden=true],[inert]')) continue;
    const kind = kindOf(e), up = e.parentElement && e.parentElement.closest(SEL);
    if (up && kinds.get(up) === kind && kind !== 'field') continue;
    const b = e.getBoundingClientRect();
    const x = Math.max(0, b.left), y = Math.max(0, b.top), x2 = Math.min(W, b.right), y2 = Math.min(H, b.bottom);
    if (x2 - x < 4 || y2 - y < 4) continue;
    const st = getComputedStyle(e);
    if (st.visibility === 'hidden' || st.pointerEvents === 'none' || +st.opacity === 0) continue;
    // on top: what's at its centre is it, or inside it (not a banner over it)
    const top = document.elementFromPoint((x + x2) / 2, (y + y2) / 2);
    if (!top || !(top === e || e.contains(top) || top.contains(e))) continue;
    kinds.set(e, kind);
    const full = labelOf(e);
    const r = { label: full.slice(0, 80) || kind, kind, x: Math.round(x), y: Math.round(y), w: Math.round(x2 - x), h: Math.round(y2 - y), selector: cssPath(e) };
    if (full.length > 80) r.text = full.slice(0, 400); // all of a long one (an inbox row), for Watch
    if (e.href && /^https?:/.test(e.href)) r.href = String(e.href).slice(0, 500);
    out.push(r);
  }
  const sc = scroller(), max = sc ? Math.round(sc.scrollHeight - sc.clientHeight) : 0;
  const scroll = max > 0 ? { y: Math.round(sc.scrollTop), max, ...(sc === (document.scrollingElement || document.documentElement) ? {} : { selector: cssPath(sc) }) } : null;
  return { url: location.href, title: document.title, items: out, ...(scroll ? { scroll } : {}) };
})()`;

// What's on the page now: { url, title, items }.
async function collect(page) {
  const { result, exceptionDetails } = await page.send("Runtime.evaluate", { expression: COLLECT, returnByValue: true });
  if (exceptionDetails) throw new Error("Couldn't read the page: " + ((exceptionDetails.exception && exceptionDetails.exception.description) || exceptionDetails.text));
  return (result && result.value) || { url: "", title: "", items: [] };
}
// A sign-in page instead of the site.
function signInPage(url) {
  const host = hostOf(url);
  return /(^|\.)(accounts\.google|login\.(microsoftonline|live)|signin\.aws|auth0|okta)\./i.test(host + ".") || /\/(log-?in|sign-?in|auth|sso)\b/i.test(String(url || ""));
}

// The page as it is now, saved as a screen with its regions.
async function snapshot(page, name) {
  const info = await collect(page);
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  const host = hostOf(info.url);
  const s = addPageScreen(String(name || "").trim() || info.title || host || "Page", Buffer.from(data, "base64"), info, info.items);
  if (s.error) return s;
  // a sign-in page instead of the site: say how to get past it once
  return signInPage(info.url) ? { ...s, note: `This looks like a sign-in page (${host}). Click Sign in, sign in once in the window that opens, close it, then map again: the hidden browser keeps that sign-in.` } : s;
}

// Map a site: open it in the hidden browser and save what's on it as a screen.
function mapPage(input, name) {
  const url = siteUrl(input);
  if (!url) return Promise.resolve({ error: "Give a site to map: a name (gmail), a host (github.com/pulls) or a web address." });
  return oneAtATime(() => withPage(async (page) => { await open(page, url); return snapshot(page, name); })).catch((e) => ({ error: String((e && e.message) || e) }));
}

// Read a site as it is now, without saving a screen: { url, title, items, login }.
// For Watch (watch.mjs), which only looks: nothing is pressed or typed. While the
// browser is open for you or an agent (type, then press), it leaves it alone
// ({ busy }) rather than take its page somewhere else; and it doesn't keep the
// browser open after.
function readPage(input) {
  const url = siteUrl(input);
  if (!url) return Promise.resolve({ error: "Give a site to read: a name (gmail), a host or a web address." });
  return oneAtATime(() => browserOpen() ? { busy: true } : withPage(async (page) => {
    await open(page, url);
    const info = await collect(page);
    return { ...info, login: signInPage(info.url) };
  }, false)).catch((e) => ({ error: String((e && e.message) || e) }));
}

// Trusted sites (Settings → Screens): on a page from one of these, press and type
// go ahead without asking, for you and for agents. Anywhere else each one asks.
// A host covers its subdomains (google.com covers mail.google.com). Only the app's
// Settings adds to the list: there's no command for it, for an agent to call.
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } }
function trustedSites() { const a = loadConfig().trustedSites; return Array.isArray(a) ? a.filter((x) => typeof x === "string" && x) : []; }
function isTrusted(url, sites = trustedSites()) { const h = hostOf(url); return !!h && sites.some((t) => h === t || h.endsWith("." + t)); }
function trustSite(input) {
  const host = hostOf(siteUrl(input));
  if (!host) return { error: "Give a site to trust: a host (mail.google.com) or a web address." };
  const cfg = loadConfig(); cfg.trustedSites = [...new Set([...trustedSites(), host])].sort();
  return saveConfig(cfg) ? { ok: true, host, sites: cfg.trustedSites } : { error: "Couldn't write the config file." };
}
function untrustSite(host) {
  const cfg = loadConfig(); cfg.trustedSites = trustedSites().filter((x) => x !== String(host || "").toLowerCase());
  if (!cfg.trustedSites.length) delete cfg.trustedSites;
  return saveConfig(cfg) ? { ok: true, sites: cfg.trustedSites || [] } : { error: "Couldn't write the config file." };
}

// Runs in the page: scroll it `to` "down" or "up" (most of a window, so a line
// or two stays in view), "top", "bottom", or a y from an earlier map. `where` is
// what scrolled then: a selector, "" for the page itself, null to find it now.
// Gives { from, y, max }, or null when nothing scrolls.
const scrollJs = (to, where = null) => `(() => { ${SCROLLER}
  const sel = ${JSON.stringify(where)}, to = ${JSON.stringify(to)};
  let e = null; try { e = sel === null ? null : sel ? document.querySelector(sel) : document.scrollingElement || document.documentElement; } catch (x) {}
  e = e || scroller(); if (!e) return null;
  const from = e.scrollTop, step = Math.round(Math.min(e.clientHeight, innerHeight) * 0.85);
  e.scrollTo({ top: to === 'down' ? from + step : to === 'up' ? from - step : to === 'top' ? 0 : to === 'bottom' ? e.scrollHeight : +to || 0, behavior: 'instant' });
  return { from: Math.round(from), y: Math.round(e.scrollTop), max: Math.round(e.scrollHeight - e.clientHeight) };
})()`;

// Make the page show what screen s does: it still does if the open browser last
// mapped it (with what was typed there); else open its address again and scroll
// to where it was. True if it was still there.
async function showScreen(page, b, s) {
  const here = b.shown === s.id && (await page.send("Runtime.evaluate", { expression: "location.href", returnByValue: true })).result?.value === s.page.url;
  if (!here) {
    await open(page, s.page.url);
    const sc = s.page.scroll;
    if (sc && sc.y) { await page.send("Runtime.evaluate", { expression: scrollJs(sc.y, sc.selector || ""), returnByValue: true }); await page.idle(); }
  }
  return here;
}

// Scroll a mapped page and map what's in the window then, as a new screen: a site
// is taller than its window, and a map only has what the window shows. Only looks,
// so it never asks first. At the end already, it says so and maps nothing.
const SCROLLS = ["down", "up", "top", "bottom"];
function scrollPage(id, to = "down") {
  to = String(to || "down").toLowerCase();
  if (!SCROLLS.includes(to)) return Promise.resolve({ error: `Scroll ${SCROLLS.join(", ")}: not "${to}".` });
  const s = loadScreens().find((x) => x.id === id); if (!s) return Promise.resolve({ error: "not found" });
  if (!s.page || !s.page.url) return Promise.resolve({ error: "Scroll works on a mapped page." });
  return oneAtATime(() => withPage(async (page, b) => {
    const here = await showScreen(page, b, s), sc = s.page.scroll;
    const { result } = await page.send("Runtime.evaluate", { expression: scrollJs(to, sc ? sc.selector || "" : null), returnByValue: true });
    const m = result && result.value;
    b.shown = s.id;
    if (!m) return { error: "Nothing scrolls on this page: it all fits in the window.", stay: true };
    if (m.y === m.from) return { error: `That's the ${/^(up|top)$/.test(to) ? "top" : "bottom"} of the page already.`, stay: true };
    await page.idle(); // a page that loads more as you scroll
    // named for how far down it is: "Inbox ↓ 40%"
    const pct = m.max > 0 ? Math.round(m.y / m.max * 100) : 0;
    const next = await snapshot(page, s.name.replace(/ ↓ \d+%$/, "") + (pct ? ` ↓ ${pct}%` : ""));
    return next.error ? next : { ...next, scrolled: to, kept: here };
  })).catch((e) => ({ error: String((e && e.message) || e) }));
}

// Act on a mapped region: find it (by its selector, else at the same spot) and give
// act(page, at, region) where it is now; then map where that leads, as a new screen.
// On the screen the open browser last mapped, that's the page as it is now (what
// was typed is still there); on any other, its page is opened from its address
// again. It acts on the real site, signed in as you, so it needs the caller's
// confirmation unless the page's site is trusted.
function actOnRegion(id, regionId, verb, confirmed, check, act) {
  const s = loadScreens().find((x) => x.id === id); if (!s) return Promise.resolve({ error: "not found" });
  if (!s.page || !s.page.url) return Promise.resolve({ error: `${verb} works on a mapped page. Use Click here for a screenshot of your screen.` });
  const r = (s.regions || []).find((x) => x.id === regionId); if (!r) return Promise.resolve({ error: "That region is gone. Reload the screen." });
  const bad = check(r); if (bad) return Promise.resolve({ error: bad });
  const host = hostOf(s.page.url);
  if (!confirmed && !isTrusted(s.page.url)) return Promise.resolve({ error: `${verb === "Type" ? "Typing into" : "Pressing"} "${r.label}" acts on the real site, signed in as you, and ${host} isn't one of your trusted sites.`, confirm: true, host });
  return oneAtATime(() => withPage(async (page, b) => {
    const here = await showScreen(page, b, s);
    // A new tab would leave this one where it was, so a link opens here instead.
    const find = `(() => { let e = null; try { e = ${JSON.stringify(r.selector || "")} && document.querySelector(${JSON.stringify(r.selector || "")}); } catch (x) {}
      if (!e) return null; const a = e.closest('a[target]'); if (a) a.removeAttribute('target');
      e.scrollIntoView({ block: 'center', inline: 'center' }); const b = e.getBoundingClientRect();
      return b.width && b.height ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`;
    const { result } = await page.send("Runtime.evaluate", { expression: find, returnByValue: true });
    const at = (result && result.value) || center(r), found = !!(result && result.value);
    const navigating = page.until("Page.frameStartedLoading", 1500);
    const extra = await act(page, at, r);
    if (await navigating) await page.until("Page.loadEventFired", 30000);
    await page.idle();
    const next = await snapshot(page, ""); // named after the page it landed on
    return next.error ? next : { ...next, ...extra, found, kept: here };
  })).catch((e) => ({ error: String((e && e.message) || e) }));
}
const clickAt = async (page, at) => { for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: type === "mouseMoved" ? 0 : 1 }); };

// Press: click it as a mouse would. noSend (a draft reply's run: watch.mjs) refuses
// a button or menu item that sends ("Send", "Schedule send"), even confirmed: a
// row whose subject says "send" is still pressed.
const isSend = (r) => /^(button|menu item)$/.test(r.kind || "button") && /\bsend\b/i.test(r.label || "");
function pressRegion(id, regionId, { confirmed = false, noSend = false } = {}) {
  return actOnRegion(id, regionId, "Press", confirmed, (r) => (noSend && isSend(r) ? `"${r.label}" sends. This run only drafts: it never presses Send. The draft stays in Drafts for you to send.` : ""),
    async (page, at, r) => { await clickAt(page, at); return { pressed: r.label }; });
}

// Type: click into a field, replace what's in it with text, and press Enter if
// asked (which is how a search or a one-line form is sent). Without Enter, press
// the form's button next, on the screen this maps, while the browser is still
// open (the app's): what's typed is still there. Otherwise it's gone by then.
const MAX_TEXT = 2000;
function typeRegion(id, regionId, text, { enter = false, confirmed = false } = {}) {
  text = String(text == null ? "" : text);
  return actOnRegion(id, regionId, "Type", confirmed, (r) => {
    if (r.kind !== "field") return `"${r.label}" isn't a field (it's a ${r.kind || "region"}). Type works on a field; use Press for the rest.`;
    if (!text && !enter) return "Give the text to type.";
    if (text.length > MAX_TEXT) return `That's more than ${MAX_TEXT} characters.`;
    return "";
  }, async (page, at, r) => {
    await clickAt(page, at);
    await page.send("Runtime.evaluate", { expression: `(() => { const e = document.activeElement; if (!e) return;
      if (typeof e.select === 'function') e.select(); else if (e.isContentEditable) getSelection().selectAllChildren(e); })()` });
    if (text) await page.send("Input.insertText", { text });
    if (enter) for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}) });
    return { typed: r.label, entered: !!enter };
  });
}

// Open the site in Symbiot's browser profile as a normal window, to sign in (or
// accept cookies) once. Close it before mapping: the profile is shared. The hidden
// browser is closed first, or the window would open in it, out of sight.
async function signIn(input) {
  const url = siteUrl(input), chrome = chromeBinary();
  if (!url) return { error: "Give the site to sign in to: a name (gmail), a host or a web address." };
  if (!chrome) return { error: "Signing in needs Chrome, Chromium, Edge or Brave, and none was found." };
  await oneAtATime(closeBrowser);
  try { mkdirSync(PROFILE, { recursive: true, mode: 0o700 }); spawn(chrome, browserArgs(false, url), { detached: true, stdio: "ignore" }).unref(); }
  catch (e) { return { error: String((e && e.message) || e) }; }
  return { ok: true, url };
}

export { siteUrl, browserArgs, mapPage, readPage, isSend, pressRegion, typeRegion, scrollPage, SCROLLS, signIn, keepBrowserOpen, closeBrowser, browserOpen, trustedSites, isTrusted, trustSite, untrustSite, PROFILE };
