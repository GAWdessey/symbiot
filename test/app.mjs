// App lifecycle: the stateful bits of `symbiot app` that have regressed before.
//   1. SINGLE INSTANCE (0.32): a second `symbiot app` on the same port reuses the
//      running one instead of starting another server (several used to race the
//      one config file and split the open tabs); SYMBIOT_FORCE_NEW still starts
//      one; something else on the port isn't mistaken for Symbiot.
//   2. UPDATE CHECK (0.28.2 loop): against a fake npm registry, the app offers an
//      update only for a HIGHER version — never the one it's on, never an older
//      one — and a registry error doesn't flip that.
//   3. UPDATE & RESTART (fixed after 0.39.1): the relaunched copy takes over the same address
//      instead of finding the old app and exiting (which left nothing running).
//   4. ANDROID APP: with no access to shared storage, the map says so (and asks
//      for it) instead of reporting "no repos".
// Isolated HOME, random ports, a local fake registry: never touches real config,
// a running app, or npm.
//
//   node test/app.mjs
//
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "index.mjs");
const HOME = mkdtempSync(join(tmpdir(), "symbiot-app-"));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };
const port = () => 20000 + Math.floor(Math.random() * 20000);
const URL_RE = /http:\/\/127\.0\.0\.1:(\d+)\/\?t=([a-f0-9]+)/;

// A fake npm registry: GET /symbiot answers with whatever `registry.latest` is,
// or a 500 while `registry.down` is set.
const registry = { latest: "0.0.1", down: false, hits: 0 };
const reg = createServer((req, res) => {
  registry.hits++;
  if (registry.down || !req.url.startsWith("/symbiot")) { res.writeHead(500); res.end("down"); return; }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ name: "symbiot", "dist-tags": { latest: registry.latest } }));
});
await new Promise((r) => reg.listen(0, "127.0.0.1", r));

const PORT = port();
const env = { ...process.env, HOME, USERPROFILE: HOME, SYMBIOT_NO_OPEN: "1", SYMBIOT_PORT: String(PORT), SYMBIOT_REGISTRY: `http://127.0.0.1:${reg.address().port}` };
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
    child.stdout.on("data", () => { const m = out.match(URL_RE); if (m && /is running at/.test(out)) { clearTimeout(t); resolve(m[0]); } });
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
  ok("it says it's already running, at the same address", /already running/.test(b.stdout) && b.stdout.includes(urlA), b.stdout);
  ok("it never starts a server of its own", !/is running at/.test(b.stdout), b.stdout);
  const after = await ping(baseA, token);
  ok("the first app is still the one serving (same start time)", !!before.started && after.started === before.started, { before, after });

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
  const u = startApp({ SYMBIOT_PORT: String(UP), SYMBIOT_UPDATE_CMD: `${JSON.stringify(process.execPath)} -e 0` }, 20000);
  const urlU = await u.ready;
  const tokU = (urlU.match(URL_RE) || [])[2];
  const baseU = `http://127.0.0.1:${UP}`;
  const p0 = await ping(baseU, tokU);
  const upd = await fetch(`${baseU}/api/update`, { method: "POST", headers: { "x-symbiot-token": tokU, "content-type": "application/json" }, body: "{}" }).then((r) => r.json()).catch((e) => ({ error: e.message }));
  ok("the update starts", upd.started === true, upd);
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
  try { await fetch(`${baseU}/api/quit`, { headers: { "x-symbiot-token": tokU } }); } catch {}

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
console.log(`\n${fail ? "✗" : "✓"} app: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
