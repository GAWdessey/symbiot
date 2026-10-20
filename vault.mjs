// Secrets the user hands over (passwords, recovery codes, tokens): kept in the OS keyring
// when there is one (secret-tool on Linux, security on macOS), else encrypted on disk
// (AES-256-GCM, key in vault.key, 0600). Only a name and a count sit in vault.json, never
// a value. Chat redacts a pasted secret before it is stored or sent (captureSecrets), and
// an agent reads one by name (`symbiot secret get <name>`) and marks a one-use code spent.
import { existsSync, readFileSync, writeFileSync, chmodSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { CONFIG_DIR, hasCmd, readState, writeJsonAtomic, writeAtomic } from "./core.mjs";

const INDEX = () => join(CONFIG_DIR, "vault.json"), KEYFILE = () => join(CONFIG_DIR, "vault.key");
const readIndex = () => readState(INDEX()) || { names: {}, blobs: {} };
const writeIndex = (x) => writeJsonAtomic(INDEX(), x, { mode: 0o600 });
function key() {
  if (!existsSync(KEYFILE())) { writeFileSync(KEYFILE(), randomBytes(32).toString("base64"), { mode: 0o600 }); try { chmodSync(KEYFILE(), 0o600); } catch {} }
  return Buffer.from(readFileSync(KEYFILE(), "utf8"), "base64");
}
const seal = (s) => { const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv), ct = Buffer.concat([c.update(s, "utf8"), c.final()]); return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64")).join("."); };
const unseal = (s) => { const [iv, tag, ct] = s.split(".").map((p) => Buffer.from(p, "base64")), d = createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString("utf8"); };

// The keyring, when this machine has one and SYMBIOT_VAULT isn't "file".
function keyring() {
  if (process.env.SYMBIOT_VAULT === "file") return null;
  if (process.platform === "linux" && hasCmd("secret-tool")) return {
    put: (n, v) => spawnSync("secret-tool", ["store", "--label", "Symbiot: " + n, "app", "symbiot", "name", n], { input: v }).status === 0,
    get: (n) => { const r = spawnSync("secret-tool", ["lookup", "app", "symbiot", "name", n], { encoding: "utf8" }); return r.status === 0 ? r.stdout : null; },
    del: (n) => spawnSync("secret-tool", ["clear", "app", "symbiot", "name", n]).status === 0,
  };
  if (process.platform === "darwin" && hasCmd("security")) return {
    put: (n, v) => spawnSync("security", ["add-generic-password", "-U", "-s", "symbiot", "-a", n, "-w", v]).status === 0,
    get: (n) => { const r = spawnSync("security", ["find-generic-password", "-s", "symbiot", "-a", n, "-w"], { encoding: "utf8" }); return r.status === 0 ? r.stdout.replace(/\n$/, "") : null; },
    del: (n) => spawnSync("security", ["delete-generic-password", "-s", "symbiot", "-a", n]).status === 0,
  };
  return null;
}
const load = (name) => {
  const idx = readIndex(), kr = keyring(); let raw = null;
  if (idx.names[name]?.where === "keyring" && kr) raw = kr.get(name);
  else if (idx.blobs[name]) { try { raw = unseal(idx.blobs[name]); } catch {} }
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
};
function store(name, entry) {
  const idx = readIndex(), kr = keyring(), raw = JSON.stringify(entry);
  let where = "file";
  if (kr && kr.put(name, raw)) { where = "keyring"; delete idx.blobs[name]; } else idx.blobs[name] = seal(raw);
  idx.names[name] = { ts: entry.ts, count: entry.values.length, used: entry.values.filter((v) => v.used).length, where };
  writeIndex(idx);
}

// Save secret values under a name. A name that exists gets the new values added to it.
function saveSecret(name, values) {
  name = String(name || "").trim().slice(0, 80); if (!name) return { error: "A secret needs a name." };
  const vals = [].concat(values).map((v) => String(v)).filter(Boolean); if (!vals.length) return { error: "Nothing to save." };
  const cur = load(name) || { name, ts: Date.now(), values: [] };
  for (const v of vals) if (!cur.values.some((x) => x.v === v)) cur.values.push({ v, used: false });
  store(name, cur);
  return { ok: true, name, count: cur.values.length };
}
// Names and counts only, never a value.
const listSecrets = () => Object.entries(readIndex().names).map(([name, m]) => ({ name, ...m, left: m.count - m.used }));
// A value an agent can use: the next unspent one. use: true marks it spent (a one-use recovery code).
function getSecret(name, { use = false } = {}) {
  const e = load(name); if (!e) return { error: `No secret called "${name}". symbiot secret list shows what's saved.` };
  const next = e.values.find((x) => !x.used); if (!next) return { error: `Every value in "${name}" has been used.` };
  if (use) { next.used = true; store(name, e); }
  return { ok: true, name, value: next.v, left: e.values.filter((x) => !x.used).length, spent: use };
}
function markUsed(name, value) {
  const e = load(name); if (!e) return { error: `No secret called "${name}".` };
  const x = e.values.find((y) => y.v === value || y.v.startsWith(value)); if (!x) return { error: "No such value in that secret." };
  x.used = true; store(name, e); return { ok: true, left: e.values.filter((y) => !y.used).length };
}
function deleteSecret(name) {
  const idx = readIndex(), m = idx.names[name]; if (!m) return { error: `No secret called "${name}".` };
  if (m.where === "keyring") { const kr = keyring(); if (kr) kr.del(name); }
  delete idx.names[name]; delete idx.blobs[name]; writeIndex(idx); return { ok: true };
}

// ---- spotting a secret in what someone typed ------------------------------------------
const PATTERNS = [
  ["token", /\b(?:npm_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g],
  ["token", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{8,})?/g], // a JWT (a Lemon Squeezy key): dots, so the long-run shape below never matched it (19 Oct 2026)
  ["codes", /\b[0-9a-f]{32,}\b/gi, "cue"],
  ["password", /\b(?:password|passwd|pwd|pass|passcode|pin)\s*(?:is|=|:)\s*(\S{4,})/gi],
  ["token", /\b[A-Za-z0-9+/_-]{40,}={0,2}(?=\s|$)/g, "cue"],
];
// The two shapes with no prefix of their own (a run of hex, a long run of base64
// characters) are secrets only when the words before them say so: a pasted commit
// SHA, a long URL path or a base64 blob were swallowed into the vault, and "revert
// abc123…" reached the model as "revert [saved: token]" (15 Oct 2026). Never a value
// inside a URL.
const CUE = /\b(?:tokens?|passwords?|passwd|pwd|pass(?:codes?|phrases?)?|secrets?|api[ _-]?keys?|keys?|codes?|recovery|backup|otp|pins?|credentials?)\b[^.\n]{0,40}?(?:[\s,;:]*[A-Za-z0-9+/_=-]{32,})*[\s,;:]*$/i; // the cue, a few words, then only values before this one (a list of codes)
const cued = (text, at) => CUE.test(text.slice(Math.max(0, at - 800), at));
const inUrl = (text, at) => /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S*$/i.test(text.slice(Math.max(0, at - 2000), at));
// A password with no "password:" before it (19 Oct 2026: "i signed up to <a site> with
// <an email> <a password>" reached the chat whole). It's one when it comes right after an
// email address, after "password" or "pw" with no "is" or ":", or, password-shaped (mixed
// case, digits, symbols, no spaces), in a sentence about an account (signing up or in, a
// login, an email address). A version ("Python3.12"), a date, a time, a path or an
// address never is.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
const kinds = (v) => [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(v)).length;
const NOT_PW = /[\\/]|^(?:https?:|www\.)|^\d{1,4}[-/:.]\d|^v?\d+\.\d+|^[#@]|^[`'"([{<]|[)\]}>]$/;
const NAMEISH = /^[A-Za-z]+(?:[-_][A-Za-z]+)*[-_]?v?\d+(?:\.\d+)*[a-z]?$/; // a name and a number: Python3.12, Node-22, GitHub-Actions2
// A word with an apostrophe ("Symbiot's", "don't") or an id shaped like a UUID never is: "Symbiot's"
// in a sentence about an account was vaulted as a password and blanked from every stored copy of the
// chat and tasks, and an Azure subscription id as a twitter password (19 Oct 2026). One in the middle
// of a sentence (min 3) has a digit too.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, WORDY = /^[A-Za-z]+(?:['’][A-Za-z]{1,3})?[.,;:!?]*$/;
const notPassword = (v) => WORDY.test(v) || UUID.test(v);
const pwShaped = (v, min = 3) => v.length >= 6 && v.length <= 64 && kinds(v) >= min && /\d|[^A-Za-z0-9]/.test(v) && /[A-Za-z]/.test(v) && !EMAIL.test(v) && !NOT_PW.test(v) && !notPassword(v) && (min < 3 || (!NAMEISH.test(v) && /\d/.test(v)));
const ACCOUNT = /\b(?:sign(?:ed|ing)?[ -]?(?:up|in)|log(?:ged|ging)?[ -]?in|login|account|registered|password|passwd|pw|creds|credentials)\b/i;
const sentenceAt = (text, at) => { const a = Math.max(text.lastIndexOf("\n", at - 1), ...[". ", "! ", "? "].map((p) => text.lastIndexOf(p, at - 1))); const b = text.slice(at).search(/[.!?](?:\s|$)|\n/); return text.slice(a + 1, b < 0 ? text.length : at + b); };
const trimPw = (v) => v.replace(/[.,;:'")\]]+$/, "");
function loosePasswords(text) {
  const out = [];
  const add = (v, at, min) => { v = trimPw(v); if (pwShaped(v, min) && !out.some((h) => h.at === at)) out.push({ value: v, at }); };
  for (const m of text.matchAll(new RegExp(EMAIL.source + "[\\s,;:]+(?:(?:and|pw|pass(?:word)?)\\s*[:=-]?\\s*)?(\\S+)", "g"))) add(m[1], m.index + m[0].length - m[1].length, 2);
  for (const m of text.matchAll(/\b(?:password|passwd|pwd|pw|pass)(?:['’]s)?\s+(?!is\b|=)(\S+)/gi)) add(m[1], m.index + m[0].length - m[1].length, 2);
  for (const m of text.matchAll(/\bpw\s*(?:is|=|:)\s*(\S{4,})/gi)) { const v = trimPw(m[1]), at = m.index + m[0].length - m[1].length; if (v.length >= 4 && !out.some((h) => h.at === at)) out.push({ value: v, at }); }
  for (const m of text.matchAll(/(?<=^|\s)(\S{8,64})(?=\s|$)/g)) { const s = sentenceAt(text, m.index); if (EMAIL.test(s) || ACCOUNT.test(s)) add(m[1], m.index, 3); }
  return out;
}
// The site a password is for, from its sentence: "signed up to <site> with …", a site's
// address, a site Symbiot knows, or the words before "password". "" when it doesn't say.
const SITE_WORDS = /\b(?:sign(?:ed|ing)?[ -]?up|registered|sign(?:ed|ing)?[ -]?in|log(?:ged|ging)?[ -]?in|account|login)\s+(?:to|for|on|at|with|into)\s+(?:the\s+|my\s+)?([a-z0-9][a-z0-9 .-]{0,30}?)(?=\s+(?:with|as|using|via|and|is|account)\b|\s*[,:;]|\s+\S*@)/i;
const KNOWN_SITE = /\b(npm|github|gmail|google|cloudflare|x|twitter|aws|stripe)\b/i;
function siteOf(sentence) {
  const s = String(sentence || "").replace(EMAIL, (e) => " " + e.replace(/\./g, "\u0000") + " ");
  const m = s.match(SITE_WORDS); if (m && !/\u0000/.test(m[1])) return m[1].trim().toLowerCase();
  const d = s.match(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i); if (d) return d[1].toLowerCase().replace(/^www\./, "");
  const k = s.match(KNOWN_SITE); if (k) return k[1].toLowerCase();
  const b = s.match(/\b((?:[a-z0-9]+\s+){1,2})(?:password|passwd|pw|login)\b/i);
  const w = b ? b[1].trim().toLowerCase().split(/\s+/).filter((x) => !["my", "the", "is", "and", "a", "your", "with", "new", "its", "it's", "here", "heres"].includes(x)) : [];
  return w.join(" ");
}
// What the secret is, from the words before it ("recovery codes for npm: …" -> "npm recovery codes").
// A password is named for its site and account: "a site password (them@example.com)".
function labelFor(text, at, kind) {
  const before = text.slice(0, at).replace(/\s+/g, " ").trim().split(/[.!?\n]/).pop() || "";
  const w = before.toLowerCase().replace(/[^a-z0-9 @._-]+/g, " ").split(/\s+/).filter(Boolean);
  const site = (before.match(KNOWN_SITE) || [])[1];
  if (/recovery|backup/.test(before) && /code/.test(before)) return `${site ? site.toLowerCase() + " " : ""}recovery codes`;
  if (kind === "password") { const s = sentenceAt(text, at), where = siteOf(s), who = (s.match(EMAIL) || [])[0]; return `${where ? where + " " : ""}password${who ? ` (${who.toLowerCase()})` : ""}`; }
  const tail = w.filter((x) => !["here", "is", "are", "my", "the", "for", "this", "heres", "here's", "its", "it's"].includes(x)).slice(-5).join(" ");
  return tail || (kind === "codes" ? "codes" : "token");
}
// A key pasted on its own says nothing of what it's for: it was saved as "token" (19 Oct 2026,
// a Lemon Squeezy key pasted on Home right after Symbiot asked for it). The chat just before
// it, and the steps waiting on the user to paste something, name the service: the last one
// they mention ("your Lemon Squeezy sign-in", "app.lemonsqueezy.com"), "" when none does.
const NOT_SERVICE = new Set(["settings", "home", "the", "your", "you", "api", "symbiot", "agent", "only", "workdesk", "then", "make", "paste", "under", "in", "a", "my", "this", "it", "test", "live", "new", "chrome"]);
function serviceOf(context) {
  const c = String(context || ""), hits = [];
  for (const m of c.matchAll(/\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)?)(?:'s)?\s+(?:(?:[Tt]est[- ]mode|[Aa]uth|[Aa]ccess|[Ss]ecret|[Ll]ive)\s+)?(?:[Aa][Pp][Ii][ _-]?[Kk]eys?|[Kk]eys?|[Tt]okens?|[Ss]ign-?in|[Aa]ccount|[Ss]tore|[Dd]ashboard|[Ss]ecret)\b/g)) {
    const w = m[1].split(/\s+/).filter((x) => !NOT_SERVICE.has(x.toLowerCase()));
    if (w.length && /^[A-Z]/.test(w[0])) hits.push([m.index, w.join(" ").toLowerCase()]);
  }
  for (const m of c.matchAll(/\b(?:https?:\/\/)?(?:www\.|app\.|api\.|dashboard\.|console\.)?([a-z0-9-]{3,})\.(?:com|io|co|net|org|app|dev|ai)\b/gi)) if (!/^(symbiot|example|gmail|github)$/i.test(m[1])) hits.push([m.index, m[1].toLowerCase()]);
  hits.sort((a, b) => a[0] - b[0]);
  const last = hits.length ? hits[hits.length - 1][1] : "", spaced = hits.find((h) => h[1].includes(" ") && h[1].replace(/\s+/g, "") === last);
  return spaced ? spaced[1] : last; // "lemonsqueezy" (its address) as the chat wrote it: "lemon squeezy"
}
const BARE = new Set(["token", "codes"]);
// Replace every secret in text with [secret hidden]; give what was found, grouped by name.
// context: the chat before it, for a name when the text itself gives none (serviceOf).
function findSecrets(text, mark = () => "[secret hidden]", { context = "" } = {}) {
  text = String(text || ""); const hits = [];
  for (const [kind, re, need] of PATTERNS) for (const m of text.matchAll(re)) {
    const value = m[1] || m[0];
    if (kind !== "password" && !/^(npm_|gh[pousr]_|github_pat_|sk-|xox|AKIA)/.test(value) && (new Set(value).size < 8 || !/\d/.test(value) || !/[a-z]/i.test(value))) continue; // aaaa… or a run of words isn't a secret
    const at = m.index + m[0].lastIndexOf(value);
    if (need === "cue" && (!cued(text, at) || inUrl(text, at))) continue;
    if (hits.some((h) => at < h.end && at + value.length > h.at)) continue;
    hits.push({ kind, value, at, end: at + value.length });
  }
  for (const { value, at } of loosePasswords(text)) {
    if (inUrl(text, at) || hits.some((h) => at < h.end && at + value.length > h.at)) continue;
    hits.push({ kind: "password", value, at, end: at + value.length });
  }
  hits.sort((a, b) => a.at - b.at);
  let out = "", pos = 0; const groups = new Map();
  const svc = context ? serviceOf(context) : "", mode = /\btest[- ]mode\b/i.test(`${context} ${text}`) ? " (test mode)" : "";
  for (const h of hits) {
    let name = labelFor(text, h.at, h.kind);
    if (svc && BARE.has(name)) name = `${svc} ${h.kind === "codes" ? "codes" : "api key"}${mode}`;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(h.value);
    out += text.slice(pos, h.at) + mark(name); pos = h.end;
  }
  out += text.slice(pos);
  return { text: out.replace(/(\[(?:saved: [^\]]+|secret hidden)\])(?:[\s,;]*\1)+/g, "$1"), found: [...groups].map(([name, values]) => ({ name, values })) };
}
// A chat message in: its secrets saved, and the text safe to store or send, with a placeholder
// "[saved: name]" where they were. A message with no secret comes back as it was.
// context may be a function: it's only worked out when there's a secret to name.
function captureSecrets(text, { context = "" } = {}) {
  if (!findSecrets(text).found.length) return { text: String(text || ""), saved: [] };
  if (typeof context === "function") { try { context = String(context() || ""); } catch { context = ""; } }
  const failed = new Set(), { found } = findSecrets(text, undefined, { context });
  const saved = []; for (const f of found) { if (saveSecret(f.name, f.values).ok) saved.push(f.name); else failed.add(f.name); }
  return { text: findSecrets(text, (n) => (failed.has(n) ? "[not saved]" : `[saved: ${n}]`), { context }).text, saved };
}

// ---- secrets stored before they were caught ------------------------------------------
// A password whose shape the detector didn't know yet sits in plain text where the chat kept
// it (19 Oct 2026: "i signed up to <a site> with <an email> <a password>"): the chat history
// (mind.json), what chats answered (asks-done.json), the task list, and the briefs and logs
// of runs a chat started (drafts/act-…). Once per change to the detector (SCRUB_V), the
// user's own chat turns are read again: what's found goes to the vault, and every copy of it
// in those files becomes "[saved: name]". { found: [name], files: [file] } or { skipped }.
const SCRUB_V = 2, SCRUB_MARK = () => join(CONFIG_DIR, "scrubbed.json");
// ...and each lane a run has worked in (runs.json): a task quoting the key went into its brief and its run's log.
function storedFiles() {
  const top = ["mind.json", "mind.json.bak", "asks-done.json", "tasks.json", "tasks.json.bak", "lastwords.json", "home-handed.json", "lanes.json", "lanes.json.bak"].map((f) => join(CONFIG_DIR, f));
  const RUN = ["TASKS.md", "ANSWERS.md", "ANSWERS.archive.md", "agent.log", "agent.log.old", "handed.json", "handoff.json"];
  let runs = []; try { runs = readdirSync(join(CONFIG_DIR, "drafts")).flatMap((d) => RUN.map((f) => join(CONFIG_DIR, "drafts", d, ".symbiot", f))); } catch {}
  let lanes = []; try { lanes = (readState(join(CONFIG_DIR, "runs.json"), Array.isArray) || []).map((r) => r && r.path).filter((p) => typeof p === "string" && p).flatMap((p) => RUN.map((f) => join(p, ".symbiot", f))); } catch {}
  return [...new Set([...top, ...runs, ...lanes])].filter((f) => existsSync(f));
}
// A piece of a saved secret quoted on its own ("a key beginning 'eyJ0…' and ending '…pu3l'", in a
// task written about it) is blanked too: any run of 32 or more key characters found inside one.
const PIECE = /[A-Za-z0-9_.+/=-]{32,}/g;
function scrubStored({ force = false } = {}) {
  if (!force && ((readState(SCRUB_MARK()) || {}).v || 0) >= SCRUB_V) return { skipped: true };
  const mind = readState(join(CONFIG_DIR, "mind.json")) || {}, done = readState(join(CONFIG_DIR, "asks-done.json"), Array.isArray) || [];
  const log = Array.isArray(mind.log) ? mind.log : [];
  const said = [...log.map((l, i) => (l && l.role === "user" ? { t: String(l.text || ""), context: log.slice(Math.max(0, i - 6), i).map((x) => String((x && x.text) || "")).join("\n") } : null)).filter(Boolean),
    ...done.map((x) => String((x && x.a) || "")).filter((a) => /^answered in chat:/.test(a)).map((t) => ({ t, context: "" }))];
  const byName = new Map();
  for (const { t, context } of said) for (const f of findSecrets(t, undefined, { context }).found) byName.set(f.name, [...new Set([...(byName.get(f.name) || []), ...f.values])]);
  const swap = [];
  for (const [name, values] of byName) if (saveSecret(name, values).ok) for (const v of values) swap.push([v, `[saved: ${name.replace(/["\\]/g, "")}]`]);
  swap.sort((a, b) => b[0].length - a[0].length);
  const files = [];
  for (const f of swap.length ? storedFiles() : []) {
    let raw; try { raw = readFileSync(f, "utf8"); } catch { continue; }
    let out = raw;
    for (const [v, mark] of swap) for (const form of new Set([v, JSON.stringify(v).slice(1, -1)])) out = out.split(form).join(mark);
    out = out.replace(PIECE, (run) => { const hit = swap.find(([v]) => v.length > run.length && v.includes(run)); return hit ? hit[1] : run; });
    if (out !== raw) { try { writeAtomic(f, out); files.push(f); } catch {} }
  }
  try { writeJsonAtomic(SCRUB_MARK(), { v: SCRUB_V, at: Date.now(), found: byName.size }, { mode: 0o600 }); } catch {}
  return { found: [...byName.keys()], files };
}

// Words the detector took for secrets before it knew better (notPassword): each goes back where
// "[saved: name]" stands for it, and leaves the vault. A name holding only one value, and that one
// a word, is put back everywhere; one that also holds real values only loses the word (its marks
// can't be told apart, so they stay). Once per REPAIR_V, at start. { restored: [name], files, dropped }.
const REPAIR_V = 1, REPAIR_MARK = () => join(CONFIG_DIR, "repaired.json");
function repairFalseSaves({ force = false } = {}) {
  if (!force && ((readState(REPAIR_MARK()) || {}).v || 0) >= REPAIR_V) return { skipped: true };
  const back = [], dropped = [];
  for (const name of Object.keys(readIndex().names)) {
    const cur = load(name); if (!cur || !Array.isArray(cur.values)) continue;
    const bad = cur.values.filter((x) => notPassword(String(x.v || "").trim())); if (!bad.length) continue;
    if (bad.length === cur.values.length && bad.length === 1) { back.push([`[saved: ${name.replace(/["\\]/g, "")}]`, String(bad[0].v).trim(), name]); deleteSecret(name); }
    else { store(name, { ...cur, values: cur.values.filter((x) => !bad.includes(x)) }); dropped.push(name); }
  }
  const files = [];
  for (const f of back.length ? storedFiles() : []) {
    let raw; try { raw = readFileSync(f, "utf8"); } catch { continue; }
    let out = raw; for (const [mark, word] of back) { out = out.split(mark).join(word); out = out.split(JSON.stringify(mark).slice(1, -1)).join(JSON.stringify(word).slice(1, -1)); }
    if (out !== raw) { try { writeAtomic(f, out); files.push(f); } catch {} }
  }
  try { writeJsonAtomic(REPAIR_MARK(), { v: REPAIR_V, at: Date.now(), restored: back.length }, { mode: 0o600 }); } catch {}
  return { restored: back.map((b) => b[2]), files, dropped };
}

// A step waiting on a key, token or password the user was to paste is met once a secret
// whose name shares the step's service words (everything but "key", "test"…) was saved after
// the wait began: "Lemon Squeezy test API key" meets "make a key … paste it on Home".
const GENERIC = new Set(["key", "keys", "api", "test", "live", "token", "tokens", "password", "secret", "code", "codes", "login", "account"]);
// The secret's name, or "" when none meets it.
function meetsStep(step, since) {
  const text = String(step || "").toLowerCase();
  if (!/\b(?:key|token|password|secret|paste|code)s?\b/.test(text)) return "";
  const pw = /\bpass(?:word|code)?s?\b/.test(text), key = /\b(?:api|keys?|tokens?)\b/.test(text);
  const hit = Object.entries(readIndex().names).find(([name, m]) => {
    if (!(m.ts > since)) return false;
    const isPw = /\bpass(?:word|code)\b/i.test(name); if (isPw ? key && !pw : pw && !key) return false; // a password doesn't meet a step asking for a key, nor a key one asking for a password
    const w = name.toLowerCase().replace(/\(.*?\)/g, " ").split(/[^a-z0-9]+/).filter((x) => x.length > 1 && !GENERIC.has(x));
    return w.length > 0 && w.every((x) => text.includes(x));
  });
  return hit ? hit[0] : "";
}

export { repairFalseSaves, meetsStep, serviceOf, saveSecret, listSecrets, getSecret, markUsed, deleteSecret, findSecrets, captureSecrets, scrubStored, SCRUB_V };
