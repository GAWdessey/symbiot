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

  console.log("A COPY OF A REPO COMES — the id the first went by is retired, never left on the copy");
  // a copy of a repo (the same first commit) came as a second lane: the first's id was left naming the copy's folder,
  // and the sync wrote the first's questions there (27 Oct 2026)
  repo(join(W, "daily"), "daily"); execSync(`git clone -q ${join(W, "daily")} ${join(W, "forge")}`, { env });
  const solo = { daily: join(W, "daily") }; L.noteLanes(solo); const gid = L.laneIdOf("daily");
  ok("alone, it goes by its first commit", /^g/.test(gid), gid);
  const pair = { daily: join(W, "daily"), forge: join(W, "forge") }; L.noteLanes(pair);
  const d = L.loadLaneIds();
  ok("with its copy, each goes by its path, and the old id names no folder", /^p/.test(L.laneIdOf("daily")) && /^p/.test(L.laneIdOf("forge")) && !d.ids[gid] && d.retired[gid] === L.laneIdOf("daily"), d);
  ok("…a task still carrying the old id is this machine's, not the other's", !L.otherMachine({ laneId: gid, repo: "daily" }));
  // git failing for a moment (a timeout on a busy disk) isn't "no history": the ids stay as they were
  const fail = () => ({ status: null, error: new Error("ETIMEDOUT") });
  const before = L.idsFor(pair), during = L.idsFor(pair, { root: (p) => L.rootOf(p, { git: fail }) });
  ok("a git call that fails keeps the root it had: no id moves", JSON.stringify(before) === JSON.stringify(during), [before, during]);
  const ids0 = JSON.stringify(L.loadLaneIds().ids);
  L.noteLanes(pair, { root: (p) => (p === join(W, "daily") ? "" : L.rootOf(p)) }); // just after a restart: nothing read yet, and git fails for daily
  ok("…and just after a restart, the root kept on disk: the copy never takes the shared id alone", JSON.stringify(L.loadLaneIds().ids).replace(/"at":\d+/g, "") === ids0.replace(/"at":\d+/g, "") && !L.loadLaneIds().ids[gid], L.loadLaneIds().ids);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} laneids: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
