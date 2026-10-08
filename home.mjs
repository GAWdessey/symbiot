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
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { watchBoard, draftReply } from "./watch.mjs";
import { pendingReview, pushTasks, addTask } from "./tasks.mjs";
import { agentsList, runHandoff, runningHandoff, handoffCmd, connectorsInfo, parkedPaths, agentMissing, settleNeeds, pickAgent, detectHandoffs, linkReach } from "./agents.mjs";
import { linksState } from "./links.mjs";
import { knowledgeState } from "./knowledge.mjs";
import { CONFIG_DIR, loadTasks, saveTasks, loadConfig, saveConfig } from "./core.mjs";
import { lanesState, stuckHandovers, allowHandover, skipHandover } from "./lanes.mjs";
import { converse, actIn, actNow, taskIn, loadMind } from "./mind.mjs";
import { repoPathMap, laneMap, reposState, scanRoots } from "./scan.mjs";
import { resolveProvider, PROVIDERS, claudeState } from "./ai.mjs";
import { reportsNews, listReports } from "./reports.mjs";
import { awaitingState, inboxSight } from "./handback.mjs";
import { newClashes } from "./checks.mjs";
import { postsState } from "./post.mjs";
import { MARKETING, MARKETING_DIR, MARKETING_WORDS, displayName, productNames, productOf, untagged, tagged, draftFiles } from "./marketing.mjs";

const KEEP = 15000; // the slower reads (git per repo awaiting review) are cached this long
let cached = null;
const RUNS = join(CONFIG_DIR, "drafts"); // an ops run's folder (mind.mjs actNow): its own lane, not a repo
const RUNS_LANE = "ops"; // what the work scene calls them all, together

// The lane a folder is: the repo it is (by the scan's map), or an ops run.
const laneOfPath = (path, map) => Object.keys(map || {}).find((n) => map[n] === path) || (String(path || "").startsWith(RUNS) ? "" : null);

