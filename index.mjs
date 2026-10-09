#!/usr/bin/env node
// symbiot — your week, written from your real work.
//
// Reads your local git activity (no accounts, no OAuth, no integrations) and
// writes the update you'd actually send. It writes with an AI of your choice —
// Claude, OpenAI, Gemini, or a local model (Ollama) — set up once with
// `symbiot login`.
//
//   symbiot week      your week, written up          (default)
//   symbiot standup   yesterday + today, for standup
//   symbiot todo      what's still on your plate
//   symbiot mail      add the mail you sent to write-ups (local, no API)
//   symbiot login    connect it to an AI (once)
//   symbiot whoami    show how it's connected
//   symbiot help
//
// Flags:  --dir <path>  where to look (default: your home folder)
//         --since <n>   days back for `week` (default 7)
//         --plain       no colour, no spinner (for piping)
//
// This file is the CLI. The work is in modules: scan.mjs (finding and reading
// your repos), ai.mjs (the AI it writes with), writeups.mjs (what it writes),
// tasks.mjs (tasks, review and Approve), agents.mjs (handing work to an agent),
// drift.mjs, server.mjs (`symbiot app`'s server) and ui.mjs (its page).

import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { realpathSync, readFileSync, mkdirSync, openSync, rmSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { EMBEDDED_UI } from "./ui.mjs";
import { VERSION, CONFIG_PATH, CONFIG_DIR, loadConfig, saveConfig, repoState, semverGt } from "./core.mjs";
import { HANDOFF_PROMPT, CLAUDE_CMD, ORCA_CLAUDE_CMD, handoffCmd, setHandoffCmd, fillHandoff, runHandoff, orcaHandoffCmd, migrateOrcaCmd, migrateClaudeCmd, parseQuestions, agentQuestions } from "./agents.mjs";
import { AI_UI, PROVIDERS, resolveProvider, validate, detectHardware, recommendModels, hasOllama, ollamaInstall, ensureOllama, useOllamaModel, claudeState, connectProvider } from "./ai.mjs";
import { setScanOptions, scanBase, authorship, readmeInfo, repoShape, houseRules, reportFooter, findAllRepos, buildMap } from "./scan.mjs";
import { gitDefaultBranch, loadDeploys, driftRepo, computeDrift } from "./drift.mjs";
import { buildTasksMd, taskType, shipChanges, shipWithBump, bumpOffer, learnNpm, releaseNeeded, withReleases, setVersion, syncTasks, pendingReview, unreleased, publishesOnMerge, addTask, approveRepo, approveChanges, sendBack, pushTasks } from "./tasks.mjs";
import { produce, mailState, setMail, sentMail } from "./writeups.mjs";
import { loadScreens, screenImage, blueprint } from "./screens.mjs";
import { mapPage, wholePage, pressRegion, typeRegion, uploadRegion, uploadFiles, scrollPage, signIn, isTrusted } from "./headless.mjs";
import { watchState, addWatch, removeWatch, seenWatch, newsSince, markNews, checkWatch, setBrief, draftReply, watchBoard, boardLine, boardChat, boardTalk, clearBoardChat } from "./watch.mjs";
import { PORT as PHONE_PORT, phoneState, pairComputer, pollComputer, forgetComputer } from "./phone.mjs";
import { KIND_LABEL as POST_KIND, PATHS as POST_PATHS, draftPosts, postsState, postLog, approvePost, editPost, skipPost, voiceFromLinkedIn, addMedia as addPostMedia, removeMedia as removePostMedia, mediaDir as postMediaDir, pictureOfPage, clipOfPage } from "./post.mjs";
import { startApp, updateCmd, isAppRunningWeekly, askRunningApp, openApp } from "./server.mjs";
import { listReports, readReport } from "./reports.mjs";
import { runSandbox } from "./sandbox.mjs";
import { knowledgeState, addKnowledgeFolder, removeKnowledgeFolder, indexKnowledge, searchKnowledge, waitingOn, ownerOf, myName, setMyName, itemLine, caseLine } from "./knowledge.mjs";

// ---- tiny arg parse --------------------------------------------------------
const argv = process.argv.slice(2);
// a first word that's a flag means the default (week), except asking for help or the version
const cmd = (argv[0] && (!argv[0].startsWith("-") || ["--help", "-h", "--version", "-v"].includes(argv[0])) ? argv[0] : "week").toLowerCase();
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const has = (name) => argv.includes(`--${name}`);
const PLAIN = has("plain") || !process.stdout.isTTY;
let SERVING = false; // set while `symbiot app` runs — silences the CLI spinner
setScanOptions({ dir: flag("dir", ""), plain: PLAIN });

// ---- colour + spinner ------------------------------------------------------
const c = PLAIN
  ? { g: (s) => s, d: (s) => s, b: (s) => s, y: (s) => s }
  : {
      g: (s) => `\x1b[38;5;42m${s}\x1b[0m`,   // green
      d: (s) => `\x1b[38;5;66m${s}\x1b[0m`,    // faint
      b: (s) => `\x1b[1m${s}\x1b[0m`,          // bold
      y: (s) => `\x1b[38;5;179m${s}\x1b[0m`,   // amber
    };
function spinner(label) {
  if (SERVING) return () => {};
  if (PLAIN) { process.stderr.write(label + "\n"); return () => {}; }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const t = setInterval(() => process.stderr.write(`\r${c.g(frames[i++ % frames.length])} ${c.d(label)} `), 80);
  return () => { clearInterval(t); process.stderr.write("\r\x1b[K"); };
}

function cmdPush() {
  const r = pushTasks();
  if (r.empty) { console.log(c.y("No open tasks to push.") + c.d("  Add some in `symbiot app` — a repo review's ideas, or the Tasks tab.")); return; }
  if (r.written.length) { console.log("\n" + c.g("●") + " " + c.b("Pushed tasks into repos:")); for (const w of r.written) console.log(`  ${c.g("✓")} ${w.name}  ${c.d(w.file + "  (" + w.count + " task" + (w.count > 1 ? "s" : "") + ")")}` + (w.held ? c.y("  held: an agent is still running there, so it lands when that one finishes") : "")); }
  if (r.unresolved.length) { console.log("\n" + c.y(`Not written (repo not found under ${BASE}):`)); for (const u of r.unresolved) console.log(`  · ${u.name} (${u.count})`); }
  if (has("open")) {
    if (!r.handoff) console.log("\n" + c.y("No agent command set.") + c.d("  Set one in `symbiot app` Settings, or `agentCmd` in ~/.config/symbiot/config.json (use {dir} and {prompt})."));
    else {
      const runs = r.written.map((w) => ({ w, e: runHandoff(w.path, { force: has("force") }) }));
      const busy = runs.filter((x) => x.e && x.e.busy), blocked = runs.filter((x) => x.e && x.e.blocked);
      const n = r.written.length - busy.length - blocked.length;
      if (n) console.log("\n" + c.g("→ ") + `Handed ${n} repo(s) to your agent (${r.handoff}).`);
      for (const { w, e } of blocked) console.log("\n" + c.y(`${w.name}: `) + e.note + c.d("  (--force starts it anyway)"));
      for (const { w, e } of busy) console.log("\n" + c.y("Not started: ") + `${w.name} already has an agent running.` + c.d(e.auto ? "  Its new tasks are held, and the app starts an agent on them when it finishes." : "  Its new tasks are held until it finishes. After that, the app starts an agent on them the next time it checks the repo (opening its Tasks tab), or send again."));
    }
  } else {
    console.log("\n" + c.d("Point your agent at .symbiot/TASKS.md in each repo.  (add --open to run your configured agent command)"));
  }
}

// ---- prompt (with masked secret input) ------------------------------------
function ask(question, { secret = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (secret && !PLAIN) {
      rl._writeToOutput = (str) => {
        if (str.includes(question)) rl.output.write(question);
        else if (str.includes("\n")) rl.output.write("\n");
        else rl.output.write("*");
      };
    }
    rl.question(question, (ans) => {
      rl.close();
      if (secret) process.stdout.write("\n");
      resolve((ans || "").trim());
    });
  });
}

const AUTH_HELP =
  c.y("Symbiot needs an AI to write your updates. Connect one:\n") +
  "  " + c.b("symbiot login") + c.d("   your Claude subscription (Claude Code, no key), Claude, OpenAI, Gemini or a local model") + "\n" +
  c.d("  Or set a key in your environment: ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY.");
// What writing with the AI (ai.mjs) shows in the terminal.
Object.assign(AI_UI, {
  spinner,
  notConnected: () => console.log(AUTH_HELP),
  rejected: (label) => console.log(c.y(`Your ${label} credentials were rejected. `) + "Reconnect with:  " + c.b("symbiot login --force")),
});

function header(sub) {
  if (PLAIN) { console.log(`Symbiot\n${sub}\n`); return; }
  console.log(`\n${c.g("●")} ${c.b("Symbiot")} ${c.d("· " + sub)}\n`);
}

