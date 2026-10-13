// symbiot — AI usage limits: is the AI out of quota, and until when?
//
// What each AI really exposes (checked, not guessed):
//  - Claude / Claude Code (your subscription): `claude -p --output-format stream-json`
//    writes a `rate_limit_event` into every run's stream, and the error line of a
//    stopped run carries the same `rate_limit_info`: status (allowed, allowed_warning,
//    rejected), and per window (five_hour, seven_day) its utilization (0..1) and
//    resetsAt (epoch seconds). Symbiot reads the newest of those from the agent logs.
//    There is no `claude usage` command for scripts, and the interactive /usage
//    screen isn't readable from outside, so the logs are the source.
//  - Anthropic / OpenAI / Gemini with an API key: no usage meter for a key. The only
//    thing that shows is the 429 / quota error of a call, which write() hands to
//    noteLimit() here (kept in ~/.config/symbiot/quota.json).
//  - Local models (Ollama): no quota at all.
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { CONFIG_DIR } from "./core.mjs";

const FILE = join(CONFIG_DIR, "quota.json");
const TAIL = 256 * 1024, WEEK = 8 * 86400000, NEAR = 0.8, HIT_KEEP = 6 * 3600000;
const WINDOWS = { five_hour: "5-hour session", seven_day: "Weekly" };

function tailOf(file, bytes = TAIL) {
  let fd; try { fd = openSync(file, "r"); } catch { return ""; }
  try { const size = statSync(file).size, from = Math.max(0, size - bytes), buf = Buffer.alloc(size - from); readSync(fd, buf, 0, buf.length, from); return buf.toString("utf8"); }
  catch { return ""; } finally { try { closeSync(fd); } catch {} }
}
// The rate_limit_info objects in a stretch of run log, each with the time it was seen.
function infosIn(text, fallbackAt) {
  const out = [];
  for (const l of String(text || "").split("\n")) {
    if (!l.startsWith("{") || !l.includes('"rate_limit_info"')) continue;
    let e; try { e = JSON.parse(l); } catch { continue; }
    const info = e.rate_limit_info || (e.api_error_params && e.api_error_params.rate_limit_info);
    if (info && typeof info === "object") out.push({ info, at: e.timestamp ? Date.parse(e.timestamp) || fallbackAt : fallbackAt });
  }
  return out;
}
// Newest reading per window, from the end of one log.
function readLog(file) {
  let m = 0; try { m = statSync(file).mtimeMs; } catch { return null; }
  if (Date.now() - m > WEEK) return null;
  const seen = infosIn(tailOf(file), m); if (!seen.length) return null;
  const last = seen[seen.length - 1], wins = {};
  for (const s of seen) {
    const u = s.info.unifiedWindows || {};
    for (const k of Object.keys(u)) if (u[k] && typeof u[k].utilization === "number" && (!wins[k] || s.at >= wins[k].at)) wins[k] = { used: u[k].utilization, resetsAt: Number(u[k].resetsAt) || 0, at: s.at };
    const t = s.info.rateLimitType;
    if (t && s.info.resetsAt && !u[t] && (!wins[t] || s.at >= wins[t].at)) wins[t] = { used: s.info.status === "rejected" ? 1 : null, resetsAt: Number(s.info.resetsAt) || 0, at: s.at };
  }
  return { at: last.at, status: String(last.info.status || ""), type: last.info.rateLimitType || "", resetsAt: Number(last.info.resetsAt) || 0, wins };
}

// Every folder an agent logs in: the repos, the ops drafts, the parallel worktrees.
function logFiles(paths) {
  const out = new Set();
  const add = (p) => { if (p) { out.add(join(p, ".symbiot", "agent.log")); out.add(join(p, ".symbiot", "agent.log.old")); } };
  for (const p of paths || []) add(p);
  for (const sub of ["drafts", "worktrees"]) {
    let ds = []; try { ds = readdirSync(join(CONFIG_DIR, sub)); } catch {}
    for (const d of ds) add(join(CONFIG_DIR, sub, d));
  }
  return [...out];
}
const CACHE = new Map(); // file -> { key, r }
function scanLogs(paths) {
  const rs = [];
  for (const f of logFiles(paths)) {
    let st; try { st = statSync(f); } catch { continue; }
    const key = st.mtimeMs + ":" + st.size, c = CACHE.get(f);
    const r = c && c.key === key ? c.r : readLog(f);
    CACHE.set(f, { key, r }); if (r) rs.push(r);
  }
  return rs;
}

