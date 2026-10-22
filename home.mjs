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
import { claudeSetup } from "./claudesetup.mjs";
import { heldAsks } from "./handover.mjs";
import { plainAsk } from "./plain.mjs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { watchBoard, draftReply, draftCards, draftAnswer } from "./watch.mjs";
import { pendingReview, pushTasks, addTask, taskType, releaseNotIn } from "./tasks.mjs";
import { estimate, estimateWords } from "./estimate.mjs";
import { agentQuestions, answerQuestions, heldAsk, grantCard, cardIsPermission, onCardGone, setHandoffCmd, agentsList, agentsNow, forgetAgents, runHandoff, runningHandoff, handoffCmd, loadRuns, connectorsInfo, parkedPaths, agentMissing, settleNeeds, closeAsk, pickAgent, detectHandoffs, linkReach, unchangedStep, whereOf, claudePause, parkLane } from "./agents.mjs";
import { stallCards, loadStall, saveStall } from "./stall.mjs";
import { isDone, recordDone, doneList, asksBack, askBackNote, wantsReport, closesAsk, heldBy, reportsSince, talkOf, addTalk, talkText, YES, asksQ, saysDone, wantsToRead } from "./asksdone.mjs";
import { captureSecrets } from "./vault.mjs";
import { linksState, signInAsked } from "./links.mjs";
import { knowledgeState } from "./knowledge.mjs";
import { CONFIG_DIR, loadTasks, saveTasks, loadConfig, saveConfig, sameTask, isFinding, writeJsonAtomic } from "./core.mjs";
import { lanesState, stuckHandovers, allowHandover, skipHandover, handingOf, loadLedger, doneSince, sharedTo, projectOf } from "./lanes.mjs";
import { windowSince, BROWSER_IDLE_MIN } from "./headless.mjs";
import { control } from "./control.mjs";
import { jobsLines, parkedJobs, syncOnUser, syncTasks, onUser, runRecord } from "./jobs.mjs";
import { goalCards } from "./goals.mjs";
import { intuitionUpdates, intuitionLines } from "./intuition.mjs";
import { overridesUpdates } from "./overrides.mjs";
import { splitNeeds, applyText, loadCardText } from "./needs.mjs";
import { converse, actIn, actNow, taskIn, loadMind, dayMark } from "./mind.mjs";
import { repoPathMap, laneMap, reposState, scanRoots } from "./scan.mjs";
import { resolveProvider, PROVIDERS, claudeState } from "./ai.mjs";
import { reportsNews, listReports, readReport, decide, markIdeas, sweepSuperseded } from "./reports.mjs";
import { awaitingState, inboxSight } from "./handback.mjs";
import { newClashes } from "./checks.mjs";
import { postsState } from "./post.mjs";
import { sentLine } from "./sentmail.mjs";
import { laneCap, verdict, peel, inflight, inflightIds, parallelLane, openTasksOf, laneFacts, dropHeld, startParallel, besideAgain } from "./parallel.mjs";
import { licenceState, isPro } from "./licence.mjs";
import { PHONE, ANDROID_APP, computerView, phoneApprovals, linkState, ask as askComputer } from "./phone.mjs";
import { draftPreview, MARKETING, MARKETING_DIR, aboutMarketing, displayName, productNames, productOf, untagged, tagged, draftFiles, setDraftStatus, postedCmd } from "./marketing.mjs";

const KEEP = 15000; // the slower reads (git per repo awaiting review) are cached this long
let cached = null;
const RUNS = join(CONFIG_DIR, "drafts"); // an ops run's folder (mind.mjs actNow): its own lane, not a repo
const RUNS_LANE = "ops"; // what the work scene calls them all, together

// The lane a folder is: the repo it is (by the scan's map), or an ops run.
const projectFor = (path, map, ledger) => { const l = laneOfPath(path, map); if (l) return l; if (!String(path || "").startsWith(RUNS)) return ""; try { return projectOf(path, { map, ledger }); } catch { return ""; } };
const laneOfPath = (path, map) => Object.keys(map || {}).find((n) => map[n] === path) || parallelLane(path) || (String(path || "").startsWith(RUNS) ? "" : null);

// A run that failed shows for a day, until you run it again or skip it; one
// that's been followed by another run in its folder is past.
const FAILED_FOR = 86400000, dropped = new Set();
// The button on a card that waits for a step only the user can take. "Done it (recommended)" read as a
// status (Symbiot already did it); it means "press this once you have", so it says that and isn't recommended.
const I_DID_IT = "I've done this";
const firstLine = (t) => String(t || "").split("\n").find((l) => l.trim()) || "";
// A card's "Read the report" (agents.mjs needsOf, agentQuestions): what Reports opens it by.
const reportLink = (r) => (r && r.id ? { report: { id: r.id, title: plain(r.title, 90) } } : {});
// What stopped and can't go on without you, as questions: a handover that couldn't
// start (lanes.mjs stuckHandovers: "Allow this run access to ~/Company?"), a run
// that ended waiting on you (agents.mjs needsOf: a draft for your OK, a sudo step,
// a step your answer left you) with what to check first, and a run that ended in an
// error. Each is answered on its blob (homeAnswer), on Home and on its lane in
// Tasks. repo: its lane ("" for an ops run).
function troubles({ stuck = [], list = [], map = {}, named = displayName, now = Date.now(), drafts = [], stalls = [] } = {}) {
  const out = [], seen = new Set();
  // an agent that stalled twice (stall.mjs): Symbiot stopped it, restarted it once, and paused its lane; one urgent card
  for (const st of stalls) {
    if (!st.card) continue;
    seen.add(st.path);
    const lane = laneOfPath(st.path, map), nm = lane ? named(map[lane], lane) : plain(String(st.path).split("/").pop(), 40);
    out.push({ kind: "ask", fix: "stalled", urgent: true, id: "stalled:" + st.path, path: st.path, repo: lane || "", name: nm, title: `${nm}'s agent is stuck`, sub: plain(st.where, 90),
      q: `Its agent stalled twice on: ${plain(st.where, 200)}${st.task ? ` (the item: ${plain(st.task, 120)})` : ""}. Symbiot stopped it, started it again once with a note to skip that step, and it stalled again, so its lane is paused. Its changes are kept.`,
      options: ["Start it again on its other tasks, leaving that item for later (recommended)", "Leave it paused"], status: "Stuck", shape: "agents" });
  }
  const stoppedFor = new Set(stalls.map((st) => st.run).filter(Boolean)); // a run Symbiot stopped for stalling isn't a run that failed
  // a drafted reply: the reply itself on the card, as it will look, and Go ahead sends it (watch.mjs draftCard)
  for (const c of drafts) {
    seen.add(c.dir);
    const to = c.to ? ` to ${c.to}` : "";
    out.push({ kind: "ask", fix: "draft", id: "draft:" + c.id, path: c.dir, repo: "", name: `Reply${to} on ${c.platform}`, title: `Reply${to} on ${c.platform}`, sub: plain(c.text, 90),
      q: `Go ahead sends it${to} from your ${c.platform}, signed in in Symbiot's browser, exactly as it shows here.`, options: ["Go ahead (recommended)", "Skip"],
      draft: { platform: c.platform, kind: c.kind, to: c.to, text: c.text }, shape: "agents" });
  }
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
    if (n && !dropped.has("needs:" + a.id) && !isDone(n.what) && (n.reportFirst || !heldNeeds(n.what, a.path, lane))) { // asked back, and now pointing at its report: that's the card they're waiting for
      const ok = n.kind === "approve";
      out.push({ kind: "ask", fix: "needs", id: "needs:" + a.id, path: a.path, repo, ...(ok ? { ok } : {}), name: nm, title: ok ? `${nm} waits for your OK` : `${nm} needs you`, sub: plain(n.label || n.what, 90),
        q: n.what + (n.check ? ` Check first: ${n.check}` : ""), options: ok ? ["Go ahead (recommended)", "Skip"] : [I_DID_IT, "Skip"], status: "Waiting on you", ...(n.api ? { api: n.api } : signInCard([n.label, n.what, n.check])), ...reportLink(n.report), shape: "agents" });
      continue;
    }
    if (a.status !== "failed" || dropped.has(a.id) || stoppedFor.has(a.id) || a.down || (a.endedAt && now - a.endedAt > FAILED_FOR)) continue; // down: Claude itself was out, and Home has one card for that
    const said = plain(String(a.tail || "").split(/\n+/).filter((l) => l.trim()).pop() || "", 140);
    out.push({ kind: "ask", fix: "failed", id: "failed:" + a.id, path: a.path, repo, name: nm, title: `${nm}'s run stopped`, sub: said || `it exited with code ${a.exitCode}`,
      q: `Its run stopped with an error${said ? `: ${said}` : ` (exit code ${a.exitCode})`}. Run it again?`, options: ["Run it again (recommended)", "Skip"], shape: "agents" });
  }
  return out;
}