// ---- commands -------------------------------------------------------------
const SINCE_WEEK = Number(flag("since", "7"));
const BASE = scanBase();

async function cmdSetupLocal() {
  const model = flag("model", null) || recommendModels(detectHardware()).best;
  if (!hasOllama()) {
    const inst = ollamaInstall();
    console.log("\n" + c.y("Ollama isn't installed") + c.d(" — the free, private local-model runner.") + "\n");
    console.log(`  On ${process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux"}, install it then re-run ${c.b("symbiot setup-local")}:`);
    console.log("    " + c.b(inst.cmd));
    console.log(c.d("    or download: " + inst.alt));
    return;
  }
  process.stdout.write(c.d("Starting Ollama… "));
  if (!(await ensureOllama())) { console.log(c.y("couldn't reach it — start it with ") + c.b("ollama serve")); return; }
  console.log(c.g("ready"));
  console.log("\n" + c.b("Pulling " + model) + c.d("  (first time downloads a few GB — progress below)\n"));
  const code = await new Promise((res) => { const ch = spawn("ollama", ["pull", model], { stdio: "inherit" }); ch.on("close", res); ch.on("error", () => res(1)); });
  if (code !== 0) { console.log("\n" + c.y("Pull failed.") + c.d(" Try a smaller model: ") + c.b("symbiot setup-local --model llama3.2:3b")); return; }
  useOllamaModel(model);
  console.log("\n" + c.g("✓ ") + `Symbiot now runs on ${model} locally — free & private. Try:  ` + c.b("symbiot week"));
}
function cmdModels() {
  const hw = detectHardware(); const rec = recommendModels(hw);
  const pad = (s, n) => String(s).padEnd(n);
  console.log("\n" + c.b("Your machine"));
  console.log(`  ${c.b(hw.ramGB + " GB")} RAM · ${hw.cpuCount}-core ${hw.cpuModel} · ${hw.platform}/${hw.arch}`);
  if (hw.gpu) console.log(`  GPU: ${hw.gpu.name}${hw.gpu.vramGB ? ` (${hw.gpu.vramGB} GB VRAM)` : ""}`);
  console.log("\n" + c.b("Local models") + c.d("  (free & private via Ollama — install: ollama pull <model>)"));
  rec.local.forEach((m) => console.log(`  ${m.fits ? c.g("✓") : c.d("·")} ${pad(m.tier, 5)} ${pad(m.model, 16)} ${c.d("~" + m.needGB + "GB  " + m.note + (m.fits ? "" : "  (needs more RAM)"))}`));
  console.log(c.d(`  Best fit for you: `) + c.b(rec.best) + c.d(`   →  ollama pull ${rec.best}  then  symbiot login  (choose Ollama)`));
  console.log("\n" + c.b("Paid models") + c.d("  (bring an API key — symbiot login)"));
  rec.paid.forEach((p) => console.log(`  ${pad(p.provider, 10)} ${pad(p.tier, 6)} ${pad(p.model, 20)} ${c.d(p.note)}`));
  console.log("");
}

function cmdDrift() {
  const d = computeDrift({ ci: has("ci"), fetch: has("fetch") });
  const warn = d.repos.filter((r) => r.flags.some((f) => f.level === "warn"));
  console.log(`\n${c.g("●")} ${c.b("Symbiot drift")} ${c.d("· " + d.repos.length + " repos · " + warn.length + " with risks")}\n`);
  for (const r of d.repos) {
    if (!r.flags.length) continue;
    const risky = r.flags.some((f) => f.level === "warn");
    console.log(`${risky ? c.y("●") : c.d("○")} ${c.b(r.name)} ${c.d(r.def + (r.fetchAgeDays != null && r.fetchAgeDays > 3 ? " · fetch " + r.fetchAgeDays + "d old" : ""))}`);
    for (const f of r.flags) console.log(`  ${f.level === "warn" ? c.y("⚠") : c.d("·")} ${f.text}${f.evidence ? c.d("  [" + f.evidence + "]") : ""}`);
    console.log("");
  }
  const clean = d.repos.filter((r) => !r.flags.length).map((r) => r.name);
  if (clean.length) console.log(c.d(`clean: ${clean.join(", ")}`));
  console.log(c.d(`\nsymbiot ${VERSION} · local git facts only${d.ci ? " + CI" : " (add --ci for CI status)"}${loadDeploys() && Object.keys(loadDeploys()).length ? "" : " · set ~/.config/symbiot/deploys.json for production-sha checks"}`));
}

async function cmdRun(cmd) {
  if (!resolveProvider()) { console.log(AUTH_HELP); return; }
  const r = await produce(cmd, { since: SINCE_WEEK, all: has("all") });
  header(r.sub || cmd);
  if (r.text) console.log(r.text + "\n");
  if (r.footer) console.log(c.d(r.footer) + "\n");
}

// `symbiot app` (server.mjs). While it serves: no spinner, no scan progress line.
async function cmdApp() {
  // --fresh: a brand-new Symbiot in a throwaway home, to try first run (sandbox.mjs)
  if (has("fresh") && !process.env.SYMBIOT_SANDBOX) {
    process.exitCode = await runSandbox({ bin: realpathSync(fileURLToPath(import.meta.url)), args: argv.slice(1).filter((a) => a !== "--fresh" && a !== "--keep"), keep: has("keep") });
    return;
  }
  SERVING = true; setScanOptions({ quiet: true });
  return startApp({ bin: realpathSync(fileURLToPath(import.meta.url)), since: SINCE_WEEK, all: has("all"), c });
}

function saveAndReport(cfg, what) {
  if (saveConfig(cfg)) {
    console.log(c.g("✓ ") + `Connected: ${what}. Try:  ` + c.b("symbiot week"));
    console.log(c.d(`  Saved in ${CONFIG_PATH} (readable only by you).`));
  } else console.log(c.y("Couldn't write the config file at " + CONFIG_PATH));
}

async function cmdLogin() {
  const flagProvider = flag("provider", null);
  const existing = resolveProvider();
  if (existing && !flagProvider && !flag("key", null) && !has("force")) {
    console.log(c.g("✓ ") + (existing.provider === "claude" ? "Already connected: your Claude subscription, through Claude Code signed in here. No key needed." : `Already connected — ${PROVIDERS[existing.provider].label} via ${existing.source}.`));
    console.log(c.d("  Switch or replace it with `symbiot login --force`."));
    return;
  }

  let provider = flagProvider;
  if (!provider) {
    const cs = claudeState(true);
    console.log("\n" + c.b("Connect Symbiot") + "\n");
    console.log("Which AI should Symbiot write your updates with?\n");
    console.log("  1) " + PROVIDERS.claude.label + c.d(cs.signedIn ? "  — signed in here, no key" : cs.installed ? "  — Claude Code is here; sign in first (run  claude )" : "  — needs Claude Code, signed in (no key)"));
    console.log("  2) " + PROVIDERS.anthropic.label + c.d("    — needs an Anthropic API key"));
    console.log("  3) " + PROVIDERS.openai.label + c.d("          — needs an OpenAI API key"));
    console.log("  4) " + PROVIDERS.gemini.label + c.d("       — needs a Google AI API key"));
    console.log("  5) " + PROVIDERS.ollama.label + c.d("  — runs on your machine, no key"));
    const pick = (await ask("\nChoose 1-5 [1]: ")) || "1";
    provider = { 1: "claude", 2: "anthropic", 3: "openai", 4: "gemini", 5: "ollama" }[pick] || (PROVIDERS[pick] ? pick : "claude");
  }
  if (!PROVIDERS[provider]) { console.log(c.y("Unknown provider: " + provider)); return; }
  const meta = PROVIDERS[provider];
  const cfg = loadConfig();

  if (provider === "claude") {
    const r = await connectProvider({ provider: "claude", model: flag("model", null) || "" });
    if (!r.ok) { console.log(c.y(r.message)); process.exitCode = 1; return; }
    console.log(c.g("✓ ") + r.message + "  Try:  " + c.b("symbiot week"));
    return;
  }
  if (provider === "ollama") {
    const baseUrl = (flag("base-url", null) || (await ask("Ollama URL [http://localhost:11434]: ")) || "").trim() || "http://localhost:11434";
    const model = (flag("model", null) || (await ask(`Model name [${meta.model}]: `)) || "").trim() || meta.model;
    const stop = spinner("checking Ollama…");
    const ok = await validate("ollama", { baseUrl });
    stop();
    if (!ok) { console.log(c.y(`Couldn't reach Ollama at ${baseUrl}. `) + c.d("Is it running?  (try: ollama serve)")); process.exitCode = 1; return; }
    cfg.provider = "ollama"; cfg.ollama = { baseUrl, model }; delete cfg.apiKey;
    saveAndReport(cfg, `${meta.label} · ${model}`);
    return;
  }

  console.log("\n" + c.b(`Connect ${meta.label}`) + "\n" + c.d(`  Get a key at:  ${meta.keyUrl}`) + "\n");
  let key = flag("key", null);
  if (!key) key = await ask(`Paste your ${meta.keyName}: `, { secret: true });
  key = (key || "").trim();
  if (!key) { console.log(c.y("No key entered — nothing saved.")); return; }
  const model = (flag("model", null) || "").trim() || meta.model;

  const stop = spinner("checking the key…");
  const ok = await validate(provider, { key });
  stop();
  if (!ok) {
    console.log(c.y(`That key didn't work for ${meta.label}. `) + c.d("Double-check it and run `symbiot login` again."));
    process.exitCode = 1;
    return;
  }
  cfg.provider = provider; cfg[provider] = { apiKey: key, model }; delete cfg.apiKey;
  saveAndReport(cfg, `${meta.label} · ${model}`);
}

