// Regression fixtures for Symbiot's INPUT accuracy (the field-report bugs).
// Each builds a throwaway git repo and asserts on the FACTS Symbiot collects —
// never on model prose — so the suite is deterministic and free to run.
//
//   node test/fixtures.mjs
//
import { execSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { authorship, repoState, readmeInfo, houseRules, findAllRepos, driftRepo, buildTasksMd, taskType, EMBEDDED_UI, orcaHandoffCmd, migrateOrcaCmd, fillHandoff, ORCA_CLAUDE_CMD, CLAUDE_CMD, HANDOFF_PROMPT, shipChanges, shipWithBump, bumpOffer, learnNpm, releaseNeeded, withReleases, semverGt, updateCmd, parseQuestions, unreleased, publishesOnMerge } from "../index.mjs";
import { grantRule, claudeConnectors, withConnectors } from "../agents.mjs";
import { applyRemovals, removalOf } from "../tasks.mjs";
import { sameTask, uniqueTasks } from "../core.mjs";
import { mailActivity } from "../mail.mjs";
import { pngSize, pngDecode, splitPng, stitchPng, stitchListPng, captureCmds, clickCmds, portalAppId, monitorCmds, parseCosmicRandr, parseWlrRandr, parseKscreen, parseXrandr, parseLines, tidyMonitors, monitorAreas } from "../screens.mjs";
import { siteUrl, browserArgs, isTrusted, isSend } from "../headless.mjs";
import { deflateSync } from "node:zlib";
import { weeklyDue, lastSlot, autostartFile, autostartContent, notifyCmd } from "../desktop.mjs";
import { itemKey, itemsOf, newItems, remember, githubItems, draftsUrl } from "../watch.mjs";
import { lanAddresses, computerUrl } from "../phone.mjs";

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
  ok("a second send in the same process starts nothing", b.second && b.second.busy && b.second.id === b.firstId && b.jobs === 1 && b.second.auto, b);
  ok("a second Symbiot process sees it running too, and that its owner is still up", b.other && b.other.busy && b.other.pid > 0 && b.other.auto, b.other);
  ok("the folder is free again once the agent exits", b.lockGone && b.third, b);
  ok("a leftover lock from a dead agent doesn't block", b.stale === null, b.stale);

  console.log("HANDOFF — connectors linked to Claude reach its runs (--allowedTools names them)");
  const cj = join(ROOT, "claude.json");
  writeFileSync(cj, JSON.stringify({ claudeAiMcpEverConnected: ["claude.ai Google Drive", "claude.ai Notion"], mcpNeedsAuthNoticed: ["claude.ai Notion"], mcpServers: { "my-mail": {} }, projects: { "/r": { mcpServers: { local: {} } } } }));
  const conns = claudeConnectors("/r", cj);
  ok("claude.ai connectors, your servers and this folder's, named as Claude names their tools", JSON.stringify(conns.map((c) => c.rule)) === JSON.stringify(["mcp__claude_ai_Google_Drive", "mcp__claude_ai_Notion", "mcp__my-mail", "mcp__local"]), conns);
  ok("one waiting to be authorized isn't ready", conns.find((c) => c.name === "claude.ai Notion").ready === false && conns.find((c) => c.name === "claude.ai Google Drive").ready, conns);
  const wc = withConnectors(CLAUDE_CMD, "/r", cj);
  ok("a Claude run allows the ready ones' tools, after the preset's own rules", wc === CLAUDE_CMD + ' "mcp__claude_ai_Google_Drive" "mcp__my-mail" "mcp__local"', wc);
  ok("a Claude command with no --allowedTools gets one; another agent's runs as-is", withConnectors('claude -p "{prompt}"', "", cj) === 'claude -p "{prompt}" --allowedTools "mcp__claude_ai_Google_Drive" "mcp__my-mail"' && withConnectors('codex exec "{prompt}"', "", cj) === 'codex exec "{prompt}"', withConnectors('claude -p "{prompt}"', "", cj));
  ok("no ~/.claude.json: nothing added", withConnectors(CLAUDE_CMD, "", join(ROOT, "none.json")) === CLAUDE_CMD, "");
  rmSync(got, { force: true });
  execSync(fillHandoff(wc, fake), { shell: "/bin/bash", stdio: "ignore", env: { ...process.env, PATH: fake + ":" + process.env.PATH } });
  ok("each connector rule reaches claude as ONE argument", readFileSync(got, "utf8").split("\n")[0] === "10", readFileSync(got, "utf8"));

  console.log("HANDOFF — a run that stopped on questions isn't started again on the same .env and answers");
  const blkDir = join(ROOT, "blocked"); mkdirSync(join(blkDir, ".symbiot"), { recursive: true });
  const bk = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import * as a from ${JSON.stringify(AGENTS)};
    import { writeFileSync, existsSync } from "node:fs";
    const dir = ${JSON.stringify(blkDir)}, s = dir + "/.symbiot/", out = {};
    const until = async (c) => { for (let i = 0; i < 100 && !c(); i++) await new Promise((r) => setTimeout(r, 100)); };
    const run = async (o) => { const j = a.runHandoff(dir, o); if (j && j.pid) await until(() => j.status !== "running" && !existsSync(s + "agent.pid")); return j; };
    writeFileSync(s + "TASKS.md", "- [ ] Set WA_WABA_ID\\n- [x] Done one\\n"); writeFileSync(dir + "/.env", "A=1\\n");
    // the agent asks for the value and ticks nothing
    a.setHandoffCmd("printf '## Questions\\\\n### What is WA_WABA_ID?\\\\n- 👤 You: put it in .env\\\\n' > .symbiot/QUESTIONS.md");
    out.first = !!(await run()).pid; out.noted = existsSync(s + "blocked.json");
    out.again = a.runHandoff(dir);
    writeFileSync(dir + "/.env", "A=1\\nWA_WABA_ID=9\\n"); out.envChanged = !!(await run()).pid;
    out.again2 = !!a.runHandoff(dir).blocked;
    writeFileSync(s + "ANSWERS.md", "### An earlier question\\nAn answer\\n"); out.answered = !!(await run()).pid;
    writeFileSync(s + "TASKS.md", "- [ ] Set WA_WABA_ID\\n- [ ] A new task\\n"); out.newTask = !!(await run()).pid;
    writeFileSync(s + "TASKS.md", "- [ ] Set WA_WABA_ID\\n"); out.fewer = !!a.runHandoff(dir).blocked;
    out.forced = !!(await run({ force: true })).pid;
    a.setHandoffCmd("true"); out.otherCmd = !!(await run()).pid; out.cleared = !existsSync(s + "blocked.json");
    console.log(JSON.stringify(out));`], { encoding: "utf8", timeout: 60000, env: { ...process.env, HOME: hhome, USERPROFILE: hhome } });
  let bq = {}; try { bq = JSON.parse(bk.stdout.trim().split("\n").pop()); } catch { console.log(bk.stdout, bk.stderr); }
  ok("a run that asks and leaves its task open is noted as blocked", bq.first && bq.noted, bq);
  ok("...so the next send starts nothing, and says why", bq.again && bq.again.blocked && bq.again.questions === 1 && /\.env and ANSWERS\.md haven't changed/.test(bq.again.note), bq.again);
  ok("a changed .env, a new answer or a new task starts one", bq.envChanged && bq.again2 && bq.answered && bq.newTask, bq);
  ok("fewer of the same tasks is still blocked; force starts it anyway", bq.fewer && bq.forced, bq);
  ok("a changed agent command starts one, and a run that didn't ask clears the note", bq.otherCmd && bq.cleared, bq);

  console.log("HANDOFF — after a restart, a run's questions still show; a step of yours holds the next run");
  const erDir = join(ROOT, "earlier"), erHome = join(ROOT, "erhome"); mkdirSync(join(erDir, ".symbiot"), { recursive: true }); mkdirSync(erHome, { recursive: true });
  const erRun = (code) => { const r = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import * as a from ${JSON.stringify(AGENTS)};
    import { writeFileSync, existsSync } from "node:fs";
    const dir = ${JSON.stringify(erDir)}, s = dir + "/.symbiot/", out = {};
    const until = async (c) => { for (let i = 0; i < 100 && !c(); i++) await new Promise((r) => setTimeout(r, 100)); };
    const run = async (j) => { if (j && j.pid) await until(() => j.status !== "running" && !existsSync(s + "agent.pid")); return j; };
    ${code}
    console.log(JSON.stringify(out));`], { encoding: "utf8", timeout: 60000, env: { ...process.env, HOME: erHome, USERPROFILE: erHome } });
    try { return JSON.parse(r.stdout.trim().split("\n").pop()); } catch { console.log(r.stdout, r.stderr); return {}; } };
  // the app that started it: the run asks for a value that goes in .env
  const er1 = erRun(`writeFileSync(s + "TASKS.md", "- [ ] Set WA_WABA_ID\\n");
    a.setHandoffCmd("printf '## Questions\\\\n### What is WA_WABA_ID?\\\\n- 👤 You: put it in \\\\140.env\\\\140 (recommended)\\\\n' > .symbiot/QUESTIONS.md");
    out.ran = !!(await run(a.runHandoff(dir))).pid; out.runs = a.loadRuns().map((r) => r.path);`);
  ok("each folder a run starts in is noted in runs.json", er1.ran && (er1.runs || [])[0] === erDir, er1);
  // ...and after a restart (a new process): its questions show, and answering one that picks 👤 You waits for .env
  const er2 = erRun(`out.list = a.agentsList(); out.unknown = a.answerQuestions(dir + "-nowhere", [{ q: "x", a: "y" }]);
    out.files = a.namedFiles("put the key in \\x60.env\\x60, then \\x60npm test\\x60, on \\x60web.whatsapp.com\\x60 or \\x60github.com/notifications\\x60, in \\x60~/.termux/termux.properties\\x60, \\x60.claude/settings.json\\x60, \\x60src/x.js\\x60 and \\x60v0.34.0\\x60", dir).map((f) => f.name);
    out.answer = a.answerQuestions(dir, [{ q: "What is WA_WABA_ID?", a: "👤 You: put it in \\x60.env\\x60 (recommended)" }], { rerun: true });
    out.held = a.runHandoff(dir); out.listWait = a.agentsList().find((e) => e.path === dir); out.none = a.startWaiting().length;
    writeFileSync(dir + "/.env", "WA_WABA_ID=9\\n"); const st = a.startWaiting(); out.started = st.length; await run(st[0]);
    out.cleared = !existsSync(s + "waiting.json");
    // a step with no file to watch waits for Start it now (force)
    writeFileSync(s + "QUESTIONS.md", "## Questions\\n### Allow gh?\\n- 👤 You: allow gh in Settings. 🤖 Agent: the next run creates the ruleset\\n");
    out.answer2 = a.answerQuestions(dir, [{ q: "Allow gh?", a: "👤 You: allow gh in Settings. 🤖 Agent: the next run creates the ruleset" }], { rerun: true });
    out.held2 = a.runHandoff(dir); out.forced = !!(await run(a.runHandoff(dir, { force: true }))).pid; out.cleared2 = !existsSync(s + "waiting.json");`);
  const ee = ((er2.list || []).find((e) => e.path === erDir)) || {};
  ok("after a restart, a run that stopped on questions is listed, marked earlier, with its questions", ee.earlier === true && ee.status === "done" && ((ee.ask || {}).questions || []).length === 1 && /WA_WABA_ID/.test(ee.tail || ""), ee);
  ok("...and its questions can be answered there; a folder no run started in can't", /No agent has run/.test((er2.unknown || {}).error || ""), er2.unknown);
  ok("namedFiles: the files a step names in backticks, not a command, a site or a version", JSON.stringify(er2.files) === JSON.stringify([".env", "~/.termux/termux.properties", ".claude/settings.json"]), er2.files);
  ok("an answer that picks 👤 You says the step is still yours, and doesn't start the agent", er2.answer && er2.answer.ok && !er2.answer.rerun && JSON.stringify(er2.answer.yours) === JSON.stringify(["put it in `.env`"]) && JSON.stringify(er2.answer.waitFiles) === '[".env"]' && /starts by itself once `\.env` changes/.test(er2.answer.note || ""), er2.answer);
  ok("...a send in the meantime starts nothing, and the Agents tab shows what it waits on", er2.held && er2.held.blocked && er2.held.waiting && /your step comes first: put it in `\.env`/.test(er2.held.note || "") && er2.listWait && er2.listWait.waiting && er2.listWait.waiting.files[0] === ".env" && er2.none === 0, [er2.held, er2.listWait && er2.listWait.waiting]);
  ok("...once .env changes, the agent starts by itself", er2.started === 1 && er2.cleared, [er2.started, er2.cleared]);
  ok("a step with no file named waits for Start it now; the 🤖 Agent part isn't the user's step", er2.answer2 && JSON.stringify(er2.answer2.yours) === '["allow gh in Settings."]' && !er2.answer2.waitFiles && er2.held2 && er2.held2.blocked && /Start it now/.test(er2.held2.note || "") && er2.forced && er2.cleared2, [er2.answer2, er2.held2, er2.forced]);

  console.log("TASKS — an approved Drop or Merge task removes the tasks it names, so they don't come back");
  const ap = Date.now(), tk = (id, text, extra = {}) => ({ id, text, repo: "wa", done: false, ts: ap - 1000, ...extra });
  const tl = [
    tk("m", "Merge the two `WA_WABA_ID` tasks into one. Both are the same edit to `.env`.", { done: true, archived: true, approvedAt: ap }),
    tk("d", "Drop the \"gosolr's own WhatsApp number\" task until launch.", { done: true, archived: true, approvedAt: ap }),
    tk("w1", "Set `WA_WABA_ID` in `.env`. It's needed to create Flows.", { ts: ap - 3000 }),
    tk("w2", "Set `WA_WABA_ID` in `.env`. It's needed to list templates.", { ts: ap - 2000 }),
    tk("g", "Get gosolr its own WhatsApp number before launch."),
    tk("e", "Add `.env.example` with every key."),
    tk("later", "Get gosolr its own WhatsApp number, again.", { ts: ap + 1000 }),
    tk("other", "Get gosolr its own WhatsApp number.", { repo: "elsewhere" }),
    tk("kept", "Set `WA_WABA_ID` for staging too.", { kept: true }),
    tk("pending", "Drop the `foo` task", { review: true }),
  ];
  const nRemoved = applyRemovals(tl), stOf = (id) => tl.find((x) => x.id === id);
  ok("merge keeps the newest of the tasks it names and archives the rest as merged", nRemoved === 2 && stOf("w1").archived && stOf("w1").merged && stOf("w1").removedBy === "m" && !stOf("w2").archived, tl);
  ok("drop archives the task it names ('s and \"its\" aside)", stOf("g").archived && stOf("g").removedBy === "d" && !stOf("g").merged, stOf("g"));
  ok("leaves tasks named after \"task\", added since, in another repo, or restored", !stOf("e").archived && !stOf("later").archived && !stOf("other").archived && !stOf("kept").archived, tl);
  ok("a second pass removes nothing more", applyRemovals(tl) === 0, "");
  ok("only a Drop/Merge … task with a quoted name counts", !removalOf("Remove the `WA_WABA_ID` check from config") && !removalOf("Drop the old tasks") && removalOf("Remove the “x y” task").phrases[0] === "x y", "");

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
    out.shown = a.agentsList()[0].held;
    await until(() => job.status !== "running" && !existsSync(next));
    out.after = readFileSync(f, "utf8"); out.nextGone = !existsSync(next);
    const auto = a.HANDOFFS[0]; out.autoStarted = a.HANDOFFS.length === 2 && auto !== job && auto.fromHeld && auto.status === "running";
    out.shownAfter = a.agentsList()[0].held;
    a.writeTasks(dir, "- [x] A\\n"); // held again, but nothing left open in it
    await until(() => auto.status !== "running" && !existsSync(next));
    out.noLoop = a.HANDOFFS.length === 2;
    writeFileSync(next, "- [ ] stale\\n"); out.supersede = a.writeTasks(dir, "- [ ] D\\n");
    out.superseded = !existsSync(next) && readFileSync(f, "utf8") === "- [ ] D\\n";
    // an agent \`symbiot push --open\` started: the CLI that owns its lock has exited
    const { spawn } = await import("node:child_process");
    const ext = spawn("sleep", ["1"]), exited = new Promise((r) => ext.on("exit", r));
    writeFileSync(dir + "/.symbiot/agent.pid", JSON.stringify({ pid: ext.pid, id: "ext", startedAt: Date.now(), owner: 2147483646 }));
    a.setHandoffCmd("true");
    out.extHeld = a.writeTasks(dir, "- [x] D\\n- [ ] E\\n"); out.extAuto = a.runningHandoff(dir).auto;
    out.extEarly = a.startHeldTasks(dir);
    await exited;
    const ext2 = a.startHeldTasks(dir); out.extStarted = !!ext2 && ext2.fromHeld && readFileSync(f, "utf8") === "- [x] D\\n- [ ] E\\n";
    out.extOnce = a.startHeldTasks(dir) === null;
    await until(() => ext2.status !== "running");
    console.log(JSON.stringify(out));`], { encoding: "utf8", timeout: 30000, env: { ...process.env, HOME: hhome, USERPROFILE: hhome } });
  let hv = {}; try { hv = JSON.parse(hd.stdout.trim().split("\n").pop()); } catch { console.log(hd.stdout, hd.stderr); }
  ok("no agent running -> TASKS.md is written straight away", hv.freeHeld === false, hv);
  ok("agent running -> the new brief is held, its TASKS.md untouched", hv.busyHeld === true && hv.during === "- [ ] A\n- [ ] B\n" && hv.earlyRelease === false, hv);
  ok("the agent's block lists the held tasks' titles", JSON.stringify(hv.shown) === '["A","B","C"]' && hv.shownAfter === null, hv);
  ok("once it exits the held brief lands, keeping the agent's ticks", hv.nextGone && hv.after === "- [x] A\n- [ ] B\n- [ ] C\n", hv.after);
  ok("...and an agent starts on it by itself", hv.autoStarted, hv);
  ok("a held brief with nothing open lands without starting another", hv.noLoop, hv);
  ok("a later send when free replaces a leftover held brief", hv.supersede === false && hv.superseded, hv);
  ok("held for a push --open agent: nothing starts while it runs", hv.extHeld === true && hv.extAuto === false && hv.extEarly === null, hv);
  ok("...and once it has exited, the next check starts one on the held tasks, once", hv.extStarted && hv.extOnce, hv);

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
  // a branch whose earlier PR was squash-merged: main has its changes under another
  // history, so a new PR from it can't merge. The next approve starts afresh from main.
  const sqRepo = build("ship-sq", `git init -q -b main && git config user.email ci@symbiot.test && git config user.name "Symbiot CI" && echo a > a.txt && git add . && git commit -qm init
    git clone -q --bare . ../ship-sq-remote.git && git remote add origin ../ship-sq-remote.git && git fetch -q origin && git remote set-head origin main
    git switch -q -c feat && echo b >> a.txt && git commit -qam one && echo c >> a.txt && git commit -qam two && git push -q -u origin feat
    git switch -q main && git merge -q --squash feat && git commit -qm "feat (#1)" && git push -q origin main && git switch -q feat
    echo next > next.txt`);
  const gs = (a) => execSync("git " + a, { cwd: sqRepo, encoding: "utf8", env: gitEnv }).trim();
  const rs = shipChanges(sqRepo, ["Next thing"], { pr: false });
  ok("squash-merged branch -> the next approve starts a fresh symbiot/ branch from origin/main", rs.ok && rs.branch === "symbiot/next-thing" && gs("rev-parse HEAD~1") === gs("rev-parse origin/main") && /already merged/.test(rs.note || "") && rs.pushed, rs);
  ok("...carrying only the new changes (the merged ones aren't in it twice)", gs("show --name-only --format= HEAD") === "next.txt" && gs("rev-parse feat") === gs("rev-parse origin/feat"), gs("show --name-only --format= HEAD"));
  writeFileSync(join(sqRepo, "more.txt"), "more\n");
  const rs2 = shipChanges(sqRepo, ["More"], { push: false });
  ok("a branch with work main doesn't have stays put", rs2.ok && rs2.branch === "symbiot/next-thing" && !rs2.note, rs2);

  console.log("REVIEW — agent ticks -> awaiting review (not archived) -> send back / approve");
  // isolated HOME: the cycle reads and writes Symbiot's real task store
  const home = join(ROOT, "rhome"), proj = join(home, "projects", "revapp");
  mkdirSync(proj, { recursive: true });
  execSync(`git init -q -b main && git config user.email ci@symbiot.test && git config user.name "Symbiot CI" && echo a > a.txt && git add . && git commit -qm init`, { cwd: proj, env: gitEnv });
  const cycle = `
    import * as m from ${JSON.stringify(INDEX)};
    import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
    const f = ${JSON.stringify(join(proj, ".symbiot", "TASKS.md"))};
    // an agent still running in the repo: its lock, with a live pid (this one)
    const lock = f.replace("TASKS.md", "agent.pid"), busy = (fn) => { writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: Date.now() })); try { return fn(); } finally { unlinkSync(lock); } };
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
    out.busy = busy(() => ({ pending: m.pendingReview(), approve: m.approveRepo("revapp", { push: false }), ac: m.approveChanges("revapp", { push: false }), head: readFileSync(${JSON.stringify(join(proj, ".git", "HEAD"))}, "utf8") }));
    out.approve = m.approveRepo("revapp", { push: false }); out.final = tasks()[0];
    // a change no ticked task covers, in a repo that still has an open task
    writeFileSync(${JSON.stringify(join(home, ".config", "symbiot", "tasks.json"))}, JSON.stringify([...tasks(), { id: "t2", text: "Open task", repo: "revapp", done: false, ts: 2 }]));
    writeFileSync(${JSON.stringify(join(proj, "b.txt"))}, "fix\\n");
    out.untasked = m.pendingReview();
    out.busyUntasked = busy(() => ({ pending: m.pendingReview(), ac: m.approveChanges("revapp", { push: false }) }));
    out.ac = m.approveChanges("revapp", { push: false }); out.acTasks = tasks();
    out.acAgain = m.approveChanges("revapp", { push: false });
    // tasks held for an agent no Symbiot process is watching: the app's next check starts one
    writeFileSync(f.replace("TASKS.md", "TASKS.next.md"), "- [ ] Open task\\n"); m.setHandoffCmd("true");
    out.heldSync = m.syncTasks(); out.heldSync2 = m.syncTasks();
    // adding a task that's already open in the same repo gives that task back
    out.d1 = m.addTask("Dedupe me", "revapp"); out.d2 = m.addTask("  dedupe   ME ", "revapp"); out.d3 = m.addTask("Dedupe me", "otherrepo");
    writeFileSync(${JSON.stringify(join(home, ".config", "symbiot", "tasks.json"))}, JSON.stringify(tasks().map((x) => x.id === out.d1.id ? { ...x, done: true } : x)));
    out.d4 = m.addTask("Dedupe me", "revapp");
    out.dCount = tasks().filter((x) => /dedupe me/i.test(x.text)).length;
    // near-duplicates (#81: a colon for a full stop; #70: one clause more)
    const gm = "Add Gmail under Settings → Trusted sites as \`mail.google.com\` (or \`google.com\` for all of Google)";
    out.n1 = m.addTask(gm + ". \\"gmail\\" opens gmail.com", "revapp"); out.n2 = m.addTask(gm + ": \\"gmail\\" opens gmail.com", "revapp");
    const del = "Delete the leftover release branches that tags were cut from (release-032, sync-031, feature/self-work), now that releases come from main only.";
    out.e1 = m.addTask(del, "revapp"); out.e2 = m.addTask(del + " Also \`agent/ui-split\`: its WIP is already on main.", "revapp"); out.e3 = m.addTask(del, "revapp");
    out.short1 = m.addTask("Fix the login bug", "revapp"); out.short2 = m.addTask("Fix the login bug on Safari", "revapp");
    out.nCount = tasks().filter((x) => !x.done && (/gmail/i.test(x.text) || /leftover release/.test(x.text))).length;
    // the agent ticks the old wording of the task that has since taken the longer one
    writeFileSync(f, "- [x] " + del + "\\n"); m.syncTasks();
    out.eAfter = tasks().find((x) => x.id === out.e1.id);
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
  const ob = o.busy || {}, obu = o.busyUntasked || {};
  ok("while the repo's agent still runs, its review card says so (and not once it's done)", ob.pending && ob.pending[0] && ob.pending[0].running === true && o.pending[0].running === false && obu.pending && obu.pending[0] && obu.pending[0].running === true && o.untasked[0].running === false, [ob.pending, obu.pending]);
  ok("Approve and approve-without-a-task refuse while the agent still runs, nothing committed", ob.approve && ob.approve.running && /still working/.test(ob.approve.error) && ob.ac && ob.ac.running && obu.ac && obu.ac.running && /still working/.test(obu.ac.error) && /refs\/heads\/main/.test(ob.head || ""), [ob.approve, ob.ac, obu.ac, ob.head]);
  ok("approve commits on a branch, then archives with the commit", o.approve && o.approve.approved === 1 && /^symbiot\/fix-the-bug/.test(o.approve.branch) && o.final.archived && o.final.done && o.final.commit === o.approve.commit, o.approve);
  ok("untasked changes in a repo that got tasks show up for approval", o.untasked && o.untasked.length === 1 && o.untasked[0].untasked && o.untasked[0].tasks.length === 0 && o.untasked[0].files.some((x) => x.file === "b.txt"), o.untasked);
  const acMsg = o.ac && o.ac.commit ? execSync("git log -1 --format=%B " + o.ac.commit, { cwd: proj, encoding: "utf8", env: gitEnv }) : "";
  ok("approve changes without a task commits them, tasks untouched", o.ac && o.ac.ok && o.ac.approved === 0 && /without a task/.test(acMsg) && o.acTasks.find((x) => x.id === "t2" && !x.done && !x.review), o.ac);
  ok("nothing left -> approve changes without a task says so", o.acAgain && /No uncommitted changes/.test(o.acAgain.error || ""), o.acAgain);
  ok("checking tasks starts an agent on held tasks whose agent has finished, once", o.heldSync && o.heldSync.started === 1 && o.heldSync2.started === 0, [o.heldSync, o.heldSync2]);
  ok("adding a task already open in the same repo returns it, no duplicate", o.d1 && o.d2 && o.d2.duplicate && o.d2.id === o.d1.id && !o.d1.duplicate, [o.d1, o.d2]);
  ok("the same text in another repo, or once the first is done, is a new task", o.d3 && !o.d3.duplicate && o.d3.id !== o.d1.id && o.d4 && !o.d4.duplicate && o.d4.id !== o.d1.id && o.dCount === 3, [o.d3, o.d4, o.dCount]);
  ok("the same task with different punctuation is a duplicate, kept in its first words", o.n2 && o.n2.duplicate && o.n2.id === o.n1.id && !o.n2.reworded && o.n2.text === o.n1.text, [o.n1, o.n2]);
  ok("the same task with a clause more is a duplicate that takes the longer words, and not back", o.e2 && o.e2.duplicate && o.e2.reworded && o.e2.id === o.e1.id && /Also/.test(o.e2.text) && o.e3 && o.e3.duplicate && /Also/.test(o.e3.text) && o.nCount === 2, [o.e2, o.e3, o.nCount]);
  ok("a short task with more words on the end is still its own task", o.short2 && !o.short2.duplicate && o.short2.id !== o.short1.id, [o.short1, o.short2]);
  ok("an agent's tick on the old wording still sends the reworded task to review", o.eAfter && o.eAfter.review === true, o.eAfter);
  ok("sameTask: case, spacing and punctuation aside; a clause more only after 8+ words", sameTask("Fix it: `now`", "fix it (now)") && !sameTask("Fix the bug", "Fix the bug in the login form") && sameTask("one two three four five six seven eight", "One two three four five six seven eight, nine.") && !sameTask("one two three four five six seven eight", "one two three four five six seven eighty") && !sameTask("", ""), "");
  ok("uniqueTasks keeps one of each, in the words that say the most", JSON.stringify(uniqueTasks(["a b c d e f g h", "Other", "A b c d e f g h, i j.", "other!"])) === JSON.stringify(["A b c d e f g h, i j.", "Other"]), uniqueTasks(["a b c d e f g h", "Other", "A b c d e f g h, i j.", "other!"]));

  console.log("RELEASE — warn when the default branch is past its last v* tag");
  const rel = build("release", `git init -q -b main && git config user.email t@x.co && git config user.name T
    echo '{"name":"x","version":"1.0.0"}' > package.json && git add . && git commit -qm init && git tag v1.0.0`);
  const relEnv = { cwd: rel, env: gitEnv };
  const ur0 = unreleased(rel);
  execSync(`echo b > b && git add . && git commit -qm feat && echo c > c && git add . && git commit -qm fix`, relEnv);
  const ur1 = unreleased(rel);
  writeFileSync(join(rel, "package.json"), '{"name":"x","version":"1.1.0"}\n');
  const ur2 = unreleased(rel);
  const plain = build("release-none", `git init -q -b main && git config user.email t@x.co && git config user.name T && echo a > a && git add . && git commit -qm init && echo b > b && git add . && git commit -qm two`);
  ok("on the tag: nothing unreleased", ur0 === null, ur0);
  ok("two commits past v1.0.0: says how far, on which branch", ur1 && ur1.tag === "v1.0.0" && ur1.ahead === 2 && ur1.base === "main" && !ur1.bump, ur1);
  ok("changes that bump package.json's version say what to tag", ur2 && ur2.bump === "1.1.0", ur2);
  ok("a repo with no v* tags isn't warned about", unreleased(plain) === null, unreleased(plain));

  console.log("RELEASE — Approve can bump the version in the PR itself");
  const bmp = build("release-bump", `git init -q -b main && git config user.email t@x.co && git config user.name T
    printf '{\\n    "name": "x",\\n    "version": "2.3.4"\\n}\\n' > package.json
    printf '{\\n  "name": "x",\\n  "version": "2.3.4",\\n  "lockfileVersion": 3,\\n  "packages": {\\n    "": {\\n      "name": "x",\\n      "version": "2.3.4"\\n    },\\n    "node_modules/y": {\\n      "version": "2.3.4"\\n    }\\n  }\\n}\\n' > package-lock.json
    git add . && git commit -qm init && git tag v2.3.4`);
  const bEnv = { cwd: bmp, env: gitEnv, encoding: "utf8" };
  const bof = bumpOffer(bmp);
  ok("offered when the committed version is released (its v* tag exists): patch and minor", bof && bof.version === "2.3.4" && bof.patch === "2.3.5" && bof.minor === "2.4.0", bof);
  ok("not offered when the changes already bump it, or there's no package.json", bumpOffer(rel) === null && bumpOffer(plain) === null, [bumpOffer(rel), bumpOffer(plain)]);
  writeFileSync(join(bmp, "a.txt"), "feature\n");
  const bkp = shipWithBump(bmp, ["Add a feature"], { push: false, bump: "" });
  ok("no bump asked: shipped as it was", bkp.ok && !bkp.bumped && /"2\.3\.4"/.test(execSync("git show HEAD:package.json", bEnv)), bkp);
  execSync("git checkout -q main", bEnv); writeFileSync(join(bmp, "b.txt"), "fix\n");
  const bsh = shipWithBump(bmp, ["Fix a thing"], { push: false, bump: "minor" });
  const bPkg = execSync("git show HEAD:package.json", bEnv), bLock = JSON.parse(execSync("git show HEAD:package-lock.json", bEnv)), bMsg = execSync("git log -1 --format=%B", bEnv);
  ok("bump: package.json gets the new version, in its own indent, in the same commit", bsh.ok && bsh.bumped === "2.4.0" && bPkg === '{\n    "name": "x",\n    "version": "2.4.0"\n}\n', [bsh, bPkg]);
  ok("bump: the lockfile's own version follows; a dependency's doesn't", bLock.version === "2.4.0" && bLock.packages[""].version === "2.4.0" && bLock.packages["node_modules/y"].version === "2.3.4", bLock);
  ok("bump: the commit (and PR) say which tag to push after merging", /Bumps the version to 2\.4\.0\. After this merges, tag v2\.4\.0 on main/.test(bMsg), bMsg);
  execSync("git checkout -q main && git merge -q --ff-only " + bsh.branch + " && git tag v2.4.0 && git checkout -q --detach", bEnv); writeFileSync(join(bmp, "c.txt"), "more\n");
  const bfl = shipWithBump(bmp, ["Fails"], { push: false, bump: "patch" });
  const nbm = build("release-npm", `git init -q -b main && git config user.email t@x.co && git config user.name T && echo '{"name":"@me/x","version":"1.2.3"}' > package.json && git add . && git commit -qm init`);
  const npmReg = createServer((q, r) => { const yes = q.url === "/@me%2Fx/1.2.3"; r.writeHead(yes ? 200 : 404, { "content-type": "application/json" }); r.end(yes ? '{"version":"1.2.3"}' : "{}"); }).listen(0, "127.0.0.1");
  await new Promise((r) => npmReg.on("listening", r));
  const npmAt = `http://127.0.0.1:${npmReg.address().port}`, nb0 = bumpOffer(nbm), nl1 = await learnNpm([nbm], npmAt), nb1 = bumpOffer(nbm);
  execSync(`echo '{"name":"@me/x","version":"1.2.4"}' > package.json && git commit -qam next`, { cwd: nbm, env: gitEnv });
  const nl2 = await learnNpm([nbm], npmAt), nb2 = bumpOffer(nbm); npmReg.close();
  ok("no v* tag: offered once npm has the committed version (a repo that publishes on merge)", nb0 === null && nl1 === true && nb1 && nb1.version === "1.2.3" && nb1.minor === "1.3.0", [nb0, nl1, nb1]);
  ok("no v* tag: not offered for a version npm doesn't have", nl2 === false && nb2 === null, [nl2, nb2]);
  ok("a ship that fails puts the version back", bfl.error && /Detached HEAD/.test(bfl.error) && /"2\.4\.0"/.test(readFileSync(join(bmp, "package.json"), "utf8")) && /"2\.4\.0"/.test(readFileSync(join(bmp, "package-lock.json"), "utf8")), [bfl, readFileSync(join(bmp, "package.json"), "utf8")]);

  console.log("RELEASE — a repo that publishes on merge is measured from npm, not a stale v* tag");
  // v1.0.0 tagged; 1.0.1 set and published with no tag (a ruleset blocked it); two commits since
  const pom = build("release-pom", `git init -q -b main && git config user.email t@x.co && git config user.name T && mkdir -p .github/workflows
    printf 'on:\\n  push:\\n    branches: [main]\\njobs:\\n  publish:\\n    steps:\\n      - run: npm publish\\n' > .github/workflows/publish.yml
    printf '{\\n  "name": "pom-x",\\n  "version": "1.0.0"\\n}\\n' > package.json && git add . && git commit -qm init && git tag v1.0.0
    sed -i 's/1\\.0\\.0/1.0.1/' package.json && git commit -qam "fix (1.0.1)"
    echo a > a && git add . && git commit -qm "feat a" && echo b > b && git add . && git commit -qm "feat b"`);
  const tagOnly = build("release-tagwf", `git init -q -b main && mkdir -p .github/workflows && printf 'on:\\n  push:\\n    tags: [v*]\\njobs:\\n  p:\\n    steps:\\n      - run: npm publish\\n' > .github/workflows/p.yml`);
  ok("publishes on merge: npm publish on a branch push; not on a tag push, or with no workflow", publishesOnMerge(pom) && !publishesOnMerge(tagOnly) && !publishesOnMerge(rel), [publishesOnMerge(pom), publishesOnMerge(tagOnly), publishesOnMerge(rel)]);
  const pomReg = createServer((q, r) => { const yes = q.url === "/pom-x/1.0.1"; r.writeHead(yes ? 200 : 404, { "content-type": "application/json" }); r.end(yes ? '{"version":"1.0.1"}' : "{}"); }).listen(0, "127.0.0.1");
  await new Promise((r) => pomReg.on("listening", r));
  const pomAt = `http://127.0.0.1:${pomReg.address().port}`, pEnv = { cwd: pom, env: gitEnv, encoding: "utf8" };
  const pu0 = unreleased(pom); await learnNpm([pom], pomAt); const pu1 = unreleased(pom);
  ok("not measured from v1.0.0 before npm is known", pu0 === null, pu0);
  ok("counts the commits since the one that set the version npm has (2 past 1.0.1, not 3 past v1.0.0)", pu1 && pu1.npm && pu1.since === "1.0.1" && pu1.ahead === 2 && !pu1.tag, pu1);
  writeFileSync(join(pom, "c"), "c\n");
  const psh = shipWithBump(pom, ["Fix c"], { push: false, bump: "patch" }), pMsg = execSync("git log -1 --format=%B", pEnv);
  ok("a bump says it publishes on merge, with no tag to push by hand", psh.bumped === "1.0.2" && /It publishes to npm when this merges\./.test(pMsg) && !/tag v/.test(pMsg), [psh, pMsg]);
  execSync("git checkout -q main && git merge -q --ff-only " + psh.branch, pEnv);
  await learnNpm([pom], pomAt); const pu2 = unreleased(pom); pomReg.close();
  ok("a merged bump npm doesn't have yet is due to publish", pu2 && pu2.npm && pu2.pending === "1.0.2", pu2);

  console.log("GRANT — Allow command keeps a Tool(spec) rule as it is and wraps only a bare command");
  ok("bare command -> wrapped once", grantRule("npm install") === "Bash(npm install:*)" && grantRule("python3") === "Bash(python3:*)", [grantRule("npm install"), grantRule("python3")]);
  ok("a rule already in Bash(…) form is kept, with or without the quotes it has in the command (was Bash(Bashnpm install:*:*))", grantRule("Bash(npm install:*)") === "Bash(npm install:*)" && grantRule('"Bash(npm install:*)"') === "Bash(npm install:*)" && grantRule("'Read(~/x/**)'") === "Read(~/x/**)", [grantRule('"Bash(npm install:*)"'), grantRule("'Read(~/x/**)'")]);
  ok("a bare command typed with :* or quotes isn't doubled; empty gives nothing", grantRule("npm run lint:*") === "Bash(npm run lint:*)" && grantRule('"git rm --cached"') === "Bash(git rm --cached:*)" && grantRule('  ""  ') === "", [grantRule("npm run lint:*"), grantRule('"git rm --cached"')]);

  console.log("WHO ACTS — question options say whether the user or the agent does it");
  ok("the brief tells agents to start each option with 👤 You: / 🤖 Agent:", /`👤 You:`/.test(buildTasksMd("x", {}, [{ text: "t" }])) && /`🤖 Agent:`/.test(buildTasksMd("x", {}, [{ text: "t" }])) && /Tag actions only/.test(buildTasksMd("x", {}, [{ text: "t" }])), "");
  const uiJs = [...EMBEDDED_UI.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const whoHtml = new Function(uiJs.slice(uiJs.indexOf("function esc("), uiJs.indexOf("\n", uiJs.indexOf("function whoHtml("))) + "; return whoHtml;")();
  const wh = whoHtml("👤 You: allow it <b>. 🤖 Agent: the next run adds it");
  ok("the card shows the markers as You / Agent badges, escaped, and leaves 'Your' and plain options alone", /class='who you'>&#128100; You</.test(wh) && /class='who agent'>&#129302; Agent</.test(wh) && /&lt;b&gt;/.test(wh) && !/👤|🤖/.test(wh) && /You<\/span> Your call/.test(whoHtml("👤 Your call")) && whoHtml("Plain") === "Plain", [wh, whoHtml("👤 Your call")]);

  console.log("QUESTIONS — any agent's .symbiot/QUESTIONS.md parses into questions, options and ideas");
  const pq = parseQuestions("# Questions for you\n\n## Questions\n### Keep the old config format?\nReading both costs ~40 lines.\n- Yes, read both (recommended)\n- No, migrate once\n\n### Which port?\n1. 7391\n2. random\n\n## Suggestions\n- Add a --json flag to drift\n- [ ] Cache the map scan\n");
  ok("two questions, in order", pq.questions.length === 2 && pq.questions[0].q === "Keep the old config format?" && pq.questions[1].q === "Which port?", pq.questions);
  ok("context and options attach to their question", pq.questions[0].context === "Reading both costs ~40 lines." && pq.questions[0].options.join("|") === "Yes, read both (recommended)|No, migrate once" && pq.questions[1].options.join("|") === "7391|random", pq.questions);
  ok("suggestions are their own list (checkbox bullets too)", pq.suggestions.join("|") === "Add a --json flag to drift|Cache the map scan", pq.suggestions);
  const longIdea = "Next steps: " + "x".repeat(900), longOpt = "👤 You: " + "y".repeat(700);
  const pl = parseQuestions(`## Questions\n### Long?\n- ${longOpt}\n\n## Suggestions\n- ${longIdea}\n- ${"z".repeat(1200)}\n`);
  ok("a long idea or option arrives whole, up to the 1000 a task holds", pl.suggestions[0] === longIdea && pl.questions[0].options[0] === longOpt && pl.suggestions[1].length === 1000, pl.suggestions.map((s) => s.length));
  // an idea for another project names it: an agent on coral with an idea for Symbiot
  const aqDir = join(ROOT, "aq"), aqHome = join(ROOT, "aqhome");
  mkdirSync(join(aqDir, ".symbiot"), { recursive: true }); mkdirSync(join(aqHome, ".config", "symbiot"), { recursive: true });
  writeFileSync(join(aqDir, ".symbiot", "QUESTIONS.md"), "## Suggestions\n- [repo: symbiot] Watch GitHub too\n- Cache the map scan\n- [Repo:coral]  Same repo, named\n- [WIP] Not a repo tag\n");
  writeFileSync(join(aqHome, ".config", "symbiot", "tasks.json"), JSON.stringify([{ id: "a", text: "Watch GitHub too", repo: "symbiot", done: false }]));
  const aq = spawnSync(process.execPath, ["--input-type=module", "-e", `import { agentQuestions } from ${JSON.stringify(join(dirname(INDEX), "agents.mjs"))}; console.log(JSON.stringify(agentQuestions(${JSON.stringify(aqDir)}, "coral").suggestions));`], { encoding: "utf8", env: { ...process.env, HOME: aqHome, USERPROFILE: aqHome } });
  let ideas = []; try { ideas = JSON.parse(aq.stdout); } catch { console.log(aq.stdout, aq.stderr); }
  ok("an idea starting [repo: symbiot] goes to symbiot's tasks (and shows it's there), not the agent's repo's", ideas[0] && ideas[0].text === "Watch GitHub too" && ideas[0].repo === "symbiot" && ideas[0].other && ideas[0].added, ideas[0]);
  ok("...ideas naming no repo, or their own, stay with the agent's repo; other brackets are just text", ideas.slice(1).map((x) => `${x.repo}:${x.other}:${x.text}`).join("|") === "coral:false:Cache the map scan|coral:false:Same repo, named|coral:false:[WIP] Not a repo tag", ideas.slice(1));
  ok("the brief tells agents how to name another project", /`- \[repo: symbiot\] …`/.test(buildTasksMd("x", {}, [{ text: "t" }])), "");
  const loose = parseQuestions("- Should I delete the legacy folder?\n- Rename it instead?");
  ok("bare bullets with no headings are still questions", loose.questions.length === 2 && loose.questions[0].options.length === 0, loose);
  // regression: a preamble file-list (bullets NOT ending in "?") before the
  // questions must not become questions — only the real "### …?" one does.
  const pre = parseQuestions("I updated:\n- the gen script;\n- the PayFast path;\n- docs/README.md.\n\n## Questions\n### Fix the gate?\n- yes\n- no");
  ok("preamble list bullets are not questions", pre.questions.length === 1 && pre.questions[0].q === "Fix the gate?" && pre.questions[0].options.length === 2, pre.questions);
  // a step that needs a release: shown next to the installed and npm versions; no "Done" until it's possible
  const rn = [releaseNeeded("Once 0.39.0 or later is installed: does it land? ydotool 0.1.8 may miss", "0.40.1"), releaseNeeded("Approve, and 0.41.0 publishes", "0.40.1"), releaseNeeded("Node 22.1.0 or 0.42.0", "0.40.1"), releaseNeeded("Keep it?", "0.40.1")];
  ok("releaseNeeded: the highest version in the package's own line, up to its next minor", rn.join("|") === "0.39.0|0.41.0||", rn);
  const relRepo = build("release-ask", `echo '{"name":"rel-ask-x","version":"1.4.0"}' > package.json`);
  const relReg = createServer((q, r) => { const yes = q.url === "/rel-ask-x"; r.writeHead(yes ? 200 : 404, { "content-type": "application/json" }); r.end(yes ? '{"dist-tags":{"latest":"1.4.0"}}' : "{}"); }).listen(0, "127.0.0.1");
  await new Promise((r) => relReg.on("listening", r));
  const relAsk = { questions: [{ q: "Once 1.5.0 is installed: does it work?", context: "", options: ["Done: it works", "Not tried yet"] }, { q: "Does it look right?", context: "Since 1.4.0 it should.", options: [] }, { q: "Keep it?", context: "", options: [] }] };
  await withReleases([{ path: relRepo, ask: relAsk }, { path: join(ROOT, "nowhere"), ask: { questions: [{ q: "Is 2.0.0 out?", context: "", options: [] }] } }], `http://127.0.0.1:${relReg.address().port}`); relReg.close();
  const [rq0, rq1, rq2] = relAsk.questions;
  ok("a question needing a release npm doesn't have yet is marked as waiting on npm, with both versions", rq0.release && rq0.release.name === "rel-ask-x" && rq0.release.needs === "1.5.0" && rq0.release.npm === "1.4.0" && rq0.release.installed === "" && rq0.release.waiting === "npm", rq0.release);
  ok("...one npm has is possible now; one naming no version, or in a folder with no package, isn't marked", rq1.release && rq1.release.waiting === "" && !rq2.release, [rq1.release, rq2.release]);
  const DONEOPT = new Function("return " + (EMBEDDED_UI.match(/var DONEOPT=(\/.*?\/i);/) || [])[1])();
  ok("the page holds back answers saying it's done or tried, not the others", ["Done both: map my inbox", "Done", "It clicked the right spot on both displays", "It looks right: my projects are on the Map", "Tried it, it missed"].every((s) => DONEOPT.test(s)) && !["Not done yet", "Not tried yet", "Yes: approve it now", "Doner kebab", "Trusted sites still isn't in Settings"].some((s) => DONEOPT.test(s)), DONEOPT);
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

  console.log("SCREENS — a screenshot's regions are kept in its pixels, with a centre to aim at");
  // header-only PNG: signature + IHDR (all pngSize reads); 1920x1080
  const png = (w, h) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
  ok("pngSize reads a PNG's width and height", JSON.stringify(pngSize(png(1920, 1080))) === '{"w":1920,"h":1080}', pngSize(png(1920, 1080)));
  ok("pngSize refuses what isn't a PNG", pngSize(Buffer.from("GIF89a not a png at all, really")) === null, "");
  ok("captureCmds: macOS uses screencapture, Linux tries several tools", captureCmds("/t/a.png", "darwin")[0][0] === "screencapture" && captureCmds("/t/a.png", "linux").map((c) => c[0]).includes("gnome-screenshot"), captureCmds("/t/a.png", "linux"));
  const ck = (p, w, y1) => clickCmds(120, 60, p, w, y1).map((steps) => steps.map(([c, a]) => c + " " + a.join(" ")).join(" && "));
  ok("clickCmds: cliclick on macOS, at the point", JSON.stringify(ck("darwin")) === '["cliclick c:120,60"]', ck("darwin"));
  ok("clickCmds: X11 tries xdotool, then ydotool", JSON.stringify(ck("linux", false)) === '["xdotool mousemove --sync 120 60 click 1","ydotool mousemove 120 60 && ydotool click 1"]', ck("linux", false));
  ok("clickCmds: Wayland skips xdotool (it only reaches X11 windows)", ck("linux", true).length === 1 && /^ydotool /.test(ck("linux", true)[0]), ck("linux", true));
  ok("clickCmds: ydotool 1.x moves --absolute and clicks with a button code", ck("linux", true, true)[0] === "ydotool mousemove --absolute -x 120 -y 60 && ydotool click 0xC0", ck("linux", true, true));
  const win = clickCmds(120, 60, "win32"), winPs = win.length === 1 && win[0].length === 1 && win[0][0][0] === "powershell" ? Buffer.from(win[0][0][1].at(-1), "base64").toString("utf16le") : "";
  ok("clickCmds: Windows clicks with PowerShell, DPI-aware, at the point past the virtual screen's corner", win[0] && win[0][0][1].includes("-EncodedCommand") && /SetProcessDPIAware\(\) \| Out-Null/.test(winPs) && /SetCursorPos\(\$b\.Left \+ 120, \$b\.Top \+ 60\)/.test(winPs) && /mouse_event\(2,.*mouse_event\(4,/.test(winPs), winPs);
  const winCap = captureCmds("C:\\t\\a.png", "win32")[0], winCapPs = Buffer.from(winCap[1].at(-1), "base64").toString("utf16le");
  ok("captureCmds: Windows capture is DPI-aware too, so its pixels are the ones a click uses", winCap[0] === "powershell" && /SetProcessDPIAware/.test(winCapPs) && winCapPs.includes("Save('C:\\t\\a.png'"), winCapPs);
  ok("clickCmds: a coordinate is always a whole number (it goes into a script)", clickCmds("1;rm", 2.6, "win32").length === 1 && /\$b\.Left \+ 0, \$b\.Top \+ 3\)/.test(Buffer.from(clickCmds("1;rm", 2.6, "win32")[0][0][1].at(-1), "base64").toString("utf16le")), "");
  ok("captureCmds: macOS can take one display (-D), the main one by default", captureCmds("/t/a.png", "darwin", false, 2)[0][1].join(" ") === "-x -D 2 -t png /t/a.png" && !captureCmds("/t/a.png", "darwin")[0][1].includes("-D"), captureCmds("/t/a.png", "darwin", false, 2));
  ok("clickCmds: cliclick gets =-N for a display left of or above the main one (plain -N is relative)", JSON.stringify(clickCmds(-300, -20, "darwin")) === '[[["cliclick",["c:=-300,=-20"]]]]', clickCmds(-300, -20, "darwin"));

  console.log("SCREENS — several displays: where each one is, and one screen per display");
  const cosmic = `output "eDP-1" enabled=#true {\n  description model=""\n  position 1600 0\n  scale 1.00\n  transform "normal"\n  modes {\n    mode 1920 1080 59999 current=#true preferred=#true\n    mode 1920 1080 40000\n  }\n}\noutput "HDMI-A-1" enabled=#true {\n  description make="Lenovo Group Limited" model="E20-30"\n  position 0 0\n  scale 1.00\n  transform "normal"\n  modes {\n    mode 1600 900 60000 current=#true preferred=#true\n    mode 1440 900 70005\n  }\n}\noutput "DP-2" enabled=#false {\n  position 0 0\n  modes {\n    mode 800 600 60000 current=#true\n  }\n}\n`;
  const cm = parseCosmicRandr(cosmic);
  ok("cosmic-randr: enabled displays, their place and current mode (a disabled one is left out)", JSON.stringify(cm.map((m) => [m.name, m.x, m.y, m.w, m.h])) === '[["eDP-1",1600,0,1920,1080],["HDMI-A-1",0,0,1600,900]]' && cm[1].model === "Lenovo Group Limited E20-30", cm);
  const cs = parseCosmicRandr(`output "DP-1" enabled=#true {\n  position 0 0\n  scale 1.50\n  transform "rotate90"\n  modes {\n    mode 3840 2160 60000 current=#true\n  }\n}\n`);
  ok("cosmic-randr: a scaled, rotated display is its logical size, turned", JSON.stringify(cs.map((m) => [m.w, m.h])) === "[[1440,2560]]", cs);
  const wl = parseWlrRandr(JSON.stringify([{ name: "DP-1", make: "Dell", model: "U2720Q", enabled: true, position: { x: 0, y: 0 }, scale: 2, transform: "normal", modes: [{ width: 3840, height: 2160, current: true }] }, { name: "HDMI-A-1", enabled: false, position: { x: 1920, y: 0 }, modes: [{ width: 1920, height: 1080, current: true }] }]));
  ok("wlr-randr --json: logical size (mode / scale); a disabled output is left out", JSON.stringify(wl) === '[{"name":"DP-1","model":"Dell U2720Q","x":0,"y":0,"w":1920,"h":1080}]', wl);
  const kd = parseKscreen(JSON.stringify({ outputs: [{ name: "eDP-1", enabled: true, connected: true, pos: { x: 0, y: 0 }, scale: 1.25, rotation: 1, currentModeId: "2", modes: [{ id: "1", size: { width: 1280, height: 720 } }, { id: "2", size: { width: 2560, height: 1600 } }] }] }));
  ok("kscreen-doctor -j: the current mode, scaled", JSON.stringify(kd.map((m) => [m.name, m.w, m.h])) === '[["eDP-1",2048,1280]]', kd);
  const xr = parseXrandr("Monitors: 2\n 0: +*HDMI-A-1 1600/440x900/250+0+0  HDMI-A-1\n 1: +eDP-1 1920/340x1080/190+1600+0  eDP-1\n");
  ok("xrandr --listmonitors: each monitor's size and offset", JSON.stringify(xr.map((m) => [m.name, m.x, m.y, m.w, m.h])) === '[["HDMI-A-1",0,0,1600,900],["eDP-1",1600,0,1920,1080]]', xr);
  const wn = parseLines("\\\\.\\DISPLAY1|0|0|1920|1080\r\n\\\\.\\DISPLAY2|1920|120|2560|1440\r\n");
  ok("Windows/macOS lines: name|x|y|w|h, numbered for screencapture -D", JSON.stringify(wn.map((m) => [m.name, m.x, m.y, m.w, m.h, m.display])) === '[["DISPLAY1",0,0,1920,1080,1],["DISPLAY2",1920,120,2560,1440,2]]', wn);
  ok("monitorCmds: Wayland asks cosmic-randr, wlr-randr, kscreen-doctor, then xrandr; X11 xrandr", monitorCmds("linux", true).map((c) => c[0]).join(",") === "cosmic-randr,wlr-randr,kscreen-doctor,xrandr" && monitorCmds("linux", false).map((c) => c[0]).join(",") === "xrandr" && monitorCmds("win32")[0][0] === "powershell" && monitorCmds("darwin")[0][0] === "osascript", monitorCmds("linux", true).map((c) => c[0]));
  const tm = tidyMonitors(cm);
  ok("tidyMonitors: left to right, and which side each is on", JSON.stringify(tm.map((m) => m.name + ":" + m.where)) === '["HDMI-A-1:left","eDP-1:right"]', tm);
  const tv = tidyMonitors([{ name: "B", x: 0, y: 1080, w: 1920, h: 1080 }, { name: "A", x: 0, y: 0, w: 1920, h: 1080 }, { name: "M", x: 0, y: 0, w: 1920, h: 1080 }, { name: "", x: 0, y: 0, w: 9, h: 9 }]);
  ok("tidyMonitors: stacked displays are top/bottom; a mirrored pair is one display; nameless is dropped", JSON.stringify(tv.map((m) => m.name + ":" + m.where)) === '["A+M:top","B:bottom"]', tv);
  const tri = tidyMonitors([{ name: "C", x: 3840, y: 0, w: 1920, h: 1080 }, { name: "A", x: 0, y: 0, w: 1920, h: 1080 }, { name: "B", x: 1920, y: 0, w: 1920, h: 1080 }]);
  ok("tidyMonitors: three in a row are left, middle, right", tri.map((m) => m.where).join(",") === "left,middle,right", tri);
  const ar = monitorAreas(tm, 3520, 1080);
  ok("monitorAreas: each display's rectangle in a whole-desktop screenshot", ar && JSON.stringify(ar.map((a) => a.area)) === '[{"x":0,"y":0,"w":1600,"h":900},{"x":1600,"y":0,"w":1920,"h":1080}]', ar);
  const ar2 = monitorAreas(tm, 7040, 2160);
  ok("monitorAreas: a HiDPI capture (twice the layout) is scaled to fit", ar2 && JSON.stringify(ar2[1].area) === '{"x":3200,"y":0,"w":3840,"h":2160}', ar2);
  ok("monitorAreas: an image that isn't this layout (one display, or another setup) gives null", monitorAreas(tm, 1920, 1080) === null && monitorAreas(tm, 3520, 1440) === null && monitorAreas([tm[0]], 1600, 900) === null, "");
  // A real RGBA PNG whose pixel (x, y) is [x, y, x+y, 255], each row with one of
  // PNG's five filters in turn, so decoding undoes all of them.
  const realPng = (w, h) => {
    const st = w * 4, px = Buffer.alloc(st * h), out = Buffer.alloc((st + 1) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set([x, y, (x + y) & 255, 255], y * st + x * 4);
    const pa = (a, b, c) => { const p = a + b - c, q = Math.abs(p - a), r = Math.abs(p - b), s = Math.abs(p - c); return q <= r && q <= s ? a : r <= s ? b : c; };
    for (let y = 0; y < h; y++) { const f = y % 5, o = y * st; out[y * (st + 1)] = f;
      for (let i = 0; i < st; i++) { const a = i >= 4 ? px[o + i - 4] : 0, b = y ? px[o - st + i] : 0, c = y && i >= 4 ? px[o - st + i - 4] : 0;
        out[y * (st + 1) + 1 + i] = (px[o + i] - [0, a, b, (a + b) >> 1, pa(a, b, c)][f]) & 255; } }
    const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, "ascii"); d.copy(b, 8); return b; };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(out)), chunk("IEND", Buffer.alloc(0))]);
  };
  const big = realPng(8, 6), parts = splitPng(big, [{ x: 0, y: 0, w: 3, h: 6 }, { x: 3, y: 1, w: 5, h: 5 }]);
  const pixAt = (img, x, y) => [...img.px.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4)].join(",");
  const d0 = parts && pngDecode(parts[0]), d1 = parts && pngDecode(parts[1]);
  ok("splitPng: each piece is a PNG of its own size", d0 && d1 && d0.w === 3 && d0.h === 6 && d1.w === 5 && d1.h === 5, [d0 && [d0.w, d0.h], d1 && [d1.w, d1.h]]);
  ok("splitPng: every row filter decodes, and each piece has the right pixels", d0 && d1 && pixAt(d0, 2, 5) === "2,5,7,255" && pixAt(d1, 0, 0) === "3,1,4,255" && pixAt(d1, 4, 4) === "7,5,12,255" && pixAt(pngDecode(big), 6, 4) === "6,4,10,255", d1 && [pixAt(d1, 0, 0), pixAt(d1, 4, 4)]);
  ok("splitPng: pieces end with a valid IEND chunk (CRC included)", parts && parts[1].subarray(-12).toString("hex") === "0000000049454e44ae426082", parts && parts[1].subarray(-12).toString("hex"));
  // two 8×6 window shots, the second taken 4 rows further down: the second's rows are kept where they overlap
  const st = stitchPng([{ png: big, y: 0 }, { png: realPng(8, 6), y: 4 }], 10), sd = st && pngDecode(st);
  ok("stitchPng: window shots put together as one tall PNG; where they overlap, the later one's rows are kept", sd && sd.w === 8 && sd.h === 10 && pixAt(sd, 1, 3) === "1,3,4,255" && pixAt(sd, 1, 5) === "1,1,2,255" && pixAt(sd, 7, 9) === "7,5,12,255", sd && [sd.w, sd.h, pixAt(sd, 1, 3), pixAt(sd, 1, 5)]);
  // a list (box: rows 1-4, columns 2-5) scrolled 2 rows in the second shot, opened out 2 rows longer
  const sl = stitchListPng([{ png: big, y: 0 }, { png: realPng(8, 6), y: 2 }], { x: 2, y: 1, w: 4, h: 4 }, 2), sld = sl && pngDecode(sl);
  ok("stitchListPng: a list scrolled inside the window, opened out: above it as it was, each part in its place (the later kept), below it moved down", sld && sld.w === 8 && sld.h === 8 && pixAt(sld, 0, 0) === "0,0,0,255" && pixAt(sld, 3, 2) === "3,2,5,255" && pixAt(sld, 3, 3) === "3,1,4,255" && pixAt(sld, 3, 4) === "3,2,5,255" && pixAt(sld, 3, 6) === "3,4,7,255" && pixAt(sld, 0, 7) === "0,5,5,255", sld && [sld.h, pixAt(sld, 3, 3), pixAt(sld, 3, 6), pixAt(sld, 0, 7)]);
  ok("stitchListPng: beside the opened-out list, each column carries on in its colour at the list's bottom", sld && pixAt(sld, 0, 5) === "0,4,4,255" && pixAt(sld, 7, 6) === "7,4,11,255", sld && [pixAt(sld, 0, 5), pixAt(sld, 7, 6)]);
  ok("stitchListPng: a box outside the window, or shots that differ, give null", stitchListPng([{ png: big, y: 0 }], { x: 6, y: 0, w: 4, h: 4 }, 1) === null && stitchListPng([{ png: big, y: 0 }, { png: realPng(8, 5), y: 1 }], { x: 0, y: 0, w: 4, h: 4 }, 1) === null, "");
  ok("stitchPng: shots of different widths, or none, give null", stitchPng([{ png: big, y: 0 }, { png: realPng(5, 6), y: 6 }], 12) === null && stitchPng([], 10) === null, "");
  ok("splitPng: a rectangle outside the image, or a header-only PNG, gives null", splitPng(big, [{ x: 4, y: 0, w: 5, h: 6 }]) === null && splitPng(png(10, 10), [{ x: 0, y: 0, w: 1, h: 1 }]) === null, "");
  if (process.platform === "linux") {
    // a stand-in xrandr: display A (3x6) left of B (5x6), the layout of realPng(8, 6)
    const xhome = join(ROOT, "xhome"), xbin = join(ROOT, "xbin"); mkdirSync(xhome, { recursive: true }); mkdirSync(xbin, { recursive: true });
    writeFileSync(join(xbin, "xrandr"), "#!/bin/sh\ncat <<'EOF'\nMonitors: 2\n 0: +*A 3/10x6/10+0+0  A\n 1: +B 5/10x6/10+3+0  B\nEOF\n", { mode: 0o755 });
    const sx = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import * as s from ${JSON.stringify(join(dirname(INDEX), "screens.mjs"))};
      import { statSync } from "node:fs";
      const out = {};
      const a = s.importScreen("desk", ${JSON.stringify(big.toString("base64"))});
      s.setRegions(a.id, [{ label: "on B", x: 4, y: 1, w: 2, h: 2 }, { label: "on A", x: 0, y: 0, w: 2, h: 2 }]);
      out.split = s.splitScreen(a.id); out.again = out.split.screens && s.splitScreen(out.split.screens[0].id);
      out.bp = out.split.screens && s.blueprint(out.split.screens[1]);
      out.kept = s.loadScreens().some((x) => x.id === a.id); out.count = s.loadScreens().length;
      out.modes = (out.split.screens || []).map((x) => statSync(s.screenImage(x.id)).mode & 0o777);
      out.nope = s.captureScreen("x", "no-such-display");
      console.log(JSON.stringify(out));`], { encoding: "utf8", env: { ...process.env, HOME: xhome, USERPROFILE: xhome, PATH: xbin + ":" + process.env.PATH, XDG_SESSION_TYPE: "x11" } });
    let sx2 = {}; try { sx2 = JSON.parse(sx.stdout); } catch {}
    const [pa, pb] = (sx2.split && sx2.split.screens) || [];
    ok("splitScreen: one screen per display, left first, named after it", pa && pb && pa.w === 3 && pb.w === 5 && pb.h === 6 && /· A \(left\)$/.test(pa.name) && /· B \(right\)$/.test(pb.name) && pb.monitor.name === "B" && pb.monitor.x === 3, sx2.split || sx.stderr);
    ok("splitScreen: each region goes with its display, in that display's pixels", pa && pb && pa.regions.map((r) => r.label).join() === "on A" && pb.regions.length === 1 && pb.regions[0].x === 1 && pb.regions[0].y === 1, [pa && pa.regions, pb && pb.regions]);
    ok("blueprint: a display's region also gives its point on the whole desktop", sx2.bp && JSON.stringify(sx2.bp.regions[0].center) === '{"x":2,"y":2}' && JSON.stringify(sx2.bp.regions[0].desktop) === '{"x":5,"y":2}' && sx2.bp.monitor.name === "B", sx2.bp);
    ok("splitScreen: each piece is readable by you only (0600)", sx2.modes && sx2.modes.length === 2 && sx2.modes.every((m) => m === 0o600), (sx2.modes || []).map((m) => m.toString(8)));
    ok("splitScreen: the whole image stays; a display's screen can't be split again", sx2.kept && sx2.count === 3 && /already one display/.test((sx2.again || {}).error || ""), sx2);
    ok("captureScreen: a display that isn't connected is refused before anything is captured", /no display called no-such-display/.test((sx2.nope || {}).error || ""), sx2.nope);
  }
  console.log("SCREENS — the app the screenshot portal checks permission for");
  ok("portalAppId: started from the COSMIC dock", portalAppId("0::/user.slice/user-1000.slice/user@1000.service/app.slice/app-cosmic-com.system76.CosmicAppList-4431.scope\n") === "com.system76.CosmicAppList", portalAppId("0::/a/app-cosmic-com.system76.CosmicAppList-4431.scope"));
  ok("portalAppId: a launcher-less scope and a service", portalAppId("0::/x/app-org.gnome.Terminal-12.scope") === "org.gnome.Terminal" && portalAppId("0::/x/app-gnome-org.example.App@3.service") === "org.example.App", [portalAppId("0::/x/app-org.gnome.Terminal-12.scope"), portalAppId("0::/x/app-gnome-org.example.App@3.service")]);
  ok("portalAppId: a terminal session or a scope without an app id gives none", portalAppId("0::/user.slice/user-1000.slice/session-2.scope") === "" && portalAppId("0::/x/app-orca-1234.scope") === "" && portalAppId("") === "", portalAppId("0::/x/app-orca-1234.scope"));
  // isolated HOME: screens live in Symbiot's config folder
  const shome = join(ROOT, "shome"); mkdirSync(shome, { recursive: true });
  const sc = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import * as s from ${JSON.stringify(join(dirname(INDEX), "screens.mjs"))};
    import { existsSync, statSync } from "node:fs";
    const out = {};
    out.bad = s.importScreen("x", Buffer.from("not a png").toString("base64"));
    const a = s.importScreen("PR page", "data:image/png;base64," + ${JSON.stringify(png(1920, 1080).toString("base64"))});
    out.a = a; out.file = existsSync(s.screenImage(a.id));
    out.modes = [s.screenImage(a.id), ${JSON.stringify(join(shome, ".config", "symbiot", "screens", "screens.json"))}].map((f) => statSync(f).mode & 0o777);
    out.reg = s.setRegions(a.id, [{ label: "Merge button", x: 100.4, y: 50, w: 40, h: 21 }, { label: "", x: 1900, y: 1070, w: 500, h: 500 }]);
    out.bp = s.blueprint(out.reg);
    out.traversal = s.screenImage("../../config");
    out.clickNoScreen = s.clickRegion("000000000000", out.reg.regions[0].id); out.clickNoRegion = s.clickRegion(a.id, "nope"); // neither reaches a click tool
    out.rm = s.removeScreen(a.id); out.gone = !existsSync(${JSON.stringify(join(shome, ".config", "symbiot", "screens"))} + "/" + a.id + ".png") && s.loadScreens().length === 0;
    console.log(JSON.stringify(out));`], { encoding: "utf8", env: { ...process.env, HOME: shome, USERPROFILE: shome } });
  let so = {}; try { so = JSON.parse(sc.stdout); } catch {}
  ok("a non-PNG upload is refused", /isn't a PNG/.test((so.bad || {}).error || ""), so.bad || sc.stderr);
  ok("a loaded PNG is saved with its size", so.a && so.a.w === 1920 && so.a.h === 1080 && so.a.name === "PR page" && so.file, so.a);
  if (process.platform !== "win32") ok("the loaded image and screens.json are readable by you only (0600)", JSON.stringify(so.modes) === JSON.stringify([0o600, 0o600]), (so.modes || []).map((m) => m.toString(8)));
  const sr0 = so.reg && so.reg.regions[0], sr1 = so.reg && so.reg.regions[1];
  ok("regions are whole pixels; one past the edge is clamped to the image", sr0 && sr0.x === 100 && sr0.label === "Merge button" && sr1 && sr1.x + sr1.w === 1920 && sr1.y + sr1.h === 1080 && sr1.label === "region 2", so.reg);
  ok("the blueprint gives each region's centre", so.bp && JSON.stringify(so.bp.regions[0].center) === '{"x":120,"y":60}' && so.bp.size.w === 1920, so.bp);
  ok("an image request can't leave the screens folder", so.traversal === "", so.traversal);
  ok("a click on a missing screen or region is refused before any tool runs", /not found/.test((so.clickNoScreen || {}).error || "") && /region is gone/.test((so.clickNoRegion || {}).error || ""), [so.clickNoScreen, so.clickNoRegion]);
  ok("removing a screen deletes its image too", so.rm && so.rm.ok && so.gone, so);

  console.log("SCREENS — a web page mapped by itself in a hidden browser (headless.mjs)");
  const su = (s) => siteUrl(s);
  ok("siteUrl: a site's name, a host, a path and \"open …\" become https addresses", su("gmail") === "https://gmail.com/" && su("open GitHub") === "https://github.com/" && su("github.com/pulls?q=1") === "https://github.com/pulls?q=1" && su("mail.google.com") === "https://mail.google.com/", [su("gmail"), su("open GitHub"), su("github.com/pulls?q=1")]);
  ok("siteUrl: localhost is http; full http(s) addresses are kept", su("localhost:3000/x") === "http://localhost:3000/x" && su("127.0.0.1:8080") === "http://127.0.0.1:8080/" && su("http://example.org/a") === "http://example.org/a", [su("localhost:3000/x"), su("127.0.0.1:8080")]);
  ok("siteUrl: anything else isn't a site (file:, javascript:, words with spaces, nothing)", ["file:///etc/passwd", "javascript:alert(1)", "two words", "", "chrome://settings"].every((x) => su(x) === ""), ["file:///etc/passwd", "javascript:alert(1)", "two words"].map(su));
  const tr = (u) => isTrusted(u, ["google.com", "github.com"]);
  ok("isTrusted: a trusted host covers itself, www. and its subdomains, and nothing else", tr("https://mail.google.com/mail/u/0/") && tr("https://www.github.com/pulls") && tr("https://google.com/") && !tr("https://evilgoogle.com/") && !tr("https://google.com.evil.io/") && !tr("") && !isTrusted("https://google.com/", []), "");
  const hArgs = browserArgs(true), vArgs = browserArgs(false, "https://gmail.com/");
  const prof = (a) => a.find((x) => x.startsWith("--user-data-dir="));
  ok("browserArgs: hidden runs headless on the DevTools pipe; the sign-in window is a normal one", hArgs.includes("--headless=new") && hArgs.includes("--remote-debugging-pipe") && !vArgs.some((x) => /headless|remote-debugging/.test(x)) && vArgs[vArgs.length - 1] === "https://gmail.com/", [hArgs, vArgs]);
  ok("browserArgs: both use Symbiot's own profile (and password store), so a sign-in carries over", prof(hArgs) && prof(hArgs) === prof(vArgs) && /symbiot[\\/]browser$/.test(prof(hArgs)) && (process.platform !== "linux" || (hArgs.includes("--password-store=basic") && vArgs.includes("--password-store=basic"))), prof(hArgs));
  // The real thing, when there's a Chromium-family browser here (CI has Chrome):
  // a local page with things to find and things that must be left out.
  const pghome = join(ROOT, "pghome"); mkdirSync(pghome, { recursive: true });
  const hx = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { createServer } from "node:http";
    import { statSync } from "node:fs";
    import { execFileSync } from "node:child_process";
    import { chromeBinary } from ${JSON.stringify(join(dirname(INDEX), "core.mjs"))};
    if (!chromeBinary()) { console.log(JSON.stringify({ skip: true })); process.exit(0); }
    const h = await import(${JSON.stringify(join(dirname(INDEX), "headless.mjs"))});
    const s = await import(${JSON.stringify(join(dirname(INDEX), "screens.mjs"))});
    const page = '<!doctype html><title>Inbox</title><body style="margin:0">' +
      '<a href="/two" target="_blank" style="position:absolute;left:10px;top:10px">Go to two</a>' +
      '<button id="compose" style="position:absolute;left:10px;top:50px">Compose</button>' +
      '<form action="/search"><input name="q" placeholder="Search mail" value="old" style="position:absolute;left:10px;top:90px"></form>' +
      '<div role="button" aria-label="Star" style="position:absolute;left:10px;top:130px;width:20px;height:20px"><span role="button">inner</span></div>' +
      '<button style="display:none">Hidden</button><button style="position:absolute;left:10px;top:2000px">Below the fold</button>' +
      '<button style="position:absolute;left:300px;top:50px">Covered</button><div style="position:absolute;left:290px;top:40px;width:200px;height:60px;background:red"></div></body>';
    const form = '<title>Form</title><input id="q" placeholder="Query"><button id="go" onclick="location=\\'/search?q=\\'+encodeURIComponent(document.getElementById(\\'q\\').value)">Go</button>';
    // an inbox: rows with more text than a region's 80-character label
    let rows = ["Ann Lee, Lunch on Friday?, 9:05 AM, Are you free for lunch on Friday at the usual place near the office", "GitHub, [symbiot] Run failed: CI - main, 8:24 AM, The workflow run failed on the main branch at commit abc123"];
    const inbox = () => '<title>Inbox</title><div role="grid">' + rows.map((t, i) => '<div role="row" id="r' + i + '" style="height:30px">' + t + '</div>').join("") + '</div>';
    // taller than the window: the page itself scrolls (/long), or a list inside it, as Gmail's does (/pane)
    const long = '<title>Long</title><body style="margin:0;height:3000px"><button style="position:absolute;left:10px;top:10px">Top button</button><button style="position:absolute;left:10px;top:1000px">Middle button</button><button style="position:absolute;left:10px;top:2950px">Last button</button></body>';
    const pane = '<title>Pane</title><body style="margin:0;overflow:hidden"><div style="height:60px">Header</div><div id="list" style="position:absolute;top:60px;bottom:0;left:0;right:0;overflow:auto">' + Array.from({ length: 60 }, (_, i) => '<div role="row" style="height:40px">Row ' + i + '</div>').join("") + '</div></body>';
    // a part as tall as the window, a header fixed at the top and a footer below: the whole page keeps the window's height
    const tall = '<title>Tall</title><body style="margin:0"><button style="position:fixed;left:10px;top:5px">Fixed menu</button><button style="position:fixed;left:10px;bottom:5px">Bottom bar</button><div style="min-height:100vh"><div style="height:2000px">Text</div></div><footer style="height:300px"><button>Footer button</button></footer></body>';
    // a list that reuses its 25 rows as it scrolls (WhatsApp's does): 100 items, each row element shows another as it moves
    const virt = '<title>Virt</title><body style="margin:0;overflow:hidden"><div id="vl" style="position:absolute;top:0;bottom:0;left:0;right:0;overflow:auto"><div id="sp" style="height:4000px;position:relative"></div></div><script>' +
      'const sp=document.getElementById("sp"),vl=document.getElementById("vl"),els=[];for(let i=0;i<25;i++){const d=document.createElement("div");d.setAttribute("role","row");d.style.cssText="position:absolute;left:0;right:0;height:40px";sp.appendChild(d);els.push(d);}' +
      'function draw(){const f=Math.floor(vl.scrollTop/40);els.forEach((d,i)=>{d.style.top=((f+i)*40)+"px";d.textContent="Item "+(f+i);});}vl.addEventListener("scroll",draw);draw();</script></body>';
    const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(q.url === "/virt" ? virt : q.url === "/tall" ? tall : q.url === "/long" ? long : q.url === "/pane" ? pane : q.url === "/two" ? "<title>Page two</title><button>Back</button>" : q.url === "/form" ? form : q.url === "/rows" ? inbox() : q.url.startsWith("/search?") ? "<title>Results for " + new URL(q.url, "http://x").searchParams.get("q") + "</title><button>Back</button>" : page); }).listen(0, "127.0.0.1");
    await new Promise((r) => srv.on("listening", r));
    const out = {};
    out.map = await h.mapPage("127.0.0.1:" + srv.address().port, "");
    out.closedAfter = !h.browserOpen();
    // Watch: read a page without saving a screen, then see what's new on it
    const nScreens = s.loadScreens().length;
    out.read = await h.readPage("127.0.0.1:" + srv.address().port + "/rows");
    out.readNoScreen = s.loadScreens().length === nScreens; out.readClosed = !h.browserOpen();
    const wm = await import(${JSON.stringify(join(dirname(INDEX), "watch.mjs"))});
    const told = [], notify = (t, b) => told.push([t, b]);
    const w = wm.addWatch({ site: "127.0.0.1:" + srv.address().port + "/rows" });
    out.wFirst = await wm.checkWatch(w.id, { notify });
    rows = ["Sam Ng, Contract signed, 10:30 AM, Here is the signed contract for next month, with the changes we agreed", ...rows.map((t) => t.replace(/\\d+:\\d+ AM/, "Oct 4"))];
    out.wNext = await wm.checkWatch(w.id, { notify });
    out.wTold = told; wm.removeWatch(w.id);
    out.bp = out.map.id && s.blueprint(out.map);
    out.mode = out.map.id && (statSync(s.screenImage(out.map.id)).mode & 0o777);
    const link = (out.map.regions || []).find((r) => r.kind === "link");
    out.unasked = link ? await h.pressRegion(out.map.id, link.id) : null;
    out.press = link ? await h.pressRegion(out.map.id, link.id, { confirmed: true }) : null;
    const field = (out.map.regions || []).find((r) => r.kind === "field");
    out.typeButton = await h.typeRegion(out.map.id, (out.map.regions || []).find((r) => r.kind === "button").id, "x", { confirmed: true });
    out.typeUnasked = field ? await h.typeRegion(out.map.id, field.id, "hello", { enter: true }) : null;
    out.trust = h.trustSite("127.0.0.1:" + srv.address().port);
    out.type = field ? await h.typeRegion(out.map.id, field.id, "hello world", { enter: true }) : null;
    out.untrust = h.untrustSite("127.0.0.1");
    out.click = out.map.id && s.clickRegion(out.map.id, out.map.regions[0].id);
    // Kept open, as the app does: type without Enter, then press the form's own button.
    h.keepBrowserOpen(60000);
    out.fmap = await h.mapPage("127.0.0.1:" + srv.address().port + "/form", "");
    const ff = (out.fmap.regions || []).find((r) => r.kind === "field");
    out.ftype = ff ? await h.typeRegion(out.fmap.id, ff.id, "kept", { confirmed: true }) : null;
    out.fopen = h.browserOpen();
    out.readBusy = await h.readPage("127.0.0.1:" + srv.address().port + "/rows");
    const go =((out.ftype || {}).regions || []).find((r) => r.label === "Go");
    out.fpress = go ? await h.pressRegion(out.ftype.id, go.id, { confirmed: true }) : null;
    const go0 = (out.fmap.regions || []).find((r) => r.label === "Go");
    out.fold = go0 ? await h.pressRegion(out.fmap.id, go0.id, { confirmed: true }) : null;
    await h.closeBrowser(); out.fclosed = !h.browserOpen();
    // Scroll (still kept open): down, to the bottom, past it; then, closed, an older screen again
    const base = "127.0.0.1:" + srv.address().port;
    out.lmap = await h.mapPage(base + "/long", "");
    out.cliShow = JSON.parse(execFileSync(process.execPath, [${JSON.stringify(INDEX)}, "screens", "show", out.lmap.id], { encoding: "utf8" }));
    out.ldown = await h.scrollPage(out.lmap.id);
    out.lbottom = await h.scrollPage(out.ldown.id, "bottom");
    out.lpast = await h.scrollPage(out.lbottom.id, "down");
    out.lsideways = await h.scrollPage(out.lbottom.id, "sideways");
    out.cliMore = JSON.parse(execFileSync(process.execPath, [${JSON.stringify(INDEX)}, "screens", "show", out.lbottom.id], { encoding: "utf8" }));
    await h.closeBrowser();
    out.lagain = await h.scrollPage(out.ldown.id, "down");
    out.pmap = await h.mapPage(base + "/pane", "");
    out.pdown = await h.scrollPage(out.pmap.id);
    out.pup = await h.scrollPage(out.pdown.id, "up");
    out.fits = await h.scrollPage(out.fmap.id);
    // the whole page at once: one tall screen, for a page that scrolls as a whole (not Gmail's list)
    out.wmap = await h.mapPage(base + "/long", "", { whole: true });
    out.wpane = await h.mapPage(base + "/pane", "", { whole: true });
    const row55 = ((out.wpane || {}).regions || []).find((r) => r.label === "Row 55");
    out.wpanePress = row55 ? await h.pressRegion(out.wpane.id, row55.id, { confirmed: true }) : null;
    out.wvirt = await h.mapPage(base + "/virt", "", { whole: true });
    out.wfrom = await h.wholePage(out.ldown.id);
    out.wfromPane = await h.wholePage(out.pmap.id);
    out.wfits = await h.wholePage(out.fmap.id);
    out.wtall = await h.mapPage(base + "/tall", "", { whole: true });
    const lastBtn = ((out.wmap || {}).regions || []).find((r) => r.label === "Last button");
    out.wpress = lastBtn ? await h.pressRegion(out.wmap.id, lastBtn.id, { confirmed: true }) : null;
    out.cliWhole = JSON.parse(execFileSync(process.execPath, [${JSON.stringify(INDEX)}, "screens", "show", out.wmap.id], { encoding: "utf8" }));
    await h.closeBrowser();
    srv.close();
    console.log(JSON.stringify(out));`], { encoding: "utf8", timeout: 150000, env: { ...process.env, HOME: pghome, USERPROFILE: pghome } });
  let ho = {}; try { ho = JSON.parse(hx.stdout); } catch {}
  if (ho.skip) console.log("  - skipped mapping a real page: no Chrome, Chromium, Edge or Brave here");
  else {
    const hm = ho.map || {}, labels = (hm.regions || []).map((r) => r.label + ":" + r.kind);
    ok("mapPage: a page's screenshot at 1280×800, named after its title, kept as a page", hm.w === 1280 && hm.h === 800 && hm.name === "Inbox" && hm.via === "headless" && /^http:\/\/127\.0\.0\.1:\d+\/$/.test((hm.page || {}).url || ""), hm.error || hx.stderr.slice(-800) || hm);
    ok("mapPage: finds the link, button, field and an aria-labelled button, each with its kind", labels.join() === "Go to two:link,Compose:button,Search mail:field,Star:button", labels);
    ok("mapPage: leaves out hidden, below-the-fold and covered buttons, and a button inside a button", !labels.some((l) => /Hidden|Below|Covered|inner/.test(l)), labels);
    const comp = (hm.regions || []).find((r) => r.label === "Compose") || {};
    ok("mapPage: a region is where it is on the page, with a selector to find it again", comp.x === 10 && comp.y === 50 && comp.w > 20 && comp.selector === "#compose", comp);
    ok("blueprint: a mapped page gives its address, and each region's kind and selector", ho.bp && ho.bp.page && ho.bp.regions[1].kind === "button" && ho.bp.regions[1].selector === "#compose" && /\/two$/.test(ho.bp.regions[0].href || ""), ho.bp);
    if (process.platform !== "win32") ok("mapPage: its screenshot is readable by you only (0600)", ho.mode === 0o600, ho.mode);
    ok("pressRegion: follows a new-tab link in the same tab and maps the page it lands on", ho.press && ho.press.found && ho.press.name === "Page two" && /\/two$/.test(ho.press.page.url) && ho.press.regions.map((r) => r.label).join() === "Back", ho.press);
    ok("pressRegion: refused without your confirmation on a site you don't trust", ho.unasked && ho.unasked.confirm === true && ho.unasked.host === "127.0.0.1" && !ho.unasked.id, ho.unasked);
    ok("typeRegion: only types into a field", /isn't a field/.test((ho.typeButton || {}).error || ""), ho.typeButton);
    ok("typeRegion: refused without your confirmation on a site you don't trust", ho.typeUnasked && ho.typeUnasked.confirm === true && !ho.typeUnasked.id, ho.typeUnasked);
    ok("trustSite: keeps the host, so the site's pages are trusted", ho.trust && ho.trust.host === "127.0.0.1" && ho.trust.sites.join() === "127.0.0.1" && ho.untrust && ho.untrust.sites.length === 0, [ho.trust, ho.untrust]);
    ok("typeRegion: on a trusted site, replaces what's in the field, presses Enter and maps the result, unasked", ho.type && ho.type.found && ho.type.entered && ho.type.typed === "Search mail" && ho.type.name === "Results for hello world", ho.type);
    ok("the hidden browser closes after each action unless it's kept open", ho.closedAfter === true, ho.closedAfter);
    ok("kept open: typed without Enter, it's still there for a separate button on the screen that mapped", ho.ftype && ho.ftype.found && !ho.ftype.entered && ho.fopen === true && ho.fpress && ho.fpress.kept === true && ho.fpress.name === "Results for kept", [ho.ftype && ho.ftype.error, ho.fopen, ho.fpress && (ho.fpress.error || ho.fpress.name)]);
    ok("kept open: a press on an older screen opens its page again (what was typed there is gone)", ho.fold && !ho.fold.kept && ho.fold.name === "Results for", ho.fold && (ho.fold.error || ho.fold.name));
    ok("closeBrowser closes it", ho.fclosed === true, ho.fclosed);
    const rl = (x) => ((x || {}).regions || []).map((r) => r.label), sy = (x) => ((x || {}).page || {}).scroll || {};
    ok("mapPage: a page taller than the window says how far down it is (the page itself scrolls: no selector)", sy(hm).y === 0 && sy(hm).max > 1000 && !sy(hm).selector && sy(ho.lmap).max === 2200 && rl(ho.lmap).join() === "Top button", [sy(hm), sy(ho.lmap), rl(ho.lmap)]);
    ok("screens show: \"more\" says there's more below, or above at the end", ho.cliShow && ho.cliShow.more === "below" && ho.cliShow.page.scroll.max === 2200 && ho.cliMore && ho.cliMore.more === "above", [ho.cliShow && ho.cliShow.more, ho.cliMore && ho.cliMore.more]);
    const mid = ((ho.ldown || {}).regions || []).find((r) => r.label === "Middle button") || {};
    ok("scrollPage: down most of a window, then maps what's in it as a new screen, named for how far down", ho.ldown && ho.ldown.id !== ho.lmap.id && sy(ho.ldown).y === 680 && rl(ho.ldown).join() === "Middle button" && mid.y === 320 && ho.ldown.scrolled === "down" && ho.ldown.kept === true && ho.ldown.name === "Long ↓ 31%", ho.ldown && (ho.ldown.error || [sy(ho.ldown), rl(ho.ldown), mid, ho.ldown.name]));
    ok("scrollPage: to the bottom, and past it says so without a new screen", sy(ho.lbottom).y === 2200 && rl(ho.lbottom).join() === "Last button" && ho.lbottom.name === "Long ↓ 100%" && /bottom of the page already/.test((ho.lpast || {}).error || "") && !ho.lpast.id && /Scroll down, up, top, bottom/.test((ho.lsideways || {}).error || ""), [sy(ho.lbottom), ho.lpast, ho.lsideways]);
    ok("scrollPage: an older screen, once closed, opens again where it was, then scrolls on from there", ho.lagain && !ho.lagain.kept && sy(ho.lagain).y === 1360, ho.lagain && (ho.lagain.error || sy(ho.lagain)));
    ok("scrollPage: a list that scrolls inside the page (Gmail's) is what scrolls, found again by its selector", sy(ho.pmap).selector === "#list" && sy(ho.pmap).max === 1660 && !rl(ho.pmap).includes("Row 25") && rl(ho.pdown).includes("Row 25") && sy(ho.pdown).y === 629 && sy(ho.pup).y === 0 && rl(ho.pup).includes("Row 0"), [sy(ho.pmap), sy(ho.pdown), rl(ho.pdown).slice(0, 3), ho.pup && (ho.pup.error || sy(ho.pup))]);
    ok("scrollPage: a page that fits in the window has nothing to scroll", /Nothing scrolls/.test((ho.fits || {}).error || "") && !sy(ho.fmap).max, ho.fits);
    const wm = ho.wmap || {}, wlast = (wm.regions || []).find((r) => r.label === "Last button") || {};
    ok("mapPage --whole: one screenshot as tall as the page, with every button on it where it is on the page", wm.w === 1280 && wm.h === 3000 && wm.name === "Long (whole page)" && (wm.page || {}).full === true && !sy(wm).max && rl(wm).join() === "Top button,Middle button,Last button" && wlast.y === 2950, wm.error || [wm.w, wm.h, wm.name, wm.page, rl(wm), wlast]);
    ok("screens show: a whole-page map has no \"more\" (it's all there)", ho.cliWhole && !ho.cliWhole.more && ho.cliWhole.page.full === true && ho.cliWhole.size.h === 3000, ho.cliWhole && [ho.cliWhole.more, ho.cliWhole.page, ho.cliWhole.size]);
    const wp = ho.wpane || {}, wrow = (n) => (wp.regions || []).find((r) => r.label === "Row " + n) || {};
    ok("mapPage --whole: a list that scrolls inside the page (Gmail's) is opened out in one tall screen, every row marked where it is in it", wp.w === 1280 && wp.h === 2460 && wp.name === "Pane (whole page)" && (wp.page || {}).full === true && (wp.page || {}).list === "#list" && !sy(wp).max && (wp.regions || []).length === 60 && wrow(0).y === 60 && wrow(30).y === 1260 && wrow(59).y === 2420 && wrow(59).h === 40 && !wp.note, wp.error || [wp.h, wp.name, wp.page, (wp.regions || []).length, wrow(0), wrow(59), wp.note]);
    ok("wholePage: from a scrolled screen, all of the page (named without the ↓ 31%), or its list opened out; a page that fits says so", ho.wfrom && ho.wfrom.h === 3000 && ho.wfrom.name === "Long (whole page)" && rl(ho.wfrom).length === 3 && ho.wfromPane && ho.wfromPane.h === 2460 && ho.wfromPane.name === "Pane (whole page)" && ho.wfits && ho.wfits.h === 800 && /whole page/.test(ho.wfits.note || ""), [ho.wfrom && (ho.wfrom.error || ho.wfrom.name), ho.wfromPane && (ho.wfromPane.error || [ho.wfromPane.h, ho.wfromPane.name]), ho.wfits && (ho.wfits.error || ho.wfits.note)]);
    const wv = ho.wvirt || {}, vls = (wv.regions || []).map((r) => r.label), vitem = (n) => (wv.regions || []).find((r) => r.label === "Item " + n) || {};
    ok("mapPage --whole: a list that reuses its rows as it scrolls gets every item once, where it is; a reused row has no selector to find another by", wv.h === 4000 && vls.length === 100 && new Set(vls).size === 100 && vitem(0).y === 0 && vitem(99).y === 3960 && !!vitem(0).selector && !vitem(60).selector, wv.error || [wv.h, vls.length, new Set(vls).size, vitem(99), vitem(60)]);
    ok("pressRegion on an opened-out list: finds a row far down it", ho.wpanePress && ho.wpanePress.found === true && ho.wpanePress.pressed === "Row 55", ho.wpanePress && (ho.wpanePress.error || ho.wpanePress.found));
    const wt = ho.wtall || {}, wfoot = (wt.regions || []).find((r) => r.label === "Footer button") || {};
    ok("mapPage --whole: a part as tall as the window stays the window's height, a fixed menu is marked once, at the top; a bar stuck to the window's bottom isn't", wt.h === 2300 && rl(wt).join() === "Fixed menu,Footer button" && wfoot.y === 2000 && ((wt.regions || [])[0] || {}).y === 5 && !wt.note, wt.error || [wt.h, rl(wt), wfoot, wt.note]);
    ok("pressRegion on a whole-page screen: finds the button far down, and the window is laptop-sized again", ho.wpress && ho.wpress.found === true && ho.wpress.pressed === "Last button" && ho.wpress.h === 800, ho.wpress && (ho.wpress.error || [ho.wpress.found, ho.wpress.h]));
    const rd = ho.read || {}, rrows = (rd.items || []).filter((r) => r.kind === "row");
    ok("readPage: reads a page's rows, each with all its text, without saving a screen, and closes after", rrows.length === 2 && rrows[0].label.length === 80 && /usual place near the office$/.test(rrows[0].text || "") && ho.readNoScreen && ho.readClosed && rd.login === false, rd.error || [rrows, ho.readNoScreen, ho.readClosed]);
    ok("readPage: leaves the browser alone while it's open for a type-then-press", ho.readBusy && ho.readBusy.busy === true && !ho.readBusy.items, ho.readBusy);
    ok("Watch, for real: the first read learns the inbox, the next finds only the new row (old ones' times changed)", ho.wFirst && ho.wFirst.learned === 2 && ho.wNext && (ho.wNext.new || []).length === 1 && /^Sam Ng, Contract signed/.test(ho.wNext.new[0].text) && (ho.wTold || []).length === 1, [ho.wFirst, ho.wNext && (ho.wNext.error || ho.wNext.new)]);
    ok("clickRegion: a mapped page is never clicked on your real screen", /use Press instead/.test((ho.click || {}).error || ""), ho.click);
  }

  console.log("WATCH — a mapped page read again, and only what's new on it (watch.mjs)");
  const k = (t) => itemKey(t);
  ok("itemKey: the same row whether its time reads 9:05 AM, Oct 5, 5 Oct, 2 hours ago or it's unread", new Set(["Ann, Lunch?, 9:05 AM, Free Friday", "unread, Ann, Lunch?, Oct 5, Free Friday", "Ann, Lunch?, 5 Oct, Free Friday", "Ann, Lunch?, 2 hours ago, Free Friday", "Ann, Lunch?, 10/05/2026, Free Friday"].map(k)).size === 1, ["Ann, Lunch?, 9:05 AM, Free Friday", "Ann, Lunch?, Oct 5, Free Friday"].map(k));
  ok("itemKey: keeps what tells two rows apart (a version, a word that looks like a month)", k("Release v1.2.3 is out") !== k("Release v1.2.4 is out") && k("Mark 12 says hi") === "mark 12 says hi", [k("Release v1.2.3 is out"), k("Mark 12 says hi")]);
  const its = itemsOf({ items: [{ kind: "link", label: "Inbox" }, { kind: "row", label: "unread, Ann, Lunch?", text: "unread, Ann, Lunch?, and the rest of it" }, { kind: "row", label: "row" }] });
  ok("itemsOf: a page's rows (all their text, without 'unread'), else its links", its.length === 1 && its[0].text === "Ann, Lunch?, and the rest of it" && itemsOf({ items: [{ kind: "link", label: "Pull request 12", href: "https://x/12" }, { kind: "button", label: "Menu" }] }).map((x) => x.href).join() === "https://x/12", its);
  const ni = newItems([k("Ann, Lunch?")], [{ text: "Sam, Contract" }, { text: "Ann, Lunch?" }, { text: "Sam, Contract" }]);
  ok("newItems: only rows not seen before, once each; remember keeps the newest last", ni.fresh.length === 1 && ni.fresh[0].text === "Sam, Contract" && ni.keys.length === 2 && remember(["a", "b", "c"], ["b", "d"]).join() === "a,c,b,d", ni);
  const whome = join(ROOT, "whome"); mkdirSync(whome, { recursive: true });
  const wx = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import * as w from ${JSON.stringify(join(dirname(INDEX), "watch.mjs"))};
    import { statSync } from "node:fs";
    let page = { url: "https://mail.example.com/inbox", items: [{ kind: "row", label: "Ann, Lunch?, 9:05 AM" }, { kind: "row", label: "Bob, Invoice, 8:00 AM" }] };
    const told = [], opts = { read: async () => page, notify: (t, b) => told.push([t, b]) }, out = {};
    out.site = w.addWatch({ site: "mail.example.com/inbox", every: 5 });
    out.again = w.addWatch({ site: "https://mail.example.com/inbox", every: 30 });
    out.bad = w.addWatch({ site: "two words" }); out.noScreen = w.addWatch({ screen: "abcdefabcdef" });
    out.first = await w.checkWatch(out.site.id, opts); out.toldFirst = told.length;
    page = { ...page, items: [{ kind: "row", label: "Cat, Signed contract, 10:30 AM" }, { kind: "row", label: "Ann, Lunch?, Oct 5" }, { kind: "row", label: "Bob, Invoice, Oct 5" }] };
    out.next = await w.checkWatch(out.site.id, opts); out.toldNext = told.slice();
    out.same = await w.checkWatch(out.site.id, opts);
    page = { busy: true }; out.busy = await w.checkWatch(out.site.id, opts);
    page = { url: "https://accounts.google.com/signin", items: [], login: true };
    out.login = await w.checkWatch(out.site.id, opts); out.login2 = await w.checkWatch(out.site.id, opts); out.toldLogin = told.length;
    out.news = w.newsSince(24); out.state = w.watchState();
    out.mode = statSync(w.WATCH_FILE).mode & 0o777;
    out.due = w.dueWatches(Date.now() + 31 * 60000).length; out.notDue = w.dueWatches().length;
    out.rm = w.removeWatch(out.site.id); out.after = w.watchState();
    console.log(JSON.stringify(out));`], { encoding: "utf8", env: { ...process.env, HOME: whome, USERPROFILE: whome } });
  let wo = {}; try { wo = JSON.parse(wx.stdout); } catch {}
  ok("addWatch: a site becomes a watch; the same address again only changes how often", wo.site && wo.site.id && wo.site.url === "https://mail.example.com/inbox" && wo.site.every === 5 && wo.again && wo.again.id === wo.site.id && wo.again.every === 30, wo.site || wx.stderr.slice(-600));
  ok("addWatch: refuses something that isn't a site, and a screen that isn't there", /Give a mapped page/.test((wo.bad || {}).error || "") && /No screen/.test((wo.noScreen || {}).error || ""), [wo.bad, wo.noScreen]);
  ok("checkWatch: the first read only learns what's there, and notifies nothing", wo.first && wo.first.learned === 2 && !wo.first.new && wo.toldFirst === 0, wo.first);
  ok("checkWatch: the next read finds just the new row and notifies it", wo.next && (wo.next.new || []).length === 1 && wo.next.new[0].text === "Cat, Signed contract, 10:30 AM" && (wo.toldNext || []).length === 1 && /^1 new/.test(wo.toldNext[0][0]) && /Signed contract/.test(wo.toldNext[0][1]), [wo.next, wo.toldNext]);
  ok("checkWatch: nothing new on a read that lists the same rows", wo.same && (wo.same.new || []).length === 0, wo.same);
  ok("checkWatch: a busy browser changes nothing (it's read later)", wo.busy && wo.busy.busy === true && wo.busy.last === wo.same.last, wo.busy);
  ok("checkWatch: signed out shows as the watch's error, notified once", /Signed out of accounts\.google\.com/.test((wo.login || {}).error || "") && wo.login2 && wo.login2.error === wo.login.error && wo.toldLogin === 2, [wo.login, wo.toldLogin]);
  ok("what's new is kept, newest first, for `symbiot watch new`", (wo.news || []).length === 1 && wo.news[0].name === "mail.example.com" && wo.state && wo.state.news.length === 1 && wo.state.watches[0].known === 3, [wo.news, wo.state]);
  if (process.platform !== "win32") ok("watch.json is readable by you only (0600)", wo.mode === 0o600, wo.mode);
  ok("dueWatches: due once its minutes have passed, not straight after a read", wo.due === 1 && wo.notDue === 0, [wo.due, wo.notDue]);
  ok("removeWatch: stops it and forgets what it found", wo.rm && wo.rm.ok && wo.after && wo.after.watches.length === 0 && wo.after.news.length === 0, wo.after);

  console.log("WATCH GITHUB — your notifications through gh, and the brief");
  const ghn = (id, reason, type, title, updated, url) => ({ id, reason, updated_at: updated, subject: { type, title, url }, repository: { full_name: "pat/app", html_url: "https://github.com/pat/app" } });
  const gi = githubItems([
    ghn("1", "review_requested", "PullRequest", "Add login", "2026-10-05T08:00:00Z", "https://api.github.com/repos/pat/app/pulls/12"),
    ghn("2", "ci_activity", "CheckSuite", "CI workflow run failed for main branch", "2026-10-05T09:00:00Z", null),
    ghn("3", "mention", "Issue", "Crash on start", "2026-10-05T07:00:00Z", "https://api.github.com/repos/pat/app/issues/7"),
    { id: "4", subject: {} },
  ]);
  ok("githubItems: says why (not for CI, whose title says it), the repo and the title", gi.length === 3 && gi[0].text === "Review requested · pat/app · Add login" && gi[1].text === "pat/app · CI workflow run failed for main branch" && gi[2].text === "Mentioned · pat/app · Crash on start", gi);
  ok("githubItems: links to the pull request, the issue, or the repo's Actions for a CI run", gi[0].href === "https://github.com/pat/app/pull/12" && gi[2].href === "https://github.com/pat/app/issues/7" && gi[1].href === "https://github.com/pat/app/actions", gi.map((x) => x.href));
  ok("githubItems: keyed by thread and when it changed", gi[1].key === "github 2 2026-10-05T09:00:00Z", gi[1]);
  const ghome = join(ROOT, "ghome"); mkdirSync(join(ghome, ".config", "symbiot"), { recursive: true });
  const gx = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import * as w from ${JSON.stringify(join(dirname(INDEX), "watch.mjs"))};
    const n = (id, title, updated) => ({ id, reason: "ci_activity", updated_at: updated, subject: { type: "CheckSuite", title }, repository: { full_name: "pat/app", html_url: "https://github.com/pat/app" } });
    let list = [n("1", "CI workflow run failed for main branch", "a")], gh = true;
    const told = [], briefed = [], out = {};
    const opts = { github: async () => (gh ? { url: w.GITHUB_INBOX, list: w.githubItems(list), via: "gh" } : null), read: async () => ({ url: "https://github.com/notifications", items: [{ kind: "link", label: "Some link on the page" }] }), notify: (t, b) => told.push([t, b]), brief: async (news, name) => { briefed.push([news.length, name]); return "Needs you: main is failing on pat/app."; } };
    out.add = w.addWatch({ site: "github" }); out.again = w.addWatch({ site: "https://github.com/notifications" });
    out.first = await w.checkWatch(out.add.id, opts);
    // the same title again is a new thread: a second failure on main
    list = [n("2", "CI workflow run failed for main branch", "b"), ...list];
    out.next = await w.checkWatch(out.add.id, opts); out.toldNext = told.slice(); out.briefedOff = briefed.length;
    list = []; out.empty = await w.checkWatch(out.add.id, opts);
    // gh out: the page is read instead, and learned again, not announced
    gh = false; out.page = await w.checkWatch(out.add.id, opts); gh = true; out.back = await w.checkWatch(out.add.id, opts); out.toldSwitch = told.length;
    out.on = w.setBrief(true);
    list = [n("3", "CI workflow run failed for dev branch", "c")];
    out.briefed = await w.checkWatch(out.add.id, opts); out.toldBrief = told[told.length - 1];
    out.state = w.watchState();
    out.waiting = w.waitingOn(24);
    out.after = w.newsAfter(out.next.last); out.none = w.newsAfter(Date.now() + 1000);
    console.log(JSON.stringify(out));`], { encoding: "utf8", env: { ...process.env, HOME: ghome, USERPROFILE: ghome } });
  let go = {}; try { go = JSON.parse(gx.stdout); } catch {}
  ok("watch add github: GitHub's notifications, named so; github.com/notifications is the same watch", go.add && go.add.url === "https://github.com/notifications" && go.add.name === "GitHub notifications" && go.again && go.again.id === go.add.id, go.add || gx.stderr.slice(-600));
  ok("through gh: the first read learns what's unread, says so", go.first && go.first.learned === 1 && go.first.via === "gh" && !go.first.error, go.first);
  ok("a second CI failure with the same title is new, and notified (no brief while it's off)", go.next && (go.next.new || []).length === 1 && /CI workflow run failed for main/.test(go.next.new[0].text) && go.next.new[0].href === "https://github.com/pat/app/actions" && (go.toldNext || []).length === 1 && go.briefedOff === 0, [go.next, go.toldNext]);
  ok("nothing unread is a good read through gh, not an error", go.empty && !go.empty.error && (go.empty.new || []).length === 0, go.empty);
  ok("gh out, then back: the page and gh are each learned again, nothing announced", go.page && go.page.learned === 1 && !go.page.via && go.back && go.back.learned === 0 && go.back.via === "gh" && go.toldSwitch === 1, [go.page, go.back, go.toldSwitch]);
  ok("brief on: the AI's read is kept and is the notification's text", go.on && go.on.brief === true && go.briefed && go.briefed.brief === "Needs you: main is failing on pat/app." && go.toldBrief && /^1 new · GitHub notifications/.test(go.toldBrief[0]) && go.toldBrief[1] === go.briefed.brief && go.state.brief === true && go.state.briefs.length === 1 && go.state.briefs[0].count === 1, [go.briefed, go.toldBrief, go.state && go.state.briefs]);
  ok("waitingOn: what's new since yesterday per page, as \"2 GitHub notifications\"", (go.waiting || []).length === 1 && go.waiting[0].label === "2 GitHub notifications" && go.waiting[0].items.length === 2, go.waiting);
  ok("newsAfter: only what's newer, with its brief (what the phone asks for)", go.after && go.after.news.length === 1 && go.after.briefs.length === 1 && go.none.news.length === 0, go.after);

  console.log("DASHBOARD — a card per page you watch: your inbox, GitHub, WhatsApp (watch.mjs watchBoard)");
  const bhome = join(ROOT, "bhome"); mkdirSync(join(bhome, ".config", "symbiot"), { recursive: true });
  const H1 = 3600000, bnow = Date.now(), bw = (id, name, url) => ({ id, name, url, every: 15, added: 1, last: 1, checked: bnow - 60000, seen: [] });
  const bnews = [{ id: "e1", watch: "m", name: "Inbox", ts: bnow - H1, text: "Sam, Contract" }, { id: "c1", watch: "c", name: "WhatsApp", ts: bnow - 2 * H1, text: "Mom: call me" }, { id: "c2", watch: "c", name: "WhatsApp", ts: bnow - 3 * H1, text: "Team: standup moved" },
    { id: "e0", watch: "m", name: "Inbox", ts: bnow - 50 * H1, text: "Old newsletter" }, ...Array.from({ length: 60 }, (_, i) => ({ id: "g" + i, watch: "g", name: "GitHub notifications", ts: bnow - 10 * 60000 - i, text: "pat/app · CI failed " + i }))];
  writeFileSync(join(bhome, ".config", "symbiot", "watch.json"), JSON.stringify({ watches: [bw("m", "Inbox", "https://mail.google.com/mail/u/0/#inbox"), bw("g", "GitHub notifications", "https://github.com/notifications"), bw("c", "WhatsApp", "https://web.whatsapp.com/"), bw("j", "Jira", "https://acme.atlassian.net/jira")],
    news: [...bnews].sort((a, b) => b.ts - a.ts), briefs: [{ watch: "c", name: "WhatsApp", ts: bnow - 2 * H1, count: 2, text: "Your mom wants a call." }] }));
  const bx = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import * as w from ${JSON.stringify(join(dirname(INDEX), "watch.mjs"))};
    import { execFileSync } from "node:child_process";
    const sym = (...a) => { try { return { code: 0, j: JSON.parse(execFileSync(process.execPath, [${JSON.stringify(INDEX)}, ...a], { encoding: "utf8" })) }; } catch (e) { let j = null; try { j = JSON.parse(e.stdout); } catch {} return { code: e.status, j }; } };
    const out = { day: w.watchBoard(24), week: w.watchBoard(168), waiting: w.waitingOn(24).map((x) => x.label) };
    out.cliBoard = sym("watch", "board"); out.cliWeek = sym("watch", "board", "--hours", "168");
    out.cliLine = execFileSync(process.execPath, [${JSON.stringify(INDEX)}, "watch", "board", "--line"], { encoding: "utf8" });
    out.linePage = w.boardLine({ cards: [{ count: 2, source: "page", name: "Jira", label: "2 new" }, { count: 0, source: "mail", label: "0 emails" }] }); out.lineNone = w.boardLine({ cards: [{ count: 0, source: "mail", label: "0 emails" }] });
    // talk it over: the card's items and brief go to the AI, the talk stays on the card
    const asked = [], ask = async (system, prompt) => { asked.push(prompt); return "Your mom wants a call; the standup move can wait."; };
    out.talk = await w.boardChat("c", "What needs me?", { ask }); out.talk2 = await w.boardChat("c", "Tell Mom Sunday works", { ask });
    out.asked = asked; out.talkCard = w.watchBoard(24).cards.find((c) => c.id === "c").chat;
    out.talkNone = await w.boardChat("nope", "x", { ask }); out.talkEmpty = await w.boardChat("c", " ", { ask });
    out.talkOf = w.talkOf({ name: "WhatsApp", chat: out.talkCard });
    out.talkCleared = w.clearBoardChat("c"); out.talkAfter = w.watchBoard(24).cards.find((c) => c.id === "c").chat || null;
    out.seen = w.seenWatch("c"); out.seenNone = w.seenWatch("nope"); out.cliSeenNoId = sym("watch", "seen");
    out.after = w.watchBoard(24); out.afterWaiting = w.waitingOn(24).map((x) => x.label); out.stillNew = w.newsSince(24).filter((n) => n.watch === "c").length;
    out.cliSeen = sym("watch", "seen", "m"); out.afterCli = w.watchBoard(24);
    console.log(JSON.stringify(out));`], { encoding: "utf8", env: { ...process.env, HOME: bhome, USERPROFILE: bhome } });
  let bo = {}; try { bo = JSON.parse(bx.stdout); } catch {}
  const bc = ((bo.day || {}).cards || []), bcard = (id) => bc.find((c) => c.id === id) || {};
  ok("a card per watch, in the order you added them, with its source", bc.map((c) => c.id + ":" + c.source).join(" ") === "m:mail g:github c:chat j:page", bc.map((c) => c.id + ":" + c.source));
  ok("each card counts its own last 24 hours: 1 email, 60 GitHub notifications, 2 WhatsApp messages, 0 on Jira", bcard("m").label === "1 email" && bcard("g").count === 60 && bcard("c").label === "2 WhatsApp messages" && bcard("j").label === "0 new" && bo.day.total === 63, bc.map((c) => c.label));
  ok("a busy GitHub doesn't push your mail off the board (it would off the 50 newest)", bcard("m").items.length === 1 && bcard("m").items[0].mail === true && bcard("g").items.length === 8 && !bcard("g").items[0].mail, [bcard("m").items, bcard("g").items.length]);
  ok("a card carries its latest brief; the week shows the older email too", bcard("c").brief && bcard("c").brief.text === "Your mom wants a call." && !bcard("m").brief && ((bo.week || {}).cards || [])[0].count === 2, [bcard("c").brief, bo.week && bo.week.cards[0].count]);
  ok("Standup counts WhatsApp as messages too", (bo.waiting || []).includes("2 WhatsApp messages"), bo.waiting);
  const cbo = (bo.cliBoard || {}).j || {};
  ok("symbiot watch board: the Dashboard's cards as JSON, --hours as on the Dashboard", bo.cliBoard && bo.cliBoard.code === 0 && cbo.total === 63 && cbo.hours === 24 && (cbo.cards || []).map((c) => c.id + ":" + c.count).join(" ") === "m:1 g:60 c:2 j:0" && cbo.cards[2].items[0].chat === true && ((bo.cliWeek || {}).j || {}).hours === 168, bo.cliBoard);
  const acard = (id) => ((bo.after || {}).cards || []).find((c) => c.id === id) || {};
  ok("Seen: that card goes back to 0 (its brief too); the other cards keep theirs", bo.seen && bo.seen.cleared > 0 && acard("c").count === 0 && acard("c").items.length === 0 && !acard("c").brief && acard("m").count === 1 && acard("g").count === 60 && bo.after.total === 61, (bo.after || {}).cards && bo.after.cards.map((c) => c.id + ":" + c.count));
  ok("Seen: Standup doesn't count it as waiting any more, but what it found is still under Watching", !(bo.afterWaiting || []).some((l) => /WhatsApp/.test(l)) && bo.stillNew === 2 && /No watch nope/.test((bo.seenNone || {}).error || ""), [bo.afterWaiting, bo.stillNew]);
  ok("symbiot watch board --line: one line for a status bar, the cards with something new", bo.cliLine === "1 email · 60 GitHub notifications · 2 WhatsApp messages\n" && bo.linePage === "2 new on Jira" && bo.lineNone === "", [bo.cliLine, bo.linePage, bo.lineNone]);
  const tp = (bo.asked || [])[0] || "", tp2 = (bo.asked || [])[1] || "";
  ok("talk it over: the AI is sent the card's items and brief, and the talk so far", /Mom: call me/.test(tp) && /Team: standup moved/.test(tp) && /Your mom wants a call\./.test(tp) && !/Sam, Contract/.test(tp) && /They say \(on WhatsApp card\): What needs me\?/.test(tp) && /This chat so far:\nUser: What needs me\?/.test(tp2), [tp, tp2]);
  ok("talk it over: kept on the card, both turns; a missing card or an empty question is refused; clear forgets it", (bo.talkCard || []).length === 4 && bo.talkCard[3].text === "Your mom wants a call; the standup move can wait." && bo.talk2.chat.length === 4 && /No watch nope/.test((bo.talkNone || {}).error || "") && (bo.talkEmpty || {}).error === "empty" && bo.talkCleared && bo.talkCleared.ok && bo.talkAfter === null, [bo.talkCard, bo.talkNone, bo.talkEmpty, bo.talkAfter]);
  ok("talkOf: the talk, as the draft's brief carries it", /^## What the user said about it/.test(bo.talkOf || "") && /\*\*User:\*\* Tell Mom Sunday works/.test(bo.talkOf || ""), bo.talkOf);
  ok("symbiot watch seen <id> does the same from a terminal (and needs an id)", bo.cliSeen && bo.cliSeen.code === 0 && ((bo.afterCli || {}).cards || [])[0].count === 0 && bo.afterCli.total === 60 && bo.cliSeenNoId && bo.cliSeenNoId.code === 1, [bo.cliSeen, bo.cliSeenNoId]);

  console.log("DRAFT A REPLY — a new email handed to your agent, which never sends (watch.mjs, headless.mjs)");
  ok("isSend: Gmail's Send and Schedule send are sends; a row about sending, or Sender info, isn't", isSend({ kind: "button", label: "Send ‪(Ctrl-Enter)‬" }) && isSend({ kind: "menu item", label: "Schedule send" }) && !isSend({ kind: "row", label: "Ann, Please send the invoice" }) && !isSend({ kind: "button", label: "Sender info" }) && !isSend({ kind: "link", label: "Sent" }), "");
  ok("draftsUrl: Gmail's Drafts next to the inbox you watch (the same account); none elsewhere", draftsUrl("https://mail.google.com/mail/u/1/#inbox") === "https://mail.google.com/mail/u/1/#drafts" && draftsUrl("https://outlook.live.com/mail/0/") === "", draftsUrl("https://mail.google.com/mail/u/1/#inbox"));
  const drhome = join(ROOT, "drhome"); mkdirSync(join(drhome, ".config", "symbiot", "screens"), { recursive: true });
  const dx = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
    import { join } from "node:path";
    import { execFile } from "node:child_process";
    const dir = join(${JSON.stringify(drhome)}, ".config", "symbiot"), cfg =(c) => writeFileSync(join(dir, "config.json"), JSON.stringify(c));
    const INBOX = "https://mail.google.com/mail/u/0/#inbox", now = Date.now();
    writeFileSync(join(dir, "watch.json"), JSON.stringify({ briefs: [],
      watches: [{ id: "w1", name: "Inbox", url: INBOX, every: 15, added: 1, last: 1, checked: 1, seen: [], chat: [{ role: "user", text: "Tell Sam the start date is the 1st", ts: 1 }, { role: "ai", text: "Reply to Sam: the start date is the 1st.", ts: 1 }] }, { id: "w2", name: "GitHub notifications", url: "https://github.com/notifications", every: 5, added: 1, last: 1, checked: 1, seen: [] }, { id: "w3", name: "WhatsApp", url: "https://web.whatsapp.com/", every: 5, added: 1, last: 1, checked: 1, seen: [] }],
      news: [{ id: "n1", watch: "w1", name: "Inbox", ts: now, text: "Sam Ng, Contract signed, Here's the signed copy. Can you confirm the start date?" }, { id: "n2", watch: "w2", name: "GitHub notifications", ts: now, text: "pat/app · CI failed" }, { id: "n3", watch: "w3", name: "WhatsApp", ts: now, text: "Mom 10:02 Are you coming for dinner on Sunday?" }] }));
    writeFileSync(join(dir, "screens", "screens.json"), JSON.stringify([{ id: "abcdefabcdef", name: "Reply", w: 1280, h: 800, ts: now, via: "headless", page: { url: INBOX, title: "Inbox" },
      regions: [{ id: "r1", label: "Send ‪(Ctrl-Enter)‬", kind: "button", x: 10, y: 10, w: 60, h: 30 }, { id: "r2", label: "Ann, Please send the invoice", kind: "row", x: 10, y: 60, w: 600, h: 30 }] },
      { id: "bcdefabcdefa", name: "Chat", w: 1280, h: 800, ts: now, via: "headless", page: { url: "https://web.whatsapp.com/", title: "WhatsApp" }, regions: [{ id: "r3", label: "Type a message", kind: "field", x: 400, y: 740, w: 600, h: 40 }] }]));
    cfg({});
    const w = await import(${JSON.stringify(join(dirname(INDEX), "watch.mjs"))});
    const h = await import(${JSON.stringify(join(dirname(INDEX), "headless.mjs"))});
    const out = {};
    out.state = w.watchState();
    out.notMail = w.draftReply("n2"); out.gone = w.draftReply("nope"); out.untrusted = w.draftReply("n1");
    cfg({ trustedSites: ["mail.google.com"] }); out.noAgent = w.draftReply("n1");
    cfg({ trustedSites: ["mail.google.com"], agentCmd: "code {dir}" }); out.editor = w.draftReply("n1");
    cfg({ trustedSites: ["mail.google.com"], agentCmd: 'echo "{prompt}" > prompt.txt; printenv SYMBIOT_DRAFT > env.txt' });
    out.ok = w.draftReply("n1");
    const envFile = join(out.ok.dir || "", "env.txt");
    for (let i = 0; i < 100 && !existsSync(envFile); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 200));
    try { out.env = readFileSync(envFile, "utf8").trim(); out.prompt = readFileSync(join(out.ok.dir, "prompt.txt"), "utf8"); } catch {}
    try { out.brief = readFileSync(join(out.ok.dir, ".symbiot", "TASKS.md"), "utf8"); out.log = readFileSync(join(out.ok.dir, ".symbiot", "agent.log"), "utf8"); } catch {}
    out.drafted = (w.watchState().news.find((n) => n.id === "n1") || {}).drafted;
    // a WhatsApp chat: its own brief, and the reply typed into the message box, unsent
    cfg({ trustedSites: ["mail.google.com"], agentCmd: 'echo "{prompt}" > prompt.txt' }); out.chatUntrusted = w.draftReply("n3");
    cfg({ trustedSites: ["mail.google.com", "web.whatsapp.com"], agentCmd: 'echo "{prompt}" > prompt.txt' }); out.chat = w.draftReply("n3");
    // Open in WhatsApp: not while the agent's still typing; then Symbiot's browser opens at the chat's watch
    const opened = [], open = async (u) => { opened.push(u); return { ok: true, url: u }; };
    out.openEarly = await w.openChat("n3", { open });
    try { out.chatBrief = readFileSync(join(out.chat.dir, ".symbiot", "TASKS.md"), "utf8"); } catch {}
    for (let i = 0; i < 100 && !existsSync(join(out.chat.dir || "", "prompt.txt")); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    out.openChat = await w.openChat("n3", { open }); out.openMail = await w.openChat("n1", { open }); out.openGone = await w.openChat("nope", { open }); out.opened = opened;
    // Enter sends in a chat: a draft's run can't press it, even confirmed, nor through the CLI
    out.enter = await h.typeRegion("bcdefabcdefa", "r3", "See you then", { enter: true, confirmed: true, noSend: true });
    out.cliEnter = await new Promise((r) => execFile(process.execPath, [${JSON.stringify(INDEX)}, "screens", "type", "bcdefabcdefa", "r3", "See you", "--enter", "--yes"], { env: { ...process.env, SYMBIOT_DRAFT: "1" } }, (err, stdout) => r({ code: err ? err.code : 0, out: stdout })));
    out.mode = statSync(w.DRAFTS_DIR).mode & 0o777;
    // the Send guard, even confirmed; and through the CLI, from the run's SYMBIOT_DRAFT
    out.send = await h.pressRegion("abcdefabcdef", "r1", { confirmed: true, noSend: true });
    out.cli = await new Promise((r) => execFile(process.execPath, [${JSON.stringify(INDEX)}, "screens", "press", "abcdefabcdef", "r1", "--yes"], { env: { ...process.env, SYMBIOT_DRAFT: "1" } }, (err, stdout) => r({ code: err ? err.code : 0, out: stdout })));
    // the same from a terminal: symbiot watch new marks the emails, symbiot watch draft <id> drafts one
    const sym = (...args) => new Promise((r) => execFile(process.execPath, [${JSON.stringify(INDEX)}, ...args], (err, stdout) => { let j = null; try { j = JSON.parse(stdout); } catch {} r({ code: err ? err.code : 0, j }); }));
    out.cliNew = await sym("watch", "new"); out.cliNoId = await sym("watch", "draft"); out.cliGh = await sym("watch", "draft", "n2"); out.cliDraft = await sym("watch", "draft", "n1");
    console.log(JSON.stringify(out)); process.exit(0);`], { encoding: "utf8", timeout: 60000, env: { ...process.env, HOME: drhome, USERPROFILE: drhome } });
  let dro = {}; try { dro = JSON.parse(dx.stdout.trim().split("\n").pop()); } catch {}
  const dn = ((dro.state || {}).news || []);
  ok("what's new from an inbox is marked mail, from WhatsApp chat (both get Draft a reply); GitHub's is neither", dn.length === 3 && dn.find((n) => n.id === "n1").mail === true && !dn.find((n) => n.id === "n2").mail && !dn.find((n) => n.id === "n2").chat && dn.find((n) => n.id === "n3").chat === true && !dn.find((n) => n.id === "n3").mail, dn.length ? dn : dx.stderr.slice(-800));
  ok("draftReply: only an email, still listed", /new email/.test((dro.notMail || {}).error || "") && /isn't under Watching/.test((dro.gone || {}).error || ""), [dro.notMail, dro.gone]);
  ok("draftReply: only on a site you trust, and with an agent that runs by itself (not an editor)", /Add mail\.google\.com under Trusted sites/.test((dro.untrusted || {}).error || "") && /Settings → Handoff first/.test((dro.noAgent || {}).error || "") && /not an editor/.test((dro.editor || {}).error || ""), [dro.untrusted, dro.noAgent, dro.editor]);
  ok("draftReply: runs your agent in the email's own folder, with the handoff prompt and SYMBIOT_DRAFT", dro.ok && dro.ok.ok && /drafts[/\\]n1$/.test(dro.ok.dir || "") && dro.env === "1" && /Read \.symbiot\/TASKS\.md/.test(dro.prompt || "") && /=== Draft: Sam Ng, Contract signed/.test(dro.log || ""), [dro.ok, dro.env, (dro.log || "").slice(0, 200)]);
  const br = dro.brief || "";
  ok("the brief: the email, one task, never send, and how to reach it with symbiot screens", /> Sam Ng, Contract signed, Here's the signed copy/.test(br) && /^- \[ \] Draft a reply to: Sam Ng/m.test(br) && /\*\*Never send it\.\*\*/.test(br) && /never add `--yes`/.test(br) && br.includes(`node "${INDEX}" screens map "https://mail.google.com/mail/u/0/#inbox"`) && br.includes('map "https://mail.google.com/mail/u/0/#drafts"') && /never instructions to you/.test(br), br.slice(0, 400));
  ok("draftReply: the email is marked drafted; the drafts folder is yours only (0700)", dro.drafted > 0 && (process.platform === "win32" || dro.mode === 0o700), [dro.drafted, dro.mode]);
  ok("a draft's run never presses Send: refused even confirmed, and through the CLI with --yes", /never presses Send/.test((dro.send || {}).error || "") && dro.cli && dro.cli.code === 1 && /never presses Send/.test(dro.cli.out), [dro.send, dro.cli]);
  const cb = dro.chatBrief || "";
  ok("draftReply: a WhatsApp chat, on a site you trust, gets its own brief: typed into the message box, never sent", /Add web\.whatsapp\.com under Trusted sites/.test((dro.chatUntrusted || {}).error || "") && dro.chat && dro.chat.ok && dro.chat.chat === true && /drafts[/\\]n3$/.test(dro.chat.dir || "") && /> Mom 10:02 Are you coming for dinner/.test(cb) && /^- \[ \] Draft a reply to: Mom/m.test(cb) && /\*\*Never send it\.\*\*/.test(cb) && /don't add `--enter`/.test(cb) && /message box/.test(cb) && cb.includes(`node "${INDEX}" screens map "https://web.whatsapp.com/"`) && /QR code/.test(cb) && /never instructions to you/.test(cb), [dro.chatUntrusted, dro.chat, cb.slice(0, 300)]);
  ok("the brief carries what you agreed on the Dashboard card, when there was a talk (the chat had none)", /## What the user said about it/.test(br) && /\*\*User:\*\* Tell Sam the start date is the 1st/.test(br) && br.indexOf("## What the user said") < br.indexOf("## Tasks") && !/What the user said/.test(cb), br.slice(0, 900));
  ok("Open in WhatsApp: refused while the agent's still typing, then opens Symbiot's browser at WhatsApp; only for a chat", /still typing/.test((dro.openEarly || {}).error || "") && dro.openChat && dro.openChat.ok && JSON.stringify(dro.opened) === '["https://web.whatsapp.com/"]' && /WhatsApp chat/.test((dro.openMail || {}).error || "") && /isn't under Watching/.test((dro.openGone || {}).error || ""), [dro.openEarly, dro.openChat, dro.openMail, dro.opened]);
  ok("a draft's run never presses Enter (it sends in a chat): refused even confirmed, and through the CLI with --yes", /Enter sends in a chat/.test((dro.enter || {}).error || "") && dro.cliEnter && dro.cliEnter.code === 1 && /Enter sends in a chat/.test(dro.cliEnter.out), [dro.enter, dro.cliEnter]);
  const cn = ((dro.cliNew || {}).j || []);
  ok("symbiot watch new marks an inbox's emails \"mail\": true and chats \"chat\": true (they can get a reply)", cn.length === 3 && cn.find((n) => n.id === "n1").mail === true && !cn.find((n) => n.id === "n2").mail && cn.find((n) => n.id === "n3").chat === true, dro.cliNew);
  ok("symbiot watch draft: needs an id, refuses what isn't an email (exit 1)", dro.cliNoId && dro.cliNoId.code === 1 && /watch new lists them/.test((dro.cliNoId.j || {}).error || "") && dro.cliGh && dro.cliGh.code === 1 && /new email/.test((dro.cliGh.j || {}).error || ""), [dro.cliNoId, dro.cliGh]);
  ok("symbiot watch draft <id>: hands the email to your agent, like the button, and says where its log is", dro.cliDraft && dro.cliDraft.code === 0 && (dro.cliDraft.j || {}).ok && /drafts[/\\]n1$/.test(dro.cliDraft.j.dir || "") && /agent\.log/.test(dro.cliDraft.j.next || ""), dro.cliDraft);

  console.log("WATCH ON YOUR PHONE — pair with a code, then the phone asks what's new (phone.mjs)");
  const lan = lanAddresses({ lo: [{ family: "IPv4", address: "127.0.0.1", internal: true }], docker0: [{ family: "IPv4", address: "172.17.0.1", internal: false }], tailscale0: [{ family: "IPv4", address: "100.64.0.2", internal: false }], wlp2s0: [{ family: "IPv4", address: "192.168.8.50", internal: false }, { family: "IPv6", address: "fe80::1", internal: false }] });
  ok("lanAddresses: your Wi-Fi address first, not Docker's or loopback", lan.join() === "192.168.8.50,100.64.0.2", lan);
  ok("computerUrl: an address as typed, with the port Symbiot uses unless one's given", computerUrl("192.168.8.50") === "http://192.168.8.50:7392" && computerUrl(" 192.168.8.50:8000/ ") === "http://192.168.8.50:8000" && computerUrl("") === "", [computerUrl("192.168.8.50"), computerUrl(" 192.168.8.50:8000/ ")]);
  const phome = join(ROOT, "phome"); mkdirSync(join(phome, ".config", "symbiot"), { recursive: true });
  const px = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { createServer } from "node:net";
    import { writeFileSync, readFileSync } from "node:fs";
    import { join } from "node:path";
    const port = await new Promise((r) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
    const dir = join(${JSON.stringify(phome)}, ".config", "symbiot");
    writeFileSync(join(dir, "config.json"), JSON.stringify({ phoneLink: { port } }));
    const p = await import(${JSON.stringify(join(dirname(INDEX), "phone.mjs"))});
    const out = {}, told = [];
    const put = (news, briefs = []) => writeFileSync(join(dir, "watch.json"), JSON.stringify({ watches: [], news, briefs }));
    put([{ id: "o", watch: "w1", name: "Inbox", ts: 1, text: "Old mail" }]);
    out.off = p.linkState();
    out.on = await p.setPhoneLink(true);
    out.wrong = await p.pairComputer("127.0.0.1:" + port, "000000" === out.on.code ? "111111" : "000000");
    out.bad = await p.pairComputer("", "123456");
    out.paired = await p.pairComputer("127.0.0.1:" + port, out.on.code, { name: "Pixel" });
    out.reuse = await (await fetch("http://127.0.0.1:" + port + "/phone/pair", { method: "POST", body: JSON.stringify({ code: out.on.code }) })).json();
    const since = JSON.parse(readFileSync(join(dir, "config.json"), "utf8")).computer.since;
    put([{ id: "a", watch: "w1", name: "Inbox", ts: since + 10, text: "Sam, Contract signed" }, { id: "b", watch: "w1", name: "Inbox", ts: since + 10, text: "Ann, Lunch?" }, { id: "c", watch: "w2", name: "GitHub notifications", ts: since + 5, text: "pat/app · CI failed" }, { id: "o", watch: "w1", name: "Inbox", ts: 1, text: "Old mail" }],
      [{ id: "x", watch: "w1", name: "Inbox", ts: since + 10, count: 2, text: "Needs you: Sam's contract." }]);
    out.poll = await p.pollComputer({ notify: (t, b) => told.push([t, b]) }); out.told = told.slice();
    out.again = await p.pollComputer({ notify: (t, b) => told.push([t, b]) }); out.toldAgain = told.length;
    out.stranger = (await fetch("http://127.0.0.1:" + port + "/phone/news?since=0", { headers: { "x-symbiot-phone": "nope" } })).status;
    out.other = (await fetch("http://127.0.0.1:" + port + "/api/tasks")).status;
    out.state = p.linkState();
    p.newCode(); for (let i = 0; i < 5; i++) await fetch("http://127.0.0.1:" + port + "/phone/pair", { method: "POST", body: JSON.stringify({ code: "abc" }) });
    out.burnt = p.linkState().code || "";
    p.unpairPhone(out.state.phones[0].id); out.unpaired = await p.pollComputer({ notify: () => {} });
    out.offAgain = await p.setPhoneLink(false);
    out.forgot = p.forgetComputer();
    console.log(JSON.stringify(out)); process.exit(0);`], { encoding: "utf8", timeout: 60000, env: { ...process.env, HOME: phome, USERPROFILE: phome } });
  let po = {}; try { po = JSON.parse(px.stdout.trim().split("\n").pop()); } catch {}
  ok("off until you switch it on: nothing listens", po.off && po.off.on === false && po.off.listening === false, po.off || px.stderr.slice(-600));
  ok("switched on: it listens, and shows a 6-digit code at once", po.on && po.on.listening && /^\d{6}$/.test(po.on.code || "") && po.on.until > 0, po.on);
  ok("a wrong code, or no address, doesn't pair", po.wrong && !po.wrong.paired && /isn't right/.test(po.wrong.error || "") && po.bad && /address/.test(po.bad.error || ""), [po.wrong, po.bad]);
  ok("the right code pairs the phone, and the code can't be used again", po.paired && po.paired.paired && po.paired.url && !po.paired.error && /No pairing code is open/.test((po.reuse || {}).error || ""), [po.paired, po.reuse]);
  ok("the phone shows one notification per watch per read, with its brief, nothing from before pairing", po.poll && po.poll.shown === 2 && (po.told || []).length === 2 && po.told.some(([t, b]) => t === "2 new · Inbox" && b === "Needs you: Sam's contract.") && po.told.some(([t, b]) => t === "1 new · GitHub notifications" && /CI failed/.test(b)) && !po.told.some(([, b]) => /Old mail/.test(b)), [po.poll, po.told]);
  ok("asked again: nothing new, nothing shown", po.again && po.again.shown === 0 && po.toldAgain === 2 && !po.again.error, po.again);
  ok("only a paired phone gets what's new, and nothing else is served there", po.stranger === 403 && po.other === 404, [po.stranger, po.other]);
  ok("the computer lists the phone by name, and when it last asked", po.state && po.state.phones.length === 1 && po.state.phones[0].name === "Pixel" && po.state.phones[0].seen > 0 && !("token" in po.state.phones[0]), po.state && po.state.phones);
  ok("five wrong codes and the code is gone", po.burnt === "", po.burnt);
  ok("unpaired: the phone is told to pair again", po.unpaired && /isn't paired any more/.test(po.unpaired.error || ""), po.unpaired);
  ok("switched off: it stops listening; the phone can forget the computer", po.offAgain && po.offAgain.on === false && po.offAgain.listening === false && po.forgot && po.forgot.paired === false, [po.offAgain, po.forgot]);
  // `symbiot phone` in Termux: the CLI runs as Android (process.platform), its own
  // home, against a computer listening in this script
  const pchome = join(ROOT, "pchome"), phhome = join(ROOT, "phhome");
  mkdirSync(join(pchome, ".config", "symbiot"), { recursive: true }); mkdirSync(join(phhome, ".config", "symbiot"), { recursive: true });
  const pc = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { createServer } from "node:net";
    import { writeFileSync } from "node:fs";
    import { join } from "node:path";
    import { execFile } from "node:child_process";
    const port = await new Promise((r) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
    writeFileSync(join(${JSON.stringify(pchome)}, ".config", "symbiot", "config.json"), JSON.stringify({ phoneLink: { port } }));
    const p = await import(${JSON.stringify(join(dirname(INDEX), "phone.mjs"))});
    const code = (await p.setPhoneLink(true)).code;
    const cli = (home, android, ...args) => new Promise((r) => execFile(process.execPath, [...(android ? ["--import", "data:text/javascript,Object.defineProperty(process,'platform',{value:'android'})"] : []), ${JSON.stringify(INDEX)}, "phone", ...args],
      { env: { ...process.env, HOME: home, USERPROFILE: home } }, (err, stdout) => r({ code: err ? err.code : 0, out: stdout })));
    const ph = (...a) => cli(${JSON.stringify(phhome)}, true, ...a), out = {};
    out.before = await ph();
    out.noCode = await ph("pair", "127.0.0.1:" + port);
    out.wrong = await ph("pair", "127.0.0.1:" + port, code === "000000" ? "111111" : "000000");
    out.paired = await ph("pair", "127.0.0.1:" + port, code.slice(0, 3), code.slice(3));
    out.status = await ph();
    out.check = await ph("check");
    out.code = await ph("code");
    out.onPc = await cli(${JSON.stringify(pchome)}, false, "pair", "127.0.0.1:" + port, "123456");
    out.forget = await ph("forget"); out.after = await ph();
    console.log(JSON.stringify(out)); process.exit(0);`], { encoding: "utf8", timeout: 90000, env: { ...process.env, HOME: pchome, USERPROFILE: pchome } });
  let pco = {}; try { pco = JSON.parse(pc.stdout.trim().split("\n").pop()); } catch {}
  const said = (k) => (pco[k] || {}).out || "";
  ok("symbiot phone (Termux): not paired yet says how to pair", pco.before && pco.before.code === 0 && /Not paired with a computer.*symbiot phone pair <address> <code>/s.test(said("before")), pco.before || pc.stderr.slice(-600));
  ok("symbiot phone pair: no code, or a wrong one, fails with what to do", pco.noCode && pco.noCode.code === 1 && /6-digit code/.test(said("noCode")) && pco.wrong && pco.wrong.code === 1 && /isn't right/.test(said("wrong")), [said("noCode"), said("wrong")]);
  ok("symbiot phone pair <address> <code>: pairs from the command line, the code as shown (123 456)", pco.paired && pco.paired.code === 0 && /Paired with/.test(said("paired")) && /symbiot app/.test(said("paired")), pco.paired);
  ok("symbiot phone: the computer it's paired with; check asks it now", /^Paired with/.test(said("status")) && pco.check && pco.check.code === 0 && /Nothing new from/.test(said("check")), [said("status"), pco.check]);
  ok("symbiot phone: code is for the computer, pair is for the phone", pco.code && pco.code.code === 1 && /for the computer/.test(said("code")) && pco.onPc && pco.onPc.code === 1 && /That's for the phone/.test(said("onPc")), [said("code"), said("onPc")]);
  ok("symbiot phone forget: stops asking it", /^Forgot /.test(said("forget")) && /Not paired/.test(said("after")), [said("forget"), said("after")]);

  console.log("DESKTOP — the weekly write-up's schedule, and start at login (from symbiot-desktop)");
  const at = (daysAgo, hour, min = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(hour, min, 0, 0); return d.getTime(); };
  const today = new Date().getDay();
  ok("due once today's slot has passed and it hasn't run since", weeklyDue({ on: true, day: today, hour: 16, last: at(7, 16, 30) }, at(0, 17)), "");
  ok("not due before today's slot (last week's already ran)", !weeklyDue({ on: true, day: today, hour: 16, last: at(7, 16, 30) }, at(0, 15)), "");
  ok("a slot missed while off runs when it's next up (days later)", weeklyDue({ on: true, day: (today + 5) % 7, hour: 9, last: at(9, 9, 30) }, at(0, 12)), "");
  ok("not due again after it ran", !weeklyDue({ on: true, day: today, hour: 16, last: at(0, 16, 5) }, at(0, 17)), "");
  ok("never due while off", !weeklyDue({ on: false, day: today, hour: 0, last: 0 }, at(0, 23)), "");
  ok("lastSlot lands on the right weekday and hour", new Date(lastSlot(at(0, 12), (today + 1) % 7, 8)).getDay() === (today + 1) % 7 && new Date(lastSlot(at(0, 12), (today + 1) % 7, 8)).getHours() === 8 && lastSlot(at(0, 12), (today + 1) % 7, 8) < at(0, 12), "");
  const lin = autostartContent("/usr/bin/node", "/opt/sym $x/index.mjs", "linux", "/usr/bin:/bin");
  ok("Linux autostart: an XDG entry that runs `app` with no window, paths quoted", /^Exec=env SYMBIOT_NO_OPEN=1 "PATH=\/usr\/bin:\/bin" "\/usr\/bin\/node" "\/opt\/sym \\\$x\/index.mjs" app$/m.test(lin) && /\[Desktop Entry\]/.test(lin), lin);
  const mac = autostartContent("/usr/local/bin/node", "/a&b/index.mjs", "darwin", "/usr/bin");
  ok("macOS autostart: a LaunchAgent that runs at load, XML-escaped", /<key>RunAtLoad<\/key><true\/>/.test(mac) && mac.includes("<string>/a&amp;b/index.mjs</string>") && /SYMBIOT_NO_OPEN<\/key><string>1</.test(mac), mac);
  ok("Windows autostart: a Startup-folder script", /set SYMBIOT_NO_OPEN=1\r\nstart "Symbiot" \/min "C:\\node.exe" "C:\\s\\index.mjs" app/.test(autostartContent("C:\\node.exe", "C:\\s\\index.mjs", "win32")), autostartContent("C:\\node.exe", "C:\\s\\index.mjs", "win32"));
  const droid = autostartContent("/data/data/com.termux/files/usr/bin/node", "/sdcard/it's/index.mjs", "android", "/data/data/com.termux/files/usr/bin");
  ok("Android autostart: a Termux:Boot script with a wake lock, paths single-quoted", autostartFile("android", "/h") === "/h/.termux/boot/symbiot" && /^#!\/data\/data\/com\.termux\/files\/usr\/bin\/sh\n/.test(droid) && droid.includes("termux-wake-lock") && droid.includes("exec '/data/data/com.termux/files/usr/bin/node' '/sdcard/it'\\''s/index.mjs' app") && /SYMBIOT_NO_OPEN=1/.test(droid), droid);
  ok("notifications: osascript on macOS, a PowerShell balloon on Windows", notifyCmd("Symbiot", "Hi", "darwin")[0] === "osascript" && notifyCmd("Symbiot", "it's", "win32")[1].join(" ").includes("'it''s'"), notifyCmd("Symbiot", "it's", "win32"));
  // isolated HOME: these write Symbiot's config and the OS autostart file
  const dhome = join(ROOT, "dhome"); mkdirSync(dhome, { recursive: true });
  const ds = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import * as d from ${JSON.stringify(join(dirname(INDEX), "desktop.mjs"))};
    import { existsSync } from "node:fs";
    const out = {};
    out.on = d.setWeekly({ on: true, day: 3, hour: 9 }); out.dueNow = d.weeklyDue(d.weeklyCfg());
    out.badDay = d.setWeekly({ day: 9, hour: "" });
    out.as = d.setAutostart(true, "/opt/symbiot/index.mjs"); out.asFile = existsSync(out.as.file) && out.as.file.startsWith(${JSON.stringify(dhome)});
    out.off = d.setAutostart(false); out.offGone = !existsSync(out.as.file);
    out.npx = d.setAutostart(true, "/home/x/.npm/_npx/abc/node_modules/symbiot/index.mjs");
    console.log(JSON.stringify(out));`], { encoding: "utf8", env: { ...process.env, HOME: dhome, USERPROFILE: dhome } });
  let dso = {}; try { dso = JSON.parse(ds.stdout); } catch {}
  ok("switching the weekly write-up on saves the schedule and doesn't fire at once", dso.on && dso.on.on === true && dso.on.day === 3 && dso.on.hour === 9 && dso.dueNow === false, dso.on || ds.stderr);
  ok("an out-of-range day or empty hour keeps what was set", dso.badDay && dso.badDay.day === 3 && dso.badDay.hour === 9, dso.badDay);
  ok("start at login writes its file inside HOME, and off removes it", dso.as && dso.as.on && dso.asFile && dso.off && !dso.off.on && dso.offGone, dso);
  ok("start at login refuses an npx copy (it would vanish)", dso.npx && /npx/.test(dso.npx.error || "") && !dso.npx.on, dso.npx);
  // runWeekly's notification, seen as the Android app's notify file (no real popup)
  const wkHome = join(ROOT, "wkHome"); mkdirSync(wkHome, { recursive: true });
  const wkr = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import * as d from ${JSON.stringify(join(dirname(INDEX), "desktop.mjs"))};
    import { existsSync, readFileSync, unlinkSync } from "node:fs";
    import { join } from "node:path";
    const nf = join(${JSON.stringify(wkHome)}, ".config", "symbiot", "android-notify.jsonl"), lines = () => existsSync(nf) ? readFileSync(nf, "utf8").trim().split("\\n").length : 0;
    const produce = async () => ({ text: "Shipped things.", footer: "f" }), out = {};
    out.quiet = await d.runWeekly(produce, { notify: false }); out.quietN = lines();
    out.loud = await d.runWeekly(produce); out.loudN = lines(); unlinkSync(nf);
    out.offline = await d.runWeekly(async () => ({ error: "not-connected" }), { notify: false }); out.offlineN = lines();
    out.saved = readFileSync(out.quiet.file, "utf8");
    console.log(JSON.stringify(out));`], { encoding: "utf8", env: { ...process.env, HOME: wkHome, USERPROFILE: wkHome, SYMBIOT_ANDROID_APP: "1" } });
  let wko = {}; try { wko = JSON.parse(wkr.stdout); } catch {}
  ok("runWeekly(produce, { notify: false }) saves the week the same, with no notification", wko.quiet && wko.quiet.ok && wko.quietN === 0 && wko.saved === "Shipped things.\n\n---\nf\n" && wko.offline && wko.offline.error === "not-connected" && wko.offlineN === 0, wko.quiet ? wko : wkr.stderr);
  ok("...and notifies by default", wko.loud && wko.loud.ok && wko.loudN === 1, wko);
  ok("runWeekly gives back the write-up with where it saved it (the Week tab shows both)", wko.quiet && wko.quiet.text === "Shipped things." && wko.quiet.footer === "f" && /weeks[/\\]\d{4}-\d{2}-\d{2}\.md$/.test(wko.quiet.file || ""), wko.quiet);

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
