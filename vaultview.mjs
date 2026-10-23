// The Vault page: the logins, keys and codes in Symbiot's vault (vault.mjs), looked up by
// the user. The list is names and what's known about each (its kind, the account or email
// it's for, when it was saved), never a value. A value is shown or copied only after a
// fresh unlock with the vault PIN, which holds for UNLOCK_MS; each show and copy is logged
// here, on this computer (name, what and when, never the value). The PIN is kept as a
// scrypt hash with its own salt (vault-pin.json, 0600), as a master password is in a
// zero-knowledge vault: what's on disk can't be turned back into it. Wrong tries in a row
// lock the page for a while. Nothing here goes to the AI, a log, a report or a brief, and
// nothing in the vault is changed: no value is spent, renamed or deleted.
import { join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";
import { listSecrets, peekSecret } from "./vault.mjs";

const PIN_FILE = () => join(CONFIG_DIR, "vault-pin.json"), LOG_FILE = () => join(CONFIG_DIR, "vault-log.json");
const UNLOCK_MS = 2 * 60000, TRIES = 5, LOCKOUT_MS = 5 * 60000, LOG_KEEP = 500, PIN_MIN = 6;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const hash = (pin, salt) => scryptSync(String(pin), salt, 32, SCRYPT);
const readPin = () => readState(PIN_FILE()) || null;
const writePin = (p) => writeJsonAtomic(PIN_FILE(), p, { mode: 0o600 });

// What kind of entry a name says it is, and the account in it ("twilio password (jane@example.com)").
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
function kindOf(name) {
  const n = String(name).toLowerCase();
  if (/\bpass(?:word|code|phrase)?\b|\bpw\b/.test(n)) return "Password";
  if (/\b(?:recovery|backup)\b/.test(n) || /\bcodes\b/.test(n)) return "Recovery codes";
  if (/\bcode$/.test(n)) return "One-time code";
  if (/\b(?:api|key|keys|token|tokens|secret)\b/.test(n.replace(/[-_]/g, " "))) return "API key or token";
  if (/\b(?:sid|account id|account-sid|client id|username|user)\b/.test(n.replace(/[-_]/g, " "))) return "Account ID";
  return "Secret";
}
const accountOf = (name) => ((String(name).match(EMAIL) || [])[0] || "").toLowerCase();

// The list: names and what's known, newest first. { entries, pin: set or not, unlocked until }
function vaultList({ token = "", now = Date.now() } = {}) {
  const entries = listSecrets().map((s) => ({ name: s.name, kind: kindOf(s.name), account: accountOf(s.name), saved: s.ts || 0, count: s.count || 0, left: s.left ?? s.count ?? 0 }))
    .sort((a, b) => (b.saved || 0) - (a.saved || 0) || a.name.localeCompare(b.name));
  return { entries, ...lockState({ token, now }) };
}

// ---- the unlock gate ------------------------------------------------------------------
const SESSIONS = new Map(); // token -> until; in memory only, so a restart locks the vault
function lockState({ token = "", now = Date.now() } = {}) {
  const p = readPin(), until = SESSIONS.get(String(token)) || 0;
  return { pin: !!(p && p.hash), unlocked: until > now ? until : 0, wait: p && p.until > now ? p.until - now : 0, unlockMs: UNLOCK_MS };
}
function setPin(pin, { old = "", token = "", now = Date.now() } = {}) {
  pin = String(pin || "");
  if (pin.length < PIN_MIN) return { error: `Make it at least ${PIN_MIN} characters.` };
  const p = readPin();
  if (p && p.hash) { // changing it takes the old one, or an unlock still running
    if (!(SESSIONS.get(String(token)) > now) && !check(old, { now }).ok) return { error: "That isn't your current vault PIN." };
  }
  const salt = randomBytes(16);
  writePin({ v: 1, salt: salt.toString("base64"), hash: hash(pin, salt).toString("base64"), N: SCRYPT.N, at: now, fails: 0, until: 0 });
  SESSIONS.clear();
  return unlock(pin, { now });
}
function check(pin, { now = Date.now() } = {}) {
  const p = readPin(); if (!p || !p.hash) return { error: "Set a vault PIN first." };
  if (p.until > now) return { error: `Too many wrong tries. Try again in ${Math.ceil((p.until - now) / 60000)} min.`, wait: p.until - now };
  const want = Buffer.from(p.hash, "base64"), got = hash(pin, Buffer.from(p.salt, "base64"));
  if (got.length === want.length && timingSafeEqual(got, want)) { if (p.fails) writePin({ ...p, fails: 0, until: 0 }); return { ok: true }; }
  const fails = (p.fails || 0) + 1, locked = fails >= TRIES;
  writePin({ ...p, fails: locked ? 0 : fails, until: locked ? now + LOCKOUT_MS : 0 });
  return locked ? { error: `Too many wrong tries. Try again in ${LOCKOUT_MS / 60000} min.`, wait: LOCKOUT_MS } : { error: `That PIN isn't right. ${TRIES - fails} ${TRIES - fails === 1 ? "try" : "tries"} left before a ${LOCKOUT_MS / 60000}-minute wait.` };
}
// A fresh unlock: a token the page holds, good for UNLOCK_MS. Each unlock is a new one.
function unlock(pin, { now = Date.now() } = {}) {
  const c = check(pin, { now }); if (!c.ok) return c;
  for (const [t, u] of SESSIONS) if (u <= now) SESSIONS.delete(t);
  const token = randomBytes(24).toString("base64url"), until = now + UNLOCK_MS;
  SESSIONS.set(token, until);
  return { ok: true, token, until, unlockMs: UNLOCK_MS };
}
function lock(token) { SESSIONS.delete(String(token || "")); return { ok: true }; }

// One entry's values, for an unlocked page only. act: "reveal" or "copy", logged either way.
function vaultValue(name, { token = "", act = "reveal", now = Date.now() } = {}) {
  const until = SESSIONS.get(String(token)) || 0;
  if (!(until > now)) return { locked: true, error: "Unlock the vault to see this." };
  const e = peekSecret(String(name || "")); if (e.error) return { error: e.error };
  if (e.once && e.expires && now > e.expires) return { error: "This code ran out of time." };
  note(e.name, act === "copy" ? "copy" : "reveal", now);
  return { ok: true, name: e.name, values: e.values, until };
}

// ---- the log: who looked at what, on this computer ------------------------------------
function note(name, act, at = Date.now()) {
  const log = readState(LOG_FILE(), Array.isArray) || [];
  log.push({ at, name: String(name).slice(0, 80), act });
  try { writeJsonAtomic(LOG_FILE(), log.slice(-LOG_KEEP), { mode: 0o600 }); } catch {}
}
const vaultLog = (n = 20) => (readState(LOG_FILE(), Array.isArray) || []).slice(-n).reverse();

// Forgot the PIN: `symbiot secret pin-reset` in a terminal (someone at your own terminal can read the vault anyway).
function resetPin() { const had = !!(readPin() || {}).hash; try { writePin({ v: 1, reset: Date.now() }); } catch { return { error: "Couldn't reset it." }; } SESSIONS.clear(); return { ok: true, had }; }

export { vaultList, vaultValue, vaultLog, setPin, unlock, lock, lockState, resetPin, kindOf, accountOf, UNLOCK_MS, TRIES, LOCKOUT_MS, PIN_MIN };
