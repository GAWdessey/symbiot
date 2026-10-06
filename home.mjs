// symbiot — Home: what the liquid shows, from real data. Three kinds of droplet:
// - only you: what no agent can do (an Approve waiting for you; an agent's open
//   question to you), always out front;
// - feeds: what's new on the sites you watch (watch.mjs), sized by how much;
// - lanes: work handed between agents (lanes.mjs), the latest few.
// The app's sections (Map, Tasks, Agents, Week…) are shaped by adapt.mjs from
// how you use them; this is the live data around them. Home's talk goes to the
// same Symbiot as every chat (mind.mjs converse), told what home shows.
import { watchBoard } from "./watch.mjs";
import { pendingReview, pushTasks } from "./tasks.mjs";
import { agentsList, runHandoff } from "./agents.mjs";
import { loadTasks } from "./core.mjs";
import { lanesState } from "./lanes.mjs";
import { converse, actIn, actNow, taskIn } from "./mind.mjs";
import { repoPathMap } from "./scan.mjs";
import { resolveProvider } from "./ai.mjs";

const KEEP = 15000; // the slower reads (git per repo awaiting review) are cached this long
let cached = null;

// { you: [{ kind, id, title, sub, shape }], feeds: [{ id, title, sub, count, shape }],
//   lanes: [{ from, to, text, status }], working: n, at }
function homeState({ now = Date.now(), fresh = false, deps = {} } = {}) {
  if (!fresh && !deps.board && cached && now - cached.at < KEEP) return cached;
  const board = deps.board || (() => { try { return watchBoard(24, now); } catch { return { cards: [] }; } });
  const pending = deps.pending || (() => { try { return pendingReview(); } catch { return []; } });
  const agents = deps.agents || (() => { try { return agentsList(); } catch { return []; } });
  const lanes = deps.lanes || (() => { try { return lanesState(); } catch { return { handoffs: [] }; } });
  const you = [];
  for (const r of pending()) {
    if (!r.path || r.running) continue;
    const n = (r.tasks || []).length, files = (r.files || []).length;
    if (!n && !files) continue;
    you.push({ kind: "approve", id: "approve:" + r.repo, title: `Approve ${r.repo}`, sub: `${n ? `${n} task${n > 1 ? "s" : ""} done` : "changes without a task"}${files ? ` · ${files} file${files > 1 ? "s" : ""}` : ""} · only you decide`, shape: "tasks" });
  }
  const list = agents(), seen = new Set();
  for (const a of list) {
    if (seen.has(a.path)) continue; seen.add(a.path);
    const q = a.ask && a.ask.questions && a.ask.questions[0];
    if (q) you.push({ kind: "ask", id: "ask:" + a.path, title: `${a.name} asks`, sub: String(q.q || "").slice(0, 90), shape: "agents" });
  }
  const feeds = ((board() || {}).cards || []).filter((c) => c.count > 0).map((c) => ({ id: "feed:" + c.id, title: c.name, sub: c.label, count: c.count, shape: "board" }));
  const hs = ((lanes() || {}).handoffs || []).slice(0, 5).map((h) => ({ from: h.from, to: h.to, text: h.text, status: h.status }));
  const working = list.filter((a) => a.status === "running").length;
  const out = { you: you.slice(0, 6), feeds: feeds.slice(0, 6), lanes: hs, working, at: now };
  if (!deps.board) cached = out;
  return out;
}

// One line per thing home shows, for the talk's context.
function homeContext(h) {
  return [
    `Only the user can do (${h.you.length}):`, ...h.you.map((y) => `- ${y.title}: ${y.sub}`),
    `New on what they watch:`, ...(h.feeds.length ? h.feeds.map((f) => `- ${f.title}: ${f.sub}`) : ["- nothing new"]),
    `Agents working: ${h.working}. Recent handovers:`, ...(h.lanes.length ? h.lanes.map((l) => `- ${l.from} → ${l.to}: ${l.text} (${l.status})`) : ["- none"]),
  ].join("\n");
}

