// Secrets the user hands over (passwords, recovery codes, tokens): kept in the OS keyring
// when there is one (secret-tool on Linux, security on macOS), else encrypted on disk
// (AES-256-GCM, key in vault.key, 0600). Only a name and a count sit in vault.json, never
// a value. Chat redacts a pasted secret before it is stored or sent (captureSecrets), and
// an agent reads one by name (`symbiot secret get <name>`) and marks a one-use code spent.
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { CONFIG_DIR, hasCmd } from "./core.mjs";

const INDEX = () => join(CONFIG_DIR, "vault.json"), KEYFILE = () => join(CONFIG_DIR, "vault.key");
const readIndex = () => { try { return JSON.parse(readFileSync(INDEX(), "utf8")); } catch { return { names: {}, blobs: {} }; } };
const writeIndex = (x) => { writeFileSync(INDEX(), JSON.stringify(x, null, 2) + "\n", { mode: 0o600 }); try { chmodSync(INDEX(), 0o600); } catch {} };
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
  ["codes", /\b[0-9a-f]{32,}\b/gi],
  ["password", /\b(?:password|passwd|pwd|pass|passcode|pin)\s*(?:is|=|:)\s*(\S{4,})/gi],
  ["token", /\b[A-Za-z0-9+/_-]{40,}={0,2}(?=\s|$)/g],
];
// What the secret is, from the words before it ("recovery codes for npm: …" -> "npm recovery codes").
function labelFor(text, at, kind) {
  const before = text.slice(0, at).replace(/\s+/g, " ").trim().split(/[.!?\n]/).pop() || "";
  const w = before.toLowerCase().replace(/[^a-z0-9 @._-]+/g, " ").split(/\s+/).filter(Boolean);
  const site = (before.match(/\b(npm|github|gmail|google|cloudflare|x|twitter|aws|stripe)\b/i) || [])[1];
  if (/recovery|backup/.test(before) && /code/.test(before)) return `${site ? site.toLowerCase() + " " : ""}recovery codes`;
  if (kind === "password") return `${site ? site.toLowerCase() + " " : ""}password`;
  const tail = w.filter((x) => !["here", "is", "are", "my", "the", "for", "this", "heres", "here's", "its", "it's"].includes(x)).slice(-4).join(" ");
  return tail || (kind === "codes" ? "codes" : "token");
}
// Replace every secret in text with [secret hidden]; give what was found, grouped by name.
function findSecrets(text, mark = () => "[secret hidden]") {
  text = String(text || ""); const hits = [];
  for (const [kind, re] of PATTERNS) for (const m of text.matchAll(re)) {
    const value = m[1] || m[0];
    if (kind !== "password" && !/^(npm_|gh[pousr]_|github_pat_|sk-|xox|AKIA)/.test(value) && (new Set(value).size < 8 || !/\d/.test(value) || !/[a-z]/i.test(value))) continue; // aaaa… or a run of words isn't a secret
    const at = m.index + m[0].lastIndexOf(value);
    if (hits.some((h) => at < h.end && at + value.length > h.at)) continue;
    hits.push({ kind, value, at, end: at + value.length });
  }
  hits.sort((a, b) => a.at - b.at);
  let out = "", pos = 0; const groups = new Map();
  for (const h of hits) {
    const name = labelFor(text, h.at, h.kind);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(h.value);
    out += text.slice(pos, h.at) + mark(name); pos = h.end;
  }
  out += text.slice(pos);
  return { text: out.replace(/(\[(?:saved: [^\]]+|secret hidden)\])(?:[\s,;]*\1)+/g, "$1"), found: [...groups].map(([name, values]) => ({ name, values })) };
}
// A chat message in: its secrets saved, and the text safe to store or send, with a placeholder
// "[saved: name]" where they were. A message with no secret comes back as it was.
function captureSecrets(text) {
  const failed = new Set(), { found } = findSecrets(text); if (!found.length) return { text: String(text || ""), saved: [] };
  const saved = []; for (const f of found) { if (saveSecret(f.name, f.values).ok) saved.push(f.name); else failed.add(f.name); }
  return { text: findSecrets(text, (n) => (failed.has(n) ? "[not saved]" : `[saved: ${n}]`)).text, saved };
}

export { saveSecret, listSecrets, getSecret, markUsed, deleteSecret, findSecrets, captureSecrets };
