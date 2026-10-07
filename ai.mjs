// The AI Symbiot writes with: the providers, which one is set up, one call per
// provider (same in, same out), and the local-model (Ollama) setup.
import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import { homedir, totalmem, cpus as oscpus } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { loadConfig, saveConfig, sh } from "./core.mjs";

const MAX_TOKENS = 1600;

// The providers Symbiot can write with. Models are sensible defaults; override
// per provider at login, or globally with SYMBIOT_MODEL.
const PROVIDERS = {
  anthropic: { label: "Claude (Anthropic)", env: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"], keyUrl: "https://console.anthropic.com/settings/keys", keyName: "Anthropic API key (sk-ant-…)", model: "claude-opus-5-5" },
  openai:    { label: "OpenAI (GPT)",       env: ["OPENAI_API_KEY"],                            keyUrl: "https://platform.openai.com/api-keys",       keyName: "OpenAI API key (sk-…)",     model: "gpt-4o-mini" },
  gemini:    { label: "Gemini (Google)",    env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],          keyUrl: "https://aistudio.google.com/apikey",         keyName: "Google AI API key",         model: "gemini-1.5-flash" },
  ollama:    { label: "Local model (Ollama)", local: true,                                       keyUrl: "https://ollama.com",                         keyName: null,                        model: "llama3.1" },
};

// ---- config + provider resolution (config files: core.mjs) -----------------
function antProfileExists() {
  try { return existsSync(join(homedir(), ".config", "anthropic")); } catch { return false; }
}

function envKey(provider) {
  for (const e of (PROVIDERS[provider].env || [])) if (process.env[e]) return process.env[e];
  return null;
}
// Returns { provider, key?, baseUrl?, model, source } or null if nothing set up.
// Order: saved choice → legacy saved key → env keys → an `ant` profile.
function resolveProvider() {
  const cfg = loadConfig();
  const m = process.env.SYMBIOT_MODEL;
  if (cfg.provider && PROVIDERS[cfg.provider]) {
    const p = cfg.provider, pc = cfg[p] || {};
    if (p === "ollama") return { provider: p, baseUrl: pc.baseUrl || "http://localhost:11434", model: m || pc.model || PROVIDERS.ollama.model, source: "saved login" };
    const key = pc.apiKey || envKey(p);
    if (key || (p === "anthropic" && (process.env.ANTHROPIC_AUTH_TOKEN || antProfileExists())))
      return { provider: p, key, model: m || pc.model || PROVIDERS[p].model, source: pc.apiKey ? "saved login" : "environment" };
  }
  if (cfg.apiKey) return { provider: "anthropic", key: cfg.apiKey, model: m || PROVIDERS.anthropic.model, source: "saved login (~/.config/symbiot)" };
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return { provider: "anthropic", key: process.env.ANTHROPIC_API_KEY, model: m || PROVIDERS.anthropic.model, source: "ANTHROPIC_* (environment)" };
  if (process.env.OPENAI_API_KEY) return { provider: "openai", key: process.env.OPENAI_API_KEY, model: m || PROVIDERS.openai.model, source: "OPENAI_API_KEY (environment)" };
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return { provider: "gemini", key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, model: m || PROVIDERS.gemini.model, source: "GEMINI/GOOGLE_API_KEY (environment)" };
  if (antProfileExists()) return { provider: "anthropic", model: m || PROVIDERS.anthropic.model, source: "Anthropic CLI profile (ant auth login)" };
  return null;
}

// ---- model calls (one per provider, same in/out) --------------------------
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
  notConnected: () => console.log("Symbiot needs an AI to write your updates. Connect one with: symbiot login"),
  rejected: (label) => console.log(`Your ${label} credentials were rejected. Reconnect with:  symbiot login --force`),
};
async function write(system, prompt, { images = [] } = {}) {
  const r = resolveProvider();
  if (!r) { AI_UI.notConnected(); return null; }
  const stop = AI_UI.spinner("thinking…");
  try {
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

export { PROVIDERS, AI_UI, resolveProvider, write, validate, connectProvider, detectHardware, recommendModels, hasOllama, ollamaInstall, ensureOllama, useOllamaModel };
