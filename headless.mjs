// symbiot — Screens, headless: open a web page in a browser nobody sees, take its
// screenshot and map every button, link and field on it by itself, as a screen
// whose regions are already named (screens.mjs). Nothing to bring to the front,
// nothing to drag. Each region keeps how to find it again (a CSS selector), so it
// can be pressed (or a field typed into) in that same hidden browser, which maps
// the page it lands on: map → press → map is how an agent finds its way around a
// site. On a site you trust (Settings), that goes ahead without asking. In the
// app the browser stays open for a few minutes after each action, so the next
// one carries on from the page as it is (type into a field, then press Send).
// A map has what fits in the window: Scroll down maps the next part, and Whole
// page maps all of it in one tall screenshot: the page, or, where a list scrolls
// inside it (Gmail's mail), that list opened out to its full length.
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
import { loadScreens, addPageScreen, center, stitchPng, stitchListPng } from "./screens.mjs";

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
  return { send, until, on: (f) => { listeners.add(f); return () => listeners.delete(f); }, closed: () => closed };
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
      // every `method` event on this tab, until the function it gives is called
      const on = (method, f) => c.on((m) => { if (m && m.sessionId === sessionId && m.method === method) f(m.params || {}); });
      b.page = { send, until, idle, on };
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
// whole: called again a window further down each time (snapshotWhole), it adds
// what's new on screen to what it found before (kept in the page) and gives all
// of it, each where it is on the page, not the window.
// list: { selector, part, more } for a list that scrolls inside the page
// (snapshotList). part "list": what's in the list, called again as it scrolls
// and kept like whole's, each where it is with the list opened out (its y plus
// how far the list is scrolled), cut to the list's box. part "rest": the rest of
// the window, what's below the list moved down by `more`.
const collectJs = (whole, list = null) => `(() => { ${SCROLLER}
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[contenteditable=""],[contenteditable=true],[onclick],' +
    ['button','link','tab','menuitem','menuitemcheckbox','menuitemradio','option','checkbox','radio','switch','combobox','textbox','searchbox','row','treeitem'].map((r) => '[role=' + r + ']').join(',');
  const W = innerWidth, H = innerHeight, X = ${whole ? "scrollX" : "0"}, Y = ${whole ? "scrollY" : "0"};
  const IN = ${JSON.stringify(list)}, LIST = IN ? document.querySelector(IN.selector) : null;
  const LB = LIST && (() => { const b = LIST.getBoundingClientRect(); return { left: Math.max(0, b.left), top: Math.max(0, b.top), right: Math.min(W, b.right), bottom: Math.min(H, b.bottom) }; })();
  if (IN && !LIST) return { url: location.href, title: document.title, items: [] };
  const kept = ${whole || (list && list.part === "list") ? "(window.__symbiotWhole = window.__symbiotWhole || { out: [], kinds: new Map(), at: new Set() })" : "{ out: [], kinds: new Map(), at: new Set() }"}, out = kept.out, kinds = kept.kinds;
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
  const stuck = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) if (/^(fixed|sticky)$/.test(getComputedStyle(n).position)) return true; return false; };
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
    const inList = !!LIST && LIST.contains(e);
    if (IN && inList !== (IN.part === 'list')) continue;
    // in an opened-out list, a row already marked is known by where it is, not by its
    // element: a list that reuses its rows as it scrolls shows other mail in the same one
    if ((!inList && kinds.has(e)) || e.disabled || e.closest('[aria-hidden=true],[inert]')) continue;
    const kind = kindOf(e), up = e.parentElement && e.parentElement.closest(SEL);
    if (up && kinds.get(up) === kind && kind !== 'field') continue;
    const b = e.getBoundingClientRect(), CL = inList ? LB : { left: 0, top: 0, right: W, bottom: H };
    // cut off at the list's bottom: the next part shows all of it (it overlaps), unless this is the
    // last; cut off at its top, the part before showed all of it
    if (inList && b.height <= LB.bottom - LB.top && ((!IN.last && b.bottom > LB.bottom + 1) || (LIST.scrollTop > 0 && b.top < LB.top - 1))) continue;
    const x = Math.max(CL.left, b.left), y = Math.max(CL.top, b.top), x2 = Math.min(CL.right, b.right), y2 = Math.min(CL.bottom, b.bottom);
    if (x2 - x < 4 || y2 - y < 4) continue;
    const st = getComputedStyle(e);
    if (st.visibility === 'hidden' || st.pointerEvents === 'none' || +st.opacity === 0) continue;
    // on top: what's at its centre is it, or inside it (not a banner over it)
    const top = document.elementFromPoint((x + x2) / 2, (y + y2) / 2);
    if (!top || !(top === e || e.contains(top) || top.contains(e))) continue;
    ${whole ? "if (y >= H - 200 && stuck(e)) continue; // stuck to the window's bottom: left out of the whole page's picture" : ""}
    const full = labelOf(e), at = inList ? Math.round(b.top + LIST.scrollTop) + '|' + kind + '|' + full : '';
    if (at && kept.at.has(at)) { kinds.set(e, kind); continue; }
    // an element marked before, showing something else now: its selector would find it, not this
    const reused = inList && kinds.has(e);
    kinds.set(e, kind); if (at) kept.at.add(at);
    const down = !IN ? 0 : inList ? LIST.scrollTop : y >= LB.bottom ? IN.more || 0 : 0;
    const box = ${whole ? "{ x: Math.max(0, b.left + X), y: Math.max(0, b.top + Y), w: b.width, h: b.height }" : "{ x, y: y + down, w: x2 - x, h: y2 - y }"};
    const r = { label: full.slice(0, 80) || kind, kind, x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h), selector: reused ? '' : cssPath(e) };
    if (full.length > 80) r.text = full.slice(0, 400); // all of a long one (an inbox row), for Watch
    // a chat list's row (WhatsApp's), for Watch: what only its icons say, not its text. Its
    // unread badge ("2 unread messages"), and the ticks on a last message you sent
    if (kind === 'row' || kind === 'menu item') {
      const un = [...e.querySelectorAll('[aria-label]')].map((x) => clean(x.getAttribute('aria-label'))).find((s) => /\\bunread\\b/i.test(s));
      if (un) r.unread = +(un.match(/(\\d+)\\s+unread/i) || [0, 1])[1] || 1;
      if (e.querySelector('[data-icon^="msg-check"],[data-icon^="msg-dblcheck"],[data-icon^="msg-time"],[data-icon^="status-check"],[data-icon^="status-dblcheck"]') ||
        [...e.querySelectorAll('[aria-label]')].some((x) => /^(read|delivered|sent|pending)$/i.test(clean(x.getAttribute('aria-label'))))) r.mine = true;
    }
    if (e.href && /^https?:/.test(e.href)) r.href = String(e.href).slice(0, 500);
    out.push(r);
  }
  const sc = scroller(), max = sc ? Math.round(sc.scrollHeight - sc.clientHeight) : 0;
  const scroll = max > 0 ? { y: Math.round(sc.scrollTop), max, ...(sc === (document.scrollingElement || document.documentElement) ? {} : { selector: cssPath(sc) }) } : null;
  return { url: location.href, title: document.title, items: out, ...(scroll ? { scroll } : {}) };
})()`;
const COLLECT = collectJs(false), COLLECT_WHOLE = collectJs(true);

