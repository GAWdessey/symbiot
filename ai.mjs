// The AI Symbiot writes with: the providers, which one is set up, one call per
// provider (same in, same out), and the local-model (Ollama) setup.
import Anthropic from "@anthropic-ai/sdk";
import { spawn, spawnSync } from "node:child_process";
import { homedir, totalmem, cpus as oscpus } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { loadConfig, saveConfig, sh, hasCmd, CONFIG_DIR } from "./core.mjs";

const MAX_TOKENS = 1600;

// The providers Symbiot can write with. Models are sensible defaults; override
// per provider at login, or globally with SYMBIOT_MODEL.
const PROVIDERS = {
  // your Claude subscription (Pro or Max), through Claude Code signed in on this computer: no key
  claude:    { label: "Your Claude subscription (Claude Code)", sub: true, keyUrl: "https://claude.com/claude-code", keyName: null, model: "" },
  anthropic: { label: "Claude (Anthropic)", env: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"], keyUrl: "https://console.anthropic.com/settings/keys", keyName: "Anthropic API key (sk-ant-…)", model: "claude-opus-5-5" },
  openai:    { label: "OpenAI (GPT)",       env: ["OPENAI_API_KEY"],                            keyUrl: "https://platform.openai.com/api-keys",       keyName: "OpenAI API key (sk-…)",     model: "gpt-4o-mini" },
  gemini:    { label: "Gemini (Google)",    env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],          keyUrl: "https://aistudio.google.com/apikey",         keyName: "Google AI API key",         model: "gemini-1.5-flash" },
  ollama:    { label: "Local model (Ollama)", local: true,                                       keyUrl: "https://ollama.com",                         keyName: null,                        model: "llama3.1" },
};

