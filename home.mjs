// symbiot — Home: what the liquid shows, from real data. Three kinds of droplet:
// - only you: what no agent can do (an Approve waiting for you; an agent's open
//   question to you; on first run, connecting an AI and showing it your
//   folders), always out front;
// - feeds: what's new on the sites you watch (watch.mjs), sized by how much;
// - lanes: work handed between agents (lanes.mjs), the latest few.
// Reports agents wrote up that you haven't read (reports.mjs) are a feed too, and
// so is a clash in your company folder that matters (checks.mjs newClashes).
// The app's sections (Map, Tasks, Agents, Week…) are shaped by adapt.mjs from
// how you use them; this is the live data around them. Home's talk goes to the
// same Symbiot as every chat (mind.mjs converse), told what home shows.
import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import { watchBoard } from "./watch.mjs";
import { pendingReview, pushTasks } from "./tasks.mjs";
import { agentsList, runHandoff, runningHandoff, handoffCmd, connectorsInfo, parkedPaths, agentMissing } from "./agents.mjs";
import { linksState } from "./links.mjs";
import { knowledgeState } from "./knowledge.mjs";
import { CONFIG_DIR, loadTasks } from "./core.mjs";
import { lanesState, stuckHandovers, allowHandover, skipHandover } from "./lanes.mjs";
import { converse, actIn, actNow, taskIn } from "./mind.mjs";
import { repoPathMap } from "./scan.mjs";
import { resolveProvider } from "./ai.mjs";
import { reportsNews } from "./reports.mjs";
import { awaitingState, inboxSight } from "./handback.mjs";
import { newClashes } from "./checks.mjs";

const KEEP = 15000; // the slower reads (git per repo awaiting review) are cached this long
let cached = null;
const RUNS = join(CONFIG_DIR, "drafts"); // an ops run's folder (mind.mjs actNow): its own lane, not a repo
const RUNS_LANE = "ops"; // what the work scene calls them all, together

