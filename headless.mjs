// symbiot — Screens, headless: open a web page in a browser nobody sees, take its
// screenshot and map every button, link and field on it by itself, as a screen
// whose regions are already named (screens.mjs). Nothing to bring to the front,
// nothing to drag. Each region keeps how to find it again (a CSS selector), so it
// can be pressed (a field typed into, a file put in a file box) in that same
// hidden browser, which maps the page it lands on: map → press → map is how an
// agent finds its way around a site. On a site you trust (Settings), that goes
// ahead without asking. In the app the browser stays open for a few minutes
// after each action, so the next one carries on from the page as it is (type
// into a field, then press Send).
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
import { spawn, spawnSync } from "node:child_process";
import { join, dirname, resolve as resolvePath } from "node:path";
import { accessSync, constants as FS, mkdirSync, existsSync, statSync, readlinkSync, readFileSync, readdirSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { CONFIG_DIR, chromeBinary, loadConfig, saveConfig } from "./core.mjs";
import { loadScreens, addPageScreen, center, stitchPng, stitchListPng } from "./screens.mjs";

const PROFILE = join(CONFIG_DIR, "browser");
// The profile inside it every Symbiot browser opens, named. Chrome opens the one it last
// used, and a Google sign-in in the window can make a second one ("Sign in to Chrome?"):
// on 2026-10-13 a "Profile 1" signed in as another Gmail took over, and from then on every
// check opened it, where none of the sites signed in to the day before were: ten links
// showed their sign-in page while the sign-ins sat in Default.
const PROFILE_DIR = "Default";
// A sandboxed shell (a lane's run) may see the browser folder read-only: Chrome can't start
// there, and that is not "already open". Say so, with the way out.
function profileReadOnly() {
  try { mkdirSync(PROFILE, { recursive: true }); accessSync(PROFILE, FS.W_OK); return ""; }
  catch (e) {
    if (!/EROFS|EACCES|EPERM/.test(String(e.code))) return "";
    return "Symbiot's browser folder (" + PROFILE + ") is read-only from here, so the browser can't start: this shell is sandboxed. Allow writing to that folder for this shell, or run the symbiot screens command outside the sandbox.";
  }
}
export { PROFILE_DIR };
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
// a sign-in made in the window is readable by the hidden browser. The hidden one
// restores the last session: that's what keeps a site's session-only sign-in (keepSessions).
// ua: the User-Agent the window sends (windowUa), for the hidden one to send from its
// first request; and it doesn't say it's driven (navigator.webdriver), as the window doesn't.
function browserArgs(headless, url = "about:blank", ua = "") {
  const proxy = headless ? sandboxProxy() : null;
  return [
    ...(headless ? ["--headless=new", "--hide-scrollbars", "--mute-audio", "--remote-debugging-pipe", `--window-size=${VIEW.w},${VIEW.h}`, "--restore-last-session",
      "--disable-blink-features=AutomationControlled", ...(ua ? ["--user-agent=" + ua] : []),
      ...(proxy ? ["--proxy-server=" + proxy.server, ...(proxy.bypass ? ["--proxy-bypass-list=" + proxy.bypass] : [])] : [])] : ["--new-window"]),
    "--user-data-dir=" + PROFILE, "--profile-directory=" + PROFILE_DIR, "--no-first-run", "--no-default-browser-check",
    ...(process.platform === "linux" ? ["--password-store=basic"] : process.platform === "darwin" ? ["--use-mock-keychain"] : []),
    url,
  ];
}

// The proxy a lane's sandbox gives its commands (HTTPS_PROXY and friends): Chrome ignores
// those variables and, with no network of its own in there, failed every page with
// net::ERR_INTERNET_DISCONNECTED (whatsapp_module, 2026-10-15). { server, bypass, user,
// pass } for an http(s) proxy, or null (outside a sandbox there is none, and the browser
// goes direct as before). Chrome takes no credentials in --proxy-server, so they're kept
// apart: the tab answers the proxy's sign-in itself (proxyAuth).
function sandboxProxy(env = process.env) {
  const raw = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"].map((k) => env[k]).find((v) => v && /^https?:\/\//i.test(v));
  if (!raw) return null;
  let u; try { u = new URL(raw); } catch { return null; }
  const bypass = String(env.NO_PROXY || env.no_proxy || "").split(",").map((x) => x.trim()).filter(Boolean).join(";");
  return { server: u.protocol + "//" + u.host, bypass, user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) };
}
// Answer the proxy's sign-in on a tab (CDP: Fetch with handleAuthRequests, which needs a
// pattern, so every request pauses and is let straight through).
async function proxyAuth(c, sessionId, send) {
  const p = sandboxProxy(); if (!p || !p.user) return () => {};
  const unhook = c.on((m) => {
    if (!m || m.sessionId !== sessionId) return;
    if (m.method === "Fetch.requestPaused") { send("Fetch.continueRequest", { requestId: m.params.requestId }).catch(() => {}); return; }
    if (m.method !== "Fetch.authRequired") return;
    const proxy = m.params.authChallenge && m.params.authChallenge.source === "Proxy";
    send("Fetch.continueWithAuth", { requestId: m.params.requestId, authChallengeResponse: proxy ? { response: "ProvideCredentials", username: p.user, password: p.pass } : { response: "CancelAuth" } }).catch(() => {});
  });
  await send("Fetch.enable", { handleAuthRequests: true, patterns: [{ urlPattern: "*" }] });
  return unhook;
}

