#!/usr/bin/env node
// symbiot — your week, written from your real work.
//
// Reads your local git activity (no accounts, no OAuth, no integrations) and
// writes the update you'd actually send. It writes with an AI of your choice —
// Claude, OpenAI, Gemini, or a local model (Ollama) — set up once with
// `symbiot login`.
//
//   symbiot week      your week, written up          (default)
//   symbiot standup   yesterday + today, for standup
//   symbiot todo      what's still on your plate
//   symbiot mail      add the mail you sent to write-ups (local, no API)
//   symbiot login    connect it to an AI (once)
//   symbiot whoami    show how it's connected
//   symbiot help
//
// Flags:  --dir <path>  where to look (default: your home folder)
//         --since <n>   days back for `week` (default 7)
//         --plain       no colour, no spinner (for piping)

import Anthropic from "@anthropic-ai/sdk";
import { spawn, spawnSync } from "node:child_process";
import { homedir, totalmem, cpus as oscpus } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EMBEDDED_UI } from "./ui.mjs";
import { detectMailSources, mailActivity } from "./mail.mjs";
import { CONFIG_PATH, loadConfig, saveConfig, loadTasks, saveTasks, sh, hasCmd, repoState } from "./core.mjs";
import { HANDOFF_PROMPT, QUESTIONS_MAX, shSingle, CLAUDE_CMD, ORCA_CLAUDE_CMD, handoffCmd, setHandoffCmd, grantAgent, fillHandoff, runHandoff, runningHandoff, writeTasks, startHeldTasks, detectHandoffs, orcaHandoffCmd, migrateOrcaCmd, migrateClaudeCmd, track, parseQuestions, agentQuestions, answerQuestions, agentsList } from "./agents.mjs";
import { gitDefaultBranch, loadDeploys, driftRepo } from "./drift.mjs";
import { loadScreens, screenImage, captureScreen, splitScreen, listMonitors, allowScreenshots, importScreen, setRegions, renameScreen, removeScreen, blueprint, clickRegion } from "./screens.mjs";
import { weeklyState, setWeekly, runWeekly, startWeekly, autostartState, setAutostart } from "./desktop.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
let VERSION = "0"; try { VERSION = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).version; } catch {}

const MAX_REPOS = 14;
const MAX_COMMITS = 140;
const MAX_TOKENS = 1600;

// The providers Symbiot can write with. Models are sensible defaults; override
// per provider at login, or globally with SYMBIOT_MODEL.
const PROVIDERS = {
  anthropic: { label: "Claude (Anthropic)", env: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"], keyUrl: "https://console.anthropic.com/settings/keys", keyName: "Anthropic API key (sk-ant-…)", model: "claude-opus-5-5" },
  openai:    { label: "OpenAI (GPT)",       env: ["OPENAI_API_KEY"],                            keyUrl: "https://platform.openai.com/api-keys",       keyName: "OpenAI API key (sk-…)",     model: "gpt-4o-mini" },
  gemini:    { label: "Gemini (Google)",    env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],          keyUrl: "https://aistudio.google.com/apikey",         keyName: "Google AI API key",         model: "gemini-1.5-flash" },
  ollama:    { label: "Local model (Ollama)", local: true,                                       keyUrl: "https://ollama.com",                         keyName: null,                        model: "llama3.1" },
};

