// What Symbiot writes with your AI: your week, standup and to-dos, a repo's
// review and next steps, a folder's overview, and the Q&A on a task. Plus the
// opt-in sent mail that week and standup fold in (read by mail.mjs).
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { VERSION, loadConfig, saveConfig, loadTasks, saveTasks, sh, repoState } from "./core.mjs";
import { resolveProvider, write } from "./ai.mjs";
import { detectMailSources, mailActivity } from "./mail.mjs";
import { waitingOn, newsSince } from "./watch.mjs";
import { me, authorship, authorArgs, readmeInfo, repoShape, houseRules, reportFooter, expandRoot, commits, openWork, detectFolder, repoPathMap, discoveredRepos } from "./scan.mjs";
import { taskType, workingChanges, workingDiff } from "./tasks.mjs";
import { converse, actNow, actIn, taskIn } from "./mind.mjs";

// ---- render ---------------------------------------------------------------
function renderCommits(list) {
  return list.map((x) => `- [${x.repo}] ${x.subject}${x.files.length ? ` (${x.files.length} files)` : ""}`).join("\n");
}

// AI review of one repo: what it does, what it's for, possible upgrades.
async function repoReview(path) {
  if (!resolveProvider()) return { error: "not-connected" };
  if (!path) return { error: "no repo" };
  const name = path.split("/").pop();
  const auth = authorship(path), state = repoState(path), rd = readmeInfo(path), shape = repoShape(path), rules = houseRules(path);
  const commits = sh(`git -C ${JSON.stringify(path)} log ${authorArgs(auth.emails)} --format='%ad %s' --date=short -50 2>/dev/null`).trim()
    || sh(`git -C ${JSON.stringify(path)} log --format='%ad %s' --date=short -50 2>/dev/null`).trim();
  const footer = reportFooter(path, auth, state, rd);
  // Cheap maturity gauge, so the model can be told to show restraint instead of
  // always inventing new features (over-engineering is a failure, not a win).
  const testFiles = Number(sh(`git -C ${JSON.stringify(path)} ls-files 2>/dev/null | grep -icE '(^|/)(tests?|spec|__tests__)/|\\.(test|spec)\\.'`).trim()) || 0;
  const churn = Number(sh(`git -C ${JSON.stringify(path)} log --since='14 days ago' --oneline 2>/dev/null | wc -l`).trim()) || 0;
  const posture = state.stale ? "the checkout is a stale snapshot — the priority is getting current, not new work"
    : (testFiles === 0 && shape.total > 40) ? "a real codebase with NO test files — favour tests/stabilising over new features"
    : (churn >= 25) ? "very rapid churn lately — likely over-iterating; be conservative, prefer consolidation/finishing over new features"
    : (state.dirty > 20) ? "a lot of unfinished/uncommitted work — finish what's open before starting new things"
    : "no red flags — but still only propose what clearly pays off";
  const system =
    `You are a pragmatic, restraint-minded reviewer of ONE software project. Respond with ONLY a JSON object (no fences): {"review": string, "verdict": string, "ideas": string[]}. ` +
    `"review": 3-6 sentences on what it does and who it's for. ` +
    `"verdict": ONE honest sentence on whether this project needs new work now, and of what KIND. Over-engineering is a failure: if it's already capable, or shows churn / missing tests / unfinished work, say so and steer toward STABILISING (tests, docs, finishing, removing) or simply SHIPPING — not more features. ` +
    `"ideas": AT MOST 5, ranked by value, ONLY items that clearly pay off. Do NOT pad the list — returning 0–2 ideas with a "stabilise, don't add" verdict is a good, correct answer. Prefer fixes / tests / simplification / finishing over new features unless a feature is clearly warranted by the evidence. ` +
    `Ground every claim in the evidence; recent commits beat the README; never propose building something already in the structure; never advise against the stated conventions. ` +
    (state.stale ? `CRITICAL: the working tree is a STALE checkout — never suggest committing it. ` : ``);
  const prompt =
    `Project: ${name}\nBranch ${state.branch} · ${auth.total} commits total (${auth.mineCount} yours${auth.filterDropped ? ", filter dropped so counting everyone" : ""})\n` +
    `Maturity signal: ${posture}. (${testFiles} test files, ${churn} commits in the last 14 days.)\n\n` +
    (rd.file ? `README (last changed ${rd.lastDate || "?"}, ${rd.commitsAgo} commits ago — may be out of date):\n${rd.excerpt}\n\n` : "(no README)\n\n") +
    `Structure (top folders · file counts): ${shape.dirs.join(", ")}\nManifests: ${shape.manifests.join(", ") || "none"}\nDocs present: ${shape.docs.join(", ") || "none"}\n\n` +
    `Recent commits (newest first):\n${commits || "(none)"}\n\n` +
    (rules ? `Conventions this team has chosen — do NOT advise against these:\n${rules}\n\n` : "") +
    (state.stale ? `Working tree: STALE (≈ ${state.staleBy ? "HEAD~" + state.staleBy : "older"}); its "changes" are the gap to an old snapshot, not new work.\n\n` : "") +
    `Return the JSON. Remember: fewer, higher-value ideas beat a long list; a "don't add — stabilise" verdict with 0–2 ideas is a valid answer.`;
  const raw = await write(system, prompt);
  if (!raw) return { text: "(couldn't reach the model)", ideas: [], verdict: "", footer };
  const j = extractJson(raw);
  if (j && (j.review || j.ideas || j.verdict)) return {
    text: String(j.review || "").trim() || raw,
    verdict: String(j.verdict || "").trim(),
    ideas: Array.isArray(j.ideas) ? j.ideas.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : [],
    footer,
  };
  return { text: raw, ideas: [], verdict: "", footer };
}
function extractJson(s) {
  if (!s) return null;
  let t = String(s).trim().replace(/^```(?:json)?/i, "").replace(/```$/,"").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}
