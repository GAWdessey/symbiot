// App lifecycle: the stateful bits of `symbiot app` that have regressed before.
//   1. SINGLE INSTANCE (0.32): a second `symbiot app` on the same port reuses the
//      running one instead of starting another server (several used to race the
//      one config file and split the open tabs); SYMBIOT_FORCE_NEW still starts
//      one; something else on the port isn't mistaken for Symbiot.
//   2. UPDATE CHECK (0.28.2 loop): against a fake npm registry, the app offers an
//      update only for a HIGHER version — never the one it's on, never an older
//      one — and a registry error doesn't flip that.
//   3. UPDATE & RESTART (fixed after 0.39.1): the relaunched copy takes over the same address
//      instead of finding the old app and exiting (which left nothing running); an update
//      waiting for npm's download carries on through a restart (0.63.9), and one that came
//      back on the old version says why.
//   4. ANDROID APP: with no access to shared storage, the map says so (and asks
//      for it) instead of reporting "no repos".
// Isolated HOME, random ports, a local fake registry: never touches real config,
// a running app, or npm.
//
//   node test/app.mjs
//
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "index.mjs");
const HOME = mkdtempSync(join(tmpdir(), "symbiot-app-"));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };
const port = () => 20000 + Math.floor(Math.random() * 20000);
const URL_RE = /http:\/\/127\.0\.0\.1:(\d+)\/\?t=([a-f0-9]+)/;
// The app prints its address without the token (it'd land in app.log and the journal, 15 Oct 2026): the token is read from the test's own secrets.json.
const tokenOf = (home = HOME) => { for (const f of ["secrets.json", "config.json"]) try { const t = JSON.parse(readFileSync(join(home, ".config", "symbiot", f), "utf8")).appToken; if (t) return t; } catch {} return ""; };

// A fake npm registry: GET /symbiot answers with whatever `registry.latest` is,
// or a 500 while `registry.down` is set.
const registry = { latest: "0.0.1", down: false, hits: 0, tgz404: false, heads: 0 }; // tgz404: npm lists it, its download isn't there yet
const reg = createServer((req, res) => {
  registry.hits++;
  if (registry.down || !req.url.startsWith("/symbiot")) { res.writeHead(500); res.end("down"); return; }
  if (/\.tgz$/.test(req.url)) { registry.heads++; res.writeHead(registry.tgz404 ? 404 : 200); res.end(); return; }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ name: "symbiot", "dist-tags": { latest: registry.latest } }));
});
await new Promise((r) => reg.listen(0, "127.0.0.1", r));

const PORT = port();
const env = { ...process.env, HOME, USERPROFILE: HOME, SYMBIOT_NO_OPEN: "1", SYMBIOT_NO_AUTO_UPDATE: "1", SYMBIOT_PORT: String(PORT), SYMBIOT_REGISTRY: `http://127.0.0.1:${reg.address().port}` };
for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "SYMBIOT_MODEL", "SYMBIOT_FORCE_NEW"]) delete env[k];

