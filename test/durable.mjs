// Symbiot's saved state survives a crash (audit fixes 5 and 6, 2026-10-14):
//   1. ATOMIC SAVES: a state file is written to a temp file and renamed over the old
//      one, which stays as .bak. A half-written file (a crash mid-save: the app ran out
//      of memory on 2026-10-12) is never read as empty and saved over: it's moved aside
//      and the .bak read instead. Before, a cut-short tasks.json read as [] and the next
//      task saved replaced 600.
//   2. ONE APP: the app holds app-<port>.lock; a second one finds it held, a dead
//      one's lock is taken over, and only the holder lets it go.
//   3. HUNG RUNS: a run whose log is silent too long is stopped, its process group and
//      all; a run that ended while the app was down still gets its exit's bookkeeping
//      (which files it touched, for Approve).
// Isolated HOME, throwaway folders.
//
//   node test/durable.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync, rmSync, statSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-durable-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const { loadTasks, saveTasks, loadConfig, saveConfig, writeJsonAtomic, readState, takeAppLock, releaseAppLock, lockPath, CONFIG_PATH } = await import("../core.mjs");
const { loadMind, MIND_FILE } = await import("../mind.mjs");
const { runsTick, RUN_START, loadRunFiles } = await import("../agents.mjs");
const TASKS = join(CFG, "tasks.json");
const aside = (f) => readdirSync(CFG).filter((n) => n.startsWith(f.split("/").pop() + ".corrupt-"));
const sleeper = () => spawn(process.execPath, ["-e", "setInterval(() => {}, 1e9)"], { detached: true, stdio: "ignore" });
const gone = (pid) => { try { process.kill(pid, 0); return false; } catch (e) { return e.code !== "EPERM"; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const kids = [];

try {
  console.log("ATOMIC SAVES — written whole or not at all, the last one kept");
  const many = Array.from({ length: 600 }, (_, i) => ({ text: "task " + i, done: false }));
  ok("tasks save", saveTasks(many) && loadTasks().length === 600);
  saveTasks([...many, { text: "task 600", done: false }]);
  ok("no temp file is left beside it", !readdirSync(CFG).some((n) => n.endsWith(".tmp")), readdirSync(CFG));
  ok("the copy it replaced is kept as .bak", JSON.parse(readFileSync(TASKS + ".bak", "utf8")).length === 600);
  writeFileSync(join(CFG, "tasks.json.12345-abcd.tmp"), "[{\"text\":\"half"); // a crash before the rename
  ok("a temp file a crash left behind changes nothing", loadTasks().length === 601);

  console.log("A HALF-WRITTEN FILE — never read as empty, never saved over");
  writeFileSync(TASKS, JSON.stringify(many).slice(0, 5000)); // cut short mid-write
  const back = loadTasks();
  ok("it reads the .bak instead of []", back.length === 600, back.length);
  ok("the cut-short file is kept aside (.corrupt-<time>), not lost", aside(TASKS).length === 1, readdirSync(CFG));
  ok("and the good copy is put back in its place", JSON.parse(readFileSync(TASKS, "utf8")).length === 600);
  saveTasks([...back, { text: "new one", done: false }]);
  ok("so the next save adds a task, it doesn't replace 600 with one", loadTasks().length === 601);
  writeFileSync(TASKS, ""); writeFileSync(TASKS + ".bak", "{broken");
  const none = loadTasks();
  ok("with no good copy at all it starts empty, but keeps the broken file aside", none.length === 0 && aside(TASKS).length === 2, readdirSync(CFG));
  ok("a file that's just not there yet is no corruption", readState(join(CFG, "nothing.json")) === undefined && !readdirSync(CFG).some((n) => n.startsWith("nothing.json")));

  console.log("SETTINGS — a broken config.json doesn't wipe them");
  saveConfig({ agentCmd: "claude -p", parked: ["/a"], appToken: "tok" });
  saveConfig({ ...loadConfig(), weekly: { on: true } });
  if (process.platform !== "win32") ok("config.json is still yours only (0600)", (statSync(CONFIG_PATH).mode & 0o777) === 0o600, (statSync(CONFIG_PATH).mode & 0o777).toString(8));
  writeFileSync(CONFIG_PATH, "{\"agentCmd\": \"cla");
  const cfg = loadConfig();
  ok("it reads the save before", cfg.agentCmd === "claude -p" && cfg.parked[0] === "/a" && cfg.appToken === "tok", cfg);
  saveConfig({ ...cfg, appPort: 7391 });
  ok("and a save after it keeps every setting", loadConfig().agentCmd === "claude -p" && loadConfig().appPort === 7391);
  writeJsonAtomic(MIND_FILE, { nodes: [{ name: "Jono", kind: "person", facts: [] }], log: [] }); writeJsonAtomic(MIND_FILE, { nodes: [{ name: "Jono", kind: "person", facts: [] }, { name: "Garth", kind: "person", facts: [] }], log: [] });
  writeFileSync(MIND_FILE, "{\"nodes\":[");
  ok("memory (mind.json) too", loadMind().nodes.length === 1 && loadMind().nodes[0].name === "Jono", loadMind());
  writeJsonAtomic(join(CFG, "x", "deep.json"), { a: 1 }, { mode: 0o600 });
  ok("writeJsonAtomic makes the folder it needs", readState(join(CFG, "x", "deep.json")).a === 1);

  console.log("ONE APP — the lock");
  const P = 41000 + Math.floor(Math.random() * 1000), L = lockPath(P);
  ok("the first app takes it", takeAppLock(P) === null && JSON.parse(readFileSync(L, "utf8")).pid === process.pid);
  const other = spawnSync(process.execPath, ["--input-type=module", "-e", `const { takeAppLock } = await import(${JSON.stringify(new URL("../core.mjs", import.meta.url).href)}); console.log(JSON.stringify(takeAppLock(${P})));`], { env: { ...process.env }, encoding: "utf8" });
  const held = JSON.parse(other.stdout.trim() || "null");
  ok("a second app finds it held, by this one", held && held.pid === process.pid, other.stdout + other.stderr);
  releaseAppLock();
  ok("the holder lets it go", !existsSync(L));
  const dead = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }).stdout.trim();
  writeFileSync(L, JSON.stringify({ pid: Number(dead), port: P, at: Date.now() - 60000 }));
  ok("a lock whose app is gone (a crash) is taken over", takeAppLock(P) === null && JSON.parse(readFileSync(L, "utf8")).pid === process.pid);
  releaseAppLock();
  const live = sleeper(); kids.push(live);
  writeFileSync(L, JSON.stringify({ pid: live.pid, port: P, at: Date.now() }));
  ok("one held by a live app is left alone", (takeAppLock(P) || {}).pid === live.pid && JSON.parse(readFileSync(L, "utf8")).pid === live.pid);
  ok("unless it's handing over (Update & restart)", takeAppLock(P, { takeOver: true }) === null && JSON.parse(readFileSync(L, "utf8")).pid === process.pid);
  writeFileSync(L, JSON.stringify({ pid: live.pid, port: P, at: Date.now() })); // the relaunched app took it back
  releaseAppLock();
  ok("an app lets go only of its own lock, never one another took over", existsSync(L) && JSON.parse(readFileSync(L, "utf8")).pid === live.pid);
  rmSync(L, { force: true });

  console.log("HUNG RUNS — stopped once their log is silent too long");
  const repo = mkdtempSync(join(tmpdir(), "symbiot-durable-repo-")), sym = join(repo, ".symbiot"); mkdirSync(sym);
  writeFileSync(join(CFG, "runs.json"), JSON.stringify([{ path: repo, name: "hung", startedAt: Date.now() - 3 * 3600000 }]));
  const hung = sleeper(); kids.push(hung);
  // a real run's start is when its process started (the pid-reuse check holds it to that), so the clock moves on instead
  const start = Date.now() - 1000, later = (min) => ({ now: Date.now() + min * 60000, hang: 60 * 60000 });
  writeFileSync(join(sym, "agent.pid"), JSON.stringify({ pid: hung.pid, id: "h1", startedAt: start, owner: 1 }));
  writeFileSync(join(sym, "agent.log"), "=== hung ===\n");
  const quietOk = runsTick(later(30));
  ok("quiet for less than the limit: left running, and its lock touched (its heartbeat)", !quietOk.stopped.length && !gone(hung.pid) && statSync(join(sym, "agent.pid")).mtimeMs > Date.now() + 20 * 60000, quietOk);
  const t = runsTick(later(120));
  ok("quiet for longer: stopped", t.stopped.includes(repo), t);
  for (let i = 0; i < 40 && !gone(hung.pid); i++) await wait(100);
  ok("its whole process group got the signal", gone(hung.pid));
  ok("and its log says why", /stopped by Symbiot .*no output for 1\d\d minutes/.test(readFileSync(join(sym, "agent.log"), "utf8")), readFileSync(join(sym, "agent.log"), "utf8"));
  const busy = sleeper(); kids.push(busy);
  writeFileSync(join(sym, "agent.pid"), JSON.stringify({ pid: busy.pid, id: "h2", startedAt: Date.now() - 1000, owner: 1 }));
  const at = later(180); writeFileSync(join(sym, "agent.log"), "=== working ===\nstill going\n"); utimesSync(join(sym, "agent.log"), new Date(at.now - 60000), new Date(at.now - 60000)); // three hours in, written a minute ago
  ok("one that's still writing is never stopped, however long it's run", !runsTick(at).stopped.length && !gone(busy.pid));
  try { process.kill(-busy.pid, "SIGKILL"); } catch {}

  console.log("A RUN THAT ENDED WHILE THE APP WAS DOWN — its exit's bookkeeping still happens");
  spawnSync("git", ["init", "-q", repo]);
  writeFileSync(join(repo, "before.txt"), "was there\n");
  const gonePid = Number(spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }).stdout.trim());
  writeFileSync(join(sym, "agent.pid"), JSON.stringify({ pid: gonePid, id: "r1", startedAt: Date.now() - 600000, owner: gonePid }));
  writeFileSync(join(sym, RUN_START), JSON.stringify({ id: "r1", pid: gonePid, startedAt: Date.now() - 600000, owner: gonePid, dirtyBefore: { "before.txt": "x" }, ticksBefore: 0 }));
  writeFileSync(join(repo, "made-by-run.txt"), "the run's work\n");
  writeFileSync(join(repo, "before.txt"), "changed by the run\n");
  const r = runsTick({ hang: 60 * 60000 });
  ok("it's picked up", r.recovered.includes(repo), r);
  const files = (loadRunFiles(repo).find((x) => x.id === "r1") || {}).files || [];
  ok("the files it touched are noted for Approve", files.includes("made-by-run.txt") && files.includes("before.txt"), loadRunFiles(repo));
  ok("its lock and start record are cleared", !existsSync(join(sym, "agent.pid")) && !existsSync(join(sym, RUN_START)));
  ok("and only once", !runsTick({ hang: 60 * 60000 }).recovered.length);
  rmSync(repo, { recursive: true, force: true });
} finally {
  for (const k of kids) { try { process.kill(-k.pid, "SIGKILL"); } catch {} try { k.kill("SIGKILL"); } catch {} }
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