// ---- tiny arg parse --------------------------------------------------------
const argv = process.argv.slice(2);
const cmd = (argv[0] && !argv[0].startsWith("-") ? argv[0] : "week").toLowerCase();
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const has = (name) => argv.includes(`--${name}`);
const PLAIN = has("plain") || !process.stdout.isTTY;
let SERVING = false; // set while `symbiot app` runs — silences the CLI spinner
let LAST_MAP = null;  // cached graph so node clicks don't rescan
let LATEST_VERSION = ""; // newest symbiot on npm, checked in the background
// a.b.c numeric compare: only a HIGHER npm version is an update (a local build
// ahead of npm must not be offered a "newer" older one)
function semverGt(a, b) { const p = (v) => String(v || "").replace(/^v/, "").split(/[.-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; }
// SYMBIOT_REGISTRY points the check at another registry (the tests use a fake one)
const REGISTRY = (process.env.SYMBIOT_REGISTRY || "https://registry.npmjs.org").replace(/\/+$/, "");
async function checkLatest() { try { const r = await fetch(REGISTRY + "/symbiot"); if (!r.ok) return; const j = await r.json(); LATEST_VERSION = (j["dist-tags"] && j["dist-tags"].latest) || ""; } catch {} }
// The in-app update installs the EXACT newest version (not the `latest` tag, which
// npm's cache/propagation can resolve stale — that caused an update loop where the
// install kept re-fetching the same old version). --prefer-online skips a stale
// cached packument.
function updateCmd(latest, current, platform = process.platform) {
  const target = latest && semverGt(latest, current) ? latest : "latest";
  return { target, cmd: (platform === "win32" ? "npm i -g " : "npm install -g ") + "symbiot@" + target + " --prefer-online" };
}

// ---- colour + spinner ------------------------------------------------------
const c = PLAIN
  ? { g: (s) => s, d: (s) => s, b: (s) => s, y: (s) => s }
  : {
      g: (s) => `\x1b[38;5;42m${s}\x1b[0m`,   // green
      d: (s) => `\x1b[38;5;66m${s}\x1b[0m`,    // faint
      b: (s) => `\x1b[1m${s}\x1b[0m`,          // bold
      y: (s) => `\x1b[38;5;179m${s}\x1b[0m`,   // amber
    };
function spinner(label) {
  if (SERVING) return () => {};
  if (PLAIN) { process.stderr.write(label + "\n"); return () => {}; }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const t = setInterval(() => process.stderr.write(`\r${c.g(frames[i++ % frames.length])} ${c.d(label)} `), 80);
  return () => { clearInterval(t); process.stderr.write("\r\x1b[K"); };
}

// ---- config + provider resolution (config files: core.mjs) -----------------
function antProfileExists() {
  try { return existsSync(join(homedir(), ".config", "anthropic")); } catch { return false; }
}
// ---- tasks: a persistent checklist (stored by core.mjs) -------------------
function addTask(text, repo) {
  text = String(text || "").trim().slice(0, 300);
  if (!text) return { error: "empty" };
  const t = loadTasks();
  // The same text already open in the same repo (in review counts): that task, not a duplicate.
  const same = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const dup = t.find((x) => !x.done && !x.archived && (x.repo || "") === (repo || "") && same(x.text) === same(text));
  if (dup) return { ...dup, duplicate: true };
  const item = { id: randomBytes(6).toString("hex"), text, repo: repo || "", done: false, ts: Date.now() };
  t.unshift(item); saveTasks(t); return item;
}
function toggleTask(id) { const t = loadTasks(); const it = t.find((x) => x.id === id); if (it) { it.done = !it.done; saveTasks(t); } return it || { error: "not found" }; }
function removeTask(id) { saveTasks(loadTasks().filter((x) => x.id !== id)); return { ok: true }; }
function restoreTask(id) { const t = loadTasks(); const it = t.find((x) => x.id === id); if (it) { it.archived = false; it.done = false; delete it.archivedAt; saveTasks(t); } return it || { error: "not found" }; }
// Which task texts the agent checked off in a repo's .symbiot/TASKS.md
function completedInRepo(repoPath) {
  try { return readFileSync(join(repoPath, ".symbiot", "TASKS.md"), "utf8").split("\n").filter((l) => /^\s*-\s*\[x\]/i.test(l)).map((l) => l.replace(/^\s*-\s*\[x\]\s*/i, "").trim().toLowerCase()); }
  catch { return []; }
}
function repoPathMap() {
  const byName = {};
  const src = (LAST_MAP && LAST_MAP.nodes) ? LAST_MAP.nodes.filter((n) => n.type === "repo" || n.type === "folder").map((n) => ({ name: n.label, path: n.meta && n.meta.path })) : findAllRepos();
  for (const r of src) if (r.path && !byName[r.name]) byName[r.name] = r.path;
  return byName;
}
// "Check what was handed out, see what's completed, then archive it" — with an
// approval step in between. An agent ticking an item in TASKS.md means "done,
// please review", NOT archived: it waits in review until the user approves it
// (approveRepo: branch + commit + push + PR, then archive) or sends it back
// (sendBack: unticked, open again). Only a task the USER ticks archives directly.
// Tasks held for an agent that has since finished land here too, and an agent
// starts on what's still open in them (one `push --open` started can't do that).
function syncTasks() {
  const t = loadTasks(); const map = repoPathMap(); let review = 0, archived = 0, started = 0; const checkedByRepo = {};
  for (const x of t) {
    if (x.archived || x.done || x.review || !x.repo) continue;
    if (!(x.repo in checkedByRepo)) { const p = map[x.repo]; if (p && startHeldTasks(p)) started++; checkedByRepo[x.repo] = p ? completedInRepo(p) : []; }
    if (checkedByRepo[x.repo].includes(x.text.toLowerCase())) { x.review = true; x.reviewAt = Date.now(); review++; }
  }
  for (const x of t) { if (x.done && !x.archived) { x.archived = true; x.archivedAt = Date.now(); archived++; } }
  saveTasks(t);
  return { review, archived, started };
}
// git with an argv (task text goes into commit messages — never through a shell)
function git(repo, args, timeout = 30000) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  return { ok: r.status === 0, out: String(r.stdout || "").replace(/\s+$/, ""), err: String(r.stderr || (r.error && r.error.message) || "").trim() };
}
const NOT_SYMBIOT = ["--", ".", ":(exclude).symbiot"]; // .symbiot/ is Symbiot's scratch (brief + agent log), never shipped
function workingChanges(path) {
  const st = git(path, ["status", "--porcelain", "-uall", ...NOT_SYMBIOT]);
  const files = st.out ? st.out.split("\n").map((l) => ({ st: l.slice(0, 2).trim(), file: l.slice(3) })) : [];
  const short = git(path, ["diff", "--shortstat", "HEAD", ...NOT_SYMBIOT]).out, n = (re) => +((short.match(re) || [])[1] || 0);
  const ins = n(/(\d+) insertion/), del = n(/(\d+) deletion/), fresh = files.filter((f) => f.st === "??").length;
  const stat = [ins && `+${ins}`, del && `−${del}`, fresh && `${fresh} new`].filter(Boolean).join(" ");
  return { branch: git(path, ["rev-parse", "--abbrev-ref", "HEAD"]).out, files, stat };
}
// The full diff the agent left behind: tracked changes + new files, capped.
function workingDiff(path, cap = 400000) {
  let d = git(path, ["diff", "HEAD", ...NOT_SYMBIOT]).out;
  for (const f of workingChanges(path).files.filter((x) => x.st === "??")) {
    if (d.length > cap) break;
    d += (d ? "\n" : "") + git(path, ["diff", "--no-index", "--", "/dev/null", f.file]).out; // exits 1 on a difference — output is what we want
  }
  return d.length > cap ? d.slice(0, cap) + "\n… (diff truncated)" : d;
}
// Merged work that isn't released yet: how many commits the default branch (or
// origin's copy, where approved PRs merge) is past its last v* tag, or null when
// it isn't, or the repo doesn't release with v* tags. bump: the version these
// uncommitted changes set in package.json, if they change it.
function unreleased(path) {
  const base = gitDefaultBranch(path); let best = null;
  for (const ref of ["refs/heads/" + base, "refs/remotes/origin/" + base]) {
    const tag = git(path, ["describe", "--tags", "--abbrev=0", "--match", "v*", ref]).out; if (!tag) continue;
    const ahead = +git(path, ["rev-list", "--count", tag + ".." + ref]).out || 0;
    if (!best || ahead > best.ahead) best = { base, tag, ahead };
  }
  if (!best || !best.ahead) return null;
  const ver = (s) => { try { return String(JSON.parse(s).version || ""); } catch { return ""; } };
  let now = ""; try { now = ver(readFileSync(join(path, "package.json"), "utf8")); } catch {}
  const was = ver(git(path, ["show", "HEAD:package.json"]).out);
  return { ...best, ...(now && was && now !== was ? { bump: now } : {}) };
}
// Approve can bump the version in the PR itself, for a repo that releases with
// v* tags: offered when the committed version is already released (its v* tag
// exists) and these changes don't change it. { version, patch, minor } or null.
function bumpOffer(path) {
  const ver = (s) => { try { return String(JSON.parse(s).version || ""); } catch { return ""; } };
  const was = ver(git(path, ["show", "HEAD:package.json"]).out), m = was.match(/^(\d+)\.(\d+)\.(\d+)$/); if (!m) return null;
  let now = ""; try { now = ver(readFileSync(join(path, "package.json"), "utf8")); } catch {}
  if (now !== was || !git(path, ["rev-parse", "-q", "--verify", "refs/tags/v" + was]).ok) return null;
  return { version: was, patch: `${m[1]}.${m[2]}.${+m[3] + 1}`, minor: `${m[1]}.${+m[2] + 1}.0` };
}
// Set the version in package.json and in package-lock.json / npm-shrinkwrap.json
// (top level and its "" package), keeping each file's indent. Gives back a
// function that restores them, for when the ship fails.
function setVersion(path, to) {
  const saved = [];
  for (const f of ["package.json", "package-lock.json", "npm-shrinkwrap.json"]) {
    const file = join(path, f); let text = "", j = null;
    try { text = readFileSync(file, "utf8"); j = JSON.parse(text); } catch { continue; }
    if (!j || typeof j !== "object" || (f !== "package.json" && !("version" in j))) continue;
    j.version = to; if (f !== "package.json" && j.packages && j.packages[""]) j.packages[""].version = to;
    writeFileSync(file, JSON.stringify(j, null, (text.match(/^[ \t]+(?=")/m) || ["  "])[0]) + (text.endsWith("\n") ? "\n" : ""));
    saved.push([file, text]);
  }
  return () => { for (const [file, text] of saved) try { writeFileSync(file, text); } catch {} };
}
// Ship with the version bumped when opts.bump is "patch" or "minor" and the repo
// is offered one (bumpOffer). The bump is put back if the ship fails.
function shipWithBump(path, texts, opts) {
  const offer = (opts.bump === "patch" || opts.bump === "minor") && bumpOffer(path);
  if (!offer) return shipChanges(path, texts, opts);
  const to = offer[opts.bump], undo = setVersion(path, to);
  const r = shipChanges(path, texts, { ...opts, bumped: to });
  if (r.error) { undo(); return r; }
  return { ...r, bumped: to };
}
// Repos with tasks awaiting review, plus repos Symbiot sent tasks to that have
// uncommitted changes no ticked task covers (untasked: approve them as-is).
// running: an agent is still editing there, so its changes may be half done.
function pendingReview() {
  const t = loadTasks(), by = {}; for (const x of t) if (x.review && !x.done && !x.archived) (by[x.repo] = by[x.repo] || []).push(x);
  const sent = [...new Set(t.filter((x) => x.repo && !x.archived && !by[x.repo]).map((x) => x.repo))];
  const map = Object.keys(by).length || sent.length ? repoPathMap() : {};
  const am = autoMergeRepos();
  const out = Object.keys(by).sort().map((repo) => { const path = map[repo] || ""; return { repo, path, tasks: by[repo], autoMerge: am.includes(repo), running: !!(path && runningHandoff(path)), ...(path ? { ...workingChanges(path), unreleased: unreleased(path), bumpOffer: bumpOffer(path) } : { branch: "", files: [], stat: "" }) }; });
  for (const repo of sent.sort()) {
    const path = map[repo]; if (!path || !existsSync(join(path, ".symbiot", "TASKS.md"))) continue;
    const wc = workingChanges(path); if (wc.files.length) out.push({ repo, path, tasks: [], untasked: true, autoMerge: am.includes(repo), running: !!runningHandoff(path), ...wc, unreleased: unreleased(path), bumpOffer: bumpOffer(path) });
  }
  return out;
}
// Approving while the agent is still editing would commit its half-done work.
const stillWorking = (repo, path) => path && runningHandoff(path) ? { error: `The agent is still working in ${repo}. Approve once it finishes.`, running: true } : null;
const branchSlug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "tasks";
// Sync approved work: off the default branch onto symbiot/<task>, commit the
// working tree (minus .symbiot/), push, and open a PR with gh. Each step that
// can't happen (no remote, push rejected, no gh) stops there and says so — the
// commit is never lost. opts.push=false stops after the commit, opts.pr=false
// after the push.
function shipChanges(path, texts, opts = {}) {
  const ch = workingChanges(path);
  if (!ch.files.length) return { ok: true, nothing: true, note: "No uncommitted changes — approved without a commit." };
  if (!ch.branch || ch.branch === "HEAD") return { error: "Detached HEAD — check out a branch first." };
  const base = gitDefaultBranch(path), day = new Date().toISOString().slice(0, 10); let branch = ch.branch;
  if (branch === base) {
    const stem = "symbiot/" + branchSlug(!texts.length ? `changes-${day}` : texts.length === 1 ? texts[0] : `${texts.length}-tasks-${day}`);
    branch = stem; for (let i = 2; git(path, ["rev-parse", "--verify", "-q", "refs/heads/" + branch]).ok; i++) branch = `${stem}-${i}`;
    const sw = git(path, ["switch", "-c", branch]); if (!sw.ok) return { error: "Could not create branch: " + sw.err };
  }
  // Stage everything, then drop .symbiot. A `. :(exclude).symbiot` pathspec
  // warns+exits-1 once .symbiot is gitignored ("paths are ignored, use -f"),
  // which falsely aborted the ship. `add -A` skips gitignored paths silently;
  // the reset also covers repos where .symbiot isn't ignored.
  const add = git(path, ["add", "-A"]); if (!add.ok) return { error: "git add failed: " + add.err, branch };
  git(path, ["reset", "-q", "--", ".symbiot"]); // never ship Symbiot's own scratch
  const subject = !texts.length ? "symbiot: changes approved without a task" : texts.length === 1 ? (texts[0].length > 72 ? texts[0].slice(0, 71).replace(/\s+\S*$/, "") + "…" : texts[0]) : `symbiot: ${texts.length} approved tasks`;
  const body = (texts.length ? texts.map((x) => "- " + x).join("\n") : "No ticked task covers these changes.") + (opts.bumped ? `\n\nBumps the version to ${opts.bumped}. After this merges, tag v${opts.bumped} on ${base} to release it.` : "");
  const cm = git(path, ["commit", "-m", subject, "-m", body]); if (!cm.ok) return { error: "Commit failed: " + (cm.err || cm.out), branch };
  const out = { ok: true, branch, base, commit: git(path, ["rev-parse", "--short", "HEAD"]).out, subject };
  if (opts.push === false) return out;
  if (!git(path, ["remote", "get-url", "origin"]).ok) return { ...out, note: "No origin remote — committed locally." };
  const ps = git(path, ["push", "-u", "origin", branch], 120000);
  if (!ps.ok) return { ...out, note: "Committed, but the push failed: " + (ps.err.split("\n").filter(Boolean).pop() || "unknown error") };
  out.pushed = true;
  if (opts.pr === false) return out;
  if (!hasCmd("gh")) return { ...out, note: "Pushed. Install the GitHub CLI (gh) to open the PR automatically." };
  const gh = (args) => spawnSync("gh", args, { cwd: path, encoding: "utf8", timeout: 60000 });
  const pr = gh(["pr", "create", "--head", branch, "--base", base, "--title", subject, "--body", body + "\n\nApproved in Symbiot."]);
  const url = (String(pr.stdout || "").match(/https?:\/\/\S+/) || [])[0] || String(gh(["pr", "view", branch, "--json", "url", "-q", ".url"]).stdout || "").trim();
  if (!url) return { ...out, note: "Pushed, but gh couldn't open the PR: " + String(pr.stderr || "").trim().split("\n").pop() };
  out.pr = url;
  // Opt-in auto-merge: queue GitHub's native auto-merge, which lands the PR only
  // once its required checks (CI) pass — never immediately on its own if the repo
  // has branch protection. Needs 'Allow auto-merge' on the repo; if off, we say so.
  if (opts.autoMerge) {
    const am = gh(["pr", "merge", branch, "--auto", "--squash", "--delete-branch"]);
    if (am.status === 0) out.autoMerge = "queued";
    else { out.autoMerge = "unavailable"; out.autoMergeErr = String(am.stderr || "").trim().split("\n").filter(Boolean).pop() || "gh pr merge failed"; }
  }
  return out;
}
// Per-repo opt-in to auto-merge Approve PRs once CI passes (default off).
function autoMergeRepos() { const a = loadConfig().autoMerge; return Array.isArray(a) ? a : []; }
function setAutoMerge(repo, on) { const cfg = loadConfig(); let a = (Array.isArray(cfg.autoMerge) ? cfg.autoMerge : []).filter((x) => x !== repo); if (on && repo) a.push(repo); if (a.length) cfg.autoMerge = a; else delete cfg.autoMerge; saveConfig(cfg); return { ok: true, repos: cfg.autoMerge || [] }; }
function approveRepo(repo, opts = {}) {
  const t = loadTasks(); const items = t.filter((x) => x.repo === repo && x.review && !x.done && !x.archived);
  if (!items.length) return { error: "Nothing awaiting review for " + (repo || "(no repo)") + "." };
  const path = repoPathMap()[repo]; if (!path) return { error: "Repo not found: " + repo };
  const busy = stillWorking(repo, path); if (busy) return busy;
  const r = shipWithBump(path, items.map((x) => x.text), { ...opts, autoMerge: opts.autoMerge !== undefined ? opts.autoMerge : autoMergeRepos().includes(repo) });
  if (r.error) return r;
  const now = Date.now();
  for (const x of items) { x.review = false; x.done = true; x.archived = true; x.archivedAt = now; x.approvedAt = now; for (const k of ["branch", "commit", "pr"]) if (r[k]) x[k] = r[k]; }
  saveTasks(t);
  return { ...r, approved: items.length };
}
// "Approve changes without a task": ship the uncommitted changes even though no
// ticked task is behind them (a fix the agent made but didn't tick). If tasks are
// awaiting review in the repo, this is just Approve.
function approveChanges(repo, opts = {}) {
  if (loadTasks().some((x) => x.repo === repo && x.review && !x.done && !x.archived)) return approveRepo(repo, opts);
  const path = repoPathMap()[repo]; if (!path) return { error: "Repo not found: " + (repo || "(no repo)") };
  const busy = stillWorking(repo, path); if (busy) return busy;
  if (!workingChanges(path).files.length) return { error: "No uncommitted changes in " + repo + "." };
  const r = shipWithBump(path, [], { ...opts, autoMerge: opts.autoMerge !== undefined ? opts.autoMerge : autoMergeRepos().includes(repo) });
  return r.error ? r : { ...r, approved: 0 };
}
// Not right: reopen it and untick it in TASKS.md so the agent picks it up again.
function sendBack(id) {
  const t = loadTasks(); const it = t.find((x) => x.id === id); if (!it) return { error: "not found" };
  it.review = false; delete it.reviewAt; saveTasks(t);
  const path = it.repo && repoPathMap()[it.repo];
  if (path) { const f = join(path, ".symbiot", "TASKS.md"); try { const want = it.text.trim().toLowerCase(); writeFileSync(f, readFileSync(f, "utf8").split("\n").map((l) => /^\s*-\s*\[x\]/i.test(l) && l.replace(/^\s*-\s*\[x\]\s*/i, "").trim().toLowerCase() === want ? l.replace(/\[x\]/i, "[ ]") : l).join("\n")); } catch {} }
  return it;
}
// Deterministic task classification (no model) so tasks batch by kind instead
// of arriving as a flat, mixed pile. Order matters (most specific first).
const TASK_ORDER = ["Fixes", "Tests & CI", "Security", "Performance", "Refactor", "UI/UX", "Docs", "Features & other"];
function taskType(text) {
  const s = String(text || "").toLowerCase();
  if (/\b(test|tests|spec|coverage|smoke|fixture|ci\b)/.test(s)) return "Tests & CI";
  if (/\b(secur|auth|token|secret|vulnerab|permission|sanitiz|escap|injection)/.test(s)) return "Security";
  if (/\b(readme|docs?|document|changelog|comment|guide)/.test(s)) return "Docs";
  if (/\b(perf|performance|slow|optimi|latency|throughput|speed up|memory leak)/.test(s)) return "Performance";
  if (/\b(refactor|simplify|split|extract|clean ?up|consolidat|dedupe|modular|rename)/.test(s)) return "Refactor";
  if (/\b(bug|fix|broken|error|crash|regress|hang|race|leak)/.test(s)) return "Fixes";
  if (/\b(ui|ux|design|layout|style|button|screen|view\b|page\b|responsive)/.test(s)) return "UI/UX";
  return "Features & other";
}
// Push tasks into the repos as an agent-readable brief (.symbiot/TASKS.md):
// a checklist plus the deterministic context an agent needs to get oriented.
function buildTasksMd(name, ctx, list) {
  const L = [];
  L.push(`# Symbiot tasks — ${name}`);
  L.push(`_generated ${new Date().toISOString().slice(0, 10)}${ctx.branch ? ` · branch ${ctx.branch}` : ""} · by symbiot ${VERSION}_`, "");
  L.push("## Context for an AI agent", `Tasks for the \`${name}\` repo. Get oriented from the signals below before actioning them.`);
  if (ctx.stack) L.push(`- **Stack:** ${ctx.stack}`);
  if (ctx.commits && ctx.commits.length) { L.push("- **Recent commits:**"); for (const c of ctx.commits) L.push(`  - ${c}`); }
  if (ctx.open && ctx.open.length) { L.push("- **Open markers (TODO/FIXME + uncommitted):**"); for (const o of ctx.open) L.push(`  - ${o}`); }
  if (ctx.drift && ctx.drift.length) { L.push("- **Current drift / risk:**"); for (const d of ctx.drift) L.push(`  - ${d}`); }
  L.push("", "## Tasks");
  const byType = {}; for (const t of list) { const ty = taskType(t.text); (byType[ty] = byType[ty] || []).push(t); }
  const keys = Object.keys(byType).sort((a, b) => TASK_ORDER.indexOf(a) - TASK_ORDER.indexOf(b));
  for (const ty of keys) { L.push(`### ${ty}`); for (const t of byType[ty]) L.push(`- [ ] ${t.text}`); L.push(""); }
  L.push("## When you finish an item", "- Tick it here (`- [x]`) as soon as it's done — that's how it reaches review. Ticking doesn't archive it: the user approves it in Symbiot, which commits it on a branch and opens a PR.", "- Leave your changes **uncommitted**, and don't tick anything you didn't finish or couldn't verify.", "");
  L.push("## If you need a decision, or have ideas", "You may be running unattended, so you can't ask in chat. Write `.symbiot/QUESTIONS.md` instead: Symbiot shows it to the user on your block in its Agents tab, and their answers come back in `.symbiot/ANSWERS.md` (read that first if it exists).",
    `- At most ${QUESTIONS_MAX} questions, under a \`## Questions\` heading. Each is a \`### \` heading, then an optional line of context, then 2–4 options as \`- \` bullets (put the one you recommend first).`,
    "- Ideas, options or follow-ups outside these tasks go under `## Suggestions` as `- ` bullets — the user can add them to their tasks in one click.",
    "- Carry on with everything that doesn't depend on an answer, and don't tick an item that does. Ask there rather than doing anything destructive.", "");
  L.push("---", 'To action these, tell your coding agent: "Read `.symbiot/TASKS.md` and implement the unchecked items in this repo, using the context above. Tick each item as you finish it and leave changes uncommitted for review. Confirm with me before anything destructive."');
  return L.join("\n") + "\n";
}
function pushTasks(filter) {
  let tasks = loadTasks().filter((t) => !t.done && !t.archived && !t.review);
  if (filter && filter.type) tasks = tasks.filter((t) => taskType(t.text) === filter.type);
  if (filter && filter.repo) tasks = tasks.filter((t) => t.repo === filter.repo);
  if (!tasks.length) return { empty: true, written: [], unresolved: [] };
  const byName = repoPathMap(); // from the already-scanned map when there is one
  const groups = {}; for (const t of tasks) { const k = t.repo || ""; (groups[k] = groups[k] || []).push(t); }
  const written = [], unresolved = [];
  for (const name of Object.keys(groups)) {
    const list = groups[name], path = name && byName[name];
    if (!path) { unresolved.push({ name: name || "(no repo)", count: list.length }); continue; }
    try {
      // Cheap, per-repo signals only — no full drift scan (that can be very slow
      // on big repos and would block the request).
      const st = repoState(path);
      const commits = sh(`git -C ${JSON.stringify(path)} log --format='%s' -10 2>/dev/null`).split("\n").filter(Boolean);
      const open = openWork([{ path, name }]).slice(0, 12);
      const det = detectRepo({ path, name, recency: 0 });
      const stack = [...det.langs.slice(0, 4), ...det.tools].join(", ");
      const risk = [];
      if (st.stale) risk.push("stale checkout — working tree is an old snapshot, not new work");
      if (st.behind) risk.push(`${st.behind} behind upstream on ${st.branch}`);
      if (st.dirty && !st.stale) risk.push(`${st.dirty} uncommitted (${st.mod} mod / ${st.del} del / ${st.add} new)`);
      // held: an agent is still running there, so it lands when that one exits
      const held = writeTasks(path, buildTasksMd(name, { branch: st.branch, commits, open, drift: risk, stack }, list));
      written.push({ name, file: join(path, ".symbiot", "TASKS.md"), path, count: list.length, held });
    } catch (e) { unresolved.push({ name, count: list.length, error: String((e && e.message) || e) }); }
  }
  return { empty: false, written, unresolved, handoff: handoffCmd() };
}
function cmdPush() {
  const r = pushTasks();
  if (r.empty) { console.log(c.y("No open tasks to push.") + c.d("  Add some in `symbiot app` — a repo review's ideas, or the Tasks tab.")); return; }
  if (r.written.length) { console.log("\n" + c.g("●") + " " + c.b("Pushed tasks into repos:")); for (const w of r.written) console.log(`  ${c.g("✓")} ${w.name}  ${c.d(w.file + "  (" + w.count + " task" + (w.count > 1 ? "s" : "") + ")")}` + (w.held ? c.y("  held: an agent is still running there, so it lands when that one finishes") : "")); }
  if (r.unresolved.length) { console.log("\n" + c.y(`Not written (repo not found under ${BASE}):`)); for (const u of r.unresolved) console.log(`  · ${u.name} (${u.count})`); }
  if (has("open")) {
    if (!r.handoff) console.log("\n" + c.y("No agent command set.") + c.d("  Set one in `symbiot app` Settings, or `agentCmd` in ~/.config/symbiot/config.json (use {dir} and {prompt})."));
    else {
      const busy = r.written.map((w) => ({ w, e: runHandoff(w.path) })).filter((x) => x.e && x.e.busy);
      const n = r.written.length - busy.length;
      if (n) console.log("\n" + c.g("→ ") + `Handed ${n} repo(s) to your agent (${r.handoff}).`);
      for (const { w, e } of busy) console.log("\n" + c.y("Not started: ") + `${w.name} already has an agent running.` + c.d(e.auto ? "  Its new tasks are held, and the app starts an agent on them when it finishes." : "  Its new tasks are held until it finishes. After that, the app starts an agent on them the next time it checks the repo (opening its Tasks tab), or send again."));
    }
  } else {
    console.log("\n" + c.d("Point your agent at .symbiot/TASKS.md in each repo.  (add --open to run your configured agent command)"));
  }
}
function envKey(provider) {
  for (const e of (PROVIDERS[provider].env || [])) if (process.env[e]) return process.env[e];
  return null;
}
// Returns { provider, key?, baseUrl?, model, source } or null if nothing set up.
// Order: saved choice → legacy saved key → env keys → an `ant` profile.
function resolveProvider() {
  const cfg = loadConfig();
  const m = process.env.SYMBIOT_MODEL;
  if (cfg.provider && PROVIDERS[cfg.provider]) {
    const p = cfg.provider, pc = cfg[p] || {};
    if (p === "ollama") return { provider: p, baseUrl: pc.baseUrl || "http://localhost:11434", model: m || pc.model || PROVIDERS.ollama.model, source: "saved login" };
    const key = pc.apiKey || envKey(p);
    if (key || (p === "anthropic" && (process.env.ANTHROPIC_AUTH_TOKEN || antProfileExists())))
      return { provider: p, key, model: m || pc.model || PROVIDERS[p].model, source: pc.apiKey ? "saved login" : "environment" };
  }
  if (cfg.apiKey) return { provider: "anthropic", key: cfg.apiKey, model: m || PROVIDERS.anthropic.model, source: "saved login (~/.config/symbiot)" };
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return { provider: "anthropic", key: process.env.ANTHROPIC_API_KEY, model: m || PROVIDERS.anthropic.model, source: "ANTHROPIC_* (environment)" };
  if (process.env.OPENAI_API_KEY) return { provider: "openai", key: process.env.OPENAI_API_KEY, model: m || PROVIDERS.openai.model, source: "OPENAI_API_KEY (environment)" };
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return { provider: "gemini", key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, model: m || PROVIDERS.gemini.model, source: "GEMINI/GOOGLE_API_KEY (environment)" };
  if (antProfileExists()) return { provider: "anthropic", model: m || PROVIDERS.anthropic.model, source: "Anthropic CLI profile (ant auth login)" };
  return null;
}

// ---- prompt (with masked secret input) ------------------------------------
function ask(question, { secret = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (secret && !PLAIN) {
      rl._writeToOutput = (str) => {
        if (str.includes(question)) rl.output.write(question);
        else if (str.includes("\n")) rl.output.write("\n");
        else rl.output.write("*");
      };
    }
    rl.question(question, (ans) => {
      rl.close();
      if (secret) process.stdout.write("\n");
      resolve((ans || "").trim());
    });
  });
}

// ---- scan deadline + progress ---------------------------------------------
// One slow disk or giant tree must never hang a scan (the 0.7.1 map hang): each
// scan gets an overall deadline (SYMBIOT_SCAN_TIMEOUT seconds), after which it
// stops and returns what it has, marked partial. Progress is a live stderr line
// in the CLI, and served at /api/scan for the app, which polls it while the Map
// loads. Nested scans (findAllRepos inside buildMap) share the outer deadline.
const SCAN_TIMEOUT_MS = (Number(process.env.SYMBIOT_SCAN_TIMEOUT) || 60) * 1000;
const FIND_TIMEOUT_MS = 20000; // one `find` walk; partial results are kept past it
const SCAN = { active: false, phase: "", done: 0, total: 0, item: "", startedAt: 0, deadline: 0, partial: false };
function scanBegin() {
  if (SCAN.active) return false;
  Object.assign(SCAN, { active: true, phase: "", done: 0, total: 0, item: "", startedAt: Date.now(), deadline: Date.now() + SCAN_TIMEOUT_MS, partial: false });
  return true;
}
function scanPhase(phase, total) { Object.assign(SCAN, { phase, done: 0, total: total || 0, item: "" }); scanDraw(); }
function scanTick(item) { SCAN.done++; SCAN.item = item || ""; scanDraw(); }
function scanExpired() { if (SCAN.active && Date.now() > SCAN.deadline) SCAN.partial = true; return SCAN.partial; }
function scanEnd(owner) {
  if (!owner) return;
  SCAN.active = false;
  if (SERVING) return;
  if (!PLAIN && process.stderr.isTTY) process.stderr.write("\r\x1b[K");
  if (SCAN.partial) process.stderr.write(c.y(`⚠ scan stopped after ${SCAN_TIMEOUT_MS / 1000}s — results are partial (raise SYMBIOT_SCAN_TIMEOUT, or narrow the scan folders)`) + "\n");
}
// Written synchronously (the scan blocks the event loop, so a timer-driven
// spinner would freeze): one overwritten stderr line, TTY only.
function scanDraw() {
  if (SERVING || PLAIN || !process.stderr.isTTY) return;
  const n = SCAN.total ? ` ${SCAN.done}/${SCAN.total}` : SCAN.done ? ` ${SCAN.done}` : "";
  process.stderr.write(`\r\x1b[K${c.g("⠿")} ${c.d(`${SCAN.phase}${n}${SCAN.item ? " · " + SCAN.item : ""}`.slice(0, (process.stderr.columns || 80) - 3))}`);
}
// Run `find` directly (no shell, no pipe): a timeout then kills find itself
// rather than a shell whose piped children keep running, and whatever it found
// before the timeout is kept instead of discarded.
function findPaths(args, limit) {
  const timeout = SCAN.active ? Math.max(1000, Math.min(FIND_TIMEOUT_MS, SCAN.deadline - Date.now())) : FIND_TIMEOUT_MS;
  const r = spawnSync("find", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024, timeout, killSignal: "SIGKILL" });
  if (r.error && r.error.code !== "ETIMEDOUT") return [];
  if (r.error && SCAN.active) SCAN.partial = true;
  return String(r.stdout || "").split("\n").filter(Boolean).slice(0, limit);
}
const PRUNE = ["node_modules", ".cache", ".local", ".npm", "venv", ".venv", ".gradle", "Pods"];
const anyName = (names) => ["(", ...names.flatMap((n, i) => (i ? ["-o", "-name", n] : ["-name", n])), ")"];
// find .git dirs quickly by PRUNING heavy trees (node_modules etc.) instead of
// crawling into them — this is the big speedup for the map scan.
function findGitDirs(base, limit) {
  return findPaths([base, "-maxdepth", "7", ...anyName([...PRUNE, ".git-crypt"]), "-prune", "-o", "-name", ".git", "-print"], limit);
}
function me() {
  return { email: sh("git config --global user.email").trim(), name: sh("git config --global user.name").trim() };
}

// ---- accurate repo signals (the field-report fixes) -----------------------
// All author identities in this repo that plausibly belong to the current user,
// with a fallback when the filter would keep almost nothing of an active repo.
function authorship(repoPath) {
  const gName = sh("git config --global user.name 2>/dev/null").trim();
  const gEmail = sh("git config --global user.email 2>/dev/null").trim();
  const rEmail = sh(`git -C ${JSON.stringify(repoPath)} config user.email 2>/dev/null`).trim();
  const rName = sh(`git -C ${JSON.stringify(repoPath)} config user.name 2>/dev/null`).trim();
  const total = Number(sh(`git -C ${JSON.stringify(repoPath)} rev-list --count HEAD 2>/dev/null`).trim()) || 0;
  const rows = sh(`git -C ${JSON.stringify(repoPath)} log --format='%ae|%an' 2>/dev/null | sort | uniq -c | sort -rn | head -60`)
    .split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^(\d+)\s+(.*)$/); if (!m) return null;
      const parts = m[2].split("|"); return { count: Number(m[1]), email: parts[0], name: parts.slice(1).join("|") };
    }).filter(Boolean);
  const myEmails = new Set([rEmail, gEmail].filter(Boolean));
  const myNames = new Set([gName, rName].filter(Boolean).map((n) => n.toLowerCase()));
  const nameKeys = new Set([...myNames].map((n) => n.replace(/\s+/g, "")));
  const mine = new Set();
  for (const r of rows) {
    const nore = r.email.match(/^\d+\+(.+)@users\.noreply\.github\.com$/i);
    const isMine = (r.email && myEmails.has(r.email))
      || (r.name && myNames.has(r.name.toLowerCase()))
      || (nore && nameKeys.has(nore[1].toLowerCase().replace(/\s+/g, "")));
    if (isMine) mine.add(r.email);
  }
  if (rEmail) mine.add(rEmail);
  let mineCount = rows.filter((r) => mine.has(r.email)).reduce((s, r) => s + r.count, 0);
  const filterDropped = total >= 20 && mineCount / Math.max(total, 1) < 0.10;
  const emails = filterDropped ? rows.map((r) => r.email) : [...mine];
  return { emails, mineCount, total, filterDropped, names: [...new Set(rows.filter((r) => mine.has(r.email)).map((r) => r.email))] };
}
function authorArgs(emails) { return (emails || []).filter(Boolean).map((e) => `--author=${JSON.stringify(e)}`).join(" "); }

function readmeInfo(repoPath) {
  for (const f of ["README.md", "README.MD", "Readme.md", "readme.md", "README.txt", "README"]) {
    try {
      const p = join(repoPath, f);
      if (existsSync(p)) {
        const hash = sh(`git -C ${JSON.stringify(repoPath)} log -1 --format=%H -- ${JSON.stringify(f)} 2>/dev/null`).trim();
        return {
          file: f, excerpt: readFileSync(p, "utf8").slice(0, 2500),
          lastDate: sh(`git -C ${JSON.stringify(repoPath)} log -1 --format=%cd --date=short -- ${JSON.stringify(f)} 2>/dev/null`).trim(),
          commitsAgo: hash ? (Number(sh(`git -C ${JSON.stringify(repoPath)} rev-list --count ${hash}..HEAD 2>/dev/null`).trim()) || 0) : 0,
        };
      }
    } catch {}
  }
  return { file: null, excerpt: "", lastDate: "", commitsAgo: 0 };
}
function repoShape(repoPath) {
  const files = sh(`git -C ${JSON.stringify(repoPath)} ls-files 2>/dev/null | head -4000`).split("\n").filter(Boolean);
  const top = {}; const docs = []; const manifests = [];
  for (const f of files) {
    const seg = f.includes("/") ? f.split("/")[0] : "(root)";
    top[seg] = (top[seg] || 0) + 1;
    const base = f.split("/").pop();
    if (MANIFEST_TOOL[base]) manifests.push(f);
    if (/^(readme|contributing|claude|agents|changelog|architecture|design)/i.test(base) || /(^|\/)(docs|knowledge)\//i.test(f)) docs.push(f);
  }
  return {
    total: files.length,
    dirs: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([d, n]) => `${d}/ (${n})`),
    manifests: manifests.slice(0, 12), docs: [...new Set(docs)].slice(0, 16),
  };
}
// House rules the model must respect (e.g. "we commit .env on purpose").
function houseRules(repoPath) {
  const out = [];
  for (const [label, f] of [["Project rules", "CLAUDE.md"], ["Agent rules", "AGENTS.md"], ["Contributing", "CONTRIBUTING.md"]]) {
    try { const p = join(repoPath, f); if (existsSync(p)) out.push(`## ${label} (${f})\n` + readFileSync(p, "utf8").slice(0, 1500)); } catch {}
  }
  try { const g = join(homedir(), ".config", "symbiot", "rules.md"); if (existsSync(g)) out.push("## Your global rules\n" + readFileSync(g, "utf8").slice(0, 1500)); } catch {}
  return out.join("\n\n");
}
// "Show what was read" footer for every report.
function reportFooter(repoPath, auth, state, rd) {
  const b = [`symbiot ${VERSION}`, `path ${repoPath}`];
  if (state.branch) b.push(`branch ${state.branch}`);
  b.push(`${auth.mineCount} of ${auth.total} commits matched you${auth.filterDropped ? " — filter dropped, counting everyone" : ""}`);
  if (rd && rd.lastDate) b.push(`README changed ${rd.lastDate}${rd.commitsAgo ? ` (${rd.commitsAgo} commits ago)` : ""}`);
  if (state.stale) b.push(`⚠ STALE checkout: working tree ≈ ${state.staleBy ? "HEAD~" + state.staleBy : "an older commit"} — not new work`);
  else if (state.dirty) b.push(`${state.dirty} uncommitted (${state.mod} mod / ${state.del} del / ${state.add} new)`);
  if (state.behind) b.push(`${state.behind} behind upstream`);
  return b.join(" · ");
}
function expandRoot(p) { p = String(p || "").trim(); return p.startsWith("~") ? join(homedir(), p.slice(1)) : p; }
// The default place to look: your home folder. The Android app's HOME is private
// to it, so it sets SYMBIOT_SCAN_HOME to the phone's shared storage instead.
function scanHome() { return process.env.SYMBIOT_SCAN_HOME || homedir(); }
// Where to look for repos: configured folders, or --dir, else your home folder.
function scanRoots() {
  if (flag("dir", null)) return [BASE];
  const r = loadConfig().scanRoots;
  const roots = (Array.isArray(r) ? r : []).map(expandRoot).filter((x) => { try { return existsSync(x); } catch { return false; } });
  return roots.length ? roots : [scanHome()];
}
function addScanRoot(p) {
  p = expandRoot(p); if (!p) return { error: "empty" };
  try { if (!existsSync(p)) return { error: "folder not found: " + p }; } catch { return { error: "can't read: " + p }; }
  const cfg = loadConfig();
  let list = Array.isArray(cfg.scanRoots) && cfg.scanRoots.length ? cfg.scanRoots : [scanHome()]; // keep home when adding the first extra folder
  if (!list.includes(p)) list.push(p);
  cfg.scanRoots = list; saveConfig(cfg); LAST_MAP = null; return { ok: true, roots: cfg.scanRoots };
}
function removeScanRoot(p) {
  const cfg = loadConfig(); cfg.scanRoots = (Array.isArray(cfg.scanRoots) ? cfg.scanRoots : []).filter((x) => x !== p);
  if (!cfg.scanRoots.length) delete cfg.scanRoots; saveConfig(cfg); LAST_MAP = null; return { ok: true, roots: cfg.scanRoots || [] };
}
function findRepos(base, sinceDays) {
  const repos = []; const seen = new Set();
  for (const root of scanRoots()) for (const g of findGitDirs(root, 200)) {
    const repo = g.replace(/\/\.git$/, ""); if (seen.has(repo)) continue; seen.add(repo);
    const n = Number(sh(`git -C ${JSON.stringify(repo)} log --since="${sinceDays} days ago" --oneline 2>/dev/null | wc -l`).trim());
    const last = Number(sh(`git -C ${JSON.stringify(repo)} log -1 --format=%ct 2>/dev/null`).trim()) || 0;
    if (n > 0) repos.push({ path: repo, name: repo.split("/").pop(), recency: last });
  }
  return repos.sort((a, b) => b.recency - a.recency).slice(0, MAX_REPOS);
}
function commits(repos, sinceExpr, mineOnly = true) {
  const all = [];
  const seen = new Set();
  for (const r of repos) {
    // Match ALL of your identities in this repo (per-repo email, global email,
    // GitHub noreply login, matching name), with a fallback when almost nothing
    // matches an active repo. No filter with --all.
    const authorArg = mineOnly ? authorArgs(authorship(r.path).emails) : "";
    const raw = sh(
      `git -C ${JSON.stringify(r.path)} log --since=${JSON.stringify(sinceExpr)} ${authorArg} ` +
      `--no-merges --date=short --name-only --pretty=format:'@@@%H|%ad|%s' -n 60`,
    );
    let cur = null;
    const flush = () => {
      if (cur && !seen.has(cur.h)) { seen.add(cur.h); all.push({ ...cur, repo: r.name }); }
    };
    for (const line of raw.split("\n")) {
      if (line.startsWith("@@@")) {
        flush();
        const [h, date, subject] = line.slice(3).split("|");
        cur = { h, date, subject: subject || "", files: [] };
      } else if (line.trim() && cur) cur.files.push(line.trim());
    }
    flush();
  }
  return all.slice(0, MAX_COMMITS);
}
function openWork(repos) {
  const items = [];
  for (const r of repos) {
    const todos = sh(
      `git -C ${JSON.stringify(r.path)} grep -nEI '(TODO|FIXME|HACK)[:( ]' -- ` +
      `'*.ts' '*.tsx' '*.js' '*.py' '*.go' '*.rs' '*.java' '*.sql' '*.vue' 2>/dev/null | head -8`,
    );
    for (const l of todos.split("\n").filter(Boolean)) {
      const m = l.match(/^([^:]+):(\d+):(.*)$/);
      if (m) items.push(`${r.name}: ${m[3].replace(/^[\s/*#-]+/, "").trim().slice(0, 120)} (${m[1]}:${m[2]})`);
    }
    const st = repoState(r.path);
    if (st.stale) {
      items.push(`${r.name}: STALE checkout — working tree ≈ ${st.staleBy ? "HEAD~" + st.staleBy : "an older commit"}, NOT new work; do not commit (would revert history)`);
    } else if (st.dirty) {
      items.push(`${r.name}: ${st.dirty} uncommitted (${st.mod} mod / ${st.del} del / ${st.add} new) on ${st.branch || "?"}`);
    }
  }
  return items;
}

// ---- model calls (one per provider, same in/out) --------------------------
async function callAnthropic(r, system, prompt) {
  const client = new Anthropic(r.key ? { apiKey: r.key } : {});
  const base = { model: r.model, max_tokens: MAX_TOKENS, system, messages: [{ role: "user", content: prompt }] };
  let res;
  try { res = await client.messages.create({ ...base, output_config: { effort: "low" } }); }
  catch (e) {
    // effort/output_config isn't accepted on every model (e.g. Haiku) — retry plain
    if (/effort|output_config|thinking|budget|400/i.test(e?.message || "")) res = await client.messages.create(base);
    else throw e;
  }
  if (res.stop_reason === "refusal") return "(the model declined this one — odd for a work summary; try again)";
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}
async function callOpenAI(r, system, prompt) {
  const messages = [{ role: "system", content: system }, { role: "user", content: prompt }];
  // Newer models want max_completion_tokens instead of max_tokens; try both.
  for (const tokKey of ["max_tokens", "max_completion_tokens"]) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${r.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: r.model, [tokKey]: MAX_TOKENS, messages }),
    });
    const text = await res.text();
    if (res.ok) return (JSON.parse(text).choices?.[0]?.message?.content || "").trim();
    if (res.status === 400 && tokKey === "max_tokens" && /max_tokens|max_completion_tokens/i.test(text)) continue;
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }
  return "";
}
async function callGemini(r, system, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(r.model)}:generateContent?key=${encodeURIComponent(r.key)}`;
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: MAX_TOKENS },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`);
  const parts = JSON.parse(text).candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("").trim();
}
async function callOllama(r, system, prompt) {
  const res = await fetch(`${r.baseUrl}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: r.model, stream: false, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (/not found|no such model|try pulling/i.test(text)) throw new Error(`the model "${r.model}" isn't downloaded yet — run  symbiot setup-local --model ${r.model}  (or click "Set up a free local model" in Settings)`);
    throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`);
  }
  return (JSON.parse(text).message?.content || "").trim();
}

async function write(system, prompt) {
  const r = resolveProvider();
  if (!r) { console.log(AUTH_HELP); return null; }
  const stop = spinner("thinking…");
  try {
    if (r.provider === "anthropic") return await callAnthropic(r, system, prompt);
    if (r.provider === "openai") return await callOpenAI(r, system, prompt);
    if (r.provider === "gemini") return await callGemini(r, system, prompt);
    if (r.provider === "ollama") return await callOllama(r, system, prompt);
    return null;
  } catch (err) {
    if (/\b401\b|\b403\b|invalid|authentication|api key|unauthor/i.test(err?.message || "")) {
      console.log(c.y(`Your ${PROVIDERS[r.provider].label} credentials were rejected. `) + "Reconnect with:  " + c.b("symbiot login --force"));
      return null;
    }
    return `Couldn't reach the model: ${err?.message || err}`;
  } finally { stop(); }
}

