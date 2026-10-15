// symbiot — Estimate: how long a running agent has left, as a range ("5–15 min").
// Garth asked for it with the step line on Home (2026-10-08): steve and argena had
// run for half an hour and nothing said whether that was nearly done or barely
// started. A run's length comes from its lane's own past runs, read from that lane's
// agent.log (each "=== name time ===" header, its "$ command" line and the run's
// final result, which carries duration_ms), and from the runs Symbiot saw end
// (durations.json: lane, kind, the task it was on, how long). Like for like first:
// the same lane and kind of task, then the same lane, then the same kind anywhere.
// A run that answers questions ("The user has answered…") is a different kind from
// one that takes a brief, and is never mixed with it. What's queued in the lane adds
// its own runs to the total.

import { join, basename, dirname } from "node:path";
import { statSync, openSync, readSync, closeSync, readFileSync } from "node:fs";
import { CONFIG_DIR, writeJsonAtomic } from "./core.mjs";

// 400 rows is the routing window (route.mjs), about two days of runs; the spend beyond that
// lives in a per-day roll-up (costs-days.json, DAYS_KEEP days). Both written atomically,
// yours only (0600): each row carries the task's words, and a plain write cut short read
// back as nothing (15 Oct 2026).
const FILE = join(CONFIG_DIR, "durations.json"), COSTS = join(CONFIG_DIR, "costs.json"), DAYS = join(CONFIG_DIR, "costs-days.json"), KEEP = 400, MIN_SAMPLES = 3, DAYS_KEEP = 90;
const save = (file, v) => { try { writeJsonAtomic(file, v, { mode: 0o600, indent: 0 }); } catch {} };
const kindOf = (cmd) => (/The user has answered|has answered:/i.test(String(cmd || "")) ? "answer" : "brief");

// A log's finished runs: [{ at, kind, ms }]. Read once and then only what's been added
// since (a lane's log grows by the second while its agent works); a log that shrank
// (rotated to agent.log.old) is read afresh.
const LOGS = new Map();
function runsInLog(file) {
  let st; try { st = statSync(file); } catch { return []; }
  let c = LOGS.get(file);
  if (!c || st.size < c.size) c = { size: 0, rest: "", runs: [], cur: null };
  if (st.size > c.size) {
    let fd; try { fd = openSync(file, "r"); } catch { return c.runs; }
    try {
      for (let pos = c.size; pos < st.size;) {
        const b = Buffer.alloc(Math.min(1 << 20, st.size - pos)); readSync(fd, b, 0, b.length, pos); pos += b.length;
        const lines = (c.rest + b.toString("utf8")).split("\n"); c.rest = lines.pop();
        for (const l of lines) take(c, l);
      }
    } catch {} finally { try { closeSync(fd); } catch {} }
    c.size = st.size; LOGS.set(file, c);
  }
  return c.runs;
}
function take(c, l) {
  const h = l.match(/^=== .* (\d{4}-\d\d-\d\dT[\d:.]+Z) ===$/);
  if (h) { c.cur = { at: Date.parse(h[1]), kind: "brief", cmdNext: true }; return; }
  if (!c.cur) return;
  if (c.cur.cmdNext) { c.cur.cmdNext = false; if (l.startsWith("$ ")) { c.cur.kind = kindOf(l); return; } }
  if (!l.startsWith("{") || !l.includes('"type":"result"') || l.length > 200000) return;
  let e; try { e = JSON.parse(l); } catch { return; }
  if (e && e.type === "result" && !e.is_error && e.duration_ms > 0) { c.runs.push({ at: c.cur.at, kind: c.cur.kind, ms: e.duration_ms }); c.cur = null; }
}
function laneRuns(path) { return [...runsInLog(join(path, ".symbiot", "agent.log.old")), ...runsInLog(join(path, ".symbiot", "agent.log"))]; }

function loadDurations(file = FILE) { try { const a = JSON.parse(readFileSync(file, "utf8")); return Array.isArray(a) ? a : []; } catch { return []; } }
// A run Symbiot saw end: its lane, kind, the task it was on (its first open one), how long.
function noteDuration({ path, cmd, task = "", ms }, file = FILE) {
  if (!path || !(ms > 0)) return;
  const a = loadDurations(file); a.push({ path, kind: kindOf(cmd), task: String(task).slice(0, 200), ms: Math.round(ms), at: Date.now() });
  save(file, a.slice(-KEEP));
}