// ---- limits seen in a call that failed (an API key, or Claude Code asked directly) --
function loadHits() { try { const d = JSON.parse(readFileSync(FILE, "utf8")); return d && d.hits && typeof d.hits === "object" ? d.hits : {}; } catch { return {}; } }
const LIMIT_RE = /\b429\b|rate.?limit|usage limit|limit reached|hit your (usage )?limit|quota|resource_exhausted|out of (extra )?usage|too many requests|insufficient_quota|credit balance/i;
const isLimitError = (msg) => LIMIT_RE.test(String(msg || ""));
// "resets 7pm", "resets at 11:40am", "resets in 2 hours": when, as epoch ms (0 = not said)
function resetIn(msg, now = Date.now()) {
  const s = String(msg || "");
  let m = s.match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d\d))?\s*(am|pm)/i);
  if (m) {
    let h = Number(m[1]) % 12 + (/pm/i.test(m[3]) ? 12 : 0); const d = new Date(now); d.setHours(h, Number(m[2] || 0), 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1); return d.getTime();
  }
  m = s.match(/resets?\s+in\s+(\d+)\s*(hour|hr|h|minute|min|m)/i);
  if (m) return now + Number(m[1]) * (/^h/i.test(m[2]) ? 3600000 : 60000);
  m = s.match(/\|(\d{10})\b/); // the old "Claude AI usage limit reached|1760000000"
  return m ? Number(m[1]) * 1000 : 0;
}
function noteLimit(provider, msg, now = Date.now()) {
  if (!provider || !isLimitError(msg)) return false;
  try {
    const hits = loadHits(); hits[provider] = { at: now, until: resetIn(msg, now), msg: String(msg).slice(0, 200) };
    mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify({ hits }, null, 1), { mode: 0o600 });
  } catch {}
  return true;
}
// A call that worked clears that provider's note.
function noteOk(provider) {
  try { const hits = loadHits(); if (!hits[provider]) return; delete hits[provider]; writeFileSync(FILE, JSON.stringify({ hits }, null, 1), { mode: 0o600 }); } catch {}
}

// When, in words: "19:00", or "Thu 19:00" if it isn't today.
function when(ms, now = Date.now()) {
  const d = new Date(ms), t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === new Date(now).toDateString() ? t : d.toLocaleDateString([], { weekday: "short" }) + " " + t;
}