async function validate(provider, { key, baseUrl } = {}) {
  try {
    if (provider === "anthropic") { await new Anthropic({ apiKey: key }).models.list(); return true; }
    if (provider === "openai") return (await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } })).ok;
    if (provider === "gemini") return (await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`)).ok;
    if (provider === "ollama") return (await fetch(`${baseUrl}/api/tags`)).ok;
  } catch { return false; }
  return false;
}

const AUTH_HELP =
  c.y("Symbiot needs an AI to write your updates. Connect one:\n") +
  "  " + c.b("symbiot login") + c.d("   pick Claude, OpenAI, Gemini, or a local model (Ollama)") + "\n" +
  c.d("  Or set a key in your environment: ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY.");

// ---- render ---------------------------------------------------------------
function renderCommits(list) {
  return list.map((x) => `- [${x.repo}] ${x.subject}${x.files.length ? ` (${x.files.length} files)` : ""}`).join("\n");
}
function header(sub) {
  if (PLAIN) { console.log(`Symbiot\n${sub}\n`); return; }
  console.log(`\n${c.g("●")} ${c.b("Symbiot")} ${c.d("· " + sub)}\n`);
}

// ---- commands -------------------------------------------------------------
const SINCE_WEEK = Number(flag("since", "7"));
const BASE = flag("dir", scanHome());

// ---- hardware -> model recommendations ------------------------------------
function detectGpu() {
  const nv = sh("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null").trim();
  if (nv) { const p = nv.split("\n")[0].split(","); return { name: (p[0] || "NVIDIA GPU").trim(), vramGB: Math.round(Number(p[1]) / 1024) || null, kind: "nvidia" }; }
  if (process.platform === "linux") { const vga = sh("lspci 2>/dev/null | grep -iE 'vga|3d controller|display' | head -1").replace(/^.*?: /, "").trim(); if (vga) return { name: vga, vramGB: null, kind: "other" }; }
  if (process.platform === "darwin") { const chip = sh("sysctl -n machdep.cpu.brand_string 2>/dev/null").trim(); if (/apple/i.test(chip)) return { name: chip + " (unified memory)", vramGB: null, kind: "apple" }; }
  return null;
}
function detectHardware() {
  const cpus = oscpus() || [];
  return { platform: process.platform, arch: process.arch, ramGB: Math.round(totalmem() / 1073741824), cpuCount: cpus.length, cpuModel: ((cpus[0] && cpus[0].model) || "CPU").trim(), gpu: detectGpu() };
}
function recommendModels(hw) {
  const ram = hw.ramGB || 8;
  const local = [
    { tier: "min", model: "llama3.2:3b", needGB: 6, note: "fast & light — fine for summaries" },
    { tier: "med", model: "llama3.1:8b", needGB: 10, note: "solid all-rounder" },
    { tier: "max", model: "qwen2.5:14b", needGB: 18, note: "stronger reasoning" },
  ];
  if (ram >= 40) local.push({ tier: "max+", model: "llama3.1:70b", needGB: 48, note: "top local quality — big machine/GPU" });
  local.forEach((m) => { m.fits = ram >= m.needGB; });
  const paid = [
    { provider: "anthropic", tier: "cheap", model: "claude-haiku-4-5", note: "cheapest Claude" },
    { provider: "anthropic", tier: "top", model: "claude-opus-5-5", note: "best Claude (default)" },
    { provider: "openai", tier: "cheap", model: "gpt-4o-mini", note: "cheap OpenAI" },
    { provider: "openai", tier: "top", model: "gpt-4o", note: "stronger OpenAI" },
    { provider: "gemini", tier: "cheap", model: "gemini-1.5-flash", note: "cheap Google" },
    { provider: "gemini", tier: "top", model: "gemini-1.5-pro", note: "stronger Google" },
  ];
  const best = (local.slice().reverse().find((m) => m.fits) || local[0]).model;
  return { local, paid, best };
}
// ---- local model one-command setup (Ollama), OS-aware ---------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function hasOllama() { return !!sh("ollama --version").trim(); } // cross-platform (not POSIX command -v)
function ollamaInstall() {
  if (process.platform === "darwin") return { cmd: "brew install ollama", alt: "https://ollama.com/download" };
  if (process.platform === "win32") return { cmd: "winget install Ollama.Ollama", alt: "https://ollama.com/download" };
  return { cmd: "curl -fsSL https://ollama.com/install.sh | sh", alt: "https://ollama.com/download" };
}
async function ollamaUp() { try { const r = await fetch("http://127.0.0.1:11434/api/tags"); return r.ok; } catch { return false; } }
async function ensureOllama() {
  if (await ollamaUp()) return true;
  try { spawn("ollama", ["serve"], { detached: true, stdio: "ignore" }).unref(); } catch {}
  for (let i = 0; i < 16; i++) { await sleep(500); if (await ollamaUp()) return true; }
  return false;
}
function useOllamaModel(model) { const cfg = loadConfig(); cfg.provider = "ollama"; cfg.ollama = { baseUrl: "http://localhost:11434", model }; delete cfg.apiKey; saveConfig(cfg); }
async function cmdSetupLocal() {
  const model = flag("model", null) || recommendModels(detectHardware()).best;
  if (!hasOllama()) {
    const inst = ollamaInstall();
    console.log("\n" + c.y("Ollama isn't installed") + c.d(" — the free, private local-model runner.") + "\n");
    console.log(`  On ${process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux"}, install it then re-run ${c.b("symbiot setup-local")}:`);
    console.log("    " + c.b(inst.cmd));
    console.log(c.d("    or download: " + inst.alt));
    return;
  }
  process.stdout.write(c.d("Starting Ollama… "));
  if (!(await ensureOllama())) { console.log(c.y("couldn't reach it — start it with ") + c.b("ollama serve")); return; }
  console.log(c.g("ready"));
  console.log("\n" + c.b("Pulling " + model) + c.d("  (first time downloads a few GB — progress below)\n"));
  const code = await new Promise((res) => { const ch = spawn("ollama", ["pull", model], { stdio: "inherit" }); ch.on("close", res); ch.on("error", () => res(1)); });
  if (code !== 0) { console.log("\n" + c.y("Pull failed.") + c.d(" Try a smaller model: ") + c.b("symbiot setup-local --model llama3.2:3b")); return; }
  useOllamaModel(model);
  console.log("\n" + c.g("✓ ") + `Symbiot now runs on ${model} locally — free & private. Try:  ` + c.b("symbiot week"));
}
function cmdModels() {
  const hw = detectHardware(); const rec = recommendModels(hw);
  const pad = (s, n) => String(s).padEnd(n);
  console.log("\n" + c.b("Your machine"));
  console.log(`  ${c.b(hw.ramGB + " GB")} RAM · ${hw.cpuCount}-core ${hw.cpuModel} · ${hw.platform}/${hw.arch}`);
  if (hw.gpu) console.log(`  GPU: ${hw.gpu.name}${hw.gpu.vramGB ? ` (${hw.gpu.vramGB} GB VRAM)` : ""}`);
  console.log("\n" + c.b("Local models") + c.d("  (free & private via Ollama — install: ollama pull <model>)"));
  rec.local.forEach((m) => console.log(`  ${m.fits ? c.g("✓") : c.d("·")} ${pad(m.tier, 5)} ${pad(m.model, 16)} ${c.d("~" + m.needGB + "GB  " + m.note + (m.fits ? "" : "  (needs more RAM)"))}`));
  console.log(c.d(`  Best fit for you: `) + c.b(rec.best) + c.d(`   →  ollama pull ${rec.best}  then  symbiot login  (choose Ollama)`));
  console.log("\n" + c.b("Paid models") + c.d("  (bring an API key — symbiot login)"));
  rec.paid.forEach((p) => console.log(`  ${pad(p.provider, 10)} ${pad(p.tier, 6)} ${pad(p.model, 20)} ${c.d(p.note)}`));
  console.log("");
}

