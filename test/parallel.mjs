// Parallel runs in one lane (parallel.mjs): two independent tasks run at once, each in
// a git worktree of its own, merged back when they finish; a task that truly clashes,
// or a lane at its cap, waits and says what for. Isolated HOME (set before the modules load).
//
//   node test/parallel.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-par-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const sh = (cwd, ...a) => spawnSync("git", ["-C", cwd, "-c", "user.email=t@t", "-c", "user.name=t", ...a], { encoding: "utf8" });

const P = await import("../parallel.mjs");
const { workTick, workScene } = await import("../home.mjs");
const PRO = { plan: "pro" };

console.log("WHAT A TASK NEEDS — a clash holds it back; nothing else does");
ok("two edits to ui.mjs clash; ui.mjs and phone.mjs don't", P.clash("Fix ui.mjs card", "Rework ui.mjs home") === "file ui.mjs" && P.clash("Fix ui.mjs", "Fix phone.mjs") === "");
ok("the same port clashes", P.clash("Free up port 7392", "Fix the Port 7392 error") === "port 7392");
ok("the phone cable, the publish step and the browser are shared too", P.clash("test on the Android phone over adb", "plug in with USB") === "device" && P.clash("run npm publish", "the trusted publisher") === "publish" && P.clash("sign in with the Symbiot Browser", "use symbiot screens") === "browser");
ok("TASKS.md and ANSWERS.md are in every brief: not a clash", P.clash("Read TASKS.md", "Read TASKS.md") === "");
const v = (o) => P.verdict({ text: "Fix phone.mjs", name: "symbiot", active: [{ text: "Fix ui.mjs", who: "symbiot's run" }], count: 1, cap: 3, pro: true, dirty: [], git: true, ...o });
ok("independent, with room: goes beside", v({}).ok === true);
ok("at the cap: held, and it says how many and where to change it", (() => { const r = v({ count: 3 }); return !r.ok && r.kind === "cap" && /3 agents are already working in symbiot/.test(r.text) && /Settings/.test(r.text); })());
ok("a clash: held, naming the shared thing and the task that has it", (() => { const r = v({ text: "Rework ui.mjs", }); return !r.ok && r.kind === "clash" && /both need ui\.mjs, and "Fix ui\.mjs" has it now/.test(r.text); })());
ok("Free runs one agent at a time", v({ pro: false }).kind === "free");
ok("not a git project: held, saying why", v({ git: false }).kind === "nogit");
ok("a file with uncommitted work: held until it's approved", v({ text: "Fix a.mjs", dirty: ["a.mjs"] }).kind === "dirty");
ok("the cap is a setting: 3 by default, Free is 1", P.laneCap({}, PRO) === 3 && P.laneCap({ laneParallel: 5 }, PRO) === 5 && P.laneCap({ laneParallel: 99 }, PRO) === 8 && P.laneCap({ laneParallel: 5 }, { plan: "free" }) === 1);

console.log("PEEL — the first task is the lane's own run; the independent ones go beside it");
{
  const items = [{ id: "a", text: "Fix ui.mjs" }, { id: "b", text: "Fix phone.mjs" }, { id: "c", text: "Rework ui.mjs again" }, { id: "d", text: "Fix route.mjs" }, { id: "e", text: "Fix tray.mjs" }];
  const r = P.peel(items, { name: "symbiot", cap: 3, pro: true, git: true });
  ok("with a cap of 3: the first stays, two independent ones go beside it, a clash and an overflow stay", r.peeled.map((x) => x.id).join() === "b,d" && r.rest.map((x) => x.id).join() === "a,c,e", r);
  ok("each one held back says why", /ui\.mjs/.test(r.held.c.text) && r.held.e.kind === "cap", r.held);
  ok("a cap of 1 peels nothing", P.peel(items, { name: "s", cap: 1, pro: true, git: true }).peeled.length === 0);
}

