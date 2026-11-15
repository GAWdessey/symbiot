// Symbiot's server is started again after it dies out of memory, stays up afterwards, and
// stops for good on a stop, a clean exit or a gone keeper (keepup.mjs). Real processes.
//   node test/keepup.mjs                       (holds 6 s after the restart)
//   KEEPUP_HOLD_MS=600000 node test/keepup.mjs (holds 10 minutes: the long proof)
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const K = await import("../keepup.mjs");
const DIR = mkdtempSync(join(tmpdir(), "symbiot-keepup-"));
const KEEPUP = fileURLToPath(new URL("../keepup.mjs", import.meta.url)).replace(/\\/g, "/");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOLD = Number(process.env.KEEPUP_HOLD_MS) || 6000;

// A server like Symbiot's: answers /ping with its pid; /oom fills the heap until Node aborts.
const SERVER = join(DIR, "server.mjs");
writeFileSync(SERVER, `import http from "node:http";
import { watchParent } from ${JSON.stringify("file://" + (KEEPUP.startsWith("/") ? "" : "/") + KEEPUP)};
watchParent();
const keep = [];
const s = http.createServer((q, r) => {
  if (q.url === "/oom") { r.end("ok"); setTimeout(() => { for (;;) keep.push(new Array(1e5).fill(Math.random())); }, 50); return; }
  r.end(JSON.stringify({ pid: process.pid }));
});
s.listen(Number(process.env.PORT), "127.0.0.1");
`);
const CRASHER = join(DIR, "crash.mjs");
writeFileSync(CRASHER, "process.abort();\n");
// A keeper of its own (so it can be killed outright): prints its server's pid.
const KEEPER = join(DIR, "keeper.mjs");
writeFileSync(KEEPER, `import { keepUp } from ${JSON.stringify("file://" + (KEEPUP.startsWith("/") ? "" : "/") + KEEPUP)};
keepUp({ script: ${JSON.stringify(SERVER)}, heap: 64, log: () => {}, onChild: (c) => console.log("child " + c.pid) });
`);

const PORT = 22000 + (process.pid % 3000);
const ping = async (port = PORT) => { try { const r = await fetch(`http://127.0.0.1:${port}/ping`, { signal: AbortSignal.timeout(2000) }); return (await r.json()).pid; } catch { return 0; } };
const until = async (f, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await sleep(150); } return 0; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

try {
  console.log("1) HEAP, CRASHES AND WHEN IT RUNS");
  const G = 1024 * 1048576;
  ok("16 GB of memory: 4096 MB of heap", K.heapMb({ total: 16 * G, dflt: 2096 * 1048576 }) === 4096);
  ok("2 GB of memory: never below Node's own default", K.heapMb({ total: 2 * G, dflt: 2096 * 1048576 }) === 2096);
  ok("out of memory (134), a kill, a segfault, SIGABRT and a Windows crash are crashes", [K.crashed(134, null), K.crashed(137, null), K.crashed(139, null), K.crashed(null, "SIGABRT"), K.crashed(null, "SIGKILL"), K.crashed(0xC0000409, null), K.crashed(3, null, "win32")].every(Boolean));
  ok("a clean exit, an error exit and a stop are not", ![K.crashed(0, null), K.crashed(1, null), K.crashed(3, null, "linux"), K.crashed(null, "SIGTERM"), K.crashed(null, "SIGINT"), K.crashed(null, "SIGHUP")].some(Boolean));
  ok("runs a keeper normally; not in its own server, a sandbox, or when switched off", K.wanted({}) && !K.wanted({ SYMBIOT_KEPT: "1" }) && !K.wanted({ SYMBIOT_SANDBOX: "/tmp/x" }) && !K.wanted({ SYMBIOT_NO_KEEPUP: "1" }) && K.wanted({ SYMBIOT_KEPT: "" }));

  console.log("2) DIES OUT OF MEMORY, COMES BACK, AND STAYS UP");
  const logs = []; let child = null;
  const kept = K.keepUp({ script: SERVER, env: { ...process.env, PORT: String(PORT) }, heap: 64, delay: 300, log: (l) => logs.push(l), handleSignals: false, onChild: (c) => { child = c; } });
  const pid1 = await until(() => ping());
  ok("the server answers", pid1 > 0, pid1);
  const t0 = Date.now(); await fetch(`http://127.0.0.1:${PORT}/oom`).catch(() => {});
  const pid2 = await until(async () => { const p = await ping(); return p && p !== pid1 ? p : 0; }, 30000);
  ok("after it dies out of memory a new server answers", pid2 > 0 && pid2 !== pid1, { pid1, pid2 });
  ok("the restart is logged with why", logs.some((l) => /stopped \((out of memory|signal SIGABRT)/.test(l) && /starting it again/.test(l)), logs);
  console.log(`    (back ${Date.now() - t0} ms after the crash; now holding ${Math.round(HOLD / 1000)} s)`);
  let misses = 0, n = 0; const h0 = Date.now();
  while (Date.now() - h0 < HOLD) { n++; if ((await ping()) !== pid2) misses++; await sleep(1000); }
  ok(`it holds: ${n} pings over ${Math.round(HOLD / 1000)} s, every one answered by the same server`, misses === 0 && n > 0, { misses, n });
  child.kill("SIGTERM");
  const code = await Promise.race([kept, sleep(10000).then(() => "hung")]);
  ok("a stop is not restarted: the keeper ends", code === 0 && !(await ping()), code);

  console.log("3) A SERVER THAT KEEPS DYING IS GIVEN UP ON");
  const logs2 = [];
  const code2 = await Promise.race([K.keepUp({ script: CRASHER, max: 2, delay: 50, log: (l) => logs2.push(l), handleSignals: false }), sleep(20000).then(() => "hung")]);
  ok("after 2 restarts the third death ends it, with exit 1", code2 === 1 && logs2.length === 3 && /not starting it again/.test(logs2[2]), { code2, logs2 });

  console.log("4) A KEEPER KILLED OUTRIGHT TAKES ITS SERVER WITH IT");
  const PORT2 = PORT + 1;
  const keeper = spawn(process.execPath, [KEEPER], { env: { ...process.env, PORT: String(PORT2) }, stdio: ["ignore", "pipe", "inherit"] });
  let out = ""; keeper.stdout.on("data", (d) => { out += d; });
  const spid = await until(() => { const m = /child (\d+)/.exec(out); return m ? Number(m[1]) : 0; });
  ok("its server answers", spid > 0 && (await until(() => ping(PORT2))) === spid, { spid, out });
  keeper.kill("SIGKILL");
  const gone = await until(() => !alive(spid), 10000);
  ok("its server ends too: no orphan left serving", gone && !(await ping(PORT2)), { spid });
  if (alive(spid)) try { process.kill(spid); } catch {}
} finally { rmSync(DIR, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
