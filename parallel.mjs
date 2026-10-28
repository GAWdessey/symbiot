// Parallel runs in one lane. A lane is a folder with one agent; a second task that
// doesn't clash with it no longer waits for it. It runs beside it in a git worktree
// of its own (a second checkout of the same repo on its own branch, under
// ~/.config/symbiot/worktrees), and when it finishes its changes are merged back
// into the lane's folder. A task is held back only when it truly clashes with one
// running (the same file, port, phone cable, publish or signed-in browser), or the
// lane is at its cap (config.laneParallel, 3 by default; Free runs one agent at a
// time, licence.mjs). A merge that doesn't apply cleanly stays an open task for the
// lane's own agent, with the changes saved as a patch and named on the task.
//
// A worktree is a folder like any other to the rest of Symbiot: runHandoff(wt)
// starts the agent there, so its log, lock, questions and answers all live in
// wt/.symbiot. The meta for a run is wt/.symbiot/par.json.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, copyFileSync, cpSync, statSync, unlinkSync, readlinkSync, appendFileSync, openSync, readSync, closeSync } from "node:fs";
import { join, basename } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { CONFIG_DIR, loadConfig, loadTasks, saveTasks } from "./core.mjs";
import { runHandoff, runningHandoff, loadRunFiles, saveRunFiles, answersDigest, ANSWERS_ARCHIVE, loadRuns } from "./agents.mjs";
import { parseHandoffs, parseFacts, parseAwaiting } from "./handover.mjs";
import { licenceState, isPro } from "./licence.mjs";

const WT_DIR = join(CONFIG_DIR, "worktrees"), DEFAULT_CAP = 3, MAX_CAP = 8;
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
const git = (cwd, args, opts = {}) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 60000, maxBuffer: 256 * 1024 * 1024, env: GIT_ENV, ...opts });
const clip = (s, n = 60) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const readIn = (dir, f) => { try { return readFileSync(join(dir, ".symbiot", f), "utf8"); } catch { return ""; } };

// How many agents may work in one lane at once. Free: one (the main run).
function laneCap(cfg = loadConfig(), st = licenceState()) {
  if (!isPro(st)) return 1;
  const n = Math.floor(Number(cfg.laneParallel));
  return Number.isFinite(n) && n >= 1 ? Math.min(MAX_CAP, n) : DEFAULT_CAP;
}