// ---- drift across every repo (per-repo facts: drift.mjs) -------------------
function computeDrift(opts = {}) {
  const own = scanBegin();
  try {
    const deploys = loadDeploys();
    const found = findAllRepos().slice(0, 20), repos = [];
    scanPhase("checking drift", found.length);
    for (const r of found) {
      if (scanExpired()) break;
      repos.push(driftRepo(r.path, { deploys, ci: opts.ci, fetch: opts.fetch })); scanTick(r.name);
    }
    return { repos, ci: !!opts.ci, partial: SCAN.partial };
  } finally { scanEnd(own); }
}
function cmdDrift() {
  const d = computeDrift({ ci: has("ci"), fetch: has("fetch") });
  const warn = d.repos.filter((r) => r.flags.some((f) => f.level === "warn"));
  console.log(`\n${c.g("●")} ${c.b("Symbiot drift")} ${c.d("· " + d.repos.length + " repos · " + warn.length + " with risks")}\n`);
  for (const r of d.repos) {
    if (!r.flags.length) continue;
    const risky = r.flags.some((f) => f.level === "warn");
    console.log(`${risky ? c.y("●") : c.d("○")} ${c.b(r.name)} ${c.d(r.def + (r.fetchAgeDays != null && r.fetchAgeDays > 3 ? " · fetch " + r.fetchAgeDays + "d old" : ""))}`);
    for (const f of r.flags) console.log(`  ${f.level === "warn" ? c.y("⚠") : c.d("·")} ${f.text}${f.evidence ? c.d("  [" + f.evidence + "]") : ""}`);
    console.log("");
  }
  const clean = d.repos.filter((r) => !r.flags.length).map((r) => r.name);
  if (clean.length) console.log(c.d(`clean: ${clean.join(", ")}`));
  console.log(c.d(`\nsymbiot ${VERSION} · local git facts only${d.ci ? " + CI" : " (add --ci for CI status)"}${loadDeploys() && Object.keys(loadDeploys()).length ? "" : " · set ~/.config/symbiot/deploys.json for production-sha checks"}`));
}

