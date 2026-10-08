// Every suite in package.json's test script, one after another, each on its own (a
// failing one doesn't stop the rest), then a table of how each did. For seeing the
// whole picture on a platform the suite isn't green on yet (CI's Windows job).
//
//   node test/each.mjs
//
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const suites = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.test.split("&&").map((s) => s.trim()).filter((s) => /^node test\//.test(s)).map((s) => s.slice(5));
const rows = [];
for (const file of suites) {
  const t0 = Date.now(), r = spawnSync(process.execPath, [file], { cwd: root, encoding: "utf8", env: process.env, timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || ""), tally = (out.match(/(\d+) passed, (\d+) failed/g) || []).pop() || "";
  const failed = out.split("\n").filter((l) => /^\s*✗/.test(l)).slice(0, 8);
  rows.push({ file, ok: r.status === 0, tally, secs: ((Date.now() - t0) / 1000).toFixed(0), failed, crash: r.status !== 0 && !failed.length ? out.trim().split("\n").slice(-4).join(" | ") : "" });
  console.log(`${r.status === 0 ? "✓" : "✗"} ${file}  ${tally}  (${rows.at(-1).secs}s)`);
}
console.log("\n" + "─".repeat(60));
for (const r of rows.filter((x) => !x.ok)) {
  console.log(`✗ ${r.file}  ${r.tally}`);
  for (const l of r.failed) console.log("   " + l.trim().slice(0, 220));
  if (r.crash) console.log("   " + r.crash.slice(0, 400));
}
const bad = rows.filter((x) => !x.ok).length;
console.log(`\n${bad ? "✗" : "✓"} ${rows.length - bad} of ${rows.length} suites pass on ${process.platform}`);
process.exit(bad ? 1 : 0);
