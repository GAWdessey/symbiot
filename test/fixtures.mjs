// Regression fixtures for Symbiot's INPUT accuracy (the field-report bugs).
// Each builds a throwaway git repo and asserts on the FACTS Symbiot collects —
// never on model prose — so the suite is deterministic and free to run.
//
//   node test/fixtures.mjs
//
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authorship, repoState, readmeInfo, houseRules, findAllRepos, driftRepo, buildTasksMd, taskType, EMBEDDED_UI } from "../index.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "symbiot-fix-"));
let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + "  got: " + JSON.stringify(got)); } };
// run a bash setup script inside a fresh fixture dir; git identity is isolated.
function build(name, script) {
  const dir = join(ROOT, name);
  mkdirSync(dir, { recursive: true });
  execSync(script, { cwd: dir, shell: "/bin/bash", stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, GIT_CONFIG_GLOBAL: join(ROOT, "globalgitconfig"), GIT_CONFIG_SYSTEM: "/dev/null", GIT_TERMINAL_PROMPT: "0" } });
  return dir;
}
// a neutral global identity so fixtures test their OWN repo identities
writeFileSync(join(ROOT, "globalgitconfig"), "[user]\n  name = Neutral Global\n  email = neutral@example.invalid\n");

try {
  console.log("UI — the app's embedded client JavaScript parses (guards the whole browser UI)");
  const scripts = [...EMBEDDED_UI.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let uiOk = scripts.length > 0;
  for (const s of scripts) { try { new Function(s); } catch (e) { uiOk = false; console.log("    parse error: " + e.message); } }
  ok("embedded app JS parses (" + scripts.length + " script block)", uiOk, scripts.length);

  console.log("F1 identity — match all of the person's identities, exclude others");
  const f1 = build("f1", `
    git init -q && git config user.email 123+Login@users.noreply.github.com && git config user.name "Pat Example"
    for i in $(seq 20); do echo $i > a; git add a; git -c user.email=a@work.co commit -qm "work $i"; done
    for i in 1 2; do echo n$i > b; git add b; git commit -qm "noreply $i"; done
    echo x > c; git add c; git -c user.name="Someone Else" -c user.email=other@x.co commit -qm other`);
  const a1 = authorship(f1);
  ok("22 of 23 commits matched", a1.mineCount === 22 && a1.total === 23, a1);
  ok("other@x.co excluded", !a1.emails.includes("other@x.co"), a1.emails);

  console.log("F2 stale checkout — report STALE, not 'N uncommitted'");
  const f2 = build("f2", `
    git init -q && git config user.email t@x.co && git config user.name T
    for i in $(seq 12); do echo $i > f$i; git add .; git commit -qm c$i; done
    git read-tree -u --reset HEAD~10 && git reset -q`);
  const s2 = repoState(f2);
  ok("flagged stale", s2.stale === true, s2);
  ok("staleBy ~= 10", s2.staleBy === 10, s2);
  ok("deletions detected", s2.del === 10, s2);

  console.log("F3 worktrees — one entry, freshest reviewed");
  const parent = join(ROOT, "f3parent"); mkdirSync(parent, { recursive: true });
  build("f3parent/f3", `
    git init -q && git config user.email t@x.co && git config user.name T
    for i in $(seq 10); do echo $i > x; git add x; git commit -qm c$i; done
    git worktree add -q ../f3-old HEAD~5
    git worktree add -q -b feat ../f3-new
    ( cd ../f3-new && echo n > n && git add n && git commit -qm newer )`);
  const repos3 = findAllRepos(parent);
  ok("worktrees collapse to 1 entry", repos3.length === 1, repos3.map((r) => r.path));
  ok("freshest checkout chosen", repos3[0] && /f3-new$/.test(repos3[0].path), repos3[0] && repos3[0].path);

  console.log("F4 old README — its age is captured");
  const f4 = build("f4", `
    git init -q && git config user.email t@x.co && git config user.name T
    echo "# App - deploys to AWS ECS, tested on Asterisk" > README.md && git add . && git commit -qm readme
    for i in $(seq 100); do echo $i > x; git add x; git commit -qm "switch deploy to docker, step $i"; done`);
  const rd4 = readmeInfo(f4);
  ok("README commits-ago >= 90", rd4.commitsAgo >= 90, rd4);
  ok("README date present", !!rd4.lastDate, rd4);

  console.log("F5 house rule — CLAUDE.md conventions are read");
  const f5 = build("f5", `
    git init -q && git config user.email t@x.co && git config user.name T
    printf 'We commit .env files deliberately. Never advise removing them.\\n' > CLAUDE.md
    echo KEY=1 > .env && echo KEY= > .env.example && git add . && git commit -qm init`);
  const hr5 = houseRules(f5);
  ok("CLAUDE.md loaded", /deliberately/i.test(hr5) && /CLAUDE\.md/.test(hr5), hr5.slice(0, 80));

  console.log("F6 deployed ahead of default — production runs code not on main");
  const f6 = build("f6", `
    git init -q -b main && git config user.email t@x.co && git config user.name T
    for i in $(seq 5); do echo $i > m; git add m; git commit -qm m$i; done
    git checkout -qb feature
    for i in 1 2 3; do echo f$i > f; git add f; git commit -qm f$i; done
    git rev-parse HEAD > .deployed-sha && git checkout -q main`);
  const d6 = driftRepo(f6, { deploys: { [f6]: `cat ${JSON.stringify(join(f6, ".deployed-sha"))}` } });
  const notOnMain = d6.flags.find((f) => /NOT on main/.test(f.text));
  ok("production flagged not on main", !!notOnMain, d6.flags);
  ok("reports 3 ahead", notOnMain && /3 commits ahead/.test(notOnMain.text), notOnMain && notOnMain.text);

  console.log("F7 PR merged into a stacked base — not on default");
  const f7 = build("f7", `
    git init -q -b main && git config user.email t@x.co && git config user.name T
    echo a > a && git add . && git commit -qm base
    git checkout -qb stack && echo s > s && git add . && git commit -qm stack
    git checkout -qb feat && echo f > f && git add . && git commit -qm feat
    git checkout -q stack && git merge -q --no-ff feat -m "Merge pull request #2 from me/feat"
    git checkout -q main`);
  const d7 = driftRepo(f7, {});
  ok("never-landed PR flagged (added file missing from main)", d7.flags.some((f) => /MISSING from main|likely never landed/.test(f.text)), d7.flags);

  console.log("PUSH — tasks render as an agent brief (checklist + context + instruction)");
  const md = buildTasksMd("demo", { branch: "main", commits: ["did a thing"], open: ["demo: TODO fix X (a.ts:9)"], drift: ["2 behind upstream"], stack: "TypeScript, Node" }, [{ text: "Wire the thing" }, { text: "Add a test" }]);
  ok("checklist items present", /- \[ \] Wire the thing/.test(md) && /- \[ \] Add a test/.test(md), md.slice(0, 60));
  ok("carries agent context", /Recent commits/.test(md) && /Open markers/.test(md) && /Stack:/.test(md), md);
  ok("has the agent instruction", /Read `\.symbiot\/TASKS\.md`/.test(md), md.slice(-120));

  console.log("BATCH — tasks classify into kinds (deterministic, no model)");
  ok("test task -> Tests & CI", taskType("Add a smoke test for the app") === "Tests & CI", taskType("Add a smoke test for the app"));
  ok("readme task -> Docs", taskType("Update the README for drift") === "Docs", taskType("Update the README for drift"));
  ok("refactor task -> Refactor", taskType("Split the monolithic index.mjs into modules") === "Refactor", taskType("Split the monolithic index.mjs"));
  ok("bug task -> Fixes", taskType("Fix the hang in the map scan") === "Fixes", taskType("Fix the hang"));
  ok("groups render in TASKS.md", /### Tests & CI/.test(buildTasksMd("x", {}, [{ text: "add a test" }, { text: "update the readme" }])) && /### Docs/.test(buildTasksMd("x", {}, [{ text: "add a test" }, { text: "update the readme" }])), "");
} finally {
  try { execSync(`git worktree prune 2>/dev/null || true`, { cwd: join(ROOT, "f3parent", "f3"), stdio: "ignore" }); } catch {}
  rmSync(ROOT, { recursive: true, force: true });
}

console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
