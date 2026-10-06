// symbiot — Home: what the liquid shows, from real data. Three kinds of droplet:
// - only you: what no agent can do (an Approve waiting for you; an agent's open
//   question to you), always out front;
// - feeds: what's new on the sites you watch (watch.mjs), sized by how much;
// - lanes: work handed between agents (lanes.mjs), the latest few.
// The app's sections (Map, Tasks, Agents, Week…) are shaped by adapt.mjs from
// how you use them; this is the live data around them. Home's talk goes to the
// same Symbiot as every chat (mind.mjs converse), told what home shows.
import { watchBoard } from "./watch.mjs";
import { pendingReview } from "./tasks.mjs";
import { agentsList } from "./agents.mjs";
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

export { homeState, homeContext, homeAsk };