// What's on the page now: { url, title, items }.
async function collect(page, expression = COLLECT) {
  const { result, exceptionDetails } = await page.send("Runtime.evaluate", { expression, returnByValue: true });
  if (exceptionDetails) throw new Error("Couldn't read the page: " + ((exceptionDetails.exception && exceptionDetails.exception.description) || exceptionDetails.text));
  return (result && result.value) || { url: "", title: "", items: [] };
}
// A sign-in page instead of the site.
function signInPage(url) {
  const host = hostOf(url);
  return /(^|\.)(accounts\.google|login\.(microsoftonline|live)|signin\.aws|auth0|okta)\./i.test(host + ".") || /\/(log-?in|sign-?in|auth|sso)\b/i.test(String(url || ""));
}

// A screenshot and what's on it, saved as a screen named `name`, else for the page.
function saveScreen(name, data, info, suffix = "") {
  const host = hostOf(info.url), base = String(name || "").trim() || info.title || host || "Page";
  const s = addPageScreen(suffix ? base.slice(0, 80 - suffix.length) + suffix : base, Buffer.isBuffer(data) ? data : Buffer.from(data, "base64"), info, info.items);
  if (s.error) return s;
  // a sign-in page instead of the site: say how to get past it once
  return signInPage(info.url) ? { ...s, note: `This looks like a sign-in page (${host}). Click Sign in, sign in once in the window that opens, close it, then map again: the hidden browser keeps that sign-in.` } : s;
}
// The page as it is now, saved as a screen with its regions.
async function snapshot(page, name) {
  const info = await collect(page);
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  return saveScreen(name, data, info);
}

