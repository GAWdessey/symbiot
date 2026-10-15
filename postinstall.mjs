// npm install -g symbiot runs this: Symbiot where you start apps (the app menu on
// Linux, the Start menu and the desktop on Windows), with its icon, so you never need
// a terminal to start it (desktop.mjs installLauncher), and then it opens, so setup
// starts right away. Only for a global install on a desktop, and it never fails the
// install. npm hides what install scripts print, so the line goes straight to your
// terminal (its console on Windows).
import { realpathSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const WIN = process.platform === "win32";
const say = (s) => { try { writeFileSync(WIN ? "CONOUT$" : "/dev/tty", s + "\n"); } catch { console.log(s); } };
// A Symbiot already running (it holds app-<port>.lock, core.mjs): this install is its
// own update (or one made beside it), and it restarts onto the new version itself. A
// `symbiot open` here found it running and popped a second window on every update,
// which then said "a newer one opened" (15 Oct 2026).
function appRunning() {
  try {
    const dir = join(homedir(), ".config", "symbiot"); let port = 7391;
    try { port = Number(process.env.SYMBIOT_PORT || JSON.parse(readFileSync(join(dir, "config.json"), "utf8")).appPort) || 7391; } catch {}
    const l = JSON.parse(readFileSync(join(dir, `app-${port}.lock`), "utf8")); process.kill(Number(l.pid), 0); return true;
  } catch (e) { return !!(e && e.code === "EPERM"); }
}
try {
  if (process.env.npm_config_global === "true" && !process.env.SYMBIOT_NO_LAUNCHER) {
    const script = realpathSync(fileURLToPath(new URL("./index.mjs", import.meta.url)));
    const { installLauncher } = await import("./desktop.mjs");
    const r = installLauncher({ script });
    const desktop = (WIN || process.platform === "darwin" || !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)) && !process.env.CI && !process.env.SYMBIOT_NO_OPEN;
    const where = WIN ? "the Start menu or your desktop" : "your app menu";
    if (desktop && appRunning()) say("\nSymbiot is updated; the one that's open restarts onto it by itself.\n");
    else if (desktop) { spawn(process.execPath, [script, "open"], { detached: true, stdio: "ignore", windowsHide: true }).unref(); say(`\nSymbiot is installed and opening now. Next time, open it from ${where}: no terminal needed.\n`); }
    else if (r.file) say(`\nSymbiot is in ${where}: open it from there, no terminal needed.\n`);
  }
} catch {}