// The User-Agent the Symbiot Browser's window sends: Chrome's reduced one, the same on
// every computer of a platform but for the version. A hidden Chrome says "HeadlessChrome";
// told otherwise per tab (Network.setUserAgentOverride) it stops sending client hints
// (Sec-CH-UA) at all; and the tabs it restores from the last session load before any tab
// is told. So a site that ties a sign-in to the browser it was made in saw another one and
// dropped it: the user signed in to domains.co.za in the window, SMS PIN and all, and the
// next map was signed out (cp.smsportal.com too, 2026-10-12). Given as --user-agent, every
// request carries it, and the client hints stay the window's. "" when the version can't be
// read (each tab is told then, as before).
function reducedUa(version, chrome = "") {
  const major = parseInt(version, 10); if (!(major > 0)) return "";
  const os = process.platform === "darwin" ? "Macintosh; Intel Mac OS X 10_15_7" : process.platform === "win32" ? "Windows NT 10.0; Win64; x64" : "X11; Linux x86_64";
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36` + (/edge/i.test(chrome) ? ` Edg/${major}.0.0.0` : "");
}
let uaSeen = null; // { chrome, ua }: read once per browser, put right by launch once it's updated
function windowUa(chrome) {
  if (uaSeen && uaSeen.chrome === chrome) return uaSeen.ua;
  let v = "";
  try {
    if (process.platform === "win32") v = readdirSync(dirname(chrome)).filter((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d)).sort((a, b) => parseInt(b, 10) - parseInt(a, 10))[0] || "";
    else v = (/(\d+)\.\d+\.\d+/.exec(spawnSync(chrome, ["--version"], { encoding: "utf8", timeout: 5000 }).stdout || "") || [])[1] || "";
  } catch {}
  uaSeen = { chrome, ua: reducedUa(v, chrome) };
  return uaSeen.ua;
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

// A sign-in that lives in a session-only cookie (domains.co.za's PHPSESSID: no "remember
// me") is still on disk when the Sign in window closes, but Chrome drops session cookies
// when it next starts, unless it restores the last session. So the hidden browser starts
// that way (browserArgs), and at once makes each session cookie a cookie that lasts
// SESSION_KEEP; and again before it closes, for one a site set meanwhile. Twice the user
// signed in to domains.co.za, SMS PIN and all, and lost it as the window closed (2026-10-09).
// The ones it made last are kept going: each start and close puts them SESSION_KEEP ahead
// again (KEPT lists them). Once made to last, a cookie wasn't a session one any more, so it
// was never put ahead again, and every such sign-in ended 12 hours after it was made, used
// or not (2026-10-14). The site's own end to a session still holds: it replaces the cookie.
const SESSION_KEEP = 14 * 86400; // seconds
const KEPT = join(PROFILE, "symbiot-kept-cookies.json");
export { KEPT };
const keptKey = (k) => `${k.name}|${k.domain}|${k.path || "/"}`;
async function keepSessions(c, now = Date.now(), file = KEPT) {
  let cookies = []; try { ({ cookies = [] } = await c.send("Storage.getCookies")); } catch { return 0; }
  let kept = {}; try { kept = JSON.parse(readFileSync(file, "utf8")) || {}; } catch {}
  let n = 0; const still = {};
  for (const k of cookies.filter((x) => x.session || kept[keptKey(x)])) {
    const host = String(k.domain || "").replace(/^\./, ""); if (!host) continue;
    const port = k.sourcePort > 0 && k.sourcePort !== 80 && k.sourcePort !== 443 ? ":" + k.sourcePort : "";
    const at = k.domain.startsWith(".") ? { domain: k.domain } : { url: `${k.secure ? "https" : "http"}://${host}${port}${k.path || "/"}` }; // host-only stays host-only
    const p = { name: k.name, value: k.value, path: k.path || "/", secure: !!k.secure, httpOnly: !!k.httpOnly, expires: Math.floor(now / 1000) + SESSION_KEEP, ...at,
      ...(k.sameSite ? { sameSite: k.sameSite } : {}), ...(k.priority ? { priority: k.priority } : {}), ...(k.partitionKey ? { partitionKey: k.partitionKey } : {}) };
    try { await c.send("Storage.setCookies", { cookies: [p] }); n++; still[keptKey(k)] = now; } catch {}
  }
  try { writeFileSync(file, JSON.stringify(still), { mode: 0o600 }); } catch {} // only what's still there: one the site ended drops out
  return n;
}
// A sign-in some sites keep in sessionStorage (a tab's own, not a cookie) comes back with
// the tab it was in when the last session is restored, and the hidden browser works in a
// tab of its own. So each restored tab's sessionStorage is kept, by site, for SESSION_KEEP,
// in the profile (SESSIONS), and filled into the hidden browser's tab when it opens a page
// of that site with none of its own (sessionFill: in a world of its own, so no page sees
// another site's). Its own tab's is kept again before it closes.
const SESSIONS = join(PROFILE, "symbiot-sessions.json"), SS_MAX = 200000; // bytes, all of it
const SS_READ = `location.origin.startsWith("http") ? JSON.stringify({ origin: location.origin, items: Object.fromEntries(Object.entries(sessionStorage)) }) : ""`;
function loadSessions(now = Date.now(), file = SESSIONS) {
  let d = {}; try { d = JSON.parse(readFileSync(file, "utf8")) || {}; } catch {}
  return Object.fromEntries(Object.entries(d).filter(([o, v]) => /^https?:\/\//.test(o) && v && v.items && typeof v.items === "object" && now - Number(v.at) < SESSION_KEEP * 1000));
}
// add: tabs' reads, oldest first. Two tabs of one site are one: a value beats an empty one
// (SMS Portal's login tab has "__auth-token": "", its signed-in one the token), else the later.
// merge: what's kept is one of them too, as one of these may not be the tab that was signed
// in (the tabs the last session left; the window's, which aren't filled from what's kept).
// emptied: the keys a tab was seen to empty or drop (signed out there), so whatever's kept. The
// hidden browser's own tab is filled from what's kept, so its read is taken as it is.
function saveSessions(add, now = Date.now(), file = SESSIONS, { merge = false } = {}) {
  const d = { ...loadSessions(now, file) }, got = {};
  for (const x of add) if (x && x.origin && x.items) {
    const was = got[x.origin] || (merge && d[x.origin] ? d[x.origin].items : {});
    got[x.origin] = { ...was, ...Object.fromEntries(Object.entries(x.items).filter(([k, v]) => v !== "" || !was[k])) };
    for (const k of x.emptied || []) if (k in x.items) got[x.origin][k] = x.items[k]; else delete got[x.origin][k];
  }
  for (const [o, items] of Object.entries(got)) if (Object.keys(items).length && JSON.stringify(items).length <= SS_MAX / 2) d[o] = { at: now, items }; else delete d[o]; // too big to be a sign-in
  // too much in all: the sites kept longest ago go first, not everything
  const order = Object.keys(d).sort((a, b) => d[a].at - d[b].at);
  while (order.length && JSON.stringify(d).length > SS_MAX) delete d[order.shift()];
  try { writeFileSync(file, JSON.stringify(d), { mode: 0o600 }); } catch {}
}
const sessionFill = (d) => `(() => { try { const o = ${JSON.stringify(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.items])))}[location.origin]; if (!o || sessionStorage.length) return; for (const k of Object.keys(o)) sessionStorage.setItem(k, String(o[k])); } catch {} })()`;
// wait: a restored tab may not have its page yet (about:blank a moment longer); our own tab has it
async function readSession(send, wait = false) {
  for (let i = 0; i < (wait ? 10 : 1); i++) {
    try { const r = await send("Runtime.evaluate", { expression: SS_READ, returnByValue: true }); const v = r && r.result && r.result.value; if (v) return JSON.parse(v); } catch {}
    if (wait) await sleep(200);
  }
  return null;
}
// The tabs the last session left (restored with it): their sessionStorage kept, then
// closed, so nothing loads unseen.
async function closeOthers(c, keep) {
  try {
    const { targetInfos = [] } = await c.send("Target.getTargets"), got = [];
    for (const t of targetInfos) {
      if (t.type !== "page" || t.targetId === keep) continue;
      if (/^https?:/.test(t.url || "")) try { const { sessionId } = await c.send("Target.attachToTarget", { targetId: t.targetId, flatten: true }); got.push(await readSession((m, p) => c.send(m, p, sessionId), true)); } catch {}
      try { await c.send("Target.closeTarget", { targetId: t.targetId }); } catch {}
    }
    if (got.some(Boolean)) saveSessions(got.filter(Boolean), Date.now(), SESSIONS, { merge: true });
  } catch {}
}
// The Symbiot Browser's own tabs, read while it's open: a site that keeps its sign-in only in
// sessionStorage lost it with its tab. SMS Portal keeps its __auth-token there, the tab or its
// window was closed before Done, and every check read its login page even right after a good
// sign-in (2026-10-14). So the app opens the window over a pipe of its own (pipeWindow: a pipe,
// not a port, so nothing else on the computer can drive it), reads each tab's every WIN_EVERY,
// keeps the last read of each site in each tab, and saves them (saveSessions) at Done, or when
// it closes by itself. Chrome closes when its pipe does: the app holds updates while the
// window's open, and a one-off `symbiot screens signin` opens it plain, as before.
let WIN = null; // { proc, c, reads: Map("targetId origin" → { origin, items, at, had, emptied }), read, save }
const WIN_EVERY = 2000;
function pipeWindow(proc, { every = WIN_EVERY } = {}) {
  const c = connect(proc), attached = new Map(), reads = new Map(), hub = (() => { try { return new URL(HUB).origin; } catch { return ""; } })();
  let busy = null, dirty = false;
  const read = () => busy || (busy = (async () => {
    try {
      const { targetInfos = [] } = await c.send("Target.getTargets");
      for (const t of targetInfos) {
        if (t.type !== "page" || !/^https?:/.test(t.url || "") || (hub && t.url.startsWith(hub + "/"))) continue; // not its own page (browser.html)
        try {
          if (!attached.has(t.targetId)) attached.set(t.targetId, (await c.send("Target.attachToTarget", { targetId: t.targetId, flatten: true })).sessionId);
          const s = await readSession((m, p) => c.send(m, p, attached.get(t.targetId)));
          if (s && s.origin !== hub) {
            const key = t.targetId + " " + s.origin, had = new Set((reads.get(key) || {}).had || []);
            for (const [k, v] of Object.entries(s.items)) if (v !== "") had.add(k);
            reads.set(key, { ...s, at: Date.now(), had: [...had], emptied: [...had].filter((k) => !s.items[k]) }); dirty = true;
          }
        } catch { attached.delete(t.targetId); }
      }
    } catch {} finally { busy = null; }
  })());
  const save = () => { if (dirty) saveSessions([...reads.values()].sort((a, b) => a.at - b.at), Date.now(), SESSIONS, { merge: true }); dirty = false; };
  const timer = setInterval(read, every); if (timer.unref) timer.unref();
  const w = { proc, c, reads, read, save };
  proc.once("exit", () => { clearInterval(timer); save(); if (WIN === w) WIN = null; });
  for (const s of [proc.stdio[3], proc.stdio[4]]) if (s && s.unref) s.unref();
  return (WIN = w);
}

// Signed in, read from the profile's cookie store: the cookie a site keeps its session in,
// there and not expired. It needs no browser, so it can't be told "the Symbiot Browser is open",
// and it's read from a copy taken with its -wal and -journal, so a cookie the window wrote just
// before Done is in it. X was asked for four times while its auth_token sat there (2026-10-10).
const SESSION_COOKIE = { "x.com": "auth_token", "twitter.com": "auth_token", "instagram.com": "sessionid", "facebook.com": "c_user", "reddit.com": "reddit_session", "linkedin.com": "li_at" };
// The site among hosts with a known session cookie: { host, cookie, found } (found: true,
// false, or null when the store can't be read here), or null if none is known.
function sessionCookie(hosts, profile = PROFILE) {
  const host = [].concat(hosts || []).map((h) => String(h).toLowerCase().replace(/^www\./, "")).map((h) => Object.keys(SESSION_COOKIE).find((k) => h === k || h.endsWith("." + k))).find(Boolean);
  if (!host) return null;
  const cookie = SESSION_COOKIE[host], db = ["Network/Cookies", "Cookies"].map((f) => join(profile, PROFILE_DIR, f)).find((f) => existsSync(f));
  if (!db) return { host, cookie, found: false };
  const dir = mkdtempSync(join(tmpdir(), "symbiot-cookies-"));
  try {
    for (const ext of ["", "-wal", "-journal"]) if (existsSync(db + ext)) copyFileSync(db + ext, join(dir, "Cookies" + ext));
    // Chrome's times are microseconds since 1601; 0 is a cookie for the session
    const sql = `select count(*) from cookies where name='${cookie}' and (host_key='.${host}' or host_key='${host}' or host_key like '%.${host}') and (expires_utc=0 or expires_utc > (strftime('%s','now') + 11644473600) * 1000000);`;
    const n = countRows(join(dir, "Cookies"), sql);
    return { host, cookie, found: n === null ? null : n > 0 };
  } catch { return { host, cookie, found: null }; }
  finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}
// The count a query gives, with whichever SQLite this computer has: Node's own (22.5+), the
// sqlite3 command, or Python's. null if none.
function countRows(file, sql) {
  try { const { DatabaseSync } = process.getBuiltinModule ? process.getBuiltinModule("node:sqlite") || {} : {}; if (DatabaseSync) { const d = new DatabaseSync(file, { readOnly: true }); try { return Number(Object.values(d.prepare(sql).get())[0]) || 0; } finally { d.close(); } } } catch {}
  for (const [cmd, args] of [["sqlite3", [file, sql]], ["python3", ["-c", "import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute(sys.argv[2]).fetchone()[0])", file, sql]], ["python", ["-c", "import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute(sys.argv[2]).fetchone()[0])", file, sql]]]) {
    try { const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 5000 }); if (r.status === 0 && /^\d+\s*$/.test(r.stdout)) return Number(r.stdout); } catch {}
  }
  return null;
}

