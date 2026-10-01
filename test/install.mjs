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
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, readdirSync, readFileSync, existsSync } from "node:fs";
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
// Boot `<bin> app` on a random port, fetch the page it serves, then quit it.
// The installed copy has to find and load ui.mjs to serve anything at all.
async function servesUi(bin) {
  const appEnv = { ...env, SYMBIOT_NO_OPEN: "1", SYMBIOT_PORT: String(20000 + Math.floor(Math.random() * 20000)) };
  const child = spawn(bin, ["app"], { env: appEnv, stdio: ["ignore", "pipe", "pipe"], shell: WIN });
  let out = "";
  try {
    const url = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(""), 15000);
      const onData = (d) => { out += d; const m = out.match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[a-f0-9]+/); if (m) { clearTimeout(t); resolve(m[0]); } };
      child.stdout.on("data", onData); child.stderr.on("data", (d) => { out += d; });
      child.on("exit", () => { clearTimeout(t); resolve(""); });
    });
    if (!url) { console.log("    app output: " + out.trim().slice(0, 600)); return false; }
    const page = await (await fetch(url.replace(/\?t=.*/, ""))).text();
    try { await fetch(url.replace(/\/\?t=/, "/api/quit?t=")); } catch {}
    return /<script>[\s\S]+<\/script>/.test(page) && /data-tab="map"/.test(page);
  } catch (e) { console.log("    " + e.message); return false; }
  finally { try { child.kill("SIGKILL"); } catch {} }
}

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
      const pkgDir = WIN ? join(prefix, "node_modules", "symbiot") : join(prefix, "lib", "node_modules", "symbiot");
      const files = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")).files || [];
      const absent = files.filter((f) => !existsSync(join(pkgDir, f)));
      ok(`installed package has every file in "files" (${files.join(", ")})`, absent.length === 0, absent);
      ok("installed `symbiot app` boots and serves the UI page", await servesUi(bin), "no page with a <script> block (see output above)");
    }
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} install: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