// ---- work map: a node graph of your repos, languages, and tools -----------
const EXT_LANG = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript",
  py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", rb: "Ruby", php: "PHP",
  cs: "C#", cpp: "C++", cc: "C++", c: "C", swift: "Swift", vue: "Vue", svelte: "Svelte",
  sql: "SQL", sh: "Shell", css: "CSS", scss: "CSS", html: "HTML",
};
const MANIFEST_TOOL = {
  "package.json": "Node", "requirements.txt": "Python", "pyproject.toml": "Python",
  "go.mod": "Go", "Cargo.toml": "Rust", "pom.xml": "Maven", "build.gradle": "Gradle",
  "Gemfile": "Ruby", "composer.json": "PHP", "Dockerfile": "Docker", "docker-compose.yml": "Docker",
  "terraform.tf": "Terraform", "kubernetes.yml": "Kubernetes", ".github": "GitHub Actions",
};
function findAllRepos(base) {
  const own = scanBegin();
  try {
    const roots = base ? [base] : scanRoots();
    const repos = []; const seen = new Set();
    for (const root of roots) {
      if (scanExpired()) break;
      scanPhase("finding repos in " + root.replace(homedir(), "~"));
      const gits = findGitDirs(root, 300);
      scanPhase("reading repos", gits.length);
      for (const g of gits) {
        if (scanExpired()) break;
        const repo = g.replace(/\/\.git$/, ""); scanTick(repo.split("/").pop());
        if (seen.has(repo)) continue; seen.add(repo);
        const last = Number(sh(`git -C ${JSON.stringify(repo)} log -1 --format=%ct 2>/dev/null`).trim()) || 0;
        if (last) repos.push({ path: repo, name: repo.split("/").pop(), recency: last });
      }
    }
    // Group worktrees by shared git dir; keep only the freshest checkout of each.
    // (Not deadline-bound: it's what makes the result correct, and it's cheap.)
    const byCommon = {};
    for (const r of repos) {
      const cd = sh(`git -C ${JSON.stringify(r.path)} rev-parse --git-common-dir 2>/dev/null`).trim() || r.path;
      const key = cd.startsWith("/") ? cd : join(r.path, cd);
      if (!byCommon[key] || byCommon[key].recency < r.recency) byCommon[key] = r;
    }
    return Object.values(byCommon).sort((a, b) => b.recency - a.recency).slice(0, 60);
  } finally { scanEnd(own); }
}
function detectRepo(r) {
  const files = sh(`git -C ${JSON.stringify(r.path)} ls-files 2>/dev/null | head -3000`).split("\n").filter(Boolean);
  const count = {}; const tools = new Set();
  for (const f of files) {
    const base = f.split("/").pop();
    if (MANIFEST_TOOL[base]) tools.add(MANIFEST_TOOL[base]);
    const ext = (base.includes(".") ? base.split(".").pop() : "").toLowerCase();
    if (EXT_LANG[ext]) count[EXT_LANG[ext]] = (count[EXT_LANG[ext]] || 0) + 1;
  }
  const langs = Object.entries(count).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  const email = sh(`git -C ${JSON.stringify(r.path)} config user.email`).trim();
  const mine = Number(sh(`git -C ${JSON.stringify(r.path)} log ${email ? `--author=${JSON.stringify(email)}` : ""} --oneline 2>/dev/null | wc -l`).trim()) || 0;
  const branch = sh(`git -C ${JSON.stringify(r.path)} rev-parse --abbrev-ref HEAD 2>/dev/null`).trim();
  const last = sh(`git -C ${JSON.stringify(r.path)} log -1 --format=%cd --date=short 2>/dev/null`).trim();
  return { ...r, langs, tools: [...tools], mine, files: files.length, branch, last };
}
// Non-git PROJECT folders inside your scan roots (you added them = consent):
// a directory with a manifest but no .git — "not everything is a repo".
function findProjectFolders(root) {
  const manifests = findPaths([root, "-maxdepth", "3", ...anyName([...PRUNE, ".git"]), "-prune", "-o", "-type", "f",
    ...anyName(["package.json", "requirements.txt", "pyproject.toml", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "Gemfile", "composer.json", "Dockerfile", "pubspec.yaml", "CMakeLists.txt"]), "-print"], 200);
  const dirs = new Set(); for (const m of manifests) dirs.add(m.replace(/\/[^/]+$/, ""));
  const out = [];
  for (const d of dirs) {
    if (sh(`git -C ${JSON.stringify(d)} rev-parse --is-inside-work-tree 2>/dev/null`).trim() === "true") continue; // inside a repo already
    out.push(d); if (out.length >= 24) break;
  }
  return out;
}
function detectFolder(path) {
  const files = sh(`find ${JSON.stringify(path)} -maxdepth 2 \\( -name node_modules -o -name .git \\) -prune -o -type f -print 2>/dev/null | head -2000`).split("\n").filter(Boolean);
  const count = {}; const tools = new Set();
  for (const f of files) { const base = f.split("/").pop(); if (MANIFEST_TOOL[base]) tools.add(MANIFEST_TOOL[base]); const ext = (base.includes(".") ? base.split(".").pop() : "").toLowerCase(); if (EXT_LANG[ext]) count[EXT_LANG[ext]] = (count[EXT_LANG[ext]] || 0) + 1; }
  return { path, name: path.split("/").pop(), langs: Object.entries(count).sort((a, b) => b[1] - a[1]).map((x) => x[0]), tools: [...tools], files: files.length };
}
// Projects you've run an AI coding agent on. Claude Code stores one dir per
// project under ~/.claude/projects, named by the project path with every
// non-alphanumeric char → "-" (so "/" "." "_" "-" all collide). Returns
// { "<encoded path>": { agent, last, path } } — last = newest session mtime
// (epoch secs); path = the real project dir, read from the "cwd" a session
// records (empty when no session says, then callers fall back to decoding).
// (Gemini's dir is global config, Codex's is empty, so no reliable per-project
// signal there yet; add them here when there is.)
const claudeEnc = (p) => String(p || "").replace(/[^a-zA-Z0-9]/g, "-");
function sessionCwd(file) {
  const head = sh(`head -c 262144 ${JSON.stringify(file)} 2>/dev/null`);
  const m = head.match(/"cwd":"((?:[^"\\]|\\.)*)"/);
  if (!m) return "";
  try { return JSON.parse(`"${m[1]}"`); } catch { return ""; }
}
function claudeProjects() {
  const base = join(homedir(), ".claude", "projects");
  const out = {};
  let dirs = [];
  try { dirs = sh(`ls -1 ${JSON.stringify(base)} 2>/dev/null`).split("\n").filter(Boolean); } catch {}
  for (const enc of dirs) {
    let last = 0, path = "";
    const newest = sh(`find ${JSON.stringify(join(base, enc))} -maxdepth 1 -name '*.jsonl' -printf '%T@ %p\\n' 2>/dev/null | sort -rn | head -1`).trim();
    if (newest) {
      const sp = newest.indexOf(" ");
      last = parseInt(newest.slice(0, sp), 10) || 0;
      const cwd = sessionCwd(newest.slice(sp + 1));
      if (cwd && (claudeEnc(cwd) === enc || cwd.replace(/\//g, "-") === enc)) path = cwd; // only trust a cwd that matches this dir
    }
    if (!last) { try { last = Math.floor(statSync(join(base, enc)).mtimeMs / 1000); } catch {} }
    out[enc] = { agent: "Claude Code", last, path };
  }
  return out;
}
// Async only to YIELD between repos, so the app server can answer /api/scan
// (progress) mid-scan; the git calls themselves stay synchronous. Concurrent
// callers (e.g. Rescan while a scan runs) share the one in-flight build.
let MAP_BUILD = null;
function buildMap() {
  if (!MAP_BUILD) MAP_BUILD = buildMapNow().finally(() => { MAP_BUILD = null; });
  return MAP_BUILD;
}
const yieldTick = () => new Promise((r) => setImmediate(r));
async function buildMapNow() {
  const own = scanBegin();
  try { return await buildMapScan(); } finally { scanEnd(own); }
}
async function buildMapScan() {
  const who = me();
  const found = findAllRepos();
  const repos = [];
  scanPhase("reading repo details", found.length);
  for (const r of found) {
    if (scanExpired()) break;
    await yieldTick();
    repos.push(detectRepo(r)); scanTick(r.name);
  }
  const nodes = []; const edges = []; const have = new Set();
  const add = (n) => { if (!have.has(n.id)) { have.add(n.id); nodes.push(n); } };
  add({ id: "me", type: "person", label: who.name || "You", weight: 22 });
  for (const r of repos) {
    const rid = "repo:" + r.path;
    add({ id: rid, type: "repo", label: r.name, weight: Math.min(9 + Math.log2(1 + r.mine) * 3, 26),
      meta: { commits: r.mine, langs: r.langs.slice(0, 3), tools: r.tools, files: r.files, branch: r.branch, last: r.last, path: r.path } });
    edges.push({ source: "me", target: rid });
    for (const L of r.langs.slice(0, 3)) { const id = "lang:" + L; add({ id, type: "lang", label: L, weight: 15 }); edges.push({ source: rid, target: id }); }
    for (const T of r.tools) { const id = "tool:" + T; add({ id, type: "tool", label: T, weight: 12 }); edges.push({ source: rid, target: id }); }
  }
  // Non-git project folders in the scan roots (capped; deduped against repos).
  try {
    const repoPaths = new Set(repos.map((r) => r.path)); let folders = 0;
    for (const root of scanRoots()) { if (scanExpired()) break; scanPhase("finding project folders"); for (const d of findProjectFolders(root)) {
      if (repoPaths.has(d) || have.has("folder:" + d) || folders >= 20) continue;
      if (scanExpired()) break;
      await yieldTick();
      const det = detectFolder(d); folders++; scanTick(det.name);
      add({ id: "folder:" + d, type: "folder", label: det.name, weight: 10, meta: { path: d, langs: det.langs.slice(0, 3), tools: det.tools, files: det.files } });
      edges.push({ source: "me", target: "folder:" + d });
      for (const L of det.langs.slice(0, 3)) { const id = "lang:" + L; add({ id, type: "lang", label: L, weight: 15 }); edges.push({ source: "folder:" + d, target: id }); }
    } }
  } catch {}
  // What you build WITH (person-level, not per-repo): detected agents/editors
  // and the AI currently powering Symbiot — so the initial scan shows the whole
  // setup, not just code. All local detection, nothing invasive.
  try {
    const hands = detectHandoffs();
    for (const a of [...hands.agents, ...hands.editors]) {
      const id = "agent:" + a.label;
      add({ id, type: "agent", label: a.label.replace(/\s*\(.*\)$/, ""), weight: 11, meta: { cmd: a.tmpl, kind: a.kind } });
      edges.push({ source: "me", target: id });
    }
    const prov = resolveProvider();
    if (prov) { const id = "ai:" + prov.provider; add({ id, type: "ai", label: PROVIDERS[prov.provider].label, weight: 14, meta: { model: prov.model, source: prov.source } }); edges.push({ source: "me", target: id }); }
  } catch {}
  // Agent projects: badge the repo/folder nodes an AI coding agent has worked,
  // and surface agent-worked projects the scan missed as their own nodes.
  try {
    const ap = claudeProjects(); const used = new Set();
    for (const n of nodes) {
      if ((n.type === "repo" || n.type === "folder") && n.meta && n.meta.path) {
        const e = [claudeEnc(n.meta.path), n.meta.path.replace(/\//g, "-")].find((k) => ap[k]); // older Claude Code mapped only "/"
        if (e) { n.meta.agents = [{ agent: ap[e].agent, last: ap[e].last }]; used.add(e); }
      }
    }
    let extra = 0;
    for (const e of Object.keys(ap)) {
      if (used.has(e) || extra >= 20) continue;
      // the session's recorded cwd; else best-effort decode (names with - . _ won't resolve and are skipped)
      const decoded = ap[e].path || e.replace(/-/g, "/");
      if (!existsSync(decoded) || !statSync(decoded).isDirectory()) continue;
      if (nodes.some((n) => n.meta && n.meta.path === decoded)) continue;
      const isGit = existsSync(join(decoded, ".git"));
      const id = (isGit ? "repo:" : "folder:") + decoded; if (have.has(id)) continue;
      const det = isGit ? null : detectFolder(decoded);
      add({ id, type: isGit ? "repo" : "folder", label: decoded.split("/").pop(), weight: 10, meta: { path: decoded, agents: [{ agent: ap[e].agent, last: ap[e].last }], agentOnly: true, langs: det ? det.langs.slice(0, 3) : [], tools: det ? det.tools : [], files: det ? det.files : 0 } });
      edges.push({ source: "me", target: id }); extra++;
    }
  } catch {}
  const out = { nodes, edges, stats: {
    repos: repos.length,
    folders: nodes.filter((n) => n.type === "folder").length,
    languages: nodes.filter((n) => n.type === "lang").length,
    tools: nodes.filter((n) => n.type === "tool").length,
    agents: nodes.filter((n) => n.type === "agent").length,
    commits: repos.reduce((s, r) => s + r.mine, 0),
    files: repos.reduce((s, r) => s + (r.files || 0), 0),
    base: BASE,
    partial: SCAN.partial, // the scan hit its deadline — this is what it found so far
  } };
  LAST_MAP = out;
  return out;
}
// Local detail for a clicked node (no AI).
async function nodeDetail(id) {
  const map = LAST_MAP || await buildMap();
  if (id === "me") { const n = map.nodes.find((x) => x.id === "me"); return { type: "person", label: (n && n.label) || "You", stats: map.stats }; }
  if (id.startsWith("repo:")) {
    const path = id.slice(5); const n = map.nodes.find((x) => x.id === id); const m = (n && n.meta) || {};
    return {
      type: "repo", label: n ? n.label : path.split("/").pop(), path,
      branch: sh(`git -C ${JSON.stringify(path)} rev-parse --abbrev-ref HEAD 2>/dev/null`).trim(),
      dirty: sh(`git -C ${JSON.stringify(path)} status --porcelain 2>/dev/null`).split("\n").filter(Boolean).length,
      last: sh(`git -C ${JSON.stringify(path)} log -1 --format=%cd --date=short 2>/dev/null`).trim(),
      commits: m.commits || 0, langs: m.langs || [], tools: m.tools || [], agents: m.agents || [],
    };
  }
  if (id.startsWith("lang:") || id.startsWith("tool:")) {
    const n = map.nodes.find((x) => x.id === id);
    const repos = map.edges.filter((e) => e.target === id).map((e) => { const r = map.nodes.find((x) => x.id === e.source); return r ? r.label : null; }).filter(Boolean);
    return { type: id.startsWith("lang:") ? "lang" : "tool", label: n ? n.label : id.split(":")[1], repos };
  }
  if (id.startsWith("agent:") || id.startsWith("ai:")) {
    const n = map.nodes.find((x) => x.id === id);
    return { type: id.startsWith("agent:") ? "agent" : "ai", label: n ? n.label : id.split(":")[1], meta: (n && n.meta) || {} };
  }
  if (id.startsWith("folder:")) {
    const path = id.slice(7); const n = map.nodes.find((x) => x.id === id); const m = (n && n.meta) || {};
    return { type: "folder", label: n ? n.label : path.split("/").pop(), path, langs: m.langs || [], tools: m.tools || [], files: m.files || 0, agents: m.agents || [] };
  }
  return { error: "unknown node" };
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
    `"In flight" (what's clearly underway), "Next steps" (3-5 concrete actions), "Ideas" (2-3 that fit where this is heading). ` +
    `Ground each point in the evidence; recent commits beat the README. Do not advise against the stated conventions. ` +
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
    `"Next steps" (3-5 concrete actions — a strong first one is often "git init" if this looks like real work), ` +
    `"Ideas" (2-3 that fit where it's heading). Ground every point in the actual files/manifest/README shown. No preamble.`;
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
  const history = (it.chat || []).slice(-12).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n\n");
  const system =
    `You are a pragmatic senior engineer helping someone with ONE task on their list — before or after they hand it to a coding agent. ` +
    `Answer their question about the task directly and concisely, in plain text, no preamble. Ground what you say in the project evidence shown; ` +
    `if the evidence doesn't settle it, say so and what you'd check. If the task is ambiguous, say how you'd read it and what to clarify. ` +
    `Never invent files, features or history.`;
  const prompt =
    `Task: ${it.text}\nKind: ${taskType(it.text)} · repo: ${it.repo || "(none)"} · status: ${it.archived ? "archived" : it.review ? "done by the agent, awaiting review" : it.done ? "done" : "open"}\n\n` +
    (ctx.length ? ctx.join("\n\n") + "\n\n" : path ? "" : "(no repo attached — answer from the task text alone)\n\n") +
    (history ? `Conversation so far:\n${history}\n\n` : "") + `Question: ${question}`;
  const answer = (await write(system, prompt)) || "(couldn't reach the model)";
  // Re-read: other requests may have changed tasks.json while the model ran.
  const t = loadTasks(); const cur = t.find((x) => x.id === id); const now = Date.now();
  if (!cur) return { answer, chat: [] };
  cur.chat = [...(cur.chat || []), { role: "user", text: question, ts: now }, { role: "ai", text: answer, ts: now }].slice(-CHAT_KEEP);
  saveTasks(t);
  return { answer, chat: cur.chat };
}
function clearTaskChat(id) { const t = loadTasks(); const it = t.find((x) => x.id === id); if (!it) return { error: "not found" }; delete it.chat; saveTasks(t); return { ok: true }; }

// Build a write-up for a command; returns { text, sub, error? } without printing.
// Shared by the CLI (cmdRun) and the web UI (symbiot app).
// The SAME repo set the Map uses — reuse its cached scan when present, else do
// the identical discovery. So week/standup/todo/drift all agree with the Map.
function discoveredRepos() {
  if (LAST_MAP && LAST_MAP.nodes) return LAST_MAP.nodes.filter((n) => n.type === "repo" && n.meta && n.meta.path).map((n) => ({ path: n.meta.path, name: n.label, recency: 0 }));
  return findAllRepos();
}
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
async function produce(cmd) {
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
  const days = cmd === "standup" ? 2 : SINCE_WEEK;
  const who = me();
  // Discover the Map's repo set, then keep only those with commits in the window.
  const all = discoveredRepos();
  const repos = all.filter((r) => sh(`git -C ${JSON.stringify(r.path)} log --since="${days} days ago" --oneline -1 2>/dev/null`).trim());
  const mail = sentMail(days); // [] unless email is switched on
  if (!repos.length && !mail.length) return { text: `No commits in the last ${days} days across your ${all.length} repos.\nAdd folders to scan in Settings, or check your git identity.`, sub: "no activity" };
  let cs = commits(repos, `${days} days ago`, !has("all"));
  if (!cs.length) cs = commits(repos, `${days} days ago`, false); // fall back to all if none matched you
  const open = label === "week" ? openWork(repos) : [];
  if (!cs.length && !mail.length) return { text: "Found repos, but no commits in the window.", sub: "no commits" };

  const system =
    `You write a short, first-person work update from a person's git commits${mail.length ? " and the emails they sent" : ""}. ` +
    `Write as them ("I"), plainly and specifically, grouped by theme or project, most important first. ` +
    `Turn commit messages into outcomes a manager or teammate would understand — not a raw commit list. ` +
    (mail.length ? `Fold the emails into those themes (a decision, a hand-off, who they worked with); skip routine ones (receipts, scheduling, one-line replies). You only have their subjects and recipients — don't guess at what they said. ` : "") +
    `${label === "standup" ? "Keep it to 3-5 bullets: done, and what's next." : "A short paragraph or a few grouped bullets; end with a one-line 'In progress / next' if there are open items."} ` +
    `No preamble, no sign-off, no invented work — only what the commits${mail.length ? ", emails" : ""} and open items show.`;
  const prompt =
    `Person: ${who.name || "me"}. Window: ${label === "standup" ? "since yesterday" : `last ${days} days`}.\n\n` +
    `Commits:\n${cs.length ? renderCommits(cs) : "(none)"}\n\n` +
    (mail.length ? `Emails I sent (date · to · subject):\n${renderMail(mail)}\n\n` : "") +
    (open.length ? `Open / in progress:\n${open.map((o) => `- ${o}`).join("\n")}\n\n` : "") +
    `Write the ${label === "standup" ? "standup" : "update"}.`;

  const text = await write(system, prompt);
  const mailNote = mail.length ? ` · ${mail.length} sent email${mail.length === 1 ? "" : "s"}` : "";
  return { text: text || "(couldn't reach the model)", sub: `${cs.length} commits across ${new Set(cs.map((x) => x.repo)).size} repos${mailNote} · ${label}`, footer: `symbiot ${VERSION} · ${all.length} repos (same as the Map) · ${repos.length} active · ${cs.length} commits in last ${days}d${mailNote}` };
}

async function cmdRun(cmd) {
  if (!resolveProvider()) { console.log(AUTH_HELP); return; }
  const r = await produce(cmd);
  header(r.sub || cmd);
  if (r.text) console.log(r.text + "\n");
  if (r.footer) console.log(c.d(r.footer) + "\n");
}

// Save a provider connection (used by the web Settings panel); mirrors cmdLogin.
async function connectProvider(b) {
  const provider = b && b.provider;
  if (!PROVIDERS[provider]) return { ok: false, message: "Unknown provider." };
  const cfg = loadConfig();
  if (provider === "ollama") {
    const baseUrl = (b.baseUrl || "http://localhost:11434").trim();
    const model = (b.model || "").trim() || PROVIDERS.ollama.model;
    if (!(await validate("ollama", { baseUrl }))) return { ok: false, message: `Couldn't reach Ollama at ${baseUrl}. Is it running?` };
    cfg.provider = "ollama"; cfg.ollama = { baseUrl, model }; delete cfg.apiKey;
    return saveConfig(cfg) ? { ok: true, message: `Connected: ${PROVIDERS.ollama.label} · ${model}` } : { ok: false, message: "Couldn't write the config file." };
  }
  const key = (b.key || "").trim();
  if (!key) return { ok: false, message: "No key entered." };
  const model = (b.model || "").trim() || PROVIDERS[provider].model;
  if (!(await validate(provider, { key }))) return { ok: false, message: `That key didn't work for ${PROVIDERS[provider].label}.` };
  cfg.provider = provider; cfg[provider] = { apiKey: key, model }; delete cfg.apiKey;
  return saveConfig(cfg) ? { ok: true, message: `Connected: ${PROVIDERS[provider].label} · ${model}` } : { ok: false, message: "Couldn't write the config file." };
}

function saveAndReport(cfg, what) {
  if (saveConfig(cfg)) {
    console.log(c.g("✓ ") + `Connected: ${what}. Try:  ` + c.b("symbiot week"));
    console.log(c.d(`  Saved in ${CONFIG_PATH} (readable only by you).`));
  } else console.log(c.y("Couldn't write the config file at " + CONFIG_PATH));
}

async function cmdLogin() {
  const flagProvider = flag("provider", null);
  const existing = resolveProvider();
  if (existing && !flagProvider && !flag("key", null) && !has("force")) {
    console.log(c.g("✓ ") + `Already connected — ${PROVIDERS[existing.provider].label} via ${existing.source}.`);
    console.log(c.d("  Switch or replace it with `symbiot login --force`."));
    return;
  }

  let provider = flagProvider;
  if (!provider) {
    console.log("\n" + c.b("Connect Symbiot") + "\n");
    console.log("Which AI should Symbiot write your updates with?\n");
    console.log("  1) " + PROVIDERS.anthropic.label + c.d("    — needs an Anthropic API key"));
    console.log("  2) " + PROVIDERS.openai.label + c.d("          — needs an OpenAI API key"));
    console.log("  3) " + PROVIDERS.gemini.label + c.d("       — needs a Google AI API key"));
    console.log("  4) " + PROVIDERS.ollama.label + c.d("  — runs on your machine, no key"));
    const pick = (await ask("\nChoose 1-4 [1]: ")) || "1";
    provider = { 1: "anthropic", 2: "openai", 3: "gemini", 4: "ollama" }[pick] || (PROVIDERS[pick] ? pick : "anthropic");
  }
  if (!PROVIDERS[provider]) { console.log(c.y("Unknown provider: " + provider)); return; }
  const meta = PROVIDERS[provider];
  const cfg = loadConfig();

  if (provider === "ollama") {
    const baseUrl = (flag("base-url", null) || (await ask("Ollama URL [http://localhost:11434]: ")) || "").trim() || "http://localhost:11434";
    const model = (flag("model", null) || (await ask(`Model name [${meta.model}]: `)) || "").trim() || meta.model;
    const stop = spinner("checking Ollama…");
    const ok = await validate("ollama", { baseUrl });
    stop();
    if (!ok) { console.log(c.y(`Couldn't reach Ollama at ${baseUrl}. `) + c.d("Is it running?  (try: ollama serve)")); process.exitCode = 1; return; }
    cfg.provider = "ollama"; cfg.ollama = { baseUrl, model }; delete cfg.apiKey;
    saveAndReport(cfg, `${meta.label} · ${model}`);
    return;
  }

  console.log("\n" + c.b(`Connect ${meta.label}`) + "\n" + c.d(`  Get a key at:  ${meta.keyUrl}`) + "\n");
  let key = flag("key", null);
  if (!key) key = await ask(`Paste your ${meta.keyName}: `, { secret: true });
  key = (key || "").trim();
  if (!key) { console.log(c.y("No key entered — nothing saved.")); return; }
  const model = (flag("model", null) || "").trim() || meta.model;

  const stop = spinner("checking the key…");
  const ok = await validate(provider, { key });
  stop();
  if (!ok) {
    console.log(c.y(`That key didn't work for ${meta.label}. `) + c.d("Double-check it and run `symbiot login` again."));
    process.exitCode = 1;
    return;
  }
  cfg.provider = provider; cfg[provider] = { apiKey: key, model }; delete cfg.apiKey;
  saveAndReport(cfg, `${meta.label} · ${model}`);
}

function cmdLogout() {
  const cfg = loadConfig();
  const had = cfg.provider || cfg.apiKey || Object.keys(PROVIDERS).some((p) => cfg[p]);
  delete cfg.provider; delete cfg.apiKey;
  for (const p of Object.keys(PROVIDERS)) delete cfg[p];
  saveConfig(cfg);
  console.log(had ? c.g("✓ ") + `Cleared saved credentials from ${CONFIG_PATH}.` : "No saved credentials to remove.");
  const envs = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"].filter((e) => process.env[e]);
  if (envs.length) console.log(c.d(`Note: still set in your environment: ${envs.join(", ")}.`));
}

function cmdWhoami() {
  const r = resolveProvider();
  if (r) console.log(c.g("✓ ") + `Connected: ${PROVIDERS[r.provider].label} · model ${r.model} · via ${r.source}.`);
  else { console.log(c.y("Not connected yet.\n")); console.log(AUTH_HELP); }
}

// ---- `symbiot app` : the same UI in a chrome-less browser window ----------
// Self-contained HTML served at / — no backticks or ${} inside (it lives in a
// template literal). Talks to the local API with the per-launch token.

function readBody(req) {
  return new Promise((resolve) => {
    let d = ""; req.on("data", (ch) => (d += ch));
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}
// Find a Chromium-family browser for the chrome-less --app window, per OS.
function chromeBinary() {
  const p = process.platform;
  const exists = (f) => { try { return existsSync(f) ? f : null; } catch { return null; } };
  if (p === "darwin") {
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"].map(exists).find(Boolean) || null;
  }
  if (p === "win32") {
    const bases = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
    const rels = ["Google\\Chrome\\Application\\chrome.exe", "Chromium\\Application\\chrome.exe",
      "Microsoft\\Edge\\Application\\msedge.exe", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"];
    for (const base of bases) for (const r of rels) { const f = exists(join(base, r)); if (f) return f; }
    const w = sh("where chrome 2>NUL").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return w || null;
  }
  return ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave-browser", "microsoft-edge"].find(hasCmd) || null;
}
function openApp(url) {
  try {
    // Android (Termux): hand the URL to the phone's browser. termux-open-url ships
    // with Termux; `am start` is the fallback.
    if (process.platform === "android") {
      if (hasCmd("termux-open-url")) spawn("termux-open-url", [url], { detached: true, stdio: "ignore" }).unref();
      else spawn("am", ["start", "-a", "android.intent.action.VIEW", "-d", url], { detached: true, stdio: "ignore" }).unref();
      return "browser tab";
    }
    const chrome = chromeBinary();
    if (chrome) { spawn(chrome, [`--app=${url}`, "--new-window", "--no-first-run", "--no-default-browser-check"], { detached: true, stdio: "ignore" }).unref(); return "app window"; }
    // fall back to the OS default browser (a normal tab) — still fully functional
    if (process.platform === "win32") { spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref(); return "browser tab"; }
    spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    return "browser tab";
  } catch { return null; }
}
async function cmdApp() {
  SERVING = true;
  const SERVER_STARTED = Date.now();
  // Stable token + port so the URL survives a restart — the open tab can
  // reconnect and auto-reload itself instead of you closing and reopening it.
  const cfg0 = loadConfig();
  let TOKEN = cfg0.appToken;
  if (!TOKEN) { TOKEN = randomBytes(16).toString("hex"); try { saveConfig({ ...loadConfig(), appToken: TOKEN }); } catch {} }
  const PORT = Number(process.env.SYMBIOT_PORT || cfg0.appPort) || 7391;
  // Single instance: if a Symbiot app is already serving this port, don't start
  // a second one (multiple instances race the config and split the open tabs) —
  // just open the one that's running. SYMBIOT_FORCE_NEW overrides (e.g. tests).
  // Not when "Update & restart" relaunched us (SYMBIOT_RELAUNCH): the old app is
  // handing this port over and its window is still open, so finding it here would
  // open a second window and exit, leaving nothing serving either window.
  const RELAUNCH = process.env.SYMBIOT_RELAUNCH === "1"; delete process.env.SYMBIOT_RELAUNCH;
  if (!process.env.SYMBIOT_FORCE_NEW && !RELAUNCH) {
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 800);
      const r = await fetch(`http://127.0.0.1:${PORT}/api/ping`, { headers: { "x-symbiot-token": TOKEN }, signal: ctrl.signal }).catch(() => null);
      clearTimeout(to);
      if (r && r.ok) {
        const p = await r.json().catch(() => ({}));
        if (p && p.version) {
          const url = `http://127.0.0.1:${PORT}/?t=${TOKEN}`; const how = process.env.SYMBIOT_NO_OPEN === "1" ? "" : openApp(url);
          console.log(`\n${c.g("●")} ${c.b("Symbiot")} is already running (v${p.version}) at ${c.b(url)}`);
          console.log(how ? c.d(`  Opened the existing window (a ${how}).`) : c.d("  Open that URL in your browser."));
          console.log(c.d("  (Not starting a second copy. Set SYMBIOT_FORCE_NEW=1 to force one.)"));
          return;
        }
      }
    } catch {}
  }
  const json = (res, obj) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  const screenOut = (s) => (s && s.id ? { ...s, blueprint: blueprint(s) } : s && s.screens ? { ...s, screens: s.screens.map(screenOut) } : s);
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && u.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(EMBEDDED_UI); return; }
    if (u.pathname.startsWith("/api/")) {
      const tok = req.headers["x-symbiot-token"] || u.searchParams.get("t");
      if (tok !== TOKEN) { res.writeHead(403); res.end("forbidden"); return; }
    }
    try {
      if (u.pathname === "/api/status") { const r = resolveProvider(); return json(res, r ? { connected: true, line: `${PROVIDERS[r.provider].label} · ${r.model}` } : { connected: false }); }
      if (u.pathname === "/api/map") return json(res, await buildMap()); // local git only — no AI key needed
      if (u.pathname === "/api/scan") return json(res, { active: SCAN.active, phase: SCAN.phase, done: SCAN.done, total: SCAN.total, item: SCAN.item, elapsed: SCAN.startedAt ? Date.now() - SCAN.startedAt : 0, timeout: SCAN_TIMEOUT_MS, partial: SCAN.partial });
      if (u.pathname === "/api/models") { const hw = detectHardware(); return json(res, { hardware: hw, rec: recommendModels(hw) }); }
      if (u.pathname === "/api/drift") return json(res, computeDrift({ ci: u.searchParams.get("ci") === "1", fetch: u.searchParams.get("fetch") === "1" }));
      if (u.pathname === "/api/node") return json(res, await nodeDetail(u.searchParams.get("id") || "")); // local
      if (u.pathname === "/api/suggest" && req.method === "POST") { const b = await readBody(req); const p = String(b.path || ""); const isRepo = p && existsSync(join(p, ".git")); return json(res, await (isRepo ? repoSuggest(p) : folderSuggest(p))); }
      if (u.pathname === "/api/review" && req.method === "POST") { const b = await readBody(req); return json(res, await repoReview(String(b.path || ""))); }
      if (u.pathname === "/api/tasks" && req.method !== "POST") { const arch = u.searchParams.get("archived") === "1"; return json(res, loadTasks().filter((x) => !!x.archived === arch).map((t) => ({ ...t, type: taskType(t.text) }))); }
      if (u.pathname === "/api/tasks/add" && req.method === "POST") { const b = await readBody(req); return json(res, addTask(b.text, b.repo)); }
      if (u.pathname === "/api/tasks/toggle" && req.method === "POST") { const b = await readBody(req); return json(res, toggleTask(String(b.id || ""))); }
      if (u.pathname === "/api/tasks/remove" && req.method === "POST") { const b = await readBody(req); return json(res, removeTask(String(b.id || ""))); }
      if (u.pathname === "/api/tasks/restore" && req.method === "POST") { const b = await readBody(req); return json(res, restoreTask(String(b.id || ""))); }
      if (u.pathname === "/api/tasks/sync" && req.method === "POST") return json(res, syncTasks());
      if (u.pathname === "/api/tasks/chat" && req.method === "POST") { const b = await readBody(req); return json(res, await taskChat(String(b.id || ""), b.question)); }
      if (u.pathname === "/api/tasks/chat/clear" && req.method === "POST") { const b = await readBody(req); return json(res, clearTaskChat(String(b.id || ""))); }
      if (u.pathname === "/api/pending") return json(res, pendingReview()); // ticked by the agent, awaiting approval
      if (u.pathname === "/api/pending/diff") { const p = repoPathMap()[u.searchParams.get("repo") || ""]; return json(res, { diff: p ? workingDiff(p) : "" }); }
      if (u.pathname === "/api/pending/approve" && req.method === "POST") { const b = await readBody(req); return json(res, approveRepo(String(b.repo || ""), { bump: b.bump })); }
      if (u.pathname === "/api/pending/approve-changes" && req.method === "POST") { const b = await readBody(req); return json(res, approveChanges(String(b.repo || ""), { bump: b.bump })); }
      if (u.pathname === "/api/pending/sendback" && req.method === "POST") { const b = await readBody(req); return json(res, sendBack(String(b.id || ""))); }
      if (u.pathname === "/api/automerge" && req.method === "POST") { const b = await readBody(req); return json(res, setAutoMerge(String(b.repo || ""), !!b.on)); }
      if (u.pathname === "/api/tasks/push" && req.method === "POST") { const b = await readBody(req); return json(res, pushTasks(b)); }
      if (u.pathname === "/api/scanroots") return json(res, { roots: loadConfig().scanRoots || [], effective: scanRoots(), home: scanHome() });
      if (u.pathname === "/api/scanroots/add" && req.method === "POST") { const b = await readBody(req); return json(res, addScanRoot(String(b.path || ""))); }
      if (u.pathname === "/api/scanroots/remove" && req.method === "POST") { const b = await readBody(req); return json(res, removeScanRoot(String(b.path || ""))); }
      if (u.pathname === "/api/agentcfg") { const d = detectHandoffs(); return json(res, { cmd: handoffCmd(), agents: d.agents, editors: d.editors }); }
      if (u.pathname === "/api/agentcmd" && req.method === "POST") { const b = await readBody(req); return json(res, setHandoffCmd(b.cmd)); }
      if (u.pathname === "/api/agent/grant" && req.method === "POST") { const b = await readBody(req); return json(res, grantAgent({ tool: b.tool, dir: b.dir })); }
      if (u.pathname === "/api/open" && req.method === "POST") { const b = await readBody(req); const e = runHandoff(String(b.path || "")); return json(res, { opened: !!e && !e.busy, busy: !!(e && e.busy), auto: !!(e && e.auto), id: e ? e.id : "" }); }
      if (u.pathname === "/api/setup-local" && req.method === "POST") {
        const b = await readBody(req);
        if (!hasOllama()) return json(res, { error: "not-installed", install: ollamaInstall() });
        const model = String(b.model || "") || recommendModels(detectHardware()).best;
        await ensureOllama();
        const e = track("ollama pull " + model, "ollama pull " + shSingle(model), homedir(), (code) => { if (code === 0) useOllamaModel(model); });
        return json(res, { started: true, model, id: e ? e.id : "" });
      }
      if (u.pathname === "/api/agents") return json(res, agentsList());
      if (u.pathname === "/api/agents/answer" && req.method === "POST") { const b = await readBody(req); return json(res, answerQuestions(String(b.path || ""), b.answers, { rerun: !!b.rerun })); }
      if (u.pathname === "/api/mail") return json(res, mailState());
      if (u.pathname === "/api/mail/set" && req.method === "POST") { const b = await readBody(req); return json(res, setMail(b)); }
      if (u.pathname === "/api/mail/preview") { const items = sentMail(Number(u.searchParams.get("days")) || SINCE_WEEK, true); return json(res, { count: items.length, items: items.slice(0, 20) }); }
      // Screens: screenshots + named regions (screens.mjs). The image is an <img>
      // src, so it carries the token in the query (?t=), which the check above accepts.
      if (u.pathname === "/api/screens") return json(res, loadScreens().map(screenOut));
      if (u.pathname === "/api/screens/image") { const f = screenImage(u.searchParams.get("id")); if (!f) { res.writeHead(404); res.end("not found"); return; } res.writeHead(200, { "content-type": "image/png", "cache-control": "private, max-age=86400" }); res.end(readFileSync(f)); return; } // a screen's image never changes
      if (u.pathname === "/api/screens/capture" && req.method === "POST") { const b = await readBody(req); const d = Math.min(10, Math.max(0, Number(b.delay) || 0)); if (d) await new Promise((r) => setTimeout(r, d * 1000)); return json(res, screenOut(captureScreen(b.name, typeof b.which === "string" ? b.which : "all"))); }
      // The displays connected now (for "which display" next to Capture). macOS
      // can't take them all in one image (screencapture takes one display at a time).
      if (u.pathname === "/api/screens/monitors") return json(res, { monitors: listMonitors(), whole: process.platform !== "darwin" });
      if (u.pathname === "/api/screens/split" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(splitScreen(String(b.id || "")))); }
      // Changes a desktop permission, so only on the user's confirmed click.
      if (u.pathname === "/api/screens/allow" && req.method === "POST") { const b = await readBody(req); if (b.confirmed !== true) return json(res, { error: "Allowing screenshots needs your confirmation." }); return json(res, allowScreenshots()); }
      if (u.pathname === "/api/screens/import" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(importScreen(b.name, b.png))); }
      if (u.pathname === "/api/screens/regions" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(setRegions(String(b.id || ""), b.regions))); }
      if (u.pathname === "/api/screens/rename" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(renameScreen(String(b.id || ""), b.name))); }
      if (u.pathname === "/api/screens/remove" && req.method === "POST") { const b = await readBody(req); return json(res, removeScreen(String(b.id || ""))); }
      // A real click on the real screen: only with the user's confirmation, after
      // the delay they picked (to bring the right window to the front).
      if (u.pathname === "/api/screens/click" && req.method === "POST") { const b = await readBody(req); if (b.confirmed !== true) return json(res, { error: "Each click needs your confirmation." }); const d = Math.min(10, Math.max(0, Number(b.delay) || 0)); if (d) await new Promise((r) => setTimeout(r, d * 1000)); return json(res, clickRegion(String(b.id || ""), String(b.region || ""))); }
      // What symbiot-desktop added (desktop.mjs): the weekly write-up, start at login.
      if (u.pathname === "/api/desktop") return json(res, { weekly: weeklyState(), autostart: autostartState() });
      if (u.pathname === "/api/desktop/weekly" && req.method === "POST") { const b = await readBody(req); return json(res, setWeekly(b)); }
      if (u.pathname === "/api/desktop/weekly/run" && req.method === "POST") return json(res, await runWeekly(produce));
      if (u.pathname === "/api/desktop/autostart" && req.method === "POST") { const b = await readBody(req); return json(res, setAutostart(!!b.on, realpathSync(fileURLToPath(import.meta.url)))); }
      if (u.pathname === "/api/run" && req.method === "POST") { const b = await readBody(req); const cmd = ["week", "standup", "todo"].includes(b.cmd) ? b.cmd : "week"; return json(res, await produce(cmd)); }
      if (u.pathname === "/api/connect" && req.method === "POST") { return json(res, await connectProvider(await readBody(req))); }
      if (u.pathname === "/api/ping") { if (u.searchParams.get("fresh") === "1") await checkLatest(); return json(res, { version: VERSION, started: SERVER_STARTED, latest: LATEST_VERSION, newer: semverGt(LATEST_VERSION, VERSION) }); }
      if (u.pathname === "/api/update" && req.method === "POST") {
        // Install the exact newest version (see updateCmd), then relaunch this
        // same app (same port+token => same URL) and exit. The page's heartbeat
        // reconnects and reloads. Free the port first and mark the new copy as a
        // relaunch, so it takes over instead of finding us and bowing out.
        // SYMBIOT_UPDATE_CMD replaces the install (the tests use a no-op).
        const { target, cmd } = updateCmd(LATEST_VERSION, VERSION);
        const inst = process.env.SYMBIOT_UPDATE_CMD || cmd;
        const e = track("symbiot update", inst, homedir(), (code) => {
          if (code !== 0) return;
          server.close(); if (server.closeAllConnections) server.closeAllConnections();
          try { const ch = spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: "ignore", env: { ...process.env, SYMBIOT_RELAUNCH: "1" } }); ch.unref(); } catch {}
          setTimeout(() => process.exit(0), 1200);
        });
        return json(res, { started: true, id: e ? e.id : "", target });
      }
      if (u.pathname === "/api/quit") { res.writeHead(200); res.end("bye"); setTimeout(() => process.exit(0), 150); return; }
    } catch (e) { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: String((e && e.message) || e) })); return; }
    res.writeHead(404); res.end("not found");
  });
  let announced = false, tries = 0, opened = false;
  server.on("listening", () => {
    if (announced) return; announced = true;
    const url = `http://127.0.0.1:${server.address().port}/?t=${TOKEN}`;
    const how = opened || RELAUNCH || process.env.SYMBIOT_NO_OPEN === "1" ? "" : openApp(url); opened = true; // only pop a window the first time (never in tests, never after an update)
    console.log(`\n${c.g("●")} ${c.b("Symbiot")} is running at ${c.b(url)}`);
    console.log(RELAUNCH ? c.d("  Restarted after an update; the open window reloads itself.") : how ? c.d(`  Opened in a ${how}.`) : c.d("  Open that URL in your browser."));
    console.log(c.d("  Leave this running; press Ctrl+C to stop (or click Quit in the window)."));
  });
  server.on("error", (e) => {
    // Stable port busy (an older instance still exiting during an update, or a
    // second app): retry briefly, then fall back to a random port.
    if (e && e.code === "EADDRINUSE" && tries < 8) { tries++; setTimeout(() => { try { server.listen(PORT, "127.0.0.1"); } catch {} }, 500); }
    else { try { server.listen(0, "127.0.0.1"); } catch {} }
  });
  server.listen(PORT, "127.0.0.1");
  checkLatest(); setInterval(checkLatest, 2 * 60 * 1000).unref(); // background update check (every 2 min)
  startWeekly(produce); // the weekly write-up + notification, when switched on in Settings
}

