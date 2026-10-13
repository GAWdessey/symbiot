// Tasks, from your list to a merged PR: the checklist (tasks.json), the brief
// each repo gets (.symbiot/TASKS.md), what the agent ticked (review), and
// Approve: branch, commit, push, PR, and the version bump and npm release facts
// it shows.
import { can } from "./licence.mjs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { VERSION, LATEST_VERSION, REGISTRY, semverGt, loadConfig, saveConfig, loadTasks, saveTasks, TASK_MAX, clipWords, taskWords, sameTask, isFinding, uniqueTasks, gitOut, hasCmd, repoState } from "./core.mjs";
import { handoverRules, ONLY_YOU, HANDBACK } from "./handover.mjs";
import { laneReach } from "./reach.mjs";
import { doneBrief, standingBrief } from "./asksdone.mjs";
import { userStyleLine } from "./adapt.mjs";
import { inflightIds } from "./parallel.mjs";
import { QUESTIONS_MAX, OPTIONS_SHOWN, IDEAS_SHOWN, isUrgent, handoffCmd, runHandoff, runningHandoff, onShipping, untrackedBefore, forgetUntracked, loadRunFiles, forgetRunFiles, writeTasks, droppedTasks, startHeldTasks, connectorsLine } from "./agents.mjs";
import { gitDefaultBranch } from "./drift.mjs";
import { readRunLog, briefPlan } from "./work.mjs";
import { repoPathMap, laneMap, openWork, detectRepo } from "./scan.mjs";
import { afterShip } from "./deploy.mjs";
import { MARKETING_DIR, ensureMarketing, marketingBrief } from "./marketing.mjs";

// ---- tasks: a persistent checklist (stored by core.mjs) -------------------
// One line (TASKS.md has a task per line, and a tick only matches a whole one),
// long enough for a pasted list of next steps: 300 cut one off mid-list. Longer
// than a task holds (TASK_MAX), nothing is cut: the task keeps its whole text as
// written (full), and its line is how it starts plus a link to the rest, which
// goes out with its brief as .symbiot/full/<id>.md (pushTasks). after: what ends
// its line either way, "(handed over by coral)".
const LEAD_MAX = 600, FULL_DIR = "full";
const fullLink = (id) => ` Full text: \`.symbiot/${FULL_DIR}/${id}.md\``;
// A long task's start: its whole sentences up to LEAD_MAX, or its words.
function leadOf(text) {
  const m = text.slice(0, LEAD_MAX + 1).match(/^.*[.!?](?=\s)/s);
  return m && m[0].length >= LEAD_MAX / 3 ? m[0] + " …" : clipWords(text, LEAD_MAX);
}
// A task given an ops run's folder name as its lane (act-304032d6: an ops report's ideas took the
// folder's name) belongs to ops: no lane has that name, so it sat "Blocked: Symbiot can't find its
// folder" (16 Oct 2026). syncTasks puts one already on the list right too.
const OPS_FOLDER = /^act-[0-9a-f]{6,}$/i;
const laneOfRepo = (repo) => (OPS_FOLDER.test(String(repo || "")) ? "ops" : repo || "");
function addTask(text, repo, { after = "", finding = false } = {}) {
  repo = laneOfRepo(repo);
  const raw = String(text || "").trim(), tail = String(after || "").trim();
  text = raw.replace(/\s+/g, " ");
  if (!text) return { error: "empty" };
  const long = text.length + tail.length + 1 > TASK_MAX, full = long ? raw + (tail ? "\n\n" + tail : "") : "";
  const lineFor = (id) => (long ? leadOf(text) + fullLink(id) : text) + (tail ? " " + tail : "");
  const t = loadTasks(), id = randomBytes(6).toString("hex"), line = lineFor(id);
  // The same task already open in the same repo (in review counts), even in
  // other words (sameTask): that task, not a duplicate. When the new wording has
  // a clause more, the task takes it, unless it's in review (its tick is on the
  // old words). Handed out already, a tick on either wording counts (syncTasks).
  const dup = t.find((x) => !x.done && !x.archived && (x.repo || "") === (repo || "") && sameTask(x.text, line));
  if (dup && !dup.review && taskWords(full || line).length > taskWords(dup.full || dup.text).length) {
    dup.text = lineFor(dup.id); if (long) dup.full = full; else delete dup.full;
    saveTasks(t); return { ...dup, duplicate: true, reworded: true };
  }
  if (dup) return { ...dup, duplicate: true };
  // a finding (core.mjs isFinding) goes in ticked, saying why: on the record, but not a job
  const item = { id, text: line, ...(long ? { full } : {}), repo: repo || "", done: !!finding, ...(finding ? { finding: FINDING_NOTE } : {}), ts: Date.now() };
  t.unshift(item); saveTasks(t); return item;
}
function toggleTask(id) { const t = loadTasks(); const it = t.find((x) => x.id === id); if (it) { it.done = !it.done; it.changed = Date.now(); saveTasks(t); } return it || { error: "not found" }; }
// Done or not, as said (not flipped), for a change that can arrive late or twice
// (your phone's, phone.mjs): at is when it was made, and a tick here since wins.
function setTaskDone(id, done, { at = Date.now() } = {}) {
  const t = loadTasks(), it = t.find((x) => x.id === id);
  if (!it || it.archived) return { error: "not found" };
  if (it.done === !!done) return it;
  if ((Number(it.changed) || 0) > at) return { conflict: true, ...it };
  it.done = !!done; it.changed = at; saveTasks(t);
  return it;
}
function removeTask(id) { saveTasks(loadTasks().filter((x) => x.id !== id)); return { ok: true }; }
// Remove, on Home or the Workdesk: the task is cancelled, not deleted. It goes to the Archive
// marked removed, so Undo (or Restore there) brings it back as it was (Garth, 2026-10-15:
// "there is no way to remove an unwanted task"). Its repo's next TASKS.md leaves it out.
function cancelTask(id) {
  const t = loadTasks(), it = t.find((x) => x.id === id);
  if (!it) return { error: "That task isn't there any more." };
  if (it.archived) return { ok: true, id, already: true };
  it.archived = true; it.cancelled = true; it.archivedAt = Date.now(); saveTasks(t);
  return { ok: true, id, text: it.text };
}
function restoreTask(id) { const t = loadTasks(); const it = t.find((x) => x.id === id); if (it) { it.archived = false; it.done = false; delete it.archivedAt; delete it.cancelled; if (it.finding) { it.kept = true; delete it.finding; } if (it.removedBy || it.dropped) { it.kept = true; delete it.removedBy; delete it.merged; delete it.dropped; } saveTasks(t); } return it || { error: "not found" }; }
// Which task texts the agent checked off in a repo's .symbiot/TASKS.md
function completedInRepo(repoPath) {
  try { return readFileSync(join(repoPath, ".symbiot", "TASKS.md"), "utf8").split("\n").filter((l) => /^\s*-\s*\[x\]/i.test(l)).map((l) => l.replace(/^\s*-\s*\[x\]\s*/i, "").trim().toLowerCase()); }
  catch { return []; }
}

