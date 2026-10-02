// App lifecycle: the stateful bits of `symbiot app` that have regressed before.
//   1. SINGLE INSTANCE (0.32): a second `symbiot app` on the same port reuses the
//      running one instead of starting another server (several used to race the
//      one config file and split the open tabs); SYMBIOT_FORCE_NEW still starts
//      one; something else on the port isn't mistaken for Symbiot.
//   2. UPDATE CHECK (0.28.2 loop): against a fake npm registry, the app offers an
//      update only for a HIGHER version — never the one it's on, never an older
//      one — and a registry error doesn't flip that.
// Isolated HOME, random ports, a local fake registry: never touches real config,
// a running app, or npm.
//
//   node test/app.mjs
//
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
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
} finally {
  for (const ch of children) { try { ch.kill("SIGKILL"); } catch {} }
  reg.close();
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} app: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
