// Symbiot's own voice (voice.mjs): which voice for where you are, which engine for
// which computer, and the whole first-time path against a local stand-in for GitHub
// and Hugging Face: download, unpack, speak sentences in order, a failed download.
// The stand-in engine is a shell script that answers like Piper (a .wav per line).
//
//   node test/voice.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-voice-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { for (let t = 0; t < ms; t += 50) { if (f()) return true; await sleep(50); } return false; };

const { voiceFor, assetFor, voiceState, prepareVoice, speak, stopVoices, VOICES } = await import("../voice.mjs");
let server;
try {
  console.log("WHICH VOICE — from where you are, nothing to pick");
  ok("South Africa: British English", voiceFor("en-ZA") === VOICES.gb, voiceFor("en-ZA"));
  ok("the UK, Australia, Ireland: British English", ["en-GB", "en-AU", "en_IE"].every((l) => voiceFor(l) === VOICES.gb));
  ok("the US and Canada: American English", voiceFor("en-US") === VOICES.us && voiceFor("en-CA") === VOICES.us);
  ok("plain English: British", voiceFor("en") === VOICES.gb);
  ok("another language: none of ours (the system's voice speaks it)", voiceFor("fr-FR") === null && voiceFor("af-ZA") === null && voiceState("de-DE").state === "none");
  ok("both voices are public domain ones", VOICES.gb.id === "en_GB-cori-medium" && VOICES.us.id === "en_US-ljspeech-medium");

  console.log("WHICH ENGINE — per computer");
  ok("Linux PC", assetFor("linux", "x64") === "piper_linux_x86_64.tar.gz");
  ok("Raspberry Pi / ARM Linux", assetFor("linux", "arm64") === "piper_linux_aarch64.tar.gz");
  ok("Mac, Intel and Apple", assetFor("darwin", "x64") === "piper_macos_x64.tar.gz" && assetFor("darwin", "arm64") === "piper_macos_aarch64.tar.gz");
  ok("Windows", assetFor("win32", "x64") === "piper_windows_amd64.zip");
  ok("anything else: none, so the system's voice", assetFor("freebsd", "x64") === null);

  if (process.platform === "win32" || !assetFor()) { console.log("  (the download path runs on Linux and Macs)"); }
  else {
    console.log("THE FIRST TIME — downloaded, unpacked, then it speaks");
    const SRC = join(HOME, "src"), PK = join(SRC, "pk", "piper"); mkdirSync(PK, { recursive: true });
    writeFileSync(join(PK, "piper"), `#!/bin/sh
D=""; while [ $# -gt 0 ]; do [ "$1" = "--output_dir" ] && D="$2"; shift; done
n=0; while IFS= read -r line; do n=$((n+1)); f="$D/$n-$$.wav"; printf 'RIFF%s' "$line" > "$f"; echo "$f"; done
`); chmodSync(join(PK, "piper"), 0o755);
    mkdirSync(join(SRC, "gh"), { recursive: true });
    spawnSync("tar", ["-czf", join(SRC, "gh", assetFor()), "-C", join(SRC, "pk"), "piper"]);
    const files = { [`/gh/${assetFor()}`]: readFileSync(join(SRC, "gh", assetFor())), [`/hf/${VOICES.gb.path}/${VOICES.gb.id}.onnx`]: Buffer.alloc(4096, 1), [`/hf/${VOICES.gb.path}/${VOICES.gb.id}.onnx.json`]: Buffer.from("{}") };
    let hits = 0;
    server = createServer((req, res) => { hits++; const b = files[req.url]; if (!b) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-length": b.length }); res.end(b); });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${server.address().port}`;
    process.env.SYMBIOT_PIPER_URL = base + "/gh"; process.env.SYMBIOT_VOICES_URL = base + "/hf";

    ok("before: missing (not downloaded yet)", voiceState("en-ZA").state === "missing", voiceState("en-ZA"));
    ok("speaking before it's ready says so", await speak("Hi.", "en-ZA").then(() => false, (e) => /isn't ready/.test(e.message)));
    const st = prepareVoice("en-ZA");
    ok("prepare: downloading", st.state === "downloading" && st.voice === "British English", st);
    ok("…then ready: the engine unpacked and the voice in place", await until(() => voiceState("en-ZA").state === "ready"), voiceState("en-ZA"));
    ok("it went to ~/.config/symbiot/voice", existsSync(join(HOME, ".config", "symbiot", "voice", "piper", "piper")) && existsSync(join(HOME, ".config", "symbiot", "voice", "voices", VOICES.gb.id + ".onnx")));
    ok("…and the downloaded archive is gone", !existsSync(join(HOME, ".config", "symbiot", "voice", assetFor())));
    const before = hits; prepareVoice("en-ZA");
    ok("prepare again: nothing fetched twice", hits === before, hits - before);

    const said = await Promise.all(["Hi Garth.", "Three things need you today.", "First, the mail."].map((t) => speak(t, "en-ZA")));
    ok("three sentences at once: each its own audio, in order", said.map(String).join("|") === "RIFFHi Garth.|RIFFThree things need you today.|RIFFFirst, the mail.", said.map(String));
    ok("one engine kept warm, not one per sentence", /RIFF/.test(String(await speak("Again.", "en-ZA"))));
    ok("its audio files don't pile up", await until(() => !require_dir_has_wav(join(HOME, ".config", "symbiot", "voice", "out"))));
    ok("a line break in the text can't split it in two", String(await speak("one\ntwo", "en-ZA")) === "RIFFone two");
    stopVoices();
    ok("after stopping, it starts again when needed", String(await speak("Back.", "en-ZA")) === "RIFFBack.");
    stopVoices();

    console.log("WHEN THE DOWNLOAD FAILS — it says so; the system voice carries on");
    ok("the US voice isn't on the stand-in: failed, with the reason", prepareVoice("en-US").state === "downloading" && await until(() => voiceState("en-US").state === "failed") && /couldn't download/.test(voiceState("en-US").error || ""), voiceState("en-US"));
  }
} finally {
  stopVoices();
  if (server) server.close();
  await sleep(100);
  rmSync(HOME, { recursive: true, force: true });
}
function require_dir_has_wav(dir) { try { return spawnSync("ls", [dir], { encoding: "utf8" }).stdout.includes(".wav"); } catch { return false; } }
console.log(`\n${fail ? "✗" : "✓"} voice: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