// A run that failed shows for a day, until you run it again or skip it; one
// that's been followed by another run in its folder is past.
const FAILED_FOR = 86400000, dropped = new Set();
const firstLine = (t) => String(t || "").split("\n").find((l) => l.trim()) || "";
// What stopped and can't go on without you, as questions: a handover that couldn't
// start (lanes.mjs stuckHandovers: "Allow this run access to ~/Company?"), a run
// that ended waiting on you (agents.mjs needsOf: a draft for your OK, a sudo step,
// a step your answer left you) with what to check first, and a run that ended in an
// error. Each is answered on its blob (homeAnswer), on Home and on its lane in
// Tasks. repo: its lane ("" for an ops run).
function troubles({ stuck = [], list = [], map = {}, named = displayName, now = Date.now() } = {}) {
  const out = [], seen = new Set();
  for (const t of stuck) {
    const lane = t.from.lane === RUNS_LANE ? "" : t.from.lane;
    out.push({ kind: "ask", fix: "handover", id: "stuck:" + t.id, path: lane ? map[lane] || t.from.path : t.from.path, repo: lane, name: lane ? named(map[lane], lane) : "Agent runs",
      title: `${lane || "An agent run"} is stuck`, sub: plain(firstLine(t.text), 90), q: t.q, options: t.options, why: plain(t.error, 160), shape: "agents" });
  }
  for (const a of list) {
    if (seen.has(a.path)) continue; seen.add(a.path); // the newest run in each folder (agentsList: newest first)
    if (a.status === "running" || (a.ask && a.ask.questions && a.ask.questions.length)) continue; // at work, or it asked: that's its question
    const lane = laneOfPath(a.path, map), repo = lane || "", nm = repo ? named(map[lane], repo) : plain(String(a.name || "an agent").replace(/^Agent:\s*/, "").replace(/^\W*What['’]s needed:\W*/i, "").replace(/^./, (c) => c.toUpperCase()), 60);
    const n = a.needs;
    if (n && !dropped.has("needs:" + a.id)) {
      const ok = n.kind === "approve";
      out.push({ kind: "ask", fix: "needs", id: "needs:" + a.id, path: a.path, repo, name: nm, title: ok ? `${nm} waits for your OK` : `${nm} needs you`, sub: plain(n.label || n.what, 90),
        q: n.what + (n.check ? ` Check first: ${n.check}` : ""), options: ok ? ["Go ahead (recommended)", "Skip"] : ["Done it (recommended)", "Skip"], shape: "agents" });
      continue;
    }
    if (a.status !== "failed" || dropped.has(a.id) || (a.endedAt && now - a.endedAt > FAILED_FOR)) continue;
    const said = plain(String(a.tail || "").split(/\n+/).filter((l) => l.trim()).pop() || "", 140);
    out.push({ kind: "ask", fix: "failed", id: "failed:" + a.id, path: a.path, repo, name: nm, title: `${nm}'s run stopped`, sub: said || `it exited with code ${a.exitCode}`,
      q: `Its run stopped with an error${said ? `: ${said}` : ` (exit code ${a.exitCode})`}. Run it again?`, options: ["Run it again (recommended)", "Skip"], shape: "agents" });
  }
  return out;
}

// ---- next up: what can be done when nothing waits on you ----------------------------
// With "Only the user can do" empty, Home suggests a few things that CAN be done next,
// each with its gain spelled out and one tap that starts an agent or makes a task
// (homeNext), from what Symbiot already knows: unread reports, a task with no project,
// a handover that errored and was left, a project's tasks waiting days for its agent,
// new mail or chats with no reply, and a decision you made that no task carries yet.
// One you took stays away a week (NEXT_FILE); the app lets you dismiss the box.
const NEXT_FILE = join(CONFIG_DIR, "home-next.json"), NEXT_MAX = 5, NEXT_KEEP = 7 * 86400000, DAY = 86400000;
const STALE_AFTER = 3 * DAY, RETRY_WITHIN = 14 * DAY, DECIDED_WITHIN = 14 * DAY;
function loadNext(file = NEXT_FILE) { try { const d = JSON.parse(readFileSync(file, "utf8")); return d && typeof d.taken === "object" && d.taken ? d : { taken: {} }; } catch { return { taken: {} }; } }
function saveNext(d, file = NEXT_FILE) { try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(file, JSON.stringify(d), { mode: 0o600 }); } catch {} }
// a remembered decision that asks for something to be done ("the user wants…", "decided to…"), not a fact about how things are
const WANTS = /\b(?:wants?|decided|asked for|plans? to|going to|agreed to)\b/i;
const words4 = (s) => new Set(String(s || "").toLowerCase().match(/[a-z0-9]{4,}/g) || []);
// The lane a task's words name (whatsapp_module for "…the WhatsApp module…"), or "".
function laneNamed(text, lanes) {
  const t = " " + String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
  let best = "", len = 0;
  for (const l of lanes) { const k = l.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); if (k.length >= 4 && k.length > len && t.includes(" " + k + " ")) { best = l; len = k.length; } }
  return best;
}
const ago = (ms) => { const d = Math.floor(ms / DAY); return d >= 2 ? `${d} days` : d === 1 ? "a day" : "today"; };
// [{ id, title, gain, time, act: "agent"|"task"|"drafts"|"retry"|"go"|"assign", label }], best first.
function nextUp({ now = Date.now(), map = {}, list = [], named = displayName, deps = {} } = {}) {
  const tryOr = (f, d) => { try { return f(); } catch { return d; } };
  const taken = (deps.taken || (() => loadNext().taken))() || {};
  const fresh = (id) => !(taken[id] && now - taken[id] < NEXT_KEEP);
  const lanes = Object.keys(map), out = [];
  const busy = new Set(list.filter((a) => a.status === "running").map((a) => laneOfPath(a.path, map)).filter(Boolean));
  const parked = new Set(tryOr(deps.parked || parkedPaths, []) || []);
  const allTasks = (tryOr(deps.tasks || loadTasks, []) || []).filter(Boolean), tasks = allTasks.filter((t) => !t.done && !t.archived && !t.review);
  // unread reports: an agent reads them all and leaves one page, their next steps as ideas you add in a click
  const rep = tryOr(deps.reports || reportsNews, { count: 0 }) || { count: 0 };
  if (rep.count && fresh("next:reports")) out.push({ id: "next:reports", title: `Triage the ${rep.count} unread report${rep.count > 1 ? "s" : ""}`, gain: `clears the backlog: one page to read, and their next steps as tasks you add in a click`, time: `~${Math.max(5, Math.min(30, Math.ceil(rep.count * 1.25 / 5) * 5))} min, by an agent`, act: "agent", label: "Start an agent" });
  // a handover that errored and was left (older than Home's asks): run it on its own
  const retry = (tryOr(() => (deps.stuck || stuckHandovers)({ now, within: RETRY_WITHIN }), []) || []).filter((h) => fresh("next:retry:" + h.id));
  for (const h of retry.slice(0, 1)) out.push({ id: "next:retry:" + h.id, title: `Retry ${h.from.lane}'s handover: ${plain(firstLine(h.text), 70)}`, gain: `it errored ${ago(now - (h.at || now))} ago (${plain(String(h.error || "").replace(/[.\s]+$/, ""), 60) || "it didn't start"}), and ${h.from.lane}'s agent carries on once it's done`, time: "runs by itself", act: "retry", label: "Retry it" });
  // a project's tasks waiting days for its agent, nothing at work there
  const byRepo = {};
  for (const t of tasks) if (t.repo && map[t.repo] && !busy.has(t.repo) && !parked.has(map[t.repo])) (byRepo[t.repo] = byRepo[t.repo] || []).push(t);
  const stale = Object.keys(byRepo).map((r) => ({ repo: r, n: byRepo[r].length, oldest: Math.min(...byRepo[r].map((t) => Number(t.ts) || now)) }))
    .filter((g) => now - g.oldest > STALE_AFTER && fresh("next:go:" + g.repo)).sort((a, b) => a.oldest - b.oldest);
  for (const g of stale.slice(0, 2)) out.push({ id: "next:go:" + g.repo, title: `Send ${named(map[g.repo], g.repo)}'s ${g.n} waiting task${g.n > 1 ? "s" : ""} to its agent`, gain: `the oldest has waited ${ago(now - g.oldest)}, and nothing is at work there`, time: "runs by itself", act: "go", label: "Start its agent" });
  // a task with no project: the project its words name gets it, else an agent of its own
  for (const t of tasks.filter((x) => !x.repo && fresh("next:float:" + x.id)).slice(0, 1)) {
    const lane = laneNamed(t.text, lanes);
    out.push({ id: "next:float:" + t.id, title: `${lane ? `Give ${named(map[lane], lane)}` : "Start"} "${plain(t.text, 60)}"`, gain: lane ? `it has no project, so no agent picks it up: ${lane}'s agent takes it now` : "it has no project, so no agent picks it up: one of its own starts on it", time: "runs by itself", act: lane ? "assign" : "agent", label: "Start an agent", ...(lane ? { repo: lane } : {}) });
  }
  // new mail or chats with no reply: your agent drafts them, unsent, for you to check
  const cards = ((tryOr(deps.board || (() => watchBoard(24, now)), { cards: [] }) || {}).cards || []).filter((c) => c.count > 0 && /^(mail|chat|social)$/.test(c.source || "") && fresh("next:drafts:" + c.id));
  for (const c of cards.slice(0, 1)) { const k = Math.min(3, c.count), where = plain(String(c.name || "").split(" - ")[0], 30);
    out.push({ id: "next:drafts:" + c.id, title: c.count > k ? `Draft replies to the newest ${k} of the ${c.label} on ${where}` : `Draft replies to the ${c.label} on ${where}`, gain: "each waits as a draft, unsent, for you to check and send", time: `~${k * 3} min, by an agent`, act: "drafts", label: "Draft replies" }); }
  // a decision you made lately (Symbiot's memory) that no open task carries yet
  if (out.length < 3) {
    const nodes = (tryOr(deps.mind || (() => loadMind().nodes), []) || []).filter((n) => n.kind === "decision");
    const carried = allTasks.map((t) => words4(t.text)); // done or not: what a task already took on
    const facts = nodes.flatMap((n) => (n.facts || []).map((f) => ({ n, f }))).filter(({ f }) => now - (f.ts || 0) < DECIDED_WITHIN).sort((a, b) => b.f.ts - a.f.ts);
    for (const { n, f } of facts) {
      const id = "next:decision:" + n.id + ":" + (f.ts || 0), w = words4(f.text);
      if (!fresh(id) || !WANTS.test(f.text) || carried.some((c) => [...w].filter((x) => c.has(x)).length >= Math.max(3, w.size * 0.5))) continue;
      const lane = laneNamed(n.name + " " + f.text, lanes);
      out.push({ id, title: `Make a task of what you decided: ${plain(f.text, 70)}`, gain: `so it's done${lane ? ` in ${named(map[lane], lane)}` : ""}, not only remembered`, time: "a tap", act: "task", label: "Make a task", ...(lane ? { repo: lane } : {}), text: f.text });
      break;
    }
  }
  return out.slice(0, NEXT_MAX);
}
// Take a suggestion (its id, from homeState's next): it starts its agent or makes
// its task, and stays away a week. { ok, said } or { error }.
function homeNext(id, deps = {}) {
  id = String(id || ""); cached = null;
  const h = deps.state || homeState({ fresh: true }), s = (h.next || []).find((x) => x.id === id);
  if (!s) return { error: (h.you || []).length ? "Something needs you first: it's at the top of Home." : "That suggestion isn't here any more." };
  const map = (deps.repos || (() => { try { return laneMap(); } catch { return {}; } }))() || {};
  const run = deps.run || runHandoff, ref = id.split(":").slice(2).join(":");
  let r;
  if (s.act === "agent" && id === "next:reports") {
    const reps = (deps.reportsList || listReports)({ map }).filter((x) => x.new).slice(0, 20);
    if (!reps.length) return { error: "No unread reports left." };
    r = (deps.act || actNow)(`Triage the user's ${reps.length} unread Symbiot reports, so they read one page instead of ${reps.length}. Read each:\n${reps.map((x) => `- ${x.title} (${x.lane || "ops"}): ${x.file}`).join("\n")}\n\nWrite \`.symbiot/REPORTS-TRIAGE.md\` (a "# " title first): per report, two lines at most on what it found and what's still open, the ones that need a decision first. Put each open next step under \`## Suggestions\` in \`.symbiot/QUESTIONS.md\`, starting with its project's folder name (\`- [repo: <lane>] …\`), so the user adds it as a task in a click. Change nothing else.`, { title: "Home: what's next" });
  } else if (s.act === "agent") {
    const t = (deps.tasks || loadTasks)().find((x) => x.id === ref); if (!t) return { error: "That task isn't on the list any more." };
    r = (deps.act || actNow)(`${t.text}\n\n(This was on the user's task list with no project. If it belongs in one of their repos, hand it over to that lane.)`, { title: "Home: what's next" });
  } else if (s.act === "assign") {
    const all = (deps.tasks || loadTasks)(), t = all.find((x) => x.id === ref); if (!t) return { error: "That task isn't on the list any more." };
    t.repo = s.repo; (deps.save || saveTasks)(all);
    r = goLane(s.repo, map, { push: deps.push, run });
  } else if (s.act === "go") r = goLane(ref, map, { push: deps.push, run });
  else if (s.act === "retry") r = (deps.allow || allowHandover)(ref, {});
  else if (s.act === "task") r = (deps.task || taskIn)(s.text, s.repo || "", { map });
  else if (s.act === "drafts") {
    const card = ((deps.board || (() => watchBoard(24)))().cards || []).find((c) => c.id === ref), items = ((card && card.items) || []).filter((n) => n.need).slice(0, 3);
    if (!items.length) return { error: "Nothing there waits for a reply any more." };
    const done = items.map((n) => (deps.draft || draftReply)(n.id, { run })), okN = done.filter((x) => x && x.ok).length;
    r = okN ? { ok: true, n: okN } : done[0];
  }
  if (!r || r.error) return { error: (r && r.error) || "It didn't start. Check your agent in Settings." };
  const d = loadNext(deps.file); d.taken[id] = Date.now(); for (const k of Object.keys(d.taken)) if (Date.now() - d.taken[k] > NEXT_KEEP) delete d.taken[k]; saveNext(d, deps.file);
  const said = s.act === "task" ? `It's a task now${s.repo ? ` in ${s.repo}` : ""}.` : s.act === "drafts" ? `Your agent is drafting ${r.n} repl${r.n > 1 ? "ies" : "y"}. They wait, unsent, for you to check.` : s.act === "retry" ? "Started it as a run of its own. What it does goes back to the agent that asked." : r.queued ? "Its agent takes it once the run there now finishes." : "An agent started on it. It's on the Workdesk.";
  return { ok: true, said };
}
// A lane's waiting tasks to its agent, the way Go does for one project.
function goLane(repo, map, { push = pushTasks, run = runHandoff } = {}) {
  if (!map[repo]) return { error: `${repo} isn't one of your projects any more.` };
  const p = (push || pushTasks)({ repo }); if (!p || !p.written || !p.written.length) return { error: `Nothing of ${repo}'s is waiting to start.` };
  const e = (run || runHandoff)(map[repo]); if (!e) return { error: "The agent didn't start. Check its command in Settings → Handoff." };
  return e.parked ? { error: `${repo} is parked: unpark it to start its agent.` } : { ok: true, ...(e.busy || e.blocked ? { queued: true } : { job: e.id }) };
}

// ---- Marketing: a lane of its own, across products (marketing.mjs) ----------------------
// What its page shows, and its orb on Home: what needs you there (its agent's questions,
// its work waiting for your OK, the week's post drafts waiting on you), its tasks with the
// product each markets, other lanes' tasks about marketing, and what its agent drafted.
// on: whether Home shows its orb (once posts can be drafted, or it has anything at all).
function marketingState({ deps = {}, list, pend, map, named = displayName } = {}) {
  const tryOr = (f, d) => { try { return f(); } catch { return d; } };
  map = map || tryOr(deps.repos || laneMap, {}) || {};
  const dir = map[MARKETING] || MARKETING_DIR;
  const posts = tryOr(deps.posts || postsState, null) || { posts: [], done: [] };
  const tasks = (tryOr(deps.tasks || loadTasks, []) || []).filter((t) => t && !t.done && !t.archived);
  // the products to tag by: your repos', the ones tasks were tagged with, and those its agent drafted for
  const known = [...new Set([...productNames(map), ...tasks.map((t) => productOf(t.text)).filter(Boolean)])];
  const files = tryOr(() => (deps.files || draftFiles)(dir, known), []) || [];
  const names = [...new Set([...known, ...files.map((f) => f.product).filter(Boolean)])];
  list = list || tryOr(deps.agents || agentsList, []) || [];
  const run = list.find((a) => a.path === dir), qs = (run && run.ask && run.ask.questions) || [], working = !!(run && run.status === "running");
  const needs = qs.map((q, i) => ({ kind: "ask", id: "ask:" + i, text: plain(q.q, 160), options: (q.options || []).slice(0, 2), product: productOf(q.q, names) }));
  const ready = (pend || tryOr(deps.pending || pendingReview, []) || []).find((r) => r.repo === MARKETING && r.path && !r.running && ((r.tasks || []).length || (r.files || []).length));
  if (ready) { const n = (ready.tasks || []).length, f = (ready.files || []).length; needs.push({ kind: "approve", id: "approve", text: `${n ? `${n} piece${n > 1 ? "s" : ""} of marketing done` : "Marketing's agent changed things without a task"}${f ? ` · ${f} file${f > 1 ? "s" : ""}` : ""}: only you decide`, count: n || f }); }
  for (const p of (posts.posts || []).filter((x) => x.status === "waiting")) needs.push({ kind: "draft", id: "draft:" + p.id, text: plain(firstLine(p.text), 120), product: productOf(p.text, names) });
  const lane = tasks.filter((t) => t.repo === MARKETING).map((t) => ({ id: t.id, text: plain(untagged(t.text), 220), product: productOf(t.text, names), status: t.review ? "review" : working ? "working" : "waiting", ts: t.ts || 0 }));
  const elsewhere = tasks.filter((t) => t.repo !== MARKETING && MARKETING_WORDS.test(t.text)).slice(0, 12).map((t) => ({ id: t.id, text: plain(untagged(t.text), 220), product: productOf(t.text, names), repo: t.repo || "", name: t.repo ? named(map[t.repo], t.repo) : "" }));
  const seen = [...new Set([...lane, ...elsewhere, ...needs, ...files].map((x) => x.product).filter(Boolean))];
  const on = !!(posts.canDraft || (posts.posts || []).length || (posts.done || []).length || lane.length || elsewhere.length || files.length || needs.length || run);
  return { on, needs, needCount: needs.length, lane, elsewhere, files: files.map(({ rel, name, product, at }) => ({ rel, name, product, at })), products: [...new Set([...seen, ...names])], working, waiting: lane.filter((t) => t.status === "waiting").length };
}
// A task for Marketing, tagged with the product it markets (the page's Add). The task or { error }.
function marketingTask(text, product = "", { add = addTask } = {}) {
  text = String(text || "").trim(); if (!text) return { error: "Say what the marketing task is." };
  cached = null; return add(tagged(text, product), MARKETING);
}
// Another lane's task about marketing, moved to Marketing (and tagged): its agent takes it
// from then on. Not one waiting for your OK: approve or send it back where it is first.
function moveToMarketing(id, product = "", { load = loadTasks, save = saveTasks, map } = {}) {
  const all = load(), t = all.find((x) => x.id === String(id || ""));
  if (!t || t.done || t.archived) return { error: "That task isn't open any more." };
  if (t.review) return { error: "It waits for your OK where it is: approve it or send it back first." };
  if (product || !/^\s*\[/.test(t.text)) t.text = tagged(t.text, product || productOf(t.text, productNames(map || (() => { try { return laneMap(); } catch { return {}; } })())));
  t.repo = MARKETING; save(all); cached = null;
  return { ok: true, id: t.id };
}
// Start Marketing's agent on its waiting tasks (the page's Start its agent). { ok } or { error }.
function marketingGo(deps = {}) {
  cached = null;
  const map = (deps.repos || (() => { try { return laneMap(); } catch { return {}; } }))() || {};
  return goLane(MARKETING, map, { push: deps.push, run: deps.run });
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
  const repos = deps.repos || (() => { try { return laneMap(); } catch { return {}; } });
  const waits = deps.waits || (() => { try { return awaitingState().waits; } catch { return []; } });
  const clashes = deps.clashes || (() => { try { return newClashes(); } catch { return []; } });
  // can a reply be noticed? Email on (mail on this computer), or an inbox watched and signed in
  const seesInbox = deps.seesInbox || (() => { try { return inboxSight(); } catch { return true; } });
  // the agent the handoff command runs, gone from this computer; Claude connectors linked here but signed out
  const agentGone = deps.agentGone || (() => { try { return handoffCmd() ? agentMissing() : ""; } catch { return ""; } });
  const signedOut = deps.signedOut || (() => { try { const c = connectorsInfo(); return c.claude ? (c.links || []).filter((x) => x.connector && !x.ready) : []; } catch { return []; } });
  const stuck = deps.stuck || (() => { try { return stuckHandovers({ now }); } catch { return []; } });
  const agentCmd = deps.agentCmd || (() => { try { return handoffCmd(); } catch { return "x"; } });
  const offer = deps.pickAgent || (() => { try { return pickAgent(); } catch { return null; } });
  // Marketing, a lane of its own across products: its orb, lit when something there needs you
  const marketing = deps.marketing || ((o) => { try { const m = marketingState(o); return m.on ? { needs: m.needCount, working: m.working, waiting: m.waiting } : false; } catch { return false; } });
  const named = deps.name || displayName;
  const you = [], map = repos() || {};
  // What Symbiot works through (an AI, your agent, the connectors runs use) shows
  // only when it's missing, and then first (urgent): nothing works without it.
  // First run: what only a new user can do before the rest means anything.
  if (!connected()) you.push({ kind: "setup", id: "setup:ai", urgent: true, title: "Connect an AI", sub: "Symbiot can't work without one: your Claude subscription (sign in to Claude Code), a key, or a free local model", shape: "settings", focus: "ai" });
  const gone = agentGone(); if (gone) you.push({ kind: "setup", id: "setup:agent", urgent: true, title: "Your agent is unavailable", sub: `${gone} isn't on this computer any more, so no task can start`, shape: "settings", focus: "agent" });
  for (const c of signedOut()) you.push({ kind: "setup", id: "setup:conn:" + c.id, urgent: true, title: `Reconnect ${c.name}`, sub: `its Claude connector is signed out, so agent runs can't use ${c.name}`, shape: "settings", focus: "agent" });
  if (!Object.keys(map).some((n) => map[n] !== MARKETING_DIR)) you.push({ kind: "setup", id: "setup:folders", title: "Show me your work", sub: "where your repos are", shape: "settings", focus: "work" });
  // no agent yet: Send to repos and Go would only write TASKS.md files nothing runs, so
  // Home didn't say "All handled" truthfully. One click for the one on this computer.
  if (!agentCmd()) { const p = offer(); you.push({ kind: "setup", id: "setup:pick", title: "Pick your agent", sub: p ? `${p.name} is on this computer: one click and it takes your tasks` : "the coding agent that takes your tasks", shape: "settings", focus: "agent", ...(p ? { pick: { name: p.name, tmpl: p.tmpl } } : {}) }); }
  const pend = pending();
  for (const r of pend) {
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
  const bd = board() || {}, feeds = (bd.cards || []).filter((c) => c.count > 0).map((c) => ({ id: "feed:" + c.id, title: c.name, sub: c.label, count: c.count, shape: "board" }));
  // a clash in your files that matters (checks.mjs: high), first under Watching, until you've opened it
  const clash = clashes();
  if (clash.length) feeds.unshift({ id: "feed:clash", title: "Where your files disagree", sub: `${clash.length} clash${clash.length > 1 ? "es" : ""} to look at`, latest: plain(clash[0].text, 140), count: clash.length, shape: "settings" });
  const rep = reports();
  if (rep.count) feeds.push({ id: "feed:reports", title: "Reports", sub: `${rep.count} unread`, latest: rep.latest, count: rep.count, shape: "reports" });
  const hs = ((lanes() || {}).handoffs || []).slice(0, 5).map((h) => ({ from: h.from, to: h.to, text: h.text, status: h.status, ...(h.times > 1 ? { times: h.times } : {}) }));
  const working = list.filter((a) => a.status === "running").length;
  // nothing waits on you: a few things that can be done next (none while anything does)
  const next = you.length ? [] : nextUp({ now, map, list, named, deps: { board: () => bd, reports: () => rep, ...(deps.next || {}) } });
  const out = { you: you.slice(0, 6), youCount: you.length, feeds: feeds.slice(0, 6), lanes: hs, working, next, marketing: marketing({ list, map, named, pend }), at: now };
  if (!deps.board) cached = out;
  return out;
}

// An answer on a stuck handover's, a waiting run's or a failed run's blob. pick: the
// option's place (0 goes ahead, 1 skips); text: your own words, which go ahead with
// them unless they say no. The handover's run (lanes.mjs allowHandover) reports back
// to the agent that asked; a run waiting on your OK or your step starts again with
// "go ahead" or "done" in its ANSWERS.md (skipped, it doesn't ask again); a failed
// run starts again in its folder, with your words in its ANSWERS.md. { ok, said } or { error }.
const SAYS_NO = /^\s*(skip|no|nope|don'?t|do not|cancel|leave it|never ?mind|stop)\b/i;
// An answer, in the folder's ANSWERS.md, for the run that picks it up.
function noteAnswer(path, heading, text) {
  const f = join(path, ".symbiot", "ANSWERS.md"); let had = ""; try { had = readFileSync(f, "utf8"); } catch {}
  try { writeFileSync(f, `${(had || "# Answers\n").replace(/\s*$/, "")}\n\n### ${String(heading).replace(/\s+/g, " ").trim()}\n${text}\n_answered ${new Date().toISOString().slice(0, 10)}_\n`); } catch {}
}
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
    if (text) noteAnswer(a.path, "Your last run stopped with an error", text);
    const e = (deps.run || runHandoff)(a.path, { force: true }); dropped.add(ref);
    return e && e.id && !e.blocked ? { ok: true, said: "Running it again.", rerun: e.id } : { error: (e && e.note) || "It didn't start. Check your agent in Settings." };
  }
  if (id.startsWith("needs:")) {
    const a = (deps.agents || agentsList)().find((x) => x.id === ref), n = a && a.needs;
    if (!n) return { error: "That isn't waiting on you any more." };
    const settle = deps.settle || settleNeeds;
    if (!go) { settle(a.path, n.key); dropped.add(id); return { ok: true, said: "Skipped. It won't ask again." }; }
    if ((deps.running || runningHandoff)(a.path)) return { ok: true, said: "An agent is already at work there." };
    const said = n.kind === "approve" ? `Go ahead: ${text || "do it as you had it, once you've checked what you flagged"}.` : `Done: the user did it${text ? ` (${text})` : ""}. Check it worked, then carry on.`;
    noteAnswer(a.path, n.what, said);
    const e = (deps.run || runHandoff)(a.path, { force: true });
    if (e && e.id && !e.blocked) { settle(a.path, n.key); dropped.add(id); }
    return e && e.id && !e.blocked ? { ok: true, said: n.kind === "approve" ? "Its agent is going ahead." : "Its agent is checking and carrying on.", rerun: e.id } : { error: (e && e.note) || "It didn't start. Check your agent in Settings." };
  }
  return { error: "Answer that one on its block on the Workdesk." };
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
    ...(h.marketing ? [`Marketing (a lane of its own, for marketing across all their products; "repo": "${MARKETING}"): ${h.marketing.needs ? `${h.marketing.needs} thing${h.marketing.needs > 1 ? "s" : ""} there need${h.marketing.needs > 1 ? "" : "s"} them` : "nothing needs them"}${h.marketing.working ? ", its agent is at work" : ""}.`] : []),
    ...((h.next || []).length ? ["Could be done next (Home suggests these, one tap each):", ...h.next.map((s) => `- ${s.title}: ${s.gain} (${s.time})`)] : []),
  ].join("\n");
}

// Home's talk: the same Symbiot, acting in the right lane (mind.mjs actIn/actNow).
async function homeAsk(question, { ask, now = Date.now(), state, images = [] } = {}) {
  question = String(question || "").trim().slice(0, 2000);
  if (!question && images.length) question = "Take a look at this screenshot.";
  if (!question) return { error: "empty" };
  // the screenshots go to the model, and their files with any work it hands an agent
  let pics = []; try { pics = images.map((p) => ({ path: p, mime: /\.png$/i.test(p) ? "image/png" : /\.webp$/i.test(p) ? "image/webp" : /\.gif$/i.test(p) ? "image/gif" : "image/jpeg", data: readFileSync(p).toString("base64") })); } catch {}
  const shotNote = pics.length ? `\n\nScreenshots the user attached (open them with your Read tool): ${pics.map((i) => i.path).join(", ")}` : "";
  if (!ask && !resolveProvider()) return { error: "not-connected" };
  const h = state || homeState({ now });
  let map = {}; try { map = laneMap(); } catch {}
  const role = "Here they're on Symbiot's home: one liquid surface that shows what only they can do, what's new on what they watch, and the lanes. Answer from what it shows, and act on what they ask.";
  const r = await converse({ where: "Home", role, context: homeContext(h), question: question + (pics.length ? `\n(The user attached ${pics.length} screenshot${pics.length > 1 ? "s" : ""}: you can see ${pics.length > 1 ? "them" : "it"}.)` : ""), map, now, images: pics.map(({ mime, data, path }) => ({ mime, data, path })), ...(ask ? { ask } : {}),
    act: {
      agent: (req, known, repo) => (repo ? actIn(req + shotNote, repo, { map, known, title: "Home" }) : actNow(req + shotNote, { title: "Home", known })),
      task: (text, repo) => taskIn(text + shotNote, repo, { map }),
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
  const map = (deps.repos || (() => { try { return laneMap(); } catch { return {}; } }))() || {};
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

// ---- setup (the first run) --------------------------------------------------------
// A new Symbiot walks you through setup before anything else: what it is, your AI,
// where your work is, your agent, every app you use (connected, or "I don't use it"),
// your documents, then Home. It's in config.onboarding: { pending, step, skipped: [link
// ids you don't use] }; a Symbiot that ran before this existed isn't sent through it.
const ONB_STEPS = ["welcome", "ai", "work", "agent", "apps", "docs", "done"];
function onboarding({ fresh = false } = {}) {
  const cfg = loadConfig(), o = cfg.onboarding || {};
  const tryOr = (f, d) => { try { return f(); } catch { return d; } };
  let st = null; try { st = claudeState(fresh); } catch {}
  const r = tryOr(() => resolveProvider(), null);
  const reps = tryOr(() => reposState(), { searching: false, list: [] });
  const links = tryOr(() => linksState(), { items: [] }), reach = tryOr(() => linkReach(), null), skipped = new Set(o.skipped || []);
  const apps = (links.items || []).map((x) => ({ id: x.id, name: x.name, group: x.group, state: x.state, ...(x.note ? { note: x.note } : {}), skipped: skipped.has(x.id),
    ...(reach && reach.sites && reach.sites[x.id] ? { agents: !!reach.sites[x.id].ready, connector: reach.sites[x.id].name } : {}) }));
  const det = tryOr(() => detectHandoffs(), { agents: [] }), cmd = tryOr(() => handoffCmd(), "");
  return {
    pending: !!o.pending, step: ONB_STEPS.includes(o.step) ? o.step : "welcome", steps: ONB_STEPS,
    ai: { connected: !!r, provider: r ? r.provider : "", line: r ? `${PROVIDERS[r.provider].label}${r.model ? " · " + r.model : ""}` : "", claude: st ? { installed: st.installed, signedIn: st.signedIn } : null },
    work: { searching: reps.searching, done: reps.done || 0, total: reps.total || 0, count: reps.list.length, repos: reps.list.slice(0, 60).map((x) => ({ name: x.name, path: x.path })), roots: tryOr(() => scanRoots(), []).map((r) => (r === homedir() ? "~" : r.startsWith(homedir() + "/") ? "~" + r.slice(homedir().length) : r)) },
    agent: { cmd, pick: tryOr(() => pickAgent(), null), agents: (det.agents || []).map((a) => ({ label: a.label, tmpl: a.tmpl })) },
    apps, groups: links.groups || [], decided: apps.every((a) => a.skipped || a.state !== "off"),
    docs: { folders: tryOr(() => (knowledgeState().folders || []).map((f) => f.path), []) },
  };
}
// step: where you are; skip / unskip: an app you do or don't use; skipRest: every app not connected.
function setOnboarding({ step, skip, unskip, skipRest, done, restart } = {}) {
  const cfg = loadConfig(), o = { ...(cfg.onboarding || {}) }, sk = new Set(o.skipped || []);
  if (restart) { o.pending = true; o.step = "welcome"; }
  if (step && ONB_STEPS.includes(step)) o.step = step;
  if (skip) sk.add(String(skip)); if (unskip) sk.delete(String(unskip));
  if (skipRest) { try { for (const x of linksState().items) if (x.state === "off") sk.add(x.id); } catch {} }
  o.skipped = [...sk];
  if (done) { o.pending = false; o.done = Date.now(); o.step = "done"; }
  cfg.onboarding = o; saveConfig(cfg); cached = null;
  return onboarding();
}

export { marketingState, marketingGo, marketingTask, moveToMarketing, goLane, homeState, homeContext, homeAsk, homeAnswer, homeNext, nextUp, laneNamed, NEXT_FILE, workScene, workGo, displayName, firstSteps, onboarding, setOnboarding, ONB_STEPS };
