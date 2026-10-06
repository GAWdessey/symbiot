// Tasks, from your list to a merged PR: the checklist (tasks.json), the brief
// each repo gets (.symbiot/TASKS.md), what the agent ticked (review), and
// Approve: branch, commit, push, PR, and the version bump and npm release facts
// it shows.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { VERSION, LATEST_VERSION, REGISTRY, semverGt, loadConfig, saveConfig, loadTasks, saveTasks, taskWords, sameTask, uniqueTasks, sh, hasCmd, repoState } from "./core.mjs";
import { handoverRules, ONLY_YOU } from "./handover.mjs";
import { userStyleLine } from "./adapt.mjs";
import { QUESTIONS_MAX, OPTIONS_SHOWN, IDEAS_SHOWN, handoffCmd, runningHandoff, writeTasks, startHeldTasks, connectorsLine } from "./agents.mjs";
import { gitDefaultBranch } from "./drift.mjs";
import { repoPathMap, openWork, detectRepo } from "./scan.mjs";

// ---- tasks: a persistent checklist (stored by core.mjs) -------------------
// One line (TASKS.md has a task per line, and a tick only matches a whole one),
// long enough for a pasted list of next steps: 300 cut one off mid-list.
function addTask(text, repo) {
  text = String(text || "").replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!text) return { error: "empty" };
  const t = loadTasks();
  // The same task already open in the same repo (in review counts), even in
  // other words (sameTask): that task, not a duplicate. When the new wording has
  // a clause more, the task takes it, unless it's in review (its tick is on the
  // old words). Handed out already, a tick on either wording counts (syncTasks).
  const dup = t.find((x) => !x.done && !x.archived && (x.repo || "") === (repo || "") && sameTask(x.text, text));
  if (dup && !dup.review && taskWords(text).length > taskWords(dup.text).length) { dup.text = text; saveTasks(t); return { ...dup, duplicate: true, reworded: true }; }
  if (dup) return { ...dup, duplicate: true };
  const item = { id: randomBytes(6).toString("hex"), text, repo: repo || "", done: false, ts: Date.now() };
  t.unshift(item); saveTasks(t); return item;
}
function toggleTask(id) { const t = loadTasks(); const it = t.find((x) => x.id === id); if (it) { it.done = !it.done; saveTasks(t); } return it || { error: "not found" }; }
function removeTask(id) { saveTasks(loadTasks().filter((x) => x.id !== id)); return { ok: true }; }
function restoreTask(id) { const t = loadTasks(); const it = t.find((x) => x.id === id); if (it) { it.archived = false; it.done = false; delete it.archivedAt; if (it.removedBy) { it.kept = true; delete it.removedBy; delete it.merged; } saveTasks(t); } return it || { error: "not found" }; }
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
    if (checkedByRepo[x.repo].some((c) => sameTask(c, x.text))) { x.review = true; x.reviewAt = Date.now(); review++; }
  }
  for (const x of t) { if (x.done && !x.archived) { x.archived = true; x.archivedAt = Date.now(); archived++; } }
  const removed = applyRemovals(t);
  saveTasks(t);
  return { review, archived, started, removed };
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
// or one its release couldn't push). { version, patch, minor } or null.
function bumpOffer(path) {
  const ver = (s) => { try { return String(JSON.parse(s).version || ""); } catch { return ""; } };
  const was = ver(git(path, ["show", "HEAD:package.json"]).out), m = was.match(/^(\d+)\.(\d+)\.(\d+)$/); if (!m) return null;
  let now = ""; try { now = ver(readFileSync(join(path, "package.json"), "utf8")); } catch {}
  if (now !== was || !(git(path, ["rev-parse", "-q", "--verify", "refs/tags/v" + was]).ok || onNpm(path))) return null;
  return { version: was, patch: `${m[1]}.${m[2]}.${+m[3] + 1}`, minor: `${m[1]}.${+m[2] + 1}.0` };
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
  return s.length > ENTRY_MAX ? s.slice(0, ENTRY_MAX - 1).replace(/\s+\S*$/, "") + "…" : s;
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
  const files = workingChanges(path).files.map((f) => f.file).filter((f) => !NOT_OWN.test(f));
  const texts = uniqueTasks(items.map((x) => x.text));
  return texts.length || files.length ? { path, texts, files, diff: workingDiff(path, 30000) } : null;
}
// Ship with the version bumped when opts.bump is "patch" or "minor" and the repo
// is offered one (bumpOffer), noted in its CHANGELOG.md if it keeps one (in
// opts.notes' words, when given). Both are put back if the ship fails.
function shipWithBump(path, texts, opts) {
  const offer = (opts.bump === "patch" || opts.bump === "minor") && bumpOffer(path);
  if (!offer) return shipChanges(path, texts, opts);
  const to = offer[opts.bump], files = workingChanges(path).files.map((f) => f.file);
  const undo = setVersion(path, to), undoLog = noteChangelog(path, to, texts, files, opts.notes);
  const r = shipChanges(path, texts, { ...opts, bumped: to });
  if (r.error) { undo(); undoLog(); return r; }
  return { ...r, bumped: to };
}
// What the last run in a folder said when it finished: agent.log after the last
// run's "=== name time ===" and "$ command" lines.
function runSummary(path) {
  let log = ""; try { log = readFileSync(join(path, ".symbiot", "agent.log"), "utf8"); } catch { return ""; }
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
function finishedOffer(path, open) {
  const summary = runSummary(path);
  return uniqueTasks(open.map((x) => x.text)).slice(0, 12).map((text) => { const x = open.find((y) => y.text === text); return { id: x.id, text, finished: saidFinished(summary, text) }; });
}
// Repos with tasks awaiting review, plus repos Symbiot sent tasks to that have
// uncommitted changes no ticked task covers (untasked: approve them as-is, with
// `open`, the repo's open tasks, to tick the ones the run finished).
// running: an agent is still editing there, so its changes may be half done.
function pendingReview() {
  const t = loadTasks(), by = {}; for (const x of t) if (x.review && !x.done && !x.archived) (by[x.repo] = by[x.repo] || []).push(x);
  const sent = [...new Set(t.filter((x) => x.repo && !x.archived && !by[x.repo]).map((x) => x.repo))];
  const map = Object.keys(by).length || sent.length ? repoPathMap() : {};
  const am = autoMergeRepos();
  const out = Object.keys(by).sort().map((repo) => { const path = map[repo] || ""; return { repo, path, tasks: by[repo], autoMerge: am.includes(repo), running: !!(path && runningHandoff(path)), ...(path ? { ...workingChanges(path), unreleased: unreleased(path), bumpOffer: bumpOffer(path), publishesOnMerge: publishesOnMerge(path) } : { branch: "", files: [], stat: "" }) }; });
  for (const repo of sent.sort()) {
    const path = map[repo]; if (!path || !existsSync(join(path, ".symbiot", "TASKS.md"))) continue;
    const wc = workingChanges(path); if (!wc.files.length) continue;
    const open = finishedOffer(path, t.filter((x) => x.repo === repo && !x.done && !x.archived && !x.review));
    out.push({ repo, path, tasks: [], untasked: true, open, autoMerge: am.includes(repo), running: !!runningHandoff(path), ...wc, unreleased: unreleased(path), bumpOffer: bumpOffer(path), publishesOnMerge: publishesOnMerge(path) });
  }
  return out;
}
// Approving while the agent is still editing would commit its half-done work.
const stillWorking = (repo, path) => path && runningHandoff(path) ? { error: `The agent is still working in ${repo}. Approve once it finishes.`, running: true } : null;
const branchSlug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "tasks";
// Whether everything committed on this branch is on the default branch already,
// because an earlier PR from it merged. Squash-merged, main has the same changes
// under a different history, so a new PR from the branch carries them twice and
// can't merge (how #80 got stuck behind #79). Seen two ways: the branch's files
// are main's though main doesn't hold its commits, or GitHub says a PR from it
// merged and nothing was committed on it since. Gives the ref to start the next
// branch from, or "".
function mergedAlready(path, branch, base) {
  const origin = git(path, ["remote", "get-url", "origin"]);
  if (origin.ok) git(path, ["fetch", "-q", "origin", base], 30000); // best effort: main as GitHub has it
  const ref = git(path, ["rev-parse", "-q", "--verify", "refs/remotes/origin/" + base]).ok ? "origin/" + base : base;
  if (!git(path, ["rev-parse", "-q", "--verify", ref]).ok) return "";
  if (!git(path, ["merge-base", "--is-ancestor", "HEAD", ref]).ok && git(path, ["diff", "--quiet", "HEAD", ref, ...NOT_SYMBIOT]).ok) return ref;
  if (!origin.ok || !/github/i.test(origin.out) || !hasCmd("gh")) return "";
  const r = spawnSync("gh", ["pr", "list", "--head", branch, "--state", "merged", "--limit", "1", "--json", "headRefOid"], { cwd: path, encoding: "utf8", timeout: 30000 });
  let head = ""; try { head = String(JSON.parse(r.stdout)[0].headRefOid || ""); } catch {}
  const since = head && git(path, ["rev-list", "--count", head + "..HEAD"]);
  return since && since.ok && since.out === "0" ? ref : "";
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
  return (s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : s) + more;
}
// Sync approved work: off the default branch onto symbiot/<task>, commit the
// working tree (minus .symbiot/), push, and open a PR with gh. On a branch whose
// earlier PR already merged, it starts a fresh symbiot/ branch from the default
// one instead (mergedAlready). Each step that can't happen (no remote, push
// rejected, no gh) stops there and says so — the commit is never lost.
// opts.push=false stops after the commit, opts.pr=false after the push.
function shipChanges(path, texts, opts = {}) {
  const ch = workingChanges(path);
  if (!ch.files.length) return { ok: true, nothing: true, note: "No uncommitted changes — approved without a commit." };
  if (!ch.branch || ch.branch === "HEAD") return { error: "Detached HEAD — check out a branch first." };
  const base = gitDefaultBranch(path), day = new Date().toISOString().slice(0, 10); let branch = ch.branch, fresh = "";
  const newBranch = () => {
    const stem = "symbiot/" + branchSlug(!texts.length ? `changes-${day}` : texts.length === 1 ? texts[0] : `${texts.length}-tasks-${day}`);
    let b = stem; for (let i = 2; git(path, ["rev-parse", "--verify", "-q", "refs/heads/" + b]).ok; i++) b = `${stem}-${i}`;
    return b;
  };
  if (branch === base) {
    branch = newBranch();
    const sw = git(path, ["switch", "-c", branch]); if (!sw.ok) return { error: "Could not create branch: " + sw.err };
  } else {
    const from = mergedAlready(path, branch, base);
    if (from) {
      // The changes come along; if main changed a file they touch, git refuses and they stay put.
      const next = newBranch(), sw = git(path, ["switch", "-c", next, "--no-track", from]);
      fresh = sw.ok ? `${branch}'s earlier PR already merged, so this starts a fresh branch from ${from}.`
        : `${branch}'s earlier PR already merged, but these changes couldn't move to a fresh branch from ${from} (${sw.err.split("\n")[0]}), so they're on ${branch}, and its PR may not merge.`;
      if (sw.ok) branch = next;
    }
  }
  // Stage everything, then drop .symbiot. A `. :(exclude).symbiot` pathspec
  // warns+exits-1 once .symbiot is gitignored ("paths are ignored, use -f"),
  // which falsely aborted the ship. `add -A` skips gitignored paths silently;
  // the reset also covers repos where .symbiot isn't ignored.
  const add = git(path, ["add", "-A"]); if (!add.ok) return { error: "git add failed: " + add.err, branch };
  git(path, ["reset", "-q", "--", ".symbiot"]); // never ship Symbiot's own scratch
  const subject = commitSubject(texts);
  const body = (texts.length ? texts.map((x) => "- " + x).join("\n") : "No ticked task covers these changes.") + (opts.bumped ? `\n\nBumps the version to ${opts.bumped}. ` + (publishesOnMerge(path) ? `It publishes to npm when this merges.` : `After this merges, tag v${opts.bumped} on ${base} to release it.`) : "");
  const cm = git(path, ["commit", "-m", subject, "-m", body]); if (!cm.ok) return { error: "Commit failed: " + (cm.err || cm.out), branch };
  const out = { ok: true, branch, base, commit: git(path, ["rev-parse", "--short", "HEAD"]).out, subject, ...(fresh ? { note: fresh } : {}) };
  const noted = (note) => ({ ...out, note: (fresh ? fresh + " " : "") + note });
  if (opts.push === false) return out;
  if (!git(path, ["remote", "get-url", "origin"]).ok) return noted("No origin remote — committed locally.");
  const ps = git(path, ["push", "-u", "origin", branch], 120000);
  if (!ps.ok) return noted("Committed, but the push failed: " + (ps.err.split("\n").filter(Boolean).pop() || "unknown error"));
  out.pushed = true;
  if (opts.pr === false) return out;
  if (!hasCmd("gh")) return noted("Pushed. Install the GitHub CLI (gh) to open the PR automatically.");
  const gh = (args) => spawnSync("gh", args, { cwd: path, encoding: "utf8", timeout: 60000 });
  const pr = gh(["pr", "create", "--head", branch, "--base", base, "--title", subject, "--body", body + "\n\nApproved in Symbiot."]);
  const url = (String(pr.stdout || "").match(/https?:\/\/\S+/) || [])[0] || String(gh(["pr", "view", branch, "--json", "url", "-q", ".url"]).stdout || "").trim();
  if (!url) return noted("Pushed, but gh couldn't open the PR: " + String(pr.stderr || "").trim().split("\n").pop());
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
  const r = shipWithBump(path, uniqueTasks(items.map((x) => x.text)), { ...opts, autoMerge: opts.autoMerge !== undefined ? opts.autoMerge : autoMergeRepos().includes(repo) });
  if (r.error) return r;
  const now = Date.now();
  for (const x of items) { x.review = false; x.done = true; x.archived = true; x.archivedAt = now; x.approvedAt = now; for (const k of ["branch", "commit", "pr"]) if (r[k]) x[k] = r[k]; }
  const removed = applyRemovals(t);
  saveTasks(t);
  return { ...r, approved: items.length, ...(removed ? { removed } : {}) };
}
// "Approve changes without a task": ship the uncommitted changes even though no
// ticked task is behind them (a fix the agent made but didn't tick). If tasks are
// awaiting review in the repo, this is just Approve. opts.tick: ids of the
// repo's open tasks the changes finished (the run didn't tick them): they're
// approved with the changes, as Approve does, so they don't go out again.
function approveChanges(repo, opts = {}) {
  if (loadTasks().some((x) => x.repo === repo && x.review && !x.done && !x.archived)) return approveRepo(repo, opts);
  const path = repoPathMap()[repo]; if (!path) return { error: "Repo not found: " + (repo || "(no repo)") };
  const busy = stillWorking(repo, path); if (busy) return busy;
  if (!workingChanges(path).files.length) return { error: "No uncommitted changes in " + repo + "." };
  const ids = new Set(Array.isArray(opts.tick) ? opts.tick.map(String) : []);
  const ticked = (t) => t.filter((x) => ids.has(x.id) && x.repo === repo && !x.done && !x.archived && !x.review);
  const r = shipWithBump(path, uniqueTasks(ticked(loadTasks()).map((x) => x.text)), { ...opts, autoMerge: opts.autoMerge !== undefined ? opts.autoMerge : autoMergeRepos().includes(repo) });
  if (r.error) return r;
  // read again: the ship took a while, and the list may have changed meanwhile
  const t = loadTasks(), items = ticked(t), now = Date.now();
  for (const x of items) { x.done = true; x.archived = true; x.archivedAt = now; x.approvedAt = now; for (const k of ["branch", "commit", "pr"]) if (r[k]) x[k] = r[k]; }
  const removed = items.length ? applyRemovals(t) : 0;
  if (items.length) saveTasks(t);
  return { ...r, approved: items.length, ...(removed ? { removed } : {}) };
}
// Not right: reopen it and untick it in TASKS.md so the agent picks it up again.
function sendBack(id) {
  const t = loadTasks(); const it = t.find((x) => x.id === id); if (!it) return { error: "not found" };
  it.review = false; delete it.reviewAt; saveTasks(t);
  const path = it.repo && repoPathMap()[it.repo];
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
  L.push("## Context for an AI agent", `Tasks for the \`${name}\` repo. Get oriented from the signals below before actioning them.`);
  if (ctx.stack) L.push(`- **Stack:** ${ctx.stack}`);
  if (ctx.commits && ctx.commits.length) { L.push("- **Recent commits:**"); for (const c of ctx.commits) L.push(`  - ${c}`); }
  if (ctx.open && ctx.open.length) { L.push("- **Open markers (TODO/FIXME + uncommitted):**"); for (const o of ctx.open) L.push(`  - ${o}`); }
  if (ctx.drift && ctx.drift.length) { L.push("- **Current drift / risk:**"); for (const d of ctx.drift) L.push(`  - ${d}`); }
  if (ctx.connectors) L.push(`- **Connectors:** ${ctx.connectors}`);
  L.push("", "## Tasks");
  const byType = {}; for (const t of list) { const ty = taskType(t.text); (byType[ty] = byType[ty] || []).push(t); }
  const keys = Object.keys(byType).sort((a, b) => TASK_ORDER.indexOf(a) - TASK_ORDER.indexOf(b));
  for (const ty of keys) { L.push(`### ${ty}`); for (const t of byType[ty]) L.push(`- [ ] ${t.text}`); L.push(""); }
  L.push("## When you finish an item", "- Tick it here (`- [x]`) as soon as it's done — that's how it reaches review. Ticking doesn't archive it: the user approves it in Symbiot, which commits it on a branch and opens a PR.", "- Leave your changes **uncommitted**, and don't tick anything you didn't finish or couldn't verify.", "");
  L.push(...handoverRules(ctx.lanes || [], name));
  L.push("## If you need a decision, or have ideas", "You may be running unattended, so you can't ask in chat. Write `.symbiot/QUESTIONS.md` instead: Symbiot shows it to the user on your block in its Agents tab, and their answers come back in `.symbiot/ANSWERS.md` (read that first if it exists).",
    `- At most ${QUESTIONS_MAX} questions, under a \`## Questions\` heading. Each is a \`### \` heading, then a line of context, then exactly ${OPTIONS_SHOWN} options as \`- \` bullets, the one you recommend first, marked \`(recommended)\`. Symbiot shows only the first ${OPTIONS_SHOWN}; the user can always answer in their own words.`,
    "- Judge the options before you ask. Most people pick the recommended option without weighing the other, and Symbiot works for a whole company (developers, sales, everyone), not one person, so the choice is really yours. Both options must be good routes to the best solution, never filler or one you wouldn't take. Each says in plain words, with no jargon, what it does and what it changes from then on for the project, the people working on it and the company. Recommend the one that's best for, in this order, the company, the people doing the work, then the task's goal. Base that on evidence you can check here (git history, tests, logs, how it's used, the answers so far), not on what's quickest, and give that evidence in the context line in a sentence.",
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
  const all = loadTasks(); if (applyRemovals(all)) saveTasks(all); // what an approved Drop/Merge named never goes out again
  let tasks = all.filter((t) => !t.done && !t.archived && !t.review);
  if (filter && filter.type) tasks = tasks.filter((t) => taskType(t.text) === filter.type);
  if (filter && filter.repo) tasks = tasks.filter((t) => t.repo === filter.repo);
  if (!tasks.length) return { empty: true, written: [], unresolved: [] };
  const byName = repoPathMap(); // from the already-scanned map when there is one
  const groups = {}; for (const t of tasks) { const k = t.repo || ""; (groups[k] = groups[k] || []).push(t); }
  const written = [], unresolved = [], connectors = connectorsLine(); // the same for every repo's run
  for (const name of Object.keys(groups)) {
    const list = uniqueTasks(groups[name].map((t) => t.text)).map((text) => ({ text })), path = name && byName[name]; // near-duplicates once
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
      const held = writeTasks(path, buildTasksMd(name, { branch: st.branch, commits, open, drift: risk, stack, lanes: Object.keys(byName), connectors }, list));
      written.push({ name, file: join(path, ".symbiot", "TASKS.md"), path, count: list.length, held });
    } catch (e) { unresolved.push({ name, count: list.length, error: String((e && e.message) || e) }); }
  }
  return { empty: false, written, unresolved, handoff: handoffCmd() };
}

export { addTask, toggleTask, removeTask, restoreTask, completedInRepo, removalOf, applyRemovals, syncTasks, workingChanges, workingDiff, publishesOnMerge, unreleased, bumpOffer, learnNpm, releaseNeeded, withReleases, setVersion, changelogEntry, changelogSection, noteChangelog, releaseInput, shipWithBump, runSummary, saidFinished, pendingReview, commitSubject, shipChanges, autoMergeRepos, setAutoMerge, approveRepo, approveChanges, sendBack, TASK_ORDER, taskType, buildTasksMd, pushTasks };
