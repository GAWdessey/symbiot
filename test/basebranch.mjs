// The branch a PR goes into when the clone has no origin/HEAD: one that shares history with the work, never a
// stale `main` with none (daaymn, 25 Oct 2026: "no history in common with main" on every PR).
//
//   node test/basebranch.mjs
//
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-base-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 300) : "")); } };
const g = (cwd, ...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd, encoding: "utf8" }).trim();
const { gitDefaultBranch } = await import("../drift.mjs");
try {
  const up = join(HOME, "up"), w = join(HOME, "w"); // the server, and the clone
  g(HOME, "init", "-q", "-b", "master", up); writeFileSync(join(up, "a"), "1"); g(up, "add", "."); g(up, "commit", "-qm", "one");
  g(up, "checkout", "-q", "--orphan", "main"); g(up, "commit", "-q", "--allow-empty", "-m", "stale, unrelated history"); g(up, "checkout", "-q", "master");
  g(HOME, "clone", "-q", up, w); g(w, "checkout", "-q", "-b", "work"); writeFileSync(join(w, "b"), "2"); g(w, "add", "."); g(w, "commit", "-qm", "work");
  try { g(w, "remote", "set-head", "origin", "-d"); } catch {}
  ok("setup: both branches are on origin and origin/HEAD is not set", g(w, "branch", "-r").includes("origin/main") && g(w, "branch", "-r").includes("origin/master") && !g(w, "branch", "-r").includes("origin/HEAD"));
  ok("the branch with history in common is the base, not the first one found", gitDefaultBranch(w) === "master", gitDefaultBranch(w));
  g(w, "remote", "set-head", "origin", "main");
  ok("origin/HEAD still wins when it is set", gitDefaultBranch(w) === "main", gitDefaultBranch(w));
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} basebranch: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
