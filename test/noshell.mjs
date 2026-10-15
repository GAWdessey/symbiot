// A folder, branch or author email is only a name, never a command: the scan, drift
// and write-up git calls used to go through a shell with paths in double quotes, so
// a folder named `r$(touch PWNED)` (or a cloned repo whose commits were authored by
// `x$(touch PWNED)@e.com`) ran that command from the app (recon, 15 Oct 2026).
// Each name here would leave a PWNED* file in ROOT if any of them reached a shell.
//
//   node test/noshell.mjs
//
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "symbiot-noshell-"));
const HOME = join(ROOT, "home");
mkdirSync(HOME, { recursive: true });
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const GITCONFIG = join(ROOT, "gitconfig");
writeFileSync(GITCONFIG, "[user]\n  name = Pat Example\n  email = pat@example.com\n[init]\n  defaultBranch = main\n");
Object.assign(process.env, { GIT_CONFIG_GLOBAL: GITCONFIG, GIT_CONFIG_SYSTEM: "/dev/null", GIT_TERMINAL_PROMPT: "0" });
process.chdir(ROOT); // a relative `touch PWNED` lands here

const { repoState, hasCmd, gitOut } = await import("../core.mjs");
const { authorship, readmeInfo, repoShape, commits, openWork, detectRepo, detectFolder, findProjectFolders, claudeProjects } = await import("../scan.mjs");
const { gitDefaultBranch, driftRepo } = await import("../drift.mjs");

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };
const pwned = () => readdirSync(ROOT).filter((f) => f.startsWith("PWNED"));

// three ways out of double quotes: $(…), backticks, and a closing quote
const NAMES = ["r$(touch PWNED1)", "r`touch PWNED2`", 'r"; touch PWNED3; "'];
const EVIL = "x$(touch PWNED4)@e.com";
const repos = [];
for (const name of NAMES) {
  const dir = join(ROOT, "work", name);
  mkdirSync(join(dir, "src"), { recursive: true });
  const g = (args, env = {}) => execFileSync("git", ["-C", dir, ...args], { env: { ...process.env, ...env }, stdio: "ignore" });
  g(["init", "-q"]);
  g(["config", "user.email", EVIL]); // the repo's own identity is outside text too
  writeFileSync(join(dir, "README.md"), `# trap ${repos.length}\n`); // a commit of its own (commits() counts a hash once)
  writeFileSync(join(dir, "src", "a.js"), "// TODO: x\n");
  writeFileSync(join(dir, "package.json"), '{"name":"trap"}\n');
  g(["add", "."]);
  g(["commit", "-qm", "init"], { GIT_AUTHOR_EMAIL: EVIL, GIT_AUTHOR_NAME: "Evil", GIT_COMMITTER_EMAIL: EVIL });
  writeFileSync(join(dir, "src", "b.js"), "x\n"); // dirty, so repoState walks HEAD~k too
  repos.push({ path: dir, name });
}
// a non-git project folder, and a Claude Code history dir for each name
const loose = join(ROOT, "work", "loose$(touch PWNED5)");
mkdirSync(loose, { recursive: true }); writeFileSync(join(loose, "package.json"), "{}\n");
for (const r of repos) {
  const enc = join(HOME, ".claude", "projects", r.path.replace(/[^a-zA-Z0-9]/g, "-") + "$(touch PWNED6)");
  mkdirSync(enc, { recursive: true });
  writeFileSync(join(enc, "s.jsonl"), JSON.stringify({ cwd: r.path }) + "\n");
}

const st = repos.map((r) => repoState(r.path));
ok("repoState reads each trapped repo", st.every((s) => s.branch === "main" && s.dirty === 1), st);
const au = repos.map((r) => authorship(r.path));
ok("authorship finds the commit by its (trapped) author", au.every((a) => a.total === 1 && a.emails.includes(EVIL)), au);
const cs = commits(repos, "30 days ago", true);
ok("commits, filtered by those authors, finds all three", cs.length === 3, cs);
ok("readmeInfo, repoShape and openWork read them", repos.every((r) => readmeInfo(r.path).lastDate && repoShape(r.path)) && openWork(repos).some((l) => /TODO|x/.test(l)), openWork(repos));
const det = repos.map((r) => detectRepo(r));
ok("detectRepo counts the user's commits", det.every((d) => d.mine === 1 && d.branch === "main" && d.files === 3), det.map((d) => [d.mine, d.branch, d.files]));
ok("detectFolder and findProjectFolders see the files", detectFolder(loose).files === 1 && findProjectFolders(join(ROOT, "work")).includes(loose), findProjectFolders(join(ROOT, "work")));
const dr = repos.map((r) => [gitDefaultBranch(r.path), driftRepo(r.path).def]);
ok("drift reads the default branch", dr.every(([a, b]) => a === "main" && b === "main"), dr);
const cp = claudeProjects();
ok("claudeProjects reads each history dir", Object.keys(cp).length === repos.length, Object.keys(cp));
ok("hasCmd takes the name as a name", hasCmd("git") && !hasCmd("git; touch PWNED7") && !hasCmd("$(touch PWNED8)"));
ok("gitOut hands arguments over as they are", gitOut(repos[0].path, ["log", "-1", "--format=%ae"]).trim() === EVIL);
ok("no name ran as a command", pwned().length === 0, pwned());

try { rmSync(ROOT, { recursive: true, force: true }); } catch {}
console.log(`\n${fail ? "✗" : "✓"} noshell: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