// ---- what a task needs exclusively -------------------------------------------
// Words in a task's text that name a shared thing: two tasks that claim the same one
// don't run together. Files are matched by name, so two edits to ui.mjs wait but ui.mjs
// and phone.mjs don't.
const GENERIC = new Set(["tasks.md", "answers.md", "questions.md", "handoff.md", "readme.md"]);
const WORDS = {
  device: /\b(adb|usb|android phone|plugged in|on (?:his|the|your) phone)\b/i,
  publish: /\b(npm publish|publish(?:es|ing)?\b|trusted publisher|publish\.yml|release workflow)\b/i,
  browser: /\b(symbiot browser|symbiot screens|signed-in browser|signed in at)\b/i,
};
function claims(text) {
  const t = String(text || ""), out = new Set();
  for (const [k, re] of Object.entries(WORDS)) if (re.test(t)) out.add(k);
  for (const m of t.matchAll(/\bport\s+(\d{2,5})\b|127\.0\.0\.1:(\d{2,5})\b/gi)) out.add("port " + (m[1] || m[2]));
  for (const m of t.matchAll(/[\w./-]+\.(?:mjs|cjs|js|ts|json|html|css|md|java|kt|sh|yml)\b/gi)) { const f = m[0].split("/").pop().toLowerCase(); if (!GENERIC.has(f)) out.add("file " + f); }
  return out;
}
const THING = (c) => (c === "device" ? "the phone's USB cable" : c === "publish" ? "the publish step" : c === "browser" ? "the Symbiot Browser" : c.replace(/^file /, ""));
// The first thing both tasks claim, or "".
function clash(a, b) { const y = claims(b); for (const c of claims(a)) if (y.has(c)) return c; return ""; }
// A task that merges a saved patch into the lane's folder: the patch is the folder's
// (gitignored .symbiot/), and the clash is with that folder's uncommitted work, so a
// copy of the repo can never do it. 16 such tasks nested three deep in two days, each
// a billed run (the 15 Oct 2026 audit): it only ever runs in the lane's own folder.
const MERGE_TASK = /^\s*Merge a finished task['’]s changes\b/i, PATCH_REF = /\.symbiot\/parallel-([0-9a-f]+)\.patch/i;
const isMergeTask = (text) => MERGE_TASK.test(text) || PATCH_REF.test(text);

// ---- the runs beside the lane's own ---------------------------------------------
const metaOf = (wt) => { try { return JSON.parse(readFileSync(join(wt, ".symbiot", "par.json"), "utf8")); } catch { return null; } };
function inflight() {
  let names = []; try { names = readdirSync(WT_DIR); } catch {}
  return names.map((n) => metaOf(join(WT_DIR, n))).filter(Boolean);
}
const parallelLane = (path) => { const m = path && String(path).startsWith(WT_DIR) ? metaOf(path) : null; return m ? m.lane : ""; };
const inflightIds = () => new Set(inflight().map((m) => m.taskId).filter(Boolean));
const openTasksOf = (path) => { try { return readFileSync(join(path, ".symbiot", "TASKS.md"), "utf8").split("\n").filter((l) => /^\s*-\s*\[ \]/.test(l)).map((l) => l.replace(/^\s*-\s*\[ \]\s*/, "").trim()); } catch { return []; } };
const dirtyFiles = (path) => { const r = git(path, ["status", "--porcelain", "-uall", "--", ".", ":(exclude).symbiot"]); return r.status === 0 ? String(r.stdout).split("\n").filter(Boolean).map((l) => l.slice(3).split("/").pop().toLowerCase()) : []; };
const isGit = (path) => { const r = git(path, ["rev-parse", "--verify", "HEAD"]); return r.status === 0; };

// What a lane's folder allows, looked up at most every 15 s (workScene is polled).
const FACTS = new Map();
function laneFacts(path, now = Date.now()) {
  const c = FACTS.get(path); if (c && now - c.at < 15000) return c;
  const f = { at: now, git: isGit(path), dirty: dirtyFiles(path) }; FACTS.set(path, f); return f;
}
// The brief held for the lane's running agent no longer lists what started beside it.
function dropHeld(path) { try { rmSync(join(path, ".symbiot", "TASKS.next.md")); } catch {} }
// Can this task run beside what the lane has going? { ok: true } or { ok: false, kind,
// text }: the reason, in plain words, with what it waits on and the expected wait.
// active: [{ text, who }] the tasks going now (the lane's own first, then the parallel
// ones); count: agents now working in the lane; eta: the main run's time left, in words.
function verdict({ text, name = "this lane", active = [], count = 1, cap = laneCap(), pro = true, dirty = [], git: gitOk = true }) {
  if (!pro) return { ok: false, kind: "free", text: "Symbiot Free runs one agent at a time (Pro runs several)" };
  if (!gitOk) return { ok: false, kind: "nogit", text: `${name} isn't a git project with a first commit, so a second agent can't have a copy of it to itself` };
  if (isMergeTask(text)) return { ok: false, kind: "merge", text: `it merges changes saved in ${name}'s own folder, which only ${name}'s own run can do` };
  if (count >= cap) return { ok: false, kind: "cap", text: `${count} agent${count === 1 ? " is" : "s are"} already working in ${name}, which is the limit (change it in Settings)` };
  for (const a of active) {
    const c = clash(text, a.text); if (!c) continue;
    return { ok: false, kind: "clash", on: c, text: `both need ${THING(c)}, and "${clip(a.text, 50)}" has it now (${a.who || "the run there"})` };
  }
  const mine = claims(text);
  for (const f of dirty) if (mine.has("file " + f)) return { ok: false, kind: "dirty", on: f, text: `${f} has uncommitted work in ${name} that a second agent would start without; it goes in once that's approved` };
  return { ok: true };
}

// Split a lane's startable tasks: the first stays with the lane's own run, along with
// any that clash with it, and the rest that run beside it (up to the cap) are peeled
// off to runs of their own. items: [{ id, text }]; taken: tasks already going (queued
// at a lane that has a run). Returns { peeled, rest, held: { id: reason } }.
function peel(items, { name, taken = [], count = 1, cap = laneCap(), pro = true, dirty = [], git: gitOk = true } = {}) {
  const peeled = [], rest = [], held = {};
  const active = taken.slice(); let n = count;
  for (const it of items) {
    if (!taken.length && !rest.length && !peeled.length) { rest.push(it); active.push({ text: it.text, who: "the first task" }); n = Math.max(n, 1); continue; } // the lane's own run takes the first
    const v = verdict({ text: it.text, name, active, count: n, cap, pro, dirty, git: gitOk });
    if (v.ok) { peeled.push(it); active.push({ text: it.text, who: `"${clip(it.text, 40)}"` }); n++; } else { rest.push(it); held[it.id] = v; }
  }
  return { peeled, rest, held };
}

// ---- start one ------------------------------------------------------------------
// The brief for a run beside the lane's: the lane's own brief (its context and rules)
// with the task list replaced by the one task.
function briefFor(path, text, branch) {
  let md = ""; for (const f of ["TASKS.md", "TASKS.next.md"]) try { md = readFileSync(join(path, ".symbiot", f), "utf8"); break; } catch {}
  const note = `> This is a parallel run in a copy of the repo of its own (branch ${branch}); other agents are working in the main folder at the same time. Do only the task below. When you finish, tick it; Symbiot merges your changes back into the main folder, and carries what you hand over (HANDOFF.md), ask (QUESTIONS.md) or write up there too.\n`;
  const one = `## Tasks\n- [ ] ${text}\n\n`;
  if (!md) return `# Symbiot tasks\n${note}\n${one}`;
  const lines = md.split("\n"), at = lines.findIndex((l) => /^##\s+Tasks\s*$/.test(l));
  if (at < 0) return `${lines[0] || "# Symbiot tasks"}\n${note}\n${one}`;
  const end = lines.findIndex((l, i) => i > at && /^##\s/.test(l) && !/^###/.test(l));
  const head = lines.slice(0, at), tail = end < 0 ? [] : lines.slice(end);
  return [...head, note, one.trimEnd(), "", ...tail].join("\n");
}
// The commit a copy starts from: the lane's tree as it is now, uncommitted work and
// new files included (not .symbiot/), as a commit on top of HEAD made through a
// temporary index, so the lane's own index and files aren't touched. Started from
// HEAD, a copy redid work the lane already had, and its merge back clashed with
// that work every time (the 15 Oct 2026 audit). A clean tree, or a tree too big to
// snapshot, starts from HEAD.
const SNAPSHOT_MAX = 5000;
function snapshot(path, head, dirty = dirtyFiles(path)) {
  if (!dirty.length || dirty.length > SNAPSHOT_MAX) return { sha: head, dirty: false };
  const gd = git(path, ["rev-parse", "--absolute-git-dir"]); if (gd.status !== 0) return { sha: head, dirty: false };
  const idx = join(gd.stdout.trim(), `symbiot-par-${randomBytes(3).toString("hex")}.index`), env = { ...GIT_ENV, GIT_INDEX_FILE: idx, GIT_AUTHOR_NAME: "Symbiot", GIT_AUTHOR_EMAIL: "symbiot@localhost", GIT_COMMITTER_NAME: "Symbiot", GIT_COMMITTER_EMAIL: "symbiot@localhost" };
  try {
    if (git(path, ["read-tree", head], { env }).status !== 0 || git(path, ["add", "-A", "--", ".", ":(exclude).symbiot"], { env }).status !== 0) return { sha: head, dirty: false };
    const tree = git(path, ["write-tree"], { env }); if (tree.status !== 0) return { sha: head, dirty: false };
    if (tree.stdout.trim() === git(path, ["rev-parse", head + "^{tree}"]).stdout.trim()) return { sha: head, dirty: false };
    const c = git(path, ["commit-tree", tree.stdout.trim(), "-p", head, "-m", "Symbiot: the lane's tree when a run beside it started"], { env });
    return c.status === 0 ? { sha: c.stdout.trim(), dirty: true } : { sha: head, dirty: false };
  } finally { try { unlinkSync(idx); } catch {} }
}
// Start `task` ({ id, text, full? }) beside the lane's run. deps: run, addTask (to hand a
// merge conflict to the lane's agent), now. Returns { ok, id, wt } or { error }.
function startParallel(lane, path, task, { run = runHandoff, addTask = null, now = Date.now(), merge = mergeBack, dir = WT_DIR } = {}) {
  const top = git(path, ["rev-parse", "--show-toplevel"]); if (top.status !== 0) return { error: "not a git project" };
  const base = git(path, ["rev-parse", "HEAD"]); if (base.status !== 0) return { error: "no commits yet" };
  if (isMergeTask(task.text)) return { error: "it merges a patch saved in the lane's own folder, so only the lane's own run can do it" };
  const id = randomBytes(3).toString("hex"), wt = join(dir, `${lane.replace(/[^\w.-]+/g, "-")}-${id}`), branch = `symbiot/par-${id}`, head = base.stdout.trim();
  const from = snapshot(path, head);
  mkdirSync(dir, { recursive: true });
  let add = git(path, ["worktree", "add", "-q", "-b", branch, wt, from.sha]);
  if (add.status !== 0 && /\.lock|could not lock/i.test(add.stderr || "")) { git(path, ["branch", branch, from.sha]); add = git(path, ["worktree", "add", "-q", wt, branch]); } // -b hits a config lock while a run holds it (the git-config-lock note): the branch first, then the checkout
  if (add.status !== 0) return { error: clip(add.stderr || "git worktree add failed", 140) };
  const meta = { id, lane, repo: path, wt, branch, base: from.sha, head, task: task.text, taskId: task.id, startedAt: now };
  try {
    const sd = join(wt, ".symbiot"); mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, "TASKS.md"), briefFor(path, task.text, branch));
    writeFileSync(join(sd, "handoff.json"), JSON.stringify({ name: `${lane} (beside): ${clip(task.text, 50)}` }));
    writeFileSync(join(sd, "par.json"), JSON.stringify(meta));
    for (const f of ["ANSWERS.md", ANSWERS_ARCHIVE]) if (existsSync(join(path, ".symbiot", f))) copyFileSync(join(path, ".symbiot", f), join(sd, f));
    if (existsSync(join(path, ".symbiot", "full"))) cpSync(join(path, ".symbiot", "full"), join(sd, "full"), { recursive: true });
  } catch (e) { drop(path, meta); return { error: clip(String((e && e.message) || e), 140) }; }
  noteStarted(path, task.id, meta); // on record from the start: a restart or a twin tick sees it (the 15 Oct 2026 audit's twin runs)
  const e = run(wt, { onExit: (code) => { try { merge(meta, { addTask, code }); } catch {} } });
  if (!e || e.busy || e.blocked || !e.id) { noteTried(path, task.id, "", { forget: true }); drop(path, meta); return { error: clip((e && e.note) || "the agent didn't start", 140), blocked: !!(e && e.blocked) }; }
  return { ok: true, id: e.id, wt, parallel: id };
}
// The copy goes, and anything still running from inside it first: a `symbiot app` a
// test started in a worktree outlived the folder by an hour (the 15 Oct 2026 audit).
function drop(repo, m) { killUnder(m.wt); git(repo, ["worktree", "remove", "--force", m.wt]); git(repo, ["branch", "-D", m.branch]); try { rmSync(m.wt, { recursive: true, force: true }); } catch {} git(repo, ["worktree", "prune"]); }
// Every process whose working folder or command line is under `dir` is told to stop
// (SIGTERM), and killed a few seconds later if it's still there. Linux only (/proc);
// never this process or its parent. Returns the pids told.
function killUnder(dir, { kill = (p, s) => process.kill(p, s), proc = "/proc", later = true } = {}) {
  dir = String(dir || ""); if (!dir) return [];
  const under = (p) => p === dir || p.startsWith(dir + "/"), out = [];
  let names = []; try { names = readdirSync(proc).filter((n) => /^\d+$/.test(n)); } catch { return out; }
  for (const n of names) {
    const pid = Number(n); if (pid === process.pid || pid === process.ppid) continue;
    let cwd = "", argv = []; try { cwd = readlinkSync(join(proc, n, "cwd")); } catch {} try { argv = readFileSync(join(proc, n, "cmdline"), "utf8").split("\0"); } catch {}
    if (!under(cwd) && !argv.slice(0, 3).some(under)) continue; // the program, its script and subcommand: not a path a flag merely names
    try { kill(pid, "SIGTERM"); out.push(pid); } catch {}
  }
  if (out.length && later) setTimeout(() => { for (const pid of out) try { kill(pid, "SIGKILL"); } catch {} }, 3000).unref();
  return out;
}

// ---- a run beside, on record -----------------------------------------------------
// Unfinished, its task stayed queued beside the lane's run, so the next 20-second tick
// started another copy on the same inputs, and it stopped where the last one had: four
// left byte-identical patches (the 14 Oct 2026 audit). So the lane's .symbiot/beside.json
// keeps, per task id, how many tries, the last patch's hash and what they ran with (the
// lane's .env and the user's answers). Until those change it isn't started beside again:
// it waits for the lane's own run, which has the whole brief (besideAgain).
// A run that got somewhere is on record too, and that record holds whatever changes:
// started (its copy is still there), merged (its tick is on its way to review),
// conflict (its patch waits for the lane's own run), handed (it handed the work to
// another lane) or asked (it asked the user): none of those is "try again beside".
const TRIED = "beside.json", KEEP_RECORDS = 7 * 86400000, hash = (t) => createHash("sha1").update(String(t)).digest("hex").slice(0, 16);
function besideInputs(repo) {
  let env = ""; try { for (const f of readdirSync(repo).filter((x) => /^\.env(\..+)?$/.test(x) && !/\.(example|sample|template)$/.test(x)).sort()) env += f + "\0" + readFileSync(join(repo, f), "utf8") + "\0"; } catch {}
  return hash(env + "\0" + answersDigest(repo)); // the archived answers count too (agents.mjs archiveAnswers)
}
function loadTried(repo) { try { const o = JSON.parse(readFileSync(join(repo, ".symbiot", TRIED), "utf8")); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; } }
function saveTried(repo, all) { try { mkdirSync(join(repo, ".symbiot"), { recursive: true }); writeFileSync(join(repo, ".symbiot", TRIED), JSON.stringify(all)); } catch {} }
function noteStarted(repo, taskId, m) { if (!taskId) return; const all = loadTried(repo), was = all[taskId] || {}; all[taskId] = { tries: was.tries || 0, started: m.startedAt, wt: m.wt, par: m.id }; saveTried(repo, all); }
// how: "merged" | "conflict" (with patch: its file) | "handed" | "asked" | "waited"; none: it
// stopped unfinished (a try). forget: the start didn't take.
function noteTried(repo, taskId, patch, { done = false, forget = false, how = done ? "merged" : "", patchFile = "", now = Date.now() } = {}) {
  if (!taskId) return;
  const all = loadTried(repo), was = all[taskId] || {};
  if (forget) delete all[taskId];
  else if (how) all[taskId] = { tries: was.tries || 0, [how]: true, at: now, ...(patchFile ? { patch: patchFile } : {}) };
  else all[taskId] = { tries: (was.tries || 0) + 1, patch: hash(patch), same: !!was.patch && was.patch === hash(patch), inputs: besideInputs(repo), at: now };
  saveTried(repo, all);
}
// null, or { tries, kind, note } when this task shouldn't start beside again: a run beside
// is on it, got it done, left its patch for the lane's own run, handed it over or asked,
// or stopped on it with nothing it ran with changed since.
function besideAgain(repo, taskId) {
  const t = repo && taskId ? loadTried(repo)[taskId] : null;
  if (!t) return null;
  const tries = t.tries || 0;
  if (t.wt && !t.merged && !t.conflict && !t.handed && !t.asked && !t.waited && metaOf(t.wt)) return { tries, kind: "working", note: "a run beside it is on this now" };
  if (t.merged) return { tries, kind: "merged", note: "a run beside it finished this and its changes are in" };
  if (t.conflict) return { tries, kind: "conflict", patch: t.patch || "", note: `a run beside it finished this, but its changes clash with the main folder's and wait in ${t.patch ? basename(t.patch) : "a patch"} for the lane's own run to merge` };
  if (t.handed) return { tries, kind: "handed", note: "a run beside it handed this to another lane and waits to hear back" };
  if (t.asked) return { tries, kind: "asked", note: "a run beside it asked you about this (its question is on the Workdesk)" };
  if (t.waited) return { tries, kind: "waited", note: "a run beside it marked this as waiting on something, and the lane's own run carries on with it once that's in" };
  if (t.wt && !t.inputs) return null; // its start didn't take and nothing noted the end: free to try again
  if (t.inputs !== besideInputs(repo)) return null;
  return { tries, kind: "tried", note: `a run beside it stopped without finishing this${tries > 1 ? ` (${tries} tries)` : ""}, and nothing it ran with has changed since` };
}

// ---- what a copy leaves behind, kept -------------------------------------------------
// A copy's agent that handed work to another lane, asked the user, wrote AWAITING.json,
// REMEMBER.json or a report did the right thing, and the worktree was deleted with all
// of it: bookly's ops handover never happened, and the task ran three more times (the
// 15 Oct 2026 audit). Before the copy goes, each lands in the lane's .symbiot/, marked
// with the task. Returns { handed, asked, waits, facts, reports, answers }.
const NOT_REPORTS = /^(?:TASKS(?:\.[\w-]+)?|QUESTIONS|ANSWERS(?:\.archive)?|HANDOFF|SKIPPED|CLAUDE|AGENTS|CARRYON)\.md$|^BRIEF/i; // as reports.mjs lists them
const FROM_MARK = /^_\(from a run beside .*\)_\n/gm, unmarked = (t) => String(t).replace(FROM_MARK, "").trim(); // a report less the lines saying which run wrote it
const qKey = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const headings = (md) => new Set([...String(md || "").matchAll(/^###\s+(.+)$/gm)].map((m) => qKey(m[1])));
const headOf = (s) => qKey((String(s).match(/^###\s*(.*)$/m) || [])[1] || "");
function keepOutput(m) {
  const wt = m.wt, repo = m.repo, sd = join(repo, ".symbiot"), out = { handed: 0, asked: 0, waits: 0, facts: 0, reports: 0, answers: 0 }, mark = `a run beside ${m.lane} on "${clip(m.task, 80)}"`;
  const append = (f, text) => { try { mkdirSync(sd, { recursive: true }); appendFileSync(join(sd, f), text); } catch {} };
  // handovers not yet sent (lanes.mjs reads no HANDOFF.md under worktrees/): as sections the lane's next pass sends
  const handed = parseHandoffs(readIn(wt, "HANDOFF.md"));
  if (handed.length) { append("HANDOFF.md", (readIn(repo, "HANDOFF.md").trim() ? "\n\n" : "# Handovers\n\n") + handed.map((h) => `### ${h.lane}\n${h.text}\n_(from ${mark})_\n`).join("\n")); out.handed = handed.length; }
  // the answers the user gave the copy, by heading, so the lane's run has them
  const mine = headings(readIn(repo, "ANSWERS.md") + "\n" + readIn(repo, ANSWERS_ARCHIVE)), answered = headings(readIn(wt, "ANSWERS.md"));
  const news = String(readIn(wt, "ANSWERS.md")).split(/^(?=###\s)/m).filter((s) => /^###\s/.test(s) && !mine.has(headOf(s)));
  if (news.length) { append("ANSWERS.md", (readIn(repo, "ANSWERS.md").trim() ? "\n\n" : "# Answers\n\n") + news.map((s) => s.trim()).join("\n\n") + "\n"); out.answers = news.length; }
  // open questions (not answered in the copy), their context and options as written
  const qmd = readIn(wt, "QUESTIONS.md");
  if (qmd.trim()) {
    const blocks = qmd.split(/^(?=##\s)/m).map((b) => b.replace(/^#\s.*\n?/gm, "")).filter((b) => b.trim());
    const kept = [];
    for (const b of blocks) {
      const parts = b.split(/^(?=###\s)/m), head = /^##\s/.test(parts[0]) ? parts.shift() : "";
      const qs = parts.filter((p) => /^###\s/.test(p) && !answered.has(headOf(p)));
      if (qs.length) { kept.push((head.trim() ? head.trim() + "\n" : "") + qs.map((q) => q.trim()).join("\n\n")); if (!/^##\s.*(?:suggest|idea|follow|option)/i.test(head)) out.asked += qs.length; }
    }
    if (kept.length) append("QUESTIONS.md", (readIn(repo, "QUESTIONS.md").trim() ? "\n\n" : "# Questions\n\n") + `_(from ${mark})_\n\n` + kept.join("\n\n") + "\n");
  }
  // emails it waits on, and facts for memory: joined to the lane's lists
  const waits = parseAwaiting(readIn(wt, "AWAITING.json")).map((w) => ({ ...w, task: w.task || m.task }));
  if (waits.length) try { const had = parseAwaiting(readIn(repo, "AWAITING.json")); mkdirSync(sd, { recursive: true }); writeFileSync(join(sd, "AWAITING.json"), JSON.stringify([...had, ...waits].slice(-100))); out.waits = waits.length; } catch {}
  const facts = parseFacts(readIn(wt, "REMEMBER.json"));
  if (facts.length) try { const had = parseFacts(readIn(repo, "REMEMBER.json")); mkdirSync(sd, { recursive: true }); writeFileSync(join(sd, "REMEMBER.json"), JSON.stringify([...had, ...facts].slice(0, 40))); out.facts = facts.length; } catch {}
  // reports (.md files, as reports.mjs lists them) the copy wrote or changed, with a line saying which run wrote them.
  // Not the ones it only checked out: a lane that commits its .symbiot/ handed every run all its reports, each came back
  // as NAME-<run id>.md, was committed, and came back again as NAME-<id>-<id>.md: 535 copies in one lane, and a drop or
  // an approval on one copy never reached the next (28 Oct 2026).
  let names = []; try { names = readdirSync(join(wt, ".symbiot")).filter((f) => /\.md$/i.test(f) && !NOT_REPORTS.test(f)); } catch {}
  for (const f of names) {
    let text = ""; try { text = readFileSync(join(wt, ".symbiot", f), "utf8"); } catch { continue; } if (!text.trim()) continue;
    const was = git(wt, ["show", `${m.base}:.symbiot/${f}`]), started = was.status === 0 ? was.stdout : null;
    let lane = null; try { lane = readFileSync(join(sd, f), "utf8"); } catch {}
    if ((started !== null && unmarked(started) === unmarked(text)) || (lane !== null && unmarked(lane) === unmarked(text))) continue; // came with the copy, or the lane has it already
    const to = lane === null || (started !== null && unmarked(lane) === unmarked(started)) ? f : f.replace(/\.md$/i, `-${m.id}.md`); // a rewrite of one the lane hasn't touched since replaces it
    try { mkdirSync(sd, { recursive: true }); writeFileSync(join(sd, to), text.replace(FROM_MARK, "").replace(/^(#\s.*\n)/, `$1_(from ${mark})_\n`)); out.reports++; } catch {}
  }
  return out;
}

// ---- merge back -------------------------------------------------------------------
const tickedIn = (md) => String(md || "").split("\n").filter((l) => /^\s*-\s*\[x\]/i.test(l)).map((l) => l.replace(/^\s*-\s*\[x\]\s*/i, "").trim());
// The run beside the lane's ended: its changes (everything since the commit it started
// from) go into the lane's folder if the task was ticked and they apply cleanly. Else
// they're saved as .symbiot/parallel-<id>.patch in the lane's folder: not finished, so
// the task stays open; or a clash, so the task stays open too, naming the patch for the
// lane's own agent to merge by hand. Whatever the copy handed over, asked or wrote up
// lands in the lane's .symbiot first (keepOutput).
// Returns { merged, files, kept, saved?, conflict?, handed?, asked? }.
function mergeBack(m, { addTask = null, code = 0, now = Date.now() } = {}) {
  const wt = m.wt, repo = m.repo, out = { merged: false, files: [] };
  if (!existsSync(wt)) return out;
  git(wt, ["add", "-A", "--", ".", ":(exclude).symbiot"]);
  const names = git(wt, ["diff", "--cached", "--name-only", "-z", m.base]), files = String(names.stdout || "").split("\0").filter(Boolean);
  const patch = git(wt, ["diff", "--cached", "--binary", m.base]).stdout || "";
  let tasksMd = ""; try { tasksMd = readFileSync(join(wt, ".symbiot", "TASKS.md"), "utf8"); } catch {}
  const ticked = tickedIn(tasksMd), done = code === 0 && ticked.length > 0, save = () => { const f = join(repo, ".symbiot", `parallel-${m.id}.patch`); try { mkdirSync(join(repo, ".symbiot"), { recursive: true }); writeFileSync(f, patch); } catch {} return f; };
  const waits = waitedIn(tasksMd); if (!ticked.length && waits.length) waitInMain(repo, m.task, waits[0]); // it left the item waiting ([~]): the lane's brief says so too
  const kept = out.kept = keepOutput(m), how = kept.handed ? "handed" : kept.asked ? "asked" : !ticked.length && waits.length ? "waited" : ""; // it handed over, asked or left it waiting on something: that's where it stands, not "unfinished"
  const finished = () => { tickInMain(repo, ticked); markReview(m.taskId, now); noteTried(repo, m.taskId, patch, { how: "merged", now }); prunePatches(repo, now); drop(repo, m); };
  const stopped = () => { noteTried(repo, m.taskId, patch, { how, now }); drop(repo, m); return { ...out, ...(how ? { [how]: true } : {}) }; };
  if (!patch.trim()) { if (!done) return stopped(); finished(); return { ...out, merged: true, ticked: true }; }
  if (!done) { out.saved = save(); return stopped(); } // unfinished: the task stays open, its changes kept as a patch, and isn't started beside again on the same inputs
  const pf = join(wt, ".symbiot", "merge.patch"); writeFileSync(pf, patch);
  const clash = (why) => { // it doesn't apply cleanly to the folder as it is now: the task stays open, naming the patch, for the lane's own agent
    out.conflict = true; out.saved = save();
    attachPatch(m, out.saved, { addTask, now });
    noteTried(repo, m.taskId, patch, { how: "conflict", patchFile: out.saved, now });
    drop(repo, m); return { ...out, why };
  };
  const check = git(repo, ["apply", "--check", pf]);
  if (check.status !== 0) return clash(clip(check.stderr, 200));
  const ap = git(repo, ["apply", pf]);
  if (ap.status !== 0) return clash(clip(ap.stderr, 200));
  saveRunFiles(repo, [...loadRunFiles(repo), { id: "par-" + m.id, startedAt: m.startedAt, endedAt: now, ticked: ticked.length, files: files.sort() }]); // Approve ships these with the lane's other finished work
  finished();
  return { ...out, merged: true, files, ticked: true };
}
// A run beside that marked its item [~] (blocked, or Symbiot couldn't confirm it done) didn't stop
// unfinished: it's waiting on something. Recorded as a try, the next answer anywhere in the lane
// changed its inputs and a fresh copy ran the same item: Steve's chat fix ran in four (24 Oct 2026).
const waitedIn = (md) => String(md || "").split("\n").filter((l) => /^\s*-\s*\[~\]/.test(l)).map((l) => l.trim());
function waitInMain(repo, task, line, { running = runningHandoff } = {}) {
  const f = join(repo, ".symbiot", running(repo) ? "TASKS.next.md" : "TASKS.md"); let md = ""; try { md = readFileSync(f, "utf8"); } catch { return false; }
  const want = String(task).trim().toLowerCase(), lines = md.split("\n"), at = lines.findIndex((l) => /^\s*-\s*\[ \]/.test(l) && l.replace(/^\s*-\s*\[ \]\s*/, "").trim().toLowerCase() === want);
  if (at < 0) return false;
  lines[at] = line.replace(/^\s*/, ""); try { writeFileSync(f, lines.join("\n")); return true; } catch { return false; }
}
// The finished task shows ticked in the lane's brief, as if its own run had ticked it
// (pushTasks then moves it to review). Appended when the brief has no line for it.
// While the lane's own agent runs, its TASKS.md is its to write (agents.mjs writeTasks
// holds a new brief in TASKS.next.md the same way): the tick goes into the held brief
// if there is one, else nowhere, and markReview carries the state instead.
function tickInMain(repo, texts, { running = runningHandoff } = {}) {
  const busy = !!running(repo), f = join(repo, ".symbiot", busy ? "TASKS.next.md" : "TASKS.md"); let md = ""; try { md = readFileSync(f, "utf8"); } catch {}
  if (busy && !md) return false;
  const key = (s) => String(s).replace(/^\s*-\s*\[[ x]\]\s*/i, "").trim().toLowerCase(); let lines = md ? md.split("\n") : ["## Tasks"];
  for (const t of texts) {
    const at = lines.findIndex((l) => /^\s*-\s*\[[ x]\]/i.test(l) && key(l) === t.trim().toLowerCase());
    if (at >= 0) lines[at] = lines[at].replace(/\[ \]/, "[x]");
    else { const h = lines.findIndex((l) => /^##\s+Tasks\s*$/.test(l)); lines.splice(h < 0 ? lines.length : h + 1, 0, `- [x] ${t}`); }
  }
  try { mkdirSync(join(repo, ".symbiot"), { recursive: true }); writeFileSync(f, lines.join("\n")); return true; } catch { return false; }
}
// The task goes to review in tasks.json now, not on the next pushTasks: in between, it
// read as next and was peeled to a second copy 6–20 s after the first ended (the
// 15 Oct 2026 audit's twin runs).
function markReview(taskId, now = Date.now()) {
  if (!taskId) return false;
  const all = loadTasks(), t = all.find((x) => x.id === taskId); if (!t || t.done || t.archived || t.review) return false;
  t.review = true; t.reviewAt = now; return saveTasks(all);
}
// A merge that clashed stays the same open task, now naming the patch: no second task
// (a merge task merged again nested three deep), and no tick for work that never went
// in. A task that already names a patch gets the new one in its place. With no task
// by that id (an older one), addTask's dedupe takes a merge task, once.
const PATCH_NOTE = /\s*—\s*a run beside .*?\btick this\s*$/i;
const patchNote = (lane, ref) => ` — a run beside ${lane}'s own finished this, but its changes clash with the main folder's: they wait in ${ref}; merge them by hand (git apply --3way won't do it alone), keep both sides' intent, run the tests, then tick this`;
function attachPatch(m, patchFile, { addTask = null, now = Date.now() } = {}) {
  const ref = `.symbiot/${basename(patchFile)}`, all = loadTasks(), t = all.find((x) => x.id === m.taskId && !x.done && !x.archived);
  if (t) { t.text = String(t.text).replace(PATCH_NOTE, "") + patchNote(m.lane, ref); t.patch = ref; delete t.review; delete t.reviewAt; t.changed = now; saveTasks(all); return t; }
  const inner = String(m.task).replace(/^\s*Merge a finished task['’]s changes into [^:]+:\s*"(.*?)"\s+was done in a copy.*$/is, "$1").replace(PATCH_NOTE, "");
  if (addTask) try { return addTask(`Merge a finished task's changes into ${m.lane}: "${clip(inner, 80)}" was done in a copy of the repo, and its changes clash with newer ones in the main folder. They're saved as ${ref}. Apply what still makes sense by hand (git apply --3way won't do it alone), keep both sides' intent, run the tests, then tick this.`, m.lane); } catch {}
  return null;
}

// ---- what piles up, pruned -----------------------------------------------------------
// Patches no open task names any more, or older than a week, and the lane's beside.json
// records older than that; folders under worktrees/ that are no worktree and have no
// par.json (one sat there since 13 Oct 2026, run 9 times). At each merge for the lane,
// and once a day for all (mergeEnded).
const PATCH_KEEP = 7 * 86400000, ORPHAN_AFTER = 3600000;
function prunePatches(repo, now = Date.now(), { tasks = null } = {}) {
  const sd = join(repo, ".symbiot"), gone = [];
  let names = []; try { names = readdirSync(sd).filter((f) => /^parallel-[0-9a-f]+\.patch$/.test(f)); } catch {}
  if (names.length) {
    const open = (tasks || loadTasks()).filter((t) => !t.done && !t.archived).map((t) => String(t.text) + " " + String(t.patch || ""));
    for (const f of names) {
      let age = 0; try { age = now - statSync(join(sd, f)).mtimeMs; } catch { continue; }
      const named = open.some((t) => t.includes(f));
      if (age > PATCH_KEEP || (!named && age > ORPHAN_AFTER)) try { unlinkSync(join(sd, f)); gone.push(f); } catch {}
    }
  }
  const all = loadTried(repo); let dropped = 0;
  for (const [id, t] of Object.entries(all)) if (now - (Number(t.at || t.started) || 0) > KEEP_RECORDS) { delete all[id]; dropped++; }
  if (dropped) saveTried(repo, all);
  return gone;
}
function pruneOrphans(now = Date.now(), dir = WT_DIR) {
  const gone = []; let names = []; try { names = readdirSync(dir); } catch { return gone; }
  for (const n of names) {
    const wt = join(dir, n); let st; try { st = statSync(wt); } catch { continue; }
    if (!st.isDirectory() || metaOf(wt) || now - st.mtimeMs < ORPHAN_AFTER) continue;
    let common = ""; if (existsSync(join(wt, ".git"))) { const r = git(wt, ["rev-parse", "--git-common-dir"]); common = r.status === 0 ? r.stdout.trim() : ""; }
    killUnder(wt);
    try { rmSync(wt, { recursive: true, force: true }); gone.push(wt); } catch {}
    if (common) spawnSync("git", ["--git-dir", common, "worktree", "prune"], { encoding: "utf8", timeout: 60000, env: GIT_ENV });
  }
  return gone;
}
let SWEPT_AT = 0;
function sweep(now = Date.now(), { repos = null, dir = WT_DIR } = {}) {
  const seen = new Set(repos || [...loadRuns().map((r) => r.path), ...inflight().map((m) => m.repo)]), out = { patches: [], orphans: pruneOrphans(now, dir) }, tasks = loadTasks();
  for (const repo of seen) if (repo && existsSync(join(repo, ".symbiot"))) try { out.patches.push(...prunePatches(repo, now, { tasks })); } catch {}
  return out;
}

// How a copy's run ended, from its log, for one that ended while Symbiot was down:
// 0 or 1 when the log says (a stream's result event, Symbiot's own stop line, or a
// stream that just stops: killed or crashed), null when it doesn't (no stream).
function exitOf(wt) {
  let log = ""; try { const f = join(wt, ".symbiot", "agent.log"), size = statSync(f).size, n = Math.min(size, 65536), buf = Buffer.alloc(n), fd = openSync(f, "r"); try { readSync(fd, buf, 0, n, size - n); } finally { closeSync(fd); } log = buf.toString("utf8"); } catch { return null; }
  const lines = log.split("\n"); let resultAt = -1, err = false, stoppedAt = -1, stream = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^=== stopped by Symbiot/.test(l)) stoppedAt = i;
    else if (l.startsWith("{")) { stream = true; try { const e = JSON.parse(l); if (e.type === "result") { resultAt = i; err = !!e.is_error; } } catch {} }
  }
  if (stoppedAt > resultAt) return 1; // stopped by the hang guard, after its last result or with none
  if (resultAt >= 0) return err ? 1 : 0;
  return stream ? 1 : null; // a stream with no result event ended badly
}
// Runs that ended while Symbiot was down: merge them now (called at startup and by the
// tick). A tick alone used to count as success: a run killed after ticking merged as
// finished. The log's own word on how it ended comes first (exitOf).
function mergeEnded({ merge = mergeBack, addTask = null, running = runningHandoff, now = Date.now(), sweeping = true } = {}) {
  const done = [];
  for (const m of inflight()) {
    if (running(m.wt)) continue;
    const seen = exitOf(m.wt), code = seen != null ? seen : tickedIn(readIn(m.wt, "TASKS.md")).length ? 0 : 1;
    try { done.push({ id: m.id, ...merge(m, { addTask, code, now }) }); } catch {}
  }
  if (sweeping && now - SWEPT_AT > 86400000) { SWEPT_AT = now; try { sweep(now); } catch {} }
  return done;
}

export { waitedIn, waitInMain, besideAgain, noteTried, noteStarted, laneFacts, dropHeld, WT_DIR, DEFAULT_CAP, laneCap, claims, clash, isMergeTask, verdict, peel, inflight, inflightIds, parallelLane, openTasksOf, dirtyFiles, isGit, snapshot, startParallel, mergeBack, mergeEnded, briefFor, tickInMain, markReview, attachPatch, keepOutput, killUnder, prunePatches, pruneOrphans, sweep, exitOf, drop };