// Every run's spend, finished or failed (route.mjs reads it: path, cost, ok), so what
// per-task model routing saves can be measured against a baseline.
function loadCosts(file = COSTS) { return loadDurations(file); }
function noteCost({ path, cmd, task = "", model = "", cost = null, turns = null, ms = 0, ok = true, modelUsage = null, now = Date.now() }, file = COSTS, days = file === COSTS ? DAYS : join(dirname(file), basename(file, ".json") + "-days.json")) {
  if (!path || typeof cost !== "number") return;
  const row = { at: now, path, kind: kindOf(cmd), task: String(task).slice(0, 200), model: String(model || ""), cost, turns, ms: Math.round(ms) || 0, ok: !!ok, modelUsage };
  const a = loadCosts(file); a.push(row);
  save(file, a.slice(-KEEP));
  rollDay(row, days);
}
// The day's totals (local date): runs, spend, time, and the same by model and by lane (the
// folder's name; an ops run's folder is one "ops"), kept DAYS_KEEP days.
const dayKey = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const laneOf = (path) => (/\/drafts\/act-[0-9a-f]+$/.test(path) ? "ops" : basename(path));
function loadCostDays(file = DAYS) { try { const o = JSON.parse(readFileSync(file, "utf8")); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; } }
function rollDay(row, file = DAYS) {
  const o = loadCostDays(file), k = dayKey(row.at), d = o[k] || { n: 0, cost: 0, ms: 0, failed: 0, byModel: {}, byLane: {}, byKind: {} };
  const add = (m, key) => { const x = m[key] || { n: 0, cost: 0 }; x.n++; x.cost = Math.round((x.cost + row.cost) * 10000) / 10000; m[key] = x; };
  d.n++; d.cost = Math.round((d.cost + row.cost) * 10000) / 10000; d.ms += row.ms; if (!row.ok) d.failed++;
  add(d.byModel, row.model || "?"); add(d.byLane, laneOf(row.path)); add(d.byKind, row.kind);
  o[k] = d;
  const keep = Object.keys(o).sort().slice(-DAYS_KEEP), kept = {}; for (const x of keep) kept[x] = o[x];
  save(file, kept);
}

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
// minutes, as people say them: 1–10 as they are, then to the nearest 5, then to the nearest 15 past an hour
const mins = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m <= 10 ? m : m <= 60 ? Math.round(m / 5) * 5 : Math.round(m / 15) * 15; };
const span = (lo, hi) => { const a = mins(lo), b = Math.max(mins(hi), a); const f = (m) => (m >= 60 ? (m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`) : `${m}`); return a === b ? `about ${f(a)}${a >= 60 && !(a % 60) ? "" : " min"}` : `${f(a)}–${f(b)}${b >= 60 && !(b % 60) ? "" : " min"}`; };

// The sets of past lengths to go on, like for like first: [{ ms: [..], from }].
function sampleSets({ path, kind = "brief", type = "", typeOf = () => "", durations = loadDurations(), runs = null } = {}) {
  const own = durations.filter((d) => d.path === path), log = runs || laneRuns(path), sets = [];
  if (type) sets.push({ ms: own.filter((d) => d.kind === kind && typeOf(d.task) === type).map((d) => d.ms), from: "lane+type" });
  sets.push({ ms: log.filter((r) => r.kind === kind).map((r) => r.ms), from: "lane+kind" });
  sets.push({ ms: log.map((r) => r.ms), from: "lane" });
  if (type) sets.push({ ms: durations.filter((d) => d.kind === kind && typeOf(d.task) === type).map((d) => d.ms), from: "type" });
  return sets.map((x) => ({ ...x, ms: x.ms.slice(-30) }));
}
// How long it has left: { left: "5–15 min", lo, hi (ms), from, queued, total: with
// what's queued behind it }. Judged on the past runs that lasted longer than this one
// has so far (a run already 20 minutes in isn't one of the 1-minute replies), from the
// first set with enough of them. Past nearly all of them: { over, usual: "5–25 min" }.
// null with too little to go on. queued: tasks held for the lane's next run
// (TASKS.next.md), which is one more run however many tasks it holds.
function estimate({ path, kind = "brief", type = "", typeOf, elapsed = 0, queued = 0, durations, runs } = {}) {
  const sets = sampleSets({ path, kind, type, typeOf, durations, runs });
  let out = null;
  for (const st of sets) {
    const left = st.ms.filter((m) => m > elapsed).map((m) => m - elapsed);
    if (left.length < MIN_SAMPLES) continue;
    const lo = Math.max(q(left, 0.25), 60000), hi = Math.max(q(left, 0.75), lo);
    out = { left: span(lo, hi), lo: Math.round(lo), hi: Math.round(hi), from: st.from }; break;
  }
  if (!out) {
    const all = sets.find((st) => st.ms.length >= MIN_SAMPLES && st.from === "lane") || sets.find((st) => st.ms.length >= MIN_SAMPLES);
    if (!all) return null;
    return { over: true, usual: span(q(all.ms, 0.25), q(all.ms, 0.75)), from: all.from };
  }
  if (queued > 0) {
    // the next run takes a brief, whatever this one is: the lane's briefs, else what this one was judged on
    const briefs = sampleSets({ path, kind: "brief", durations, runs }).find((st) => st.from === "lane+kind"), b = briefs && briefs.ms.length >= MIN_SAMPLES ? briefs : sets.find((st) => st.ms.length >= MIN_SAMPLES);
    out.queued = queued; out.total = span(out.lo + q(b.ms, 0.25), out.hi + q(b.ms, 0.75));
  }
  return out;
}
// In words, after the step line: "5–15 min left", "+2 queued: 40–90 min in all",
// "longer than its usual 5–25 min".
function estimateWords(e) {
  if (!e) return "";
  if (e.over) return `longer than its usual ${e.usual.replace(/^about /, "")}`;
  return `${e.left} left${e.queued ? ` · +${e.queued} queued: ${e.total} in all` : ""}`;
}

export { estimate, estimateWords, sampleSets, noteDuration, noteCost, loadCosts, loadCostDays, rollDay, loadDurations, runsInLog, laneRuns, kindOf, mins, span };
