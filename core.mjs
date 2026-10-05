// Shared basics for every module: Symbiot's config and task files, the one
// shell helper (never throws, never hangs) and a repo's working-tree state.
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";

// ---- config ---------------------------------------------------------------
const CONFIG_DIR = join(homedir(), ".config", "symbiot");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
function loadConfig() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf8")); } catch { return {}; }
}
function saveConfig(cfg) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
    try { chmodSync(CONFIG_PATH, 0o600); } catch {}
    return true;
  } catch { return false; }
}
// ---- tasks: a persistent checklist (~/.config/symbiot/tasks.json) ---------
const TASKS_PATH = join(CONFIG_DIR, "tasks.json");
function loadTasks() { try { return JSON.parse(readFileSync(TASKS_PATH, "utf8")); } catch { return []; } }
function saveTasks(t) { try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(TASKS_PATH, JSON.stringify(t, null, 2)); return true; } catch { return false; } }

// ---- shell + git ----------------------------------------------------------
function sh(cmd) {
  try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024, timeout: 6000, killSignal: "SIGKILL" }); }
  catch { return ""; } // timeout or error -> empty, never hang the scan
}
// "Is this command available?": command -v on posix, where on win.
function hasCmd(cmd) { try { return !!sh(process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`).trim(); } catch { return false; } }
// A Chromium-family browser, per OS: the app's chrome-less --app window, and
// Screens' hidden (headless) browser.
function chromeBinary() {
  const p = process.platform;
  const exists = (f) => { try { return existsSync(f) ? f : null; } catch { return null; } };
  if (p === "darwin") {
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"].map(exists).find(Boolean) || null;
  }
  if (p === "win32") {
    const bases = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
    const rels = ["Google\\Chrome\\Application\\chrome.exe", "Chromium\\Application\\chrome.exe",
      "Microsoft\\Edge\\Application\\msedge.exe", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"];
    for (const base of bases) for (const r of rels) { const f = exists(join(base, r)); if (f) return f; }
    const w = sh("where chrome 2>NUL").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return w || null;
  }
  return ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave-browser", "microsoft-edge"].find(hasCmd) || null;
}
// Working-tree state, incl. detecting a stale/old checkout (not new work).
function repoState(repoPath) {
  const branch = sh(`git -C ${JSON.stringify(repoPath)} rev-parse --abbrev-ref HEAD 2>/dev/null`).trim();
  const porcelain = sh(`git -C ${JSON.stringify(repoPath)} status --porcelain 2>/dev/null`).split("\n").filter(Boolean);
  let del = 0, mod = 0, add = 0;
  for (const l of porcelain) { const x = l.slice(0, 2); if (/\?\?/.test(x)) add++; else if (x.includes("D")) del++; else if (x.includes("A")) add++; else mod++; }
  const dirty = porcelain.length;
  let stale = false, staleBy = 0;
  if (dirty) {
    for (const k of [3, 5, 10, 20, 40, 80, 160, 320]) {
      if (!sh(`git -C ${JSON.stringify(repoPath)} rev-parse HEAD~${k} 2>/dev/null`).trim()) break;
      if (sh(`git -C ${JSON.stringify(repoPath)} diff --quiet HEAD~${k} 2>/dev/null && echo EQ`).trim() === "EQ") { stale = true; staleBy = k; break; }
    }
    if (!stale && del >= 20 && del > mod && add === 0) stale = true; // mostly deletions = an old snapshot
  }
  const behind = Number(sh(`git -C ${JSON.stringify(repoPath)} rev-list --count HEAD..@{u} 2>/dev/null`).trim()) || 0;
  return { branch, dirty, del, mod, add, stale, staleBy, behind };
}

export { CONFIG_DIR, CONFIG_PATH, loadConfig, saveConfig, loadTasks, saveTasks, sh, hasCmd, chromeBinary, repoState };
