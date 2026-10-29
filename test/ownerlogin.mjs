// A repo's pushes and PRs go out under its remote's owner, not whichever gh login is active (a
// private GAWdessey repo said "not found" to GarthGhostai, 29 Oct 2026: "didn't upload to GitHub").
//
//   node test/ownerlogin.mjs
//
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-owner-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 300) : "")); } };
const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
try {
  const bin = join(HOME, "bin"); mkdirSync(bin);
  // a gh that holds one login, "owner1": `gh auth token -u <name>` fails for any other
  writeFileSync(join(bin, "gh"), '#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = "-u" ] && u="$2"; shift; done\n[ "$u" = "owner1" ] && echo tok-owner1 && exit 0\nexit 1\n'); chmodSync(join(bin, "gh"), 0o755);
  process.env.PATH = bin + ":" + process.env.PATH; delete process.env.GH_TOKEN;
  const { ownerEnv } = await import("../tasks.mjs");
  const repo = (name, url) => { const d = join(HOME, name); mkdirSync(d); g(d, "init", "-q"); g(d, "remote", "add", "origin", url); return d; };
  ok("a remote owned by a login gh holds gets that login's token", ownerEnv(repo("a", "https://github.com/owner1/x.git")).GH_TOKEN === "tok-owner1");
  ok("an ssh remote too", ownerEnv(repo("b", "git@github.com:owner1/y.git")).GH_TOKEN === "tok-owner1");
  ok("an owner gh has no login for leaves the active login alone", !("GH_TOKEN" in ownerEnv(repo("c", "https://github.com/stranger/x.git"))));
  ok("a remote that isn't GitHub is left alone", !("GH_TOKEN" in ownerEnv(repo("d", "https://example.com/owner1/x.git"))));
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} ownerlogin: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
