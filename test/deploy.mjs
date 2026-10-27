// Merged is not live (deploy.mjs): a lane's deploy target, the plain note after Approve or a
// merge, and the Workdesk question before a production deploy. Isolated HOME.
//
//   node test/deploy.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-deploy-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const D = await import("../deploy.mjs");
const { loadTasks, saveTasks, saveConfig, loadConfig } = await import("../core.mjs");
const lane = (name, files) => { const p = join(HOME, name); for (const [f, c] of Object.entries(files)) { mkdirSync(join(p, f, ".."), { recursive: true }); writeFileSync(join(p, f), c); } mkdirSync(join(p, ".symbiot"), { recursive: true }); return p; };

console.log("A LANE'S DEPLOY TARGET");
ok("a bare repo has none", D.deployTarget(lane("bare", { "README.md": "x" }), "bare") === null);
ok("an npm-publish-only workflow is not a deploy", D.deployTarget(lane("pub", { ".github/workflows/ci.yml": "on: push\njobs:\n  t:\n    steps:\n      - run: npm publish\n" }), "pub") === null);
ok("package.json deploy script", D.deployTarget(lane("a", { "package.json": '{"scripts":{"deploy:prod":"x"},"homepage":"https://a.example"}' }), "a")?.how === "npm run deploy:prod");
ok("its homepage is the live site", D.deployTarget(lane("a", { "package.json": '{"scripts":{"deploy":"x"},"homepage":"https://a.example"}' }), "a")?.url === "https://a.example");
const wf = D.deployTarget(lane("w", { ".github/workflows/deploy.yml": "on:\n  push:\n    branches: [main]\njobs:\n  d:\n    steps:\n      - run: ssh host ./up\n" }), "w");
ok("a CI deploy on push to main deploys by itself", wf && wf.auto === true, wf);
ok("a deploy script is a target that is not automatic", D.deployTarget(lane("s", { "scripts/deploy.sh": "#!/bin/sh\n" }), "s")?.auto === false);
const cfg = loadConfig(); cfg.deploy = { bookly: { where: "production on prod-box", url: "https://bookly.co.za" } }; saveConfig(cfg);
const dl = D.deployTarget(lane("bookly", { "README.md": "x" }), "bookly");
ok("the user's config names a target the repo doesn't show", dl && dl.how === "production on prod-box" && dl.url === "https://bookly.co.za", dl);

console.log("WHAT IT SAYS");
ok("no target: nothing to deploy, says so", D.liveNote(null, "merged").state === "none" && /nothing more to ship/.test(D.liveNote(null, "merged").text));
ok("target merged: NOT live, names where", /NOT live/.test(D.liveNote(dl, "merged").text) && /bookly\.co\.za/.test(D.liveNote(dl, "merged").text));
ok("target not merged yet: not live", D.liveNote(dl, "approved").state === "pending" && /PR still has to merge/.test(D.liveNote(dl, "approved").text));
ok("CI-deploy lane: merged, CI deploys, not live until checked", /not live until/.test(D.liveNote(wf, "merged").text));

