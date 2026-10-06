// Handing a repo to the user's agent: the saved command template, the one-click
// presets (and the Orca IDE one), the background-job registry behind the Agents
// tab, and the questions an unattended agent leaves for the user.
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, writeSync, unlinkSync, readdirSync, statSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { CONFIG_DIR, loadConfig, saveConfig, loadTasks, TASK_MAX, clipWords, sameTask, taskWords, sh, hasCmd } from "./core.mjs";
import { parseRun, lastRunText } from "./work.mjs";
import { parseFacts } from "./handover.mjs";

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
// Add a rule to a Claude command's --allowedTools (or start the flag), once.
function allowTool(cmd, t) {
  if (!t || cmd.includes(`"${t}"`)) return cmd;
  if (/--allowedTools\b/.test(cmd)) return cmd.replace(/(--allowedTools\s+(?:"[^"]*"\s*)+)/, (m) => m.trimEnd() + ` "${t}" `);
  return cmd + ` --allowedTools "${t}"`;
}
const isClaudeCmd = (cmd) => /^\s*claude\b/.test(String(cmd || ""));
function grantAgent({ tool, dir } = {}) {
  const cfg = loadConfig(); let cmd = (cfg.agentCmd || CLAUDE_CMD).trim();
  if (!isClaudeCmd(cmd)) return { error: "Grants apply to the Claude agent command. Pick a Claude preset first, or edit the command directly." };
  if (tool) cmd = allowTool(cmd, grantRule(tool));
  if (dir) { const d = String(dir).trim(); if (d && !cmd.includes(`--add-dir "${d}"`)) cmd += ` --add-dir "${d}"`; }
  cmd = cmd.replace(/\s+/g, " ").trim();
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
const fillHandoff = (tmpl, repoPath) => tmpl.replace(/\{dir\}/g, shSingle(repoPath)).replace(/\{prompt\}/g, escDq(HANDOFF_PROMPT));
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
function runHandoff(repoPath, { force = false } = {}) {
  let tmpl = handoffCmd(); if (!tmpl || !repoPath) return null;
  let opts = {}; try { opts = JSON.parse(readSymbiot(repoPath, "handoff.json")) || {}; } catch {}
  const busy = runningHandoff(repoPath); if (busy) return { busy: true, id: busy.id || "", pid: busy.pid, auto: !!busy.auto };
  releaseHeldTasks(repoPath); // held for an agent another process started, which has since exited
  tmpl = withStream(withConnectors(tmpl, repoPath));
  if (!force) { const w = waitingFor(repoPath); if (w) { askedFor(repoPath); return { blocked: true, waiting: true, questions: 0, note: waitNote(w) }; } }
  const blocked = !force && blockedAgain(repoPath, tmpl); if (blocked) return blocked;
  try { unlinkSync(join(repoPath, ".symbiot", WAITING)); } catch {} // the step's done (or this is Start it anyway): this is the run it waited for
  const lock = join(repoPath, ".symbiot", LOCK);
  const env = opts.env && typeof opts.env === "object" ? Object.fromEntries(Object.entries(opts.env).map(([k, v]) => [k, String(v)])) : null;
  const e = track(typeof opts.name === "string" && opts.name ? opts.name.slice(0, 80) : repoPath.split("/").pop(), fillHandoff(tmpl, repoPath), repoPath, (code) => {
    try { if (JSON.parse(readFileSync(lock, "utf8")).pid === e.pid) unlinkSync(lock); } catch {}
    noteBlocked(repoPath, tmpl, e.startedAt, code);
    startHeldTasks(repoPath); // tasks sent while it ran land now; start on them as that Send would have
  }, env);
  if (!e) return null;
  e.handoff = true;
  if (e.pid) try { writeFileSync(lock, JSON.stringify({ pid: e.pid, id: e.id, startedAt: e.startedAt, owner: process.pid })); } catch {}
  noteRun(e);
  return e;
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
function loadRuns() { try { const a = JSON.parse(readFileSync(RUNS_FILE, "utf8")); return Array.isArray(a) ? a.filter((r) => r && typeof r.path === "string" && r.path) : []; } catch { return []; } }
function noteRun(e) {
  const list = [{ path: e.path, name: e.name, startedAt: e.startedAt }, ...loadRuns().filter((r) => r.path !== e.path)].slice(0, RUNS_MAX);
  try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(RUNS_FILE, JSON.stringify(list, null, 2), { mode: 0o600 }); } catch {}
}
const knownRun = (path) => HANDOFFS.some((e) => e.path === path) || loadRuns().some((r) => r.path === path);
// The Agents tab's block for a run another process (or this app before a
// restart) started: as agentsList gives one, marked `earlier`. Its end is when
// its log last changed; its exit code isn't known.
function earlierRuns() {
  const tracked = new Set(HANDOFFS.map((e) => e.path)), out = [];
  for (const r of loadRuns()) {
    if (tracked.has(r.path) || !existsSync(join(r.path, ".symbiot"))) continue;
    const busy = runningHandoff(r.path), ask = agentQuestions(r.path, r.name), wait = waitingFor(r.path), facts = busy ? [] : factsOf(r.path);
    if (!busy && !ask.questions.length && !wait && !facts.length) continue;
    const log = join(r.path, ".symbiot", "agent.log"), startedAt = (busy && busy.startedAt) || Number(r.startedAt) || Date.now();
    let tail = "", work = null, progress = null, end = Date.now(); try { ({ tail, work, progress } = workOf(r.path, readFileSync(log, "utf8"))); if (!busy) end = statSync(log).mtimeMs; } catch {}
    out.push({ id: "earlier-" + digest(r.path).slice(0, 8), name: String(r.name || r.path.split("/").pop()), path: r.path, status: busy ? "running" : "done", earlier: true, elapsed: Math.max(0, end - startedAt), exitCode: null, tail, work, progress, changed: agentChanges(r.path, startedAt), ask, held: heldTasks(r.path), waiting: wait, remember: facts.length ? facts : null, fromHeld: false });
  }
  return out;
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
const settingsStep = (s) => /\bsettings\b|\ballow\b|\bgrant|connector/i.test(String(s || ""));
// The command the folder's next run would get, connectors and all (runHandoff).
const runCmd = (path) => digest(withConnectors(handoffCmd(), path));
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
// What a folder is waiting on: { step, files: [names], cmd, at, rerun }, or null
// once a file it names, or the agent command, has changed. Then waiting.json
// goes, unless a run was asked for: startWaiting needs it to start that one (the
// Agents tab asks this every few seconds, and used to lose it first), and the
// run deletes it as it starts. cmd: the step is one in Settings, so the note says
// the command counts.
function waitingFor(path) {
  let w = null; try { w = JSON.parse(readSymbiot(path, WAITING)); } catch {}
  if (!w || typeof w.step !== "string") return null;
  const files = Array.isArray(w.files) ? w.files : [];
  if (files.some((f) => f && fileSig(f.path) !== f.sig) || (w.cmd && runCmd(path) !== w.cmd)) { if (!w.rerun) try { unlinkSync(join(path, ".symbiot", WAITING)); } catch {} return null; }
  return { step: w.step, files: files.map((f) => f.name), cmd: !!w.cmd && settingsStep(w.step), at: w.at || 0, rerun: !!w.rerun };
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
const BLOCKED = "blocked.json";
const digest = (s) => createHash("sha1").update(String(s)).digest("hex").slice(0, 16);
const openTasks = (path) => readSymbiot(path, "TASKS.md").split("\n").filter((l) => /^\s*-\s*\[ \]/.test(l)).map((l) => taskWords(l.replace(/^\s*-\s*\[ \]\s*/, ""))).filter(Boolean);
function runInputs(path, cmd) {
  let files = [], env = ""; try { files = readdirSync(path).filter((f) => /^\.env(\..+)?$/.test(f) && !/\.(example|sample|template)$/.test(f)).sort(); } catch {}
  for (const f of files) { try { env += f + "\0" + readFileSync(join(path, f), "utf8") + "\0"; } catch {} }
  return { env: digest(env), answers: digest(readSymbiot(path, "ANSWERS.md")), cmd: digest(cmd), open: openTasks(path) };
}
function noteBlocked(path, cmd, startedAt, code) {
  const f = join(path, ".symbiot", BLOCKED);
  let asked = false; try { asked = statSync(join(path, ".symbiot", "QUESTIONS.md")).mtimeMs >= startedAt; } catch {}
  const questions = asked ? agentQuestions(path, "").questions.length : 0, inputs = runInputs(path, cmd);
  try {
    if (code === 0 && questions && inputs.open.length) writeFileSync(f, JSON.stringify({ at: Date.now(), questions, ...inputs }));
    else unlinkSync(f);
  } catch {}
}
function blockedAgain(path, cmd) {
  let b = null; try { b = JSON.parse(readSymbiot(path, BLOCKED)); } catch {}
  if (!b || !Array.isArray(b.open)) return null;
  const now = runInputs(path, cmd), was = new Set(b.open);
  if (now.env !== b.env || now.answers !== b.answers || now.cmd !== b.cmd || !now.open.length || now.open.some((t) => !was.has(t))) return null;
  const n = b.questions || 0, them = n === 1 ? "it" : "them";
  return { blocked: true, questions: n, note: `Not started: the last run here stopped on ${n} question${n === 1 ? "" : "s"}, and .env and ANSWERS.md haven't changed since, so another run would only ask again. Answer ${them} or change .env, then send again.` };
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
  writeFileSync(join(dir, "TASKS.md"), md); noteHanded(path, md);
  try { unlinkSync(join(dir, HELD)); } catch {} // superseded by this brief
  return false;
}
// ---- a task the agent deleted from TASKS.md --------------------------------
// TASKS.md is rebuilt from tasks.json on every send, so an agent deleting a
// line (the user said to drop that task) changed nothing, and the next brief
// brought it back (GhostAIChat's `pod install`). handed.json keeps what the
// brief in TASKS.md handed out; a task it handed out that's no longer in the
// file (ticked or not) was deleted: droppedTasks lists them, and tasks.mjs
// closes them (applyDrops). The task lines are the `## Tasks` section's, or the
// whole file's when it has none; a file emptied or gone deleted nothing.
const HANDED = "handed.json", BOX = /^\s*-\s*\[[ x]\]\s*/i;
function briefTasks(md) {
  const lines = String(md || "").split("\n"), at = lines.findIndex((l) => /^##\s+Tasks\s*$/.test(l));
  const end = at < 0 ? lines.length : lines.findIndex((l, i) => i > at && /^##\s/.test(l));
  return lines.slice(at + 1, end < 0 ? lines.length : end).filter((l) => BOX.test(l)).map((l) => l.replace(BOX, "").trim()).filter(Boolean);
}
function noteHanded(path, md, also = []) {
  try { writeFileSync(join(path, ".symbiot", HANDED), JSON.stringify({ at: Date.now(), tasks: [...briefTasks(md), ...also] })); } catch {}
}
function droppedTasks(path) {
  let h = null; try { h = JSON.parse(readSymbiot(path, HANDED)); } catch {}
  const md = readSymbiot(path, "TASKS.md");
  if (!h || !Array.isArray(h.tasks) || !md.trim() || !/^##\s+Tasks\s*$|^\s*-\s*\[[ x]\]/im.test(md)) return [];
  const now = briefTasks(md);
  return h.tasks.filter((t) => !now.some((n) => sameTask(n, t))).map((text) => ({ text, at: h.at || 0 }));
}
// Swap the held brief in, keeping the ticks the agent made meanwhile: a tick
// is how a task reaches review, so dropping one would lose that task's work.
// A task the agent deleted meanwhile stays out, and stays deleted in handed.json.
function releaseHeldTasks(path) {
  const held = readSymbiot(path, HELD); if (!held || runningHandoff(path)) return false;
  const isTick = /^\s*-\s*\[x\]\s*/i, key = (l) => l.replace(/^\s*-\s*\[[ x]\]\s*/i, "").trim().toLowerCase();
  const ticked = new Set(readSymbiot(path, "TASKS.md").split("\n").filter((l) => isTick.test(l)).map(key));
  const gone = droppedTasks(path).map((d) => d.text), isGone = (l) => /^\s*-\s*\[ \]/.test(l) && gone.some((g) => sameTask(g, key(l)));
  const md = held.split("\n").filter((l) => !isGone(l)).map((l) => /^\s*-\s*\[ \]/.test(l) && ticked.has(key(l)) ? l.replace("[ ]", "[x]") : l).join("\n");
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
function track(name, cmd, cwd, onExit, env) {
  try {
    const dir = join(cwd, ".symbiot"); mkdirSync(dir, { recursive: true });
    const logp = join(dir, "agent.log");
    let fd = "ignore"; try { fd = openSync(logp, "a"); writeSync(fd, `\n=== ${name} ${new Date().toISOString()} ===\n$ ${cmd}\n`); } catch {}
    const entry = { id: randomBytes(4).toString("hex"), name, path: cwd, log: logp, startedAt: Date.now(), status: "running", exitCode: null, endedAt: null };
    const child = spawn(cmd, { shell: true, cwd, detached: true, stdio: ["ignore", fd === "ignore" ? "ignore" : fd, fd === "ignore" ? "ignore" : fd], ...(env ? { env: { ...process.env, ...env } } : {}) });
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
// Two at a time: most people pick the recommended option, or + task an idea,
// without weighing the rest, and the choices are the agent's to judge (the
// brief says how). So a question shows its first two options, and the Agents
// tab the ideas two at a time (`ideasShown`): one in Tasks leaves the list, and
// the next moves up. The rest are a click away.
const OPTIONS_SHOWN = 2, IDEAS_SHOWN = 2;
const qKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const readSymbiot = (path, f) => { try { return readFileSync(join(path, ".symbiot", f), "utf8"); } catch { return ""; } };
// "## Questions" → "### question", context lines, "- option" bullets;
// "## Suggestions" (or Ideas / Follow-ups) → "- idea" bullets. Forgiving: a bare
// bullet under Questions is a question with no options.
function parseQuestions(md) {
  const questions = [], suggestions = []; let sec = "q", cur = null;
  const clip = (s) => clipWords(String(s).trim(), TASK_MAX); // as long as a task holds (addTask), so an idea added in one click arrives whole
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
function agentQuestions(path, repo) {
  const p = parseQuestions(readSymbiot(path, "QUESTIONS.md"));
  const done = new Set([...readSymbiot(path, "ANSWERS.md").matchAll(/^###\s+(.+)$/gm)].map((m) => qKey(m[1])));
  const open = p.questions.filter((x) => !done.has(qKey(x.q)));
  const tasks = p.suggestions.length ? loadTasks() : [], skipped = p.suggestions.length ? skippedIdeas(path) : [];
  const ideas = p.suggestions.map(suggestionTarget).filter(({ text }) => !skipped.some((s) => sameTask(s, text)))
    .map(({ repo: to, text }) => ({ text, repo: to || repo, other: !!to && to !== repo, added: tasks.some((t) => t.repo === (to || repo) && sameTask(t.text, text)) })).filter((s) => !s.added);
  return {
    questions: open.slice(0, QUESTIONS_MAX).map((x) => ({ ...x, options: x.options.slice(0, OPTIONS_SHOWN) })), answered: p.questions.length - open.length,
    suggestions: ideas, ideasShown: IDEAS_SHOWN,
  };
}
// Save answers to .symbiot/ANSWERS.md; opts.rerun hands the repo back to the
// agent (same saved command) so it carries on with them.
// An answer that picks a "👤 You:" option is a step for the user: they're told
// it's still theirs (`yours`), and the next run waits for it (waiting.json).
// A folder a run started in before a restart can be answered too (runs.json).
const stepText = (a) => String(a).split("🤖")[0].replace(/^\s*👤\s*(You:)?\s*/, "").replace(/\s*\(recommended\)\s*$/i, "").trim();
function answerQuestions(path, answers, opts = {}) {
  path = String(path || "");
  if (!path || !knownRun(path)) return { error: "No agent has run in that folder." };
  const open = new Map(agentQuestions(path, "").questions.map((x) => [qKey(x.q), x.q]));
  const rows = (Array.isArray(answers) ? answers : [])
    .map((x) => ({ q: open.get(qKey(x && x.q)), a: String((x && x.a) || "").replace(/^\s*#+/gm, "").trim().slice(0, TASK_MAX) }))
    .filter((x) => x.q && x.a);
  if (!rows.length) return { error: "Pick or type at least one answer." };
  const prev = readSymbiot(path, "ANSWERS.md") || "# Answers from the user\nAnswers to the questions in QUESTIONS.md, newest last. Follow them; ask again in QUESTIONS.md if one is unclear.\n";
  const day = new Date().toISOString().slice(0, 10);
  try {
    mkdirSync(join(path, ".symbiot"), { recursive: true });
    writeFileSync(join(path, ".symbiot", "ANSWERS.md"), prev.replace(/\s*$/, "\n") + rows.map((x) => `\n### ${x.q}\n${x.a}\n_answered ${day}_\n`).join(""));
  } catch (e) { return { error: "Couldn't write ANSWERS.md: " + ((e && e.message) || e) }; }
  const out = { ok: true, saved: rows.length };
  // a "wait until…" answer: the step is the question's 👤 option (what "it" is), and its files are waited on
  const asked = new Map(parseQuestions(readSymbiot(path, "QUESTIONS.md")).questions.map((x) => [qKey(x.q), x]));
  const youOpts = (q) => ((asked.get(qKey(q)) || {}).options || []).filter(yourStep).map((o) => o.split("🤖")[0]);
  const steps = rows.filter((x) => yourStep(x.a) || holdAnswer(x.a)).map((x) => yourStep(x.a) ? { step: stepText(x.a), named: x.a.split("🤖")[0] }
    : { step: (youOpts(x.q).map(stepText)[0] || x.a).trim(), named: [x.a, ...youOpts(x.q)].join(" ") });
  const yours = steps.map((s) => s.step).filter(Boolean);
  if (yours.length) {
    const step = yours.join(" "), files = namedFiles(steps.map((s) => s.named).join(" "), path);
    try { writeFileSync(join(path, ".symbiot", WAITING), JSON.stringify({ step, files: files.map((f) => ({ ...f, sig: fileSig(f.path) })), cmd: runCmd(path), at: Date.now(), rerun: !!opts.rerun })); } catch {}
    const on = waitOn(files.map((f) => f.name), settingsStep(step));
    out.yours = yours; if (files.length) out.waitFiles = files.map((f) => f.name);
    out.note = "Answers saved. That step is still yours to do. " + (on ? `Your agent ${opts.rerun ? "starts by itself" : "can start"} once ${on} changes${opts.rerun ? " (while Symbiot runs)" : ""}.` : "Once it's done, click Start it now on this folder.");
    return out;
  }
  if (opts.rerun) { const e = runHandoff(path); if (e && e.busy) out.note = "Answers saved. An agent is still running in that folder, so another wasn't started. Send them again once it finishes."; else if (e && e.blocked) out.note = "Answers saved. " + e.note; else if (e) out.rerun = e.id; else out.note = "Answers saved. Set an agent command in Settings to have the agent pick them up automatically."; }
  return out;
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
// TASKS.md it is. tail is what to show as text: what it said, for a streaming
// run; the log's end, for another agent.
// Claude Code in print mode (claude -p) streams each step as JSON, so the work
// can be drawn as it happens (work.mjs). Added to a claude -p command that has no
// output format of its own; anything else (an Orca tab, another agent) as it is.
function withStream(cmd) {
  const c = String(cmd || "");
  if (!/^\s*claude\b/.test(c) || !/\s-p\b|\s--print\b/.test(c) || /--output-format\b/.test(c)) return c;
  return c + " --output-format stream-json --verbose";
}
function workOf(path, log) {
  const w = parseRun(lastRunText(log)), md = readSymbiot(path, "TASKS.md");
  const done = (md.match(/^\s*-\s*\[x\]/gim) || []).length, total = done + (md.match(/^\s*-\s*\[ \]/gm) || []).length;
  const tail = w.stream ? (w.final || w.said.join("\n\n") || (w.doing ? w.doing + "…" : "")) : String(log).slice(-1200);
  const work = w.stream ? { model: w.model, doing: w.doing, steps: w.steps.slice(-16), todos: w.todos, cost: w.cost, turns: w.turns, tokens: w.tokens, tests: w.tests, files: w.files, pace: w.pace, errors: w.errors, final: w.final.slice(0, 1200), count: w.steps.length } : null;
  return { tail, work, progress: total ? { done, total } : null };
}
function agentsList() {
  const seen = new Set();
  return HANDOFFS.map((e) => {
    let log = ""; try { log = readFileSync(e.log, "utf8"); } catch {}
    const { tail, work, progress } = workOf(e.path, log);
    const first = !seen.has(e.path); seen.add(e.path);
    const facts = first && e.status !== "running" ? factsOf(e.path) : [];
    return { id: e.id, name: e.name, path: e.path, status: e.status, elapsed: (e.endedAt || Date.now()) - e.startedAt, exitCode: e.exitCode, tail, work, progress, changed: agentChanges(e.path, e.startedAt), ask: first ? agentQuestions(e.path, e.name) : null, held: first ? heldTasks(e.path) : null, waiting: first && e.status !== "running" ? waitingFor(e.path) : null, remember: facts.length ? facts : null, fromHeld: !!e.fromHeld };
  }).concat(earlierRuns());
}

export { FACTS, factsOf, knownRun, withStream, workOf, HANDOFFS, HANDOFF_PROMPT, QUESTIONS_MAX, OPTIONS_SHOWN, IDEAS_SHOWN, shSingle, CLAUDE_CMD, ORCA_CLAUDE_CMD, handoffCmd, setHandoffCmd, grantAgent, grantRule, allowTool, claudeConnectors, withConnectors, linkedConnectors, connectorsLine, connectorsInfo, fillHandoff, runHandoff, blockedAgain, runningHandoff, loadRuns, earlierRuns, namedFiles, waitingFor, startWaiting, writeTasks, droppedTasks, releaseHeldTasks, startHeldTasks, detectHandoffs, orcaHandoffCmd, migrateOrcaCmd, migrateClaudeCmd, track, agentChanges, parseQuestions, suggestionTarget, skipIdea, agentQuestions, answerQuestions, agentsList };