// ---- your Claude subscription -------------------------------------------------
// Claude Code signed in with a Claude account (Pro or Max) answers with that account,
// no API key: Symbiot runs it headless (claude -p), the way it already runs your
// agents. Whether it's there and signed in: `claude auth status` (a quarter of a
// second), kept 5 minutes. SYMBIOT_CLAUDE_CMD replaces the command (the tests' stand-in).
const CLAUDE_BIN = () => process.env.SYMBIOT_CLAUDE_CMD || "claude";
// How to run it. Windows: npm installs `claude` as claude.cmd, which Node can only
// start through cmd.exe (a .exe, from Claude's own installer, it starts directly), so
// it's found with `where` and its arguments are quoted for cmd.exe.
const winQuote = (a) => '"' + String(a).replace(/"/g, '""') + '"';
function claudeCommand(platform = process.platform) {
  const bin = CLAUDE_BIN();
  if (platform !== "win32") return { file: bin, shell: false };
  if (/\.exe$/i.test(bin)) return { file: bin, shell: false };
  if (/\.(cmd|bat)$/i.test(bin)) return { file: bin, shell: true };
  try {
    const hits = String(spawnSync("where", [bin], { encoding: "utf8", timeout: 5000 }).stdout || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const exe = hits.find((h) => /\.exe$/i.test(h)); if (exe) return { file: exe, shell: false };
    const cmd = hits.find((h) => /\.(cmd|bat)$/i.test(h)); if (cmd) return { file: cmd, shell: true };
  } catch {}
  return { file: bin, shell: true };
}
function claudeSpawn(args, opts = {}, sync = false) {
  const c = claudeCommand(), run = sync ? spawnSync : spawn;
  return c.shell ? run([c.file, ...args].map(winQuote).join(" "), [], { ...opts, shell: true, windowsHide: true }) : run(c.file, args, { ...opts, windowsHide: true });
}
let CLAUDE_SEEN = null;
function claudeState(fresh = false) {
  if (!fresh && CLAUDE_SEEN && Date.now() - CLAUDE_SEEN.at < 300000) return CLAUDE_SEEN;
  let installed = !!process.env.SYMBIOT_CLAUDE_CMD || hasCmd("claude"), signedIn = false;
  if (installed) {
    try {
      const r = claudeSpawn(["auth", "status"], { encoding: "utf8", timeout: 8000, env: process.env }, true);
      if (r.error && r.error.code === "ENOENT") installed = false;
      else { const j = JSON.parse(String(r.stdout || "").trim() || "{}"); signedIn = !!j.loggedIn && j.authMethod !== "apiKey"; }
    } catch {}
  }
  CLAUDE_SEEN = { installed, signedIn, at: Date.now() };
  return CLAUDE_SEEN;
}
const claudeReady = (fresh) => claudeState(fresh).signedIn;
// What to do when it isn't: one line, for the CLI and the app.
function claudeHelp(st = claudeState()) {
  return st.installed ? "Claude Code is installed but not signed in: run  claude  once in a terminal and sign in with your Claude account, then try again."
    : "Install Claude Code ( npm install -g @anthropic-ai/claude-code ), run  claude  once and sign in with your Claude account, then try again.";
}

// ---- config + provider resolution (config files: core.mjs) -----------------
function antProfileExists() {
  try { return existsSync(join(homedir(), ".config", "anthropic")); } catch { return false; }
}

function envKey(provider) {
  for (const e of (PROVIDERS[provider].env || [])) if (process.env[e]) return process.env[e];
  return null;
}
// Returns { provider, key?, baseUrl?, model, source } or null if nothing set up.
// Order: saved choice → your Claude subscription (Claude Code signed in) → legacy
// saved key → env keys → an `ant` profile. With no choice saved, the subscription
// comes before a key: it's what most people already pay for.
function resolveProvider() {
  const cfg = loadConfig();
  const m = process.env.SYMBIOT_MODEL;
  const sub = () => ({ provider: "claude", model: m || (cfg.claude || {}).model || "", source: "your Claude subscription (Claude Code)" });
  if (cfg.provider === "claude" && claudeReady()) return sub();
  if (cfg.provider && cfg.provider !== "claude" && PROVIDERS[cfg.provider]) {
    const p = cfg.provider, pc = cfg[p] || {};
    if (p === "ollama") return { provider: p, baseUrl: pc.baseUrl || "http://localhost:11434", model: m || pc.model || PROVIDERS.ollama.model, source: "saved login" };
    const key = pc.apiKey || envKey(p);
    if (key || (p === "anthropic" && (process.env.ANTHROPIC_AUTH_TOKEN || antProfileExists())))
      return { provider: p, key, model: m || pc.model || PROVIDERS[p].model, source: pc.apiKey ? "saved login" : "environment" };
  }
  if ((!cfg.provider || cfg.provider === "claude") && claudeReady()) return sub();
  if (cfg.apiKey) return { provider: "anthropic", key: cfg.apiKey, model: m || PROVIDERS.anthropic.model, source: "saved login (~/.config/symbiot)" };
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return { provider: "anthropic", key: process.env.ANTHROPIC_API_KEY, model: m || PROVIDERS.anthropic.model, source: "ANTHROPIC_* (environment)" };
  if (process.env.OPENAI_API_KEY) return { provider: "openai", key: process.env.OPENAI_API_KEY, model: m || PROVIDERS.openai.model, source: "OPENAI_API_KEY (environment)" };
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return { provider: "gemini", key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, model: m || PROVIDERS.gemini.model, source: "GEMINI/GOOGLE_API_KEY (environment)" };
  if (antProfileExists()) return { provider: "anthropic", model: m || PROVIDERS.anthropic.model, source: "Anthropic CLI profile (ant auth login)" };
  return null;
}

// ---- model calls (one per provider, same in/out) --------------------------
// Claude Code, headless, on your subscription: Symbiot's own instructions as the
// system prompt (from a file: Windows' command line holds only ~8,000 characters,
// and they run longer), the prompt on stdin, no tools (Read only, for screenshots you
// attached), none of your settings, plugins or servers, no session kept. Not --bare:
// that ignores the subscription sign-in.
function callClaude(r, system, prompt, images = []) {
  const shots = [];
  for (const i of images) {
    if (i.path) { shots.push(i.path); continue; }
    try { const dir = join(CONFIG_DIR, "uploads"); mkdirSync(dir, { recursive: true, mode: 0o700 }); const f = join(dir, `${Date.now()}-${shots.length}.${/png/.test(i.mime) ? "png" : /webp/.test(i.mime) ? "webp" : /gif/.test(i.mime) ? "gif" : "jpg"}`); writeFileSync(f, Buffer.from(i.data, "base64"), { mode: 0o600 }); shots.push(f); } catch {}
  }
  const input = shots.length ? `${prompt}\n\nScreenshots they attached (look at them with your Read tool): ${shots.join(", ")}` : prompt;
  let sysFile = ""; try { mkdirSync(CONFIG_DIR, { recursive: true }); sysFile = join(CONFIG_DIR, `.system-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`); writeFileSync(sysFile, system, { mode: 0o600 }); } catch { sysFile = ""; }
  const drop = () => { if (sysFile) { try { unlinkSync(sysFile); } catch {} } };
  const args = ["-p", "--output-format", "json", ...(sysFile ? ["--system-prompt-file", sysFile] : ["--system-prompt", system]), "--tools", shots.length ? "Read" : "", "--setting-sources", "",
    "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands", ...(r.model ? ["--model", r.model] : [])];
  return new Promise((resolve, reject) => {
    let out = "", err = "", done = false;
    let ch; try { ch = claudeSpawn(args, { cwd: CONFIG_DIR, stdio: ["pipe", "pipe", "pipe"], env: process.env }); } catch (e) { drop(); reject(e); return; }
    const t = setTimeout(() => { if (!done) { done = true; try { ch.kill("SIGTERM"); } catch {} reject(new Error("Claude Code didn't answer within 3 minutes")); } }, 180000);
    ch.stdout.on("data", (d) => { out += d; }); ch.stderr.on("data", (d) => { err += d; });
    ch.on("error", (e) => { drop(); if (!done) { done = true; clearTimeout(t); reject(e); } });
    ch.on("close", () => {
      drop();
      if (done) return; done = true; clearTimeout(t);
      let j = null; try { j = JSON.parse(out.trim().split("\n").filter(Boolean).pop() || "{}"); } catch {}
      if (j && j.is_error === false && typeof j.result === "string") { resolve(j.result.trim()); return; }
      const why = (j && j.result) || err.trim().split("\n").pop() || out.trim().slice(0, 200) || "no answer";
      CLAUDE_SEEN = null; // signed out since? ask again next time
      reject(new Error(`Claude Code: ${String(why).slice(0, 300)}`));
    });
    ch.stdin.end(input);
  });
}
// Screenshots you dropped into the talk: [{ mime, data (base64) }], in each model's own shape.
async function callAnthropic(r, system, prompt, images = []) {
  const client = new Anthropic(r.key ? { apiKey: r.key } : {});
  const content = images.length ? [...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.data } })), { type: "text", text: prompt }] : prompt;
  const base = { model: r.model, max_tokens: MAX_TOKENS, system, messages: [{ role: "user", content }] };
  let res;
  try { res = await client.messages.create({ ...base, output_config: { effort: "low" } }); }
  catch (e) {
    // effort/output_config isn't accepted on every model (e.g. Haiku) — retry plain
    if (/effort|output_config|thinking|budget|400/i.test(e?.message || "")) res = await client.messages.create(base);
    else throw e;
  }
  if (res.stop_reason === "refusal") return "(the model declined this one — odd for a work summary; try again)";
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}
async function callOpenAI(r, system, prompt, images = []) {
  const messages = [{ role: "system", content: system }, { role: "user", content: images.length ? [{ type: "text", text: prompt }, ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.data}` } }))] : prompt }];
  // Newer models want max_completion_tokens instead of max_tokens; try both.
  for (const tokKey of ["max_tokens", "max_completion_tokens"]) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${r.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: r.model, [tokKey]: MAX_TOKENS, messages }),
    });
    const text = await res.text();
    if (res.ok) return (JSON.parse(text).choices?.[0]?.message?.content || "").trim();
    if (res.status === 400 && tokKey === "max_tokens" && /max_tokens|max_completion_tokens/i.test(text)) continue;
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }
  return "";
}
async function callGemini(r, system, prompt, images = []) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(r.model)}:generateContent?key=${encodeURIComponent(r.key)}`;
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }, ...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } }))] }],
      generationConfig: { maxOutputTokens: MAX_TOKENS },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`);
  const parts = JSON.parse(text).candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("").trim();
}
async function callOllama(r, system, prompt, images = []) {
  const res = await fetch(`${r.baseUrl}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: r.model, stream: false, messages: [{ role: "system", content: system }, { role: "user", content: prompt, ...(images.length ? { images: images.map((i) => i.data) } : {}) }] }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (/not found|no such model|try pulling/i.test(text)) throw new Error(`the model "${r.model}" isn't downloaded yet — run  symbiot setup-local --model ${r.model}  (or click "Set up a free local model" in Settings)`);
    throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`);
  }
  return (JSON.parse(text).message?.content || "").trim();
}

// What write() shows in a terminal while it works: the CLI sets these (its
// spinner, its coloured hints); imported on its own, it stays quiet.
const AI_UI = {
  spinner: () => () => {},
  notConnected: () => console.log("Symbiot needs an AI to write your updates. With a Claude subscription, sign in to Claude Code (run  claude  once) and Symbiot uses it, no key. Otherwise: symbiot login"),
  rejected: (label) => console.log(`Your ${label} credentials were rejected. Reconnect with:  symbiot login --force`),
};
async function write(system, prompt, { images = [] } = {}) {
  const r = resolveProvider();
  if (!r) { AI_UI.notConnected(); return null; }
  const stop = AI_UI.spinner("thinking…");
  try {
    if (r.provider === "claude") return await callClaude(r, system, prompt, images);
    if (r.provider === "anthropic") return await callAnthropic(r, system, prompt, images);
    if (r.provider === "openai") return await callOpenAI(r, system, prompt, images);
    if (r.provider === "gemini") return await callGemini(r, system, prompt, images);
    if (r.provider === "ollama") return await callOllama(r, system, prompt, images);
    return null;
  } catch (err) {
    if (/\b401\b|\b403\b|invalid|authentication|api key|unauthor/i.test(err?.message || "")) {
      AI_UI.rejected(PROVIDERS[r.provider].label);
      return null;
    }
    return `Couldn't reach the model: ${err?.message || err}`;
  } finally { stop(); }
}