// A project's name as people say it: the folder can lag behind (CallForge AI is
// Dailify). The README's title when it's a short name, else package.json's name
// when it's a word, else the folder's. Read once per folder.
const NAMES = new Map();
function displayName(path, folder) {
  folder = String(folder || ""); if (!path) return folder;
  if (NAMES.has(path)) return NAMES.get(path);
  const read = (f) => { try { return readFileSync(join(path, f), "utf8"); } catch { return ""; } };
  const plainName = (s) => { s = String(s || "").replace(/[*`[\]]|^_+|_+$/g, "").trim(); return s && s.length <= 32 && s.split(/\s+/).length <= 4 && !/[:—–|]|\s-\s/.test(s) ? s : ""; };
  const h1 = plainName((read("README.md").match(/^#\s+(.+?)\s*#*\s*$/m) || [])[1]);
  let pkg = ""; try { pkg = String(JSON.parse(read("package.json")).name || "").replace(/^@[^/]+\//, ""); } catch {}
  const name = h1 || (/^[a-z][a-z0-9-]{1,30}$/i.test(pkg) && pkg.toLowerCase() !== folder.toLowerCase().replace(/\s+/g, "-") ? pkg.charAt(0).toUpperCase() + pkg.slice(1) : "") || folder;
  NAMES.set(path, name);
  return name;
}
// The lane a folder is: the repo it is (by the scan's map), or an ops run.
const laneOfPath = (path, map) => Object.keys(map || {}).find((n) => map[n] === path) || (String(path || "").startsWith(RUNS) ? "" : null);

// A run that failed shows for a day, until you run it again or skip it; one
// that's been followed by another run in its folder is past.
const FAILED_FOR = 86400000, dropped = new Set();
const firstLine = (t) => String(t || "").split("\n").find((l) => l.trim()) || "";
// What stopped and can't go on without you, as questions: a handover that couldn't
// start (lanes.mjs stuckHandovers: "Allow this run access to ~/Company?"), and a run
// that ended in an error. Each is answered on its blob (homeAnswer), on Home and on
// its lane in Tasks. repo: its lane ("" for an ops run).
function troubles({ stuck = [], list = [], map = {}, named = displayName, now = Date.now() } = {}) {
  const out = [], seen = new Set();
  for (const t of stuck) {
    const lane = t.from.lane === RUNS_LANE ? "" : t.from.lane;
    out.push({ kind: "ask", fix: "handover", id: "stuck:" + t.id, path: lane ? map[lane] || t.from.path : t.from.path, repo: lane, name: lane ? named(map[lane], lane) : "Agent runs",
      title: `${lane || "An agent run"} is stuck`, sub: plain(firstLine(t.text), 90), q: t.q, options: t.options, why: plain(t.error, 160), shape: "agents" });
  }
  for (const a of list) {
    if (seen.has(a.path)) continue; seen.add(a.path); // the newest run in each folder (agentsList: newest first)
    if (a.status !== "failed" || dropped.has(a.id) || (a.endedAt && now - a.endedAt > FAILED_FOR)) continue;
    if (a.ask && a.ask.questions && a.ask.questions.length) continue; // it asked: that's its question
    const lane = laneOfPath(a.path, map), repo = lane || "", nm = repo ? named(map[lane], repo) : plain(String(a.name || "an agent").replace(/^Agent:\s*/, ""), 60);
    const said = plain(String(a.tail || "").split(/\n+/).filter((l) => l.trim()).pop() || "", 140);
    out.push({ kind: "ask", fix: "failed", id: "failed:" + a.id, path: a.path, repo, name: nm, title: `${nm}'s run stopped`, sub: said || `it exited with code ${a.exitCode}`,
      q: `Its run stopped with an error${said ? `: ${said}` : ` (exit code ${a.exitCode})`}. Run it again?`, options: ["Run it again (recommended)", "Skip"], shape: "agents" });
  }
  return out;
}
// { you: [{ kind, id, title, sub, shape, … }], feeds: [{ id, title, sub, count, shape }],
//   lanes: [{ from, to, text, status, times }], working: n, at }
// An ask carries what its blob on home needs: the lane (repo, or "" for an ops
// run), its name as people say it, the question and its first two options.
function homeState({ now = Date.now(), fresh = false, deps = {} } = {}) {
  if (!fresh && !deps.board && cached && now - cached.at < KEEP) return cached;
  const board = deps.board || (() => { try { return watchBoard(24, now); } catch { return { cards: [] }; } });
  const pending = deps.pending || (() => { try { return pendingReview(); } catch { return []; } });
  const agents = deps.agents || (() => { try { return agentsList(); } catch { return []; } });
  const lanes = deps.lanes || (() => { try { return lanesState(); } catch { return { handoffs: [] }; } });
  const reports = deps.reports || (() => { try { return reportsNews(); } catch { return { count: 0 }; } });
  const connected = deps.connected || (() => !!resolveProvider());
  const repos = deps.repos || (() => { try { return repoPathMap(); } catch { return {}; } });
  const waits = deps.waits || (() => { try { return awaitingState().waits; } catch { return []; } });
  const clashes = deps.clashes || (() => { try { return newClashes(); } catch { return []; } });
  // can a reply be noticed? Email on (mail on this computer), or an inbox watched and signed in
  const seesInbox = deps.seesInbox || (() => { try { return inboxSight(); } catch { return true; } });
  // the agent the handoff command runs, gone from this computer; Claude connectors linked here but signed out
  const agentGone = deps.agentGone || (() => { try { return handoffCmd() ? agentMissing() : ""; } catch { return ""; } });
  const signedOut = deps.signedOut || (() => { try { const c = connectorsInfo(); return c.claude ? (c.links || []).filter((x) => x.connector && !x.ready) : []; } catch { return []; } });
  const stuck = deps.stuck || (() => { try { return stuckHandovers({ now }); } catch { return []; } });
  const named = deps.name || displayName;
  const you = [], map = repos() || {};
  // What Symbiot works through (an AI, your agent, the connectors runs use) shows
  // only when it's missing, and then first (urgent): nothing works without it.
  // First run: what only a new user can do before the rest means anything.
  if (!connected()) you.push({ kind: "setup", id: "setup:ai", urgent: true, title: "Connect an AI", sub: "Symbiot can't work without one: a key, or a free local model", shape: "settings", focus: "ai" });
  const gone = agentGone(); if (gone) you.push({ kind: "setup", id: "setup:agent", urgent: true, title: "Your agent is unavailable", sub: `${gone} isn't on this computer any more, so no task can start`, shape: "settings", focus: "agent" });
  for (const c of signedOut()) you.push({ kind: "setup", id: "setup:conn:" + c.id, urgent: true, title: `Reconnect ${c.name}`, sub: `its Claude connector is signed out, so agent runs can't use ${c.name}`, shape: "settings", focus: "agent" });
  if (!Object.keys(map).length) you.push({ kind: "setup", id: "setup:folders", title: "Show me your work", sub: "where your repos are", shape: "settings", focus: "work" });
  for (const r of pending()) {
    if (!r.path || r.running) continue;
    const n = (r.tasks || []).length, files = (r.files || []).length;
    if (!n && !files) continue;
    you.push({ kind: "approve", id: "approve:" + r.repo, repo: r.repo, name: named(r.path, r.repo), title: `Approve ${r.repo}`, sub: `${n ? `${n} task${n > 1 ? "s" : ""} done` : "changes without a task"}${files ? ` · ${files} file${files > 1 ? "s" : ""}` : ""} · only you decide`, shape: "tasks" });
  }
  const list = agents(), seen = new Set();
  for (const a of list) {
    if (seen.has(a.path)) continue; seen.add(a.path);
    const qs = (a.ask && a.ask.questions) || [], q = qs[0];
    if (!q) continue;
    const lane = laneOfPath(a.path, map), repo = lane || (lane === "" ? "" : a.name);
    you.push({ kind: "ask", id: "ask:" + a.path, path: a.path, repo, name: repo ? named(lane ? map[lane] : a.path, repo) : plain(String(a.name || "an agent").replace(/^Agent:\s*/, ""), 60),
      title: `${a.name} asks`, sub: String(q.q || "").slice(0, 90), q: String(q.q || ""), options: (q.options || []).slice(0, 2), ...(qs.length > 1 ? { more: qs.length - 1 } : {}), shape: "agents" });
  }
  // What stopped and can't go on without you, as a question too: a handover that
  // couldn't start (lanes.mjs stuckHandovers: "Allow this run access to ~/Company?"),
  // and a run that ended in an error. Answered on its blob (homeAnswer).
  you.push(...troubles({ stuck: stuck(), list, map, named, now }));
  // A run is waiting on an emailed reply that nothing will see: say so, once,
  // until an inbox is watched (and signed in) or Email is on (handback.mjs looks in either).
  if (waits().some((w) => w.status === "waiting")) {
    const s = seesInbox(), sight = s && typeof s === "object" ? s : { sees: !!s, signedOut: [] };
    if (!sight.sees) you.push(sight.signedOut.length
      ? { kind: "setup", id: "setup:inbox", signin: true, title: `Sign in to ${sight.signedOut[0]} again`, sub: "it's signed out, so I won't notice their reply", shape: "settings", focus: "links" }
      : { kind: "setup", id: "setup:inbox", title: "Let me see your inbox", sub: "so I notice their reply", shape: "settings", focus: "links" });
  }
  const feeds = ((board() || {}).cards || []).filter((c) => c.count > 0).map((c) => ({ id: "feed:" + c.id, title: c.name, sub: c.label, count: c.count, shape: "board" }));
  // a clash in your files that matters (checks.mjs: high), first under Watching, until you've opened it
  const clash = clashes();
  if (clash.length) feeds.unshift({ id: "feed:clash", title: "Where your files disagree", sub: `${clash.length} clash${clash.length > 1 ? "es" : ""} to look at`, latest: plain(clash[0].text, 140), count: clash.length, shape: "settings" });
  const rep = reports();
  if (rep.count) feeds.push({ id: "feed:reports", title: "Reports", sub: `${rep.count} unread`, latest: rep.latest, count: rep.count, shape: "reports" });
  const hs = ((lanes() || {}).handoffs || []).slice(0, 5).map((h) => ({ from: h.from, to: h.to, text: h.text, status: h.status, ...(h.times > 1 ? { times: h.times } : {}) }));
  const working = list.filter((a) => a.status === "running").length;
  const out = { you: you.slice(0, 6), youCount: you.length, feeds: feeds.slice(0, 6), lanes: hs, working, at: now };
  if (!deps.board) cached = out;
  return out;
}

