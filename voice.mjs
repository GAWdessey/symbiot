// symbiot — Symbiot's own voice, for computers whose built-in voices sound robotic.
// The page picks the voice itself: a natural voice the system already has (Windows
// and Edge, Macs, phones) is used as it is. Where there's none (Linux, mostly: only
// espeak), Symbiot speaks with Piper, a small open-source speech engine that runs on
// the computer, with a public-domain voice picked from where you are: British English
// (Cori) for the UK, South Africa, Australia and the rest, American (LJSpeech) for the
// US, Canada and the Philippines. Nothing to choose, no account, nothing leaves the
// computer. Downloaded once, the first time it's needed (~25 MB engine, ~60 MB voice),
// into ~/.config/symbiot/voice/. Kept warm while you talk, closed after 5 quiet minutes.
// SYMBIOT_VOICE_DIR / SYMBIOT_PIPER_URL / SYMBIOT_VOICES_URL point elsewhere (tests).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream, readFileSync, rmSync, renameSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "./core.mjs";

const PIPER_REL = "2023.11.14-2";
const PIPER_ASSET = { "linux-x64": "piper_linux_x86_64.tar.gz", "linux-arm64": "piper_linux_aarch64.tar.gz", "linux-arm": "piper_linux_armv7l.tar.gz", "darwin-x64": "piper_macos_x64.tar.gz", "darwin-arm64": "piper_macos_aarch64.tar.gz", "win32-x64": "piper_windows_amd64.zip" };
// public-domain voices only: free to use in Symbiot, commercially, with no conditions
const VOICES = {
  gb: { id: "en_GB-cori-medium", path: "en/en_GB/cori/medium", who: "British English" },
  us: { id: "en_US-ljspeech-medium", path: "en/en_US/ljspeech/medium", who: "American English" },
};
const US_LIKE = new Set(["us", "ca", "ph", "lr", "pr", "um", "as", "gu", "vi"]);
const IDLE_MS = 5 * 60 * 1000;

const vdir = () => process.env.SYMBIOT_VOICE_DIR || join(CONFIG_DIR, "voice");
const piperUrl = (asset) => (process.env.SYMBIOT_PIPER_URL || `https://github.com/rhasspy/piper/releases/download/${PIPER_REL}`) + "/" + asset;
const voiceUrl = (v, ext) => (process.env.SYMBIOT_VOICES_URL || "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0") + `/${v.path}/${v.id}${ext}`;

// Which voice for this language ("en-ZA", "en_US", "en"): null when Piper has none we use.
function voiceFor(lang = "") {
  const [l, r = ""] = String(lang).toLowerCase().replace("_", "-").split("-");
  if (l !== "en") return null;
  return US_LIKE.has(r) ? VOICES.us : VOICES.gb;
}
function assetFor(platform = process.platform, arch = process.arch) { return PIPER_ASSET[`${platform}-${arch}`] || null; }
function piperBin(platform = process.platform) { return join(vdir(), "piper", platform === "win32" ? "piper.exe" : "piper"); }
const modelPath = (v) => join(vdir(), "voices", v.id + ".onnx");
const haveVoice = (v) => existsSync(modelPath(v)) && existsSync(modelPath(v) + ".json");

const S = { busy: null, error: "", got: 0, total: 0 };
function voiceState(lang = "") {
  const v = voiceFor(lang);
  if (!v) return { state: "none", why: "no voice for this language" };
  if (!assetFor()) return { state: "none", why: "not on this kind of computer" };
  if (existsSync(piperBin()) && haveVoice(v)) return { state: "ready", voice: v.who };
  if (S.busy) return { state: "downloading", voice: v.who, ...(S.total ? { percent: Math.min(99, Math.round((S.got / S.total) * 100)) } : {}) };
  return { state: S.error ? "failed" : "missing", voice: v.who, ...(S.error ? { error: S.error } : {}) };
}

