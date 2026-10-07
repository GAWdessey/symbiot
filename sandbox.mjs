// symbiot — Sandbox: `symbiot app --fresh` opens a brand-new Symbiot, so you can
// walk through first run and setup the way someone new to it would, without
// touching yours.
//
// Everything Symbiot keeps lives under your home folder (~/.config/symbiot:
// memory, links, lanes, tasks, the hidden browser's sign-ins), and so do the
// things it reads to know you (~/.claude.json for connectors, ~/.config/anthropic,
// git's ~/.gitconfig). So the sandbox is a second Symbiot with a throwaway home:
// - HOME is a new empty folder under the system's temp folder, deleted when the
//   app quits (--keep keeps it, to look at what setup wrote).
// - No AI keys, model or config locations come from your environment (AI_ENV),
//   so it starts unconnected, like a new install.
// - It scans nothing of yours: the empty home, until you add a folder.
// - Its own port, and it never offers or runs an update (server.mjs SANDBOX): an
//   update would replace your real install.
// - The app shows "sandbox" by its version, so you can tell the two apart.
// What it can't fence off: a folder you add yourself is read (and Send to repos
// writes .symbiot/TASKS.md there), and agents it starts run as you on this
// computer, though without your Claude sign-in (it lives in your home).
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const PORT = 7381; // not the app's 7391, so both can run; it moves on if this one's taken
// What would connect it, or point it at your config, from the environment.
const AI_ENV = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "SYMBIOT_MODEL",
  "SYMBIOT_SCAN_HOME", "SYMBIOT_PORT", "SYMBIOT_RELAUNCH", "SYMBIOT_UPDATE_CMD", "CLAUDE_CONFIG_DIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "GIT_CONFIG_GLOBAL"];

// The environment the sandbox's app runs in: yours, with its own home and none of the above.
function sandboxEnv(home, env = process.env, port = PORT) {
  const out = { ...env };
  for (const k of AI_ENV) delete out[k];
  return { ...out, HOME: home, USERPROFILE: home, SYMBIOT_SANDBOX: home, SYMBIOT_FORCE_NEW: "1", SYMBIOT_PORT: String(port) };
}

// Start it: a new home, the app in it, and the home gone when the app stops.
// `args` go on to `symbiot app` (--plain, --all…). Resolves with the app's exit code.
function runSandbox({ bin, args = [], keep = false, log = console.log, port = PORT } = {}) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "symbiot-fresh-")));
  log(`Sandbox: a brand-new Symbiot, with its own empty home at ${home}.`);
  log("No AI connected, no memory, no linked accounts, no lanes, none of your repos. Nothing of yours is read or changed.");
  log(keep ? "That folder stays when you quit (--keep)." : "Quit it (the Quit button, or Ctrl+C here) and that folder is deleted.");
  const child = spawn(process.execPath, [bin, "app", ...args], { env: sandboxEnv(home, process.env, port), stdio: "inherit" });
  const stop = () => {}; // Ctrl+C reaches the app too; wait for it to quit, then clean up
  process.on("SIGINT", stop); process.on("SIGTERM", () => child.kill("SIGTERM"));
  return new Promise((resolve) => child.on("exit", (code) => {
    process.off("SIGINT", stop);
    if (!keep) { try { rmSync(home, { recursive: true, force: true }); log("Sandbox closed; its home is deleted."); } catch (e) { log(`Couldn't delete ${home}: ${e.message}`); } }
    else log(`Sandbox closed. Its home is still at ${home}.`);
    resolve(code || 0);
  }));
}

export { PORT as SANDBOX_PORT, AI_ENV, sandboxEnv, runSandbox };
