// A lane by what it is (laneids.mjs, tasks.mjs): its git history's first commit, so a task follows its
// lane when the folder is renamed or moved, two clones of one repo stay apart, and a folder without git
// goes by its path (23 Oct 2026). Isolated HOME, real git.
//
//   node test/laneids.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-laneids-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), "{}");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@x.co", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@x.co" };
const repo = (p, msg) => { mkdirSync(p, { recursive: true }); execSync(`git init -q && echo ${msg} > a.txt && git add . && git commit -qm ${msg}`, { cwd: p, env }); };
const L = await import("../laneids.mjs");
const T = { ...(await import("../tasks.mjs")), ...(await import("../core.mjs")) };
try {
  const W = join(HOME, "work"); repo(join(W, "shop"), "shop"); repo(join(W, "cafe"), "cafe"); mkdirSync(join(W, "notes"), { recursive: true });
  execSync(`git clone -q ${join(W, "shop")} ${join(W, "shop-copy")}`, { env });
  const map = { shop: join(W, "shop"), cafe: join(W, "cafe"), notes: join(W, "notes") };
  const ids = L.idsFor(map);
  ok("a repo is its first commit; a folder without git, its path", /^g[0-9a-f]{12}$/.test(ids.shop) && /^g/.test(ids.cafe) && ids.shop !== ids.cafe && /^p[0-9a-f]{12}$/.test(ids.notes), ids);
  const both = L.idsFor({ ...map, "shop-copy": join(W, "shop-copy") });
  ok("two clones of one repo: each by its path, so neither is taken for the other", /^p/.test(both.shop) && /^p/.test(both["shop-copy"]) && both.shop !== both["shop-copy"], both);

  console.log("A FOLDER RENAMED — its tasks follow it");
  L.noteLanes(map);
  const shopId = L.laneIdOf("shop");
  // tasks filed under shop, one before ids existed (no laneId) and one after
  const now = Date.now();
  T.saveTasks([{ id: "a1", text: "Fix the cart", repo: "shop", ts: now }, { id: "a2", text: "New menu page", repo: "cafe", ts: now }]);
  const given = T.noteLaneIds(map);
  ok("each open task is given its lane's id once", given.given === 2 && T.loadTasks().every((t) => t.laneId) && T.noteLaneIds(map).given === 0, given);
  renameSync(join(W, "shop"), join(W, "shop-app"));
  const map2 = { "shop-app": join(W, "shop-app"), cafe: join(W, "cafe"), notes: join(W, "notes") };
  const seen = L.noteLanes(map2);
  ok("the rename is seen: the same lane, now shop-app", seen.renamed.length === 1 && seen.renamed[0].from === "shop" && seen.renamed[0].to === "shop-app" && L.laneIdOf("shop-app") === shopId && L.nameOfId(shopId) === "shop-app", seen);
  const t = T.loadTasks(); T.placeTasks(t, Object.keys(map2));
  const cart = t.find((x) => x.id === "a1");
  ok("the task filed under shop goes to shop-app, by its lane's id, and says where it was", cart.repo === "shop-app" && cart.refiled && cart.refiled.from === "shop", cart);
  ok("…the other lane's task stays where it was", t.find((x) => x.id === "a2").repo === "cafe");
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} laneids: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
