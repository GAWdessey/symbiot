// npm install -g symbiot runs this: Symbiot where you start apps (the app menu on
// Linux, the Start menu and the desktop on Windows), with its icon, so you never need
// a terminal to start it (desktop.mjs installLauncher), and then it opens, so setup
// starts right away. Only for a global install on a desktop, and it never fails the
// install. npm hides what install scripts print, so the line goes straight to your
// terminal (its console on Windows).
import { realpathSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const WIN = process.platform === "win32";
const say = (s) => { try { writeFileSync(WIN ? "CONOUT$" : "/dev/tty", s + "\n"); } catch { console.log(s); } };
try {
  if (process.env.npm_config_global === "true" && !process.env.SYMBIOT_NO_LAUNCHER) {
    const script = realpathSync(fileURLToPath(new URL("./index.mjs", import.meta.url)));
    const { installLauncher } = await import("./desktop.mjs");
    const r = installLauncher({ script });
    const desktop = (WIN || process.platform === "darwin" || !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)) && !process.env.CI && !process.env.SYMBIOT_NO_OPEN;
    const where = WIN ? "the Start menu or your desktop" : "your app menu";
    if (desktop) { spawn(process.execPath, [script, "open"], { detached: true, stdio: "ignore", windowsHide: true }).unref(); say(`\nSymbiot is installed and opening now. Next time, open it from ${where}: no terminal needed.\n`); }
    else if (r.file) say(`\nSymbiot is in ${where}: open it from there, no terminal needed.\n`);
  }
} catch {}
