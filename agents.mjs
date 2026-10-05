// Handing a repo to the user's agent: the saved command template, the one-click
// presets (and the Orca IDE one), the background-job registry behind the Agents
// tab, and the questions an unattended agent leaves for the user.
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, writeSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { loadConfig, saveConfig, loadTasks, sh, hasCmd } from "./core.mjs";

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
const HANDOFF_PROMPT = "Read .symbiot/TASKS.md and implement the unchecked items in this repo. Tick each item [x] in that file as you finish it and leave your changes uncommitted, so they can be reviewed and approved. If you need a decision, or have ideas or options for the user, write them to .symbiot/QUESTIONS.md as TASKS.md explains, and read .symbiot/ANSWERS.md first if it exists. Confirm before anything destructive.";
function handoffCmd() { const cfg = loadConfig(); return migrateOrcaCmd(migrateClaudeCmd(cfg.agentCmd)) || (cfg.ide ? `${cfg.ide} {dir}` : ""); } // ide = legacy
// Save the template ("" clears it). Either way the legacy `ide` key goes.
function setHandoffCmd(cmd) {
  const cfg = loadConfig(); const v = String(cmd || "").trim();
  if (v) cfg.agentCmd = v; else delete cfg.agentCmd;
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
  if (/^[A-Za-z]+\(.*\)$/.test(t)) return t;
  t = t.replace(/[()"'`]/g, "").replace(/:\*$/, "").trim();
  return t ? `Bash(${t}:*)` : "";
}
function grantAgent({ tool, dir } = {}) {
  const cfg = loadConfig(); let cmd = (cfg.agentCmd || CLAUDE_CMD).trim();
  if (!/^\s*claude\b/.test(cmd)) return { error: "Grants apply to the Claude agent command. Pick a Claude preset first, or edit the command directly." };
  if (tool) {
    const t = grantRule(tool);
    if (t && !cmd.includes(`"${t}"`)) {
      if (/--allowedTools\b/.test(cmd)) cmd = cmd.replace(/(--allowedTools\s+(?:"[^"]*"\s*)+)/, (m) => m.trimEnd() + ` "${t}" `);
      else cmd += ` --allowedTools "${t}"`;
    }
  }
  if (dir) { const d = String(dir).trim(); if (d && !cmd.includes(`--add-dir "${d}"`)) cmd += ` --add-dir "${d}"`; }
  cmd = cmd.replace(/\s+/g, " ").trim();
  cfg.agentCmd = cmd; saveConfig(cfg);
  return { ok: true, cmd };
}
const fillHandoff = (tmpl, repoPath) => tmpl.replace(/\{dir\}/g, shSingle(repoPath)).replace(/\{prompt\}/g, escDq(HANDOFF_PROMPT));
// One agent per folder: two identical runs once started on the same repo 6s
// apart and raced each other. The registry catches a second click in this
// process; .symbiot/agent.pid catches another one (`symbiot push --open` while
// the app is up). Returns the job, null (no command set) or { busy, id, pid }.
// A preset that only opens a tab (Orca, editors) exits at once, so it holds
// the folder only that long. A busy result's `auto` says whether the process
// that started that agent is still up to start one on the held tasks.
function runHandoff(repoPath) {
  const tmpl = handoffCmd(); if (!tmpl || !repoPath) return null;
  const busy = runningHandoff(repoPath); if (busy) return { busy: true, id: busy.id || "", pid: busy.pid, auto: !!busy.auto };
  releaseHeldTasks(repoPath); // held for an agent another process started, which has since exited
  const lock = join(repoPath, ".symbiot", LOCK);
  const e = track(repoPath.split("/").pop(), fillHandoff(tmpl, repoPath), repoPath, () => {
    try { if (JSON.parse(readFileSync(lock, "utf8")).pid === e.pid) unlinkSync(lock); } catch {}
    startHeldTasks(repoPath); // tasks sent while it ran land now; start on them as that Send would have
  });
  if (!e) return null;
  e.handoff = true;
  if (e.pid) try { writeFileSync(lock, JSON.stringify({ pid: e.pid, id: e.id, startedAt: e.startedAt, owner: process.pid })); } catch {}
  return e;
}
const LOCK = "agent.pid";
const LOCK_MAX_AGE = 12 * 3600 * 1000; // older than this, the pid has probably been reused
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (err) { return !!err && err.code === "EPERM"; } };
// The agent still running in this folder, if any. `auto`: its exit will be
// seen (this process started it, or its owner — e.g. the app — is still up).
// `symbiot push --open` returns right after starting one, so it never is.
function runningHandoff(path) {
  const e = HANDOFFS.find((x) => x.handoff && x.path === path && x.status === "running");
  if (e) return { id: e.id, pid: e.pid, startedAt: e.startedAt, auto: true };
  try {
    const l = JSON.parse(readSymbiot(path, LOCK));
    if (l && Number.isInteger(l.pid) && Date.now() - l.startedAt < LOCK_MAX_AGE && pidAlive(l.pid)) return { ...l, auto: Number.isInteger(l.owner) && pidAlive(l.owner) };
  } catch {}
  return null;
}
// Send to repos while an agent is still running in the folder doesn't rewrite
// the TASKS.md it's working from: the new brief waits in TASKS.next.md and
// replaces TASKS.md once that agent exits. Returns true if it was held.
const HELD = "TASKS.next.md";
function writeTasks(path, md) {
  const dir = join(path, ".symbiot"); mkdirSync(dir, { recursive: true });
  if (runningHandoff(path)) { writeFileSync(join(dir, HELD), md); return true; }
  writeFileSync(join(dir, "TASKS.md"), md);
  try { unlinkSync(join(dir, HELD)); } catch {} // superseded by this brief
  return false;
}
// Swap the held brief in, keeping the ticks the agent made meanwhile: a tick
// is how a task reaches review, so dropping one would lose that task's work.
function releaseHeldTasks(path) {
  const held = readSymbiot(path, HELD); if (!held || runningHandoff(path)) return false;
  const isTick = /^\s*-\s*\[x\]\s*/i, key = (l) => l.replace(/^\s*-\s*\[[ x]\]\s*/i, "").trim().toLowerCase();
  const ticked = new Set(readSymbiot(path, "TASKS.md").split("\n").filter((l) => isTick.test(l)).map(key));
  const md = held.split("\n").map((l) => /^\s*-\s*\[ \]/.test(l) && ticked.has(key(l)) ? l.replace("[ ]", "[x]") : l).join("\n");
  try { writeFileSync(join(path, ".symbiot", "TASKS.md"), md); unlinkSync(join(path, ".symbiot", HELD)); return true; } catch { return false; }
}
// Land the held brief and, if it leaves anything open, start an agent on it.
// Runs when an agent this process started exits, and when the app next checks
// the repo (syncTasks), which covers one `symbiot push --open` started: that
// process is gone by the time its agent finishes. A held brief is released only
// once, so this can't loop. Returns the new job, or null.
function startHeldTasks(path) {
  if (!releaseHeldTasks(path) || !/^\s*-\s*\[ \]/m.test(readSymbiot(path, "TASKS.md"))) return null;
  const n = runHandoff(path); if (!n || n.busy) return null;
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
  for (const r of roots) { if (!r) continue; const hit = sh(`find ${JSON.stringify(r)} -maxdepth 6 -name orca-ide -type f 2>/dev/null | head -1`).trim(); if (hit) return hit; }
  return "";
}
// ---- background jobs --------------------------------------------------------
// Run a shell command as a tracked, logged background job that shows up live in
// the Agents tab. Shared by the agent handoff and the local-model setup.
function track(name, cmd, cwd, onExit) {
  try {
    const dir = join(cwd, ".symbiot"); mkdirSync(dir, { recursive: true });
    const logp = join(dir, "agent.log");
    let fd = "ignore"; try { fd = openSync(logp, "a"); writeSync(fd, `\n=== ${name} ${new Date().toISOString()} ===\n$ ${cmd}\n`); } catch {}
    const entry = { id: randomBytes(4).toString("hex"), name, path: cwd, log: logp, startedAt: Date.now(), status: "running", exitCode: null, endedAt: null };
    const child = spawn(cmd, { shell: true, cwd, detached: true, stdio: ["ignore", fd === "ignore" ? "ignore" : fd, fd === "ignore" ? "ignore" : fd] });
    entry.pid = child.pid;
    child.on("exit", (code) => { entry.status = code === 0 ? "done" : "failed"; entry.exitCode = code; entry.endedAt = Date.now(); if (onExit) try { onExit(code); } catch {} });
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
function agentChanges(path, startedAt) {
  try {
    const q = JSON.stringify(path);
    const porcelain = sh(`git -C ${q} status --porcelain`).trim();
    // Don't count Symbiot's own .symbiot/ dir (agent.log, TASKS.md) as the agent's work.
    const dirty = porcelain ? porcelain.split("\n").filter((l) => { const p = l.slice(3); return p !== ".symbiot" && p !== ".symbiot/" && p.indexOf(".symbiot/") !== 0; }).length : 0;
    const stat = (sh(`git -C ${q} diff --shortstat`).trim() || sh(`git -C ${q} diff --cached --shortstat`).trim()).replace(/^\s+/, "");
    const since = new Date(startedAt || Date.now()).toISOString();
    const raw = sh(`git -C ${q} log --since=${JSON.stringify(since)} --pretty=%h\u0001%s`).trim();
    const commits = raw ? raw.split("\n").slice(0, 8).map((l) => { const i = l.indexOf("\u0001"); return { hash: l.slice(0, i), msg: l.slice(i + 1) }; }) : [];
    return { dirty, stat, commits };
  } catch { return { dirty: 0, stat: "", commits: [] }; }
}
// ---- agent questions: decisions, options and ideas, from ANY agent ---------
// A handoff runs unattended (claude -p, codex exec, aider --message, …), so the
// agent can't stop and ask in chat. TASKS.md tells it to write
// .symbiot/QUESTIONS.md instead — questions with options, plus ideas — which
// the Agents tab shows on that agent's block. The user's answers are appended to
// .symbiot/ANSWERS.md for the next run to read. Plain files, so it works the
// same whichever model or tool the agent is.
const QUESTIONS_MAX = 5;
const qKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const readSymbiot = (path, f) => { try { return readFileSync(join(path, ".symbiot", f), "utf8"); } catch { return ""; } };
// "## Questions" → "### question", context lines, "- option" bullets;
// "## Suggestions" (or Ideas / Follow-ups) → "- idea" bullets. Forgiving: a bare
// bullet under Questions is a question with no options.
function parseQuestions(md) {
  const questions = [], suggestions = []; let sec = "q", cur = null;
  const clip = (s) => String(s).trim().slice(0, 300);
  for (const raw of String(md || "").split(/\r?\n/)) {
    const l = raw.trim(); if (!l) continue;
    let m;
    if ((m = l.match(/^###\s+(.+)$/))) {
      if (sec === "s") { suggestions.push(clip(m[1])); cur = null; }
      else { cur = { q: clip(m[1]), context: "", options: [] }; questions.push(cur); }
      continue;
    }
    if ((m = l.match(/^##\s+(.+)$/))) { sec = /suggest|idea|follow|option/i.test(m[1]) ? "s" : "q"; cur = null; continue; }
    if (/^#\s/.test(l)) continue;
    const b = l.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+)$/);
    if (sec === "s") { if (b) suggestions.push(clip(b[1])); continue; }
    if (b) { if (cur) cur.options.push(clip(b[1])); else if (/\?\s*$/.test(b[1])) questions.push({ q: clip(b[1]), context: "", options: [] }); continue; } // a bullet with no "### question" above it is a question only if it actually ends in "?" — otherwise it's preamble/prose (a file list, etc.)
    if (cur) cur.context = clip((cur.context ? cur.context + " " : "") + l);
  }
  return { questions: questions.filter((x) => x.q).slice(0, 20).map((x) => ({ ...x, options: x.options.slice(0, 6) })), suggestions: suggestions.filter(Boolean).slice(0, 10) };
}
// An idea for another project names it first: "[repo: symbiot] Watch GitHub
// too" is for the symbiot repo's tasks, whichever repo's agent had it (an agent
// working on coral may have ideas for Symbiot, the app that sent it). Gives
// { repo, text }, repo "" when the idea doesn't name one.
function suggestionTarget(s) {
  const m = String(s || "").match(/^\[repo:\s*([^\]]*?)\s*\]\s*(.+)$/i);
  return m && m[1] ? { repo: m[1], text: m[2].trim() } : { repo: "", text: String(s || "") };
}
// The OPEN questions (not yet in ANSWERS.md) and the agent's ideas, each with
// the repo whose tasks it goes to (this one unless it names another) and marked
// if it's already on that repo's task list.
function agentQuestions(path, repo) {
  const p = parseQuestions(readSymbiot(path, "QUESTIONS.md"));
  const done = new Set([...readSymbiot(path, "ANSWERS.md").matchAll(/^###\s+(.+)$/gm)].map((m) => qKey(m[1])));
  const open = p.questions.filter((x) => !done.has(qKey(x.q)));
  const tasks = p.suggestions.length ? loadTasks() : [];
  return {
    questions: open.slice(0, QUESTIONS_MAX), answered: p.questions.length - open.length,
    suggestions: p.suggestions.map(suggestionTarget).map(({ repo: to, text }) => ({ text, repo: to || repo, other: !!to && to !== repo, added: tasks.some((t) => t.repo === (to || repo) && qKey(t.text) === qKey(text)) })),
  };
}
// Save answers to .symbiot/ANSWERS.md; opts.rerun hands the repo back to the
// agent (same saved command) so it carries on with them.
function answerQuestions(path, answers, opts = {}) {
  path = String(path || "");
  if (!path || !HANDOFFS.some((e) => e.path === path)) return { error: "No agent has run in that folder." };
  const open = new Map(agentQuestions(path, "").questions.map((x) => [qKey(x.q), x.q]));
  const rows = (Array.isArray(answers) ? answers : [])
    .map((x) => ({ q: open.get(qKey(x && x.q)), a: String((x && x.a) || "").replace(/^\s*#+/gm, "").trim().slice(0, 2000) }))
    .filter((x) => x.q && x.a);
  if (!rows.length) return { error: "Pick or type at least one answer." };
  const prev = readSymbiot(path, "ANSWERS.md") || "# Answers from the user\nAnswers to the questions in QUESTIONS.md, newest last. Follow them; ask again in QUESTIONS.md if one is unclear.\n";
  const day = new Date().toISOString().slice(0, 10);
  try {
    mkdirSync(join(path, ".symbiot"), { recursive: true });
    writeFileSync(join(path, ".symbiot", "ANSWERS.md"), prev.replace(/\s*$/, "\n") + rows.map((x) => `\n### ${x.q}\n${x.a}\n_answered ${day}_\n`).join(""));
  } catch (e) { return { error: "Couldn't write ANSWERS.md: " + ((e && e.message) || e) }; }
  const out = { ok: true, saved: rows.length };
  if (opts.rerun) { const e = runHandoff(path); if (e && e.busy) out.note = "Answers saved. An agent is still running in that folder, so another wasn't started. Send them again once it finishes."; else if (e) out.rerun = e.id; else out.note = "Answers saved. Set an agent command in Settings to have the agent pick them up automatically."; }
  return out;
}
// The open tasks' titles in a held brief (TASKS.next.md), or null if nothing is held.
function heldTasks(path) {
  const md = readSymbiot(path, HELD);
  return md ? md.split("\n").filter((l) => /^\s*-\s*\[ \]/.test(l)).map((l) => l.replace(/^\s*-\s*\[ \]\s*/, "").trim().slice(0, 200)) : null;
}
// The Agents tab: every tracked job, its log tail, what it changed, and — on the
// newest job per folder — the questions/ideas it left and any tasks held for it.
function agentsList() {
  const seen = new Set();
  return HANDOFFS.map((e) => {
    let tail = ""; try { tail = readFileSync(e.log, "utf8").slice(-1200); } catch {}
    const first = !seen.has(e.path); seen.add(e.path);
    return { id: e.id, name: e.name, path: e.path, status: e.status, elapsed: (e.endedAt || Date.now()) - e.startedAt, exitCode: e.exitCode, tail, changed: agentChanges(e.path, e.startedAt), ask: first ? agentQuestions(e.path, e.name) : null, held: first ? heldTasks(e.path) : null, fromHeld: !!e.fromHeld };
  });
}

export { HANDOFFS, HANDOFF_PROMPT, QUESTIONS_MAX, shSingle, CLAUDE_CMD, ORCA_CLAUDE_CMD, handoffCmd, setHandoffCmd, grantAgent, grantRule, fillHandoff, runHandoff, runningHandoff, writeTasks, releaseHeldTasks, startHeldTasks, detectHandoffs, orcaHandoffCmd, migrateOrcaCmd, migrateClaudeCmd, track, agentChanges, parseQuestions, suggestionTarget, agentQuestions, answerQuestions, agentsList };
