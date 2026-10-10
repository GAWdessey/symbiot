// `symbiot app`: the local server behind the app window. It serves the page
// (ui.mjs) and its /api routes, each a thin call into the module that does the
// work, on 127.0.0.1 only and behind the per-install token. (Your phone's link
// listens on your network separately, only for that: phone.mjs.)
import { languageState, setLanguage, translate, allTranslations } from "./lang.mjs";
import { licenceState, setKey, clearKey, can, refreshRevoked, FREE } from "./licence.mjs";
import { claudeSetup, installClaude, signInClaude, sendClaudeCode } from "./claudesetup.mjs";
import { voiceState, prepareVoice, speak, stopVoices } from "./voice.mjs";
import { spawn, spawnSync } from "node:child_process";
import { toggleAway, closeAway } from "./away.mjs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { readRunLog } from "./work.mjs";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { EMBEDDED_UI } from "./ui.mjs";
import { VERSION, LATEST_VERSION, REGISTRY, semverGt, checkLatest, CONFIG_PATH, loadConfig, saveConfig, moveSecrets, loadTasks, hasCmd, chromeBinary, CONFIG_DIR } from "./core.mjs";
import { shSingle, handoffCmd, setHandoffCmd, grantAgent, runHandoff, track, detectHandoffs, connectorsInfo, linkReach, answerQuestions, skipIdea, agentsList, startWaiting, parkLane, parkedPaths, autoAllowSweep, trustFull, readLastWords, sandboxState } from "./agents.mjs";
import { PROVIDERS, resolveProvider, connectProvider, detectHardware, recommendModels, hasOllama, ollamaInstall, ensureOllama, useOllamaModel } from "./ai.mjs";
import { SCAN, SCAN_TIMEOUT_MS, scanRoots, scanHome, addScanRoot, removeScanRoot, buildMap, nodeDetail, repoPathMap, laneMap, setScanOptions, refreshRepos, REPO_STATE, reposState } from "./scan.mjs";
import { computeDrift } from "./drift.mjs";
import { addTask, toggleTask, removeTask, restoreTask, syncTasks, taskType, pushTasks, pendingReview, workingDiff, learnNpm, withReleases, releaseInput, approveRepo, approveChanges, sendBack, setAutoMerge } from "./tasks.mjs";
import { repoReview, repoSuggest, folderSuggest, taskChat, clearTaskChat, mailState, setMail, sentMail, produce, releaseNotes } from "./writeups.mjs";
import { loadScreens, screenImage, captureScreen, splitScreen, listMonitors, allowScreenshots, importScreen, setRegions, renameScreen, removeScreen, blueprint, clickRegion } from "./screens.mjs";
import { mapPage, wholePage, pressRegion, typeRegion, uploadRegion, scrollPage, signIn, keepBrowserOpen, isTrusted, trustedSites, trustSite, untrustSite, openSymbiotBrowser, closeSymbiotBrowser, setBrowserHub, siteUrl, browserHub } from "./headless.mjs";
import { weeklyState, setWeekly, runWeekly, startWeekly, autostartState, setAutostart, installLauncher, iconSvg, setLauncherLook } from "./desktop.mjs";
import { markNews, newsSince, watchState, addWatch, setEvery, removeWatch, clearNews, seenWatch, checkWatch, startWatches, setBrief, draftReply, openChat, watchBoard, boardChat, clearBoardChat } from "./watch.mjs";
import { linksState, linkSite, checkLink, unlinkSite, addSite, signInAsked } from "./links.mjs";
import { testWeeks, testInstalls, postsState, draftPosts, approvePost, editPost, skipPost, voiceFromLinkedIn, addMedia, removeMedia, mediaFile, mediaDir, pictureOfPage, clipOfPage, openUrl } from "./post.mjs";
import { mindState, forget } from "./mind.mjs";
import { lanesTick, lanesState, partlyDone, orcaRelink } from "./lanes.mjs";
import { keepFacts, skipFacts, awaitTick, awaitingState, stopWaiting } from "./handback.mjs";
import { adaptState, noteUse } from "./adapt.mjs";
import { reportIdeasAdd, reportAsk, reportDraftAnswer, homeState, homeAsk, homeAnswer, homeNext, workScene, workGo, workTick, firstSteps, marketingState, marketingGo, marketingDraftAnswer, marketingTask, moveToMarketing, onboarding, setOnboarding, startOnboarding, phoneSetupFirst } from "./home.mjs";
import { MARKETING_DIR, MARKETING, draftPreview, laneMedia, displayName, setDraftMedia } from "./marketing.mjs";
import { trays, trayMedia, setBlur, renderCapture } from "./tray.mjs";
import { listReports, readReport, reportImage, markAllRead } from "./reports.mjs";
import { phoneState, setPhoneLink, newCode, unpairPhone, setRelay, findComputers, pairComputer, forgetComputer, pollComputer, queueChange, dismissNote, setPhoneApprove, startPhone } from "./phone.mjs";
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
  const FRESH = !SANDBOX && !existsSync(CONFIG_PATH);
  // Stable token + port so the URL survives a restart — the open tab can
  // reconnect and auto-reload itself instead of you closing and reopening it.
  try { moveSecrets(); } catch {} // keys from before secrets.json: out of config.json, where a run could read them
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
  if (!process.env.SYMBIOT_FORCE_NEW && !RELAUNCH) {
    const p = await askRunningApp("ping", { port: PORT, token: TOKEN });
    if (p && p.version) {
      setBrowserHub(`http://127.0.0.1:${PORT}/browser?t=${TOKEN}`);
      const url = `http://127.0.0.1:${PORT}/?t=${TOKEN}`; const how = process.env.SYMBIOT_NO_OPEN === "1" ? "" : openApp(url);
      console.log(`\n${c.g("●")} ${c.b("Symbiot")} is already running (v${p.version}) at ${c.b(url)}`);
      console.log(how ? c.d(`  Opened the existing window (${/^[aeiou]/.test(how) ? "an" : "a"} ${how}).`) : c.d("  Open that URL in your browser."));
      console.log(c.d("  (Not starting a second copy. Set SYMBIOT_FORCE_NEW=1 to force one.)"));
      return;
    }
  }
  // Screens' hidden browser stays open between map, press and type (headless.mjs),
  // so an agent can type into a field and then press a separate button there.
  keepBrowserOpen(BROWSER_KEEP);
  const json = (res, obj) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  const screenOut =(s) => (s && s.id ? { ...s, blueprint: blueprint(s), ...(s.page ? { trusted: isTrusted(s.page.url) } : {}) } : s && s.screens ? { ...s, screens: s.screens.map(screenOut) } : s);
  // an installed Symbiot keeps its app-menu entry pointing at itself (a new Node, a moved
  // install); not a copy run from a checkout or a test
  if (/[\\/]node_modules[\\/]symbiot[\\/]/.test(bin || "") && !SANDBOX && !process.env.SYMBIOT_NO_LAUNCHER) { try { installLauncher({ script: bin }); } catch {} }
  // setup's first step: "Your computer" in the Android app, so a phone paired by its QR shows it
  if (FRESH) { try { startOnboarding(); } catch {} }
  try { phoneSetupFirst(); } catch {} // the phone app, over an older one: setup goes to "Your computer" first
  // your projects: kept, and found again off the main thread, so nothing waits on a search
  setScanOptions({ cache: true }); REPO_STATE.onChange = () => { try { homeState({ fresh: true }); } catch {} };
  if (!SANDBOX) { refreshRevoked().catch(() => {}); setInterval(() => refreshRevoked().catch(() => {}), 6 * 3600 * 1000).unref(); } // cancelled Pro keys, about daily
  { const t0 = Date.now(); refreshRepos().then((l) => console.log(`Found ${l.length} project${l.length === 1 ? "" : "s"} in ${((Date.now() - t0) / 1000).toFixed(1)}s.`)); }
  let UPDATING = null; // an update in flight: { target, attempt, retrying? }
  let NEWEST_WIN = ""; // the Symbiot window opened last: older ones close themselves (one window, not a pile)
  process.on("exit", () => closeAway()); // Away's windows go with the app (a quit, an update's restart)
  const server = createServer(async (req, res) => {
    const t0 = Date.now(); res.on("finish", () => { const ms = Date.now() - t0; if (ms > 1500) console.log(`slow: ${String(req.url || "").split("?")[0]} took ${(ms / 1000).toFixed(1)}s`); });
    const u = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && u.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(EMBEDDED_UI); return; }
    // the Symbiot Browser's own page (headless.mjs openSymbiotBrowser): like /, it gets its token in ?t=
    if (req.method === "GET" && u.pathname === "/browser") { try { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(readFileSync(new URL("./browser.html", import.meta.url))); } catch { res.writeHead(404); res.end(); } return; }
    // the app's typeface ships in the package (fonts/), so it's there offline
    // the window's own icon (its taskbar entry), the same orb as the app menu's
    if (req.method === "GET" && (u.pathname === "/favicon.svg" || u.pathname === "/favicon.ico")) {
      try { const b = iconSvg(u.searchParams.get("look") || loadConfig().look || "ferro"); res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-cache" }); res.end(b); }
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
      if (u.pathname === "/api/map") return json(res, await buildMap()); // local git only — no AI key needed
      if (u.pathname === "/api/scan") return json(res, { active: SCAN.active, phase: SCAN.phase, done: SCAN.done, total: SCAN.total, item: SCAN.item, elapsed: SCAN.startedAt ? Date.now() - SCAN.startedAt : 0, timeout: SCAN_TIMEOUT_MS, partial: SCAN.partial });
      if (u.pathname === "/api/models") { const hw = detectHardware(); return json(res, { hardware: hw, rec: recommendModels(hw) }); }
      if (u.pathname === "/api/drift") return json(res, computeDrift({ ci: u.searchParams.get("ci") === "1", fetch: u.searchParams.get("fetch") === "1" }));
      if (u.pathname === "/api/node") return json(res, await nodeDetail(u.searchParams.get("id") || "")); // local
      if (u.pathname === "/api/suggest" && req.method === "POST") { const b = await readBody(req); const p = String(b.path || ""); const isRepo = p && existsSync(join(p, ".git")); return json(res, await (isRepo ? repoSuggest(p) : folderSuggest(p))); }
      if (u.pathname === "/api/review" && req.method === "POST") { const b = await readBody(req); return json(res, await repoReview(String(b.path || ""))); }
      if (u.pathname === "/api/tasks" && req.method !== "POST") { const arch = u.searchParams.get("archived") === "1"; return json(res, loadTasks().filter((x) => !!x.archived === arch).map((t) => ({ ...t, type: taskType(t.text) }))); }
      if (u.pathname === "/api/tasks/add" && req.method === "POST") { const b = await readBody(req); return json(res, addTask(b.text, b.repo)); }
      if (u.pathname === "/api/tasks/toggle" && req.method === "POST") { const b = await readBody(req); return json(res, toggleTask(String(b.id || ""))); }
      if (u.pathname === "/api/tasks/remove" && req.method === "POST") { const b = await readBody(req); return json(res, removeTask(String(b.id || ""))); }
      if (u.pathname === "/api/tasks/restore" && req.method === "POST") { const b = await readBody(req); return json(res, restoreTask(String(b.id || ""))); }
      if (u.pathname === "/api/tasks/sync" && req.method === "POST") return json(res, syncTasks());
      if (u.pathname === "/api/tasks/chat" && req.method === "POST") { const b = await readBody(req); return json(res, await taskChat(String(b.id || ""), b.question)); }
      if (u.pathname === "/api/tasks/chat/clear" && req.method === "POST") { const b = await readBody(req); return json(res, clearTaskChat(String(b.id || ""))); }
      if (u.pathname === "/api/pending") { // ticked by the agent, awaiting approval
        // what npm has decides the bump offer, and for a repo that publishes on
        // merge, what's unreleased: ask, then recount (answers are cached)
        // partly: what a run that stopped partway still waits on (its questions, a handover)
        const partly = (l) => l.map((r) => { const p = r.path ? partlyDone(r.path) : null; return p ? { ...r, partly: p } : r; });
        const list = pendingReview(), ask = list.filter((r) => r.path && (!r.bumpOffer || r.publishesOnMerge)).map((r) => r.path);
        if (!ask.length) return json(res, partly(list));
        await learnNpm(ask); return json(res, partly(pendingReview()));
      }
      if (u.pathname === "/api/pending/diff") { const p = laneMap()[u.searchParams.get("repo") || ""]; return json(res, { diff: p ? workingDiff(p) : "" }); }
      if (u.pathname === "/api/pending/approve" && req.method === "POST") { const b = await readBody(req), repo = String(b.repo || ""); if (b.bump) await learnNpm([laneMap()[repo]]); const notes = await releaseNotes(releaseInput(repo, { bump: b.bump })); return json(res, await approveRepo(repo, { bump: b.bump, notes })); }
      if (u.pathname === "/api/pending/approve-changes" && req.method === "POST") { const b = await readBody(req), repo = String(b.repo || ""); if (b.bump) await learnNpm([laneMap()[repo]]); const notes = await releaseNotes(releaseInput(repo, { bump: b.bump, tick: b.tick })); return json(res, await approveChanges(repo, { bump: b.bump, tick: b.tick, notes })); }
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
      if (u.pathname === "/api/agents") return json(res, await withReleases(agentsList()));
      // the answer, saved in the folder that asked; it says which lane that is, so "Sent to …"
      // names where it went (a Marketing answer said "Sent to Paperclip Steve")
      if (u.pathname === "/api/agents/answer" && req.method === "POST") { const b = await readBody(req), path = String(b.path || ""), r = answerQuestions(path, b.answers, { rerun: !!b.rerun }); return json(res, r && r.ok ? { ...r, lane: laneOfFolder(path) } : r); }
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
      if (u.pathname === "/api/screens/map" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await mapPage(b.site, b.name, { whole: b.whole === true }))); }
      // press / type: refused unless confirmed, or the page's site is one you trust
      if (u.pathname === "/api/screens/press" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await pressRegion(String(b.id || ""), String(b.region || ""), { confirmed: b.confirmed === true, noSend: b.noSend === true }))); }
      // scroll and whole page: they only look, so they never ask
      if (u.pathname === "/api/screens/whole" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await wholePage(String(b.id || "")))); }
      if (u.pathname === "/api/screens/scroll" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await scrollPage(String(b.id || ""), String(b.to || "down")))); }
      if (u.pathname === "/api/screens/type" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await typeRegion(String(b.id || ""), String(b.region || ""), b.text, { enter: b.enter === true, confirmed: b.confirmed === true, noSend: b.noSend === true }))); }
      // upload: a file of yours to the page's file box, asked like press and type
      if (u.pathname === "/api/screens/upload" && req.method === "POST") { const b = await readBody(req); return json(res, screenOut(await uploadRegion(String(b.id || ""), String(b.region || ""), Array.isArray(b.files) ? b.files.map(String) : String(b.files || ""), { confirmed: b.confirmed === true }))); }
      if (u.pathname === "/api/screens/trusted") return json(res, { sites: trustedSites() });
      if (u.pathname === "/api/screens/trusted/add" && req.method === "POST") { const b = await readBody(req); return json(res, trustSite(b.site)); }
      if (u.pathname === "/api/screens/trusted/remove" && req.method === "POST") { const b = await readBody(req); return json(res, untrustSite(b.site)); }
      if (u.pathname === "/api/screens/signin" && req.method === "POST") { const b = await readBody(req); return json(res, await signIn(b.site)); }
      // What Symbiot remembers across the app (mind.mjs), and forgetting it.
      if (u.pathname === "/api/mind") return json(res, mindState());
      if (u.pathname === "/api/mind/forget" && req.method === "POST") { const b = await readBody(req); return json(res, forget(String(b.id || ""))); }
      // Links (links.mjs): one click per standard work site: sign in, trust it, watch it.
      if (u.pathname === "/api/links") { let reach = null; try { reach = linkReach(); } catch {} return json(res, { ...linksState(), ...(reach ? { reach } : {}) }); } // reach: which sites agent runs can use too (agents.mjs)
      if (u.pathname === "/api/links/link" && req.method === "POST") { const b = await readBody(req); return json(res, await linkSite(String(b.id || ""), b.here ? { open: async (url) => ({ ok: true, url }) } : undefined)); } // here: from the Symbiot Browser, which opens the site itself
      if (u.pathname === "/api/browser/open" && req.method === "POST") { const b = await readBody(req); if (process.env.SYMBIOT_NO_OPEN === "1") return json(res, { ok: false, note: "not opened (SYMBIOT_NO_OPEN)", page: browserHub() }); return json(res, await openSymbiotBrowser(b.url ? siteUrl(String(b.url)) : "")); }
      if (u.pathname === "/api/browser/done" && req.method === "POST") { if (process.env.SYMBIOT_NO_OPEN === "1") return json(res, { closed: 0 }); const r = await closeSymbiotBrowser(); const recheck = () => { for (const it of linksState().items) if (it.state !== "off" && it.state !== "ok") checkLink(it.id).catch(() => {}); };
        // and once more a little later: a site may still be saving its sign-in when the window closes
        setTimeout(recheck, 1500); setTimeout(recheck, 20000); return json(res, { ...r, checking: true }); }
      // any site, added in Settings → Connections or the Symbiot Browser's address bar, or a card's / reply's "Sign in to <site>": linked and opened to sign in
      if (u.pathname === "/api/links/site" && req.method === "POST") { const b = await readBody(req), here = b.here ? { open: async (url) => ({ ok: true, url }) } : undefined; return json(res, b.id ? await linkSite(String(b.id), here) : await addSite(String(b.site || ""), here)); }
      if (u.pathname === "/api/links/check" && req.method === "POST") { const b = await readBody(req); return json(res, await checkLink(String(b.id || ""))); }
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
      if (u.pathname === "/api/marketing/draft") return json(res, draftPreview(String(u.searchParams.get("rel") || "")));
      if (u.pathname === "/api/marketing/media") { const m = laneMedia(String(u.searchParams.get("rel") || "")); if (!m) { res.writeHead(404); res.end("not found"); return; } res.writeHead(200, { "content-type": m.type, "cache-control": "private, max-age=300" }); res.end(readFileSync(m.file)); return; }
      if (u.pathname === "/api/marketing/draft/answer" && req.method === "POST") { { const g = can("marketing"); if (!g.ok) return json(res, { error: g.why, pro: true }); } const b = await readBody(req); return json(res, b.change !== undefined ? marketingDraftAnswer(String(b.rel || ""), "change", { ask: String(b.change || "") }) : marketingDraftAnswer(String(b.rel || ""), b.skip ? "skipped" : "approved")); }
      if (u.pathname === "/api/marketing/open" && req.method === "POST") { const b = await readBody(req), f = join(MARKETING_DIR, String(b.rel || "")); return json(res, f.startsWith(MARKETING_DIR + "/") && existsSync(f) ? { ok: openUrl(f) } : { error: "That draft isn't there any more." }); }
      // the pick tray (tray.mjs): its captures and their blur boxes, a capture (only from inside
      // a tray), a box switched on or off and the capture blurred again, a capture as a post's media
      if (u.pathname === "/api/marketing/tray") return json(res, { trays: trays() });
      if (u.pathname === "/api/marketing/tray/media") { const m = trayMedia(String(u.searchParams.get("rel") || "")); if (!m) { res.writeHead(404); res.end("not found"); return; } res.writeHead(200, { "content-type": m.type, "cache-control": "private, max-age=86400" }); res.end(readFileSync(m.file)); return; }
      if (u.pathname === "/api/marketing/tray/blur" && req.method === "POST") { const b = await readBody(req), r = setBlur(String(b.tray || ""), String(b.name || ""), b.id, !!b.on); if (r.error) return json(res, r); const d = await renderCapture(String(b.tray), String(b.name)); return json(res, { ...r, rendered: !!d.ok, ...(d.error ? { note: d.error } : {}) }); }
      if (u.pathname === "/api/marketing/tray/use" && req.method === "POST") { const b = await readBody(req); return json(res, setDraftMedia(String(b.rel || ""), [].concat(b.file || []).map(String))); }
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
      if (u.pathname === "/api/reports") return json(res, { reports: listReports() });
      if (u.pathname === "/api/reports/read") return json(res, readReport(u.searchParams.get("id") || ""));
      // A report's image (an <img> src, so its token is in ?t=): by the report's id and a src it shows, from its allowed folders only.
      if (u.pathname === "/api/reports/image") { const f = reportImage(u.searchParams.get("id") || "", u.searchParams.get("src") || ""); if (f.error) { res.writeHead(404, { "content-type": "text/plain" }); res.end(f.error); return; } res.writeHead(200, { "content-type": f.type, "cache-control": "private, no-cache", "x-content-type-options": "nosniff" }); res.end(readFileSync(f.file)); return; }
      if (u.pathname === "/api/reports/seen" && req.method === "POST") return json(res, markAllRead());
      if (u.pathname === "/api/reports/ideas" && req.method === "POST") { const b = await readBody(req); return json(res, reportIdeasAdd(String(b.id || ""), b.ideas)); }
      if (u.pathname === "/api/reports/ask" && req.method === "POST") { const b = await readBody(req); return json(res, await reportAsk(String(b.id || ""), b.question)); }
      if (u.pathname === "/api/reports/draft" && req.method === "POST") { const b = await readBody(req); return json(res, reportDraftAnswer(String(b.id || ""), !!b.approve)); }
      // Home (home.mjs): the liquid's live data, and its talk; Adapt (adapt.mjs): its
      // shape from how you use it (commit=1 when it wakes from rest, never mid-gesture).
      if (u.pathname === "/api/home") return json(res, homeState({ fresh: u.searchParams.get("fresh") === "1" }));
      // the work scene: what agents are doing, what's waiting, what's ready; Go starts what's waiting
      if (u.pathname === "/api/work") return json(res, workScene());
      if (u.pathname === "/api/work/go" && req.method === "POST") return json(res, workGo());
      if (u.pathname === "/api/onboarding") return json(res, onboarding({ fresh: u.searchParams.get("fresh") === "1" }));
      if (u.pathname === "/api/onboarding/set" && req.method === "POST") { const b = await readBody(req); return json(res, setOnboarding({ step: b.step, skip: b.skip, unskip: b.unskip, skipRest: !!b.skipRest })); }
      if (u.pathname === "/api/onboarding/done" && req.method === "POST") return json(res, setOnboarding({ done: true }));
      if (u.pathname === "/api/onboarding/restart" && req.method === "POST") return json(res, setOnboarding({ restart: true }));
      if (u.pathname === "/api/look" && req.method === "POST") { const b = await readBody(req), look = ["ferro", "glass", "pearl"].includes(b.look) ? b.look : "ferro"; const cf = loadConfig(); if (cf.look !== look) { cf.look = look; saveConfig(cf); } return json(res, { look, launcher: setLauncherLook(look) }); }
      if (u.pathname === "/api/firststeps") return json(res, firstSteps()); // Settings' first steps: what's set up, in order
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
      if (u.pathname === "/api/lanes") return json(res, lanesState());
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
      if (u.pathname === "/api/phone/code" && req.method === "POST") return json(res, newCode());
      if (u.pathname === "/api/phone/unpair" && req.method === "POST") { const b = await readBody(req); return json(res, unpairPhone(String(b.id || ""))); }
      if (u.pathname === "/api/phone/relay" && req.method === "POST") { const b = await readBody(req); return json(res, setRelay(b.on === true)); }
      if (u.pathname === "/api/phone/pair" && req.method === "POST") { const b = await readBody(req); return json(res, await pairComputer(b.address, b.code, { link: String(b.link || "") })); }
      if (u.pathname === "/api/phone/check" && req.method === "POST") return json(res, await pollComputer());
      if (u.pathname === "/api/phone/find") return json(res, { found: await findComputers() });
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
      if (u.pathname === "/api/ping") { if (u.searchParams.get("fresh") === "1" && !SANDBOX) await checkLatest(); const w = u.searchParams.get("w") || ""; if (/^[a-z0-9]{6,20}$/.test(w) && u.searchParams.get("new") === "1" && !headlessAgent(req.headers["user-agent"])) NEWEST_WIN = w; return json(res, { ...(NEWEST_WIN ? { window: NEWEST_WIN } : {}), version: VERSION, started: SERVER_STARTED, latest: LATEST_VERSION, newer: !SANDBOX && !DESKTOP && semverGt(LATEST_VERSION, VERSION), ...(DESKTOP ? { desktop: true } : {}), ...(UPDATING && UPDATING.retrying ? { retrying: UPDATING } : {}), ...(IN_TERMUX ? { termux: true } : {}), ...(SANDBOX ? { sandbox: true } : {}) }); }
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
        // Install the exact newest version (see updateCmd), then relaunch this
        // same app (same port+token => same URL) and exit. The page's heartbeat
        // reconnects and reloads. Free the port first and mark the new copy as a
        // relaunch, so it takes over instead of finding us and bowing out.
        // SYMBIOT_UPDATE_CMD replaces the install (the tests use a no-op).
        if (SANDBOX) return json(res, { error: "This is a sandbox (symbiot app --fresh): update your real Symbiot instead." });
        const { target, cmd } = updateCmd(LATEST_VERSION, VERSION);
        const inst = process.env.SYMBIOT_UPDATE_CMD || cmd;
        // npm lists a new version a little before its download is there (a 404 for the
        // .tgz): then it tries again every 30s, up to 5 times, and says so, instead of
        // giving up and sending you to a terminal.
        const attempt = (n) => track("symbiot update", inst, homedir(), (code) => {
          if (code !== 0) {
            const tail = readRunLog(join(homedir(), ".symbiot", "agent.log")).slice(-3000);
            if (n < 5 && /E404|ETARGET|notarget|No matching version|is not in this registry/i.test(tail)) { UPDATING = { target, retrying: true, attempt: n + 1, at: Date.now() }; setTimeout(() => attempt(n + 1), 30000).unref(); }
            else UPDATING = null;
            return;
          }
          server.close(); if (server.closeAllConnections) server.closeAllConnections();
          try { const ch = spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: "ignore", env: { ...process.env, SYMBIOT_RELAUNCH: "1" }, cwd: homedir() }); ch.unref(); } catch {}
          setTimeout(() => process.exit(0), 1200);
        });
        UPDATING = { target, attempt: 1, at: Date.now() };
        const e = attempt(1);
        return json(res, { started: true, id: e ? e.id : "", target });
      }
      if (u.pathname === "/api/quit") { stopVoices(); res.writeHead(200); res.end("bye"); setTimeout(() => process.exit(0), 150); return; }
    } catch (e) { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: String((e && e.message) || e) })); return; }
    res.writeHead(404); res.end("not found");
  });
  let announced = false, tries = 0, opened = false;
  server.on("listening", () => {
    if (announced) return; announced = true;
    const url = `http://127.0.0.1:${server.address().port}/?t=${TOKEN}`;
    setBrowserHub(`http://127.0.0.1:${server.address().port}/browser?t=${TOKEN}`); // the Symbiot Browser opens on its own page, served from here
    const how = opened || RELAUNCH || process.env.SYMBIOT_NO_OPEN === "1" ? "" : openApp(url); opened = true; // only pop a window the first time (never in tests, never after an update)
    console.log(`\n${c.g("●")} ${c.b("Symbiot")} is running at ${c.b(url)}`);
    console.log(RELAUNCH ? c.d("  Restarted after an update; the open window reloads itself.") : how ? c.d(`  Opened in ${/^[aeiou]/.test(how) ? "an" : "a"} ${how}.`) : c.d("  Open that URL in your browser."));
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
        console.log(`\n${c.g("●")} ${c.b("Symbiot")} is already running (v${p.version}) at ${c.b(url)}`);
        console.log(how ? c.d(`  Opened the existing window (${/^[aeiou]/.test(how) ? "an" : "a"} ${how}).`) : c.d("  Open that URL in your browser."));
        process.exit(0);
      }
      try { server.listen(0, "127.0.0.1"); } catch {}
    });
  });
  server.listen(PORT, "127.0.0.1");
  checkLatest(); setInterval(checkLatest, 2 * 60 * 1000).unref(); // background update check (every 2 min)
  startWeekly(writeup); // the weekly write-up + notification, when switched on in Settings
  startWatches(); // pages you watch (Screens → Watch), read every few minutes
  // Your phone: the computer listens if it's switched on, the phone asks if it's paired.
  // An Approve from a paired phone is this same Approve, release notes and all.
  setPhoneApprove(async (repo, untasked) => { const notes = await releaseNotes(releaseInput(repo, {})); return untasked ? approveChanges(repo, { tick: [], notes }) : approveRepo(repo, { notes }); });
  startPhone();
  setInterval(() => { try { startWaiting(); } catch {} }, 20000).unref(); // a run that waits for your step starts once the file it names changes
  setInterval(() => { try { workTick(); } catch {} }, 20000).unref(); // a waiting task starts once its lane is free (config.autoStart: false leaves it to Go)
  setInterval(() => { try { lanesTick(); } catch {} }, 20000).unref(); // agents hand work to other lanes, and hear back when it's done
  setTimeout(() => { orcaRelink().catch(() => {}); }, 15000).unref(); // a lane folder a handover renamed, added again in Orca where it is now
  // an agent's allow list that stays inside your work is turned on by itself, and the agent carries on
  setTimeout(() => { try { autoAllowSweep(); } catch {} }, 4000).unref();
  setInterval(() => { try { autoAllowSweep(); } catch {} }, 20000).unref();
  // a finished run's last words, read by your AI for anything left to you that the patterns missed (agents.mjs readLastWords)
  setInterval(() => { readLastWords().catch(() => {}); }, 60000).unref();
  // knowledge folders: changed files re-read (a stat per file when nothing changed), then checked again for where two files disagree (checks.mjs)
  const knowTick = () => { try { const r = knowledgeTick(); if (r && (r.read || r.removed || !checksState().at)) runChecks(); } catch {} };
  setTimeout(knowTick, 5000).unref(); setInterval(knowTick, 3 * 60 * 1000).unref();
  setInterval(() => { try { awaitTick(); } catch {} }, 60000).unref(); // a reply an agent's email waits on: found, and handed on
}

export { headlessAgent, updateCmd, changesSince, whatsNew, tarFile, registryChangelog, BROWSER_KEEP, startApp, askRunningApp, isAppRunningWeekly, openApp };
