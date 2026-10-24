// Handing a repo to the user's agent: the saved command template, the one-click
// presets (and the Orca IDE one), the background-job registry behind the Agents
// tab, and the questions an unattended agent leaves for the user.
import { MARKETING_DIR } from "./marketing.mjs";
import { licenceState, isPro, can, canWorkIn } from "./licence.mjs";
import { spawn, spawnSync, execFile } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname, resolve, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, writeSync, unlinkSync, readdirSync, statSync, renameSync, utimesSync, appendFileSync, chmodSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { track as jobTrack, runRecord, recordOf, loadJobs, goalRows } from "./jobs.mjs";
import { CONFIG_DIR, loadConfig, saveConfig, loadTasks, TASK_MAX, clipWords, jobWords, sameTask, taskWords, sh, runOut, hasCmd, readState, writeJsonAtomic } from "./core.mjs";
import { meetsStep, captureSecrets, heldFor } from "./vault.mjs";
import { recordDone, isDone, isApprovalAsk, approvalText, approvedBefore, recentTurns, recentTasks, asksBack, askBackNote, closesAsk, runSaysClosed, heldBy, reportsSince, runReport, reportAsked, standingList, talkOf, endTalk, talkText } from "./asksdone.mjs";
import { sentAfter } from "./sentmail.mjs";
import { parseRun, lastRunText, readRunLog, runStarted, briefPlan, stepOf, runLine, waitingOn, waitUntil, RECHECK } from "./work.mjs";
import { noteDuration, noteCost, kindOf } from "./estimate.mjs";
import { plainAsk } from "./plain.mjs";
import { apiOptions, blockedSignIn, apiRoute, realChrome, CHROME_READ, CHROME_ACT } from "./browserfails.mjs";
import { actSites, goAhead, signInNotNeeded, switchOnAct } from "./chromegate.mjs";
import { pushGo } from "./pushgate.mjs";
import { goAhead as phoneGo } from "./phonegate.mjs";
import { lanesJob, parseFacts, leftToYou, gitWork, agentsGitWork, agentsClicking, agentsCodeWork, agentsMail, agentsPosting, linkedAsks, linkedChore, PUSH_OK } from "./handover.mjs";
import { scanRoots, repoPathMap, laneMap } from "./scan.mjs";
import { knowledgeFolders } from "./knowledge.mjs";
import { pickModel, MODEL } from "./route.mjs";
import { runbookOf, onDeployAnswer } from "./deploy.mjs";
import { claudeState, resolveProvider, write as aiWrite } from "./ai.mjs";
import { settleDone, ticked as tickedItems } from "./done.mjs";
import { toReview, criticBrief, CRITIC_PROMPT, settleVerdict, reviewOf, saveReview, startDesign, settleDesign, dropDesign, specsFor, DESIGNER_PROMPT } from "./design.mjs";
import { judge as triageJudge, verdictOf, saveVerdict, shows as triageShows, answerFor as triageAnswer, recordFault, HOLD_MS as TRIAGE_HOLD, noteCardWords, sweepGone } from "./triage.mjs";
import { stalledFor, onStall, loadStall, saveStall, clearStall, STALL_MIN, STALL_PROMPT_TAIL } from "./stall.mjs";