async function download(url, to) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok || !r.body) throw new Error(`couldn't download ${url.split("/").pop()} (${r.status})`);
  S.total += Number(r.headers.get("content-length")) || 0;
  const part = to + ".part", out = createWriteStream(part);
  for await (const chunk of r.body) { S.got += chunk.length; if (!out.write(chunk)) await new Promise((ok) => out.once("drain", ok)); }
  await new Promise((ok, bad) => out.end((e) => (e ? bad(e) : ok())));
  renameSync(part, to);
}
// The engine and this language's voice, once. Safe to call again: it only fetches what's missing.
function prepareVoice(lang = "") {
  const v = voiceFor(lang), asset = assetFor();
  if (!v || !asset) return voiceState(lang);
  if (S.busy) return voiceState(lang);
  if (existsSync(piperBin()) && haveVoice(v)) return voiceState(lang);
  S.error = ""; S.got = 0; S.total = 0;
  S.busy = (async () => {
    const dir = vdir(); mkdirSync(join(dir, "voices"), { recursive: true });
    if (!existsSync(piperBin())) {
      const arc = join(dir, asset);
      await download(piperUrl(asset), arc);
      // tar unpacks both: .tar.gz everywhere, and .zip on Windows 10+ (bsdtar)
      const t = spawnSync("tar", [asset.endsWith(".zip") ? "-xf" : "-xzf", arc, "-C", dir], { encoding: "utf8", windowsHide: true });
      rmSync(arc, { force: true });
      if (t.status !== 0 || !existsSync(piperBin())) throw new Error("couldn't unpack the speech engine" + (t.stderr ? ": " + String(t.stderr).trim().split("\n").pop() : ""));
    }
    if (!haveVoice(v)) { await download(voiceUrl(v, ".onnx.json"), modelPath(v) + ".json"); await download(voiceUrl(v, ".onnx"), modelPath(v)); }
  })().catch((e) => { S.error = String((e && e.message) || e); }).finally(() => { S.busy = null; });
  return voiceState(lang);
}

// One warm engine per voice: a line of text in, the path of its .wav out, in order.
const WARM = new Map();
function engine(v) {
  let w = WARM.get(v.id);
  if (w && !w.dead) { clearTimeout(w.idle); w.idle = setTimeout(() => stopEngine(v.id), IDLE_MS); return w; }
  const out = join(vdir(), "out"); mkdirSync(out, { recursive: true });
  const ch = spawn(piperBin(), ["--model", modelPath(v), "--output_dir", out], { cwd: vdir(), stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
  w = { ch, wait: [], buf: "", dead: false, idle: setTimeout(() => stopEngine(v.id), IDLE_MS) };
  ch.stdout.on("data", (d) => {
    w.buf += d; let i;
    while ((i = w.buf.indexOf("\n")) >= 0) { const line = w.buf.slice(0, i).trim(); w.buf = w.buf.slice(i + 1); if (line) { const p = w.wait.shift(); if (p) p.ok(line); } }
  });
  const fail = (e) => { w.dead = true; clearTimeout(w.idle); for (const p of w.wait.splice(0)) p.bad(e); WARM.delete(v.id); };
  ch.on("error", fail); ch.on("exit", () => fail(new Error("the speech engine stopped")));
  WARM.set(v.id, w);
  return w;
}
function stopEngine(id) { const w = WARM.get(id); if (!w) return; WARM.delete(id); w.dead = true; clearTimeout(w.idle); try { w.ch.stdin.end(); w.ch.kill(); } catch {} }
function stopVoices() { for (const id of [...WARM.keys()]) stopEngine(id); }

// Speak one piece of text (a sentence or two): the WAV's bytes.
async function speak(text, lang = "") {
  const v = voiceFor(lang);
  if (!v || voiceState(lang).state !== "ready") throw new Error("Symbiot's voice isn't ready yet");
  const line = String(text || "").replace(/\s+/g, " ").trim().slice(0, 600);
  if (!line) throw new Error("nothing to say");
  const w = engine(v);
  const file = await new Promise((ok, bad) => { w.wait.push({ ok, bad }); w.ch.stdin.write(line + "\n"); });
  try { return readFileSync(file); } finally { rmSync(file, { force: true }); }
}

export { voiceFor, assetFor, voiceState, prepareVoice, speak, stopVoices, VOICES, PIPER_REL };
