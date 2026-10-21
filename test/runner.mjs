// The test runner (test/run.mjs): every file runs, side by side, and the table at the end
// names each one that failed, crashed or hung. The chain it replaced stopped at the first
// failing file and said nothing about the 37 after it (CI, 19-20 Oct 2026).
//
//   node test/runner.mjs
//
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };
const DIR = mkdtempSync(join(tmpdir(), "symbiot-runner-")), RUN = fileURLToPath(new URL("./run.mjs", import.meta.url));
const put = (name, body) => writeFileSync(join(DIR, name), body);
const run = (...args) => { const r = spawnSync(process.execPath, [RUN, ...args], { encoding: "utf8", env: { ...process.env, SYMBIOT_TEST_DIR: DIR, SYMBIOT_TEST_JOBS: "" }, timeout: 60000 }); return { code: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
try {
  put("a-pass.mjs", 'console.log("  ✓ fine\\n\\n✓ a: 1 passed, 0 failed");\n');
  put("b-fail.mjs", 'console.log("  ✓ fine\\n  ✗ the thing that broke  got: 2\\n\\n✗ b: 1 passed, 1 failed"); process.exit(1);\n');
  put("c-crash.mjs", 'throw new Error("boom at load");\n');
  put("d-hang.mjs", "setInterval(() => {}, 1000);\n");
  put("e-pass.mjs", 'console.log("✓ e: 3 passed, 0 failed");\n');
  console.log("RUNNER — a failing file never stops the rest");
  const r = run("--timeout", "3", "-j", "3");
  ok("it fails the run", r.code === 1, r);
  ok("every file ran, the ones after the failures too", /✓ a-pass\.mjs/.test(r.out) && /✓ e-pass\.mjs/.test(r.out), r.out);
  ok("the table names every one that failed, crashed or hung", /Failed: b-fail\.mjs, c-crash\.mjs, d-hang\.mjs/.test(r.out), r.out);
  ok("…with its first failures, a crash's last lines, a hang's time limit", /✗ b-fail\.mjs {2}1 passed, 1 failed\n {3}✗ the thing that broke/.test(r.out) && /\| .*boom at load/.test(r.out) && /d-hang\.mjs {2}timed out after 3s/.test(r.out), r.out);
  ok("and how many passed, naming the failed ones on the last line", /✗ b-fail\.mjs, c-crash\.mjs, d-hang\.mjs failed: 2 of 5 test files pass/.test(r.out), r.out);
  ok("a failed file got its second try, and failed it again", /✗ b-fail\.mjs {8,}on its own/.test(r.out), r.out);
  console.log("RUNNER — a file that fails once and passes on its own is flaky, not failed");
  put("f-flaky.mjs", `import { existsSync, writeFileSync } from "node:fs"; const m = ${JSON.stringify(join(DIR, "f-ran"))}; if (!existsSync(m)) { writeFileSync(m, "1"); console.log("  ✗ lost a race"); process.exit(1); } console.log("✓ f: 1 passed, 0 failed");\n`);
  const f = run("f-flaky");
  ok("it passes, and says it was flaky", f.code === 0 && /Flaky: f-flaky\.mjs/.test(f.out) && /✓ 1 of 1 test files pass/.test(f.out), f.out);
  rmSync(join(DIR, "f-ran"), { force: true });
  const n = spawnSync(process.execPath, [RUN, "f-flaky"], { encoding: "utf8", env: { ...process.env, SYMBIOT_TEST_DIR: DIR, SYMBIOT_TEST_JOBS: "", SYMBIOT_TEST_RETRY: "0" }, timeout: 60000 });
  ok("SYMBIOT_TEST_RETRY=0 gives no second try", n.status === 1, n.stdout);
  rmSync(join(DIR, "f-flaky.mjs"), { force: true });
  console.log("RUNNER — only the files named");
  const o = run("a-pass", "e-pass");
  ok("a name or part of one picks them, and all passing passes", o.code === 0 && /2 test files/.test(o.out) && /✓ 2 of 2 test files pass/.test(o.out) && !/b-fail/.test(o.out), o.out);
  ok("a name that matches nothing says so", run("nothing-like-it").code === 1, "");
} finally { rmSync(DIR, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} runner: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