const HANDOFFS = []; // live registry of agents Symbiot has handed work to
// ---- hand a repo (+ its tasks) to the user's agent — generic, settings-based
// ONE code path, whatever the agent. The handoff is a command TEMPLATE the user
// saves (`agentCmd`), with {dir} (repo path) and {prompt} (the task
// instruction), and it is the only thing that ever runs:
//   handoffCmd() -> fillHandoff() -> runHandoff() -> track()
// Everything else in this section only helps pick a template: one-click presets
// for what's installed (detectHandoffs), the Orca preset (a template too, kept
// current by migrateOrcaCmd) and the cross-platform lookups behind them.
//   claude -p "{prompt}"      · aider --message "{prompt}"      · code {dir}
//   gnome-terminal --working-directory={dir} -- claude "{prompt}"
// Not tied to any one tool — you decide what runs.
const shSingle = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const escDq = (s) => String(s).replace(/[\\"$`]/g, "\\$&");
// Plain words only: in the Orca preset this passes through two shells, so no
// backticks or $ (escDq covers one level).
const HANDOFF_PROMPT = "Read .symbiot/TASKS.md and implement its unchecked items in this repo, one at a time, urgent ones first: finish the first one completely (built, tested, ticked) before you look at the next, then carry on with the next while you can. An item that is already done in the code, or no longer applies, you tick with a one-line note saying why. Tick an item [x] only when it is done and checked: one that is blocked, handed to another lane, or waiting on a person, a reply or a later event you mark [~] with a note of what it waits on, never [x], and a finding is not a done item. Look at the [~] items first: once what one waits on has come in, carry on with it. Never stop because the list is long: another run picks up where you left off. Tick each item [x] in that file as you finish it and leave your changes uncommitted, so they can be reviewed and approved. If you need a decision, or have ideas or options for the user, write them to .symbiot/QUESTIONS.md as TASKS.md explains, then skip that item and carry on with the next: a question never ends the run while other items can be done. Read .symbiot/ANSWERS.md first if it exists. Confirm before anything destructive. Ask the user once per job, not once per step: before you ask anything, work out everything the job will need from them to the end and put it all in one question, each thing with the default you will use if they leave it. Never ask them whether something has happened or what state it is in: check it yourself. When the user says go ahead, do it. If something truly stops you, never ask the same question again: name the one thing that blocks you as a step only they can take, with exactly where to do it, and stop there.";
function handoffCmd() { const cfg = loadConfig(); return migrateOrcaCmd(migrateClaudeCmd(cfg.agentCmd)) || (cfg.ide ? `${cfg.ide} {dir}` : ""); } // ide = legacy
// Save the template ("" clears it). Either way the legacy `ide` key goes.
function setHandoffCmd(cmd) {
  const cfg = loadConfig(); const v = String(cmd || "").trim();
  if (v) { cfg.agentCmd = v; delete cfg.agentOff; } else { delete cfg.agentCmd; cfg.agentOff = true; } // agentOff: you cleared it, so Home doesn't pick one for you again
  delete cfg.ide; saveConfig(cfg);
  return { ok: true, cmd: cfg.agentCmd || "" };
}
// Grant a blocked agent what it asked for, instead of hand-editing the command:
// `tool` (a command like "python3" → Bash(python3:*), or a full "Tool(spec)")
// joins --allowedTools; `dir` joins --add-dir. Claude only (that's where these
// flags live); for another agent we say to edit the command directly.
// The --allowedTools rule for what was typed: a rule already in Tool(spec) form
// is kept as it is, even pasted with its quotes as it reads in the command;
// only a bare command is wrapped, once (npm install -> Bash(npm install:*)).
// Stripping quotes first is the point: a quoted "Bash(npm install:*)" once
// looked bare and became Bash(Bashnpm install:*:*).
function grantRule(tool) {
  let t = String(tool || "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  if (/^-/.test(t)) return ""; // a flag (--allowedTools) is never a tool
  if (/^[A-Za-z]+\(.*\)$/.test(t)) return t;
  t = t.replace(/[()"'`]/g, "").replace(/:\*$/, "").trim();
  return t ? `Bash(${t}:*)` : "";
}
// Add a rule to a Claude command's --allowedTools (or start the flag), once.
function allowTool(cmd, t) {
  if (!t || cmd.includes(`"${t}"`)) return cmd;
  if (/--allowedTools\b/.test(cmd)) return cmd.replace(/(--allowedTools\s+(?:"[^"]*"\s*)+)/, (m) => m.trimEnd() + ` "${t}" `);
  return cmd + ` --allowedTools "${t}"`;
}
// Claude Code, by whatever name it's run as: `claude`, a path to it, or a wrapper named after
// it (~/.config/symbiot/claude-fallback, which reruns the task on another model when a limit
// stops it). The saved command here began with that wrapper's path, and nothing below took it
// for Claude: no membrane, no sandbox, no connectors, no model routing, no --resume, no stream,
// and every run went in acceptEdits mode, asking the user for each command it lacked (16 Oct
// 2026). The first word that isn't VAR=value, by its last path part. Never a flag inside the
// command: the Orca preset carries `claude … --allowedTools` inside its own --command.
function isClaudeCmd(cmd) {
  const bin = String(cmd || "").trim().split(/\s+/).find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) || "";
  return /^claude(?:[-_.][\w.-]*)?$/i.test(bin.replace(/^["']|["']$/g, "").split(/[\\/]/).pop() || "");
}
function grantAgent({ tool, dir } = {}) {
  const cfg = loadConfig(); let cmd = (cfg.agentCmd || CLAUDE_CMD).trim();
  if (!isClaudeCmd(cmd)) return { error: "Grants apply to the Claude agent command. Pick a Claude preset first, or edit the command directly." };
  if (tool) cmd = allowTool(cmd, grantRule(tool));
  if (dir) { const d = String(dir).trim(); if (d && !cmd.includes(`--add-dir "${d}"`)) cmd += ` --add-dir "${d}"`; }
  cmd = cmd.replace(/\s*"Bash\(-[^"]*\)"/g, "").replace(/\s+/g, " ").trim(); // and drop any flag that got in as a rule before
  cfg.agentCmd = cmd; saveConfig(cfg);
  return { ok: true, cmd };
}
// ---- connectors: what the user linked to Claude, for its runs -------------
// Connectors linked to Claude (claude.ai's Google Drive, Gmail, Notion…, and
// servers added with `claude mcp add`) are tools to an unattended run only when
// --allowedTools names them: `claude -p` can't ask, so a run told to check your
// Drive or mail was refused and said it had no access. From ~/.claude.json: the
// claude.ai connectors that have connected (claudeAiMcpEverConnected), the
// user's own servers and this folder's. One waiting to be authorized
// (mcpNeedsAuthNoticed) is listed but not ready. Its rule, mcp__<name>, allows
// all its tools; Claude names them with anything but letters, digits, _ and -
// made _ ("claude.ai Google Drive" -> mcp__claude_ai_Google_Drive__search_files).
function claudeConnectors(dir = "", file = join(homedir(), ".claude.json")) {
  let j = {}; try { j = JSON.parse(readFileSync(file, "utf8")) || {}; } catch {}
  const names = (x) => Array.isArray(x) ? x.filter((s) => typeof s === "string" && s) : [];
  const servers = (o) => o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o) : [];
  const proj = dir && j.projects && typeof j.projects === "object" ? j.projects[dir] : null;
  const needsAuth = new Set(names(j.mcpNeedsAuthNoticed));
  return [...new Set([...names(j.claudeAiMcpEverConnected), ...servers(j.mcpServers), ...servers(proj && proj.mcpServers)])]
    .map((name) => ({ name, rule: connectorRule(name), ready: !needsAuth.has(name) }));
}
// A Claude command with the ready connectors' rules added, for this run only:
// the saved command stays as typed, so linking or unlinking one takes effect on
// the next run. Any other agent's command runs as-is (Settings says so).
// Claude records a claude.ai connector (claudeAiMcpEverConnected) only once a
// session has connected it, so the first run after you connect Gmail got Gmail's
// tools without a rule for them, and every call was denied. A site linked in
// Symbiot is allowed its claude.ai connector's tools too, recorded or not (a rule
// for tools a run doesn't have does nothing).
function withConnectors(tmpl, dir, file, linked = loadConfig().linked) {
  if (!isClaudeCmd(tmpl)) return tmpl;
  const rules = [...claudeConnectors(dir, file).filter((c) => c.ready).map((c) => c.rule), ...linkedRules(linked)];
  return rules.reduce((cmd, r) => allowTool(cmd, r), tmpl).replace(/\s+$/, "");
}
// Linking a site in Symbiot (Links: Gmail, Drive…) signs Symbiot's own browser in;
// it doesn't give Claude's runs that site's tools. Those come from Claude's own
// connector for it (claude.ai → Settings → Connectors), passed through above. So
// Drive, linked in both, reached runs, and Gmail, linked only in Symbiot, didn't.
// The sites linked in Symbiot (config.linked) that Claude has connectors for, each
// with the one it has (connector: its name, or "") and whether it's ready.
const CLI = fileURLToPath(new URL("./index.mjs", import.meta.url));
const LINK_CONNECTOR = { gmail: ["Gmail", /gmail/i], outlook: ["Outlook", /outlook|microsoft 365/i], gcal: ["Google Calendar", /google calendar/i], gdrive: ["Google Drive", /google drive/i], notion: ["Notion", /notion/i], slack: ["Slack", /slack/i], jira: ["Jira & Confluence", /atlassian|jira|confluence/i], linear: ["Linear", /linear/i], asana: ["Asana", /asana/i], hubspot: ["HubSpot", /hubspot/i] };
// The claude.ai connector each of those is, by the name Claude gives it (as seen
// in ~/.claude.json), for its rule before Claude has recorded it (withConnectors).
const CLAUDE_AI_CONNECTOR = { gmail: "claude.ai Gmail", gcal: "claude.ai Google Calendar", gdrive: "claude.ai Google Drive", notion: "claude.ai Notion" };
const connectorRule = (name) => "mcp__" + name.replace(/[^A-Za-z0-9_-]/g, "_");
function linkedRules(l) {
  if (!l || typeof l !== "object" || Array.isArray(l)) return [];
  return Object.keys(l).filter((id) => CLAUDE_AI_CONNECTOR[id]).map((id) => connectorRule(CLAUDE_AI_CONNECTOR[id]));
}
function linkedConnectors(conns = claudeConnectors(), l = loadConfig().linked) {
  if (!l || typeof l !== "object" || Array.isArray(l)) return [];
  return Object.keys(l).filter((id) => LINK_CONNECTOR[id]).map((id) => {
    const [name, re] = LINK_CONNECTOR[id], c = conns.find((x) => re.test(x.name));
    return { id, name, connector: c ? c.name : "", ready: !!c && c.ready };
  });
}
// For a run's brief: what its connectors are, and what's linked in Symbiot that
// isn't one (no tools for it in this run). "" when nothing's linked to either.
function connectorsLine(tmpl = handoffCmd(), file, linked) {
  if (!isClaudeCmd(tmpl)) return "";
  const conns = claudeConnectors("", file), ready = conns.filter((c) => c.ready), off = linkedConnectors(conns, linked).filter((x) => !x.ready);
  const nm = (s) => s.replace(/^claude\.ai\s+/i, ""), names = off.map((x) => x.name), them = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names.at(-1) : names[0];
  const has = ready.length ? `this run can use ${ready.map((c) => `${nm(c.name)} (\`${c.rule}__…\` tools)`).join(", ")}.` : "";
  const not = off.length ? ` ${them} ${off.length === 1 ? "is" : "are"} linked in Symbiot but not ${off.some((x) => x.connector) ? "ready " : ""}as a Claude connector, so this run has no tools for ${off.length === 1 ? "it" : "them"}: don't say you checked ${off.length === 1 ? "it" : "them"}. What's new there is in \`node "${CLI}" watch new\`; to read more, ask the user (👤) to connect ${them} in claude.ai → Settings → Connectors.` : "";
  // withConnectors allows these anyway: Claude may have connected one since
  const early = off.filter((x) => CLAUDE_AI_CONNECTOR[x.id]).map((x) => `\`${connectorRule(CLAUDE_AI_CONNECTOR[x.id])}__…\``);
  const anyway = early.length ? ` If ${early.join(" or ")} tools are here after all, the connector was just connected: they're allowed, so use them.` : "";
  return (has + not + anyway).trim();
}
// For Settings → Handoff: the connectors, whether this command's runs get them, and
// the sites linked in Symbiot that aren't Claude connectors (so runs can't use them).
function connectorsInfo(file) { const conns = claudeConnectors("", file); return { claude: isClaudeCmd(handoffCmd()), list: conns.map(({ name, ready }) => ({ name, ready })), links: linkedConnectors(conns) }; }
// Connections, before you link: which sites agent runs can use too. A link signs
// Symbiot's browser in; a run reaches a site only through Claude's own connector for
// it (LINK_CONNECTOR), and only with Claude Code as your agent (or, with none picked
// yet, on this computer to pick). { claude, sites: { id: { name, connector, ready } } }:
// connector "" while you haven't connected it in claude.ai.
const claudeAgent = () => { const c = handoffCmd(); return isClaudeCmd(c) || (!c && hasCmd("claude")); };
function linkReach(conns = claudeConnectors(), claude = claudeAgent()) {
  const sites = {};
  for (const [id, [name, re]] of Object.entries(LINK_CONNECTOR)) { const c = conns.find((x) => re.test(x.name)); sites[id] = { name, connector: c ? c.name : "", ready: !!c && c.ready }; }
  return { claude, sites };
}
const fillHandoff = (tmpl, repoPath, prompt = HANDOFF_PROMPT) => tmpl.replace(/\{dir\}/g, shSingle(repoPath)).replace(/\{prompt\}/g, escDq(prompt));
// ---- agents work on their own --------------------------------------------------------
// Talk to an agent and it just does the work: permission checks skipped, one
// conversation that goes on. Symbiot's Claude runs work that way (config.agentTrust:
// "full", the default; "ask" keeps the allow lists): --dangerously-skip-permissions, with
// guard.mjs as a PreToolUse hook that stops the few things only the owner does (push to
// main, publish, delete outside the folder, sudo, keys, Symbiot's settings), whatever the
// agent decides. And an answer goes back into the same conversation (--resume), so the
// agent that asked carries on knowing everything it knew.
const GUARD_HOOK = fileURLToPath(new URL("./guard.mjs", import.meta.url));
const GUARD_SETTINGS = join(CONFIG_DIR, "agent-guard.json");
const trustFull = (cfg = loadConfig()) => cfg.agentTrust !== "ask";
function guardSettings() {
  // Symbiot's own settings and keys denied here too (GUARD, as Claude Code reads a rule): a deny
  // holds in every mode, bypassPermissions included, and a run gets it whether or not its folder
  // has a settings.local.json
  const s = { permissions: { deny: GUARD() }, hooks: { PreToolUse: [{ matcher: "Bash|Read|Edit|Write|MultiEdit|NotebookEdit|Grep|Glob|mcp__claude-in-chrome__.*", hooks: [{ type: "command", command: `node ${JSON.stringify(GUARD_HOOK)}` }] }],
    PostToolUse: [{ matcher: "mcp__claude-in-chrome__.*", hooks: [{ type: "command", command: `node ${JSON.stringify(GUARD_HOOK)}` }] }], // after a Chrome tool: which site each tab is on now (chromegate.mjs seen)
    Stop: [{ hooks: [{ type: "command", command: `node ${JSON.stringify(GUARD_HOOK)}` }] }] } }; // before a run ends: the tabs it left open in the user's Chrome are closed (chromegate.mjs openTabs)
  try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(GUARD_SETTINGS, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 }); } catch {}
  return GUARD_SETTINGS;
}
// ---- plugins a run doesn't need -----------------------------------------------------
// Every run loaded every Claude Code plugin the user has, synced from claude.ai or
// installed: mojulo and spritecook alone were 127 of a run's 185 MCP tools, in a run
// fixing Symbiot's saves (the audit, 2026-10-14). A run gets a plugin only when its open
// tasks name it (its name, or one of its own keywords); the rest are switched off for
// that run in the settings it's started with (enabledPlugins: false); not an ops run, which is
// whatever was asked in chat. The user's own
// MCP servers and claude.ai connectors (Gmail, Drive, Calendar) aren't plugins and
// stay: --strict-mcp-config would drop the connectors too. config.runPlugins "all" keeps every plugin.
const PLAIN_WORDS = new Set(["mcp", "claude", "plugin", "plugins", "agent", "agents", "tool", "tools", "code"]);
function claudePlugins(home = homedir()) {
  const out = [], seen = new Set(), add = (id, name, words = []) => { if (!seen.has(id)) { seen.add(id); out.push({ id, name, words: [name, ...words].map((w) => String(w).toLowerCase()).filter((w) => w.length > 3 && !PLAIN_WORDS.has(w)) }); } };
  const synced = join(home, ".claude", "plugins", "synced");
  try {
    for (const acct of readdirSync(synced)) { let ds = []; try { ds = readdirSync(join(synced, acct)); } catch { continue; } for (const d of ds) {
      try { const p = JSON.parse(readFileSync(join(synced, acct, d, ".claude-plugin", "plugin.json"), "utf8")); if (p && typeof p.name === "string" && p.name) add(`${p.name}@synced`, p.name, Array.isArray(p.keywords) ? p.keywords : []); } catch {}
    } }
  } catch {}
  try { const st = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8")); for (const [id, on] of Object.entries((st && st.enabledPlugins) || {})) if (on === true) add(id, id.split("@")[0]); } catch {}
  return out;
}
// { "<plugin>@<source>": false } for the plugins this run's open tasks don't name, or null.
function idlePlugins(repoPath, { plugins = claudePlugins(), cfg = loadConfig() } = {}) {
  if (cfg.runPlugins === "all" || !plugins.length || !repoPath || String(repoPath).startsWith(ACT_DIR)) return null; // an ops run is whatever you asked for in chat: it keeps them all
  const work = repoPath ? readSymbiot(repoPath, "TASKS.md").split("\n").filter((l) => /^\s*-\s*\[ \]/.test(l)).join("\n").toLowerCase() : "";
  const words = new Set(work.match(/[a-z0-9][a-z0-9-]*/g) || []);
  const off = plugins.filter((p) => !p.words.some((w) => words.has(w) || words.has(w + "s")));
  return off.length ? Object.fromEntries(off.map((p) => [p.id, false])) : null;
}
// The settings a run starts with: the guard, and the plugins it goes without.
function runSettings(repoPath) {
  const off = idlePlugins(repoPath); if (!off) return guardSettings();
  const file = join(SANDBOX_DIR, "run-" + digest(resolve(repoPath)) + ".json");
  try { mkdirSync(SANDBOX_DIR, { recursive: true, mode: 0o700 }); writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(guardSettings(), "utf8")), enabledPlugins: off }, null, 2) + "\n", { mode: 0o600 }); } catch { return guardSettings(); }
  return file;
}
function withTrust(tmpl, box = null, repoPath = "") {
  if (!isClaudeCmd(tmpl) || !trustFull()) return tmpl;
  let c = String(tmpl).replace(/\s--permission-mode\s+\S+/g, "");
  if (!/--dangerously-skip-permissions\b/.test(c)) c += " --dangerously-skip-permissions";
  if (!/--settings\b/.test(c)) c += ` --settings ${JSON.stringify(box ? box.file : repoPath ? runSettings(repoPath) : guardSettings())}`;
  return c;
}
// The --model for an agent run: pickModel's tier as the CLI alias (sonnet, opus), or its id.
// A lane that should always run on one tier: { "lanes": { "robin": { "model": "opus" } } } in lanes.json.
function laneModel(lane) {
  try { const m = JSON.parse(readFileSync(join(CONFIG_DIR, "lanes.json"), "utf8")).lanes?.[lane]?.model; return typeof m === "string" ? m : ""; } catch { return ""; }
}
// A task Symbiot's chat wrote is measured by what the user said for it (tasks.json `said`,
// mind.mjs actIn): the chat's own briefs run long and explain why, and sent them to Opus.
function userWords(lines, tasks = loadTasks()) {
  const told = tasks.filter((t) => t && t.said && !t.done && !t.archived);
  return lines.map((l) => { const x = l.replace(/^\s*- \[ \]\s*/, ""), t = told.find((k) => sameTask(k.text, x)); return t ? t.said : l; }).join("\n");
}
function routedModel(repoPath, opts = {}, resumed = false) {
  try {
    const lines = resumed ? [] : readSymbiot(repoPath, "TASKS.md").split("\n").filter((l) => /^\s*- \[ \]/.test(l));
    const task = resumed ? RESUME_PROMPT : lines.join("\n");
    const override = (task.match(/\[model:\s*(\w+)\s*\]/i) || [])[1] || opts.model || laneModel(opts.name || basename(resolve(repoPath)));
    const m = pickModel({ task, said: resumed ? task : userWords(lines), lane: opts.name || "", path: resolve(repoPath), override });
    const alias = { S: "sonnet", O: "opus", H: "haiku" }[m.tier]; // the CLI's alias for the tier's own model; a named one (fable) as its id
    return alias && m.model === MODEL[m.tier] ? alias : /^claude-/.test(m.model) ? m.model : "";
  } catch { return ""; }
}
// Symbiot's own commands on its shared browser are never a question for the user: every
// Claude run may use them, in any lane, without a card on Home (2026-10-16: quartz's agent
// asked for `symbiot screens` and `symbiot press`). A wrapper counts as Claude too (isClaudeCmd).
const OWN_TOOLS = ["Bash(symbiot screens:*)", "Bash(symbiot press:*)"];
// --add-dir takes a folder: one pointing at a file (a key, ~/.ssh/oracle_key) made runs fail on it.
const isDir = (d) => { try { return statSync(String(d).replace(/^~(?=\/|$)/, homedir())).isDirectory(); } catch { return true; } }; // unknown: leave it
const noFileDirs = (cmd) => String(cmd).replace(/\s--add-dir\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g, (m, a, b, c) => (isDir(a || b || c) ? m : ""));
// With the user's own Chrome ready (browserfails.mjs realChrome), a run also gets --chrome and
// the tools that open, read and close its own tabs there, none that click or type (2026-10-20).
// The flag goes right after `claude`, so a preset that wraps it (Orca's --command) passes it on.
function withOwnTools(tmpl, chrome = realChrome(), acts = () => actSites().length > 0) {
  if (!isClaudeCmd(tmpl)) return tmpl;
  let cmd = noFileDirs(tmpl); for (const t of OWN_TOOLS) cmd = allowTool(cmd, t);
  if (chrome && !/\s--(?:no-)?chrome\b/.test(cmd) && /(^|[\s/"'])claude(?=\s)/.test(cmd)) {
    cmd = cmd.replace(/(^|[\s/"'])claude(?=\s)/, "$1claude --chrome");
    for (const t of CHROME_READ) cmd = allowTool(cmd, t);
    // the tools that act too, once the user has switched acting on for a site: the membrane lets them act
    // there only, and holds a send, post, payment or delete for their Go (chromegate.mjs)
    if (acts()) for (const t of CHROME_ACT) cmd = allowTool(cmd, t);
  }
  return cmd;
}
function withModel(tmpl, model) {
  if (!isClaudeCmd(tmpl) || !model) return tmpl;
  const c = String(tmpl).replace(/\s--model(?:=|\s+)\S+/g, "");
  return `${c} --model ${model}`;
}
// ---- a repo run, sandboxed ----------------------------------------------------------
// On top of the membrane, a repo run's commands run in Claude Code's own sandbox
// (bubblewrap on Linux, Seatbelt on macOS): they write only in the repo, the folders
// you gave Symbiot or allowed it (--add-dir, the repo's allow list) and the npm and
// download caches, can't read your keys, and have no way out of it (no unsandboxed
// commands). Its Edit and Write tools are held to the same folders by the guard
// (SYMBIOT_WRITES). An ops run, whose job is this computer, and a draft reply's run
// keep the membrane alone. Its settings live in Symbiot's folder, not the repo, so a
// run can't widen its own sandbox for the next one. Without what the sandbox needs
// (Linux: bwrap and socat) runs aren't sandboxed, and Settings says what to install;
// config.agentSandbox: false turns it off.
const SANDBOX_DIR = join(CONFIG_DIR, "sandbox");
const SANDBOX_CACHES = [".npm", ".cache"]; // npm's cache and logs; pip, uv, node-gyp, Chrome for Testing
const SANDBOX_SECRETS = [".ssh", ".gnupg", ".aws", ".azure", ".kube", ".docker", ".config/gcloud", ".config/gh", ".netrc", ".npmrc", ".pypirc", ".git-credentials", ".config/symbiot/config.json", ".config/symbiot/secrets.json", ".config/symbiot/vault.json", ".config/symbiot/vault.key", ".config/symbiot/vault-pin.json"]; // your AI's key and the app's token too
// Local sockets are allowed (headless Chrome needs one to start, so the browser tests
// ran in no sandboxed run), but the ones that would be a way out are hidden: Docker's,
// and your session's (its bus starts commands outside, through systemd-run; X11 and
// Wayland type into your windows; the ssh agent and keyring hold your keys).
const SANDBOX_SOCKETS = (uid = typeof process.getuid === "function" ? process.getuid() : "") => ["/run/docker.sock", "/var/run/docker.sock", "/run/containerd", "/run/podman", "/run/dbus", ...(uid !== "" ? [`/run/user/${uid}`] : []), "/tmp/.X11-unix"];
function sandboxNeeds({ platform = process.platform, has = hasCmd } = {}) {
  if (platform === "darwin") return { ready: true, missing: [] };
  if (platform !== "linux") return { ready: false, missing: [], unsupported: true };
  const missing = ["bwrap", "socat"].filter((c) => !has(c));
  return { ready: !missing.length, missing };
}
const sandboxed = (repoPath, cfg = loadConfig()) => cfg.agentSandbox !== false && !!repoPath && !resolve(repoPath).startsWith(CONFIG_DIR + "/");
// A folder that would open the whole home, or Symbiot's and Claude's own settings, to a
// run: never a writable one, nor an --add-dir. ~ as a knowledge folder put --add-dir ~
// on every run, so a run could write its own sandbox file, ~/.claude/settings.json,
// tasks.json and ~/.bashrc (15 Oct 2026). Such a folder is read-only to runs.
const CLAUDE_DIR = () => join(homedir(), ".claude");
const under = (p, d) => p === d || p.startsWith(d + "/");
function wideRoot(p) {
  p = resolve(String(p || "").replace(/^~(?=\/|$)/, homedir())); if (!p) return true;
  return p === "/" || p === homedir() || under(homedir(), p) || under(CONFIG_DIR, p) || under(CLAUDE_DIR(), p);
}
function sandboxWrites(repoPath, tmpl = "") {
  const out = [resolve(repoPath)];
  try { for (const k of knowledgeFolders()) out.push(k.path); } catch {}
  for (const m of String(tmpl).matchAll(/--add-dir\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g)) out.push(m[1] || m[2] || m[3]);
  for (const f of ["settings.json", "settings.local.json"]) { try { const d = JSON.parse(readFileSync(join(repoPath, ".claude", f), "utf8")); for (const x of (d.permissions && d.permissions.additionalDirectories) || []) out.push(String(x)); } catch {} }
  for (const c of SANDBOX_CACHES) out.push(join(homedir(), c));
  return [...new Set(out.filter(Boolean).map((p) => resolve(String(p).replace(/^~(?=\/|$)/, homedir()))))].filter((p, i) => !i || !wideRoot(p));
}
// Never written by a run's commands, whatever else is open to them: Symbiot's own folder
// (each thing in it, so a path under it the run was given, screens/, stays writable) and
// Claude's. The guard holds the Edit and Write tools to the same (SYMBIOT_WRITES).
function sandboxDenies(writes = []) {
  const own = []; try { own.push(...readdirSync(CONFIG_DIR).map((n) => join(CONFIG_DIR, n))); } catch { own.push(CONFIG_DIR); }
  return [...own.filter((p) => !writes.some((w) => under(w, p) || under(p, w))), CLAUDE_DIR(), join(homedir(), ".claude.json")];
}
// What a lane's allowed list opens up in its sandbox: a Read rule for a place the sandbox
// hides from every run (Read(~/.ssh/**), or the ssh agent's socket in /run/user) is
// re-allowed for that lane (sandbox.filesystem.allowRead, over denyRead), so what the
// user allowed works: they allowed whatsapp_module's ssh list and nothing changed, as its
// sandbox still hid ~/.ssh (2026-10-12). Never Symbiot's own keys and settings, nor a
// socket that's a way out of the sandbox (the session's bus, Docker's, the screen's):
// in /run/user only an ssh agent's. Read(~/x/**) is the folder ~/x; a path given
// /x or //x is that path (Symbiot's own rules are written so). { lift, sealed }: the
// paths to re-allow, and the rules that never are.
const SSH_AGENT = /\/(gcr\/ssh|keyring\/ssh|ssh-agent[\w.-]*|openssh_agent|gnupg\/S\.gpg-agent\.ssh)$/;
function sandboxLifts(rules, { home = homedir(), sockets = SANDBOX_SOCKETS(), agentSock = process.env.SSH_AUTH_SOCK || "" } = {}) {
  const lift = [], sealed = [], own = [join(CONFIG_DIR, "config.json"), join(CONFIG_DIR, "secrets.json")];
  const under = (p, d) => p === d || p.startsWith(d + "/");
  for (const r of rules || []) {
    const m = /^Read\((.+)\)$/.exec(String(r).trim()); if (!m) continue;
    let p = m[1].trim();
    if (/^~(\/|$)/.test(p)) p = home + p.slice(1); else if (p.startsWith("/")) p = "/" + p.replace(/^\/+/, ""); else continue;
    p = p.replace(/\/\*\*$/, "").replace(/\/+$/, "") || "/";
    const hidden = SANDBOX_SECRETS.some((x) => under(p, join(home, x))), socket = sockets.some((x) => under(p, x));
    if (!hidden && !socket) continue;
    const ok = hidden ? !own.some((x) => under(x, p) || under(p, x)) : /^\/run\/user\/\d+\//.test(p) && !/[*?[]/.test(p) && (SSH_AGENT.test(p) || (!!agentSock && p === agentSock));
    (ok ? lift : sealed).push(ok ? p : String(r).trim());
  }
  return { lift: [...new Set(lift)], sealed: [...new Set(sealed)] };
}
// The allow rules a repo's own Claude settings give its runs (an allowed list goes in settings.local.json)
function repoAllows(repoPath) {
  const out = [];
  for (const f of ["settings.json", "settings.local.json"]) { try { const d = JSON.parse(readFileSync(join(repoPath, ".claude", f), "utf8")); for (const x of (d.permissions && d.permissions.allow) || []) out.push(String(x)); } catch {} }
  return out;
}
// { file, writes } for a repo run to be sandboxed, else null.
function sandboxFor(repoPath, tmpl = "", { needs = sandboxNeeds } = {}) {
  if (!sandboxed(repoPath) || !needs().ready) return null;
  const writes = sandboxWrites(repoPath, tmpl), { lift } = sandboxLifts(repoAllows(repoPath));
  const off = idlePlugins(repoPath);
  const s = { ...JSON.parse(readFileSync(guardSettings(), "utf8")), ...(off ? { enabledPlugins: off } : {}), sandbox: { enabled: true, failIfUnavailable: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false,
    network: { allowAllUnixSockets: true }, filesystem: { allowWrite: writes, denyWrite: sandboxDenies(writes), denyRead: [...SANDBOX_SECRETS.map((p) => join(homedir(), p)), ...SANDBOX_SOCKETS()], ...(lift.length ? { allowRead: lift } : {}) } } };
  const file = join(SANDBOX_DIR, digest(resolve(repoPath)) + ".json");
  try { mkdirSync(SANDBOX_DIR, { recursive: true, mode: 0o700 }); writeFileSync(file, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 }); } catch { return null; }
  return { file, writes };
}
// What a sandboxed run's environment adds: the folders its Edit and Write tools may
// write (the guard reads them), and gh's token, since the sandbox can't reach the
// keyring gh keeps it in (gh then says "Requires authentication").
function sandboxEnv(box, { token = () => (hasCmd("gh") ? sh("gh auth token").trim() : "") } = {}) {
  if (!box) return null;
  // NODE_USE_ENV_PROXY: the sandbox reaches the network only through its proxy, which curl
  // honours and Node's fetch ignores without it; every Bookly run of 21 Oct 2026 hit
  // "fetch failed" probing SMS Portal before it found this out for itself.
  const env = { SYMBIOT_WRITES: JSON.stringify(box.writes), NODE_USE_ENV_PROXY: "1" };
  if (!process.env.GH_TOKEN) { let t = ""; try { t = token(); } catch {} if (/^[\w-]{20,}$/.test(t)) env.GH_TOKEN = t; }
  return env;
}
// ---- the ops run's walls ----------------------------------------------------------------------
// An ops run isn't in Claude Code's sandbox: it needs ssh to your servers, and that sandbox lets
// nothing leave the machine but web requests through its proxy (tried 23 Oct 2026: ssh "Network is
// unreachable", and its way to let a command out is ignored in a run's own settings). It had the
// guard alone, which reads command text. So it runs in walls of Symbiot's own (bubblewrap): the
// network as it is, the disk as it is, except
// - read-only: what would turn the guard off or let something start again later (Claude's settings,
//   the shell's start-up files, autostart and systemd's user units, the installed Symbiot and Claude),
//   your ssh keys (used, not changed), and what Symbiot alone writes and every agent reads or obeys:
//   the guard's settings, the sandbox's, your customisations (their triggers run in the app), the
//   standing rules and memory (in every brief), and what's settled (which cards you see). The rest of
//   Symbiot's folder stays writable: the symbiot commands ops uses write their settings there;
// - not there at all: the vault's key and the vault PIN's file (an empty file in their place).
// config.opsWalls: false turns it off; without bwrap (or off Linux) the run starts as before.
const OPS_RO = [".claude/settings.json", ".claude/settings.local.json", ".claude/hooks", ".bashrc", ".bash_profile", ".bash_login", ".bash_logout", ".profile", ".zshrc", ".zprofile", ".zshenv", ".zlogin", ".config/fish", ".config/autostart", ".config/systemd", ".config/environment.d", ".local/share/systemd", ".local/bin", ".npm-global", ".local/share/claude", ".ssh", ".gitconfig", ".config/git"];
const OPS_OWN = ["agent-guard.json", "sandbox", "overrides", "standing.json", "mind.json", "focus.md", "settled.json", "asks-done.json"], OPS_HIDDEN = ["vault.key", "vault-pin.json"];
function opsWalls(repoPath, { home = homedir(), cfg = loadConfig(), has = hasCmd, platform = process.platform, exists = existsSync } = {}) {
  if (!isOps(repoPath) || cfg.opsWalls === false || platform !== "linux" || !has("bwrap")) return null;
  const args = ["--die-with-parent", "--dev-bind", "/", "/"];
  const ro = (p) => { if (exists(p)) args.push("--ro-bind", p, p); };
  for (const r of OPS_RO) ro(join(home, r));
  for (const o of OPS_OWN) ro(join(CONFIG_DIR, o));
  for (const h of OPS_HIDDEN) { const p = join(CONFIG_DIR, h); if (exists(p)) args.push("--ro-bind", "/dev/null", p); }
  args.push("--chdir", repoPath);
  return args;
}
// The command, inside them: bwrap … -- sh -c '<command>'.
const walled = (cmd, args) => (args ? `bwrap ${args.map(shSingle).join(" ")} -- sh -c ${shSingle(cmd)}` : cmd);
// Whether a folder has tests a run is expected to run: a package.json test script that isn't npm's placeholder.
function hasTestScript(path) { try { const t = String(JSON.parse(readFileSync(join(path, "package.json"), "utf8")).scripts?.test || ""); return !!t && !/no test specified/.test(t); } catch { return false; } }
// For Settings → Handoff: { on, ready, missing } (on: repo runs get it).
function sandboxState() { const n = sandboxNeeds(); return { on: loadConfig().agentSandbox !== false && trustFull(), ready: n.ready, missing: n.missing, ...(n.unsupported ? { unsupported: true } : {}) }; }
const SESSION = "session.json", RESUME_MAX = 8, RESUME_AGE = 2 * 86400000;
// A resumed run rereads its whole conversation with every step: a one-word answer
// to an agent that had read 195k tokens cost 195k again, and 55 resumed runs were
// three quarters of a week's use (2026-10-12). Past RESUME_CTX, an answer starts
// it fresh instead (about 22k to start), with its own last words in CARRYON.md.
const RESUME_CTX = 60000, CARRYON = "CARRYON.md";
const tooLong = (s) => !!s && (s.ctx || 0) > RESUME_CTX;
// Every item ticked isn't nothing to do while the answer asks for something: two runs ended
// "nothing for me to do" on "i need the report first" (21 Oct 2026). No quotes, $ or backticks.
const UNMET = " If every item is ticked already, the newest answer is your work: do what it asks, and check it reached the user (a report they asked for is under Reports, and your question names it) before you end. Never end saying there was nothing to do while it is unmet.";
const CARRY_PROMPT = HANDOFF_PROMPT + " The user has just answered your questions: the newest entries in .symbiot/ANSWERS.md. This is a fresh start because the conversation of the last run had grown too long to carry on, so read .symbiot/CARRYON.md first: where that run got to, in its own words. Do not redo what it says is done." + UNMET; // no quotes, $ or backticks: like HANDOFF_PROMPT it may pass through two shells
// The last run's own account of where it got to, for the fresh run that carries on.
function carryOn(path) {
  let said = ""; try { const w = parseRun(lastRunText(readSymbiot(path, "agent.log"))); said = w.final || (w.talk || []).slice(-3).join("\n\n"); } catch {} // stopped before it summed up: the last things it said
  try { writeFileSync(join(path, ".symbiot", CARRYON), `# Where the last run got to\n\nIts conversation had grown too long to resume, so this run starts fresh. What it said at the end:\n\n${said.slice(0, 6000) || "(it didn't say)"}\n`); } catch {}
  return CARRY_PROMPT;
}
const RESUME_PROMPT = "The user has answered: read the newest entries in .symbiot/ANSWERS.md and carry on with .symbiot/TASKS.md from where you were: finish the item you were on, then the next. Same rules as before." + UNMET;
function sessionOf(path) { try { return JSON.parse(readSymbiot(path, SESSION)) || null; } catch { return null; } }
// Resume when an answer has come in since its last run, and the conversation is fresh enough
function resumeFor(path) {
  const s = sessionOf(path); if (!s || !s.id || (s.runs || 0) >= RESUME_MAX || Date.now() - (s.at || 0) > RESUME_AGE) return null;
  let answered = 0; try { answered = statSync(join(path, ".symbiot", "ANSWERS.md")).mtimeMs; } catch {}
  if (!(answered > (s.at || 0))) return null;
  if (s.ctx == null) { try { s.ctx = parseRun(lastRunText(readSymbiot(path, "agent.log"))).ctx || 0; } catch {} } // a session noted before 0.63.9: its size from the log
  return s;
}
function noteSession(path, code, resumed) {
  const f = join(path, ".symbiot", SESSION);
  let run = {}; try { run = parseRun(lastRunText(readSymbiot(path, "agent.log"))); } catch {}
  if (code !== 0) {
    if (resumed && /No conversation found|session .*not found/i.test(readSymbiot(path, "agent.log").slice(-2000))) { try { unlinkSync(f); } catch {} return "lost"; }
    return null;
  }
  if (run.session) { const prev = sessionOf(path) || {}; try { writeFileSync(f, JSON.stringify({ id: run.session, at: Date.now(), runs: prev.id === run.session ? (prev.runs || 1) + 1 : 1, ...(run.ctx ? { ctx: run.ctx } : {}) })); } catch {} }
  return run.session || null;
}
// One agent per folder: two identical runs once started on the same repo 6s
// apart and raced each other. The registry catches a second click in this
// process; .symbiot/agent.pid catches another one (`symbiot push --open` while
// the app is up). Returns the job, null (no command set) or { busy, id, pid }.
// A preset that only opens a tab (Orca, editors) exits at once, so it holds
// the folder only that long. A busy result's `auto` says whether the process
// that started that agent is still up to start one on the held tasks.
// A folder's .symbiot/handoff.json ({ name, env }) names its job and joins its
// environment, on every run there, a rerun with answers too: a draft reply's
// folder (watch.mjs) carries SYMBIOT_DRAFT, which refuses a press on Send.
// A folder whose last run stopped on questions, with nothing changed since
// that could answer them, gets no run: { blocked, questions, note }
// (blockedAgain). force starts one anyway (something changed elsewhere).
// A folder with nothing to work from gets none either, forced or not (nothingToDo).
// What's shipping in a folder, as tasks.mjs shipping says (set through onShipping, so this module needn't import tasks.mjs).
let shipHold = () => null; const onShipping = (fn) => { shipHold = fn; };
// How a run ended, worked out once, when it ends, and kept as its job record: Home, the Workdesk,
// the Agents tab, the chat and the restarts all read this. Each used to guess for itself from the
// TASKS.md ticks, the last words and the questions file, and they disagreed: a run waiting on ops
// read "Finished", one card showed two jobs, a lane waiting on the user was started again (21 Oct
// 2026). { state, waitingOn, what, summary, note }:
// - failed: it exited with an error (not stopped on purpose);
// - waiting: something it can't go on without: a question or step of the user's (user), work it
//   handed to another lane (lane), a reply from outside (third party) or a time (time); `what` says it;
// - review: it changed files and finished its items; paused: open items left that it can still do; done.
const STOP_CODES = new Set([null, 130, 143, 137]); // SIGINT, SIGTERM, SIGKILL: stopped (a stall, Stop, an update), not failed
const WAIT_TIME = /\b(until|tomorrow|tonight|after \d|at \d{1,2}(?::\d\d|h|am|pm)|on (?:mon|tues|wednes|thurs|fri|satur|sun)day|next (?:week|month)|in \d+ (?:min|hour|day))/i;
const WAIT_USER = /\b(you|your|the user|garth)\b/i;
function runOutcome(path, e = {}, code = 0, { files = null, final = null, questions = null, waiting = undefined, needs = undefined } = {}) {
  const md = readSymbiot(path, "TASKS.md"), lines = md.split("\n");
  const waitLine = lines.find((l) => /^\s*-\s*\[~\]/.test(l)), open = lines.filter((l) => /^\s*-\s*\[ \]/.test(l)).length;
  let said = final; if (said === null) { try { const w = workOf(path, runSection(readRunLog(e.log), e.startedAt, true)); said = (w.work && w.work.final) || w.tail || ""; } catch { said = ""; } }
  const summary = clipWords(String(said || "").split(/\n\s*\n/)[0].replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim(), 400);
  const ch = files !== null ? files : (() => { try { return (loadRunFiles(path).find((r) => r.id === e.id) || { files: [] }).files.length; } catch { return 0; } })();
  const outBase = (state, waitingOn = "", what = "", note = "") => ({ state, waitingOn, what: clipWords(what, 200), summary, note }), out = outBase;
  if (code !== 0 && !STOP_CODES.has(code)) return out("failed", "", "", `exit ${code}`);
  const qs = questions !== null ? questions : (() => { try { return agentQuestions(path, "", { raw: true }).questions; } catch { return []; } })();
  const w = waiting !== undefined ? waiting : (() => { try { return waitingFor(path); } catch { return null; } })();
  const nd = needs !== undefined ? needs : (() => { try { return needsOf(path, { final: said, waiting: w, end: Date.now(), start: e.startedAt }); } catch { return null; } })();
  if (qs.length) return out("waiting", "user", qs[0].q);
  if (w || (nd && nd.what)) return out("waiting", "user", (nd && nd.what) || (w && w.step) || "a step of yours");
  if (waitLine) {
    // "(what it waits on) the task" or "the task (waits on: …)". A line with no note is only the task,
    // and a task's words aren't the user's step: the goal card that showed "Move bookly.co.za into a
    // … Copy them into a…" with "I've done it" read as the user's job (22 Oct 2026). bare says so, and
    // the card asks from the run's own last words (goals.mjs); task is the job, for "I'm on it: …".
    const line = waitLine.replace(/^\s*-\s*\[~\]\s*/, ""), lead = line.match(/^\(([^)]*)\)\s*/), tail = [...line.matchAll(/\((?:waits|waiting) (?:on|for)\b:?\s*/gi)].pop();
    const note = lead ? lead[1].replace(/^(?:waits|waiting) (?:on|for)\b:?\s*/i, "") : tail ? line.slice(tail.index + tail[0].length).replace(/\)\s*$/, "") : line;
    const task = clipWords(jobWords(lead ? line.slice(lead[0].length) : tail ? line.slice(0, tail.index) : line), 120), bare = !lead && !tail;
    const out = (state, waitingOn = "", what = "", n = "") => ({ ...outBase(state, waitingOn, what, n), ...(task ? { task } : {}), ...(bare ? { bare } : {}) });
    if (open) return out("paused", "", note, `${open} item${open > 1 ? "s" : ""} left; one waits`); // work it can still do: it carries on with that
    const handed = [...new Set([...String(readSymbiot(path, "HANDOFF.md") || "").matchAll(/^###\s+([\w.-]+)|→ \*\*([\w.-]+)\*\*/gm)].map((m) => m[1] || m[2]))]; // the lanes it has handed work to
    const lane = handed.find((l) => note.toLowerCase().includes(l.toLowerCase())) || (/\b(handed|hand(?:ed)? (?:it )?(?:over|to)|ops)\b/i.test(note) ? (handed.includes("ops") ? "ops" : handed[0] || "ops") : "");
    if (lane) return out("waiting", "lane", note.toLowerCase().startsWith(lane.toLowerCase()) ? note : `${lane}: ${note}`);
    if (WAIT_TIME.test(note)) return out("waiting", "time", note);
    if (WAIT_USER.test(note)) return out("waiting", "user", note);
    return out("waiting", "third party", note);
  }
  if (STOP_CODES.has(code) && code !== 0) return out(open ? "paused" : ch ? "review" : "done", "", "", "stopped");
  if (open) return out("paused", "", "", `${open} item${open > 1 ? "s" : ""} left`);
  if (ch) return out("review", "user", "", `${ch} file${ch > 1 ? "s" : ""} changed`);
  return out("done");
}
// A run's record that waited moves on when what it waited for comes: the user's answer, a
// handover's report. It's paused (it carries on from there) until its next run's own end.
function settleRecord(path, note) {
  try { const r = runRecord(path); if (r && r.state === "waiting") jobTrack(r.key, { state: "paused", waitingOn: "", note }); } catch {}
}
// A lane its newest run left waiting on the user, someone outside or a time isn't started again
// for it: nothing new would come of it until that does. Only with a record (0.68.1 on).
const waitsOutside = (path) => { try { const r = runRecord(path); return !!r && r.state === "waiting" && r.waitingOn !== "lane" ? r : null; } catch { return null; } };
// One live run per piece of work: an ops run whose goal (goals.mjs) already has another ops run going
// waits for it. At 06:28 on 22 Oct 2026 four runs started on the same avatar rebuild within 32
// seconds, in four folders, and their reports disagreed. The waiting one starts when the other ends.
const TWIN_WAIT = new Map(); // running path → paths waiting on it
const isOps = (p) => /\/drafts\/act-[^/]+$/.test(String(p || ""));
function twinRunning(path, { goals = () => { try { return goalRows(); } catch { return []; } }, running = runningHandoff } = {}) {
  if (!isOps(path)) return null;
  for (const g of goals()) { if (!g || ["done", "failed"].includes(g.state) || !(g.paths || []).includes(path)) continue; const other = (g.paths || []).find((p) => p !== path && isOps(p) && running(p)); if (other) return other; }
  return null;
}
function runHandoff(repoPath, { force = false, lost = false, model = "", onExit = null, escalatedFrom = "", note = "", stalled = false, critic = false, designer = false } = {}) {
  let tmpl = handoffCmd(); if (!tmpl || !repoPath) return null;
  if (isParked(repoPath)) return { blocked: true, parked: true, questions: 0, note: PARKED_NOTE }; // even forced: that's what parking is for
  const lic = licenceGate(repoPath); if (lic) return lic; // Free's limits, and never Symbiot's own code (licence.mjs); even forced
  let opts = {}; try { opts = JSON.parse(readSymbiot(repoPath, "handoff.json")) || {}; } catch {}
  const busy = runningHandoff(repoPath); if (busy) return { busy: true, id: busy.id || "", pid: busy.pid, auto: !!busy.auto };
  const twin = critic ? null : twinRunning(repoPath); if (twin) { TWIN_WAIT.set(twin, [...new Set([...(TWIN_WAIT.get(twin) || []), repoPath])]); return { busy: true, twin, id: "", auto: false, note: `Another run is already on this same work (${basename(twin)}): this one starts when that one ends, so the two don't work it side by side.` }; }
  const ship = shipHold(repoPath); if (ship) return { busy: true, shipping: true, step: ship.step, id: "", auto: false }; // Approve is committing, rebasing or testing this tree: an agent editing it meanwhile got its files stashed under it (15 Oct 2026)
  const down = claudePause(); if (down) return { blocked: true, down: down.kind, questions: 0, note: down.note }; // Claude itself is down: even forced, the run would end at once
  releaseHeldTasks(repoPath); // held for an agent another process started, which has since exited
  const idle = !lost && !critic && nothingToDo(repoPath); if (idle) return { blocked: true, idle: true, questions: 0, note: idle }; // the design critic reviews ticked work: nothing open is what it expects
  // a new screen or a rework is designed before it's built: this run is Symbiot's designer, on the strongest model, and the builder starts when it ends (design.mjs)
  if (!critic && !designer && !lost) { try { if (startDesign(repoPath, readSymbiot(repoPath, "TASKS.md")).length) { designer = true; model = MODEL.O; } } catch {} }
  try { tidySettings(repoPath); } catch {} // its allow list as Claude Code reads one (Write → Edit, //absolute), before the sandbox reads it
  const scoped = runCmdOf(repoPath, tmpl), box = isClaudeCmd(scoped) && trustFull() ? sandboxFor(repoPath, scoped) : null; // a repo run's sandbox, on top of the membrane
  tmpl = withStream(withTrust(withOwnTools(scoped), box, repoPath));
  const resume = isClaudeCmd(tmpl) && !stalled && !critic && !designer ? resumeFor(repoPath) : null, fresh = tooLong(resume); // too long to resume: a fresh run carries on; one that stalled starts fresh, from its note (stall.mjs)
  if (!model) model = routedModel(repoPath, opts, !!resume && !fresh); // routine runs on Sonnet, hard ones on Opus (route.mjs); the --model already in your command is only the Auto default, so the pick replaces it
  if (model) tmpl = withModel(tmpl, model);
  const runCmd = resume && !fresh ? tmpl + ` --resume ${resume.id}` : tmpl;
  if (!force) { const w = waitingFor(repoPath); if (w) { askedFor(repoPath); return { blocked: true, waiting: true, questions: 0, note: waitNote(w) }; } }
  const blocked = !force && blockedAgain(repoPath, scoped); if (blocked) return blocked;
  // the folder is this run's from here: the lock is claimed before the slow part (git status on a big
  // tree), where a second process (symbiot push --open, a second app during an update) got in
  const lock = join(repoPath, ".symbiot", LOCK);
  if (!claimLock(lock)) { const b = runningHandoff(repoPath); return b ? { busy: true, id: b.id || "", pid: b.pid, auto: !!b.auto } : null; }
  try { unlinkSync(join(repoPath, ".symbiot", WAITING)); } catch {} // the step's done (or this is Start it anyway): this is the run it waited for
  noteUntracked(repoPath);
  try { archiveAnswers(repoPath); } catch {} // all but the newest answers: in ANSWERS.archive.md, so the run doesn't read them all first
  noteAnswersSeen(repoPath); // what this run starts with: only an answer newer than this is news (nothingToDo)
  const tickedBefore = tickedItems(readSymbiot(repoPath, "TASKS.md")); // what was ticked already: only what this run ticks is checked (done.mjs)
  const dirtyBefore = dirtyState(repoPath), ticksBefore = ticksIn(readSymbiot(repoPath, "TASKS.md")), askedBefore = readSymbiot(repoPath, "QUESTIONS.md"), handedBefore = readSymbiot(repoPath, "HANDOFF.md");
  const own = opts.env && typeof opts.env === "object" ? Object.fromEntries(Object.entries(opts.env).map(([k, v]) => [k, String(v)])) : null, boxEnv = sandboxEnv(box);
  const owner = licenceState().plan === "owner" ? { SYMBIOT_OWNER: "1" } : null; // the guard lets only the owner's runs touch Symbiot's own files
  // SYMBIOT_AGENT: which run a `symbiot screens` command comes from, so it gets its own tab in the app's hidden browser
  const env = { ...(own || {}), ...(boxEnv || {}), ...(owner || {}), SYMBIOT_AGENT: repoPath };
  const gap = isClaudeCmd(runCmd) && process.platform !== "win32" ? startGap() : 0; // a few seconds between starts (the shell sleeps; the lock is held meanwhile)
  const full = fillHandoff(runCmd, repoPath, `${critic ? CRITIC_PROMPT : designer ? DESIGNER_PROMPT : stalled ? HANDOFF_PROMPT + STALL_PROMPT_TAIL : fresh ? carryOn(repoPath) : resume ? RESUME_PROMPT : HANDOFF_PROMPT} ${whereLine(repoPath)}${note ? " " + note : ""}`);
  const walls = (() => { try { return opsWalls(repoPath); } catch { return null; } })(); // an ops run: in walls of its own (opsWalls)
  const e = track(critic ? `Design critic: ${repoPath.split("/").pop()}` : designer ? `Designer: ${repoPath.split("/").pop()}` : typeof opts.name === "string" && opts.name ? opts.name.slice(0, 80) : repoPath.split("/").pop(), walled(gap ? `sleep ${Math.ceil(gap / 1000)}; ${full}` : full, walls), repoPath, (code) => {
    if (!critic && !designer && noteSession(repoPath, code, !!resume && !fresh) === "lost") { setTimeout(() => { try { runHandoff(repoPath, { force: true, lost: true, onExit }); } catch {} }, 300); return; } // its conversation is gone: start afresh
    try { if (JSON.parse(readFileSync(lock, "utf8")).pid === e.pid) unlinkSync(lock); } catch {}
    try { const d = noteClaudeDown(repoPath); if (d) e.down = d; } catch {} // Claude itself was the reason: no start anywhere until it's back
    // the tree as the run left it, asked of git once: the three checks below each ran a whole `git status -uall`
    let left; const after = () => (left === undefined ? (left = dirtyState(repoPath)) : left);
    noteBlocked(repoPath, scoped, e.startedAt, code, { dirtyBefore, ticksBefore, after });
    try { noteRunFiles(repoPath, e, dirtyBefore, ticksBefore, after); } catch {} // which files this run touched, for Approve
    forgetRunStart(repoPath, e.id);
    try { jobTrack("run:" + e.id, designer ? { state: "done", waitingOn: "", what: "", summary: "Wrote the design spec the builder works to", note: "", outcome: true } : { ...runOutcome(repoPath, e, code), outcome: true }); } catch {} // the designer leaves its items open on purpose: the builder's run is the one that does them // the job record (jobs.mjs): how the run ended, once, for every screen and restart
    if (code === 0) { const st = loadStall(repoPath); if (st && !st.card && !st.restart) clearStall(repoPath); } // it got past it: a stall after this is a first again
    setTimeout(() => { try { autoAllow(repoPath); } catch {} }, 300); // a list it proposed inside your work: turned on, and on it goes
    startHeldTasks(repoPath); // tasks sent while it ran land now; start on them as that Send would have
    try { urgentDone(repoPath, e.id); } catch {} // the urgent run's done: the lanes it parked carry on
    // the designer's spec: recorded, and the builder starts on it (a fresh run, not the designer's conversation)
    if (designer) { let d = null; try { d = settleDesign(repoPath); } catch {} setTimeout(() => { try { runHandoff(repoPath, { force: true, onExit, note: d && d.written.length ? "Symbiot's designer has written the spec for this work in .symbiot/design/ (.symbiot/ui-design.json maps item to spec): read it first and build to it." : "" }); } catch {} }, 300); return; }
    const up = !isClaudeCmd(scoped) || critic ? null : (() => { try { return escalation(repoPath, model, code, { dirtyBefore, ticksBefore, askedBefore, handedBefore, after }, escalatedFrom); } catch { return null; } })(); // another agent's run has no Sonnet to go up from
    if (up) { setTimeout(() => { try { runHandoff(repoPath, { force: true, model: up.model, escalatedFrom: up.from, note: up.note, onExit }); } catch {} }, 300); return; } // it failed or did nothing: the same task, one tier up
    // done is checked, not said: each item this run ticked, against what its log shows it did; one that
    // fails is reopened with what's missing, and the run starts again on it (done.mjs)
    if (!critic) try {
      const changed = ((loadRunFiles(repoPath).find((r) => r.id === e.id) || {}).files || []).length;
      const dr = settleDone(repoPath, { log: runSection(readRunLog(e.log), e.startedAt, true), before: tickedBefore, ops: isOps(repoPath), hasTests: hasTestScript(repoPath), changed });
      if (dr.reopened.length && autoStart(repoPath)) { const t = setTimeout(() => { try { runHandoff(repoPath, { force: true, onExit }); } catch {} }, 300); if (t.unref) t.unref(); return; }
    } catch {}
    try { uiReview(repoPath, e, { critic }); } catch {} // UI work: Symbiot's design critic judges it, or its verdict is settled (design.mjs)
    if (onExit) try { onExit(code); } catch {} // a run beside the lane's own (parallel.mjs) merges back
  }, env);
  if (!e) { try { if (JSON.parse(readFileSync(lock, "utf8")).claim) unlinkSync(lock); } catch {} if (designer) try { dropDesign(repoPath); } catch {} return null; } // it didn't start: the claim goes (and a designer that didn't, leaves nothing pending)
  e.handoff = true; if (critic) e.critic = true; if (designer) e.designer = true;
  jobTrack("run:" + e.id, { kind: "agent", lane: repoPath.split("/").pop(), path: repoPath, text: typeof opts.name === "string" && opts.name ? opts.name : repoPath.split("/").pop(), state: "running", waitingOn: "" });
  if (escalatedFrom) e.escalatedFrom = escalatedFrom; // costs.json logs it, so a lane that keeps escalating starts on Opus (route.mjs)
  try { if (urgentState()) noteUrgentRun(repoPath, e.id); } catch {}
  if (e.pid) try { writeFileSync(lock, JSON.stringify({ pid: e.pid, id: e.id, startedAt: e.startedAt, owner: process.pid })); } catch {}
  if (e.pid) saveRunStart(repoPath, e, dirtyBefore, ticksBefore);
  noteRun(e);
  return e;
}
// ---- Claude itself is down: no run starts until it's back ---------------------
// A session limit, an expired sign-in or two runs refreshing one token at once ended
// every run in a second, and the next tick started the same lanes again: 15 relaunches
// in 3 minutes (9 Oct), 9 in 4 minutes (12 Oct 2026), each a red run on the Workdesk.
// The run's last line says which (claudeDownIn); paused.json then holds every start
// until the time the limit named, or until Claude Code is signed in again (asked once
// a minute), and Home shows one card for it, not one per lane. Starts are also spaced
// a few seconds apart (startGap): three in one second raced on the token refresh.
const PAUSE_FILE = join(CONFIG_DIR, "paused.json"), SIGNIN_EVERY = 60000, REFRESH_WAIT = 2 * 60000, LIMIT_FALLBACK = 60 * 60000, AUTH_WAIT = 10 * 60000;
function claudeDownIn(text, now = Date.now()) {
  const t = String(text || "");
  const m = /session limit\b[^\n]*?\bresets?\s+([^\n(]+?)\s*(?:\([^)]*\))?\s*\.?\s*$/im.exec(t);
  if (m) return { kind: "limit", why: "Claude's session limit is used up", until: resetTime(m[1], now) || now + LIMIT_FALLBACK, resets: m[1].trim() };
  if (/OAuth session expired|Failed to authenticate|not logged in|run \/login|Invalid authentication|authentication_error|Not authenticated/i.test(t)) return { kind: "auth", why: "Claude Code is signed out", until: 0 };
  if (/another Claude Code process is refreshing|Failed to refresh OAuth token/i.test(t)) return { kind: "refresh", why: "two runs refreshed Claude's sign-in at once", until: now + REFRESH_WAIT };
  return null;
}
// "8:50am", "3pm", "14:30" → the next time it's that, local time (the limit's zone is the
// account's, this computer's), a minute past so the first run isn't a second early; 0 unread.
function resetTime(s, now = Date.now()) {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(String(s || "")) || /(\d{1,2}):(\d{2})/.exec(String(s || "")); if (!m) return 0;
  let h = Number(m[1]); const min = Number(m[2] || 0), ap = (m[3] || "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return 0;
  const d = new Date(now); d.setHours(h, min, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime() + 60000;
}
const loadPause = () => { try { const p = JSON.parse(readFileSync(PAUSE_FILE, "utf8")); return p && p.kind ? p : null; } catch { return null; } };
const unpauseRuns = () => { try { unlinkSync(PAUSE_FILE); } catch {} };
const when = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function pauseNote(p) {
  if (p.kind === "limit") return `Not started: ${p.why} (it resets ${p.resets || "at " + when(p.until)}), so no run starts before ${when(p.until)}: each would stop at once and the next tick would start it again.`;
  if (p.kind === "auth") return `Not started: ${p.why}, so no run can work. Sign in to Claude Code again (Settings → AI, or run  claude  in a terminal): runs carry on by themselves once you have.`;
  return `Not started: ${p.why}, so runs wait until ${when(p.until)} and then start a few seconds apart.`;
}
let SIGNIN_AT = 0, SIGNED = false;
// The pause in force, or null: { kind, why, until, note }. An auth pause ends when Claude
// Code is signed in again; a timed one when its time is up.
function claudePause({ now = Date.now(), ready = (fresh) => claudeState(fresh).signedIn } = {}) {
  const p = loadPause(); if (!p) return null;
  if (p.kind === "auth" && !p.until) {
    if (now - SIGNIN_AT >= SIGNIN_EVERY) { SIGNIN_AT = now; try { SIGNED = !!ready(true); } catch { SIGNED = false; } }
    if (SIGNED) { unpauseRuns(); return null; }
  } else if (!(p.until > now)) { unpauseRuns(); return null; }
  return { ...p, note: pauseNote(p) };
}
// A run just ended: was Claude itself the reason? Then every start pauses. Only a run that
// did nothing (cost 0, an error): a run that worked and *mentioned* a session limit isn't one.
// Its kind, for the run's block, or "".
function noteClaudeDown(path, now = Date.now(), { claude = isClaudeCmd(handoffCmd()) } = {}) {
  let w = null; try { w = parseRun(lastRunText(readSymbiot(path, "agent.log"))); } catch { return ""; }
  if (!w || (w.cost || 0) > 0 || !(w.errors > 0 || !w.stream)) return "";
  const d = claudeDownIn(w.final, now); if (!d) return "";
  if (d.kind === "auth" && !claude) d.until = now + AUTH_WAIT; // another agent's sign-in: nothing here can tell when it's back
  const had = loadPause(); if (!had || had.kind !== d.kind || (d.until || 0) > (had.until || 0)) try { writeJsonAtomic(PAUSE_FILE, { ...d, at: now }, { mode: 0o600 }); } catch {}
  return d.kind;
}
const START_GAP = 3000, START_GAP_MAX = 30000; let LAST_START = 0;
// How long this start waits so starts come a few seconds apart; a batch of ten spreads over half a minute at most.
function startGap(now = Date.now()) { const at = Math.min(Math.max(now, LAST_START + START_GAP), now + START_GAP_MAX); LAST_START = at; return at - now; }
// A Sonnet run that ended in an error (or its turn cap), or produced nothing (no
// change, no tick, no question), is run again once on Opus, told what the first
// attempt did. { model, from, note } or null: Opus (or an explicit pick) goes no higher.
// Not a run that stopped for a reason (21 Oct 2026): a Sonnet run that found its work already
// done went up as "produced nothing", and an ops run that stopped to wait for the user's sign-in
// went up as "ended in an error" because a command along the way had failed. A failed command
// inside a run that exited cleanly isn't the run failing; and a run that asked, handed work to
// another lane, said it's waiting, blocked or already done, or left no open task, did its part.
const STOPPED_FOR = /\b(?:waiting (?:on|for)|waits (?:on|for)|blocked (?:on|by)|already (?:done|there|in place|fixed|live|merged|ticked)|nothing (?:left )?to do|nothing (?:else )?(?:needed|changed)|no (?:change|work) (?:is |was )?needed|handed (?:it |this |that )?(?:over|on|to)|until (?:you|the user|garth|ops)\b)/i;
function escalation(repoPath, model, code, before, already = "") {
  if (already || model !== "sonnet") return null; // only a Sonnet pick goes up: Opus, an explicit pick or another agent's own model stays
  let run = {}; try { run = parseRun(lastRunText(readSymbiot(repoPath, "agent.log"))); } catch {}
  const failed = code !== 0;
  if (!failed && !OPEN_TASK.test(readSymbiot(repoPath, "TASKS.md"))) return null;
  if (readSymbiot(repoPath, "QUESTIONS.md") !== (before.askedBefore || "") || (before.handedBefore !== undefined && readSymbiot(repoPath, "HANDOFF.md") !== before.handedBefore)) return null;
  if (STOPPED_FOR.test(String(run.final || ""))) return null;
  const dirty = failed ? null : (before.after || (() => dirtyState(repoPath)))();
  const nothing = !failed && before.dirtyBefore && dirty && JSON.stringify(dirty) === JSON.stringify(before.dirtyBefore) && ticksIn(readSymbiot(repoPath, "TASKS.md")) === before.ticksBefore;
  if (!failed && !nothing) return null;
  const said = String(run.final || "").trim().replace(/\s+/g, " ").slice(-300);
  const note = `The last attempt, on a smaller model, ${failed ? "ended in an error" : "produced nothing"}${said ? `: ${said}` : ""}. Start from the same task and take a different approach.`;
  return { model: "opus", from: "sonnet", note: note.replace(/["'$`\\]/g, "") }; // no quotes, $ or backticks: it may pass through two shells
}
// ---- nothing to do: no run ----------------------------------------------------
// A run in ~ started with no .symbiot/TASKS.md there, found nothing to action and
// only cost a session (2026-10-07). A run needs something to work from: an
// unticked task, or an answer that came in since the folder's last run started
// (an approved post or draft, a reply to its question: those carry on with every
// task ticked, and Marketing's folder may have no TASKS.md at all). Else the note
// for { blocked, idle }, even forced: Start it anyway would start the same
// nothing. Briefs are written before their run starts (actNow, draftReply,
// pushTasks), and a held one lands first (runHandoff), so they count. Only the
// run that restarts a lost conversation skips this: its answer is older than the
// failed resume's start.
// Only the user's answers count (userAnswers): a handover's report, a shared answer's
// background note and Symbiot's own picks all moved ANSWERS.md, and each started a run
// in a lane with every task ticked (7 of the symbiot lane's 17 runs, $8, 15 Oct 2026).
// What the last run saw is kept at its start (ANSWERS_SEEN); a folder from before that
// goes by the file's time, as before.
const OPEN_TASK = /^\s*(?:[-*+]|\d+[.)])\s*\[ \]/m, ANSWERS_SEEN = "answers-seen.json";
const noteAnswersSeen = (path) => { try { writeFileSync(join(path, ".symbiot", ANSWERS_SEEN), JSON.stringify({ at: Date.now(), answers: answersDigest(path) })); } catch {} };
function newAnswers(path) {
  let seen = null; try { seen = JSON.parse(readSymbiot(path, ANSWERS_SEEN)); } catch {}
  if (seen && typeof seen.answers === "string") return answersDigest(path) !== seen.answers;
  let answered = 0; try { answered = statSync(join(path, ".symbiot", "ANSWERS.md")).mtimeMs; } catch {}
  return !!answered && answered > runStarted(readSymbiot(path, "agent.log"));
}
function nothingToDo(path) {
  const where = whereOf(path);
  if (where.gone) return `Not started: ${where.folder} was a copy of the ${where.lane} repo made for one task, and it was removed when that task was merged, so there's nothing left there to work on.`;
  const md = readSymbiot(path, "TASKS.md"); if (OPEN_TASK.test(md)) return "";
  if (newAnswers(path)) return "";
  const name = path === homedir() ? "~" : path.split(/[\\/]/).filter(Boolean).pop() || path;
  return md.trim() ? `Not started: every task on ${name}'s list is done or waiting on something, and no answer has come in since its last run, so its agent would have nothing to do. A new task starts it.`
    : `Not started: ${name} has no .symbiot/TASKS.md, so an agent there would have nothing to do. Send it a task first.`;
}
// ---- where a run is: never a question for the user ---------------------------
// An agent in ~/.config/symbiot/worktrees/symbiot-25fada asked "which repo is this
// worktree for?", then what "work desk" meant (2026-10-13): the folder's name said
// symbiot, and the Workdesk is Symbiot's own page. Every run is told where it is
// (whereLine), and a question about that is answered from the same facts instead of
// reaching the user (whereAnswer, autoDecide). A copy is parallel.mjs's worktree for
// one task (its par.json says whose); one with no par.json and no .git was removed
// after its merge and only an answer recreated its .symbiot (gone).
const PAGES = "Home, Dashboard (the board), Workdesk (the tasks page: the tasks, agents and questions of every lane), Reports, Marketing, Week, Standup, Todo, Drift, Map, Settings, Vault and Archive"; // no apostrophes: whereLine drops them
const WT_ROOT = join(CONFIG_DIR, "worktrees") + "/";
const WHERE = new Map();
function whereOf(path, now = Date.now()) {
  path = String(path || ""); const c = WHERE.get(path); if (c && now - c.at < 60000) return c;
  const folder = path.split(/[\\/]/).filter(Boolean).pop() || path;
  let par = null; try { par = JSON.parse(readSymbiot(path, "par.json")) || null; } catch {}
  const copy = !!par || path.startsWith(WT_ROOT), git = existsSync(join(path, ".git"));
  const lane = (par && par.lane) || (path === MARKETING_DIR ? "marketing" : path.startsWith(ACT_DIR) ? "ops" : copy ? folder.replace(/-[0-9a-f]{6}$/i, "") : folder);
  const repo = (par && par.repo) || (copy ? "" : path);
  let remote = "";
  for (const p of [git ? path : "", repo]) if (!remote && p) { const r = spawnSync("git", ["-C", p, "remote", "get-url", "origin"], { encoding: "utf8", timeout: 5000 }); if (r.status === 0) remote = String(r.stdout || "").trim(); }
  const w = { at: now, folder, lane, repo, remote, copy, git, task: (par && par.task) || "", gone: copy && !par && !git };
  WHERE.set(path, w); return w;
}
// One sentence for the run's prompt. No quotes, $ or backticks: it passes through two shells.
function whereLine(path) {
  const w = whereOf(path), safe = (s) => String(s || "").replace(/["'`$\\]/g, "");
  const what = w.copy ? `a copy of the repo of the ${w.lane} lane${w.repo ? ` (${w.repo})` : ""}, made for one task` : `the ${w.git && w.lane !== "ops" && w.lane !== "marketing" ? "repo" : "folder"} of the ${w.lane} lane`;
  return safe(`Where you are: this folder is ${w.folder}, ${what}${w.remote ? `, git remote ${w.remote}` : ""}. The pages of Symbiot are ${PAGES}: a page name in a task or an answer means that page. Before you ask the user anything, check what your folder name, git remote, lane and brief already say: never ask which repo or project this is, or what a Symbiot page is.`);
}
// A question asking where the run is: which repo, project or lane this folder is for,
// or what a word the user wrote means when it names a Symbiot page.
const ASKS_WHERE = /\b(?:which|what)\s+(?:repo(?:sitory)?|project|codebase|lane)\b[^?]*?(?:\bthis\s+(?:worktree|folder|checkout|directory|repo|copy)\b|\b(?:is|are)\s+(?:this|these|it)\s+(?:meant\s+)?for\b|\b(?:am\s+i|are\s+we|i'?m|we'?re)\s+in\b|\bmeans?\b)/i;
const PAGE_NAMES = "home|dashboard|board|work\\s*desk|tasks|reports|marketing|week|standup|todo|drift|map|settings|archive";
const PAGE_WORD = new RegExp(`\\bwhat\\s+(?:does|do|did)\\s+["'“‘]?(?:the\\s+)?(?:${PAGE_NAMES})["'”’]?\\s+mean\\b|["'“‘][^"'“”‘’]{0,20}\\b(?:${PAGE_NAMES})\\b[^"'“”‘’]{0,20}["'”’]\\s+means?\\b`, "i");
function whereAnswer(path, q) {
  const text = `${(q && q.q) || ""} ${(q && q.context) || ""}`;
  if (!ASKS_WHERE.test(text) && !PAGE_WORD.test(text)) return "";
  const w = whereOf(path); if (!w.lane || w.gone) return "";
  const what = w.copy ? `a copy of the ${w.lane} repo${w.repo ? ` (${w.repo})` : ""}, made for your task` : `the ${w.lane} lane's ${w.git ? "repo" : "folder"}`;
  return `This folder, ${w.folder}, is ${what}${w.remote ? `; its git remote is ${w.remote}` : ""}. Symbiot's pages are ${PAGES}, so when the user names one (work desk, say) they mean that page. Carry on with your task in ${w.lane} and don't ask this again.\n(Symbiot answered from the folder's name and remote, so the user wasn't asked.)`;
}
// A question that repeats one the user has answered (asksdone.mjs heldBy): answered from that
// answer, so it never reaches them again in new words. A subject they asked back about (explain
// it, put it in Reports) stays held until they've opened a report written after they asked.
const REPEAT_TAG = "(Symbiot answered from the user's earlier answer, so they weren't asked again.)";
function laneFolder(lane, path) { if (!lane || lane === whereOf(path).lane) return path; try { return laneMap()[lane] || path; } catch { return path; } }
const readSinceFor = (path) => (ts, lane) => reportsSince(laneFolder(lane, path), ts).some((r) => r.read);
function repeatAnswer(path, q) {
  const text = String((q && q.q) || ""); if (!text) return "";
  const x = heldBy(text, { lane: whereOf(path).lane, readSince: readSinceFor(path), id: (q && q.id) || "" }); if (!x) return "";
  const wrote = x.back ? reportsSince(laneFolder(x.lane, path), x.ts || 0)[0] : null;
  return x.back
    ? `You, or another agent on this, asked this already ("${clipWords(x.q, 160)}", ${x.at}), and the user asked back: "${clipWords(x.a, 200)}". They haven't read an answer to that yet. ` +
      (wrote ? `"${wrote.title}" is in Reports (.symbiot/${basename(wrote.file)}): if it answers them, say so in your last message, naming it; if not, write what's missing into it first. ` : `Write it up for them now, before anything else: a .md in .symbiot/ named for what it is, starting with a # title, so it shows under Reports, and name it in your last message. `) +
      `Don't ask about this again, in any words, until they've read it.\n${REPEAT_TAG}`
    : `You, or another agent, asked this already ("${clipWords(x.q, 160)}", ${x.at}), and the user answered: "${clipWords(x.a, 200)}". Act on that answer and don't ask it again, in any words.\n${REPEAT_TAG}`;
}
// The task a question is about, as one plain line for its card: the run's one task
// (a copy's), else the open task in its brief that shares the most words with the
// question, else the brief's first open one.
const taskTitle = (t) => clipWords(String(t || "").replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0], 90);
function askTask(path, q) {
  const w = whereOf(path); if (w.task) return taskTitle(w.task);
  const all = [...readSymbiot(path, "TASKS.md").matchAll(/^\s*(?:[-*+]|\d+[.)])\s*\[([ xX])\]\s*(.+)$/gm)].map((m) => ({ open: m[1] === " ", text: m[2] }));
  const pool = all.some((t) => t.open) ? all.filter((t) => t.open) : all;
  if (!pool.length) { try { return taskTitle((JSON.parse(readSymbiot(path, "handoff.json")) || {}).name || ""); } catch { return ""; } }
  const qw = new Set(taskWords(`${(q && q.q) || ""} ${(q && q.context) || ""}`).split(" ").filter((x) => x.length > 3));
  let best = pool[0], top = 0;
  for (const t of pool) { const n = taskWords(t.text).split(" ").filter((x) => x.length > 3 && qw.has(x)).length; if (n > top) { top = n; best = t; } }
  return taskTitle(best.text);
}
// ---- Symbiot Free and Pro (licence.mjs) -------------------------------------
// A run that Free doesn't cover doesn't start; it says why, the way a parked lane does.
// Nothing running is touched. Free's 3 projects are the first 3 it works in (Settings
// can free one); the marketing lane is Pro.
function licenceGate(repoPath, st = licenceState()) {
  const self = canWorkIn(repoPath, st); if (!self.ok) return { blocked: true, self: true, questions: 0, note: self.why };
  if (isPro(st)) return null;
  if (repoPath === MARKETING_DIR) { const m = can("marketing", {}, st); return { blocked: true, pro: true, questions: 0, note: m.why }; }
  const running = HANDOFFS.filter((x) => x.handoff && x.status === "running" && x.path !== repoPath).length;
  const a = can("agents", { running }, st); if (!a.ok) return { blocked: true, pro: true, questions: 0, note: a.why };
  const cfg = loadConfig(), L = cfg.licence || {}, mine = Array.isArray(L.projects) ? L.projects : [];
  if (!mine.includes(repoPath)) {
    const p = can("projects", { count: mine.length }, st); if (!p.ok) return { blocked: true, pro: true, questions: 0, note: p.why + " Settings → Symbiot Pro can swap one of your 3 for this." };
    cfg.licence = { ...L, projects: [...mine, repoPath] }; saveConfig(cfg);
  }
  return null;
}
// ---- a parked lane: its tasks start no runs ----------------------------------
// A lane blocked on something only the user can give (a token from Meta) ran 27
// times: every answer, handover, Go and Start it anyway started it again, to say
// the same thing. Parked (config.parked: folder paths), nothing starts an agent
// there until it's unparked; a run already going finishes.
const PARKED_NOTE = "Parked: its tasks start no agent runs until you unpark it.";
function parkedPaths() { const p = loadConfig().parked; return Array.isArray(p) ? p.filter((x) => typeof x === "string" && x) : []; }
const isParked = (path) => !!path && parkedPaths().includes(path);
function parkLane(path, on) {
  path = String(path || ""); if (!path) return { error: "No project to park." };
  const cfg = loadConfig(), list = parkedPaths().filter((p) => p !== path);
  if (on) list.push(path);
  if (list.length) cfg.parked = list; else delete cfg.parked;
  saveConfig(cfg);
  return { ok: true, parked: !!on };
}
// ---- urgent work goes first -------------------------------------------------
// "symbiot keeps crashing" waited behind a routine run in its own lane (the Home
// layout, step 5 of 6) and 5 more tasks, and the user parked meridian and robin by hand
// (2026-10-08). Urgent is a crash, "urgent", "comes first" or a word in capitals.
// Then urgentFirst parks every other lane with work going or waiting (a run already
// going there finishes, as parking does: the end of a run is the safe point, and a
// test stopped halfway would be void), stops the urgent lane's own routine run (its
// changes stay in the folder, and the next run carries on from them) so the urgent
// one starts now, and when that run ends, urgentDone unparks those lanes in their
// old order and starts the ones with work waiting. Lanes you parked stay parked,
// except the urgent lane itself: on 2026-10-09 symbiot was parked, so every urgent
// handover there parked marketing, started nothing, and still said "it's already on
// urgent work, and takes this next" while 0 agents worked. Asking for urgent work in
// a lane is the newest thing you've said about it, so it's unparked for it; and if
// its run still doesn't start, urgentUndo takes back what urgentFirst did.
// No capitals rule: a word in capitals (SMTP, CORS, UUID, NGINX, IMAP, GDPR) made a
// routine task urgent, which parked every other lane and killed the lane's own run
// mid-edit (15 Oct 2026). Only words that say so count; and only the strongest of
// them (urgentStop: "urgent", a crash, "drop everything") stop a run already going.
const URGENT_SAID = /\burgent(?:ly)?\b|\b(asap|right now|drop everything)\b|\bcrash(es|ing|ed)\b|\bkeeps? (closing|quitting|dying)\b|\b(won'?t|doesn'?t|can'?t) (start|open|launch)\b/i;
const URGENT_FIRST = /\b(do (this|it) first|comes? first|goes? first|first thing|takes? priority|before (anything|everything) else)\b/i;
function isUrgent(text) { const t = String(text || ""); return URGENT_SAID.test(t) || URGENT_FIRST.test(t); }
// Said outright, not just "first": the one case a lane's routine run is stopped for it.
const urgentStop = (text) => URGENT_SAID.test(String(text || ""));
const urgentState = () => { const u = loadConfig().urgent; return u && Array.isArray(u.paths) && u.paths.length ? u : null; };
function saveUrgent(u) { const cfg = loadConfig(); if (u) cfg.urgent = u; else delete cfg.urgent; saveConfig(cfg); }
const hasOpenUrgent = (md) => String(md || "").split("\n").some((l) => /^\s*-\s*\[ \]/.test(l) && isUrgent(l));
function stopRun(path) {
  const r = runningHandoff(path); if (!r || !r.pid) return false;
  try { process.kill(-r.pid, "SIGTERM"); } catch { try { process.kill(r.pid, "SIGTERM"); } catch { return false; } } // its own process group (track: detached)
  return true;
}
// lanes: the paths to consider ({ name: path }); returns { parked: [names], parkedPaths,
// stopped, unparked (it was parked: now it isn't), busy: "urgent" | "routine" | "" (a run
// there now: one already on urgent work, which this waits for, or one it couldn't stop) }.
// halt: false leaves a routine run there to finish (the ask said "first", not "urgent").
// others: false parks no other lane (a fix to Symbiot itself: on 20 Oct a card-labelling
// fix parked the user's bookly lane twice); it still goes first in its own lane.
function urgentFirst(path, { lanes = null, stop = stopRun, running = runningHandoff, halt = true, others = true } = {}) {
  if (!path) return { parked: [], parkedPaths: [], stopped: false, unparked: false, busy: "" };
  const u = urgentState() || { at: Date.now(), paths: [], parked: [], runs: [] };
  if (!u.paths.includes(path)) { u.paths.push(path); u.at = Date.now(); }
  if (u.parked.includes(path)) u.parked = u.parked.filter((p) => p !== path); // urgent itself now
  const unparked = isParked(path); if (unparked) parkLane(path, false);
  const all = lanes || Object.fromEntries(loadRuns().map((r) => [String(r.name || r.path.split("/").pop()), r.path]));
  const parked = [], mine = [], already = parkedPaths();
  for (const [name, p] of others ? Object.entries(all) : []) {
    if (!p || u.paths.includes(p) || already.includes(p)) continue; // yours stay yours
    if (!running(p) && !readSymbiot(p, HELD)) continue; // nothing going or waiting there
    parkLane(p, true); u.parked.push(p); parked.push(name); mine.push(p);
  }
  // its own lane: a routine run stops so this one starts now; one that's already on urgent
  // work keeps going, and counts as the urgent run, so its end resumes what was parked
  const busy = running(path), onIt = !!busy && (u.runs.includes(busy.id) || hasOpenUrgent(readSymbiot(path, "TASKS.md")));
  if (onIt && busy.id && !u.runs.includes(busy.id)) u.runs.push(busy.id);
  const stopped = !!busy && !onIt && halt && stop(path);
  saveUrgent(u);
  return { parked, parkedPaths: mine, stopped, unparked, busy: !busy ? "" : onIt ? "urgent" : stopped ? "" : "routine" };
}
// The urgent lane's run didn't start (no agent command, a step of yours first, its
// questions unanswered) and nothing runs there: nothing will end to resume the lanes
// urgentFirst parked, so they're unparked now, and the lane leaves the urgent record.
function urgentUndo(path, did, { running = runningHandoff } = {}) {
  if (!path || !did || running(path)) return false;
  const u = urgentState(); if (!u) return false;
  const back = (did.parkedPaths || []).filter((p) => u.parked.includes(p));
  for (const p of back) if (parkedPaths().includes(p)) parkLane(p, false);
  u.parked = u.parked.filter((p) => !back.includes(p));
  u.paths = u.paths.filter((p) => p !== path);
  saveUrgent(u.paths.length ? u : null);
  if (!u.paths.length && u.parked.length) resumeParked(u.parked); // parked by an earlier urgent ask that never ran either
  return true;
}
// the urgent lane's run started: when it ends, the parked work resumes (runHandoff's exit)
function noteUrgentRun(path, id) { const u = urgentState(); if (u && u.paths.includes(path) && id && !u.runs.includes(id)) { u.runs.push(id); saveUrgent(u); } }
function urgentDone(path, id, { running = runningHandoff, start = runHandoff } = {}) {
  const u = urgentState(); if (!u || !u.paths.includes(path) || !u.runs.includes(id)) return null;
  u.paths = u.paths.filter((p) => p !== path);
  if (u.paths.some((p) => running(p))) { saveUrgent(u); return null; } // another urgent lane is still at it
  saveUrgent(null);
  return resumeParked(u.parked, start);
}
function resumeParked(paths, start = runHandoff) {
  const resumed = [];
  for (const p of paths) { // in the order they were parked
    if (!parkedPaths().includes(p)) continue; // you unparked it meanwhile
    parkLane(p, false);
    if (/^\s*-\s*\[ \]/m.test(readSymbiot(p, HELD) || readSymbiot(p, "TASKS.md"))) { try { const e = startHeldTasks(p) || start(p); if (e && e.id) resumed.push(p); } catch {} }
  }
  return { unparked: paths, resumed };
}
// The app restarted under an urgent run (its exit never came), or it never started:
// the parked lanes don't wait forever. A record with no run going in any urgent lane is
// over once URGENT_GRACE has passed (a stopped routine run takes a moment to exit, and
// the urgent one starts then): before, one whose run never started held marketing for 6h.
const URGENT_MAX = 6 * 3600 * 1000, URGENT_GRACE = 2 * 60 * 1000;
function urgentSweep({ running = runningHandoff, now = Date.now(), start = runHandoff } = {}) {
  const u = urgentState(); if (!u) return null;
  const ended = !u.paths.some((p) => running(p)) && (u.runs.length > 0 || now - (u.at || 0) >= URGENT_GRACE);
  if (!ended && now - (u.at || 0) < URGENT_MAX) return null;
  saveUrgent(null);
  return resumeParked(u.parked, start);
}
// The agent the handoff command runs, when it isn't on this computer (the CLI
// was uninstalled, or PATH lost it): its name, else "". Then no task can start.
function agentMissing(tmpl = handoffCmd()) {
  const words = String(tmpl || "").trim().split(/\s+/), bin = words.find((w) => !/^\w+=/.test(w)) || "";
  if (!bin || /[{}"'$`]/.test(bin)) return "";
  if (bin.includes("/")) return existsSync(bin.replace(/^~(?=\/)/, homedir())) ? "" : bin;
  return /^[\w.+-]+$/.test(bin) && !hasCmd(bin) ? bin : "";
}
// ---- runs from before the app started ---------------------------------------
// HANDOFFS lives in memory, so after a restart a run that stopped on questions
// was gone from the Agents tab, its questions with it: there was no answering
// them there, only Start it anyway or a change to .env. So each folder a run
// starts in is noted in ~/.config/symbiot/runs.json ({ path, name, startedAt },
// newest first, by whichever process started it: the app, or `symbiot push
// --open`), and the Agents tab lists the ones it isn't tracking itself while they
// have questions open, a step of yours to wait for, or a run still going.
const RUNS_FILE = join(CONFIG_DIR, "runs.json"), RUNS_MAX = 60;
function loadRuns() { try { const a = readState(RUNS_FILE); return Array.isArray(a) ? a.filter((r) => r && typeof r.path === "string" && r.path) : []; } catch { return []; } }
// An entry whose folder is gone, with no run alive in it (a copy of a repo made for one task,
// removed once it merged: parallel.mjs), is dropped: 49 of the 60 named folders that no longer
// existed, and had pushed the lanes themselves off the list, so their "carry on" checks and
// their answers ("No agent has run in that folder") stopped (16 Oct 2026). Gone AND not
// running: a run this app started keeps its place while it's alive, folder or no folder.
function pruneRuns(list) { return (list || []).filter((r) => existsSync(r.path) || !!runningHandoff(r.path)); }
function noteRun(e) {
  const list = [{ path: e.path, name: e.name, startedAt: e.startedAt }, ...pruneRuns(loadRuns().filter((r) => r.path !== e.path))].slice(0, RUNS_MAX);
  try { writeJsonAtomic(RUNS_FILE, list, { mode: 0o600 }); } catch {}
}
const knownRun = (path) => HANDOFFS.some((e) => e.path === path) || loadRuns().some((r) => r.path === path) || (String(path || "").startsWith(ACT_DIR) && existsSync(join(path, ".symbiot", "QUESTIONS.md"))); // an ops folder with a question is one to answer, however old
// ---- questions from every ops folder, not just the 60 newest runs -------------------
// runs.json keeps the 60 newest folders, about two days of runs, so an ops run's open
// question dropped off the Workdesk unanswered after that (31 folders' worth, 15 Oct
// 2026). The drafts folder is listed every QF_EVERY; a folder's questions are read
// again only when its QUESTIONS.md or ANSWERS.md changed, and one with a question still
// open is listed like a run: { path, name, startedAt }.
const QF_EVERY = 30000, QF_MAX_AGE = 30 * 86400000, QF = { at: 0, list: [], seen: new Map() };
const runNameOf = (path) => { try { const h = JSON.parse(readSymbiot(path, "handoff.json")) || {}; return String(h.name || "").slice(0, 80) || basename(path); } catch { return basename(path); } };
function questionFolders(now = Date.now()) {
  if (now - QF.at < QF_EVERY) return QF.list;
  QF.at = now; const out = [], live = new Set();
  let dirs = []; try { dirs = readdirSync(ACT_DIR).filter((d) => d.startsWith("act-")); } catch {}
  for (const d of dirs) {
    const path = join(ACT_DIR, d); let st; try { st = statSync(join(path, ".symbiot", "QUESTIONS.md")); } catch { continue; }
    if (now - st.mtimeMs > QF_MAX_AGE) continue;
    live.add(path);
    let am = 0, tm = 0; try { am = statSync(join(path, ".symbiot", "ANSWERS.md")).mtimeMs; } catch {} try { tm = statSync(join(path, ".symbiot", "triage.json")).mtimeMs; } catch {}
    // a fresh question is held while it's judged (triage.mjs), so "nothing open" then isn't kept: it was kept as long as the
    // folder's files stayed the same, and a question that showed once its wait was over, or its verdict came, never did (21 Oct 2026)
    const held = now - st.mtimeMs <= TRIAGE_HOLD + QF_EVERY, key = `${st.mtimeMs}:${st.size}:${am}:${tm}`, had = QF.seen.get(path);
    const row = had && had.key === key && !had.held ? had : { key, held, open: (() => { try { return agentQuestions(path, "").questions.length > 0; } catch { return false; } })(), name: runNameOf(path), startedAt: runStarted(readSymbiot(path, "agent.log")) || st.mtimeMs };
    QF.seen.set(path, row);
    if (row.open) out.push({ path, name: row.name, startedAt: row.startedAt });
  }
  for (const p of QF.seen.keys()) if (!live.has(p)) QF.seen.delete(p);
  QF.list = out; return out;
}
// The Agents tab's block for a run another process (or this app before a
// restart) started: as agentsList gives one, marked `earlier`. Its end is when
// its log last changed; its exit code isn't known. Then every ops folder with a
// question still open that runs.json has forgotten (questionFolders).
function earlierRuns() {
  const tracked = new Set(HANDOFFS.map((e) => e.path)), out = [], runs = loadRuns(), listed = new Set(runs.map((r) => r.path));
  for (const r of [...runs, ...questionFolders().filter((q) => !listed.has(q.path))]) {
    if (tracked.has(r.path) || !existsSync(join(r.path, ".symbiot"))) continue;
    const busy = runningHandoff(r.path), ask = agentQuestions(r.path, r.name), wait = waitingFor(r.path), facts = busy ? [] : factsOf(r.path);
    const log = join(r.path, ".symbiot", "agent.log"), startedAt = (busy && busy.startedAt) || Number(r.startedAt) || Date.now();
    let end = Date.now(); if (!busy) try { end = statSync(log).mtimeMs; } catch {}
    const needs = busy ? null : needsOf(r.path, { final: lastFinal(r.path), waiting: wait, end, start: startedAt });
    if (!busy && !ask.questions.length && !wait && !facts.length && !needs) continue;
    let tail = "", work = null, progress = null, line = null; try { ({ tail, work, progress, line } = workOf(r.path, readRunLog(log))); } catch {}
    out.push({ id: "earlier-" + digest(r.path).slice(0, 8), name: String(r.name || r.path.split("/").pop()), path: r.path, status: busy ? "running" : "done", earlier: true, startedAt, endedAt: busy ? null : end, elapsed: Math.max(0, end - startedAt), exitCode: null, tail, work, progress, ...(busy && line ? { line } : {}), changed: agentChanges(r.path, startedAt, busy ? 0 : end), ask, held: heldTasks(r.path), waiting: wait, needs, remember: facts.length ? facts : null, fromHeld: false });
  }
  return out;
}

// ---- what a finished run left to you ----------------------------------------
// A run that ended saying something waits on you (handover.mjs leftToYou: "the
// draft isn't sent", "needs sudo, and only you can do that"), or waiting on a step
// an answer of yours picked (waitingFor), needs you, and says so: on its block in
// Agents and on Home, with what to check first. It did end, so before this nothing
// showed it: Home said nothing needed you while a reply to Alex sat in Drafts. It
// stays for NEEDS_FOR, until you go ahead or skip it (settled.json keeps which, per
// folder), a newer run there says something else, or a newer ops run took up the
// same task. { kind: "approve"|"step", what, check, label, key, waiting? } or null.
const NEEDS_FOR = 3 * 86400000, SETTLED = join(CONFIG_DIR, "settled.json"), ACT_DIR = join(CONFIG_DIR, "drafts") + "/";
const ALL_SETTLED = "*";
const loadSettled = () => { try { const o = readState(SETTLED); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; } };
function settleNeeds(path, key) {
  const o = loadSettled(); o[path] = String(key || "");
  // one shared record: an ask you settled stays settled for every agent, not just the folder it came from
  if (key) o[ALL_SETTLED] = [...new Set([String(key), ...(Array.isArray(o[ALL_SETTLED]) ? o[ALL_SETTLED] : [])])].slice(0, 300);
  try { writeJsonAtomic(SETTLED, o, { mode: 0o600 }); } catch {}
}
// An ask the user closed ("this case is closed, no further aspects…"): settled.json keeps its words
// by folder for CLOSED_FOR, and a later run there that says the same thing again ("Dana reply: it
// stays an unsent draft") raises no card (needsOf). Something new on it comes as a new ask, in other words.
const CLOSED = "#closed", CLOSED_FOR = 14 * 86400000;
const subjectOf = (t) => {
  t = String(t || "").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ");
  const words = new Set(t.toLowerCase().replace(/['’]s\b/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !SUBJECT_STOP.has(w)));
  const names = new Set([...t.matchAll(/\b([A-Z][a-z][\w-]*)/g)].map((m) => m[1].toLowerCase()).filter((w) => words.has(w)));
  return { words, names };
};
// Words that say where an ask stands ("still an unsent draft, waiting for your OK"), not what it's about:
// with them "Remy reply" and "Dana reply" read as the same ask.
const SUBJECT_STOP = new Set(("the and you your yours for with this that these those are was were has have had not but its from into once then when what which who will " +
  "would can could should may might our out all any some about after before there here they them their his her she him just also than very now yet been " +
  "unsent sent send sending draft drafts drafted email emails mail mails still sits stays waiting waits unless say says okay nothing anything changed ready gone ahead check first haven hasn isn won didn").split(" "));
// Whether two cards ask the same thing: when both name someone, a name they share and half their other
// words ("Dana reply", not "Dana's invoice"); else most of their words.
function sameSubject(a, b) {
  const x = subjectOf(a), y = subjectOf(b); if (!x.words.size || !y.words.size) return false;
  const both = [...x.words].filter((w) => y.words.has(w)).length, j = both / (x.words.size + y.words.size - both);
  if (x.names.size && y.names.size) return [...x.names].some((n) => y.names.has(n)) && j >= 0.5;
  return j >= 0.6;
}
function closeAsk(path, what, now = Date.now()) {
  if (!path || !String(what || "").trim()) return;
  const o = loadSettled(), c = o[CLOSED] && typeof o[CLOSED] === "object" && !Array.isArray(o[CLOSED]) ? o[CLOSED] : {};
  for (const p of Object.keys(c)) { c[p] = (Array.isArray(c[p]) ? c[p] : []).filter((r) => now - (r.at || 0) < CLOSED_FOR); if (!c[p].length) delete c[p]; }
  c[path] = [...(c[path] || []), { at: now, what: String(what).replace(/\s+/g, " ").trim().slice(0, 300) }].slice(-20);
  o[CLOSED] = c;
  try { writeJsonAtomic(SETTLED, o, { mode: 0o600 }); } catch {}
}
function closedAsk(path, what, now = Date.now(), o = loadSettled()) {
  const c = o[CLOSED] && o[CLOSED][path];
  return Array.isArray(c) && c.some((r) => now - (r.at || 0) < CLOSED_FOR && sameSubject(r.what, what));
}
// A streaming run's last words (its final answer), read once per change of its log.
const FINALS = new Map();
function lastFinal(path) {
  const log = join(path, ".symbiot", "agent.log"); let m = 0; try { m = statSync(log).mtimeMs; } catch { return ""; }
  const c = FINALS.get(path); if (c && c.m === m) return c.final;
  let final = ""; try { const w = parseRun(lastRunText(readRunLog(log))); final = w.stream ? w.final : ""; } catch {}
  FINALS.set(path, { m, final }); return final;
}
const firstTask = (path) => (readSymbiot(path, "TASKS.md").match(/^\s*-\s*\[[ x]\]\s*(.+)$/im) || [])[1] || "";
// an ops run (a folder of its own each time) whose task a newer ops run took up
function takenUp(path, end) {
  if (!path.startsWith(ACT_DIR)) return false;
  const t = firstTask(path); return !!t && loadRuns().some((r) => r.path !== path && r.path.startsWith(ACT_DIR) && Number(r.startedAt) > end && sameTask(firstTask(r.path), t));
}
const draftRun = (path) => { try { const h = JSON.parse(readSymbiot(path, "handoff.json")) || {}; return !!(h.draft || (h.env && h.env.SYMBIOT_DRAFT)); } catch { return false; } };
const NOTHING_FOR_YOU = /\bnothing (?:is |else is )?(?:waiting|waits) (?:on|for)\b|\bnothing (?:here )?(?:is )?for you\b|\bnothing (?:needs|for) (?:you|the user|garth)\b/i;
function needsOf(path, { final = "", waiting = null, end = Date.now(), start = end - REPORT_WINDOW, now = Date.now() } = {}) {
  if (now - end > NEEDS_FOR) return null;
  let n = waiting ? { kind: "step", what: clipWords(String(waiting.step || "").replace(/^\s*👤\s*(You\s*(\([^)]*\))?:)?\s*/, "").trim(), 240), check: "", label: "", waiting: true } : leftToYou(final) || readNeeds(path, final);
  if (!n || !n.what) return null;
  // its own words say nothing waits on the user: an ops run's "waits for your OK" card said
  // "Nothing is waiting on the user", and its Go ahead only started a run that repeated its report (21 Oct 2026)
  if (!n.waiting && (NOTHING_FOR_YOU.test(`${n.label || ""} ${n.what} ${n.check || ""}`) || (NOTHING_FOR_YOU.test(final) && !/👤|only you/i.test(final)))) return null;
  // its run's outcome says the ask needs nothing ("That asks for nothing further"), or the user closed
  // this ask here before: its last words restating it ("it stays an unsent draft") aren't a new ask
  if (!n.waiting && (runSaysClosed(final) || closedAsk(path, n.what, now))) return null;
  // an ask for an approval: never when it was already given (chat, a task, an earlier answer), and
  // otherwise the card carries it (Go ahead), never "press Approve" on a page that has no such button
  if (n.kind !== "approve" && isApprovalAsk(`${n.label} ${n.what}`)) {
    if (approvedBefore(n.what, { turns: recentTurns(now), tasks: recentTasks(), answers: readSymbiot(path, "ANSWERS.md") })) return null;
    n = { ...n, kind: "approve", what: approvalText(n.what), asked: true };
  }
  // a sign-in the Symbiot Browser can't hold (Twilio's, or one you did when asked and its run
  // still couldn't read): never yours to do again, but its agent's, through the site's API (browserfails.mjs)
  const nb = n.kind !== "approve" && blockedSignIn(`${n.label} ${n.what} ${n.check}`, end);
  if (nb) n = { kind: "approve", what: `The browser can't hold this sign-in: ${nb.host} (${nb.why}). Go ahead, and its agent reads it through ${nb.route} instead.`, check: "", label: `${nb.name}: its API, not the browser`, api: nb.host, say: apiRoute(nb) };
  if (n.kind === "approve" && draftRun(path)) return null; // a drafted reply: its card shows it and sends it (watch.mjs draftCard)
  // signing in to, linking or doing by hand on a platform that's linked: the agent's, not yours
  if (n.kind !== "approve" && linkedChore(`${n.label} ${n.what} ${n.check}`, linkedIds())) return null;
  // another lane's job (ops on a server, marketing posting): it went to that lane, not to you
  if (!n.waiting && lanesJob(`${n.label} ${n.what}`)) return null;
  // pasting or saving a secret the vault already holds: never the user's (its agent is told where it is)
  if (n.kind !== "approve") { const h = heldFor(`${n.label} ${n.what} ${n.check}`); if (h) { pastedStep(path, n.what, h, { held: true }); return null; } }
  // the user said "send it" from their own mail meanwhile: never "it's unsent" once Sent shows it (sentmail.mjs sentTick)
  const sent = sentAfter(path, n.what);
  n = { ...n, claim: n.what }; // its words as its run said them: what sentTick looks for in Sent (sentmail.mjs unsentNeeds)
  // …or another agent sent it (awaiting.json): the card says who, so the user hears it has gone
  const by = sent && sent.by ? (sent.by === "its own run" ? "Its own run already sent" : `Another agent (${sent.by}) already sent`) : "";
  if (sent) n = { ...n, sent, check: by ? `${by} "${sent.subject}"${sent.to ? ` to ${sent.to}` : ""}${sent.when ? ` at ${sent.when} UTC` : ""}: this may have gone already, so go ahead only if that's a different email.` : `Your Sent folder has "${sent.subject}"${sent.to ? ` to ${sent.to}` : ""}${sent.when ? `, sent ${sent.when}` : ""}, after its run said this was unsent: it may have gone already, so go ahead only if that's a different email.` };
  // the report the run wrote for you, linked from its card ("Read the report"); and when your newest
  // answer asked for a report first, the card only comes back once there's one, worded to point at it
  let rep = null; try { rep = runReport(path, { said: `${final}\n${n.what}\n${n.check}`, since: start - 60000, own: path.startsWith(ACT_DIR) }); } catch {}
  if (rep) n = { ...n, report: { id: rep.id, title: rep.title, file: rep.file } };
  if (!n.waiting && reportAsked(readSymbiot(path, "ANSWERS.md"))) {
    if (!rep) return null; // its run is writing it (homeAnswer told it to): asking again without it is the loop this ends
    if (!/^You asked for a report first/.test(n.what)) n = { ...n, what: `You asked for a report first: it's on Reports, "${clipWords(rep.title, 90)}". Once you've read it: ${n.what}`, reportFirst: true };
  }
  const key = digest(n.what);
  const settled = loadSettled();
  if (settled[path] === key || (Array.isArray(settled[ALL_SETTLED]) && settled[ALL_SETTLED].includes(key)) || takenUp(path, end)) return null;
  return { ...n, key };
}
const REPORT_WINDOW = 2 * 3600000; // a lane's run with no start known: a report from the 2 hours before it ended is its own

// ---- your AI reads the last words too ------------------------------------------
// leftToYou catches the ways runs have said it so far ("isn't sent", "only you can").
// A new way of saying it would slip by, so once a run ends your AI reads its last
// words for anything waiting on you, once per run's words (READ_FILE keeps what it
// found, by folder and words), and needsOf takes that when the patterns found
// nothing. Only for a run that asked nothing in QUESTIONS.md and isn't waiting on a
// step already: those show as they are.
const READ_FILE = join(CONFIG_DIR, "lastwords.json"), READ_KEEP = 300, READ_RETRY = 15 * 60000, READ_PER_TICK = 3, READ_MAX = 4000;
const loadRead = (file = READ_FILE) => { try { const o = JSON.parse(readFileSync(file, "utf8")); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; } };
const readKey = (path, final) => digest(path + "\n" + String(final || "").trim());
function readNeeds(path, final, { file = READ_FILE } = {}) {
  if (!String(final || "").trim()) return null;
  const r = loadRead(file)[readKey(path, final)];
  return r && r.what ? { kind: r.kind === "approve" || gitWork(r.what + " " + (r.check || "")) ? "approve" : "step", what: r.what, check: r.check || "", label: r.label || "", read: true } : null;
}
const READ_SYSTEM = `You read the last message a coding agent left when its run ended, and say whether it leaves the user something to do before the work is finished.
That's either something waiting for their OK before it happens (sending, posting, deleting, paying, closing, merging, publishing) or a step only they can take (signing in, a password or a 2FA code, sudo, a phone or a cable, a token from a provider's console, a choice that's theirs to make). Local git work (staging, committing, pulling, pushing) is never a step only they can take: an agent does it, so it's "approve", their OK before a push.
Not: work that's done, a summary of what changed, an idea they might like, changes waiting for review or Approve in Symbiot, a connector to sign in to again, a question already asked in QUESTIONS.md, or work another lane or agent does or was handed (ops on a server or an account, marketing posting, another repo's lane): that's theirs, never the user's, even when this run can't reach it.
Reply with JSON only, no markdown fence: {"needs": false} or {"needs": true, "kind": "approve" or "step", "what": "the sentence that says so, in its own words, under 240 characters", "check": "what it says to check first, or empty", "label": "what it is in 1 to 3 words, or empty"}.`;
function parseRead(raw) {
  const t = String(raw || ""), a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) return null;
  let o; try { o = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  if (!o || typeof o.needs !== "boolean") return null;
  if (!o.needs || !String(o.what || "").trim()) return { needs: false };
  const c = (x, n) => clipWords(String(x || "").replace(/\s+/g, " ").trim(), n);
  return { needs: true, kind: o.kind === "approve" ? "approve" : "step", what: c(o.what, 240), check: c(o.check, 240), label: c(o.label, 60) };
}
// One pass (the app runs it every minute): each run that ended in the last
// NEEDS_FOR, whose words neither the patterns nor your AI has read yet, a few at a
// time. Without an AI connected it does nothing. { read } (how many it asked about).
let reading = false; // one pass at a time: a slow model mustn't have the next minute's pass ask again
async function readLastWords(o = {}) {
  if (reading) return { read: 0, busy: true };
  reading = true; try { return await readPass(o); } finally { reading = false; }
}
// Each folder's newest finished run, with its last words as needsOf reads them:
// those this app started, then those from before it last started (runs.json).
function finishedRuns() {
  const out = [], seen = new Set();
  for (const e of HANDOFFS) {
    if (seen.has(e.path)) continue; seen.add(e.path); if (e.status === "running") continue;
    let tail = "", work = null; try { ({ tail, work } = workOf(e.path, readRunLog(e.log))); } catch {}
    out.push({ path: e.path, name: e.name, endedAt: e.endedAt, final: work ? tail : "" });
  }
  for (const r of loadRuns()) {
    if (seen.has(r.path)) continue; seen.add(r.path); if (runningHandoff(r.path)) continue;
    let end = 0; try { end = statSync(join(r.path, ".symbiot", "agent.log")).mtimeMs; } catch { continue; }
    out.push({ path: r.path, name: r.name, endedAt: end, final: lastFinal(r.path) });
  }
  return out;
}
async function readPass({ list, ask, connected, now = Date.now(), file = READ_FILE } = {}) {
  if (!ask) { const ai = await import("./ai.mjs"); if (!(connected ? connected() : ai.resolveProvider())) return { read: 0 }; ask = ai.write; }
  const store = loadRead(file), due = [];
  for (const a of list || finishedRuns()) {
    const final = String(a.final || "").trim();
    if (!final || now - (a.endedAt || now) > NEEDS_FOR || leftToYou(final)) continue;
    const k = readKey(a.path, a.final), had = store[k];
    if (had && !(had.error && now - had.at > READ_RETRY)) continue;
    if (waitingFor(a.path) || agentQuestions(a.path, a.name).questions.length) continue; // those show as they are
    due.push({ k, final });
  }
  for (const d of due.slice(0, READ_PER_TICK)) {
    let r = null; try { const said = await ask(READ_SYSTEM, `The run's last message:\n\n${String(d.final).trim().slice(-READ_MAX)}`, { kind: "read", check: parseRead }); r = parseRead(said && typeof said === "object" ? (said.error ? "" : said.text) : said); } catch {}
    store[d.k] = r ? { at: now, ...(r.needs ? { kind: r.kind, what: r.what, check: r.check, label: r.label } : {}) } : { at: now, error: true };
  }
  if (due.length) {
    const keys = Object.keys(store).sort((x, y) => store[y].at - store[x].at).slice(0, READ_KEEP), kept = {}; for (const k of keys) kept[k] = store[k];
    try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(file, JSON.stringify(kept), { mode: 0o600 }); } catch {}
  }
  return { read: Math.min(due.length, READ_PER_TICK) };
}

// ---- a step that's yours: wait for it -----------------------------------------
// An answer that picks a "👤 You:" option leaves a step for the user to do (put a
// key in .env, allow a command in Settings). Starting the agent before it's done
// only gets the same questions back. So answerQuestions reminds them the step is
// theirs, and Send answers & continue waits instead of starting: .symbiot/
// waiting.json keeps the step and how each file it names (in backticks, like
// `.env`) was then, and the agent command: a step done in Settings (Allow
// command, a connector) changes that, not a file, so it counts as done too, as
// it does for blocked.json. Once one of them changes, the next run goes ahead
// (startWaiting starts the one that was asked for); with neither changed, it
// waits for Start it now. Start it anyway (force) always goes ahead.
const WAITING = "waiting.json";
const yourStep = (a) => /👤/.test(String(a || ""));
// An answer in the user's own words that says to wait is their step too: "don't
// start another run until it's in", "hold off until I've added it", "not yet".
// It waits on the files the question's 👤 options named (the `.env` that "it"
// goes in), since the answer itself rarely names one. "That can wait" isn't one.
const HOLD = [
  /\b(?:don'?t|do not|never)\s+(?:start|run|send|launch|kick off|begin)\b/i,
  /\b(?:another|next|new|a) (?:run|agent)\b[^.]{0,60}\b(?:until|till|unless|before)\b/i,
  /\b(?:wait|hold(?: off| on| back)?|stop)\b[^.]{0,40}\b(?:until|till|for me to|before)\b/i,
  /^\s*not yet\b/i,
];
const holdAnswer = (a) => !yourStep(a) && HOLD.some((re) => re.test(String(a || "")));
// Asked for a run while one waits on a step of yours (a Send, a handover's
// result): it starts by itself once the step's done, as the note says.
function askedFor(path) {
  const f = join(path, ".symbiot", WAITING);
  try { const w = JSON.parse(readFileSync(f, "utf8")); if (w && !w.rerun) writeFileSync(f, JSON.stringify({ ...w, rerun: true })); } catch {}
}
// A step in Settings → Handoff: the note names the command as what it waits on.
// Not a site's own settings: "at app.lemonsqueezy.com … under Settings → API make a key" told the
// user the agent waited on its command in Settings → Handoff (19 Oct 2026).
const settingsStep = (s) => { s = String(s || ""); return /\bSettings\s*→\s*(?:Handoff|Connections)\b|\ballow\b|\bgrant|connector/i.test(s) || (/\bsettings\b/i.test(s) && !/\b[a-z0-9-]+\.(?:com|co|io|net|org|app|dev|ai)\b/i.test(s)); };
// The command the folder's next run would get, connectors and folders and all, before
// its model and stream flags (runHandoff adds those): what blocked.json and waiting.json
// are keyed on. noteBlocked hashed the whole command and blockedAgain the bare template,
// so they never matched and continueLanes' "don't loop" guard was dead (15 Oct 2026).
const runCmdOf = (path, tmpl = handoffCmd()) => withScope(withConnectors(tmpl, path), path);
const runCmd = (path) => digest(runCmdOf(path));
// The files a step names, in backticks: `.env`, `~/.termux/termux.properties`,
// `.claude/settings.json`. Not a command (`npm test`), a site (`web.whatsapp.com`,
// unless there's a file by that name) or a path that can't be one here.
function namedFiles(text, dir) {
  const out = [];
  for (const m of String(text || "").matchAll(/`([^`\s]+)`/g)) {
    const t = m[1].replace(/[.,:;]+$/, ""), first = t.replace(/^~?\//, "").split("/")[0];
    if (/:\/\//.test(t) || !/[./]/.test(t) || /^[@\d]/.test(t) || /^\.{1,2}\/?$/.test(t)) continue;
    const p = t.startsWith("~/") ? join(homedir(), t.slice(2)) : t.startsWith("/") ? t : join(dir, t);
    const dotted = first.startsWith(".") && first !== "." && first !== "..";
    const host = !dotted && /\./.test(first) && !t.startsWith("~/") && !t.startsWith("/");
    if (existsSync(p) || (!host && (dotted || existsSync(dirname(p))))) out.push({ name: t, path: p });
  }
  return out.filter((f, i) => out.findIndex((g) => g.path === f.path) === i).slice(0, 5);
}
const fileSig = (p) => { try { const s = statSync(p); return s.mtimeMs + ":" + s.size; } catch { return "none"; } };
// A step of yours that names files: the ones it names, if none has changed since
// `since` (the run that asked ended), each { name, at: its last change, 0 if it
// isn't there }; [] when it names none or one has changed. Done on its card started
// a run told "Done: the user did it" while the `.env` it named was last changed on
// 2026-10-06, days before the run asked.
function unchangedStep(text, dir, since) {
  const files = namedFiles(text, dir).map((f) => { let at = 0; try { at = statSync(f.path).mtimeMs; } catch {} return { name: f.name, at }; });
  return files.length && !files.some((f) => f.at > since) ? files : [];
}
// What a folder is waiting on: { step, files: [names], cmd, at, rerun }, or null
// once a file it names, or the agent command, has changed. Then waiting.json
// goes, unless a run was asked for: startWaiting needs it to start that one (the
// Agents tab asks this every few seconds, and used to lose it first), and the
// run deletes it as it starts. cmd: the step is one in Settings, so the note says
// the command counts.
// A step with no card left to act on holds nothing back: Skip on its card (settled), Done
// recorded for it, its card dismissed (home.mjs, through onCardGone), past NEEDS_FOR, or
// not yours after all (needsOf null). The symbiot lane sat behind "your step comes first"
// with no card on Home, and every task in it lit as waiting on you (19 Oct 2026).
let cardGone = () => false; const onCardGone = (fn) => { cardGone = fn; };
// How a run gets a secret from the vault: a sandboxed one can't read it, so it hands the step to ops.
const VAULT_READ = "read it with `symbiot secret get \"<name>\"` and use it only from there, never in a file, a report or a log. A sandboxed run can't read the vault: hand the step that uses it to ops";
function pastedStep(path, step, name, { held = false } = {}) {
  const what = String(step).replace(/^\s*👤\s*(You\s*(\([^)]*\))?:)?\s*/, "").trim(), head = `### ${clipWords(what, 200)}`;
  const said = `${held ? "Not the user's step: Symbiot already holds it" : "Done: the user pasted it on Home, and it's"} in Symbiot's vault as "${name}". ${VAULT_READ.replace("<name>", name).replace(/^./, (c) => c.toUpperCase())}. Never ask the user to paste or save it again.`;
  try { const had = readSymbiot(path, "ANSWERS.md"); if (!had.includes(said)) writeFileSync(join(path, ".symbiot", "ANSWERS.md"), `${(had || "# Answers\n").replace(/\s*$/, "")}\n\n${head}\n${said}\n_answered ${new Date().toISOString().slice(0, 10)}_\n`); } catch {}
  try { recordDone(clipWords(what, 240), said, whereOf(path).lane); } catch {}
}
function stepGone(path, w) {
  const n = needsOf(path, { waiting: w, end: w.at || Date.now() });
  return !n || isDone(n.what) || !!cardGone(path, n.what);
}
function waitingFor(path) {
  let w = null; try { w = JSON.parse(readSymbiot(path, WAITING)); } catch {}
  if (!w || typeof w.step !== "string") return null;
  const files = Array.isArray(w.files) ? w.files : [];
  // ...and one asking for a key or password you've since pasted (saved to the vault after it began) is done:
  // its agent is told where the key is, and the step is on the shared record, so nobody asks for it again
  const met = meetsStep(w.step, w.at || 0), held = !met && heldFor(w.step); if (met || held) pastedStep(path, w.step, met || held, { held: !!held });
  if (files.some((f) => f && fileSig(f.path) !== f.sig) || (w.cmd && runCmd(path) !== w.cmd) || met || held || stepGone(path, w)) { if (!w.rerun) try { unlinkSync(join(path, ".symbiot", WAITING)); } catch {} return null; }
  return { step: w.step, files: files.map((f) => f.name), cmd: !!w.cmd && settingsStep(w.step), at: w.at || 0, rerun: !!w.rerun };
}
// A run is still on its job while it runs, and while it waits: on the user's answer (an open
// question), a step of theirs (waiting.json) or an item it marked [~]. A run that waits isn't
// running, so "Adds to run act-ab2bbaf1" started a run of its own beside it, and both put
// test cards on the user's phone (21 Oct 2026).
function runOpen(path, { running = runningHandoff, waiting = waitingFor } = {}) {
  path = String(path || ""); if (!path || !existsSync(join(path, ".symbiot"))) return false;
  if (running(path)) return true;
  try { if (waiting(path)) return true; } catch {}
  if (WAITING_TASK_LINE.test(readSymbiot(path, "TASKS.md"))) return true;
  try { return agentQuestions(path, "").questions.length > 0; } catch { return false; }
}
const WAITING_TASK_LINE = /^\s*(?:[-*+]|\d+[.)])\s*\[~\]/m;
// The ops run a request names by its folder (act-…, as a HANDOFF.md's Sent list or a report's path gives it),
// while it's still on its job (runOpen): "" when it names none, or only runs that have finished.
function namedRun(text, opts = {}) {
  for (const n of new Set(String(text || "").match(/\bact-[0-9a-f]{8}\b/g) || [])) { const p = join(ACT_DIR, n); if (runOpen(p, opts)) return p; }
  return "";
}
// "`.env` or the agent command in Settings → Handoff", what a wait ends on ("" if neither).
function waitOn(files, cmd) {
  const names = files.map((f) => "`" + f + "`").join(" or ");
  return cmd ? (names ? names + " or " : "") + "the agent command (Settings → Handoff)" : names;
}
function waitNote(w) {
  const on = waitOn(w.files, w.cmd);
  return `Not started: your step comes first: ${w.step.replace(/^\s*👤\s*(You:)?\s*/, "")} ${on ? `Your agent starts once ${on} changes. Done it some other way? Click Start it now.` : "Once it's done, click Start it now (or Start it anyway)."}`;
}
// Runs that waited for a file of yours (or the agent command), and were asked
// for, start once it changes. The app calls this every so often. Returns the jobs started.
function startWaiting() {
  const started = [];
  try { urgentSweep(); } catch {}
  for (const r of loadRuns()) {
    let w = null; try { w = JSON.parse(readSymbiot(r.path, WAITING)); } catch {}
    if (!w || !w.rerun || !Array.isArray(w.files) || !(w.files.length || w.cmd) || runningHandoff(r.path)) continue;
    if (waitingFor(r.path)) continue; // nothing it names, nor the command, has changed yet
    const e = runHandoff(r.path); if (e && !e.busy && !e.blocked) started.push(e);
  }
  return started;
}
// ---- a run that would only report the same blockers again -------------------
// A run that ends having asked questions (QUESTIONS.md written during it, some
// still unanswered) with tasks left unticked is blocked on the user: noteBlocked
// keeps what it ran with in .symbiot/blocked.json. Another run on the same
// inputs could only say the same things again, so blockedAgain refuses one
// until something it could act on changes: .env (the values it asked for),
// ANSWERS.md, the agent command (a grant, a connector) or a task it didn't have.
// Only what's in ANSWERS.md for it counts: Symbiot's own notes there (what a
// handover came back with, an answer to another lane shared only as background)
// read as news to the hash though the user said nothing, and every one started
// a waiting lane again (the 14 Oct 2026 audit). A handover that settled something
// starts the asker itself (lanes.mjs report).
// A run that asked nothing but came up empty (it ticked nothing and changed no
// file: "it waits on the bookly lane / the number switch / your approval") is
// held the same way: before, only a question made a record, so every later
// trigger started it again to say the same (most of the audit's 143 repeats).
const BLOCKED = "blocked.json";
const digest = (s) => createHash("sha1").update(String(s)).digest("hex").slice(0, 16);
const openTasks = (path) => readSymbiot(path, "TASKS.md").split("\n").filter((l) => /^\s*-\s*\[ \]/.test(l)).map((l) => taskWords(l.replace(/^\s*-\s*\[ \]\s*/, ""))).filter(Boolean);
const SYMBIOT_NOTE = /^_(?:answered by symbiot \(handover\)|symbiot \(handover\)|shared by Symbiot [^\n]*\(background\))/m;
const userAnswers = (md) => String(md || "").split(/\n(?=### )/).filter((sec) => /^### /.test(sec) && !SYMBIOT_NOTE.test(sec)).join("\n"); // its title line differs by who made the file
// ---- old answers, archived -------------------------------------------------
// ANSWERS.md only ever grew (62k characters in this repo, 81k in bookly), and every run
// was told to read all of it before asking anything (the audit, 2026-10-14). Before a run
// starts, all but the last ANSWERS_KEEP answers, and any from the last day, move to
// ANSWERS.archive.md, word for word, which the brief says to search when an older answer
// may be there. Nothing that reads the answers loses one: the archive counts too (allAnswers),
// in the same order, so the "nothing changed since" check (runInputs) sees the same answers,
// and ANSWERS.md keeps its time, so the move isn't news either (nothingToDo, waitingFor).
// Not a draft's or ops's folder: those are short-lived, and Send reads their answers whole.
const ANSWERS_ARCHIVE = "ANSWERS.archive.md", ANSWERS_KEEP = 15, ANSWERS_ARCHIVE_AT = 12000, ANSWERS_FRESH = 86400000;
const answerSections = (md) => { const parts = String(md || "").split(/\n(?=### )/); return { head: /^### /.test(parts[0] || "") ? "" : parts.shift(), sections: parts }; };
const sectionDay = (sec) => { const m = [...String(sec).matchAll(/^_[^\n]*?(?<!\d)(20\d\d-\d\d-\d\d)(?!\d)[^\n]*_\s*$/gm)].pop(); return m ? Date.parse(m[1]) : 0; };
function archiveAnswers(path, now = Date.now()) {
  if (!path || path.startsWith(ACT_DIR)) return 0;
  const f = join(path, ".symbiot", "ANSWERS.md"); let md = "", st = null;
  try { st = statSync(f); if (st.size < ANSWERS_ARCHIVE_AT) return 0; md = readFileSync(f, "utf8"); } catch { return 0; }
  const { head, sections } = answerSections(md), cut = sections.length - ANSWERS_KEEP; if (cut <= 0) return 0;
  // only a run of the oldest moves, so the two files read in order are the answers as they were
  let n = 0; while (n < cut && now - sectionDay(sections[n]) > ANSWERS_FRESH) n++;
  if (!n) return 0;
  const move = sections.slice(0, n), keep = sections.slice(n);
  const af = join(path, ".symbiot", ANSWERS_ARCHIVE), had = answerSections(readSymbiot(path, ANSWERS_ARCHIVE));
  const archHead = had.head || "# Older answers from the user\nMoved here from ANSWERS.md, oldest first. They still hold: search here when an answer may be older than what ANSWERS.md has.\n";
  try {
    writeFileSync(af, [archHead, ...had.sections, ...move].join("\n"));
    writeFileSync(f, [head || "# Answers from the user\n", ...keep].join("\n"));
    utimesSync(f, st.atime, st.mtime);
  } catch { return 0; }
  return move.length;
}
// Every answer this folder has had, the archived ones first (as they were in ANSWERS.md).
const allAnswers = (path) => { const a = readSymbiot(path, ANSWERS_ARCHIVE), m = readSymbiot(path, "ANSWERS.md"); return a ? `${a}\n${m}` : m; };
const answersDigest = (path) => digest([userAnswers(readSymbiot(path, ANSWERS_ARCHIVE)), userAnswers(readSymbiot(path, "ANSWERS.md"))].filter(Boolean).join("\n"));
function runInputs(path, cmd) {
  let files = [], env = ""; try { files = readdirSync(path).filter((f) => /^\.env(\..+)?$/.test(f) && !/\.(example|sample|template)$/.test(f)).sort(); } catch {}
  for (const f of files) { try { env += f + "\0" + readFileSync(join(path, f), "utf8") + "\0"; } catch {} }
  return { env: digest(env), answers: answersDigest(path), cmd: digest(cmd), open: openTasks(path) };
}
const MTIME_SLACK = 50; // ms: a kernel tick is 4-10 ms
function noteBlocked(path, cmd, startedAt, code, { dirtyBefore = null, ticksBefore = null, after: leftNow = () => dirtyState(path) } = {}) {
  const f = join(path, ".symbiot", BLOCKED);
  // file times come from the kernel's coarse clock, a few ms behind Date.now(): a run that
  // asks at once can stamp QUESTIONS.md "before" it started; a run before it is far older
  let asked = false; try { asked = statSync(join(path, ".symbiot", "QUESTIONS.md")).mtimeMs >= startedAt - MTIME_SLACK; } catch {}
  const questions = asked ? agentQuestions(path, "").questions.length : 0, inputs = runInputs(path, cmd);
  // came up empty: no new tick, and git says no file changed (unknown either way: not held)
  const empty = !questions && code === 0 && inputs.open.length > 0 && ticksBefore != null && ticksIn(readSymbiot(path, "TASKS.md")) <= ticksBefore
    && !!dirtyBefore && (() => { const after = leftNow(); return !!after && JSON.stringify(after) === JSON.stringify(dirtyBefore); })();
  // an empty run that said when to look again ("at 08:50", "once the switch is live": work.mjs
  // waitUntil) is held until then, and not a moment less; one that didn't, until something changes.
  // One that wrote files but ticked nothing and asked nothing is held too when it named a time
  // ("the next reading is 22 Oct"): a report or a tool it wrote made it never "empty", so the
  // marketing 4-week test ran 17 times on 19 Oct (review of 20 Oct 2026, finding 5)
  const idle = !questions && code === 0 && inputs.open.length > 0 && ticksBefore != null && ticksIn(readSymbiot(path, "TASKS.md")) <= ticksBefore;
  let until = 0, dated = false;
  if (empty || idle) try { const t0 = Date.now(), u = waitUntil(parseRun(lastRunText(readSymbiot(path, "agent.log"))).final, t0); if (empty) until = u; else if (u && u !== t0 + RECHECK) { until = u; dated = true; } } catch {}
  try {
    if (code === 0 && (questions || empty || dated) && inputs.open.length) writeFileSync(f, JSON.stringify({ at: Date.now(), questions, ...(empty ? { empty: true } : {}), ...(dated ? { dated: true } : {}), ...(until ? { until } : {}), ...inputs }));
    else unlinkSync(f);
  } catch {}
}
const atWhen = (t) => new Date(t).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
function blockedAgain(path, cmd, { now = Date.now() } = {}) {
  let b = null; try { b = JSON.parse(readSymbiot(path, BLOCKED)); } catch {}
  if (!b || !Array.isArray(b.open)) return null;
  if (b.until && now >= b.until) return null; // the time it said to look again has come
  const cur = runInputs(path, cmd), was = new Set(b.open);
  if (cur.env !== b.env || cur.answers !== b.answers || cur.cmd !== b.cmd || !cur.open.length || cur.open.some((t) => !was.has(t))) return null;
  const n = b.questions || 0, them = n === 1 ? "it" : "them";
  if (b.dated) return { blocked: true, questions: 0, dated: true, until: b.until, note: `Not started: the last run here said to look again at ${atWhen(b.until)}, so it waits till then. It starts sooner if you answer it, change .env or give it a new task, or when work it handed to another lane is done.` };
  if (b.empty) return { blocked: true, questions: 0, empty: true, ...(b.until ? { until: b.until } : {}), note: `Not started: the last run here finished nothing and changed no file, and nothing it could act on has changed since (.env, your answers, its tasks), so another run would stop in the same place. It starts again ${b.until ? `at ${atWhen(b.until)}, when it said to look again, or earlier ` : ""}when one of those changes, or when work it handed to another lane is done.` };
  return { blocked: true, questions: n, note: `Not started: the last run here stopped on ${n} question${n === 1 ? "" : "s"}, and .env and ANSWERS.md haven't changed since, so another run would only ask again. Answer ${them} or change .env, then send again.` };
}
const LOCK = "agent.pid";
const LOCK_MAX_AGE = 12 * 3600 * 1000; // no sign of life for this long: the pid has probably been reused
// A run's last sign of life: its start, the lock the app touches every minute while
// the run's alive (runsTick), or its log. A fixed 12 hours from the start took a real
// run that long for a dead one, and mergeEnded could merge its worktree from under it.
function lockBeat(path, l) {
  let t = Number(l.startedAt) || 0;
  for (const f of [LOCK, "agent.log"]) try { t = Math.max(t, statSync(join(path, ".symbiot", f)).mtimeMs); } catch {}
  return t;
}
const pidAlive = (pid) => { try { return Number.isInteger(pid) && pid > 0 && (process.kill(pid, 0) || true); } catch (err) { return !!err && err.code === "EPERM"; } };
// Claim a folder for a run about to start: the lock written first ({ claim, owner, startedAt },
// wx: never over a live one), replaced by the run's pid once it's spawned. A claim whose owner
// is gone, or older than CLAIM_MAX, is stale and taken over. true when it's ours.
const CLAIM_MAX = 60000;
function claimLock(lock, now = Date.now()) {
  for (let i = 0; i < 2; i++) {
    let fd = null; try { mkdirSync(dirname(lock), { recursive: true }); fd = openSync(lock, "wx"); writeSync(fd, JSON.stringify({ claim: true, owner: process.pid, startedAt: now })); closeSync(fd); return true; } catch (e) { if (fd != null) try { closeSync(fd); } catch {} if (!e || e.code !== "EEXIST") return false; }
    let l = null; try { l = JSON.parse(readFileSync(lock, "utf8")); } catch {}
    const live = l && (l.claim ? pidAlive(l.owner) && now - (l.startedAt || 0) < CLAIM_MAX : Number.isInteger(l.pid) && pidAlive(l.pid) && !pidReused(l.pid, l.startedAt) && now - lockBeat(dirname(dirname(lock)), l) < LOCK_MAX_AGE);
    if (live) return false;
    try { unlinkSync(lock); } catch {}
  }
  return false;
}
// A lock's pid that now belongs to a process started after the lock was written was
// reused: the agent is gone, and a lane held "busy" by it starts nothing (queued tasks
// stalled with 0 agents working). Linux only (/proc); anywhere else, or unreadable, it
// counts as the agent.
function pidReused(pid, startedAt) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8"), ticks = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]);
    const btime = Number((readFileSync("/proc/stat", "utf8").match(/^btime (\d+)/m) || [])[1]);
    if (!Number.isFinite(ticks) || !btime || !Number.isFinite(startedAt)) return false;
    return (btime + ticks / 100) * 1000 > startedAt + 60000; // a minute's slack for clock ticks and the lock being written after the spawn
  } catch { return false; }
}
// The agent still running in this folder, if any. `auto`: its exit will be
// seen (this process started it, or its owner — e.g. the app — is still up).
// `symbiot push --open` returns right after starting one, so it never is.
function runningHandoff(path) {
  const e = HANDOFFS.find((x) => x.handoff && x.path === path && x.status === "running");
  if (e) return { id: e.id, pid: e.pid, startedAt: e.startedAt, auto: true };
  try {
    const l = JSON.parse(readSymbiot(path, LOCK));
    if (l && l.claim) return pidAlive(l.owner) && Date.now() - (l.startedAt || 0) < CLAIM_MAX ? { id: "", pid: null, startedAt: l.startedAt, auto: true, claim: true } : null; // about to start (claimLock)
    if (l && Number.isInteger(l.pid) && Date.now() - lockBeat(path, l) < LOCK_MAX_AGE && pidAlive(l.pid) && !pidReused(l.pid, l.startedAt)) return { ...l, auto: Number.isInteger(l.owner) && pidAlive(l.owner) };
  } catch {}
  return null;
}
// ---- runs that hang, and runs that ended while the app was down --------------
// A hung `claude` (no output at all for HANG_MIN minutes) held its lane for as long
// as the app ran: the 20-minute stall (work.mjs STALL_MS) only showed on its block.
// runsTick, every minute: a run whose log hasn't changed for that long is stopped,
// its whole process group (track starts it detached), SIGTERM then SIGKILL, and its
// log says why. config.runHangMinutes sets the time (45 by default: a single command
// an agent waits on can run 10 minutes, a build it waits on longer). A live one's
// lock is touched, its heartbeat (lockBeat).
// What a run's exit records (which files it touched, for Approve; the tasks held
// for after it; the allow-list it proposed) lived only in the app's memory, so a
// restart mid-run skipped all of it, and Approve could leave that run's files out.
// So it's on disk too (.symbiot/run-start.json), and once the run's pid is gone with
// no exit seen, runsTick does the same bookkeeping from it.
const RUN_START = "run-start.json", HANG_MIN = 45, START_MAX_FILES = 20000;
function saveRunStart(path, e, dirtyBefore, ticksBefore) {
  if (dirtyBefore && Object.keys(dirtyBefore).length > START_MAX_FILES) dirtyBefore = null; // a tree that big: not worth a file every run
  try { writeJsonAtomic(join(path, ".symbiot", RUN_START), { id: e.id, pid: e.pid, startedAt: e.startedAt, owner: process.pid, dirtyBefore, ticksBefore }, { indent: 0 }); } catch {}
}
function forgetRunStart(path, id) { try { const f = join(path, ".symbiot", RUN_START), r = JSON.parse(readFileSync(f, "utf8")); if (!id || r.id === id) unlinkSync(f); } catch {} }
const hangMs = () => (Number(loadConfig().runHangMinutes) || HANG_MIN) * 60000;
const STOPPING = new Map(); // pid -> when it was told to stop
function stopGroup(pid, kill) { try { kill(-pid, "SIGTERM"); } catch { try { kill(pid, "SIGTERM"); } catch {} } }
const stallMs = () => (Number(loadConfig().runStallMinutes) || STALL_MIN) * 60000;
const WORKTREES = join(CONFIG_DIR, "worktrees"); // a run beside the lane's own (parallel.mjs): its exit merges it back, the lane takes the rest
function runsTick({ now = Date.now(), kill = (p, sig) => process.kill(p, sig), hang = hangMs(), stall = stallMs(), start = (p) => runHandoff(p, { force: true, stalled: true }), park = parkLane } = {}) {
  const out = { stopped: [], killed: [], recovered: [], stalled: [], restarted: [] };
  const mine = new Map(HANDOFFS.filter((e) => e.handoff && e.status === "running").map((e) => [e.path, e]));
  const paths = new Set([...mine.keys(), ...loadRuns().map((r) => r.path)]);
  for (const path of paths) {
    let l = null; try { l = JSON.parse(readSymbiot(path, LOCK)); } catch {}
    if (l && l.claim) { if (!(pidAlive(l.owner) && now - (l.startedAt || 0) < CLAIM_MAX)) try { unlinkSync(join(path, ".symbiot", LOCK)); } catch {} continue; } // a start under way, or a claim its process never followed up
    const pid = l && Number.isInteger(l.pid) ? l.pid : (mine.get(path) || {}).pid;
    const live = Number.isInteger(pid) && pidAlive(pid) && !(l && pidReused(pid, l.startedAt));
    if (live) {
      let quiet = 0; try { quiet = now - Math.max(statSync(join(path, ".symbiot", "agent.log")).mtimeMs, Number((l || mine.get(path) || {}).startedAt) || 0); } catch {}
      const told = STOPPING.get(pid);
      if (told) { if (now - told > 15000) { try { kill(-pid, "SIGKILL"); } catch { try { kill(pid, "SIGKILL"); } catch {} } out.killed.push(path); } continue; }
      // no new step for too long, while its log may still grow (thinking, a call's heartbeat): stall.mjs
      let w = null; try { w = parseRun(lastRunText(readRunLog(join(path, ".symbiot", "agent.log")))); } catch {}
      const stuck = stalledFor(w, { now, startedAt: Number((l || mine.get(path) || {}).startedAt) || 0, stallMs: stall, hangMs: hang });
      if (stuck) {
        const rec = onStall(path, { work: w, tasksMd: readSymbiot(path, "TASKS.md"), run: String((l || mine.get(path) || {}).id || ""), quiet: stuck, now });
        if (rec.card) try { park(path, true); } catch {} // stalled again: nothing starts it until you say (Home's card)
        STOPPING.set(pid, now); stopGroup(pid, kill); out.stopped.push(path); out.stalled.push(path);
        continue;
      }
      if (quiet > hang) {
        STOPPING.set(pid, now); stopGroup(pid, kill); out.stopped.push(path);
        try { appendFileSync(join(path, ".symbiot", "agent.log"), `\n=== stopped by Symbiot ${new Date(now).toISOString()}: no output for ${Math.round(quiet / 60000)} minutes, so it was taken for hung ===\n`); } catch {}
        continue;
      }
      if (l) try { utimesSync(join(path, ".symbiot", LOCK), new Date(now), new Date(now)); } catch {}
      continue;
    }
    if (Number.isInteger(pid)) STOPPING.delete(pid);
    if (mine.has(path)) continue; // its exit is this app's to see: the exit handler does the rest
    let r = null; try { r = JSON.parse(readSymbiot(path, RUN_START)); } catch {}
    if (!r || !Number.isInteger(r.pid) || pidAlive(r.pid) && !pidReused(r.pid, r.startedAt)) continue;
    if (Number.isInteger(r.owner) && r.owner !== process.pid && pidAlive(r.owner)) continue; // another app is still up and sees its exit
    try { if (l && l.pid === r.pid) unlinkSync(join(path, ".symbiot", LOCK)); } catch {}
    forgetRunStart(path, r.id);
    try { if (r.dirtyBefore) noteRunFiles(path, { id: r.id, startedAt: r.startedAt }, r.dirtyBefore, Number(r.ticksBefore) || 0); } catch {}
    try { autoAllow(path); } catch {}
    try { startHeldTasks(path); } catch {}
    out.recovered.push(path);
  }
  // a run stopped for stalling the first time: started again once, fresh, with the note on where it stuck
  for (const path of paths) {
    const rec = loadStall(path); if (!rec || !rec.restart) continue;
    const busy = runningHandoff(path);
    if (busy) { if (busy.id && busy.id !== rec.run) saveStall(path, { ...rec, restart: false, restarted: now, rerun: busy.id }); continue; } // the stalled one still stopping, or something else started it (its note's in ANSWERS.md)
    let e = null; if (!path.startsWith(WORKTREES + "/")) try { e = start(path); } catch {}
    if (e && e.shipping) continue; // Approve is putting the lane's changes in: next minute
    saveStall(path, { ...rec, restart: false, restarted: now, ...(e && e.id ? { rerun: e.id } : {}) });
    if (e && e.id && !e.blocked) out.restarted.push(path);
  }
  // and the list itself: entries whose folder is gone with nothing running in it (pruneRuns)
  const runs = loadRuns(), kept = pruneRuns(runs);
  if (kept.length !== runs.length) { try { writeJsonAtomic(RUNS_FILE, kept, { mode: 0o600 }); out.pruned = runs.length - kept.length; } catch {} }
  return out;
}
// ---- the untracked files that were there before the agent ran ---------------
// Approve stages only a run's own changes (tasks.mjs taskPaths), so the first run
// since the last approve notes the untracked files already in the folder:
// .symbiot/untracked.json, { at, files }. Approve forgets it once it commits.
// Listed in the background: in a big tree (scratch's 170k files) that takes a
// while, and a file the agent writes meanwhile is newer than `at`, so it counts
// as the agent's anyway. Not a git repo: no note.
const UNTRACKED = "untracked.json";
function noteUntracked(path) {
  const f = join(path, ".symbiot", UNTRACKED); if (existsSync(f)) return;
  const at = Date.now(), out = [], p = spawn("git", ["-C", path, "ls-files", "--others", "--exclude-standard", "-z"], { stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  p.on("error", () => {}); p.stdout.on("data", (d) => out.push(d));
  p.on("close", (code) => {
    if (code !== 0 || existsSync(f)) return;
    const files = Buffer.concat(out).toString("utf8").split("\0").filter((x) => x && !x.startsWith(".symbiot/"));
    try { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify({ at, files })); } catch {}
  });
}
// ---- the files each run touched ---------------------------------------------
// .symbiot/runfiles.json: [{ id, startedAt, endedAt, ticked, files }], one per run
// that finished here since the last approve. files are the paths whose state
// (mtime + size) differs after the run from before it (any edit changes both); ticked is how many TASKS.md items it newly ticked. Approve
// (tasks.mjs taskPaths) stages only the files of runs that ticked something, so
// two runs sharing a folder don't ship each other's unfinished work.
const RUNFILES = "runfiles.json";
// Not a git repo (an ops folder, marketing's): what's in the folder instead, by name and
// state, Symbiot's own bookkeeping aside, so a run there that changed nothing is held
// the same way. Before, only git could say, and every ops run that came up empty was
// started again on every trigger (one ran 10 times for $21, 15 Oct 2026).
const OWN_FILES = new Set(["agent.log", "agent.log.old", "agent.pid", "run-start.json", "session.json", "blocked.json", "runfiles.json", "untracked.json", "handed.json", "waiting.json", "autoallow.json", "answers-seen.json", "handoff.json", "par.json"]);
const FOLDER_MAX = 2000, FOLDER_DEPTH = 3;
function folderState(path) {
  const out = {}; let n = 0;
  const walk = (dir, rel, depth) => {
    let names = []; try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of names) {
      if (n++ > FOLDER_MAX) return;
      const name = d.name, r = rel ? rel + "/" + name : name;
      if (rel === ".symbiot" && OWN_FILES.has(name)) continue;
      if (!rel && (name === ".git" || name === "node_modules")) continue;
      if (d.isDirectory()) { if (depth < FOLDER_DEPTH) walk(join(dir, name), r, depth + 1); continue; }
      try { const st = statSync(join(dir, name)); out[r] = st.mtimeMs + ":" + st.size; } catch {}
    }
  };
  walk(path, "", 0);
  return out;
}
function dirtyState(path) {
  const r = spawnSync("git", ["-C", path, "status", "--porcelain", "-z", "-uall", "--", ".", ":(exclude).symbiot"], { encoding: "utf8", timeout: 30000, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (r.error || r.status !== 0) return existsSync(join(path, ".git")) ? null : folderState(path);
  const parts = String(r.stdout || "").split("\0"), out = {};
  for (let i = 0; i < parts.length; i++) {
    const l = parts[i]; if (l.length < 4) continue;
    if (/^[RC]/.test(l)) i++; // a rename's old path
    const f = l.slice(3); let sig = "gone"; try { const st = statSync(join(path, f)); sig = st.mtimeMs + ":" + st.size; } catch {}
    out[f] = sig;
  }
  return out;
}
const ticksIn = (md) => (String(md || "").match(/^\s*-\s*\[x\]/gim) || []).length;
function loadRunFiles(path) { try { const a = JSON.parse(readSymbiot(path, RUNFILES)); return Array.isArray(a) ? a.filter((r) => r && Array.isArray(r.files)) : []; } catch { return []; } }
function saveRunFiles(path, list) { const f = join(path, ".symbiot", RUNFILES); try { if (list.length) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(list)); } else unlinkSync(f); } catch {} }
// A run ended: what it changed against the state noted when it began (before, from
// dirtyState; null when git couldn't say, and then no record is made).
function noteRunFiles(path, run, before, ticksBefore, leftNow = () => dirtyState(path)) {
  const after = before && leftNow(); if (!after) return;
  const files = new Set(Object.keys(after).filter((f) => before[f] !== after[f]));
  for (const f of Object.keys(before)) if (!(f in after)) files.add(f); // reverted or committed by the run itself
  const ticked = Math.max(0, ticksIn(readSymbiot(path, "TASKS.md")) - ticksBefore);
  saveRunFiles(path, [...loadRunFiles(path).filter((r) => r.id !== run.id), { id: run.id, startedAt: run.startedAt, endedAt: Date.now(), ticked, files: [...files].sort() }]);
}
// Approve committed these paths: they're no longer any run's to ship.
function forgetRunFiles(path, paths) {
  const gone = new Set(paths);
  saveRunFiles(path, loadRunFiles(path).map((r) => ({ ...r, files: r.files.filter((f) => !gone.has(f)) })).filter((r) => r.files.length));
}
function untrackedBefore(path) { try { const u = JSON.parse(readSymbiot(path, UNTRACKED)); return u && Array.isArray(u.files) && Number.isFinite(u.at) ? u : null; } catch { return null; } }
function forgetUntracked(path) { try { unlinkSync(join(path, ".symbiot", UNTRACKED)); } catch {} }
// Send to repos while an agent is still running in the folder doesn't rewrite
// the TASKS.md it's working from: the new brief waits in TASKS.next.md and
// replaces TASKS.md once that agent exits. Returns true if it was held.
const HELD = "TASKS.next.md";
// A new brief keeps the [~] marks of the one it replaces: a task waiting on ops or a reply
// came back open in the next brief, and the lane started again on a wait it couldn't end.
// A task queued since the last brief is new work (fresh: its texts), so it goes in open even
// when a waiting item reads like it; and the user's Start for one lane (reopen) opens every
// wait, the agent's note kept, so its agent starts and checks whether the wait is over. Two
// tasks of one lane marked [~] sat as "didn't start (every task is ticked)", retried and
// refused every 5 minutes, while the Workdesk said Go starts them (22 Oct 2026).
function carryWaiting(was, md, { fresh = [], reopen = false } = {}) {
  const waits = String(was || "").split("\n").filter((l) => WAITING_TASK.test(l)).map((l) => ({ k: l.replace(WAITING_TASK, "").trim().toLowerCase(), line: l.trimStart() }));
  if (!waits.length) return md;
  return String(md).split("\n").map((l) => {
    if (!/^\s*-\s*\[ \]/.test(l)) return l;
    const k = l.replace(/^\s*-\s*\[ \]\s*/, "").trim().toLowerCase(); if (fresh.some((f) => sameTask(f, k))) return l;
    const w = waits.find((x) => x.k.startsWith(k) || sameTask(x.k, k));
    return !w ? l : l.match(/^\s*/)[0] + (reopen ? w.line.replace(WAITING_TASK, "- [ ] ") : w.line);
  }).join("\n");
}
// What a lane's TASKS.md says a task waits on ("" when it isn't marked [~]): the item's
// "(waits on: …)" note, or the whole line when it has none.
function waitingTask(path, text) {
  const k = String(text || "").trim().toLowerCase(); if (!k) return "";
  const l = readSymbiot(path, "TASKS.md").split("\n").find((x) => { if (!WAITING_TASK.test(x)) return false; const t = x.replace(WAITING_TASK, "").trim().toLowerCase(); return t.startsWith(k) || sameTask(t, k); });
  if (!l) return "";
  const what = l.replace(WAITING_TASK, "").trim(), at = [...what.matchAll(/\((?:waits|waiting) (?:on|for)\b:?\s*/gi)].pop(); // the newest note, nested brackets and all
  return clipWords(at ? what.slice(at.index + at[0].length).replace(/\)\s*$/, "").replace(/[*`]/g, "").trim() : what, 160);
}
function writeTasks(path, md, { fresh = [], reopen = false } = {}) {
  const dir = join(path, ".symbiot"); mkdirSync(dir, { recursive: true });
  if (runningHandoff(path)) { writeFileSync(join(dir, HELD), md); return true; }
  md = carryWaiting(readSymbiot(path, "TASKS.md"), md, { fresh, reopen });
  writeFileSync(join(dir, "TASKS.md"), md); noteHanded(path, md);
  try { unlinkSync(join(dir, HELD)); } catch {} // superseded by this brief
  return false;
}
// ---- a task the agent deleted from TASKS.md --------------------------------
// TASKS.md is rebuilt from tasks.json on every send, so an agent deleting a
// line (the user said to drop that task) changed nothing, and the next brief
// brought it back (ChatApp's `pod install`). handed.json keeps what the
// brief in TASKS.md handed out; a task it handed out that's no longer in the
// file (ticked or not) was deleted: droppedTasks lists them, and tasks.mjs
// closes them (applyDrops). The task lines are the `## Tasks` section's, or the
// whole file's when it has none; a file emptied or gone deleted nothing.
const HANDED = "handed.json", BOX = /^\s*-\s*\[[ x~]\]\s*/i; // [~] too: a waiting task isn't a deleted one
function briefTasks(md) {
  const lines = String(md || "").split("\n"), at = lines.findIndex((l) => /^##\s+Tasks\s*$/.test(l));
  const end = at < 0 ? lines.length : lines.findIndex((l, i) => i > at && /^##\s/.test(l));
  return lines.slice(at + 1, end < 0 ? lines.length : end).filter((l) => BOX.test(l)).map((l) => l.replace(BOX, "").replace(/\s*\[model:\s*\w+\s*\]/gi, "").replace(/\s*\((?:waits|waiting) (?:on|for)\b[^)]*\)\s*$/i, "").trim()).filter(Boolean);
}
function noteHanded(path, md, also = []) {
  try { writeFileSync(join(path, ".symbiot", HANDED), JSON.stringify({ at: Date.now(), tasks: [...briefTasks(md), ...also] })); } catch {}
}
function droppedTasks(path) {
  let h = null; try { h = JSON.parse(readSymbiot(path, HANDED)); } catch {}
  const md = readSymbiot(path, "TASKS.md");
  if (!h || !Array.isArray(h.tasks) || !md.trim() || !/^##\s+Tasks\s*$|^\s*-\s*\[[ x~]\]/im.test(md)) return [];
  const now = briefTasks(md);
  return h.tasks.filter((t) => !now.some((n) => sameTask(n, t))).map((text) => ({ text, at: h.at || 0 }));
}
// Swap the held brief in, keeping the ticks the agent made meanwhile: a tick
// is how a task reaches review, so dropping one would lose that task's work.
// A task the agent deleted meanwhile stays out, and stays deleted in handed.json.
// A tick with a note after it ("… — Done: the card sent …", as the brief asks for a
// stale one) is the same task: an exact match lost the Needs-you fix's tick when the
// marketing handover was held behind its run, and the task came back open (2026-10-12).
// The agent's own line, note and all, is what lands.
function releaseHeldTasks(path) {
  const held = readSymbiot(path, HELD); if (!held || runningHandoff(path)) return false;
  const isTick = /^\s*-\s*\[[x~]\]\s*/i, key = (l) => l.replace(/^\s*-\s*\[[ x~]\]\s*/i, "").trim().toLowerCase(); // a [~] the agent made meanwhile lands too
  const ticked = readSymbiot(path, "TASKS.md").split("\n").filter((l) => isTick.test(l)).map((l) => ({ k: key(l), line: l }));
  const noted = (t, k) => t.startsWith(k) && /^\s*(?:—|–|-{1,2}|:|\(|\.\s)/.test(t.slice(k.length));
  const tickOf = (k) => ticked.find((t) => t.k === k) || ticked.find((t) => noted(t.k, k) || sameTask(t.k, k));
  const gone = droppedTasks(path).map((d) => d.text), isGone = (l) => /^\s*-\s*\[ \]/.test(l) && gone.some((g) => sameTask(g, key(l)));
  const md = held.split("\n").filter((l) => !isGone(l)).map((l) => { const t = /^\s*-\s*\[ \]/.test(l) && tickOf(key(l)); return t ? l.match(/^\s*/)[0] + t.line.trimStart() : l; }).join("\n");
  try { writeFileSync(join(path, ".symbiot", "TASKS.md"), md); unlinkSync(join(path, ".symbiot", HELD)); noteHanded(path, md, gone); return true; } catch { return false; }
}
// Land the held brief and, if it leaves anything open, start an agent on it.
// Runs when an agent this process started exits, and when the app next checks
// the repo (syncTasks), which covers one `symbiot push --open` started: that
// process is gone by the time its agent finishes. A held brief is released only
// once, so this can't loop. Returns the new job, or null.
function startHeldTasks(path) {
  if (!releaseHeldTasks(path) || !/^\s*-\s*\[ \]/m.test(readSymbiot(path, "TASKS.md"))) return null;
  const n = runHandoff(path); if (!n || n.busy || n.blocked) return null;
  n.fromHeld = true; return n;
}
// Presets. [cmd, label, macAppName] — macApp used to launch GUI editors on macOS
// where the CLI isn't on PATH (they're .app bundles).
const IDE_LIST = [["code", "VS Code", "Visual Studio Code"], ["cursor", "Cursor", "Cursor"], ["windsurf", "Windsurf", "Windsurf"], ["zed", "Zed", "Zed"], ["subl", "Sublime Text", "Sublime Text"], ["idea", "IntelliJ IDEA", "IntelliJ IDEA"], ["nvim", "Neovim", ""]];
// [cmd, label, template]. Only agents that leave changes to review: a handoff
// runs unattended, so a "plan only" run can't ask anything and leaves nothing to
// approve — that preset was dropped (a saved one still runs as-is).
// Claude: acceptEdits alone still blocks every shell command, so a run could
// never run its own tests and had to leave test work unticked. Allow just the
// test runner and node.
const CLAUDE_CMD = 'claude -p "{prompt}" --permission-mode acceptEdits --allowedTools "Bash(npm test:*)" "Bash(node:*)"';
const CLAUDE_CMD_OLD = 'claude -p "{prompt}" --permission-mode acceptEdits'; // ≤0.33
const AGENT_LIST = [
  ["claude", "Claude Code — make changes", CLAUDE_CMD],
  ["codex", "Codex (OpenAI/GPT) — make changes", 'codex exec --full-auto "{prompt}"'],
  ["aider", "Aider — make changes", 'aider --message "{prompt}" --yes'],
  ["gemini", "Gemini — make changes", 'gemini --yolo -p "{prompt}"'],
  ["cursor-agent", "Cursor agent", 'cursor-agent -p "{prompt}"'],
];
// The agent to offer a new user in one click (Home's "Pick your agent"): the first
// coding agent on this computer, in AGENT_LIST's order (Claude Code first). null if none.
function pickAgent() { const a = AGENT_LIST.find(([cmd]) => hasCmd(cmd)); return a ? { label: a[1], name: a[1].split(" — ")[0], tmpl: a[2] } : null; }
function detectHandoffs() {
  const editors = [];
  for (const [cmd, label, app] of IDE_LIST) {
    if (hasCmd(cmd)) editors.push({ label, tmpl: `${cmd} {dir}`, kind: "editor" });
    else { const a = macApp(app); if (a) editors.push({ label, tmpl: `open -a ${JSON.stringify(a)} {dir}`, kind: "editor" }); }
  }
  const agents = AGENT_LIST.filter(([cmd]) => hasCmd(cmd)).map(([cmd, label, tmpl]) => ({ label, tmpl, kind: "agent" }));
  // Orca IDE (any OS): register the repo + open a terminal tab. Two variants —
  // one that just opens the repo (use Orca's own agent, e.g. GPT), and one that
  // runs Claude in the tab for Claude users. Not Claude-only.
  // `<orca> open` first: it launches Orca AND blocks until the runtime is
  // reachable, so this works even when Orca is closed (its CLI can't talk to a
  // dead app). Use the full orca-ide path, never bare `orca` (that's a different
  // tool on PATH). If Orca is already up, `open` returns fast.
  const orca = findOrcaCli();
  if (orca) {
    const q = JSON.stringify(orca);
    agents.unshift(
      { label: "Orca IDE — open repo (use your Orca agent)", tmpl: orcaHandoffCmd(q, ""), kind: "agent" },
      { label: "Orca IDE — run Claude in a tab", tmpl: orcaHandoffCmd(q, ORCA_CLAUDE_CMD), kind: "agent" },
    );
  }
  return { agents, editors };
}
// The Orca preset. Build the full Orca handoff, cold-start safe. `bin` is the
// quoted orca-ide path; `commandPart` is e.g. ORCA_CLAUDE_CMD or "" (open only).
// open launches Orca & waits for the runtime to be REACHABLE, but on a cold
// start the workspace graph isn't ready yet (runtime.state=graph_not_ready) and
// `terminal create` times out — so we poll `status` until state=ready, then add
// the repo and create the terminal (retry: the worktree can lag a beat behind).
// {prompt} needs its own (escaped) quotes: the outer shell strips the --command
// quotes and Orca re-runs the string in the tab, so an unquoted prompt reached
// the agent as just its first word ("Read"). Same test-runner rules as
// CLAUDE_CMD, so a run in the tab can test its own work too.
const ORCA_CLAUDE_INNER = `claude \\"{prompt}\\" --allowedTools \\"Bash(npm test:*)\\" \\"Bash(node:*)\\"`;
const ORCA_CLAUDE_INNER_OLD = `claude \\"{prompt}\\"`; // ≤0.34
const ORCA_CLAUDE_CMD = ` --command "${ORCA_CLAUDE_INNER}"`;
function orcaHandoffCmd(bin, commandPart) {
  const waitReady = `for i in $(seq 1 40); do ${bin} status --json 2>/dev/null | grep -q '"state": *"ready"' && break; sleep 1; done`;
  const mkTerm = `for j in 1 2 3; do ${bin} terminal create --worktree path:{dir}${commandPart} --focus && break; sleep 2; done`;
  return `${bin} open; ${waitReady}; ${bin} repo add --path {dir}; ${mkTerm}`;
}
// Normalise an Orca command saved by an older version (no launch / no wait-for-
// ready) to the current cold-start-safe form, preserving its binary path and any
// custom `--command`. Idempotent: already-current commands are left untouched.
function migrateOrcaCmd(cmd) {
  if (!cmd || typeof cmd !== "string") return cmd;
  if (!/orca-ide/.test(cmd) || !/\brepo add\b/.test(cmd)) return cmd;
  const cm = cmd.match(/--command\s+"((?:[^"\\]|\\.)*)"/); // preserve a custom agent command
  // ≤0.26 saved a bare {prompt} here (truncated to one word) — quote it; the
  // ≤0.34 Claude preset (exact match only) gains the test-runner rules
  const quoted = cm ? cm[1].replace(/(^|\s)\{prompt\}(?=\s|$)/g, '$1\\"{prompt}\\"') : "";
  const inner = quoted === ORCA_CLAUDE_INNER_OLD ? ORCA_CLAUDE_INNER : quoted;
  if (/status --json/.test(cmd) && /grep -q/.test(cmd) && (!cm || inner === cm[1])) return cmd; // already current
  const bm = cmd.match(/^\s*("[^"]*"|'[^']*'|\S+)/); // leading orca-ide binary token
  const bin = bm ? bm[1] : "";
  const commandPart = cm ? ` --command "${inner}"` : "";
  const rebuilt = bin ? orcaHandoffCmd(bin, commandPart) : cmd;
  if (rebuilt !== cmd) { try { const cfg = loadConfig(); if (cfg.agentCmd === cmd) { cfg.agentCmd = rebuilt; saveConfig(cfg); } } catch {} }
  return rebuilt;
}
// Upgrade a saved Claude preset from ≤0.33 to the current one. Exact match only:
// a command the user edited is theirs and runs as-is.
function migrateClaudeCmd(cmd) {
  if (typeof cmd !== "string" || cmd.trim() !== CLAUDE_CMD_OLD) return cmd;
  try { const cfg = loadConfig(); if (cfg.agentCmd === cmd) { cfg.agentCmd = CLAUDE_CMD; saveConfig(cfg); } } catch {}
  return CLAUDE_CMD;
}
// Cross-platform detection for the presets (hasCmd lives in core.mjs).
function macApp(name) { if (process.platform !== "darwin" || !name) return ""; for (const base of ["/Applications", join(homedir(), "Applications")]) { try { if (existsSync(join(base, name + ".app"))) return name; } catch {} } return ""; }
// Find the Orca IDE CLI across OSes (known locations, then a bounded search).
let ORCA_CLI; // cached per process: undefined=unchecked, ""=none, string=path
function findOrcaCli() {
  if (ORCA_CLI !== undefined) return ORCA_CLI;
  ORCA_CLI = _findOrcaCli();
  return ORCA_CLI;
}
function _findOrcaCli() {
  const home = homedir(); const cands = [];
  if (process.platform === "linux") cands.push(join(home, ".local/share/orca-ide/app/resources/bin/orca-ide"));
  if (process.platform === "darwin") { cands.push(join(home, "Library/Application Support/orca-ide/app/resources/bin/orca-ide"), "/Applications/Orca.app/Contents/Resources/app/resources/bin/orca-ide", join(home, "Applications/Orca.app/Contents/Resources/app/resources/bin/orca-ide")); }
  if (process.platform === "win32") { const la = process.env.LOCALAPPDATA || ""; cands.push(join(la, "orca-ide", "app", "resources", "bin", "orca-ide"), join(la, "Programs", "orca-ide", "resources", "app", "resources", "bin", "orca-ide")); }
  for (const c of cands) { try { if (existsSync(c)) return c; } catch {} }
  const roots = process.platform === "darwin" ? [join(home, "Library/Application Support"), "/Applications", join(home, "Applications")]
    : process.platform === "win32" ? [process.env.LOCALAPPDATA || "", process.env.PROGRAMFILES || ""]
    : [join(home, ".local/share"), "/opt", join(home, ".config")];
  for (const r of roots) { if (!r) continue; const hit = runOut("find", [r, "-maxdepth", "6", "-name", "orca-ide", "-type", "f", "-print", "-quit"]).trim().split("\n")[0]; if (hit) return hit; }
  return "";
}
// ---- background jobs --------------------------------------------------------
// Run a shell command as a tracked, logged background job that shows up live in
// the Agents tab. Shared by the agent handoff and the local-model setup.
const LOG_KEEP = 8 * 1024 * 1024;
// UI work isn't done when its builder ticks it (design.mjs). When a run ticks a UI item, a design
// critic (a fresh run on Opus, not the builder grading itself) looks at it and writes a verdict; at
// the critic's end the verdict passes the item, sends it back to its builder with the fixes, or after
// two rounds leaves it waiting [~] on the user, saying it still fails. Under autoStart's hourly cap.
function uiReview(path, e, { critic = false, start = (p) => runHandoff(p, { force: true, critic: true, model: MODEL.O }), rerun = (p) => runHandoff(p, { force: true }), cap = (p) => autoStart(p), now = Date.now(), later = (f) => { const t = setTimeout(f, 300); if (t.unref) t.unref(); } } = {}) {
  if (critic) {
    const s = settleVerdict(path, { now }); if (!s) return null;
    if (s.reopened.length && cap(path)) later(() => { try { rerun(path); } catch {} });
    return s;
  }
  let files = []; try { files = ((loadRunFiles(path).find((r) => r.id === (e && e.id)) || {}).files) || []; } catch {}
  const review = reviewOf(path), items = toReview(readSymbiot(path, "TASKS.md"), files, review);
  if (!items.length || !cap(path)) return null;
  for (const x of items) review[x.item] = { ...(review[x.item] || {}), rounds: x.rounds + 1, at: now };
  saveReview(path, review);
  try { writeFileSync(join(path, ".symbiot", "UI-CRITIC.md"), criticBrief(items, { specs: specsFor(path) })); } catch { return null; }
  later(() => { try { start(path); } catch {} });
  return { critic: items.map((x) => x.item) };
}
const END_HOOKS = []; // called when any run ends, so the next waiting task starts now, not at the next timer tick
const onRunEnd = (f) => { END_HOOKS.push(f); };
// A run that ended with the user's newest answer unmet: they asked for a report first, and it wrote
// none and named none. On 21 Oct 2026 two runs found their one task ticked and ended "nothing for me
// to do" while the answer said "i need the report first". Once per answer, its agent is told and
// started again; one that wrote or named a report is done (its card points at it: needsOf).
const CHASED = new Set();
function chaseReport(e, { run = runHandoff } = {}) {
  if (!e || e.status !== "done" || !e.path) return null;
  const asked = reportAsked(readSymbiot(e.path, "ANSWERS.md")); if (!asked) return null;
  const k = digest(`${e.path}\n${asked.heading}\n${asked.text}`); if (CHASED.has(k)) return null;
  if (OPEN_TASK.test(readSymbiot(e.path, "TASKS.md"))) return null; // work left: its next run gets there
  if (runReport(e.path, { said: lastFinal(e.path), since: (e.startedAt || Date.now()) - 60000 })) return null;
  CHASED.add(k);
  const f = join(e.path, ".symbiot", "ANSWERS.md");
  try { writeFileSync(f, `${readSymbiot(e.path, "ANSWERS.md").replace(/\s*$/, "")}\n\n### From Symbiot: the report the user asked for\nThe user asked for a report first ("${clipWords(asked.text, 200)}"), and your last run ended without writing one or naming one. Every task being ticked doesn't make this done: write it now, a .md in .symbiot/ named for what it is and starting with a # title (it shows under Reports), name it in your last message, and do nothing else they haven't said yes to.\n_answered ${new Date().toISOString().slice(0, 10)}_\n`); } catch { return null; }
  return run(e.path, { force: true });
}
END_HOOKS.push((e) => { const t = setTimeout(() => { try { chaseReport(e); } catch {} }, 2000); if (t.unref) t.unref(); });
// a run that waited for its twin on the same work (twinRunning) starts once that one ends
END_HOOKS.push((e) => { const w = e && TWIN_WAIT.get(e.path); if (!w) return; TWIN_WAIT.delete(e.path); for (const p of w) { const t = setTimeout(() => { try { runHandoff(p, { force: true }); } catch {} }, 1500); if (t.unref) t.unref(); } });
// A command that starts with a script path this app can see but cannot run (saved 0600,
// as every file in the config folder is) fails with "Permission denied" on every run, and
// each run then asks you "Run it again?". Make it runnable once, here, instead.
function ensureRunnable(cmd) {
  try {
    const first = (/^\s*(?:"([^"]+)"|(\S+))/.exec(cmd) || [])[1] || (/^\s*(\S+)/.exec(cmd) || [])[1];
    if (!first || !first.startsWith("/")) return;
    const st = statSync(first);
    if (st.isFile() && !(st.mode & 0o100)) chmodSync(first, st.mode | 0o700);
  } catch {}
}
function track(name, cmd, cwd, onExit, env) {
  ensureRunnable(cmd);
  try {
    const dir = join(cwd, ".symbiot"); mkdirSync(dir, { recursive: true });
    const logp = join(dir, "agent.log");
    try { if (statSync(logp).size > LOG_KEEP) renameSync(logp, logp + ".old"); } catch {} // past 8 MB: kept as agent.log.old, and a fresh one starts
    let fd = "ignore"; try { fd = openSync(logp, "a"); writeSync(fd, `\n=== ${name} ${new Date().toISOString()} ===\n$ ${cmd}\n`); } catch {}
    const entry = { id: randomBytes(4).toString("hex"), name, path: cwd, log: logp, startedAt: Date.now(), status: "running", exitCode: null, endedAt: null };
    const task = firstOpen(readSymbiot(cwd, "TASKS.md")); // what it's on, for how long runs like it take (estimate.mjs)
    const child = spawn(cmd, { shell: true, cwd, detached: true, stdio: ["ignore", fd === "ignore" ? "ignore" : fd, fd === "ignore" ? "ignore" : fd], ...(env ? { env: { ...process.env, ...env } } : {}) });
    entry.pid = child.pid;
    if (fd !== "ignore") try { closeSync(fd); } catch {} // the child has its own copy; ours stayed open for the life of the app (101 of them by 2026-10-10)
    child.on("exit", (code) => { entry.status = code === 0 ? "done" : "failed"; entry.exitCode = code; entry.endedAt = Date.now(); if (code === 0) try { noteDuration({ path: cwd, cmd, task, ms: entry.endedAt - entry.startedAt }); } catch {} try { const r = parseRun(lastRunText(readRunLog(logp))); noteCost({ path: cwd, cmd, task, model: r.model, cost: r.cost, turns: r.turns, ms: entry.endedAt - entry.startedAt, ok: code === 0, modelUsage: r.modelUsage, escalatedFrom: entry.escalatedFrom }); } catch {} if (onExit) try { onExit(code); } catch {} for (const f of END_HOOKS) try { f(entry); } catch {} });
    child.on("error", () => { entry.status = "failed"; entry.endedAt = Date.now(); });
    child.unref();
    HANDOFFS.unshift(entry);
    if (HANDOFFS.length > 30) HANDOFFS.length = 30;
    return entry;
  } catch { return null; }
}
// Agent-agnostic "what did it do": read it straight from git, so it works the
// same whoever the agent was (Claude, Codex/GPT, Aider, Gemini, Cursor…). Shows
// current working-tree changes + any commits the agent made since it started.
// The answer is kept a while (CHANGES): Home and the Agents tab ask every few seconds
// for every earlier run (up to 60), and three or four git commands each, one after
// another, held the whole app up 20s in every 45 (2026-10-12). One older than
// CHANGES_FRESH is still given while git is asked again in the background, so a
// screen never waits on git for a run it has seen before.
const CHANGES = new Map(), CHANGES_FRESH = 15000, CHANGES_MAX = 300;
const NO_CHANGES = { dirty: 0, stat: "", commits: [] };
function changesOf(path, startedAt, git) {
  // Don't count Symbiot's own .symbiot/ dir (agent.log, TASKS.md) as the agent's work.
  const since = new Date(startedAt || Date.now()).toISOString();
  const read = ([porcelain, stat, cached, raw]) => {
    porcelain = porcelain.trim(); raw = raw.trim();
    const dirty = porcelain ? porcelain.split("\n").filter((l) => { const p = l.slice(3); return p !== ".symbiot" && p !== ".symbiot/" && p.indexOf(".symbiot/") !== 0; }).length : 0;
    const commits = raw ? raw.split("\n").slice(0, 8).map((l) => { const i = l.indexOf("\u0001"); return { hash: l.slice(0, i), msg: l.slice(i + 1) }; }) : [];
    return { dirty, stat: (stat.trim() || cached.trim()).replace(/^\s+/, ""), commits };
  };
  const asks = [["status", "--porcelain"], ["diff", "--shortstat"], ["diff", "--cached", "--shortstat"], ["log", `--since=${since}`, "--pretty=%h\u0001%s"]];
  const outs = asks.map((a) => git(["-C", path, ...a]));
  return outs.some((o) => o && typeof o.then === "function") ? Promise.all(outs).then(read) : read(outs);
}
const gitNow = (args) => { const r = spawnSync("git", args, { encoding: "utf8", timeout: 6000, killSignal: "SIGKILL", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); return r.status === 0 ? String(r.stdout || "") : ""; };
const gitLater = (args) => new Promise((res) => execFile("git", args, { encoding: "utf8", timeout: 6000, killSignal: "SIGKILL", maxBuffer: 32 * 1024 * 1024 }, (e, out) => res(e ? "" : String(out || ""))));
// endedAt: the run is over, so what git said after it ended stands; it isn't asked again every CHANGES_FRESH.
function agentChanges(path, startedAt, endedAt = 0) {
  const now = Date.now(), runs = CHANGES.get(path) || [];
  // the same run: a run's start is only known roughly when it began before a restart
  const had = runs.find((r) => Math.abs(r.startedAt - (startedAt || now)) < 60000);
  if (had) {
    if (now - had.at > CHANGES_FRESH && !had.busy && !(endedAt && had.at >= endedAt + 2000)) {
      had.busy = true;
      Promise.resolve(changesOf(path, startedAt, gitLater)).then((v) => { Object.assign(had, { at: Date.now(), v, busy: false }); }, () => { had.busy = false; });
    }
    return had.v;
  }
  let v = NO_CHANGES; try { v = changesOf(path, startedAt, gitNow); } catch {}
  if (CHANGES.size >= CHANGES_MAX) CHANGES.clear();
  // Each run in a folder keeps its own answer. Kept by folder alone, two runs in one
  // folder replaced each other's, so every poll asked git again for both, in the
  // foreground: 2s for each Agents or Workdesk poll, and the app stalled (15 Oct).
  CHANGES.set(path, [...runs.slice(-11), { at: now, startedAt: startedAt || now, v }]); return v;
}
// ---- agent questions: decisions, options and ideas, from ANY agent ---------
// A handoff runs unattended (claude -p, codex exec, aider --message, …), so the
// agent can't stop and ask in chat. TASKS.md tells it to write
// .symbiot/QUESTIONS.md instead — questions with options, plus ideas — which
// the Agents tab shows on that agent's block. The user's answers are appended to
// .symbiot/ANSWERS.md for the next run to read. Plain files, so it works the
// same whichever model or tool the agent is.
const QUESTIONS_MAX = 5;
// Two at a time: most people pick the recommended option, or + task an idea,
// without weighing the rest, and the choices are the agent's to judge (the
// brief says how). So a question shows its first two options, and the Agents
// tab the ideas two at a time (`ideasShown`): one in Tasks leaves the list, and
// the next moves up. The rest are a click away.
const OPTIONS_SHOWN = 2, IDEAS_SHOWN = 2;
const qKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const readSymbiot = (path, f) => { if (f === "agent.log") return readRunLog(join(path, ".symbiot", f)); try { return readFileSync(join(path, ".symbiot", f), "utf8"); } catch { return ""; } };
// "## Questions" → "### question", context lines, "- option" bullets;
// "## Suggestions" (or Ideas / Follow-ups) → "- idea" bullets. Forgiving: a bare
// bullet under Questions is a question with no options.
// The platforms linked in Symbiot's browser (links.mjs keeps them in config.linked): a
// 👤 option to post there, or to sign in or link it again, is the agent's, and doing it
// by hand isn't offered (handover.mjs agentsPosting, linkedAsks).
const linkedIds = () => { try { return Object.keys(loadConfig().linked || {}); } catch { return []; } };
// A question's id: "### Which plan should Pro use? {#pro-plan}". The same id asked again, in
// any words, is the same question: its answer is kept by the id (asksdone.mjs recordDone) and
// given back (repeatAnswer), so the user is asked once (S2 of the 20 Oct 2026 review: Paddle
// was asked four times in new words). One with no id is matched by its words, as before.
const ID_AT_END = /\s*\{#([a-z0-9][a-z0-9._-]{1,60})\}\s*$/i;
const qId = (h) => ((String(h || "").match(ID_AT_END) || [])[1] || "").toLowerCase();
const noId = (h) => String(h || "").replace(ID_AT_END, "");
function parseQuestions(md, { linked = linkedIds() } = {}) {
  const questions = [], suggestions = []; let sec = "q", cur = null;
  const clip = (s) => clipWords(String(s).trim(), TASK_MAX); // as long as a task holds (addTask), so an idea added in one click arrives whole
  for (const raw of String(md || "").split(/\r?\n/)) {
    const l = raw.trim(); if (!l) continue;
    let m;
    if ((m = l.match(/^###\s+(.+)$/))) {
      if (sec === "s") { suggestions.push(clip(m[1])); cur = null; }
      else { const id = qId(m[1]); cur = { q: clip(noId(m[1])), context: "", options: [], ...(id ? { id } : {}) }; questions.push(cur); }
      continue;
    }
    if ((m = l.match(/^##\s+(.+)$/))) { sec = /suggest|idea|follow|option/i.test(m[1]) ? "s" : "q"; cur = null; continue; }
    if (/^#\s/.test(l)) continue;
    const b = l.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+)$/);
    if (sec === "s") { if (b) suggestions.push(clip(b[1])); continue; }
    if (b) { if (cur) cur.options.push(clip(b[1])); else if (/\?\s*$/.test(b[1])) questions.push({ q: clip(b[1]), context: "", options: [] }); continue; } // a bullet with no "### question" above it is a question only if it actually ends in "?" — otherwise it's preamble/prose (a file list, etc.)
    if (cur) cur.context = clip((cur.context ? cur.context + " " : "") + l);
  }
  return { questions: questions.filter((x) => x.q).slice(0, 20).map((x) => ({ ...x, options: apiOptions(agentsPosting(linkedAsks(agentsMail(agentsCodeWork(agentsClicking(agentsGitWork(x.options))), linked), linked, x.q), linked)).slice(0, 6) })), suggestions: suggestions.filter(Boolean).slice(0, 10) };
}
// An idea for another project names it first: "[repo: symbiot] Watch GitHub
// too" is for the symbiot repo's tasks, whichever repo's agent had it (an agent
// working on atlas may have ideas for Symbiot, the app that sent it). Gives
// { repo, text }, repo "" when the idea doesn't name one.
function suggestionTarget(s) {
  const m = String(s || "").match(/^\[repo:\s*([^\]]*?)\s*\]\s*(.+)$/i);
  return m && m[1] ? { repo: m[1], text: m[2].trim() } : { repo: "", text: String(s || "") };
}
// The OPEN questions (not yet in ANSWERS.md) and the agent's ideas, each with
// the repo whose tasks it goes to (this one unless it names another) and marked
// if it's already on that repo's task list, in these words or nearly (sameTask).
// Ideas the user turned down (Skip) stay in .symbiot/SKIPPED.md, a file like
// ANSWERS.md, so they leave the list and the brief tells the next run not to
// suggest them again.
const SKIPPED = "SKIPPED.md";
const skippedIdeas = (path) => [...readSymbiot(path, SKIPPED).matchAll(/^-\s+(.+)$/gm)].map((m) => m[1].trim());
function skipIdea(path, text) {
  path = String(path || ""); text = clipWords(String(text || "").replace(/\s+/g, " ").trim(), TASK_MAX);
  if (!path || !knownRun(path)) return { error: "No agent has run in that folder." };
  if (!text) return { error: "No idea to skip." };
  const f = join(path, ".symbiot", SKIPPED);
  if (!skippedIdeas(path).some((s) => sameTask(s, text))) {
    try { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, (existsSync(f) ? readFileSync(f, "utf8").replace(/\n*$/, "\n") : "# Ideas the user turned down\nDon't suggest these again.\n\n") + `- ${text}\n`); }
    catch (e) { return { error: String((e && e.message) || e) }; }
  }
  return { ok: true };
}
// A question as every screen shows it (plain.mjs): `shown`, its words with no file in them,
// and `labels`, its choices the same way ("Allow" for an allow list it proposed). q and
// options stay as the agent wrote them: an answer is saved under the agent's own words.
function plainly(path, x) {
  let p = {}; try { p = plainAsk(path, x, { max: x.options.length }); } catch {}
  return { ...x, ...(p.raw ? { shown: p.q } : {}), ...(p.labels ? { labels: p.labels } : {}), ...(p.context != null ? { context: p.context } : {}) };
}
// A question that names a report of its run ("the full report is on Reports as LOVELINK-FULL-EMAIL-REPORT"):
// its card links it (Read the report), so it isn't a file name to go and find.
function askReport(path, x) {
  let r = null; try { r = runReport(path, { said: `${x.q}\n${x.context || ""}`, since: Infinity }); } catch {}
  return r ? { report: { id: r.id, title: r.title } } : {};
}
// raw: every open question, judged or not (triageSweep). Otherwise only what's the user's
// (triage.mjs): a question judged an agent's, Symbiot's, or already answered is answered here
// instead (known, autoDecide), and a new one waits for its verdict before it can be a card.
const GO_ID = /^(?:chrome|phone|push)-go-/;
function agentQuestions(path, repo, { raw = false } = {}) {
  const p = parseQuestions(readSymbiot(path, "QUESTIONS.md"));
  const heads = [...allAnswers(path).matchAll(/^###\s+(.+)$/gm)].map((m) => m[1]), done = new Set(heads.map((h) => qKey(noId(h)))), doneIds = new Set(heads.map(qId).filter(Boolean));
  const unanswered = p.questions.filter((x) => !done.has(qKey(x.q)) && !(x.id && doneIds.has(x.id)));
  const triaged = (x) => { if (raw) return ""; const v = verdictOf(path, x.q); return v && v.verdict !== "user" ? triageAnswer(v) : ""; };
  // a Go on a held action (chrome-go-, phone-go-, push-go-) is only ever the user's: nothing answers it for them
  const known = unanswered.map((x) => ({ q: x.q, ...(x.id ? { id: x.id } : {}), a: GO_ID.test(x.id || "") ? "" : whereAnswer(path, x) || repeatAnswer(path, x) || triaged(x) })).filter((x) => x.a);
  let judging = false; if (!raw) try { judging = !!resolveProvider(); } catch {}
  const open = unanswered.filter((x) => !known.some((k) => k.q === x.q) && (raw || GO_ID.test(x.id || "") || triageShows(path, x.q, { judging }))); // Symbiot answers those itself (autoDecide)
  const tasks = p.suggestions.length ? loadTasks() : [], skipped = p.suggestions.length ? skippedIdeas(path) : [];
  const ideas = p.suggestions.map(suggestionTarget).filter(({ text }) => !skipped.some((s) => sameTask(s, text)))
    .map(({ repo: to, text }) => ({ text, repo: to || repo, other: !!to && to !== repo, added: tasks.some((t) => t.repo === (to || repo) && sameTask(t.text, text)) })).filter((s) => !s.added);
  return {
    questions: open.slice(0, QUESTIONS_MAX).map((x) => { const talk = talkOf(path, x.q); return plainly(path, { ...x, options: x.options.slice(0, OPTIONS_SHOWN), task: askTask(path, x), ...askReport(path, x), ...(talk.length ? { talk } : {}) }); }), answered: p.questions.length - unanswered.length, ...(known.length ? { known } : {}),
    suggestions: ideas, ideasShown: IDEAS_SHOWN,
  };
}
// Save answers to .symbiot/ANSWERS.md; opts.rerun hands the repo back to the
// agent (same saved command) so it carries on with them.
// An answer that picks a "👤 You:" option is a step for the user: they're told
// it's still theirs (`yours`), and the next run waits for it (waiting.json).
// A folder a run started in before a restart can be answered too (runs.json).
// A permission picked in the app is given then and there: the click is the user's
// say-so. "let agents read ~/x" / "allow /x" becomes --add-dir, "let agents run
// \`tool\`" a grant for that tool (never sudo/rm), as Settings' grant boxes do. What's
// granted isn't a step left for the user. Returns what was granted, or null.
// An allow list an agent proposed (.symbiot/allowlist.proposed.json) is turned on for
// that folder only (.claude/settings.local.json, merged), unless it would let an agent
// run anything at all (a shell, sudo, rm, Bash(*)): then it stays the user's step.
// A rule is wide when it lets an agent run anything: Bash with no command, a shell
// (bash, sh, eval…) or sudo in any form, or a destructive command (rm, dd, chmod…)
// with a wildcard. The same command spelled out exactly (rm -r ~/x/site) is narrow.
const ANY_RULE = /^Bash(\(\s*\*.*\))?$|^Bash\(\s*(sudo|su|bash|sh|zsh|dash|fish|eval|exec|env|xargs)\b/i;
const HARM_RULE = /^Bash\(\s*(rm|dd|mkfs|chmod|chown|shred|truncate)\b/i;
const wideRule = (r) => ANY_RULE.test(r) || (HARM_RULE.test(r) && /\*/.test(r));
// Whatever an agent is allowed, it never edits Symbiot's own settings: that's where
// what agents may do is kept, so an agent could widen its own permissions there.
// As Claude Code reads a file rule: Edit(path) governs Edit, Write and NotebookEdit (a
// Write(path) rule is accepted and never consulted, and it said so on every run: 184 times in
// one log), and a path with one leading slash is relative to the settings file's folder, so
// Edit(/home/…/config.json) guarded nothing. Absolute is //path. A Read(path) that's denied
// blocks writes there too (16 Oct 2026).
const absRule = (tool, p) => `${tool}(//${String(p).replace(/^\/+/, "")})`;
const GUARD = () => { const c = join(homedir(), ".config", "symbiot", "config.json"), s = join(homedir(), ".config", "symbiot", "secrets.json"); return [absRule("Edit", c), absRule("Read", s), absRule("Edit", s)]; };
// Every file rule Symbiot writes, and every one already in a lane's settings.local.json, in
// those forms: Write, MultiEdit and NotebookEdit → Edit, Glob → Read, and a single-slash path
// that can only be absolute (/home, /mnt, /tmp, /opt, /srv, /Users, /var, /etc, /usr…) → //.
const ABS_ROOT = /^\/(?:home|Users|mnt|media|tmp|opt|srv|var|etc|usr|root|private|Volumes|data)(?=\/|$)/;
function tidyRule(r) {
  const m = /^(Read|Edit|Write|MultiEdit|NotebookEdit|Glob)\((.+)\)$/s.exec(String(r || "").trim()); if (!m) return String(r || "").trim();
  const tool = m[1] === "Read" || m[1] === "Glob" ? "Read" : "Edit"; let p = m[2].trim();
  if (/^\/(?!\/)/.test(p) && ABS_ROOT.test(p)) p = "/" + p;
  return `${tool}(${p})`;
}
const tidyRules = (list) => [...new Set((Array.isArray(list) ? list : []).filter((r) => typeof r === "string" && r.trim()).map(tidyRule))];
// A lane's settings.local.json put in those forms, with Symbiot's own deny rules current where
// it had written them: the warnings stop, and the rules hold. True when the file changed.
function tidySettings(path) {
  const f = join(String(path || ""), ".claude", "settings.local.json"); let cur; try { cur = JSON.parse(readFileSync(f, "utf8")); } catch { return false; }
  const perm = cur && cur.permissions; if (!perm || typeof perm !== "object" || Array.isArray(perm)) return false;
  const next = { ...perm };
  for (const k of ["allow", "deny", "ask"]) if (Array.isArray(perm[k])) next[k] = tidyRules(perm[k]);
  if (Array.isArray(perm.deny) && perm.deny.some((r) => /\.config\/symbiot\/(?:config|secrets)\.json\)$/.test(String(r)))) next.deny = [...new Set([...next.deny, ...GUARD()])];
  if (JSON.stringify(next) === JSON.stringify(perm)) return false;
  try { writeFileSync(f, JSON.stringify({ ...cur, permissions: next }, null, 2) + "\n", { mode: 0o600 }); return true; } catch { return false; }
}
// A permission card that names its commands in backticks ("allow `python3 -I -c` / `py_compile`
// on `v2/*.py`"): the rules it asks for. A token with a path or a glob is where the commands
// work, not a command (the glob is never a file to look for); a bare module name (py_compile)
// runs under the python command before it. Wide rules are left to the caller to refuse.
const cardIsPermission = (t) => /only you: a permission|\bpermission\b|\ballow\b.*`/i.test(String(t || ""));
function cardRules(text) {
  const toks = [...String(text || "").matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);
  const out = []; let py = "";
  for (const t of toks) {
    if (/[/*]/.test(t) || /\.\w{1,4}$/.test(t) || t.startsWith("~")) continue;
    if (/^python3?\b/.test(t)) { py = t.replace(/\s+-c$/, "").replace(/\s+-m$/, ""); out.push(`Bash(${t}:*)`); continue; }
    if (/^[a-z_][a-z0-9_]*$/i.test(t) && py && /_/.test(t)) { out.push(`Bash(${py} -m ${t}:*)`); continue; }
    const r = grantRule(t); if (r && !/^-/.test(t)) out.push(r);
  }
  return [...new Set(out)];
}
function installAllowlist(path, given = null) {
  let p = given; if (!p) { try { p = JSON.parse(readFileSync(join(path, ".symbiot", "allowlist.proposed.json"), "utf8")).permissions || {}; } catch { return null; } }
  const list = (x) => (Array.isArray(x) ? x.filter((r) => typeof r === "string" && r.trim()).map((r) => r.trim()) : []);
  const allow = list(p.allow), deny = list(p.deny), dirs = list(p.additionalDirectories);
  if (!allow.length && !dirs.length && !deny.length) return null;
  const wide = allow.filter(wideRule);
  if (wide.length) return { refused: wide };
  const { sealed } = sandboxLifts(allow); // allowed, it'd still be hidden from the run: say so instead
  if (sealed.length) return { refused: sealed, sealed: true };
  const f = join(path, ".claude", "settings.local.json");
  let cur = {}; try { cur = JSON.parse(readFileSync(f, "utf8")); } catch {}
  const perm = cur.permissions || {}, merge = (a, b) => [...new Set([...list(a), ...b])];
  cur.permissions = { ...perm, allow: tidyRules(merge(perm.allow, allow)), deny: tidyRules(merge(perm.deny, [...deny, ...GUARD()])), additionalDirectories: merge(perm.additionalDirectories, dirs.filter(isDir)) };
  try { mkdirSync(join(path, ".claude"), { recursive: true }); writeFileSync(f, JSON.stringify(cur, null, 2) + "\n", { mode: 0o600 }); } catch { return null; }
  const n = allow.length + deny.length;
  return [`the allow list for this folder (${n} rule${n === 1 ? "" : "s"})`];
}
// ---- the owner's work, and allow lists inside it ---------------------------------------
// What the owner told Symbiot is their work: the folders it scans (Settings → Folders) and
// their knowledge folders, but not a hidden folder at the top of their home (~/.ssh,
// ~/.config: keys and settings), bar the folders Symbiot's own agents run in. An agent
// reaches its knowledge folders from the start (withScope), and an allow list it proposes
// that stays inside this work, asks for nothing wide, and doesn't publish or reach another
// machine is turned on by itself when its run ends (autoAllow): no question for the user.
const PUBLISH_RULE = /^Bash\(\s*(git push|git\s+-C\s+\S+\s+push|npm publish|yarn publish|pnpm publish|aws|gcloud|az|kubectl|docker|podman|terraform|ssh|scp|sftp|rsync|ftp|heroku|vercel|netlify|fly|flyctl)\b/i;
// Not ~ itself (nor / or a parent of it): with ~ as a knowledge folder, inWork said yes to
// ~/Downloads and ~/x.sh, and an allow list reaching anywhere in home turned itself on.
function workRoots() {
  const roots = new Set();
  try { for (const r of scanRoots()) roots.add(r); } catch {}
  try { for (const k of knowledgeFolders()) roots.add(k.path); } catch {}
  return [...roots].filter(Boolean).map((r) => r.replace(/\/+$/, "") || "/").filter((r) => !wideRoot(r));
}
function inWork(p, roots = workRoots()) {
  if (!p) return false;
  p = resolve(String(p).replace(/^~(?=\/|$)/, homedir()).replace(/[/*]+$/, "")) || "/";
  for (const lane of [join(CONFIG_DIR, "drafts"), join(CONFIG_DIR, "marketing")]) if (p === lane || p.startsWith(lane + "/")) return true;
  if (!roots.some((r) => p === r || p.startsWith(r === "/" ? "/" : r + "/"))) return false;
  const rel = relative(homedir(), p);
  if (!rel.startsWith("..") && rel.split("/")[0].startsWith(".")) return false; // ~/.ssh, ~/.config…
  return true;
}
// The paths a rule names: Read(/x/**), Bash(find /x:*), additionalDirectories' /x.
// A Bash rule's own program, when it lives in a bin folder (~/.local/bin/adb), is a tool
// it runs, not a place it works in: only the paths after it count.
const BIN_PROGRAM = /^(Bash\(\s*)(?:~|\/)[^\s:()]*\/s?bin\/[^\s:()/]+/;
// A path starts a word: the "/scripts" in a relative supabase/scripts/x.py is in the lane, and
// the "//host" in https://host is a site, not a folder. /dev/null is nobody's.
const rulePaths = (r) => (String(r).replace(BIN_PROGRAM, "$1").match(/(?<=^|[\s(="'])(?:~|\/)[^\s:*()"',]*/g) || []).filter((x) => (x === "~" || x.length > 1) && !/^\/dev\/(null|std(in|out|err))$/.test(x));
// curl or wget that sends something (a POST, a form, a file) goes out, like a push.
const SENDS = /^Bash\(\s*(curl|wget)\b.*\s(-X\s*(POST|PUT|PATCH|DELETE)|-d|--data\S*|-F|--form|-T|--upload-file|--post-\w+)\b/i;
// An ssh, scp or rsync rule whose every remote (user@host, user@host:path) is a host this
// computer already connects to (it's in ~/.ssh/known_hosts) reaches the owner's own
// machine, not another one: it counts as their work. A wildcard host never does.
function knownHost(host) { try { return !/[*?]/.test(host) && spawnSync("ssh-keygen", ["-F", host], { encoding: "utf8", timeout: 5000 }).status === 0; } catch { return false; } }
function toKnownHost(r, known = knownHost) {
  const m = String(r).match(/^Bash\(\s*(ssh|scp|rsync)\b(.*)\)$/); if (!m) return false;
  const hosts = m[2].split(/\s+/).filter((t) => t.includes("@") && !t.startsWith("-")).map((t) => t.split("@").pop().split(":")[0]).filter(Boolean);
  return hosts.length > 0 && hosts.every((h) => known(h));
}
// Whether a proposed list can be turned on without asking: { ok } or { why }.
function allowlistInWork(path) {
  let p; try { p = JSON.parse(readFileSync(join(path, ".symbiot", "allowlist.proposed.json"), "utf8")).permissions || {}; } catch { return { why: "no list" }; }
  const list = (x) => (Array.isArray(x) ? x.filter((r) => typeof r === "string" && r.trim()).map((r) => r.trim()) : []);
  const allow = list(p.allow), dirs = list(p.additionalDirectories), roots = [...workRoots(), path];
  const wide = allow.filter(wideRule); if (wide.length) return { why: "wide: " + wide.join(", ") };
  const pub = allow.filter((r) => (PUBLISH_RULE.test(r) || SENDS.test(r)) && !toKnownHost(r)); if (pub.length) return { why: "publishes or reaches another machine: " + pub.join(", ") };
  const out = [...dirs, ...allow.flatMap(rulePaths)].filter((x) => !inWork(x, roots));
  if (out.length) return { why: "outside your work: " + [...new Set(out)].slice(0, 3).join(", ") };
  return { ok: true, allow, dirs };
}
// A run ended asking for its proposed list: inside the work, it's turned on, the
// question is answered for the user, and the agent starts again. Once per proposal
// (.symbiot/autoallow.json), so an agent can't loop on it; past that it's the user's.
function autoAllow(path) {
  if (!path || runningHandoff(path)) return null;
  const f = join(path, ".symbiot", "allowlist.proposed.json"); let raw = ""; try { raw = readFileSync(f, "utf8"); } catch { return null; }
  const q = agentQuestions(path, "", { raw: true }).questions.find((x) => (x.options || []).some((o) => /allowlist\.proposed\.json/i.test(o)) || /allowlist\.proposed\.json/i.test(x.context || ""));
  if (!q) return null;
  const mark = join(path, ".symbiot", "autoallow.json"), d = digest(raw); let done = []; try { done = JSON.parse(readFileSync(mark, "utf8")); } catch {}
  if (done.includes(d)) return null;
  const v = allowlistInWork(path);
  if (!v.ok && /^wide: /.test(v.why)) { // the agent's to fix, not the user's: it writes the commands out and asks again
    try { writeFileSync(mark, JSON.stringify([...done, d].slice(-20))); } catch {}
    try { writeFileSync(join(path, ".symbiot", "ANSWERS.md"), (readSymbiot(path, "ANSWERS.md") || "# Answers from the user\nAnswers to the questions in QUESTIONS.md, newest last. Follow them; ask again in QUESTIONS.md if one is unclear.\n").replace(/\s*$/, "\n") + `\n### ${q.q}\nSymbiot didn't turn your list on, and didn't pass it to the user: ${v.why.slice(6)} would let you run anything (a script or a shell can hold any command). Write each command out exactly in .symbiot/allowlist.proposed.json instead, with the files and hosts it touches named (for a script, the commands inside it), and ask again.\n_${new Date().toISOString().slice(0, 10)}_\n`); } catch {}
    try { unlinkSync(join(path, ".symbiot", WAITING)); } catch {}
    const e = runHandoff(path, { force: true });
    return { narrower: true, rerun: e && e.id ? e.id : null };
  }
  if (!v.ok) return { asked: true, why: v.why };
  const g = installAllowlist(path); if (!g || g.refused) return null;
  try { writeFileSync(mark, JSON.stringify([...done, d].slice(-20))); } catch {}
  const day = new Date().toISOString().slice(0, 10);
  try { writeFileSync(join(path, ".symbiot", "ANSWERS.md"), (readSymbiot(path, "ANSWERS.md") || "# Answers from the user\nAnswers to the questions in QUESTIONS.md, newest last. Follow them; ask again in QUESTIONS.md if one is unclear.\n").replace(/\s*$/, "\n") + `\n### ${q.q}\nSymbiot turned your list on (it stays inside the user's work and asks for nothing wide): .claude/settings.local.json in this folder. Carry on.\n_answered ${day}_\n`); } catch {}
  try { unlinkSync(join(path, ".symbiot", WAITING)); } catch {}
  const e = runHandoff(path, { force: true });
  return { allowed: true, rerun: e && e.id ? e.id : null };
}
// Every run that stopped asking for its list, now: on start and every so often, so
// asks from before this version clear too.
// A question whose answer the agent already knows isn't the user's: when its own
// recommended option is a step it takes itself (not 👤), and nothing in the question or
// that option is an approval, goes out, costs money, touches an account or a machine, or
// can't be undone, Symbiot picks it and the agent carries on. Only a pure action, though:
// an option that says anything before its 🤖 tag ("Yes, it's through. 🤖 Agent: …"), or
// has no tag at all, states a fact or a choice only the user knows, so it goes to them.
// Everything else still comes to the user.
const pureAction = (o) => /^[\s*_]*🤖/u.test(String(o || ""));
const OUTWARD = /\b(approv\w*|publish\w*|releas\w*|push\w*|merg\w*|send\w*|sent|post\w*|repl\w*|e-?mail\w*|pay\w*|spend\w*|buy\w*|money|bill\w*|cost\w*|delet\w*|remov\w*|uninstall\w*|wip\w*|drop\w*|password\w*|2fa|token\w*|keys?|sign(?:ed|s)?[- ]?in|log(?:ged)?[- ]?in|accounts?|subscription|plan|tunnel\w*|prox\w*|ssh|vm|servers?|restart\w*|stop\w*|kill\w*|broker\w*|trad\w*|bank\w*|npm|deploy\w*|install\w*|phone|whatsapp|linkedin|github\.com|live|production|prod)\b|\byour (?:default|settings?|profile)\b/i;
function autoPick(q) {
  if (GO_ID.test(q.id || "")) return ""; // a Go on a held action is the user's
  const rec = (q.options || []).filter((o) => /\(recommended\b/i.test(o));
  if (rec.length !== 1 || yourStep(rec[0]) || !pureAction(rec[0])) return "";
  // a file name ("costs.json") is not the thing being decided: only the words around it count
  const words = `${q.q} ${q.context || ""} ${rec[0]}`.replace(/[\w~./-]*\.(?:json|mjs|md|js|py|txt|env|html|log|ya?ml|toml|patch)\b/gi, " ");
  return OUTWARD.test(words) ? "" : rec[0];
}
const REPEATS_RERUN = 3; // repeats answered from the record before a rewording stops starting a run
function autoDecide(path) {
  if (!path || runningHandoff(path)) return null;
  const ask = agentQuestions(path, "");
  if (ask.known) { // where it is: never shown to the user, answered here (whereAnswer)
    const day = new Date().toISOString().slice(0, 10);
    const had = readSymbiot(path, "ANSWERS.md");
    try { writeFileSync(join(path, ".symbiot", "ANSWERS.md"), (had || "# Answers from the user\nAnswers to the questions in QUESTIONS.md, newest last. Follow them; ask again in QUESTIONS.md if one is unclear.\n").replace(/\s*$/, "\n") + ask.known.map((x) => `\n### ${x.q}${x.id ? ` {#${x.id}}` : ""}\n${x.a}\n_answered ${day}_\n`).join("")); } catch { return null; }
    settleRecord(path, "answered by Symbiot");
    // a run that keeps rewording the same question gets its answer, but no new run each time it does
    if (ask.known.every((x) => x.a.includes(REPEAT_TAG)) && had.split(REPEAT_TAG).length > REPEATS_RERUN) return { decided: ask.known.length, where: true, rerun: null };
    // triage's answers start the run again only under the hourly cap (autoStart): a run that keeps
    // asking the user for what isn't theirs gets its answer, not a new run every time it asks
    if (ask.known.every((x) => /\(Symbiot's triage|Symbiot answered this from the user's earlier answers/.test(x.a)) && !autoStart(path)) return { decided: ask.known.length, where: true, rerun: null };
    const e = runHandoff(path, { force: true });
    return { decided: ask.known.length, where: true, rerun: e && e.id ? e.id : null };
  }
  const picks = ask.questions.map((q) => ({ q: q.q, a: autoPick(q) })).filter((x) => x.a);
  if (!picks.length) return null;
  const r = answerQuestions(path, picks.map((x) => ({ q: x.q, a: `${x.a}\n(Symbiot picked your own recommendation: it's yours to do and can be undone, so the user wasn't asked.)` })), { rerun: true });
  return r && r.ok ? { decided: picks.length } : null;
}
// A lane whose run has ended with unticked tasks still in TASKS.md starts again by
// itself, so open work never just sits there. Only while it's getting somewhere: after
// the first continue, a lane starts again only if more tasks got ticked since the last
// one, so a lane stuck on its questions doesn't loop. Parked, busy or blocked lanes are left alone.
// Kept on disk: in memory, every app restart (an update relaunches it) gave every lane with
// open tasks a free run again. A task it didn't have counts as getting somewhere too.
// Kept by folder, for as long as the folder is there (CONTINUED_KEEP): a lane that dropped
// out of runs.json (60 kept, busy ops folders push lanes out daily) lost its record, and
// was given a free run again when it came back (review of 20 Oct 2026, finding 5).
const CONTINUED_KEEP = 30 * 86400000;
const CONTINUED_FILE = join(CONFIG_DIR, "continued.json");
function loadContinued() { try { const o = JSON.parse(readFileSync(CONTINUED_FILE, "utf8")); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; } }
function saveContinued(o) { try { writeJsonAtomic(CONTINUED_FILE, o, { indent: 0 }); } catch {} } // whole or not at all, yours only (0600)
// Getting somewhere is fewer open tasks than at the last continue, not more ticks, and at most
// AUTO_MAX automatic starts in an hour (these and handover reports, lanes.mjs report): runs tick
// their findings and add their own follow-ups, so the Bookly lane always looked busy and was
// started 12 times in 45 minutes on the same open item, plus 6 ops runs it handed over (21 Oct 2026).
// A start held back by the cap is kept as `due` and taken when the hour allows.
const CONTINUE_AFTER = 2 * 60000, AUTO_MAX = 3, AUTO_HOUR = 3600000;
const autoStarts = (rec, now) => ((rec && rec.starts) || []).filter((t) => now - t < AUTO_HOUR);
// Room for another automatic start in this folder this hour? Records it when `take`.
function autoStart(path, { now = Date.now(), take = true } = {}) {
  const all = loadContinued(), rec = all[path] || {}, starts = autoStarts(rec, now);
  if (starts.length >= AUTO_MAX) { if (take && !rec.due) { all[path] = { ...rec, starts, due: true }; saveContinued(all); } return false; }
  if (take) { all[path] = { ...rec, starts: [...starts, now] }; delete all[path].due; saveContinued(all); }
  return true;
}
function continueLanes({ now = Date.now(), run = runHandoff, runs = loadRuns } = {}) {
  const out = [], seen = loadContinued(), was = JSON.stringify(seen), paths = [...new Set(runs().map((r) => r.path).filter(Boolean))];
  for (const p of Object.keys(seen)) if (!paths.includes(p) && (!existsSync(p) || now - ((seen[p] && seen[p].at) || 0) > CONTINUED_KEEP)) delete seen[p];
  for (const path of paths) {
    try {
      if (runningHandoff(path) || isParked(path)) continue;
      const md = readSymbiot(path, "TASKS.md"), open = (md.match(/^\s*(?:[-*+]|\d+[.)])\s*\[ \]/gm) || []).length;
      if (!open) { delete seen[path]; continue; }
      let ended = 0; try { ended = statSync(join(path, ".symbiot", "agent.log")).mtimeMs; } catch { continue; }
      if (now - ended < CONTINUE_AFTER) continue;
      const ticked = (md.match(/^\s*(?:[-*+]|\d+[.)])\s*\[[xX]\]/gm) || []).length;
      const tasks = openTasks(path), last = seen[path], starts = autoStarts(last, now);
      if (starts.length >= AUTO_MAX) continue;
      // its newest run's record says why it stopped: only one that stopped with work it can still do
      // (paused) is started again; one waiting on the user, a lane, a reply or a time isn't (0.68.1)
      const rec = runRecord(path); if (rec && rec.state !== "paused") continue;
      if (last && last.open && !last.due && tasks.length >= last.open.length) continue;
      if (blockedAgain(path, runCmdOf(path))) continue;
      const e = run(path); if (e && e.id && !e.busy && !e.blocked) { seen[path] = { ticked, open: tasks, at: now, starts: [...starts, now] }; out.push(path); }
    } catch {}
  }
  if (JSON.stringify(seen) !== was) saveContinued(seen);
  return out;
}
// Judges each open question once, before it can be a card (triage.mjs). One at a time across
// all folders, and never two sweeps at once: each is an AI call.
let triaging = false;
async function triageSweep({ write = aiWrite, runs = loadRuns, rules = () => { try { return standingList().map((x) => x.rule); } catch { return []; } } } = {}) {
  if (triaging) return []; triaging = true; const out = [];
  try {
    let judging = false; try { judging = !!resolveProvider(); } catch {}
    if (!judging && write === aiWrite) return out;
    const map = (() => { try { return laneMap(); } catch { return {}; } })();
    for (const path of [...new Set(runs().map((r) => r.path).filter(Boolean))]) {
      let qs = []; try { qs = agentQuestions(path, "", { raw: true }).questions; } catch { continue; }
      try { sweepGone(path, qs.map((x) => x.q), { answers: readSymbiot(path, "ANSWERS.md") + readSymbiot(path, "ANSWERS.archive.md"), answeredElsewhere: (q) => { try { return isDone(q); } catch { return false; } } }); } catch {} // a card taken back unanswered: a miss
      for (const q of qs) {
        if (verdictOf(path, q.q) || GO_ID.test(q.id || "")) continue; // a Go on a held action needs no judging: it's the user's
        const lane = Object.keys(map).find((k) => map[k] === path) || (path.includes("/drafts/act-") ? "ops" : basename(path));
        let known = ""; try { const M = await import("./mind.mjs"); known = M.recallText(M.recall(`${q.q} ${q.context || ""}`)); } catch {} // what Symbiot remembers: the user's email, number, accounts…
        let v = null; try { v = await triageJudge(q, { answers: readSymbiot(path, "ANSWERS.md"), rules: rules(), lane, known }, { write }); } catch {}
        if (!v) continue;
        saveVerdict(path, q.q, v); out.push({ path, q: q.q, verdict: v.verdict });
        if (v.verdict === "symbiot") recordFault({ path, q: q.q, why: v.why, lane });
      }
    }
  } finally { triaging = false; }
  return out;
}
function autoAllowSweep() { const out = []; for (const r of loadRuns()) { try { tidySettings(r.path); } catch {} try { const a = autoAllow(r.path); if (a && a.allowed) out.push(r.path); else if (autoDecide(r.path)) out.push(r.path); } catch {} } return out; }
// Every agent reaches the owner's knowledge folders from the start; an ops run (no repo
// of its own) their repos too, the way a person at their desk would.
function withScope(tmpl, repoPath) {
  if (!isClaudeCmd(tmpl)) return tmpl;
  const dirs = new Set(); try { for (const k of knowledgeFolders()) dirs.add(k.path); } catch {}
  if (/\/drafts\/act-[^/]+$/.test(String(repoPath || ""))) { try { for (const p of Object.values(repoPathMap() || {})) dirs.add(p); } catch {} }
  dirs.delete(repoPath);
  let cmd = tmpl; for (const d of dirs) if (d && !wideRoot(d) && !cmd.includes(`--add-dir "${d}"`)) cmd += ` --add-dir "${d}"`; // --add-dir is read and write: never ~ (wideRoot)
  return cmd;
}
function grantFromStep(step, path = "", notes = {}) {
  const t = String(step || "");
  if (path && /allowlist\.proposed\.json|settings\.local\.json|press allow|\ballow list\b/i.test(t)) { const g = installAllowlist(path); if (g && g.refused) { notes.refused = g.refused; notes.sealed = !!g.sealed; return null; } if (g) return g; }
  if (!/only you: a permission|only you: what (this|the) agent|\b(let|allow) (the )?agents?\b|\ballow (access|reading)\b/i.test(t)) return null;
  const got = [];
  const dir = (t.match(/(~\/[^\s,;)`'"]+|\/(?:home|Users|opt|srv|mnt|media|tmp)\/[^\s,;)`'"]+)/) || [])[1];
  if (dir) { const d = dir.replace(/^~(?=\/)/, homedir()).replace(/[.]$/, ""); const r = grantAgent({ dir: d }); if (r && r.ok) got.push(d); }
  const tool = (t.match(/\b(?:run|use)\s+`([A-Za-z0-9._+-]+)`/) || [])[1];
  if (tool && !/^(sudo|rm|dd|mkfs)$/.test(tool)) { const r = grantAgent({ tool }); if (r && r.ok) got.push(tool); }
  return got.length ? got : null;
}
// The question an answer is for, from qKey -> question: the same words, or the start of
// one (a phone shows a long question cut short, ending in "…"), when only one starts so,
// or a card's plain words that start with it (Home's permission card adds "It wants to
// …" after the question: a page from before 0.63.7 sent those back, and the LoveLink
// Allow and Skip both came back "Pick or type at least one answer", 2026-10-12).
function findQuestion(qs, q) {
  const k = qKey(q); if (!k) return "";
  if (qs.has(k)) return qs.get(k);
  const cut = k.replace(/\s*(…|\.\.\.)$/, "");
  if (cut !== k && cut.length >= 20) { const hits = [...qs.keys()].filter((x) => x.startsWith(cut)); if (hits.length === 1) return qs.get(hits[0]); }
  const said = [...qs.keys()].filter((x) => x.length >= 20 && k.startsWith(x + " "));
  return said.length === 1 ? qs.get(said[0]) : "";
}
// What else an answer from the user reaches (lanes.mjs shareAnswer, set by server.mjs): the
// other agents on the same work. Only the user's own answers (opts.share), not Symbiot's picks.
let answered = null;
function onAnswered(fn) { answered = typeof fn === "function" ? fn : null; }
// Done / Allow on a permission card writes its rules into the folder's allow list itself:
// { ok, rules } when written, { error } when the card names no command or the rules are too wide.
function grantCard(path, text) {
  const rules = cardRules(text);
  if (!path || !rules.length) return { error: "That card doesn't name a command I can allow." };
  const g = installAllowlist(path, { allow: rules });
  if (!g) return { error: "I couldn't write the allow list in that folder." };
  if (g.refused) return { error: "Not allowed: " + g.refused.join(", ") + " would let an agent run anything." };
  return { ok: true, rules };
}
const stepText = (a) => String(a).split("🤖")[0].replace(/^\s*👤\s*(You:)?\s*/, "").replace(/\s*\(recommended\)\s*$/i, "").trim();
// A goal's card on Home (goals.mjs) is answered here too, by its path "goal:<id>": server.mjs sets how.
let goalAnswerer = null;
function onGoalAnswer(fn) { goalAnswerer = typeof fn === "function" ? fn : null; }
function answerQuestions(path, answers, opts = {}) {
  path = String(path || "");
  if (path.startsWith("goal:")) return goalAnswerer ? goalAnswerer(path, answers, opts) : { error: "Goals aren't on here yet." };
  if (!path || !knownRun(path)) return { error: "No agent has run in that folder." };
  for (const r of Array.isArray(answers) ? answers : []) try { if (r && r.q) noteCardWords(path, r.q, r.a); } catch {} // "you should know this": a question that wasn't the user's (triage.mjs)
  const openQs = agentQuestions(path, "", { raw: true }).questions, open = new Map(openQs.map((x) => [qKey(x.q), x.q]));
  // A card can outlive its question (the agent asked again, worded differently): Allow on it is
  // still a yes to the permission question now open, not a click that finds nothing and says nothing.
  const permQ = (openQs.find((x) => (x.options || []).some((o) => /allowlist\.proposed\.json/i.test(o)) || /allowlist\.proposed\.json/i.test(x.context || "")) || {}).q;
  const given = (Array.isArray(answers) ? answers : []).map((x) => ({ q: String((x && x.q) || ""), a: String((x && x.a) || "").replace(/^\s*#+/gm, "").trim().slice(0, TASK_MAX) })).filter((x) => x.a);
  const rows = given.map((x) => { const q = findQuestion(open, x.q); return { remap: !q, q: q || (permQ && /allowlist\.proposed\.json|^\W*(?:You|Agent)?:?\s*(?:\([^)]*\)\s*)?allow\b/i.test(x.a.replace(/^[^\w]*(?:👤|🤖)\s*/u, "")) ? permQ : undefined), a: x.a }; }).filter((x) => x.q);
  // An answer that is word for word an option of a different open question isn't this question's: a
  // stale card sent the "post it through Symbiot's browser" option under the LinkedIn sign-in question.
  const optKey = (o) => qKey(stepText(String(o).replace(/^\s*[👤🤖]\s*(?:You|Agent)?[^:]*:\s*/u, "")));
  const optsOf = (q) => new Set(((openQs.find((x) => qKey(x.q) === qKey(q)) || {}).options || []).map(optKey));
  const strays = rows.filter((x) => { const mine = optsOf(x.q), k = optKey(x.a); return k && !mine.has(k) && openQs.some((o) => qKey(o.q) !== qKey(x.q) && optsOf(o.q).has(k)); });
  for (const x of strays) rows.splice(rows.indexOf(x), 1);
  if (strays.length && !rows.length) return { error: "That answer belongs to a different question, not the one it was sent under. Look at the question again and pick one of its own options." };
  // pressed twice, or answered on another screen first: it's in ANSWERS.md already, so nothing is added again
  // the user's yes on a held action's Go releases it, even when that question was already answered (on
  // another screen, or for them before this rule): on 22 Oct 2026 the LinkedIn hold's card said
  // "answered already" and the hold stayed shut, so the action could never go through
  for (const x of given) { const m = (String(x.q || "").match(/\{#((?:chrome|phone)-go-[0-9a-f]+)\}/) || [])[1] || ((parseQuestions(readSymbiot(path, "QUESTIONS.md")).questions.find((q) => qKey(q.q) === qKey(noId(x.q))) || {}).id || ""); const g = m.match(/^chrome-go-([0-9a-f]+)$/), p = m.match(/^phone-go-([0-9a-f]+)$/); if ((g || p) && x.a && !/^\W*(?:no|don'?t|do not|skip|stop|cancel|not now)\b/i.test(x.a)) { if (g) goAhead(g[1]); else phoneGo(p[1]); } }
  if (!rows.length && given.length) {
    const had = new Map([...allAnswers(path).matchAll(/^###\s+(.+)$/gm)].map((m) => [qKey(noId(m[1])), noId(m[1])]));
    if (given.every((x) => findQuestion(had, x.q))) return { ok: true, saved: 0, already: true, note: "That was answered already: its agent has it." };
  }
  if (!rows.length) return { error: given.length ? "That question isn't open any more: its agent changed or closed it. Look again on its block on the Workdesk." : "Pick or type at least one answer." };
  // a secret in an answer (a token in a pasted curl) goes to the vault, named from the question it answers; ANSWERS.md, the
  // shared record and other lanes get "[saved: name]" (20 Oct 2026: a Cloudflare token stayed whole in saved answers)
  const vaulted = [];
  for (const x of rows) { try { const c = captureSecrets(x.a, { context: x.q }); if (c.saved.length) { x.a = `${c.text}\n(${c.saved.map((n) => `"${n}"`).join(", ")} ${c.saved.length > 1 ? "are" : "is"} in Symbiot's vault: ${VAULT_READ})`; vaulted.push(...c.saved); } } catch {} }
  // a reply that asks back (explain it, put it in Reports, a question of their own) isn't an answer: the run does what they asked first
  for (const x of rows) { const opts = (openQs.find((o) => qKey(o.q) === qKey(x.q)) || {}).options || []; if (asksBack(x.a, opts)) { x.back = x.a; x.a = `${x.a}\n\n${askBackNote(x.a)}`; } }
  // what was said on the card before this answer goes with it, and the card's talk is done
  for (const x of rows) { const t = talkOf(path, x.q); if (t.length) { x.a = `${x.a}\n\nOn this card, before this answer:\n${talkText(t)}`; endTalk(path, x.q); } }
  const prev = readSymbiot(path, "ANSWERS.md") || "# Answers from the user\nAnswers to the questions in QUESTIONS.md, newest last. Follow them; ask again in QUESTIONS.md if one is unclear.\n";
  const day = new Date().toISOString().slice(0, 10);
  try {
    mkdirSync(join(path, ".symbiot"), { recursive: true });
    for (const x of rows) x.id = (openQs.find((o) => qKey(o.q) === qKey(x.q)) || {}).id || ""; // answered by its id, too
    writeFileSync(join(path, ".symbiot", "ANSWERS.md"), prev.replace(/\s*$/, "\n") + rows.map((x) => `\n### ${x.q}${x.id ? ` {#${x.id}}` : ""}\n${x.a}\n_answered ${day}_\n`).join(""));
  } catch (e) { return { error: "Couldn't write ANSWERS.md: " + ((e && e.message) || e) }; }
  settleRecord(path, "answered"); // what its run waited for came: its record moves on (runOutcome)
  { const lane = whereOf(path).lane; for (const x of rows) recordDone(x.q, x.back || x.a, lane, { back: !!x.back, id: x.id }); }
  for (const x of rows) if (!x.back && closesAsk(x.a)) closeAsk(path, x.q); // "case closed": a later run restating it raises no card (needsOf)
  // Go on a held action in the user's own Chrome (a question with id chrome-go-<hold>): that one action may go through (chromegate.mjs)
  for (const x of rows) { const m = String(x.id || "").match(/^chrome-go-([0-9a-f]+)$/); if (m && !/^\W*(?:no|don'?t|do not|skip|stop|cancel|not now)\b/i.test(x.a)) goAhead(m[1]); }
  // Go on an adb command the membrane held, one that opens an app or acts on the screen of the user's phone (phone-go-<hold>): it may go through once (phonegate.mjs)
  for (const x of rows) { const m = String(x.id || "").match(/^phone-go-([0-9a-f]+)$/); if (m && !/^\W*(?:no|don'?t|do not|skip|stop|cancel|not now)\b/i.test(x.a)) phoneGo(m[1]); }
  // A yes to letting agents act on a site in the user's Chrome (chrome-act-<host>), or the first choice of a sign-in ask
  // that was really that switch (its card says so, plain.mjs): Symbiot switches it on itself, and the run is told so
  for (const x of rows) {
    const q = openQs.find((o) => qKey(o.q) === qKey(x.q)) || {}, picked = (q.options || []).findIndex((o) => optKey(o) === optKey(x.a));
    const m = String(x.id || "").match(/^chrome-act-(.+)$/), n = !m && picked === 0 ? signInNotNeeded([x.q, q.context].join("\n")) : null, host = m ? m[1] : n && n.off ? n.host : "";
    if (!host || picked < 0 || x.back || /^\W*(?:no|don'?t|do not|skip|stop|cancel|not now)\b/i.test(x.a)) continue;
    if (switchOnAct(host, { load: loadConfig, save: saveConfig })) try { writeFileSync(join(path, ".symbiot", "ANSWERS.md"), readSymbiot(path, "ANSWERS.md").replace(/\s*$/, "\n") + `\n### Symbiot: acting on ${host} in the user's Chrome {#chrome-act-${host}}\nSymbiot switched it on, as the user said (Settings → Connections): do the action again now, in your own tab. Nothing needed signing in.\n_${day}_\n`); } catch {}
  }
  // Go on a force-push the membrane held (push-go-<hold>): Symbiot pushes it itself (pushgate.mjs), the outcome goes into
  // ANSWERS.md, and the run carries on once it's in (below), so it never offers the user a setting that doesn't exist
  const pushes = rows.map((x) => { const m = String(x.id || "").match(/^push-go-([0-9a-f]+)$/); return m && !/^\W*(?:no|don'?t|do not|skip|stop|cancel|not now)\b/i.test(x.a) ? pushGo(m[1]).then((r) => { try { writeFileSync(join(path, ".symbiot", "ANSWERS.md"), readSymbiot(path, "ANSWERS.md").replace(/\s*$/, "\n") + `\n### Symbiot: the push you asked for {#${x.id}}\n${r.text}\n_${day}_\n`); } catch {} }) : null; }).filter(Boolean);
  const pushed = pushes.length ? Promise.all(pushes) : null;
  // "Deploy it?" for a lane with a runbook: Symbiot runs it itself (deploy.mjs onDeployAnswer), and the lane's agent is told so
  { const lane = whereOf(path).lane; for (const x of rows) if (/^Deploy /.test(x.q) && runbookOf(lane) && /^\W*(?:🤖\s*)?(?:Agent:\s*)?deploy\b/iu.test(x.a)) { onDeployAnswer(lane, x.q, x.a).catch(() => {}); try { writeFileSync(join(path, ".symbiot", "ANSWERS.md"), readSymbiot(path, "ANSWERS.md").replace(/\s*$/, "\n") + `\n### Symbiot: ${lane}'s deploy\nSymbiot started it itself, from ${lane}'s runbook, and checks it live: don't hand it to ops or deploy it another way.\n_${day}_\n`); } catch {} } }
  const out = { ok: true, saved: rows.length, ...(vaulted.length ? { vaulted } : {}) };
  // asked for something to read that's already written, since the question: say where it is
  if (rows.some((x) => x.back)) { let since = 0; try { since = statSync(join(path, ".symbiot", "QUESTIONS.md")).mtimeMs - 86400000; } catch {} const r = reportsSince(path, since).find((x) => !x.read); if (r) out.report = r.title; }
  if (opts.share && answered) { try { const to = answered(path, rows) || []; if (to.length) out.also = to.map((r) => r.lane || basename(r.path)); } catch {} }
  // a "wait until…" answer: the step is the question's 👤 option (what "it" is), and its files are waited on
  const asked = new Map(parseQuestions(readSymbiot(path, "QUESTIONS.md")).questions.map((x) => [qKey(x.q), x]));
  const youOpts = (q) => ((asked.get(qKey(q)) || {}).options || []).filter(yourStep).map((o) => o.split("🤖")[0]);
  const steps = rows.filter((x) => yourStep(x.a) || holdAnswer(x.a)).map((x) => yourStep(x.a) ? { step: stepText(x.a), named: x.a.split("🤖")[0] }
    : { step: (youOpts(x.q).map(stepText)[0] || x.a).trim(), named: [x.a, ...youOpts(x.q)].join(" ") });
  const granted = [], notes = {};
  // local git work picked as the user's step (typed in, or from a QUESTIONS.md written before this): the agent's, with an OK before a push
  const git = steps.map((s) => s.step).filter(gitWork);
  if (git.length) try { writeFileSync(join(path, ".symbiot", "ANSWERS.md"), readSymbiot(path, "ANSWERS.md").replace(/\s*$/, "\n") + `\n### Symbiot: that git work is yours to do, not the user's\nDo it yourself: ${git.join(" ")}. Check what's staged first, and ${PUSH_OK.replace("your OK", "the user's OK").replace("it pushes", "you push")}: ask in QUESTIONS.md and stop there.\n_${day}_\n`); } catch {}
  // Allow on a permission card is a 🤖 option naming the proposed list, so it isn't a step of the
  // user's: the click itself is their go-ahead, and without installing the list here the agent
  // asked again for the same permission (the click "did nothing").
  for (const x of rows) if (!yourStep(x.a) && !holdAnswer(x.a) && (/allowlist\.proposed\.json/i.test(x.a) || x.remap) && !/^\W*(?:🤖\s*(?:Agent:)?\s*)?(?:don'?t|do not|no|skip|leave)\b/i.test(x.a)) { const g = grantFromStep(`${x.a} (allowlist.proposed.json)`, path, notes); if (g) granted.push(...g); }
  let yours = steps.map((s) => s.step).filter(Boolean).filter((st) => !gitWork(st)).filter((st) => { const g = grantFromStep(st, path, notes); if (g) granted.push(...g); return !g; });
  if (granted.length) out.granted = granted;
  // A list too wide to turn on by a click: say which rules, tell the agent to ask for
  // less, and don't leave it as the user's step (picking it again would do nothing).
  if (notes.refused) {
    const which = notes.refused.slice(0, 3).map((r) => "`" + r + "`").join(", ");
    try { writeFileSync(join(path, ".symbiot", "ANSWERS.md"), readSymbiot(path, "ANSWERS.md").replace(/\s*$/, "\n") + `\n### Symbiot didn't turn your allow list on\n` + (notes.sealed
      ? `It has ${which}, which Symbiot never opens to a run's sandbox: its own keys and settings, or a socket that's a way out of the sandbox (the session's bus, Docker's, the screen's). Take those out of .symbiot/allowlist.proposed.json and ask again; if the work needs them, hand it to ops.`
      : `It has ${which}, which would let you run anything (a shell, sudo, or a wildcard rm/dd/chmod). Write a narrower .symbiot/allowlist.proposed.json: each such command spelled out exactly, the paths it touches named, and ask again.`) + `\n_${day}_\n`); } catch {}
    out.refused = notes.refused;
    yours = yours.filter((st) => !/allowlist\.proposed\.json|settings\.local\.json|press allow|\ballow list\b/i.test(st));
    out.note = `Not turned on: the list has ${which}, which ${notes.sealed ? "Symbiot never opens to an agent's sandbox" : "would let an agent run anything"}. Your agent has been asked for a narrower one` + (opts.rerun ? " and is starting again." : ".");
  }
  if (yours.length) {
    const step = yours.join(" "), files = namedFiles(steps.map((s) => s.named).join(" "), path);
    try { writeFileSync(join(path, ".symbiot", WAITING), JSON.stringify({ step, files: files.map((f) => ({ ...f, sig: fileSig(f.path) })), cmd: runCmd(path), at: Date.now(), rerun: !!opts.rerun })); } catch {}
    const on = waitOn(files.map((f) => f.name), settingsStep(step));
    out.yours = yours; if (files.length) out.waitFiles = files.map((f) => f.name);
    out.note = "Answers saved. That step is still yours to do. " + (on ? `Your agent ${opts.rerun ? "starts by itself" : "can start"} once ${on} changes${opts.rerun ? " (while Symbiot runs)" : ""}.` : "Once it's done, click Start it now on this folder.");
    return out;
  }
  if (opts.rerun && pushed) { pushed.then(() => { try { runHandoff(path); } catch {} }); out.note = "Answers saved. Symbiot is pushing it now, and your agent carries on once it's pushed."; }
  else if (opts.rerun) { const e = runHandoff(path); if (e && e.busy) out.note = "Answers saved. An agent is still running in that folder, so another wasn't started. Send them again once it finishes."; else if (e && e.blocked) out.note = "Answers saved. " + e.note; else if (e) out.rerun = e.id; else out.note = "Answers saved. Set an agent command in Settings to have the agent pick them up automatically."; }
  if (out.granted) out.note = "Allowed " + out.granted.join(", ") + " for your agents" + (opts.rerun ? ", and carried on. " : ". ") + (out.note || "");
  return out;
}
// An agent's question whose recommended answer is the user pasting or saving a secret the vault
// already holds: answered here, for the user, with where it is, and its agent started again. The
// name, or "" when the question isn't one (Home shows its card then).
function heldAsk(path, q, deps = {}) {
  const opt = ((q && q.options) || [])[0] || "", h = (deps.held || heldFor)(`${(q && q.q) || ""} ${/^\s*👤/.test(opt) ? opt : ""}`);
  if (!h) return "";
  const r = (deps.answer || answerQuestions)(path, [{ q: q.q, a: `Symbiot already holds it, in its vault as "${h}": ${VAULT_READ.replace("<name>", h)}. Never ask the user to paste or save it again.` }], { rerun: true });
  return r && r.ok ? h : "";
}
// What a run left for Symbiot's memory (.symbiot/REMEMBER.json, handback.mjs):
// shown on its block with Remember and Skip once it has stopped. [] when none.
const FACTS = "REMEMBER.json";
const factsOf = (path) => parseFacts(readSymbiot(path, FACTS));
// The open tasks' titles in a held brief (TASKS.next.md), or null if nothing is held.
function heldTasks(path) {
  const md = readSymbiot(path, HELD);
  return md ? md.split("\n").filter((l) => /^\s*-\s*\[ \]/.test(l)).map((l) => l.replace(/^\s*-\s*\[ \]\s*/, "").trim().slice(0, 200)) : null;
}
// The Agents tab: every tracked job, its log tail, what it changed, and — on the
// newest job per folder — the questions/ideas it left, any tasks held for it and
// a step of yours it waits on. Then runs from before the app started that still
// need you (earlierRuns).
// A run's work, to draw: parsed from its log (work.mjs), with how far through its
// TASKS.md it is, and (line) where it is in its brief's numbered steps, in a line, and
// whether it has gone quiet or is going round (work.mjs runLine). tail is what to show as text: what it said, for a streaming
// run; the log's end, for another agent.
// Claude Code in print mode (claude -p) streams each step as JSON, so the work
// can be drawn as it happens (work.mjs). Added to a claude -p command that has no
// output format of its own; anything else (an Orca tab, another agent) as it is.
function withStream(cmd) {
  const c = String(cmd || "");
  if (!isClaudeCmd(c) || !/\s-p\b|\s--print\b/.test(c) || /--output-format\b/.test(c)) return c;
  return c + " --output-format stream-json --verbose";
}
const firstOpen = (md) => { const l = String(md || "").split("\n").find((x) => /^\s*-\s*\[ \]/.test(x)); return l ? l.replace(/^\s*-\s*\[ \]\s*/, "").trim() : ""; };
// A [~] item waits on something outside the run (handed to ops, a reply, the user's sign-in): it's
// neither open nor done. Runs ticked those [x] to end with something ticked, and every card said
// finished while the run's own last words said the 16 Oct delivered count was still unread (21 Oct 2026).
const WAITING_TASK = /^\s*-\s*\[~\]\s*/;
const firstWaiting = (md) => { const l = String(md || "").split("\n").find((x) => WAITING_TASK.test(x)); return l ? l.replace(WAITING_TASK, "").trim() : ""; };
function workOf(path, log) {
  const w = parseRun(lastRunText(log)), md = readSymbiot(path, "TASKS.md");
  const done = (md.match(/^\s*-\s*\[x\]/gim) || []).length, waiting = (md.match(/^\s*-\s*\[~\]/gm) || []).length, total = done + waiting + (md.match(/^\s*-\s*\[ \]/gm) || []).length;
  const tail = w.stream ? (w.final || w.said.join("\n\n") || (w.doing ? w.doing + "…" : "")) : String(log).slice(-1200);
  const plan = w.stream ? briefPlan(md) : [], line = w.stream && !w.final ? runLine({ plan, step: stepOf(plan, w.talk), work: w }) : null;
  const work = w.stream ? { model: w.model, doing: w.doing, moved: w.moved, looping: w.looping, steps: w.steps.slice(-16), todos: w.todos, cost: w.cost, turns: w.turns, tokens: w.tokens, ctx: w.ctx, tests: w.tests, files: w.files, pace: w.pace, errors: w.errors, final: w.final.slice(0, 1200), restOn: waitingOn(w.final), count: w.steps.length } : null;
  // its kind (a brief, or answers) from its command line, and the task it's on: what estimate.mjs compares it with
  if (line) { const c = String(log || "").slice(String(log || "").lastIndexOf("\n=== ")).split("\n")[2] || ""; line.kind = kindOf(c); line.task = firstOpen(md).slice(0, 200); }
  return { tail, work, progress: total ? { done, total, ...(waiting ? { waiting, on: firstWaiting(md).slice(0, 200) } : {}) } : null, ...(line ? { line } : {}) };
}
// One state per run for the Agents view, from what the run shows: working (alive, moving), stuck (alive but
// quiet or going round), waiting (turn ended cleanly, and something outside it is awaited), paused (turn ended with
// tasks left: it is checked again), finished, failed.
function runPhase(a) {
  if (a.status === "running") return a.line && (a.line.quiet || a.line.looping) ? "stuck" : "working";
  const r = a.outcome; if (r) return r.state === "failed" ? "failed" : r.state === "waiting" ? "waiting" : r.state === "paused" ? "paused" : "finished"; // its record (runOutcome): one answer for every screen
  if (a.status !== "done") return "failed";
  const asks = Array.isArray(a.ask) ? a.ask.length : a.ask && a.ask.questions ? a.ask.questions.length : 0;
  if (a.waiting || a.needs || asks || (a.progress && a.progress.waiting)) return "waiting";
  if (a.progress && a.progress.total > 0 && a.progress.done < a.progress.total) return "paused";
  return "finished";
}
// An idea an agent tagged for another lane ("[repo: symbiot] …") is that lane's, not
// the card of the agent that had it (20 Oct: two ideas for symbiot sat on bookly's
// card, and the user asked why they were there). It moves to that lane's newest card,
// marked `from` the agent that had it, and keeps that agent's folder (`path`) so Skip
// still notes it where it was raised (SKIPPED.md), and it isn't suggested again. The
// source card keeps one line, `sent` ("2 ideas sent to symbiot"), and the ideas in
// `away`; one no card here takes (`delivered` false) the Home relay puts on its lane's
// project sheet. One the lane's own agent had in nearly the same words isn't added
// twice. + task adds it to its lane's tasks from either place (addTask: no duplicate).
function routeIdeas(list) {
  const lane = (a) => String(a.name || "").toLowerCase(), cards = new Map();
  const out = list.map((a) => (a.ask && a.ask.suggestions ? { ...a, ask: { ...a.ask, suggestions: a.ask.suggestions.slice() } } : a));
  for (const a of out) if (a.ask && a.ask.suggestions) { for (const k of [lane(a), basename(String(a.path || "")).toLowerCase()]) if (k && !cards.has(k)) cards.set(k, a); }
  for (const a of out) {
    const ss = (a.ask && a.ask.suggestions) || [], away = ss.filter((s) => s && s.other && !s.from);
    if (!away.length) continue;
    a.ask.suggestions = ss.filter((s) => !away.includes(s));
    const sent = {};
    a.ask.away = away.map((s) => {
      const t = cards.get(String(s.repo || "").toLowerCase()), to = t && t !== a ? t : null;
      sent[s.repo] = (sent[s.repo] || 0) + 1;
      if (to && !to.ask.suggestions.some((x) => sameTask(x.text, s.text))) to.ask.suggestions.push({ ...s, other: false, from: a.name, path: a.path });
      return { ...s, from: a.name, path: a.path, delivered: !!to };
    });
    a.ask.sent = Object.entries(sent).map(([repo, n]) => ({ repo, n }));
  }
  return out;
}
// One run's own part of its folder's shared agent.log: from the "=== name <start> ===" line
// track() wrote when it started, to the next such line. Read whole, six ops runs in one folder
// all showed the newest one's report, steps and cost, and an older one looked like a repeat of
// it (21 Oct 2026). An older run whose part the log no longer holds shows nothing, not the newest's.
const RUN_HEAD = /^=== .* (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z) ===$/gm;
function runSection(log, startedAt, newest = true) {
  const s = String(log || ""), heads = [...s.matchAll(RUN_HEAD)].map((m) => ({ at: Date.parse(m[1]), i: m.index }));
  let best = null; for (const h of heads) if (Math.abs(h.at - startedAt) < 60000 && (!best || Math.abs(h.at - startedAt) < Math.abs(best.at - startedAt))) best = h;
  if (!best) return newest ? s : "";
  const next = heads.find((h) => h.i > best.i);
  return "\n" + s.slice(best.i, next ? next.i : s.length);
}
// An earlier run's part of a folder's log: readRunLog keeps only the newest run's (for speed), so
// every earlier run of the same job listed as "0 steps, $0.00" and Symbiot looked dead while it
// worked (22 Oct 2026). The whole file, kept while its size and time are the same.
const WHOLE_LOG = new Map(), WHOLE_CAP = 32 * 1024 * 1024;
function wholeLog(file) {
  let st; try { st = statSync(file); } catch { return ""; }
  const hit = WHOLE_LOG.get(file); if (hit && hit.size === st.size && hit.mtime === st.mtimeMs) return hit.text;
  let text = ""; try { text = st.size > WHOLE_CAP ? "" : readFileSync(file, "utf8"); } catch {}
  WHOLE_LOG.set(file, { size: st.size, mtime: st.mtimeMs, text }); if (WHOLE_LOG.size > 40) WHOLE_LOG.delete(WHOLE_LOG.keys().next().value);
  return text;
}
function agentsList() {
  const seen = new Set(), jobs = (() => { try { return loadJobs(); } catch { return []; } })();
  return routeIdeas(HANDOFFS.map((e) => {
    const first = !seen.has(e.path); seen.add(e.path);
    const rec = e.status !== "running" ? recordOf(e.id, { jobs }) : null, outcome = rec ? { state: rec.state, waitingOn: rec.waitingOn || "", what: rec.what || "", summary: rec.summary || "" } : null;
    const own = workOf(e.path, first ? runSection(readRunLog(e.log), e.startedAt, true) : runSection(wholeLog(e.log), e.startedAt, false)), { tail, work, line } = own, progress = first ? own.progress : null; // an older run's ticks weren't kept: today's TASKS.md isn't its
    const facts = first && e.status !== "running" ? factsOf(e.path) : [];
    const waiting = first && e.status !== "running" ? waitingFor(e.path) : null;
    // a need is a card only while the run's record says it waits on the user: its last words alone made cards the record contradicted
    const needs = first && e.status !== "running" && (!outcome || (outcome.state === "waiting" && outcome.waitingOn === "user")) ? needsOf(e.path, { final: work ? tail : "", waiting, end: e.endedAt || Date.now(), start: e.startedAt }) : null;
    return { id: e.id, ...(outcome ? { outcome } : {}), name: e.name, path: e.path, status: e.status, startedAt: e.startedAt, endedAt: e.endedAt, elapsed: (e.endedAt || Date.now()) - e.startedAt, exitCode: e.exitCode, ...(e.down ? { down: e.down } : {}), tail, work, progress, ...(e.status === "running" && line ? { line } : {}), changed: agentChanges(e.path, e.startedAt, e.endedAt || 0), ask: first ? agentQuestions(e.path, e.name) : null, held: first ? heldTasks(e.path) : null, waiting, needs, remember: facts.length ? facts : null, fromHeld: !!e.fromHeld };
  }).concat(earlierRuns())).map((a) => ({ ...a, phase: runPhase(a) })).map(oneNeedEach());
}
// One subject is one card: the GitHub billing need came back from five runs, each worded its own
// way (21 Oct 2026). The newest run's need on a subject stays; an older one on the same subject,
// from any folder, is dropped.
function oneNeedEach() {
  const kept = [];
  return (a, i, all) => {
    if (!a.needs || !a.needs.what) return a;
    if (!kept.length) for (const b of [...all].filter((x) => x.needs && x.needs.what).sort((x, y) => (y.endedAt || y.startedAt || 0) - (x.endedAt || x.startedAt || 0))) if (!kept.some((k) => sameSubject(k.needs.what, b.needs.what))) kept.push(b);
    return kept.includes(a) ? a : { ...a, needs: null, phase: runPhase({ ...a, needs: null }) };
  };
}
// The same, kept AGENTS_KEEP for the screens that ask every few seconds (Home, the work scene,
// the Agents tab, the phone): each built it again, reading every run's log and questions, so one
// 10 s tick built it two or three times over (20 Oct 2026). A run starting or ending (HANDOFFS),
// or anything you do (forgetAgents, on a POST), builds it afresh.
const AGENTS_KEEP = 5000; let agentsKept = null;
const handoffsSig = () => HANDOFFS.map((e) => e.id + ":" + e.status).join(",");
function agentsNow({ now = Date.now() } = {}) {
  const sig = handoffsSig();
  if (agentsKept && agentsKept.sig === sig && now - agentsKept.at < AGENTS_KEEP) return agentsKept.v;
  const v = agentsList(); agentsKept = { at: now, sig, v }; return v;
}
const forgetAgents = () => { agentsKept = null; };

export { ensureRunnable, opsWalls, walled, OPS_RO, OPS_OWN, OPS_HIDDEN, runOpen, namedRun, twinRunning, TWIN_WAIT, wholeLog, uiReview, onGoalAnswer, runOutcome, settleRecord, waitsOutside, triageSweep, runSection, autoStart, AUTO_MAX, oneNeedEach, NOTHING_FOR_YOU, chaseReport, CHASED, UNMET, heldAsk, onCardGone, withOwnTools, escalation, grantCard, cardRules, cardIsPermission, runPhase, onRunEnd, isClaudeCmd, GUARD, tidyRule, tidyRules, tidySettings, pruneRuns, claudePlugins, idlePlugins, runSettings, archiveAnswers, allAnswers, answersDigest, ANSWERS_ARCHIVE, ANSWERS_KEEP, runsTick, RUN_START, HANG_MIN, noteBlocked, userAnswers, CONTINUED_FILE, onAnswered, CHANGES, toKnownHost, continueLanes, autoPick, autoDecide, FACTS, factsOf, knownRun, withStream, workOf, HANDOFFS, HANDOFF_PROMPT, QUESTIONS_MAX, OPTIONS_SHOWN, IDEAS_SHOWN, shSingle, CLAUDE_CMD, ORCA_CLAUDE_CMD, handoffCmd, setHandoffCmd, grantAgent, grantRule, allowTool, claudeConnectors, withConnectors, linkedConnectors, connectorsLine, connectorsInfo, linkReach, fillHandoff, runHandoff, nothingToDo, whereOf, whereLine, whereAnswer, askTask, PARKED_NOTE, parkedPaths, isParked, parkLane, agentMissing, blockedAgain, runningHandoff, loadRuns, earlierRuns, namedFiles, unchangedStep, waitingFor, startWaiting, noteUntracked, untrackedBefore, forgetUntracked, writeTasks, droppedTasks, releaseHeldTasks, startHeldTasks, detectHandoffs, pickAgent, findOrcaCli, orcaHandoffCmd, migrateOrcaCmd, migrateClaudeCmd, track, agentChanges, parseQuestions, suggestionTarget, skipIdea, routeIdeas, agentQuestions, answerQuestions, agentsList, agentsNow, forgetAgents, AGENTS_KEEP, needsOf, settleNeeds, closeAsk, closedAsk, sameSubject, NEEDS_FOR, readLastWords, readNeeds, parseRead, READ_FILE, autoAllow, autoAllowSweep, allowlistInWork, installAllowlist, inWork, withScope, withTrust, sandboxFor, sandboxLifts, sandboxEnv, sandboxNeeds, sandboxState, sandboxWrites, SANDBOX_DIR, resumeFor, noteSession, tooLong, carryOn, RESUME_CTX, CARRY_PROMPT, trustFull, GUARD_SETTINGS, runCmdOf, claimLock, wideRoot, sandboxDenies, questionFolders, folderState, dirtyState, ANSWERS_SEEN, newAnswers, claudeDownIn, claudePause, noteClaudeDown, resetTime, PAUSE_FILE, startGap, isUrgent, urgentStop, urgentFirst, urgentUndo, urgentDone, urgentSweep, urgentState, licenceGate, stopRun, loadRunFiles, saveRunFiles, forgetRunFiles, withModel, routedModel, userWords, onShipping, waitingTask };