function cmdLogout() {
  const cfg = loadConfig();
  const had = cfg.provider || cfg.apiKey || Object.keys(PROVIDERS).some((p) => cfg[p]);
  delete cfg.provider; delete cfg.apiKey;
  for (const p of Object.keys(PROVIDERS)) delete cfg[p];
  saveConfig(cfg);
  console.log(had ? c.g("✓ ") + `Cleared saved credentials from ${CONFIG_PATH}.` : "No saved credentials to remove.");
  const envs = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"].filter((e) => process.env[e]);
  if (envs.length) console.log(c.d(`Note: still set in your environment: ${envs.join(", ")}.`));
}

function cmdWhoami() {
  const r = resolveProvider();
  if (r) console.log(c.g("✓ ") + `Connected: ${PROVIDERS[r.provider].label} · model ${r.model} · via ${r.source}.`);
  else { console.log(c.y("Not connected yet.\n")); console.log(AUTH_HELP); }
}

// `symbiot mail [--on|--off] [--add <path>]`: what mail it can read, and a preview.
function cmdMail() {
  if (has("on") || has("off")) setMail({ enabled: has("on") });
  const add = flag("add", null);
  if (add) { const r = setMail({ add }); if (r.error) console.log(c.y(r.error)); }
  const m = mailState();
  console.log(`\n${c.g("●")} ${c.b("Symbiot mail")} ${c.d("(experimental) · " + (m.enabled ? "on — what you sent feeds week and standup" : "off"))}\n`);
  const srcs = [...m.detected.map((d) => [d.path, d.kind]), ...m.sources.map((p) => [p, "added"])];
  if (!srcs.length) console.log(c.y("No mail found on this computer.") + c.d("  Use a desktop mail app (Thunderbird, Apple Mail, Evolution…), or add an export:  symbiot mail --add ~/Takeout/Mail/All.mbox"));
  for (const [p, k] of srcs) console.log(`  ${c.g("·")} ${p}  ${c.d(k)}`);
  if (srcs.length) {
    const items = sentMail(SINCE_WEEK, true);
    console.log("\n" + c.b(`${items.length} sent in the last ${SINCE_WEEK} days`) + c.d("  (headers only)"));
    for (const x of items.slice(0, 12)) console.log(`  ${c.d(x.date)}  ${x.subject}  ${c.d("→ " + (x.to.join(", ") || "?"))}`);
  }
  if (!m.enabled) console.log("\n" + c.d("Switch it on with  symbiot mail --on  (or in the app's Settings)."));
}

// ---- `symbiot screens`: Screens from a terminal, for you or an agent ----------
// map / press / show print JSON: the screen's id, its blueprint, each region's id,
// which is what press takes (or a region's label), and the screenshot (`image`),
// for an agent to see what the page says: an email's text isn't a region. `more`
// says the page goes on past the window ("below", "above", "above and below"):
// scroll there to map the rest.
function screenJson(s) {
  if (!s || s.error) return s;
  const bp = blueprint(s), image = screenImage(s.id), sc = s.page && s.page.scroll;
  const more = sc ? [sc.y > 0 && "above", sc.y < sc.max && "below"].filter(Boolean).join(" and ") : "";
  return { id: s.id, ...(image ? { image } : {}), ...(s.note ? { note: s.note } : {}), ...(more ? { more } : {}), ...(s.scrolled ? { scrolled: s.scrolled } : {}), ...(s.pressed ? { pressed: s.pressed, found: s.found } : {}), ...(s.typed ? { typed: s.typed, entered: s.entered, found: s.found } : {}), ...(s.uploaded ? { uploaded: s.uploaded, files: s.files, used: s.used, found: s.found } : {}), ...(s.kept ? { kept: true } : {}), ...(s.page ? { trusted: isTrusted(s.page.url) } : {}), ...bp, regions: bp.regions.map((r, i) => ({ id: s.regions[i].id, ...r })) };
}

