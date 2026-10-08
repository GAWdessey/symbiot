// npm install -g symbiot runs this: Symbiot in your app menu, with its icon, so you
// never need a terminal to start it (desktop.mjs installLauncher), and then it opens,
// so setup starts right away. Only for a global install on a desktop, and it never
// fails the install. npm hides what install scripts print, so the line goes straight
// to your terminal.
import { realpathSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const say = (s) => { try { writeFileSync("/dev/tty", s + "\n"); } catch { console.log(s); } };
try {
  if (process.env.npm_config_global === "true" && !process.env.SYMBIOT_NO_LAUNCHER) {
    const script = realpathSync(fileURLToPath(new URL("./index.mjs", import.meta.url)));
    const { installLauncher } = await import("./desktop.mjs");
    const r = installLauncher({ script });
    const desktop = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY) && !process.env.CI && !process.env.SYMBIOT_NO_OPEN;
    if (desktop) { spawn(process.execPath, [script, "open"], { detached: true, stdio: "ignore" }).unref(); say("\nSymbiot is installed and opening now. Next time, open it from your app menu: no terminal needed.\n"); }
    else if (r.file) say("\nSymbiot is in your app menu: open it from there, no terminal needed.\n");
  }
} catch {}
