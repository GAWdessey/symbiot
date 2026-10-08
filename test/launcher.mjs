// The app launcher (desktop.mjs): Symbiot in the app menu with its icon, written by
// npm install -g (postinstall.mjs) and kept pointing at itself; and taken out again
// (symbiot uninstall), with Away's shortcut. Isolated HOME (set before the modules load).
//
//   node test/launcher.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-launcher-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

try {
  const { launcherFile, launcherIcon, launcherContent, installLauncher, removeLauncher } = await import("../desktop.mjs");
  const { removeShortcut, withShortcut, COSMIC_CUSTOM } = await import("../away.mjs");

  console.log("THE LAUNCHER — in the app menu, with its icon, no terminal");
  const r = installLauncher({ node: "/usr/bin/node", script: "/home/x/.npm-global/lib/node_modules/symbiot/index.mjs", home: HOME, platform: "linux", path: "/usr/bin:/home/x/.npm-global/bin" });
  const entry = readFileSync(launcherFile(HOME), "utf8");
  ok("written to ~/.local/share/applications/symbiot.desktop", r.written && r.file === launcherFile(HOME) && /^\[Desktop Entry\]/.test(entry), r);
  ok("runs `symbiot open` with your PATH (so agents and git resolve), never in a terminal", /^Exec=env "PATH=\/usr\/bin:\/home\/x\/\.npm-global\/bin" "\/usr\/bin\/node" "\/home\/x\/\.npm-global\/lib\/node_modules\/symbiot\/index\.mjs" open$/m.test(entry) && /^Terminal=false$/m.test(entry), entry);
  ok("named Symbiot, with its icon, and the app's window grouped under it", /^Name=Symbiot$/m.test(entry) && /^Icon=symbiot$/m.test(entry) && /^StartupWMClass=chrome-127\.0\.0\.1__-Default$/m.test(entry), entry);
  ok("the icon is in your icon theme, the orb", existsSync(launcherIcon(HOME)) && /<svg[\s\S]*Symbiot/.test(readFileSync(launcherIcon(HOME), "utf8")), launcherIcon(HOME));
  const again = installLauncher({ node: "/usr/bin/node", script: "/home/x/.npm-global/lib/node_modules/symbiot/index.mjs", home: HOME, platform: "linux", path: "/usr/bin:/home/x/.npm-global/bin" });
  ok("the same again: left alone", again.written === false, again);
  installLauncher({ node: "/opt/node22/bin/node", script: "/home/x/.npm-global/lib/node_modules/symbiot/index.mjs", home: HOME, platform: "linux", path: "/usr/bin" });
  ok("a new Node: rewritten to point at it", /"\/opt\/node22\/bin\/node"/.test(readFileSync(launcherFile(HOME), "utf8")), "");
  ok("a path with quotes or $ in it stays one argument", /Exec=env "PATH=a" "\/n" "\/tmp\/my \\"sym\\" \\\$x\/index\.mjs" open/.test(launcherContent("/n", '/tmp/my "sym" $x/index.mjs', "a")), launcherContent("/n", '/tmp/my "sym" $x/index.mjs', "a"));
  const { launcherPath } = await import("../desktop.mjs");
  ok("the PATH saved: npm's throwaway install folders dropped, each folder once, Node's own added", launcherPath("/a/node_modules/.bin:/usr/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin:/home/x/.npm-global/bin:/usr/bin:/home/x/.npm-global/bin", "/opt/n/bin/node") === "/home/x/.npm-global/bin:/usr/bin:/opt/n/bin", launcherPath("/a/node_modules/.bin:/x/node-gyp-bin:/home/x/.npm-global/bin:/usr/bin:/home/x/.npm-global/bin", "/opt/n/bin/node"));
  ok("not on Linux: nothing written here (other systems differ)", installLauncher({ script: "/x/index.mjs", home: join(HOME, "mac"), platform: "darwin" }).skipped && !existsSync(launcherFile(join(HOME, "mac"))), "");

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

  console.log("UNINSTALLING — the entry, the icon, and Away's shortcut only");
  ok("entry and icon gone", removeLauncher(HOME).length === 2 && !existsSync(launcherFile(HOME)) && !existsSync(launcherIcon(HOME)), "");
  const f = COSMIC_CUSTOM(HOME); mkdirSync(join(f, ".."), { recursive: true });
  writeFileSync(f, withShortcut('{\n    (modifiers: [Super], key: "t"): Spawn("cosmic-term"),\n}\n', "/usr/bin/node /x/symbiot away"));
  ok("your other shortcuts stay; only Symbiot's goes", removeShortcut(HOME) && /cosmic-term/.test(readFileSync(f, "utf8")) && !/symbiot/.test(readFileSync(f, "utf8")), readFileSync(f, "utf8"));
  writeFileSync(f, withShortcut("", "/usr/bin/node /x/symbiot away"));
  ok("…and with only Symbiot's in it, the file goes", removeShortcut(HOME) && !existsSync(f), "");
  ok("nothing of ours there: nothing changes", removeShortcut(HOME) === false, "");
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} launcher: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
