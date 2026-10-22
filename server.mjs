// `symbiot app`: the local server behind the app window. It serves the page
// (ui.mjs) and its /api routes, each a thin call into the module that does the
// work, on 127.0.0.1 only and behind the per-install token. (Your phone's link
// listens on your network separately, only for that: phone.mjs.)
import { languageState, setLanguage, translate, allTranslations } from "./lang.mjs";
import { licenceState, setKey, clearKey, can, refreshRevoked, FREE } from "./licence.mjs";
import { claudeSetup, installClaude, signInClaude, sendClaudeCode } from "./claudesetup.mjs";
import { voiceState, prepareVoice, speak, stopVoices } from "./voice.mjs";
import { spawn, spawnSync } from "node:child_process";
import { toggleAway, closeAway, awayOpen } from "./away.mjs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { readRunLog, waitUntil } from "./work.mjs";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync, realpathSync, appendFileSync, rmSync, chmodSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { EMBEDDED_UI } from "./ui.mjs";
import { VERSION, LATEST_VERSION, REGISTRY, semverGt, checkLatest, CONFIG_PATH, loadConfig, saveConfig, moveSecrets, loadTasks, hasCmd, chromeBinary, CONFIG_DIR, takeAppLock, releaseAppLock, writeJsonAtomic } from "./core.mjs";
import { onGoalAnswer, settleRecord, autoStart, runningHandoff as goalRunning, triageSweep, onRunEnd, onAnswered, shSingle, handoffCmd, setHandoffCmd, grantAgent, runHandoff, track, detectHandoffs, connectorsInfo, linkReach, answerQuestions, skipIdea, agentsNow, startWaiting, parkLane, parkedPaths, autoAllowSweep, continueLanes, trustFull, readLastWords, sandboxState, HANDOFFS, runningHandoff, runsTick } from "./agents.mjs";
import { write as aiWrite, PROVIDERS, resolveProvider, connectProvider, detectHardware, recommendModels, hasOllama, ollamaInstall, ensureOllama, useOllamaModel } from "./ai.mjs";
import { SCAN, SCAN_TIMEOUT_MS, scanRoots, scanHome, addScanRoot, removeScanRoot, mapNow, nodeDetail, repoPathMap, laneMap, setScanOptions, refreshRepos, REPO_STATE, reposState } from "./scan.mjs";
import { computeDrift } from "./drift.mjs";
import { afterShip, markLive, deployTick } from "./deploy.mjs";
import { quotaState } from "./quota.mjs";
import { laneCap, mergeEnded, DEFAULT_CAP } from "./parallel.mjs";
import { addTask, setTaskModel, toggleTask, removeTask, cancelTask, restoreTask, syncTasks, taskType, pushTasks, pendingReview, workingDiff, learnNpm, withReleases, releaseInput, approveRepo, approveChanges, sendBack, setAutoMerge, mergeWhenGreen, shipJob, shipJobOf, sendAgain, forgetUnsent, shippingPaths } from "./tasks.mjs";
import { repoReview, repoSuggest, folderSuggest, taskChat, clearTaskChat, mailState, setMail, sentMail, produce, releaseNotes } from "./writeups.mjs";
import { denyList } from "./outward.mjs";
import { listSecrets, getSecret, saveSecret, markUsed, deleteSecret, scrubStored, repairFalseSaves } from "./vault.mjs";
import { SCREENS_SOCK, sockGate, loadScreens, screenImage, captureScreen, splitScreen, listMonitors, allowScreenshots, importScreen, setRegions, renameScreen, removeScreen, blueprint, clickRegion } from "./screens.mjs";
import { sessionCookie, mapPage, wholePage, pressRegion, typeRegion, chooseRegion, fillForm, verifyPage, uploadRegion, scrollPage, signIn, keepBrowserOpen, isTrusted, trustedSites, trustSite, untrustSite, openSymbiotBrowser, closeSymbiotBrowser, onBrowserClosed, setBrowserHub, siteUrl, browserHub, windowOpen } from "./headless.mjs";
import { weeklyState, setWeekly, runWeekly, startWeekly, autostartState, setAutostart, installLauncher, iconSvg, setLauncherLook, desktopNotify } from "./desktop.mjs";
import { markNews, newsSince, watchState, addWatch, setEvery, removeWatch, clearNews, seenWatch, checkWatch, startWatches, setBrief, draftReply, openChat, watchBoard, boardChat, clearBoardChat } from "./watch.mjs";
import { setLinkAct, linksState, linkSite, checkLink, unlinkSite, addSite, signInAsked, sitesCheck } from "./links.mjs";
import { testWeeks, testInstalls, postsState, draftPosts, approvePost, editPost, skipPost, voiceFromLinkedIn, addMedia, removeMedia, mediaFile, mediaDir, pictureOfPage, clipOfPage, openUrl } from "./post.mjs";
import { mindState, forget, actNow } from "./mind.mjs";
import { goalsTick, goalAnswer, openGoal } from "./goals.mjs";
import { onUser } from "./jobs.mjs";
import { lanesTick, shipHanded, lanesState, partlyDone, handingOf, loadLedger, orcaRelink, shareAnswer, projectOf } from "./lanes.mjs";
import { archivedTasks } from "./sweep.mjs";
import { sentTick } from "./sentmail.mjs";
import { keepFacts, skipFacts, awaitTick, awaitingState, stopWaiting } from "./handback.mjs";
import { adaptState, noteUse } from "./adapt.mjs";
import { dismissCard, reportIdeasAdd, reportIdeasDismiss, reportAsk, reportDraftAnswer, homeState, homeTick, homeAsk, homeAnswer, homeNext, workScene, forgetWork, workGo, workTick, firstSteps, marketingState, marketingGo, marketingDraftAnswer, marketingTask, moveToMarketing, onboarding, setOnboarding, startOnboarding, phoneSetupFirst } from "./home.mjs";
import { MARKETING_DIR, MARKETING, draftPreview, laneMedia, displayName, setDraftMedia } from "./marketing.mjs";
import { trays, trayMedia, setBlur, addBlur, removeBlur, setReviewed, renderCapture } from "./tray.mjs";
import { captureProduct, captureProducts } from "./capture.mjs";
import { listReports, readReport, reportImage, markAllRead, phoneReports, phoneReport, withNeeds } from "./reports.mjs";
import { heardCode, setCodeRelay, computerCopy, relaunchEnv, phoneState, setPhoneLink, startPhoneLink, freePhonePort, usePhonePort, newCode, unpairPhone, setRelay, findComputers, pairComputer, forgetComputer, pollComputer, queueChange, dismissNote, setPhoneApprove, startPhone } from "./phone.mjs";
import { knowledgeState, addKnowledgeFolder, removeKnowledgeFolder, indexKnowledge, knowledgeTick, searchKnowledge } from "./knowledge.mjs";
import { runChecks, checksState, markClashesSeen } from "./checks.mjs";

// The in-app update installs the EXACT newest version (not the `latest` tag, which
// npm's cache/propagation can resolve stale — that caused an update loop where the
// install kept re-fetching the same old version). --prefer-online skips a stale
// cached packument.
function updateCmd(latest, current, platform = process.platform) {
  const target = latest && semverGt(latest, current) ? latest : "latest";
  return { target, cmd: (platform === "win32" ? "npm i -g " : "npm install -g ") + "symbiot@" + target + " --prefer-online" };
}
// npm lists a new version minutes before its download is there: 1 to 5 minutes for
// most releases, 11 for 0.59.0 (~/.symbiot/agent.log, 0.52.0 to 0.63.3). Five tries 30s
// apart gave up on 0.59.0, 0.62.0 and 0.63.3 and sent you to a terminal. So the update
// looks for the download itself before it runs npm, and keeps looking (and trying
// again on a 404) for up to 20 minutes. Only a 404 waits: anything else (offline, say)
// goes on to npm, whose own error says what's wrong.
const UPDATE_EVERY = Number(process.env.SYMBIOT_UPDATE_EVERY) || 30000, UPDATE_WAIT = 20 * 60 * 1000;
// The version installed where this app runs from, and whether to restart onto it:
// newer than this one, and the same on the last look too.
const OWN_PKG = fileURLToPath(new URL("./package.json", import.meta.url));
function installedVersion(file = OWN_PKG) { try { return String(JSON.parse(readFileSync(file, "utf8")).version || ""); } catch { return ""; } }
const restartOnto = (seen, now, running = VERSION) => !!now && now === seen && semverGt(now, running);
async function downloadReady(version, registry = REGISTRY, fetchFn = fetch) {
  if (!/^\d+\.\d+\.\d+/.test(String(version))) return true; // "latest": npm picks it, nothing to look at
  try { return (await fetchFn(`${registry}/symbiot/-/symbiot-${encodeURIComponent(version)}.tgz`, { method: "HEAD", signal: AbortSignal.timeout(10000) })).status !== 404; } catch { return true; }
}
// Symbiot updates itself: a release waited for a click on Update & restart, so it
// landed when someone found the card, hours later or not at all. Now, once the new
// version's download is there and nothing would be cut off by the restart (no agent
// running, in any lane, since a check a while ago; no sign-in going in the Symbiot
// Browser; Away not open), it installs and restarts as the click does. One that
// didn't go through isn't tried again by itself (the card says why, with Try again).
// Not in a sandbox or the desktop app; "autoUpdate": false in config.json turns it off
// (SYMBIOT_NO_AUTO_UPDATE=1 too: the tests' apps see a newer version on a fake registry).
// { go: true } or { why } (what it waits on: "busy" with what, in busy).
const AUTO_SETTLE = Number(process.env.SYMBIOT_AUTO_SETTLE) || 2 * 60 * 1000; // idle this long first: lanes start runs every 20s
function autoUpdateDue({ latest, version, sandbox, desktop, off, updating, failed, busy, idleSince, now = Date.now(), settle = AUTO_SETTLE }) {
  if (sandbox || desktop || off) return { why: "off" };
  if (!latest || !semverGt(latest, version)) return { why: "current" };
  if (updating) return { why: "updating" };
  if (failed && failed.target === latest) return { why: "failed" };
  if (busy) return { why: "busy", busy };
  if (!idleSince || now - idleSince < settle) return { why: "settling" };
  return { go: true };
}
// What a restart would cut off right now, in words, or "".
function restartWouldStop({ handoffs = HANDOFFS, paths = [], running = runningHandoff, browser = windowOpen, away = awayOpen, ships = shippingPaths } = {}) {
  const runs = new Set(handoffs.filter((x) => x.status === "running" && x.name !== "symbiot update").map((x) => x.path));
  for (const p of paths) { try { if (running(p)) runs.add(p); } catch {} }
  if (runs.size) return runs.size === 1 ? "an agent is working" : `${runs.size} agents are working`;
  try { if (ships().length) return "an Approve is still shipping"; } catch {} // a relaunch mid-ship lost its bookkeeping: tasks stayed in review with a clean tree (15 Oct 2026)
  try { if (browser()) return "the Symbiot Browser is open"; } catch {}
  try { if (away()) return "Away is open"; } catch {}
  return "";
}
// This update's own lines in agent.log (an earlier run's 404 isn't this one's), and
// the line that says what went wrong.
function updateOutcome(log) {
  const mine = String(log || "").slice(String(log || "").lastIndexOf("=== symbiot update"));
  const why = (mine.match(/npm (?:error|ERR!) (?!code\b|syscall\b|errno\b|path\b|dest\b|404\s*$|A complete log)([^\n]+)/m) || [])[1] || "";
  return { notYet: /E404|ETARGET|notarget|No matching version|is not in this registry/i.test(mine), why: why.trim().slice(0, 200) };
}

// An update npm finished, yet Symbiot came back on its old version: why, as far as can be
// told. npm put it somewhere else than this Symbiot runs from (another prefix: a second
// node, or sudo's), or the files here didn't change.
function installedElsewhere(target, { here = fileURLToPath(new URL(".", import.meta.url)), root = () => spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["root", "-g"], { encoding: "utf8", timeout: 15000 }).stdout } = {}) {
  const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  let r = ""; try { r = String(root() || "").trim(); } catch {}
  const mine = real(here).replace(/[\\/]+$/, "");
  if (r && real(join(r, "symbiot")) !== mine) return `npm installed ${target} in ${join(r, "symbiot")}, but this Symbiot runs from ${mine}. Update the one that runs (or start Symbiot from the new one)`;
  return `npm said it installed ${target}, but Symbiot restarted on ${VERSION} from the same files (${mine})`;
}

// What Approve writes in a release's notes: your AI's words, and what's yours alone
// (your lanes, people, accounts, providers: outward.mjs), which stays out of them,
// and is checked in a CHANGELOG.md an agent wrote by hand too.
async function notesFor(repo, opts) {
  let deny = []; try { deny = await denyList(repo); } catch {}
  const input = releaseInput(repo, opts);
  return { notes: input ? await releaseNotes({ ...input, deny }) : null, deny };
}
// ---- what's new: the changelog's releases between two versions -------------------
// CHANGELOG.md's "## 0.45.0 — 2026-10-06" sections newer than `from` and up to
// `to`, newest first: [{ version, date, items }]. It ships with Symbiot, so after an
// update the app shows once what came with it (config.seenVersion is the version
// you last saw it for). Before an update, the new version's own CHANGELOG.md is
// read from its package on npm (registryChangelog).

