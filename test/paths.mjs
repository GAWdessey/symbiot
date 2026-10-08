// Core paths every release now ships through on its own (auto-publish on
// merge), each in a throwaway HOME and git identity, against repos built here:
//   1. SCAN: which repos are found, from which folders (scan folders, --dir,
//      the defaults), and that Week, Todo and the Map share one repo set.
//   2. WRITE-UPS: week / standup / todo through the real CLI, with the AI
//      stubbed by a fake Ollama server, asserting on the prompt it was sent
//      (which commits, whose, which window) and that its answer is printed, with
//      Standup's count of what Watch found under it.
//   3. TASKS: tasks.json <-> .symbiot/TASKS.md, round and round: push, a tick
//      by you (auto-archive, restore), a tick by the agent (review), send back,
//      approve.
// The fixes in #45, #51, #52, #54 and #68 were all in these paths.
//
//   node test/paths.mjs
//
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { commitSubject } from "../tasks.mjs";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = join(PKG, "index.mjs");
const ROOT = mkdtempSync(join(tmpdir(), "symbiot-paths-"));
const HOME = join(ROOT, "home"), WORK = join(ROOT, "work"), ELSEWHERE = join(ROOT, "elsewhere");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 900) : "")); } };

// You are Pat; Sam is someone else committing to the same repos.
const GITCONFIG = join(ROOT, "gitconfig");
writeFileSync(GITCONFIG, "[user]\n  name = Pat Example\n  email = pat@example.com\n[init]\n  defaultBranch = main\n");
const env = { ...process.env, HOME, USERPROFILE: HOME, GIT_CONFIG_GLOBAL: GITCONFIG, GIT_CONFIG_SYSTEM: "/dev/null", GIT_TERMINAL_PROMPT: "0", SYMBIOT_NO_OPEN: "1" };
for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "SYMBIOT_MODEL", "SYMBIOT_SCAN_HOME", "PREFIX"]) delete env[k];
const git = (dir, args, extra = {}) => execFileSync("git", ["-C", dir, ...args], { env: { ...env, ...extra }, encoding: "utf8" }).trim();
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
// a repo with commits: [file, content, subject, daysAgo, author?]
function repo(dir, commits) {
  mkdirSync(dir, { recursive: true }); git(dir, ["init", "-q"]);
  for (const [file, content, subject, days, who] of commits) {
    mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), content);
    git(dir, ["add", "-A"]);
    const [name, email] = who || ["Pat Example", "pat@example.com"];
    git(dir, ["-c", `user.name=${name}`, "-c", `user.email=${email}`, "commit", "-qm", subject], { GIT_AUTHOR_DATE: ago(days), GIT_COMMITTER_DATE: ago(days) });
  }
  return dir;
}
const SAM = ["Sam Other", "sam@other.example"];
const config = (cfg, home = HOME) => { mkdirSync(join(home, ".config", "symbiot"), { recursive: true }); writeFileSync(join(home, ".config", "symbiot", "config.json"), JSON.stringify(cfg)); };
// Run module code in a child with this HOME (the config path is fixed at import); its last line is JSON.
function inChild(code, home = HOME) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: PKG, encoding: "utf8", timeout: 120000, env: { ...env, HOME: home, USERPROFILE: home } });
  try { return JSON.parse(r.stdout.trim().split("\n").pop()); } catch { console.log(r.stdout, r.stderr); return {}; }
}
const mod = (f) => JSON.stringify(join(PKG, f));

// The AI, stubbed: a fake Ollama that keeps what it was asked and answers.
const asked = [];
const ollama = createServer((req, res) => {
  let body = ""; req.on("data", (d) => { body += d; });
  req.on("end", () => {
    let j = {}; try { j = JSON.parse(body || "{}"); } catch {}
    const msgs = j.messages || [];
    asked.push({ path: req.url, model: j.model, system: (msgs[0] || {}).content || "", prompt: (msgs[1] || {}).content || "" });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: { content: `STUB REPLY ${asked.length}` } }));
  });
});
await new Promise((r) => ollama.listen(0, "127.0.0.1", r));
const AI = { provider: "ollama", ollama: { baseUrl: `http://127.0.0.1:${ollama.address().port}`, model: "stub-model" } };

