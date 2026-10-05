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

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { EMBEDDED_UI } from "./ui.mjs";
import { VERSION, CONFIG_PATH, loadConfig, saveConfig, repoState, semverGt } from "./core.mjs";
import { HANDOFF_PROMPT, CLAUDE_CMD, ORCA_CLAUDE_CMD, handoffCmd, setHandoffCmd, fillHandoff, runHandoff, orcaHandoffCmd, migrateOrcaCmd, migrateClaudeCmd, parseQuestions, agentQuestions } from "./agents.mjs";
import { AI_UI, PROVIDERS, resolveProvider, validate, detectHardware, recommendModels, hasOllama, ollamaInstall, ensureOllama, useOllamaModel } from "./ai.mjs";
import { setScanOptions, scanBase, authorship, readmeInfo, repoShape, houseRules, reportFooter, findAllRepos, buildMap } from "./scan.mjs";
import { gitDefaultBranch, loadDeploys, driftRepo, computeDrift } from "./drift.mjs";
import { buildTasksMd, taskType, shipChanges, shipWithBump, bumpOffer, learnNpm, releaseNeeded, withReleases, setVersion, syncTasks, pendingReview, unreleased, publishesOnMerge, addTask, approveRepo, approveChanges, sendBack, pushTasks } from "./tasks.mjs";
import { produce, mailState, setMail, sentMail } from "./writeups.mjs";
import { loadScreens, screenImage, blueprint } from "./screens.mjs";
import { mapPage, pressRegion, typeRegion, signIn, isTrusted } from "./headless.mjs";
import { watchState, addWatch, removeWatch, newsSince, checkWatch, setBrief } from "./watch.mjs";
import { PORT as PHONE_PORT, phoneState, pairComputer, pollComputer, forgetComputer } from "./phone.mjs";
import { startApp, updateCmd } from "./server.mjs";

