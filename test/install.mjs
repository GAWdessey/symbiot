// Install smoke test: run the CLI the way users actually get it — through a bin
// SYMLINK — and check `symbiot help` prints. Guards the 0.9.3 bug, where the
// installed CLI ran nothing because the "am I main?" check compared the symlink
// path with the real file. Two layers:
//
//   1. a bare symlink to index.mjs (fast, offline): `node <link> help`, and the
//      link executed directly via its shebang (what npm's bin shim does).
//   2. the real thing: `npm pack`, install the tarball globally into a throwaway
//      prefix (never your real global), run <prefix>/bin/symbiot help. This also
//      catches a file missing from package.json "files". Needs the npm registry
//      (or cache) for dependencies; set SYMBIOT_SKIP_INSTALL_TEST=1 to skip it.
//
//   node test/install.mjs
//
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const TMP = mkdtempSync(join(tmpdir(), "symbiot-install-"));
const WIN = process.platform === "win32";
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
// isolated HOME so nothing reads or writes your real config
const env = { ...process.env, HOME: join(TMP, "home"), USERPROFILE: join(TMP, "home") };
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", env, timeout: 120000, shell: WIN && !cmd.endsWith(".exe"), ...opts });
const printsHelp = (r) => r.status === 0 && /Usage/.test(r.stdout) && /symbiot week/.test(r.stdout);

try {
  console.log("INSTALL — the CLI runs through a bin symlink (the 0.9.3 regression)");
  const link = join(TMP, "symbiot");
  let linked = true;
  try { symlinkSync(join(PKG, "index.mjs"), link); } catch (e) { linked = false; if (!WIN) throw e; console.log("  - skipped bare symlink (Windows needs privileges to symlink)"); }
  if (linked) {
    const viaNode = run(process.execPath, [link, "help"]);
    ok("node <symlink> help prints usage", printsHelp(viaNode), { status: viaNode.status, out: viaNode.stdout, err: viaNode.stderr });
  }
  if (linked && !WIN) {
    const viaShebang = run(link, ["help"]);
    ok("<symlink> help (shebang, like npm's bin) prints usage", printsHelp(viaShebang), { status: viaShebang.status, out: viaShebang.stdout, err: viaShebang.stderr });
  }

  if (process.env.SYMBIOT_SKIP_INSTALL_TEST === "1") {
    console.log("  - skipped npm pack + global install (SYMBIOT_SKIP_INSTALL_TEST=1)");
  } else {
    console.log("INSTALL — npm pack, global install into a temp prefix, run `symbiot help`");
    const npm = WIN ? "npm.cmd" : "npm";
    const packDir = join(TMP, "pack"), prefix = join(TMP, "prefix");
    mkdirSync(packDir, { recursive: true });
    const pack = run(npm, ["pack", "--pack-destination", packDir, "--silent"], { cwd: PKG, env: process.env });
    let tarball = "";
    try { tarball = readdirSync(packDir).find((f) => f.endsWith(".tgz")) || ""; } catch {}
    ok("npm pack produced a tarball", pack.status === 0 && !!tarball, { status: pack.status, err: pack.stderr });
    if (tarball) {
      // A real global install, but into a throwaway prefix. Uses your normal npm
      // cache (HOME is only swapped for running symbiot), so it's fast when warm.
      const inst = run(npm, ["install", "-g", "--prefix", prefix, "--no-audit", "--no-fund", "--prefer-offline", join(packDir, tarball)], { env: process.env });
      ok("npm install -g --prefix <tmp> <tarball> succeeds", inst.status === 0, { status: inst.status, err: inst.stderr });
      const bin = WIN ? join(prefix, "symbiot.cmd") : join(prefix, "bin", "symbiot");
      const help = run(bin, ["help"]);
      ok("installed `symbiot help` prints usage", printsHelp(help), { status: help.status, out: help.stdout, err: help.stderr });
      const unknown = run(bin, ["no-such-command"]);
      ok("installed CLI dispatches commands (not a silent no-op)", /Unknown command/.test(unknown.stdout), { out: unknown.stdout, err: unknown.stderr });
    }
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} install: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
