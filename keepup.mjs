// Symbiot's server kept up. On 30 Oct 2026 (07:05 UTC) the app's server reached Node's
// default heap limit (2 GB here), died with "JavaScript heap out of memory", and every
// window showed "Reconnecting to Symbiot…": the autostart unit has Restart=no, so nothing
// brought it back until it was started by hand (07:11, app.log). On 15 Nov the server
// was at 2.1 GB of resident memory four hours after boot, so the same death was close.
//
// So `symbiot app` runs the server as a child with more heap (half the machine's memory,
// at most 4 GB, never less than Node's own default) and starts it again when it dies of a
// crash (an out-of-memory abort, a kill by the system's OOM killer, a segfault). A clean
// exit (Quit, an update's relaunch, "already running") ends this too, and a stop from
// systemd or Ctrl+C is passed on to the server and never restarted. At most 5 restarts in
// 10 minutes, so a server that dies on start doesn't loop forever.
import { spawn } from "node:child_process";
import { totalmem } from "node:os";
import { getHeapStatistics } from "node:v8";

const KEPT = "SYMBIOT_KEPT"; // set in the server child: it serves, and doesn't start a keeper of its own
const STOPS = new Set(["SIGTERM", "SIGINT", "SIGHUP"]);

// Heap for the server in MB: half the memory, capped at 4 GB, never below Node's default.
function heapMb({ total = totalmem(), dflt = getHeapStatistics().heap_size_limit } = {}) {
  const want = Math.min(4096, Math.floor(total / 2 / 1048576));
  return Math.max(Math.ceil(dflt / 1048576), want);
}

// A death worth a restart: a signal nobody sent to stop it, or the exit codes of an abort
// (134, Node's out-of-memory), a kill (137), a segfault (139), or a Windows crash (3, or a crash status).
function crashed(code, signal, platform = process.platform) {
  if (signal) return !STOPS.has(signal);
  return code === 134 || code === 137 || code === 139 || (typeof code === "number" && code >= 0xC0000000) || (platform === "win32" && code === 3); // abort() on Windows exits 3
}

// Whether to run the server under a keeper here. Not in the child itself, not when told
// not to (SYMBIOT_NO_KEEPUP=1), and not in a throwaway sandbox (its parent watches it).
function wanted(env = process.env) {
  return env[KEPT] !== "1" && env.SYMBIOT_NO_KEEPUP !== "1" && !env.SYMBIOT_SANDBOX;
}

// Run `script args` with Node and the heap above, restarting it after a crash.
// Resolves with the exit code to leave with. log(line) says each restart and why.
function keepUp({ script, args = [], env = process.env, heap = heapMb(), log = (l) => console.error(l), max = 5, window = 10 * 60 * 1000, delay = 2000, execPath = process.execPath, onChild = null, handleSignals = true } = {}) {
  return new Promise((resolve) => {
    const deaths = []; let child = null, stopping = false;
    const pass = (sig) => { stopping = true; if (child && child.exitCode === null) try { child.kill(sig); } catch {} };
    const sigs = handleSignals ? [...STOPS].filter((s) => process.platform !== "win32" || s !== "SIGHUP") : [];
    for (const s of sigs) process.on(s, pass);
    const done = (code) => { for (const s of sigs) process.off(s, pass); resolve(code); };
    const start = () => {
      child = spawn(execPath, [`--max-old-space-size=${heap}`, script, ...args], { env: { ...env, [KEPT]: "1" }, stdio: ["inherit", "inherit", "inherit", "ipc"], windowsHide: true }); // the channel: the server ends when this keeper does (watchParent)
      if (onChild) onChild(child);
      child.on("error", (e) => { log(`Symbiot's server couldn't start: ${e.message}`); done(1); });
      child.on("exit", (code, signal) => {
        if (stopping || !crashed(code, signal)) return done(signal ? 0 : code ?? 0);
        const now = Date.now(); deaths.push(now); while (deaths.length && now - deaths[0] > window) deaths.shift();
        const why = signal ? `signal ${signal}` : code === 134 ? "out of memory or an abort (exit 134)" : `exit ${code}`;
        if (deaths.length > max) { log(`Symbiot's server stopped (${why}), the ${deaths.length}th time in ${Math.round(window / 60000)} minutes: not starting it again. Open Symbiot to start it.`); return done(1); }
        log(`Symbiot's server stopped (${why}); starting it again in ${Math.round(delay / 1000)} s (restart ${deaths.length} of ${max} in ${Math.round(window / 60000)} minutes).`);
        setTimeout(() => { if (!stopping) start(); else done(0); }, delay);
      });
    };
    start();
  });
}

// In the server: a line in the log when the heap passes 80% of its limit (at most every
// 10 minutes), so the next out-of-memory says how it got there.
function watchHeap({ every = 60000, quiet = 10 * 60 * 1000, log = (l) => console.error(l) } = {}) {
  let said = 0;
  const t = setInterval(() => {
    const h = getHeapStatistics(), used = h.used_heap_size, lim = h.heap_size_limit;
    if (used > 0.8 * lim && Date.now() - said > quiet) { said = Date.now(); log(`memory: the server's heap is at ${Math.round(used / 1048576)} MB of ${Math.round(lim / 1048576)} MB`); }
  }, every);
  if (t.unref) t.unref();
  return t;
}

// In the server: end when its keeper is gone (killed outright, so it couldn't pass a stop
// on), rather than serve on as an orphan nobody restarts or stops.
function watchParent(proc = process) {
  if (!proc.channel) return false;
  proc.on("disconnect", () => proc.exit(0));
  if (proc.channel.unref) proc.channel.unref(); // the channel alone never keeps the server running
  return true;
}

export { keepUp, heapMb, crashed, wanted, watchHeap, watchParent, KEPT };
