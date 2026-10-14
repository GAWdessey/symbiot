// Parallel runs in one lane. A lane is a folder with one agent; a second task that
// doesn't clash with it no longer waits for it. It runs beside it in a git worktree
// of its own (a second checkout of the same repo on its own branch, under
// ~/.config/symbiot/worktrees), and when it finishes its changes are merged back
// into the lane's folder. A task is held back only when it truly clashes with one
// running (the same file, port, phone cable, publish or signed-in browser), or the
// lane is at its cap (config.laneParallel, 3 by default; Free runs one agent at a
// time, licence.mjs). A merge that doesn't apply cleanly becomes a task for the
// lane's agent to resolve, with the changes saved as a patch.
//
// A worktree is a folder like any other to the rest of Symbiot: runHandoff(wt)
// starts the agent there, so its log, lock, questions and answers all live in
// wt/.symbiot. The meta for a run is wt/.symbiot/par.json.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, copyFileSync, cpSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { CONFIG_DIR, loadConfig } from "./core.mjs";
import { runHandoff, runningHandoff, loadRunFiles, saveRunFiles, answersDigest, ANSWERS_ARCHIVE } from "./agents.mjs";
import { licenceState, isPro } from "./licence.mjs";

const WT_DIR = join(CONFIG_DIR, "worktrees"), DEFAULT_CAP = 3, MAX_CAP = 8;
const git = (cwd, args, opts = {}) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 60000, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, ...opts });
const clip = (s, n = 60) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };

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
  const note = `> This is a parallel run in a copy of the repo of its own (branch ${branch}); other agents are working in the main folder at the same time. Do only the task below. When you finish, tick it; Symbiot merges your changes back into the main folder.\n`;
  const one = `## Tasks\n- [ ] ${text}\n\n`;
  if (!md) return `# Symbiot tasks\n${note}\n${one}`;
  const lines = md.split("\n"), at = lines.findIndex((l) => /^##\s+Tasks\s*$/.test(l));
  if (at < 0) return `${lines[0] || "# Symbiot tasks"}\n${note}\n${one}`;
  const end = lines.findIndex((l, i) => i > at && /^##\s/.test(l) && !/^###/.test(l));
  const head = lines.slice(0, at), tail = end < 0 ? [] : lines.slice(end);
  return [...head, note, one.trimEnd(), "", ...tail].join("\n");
}
// Start `task` ({ id, text, full? }) beside the lane's run. deps: run, addTask (to hand a
// merge conflict to the lane's agent), now. Returns { ok, id, wt } or { error }.
function startParallel(lane, path, task, { run = runHandoff, addTask = null, now = Date.now(), merge = mergeBack, dir = WT_DIR } = {}) {
  const top = git(path, ["rev-parse", "--show-toplevel"]); if (top.status !== 0) return { error: "not a git project" };
  const base = git(path, ["rev-parse", "HEAD"]); if (base.status !== 0) return { error: "no commits yet" };
  const id = randomBytes(3).toString("hex"), wt = join(dir, `${lane.replace(/[^\w.-]+/g, "-")}-${id}`), branch = `symbiot/par-${id}`, sha = base.stdout.trim();
  mkdirSync(dir, { recursive: true });
  const add = git(path, ["worktree", "add", "-q", "-b", branch, wt, "HEAD"]);
  if (add.status !== 0) return { error: clip(add.stderr || "git worktree add failed", 140) };
  const meta = { id, lane, repo: path, wt, branch, base: sha, task: task.text, taskId: task.id, startedAt: now };
  try {
    const sd = join(wt, ".symbiot"); mkdirSync(sd, { recursive: true });
    writeFileSync(join(sd, "TASKS.md"), briefFor(path, task.text, branch));
    writeFileSync(join(sd, "handoff.json"), JSON.stringify({ name: `${lane} (beside): ${clip(task.text, 50)}` }));
    writeFileSync(join(sd, "par.json"), JSON.stringify(meta));
    for (const f of ["ANSWERS.md", ANSWERS_ARCHIVE]) if (existsSync(join(path, ".symbiot", f))) copyFileSync(join(path, ".symbiot", f), join(sd, f));
    if (existsSync(join(path, ".symbiot", "full"))) cpSync(join(path, ".symbiot", "full"), join(sd, "full"), { recursive: true });
  } catch (e) { drop(path, meta); return { error: clip(String((e && e.message) || e), 140) }; }
  const e = run(wt, { onExit: (code) => { try { merge(meta, { addTask, code }); } catch {} } });
  if (!e || e.busy || e.blocked || !e.id) { drop(path, meta); return { error: clip((e && e.note) || "the agent didn't start", 140), blocked: !!(e && e.blocked) }; }
  return { ok: true, id: e.id, wt, parallel: id };
}
function drop(repo, m) { git(repo, ["worktree", "remove", "--force", m.wt]); git(repo, ["branch", "-D", m.branch]); try { rmSync(m.wt, { recursive: true, force: true }); } catch {} git(repo, ["worktree", "prune"]); }

// ---- a run beside that ended unfinished ---------------------------------------------
// Unfinished, its task stayed queued beside the lane's run, so the next 20-second tick
// started another copy on the same inputs, and it stopped where the last one had: four
// left byte-identical patches (the 14 Oct 2026 audit). So the lane's .symbiot/beside.json
// keeps, per task id, how many tries, the last patch's hash and what they ran with (the
// lane's .env and the user's answers). Until those change it isn't started beside again:
// it waits for the lane's own run, which has the whole brief (besideAgain).
const TRIED = "beside.json", hash = (t) => createHash("sha1").update(String(t)).digest("hex").slice(0, 16);
function besideInputs(repo) {
  let env = ""; try { for (const f of readdirSync(repo).filter((x) => /^\.env(\..+)?$/.test(x) && !/\.(example|sample|template)$/.test(x)).sort()) env += f + "\0" + readFileSync(join(repo, f), "utf8") + "\0"; } catch {}
  return hash(env + "\0" + answersDigest(repo)); // the archived answers count too (agents.mjs archiveAnswers)
}
function loadTried(repo) { try { const o = JSON.parse(readFileSync(join(repo, ".symbiot", TRIED), "utf8")); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; } }
function noteTried(repo, taskId, patch, { done = false, now = Date.now() } = {}) {
  if (!taskId) return;
  const all = loadTried(repo), was = all[taskId];
  if (done) delete all[taskId];
  else all[taskId] = { tries: ((was && was.tries) || 0) + 1, patch: hash(patch), same: !!was && was.patch === hash(patch), inputs: besideInputs(repo), at: now };
  try { mkdirSync(join(repo, ".symbiot"), { recursive: true }); writeFileSync(join(repo, ".symbiot", TRIED), JSON.stringify(all)); } catch {}
}
// null, or { tries, note } when a run beside already stopped on this task with nothing it ran with changed since.
function besideAgain(repo, taskId) {
  const t = repo && taskId ? loadTried(repo)[taskId] : null;
  if (!t || t.inputs !== besideInputs(repo)) return null;
  return { tries: t.tries, note: `a run beside it stopped without finishing this${t.tries > 1 ? ` (${t.tries} tries)` : ""}, and nothing it ran with has changed since` };
}

// ---- merge back -------------------------------------------------------------------
const tickedIn = (md) => String(md || "").split("\n").filter((l) => /^\s*-\s*\[x\]/i.test(l)).map((l) => l.replace(/^\s*-\s*\[x\]\s*/i, "").trim());
// The run beside the lane's ended: its changes (everything since the commit it started
// from) go into the lane's folder if the task was ticked and they apply cleanly. Else
// they're saved as .symbiot/parallel-<id>.patch in the lane's folder: not finished, so
// the task stays open; or a clash, so a task for the lane's agent to merge by hand.
// Returns { merged, files, saved?, conflict? }.
function mergeBack(m, { addTask = null, code = 0 } = {}) {
  const wt = m.wt, repo = m.repo, out = { merged: false, files: [] };
  if (!existsSync(wt)) return out;
  git(wt, ["add", "-A", "--", ".", ":(exclude).symbiot"]);
  const names = git(wt, ["diff", "--cached", "--name-only", "-z", m.base]), files = String(names.stdout || "").split("\0").filter(Boolean);
  const patch = git(wt, ["diff", "--cached", "--binary", m.base]).stdout || "";
  let tasksMd = ""; try { tasksMd = readFileSync(join(wt, ".symbiot", "TASKS.md"), "utf8"); } catch {}
  const ticked = tickedIn(tasksMd), done = code === 0 && ticked.length > 0, save = () => { const f = join(repo, ".symbiot", `parallel-${m.id}.patch`); try { mkdirSync(join(repo, ".symbiot"), { recursive: true }); writeFileSync(f, patch); } catch {} return f; };
  noteTried(repo, m.taskId, patch, { done });
  if (!patch.trim()) { if (done) tickInMain(repo, ticked); drop(repo, m); return { ...out, merged: done, ticked: done }; }
  if (!done) { out.saved = save(); drop(repo, m); return out; } // unfinished: the task stays open, its changes kept as a patch, and isn't started beside again on the same inputs
  const pf = join(wt, ".symbiot", "merge.patch"); writeFileSync(pf, patch);
  const check = git(repo, ["apply", "--check", pf]);
  if (check.status !== 0) { // it doesn't apply cleanly to the folder as it is now: a task for the lane's agent
    out.conflict = true; out.saved = save();
    if (addTask) try { addTask(`Merge a finished task's changes into ${m.lane}: "${clip(m.task, 80)}" was done in a copy of the repo, and its changes clash with newer ones in the main folder. They're saved as .symbiot/parallel-${m.id}.patch. Apply what still makes sense by hand (git apply --3way won't do it alone), keep both sides' intent, run the tests, then tick this.`, m.lane); } catch {}
    tickInMain(repo, ticked); drop(repo, m); return out;
  }
  const ap = git(repo, ["apply", pf]);
  if (ap.status !== 0) { out.conflict = true; out.saved = save(); drop(repo, m); return out; }
  saveRunFiles(repo, [...loadRunFiles(repo), { id: "par-" + m.id, startedAt: m.startedAt, endedAt: Date.now(), ticked: ticked.length, files: files.sort() }]); // Approve ships these with the lane's other finished work
  tickInMain(repo, ticked);
  drop(repo, m);
  return { merged: true, files, ticked: true };
}
// The finished task shows ticked in the lane's brief, as if its own run had ticked it
// (pushTasks then moves it to review). Appended when the brief has no line for it.
function tickInMain(repo, texts) {
  const f = join(repo, ".symbiot", "TASKS.md"); let md = ""; try { md = readFileSync(f, "utf8"); } catch {}
  const key = (s) => String(s).replace(/^\s*-\s*\[[ x]\]\s*/i, "").trim().toLowerCase(); let lines = md ? md.split("\n") : ["## Tasks"];
  for (const t of texts) {
    const at = lines.findIndex((l) => /^\s*-\s*\[[ x]\]/i.test(l) && key(l) === t.trim().toLowerCase());
    if (at >= 0) lines[at] = lines[at].replace(/\[ \]/, "[x]");
    else { const h = lines.findIndex((l) => /^##\s+Tasks\s*$/.test(l)); lines.splice(h < 0 ? lines.length : h + 1, 0, `- [x] ${t}`); }
  }
  try { mkdirSync(join(repo, ".symbiot"), { recursive: true }); writeFileSync(f, lines.join("\n")); } catch {}
}

// Runs that ended while Symbiot was down: merge them now (called at startup and by the tick).
function mergeEnded({ merge = mergeBack, addTask = null, running = runningHandoff } = {}) {
  const done = [];
  for (const m of inflight()) { if (running(m.wt)) continue; try { done.push({ id: m.id, ...merge(m, { addTask, code: tickedIn(readFileSync(join(m.wt, ".symbiot", "TASKS.md"), "utf8")).length ? 0 : 1 }) }); } catch {} }
  return done;
}

export { besideAgain, noteTried, laneFacts, dropHeld, WT_DIR, DEFAULT_CAP, laneCap, claims, clash, verdict, peel, inflight, inflightIds, parallelLane, openTasksOf, dirtyFiles, isGit, startParallel, mergeBack, mergeEnded, briefFor, tickInMain, drop };