console.log("A RUN BESIDE — its own worktree, merged back");
{
  const repo = join(HOME, "repo"); mkdirSync(repo, { recursive: true });
  sh(repo, "init", "-q", "-b", "main"); writeFileSync(join(repo, "a.mjs"), "a1\n"); writeFileSync(join(repo, "b.mjs"), "b1\n"); sh(repo, "add", "-A"); sh(repo, "commit", "-qm", "init");
  mkdirSync(join(repo, ".symbiot"), { recursive: true });
  writeFileSync(join(repo, ".symbiot", "TASKS.md"), "# Symbiot tasks\n\n## Tasks\n- [ ] Change a.mjs\n- [ ] Change b.mjs\n\n## When you finish an item\n- tick it\n");
  const ran = []; let hook;
  const run = (wt, o) => { ran.push(wt); hook = o && o.onExit; return { id: "run1" }; };
  const r = P.startParallel("repo", repo, { id: "t2", text: "Change b.mjs" }, { run });
  ok("started: a worktree of its own on its own branch", r.ok && ran.length === 1 && existsSync(join(ran[0], "b.mjs")) && /symbiot\/par-/.test(sh(ran[0], "branch", "--show-current").stdout), r);
  const brief = readFileSync(join(ran[0], ".symbiot", "TASKS.md"), "utf8");
  ok("its brief lists only its task, and keeps the lane's rules", /- \[ \] Change b\.mjs/.test(brief) && !/Change a\.mjs/.test(brief) && /When you finish an item/.test(brief) && /parallel run/.test(brief), brief);
  ok("it counts as in flight, so the lane's own brief leaves it out", P.inflightIds().has("t2") && P.parallelLane(ran[0]) === "repo");
  // the agent does its work in the worktree and ticks
  const wt = ran[0];
  writeFileSync(join(wt, "b.mjs"), "b2\n"); writeFileSync(join(wt, "new.mjs"), "n\n");
  writeFileSync(join(wt, ".symbiot", "TASKS.md"), brief.replace("- [ ] Change b.mjs", "- [x] Change b.mjs"));
  writeFileSync(join(repo, "a.mjs"), "a2\n"); // the lane's own run changes another file meanwhile
  hook(0);
  ok("merged back: the file changed and the new one are in the lane's folder, beside the lane's own edit", readFileSync(join(repo, "b.mjs"), "utf8") === "b2\n" && existsSync(join(repo, "new.mjs")) && readFileSync(join(repo, "a.mjs"), "utf8") === "a2\n");
  const main = readFileSync(join(repo, ".symbiot", "TASKS.md"), "utf8");
  ok("the task shows ticked in the lane's brief, once", (main.match(/- \[x\] Change b\.mjs/g) || []).length === 1 && /- \[ \] Change a\.mjs/.test(main), main);
  const rf = JSON.parse(readFileSync(join(repo, ".symbiot", "runfiles.json"), "utf8"));
  ok("Approve ships its files: they're recorded as a finished run that ticked", rf.some((x) => x.ticked === 1 && x.files.includes("b.mjs") && x.files.includes("new.mjs")), rf);
  ok("the worktree and branch are gone", !existsSync(wt) && !/par-/.test(sh(repo, "branch").stdout) && P.inflight().length === 0);

  // a clash: both changed the same lines
  const conflicts = [];
  const r2 = P.startParallel("repo", repo, { id: "t3", text: "Rework a.mjs" }, { run }), wt2 = ran[1];
  writeFileSync(join(wt2, "a.mjs"), "a-beside\n"); writeFileSync(join(wt2, ".symbiot", "TASKS.md"), "## Tasks\n- [x] Rework a.mjs\n");
  writeFileSync(join(repo, "a.mjs"), "a-main\n");
  hook(0);
  void r2;
  // addTask is passed at start; call mergeBack again isn't possible (gone), so check the saved patch instead
  ok("a real clash isn't forced in: the lane's file is untouched and the changes are saved as a patch", readFileSync(join(repo, "a.mjs"), "utf8") === "a-main\n" && existsSync(join(repo, ".symbiot")) && /parallel-/.test(sh(repo, "status", "--porcelain", "-uall").stdout + require_ls(join(repo, ".symbiot"))));
  void conflicts;
  // not finished: nothing merges, the task stays open
  const r3 = P.startParallel("repo", repo, { id: "t4", text: "Change b.mjs more" }, { run }), wt3 = ran[2];
  writeFileSync(join(wt3, "b.mjs"), "half\n"); hook(0);
  ok("an unfinished run (nothing ticked) merges nothing", readFileSync(join(repo, "b.mjs"), "utf8") === "b2\n" && r3.ok);
}
function require_ls(d) { return spawnSync("ls", [d], { encoding: "utf8" }).stdout; }