try {
  // ---- the repos ----------------------------------------------------------------
  const alpha = repo(join(WORK, "alpha"), [
    ["README.md", "# alpha\n", "alpha: start", 20],
    ["src/old.js", "1\n", "alpha: tidy the build", 5],
    ["src/login.js", "export const login = 1;\n// TODO: handle expired tokens\n", "alpha: add login", 0.05],
  ]);
  const beta = repo(join(WORK, "beta"), [
    ["b.js", "1\n", "beta: my change", 1],
    ["c.js", "2\n", "beta: sam's change", 1, SAM],
  ]);
  writeFileSync(join(beta, "wip.txt"), "half done\n"); // uncommitted work
  repo(join(WORK, "old"), [["o.js", "1\n", "old: long ago", 30]]);
  mkdirSync(join(WORK, "empty")); git(join(WORK, "empty"), ["init", "-q"]); // no commits: not a repo you work on
  repo(join(WORK, "app", "node_modules", "dep"), [["d.js", "1\n", "dep: vendored", 0.1]]); // under node_modules: never scanned
  mkdirSync(join(WORK, "notes")); writeFileSync(join(WORK, "notes", "package.json"), '{"name":"notes"}\n'); // a project folder, no git
  repo(join(ELSEWHERE, "gamma"), [["g.py", "1\n", "gamma: elsewhere", 0.1]]);
  const solo = repo(join(ROOT, "samonly", "solo"), [["s.js", "1\n", "solo: sam did this", 0.5, SAM]]);

  console.log("SCAN — which repos, from which folders");
  config({ scanRoots: [WORK, join(ROOT, "gone")] });
  const s1 = inChild(`
    import * as s from ${mod("scan.mjs")};
    const out = { roots: s.scanRoots(), found: s.findAllRepos().map((r) => r.name), before: s.discoveredRepos().map((r) => r.name) };
    const map = await s.buildMap();
    out.mapRepos = map.nodes.filter((n) => n.type === "repo").map((n) => n.label).sort();
    out.mapFolders = map.nodes.filter((n) => n.type === "folder").map((n) => n.label);
    out.after = s.discoveredRepos().map((r) => r.name).sort();
    out.paths = s.repoPathMap();
    out.stats = map.stats;
    s.setScanOptions({ dir: ${JSON.stringify(ELSEWHERE)} });
    out.dirRoots = s.scanRoots(); out.dirBase = s.scanBase(); out.dirFound = s.findAllRepos().map((r) => r.name);
    console.log(JSON.stringify(out));`);
  ok("scan folders from config, minus one that no longer exists", JSON.stringify(s1.roots) === JSON.stringify([WORK]), s1.roots);
  ok("finds the repos you commit to, newest first: no empty repo, nothing under node_modules, nothing outside the folders", (s1.found || []).join() === "alpha,beta,old", s1.found);
  ok("the Map shows the same repos, plus the project folder without git", (s1.mapRepos || []).join() === "alpha,beta,old" && (s1.mapFolders || []).join() === "notes" && s1.stats.repos === 3, [s1.mapRepos, s1.mapFolders]);
  ok("Week / Standup / Todo use that same set, before and after the Map has scanned", (s1.before || []).join() === "alpha,beta,old" && (s1.after || []).join() === "alpha,beta,old", [s1.before, s1.after]);
  ok("a task's repo name finds its folder (repos and project folders)", s1.paths && s1.paths.alpha === alpha && s1.paths.notes === join(WORK, "notes"), s1.paths);
  ok("--dir scans just that folder, and reports it as the base", JSON.stringify(s1.dirRoots) === JSON.stringify([ELSEWHERE]) && s1.dirBase === ELSEWHERE && (s1.dirFound || []).join() === "gamma", [s1.dirRoots, s1.dirFound]);

  const home2 = join(ROOT, "home2"); mkdirSync(home2, { recursive: true });
  const s2 = inChild(`
    import * as s from ${mod("scan.mjs")};
    import { readFileSync } from "node:fs";
    const cfg = () => JSON.parse(readFileSync(${JSON.stringify(join(home2, ".config", "symbiot", "config.json"))}, "utf8")).scanRoots;
    const out = { defaults: s.scanRoots() };
    out.added = s.addScanRoot(${JSON.stringify(ELSEWHERE)}).roots; out.saved = cfg();
    out.missing = s.addScanRoot(${JSON.stringify(join(ROOT, "nope"))});
    out.removed = s.removeScanRoot(${JSON.stringify(home2)}).roots;
    out.found = s.findAllRepos().map((r) => r.name);
    out.cleared = s.removeScanRoot(${JSON.stringify(ELSEWHERE)}).roots; out.back = s.scanRoots();
    console.log(JSON.stringify(out));`, home2);
  ok("no folders picked: your home folder", JSON.stringify(s2.defaults) === JSON.stringify([home2]), s2.defaults);
  ok("adding the first folder keeps home in the list, and saves it", JSON.stringify(s2.added) === JSON.stringify([home2, ELSEWHERE]) && JSON.stringify(s2.saved) === JSON.stringify(s2.added), s2.added);
  ok("a folder that doesn't exist isn't added", /not found/.test((s2.missing || {}).error || ""), s2.missing);
  ok("remove home and only the other folder is scanned", JSON.stringify(s2.removed) === JSON.stringify([ELSEWHERE]) && (s2.found || []).join() === "gamma", [s2.removed, s2.found]);
  ok("remove the last one and it's back to home", (s2.cleared || []).length === 0 && JSON.stringify(s2.back) === JSON.stringify([home2]), s2);

  console.log("WRITE-UPS — week, standup and todo, with the AI stubbed");
  config({ ...AI, scanRoots: [WORK] });
  // async: the stub AI answers from this process, so it mustn't block on the CLI
  const cli = (args, home = HOME) => new Promise((resolve) => {
    const ch = spawn(process.execPath, [INDEX, ...args, "--plain"], { env: { ...env, HOME: home, USERPROFILE: home }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = ""; ch.stdout.on("data", (d) => { stdout += d; }); ch.stderr.on("data", (d) => { stderr += d; });
    const t = setTimeout(() => ch.kill("SIGKILL"), 120000);
    ch.on("close", (status) => { clearTimeout(t); resolve({ stdout, stderr, status }); });
  });
  const run = async (args) => { const n = asked.length, r = await cli(args); return { out: r.stdout, err: r.stderr, status: r.status, q: asked[n] || {}, calls: asked.length - n }; };

  const wk = await run(["week"]);
  ok("week: one call to the AI, whose answer is printed with the footer", wk.status === 0 && wk.calls === 1 && wk.q.path === "/api/chat" && wk.q.model === "stub-model" && /STUB REPLY/.test(wk.out), { status: wk.status, out: wk.out, err: wk.err });
  ok("week: your commits in the last 7 days from the repos active in it", /\[alpha\] alpha: add login/.test(wk.q.prompt) && /\[alpha\] alpha: tidy the build/.test(wk.q.prompt) && /\[beta\] beta: my change/.test(wk.q.prompt), wk.q.prompt);
  ok("week: not Sam's commits, not older ones, not a repo with nothing this week", !/sam's change/.test(wk.q.prompt) && !/alpha: start/.test(wk.q.prompt) && !/old: long ago/.test(wk.q.prompt), wk.q.prompt);
  ok("week: written as you, from the window, with what's open (TODO and uncommitted)", /Person: Pat Example\. Window: last 7 days/.test(wk.q.prompt) && /handle expired tokens \(src\/login\.js:2\)/.test(wk.q.prompt) && /beta: 1 uncommitted/.test(wk.q.prompt) && /first-person/.test(wk.q.system) && /no invented work/.test(wk.q.system), wk.q.prompt);
  ok("week: the footer says it used the Map's repo set: 3 repos, 2 active", /3 repos \(same as the Map\) · 2 active · 3 commits in last 7d/.test(wk.out), wk.out);
  const wk25 = await run(["week", "--since", "25"]);
  ok("week --since 25 reaches the older commit", /alpha: start/.test(wk25.q.prompt) && /last 25 days/.test(wk25.q.prompt), wk25.q.prompt);
  const all = await run(["week", "--all"]);
  ok("week --all takes everyone's commits", /sam's change/.test(all.q.prompt), all.q.prompt);
  const su = await run(["standup"]);
  ok("standup: since yesterday, short, without the 5-day-old commit or open work", /Window: since yesterday/.test(su.q.prompt) && /alpha: add login/.test(su.q.prompt) && !/tidy the build/.test(su.q.prompt) && !/Open \/ in progress/.test(su.q.prompt) && /3-5 bullets/.test(su.q.system), su.q.prompt);
  // what Watch found since yesterday: counted under the standup, not by the AI
  const WJ = join(HOME, ".config", "symbiot", "watch.json"), now = Date.now();
  writeFileSync(WJ, JSON.stringify({
    watches: [{ id: "m", name: "Inbox - pat@example.com", url: "https://mail.google.com/mail/u/0/#inbox" }, { id: "g", name: "GitHub notifications", url: "https://github.com/notifications" }, { id: "j", name: "Jira", url: "https://jira.example.com/board" }],
    news: [
      { id: "1", watch: "m", name: "Inbox", ts: now - 3600000, text: "Sam Ng, Contract signed" }, { id: "2", watch: "m", name: "Inbox", ts: now - 7200000, text: "Ann, Lunch?" },
      { id: "3", watch: "m", name: "Inbox", ts: now - 7200000, text: "Bob, Invoice" }, { id: "4", watch: "g", name: "GitHub notifications", ts: now - 600000, text: "Review requested · pat/alpha · Add login" },
      { id: "5", watch: "j", name: "Jira", ts: now - 600000, text: "ABC-1 assigned to you" }, { id: "6", watch: "m", name: "Inbox", ts: now - 3 * 86400000, text: "Old, From last week" },
    ] }));
  const suw = await run(["standup"]);
  ok("standup: counts what's waiting on you under it, from Watch since yesterday (not last week's)", /STUB REPLY \d+\n\nWaiting on you: 3 emails, 1 GitHub notification, 1 new on Jira/.test(suw.out) && /Waiting on me \(new since yesterday\):\n- 3 emails:\n  - Sam Ng, Contract signed/.test(suw.q.prompt) && !/From last week/.test(suw.q.prompt) && /don't list or count it/.test(suw.q.system), { out: suw.out, prompt: suw.q.prompt });
  const wkw = await run(["week"]);
  ok("week: leaves what's waiting to Standup", !/Waiting on/.test(wkw.out) && !/Waiting on me/.test(wkw.q.prompt), wkw.out);
  rmSync(WJ);
  const td = await run(["todo"]);
  ok("todo: the TODO markers and uncommitted work, not commits", /^Open work:/.test(td.q.prompt) && /alpha: TODO: handle expired tokens \(src\/login\.js:2\)/.test(td.q.prompt) && /beta: 1 uncommitted \(0 mod \/ 0 del \/ 1 new\) on main/.test(td.q.prompt) && !/add login/.test(td.q.prompt) && /still on a developer's plate/.test(td.q.system) && /STUB REPLY/.test(td.out), td.q.prompt);
  const solo1 = await run(["week", "--dir", dirname(solo)]);
  ok("a repo with only others' commits this week: it falls back to everyone's, not to nothing", /solo: sam did this/.test(solo1.q.prompt) && /1 repos \(same as the Map\) · 1 active/.test(solo1.out), { prompt: solo1.q.prompt, out: solo1.out });
  const quiet = await run(["week", "--dir", join(WORK, "old")]);
  ok("nothing in the window: says so, and doesn't call the AI", quiet.calls === 0 && /No commits in the last 7 days across your 1 repos/.test(quiet.out), quiet.out);
  const home3 = join(ROOT, "home3"); config({ scanRoots: [WORK] }, home3);
  const n0 = asked.length, off = await cli(["week"], home3);
  ok("no AI connected: how to connect one, and no call", asked.length === n0 && /symbiot login/.test(off.stdout), off.stdout);

  console.log("TASKS — tasks.json and each repo's TASKS.md, round trip");
  config({ scanRoots: [WORK] });
  const T = JSON.stringify(join(HOME, ".config", "symbiot", "tasks.json"));
  const tk = inChild(`
    import * as t from ${mod("tasks.mjs")};
    import { readFileSync, writeFileSync } from "node:fs";
    const md = (r) => readFileSync(${JSON.stringify(WORK)} + "/" + r + "/.symbiot/TASKS.md", "utf8");
    const all = () => JSON.parse(readFileSync(${T}, "utf8"));
    const by = (text) => all().find((x) => x.text === text);
    const out = {};
    const fix = t.addTask("Fix the login bug", "alpha");
    out.multi = t.addTask("Write the docs\\n  for beta", "beta").text;
    t.addTask("A task for a repo that isn't here", "nowhere");
    out.push = t.pushTasks(); out.alpha = md("alpha"); out.beta = md("beta");
    // you tick one yourself: done, and archived on the next sync
    t.toggleTask(fix.id); out.sync1 = t.syncTasks(); out.ticked = by("Fix the login bug");
    out.restored = t.restoreTask(fix.id);
    // the agent ticks one in TASKS.md (any case): awaiting your review, not archived
    writeFileSync(${JSON.stringify(join(WORK, "beta", ".symbiot", "TASKS.md"))}, md("beta").replace("- [ ] Write the docs for beta", "- [X] write the docs for BETA"));
    out.sync2 = t.syncTasks(); out.review = by("Write the docs for beta");
    out.repush = t.pushTasks(); out.betaAfter = md("beta"); out.alphaAfter = md("alpha");
    out.pending = t.pendingReview().map((r) => ({ repo: r.repo, tasks: r.tasks.map((x) => x.text), files: r.files.map((f) => f.file) }));
    // not right: back to the agent, unticked
    t.sendBack(out.review.id); out.back = by("Write the docs for beta"); out.betaBack = md("beta");
    // ticked again and approved: committed, then archived with its commit
    writeFileSync(${JSON.stringify(join(WORK, "beta", ".symbiot", "TASKS.md"))}, md("beta").replace("- [ ] write the docs for BETA", "- [x] write the docs for BETA"));
    t.syncTasks(); out.approve = await t.approveRepo("beta", { push: false }); out.final = by("Write the docs for beta");
    out.open = all().filter((x) => !x.archived).map((x) => x.text).sort(); out.archived = all().filter((x) => x.archived).map((x) => x.text);
    console.log(JSON.stringify(out));`);
  const pushed = tk.push || {};
  ok("a task is one line, whatever was pasted", tk.multi === "Write the docs for beta", tk.multi);
  ok("push writes each repo's TASKS.md, and names a repo it can't find", (pushed.written || []).map((w) => w.name).sort().join() === "alpha,beta" && (pushed.unresolved || []).map((u) => u.name).join() === "nowhere", pushed);
  ok("each brief: its tasks, grouped by kind, with the repo's context", /### Fixes\n- \[ \] Fix the login bug/.test(tk.alpha || "") && /### Docs\n- \[ \] Write the docs for beta/.test(tk.beta || "") && /alpha: add login/.test(tk.alpha || "") && /\*\*Stack:\*\* JavaScript/.test(tk.alpha || ""), tk.alpha);
  ok("a task you tick is archived on the next sync, not sent for review", tk.sync1 && tk.sync1.archived === 1 && tk.ticked.archived && tk.ticked.done && tk.ticked.archivedAt > 0 && !tk.ticked.review, tk.ticked);
  ok("restore brings it back open", tk.restored && !tk.restored.archived && !tk.restored.done && !("archivedAt" in tk.restored), tk.restored);
  ok("the agent's tick (in any case) puts it in review, not the archive", tk.sync2 && tk.sync2.review === 1 && tk.sync2.archived === 0 && tk.review.review && !tk.review.done && !tk.review.archived, [tk.sync2, tk.review]);
  ok("pushing again re-sends what's open, leaves the one in review and its tick alone", /- \[ \] Fix the login bug/.test(tk.alphaAfter || "") && (tk.repush.written || []).map((w) => w.name).join() === "alpha" && /- \[X\] write the docs for BETA/.test(tk.betaAfter || ""), [tk.repush, tk.betaAfter]);
  ok("review lists it with the repo's uncommitted changes", JSON.stringify(tk.pending) === JSON.stringify([{ repo: "beta", tasks: ["Write the docs for beta"], files: ["wip.txt"] }]), tk.pending);
  ok("send back: open again, and unticked in TASKS.md", tk.back && !tk.back.review && !tk.back.done && /- \[ \] write the docs for BETA/.test(tk.betaBack || ""), [tk.back, tk.betaBack]);
  const subj = tk.approve && tk.approve.commit ? git(beta, ["log", "-1", "--format=%s%n%b", tk.approve.commit]) : "";
  ok("approve commits the change on its own branch, then archives the task with that commit", tk.approve && tk.approve.ok && /^symbiot\/write-the-docs-for-beta/.test(tk.approve.branch) && tk.final.archived && tk.final.done && tk.final.commit === tk.approve.commit && tk.final.approvedAt > 0 && /^Write the docs for beta\n- Write the docs for beta/.test(subj), [tk.approve, subj]);
  ok("tasks.json ends with the right ones open and archived", (tk.open || []).join("|") === "A task for a repo that isn't here|Fix the login bug" && (tk.archived || []).join() === "Write the docs for beta", [tk.open, tk.archived]);

  console.log("TASKS — a task the agent deleted from TASKS.md is closed, not sent again");
  const dr = inChild(`
    import * as t from ${mod("tasks.mjs")};
    import { readFileSync, writeFileSync } from "node:fs";
    const f = ${JSON.stringify(join(WORK, "alpha", ".symbiot", "TASKS.md"))}, md = () => readFileSync(f, "utf8");
    const by = (text) => JSON.parse(readFileSync(${T}, "utf8")).find((x) => x.text === text);
    const out = {}, pod = "Run \`cd ios && pod install\` before the next iOS build";
    t.addTask(pod, "alpha"); t.pushTasks(); out.sent = md().includes(pod);
    // the user said to drop it: the agent deletes its line, and ticks nothing
    writeFileSync(f, md().replace("- [ ] " + pod + "\\n", ""));
    out.push = t.pushTasks(); out.after = md(); out.task = by(pod);
    out.sync = t.syncTasks();
    out.restored = t.restoreTask(out.task.id); out.sync2 = t.syncTasks(); out.kept = by(pod);
    t.pushTasks(); out.back = md().includes(pod);
    // an emptied TASKS.md deleted nothing
    writeFileSync(f, ""); out.sync3 = t.syncTasks();
    console.log(JSON.stringify(out));`);
  ok("the next send leaves out a task the agent deleted, and archives it as dropped", dr.sent && !(dr.after || "").includes("pod install") && /- \[ \] Fix the login bug/.test(dr.after || "") && dr.task && dr.task.archived && dr.task.done && dr.task.dropped, [dr.after, dr.task]);
  ok("a sync after that drops nothing more", dr.sync && dr.sync.dropped === 0, dr.sync);
  ok("restored, it stays open and goes out again", dr.kept && !dr.kept.archived && dr.kept.kept && !dr.kept.dropped && dr.sync2.dropped === 0 && dr.back, [dr.kept, dr.sync2, dr.back]);
  ok("an emptied TASKS.md closes nothing", dr.sync3 && dr.sync3.dropped === 0, dr.sync3);

  console.log("COMMIT TRAIL — an approved batch's subject says what it did");
  ok("one task: the task", commitSubject(["Fix the login bug"]) === "Fix the login bug", commitSubject(["Fix the login bug"]));
  ok("several: the first, and how many more (not 'symbiot: 3 approved tasks')", commitSubject(["Fix the login bug", "Add a test", "Docs"]) === "Fix the login bug (+2 more)", commitSubject(["Fix the login bug", "Add a test", "Docs"]));
  const long = commitSubject(["## Next steps  1. **Add the `v*` tag-protection rule from #71.** #77 and #78 made publishing hands-off", "b"]);
  ok("pasted markdown is dropped and it fits 72 characters, cut at a word", long === "Next steps 1. Add the `v*` tag-protection rule from #71. #77… (+1 more)" && long.length <= 72, long);
  ok("no task: says so", commitSubject([]) === "symbiot: changes approved without a task", commitSubject([]));
} finally {
  ollama.close();
  rmSync(ROOT, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} paths: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