// The page a site is reached at once signed in, from the profile's history: the latest page
// on one of hosts (a subdomain too: console.twilio.com for twilio.com) that isn't a sign-in,
// sign-out or sign-up page. A subdomain wins over the bare host and www, whose home page
// shows a Login button signed in or not (twilio.com, 2026-10-14). null if there's none, or
// the history can't be read here. Read from a copy taken with its -wal and -journal.
const NOT_HOME = /(^|[/._-])(log-?in|log-?out|sign-?in|sign-?out|sign-?up|register|auth|oauth2?|sso|password|forgot|reset|callback)([/._?#-]|$)/i;
function historyPage(hosts, profile = PROFILE) {
  const hs = [].concat(hosts || []).map((h) => String(h).toLowerCase().replace(/^www\./, "")).filter((h) => /^[a-z0-9.-]+$/.test(h));
  const db = join(profile, PROFILE_DIR, "History");
  if (!hs.length || !existsSync(db)) return null;
  const dir = mkdtempSync(join(tmpdir(), "symbiot-history-"));
  try {
    for (const ext of ["", "-wal", "-journal"]) if (existsSync(db + ext)) copyFileSync(db + ext, join(dir, "History" + ext));
    const like = hs.map((h) => `url like 'https://${h}/%' or url like 'https://%.${h}/%' or url like 'https://www.${h}/%'`).join(" or ");
    const rows = queryUrls(join(dir, "History"), `select url from urls where (${like}) order by last_visit_time desc limit 200;`);
    const ok = (rows || []).filter((u) => { try { const x = new URL(u); return !NOT_HOME.test(x.pathname) && !NOT_HOME.test(x.hostname.split(".")[0]) && !/[?&](redirect|return|next|continue)/i.test(x.search); } catch { return false; } });
    const bare = (u) => { const h = new URL(u).hostname.toLowerCase(); return hs.includes(h) || hs.includes(h.replace(/^www\./, "")); };
    return ok.find((u) => !bare(u)) || ok[0] || null;
  } catch { return null; }
  finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}
// The first column of each row a query gives, with Node's own SQLite or the sqlite3 command; null if neither.
function queryUrls(file, sql) {
  try { const { DatabaseSync } = process.getBuiltinModule ? process.getBuiltinModule("node:sqlite") || {} : {}; if (DatabaseSync) { const d = new DatabaseSync(file, { readOnly: true }); try { return d.prepare(sql).all().map((r) => String(Object.values(r)[0])); } finally { d.close(); } } } catch {}
  try { const r = spawnSync("sqlite3", [file, sql], { encoding: "utf8", timeout: 5000 }); if (r.status === 0) return r.stdout.split("\n").filter(Boolean); } catch {}
  return null;
}

// One browser at a time: they share a profile, and Chrome locks it.
let queue = Promise.resolve();
const oneAtATime = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

// The hidden browser, while it's open: { proc, c, tabs, timer }. Each agent has a tab
// of its own in it (tabs: who → { page, shown, used }), so two lanes driving it at once
// (LinkedIn and the Twilio console, 2026-10-12) don't land on each other's page, and a
// post half-written in one keeps its text and picture between that agent's steps.
// shown is the id of the screen last mapped from that tab, which is what it shows now.
// keepBrowserOpen(ms) keeps it open that long after each action (the app does); with 0,
// a one-off `symbiot screens` command, it closes after each one.
let live = null, KEEP = 0;
const MAIN = "symbiot", MAX_TABS = 6;
// Whose tab: the agent's run folder (SYMBIOT_AGENT, else where the command ran), or Symbiot's own.
const tabKey = (who) => String(who || "").trim().slice(0, 300) || MAIN;
function keepBrowserOpen(ms) { KEEP = Math.max(0, Number(ms) || 0); if (!KEEP && live && !live.busy) closeBrowser(); }
const browserOpen = () => !!(live && !live.c.closed());
// Don't leave it running when Symbiot exits (a restart, Ctrl+C).
process.once("exit", () => { if (live && live.proc.exitCode === null) try { live.proc.kill("SIGKILL"); } catch {} });

// The Chrome holding Symbiot's profile: its SingletonLock names the process ("host-1234",
// Linux and Mac), and its own args say whether it's hidden. { pid, headless }, or null
// when none is (no lock, or a leftover one whose process has gone).
const OWN = new Set(); // every hidden Chrome this Symbiot started
function argsOf(pid) {
  try { return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" "); } catch {}
  try { return spawnSync("ps", ["-ww", "-o", "args=", "-p", String(pid)], { encoding: "utf8", timeout: 5000 }).stdout || ""; } catch { return ""; }
}
function lockHolder() {
  let pid = 0; try { pid = Number((/-(\d+)$/.exec(readlinkSync(join(PROFILE, "SingletonLock"))) || [])[1]) || 0; } catch {}
  if (!pid) return null;
  try { process.kill(pid, 0); } catch { return null; }
  return { pid, headless: /--headless/.test(argsOf(pid)) };
}
// Is a visible Chrome (the Symbiot Browser) using Symbiot's profile? Not our own hidden
// browser (running, or still closing), and not a hidden one at all: one that isn't ours
// is a stray (strayGone). Taking any hidden Chrome for a window blocked every map and
// press while the app ran, with "click Done" in a window that didn't exist (2026-10-12).
function windowOpen() { const h = lockHolder(); return !!h && !h.headless && !OWN.has(h.pid); }
// Another Symbiot's hidden browser on the profile (a one-off `symbiot screens`, or an app
// from before an update that hasn't gone): it closes after its action, so it's given a
// moment; one still there after that is a stray, and is closed. Gives once it's gone.
const STRAY_WAIT = Number(process.env.SYMBIOT_STRAY_WAIT) || 10000;
async function strayGone(wait = STRAY_WAIT) {
  const stray = () => { const h = lockHolder(); return h && h.headless && !OWN.has(h.pid) ? h.pid : 0; };
  for (const end = Date.now() + wait; stray() && Date.now() < end;) await sleep(250);
  const pid = stray(); if (!pid) return;
  try { process.kill(pid, "SIGINT"); } catch {} // as Done's (CLOSE): its cookies are written first
  for (let i = 0; i < 20 && stray() === pid; i++) await sleep(250);
  if (stray() === pid) try { process.kill(pid, "SIGKILL"); } catch {}
  for (let i = 0; i < 8 && stray() === pid; i++) await sleep(250);
}
// Start the hidden browser, with a tab for who: { proc, c, tabs }.
async function launch(who = MAIN) {
  const chrome = chromeBinary();
  if (!chrome) throw new Error(process.platform === "android" || process.env.SYMBIOT_ANDROID_APP === "1"
    ? "Mapping a page needs a desktop browser (Chrome, Chromium, Edge or Brave), which a phone doesn't have. Map pages from Symbiot on your computer."
    : "Mapping a page needs Chrome, Chromium, Edge or Brave, and none was found.");
  mkdirSync(PROFILE, { recursive: true, mode: 0o700 });
  // the Symbiot Browser (or a sign-in window) has the profile: a second Chrome would hand
  // over to it and pop an empty window into it, so wait for Done instead
  if (windowOpen()) throw new Error("The Symbiot Browser is open: Symbiot reads your sites once you click Done in it.");
  await strayGone();
  const locked = profileReadOnly();
  if (locked) throw new Error(locked);
  const ua = windowUa(chrome);
  const proc = spawn(chrome, browserArgs(true, "about:blank", ua), { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  if (proc.pid) OWN.add(proc.pid);
  let err = ""; proc.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
  const failed = new Promise((resolve, reject) => { proc.on("error", reject); }); failed.catch(() => {});
  const c = connect(proc), b = { proc, c, tabs: new Map(), timer: null };
  const kill = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, START);
  try {
    const run = (async () => {
      let targetId;
      try { ({ targetId } = await c.send("Target.createTarget", { url: "about:blank" })); }
      catch (e) {
        // A second Chrome on a profile that's open hands over to the first and exits.
        const ro = profileReadOnly(); if (ro) throw new Error(ro);
        if (existsSync(join(PROFILE, "SingletonLock")) || /existing browser session|ProcessSingleton/i.test(err)) throw new Error("Symbiot's browser is already open, in a window (Sign in) or in another Symbiot: close that, then try again.");
        throw new Error("The browser didn't start: " + ((err.trim().split("\n").pop()) || e.message));
      }
      // the User-Agent each tab is told (tabUa): none when --user-agent was this Chrome's
      // (product: "Chrome/154.0.8037.57"); one that fits when it wasn't (Chrome updated since)
      let product = "", userAgent = ""; try { ({ product = "", userAgent = "" } = await c.send("Browser.getVersion")); } catch {}
      const fit = reducedUa(String(product).split("/")[1], chrome);
      if (fit) uaSeen = { chrome, ua: fit };
      b.tabUa = fit ? (fit === ua ? "" : fit) : ua ? "" : userAgent.replace(/HeadlessChrome/g, "Chrome");
      await closeOthers(c, targetId); await keepSessions(c);
      await openTab(b, who, targetId);
      return b;
    })();
    return await Promise.race([run, failed]);
  } catch (e) { await shut(b); throw e; }
  finally { clearTimeout(kill); }
}
// A tab of its own for who (a new one, or targetId's): { who, targetId, page: { send, until,
// idle, on }, shown, used }. Past MAX_TABS, the one used longest ago is closed first.
async function openTab(b, who, targetId) {
  const c = b.c;
  if (b.tabs.size >= MAX_TABS) { const old = [...b.tabs.values()].sort((x, y) => x.used - y.used)[0]; if (old) await closeTab(b, old); }
  if (!targetId) ({ targetId } = await c.send("Target.createTarget", { url: "about:blank" }));
  const { sessionId } = await c.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => c.send(method, params, sessionId);
  const until = (method, ms) => c.until((m) => m.sessionId === sessionId && m.method === method, ms);
  // Requests in flight, so "loaded" can wait for a page that fills itself in.
  const inflight = new Set();
  const unhookNet = c.on((m) => {
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
  await send("Page.enable"); await send("Network.enable"); const unauth = await proxyAuth(c, sessionId, send);
  const ss = loadSessions(); if (Object.keys(ss).length) try { await send("Page.addScriptToEvaluateOnNewDocument", { source: sessionFill(ss), worldName: "symbiot-sessions" }); } catch {}
  await send("Emulation.setDeviceMetricsOverride", { width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1, mobile: false });
  // Sites serve "HeadlessChrome" something else (or a block page): look like the browser it
  // is. Mostly done at launch (windowUa); a tab's told only when that couldn't be.
  if (b.tabUa) await send("Network.setUserAgentOverride", { userAgent: b.tabUa });
  // every `method` event on this tab, until the function it gives is called
  const on = (method, f) => c.on((m) => { if (m && m.sessionId === sessionId && m.method === method) f(m.params || {}); });
  const tab = { who, targetId, page: { send, until, idle, on }, shown: "", used: Date.now(), unhook: () => { unhookNet(); unauth(); } };
  b.tabs.set(who, tab);
  return tab;
}
async function closeTab(b, tab) {
  if (b.tabs.get(tab.who) === tab) b.tabs.delete(tab.who);
  if (tab.unhook) tab.unhook();
  try { await Promise.race([b.c.send("Target.closeTarget", { targetId: tab.targetId }), sleep(3000)]); } catch {}
}
async function shut(b) {
  if (!b) return;
  clearTimeout(b.timer); if (live === b) live = null;
  const any = b.tabs && [...b.tabs.values()][0];
  if (!b.c.closed()) { try { if (any) { const own = await Promise.race([readSession(any.page.send), sleep(2500)]); if (own) saveSessions([own]); } await Promise.race([keepSessions(b.c), sleep(3000)]); await Promise.race([b.c.send("Browser.close"), sleep(3000)]); } catch {} }
  // Chrome writes its cookies to disk as it shuts down: killed before that, a sign-in made
  // or kept since it started is lost. Give it a few seconds to finish.
  if (b.proc.exitCode === null) await Promise.race([new Promise((r) => b.proc.once("exit", r)), sleep(5000)]);
  if (b.proc.exitCode === null) try { b.proc.kill("SIGKILL"); } catch {}
}
// Close the hidden browser now (the Sign in window needs its profile).
function closeBrowser() { return shut(live); }

// Give fn who's tab in the hidden browser (the open one, else a new one), and what it
// shows (tab.shown). After: kept open for KEEP ms, or closed. On an error that tab is
// closed, so that agent's next action starts afresh, and the other agents' tabs stay
// as they are; the whole browser only when it's gone.
async function withPage(fn, keep = true, who = MAIN) {
  if (live && live.c.closed()) await shut(live);
  who = tabKey(who);
  let b = live;
  if (b) clearTimeout(b.timer); else b = live = await launch(who);
  b.busy = true;
  const kill = setTimeout(() => { try { b.proc.kill("SIGKILL"); } catch {} }, TIMEOUT);
  let tab = null;
  try {
    tab = b.tabs.get(who) || await openTab(b, who);
    tab.used = Date.now();
    try { await tab.page.send("Page.bringToFront"); } catch {} // a tab behind another doesn't paint
    const r = await fn(tab.page, tab);
    // stay: nothing changed on the page, so it shows what fn left in tab.shown
    if (r && r.stay) delete r.stay; else tab.shown = r && r.id && !r.error ? r.id : "";
    return r;
  } catch (e) { if (!tab || b.c.closed()) await shut(b); else await closeTab(b, tab); throw e; }
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

// Runs in the page: querySelectorAll, closest, contains, elementFromPoint and activeElement,
// through open shadow roots too: a web component's insides. Reddit's comment box, and its
// picture button and file box, are in shreddit-* and faceplate-* elements' shadow roots, and a
// map that only read the page's own elements had none of them (2026-10-12). A selector that
// goes into one has " >>> " where it does: what's before finds the element whose shadow root
// what's after is looked for in (deepQuery).
const DEEP = `
  const upOf = (n) => n.parentElement || (n.parentNode && n.parentNode.host) || null;
  const SHADOWS = (() => { for (const e of document.querySelectorAll('*')) if (e.shadowRoot) return true; return false; })();
  const deepAll = (sel, root = document) => {
    if (!SHADOWS) return [...root.querySelectorAll(sel)];
    const out = [], walk = (r) => { if (r.shadowRoot) walk(r.shadowRoot); for (const e of r.querySelectorAll('*')) { if (e.matches(sel)) out.push(e); if (e.shadowRoot) walk(e.shadowRoot); } };
    walk(root); return out;
  };
  const deepHas = (r, sel) => { if (r.querySelector(sel)) return true; if (!SHADOWS) return false;
    if (r.shadowRoot && deepHas(r.shadowRoot, sel)) return true;
    for (const h of r.querySelectorAll('*')) if (h.shadowRoot && deepHas(h.shadowRoot, sel)) return true;
    return false; };
  const deepClosest = (e, sel) => { for (let n = e; n; n = upOf(n)) if (n.nodeType === 1 && n.matches(sel)) return n; return null; };
  const deepContains = (a, b) => { for (let n = b; n; n = upOf(n)) if (n === a) return true; return false; };
  const deepAt = (x, y) => { let t = document.elementFromPoint(x, y); while (t && t.shadowRoot) { const i = t.shadowRoot.elementFromPoint(x, y); if (!i || i === t) break; t = i; } return t; };
  const deepActive = () => { let e = document.activeElement; while (e && e.shadowRoot && e.shadowRoot.activeElement) e = e.shadowRoot.activeElement; return e; };
  const deepQuery = (sel) => { const parts = String(sel || '').split(' >>> '); let roots = [document];
    for (let i = 0; i < parts.length; i++) {
      const found = []; for (const r of roots) { try { found.push(...r.querySelectorAll(parts[i])); } catch (x) {} }
      if (i === parts.length - 1) return found;
      roots = found.map((e) => e.shadowRoot).filter(Boolean);
    }
    return []; };
  const deepOne = (sel) => sel ? deepQuery(sel)[0] || null : null;
`;

// What can be clicked or typed in, as a CSS selector, and (runs in the page, after DEEP)
// labelOf(e): what a region's label is, as a person would read it.
const CLICKABLE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[contenteditable=""],[contenteditable=true],[onclick],' +
  ['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'checkbox', 'radio', 'switch', 'combobox', 'textbox', 'searchbox', 'row', 'treeitem'].map((r) => '[role=' + r + ']').join(',');
const LABEL_OF = `
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const labelOf = (e) => {
    let s = clean(e.getAttribute('aria-label')); if (s) return s;
    const by = e.getAttribute('aria-labelledby');
    if (by) { const root = e.getRootNode(), byId = (id) => (root.getElementById && root.getElementById(id)) || document.getElementById(id);
      s = clean(by.split(/\\s+/).map((id) => (byId(id) || {}).textContent || '').join(' ')); if (s) return s; }
    if (e.labels && e.labels[0]) { s = clean(e.labels[0].textContent); if (s) return s; }
    if (e.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(e.type)) { s = clean(e.value); if (s) return s; }
    s = clean(e.innerText); if (s) return s;
    for (const a of ['placeholder', 'title', 'name', 'alt']) { s = clean(e.getAttribute(a)); if (s) return s; }
    const img = e.querySelector('img[alt],svg title,[aria-label]');
    return img ? clean(img.getAttribute('alt') || img.getAttribute('aria-label') || img.textContent) : '';
  };
`;

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
const collectJs = (whole, list = null) => `(() => { ${SCROLLER} ${DEEP} ${LABEL_OF}
  const SEL = ${JSON.stringify(CLICKABLE)};
  const W = innerWidth, H = innerHeight, X = ${whole ? "scrollX" : "0"}, Y = ${whole ? "scrollY" : "0"};
  const IN = ${JSON.stringify(list)}, LIST = IN ? deepOne(IN.selector) : null;
  const LB = LIST && (() => { const b = LIST.getBoundingClientRect(); return { left: Math.max(0, b.left), top: Math.max(0, b.top), right: Math.min(W, b.right), bottom: Math.min(H, b.bottom) }; })();
  if (IN && !LIST) return { url: location.href, title: document.title, items: [] };
  const kept = ${whole || (list && list.part === "list") ? "(window.__symbiotWhole = window.__symbiotWhole || { out: [], kinds: new Map(), at: new Set() })" : "{ out: [], kinds: new Map(), at: new Set() }"}, out = kept.out, kinds = kept.kinds;
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
  const stuck = (e) => { for (let n = e; n && n !== document.body; n = upOf(n)) if (/^(fixed|sticky)$/.test(getComputedStyle(n).position)) return true; return false; };
  // in a shadow root: the path to its host, " >>> ", then the path in it (deepQuery)
  const cssPath = (e) => {
    const parts = [], root = e.getRootNode();
    const unique = (sel) => { try { return root.querySelectorAll(sel).length === 1; } catch (x) { return false; } };
    for (let n = e; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      if (n.id && unique('#' + CSS.escape(n.id))) { parts.unshift('#' + CSS.escape(n.id)); break; }
      let p = n.tagName.toLowerCase();
      const par = n.parentElement || n.parentNode, same = par && par.children ? [...par.children].filter((c) => c.tagName === n.tagName) : [];
      if (same.length > 1) p += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      parts.unshift(p);
    }
    return (root.host ? cssPath(root.host) + ' >>> ' : '') + parts.join(' > ');
  };
  // What else can be clicked: an element with a click handler of its own (markClicks, or
  // an onclick), or that the site points at as a link (cursor: pointer set on it, not
  // passed down from what's around it). domains.co.za's 2FA pop-up has its "Send Email
  // OTP instead?" as just that, with no link or button role (2026-10-12). Only one that
  // isn't in a button, link or field and holds none, has a label and is smaller than a
  // quarter of the window; the outermost, where they nest. Each is a button, to press,
  // after the buttons, links and fields.
  const CLK = window.__symbiotClicks || new Set(); window.__symbiotClicks = null;
  const pointer = (e) => !!e && e.nodeType === 1 && getComputedStyle(e).cursor === 'pointer', took = new Set();
  for (const e of deepAll('*', document.body || document.documentElement)) {
    if (e instanceof SVGElement && e.tagName.toLowerCase() !== 'svg') continue;
    if (!(CLK.has(e) || typeof e.onclick === 'function' || (pointer(e) && !pointer(upOf(e))))) continue;
    const b = e.getBoundingClientRect();
    if (!b.width || !b.height || b.width * b.height > W * H / 4) continue;
    if (deepClosest(e, SEL) || deepHas(e, SEL) || (e.tagName === 'LABEL' && e.control)) continue;
    let inside = false; for (let n = upOf(e); n && !inside; n = upOf(n)) inside = took.has(n);
    if (inside || !labelOf(e)) continue;
    took.add(e);
  }
  for (const e of [...deepAll(SEL), ...took]) {
    if (out.length >= 200) break;
    const inList = !!LIST && deepContains(LIST, e);
    if (IN && inList !== (IN.part === 'list')) continue;
    // in an opened-out list, a row already marked is known by where it is, not by its
    // element: a list that reuses its rows as it scrolls shows other mail in the same one
    if ((!inList && kinds.has(e)) || e.disabled || deepClosest(e, '[aria-hidden=true],[inert]')) continue;
    const kind = took.has(e) ? 'button' : kindOf(e), up = upOf(e) && deepClosest(upOf(e), SEL);
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
    const top = deepAt((x + x2) / 2, (y + y2) / 2);
    if (!top || !(top === e || deepContains(e, top) || deepContains(top, e))) continue;
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

// The elements with a click handler of their own (the page's addEventListener), for
// collectJs, as window.__symbiotClicks: the page can't list them itself, Chrome can
// (DOMDebugger). Best effort: none, on an error.
const CLICKS = new Set(["click", "mousedown", "mouseup", "pointerdown", "pointerup"]);
async function markClicks(page) {
  const objectGroup = "symbiot-clicks";
  try {
    const { result } = await page.send("Runtime.evaluate", { expression: "document", objectGroup });
    const { listeners = [] } = await page.send("DOMDebugger.getEventListeners", { objectId: result.objectId, depth: -1, pierce: true });
    const ids = [...new Set(listeners.filter((l) => CLICKS.has(l.type) && l.backendNodeId).map((l) => l.backendNodeId))].slice(0, 500);
    const els = (await Promise.all(ids.map((backendNodeId) => page.send("DOM.resolveNode", { backendNodeId, objectGroup }).then((x) => ({ objectId: x.object.objectId }), () => null)))).filter(Boolean);
    await page.send("Runtime.callFunctionOn", { objectId: result.objectId, functionDeclaration: "function (...a) { window.__symbiotClicks = new Set(a); }", arguments: els });
  } catch {} finally { try { await page.send("Runtime.releaseObjectGroup", { objectGroup }); } catch {} }
}
// What's on the page now: { url, title, items }.
async function collect(page, expression = COLLECT) {
  await markClicks(page);
  const { result, exceptionDetails } = await page.send("Runtime.evaluate", { expression, returnByValue: true });
  if (exceptionDetails) throw new Error("Couldn't read the page: " + ((exceptionDetails.exception && exceptionDetails.exception.description) || exceptionDetails.text));
  return (result && result.value) || { url: "", title: "", items: [] };
}
// A sign-in page instead of the site.
function signInPage(url) {
  const host = hostOf(url);
  return /(^|\.)(accounts\.google|login\.(microsoftonline|live)|signin\.aws|auth0|okta)\./i.test(host + ".") || /\/(log-?in|sign-?in|sign-?up|auth|sso)\b/i.test(String(url || ""));
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
  const box = sel && await evaluate(page, `(() => { ${DEEP} const e = deepOne(${JSON.stringify(sel)}); if (!e) return null;
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
function mapPage(input, name, { whole = false, who = "" } = {}) {
  const url = siteUrl(input);
  if (!url) return Promise.resolve({ error: "Give a site to map: a name (gmail), a host (github.com/pulls) or a web address." });
  return oneAtATime(() => withPage(async (page) => {
    await open(page, url);
    if (!whole) return snapshot(page, name);
    const s = await snapshotWhole(page, name);
    if (!s.inside) return s;
    const one = await snapshot(page, name);
    return one.error || one.note ? one : { ...one, note: s.error };
  }, true, who)).catch((e) => ({ error: String((e && e.message) || e) }));
}

// The whole of a page you've mapped, as one tall screen (snapshotWhole). Only
// looks, so it never asks first.
function wholePage(id, { who = "" } = {}) {
  const s = loadScreens().find((x) => x.id === id); if (!s) return Promise.resolve({ error: "not found" });
  if (!s.page || !s.page.url) return Promise.resolve({ error: "Whole page works on a mapped page." });
  return oneAtATime(() => withPage(async (page, b) => {
    const here = await showScreen(page, b, s, { same: true });
    const next = await snapshotWhole(page, s.name.replace(/ ↓ \d+%$/, "").replace(/ \(whole page\)$/, ""));
    if (next.error) { delete next.inside; return next; }
    return { ...next, kept: here };
  }, true, who)).catch((e) => ({ error: String((e && e.message) || e) }));
}

// Read a site as it is now, without saving a screen: { url, title, items, login }.
// For Watch (watch.mjs), which only looks: nothing is pressed or typed. While the
// browser is open for you or an agent (type, then press), it leaves it alone
// ({ busy }) rather than take its page somewhere else; and it doesn't keep the
// browser open after.
// password: a page asking for a password counts as a sign-in page too (a site's own login
// form at an address that doesn't say so), for a check of whether you're signed in.
// So does a page whose own button or link is just "Log in" or "Sign in": signed out, Reddit's
// home page has no password box, only its Log In button, and read as signed in.
// So does a sign-up page, by its title or its first heading: console.deepgram.com shows
// "Create an account" at its own address when you're signed out (2026-10-14).
const ASKS_PASSWORD = `!![...document.querySelectorAll('input[type=password], a, button, [role=button]')].find((e) => { const b = e.getBoundingClientRect(); if (!(b.width > 0 && b.height > 0)) return false; return e.matches('input') || /^(log ?in|sign ?in)$/i.test(String(e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim()); })
  || [document.title, (document.querySelector('h1') || {}).innerText].some((t) => /^\\s*(create (an|your|a free) account|sign ?up|register)\\b/i.test(String(t || '')))`;
function readPage(input, { password = false } = {}) {
  const url = siteUrl(input);
  if (!url) return Promise.resolve({ error: "Give a site to read: a name (gmail), a host or a web address." });
  return oneAtATime(() => browserOpen() ? { busy: true } : withPage(async (page) => {
    await open(page, url);
    const info = await collect(page);
    let pw = false; if (password) try { pw = !!((await page.send("Runtime.evaluate", { expression: ASKS_PASSWORD, returnByValue: true })).result || {}).value; } catch {}
    return { ...info, login: signInPage(info.url) || pw };
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

// LinkedIn's own lists, for Watch (watch.mjs linkedinDetail): its top bar's badges
// say "Messaging, 1 new notification", never who, and the brief could only say
// "2 new notifications" (2026-10-09). This reads who and what, in the signed-in
// hidden browser, only looking, like readPage: "messages" (each conversation: who,
// its last line, when, unread) or "notifications" (each card: its words, who, its
// link, unread). LinkedIn's class names drift, so each has a fallback: its heading,
// its first paragraph. { items } or { busy } / { error }.
const LI_TEXT = "const tx = (r, s) => { const e = r.querySelector(s); return e ? String(e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim() : ''; };";
const LI_UNREAD = "const un = (r) => /unread/i.test(String(r.className || '')) || !!r.querySelector('[class*=unread],.notification-badge--show') || /\\bunread\\b/i.test(r.getAttribute('aria-label') || '');";
const LI_READ = {
  messages: ["https://www.linkedin.com/messaging/", `(() => { ${LI_TEXT} ${LI_UNREAD}
    return [...document.querySelectorAll('li.msg-conversation-listitem, li.msg-conversations-container__convo-item')].slice(0, 20).map((r) => ({
      name: tx(r, '.msg-conversation-listitem__participant-names, .msg-conversation-card__participant-names, h3'),
      preview: tx(r, '.msg-conversation-card__message-snippet, .msg-conversation-card__message-snippet-body, p').slice(0, 200),
      time: tx(r, 'time, .msg-conversation-listitem__time-stamp, .msg-conversation-card__time-stamp'), unread: un(r) })).filter((x) => x.name);
  })()`],
  notifications: ["https://www.linkedin.com/notifications/", `(() => { ${LI_TEXT} ${LI_UNREAD}
    return [...document.querySelectorAll('article.nt-card, .nt-card-list article, main article')].slice(0, 20).map((r) => ({
      text: (tx(r, '.nt-card__text--3-line, .nt-card__headline, .nt-card__text') || String(r.innerText || '').replace(/\\s+/g, ' ').trim()).slice(0, 300),
      actor: tx(r, '.nt-card__text--3-line strong, .nt-card__headline strong, strong').slice(0, 80),
      href: String((r.querySelector('a[href*="linkedin.com/"], a[href^="/"]') || {}).href || '').slice(0, 500), unread: un(r) })).filter((x) => x.text);
  })()`],
};
function readLinkedIn(kind) {
  const it = LI_READ[kind]; if (!it) return Promise.resolve({ error: "messages or notifications" });
  return oneAtATime(() => browserOpen() ? { busy: true } : withPage(async (page) => {
    await open(page, it[0]);
    const at = String((await evaluate(page, "location.href")) || it[0]);
    if (signInPage(at)) return { login: true, url: at };
    return { url: at, items: (await evaluate(page, it[1])) || [] };
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

// A browser of its own for a capture (capture.mjs): a fresh profile in a temp folder, so
// nothing you're signed in to in Symbiot's browser shows in a product's pictures, and it
// never waits on the Symbiot Browser. fn gets its page ({ send, until, idle, on }); the
// browser and its profile go after. width × height: the page's size.
async function scratchPage(fn, { width = 1440, height = 900 } = {}) {
  const chrome = chromeBinary();
  if (!chrome) throw new Error("Capturing a product needs Chrome, Chromium, Edge or Brave, and none was found.");
  const dir = mkdtempSync(join(tmpdir(), "symbiot-capture-"));
  const proc = spawn(chrome, ["--headless=new", "--hide-scrollbars", "--mute-audio", "--remote-debugging-pipe", `--window-size=${width},${height}`,
    "--user-data-dir=" + dir, "--no-first-run", "--no-default-browser-check", ...(process.platform === "linux" ? ["--password-store=basic"] : process.platform === "darwin" ? ["--use-mock-keychain"] : []), "about:blank"],
  { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  let err = ""; proc.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
  const failed = new Promise((resolve, reject) => { proc.on("error", reject); }); failed.catch(() => {});
  const c = connect(proc), kill = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, START);
  try {
    const page = await Promise.race([failed, (async () => {
      let targetId; try { ({ targetId } = await c.send("Target.createTarget", { url: "about:blank" })); } catch (e) { throw new Error("The browser didn't start: " + ((err.trim().split("\n").pop()) || e.message)); }
      const { sessionId } = await c.send("Target.attachToTarget", { targetId, flatten: true });
      const send = (method, params) => c.send(method, params, sessionId);
      const until = (method, ms) => c.until((m) => m.sessionId === sessionId && m.method === method, ms);
      const inflight = new Set();
      c.on((m) => { if (!m || m.sessionId !== sessionId) return; if (m.method === "Network.requestWillBeSent") inflight.add(m.params.requestId); else if (m.method === "Network.loadingFinished" || m.method === "Network.loadingFailed") inflight.delete(m.params.requestId); });
      const idle = async () => { const end = Date.now() + 8000; let calm = 0; await sleep(400); while (Date.now() < end && calm < 600) { await sleep(100); calm = inflight.size <= 1 ? calm + 100 : 0; } };
      const on = (method, f) => c.on((m) => { if (m && m.sessionId === sessionId && m.method === method) f(m.params || {}); });
      await send("Page.enable"); await send("Network.enable");
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      const { userAgent } = await c.send("Browser.getVersion");
      if (userAgent) await send("Network.setUserAgentOverride", { userAgent: userAgent.replace(/HeadlessChrome/g, "Chrome") });
      return { send, until, idle, on };
    })()]);
    clearTimeout(kill);
    return await fn(page);
  } finally {
    clearTimeout(kill);
    try { await Promise.race([c.send("Browser.close"), sleep(3000)]); } catch {}
    if (proc.exitCode === null) await Promise.race([new Promise((r) => proc.once("exit", r)), sleep(3000)]);
    if (proc.exitCode === null) try { proc.kill("SIGKILL"); } catch {}
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  }
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
const scrollJs = (to, where = null) => `(() => { ${SCROLLER} ${DEEP}
  const sel = ${JSON.stringify(where)}, to = ${JSON.stringify(to)};
  let e = null; try { e = sel === null ? null : sel ? deepOne(sel) : document.scrollingElement || document.documentElement; } catch (x) {}
  e = e || scroller(); if (!e) return null;
  const from = e.scrollTop, step = Math.round(Math.min(e.clientHeight, innerHeight) * 0.85);
  e.scrollTo({ top: to === 'down' ? from + step : to === 'up' ? from - step : to === 'top' ? 0 : to === 'bottom' ? e.scrollHeight : +to || 0, behavior: 'instant' });
  return { from: Math.round(from), y: Math.round(e.scrollTop), max: Math.round(e.scrollHeight - e.clientHeight) };
})()`;

// Make the page show what screen s does: it still does if the open browser last
// mapped it (with what was typed there); else open its address again and scroll
// to where it was. True if it was still there, false if it was opened again.
// same: a tab at s's address already is left as it is, whatever it mapped last.
// Whole page and Scroll only look, and opening the page again closes what's open
// on it (domains.co.za's 2FA pop-up, 2026-10-12) and loses what was typed.
async function showScreen(page, b, s, { same = false } = {}) {
  // its address, but for a #part: an unsubscribe page that had moved to #top was opened again,
  // and the toggles pressed on it were lost (2026-10-10)
  const bare = (u) => String(u || "").split("#")[0];
  const url = (await page.send("Runtime.evaluate", { expression: "location.href", returnByValue: true })).result?.value;
  if (bare(url) === bare(s.page.url) && (same || b.shown === s.id)) return true;
  await open(page, s.page.url);
  const sc = s.page.scroll;
  if (sc && sc.y) { await page.send("Runtime.evaluate", { expression: scrollJs(sc.y, sc.selector || ""), returnByValue: true }); await page.idle(); }
  return false;
}

// Scroll a mapped page and map what's in the window then, as a new screen: a site
// is taller than its window, and a map only has what the window shows. Only looks,
// so it never asks first. At the end already, it says so and maps nothing.
const SCROLLS = ["down", "up", "top", "bottom"];
function scrollPage(id, to = "down", { who = "" } = {}) {
  to = String(to || "down").toLowerCase();
  if (!SCROLLS.includes(to)) return Promise.resolve({ error: `Scroll ${SCROLLS.join(", ")}: not "${to}".` });
  const s = loadScreens().find((x) => x.id === id); if (!s) return Promise.resolve({ error: "not found" });
  if (!s.page || !s.page.url) return Promise.resolve({ error: "Scroll works on a mapped page." });
  return oneAtATime(() => withPage(async (page, b) => {
    const here = await showScreen(page, b, s, { same: true }), sc = s.page.scroll;
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
  }, true, who)).catch((e) => ({ error: String((e && e.message) || e) }));
}

// Runs in the page: where to act on region r now, as { x, y, by } in the window,
// or null (nothing to act on in the window: its spot, c, is). What its selector
// finds isn't always it: LinkedIn's schedule box opens over the composer, and its
// "Scheduled (8)" tab's selector found the composer's clock (2026-10-12). So, of
// what the selector finds: the one at r's spot (on top there); else one with r's
// label (the page moved, as one opened again can); else whatever can be clicked
// at r's spot (by: "spot"); else the first it finds. clear: what's there now is
// it (nothing covers it: a pop-up opened since). On a whole-page screen
// (full), c is on the page, not the window: what the selector finds is checked
// against it as far down as it is (the page's and its lists' scrolling), and the
// spot itself is left to the caller to scroll to.
// A new tab would leave this one where it was, so a link opens here instead.
// Where to act on region r now (findRegion), else its spot: on a whole-page screen that
// spot is on the page, not the window, so it's scrolled into the window first. Fill
// (fillForm) finds each field this way, as Press and Type do.
async function locateRegion(page, s, r) {
  const hit = (await page.send("Runtime.evaluate", { expression: findRegion(r, center(r), !!s.page.full), returnByValue: true })).result?.value;
  let at = hit ? { x: hit.x, y: hit.y } : center(r);
  if (!hit && s.page.full) {
    const y = await evaluate(page, s.page.list ? `(() => { ${DEEP} const e = deepOne(${JSON.stringify(s.page.list)}); if (!e) return 0;
      const b = e.getBoundingClientRect(); if (${at.y} < b.top) return 0; e.scrollTop = ${at.y} - b.top - e.clientHeight / 2; return e.scrollTop; })()` : `(scrollTo(0, ${at.y} - innerHeight / 2), scrollY)`);
    at = { x: at.x, y: at.y - (Number(y) || 0) };
  }
  return { at, found: !!hit && hit.by === "selector" };
}
const findRegion = (r, c, full) => `(() => { ${DEEP} ${LABEL_OF}
  const sel = ${JSON.stringify(r.selector || "")}, want = ${JSON.stringify(r.label || "")}, c = ${JSON.stringify(c)}, full = ${!!full};
  let all = sel ? deepQuery(sel) : [];
  all = all.filter((e) => { const b = e.getBoundingClientRect(); return b.width && b.height; });
  const top = !full && c.x >= 0 && c.y >= 0 && c.x < innerWidth && c.y < innerHeight ? deepAt(c.x, c.y) : null;
  const down = (e) => { let x = full ? scrollX : 0, y = full ? scrollY : 0; if (full) for (let n = upOf(e); n && n !== document.body; n = upOf(n)) { x += n.scrollLeft || 0; y += n.scrollTop || 0; } return { x, y }; };
  const atSpot = (e) => { const b = e.getBoundingClientRect(), o = down(e);
    if (!(c.x >= b.left + o.x - 1 && c.x <= b.right + o.x + 1 && c.y >= b.top + o.y - 1 && c.y <= b.bottom + o.y + 1)) return false;
    return full || (!!top && (top === e || deepContains(e, top) || deepContains(top, e))); };
  const go = (e) => { const a = deepClosest(e, 'a[target]'); if (a) a.removeAttribute('target'); };
  let e = all.find(atSpot) || all.find((x) => labelOf(x).slice(0, 80) === want) || null;
  const there = !e && top && top !== document.body && top !== document.documentElement && deepClosest(top, ${JSON.stringify(CLICKABLE)});
  if (there) { go(there); return { x: c.x, y: c.y, by: 'spot' }; }
  e = e || all[0]; if (!e) return null;
  go(e); e.scrollIntoView({ block: 'center', inline: 'center' }); const b = e.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
  const t = b.width && b.height && deepAt(x, y);
  return b.width && b.height ? { x, y, by: 'selector', clear: !!t && (t === e || deepContains(e, t) || deepContains(t, e)) } : null;
})()`;

// Act on a mapped region: find it (by its selector, else at the same spot) and give
// act(page, at, region, { found, here }) where it is now (found: by its selector; here:
// the page wasn't opened again); then map where that leads, as a new screen.
// On the screen the open browser last mapped, that's the page as it is now (what
// was typed is still there). On another of the page it's on (mapped before a pop-up
// opened, or before Whole page), it's that page as it is too, if the region is on
// it and nothing covers it; else, and on any other, its page is opened from its
// address again. It acts on the real site, signed in as you, so it needs the caller's
// confirmation unless the page's site is trusted.
const MODAL_OPEN = `[...document.querySelectorAll('[role=dialog],[role=alertdialog],[aria-modal=true],dialog[open]')].some((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; })`;
function actOnRegion(id, regionId, verb, confirmed, check, act, who = "") {
  const s = loadScreens().find((x) => x.id === id); if (!s) return Promise.resolve({ error: "not found" });
  if (!s.page || !s.page.url) return Promise.resolve({ error: `${verb} works on a mapped page. Use Click here for a screenshot of your screen.` });
  const r = (s.regions || []).find((x) => x.id === regionId); if (!r) return Promise.resolve({ error: "That region is gone. Reload the screen." });
  const bad = check(r); if (bad) return Promise.resolve({ error: bad });
  const host = hostOf(s.page.url);
  if (!confirmed && !isTrusted(s.page.url)) return Promise.resolve({ error: `${verb === "Type" ? "Typing into" : verb === "Upload" ? "Attaching a file with" : verb === "Choose" ? "Choosing in" : "Pressing"} "${r.label}" acts on the real site, signed in as you, and ${host} isn't one of your trusted sites.`, confirm: true, host });
  return oneAtATime(() => withPage(async (page, b) => {
    const find = async () => (await page.send("Runtime.evaluate", { expression: findRegion(r, center(r), !!s.page.full), returnByValue: true })).result?.value;
    let here = await showScreen(page, b, s, { same: true }), hit = null;
    // the same action again and again with the page unchanged (Outlook's "send to everyone?" pop-up, 2026-10-14: 2 hours): stop
    const key = `${verb}|${id}|${regionId}`;
    if (b.repeat && b.repeat.key === key && b.repeat.n >= 3) return { error: `You've done this ${b.repeat.n} times and the page didn't change. Don't try it again: use another way (Type into the focused field with Enter, a different button on the pop-up, or Whole page to see what's open now) or stop and say what blocks you.`, kept: here, stay: true };
    if (here && b.shown !== s.id) {
      hit = await find();
      if (!(hit && hit.by === "selector" && hit.clear)) {
        // a pop-up is open over it: opening the page again would close it and lose what it holds
        if (await evaluate(page, MODAL_OPEN)) return { error: `"${r.label}" is covered by a pop-up that is open on the page now. Opening the page again would close the pop-up, so it wasn't. Press in the pop-up (Whole page maps it as it is), or close it first.`, kept: true, stay: true };
        hit = null; here = await showScreen(page, b, s);
      }
    }
    hit = hit || await find();
    const found = !!hit && hit.by === "selector";
    // not found: the same spot. On a whole-page screen that spot is on the page, not
    // the window: scroll it into the window first (the list, on one whose list was
    // opened out, if the spot is in it).
    let at = hit ? { x: hit.x, y: hit.y } : center(r);
    if (!hit && s.page.full) {
      const y = await evaluate(page, s.page.list ? `(() => { ${DEEP} const e = deepOne(${JSON.stringify(s.page.list)}); if (!e) return 0;
        const b = e.getBoundingClientRect(); if (${at.y} < b.top) return 0; e.scrollTop = ${at.y} - b.top - e.clientHeight / 2; return e.scrollTop; })()` : `(scrollTo(0, ${at.y} - innerHeight / 2), scrollY)`);
      at = { x: at.x, y: at.y - (Number(y) || 0) };
    }
    const navigating = page.until("Page.frameStartedLoading", 1500);
    const extra = await act(page, at, r, { found, here });
    // refused on the page, nothing changed: the page stays as it was, so what was typed before is kept
    if (extra && extra.refused) { if (!here) b.shown = s.id; return { error: extra.refused, kept: here, stay: true }; }
    if (await navigating) await page.until("Page.loadEventFired", 30000);
    await page.idle();
    const next = await snapshot(page, ""); // named after the page it landed on
    if (next.error) return next;
    const sig = ((next.page && next.page.url) || "") + "|" + (next.regions || []).map((x) => x.kind + ":" + x.label).join("|");
    b.repeat = b.repeat && b.repeat.key === key && b.repeat.sig === sig ? { key, sig, n: b.repeat.n + 1 } : { key, sig, n: 1 };
    return { ...next, ...extra, found, kept: here };
  }, true, who)).catch((e) => ({ error: String((e && e.message) || e) }));
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
function pressRegion(id, regionId, { confirmed = false, noSend = false, who = "" } = {}) {
  const s = noSend ? loadScreens().find((x) => x.id === id) : null, host = s && s.page ? hostOf(s.page.url) : "";
  return actOnRegion(id, regionId, "Press", confirmed, (r) => (noSend && isSend(r, host) ? `"${r.label}" sends or posts. This run only drafts: it never presses Send, Post, Comment or Reply. The draft stays for the user to send or post.` : ""),
    async (page, at, r) => { await clickAt(page, at); return { pressed: r.label }; }, who);
}

const typeInto = async (page, at, text) => {
  await clickAt(page, at);
  await page.send("Runtime.evaluate", { expression: `(() => { ${DEEP} const e = deepActive(); if (!e) return;
    if (typeof e.select === 'function') e.select(); else if (e.isContentEditable) getSelection().selectAllChildren(e); })()` });
  if (text) await page.send("Input.insertText", { text });
  if (text) await settleValue(page, at, text);
};

// React-controlled fields (GitHub's transfer form) can drop the typed text: the click
// lands on a label or wrapper so nothing is focused, or React re-renders and resets
// the value. Read the field back; if it doesn't hold the text, set it the way React
// listens for (the native value setter, then input and change events) on the field
// under the click, else the nearest one in its label or box.
const settleValue = (page, at, text) => page.send("Runtime.evaluate", { expression: `(() => {
  const want = ${JSON.stringify(text)}, isF = (x) => !!x && (x.tagName === 'INPUT' || x.tagName === 'TEXTAREA' || x.isContentEditable);
  const val = (x) => x.isContentEditable ? x.innerText : x.value;
  let e = document.activeElement;
  if (!isF(e)) { const p = document.elementFromPoint(${Number(at.x) || 0}, ${Number(at.y) || 0}); e = p && (isF(p) ? p : (p.closest('label') || p.parentElement || p).querySelector('input,textarea,[contenteditable=true]')); }
  if (!isF(e) || (e.tagName === 'INPUT' && /^(checkbox|radio|file|button|submit)$/i.test(e.type))) return;
  if (val(e) === want) return;
  e.focus();
  if (e.isContentEditable) { getSelection().selectAllChildren(e); document.execCommand('insertText', false, want); return; }
  const set = Object.getOwnPropertyDescriptor(e.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value').set;
  set.call(e, want);
  e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
})()` });

// Type: click into a field, replace what's in it with text, and press Enter if
// asked (which is how a search or a one-line form is sent). Without Enter, press
// the form's button next, on the screen this maps, while the browser is still
// open (the app's): what's typed is still there. Otherwise it's gone by then.
// noSend (a draft reply's run) refuses Enter, which sends in a chat, and in a
// WhatsApp chat types line breaks as spaces, in case a new line sends there too.
// replace: only that part of what's in it is typed over (selected, then typed, as a
// person would), so the rest stays as it is: retyping all of a scheduled LinkedIn
// post to change one line dropped its picture (2026-10-12). It has to be there just
// once; none, or more than once, changes nothing and says so.
const MAX_TEXT = 2000;
const CHAT_HOSTS = new Set(["web.whatsapp.com"]);
const SELECT_PART = (old) => `(() => { ${DEEP}
  const e = deepActive(), w = ${JSON.stringify(String(old || ""))};
  if (!e) return { problem: 'none' };
  const count = (t) => { let n = 0, i = -1; while ((i = t.indexOf(w, i + 1)) !== -1) n++; return n; };
  if (typeof e.setSelectionRange === 'function' && typeof e.value === 'string') {
    const n = count(e.value); if (n !== 1) return { problem: n ? 'more' : 'none', count: n };
    const i = e.value.indexOf(w); e.setSelectionRange(i, i + w.length); return { ok: true };
  }
  if (!e.isContentEditable) return { problem: 'none' };
  // a rich editor (LinkedIn's): its text nodes, as one string, and the match mapped back onto them
  const nodes = [], walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let all = '';
  for (let x = walk.nextNode(); x; x = walk.nextNode()) { nodes.push([x, all.length]); all += x.data; }
  const n = count(all); if (n !== 1) return { problem: n ? 'more' : 'none', count: n };
  const from = all.indexOf(w), to = from + w.length, at = (k, end) => { for (const [x, o] of nodes) if (k < o + x.data.length || (end && k === o + x.data.length)) return [x, k - o]; return null; };
  const a = at(from, false), b = at(to, true); if (!a || !b) return { problem: 'none' };
  const r = document.createRange(); r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); return { ok: true };
})()`;
function typeRegion(id, regionId, text, { enter = false, confirmed = false, noSend = false, replace = null, who = "" } = {}) {
  const part = replace == null ? null : String(replace);
  text = String(text == null ? "" : text);
  if (noSend) { const s = loadScreens().find((x) => x.id === id); if (s && s.page && CHAT_HOSTS.has(hostOf(s.page.url))) text = text.replace(/\s*[\r\n]+\s*/g, " ").trim(); }
  return actOnRegion(id, regionId, "Type", confirmed, (r) => {
    if (noSend && enter) return "Enter sends in a chat, and this run only drafts: type without --enter, and the reply stays unsent for the user to send.";
    if (r.kind === "menu") return `"${r.label}" is a menu, not a field: pick its option with Choose (symbiot screens choose <screen> <menu> "option").`;
    if (r.kind !== "field") return `"${r.label}" isn't a field (it's a ${r.kind || "region"}). Type works on a field; use Press for the rest.`;
    if (part === "") return "Give the words to replace: some of what's in the field now.";
    if (part == null && !text && !enter) return "Give the text to type.";
    if (text.length > MAX_TEXT) return `That's more than ${MAX_TEXT} characters.`;
    return "";
  }, async (page, at, r, { found, here }) => {
    // its field gone (a pop-up's, closed by opening the page again), the same spot is
    // something else: domains.co.za's 2FA PIN went into the page's Email field (2026-10-12)
    if (!found) return { refused: `"${r.label}" isn't on the page now${here ? "" : " (it was opened again from its address, which closes a pop-up and loses what was typed)"}, so nothing was typed: it would have gone into whatever is in its place. Map the page as it is now, or press what opens that field again first.` };
    await clickAt(page, at);
    if (part != null) {
      const sel = await evaluate(page, SELECT_PART(part));
      if (!sel || !sel.ok) return { refused: sel && sel.problem === "more" ? `"${part}" is in "${r.label}" ${sel.count} times: give more of it, so it's there just once. Nothing was changed.` : `"${r.label}" doesn't have "${part}" in it (it has to be within one line or paragraph, as it is now). Nothing was changed.` };
      if (text) await page.send("Input.insertText", { text });
      else for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key: "Delete", code: "Delete", windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 });
    } else {
      await page.send("Runtime.evaluate", { expression: `(() => { ${DEEP} const e = deepActive(); if (!e) return;
      if (typeof e.select === 'function') e.select(); else if (e.isContentEditable) getSelection().selectAllChildren(e); })()` });
      if (text) await page.send("Input.insertText", { text });
      if (text) await settleValue(page, at, text);
    }
    if (enter) for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}) });
    return { typed: r.label, entered: !!enter, ...(part != null ? { replaced: part } : {}) };
  }, who);
}

// Choose: pick an option in a menu, as choosing it would. A native <select> (a press only
// opens it, and typing isn't allowed in one: domains.co.za's DNS record type, 2026-10-09)
// gets the option set and the page told (input and change), so what depends on it updates
// (MX turns its Priority box on). A menu of the site's own making (role=combobox) is
// opened, and its option (role=option) clicked. The option: its label or value, exactly,
// else the one label that has it in it; none, or more than one, says which there are.
const CHOOSE_SELECT = (sel, at, want) => `(() => { ${DEEP}
  let e = deepOne(${JSON.stringify(sel || "")});
  e = e || deepAt(${Number(at.x) || 0}, ${Number(at.y) || 0});
  const lab = e && deepClosest(e, 'label');
  const s = !e ? null : e.tagName === 'SELECT' ? e : deepAll('select', e)[0] || (lab && lab.control && lab.control.tagName === 'SELECT' ? lab.control : null);
  if (!s) return { native: false };
  const norm = (t) => String(t || '').replace(/\\s+/g, ' ').trim().toLowerCase(), w = norm(${JSON.stringify(String(want || ""))});
  const opts = [...s.options].map((o) => ({ o, label: norm(o.label || o.text), value: norm(o.value) })), all = opts.map((x) => x.o.label || x.o.text);
  let hit = opts.filter((x) => x.label === w || x.value === w); if (!hit.length) hit = opts.filter((x) => w && x.label.includes(w));
  if (hit.length !== 1) return { native: true, problem: hit.length ? 'more' : 'none', options: all };
  const o = hit[0].o; if (s.disabled || o.disabled) return { native: true, problem: 'off', options: all };
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, o.value);
  s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true }));
  return { native: true, chose: o.label || o.text, value: s.value };
})()`;
const CHOOSE_OPTION = (want) => `(() => { ${DEEP}
  const norm = (t) => String(t || '').replace(/\\s+/g, ' ').trim().toLowerCase(), w = norm(${JSON.stringify(String(want || ""))});
  const seen = deepAll('[role=option]').filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
  const all = seen.map((e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\\s+/g, ' ').trim());
  let hit = seen.filter((e, i) => norm(all[i]) === w); if (!hit.length) hit = seen.filter((e, i) => w && norm(all[i]).includes(w));
  if (hit.length !== 1) return { problem: hit.length ? 'more' : 'none', options: all };
  hit[0].scrollIntoView({ block: 'center' }); const b = hit[0].getBoundingClientRect();
  return { at: { x: b.left + b.width / 2, y: b.top + b.height / 2 }, chose: all[seen.indexOf(hit[0])] };
})()`;
const chooseSaid = (r, want, x) => x.problem === "off" ? `"${r.label}" is switched off on the page, or that option is: nothing was chosen.`
  : `${x.problem === "more" ? `More than one option in "${r.label}" matches "${want}"` : `"${r.label}" has no option "${want}"`}. Its options: ${(x.options || []).slice(0, 40).map((o) => `"${o}"`).join(", ") || "none showing"}.`;
function chooseRegion(id, regionId, option, { confirmed = false, who = "" } = {}) {
  const want = String(option == null ? "" : option).trim();
  return actOnRegion(id, regionId, "Choose", confirmed, (r) => {
    if (!want) return "Give the option to choose: its label, as the menu shows it.";
    if (r.kind !== "menu") return `"${r.label}" isn't a menu (it's a ${r.kind || "region"}). Choose works on a menu; use Press or Type for the rest.`;
    return "";
  }, async (page, at, r) => {
    const sel = await evaluate(page, CHOOSE_SELECT(r.selector, at, want));
    if (sel && sel.native) { if (sel.problem) throw new Error(chooseSaid(r, want, sel)); return { chose: sel.chose, value: sel.value }; }
    await clickAt(page, at); await sleep(400); // the site's own menu: open it, then its option
    const o = await evaluate(page, CHOOSE_OPTION(want));
    if (!o || o.problem) { await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }).catch(() => {}); throw new Error(chooseSaid(r, want, o || {})); }
    await clickAt(page, o.at);
    return { chose: o.chose };
  }, who);
}

// Fill: several fields, then (optionally) one button, in the one browser session, so
// a form that forgets itself between separate calls (GitHub's transfer, npm and
// Cloudflare settings) is filled and sent in one go. `fields` is [{ region, text }],
// all on the one screen; each is found where it is now (the page isn't reloaded
// between them), typed into, and `press` is clicked last. Maps the result once.
function fillForm(id, fields, { press = "", confirmed = false, noSend = false, who = "" } = {}) {
  const s = loadScreens().find((x) => x.id === id); if (!s) return Promise.resolve({ error: "not found" });
  if (!s.page || !s.page.url) return Promise.resolve({ error: "Fill works on a mapped page." });
  if (!Array.isArray(fields) || !fields.length) return Promise.resolve({ error: "Give at least one field to fill." });
  const host = hostOf(s.page.url), rs = s.regions || [], steps = [];
  for (const f of fields) {
    const r = rs.find((x) => x.id === f.region); if (!r) return Promise.resolve({ error: "That region is gone. Reload the screen." });
    const text = String(f.text == null ? "" : f.text);
    if (r.kind !== "field") return Promise.resolve({ error: `"${r.label}" isn't a field (it's a ${r.kind || "region"}). Fill works on fields; press the rest with --press.` });
    if (text.length > MAX_TEXT) return Promise.resolve({ error: `That's more than ${MAX_TEXT} characters.` });
    steps.push({ r, text: noSend && CHAT_HOSTS.has(host) ? text.replace(/\s*[\r\n]+\s*/g, " ").trim() : text });
  }
  let button = null;
  if (press) {
    button = rs.find((x) => x.id === press); if (!button) return Promise.resolve({ error: "That region is gone. Reload the screen." });
    if (noSend && isSend(button, host)) return Promise.resolve({ error: `"${button.label}" sends or posts. This run only drafts: it never presses Send, Post, Comment or Reply. The draft stays for the user to send or post.` });
  }
  if (!confirmed && !isTrusted(s.page.url)) return Promise.resolve({ error: `Filling this form acts on the real site, signed in as you, and ${host} isn't one of your trusted sites.`, confirm: true, host });
  return oneAtATime(() => withPage(async (page, b) => {
    const here = await showScreen(page, b, s), typed = [];
    // Check every field, and the button, is on the page now before anything is typed: a page
    // opened again from its address has lost the open form (a pop-up, a meeting's guest chips),
    // and the remembered spots are then something else. Refused with nothing changed, as Type
    // does (2026-10-14: a Teams invite was saved with no guests).
    for (const r of [...steps.map((x) => x.r), ...(button ? [button] : [])]) {
      const { found } = await locateRegion(page, s, r);
      if (!found) { if (!here) b.shown = s.id; return { error: `"${r.label}" isn't on the page now${here ? "" : " (it was opened again from its address, which closes a pop-up and loses what was typed)"}, so nothing was filled or pressed: it would have gone into whatever is in its place. Map the page as it is now, or press what opens that form again first.`, kept: here, stay: true }; }
    }
    for (const { r, text } of steps) {
      const { at } = await locateRegion(page, s, r);
      await typeInto(page, at, text);
      typed.push(r.label);
    }
    let pressed = "";
    if (button) {
      const { at } = await locateRegion(page, s, button);
      const navigating = page.until("Page.frameStartedLoading", 1500);
      await clickAt(page, at);
      if (await navigating) await page.until("Page.loadEventFired", 30000);
      pressed = button.label;
    }
    await page.idle();
    const next = await snapshot(page, "");
    return next.error ? next : { ...next, typed, pressed, kept: here };
  }, true, who)).catch((e) => ({ error: String((e && e.message) || e) }));
}

// Verify: load an address fresh, in a tab of its own (the cache off, so not the page the
// agent's tab holds), and say whether each text is on it, in its words or a field's value.
// For checking a send or a save in the saved record, never the form that was filled: a
// meeting reopened, the Sent folder. { url, title, found: [{ text, found }], ok }.
function verifyPage(input, expect, { who = "" } = {}) {
  const url = siteUrl(input), wants = (Array.isArray(expect) ? expect : [expect]).map((x) => String(x == null ? "" : x).trim()).filter(Boolean);
  if (!url) return Promise.resolve({ error: "Give the address to check." });
  if (!wants.length) return Promise.resolve({ error: 'Give what should be there: --expect "text".' });
  const js = `(() => { ${DEEP} const norm = (t) => String(t || '').replace(/\\s+/g, ' ').toLowerCase();
    const vals = deepAll('input, textarea, select').map((e) => e.value + ' ' + (e.getAttribute('aria-label') || '')).join(' ');
    return norm((document.body.innerText || '') + ' ' + vals); })()`;
  return oneAtATime(() => withPage(async (page, tab) => {
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    await open(page, url);
    const text = String((await evaluate(page, js)) || ""), at = String((await evaluate(page, "location.href")) || url);
    const found = wants.map((w) => ({ text: w, found: text.includes(w.replace(/\s+/g, " ").toLowerCase()) }));
    const title = String((await evaluate(page, "document.title")) || "");
    await closeTab(live, tab);
    return { url: at, title, found, ok: found.every((x) => x.found), login: signInPage(at), stay: true };
  }, true, "verify:" + (who || MAIN) + ":" + Date.now())).catch((e) => ({ error: String((e && e.message) || e) }));
}

// Upload: put a file (or a few) in a page's file box, as picking it in the file
// dialog would (DevTools' DOM.setFileInputFiles): a picture or video for a LinkedIn
// post. Sites hide the real <input type=file> behind a button ("Add media"), and a
// map only has what shows, so the field is usually that button: the box is then
// the one inside it, its label's, else the nearest one going up from it, and
// `used` says which. A page that makes its box only once the button is pressed:
// pressed, with the file dialog caught instead of shown, and the file put in the
// box that dialog was for. The files are checked (absolute, there) before a
// browser starts, and off your trusted sites it asks first, like press and type.
const FILE_BOX = (sel, at) => `(() => { ${DEEP}
  const isBox = (x) => !!x && x.tagName === 'INPUT' && String(x.type).toLowerCase() === 'file', all = deepAll('input[type=file]');
  let e = deepOne(${JSON.stringify(sel || "")});
  e = e || deepAt(${Number(at.x) || 0}, ${Number(at.y) || 0});
  let box = null, how = '';
  if (isBox(e)) { box = e; how = 'the field itself'; }
  else if (e) {
    const lab = deepClosest(e, 'label'), inside = deepAll('input[type=file]', e)[0];
    if (inside) { box = inside; how = 'the file box inside it'; }
    else if (lab && isBox(lab.control)) { box = lab.control; how = "its label's file box"; }
    else for (let n = upOf(e); n && !box; n = upOf(n)) { const f = deepAll('input[type=file]', n)[0]; if (f) { box = f; how = all.length === 1 ? 'the only file box on the page' : "the nearest of the page's " + all.length + ' file boxes'; } }
  }
  if (!box && all.length === 1) { box = all[0]; how = 'the only file box on the page'; }
  if (!box) return null;
  window.__symbiotFileBox = box;
  const name = box.getAttribute('aria-label') || box.name || box.id || '';
  return { how, guess: !(isBox(e) || how === 'the file box inside it' || how === "its label's file box"), box: 'input[type=file]' + (name ? ' "' + name + '"' : '') + (box.accept ? ' (takes ' + box.accept + ')' : ''), multiple: !!box.multiple };
})()`;
// The box found is the target's own only when `how` says so. A page-wide guess ("the only /
// nearest file box") can belong to something else (WhatsApp's sticker input beside "Photos &
// videos"), so a pressable target is pressed and its own file dialog caught first; the guess
// is the fallback when pressing opens no dialog.
async function attachFiles(page, at, r, files) {
  const box = await evaluate(page, FILE_BOX(r.selector, at));
  const pressable = Number.isFinite(Number(at && at.x)) && Number.isFinite(Number(at && at.y)) && !!at;
  if (box && box.guess && pressable) {
    const got = await viaDialog(page, at, r, files, false);
    if (got) { await page.send("Runtime.evaluate", { expression: "delete window.__symbiotFileBox" }).catch(() => {}); return got; }
  }
  if (box) {
    if (files.length > 1 && !box.multiple) throw new Error(`${box.box} takes one file at a time.`);
    const { result } = await page.send("Runtime.evaluate", { expression: "window.__symbiotFileBox" });
    if (!result || !result.objectId) throw new Error("Lost the page's file box. Map the page again.");
    await page.send("DOM.setFileInputFiles", { files, objectId: result.objectId });
    await page.send("Runtime.evaluate", { expression: "delete window.__symbiotFileBox" }).catch(() => {});
    return { used: `${box.box}, ${box.how}` };
  }
  return viaDialog(page, at, r, files, true);
}
// press the target and put the files in the box its file dialog was for; null when it opens
// none and `strict` is off
async function viaDialog(page, at, r, files, strict) {
  await page.send("Page.setInterceptFileChooserDialog", { enabled: true });
  try {
    const opened = page.until("Page.fileChooserOpened", 5000);
    await clickAt(page, at);
    const m = await opened.catch((e) => { if (strict) throw e; return null; }), p = (m && m.params) || {};
    if (!p.backendNodeId) { if (!strict) return null; throw new Error(`No file box on the page, and pressing "${r.label}" didn't open a file dialog. Press it, then upload with what the new map shows.`); }
    if (files.length > 1 && p.mode !== "selectMultiple") throw new Error("That file box takes one file at a time.");
    await page.send("DOM.setFileInputFiles", { files, backendNodeId: p.backendNodeId });
    return { used: "the file box the file dialog it opened was for" };
  } finally { await page.send("Page.setInterceptFileChooserDialog", { enabled: false }).catch(() => {}); }
}
// files: a path or a list of them, relative to where you are
function uploadFiles(files) {
  const list = (Array.isArray(files) ? files : [files]).filter((f) => f != null && String(f).trim()).map((f) => resolvePath(String(f)));
  if (!list.length) return { error: "Give the file to upload." };
  const bad = list.find((f) => { try { return !statSync(f).isFile(); } catch { return true; } });
  return bad ? { error: `No file at ${bad}.` } : { files: list };
}
function uploadRegion(id, regionId, files, { confirmed = false, who = "" } = {}) {
  const f = uploadFiles(files);
  return actOnRegion(id, regionId, "Upload", confirmed, () => f.error || "",
    async (page, at, r) => ({ uploaded: r.label, files: f.files, ...(await attachFiles(page, at, r, f.files)) }), who);
}

// Open the site in Symbiot's browser profile as a normal window, to sign in (or
// accept cookies) once. Close it before mapping: the profile is shared. The hidden
// browser is closed first, or the window would open in it, out of sight.
async function signIn(input) {
  const url = siteUrl(input);
  if (!url) return { error: "Give the site to sign in to: a name (gmail), a host or a web address." };
  return openSymbiotBrowser(url);
}

// ---- the Symbiot Browser --------------------------------------------------------
// Where you sign in to your sites for Symbiot: a window of its own, named and marked
// as Symbiot's, on Symbiot's browser profile (so its sign-ins are the ones the hidden
// browser reads with). It opens on its own page (browser.html, served by the app:
// your sites, signed in or not, a Sign in for each, an address bar, Done), plus the
// site asked for in a window beside it. Chrome lets one copy use a profile at a time,
// and a window asked of a hidden copy opens hidden: so any hidden copy on this profile
// is closed first, Symbiot's or a stray one (Linux, Mac).
let HUB = ""; // the app's address for that page: http://127.0.0.1:<port>/browser?t=<token>
function setBrowserHub(url) { HUB = String(url || ""); }
const browserHub = () => HUB.replace(/t=[0-9a-f]+/, "t=…"); // where it opens (the token left out)
function profilePids({ headless } = {}) {
  if (process.platform === "win32") return [];
  try {
    // -ww: the whole line, however wide. With COLUMNS set (an app started from a terminal) ps cut
    // each at 80, the profile's flag went, and Done found no window to close (2026-10-12).
    const out = spawnSync("ps", ["-ww", "-eo", "pid=,args="], { encoding: "utf8", timeout: 5000 }).stdout || "";
    return out.split("\n").map((l) => l.trim().match(/^(\d+)\s+(.*)$/)).filter(Boolean)
      .filter(([, , a]) => a.includes("--user-data-dir=" + PROFILE) && !/--type=/.test(a) && (headless === undefined || /--headless/.test(a) === headless))
      .map(([, pid]) => Number(pid)).filter((p) => p && p !== process.pid);
  } catch { return []; }
}
// SIGINT, not SIGTERM: Chrome takes SIGTERM as the computer shutting down and exits without
// writing its cookies, so a sign-in made in the 30 s before Done was lost (domains.co.za and
// cp.smsportal.com, 2026-10-14). SIGINT closes it as its own Quit does, cookies saved.
const CLOSE = "SIGINT";
const kill = (pids) => { for (const p of pids) try { process.kill(p, CLOSE); } catch {} };
async function openSymbiotBrowser(url = "") {
  const chrome = chromeBinary();
  if (!chrome) return { error: "The Symbiot Browser needs Chrome, Chromium, Edge or Brave on this computer, and none was found." };
  // the hidden browser starts and closes once first (not when a window's open already: it'd
  // hand over to it): a session sign-in from the last window is kept (keepSessions) before
  // this one, which doesn't restore the last session, drops it
  await oneAtATime(async () => { await closeBrowser(); if (process.platform !== "win32" && existsSync(PROFILE) && !profilePids({ headless: false }).length) try { await shut(await launch()); } catch {} });
  const hidden = profilePids({ headless: true }); if (hidden.length) { kill(hidden); await sleep(800); }
  try {
    mkdirSync(PROFILE, { recursive: true, mode: 0o700 });
    const base = ["--user-data-dir=" + PROFILE, "--profile-directory=" + PROFILE_DIR, "--no-first-run", "--no-default-browser-check",
      ...(process.platform === "linux" ? ["--password-store=basic", "--class=SymbiotBrowser"] : process.platform === "darwin" ? ["--use-mock-keychain"] : [])];
    const page = HUB ? ["--app=" + HUB, "--window-size=1040,820"] : [];
    // the first to start is the window's browser (the rest hand over to it): the app's, with its
    // tabs read over a pipe (pipeWindow) unless one's open already
    const piped = !!HUB && !windowOpen() && process.platform !== "win32";
    const start = (args) => { const p = spawn(chrome, piped ? ["--remote-debugging-pipe", ...args] : args, { detached: true, stdio: piped ? ["ignore", "ignore", "ignore", "pipe", "pipe"] : "ignore" }); p.on("error", () => {}); if (piped) pipeWindow(p); p.unref(); };
    if (page.length) start([...base, ...page]);
    if (url) setTimeout(() => { try { spawn(chrome, [...base, "--new-window", url], { detached: true, stdio: "ignore" }).unref(); } catch {} }, page.length ? 1500 : 0);
    if (!page.length && !url) start([...base, "--new-window", "about:blank"]);
  } catch (e) { return { error: String((e && e.message) || e) }; }
  watchWindow();
  return { ok: true, ...(url ? { url } : {}), browser: true };
}
// Done: the Symbiot Browser closes (its sign-ins are saved), so the hidden browser can read with them.
// Its windows are the visible Chromes on the profile, and the one holding the profile's lock if
// it's visible (found even where ps can't list it). One still open after a few seconds (a page
// holding it up) is closed outright: Done always closes it.
const windows = () => { const h = lockHolder(); return [...new Set([...profilePids({ headless: false }), ...(h && !h.headless && !OWN.has(h.pid) ? [h.pid] : [])])]; };
async function closeSymbiotBrowser({ wait = 8000 } = {}) {
  if (WIN) { const w = WIN; await Promise.race([w.read(), sleep(3000)]); w.save(); } // its tabs' last sessionStorage, before they go
  const open = windows();
  kill(open);
  for (const end = Date.now() + wait; Date.now() < end && windows().length;) await sleep(250);
  const left = windows(); for (const p of left) try { process.kill(p, "SIGKILL"); } catch {}
  for (let i = 0; i < 8 && windows().length; i++) await sleep(250);
  return { closed: open.length, ...(left.length ? { forced: left.length } : {}) };
}
// Closed by its X (the last of its windows), or by Done: once no window has the profile any
// more, the app is told (onBrowserClosed), so it checks your sites just as Done does. Watched
// from when it opens; a window that never came up (in `start`) tells nothing.
let CLOSED = null, WATCH = null;
function onBrowserClosed(f) { CLOSED = typeof f === "function" ? f : null; }
function watchWindow({ every = 2000, start = 30000 } = {}) {
  clearInterval(WATCH); if (!CLOSED) return;
  let seen = false; const t0 = Date.now();
  WATCH = setInterval(() => {
    if (windowOpen()) { seen = true; return; }
    if (!seen && Date.now() - t0 < start) return;
    clearInterval(WATCH); WATCH = null;
    if (seen && CLOSED) try { CLOSED(); } catch {}
  }, every);
  if (WATCH.unref) WATCH.unref();
}

export { pipeWindow, saveSessions, showScreen, fillForm, verifyPage, sessionCookie, historyPage, SESSION_COOKIE, tabKey, siteUrl, browserArgs, sandboxProxy, reducedUa, windowUa, mapPage, wholePage, readPage, readTexts, readLinkedIn, LI_READ, pagePicture, pageClip, CLIP, isSend, pressRegion, typeRegion, chooseRegion, uploadRegion, uploadFiles, attachFiles, FILE_BOX, scrollPage, SCROLLS, signIn, keepBrowserOpen, closeBrowser, browserOpen, keepSessions, SESSION_KEEP, SESSIONS, loadSessions, trustedSites, isTrusted, trustSite, untrustSite, PROFILE , openSymbiotBrowser, closeSymbiotBrowser, onBrowserClosed, scratchPage, open as openPage, evaluate, SCROLLER, watchWindow, windowOpen, lockHolder, setBrowserHub , browserHub };
