// The test suite: every test/*.mjs, each in a process of its own, several at once, each
// with a time limit, then a table naming every file that failed and its first failures.
// It replaced a chain of 75 `node test/x.mjs &&`: one flaky file (durable.mjs, three CI
// runs and a publish on 19-20 Oct 2026) stopped the chain there and said nothing about
// the 37 suites after it. A failing file never stops the rest here.
//
//   node test/run.mjs                 all of them (npm test)
//   node test/run.mjs urgent route    only these (a name, or part of one)
//   node test/run.mjs -j 1            one at a time (CI's Windows table)
//   node test/run.mjs --timeout 300   seconds each file may take (default 600)
//
// Workers: SYMBIOT_TEST_JOBS, else -j, else half the CPUs (at most 8: 245 s at 8 workers
// against 665 s one by one, recon of 15 Oct). The slowest files start first, from the
// last run's times (.test-times.json, beside this file, ignored by git), so the run
// isn't left waiting on one that started last.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { availableParallelism, cpus } from "node:os";

const root = fileURLToPath(new URL("..", import.meta.url)), here = process.env.SYMBIOT_TEST_DIR || join(root, "test"); // another folder: test/runner.mjs
const NOT_SUITES = new Set(["run.mjs"]); // this runner
const TIMES = join(here, ".test-times.json");

function args(argv) {
  const o = { jobs: 0, timeout: 600, only: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-j" || a === "--jobs") o.jobs = Number(argv[++i]) || 0;
    else if (/^-j\d+$/.test(a)) o.jobs = Number(a.slice(2));
    else if (a === "--timeout") o.timeout = Number(argv[++i]) || o.timeout;
    else if (a === "--only") o.only.push(...String(argv[++i] || "").split(",").filter(Boolean));
    else o.only.push(a);
  }
  return o;
}
const opts = args(process.argv.slice(2));
const timesOn = !process.env.SYMBIOT_TEST_DIR;
const all = readdirSync(here).filter((f) => f.endsWith(".mjs") && !NOT_SUITES.has(f)).sort();
const wanted = opts.only.map((w) => w.replace(/^test\//, "").replace(/\.mjs$/, ""));
const files = wanted.length ? all.filter((f) => wanted.some((w) => f.replace(/\.mjs$/, "") === w || f.includes(w))) : all;
if (!files.length) { console.log(`No test file matches ${wanted.join(", ")}.`); process.exit(1); }

let times = {}; if (timesOn) try { times = JSON.parse(readFileSync(TIMES, "utf8")) || {}; } catch {}
const queue = files.slice().sort((a, b) => (times[b] || 0) - (times[a] || 0) || a.localeCompare(b));
const cpu = (typeof availableParallelism === "function" ? availableParallelism() : cpus().length) || 2;
const jobs = Math.max(1, Math.min(files.length, Number(process.env.SYMBIOT_TEST_JOBS) || opts.jobs || Math.min(8, Math.max(2, Math.floor(cpu / 2)))));

// what a file that ended without a ✗ line said last: the error itself first (a stack's last lines are node's own)
function crashOf(out) {
  const lines = out.trim().split("\n"), err = lines.find((l) => /^\w*Error\b|^Error:|^\s*\w+Error: /.test(l));
  const tail = lines.slice(-6).filter((l) => l !== err && !/^\s+at |^Node\.js v/.test(l));
  return [err, ...tail].filter(Boolean).slice(-6).join("\n");
}
function runOne(file) {
  return new Promise((done) => {
    const t0 = Date.now(), chunks = [];
    const p = spawn(process.execPath, [join(here, file)], { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    p.stdout.on("data", (d) => chunks.push(d)); p.stderr.on("data", (d) => chunks.push(d));
    let timedOut = false;
    const kill = () => { try { process.platform !== "win32" ? process.kill(-p.pid, "SIGKILL") : p.kill("SIGKILL"); } catch { try { p.kill("SIGKILL"); } catch {} } };
    const timer = setTimeout(() => { timedOut = true; kill(); }, opts.timeout * 1000);
    p.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks).toString("utf8"), secs = (Date.now() - t0) / 1000;
      const tally = (out.match(/(\d+) passed, (\d+) failed/g) || []).pop() || "";
      const failed = out.split("\n").filter((l) => /^\s*✗/.test(l) && !/^\s*✗ [\w.-]+: \d+ passed/.test(l));
      const ok = code === 0 && !timedOut;
      done({ file, ok, code, timedOut, tally, secs, failed, tail: ok ? "" : crashOf(out) });
    });
  });
}

const t0 = Date.now(), results = [];
console.log(`${files.length} test file${files.length > 1 ? "s" : ""}, ${jobs} at a time, ${opts.timeout}s each at most\n`);
async function worker() {
  while (queue.length) {
    const r = await runOne(queue.shift());
    results.push(r);
    console.log(`${r.ok ? "✓" : "✗"} ${r.file.padEnd(20)} ${r.timedOut ? `timed out after ${opts.timeout}s` : r.tally || (r.ok ? "" : `exit ${r.code}`)}  (${r.secs.toFixed(0)}s)`);
  }
}
await Promise.all(Array.from({ length: jobs }, worker));

// the next run starts the slow ones first; a partial run (only some files) keeps the others' times
if (timesOn) try { writeFileSync(TIMES, JSON.stringify({ ...times, ...Object.fromEntries(results.map((r) => [r.file, Math.round(r.secs)])) }, null, 1) + "\n"); } catch {}

const bad = results.filter((r) => !r.ok).sort((a, b) => a.file.localeCompare(b.file));
const wall = ((Date.now() - t0) / 1000).toFixed(0);
if (bad.length) {
  console.log("\n" + "─".repeat(60) + `\nFailed: ${bad.map((r) => r.file).join(", ")}\n`);
  for (const r of bad) {
    console.log(`✗ ${r.file}  ${r.timedOut ? `timed out after ${opts.timeout}s` : r.tally || `exit ${r.code}`}`);
    for (const l of r.failed.slice(0, 8)) console.log("   " + l.trim().slice(0, 240));
    if (r.failed.length > 8) console.log(`   … and ${r.failed.length - 8} more`);
    if (!r.failed.length && r.tail) for (const l of r.tail.split("\n")) console.log("   | " + l.slice(0, 240));
  }
}
console.log(`\n${bad.length ? "✗" : "✓"} ${results.length - bad.length} of ${results.length} test files pass on ${process.platform} (${wall}s)`);
process.exit(bad.length ? 1 : 0);
