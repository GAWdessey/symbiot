// `symbiot app`: the local server behind the app window. It serves the page
// (ui.mjs) and its /api routes, each a thin call into the module that does the
// work, on 127.0.0.1 only and behind the per-install token. (Watch on your phone
// listens on your network separately, only for that: phone.mjs.)
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { EMBEDDED_UI } from "./ui.mjs";
import { VERSION, LATEST_VERSION, REGISTRY, semverGt, checkLatest, CONFIG_PATH, loadConfig, saveConfig, loadTasks, hasCmd, chromeBinary, CONFIG_DIR } from "./core.mjs";
import { shSingle, handoffCmd, setHandoffCmd, grantAgent, runHandoff, track, detectHandoffs, connectorsInfo, answerQuestions, skipIdea, agentsList, startWaiting, parkLane, parkedPaths, autoAllowSweep, trustFull } from "./agents.mjs";
import { PROVIDERS, resolveProvider, connectProvider, detectHardware, recommendModels, hasOllama, ollamaInstall, ensureOllama, useOllamaModel } from "./ai.mjs";
import { SCAN, SCAN_TIMEOUT_MS, scanRoots, scanHome, addScanRoot, removeScanRoot, buildMap, nodeDetail, repoPathMap } from "./scan.mjs";
import { computeDrift } from "./drift.mjs";
import { addTask, toggleTask, removeTask, restoreTask, syncTasks, taskType, pushTasks, pendingReview, workingDiff, learnNpm, withReleases, releaseInput, approveRepo, approveChanges, sendBack, setAutoMerge } from "./tasks.mjs";
import { repoReview, repoSuggest, folderSuggest, taskChat, clearTaskChat, mailState, setMail, sentMail, produce, releaseNotes } from "./writeups.mjs";
import { loadScreens, screenImage, captureScreen, splitScreen, listMonitors, allowScreenshots, importScreen, setRegions, renameScreen, removeScreen, blueprint, clickRegion } from "./screens.mjs";
import { mapPage, wholePage, pressRegion, typeRegion, scrollPage, signIn, keepBrowserOpen, isTrusted, trustedSites, trustSite, untrustSite } from "./headless.mjs";
import { weeklyState, setWeekly, runWeekly, startWeekly, autostartState, setAutostart } from "./desktop.mjs";
import { watchState, addWatch, setEvery, removeWatch, clearNews, seenWatch, checkWatch, startWatches, setBrief, draftReply, openChat, watchBoard, boardChat, clearBoardChat } from "./watch.mjs";
import { linksState, linkSite, checkLink, unlinkSite } from "./links.mjs";
import { postsState, draftPosts, approvePost, editPost, skipPost, voiceFromLinkedIn } from "./post.mjs";
import { mindState, forget } from "./mind.mjs";
import { lanesTick, lanesState, partlyDone } from "./lanes.mjs";
import { keepFacts, skipFacts, awaitTick, awaitingState, stopWaiting } from "./handback.mjs";
import { adaptState, noteUse } from "./adapt.mjs";
import { homeState, homeAsk, workScene, workGo, firstSteps } from "./home.mjs";
import { listReports, readReport, markAllRead } from "./reports.mjs";
import { phoneState, setPhoneLink, newCode, unpairPhone, pairComputer, forgetComputer, pollComputer, startPhone } from "./phone.mjs";
import { knowledgeState, addKnowledgeFolder, removeKnowledgeFolder, indexKnowledge, knowledgeTick, searchKnowledge } from "./knowledge.mjs";
import { runChecks, checksState } from "./checks.mjs";

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
// http://127.0.0.1:<port>/?t=<token> -> symbiot://127.0.0.1:<port>/?t=<token>, for the Android app
function appLink(url) { return url.replace(/^http:\/\//, "symbiot://"); }
// Symbiot running in Termux (not the Android app's own)
const IN_TERMUX = process.platform === "android" && process.env.SYMBIOT_ANDROID_APP !== "1";
const SANDBOX = !!process.env.SYMBIOT_SANDBOX; // symbiot app --fresh (sandbox.mjs)
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
  // Stable token + port so the URL survives a restart — the open tab can
  // reconnect and auto-reload itself instead of you closing and reopening it.
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
      const url = `http://127.0.0.1:${PORT}/?t=${TOKEN}`; const how = process.env.SYMBIOT_NO_OPEN === "1" ? "" : openApp(url);
      console.log(`\n${c.g("●")} ${c.b("Symbiot")} is already running (v${p.version}) at ${c.b(url)}`);
      console.log(how ? c.d(`  Opened the existing window (a ${how}).`) : c.d("  Open that URL in your browser."));
      console.log(c.d("  (Not starting a second copy. Set SYMBIOT_FORCE_NEW=1 to force one.)"));
      return;
    }
  }
  // Screens' hidden browser stays open between map, press and type (headless.mjs),
  // so an agent can type into a field and then press a separate button there.
  keepBrowserOpen(BROWSER_KEEP);
  const json = (res, obj) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  const screenOut =(s) => (s && s.id ? { ...s, blueprint: blueprint(s), ...(s.page ? { trusted: isTrusted(s.page.url) } : {}) } : s && s.screens ? { ...s, screens: s.screens.map(screenOut) } : s);
  let UPDATING = null; // an update in flight: { target, attempt, retrying? }
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && u.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(EMBEDDED_UI); return; }
    // the app's typeface ships in the package (fonts/), so it's there offline
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
      if (u.pathname === "/api/status") { const r = resolveProvider(); return json(res, r ? { connected: true, line: `${PROVIDERS[r.provider].label} · ${r.model}` } : { connected: false }); }
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
      if (u.pathname === "/api/pending/diff") { const p = repoPathMap()[u.searchParams.get("repo") || ""]; return json(res, { diff: p ? workingDiff(p) : "" }); }
      if (u.pathname === "/api/pending/approve" && req.method === "POST") { const b = await readBody(req), repo = String(b.repo || ""); if (b.bump) await learnNpm([repoPathMap()[repo]]); const notes = await releaseNotes(releaseInput(repo, { bump: b.bump })); return json(res, approveRepo(repo, { bump: b.bump, notes })); }
      if (u.pathname === "/api/pending/approve-changes" && req.method === "POST") { const b = await readBody(req), repo = String(b.repo || ""); if (b.bump) await learnNpm([repoPathMap()[repo]]); const notes = await releaseNotes(releaseInput(repo, { bump: b.bump, tick: b.tick })); return json(res, approveChanges(repo, { bump: b.bump, tick: b.tick, notes })); }
      if (u.pathname === "/api/pending/sendback" && req.method === "POST") { const b = await readBody(req); return json(res, sendBack(String(b.id || ""))); }
      if (u.pathname === "/api/automerge" && req.method === "POST") { const b = await readBody(req); return json(res, setAutoMerge(String(b.repo || ""), !!b.on)); }
      if (u.pathname === "/api/tasks/push" && req.method === "POST") { const b = await readBody(req); return json(res, pushTasks(b)); }
      if (u.pathname === "/api/scanroots") return json(res, { roots: loadConfig().scanRoots || [], effective: scanRoots(), home: scanHome() });
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
      if (u.pathname === "/api/knowledge/search") return json(res, { hits: searchKnowledge(u.searchParams.get("q") || "", { examples: u.searchParams.get("examples") === "1" }) });
      if (u.pathname === "/api/agentcfg") { const d = detectHandoffs(); return json(res, { cmd: handoffCmd(), agents: d.agents, editors: d.editors, connectors: connectorsInfo() }); }
      if (u.pathname === "/api/agentcmd" && req.method === "POST") { const b = await readBody(req); return json(res, setHandoffCmd(b.cmd)); }
      if (u.pathname === "/api/agent/trust") return json(res, { full: trustFull() });
      if (u.pathname === "/api/agent/trust/set" && req.method === "POST") { const b = await readBody(req); const cfg = loadConfig(); if (b.full) delete cfg.agentTrust; else cfg.agentTrust = "ask"; saveConfig(cfg); return json(res, { full: trustFull() }); }
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
      if (u.pathname === "/api/agents/answer" && req.method === "POST") { const b = await readBody(req); return json(res, answerQuestions(String(b.path || ""), b.answers, { rerun: !!b.rerun })); }
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
      if (u.pathname === "/api/screens/trusted") return json(res, { sites: trustedSites() });
      if (u.pathname === "/api/screens/trusted/add" && req.method === "POST") { const b = await readBody(req); return json(res, trustSite(b.site)); }
      if (u.pathname === "/api/screens/trusted/remove" && req.method === "POST") { const b = await readBody(req); return json(res, untrustSite(b.site)); }
      if (u.pathname === "/api/screens/signin" && req.method === "POST") { const b = await readBody(req); return json(res, await signIn(b.site)); }
      // What Symbiot remembers across the app (mind.mjs), and forgetting it.
      if (u.pathname === "/api/mind") return json(res, mindState());
      if (u.pathname === "/api/mind/forget" && req.method === "POST") { const b = await readBody(req); return json(res, forget(String(b.id || ""))); }
      // Links (links.mjs): one click per standard work site: sign in, trust it, watch it.
      if (u.pathname === "/api/links") return json(res, linksState());
      if (u.pathname === "/api/links/link" && req.method === "POST") { const b = await readBody(req); return json(res, await linkSite(String(b.id || ""))); }
      if (u.pathname === "/api/links/check" && req.method === "POST") { const b = await readBody(req); return json(res, await checkLink(String(b.id || ""))); }
      if (u.pathname === "/api/links/unlink" && req.method === "POST") { const b = await readBody(req); return json(res, unlinkSite(String(b.id || ""))); }
      // Posts (post.mjs): the week's drafts, waiting on you. Approve only records your yes:
      // the page copies the post itself and opens LinkedIn's share box; nothing is posted.
      if (u.pathname === "/api/posts") return json(res, postsState());
      if (u.pathname === "/api/posts/draft" && req.method === "POST") return json(res, await draftPosts());
      if (u.pathname === "/api/posts/approve" && req.method === "POST") { const b = await readBody(req); return json(res, approvePost(String(b.id || ""), { copy: null })); }
      if (u.pathname === "/api/posts/edit" && req.method === "POST") { const b = await readBody(req); return json(res, editPost(String(b.id || ""), b.text)); }
      if (u.pathname === "/api/posts/skip" && req.method === "POST") { const b = await readBody(req); return json(res, skipPost(String(b.id || ""))); }
      // reads your LinkedIn only on your click (confirmed), never by itself
      if (u.pathname === "/api/posts/voice" && req.method === "POST") { const b = await readBody(req); if (b.confirmed !== true) return json(res, { error: "Reading your LinkedIn posts needs your click." }); return json(res, await voiceFromLinkedIn()); }
      // Reports (reports.mjs): what runs wrote up in their .symbiot/; read by id, never by path.
      if (u.pathname === "/api/reports") return json(res, { reports: listReports() });
      if (u.pathname === "/api/reports/read") return json(res, readReport(u.searchParams.get("id") || ""));
      if (u.pathname === "/api/reports/seen" && req.method === "POST") return json(res, markAllRead());
      // Home (home.mjs): the liquid's live data, and its talk; Adapt (adapt.mjs): its
      // shape from how you use it (commit=1 when it wakes from rest, never mid-gesture).
      if (u.pathname === "/api/home") return json(res, homeState({ fresh: u.searchParams.get("fresh") === "1" }));
      // the work scene: what agents are doing, what's waiting, what's ready; Go starts what's waiting
      if (u.pathname === "/api/work") return json(res, workScene());
      if (u.pathname === "/api/work/go" && req.method === "POST") return json(res, workGo());
      if (u.pathname === "/api/firststeps") return json(res, firstSteps()); // Settings' first steps: what's set up, in order
      if (u.pathname === "/api/home/ask" && req.method === "POST") { const b = await readBody(req); return json(res, await homeAsk(b.question, { images: saveShots(b.images) })); }
      if (u.pathname === "/api/adapt") return json(res, adaptState({ from: String(u.searchParams.get("from") || ""), commit: u.searchParams.get("commit") === "1", ...(u.searchParams.has("touch") ? { touch: u.searchParams.get("touch") === "1" } : {}) }));
      if (u.pathname === "/api/adapt/use" && req.method === "POST") { const b = await readBody(req); return json(res, noteUse(b)); }
      // Lanes (lanes.mjs): work agents handed to each other, and where it stands.
      if (u.pathname === "/api/lanes") return json(res, lanesState());
      // a parked project (lane) starts no agent runs until it's unparked (agents.mjs parkLane)
      if (u.pathname === "/api/lanes/parked") { const map = repoPathMap(), ps = parkedPaths(); return json(res, { repos: Object.keys(map).filter((n) => ps.includes(map[n])), paths: ps }); }
      if (u.pathname === "/api/lanes/park" && req.method === "POST") { const b = await readBody(req), map = repoPathMap(), p = Object.values(map).includes(String(b.path || "")) ? String(b.path) : map[String(b.repo || "")]; if (!p) return json(res, { error: "That project isn't on this computer." }); return json(res, parkLane(p, b.on !== false)); }
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
      // Watch on your phone (phone.mjs). On the computer: listen on your network
      // for the phone (only on your click), a pairing code, the phones paired.
      // On the phone: pair with the computer, ask it now, forget it.
      if (u.pathname === "/api/phone") return json(res, phoneState());
      if (u.pathname === "/api/phone/link" && req.method === "POST") { const b = await readBody(req); return json(res, await setPhoneLink(b.on === true)); }
      if (u.pathname === "/api/phone/code" && req.method === "POST") return json(res, newCode());
      if (u.pathname === "/api/phone/unpair" && req.method === "POST") { const b = await readBody(req); return json(res, unpairPhone(String(b.id || ""))); }
      if (u.pathname === "/api/phone/pair" && req.method === "POST") { const b = await readBody(req); return json(res, await pairComputer(b.address, b.code)); }
      if (u.pathname === "/api/phone/check" && req.method === "POST") return json(res, await pollComputer());
      if (u.pathname === "/api/phone/forget" && req.method === "POST") return json(res, forgetComputer());
      // What symbiot-desktop added (desktop.mjs): the weekly write-up, start at login.
      if (u.pathname === "/api/desktop") return json(res, { weekly: weeklyState(), autostart: autostartState() });
      if (u.pathname === "/api/desktop/weekly" && req.method === "POST") { const b = await readBody(req); return json(res, setWeekly(b)); }
      if (u.pathname === "/api/desktop/weekly/run" && req.method === "POST") { const b = await readBody(req); return json(res, await runWeekly(writeup, { notify: b.notify !== false })); }
      if (u.pathname === "/api/desktop/autostart" && req.method === "POST") { const b = await readBody(req); return json(res, setAutostart(!!b.on, bin)); }
      // the Week tab's week is saved to weeks/ too, as Write it now saves it (no notification: you're looking at it)
      if (u.pathname === "/api/run" && req.method === "POST") { const b = await readBody(req); const cmd = ["week", "standup", "todo"].includes(b.cmd) ? b.cmd : "week"; return json(res, cmd === "week" ? await runWeekly(writeup, { notify: false }) : await writeup(cmd)); }
      if (u.pathname === "/api/connect" && req.method === "POST") { return json(res, await connectProvider(await readBody(req))); }
      // a sandbox (symbiot app --fresh) never offers an update: it would replace your real install
      if (u.pathname === "/api/ping") { if (u.searchParams.get("fresh") === "1" && !SANDBOX) await checkLatest(); return json(res, { version: VERSION, started: SERVER_STARTED, latest: LATEST_VERSION, newer: !SANDBOX && semverGt(LATEST_VERSION, VERSION), ...(UPDATING && UPDATING.retrying ? { retrying: UPDATING } : {}), ...(IN_TERMUX ? { termux: true } : {}), ...(SANDBOX ? { sandbox: true } : {}) }); }
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
            let tail = ""; try { tail = readFileSync(join(homedir(), ".symbiot", "agent.log"), "utf8").slice(-3000); } catch {}
            if (n < 5 && /E404|ETARGET|notarget|No matching version|is not in this registry/i.test(tail)) { UPDATING = { target, retrying: true, attempt: n + 1, at: Date.now() }; setTimeout(() => attempt(n + 1), 30000).unref(); }
            else UPDATING = null;
            return;
          }
          server.close(); if (server.closeAllConnections) server.closeAllConnections();
          try { const ch = spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: "ignore", env: { ...process.env, SYMBIOT_RELAUNCH: "1" } }); ch.unref(); } catch {}
          setTimeout(() => process.exit(0), 1200);
        });
        UPDATING = { target, attempt: 1, at: Date.now() };
        const e = attempt(1);
        return json(res, { started: true, id: e ? e.id : "", target });
      }
      if (u.pathname === "/api/quit") { res.writeHead(200); res.end("bye"); setTimeout(() => process.exit(0), 150); return; }
    } catch (e) { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: String((e && e.message) || e) })); return; }
    res.writeHead(404); res.end("not found");
  });
  let announced = false, tries = 0, opened = false;
  server.on("listening", () => {
    if (announced) return; announced = true;
    const url = `http://127.0.0.1:${server.address().port}/?t=${TOKEN}`;
    const how = opened || RELAUNCH || process.env.SYMBIOT_NO_OPEN === "1" ? "" : openApp(url); opened = true; // only pop a window the first time (never in tests, never after an update)
    console.log(`\n${c.g("●")} ${c.b("Symbiot")} is running at ${c.b(url)}`);
    console.log(RELAUNCH ? c.d("  Restarted after an update; the open window reloads itself.") : how ? c.d(`  Opened in a ${how}.`) : c.d("  Open that URL in your browser."));
    console.log(c.d("  Leave this running; press Ctrl+C to stop (or click Quit in the window)."));
  });
  server.on("error", (e) => {
    // Stable port busy (an older instance still exiting during an update, or a
    // second app): retry briefly, then fall back to a random port.
    if (e && e.code === "EADDRINUSE" && tries < 8) { tries++; setTimeout(() => { try { server.listen(PORT, "127.0.0.1"); } catch {} }, 500); }
    else { try { server.listen(0, "127.0.0.1"); } catch {} }
  });
  server.listen(PORT, "127.0.0.1");
  checkLatest(); setInterval(checkLatest, 2 * 60 * 1000).unref(); // background update check (every 2 min)
  startWeekly(writeup); // the weekly write-up + notification, when switched on in Settings
  startWatches(); // pages you watch (Screens → Watch), read every few minutes
  startPhone(); // Watch on your phone: the computer listens if it's switched on, the phone asks if it's paired
  setInterval(() => { try { startWaiting(); } catch {} }, 20000).unref(); // a run that waits for your step starts once the file it names changes
  setInterval(() => { try { lanesTick(); } catch {} }, 20000).unref(); // agents hand work to other lanes, and hear back when it's done
  // an agent's allow list that stays inside your work is turned on by itself, and the agent carries on
  setTimeout(() => { try { autoAllowSweep(); } catch {} }, 4000).unref();
  setInterval(() => { try { autoAllowSweep(); } catch {} }, 20000).unref();
  // knowledge folders: changed files re-read (a stat per file when nothing changed), then checked again for where two files disagree (checks.mjs)
  const knowTick = () => { try { const r = knowledgeTick(); if (r && (r.read || r.removed || !checksState().at)) runChecks(); } catch {} };
  setTimeout(knowTick, 5000).unref(); setInterval(knowTick, 3 * 60 * 1000).unref();
  setInterval(() => { try { awaitTick(); } catch {} }, 60000).unref(); // a reply an agent's email waits on: found, and handed on
}

export { updateCmd, changesSince, whatsNew, tarFile, registryChangelog, BROWSER_KEEP, startApp, askRunningApp, isAppRunningWeekly };