// ---- tiny arg parse --------------------------------------------------------
const argv = process.argv.slice(2);
const cmd = (argv[0] && !argv[0].startsWith("-") ? argv[0] : "week").toLowerCase();
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
      const busy = r.written.map((w) => ({ w, e: runHandoff(w.path) })).filter((x) => x.e && x.e.busy);
      const n = r.written.length - busy.length;
      if (n) console.log("\n" + c.g("→ ") + `Handed ${n} repo(s) to your agent (${r.handoff}).`);
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
  "  " + c.b("symbiot login") + c.d("   pick Claude, OpenAI, Gemini, or a local model (Ollama)") + "\n" +
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
function cmdApp() {
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
    console.log(c.g("✓ ") + `Already connected — ${PROVIDERS[existing.provider].label} via ${existing.source}.`);
    console.log(c.d("  Switch or replace it with `symbiot login --force`."));
    return;
  }

  let provider = flagProvider;
  if (!provider) {
    console.log("\n" + c.b("Connect Symbiot") + "\n");
    console.log("Which AI should Symbiot write your updates with?\n");
    console.log("  1) " + PROVIDERS.anthropic.label + c.d("    — needs an Anthropic API key"));
    console.log("  2) " + PROVIDERS.openai.label + c.d("          — needs an OpenAI API key"));
    console.log("  3) " + PROVIDERS.gemini.label + c.d("       — needs a Google AI API key"));
    console.log("  4) " + PROVIDERS.ollama.label + c.d("  — runs on your machine, no key"));
    const pick = (await ask("\nChoose 1-4 [1]: ")) || "1";
    provider = { 1: "anthropic", 2: "openai", 3: "gemini", 4: "ollama" }[pick] || (PROVIDERS[pick] ? pick : "anthropic");
  }
  if (!PROVIDERS[provider]) { console.log(c.y("Unknown provider: " + provider)); return; }
  const meta = PROVIDERS[provider];
  const cfg = loadConfig();

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
// for an agent to see what the page says: an email's text isn't a region.
function screenJson(s) {
  if (!s || s.error) return s;
  const bp = blueprint(s), image = screenImage(s.id);
  return { id: s.id, ...(image ? { image } : {}), ...(s.note ? { note: s.note } : {}), ...(s.pressed ? { pressed: s.pressed, found: s.found } : {}), ...(s.typed ? { typed: s.typed, entered: s.entered, found: s.found } : {}), ...(s.kept ? { kept: true } : {}), ...(s.page ? { trusted: isTrusted(s.page.url) } : {}), ...bp, regions: bp.regions.map((r, i) => ({ id: s.regions[i].id, ...r })) };
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
async function cmdScreens() {
  const [sub = "list", a1, a2, a3] = argv.slice(1).filter((x, i, all) => !x.startsWith("--") && all[i - 1] !== "--name");
  const out = (x) => { console.log(JSON.stringify(x, null, 2)); if (x && x.error) process.exitCode = 1; };
  const find = (id) => loadScreens().find((s) => s.id === id);
  if (sub === "list") {
    const list = loadScreens();
    if (!list.length) console.log(c.d("No screens yet. Map a web page with  symbiot screens map <site>,  or capture one in the app."));
    for (const s of list) console.log(`${s.id}  ${s.name}  ${c.d(`${(s.regions || []).length} regions · ${s.page ? s.page.url : s.w + "×" + s.h + " " + s.via}`)}`);
    return;
  }
  if (sub === "map") { const body = { site: a1, name: flag("name", "") }; return out(screenJson((await viaApp("/api/screens/map", body)) || await mapPage(body.site, body.name))); }
  if (sub === "show") { const s = find(a1); return out(s ? screenJson(s) : { error: "No screen " + (a1 || "") + ". symbiot screens lists them." }); }
  if (sub === "signin") { const r = (await viaApp("/api/screens/signin", { site: a1 })) || await signIn(a1); return out(r.ok ? { ...r, next: "Sign in in the window that opened, close it, then map again." } : r); }
  if (sub === "press" || sub === "type") {
    const s = find(a1); if (!s) return out({ error: "No screen " + (a1 || "") + ". symbiot screens lists them." });
    const want = String(a2 || "").toLowerCase(), rs = s.regions || [];
    const r = rs.find((x) => x.id === a2) || rs.find((x) => x.label.toLowerCase() === want) || (rs.filter((x) => x.label.toLowerCase().includes(want)).length === 1 && rs.find((x) => x.label.toLowerCase().includes(want)));
    if (!want || !r) return out({ error: `No region "${a2 || ""}" on that screen (give its id, or a label that matches one region).` });
    // a draft reply's agent (SYMBIOT_DRAFT, watch.mjs) never presses Send
    const body = { id: s.id, region: r.id, confirmed: has("yes"), ...(sub === "type" ? { text: a3, enter: has("enter") } : { noSend: !!process.env.SYMBIOT_DRAFT }) };
    const done = (await viaApp("/api/screens/" + sub, body)) || (sub === "press" ? await pressRegion(s.id, r.id, { confirmed: body.confirmed, noSend: body.noSend }) : await typeRegion(s.id, r.id, a3, { enter: body.enter, confirmed: body.confirmed }));
    // not a trusted site: say how to go ahead (only you can trust a site, in the app's Settings)
    if (done && done.confirm) return out({ error: `${done.error} Add --yes to go ahead, or list ${done.host} under Trusted sites in Symbiot's Settings.` });
    return out(screenJson(done));
  }
  console.log(`${c.b("symbiot screens")} ${c.d("— experimental")}
  symbiot screens                              list your screens
  symbiot screens map <site> [--name N]        open a site in a hidden browser and map
                                               its buttons, links and fields (JSON)
  symbiot screens show <id>                    a screen's blueprint (JSON)
  symbiot screens press <id> <region> [--yes]  press a region there, map where it lands
  symbiot screens type <id> <field> "text" [--enter] [--yes]
                                               type into a field (Enter sends it), map the result
  symbiot screens signin <site>                sign in once, in Symbiot's browser window
  --yes is needed unless the page's site is under Trusted sites in the app's Settings.
  While the app runs, these use its hidden browser, which stays open a few minutes:
  press on the screen the last command printed carries on from that page as it is
  (type without --enter, then press the form's button).`);
  if (sub !== "help") process.exitCode = 1;
}

// ---- `symbiot watch`: pages Symbiot keeps track of, and what's new on them ----
// new, add, remove and check print JSON, for you or an agent.
async function cmdWatch() {
  const [sub = "list", a1] = argv.slice(1).filter((x, i, all) => !x.startsWith("--") && !["--every", "--hours"].includes(all[i - 1]));
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
  if (sub === "new") return out(newsSince(hours));
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
  symbiot watch check [id]                     read them now (JSON)
  symbiot watch brief [on|off]                 your AI says what needs you, and what can wait
  symbiot watch remove <id>                    stop watching it
  While the app runs it reads each page every few minutes in its hidden browser
  (only reads: nothing is pressed or typed), and notifies you of what's new.
  Standup counts what's new since yesterday ("Waiting on you: 3 emails").`);
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

const HELP =`${c.b("symbiot")} — your week, written from your real work.

${c.b("Usage")}
  symbiot ${c.d("(or)")} symbiot week      write up your last ${SINCE_WEEK} days
  symbiot standup                   yesterday + today, for standup
  symbiot todo                      what's still on your plate
  symbiot app                       open the visual app in your browser
  symbiot drift [--fetch]           what's out of sync / at risk across repos
  symbiot push [--open]             write tasks into each repo (and run your agent)
  symbiot login                     connect it to an AI (once)
  symbiot whoami                    show how it's connected
  symbiot logout                    forget saved credentials
  symbiot help

${c.b("Experimental")}
  symbiot drift --ci                also check GitHub Actions (needs gh)
  symbiot mail [--on|--off]         use the mail you sent in write-ups (local, no API)
  symbiot models                    recommend AI models for your hardware
  symbiot setup-local [--model X]   install/run a free local model (Ollama)
  symbiot screens map <site>        map a web page's buttons in a hidden browser
                                    (symbiot screens help for more)
  symbiot watch add <screen id>     keep track of a mapped page: what's new on it
  symbiot watch add github          ...or your GitHub notifications
                                    (symbiot watch help for more)
  symbiot phone pair <address> <code>
                                    in Termux: pair with your computer for
                                    Watch on your phone (symbiot phone help)

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
  if (cmd === "login" || cmd === "auth") return cmdLogin();
  if (cmd === "logout") return cmdLogout();
  if (cmd === "whoami" || cmd === "status") return cmdWhoami();
  if (cmd === "app" || cmd === "ui") return cmdApp();
  if (cmd === "models" || cmd === "hardware") return cmdModels();
  if (cmd === "setup-local" || cmd === "setup-ollama") return cmdSetupLocal();
  if (cmd === "drift") return cmdDrift();
  if (cmd === "push") return cmdPush();
  if (cmd === "mail" || cmd === "email") return cmdMail();
  if (cmd === "screens" || cmd === "screen") return cmdScreens();
  if (cmd === "watch") return cmdWatch();
  if (cmd === "phone") return cmdPhone();
  if (cmd === "week") return cmdRun("week");
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

export { authorship, repoState, readmeInfo, repoShape, houseRules, findAllRepos, buildMap, reportFooter, detectHardware, recommendModels, computeDrift, driftRepo, gitDefaultBranch, buildTasksMd, taskType, EMBEDDED_UI, orcaHandoffCmd, migrateOrcaCmd, migrateClaudeCmd, fillHandoff, handoffCmd, setHandoffCmd, ORCA_CLAUDE_CMD, CLAUDE_CMD, HANDOFF_PROMPT, shipChanges, shipWithBump, bumpOffer, learnNpm, releaseNeeded, withReleases, setVersion, syncTasks, pendingReview, unreleased, publishesOnMerge, addTask, approveRepo, approveChanges, sendBack, pushTasks, semverGt, updateCmd, parseQuestions, agentQuestions };

