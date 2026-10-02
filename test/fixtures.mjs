// Regression fixtures for Symbiot's INPUT accuracy (the field-report bugs).
// Each builds a throwaway git repo and asserts on the FACTS Symbiot collects —
// never on model prose — so the suite is deterministic and free to run.
//
//   node test/fixtures.mjs
//
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { authorship, repoState, readmeInfo, houseRules, findAllRepos, driftRepo, buildTasksMd, taskType, EMBEDDED_UI, orcaHandoffCmd, migrateOrcaCmd, fillHandoff, ORCA_CLAUDE_CMD, CLAUDE_CMD, HANDOFF_PROMPT, shipChanges, semverGt, updateCmd, parseQuestions } from "../index.mjs";
import { mailActivity } from "../mail.mjs";

const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "index.mjs");
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

  console.log("F8 drift REPORT — what `symbiot drift` prints, end to end through the CLI");
  // A scan root with one clean, one dirty, one stale and one deploy-configured
  // repo. The deploy command lives in the isolated HOME's deploys.json — the
  // only place it's ever read from — and its sha file sits outside the root.
  const f8 = join(ROOT, "f8"), f8home = join(ROOT, "f8home");
  build("f8/clean-repo", `git init -q -b main && git config user.email t@x.co && git config user.name T && echo a > a && git add . && git commit -qm init`);
  build("f8/dirty-repo", `git init -q -b main && git config user.email t@x.co && git config user.name T && echo a > a && git add . && git commit -qm init && echo wip > wip`);
  build("f8/stale-repo", `
    git init -q -b main && git config user.email t@x.co && git config user.name T
    for i in $(seq 12); do echo $i > f$i; git add .; git commit -qm c$i; done
    git read-tree -u --reset HEAD~10 && git reset -q`);
  const shaFile = join(ROOT, "f8-deployed-sha");
  build("f8/deployed-repo", `
    git init -q -b main && git config user.email t@x.co && git config user.name T
    for i in $(seq 5); do echo $i > m; git add m; git commit -qm m$i; done
    git checkout -qb feature
    for i in 1 2 3; do echo f$i > f; git add f; git commit -qm f$i; done
    git rev-parse HEAD > ${JSON.stringify(shaFile)} && git checkout -q main`);
  mkdirSync(join(f8home, ".config", "symbiot"), { recursive: true });
  writeFileSync(join(f8home, ".config", "symbiot", "deploys.json"), JSON.stringify({ "deployed-repo": `cat ${JSON.stringify(shaFile)}` }));
  const deployedSha = readFileSync(shaFile, "utf8").trim().slice(0, 9);
  const cli = (args, extraEnv = {}) => spawnSync(process.execPath, [INDEX, ...args], { encoding: "utf8", timeout: 60000,
    env: { ...process.env, HOME: f8home, USERPROFILE: f8home, GIT_CONFIG_GLOBAL: join(ROOT, "globalgitconfig"), GIT_CONFIG_SYSTEM: "/dev/null", ...extraEnv } });
  const r8 = cli(["drift", "--dir", f8]);
  const out8 = r8.stdout || "";
  // the block printed for one repo: its header line through the blank line after it
  const block = (name) => { const m = out8.match(new RegExp(`^(.) ${name} [^\\n]*\\n((?:  [^\\n]*\\n)*)`, "m")); return m ? { mark: m[1], body: m[2] } : null; };
  ok("exits cleanly", r8.status === 0, { status: r8.status, err: r8.stderr });
  ok("header counts 4 repos, 2 with risks", /Symbiot drift · 4 repos · 2 with risks/.test(out8), out8.split("\n").slice(0, 3));
  const st8 = block("stale-repo");
  ok("stale repo: risky ● + stale-checkout warning", st8 && st8.mark === "●" && /⚠ checkout is stale — working tree ≈ HEAD~10, not new work/.test(st8.body), st8 || out8);
  const dp8 = block("deployed-repo");
  ok("deployed repo: production NOT on main, 3 ahead, sha cited", dp8 && dp8.mark === "●" && dp8.body.includes(`⚠ production runs code NOT on main (3 commits ahead of it)  [${deployedSha}]`), dp8 || out8);
  const dy8 = block("dirty-repo");
  ok("dirty repo: informational ○, uncommitted counted, no warning", dy8 && dy8.mark === "○" && /· 1 uncommitted \(0 mod \/ 0 del \/ 1 new\)/.test(dy8.body) && !dy8.body.includes("⚠"), dy8 || out8);
  ok("clean repo listed on the clean: line only", /^clean: clean-repo$/m.test(out8) && !block("clean-repo"), out8);
  ok("footer: local facts, CI hint, no deploys.json nag (it's configured)", /local git facts only \(add --ci for CI status\)$/m.test(out8.trim()) && !/set ~\/\.config\/symbiot\/deploys\.json/.test(out8), out8.trim().split("\n").pop());

  console.log("F9 scan deadline — a scan that runs out of time returns partial, never hangs");
  const t9 = Date.now();
  const r9 = cli(["drift", "--dir", f8], { SYMBIOT_SCAN_TIMEOUT: "0.001" });
  ok("returns promptly with a clean exit", r9.status === 0 && Date.now() - t9 < 30000, { status: r9.status, ms: Date.now() - t9 });
  ok("says the scan stopped and results are partial", /scan stopped after .* results are partial/.test(r9.stderr || ""), r9.stderr);

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

  console.log("ORCA — the Claude-in-a-tab handoff delivers the WHOLE prompt (≤0.26 sent only \"Read\")");
  // fake orca-ide: `status` reports ready, `terminal create` runs its --command
  // in a shell like Orca's tab does; fake `claude` records the args it got.
  const fake = join(ROOT, "orca-fake"); mkdirSync(fake, { recursive: true });
  const orcaBin = join(fake, "orca-ide"), got = join(fake, "argv");
  writeFileSync(orcaBin, '#!/bin/bash\ncase "$1" in status) echo \'{"state": "ready"}\';; terminal) while [ $# -gt 0 ]; do [ "$1" = --command ] && { bash -c "$2"; exit; }; shift; done;; esac\n', { mode: 0o755 });
  writeFileSync(join(fake, "claude"), `#!/bin/bash\nprintf '%s\\n' "$#" "$1" > ${JSON.stringify(got)}\n`, { mode: 0o755 });
  const runOrca = (tmpl) => { rmSync(got, { force: true }); execSync(fillHandoff(tmpl, fake), { shell: "/bin/bash", stdio: "ignore", env: { ...process.env, PATH: fake + ":" + process.env.PATH } }); return readFileSync(got, "utf8").split("\n"); };
  const q = JSON.stringify(orcaBin);
  // the prompt + --allowedTools + 2 tool rules
  const [argc, arg1] = runOrca(orcaHandoffCmd(q, ORCA_CLAUDE_CMD));
  ok("claude gets the prompt as ONE argument", argc === "4" && arg1 === HANDOFF_PROMPT, [argc, arg1]);
  ok("the Orca Claude preset can run the tests too", /--allowedTools \\"Bash\(npm test:\*\)\\"/.test(ORCA_CLAUDE_CMD), ORCA_CLAUDE_CMD);
  const saved034 = orcaHandoffCmd(q, ` --command "claude \\"{prompt}\\""`); // what ≤0.34 saved
  ok("a saved ≤0.34 Orca Claude preset upgrades to the one that can run tests", migrateOrcaCmd(saved034) === orcaHandoffCmd(q, ORCA_CLAUDE_CMD), migrateOrcaCmd(saved034));
  const legacy = orcaHandoffCmd(q, ` --command "claude {prompt}"`); // what ≤0.26 saved to config
  const migrated = migrateOrcaCmd(legacy);
  ok("a saved unquoted command is migrated to the quoted form", migrated === orcaHandoffCmd(q, ORCA_CLAUDE_CMD), migrated);
  ok("migration is idempotent", migrateOrcaCmd(migrated) === migrated, "");
  ok("custom --command is preserved", migrateOrcaCmd(orcaHandoffCmd(q, ` --command "codex"`)) === orcaHandoffCmd(q, ` --command "codex"`), "");
  const [argc2, arg12] = runOrca(migrated);
  ok("migrated command delivers the whole prompt", argc2 === "4" && arg12 === HANDOFF_PROMPT, [argc2, arg12]);

  console.log("HANDOFF — one saved template drives every handoff (save, clear, legacy `ide`)");
  // isolated HOME: these read and write Symbiot's real config.json
  const hhome = join(ROOT, "hhome"); mkdirSync(join(hhome, ".config", "symbiot"), { recursive: true });
  writeFileSync(join(hhome, ".config", "symbiot", "config.json"), JSON.stringify({ ide: "code" }));
  const hs = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import * as m from ${JSON.stringify(INDEX)};
    const out = { legacy: m.handoffCmd() };
    out.saved = m.setHandoffCmd("  zed {dir}  "); out.afterSave = m.handoffCmd();
    out.cleared = m.setHandoffCmd(""); out.afterClear = m.handoffCmd();
    m.setHandoffCmd('claude -p "{prompt}" --permission-mode acceptEdits'); out.oldClaude = m.handoffCmd();
    out.oldClaudeSaved = JSON.parse((await import("node:fs")).readFileSync(${JSON.stringify(join(hhome, ".config", "symbiot", "config.json"))}, "utf8")).agentCmd;
    m.setHandoffCmd('claude -p "{prompt}" --permission-mode acceptEdits --model opus'); out.editedClaude = m.handoffCmd();
    console.log(JSON.stringify(out));`], { encoding: "utf8", env: { ...process.env, HOME: hhome, USERPROFILE: hhome } });
  let h = {}; try { h = JSON.parse(hs.stdout.trim().split("\n").pop()); } catch { console.log(hs.stdout, hs.stderr); }
  ok("a legacy `ide` setting still hands off", h.legacy === "code {dir}", h.legacy);
  ok("saving trims and is what runs", h.saved && h.saved.ok && h.saved.cmd === "zed {dir}" && h.afterSave === "zed {dir}", h);
  ok("clearing leaves no handoff (and the legacy `ide` is gone)", h.cleared && h.cleared.cmd === "" && h.afterClear === "", h);
  ok("a saved ≤0.33 Claude preset upgrades to the one that can run tests", h.oldClaude === CLAUDE_CMD && h.oldClaudeSaved === CLAUDE_CMD && /--allowedTools/.test(CLAUDE_CMD), h);
  ok("an edited Claude command is left as-is", h.editedClaude === 'claude -p "{prompt}" --permission-mode acceptEdits --model opus', h.editedClaude);
  // the fake claude (above) records argc and $1: the prompt + flag + mode + flag + 2 tools
  rmSync(got, { force: true });
  execSync(fillHandoff(CLAUDE_CMD, fake), { shell: "/bin/bash", stdio: "ignore", env: { ...process.env, PATH: fake + ":" + process.env.PATH } });
  const [cargc, carg1] = readFileSync(got, "utf8").split("\n");
  ok("the Claude preset keeps the prompt and each tool rule as ONE argument", cargc === "7" && carg1 === "-p", [cargc, carg1]);

  console.log("HANDOFF — one agent per folder: a second send while it runs starts nothing");
  // two identical runs once started on the same repo 6s apart and raced
  const AGENTS = join(dirname(INDEX), "agents.mjs"), busyDir = join(ROOT, "busy");
  mkdirSync(busyDir, { recursive: true });
  const bs = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import * as a from ${JSON.stringify(AGENTS)};
    import { existsSync, readFileSync, writeFileSync } from "node:fs";
    import { spawnSync } from "node:child_process";
    const dir = ${JSON.stringify(busyDir)}, lock = dir + "/.symbiot/agent.pid", out = {};
    const until = async (f) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 100)); };
    a.setHandoffCmd("sleep 3");
    const first = a.runHandoff(dir); out.first = first && !first.busy && !!first.pid;
    out.second = a.runHandoff(dir); out.jobs = a.HANDOFFS.length; out.firstId = first.id;
    out.lock = JSON.parse(readFileSync(lock, "utf8")).pid === first.pid;
    const o = spawnSync(process.execPath, ["--input-type=module", "-e", "import * as a from " + JSON.stringify(${JSON.stringify(AGENTS)}) + "; console.log(JSON.stringify(a.runHandoff(" + JSON.stringify(dir) + ")))"], { encoding: "utf8" });
    try { out.other = JSON.parse(o.stdout.trim()); } catch { out.other = o.stdout + o.stderr; }
    await until(() => first.status !== "running"); await until(() => !existsSync(lock));
    out.lockGone = !existsSync(lock);
    writeFileSync(lock, JSON.stringify({ pid: spawnSync("true").pid, id: "x", startedAt: Date.now() }));
    out.stale = a.runningHandoff(dir);
    a.setHandoffCmd("true"); const third = a.runHandoff(dir); out.third = third && !third.busy;
    await until(() => third.status !== "running");
    console.log(JSON.stringify(out));`], { encoding: "utf8", timeout: 30000, env: { ...process.env, HOME: hhome, USERPROFILE: hhome } });
  let b = {}; try { b = JSON.parse(bs.stdout.trim().split("\n").pop()); } catch { console.log(bs.stdout, bs.stderr); }
  ok("the first send starts the agent and holds the folder", b.first && b.lock, b);
  ok("a second send in the same process starts nothing", b.second && b.second.busy && b.second.id === b.firstId && b.jobs === 1, b);
  ok("a second Symbiot process sees it running too", b.other && b.other.busy && b.other.pid > 0, b.other);
  ok("the folder is free again once the agent exits", b.lockGone && b.third, b);
  ok("a leftover lock from a dead agent doesn't block", b.stale === null, b.stale);

  console.log("HANDOFF — a send while the agent runs holds the new TASKS.md until it finishes");
  const heldDir = join(ROOT, "held"); mkdirSync(heldDir, { recursive: true });
  const hd = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import * as a from ${JSON.stringify(AGENTS)};
    import { existsSync, readFileSync, writeFileSync } from "node:fs";
    const dir = ${JSON.stringify(heldDir)}, f = dir + "/.symbiot/TASKS.md", next = dir + "/.symbiot/TASKS.next.md", out = {};
    const until = async (c) => { for (let i = 0; i < 100 && !c(); i++) await new Promise((r) => setTimeout(r, 100)); };
    out.freeHeld = a.writeTasks(dir, "- [ ] A\\n- [ ] B\\n");
    a.setHandoffCmd("sleep 2"); const job = a.runHandoff(dir);
    out.busyHeld = a.writeTasks(dir, "- [ ] A\\n- [ ] B\\n- [ ] C\\n");
    out.during = readFileSync(f, "utf8");
    writeFileSync(f, "- [x] A\\n- [ ] B\\n"); // the agent ticks A meanwhile
    out.earlyRelease = a.releaseHeldTasks(dir);
    await until(() => job.status !== "running" && !existsSync(next));
    out.after = readFileSync(f, "utf8"); out.nextGone = !existsSync(next);
    writeFileSync(next, "- [ ] stale\\n"); out.supersede = a.writeTasks(dir, "- [ ] D\\n");
    out.superseded = !existsSync(next) && readFileSync(f, "utf8") === "- [ ] D\\n";
    console.log(JSON.stringify(out));`], { encoding: "utf8", timeout: 30000, env: { ...process.env, HOME: hhome, USERPROFILE: hhome } });
  let hv = {}; try { hv = JSON.parse(hd.stdout.trim().split("\n").pop()); } catch { console.log(hd.stdout, hd.stderr); }
  ok("no agent running -> TASKS.md is written straight away", hv.freeHeld === false, hv);
  ok("agent running -> the new brief is held, its TASKS.md untouched", hv.busyHeld === true && hv.during === "- [ ] A\n- [ ] B\n" && hv.earlyRelease === false, hv);
  ok("once it exits the held brief lands, keeping the agent's ticks", hv.nextGone && hv.after === "- [x] A\n- [ ] B\n- [ ] C\n", hv.after);
  ok("a later send when free replaces a leftover held brief", hv.supersede === false && hv.superseded, hv);

  console.log("APPROVE — approved work ships: branch off the default, commit (minus .symbiot/), push");
  const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: join(ROOT, "globalgitconfig"), GIT_CONFIG_SYSTEM: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
  const shipRepo = build("ship", `git init -q -b main && git config user.email ci@symbiot.test && git config user.name "Symbiot CI" && echo a > a.txt && git add . && git commit -qm init
    git clone -q --bare . ../ship-remote.git && git remote add origin ../ship-remote.git && git fetch -q origin && git remote set-head origin main
    echo b >> a.txt && echo new > new.txt && mkdir .symbiot && echo '- [x] t' > .symbiot/TASKS.md`);
  const evil = "Fix the $(touch pwned) `id` bug";
  const r1 = shipChanges(shipRepo, [evil, "Add a test"], { pr: false });
  const g = (a) => execSync("git " + a, { cwd: shipRepo, encoding: "utf8", env: gitEnv }).trim();
  ok("commits on a new symbiot/ branch, not main", r1.ok && /^symbiot\//.test(r1.branch) && g("rev-parse --abbrev-ref HEAD") === r1.branch && g("rev-parse main") === g("rev-parse origin/main"), r1);
  ok("commit message lists the approved tasks verbatim (no shell)", g("log -1 --format=%B").includes("- " + evil) && !existsSync(join(shipRepo, "pwned")), g("log -1 --format=%B"));
  ok("tracked + new files committed, .symbiot/ left out", g("show --name-only --format= HEAD").split("\n").sort().join(",") === "a.txt,new.txt" && g("status --porcelain") === "?? .symbiot/", g("show --name-only --format= HEAD"));
  ok("pushed to origin", r1.pushed && g(`rev-parse origin/${r1.branch}`) === g("rev-parse HEAD"), r1);
  const r2 = shipChanges(shipRepo, ["x"], { pr: false });
  ok("nothing to commit -> approved without a commit", r2.ok && r2.nothing && !r2.commit, r2);
  g("switch -q main"); writeFileSync(join(shipRepo, "c.txt"), "c\n");
  const r3 = shipChanges(shipRepo, [], { push: false });
  ok("no task -> its own symbiot/changes-<date> branch and subject", r3.ok && /^symbiot\/changes-\d{4}-\d{2}-\d{2}$/.test(r3.branch) && r3.subject === "symbiot: changes approved without a task", r3);
  // regression: when .symbiot/ is gitignored, `git add . :(exclude).symbiot`
  // warned+exited-1 ("paths are ignored") and falsely aborted the ship.
  const giRepo = build("ship-gi", `git init -q -b main && git config user.email ci@symbiot.test && git config user.name "Symbiot CI"
    printf '.symbiot/\\n' > .gitignore && echo a > a.txt && git add . && git commit -qm init
    echo b >> a.txt && echo new > new.txt && mkdir .symbiot && echo log > .symbiot/agent.log`);
  const rg = shipChanges(giRepo, ["Do a thing"], { push: false });
  const gg = (a) => execSync("git " + a, { cwd: giRepo, encoding: "utf8", env: gitEnv }).trim();
  ok("ships even when .symbiot/ is gitignored (no false 'git add failed')", rg.ok && !!rg.commit, rg);
  ok("commit excludes .symbiot/ (gitignored case)", !gg("show --name-only --format= HEAD").split("\n").includes(".symbiot"), gg("show --name-only --format= HEAD"));

  console.log("REVIEW — agent ticks -> awaiting review (not archived) -> send back / approve");
  // isolated HOME: the cycle reads and writes Symbiot's real task store
  const home = join(ROOT, "rhome"), proj = join(home, "projects", "revapp");
  mkdirSync(proj, { recursive: true });
  execSync(`git init -q -b main && git config user.email ci@symbiot.test && git config user.name "Symbiot CI" && echo a > a.txt && git add . && git commit -qm init`, { cwd: proj, env: gitEnv });
  const cycle = `
    import * as m from ${JSON.stringify(INDEX)};
    import { readFileSync, writeFileSync } from "node:fs";
    const f = ${JSON.stringify(join(proj, ".symbiot", "TASKS.md"))};
    const tick = () => writeFileSync(f, readFileSync(f, "utf8").replace("- [ ] Fix the bug", "- [x] Fix the bug"));
    const tasks = () => JSON.parse(readFileSync(${JSON.stringify(join(home, ".config", "symbiot", "tasks.json"))}, "utf8"));
    const out = {};
    writeFileSync(${JSON.stringify(join(proj, "a.txt"))}, "changed\\n");
    m.pushTasks(); tick();
    out.brief = readFileSync(f, "utf8");
    out.sync = m.syncTasks(); out.afterTick = tasks()[0];
    out.pending = m.pendingReview();
    out.repush = m.pushTasks();
    m.sendBack(out.afterTick.id); out.afterBack = tasks()[0]; out.md = readFileSync(f, "utf8");
    m.pushTasks(); tick(); m.syncTasks();
    out.approve = m.approveRepo("revapp", { push: false }); out.final = tasks()[0];
    // a change no ticked task covers, in a repo that still has an open task
    writeFileSync(${JSON.stringify(join(home, ".config", "symbiot", "tasks.json"))}, JSON.stringify([...tasks(), { id: "t2", text: "Open task", repo: "revapp", done: false, ts: 2 }]));
    writeFileSync(${JSON.stringify(join(proj, "b.txt"))}, "fix\\n");
    out.untasked = m.pendingReview();
    out.ac = m.approveChanges("revapp", { push: false }); out.acTasks = tasks();
    out.acAgain = m.approveChanges("revapp", { push: false });
    console.log(JSON.stringify(out));`;
  mkdirSync(join(home, ".config", "symbiot"), { recursive: true });
  writeFileSync(join(home, ".config", "symbiot", "tasks.json"), JSON.stringify([{ id: "t1", text: "Fix the bug", repo: "revapp", done: false, ts: 1 }]));
  const cy = spawnSync(process.execPath, ["--input-type=module", "-e", cycle], { encoding: "utf8", env: { ...gitEnv, HOME: home, USERPROFILE: home } });
  let o = {}; try { o = JSON.parse(cy.stdout.trim().split("\n").pop()); } catch { console.log(cy.stdout, cy.stderr); }
  ok("brief tells the agent to tick + leave changes uncommitted", /Tick it here/.test(o.brief || "") && /uncommitted/.test(o.brief || ""), "");
  ok("an agent tick -> awaiting review, NOT done/archived", o.sync && o.sync.review === 1 && o.afterTick.review && !o.afterTick.done && !o.afterTick.archived, o.afterTick);
  ok("pending shows the repo's uncommitted changes", o.pending && o.pending[0].repo === "revapp" && o.pending[0].files.some((x) => x.file === "a.txt") && /\+1/.test(o.pending[0].stat), o.pending);
  ok("tasks in review aren't re-sent to the agent", o.repush && o.repush.empty, o.repush);
  ok("send back reopens it and unticks TASKS.md", o.afterBack && !o.afterBack.review && !o.afterBack.done && /- \[ \] Fix the bug/.test(o.md), o.afterBack);
  ok("approve commits on a branch, then archives with the commit", o.approve && o.approve.approved === 1 && /^symbiot\/fix-the-bug/.test(o.approve.branch) && o.final.archived && o.final.done && o.final.commit === o.approve.commit, o.approve);
  ok("untasked changes in a repo that got tasks show up for approval", o.untasked && o.untasked.length === 1 && o.untasked[0].untasked && o.untasked[0].tasks.length === 0 && o.untasked[0].files.some((x) => x.file === "b.txt"), o.untasked);
  const acMsg = o.ac && o.ac.commit ? execSync("git log -1 --format=%B " + o.ac.commit, { cwd: proj, encoding: "utf8", env: gitEnv }) : "";
  ok("approve changes without a task commits them, tasks untouched", o.ac && o.ac.ok && o.ac.approved === 0 && /without a task/.test(acMsg) && o.acTasks.find((x) => x.id === "t2" && !x.done && !x.review), o.ac);
  ok("nothing left -> approve changes without a task says so", o.acAgain && /No uncommitted changes/.test(o.acAgain.error || ""), o.acAgain);

  console.log("QUESTIONS — any agent's .symbiot/QUESTIONS.md parses into questions, options and ideas");
  const pq = parseQuestions("# Questions for you\n\n## Questions\n### Keep the old config format?\nReading both costs ~40 lines.\n- Yes, read both (recommended)\n- No, migrate once\n\n### Which port?\n1. 7391\n2. random\n\n## Suggestions\n- Add a --json flag to drift\n- [ ] Cache the map scan\n");
  ok("two questions, in order", pq.questions.length === 2 && pq.questions[0].q === "Keep the old config format?" && pq.questions[1].q === "Which port?", pq.questions);
  ok("context and options attach to their question", pq.questions[0].context === "Reading both costs ~40 lines." && pq.questions[0].options.join("|") === "Yes, read both (recommended)|No, migrate once" && pq.questions[1].options.join("|") === "7391|random", pq.questions);
  ok("suggestions are their own list (checkbox bullets too)", pq.suggestions.join("|") === "Add a --json flag to drift|Cache the map scan", pq.suggestions);
  const loose = parseQuestions("- Should I delete the legacy folder?\n- Rename it instead?");
  ok("bare bullets with no headings are still questions", loose.questions.length === 2 && loose.questions[0].options.length === 0, loose);
  ok("TASKS.md tells the agent how to ask", /\.symbiot\/QUESTIONS\.md/.test(md) && /## Suggestions/.test(md) && /\.symbiot\/ANSWERS\.md/.test(md), md.slice(-600));
  ok("the handoff prompt points at QUESTIONS.md, shell-safe", /QUESTIONS\.md/.test(HANDOFF_PROMPT) && !/[`$"\\]/.test(HANDOFF_PROMPT), HANDOFF_PROMPT);

  console.log("MAIL — sent mail is read from local mbox/Maildir (headers only), no API");
  const mdir = join(ROOT, "mail"), day = (n) => new Date(Date.now() - n * 86400000).toUTCString();
  mkdirSync(join(mdir, "Sent", "cur"), { recursive: true });
  const msg = (h) => Object.entries(h).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\nbody text that must never be read\n";
  writeFileSync(join(mdir, "takeout.mbox"), [
    "From 1@x " + day(1) + "\n" + msg({ "Message-ID": "<a@x>", From: "Pat <pat@me.dev>", To: "Ann <ann@client.co>, bob@x.co", Subject: "=?UTF-8?B?TGF1bmNoIHBsYW4g4pyU?=", Date: day(1), "X-Gmail-Labels": "Sent,Opened" }),
    "From 2@x " + day(1) + "\n" + msg({ "Message-ID": "<b@x>", From: "Spam <s@spam.co>", To: "pat@me.dev", Subject: "You won", Date: day(1), "X-Gmail-Labels": "Inbox" }),
    "From 3@x " + day(30) + "\n" + msg({ "Message-ID": "<c@x>", From: "pat@me.dev", To: "ann@client.co", Subject: "Old news", Date: day(30), "X-Gmail-Labels": "Sent" }),
    "From 4@x " + day(2) + "\n" + msg({ "Message-ID": "<d@x>", From: "pat@me.dev", To: "cto@me.dev", Subject: "Re: hiring", Date: day(2) }),
  ].join("\n"));
  writeFileSync(join(mdir, "Sent", "cur", "1700000000.M1.host:2,S"), msg({ "Message-ID": "<e@x>", From: "pat@me.dev", To: "=?iso-8859-1?Q?Ren=E9?= <rene@x.co>", Subject: "Contract =?iso-8859-1?Q?sign=E9?=", Date: day(3) }));
  writeFileSync(join(mdir, "Sent Mail"), "From 6@x " + day(1) + "\n" + msg({ "Message-ID": "<f@x>", From: "pat@me.dev", To: "a@b.co", Subject: "Deleted draft", Date: day(1), "X-Mozilla-Status": "0009" }));
  const mail = mailActivity({ days: 7, auto: false, sources: [join(mdir, "takeout.mbox"), join(mdir, "Sent"), join(mdir, "Sent Mail")], addresses: ["pat@me.dev"] });
  const subj = mail.map((x) => x.subject);
  ok("an export keeps only what you sent (Sent label or your address), in the window", subj.includes("Launch plan ✔") && subj.includes("Re: hiring") && !subj.includes("You won") && !subj.includes("Old news"), subj);
  ok("Maildir Sent folder is read; encoded headers decode", subj.includes("Contract signé") && mail.find((x) => x.subject === "Contract signé").to[0] === "René", mail);
  ok("Thunderbird-deleted mail is skipped", !subj.includes("Deleted draft"), subj);
  ok("recipients by name, newest first", mail[0].subject === "Launch plan ✔" && mail[0].to.join(",") === "Ann,bob@x.co", mail[0]);
  ok("never reads a body", !JSON.stringify(mail).includes("body text"), "");

  console.log("MAIL — `symbiot mail`: add an export, preview it, off until switched on");
  const mhome = join(ROOT, "mhome"), mcfg = join(mhome, ".config", "symbiot", "config.json");
  mkdirSync(mhome, { recursive: true });
  const mcli = (args) => spawnSync(process.execPath, [INDEX, "mail", ...args], { encoding: "utf8", timeout: 60000,
    env: { ...process.env, HOME: mhome, USERPROFILE: mhome, GIT_CONFIG_GLOBAL: join(ROOT, "globalgitconfig"), GIT_CONFIG_SYSTEM: "/dev/null" } });
  const mailCfgOf = () => { try { return JSON.parse(readFileSync(mcfg, "utf8")).mail || {}; } catch { return {}; } };
  const ma = mcli(["--add", join(mdir, "takeout.mbox")]);
  ok("--add saves the export as a source, still off", ma.status === 0 && (mailCfgOf().sources || []).includes(join(mdir, "takeout.mbox")) && mailCfgOf().enabled === false, { status: ma.status, cfg: mailCfgOf(), err: ma.stderr });
  ok("the preview lists what you sent, not what you received", /Launch plan ✔/.test(ma.stdout) && !/You won/.test(ma.stdout) && /symbiot mail --on/.test(ma.stdout), ma.stdout);
  const mbad = mcli(["--add", join(mdir, "no-such.mbox")]);
  ok("a missing path is refused and not saved", /not found/.test(mbad.stdout) && (mailCfgOf().sources || []).length === 1, { out: mbad.stdout, cfg: mailCfgOf() });
  const mon = mcli(["--on"]);
  ok("--on switches it on (sources kept)", mon.status === 0 && mailCfgOf().enabled === true && (mailCfgOf().sources || []).length === 1, mailCfgOf());
  mcli(["--off"]);
  ok("--off switches it off again", mailCfgOf().enabled === false, mailCfgOf());

  console.log("UPDATE — only a higher npm version is offered as an update");
  ok("0.26.0 is not newer than 0.27.0 (local build ahead of npm)", !semverGt("0.26.0", "0.27.0"), "");
  ok("0.10.0 is newer than 0.9.4 (numeric, not string)", semverGt("0.10.0", "0.9.4"), "");
  ok("same version is not newer", !semverGt("0.27.0", "0.27.0"), "");
  // the 0.28.2 loop: installing the `latest` tag could resolve to the stale
  // version again, so a known newer version is installed by its exact number
  const up = updateCmd("0.34.0", "0.33.0", "linux");
  ok("update installs the exact newer version, skipping a stale cache", up.target === "0.34.0" && up.cmd === "npm install -g symbiot@0.34.0 --prefer-online", up);
  ok("never 'updates' to an older npm version (local build ahead)", updateCmd("0.32.0", "0.33.0", "linux").target === "latest", updateCmd("0.32.0", "0.33.0", "linux"));
  ok("windows uses npm i -g", updateCmd("0.34.0", "0.33.0", "win32").cmd === "npm i -g symbiot@0.34.0 --prefer-online", updateCmd("0.34.0", "0.33.0", "win32"));
} finally {
  try { execSync(`git worktree prune 2>/dev/null || true`, { cwd: join(ROOT, "f3parent", "f3"), stdio: "ignore" }); } catch {}
  rmSync(ROOT, { recursive: true, force: true });
}

console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