// The whole page at once, in one screenshot as tall as the page (up to MAX_TALL),
// with every button, link and field on it as a region, where it is on the page.
// The window stays the laptop size (so a part as tall as the window stays that
// tall): it scrolls down a window at a time, finds what's on each part and takes
// its screenshot, and the screenshots are put together (screens.mjs stitchPng).
// What's fixed or sticky (a menu bar, a cookie banner) is hidden once it's in one,
// so it shows once, where it was, not on every part. The parts overlap by
// OVERLAP pixels, and the later one's are kept, so what stuck to the bottom of the
// window is left out (and not marked: collectJs). Where a list scrolls inside the
// page instead (Gmail's), scrolling the page wouldn't show more: snapshotList
// opens that list out (or gives { error, inside } when it can't find it).
const MAX_TALL = 16000, OVERLAP = 200; // pixels
const PAGE_HEIGHT = `(() => { ${SCROLLER}
  const d = document.scrollingElement || document.documentElement, sc = scroller();
  return { h: Math.max(d.scrollHeight, document.body ? document.body.scrollHeight : 0), inside: !!sc && sc !== d };
})()`;
const HIDE_STUCK = `(() => { const H = innerHeight;
  if (!document.getElementById('symbiot-hide')) { const st = document.createElement('style'); st.id = 'symbiot-hide'; st.textContent = '[data-symbiot-hide]{visibility:hidden!important}'; document.documentElement.appendChild(st); }
  for (const e of document.querySelectorAll('body *')) {
    const p = getComputedStyle(e).position; if (p !== 'fixed' && p !== 'sticky') continue;
    const b = e.getBoundingClientRect(); if (b.bottom > 0 && b.top < H) e.setAttribute('data-symbiot-hide', '');
  }
})()`;
const UNHIDE = `document.querySelectorAll('[data-symbiot-hide]').forEach((e) => e.removeAttribute('data-symbiot-hide')); const st = document.getElementById('symbiot-hide'); if (st) st.remove(); window.__symbiotWhole = null; scrollTo({ top: 0, behavior: 'instant' });`;
async function evaluate(page, expression) {
  const { result, exceptionDetails } = await page.send("Runtime.evaluate", { expression, returnByValue: true });
  if (exceptionDetails) throw new Error("Couldn't read the page: " + ((exceptionDetails.exception && exceptionDetails.exception.description) || exceptionDetails.text));
  return result && result.value;
}
async function snapshotWhole(page, name) {
  const first = await evaluate(page, PAGE_HEIGHT);
  if (first.inside) return snapshotList(page, name);
  if (first.h <= VIEW.h + 1) { const s = await snapshot(page, name); return s.error || s.note ? s : { ...s, note: "It all fits in the window, so this map is the whole page." }; }
  // a window at a time, overlapping a little; the page can load more as it goes (up to MAX_TALL)
  let info = null, h = first.h, end = 0; const shots = [];
  await evaluate(page, "window.__symbiotWhole = null");
  try {
    for (let y = 0, i = 0; i < 60; i++) {
      await evaluate(page, `scrollTo({ top: ${y}, behavior: 'instant' })`); await sleep(150);
      const at = Number(await evaluate(page, "scrollY")) || 0;
      if (!info || info.items.length < 200) info = await collect(page, COLLECT_WHOLE);
      const { data } = await page.send("Page.captureScreenshot", { format: "png" });
      shots.push({ png: Buffer.from(data, "base64"), y: at }); end = at + VIEW.h;
      await evaluate(page, HIDE_STUCK);
      h = (await evaluate(page, PAGE_HEIGHT)).h;
      if (end >= Math.min(MAX_TALL, h) || at < y) break; // the bottom (or it wouldn't scroll further)
      y = Math.min(at + VIEW.h - OVERLAP, Math.min(MAX_TALL, h) - VIEW.h);
    }
  } finally { await evaluate(page, UNHIDE).catch(() => {}); }
  const tall = Math.min(MAX_TALL, end), png = stitchPng(shots, tall);
  if (!png) return { error: "Couldn't put the page's screenshots together." };
  const items = info.items.filter((r) => r.y < tall);
  const s = saveScreen(name, png, { url: info.url, title: info.title, full: true, items }, " (whole page)");
  if (s.error || s.note) return s;
  const note = [h > tall + 1 && `The page goes on past ${tall} pixels, so this map stops there.`, items.length >= 200 && "It marks the first 200 buttons, links and fields, from the top."].filter(Boolean).join(" ");
  return note ? { ...s, note } : s;
}
// The whole of a page whose list scrolls inside it (Gmail's mail), in one tall
// screenshot: the list opened out to its full length (up to MAX_TALL), the rest
// of the window as it is, and what's below the list moved down. The list is
// scrolled a box at a time, overlapping a little, and each part put in its place
// (screens.mjs stitchListPng). Every row in it is a region, where it is in the
// tall picture; what's around the list (Compose, the folders) is marked first.
// The page itself doesn't move, so the window is as it was after.
async function snapshotList(page, name) {
  const top = await collect(page), sel = top.scroll && top.scroll.selector;
  const box = sel && await evaluate(page, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
    const b = e.getBoundingClientRect(), x = Math.max(0, Math.round(b.left)), y = Math.max(0, Math.round(b.top));
    return { x, y, w: Math.min(innerWidth, Math.round(b.right)) - x, h: Math.min(innerHeight, Math.round(b.bottom)) - y }; })()`);
  if (!box || box.w < 8 || box.h < 40) return { error: "Couldn't find the list that scrolls on this page. Use Scroll down to map the next part of it.", inside: true };
  const room = MAX_TALL - VIEW.h, step = Math.max(20, box.h - Math.min(OVERLAP, Math.floor(box.h / 4)));
  let list = null, rest = null, at = -1, max = 0; const shots = [];
  await evaluate(page, "window.__symbiotWhole = null");
  try {
    for (let y = 0, i = 0; i < 100; i++) {
      const m = await evaluate(page, scrollJs(y, sel)); if (!m || m.y <= at) break; // it wouldn't scroll further
      await sleep(150);
      at = m.y; max = m.max;
      const last = at >= Math.min(max, room);
      if (!list || list.items.length < 200) list = await collect(page, collectJs(false, { selector: sel, part: "list", last }));
      const { data } = await page.send("Page.captureScreenshot", { format: "png" });
      shots.push({ png: Buffer.from(data, "base64"), y: at });
      if (last) break;
      y = Math.min(at + step, Math.min(max, room));
    }
    rest = await collect(page, collectJs(false, { selector: sel, part: "rest", more: at }));
  } finally { await evaluate(page, `window.__symbiotWhole = null; ${scrollJs(0, sel)}`).catch(() => {}); }
  const png = shots.length && stitchListPng(shots, box, at);
  if (!png) return { error: "Couldn't put the list's screenshots together." };
  const tall = VIEW.h + at, items = [...rest.items, ...list.items].filter((r) => r.y < tall).slice(0, 200);
  const s = saveScreen(name, png, { url: top.url, title: top.title, full: true, list: sel, items }, " (whole page)");
  if (s.error || s.note) return s;
  const note = [max > at + 1 && `The list goes on past ${tall} pixels, so this map stops there.`, items.length >= 200 && "It marks the first 200 buttons, links and fields: what's around the list, then the list from the top."].filter(Boolean).join(" ");
  return note ? { ...s, note } : s;
}

// Map a site: open it in the hidden browser and save what's on it as a screen.
// whole: all of the page in one tall screen (snapshotWhole); a page whose list
// scrolls inside it gets the usual map, with a note that says why.
function mapPage(input, name, { whole = false } = {}) {
  const url = siteUrl(input);
  if (!url) return Promise.resolve({ error: "Give a site to map: a name (gmail), a host (github.com/pulls) or a web address." });
  return oneAtATime(() => withPage(async (page) => {
    await open(page, url);
    if (!whole) return snapshot(page, name);
    const s = await snapshotWhole(page, name);
    if (!s.inside) return s;
    const one = await snapshot(page, name);
    return one.error || one.note ? one : { ...one, note: s.error };
  })).catch((e) => ({ error: String((e && e.message) || e) }));
}

// The whole of a page you've mapped, as one tall screen (snapshotWhole). Only
// looks, so it never asks first.
function wholePage(id) {
  const s = loadScreens().find((x) => x.id === id); if (!s) return Promise.resolve({ error: "not found" });
  if (!s.page || !s.page.url) return Promise.resolve({ error: "Whole page works on a mapped page." });
  return oneAtATime(() => withPage(async (page, b) => {
    const here = await showScreen(page, b, s);
    const next = await snapshotWhole(page, s.name.replace(/ ↓ \d+%$/, "").replace(/ \(whole page\)$/, ""));
    if (next.error) { delete next.inside; return next; }
    return { ...next, kept: here };
  })).catch((e) => ({ error: String((e && e.message) || e) }));
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
// The words on a page, not its buttons: the text of each element `selector`
// matches (a feed's posts), scrolling `scrolls` windows down for more. For
// `symbiot post voice` (post.mjs), which reads your own recent posts, only on
// your click. Only looks, like readPage: { url, title, texts, login }.
function readTexts(input, selector, { scrolls = 3 } = {}) {
  const url = siteUrl(input);
  if (!url) return Promise.resolve({ error: "Give a site to read: a name (gmail), a host or a web address." });
  const js = `(() => [...document.querySelectorAll(${JSON.stringify(String(selector || "body"))})].map((e) => String(e.innerText || '').trim()).filter(Boolean))()`;
  return oneAtATime(() => browserOpen() ? { busy: true } : withPage(async (page) => {
    await open(page, url);
    const texts = [];
    for (let i = 0; i <= scrolls; i++) {
      for (const t of (await evaluate(page, js)) || []) if (!texts.includes(t)) texts.push(t);
      if (i < scrolls) { await evaluate(page, "scrollBy(0, innerHeight)"); await page.idle(); }
    }
    const at = String((await evaluate(page, "location.href")) || url);
    return { url: at, title: String((await evaluate(page, "document.title")) || ""), texts: texts.slice(0, 50), login: signInPage(at) };
  }, false)).catch((e) => ({ error: String((e && e.message) || e) }));
}

// A picture, or a short clip, of a page, for a post (post.mjs): only on your
// click, and it only looks, like readPage. The picture is the window at twice its
// pixels, so it stays sharp in a feed: { png, url, title }. The clip records the
// window for `seconds` (the DevTools screencast: a frame each time the page
// changes, with its time), scrolling slowly down a page longer than the window,
// so even a still page moves: { frames: [{ ts, jpeg }], end, url, title }, the
// times in seconds. post.mjs makes it a video.
const CLIP = { min: 3, max: 30, speed: 450 }; // seconds; pixels a second, scrolling
const SCROLL_THROUGH = (ms) => `(() => { ${SCROLLER}
  const sc = scroller(); if (!sc) return 0;
  const hold = 800, run = Math.max(500, ${ms} - 2 * hold), dist = Math.min(sc.scrollHeight - sc.clientHeight, run / 1000 * ${CLIP.speed}), t0 = performance.now();
  const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  (function step(now) { const k = Math.min(1, Math.max(0, (now - t0 - hold) / run)); sc.scrollTop = Math.round(dist * ease(k)); if (k < 1) requestAnimationFrame(step); })(t0);
  return Math.round(dist);
})()`;
function pagePicture(input) {
  const url = siteUrl(input);
  if (!url) return Promise.resolve({ error: "Give a page: a web address (localhost:3000 works), a host (github.com/you) or a site's name." });
  return oneAtATime(() => withPage(async (page) => {
    await page.send("Emulation.setDeviceMetricsOverride", { width: VIEW.w, height: VIEW.h, deviceScaleFactor: 2, mobile: false });
    try {
      await open(page, url);
      const { data } = await page.send("Page.captureScreenshot", { format: "png" });
      return { png: Buffer.from(data, "base64"), url: String((await evaluate(page, "location.href")) || url), title: String((await evaluate(page, "document.title")) || "") };
    } finally { await page.send("Emulation.setDeviceMetricsOverride", { width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1, mobile: false }).catch(() => {}); }
  })).catch((e) => ({ error: String((e && e.message) || e) }));
}
function pageClip(input, seconds = 8) {
  const url = siteUrl(input);
  if (!url) return Promise.resolve({ error: "Give a page: a web address (localhost:3000 works), a host (github.com/you) or a site's name." });
  const ms = Math.round(Math.min(CLIP.max, Math.max(CLIP.min, Number(seconds) || 8)) * 1000);
  return oneAtATime(() => withPage(async (page) => {
    await open(page, url);
    const frames = [];
    const off = page.on("Page.screencastFrame", (p) => {
      frames.push({ ts: (p.metadata && p.metadata.timestamp) || Date.now() / 1000, jpeg: Buffer.from(p.data, "base64") });
      page.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {});
    });
    try {
      await page.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: VIEW.w, maxHeight: VIEW.h, everyNthFrame: 1 });
      await evaluate(page, SCROLL_THROUGH(ms));
      await sleep(ms);
      await page.send("Page.stopScreencast").catch(() => {});
    } finally { off(); }
    const end = frames.length ? Math.max(frames[frames.length - 1].ts, frames[0].ts + ms / 1000) : 0;
    if (!frames.length) return { error: "The page showed nothing to record." };
    return { frames, end, url: String((await evaluate(page, "location.href")) || url), title: String((await evaluate(page, "document.title")) || "") };
  })).catch((e) => ({ error: String((e && e.message) || e) }));
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
    const found = !!(result && result.value);
    // not found by its selector: the same spot. On a whole-page screen that spot is
    // on the page, not the window: scroll it into the window first (the list, on
    // one whose list was opened out, if the spot is in it).
    let at = found ? result.value : center(r);
    if (!found && s.page.full) {
      const y = await evaluate(page, s.page.list ? `(() => { const e = document.querySelector(${JSON.stringify(s.page.list)}); if (!e) return 0;
        const b = e.getBoundingClientRect(); if (${at.y} < b.top) return 0; e.scrollTop = ${at.y} - b.top - e.clientHeight / 2; return e.scrollTop; })()` : `(scrollTo(0, ${at.y} - innerHeight / 2), scrollY)`);
      at = { x: at.x, y: at.y - (Number(y) || 0) };
    }
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
// row whose subject says "send" is still pressed. Off your mail (`host`), on a
// social site, it refuses what posts too: LinkedIn's Post, Comment and Reply
// (which both opens a reply box and submits one: the label can't tell them apart),
// Submit, Publish, Share, Repost. In your mail, Reply only opens a reply.
const MAIL_HOSTS = /^(mail\.google\.com|outlook\.(live|office|office365)\.com)$/;
const POSTS = /\b(post|reply|comment|submit|publish|share|repost|tweet)\b/i;
const isSend = (r, host = "") => /^(button|menu item)$/.test(r.kind || "button") && (/\bsend\b/i.test(r.label || "") || (!MAIL_HOSTS.test(host) && POSTS.test(r.label || "")));
function pressRegion(id, regionId, { confirmed = false, noSend = false } = {}) {
  const s = noSend ? loadScreens().find((x) => x.id === id) : null, host = s && s.page ? hostOf(s.page.url) : "";
  return actOnRegion(id, regionId, "Press", confirmed, (r) => (noSend && isSend(r, host) ? `"${r.label}" sends or posts. This run only drafts: it never presses Send, Post, Comment or Reply. The draft stays for the user to send or post.` : ""),
    async (page, at, r) => { await clickAt(page, at); return { pressed: r.label }; });
}

// Type: click into a field, replace what's in it with text, and press Enter if
// asked (which is how a search or a one-line form is sent). Without Enter, press
// the form's button next, on the screen this maps, while the browser is still
// open (the app's): what's typed is still there. Otherwise it's gone by then.
// noSend (a draft reply's run) refuses Enter, which sends in a chat, and in a
// WhatsApp chat types line breaks as spaces, in case a new line sends there too.
const MAX_TEXT = 2000;
const CHAT_HOSTS = new Set(["web.whatsapp.com"]);
function typeRegion(id, regionId, text, { enter = false, confirmed = false, noSend = false } = {}) {
  text = String(text == null ? "" : text);
  if (noSend) { const s = loadScreens().find((x) => x.id === id); if (s && s.page && CHAT_HOSTS.has(hostOf(s.page.url))) text = text.replace(/\s*[\r\n]+\s*/g, " ").trim(); }
  return actOnRegion(id, regionId, "Type", confirmed, (r) => {
    if (noSend && enter) return "Enter sends in a chat, and this run only drafts: type without --enter, and the reply stays unsent for the user to send.";
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

export { siteUrl, browserArgs, mapPage, wholePage, readPage, readTexts, pagePicture, pageClip, CLIP, isSend, pressRegion, typeRegion, scrollPage, SCROLLS, signIn, keepBrowserOpen, closeBrowser, browserOpen, trustedSites, isTrusted, trustSite, untrustSite, PROFILE };
