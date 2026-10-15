// symbiot — Work: what an agent is doing, as it does it. Claude Code runs with
// --output-format stream-json (agents.mjs withStream), so every step lands in the
// run's .symbiot/agent.log as it happens: each tool it calls and what came back,
// its own to-do list (TaskCreate/TaskUpdate, or the older TodoWrite) with the
// "Reading x.txt" line for what's in progress, what it says between steps, and at
// the end what it answered, what it cost, how many turns and tokens. parseRun
// turns that into something to draw: steps, to-dos, tests, files, a pace over
// time. Another agent (Codex, Aider, Gemini) writes plain text: its last lines
// come through as what it said. Pure: text in, data out.

import { statSync, openSync, readSync, closeSync } from "node:fs";

const MAX_STEPS = 60;
const short = (s, n = 80) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const base = (p) => String(p || "").split("/").filter(Boolean).slice(-2).join("/");

// One tool call, as a person would say it: { kind, verb, target }.
function describe(name, input = {}) {
  const n = String(name || "");
  if (n === "Read") return { kind: "read", verb: "Read", target: base(input.file_path) };
  if (n === "Edit" || n === "MultiEdit") return { kind: "edit", verb: "Edited", target: base(input.file_path) };
  if (n === "Write") return { kind: "edit", verb: "Wrote", target: base(input.file_path) };
  if (n === "NotebookEdit") return { kind: "edit", verb: "Edited", target: base(input.notebook_path) };
  if (n === "Bash") return { kind: "run", verb: "Ran", target: short(input.description || input.command, 70) };
  if (n === "Grep") return { kind: "search", verb: "Searched for", target: short(input.pattern, 50) };
  if (n === "Glob") return { kind: "search", verb: "Listed", target: short(input.pattern, 50) };
  if (n === "WebFetch") return { kind: "web", verb: "Read", target: short(input.url, 60) };
  if (n === "WebSearch") return { kind: "web", verb: "Searched the web for", target: short(input.query, 60) };
  if (n === "Task" || n === "Agent") return { kind: "agent", verb: "Asked a helper to", target: short(input.description || input.prompt, 60) };
  if (/^mcp__/.test(n)) { const parts = n.split("__"); return { kind: "connector", verb: "Used", target: short((parts[1] || "").replace(/^claude_ai_/, "").replace(/_/g, " ") + (parts[2] ? " · " + parts[2].replace(/_/g, " ") : ""), 60) }; }
  return { kind: "tool", verb: "Used", target: n };
}
// Tools that are bookkeeping, not work: the to-do list (shown as to-dos) and
// looking up its own tools.
const QUIET = new Set(["TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "TodoWrite", "ToolSearch", "ExitPlanMode"]);

// A test run's tally from its output: { passed, failed } or null.
function testsIn(text) {
  const t = String(text || ""); let passed = 0, failed = 0, seen = false;
  for (const m of t.matchAll(/(\d+)\s+passed,\s+(\d+)\s+failed/g)) { passed += +m[1]; failed += +m[2]; seen = true; }
  if (!seen) { const p = t.match(/(\d+)\s+(?:tests?\s+)?passed/), f = t.match(/(\d+)\s+(?:tests?\s+)?failed/); if (p || f) { passed = p ? +p[1] : 0; failed = f ? +f[1] : 0; seen = true; } }
  return seen ? { passed, failed } : null;
}
const resultText = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x && typeof x.text === "string" ? x.text : "")).join("\n") : "");