async function validate(provider, { key, baseUrl } = {}) {
  try {
    if (provider === "claude") return claudeReady(true);
    if (provider === "anthropic") { await new Anthropic({ apiKey: key }).models.list(); return true; }
    if (provider === "openai") return (await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } })).ok;
    if (provider === "gemini") return (await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`)).ok;
    if (provider === "ollama") return (await fetch(`${baseUrl}/api/tags`)).ok;
  } catch { return false; }
  return false;
}

// ---- hardware -> model recommendations ------------------------------------
function detectGpu() {
  const nv = sh("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null").trim();
  if (nv) { const p = nv.split("\n")[0].split(","); return { name: (p[0] || "NVIDIA GPU").trim(), vramGB: Math.round(Number(p[1]) / 1024) || null, kind: "nvidia" }; }
  if (process.platform === "linux") { const vga = sh("lspci 2>/dev/null | grep -iE 'vga|3d controller|display' | head -1").replace(/^.*?: /, "").trim(); if (vga) return { name: vga, vramGB: null, kind: "other" }; }
  if (process.platform === "darwin") { const chip = sh("sysctl -n machdep.cpu.brand_string 2>/dev/null").trim(); if (/apple/i.test(chip)) return { name: chip + " (unified memory)", vramGB: null, kind: "apple" }; }
  return null;
}
function detectHardware() {
  const cpus = oscpus() || [];
  return { platform: process.platform, arch: process.arch, ramGB: Math.round(totalmem() / 1073741824), cpuCount: cpus.length, cpuModel: ((cpus[0] && cpus[0].model) || "CPU").trim(), gpu: detectGpu() };
}
function recommendModels(hw) {
  const ram = hw.ramGB || 8;
  const local = [
    { tier: "min", model: "llama3.2:3b", needGB: 6, note: "fast & light — fine for summaries" },
    { tier: "med", model: "llama3.1:8b", needGB: 10, note: "solid all-rounder" },
    { tier: "max", model: "qwen2.5:14b", needGB: 18, note: "stronger reasoning" },
  ];
  if (ram >= 40) local.push({ tier: "max+", model: "llama3.1:70b", needGB: 48, note: "top local quality — big machine/GPU" });
  local.forEach((m) => { m.fits = ram >= m.needGB; });
  const paid = [
    { provider: "anthropic", tier: "cheap", model: "claude-haiku-4-5", note: "cheapest Claude" },
    { provider: "anthropic", tier: "top", model: "claude-opus-5-5", note: "best Claude (default)" },
    { provider: "openai", tier: "cheap", model: "gpt-4o-mini", note: "cheap OpenAI" },
    { provider: "openai", tier: "top", model: "gpt-4o", note: "stronger OpenAI" },
    { provider: "gemini", tier: "cheap", model: "gemini-1.5-flash", note: "cheap Google" },
    { provider: "gemini", tier: "top", model: "gemini-1.5-pro", note: "stronger Google" },
  ];
  const best = (local.slice().reverse().find((m) => m.fits) || local[0]).model;
  return { local, paid, best };
}
// ---- local model one-command setup (Ollama), OS-aware ---------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function hasOllama() { return !!sh("ollama --version").trim(); } // cross-platform (not POSIX command -v)
function ollamaInstall() {
  if (process.platform === "darwin") return { cmd: "brew install ollama", alt: "https://ollama.com/download" };
  if (process.platform === "win32") return { cmd: "winget install Ollama.Ollama", alt: "https://ollama.com/download" };
  return { cmd: "curl -fsSL https://ollama.com/install.sh | sh", alt: "https://ollama.com/download" };
}
async function ollamaUp() { try { const r = await fetch("http://127.0.0.1:11434/api/tags"); return r.ok; } catch { return false; } }
async function ensureOllama() {
  if (await ollamaUp()) return true;
  try { spawn("ollama", ["serve"], { detached: true, stdio: "ignore" }).unref(); } catch {}
  for (let i = 0; i < 16; i++) { await sleep(500); if (await ollamaUp()) return true; }
  return false;
}
function useOllamaModel(model) { const cfg = loadConfig(); cfg.provider = "ollama"; cfg.ollama = { baseUrl: "http://localhost:11434", model }; delete cfg.apiKey; saveConfig(cfg); }

// Save a provider connection (used by the web Settings panel); mirrors cmdLogin.
async function connectProvider(b) {
  const provider = b && b.provider;
  if (!PROVIDERS[provider]) return { ok: false, message: "Unknown provider." };
  const cfg = loadConfig();
  if (provider === "claude") {
    if (!claudeReady(true)) return { ok: false, message: claudeHelp(claudeState()) };
    const model = (b.model || "").trim();
    cfg.provider = "claude"; cfg.claude = model ? { model } : {};
    return saveConfig(cfg) ? { ok: true, message: `Connected: ${PROVIDERS.claude.label}${model ? " · " + model : ""}. No key needed.` } : { ok: false, message: "Couldn't write the config file." };
  }
  if (provider === "ollama") {
    const baseUrl = (b.baseUrl || "http://localhost:11434").trim();
    const model = (b.model || "").trim() || PROVIDERS.ollama.model;
    if (!(await validate("ollama", { baseUrl }))) return { ok: false, message: `Couldn't reach Ollama at ${baseUrl}. Is it running?` };
    cfg.provider = "ollama"; cfg.ollama = { baseUrl, model }; delete cfg.apiKey;
    return saveConfig(cfg) ? { ok: true, message: `Connected: ${PROVIDERS.ollama.label} · ${model}` } : { ok: false, message: "Couldn't write the config file." };
  }
  const key = (b.key || "").trim();
  if (!key) return { ok: false, message: "No key entered." };
  const model = (b.model || "").trim() || PROVIDERS[provider].model;
  if (!(await validate(provider, { key }))) return { ok: false, message: `That key didn't work for ${PROVIDERS[provider].label}.` };
  cfg.provider = provider; cfg[provider] = { apiKey: key, model }; delete cfg.apiKey;
  return saveConfig(cfg) ? { ok: true, message: `Connected: ${PROVIDERS[provider].label} · ${model}` } : { ok: false, message: "Couldn't write the config file." };
}

export { PROVIDERS, AI_UI, resolveProvider, write, validate, connectProvider, detectHardware, recommendModels, hasOllama, ollamaInstall, ensureOllama, useOllamaModel , claudeState, claudeReady, claudeHelp , claudeCommand };