console.log("A CONFLICT — handed to the lane's agent as a task");
{
  const repo = join(HOME, "repo2"); mkdirSync(repo, { recursive: true });
  sh(repo, "init", "-q", "-b", "main"); writeFileSync(join(repo, "a.mjs"), "a1\n"); sh(repo, "add", "-A"); sh(repo, "commit", "-qm", "init");
  mkdirSync(join(repo, ".symbiot"), { recursive: true }); writeFileSync(join(repo, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Rework a.mjs\n");
  let hook; const added = [];
  const run = (wt, o) => { hook = o.onExit; return { id: "r" }; };
  const r = P.startParallel("repo2", repo, { id: "t9", text: "Rework a.mjs" }, { run, addTask: (text, lane) => added.push({ text, lane }) });
  const wt = P.inflight().find((m) => m.taskId === "t9").wt;
  writeFileSync(join(wt, "a.mjs"), "beside\n"); writeFileSync(join(wt, ".symbiot", "TASKS.md"), "## Tasks\n- [x] Rework a.mjs\n");
  writeFileSync(join(repo, "a.mjs"), "main\n");
  hook(0);
  ok("the lane's agent gets a task to merge it, naming the saved changes", r.ok && added.length === 1 && added[0].lane === "repo2" && /Merge a finished task's changes into repo2/.test(added[0].text) && /parallel-[0-9a-f]+\.patch/.test(added[0].text), added);
  ok("the lane's file is as it was, and the patch holds the other side", readFileSync(join(repo, "a.mjs"), "utf8") === "main\n" && P.inflight().length === 0);
}

console.log("THE TICK — two independent tasks queued at one lane both run at once");
{
  const NOW = 1e13, old = NOW - 120000, map = { symbiot: "/s" };
  const T = [{ id: "1", text: "Fix the phone pairing in phone.mjs", repo: "symbiot", ts: old }, { id: "2", text: "Add a Skip button in ui.mjs", repo: "symbiot", ts: old }, { id: "3", text: "Tidy tray.mjs", repo: "symbiot", ts: old }];
  const base = { repos: () => map, name: (p, n) => n, pending: () => [], parked: () => [], cmd: () => "claude -p {prompt}", now: NOW, tasks: () => T, save: () => {}, config: () => ({}),
    facts: () => ({ git: true, dirty: [] }), licence: () => PRO, cap: () => 3, parallel: () => [], beside: () => new Set(), openTasks: () => [], brief: () => ({ at: 0, tasks: [] }), lastRun: () => 0 };
  // lane idle: the first is the lane's run; the independent two go beside it, at the same time
  const pushed = [], ran = [], beside = [];
  const r = workTick({ deps: { ...base, agents: () => [], fails: {}, push: (f) => (pushed.push(f), { written: [{ name: f.repo, path: "/s" }] }), run: (p) => (ran.push(p), { id: "j" }), startParallel: (lane, path, it) => (beside.push(it.id), { ok: true }) } });
  ok("one run for the lane's brief, and the other two started beside it in the same tick", ran.join() === "/s" && beside.sort().join() === "2,3" && pushed[0].exclude.sort().join() === "2,3" && r.beside.length === 2, [ran, beside, pushed]);
  // lane busy: two queued ones that don't clash start beside the running agent
  const busy = { ...base, agents: () => [{ name: "symbiot", path: "/s", status: "running", work: { doing: "Working", todos: [] }, ask: { questions: [] } }], openTasks: () => ["Fix the reader in core.mjs"] };
  const beside2 = [], pushed2 = [];
  const r2 = workTick({ deps: { ...busy, fails: {}, push: (f) => (pushed2.push(f), { empty: true }), run: () => { throw new Error("no second run in the lane's folder"); }, startParallel: (lane, path, it) => (beside2.push(it.id), { ok: true }) } });
  ok("queued behind a run: two start beside it (the cap of 3 counts the run itself), none in its folder; the third waits for a slot", beside2.sort().join() === "1,2" && r2.started.length === 0 && r2.beside.length === 2, [beside2, r2]);
  // a clash with what's running: held, and the card says what for
  const clashing = { ...busy, openTasks: () => ["Rework phone.mjs pairing"] };
  const sc = workScene({ deps: { ...clashing, fails: {} } }), why = (id) => sc.waiting.find((w) => w.id === "task:" + id).why;
  ok("a clash: queued, naming what it waits on and the run", why("1").kind === "queued" && /both need phone\.mjs, and "Rework phone\.mjs pairing" has it now/.test(why("1").text) && /Queued behind symbiot's run: working/.test(why("1").text), why("1"));
  ok("…while the independent ones are next, beside the run", why("2").kind === "beside" && why("3").kind === "beside", [why("2"), why("3")]);
  const full = workScene({ deps: { ...clashing, parallel: () => [{ lane: "symbiot", task: "Fix core.mjs", taskId: "9" }, { lane: "symbiot", task: "Fix route.mjs", taskId: "8" }], fails: {} } });
  ok("with two already beside the run, the next waits for a slot and says so", full.waiting.find((w) => w.id === "task:3").why.waitKind === "cap", full.waiting.find((w) => w.id === "task:3").why);
  // the cap
  const capped = { ...busy, cap: () => 1 };
  const sc2 = workScene({ deps: { ...capped, fails: {} } });
  ok("at the cap: every queued one says the limit and where to change it", sc2.waiting.every((w) => w.why.kind === "queued" && /the limit \(change it in Settings\)/.test(w.why.text)), sc2.waiting.map((w) => w.why.text));
  // Free
  const sc3 = workScene({ deps: { ...busy, licence: () => ({ plan: "free" }), fails: {} } });
  ok("Symbiot Free runs one at a time, and says so", sc3.waiting.every((w) => /Symbiot Free runs one agent at a time/.test(w.why.text)), sc3.waiting.map((w) => w.why.text));
  // one already running beside: that task is "working", not queued
  const sc4 = workScene({ deps: { ...busy, beside: () => new Set(["2"]), fails: {} } });
  ok("a task running in its own copy shows as working", sc4.waiting.find((w) => w.id === "task:2").why.kind === "working");
}

rmSync(HOME, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