// map, press, type and signin go through the app when it's running, whose hidden
// browser stays open between them: type into a field, then press a separate
// button. null when the app isn't running (then the command runs here, and its
// browser closes after it). Once the app has the request, its answer is the
// answer, even a failed one: running it here as well could press twice.
async function viaApp(path, body) {
  const cfg = loadConfig(); if (!cfg.appToken) return null;
  const base = `http://127.0.0.1:${Number(process.env.SYMBIOT_PORT || cfg.appPort) || 7391}`, headers = { "x-symbiot-token": cfg.appToken };
  try { const p = await fetch(base + "/api/ping", { headers, signal: AbortSignal.timeout(1500) }); if (!p.ok || !(await p.json()).version) return null; } catch { return null; }
  try {
    const r = await fetch(base + path, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
    return r.ok ? await r.json() : { error: `Symbiot's app answered ${r.status}.` };
  } catch (e) { return { error: "Lost Symbiot's app mid-way: " + ((e && e.message) || e) }; }
}
// symbiot away: Symbiot full screen on every screen (again: closes it). --shortcut:
// Super+` runs it (on COSMIC it's set up; elsewhere it says how).
async function cmdAway() {
  if (has("shortcut")) {
    const { installShortcut } = await import("./away.mjs");
    const r = installShortcut({ cmd: `${process.execPath} ${process.argv[1]} away` });
    if (r.error) { console.log(c.y(r.error)); process.exitCode = 1; return; }
    console.log(r.manual ? r.note : `${c.g("✓")} Super+\` (the key above Tab) now opens Away. ${c.d(r.file)}`);
    return;
  }
  const r = await viaApp("/api/away", { open: "toggle" });
  if (!r) { console.log(c.y("Symbiot's app isn't running.") + c.d("  Start it with  symbiot app,  then Away works.")); process.exitCode = 1; return; }
  if (r.error) { console.log(c.y(r.error)); process.exitCode = 1; }
}
// symbiot browser [site]: the Symbiot Browser, where you sign in to your sites for
// Symbiot (headless.mjs openSymbiotBrowser), opened by the running app.
async function cmdBrowser() {
  const site = argv.slice(1).find((a) => !a.startsWith("-")) || "";
  const r = await viaApp("/api/browser/open", site ? { url: site } : {});
  if (!r) { console.log(c.y("Symbiot's app isn't running.") + c.d("  Open Symbiot first, then the Symbiot Browser opens from Settings → Links, or with  symbiot browser.")); process.exitCode = 1; return; }
  if (r.error) { console.log(c.y(r.error)); process.exitCode = 1; return; }
  console.log(`${c.g("✓")} Opened the Symbiot Browser${site ? " at " + (r.url || site) : ""}. Sign in to your sites there, then click Done.`);
}
// symbiot open: what the app-menu icon runs. Running: its window comes up. Not
// running: it starts in the background (no terminal; what it prints goes to
// ~/.config/symbiot/app.log) and opens its own window.
async function cmdOpen() {
  const cfg = loadConfig(), port = Number(process.env.SYMBIOT_PORT || cfg.appPort) || 7391;
  const p = cfg.appToken ? await askRunningApp("ping", { port, token: cfg.appToken, ms: 1500 }) : null;
  if (p && p.version) { openApp(`http://127.0.0.1:${port}/?t=${cfg.appToken}`); return; }
  let fd = "ignore"; try { mkdirSync(CONFIG_DIR, { recursive: true }); fd = openSync(join(CONFIG_DIR, "app.log"), "a"); } catch {}
  const env = { ...process.env }; delete env.SYMBIOT_NO_OPEN;
  spawn(process.execPath, [realpathSync(fileURLToPath(import.meta.url)), "app"], { detached: true, stdio: ["ignore", fd, fd], env, windowsHide: true }).unref();
}
// symbiot uninstall: everything Symbiot put on this computer, then the program.
// --keep-data keeps ~/.config/symbiot (settings, tasks, memory); --yes doesn't ask.
async function cmdUninstall() {
  const keep = has("keep-data");
  console.log(c.b("Remove Symbiot from this computer") + "\n");
  console.log("  · its app-menu entry and icon, start at login, the Super+` shortcut");
  console.log(keep ? "  · " + c.d("keeps your data in " + CONFIG_DIR) : "  · everything it knows: settings, tasks, memory, drafts, screenshots (" + CONFIG_DIR + ")");
  if (!has("keep-program")) console.log("  · the program itself (npm uninstall -g symbiot)");
  console.log(c.d("  Claude Code and its sign-in stay. Folders it made inside your projects (.symbiot/) stay too."));
  if (!has("yes")) {
    if (!process.stdin.isTTY) { console.log("\n" + c.y("Run it again with --yes to go ahead.")); process.exitCode = 1; return; }
    if (((await ask("\nType yes to remove it: ")) || "").trim().toLowerCase() !== "yes") { console.log("Nothing removed."); return; }
  }
  const { removeLauncher, setAutostart } = await import("./desktop.mjs");
  const { removeShortcut } = await import("./away.mjs");
  await askRunningApp("quit", { ms: 2000 });
  try { setAutostart(false); } catch {}
  removeLauncher(); removeShortcut();
  try { rmSync(join(homedir(), ".symbiot"), { recursive: true, force: true }); } catch {}
  if (!keep) { try { rmSync(CONFIG_DIR, { recursive: true, force: true }); } catch {} }
  console.log(c.g("✓ ") + "Removed what Symbiot added" + (keep ? ", your data kept." : ", and its data."));
  if (has("keep-program")) return;
  const r = spawnSync("npm", ["uninstall", "-g", "symbiot"], { stdio: "inherit", shell: process.platform === "win32" });
  console.log(r.status === 0 ? c.g("✓ ") + "Symbiot is uninstalled." : c.y("Couldn't remove the program: run  npm uninstall -g symbiot"));
  if (existsSync(CONFIG_DIR) && !keep) console.log(c.d("(Something wrote to " + CONFIG_DIR + " meanwhile; delete it if you like.)"));
}
async function cmdScreens() {
  const [sub = "list", a1, a2, a3, ...more] = argv.slice(1).filter((x, i, all) => !x.startsWith("--") && all[i - 1] !== "--name");
  const out = (x) => { console.log(JSON.stringify(x, null, 2)); if (x && x.error) process.exitCode = 1; };
  const find = (id) => loadScreens().find((s) => s.id === id);
  if (sub === "list") {
    const list = loadScreens();
    if (!list.length) console.log(c.d("No screens yet. Map a web page with  symbiot screens map <site>,  or capture one in the app."));
    for (const s of list) console.log(`${s.id}  ${s.name}  ${c.d(`${(s.regions || []).length} regions · ${s.page ? s.page.url : s.w + "×" + s.h + " " + s.via}`)}`);
    return;
  }
  if (sub === "map") { const body = { site: a1, name: flag("name", ""), whole: has("whole") }; return out(screenJson((await viaApp("/api/screens/map", body)) || await mapPage(body.site, body.name, { whole: body.whole }))); }
  if (sub === "whole") {
    const s = find(a1); if (!s) return out({ error: "No screen " + (a1 || "") + ". symbiot screens lists them." });
    return out(screenJson((await viaApp("/api/screens/whole", { id: s.id })) || await wholePage(s.id)));
  }
  if (sub === "scroll") {
    const s = find(a1); if (!s) return out({ error: "No screen " + (a1 || "") + ". symbiot screens lists them." });
    const body = { id: s.id, to: a2 || "down" };
    return out(screenJson((await viaApp("/api/screens/scroll", body)) || await scrollPage(body.id, body.to)));
  }
  if (sub === "show") { const s = find(a1); return out(s ? screenJson(s) : { error: "No screen " + (a1 || "") + ". symbiot screens lists them." }); }
  if (sub === "signin") { const r = (await viaApp("/api/screens/signin", { site: a1 })) || await signIn(a1); return out(r.ok ? { ...r, next: "Sign in in the window that opened, close it, then map again." } : r); }
  if (sub === "press" || sub === "type" || sub === "upload") {
    const s = find(a1); if (!s) return out({ error: "No screen " + (a1 || "") + ". symbiot screens lists them." });
    const want = String(a2 || "").toLowerCase(), rs = s.regions || [];
    const r = rs.find((x) => x.id === a2) || rs.find((x) => x.label.toLowerCase() === want) || (rs.filter((x) => x.label.toLowerCase().includes(want)).length === 1 && rs.find((x) => x.label.toLowerCase().includes(want)));
    if (!want || !r) return out({ error: `No region "${a2 || ""}" on that screen (give its id, or a label that matches one region).` });
    // a draft reply's agent (SYMBIOT_DRAFT, watch.mjs) never presses Send, or Enter (it sends in a chat)
    // upload: the files resolved and checked here, where a relative path means something
    const f = sub === "upload" ? uploadFiles([a3, ...more]) : null; if (f && f.error) return out(f);
    const body = { id: s.id, region: r.id, confirmed: has("yes"), noSend: !!process.env.SYMBIOT_DRAFT, ...(sub === "type" ? { text: a3, enter: has("enter") } : {}), ...(f ? { files: f.files } : {}) };
    const done = (await viaApp("/api/screens/" + sub, body)) || (sub === "press" ? await pressRegion(s.id, r.id, { confirmed: body.confirmed, noSend: body.noSend }) : sub === "type" ? await typeRegion(s.id, r.id, a3, { enter: body.enter, confirmed: body.confirmed, noSend: body.noSend }) : await uploadRegion(s.id, r.id, f.files, { confirmed: body.confirmed }));
    if (f && done && /answered 404/.test(done.error || "")) return out({ error: "The Symbiot app that's running is older than this command and can't upload: restart it (symbiot app), then try again." });
    // not a trusted site: say how to go ahead (only you can trust a site, in the app's Settings)
    if (done && done.confirm) return out({ error: `${done.error} Add --yes to go ahead, or list ${done.host} under Trusted sites in Symbiot's Settings.` });
    return out(screenJson(done));
  }
  console.log(`${c.b("symbiot screens")} ${c.d("— experimental")}
  symbiot screens                              list your screens
  symbiot screens map <site> [--name N] [--whole]
                                               open a site in a hidden browser and map
                                               its buttons, links and fields (JSON);
                                               --whole: all of the page in one tall screen
  symbiot screens show <id>                    a screen's blueprint (JSON)
  symbiot screens press <id> <region> [--yes]  press a region there, map where it lands
  symbiot screens type <id> <field> "text" [--enter] [--yes]
                                               type into a field (Enter sends it), map the result
  symbiot screens upload <id> <field> <file> [<file>…] [--yes]
                                               put a file in the page's file box (a picture or
                                               video for a post): <field> is the box, or the
                                               button it hides behind ("Add media"); says which
                                               box it used, maps the result
  symbiot screens scroll <id> [down|up|top|bottom]
                                               scroll the page, map what's in the window then
                                               (a map's "more" says there's more below or above)
  symbiot screens whole <id>                   map all of that page in one tall screenshot
                                               (where a list scrolls inside the page, like
                                               Gmail's mail, that list opened out)
  symbiot browser [site]                      the Symbiot Browser: sign in to your sites for Symbiot
  symbiot screens signin <site>               sign in once, in the Symbiot Browser
  --yes is needed (press, type, upload) unless the page's site is under Trusted sites in the app's Settings.
  While the app runs, these use its hidden browser, which stays open a few minutes:
  press on the screen the last command printed carries on from that page as it is
  (type without --enter, then press the form's button).`);
  if (sub !== "help") process.exitCode = 1;
}

// ---- `symbiot watch`: pages Symbiot keeps track of, and what's new on them ----
// new, board, seen, add, remove and check print JSON, for you or an agent.
async function cmdWatch() {
  const [sub = "list", a1, a2] = argv.slice(1).filter((x, i, all) => !x.startsWith("--") && !["--every", "--hours"].includes(all[i - 1]));
  const out = (x) => { console.log(JSON.stringify(x, null, 2)); if (x && x.error) process.exitCode = 1; };
  const hours = Number(flag("hours", 24)) || 24;
  if (sub === "list") {
    const st = watchState();
    if (!st.watches.length) console.log(c.d("Not watching anything yet. Map a page (symbiot screens map gmail), then  symbiot watch add <screen id>,  or click Watch on it in the app. For GitHub:  symbiot watch add github"));
    for (const w of st.watches) console.log(`${w.id}  ${w.name}  ${c.d(`every ${w.every} min · ${w.checked ? "last read " + new Date(w.checked).toLocaleString() : "not read yet"}${w.error ? " · " + w.error : ""}`)}`);
    const news = newsSince(hours);
    if (st.watches.length) console.log("\n" + c.b(`${news.length} new in the last ${hours} hours`) + (news.length ? "" : c.d("  (the app reads each page every few minutes while it runs)")));
    for (const n of news.slice(0, 20)) console.log(`  ${c.d(new Date(n.ts).toLocaleString())}  ${n.text.slice(0, 110)}  ${c.d(n.name.slice(0, 30))}`);
    return;
  }
  // the Dashboard's cards, for an agent or a status bar (.total is the count on the
  // Dashboard tab); --line: one line of text, "2 emails · 1 WhatsApp message"
  if (sub === "board") { const b = watchBoard(Math.min(168, Math.max(1, hours))); if (has("line")) return console.log(boardLine(b)); return out(b); }
  if (sub === "seen") return out(a1 ? seenWatch(a1) : { error: "Give the watch's id: symbiot watch board lists them." });
  if (sub === "new") return out(markNews(newsSince(hours), watchState().watches));
  // the same as the app's Draft a reply button: through the app when it runs, so its Agents tab tracks the run
  if (sub === "draft") {
    if (!a1) return out({ error: "Give the email's id: symbiot watch new lists them, and the ones marked \"mail\": true (or \"chat\": true) can get a reply." });
    const r = (await viaApp("/api/watch/draft", { id: a1 })) || draftReply(a1);
    const where = r.chat ? "types it into the chat's message box in Symbiot's browser, never sent" : r.social ? "types it into LinkedIn's comment box and writes it under \"## The reply\" in its TASKS.md, never posted" : "leaves it in Drafts, never sent";
    return out(r.ok ? { ...r, next: `Your agent is writing the reply and ${where}. Its log is in ` + join(r.dir, ".symbiot", "agent.log") + " (and the app's Agents tab)." } : r);
  }
  // a card's chat, the same talk as 💬 on the Dashboard (through the app when it
  // runs, so an agent it starts shows in its Agents tab): a reply drafted from that
  // card brings it along. No question: the talk so far; --clear starts it over.
  if (sub === "chat") {
    if (!a1) return out({ error: "Give the watch's id: symbiot watch board lists them. Then  symbiot watch chat <id> \"what needs me?\"" });
    if (has("clear")) return out((await viaApp("/api/watch/chat/clear", { id: a1 })) || clearBoardChat(a1));
    if (!a2) return out(boardTalk(a1));
    const r = (await viaApp("/api/watch/chat", { id: a1, question: a2 })) || await boardChat(a1, a2);
    if (r.error === "not-connected") return out({ error: "Connect a model first: symbiot login (or Settings in the app)." });
    const { chat, ...rest } = r; return out(chat ? { ...rest, messages: chat.length } : rest);
  }
  if (sub === "add") { const screen = loadScreens().some((s) => s.id === a1) ? a1 : ""; return out(addWatch({ screen, site: screen ? "" : a1, every: flag("every", 15) })); }
  if (sub === "remove") return out(removeWatch(String(a1 || "")));
  if (sub === "brief") { if (a1 === "on" || a1 === "off") return out(setBrief(a1 === "on")); return out({ brief: watchState().brief, briefs: watchState().briefs }); }
  if (sub === "check") {
    // through the app when it runs: its hidden browser may be open, and one profile takes one browser
    const ids = a1 ? [a1] : watchState().watches.map((w) => w.id), done = [];
    for (const id of ids) done.push((await viaApp("/api/watch/check", { id })) || await checkWatch(id));
    return out(a1 ? done[0] : done);
  }
  console.log(`${c.b("symbiot watch")} ${c.d("— experimental")}
  symbiot watch                                the pages you watch, and what's new
  symbiot watch add <screen id | site> [--every 5|15|30|60]
                                               watch a mapped page (or a site) for new rows
  symbiot watch add github                     your GitHub notifications: review requests,
                                               failed CI runs (through gh when it's signed in)
  symbiot watch new [--hours 24]               what's new, newest first (JSON)
  symbiot watch board [--hours 24]             the Dashboard's cards: how many are new on
                                               each page, and the newest few (JSON, for an
                                               agent or a status bar: .total is the count)
  symbiot watch board --line                   the same as one line of text, for a status
                                               bar: "2 emails · 1 WhatsApp message" (an
                                               empty line when nothing's new)
  symbiot watch seen <id>                      set a card's count back to 0, like its Seen
                                               button (what it found stays in watch new)
  symbiot watch chat <id> "question"           talk over what's new on a card with your AI,
                                               like 💬 on the Dashboard: a reply drafted from
                                               that card follows what you agreed (JSON)
  symbiot watch chat <id> [--clear]            the talk so far, or start it over
  symbiot watch check [id]                     read them now (JSON)
  symbiot watch draft <id>                     your agent drafts a reply to that new email
                                               ("mail": true in watch new) and leaves it in
                                               Drafts, never sent, like Draft a reply in the app;
                                               to a WhatsApp chat ("chat": true), it types it
                                               into the chat's message box, unsent
  symbiot watch brief [on|off]                 your AI says what needs you, and what can wait
  symbiot watch remove <id>                    stop watching it
  While the app runs it reads each page every few minutes in its hidden browser
  (only reads: nothing is pressed or typed), and notifies you of what's new.
  Standup counts what's new since yesterday ("Waiting on you: 3 emails").`);
  if (sub !== "help") process.exitCode = 1;
}

// ---- `symbiot knowledge`: folders of your documents that chats quote -------------
// The same folders as Settings → Knowledge folders; --json prints JSON.
function cmdKnowledge() {
  const VAL = ["--examples", "--name", "--limit", "--dir", "--since"];
  const [sub = "list", ...rest] = argv.slice(1).filter((x, i, all) => !x.startsWith("--") && !VAL.includes(all[i - 1]));
  const arg = rest.join(" ").trim(), examples = has("with-examples"), json = has("json");
  const out = (x) => { console.log(JSON.stringify(x, null, 2)); if (x && x.error) process.exitCode = 1; };
  const fail = (m) => { console.log(c.y(m)); process.exitCode = 1; };
  const tag = (x) => (x.example ? c.y("  [example, not a real fact]") : "");
  const indexed = () => { const r = indexKnowledge({ full: has("full") }); console.log(`${c.g("✓")} Indexed: ${r.read} read, ${r.kept} unchanged, ${r.removed} dropped${r.failed ? c.y(`, ${r.failed} couldn't be read`) : ""}. ${r.files} files in all.`); };
  if (sub === "list") {
    const st = knowledgeState(); if (json) return out(st);
    if (!st.folders.length) return console.log(c.d("No knowledge folders yet. Add one:  symbiot knowledge add ~/Company --examples templates/,active/"));
    for (const f of st.folders) {
      const nr = Object.entries(f.notRead).map(([k, n]) => `${n} ${k}`).join(", ");
      console.log(`${c.b(f.path)}\n  ${f.files} files read · ${f.exampleFiles} examples (${f.examples.join(", ") || "none"}) · ${f.cases} cases · ${f.items} open items` + (nr ? c.d(` · not read yet: ${nr}`) : ""));
    }
    console.log(c.d(`\n"What's waiting on me" looks for ${st.me || "your name (set it: symbiot knowledge me \"Your Name\")"}.` + (st.indexed ? ` Indexed ${new Date(st.indexed).toLocaleString()}.` : "")));
    return;
  }
  if (sub === "add") {
    if (!arg) return fail("Give a folder:  symbiot knowledge add ~/Company [--examples templates/,active/]");
    const r = addKnowledgeFolder(arg, flag("examples", undefined)); if (r.error) return fail(r.error);
    const f = r.folders[r.folders.length - 1];
    console.log(`${c.g("✓")} ${f.path}` + c.d(`  examples: ${f.examples.join(", ") || "none"}`)); return indexed();
  }
  if (sub === "remove") { const r = removeKnowledgeFolder(arg); if (r.error) return fail(r.error); console.log(`${c.g("✓")} Removed ${arg}.`); return indexed(); }
  if (sub === "index") return indexed();
  if (sub === "search") {
    if (!arg) return fail("Say what to look for:  symbiot knowledge search \"renewal notice period\"");
    const hits = searchKnowledge(arg, { examples, limit: Number(flag("limit", 8)) || 8 }); if (json) return out(hits);
    if (!hits.length) return console.log(c.d("Nothing in your knowledge folders." + (examples ? "" : "  (--with-examples looks in examples too)")));
    for (const h of hits) console.log(`${c.b(h.cite)}${h.where ? c.d(" › " + h.where) : ""}${tag(h)}\n  ${h.excerpt}\n`);
    return;
  }
  if (sub === "waiting") {
    const w = waitingOn(flag("name", ""), { examples }); if (json) return out(w);
    if (!w.me) return fail("Your name isn't known:  symbiot knowledge me \"Your Name\"  (or --name \"Your Name\")");
    console.log(c.b(`Waiting on ${w.me}`)); for (const i of w.waiting) console.log("  " + itemLine(i) + tag(i)); if (!w.waiting.length) console.log(c.d("  nothing"));
    console.log(c.b(`\nOpen items ${w.me} owns`)); for (const i of w.mine) console.log("  " + itemLine(i) + tag(i)); if (!w.mine.length) console.log(c.d("  none"));
    return;
  }
  if (sub === "owner") {
    if (!arg) return fail("Say what:  symbiot knowledge owner \"Bluegum renewal\"");
    const o = ownerOf(arg, { examples }); if (json) return out(o);
    if (!o.length) return console.log(c.d("No case or item in your knowledge folders matches that." + (examples ? "" : "  (--with-examples looks in examples too)")));
    for (const x of o) console.log("  " + (x.kind === "case" ? "case: " + caseLine(x) : "item: " + itemLine(x)) + tag(x));
    return;
  }
  if (sub === "me") { if (arg) setMyName(arg); console.log(myName() ? `"What's waiting on me" looks for ${c.b(myName())}.` : c.y("No name known: symbiot knowledge me \"Your Name\"")); return; }
  console.log(`${c.b("symbiot knowledge")} ${c.d("— folders of your documents that chats quote and cite")}
  symbiot knowledge                           the folders: what's read, the examples, what's
                                              not read yet (Word, PDF, Excel: later)
  symbiot knowledge add <folder> [--examples templates/,active/]
                                              read a folder (Markdown, CSV, text). Paths in
                                              --examples are worked examples, never used as
                                              facts (default templates/; "none" for none).
                                              Adding it again changes them.
  symbiot knowledge remove <folder>           stop reading it
  symbiot knowledge index [--full]            re-read what changed now (the app does it
                                              every few minutes); --full reads everything
  symbiot knowledge search "words" [--with-examples] [--json]
                                              the passages that match, with their files
  symbiot knowledge waiting [--name "X"] [--with-examples]
                                              open items waiting on you, and yours, from
                                              front matter (owner, status, due, waiting_on)
  symbiot knowledge owner "what" [--with-examples]
                                              who owns an item, or does a case
  symbiot knowledge me ["Your Name"]          the name "waiting on me" looks for (default:
                                              your git user.name)`);
  if (sub !== "help") process.exitCode = 1;
}

// ---- `symbiot phone`: Watch on your phone, from a terminal ----------------------
// On the phone (Termux), pair with your computer without the app window; on the
// computer, the addresses and a code to pair with. Through the app when it runs:
// that's where the computer listens and the phone asks.
async function cmdPhone() {
  const [sub = "status", ...rest] = argv.slice(1).filter((x) => !x.startsWith("--"));
  const fail = (msg) => { console.log(c.y(msg)); process.exitCode = 1; };
  const app = await viaApp("/api/phone", {}), st = app && !app.error ? app : phoneState();
  const phone = st.role === "phone", ask = "symbiot phone pair <address> <code>";
  const notPaired = `Not paired with a computer. On the computer, switch on Settings → Watch on your phone in Symbiot (or run  symbiot phone code  there), then here:  ${ask}`;
  const onlyPhone = () => fail(`That's for the phone. In Termux there:  ${ask},  with an address and the code this computer shows (symbiot phone code).`);
  const onlyComputer = () => fail("That's for the computer your phone pairs with: run it there.");
  const noApp = "Symbiot's app isn't running here, so nothing listens for your phone. Start it with  symbiot app,  switch on Settings → Watch on your phone, then run this again.";
  const asks = (r) => (app ? `Symbiot here asks ${r.name} what's new every 2 minutes and notifies you.` : `Symbiot here asks ${r.name} what's new every 2 minutes while  symbiot app  runs: start it to be notified.`) + (r.notify === false ? c.d("  For notifications in Termux: pkg install termux-api, and the Termux:API app.") : "");
  if (sub === "pair") {
    if (!phone) return onlyPhone();
    // the code may be typed as shown, in two halves: 123 456
    const [address, ...code] = rest;
    if (!address || !code.length) return fail(`Give the computer's address and the 6-digit code it shows:  ${ask}  (like 192.168.1.21:7392 123456)`);
    const r = (app && await viaApp("/api/phone/pair", { address, code: code.join("") })) || await pairComputer(address, code.join(""));
    if (r.error || !r.paired) return fail(r.error || "Pairing didn't work.");
    console.log(`${c.g("✓")} Paired with ${c.b(r.name)} ${c.d(r.url)}\n  ${asks(r)}`);
    return;
  }
  if (sub === "check") {
    if (!phone) return onlyPhone();
    if (!st.paired) return fail(notPaired);
    const r = (app && await viaApp("/api/phone/check", {})) || await pollComputer();
    if (r.error) return fail(r.error);
    console.log(r.shown ? `${c.g("✓")} ${r.shown} new from ${r.name}, notified.` : c.d(`Nothing new from ${r.name}.`));
    return;
  }
  if (sub === "forget") {
    if (!phone) return onlyPhone();
    (app && await viaApp("/api/phone/forget", {})) || forgetComputer();
    console.log(st.paired ? `Forgot ${st.name}: this phone doesn't ask it any more.` : c.d("Not paired with a computer."));
    return;
  }
  if (sub === "code") {
    if (phone) return onlyComputer();
    if (!app) return fail(noApp);
    if (!st.on) return fail("Watch on your phone is off. Switch it on in Symbiot: Settings → Watch on your phone.");
    const r = await viaApp("/api/phone/code", {});
    if (!r || r.error || !r.code) return fail((r && r.error) || "No code came back.");
    console.log(`Code ${c.b(r.code)}  ${c.d(`for ${Math.max(1, Math.round((r.until - Date.now()) / 60000))} minutes, 5 tries`)}\nOn the phone, in Termux, with this computer's address:`);
    for (const a of r.addresses || []) console.log(`  symbiot phone pair ${a}:${r.port || PHONE_PORT} ${r.code}`);
    return;
  }
  if (sub === "status") {
    if (phone) {
      if (!st.paired) return console.log(notPaired);
      console.log(`Paired with ${c.b(st.name)} ${c.d(st.url)}` + (st.last ? c.d(`  · asked ${new Date(st.last).toLocaleString()}`) : ""));
      if (st.error) console.log(c.y(st.error));
      console.log("  " + asks(st));
      return;
    }
    if (!app) return console.log(c.y(noApp));
    if (!st.on) return console.log(c.y("Watch on your phone is off.") + c.d("  Switch it on in Symbiot: Settings → Watch on your phone."));
    if (st.error) console.log(c.y(st.error));
    if (st.listening) console.log(`Listening for your phone at ${(st.addresses || []).map((a) => c.b(`${a}:${st.port || PHONE_PORT}`)).join(", ") || c.y("(no network address found)")}`);
    console.log(st.code ? `Code ${c.b(st.code)}  ${c.d(`until ${new Date(st.until).toLocaleTimeString()}`)}` : c.d("No pairing code open:  symbiot phone code  for one."));
    for (const p of st.phones || []) console.log(`  ${c.g("·")} ${p.name}  ${c.d("paired " + new Date(p.added).toLocaleDateString() + (p.seen ? ", asked " + new Date(p.seen).toLocaleString() : ""))}`);
    console.log(c.d(`On the phone, in Termux:  ${ask}`));
    return;
  }
  console.log(`${c.b("symbiot phone")} ${c.d("— experimental")}
  On the phone (Termux):
  symbiot phone                         the computer it's paired with
  symbiot phone pair <address> <code>   pair with your computer, with its address
                                        (like 192.168.1.21:7392) and the code it shows
  symbiot phone check                   ask it what's new now
  symbiot phone forget                  stop asking it
  On the computer (while  symbiot app  runs, Watch on your phone switched on):
  symbiot phone                         where it listens, and the phones paired
  symbiot phone code                    a new 6-digit code to pair a phone with`);
  if (sub !== "help") process.exitCode = 1;
}

// ---- `symbiot post`: the week's real work as 3 draft posts you approve ----------
// Nothing is posted until you approve one: then Marketing's agent posts it, through
// Symbiot's browser signed in to LinkedIn.
async function cmdPost() {
  const [sub = "draft", a1, a2] = argv.slice(1).filter((x, i, all) => !x.startsWith("--") && all[i - 1] !== "--since" && all[i - 1] !== "--seconds");
  const fail = (msg) => { console.log(c.y(msg)); process.exitCode = 1; };
  const show = (p) => {
    console.log(`\n${c.b(POST_KIND[p.kind] || p.kind)}  ${c.d(`${p.id} · ${p.status}${p.edited ? " · edited" : ""}`)}\n${p.text}`);
    if (p.sources && p.sources.length) console.log(c.d("  from git: " + p.sources.slice(0, 4).map((s) => s.replace(/^\[\d+\]\s*/, "")).join("\n            ") + (p.sources.length > 4 ? `\n            …and ${p.sources.length - 4} more` : "")));
    for (const m of p.media || []) console.log(c.d(`  ${m.kind} ${m.id}: `) + join(postMediaDir(p.id), m.file) + c.d(m.url ? `  (${m.from === "clip" ? "clip" : "picture"} of ${m.url})` : ""));
    if (p.show && !(p.media || []).length) console.log(c.d("  picture idea: " + p.show));
  };
  if (sub === "draft" || sub === "new") {
    const r = await draftPosts({ days: SINCE_WEEK || 7 });
    if (r.error) return fail(r.error);
    for (const p of r.posts) show(p);
    if (r.retried) console.log("\n" + c.d("The first try kept none (each claimed what git doesn't show), so Symbiot tried again by itself."));
    if (r.pictures) console.log(c.d(`${r.pictures === 1 ? "One draft names" : `${r.pictures} drafts name`} a screen of an app you run here, so ${r.pictures === 1 ? "it has its picture" : "they have their pictures"} already: keep or remove (symbiot post remove <id> <media id>).`));
    if (r.dropped.length) console.log("\n" + c.y(`Dropped ${r.dropped.length}: `) + r.dropped.map((x) => `${POST_KIND[x.kind] || x.kind} (${x.cited ? "claimed " + x.unsupported.join(", ") + ", which git doesn't show" : "cited nothing from git"})`).join("; "));
    console.log("\n" + c.d(`${r.posts.length} draft${r.posts.length === 1 ? "" : "s"} from ${r.facts} things git shows this week, in the voice of your ${r.voice} example${r.voice === 1 ? "" : "s"}. They wait under Marketing in the app too.`));
    console.log(c.d("Nothing is posted until you approve one:  symbiot post approve <id>  (or edit / skip)."));
    return;
  }
  if (sub === "list") {
    const st = postsState();
    if (!st.posts.length) console.log(c.d("No drafts waiting.  symbiot post  drafts this week's."));
    for (const p of st.posts) show(p);
    return;
  }
  if (sub === "approve") {
    const r = approvePost(a1);
    if (r.error) return fail(r.error);
    console.log(`${c.g("✓")} Approved.\n\n${r.post.text}\n`);
    console.log(r.handed.error ? c.y(r.note) : r.note);
    if (r.handed.error) process.exitCode = 1;
    return;
  }
  // pictures and video on a draft: a file of yours, or a picture or clip of a page
  if (sub === "add") {
    if (!a2) return fail("Give the draft and the file:  symbiot post add <id> <picture or video>");
    let data; try { data = readFileSync(a2); } catch (e) { return fail(`Can't read ${a2}: ${e.message}`); }
    const r = addPostMedia(a1, data, { name: basename(a2) });
    if (r.error) return fail(r.error);
    show(r.post); return;
  }
  if (sub === "page") {
    if (!a2) return fail("Give the draft and the page:  symbiot post page <id> <web address> [--clip] [--seconds 8]");
    const clip = has("clip"), i = argv.indexOf("--seconds"), seconds = i >= 0 ? Number(argv[i + 1]) || 8 : 8;
    console.log(c.d(clip ? `Recording ${seconds} s of ${a2}…` : `Taking a picture of ${a2}…`));
    // through the app when it runs: its hidden browser and this one share a profile
    const r = (await viaApp("/api/posts/media/page", { id: a1, url: a2, clip, seconds })) || await (clip ? clipOfPage(a1, a2, { seconds }) : pictureOfPage(a1, a2));
    if (r.error) return fail(r.error);
    show(r.post); return;
  }
  if (sub === "unadd" || sub === "remove") {
    const r = removePostMedia(a1, a2);
    if (r.error) return fail(r.error);
    console.log(`${c.g("✓")} Taken off ${r.post.id}.`); return;
  }
  if (sub === "edit") {
    if (!a2) return fail('Give the new text:  symbiot post edit <id> "the post"');
    const r = editPost(a1, a2);
    if (r.error) return fail(r.error);
    show(r.post);
    if (r.unsupported) console.log("\n" + c.y("Note: ") + `git doesn't show ${r.unsupported.join(", ")}. It's your post, so it stays as you wrote it.`);
    return;
  }
  if (sub === "skip") { const r = skipPost(a1); if (r.error) return fail(r.error); console.log(`${c.g("✓")} Skipped ${r.post.id}. It stays in the log.`); return; }
  if (sub === "log") {
    const log = postLog();
    if (!log.length) console.log(c.d("Nothing logged yet."));
    for (const l of log.slice(-40)) console.log(`${c.d(l.date.slice(0, 16).replace("T", " "))}  ${l.action.padEnd(8)} ${c.d((POST_KIND[l.kind] || l.kind || "").padEnd(15))} ${String(l.text || "").replace(/\s+/g, " ").slice(0, 70)}${l.why ? c.d("  (" + l.why + ")") : ""}`);
    if (log.length) console.log(c.d(`\n${POST_PATHS.log}`));
    return;
  }
  if (sub === "voice") {
    if (!has("linkedin")) { const n = postsState().voice.count; console.log(n ? `${n} example post${n === 1 ? "" : "s"} in ${POST_PATHS.voice}` : c.y(`No example posts yet.`) + `  Paste 5–10 of yours into ${POST_PATHS.voice}, a line of --- between each, or link LinkedIn and run  symbiot post voice --linkedin`); return; }
    // through the app when it runs: its hidden browser and this one share a profile
    const r = (await viaApp("/api/posts/voice", { confirmed: true })) || await voiceFromLinkedIn();
    if (r.error) return fail(r.error);
    console.log(`${c.g("✓")} Added ${r.added} of your LinkedIn posts: ${r.total} in ${r.file}. Read them over, and delete any that don't sound like you.`);
    return;
  }
  console.log(`${c.b("symbiot post")} ${c.d("— experimental")}
  symbiot post                     draft this week's 3 posts (Shipped, Learned /
                                   fixed, a longer one) from your last 7 days of
                                   commits, release tags and CHANGELOG.md
  symbiot post list                the drafts waiting on you
  symbiot post approve <id>        approve it: Marketing's agent posts it on
                                   LinkedIn through Symbiot's signed-in browser
  symbiot post edit <id> "text"    change a draft's words
  symbiot post add <id> <file>     put a picture or video of yours on a draft
                                   (PNG, JPG, GIF, MP4, MOV, WebM)
  symbiot post page <id> <page> [--clip] [--seconds 8]
                                   a picture of a web page (localhost too) on a
                                   draft; --clip records a short video of it,
                                   scrolling down (needs ffmpeg)
  symbiot post remove <id> <media id>
                                   take a picture or video off a draft
  symbiot post skip <id>           drop a draft
  symbiot post log                 everything drafted, edited, approved, skipped
  symbiot post voice [--linkedin]  your example posts (voice.md), or read your
                                   recent LinkedIn posts into it (Link LinkedIn first)
  It never posts by itself, and doesn't schedule: you paste and post each one.
  Every claim must be in git; a draft that names what git doesn't show is dropped.`);
  if (sub !== "help") process.exitCode = 1;
}

// ---- `symbiot marketing`: a draft of Marketing's lane, marked posted or superseded ----
// What its agent runs once a post is out, or redone in a new file (marketing.mjs): either
// takes it off the Marketing orb for good, and it can't be approved or posted again.
async function cmdMarketing() {
  const VAL = ["--url", "--on", "--where", "--at", "--by"];
  const [sub = "help", rel, ...more] = argv.slice(1).filter((x, i, all) => !x.startsWith("--") && !VAL.includes(all[i - 1]));
  const fail = (msg) => { console.log(c.y(msg)); process.exitCode = 1; };
  const M = await import("./marketing.mjs");
  if (sub === "posted" || sub === "superseded") {
    if (!rel) return fail(`Give the draft:  symbiot marketing ${sub} drafts/<product>/<post>.md`);
    const r = M.setDraftStatus(rel, sub, { url: flag("url", ""), on: flag("on", flag("where", "")), at: flag("at", ""), by: flag("by", "") });
    if (r.error) return fail(r.error);
    if (r.already) { console.log(c.d(r.said)); return; }
    const s = M.draftStatuses()[r.rel] || {};
    console.log(`${c.g("✓")} ${r.rel}: ${sub}${s.postedOn ? ` on ${s.postedOn}` : ""}${s.posted ? `, ${M.day(s.posted)}` : ""}${s.url ? ` (${s.url})` : ""}${(s.by || []).length ? ` by ${s.by.join(", ")}` : ""}. It's off the Marketing orb, and can't be approved or posted again.`);
    return;
  }
  if (sub === "media") {
    if (!rel) return fail("Give the draft and its pictures or video:  symbiot marketing media <draft> <file>…");
    const r = M.setDraftMedia(rel, more);
    if (r.error) return fail(r.error);
    console.log(`${c.g("✓")} ${r.rel}: ${r.media.length ? "media: " + r.media.join(", ") : "no media"}${r.reopened ? c.y("  (it was approved with another: it asks for the user's OK again)") : ""}`); return;
  }
  if (sub === "list" || sub === "status") {
    const fs = M.draftFiles(M.MARKETING_DIR, [], { max: 200 }), all = M.draftStatuses();
    if (!fs.length) console.log(c.d("No drafts in Marketing's lane yet."));
    for (const f of fs) { const s = all[f.rel] || {}; console.log(`${(f.status || "waiting").padEnd(10)} ${f.rel}${s.url ? c.d("  " + s.url) : ""}${(s.by || []).length ? c.d("  by " + [].concat(s.by).join(", ")) : ""}`); }
    return;
  }
  console.log(`${c.b("symbiot marketing")} ${c.d("— Marketing's drafts (drafts/<product>/<post>.md in its lane)")}
  symbiot marketing list                    each draft and its status
  symbiot marketing posted <draft> [--url <link>] [--on linkedin] [--at "YYYY-MM-DD HH:MM"]
                                            it's out (or in the platform's scheduler)
  symbiot marketing superseded <draft> [--by <new draft>[,<another>]]
                                            a new draft replaces it
  symbiot marketing media <draft> <file>…   its picture(s) or video, by path in the lane
  Posted and superseded take a draft off the Marketing orb for good: it can't be
  approved or posted again.`);
  if (sub !== "help") process.exitCode = 1;
}

// ---- `symbiot reports`: what agents wrote up for you (reports.mjs) ---------------
function cmdReports() {
  const id = argv.slice(1).find((x) => !x.startsWith("--"));
  const list = listReports();
  if (!id) {
    if (!list.length) { console.log(c.d("No reports yet. When an agent writes up findings, an audit or a plan, it leaves a .md in its folder's .symbiot/, and it's listed here.")); return; }
    for (const r of list) console.log(`${r.new ? c.y("●") : " "} ${c.d(r.id)}  ${c.b(r.title)}  ${c.d(`${!r.run || r.run === r.lane ? r.lane : r.run.startsWith(r.lane + ":") ? r.run : `${r.lane} · ${r.run}`} ·${new Date(r.mtime).toISOString().slice(0, 10)}`)}`);
    console.log(c.d(`\n● unread.  symbiot reports <id>  prints one (and marks it read).`));
    return;
  }
  const hit = list.filter((r) => r.id.startsWith(id));
  if (hit.length !== 1) { console.log(c.y(hit.length ? `${hit.length} reports start with ${id}: give more of its id.` : `No report ${id}.  symbiot reports  lists them.`)); process.exitCode = 1; return; }
  const r = readReport(hit[0].id, { list });
  if (r.error) { console.log(c.y(r.error)); process.exitCode = 1; return; }
  console.log(c.d(r.file) + "\n\n" + r.text);
}

const HELP =`${c.b("symbiot")} — your week, written from your real work.

${c.b("Usage")}
  symbiot ${c.d("(or)")} symbiot week      write up your last ${SINCE_WEEK} days
  symbiot standup                   yesterday + today, for standup
  symbiot todo                      what's still on your plate
  symbiot app                       open the visual app in your browser
  symbiot --version                 which Symbiot this is
  symbiot open                      start Symbiot in the background and open its window
                                    (what its app-menu icon does)
  symbiot uninstall [--keep-data]   remove Symbiot and everything it added
  symbiot away [--shortcut]         Symbiot full screen on every screen while you're away;
                                    again closes it. --shortcut: Super+\` does it
  symbiot app --fresh [--keep]      try it as someone new: a brand-new Symbiot in
                                    a throwaway home, none of your data or accounts
  symbiot drift [--fetch]           what's out of sync / at risk across repos
  symbiot push [--open [--force]]   write tasks into each repo (and run your agent)
  symbiot reports [id]              what your agents wrote up for you (findings,
                                    audits, plans); give an id to read one
  symbiot login                     connect it to an AI (once)
  symbiot whoami                    show how it's connected
  symbiot logout                    forget saved credentials
  symbiot help

${c.b("Experimental")}
  symbiot drift --ci                also check GitHub Actions (needs gh)
  symbiot mail [--on|--off]         use the mail you sent in write-ups (local, no API)
  symbiot models                    recommend AI models for your hardware
  symbiot setup-local [--model X]   install/run a free local model (Ollama)
  symbiot post                      draft 3 LinkedIn posts from this week's git,
                                    in your voice; never posts by itself
                                    (symbiot post help for more)
  symbiot marketing posted <draft> --url <link>
                                    mark a Marketing draft posted (or superseded);
                                    symbiot marketing help for more
  symbiot screens map <site>        map a web page's buttons in a hidden browser
                                    (symbiot screens help for more)
  symbiot watch add <screen id>     keep track of a mapped page: what's new on it
  symbiot watch add github          ...or your GitHub notifications
                                    (symbiot watch help for more)
  symbiot phone pair <address> <code>
                                    in Termux: pair with your computer for
                                    Watch on your phone (symbiot phone help)
  symbiot knowledge add <folder>    documents chats quote and cite (Markdown,
                                    CSV, text); waiting / owner from case files
                                    (symbiot knowledge help for more)

${c.b("Options")}
  --dir <path>    where your repos are (default: ${homedir()})
  --since <days>  window for 'week' (default 7)
  --all           everyone's commits, not just yours
  --plain         no colour/spinner (good for piping)

${c.b("Setup")}  pick any AI to write with:
  symbiot login                       ${c.d("choose Claude / OpenAI / Gemini / Ollama")}
  symbiot login --provider openai --key sk-...   ${c.d("(non-interactive)")}
  ${c.d("Env keys also work: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY.")}
  ${c.d("Override the model per run with SYMBIOT_MODEL.")}

${c.d("Reads only your local git (and, if you switch it on, the headers of mail you")}
${c.d("sent). No accounts, no OAuth, no data leaves except the commit and email")}
${c.d("subjects sent to the AI to write your update (nothing leaves at all with a")}
${c.d("local Ollama model).")}`;

// ---- main -----------------------------------------------------------------
async function main() {
  if (cmd === "help" || cmd === "--help" || cmd === "-h") { console.log(HELP); return; }
  if (cmd === "--version" || cmd === "-v" || cmd === "version") { console.log(VERSION); return; }
  if (cmd === "login" || cmd === "auth") return cmdLogin();
  if (cmd === "logout") return cmdLogout();
  if (cmd === "whoami" || cmd === "status") return cmdWhoami();
  // the app runs from home: whatever folder started it may be deleted later (a worktree,
  // an old copy npm replaced), and Claude Code won't run from a deleted folder
  if (cmd === "app" || cmd === "ui") { try { process.chdir(homedir()); } catch {} return cmdApp(); }
  if (cmd === "away") return cmdAway();
  if (cmd === "browser") return cmdBrowser();
  if (cmd === "open") return cmdOpen();
  if (cmd === "uninstall") return cmdUninstall();
  if (cmd === "models" || cmd === "hardware") return cmdModels();
  if (cmd === "setup-local" || cmd === "setup-ollama") return cmdSetupLocal();
  if (cmd === "drift") return cmdDrift();
  if (cmd === "push") return cmdPush();
  if (cmd === "mail" || cmd === "email") return cmdMail();
  if (cmd === "screens" || cmd === "screen") return cmdScreens();
  if (cmd === "watch") return cmdWatch();
  if (cmd === "phone") return cmdPhone();
  if (cmd === "post" || cmd === "posts") return cmdPost();
  if (cmd === "marketing") return cmdMarketing();
  if (cmd === "knowledge" || cmd === "know") return cmdKnowledge();
  if (cmd === "reports" || cmd === "report") return cmdReports();
  if (cmd === "week")return cmdRun("week");
  if (cmd === "standup") return cmdRun("standup");
  if (cmd === "todo") return cmdRun("todo");
  console.log(c.y(`Unknown command: ${cmd}`) + "\n"); console.log(HELP);
}

// Run the CLI only when invoked directly; when imported (e.g. by tests) just
// expose the pure functions. Compare REAL paths so a global/npx bin symlink
// (argv[1] is the symlink, import.meta.url is the real file) still counts.
const isMain = (() => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();
if (isMain) main();

export { authorship, repoState, readmeInfo, repoShape, houseRules, findAllRepos, buildMap, reportFooter, detectHardware, recommendModels, computeDrift, driftRepo, gitDefaultBranch, buildTasksMd, taskType, EMBEDDED_UI, orcaHandoffCmd, migrateOrcaCmd, migrateClaudeCmd, fillHandoff, handoffCmd, setHandoffCmd, ORCA_CLAUDE_CMD, CLAUDE_CMD, HANDOFF_PROMPT, shipChanges, shipWithBump, bumpOffer, learnNpm, releaseNeeded, withReleases, setVersion, syncTasks, pendingReview, unreleased, publishesOnMerge, addTask, approveRepo, approveChanges, sendBack, pushTasks, semverGt, updateCmd, parseQuestions, agentQuestions, isAppRunningWeekly };