// The text of one run's log (everything after its "=== name time ===" header and
// command line) → { stream, model, steps, todos, doing, said, final, cost, turns,
// tokens, ctx (what its last step read: the conversation so far), tests, files, pace, errors }.
function parseRun(text) {
  const lines = String(text || "").split("\n");
  const events = []; let plain = [];
  for (const l of lines) { if (l.startsWith("{")) { try { events.push(JSON.parse(l)); continue; } catch {} } if (l.trim()) plain.push(l); }
  const out = { stream: events.length > 0, model: "", steps: [], todos: [], doing: "", said: [], final: "", cost: null, turns: null, modelUsage: null, tokens: null, ctx: null, tests: null, files: {}, pace: [], errors: 0 };
  if (!out.stream) { out.said = plain.slice(-12).map((l) => short(l, 160)); out.final = plain.slice(-40).join("\n").trim(); return out; }
  const byId = new Map(), tasks = new Map(), talk = []; let thinking = false, moved = 0;
  for (const e of events) {
    const at = e.timestamp ? Date.parse(e.timestamp) : null;
    // a move: something it said or did, or a step coming back; not a heartbeat
    if (at && (e.type === "assistant" || e.type === "user")) moved = Math.max(moved, at);
    if (e.session_id && !out.session) out.session = String(e.session_id);
    if (e.type === "system" && e.subtype === "init") { out.model = String(e.model || ""); continue; }
    // a long call's heartbeat (~every 30s): not a move, but how long the step has been going
    if (e.type === "tool_progress") { const s = byId.get(e.parent_tool_use_id); if (s && s.status === "running" && typeof e.elapsed_time_seconds === "number") s.elapsedS = Math.max(s.elapsedS || 0, e.elapsed_time_seconds); continue; }
    if (e.type === "assistant" && e.message && Array.isArray(e.message.content)) {
      const u = e.message.usage; if (u) out.ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0) || out.ctx; // what its next step rereads
      for (const b of e.message.content) {
        if (b.type === "thinking") { thinking = true; continue; }
        if (b.type === "text" && b.text && b.text.trim()) { out.said.push(short(b.text, 220)); talk.push(short(b.text, 400)); thinking = false; continue; }
        if (b.type !== "tool_use") continue;
        thinking = false;
        const inp = b.input || {};
        if (b.name === "TodoWrite" && Array.isArray(inp.todos)) { tasks.clear(); inp.todos.forEach((t, i) => tasks.set(String(i + 1), { text: short(t.content, 120), status: t.status || "pending", active: short(t.activeForm || t.content, 90) })); continue; }
        if (b.name === "TaskCreate") { byId.set(b.id, { create: { text: short(inp.subject || inp.description, 120), active: short(inp.activeForm || inp.subject, 90) } }); continue; }
        if (b.name === "TaskUpdate") { const t = tasks.get(String(inp.taskId)); if (t && inp.status) t.status = inp.status; if (t && inp.subject) t.text = short(inp.subject, 120); continue; }
        if (QUIET.has(b.name)) continue;
        const d = describe(b.name, inp), step = { ...d, at, status: "running" };
        if (d.kind === "edit" && d.target) out.files[d.target] = (out.files[d.target] || 0) + 1;
        byId.set(b.id, step); out.steps.push(step);
      }
      continue;
    }
    if (e.type === "user" && e.message && Array.isArray(e.message.content)) {
      for (const b of e.message.content) {
        if (b.type !== "tool_result") continue;
        const s = byId.get(b.tool_use_id), txt = resultText(b.content);
        if (s && s.create) { const m = txt.match(/Task #(\w+)/); tasks.set(m ? m[1] : String(tasks.size + 1), { text: s.create.text, status: "pending", active: s.create.active }); continue; }
        if (!s) continue;
        s.status = b.is_error ? "error" : "done"; if (b.is_error) { out.errors++; s.note = short(txt, 120); }
        if (at && s.at) s.ms = at - s.at;
        if (s.kind === "run") { const tt = testsIn(txt); if (tt) { s.tests = tt; out.tests = tt; } }
      }
      continue;
    }
    if (e.type === "result") {
      out.final = String(e.result || "").trim();
      out.cost = typeof e.total_cost_usd === "number" ? e.total_cost_usd : null;
      out.turns = typeof e.num_turns === "number" ? e.num_turns : null;
      out.modelUsage = e.modelUsage && typeof e.modelUsage === "object" ? e.modelUsage : null; // per model: tokens and costUSD
      const u = e.usage || {}; out.tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) || null;
      if (e.is_error) out.errors++;
    }
  }
  out.todos = [...tasks.values()];
  const now = out.todos.find((t) => t.status === "in_progress"), last = out.steps[out.steps.length - 1];
  out.doing = out.final ? "" : now ? now.active : last && last.status === "running" ? `${last.verb} ${last.target}`.trim() + (last.elapsedS >= 120 ? ` · running ${Math.floor(last.elapsedS / 60)}m` : "") : thinking ? "Thinking" : "";
  out.running = !out.final && last && last.status === "running" && (last.at || last.elapsedS) ? { at: last.at || 0, elapsedS: last.elapsedS || 0 } : null; // the call still going, for a live "running Nm"
  // pace: steps per minute over the run, up to 24 buckets (a sparkline)
  const times = out.steps.map((s) => s.at).filter(Boolean);
  if (times.length > 1) { const t0 = times[0], span = Math.max(times[times.length - 1] - t0, 60000), n = Math.min(24, Math.max(6, Math.ceil(span / 60000))), w = span / n; out.pace = new Array(n).fill(0); for (const t of times) out.pace[Math.min(n - 1, Math.floor((t - t0) / w))]++; }
  out.steps = out.steps.slice(-MAX_STEPS).map(({ at, ...s }) => ({ ...s, ...(at ? { at } : {}) }));
  out.said = out.said.slice(-6);
  out.talk = talk.slice(-120); out.moved = moved || null;
  // going round: its last LOOP steps all the same call
  const tail = out.steps.slice(-LOOP), k = (x) => x.verb + " " + x.target;
  out.looping = tail.length === LOOP && !out.final && tail.every((x) => k(x) === k(tail[0]));
  return out;
}

