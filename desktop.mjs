// symbiot — what the symbiot-desktop tray app added, now part of `symbiot app`:
// a weekly write-up with a desktop notification, and starting at login.
// No Electron: the app's own server runs the weekly schedule while it's up, and
// start-at-login launches that server in the background (no window) when you
// log in, so the write-up still happens on days you never open Symbiot.
// `symbiot app` then finds that running copy and opens its window.
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, unlinkSync, readdirSync, statSync, chmodSync, rmdirSync } from "node:fs";
import { CONFIG_DIR, loadConfig, saveConfig, hasCmd } from "./core.mjs";

// The Android app (android/) runs this same code with SYMBIOT_ANDROID_APP=1. Its
// Java side posts the notifications and starts Symbiot at boot, so here it's an
// OS of its own: "android-app" (Termux on Android is plain "android").
const OS = process.env.SYMBIOT_ANDROID_APP === "1" ? "android-app" : process.platform;

// ---- weekly write-up --------------------------------------------------------
// config.weekly = { on, day (0 = Sunday … 6 = Saturday), hour (0-23), last (ms) }.
// Each run saves the write-up to ~/.config/symbiot/weeks/<date>.md.
const WEEKS_DIR = join(CONFIG_DIR, "weeks");
const intIn = (v, lo, hi, def) => { const n = v === "" || v == null ? NaN : Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : def; };
function weeklyCfg(cfg = loadConfig()) {
  const w = cfg.weekly || {};
  return { on: !!w.on, day: intIn(w.day, 0, 6, 5), hour: intIn(w.hour, 0, 23, 16), last: Number(w.last) || 0 };
}
// The latest scheduled moment at or before `now`, in local time.
function lastSlot(now, day, hour) {
  const d = new Date(now); d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - day + 7) % 7));
  if (d.getTime() > now) d.setDate(d.getDate() - 7);
  return d.getTime();
}
// Due when it's on and hasn't run since the latest slot, so a slot missed while
// the computer was off runs as soon as the app is up again (once, not per week missed).
function weeklyDue(w, now = Date.now()) { return !!w.on && w.last < lastSlot(now, w.day, w.hour); }
// Any change to the schedule counts as a run now, so switching it on (or moving
// the day) never fires straight away for a slot that's already past.
function setWeekly(b = {}) {
  const cfg = loadConfig(), w = weeklyCfg(cfg);
  if (typeof b.on === "boolean") w.on = b.on;
  w.day = intIn(b.day, 0, 6, w.day); w.hour = intIn(b.hour, 0, 23, w.hour); w.last = Date.now();
  cfg.weekly = w; saveConfig(cfg);
  return weeklyState();
}
const localDay = (t = Date.now()) => { const d = new Date(t); return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("-"); };
const FOOT = "\n\n---\n";
// The newest saved write-up, or null.
function latestWeek() {
  try {
    const f = readdirSync(WEEKS_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort().pop(); if (!f) return null;
    const file = join(WEEKS_DIR, f), raw = readFileSync(file, "utf8"), i = raw.lastIndexOf(FOOT);
    return { file, at: statSync(file).mtimeMs, text: (i >= 0 ? raw.slice(0, i) : raw).trim(), footer: i >= 0 ? raw.slice(i + FOOT.length).trim() : "" };
  } catch { return null; }
}
function weeklyState() { return { ...weeklyCfg(), latest: latestWeek() }; }
// Write the week with `produce` (index.mjs), save it and notify. `last` is set
// first, so a slow or failing run is never retried every minute. notify: false
// skips the notification, for a caller that tells you itself (the saved file
// and what's returned are the same either way): the Week tab's button does, so
// a week written there is saved too. What's returned is produce's answer (text,
// footer), plus the file it was saved to, or an error.
async function runWeekly(produce, { notify: on = true } = {}) {
  const notify = (body) => on && desktopNotify("Symbiot", body);
  const cfg = loadConfig(); cfg.weekly = { ...weeklyCfg(cfg), last: Date.now() }; saveConfig(cfg);
  const r = await produce("week");
  if (r.error === "not-connected") { notify("Time for your weekly update. Connect an AI in Symbiot's Settings and it writes it for you."); return { error: r.error }; }
  if (/^\(?couldn't reach the model/i.test(String(r.text || ""))) { notify("Couldn't write your week: the model didn't answer. Try the Week tab."); return { ...r, error: r.text }; }
  const file = join(WEEKS_DIR, localDay() + ".md");
  try { mkdirSync(WEEKS_DIR, { recursive: true }); writeFileSync(file, String(r.text || "").trim() + (r.footer ? FOOT + r.footer : "") + "\n"); }
  catch (e) { return { ...r, error: "Couldn't save the write-up: " + ((e && e.message) || e) }; }
  notify("Your week is written. Open the Week tab in Symbiot, or " + file);
  return { ...r, ok: true, file };
}
// Checks once a minute while the app runs. Returns a stop function.
function startWeekly(produce) {
  let busy = false;
  const tick = () => { if (busy || !weeklyDue(weeklyCfg())) return; busy = true; runWeekly(produce).catch(() => {}).finally(() => { busy = false; }); };
  const first = setTimeout(tick, 5000), every = setInterval(tick, 60 * 1000);
  first.unref(); every.unref();
  return () => { clearTimeout(first); clearInterval(every); };
}

// ---- desktop notification (no dependencies) ---------------------------------
// [cmd, args] for this OS, or null when there's nothing to notify with.
function notifyCmd(title, body, platform = OS) {
  if (platform === "darwin") return ["osascript", ["-e", `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`]];
  if (platform === "win32") {
    const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
    return ["powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", `Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(10000, ${q(title)}, ${q(body)}, 'Info'); Start-Sleep -Seconds 11; $n.Dispose()`]];
  }
  // Android (Termux): termux-notification, from the termux-api package + the Termux:API app.
  // One per source: Watch's "3 new · Inbox" replaces Inbox's last one, not GitHub's.
  if (platform === "android") {
    const from = (String(title).match(/ · (.+)$/) || [])[1], id = from ? "symbiot-" + from.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) : "symbiot";
    return hasCmd("termux-notification") ? ["termux-notification", ["--id", id, "--title", title, "--content", body]] : null;
  }
  return hasCmd("notify-send") ? ["notify-send", ["--app-name=Symbiot", title, body]] : null;
}
// In the app: a line in a file its service watches, and it posts the notification.
function desktopNotify(title, body, platform = OS, dir = CONFIG_DIR) {
  if (platform === "android-app") { try { mkdirSync(dir, { recursive: true }); appendFileSync(join(dir, "android-notify.jsonl"), JSON.stringify({ title, body }) + "\n"); return true; } catch { return false; } }
  const c = notifyCmd(title, body, platform); if (!c) return false;
  try { const ch = spawn(c[0], c[1], { detached: true, stdio: "ignore" }); ch.on("error", () => {}); ch.unref(); return true; } catch { return false; }
}

// ---- start at login -----------------------------------------------------------
// One file per OS, in the place that OS starts things from at login: an XDG
// autostart entry (Linux), a LaunchAgent (macOS), the Startup folder (Windows),
// a Termux:Boot script (Android, run when the phone starts). The Android app
// starts itself at boot while its flag file is there.
// It runs `symbiot app` with SYMBIOT_NO_OPEN=1, so no window pops up. PATH is
// saved too, so agents and git resolve as they do in your terminal.
function autostartFile(platform = OS, home = homedir()) {
  if (platform === "android-app") return join(home, ".config", "symbiot", "android-boot");
  if (platform === "darwin") return join(home, "Library", "LaunchAgents", "co.symbiot.app.plist");
  if (platform === "win32") return join(home, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "symbiot.cmd");
  if (platform === "android") return join(home, ".termux", "boot", "symbiot");
  return join(home, ".config", "autostart", "symbiot.desktop");
}
function autostartContent(node, script, platform = OS, path = process.env.PATH || "", exe = process.env.SYMBIOT_DESKTOP_EXE || "") {
  if (exe) { // the installed app: it starts its tray and Symbiot itself
    const q = (s) => '"' + String(s).replace(/(["`$\\])/g, "\\$1") + '"';
    if (platform === "win32") return ["@echo off", `start "" "${exe}"`, ""].join("\r\n");
    if (platform === "darwin") return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>co.symbiot.app</string><key>ProgramArguments</key><array><string>${String(exe).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</string></array><key>RunAtLoad</key><true/></dict></plist>\n`;
    return ["[Desktop Entry]", "Type=Application", "Name=Symbiot", `Exec=${q(exe)}`, "Terminal=false", "NoDisplay=true", "X-GNOME-Autostart-enabled=true", ""].join("\n");
  }
  if (platform === "android-app") return "While this file exists, Symbiot's Android app starts itself when the phone starts.\n";
  if (platform === "darwin") {
    const x = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>co.symbiot.app</string>
  <key>ProgramArguments</key><array><string>${x(node)}</string><string>${x(script)}</string><string>app</string></array>
  <key>EnvironmentVariables</key><dict><key>SYMBIOT_NO_OPEN</key><string>1</string><key>PATH</key><string>${x(path)}</string></dict>
  <key>RunAtLoad</key><true/>
</dict></plist>
`;
  }
  if (platform === "android") {
    // sh single quotes; the wake lock stops Android from stopping Termux while Symbiot runs
    const sq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
    return ["#!/data/data/com.termux/files/usr/bin/sh", "command -v termux-wake-lock >/dev/null && termux-wake-lock",
      "export SYMBIOT_NO_OPEN=1 PATH=" + sq(path), "exec " + sq(node) + " " + sq(script) + " app", ""].join("\n");
  }
  if (platform === "win32") return ["@echo off", "set SYMBIOT_NO_OPEN=1", `start "Symbiot" /min "${node}" "${script}" app`, ""].join("\r\n");
  // Desktop Entry Exec quoting: double quotes, with " ` $ \ backslash-escaped
  const q = (s) => '"' + String(s).replace(/(["`$\\])/g, "\\$1") + '"';
  return ["[Desktop Entry]", "Type=Application", "Name=Symbiot", "Comment=Symbiot in the background: the weekly write-up and its notification",
    `Exec=env SYMBIOT_NO_OPEN=1 ${q("PATH=" + path)} ${q(node)} ${q(script)} app`, "Terminal=false", "NoDisplay=true", "X-GNOME-Autostart-enabled=true", ""].join("\n");
}
// ---- the app launcher ---------------------------------------------------------
// Symbiot in your app menu, with its icon: click it and Symbiot starts in the
// background (no terminal) and opens its window, or brings the window up if it's
// running (`symbiot open`). Linux (XDG): an entry in ~/.local/share/applications and
// the icon in your icon theme. `npm install -g` writes it (postinstall.mjs), and each
// start of an installed Symbiot writes it again if it's missing or out of date (a
// new Node, a moved install), so it never points at something gone.
const launcherFile = (home = homedir()) => join(home, ".local", "share", "applications", "symbiot.desktop");
const launcherIcon = (home = homedir()) => join(home, ".local", "share", "icons", "hicolor", "scalable", "apps", "symbiot.svg");
const ICON_SRC = fileURLToPath(new URL("./icon.svg", import.meta.url));
// The orb in each look: Ferrofluid (icon.svg, dark), Glass (clear, on a cool light
// ground) and Pearl (white pearl, on a warm light ground). The app menu's icon and
// the window's follow the look you pick (setLauncherLook).
const LOOK_COLOURS = {
  glass: { bg: ["#F4F7FB", "#D9E1EC"], orb: ["#FFFFFF", "#C9D6E6", "#7F93AE"], rim: "#5B8DEF", glow: "#5B8DEF" },
  pearl: { bg: ["#F7F4EE", "#E6E0D5"], orb: ["#FFFFFF", "#ECE7DF", "#A99F92"], rim: "#C9A46A", glow: "#F2A541" },
};
function iconSvg(look = "ferro") {
  const base = readFileSync(ICON_SRC, "utf8"), c = LOOK_COLOURS[look];
  if (!c) return base;
  return base.replace('stop-color="#1B1D22"', `stop-color="${c.bg[0]}"`).replace('stop-color="#08090B"', `stop-color="${c.bg[1]}"`)
    .replace('stop-color="#3A3D44"', `stop-color="${c.orb[0]}"`).replace('stop-color="#121317"', `stop-color="${c.orb[1]}"`).replace('stop-color="#030304"', `stop-color="${c.orb[2]}"`)
    .replace('stop-color="#B0466E" stop-opacity="0.55"', `stop-color="${c.rim}" stop-opacity="0.45"`)
    .replace(/stop-color="#F2A541" stop-opacity="0\.16"/, `stop-color="${c.glow}" stop-opacity="0.18"`);
}
// The look changed: the app menu's icon follows, if the app menu has Symbiot.
function setLauncherLook(look, home = homedir()) {
  if (!existsSync(launcherFile(home))) return false;
  try { writeFileSync(launcherIcon(home), iconSvg(look), { mode: 0o644 }); return true; } catch { return false; }
}
function launcherContent(node, script, path = process.env.PATH || "") {
  const q = (s) => '"' + String(s).replace(/(["`$\\])/g, "\\$1") + '"';
  return ["[Desktop Entry]", "Type=Application", "Name=Symbiot", "GenericName=Assistant",
    "Comment=Your work, your agents and what needs you, in one place",
    `Exec=env ${q("PATH=" + path)} ${q(node)} ${q(script)} open`, "Icon=symbiot", "Terminal=false",
    "Categories=Office;Utility;Development;", "Keywords=assistant;agents;tasks;week;standup;", "StartupNotify=true",
    // the app's window is Chrome's --app window on Symbiot's address: this groups it under this icon
    "StartupWMClass=chrome-127.0.0.1__-Default", ""].join("\n");
}
// The PATH the launcher starts it with: yours, without the throwaway folders npm adds
// while it installs (…/node_modules/.bin), each once, and Node's own folder in it.
function launcherPath(path, node) {
  const seen = new Set(), out = [];
  for (const d of [...String(path || "").split(":"), dirname(node)]) if (d && !/node_modules[\\/]\.bin|node-gyp-bin/.test(d) && !seen.has(d)) { seen.add(d); out.push(d); }
  return out.join(":");
}
// ---- Windows: the Start menu and the desktop -------------------------------------
// A shortcut in the Start menu and one on the desktop, with the orb (icon.ico). Each
// runs a small script through wscript (open.vbs), which starts `symbiot open` with
// its window hidden: node is a console program, and run straight from a shortcut it
// would flash a black window.
// Windows' own APPDATA (when it's in this home); the desktop as Windows reports it
// (often in OneDrive), kept in desktop.txt so uninstalling finds that shortcut again.
const winDirs = (home = homedir()) => {
  const env = process.env.APPDATA || "", appdata = env && env.toLowerCase().startsWith(home.toLowerCase()) ? env : join(home, "AppData", "Roaming"), own = join(appdata, "Symbiot");
  let desk = ""; try { desk = readFileSync(join(own, "desktop.txt"), "utf8").trim(); } catch {}
  return { own, menu: join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Symbiot.lnk"), desk: desk || join(home, "Desktop", "Symbiot.lnk") };
};
const ICO_SRC = fileURLToPath(new URL("./icon.ico", import.meta.url));
// VBScript: "" is a quote inside a string
const vbsContent = (node, script) => `' Symbiot: start it (or show it) with no console window\r\nCreateObject("WScript.Shell").Run """${node.replace(/"/g, '""')}"" ""${script.replace(/"/g, '""')}"" open", 0, False\r\n`;
// PowerShell that makes one shortcut: single quotes, '' is a quote inside one
function shortcutPs(lnk, vbs, ico) {
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  return `$s = (New-Object -ComObject WScript.Shell).CreateShortcut(${q(lnk)}); $s.TargetPath = (Join-Path $env:WINDIR 'System32\\wscript.exe'); $s.Arguments = ${q('"' + vbs + '"')}; $s.IconLocation = ${q(ico + ",0")}; $s.Description = 'Symbiot'; $s.WorkingDirectory = $env:USERPROFILE; $s.Save()`;
}
function installWindows({ node, script, home, run }) {
  const d = winDirs(home), vbs = join(d.own, "open.vbs"), ico = join(d.own, "symbiot.ico"), want = vbsContent(node, script);
  let wrote = false;
  try {
    mkdirSync(d.own, { recursive: true });
    if (!existsSync(join(d.own, "desktop.txt")) && home === homedir()) {
      const r = run("powershell", ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetFolderPath('Desktop')"]);
      const dir = r && r.status === 0 ? String(r.stdout || "").trim() : "";
      if (dir) { d.desk = join(dir, "Symbiot.lnk"); writeFileSync(join(d.own, "desktop.txt"), d.desk); }
    }
    let had = ""; try { had = readFileSync(vbs, "utf8"); } catch {}
    if (had !== want) { writeFileSync(vbs, want); wrote = true; }
    if (!existsSync(ico)) { writeFileSync(ico, readFileSync(ICO_SRC)); wrote = true; }
    for (const lnk of [d.menu, d.desk]) {
      if (!wrote && existsSync(lnk)) continue;
      try { mkdirSync(join(lnk, ".."), { recursive: true }); } catch {}
      const r = run("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", shortcutPs(lnk, vbs, ico)]);
      if (r && r.status !== 0) return { error: String((r.stderr || r.stdout || "") || "PowerShell couldn't make the shortcut").trim().slice(0, 300) };
      wrote = true;
    }
  } catch (e) { return { error: (e && e.message) || String(e) }; }
  return { written: wrote, file: d.menu, desktop: d.desk };
}
// Writes the entry and icon when they're missing or differ. { written, file } or { skipped }.
function installLauncher({ node = process.execPath, script, home = homedir(), platform = OS, path = process.env.PATH || "", run = (c, a) => spawnSync(c, a, { encoding: "utf8", windowsHide: true, timeout: 30000 }) } = {}) {
  if (!script) return { skipped: true };
  if (platform === "win32") return installWindows({ node, script, home, run });
  if (platform !== "linux") return { skipped: true };
  const file = launcherFile(home), icon = launcherIcon(home), want = launcherContent(node, script, launcherPath(path, node));
  let wrote = false;
  try {
    let had = ""; try { had = readFileSync(file, "utf8"); } catch {}
    if (had !== want) { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, want, { mode: 0o644 }); wrote = true; }
    let hadIcon = ""; try { hadIcon = readFileSync(icon, "utf8"); } catch {}
    const svg = iconSvg(loadConfig().look || "ferro");
    if (hadIcon !== svg) { mkdirSync(join(icon, ".."), { recursive: true }); writeFileSync(icon, svg, { mode: 0o644 }); wrote = true; }
  } catch (e) { return { error: (e && e.message) || String(e) }; }
  if (wrote) { try { spawn("update-desktop-database", [join(file, "..")], { stdio: "ignore", detached: true }).on("error", () => {}).unref(); } catch {} }
  return { written: wrote, file };
}
function removeLauncher(home = homedir()) {
  const gone = [], d = winDirs(home);
  for (const f of [launcherFile(home), launcherIcon(home), d.menu, d.desk, join(d.own, "open.vbs"), join(d.own, "symbiot.ico"), join(d.own, "desktop.txt")]) { try { if (existsSync(f)) { unlinkSync(f); gone.push(f); } } catch {} }
  try { rmdirSync(d.own); } catch {}
  return gone;
}
function autostartState() { const file = autostartFile(); return { on: existsSync(file), file, ...(OS === "android-app" ? { phone: "app" } : OS === "android" ? { phone: "termux" } : {}) }; }
// `script` is index.mjs's real path. From npx that's a cache folder that goes
// away, so it has to be installed for this to keep working.
function setAutostart(on, script) {
  const file = autostartFile();
  try {
    if (!on) { if (existsSync(file)) unlinkSync(file); return autostartState(); }
    if (/[\\/]_npx[\\/]/.test(String(script))) return { ...autostartState(), error: "Symbiot is running from npx. Install it first (npm install -g symbiot), then switch this on." };
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, autostartContent(process.execPath, script));
    if (OS === "android") chmodSync(file, 0o700); // Termux:Boot only runs executable scripts
    return autostartState();
  } catch (e) { return { ...autostartState(), error: String((e && e.message) || e) }; }
}

export { winDirs, vbsContent, shortcutPs, iconSvg, setLauncherLook, launcherPath, launcherFile, launcherIcon, launcherContent, installLauncher, removeLauncher, weeklyCfg, lastSlot, weeklyDue, setWeekly, weeklyState, latestWeek, runWeekly, startWeekly, notifyCmd, desktopNotify, autostartFile, autostartContent, autostartState, setAutostart };
