// symbiot — the user's phone over adb: asked before an app is opened on it, one run on it at a time.
// On 21 Oct 2026 several runs on the same phone check kept opening Symbiot on the user's phone through
// adb (am start, monkey) while they were using it ("it keeps force opening symbiot when i am using my
// phone"), until they uninstalled the app. So the membrane (guard.mjs) now:
// - holds an adb command that opens an app or acts on what's on the screen (am start, monkey, input,
//   cmd activity start-activity): the run asks the user with {#phone-go-<id>} and one option, and stops.
//   Their Go (agents.mjs answerQuestions, goAhead) lets that one command through once, so a launch is
//   never repeated in a loop without a new yes;
// - lets one run use the phone at a time (phone-lock.json): another run's adb command is refused while
//   the phone was used by a run in the last LOCK_MS, and a run that ends lets it go (the hook's Stop).
// adb's own housekeeping (devices, connect, pair, mdns, version) reaches no phone and is never held.
import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";

const dir = (home) => join(home, ".config", "symbiot");
const HOLDS = (home = homedir()) => join(dir(home), "phone-holds.json"), LOCK = (home = homedir()) => join(dir(home), "phone-lock.json");
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
const writeJson = (f, v) => { try { mkdirSync(join(f, ".."), { recursive: true, mode: 0o700 }); const t = `${f}.${process.pid}.tmp`; writeFileSync(t, JSON.stringify(v), { mode: 0o600 }); renameSync(t, f); } catch {} };
const LOCK_MS = 10 * 60000, HOLD_MS = 86400000;
const WRAP = /^(timeout|nice|nohup|env|time|command|exec)$/, GLOBAL_VALUE = /^-[stHPL]$/, HOUSEKEEPING = /^(devices|connect|disconnect|pair|mdns|version|help|start-server|kill-server|reconnect|keygen|get-serialno|get-state|wait-for-\S+)$/;
// what on a phone's shell opens an app or acts on its screen
const FRONTS = /\b(?:am\s+(?:start\b|start-activity\b)|cmd\s+activity\s+start-activity\b|monkey\b|input\s+(?:tap|swipe|text|keyevent|press|roll|draganddrop|motionevent|keycombination)\b)/;