console.log("THE QUESTION AND THE TASK");
const path = join(HOME, "bookly");
const pr = "https://github.com/x/bookly/pull/7";
saveTasks([{ id: "t1", text: "Fix Wren", repo: "bookly", archived: true, done: true, pr }, { id: "t2", text: "Other", repo: "bookly", archived: true, done: true, pr: "https://github.com/x/bookly/pull/8" }]);
const r = D.afterShip(path, "bookly", pr, "merged");
const q = readFileSync(join(path, ".symbiot", "QUESTIONS.md"), "utf8");
ok("merge raises the production question", r.asked && /### Deploy bookly \(PR #7\) to production on prod-box/.test(q) && /## Questions/.test(q), q);
ok("with a recommended agent option and a skip", /🤖 Agent: .*\(recommended\)/.test(q) && /- Skip this part/.test(q));
ok("only that PR's task is marked not live", loadTasks().find((x) => x.id === "t1").liveState === "pending" && !loadTasks().find((x) => x.id === "t2").liveState);
ok("asked once", D.afterShip(path, "bookly", pr, "merged").asked === undefined);
D.markLive("t1");
ok("checked on the live site: live", loadTasks().find((x) => x.id === "t1").liveState === "live");
const queued = D.afterShip(path, "bookly", "https://github.com/x/bookly/pull/9", "approved"), q9 = readFileSync(join(path, ".symbiot", "QUESTIONS.md"), "utf8").split("### ").find((x) => /PR #9/.test(x)) || "";
ok("an Approve that only queued the merge: asked, but not told it's merged (PR #209, 19 Oct 2026)", queued.asked && /isn't merged yet/.test(q9) && !/is merged/.test(q9), q9);
ok("a lane with no target raises nothing", !D.afterShip(lane("bare2", { "README.md": "x" }), "bare2", pr, "merged").asked);
// a website workflow that runs only for the site's own files (symbiot's pages.yml: PRs #202 and #209 changed none)
const PAGES = "on:\n  push:\n    branches: [main]\n    paths: [\"site/**\", \".github/workflows/pages.yml\"]\n  workflow_dispatch:\njobs:\n  deploy:\n    steps:\n      - uses: actions/deploy-pages@v4\n";
const site = lane("site", { ".github/workflows/pages.yml": PAGES }), sitePr = "https://github.com/x/site/pull/209";
ok("a workflow's paths are what it deploys for", JSON.stringify(D.deployTarget(site, "site").paths) === JSON.stringify(["site/**", ".github/workflows/pages.yml"]), D.deployTarget(site, "site"));
const code = D.afterShip(site, "site", sitePr, "merged", { files: ["agents.mjs", "test/x.mjs"] });
ok("a PR that changed none of them: no deploy question, and it says there's nothing to deploy", !code.asked && code.state === "none" && /None of its files/.test(code.text) && !/Deploy site/.test((() => { try { return readFileSync(join(site, ".symbiot", "QUESTIONS.md"), "utf8"); } catch { return ""; } })()), code);
const page = D.afterShip(site, "site", "https://github.com/x/site/pull/211", "merged", { files: ["agents.mjs", "site/index.html"] });
ok("…one that changed a site file is asked about, as before", page.asked && page.state === "pending", page);
ok("…and when GitHub can't say which files, it's asked as before", D.afterShip(site, "site", "https://github.com/x/site/pull/212", "merged", { files: null }).asked === true);
ok("the PR's files come from gh", JSON.stringify(D.prFiles(site, 5, () => ({ status: 0, stdout: JSON.stringify({ files: [{ path: "a.mjs" }, { path: "site/i.html" }] }) }))) === '["a.mjs","site/i.html"]' && D.prFiles(site, 5, () => ({ status: 1, stdout: "" })) === null);

{
// 20 Oct 2026 review, proposal 4: 98 deploy tasks in 11 days, ops improvising the same ssh deploy each time
console.log("A RUNBOOK — the command, a live check, a standing yes, live only after a real check");
ok("a runbook needs its exact command", D.setRunbook("dl", { where: "prod-box" }).error && /--how/.test(D.setRunbook("dl", { where: "prod-box" }).error));
ok("…and a standing yes needs a live check first", /live check/.test(D.setRunbook("dl", { where: "prod-box", how: "ssh prod-box ~/dl/deploy.sh", policy: "always" }, { user: true }).error || ""));
const rb = D.setRunbook("dl", { where: "prod-box", how: "ssh prod-box ~/dl/deploy.sh", url: "https://dl.example", check: "https://dl.example/health", expect: "ok" });
ok("written once, it asks before each deploy until you say otherwise", rb.ok && rb.runbook.policy === "ask" && D.runbookOf("dl").how === "ssh prod-box ~/dl/deploy.sh" && loadConfig().deploy.dl.check === "https://dl.example/health", rb);
const dl = lane("dl", { "package.json": "{}" }), PR = "https://github.com/x/dl/pull/30";
saveTasks([...loadTasks(), { id: "d1", text: "fix the invite", repo: "dl", archived: true, done: true, pr: PR, approvedAt: Date.now() }]);
const ask = D.onMerged(dl, "dl", PR);
const qs = readFileSync(join(dl, ".symbiot", "QUESTIONS.md"), "utf8");
ok("merged, with policy ask: \"Deploy it?\", offering to deploy after every merge from now on", (await ask).asked && /### Deploy dl \(PR #30\) to prod-box/.test(qs) && /deploy it now with its runbook, and after every merge from now on, each checked on https:\/\/dl\.example\/health \(recommended\)/.test(qs) && /and ask again next time/.test(qs), qs);
const acts = [], act = (brief, o) => { acts.push({ brief, o }); return { ok: true, dir: join(HOME, ".config", "symbiot", "drafts", "act-dep" + acts.length) }; };
const ans = await D.onDeployAnswer("dl", "Deploy dl (PR #30) to prod-box (https://dl.example)?", "🤖 Agent: deploy it now with its runbook, and after every merge from now on, each checked on https://dl.example/health", { act });
ok("…the standing yes: deployed now, and from then on", ans.ok && D.runbookOf("dl").policy === "always" && acts.length === 1, [ans, D.runbookOf("dl")]);
ok("…handed to ops with the runbook's command as written, for the lane it's for", /on prod-box, run `ssh prod-box ~\/dl\/deploy\.sh`/.test(acts[0].brief) && /Don't improvise/.test(acts[0].brief) && acts[0].o.lane === "dl", acts[0]);
ok("…and the tasks say it's deploying, not live", loadTasks().find((t) => t.id === "d1").liveState === "pending", loadTasks().find((t) => t.id === "d1"));
ok("the same deploy isn't started twice", (await D.startDeploy("dl", PR, { act })).already && acts.length === 1);
const run0 = await D.deployTick({ running: () => true, fetchFn: async () => { throw new Error("not yet"); } });
ok("while its run goes, nothing is checked", run0.find((x) => x.repo === "dl").state === "running");
const fetched = [];
await D.deployTick({ running: () => false, fetchFn: async (u) => { fetched.push(u); return { ok: true, status: 200, text: async () => "status: ok" }; } });
const t1 = loadTasks().find((t) => t.id === "d1");
ok("its run ended: Symbiot checks the live address itself, and only then is it live", fetched.join() === "https://dl.example/health" && t1.liveState === "live" && /checked on https:\/\/dl\.example\/health/.test(t1.liveNote), [fetched, t1]);
saveTasks([...loadTasks(), { id: "d2", text: "fix the menu", repo: "dl", archived: true, done: true, pr: "https://github.com/x/dl/pull/31", approvedAt: Date.now() }]);
const st = await D.onMerged(dl, "dl", "https://github.com/x/dl/pull/31", { act });
ok("with the standing yes, the next merge is deployed with no question", st.ok && acts.length === 2 && !/PR #31/.test(readFileSync(join(dl, ".symbiot", "QUESTIONS.md"), "utf8")), st);
await D.deployTick({ running: () => false, fetchFn: async () => ({ ok: true, status: 200, text: async () => "maintenance" }) });
const t2 = loadTasks().find((t) => t.id === "d2");
ok("a check that answers without what it should: not live, and it says why", t2.liveState === "failed" && /without "ok"/.test(t2.liveNote), t2);
// a standing yes is the user's only: an agent (the CLI ops runs) can't give it, nor keep it past a change
const yes = () => D.setRunbook("dl", { policy: "always" }, { user: true });
const self = D.setRunbook("dl", { policy: "ask" }) && D.setRunbook("dl", { policy: "always" });
ok("anyone but the user setting deploy-after-every-merge is refused, and it still asks", /user's to switch on/.test(self.error || "") && D.runbookOf("dl").policy === "ask", [self, D.runbookOf("dl")]);
yes(); const how = D.setRunbook("dl", { how: "ssh prod-box ~/dl/deploy2.sh" });
ok("a new deploy command on a runbook with the standing yes: back to asking", how.ok && how.dropped && D.runbookOf("dl").policy === "ask" && D.runbookOf("dl").how === "ssh prod-box ~/dl/deploy2.sh", how);
yes(); const where = D.setRunbook("dl", { where: "homebox" });
ok("…and so is a new host", where.dropped && D.runbookOf("dl").policy === "ask", where);
yes(); const same = D.setRunbook("dl", { where: "homebox", how: "ssh prod-box ~/dl/deploy2.sh", expect: "ok" });
ok("…while the same command on the same host, or another live check word, keeps it", same.ok && !same.dropped && D.runbookOf("dl").policy === "always", same);
const both = D.setRunbook("dl", { how: "ssh prod-box ~/dl/deploy.sh", where: "prod-box", policy: "always" }, { user: true });
ok("the user's own yes with a new command keeps it on", both.ok && D.runbookOf("dl").policy === "always" && D.runbookOf("dl").where === "prod-box", both);
{
  const { spawnSync: sp } = await import("node:child_process");
  D.setRunbook("dl", { policy: "ask" });
  const set = sp(process.execPath, [fileURLToPath(new URL("../index.mjs", import.meta.url)), "deploy", "set", "dl", "--policy", "always"], { encoding: "utf8", env: { ...process.env, HOME, SYMBIOT_NO_APP: "1" } });
  ok("symbiot deploy set --policy always is refused, and changes nothing", set.status === 1 && /user's to switch on/.test(set.stderr) && D.runbookOf("dl").policy === "ask", [set.status, set.stderr]);
}
D.setRunbook("dl", { policy: "never" });
ok("policy never: a merge asks nothing and deploys nothing", (await D.onMerged(dl, "dl", "https://github.com/x/dl/pull/32", { act })).skipped === "never" && acts.length === 2);
const { spawnSync } = await import("node:child_process");
const cli = spawnSync(process.execPath, [fileURLToPath(new URL("../index.mjs", import.meta.url)), "deploy"], { encoding: "utf8", env: { ...process.env, HOME, SYMBIOT_NO_APP: "1" } });
ok("symbiot deploy lists it, in a line", /dl: on prod-box, `ssh prod-box ~\/dl\/deploy\.sh` · live https:\/\/dl\.example · check https:\/\/dl\.example\/health for "ok" · never deploys/.test(cli.stdout), cli.stdout + cli.stderr);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
