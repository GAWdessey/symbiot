// Shared basics for every module: Symbiot's version (and npm's newest), its
// config and task files, the one shell helper (never throws, never hangs) and a
// repo's working-tree state.
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ---- version ----------------------------------------------------------------
const HERE = fileURLToPath(new URL(".", import.meta.url));
let VERSION = "0"; try { VERSION = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).version; } catch {}
let LATEST_VERSION = ""; // newest symbiot on npm, checked in the background
// a.b.c numeric compare: only a HIGHER npm version is an update (a local build
// ahead of npm must not be offered a "newer" older one)
function semverGt(a, b) { const p = (v) => String(v || "").replace(/^v/, "").split(/[.-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; }
// SYMBIOT_REGISTRY points the check at another registry (the tests use a fake one)
const REGISTRY = (process.env.SYMBIOT_REGISTRY || "https://registry.npmjs.org").replace(/\/+$/, "");
async function checkLatest() { try { const r = await fetch(REGISTRY + "/symbiot"); if (!r.ok) return; const j = await r.json(); LATEST_VERSION = (j["dist-tags"] && j["dist-tags"].latest) || ""; } catch {} }

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
// Two wordings of one task: the same words once case, spacing and punctuation
// are set aside (a colon for a bracket, `code` for code), or one is the other
// with a clause more on the end. An extension only counts when the shorter one
// is a whole sentence (8+ words), so "Fix the bug" never swallows "Fix the bug
// in the login form".
// Or nearly the same (nearTask): an agent that suggests a task again rewords
// it, and TASKS.md listed both.
const taskWords = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function sameTask(a, b) {
  const x = taskWords(a), y = taskWords(b); if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  return (s.split(" ").length >= 8 && l.startsWith(s + " ")) || nearTask(a, b) || sameAsk(a, b);
}
// Nearly the same task, two ways:
// - nearly all the same words in the same order, 12+ words each ("…nothing
//   recorded since 2026-08-03" and "…since 2026-08-04")
// - the same first sentence of 5+ words, with only what follows it different:
//   "Set `WA_WABA_ID` in `.env`. It's needed to list templates" / "…to create Flows"
// Never when each names something the other doesn't: "Watch Gmail…" and
// "Watch WhatsApp…" are two tasks, however alike the rest. A name is a word
// with a capital that doesn't just start a sentence (Gmail, WhatsApp, WA).
const NEAR = 0.85, NEAR_WORDS = 12, LEAD_WORDS = 5;
function wordsOf(s) {
  s = String(s || "");
  return [...s.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => {
    const w = m[0], before = s.slice(0, m.index);
    const starts = !before.trim() || /[.!?]["'`)\]]*\s*$/.test(before);
    return { w: w.toLowerCase(), name: w.length > 1 && /\p{Lu}/u.test(w) && (!starts || /\p{Lu}/u.test(w.slice(1))) };
  });
}
// The first sentence's words, when more follows it ("" when it's all one sentence).
function leadOf(s) { const m = String(s || "").match(/^(.*?[.!?])["'`)\]]*\s+\S/s); return m ? taskWords(m[1]) : ""; }
function nearTask(a, b) {
  const x = wordsOf(a), y = wordsOf(b), m = x.length, n = y.length; if (!m || !n) return false;
  const lead = leadOf(a), sameLead = !!lead && lead === leadOf(b) && lead.split(" ").length >= LEAD_WORDS;
  if (!sameLead && (Math.min(m, n) < NEAR_WORDS || Math.min(m, n) / Math.max(m, n) < NEAR)) return false;
  // the longest run of words both have in order, and the words left over on each side
  const L = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = x[i].w === y[j].w ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  if (!sameLead && (2 * L[0][0]) / (m + n) < NEAR) return false;
  let i = 0, j = 0, nx = false, ny = false;
  while (i < m && j < n) {
    if (x[i].w === y[j].w) { i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) { if (x[i++].name) nx = true; } else if (y[j++].name) ny = true;
  }
  for (; i < m; i++) if (x[i].name) nx = true;
  for (; j < n; j++) if (y[j].name) ny = true;
  return !(nx && ny);
}
// The same ask in other words: "Send Jono the two asks yourself: verify
// `X-Wa-Signature-256`…" and "Ask Jono to verify `X-Wa-Signature-256`… Also ask
// him…". Both name exactly the same things (Jono, X-Wa-Signature-256), and most
// of the shorter one's own words (not "the", "his", "once"; "asks" is "ask") are
// in the other. Checked against 263 real tasks (11,770 pairs): at 0.6 it found 7
// rewordings and nothing else; at 0.45 it took "Whole page for Gmail too" for
// "Map the whole page … (not for Gmail)".
const ASK = 0.6, ASK_WORDS = 8;
const STOP = new Set(("the and but for from with are was were been its this that these those then than once each his her him she they them their you your yourself can cant not does did have has had will would should could just also there here into onto out about before after when what which who whom how why all any some more most other only own same too very again").split(" "));
function askWords(s) { return new Set(wordsOf(s).map((x) => x.w).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ""))); }
function sameAsk(a, b) {
  const x = askWords(a), y = askWords(b); if (Math.min(x.size, y.size) < ASK_WORDS) return false;
  const nx = new Set(wordsOf(a).filter((w) => w.name).map((w) => w.w)), ny = new Set(wordsOf(b).filter((w) => w.name).map((w) => w.w));
  if (!nx.size || nx.size !== ny.size || [...nx].some((w) => !ny.has(w))) return false;
  let both = 0; for (const w of x) if (y.has(w)) both++;
  return both / Math.min(x.size, y.size) >= ASK;
}
// One of each: near-duplicates collapse into the wording that says the most.
function uniqueTasks(texts) {
  const out = [];
  for (const t of texts) { const i = out.findIndex((u) => sameTask(u, t)); if (i < 0) out.push(t); else if (taskWords(t).length > taskWords(out[i]).length) out[i] = t; }
  return out;
}

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

export { VERSION, LATEST_VERSION, semverGt, REGISTRY, checkLatest, CONFIG_DIR, CONFIG_PATH, loadConfig, saveConfig, loadTasks, saveTasks, taskWords, sameTask, uniqueTasks, sh, hasCmd, chromeBinary, repoState };