// Where your repos are is a fact on this disk, not a thing only you know: Symbiot
// finds them itself (scan.mjs, on start and every few minutes) and never asks for it.
// "Show me your work: where your repos are" asked anyway whenever the list was empty,
// and it was empty while the first search ran and whenever one was cut short. Now:
// once it has found them, you're asked once to confirm (or correct, in your own
// words: an agent fixes it); and for a folder only when a finished search found none.
// Folders you set in Settings (scanRoots) are your answer already: the list isn't
// asked about again, and a search that finds nothing in them is Symbiot's to retry
// (Settings says so under the folders), never a card asking where your work is.
function reposCard({ map = {}, search = {}, confirmed = false, rootsSet = false } = {}) {
  const found = Object.keys(map).filter((n) => map[n] !== MARKETING_DIR);
  if (found.length) {
    if (confirmed || rootsSet) return [];
    const list = found.slice(0, 8).join(", ") + (found.length > 8 ? ` and ${found.length - 8} more` : "");
    return [{ kind: "ask", fix: "repos", id: "repos:confirm", path: "", repo: "", name: "Your projects", title: `I found ${found.length} project${found.length > 1 ? "s" : ""}`, sub: plain(list, 90),
      q: `I found these on this computer: ${list}. Is that all of them? If one's missing or shouldn't be there, say which.`, options: ["Looks right (recommended)", "Skip"], shape: "settings" }];
  }
  if (search.searching || !search.at || rootsSet) return []; // still looking, or you've said where: nothing to ask
  return [{ kind: "setup", id: "setup:folders", title: "No projects found", sub: "I searched your folders and found no repos: add the folder they're in", shape: "settings", focus: "work" }];
}
const SAYS_YES = /^\s*(yes|yep|yeah|ok|okay|looks (right|good)|correct|right|all good|that'?s (all|it|right))\b[\s.!]*$/i;
// Your answer on it: right (or skipped) settles it; anything else is a correction an
// agent makes (adds the folder, says why one is missing), not a chore for you.
function reposAnswer({ pick, text = "" } = {}, { act = actNow, repos = laneMap } = {}) {
  const skip = /^\s*(skip|no|nope|never ?mind|leave it)[\s.!]*$/i.test(text); // a whole "no", not "no, ~/work is missing"
  const fix = text && !SAYS_YES.test(text) && !skip;
  const cfg = loadConfig(); cfg.reposConfirmed = { at: Date.now(), ...(fix ? { fix: text } : {}) }; saveConfig(cfg);
  if (!fix) return { ok: true, said: Number(pick) === 1 || skip ? "Skipped. Change the folders any time in Settings." : "Good. New ones are picked up as they appear." };
  let found = {}; try { found = repos() || {}; } catch {}
  const list = Object.entries(found).filter(([, p]) => p !== MARKETING_DIR).map(([n, p]) => `- ${n}: ${p}`).join("\n");
  const r = act(`Correct the list of projects Symbiot found on this computer. The user said: "${text}"`, { title: "fix the project list",
    context: `Symbiot scans ${scanRoots().join(", ")} for git repos (scan folders: Settings, or scanRoots in ~/.config/symbiot/config.json). It found:\n${list}\nFind what the user means on disk yourself; don't ask them where things are.` });
  return r.error ? { error: r.error } : { ok: true, said: "An agent is fixing the list from what you said." };
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
// A new project's first task (Home's "look over" suggestion): ideas back as Suggestions, no changes.
const FIRST_LOOK = "Get to know this project and suggest what to do first: read its README, its recent commits and any TODO or FIXME notes, and run its tests if it has any. Change no files. Write your best 3 to 5 next steps under ## Suggestions in .symbiot/QUESTIONS.md, best first, each saying in plain words what it changes and why it's worth doing, then tick this task.";
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
  // someone new: projects found, not one task yet anywhere, so Home said "Nothing needs you" and
  // showed no sign of their projects (first-run review, 19 Oct 2026). Their agent looks over the
  // one they worked on last and suggests what to do first, changing nothing.
  if (!out.length && !allTasks.length && lanes.length) {
    const last = (l) => tryOr(() => (deps.touched || ((d) => statSync(join(d, ".git")).mtimeMs))(map[l]), 0) || 0;
    const l = lanes.filter((x) => x !== MARKETING && x !== RUNS_LANE && fresh("next:first:" + x)).sort((a, b) => last(b) - last(a))[0];
    if (l) out.push({ id: "next:first:" + l, title: `Have your agent look over ${named(map[l], l)} and suggest what to do first`, gain: "it reads the project and changes nothing: its ideas come back for you to add as tasks in a click", time: "runs by itself", act: "first", label: "Start its agent", repo: l, name: named(map[l], l) });
  }
  return out.slice(0, NEXT_MAX);
}
// Take a suggestion (its id, from homeState's next): it starts its agent or makes
// its task, and stays away a week. { ok, said } or { error }.
function homeNext(id, deps = {}) {
  id = String(id || ""); cached = null;
  const h = deps.state || homeState({ fresh: true }), s = (h.next || []).find((x) => x.id === id) || (h.nextAll || []).find((x) => x.id === id);
  if (!s) return { error: "That suggestion isn't here any more." }; // a tap on a card that was on screen when something started needing you still goes ahead (nextAll)
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
  else if (s.act === "first") {
    const t = (deps.task || taskIn)(FIRST_LOOK, ref, { map }); r = t && t.error ? t : goLane(ref, map, { push: deps.push, run });
  }
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
  const said = s.act === "task" ? `It's a task now${s.repo ? ` in ${s.repo}` : ""}.` : s.act === "drafts" ? `Your agent is drafting ${r.n} repl${r.n > 1 ? "ies" : "y"}. They wait, unsent, for you to check.` : s.act === "retry" ? "Started it as a run of its own. What it does goes back to the agent that asked." : s.act === "first" && !r.queued ? `Your agent is looking over ${s.name || ref}. Its ideas show on the Workdesk, for you to add as tasks.` : r.queued ? "Queued: it starts beside the run there if they don't clash. The Workdesk says what it waits on if they do." : "An agent started on it. It's on the Workdesk.";
  return { ok: true, said };
}
// A lane's waiting tasks to its agent, the way Go does for one project.
function goLane(repo, map, { push = pushTasks, run = runHandoff } = {}) {
  if (!map[repo]) return { error: `${repo} isn't one of your projects any more.` };
  const p = (push || pushTasks)({ repo, later: true }); if (!p || !p.written || !p.written.length) return { error: `Nothing of ${repo}'s is waiting to start.` };
  const e = (run || runHandoff)(map[repo]); if (!e) return { error: "The agent didn't start. Check its command in Settings → Handoff." };
  if (e.parked) return { error: `${repo} is parked: unpark it to start its agent.` };
  if (e.blocked && !e.busy) return { error: `${repo}'s agent didn't start: ${e.note || "it's waiting on something"}` }; // queued only behind a run that's really going
  return { ok: true, ...(e.busy ? { queued: true } : { job: e.id }) };
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
  list = list || tryOr(deps.agents || agentsNow, []) || [];
  const run = list.find((a) => a.path === dir), qs = (run && run.ask && run.ask.questions) || [], working = !!(run && run.status === "running");
  const needs = qs.map((q, i) => ({ kind: "ask", id: "ask:" + i, text: plain(q.q, 160), options: (q.options || []).slice(0, 2), product: productOf(q.q, names) }));
  const ready = (pend || tryOr(deps.pending || pendingReview, []) || []).find((r) => r.repo === MARKETING && r.path && !r.running && !r.shipping && !r.leftover && ((r.tasks || []).length || (r.files || []).length));
  if (ready) { const n = (ready.tasks || []).length, f = (ready.files || []).length; needs.push({ kind: "approve", id: "approve", text: `${n ? `${n} piece${n > 1 ? "s" : ""} of marketing done` : "Marketing's agent changed things without a task"}${f ? ` · ${f} file${f > 1 ? "s" : ""}` : ""}: only you decide`, count: n || f }); }
  for (const p of (posts.posts || []).filter((x) => x.status === "waiting")) needs.push({ kind: "draft", id: "draft:" + p.id, text: plain(firstLine(p.text), 120), product: productOf(p.text, names) });
  // a post its agent drafted that you haven't approved or skipped: approving its preview is
  // the only step a post needs from you, so it's lit here (and on Home's orb), Preview one click away
  for (const f of files.filter((x) => !x.status && !x.doc)) needs.push({ kind: "post", id: "post:" + f.rel, rel: f.rel, text: plain(f.name, 120) + (f.reopened && f.reopened.was === "approved" ? " (edited since you approved it: approve again)" : ""), product: f.product, ...(f.reopened ? { reopened: true } : {}) });
  const lane = tasks.filter((t) => t.repo === MARKETING).map((t) => ({ id: t.id, text: plain(untagged(t.text), 220), product: productOf(t.text, names), status: t.review ? "review" : working ? "working" : "waiting", ts: t.ts || 0 }));
  const elsewhere = tasks.filter((t) => t.repo !== MARKETING && aboutMarketing(t.text)).slice(0, 12).map((t) => ({ id: t.id, text: plain(untagged(t.text), 220), product: productOf(t.text, names), repo: t.repo || "", name: t.repo ? named(map[t.repo], t.repo) : "" }));
  const seen = [...new Set([...lane, ...elsewhere, ...needs, ...files].map((x) => x.product).filter(Boolean))];
  const on = !!(posts.canDraft || (posts.posts || []).length || (posts.done || []).length || lane.length || elsewhere.length || files.length || needs.length || run);
  return { on, needs, needCount: needs.length, lane, elsewhere, files: files.map(({ rel, name, product, at, status, doc }) => ({ rel, name, product, at, status, doc: !!doc })), products: [...new Set([...seen, ...names])], working, waiting: lane.filter((t) => t.status === "waiting").length };
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
// Approve or Skip on a draft's preview: your only step in a post. Approved, its agent is
// told in ANSWERS.md to post it (or schedule it for its date) through Symbiot's signed-in
// browser with exactly the text you saw, and starts; skipped, it's told not to.
// Change it: what you typed goes to its agent as a redraft of that same file; its card
// leaves your list until the new version is there, and then asks for your approval again.
// A plan (`platform: plan`) has nowhere to post: its Approve just marks it accepted (other
// documents, a listing, still can't be approved). It used to tell the agent "Post it on plan, through Symbiot's signed-in browser",
// leaving it to guess what that meant (12 Oct 2026).
function marketingDraftAnswer(rel, status, deps = {}) {
  const dir = deps.dir || MARKETING_DIR, ask = String(deps.ask || "").trim(), set = deps.set || setDraftStatus, r = set(String(rel || ""), status, { dir, ask });
  if (status === "approved" && r.error && /is a document/.test(r.error) && ((deps.preview || draftPreview)(String(rel || ""), { dir }) || {}).type === "plan") { const a = set(String(rel || ""), "done", { dir }); if (a.error) return a; cached = null; return { ok: true, accepted: true, said: "Accepted. It's a plan, not a post, so nothing is posted from it." }; }
  if (r.error) return r;
  cached = null;
  if (status === "done") return { ok: true, said: "Marked done." };
  const d = r.draft, when = d.when ? `, scheduled in ${d.platform}'s own scheduler for ${d.when}` : "";
  if (status === "skipped") { noteAnswer(dir, `Skipped: ${rel}`, "Don't post it. Leave the draft where it is."); return { ok: true, said: "Skipped. Its agent won't post it." }; }
  if (status === "change") {
    noteAnswer(dir, `Change: ${r.rel || rel}`, `${ask}\n\n(The user asked for this change on its card under Marketing: draft \`${r.rel || rel}\`, its entry in .symbiot/drafts.json. Redraft that same file, keeping its head lines and its \`## Post\` / \`## Notes\` layout, and redo its picture or video if the change needs it. Don't post it or make a new file: the new version goes back to the user for approval on its own, and say in its notes what you changed.)`);
    if ((deps.running || runningHandoff)(dir)) return { ok: true, said: "Sent to its agent. It redrafts this once the run there now finishes, and the new version comes back here for your OK." };
    const e = (deps.run || runHandoff)(dir, { force: true });
    return e && e.id && !e.blocked ? { ok: true, said: "Sent to its agent, which is redrafting it now. The new version comes back here for your OK.", rerun: e.id } : { ok: true, said: `Sent to its agent. ${(e && e.note) || "Start its agent to redraft it."}` };
  }
  if (d.platform === "hackernews") {
    const lines = d.body.split("\n"), url = ((d.comment || "").match(/https?:\/\/[^\s)>`]+/) || [])[0] || "", site = url.replace(/\?.*$/, "");
    noteAnswer(dir, `Approved: ${rel}`, `The user approved its preview. Submit it to Hacker News${d.when ? ` at ${d.when} (SAST)` : " now"} yourself, from the user's account, through Symbiot's signed-in browser (\`screens map https://news.ycombinator.com/submit\`, then \`screens type\` and \`screens press\`): title "${lines[0].trim()}", URL ${site}. Leave the text box empty, and right after it is up add one first comment on the new item: the rest of the post (the lines under its title) and then the \`## First comment\` section, both exactly as in the draft (\`${rel}\`), unchanged. It is never a step for the user: if the browser isn't signed in to news.ycombinator.com, the card already carries a Sign in button, so read the page first and ask only if a real attempt found the session expired. Then check the item and the comment are there, mark it posted (\`${postedCmd(rel)}\`), and say so in your last message.`);
  } else
  noteAnswer(dir, `Approved: ${rel}`, `The user approved its preview. Post it on ${d.platform}${when}, through Symbiot's signed-in browser, with exactly the text under its post (${d.body.length} characters, unchanged)${d.media.length ? ` and ${d.media.join(", ")} attached` : ""}. Then check it's there, mark it posted (\`${postedCmd(rel)}\`), and say so in your last message.`);
  if ((deps.running || runningHandoff)(dir)) return { ok: true, said: "Approved. Its agent posts it once the run there now finishes." };
  const e = (deps.run || runHandoff)(dir, { force: true });
  return e && e.id && !e.blocked ? { ok: true, said: `Approved. Its agent is ${d.when ? "scheduling" : "posting"} it now.`, rerun: e.id } : { ok: true, said: `Approved. ${(e && e.note) || "Start its agent to post it."}` };
}
// Start Marketing's agent on its waiting tasks (the page's Start its agent). { ok } or { error }.
function marketingGo(deps = {}) {
  cached = null;
  const map = (deps.repos || (() => { try { return laneMap(); } catch { return {}; } }))() || {};
  return goLane(MARKETING, map, { push: deps.push, run: deps.run });
}

// Why approved work isn't on GitHub, a few words for its Home card (tasks.mjs unsentCard).
const UNSENT_SUB = { conflicts: "it clashes with main", tests: "its tests failed here", push: "the push didn't go through", pr: "no PR opened" };
// { you: [{ kind, id, title, sub, shape, … }], feeds: [{ id, title, sub, count, shape }],
//   lanes: [{ from, to, text, status, times }], working: n, at }
// An ask carries what its blob on home needs: the lane (repo, or "" for an ops
// run), its name as people say it, the question and its first two options.
// Dismissed, on Home or the Workdesk: a card you don't want there (the user, 2026-10-15: no way
// to clear an unwanted one). Kept by what the card says (cardKey, the app's bdKey: the same
// question on Home, the Workdesk and a project), so a new question from the same agent, or
// a changed Approve, still shows. Undo takes it back. A month on, it's forgotten.
const DISMISSED_FILE = join(CONFIG_DIR, "home-dismissed.json"), DISMISSED_KEEP = 30 * DAY;
const cardKey = (y) => { const q = (y && (y.raw || y.q)) || ""; return y && y.path && q ? `${y.path}|${q}` : `${(y && y.id) || ""}|${(y && (y.q || y.sub)) || ""}`; };
function loadDismissed(file = DISMISSED_FILE) { try { const d = JSON.parse(readFileSync(file, "utf8")); return d && typeof d === "object" && !Array.isArray(d) ? d : {}; } catch { return {}; } }
function dismissCard(key, { undo = false, file = DISMISSED_FILE, now = Date.now() } = {}) {
  key = String(key || "").slice(0, 2000); if (!key || key === "|") return { error: "Which card?" };
  const d = loadDismissed(file);
  for (const k of Object.keys(d)) if (!(now - Number(d[k]) < DISMISSED_KEEP)) delete d[k];
  if (undo) delete d[key]; else d[key] = now;
  try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(file, JSON.stringify(d), { mode: 0o600 }); } catch { return { error: "It couldn't be saved." }; }
  cached = null;
  return { ok: true, said: undo ? "It's back." : "Dismissed." };
}
const undismissed = (list, gone) => list.filter((y) => !gone[cardKey(y)]);
onCardGone((path, q) => !!loadDismissed()[`${path}|${q}`]); // a step's card you dismissed holds its lane back no more (agents.mjs stepGone)

// Built on the tick too (homeTick), while someone is looking: the window or the phone asked
// within HOME_LOOKED. Then a look reads what the tick built and never waits on the build
// (/api/home took 3.2 s, 20 Oct 2026); nobody looking, nothing is built.
const HOME_LOOKED = 60000; let looked = 0;
function homeTick({ now = Date.now() } = {}) { if (now - looked < HOME_LOOKED) try { homeState({ now, fresh: true, tick: true }); } catch {} }
function homeState({ now = Date.now(), fresh = false, deps = {}, tick = false } = {}) {
  if (!tick && !Object.keys(deps).length) looked = now;
  if (!fresh && !deps.board && cached && now - cached.at < KEEP) return cached;
  const board = deps.board || (() => { try { return watchBoard(24, now); } catch { return { cards: [] }; } });
  const pending = deps.pending || (() => { try { return pendingReview({ kept: true }); } catch { return []; } });
  const agents = deps.agents || (() => { try { return agentsNow(); } catch { return []; } });
  const lanes = deps.lanes || (() => { try { return lanesState(); } catch { return { handoffs: [] }; } });
  const reports = deps.reports || (() => { try { return reportsNews(); } catch { return { count: 0 }; } });
  const connected = deps.connected || (() => !!resolveProvider());
  const repos = deps.repos || (() => { try { return laneMap(); } catch { return {}; } });
  const search = deps.search || (() => { try { return reposState(); } catch { return { searching: false, at: 0, list: [] }; } });
  const confirmed = deps.confirmed || (() => { try { return !!loadConfig().reposConfirmed; } catch { return false; } });
  const waits = deps.waits || (() => { try { return awaitingState().waits; } catch { return []; } });
  const clashes = deps.clashes || (() => { try { return newClashes(); } catch { return []; } });
  let led; const finished = deps.doneSince || ((path, q) => { try { return doneSince(path, q, { ledger: (led = led || loadLedger()), now }); } catch { return null; } });
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
  const rootsSet = deps.rootsSet || (() => { try { const r = loadConfig().scanRoots; return Array.isArray(r) && r.length > 0; } catch { return false; } });
  let you = [], map = repos() || {};
  // What Symbiot works through (an AI, your agent, the connectors runs use) shows
  // only when it's missing, and then first (urgent): nothing works without it.
  // First run: what only a new user can do before the rest means anything.
  // (the Android app asks for none of this: the agents run on the computer it pairs with)
  if (!PHONE && !connected()) you.push({ kind: "setup", id: "setup:ai", urgent: true, title: "Connect an AI", sub: "Symbiot can't work without one: your Claude subscription (sign in to Claude Code), a key, or a free local model", shape: "settings", focus: "ai" });
  const gone = PHONE ? "" : agentGone(); if (gone) you.push({ kind: "setup", id: "setup:agent", urgent: true, title: "Your agent is unavailable", sub: `${gone} isn't on this computer any more, so no task can start`, shape: "settings", focus: "agent" });
  for (const c of PHONE ? [] : signedOut()) you.push({ kind: "setup", id: "setup:conn:" + c.id, urgent: true, title: `Reconnect ${c.name}`, sub: `its Claude connector is signed out, so agent runs can't use ${c.name}`, shape: "settings", focus: "agent" });
  { let d = null; try { d = PHONE ? null : claudePause(); } catch {} if (d) you.push({ kind: "setup", id: "setup:claude", urgent: true, title: d.kind === "auth" ? "Sign in to Claude again" : "Runs are paused: Claude is out", sub: d.note.replace(/^Not started: /, ""), shape: "settings", focus: "ai" }); } // one card, not a red run per lane (agents.mjs claudePause)
  you.push(...reposCard({ map, search: search(), confirmed: confirmed(), rootsSet: rootsSet() }));
  // no agent yet: Send to repos and Go would only write TASKS.md files nothing runs, so
  // Home didn't say "All handled" truthfully. Which agent is on this computer is a
  // lookup, not your call: one found is set (change it in Settings), and you're asked
  // only when there's none to set, or you cleared yours.
  if (!PHONE && !agentCmd()) {
    const p = offer(), off = deps.agentOff ? deps.agentOff() : (() => { try { return !!loadConfig().agentOff; } catch { return false; } })();
    if (p && !off) (deps.setAgent || setHandoffCmd)(p.tmpl);
    else you.push({ kind: "setup", id: "setup:pick", title: "Pick your agent", sub: p ? `${p.name} is on this computer: one click and it takes your tasks` : "no coding agent on this computer yet: install one (Claude Code, Codex, Gemini or Aider) and it takes your tasks", shape: "settings", focus: "agent", ...(p ? { pick: { name: p.name, tmpl: p.tmpl } } : {}) });
  }
  const pend = pending();
  for (const r of pend) {
    // an Approve already putting it in (tasks.mjs shipping) isn't yours to do again: its
    // card stayed "2 tasks done · only you decide" for the 18 min symbiot's took (its tests),
    // and pressing it met "Already approving here" (19 Oct 2026). It shows on the project
    // meanwhile (workScene's shipping), and comes back here only if it didn't get up (unsent).
    if (!r.path || r.running || r.shipping) continue;
    // leftover changes (tasks.mjs: no ticked task, no finished round, no run saying it finished
    // one) aren't waiting on you: an ops run's half-done edits in symbiot's checkout sat here and
    // lit an ember as "changes without a task · only you decide" (19 Oct 2026). The Workdesk
    // card keeps them, saying where they came from.
    if (r.leftover && !r.unsent) continue;
    const n = (r.tasks || []).length, files = (r.files || []).length;
    // approved and committed, but not on GitHub: it waits on a retry (tasks.mjs sendAgain), not an Approve
    const un = r.unsent && UNSENT_SUB[r.unsent.why];
    // a clash an agent is already sorting out (tasks.mjs rebaseTask) isn't the user's: no card on "Needs you"
    if (!n && !files && un && r.unsent.why === "conflicts" && r.unsent.fix) continue;
    if (!n && !files && un) { you.push({ kind: "approve", id: "approve:" + r.repo, repo: r.repo, name: named(r.path, r.repo), title: `Send ${r.repo}'s approved work`, sub: `approved, but not on GitHub yet: ${un}`, shape: "tasks" }); continue; }
    if (!n && !files) continue;
    if (!n && r.handed && !r.handed.held) continue; // made for a job this lane handed over: it goes up by itself (lanes.mjs shipHanded)
    you.push({ kind: "approve", id: "approve:" + r.repo, repo: r.repo, name: named(r.path, r.repo), title: `Approve ${r.repo}`, sub: `${n ? `${n} task${n > 1 ? "s" : ""} done` : r.round ? `a round of “${plain(r.round.text, 60)}”, still going` : r.handed ? `changes for “${plain(r.handed.text, 60)}” (handed to ${r.handed.to}): ${plain(r.handed.held, 100)}` : "changes without a task"}${files ? ` · ${files} file${files > 1 ? "s" : ""}` : ""} · only you decide`, shape: "tasks" });
  }
  const list = agents(), seen = new Set();
  // one agent owns a site: a second one's question about it waits for the owner's (handover.mjs heldAsks)
  const held = heldAsks(list.filter((a) => a.ask && a.ask.questions && a.ask.questions[0]).map((a) => { const q = a.ask.questions[0]; return { path: a.path, startedAt: a.startedAt, text: [q.q, q.context, ...(q.options || [])].join(" ") }; }));
  for (const a of list) {
    if (seen.has(a.path)) continue; seen.add(a.path);
    const qs = (a.ask && a.ask.questions) || [], q = qs[0];
    if (!q || held[a.path]) continue;
    // asking the user to paste or save a secret Symbiot holds already: answered with where it is, never a card
    if (a.status !== "running") { let h = ""; try { h = (deps.heldAsk || heldAsk)(a.path, q); } catch {} if (h) continue; }
    const lane = laneOfPath(a.path, map), repo = lane || (lane === "" ? "" : a.name);
    // the work it asks about is done already (another lane took it and ticked it): the card says so, and Close it is first
    const pa = plainAsk(a.path, q), done = finished(a.path, q.q), opts = (q.options || []).slice(0, 2);
    const closed = done ? { done, options: [`Close it: ${done.lane} has done this already (${done.text}). Check that it's so, and carry on without asking again. (recommended)`, opts[0]].filter(Boolean),
      labels: ["Close it: it's done", ...(opts[0] ? [blobLabel(pa.labels ? pa.labels[0] : opts[0])] : [])] } : {};
    // the user answered another agent on this work: it has that answer, and is checking whether it settles this (lanes.mjs shareAnswer)
    const sh = sharedTo(a.path), shared = sh && (a.status === "running" || Date.parse(sh.at) > (a.startedAt || 0)) ? { shared: sh } : {}; // and not once it has asked again since
    you.push({ kind: "ask", id: "ask:" + a.path, path: a.path, repo, ...shared, name: repo ? named(lane ? map[lane] : a.path, repo) : plain(String(a.name || "an agent").replace(/^Agent:\s*/, "").replace(/^New job:\s*/i, ""), 60), // the card's header is narrow: no "New job:" in it
      title: `${a.name} asks`, sub: String(q.q || "").slice(0, 90), ...(q.task ? { task: q.task } : {}), ...(q.talk ? { talk: q.talk } : {}), ...pa, options: opts, ...closed, ...(qs.length > 1 ? { more: qs.length - 1 } : {}), ...signInCard([q.q, ...opts]), ...reportLink(q.report), shape: "agents" });
  }
  // What stopped and can't go on without you, as a question too: a handover that
  // couldn't start (lanes.mjs stuckHandovers: "Allow this run access to ~/Company?"),
  // and a run that ended in an error. Answered on its blob (homeAnswer).
  const drafts = deps.drafts || (() => { try { return draftCards(); } catch { return []; } });
  const stalls = deps.stalls || (() => { try { return stallCards(loadRuns().map((r) => r.path)); } catch { return []; } });
  you.push(...troubles({ stuck: stuck(), list, map, named, now, drafts: drafts(), stalls: stalls() }));
  // what the user asked for, followed through (goals.mjs): one waiting on them with no card of its own,
  // stalled, a follow-up to send, done or not finished; and an email that's waited a week for its reply
  { let gc = []; try { gc = (deps.goalCards || ((o) => goalCards(o)))({ waits: waits(), now }); } catch {}
    for (const c of gc) { const { goalReport, ...y } = c; let rl = {}; if (goalReport) { try { rl = reportLink(listReports({ folders: [goalReport.folder], map: {}, running: () => false }).find((r) => r.name === goalReport.name)); } catch {} } you.push({ ...y, ...rl, shape: "agents" }); } }
  // A run is waiting on an emailed reply that nothing will see: say so, once,
  // until an inbox is watched (and signed in) or Email is on (handback.mjs looks in either).
  if (waits().some((w) => w.status === "waiting")) {
    const s = seesInbox(), sight = s && typeof s === "object" ? s : { sees: !!s, signedOut: [] };
    if (!sight.sees) you.push(sight.signedOut.length
      ? { kind: "setup", id: "setup:inbox", signin: true, title: `Sign in to ${sight.signedOut[0]} again`, sub: "it's signed out, so I won't notice their reply", shape: "settings", focus: "links" }
      : { kind: "setup", id: "setup:inbox", title: "Let me see your inbox", sub: "so I notice their reply", shape: "settings", focus: "links" });
  }
  // Linked sites that have signed out get no card of their own: a standing "Sign in again to
  // 10 sites" asked for sites nothing was using (the user, 2026-10-14). A run whose job needs one
  // asks for that site itself, with its Sign in button (signInCard), and Settings → Connections
  // shows the rest as signed out, quietly.
  const bd = board() || {}, feeds = (bd.cards || []).filter((c) => c.count > 0).map((c) => ({ id: "feed:" + c.id, title: c.name, sub: c.label, count: c.count, shape: "board" }));
  // a clash in your files that matters (checks.mjs: high), first under Watching, until you've opened it
  const clash = clashes();
  if (clash.length) feeds.unshift({ id: "feed:clash", title: "Where your files disagree", sub: `${clash.length} clash${clash.length > 1 ? "es" : ""} to look at`, latest: plain(clash[0].text, 140), count: clash.length, shape: "settings" });
  const rep = reports();
  if (rep.count) feeds.push({ id: "feed:reports", title: "Reports", sub: `${rep.count} unread`, latest: rep.latest, count: rep.count, shape: "reports" });
  const hs = ((lanes() || {}).handoffs || []).slice(0, 5).map((h) => ({ from: h.from, to: h.to, text: h.text, status: h.status, at: h.at || 0, ...(h.times > 1 ? { times: h.times } : {}) }));
  const working = list.filter((a) => a.status === "running").length;
  // each run at work, in a line: which lane, where it is in its brief, how long it has left, and whether it has gone quiet
  const seenRun = new Set(), runs = [];
  for (const a of list) {
    if (a.status !== "running" || seenRun.has(a.path)) continue; seenRun.add(a.path);
    const lane = laneOfPath(a.path, map);
    runs.push({ id: "run:" + a.path, path: a.path, repo: lane || "", name: lane ? named(map[lane], lane) : plain(String(a.name || "an agent").replace(/^Agent:\s*/, ""), 40), ...runNow(a), started: a.startedAt || 0 });
  }
  // which project each agent's card is about, from the record (lanes.mjs projectOf): "" says "no project"
  { let ledger = null; for (const y of you) if (y.path && (y.kind === "ask" || y.kind === "approve") && y.fix !== "draft" && y.project === undefined) { if (!ledger) { try { ledger = (deps.ledger || loadLedger)(); } catch { ledger = { handoffs: [] }; } } y.project = y.repo || projectFor(y.path, map, ledger); } }
  // nothing waits on you: a few things that can be done next (none while anything does)
  you = undismissed(settleAsks(you), (deps.dismissed || loadDismissed)());
  // Needs you holds decisions and the user's own steps only; what just tells them something is an
  // update (needs.mjs). Each card reads as its writer put it: a short question, why, labelled options.
  const split = splitNeeds(you), updates = split.updates;
  // what Symbiot did on its own (intuition.mjs): on Updates, never on Needs you
  try { const gone = new Set(Object.keys((deps.dismissed || loadDismissed)())); updates.unshift(...(deps.intuition || intuitionUpdates)({ now, dismissed: gone })); } catch {}
  // a change to how Symbiot works, proposed from what the user kept pushing back on (overrides.mjs): Apply / Not now
  try { const gone = new Set(Object.keys((deps.dismissed || loadDismissed)())); updates.unshift(...(deps.overrides || overridesUpdates)({ dismissed: gone })); } catch {}
  { let ct = {}; try { ct = (deps.cardText || loadCardText)(); } catch {} you = split.you.map((y) => { try { return applyText(y, ct); } catch { return y; } }); }
  (deps.syncJobs || syncOnUser)(you, { now }); // the job record's "waiting on you": these cards, all of them (jobs.mjs)
  const nextAll = nextUp({ now, map, list, named, deps: { board: () => bd, reports: () => rep, ...(deps.next || {}) } });
  const next = you.length ? [] : nextAll; // not shown while something needs you, but a tap on one already on screen still works (homeNext)
  // how long the Symbiot Browser has been open, said on Home (headless.mjs windowSince)
  let browserSince = 0; try { browserSince = (deps.browserSince || windowSince)(); } catch {}
  const out = { ...(browserSince ? { browserSince, browserIdle: Number(loadConfig().browserIdleMin) || BROWSER_IDLE_MIN } : {}), you: you.slice(0, 6), youCount: you.length, ...(updates.length ? { updates: updates.slice(0, 8) } : {}), feeds: feeds.slice(0, 6), lanes: hs, working, runs: runs.slice(0, 4), next, nextAll, marketing: marketing({ list, map, named, pend }), ...(deps.phone || phoneBits)(now), at: now };
  if (!deps.board) cached = out;
  return out;
}

// Cards the chat says your message answered: only a question that's really on Home counts (the
// model can't close one by inventing it). Each goes in the shared record, so the card leaves and no agent asks it again.
function settleFromChat(h, said, answer) {
  const key = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const shown = ((h && h.you) || []).filter((y) => y.kind === "ask" && y.q);
  let n = 0;
  for (const q of said || []) { const y = shown.find((x) => key(x.q) === key(q)); if (y && recordDone(y.q, `answered in chat: ${String(answer || "").slice(0, 120)}`)) n++; }
  return n;
}
// Asks that never belong on Home: "close the Symbiot Browser" is an agent's wait-and-retry, not
// the user's job; and the same question from several agents is one card, not three.
const CLOSE_BROWSER = /\b(?:close|quit|shut)\b[^.?]{0,40}\bSymbiot Browser\b|\bSymbiot Browser is open\b|\bclick(?:ing)? Done\b[^.?]{0,30}\b(?:browser|window)\b/i;
// Clicking and form-filling is the agent's work (it drives the page itself): a card that hands those
// steps over, with no security-key tap or code in them, isn't a card for Home.
const HAND_CLICKS = /\b(?:click|press|tap|hit)\b[^.?]{0,60}\b(?:Edit|Delete|Remove|Save|Done|Submit|Continue|Next|Allow|Confirm|Update|Add|Create|Revoke|Disable|Enable)\b/i;
const NEEDS_THEM = /\b(?:security key|passkey|hardware key|2fa|sms|one-time|verification code|recovery code|authenticator)\b/i;
function settleAsks(you) {
  const seen = new Map();
  // "Already covered?" (a standing rule that shared words with the card) is gone from cards: it
  // matched on words, not meaning, and put unrelated rules under the user's questions (22 Oct 2026).
  return you.filter((y) => {
    if (y.kind !== "ask") return true;
    if (isDone(y.q)) return false; // already answered, for any agent
    const said = `${y.q || ""} ${(y.options || []).join(" ")}`;
    if (CLOSE_BROWSER.test(said)) return false;
    if (HAND_CLICKS.test(said) && !NEEDS_THEM.test(said)) return false;
    const k = String(y.q || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!k) return true;
    // the same human step worded two ways ("Trusted Publisher … security key" twice) is one card
    const w = new Set(k.split(" ").filter((t) => t.length > 3));
    for (const [sk, sw] of seen) {
      if (sk === k) return false;
      const both = [...w].filter((t) => sw.has(t)).length;
      if (w.size >= 5 && sw.size >= 5 && both / Math.min(w.size, sw.size) >= 0.8) return false;
    }
    seen.set(k, w);
    return true;
  });
}

// An answer on a stuck handover's, a waiting run's or a failed run's blob. pick: the
// option's place (0 goes ahead, 1 skips); text: your own words, which go ahead with
// them unless they say no. The handover's run (lanes.mjs allowHandover) reports back
// to the agent that asked; a run waiting on your OK or your step starts again with
// "go ahead" or "done" in its ANSWERS.md (skipped, it doesn't ask again); a failed
// run starts again in its folder, with your words in its ANSWERS.md. { ok, said } or { error }.
const SAYS_NO = /^\s*(skip|no|nope|don'?t|do not|cancel|leave it|never ?mind|stop)\b/i;
// A "needs you" card on a subject the user asked back about and hasn't read the write-up of yet
// (asksdone.mjs heldBy): its run was told what they asked for, so the card isn't raised again.
function heldNeeds(what, path, lane) {
  try { return !!heldBy(what, { lane, readSince: (ts, l) => reportsSince(l && l !== lane ? laneMap()[l] || path : path, ts).some((r) => r.read) }); } catch { return false; }
}
// An answer, in the folder's ANSWERS.md, for the run that picks it up.
function noteAnswer(path, heading, text) {
  const f = join(path, ".symbiot", "ANSWERS.md"); let had = ""; try { had = readFileSync(f, "utf8"); } catch {}
  try { writeFileSync(f, `${(had || "# Answers\n").replace(/\s*$/, "")}\n\n### ${String(heading).replace(/\s+/g, " ").trim()}\n${text}\n_answered ${new Date().toISOString().slice(0, 10)}_\n`); } catch {}
}
// a label without its "(recommended)": a second button isn't the recommended one
const blobLabel = (l) => String(l || "").replace(/\s*\(recommended\)\s*$/i, "");
// A run that couldn't start because Approve is putting that lane's changes in (agents.mjs shipHold),
// not a broken agent: the answer's saved (ANSWERS.md), so its next run starts from it.
const afterShip = (e) => (e && e.shipping ? `Saved. Approve is still putting this lane's changes in (${e.step || "starting"}), so its agent picks this up once that's done.` : "");
// …and started then: tried every 10 s until Approve lets go of the folder (10 minutes at most)
function runAfterShip(path, run = runHandoff) {
  let n = 0; const t = setInterval(() => { let e = null; try { e = run(path, { force: true }); } catch {} if (!(e && e.shipping) || ++n >= 60) clearInterval(t); }, 10000);
  if (t.unref) t.unref();
}
const SAID_SO = /\b(?:already|i(?:'?ve| have)? (?:answered|replied|said|told|did|done|sent)|i did)\b/i; // a remark about what's done, not an instruction
const stepCard = (ref, deps = {}) => { try { const a = (deps.agents || agentsList)().find((x) => x.id === ref); return !!(a && a.needs && a.needs.kind !== "approve"); } catch { return false; } };
function homeAnswer(id, { pick, text = "" } = {}, deps = {}) {
  id = String(id || ""); text = String(text || "").trim().slice(0, 2000);
  try { text = captureSecrets(text).text; } catch {} // a secret typed on a card goes to the vault; ANSWERS.md and the record get "[saved: …]"
  // Typed words are a Go only when they say yes, a Skip only when they say no. Anything else ("ive
  // already answered", a question) is said to the card's agent, not a Go: "ive already answered" on
  // a Go ahead / Skip card approved sending a note the user had just said not to send (22 Oct 2026).
  const asking = text && (/\?/.test(text) || asksQ(text)) && !wantsReport(text) && !wantsToRead(text); // "did you send it already" is a question, "send it" or not
  // "i did" / "already allowed it" on a step card of theirs ("Did you allow the mic?") is its answer, not a remark
  const remark = text && SAID_SO.test(text) && !YES.test(text) && !(id.startsWith("needs:") && stepCard(id.replace(/^\w+:/, ""), deps));
  if (text && !SAYS_NO.test(text) && (asking || remark)) return { talk: true, text };
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
    if (afterShip(e)) { (deps.later || runAfterShip)(a.path, deps.run || runHandoff); return { ok: true, said: "Approve is still putting this lane's changes in, so it runs again once that's done." }; }
    return e && e.id && !e.blocked ? { ok: true, said: "Running it again.", rerun: e.id } : { error: (e && e.note) || "It didn't start. Check your agent in Settings." };
  }
  // an agent that stalled twice: start it again on its other tasks (that item left for later), or leave its lane paused
  if (id.startsWith("stalled:")) {
    const rec = (deps.loadStall || loadStall)(ref); if (!rec || !rec.card) return { error: "That agent isn't stuck any more." };
    const save = deps.saveStall || saveStall;
    if (!go) { save(ref, { ...rec, card: false, left: true }); return { ok: true, said: "Left it paused. Unpause its lane on the Workdesk when you want it back." }; }
    if ((deps.running || runningHandoff)(ref)) return { ok: true, said: "An agent is already at work there." };
    noteAnswer(ref, "From Symbiot: your run stalled twice", `It stalled twice on: ${rec.where}${rec.task ? ` (the item: ${rec.task})` : ""}. Leave that item unticked for now and don't work on it: carry on with the other open items.${text ? ` The user adds: ${text}` : ""}`);
    save(ref, { ...rec, count: 1, card: false, restart: false, at: Date.now() });
    (deps.park || parkLane)(ref, false);
    const e = (deps.run || runHandoff)(ref, { force: true });
    if (afterShip(e)) { (deps.later || runAfterShip)(ref, deps.run || runHandoff); return { ok: true, said: "Approve is still putting this lane's changes in, so it starts once that's done." }; }
    return e && e.id && !e.blocked ? { ok: true, said: "Started it again on its other tasks; that item waits.", rerun: e.id } : { error: (e && e.note) || "It didn't start. Check your agent in Settings." };
  }
  if (id.startsWith("repos:")) return reposAnswer({ pick, text }, deps);
  // a drafted reply: Go ahead sends it, Skip drops it, your own words are Change it (a redraft on the same card)
  if (id.startsWith("draft:")) return (deps.draftAnswer || draftAnswer)(ref, text ? (SAYS_NO.test(text) ? { skip: true } : { change: text }) : go ? { go: true } : { skip: true });
  if (id.startsWith("needs:")) {
    const a = (deps.agents || agentsList)().find((x) => x.id === ref), n = a && a.needs;
    if (!n) return { error: "That isn't waiting on you any more." };
    const settle = deps.settle || settleNeeds;
    // "i read it. this case is closed, no further aspects need to be done on this…" (21 Oct 2026) went to its run
    // as "Go ahead: …", and the card came back. It's closed: settled for good, its run told, and nothing runs.
    if (text && closesAsk(text, { approve: n.kind === "approve" })) {
      settle(a.path, n.key); dropped.add(id); (deps.close || closeAsk)(a.path, n.claim || n.what); recordDone(n.what, `Closed: ${text}`, whereOf(a.path).lane); // "no further action" starts with "no": recorded as closed, not as a skip
      noteAnswer(a.path, n.what, `Closed by the user: "${text}". Nothing more is needed on this: don't do it, don't ask about it again, and don't list it as waiting on them in your last message, until something new comes in on it (a reply, a new ask).`);
      return { ok: true, said: "Closed. It won't come back unless something new comes in on it." };
    }
    if (!go) { settle(a.path, n.key); dropped.add(id); return { ok: true, said: "Skipped. It won't ask again." }; }
    if ((deps.running || runningHandoff)(a.path)) return { ok: true, said: "An agent is already at work there." };
    // a permission card is Symbiot's to do, never the user's: Done writes the rules into the lane's allow list
    let allowed = null;
    if (n.kind !== "approve" && cardIsPermission(`${n.what} ${n.check}`)) {
      const g = (deps.grant || grantCard)(a.path, `${n.what} ${n.check}`);
      if (g.error) return { error: g.error };
      allowed = g.rules;
    }
    // "i need the report first then we can send it", typed on a Go ahead card, isn't a go-ahead (21 Oct 2026: twice,
    // and each went to its run as "Go ahead: …"). Written already: the card now points at it, and nothing runs.
    if (text && !allowed && wantsReport(text) && n.report) {
      noteAnswer(a.path, n.what, `The user hasn't said go ahead: they asked for a report first ("${text}"). It's written: .symbiot/${basename(n.report.file || "")}, on Reports, and their card now links to it. Don't do this until they say go ahead after reading it, and don't ask again without pointing at the report.`);
      if (!n.reportFirst) settle(a.path, n.key); // its words change to point at the report (needsOf); already pointing, it stays
      return { ok: true, said: `It's on Reports already: "${n.report.title}". Its card now points at it: read it, then say go ahead there.`, report: n.report.title, reportId: n.report.id };
    }
    // your own words that ask back ("put it in reports so i can read it") aren't "done": its agent does what you asked first
    if (text && (n.kind !== "approve" || wantsReport(text)) && !allowed && asksBack(text)) {
      const r = reportsSince(a.path, (a.startedAt || a.endedAt || Date.now()) - 60000).find((x) => !x.read);
      noteAnswer(a.path, n.what, `${n.kind === "approve" ? "The user hasn't said go ahead: don't do it yet." : "The user hasn't done this step."} ${askBackNote(text)}`);
      const e = (deps.run || runHandoff)(a.path, { force: true }), later = afterShip(e);
      settle(a.path, n.key); dropped.add(id); recordDone(n.what, text, whereOf(a.path).lane, { back: true });
      if (later) (deps.later || runAfterShip)(a.path, deps.run || runHandoff);
      return { ok: true, said: `${r ? `It's written already: Reports → "${r.title}". ` : ""}${later || (e && e.id && !e.blocked ? "Its agent is writing that up for Reports before anything else, and won't ask about this again until you've read it." : "Saved: its next run writes that up for Reports first.")}`, ...(e && e.id ? { rerun: e.id } : {}), ...(r ? { report: r.title } : {}) };
    }
    // Done it, on a step that names a file (`.env`): only once that file has changed since
    // the run asked. In your own words it goes ahead (done some other way), its agent told.
    const still = allowed || n.kind === "approve" ? [] : (deps.unchanged || unchangedStep)(`${n.what} ${n.check || ""}`, a.path, a.endedAt || a.startedAt || 0);
    const last = still.map((f) => `\`${f.name}\` ${f.at ? `was last changed on ${new Date(f.at).toISOString().slice(0, 10)}` : "isn't there"}`).join(" and ");
    if (still.length && !text) return { error: `${last.replace(/`/g, "")}, before its agent asked, so it isn't done yet. Make the change and press Done it again, or say how you did it.` };
    // Done it, on a step that needs a release ("once 0.65.2 is installed, sign in…"): only once it's installed here (tasks.mjs releaseNotIn)
    const rel = n.kind === "approve" || allowed ? null : (deps.releaseNotIn || releaseNotIn)(a.path, `${n.what} ${n.check || ""}`);
    if (rel && !text) return { error: `This step needs ${rel.name} ${rel.needs}, and ${rel.installed} is installed here, so it isn't done yet. Update, do it again, then press Done it.` };
    const said = allowed ? `Allowed ${allowed.join(", ")}: Symbiot wrote it into this folder's allow list. Carry on.`
      : n.say ? `${n.say}${text ? ` The user adds: ${text}` : ""}` // a sign-in the browser can't hold: its agent takes the API route (browserfails.mjs)
      : n.kind === "approve" ? `Go ahead: ${text || "do it as you had it, once you've checked what you flagged"}.${n.sent ? ` (${n.sent.by ? `${n.sent.by === "its own run" ? "An earlier run of yours" : `Another agent (${n.sent.by})`} already sent "${n.sent.subject}"${n.sent.to ? ` to ${n.sent.to}` : ""}` : `Symbiot found "${n.sent.subject}" in Sent`} after your run said it was unsent: read Sent first, and never send the same email twice.)` : ""}`
      : still.length ? `The user says it's done (${text}), but ${last}, before you asked. Check it yourself before relying on it, then carry on.`
      : text && !saysDone(text) ? `The user answered in their own words, and didn't say this step is done: "${text}". Take that as their answer to it: do what it asks, or sort out what it reports, before anything else, and don't treat the step as done. If it still needs them after that, ask once, saying what you did.`
      : `Done: the user did it${text ? ` (${text})` : ""}. Check it worked, then carry on.`;
    noteAnswer(a.path, n.what, said);
    const e = (deps.run || runHandoff)(a.path, { force: true }), later = afterShip(e), started = !!(e && e.id && !e.blocked);
    // saved is answered: a run that couldn't start this second (a paused lane, a quota pause) left the card up saying
    // "It didn't start", the words still in its box, and the answer, saved already, was sent again (22 Oct 2026)
    if (started || later || allowed || text) { settle(a.path, n.key); dropped.add(id); if (n.kind !== "approve" || n.asked) recordDone(n.what, said, whereOf(a.path).lane); } // "Done it" is on the shared record: no agent raises it again
    if (allowed) return e && e.id && !e.blocked ? { ok: true, said: `Allowed ${allowed.join(", ")} and started its agent.`, rerun: e.id } : { ok: true, said: `Allowed ${allowed.join(", ")}. Its agent didn't start: ${(e && e.note) || "check your agent in Settings"}.` }; // "Done it" is on the shared record: no agent raises it again
    if (later) { (deps.later || runAfterShip)(a.path, deps.run || runHandoff); return { ok: true, said: later }; }
    if (!started && text) return { ok: true, said: `Saved as your answer. Its agent didn't start just now (${String((e && e.note) || "check your agent in Settings").replace(/[.\s]+$/, "")}), so it picks this up when it next runs.` };
    return started ? { ok: true, said: n.api ? `The browser can't hold the ${n.api} sign-in, so I won't ask you again: its agent is switching to its API.` : n.kind === "approve" ? "Its agent is going ahead." : "Its agent is checking and carrying on.", rerun: e.id } : { error: (e && e.note) || "It didn't start. Check your agent in Settings." };
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
  // your phone: on a computer, pairing the Symbiot app on it (Setup offers it too)
  if (!PHONE) { const ph = tryOr(deps.phone || linkState, { phones: [] }), n = (ph.phones || []).length;
    steps.push({ id: "phone", title: "Your phone", optional: true, done: n > 0, sub: n ? `${ph.phones.map((p) => p.name).join(", ")} paired: your tasks and what needs you, there too` : "your tasks, what needs you and agents' questions on your phone, and Approve from there" }); }
  return { steps, done: steps.every((s) => s.done) };
}

// Your phone (phone.mjs) on Home. On a phone paired with a computer: that computer's
// droplet, from the copy it keeps (what needs you there, its open tasks, whether it's
// out of reach and since when, what's waiting to send). On the computer: what was
// approved from a phone today, so you know it wasn't you at this desk.
function phoneBits(now = Date.now()) {
  try {
    if (!PHONE) {
      const a = phoneApprovals(now), l = linkState(), phones = l.on ? (l.phones || []).map((p) => ({ name: p.name, ...(p.seen ? { seen: p.seen } : {}), ...(p.via ? { via: p.via } : {}), ...(p.old ? { old: true } : {}) })) : [];
      return { ...(phones.length ? { phones } : {}), ...(a.length ? { phoneApproved: a.map((x) => ({ repo: x.repo, phone: x.phone, at: x.at, status: x.status, ...(x.pr ? { pr: x.pr } : {}), ...(x.error ? { error: x.error } : {}) })) } : {}) };
    }
    const v = computerView(); if (!v.paired) return {};
    const c = v.copy || {}, asks = (c.asks || []).filter((x) => !x.waiting).length, approves = (c.approves || []).filter((x) => !x.waiting).length;
    return { computer: { name: v.name, ...(v.old ? { old: true } : {}), ...(v.away ? { away: true } : {}), heard: v.heard || 0, queued: v.queued || 0, asks, approves, needs: (c.needs || []).length,
      tasks: (c.tasks || []).filter((t) => !t.done).length, notes: (c.notes || []).length, copy: !!v.copy } };
  } catch { return {}; }
}

// What Home's chat handed to agents or queued, kept so "is everything done?" is answered from
// Home itself: each entry is the task's id, its lane, what was asked, and what happened at once.
const HANDED_PATH = join(CONFIG_DIR, "home-handed.json"), HANDED_DAYS = 7, HANDED_MAX = 60;
function loadHanded(path = HANDED_PATH) { try { const a = JSON.parse(readFileSync(path, "utf8")); return Array.isArray(a) ? a : []; } catch { return []; } }
// Written whole and yours only (0600), as every state file is (core.mjs writeAtomic).
function noteHanded(did, text, { path = HANDED_PATH, now = Date.now() } = {}) {
  if (!did || did.error || !(did.task || did.id) || !did.lane) return false;
  const e = { id: did.task || did.id, lane: did.lane, text: String(text || "").replace(/\s+/g, " ").trim().slice(0, 200), at: now, ...(did.notStarted ? { notStarted: String(did.notStarted).slice(0, 160) } : {}) };
  try { writeJsonAtomic(path, [e, ...loadHanded(path).filter((x) => x.id !== e.id)].filter((x) => now - x.at < HANDED_DAYS * 864e5).slice(0, HANDED_MAX)); return true; } catch { return false; }
}
// Each of those, with where it stands now: running, queued, waiting on their answer, never started, done, or in review.
function handedState({ now = Date.now(), ledger = loadHanded(), tasks = [], list = [], map = {} } = {}) {
  return ledger.filter((e) => now - e.at < HANDED_DAYS * 864e5).map((e) => {
    const t = tasks.find((x) => x && x.id === e.id), a = list.filter((x) => map[e.lane] && x.path === map[e.lane]);
    const status = !t ? "no longer on the Workdesk" : t.done ? "done" : t.archived ? "closed" : t.review ? "done, waiting for their OK"
      : a.some((x) => x.ask && (x.ask.questions || []).length) ? "waiting on their answer"
      : a.some((x) => x.status === "running") ? "its agent is running" : a.some((x) => (x.startedAt || 0) > e.at) ? "its agent has picked it up since" // not "never started" once a run there did
      : e.notStarted ? `never started: ${e.notStarted.replace(/\.$/, "")}` : "queued, its agent hasn't picked it up yet";
    return { id: e.id, lane: e.lane, text: e.text, at: e.at, status };
  });
}

// What agents finished in the last day and how it ended, so "did the update work?" is answered from
// their own last words, not guessed.
function finishedState({ now = Date.now(), list = agentsList(), max = 6 } = {}) {
  return list.filter((x) => x && x.status !== "running" && x.endedAt && now - x.endedAt < 864e5).sort((a, b) => b.endedAt - a.endedAt).slice(0, max).map((x) => {
    const end = x.exitCode ? `failed (exit ${x.exitCode})` : "finished", said = String(x.tail || "").replace(/\s+/g, " ").trim().slice(0, 400);
    const asks = ((x.ask && x.ask.questions) || []).map((q) => String(q.q || q.title || q).slice(0, 80)).slice(0, 3);
    return { name: x.name, end, at: x.endedAt, said, asks, changed: Array.isArray(x.changed) ? x.changed.length : 0 };
  });
}

// What each agent (running, or finished in the last day) has done, asked and been told, in a few
// lines apiece, so "why is npm asking again?" is answered from the agent's own record: its last
// steps and how they ended, the questions it put to the user, his answers, and its outcome. The
// full log stays on the Workdesk; this is the digest.
const answersOf = (path, max = 3) => {
  let md = ""; try { md = readFileSync(join(path, ".symbiot", "ANSWERS.md"), "utf8"); } catch { return []; }
  return [...md.matchAll(/^###\s+(.+)\n([\s\S]*?)(?=\n###\s|\n*$)/gm)].map((m) => ({ q: m[1].trim().slice(0, 100), a: m[2].replace(/_answered[^\n]*/g, "").replace(/\s+/g, " ").trim().slice(0, 140) })).filter((x) => x.a).slice(-max);
};
function agentDigest({ now = Date.now(), list = agentsList(), map = {}, tasks = [], max = 8 } = {}) {
  const queued = {}; for (const t of tasks) if (t && !t.done && !t.archived && !t.review && t.repo) queued[t.repo] = (queued[t.repo] || 0) + 1;
  const seen = new Set(), out = [];
  for (const x of list) {
    if (!x || seen.has(x.path)) continue;
    const running = x.status === "running";
    if (!running && !(x.endedAt && now - x.endedAt < 864e5)) continue;
    seen.add(x.path);
    const lane = Object.keys(map).find((k) => map[k] === x.path) || "";
    const steps = ((x.work && x.work.steps) || []).slice(-4).map((s) => `${s.verb} ${s.target || ""}`.trim() + (s.status === "error" ? ` (failed${s.note ? ": " + s.note : ""})` : s.status === "running" ? " (in progress)" : ""));
    let asks = []; try { asks = ((x.ask && x.ask.questions) || []).map((q) => String(q.q || q.title || q).replace(/\s+/g, " ").slice(0, 100)).slice(0, 3); } catch {}
    out.push({ name: String(x.name || "an agent").replace(/^Agent:\s*/, "").slice(0, 40), lane, running, at: running ? x.startedAt || now : x.endedAt, steps, asks, answers: answersOf(x.path),
      ...(running ? {} : { outcome: x.exitCode ? `failed (exit ${x.exitCode})` : String(x.tail || "").replace(/\s+/g, " ").trim().slice(0, 300) }), queued: lane ? queued[lane] || 0 : 0 });
  }
  return out.sort((a, b) => (b.running - a.running) || b.at - a.at).slice(0, max);
}
// The answers the user gave anywhere, newest last: what he's already done, so nobody asks it twice.
const garthLedger = (n = 8) => { try { return doneList().slice(-n); } catch { return []; } };

// One line per thing home shows, for the talk's context.
// Email tasks the user sent themselves (sentmail.mjs): said as sent, never listed as work.
function sentMailLines(now = Date.now()) {
  let t = []; try { t = loadTasks() || []; } catch {}
  const sent = t.filter((x) => x && x.sent && now - (x.sent.at || 0) < 7 * DAY);
  return sent.length ? ["Emails the user already sent (not work to do; say they are waiting on a reply):", ...sent.map((x) => `- ${plain(x.text, 90)}: ${sentLine(x, now)}`)] : [];
}
function homeContext(h, { cards } = {}) {
  const shown = new Set(h.you.map((y) => y.id)), rest = h.youCount > h.you.length ? (cards || (() => { try { return onUser(); } catch { return []; } })()).filter((y) => !shown.has(y.id)) : [];
  return [
    `Only the user can do (${h.youCount ?? h.you.length}${(h.youCount ?? h.you.length) ? "" : ": no card is waiting for them, so never say one is"}):`, ...h.you.map((y) => `- ${y.title}: ${y.sub}${y.q && y.q !== y.sub ? ` (asks: ${y.q}${(y.options || []).length ? ` ${y.options.join(" / ")}` : ""})` : ""}`),
    ...rest.slice(0, 12).map((y) => `- ${y.text}`), // past the 6 Home shows: from the job record, the same list
    ...(h.you.some((y) => /^ask:/.test(y.id || "")) ? [`Agents asking (to answer for them, "answer" with these ids): ${h.you.filter((y) => /^ask:/.test(y.id || "")).map((y) => `${y.id} (${String(y.title).slice(0, 40)})`).join("; ")}`] : []),
    `New on what they watch:`, ...(h.feeds.length ? h.feeds.map((f) => `- ${f.title}: ${f.sub}${f.latest ? ` (latest: ${f.latest})` : ""}`) : ["- nothing new"]),
    `Agents working: ${h.working}.`, ...(h.runs || []).map((r) => `- [${r.id}] ${dayMark(r.started, h.at)}${r.name}: ${r.line}${r.eta ? ` (${r.eta})` : ""}${r.quiet ? ` (no progress in ${r.quiet} min)` : ""}${r.looping ? " (repeating the same step)" : ""}`),
    ...sentMailLines(),
    ...jobsLines({ now: h.at }),
    ...(() => { try { return intuitionLines({ now: h.at }); } catch { return []; } })(),
    "Agents finished in the last 24h (their own last words; answer 'did it work?' from these):", ...((h.finished || []).length ? h.finished.map((f) => `- ${dayMark(f.at, h.at)}${f.name}: ${f.end}${f.changed ? `, ${f.changed} file${f.changed > 1 ? "s" : ""} changed` : ""}${f.asks.length ? `; asked: ${f.asks.join(" / ")}` : ""}${f.said ? `; said: ${f.said}` : ""}`) : ["- none"]),
    "What each agent has done, asked and been told (running, or finished in the last 24h; answer 'why is it asking again?' and 'did it work?' from this):", ...((h.digest || []).length ? h.digest.flatMap((d) => [`- ${dayMark(d.at, h.at)}${d.name}${d.lane ? ` [${d.lane}${d.queued ? `, ${d.queued} queued` : ""}]` : ""} (${d.running ? "running" : "finished"})`,
      ...(d.steps.length ? [`    last steps: ${d.steps.join("; ")}`] : []), ...(d.asks.length ? [`    asked the user: ${d.asks.join(" / ")}`] : []), ...d.answers.map((a) => `    the user answered "${a.q}": ${a.a}`), ...(d.outcome ? [`    outcome: ${d.outcome}`] : [])]) : ["- none"]),
    "Already answered by the user, anywhere (never ask or tell him to do these again):", ...((h.ledger || []).length ? h.ledger.map((x) => `- ${x.at} ${x.q} → ${x.a}`) : ["- none"]),
    "Handed off from this chat (last 7 days; say how each stands from this list, never guess):", ...((h.handed || []).length ? h.handed.map((x) => `- ${dayMark(x.at, h.at)}${x.lane}: ${x.text} (${x.status})`) : ["- none"]),
    "Recent handovers:", ...(h.lanes.length ? h.lanes.map((l) => `- ${dayMark(l.at, h.at)}${l.from} → ${l.to}: ${l.text} (${l.status}${l.times ? `, handed over ${l.times} times` : ""})`) : ["- none"]),
    ...(h.marketing ? [`Marketing (a lane of its own, for marketing across all their products; "repo": "${MARKETING}"): ${h.marketing.needs ? `${h.marketing.needs} thing${h.marketing.needs > 1 ? "s" : ""} there need${h.marketing.needs > 1 ? "" : "s"} them` : "nothing needs them"}${h.marketing.working ? ", its agent is at work" : ""}.`] : []),
    ...((h.next || []).length ? ["Could be done next (Home suggests these, one tap each):", ...h.next.map((s) => `- ${s.title}: ${s.gain} (${s.time})`)] : []),
    ...(h.computer ? [`On their computer (${h.computer.name}, this phone keeps a copy${h.computer.away ? `; out of reach, last heard ${new Date(h.computer.heard).toLocaleString()}` : ""}): ${h.computer.asks} agent question${h.computer.asks === 1 ? "" : "s"}, ${h.computer.approves} waiting for Approve, ${h.computer.tasks} open task${h.computer.tasks === 1 ? "" : "s"}${h.computer.queued ? `, ${h.computer.queued} change${h.computer.queued > 1 ? "s" : ""} waiting to send` : ""}. They act on it in its droplet ("On ${h.computer.name}").`] : []),
    ...((h.phoneApproved || []).length ? ["Approved from their phone today:", ...h.phoneApproved.map((a) => `- ${a.repo} from ${a.phone}: ${a.status}${a.pr ? ` (${a.pr})` : ""}`)] : []),
  ].join("\n");
}

// Home's talk: the same Symbiot, acting in the right lane (mind.mjs actIn/actNow).
async function homeAsk(question, { ask, now = Date.now(), state, images = [], acts = {} } = {}) {
  question = String(question || "").trim().slice(0, 2000);
  // a secret in it goes to the vault first: what's settled, handed or logged from here on has only "[saved: …]" (19 Oct 2026: a card closed by chat kept the password whole)
  // what it's for, when a key comes alone: the chat just before it, and what's waiting on the user to paste (the cards' steps)
  try { question = captureSecrets(question, { context: () => { const log = (loadMind().log || []).slice(-6).map((l) => String((l && l.text) || "")), h0 = state || homeState({ now }); return [...log, ...(h0.you || []).map((y) => `${y.q || ""} ${y.sub || ""}`)].join("\n"); } }).text; } catch {}
  if (!question && images.length) question = "Take a look at this screenshot.";
  if (!question) return { error: "empty" };
  // the screenshots go to the model, and their files with any work it hands an agent
  let pics = []; try { pics = images.map((p) => ({ path: p, mime: /\.png$/i.test(p) ? "image/png" : /\.webp$/i.test(p) ? "image/webp" : /\.gif$/i.test(p) ? "image/gif" : "image/jpeg", data: readFileSync(p).toString("base64") })); } catch {}
  const shotNote = pics.length ? `\n\nScreenshots the user attached (open them with your Read tool): ${pics.map((i) => i.path).join(", ")}` : "";
  if (!ask && PHONE) return phoneChat(question);
  if (!ask && !resolveProvider()) return phoneNoAi() || { error: "not-connected" };
  const h = state || homeState({ now });
  let map = {}; try { map = laneMap(); } catch {}
  if (!h.handed) { try { h.handed = handedState({ now, tasks: loadTasks(), list: agentsList(), map }); } catch { h.handed = []; } }
  if (!h.finished) { try { h.finished = finishedState({ now }); } catch { h.finished = []; } }
  if (!h.digest) { try { h.digest = agentDigest({ now, map, tasks: loadTasks() }); } catch { h.digest = []; } }
  if (!h.ledger) h.ledger = garthLedger();
  const role = "Here they're on Symbiot's home: one liquid surface that shows what only they can do, what's new on what they watch, and the lanes. Answer from what it shows, and act on what they ask.";
  let open = []; try { open = loadTasks().filter((t) => t && !t.done && !t.archived && !t.review).map((t) => ({ id: t.id, text: t.text, repo: t.repo })); } catch {}
  const r = await converse({ where: "Home", role, nav: true, settle: true, control: true, tasks: open, context: homeContext(h), question: question + (pics.length ? `\n(The user attached ${pics.length} screenshot${pics.length > 1 ? "s" : ""}: you can see ${pics.length > 1 ? "them" : "it"}.)` : ""), map, now, images: pics.map(({ mime, data, path }) => ({ mime, data, path })), ...(ask ? { ask } : {}),
    act: {
      agent: (req, known, repo, said) => { const d = repo ? actIn(req + shotNote, repo, { map, known, title: "Home", said }) : actNow(req + shotNote, { title: "Home", known }); noteHanded(d, req); return d; },
      task: (text, repo) => { const d = taskIn(text + shotNote, repo, { map }); noteHanded(d, text); return d; },
      control: (ops) => control(ops, { map }),
      ...acts, // a phone's chat (phone.mjs OPS.chat) overrides these: it answers and adds tasks, but starts and steers nothing (15 Oct 2026)
    } });
  const settled = settleFromChat(h, r.settled, question);
  if (settled) cached = null;
  return { answer: r.reply, spoken: r.spoken, ...(settled ? { settled } : {}), ...(r.did ? { did: r.did } : {}), ...(r.go ? { go: r.go } : {}), steps: r.steps || [] };
}

// ---- acting on a report, where you read it (reports.mjs reportIdeas) -------------------
// A report ends with ideas drawn from it, and a box to ask about it: you shouldn't have
// to copy its "Top 3 next" into Home's chat to act on it (2026-10-08).
const reportById = (id, deps = {}) => (deps.list || listReports)().find((r) => r.id === String(id || ""));
// The ideas you ticked, onto the Workdesk in the report's lane (an ops run's: the ops
// lane), each saying which report it came from. { ok, added, lane, said } or { error }.
function reportIdeasAdd(id, ideas, deps = {}) {
  const r = reportById(id, deps); if (!r) return { error: "That report isn't there any more." };
  const list = (Array.isArray(ideas) ? ideas : []).map((x) => String(x || "").trim()).filter(Boolean).slice(0, 8);
  if (!list.length) return { error: "Tick an idea first." };
  const lane = r.lane || RUNS_LANE, add = deps.add || addTask;
  // a finding ticked from it ("…is already approved, not pending") goes in done, saying so: it isn't a job
  const added = list.map((t) => add(t, lane, { after: `(from the report "${r.title}", ${r.file})`, ...(isFinding(t) ? { finding: true } : {}) })).filter((t) => t && !t.error);
  cached = null;
  if (added.length) (deps.mark || markIdeas)(r, list, "handed");
  const facts = added.filter((t) => t.finding).length, jobs = added.length - facts, where = lane === RUNS_LANE ? "ops" : lane;
  const said = [jobs ? `${jobs === 1 ? "It's" : `${jobs} are`} on the Workdesk, in ${where}.` : "", facts ? `${facts === 1 ? "One is a finding" : `${facts} are findings`}, not a job, so ${facts === 1 ? "it's" : "they're"} ticked as done, in the Archive.` : ""].filter(Boolean).join(" ");
  return added.length ? { ok: true, added: added.length, lane, said } : { error: "Couldn't add them." };
}
// Not worth acting on: the idea leaves the report's open list without going to the Workdesk.
function reportIdeasDismiss(id, ideas, deps = {}, done = false) {
  const r = reportById(id, deps); if (!r) return { error: "That report isn't there any more." };
  const list = (Array.isArray(ideas) ? ideas : []).map((x) => String(x || "").trim()).filter(Boolean).slice(0, 8);
  if (!list.length) return { error: "Pick an idea first." };
  (deps.mark || markIdeas)(r, list, done ? "done" : "dismissed");
  return { ok: true, said: done ? "Marked done." : list.length === 1 ? "Dismissed." : `${list.length} dismissed.` };
}
// What happened after the report was written, from its folder: whether a proof went out, and
// the lane's newest answers and handover reports. With only the report's text, the chat on
// the Dana proof (21 Oct 2026) said the mail "didn't hold up" and started a second trace,
// when ops had already found her failed test was the site-side change the mail said was pending.
function sinceReport(r, { read = (f) => readFileSync(f, "utf8"), stat = (f) => statSync(f) } = {}) {
  const dir = r && r.folder ? join(r.folder, ".symbiot") : ""; if (!dir) return "";
  const out = [];
  try { const t = stat(join(dir, "PROOF.sent.md")).mtime; out.push(`It was sent: .symbiot/PROOF.sent.md is the text that went out, approved by the user, at ${new Date(t).toLocaleString("en-ZA", { hour12: false })}. Never say it can still be held.`); } catch {}
  let ans = ""; try { ans = read(join(dir, "ANSWERS.md")); } catch {}
  if (ans.trim()) out.push(`The lane's newest answers and handover reports (.symbiot/ANSWERS.md, newest last). Read them before saying what's true now, and before starting any work: what's already found or done there isn't redone.\n${ans.slice(-6000)}`);
  return out.length ? `\n\nSince the report:\n${out.join("\n\n")}` : "";
}
// A card is a conversation with its agent, like an agent's pane: what the user types on it that
// is a question or a remark, not an answer ("did you fix the force app", 22 Oct 2026), is answered
// on the card from that run's own records, and the card's question stays open. Asked for work
// ("check it again", "fix it"), it acts: the run's lane takes it, as from Home's chat. null when
// the text is an answer (answerQuestions takes it as before).
async function cardTalk(path, answers, { ask, deps = {}, extra = "", force = false } = {}) {
  const rows = Array.isArray(answers) ? answers : [], one = rows.length === 1 ? rows[0] : null;
  if (!path || !one || !String(one.a || "").trim()) return null;
  const read = deps.read || ((f) => { try { return readFileSync(join(path, ".symbiot", f), "utf8"); } catch { return ""; } });
  const qs = (deps.questions || ((p) => { try { return agentQuestions(p, "", { raw: true }).questions; } catch { return []; } }))(path);
  const q = qs.find((x) => String(x.q).trim().toLowerCase() === String(one.q || "").trim().toLowerCase()) || { q: one.q, options: [] };
  if (!force && !asksBack(one.a, q.options || [])) return null;
  if (!ask && !resolveProvider()) return null; // no AI here: it's taken as before (asked back, its run writes it up)
  let map = {}; try { map = laneMap(); } catch {}
  const lane = laneOfPath(path, map), name = lane || "this run", said = String(one.a).trim();
  const before = talkOf(path, q.q); addTalk(path, q.q, { from: "you", text: said });
  let rec = null; try { rec = runRecord(path); } catch {}
  const open = read("TASKS.md").split("\n").filter((l) => /^\s*-\s*\[[ ~]\]/.test(l)).slice(0, 12).join("\n");
  const role = `You are the agent behind a card on the user's screen, for ${name}. The card asks them: "${q.q}". What they just typed on it is a question or a remark to you, not their answer: the card's question stays open. Reply on the card, in a few plain sentences, from what this run knows below: say what's true now, and what happens next. If they asked you to do or check something, do it (start the work) rather than say you will. Never tell them to answer the card first.`;
  const context = [`The card's question: ${q.q}${(q.options || []).length ? `\nIts options: ${q.options.join(" | ")}` : ""}${q.context ? `\nIts context: ${q.context}` : ""}`,
    rec ? `How this run ended: ${rec.state}${rec.waitingOn ? `, waiting on ${rec.waitingOn}` : ""}${rec.what ? ` (${rec.what})` : ""}${rec.summary ? `\nIts last words: ${rec.summary}` : ""}` : "",
    open ? `Its open and waiting items:\n${open}` : "", `The newest answers it has (newest last):\n${read("ANSWERS.md").slice(-4000)}`,
    before.length ? `Said on this card already:\n${talkText(before)}` : "", extra].filter(Boolean).join("\n\n");
  const res = await converse({ where: `Card: ${name}: ${String(q.q).slice(0, 60)}`, role, context, question: said, map, ...(ask ? { ask } : {}),
    act: { agent: (req, known, repo, s2) => (repo || lane ? actIn(req, repo || lane, { map, known, title: "Card", said: s2 }) : actNow(req, { title: "Card", known })), task: (text, repo) => taskIn(text, repo || lane, { map }) } });
  const reply = String(res.reply || "").trim() || "I couldn't answer that just now.";
  const talk = addTalk(path, q.q, { from: "agent", text: reply });
  return { ok: true, talk, reply, ...(res.did ? { did: res.did } : {}), lane: lane || "ops" };
}
// Ask about an update (needs.mjs Updates, intuition's notes): the same mind as Home's chat, the update's
// moves in front of it, and it can act on what's asked ("do the second one", "why did you think that?").
async function updateAsk(id, text, { context = "", ask } = {}) {
  text = String(text || "").trim().slice(0, 2000); if (!text) return { error: "empty" };
  if (!ask && !resolveProvider()) return phoneNoAi() || { error: "not-connected" };
  let map = {}; try { map = laneMap(); } catch {}
  const role = "They're asking about an update on their Updates list: things Symbiot noticed or did, or would have done, on its own. Answer about it plainly; if they ask for one of its moves (or anything) to be done, do it.";
  const res = await converse({ where: `Updates: ${id}`, role, context: `The update's moves:\n${context || "(none kept)"}`, question: text, map, ...(ask ? { ask } : {}),
    act: { agent: (req, known, repo, said) => (repo ? actIn(req, repo, { map, known, title: "Updates", said }) : actNow(req, { title: "Updates", known })), task: (t, repo) => taskIn(t, repo, { map }) } });
  return { answer: res.reply, ...(res.did ? { did: res.did } : {}) };
}
// Ask about the report in place: the same mind as Home's chat, the report in front of it.
async function reportAsk(id, question, { ask, deps = {} } = {}) {
  question = String(question || "").trim().slice(0, 2000); if (!question) return { error: "empty" };
  const r = (deps.read || readReport)(id, { mark: false }); if (!r || r.error) return { error: (r && r.error) || "That report isn't there any more." };
  // The report a card links to ("Read the report: …") is that card's agent's: what the user writes
  // here goes to it. An answer answers the card (and closes it); a question is talk on the card. On
  // 22 Oct 2026 the user answered a card in its report, the chat here took it as a general remark,
  // and the card kept asking.
  let linked = []; try { linked = (deps.questions || ((p) => agentQuestions(p, "", { raw: true }).questions))(r.folder).filter((q) => q.report && q.report.id === r.id); } catch {}
  if (linked.length === 1 && r.folder) {
    const q = linked[0];
    if (!asksBack(question, q.options || [])) {
      const a = (deps.answer || answerQuestions)(r.folder, [{ q: q.q, a: question }], { rerun: true, share: true });
      if (a && a.ok) return { answer: `Sent to its agent as your answer to "${q.q}"${a.rerun ? ": it's picking it up now" : ""}. That card is closed.`, answered: q.q, ...(a.rerun ? { rerun: a.rerun } : {}) };
    } else {
      const t = await cardTalk(r.folder, [{ q: q.q, a: question }], { ask, deps: deps.questions ? { questions: deps.questions } : {}, extra: `The report the user is reading (${r.file}):\n${String(r.text || "").slice(0, 6000)}` });
      if (t) return { answer: t.reply, talk: t.talk, card: q.q };
    }
  }
  if (!ask && !resolveProvider()) return phoneNoAi() || { error: "not-connected" };
  let map = {}; try { map = laneMap(); } catch {}
  const lane = r.lane && r.lane !== RUNS_LANE && map[r.lane] ? r.lane : "";
  const role = `Here they're reading a report an agent wrote, "${r.title}"${lane ? ` (${lane})` : ""}, under Reports. Answer about it from its text; a task or agent work it leads to goes to ${lane || "the lane it belongs to"} unless they say otherwise.`;
  const res = await converse({ where: `Reports: ${r.title}`, role, context: `The report (${r.file}):\n${String(r.text || "").slice(0, 12000)}${sinceReport(r)}`, question, map, ...(ask ? { ask } : {}),
    act: {
      agent: (req, known, repo, said) => ((repo || lane) ? actIn(req, repo || lane, { map, known, title: "Reports", said }) : actNow(req, { title: "Reports", known })),
      task: (text, repo) => taskIn(text, repo || lane, { map }),
    } });
  return { answer: res.reply, spoken: res.spoken, ...(res.did ? { did: res.did } : {}), steps: res.steps || [] };
}
// Approve or Reject on a draft report: its agent is told in ANSWERS.md, and an approved
// one goes ahead (its agent starts, or takes it once the run there finishes).
function reportDraftAnswer(id, approve, deps = {}) {
  const r = reportById(id, deps); if (!r) return { error: "That report isn't there any more." };
  const rel = `.symbiot/${r.name}`;
  (deps.decide || decide)(r, approve ? "approved" : "rejected");
  cached = null;
  if (!approve) { noteAnswer(r.folder, `Rejected: ${rel}`, `The user rejected the draft "${r.title}". Don't use or send it. If they said why, it's below.`); return { ok: true, said: "Rejected. Its agent won't use it." }; }
  noteAnswer(r.folder, `Approved: ${rel}`, `The user approved the draft "${r.title}" as it reads in ${rel}. Go ahead with it, unchanged, and say what you did in your last message.`);
  if ((deps.running || runningHandoff)(r.folder)) return { ok: true, said: "Approved. Its agent goes ahead once the run there now finishes." };
  const e = (deps.run || runHandoff)(r.folder, { force: true });
  return e && e.id && !e.blocked ? { ok: true, said: "Approved. Its agent is going ahead with it.", rerun: e.id } : { ok: true, said: `Approved. ${(e && e.note) || "Start its agent to go ahead."}` };
}

// ---- the work scene: the liquid when you open Tasks or Agents ---------------------
// Plain words for someone who doesn't read diffs: what each agent is doing now,
// what's waiting its turn, what's done and waiting for your OK, and whether
// there's anything a Go would start. The details (steps, files, cost) stay one
// tap away, in the Agents panel.
const plain = (s, n = 64) => { s = String(s || "").replace(/[\`*_#>]/g, "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
// A running agent's line (agents.mjs workOf → work.mjs runLine): "step 2 of 4: look
// and feel, plus a zoned world · shooting the monsters", with quiet (minutes since it
// last moved, once that's long) and looping. Without one, what it's doing now. eta:
// how long it has left, as a range from the lane's past runs of its kind and what's
// held for its next run (estimate.mjs), when there's enough to go on.
function runNow(a, { now = Date.now(), est = estimate } = {}) {
  const l = a.line, w = a.work || {}, todo = (w.todos || []).find((t) => t.status === "in_progress");
  let eta = null; try { if (l && a.path) eta = est({ path: a.path, kind: l.kind || "brief", type: l.task ? taskType(l.task) : "", typeOf: taskType, elapsed: a.startedAt ? now - a.startedAt : a.elapsed || 0, queued: (a.held || []).length }); } catch {}
  return { line: plain(l ? l.line : todo ? todo.active : w.doing || "working on it", 140), ...(l && l.step ? { step: l.step, of: l.of } : {}), ...(l && l.quiet ? { quiet: l.quiet } : {}), ...(l && l.looping ? { looping: true } : {}), ...(eta ? { eta: estimateWords(eta), etaLo: eta.lo, etaHi: eta.hi } : {}) };
}
// Projects (the lanes) are sorted the way you'd look for them: what needs you
// first (a question, an Approve), then what's at work, ready, waiting, and the
// most recent. Ops runs (act-…: no repo of their own) are one "Agent runs" lane,
// not a sphere each with an id for a name.
// Kept WORK_KEEP (like homeState's KEEP): the Workdesk and the phone ask for it every
// few seconds, and each build read every run's log and git for every lane (15 Oct 2026).
// Only the plain call is kept; one with deps (a test's stubs) is built. The 10 s tick
// (workTick) builds the plain one (fresh) and the routes read it: kept 8 s, less than the
// tick, the tick never found its own and every route after it built it again (20 Oct 2026).
const WORK_KEEP = 15000; let workKept = null;
const forgetWork = () => { workKept = null; forgetAgents(); }; // after anything you do (a POST): the next look is built afresh
function workScene({ deps = {}, full = false, fresh = false } = {}) {
  const plain = !Object.keys(deps).length;
  if (plain && !fresh && workKept && Date.now() - workKept.at < WORK_KEEP) return full ? workKept.v : workKept.lean;
  const v = workSceneNow({ deps, full: true }), { all: _all, ...lean } = v;
  if (plain) workKept = { at: Date.now(), v, lean };
  return full ? v : lean;
}
function workSceneNow({ deps = {}, full = false } = {}) {
  const agents = deps.agents || (() => { try { return agentsNow(); } catch { return []; } });
  const pending = deps.pending || (() => { try { return pendingReview({ kept: true }); } catch { return []; } });
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
    running.push({ id: "run:" + a.path, path: a.path, name: a.name, lane: laneOf(a), ...(parallelLane(a.path) ? { par: true } : {}), doing: plain(todo ? todo.active : w.doing || "Working on it", 120), progress: pg || null, ...runNow(a), waiting: !!nq, started: a.startedAt || (a.elapsed ? Date.now() - a.elapsed : 0) });
  }
  const pend = pending(), ready = pend.filter((r) => r.path && !r.running && !r.shipping && !r.leftover && ((r.tasks || []).length || (r.files || []).length)).map((r) => ({ id: "ready:" + r.repo, repo: r.repo, count: (r.tasks || []).length }));
  const busy = new Set(running.map((r) => r.lane)), open = tasks().filter((t) => !t.done && !t.archived && !t.review && t.repo);
  // why each one waits, in plain words: on it now, queued behind a run, waiting on you, blocked, or next
  // A lane waits on you only while there's a card you can act on: its question, or the
  // needs card (troubles) for its OK or your step. A step whose card is gone (skipped, done,
  // dismissed) held every task in its lane as "waiting on your answer", each an amber orb
  // with nothing behind it: 5 of them on 19 Oct 2026, under an empty "Only the user can do".
  const stuck = deps.stuck || (() => { try { return stuckHandovers(); } catch { return []; } });
  const drafts = deps.drafts || (() => { try { return draftCards(); } catch { return []; } });
  // The cards are read from the job record Home writes (jobs.mjs onUser), so an orb never stands
  // for a question Home dropped (answered already, held in the vault, asked twice by one agent).
  // With the agents stubbed (tests) and no record given, they're worked out from those agents here.
  const gone = (deps.dismissed || loadDismissed)(), trouble = troubles({ stuck: stuck(), list: AG, map, named, drafts: drafts() });
  const cards = deps.onUser ? deps.onUser() : deps.agents ? null : (homeState({ tick: true }), onUser()); // tick: the scene reading Home is nobody looking (homeTick)
  const held = {};
  if (cards) for (const c of cards) {
    if (c.kind !== "ask" || (c.fix && c.fix !== "needs") || !c.path) continue; // a question, or a run's OK or step; not a draft, a stuck handover or a failed run
    const a = AG.find((x) => x.path === c.path); if (a && a.status === "running") continue;
    const l = a ? laneOf(a) : c.lane || RUNS_LANE;
    if (!held[l]) held[l] = { path: c.path, approve: c.fix === "needs" && !!c.ok, step: c.fix === "needs" && !c.ok };
  } else {
    const carded = new Set(trouble.filter((t) => t.fix === "needs" && !gone[cardKey(t)] && !isDone(t.q)).map((t) => t.path));
    for (const a of AG) { if (a.status === "running") continue; const l = laneOf(a), nq = (a.ask && a.ask.questions && a.ask.questions.length) || 0, card = !nq && a.needs && carded.has(a.path); if (!held[l] && (nq || card)) held[l] = { path: a.path, approve: !!card && a.needs.kind === "approve", step: !!card && a.needs.kind !== "approve" }; }
  }
  const why = waitWhy({ map, named, running, held, ready: new Set(ready.map((r) => r.repo)), isParked, deps });
  const waiting = open.map((t) => ({ id: "task:" + t.id, text: plain(t.text, 160), repo: t.repo, busy: busy.has(t.repo), ...(isParked(t.repo) ? { parked: true } : {}), ts: Number(t.ts) || 0, why: why(t) })); // the app shortens it for a tag
  { const nowT = deps.now || Date.now(), st = startable(waiting, nowT); if (peakHeld((deps.config || loadConfig)(), nowT, st.lanes.size + st.ops.length)) for (const x of st.items) if (x.why.kind === "next") x.why = { kind: "peak", peak: true, text: PEAK_TEXT }; }
  try { const sync = deps.syncTasks || (deps.agents ? null : syncTasks); if (sync) sync(waiting, { now: deps.now || Date.now() }); } catch {} // the job record: running or queued is this list's word, not the chat's guess
  // Projects: each lane with work on it, what's going on there in one line's worth
  const by = {}, at = (name) => (by[name] = by[name] || { repo: name, name: name === RUNS_LANE ? "Agent runs" : named(map[name], name), waiting: 0, ready: 0, asks: 0, running: null, last: 0, ...(name === RUNS_LANE ? { runs: 0 } : {}) });
  running.forEach((r) => { const p = at(r.lane); if (r.lane === RUNS_LANE) p.runs++; if (!p.running) p.running = { doing: r.doing, progress: r.progress, ask: r.waiting, ...(r.line ? { line: r.line } : {}), ...(r.eta ? { eta: r.eta } : {}), ...(r.quiet ? { quiet: r.quiet } : {}), ...(r.looping ? { looping: true } : {}) }; p.last = Math.max(p.last, r.started || 0); });
  ready.forEach((r) => { at(r.repo).ready = r.count || 1; });
  pend.forEach((r) => { if (r.shipping) at(r.repo).shipping = r.shipping.step || "starting"; }); // Approve at work there: says so, not "ready for your OK"
  open.forEach((t) => { const p = at(t.repo); p.waiting++; p.last = Math.max(p.last, Number(t.ts) || 0); });
  Object.keys(asks).forEach((l) => { at(l).asks = asks[l]; });
  // The relay (the Tasks screen, so you needn't open Agents): per project, what its
  // latest run did or is doing in a line, its open questions with their answers,
  // and the extra tasks its agents suggested, each with the folder that asked.
  const DAY = 86400000, now = Date.now(), seenR = new Set(), lineOf = {};
  for (const a of AG) {
    if (seenR.has(a.path)) continue; seenR.add(a.path);
    const l = laneOf(a), qs = (a.ask && a.ask.questions) || [], ideas = ((a.ask && a.ask.suggestions) || []).filter((s) => s && s.text && !s.added);
    const age = a.startedAt ? now - a.startedAt : a.elapsed != null ? a.elapsed : Infinity, recent = a.status === "running" || age < DAY;
    const away = ((a.ask && a.ask.away) || []).filter((s) => s && s.text && !s.added), sent = {};
    if (!by[l] && !qs.length && !ideas.length && !away.length && !recent) continue;
    const p = at(l);
    if (recent || qs.length) {
      const w = a.work || {}, todo = (w.todos || []).find((x) => x.status === "in_progress"), t = a.status === "running" ? ((todo && todo.active) || w.doing || "Working on it") : (w.final || a.tail || "");
      // an ended run's record (agents.mjs runOutcome) is its line and state, as on every other screen
      const o = a.status !== "running" ? a.outcome : null, who = o && (o.waitingOn === "user" ? "you" : o.waitingOn === "lane" ? String(o.what || "").split(":")[0] || "another lane" : o.waitingOn);
      const line = plain(String(o && o.summary ? o.summary : t).split(/\n\s*\n/)[0], 220);
      const st = a.status === "running" ? "at work" : o ? (o.state === "waiting" ? (o.waitingOn === "user" && qs.length ? "asks you" : `waiting on ${who || "something"}`) : o.state === "failed" ? "failed" : o.state === "paused" ? "paused" : "done") : qs.length ? "asks you" : "done";
      if (line) lineOf[a.path] = { line, state: st };
      if (line && !p.summary) { p.summary = line; p.state = lineOf[a.path].state; p.path = a.path; }
    }
    // Agent runs are one card for many unrelated jobs: each question says which job it's for
    const job = l === RUNS_LANE ? plain(String(a.name || "").replace(/^Agent:\s*/, "").replace(/^New job:\s*/i, ""), 90) : "";
    for (const q of qs) { p.qs = p.qs || []; const c = { q: q.shown || q.q, ...(q.shown ? { raw: q.q } : {}), ...(q.task || job ? { task: q.task || job } : {}), ...(q.talk ? { talk: q.talk } : {}), options: (q.options || []).slice(0, 3), ...(q.labels ? { labels: q.labels } : {}), path: a.path, ...signInCard([q.q, ...(q.options || []).slice(0, 3)]), ...reportLink(q.report) }; if (gone[cardKey(c)]) { p.asks = Math.max(0, p.asks - 1); continue; } if (p.qs.length < 3) p.qs.push(c); } // one dismissed (dismissCard) stays off the relay too
    // an idea for another lane is on that lane's sheet, and here just "2 ideas sent to symbiot" (agents.mjs routeIdeas)
    for (const s of ideas.concat(away.filter((s) => !s.delivered))) {
      const there = s.other || s.delivered === false ? at(s.repo) : p;
      there.ideas = there.ideas || []; if (there.ideas.length < 4 && !there.ideas.some((x) => sameTask(x.full, s.text))) there.ideas.push({ text: plain(s.text, 200), full: String(s.text), repo: s.repo || l, path: s.path || a.path, ...(there !== p || s.from ? { from: s.from || a.name } : {}) });
      if (there !== p) sent[s.repo] = (sent[s.repo] || 0) + 1;
    }
    for (const s of away) if (s.delivered) sent[s.repo] = (sent[s.repo] || 0) + 1;
    if (Object.keys(sent).length) p.sent = Object.entries(sent).map(([repo, n]) => ({ repo, n }));
  }
  // Agent runs' card: its line is from the run whose question it shows, not the newest run. It read
  // "The phone code check is still not done" over the Bookly broker test's question, and the user
  // had to ask what the card was (21 Oct 2026).
  { const p = by[RUNS_LANE], q = p && p.qs && p.qs[0], own = q && lineOf[q.path]; if (own && p.path !== q.path) { p.summary = own.line; p.state = own.state; p.path = q.path; } }
  // what each lane handed over and hasn't heard back on, with where it stands and how far the run on it has got
  let led; const handing = deps.handing || ((path) => { try { return handingOf(path, { map, ledger: (led = led || loadLedger()) }); } catch { return []; } });
  for (const [repo, path] of Object.entries(map)) { const h = handing(path); if (h.length) at(repo).handing = h.slice(0, 3); }
  for (const t of trouble) {
    const p = at(t.repo || RUNS_LANE); p.asks++; p.qs = p.qs || [];
    if (p.qs.length < 3) p.qs.unshift({ q: t.q, options: t.options, path: t.path, fix: t.fix, id: t.id, sub: t.sub, ...(t.draft ? { draft: t.draft } : {}), ...(t.signInTo ? { signInTo: t.signInTo } : {}) });
  }
  for (const p of Object.values(by)) { p.lit = !!(p.asks || p.ready); if (isParked(p.repo)) p.parked = true; }
  const projects = Object.values(by).sort((a, b) => (b.lit ? 1 : 0) - (a.lit ? 1 : 0) || (a.parked ? 1 : 0) - (b.parked ? 1 : 0) || (b.running ? 1 : 0) - (a.running ? 1 : 0) || b.ready - a.ready || b.waiting - a.waiting || b.last - a.last || (a.repo < b.repo ? -1 : 1));
  const stuckN = waiting.filter((w) => w.why.stuck).length, parkedList = (deps.parkedJobs || (() => { try { return parkedJobs({ now: deps.now || Date.now() }); } catch { return []; } }))();
  return { running, ready, waiting: waiting.slice(0, 12), ...(full ? { all: waiting } : {}), waitingCount: waiting.length, parked: parkedList.slice(0, 4), parkedCount: parkedList.length, canGo: waiting.filter((w) => !w.busy && !w.parked && !w.why.noGo).length, ...(stuckN ? { stuckCount: stuckN } : {}), projects: projects.slice(0, 24), projectCount: projects.length };
}
// ---- why a task waits ---------------------------------------------------------------
// Home showed "7 waiting" and nothing said why or moved them (2026-10-08): an ops task
// ("🤖 Agent: free space on /mnt/storage") had no folder, so Go passed it over, and a
// repo's tasks sat until someone pressed Go. Each waiting task now says why, in a
// line: its lane's agent is on it now; it's queued behind the run in its lane (named);
// it waits on your answer or your OK (its Workdesk card: `path`); it's blocked (no
// folder, no agent, parked, the start failed); or it's next, and starts by itself
// (workTick). One whose lane is free and has waited past STUCK_AFTER, or whose run
// ended without ticking it, is flagged (`stuck`) rather than started again and again.
const AUTO_GRACE = 10000, STUCK_AFTER = 5 * 60000, RETRY_AFTER = 5 * 60000, AUTO_FAIL = {}; // lane → { at, note }: a start that didn't take
// Peak hours: Anthropic drains the Claude Max 5-hour window faster on weekdays 5–11am Pacific
// (2–8pm SAST in northern summer), and a batch of agents started together burns it fastest. A
// batch (two or more starts in one tick) waits for off-peak and goes by itself; one lone start,
// and the Go button, never wait. config.peakGuard: false turns it off.
function isPeak(now = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return !/^(Sat|Sun)$/.test(p.weekday) && Number(p.hour) >= 5 && Number(p.hour) < 11;
}
const PEAK_TEXT = "Waiting for off-peak hours (weekdays 5–11am Pacific, 2–8pm SAST) to keep your Claude Max window from draining";
// What a tick would start from the waiting list: the lanes and ops tasks that are next, stuck-and-startable or due a retry.
function startable(all, now) {
  const lanes = new Set(), ops = [], items = [], beside = [];
  for (const x of all) {
    if (x.why.kind === "beside") { if (now - (x.ts || 0) >= AUTO_GRACE) { items.push(x); beside.push(x); } continue; }
    if (x.why.kind !== "next" && !(x.why.stuck && !x.why.ended) && !(x.why.failAt && now - x.why.failAt >= RETRY_AFTER)) continue; // a failed start: tried again every few minutes
    if (now - (x.ts || 0) < AUTO_GRACE) continue;
    items.push(x); if (x.repo === RUNS_LANE) ops.push(x.id.slice(5)); else lanes.add(x.repo);
  }
  return { lanes, ops, items, beside };
}
const peakHeld = (cfg, now, n) => cfg.peakGuard !== false && n > 1 && isPeak(now);
const yours = (text) => /^\s*👤/.test(String(text || "")); // "👤 You (only you: …)": the user's step, never an agent's
// A card that asks you to sign in to a site ("sign in to domains.co.za in Symbiot's browser")
// carries the site, and shows a button that opens Symbiot's browser window on it (links.mjs).
function signInCard(texts) { let s = null; try { s = signInAsked(texts.filter(Boolean).join("\n")); } catch {} return s ? { signInTo: s } : {}; }
const asAgent = (text) => String(text || "").replace(/^\s*🤖\s*/u, "").replace(/^Agent:\s*/i, "").trim();
const minutes = (ms) => { const m = Math.round(ms / 60000); return m >= 120 ? `${Math.round(m / 60)} hours` : `${m} min`; };
// What a folder's agent was last handed (agents.mjs handed.json) and when its last run started.
function briefOf(path) { try { const h = JSON.parse(readFileSync(join(path, ".symbiot", "handed.json"), "utf8")); return { at: Number(h.at) || 0, tasks: Array.isArray(h.tasks) ? h.tasks : [] }; } catch { return { at: 0, tasks: [] }; } }
function lastRunAt(path) { const r = loadRuns().find((x) => x.path === path); return (r && Number(r.startedAt)) || 0; }
function waitWhy({ map, named, running, held, ready, isParked, deps = {} }) {
  const brief = deps.brief || briefOf, lastRun = deps.lastRun || lastRunAt, now = deps.now || Date.now();
  const agentSet = !!(deps.cmd || handoffCmd)(), fails = deps.fails || AUTO_FAIL, besideIds = (deps.beside || inflightIds)();
  return (t) => {
    const lane = t.repo, name = lane === RUNS_LANE ? "ops" : named(map[lane], lane), age = now - (Number(t.ts) || now);
    const flag = (text) => ({ kind: "stuck", stuck: true, text });
    if (yours(t.text)) return { kind: "you", noGo: true, text: "Yours to do: no agent can, so nothing starts it" };
    if (isParked(lane)) return { kind: "parked", text: `Blocked: ${name} is parked, so nothing starts there until you unpark it` };
    if (t.later) return { kind: "later", text: "Waiting for Go: a fix to Symbiot noted from chat, so it starts no run and parks nothing until you say" };
    if (!agentSet) return { kind: "blocked", text: "Blocked: no coding agent is set (Settings → Handoff)" };
    const fail = fails[lane];
    if (lane === RUNS_LANE) { // each gets an agent run of its own: never queued behind another
      if (fail) return { kind: "blocked", failAt: fail.at, text: `Blocked: it didn't start (${fail.note})` };
      return age > STUCK_AFTER ? flag(`Not started after ${minutes(age)}, with nothing in its way`) : { kind: "next", text: "Next: starts as an agent run of its own" };
    }
    const path = map[lane]; if (!path) return { kind: "blocked", noGo: true, text: `Blocked: Symbiot can't find ${name}'s folder` };
    const b = brief(path), inBrief = b.tasks.some((x) => sameTask(x, t.text)), run = running.find((r) => r.lane === lane && !r.par), mine = running.filter((r) => r.lane === lane);
    if (besideIds.has(t.id)) return { kind: "working", text: `Running now in a copy of ${name}'s repo of its own, beside its other agent` };
    if (run) {
      if (inBrief) return { kind: "working", text: `${name}'s agent is on it now` };
      // not in the run's brief: it runs beside it unless it clashes with what's going, or the lane is at its cap,
      // or a run beside already stopped on it with nothing changed since, got it done, left its patch, handed
      // it over or asked (parallel.mjs besideAgain; then the lane's own run takes it, never a second copy)
      const tried = (deps.besideAgain || besideAgain)(path, t.id);
      if (tried) return { kind: "queued", waitKind: tried.kind || "tried", text: `Queued behind ${name}'s run: ${plain(run.doing, 60).toLowerCase()}. Why it waits: ${tried.note}, so ${name}'s own agent takes it next.`, run: run.doing };
      const f = (deps.facts || laneFacts)(path), st = (deps.licence || licenceState)();
      const beside = (deps.parallel || inflight)().filter((m) => m.lane === lane), active = [...(deps.openTasks || openTasksOf)(path).slice(0, 2).map((x) => ({ text: x, who: `${name}'s run` })), ...beside.map((m) => ({ text: m.task, who: "the run beside it" }))];
      const v = verdict({ text: t.text, name, active, count: Math.max(mine.length, 1 + beside.length), cap: (deps.cap || laneCap)(undefined, st), pro: isPro(st), dirty: f.dirty, git: f.git });
      return v.ok ? { kind: "beside", text: `Next: starts beside ${name}'s run, in a copy of the repo of its own`, run: run.doing } : { kind: "queued", waitKind: v.kind, text: `Queued behind ${name}'s run: ${plain(run.doing, 60).toLowerCase()}. Why it waits: ${v.text}.${run.eta ? ` Expected wait: ${run.eta}.` : " That run has no time estimate yet."}`, run: run.doing };
    }
    const h = held[lane];
    if (h) return h.approve ? { kind: "approve", noGo: true, text: `Waiting on your OK for ${name}'s last run, on the Workdesk`, path: h.path } : h.step ? { kind: "step", noGo: true, text: `Waiting on a step only you can do for ${name}: its card is under Needs you`, path: h.path } : { kind: "asks", noGo: true, text: `Waiting on your answer to ${name}'s question, on the Workdesk`, path: h.path };
    if (inBrief && ready.has(lane)) return { kind: "approve", noGo: true, text: `Waiting on your OK for ${name}'s work, on the Workdesk`, path };
    if (fail) return { kind: "blocked", failAt: fail.at, text: `Blocked: ${name}'s agent didn't start (${fail.note})` };
    if (inBrief && lastRun(path) >= b.at) return { ...flag(`${name}'s last run ended without finishing it: Go starts it again`), ended: true };
    return age > STUCK_AFTER ? flag(`Not started after ${minutes(age)}, with nothing in its way`) : { kind: "next", text: `Next: starts on its own, ${name}'s lane is free` };
  };
}
// Start what's next by itself, every 10 seconds and as soon as a run ends (server.mjs): a lane's waiting tasks go
// to its agent once it's free (lanes in parallel, one run per lane), and an ops task
// ("🤖 Agent: …") gets an agent run of its own, each in parallel, and leaves the list
// (its run is on the Workdesk). A task gets AUTO_GRACE first, so a few added together
// go out in one brief. A start that didn't take is kept and shown as the block; the
// next tick tries again. config.autoStart: false leaves it all to Go.
// { started: [lanes], ops: [task ids], failed: [lanes] }
function workTick({ deps = {} } = {}) {
  const out = { started: [], ops: [], failed: [], beside: [] };
  try { (deps.sweep || sweepSuperseded)(); } catch { /* reports still list */ } // actions a finished task or a newer report has settled leave Reports
  if ((deps.config || loadConfig)().autoStart === false || !(deps.cmd || handoffCmd)()) return out;
  const now = deps.now || Date.now(), fails = deps.fails || AUTO_FAIL, push = deps.push || pushTasks, run = deps.run || runHandoff;
  // the real tick's scene is the plain one (its fails and now are the defaults): built afresh and kept, for the routes to read
  const w = Object.keys(deps).length ? workScene({ deps: { ...deps, fails, now }, full: true }) : workScene({ full: true, fresh: true }), { lanes, ops, beside } = startable(w.all, now);
  if (peakHeld((deps.config || loadConfig)(), now, lanes.size + ops.length + beside.length)) return out; // a batch waits for off-peak; the next tick tries again
  Object.assign(out, startOps(ops, { ...deps, fails, now }));
  const map = (deps.repos || (() => { try { return laneMap(); } catch { return {}; } }))() || {}, tasks = (deps.tasks || loadTasks)(), textOf = (x) => { const t = tasks.find((k) => "task:" + k.id === x.id); return t ? { id: t.id, text: t.text } : null; };
  const startBeside = deps.startParallel || startParallel, st = (deps.licence || licenceState)(), cap = (deps.cap || laneCap)(undefined, st), pro = isPro(st);
  const go = (lane, it) => { // one task beside the lane's run, in a copy of the repo of its own
    const r = startBeside(lane, map[lane], it, { addTask: deps.addTask || addTask, now });
    if (r && r.ok) out.beside.push({ lane, id: it.id }); else if (r && r.error) { fails[lane] = { at: now, note: plain("a copy of the repo for it didn't start: " + r.error, 120) }; out.failed.push(lane); }
  };
  for (const lane of lanes) {
    const mine = w.all.filter((x) => x.repo === lane && x.why.kind === "next").map(textOf).filter(Boolean);
    let exclude = [];
    if (mine.length > 1 && map[lane]) { // several ready at once: the first is the lane's own run, the independent ones go beside it
      const f = (deps.facts || laneFacts)(map[lane]), tried = deps.besideAgain || besideAgain, sp = peel(mine.filter((x, i) => !i || !tried(map[lane], x.id)), { name: displayName(map[lane], lane), cap, pro, dirty: f.dirty, git: f.git });
      exclude = sp.peeled.map((x) => x.id);
    }
    const p = push({ repo: lane, ...(exclude.length ? { exclude } : {}) }), wr = p && p.written && p.written[0]; if (!wr) continue;
    const e = run(wr.path);
    if (e && e.id && !e.busy && !e.blocked) {
      delete fails[lane]; out.started.push(lane);
      for (const id of exclude) go(lane, mine.find((x) => x.id === id));
    }
    else if (!e || (e.blocked && !e.parked)) { fails[lane] = { at: now, note: plain((e && e.note) || "the agent command didn't run", 120) }; out.failed.push(lane); }
  }
  // tasks queued at a lane whose agent is at work: start the ones that don't clash beside it
  const byLane = {}; for (const x of beside) (byLane[x.repo] = byLane[x.repo] || []).push(x);
  for (const lane of Object.keys(byLane)) {
    if (!map[lane]) continue;
    const items = byLane[lane].map(textOf).filter(Boolean), runs = (deps.parallel || inflight)().filter((m) => m.lane === lane);
    const taken = [...(deps.openTasks || openTasksOf)(map[lane]).slice(0, 2).map((x) => ({ text: x, who: "the lane's run" })), ...runs.map((m) => ({ text: m.task, who: "the run beside it" }))];
    const f = (deps.facts || laneFacts)(map[lane]), sp = peel(items, { name: displayName(map[lane], lane), taken, count: 1 + runs.length, cap, pro, dirty: f.dirty, git: f.git });
    for (const it of sp.peeled) go(lane, it);
    if (sp.peeled.length) { const r = push({ repo: lane }); if (r && r.empty) dropHeld(map[lane]); }
  }
  if (out.started.length || out.ops.length || out.beside.length) forgetWork(); // what it started shows on the next look, not 15 s on
  return out;
}
// Ops tasks (by id) each to an agent run of its own; one that started leaves the list
// (done, its run's folder in `act`). { ops: [ids started], failed: ["ops"]? }
function startOps(ids, { tasks = loadTasks, save = saveTasks, act = actNow, fails = AUTO_FAIL, now = Date.now() } = {}) {
  const out = { ops: [], failed: [] };
  for (const id of ids) {
    const all = tasks(), t = all.find((k) => k.id === id); if (!t) continue;
    const r = act(asAgent(t.full || t.text), { title: "from your tasks" });
    if (r && r.ok) { delete fails[RUNS_LANE]; Object.assign(t, { done: true, doneAt: now, act: r.dir }); save(all); out.ops.push(id); }
    else { fails[RUNS_LANE] = { at: now, note: plain((r && r.error) || "the agent didn't start", 120) }; out.failed = [RUNS_LANE]; break; }
  }
  return out;
}
// Go: everything waiting goes to its repo's agent, the way Send to repos and an
// agent per repo would: briefs written, an agent started in each (or queued
// behind one already there); a parked project's wait for it to be unparked.
// { started, queued, repos, parked? } or { error }.
function workGo({ push = pushTasks, run = runHandoff, ops = goOps, now = Date.now(), config = loadConfig } = {}) {
  const o = ops(), r = push({ later: true }); // Go is the user's say-so: a task waiting for it goes too
  if (r.empty && !o.ops.length && !o.failed.length) return { started: 0, queued: 0, repos: [], note: "Nothing waiting to start." };
  let started = o.ops.length, queued = 0; const repos = o.ops.length ? ["ops"] : [], parked = [];
  for (const w of r.written || []) { const e = run(w.path); if (e && e.parked) { parked.push(w.name); continue; } if (e && e.id && !e.busy && !e.blocked) started++; else queued++; repos.push(w.name); }
  const unresolved = (r.unresolved || []).map((u) => u.name).filter((n) => n !== RUNS_LANE);
  const peak = started + queued > 1 && config().peakGuard !== false && isPeak(now) ? { note: "Starting during peak hours (weekdays 5–11am Pacific, 2–8pm SAST) uses Claude Max quota faster." } : {};
  return { started, queued, repos, ...(parked.length ? { parked } : {}), ...(unresolved.length ? { unresolved } : {}), ...peak, ...(o.failed.length ? { note: `The ops tasks didn't start: ${AUTO_FAIL[RUNS_LANE].note}` } : {}) };
}
// Go's ops tasks: every one an agent can do, each to a run of its own.
const goOps = () => startOps(loadTasks().filter((t) => t.repo === RUNS_LANE && !t.done && !t.archived && !t.review && !yours(t.text)).map((t) => t.id));

// ---- setup (the first run) --------------------------------------------------------
// A new Symbiot walks you through setup before anything else: what it is, your AI,
// where your work is, your agent, every app you use (connected, or "I don't use it"),
// your documents, then Home. It's in config.onboarding: { pending, step, skipped: [link
// ids you don't use] }; a Symbiot that ran before this existed isn't sent through it.
// Your phone has a step of its own (optional): on a computer, pair the app on your phone
// (after your documents); in the Android app, "Your computer" comes first, and "no
// computer" carries on with the rest, as Symbiot on the phone alone.
const ONB_STEPS = ["welcome", "ai", "work", "agent", "apps", "docs", "phone", "done"];
// (the phone only pairs with the computer: Claude Code and the agents run there, so no AI, work, agent, apps or docs step here)
const ONB_STEPS_PHONE = ["computer", "welcome", "done"];
const onbSteps = (app = ANDROID_APP, phone = PHONE) => (app ? ONB_STEPS_PHONE : phone ? ONB_STEPS.filter((s) => s !== "phone") : ONB_STEPS); // (Symbiot in Termux is on the phone already)
// A new install (`symbiot app` the first time): setup, from its north star, "Your computer"
// in the Android app (it started at "welcome" there, so a phone paired by its QR showed nothing).
function startOnboarding() { const cf = loadConfig(); if (!cf.onboarding) { cf.onboarding = { pending: true, step: onbSteps()[0], skipped: [], ...(onbSteps()[0] === "computer" ? { computer: true } : {}) }; saveConfig(cf); } return cf.onboarding; }
// The phone app over an older one (a phone that had Symbiot before "Your computer"
// existed): its unfinished setup carried on at "Meet Symbiot", then "Your AI" asked to
// install Claude Code on the phone. An unfinished setup on a phone that isn't paired
// goes to "Your computer" first, once (computer: true): "No computer" carries on as before.
function phoneSetupFirst({ app = ANDROID_APP, paired = () => !!computerView().paired } = {}) {
  if (!app) return null;
  const cf = loadConfig(), o = cf.onboarding;
  if (!o || !o.pending || o.computer) return o || null;
  let isPaired = false; try { isPaired = paired(); } catch {}
  if (!isPaired) o.step = "computer";
  o.computer = true; saveConfig(cf); return o;
}
// A phone never sets up an AI of its own: it uses the computer's. Until chat is relayed
// there, say what it can do instead (null on a computer, which does ask to connect one).
function phoneNoAi() {
  if (!PHONE) return null;
  let paired = false; try { paired = !!computerView().paired; } catch {}
  return { error: paired ? "Chat runs on your computer, which has the AI. Ask it there; your tasks and what needs you are here." : "Pair this phone with your computer first: it has the AI, and this phone uses it." };
}
// A paired phone's chat is answered by the computer's AI over the sealed link
// (phone.mjs OPS.chat); unpaired, it says to pair first.
async function phoneChat(question, deps = {}) {
  let paired = false; try { paired = !!computerView().paired; } catch {}
  if (!paired) return phoneNoAi();
  const r = await (deps.ask || askComputer)("chat", { question });
  if (r.unreachable) return { error: "Your computer didn't answer. Check it is on, then ask again." };
  const b = r.body || {};
  if (r.status !== 200 || b.error) return { error: b.error || (r.status === 504 ? "Your computer took too long to answer." : "Your computer couldn't answer that.") };
  return { answer: b.answer, spoken: b.spoken, ...(b.did ? { did: b.did } : {}), steps: b.steps || [] };
}
function onboarding({ fresh = false } = {}) {
  let cfg = loadConfig(), o = cfg.onboarding || {};
  const tryOr = (f, d) => { try { return f(); } catch { return d; } };
  // the phone app: paired with the computer is all its setup is, so it finishes by itself
  if (ANDROID_APP && o.pending && o.step !== "welcome" && tryOr(() => !!computerView().paired, false)) { cfg.onboarding = o = { ...o, pending: false, done: Date.now(), step: "done" }; saveConfig(cfg); cached = null; }
  const steps = onbSteps();
  let st = null; if (!ANDROID_APP) try { st = claudeState(fresh); } catch {}
  const r = tryOr(() => resolveProvider(), null);
  const reps = ANDROID_APP ? { searching: false, list: [] } : tryOr(() => reposState(), { searching: false, list: [] });
  const links = tryOr(() => linksState(), { items: [] }), reach = tryOr(() => linkReach(), null), skipped = new Set(o.skipped || []);
  const apps = (links.items || []).map((x) => ({ id: x.id, name: x.name, group: x.group, state: x.state, ...(x.note ? { note: x.note } : {}), skipped: skipped.has(x.id),
    ...(reach && reach.sites && reach.sites[x.id] ? { agents: !!reach.sites[x.id].ready, connector: reach.sites[x.id].name } : {}) }));
  const det = ANDROID_APP ? { agents: [] } : tryOr(() => detectHandoffs(), { agents: [] }), cmd = ANDROID_APP ? "" : tryOr(() => handoffCmd(), "");
  return {
    pending: !!o.pending, step: steps.includes(o.step) ? o.step : steps[0], steps,
    phone: tryOr(() => { const p = PHONE ? computerView() : linkState(); return PHONE ? { role: "phone", paired: !!p.paired, name: p.name || "", ...(p.error ? { error: p.error } : {}) }
      : { role: "computer", on: p.on, listening: p.listening, ...(p.error ? { error: p.error } : {}), code: p.code || "", until: p.until || 0, link: p.link || "", qr: p.qr || "", addresses: p.addresses || [], port: p.port, phones: (p.phones || []).map((x) => x.name) }; }, null),
    ai: { connected: !!r, provider: r ? r.provider : "", line: r ? `${PROVIDERS[r.provider].label}${r.model ? " · " + r.model : ""}` : "", claude: ANDROID_APP ? null : tryOr(() => claudeSetup(), st ? { installed: st.installed, signedIn: st.signedIn } : null) },
    work: { searching: reps.searching, at: reps.at || 0, done: reps.done || 0, total: reps.total || 0, count: reps.list.length, repos: reps.list.slice(0, 60).map((x) => ({ name: x.name, path: x.path })), roots: tryOr(() => scanRoots(), []).map((r) => (r === homedir() ? "~" : r.startsWith(homedir() + "/") ? "~" + r.slice(homedir().length) : r)) },
    agent: { cmd, pick: tryOr(() => pickAgent(), null), agents: (det.agents || []).map((a) => ({ label: a.label, tmpl: a.tmpl })) },
    apps, groups: links.groups || [], decided: apps.every((a) => a.skipped || a.state !== "off"),
    docs: { folders: tryOr(() => (knowledgeState().folders || []).map((f) => f.path), []) },
    ...(ANDROID_APP ? {} : { pro: tryOr(() => { const l = licenceState(); return { plan: l.plan, ...(l.trialDaysLeft ? { trialDaysLeft: l.trialDaysLeft } : {}), ...(l.upgrade ? { upgrade: l.upgrade } : {}) }; }, null) }),
  };
}
// Where first run covers each section of Settings: the setup step that does, or "later: why it
// waits". A section Settings gains that isn't here fails test/onboarding.mjs, so a new feature
// is folded into first run (or said to wait) as it ships, not found missing later (19 Oct 2026).
const FIRST_RUN = {
  "Language": "later: it follows the computer's own language, so there's nothing to choose",
  "Customisations": "later: your own rules and adjustments, and the changes Symbiot proposes when you keep pushing back on something; nothing goes in without your OK, and Off returns to base behaviour",
  "On its own": "later: it watches for its first day and says on Updates what it would have done, then acts within its limits; the focus file and the mode are here when you want them",
  "Symbiot Pro": "done",
  "Setup": "welcome",
  "Your AI": "ai",
  "Local models": "ai",
  "Folders to scan for repos": "work",
  "Projects in Termux": "later: only Symbiot running in Termux on a phone has it",
  "Hand off to your agent when you \"Send to repos\"": "agent",
  "Email — add what you sent to Week and Standup": "apps",
  "Knowledge folders": "docs",
  "Your phone": "phone",
  "What Symbiot remembers": "done",
  "Secrets": "done",
  "Trusted sites for Screens": "later: asked the first time an agent wants a site that isn't trusted yet",
  "Weekly write-up and start at login": "later: the write-up is made from a week of work, which a new Symbiot doesn't have yet",
};
// step: where you are; skip / unskip: an app you do or don't use; skipRest: every app not connected.
function setOnboarding({ step, skip, unskip, skipRest, done, restart } = {}) {
  const cfg = loadConfig(), o = { ...(cfg.onboarding || {}) }, sk = new Set(o.skipped || []);
  if (restart) { o.pending = true; o.step = onbSteps()[0]; }
  // Continue on "Found 2 projects. Is that all of them?" is your yes: Home doesn't ask the same again
  if (step === "agent" && o.step === "work" && !cfg.reposConfirmed) { let r = null; try { r = reposState(); } catch {} if (r && !r.searching && r.at && (r.list || []).length) cfg.reposConfirmed = { at: Date.now(), setup: true }; }
  if (step && onbSteps().includes(step)) o.step = step;
  if (skip) sk.add(String(skip)); if (unskip) sk.delete(String(unskip));
  if (skipRest) { try { for (const x of linksState().items) if (x.state === "off") sk.add(x.id); } catch {} }
  o.skipped = [...sk];
  if (done) { o.pending = false; o.done = Date.now(); o.step = "done"; }
  cfg.onboarding = o; saveConfig(cfg); cached = null;
  return onboarding();
}

export { updateAsk, cardTalk, homeTick, HOME_LOOKED, WORK_KEEP, FIRST_RUN, troubles, agentDigest, garthLedger, plainAsk, dismissCard, cardKey, loadDismissed, DISMISSED_FILE, reportIdeasAdd, reportAsk, reportDraftAnswer, workTick, waitWhy, AUTO_GRACE, STUCK_AFTER, marketingState, marketingGo, marketingDraftAnswer, marketingTask, moveToMarketing, goLane, homeState, homeContext, homeAsk, homeAnswer, homeNext, nextUp, laneNamed, NEXT_FILE, workScene, forgetWork, workGo, displayName, firstSteps, onboarding, setOnboarding, startOnboarding, ONB_STEPS, ONB_STEPS_PHONE, onbSteps, phoneBits, phoneSetupFirst, finishedState, handedState, noteHanded, phoneChat, isPeak, reportIdeasDismiss, settleAsks, settleFromChat };