// `symbiot mail [--on|--off] [--add <path>]`: what mail it can read, and a preview.
function cmdMail() {
  if (has("on") || has("off")) setMail({ enabled: has("on") });
  const add = flag("add", null);
  if (add) { const r = setMail({ add }); if (r.error) console.log(c.y(r.error)); }
  const m = mailState();
  console.log(`\n${c.g("●")} ${c.b("Symbiot mail")} ${c.d("(experimental) · " + (m.enabled ? "on — what you sent feeds week and standup" : "off"))}\n`);
  const srcs = [...m.detected.map((d) => [d.path, d.kind]), ...m.sources.map((p) => [p, "added"])];
  if (!srcs.length) console.log(c.y("No mail found on this computer.") + c.d("  Use a desktop mail app (Thunderbird, Apple Mail, Evolution…), or add an export:  symbiot mail --add ~/Takeout/Mail/All.mbox"));
  for (const [p, k] of srcs) console.log(`  ${c.g("·")} ${p}  ${c.d(k)}`);
  if (srcs.length) {
    const items = sentMail(SINCE_WEEK, true);
    console.log("\n" + c.b(`${items.length} sent in the last ${SINCE_WEEK} days`) + c.d("  (headers only)"));
    for (const x of items.slice(0, 12)) console.log(`  ${c.d(x.date)}  ${x.subject}  ${c.d("→ " + (x.to.join(", ") || "?"))}`);
  }
  if (!m.enabled) console.log("\n" + c.d("Switch it on with  symbiot mail --on  (or in the app's Settings)."));
}

