// symbiot — Work: what an agent is doing, as it does it. Claude Code runs with
// --output-format stream-json (agents.mjs withStream), so every step lands in the
// run's .symbiot/agent.log as it happens: each tool it calls and what came back,
// its own to-do list (TaskCreate/TaskUpdate, or the older TodoWrite) with the
// "Reading x.txt" line for what's in progress, what it says between steps, and at
// the end what it answered, what it cost, how many turns and tokens. parseRun
// turns that into something to draw: steps, to-dos, tests, files, a pace over
// time. Another agent (Codex, Aider, Gemini) writes plain text: its last lines
// come through as what it said. Pure: text in, data out.

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
// tokens, tests, files, pace, errors }.
function parseRun(text) {
  const lines = String(text || "").split("\n");
  const events = []; let plain = [];
  for (const l of lines) { if (l.startsWith("{")) { try { events.push(JSON.parse(l)); continue; } catch {} } if (l.trim()) plain.push(l); }
  const out = { stream: events.length > 0, model: "", steps: [], todos: [], doing: "", said: [], final: "", cost: null, turns: null, tokens: null, tests: null, files: {}, pace: [], errors: 0 };
  if (!out.stream) { out.said = plain.slice(-12).map((l) => short(l, 160)); out.final = plain.slice(-40).join("\n").trim(); return out; }
  const byId = new Map(), tasks = new Map(); let thinking = false;
  for (const e of events) {
    const at = e.timestamp ? Date.parse(e.timestamp) : null;
    if (e.session_id && !out.session) out.session = String(e.session_id);
    if (e.type === "system" && e.subtype === "init") { out.model = String(e.model || ""); continue; }
    if (e.type === "assistant" && e.message && Array.isArray(e.message.content)) {
      for (const b of e.message.content) {
        if (b.type === "thinking") { thinking = true; continue; }
        if (b.type === "text" && b.text && b.text.trim()) { out.said.push(short(b.text, 220)); thinking = false; continue; }
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
      const u = e.usage || {}; out.tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) || null;
      if (e.is_error) out.errors++;
    }
  }
  out.todos = [...tasks.values()];
  const now = out.todos.find((t) => t.status === "in_progress"), last = out.steps[out.steps.length - 1];
  out.doing = out.final ? "" : now ? now.active : last && last.status === "running" ? `${last.verb} ${last.target}`.trim() : thinking ? "Thinking" : "";
  // pace: steps per minute over the run, up to 24 buckets (a sparkline)
  const times = out.steps.map((s) => s.at).filter(Boolean);
  if (times.length > 1) { const t0 = times[0], span = Math.max(times[times.length - 1] - t0, 60000), n = Math.min(24, Math.max(6, Math.ceil(span / 60000))), w = span / n; out.pace = new Array(n).fill(0); for (const t of times) out.pace[Math.min(n - 1, Math.floor((t - t0) / w))]++; }
  out.steps = out.steps.slice(-MAX_STEPS).map(({ at, ...s }) => ({ ...s, ...(at ? { at } : {}) }));
  out.said = out.said.slice(-6);
  return out;
}

// The newest run's part of an agent.log (after its header and command line).
function lastRunText(log) {
  const s = String(log || ""), at = s.lastIndexOf("\n=== ");
  return at < 0 ? s : s.slice(at).split("\n").slice(3).join("\n");
}
// What the agent said last: its final answer, from either kind of log.
function finalOf(log) { return parseRun(lastRunText(log)).final; }

export { parseRun, lastRunText, finalOf, describe, testsIn };
