// npm install -g symbiot runs this: Symbiot in your app menu, with its icon, so you
// never need a terminal to start it (desktop.mjs installLauncher). Only for a global
// install, and it never fails the install.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
try {
  if (process.env.npm_config_global === "true" && !process.env.SYMBIOT_NO_LAUNCHER) {
    const { installLauncher } = await import("./desktop.mjs");
    const r = installLauncher({ script: realpathSync(fileURLToPath(new URL("./index.mjs", import.meta.url))) });
    if (r.file) console.log("Symbiot is in your app menu: open it from there, no terminal needed.");
  }
} catch {}