const HELP = `${c.b("symbiot")} — your week, written from your real work.

${c.b("Usage")}
  symbiot ${c.d("(or)")} symbiot week      write up your last ${SINCE_WEEK} days
  symbiot standup                   yesterday + today, for standup
  symbiot todo                      what's still on your plate
  symbiot app                       open the visual app in your browser
  symbiot drift [--fetch]           what's out of sync / at risk across repos
  symbiot push [--open]             write tasks into each repo (and run your agent)
  symbiot login                     connect it to an AI (once)
  symbiot whoami                    show how it's connected
  symbiot logout                    forget saved credentials
  symbiot help

${c.b("Experimental")}
  symbiot drift --ci                also check GitHub Actions (needs gh)
  symbiot mail [--on|--off]         use the mail you sent in write-ups (local, no API)
  symbiot models                    recommend AI models for your hardware
  symbiot setup-local [--model X]   install/run a free local model (Ollama)

${c.b("Options")}
  --dir <path>    where your repos are (default: ${homedir()})
  --since <days>  window for 'week' (default 7)
  --all           everyone's commits, not just yours
  --plain         no colour/spinner (good for piping)

${c.b("Setup")}  pick any AI to write with:
  symbiot login                       ${c.d("choose Claude / OpenAI / Gemini / Ollama")}
  symbiot login --provider openai --key sk-...   ${c.d("(non-interactive)")}
  ${c.d("Env keys also work: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY.")}
  ${c.d("Override the model per run with SYMBIOT_MODEL.")}

${c.d("Reads only your local git (and, if you switch it on, the headers of mail you")}
${c.d("sent). No accounts, no OAuth, no data leaves except the commit and email")}
${c.d("subjects sent to the AI to write your update (nothing leaves at all with a")}
${c.d("local Ollama model).")}`;