// ---- the state the meter and the pages read ------------------------------------
// providers: ai.mjs's PROVIDERS; current: resolveProvider(); paths: the repo folders.
function quotaState({ providers = {}, current = null, paths = [], now = Date.now() } = {}) {
  const rs = scanLogs(paths), wins = {};
  let newest = null;
  for (const r of rs) {
    if (!newest || r.at > newest.at) newest = r;
    for (const k of Object.keys(r.wins)) if (!wins[k] || r.wins[k].at > wins[k].at) wins[k] = r.wins[k];
  }
  const claudeWins = [];
  for (const k of ["five_hour", "seven_day", ...Object.keys(wins).filter((k) => !WINDOWS[k])]) {
    const w = wins[k]; if (!w) continue;
    const reset = w.resetsAt * 1000, over = reset && reset <= now; // its window ended since: a fresh one, not yet measured
    const used = over ? null : w.used; // a window that has ended says nothing about the new one until a run shows it
    claudeWins.push({ key: k, label: WINDOWS[k] || k.replace(/_/g, " "), used: used == null ? null : Math.round(used * 100), resetsAt: reset || null, resetText: reset ? when(reset, now) : "", over: !!over });
  }
  const hits = loadHits(), rows = [];
  // Claude: the windows if a run has shown them, else what a failed call said
  const ch = hits.claude && now - hits.claude.at < HIT_KEEP && (!hits.claude.until || hits.claude.until > now) ? hits.claude : null;
  let level = "ok", until = 0;
  const rejected = newest && newest.status === "rejected" && newest.resetsAt * 1000 > now && !(newest.wins[newest.type] && newest.wins[newest.type].used < 1);
  const full = claudeWins.filter((w) => !w.over && w.used != null && w.used >= 100 && w.resetsAt > now);
  if (rejected) { level = "hit"; until = newest.resetsAt * 1000; }
  if (full.length) { level = "hit"; until = Math.max(until, ...full.map((w) => w.resetsAt)); }
  if (ch && level !== "hit" && (!newest || ch.at > newest.at)) { level = "hit"; until = ch.until || 0; }
  if (level === "ok" && (claudeWins.some((w) => !w.over && w.used != null && w.used >= NEAR * 100) || (newest && newest.status === "allowed_warning" && newest.at > now - 5 * 3600000))) level = "near";
  const haveClaude = claudeWins.length > 0 || !!ch || (current && current.provider === "claude");
  if (haveClaude) {
    const worst = claudeWins.filter((w) => !w.over && w.used != null).sort((a, b) => b.used - a.used)[0];
    rows.push({ id: "claude", label: "Claude (Claude Code)", kind: "windows", level, windows: claudeWins, until: until || null, untilText: until ? when(until, now) : "",
      source: claudeWins.length ? "Claude Code's own rate-limit report in the agent runs" : "an error from Claude Code", seenAt: newest ? newest.at : (ch ? ch.at : null),
      headline: level === "hit" ? "out" + (until ? " until " + when(until, now) : "") : worst ? worst.used + "% of the " + worst.label.toLowerCase() + " used · resets " + worst.resetText : claudeWins.length ? "limits have reset since the last agent run: no hit" : "no reading yet: it shows after the next agent run" });
  }
  // the others set up in Settings → AI
  const cfg = {}; try { Object.assign(cfg, JSON.parse(readFileSync(join(CONFIG_DIR, "config.json"), "utf8"))); } catch {}
  for (const id of Object.keys(providers)) {
    if (id === "claude") continue;
    const isCurrent = current && current.provider === id, saved = cfg[id] && (cfg[id].apiKey || cfg[id].baseUrl || cfg[id].model);
    if (!isCurrent && !saved && !hits[id]) continue;
    if (providers[id].local) { rows.push({ id, label: providers[id].label, kind: "local", level: "ok", headline: "runs on this computer: no quota", source: "local model" }); continue; }
    const h = hits[id] && now - hits[id].at < HIT_KEEP && (!hits[id].until || hits[id].until > now) ? hits[id] : null;
    rows.push({ id, label: providers[id].label, kind: "errors", level: h ? "hit" : "ok", until: h && h.until || null, untilText: h && h.until ? when(h.until, now) : "",
      headline: h ? "limit hit" + (h.until ? ", back " + when(h.until, now) : "") + " (" + h.msg.slice(0, 80) + ")" : "no usage meter for an API key: a limit shows only when a call hits it", source: "errors from its calls" });
  }
  // the one the meter shows: the one the agents run on (Claude) if it has anything, else the first row that's hit
  const worstRow = rows.find((r) => r.level === "hit") || rows.find((r) => r.level === "near") || rows[0] || null;
  const agentRow = rows.find((r) => r.id === "claude");
  const top = agentRow && agentRow.level !== "ok" ? agentRow : (worstRow && worstRow.level !== "ok" ? worstRow : agentRow || worstRow);
  const pct = top && top.windows ? Math.max(0, ...top.windows.filter((w) => !w.over && w.used != null).map((w) => w.used)) : null;
  const text = !top ? "" : top.level === "hit" ? ((top.id === "claude" ? "Claude" : top.label.split(" (")[0]) + " out" + (top.untilText ? " until " + top.untilText : "")) : top.windows && top.windows.length && pct != null && top.windows.some((w) => !w.over) ? (pct + "% used") : top.kind === "local" ? "Local model" : top.id === "claude" ? "Claude ready" : "No limit hit";
  return { level: top ? top.level : "none", text, pct, rows, paused: agentRow ? agentRow.level === "hit" : false,
    pausedText: agentRow && agentRow.level === "hit" ? "Agents are paused: Claude is out of quota" + (agentRow.untilText ? " until " + agentRow.untilText : "") + ". Runs started now would stop at once; they can go again after it resets." : "" };
}

export { quotaState, noteLimit, noteOk, isLimitError, resetIn, infosIn, readLog, when };
