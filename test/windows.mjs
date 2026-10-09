// What has to work on a Windows PC (and does everywhere): Symbiot starts, its page
// loads, a new install opens into setup; your Claude subscription is found through
// the command npm installs (claude.cmd on Windows) and long instructions get through
// (Windows' command line holds ~8,000 characters); the app-menu entry is Linux's
// only; uninstalling removes Symbiot's data. CI runs it on windows-latest.
// Isolated HOME (set before the modules load).
//
//   node test/windows.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const WIN = process.platform === "win32";
const HOME = mkdtempSync(join(tmpdir(), "symbiot-win-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_NO_OPEN = "1"; process.env.SYMBIOT_NO_LAUNCHER = "1";
delete process.env.SYMBIOT_CLAUDE_CMD;
const CFG = join(HOME, ".config", "symbiot");
const ROOT = fileURLToPath(new URL("..", import.meta.url)), CLI = join(ROOT, "index.mjs");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a stand-in `claude` on PATH, installed the way npm installs it here: claude.cmd on
// Windows (a script it runs with node), a script with a shebang elsewhere. It says
// it's signed in, answers -p, and writes down what it got.
const BIN = join(HOME, "bin"), seen = join(HOME, "claude-seen.json"), js = join(BIN, "claude-stand-in.js");
mkdirSync(BIN, { recursive: true });
writeFileSync(js, `const fs = require("fs"), a = process.argv.slice(2);
if (a[0] === "auth") { console.log(JSON.stringify({ loggedIn: true, authMethod: "claude.ai" })); process.exit(0); }
let stdin = ""; process.stdin.on("data", (d) => stdin += d).on("end", () => {
  const f = a.indexOf("--system-prompt-file"), sys = f >= 0 ? fs.readFileSync(a[f + 1], "utf8") : null;
  fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ args: a, stdin, sysLen: sys ? sys.length : 0, sysEnd: sys ? sys.slice(-12) : "" }));
  console.log(JSON.stringify({ type: "result", is_error: false, result: "hi from claude" }));
});
`);
if (WIN) writeFileSync(join(BIN, "claude.cmd"), `@echo off\r\n"${process.execPath}" "${js}" %*\r\n`);
else { writeFileSync(join(BIN, "claude"), `#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`); chmodSync(join(BIN, "claude"), 0o755); }
process.env.PATH = BIN + delimiter + process.env.PATH;

let app = null;
try {
  console.log("IT LOADS — every module, and the CLI");
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const mods = pkg.files.filter((f) => f.endsWith(".mjs") && !["postinstall.mjs", "scanworker.mjs", "index.mjs"].includes(f));
  const failed = [];
  for (const m of mods) { try { await import("../" + m); } catch (e) { failed.push(m + ": " + e.message); } }
  ok(`all ${mods.length} modules load`, !failed.length, failed);
  const v = spawnSync(process.execPath, [CLI, "--version"], { encoding: "utf8", env: process.env });
  ok("symbiot --version", v.status === 0 && v.stdout.includes(pkg.version), [v.status, v.stdout, v.stderr]);

  console.log("YOUR CLAUDE SUBSCRIPTION — through the command npm installs" + (WIN ? " (claude.cmd)" : ""));
  const { claudeState, resolveProvider, write, claudeCommand } = await import("../ai.mjs");
  const cc = claudeCommand();
  ok(WIN ? "found as claude.cmd, run through cmd.exe" : "found on PATH, run directly", WIN ? /claude\.cmd$/i.test(cc.file) && cc.shell : cc.file === "claude" && !cc.shell, cc);
  const st = claudeState(true);
  ok("installed and signed in", st.installed && st.signedIn, st);
  ok("so it's the AI, with no key", (resolveProvider() || {}).provider === "claude", resolveProvider());
  const longSys = "Symbiot's rules. ".repeat(1500) + "END-OF-RULES";
  const a = await write(longSys, 'Say "hi" (with quotes & an ampersand)');
  const got = existsSync(seen) ? JSON.parse(readFileSync(seen, "utf8")) : {};
  ok("it answers", a === "hi from claude", a);
  ok(`instructions of ${longSys.length} characters arrive whole (too long for a Windows command line)`, got.sysLen === longSys.length && got.sysEnd === "END-OF-RULES", got.sysLen);
  ok("…and the prompt, quotes and & included, arrives as typed", got.stdin === 'Say "hi" (with quotes & an ampersand)', got.stdin);
  ok("…with no tools and none of your settings (empty arguments survive the quoting)", got.args && got.args[got.args.indexOf("--tools") + 1] === "" && got.args[got.args.indexOf("--setting-sources") + 1] === "", got.args);

  console.log("THE APP — starts, serves its page, opens into setup");
  const port = 21000 + Math.floor(Math.random() * 3000);
  app = spawn(process.execPath, [CLI, "app"], { env: { ...process.env, SYMBIOT_PORT: String(port), SYMBIOT_FORCE_NEW: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; app.stdout.on("data", (d) => { out += d; }); app.stderr.on("data", (d) => { out += d; });
  for (let i = 0; i < 60 && !/t=[a-f0-9]+/.test(out); i++) await sleep(500);
  const token = (out.match(/t=([a-f0-9]+)/) || [])[1];
  ok("it starts and prints its address", !!token, out.slice(0, 300));
  const H = { "x-symbiot-token": token || "" }, base = `http://127.0.0.1:${port}`;
  const page = await (await fetch(`${base}/?t=${token}`)).text();
  const script = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  let parses = true; try { new Function(script); } catch { parses = false; }
  ok("its page loads, and its script parses", page.includes("<title>") && script.length > 1000 && parses, page.slice(0, 120));
  const ping = await (await fetch(`${base}/api/ping`, { headers: H })).json();
  ok("it answers with its version", ping.version === pkg.version, ping);
  const onb = await (await fetch(`${base}/api/onboarding`, { headers: H })).json();
  ok("a new install opens into setup, with the subscription found", onb.pending === true && onb.step === "welcome" && onb.ai.provider === "claude", { pending: onb.pending, step: onb.step, ai: onb.ai });
  ok("the window's icon is served", /<svg/.test(await (await fetch(`${base}/favicon.svg`)).text()), "");
  app.kill(); app = null; await sleep(500);

  console.log("INSTALLING AND REMOVING");
  const { installLauncher } = await import("../desktop.mjs");
  const li = installLauncher({ script: CLI, home: HOME });
  if (WIN) {
    const vbs = join(HOME, "AppData", "Roaming", "Symbiot", "open.vbs");
    ok("Windows: a Start-menu shortcut and one on the desktop, with the orb", !li.error && existsSync(li.file) && existsSync(li.desktop) && existsSync(join(HOME, "AppData", "Roaming", "Symbiot", "symbiot.ico")), li);
    ok("…each opens Symbiot through a hidden script (no console window)", existsSync(vbs) && /\.Run """.*node.*"" "".*index\.mjs"" open", 0, False/i.test(readFileSync(vbs, "utf8")), existsSync(vbs) ? readFileSync(vbs, "utf8") : "");
    const sc = spawnSync("powershell", ["-NoProfile", "-Command", `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${li.file.replace(/'/g, "''")}'); $s.TargetPath + '|' + $s.Arguments + '|' + $s.IconLocation`], { encoding: "utf8" });
    ok("…the shortcut runs wscript on that script, with the orb icon", /wscript\.exe\|"[^"]*open\.vbs"\|[^|]*symbiot\.ico,0/i.test(sc.stdout.trim()), sc.stdout.trim());
  } else ok("the app-menu entry is written here (Linux)", !!li.file, li);
  const post = spawnSync(process.execPath, [join(ROOT, "postinstall.mjs")], { encoding: "utf8", env: { ...process.env, npm_config_global: "true", SYMBIOT_NO_LAUNCHER: "" } });
  ok("the install step never fails the install", post.status === 0, [post.status, post.stderr]);
  mkdirSync(CFG, { recursive: true }); writeFileSync(join(CFG, "config.json"), "{}");
  const un = spawnSync(process.execPath, [CLI, "uninstall", "--yes", "--keep-program"], { encoding: "utf8", env: process.env });
  ok("symbiot uninstall removes its data", un.status === 0 && !existsSync(CFG), [un.status, un.stdout.slice(-200), un.stderr]);
  if (WIN) ok("…and its Start-menu and desktop shortcuts", !existsSync(li.file) && !existsSync(li.desktop), [li.file, li.desktop]);
} finally {
  if (app) app.kill();
  await sleep(300);
  try { rmSync(HOME, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch {}
}
console.log(`\n${fail ? "✗" : "✓"} windows: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