// The adb commands in a shell command line, each as { sub, rest }: what it asks of adb, and what follows.
// A run of Symbiot's phone check (scripts/phone-codes-check.mjs) counts as one too: it uses the phone.
function adbCalls(cmd) {
  const out = [];
  for (const part of String(cmd || "").split(/&&|\|\||;|\n|\|/)) {
    const w = part.trim().split(/\s+/).map((x) => x.replace(/^['"(]+|['")]+$/g, "")); let i = 0;
    while (i < w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[i])) i++;
    while (i < w.length && WRAP.test(w[i])) { i++; while (i < w.length && (w[i].startsWith("-") || /^\d+[smhd]?$/.test(w[i]))) i++; }
    const prog = (w[i] || "").split("/").pop();
    if (/^node(js)?$/.test(prog) && w.slice(i + 1).some((x) => /phone-codes-check(\.[\w-]+)?\.m?js$/.test(x))) { out.push({ sub: "check", rest: "" }); continue; }
    if (prog !== "adb") continue;
    let j = i + 1; while (j < w.length && w[j].startsWith("-")) j += GLOBAL_VALUE.test(w[j]) ? 2 : 1;
    out.push({ sub: w[j] || "", rest: w.slice(j + 1).join(" ") });
  }
  // `adb shell "am start …"` split above at a pipe or ; inside its quotes: what's on the line still counts
  if (out.some((x) => x.sub === "shell") && FRONTS.test(cmd) && !out.some((x) => FRONTS.test(x.rest))) out.find((x) => x.sub === "shell").rest += " " + String(cmd);
  return out;
}
const fronts = (calls) => calls.some((x) => x.sub === "shell" && FRONTS.test(x.rest));
const onPhone = (calls) => calls.some((x) => x.sub && !HOUSEKEEPING.test(x.sub));

// judge(cmd, { session, cwd, home, now }) → null (go ahead) or { why, held? }.
function judgePhone(cmd, { session = "", cwd = "", home = homedir(), now = Date.now() } = {}) {
  const calls = adbCalls(cmd); if (!onPhone(calls)) return null;
  const lock = readJson(LOCK(home), {}), mine = String(session || cwd || "");
  if (lock.who && lock.who !== mine && now - (lock.at || 0) < LOCK_MS) {
    const mins = Math.max(1, Math.round((now - lock.at) / 60000));
    return { why: `another run${lock.cwd ? ` (in ${lock.cwd})` : ""} used the user's phone ${mins} min ago, and only one run touches the phone at a time: two at once put up more than one card and kept bringing apps to the front while the user was on it. Don't use adb now: hand your step to that run (name it in .symbiot/HANDOFF.md), or mark the item [~] waiting on it and carry on with the rest` };
  }
  writeJson(LOCK(home), { who: mine, cwd: String(cwd || ""), at: now });
  if (!fronts(calls)) return null;
  const holds = readJson(HOLDS(home), []).filter((h) => now - (h.at || 0) < HOLD_MS), what = String(cmd).trim().slice(0, 300);
  const go = holds.find((h) => h.who === mine && h.go && !h.used && h.cmd === what);
  if (go) { go.used = now; writeJson(HOLDS(home), holds); return null; } // the user's Go: this once
  let h = holds.find((x) => x.who === mine && x.cmd === what && !x.go);
  if (!h) { h = { id: randomBytes(4).toString("hex"), who: mine, cwd: String(cwd || ""), cmd: what, at: now }; holds.push(h); }
  writeJson(HOLDS(home), holds.slice(-100));
  return { held: h.id, why: `that opens an app, or acts on whatever is on the screen, on the user's phone, which they may be using right now: it's never done without their yes, and never again in a loop. Ask in .symbiot/QUESTIONS.md: a ### heading saying plainly what it does on their phone and why (e.g. "Can I open Symbiot on your phone now, to put the check's card up?"), ending {#phone-go-${h.id}}, a line saying they should be at the phone and not in the middle of something, and one option, "🤖 Agent: go ahead, I'm at the phone". Stop there. Their Go lets this same command through once; run it again exactly as it is. Reading the phone (dumpsys, getprop, settings get, logcat) needs no yes` };
}
// The user's Go on a phone-go card: that held command may go through once.
function goAhead(id, { home = homedir(), now = Date.now() } = {}) {
  const holds = readJson(HOLDS(home), []), h = holds.find((x) => x.id === String(id || "")); if (!h || h.used) return false;
  h.go = now; writeJson(HOLDS(home), holds); return true;
}
// A run writing the card for a launch held here ({#phone-go-<id>} in its QUESTIONS.md): the question is the
// user's (only they know they're at the phone), so its verdict goes into the folder's triage.json as it's
// written (triage.mjs), and the card shows at once rather than waiting out the hold for an AI's verdict.
function phoneAsked(folder, text, { home = homedir(), now = Date.now() } = {}) {
  const holds = readJson(HOLDS(home), []), out = [];
  for (const m of String(text || "").matchAll(/^###\s+(.+?)\s*\{#phone-go-([0-9a-f]+)\}\s*$/gm)) if (holds.some((h) => h.id === m[2] && !h.used)) out.push(m[1]);
  if (!out.length || !folder) return 0;
  const f = join(folder, ".symbiot", "triage.json"), all = readJson(f, {});
  for (const q of out) all[q.trim().toLowerCase().replace(/\s+/g, " ")] = { verdict: "user", why: "the user's yes to opening an app on their phone, which only they can give: they're at it, and not in the middle of something", at: now };
  writeJson(f, all); return out.length;
}
// A run that ends lets the phone go (the hook's Stop), so the next run doesn't wait out LOCK_MS.
function letGo(session, { home = homedir() } = {}) {
  const lock = readJson(LOCK(home), {}); if (!lock.who || lock.who !== String(session || "")) return false;
  writeJson(LOCK(home), {}); return true;
}

export { judgePhone, goAhead, letGo, phoneAsked, adbCalls, HOLDS, LOCK, LOCK_MS };
