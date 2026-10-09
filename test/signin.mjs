// A sign-in kept only in a session cookie (domains.co.za's PHPSESSID, no "remember me")
// survives the Sign in window closing: the hidden browser restores the last session and
// keeps each session cookie for 12 hours (headless.mjs keepSessions); one kept in a tab's
// sessionStorage comes along too (the restored tab's, filled into the hidden one). Needs a Chromium-
// family browser (CI has Chrome); without one it says so and passes.
//
//   node test/signin.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
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
ok("the hidden browser restores the last session; the Sign in window doesn't", h.browserArgs(true).includes("--restore-last-session") && !h.browserArgs(false, "https://x.org/").includes("--restore-last-session"), "");
if (!chromeBinary()) console.log("  - no Chrome here: the rest skipped");
else {
  // the site: /login signs you in with a session cookie, every page's title says what cookies came
  // (once: a tab the last session left, opened again, mustn't sign in afresh and hide a loss)
  // /ss-login signs you in in sessionStorage instead (once too), and /app's title says what it finds there
  let logins = 0, ssLogins = 0;
  const srv = createServer((q, r) => {
    r.writeHead(200, { "content-type": "text/html", ...(q.url === "/login" && !logins++ ? { "set-cookie": "PHPSESSID=abc123; Path=/; HttpOnly" } : {}) });
    if (q.url === "/ss-login") return r.end("<title>in</title>" + (!ssLogins++ ? "<script>sessionStorage.setItem('token', 'tok-ss')</script>" : ""));
    if (q.url === "/app") return r.end("<title>none</title><script>document.title = sessionStorage.getItem('token') || 'signed out'</script>");
    r.end("<title>" + (q.headers.cookie || "signed out") + "</title><p>hi</p>");
  }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  const base = "http://127.0.0.1:" + srv.address().port;
  // the Sign in window, as Chrome runs it: Symbiot's profile, no session restore (here headless,
  // with a pipe only to close it as you would and to read its cookies)
  const windowLike = async (url, look = false) => {
    const args = h.browserArgs(true, url).filter((x) => x !== "--restore-last-session");
    const p = spawn(chromeBinary(), args, { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
    let id = 1, buf = Buffer.alloc(0); const wait = new Map();
    p.stdio[4].on("data", (d) => { buf = Buffer.concat([buf, d]); for (let e; (e = buf.indexOf(0)) >= 0; buf = buf.subarray(e + 1)) { let m; try { m = JSON.parse(buf.subarray(0, e)); } catch { continue; } if (m.id && wait.has(m.id)) { wait.get(m.id)(m.result || {}); wait.delete(m.id); } } });
    const send = (method, params = {}) => new Promise((res) => { const i = id++; wait.set(i, res); p.stdio[3].write(JSON.stringify({ id: i, method, params }) + "\0"); });
    await sleep(2500);
    const cookies = look ? ((await send("Storage.getCookies")).cookies || []) : null;
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
    ok("…and so is the next Sign in window: it's kept for 12 hours, no longer a session cookie", c && c.value === "abc123" && !c.session && left > h.SESSION_KEEP - 600 && left <= h.SESSION_KEEP + 5, c);
    const again = await h.readPage(base + "/inbox");
    ok("…and the hidden browser after that window too", /PHPSESSID=abc123/.test((again && again.title) || ""), again);
    await windowLike(base + "/ss-login"); // a site that signs you in in sessionStorage, and the window closed
    const ss1 = await h.readPage(base + "/app");
    ok("a sign-in kept in sessionStorage: the hidden browser has it after the window closes", ss1 && ss1.title === "tok-ss", ss1);
    const ss2 = await h.readPage(base + "/app");
    ok("…and in its next run too, kept 12 hours, in the profile only", ss2 && ss2.title === "tok-ss" && Object.keys(h.loadSessions()).join() === base, [ss2, Object.keys(h.loadSessions())]);
    const other = await h.readPage("http://localhost:" + srv.address().port + "/app");
    ok("…and no other site's page gets it", other && other.title === "signed out", other);
  } finally { srv.close(); await h.closeBrowser(); }
}
rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log((fail ? "✗" : "✓") + " signin: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
