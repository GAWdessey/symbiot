// Merged is not live (deploy.mjs): a lane's deploy target, the plain note after Approve or a
// merge, and the Workdesk question before a production deploy. Isolated HOME.
//
//   node test/deploy.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
const cfg = loadConfig(); cfg.deploy = { dailify: { where: "production on sts-prod", url: "https://dailify.co.za" } }; saveConfig(cfg);
const dl = D.deployTarget(lane("dailify", { "README.md": "x" }), "dailify");
ok("the user's config names a target the repo doesn't show", dl && dl.how === "production on sts-prod" && dl.url === "https://dailify.co.za", dl);

console.log("WHAT IT SAYS");
ok("no target: nothing to deploy, says so", D.liveNote(null, "merged").state === "none" && /nothing more to ship/.test(D.liveNote(null, "merged").text));
ok("target merged: NOT live, names where", /NOT live/.test(D.liveNote(dl, "merged").text) && /dailify\.co\.za/.test(D.liveNote(dl, "merged").text));
ok("target not merged yet: not live", D.liveNote(dl, "approved").state === "pending" && /PR still has to merge/.test(D.liveNote(dl, "approved").text));
ok("CI-deploy lane: merged, CI deploys, not live until checked", /not live until/.test(D.liveNote(wf, "merged").text));

console.log("THE QUESTION AND THE TASK");
const path = join(HOME, "dailify");
const pr = "https://github.com/x/dailify/pull/7";
saveTasks([{ id: "t1", text: "Fix Kea", repo: "dailify", archived: true, done: true, pr }, { id: "t2", text: "Other", repo: "dailify", archived: true, done: true, pr: "https://github.com/x/dailify/pull/8" }]);
const r = D.afterShip(path, "dailify", pr, "merged");
const q = readFileSync(join(path, ".symbiot", "QUESTIONS.md"), "utf8");
ok("merge raises the production question", r.asked && /### Deploy dailify \(PR #7\) to production on sts-prod/.test(q) && /## Questions/.test(q), q);
ok("with a recommended agent option and a skip", /🤖 Agent: .*\(recommended\)/.test(q) && /- Skip this part/.test(q));
ok("only that PR's task is marked not live", loadTasks().find((x) => x.id === "t1").liveState === "pending" && !loadTasks().find((x) => x.id === "t2").liveState);
ok("asked once", D.afterShip(path, "dailify", pr, "merged").asked === undefined);
D.markLive("t1");
ok("checked on the live site: live", loadTasks().find((x) => x.id === "t1").liveState === "live");
const queued = D.afterShip(path, "dailify", "https://github.com/x/dailify/pull/9", "approved"), q9 = readFileSync(join(path, ".symbiot", "QUESTIONS.md"), "utf8").split("### ").find((x) => /PR #9/.test(x)) || "";
ok("an Approve that only queued the merge: asked, but not told it's merged (PR #209, 19 Oct 2026)", queued.asked && /isn't merged yet/.test(q9) && !/is merged/.test(q9), q9);
ok("a lane with no target raises nothing", !D.afterShip(lane("bare2", { "README.md": "x" }), "bare2", pr, "merged").asked);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