// Two at a time, judged (as agents' questions are, agents.mjs OPTIONS_SHOWN):
// most people act on whatever's suggested without weighing it, so the model
// picks, and says why in a line.
const JUDGE = `Judge them before you write them: people tend to do whatever is listed without weighing it, and this is for a whole company, not one person. ` +
  `List only what you'd recommend, best first, and choose by what's best for, in this order, the company, the people doing the work, then the project's goal. ` +
  `For each, say in plain words (no jargon) what it changes from then on and the evidence for it. `;
// AI "value" suggestions for one repo, from its recent commits + open work.
async function repoSuggest(path) {
  if (!resolveProvider()) return { error: "not-connected" };
  if (!path) return { error: "no repo" };
  const name = path.split("/").pop();
  const auth = authorship(path), state = repoState(path), rd = readmeInfo(path), rules = houseRules(path);
  const recent = sh(`git -C ${JSON.stringify(path)} log ${authorArgs(auth.emails)} --format='%ad %s' --date=short -50 2>/dev/null`).trim()
    || sh(`git -C ${JSON.stringify(path)} log --format='%ad %s' --date=short -50 2>/dev/null`).trim();
  const open = openWork([{ path, name }]);
  const footer = reportFooter(path, auth, state, rd);
  const system =
    `You are a pragmatic senior engineer advising on one project. Write exactly three short sections with headings: ` +
    `"In flight" (what's clearly underway), "Next steps" (the 2 best concrete actions), "Ideas" (the 2 best that fit where this is heading). ` +
    JUDGE + `Recent commits beat the README. Do not advise against the stated conventions. ` +
    (state.stale ? `CRITICAL: the working tree is a STALE checkout — never suggest committing it (would revert history). ` : ``) +
    `No filler, no preamble.`;
  const prompt =
    `Project: ${name} (branch ${state.branch}, ${auth.total} commits, ${auth.mineCount} yours${auth.filterDropped ? " — filter dropped" : ""}).\n\n` +
    `Recent commits:\n${recent || "(none)"}\n\nOpen / unfinished:\n${open.length ? open.map((o) => "- " + o).join("\n") : "(none found)"}\n\n` +
    (rules ? `Conventions — do NOT advise against these:\n${rules}\n\n` : "") + `Give the advice.`;
  const text = await write(system, prompt);
  return { text: text || "(couldn't reach the model)", footer };
}
// Overview + suggestions for a NON-git project folder (no commits to read), from
// its file tree, manifest and README. The folder-node equivalent of repoSuggest.
async function folderSuggest(path) {
  if (!resolveProvider()) return { error: "not-connected" };
  if (!path) return { error: "no path" };
  const det = detectFolder(path);
  const files = sh(`find ${JSON.stringify(path)} -maxdepth 2 \\( -name node_modules -o -name .git \\) -prune -o -type f -print 2>/dev/null | head -200`).split("\n").filter(Boolean);
  const rels = files.map((f) => f.slice(path.length + 1));
  const pick = (names) => { for (const n of names) { const hit = files.find((f) => f.split("/").pop().toLowerCase() === n); if (hit) { try { return readFileSync(hit, "utf8").slice(0, 2000); } catch {} } } return ""; };
  const manifest = pick(["package.json", "requirements.txt", "pyproject.toml", "go.mod", "cargo.toml", "pom.xml", "composer.json", "gemfile", "pubspec.yaml"]);
  const readme = pick(["readme.md", "readme.txt", "readme"]);
  const stack = [...det.langs, ...det.tools].join(", ") || "unknown";
  const system =
    `You are a pragmatic senior engineer looking at a project FOLDER that is NOT under version control. ` +
    `From its files, write exactly three short sections with headings: "Overview" (what this project is, 1-2 sentences), ` +
    `"Next steps" (the 2 best concrete actions — a strong first one is often "git init" if this looks like real work), ` +
    `"Ideas" (the 2 best that fit where it's heading). ` + JUDGE + `The evidence here is the files, manifest and README shown. No preamble.`;
  const prompt =
    `Folder: ${det.name}\nStack: ${stack}\nFiles (${det.files}):\n${rels.slice(0, 120).join("\n")}\n\n` +
    (manifest ? `Manifest:\n${manifest}\n\n` : "") + (readme ? `README excerpt:\n${readme}\n\n` : "") + `Write the overview and suggestions.`;
  const text = await write(system, prompt);
  const footer = `symbiot ${VERSION} · folder · ${det.files} files · ${stack} · not a git repo`;
  return { text: text || "(couldn't reach the model)", footer };
}
// Ask questions about a task: a short Q&A thread kept on the task itself
// (task.chat), grounded in the repo/folder it belongs to — and, once an agent
// has ticked it, in the changes waiting for review.
const CHAT_KEEP = 40; // messages stored per task
async function taskChat(id, question) {
  question = String(question || "").trim().slice(0, 2000);
  const it = loadTasks().find((x) => x.id === id);
  if (!it) return { error: "not found" };
  if (!question) return { error: "empty" };
  if (!resolveProvider()) return { error: "not-connected" };
  const path = it.repo ? repoPathMap()[it.repo] : "";
  const ctx = [];
  if (path) {
    const isGit = existsSync(join(path, ".git"));
    if (isGit) ctx.push(`Recent commits:\n${sh(`git -C ${JSON.stringify(path)} log --format='%ad %s' --date=short -15 2>/dev/null`).trim() || "(none)"}`);
    else { const det = detectFolder(path); ctx.push(`Project folder (not a git repo) · ${det.files} files · ${[...det.langs, ...det.tools].join(", ") || "unknown stack"}`); }
    const rd = readmeInfo(path); if (rd.excerpt) ctx.push(`README excerpt:\n${rd.excerpt.slice(0, 1500)}`);
    const rules = houseRules(path); if (rules) ctx.push(`Conventions — do NOT advise against these:\n${rules}`);
    if (it.review && isGit) {
      const ch = workingChanges(path);
      ctx.push(`The agent has ticked this task; its uncommitted changes await review (${ch.stat || "no changes"}):\n${ch.files.map((f) => `${f.st} ${f.file}`).slice(0, 40).join("\n") || "(none)"}\n\nDiff (truncated):\n${workingDiff(path, 6000)}`);
    }
  }
  const history = (it.chat || []).slice(-12).map((m) => `${m.role === "user" ? "User" : "You"}: ${m.text}`).join("\n\n");
  // one Symbiot everywhere (mind.mjs): this task and its repo are what this page knows
  const role = `Here they're on one task in their Tasks list. Be a pragmatic senior engineer about it, before or after it goes to their coding agent: answer directly, grounded in the project evidence shown; if it doesn't settle it, say so and what you'd check; if the task is ambiguous, say how you'd read it. Never invent files, features or history.`;
  const context = `Task: ${it.text}\nKind: ${taskType(it.text)} · repo: ${it.repo || "(none)"} · status: ${it.archived ? "archived" : it.review ? "done by the agent, awaiting review" : it.done ? "done" : "open"}` +
    (ctx.length ? "\n\n" + ctx.join("\n\n") : path ? "" : "\n\n(no repo attached: answer from the task text alone)");
  // "do it" here works on the task's repo the way Send to repos does: the request
  // joins the repo's tasks and the agent starts there; with no repo, in a run of its own
  const lanes = repoPathMap(), mine = path ? it.repo : "";
  const agent = async (req, known, repo) => {
    const lane = repo || mine;
    return lane ? actIn(req, lane, { map: lanes, known, title: it.text.slice(0, 60), context: `Their task: ${it.text}` }) : actNow(req, { title: it.text.slice(0, 60), context: `Their task: ${it.text}`, known });
  };
  const r = await converse({ where: `Task: ${it.text.slice(0, 60)}`, role, context, history, question, map: lanes, act: { agent, task: (text, repo) => taskIn(text, repo || mine, { map: lanes }) } });
  const answer = r.reply;
  // Re-read: other requests may have changed tasks.json while the model ran.
  const t = loadTasks(); const cur = t.find((x) => x.id === id); const now = Date.now();
  if (!cur) return { answer, chat: [] };
  cur.chat = [...(cur.chat || []), { role: "user", text: question, ts: now }, { role: "ai", text: answer, ts: now }].slice(-CHAT_KEEP);
  saveTasks(t);
  return { answer, chat: cur.chat, ...(r.did ? { did: r.did } : {}) };
}
function clearTaskChat(id) { const t = loadTasks(); const it = t.find((x) => x.id === id); if (!it) return { error: "not found" }; delete it.chat; saveTasks(t); return { ok: true }; }