const children = [];
// Start `symbiot app`; resolves with its URL once it's serving, or "" if it exits
// (or stays silent) first. `out()` is everything it printed.
function startApp(extraEnv = {}, ms = 15000) {
  const child = spawn(process.execPath, [INDEX, "app"], { env: { ...env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let out = "", exited = null;
  child.stdout.on("data", (d) => { out += d; }); child.stderr.on("data", (d) => { out += d; });
  const ready = new Promise((resolve) => {
    const t = setTimeout(() => resolve(""), ms);
    child.stdout.on("data", () => { const m = out.match(/is running at http:\/\/127\.0\.0\.1:(\d+)\//); if (m) { clearTimeout(t); resolve(`http://127.0.0.1:${m[1]}/?t=${tokenOf(extraEnv.HOME)}`); } });
    child.on("exit", (code) => { exited = code; clearTimeout(t); resolve(""); });
  });
  return { child, ready, out: () => out, exited: () => exited };
}
const ping = async (base, token, q = "") => { try { const r = await fetch(`${base}/api/ping${q}`, { headers: { "x-symbiot-token": token } }); return r.ok ? await r.json() : { status: r.status }; } catch (e) { return { error: e.message }; } };

try {
  console.log("INSTANCE — a second `symbiot app` reuses the running one");
  const a = startApp();
  const urlA = await a.ready;
  ok("first app starts on the configured port", !!urlA && urlA.includes(`:${PORT}/`), a.out());
  const [, , token] = urlA.match(URL_RE) || [];
  const baseA = `http://127.0.0.1:${PORT}`;
  const before = await ping(baseA, token);

  // same HOME (=> same saved token) and same port: should find A and exit
  const t0 = Date.now();
  const b = spawnSync(process.execPath, [INDEX, "app"], { env, encoding: "utf8", timeout: 20000 });
  ok("second app exits cleanly and promptly", b.status === 0 && Date.now() - t0 < 10000, { status: b.status, ms: Date.now() - t0, err: b.stderr });
  ok("it says it's already running, at the same address, and never prints the token (what it prints lands in app.log)", /already running/.test(b.stdout) && b.stdout.includes(urlA.split("?")[0]) && !/\?t=/.test(b.stdout) && !b.stdout.includes(token), b.stdout);
  ok("it never starts a server of its own", !/is running at/.test(b.stdout), b.stdout);
  const after = await ping(baseA, token);
  ok("the first app is still the one serving (same start time)", !!before.started && after.started === before.started, { before, after });

  console.log("SCREENS DOOR — a sandboxed lane has no port, token or browser profile: the app's socket takes /api/screens and nothing else");
  {
    const { request } = await import("node:http");
    const sock = join(HOME, ".config", "symbiot", "screens", "app.sock");
    const viaSock = (path, method = "GET") => new Promise((done) => { const rq = request({ socketPath: sock, path, method }, (res) => { let t = ""; res.on("data", (d) => { t += d; }); res.on("end", () => done({ status: res.statusCode, body: t })); }); rq.on("error", (e) => done({ error: e.code })); rq.end(); });
    await new Promise((r) => setTimeout(r, 300));
    const pg = await viaSock("/api/ping"), sc = await viaSock("/api/screens"), other = await viaSock("/api/tasks"), cfg = await viaSock("/api/config");
    ok("the app listens on a socket in the screens folder, and it pings with no token", pg.status === 200 && !!JSON.parse(pg.body || "{}").version, pg);
    ok("…it lists the screens with no token", sc.status === 200 && Array.isArray(JSON.parse(sc.body || "null")), sc);
    ok("…and anything else (tasks, settings) is refused", other.status === 403 && cfg.status === 403, { other, cfg });
  }

  console.log("ONE WINDOW — a headless browser never becomes the newest window (2026-10-08: agents' screenshots of Home closed Garth's window, 'symbiot keeps crashing')");
  const pingUa = async (q, ua) => (await fetch(`${baseA}/api/ping${q}`, { headers: { "x-symbiot-token": token, ...(ua ? { "user-agent": ua } : {}) } })).json();
  const mine = await pingUa("?w=realwin01&new=1", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36");
  ok("a real window that opens is the newest", mine.window === "realwin01", mine);
  const shot = await pingUa("?w=shotwin01&new=1", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/141.0.0.0 Safari/537.36");
  ok("a headless one opening after it isn't: the real window stays the newest, so it doesn't close", shot.window === "realwin01", shot);
  const next = await pingUa("?w=realwin02&new=1", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36");
  ok("a second real window still takes over (one window, not a pile)", next.window === "realwin02", next);

  console.log("INSTANCE — SYMBIOT_FORCE_NEW=1 starts a second app anyway");
  const f = startApp({ SYMBIOT_FORCE_NEW: "1" }, 20000);
  const urlF = await f.ready; // the port is taken: it retries, then takes a free one
  ok("a forced second app starts, on a different port", !!urlF && !urlF.includes(`:${PORT}/`), f.out());
  if (urlF) { try { await fetch(urlF.replace(/\/\?t=/, "/api/quit?t=")); } catch {} }

  console.log("UPDATE — only a HIGHER npm version is offered (no update loop)");
  const pinged = await ping(baseA, token);
  const VERSION = pinged.version;
  ok("ping reports the running version", /^\d+\.\d+\.\d+/.test(VERSION || ""), pinged);
  const hits0 = registry.hits;
  registry.latest = VERSION;
  const same = await ping(baseA, token, "?fresh=1");
  ok("?fresh=1 re-checks the registry", registry.hits > hits0, { hits0, hits: registry.hits });
  ok("npm has the version you're on -> no update offered", same.latest === VERSION && same.newer === false, same);
  registry.latest = "0.0.1";
  const older = await ping(baseA, token, "?fresh=1");
  ok("npm is behind a local build -> no 'update' to an older version", older.latest === "0.0.1" && older.newer === false, older);
  const [maj, min] = VERSION.split(".").map(Number);
  const NEXT = `${maj}.${min + 1}.0`;
  registry.latest = NEXT;
  const newer = await ping(baseA, token, "?fresh=1");
  ok(`npm has ${NEXT} -> update offered`, newer.latest === NEXT && newer.newer === true, newer);
  registry.down = true;
  const down = await ping(baseA, token, "?fresh=1");
  ok("a registry error keeps the last answer (doesn't flip or crash)", down.latest === NEXT && down.newer === true, down);
  registry.down = false;

  // The relaunched copy used to find the old app still serving, open a second
  // window and exit; then the old one exited too: two "Reconnecting…" windows and
  // nothing running. SYMBIOT_UPDATE_CMD swaps the global npm install for a no-op.
  console.log("UPDATE — Update & restart leaves one app serving, on the same address");
  const UP = port();
  const u = startApp({ SYMBIOT_PORT: String(UP), SYMBIOT_UPDATE_CMD: `${JSON.stringify(process.execPath)} -e 0`, SYMBIOT_UPDATE_EVERY: "400" }, 20000);
  const urlU = await u.ready;
  const tokU = (urlU.match(URL_RE) || [])[2];
  const baseU = `http://127.0.0.1:${UP}`;
  const p0 = await ping(baseU, tokU);
  // npm lists it minutes before its download is there (0.59.0, 0.62.0, 0.63.3 gave up on that 404)
  const updPost = () => fetch(`${baseU}/api/update`, { method: "POST", headers: { "x-symbiot-token": tokU, "content-type": "application/json" }, body: "{}" }).then((r) => r.json()).catch((e) => ({ error: e.message }));
  registry.tgz404 = true;
  const upd = await updPost();
  ok("the update starts, and waits for npm's download instead of failing on its 404", upd.started === true && upd.waiting === true, upd);
  await new Promise((r) => setTimeout(r, 1000));
  const pw = await ping(baseU, tokU), upd2 = await updPost();
  ok("every window sees it waiting (no Update button), and looks again by itself", pw.updating && pw.updating.retrying && pw.updating.attempt >= 2 && registry.heads >= 2 && u.exited() === null, pw);
  ok("a second click doesn't start a second install over the first", upd2.already === true && upd2.target === upd.target, upd2);
  registry.tgz404 = false; // the download is there now: it installs and restarts
  let p1 = {};
  for (const t2 = Date.now(); Date.now() - t2 < 20000;) {
    await new Promise((r) => setTimeout(r, 300));
    p1 = await ping(baseU, tokU);
    if (p1.started && p1.started !== p0.started && u.exited() !== null) break;
  }
  ok("the old app exits", u.exited() === 0, { exited: u.exited(), out: u.out() });
  ok("a new app is serving the same address", !!p1.started && p1.started !== p0.started, { p0, p1 });
  await new Promise((r) => setTimeout(r, 1500)); // a copy that bowed out would be gone by now
  const p2 = await ping(baseU, tokU);
  ok("and it stays up", !!p2.started && p2.started === p1.started, { p1, p2 });
  // the no-op install changed nothing, so it's back on the same version: it says so, and why,
  // rather than offering the same update again (the 0.28.2 loop) or leaving the page to guess
  ok("back on the old version after an install: the update is marked failed, with why", p2.updateFailed && p2.updateFailed.target === upd.target && /installed/.test(p2.updateFailed.error || "") && !p2.updating && p2.version === p0.version, p2);
  try { await fetch(`${baseU}/api/quit`, { headers: { "x-symbiot-token": tokU } }); } catch {}
  await new Promise((r) => setTimeout(r, 800));

  // On a phone, Termux's Symbiot holds 7391, so the app's own runs on another port; its
  // relaunch after an update waited for 7391 only and exited, leaving nothing running.
  console.log("UPDATE — an app on another port (its own taken) relaunches on that port");
  const HELD = port(), holder = createServer((q, r) => { r.writeHead(404); r.end(); });
  await new Promise((r) => holder.listen(HELD, "127.0.0.1", r));
  const o = startApp({ SYMBIOT_PORT: String(HELD), SYMBIOT_UPDATE_CMD: `${JSON.stringify(process.execPath)} -e 0`, SYMBIOT_UPDATE_EVERY: "400" }, 30000);
  const urlO = await o.ready, [, portO, tokO] = urlO.match(URL_RE) || [], baseO = `http://127.0.0.1:${portO}`;
  ok("its port taken by something else: it serves on another", !!urlO && Number(portO) !== HELD, o.out());
  const o0 = await ping(baseO, tokO);
  await fetch(`${baseO}/api/update`, { method: "POST", headers: { "x-symbiot-token": tokO, "content-type": "application/json" }, body: "{}" }).catch(() => {});
  let o1 = {};
  for (const t2 = Date.now(); Date.now() - t2 < 25000;) { await new Promise((r) => setTimeout(r, 300)); o1 = await ping(baseO, tokO); if (o1.started && o1.started !== o0.started && o.exited() !== null) break; }
  await new Promise((r) => setTimeout(r, 1500));
  const o2 = await ping(baseO, tokO);
  ok("after Update & restart a new app serves that same port, and stays up", o.exited() === 0 && !!o1.started && o1.started !== o0.started && o2.started === o1.started, { o0, o1, o2, out: o.out().slice(-400) });
  try { await fetch(`${baseO}/api/quit`, { headers: { "x-symbiot-token": tokO } }); } catch {}
  holder.close(); await new Promise((r) => setTimeout(r, 800));

  // 0.63.9 (2026-10-12): Update & restart waited for npm's download, the app restarted
  // meanwhile, and the wait (kept only in memory) was gone: npm never ran, and the page
  // said the update "didn't take". Now where it got to is on disk, and a restart carries on.
  console.log("UPDATE — a restart while it waits for npm's download carries on with the update");
  const RS = port();
  const w1 = startApp({ SYMBIOT_PORT: String(RS), SYMBIOT_UPDATE_CMD: `${JSON.stringify(process.execPath)} -e 0`, SYMBIOT_UPDATE_EVERY: "400" }, 20000);
  const urlW = await w1.ready, tokW = (urlW.match(URL_RE) || [])[2], baseW = `http://127.0.0.1:${RS}`;
  await ping(baseW, tokW, "?fresh=1");
  registry.tgz404 = true;
  const wu = await fetch(`${baseW}/api/update`, { method: "POST", headers: { "x-symbiot-token": tokW, "content-type": "application/json" }, body: "{}" }).then((r) => r.json()).catch((e) => ({ error: e.message }));
  const wp = await ping(baseW, tokW);
  ok("(it's waiting for the download)", wu.waiting === true && wp.updating && wp.updating.retrying, { wu, wp });
  try { await fetch(`${baseW}/api/quit`, { headers: { "x-symbiot-token": tokW } }); } catch {}
  for (let i = 0; i < 40 && w1.exited() === null; i++) await new Promise((r) => setTimeout(r, 100));
  const w2 = startApp({ SYMBIOT_PORT: String(RS), SYMBIOT_UPDATE_CMD: `${JSON.stringify(process.execPath)} -e 0`, SYMBIOT_UPDATE_EVERY: "400" }, 20000);
  const urlW2 = await w2.ready, tokW2 = (urlW2.match(URL_RE) || [])[2];
  // the first look at npm's download runs as it starts: on a slow runner (CI) a single ping
  // could land before it's marked waiting, so look for a few seconds, like the loops around it
  let wq = {};
  for (const t3 = Date.now(); Date.now() - t3 < 5000;) { wq = await ping(baseW, tokW2); if (wq.updating && wq.updating.retrying) break; await new Promise((r) => setTimeout(r, 200)); }
  ok("the app started again is still waiting for it, from the same start (not a fresh 20 minutes)", wq.updating && wq.updating.retrying && wq.updating.target === wu.target && wq.updating.since === wp.updating.since, wq);
  registry.tgz404 = false;
  let wr = {};
  for (const t3 = Date.now(); Date.now() - t3 < 20000;) { await new Promise((r) => setTimeout(r, 300)); wr = await ping(baseW, tokW2); if (wr.started && wr.started !== wq.started && w2.exited() !== null) break; }
  ok("…and once the download is there, it installs and restarts by itself", w2.exited() === 0 && !!wr.started && wr.started !== wq.started, { exited: w2.exited(), wr });
  try { await fetch(`${baseW}/api/quit`, { headers: { "x-symbiot-token": tokW2 } }); } catch {}

  // A release waited for a click on Update & restart, sometimes for hours. With nothing
  // running, it now installs and restarts by itself, once, and doesn't loop on a no-op install.
  console.log("UPDATE — with no agent working, Symbiot updates itself");
  const AU = port();
  rmSync(join(HOME, ".config", "symbiot", "update.json"), { force: true }); // the update above failed on 0.64.0: that one isn't retried by itself
  const a1 = startApp({ SYMBIOT_PORT: String(AU), SYMBIOT_NO_AUTO_UPDATE: "", SYMBIOT_UPDATE_CMD: `${JSON.stringify(process.execPath)} -e 0`, SYMBIOT_AUTO_EVERY: "300", SYMBIOT_AUTO_SETTLE: "700" }, 20000);
  const urlA1 = await a1.ready, tokA1 = (urlA1.match(URL_RE) || [])[2], baseA1 = `http://127.0.0.1:${AU}`;
  const q0 = await ping(baseA1, tokA1, "?fresh=1");
  let q1 = {};
  for (const t4 = Date.now(); Date.now() - t4 < 20000;) { await new Promise((r) => setTimeout(r, 300)); q1 = await ping(baseA1, tokA1); if (q1.started && q1.started !== q0.started && a1.exited() !== null) break; }
  ok("no click: it installs and restarts by itself, on the same address", a1.exited() === 0 && !!q1.started && q1.started !== q0.started && /Updating to .* by itself: no agent is working/.test(a1.out()), { exited: a1.exited(), q0, q1, out: a1.out().slice(-600) });
  await new Promise((r) => setTimeout(r, 2500));
  const q2 = await ping(baseA1, tokA1);
  ok("…and an install that didn't change the version isn't tried again by itself (no restart loop)", q2.started === q1.started && q2.updateFailed && !q2.updating, q2);
  try { await fetch(`${baseA1}/api/quit`, { headers: { "x-symbiot-token": tokA1 } }); } catch {}
  await new Promise((r) => setTimeout(r, 600));

  // quit the first app; a fresh `symbiot app` must then start normally
  try { await fetch(`${baseA}/api/quit`, { headers: { "x-symbiot-token": token } }); } catch {}
  await new Promise((r) => setTimeout(r, 600));
  console.log("INSTANCE — something else on the port isn't mistaken for Symbiot");
  const other = createServer((req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
  const OTHER = port();
  await new Promise((r) => other.listen(OTHER, "127.0.0.1", r));
  const c = startApp({ SYMBIOT_PORT: String(OTHER) }, 20000);
  const urlC = await c.ready;
  ok("a non-Symbiot server answering 200 doesn't stop the app starting", !!urlC && !/already running/.test(c.out()), c.out());
  if (urlC) { try { await fetch(urlC.replace(/\/\?t=/, "/api/quit?t=")); } catch {} }
  other.close();

  console.log("INSTANCE — a Symbiot that answers late (restarting after an update) still isn't doubled");
  { // 2026-10-08: a launch as 0.57.6 relaunched itself found the port busy and no answer yet, and ran a second app on a random port
    const LATE = port(), t0 = Date.now();
    const late = createServer((req, res) => { const go = () => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ version: "9.9.9" })); }; if (Date.now() - t0 < 2500) setTimeout(go, 1500); else go(); });
    await new Promise((r) => late.listen(LATE, "127.0.0.1", r));
    const l = startApp({ SYMBIOT_PORT: String(LATE) }, 20000);
    const urlL = await l.ready;
    for (let i = 0; i < 40 && l.exited() === null; i++) await new Promise((r) => setTimeout(r, 250));
    ok("it opens that one and exits, never a second app on another port", !urlL && l.exited() === 0 && /already running \(v9\.9\.9\)/.test(l.out()) && !/is running at/.test(l.out()), [l.exited(), l.out()]);
    if (urlL) { try { await fetch(urlL.replace(/\/\?t=/, "/api/quit?t=")); } catch {} }
    late.close();
  }

  console.log("INSTANCE — an app too busy to answer still holds its lock: no second app");
  { // 2026-10-08: the first app took too long to answer the ping, and a second started on a random port
    const BUSY = port(), holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1e9)"], { stdio: "ignore" }); children.push(holder);
    writeFileSync(join(HOME, ".config", "symbiot", `app-${BUSY}.lock`), JSON.stringify({ pid: holder.pid, port: BUSY, at: Date.now() }));
    const h = startApp({ SYMBIOT_PORT: String(BUSY) }, 20000);
    const urlH = await h.ready;
    for (let i = 0; i < 40 && h.exited() === null; i++) await new Promise((r) => setTimeout(r, 250));
    ok("it says one is running, and exits without serving", !urlH && h.exited() === 0 && /already running \(pid \d+, busy right now\)/.test(h.out()) && !/is running at/.test(h.out()), [h.exited(), h.out()]);
    holder.kill("SIGKILL"); await new Promise((r) => setTimeout(r, 300));
    const n = startApp({ SYMBIOT_PORT: String(BUSY) }, 20000), urlN = await n.ready;
    ok("once that app is gone (a crash), the next start takes its lock over and serves", !!urlN && urlN.includes(`:${BUSY}/`), n.out());
    if (urlN) { try { await fetch(urlN.replace(/\/\?t=/, "/api/quit?t=")); } catch {} }
  }

  console.log("ANDROID APP — the map says when it can't see shared storage");
  // Without "All files access" the app sees shared storage as an empty folder;
  // that used to read as "no repos", and stayed that way after access was allowed.
  const shared = mkdtempSync(join(tmpdir(), "symbiot-shared-"));
  const d = startApp({ SYMBIOT_FORCE_NEW: "1", SYMBIOT_PORT: String(port()), SYMBIOT_ANDROID_APP: "1", SYMBIOT_SCAN_HOME: shared }, 20000);
  const urlD = await d.ready;
  ok("the app starts with SYMBIOT_ANDROID_APP=1", !!urlD, d.out());
  if (urlD) {
    const [, portD, tokenD] = urlD.match(URL_RE);
    const map = async () => (await (await fetch(`http://127.0.0.1:${portD}/api/map`, { headers: { "x-symbiot-token": tokenD } })).json()).stats;
    const blocked = await map();
    ok("empty shared storage is reported as no access", blocked.noStorage === true && blocked.android === true, blocked);
    mkdirSync(join(shared, "Download"));
    const allowed = await map();
    ok("once it can list shared storage, the next scan says so", allowed.noStorage === false, allowed);
    try { await fetch(urlD.replace(/\/\?t=/, "/api/quit?t=")); } catch {}
  }
  rmSync(shared, { recursive: true, force: true });

  console.log("TERMUX — the map also scans the homes of Termux's proot-distro Linuxes");
  // Projects worked on in `proot-distro login debian` live under
  // $PREFIX/var/lib/proot-distro/installed-rootfs/debian/root, outside Termux's home.
  const prefix = mkdtempSync(join(tmpdir(), "symbiot-prefix-")), thome = mkdtempSync(join(tmpdir(), "symbiot-thome-"));
  const proj = join(prefix, "var", "lib", "proot-distro", "installed-rootfs", "debian", "root", "work", "proj");
  mkdirSync(join(prefix, "var", "lib", "proot-distro", "installed-rootfs", "debian", "home", "garth"), { recursive: true });
  mkdirSync(proj, { recursive: true });
  writeFileSync(join(proj, "a.js"), "1\n");
  spawnSync("git", ["init", "-q", proj]);
  spawnSync("git", ["-C", proj, "-c", "user.name=t", "-c", "user.email=t@t", "add", "."]);
  spawnSync("git", ["-C", proj, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "one"]);
  // Claude Code run inside the distro keeps its history in the distro's homes,
  // under the distro's own paths: one session there records its cwd, one doesn't.
  const debian = join(prefix, "var", "lib", "proot-distro", "installed-rootfs", "debian");
  const hist = (home, enc, line) => { mkdirSync(join(debian, home, ".claude", "projects", enc), { recursive: true }); writeFileSync(join(debian, home, ".claude", "projects", enc, "s.jsonl"), line + "\n"); };
  hist("root", "-root-work-proj", JSON.stringify({ type: "user", cwd: "/root/work/proj" }));
  mkdirSync(join(debian, "srv", "app"), { recursive: true }); spawnSync("git", ["init", "-q", join(debian, "srv", "app")]);
  hist(join("home", "garth"), "-srv-app", JSON.stringify({ type: "user" }));
  const t = startApp({ SYMBIOT_FORCE_NEW: "1", SYMBIOT_PORT: String(port()), SYMBIOT_SCAN_HOME: thome, PREFIX: prefix }, 20000);
  const urlT = await t.ready;
  ok("the app starts with a proot-distro under $PREFIX", !!urlT, t.out());
  if (urlT) {
    const [, portT, tokenT] = urlT.match(URL_RE);
    const get = async (p) => (await fetch(`http://127.0.0.1:${portT}${p}`, { headers: { "x-symbiot-token": tokenT } })).json();
    const sr = await get("/api/scanroots"), rootfs = join(prefix, "var", "lib", "proot-distro", "installed-rootfs", "debian");
    ok("its /root and /home/<user> are default scan folders, after your home", sr.effective.join() === [thome, join(rootfs, "root"), join(rootfs, "home", "garth")].join(), sr);
    const g = await get("/api/map");
    ok("a repo in the distro's /root is on the map, which lists every folder it scanned", g.stats.repos === 1 && g.nodes.some((n) => n.type === "repo" && n.label === "proj") && g.stats.roots.length === 3, g.stats);
    const pn = g.nodes.find((n) => n.id === "repo:" + proj), an = g.nodes.find((n) => n.id === "repo:" + join(debian, "srv", "app"));
    ok("Claude Code's history inside the distro gives its repo the agent badge", !!(pn && pn.meta.agents && pn.meta.agents[0].agent === "Claude Code"), pn);
    ok("a project the distro's Claude Code worked on outside its homes is on the map too, at its real path", !!(an && an.meta.agentOnly && an.meta.agents[0].agent === "Claude Code"), g.nodes.filter((n) => n.meta && n.meta.agentOnly));
    try { await fetch(urlT.replace(/\/\?t=/, "/api/quit?t=")); } catch {}
  }
  rmSync(prefix, { recursive: true, force: true }); rmSync(thome, { recursive: true, force: true });
} finally {
  for (const ch of children) { try { ch.kill("SIGKILL"); } catch {} }
  reg.close();
  rmSync(HOME, { recursive: true, force: true });
}
{
  console.log("ONE WINDOW — in the page: a headless browser takes no part, and the window you're in never closes itself");
  const { EMBEDDED_UI } = await import("../ui.mjs");
  const uiJs = [...EMBEDDED_UI.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const grab = (name) => { const i = uiJs.indexOf("function " + name + "("); let depth = 0, j = uiJs.indexOf("{", i); for (; j < uiJs.length; j++) { if (uiJs[j] === "{") depth++; else if (uiJs[j] === "}" && --depth === 0) break; } return uiJs.slice(i, j + 1); };
  const idLine = (uiJs.match(/^var WIN_ID=.*$/m) || [""])[0].replace(/\/\/ read from.*$/, "");
  const page = ({ ua = "Mozilla/5.0 Chrome/141.0", webdriver = false, search = "", focused = false } = {}) => {
    const closed = { n: 0 }, timers = [];
    const window = { navigator: { userAgent: ua, webdriver }, close: () => { closed.n++; } };
    const document = { hasFocus: () => focused, body: { appendChild: () => {} }, createElement: () => ({}) };
    const run = new Function("window", "document", "location", "$", "setTimeout", `${grab("winHeadless")}\n${grab("winOld")}\n${idLine}\nreturn { WIN_ID, winOld };`);
    const r = run(window, document, { search }, () => null, (f) => timers.push(f));
    return { ...r, closed, bar: () => { timers.forEach((f) => f()); } };
  };
  ok("the page has its window code to test", !!idLine && grab("winHeadless").length > 20 && grab("winOld").length > 20, idLine);
  ok("a real window has an id", /^[a-z0-9]{6,}$/.test(page().WIN_ID), page().WIN_ID);
  ok("a headless browser (an agent's screenshot) has none, so it never claims to be the newest", page({ ua: "Mozilla/5.0 HeadlessChrome/141.0" }).WIN_ID === "", "");
  ok("nor does a driven one (navigator.webdriver)", page({ webdriver: true }).WIN_ID === "", "");
  ok("nor Away's", page({ search: "?away=1&n=1" }).WIN_ID === "", "");
  const away = page({ focused: false }); away.winOld();
  ok("an older window you're not in closes itself", away.closed.n === 1, away.closed);
  const inUse = page({ focused: true }); inUse.winOld();
  ok("the window you're in doesn't: it says a newer one is open, and can take over", inUse.closed.n === 0, inUse.closed);
}
{
  console.log("A PHONE'S HOME — paired with your computer: what needs you and its tasks, the rest one tap away");
  const { EMBEDDED_UI } = await import("../ui.mjs");
  const uiJs = [...EMBEDDED_UI.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const grab = (name) => { const i = uiJs.indexOf("function " + name + "("); let depth = 0, j = uiJs.indexOf("{", i); for (; j < uiJs.length; j++) { if (uiJs[j] === "{") depth++; else if (uiJs[j] === "}" && --depth === 0) break; } return uiJs.slice(i, j + 1); };
  const navLine = (uiJs.match(/^var PH_NAV=.*$/m) || [""])[0];
  const home = (h) => {
    const els = {}, el = (id) => (els[id] = els[id] || { id, innerHTML: "", style: {}, querySelectorAll: () => [], contains: () => false, appendChild: () => {} });
    const cls = new Set(), calls = { labels: 0, load: 0 };
    const document = { body: { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } }, querySelector: () => null, createElement: () => el("phyou"), activeElement: null };
    const run = new Function("document", "$", "LQ", "LQNAMES", "esc", "sameHtml", "lqLabels", "loadComputer", "PCV", `${navLine}\n${grab("lqPhone")}\n${grab("phYou")}\nreturn { on: lqPhone(${JSON.stringify(h)}) };`);
    const LQ = {}, r = run(document, el, LQ, { settings: "Settings", reports: "Reports", board: "Dashboard", map: "Map", week: "Week", standup: "Standup", marketing: "Marketing", tasks: "Workdesk" }, (x) => String(x), (e, x) => { e.innerHTML = x; return false; }, () => { calls.labels++; }, () => { calls.load++; }, null);
    return { ...r, cls, calls, LQ, nav: els.phnav ? els.phnav.innerHTML : "", you: els.phyou ? els.phyou.innerHTML : "" };
  };
  ok("the page has its phone home to test", !!navLine && grab("lqPhone").length > 50 && grab("phYou").length > 50, navLine);
  const comp = { name: "pop-os", asks: 1, approves: 1, tasks: 4 };
  const ph = home({ computer: comp, you: [{ kind: "setup", id: "setup:ai", urgent: true, title: "Connect an AI", sub: "x" }, { kind: "setup", id: "setup:folders", title: "No projects found", sub: "y" }, { kind: "ask", id: "ask:/p", title: "symbiot asks", sub: "Which plan?" }], feeds: [{ id: "feed:reports", count: 2 }] });
  ok("a paired phone gets the list, not the liquid: no droplets, the computer's view fetched", ph.on === true && ph.cls.has("lq-phone") && ph.LQ.phone === true && Array.isArray(ph.LQ.drops) && ph.LQ.drops.length === 0 && ph.calls.labels === 1 && ph.calls.load === 1, [ph.on, [...ph.cls], ph.calls]);
  ok("the rest is one row: Settings and Reports first, new reports counted, no empty Workdesk, no Marketing until it's on", /^<button[^>]*data-s='settings'/.test(ph.nav) && /data-s='reports' class='lit'>Reports <b>2<\/b>/.test(ph.nav) && !/data-s='tasks'/.test(ph.nav) && !/marketing/.test(ph.nav), ph.nav);
  ok("what this phone needs: its question as it is, its setup together in one row, amber when any of it is urgent", /Needs you on this phone &middot; 2/.test(ph.you) && /symbiot asks/.test(ph.you) && /class='phyi urgent'[^>]*><b>2 things to set up<\/b><span>Connect an AI · No projects found/.test(ph.you), ph.you);
  const mk = home({ computer: comp, you: [], marketing: { needs: 3 } });
  ok("Marketing once it's on, lit with what needs you there; nothing for the phone itself, no heading", /data-s='marketing' class='lit'>Marketing <b>3<\/b>/.test(mk.nav) && mk.you === "", [mk.nav, mk.you]);
  const pc = home({ you: [] });
  ok("a computer (or a phone not paired) keeps the liquid", pc.on === false && !pc.cls.has("lq-phone") && pc.calls.load === 0, [pc.on, [...pc.cls]]);
  ok("the computer's droplet, opened on a paired phone, is its home", /function lqPool\(shape\)\{if\(shape==='computer'&&LQ\.phone\)\{lqSink\(\);return;\}/.test(uiJs), "");
}
{
  console.log("LOW GPU — the liquid draws seldom when asked, and whenever its window isn't the one in use");
  const { EMBEDDED_UI } = await import("../ui.mjs");
  const uiJs = [...EMBEDDED_UI.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const gl = ({ low = false, focused = true, dpr = 2 } = {}) => {
    const store = { "symbiot-lowgpu": low ? "1" : "0" }, body = { cls: new Set(), classList: { toggle: (c, on) => (on ? body.cls.add(c) : body.cls.delete(c)) } };
    const window = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, devicePixelRatio: dpr, matchMedia: () => ({ matches: false }) };
    const document = { hasFocus: () => focused, body };
    const src = uiJs.slice(uiJs.indexOf("var GLSOFT=false"), uiJs.indexOf("function lqGL("));
    return new Function("window", "document", "$", `${src}\nreturn { glLight, glEvery, glDpr, glLow, low: () => GLLOW };`)(window, document, () => null);
  };
  const on = gl({ low: true }), off = gl(), away = gl({ focused: false });
  ok("Low GPU (kept on this computer): drawn seldom, at half the resolution", on.glLight() && on.glEvery(false) === 12 && on.glDpr(3) === 0.5);
  ok("without it, in the window you're using: every frame, at the screen's sharpness", !off.glLight() && off.glEvery(false) === 1 && off.glDpr(3) === 2);
  ok("a window you aren't using draws seldom too, whatever you picked", away.glLight() && away.glEvery(true) === 3);
  off.glLow(true); ok("the switch turns it on and remembers it", off.low() && off.glLight());
  ok("the page has the switch, and drops the blur behind the glass with it", /id="lqlow"/.test(EMBEDDED_UI) && /body\.lq-low \*[^{]*\{backdrop-filter:none!important/.test(EMBEDDED_UI));
}
{
  console.log("APPROVE — opens on the project you came for, its button first, its tasks short");
  const { EMBEDDED_UI } = await import("../ui.mjs");
  const lp = EMBEDDED_UI.slice(EMBEDDED_UI.indexOf("function loadPending("), EMBEDDED_UI.indexOf("function loadArchived("));
  ok("in a project, only its card; the others a click away", /r\.repo===repo0/.test(lp) && /Also waiting for your OK/.test(lp) && /PENDALL=true/.test(lp));
  ok("three tasks shown, one line each, the rest folded", /RTASKS/.test(lp) && /rmore hidden/.test(lp) && /\.rcard \.rtask \.t\{-webkit-line-clamp:1\}/.test(EMBEDDED_UI));
  ok("the Approve button comes right under the card's head", /h=top\+bsel\+act\+body/.test(lp));
}
console.log(`\n${fail ? "✗" : "✓"} app: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