// ---- how far along a run is ---------------------------------------------------------
// Home said only "Agents working: 2" while steve and argena had each been at it for
// half an hour (2026-10-08): nothing said what either was doing or how far along.
// A brief's plan is the numbered steps of the first open task in its TASKS.md
// ("1) Device pass on v6.7. … 2) Look and feel, plus a zoned world. …"), each as a
// short label; where the run is in it comes from what the agent says as it goes
// ("Device pass done … moving to step 2", "Now comparing item by item…").
const LOOP = 5;
const STOP = new Set("against about after again also because been before being both but can could did does doing done each else even every first from have here into just like make more most much must next now once only other over same should since some sure than that the their them then there these they this those through what when where which while will with without would your you yours step steps check checks checked".split(" "));
const stem = (w) => w.toLowerCase().replace(/(ings?|ed|es|s|e)$/, "").slice(0, 6);
const stems = (t) => new Set(String(t || "").toLowerCase().match(/[a-z][a-z'-]{3,}/g)?.filter((w) => !STOP.has(w)).map(stem) || []);
// The numbered steps of a brief's first open task → ["Device pass on v6.7", …]; [] when it has none.
function briefPlan(md) {
  const line = String(md || "").split("\n").find((l) => /^\s*-\s*\[ \]/.test(l));
  if (!line) return [];
  const t = line.replace(/^\s*-\s*\[ \]\s*/, ""), cuts = [];
  for (const m of t.matchAll(/(^|[\s.:;])(\d{1,2})[).]\s+/g)) { if (+m[2] === cuts.length + 1) cuts.push({ n: +m[2], at: m.index + m[1].length, body: m.index + m[0].length }); }
  if (cuts.length < 2) return [];
  return cuts.map((c, i) => {
    const full = t.slice(c.body, i + 1 < cuts.length ? cuts[i + 1].at : undefined).trim();
    let label = full.split(/[.;:!?](?:\s|$)|\s\(|\s[—–-]\s/)[0].trim();
    const comma = label.indexOf(", ", 20); if (comma > 0) label = label.slice(0, comma);
    return { label: short(label, 70), full: full.split(/\s+/).slice(0, 30).join(" ") };
  });
}
// Which step (1-based) of plan the run is on, from what it said, in order: "step 2"
// names it ("step 1 done" means the next; every brief asks for "Step 2: …"); otherwise
// two words of a step's label in what it said. Fewer, or the step's other words, would
// be too loose: "wiring the map" isn't step 3's "wire the class bible", nor "the
// monsters" step 4 because step 4 mentions monsters. Only forward. 0: can't tell.
function stepOf(plan, talk) {
  if (!plan || !plan.length) return 0;
  const L = plan.map((p) => [...stems(p.label)]);
  let cur = 0;
  for (const text of talk || []) {
    let named = 0;
    for (const m of String(text).matchAll(/\bstep\s+(\d{1,2})\b([^.\n]{0,40})/gi)) { const n = +m[1] + (/^\W*(?:\([^)]*\)\W*)?(?:is\s+|are\s+)?(?:done|finished|complete)/i.test(m[2]) ? 1 : 0); if (n <= plan.length) named = Math.max(named, n); }
    if (named) { cur = Math.max(cur, named); continue; }
    const said = stems(text), hits = L.map((l) => l.filter((w) => said.has(w)).length);
    const top = Math.max(...hits), at = hits.indexOf(top);
    if (top >= 2 && hits.lastIndexOf(top) === at) cur = Math.max(cur, at + 1);
  }
  return Math.min(cur, plan.length);
}
// What it's on, in a line: its in-progress to-do, else the last thing it said it's
// doing (the last sentence of what it said last), else its last step.
function nowLine(w) {
  const todo = (w.todos || []).find((t) => t.status === "in_progress");
  if (todo) return todo.active;
  const last = (w.talk || [])[(w.talk || []).length - 1];
  if (last) { const ss = String(last).replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/); const s = (ss.filter((x) => x.trim().length > 12).pop() || ss.pop() || "").trim().replace(/[.:]$/, ""); if (s) return s; }
  return w.doing || "";
}
// A running agent in one line for Home: "step 2 of 4: look and feel, plus a zoned world
// · shooting the monsters"; quiet: minutes since its last move, once that's past
// STALL_MS (it may be stuck, or one long command), looping: its last steps all alike.
const STALL_MS = 20 * 60 * 1000;
function runLine({ plan = [], step = 0, work = {}, now = Date.now() } = {}) {
  const n = short(nowLine(work), 90), lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const at = step && plan[step - 1] ? `step ${step} of ${plan.length}: ${lower(plan[step - 1].label)}` : plan.length ? `${plan.length} steps in its brief` : "";
  // a call still going ticks with the clock, not only when the log grows: elapsed from when it began (or its last heartbeat)
  const r = work.running, runS = r ? Math.max(r.elapsedS || 0, r.at ? Math.round((now - r.at) / 1000) : 0) : 0;
  const going = runS >= 60 && !/running \d/.test(n) ? `running ${runS >= 3600 ? Math.floor(runS / 3600) + "h " + Math.floor(runS % 3600 / 60) + "m" : Math.floor(runS / 60) + "m"}` : "";
  const line = [at, n && lower(n), going].filter(Boolean).join(" · ") || "working on it";
  const quiet = work.moved && now - work.moved > STALL_MS ? Math.round((now - work.moved) / 60000) : 0;
  return { line, ...(step ? { step, of: plan.length } : {}), ...(quiet ? { quiet } : {}), ...(work.looping ? { looping: true } : {}) };
}

// The newest run of an agent.log, from its "=== " header on, read from the end of the
// file. A log keeps every run and everything they read (one reached 144 MB: 96 runs and
// the screenshots they looked at), and every view only needs the newest, so it never
// reads the rest; and it's kept until the file changes, so a view that asks again
// costs nothing. Past RUN_CAP of one run, it's that run's last RUN_CAP.
const RUN_CAP = 16 * 1024 * 1024, RUN_CACHE = new Map();
// A running agent's log grows all the time, so a view that asked a moment ago would miss the
// cache on size and read the whole run again (megabytes, every few seconds, from every tick:
// ~15% of a core while idle, 2026-10-10). A log that only grew by appending to the same run
// (no new "=== " header in what was added) costs just the added bytes.
function appended(file, hit, st) {
  if (!hit || hit.at < 0 || st.size <= hit.size || hit.text.length + (st.size - hit.size) > RUN_CAP) return null;
  const back = Math.min(64, hit.size), b = Buffer.alloc(st.size - hit.size + back);
  let fd; try { fd = openSync(file, "r"); } catch { return null; }
  try { if (readSync(fd, b, 0, b.length, hit.size - back) !== b.length) return null; } catch { return null; } finally { try { closeSync(fd); } catch {} }
  if (!b.subarray(0, back).equals(hit.last)) return null; // not the file we read: rewritten, not appended to
  if (b.indexOf("\n=== ") >= 0) return null; // a new run began: read from its header
  const add = Buffer.concat([hit.rest, b.subarray(back)]);
  let keep = 0; for (let i = add.length - 1; i >= Math.max(0, add.length - 3); i--) { const c = add[i]; if ((c & 0xC0) === 0x80) continue; keep = c >= 0xC0 && add.length - i < (c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : 2) ? add.length - i : 0; break; } // a character cut by the end of the read waits for the rest
  return { text: hit.text + add.subarray(0, add.length - keep).toString("utf8"), rest: add.subarray(add.length - keep), last: b.subarray(-64) };
}
function readRunLog(file) {
  let st; try { st = statSync(file); } catch { return ""; }
  const hit = RUN_CACHE.get(file); if (hit && hit.size === st.size && hit.mtime === st.mtimeMs) return hit.text;
  const more = appended(file, hit, st);
  if (more) { RUN_CACHE.delete(file); RUN_CACHE.set(file, { size: st.size, mtime: st.mtimeMs, text: more.text, rest: more.rest, last: more.last, at: hit.at }); return more.text; }
  let fd; try { fd = openSync(file, "r"); } catch { return ""; }
  let buf = Buffer.alloc(0), at = -1;
  try {
    for (let end = st.size; end > 0 && buf.length < RUN_CAP;) {
      const start = Math.max(0, end - (1 << 20)), b = Buffer.alloc(end - start);
      readSync(fd, b, 0, b.length, start); buf = Buffer.concat([b, buf]); end = start;
      at = buf.lastIndexOf("\n=== "); if (at >= 0) break;
    }
  } catch { buf = Buffer.alloc(0); } finally { try { closeSync(fd); } catch {} }
  const text = (at >= 0 ? buf.subarray(at) : buf).toString("utf8");
  RUN_CACHE.delete(file); RUN_CACHE.set(file, { size: st.size, mtime: st.mtimeMs, text, rest: Buffer.alloc(0), last: buf.subarray(-64), at });
  if (RUN_CACHE.size > 40) RUN_CACHE.delete(RUN_CACHE.keys().next().value);
  return text;
}
// When the newest run in a log began (its header's time), or 0: only the header line is looked at,
// not the megabytes after it.
function runStarted(log) { const m = /^=== .* (\d{4}-\d\d-\d\dT[\d:.]+Z) ===$/m.exec(String(log || "").slice(0, 2000).replace(/^\n/, "")); return m ? Date.parse(m[1]) || 0 : 0; }
// The newest run's part of an agent.log (after its header and command line).
function lastRunText(log) {
  const s = String(log || ""), at = s.lastIndexOf("\n=== ");
  return at < 0 ? s : s.slice(at).split("\n").slice(3).join("\n");
}
// A turn that ended on purpose and is waiting ("nothing new to act on… waiting for marketing's
// photos"): the sentence of its final answer that says what for, or "". A one-shot run exits
// after every turn, so a finished process alone can't tell this from a stall (2026-10-10).
function waitingOn(final) {
  const ss = String(final || "").replace(/[`*_#>]/g, "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  const s = ss.reverse().find((x) => /\b(wait(?:ing)?\s+(?:on|for)|until|will check again|check again|once (?:it|they|the|that)\b|nothing (?:to do|due) (?:yet|until|before)|not (?:yet )?due|next (?:check|run|post)\b|due (?:on|at|in)\b|(?:look|try) again (?:at|on|in|after|tomorrow)\b)/i.test(x));
  return s ? short(s.replace(/[.:]$/, ""), 160) : "";
}
// What the agent said last: its final answer, from either kind of log.
function finalOf(log) { return parseRun(lastRunText(log)).final; }
// When a run that waits says to look again, as a time: "at 08:50", "by 9am", "tomorrow",
// "on 15 Oct", "before week 1 ends on 15 October", "in 2 hours", "next week", "2026-10-17";
// or, for a wait with no time ("once the number switch is live"), RECHECK from now. 0 when
// it isn't waiting at all. A time-gated task was checked by a full run every few minutes
// (27 and 19 runs in two days, 15 Oct 2026): this is what the next run is held until.
const RECHECK = 4 * 3600000, DAY = 86400000, DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"], MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function waitUntil(final, now = Date.now()) {
  const w = waitingOn(final); if (!w) return 0;
  const t = w.toLowerCase(), day = (d) => { d.setHours(8, 0, 0, 0); return d.getTime(); }, future = (ms) => (ms > now ? ms : 0);
  let m;
  if ((m = /\b(\d{4})-(\d\d)-(\d\d)\b/.exec(t))) return future(day(new Date(+m[1], +m[2] - 1, +m[3])));
  if ((m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b/.exec(t)) || (m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(t))) {
    const [d, mo] = /^\d/.test(m[1]) ? [+m[1], MONTHS.indexOf(m[2])] : [+m[2], MONTHS.indexOf(m[1])], y = new Date(now).getFullYear(), at = day(new Date(y, mo, d));
    return future(at) || future(day(new Date(y + 1, mo, d)));
  }
  if ((m = /\bin\s+(\d+|an?)\s+(minute|hour|day|week)s?\b/.exec(t))) { const n = /^\d/.test(m[1]) ? +m[1] : 1; return now + n * { minute: 60000, hour: 3600000, day: DAY, week: 7 * DAY }[m[2]]; }
  if ((m = /\b(?:at|by|until|after|around)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/.exec(t)) && /\d(:\d\d|\s*(am|pm))/.test(m[1])) { const hm = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(m[1]); let h = +hm[1]; const mi = +(hm[2] || 0); if (hm[3] === "pm" && h < 12) h += 12; if (hm[3] === "am" && h === 12) h = 0; const d = new Date(now); d.setHours(h, mi, 0, 0); if (d.getTime() <= now) d.setDate(d.getDate() + 1); return d.getTime() + 60000; }
  if (/\btomorrow\b/.test(t)) return day(new Date(now + DAY));
  if ((m = /\b(?:on|next|this)\s+(sun|mon|tue|wed|thu|fri|sat)\w*\b/.exec(t))) { const d = new Date(now), n = (DAYS.indexOf(m[1]) - d.getDay() + 7) % 7 || 7; return day(new Date(now + n * DAY)); }
  if (/\bnext (week|month)\b/.test(t)) return now + (/\bmonth\b/.test(t) ? 30 : 7) * DAY;
  return now + RECHECK;
}

export { parseRun, lastRunText, finalOf, describe, testsIn, readRunLog, runStarted, briefPlan, stepOf, nowLine, runLine, STALL_MS, waitingOn, waitUntil, RECHECK };