// ---- email: opt-in, local, no API (see mail.mjs) ---------------------------
// config.mail = { enabled, sources: [extra folders/.mbox files], addresses: [your
// mail addresses, to pick your mail out of a whole-mailbox export] }.
function mailCfg() {
  const m = loadConfig().mail || {};
  return { enabled: !!m.enabled, sources: Array.isArray(m.sources) ? m.sources : [], addresses: Array.isArray(m.addresses) ? m.addresses : [] };
}
function mailState() { return { ...mailCfg(), detected: detectMailSources() }; }
function setMail(b = {}) {
  const m = mailCfg();
  if (typeof b.enabled === "boolean") m.enabled = b.enabled;
  if (b.add) {
    const p = expandRoot(b.add);
    // A website typed here (it sits under Trusted sites, easily mixed up): say where it goes.
    const site = p && !existsSync(p) && !/\.(mbox|mbx|eml|msf|sbd)$/i.test(p) && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#].*)?$/i.test(p) ? new URL(/^https?:/i.test(p) ? p : "https://" + p).hostname : "";
    if (site) return { ...mailState(), site, error: `${site} is a website, not mail on this computer. To let Screens press and type there without asking, add it under Trusted sites, just above.` };
    if (!p || !existsSync(p)) return { ...mailState(), error: "not found: " + (p || "(empty)") };
    if (!m.sources.includes(p)) m.sources.push(p);
  }
  if (b.remove) m.sources = m.sources.filter((x) => x !== b.remove);
  if (typeof b.addresses === "string") m.addresses = b.addresses.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes("@"));
  const cfg = loadConfig(); cfg.mail = m; saveConfig(cfg);
  return mailState();
}
// Mail you sent in the window — [] unless it's switched on (preview ignores that).
function sentMail(days, preview = false) {
  const m = mailCfg(); if (!m.enabled && !preview) return [];
  return mailActivity({ days, sources: m.sources, addresses: [...m.addresses, me().email].filter(Boolean) });
}
const renderMail = (list) => list.slice(0, 60).map((x) => `- ${x.date} · to ${x.to.join(", ") || "?"} · ${x.subject}`).join("\n");