// An answer on a stuck handover's or a failed run's blob. pick: the option's place
// (0 goes ahead, 1 skips); text: your own words, which go ahead with them unless
// they say no. The handover's run (lanes.mjs allowHandover) reports back to the
// agent that asked; a failed run starts again in its folder, with your words in its
// ANSWERS.md. { ok, said } or { error }.
const SAYS_NO = /^\s*(skip|no|nope|don'?t|do not|cancel|leave it|never ?mind|stop)\b/i;
function homeAnswer(id, { pick, text = "" } = {}, deps = {}) {
  id = String(id || ""); text = String(text || "").trim().slice(0, 2000);
  const go = text ? !SAYS_NO.test(text) : Number(pick) === 0, ref = id.replace(/^\w+:/, "");
  cached = null;
  if (id.startsWith("stuck:")) {
    if (!go) { const r = (deps.skip || skipHandover)(ref); return r.error ? r : { ok: true, said: "Skipped. Its agent knows." }; }
    const r = (deps.allow || allowHandover)(ref, { note: text }); if (r.error) return r;
    return { ok: true, said: `Started a run on it${r.dirs && r.dirs.length ? `, allowed into ${r.dirs.map((d) => (d.startsWith(homedir() + "/") ? "~" + d.slice(homedir().length) : d)).join(" and ")}` : ""}. What it does goes back to the agent that asked.` };
  }
  if (id.startsWith("failed:")) {
    const a = (deps.agents || agentsList)().find((x) => x.id === ref); if (!a) return { error: "That run isn't here any more." };
    if (!go) { dropped.add(ref); return { ok: true, said: "Skipped." }; }
    if ((deps.running || runningHandoff)(a.path)) return { ok: true, said: "An agent is already at work there." };
    if (text) { const f = join(a.path, ".symbiot", "ANSWERS.md"); let had = ""; try { had = readFileSync(f, "utf8"); } catch {}
      try { writeFileSync(f, `${(had || "# Answers\n").replace(/\s*$/, "")}\n\n### Your last run stopped with an error\n${text}\n_answered ${new Date().toISOString().slice(0, 10)}_\n`); } catch {} }
    const e = (deps.run || runHandoff)(a.path, { force: true }); dropped.add(ref);
    return e && e.id && !e.blocked ? { ok: true, said: "Running it again.", rerun: e.id } : { error: (e && e.note) || "It didn't start. Check your agent in Settings." };
  }
  return { error: "Answer that one on its block in Agents." };
}

// Settings' first steps, in the order they matter (FIRST-RUN-AUDIT.md: a new user
// found Settings one long page with nothing saying what comes first). Each is
// done or not from what's set up, so it ticks itself; the company folder is
// optional. The linked site says whether agent runs can use it too: only through
// Claude's own connector for it (a link signs in Symbiot's browser, not the run).
function firstSteps({ deps = {} } = {}) {
  const tryOr = (f, d) => { try { return f(); } catch { return d; } };
  const ai = tryOr(deps.connected || (() => !!resolveProvider()), false);
  const repos = Object.keys(tryOr(deps.repos || repoPathMap, {}) || {}).length;
  const cmd = String(tryOr(deps.cmd || handoffCmd, "") || "");
  const site = ((tryOr(deps.links || linksState, {}) || {}).items || []).find((x) => x.state && x.state !== "off");
  const conns = tryOr(deps.connectors || connectorsInfo, {}) || {};
  const folders = ((tryOr(deps.knowledge || knowledgeState, {}) || {}).folders || []).length;
  let runs = "";
  if (site) {
    const c = (conns.links || []).find((x) => x.id === site.id);
    runs = !conns.claude ? "Agent runs can't use it: they get connectors only with Claude Code as your agent."
      : c && c.ready ? `Agent runs can use it too, through Claude's ${c.connector || c.name} connector.`
      : c ? `Agent runs can't use it yet: connect ${c.name} in claude.ai → Settings → Connectors (only you can sign in there).`
      : "Agent runs can't use it: it signs in Symbiot's browser only, and Claude has no connector for it.";
  }
  const steps = [
    { id: "ai", title: "Connect an AI", done: ai, sub: ai ? "connected" : "a key, or a free local model" },
    { id: "work", title: "Where your work is", done: repos > 0, sub: repos ? `${repos} repo${repos > 1 ? "s" : ""} found` : "the folders your repos are in" },
    { id: "agent", title: "Your agent", done: !!cmd, sub: cmd ? "Send to repos hands tasks to it" : "the coding agent that takes your tasks" },
    { id: "site", title: "Link one site", done: !!site, sub: site ? `${site.name} linked. ${runs}` : "your mail, chat or code, so Symbiot sees what arrives" },
    { id: "company", title: "A company folder", optional: true, done: folders > 0, sub: folders ? "your chats can quote it, and Symbiot checks where its files disagree" : "documents your chats can quote, and Symbiot checks" },
  ];
  return { steps, done: steps.every((s) => s.done) };
}

// One line per thing home shows, for the talk's context.
function homeContext(h) {
  return [
    `Only the user can do (${h.you.length}):`, ...h.you.map((y) => `- ${y.title}: ${y.sub}${y.q && y.q !== y.sub ? ` (asks: ${y.q}${(y.options || []).length ? ` ${y.options.join(" / ")}` : ""})` : ""}`),
    `New on what they watch:`, ...(h.feeds.length ? h.feeds.map((f) => `- ${f.title}: ${f.sub}${f.latest ? ` (latest: ${f.latest})` : ""}`) : ["- nothing new"]),
    `Agents working: ${h.working}. Recent handovers:`, ...(h.lanes.length ? h.lanes.map((l) => `- ${l.from} → ${l.to}: ${l.text} (${l.status}${l.times ? `, handed over ${l.times} times` : ""})`) : ["- none"]),
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
// Projects (the lanes) are sorted the way you'd look for them: what needs you
// first (a question, an Approve), then what's at work, ready, waiting, and the
// most recent. Ops runs (act-…: no repo of their own) are one "Agent runs" lane,
// not a sphere each with an id for a name.
function workScene({ deps = {} } = {}) {
  const agents = deps.agents || (() => { try { return agentsList(); } catch { return []; } });
  const pending = deps.pending || (() => { try { return pendingReview(); } catch { return []; } });
  const tasks = deps.tasks || (() => { try { return loadTasks(); } catch { return []; } });
  const map = (deps.repos || (() => { try { return repoPathMap(); } catch { return {}; } }))() || {};
  const named = deps.name || displayName;
  const parked = new Set((deps.parked || (() => { try { return parkedPaths(); } catch { return []; } }))());
  const isParked = (repo) => !!map[repo] && parked.has(map[repo]);
  const laneOf = (a) => { const l = laneOfPath(a.path, map); return l === "" ? RUNS_LANE : l || a.name; };
  const seen = new Set(), running = [], asks = {};
  const AG = agents();
  for (const a of AG) {
    if (seen.has(a.path)) continue; seen.add(a.path);
    const nq = (a.ask && a.ask.questions && a.ask.questions.length) || 0;
    if (nq) asks[laneOf(a)] = (asks[laneOf(a)] || 0) + nq;
    if (a.status !== "running") continue;
    const w = a.work || {}, todo = (w.todos || []).find((t) => t.status === "in_progress"), pg = a.progress;
    running.push({ id: "run:" + a.path, path: a.path, name: a.name, lane: laneOf(a), doing: plain(todo ? todo.active : w.doing || "Working on it", 120), progress: pg || null, waiting: !!nq, started: a.startedAt || (a.elapsed ? Date.now() - a.elapsed : 0) });
  }
  const ready = pending().filter((r) => r.path && !r.running && ((r.tasks || []).length || (r.files || []).length)).map((r) => ({ id: "ready:" + r.repo, repo: r.repo, count: (r.tasks || []).length }));
  const busy = new Set(running.map((r) => r.lane)), open = tasks().filter((t) => !t.done && !t.archived && !t.review && t.repo);
  const waiting = open.map((t) => ({ id: "task:" + t.id, text: plain(t.text, 160), repo: t.repo, busy: busy.has(t.repo), ...(isParked(t.repo) ? { parked: true } : {}) })); // the app shortens it for a tag
  // Projects: each lane with work on it, what's going on there in one line's worth
  const by = {}, at = (name) => (by[name] = by[name] || { repo: name, name: name === RUNS_LANE ? "Agent runs" : named(map[name], name), waiting: 0, ready: 0, asks: 0, running: null, last: 0, ...(name === RUNS_LANE ? { runs: 0 } : {}) });
  running.forEach((r) => { const p = at(r.lane); if (r.lane === RUNS_LANE) p.runs++; if (!p.running) p.running = { doing: r.doing, progress: r.progress, ask: r.waiting }; p.last = Math.max(p.last, r.started || 0); });
  ready.forEach((r) => { at(r.repo).ready = r.count || 1; });
  open.forEach((t) => { const p = at(t.repo); p.waiting++; p.last = Math.max(p.last, Number(t.ts) || 0); });
  Object.keys(asks).forEach((l) => { at(l).asks = asks[l]; });
  // The relay (the Tasks screen, so you needn't open Agents): per project, what its
  // latest run did or is doing in a line, its open questions with their answers,
  // and the extra tasks its agents suggested, each with the folder that asked.
  const DAY = 86400000, now = Date.now(), seenR = new Set();
  for (const a of AG) {
    if (seenR.has(a.path)) continue; seenR.add(a.path);
    const l = laneOf(a), qs = (a.ask && a.ask.questions) || [], ideas = ((a.ask && a.ask.suggestions) || []).filter((s) => s && s.text && !s.added);
    const age = a.startedAt ? now - a.startedAt : a.elapsed != null ? a.elapsed : Infinity, recent = a.status === "running" || age < DAY;
    if (!by[l] && !qs.length && !ideas.length && !recent) continue;
    const p = at(l);
    if (!p.summary && (recent || qs.length)) {
      const w = a.work || {}, todo = (w.todos || []).find((x) => x.status === "in_progress"), t = a.status === "running" ? ((todo && todo.active) || w.doing || "Working on it") : (w.final || a.tail || "");
      const line = plain(String(t).split(/\n\s*\n/)[0], 220);
      if (line) { p.summary = line; p.state = a.status === "running" ? "at work" : qs.length ? "asks you" : "done"; p.path = a.path; }
    }
    for (const q of qs) { p.qs = p.qs || []; if (p.qs.length < 3) p.qs.push({ q: q.q, options: (q.options || []).slice(0, 3), path: a.path }); }
    for (const s of ideas) { p.ideas = p.ideas || []; if (p.ideas.length < 4) p.ideas.push({ text: plain(s.text, 200), full: String(s.text), repo: s.repo || l, path: a.path }); }
  }
  const stuck = deps.stuck || (() => { try { return stuckHandovers(); } catch { return []; } });
  for (const t of troubles({ stuck: stuck(), list: AG, map, named })) {
    const p = at(t.repo || RUNS_LANE); p.asks++; p.qs = p.qs || [];
    if (p.qs.length < 3) p.qs.unshift({ q: t.q, options: t.options, path: t.path, fix: t.fix, id: t.id, sub: t.sub });
  }
  for (const p of Object.values(by)) { p.lit = !!(p.asks || p.ready); if (isParked(p.repo)) p.parked = true; }
  const projects = Object.values(by).sort((a, b) => (b.lit ? 1 : 0) - (a.lit ? 1 : 0) || (a.parked ? 1 : 0) - (b.parked ? 1 : 0) || (b.running ? 1 : 0) - (a.running ? 1 : 0) || b.ready - a.ready || b.waiting - a.waiting || b.last - a.last || (a.repo < b.repo ? -1 : 1));
  return { running, ready, waiting: waiting.slice(0, 12), waitingCount: waiting.length, canGo: waiting.filter((w) => !w.busy && !w.parked).length, projects: projects.slice(0, 24), projectCount: projects.length };
}
// Go: everything waiting goes to its repo's agent, the way Send to repos and an
// agent per repo would: briefs written, an agent started in each (or queued
// behind one already there); a parked project's wait for it to be unparked.
// { started, queued, repos, parked? } or { error }.
function workGo({ push = pushTasks, run = runHandoff } = {}) {
  const r = push({});
  if (r.empty) return { started: 0, queued: 0, repos: [], note: "Nothing waiting to start." };
  let started = 0, queued = 0; const repos = [], parked = [];
  for (const w of r.written || []) { const e = run(w.path); if (e && e.parked) { parked.push(w.name); continue; } if (e && e.id && !e.busy && !e.blocked) started++; else queued++; repos.push(w.name); }
  return { started, queued, repos, ...(parked.length ? { parked } : {}), ...(r.unresolved && r.unresolved.length ? { unresolved: r.unresolved.map((u) => u.name) } : {}) };
}

export { homeState, homeContext, homeAsk, homeAnswer, workScene, workGo, displayName, firstSteps };