// A folder's lane as people say it: the repo (or Marketing) it is, else "" (an ops run).
function laneOfFolder(path) {
  if (path === MARKETING_DIR) return "Marketing";
  let map = {}; try { map = laneMap() || {}; } catch {}
  const n = Object.keys(map).find((k) => map[k] === path);
  return n ? (n === MARKETING ? "Marketing" : displayName(path, n)) : "";
}
const CHANGELOG = fileURLToPath(new URL("./CHANGELOG.md", import.meta.url));
function changesSince(md, from, to) {
  const out = [];
  for (const part of String(md || "").split(/^## /m).slice(1)) {
    const m = part.match(/^\[?v?(\d+\.\d+\.\d+)\]?(?:\s*[—–-]\s*(\d{4}-\d{2}-\d{2}))?/); if (!m) continue;
    if ((from && !semverGt(m[1], from)) || (to && semverGt(m[1], to))) continue;
    out.push({ version: m[1], date: m[2] || "", items: part.split("\n").filter((l) => /^[-*]\s+/.test(l)).map((l) => l.replace(/^[-*]\s+/, "").trim()).slice(0, 30) });
  }
  return out.slice(0, 15);
}
// A headless browser: an agent or a test looking at the page, not someone using it.
const headlessAgent = (ua) => /Headless/i.test(String(ua || ""));
const localChangelog = () => { try { return readFileSync(CHANGELOG, "utf8"); } catch { return ""; } };
// After an update: what's new since the version you last saw it for. The first
// time (no seenVersion yet) that's just this version's own release.
function whatsNew(cfg = loadConfig(), md = localChangelog()) {
  const seen = typeof cfg.seenVersion === "string" ? cfg.seenVersion : "";
  if (seen && !semverGt(VERSION, seen)) return { version: VERSION, changes: [] };
  const all = changesSince(md, "", VERSION);
  return { version: VERSION, changes: seen ? changesSince(md, seen, VERSION) : all.slice(0, 1) };
}
// A file in a package tarball (.tgz: gzip, then tar's 512-byte headers, each
// followed by its file's bytes), "" if it isn't there.
function tarFile(tgz, name) {
  let buf; try { buf = gunzipSync(tgz); } catch { return ""; }
  const str = (a, b, at) => buf.subarray(at + a, at + b).toString("utf8").replace(/\0[\s\S]*$/, "");
  for (let at = 0; at + 512 <= buf.length;) {
    if (!buf[at]) break;
    const size = parseInt(str(124, 136, at).trim() || "0", 8) || 0, pre = str(345, 500, at), path = (pre ? pre + "/" : "") + str(0, 100, at);
    if (path === name) return buf.subarray(at + 512, at + 512 + size).toString("utf8");
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return "";
}
// The new version's CHANGELOG.md, from its package on npm (kept once found).
const REGISTRY_LOGS = new Map();
async function registryChangelog(version, registry = REGISTRY) {
  if (REGISTRY_LOGS.has(version)) return REGISTRY_LOGS.get(version);
  let md = "";
  try {
    const r = await fetch(`${registry}/symbiot/-/symbiot-${encodeURIComponent(version)}.tgz`, { signal: AbortSignal.timeout(15000) });
    if (r.ok) md = tarFile(Buffer.from(await r.arrayBuffer()), "package/CHANGELOG.md");
  } catch {}
  if (md) REGISTRY_LOGS.set(version, md);
  return md;
}

// ---- `symbiot app` : the same UI in a chrome-less browser window ----------
// Self-contained HTML served at / — no backticks or ${} inside (it lives in a
// template literal). Talks to the local API with the per-launch token.

// Screenshots dropped into the talk: data: URLs of PNG, JPEG, WebP or GIF, up to 4 of
// 8 MB each, saved under Symbiot's config (uploads/, readable by you only, kept a week), so the
// model can see them and an agent can open them. Returns their paths.
const UPLOADS = join(CONFIG_DIR, "uploads");
function saveShots(list) {
  const out = [];
  try { for (const f of readdirSync(UPLOADS)) { const fp = join(UPLOADS, f); if (Date.now() - statSync(fp).mtimeMs > 7 * 86400000) unlinkSync(fp); } } catch {} // kept a week
  for (const it of (Array.isArray(list) ? list : []).slice(0, 4)) {
    const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String((it && it.data) || ""));
    if (!m) continue;
    const buf = Buffer.from(m[2], "base64"); if (!buf.length || buf.length > 8 * 1024 * 1024) continue;
    try { mkdirSync(UPLOADS, { recursive: true, mode: 0o700 }); const f = join(UPLOADS, `${Date.now()}-${randomBytes(3).toString("hex")}.${m[1] === "jpeg" ? "jpg" : m[1]}`); writeFileSync(f, buf, { mode: 0o600 }); out.push(f); } catch {}
  }
  return out;
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = ""; req.on("data", (ch) => (d += ch));
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}
// A body as it came (a file the page sends), up to max bytes: a Buffer, or null when it's bigger.
const POST_MEDIA_MAX = 500 * 1024 * 1024;
function readBytes(req, max) {
  return new Promise((resolve) => {
    const parts = []; let n = 0, over = false;
    req.on("data", (ch) => { if (over) return; n += ch.length; if (n > max) { over = true; parts.length = 0; return; } parts.push(ch); });
    req.on("end", () => resolve(over ? null : Buffer.concat(parts)));
    req.on("error", () => resolve(null));
  });
}
// http://127.0.0.1:<port>/?t=<token> -> symbiot://127.0.0.1:<port>/?t=<token>, for the Android app
function appLink(url) { return url.replace(/^http:\/\//, "symbiot://"); }
// Symbiot running in Termux (not the Android app's own)
const IN_TERMUX = process.platform === "android" && process.env.SYMBIOT_ANDROID_APP !== "1";
const SANDBOX = !!process.env.SYMBIOT_SANDBOX;
// the installed app (symbiot-desktop): it updates itself and made its own shortcuts
const DESKTOP = process.env.SYMBIOT_DESKTOP === "1"; // symbiot app --fresh (sandbox.mjs)
// the licence as Settings shows it: the plan, and Free's 3 projects
function licenceView() { const st = licenceState(); const L = loadConfig().licence || {}; return { ...st, projects: (L.projects || []).map((p) => ({ path: p, name: p.split(/[\\/]/).pop() })), free: FREE }; } // symbiot app --fresh (sandbox.mjs)
const FIRST_RUN = !existsSync(CONFIG_PATH); // no config yet when Symbiot started: a brand-new install
function openApp(url) {
  try {
    // Android (Termux): Symbiot's Android app shows this Symbiot full screen (it
    // can't read Termux's home, this one can), so the link goes to it first, as a
    // symbiot:// link: only that app takes those, where Android gives an http one
    // to the browser. Without the app, `am` can't resolve it, and the URL goes to
    // the phone's browser: termux-open-url ships with Termux, `am start` is the fallback.
    if (process.platform === "android") {
      if (hasCmd("am")) {
        const r = spawnSync("am", ["start", "-a", "android.intent.action.VIEW", "-d", appLink(url)], { encoding: "utf8", timeout: 8000 });
        if (r.status === 0 && !/error|unable|exception/i.test(`${r.stdout || ""}${r.stderr || ""}`)) return "Symbiot app window";
      }
      if (hasCmd("termux-open-url")) spawn("termux-open-url", [url], { detached: true, stdio: "ignore" }).unref();
      else spawn("am", ["start", "-a", "android.intent.action.VIEW", "-d", url], { detached: true, stdio: "ignore" }).unref();
      return "browser tab";
    }
    const chrome = chromeBinary();
    if (chrome) { spawn(chrome, [`--app=${url}`, "--new-window", "--start-maximized", "--no-first-run", "--no-default-browser-check"], { detached: true, stdio: "ignore" }).unref(); return "app window"; }
    // fall back to the OS default browser (a normal tab) — still fully functional
    if (process.platform === "win32") { spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref(); return "browser tab"; }
    spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    return "browser tab";
  } catch { return null; }
}
// What the `symbiot app` already serving on this computer says at /api/<path>,
// or null when none answers. Knows the app's port and token, so a caller (a
// tray, a script, startApp's single-instance check) doesn't have to.
async function askRunningApp(path, { port, token, ms = 800 } = {}) {
  const cfg = loadConfig(); token = token || cfg.appToken; if (!token) return null;
  port = port || Number(process.env.SYMBIOT_PORT || cfg.appPort) || 7391;
  const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/${path}`, { headers: { "x-symbiot-token": token }, signal: ctrl.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(to); }
}
// True when a `symbiot app` is running with the weekly write-up on, so it
// writes the week (and notifies) itself and nothing else needs to.
async function isAppRunningWeekly() { const d = await askRunningApp("desktop"); return !!(d && d.weekly && d.weekly.on); }
// How long the app keeps Screens' hidden browser open after an action.
const BROWSER_KEEP = 5 * 60 * 1000;
const PLAIN_COLOURS = { g: (s) => s, d: (s) => s, b: (s) => s, y: (s) => s };
// Start the app (or open the one already running). bin: the CLI's own file,
// for start at login; since / all: what Week covers (--since, --all); c: the
// CLI's colours for what it prints.
async function startApp({ bin, since = 7, all = false, c = PLAIN_COLOURS } = {}) {
  const writeup = (cmd) => produce(cmd, { since, all });
  const SERVER_STARTED = Date.now();
  // a brand-new Symbiot (no config yet) walks you through setup first (home.mjs onboarding)
  // ...and so does `app --fresh` (sandbox.mjs), made to walk first run as someone new would: it went
  // straight to Home, so setup could never be reviewed there (19 Oct 2026). Other sandboxes (the tests') don't.
  const FRESH = (!SANDBOX || !!process.env.SYMBIOT_FIRST_RUN) && !existsSync(CONFIG_PATH);
  // Stable token + port so the URL survives a restart — the open tab can
  // reconnect and auto-reload itself instead of you closing and reopening it.
  try { moveSecrets(); } catch {} // keys from before secrets.json: out of config.json, where a run could read them
  // a word taken for a password ("Symbiot's"): back where it was, out of the vault, a file at a time (vault.mjs);
  // then a secret the chat kept before the detector knew its shape: vaulted, and blanked where it was stored
  if (!SANDBOX) Promise.resolve().then(() => repairFalseSaves({ soon: true })).catch(() => {}).then(() => { try { scrubStored(); } catch {} });
  const cfg0 = loadConfig();
  let TOKEN = cfg0.appToken;
  if (!TOKEN) { TOKEN = randomBytes(16).toString("hex"); try { saveConfig({ ...loadConfig(), appToken: TOKEN }); } catch {} }
  const PORT = Number(process.env.SYMBIOT_PORT || cfg0.appPort) || 7391;
  // Single instance: if a Symbiot app is already serving this port, don't start
  // a second one (multiple instances race the config and split the open tabs) —
  // just open the one that's running. SYMBIOT_FORCE_NEW overrides (e.g. tests).
  // Not when "Update & restart" relaunched us (SYMBIOT_RELAUNCH): the old app is
  // handing this port over and its window is still open, so finding it here would
  // open a second window and exit, leaving nothing serving either window.
  const RELAUNCH = process.env.SYMBIOT_RELAUNCH === "1"; delete process.env.SYMBIOT_RELAUNCH;
  // The lock first (core.mjs takeAppLock): an app that holds it is running, answering or
  // not. A busy one is waited on for longer, and if it still doesn't answer, its window
  // is opened anyway (it reconnects once the app is free) rather than starting a second.
  if (!process.env.SYMBIOT_FORCE_NEW) {
    const h = takeAppLock(PORT, { takeOver: RELAUNCH });
    if (h) {
      const p = await askRunningApp("ping", { port: PORT, token: TOKEN, ms: 10000 });
      const url = `http://127.0.0.1:${PORT}/?t=${TOKEN}`, how = process.env.SYMBIOT_NO_OPEN === "1" ? "" : openApp(url);
      console.log(`\n${c.g("●")} ${c.b("Symbiot")} is already running (${p && p.version ? "v" + p.version : "pid " + h.pid + ", busy right now"}) at ${c.b(url.split("?")[0])}`); // never the token: this goes to app.log and the journal (15 Oct 2026)
      console.log(how ? c.d(`  Opened the existing window (${/^[aeiou]/.test(how) ? "an" : "a"} ${how}).`) : c.d("  Open it with:  symbiot open"));
      console.log(c.d("  (Not starting a second copy. Set SYMBIOT_FORCE_NEW=1 to force one.)"));
      return;
    }
    process.on("exit", releaseAppLock);
  }
  // Node ends the app on an error nothing caught (an unhandled rejection too, since
  // Node 15), and every agent it was watching lost its exit bookkeeping. One slip in a
  // background timer isn't worth that: it's logged (~/.config/symbiot/crash.log) and the
  // app carries on, unless they keep coming (more than 20 in a minute: then it's broken).
  const slips = [];
  const slip = (kind) => (err) => {
    const now = Date.now(); slips.push(now); while (slips.length && now - slips[0] > 60000) slips.shift();
    const line = `${new Date(now).toISOString()} ${kind}: ${(err && err.stack) || err}\n`;
    try { process.stderr.write("symbiot: " + line); } catch {}
    try { mkdirSync(CONFIG_DIR, { recursive: true }); appendFileSync(join(CONFIG_DIR, "crash.log"), line); } catch {}
    if (slips.length > 20) process.exit(1);
  };
  process.on("uncaughtException", slip("uncaught"));
  process.on("unhandledRejection", slip("unhandled rejection"));
  if (!process.env.SYMBIOT_FORCE_NEW && !RELAUNCH) {
    const p = await askRunningApp("ping", { port: PORT, token: TOKEN });
    if (p && p.version) {
      releaseAppLock(); // a Symbiot from before the lock
      setBrowserHub(`http://127.0.0.1:${PORT}/browser?t=${TOKEN}`);
      const url = `http://127.0.0.1:${PORT}/?t=${TOKEN}`; const how = process.env.SYMBIOT_NO_OPEN === "1" ? "" : openApp(url);
      console.log(`\n${c.g("●")} ${c.b("Symbiot")} is already running (v${p.version}) at ${c.b(url.split("?")[0])}`);
      console.log(how ? c.d(`  Opened the existing window (${/^[aeiou]/.test(how) ? "an" : "a"} ${how}).`) : c.d("  Open it with:  symbiot open"));
      console.log(c.d("  (Not starting a second copy. Set SYMBIOT_FORCE_NEW=1 to force one.)"));
      return;
    }
  }
  // Screens' hidden browser stays open between map, press and type (headless.mjs),
  // so an agent can type into a field and then press a separate button there.
  keepBrowserOpen(BROWSER_KEEP);
  const json = (res, obj) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  // The big answers the page polls (agents, lanes, home, work) carry an ETag: the browser
  // sends it back, and when nothing changed gets a 304 (no body to send, parse or draw) (15 Oct 2026)
  const jsonTag = (req, res, obj) => { const body = JSON.stringify(obj), tag = `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`; if (req.headers["if-none-match"] === tag) { res.writeHead(304, { etag: tag }); res.end(); return; } res.writeHead(200, { "content-type": "application/json", etag: tag, "cache-control": "no-cache" }); res.end(body); };
  // The page, once: gzip'd (605 KB -> ~177 KB on the wire) with a strong ETag, so a window
  // that has it (it reloads itself after every update and restart) gets a 304 (15 Oct 2026)
  const PAGE = Buffer.from(EMBEDDED_UI), PAGE_GZ = gzipSync(PAGE), PAGE_TAG = `"${createHash("sha1").update(PAGE).digest("hex").slice(0, 20)}"`;
  const screenOut =(s) => (s && s.id ? { ...s, blueprint: blueprint(s), ...(s.page ? { trusted: isTrusted(s.page.url) } : {}) } : s && s.screens ? { ...s, screens: s.screens.map(screenOut) } : s);
  // an installed Symbiot keeps its app-menu entry pointing at itself (a new Node, a moved
  // install); not a copy run from a checkout or a test
  if (/[\\/]node_modules[\\/]symbiot[\\/]/.test(bin || "") && !SANDBOX && !process.env.SYMBIOT_NO_LAUNCHER) { try { installLauncher({ script: bin }); } catch {} }
  // Away's Super+` on COSMIC, which was only ever set by `symbiot away --shortcut`
  if (/[\\/]node_modules[\\/]symbiot[\\/]/.test(bin || "") && !SANDBOX && !process.env.SYMBIOT_NO_LAUNCHER) { import("./away.mjs").then((a) => a.ensureShortcut({ cmd: `${process.execPath} ${bin} away` })).catch(() => {}); }
  // setup's north star: "Your computer" in the Android app, so a phone paired by its QR shows it
  if (FRESH) { try { startOnboarding(); } catch {} }
  try { phoneSetupFirst(); } catch {} // the phone app, over an older one: setup goes to "Your computer" first
  // your projects: kept, and found again off the main thread, so nothing waits on a search
  setScanOptions({ cache: true }); REPO_STATE.onChange = () => { try { homeState({ fresh: true }); } catch {} };
  if (!SANDBOX) { refreshRevoked().catch(() => {}); setInterval(() => refreshRevoked().catch(() => {}), 6 * 3600 * 1000).unref(); } // cancelled Pro keys, about daily
  { const t0 = Date.now(); refreshRepos().then((l) => console.log(`Found ${l.length} project${l.length === 1 ? "" : "s"} in ${((Date.now() - t0) / 1000).toFixed(1)}s.`)); }
  let UPDATING = null; // an update in flight: { target, attempt, since, retrying? }
  let UPDATE_FAILED = null; // the last one that didn't go through: { target, error, at }
  // An update, from Update & restart: install the exact newest version (updateCmd), then
  // relaunch this same app (same port and token, so the same address) and exit; the page's
  // heartbeat reconnects and reloads. Free the port first and mark the new copy as a
  // relaunch, so it takes over instead of finding us and bowing out. SYMBIOT_UPDATE_CMD
  // replaces the install (the tests use a no-op). Not downloadable yet (downloadReady): it
  // looks again every 30s for up to 20 minutes, and says so. Where it's got to is kept on
  // disk too (UPDATE_STATE): waiting for npm's download lived only in memory, the app
  // restarted while it waited for 0.63.9's, npm never ran, and the page took the restart on
  // the old version for an install that "didn't take" (2026-10-12). So a restart carries on
  // (resumeUpdate), and one that installed but came back on the old version says why.
  const UPDATE_STATE = join(CONFIG_DIR, "update.json");
  const noteUpdate = (o) => { try { if (o) { writeJsonAtomic(UPDATE_STATE, o, { indent: 0 }); } else if (existsSync(UPDATE_STATE)) unlinkSync(UPDATE_STATE); } catch {} };
  function startUpdate({ since = Date.now(), latest = LATEST_VERSION, auto = false, retrying = false } = {}) {
    const { target, cmd } = updateCmd(latest, VERSION);
    const inst = process.env.SYMBIOT_UPDATE_CMD || cmd, note = (state, more = {}) => noteUpdate({ target, from: VERSION, since, state, at: Date.now(), ...more });
    const failed = (error) => { UPDATING = null; UPDATE_FAILED = { target, error, at: Date.now() }; note("failed", { error }); return null; };
    const again = (n, error) => {
      if (Date.now() - since + UPDATE_EVERY > UPDATE_WAIT) return failed(error);
      UPDATING = { target, retrying: true, attempt: n + 1, since, at: Date.now() }; note("waiting", { retrying: true });
      setTimeout(() => attempt(n + 1), UPDATE_EVERY).unref(); return null;
    };
    const attempt = async (n) => {
      if (!(await downloadReady(target))) return again(n, `npm lists ${target}, but its download still wasn't there after 20 minutes.`);
      note("installing");
      const e = track("symbiot update", inst, homedir(), (code) => {
        if (code !== 0) {
          const o = updateOutcome(readRunLog(join(homedir(), ".symbiot", "agent.log")).slice(-6000));
          if (o.notYet) again(n, o.why || `npm couldn't find ${target}'s download.`);
          else failed(o.why || `npm stopped (exit code ${code}).`);
          return;
        }
        note("installed");
        // on the port it was serving: one that took another (Termux's Symbiot holds 7391 on a phone)
        // relaunched on 7391, found it busy and exited, so nothing served the app's window (FINE-TUNE item 3)
        // updating by itself, and an agent started while npm ran: the restart waits for it
        if (!auto || !workGoing()) return relaunch();
        UPDATING = { ...UPDATING, installed: true, waitFor: workGoing(), at: Date.now() };
        const w = setInterval(() => { const b = workGoing(); if (b) { UPDATING = { ...UPDATING, waitFor: b }; return; } clearInterval(w); relaunch(); }, 30000); w.unref();
      });
      if (!e) failed("Symbiot couldn't start npm.");
      return e;
    };
    // resumed after a restart that came while it waited for npm's download: it still is, so the
    // page says so straight away, not only once the first look comes back (CI caught it between)
    const r = retrying ? { retrying: true } : {};
    UPDATING = { target, ...r, attempt: 1, since, at: Date.now(), ...(auto ? { auto: true } : {}) }; UPDATE_FAILED = null; note("waiting", r);
    return attempt(1).then((e) => ({ e, target }));
  }
  // At start: an update this app (or the one before it) was on. On its version now, it's
  // done. Still waiting or installing (restarted meanwhile): carried on, within its 20
  // minutes. Installed, yet this is the old version: what went wrong, not another try.
  function resumeUpdate() {
    let u = null; try { u = JSON.parse(readFileSync(UPDATE_STATE, "utf8")); } catch {}
    if (!u || SANDBOX || DESKTOP) return;
    if (!/^\d+\.\d+\.\d+/.test(String(u.target)) || !semverGt(u.target, VERSION)) return noteUpdate(null);
    if (u.state === "failed") { UPDATE_FAILED = { target: u.target, error: u.error || "npm stopped", at: u.at }; return; }
    if (u.state === "installed") {
      const error = installedElsewhere(u.target);
      UPDATE_FAILED = { target: u.target, error, at: Date.now() }; noteUpdate({ ...u, state: "failed", error, at: Date.now() }); return;
    }
    if (Date.now() - (Number(u.since) || 0) < UPDATE_WAIT) { startUpdate({ since: Number(u.since), latest: u.target, retrying: !!u.retrying }).catch(() => {}); return; }
    const error = `Symbiot restarted while it waited for npm's download of ${u.target}, and gave up after 20 minutes`;
    UPDATE_FAILED = { target: u.target, error, at: Date.now() }; noteUpdate({ ...u, state: "failed", error, at: Date.now() });
  }
  const workGoing = () => { let paths = []; try { paths = Object.values(laneMap() || {}); } catch {} try { const d = join(CONFIG_DIR, "drafts"); paths.push(...readdirSync(d).filter((x) => x.startsWith("act-")).map((x) => join(d, x))); } catch {} return restartWouldStop({ paths }); };
  let IDLE_SINCE = 0, AUTO = { why: "current" }; // since when nothing would be cut off; what the self-update waits on
  async function autoUpdateTick() {
    const busy = workGoing(); IDLE_SINCE = busy ? 0 : IDLE_SINCE || Date.now();
    AUTO = autoUpdateDue({ latest: LATEST_VERSION, version: VERSION, sandbox: SANDBOX, desktop: DESKTOP, off: loadConfig().autoUpdate === false || process.env.SYMBIOT_NO_AUTO_UPDATE === "1", updating: UPDATING, failed: UPDATE_FAILED, busy, idleSince: IDLE_SINCE });
    if (!AUTO.go) return;
    const { target } = updateCmd(LATEST_VERSION, VERSION);
    if (!(await downloadReady(target))) { AUTO = { why: "download" }; return; } // npm lists it before its download is there: the next tick looks again
    if (UPDATING || workGoing()) return;
    console.log(`Updating to ${target} by itself: no agent is working.`);
    startUpdate({ auto: true }).catch(() => {});
  }
  let HUB_SEEN = 0; // when the Symbiot Browser's own page last asked for the sites (browser.html)
  onBrowserClosed(() => { sitesCheck(); }); // its last window closed by its X: checked, as Done does
  let NEWEST_WIN = ""; // the Symbiot window opened last: older ones close themselves (one window, not a pile)
  process.on("exit", () => closeAway()); // Away's windows go with the app (a quit, an update's restart)
  const server = createServer(async (req, res) => {
    const t0 = Date.now(); res.on("finish", () => { const ms = Date.now() - t0; if (ms > 1500) console.log(`slow: ${String(req.url || "").split("?")[0]} took ${(ms / 1000).toFixed(1)}s`); if (req.method === "POST" && !/^\/api\/screens\//.test(String(req.url || ""))) { try { forgetWork(); } catch {} } }); // something you did: the next work scene is built afresh, not the kept one (an agent reading or pressing a page through Screens changes no work: a POST every few seconds kept the scene from ever being kept)
    const u = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && u.pathname === "/") {
      if (req.headers["if-none-match"] === PAGE_TAG) { res.writeHead(304, { etag: PAGE_TAG }); res.end(); return; }
      const gz = /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", etag: PAGE_TAG, "cache-control": "no-cache", vary: "accept-encoding", ...(gz ? { "content-encoding": "gzip" } : {}) }); res.end(gz ? PAGE_GZ : PAGE); return;
    }
    // the Symbiot Browser's own page (headless.mjs openSymbiotBrowser): like /, it gets its token in ?t=
    if (req.method === "GET" && u.pathname === "/browser") { try { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(readFileSync(new URL("./browser.html", import.meta.url))); } catch { res.writeHead(404); res.end(); } return; }
    // the app's typeface ships in the package (fonts/), so it's there offline
    // the window's own icon (its taskbar entry), the same orb as the app menu's
    if (req.method === "GET" && (u.pathname === "/favicon.svg" || u.pathname === "/favicon.ico")) {
      try { const b = iconSvg(u.searchParams.get("look") || loadConfig().look || "ferro", { small: u.searchParams.get("small") === "1" }); res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-cache" }); res.end(b); }
      catch { res.writeHead(404); res.end(); }
      return;
    }
    if (req.method === "GET" && u.pathname === "/fonts/Geist-Variable.woff2") {
      try { const b = readFileSync(fileURLToPath(new URL("./fonts/Geist-Variable.woff2", import.meta.url))); res.writeHead(200, { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable" }); res.end(b); }
      catch { res.writeHead(404); res.end(); }
      return;
    }
    if (u.pathname.startsWith("/api/")) {
      const tok = req.headers["x-symbiot-token"] || u.searchParams.get("t");
      if (tok !== TOKEN) { res.writeHead(403); res.end("forbidden"); return; }
    }
    try {
      if (u.pathname === "/api/status") { const r = resolveProvider(); return json(res, r ? { connected: true, provider: r.provider, line: `${PROVIDERS[r.provider].label}${r.model ? " · " + r.model : ""}` } : { connected: false }); }
      if (u.pathname === "/api/quota") { let paths = []; try { paths = Object.values(laneMap() || {}); } catch {} return json(res, quotaState({ providers: PROVIDERS, current: resolveProvider(), paths })); } // the AI usage meter (quota.mjs)
      if (u.pathname === "/api/map") return json(res, await mapNow({ fresh: u.searchParams.get("fresh") === "1" })); // local git only — no AI key needed; the last Map at once, Rescan (fresh=1) waits for a new one
      if (u.pathname === "/api/scan") return json(res, { active: SCAN.active, phase: SCAN.phase, done: SCAN.done, total: SCAN.total, item: SCAN.item, elapsed: SCAN.startedAt ? Date.now() - SCAN.startedAt : 0, timeout: SCAN_TIMEOUT_MS, partial: SCAN.partial });
      if (u.pathname === "/api/models") { const hw = detectHardware(); return json(res, { hardware: hw, rec: recommendModels(hw) }); }
      if (u.pathname === "/api/drift") return json(res, computeDrift({ ci: u.searchParams.get("ci") === "1", fetch: u.searchParams.get("fetch") === "1" }));
      if (u.pathname === "/api/node") return json(res, await nodeDetail(u.searchParams.get("id") || "")); // local
      if (u.pathname === "/api/suggest" && req.method === "POST") { const b = await readBody(req); const p = String(b.path || ""); const isRepo = p && existsSync(join(p, ".git")); return json(res, await (isRepo ? repoSuggest(p) : folderSuggest(p))); }
      if (u.pathname === "/api/review" && req.method === "POST") { const b = await readBody(req); return json(res, await repoReview(String(b.path || ""))); }
      if (u.pathname === "/api/tasks" && req.method !== "POST") { const arch = u.searchParams.get("archived") === "1"; return json(res, [...loadTasks().filter((x) => !!x.archived === arch), ...(arch ? archivedTasks() : [])].map((t) => ({ ...t, type: taskType(t.text) }))); } // the Archive: tasks.json's archived, then what the sweep moved out (sweep.mjs)
      if (u.pathname === "/api/tasks/add" && req.method === "POST") { const b = await readBody(req), t = addTask(b.text, b.repo); if (t && t.id && !t.error) { try { openGoal(b.text, { child: "task:" + t.id, lane: b.repo || "", path: (laneMap() || {})[b.repo] || "" }); } catch {} } return json(res, t); } // a task the user adds is a goal, followed to its end (goals.mjs)
      if (u.pathname === "/api/tasks/toggle" && req.method === "POST") { const b = await readBody(req); return json(res, toggleTask(String(b.id || ""))); }
      if (u.pathname === "/api/tasks/model" && req.method === "POST") { const b = await readBody(req); return json(res, setTaskModel(String(b.id || ""), b.model)); }
      if (u.pathname === "/api/tasks/remove" && req.method === "POST") { const b = await readBody(req); return json(res, removeTask(String(b.id || ""))); }
      if (u.pathname === "/api/tasks/cancel" && req.method === "POST") { const b = await readBody(req); return json(res, cancelTask(String(b.id || ""))); }
      if (u.pathname === "/api/tasks/restore" && req.method === "POST") { const b = await readBody(req); return json(res, restoreTask(String(b.id || ""))); }
      if (u.pathname === "/api/tasks/sync" && req.method === "POST") return json(res, syncTasks());
      if (u.pathname === "/api/tasks/chat" && req.method === "POST") { const b = await readBody(req); return json(res, await taskChat(String(b.id || ""), b.question)); }
      if (u.pathname === "/api/tasks/chat/clear" && req.method === "POST") { const b = await readBody(req); return json(res, clearTaskChat(String(b.id || ""))); }
      if (u.pathname === "/api/pending") { // ticked by the agent, awaiting approval
        // what npm has decides the bump offer, and for a repo that publishes on
        // merge, what's unreleased: ask, then recount (answers are cached)
        // partly: what a run that stopped partway still waits on (its questions, a handover)
        const partly = (l) => l.map((r) => { const p = r.path ? partlyDone(r.path) : null; return p ? { ...r, partly: p } : r; });
        // kept: the Workdesk polls this every 4 s while a run is going, and asked git for every
        // repo each time (736 slow answers in a journal); Approve asks git itself (15 Oct 2026)
        const list = pendingReview({ kept: true }), ask = list.filter((r) => r.path && (!r.bumpOffer || r.publishesOnMerge)).map((r) => r.path);
        if (!ask.length) return json(res, partly(list));
        await learnNpm(ask); return json(res, partly(pendingReview({ kept: true })));
      }
      if (u.pathname === "/api/pending/diff") { const p = laneMap()[u.searchParams.get("repo") || ""]; return json(res, { diff: p ? workingDiff(p) : "" }); }
      if (u.pathname === "/api/tasks/live" && req.method === "POST") { const b = await readBody(req); return json(res, markLive(String(b.id || ""))); }
      if (u.pathname === "/api/pending/merge" && req.method === "POST") { const b = await readBody(req), path = laneMap()[String(b.repo || "")]; if (!path || !b.pr) return json(res, { error: "Say which repo and PR." }); { const m = await mergeWhenGreen(path, String(b.pr)); if (m.ok) { try { m.live = afterShip(path, String(b.repo), String(b.pr), "merged"); } catch {} } return json(res, m); } }
      if (u.pathname === "/api/pending/approve" && req.method === "POST") { const b = await readBody(req), repo = String(b.repo || ""); return json(res, await shipJob(repo, async () => { if (b.bump) await learnNpm([laneMap()[repo]]); const { notes, deny } = await notesFor(repo, { bump: b.bump }); return approveRepo(repo, { bump: b.bump, notes, deny, confirm: !!b.confirm, allowShared: !!b.allowShared }); })); }
      if (u.pathname === "/api/pending/approve-changes" && req.method === "POST") { const b = await readBody(req), repo = String(b.repo || ""); return json(res, await shipJob(repo, async () => { if (b.bump) await learnNpm([laneMap()[repo]]); const { notes, deny } = await notesFor(repo, { bump: b.bump, tick: b.tick }); return approveChanges(repo, { bump: b.bump, tick: b.tick, notes, deny, confirm: !!b.confirm, allowShared: !!b.allowShared }); })); }
      // an Approve that outlasted its request (shipJob): how it's going, then how it went
      if (u.pathname === "/api/pending/job") return json(res, shipJobOf(u.searchParams.get("repo") || ""));
      // approved work that didn't get as far as a PR: sent again (untested: without the tests here), or left
      if (u.pathname === "/api/pending/send" && req.method === "POST") { const b = await readBody(req); return json(res, await sendAgain(String(b.repo || ""), b.untested ? { verify: false } : {})); }
      if (u.pathname === "/api/pending/leave" && req.method === "POST") { const b = await readBody(req); return json(res, forgetUnsent(String(b.repo || ""))); }
      if (u.pathname === "/api/pending/sendback" && req.method === "POST") { const b = await readBody(req); return json(res, sendBack(String(b.id || ""))); }
      if (u.pathname === "/api/automerge" && req.method === "POST") { const b = await readBody(req); return json(res, setAutoMerge(String(b.repo || ""), !!b.on)); }
      if (u.pathname === "/api/tasks/push" && req.method === "POST") { const b = await readBody(req); return json(res, pushTasks(b)); }
      if (u.pathname === "/api/scanroots") { const st = reposState(); return json(res, { roots: loadConfig().scanRoots || [], effective: scanRoots(), home: scanHome(), searching: st.searching, searched: st.at || 0, found: st.list.length }); }
      if (u.pathname === "/api/scanroots/add" && req.method === "POST") { const b = await readBody(req); return json(res, addScanRoot(String(b.path || ""))); }
      if (u.pathname === "/api/scanroots/remove" && req.method === "POST") { const b = await readBody(req); return json(res, removeScanRoot(String(b.path || ""))); }
      // knowledge folders (knowledge.mjs): added or removed, the index catches up at once
      if (u.pathname === "/api/knowledge") return json(res, knowledgeState());
      if (u.pathname === "/api/knowledge/add" && req.method === "POST") { const b = await readBody(req), r = addKnowledgeFolder(String(b.path || ""), b.examples); if (r.error) return json(res, r); indexKnowledge(); return json(res, { ok: true, ...knowledgeState() }); }
      if (u.pathname === "/api/knowledge/remove" && req.method === "POST") { const b = await readBody(req), r = removeKnowledgeFolder(String(b.path || "")); if (r.error) return json(res, r); indexKnowledge(); try { runChecks(); } catch {} return json(res, { ok: true, ...knowledgeState() }); }
      if (u.pathname === "/api/knowledge/index" && req.method === "POST") { const r = indexKnowledge(); return json(res, { ...r, ...knowledgeState() }); }
      // where two of the folders' files disagree (checks.mjs): the last result, or checked again now
      if (u.pathname === "/api/knowledge/checks") return json(res, checksState());
      if (u.pathname === "/api/knowledge/checks/run" && req.method === "POST") return json(res, runChecks());
      // Home's "Where your files disagree" droplet, opened: its clashes reached you
      if (u.pathname === "/api/knowledge/checks/seen" && req.method === "POST") { const r = markClashesSeen(); try { homeState({ fresh: true }); } catch {} return json(res, r); }
      if (u.pathname === "/api/knowledge/search") return json(res, { hits: searchKnowledge(u.searchParams.get("q") || "", { examples: u.searchParams.get("examples") === "1" }) });
      if (u.pathname === "/api/agentcfg") { const d = detectHandoffs(); return json(res, { cmd: handoffCmd(), agents: d.agents, editors: d.editors, connectors: connectorsInfo() }); }
      if (u.pathname === "/api/agentcmd" && req.method === "POST") { const b = await readBody(req); return json(res, setHandoffCmd(b.cmd)); }
      if (u.pathname === "/api/agent/parallel") return json(res, { cap: laneCap(), setting: loadConfig().laneParallel || DEFAULT_CAP, max: 8 }); // how many agents may work in one lane at once (parallel.mjs)
      if (u.pathname === "/api/agent/parallel/set" && req.method === "POST") { const b = await readBody(req), n = Math.floor(Number(b.cap)), cfg = loadConfig(); if (Number.isFinite(n) && n >= 1) cfg.laneParallel = Math.min(8, n); else delete cfg.laneParallel; saveConfig(cfg); return json(res, { cap: laneCap(), setting: loadConfig().laneParallel || DEFAULT_CAP, max: 8 }); }
      if (u.pathname === "/api/agent/trust") return json(res, { full: trustFull(), sandbox: sandboxState() });
      if (u.pathname === "/api/agent/trust/set" && req.method === "POST") { const b = await readBody(req); const cfg = loadConfig(); if (b.full) delete cfg.agentTrust; else cfg.agentTrust = "ask"; saveConfig(cfg); return json(res, { full: trustFull(), sandbox: sandboxState() }); }
      if (u.pathname === "/api/agent/grant" && req.method === "POST") { const b = await readBody(req); return json(res, grantAgent({ tool: b.tool, dir: b.dir })); }
      if (u.pathname === "/api/open" && req.method === "POST") { const b = await readBody(req); const e = runHandoff(String(b.path || ""), { force: !!b.force }); return json(res, { opened: !!e && !e.busy && !e.blocked, busy: !!(e && e.busy), auto: !!(e && e.auto), blocked: !!(e && e.blocked), note: (e && e.note) || "", id: (e && e.id) || "" }); }
      if (u.pathname === "/api/setup-local" && req.method === "POST") {
        const b = await readBody(req);
        if (!hasOllama()) return json(res, { error: "not-installed", install: ollamaInstall() });
        const model = String(b.model || "") || recommendModels(detectHardware()).best;
        await ensureOllama();
        const e = track("ollama pull " + model, "ollama pull " + shSingle(model), homedir(), (code) => { if (code === 0) useOllamaModel(model); });
        return json(res, { started: true, model, id: e ? e.id : "" });
      }
      if (u.pathname === "/api/agents") { // handing: what it handed to other lanes, on the newest block per folder: where each stands, and how far the run on it has got
        const seen = new Set(), map = laneMap(), ledger = loadLedger(), list = agentsNow().map((a) => { let pj = ""; try { pj = projectOf(a.path, { map, ledger }); } catch {} a = { ...a, project: pj }; if (!a.path || seen.has(a.path)) return a; seen.add(a.path); let h = []; try { h = handingOf(a.path, { map, ledger }); } catch {} return h.length ? { ...a, handing: h } : a; });
        return jsonTag(req, res, await withReleases(list));
      }
      // the answer, saved in the folder that asked; it says which lane that is, so "Sent to …"
      // names where it went (a Marketing answer said "Sent to Paperclip Robin")
      if (u.pathname === "/api/agents/answer" && req.method === "POST") { const b = await readBody(req), path = String(b.path || ""), r = answerQuestions(path, b.answers, { rerun: !!b.rerun, share: true }); return json(res, r && r.ok ? { ...r, lane: laneOfFolder(path) } : r); }
      if (u.pathname === "/api/agents/skip" && req.method === "POST") { const b = await readBody(req); return json(res, skipIdea(String(b.path || ""), b.text)); }
      // What a run handed back (handback.mjs): facts for memory, kept only on Remember; replies it waits on.
      if (u.pathname === "/api/agents/remember" && req.method === "POST") { const b = await readBody(req); return json(res, b.skip === true ? skipFacts(String(b.path || "")) : keepFacts(String(b.path || ""), { only: Array.isArray(b.only) ? b.only.map(Number) : undefined })); }
      if (u.pathname === "/api/awaiting") return json(res, awaitingState());
      if (u.pathname === "/api/awaiting/stop" && req.method === "POST") { const b = await readBody(req); return json(res, stopWaiting(String(b.id || ""))); }
      if (u.pathname === "/api/mail") return json(res, mailState());
      if (u.pathname === "/api/mail/set" && req.method === "POST") { const b = await readBody(req); return json(res, setMail(b)); }
      if (u.pathname === "/api/mail/preview") { const items = sentMail(Number(u.searchParams.get("days")) || since, true); return json(res, { count: items.length, items: items.slice(0, 20) }); }
      // Screens: screenshots + named regions (screens.mjs). The image is an <img>
      // src, so it carries the token in the query (?t=), which the check above accepts.
      if (u.pathname === "/api/screens") return json(res, loadScreens().map(screenOut));
      if (u.pathname === "/api/screens/image") { const f = screenImage(u.searchParams.get("id")); if (!f) { res.writeHead(404); res.end("not found"); return; } res.writeHead(200, { "content-type": "image/png", "cache-control": "private, max-age=86400" }); res.end(readFileSync(f)); return; } // a screen's image never changes
      if (u.pathname === "/api/screens/capture" && req.method === "POST") { const b = await readBody(req); const d = Math.min(10, Math.max(0, Number(b.delay) || 0)); if (d) await new Promise((r) => setTimeout(r, d * 1000)); return json(res, screenOut(captureScreen(b.name, typeof b.which === "string" ? b.which : "all"))); }
      // The displays connected now (for "which display" next to Capture). macOS
      // can't take them all in one image (screencapture takes one display at a time).
      if (u.pathname === "/api/screens/monitors") return json(res, { monitors: listMonitors(), whole: process.platform !== "darwin" });
      if (u.pathname === "/api/screens/split" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(splitScreen(String(b.id || "")))); }
      // Changes a desktop permission, so only on the user's confirmed click.
      if (u.pathname === "/api/screens/allow" && req.method === "POST") { const b = await readBody(req); if (b.confirmed !== true) return json(res, { error: "Allowing screenshots needs your confirmation." }); return json(res, allowScreenshots()); }
      if (u.pathname === "/api/screens/import" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(importScreen(b.name, b.png))); }
      if (u.pathname === "/api/screens/regions" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(setRegions(String(b.id || ""), b.regions))); }
      if (u.pathname === "/api/screens/rename" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(renameScreen(String(b.id || ""), b.name))); }
      if (u.pathname === "/api/screens/remove" && req.method === "POST") { const b = await readBody(req); return json(res, removeScreen(String(b.id || ""))); }
      // A real click on the real screen: only with the user's confirmation, after
      // the delay they picked (to bring the right window to the front).
      if (u.pathname === "/api/screens/click" && req.method === "POST") { const b = await readBody(req); if (b.confirmed !== true) return json(res, { error: "Each click needs your confirmation." }); const d = Math.min(10, Math.max(0, Number(b.delay) || 0)); if (d) await new Promise((r) => setTimeout(r, d * 1000)); return json(res, clickRegion(String(b.id || ""), String(b.region || ""))); }
      // A web page in the hidden browser (headless.mjs): mapped by itself, no
      // screen needed. Press acts on the real site, signed in as you, so it's
      // confirmed like a click; Sign in opens a window the user signs in with.
      if (u.pathname === "/api/screens/map" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await mapPage(b.site, b.name, { whole: b.whole === true, who: String(b.who || "") }))); }
      // press / type: refused unless confirmed, or the page's site is one you trust
      if (u.pathname === "/api/screens/press" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await pressRegion(String(b.id || ""), String(b.region || ""), { confirmed: b.confirmed === true, noSend: b.noSend === true, who: String(b.who || "") }))); }
      // scroll and whole page: they only look, so they never ask
      if (u.pathname === "/api/screens/whole" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await wholePage(String(b.id || ""), { who: String(b.who || "") }))); }
      if (u.pathname === "/api/screens/scroll" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await scrollPage(String(b.id || ""), String(b.to || "down"), { who: String(b.who || "") }))); }
      if (u.pathname === "/api/screens/type" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await typeRegion(String(b.id || ""), String(b.region || ""), b.text, { enter: b.enter === true, confirmed: b.confirmed === true, noSend: b.noSend === true, who: String(b.who || "") }))); }
      // its own route, so an app from before it answers 404 instead of retyping the whole field
      if (u.pathname === "/api/screens/replace" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await typeRegion(String(b.id || ""), String(b.region || ""), b.text, { enter: b.enter === true, confirmed: b.confirmed === true, noSend: b.noSend === true, replace: String(b.replace == null ? "" : b.replace), who: String(b.who || "") }))); }
      // choose: an option in a menu (a <select>, or the site's own), asked like press and type
      if (u.pathname === "/api/screens/choose" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await chooseRegion(String(b.id || ""), String(b.region || ""), b.option, { confirmed: b.confirmed === true, who: String(b.who || "") }))); }
      if (u.pathname === "/api/screens/fill" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await fillForm(String(b.id || ""), Array.isArray(b.fields) ? b.fields.map((f) => ({ region: String(f.region || ""), text: f.text })) : [], { press: String(b.press || ""), confirmed: b.confirmed === true, noSend: b.noSend === true, who: String(b.who || "") }))); }
      if (u.pathname === "/api/screens/verify" && req.method === "POST") { const b = await readBody(req); return json(res, await verifyPage(String(b.url || ""), Array.isArray(b.expect) ? b.expect : [], { who: String(b.who || "") })); }
      // upload: a file of yours to the page's file box, asked like press and type
      if (u.pathname === "/api/screens/upload" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await uploadRegion(String(b.id || ""), String(b.region || ""), Array.isArray(b.files) ? b.files.map(String) : String(b.files || ""), { confirmed: b.confirmed === true, who: String(b.who || "") }))); }
      if (u.pathname === "/api/screens/trusted") return json(res, { sites: trustedSites() });
      if (u.pathname === "/api/screens/trusted/add" && req.method === "POST") { const b = await readBody(req); return json(res, trustSite(b.site)); }
      if (u.pathname === "/api/screens/trusted/remove" && req.method === "POST") { const b = await readBody(req); return json(res, untrustSite(b.site)); }
      // Saved secrets (vault.mjs): names and counts for Settings; an agent reads one by name, never a list of values.
      if (u.pathname === "/api/secrets" || u.pathname === "/api/secrets/list") return json(res, { secrets: listSecrets() });
      if (u.pathname === "/api/secrets/add" && req.method === "POST") { const b = await readBody(req); return json(res, saveSecret(String(b.name || ""), Array.isArray(b.values) ? b.values.slice(0, 50) : [])); }
      if (u.pathname === "/api/secrets/get" && req.method === "POST") { const b = await readBody(req); return json(res, getSecret(String(b.name || ""), { use: !!b.use })); }
      if (u.pathname === "/api/secrets/used" && req.method === "POST") { const b = await readBody(req); return json(res, markUsed(String(b.name || ""), String(b.value || ""))); }
      if (u.pathname === "/api/secrets/delete" && req.method === "POST") { const b = await readBody(req); return json(res, deleteSecret(String(b.name || ""))); }
      if (u.pathname === "/api/secrets/scrub" && req.method === "POST") { const r = scrubStored({ force: true }); return json(res, { found: r.found || [], files: (r.files || []).map((f) => f.replace(CONFIG_DIR + "/", "")) }); }
      if (u.pathname === "/api/screens/signin" && req.method === "POST") { const b = await readBody(req); return json(res, await signIn(b.site)); }
      // What Symbiot remembers across the app (mind.mjs), and forgetting it.
      if (u.pathname === "/api/mind") return json(res, mindState());
      if (u.pathname === "/api/mind/forget" && req.method === "POST") { const b = await readBody(req); return json(res, forget(String(b.id || ""))); }
      // Links (links.mjs): one click per standard work site: sign in, trust it, watch it.
      if (u.pathname === "/api/links") { if (u.searchParams.get("hub") === "1") HUB_SEEN = Date.now(); let reach = null; try { reach = linkReach(); } catch {} return json(res, { ...linksState(), ...(reach ? { reach } : {}) }); } // reach: which sites agent runs can use too (agents.mjs)
      if (u.pathname === "/api/links/link" && req.method === "POST") { const b = await readBody(req); return json(res, await linkSite(String(b.id || ""), b.here ? { open: async (url) => ({ ok: true, url }) } : undefined)); } // here: from the Symbiot Browser, which opens the site itself
      if (u.pathname === "/api/browser/open" && req.method === "POST") { const b = await readBody(req); if (process.env.SYMBIOT_NO_OPEN === "1") return json(res, { ok: false, note: "not opened (SYMBIOT_NO_OPEN)", page: browserHub() }); return json(res, await openSymbiotBrowser(b.url ? siteUrl(String(b.url)) : "")); }
      // Done: it closes, and every site is checked (links.mjs sitesCheck). Its page's X sends
      // closed: the same, unless the page is back within a moment (a reload, not a close).
      if (u.pathname === "/api/browser/done" && req.method === "POST") { if (process.env.SYMBIOT_NO_OPEN === "1") return json(res, { closed: 0 }); const r = await closeSymbiotBrowser(); sitesCheck(); return json(res, { ...r, checking: true }); }
      if (u.pathname === "/api/browser/closed" && req.method === "POST") { const at = Date.now(); if (process.env.SYMBIOT_NO_OPEN !== "1") setTimeout(() => { if (HUB_SEEN > at) return; closeSymbiotBrowser().catch(() => {}).then(() => sitesCheck()); }, 3000).unref(); return json(res, { ok: true }); }
      // any site, added in Settings → Connections or the Symbiot Browser's address bar, or a card's / reply's "Sign in to <site>": linked and opened to sign in
      if (u.pathname === "/api/links/site" && req.method === "POST") { const b = await readBody(req), here = b.here ? { open: async (url) => ({ ok: true, url }) } : undefined; return json(res, b.id ? await linkSite(String(b.id), here) : await addSite(String(b.site || ""), here)); }
      if (u.pathname === "/api/links/check" && req.method === "POST") { const b = await readBody(req); return json(res, await checkLink(String(b.id || ""))); }
      if (u.pathname === "/api/links/act" && req.method === "POST") { const b = await readBody(req); return json(res, setLinkAct(String(b.id || ""), b.on === true)); } // agents may act on it in your own Chrome (chromegate.mjs)
      if (u.pathname === "/api/links/unlink" && req.method === "POST") { const b = await readBody(req); return json(res, unlinkSite(String(b.id || ""))); }
      // Posts (post.mjs): the week's drafts, waiting on you. Approve is your yes: Marketing's
      // agent posts it through Symbiot's signed-in browser.
      if (u.pathname === "/api/posts") return json(res, postsState());
      // Marketing: replies on LinkedIn (its watched notifications, marked "maybe a customer"),
      // and the 4-week test's table, with npm installs of the packages the posts are about
      if (u.pathname === "/api/marketing") {
        const ws = watchState(), news = markNews(newsSince(24 * 60), ws.watches), p = postsState(), t = testWeeks({ news, map: repoPathMap() });
        let n = null; try { n = await testInstalls(t, { get: (url) => fetch(url, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)) }); } catch {}
        if (t && n) t.rows.forEach((r, i) => { r.installs = n[i]; });
        let lane = null; try { lane = marketingState(); } catch {}
        return json(res, { linkedin: p.linkedin, replies: news.filter((x) => x.social && x.ts >= Date.now() - 30 * 86400000).slice(0, 30), test: t, lane });
      }
      // Marketing's own lane (marketing.mjs): a task for it, tagged with its product; another
      // lane's marketing task moved to it; its agent started; a draft its agent wrote, opened
      if (u.pathname === "/api/marketing/task" && req.method === "POST") { { const g = can("marketing"); if (!g.ok) return json(res, { error: g.why, pro: true }); } const b = await readBody(req); return json(res, marketingTask(b.text, b.product)); }
      if (u.pathname === "/api/marketing/move" && req.method === "POST") { { const g = can("marketing"); if (!g.ok) return json(res, { error: g.why, pro: true }); } const b = await readBody(req); return json(res, moveToMarketing(b.id, b.product)); }
      if (u.pathname === "/api/marketing/go" && req.method === "POST") { const g = can("marketing"); return json(res, g.ok ? marketingGo() : { error: g.why, pro: true }); }
      // a draft as the post it will be (its preview, notes apart), its picture or video, and
      // your Approve or Skip on it: approved, its agent posts it through Symbiot's browser
      if (u.pathname === "/api/marketing/draft") return json(res, draftPreview(String(u.searchParams.get("rel") || ""), { cookie: sessionCookie }));
      if (u.pathname === "/api/marketing/media") { const m = laneMedia(String(u.searchParams.get("rel") || "")); if (!m) { res.writeHead(404); res.end("not found"); return; } res.writeHead(200, { "content-type": m.type, "cache-control": "private, max-age=300" }); res.end(readFileSync(m.file)); return; }
      if (u.pathname === "/api/marketing/draft/answer" && req.method === "POST") { { const g = can("marketing"); if (!g.ok) return json(res, { error: g.why, pro: true }); } const b = await readBody(req); return json(res, b.change !== undefined ? marketingDraftAnswer(String(b.rel || ""), "change", { ask: String(b.change || "") }) : marketingDraftAnswer(String(b.rel || ""), b.done ? "done" : b.skip ? "skipped" : "approved")); }
      if (u.pathname === "/api/marketing/open" && req.method === "POST") { const b = await readBody(req), f = join(MARKETING_DIR, String(b.rel || "")); return json(res, f.startsWith(MARKETING_DIR + "/") && existsSync(f) ? { ok: openUrl(f) } : { error: "That draft isn't there any more." }); }
      // the pick tray (tray.mjs): its captures and their blur boxes, a capture (only from inside
      // a tray), a box switched on or off and the capture blurred again, a capture as a post's media
      if (u.pathname === "/api/marketing/tray") { let products = []; try { products = captureProducts(); } catch {} return json(res, { trays: trays(), products }); }
      if (u.pathname === "/api/marketing/tray/media") { const m = trayMedia(String(u.searchParams.get("rel") || "")); if (!m) { res.writeHead(404); res.end("not found"); return; } res.writeHead(200, { "content-type": m.type, "cache-control": "private, max-age=86400" }); res.end(readFileSync(m.file)); return; }
      if (u.pathname === "/api/marketing/tray/blur" && req.method === "POST") { const b = await readBody(req), r = setBlur(String(b.tray || ""), String(b.name || ""), b.id, !!b.on); if (r.error) return json(res, r); const d = await renderCapture(String(b.tray), String(b.name)); return json(res, { ...r, rendered: !!d.ok, ...(d.error ? { note: d.error } : {}) }); }
      if (u.pathname === "/api/marketing/tray/use" && req.method === "POST") { const b = await readBody(req); return json(res, setDraftMedia(String(b.rel || ""), [].concat(b.file || []).map(String))); } // one to look over first is refused there (marketing.mjs lookOver)
      // a box of your own (drawn on it), one gone, and a capture looked over (tray.mjs); then it's blurred again
      if (u.pathname === "/api/marketing/tray/box" && req.method === "POST") { const b = await readBody(req), r = b.remove != null ? removeBlur(String(b.tray || ""), String(b.name || ""), b.remove) : addBlur(String(b.tray || ""), String(b.name || ""), b.box); if (r.error) return json(res, r); const d = await renderCapture(String(b.tray), String(b.name)); return json(res, { ...r, rendered: !!d.ok, ...(d.error ? { note: d.error } : {}) }); }
      if (u.pathname === "/api/marketing/tray/reviewed" && req.method === "POST") { const b = await readBody(req); return json(res, setReviewed(String(b.tray || ""), String(b.name || ""))); }
      // Symbiot's own capture of a product, for its pick tray (capture.mjs): `symbiot capture`, the lane's first run, or the page's Capture
      if (u.pathname === "/api/marketing/capture" && req.method === "POST") { const b = await readBody(req); return json(res, await captureProduct({ product: String(b.product || ""), url: String(b.url || ""), window: String(b.window || ""), file: String(b.file || ""), screens: [].concat(b.screens || []).map(String), clips: b.clips !== false, ...(Number(b.seconds) > 0 ? { seconds: Math.min(20, Number(b.seconds)) } : {}) })); }
      if (u.pathname === "/api/posts/draft" && req.method === "POST") return json(res, await draftPosts());
      if (u.pathname === "/api/posts/approve" && req.method === "POST") { const b = await readBody(req); return json(res, approvePost(String(b.id || ""))); }
      if (u.pathname === "/api/posts/edit" && req.method === "POST") { const b = await readBody(req); return json(res, editPost(String(b.id || ""), b.text)); }
      if (u.pathname === "/api/posts/skip" && req.method === "POST") { const b = await readBody(req); return json(res, skipPost(String(b.id || ""))); }
      // a draft's pictures and video: yours (the file itself as the body), a picture or clip of a page, shown, removed, their folder opened
      if (u.pathname === "/api/posts/media") { const m = mediaFile(String(u.searchParams.get("post") || ""), String(u.searchParams.get("m") || "")); if (!m) { res.writeHead(404); res.end("not found"); return; } res.writeHead(200, { "content-type": m.type, "cache-control": "private, max-age=86400" }); res.end(readFileSync(m.file)); return; }
      if (u.pathname === "/api/posts/media/add" && req.method === "POST") { const data = await readBytes(req, POST_MEDIA_MAX); return json(res, data ? addMedia(String(u.searchParams.get("id") || ""), data, { name: String(u.searchParams.get("name") || "") }) : { error: "That file is too big: Symbiot keeps videos up to 500 MB." }); }
      if (u.pathname === "/api/posts/media/page" && req.method === "POST") { const b = await readBody(req); return json(res, b.clip ? await clipOfPage(String(b.id || ""), String(b.url || ""), { seconds: Number(b.seconds) || 8 }) : await pictureOfPage(String(b.id || ""), String(b.url || ""))); }
      if (u.pathname === "/api/posts/media/remove" && req.method === "POST") { const b = await readBody(req); return json(res, removeMedia(String(b.id || ""), String(b.m || ""))); }
      if (u.pathname === "/api/posts/media/folder" && req.method === "POST") { const b = await readBody(req), d = b.id ? mediaDir(String(b.id)) : ""; return json(res, d && existsSync(d) ? { ok: openUrl(d), folder: d } : { error: "This draft has no pictures or video yet." }); }
      // reads your LinkedIn only on your click (confirmed), never by itself
      if (u.pathname === "/api/posts/voice" && req.method === "POST") { const b = await readBody(req); if (b.confirmed !== true) return json(res, { error: "Reading your LinkedIn posts needs your click." }); return json(res, await voiceFromLinkedIn()); }
      // Reports (reports.mjs): what runs wrote up in their .symbiot/; read by id, never by path.
      // on a phone, its computer's newest reports too (from the copy it keeps)
      if (u.pathname === "/api/reports") return json(res, { reports: [...withNeeds(listReports()), ...phoneReports(computerCopy())].sort((a, b) => b.mtime - a.mtime) });
      if (u.pathname === "/api/reports/read") { const id = u.searchParams.get("id") || ""; return json(res, id.startsWith("pc:") ? phoneReport(computerCopy(), id) : readReport(id)); }
      // A report's image (an <img> src, so its token is in ?t=): by the report's id and a src it shows, from its allowed folders only.
      if (u.pathname === "/api/reports/image") { const f = reportImage(u.searchParams.get("id") || "", u.searchParams.get("src") || ""); if (f.error) { res.writeHead(404, { "content-type": "text/plain" }); res.end(f.error); return; } res.writeHead(200, { "content-type": f.type, "cache-control": "private, no-cache", "x-content-type-options": "nosniff" }); res.end(readFileSync(f.file)); return; }
      if (u.pathname === "/api/reports/seen" && req.method === "POST") return json(res, markAllRead());
      if (u.pathname === "/api/reports/ideas" && req.method === "POST") { const b = await readBody(req); return json(res, reportIdeasAdd(String(b.id || ""), b.ideas)); }
      if (u.pathname === "/api/reports/dismiss" && req.method === "POST") { const b = await readBody(req); return json(res, reportIdeasDismiss(String(b.id || ""), b.ideas, {}, !!b.done)); }
      if (u.pathname === "/api/reports/ask" && req.method === "POST") { const b = await readBody(req); return json(res, await reportAsk(String(b.id || ""), b.question)); }
      if (u.pathname === "/api/reports/draft" && req.method === "POST") { const b = await readBody(req); return json(res, reportDraftAnswer(String(b.id || ""), !!b.approve)); }
      // Home (home.mjs): the liquid's live data, and its talk; Adapt (adapt.mjs): its
      // shape from how you use it (commit=1 when it wakes from rest, never mid-gesture).
      if (u.pathname === "/api/home") return jsonTag(req, res, homeState({ fresh: u.searchParams.get("fresh") === "1" }));
      // the work scene: what agents are doing, what's waiting, what's ready; Go starts what's waiting
      if (u.pathname === "/api/work") return jsonTag(req, res, workScene());
      if (u.pathname === "/api/work/go" && req.method === "POST") return json(res, workGo());
      if (u.pathname === "/api/onboarding") return json(res, onboarding({ fresh: u.searchParams.get("fresh") === "1" }));
      if (u.pathname === "/api/onboarding/set" && req.method === "POST") { const b = await readBody(req); return json(res, setOnboarding({ step: b.step, skip: b.skip, unskip: b.unskip, skipRest: !!b.skipRest })); }
      if (u.pathname === "/api/onboarding/done" && req.method === "POST") return json(res, setOnboarding({ done: true }));
      if (u.pathname === "/api/onboarding/restart" && req.method === "POST") return json(res, setOnboarding({ restart: true }));
      if (u.pathname === "/api/look" && req.method === "POST") { const b = await readBody(req), look = ["ferro", "glass", "pearl"].includes(b.look) ? b.look : "ferro"; const cf = loadConfig(); if (cf.look !== look) { cf.look = look; saveConfig(cf); } return json(res, { look, launcher: setLauncherLook(look) }); }
      if (u.pathname === "/api/firststeps") return json(res, firstSteps()); // Settings' first steps: what's set up, in order
      if (u.pathname === "/api/home/dismiss" && req.method === "POST") { const b = await readBody(req); return json(res, dismissCard(b.key, { undo: !!b.undo })); }
      if (u.pathname === "/api/home/answer" && req.method === "POST") { const b = await readBody(req); return json(res, homeAnswer(b.id, { pick: b.pick, text: b.text })); }
      if (u.pathname === "/api/away" && req.method === "POST") { const b = await readBody(req); return json(res, toggleAway(`http://127.0.0.1:${server.address().port}/?t=${TOKEN}`, b.open)); }
      if (u.pathname === "/api/home/next" && req.method === "POST") { const b = await readBody(req); return json(res, homeNext(b.id)); }
      // Symbiot's own voice (voice.mjs), for computers without a natural one: the page asks
      if (u.pathname === "/api/voice") return json(res, voiceState(u.searchParams.get("lang") || ""));
      if (u.pathname === "/api/voice/prepare" && req.method === "POST") { const b = await readBody(req); return json(res, prepareVoice(b.lang || "")); }
      if (u.pathname === "/api/voice/say" && req.method === "POST") {
        const b = await readBody(req);
        try { const wav = await speak(b.text, b.lang || ""); res.writeHead(200, { "content-type": "audio/wav", "cache-control": "no-store", "content-length": wav.length }); return res.end(wav); }
        catch (e) { return json(res, { error: String((e && e.message) || e) }); }
      }
      if (u.pathname === "/api/home/ask" && req.method === "POST") { const b = await readBody(req); const r = await homeAsk(b.question, { images: saveShots(b.images) }); let si = null; try { si = r && r.answer ? signInAsked(r.answer) : null; } catch {} return json(res, si ? { ...r, signInTo: si } : r); } // a reply asking you to sign in carries the button
      if (u.pathname === "/api/adapt") return json(res, adaptState({ from: String(u.searchParams.get("from") || ""), commit: u.searchParams.get("commit") === "1", ...(u.searchParams.has("touch") ? { touch: u.searchParams.get("touch") === "1" } : {}) }));
      if (u.pathname === "/api/adapt/use" && req.method === "POST") { const b = await readBody(req); return json(res, noteUse(b)); }
      // Lanes (lanes.mjs): work agents handed to each other, and where it stands.
      if (u.pathname === "/api/lanes") return jsonTag(req, res, lanesState());
      // a parked project (lane) starts no agent runs until it's unparked (agents.mjs parkLane)
      if (u.pathname === "/api/lanes/parked") { const map = laneMap(), ps = parkedPaths(); return json(res, { repos: Object.keys(map).filter((n) => ps.includes(map[n])), paths: ps }); }
      if (u.pathname === "/api/lanes/park" && req.method === "POST") { const b = await readBody(req), map = laneMap(), p = Object.values(map).includes(String(b.path || "")) ? String(b.path) : map[String(b.repo || "")]; if (!p) return json(res, { error: "That project isn't on this computer." }); return json(res, parkLane(p, b.on !== false)); }
      // Watch (watch.mjs): a mapped page read again every few minutes, and what's new on it.
      if (u.pathname === "/api/watch") return json(res, watchState());
      if (u.pathname === "/api/watch/board") return json(res, watchBoard(Math.min(168, Math.max(1, Number(u.searchParams.get("hours")) || 24))));
      if (u.pathname === "/api/watch/add" && req.method === "POST") { const b = await readBody(req); return json(res, addWatch({ screen: b.screen ? String(b.screen) : "", site: b.site, every: b.every })); }
      if (u.pathname === "/api/watch/every" && req.method === "POST") { const b = await readBody(req); return json(res, setEvery(String(b.id || ""), b.every)); }
      if (u.pathname === "/api/watch/remove" && req.method === "POST") { const b = await readBody(req); return json(res, removeWatch(String(b.id || ""))); }
      if (u.pathname === "/api/watch/check" && req.method === "POST") { const b = await readBody(req); return json(res, await checkWatch(String(b.id || ""))); }
      if (u.pathname === "/api/watch/clear" && req.method === "POST") return json(res, clearNews());
      if (u.pathname === "/api/watch/seen" && req.method === "POST") { const b = await readBody(req); return json(res, seenWatch(String(b.id || ""))); }
      if (u.pathname === "/api/watch/brief" && req.method === "POST") { const b = await readBody(req); return json(res, setBrief(b.on === true)); }
      // Draft a reply: a new email handed to your agent, which leaves a reply in Drafts (never sends)
      if (u.pathname === "/api/watch/draft" && req.method === "POST") { const b = await readBody(req); return json(res, draftReply(String(b.id || ""))); }
      // Open in WhatsApp: a drafted chat reply, in Symbiot's browser window, to read and send
      if (u.pathname === "/api/watch/open-chat" && req.method === "POST") { const b = await readBody(req); return json(res, await openChat(String(b.id || ""))); }
      // a Dashboard card's chat: go over what's new with your AI before a reply is drafted
      if (u.pathname === "/api/watch/chat" && req.method === "POST") { const b = await readBody(req); return json(res, await boardChat(String(b.id || ""), b.question)); }
      if (u.pathname === "/api/watch/chat/clear" && req.method === "POST") { const b = await readBody(req); return json(res, clearBoardChat(String(b.id || ""))); }
      // Your phone (phone.mjs). On the computer: listen on your network for the phone
      // (only on your click), a pairing code and its QR, the phones paired, the relay.
      // On the phone: pair with the computer (typed, or a scanned link), ask it now
      // (also when the phone's network changes), the copy of your work there, a change
      // made on the phone (queued until the computer answers), forget it.
      if (u.pathname === "/api/phone") return json(res, phoneState());
      if (u.pathname === "/api/phone/link" && req.method === "POST") { const b = await readBody(req); return json(res, await setPhoneLink(b.on === true)); }
      if (u.pathname === "/api/phone/free" && req.method === "POST") return json(res, await freePhonePort());
      if (u.pathname === "/api/phone/port" && req.method === "POST") { const b = await readBody(req); return json(res, await usePhonePort(b.port)); }
      if (u.pathname === "/api/phone/code" && req.method === "POST") { await startPhoneLink(); return json(res, newCode()); } // a port that was taken may be free now
      if (u.pathname === "/api/phone/unpair" && req.method === "POST") { const b = await readBody(req); return json(res, unpairPhone(String(b.id || ""))); }
      if (u.pathname === "/api/phone/relay" && req.method === "POST") { const b = await readBody(req); return json(res, setRelay(b.on === true)); }
      if (u.pathname === "/api/phone/pair" && req.method === "POST") { const b = await readBody(req); return json(res, await pairComputer(b.address, b.code, { link: String(b.link || "") })); }
      if (u.pathname === "/api/phone/check" && req.method === "POST") return json(res, await pollComputer());
      if (u.pathname === "/api/phone/find") return json(res, { found: await findComputers() });
      if (u.pathname === "/api/phone/heard" && req.method === "POST") { const b = await readBody(req); return json(res, heardCode({ app: String(b.app || "").slice(0, 120), title: String(b.title || "").slice(0, 200), text: String(b.text || "").slice(0, 600) })); }
      if (u.pathname === "/api/phone/codes" && req.method === "POST") { const b = await readBody(req); return json(res, setCodeRelay(String(b.key || ""), b.on === true)); }
      if (u.pathname === "/api/phone/do" && req.method === "POST") { const b = await readBody(req); return json(res, queueChange(String(b.op || ""), b.args || {})); }
      if (u.pathname === "/api/phone/note" && req.method === "POST") { const b = await readBody(req); return json(res, dismissNote(String(b.id || ""))); }
      if (u.pathname === "/api/phone/forget" && req.method === "POST") return json(res, forgetComputer());
      // What symbiot-desktop added (desktop.mjs): the weekly write-up, start at login.
      if (u.pathname === "/api/desktop") return json(res, { weekly: weeklyState(), autostart: autostartState() });
      if (u.pathname === "/api/desktop/weekly" && req.method === "POST") { const b = await readBody(req); return json(res, setWeekly(b)); }
      if (u.pathname === "/api/desktop/weekly/run" && req.method === "POST") { const b = await readBody(req); return json(res, await runWeekly(writeup, { notify: b.notify !== false })); }
      if (u.pathname === "/api/desktop/autostart" && req.method === "POST") { const b = await readBody(req); return json(res, setAutostart(!!b.on, bin)); }
      // the Week tab's week is saved to weeks/ too, as Write it now saves it (no notification: you're looking at it)
      if (u.pathname === "/api/run" && req.method === "POST") { const b = await readBody(req); const cmd = ["week", "standup", "todo"].includes(b.cmd) ? b.cmd : "week"; return json(res, cmd === "week" ? await runWeekly(writeup, { notify: false }) : await writeup(cmd)); }
      if (u.pathname === "/api/connect" && req.method === "POST") { return json(res, await connectProvider(await readBody(req))); }
      // a sandbox (symbiot app --fresh) never offers an update: it would replace your real install.
      // A headless browser (an agent's screenshot of Home) never becomes the newest window:
      // that closed the user's real one, again and again (2026-10-08, "symbiot keeps crashing").
      if (u.pathname === "/api/ping") { if (u.searchParams.get("fresh") === "1" && !SANDBOX) await checkLatest(); const w = u.searchParams.get("w") || ""; if (/^[a-z0-9]{6,20}$/.test(w) && u.searchParams.get("new") === "1" && !headlessAgent(req.headers["user-agent"])) NEWEST_WIN = w; return json(res, { ...(NEWEST_WIN ? { window: NEWEST_WIN } : {}), version: VERSION, started: SERVER_STARTED, latest: LATEST_VERSION, newer: !SANDBOX && !DESKTOP && semverGt(LATEST_VERSION, VERSION), ...(DESKTOP ? { desktop: true } : {}), ...(UPDATING ? { updating: { ...UPDATING, every: UPDATE_EVERY, wait: UPDATE_WAIT } } : {}), ...(AUTO.why === "busy" || AUTO.why === "settling" || AUTO.why === "download" ? { autoUpdate: { why: AUTO.why, ...(AUTO.busy ? { busy: AUTO.busy } : {}) } } : {}), ...(UPDATE_FAILED ? { updateFailed: UPDATE_FAILED } : {}), ...(RELAUNCH ? { relaunched: true } : {}), ...(IN_TERMUX ? { termux: true } : {}), ...(SANDBOX ? { sandbox: true } : {}) }); }
      // What's new: after an update, since the version you last saw (until you click Got it);
      // ?latest=1, what the update on offer brings, from its package on npm
      if (u.pathname === "/api/whatsnew") {
        // a brand-new install has nothing to catch up on: this version counts as seen
        if (u.searchParams.get("latest") !== "1" && FIRST_RUN && !loadConfig().seenVersion) { const cfg = loadConfig(); cfg.seenVersion = VERSION; saveConfig(cfg); return json(res, { version: VERSION, changes: [] }); }
        if (u.searchParams.get("latest") !== "1") return json(res, whatsNew());
        const to = LATEST_VERSION; if (!semverGt(to, VERSION)) return json(res, { version: to, changes: [] });
        const md = await registryChangelog(to);
        return json(res, { version: to, changes: changesSince(md, VERSION, to), ...(md ? {} : { error: `Couldn't read ${to}'s changelog from npm.` }) });
      }
      if (u.pathname === "/api/whatsnew/seen" && req.method === "POST") { const cfg = loadConfig(); cfg.seenVersion = VERSION; return json(res, saveConfig(cfg) ? { ok: true } : { error: "Couldn't write the config file." }); }
      if (u.pathname === "/api/claude/setup") return json(res, claudeSetup(u.searchParams.get("fresh") === "1"));
      if (u.pathname === "/api/claude/install" && req.method === "POST") return json(res, installClaude());
      if (u.pathname === "/api/claude/signin" && req.method === "POST") return json(res, signInClaude());
      if (u.pathname === "/api/claude/code" && req.method === "POST") { const b = await readBody(req); return json(res, sendClaudeCode(b.code)); }
      // the language (lang.mjs): the window reports the computer's, Settings can name any; the app's own words, translated once and kept
      if (u.pathname === "/api/language/set" && req.method === "POST") { const b = await readBody(req); return json(res, setLanguage({ ...(b.auto !== undefined ? { auto: b.auto } : {}), ...(b.chosen !== undefined ? { chosen: b.chosen } : {}) })); }
      if (u.pathname === "/api/language") return json(res, languageState());
      if (u.pathname === "/api/i18n/all") return json(res, { map: allTranslations(u.searchParams.get("lang") || languageState().lang) });
      if (u.pathname === "/api/i18n" && req.method === "POST") { const b = await readBody(req); return json(res, { map: await translate(b.lang || "", Array.isArray(b.strings) ? b.strings.slice(0, 400) : []) }); }
      // Symbiot Free and Pro (licence.mjs): where you stand, a key in or out, a Free project slot freed
      if (u.pathname === "/api/licence") return json(res, licenceView());
      if (u.pathname === "/api/licence/key" && req.method === "POST") { const b = await readBody(req); const r = setKey(b.key); return json(res, r.error ? r : licenceView()); }
      if (u.pathname === "/api/licence/clear" && req.method === "POST") { clearKey(); return json(res, licenceView()); }
      if (u.pathname === "/api/licence/project/free" && req.method === "POST") { const b = await readBody(req); const c = loadConfig(); const L = c.licence || {}; L.projects = (L.projects || []).filter((p) => p !== String(b.path || "")); c.licence = L; saveConfig(c); return json(res, licenceView()); }
      if (u.pathname === "/api/update" && req.method === "POST" && DESKTOP) return json(res, { error: "This Symbiot updates with its app." });
      if (u.pathname === "/api/update" && req.method === "POST") {
        // Install the newest version and restart (startUpdate).
        if (SANDBOX) return json(res, { error: "This is a sandbox (symbiot app --fresh): update your real Symbiot instead." });
        // One at a time: a second click (another window, or one while it waits) started a
        // second npm install over the first, and they collided (ENOTEMPTY, 0.61.1).
        // (an install still running after 10 minutes has hung: a click starts it afresh)
        if (UPDATING && (UPDATING.retrying || Date.now() - UPDATING.at < 10 * 60 * 1000)) return json(res, { started: true, already: true, target: UPDATING.target });
        const { e, target } = await startUpdate();
        return json(res, { started: true, id: e ? e.id : "", target, ...(UPDATING && UPDATING.retrying ? { waiting: true } : {}) });
      }
      if (u.pathname === "/api/quit") { stopVoices(); res.writeHead(200); res.end("bye"); setTimeout(() => process.exit(0), 150); return; }
    } catch (e) { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: String((e && e.message) || e) })); return; }
    res.writeHead(404); res.end("not found");
  });
  // This same app again (same port+token => same URL), as a relaunch, so it takes over
  // instead of finding us and bowing out; agents run detached and carry on. On the port
  // it was serving: one that took another (Termux's Symbiot holds 7391 on a phone)
  // relaunched on 7391, found it busy and exited, so nothing served the app's window.
  let relaunching = false;
  function relaunch() {
    if (relaunching) return; relaunching = true; // once: the next look came before this one had exited, and started a second
    const at = (server.address() || {}).port, own = at && at !== PORT ? { SYMBIOT_PORT: String(at) } : {};
    server.close(); if (server.closeAllConnections) server.closeAllConnections();
    try { const ch = spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: "ignore", env: { ...process.env, ...relaunchEnv(), ...own, SYMBIOT_RELAUNCH: "1" }, cwd: homedir() }); ch.unref(); } catch {}
    setTimeout(() => process.exit(0), 1200);
  }
  // A newer Symbiot installed under this one from outside the app (npm install -g in a
  // terminal, as the update bar once told you to): it stayed on the old one until
  // something restarted it, with the new files on disk under the old code (2026-10-12).
  // Seen the same on two looks a minute apart (npm done writing), it restarts onto it.
  let installedSeen = "";
  if (!SANDBOX && !DESKTOP && /[\\/]node_modules[\\/]symbiot[\\/]/.test(OWN_PKG)) setInterval(() => {
    if (UPDATING || relaunching) return; // the app's own update restarts it
    const v = installedVersion(), go = restartOnto(installedSeen, v); installedSeen = v;
    if (go) { console.log(c.d(`  Symbiot ${v} was installed: restarting onto it.`)); relaunch(); }
  }, Number(process.env.SYMBIOT_INSTALLED_EVERY) || 60000).unref();
  let announced = false, tries = 0, opened = false;
  server.on("listening", () => {
    if (announced) return; announced = true;
    resumeUpdate();
    const url = `http://127.0.0.1:${server.address().port}/?t=${TOKEN}`;
    openGate();
    setBrowserHub(`http://127.0.0.1:${server.address().port}/browser?t=${TOKEN}`); // the Symbiot Browser opens on its own page, served from here
    const how = opened || RELAUNCH || process.env.SYMBIOT_NO_OPEN === "1" ? "" : openApp(url); opened = true; // only pop a window the first time (never in tests, never after an update)
    console.log(`\n${c.g("●")} ${c.b("Symbiot")} is running at ${c.b(url.split("?")[0])}`);
    console.log(RELAUNCH ? c.d("  Restarted after an update; the open window reloads itself.") : how ? c.d(`  Opened in ${/^[aeiou]/.test(how) ? "an" : "a"} ${how}.`) : c.d("  Open it with:  symbiot open"));
    console.log(c.d("  Leave this running; press Ctrl+C to stop (or click the X in the window's top corner)."));
  });
  server.on("error", (e) => {
    // Stable port busy (an older instance still exiting during an update, or a
    // second app): retry briefly, then fall back to a random port unless it's Symbiot's.
    if (e && e.code === "EADDRINUSE" && tries < (RELAUNCH ? 40 : 8)) { tries++; setTimeout(() => { try { server.listen(PORT, "127.0.0.1"); } catch {} }, 500); }
    // after an update, the window only ever looks for the stable port: a copy on another
    // port would serve nobody and linger (one did, for hours), so it bows out
    else if (RELAUNCH) process.exit(0);
    // still busy: if it's a Symbiot (one restarting after an update answers late), open its
    // window and bow out. A copy on another port runs every timer a second time: one started
    // just as 0.57.6 relaunched itself, and two apps ran side by side (2026-10-08).
    else (process.env.SYMBIOT_FORCE_NEW ? Promise.resolve(null) : askRunningApp("ping", { port: PORT, token: TOKEN, ms: 2500 })).then((p) => {
      if (p && p.version) {
        const url = `http://127.0.0.1:${PORT}/?t=${TOKEN}`, how = process.env.SYMBIOT_NO_OPEN === "1" ? "" : openApp(url);
        console.log(`\n${c.g("●")} ${c.b("Symbiot")} is already running (v${p.version}) at ${c.b(url.split("?")[0])}`);
        console.log(how ? c.d(`  Opened the existing window (${/^[aeiou]/.test(how) ? "an" : "a"} ${how}).`) : c.d("  Open it with:  symbiot open"));
        process.exit(0);
      }
      // only this app holds the lock (or SYMBIOT_FORCE_NEW asked for a second): the port is
      // something else's, so it serves on another (a phone's Termux Symbiot holds 7391)
      try { server.listen(0, "127.0.0.1"); } catch {}
    });
  });
  // the sandboxed lanes' way to `symbiot screens` (screens.mjs SCREENS_SOCK): the same handler, with the token added, for the screens routes, the ping, and adding to the vault (sockGate)
  // Only the app that serves opens it, once it's listening (openGate): a second start
  // (the taskbar icon, `symbiot open`) used to remove the running app's socket and open its own
  // here, before finding the port busy and bowing out, and its exit removed that one too. The
  // running app kept listening on a file that was gone, so every sandboxed run's browser failed
  // to start ("the app's socket isn't there", 12 Bookly runs on 21 Oct 2026).
  let gateOpen = false;
  function openGate() {
    if (gateOpen || (SANDBOX && !process.env.SYMBIOT_SCREENS_SOCK)) return; gateOpen = true;
    const gate = createServer((req, res) => {
      let p = ""; try { p = new URL(req.url, "http://x").pathname; } catch {}
      if (!sockGate(p)) { res.writeHead(403); res.end("forbidden"); return; }
      req.headers["x-symbiot-token"] = TOKEN; server.emit("request", req, res);
    });
    gate.on("error", () => {});
    const bind = () => { try { mkdirSync(dirname(SCREENS_SOCK), { recursive: true, mode: 0o700 }); rmSync(SCREENS_SOCK, { force: true }); if (gate.listening) gate.close(); gate.listen(SCREENS_SOCK, () => { try { chmodSync(SCREENS_SOCK, 0o600); } catch {} }); } catch {} };
    bind();
    // something removed the file (an older Symbiot's exit, a cleanup): open it again
    setInterval(() => { if (!existsSync(SCREENS_SOCK)) bind(); }, 30000).unref();
    process.on("exit", () => { try { rmSync(SCREENS_SOCK, { force: true }); } catch {} });
  }
  server.listen(PORT, "127.0.0.1");
  checkLatest(); setInterval(checkLatest, 2 * 60 * 1000).unref(); // background update check (every 2 min)
  setInterval(() => { autoUpdateTick().catch(() => {}); }, Number(process.env.SYMBIOT_AUTO_EVERY) || 60000).unref(); // and it updates itself once nothing's working (autoUpdateDue)
  startWeekly(writeup); // the weekly write-up + notification, when switched on in Settings
  startWatches(); // pages you watch (Screens → Watch), read every few minutes
  // Your phone: the computer listens if it's switched on, the phone asks if it's paired.
  // An Approve from a paired phone is this same Approve, release notes and all.
  setPhoneApprove(async (repo, untasked) => { const { notes, deny } = await notesFor(repo, {}); return untasked ? approveChanges(repo, { tick: [], notes, deny }) : approveRepo(repo, { notes, deny }); });
  startPhone();
  onAnswered((path, rows) => shareAnswer(path, rows)); // an answer to one agent reaches the others on the same work
  setInterval(() => { try { startWaiting(); } catch {} }, 20000).unref(); // a run that waits for your step starts once the file it names changes
  setInterval(() => { try { runsTick(); } catch {} }, 60000).unref(); // a run silent too long is stopped; one that ended while Symbiot was down gets its exit's bookkeeping (agents.mjs)
  setTimeout(() => { try { runsTick(); } catch {} }, 5000).unref();
  setInterval(() => { try { mergeEnded({ addTask }); } catch {} }, 20000).unref(); // runs beside a lane's own that ended (also while Symbiot was down): merged back into the lane
  { let soon = null; onRunEnd(() => { if (soon) return; soon = setTimeout(() => { soon = null; for (const f of [startWaiting, () => mergeEnded({ addTask }), workTick, lanesTick]) try { f(); } catch {} }, 1500); soon.unref(); }); } // a run ended: what waited on it starts within seconds
  setInterval(() => { homeTick(); try { workTick(); } catch {} }, 10000).unref(); // a waiting task starts once its lane is free (config.autoStart: false leaves it to Go); Home, then the work scene that reads its cards: what the routes read
  { let busy = false; setInterval(() => { if (busy) return; busy = true; shipHanded().catch(() => {}).finally(() => { busy = false; }); }, 20000).unref(); } // changes made for a handed-over job go up by themselves
  setInterval(() => { try { lanesTick(); } catch {} }, 20000).unref(); // agents hand work to other lanes, and hear back when it's done
  { let busy = false; setInterval(() => { if (busy) return; busy = true; deployTick({ running: (p) => !!runningHandoff(p), notify: desktopNotify }).catch(() => {}).finally(() => { busy = false; }); }, 60000).unref(); } // a runbook's deploy is live once its check answers (deploy.mjs)
  setTimeout(() => { orcaRelink().catch(() => {}); }, 15000).unref(); // a lane folder a handover renamed, added again in Orca where it is now
  // an agent's allow list that stays inside your work is turned on by itself, and the agent carries on
  setTimeout(() => { try { autoAllowSweep(); } catch {} }, 4000).unref();
  setInterval(() => { try { autoAllowSweep(); } catch {} }, 20000).unref();
  setInterval(() => { triageSweep().catch(() => {}); }, 15000).unref(); // every question an agent writes is judged before it can be a card (triage.mjs)
  // what the user asked for, followed through to done or "not finished", never dropped (goals.mjs)
  const goalDeps = () => {
    let cardPaths = new Set(); try { cardPaths = new Set(onUser().map((c) => c.path).filter(Boolean)); } catch {}
    let ai = null; try { ai = resolveProvider() ? aiWrite : null; } catch {}
    return { write: ai, running: (p) => !!goalRunning(p), start: (p) => runHandoff(p, { force: true }), autoStart, ops: (req, o) => actNow(req, o), notify: (t, b) => desktopNotify(t, b), settle: settleRecord, stop: stopWaiting,
      ledger: (() => { try { return loadLedger(); } catch { return { handoffs: [] }; } })(), waits: (() => { try { return awaitingState().waits; } catch { return []; } })(), map: (() => { try { return laneMap(); } catch { return {}; } })(), until: (what, now) => waitUntil(what, now), cardPaths };
  };
  onGoalAnswer((path, answers) => goalAnswer(path, answers, goalDeps()));
  setTimeout(() => { goalsTick(goalDeps()).catch(() => {}); }, 60000).unref();
  setInterval(() => { goalsTick(goalDeps()).catch(() => {}); }, 10 * 60000).unref();
  setInterval(() => { try { continueLanes(); } catch {} }, 60000).unref(); // a lane with open tasks and no run going starts again, while it gets somewhere
  // a finished run's last words, read by your AI for anything left to you that the patterns missed (agents.mjs readLastWords)
  setInterval(() => { readLastWords().catch(() => {}); }, 60000).unref();
  // knowledge folders: changed files re-read (a stat per file when nothing changed), then checked again for where two files disagree (checks.mjs)
  const knowTick = () => { try { const r = knowledgeTick(); if (r && (r.read || r.removed || !checksState().at)) runChecks(); } catch {} };
  setTimeout(knowTick, 5000).unref(); setInterval(knowTick, 3 * 60 * 1000).unref();
  import("./sweep.mjs").then((s) => s.startSweep()).catch(() => {}); // the daily sweep of finished run folders, old page maps, leftovers (sweep.mjs)
  setInterval(() => { try { awaitTick(); } catch {} }, 60000).unref();
  setInterval(() => { sentTick().catch(() => {}); }, 120000).unref(); // an email task the user already sent: closed, with where it went (sentmail.mjs) // a reply an agent's email waits on: found, and handed on
}

export { headlessAgent, updateCmd, installedVersion, restartOnto, autoUpdateDue, restartWouldStop, downloadReady, updateOutcome, changesSince, whatsNew, tarFile, registryChangelog, BROWSER_KEEP, startApp, askRunningApp, isAppRunningWeekly, openApp };
