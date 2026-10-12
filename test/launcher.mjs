// The app launcher (desktop.mjs): Symbiot in the app menu with its icon, written by
// npm install -g (postinstall.mjs) and kept pointing at itself; and taken out again
// (symbiot uninstall), with Away's shortcut. Isolated HOME (set before the modules load).
//
//   node test/launcher.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, cpSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-launcher-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

try {
  const { launcherFile, windowFile, launcherIcon, launcherContent, installLauncher, removeLauncher } = await import("../desktop.mjs");
  const { removeShortcut, withShortcut, COSMIC_CUSTOM } = await import("../away.mjs");

  console.log("THE LAUNCHER — in the app menu, with its icon, no terminal");
  const r = installLauncher({ node: "/usr/bin/node", script: "/home/x/.npm-global/lib/node_modules/symbiot/index.mjs", home: HOME, platform: "linux", path: "/usr/bin:/home/x/.npm-global/bin" });
  const entry = readFileSync(launcherFile(HOME), "utf8");
  ok("written to ~/.local/share/applications/symbiot.desktop", r.written && r.file === launcherFile(HOME) && /^\[Desktop Entry\]/.test(entry), r);
  ok("runs `symbiot open` with your PATH (so agents and git resolve), never in a terminal", /^Exec=env "PATH=\/usr\/bin:\/home\/x\/\.npm-global\/bin" "\/usr\/bin\/node" "\/home\/x\/\.npm-global\/lib\/node_modules\/symbiot\/index\.mjs" open$/m.test(entry) && /^Terminal=false$/m.test(entry), entry);
  ok("named Symbiot, with its icon, and the app's window grouped under it", /^Name=Symbiot$/m.test(entry) && /^Icon=symbiot$/m.test(entry) && /^StartupWMClass=chrome-127\.0\.0\.1__-Default$/m.test(entry), entry);
  ok("the icon is in your icon theme, the orb", existsSync(launcherIcon(HOME)) && /<svg[\s\S]*Symbiot/.test(readFileSync(launcherIcon(HOME), "utf8")), launcherIcon(HOME));
  const win = existsSync(windowFile(HOME)) ? readFileSync(windowFile(HOME), "utf8") : "";
  ok("the window's own entry too, by its app id: a pinned window starts Symbiot when it's closed", windowFile(HOME).endsWith("/applications/chrome-127.0.0.1__-Default.desktop") && /^Exec=.* open$/m.test(win) && /^Icon=symbiot$/m.test(win), win);
  ok("…hidden from the app menu, so Symbiot is there once", /^NoDisplay=true$/m.test(win) && !/NoDisplay/.test(entry), win);
  const again = installLauncher({ node: "/usr/bin/node", script: "/home/x/.npm-global/lib/node_modules/symbiot/index.mjs", home: HOME, platform: "linux", path: "/usr/bin:/home/x/.npm-global/bin" });
  ok("the same again: left alone", again.written === false, again);
  installLauncher({ node: "/opt/node22/bin/node", script: "/home/x/.npm-global/lib/node_modules/symbiot/index.mjs", home: HOME, platform: "linux", path: "/usr/bin" });
  ok("a new Node: rewritten to point at it", /"\/opt\/node22\/bin\/node"/.test(readFileSync(launcherFile(HOME), "utf8")), "");
  ok("a path with quotes or $ in it stays one argument", /Exec=env "PATH=a" "\/n" "\/tmp\/my \\"sym\\" \\\$x\/index\.mjs" open/.test(launcherContent("/n", '/tmp/my "sym" $x/index.mjs', "a")), launcherContent("/n", '/tmp/my "sym" $x/index.mjs', "a"));
  const { launcherPath } = await import("../desktop.mjs");
  ok("the PATH saved: npm's throwaway install folders dropped, each folder once, Node's own added", launcherPath("/a/node_modules/.bin:/usr/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin:/home/x/.npm-global/bin:/usr/bin:/home/x/.npm-global/bin", "/opt/n/bin/node") === "/home/x/.npm-global/bin:/usr/bin:/opt/n/bin", launcherPath("/a/node_modules/.bin:/x/node-gyp-bin:/home/x/.npm-global/bin:/usr/bin:/home/x/.npm-global/bin", "/opt/n/bin/node"));
  ok("not on Linux: nothing written here (other systems differ)", installLauncher({ script: "/x/index.mjs", home: join(HOME, "mac"), platform: "darwin" }).skipped && !existsSync(launcherFile(join(HOME, "mac"))), "");

  console.log("WINDOWS — the Start menu and the desktop, opened with no console window");
  const wh = join(HOME, "winhome"), calls = [];
  const run = (c, a) => { calls.push([c, a[a.length - 1]]); return { status: 0, stdout: "" }; };
  const w1 = installLauncher({ node: "C:\\Program Files\\nodejs\\node.exe", script: "C:\\npm\\node_modules\\symbiot\\index.mjs", home: wh, platform: "win32", run });
  const own = join(wh, "AppData", "Roaming", "Symbiot");
  ok("a Start-menu shortcut and one on the desktop, made by PowerShell", w1.written && calls.filter(([c, a]) => c === "powershell" && /CreateShortcut/.test(a)).length === 2 && /Start Menu.Programs.Symbiot\.lnk$/.test(w1.file), [w1, calls.map((x) => x[1].slice(0, 80))]);
  ok("…each runs wscript on open.vbs, with the orb icon", calls.every(([, a]) => !/CreateShortcut/.test(a) || (/wscript\.exe/.test(a) && /open\.vbs/.test(a) && /symbiot\.ico,0/.test(a))), "");
  ok("…open.vbs starts `symbiot open` hidden (window style 0)", /\.Run """C:\\Program Files\\nodejs\\node\.exe"" ""C:\\npm\\node_modules\\symbiot\\index\.mjs"" open", 0, False/.test(readFileSync(join(own, "open.vbs"), "utf8")) && existsSync(join(own, "symbiot.ico")), readFileSync(join(own, "open.vbs"), "utf8"));
  calls.length = 0; writeFileSync(join(wh, "menu-made"), ""); // shortcuts exist from here (the stand-in made none), so mark them
  mkdirSync(join(own, "..", "Microsoft", "Windows", "Start Menu", "Programs"), { recursive: true }); writeFileSync(w1.file, "lnk"); mkdirSync(join(wh, "Desktop"), { recursive: true }); writeFileSync(w1.desktop, "lnk");
  const w2 = installLauncher({ node: "C:\\Program Files\\nodejs\\node.exe", script: "C:\\npm\\node_modules\\symbiot\\index.mjs", home: wh, platform: "win32", run });
  ok("…the same again: left alone (no PowerShell)", w2.written === false && calls.length === 0, [w2, calls]);
  const gone = removeLauncher(wh);
  ok("…uninstalling removes both shortcuts, the script and the icon", !existsSync(w1.file) && !existsSync(w1.desktop) && !existsSync(join(own, "open.vbs")) && gone.length >= 4, gone);

  console.log("INSTALLING — npm install -g writes it; a dev install doesn't");
  const post = fileURLToPath(new URL("../postinstall.mjs", import.meta.url)), h2 = join(HOME, "h2"), h3 = join(HOME, "h3");
  // windows off (a test must never open one): the hook writes the entry and says where it is
  const env = (h, g) => ({ ...process.env, HOME: h, npm_config_global: g, SYMBIOT_NO_LAUNCHER: "", SYMBIOT_NO_OPEN: "1" });
  const g = spawnSync(process.execPath, [post], { env: env(h2, "true"), encoding: "utf8" });
  ok("global: the entry is written, and it says where to find Symbiot", g.status === 0 && existsSync(launcherFile(h2)) && /in your app menu/.test(g.stdout), [g.status, g.stdout, g.stderr]);
  const d = spawnSync(process.execPath, [post], { env: env(h3, ""), encoding: "utf8" });
  ok("not global (working on Symbiot itself): nothing written, nothing fails", d.status === 0 && !existsSync(launcherFile(h3)), [d.status, d.stderr]);
  const h4 = join(HOME, "h4"), nd = spawnSync(process.execPath, [post], { env: { ...env(h4, "true"), DISPLAY: "", WAYLAND_DISPLAY: "", SYMBIOT_NO_OPEN: "" }, encoding: "utf8" });
  ok("no desktop (a server, CI): the entry, and nothing opened", nd.status === 0 && existsSync(launcherFile(h4)) && /in your app menu/.test(nd.stdout) && !/opening now/.test(nd.stdout), nd.stdout);

  console.log("RESTARTS ONTO WHAT'S INSTALLED — npm install -g from a terminal takes without a restart by hand");
  {
    // the app as installed (…/node_modules/symbiot), started; then a newer version lands under it
    const repo = fileURLToPath(new URL("..", import.meta.url)), tree = join(HOME, "g", "lib", "node_modules", "symbiot");
    const files = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).files;
    mkdirSync(tree, { recursive: true });
    for (const f of [...files, "package.json"]) cpSync(join(repo, f), join(tree, f), { recursive: true });
    symlinkSync(join(repo, "node_modules"), join(tree, "node_modules"));
    const port = 20000 + Math.floor(Math.random() * 20000), was = JSON.parse(readFileSync(join(tree, "package.json"), "utf8")).version;
    const env = { ...process.env, HOME, USERPROFILE: HOME, SYMBIOT_NO_OPEN: "1", SYMBIOT_NO_SIGNIN: "1", SYMBIOT_NO_LAUNCHER: "1", SYMBIOT_PORT: String(port), SYMBIOT_REGISTRY: "http://127.0.0.1:9", SYMBIOT_INSTALLED_EVERY: "300" };
    const child = spawn(process.execPath, [join(tree, "index.mjs"), "app"], { env, stdio: "ignore" });
    let tk = ""; const token = () => { if (!tk) { try { tk = JSON.parse(readFileSync(join(HOME, ".config", "symbiot", "secrets.json"), "utf8")).appToken || ""; } catch {} } return tk; };
    const ping = async () => { try { const r = await fetch(`http://127.0.0.1:${port}/api/ping`, { headers: { "x-symbiot-token": token() } }); return r.status === 403 ? { forbidden: true } : await r.json(); } catch { return null; } };
    const until = async (f, ms = 30000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await f(); if (v) return v; await new Promise((r) => setTimeout(r, 150)); } return null; };
    const first = await until(async () => { const p = await ping(); return p && p.version ? p : null; });
    ok("installed and started, on its version", first && first.version === was, first);
    const pkg = JSON.parse(readFileSync(join(tree, "package.json"), "utf8")); pkg.version = "99.0.0"; writeFileSync(join(tree, "package.json"), JSON.stringify(pkg, null, 2));
    const after = await until(async () => { const p = await ping(); return p && p.version === "99.0.0" ? p : null; });
    ok("a newer one installed under it: it restarts onto it by itself", after && after.started !== first.started && after.relaunched === true, after);
    ok("…and an app that wasn't relaunched by an update doesn't say so", first && !first.relaunched, first);
    // the restarted app runs on its own (detached): stop it, and see it gone
    try { await fetch(`http://127.0.0.1:${port}/api/quit`, { headers: { "x-symbiot-token": token() } }); } catch {}
    try { child.kill(); } catch {}
    await new Promise((r) => setTimeout(r, 1500)); // a second start, if any, has had its time
    const left = () => spawnSync("pgrep", ["-af", tree + "/index.mjs app"], { encoding: "utf8" }).stdout.split("\n").filter((l) => l && !/pgrep/.test(l));
    const extra = left(); for (const l of extra) { try { process.kill(Number(l.split(" ")[0])); } catch {} }
    ok("…once: no second app started while the first was exiting", !!(await until(async () => !(await ping()), 10000)) && extra.length === 0, extra);
  }

  console.log("UNINSTALLING — the entry, the icon, and Away's shortcut only");
  ok("entries and icon gone", removeLauncher(HOME).length === 3 && !existsSync(launcherFile(HOME)) && !existsSync(windowFile(HOME)) && !existsSync(launcherIcon(HOME)), "");
  const f = COSMIC_CUSTOM(HOME); mkdirSync(join(f, ".."), { recursive: true });
  writeFileSync(f, withShortcut('{\n    (modifiers: [Super], key: "t"): Spawn("cosmic-term"),\n}\n', "/usr/bin/node /x/symbiot away"));
  ok("your other shortcuts stay; only Symbiot's goes", removeShortcut(HOME) && /cosmic-term/.test(readFileSync(f, "utf8")) && !/symbiot/.test(readFileSync(f, "utf8")), readFileSync(f, "utf8"));
  writeFileSync(f, withShortcut("", "/usr/bin/node /x/symbiot away"));
  ok("…and with only Symbiot's in it, the file goes", removeShortcut(HOME) && !existsSync(f), "");
  ok("nothing of ours there: nothing changes", removeShortcut(HOME) === false, "");
  // an install test's throwaway prefix must never become the app-menu entry (it vanished and the menu did nothing)
  const tmpScript = join(tmpdir(), "symbiot-install-x", "prefix", "lib", "node_modules", "symbiot", "index.mjs");
  ok("a script inside the temp folder is never written as the launcher", installLauncher({ script: tmpScript, platform: "linux" }).skipped === true && !existsSync(launcherFile(HOME)), "");
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} launcher: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