// A task that removes others: `Drop the "gosolr's own WhatsApp number" task`,
// "Merge the two `WA_WABA_ID` tasks into one". An agent can't edit your task
// list, so approving one was all that happened: the tasks it named stayed open,
// and every regenerated TASKS.md brought them back. Once it's approved, they go
// here: dropped ones are archived, merged ones too, all but the newest. It
// names them with a quoted phrase (`…`, "…", “…”) whose words are all in
// theirs ('s aside), and only reaches open tasks in its repo from before its
// approval. A phrase that names more than MAX_REMOVED is too vague to act on.
// Archived, each keeps removedBy (and merged); one you restore stays (kept).
const REMOVES = /^\s*(drop|remove|delete|merge|combine|dedupe|deduplicate)\b/i, MAX_REMOVED = 4;
const noPossessive = (s) => String(s || "").replace(/['’]s\b/gi, "");
function removalOf(text) {
  const s = String(text || ""), m = s.match(REMOVES), at = s.search(/\btasks?\b/i); if (!m || at < 0) return null;
  // up to "task": "…the two `WA_WABA_ID` tasks. Both are the same edit to `.env`" names no `.env` task
  const phrases = [...s.slice(0, at).matchAll(/`([^`]+)`|"([^"]+)"|“([^”]+)”/g)].map((x) => taskWords(noPossessive(x[1] || x[2] || x[3]))).filter(Boolean);
  return phrases.length ? { merge: /^(merge|combine|dedupe)/i.test(m[1]), phrases } : null;
}
function applyRemovals(t) {
  let n = 0; const now = Date.now();
  for (const r of t.filter((x) => x.approvedAt && x.repo)) {
    const rm = removalOf(r.text); if (!rm) continue;
    const named = (x) => { const w = new Set(taskWords(noPossessive(x.text)).split(" ")); return rm.phrases.some((p) => p.split(" ").every((y) => w.has(y))); };
    const hit = t.filter((x) => x !== r && x.repo === r.repo && !x.done && !x.archived && !x.review && !x.kept && (x.ts || 0) < r.approvedAt && named(x));
    if (hit.length > MAX_REMOVED || (rm.merge && hit.length < 2)) continue;
    const go = rm.merge ? hit.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(1) : hit;
    for (const x of go) { Object.assign(x, { done: true, archived: true, archivedAt: now, removedBy: r.id }); if (rm.merge) x.merged = true; n++; }
  }
  return n;
}
// A task the agent deleted from its TASKS.md (droppedTasks: the brief tells it
// to, only when the user says to drop one) is closed: archived as dropped, so
// the next brief doesn't bring it back. Only open tasks from before that brief,
// and never one you restored (kept). map: repo name → path.
function applyDrops(t, map) {
  let n = 0; const now = Date.now(), seen = {};
  for (const x of t) {
    if (x.done || x.archived || x.review || x.kept || !x.repo || !map[x.repo]) continue;
    const gone = seen[x.repo] || (seen[x.repo] = droppedTasks(map[x.repo]));
    if (gone.some((d) => (x.ts || 0) <= d.at && sameTask(d.text, x.text))) { Object.assign(x, { done: true, archived: true, archivedAt: now, dropped: true }); n++; }
  }
  return n;
}
// "Check what was handed out, see what's completed, then archive it" — with an
// approval step in between. An agent ticking an item in TASKS.md means "done,
// please review", NOT archived: it waits in review until the user approves it
// (approveRepo: branch + commit + push + PR, then archive) or sends it back
// (sendBack: unticked, open again). Only a task the USER ticks archives directly.
// Tasks held for an agent that has since finished land here too, and an agent
// starts on what's still open in them (one `push --open` started can't do that).
const FROM_REPORT = /\(from the report "/, FINDING_NOTE = "a finding, not a job: it says what's so, with nothing to do";
function syncTasks() {
  const t = loadTasks(); const map = laneMap(); let review = 0, archived = 0, started = 0; const checkedByRepo = {};
  for (const x of t) if (x && !x.archived && OPS_FOLDER.test(String(x.repo || ""))) x.repo = "ops"; // an ops folder's name as a lane: ops (addTask)
  const dropped = applyDrops(t, map);
  for (const x of t) {
    if (x.archived || x.done || x.review || !x.repo) continue;
    if (!(x.repo in checkedByRepo)) { const p = map[x.repo]; if (p && startHeldTasks(p)) started++; checkedByRepo[x.repo] = p ? completedInRepo(p) : []; }
    if (checkedByRepo[x.repo].some((c) => sameTask(c, x.text))) { x.review = true; x.reviewAt = Date.now(); review++; }
  }
  // a finding filed as a task from a report (core.mjs isFinding) has nothing to do: ticked, saying so
  for (const x of t) if (!x.done && !x.archived && !x.review && !x.kept && FROM_REPORT.test(x.text) && isFinding(x.text)) { x.done = true; x.finding = FINDING_NOTE; x.changed = Date.now(); }
  for (const x of t) { if (x.done && !x.archived) { x.archived = true; x.archivedAt = Date.now(); archived++; } }
  const removed = applyRemovals(t);
  saveTasks(t);
  return { review, archived, started, removed, dropped };
}
// git with an argv (task text goes into commit messages — never through a shell)
function git(repo, args, timeout = 30000) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  return { ok: r.status === 0, out: String(r.stdout || "").replace(/\s+$/, ""), err: String(r.stderr || (r.error && r.error.message) || "").trim() };
}
// The same, in the background: Approve's status and add can take minutes in a big
// tree, and spawnSync held the whole app up until it timed out (ETIMEDOUT). On a
// timeout git gets SIGTERM first, so it lets go of .git/index.lock.
function gitAsync(repo, args, timeout = 30000, { input = null, env = {} } = {}) {
  return new Promise((resolve) => {
    let out = "", err = "", timedOut = false, done = false, kill = null;
    const p = spawn("git", ["-C", repo, ...args], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env }, stdio: [input == null ? "ignore" : "pipe", "pipe", "pipe"] });
    const t = setTimeout(() => { timedOut = true; p.kill("SIGTERM"); kill = setTimeout(() => p.kill("SIGKILL"), 5000); }, timeout);
    const end = (code, e) => { if (done) return; done = true; clearTimeout(t); clearTimeout(kill); resolve({ ok: code === 0 && !timedOut, out: out.replace(/\s+$/, ""), err: String(err || (e && e.message) || "").trim(), timedOut, timeout }); };
    p.stdout.setEncoding("utf8"); p.stderr.setEncoding("utf8");
    p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { err += d; });
    // close waits for every holder of its output; one git left running (an fsmonitor) kept it open
    p.on("error", (e) => end(-1, e)); p.on("close", (code) => end(code)); p.on("exit", (code) => { setTimeout(() => end(code), 2000).unref(); });
    if (input != null) { p.stdin.on("error", () => {}); p.stdin.end(input); }
  });
}
// At least 2 minutes, and more for a long list of paths: 2 ms a path, up to 10.
const gitTimeout = (n = 0) => Math.min(600000, 120000 + 2 * n);
// What to tell the user when git didn't finish: never a bare ETIMEDOUT.
function gitFailed(what, r, n = 0) {
  if (!r.timedOut) return `${what} failed: ` + (r.err.split("\n").filter(Boolean).pop() || "unknown error");
  const many = n > 5000 ? `this repo has about ${n.toLocaleString("en")} changed or untracked files` : "this repo may have a big untracked tree";
  return `${what} timed out after ${Math.round(r.timeout / 1000)} s: ${many}, probably a venv, node_modules, a dataset or a cache missing from .gitignore. Add it to .gitignore, then approve again.`;
}
const NOT_SYMBIOT = ["--", ".", ":(exclude).symbiot"]; // .symbiot/ is Symbiot's scratch (brief + agent log), never shipped
function workingChanges(path) {
  const st = git(path, ["status", "--porcelain", "-uall", ...NOT_SYMBIOT]);
  const files = st.out ? st.out.split("\n").map((l) => ({ st: l.slice(0, 2).trim(), file: l.slice(3) })) : [];
  return { branch: git(path, ["rev-parse", "--abbrev-ref", "HEAD"]).out, files, stat: statOf(git(path, ["diff", "--shortstat", "HEAD", ...NOT_SYMBIOT]).out, files) };
}
function statOf(short, files) {
  const n = (re) => +((short.match(re) || [])[1] || 0), ins = n(/(\d+) insertion/), del = n(/(\d+) deletion/), fresh = files.filter((f) => f.st === "??").length;
  return [ins && `+${ins}`, del && `−${del}`, fresh && `${fresh} new`].filter(Boolean).join(" ");
}
// The same off the main thread: the review card's refresh (reviewGit) and Approve's
// own look at the tree. A status that takes a minute no longer freezes the app.
async function workingChangesAsync(path) {
  const st = await gitAsync(path, ["status", "--porcelain", "-z", "-uall", ...NOT_SYMBIOT], gitTimeout());
  const files = st.ok ? parseStatusZ(st.out) : [], short = (await gitAsync(path, ["diff", "--shortstat", "HEAD", ...NOT_SYMBIOT])).out;
  return { branch: git(path, ["rev-parse", "--abbrev-ref", "HEAD"]).out, files, stat: statOf(short, files), ...(st.ok ? {} : { error: gitFailed("git status", st) }) };
}
// `git status --porcelain -z`: [{ st, file, from }], from being a rename's old path.
function parseStatusZ(out) {
  const parts = String(out || "").split("\0"), files = [];
  for (let i = 0; i < parts.length; i++) {
    const l = parts[i]; if (l.length < 4) continue;
    const f = { st: l.slice(0, 2).trim(), file: l.slice(3) };
    if (/^[RC]/.test(l)) f.from = parts[++i];
    files.push(f);
  }
  return files;
}
// The paths Approve stages: every tracked change, and the untracked files the
// agent's runs made. An untracked file that was already there before the first
// run since the last approve (agents.mjs untrackedBefore) and hasn't changed
// since is left out: scratch's 170k files of venvs and datasets timed out
// `git add -A`, and staging the whole tree took in an unignored .env too. With
// no note of what was there (a run started before Symbiot kept one), it's
// every change.
//
// With a record of the runs here (agents.mjs runfiles.json), it's narrower: the
// files of runs that have ended, ticked or not. Only a run still going holds its
// files back (held): "unfinished" used to mean "ended without a tick", which hid
// a run's untasked fix and its finished rounds from Approve for good once any
// run had ended (15 Oct 2026). A file a finished and a running run both touched
// can't be told apart, so it's listed in `shared` for the caller to ask about.
// extra: files Approve itself changed (a version bump). No record, every change.
function taskPaths(path, files, extra = []) {
  const before = untrackedBefore(path), had = before ? new Set(before.files) : null;
  const changed = (f) => { try { return statSync(join(path, f)).mtimeMs >= before.at; } catch { return true; } };
  const mine = (f) => f.st !== "??" || !had || !had.has(f.file) || changed(f.file);
  let keep = files.filter(mine), held = [], shared = []; const left = files.length - keep.length;
  const runs = loadRunFiles(path);
  if (runs.length) {
    const live = runningHandoff(path), going = (r) => !!(live && live.id && r.id === live.id);
    const done = new Set(runs.filter((r) => !going(r)).flatMap((r) => r.files)), open = new Set(runs.filter(going).flatMap((r) => r.files)), more = new Set(extra);
    shared = keep.filter((f) => done.has(f.file) && open.has(f.file)).map((f) => f.file);
    held = keep.filter((f) => !done.has(f.file) && !more.has(f.file)).map((f) => f.file);
    keep = keep.filter((f) => done.has(f.file) || more.has(f.file));
  }
  return { paths: keep.flatMap((f) => (f.from ? [f.file, f.from] : [f.file])), files: keep.map((f) => f.file), left, held, shared };
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
// A repo that publishes on merge: a GitHub workflow runs `npm publish` on a push
// to a branch, not only on a tag. Its release is the version npm has; a v* tag,
// if any, is a best-effort record that can lag or be missing.
function publishesOnMerge(path) {
  const dir = join(path, ".github", "workflows"); let files = []; try { files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)); } catch { return false; }
  return files.some((f) => { let t = ""; try { t = readFileSync(join(dir, f), "utf8"); } catch {} return /\bnpm publish\b/.test(t) && /^\s*push:\s*\n\s+branches:/m.test(t); });
}
// Merged work that isn't released yet, or null when there's none, or the repo
// has no releases to measure from. bump: the version these uncommitted changes
// set in package.json, if they change it.
// - Released by v* tag: how many commits the default branch (or origin's copy,
//   where approved PRs merge) is past its last v* tag.
// - Publishes on merge (npm: true): how many commits it's past the one that set
//   the version npm has (since), once learnNpm knows. A branch whose version
//   isn't on npm yet is merged and due to publish: { pending: version }.
function unreleased(path) {
  const base = gitDefaultBranch(path), pom = publishesOnMerge(path); let best = null;
  for (const ref of ["refs/heads/" + base, "refs/remotes/origin/" + base]) {
    if (!git(path, ["rev-parse", "-q", "--verify", ref]).ok) continue;
    let r = null;
    if (pom) {
      const k = npmKey(path, ref), v = k.slice(k.lastIndexOf("@") + 1), known = k && NPM_HAS.get(k); if (!known) continue;
      if (!known.yes) r = { base, npm: true, pending: v, ahead: 0 };
      else {
        const set = git(path, ["log", "-1", "--format=%H", "-G", `"version"[[:space:]]*:[[:space:]]*"${v.replace(/\./g, "\\.")}"`, ref, "--", "package.json"]).out;
        r = { base, npm: true, since: v, ahead: set ? +git(path, ["rev-list", "--count", set + ".." + ref]).out || 0 : 0 };
      }
    } else {
      const tag = git(path, ["describe", "--tags", "--abbrev=0", "--match", "v*", ref]).out; if (!tag) continue;
      r = { base, tag, ahead: +git(path, ["rev-list", "--count", tag + ".." + ref]).out || 0 };
    }
    // the copy furthest ahead; a merged version still to publish says more than a count
    if (!best || (r.pending && !best.pending) || (!best.pending && r.ahead > best.ahead)) best = r;
  }
  if (!best || (!best.ahead && !best.pending)) return null;
  const ver = (s) => { try { return String(JSON.parse(s).version || ""); } catch { return ""; } };
  let now = ""; try { now = ver(readFileSync(join(path, "package.json"), "utf8")); } catch {}
  const was = ver(git(path, ["show", "HEAD:package.json"]).out);
  return { ...best, ...(now && was && now !== was ? { bump: now } : {}) };
}
// Approve can bump the version in the PR itself: offered when the committed
// version is already released and these changes don't change it. Released: its
// v* tag exists, or npm has it (a repo that publishes on merge may have no tag,
// or one its release couldn't push). { version, patch, minor, taken? } or null.
// The offer counts from the highest version anywhere ahead: origin's default
// branch (a bump merged, not yet pulled here) and origin's open symbiot/ branches
// (a bump PR still open). Two batches cut from main were both offered 1.2.4: the
// second published nothing and its PR clashed in package.json and CHANGELOG.md
// (#122, 15 Oct 2026). taken: those versions and where, for the card to say.
function bumpOffer(path) {
  const ver = (s) => { try { return String(JSON.parse(s).version || ""); } catch { return ""; } };
  const was = ver(git(path, ["show", "HEAD:package.json"]).out); if (!/^\d+\.\d+\.\d+$/.test(was)) return null;
  let now = ""; try { now = ver(readFileSync(join(path, "package.json"), "utf8")); } catch {}
  if (now !== was || !(git(path, ["rev-parse", "-q", "--verify", "refs/tags/v" + was]).ok || onNpm(path))) return null;
  let top = was; const taken = [];
  const refs = ["refs/remotes/origin/" + gitDefaultBranch(path), ...git(path, ["for-each-ref", "--format=%(refname)", "--count=50", "refs/remotes/origin/symbiot/"]).out.split("\n").filter(Boolean)];
  for (const ref of refs) {
    const v = ver(git(path, ["show", ref + ":package.json"]).out); if (!/^\d+\.\d+\.\d+$/.test(v) || !semverGt(v, was)) continue;
    taken.push(`${v} on ${ref.replace(/^refs\/remotes\//, "")}`); if (semverGt(v, top)) top = v;
  }
  const m = top.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return { version: was, patch: `${m[1]}.${m[2]}.${+m[3] + 1}`, minor: `${m[1]}.${+m[2] + 1}.0`, ...(taken.length ? { taken } : {}) };
}
// Whether npm has the committed version, as learnNpm last found ("name@version" →
// { yes, at }). bumpOffer only reads this; learnNpm asks the registry first.
const NPM_HAS = new Map();
function npmKey(path, ref = "HEAD") {
  let p = {}; try { p = JSON.parse(git(path, ["show", ref + ":package.json"]).out) || {}; } catch {}
  return typeof p.name === "string" && p.name && !p.private && typeof p.version === "string" && p.version ? p.name + "@" + p.version : "";
}
function onNpm(path) { const k = npmKey(path); return !!(k && NPM_HAS.get(k) && NPM_HAS.get(k).yes); }
// Ask the registry about each repo's committed version, and for a repo that
// publishes on merge, its default branch's (unreleased measures from that). A
// yes is kept; a no is asked again after 5 minutes (it may have just been
// published). True when it learned of a version on npm.
async function learnNpm(paths, registry = REGISTRY) {
  let learned = false;
  const keys = new Set();
  for (const path of new Set(paths.filter(Boolean))) {
    keys.add(npmKey(path));
    if (publishesOnMerge(path)) { const base = gitDefaultBranch(path); for (const ref of ["refs/heads/" + base, "refs/remotes/origin/" + base]) keys.add(npmKey(path, ref)); }
  }
  await Promise.all([...keys].map(async (k) => {
    const was = NPM_HAS.get(k); if (!k || (was && (was.yes || Date.now() - was.at < 300000))) return;
    const at = k.lastIndexOf("@"), name = k.slice(0, at), version = k.slice(at + 1);
    try {
      const r = await fetch(`${registry}/${encodeURIComponent(name).replace(/^%40/, "@")}/${encodeURIComponent(version)}`, { signal: AbortSignal.timeout(5000) });
      const yes = r.ok && String((await r.json().catch(() => ({}))).version || "") === version;
      NPM_HAS.set(k, { yes, at: Date.now() }); learned = learned || yes;
    } catch {}
  }));
  return learned;
}
// An agent's question that needs a release ("Once 0.41.0 is installed: …") names
// a version of the repo's own npm package. The Agents tab shows it next to the
// version installed here and the one on npm, and doesn't offer a "Done" answer
// until the step is possible: a release that isn't out, or isn't installed yet,
// can't have been tried. The version asked about is the highest one the question
// names in the package's major, up to its next minor (not "ydotool 0.1.8").
function releaseNeeded(text, current) {
  const p = (v) => v.split(".").map(Number), [maj, min] = p(current);
  let best = "";
  for (const [v] of String(text || "").matchAll(/\b\d+\.\d+\.\d+\b/g)) { const [a, b] = p(v); if (a === maj && b <= min + 1 && (!best || semverGt(v, best))) best = v; }
  return best;
}
// The version npm -g installed, or for Symbiot this app's own; "" if not installed.
function installedVersion(name) {
  if (name === "symbiot") return VERSION;
  const root = process.platform === "win32" ? join(process.execPath, "..", "node_modules") : join(process.execPath, "..", "..", "lib", "node_modules");
  try { return String(JSON.parse(readFileSync(join(root, name, "package.json"), "utf8")).version || ""); } catch { return ""; }
}
// A step that needs a release ("once 0.65.2 is installed, sign in…") can't have been done
// before that release is in here: Home's "I've done this" on one passed on "Done: the user
// did it" while 0.65.1 still ran, and the sign-in it was for was lost (2026-10-14).
// { name, needs, installed }, or null when it's in (or names no release, or isn't installed).
function releaseNotIn(path, text) {
  let pkg = {}; try { pkg = JSON.parse(readFileSync(join(path, "package.json"), "utf8")) || {}; } catch {}
  if (typeof pkg.name !== "string" || !pkg.name || pkg.private || !/^\d+\.\d+\.\d+/.test(String(pkg.version || ""))) return null;
  const needs = releaseNeeded(text, pkg.version), installed = needs ? installedVersion(pkg.name) : "";
  return installed && semverGt(needs, installed) ? { name: pkg.name, needs, installed } : null;
}
// The newest version on npm ("" if unknown), asked again after 5 minutes.
const NPM_LATEST = new Map();
async function npmLatest(name, registry = REGISTRY) {
  if (name === "symbiot" && LATEST_VERSION) return LATEST_VERSION;
  const was = NPM_LATEST.get(name); if (was && Date.now() - was.at < 300000) return was.v;
  let v = was ? was.v : "";
  try {
    const r = await fetch(`${registry}/${encodeURIComponent(name).replace(/^%40/, "@")}`, { headers: { accept: "application/vnd.npm.install-v1+json" }, signal: AbortSignal.timeout(5000) });
    if (r.ok) v = String(((await r.json())["dist-tags"] || {}).latest || "");
  } catch {}
  NPM_LATEST.set(name, { v, at: Date.now() });
  return v;
}
// Mark each open question that needs a release with { name, needs, installed,
// npm, waiting }. waiting: "npm" (not published yet), "install" (published, not
// installed here) or "" (possible now).
async function withReleases(agents, registry = REGISTRY) {
  for (const a of agents) {
    const qs = (a.ask && a.ask.questions) || []; if (!qs.length) continue;
    let pkg = {}; try { pkg = JSON.parse(readFileSync(join(a.path, "package.json"), "utf8")) || {}; } catch {}
    if (typeof pkg.name !== "string" || !pkg.name || pkg.private || !/^\d+\.\d+\.\d+/.test(String(pkg.version || ""))) continue;
    const asks = qs.map((q) => [q, releaseNeeded(q.q + " " + q.context, pkg.version)]).filter((x) => x[1]); if (!asks.length) continue;
    const npm = await npmLatest(pkg.name, registry), installed = installedVersion(pkg.name);
    for (const [q, needs] of asks) q.release = { name: pkg.name, needs, installed, npm, waiting: npm && semverGt(needs, npm) ? "npm" : installed && semverGt(needs, installed) ? "install" : "" };
  }
  return agents;
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
// ---- the changelog: what each release brought ---------------------------------
// A repo that keeps a CHANGELOG.md gets a section for each version Approve bumps
// to, "## 0.45.0 — 2026-10-06", newest first, with what was approved: each task
// (near-duplicates once), up to its first sentence. Changes approved without a
// task are named by the files they touch. With an AI connected, Approve has it
// word them as release notes first (writeups.mjs releaseNotes): opts.notes, one
// per task. Symbiot ships its own, and the app shows it as what's new in an
// update (server.mjs changesSince).
const ENTRY_MAX = 220;
const NOT_OWN = /(^|\/)(package(-lock)?\.json|npm-shrinkwrap\.json|CHANGELOG\.md)$/;
function changelogEntry(text) {
  let s = String(text || "").replace(/\s+/g, " ").trim();
  const m = s.match(/^(.{40,}?(?<!\be\.g|\bi\.e|\betc|\bvs)[.!?])\s+(?=[^a-z])/); if (m && m[1].length <= ENTRY_MAX) s = m[1]; // not at "e.g. `x`" or "e.g. when"
  return clipWords(s, ENTRY_MAX);
}
function changelogSection(version, texts, files = [], day = new Date().toISOString().slice(0, 10), notes = null) {
  const own = files.filter((f) => !NOT_OWN.test(f));
  const items = notes && notes.length ? [...new Set(notes)] : texts.length ? uniqueTasks(texts.map(changelogEntry))
    : [own.length ? `Changes approved without a task, in ${own.slice(0, 6).join(", ")}${own.length > 6 ? ` and ${own.length - 6} more` : ""}.` : "Version bump only."];
  return `## ${version} — ${day}\n\n${items.map((x) => "- " + x).join("\n")}\n`;
}
// Put the section in above the newest one (after the file's own heading and
// intro), once per version. Gives back a function that restores the file.
function noteChangelog(path, version, texts, files, notes) {
  const file = join(path, "CHANGELOG.md"); let text = "";
  try { text = readFileSync(file, "utf8"); } catch { return () => {}; }
  if (new RegExp(`^##\\s+\\[?v?${version.replace(/\./g, "\\.")}\\b`, "m").test(text)) return () => {};
  const at = text.search(/^## /m), sec = changelogSection(version, texts, files, undefined, notes) + "\n";
  try { writeFileSync(file, at < 0 ? text.replace(/\s*$/, "\n\n") + sec : text.slice(0, at) + sec + text.slice(at)); } catch { return () => {}; }
  return () => { try { writeFileSync(file, text); } catch {} };
}
// What Approve will put in the changelog, for your AI to word (writeups.mjs
// releaseNotes): the tasks it ships, in the order it ships them, and the files
// and diff behind them. null when it won't write one: no bump, no CHANGELOG.md,
// or the agent is still working there. opts as approveRepo / approveChanges take them.
function releaseInput(repo, opts = {}) {
  const path = repoPathMap()[repo];
  if (!path || !(opts.bump === "patch" || opts.bump === "minor") || !bumpOffer(path) || !existsSync(join(path, "CHANGELOG.md")) || runningHandoff(path)) return null;
  const t = loadTasks(), ids = new Set(Array.isArray(opts.tick) ? opts.tick.map(String) : []);
  const review = t.filter((x) => x.repo === repo && x.review && !x.done && !x.archived);
  const items = review.length ? review : t.filter((x) => ids.has(x.id) && x.repo === repo && !x.done && !x.archived && !x.review);
  const files = reviewGit(path).files.map((f) => f.file).filter((f) => !NOT_OWN.test(f)); // what the card showed; the ship reads the tree itself
  const texts = uniqueTasks(noFullLinks(items.map((x) => x.text)));
  return texts.length || files.length ? { path, texts, files, diff: workingDiff(path, 30000) } : null;
}
// Ship with the version bumped when opts.bump is "patch" or "minor" and the repo
// is offered one (bumpOffer), noted in its CHANGELOG.md if it keeps one (in
// opts.notes' words, when given). Both are put back if the ship fails.
// One ship at a time per folder: Approve no longer holds the app up while git
// runs, so a second click could start another on the same tree. Each step of a ship
// ends by itself (git, the tests and gh all have a limit), and the hold is let go
// however it ends; one older than SHIP_STALE is past any ship, so it's taken over
// rather than refusing every Approve there until the app restarts (dailify, 14 Oct
// 2026: its tests never ended). SHIP_STALE is past the sum of the steps' limits
// (status 10 + add 10 + tests 15 + rebase 4 + push 4 + gh 2 min): at 30 a slow ship
// was taken over and two ran on one checkout. shipStep notes what it's on, for the
// refusal to say. shipping(path): what's shipping there, for a run not to start on
// the tree meanwhile (agents.mjs runHandoff) and a restart not to cut it off
// (server.mjs restartWouldStop).
const SHIPPING = new Map(), SHIP_STALE = 60 * 60000;
function holdShip(path, now = Date.now()) {
  const was = SHIPPING.get(path);
  if (was && now - was.at < SHIP_STALE) {
    const min = Math.floor((now - was.at) / 60000);
    return { error: `Already approving here (${was.step || "starting"}, ${min < 1 ? "under a minute" : min + " min"} so far): wait for that one to finish.` };
  }
  const me = { at: now, step: "" }; SHIPPING.set(path, me);
  return { release: () => { if (SHIPPING.get(path) === me) SHIPPING.delete(path); } };
}
const shipStep = (path, step) => { const h = SHIPPING.get(path); if (h) h.step = step; };
const shipping = (path) => { const h = SHIPPING.get(path); return h && Date.now() - h.at < SHIP_STALE ? { step: h.step || "starting", since: h.at } : null; };
const shippingPaths = () => [...SHIPPING.keys()].filter((p) => shipping(p));
onShipping(shipping); // a run never starts on a tree Approve is committing, rebasing or testing (agents.mjs runHandoff)
// A long task's line ends with a link to its full text in .symbiot/full/ (addTask),
// which never ships: not in a commit or PR body.
const noFullLinks = (texts) => texts.map((t) => String(t).replace(/ Full text: `\.symbiot\/full\/[0-9a-f]+\.md`/g, ""));
async function shipWithBump(path, texts, opts) {
  const hold = holdShip(path); if (hold.error) return hold;
  let undo = () => {}, undoLog = () => {}; const head = git(path, ["rev-parse", "HEAD"]).out;
  try {
    const offer = (opts.bump === "patch" || opts.bump === "minor") && bumpOffer(path);
    if (!offer) return await shipChanges(path, texts, opts);
    const to = offer[opts.bump], files = (await workingChangesAsync(path)).files.map((f) => f.file);
    undo = setVersion(path, to); undoLog = noteChangelog(path, to, noFullLinks(texts), files, opts.notes);
    const r = await shipChanges(path, texts, { ...opts, bumped: to });
    if (r.error) { undo(); undoLog(); return r; }
    return { ...r, bumped: to };
  } catch (e) {
    if (git(path, ["rev-parse", "HEAD"]).out === head) { undo(); undoLog(); } // not committed: a throw used to leave the bump in the tree, uncommitted and no run's to ship
    return { error: "Approve failed: " + String((e && e.message) || e) };
  } finally { hold.release(); }
}
// What the last run in a folder said when it finished: agent.log after the last
// run's "=== name time ===" and "$ command" lines.
function runSummary(path) {
  const log = readRunLog(join(path, ".symbiot", "agent.log")); if (!log) return "";
  const at = log.lastIndexOf("\n=== "), rest = at < 0 ? log : log.slice(log.indexOf("\n", at + 1) + 1);
  return rest.replace(/^\$ .*\n?/, "").trim().slice(-8000);
}
// Whether a run's summary says it finished a task: one of its lines (a bullet,
// a paragraph) has most of the task's words, and doesn't say it wasn't done. A
// guess the user confirms, so it leans to ticking: an unticked task only comes
// back as a task.
const NOT_DONE = /\b(didn['’]?t|did not|couldn['’]?t|could not|can['’]?t|cannot|wasn['’]?t|isn['’]?t|haven['’]?t|not (yet|done|finished|ticked|started)|still (open|to do|needs?)|left (it|them|alone)|blocked)\b/i;
const keyWords = (s) => new Set(taskWords(s).split(" ").filter((w) => w.length > 3).map((w) => w.replace(/s$/, "")));
function saidFinished(summary, text) {
  const want = keyWords(text); if (want.size < 2) return false;
  return String(summary || "").split(/\n/).some((l) => {
    if (NOT_DONE.test(l)) return false;
    const has = keyWords(l); let n = 0; for (const w of want) if (has.has(w)) n++;
    return n >= Math.min(3, want.size) && n / want.size >= 0.4;
  });
}
// The open tasks of a repo whose changes are approved without one: Approve
// offers to tick them, checked when the last run's summary says it finished them,
// so finished work doesn't go out again as new tasks on the next send.
function finishedOffer(path, open, round) {
  const summary = runSummary(path);
  return uniqueTasks(open.map((x) => x.text)).slice(0, 12).map((text) => { const x = open.find((y) => y.text === text); return round && x.id === round.id ? { id: x.id, text, finished: false, round: true } : { id: x.id, text, finished: saidFinished(summary, text) }; });
}
// The open task of these words: most of the shorter one's words in the other (a
// TASKS.md line is clipped, and "Round done:" names a task in its first words).
function taskOf(words, open) {
  const has = keyWords(words); let best = null, top = 0;
  for (const x of open) {
    const want = keyWords(x.text); let n = 0; for (const w of want) if (has.has(w)) n++;
    const r = n / Math.max(1, Math.min(want.size, has.size));
    if (n >= Math.min(3, want.size) && r >= 0.5 && r > top) { best = x; top = r; }
  }
  return best;
}
// A task that runs for weeks (a domain move, step by step) stays unticked until its
// last step, so its finished, tested rounds had no ticked task to go out under, and
// "nothing to approve" read as "done already" while they sat uncommitted (2026-10-12).
// The open task uncommitted changes are a round of: the one the last run's summary
// says "Round done:" for (as the brief asks), else the first unticked item in
// TASKS.md when it has steps and the run said which step it was on. null: neither.
const ROUND_DONE = /^\W*round\s+(?:\d+\s+)?(?:done|finished)\s*[:\-–—]\s*(.+)$/gim;
function roundOf(path, open, summary = runSummary(path)) {
  if (!open.length) return null;
  for (const m of String(summary || "").matchAll(ROUND_DONE)) { const x = taskOf(m[1], open); if (x) return { id: x.id, text: x.text }; }
  let md = ""; try { md = readFileSync(join(path, ".symbiot", "TASKS.md"), "utf8"); } catch {}
  const first = briefPlan(md).length && /\bstep\s+\d{1,2}\b/i.test(summary) ? md.split("\n").find((l) => /^\s*-\s*\[ \]/.test(l)) : "";
  const x = first && taskOf(first.replace(/^\s*-\s*\[ \]\s*/, ""), open);
  return x ? { id: x.id, text: x.text } : null;
}
// What Approve would ship out of workingChanges: the files of the runs that finished
// (taskPaths), so the card's list is the commit's. held: files only an unfinished run
// touched; shared: ones a finished and an unfinished run both touched (Approve asks).
function shippable(path, wc) {
  const own = taskPaths(path, wc.files), keep = new Set(own.files);
  return { ...wc, files: wc.files.filter((f) => keep.has(f.file)), ...(own.held.length ? { held: own.held } : {}), ...(own.shared.length ? { shared: own.shared } : {}) };
}
// Repos with tasks awaiting review, plus repos Symbiot sent tasks to that have
// uncommitted changes no ticked task covers (untasked: approve them as-is, with
// `open`, the repo's open tasks, to tick the ones the run finished).
// running: an agent is still editing there, so its changes may be half done.
// A repo's git side of Review (what changed, what's unreleased), kept REVIEW_FRESH:
// the Tasks tab polls /api/pending every 4 s and Home ticks every 20 s, and asking
// git for every repo on each poll held the app up ~2 s a call (2026-10-12, measured
// again 15 Oct 2026). The first look at a repo asks git there and then; after that
// a poll gets what was kept, and once it's older than REVIEW_FRESH a refresh runs
// in the background (gitAsync), one at a time per repo. Approve asks git itself,
// and forgets what was kept (forgetReview) so the card after it is fresh.
const REVIEW_GIT = new Map(), REVIEW_FRESH = 15000;
const reviewOf = (path, wc) => ({ ...wc, unreleased: unreleased(path), bumpOffer: bumpOffer(path), publishesOnMerge: publishesOnMerge(path) });
function reviewGit(path) {
  const had = REVIEW_GIT.get(path);
  if (had && Date.now() - had.at < REVIEW_FRESH) return had.v;
  if (had) { refreshReview(path, had); return had.v; }
  const v = reviewOf(path, workingChanges(path)); REVIEW_GIT.set(path, { at: Date.now(), v }); return v;
}
function refreshReview(path, had) {
  if (had.busy) return; had.busy = true;
  workingChangesAsync(path).then((wc) => { if (REVIEW_GIT.get(path) === had) REVIEW_GIT.set(path, { at: Date.now(), v: reviewOf(path, wc) }); }).catch(() => {}).finally(() => { had.busy = false; }); // forgotten meanwhile (an Approve): dropped
}
const forgetReview = () => REVIEW_GIT.clear();
function pendingReview() {
  const t = loadTasks(), by = {}; for (const x of t) if (x.review && !x.done && !x.archived) (by[x.repo] = by[x.repo] || []).push(x);
  const sent = [...new Set(t.filter((x) => x.repo && !x.archived && !by[x.repo]).map((x) => x.repo))];
  const late = lateUnsent(t), map = Object.keys(by).length || sent.length || late.size ? laneMap() : {};
  const am = autoMergeRepos(), state = (repo, path) => ({ autoMerge: am.includes(repo), running: !!(path && runningHandoff(path)), ...(path && shipping(path) ? { shipping: shipping(path) } : {}) });
  const out = Object.keys(by).sort().map((repo) => { const path = map[repo] || ""; return { repo, path, tasks: by[repo], ...state(repo, path), ...(path ? shippable(path, reviewGit(path)) : { branch: "", files: [], stat: "" }) }; });
  for (const repo of sent.sort()) {
    const path = map[repo]; if (!path || !existsSync(join(path, ".symbiot", "TASKS.md"))) continue;
    const wc = shippable(path, reviewGit(path)); if (!wc.files.length) continue;
    const still = t.filter((x) => x.repo === repo && !x.done && !x.archived && !x.review), round = roundOf(path, still);
    const open = finishedOffer(path, still, round);
    out.push({ repo, path, tasks: [], untasked: true, open, ...(round ? { round } : {}), ...state(repo, path), ...wc });
  }
  // approved and committed, but it never got as far as a PR: its card stays, saying why, with a retry (sendAgain)
  for (const [repo, path] of Object.entries(map)) {
    if (!path || (!late.has(repo) && !existsSync(UNSENT(path)))) continue;
    const un = keptUnsent(path, repo, t); if (!un) continue;
    const had = out.find((r) => r.repo === repo);
    if (had) had.unsent = un;
    else out.push({ repo, path, tasks: [], files: [], branch: un.branch, stat: "", unsent: un, ...state(repo, path) });
  }
  return out;
}
// Repos with tasks approved in the last two weeks that have a commit but no PR: from
// before Approve kept what didn't go up (readUnsent), so dailify's four show up too.
const UNSENT_DAYS = 14;
const lateUnsent = (t, now = Date.now()) => new Set(t.filter((x) => x.repo && x.archived && x.commit && x.branch && !x.pr && !x.unsentLeft && now - (Number(x.approvedAt) || 0) < UNSENT_DAYS * 86400000).map((x) => x.repo));
// The review card's word on approved work that didn't go up: { at, branch, commit, ahead,
// why: conflicts | tests | push | pr, note } or null once GitHub has it. Kept like reviewGit.
function unsentCard(path, repo, t, now = Date.now()) {
  const rec = readUnsent(path);
  const old = !rec && t.filter((x) => x.repo === repo && x.archived && x.commit && x.branch && !x.pr && !x.unsentLeft && now - (Number(x.approvedAt) || 0) < UNSENT_DAYS * 86400000).sort((a, b) => (b.approvedAt || 0) - (a.approvedAt || 0))[0];
  if (!rec && !old) return null;
  const branch = rec ? rec.branch : old.branch, u = unsentOf(path, branch);
  if (!u && !(rec && rec.pushed)) return null;
  if (rec) return { at: rec.at, branch, commit: rec.commit, ahead: u ? u.ahead : 0, why: rec.why || "push", note: rec.note || "", ...(rec.fix ? { fix: rec.fix } : {}) };
  return { at: old.approvedAt, branch, commit: old.commit, ahead: u.ahead, why: "push", note: `Approved ${new Date(old.approvedAt).toISOString().slice(0, 10)} and committed on ${branch}, but it never went up to GitHub, so no PR was opened.` };
}
// Kept like reviewGit; its git is a few quick reads, so it's asked again on the spot once stale.
function keptUnsent(path, repo, t) {
  const k = "unsent:" + path, had = REVIEW_GIT.get(k);
  if (had && Date.now() - had.at < REVIEW_FRESH) return had.v;
  const v = unsentCard(path, repo, t); REVIEW_GIT.set(k, { at: Date.now(), v }); return v;
}
// Approving while the agent is still editing would commit its half-done work.
const stillWorking = (repo, path) => path && runningHandoff(path) ? { error: `The agent is still working in ${repo}. Approve once it finishes.`, running: true } : null;
const branchSlug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "tasks";
// Whether everything committed on this branch is on the default branch already,
// because an earlier PR from it merged. Squash-merged, main has the same changes
// under a different history, so a new PR from the branch carries them twice and
// can't merge (how #80 got stuck behind #79). Seen two ways: the branch's files
// are main's though main doesn't hold its commits, or GitHub says a PR from it
// merged and no PR from it is open. Gives { from: the ref to start the next
// branch from, after?: the merged PR's head, when commits were made on the branch
// since (they move too) }, or null.
// symbiot/drafts-test-race, 12 Oct 2026: #172 merged, then two Approves committed on
// it. Only a branch with nothing since counted as merged, so both stayed there, the
// second's PR didn't open, and the page showed #172, merged, as its PR: nothing to merge.
// gh in the background, like gitAsync: the ship's `pr create`/`pr merge` held the app
// up for up to a minute each. The same { status, stdout, stderr } as spawnSync gave.
const ghRun = (path) => (args) => new Promise((resolve) => {
  let stdout = "", stderr = "", done = false; const p = spawn("gh", args, { cwd: path, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  const t = setTimeout(() => { try { p.kill("SIGTERM"); } catch {} }, 60000), end = (status, e) => { if (done) return; done = true; clearTimeout(t); resolve({ status, stdout, stderr: stderr || (e ? String(e.message) : "") }); };
  p.stdout.setEncoding("utf8"); p.stderr.setEncoding("utf8"); p.stdout.on("data", (d) => { stdout += d; }); p.stderr.on("data", (d) => { stderr += d; });
  p.on("error", (e) => end(-1, e)); p.on("close", (code) => end(code));
});
// origin's default branch as GitHub has it now, fetched once per ship (net.fetched):
// two fetches, both sync, froze the app for 90 s before "push failed" offline.
async function fetchBase(path, base, net) {
  if (net.fetched || !git(path, ["remote", "get-url", "origin"]).ok) return;
  net.fetched = true; await gitAsync(path, ["fetch", "-q", "origin", base], 60000); // best effort
}
async function mergedAlready(path, branch, base, { gh = null, net = {} } = {}) {
  const origin = git(path, ["remote", "get-url", "origin"]);
  await fetchBase(path, base, net);
  const ref = git(path, ["rev-parse", "-q", "--verify", "refs/remotes/origin/" + base]).ok ? "origin/" + base : base;
  if (!git(path, ["rev-parse", "-q", "--verify", ref]).ok) return null;
  if (!git(path, ["merge-base", "--is-ancestor", "HEAD", ref]).ok && git(path, ["diff", "--quiet", "HEAD", ref, ...NOT_SYMBIOT]).ok) return { from: ref };
  if (!gh && (!origin.ok || !/github/i.test(origin.out) || !hasCmd("gh"))) return null;
  const list = async (state) => { const r = await (gh || ghRun(path))(["pr", "list", "--head", branch, "--state", state, "--limit", "1", "--json", "headRefOid"]); try { return r.status === 0 ? JSON.parse(r.stdout) : null; } catch { return null; } };
  const merged = await list("merged"), head = String((merged && merged[0] && merged[0].headRefOid) || "");
  if (!head || !git(path, ["merge-base", "--is-ancestor", head, "HEAD"]).ok) return null;
  const since = git(path, ["rev-list", "--count", head + "..HEAD"]);
  if (!since.ok) return null;
  if (since.out === "0") return { from: ref };
  const open = await list("open"); if (!open || open.length) return null; // one open still takes what's committed here
  return { from: ref, after: head };
}
// Move what was committed on a spent branch since its PR merged (after..HEAD) onto
// a fresh branch from main, one commit at a time. One whose changes main already has
// (carried over by hand) comes out empty and is left out. A conflict puts everything
// back as it was. { ok, earlier: how many of those before the newest moved, dropped } or { error }.
function carryOver(path, from, after, next) {
  const back = git(path, ["rev-parse", "--abbrev-ref", "HEAD"]).out, list = git(path, ["rev-list", "--reverse", after + "..HEAD"]);
  if (!list.ok) return { error: list.err };
  // a merge of main among them: picked one by one, its conflict fixes would be lost
  if (git(path, ["rev-list", "--merges", "--count", after + "..HEAD"]).out !== "0") return { error: `a merge of ${from} is among them` };
  const sw = git(path, ["switch", "-c", next, "--no-track", from]); if (!sw.ok) return { error: sw.err.split("\n")[0] };
  const all = list.out.split("\n").filter(Boolean); let earlier = 0, dropped = 0;
  for (const [i, c] of all.entries()) {
    const cp = git(path, ["cherry-pick", "--keep-redundant-commits", c]); // one that comes out empty still commits, so it's seen and left out
    if (cp.ok && git(path, ["diff", "--quiet", "HEAD~1", "HEAD"]).ok) { git(path, ["reset", "-q", "--soft", "HEAD~1"]); dropped++; continue; }
    if (cp.ok) { if (i < all.length - 1) earlier++; continue; }
    git(path, ["cherry-pick", "--abort"]); git(path, ["switch", "-q", back]); git(path, ["branch", "-q", "-D", next]);
    return { error: `${c.slice(0, 7)} doesn't apply to ${from}: ${(cp.err || cp.out).split("\n").find((l) => /conflict/i.test(l)) || (cp.err || cp.out).split("\n")[0]}` };
  }
  return { ok: true, earlier, dropped };
}
// The commit's (and PR's) subject: what was approved, so `git log --oneline`
// reads as a history ("Watch GitHub too (+2 more)"), not twenty "symbiot: 3
// approved tasks". The first task's first line, its markdown dropped, clipped
// at a word to fit 72 characters with the count of the rest. The body lists
// them all.
function commitSubject(texts) {
  if (!texts.length) return "symbiot: changes approved without a task";
  const more = texts.length > 1 ? ` (+${texts.length - 1} more)` : "", max = 72 - more.length;
  const t = String(texts[0]).split("\n").find((l) => l.trim()) || "";
  const s = t.replace(/^\s*(#+|[-*+]|\d+[.)])\s+/, "").replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim() || `${texts.length} approved tasks`;
  return clipWords(s, max) + more;
}
// The repo's own tests, run before a PR opens (what CI would run). A repo with no test
// script, or with its dependencies not installed here, can't be checked: that doesn't block.
// Nor do tests that only failed reaching a service on this computer that isn't running
// (dailify's API tests and Postgres on 127.0.0.1:5432, 13 Oct 2026): that's "couldn't
// test here" (untested), and CI runs them on the PR. opts.cmd/args stand in for npm test.
// They run as a process group of their own, and end when npm does: a server a test started
// (dailify's pnpm -r test, 14 Oct 2026) kept their output open after npm exited, so this
// waited for ever, holding that folder's Approve with it ("Already approving here"). Past
// the limit, or 2 s after npm exits with the output still held, the whole group is stopped.
// Not npm test --silent: npm hands its loglevel down, and pnpm -r test under "silent"
// prints nothing at all (dailify, 14 Oct 2026), so a database that wasn't running read
// as a plain failure with no reason, and every Approve there stopped before the push.
async function repoTests(path, { cmd = "npm", args = ["test"], limit = 15 * 60000 } = {}) {
  let test = ""; try { test = String(JSON.parse(readFileSync(join(path, "package.json"), "utf8")).scripts?.test || ""); } catch {}
  if (!test || /no test specified/.test(test) || !existsSync(join(path, "node_modules"))) return { ok: true };
  return await new Promise((done) => {
    let out = "", refused = "", code = null, settled = false, drain = null;
    const env = { ...process.env }; delete env.npm_config_loglevel; // Symbiot started under npm --silent passes it on too
    const p = spawn(cmd, args, { cwd: path, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    const group = (sig) => { try { process.kill(-p.pid, sig); } catch { try { p.kill(sig); } catch {} } };
    // the address is looked for across where one piece of output ends and the next begins
    const keep = (d) => { refused = refused || localRefused(out.slice(-200) + d); out = (out + d).slice(-4000); };
    p.stdout.on("data", keep); p.stderr.on("data", keep);
    const finish = (over) => {
      if (settled) return; settled = true; clearTimeout(timer); clearTimeout(drain);
      if (over || drain) { group("SIGTERM"); setTimeout(() => group("SIGKILL"), 5000).unref(); } // something still holds the output: stop the lot
      if (over) return done({ ok: false, note: `they were still running after ${Math.round(limit / 60000)} min, so they were stopped` });
      if (code === 0) return done({ ok: true });
      if (refused) return done({ ok: true, untested: `the tests couldn't run here: they need something on ${refused} that isn't running on this computer, so they weren't checked before the push (CI runs them on the PR)` });
      done({ ok: false, note: failedLine(out) });
    };
    const timer = setTimeout(() => finish(true), limit);
    p.on("error", () => { if (settled) return; settled = true; clearTimeout(timer); done({ ok: true }); }); // no npm here: can't check
    p.on("exit", (c) => { code = c; drain = setTimeout(() => finish(false), 2000); });
    p.on("close", (c) => { if (code === null) code = c; clearTimeout(drain); drain = null; finish(false); });
  });
}
// The last line of failing tests' output that says something: not npm's or pnpm's own
// sign-off ("npm error code 1", "ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL…", "Exit status 1",
// "apps/api test: Failed"), nor colour codes.
function failedLine(out) {
  const said = (l) => l.trim() && !/^\s*(npm (error|ERR!)|ERR_PNPM_|Exit status \d+\s*$|\/\S+:\s*$)/.test(l) && !/^\S+ \S+: Failed\s*$/.test(l.trim());
  return (String(out).replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter(said).pop() || "").trim().slice(0, 160);
}
// The local address a test's connection was refused at ("127.0.0.1:5432"), or "".
function localRefused(s) {
  const m = String(s).match(/ECONNREFUSED\s+((?:127\.\d+\.\d+\.\d+|::1|\[::1\]|localhost):\d+)/) || String(s).match(/connect(?:ion)? to (?:server at )?"?((?:127\.\d+\.\d+\.\d+|::1|localhost))"?(?: \([^)]*\))?,? port (\d+) failed: Connection refused/i);
  return m ? (m[2] ? `${m[1]}:${m[2]}` : m[1]) : "";
}
// Approved work committed here that never reached GitHub: commits on this branch that
// no origin ref has, with something main doesn't. dailify, 13 Oct 2026: four Approves
// committed on symbiot/4-tasks-2026-10-13 and stopped before the push (its tests needed
// a database that wasn't running here); the tree was clean after, so each next Approve
// found "nothing to merge" and the work sat there until ops pushed it by hand (#508).
// { branch, ahead } or null. Of the branch checked out, or of another one named.
function unsentOf(path, branch = git(path, ["rev-parse", "--abbrev-ref", "HEAD"]).out) {
  if (!branch || branch === "HEAD" || !git(path, ["remote", "get-url", "origin"]).ok) return null;
  const base = gitDefaultBranch(path), tip = "refs/remotes/origin/" + base;
  if (branch === base || !git(path, ["rev-parse", "-q", "--verify", tip]).ok) return null;
  const n = git(path, ["rev-list", "--count", branch, "--not", "--remotes=origin"]);
  if (!n.ok || !(Number(n.out) > 0)) return null;
  if (git(path, ["diff", "--quiet", tip, branch, ...NOT_SYMBIOT]).ok) return null; // main has all of it already
  return { branch, ahead: Number(n.out) };
}
// What an Approve that didn't get as far as a PR left, in .symbiot/unsent.json (Symbiot's
// own, never shipped): the branch, why it stopped, and the PR's title and text. The review
// card keeps saying so, with a retry (sendAgain), until it's sent.
const UNSENT = (path) => join(path, ".symbiot", "unsent.json");
function readUnsent(path) { try { const u = JSON.parse(readFileSync(UNSENT(path), "utf8")); return u && u.branch ? u : null; } catch { return null; } }
function noteUnsent(path, u) {
  try { if (u) { mkdirSync(join(path, ".symbiot"), { recursive: true }); writeFileSync(UNSENT(path), JSON.stringify(u, null, 1)); } else if (existsSync(UNSENT(path))) unlinkSync(UNSENT(path)); } catch {}
}
// A branch name free here and on origin, from stem: an earlier day's "7 tasks" may be
// merged and gone locally but still there, and pushing onto it is refused.
function freeBranch(path, stem) {
  const taken = (b) => git(path, ["rev-parse", "--verify", "-q", "refs/heads/" + b]).ok || git(path, ["rev-parse", "--verify", "-q", "refs/remotes/origin/" + b]).ok;
  let b = stem; for (let i = 2; taken(b); i++) b = `${stem}-${i}`;
  return b;
}
// Sync approved work: off the default branch onto symbiot/<task>, commit the
// working tree (minus .symbiot/), push, and open a PR with gh. On a branch whose
// earlier PR already merged, it starts a fresh symbiot/ branch from the default
// one instead (mergedAlready). Each step that can't happen (no remote, push
// rejected, no gh) stops there and says so — the commit is never lost, and what
// didn't go up is kept (noteUnsent) and sent with the next Approve, or Send again.
// opts.push=false stops after the commit, opts.pr=false after the push.
// opts.sendOnly: commit nothing, just send what earlier Approves committed.
async function shipChanges(path, texts, opts = {}) {
  texts = noFullLinks(texts); const net = { fetched: false };
  if (opts.sendOnly) return (await sendUnsent(path, texts, opts, net)) || { error: "Nothing here is waiting to go up: GitHub has all of it.", none: true };
  shipStep(path, "reading what changed");
  const st = await gitAsync(path, ["status", "--porcelain", "-z", "-uall", ...NOT_SYMBIOT], gitTimeout());
  if (!st.ok) return { error: gitFailed("git status", st) };
  const ch = { files: parseStatusZ(st.out), branch: git(path, ["rev-parse", "--abbrev-ref", "HEAD"]).out };
  // nothing to commit, but an earlier Approve's commits never went up: those go now
  if (!ch.files.length) return (await sendUnsent(path, texts, opts, net)) || { ok: true, nothing: true, note: "No uncommitted changes — approved without a commit." };
  const own = taskPaths(path, ch.files, opts.bumped ? ["package.json", "package-lock.json", "npm-shrinkwrap.json", "CHANGELOG.md"] : []), { paths, left } = own;
  const heldNote = own.held.length ? `${own.held.length} file${own.held.length === 1 ? "" : "s"} not from a finished run (yours, or a run still going) ${own.held.length === 1 ? "was" : "were"} left out (${own.held.slice(0, 4).join(", ")}${own.held.length > 4 ? ", …" : ""}).` : "";
  // Two runs touched the same file, one finished and one not: whose it is can't be told, so ask.
  if (own.shared.length && !opts.allowShared) return { ask: true, waiting: true, shared: own.shared, error: `Another run is still working on ${own.shared.length === 1 ? "a file" : own.shared.length + " files"} this one finished. Approving now would send its unfinished work too. Wait for it to finish, or approve anyway?` };
  // No task behind these changes: that's a question for the user, not a commit.
  if (!texts.length && paths.length && !opts.confirm) return { ask: true, untasked: true, files: own.files.slice(0, 50), error: `No ticked task covers these ${own.files.length} file${own.files.length === 1 ? "" : "s"} (${own.files.slice(0, 4).join(", ")}${own.files.length > 4 ? ", …" : ""}). Commit them anyway?` };
  const leftNote = [heldNote, left ? `${left.toLocaleString("en")} untracked file${left === 1 ? " that was" : "s that were"} already there before the agent ran ${left === 1 ? "was" : "were"} left out.` : ""].filter(Boolean).join(" ");
  if (!paths.length) return (await sendUnsent(path, texts, opts, net)) || { ok: true, nothing: true, note: "No changes from the agent's runs — approved without a commit. " + leftNote };
  if (!ch.branch || ch.branch === "HEAD") return { error: "Detached HEAD — check out a branch first." };
  const base = gitDefaultBranch(path), day = new Date().toISOString().slice(0, 10); let branch = ch.branch, fresh = "", carry = null;
  const newBranch = () => freeBranch(path, "symbiot/" + branchSlug(!texts.length ? `changes-${day}` : texts.length === 1 ? texts[0] : `${texts.length}-tasks-${day}`));
  // A branch made here and then nothing committed on it: the checkout goes back to
  // where it was and the branch goes, else every Approve after found itself on an
  // empty symbiot/ branch with files staged (15 Oct 2026).
  const made = { from: ch.branch, branch: "" }, failed = (error) => { if (made.branch) { git(path, ["switch", "-q", made.from]); git(path, ["branch", "-q", "-D", made.branch]); } return { error, branch: made.branch ? made.from : branch }; };
  if (branch === base) {
    branch = newBranch();
    const sw = git(path, ["switch", "-c", branch]); if (!sw.ok) return { error: "Could not create branch: " + sw.err };
    made.branch = branch;
  } else {
    const spent = await mergedAlready(path, branch, base, { gh: opts.gh, net }), from = spent && !spent.after && spent.from;
    if (spent && spent.after) carry = spent;
    else if (from) {
      // The changes come along; if main changed a file they touch, git refuses and they stay put.
      const next = newBranch(), sw = git(path, ["switch", "-c", next, "--no-track", from]);
      fresh = sw.ok ? `${branch}'s earlier PR already merged, so this starts a fresh branch from ${from}.`
        : `${branch}'s earlier PR already merged, but these changes couldn't move to a fresh branch from ${from} (${sw.err.split("\n")[0]}), so they're on ${branch}, and its PR may not merge.`;
      if (sw.ok) { branch = next; made.branch = next; }
    }
  }
  // Stage just the task's paths (taskPaths), in the background, given on stdin
  // (170k of them don't fit in an argv) and taken literally (a `[` or `*` in a
  // name isn't a glob). They come from a status that leaves .symbiot out; the
  // reset also covers anything of it staged before. The commit takes those paths
  // only (--only): a plain commit took the whole index, so a .env you or the agent
  // had staged earlier shipped while the note said it was left out (15 Oct 2026).
  // Anything else staged stays staged.
  shipStep(path, "committing");
  const only = { input: paths.join("\0"), env: { GIT_LITERAL_PATHSPECS: "1" } };
  const add = await gitAsync(path, ["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"], gitTimeout(paths.length), only);
  if (!add.ok) return failed(gitFailed("git add", add, paths.length));
  git(path, ["reset", "-q", "--", ".symbiot"]); // never ship Symbiot's own scratch
  const subject = commitSubject(texts);
  const body = (texts.length ? texts.map((x) => "- " + x).join("\n") : "No ticked task covers these changes.") + (opts.bumped ? `\n\nBumps the version to ${opts.bumped}. ` + (publishesOnMerge(path) ? `It publishes to npm when this merges.` : `After this merges, tag v${opts.bumped} on ${base} to release it.`) : "");
  const cm = await gitAsync(path, ["commit", "-q", "--only", "--pathspec-from-file=-", "--pathspec-file-nul", "-m", subject, "-m", body], gitTimeout(paths.length), only);
  if (!cm.ok) return failed("Commit failed: " + (cm.timedOut ? gitFailed("git commit", cm, paths.length) : cm.err || cm.out));
  forgetRunFiles(path, own.files);
  forgetUntracked(path); // committed: the next run notes what's there afresh
  if (carry) {
    const next = newBranch(), mv = carryOver(path, carry.from, carry.after, next), was = branch;
    if (mv.ok) branch = next;
    const earlier = mv.ok ? mv.earlier : 0, gone = mv.ok ? mv.dropped : 0;
    fresh = mv.ok ? `${was}'s earlier PR already merged, so this starts a fresh branch from ${carry.from}${earlier > 0 ? `, with the ${earlier} commit${earlier === 1 ? "" : "s"} approved on ${was} since that hadn't reached ${base}` : ""}${gone ? ` (${gone} already on ${base} left out)` : ""}.`
      : `${was}'s earlier PR already merged, but this couldn't move to a fresh branch from ${carry.from} (${mv.error}), so it's on ${was}, with a PR of its own, which may not merge without a hand.`;
  }
  const said = [fresh, leftNote].filter(Boolean).join(" ");
  const out = { ok: true, branch, base, commit: git(path, ["rev-parse", "--short", "HEAD"]).out, subject, ...(said ? { note: said } : {}) };
  return await sendBranch(path, { branch, base, subject, body: body + (carry && fresh ? "\n\n" + fresh : ""), out, said, opts, newBranch, net });
}
// Send what earlier Approves committed on this branch and never got up (unsentOf), or
// open the PR for one that went up without one: rebased, tested, pushed, PR'd as an
// Approve would. The PR is named as it was (readUnsent), else for texts, else for the
// branch's last commit. null when nothing is waiting.
// Only Approve's own: a symbiot/ branch, or the one it noted. Your own branch's
// commits you haven't pushed are yours to send.
async function sendUnsent(path, texts, opts, net = {}) {
  const rec = readUnsent(path), mineOf = (u) => u && (/^symbiot\//.test(u.branch) || (rec && rec.branch === u.branch)) ? u : null;
  const u = mineOf(unsentOf(path)) || (rec && rec.pushed ? { branch: rec.branch, ahead: 0, pushed: true } : null);
  if (!u && rec && unsentOf(path, rec.branch)) return { error: `The approved work is on ${rec.branch}: check that branch out, then send it again.` };
  if (!u) { if (rec) noteUnsent(path, null); return null; } // gone up another way (pushed by hand)
  const mine = rec && rec.branch === u.branch ? rec : null, last = (f) => git(path, ["log", "-1", "--format=" + f, u.branch]).out;
  const subject = (mine && mine.subject) || (texts.length ? commitSubject(texts) : last("%s"));
  const body = (mine && mine.body) || (texts.length ? texts.map((x) => "- " + x).join("\n") : last("%b"));
  const said = u.pushed ? `${u.branch} went up earlier without a PR, so this opens it.`
    : `${u.ahead} commit${u.ahead === 1 ? "" : "s"} approved on ${u.branch} earlier never reached GitHub, so ${u.ahead === 1 ? "it goes" : "they go"} up now.`;
  const out = { ok: true, resent: true, sentFrom: u.branch, branch: u.branch, base: gitDefaultBranch(path), commit: git(path, ["rev-parse", "--short", u.branch]).out, subject, note: said };
  const stem = u.branch.replace(/-\d+$/, "");
  return await sendBranch(path, { branch: u.branch, base: out.base, subject, body, out, said, opts: u.pushed ? { ...opts, verify: false } : opts, newBranch: () => freeBranch(path, stem), net, fix: mine && mine.fix });
}
// Push and open the PR (pushAndOpen), and keep what didn't get that far (noteUnsent):
// it's marked unsent, so the page shows it as not done, and the card keeps it with a retry.
// A clash with main is the agent's to sort out, not yours: a task for it goes on the
// lane (rebaseTask), and the caller starts the run once this ship lets go of the folder
// (startFix). "Rebase it by hand, then approve again" was a dead end against Symbiot's
// own rule that local git work is never a 👤 step (15 Oct 2026).
async function sendBranch(path, s) {
  const r = await pushAndOpen(path, s);
  if (!r.ok || s.opts.push === false || s.opts.pr === false || r.local) return r;
  if (r.pr) { noteUnsent(path, null); return r; }
  const why = r.conflicts ? "conflicts" : r.testsFailed ? "tests" : r.pushed ? "pr" : "push";
  let fix = s.fix || null, fresh = false; // fresh: added (or found open again) now, so the caller starts the run; one carried from an earlier try isn't restarted
  if (why === "conflicts" && s.opts.repo) {
    const t = addTask(rebaseTask(r.branch, s.base), s.opts.repo);
    if (!t.error) { fix = { id: t.id, text: t.text }; fresh = true; r.note = (r.note || "") + (t.duplicate ? " The agent's task to rebase it is still open, so it starts on it again." : " Symbiot added a task for the agent to rebase it, and starts it now."); }
  }
  noteUnsent(path, { at: Date.now(), branch: r.branch, commit: r.commit, subject: s.subject, body: s.body, note: r.note || "", why, ...(r.pushed ? { pushed: true } : {}), ...(fix ? { fix } : {}) });
  return { ...r, unsent: why, ...(fix ? { fix: fresh ? { ...fix, fresh: true } : fix } : {}) };
}
const rebaseTask = (branch, base) => `Rebase ${branch} onto origin/${base} (git fetch origin ${base}, then git rebase origin/${base} ${branch}). Resolve each conflict so this branch's change and ${base}'s both land, git rebase --continue until it's done, run the tests, then tick this item. Don't push and don't commit anything else: Symbiot pushes it and opens the PR when you tick.`;
// The lane's run on that task, once the ship has let go of the folder (runHandoff
// refuses while one ships). { started } or why not, on r.fix.
function startFix(path, repo, r) {
  if (!r || !r.fix || !r.fix.fresh || !repo) return r;
  delete r.fix.fresh; pushTasks({ repo }); // the task into the lane's brief
  const e = runHandoff(path) || {};
  r.fix = { ...r.fix, ...(e.pid && !e.busy ? { started: true, run: e.id } : e.busy ? { started: false, note: "An agent is already running there: it gets the task when that run ends." } : { started: false, note: e.note || "No agent command is set, so the task waits in the lane." }) };
  return r;
}
// The branch on top of origin/<base> as it is now (fetched once per ship), before
// the tests and the push. A branch is cut from where the checkout happens to be,
// which can be far behind main (PR #179: 29 commits, conflicts in 23 files). Not a
// branch GitHub has already: rewritten under it, its push would be refused (and a
// PR open from it would lose the commit to a fresh name).
// A clean checkout rebases in place. One with uncommitted tracked changes (files of
// a run still going, or your own) never does: `rebase --autostash` could fail to put
// them back and left conflict markers in the tree, the run's edit in a stash and
// Approve saying all was well (15 Oct 2026). Instead the branch is rebased in a
// throwaway worktree (.symbiot/ship-wt) and the checkout moved to the result with
// `reset --keep`, which refuses, and nothing changes, when one of those files was
// changed on main too: that counts as a conflict, for the agent to resolve.
// { ok } once the branch is on the tip (rebased: tip when it moved), or { conflicts }.
async function syncBranch(path, branch, base) {
  const tip = "origin/" + base;
  if (git(path, ["rev-parse", "-q", "--verify", "refs/remotes/origin/" + branch]).ok || !git(path, ["rev-parse", "-q", "--verify", "refs/remotes/" + tip]).ok || git(path, ["merge-base", "--is-ancestor", tip, branch]).ok) return { ok: true };
  const dirty = (await gitAsync(path, ["status", "--porcelain", "-z", "-uno", ...NOT_SYMBIOT], gitTimeout())).out.length > 0;
  const unmerged = () => git(path, ["diff", "--name-only", "--diff-filter=U"]).out.split("\n").filter(Boolean);
  const conflicts = (note = "") => ({ conflicts: true, note });
  if (!dirty) {
    const rb = await gitAsync(path, ["rebase", tip, branch], 120000);
    if (!rb.ok || unmerged().length || /resulted in conflicts/i.test(rb.err)) { await gitAsync(path, ["rebase", "--abort"]); return conflicts(); }
    return { ok: true, rebased: tip };
  }
  const wt = join(path, ".symbiot", "ship-wt"), drop = async () => { await gitAsync(path, ["worktree", "remove", "--force", wt], 60000); git(path, ["worktree", "prune"]); };
  if (existsSync(wt)) await drop(); // one a crashed ship left
  const add = await gitAsync(path, ["worktree", "add", "-q", "--detach", wt, branch], 120000);
  if (!add.ok) return conflicts(`it couldn't be brought up to date beside the uncommitted changes here (${add.err.split("\n").filter(Boolean).pop() || "git worktree add failed"})`);
  const rb = await gitAsync(wt, ["rebase", tip], 120000), moved = rb.ok ? git(wt, ["rev-parse", "HEAD"]).out : "";
  if (!rb.ok) await gitAsync(wt, ["rebase", "--abort"]);
  await drop();
  if (!moved) return conflicts();
  const keep = git(path, ["reset", "-q", "--keep", moved]); // the branch is checked out: this moves it, keeping the uncommitted files
  if (!keep.ok) return conflicts(`${base} changed a file that's also changed, uncommitted, here (${keep.err.split("\n").find((l) => /not uptodate|would be overwritten/i.test(l)) || keep.err.split("\n")[0]})`);
  return { ok: true, rebased: tip };
}
async function pushAndOpen(path, { base, subject, body, out, opts, newBranch, said = "", net = {} }) {
  let branch = out.branch;
  const noted = (note) => ({ ...out, note: (said ? said + " " : "") + note });
  if (opts.push === false) return out;
  if (!git(path, ["remote", "get-url", "origin"]).ok) return { ...noted("No origin remote — committed locally."), local: true };
  shipStep(path, "bringing it up to date with " + base);
  await fetchBase(path, base, net);
  const tip = "origin/" + base, sync = await syncBranch(path, branch, base);
  if (sync.conflicts) return { ...noted(`Committed, but not pushed: it conflicts with ${base} as GitHub has it now${sync.note ? ": " + sync.note : ""}, so no PR was opened.`), conflicts: true, behind: true };
  if (sync.rebased) { out.rebased = sync.rebased; out.commit = git(path, ["rev-parse", "--short", branch]).out; }
  if (opts.verify !== false) {
    shipStep(path, "running its tests");
    const v = await (typeof opts.verify === "function" ? opts.verify : repoTests)(path);
    if (v && v.ok === false) return { ...noted(`Committed, but not pushed: the tests fail on top of ${tip}${v.note ? " (" + v.note + ")" : ""}, so no PR was opened.`), testsFailed: true };
    if (v && v.untested) { said = [said, v.untested[0].toUpperCase() + v.untested.slice(1) + "."].filter(Boolean).join(" "); out.note = said; out.untested = true; }
  }
  shipStep(path, "pushing");
  let ps = await gitAsync(path, ["push", "-u", "origin", branch], 120000);
  // refused because origin's branch of that name went another way (an earlier PR of
  // that name, merged): the commit moves to a fresh name and goes up on that. Only
  // Approve's own symbiot/ branches: your `feat` whose origin copy moved on (a
  // colleague pushed) was renamed away from under you (15 Oct 2026).
  if (!ps.ok && /rejected|non-fast-forward|fetch first/i.test(ps.err)) {
    if (!/^symbiot\//.test(branch)) return noted(`Committed, but not pushed: origin/${branch} has moved on since this checkout, so the push was refused. Pull it first, or hand that to the agent.`);
    const next = newBranch();
    if (git(path, ["branch", "-m", branch, next]).ok) { branch = next; out.branch = next; ps = await gitAsync(path, ["push", "-u", "origin", branch], 120000); }
  }
  if (!ps.ok) return noted("Committed, but the push failed: " + (ps.err.split("\n").filter(Boolean).pop() || "unknown error"));
  out.pushed = true;
  if (opts.pr === false) return out;
  if (!opts.gh && !hasCmd("gh")) return noted("Pushed. Install the GitHub CLI (gh) to open the PR automatically.");
  const gh = opts.gh || ghRun(path); // a test's stand-in answers at once; await takes both
  shipStep(path, "opening the PR");
  const pr = await gh(["pr", "create", "--head", branch, "--base", base, "--title", subject, "--body", body + "\n\nApproved in Symbiot."]);
  // one already open from this branch takes the commit; a merged or closed one doesn't
  const openPr = async () => { try { const v = JSON.parse((await gh(["pr", "view", branch, "--json", "url,state"])).stdout); return v.state === "OPEN" ? String(v.url || "") : ""; } catch { return ""; } };
  const url = (String(pr.stdout || "").match(/https?:\/\/\S+/) || [])[0] || await openPr();
  if (!url) return noted("Pushed, but gh couldn't open the PR, so there's nothing to merge yet: " + (String(pr.stderr || "").trim().split("\n").pop() || "it gave no reason") + `. Open one from ${branch} on GitHub.`);
  out.pr = url;
  // Opt-in auto-merge: queue GitHub's native auto-merge, which lands the PR only
  // once its required checks (CI) pass — never immediately on its own if the repo
  // has branch protection. Needs 'Allow auto-merge' on the repo; if off, we say so.
  if (opts.autoMerge) {
    const am = await gh(["pr", "merge", branch, "--auto", "--squash", "--delete-branch"]);
    if (am.status === 0) out.autoMerge = "queued";
    else { out.autoMerge = "unavailable"; out.autoMergeErr = String(am.stderr || "").trim().split("\n").filter(Boolean).pop() || "gh pr merge failed"; }
  }
  return out;
}
// Merge an Approve PR from Symbiot itself, once every check has passed. The agent's
// PRs are opened by the repo owner's account, which GitHub won't let approve its own
// PR, so a "1 approving review" rule would otherwise send the user to a second account
// to click Approve. The owner may merge past that rule (--admin); never past a check.
function mergeWhenGreen(path, ref, gh = (args) => spawnSync("gh", args, { cwd: path, encoding: "utf8", timeout: 60000 })) {
  if (!hasCmd("gh")) return { error: "Install the GitHub CLI (gh) to merge from Symbiot." };
  const ck = gh(["pr", "checks", String(ref), "--json", "bucket"]);
  let buckets; try { buckets = JSON.parse(String(ck.stdout || "[]")).map((c) => c.bucket); } catch { return { error: "Couldn't read the checks: " + String(ck.stderr || "").trim().split("\n").pop() }; }
  if (buckets.some((b) => b === "fail" || b === "cancel")) return { error: "A check is failing, so it isn't merged. Fix that first." };
  if (buckets.some((b) => b === "pending")) return { pending: true, error: "Checks are still running. Merge it once they pass." };
  const m = gh(["pr", "merge", String(ref), "--squash", "--admin", "--delete-branch"]);
  if (m.status !== 0) return { error: "gh couldn't merge: " + (String(m.stderr || "").trim().split("\n").filter(Boolean).pop() || "unknown error") };
  return { ok: true, merged: String(ref) };
}
// Whether an approved change is live: { live: { state, text, target?, asked? } }, "not merged yet" at
// this point, or merged and waiting on its deploy when auto-merge is queued (deploy.mjs).
function liveOf(path, repo, r) {
  if (!r.pr) return {};
  try { return { live: afterShip(path, repo, r.pr, "approved", { ask: r.autoMerge === "queued" }) }; } catch { return {}; }
}
// Per-repo opt-in to auto-merge Approve PRs once CI passes (default off).
function autoMergeRepos() { const a = loadConfig().autoMerge; return Array.isArray(a) ? a : []; }
function setAutoMerge(repo, on) { const cfg = loadConfig(); let a = (Array.isArray(cfg.autoMerge) ? cfg.autoMerge : []).filter((x) => x !== repo); if (on && repo) a.push(repo); if (a.length) cfg.autoMerge = a; else delete cfg.autoMerge; saveConfig(cfg); return { ok: true, repos: cfg.autoMerge || [] }; }
async function approveRepo(repo, opts = {}) {
  forgetReview();
  const pro = can("ship"); if (!pro.ok) return { error: pro.why, pro: true }; // Pro (licence.mjs); the work stays on its branch
  const waiting = (t) => t.filter((x) => x.repo === repo && x.review && !x.done && !x.archived);
  const shipped = waiting(loadTasks());
  if (!shipped.length) return { error: "Nothing awaiting review for " + (repo || "(no repo)") + "." };
  const path = laneMap()[repo]; if (!path) return { error: "Repo not found: " + repo };
  const busy = stillWorking(repo, path); if (busy) return busy;
  const r = startFix(path, repo, await shipWithBump(path, uniqueTasks(shipped.map((x) => x.text)), { ...opts, repo, autoMerge: opts.autoMerge !== undefined ? opts.autoMerge : autoMergeRepos().includes(repo) }));
  if (r.error) return r;
  // read again: the ship took a while, and the list may have changed meanwhile
  const ids = new Set(shipped.map((x) => x.id)), t = loadTasks(), items = waiting(t).filter((x) => ids.has(x.id)), now = Date.now();
  for (const x of items) { x.review = false; x.done = true; x.archived = true; x.archivedAt = now; x.approvedAt = now; for (const k of ["branch", "commit", "pr"]) if (r[k]) x[k] = r[k]; }
  const removed = applyRemovals(t);
  if (r.pr) prFor(t, repo, r); // earlier Approves' tasks on this branch get the PR too, resent or carried up with these (147 sat with a commit and no PR, 15 Oct 2026)
  saveTasks(t);
  return { ...r, approved: items.length, ...liveOf(path, repo, r), ...(removed ? { removed } : {}) };
}
// "Approve changes without a task": ship the uncommitted changes even though no
// ticked task is behind them (a fix the agent made but didn't tick). If tasks are
// awaiting review in the repo, this is just Approve. opts.tick: ids of the
// repo's open tasks the changes finished (the run didn't tick them): they're
// approved with the changes, as Approve does, so they don't go out again.
// Changes that are a round of a task still going (roundOf) go out under its name,
// "A round of: …", and the task stays open, the round noted on it (rounds).
async function approveChanges(repo, opts = {}) {
  forgetReview();
  const pro = can("ship"); if (!pro.ok) return { error: pro.why, pro: true };
  if (loadTasks().some((x) => x.repo === repo && x.review && !x.done && !x.archived)) return await approveRepo(repo, opts);
  const path = laneMap()[repo]; if (!path) return { error: "Repo not found: " + (repo || "(no repo)") };
  const busy = stillWorking(repo, path); if (busy) return busy;
  if (!(await workingChangesAsync(path)).files.length) { const s = await sendAgain(repo, opts); return s.none ? { error: "No uncommitted changes in " + repo + "." } : s; }
  const ids = new Set(Array.isArray(opts.tick) ? opts.tick.map(String) : []);
  const open = (t) => t.filter((x) => x.repo === repo && !x.done && !x.archived && !x.review), ticked = (t) => open(t).filter((x) => ids.has(x.id));
  const t0 = loadTasks(), r0 = roundOf(path, open(t0)), round = r0 && !ids.has(r0.id) ? r0 : null; // ticked: it's finished, not a round
  const r = startFix(path, repo, await shipWithBump(path, uniqueTasks([...(round ? ["A round of: " + round.text] : []), ...ticked(t0).map((x) => x.text)]), { ...opts, repo, autoMerge: opts.autoMerge !== undefined ? opts.autoMerge : autoMergeRepos().includes(repo) }));
  if (r.error) return r;
  // read again: the ship took a while, and the list may have changed meanwhile
  const t = loadTasks(), items = ticked(t), now = Date.now();
  for (const x of items) { x.done = true; x.archived = true; x.archivedAt = now; x.approvedAt = now; for (const k of ["branch", "commit", "pr"]) if (r[k]) x[k] = r[k]; }
  const going = round && open(t).find((x) => x.id === round.id);
  if (going && r.commit) going.rounds = [...(going.rounds || []), { at: now, ...Object.fromEntries(["branch", "commit", "pr"].filter((k) => r[k]).map((k) => [k, r[k]])) }].slice(-20);
  const removed = items.length ? applyRemovals(t) : 0, carried = r.pr ? prFor(t, repo, r) : 0;
  if (items.length || going || carried) saveTasks(t);
  return { ...r, approved: items.length, ...liveOf(path, repo, r), ...(round ? { round: { id: round.id, text: round.text } } : {}), ...(removed ? { removed } : {}) };
}
// Send again, the review card's retry: what Approves committed in a repo and didn't get
// as far as a PR (sendUnsent), sent now. opts.verify false: not tested here first (the
// tests can't run on this computer, and CI runs them on the PR). The tasks approved with
// it, archived with a commit and no PR, get the PR.
async function sendAgain(repo, opts = {}) {
  forgetReview();
  const pro = can("ship"); if (!pro.ok) return { error: pro.why, pro: true };
  const path = laneMap()[repo]; if (!path) return { error: "Repo not found: " + (repo || "(no repo)") };
  const busy = stillWorking(repo, path); if (busy) return busy;
  const hold = holdShip(path); if (hold.error) return hold;
  let r; try { r = await shipChanges(path, [], { ...opts, repo, sendOnly: true, autoMerge: opts.autoMerge !== undefined ? opts.autoMerge : autoMergeRepos().includes(repo) }); } finally { hold.release(); }
  if (!r.pr) return startFix(path, repo, r);
  const t = loadTasks(), n = prFor(t, repo, r); if (n) saveTasks(t);
  return { ...r, approved: n };
}
// The PR on a repo's archived tasks that went without one, on the branch it was sent
// from (it may have gone up under a fresh name): how many.
function prFor(t, repo, r) {
  let n = 0;
  for (const x of t) if (x.repo === repo && x.archived && x.commit && !x.pr && (x.branch === r.branch || x.branch === r.sentFrom)) { x.pr = r.pr; x.branch = r.branch; x.commit = r.commit; n++; }
  return n;
}
// Forget approved work that didn't go up: the card's "Leave it" (it's sent by hand, or not wanted).
function forgetUnsent(repo) { const path = laneMap()[repo]; if (!path) return { error: "Repo not found: " + (repo || "(no repo)") }; noteUnsent(path, null); const t = loadTasks(); let n = 0; for (const x of t) if (x.repo === repo && x.archived && x.commit && !x.pr && !x.unsentLeft) { x.unsentLeft = true; n++; } if (n) saveTasks(t); forgetReview(); return { ok: true }; }
// Not right: reopen it and untick it in TASKS.md so the agent picks it up again.
function sendBack(id) {
  const t = loadTasks(); const it = t.find((x) => x.id === id); if (!it) return { error: "not found" };
  it.review = false; delete it.reviewAt; saveTasks(t);
  const path = it.repo && laneMap()[it.repo];
  if (path) { const f = join(path, ".symbiot", "TASKS.md"); try { writeFileSync(f, readFileSync(f, "utf8").split("\n").map((l) => /^\s*-\s*\[x\]/i.test(l) && sameTask(l.replace(/^\s*-\s*\[x\]\s*/i, ""), it.text) ? l.replace(/\[x\]/i, "[ ]") : l).join("\n")); } catch {} }
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
  L.push(`Today is ${new Date().toISOString().slice(0, 10)}. Dates inside a task are when it was written: an item dated earlier is from an earlier day, so check it is still current before acting on it.`, "");
  L.push("## Context for an AI agent", `Tasks for the \`${name}\` repo. Get oriented from the signals below before actioning them.`);
  if (ctx.stack) L.push(`- **Stack:** ${ctx.stack}`);
  if (ctx.commits && ctx.commits.length) { L.push("- **Recent commits:**"); for (const c of ctx.commits) L.push(`  - ${c}`); }
  if (ctx.open && ctx.open.length) { L.push("- **Open markers (TODO/FIXME + uncommitted):**"); for (const o of ctx.open) L.push(`  - ${o}`); }
  if (ctx.drift && ctx.drift.length) { L.push("- **Current drift / risk:**"); for (const d of ctx.drift) L.push(`  - ${d}`); }
  if (ctx.connectors) L.push(`- **Connectors:** ${ctx.connectors}`);
  if (ctx.about && ctx.about.length) L.push("", ...ctx.about);
  L.push("", "## Tasks");
  // urgent first, whatever kind it is (a crash fix filed under Docs waited behind 5 tasks, 2026-10-08)
  // t.first: Home moved it to the front (control.mjs)
  const urgent = list.filter((t) => isUrgent(t.text) || t.first); list = list.filter((t) => !urgent.includes(t));
  if (urgent.length) { L.push("### Urgent: do these first", "Stop at a safe point in anything else you're on (your changes stay), do these, then carry on with the rest."); for (const t of urgent) L.push(`- [ ] ${t.text}`); L.push(""); }
  const byType = {}; for (const t of list) { const ty = taskType(t.text); (byType[ty] = byType[ty] || []).push(t); }
  const keys = Object.keys(byType).sort((a, b) => TASK_ORDER.indexOf(a) - TASK_ORDER.indexOf(b));
  for (const ty of keys) { L.push(`### ${ty}`); for (const t of byType[ty]) L.push(`- [ ] ${t.text}`); L.push(""); }
  L.push("## When you finish an item", "- Tick it here (`- [x]`) as soon as it's done — that's how it reaches review. Ticking doesn't archive it: the user approves it in Symbiot, which commits it on a branch and opens a PR.", "- Leave your changes **uncommitted**, and don't tick anything you didn't finish or couldn't verify.", "- If you ever do have to make a branch or a PR yourself, first `git fetch origin`, cut the branch from `origin/<default branch>` (not the local one), run the tests, and open the PR only when they pass and nothing conflicts. If they don't, stop and say so in QUESTIONS.md.", "- If an item has numbered steps (1), 2), …), say `Step N: …` as you start each one, so Home shows how far along you are.", "- An item that runs for days or weeks (a move done step by step) stays unticked until its last step. When a round of it is finished and tested, end your last message with a line `Round done: <the item's first words>`, and Symbiot puts that round up for the user's OK under the item, which stays open.", "- To see Symbiot itself working (its Home, a layout, a card), run a copy of your own: `node index.mjs app --fresh` from this repo, or `symbiot app --fresh`. Never point a browser, a screenshot or a proxy at the user's running Symbiot (127.0.0.1:7391): it's their window and their data.", "- If the user says to drop an item (in ANSWERS.md, say), delete its line here: Symbiot closes it, so it isn't sent again. Don't delete one for any other reason.", "");
  L.push(...handoverRules(ctx.lanes || [], name, ctx.reach), ...HANDBACK, ...standingBrief(), ...doneBrief(name));
  L.push("## If you need a decision, or have ideas", "You may be running unattended, so you can't ask in chat. Write `.symbiot/QUESTIONS.md` instead: Symbiot shows it to the user on your block in its Workdesk, and their answers come back in `.symbiot/ANSWERS.md` (read that first if it exists).",
    "- Before you ask the user anything, read `.symbiot/ANSWERS.md` again, all of it (older answers are in `.symbiot/ANSWERS.archive.md`: search it when one may be older than those): they may have answered it already, for you or for another agent on the same work (Symbiot copies those in, under a heading naming that agent). If an answer there settles it, use it and don't ask; if it settles part, ask only the part left.",
    `- At most ${QUESTIONS_MAX} questions, under a \`## Questions\` heading. Each is a \`### \` heading, then a line of context, then exactly ${OPTIONS_SHOWN} options as \`- \` bullets, the one you recommend first, marked \`(recommended)\`. Symbiot shows only the first ${OPTIONS_SHOWN}; the user can always answer in their own words.`,
    "- Judge the options before you ask. Most people pick the recommended option without weighing the other, and Symbiot works for a whole company (developers, sales, everyone), not one person, so the choice is really yours. Both options must be good routes to the best solution, never filler or one you wouldn't take. A skip or no option is a plain \"skip this part\", never a request for the user's personal details (their addresses, accounts or numbers). Each says in plain words, with no jargon, what it does and what it changes from then on for the project, the people working on it and the company. Recommend the one that's best for, in this order, the company, the people doing the work, then the task's goal. Base that on evidence you can check here (git history, tests, logs, how it's used, the answers so far), not on what's quickest, and give that evidence in the context line in a sentence.",
    "- Write each question for someone who doesn't code: no file names, commands or config names (say what the thing is for), and say in plain words what is being decided, what each option means, and which you recommend and why. If the call is low-risk and easy to undo (a setting that can be re-tuned, a layout, a name, which of two fixes), don't ask: take your recommended option, say what you chose in your last message, and keep it easy to change later.",
    ONLY_YOU,
    ...(userStyleLine() ? ["- Writing to the user (questions, options, your last message): " + userStyleLine()] : []),
    "- A `👤 You:` answer holds the next run back until the user's step is done. If their step changes a file, name the file in backticks (`.env`, `~/.termux/termux.properties`): the next run starts once it changes.",
    "- If a step needs a release that isn't out yet, name its version in the question (\"Once 0.41.0 is installed: …\"). Symbiot shows it next to the installed and npm versions, and holds back an answer that starts \"Done\" until that release is out and installed.",
    `- Ideas, options or follow-ups outside these tasks go under \`## Suggestions\` as \`- \` bullets. The user can add them to their tasks in one click, and often adds every one, so judge them the same way: only ideas you'd recommend, best first, each saying what it changes and why it's worth doing. Symbiot shows them ${IDEAS_SHOWN} at a time. Ideas the user turned down are in \`.symbiot/SKIPPED.md\`: don't suggest them again.`,
    "- An idea for a different project than this one (Symbiot itself, say, the app that sent you this brief) starts with that project's folder name, `- [repo: symbiot] …`, so it goes to that project's tasks instead of this one's.",
    "- Carry on with everything that doesn't depend on an answer, and don't tick an item that does. Ask there rather than doing anything destructive.", "");
  L.push("---", 'To action these, tell your coding agent: "Read `.symbiot/TASKS.md` and implement the unchecked items in this repo, using the context above. Tick each item as you finish it and leave changes uncommitted for review. Confirm with me before anything destructive."');
  return L.join("\n") + "\n";
}
function pushTasks(filter) {
  const byName = laneMap(); // from the already-scanned map when there is one, and Marketing (marketing.mjs)
  // what an approved Drop/Merge named, or an agent deleted from its brief, never goes out again
  const all = loadTasks(); let changed = applyRemovals(all) + applyDrops(all, byName);
  // what an agent ticked since the Tasks tab last looked goes to review first, as
  // syncTasks would: a new brief over TASKS.md would wipe its ticks, and finished
  // work went out again as new tasks (7 of symbiot's, 2026-10-07)
  const ticked = {};
  for (const t of all) {
    if (t.done || t.archived || t.review || !t.repo || !byName[t.repo]) continue;
    if (!(t.repo in ticked)) ticked[t.repo] = completedInRepo(byName[t.repo]);
    if (ticked[t.repo].some((c) => sameTask(c, t.text))) { t.review = true; t.reviewAt = Date.now(); changed++; }
  }
  if (changed) saveTasks(all);
  let tasks = all.filter((t) => !t.done && !t.archived && !t.review);
  if (filter && filter.type) tasks = tasks.filter((t) => taskType(t.text) === filter.type);
  if (filter && filter.repo) tasks = tasks.filter((t) => t.repo === filter.repo);
  { const beside = inflightIds(), skip = new Set((filter && filter.exclude) || []); tasks = tasks.filter((t) => !beside.has(t.id) && !skip.has(t.id)); } // one running beside its lane's agent (parallel.mjs), or peeled off to start there now: not in the lane's own brief
  if (!tasks.length) return { empty: true, written: [], unresolved: [] };
  const groups = {}; for (const t of tasks) { const k = t.repo || ""; (groups[k] = groups[k] || []).push(t); }
  const written = [], unresolved = [], connectors = connectorsLine(); // the same for every repo's run
  let reach = null; try { reach = laneReach(byName); } catch {} // what each lane reaches, for the handover rules
  for (const name of Object.keys(groups)) {
    const list = uniqueTasks(groups[name].map((t) => t.text)).map((text) => ({ text })), path = name && byName[name]; // near-duplicates once
    if (!path || (path === MARKETING_DIR && !ensureMarketing(path))) { unresolved.push({ name: name || "(no repo)", count: list.length }); continue; }
    try {
      // Cheap, per-repo signals only — no full drift scan (that can be very slow
      // on big repos and would block the request).
      const st = repoState(path);
      const commits = gitOut(path, ["log", "--format=%s", "-10"]).split("\n").filter(Boolean);
      const open = openWork([{ path, name }]).slice(0, 12);
      const det = detectRepo({ path, name, recency: 0 });
      const stack = [...det.langs.slice(0, 4), ...det.tools].join(", ");
      // a long task's whole text, where its line links to (addTask)
      for (const t of groups[name].filter((x) => x.full)) { mkdirSync(join(path, ".symbiot", FULL_DIR), { recursive: true }); writeFileSync(join(path, ".symbiot", FULL_DIR, t.id + ".md"), t.full.replace(/\s*$/, "\n")); }
      const risk = [];
      if (st.stale) risk.push("stale checkout — working tree is an old snapshot, not new work");
      if (st.behind) risk.push(`${st.behind} behind upstream on ${st.branch}`);
      if (st.dirty && !st.stale) risk.push(`${st.dirty} uncommitted (${st.mod} mod / ${st.del} del / ${st.add} new)`);
      // held: an agent is still running there, so it lands when that one exits
      // Marketing's brief says what the lane is, the products its tasks name and where they are
      const about = path === MARKETING_DIR ? marketingBrief(list, { map: byName }) : [];
      const held = writeTasks(path, buildTasksMd(name, { branch: st.branch, commits, open, drift: risk, stack, lanes: Object.keys(byName), reach, connectors, about }, list));
      written.push({ name, file: join(path, ".symbiot", "TASKS.md"), path, count: list.length, held });
    } catch (e) { unresolved.push({ name, count: list.length, error: String((e && e.message) || e) }); }
  }
  return { empty: false, written, unresolved, handoff: handoffCmd() };
}

export { holdShip, SHIP_STALE, shipping, shippingPaths, workingChangesAsync, rebaseTask, sendAgain, forgetUnsent, unsentOf, readUnsent, unsentCard, repoTests, localRefused, forgetReview, gitFailed, taskPaths, addTask, toggleTask, setTaskDone, removeTask, cancelTask, restoreTask, FINDING_NOTE, completedInRepo, removalOf, applyRemovals, applyDrops, syncTasks, workingChanges, workingDiff, publishesOnMerge, unreleased, bumpOffer, learnNpm, releaseNeeded, releaseNotIn, withReleases, setVersion, changelogEntry, changelogSection, noteChangelog, releaseInput, shipWithBump, runSummary, saidFinished, pendingReview, commitSubject, shipChanges, autoMergeRepos, setAutoMerge, approveRepo, approveChanges, sendBack, TASK_ORDER, taskType, buildTasksMd, pushTasks, mergeWhenGreen };
