// A sign-in kept only in a session cookie (domains.co.za's PHPSESSID, no "remember me")
// survives the Sign in window closing: the hidden browser restores the last session and
// keeps each session cookie for 14 days, put ahead again at every start (headless.mjs keepSessions); one kept in a tab's
// sessionStorage comes along too (the restored tab's, filled into the hidden one). Needs a Chromium-
// family browser (CI has Chrome); without one it says so and passes.
//
//   node test/signin.mjs
//
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-signin-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { chromeBinary } = await import("../core.mjs");
const h = await import("../headless.mjs");
console.log("SIGN-IN — a session-only sign-in outlives the Sign in window");
ok("every Symbiot browser opens the same profile in it, by name: Chrome's last-used one took over (2026-10-13)", [h.browserArgs(true), h.browserArgs(false, "https://x.org/")].every((a) => a.includes("--profile-directory=Default")) && h.PROFILE_DIR === "Default", h.browserArgs(true));
{
  const env = { HTTPS_PROXY: "http://u%40x:p%3Aw@localhost:3128", NO_PROXY: "localhost,10.0.0.0/8" };
  const px = h.sandboxProxy(env);
  ok("in a lane sandbox the hidden browser is given the sandbox's proxy, credentials kept apart (it had no network: ERR_INTERNET_DISCONNECTED, 2026-10-15)", px && px.server === "http://localhost:3128" && px.user === "u@x" && px.pass === "p:w" && px.bypass === "localhost;10.0.0.0/8", px);
  ok("no proxy variable, no proxy flag; the Sign in window never gets one", h.sandboxProxy({}) === null && h.sandboxProxy({ ALL_PROXY: "socks5h://a:b@localhost:1080" }) === null && !h.browserArgs(false, "https://x.org/").some((x) => /proxy-server/.test(x)), "");
}
ok("the hidden browser restores the last session; the Sign in window doesn't", h.browserArgs(true).includes("--restore-last-session") && !h.browserArgs(false, "https://x.org/").includes("--restore-last-session"), "");
{
  const f = join(HOME, "ss-test.json"), o = "https://cp.smsportal.com", now = Date.now();
  h.saveSessions([{ origin: o, items: { "__auth-token": "T", a: "1" } }, { origin: o, items: { "__auth-token": "", a: "2" } }], now, f);
  const got = h.loadSessions(now, f)[o];
  ok("two tabs of one site: the token beats the login tab's empty one, else the later read", got && got.items["__auth-token"] === "T" && got.items.a === "2", got);
  h.saveSessions([{ origin: o, items: { "__auth-token": "", b: "3" } }], now, f, { merge: true });
  ok("a tab the last session left, its token empty: what's kept is kept (it may be another tab)", (h.loadSessions(now, f)[o] || {}).items["__auth-token"] === "T" && h.loadSessions(now, f)[o].items.b === "3", h.loadSessions(now, f));
  h.saveSessions([{ origin: o, items: { "__auth-token": "", b: "3" }, emptied: ["__auth-token"] }], now, f, { merge: true });
  ok("…but one the window saw signed out there (its token emptied) empties it", h.loadSessions(now, f)[o].items["__auth-token"] === "" && h.loadSessions(now, f)[o].items.b === "3", h.loadSessions(now, f));
  h.saveSessions([{ origin: o, items: { "__auth-token": "T2" } }], now, f);
  h.saveSessions([{ origin: o, items: { b: "3" }, emptied: ["__auth-token"] }], now, f, { merge: true });
  ok("…or dropped", !("__auth-token" in h.loadSessions(now, f)[o].items), h.loadSessions(now, f));
  h.saveSessions([{ origin: o, items: { "__auth-token": "T3" } }], now, f);
  h.saveSessions([{ origin: o, items: { "__auth-token": "" } }], now, f);
  ok("…and the hidden browser's own tab, filled from what's kept, is taken as it is", h.loadSessions(now, f)[o].items["__auth-token"] === "", h.loadSessions(now, f));
  const big = "x".repeat(40000);
  for (let i = 0; i < 6; i++) h.saveSessions([{ origin: "https://s" + i + ".example", items: { k: big } }], now + i, f);
  const kept = Object.keys(h.loadSessions(now + 9, f));
  ok("too much in all: the sites kept longest ago go, not every sign-in", kept.length >= 3 && !kept.includes("https://s0.example") && kept.includes("https://s5.example"), kept);
  h.saveSessions([{ origin: "https://huge.example", items: { k: "x".repeat(150000) } }], now + 10, f);
  ok("…and one too big to be a sign-in isn't kept", !h.loadSessions(now + 11, f)["https://huge.example"] && Object.keys(h.loadSessions(now + 11, f)).includes("https://s5.example"), Object.keys(h.loadSessions(now + 11, f)));
}
if (!chromeBinary()) console.log("  - no Chrome here: the rest skipped");
else {
  // the site: /login signs you in with a session cookie, every page's title says what cookies came
  // (once: a tab the last session left, opened again, mustn't sign in afresh and hide a loss)
  // /ss-login signs you in in sessionStorage instead (once too), and /app's title says what it finds there
  // /quick signs you in with a cookie meant to last a day, and /quick-ss in sessionStorage (once each)
  // /ss-tab signs you in in sessionStorage as SMS Portal does (once), its login page an empty token; /tab says what it finds
  let logins = 0, ssLogins = 0, quick = 0, quickSs = 0, tabLogins = 0;
  const srv = createServer((q, r) => {
    if (q.url === "/ss-tab") { r.writeHead(200, { "content-type": "text/html" }); return r.end("<title>in</title><script>sessionStorage.setItem('__auth-token', " + (!tabLogins++ ? "'tok-tab'" : "''") + ")</script>"); }
    if (q.url === "/tab") { r.writeHead(200, { "content-type": "text/html" }); return r.end("<title>none</title><script>document.title = sessionStorage.getItem('__auth-token') || 'signed out'</script>"); }
    if (q.url === "/quick-ss") { r.writeHead(200, { "content-type": "text/html" }); return r.end("<title>in</title>" + (!quickSs++ ? "<script>sessionStorage.setItem('token', 'tok-quick')</script>" : "")); }
    r.writeHead(200, { "content-type": "text/html", ...(q.url === "/login" && !logins++ ? { "set-cookie": "PHPSESSID=abc123; Path=/; HttpOnly" } : q.url === "/quick" && !quick++ ? { "set-cookie": "QUICK=q1; Path=/; Max-Age=86400" } : {}) });
    if (q.url === "/ss-login") return r.end("<title>in</title>" + (!ssLogins++ ? "<script>sessionStorage.setItem('token', 'tok-ss')</script>" : ""));
    if (q.url === "/app") return r.end("<title>none</title><script>document.title = sessionStorage.getItem('token') || 'signed out'</script>");
    r.end("<title>" + (q.headers.cookie || "signed out") + "</title><p>hi</p>");
  }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const base = "http://127.0.0.1:" + srv.address().port;
  // the Sign in window, as Chrome runs it: Symbiot's profile, no session restore (here headless,
  // with a pipe only to close it as you would and to read its cookies)
  const windowLike = async (url, look = false, act = null) => {
    const args = h.browserArgs(true, url).filter((x) => x !== "--restore-last-session");
    const p = spawn(chromeBinary(), args, { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
    let id = 1, buf = Buffer.alloc(0); const wait = new Map();
    p.stdio[4].on("data", (d) => { buf = Buffer.concat([buf, d]); for (let e; (e = buf.indexOf(0)) >= 0; buf = buf.subarray(e + 1)) { let m; try { m = JSON.parse(buf.subarray(0, e)); } catch { continue; } if (m.id && wait.has(m.id)) { wait.get(m.id)(m.result || {}); wait.delete(m.id); } } });
    const send = (method, params = {}) => new Promise((res) => { const i = id++; wait.set(i, res); p.stdio[3].write(JSON.stringify({ id: i, method, params }) + "\0"); });
    await sleep(2500);
    const cookies = look ? ((await send("Storage.getCookies")).cookies || []) : null;
    if (act) await act(send, cookies);
    await send("Browser.close"); await new Promise((r) => (p.exitCode !== null ? r() : p.on("exit", r)));
    return cookies;
  };
  try {
    await windowLike(base + "/login"); // you sign in, and close the window
    const read = await h.readPage(base + "/inbox");
    ok("after the window closes, the hidden browser is still signed in", /PHPSESSID=abc123/.test((read && read.title) || ""), read);
    const later = await windowLike(base + "/inbox", true); // the window again, for another site
    const c = (later || []).find((x) => x.name === "PHPSESSID");
    const left = c ? c.expires - Date.now() / 1000 : 0;
    ok("…and so is the next Sign in window: it's kept for 14 days, no longer a session cookie", c && c.value === "abc123" && !c.session && h.SESSION_KEEP === 14 * 86400 && left > h.SESSION_KEEP - 600 && left <= h.SESSION_KEEP + 5, c);
    // a day or two on, it's nearly run out (it ended 12 hours in, used or not: 2026-10-14)
    const { name, value, domain, path, secure, httpOnly } = c;
    await windowLike(base + "/inbox", true, (send) => send("Storage.setCookies", { cookies: [{ name, value, domain, path, secure, httpOnly, expires: Math.floor(Date.now() / 1000) + 3600 }] }));
    await h.readPage(base + "/inbox"); await h.closeBrowser();
    const renewed = ((await windowLike(base + "/inbox", true)) || []).find((x) => x.name === "PHPSESSID"), left2 = renewed ? renewed.expires - Date.now() / 1000 : 0;
    ok("…and put 14 days ahead again each time the hidden browser starts, so a sign-in in use never runs out", renewed && renewed.value === "abc123" && left2 > h.SESSION_KEEP - 600, [renewed, left2]);
    const again = await h.readPage(base + "/inbox");
    ok("…and the hidden browser after that window too", /PHPSESSID=abc123/.test((again && again.title) || ""), again);
    // a second profile, last used, as a Google sign-in in the window made one (2026-10-13)
    await h.closeBrowser();
    const ls = join(h.PROFILE, "Local State"), st = JSON.parse(readFileSync(ls, "utf8"));
    st.profile = { ...(st.profile || {}), last_used: "Profile 1", last_active_profiles: ["Profile 1"], info_cache: { ...((st.profile || {}).info_cache || {}), "Profile 1": { name: "Someone else" } } };
    writeFileSync(ls, JSON.stringify(st)); mkdirSync(join(h.PROFILE, "Profile 1"), { recursive: true });
    const second = await h.readPage(base + "/inbox");
    ok("Chrome's last-used profile another one: Symbiot still opens its own, signed in", /PHPSESSID=abc123/.test((second && second.title) || ""), second);
    await windowLike(base + "/ss-login"); // a site that signs you in in sessionStorage, and the window closed
    const ss1 = await h.readPage(base + "/app");
    ok("a sign-in kept in sessionStorage: the hidden browser has it after the window closes", ss1 && ss1.title === "tok-ss", ss1);
    const ss2 = await h.readPage(base + "/app");
    ok("…and in its next run too, kept 14 days, in the profile only", ss2 && ss2.title === "tok-ss" && Object.keys(h.loadSessions()).join() === base, [ss2, Object.keys(h.loadSessions())]);
    const other = await h.readPage("http://localhost:" + srv.address().port + "/app");
    ok("…and no other site's page gets it", other && other.title === "signed out", other);
    // Done pressed straight after signing in, as you do: Done closes the window itself
    // (closeSymbiotBrowser), not the window's own Quit. With SIGTERM, Chrome quit without
    // writing the last 30 s of cookies, and the sign-in was gone (domains.co.za, 2026-10-14).
    await h.closeBrowser();
    const visible = (url) => spawn(chromeBinary(), [...(process.env.SYMBIOT_TEST_NO_SANDBOX ? ["--no-sandbox"] : []), "--ozone-platform=headless", ...h.browserArgs(false, url)], { stdio: "ignore" });
    for (const [path, page, want, what] of [["/quick", "/inbox", /QUICK=q1/, "a cookie"], ["/quick-ss", "/app", /^tok-quick$/, "sessionStorage"]]) {
      const win = visible(base + path);
      for (let i = 0; i < 40 && !h.windowOpen(); i++) await sleep(150);
      await sleep(1500); // signed in, and Done a moment later
      const done = await h.closeSymbiotBrowser();
      await Promise.race([new Promise((r) => (win.exitCode !== null || win.signalCode ? r() : win.once("exit", r))), sleep(3000)]);
      const read = await h.readPage(base + page);
      ok(`signed in (${what}) and Done at once: the hidden browser has the sign-in, the window having quit cleanly`, done.closed >= 1 && !done.forced && want.test((read && read.title) || ""), { done, read });
      await h.closeBrowser();
    }
    // SMS Portal keeps its sign-in in the tab's sessionStorage only: you sign in, close its tab
    // (or its window), and click Done. Gone with the tab, every check read its login page
    // (2026-10-14). The app's window is read over its pipe while it's open (pipeWindow).
    const win = spawn(chromeBinary(), [...(process.env.SYMBIOT_TEST_NO_SANDBOX ? ["--no-sandbox"] : []), "--ozone-platform=headless", "--remote-debugging-pipe", ...h.browserArgs(false, base + "/ss-tab")], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
    const w = h.pipeWindow(win, { every: 300 });
    for (let i = 0; i < 40 && ![...w.reads.values()].some((x) => x.items["__auth-token"]); i++) await sleep(150);
    const { targetInfos = [] } = await w.c.send("Target.getTargets"), signedIn = targetInfos.find((t) => t.type === "page" && t.url.endsWith("/ss-tab"));
    await w.c.send("Target.createTarget", { url: base + "/ss-tab" }); // its login page in another tab: an empty token
    await sleep(1200);
    await w.c.send("Target.closeTarget", { targetId: signedIn.targetId }); // the signed-in tab closed
    await sleep(600);
    const doneTab = await h.closeSymbiotBrowser();
    await Promise.race([new Promise((r) => (win.exitCode !== null || win.signalCode ? r() : win.once("exit", r))), sleep(3000)]);
    const tab = await h.readPage(base + "/tab");
    ok("a sign-in kept in a tab's sessionStorage, its tab closed before Done: the hidden browser has it", doneTab.closed >= 1 && tab && tab.title === "tok-tab", { doneTab, tab });
    await h.closeBrowser();
  } finally { srv.close(); await h.closeBrowser(); }

  // A site that ties a sign-in to the browser it was made in (domains.co.za, 2026-10-12): it
  // keeps the User-Agent and client hints the sign-in came with, and drops the sign-in at
  // the first request that has others. The tab the window was on when it closed comes back
  // in the hidden browser's restored session, and loads at once.
  let bound = null, dropped = "", sawHeadless = false, boundLogins = 0;
  const who = (q) => (q.headers["user-agent"] || "") + " | " + (q.headers["sec-ch-ua"] || "no client hints");
  const srv2 = createServer((q, r) => {
    if (/HeadlessChrome/.test(who(q))) sawHeadless = true;
    if (q.url === "/favicon.ico") return r.end();
    const has = /BOUND=xyz/.test(q.headers.cookie || "");
    if (q.url === "/login" && !boundLogins++) { bound = who(q); r.writeHead(200, { "content-type": "text/html", "set-cookie": "BOUND=xyz; Path=/; HttpOnly" }); return r.end("<title>in</title>"); }
    if (has && bound && who(q) !== bound && !dropped) dropped = who(q);
    r.writeHead(200, { "content-type": "text/html" });
    r.end("<title>" + (has && !dropped ? "in" : "signed out") + "</title><script>document.title += navigator.webdriver ? ' (driven)' : ''</script>");
  }).listen(0, "127.0.0.1");
  await new Promise((r) => srv2.on("listening", r));
  const base2 = "http://127.0.0.1:" + srv2.address().port;
  try {
    const ua = h.windowUa(chromeBinary());
    ok("the window's User-Agent is read from the browser's version, and says Chrome", /^Mozilla\/5\.0 \(.+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0 Safari\/537\.36/.test(ua), ua);
    ok("…and the hidden browser starts with it", h.browserArgs(true, "about:blank", ua).includes("--user-agent=" + ua) && !h.browserArgs(false, "https://x.org/", ua).some((x) => /^--user-agent/.test(x)), "");
    // the window: a real one sends its own User-Agent and client hints, as this does
    const win = h.browserArgs(true, base2 + "/login", ua).filter((x) => x !== "--restore-last-session");
    const p = spawn(chromeBinary(), win, { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
    await sleep(2500);
    p.stdio[3].write(JSON.stringify({ id: 1, method: "Browser.close" }) + "\0"); await new Promise((r) => (p.exitCode !== null ? r() : p.on("exit", r)));
    ok("(the window signed in, with client hints)", bound && !/no client hints|HeadlessChrome/.test(bound), bound);
    const read = await h.readPage(base2 + "/dashboard");
    ok("a sign-in tied to the browser survives into the hidden one, restored tab and all", read && read.title === "in" && !dropped, { read, bound, dropped });
    ok("…which never says HeadlessChrome, nor that it's driven", !sawHeadless && read && !/driven/.test(read.title), { sawHeadless, title: read && read.title });
  } finally { srv2.close(); await h.closeBrowser(); }
}
rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log((fail ? "✗" : "✓") + " signin: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