// Home's talk: the same Symbiot, acting in the right lane (mind.mjs actIn/actNow).
async function homeAsk(question, { ask, now = Date.now(), state } = {}) {
  question = String(question || "").trim().slice(0, 2000);
  if (!question) return { error: "empty" };
  if (!ask && !resolveProvider()) return { error: "not-connected" };
  const h = state || homeState({ now });
  let map = {}; try { map = repoPathMap(); } catch {}
  const role = "Here they're on Symbiot's home: one liquid surface that shows what only they can do, what's new on what they watch, and the lanes. Answer from what it shows, and act on what they ask.";
  const r = await converse({ where: "Home", role, context: homeContext(h), question, map, now, ...(ask ? { ask } : {}),
    act: {
      agent: (req, known, repo) => (repo ? actIn(req, repo, { map, known, title: "Home" }) : actNow(req, { title: "Home", known })),
      task: (text, repo) => taskIn(text, repo, { map }),
    } });
  return { answer: r.reply, ...(r.did ? { did: r.did } : {}), steps: r.steps || [] };
}

// ---- the work scene: the liquid when you open Tasks or Agents ---------------------
// Plain words for someone who doesn't read diffs: what each agent is doing now,
// what's waiting its turn, what's done and waiting for your OK, and whether
// there's anything a Go would start. The details (steps, files, cost) stay one
// tap away, in the Agents panel.
const plain = (s, n = 64) => { s = String(s || "").replace(/[\`*_#>]/g, "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
function workScene({ deps = {} } = {}) {
  const agents = deps.agents || (() => { try { return agentsList(); } catch { return []; } });
  const pending = deps.pending || (() => { try { return pendingReview(); } catch { return []; } });
  const tasks = deps.tasks || (() => { try { return loadTasks(); } catch { return []; } });
  const seen = new Set(), running = [];
  for (const a of agents()) {
    if (a.status !== "running" || seen.has(a.path)) continue; seen.add(a.path);
    const w = a.work || {}, todo = (w.todos || []).find((t) => t.status === "in_progress"), pg = a.progress;
    running.push({ id: "run:" + a.path, path: a.path, name: a.name, doing: plain(todo ? todo.active : w.doing || "Working on it", 56), progress: pg || null, waiting: !!(a.ask && a.ask.questions && a.ask.questions.length) });
  }
  const ready = pending().filter((r) => r.path && !r.running && ((r.tasks || []).length || (r.files || []).length)).map((r) => ({ id: "ready:" + r.repo, repo: r.repo, count: (r.tasks || []).length }));
  const busy = new Set(running.map((r) => r.name)), open = tasks().filter((t) => !t.done && !t.archived && !t.review && t.repo);
  const waiting = open.map((t) => ({ id: "task:" + t.id, text: plain(t.text, 56), repo: t.repo, busy: busy.has(t.repo) }));
  // Projects: each repo with work on it, what's going on there in one line's worth
  const by = {}, at = (name) => (by[name] = by[name] || { repo: name, waiting: 0, ready: 0, running: null });
  running.forEach((r) => { at(r.name).running = { doing: r.doing, progress: r.progress, ask: r.waiting }; });
  ready.forEach((r) => { at(r.repo).ready = r.count || 1; });
  open.forEach((t) => { at(t.repo).waiting++; });
  const projects = Object.values(by).sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0) || b.ready - a.ready || b.waiting - a.waiting || (a.repo < b.repo ? -1 : 1));
  return { running, ready, waiting: waiting.slice(0, 12), waitingCount: waiting.length, canGo: waiting.filter((w) => !w.busy).length, projects: projects.slice(0, 10), projectCount: projects.length };
}
// Go: everything waiting goes to its repo's agent, the way Send to repos and an
// agent per repo would: briefs written, an agent started in each (or queued
// behind one already there). { started, queued, repos } or { error }.
function workGo({ push = pushTasks, run = runHandoff } = {}) {
  const r = push({});
  if (r.empty) return { started: 0, queued: 0, repos: [], note: "Nothing waiting to start." };
  let started = 0, queued = 0; const repos = [];
  for (const w of r.written || []) { const e = run(w.path); if (e && e.id && !e.busy && !e.blocked) started++; else queued++; repos.push(w.name); }
  return { started, queued, repos, ...(r.unresolved && r.unresolved.length ? { unresolved: r.unresolved.map((u) => u.name) } : {}) };
}

export { homeState, homeContext, homeAsk, workScene, workGo };