// ---- main -----------------------------------------------------------------
async function main() {
  if (cmd === "help" || cmd === "--help" || cmd === "-h") { console.log(HELP); return; }
  if (cmd === "login" || cmd === "auth") return cmdLogin();
  if (cmd === "logout") return cmdLogout();
  if (cmd === "whoami" || cmd === "status") return cmdWhoami();
  if (cmd === "app" || cmd === "ui") return cmdApp();
  if (cmd === "models" || cmd === "hardware") return cmdModels();
  if (cmd === "setup-local" || cmd === "setup-ollama") return cmdSetupLocal();
  if (cmd === "drift") return cmdDrift();
  if (cmd === "push") return cmdPush();
  if (cmd === "mail" || cmd === "email") return cmdMail();
  if (cmd === "week") return cmdRun("week");
  if (cmd === "standup") return cmdRun("standup");
  if (cmd === "todo") return cmdRun("todo");
  console.log(c.y(`Unknown command: ${cmd}`) + "\n"); console.log(HELP);
}

// Run the CLI only when invoked directly; when imported (e.g. by tests) just
// expose the pure functions. Compare REAL paths so a global/npx bin symlink
// (argv[1] is the symlink, import.meta.url is the real file) still counts.
const isMain = (() => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();
if (isMain) main();

export { authorship, repoState, readmeInfo, repoShape, houseRules, findAllRepos, buildMap, reportFooter, detectHardware, recommendModels, computeDrift, driftRepo, gitDefaultBranch, buildTasksMd, taskType, EMBEDDED_UI, orcaHandoffCmd, migrateOrcaCmd, migrateClaudeCmd, fillHandoff, handoffCmd, setHandoffCmd, ORCA_CLAUDE_CMD, CLAUDE_CMD, HANDOFF_PROMPT, shipChanges, shipWithBump, bumpOffer, setVersion, syncTasks, pendingReview, unreleased, addTask, approveRepo, approveChanges, sendBack, pushTasks, semverGt, updateCmd, parseQuestions, agentQuestions };
