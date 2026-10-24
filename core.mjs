// Shared basics for every module: Symbiot's version (and npm's newest), its
// config and task files, the helpers that run programs (never throw, never hang) and
// a repo's working-tree state.
import { execSync, execFileSync, spawn as spawnProc } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { readFileSync, mkdirSync, chmodSync, existsSync, openSync, writeSync, fsyncSync, closeSync, renameSync, unlinkSync, linkSync, copyFileSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

// ---- version ----------------------------------------------------------------
const HERE = fileURLToPath(new URL(".", import.meta.url));
let VERSION = "0"; try { VERSION = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).version; } catch {}
let LATEST_VERSION = ""; // newest symbiot on npm, checked in the background
// a.b.c numeric compare: only a HIGHER npm version is an update (a local build
// ahead of npm must not be offered a "newer" older one)
function semverGt(a, b) { const p = (v) => String(v || "").replace(/^v/, "").split(/[.-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; }
// SYMBIOT_REGISTRY points the check at another registry (the tests use a fake one)
const REGISTRY = (process.env.SYMBIOT_REGISTRY || "https://registry.npmjs.org").replace(/\/+$/, "");
async function checkLatest() { try { const r = await fetch(REGISTRY + "/symbiot"); if (!r.ok) return; const j = await r.json(); LATEST_VERSION = (j["dist-tags"] && j["dist-tags"].latest) || ""; } catch {} }

// ---- state files: written whole or not at all ------------------------------
// A state file (tasks, settings, memory, what's watched) is written to a temp file
// beside it, flushed to disk, then renamed over it: a rename is atomic, so a crash
// or a kill mid-save leaves the old file, never half of the new one. The copy it
// replaces stays as <file>.bak. Before, a plain write cut short read back as
// nothing, and the next save wrote that nothing over it: a half-written tasks.json
// loaded as [] and one new task replaced 600. The app did run out of memory
// mid-write (2026-10-12).
// Yours only (0600) unless told otherwise: a state file holds task texts, chats and
// names, and tasks.json, asks-done.json and costs.json were 0644 (15 Oct 2026).
// The folder itself is 0700 (privateDir), once per process.
let DIR_DONE = false;
function privateDir(dir) {
  try { mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch {}
  try { if (statSync(dir).mode & 0o077) chmodSync(dir, 0o700); } catch {}
}
function writeAtomic(file, text, { mode = 0o600 } = {}) {
  const dir = dirname(file);
  if (!DIR_DONE && dir === CONFIG_DIR) { DIR_DONE = true; privateDir(dir); } else mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`;
  let fd = null;
  try {
    fd = openSync(tmp, "w", mode);
    writeSync(fd, text); fsyncSync(fd); closeSync(fd); fd = null;
    try { chmodSync(tmp, mode); } catch {} // the mode covers a tmp file the umask narrowed
    if (existsSync(file)) { try { unlinkSync(file + ".bak"); } catch {} try { linkSync(file, file + ".bak"); } catch { try { copyFileSync(file, file + ".bak"); } catch {} } }
    renameSync(tmp, file);
  } catch (e) { if (fd != null) try { closeSync(fd); } catch {} try { unlinkSync(tmp); } catch {} throw e; }
}
const writeJsonAtomic = (file, v, o = {}) => writeAtomic(file, JSON.stringify(v, null, o.indent ?? 2) + (o.newline === false ? "" : "\n"), o);
// What a state file holds, parsed, or undefined when there's none yet. One that
// doesn't parse (cut short by a crash, or by an older Symbiot's plain write) is never
// read as empty: it's moved aside to <file>.corrupt-<time>, where no save can reach
// it, and the .bak from the save before it is put back and read instead.
// isValid: the shape it must have (Array.isArray for tasks.json). One that parses as
// the wrong thing (null, [] for config.json) was read as fine, and loadTasks gave null
// to callers that .filter it (15 Oct 2026); now it's set aside like a torn one.
function readState(file, isValid = null) {
  let text; try { text = readFileSync(file, "utf8"); } catch { return undefined; } // none yet
  const parse = (s) => { let v; try { v = JSON.parse(s); } catch { return undefined; } return !isValid || isValid(v) ? v : undefined; };
  const v = parse(text); if (v !== undefined) return v;
  // a name of its own: two set aside in the same millisecond, the second one took the first's place (CI, 2026-10-19)
  let aside = `${file}.corrupt-${Date.now()}`; for (let n = 2; existsSync(aside); n++) aside = `${file}.corrupt-${Date.now()}-${n}`;
  try { renameSync(file, aside); } catch {}
  let back; try { back = parse(readFileSync(file + ".bak", "utf8")); } catch {}
  if (back !== undefined) try { copyFileSync(file + ".bak", file); } catch {}
  try { process.stderr.write(`symbiot: ${file} didn't read; kept it as ${aside}${back !== undefined ? " and read the copy from the save before" : ""}\n`); } catch {}
  return back;
}

// ---- config ---------------------------------------------------------------
const CONFIG_DIR = join(homedir(), ".config", "symbiot");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
// Symbiot's own keys (your AI's API key, the app's token) live apart from its
// settings, in secrets.json: a run outside the sandbox could `cat` config.json, and
// with the token call Symbiot's own API and change the agent command, which the
// membrane never sees. The membrane (guard.mjs) and a run's sandbox (agents.mjs
// SANDBOX_SECRETS) refuse secrets.json. loadConfig joins the two and saveConfig
// splits them, so nothing else changes; a config.json from before still reads, and
// its keys move out on the next save (the app saves once as it starts: moveSecrets).
// The phone link's keys too (phone.mjs): this computer's private key, and on a phone
// its token and the key it shares with the computer.
const SECRETS_PATH = join(CONFIG_DIR, "secrets.json"), SECRET_KEYS = ["apiKey", "appToken", "phoneSecret", "computerSecret"];
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function splitSecrets(cfg) {
  const pub = { ...cfg }, sec = {};
  for (const k of SECRET_KEYS) if (k in pub) { sec[k] = pub[k]; delete pub[k]; }
  for (const [k, v] of Object.entries(pub)) if (isObj(v) && "apiKey" in v) { sec[k] = { apiKey: v.apiKey }; pub[k] = { ...v }; delete pub[k].apiKey; } // a provider's: { anthropic: { apiKey, model } }
  return { pub, sec };
}
const readJson = (f) => { const o = readState(f, isObj); return isObj(o) ? o : {}; };
function loadConfig() {
  const cfg = readJson(CONFIG_PATH), sec = readJson(SECRETS_PATH);
  for (const [k, v] of Object.entries(sec)) {
    if (SECRET_KEYS.includes(k)) { if (!(k in cfg)) cfg[k] = v; } // one still in config.json is newer (an older Symbiot wrote it)
    else if (isObj(v) && "apiKey" in v && !(isObj(cfg[k]) && "apiKey" in cfg[k])) cfg[k] = { ...(isObj(cfg[k]) ? cfg[k] : {}), apiKey: v.apiKey };
  }
  return cfg;
}
function saveConfig(cfg) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    const { pub, sec } = splitSecrets(cfg || {});
    writeJsonAtomic(SECRETS_PATH, sec, { mode: 0o600 }); // first: a key is never only in neither
    writeJsonAtomic(CONFIG_PATH, pub, { mode: 0o600 });
    return true;
  } catch { return false; }
}
// Keys still in config.json (from before secrets.json): moved out. True if any were.
function moveSecrets() { const raw = readJson(CONFIG_PATH); return Object.keys(splitSecrets(raw).sec).length ? saveConfig(loadConfig()) : false; }
// ---- one app at a time ------------------------------------------------------
// The app holds ~/.config/symbiot/app-<port>.lock while it runs: { pid, port, at }.
// The file is made whole and linked into place, which fails if one is there, so of
// two apps starting at once only one gets it. Before, the only check was a ping:
// an app too busy to answer in time (pings took up to 7.4 s) wasn't found, and the
// second started on a random port, both running every timer and saving the same
// files (2026-10-08). A lock whose pid is gone (a crash, a kill) is taken over.
// takeAppLock: null once this app holds it, or the live app holding it ({ pid, port }).
// takeOver (Update & restart): the app holding it is handing over and about to exit.
const lockPath = (port) => join(CONFIG_DIR, `app-${port}.lock`);
const lockOf = (file) => { try { const o = JSON.parse(readFileSync(file, "utf8")); return o && Number(o.pid) > 0 ? o : null; } catch { return null; } };
// a live process, and on Linux still a node one (a pid is reused after a reboot)
function alive(pid) {
  try { process.kill(pid, 0); } catch (e) { if (!e || e.code !== "EPERM") return false; }
  try { return /node|symbiot/i.test(readFileSync(`/proc/${pid}/cmdline`, "utf8")); } catch { return true; }
}
let LOCK_HELD = "";
function takeAppLock(port, { takeOver = false } = {}) {
  const file = lockPath(port), tmp = `${file}.${process.pid}.tmp`;
  try { mkdirSync(CONFIG_DIR, { recursive: true }); } catch {}
  for (let i = 0; i < 3; i++) {
    try {
      const fd = openSync(tmp, "w", 0o600); writeSync(fd, JSON.stringify({ pid: process.pid, port, at: Date.now() })); closeSync(fd);
      try { linkSync(tmp, file); LOCK_HELD = file; return null; }
      catch (e) { if (e.code !== "EEXIST") { renameSync(tmp, file); LOCK_HELD = file; return null; } } // no hard links here: as good as it gets
      finally { try { unlinkSync(tmp); } catch {} }
    } catch { return null; } // can't write here at all: start as before
    const h = lockOf(file);
    if (h && h.pid !== process.pid && !takeOver && alive(h.pid)) return h;
    if (!h) try { if (Date.now() - statSync(file).mtimeMs < 5000) continue; } catch {} // one being made right now: look again
    try { unlinkSync(file); } catch {}
  }
  return null;
}
// Let go of it, only while it's still this app's (an app relaunched by an update took it over).
function releaseAppLock() { if (!LOCK_HELD) return; const h = lockOf(LOCK_HELD); if (h && h.pid === process.pid) try { unlinkSync(LOCK_HELD); } catch {} LOCK_HELD = ""; }

// ---- tasks: a persistent checklist (~/.config/symbiot/tasks.json) ---------
const TASKS_PATH = join(CONFIG_DIR, "tasks.json");
// tasks.json is parsed once per version of the file, not once per caller: 41 calls a
// tick parsed 550 KB each (4 ms a call, 15 Oct 2026). The copy kept is never handed
// out: callers change what they get and save it, so each gets a copy of its own
// (0.3 ms: the strings are shared, only the objects are new).
const copyOf = (v) => { if (Array.isArray(v)) { const o = new Array(v.length); for (let i = 0; i < v.length; i++) o[i] = copyOf(v[i]); return o; } if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = copyOf(v[k]); return o; } return v; };
let TASKS_MEMO = null; // { key, tasks }
const tasksKey = () => { try { const s = statSync(TASKS_PATH); return `${s.ino}:${s.size}:${s.mtimeMs}`; } catch { return ""; } };
function loadTasks() {
  const key = tasksKey(); if (!key) { TASKS_MEMO = null; return []; }
  if (!TASKS_MEMO || TASKS_MEMO.key !== key) { const t = readState(TASKS_PATH, Array.isArray); TASKS_MEMO = { key: tasksKey(), tasks: t === undefined ? [] : t }; } // the key again: a restore from .bak is a new file
  return copyOf(TASKS_MEMO.tasks);
}
function saveTasks(t) { try { writeJsonAtomic(TASKS_PATH, t, { newline: false }); TASKS_MEMO = { key: tasksKey(), tasks: copyOf(t) }; return true; } catch { return false; } }
// How much a task holds: one line in TASKS.md, long enough for a handover or a
// pasted list of steps (1000 cut the Remy email task off mid-sentence). Longer,
// it keeps its whole text (full) and its line links to that (tasks.mjs addTask).
const TASK_MAX = 4000;
// A heading or a one-line summary: cut at a word and marked "…", never mid-word.
const clipWords = (s, max) => { s = String(s || ""); return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : s; };
// A job in plain words: without "Agent:" or a handover's routing words ("New job:"), which put
// "New job: …" on cards when nothing had been launched (the LoveLink card, 22 Oct 2026).
const jobWords = (s) => String(s || "").replace(/^\s*Agent:\s*/i, "").replace(/\bNew job\b[^:.]{0,40}:\s*/gi, "").trim();
// Two wordings of one task: the same words once case, spacing and punctuation
// are set aside (a colon for a bracket, `code` for code), or one is the other
// with a clause more on the end. An extension only counts when the shorter one
// is a whole sentence (8+ words), so "Fix the bug" never swallows "Fix the bug
// in the login form".
// Or nearly the same (nearTask): an agent that suggests a task again rewords
// it, and TASKS.md listed both.
// kept per text, like wordsOf's words: sameTask runs for every idea against every task
// A text kept is copied first: one cut from an agent's log ("Round done: …", a
// question) is a view into the whole log in V8, and a 60-character key kept every
// version of a 6 MB log alive. The app grew to its 2 GB limit and crashed, 90 minutes
// in (2026-10-12). Copied, a key holds only itself, and so does what's worked out from it.
const own = (s) => (s.length < 13 ? s : JSON.parse(JSON.stringify(s))); // an exact copy, odd characters too
const keep = (f, max = 4000) => { const m = new Map(); return (s) => { s = String(s || ""); let v = m.get(s); if (v === undefined) { if (m.size >= max) m.clear(); s = own(s); v = f(s); m.set(s, v); } return v; }; };
const taskWords = keep((s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim());
function sameTask(a, b) {
  const x = taskWords(a), y = taskWords(b); if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  return (s.split(" ").length >= 8 && l.startsWith(s + " ")) || nearTask(a, b) || sameAsk(a, b) || spelledOut(a, b);
}
// A finding, not a job: what a report found, said as a fact. Three ticked from an audit's
// "Four things that change the plan" ("Google is already fully on bookly.co.za",
// "API_EXTERNAL_URL is https://bookly.devhost.dev, not supabase.finderai.dev", "The 14
// WhatsApp templates are already approved, not pending") sat on the Workdesk as tasks
// with nothing to do (the user, 2026-10-15). Its first sentence settles it: one that says
// what to do (it starts with a verb, or says should, needs to, for bookly to check) or
// asks is a job; one that says something is so already, or is this and not that, a finding.
const JOB_VERB = /^(?:when|if|once|only|never|always|don['’]?t|do not|avoid|pick|choose|allow|prefer|limit|cap|raise|lower|mark|tick|close|open|clear|save|store|read|watch|notify|warn|say|offer|add|fix|check|ask|make|move|set|update|remove|delete|drop|send|run|write|test|verify|confirm|reconnect|sign|deploy|rename|hand|create|build|ship|approve|change|replace|switch|migrate|investigate|look|find|review|decide|get|put|call|email|reply|follow|schedule|book|pay|renew|rotate|reword|bump|merge|split|turn|enable|disable|stop|start|restart|keep|use|let|try|clean|document|draft|post|publish|install|upgrade|connect|link|map|wire|show|hide|give|tell|retry|re-?[a-z]+)\b/i;
const JOB_SAYS = /\b(?:should|must|needs? to|needed to|has to|have to|ought to|todo|to do|next step|worth|consider|recommend\w*|for (?:the )?[\w-]+(?: lane)? to)\b|👤|🤖|\?\s*$/iu;
const FACT_SAYS = /\balready\b|\b(?:is|are|was|were)\b[^;]*?,\s*not\b|\b(?:nothing|no change|no action) (?:to do|needed|is needed)\b/i;
// A progress record is one too: a report's "Still to do" keeps the log of a job as it
// went ("Meta part, by the bookly lane itself: done (16 Oct, about 15:00).", "…(update,
// 14:50): the work is out, in 0.66.5…", "Earlier note, kept for the record: …"), and two
// such lines sat on the Workdesk as jobs (2026-10-19). A label, then done (fixed,
// shipped…) or an "(update…)" on it, says how it went; it's still a job when any of its
// sentences gives an order ("Step 1: done. Add the rest.") or says what's needed (JOB_SAYS).
const STATUS_SAYS = /^[^:.!?]{1,100}?:\s*(?:done|fixed|finished|shipped|released|resolved|closed|merged|completed?)(?=\s*(?:[.,;(—–]|-\s|(?:by|in|on|at|and|for)\b|$))|^[^:.!?]{1,100}?\((?:update|later|earlier)\b[^)]*\):|^(?:earlier|older|old) note\b[^:]*:|\bkept for the record\b/i;
function isFinding(text) {
  const s = String(text || "").replace(/\s*\(from the report ".*$/s, "").replace(/[`*_]/g, "").trim();
  const first = (s.match(/^.*?[.!?](?=\s|$)/s) || [s])[0];
  if (!first || JOB_SAYS.test(s)) return false;
  if (STATUS_SAYS.test(first)) return !s.split(/(?<=[.!?])\s+/).slice(1).some((x) => JOB_VERB.test(x));
  if (JOB_VERB.test(first)) return false;
  return FACT_SAYS.test(first);
}
// Nearly the same task, two ways:
// - nearly all the same words in the same order, 12+ words each ("…nothing
//   recorded since 2026-08-03" and "…since 2026-08-04")
// - the same first sentence of 5+ words, with only what follows it different:
//   "Set `WA_WABA_ID` in `.env`. It's needed to list templates" / "…to create Flows"
// Never when each names something the other doesn't: "Watch Gmail…" and
// "Watch WhatsApp…" are two tasks, however alike the rest. A name is a word
// with a capital that doesn't just start a sentence (Gmail, WhatsApp, WA).
const NEAR = 0.85, NEAR_WORDS = 12, LEAD_WORDS = 5;
// A word starts a sentence when only spacing and punctuation since the last word
// end a sentence: only that gap is read, not all the text before it, which made a
// 4000-character task cost millions of steps. Every 20s each project's ideas are
// checked against every task (agentQuestions), so the words of a text are kept
// (keep): 40 ideas against 393 tasks took 10s a tick, and the app stopped
// answering, its update never restarting it (2026-10-12).
const wordsOf = keep((s) => {
  let end = 0;
  return [...s.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => {
    const w = m[0], first = end === 0, gap = s.slice(end, m.index); end = m.index + w.length;
    const starts = (first && !gap.trim()) || /[.!?]["'`)\]]*\s*$/.test(gap);
    return { w: w.toLowerCase(), name: w.length > 1 && /\p{Lu}/u.test(w) && (!starts || /\p{Lu}/u.test(w.slice(1))) };
  });
});
// The first sentence's words, when more follows it ("" when it's all one sentence).
function leadOf(s) { const m = String(s || "").match(/^(.*?[.!?])["'`)\]]*\s+\S/s); return m ? taskWords(m[1]) : ""; }
function nearTask(a, b) {
  const x = wordsOf(a), y = wordsOf(b), m = x.length, n = y.length; if (!m || !n) return false;
  const lead = leadOf(a), sameLead = !!lead && lead === leadOf(b) && lead.split(" ").length >= LEAD_WORDS;
  if (!sameLead && (Math.min(m, n) < NEAR_WORDS || Math.min(m, n) / Math.max(m, n) < NEAR)) return false;
  // the longest run of words both have in order, and the words left over on each side
  const L = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = x[i].w === y[j].w ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  if (!sameLead && (2 * L[0][0]) / (m + n) < NEAR) return false;
  let i = 0, j = 0, nx = false, ny = false;
  while (i < m && j < n) {
    if (x[i].w === y[j].w) { i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) { if (x[i++].name) nx = true; } else if (y[j++].name) ny = true;
  }
  for (; i < m; i++) if (x[i].name) nx = true;
  for (; j < n; j++) if (y[j].name) ny = true;
  return !(nx && ny);
}
// The same ask in other words: "Send Remy the two asks yourself: verify
// `X-Wa-Signature-256`…" and "Ask Remy to verify `X-Wa-Signature-256`… Also ask
// him…". Both name exactly the same things (Remy, X-Wa-Signature-256), and most
// of the shorter one's own words (not "the", "his", "once"; "asks" is "ask") are
// in the other. Checked against 263 real tasks (11,770 pairs): at 0.6 it found 7
// rewordings and nothing else; at 0.45 it took "Whole page for Gmail too" for
// "Map the whole page … (not for Gmail)".
const ASK = 0.6, ASK_WORDS = 8;
const STOP = new Set(("the and but for from with are was were been its this that these those then than once each his her him she they them their you your yourself can cant not does did have has had will would should could just also there here into onto out about before after when what which who whom how why all any some more most other only own same too very again").split(" "));
const askWords = keep((s) => new Set(wordsOf(s).map((x) => x.w).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ""))));
function sameAsk(a, b) {
  const x = askWords(a), y = askWords(b); if (Math.min(x.size, y.size) < ASK_WORDS) return false;
  const nx = new Set(wordsOf(a).filter((w) => w.name).map((w) => w.w)), ny = new Set(wordsOf(b).filter((w) => w.name).map((w) => w.w));
  if (!nx.size || nx.size !== ny.size || [...nx].some((w) => !ny.has(w))) return false;
  let both = 0; for (const w of x) if (y.has(w)) both++;
  return both / Math.min(x.size, y.size) >= ASK;
}
// A task spelled out in steps is the task it spells out: "A mail connector linked
// in Symbiot still doesn't reach agent runs (Drive does now). Pass its tools
// through…" and "In the symbiot repo: a mail connector linked in Symbiot still
// doesn't reach agent runs, but the Drive connector now does. 1) Find where… 2)…".
// The steps name much more (CONTRIBUTING.md, agentCmd), so the whole of it is
// never the same ask; its first sentence, without "In the … repo:", is (sameAsk),
// set against the other task or that one's first sentence. Stricter than sameAsk
// on its own, as a first sentence is short: not when each has a word the other
// hasn't ("a mail connector…" isn't "a calendar connector…").
const STEPS = /(?:^|\s)1[.)]\s[\s\S]*\s2[.)]\s/;
const firstSentence = (s) => { const m = String(s || "").match(/^(.*?[.!?])["'`)\]]*(?:\s|$)/s); return m ? m[1] : String(s || ""); };
function bothAdd(a, b) { const x = askWords(a), y = askWords(b); return [...x].some((w) => !y.has(w)) && [...y].some((w) => !x.has(w)); }
function spelledOut(a, b) {
  const [s, l] = String(a || "").length < String(b || "").length ? [String(a || ""), String(b || "")] : [String(b || ""), String(a || "")];
  if (!STEPS.test(l) || STEPS.test(s)) return false;
  const head = firstSentence(l.split(/(?:^|\s)1[.)]\s/)[0].trim()).replace(/^in (?:the )?\S+ (?:repo|project|folder)\s*[:,]\s*/i, "");
  return [s, firstSentence(s)].some((t) => sameAsk(head, t) && !bothAdd(head, t));
}
// One of each: near-duplicates collapse into the wording that says the most.
function uniqueTasks(texts) {
  const out = [];
  for (const t of texts) { const i = out.findIndex((u) => sameTask(u, t)); if (i < 0) out.push(t); else if (taskWords(t).length > taskWords(out[i]).length) out[i] = t; }
  return out;
}

// ---- shell + git ----------------------------------------------------------
// sh is for fixed command lines only. Anything with a path, branch, email or other
// outside text in it goes through runOut/gitOut: they hand the program its arguments
// as they are, with no shell between, so a folder (or a commit's author email) named
// `a$(touch ~/x)` is only a name. Quoted with JSON.stringify for sh, it ran.
function sh(cmd) {
  try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024, timeout: 6000, killSignal: "SIGKILL" }); }
  catch { return ""; } // timeout or error -> empty, never hang the scan
}
const RUN_OPTS = { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 6000, killSignal: "SIGKILL", windowsHide: true };
// A program's output, or "" when it fails, exits non-zero or takes over 6 s (like sh).
function runOut(file, args = [], { cwd, timeout = 6000 } = {}) {
  try { return execFileSync(file, args, { ...RUN_OPTS, cwd, timeout, stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return ""; }
}
// Whether it exited 0 (what `cmd && echo Y` was for).
function runOk(file, args = [], { cwd, timeout = 6000 } = {}) {
  try { execFileSync(file, args, { ...RUN_OPTS, cwd, timeout, stdio: "ignore" }); return true; }
  catch { return false; }
}
// git in a folder: gitOut(path, ["log", "-1"]).
const gitOut = (path, args, opts) => runOut("git", ["-C", String(path), ...args], opts);
const gitOk = (path, args, opts) => runOk("git", ["-C", String(path), ...args], opts);
// "Is this command available?": command -v on posix, where on win.
// (the name goes in as an argument, never into the command line; the shell by its own
// path, as execSync finds it, so a PATH without /bin still answers)
const POSIX_SH = process.platform === "android" ? "/system/bin/sh" : "/bin/sh";
function hasCmd(cmd) { return !!(process.platform === "win32" ? runOut("where", [String(cmd)]) : runOut(POSIX_SH, ["-c", 'command -v -- "$1"', "sh", String(cmd)])).trim(); }
// Open a terminal window on this computer, in a folder: the card's "Open terminal", for a step only the
// user can take that is a command to run. One of the terminals the OS has, the first found; { ok, via } or
// { error }. The pieces are passed in so a test can answer for another OS (24 Oct 2026: the user was told
// to run a deploy and had to find a terminal and work out what to paste himself).
function openTerminal(cwd = homedir(), { platform = process.platform, has = hasCmd, spawnIt = spawnProc } = {}) {
  const dir = cwd && existsSync(cwd) ? cwd : homedir();
  let via = "", cmd = "", args = [];
  if (platform === "darwin") { via = "Terminal"; cmd = "open"; args = ["-a", "Terminal", dir]; }
  else if (platform === "win32") { const wt = has("wt"); via = wt ? "Windows Terminal" : "Command Prompt"; cmd = wt ? "wt" : "cmd"; args = wt ? ["-d", dir] : ["/c", "start", "cmd", "/K", `cd /d "${dir}"`]; }
  else {
    const T = [["x-terminal-emulator", []], ["gnome-terminal", ["--working-directory=" + dir]], ["konsole", ["--workdir", dir]], ["xfce4-terminal", ["--working-directory=" + dir]], ["kitty", ["-d", dir]], ["alacritty", ["--working-directory", dir]], ["tilix", ["--working-directory=" + dir]], ["xterm", []]];
    const t = T.find(([c]) => has(c)); if (!t) return { error: "No terminal program found on this computer. Open one yourself and paste the commands below." };
    via = t[0]; cmd = t[0]; args = t[1];
  }
  try { const c = spawnIt(cmd, args, { cwd: dir, detached: true, stdio: "ignore" }); if (c && c.on) c.on("error", () => {}); if (c && c.unref) c.unref(); return { ok: true, via }; }
  catch (e) { return { error: "Couldn't open a terminal: " + ((e && e.message) || e) }; }
}
// A Chromium-family browser, per OS: the app's chrome-less --app window, and
// Screens' hidden (headless) browser.
function chromeBinary() {
  const p = process.platform;
  const exists = (f) => { try { return existsSync(f) ? f : null; } catch { return null; } };
  if (p === "darwin") {
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"].map(exists).find(Boolean) || null;
  }
  if (p === "win32") {
    const bases = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
    const rels = ["Google\\Chrome\\Application\\chrome.exe", "Chromium\\Application\\chrome.exe",
      "Microsoft\\Edge\\Application\\msedge.exe", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"];
    for (const base of bases) for (const r of rels) { const f = exists(join(base, r)); if (f) return f; }
    const w = sh("where chrome 2>NUL").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return w || null;
  }
  return ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave-browser", "microsoft-edge"].find(hasCmd) || null;
}
// Working-tree state, incl. detecting a stale/old checkout (not new work).
function repoState(repoPath) {
  const branch = gitOut(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const porcelain = gitOut(repoPath, ["status", "--porcelain"]).split("\n").filter(Boolean);
  let del = 0, mod = 0, add = 0;
  for (const l of porcelain) { const x = l.slice(0, 2); if (/\?\?/.test(x)) add++; else if (x.includes("D")) del++; else if (x.includes("A")) add++; else mod++; }
  const dirty = porcelain.length;
  let stale = false, staleBy = 0;
  if (dirty) {
    for (const k of [3, 5, 10, 20, 40, 80, 160, 320]) {
      if (!gitOut(repoPath, ["rev-parse", `HEAD~${k}`]).trim()) break;
      if (gitOk(repoPath, ["diff", "--quiet", `HEAD~${k}`])) { stale = true; staleBy = k; break; }
    }
    if (!stale && del >= 20 && del > mod && add === 0) stale = true; // mostly deletions = an old snapshot
  }
  const behind = Number(gitOut(repoPath, ["rev-list", "--count", "HEAD..@{u}"]).trim()) || 0;
  return { branch, dirty, del, mod, add, stale, staleBy, behind };
}

export { openTerminal, jobWords, own, writeAtomic, writeJsonAtomic, readState, privateDir, alive, takeAppLock, releaseAppLock, lockPath, VERSION, LATEST_VERSION, semverGt, REGISTRY, checkLatest, CONFIG_DIR, CONFIG_PATH, SECRETS_PATH, loadConfig, saveConfig, moveSecrets, splitSecrets, loadTasks, saveTasks, TASK_MAX, clipWords, taskWords, sameTask, isFinding, uniqueTasks, sh, runOut, runOk, gitOut, gitOk, hasCmd, chromeBinary, repoState };