// What's new on the pages you watch since yesterday (watch.mjs), for Standup:
// one line, "Waiting on you: 3 emails, 2 GitHub notifications", under the
// write-up. Counted here, not by the AI, so the numbers are right; the AI sees
// them only to know what's next.
const WAITING_HOURS = 24;
function waitingLine(groups) { return groups.length ? "Waiting on you: " + groups.map((g) => g.label).join(", ") : ""; }
const withWaiting = (text, line) => (line ? `${text}\n\n${line}` : text);
// What arrived on the sites you've linked or watch (mail, chat, tickets,
// notifications) in the last `days`, per site, newest first: [{ name, count,
// items }]. For Week, so the update covers all of your work, not only your
// commits, and someone who doesn't write code gets one too.
function arrivedOn(days, now = Date.now()) {
  const by = new Map();
  for (const n of newsSince(days * 24, now)) { const g = by.get(n.name) || { name: n.name, count: 0, items: [] }; g.count++; if (g.items.length < 15) g.items.push(n.text); by.set(n.name, g); }
  return [...by.values()].sort((a, b) => b.count - a.count);
}

// Build a write-up for a command; returns { text, sub, error? } without printing.
// Shared by the CLI (cmdRun) and the web UI (symbiot app). since: the days
// `week` covers (--since); all: everyone's commits, not just yours (--all).
async function produce(cmd, { since = 7, all: everyone = false } = {}) {
  if (!resolveProvider()) return { error: "not-connected" };
  if (cmd === "todo") {
    const repos = discoveredRepos();
    const open = openWork(repos);
    if (!open.length) return { text: "Nothing outstanding found (no TODOs or uncommitted work).", sub: "0 open items · todo" };
    const system =
      `You summarise what's still on a developer's plate from their TODO markers and uncommitted work. ` +
      `Group by project, lead with what looks most in-flight (uncommitted work) then the to-dos. ` +
      `Be concise and concrete. No preamble.`;
    const text = await write(system, `Open work:\n${open.map((o) => `- ${o}`).join("\n")}\n\nWhat's still on my plate?`);
    return { text: text || "(couldn't reach the model)", sub: `${open.length} open items · todo`, footer: `symbiot ${VERSION} · ${repos.length} repos scanned · ${open.length} open items` };
  }
  const label = cmd === "standup" ? "standup" : "week";
  const days = cmd === "standup" ? 2 : since;
  const who = me();
  // Discover the Map's repo set, then keep only those with commits in the window.
  const all = discoveredRepos();
  const repos = all.filter((r) => sh(`git -C ${JSON.stringify(r.path)} log --since="${days} days ago" --oneline -1 2>/dev/null`).trim());
  const mail = sentMail(days); // [] unless email is switched on
  const waiting = label === "standup" ? waitingOn(WAITING_HOURS) : [], line = waitingLine(waiting);
  const waitNote = waiting.length ? " · " + waiting.map((g) => g.label).join(", ") + " waiting" : "";
  const arrived = label === "week" ? arrivedOn(days) : [], arrivedN = arrived.reduce((s, g) => s + g.count, 0);
  if (!repos.length && !mail.length && !arrived.length) return { text: withWaiting(`No commits in the last ${days} days across your ${all.length} repos.\nAdd folders to scan in Settings, or check your git identity.`, line), sub: "no activity" + waitNote };
  let cs = commits(repos, `${days} days ago`, !everyone);
  if (!cs.length) cs = commits(repos, `${days} days ago`, false); // fall back to all if none matched you
  const open = label === "week" ? openWork(repos) : [];
  if (!cs.length && !mail.length && !arrived.length) return { text: withWaiting("Found repos, but no commits in the window.", line), sub: "no commits" + waitNote };

  const system =
    `You write a short, first-person work update from a person's git commits${mail.length ? " and the emails they sent" : ""}${arrived.length ? ", and what arrived on the work sites they've linked (mail, chat, tickets, notifications)" : ""}. ` +
    `Write as them ("I"), plainly and specifically, grouped by theme or project, most important first. ` +
    `Turn commit messages into outcomes a manager or teammate would understand — not a raw commit list. ` +
    (mail.length ? `Fold the emails into those themes (a decision, a hand-off, who they worked with); skip routine ones (receipts, scheduling, one-line replies). You only have their subjects and recipients — don't guess at what they said. ` : "") +
    (arrived.length ? `What arrived is titles and senders only, and it came TO them: use it to show what they dealt with and who they worked with, but don't claim they did something unless it shows it (a "merged", "approved" or "sent" line, a commit, an email they sent). Skip noise (newsletters, receipts, routine alerts). ${cs.length ? "" : "They may not write code: with no commits, write the update from these sites. "}` : "") +
    `${label === "standup" ? "Keep it to 3-5 bullets: done, and what's next." : "A short paragraph or a few grouped bullets; end with a one-line 'In progress / next' if there are open items."} ` +
    `No preamble, no sign-off, no invented work — only what the commits${mail.length ? ", emails" : ""}${arrived.length ? ", linked sites" : ""} and open items show.` +
    (waiting.length ? ` What's waiting on them (new on pages they watch) is counted in a line added under what you write: don't list or count it, but you may name one as next if it's clearly work (a review request, a failed CI run).` : "");
  const prompt =
    `Person: ${who.name || "me"}. Window: ${label === "standup" ? "since yesterday" : `last ${days} days`}.\n\n` +
    `Commits:\n${cs.length ? renderCommits(cs) : "(none)"}\n\n` +
    (mail.length ? `Emails I sent (date · to · subject):\n${renderMail(mail)}\n\n` : "") +
    (open.length ? `Open / in progress:\n${open.map((o) => `- ${o}`).join("\n")}\n\n` : "") +
    (arrived.length ? `What arrived on my linked sites (site: count, then titles):\n${arrived.map((g) => `- ${g.name}: ${g.count}\n${g.items.map((t) => `  - ${t.slice(0, 160)}`).join("\n")}`).join("\n")}\n\n` : "") +
    (waiting.length ? `Waiting on me (new since yesterday):\n${waiting.map((g) => `- ${g.label}:\n${g.items.slice(0, 10).map((t) => `  - ${t.slice(0, 160)}`).join("\n")}`).join("\n")}\n\n` : "") +
    `Write the ${label === "standup" ? "standup" : "update"}.`;

  const text = await write(system, prompt);
  const mailNote = (mail.length ? ` · ${mail.length} sent email${mail.length === 1 ? "" : "s"}` : "") + (arrivedN ? ` · ${arrivedN} from linked sites` : "");
  return { text: text ? withWaiting(text, line) : "(couldn't reach the model)", sub: `${cs.length} commits across ${new Set(cs.map((x) => x.repo)).size} repos${mailNote}${waitNote} · ${label}`, footer: `symbiot ${VERSION} · ${all.length} repos (same as the Map) · ${repos.length} active · ${cs.length} commits in last ${days}d${mailNote}` };
}

export { repoReview, repoSuggest, folderSuggest, taskChat, clearTaskChat, mailState, setMail, sentMail, arrivedOn, produce };
