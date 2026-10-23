// symbiot — the app's background work, in one place. It was some 25 setIntervals started at boot in
// server.mjs, each with its own try/catch that dropped the error, and a busy flag on a few: nothing said
// what ran when, how long it took, whether it failed, or that one was still going when the next began.
// Each job here has a name, how often it runs, and a state: idle, running, or last failed (with what it
// said, kept). A job never runs twice at once: a tick while it's still going is skipped and counted.
// timersState() is what /api/timers shows.
const JOBS = new Map();

function every(name, ms, fn, { first = null, clock = { setInterval, setTimeout, clearInterval } } = {}) {
  const j = { name, every: ms, runs: 0, fails: 0, skipped: 0, running: false, last: 0, took: 0, error: "", errorAt: 0 };
  const done = (e) => {
    j.running = false; j.took = Date.now() - j.last; j.runs++;
    if (e) { j.fails++; j.error = String((e && e.message) || e).slice(0, 300); j.errorAt = Date.now(); }
  };
  const tick = () => {
    if (j.running) { j.skipped++; return; }
    j.running = true; j.last = Date.now();
    let p; try { p = fn(); } catch (e) { done(e); return; }
    if (p && typeof p.then === "function") p.then(() => done(), (e) => done(e)); else done();
  };
  if (first !== null) { const t = clock.setTimeout(tick, first); if (t && t.unref) t.unref(); }
  const iv = clock.setInterval(tick, ms); if (iv && iv.unref) iv.unref();
  JOBS.set(name, { j, tick, stop: () => clock.clearInterval(iv) });
  return j;
}
// Run one now (a test, or a nudge), as its own tick would: skipped while it's going.
function runNow(name) { const x = JOBS.get(name); if (!x) return false; x.tick(); return true; }
function stopAll() { for (const x of JOBS.values()) x.stop(); JOBS.clear(); }
// Each job's state, for /api/timers: state is "running", "failed" (its last run threw) or "idle".
function timersState(now = Date.now()) {
  return [...JOBS.values()].map(({ j }) => ({ name: j.name, every: j.every, runs: j.runs, fails: j.fails, skipped: j.skipped, last: j.last, took: j.took,
    state: j.running ? "running" : j.error && j.errorAt >= j.last ? "failed" : "idle", ...(j.error ? { error: j.error, errorAt: j.errorAt } : {}), ...(j.running ? { since: now - j.last } : {}) }));
}

export { every, runNow, stopAll, timersState };
