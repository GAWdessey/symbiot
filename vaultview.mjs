// The Vault page: the logins, keys and codes in Symbiot's vault (vault.mjs), looked up and kept
// tidy by the user. The list is names and what's known about each (a readable name, the service
// it belongs to, its kind, the account or email it's for, when it was saved, and what needs a
// look: a name that says nothing, a value saved twice, a file's name taken for a password),
// never a value. A value is shown or copied, and an entry added, renamed or deleted, only on a
// page unlocked with the vault PIN; the unlock holds while it's used and ends UNLOCK_MS after the
// last use. Each show, copy and change is logged here, on this computer (name, what and when,
// never the value). The PIN is kept as a scrypt hash with its own salt (vault-pin.json, 0600), as
// a master password is in a zero-knowledge vault: what's on disk can't be turned back into it.
// Wrong tries in a row lock the page for a while. Nothing here goes to the AI, a log, a report or
// a brief.
import { join } from "node:path";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";
import { listSecrets, peekSecret, saveSecret, renameSecret, deleteSecret, fillSite, setSite } from "./vault.mjs";

const PIN_FILE = () => join(CONFIG_DIR, "vault-pin.json"), LOG_FILE = () => join(CONFIG_DIR, "vault-log.json");
const UNLOCK_MS = 5 * 60000, TRIES = 5, LOCKOUT_MS = 5 * 60000, LOG_KEEP = 500, PIN_MIN = 6;
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
  if (/\bpin\b/.test(n.replace(/[-_]/g, " "))) return "PIN";
  return "Secret";
}
const accountOf = (name) => ((String(name).match(EMAIL) || [])[0] || "").toLowerCase();

// The name as people read it: "twilio_auth_token" → "Twilio auth token", "parcel-tracker
// account sid" → "Parcel tracker account SID". The email it's for goes (it shows beside it),
// short forms are in capitals, a word already cased its own way stays so ("Wi-Fi" keeps its
// hyphen), a brand's site reads as the brand ("github.com" → "GitHub.com"), and a name that's
// lower case by design (npm) stays lower case. The raw name stays the key.
const UPPER = new Set(["sid", "api", "id", "pin", "url", "sms", "otp", "totp", "2fa", "mfa", "ssh", "aws", "s3", "smtp", "imap", "jwt", "dns", "ip", "ftp", "sftp", "db", "vpn", "crm", "gpg", "pgp", "ai", "cli", "ui", "uri", "sdp", "wa"]);
const LOWER = new Set(["npm", "pnpm", "npx"]);
const CASED = { github: "GitHub", gitlab: "GitLab", linkedin: "LinkedIn", whatsapp: "WhatsApp", openai: "OpenAI", paypal: "PayPal", mongodb: "MongoDB", digitalocean: "DigitalOcean", youtube: "YouTube", icloud: "iCloud", macos: "macOS", ios: "iOS" };
const capital = (w) => (LOWER.has(w) || w !== w.toLowerCase() ? w : w.charAt(0).toUpperCase() + w.slice(1));
const shortForm = (w) => UPPER.has(w.toLowerCase()) || (/^[a-z]{2,4}$/.test(w) && !/[aeiouy]/.test(w)); // "sdp", "crm": letters, no vowel
function labelOf(name) {
  const acct = String(name).match(EMAIL);
  let s = String(name);
  if (acct) s = s.replace(acct[0], "").replace(/\(\s*\)/g, "");
  s = s.replace(/\bwi[ _-]?fi\b/gi, "Wi-Fi").replace(/_+/g, " ").split(" ").map((w) => (/[A-Z]/.test(w) ? w : w.replace(/-+/g, " "))).join(" ").replace(/\s+/g, " ").trim() || String(name);
  const site = (w) => { const m = w.match(/^([a-z0-9]+)(\.[a-z.]{2,})$/i); return m && CASED[m[1].toLowerCase()] ? CASED[m[1].toLowerCase()] + m[2].toLowerCase() : ""; };
  const words = s.split(" ").map((w) => CASED[w.toLowerCase()] || site(w) || (shortForm(w) && !LOWER.has(w) ? w.toUpperCase() : w));
  words[0] = capital(words[0]);
  return words.join(" ");
}

// The service an entry belongs to, so a service's keys sit together ("Twilio": its account SID and
// auth token): a service it names, else the first word of its name, else "Other" for a name that
// says nothing ("token", "password").
const SERVICES = [[/\btwilio\b/i, "Twilio"], [/\bcloudflare\b|\bcf\b/i, "Cloudflare"], [/\bzoho\b/i, "Zoho"], [/\blemon ?squeezy\b/i, "Lemon Squeezy"], [/\bgithub\b|\bgh\b/i, "GitHub"], [/\bgitlab\b/i, "GitLab"], [/\bnpm\b/i, "npm"], [/\bgmail\b|\bgoogle\b/i, "Google"], [/\baws\b|\bamazon\b/i, "AWS"], [/\bstripe\b/i, "Stripe"], [/\bopenai\b/i, "OpenAI"], [/\banthropic\b/i, "Anthropic"], [/\btwitter\b/i, "X (Twitter)"], [/\blinkedin\b/i, "LinkedIn"], [/\bslack\b/i, "Slack"], [/\bwhatsapp\b/i, "WhatsApp"], [/\bfacebook\b|\bmeta\b/i, "Meta"], [/\binstagram\b/i, "Instagram"], [/\bsupabase\b/i, "Supabase"], [/\bvercel\b/i, "Vercel"], [/\bnetlify\b/i, "Netlify"], [/\bdigital ?ocean\b/i, "DigitalOcean"], [/\bfirebase\b/i, "Firebase"], [/\bmongo(?:db)?\b/i, "MongoDB"], [/\bmicrosoft\b|\bazure\b|\boutlook\b/i, "Microsoft"], [/\bapple\b|\bicloud\b/i, "Apple"], [/\bpaypal\b/i, "PayPal"], [/\bshopify\b/i, "Shopify"], [/\bnotion\b/i, "Notion"], [/\bdiscord\b/i, "Discord"], [/\btelegram\b/i, "Telegram"]];
const GENERIC = new Set(["password", "passwords", "pass", "pw", "token", "tokens", "secret", "secrets", "key", "keys", "api", "pin", "code", "codes", "test", "live", "my", "the", "a", "new", "old", "login", "account", "recovery", "backup"]);
function groupOf(name) {
  const n = String(name).replace(EMAIL, " ").replace(/[_-]+/g, " ");
  for (const [rx, g] of SERVICES) if (rx.test(n)) return g;
  const first = (n.trim().split(/\s+/)[0] || "").toLowerCase();
  if (!first || GENERIC.has(first) || /\.\w{2,4}$/.test(first) || first.length < 2) return "Other";
  return shortForm(first) ? first.toUpperCase() : capital(first);
}
// The name without its service, as it reads under the service's heading ("Twilio auth token" → "Auth token").
function shortOf(label, group) {
  if (group === "Other") return label;
  const words = group.toLowerCase().replace(/\s*\(.*\)$/, "").split(/\s+/), l = label.split(" ");
  let i = 0; while (i < words.length && i < l.length && l[i].toLowerCase().replace(/\.[a-z.]{2,}$/, "") === words[i]) i++;
  const rest = l.slice(i).join(" ").trim();
  return rest ? capital(rest.split(" ")[0]) + rest.slice(rest.split(" ")[0].length) : label;
}

// What needs a look, per name: { name: [{ kind, text, other? }] }. Values are compared here, on
// this computer, and only ever as a hash: "Same value as …" says no value.
const VAGUE = /^(?:token|password|pass|pw|secret|key|api ?key|code|pin|login|credentials?)s?$/i;
const FILEY = /\.(?:md|txt|json|csv|pdf|docx?|xlsx?|html?|ya?ml|env|log)\b/i;
function issuesOf(list, { peek = peekSecret } = {}) {
  const out = {}, add = (n, x) => { (out[n] = out[n] || []).push(x); };
  const seen = new Map();
  for (const s of list) {
    const bare = String(s.name).replace(EMAIL, "").replace(/[()]/g, "").replace(/[_-]+/g, " ").trim();
    if (VAGUE.test(bare)) add(s.name, { kind: "vague", text: "Its name doesn't say what it's for. Rename it, so you and your agents can find it." });
    if (FILEY.test(s.name)) add(s.name, { kind: "file", text: "It's named after a file, so it may not be a real password. Show it to check, and delete it if it isn't one." });
    if (s.count > 1 && s.count - (s.used || 0) <= 0) add(s.name, { kind: "spent", text: "Every code in it has been used. Delete it once you have new ones." });
    let e = null; try { e = peek(s.name); } catch {}
    for (const v of (e && Array.isArray(e.values) ? e.values : [])) {
      const h = createHash("sha256").update(String(v.v)).digest("hex");
      const o = seen.get(h);
      if (o && o !== s.name) {
        if (!(out[s.name] || []).some((x) => x.kind === "same" && x.other === o)) add(s.name, { kind: "same", other: o, text: `Same value as “${labelOf(o)}”. Keep one: delete the other.` });
        if (!(out[o] || []).some((x) => x.kind === "same" && x.other === s.name)) add(o, { kind: "same", other: s.name, text: `Same value as “${labelOf(s.name)}”. Keep one: delete the other.` });
      } else if (!o) seen.set(h, s.name);
    }
  }
  return out;
}

// The list: names and what's known, newest first. { entries, pin: set or not, unlocked until }
function vaultList({ token = "", now = Date.now(), peek = peekSecret } = {}) {
  const list = listSecrets(), issues = issuesOf(list, { peek });
  const entries = list.map((s) => {
    const label = labelOf(s.name), group = groupOf(s.name);
    return { name: s.name, label, group, short: shortOf(label, group), kind: kindOf(s.name), account: accountOf(s.name), saved: s.ts || 0, count: s.count || 0, left: s.left ?? s.count ?? 0, site: s.site || "", issues: issues[s.name] || [] };
  }).sort((a, b) => (b.saved || 0) - (a.saved || 0) || a.name.localeCompare(b.name));
  return { entries, ...lockState({ token, now }) };
}

// ---- the unlock gate ------------------------------------------------------------------
const SESSIONS = new Map(); // token -> until; in memory only, so a restart locks the vault
function lockState({ token = "", now = Date.now() } = {}) {
  const p = readPin(), until = SESSIONS.get(String(token)) || 0;
  return { pin: !!(p && p.hash), unlocked: until > now ? until : 0, wait: p && p.until > now ? p.until - now : 0, unlockMs: UNLOCK_MS };
}
// An unlock still running: it holds UNLOCK_MS from now (each use keeps it open), or 0.
function held(token, now = Date.now()) {
  const t = String(token || ""), until = SESSIONS.get(t) || 0;
  if (!(until > now)) return 0;
  SESSIONS.set(t, now + UNLOCK_MS); return now + UNLOCK_MS;
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
  return locked ? { error: `Too many wrong tries. Try again in ${LOCKOUT_MS / 60000} min.`, wait: LOCKOUT_MS } : { error: `That PIN isn't right. ${TRIES - fails} ${TRIES - fails === 1 ? "try" : "tries"} left before a ${LOCKOUT_MS / 60000}-minute wait.`, left: TRIES - fails };
}
// A fresh unlock: a token the page holds, good for UNLOCK_MS after its last use. Each unlock is a new one.
function unlock(pin, { now = Date.now() } = {}) {
  const c = check(pin, { now }); if (!c.ok) return c;
  for (const [t, u] of SESSIONS) if (u <= now) SESSIONS.delete(t);
  const token = randomBytes(24).toString("base64url"), until = now + UNLOCK_MS;
  SESSIONS.set(token, until);
  return { ok: true, token, until, unlockMs: UNLOCK_MS };
}
function lock(token) { SESSIONS.delete(String(token || "")); return { ok: true }; }
const LOCKED = { locked: true, error: "Unlock the vault to do that." };

// One entry's values, for an unlocked page only. act: "reveal" or "copy", logged either way.
function vaultValue(name, { token = "", act = "reveal", now = Date.now() } = {}) {
  const until = held(token, now); if (!until) return { ...LOCKED, error: "Unlock the vault to see this." };
  const e = peekSecret(String(name || "")); if (e.error) return { error: e.error };
  if (e.once && e.expires && now > e.expires) return { error: "This code ran out of time." };
  note(e.name, act === "copy" ? "copy" : "reveal", now);
  return { ok: true, name: e.name, values: e.values, until };
}

// ---- keeping it tidy: add, rename, delete (unlocked only, each logged without its value) ----
const cleanName = (n) => String(n || "").replace(/\s+/g, " ").trim().slice(0, 80);
// A name from what the user typed: what it's for, and the account it's for, in brackets as agents read it.
const nameFrom = (label, account = "") => { const l = cleanName(label), a = cleanName(account); return a && !l.includes(a) ? `${l} (${a})`.slice(0, 80) : l; };
// site: the website it fills on ("Fills only on"), when the user gives one; it can be changed or cleared later (renameEntry).
function addEntry({ label = "", account = "", values = [], site = "", token = "", now = Date.now() } = {}) {
  const until = held(token, now); if (!until) return LOCKED;
  const name = nameFrom(label, account); if (!name) return { error: "Say what it's for: that's its name." };
  const vals = [].concat(values).map((v) => String(v || "").trim()).filter(Boolean);
  if (!vals.length) return { error: "Paste the password, key or codes to keep." };
  if (listSecrets().some((s) => s.name.toLowerCase() === name.toLowerCase())) return { error: `There's already one called “${labelOf(name)}”. Open that one, or give this a different name.` };
  if (String(site || "").trim() && !fillSite(site)) return { error: "That isn't a website. Type its address, like example.com, or leave it empty." };
  const r = saveSecret(name, vals, { site }); if (r.error) return r;
  note(name, "add", now, r.site ? { site: r.site } : {});
  return { ok: true, name, count: r.count, ...(r.site ? { site: r.site } : {}), until };
}
// Edit: its name and account, and (site given, "" to clear) the website it fills on, as 1Password and Bitwarden let you
// edit an item's website. The site was set once and never moved, so a wrong one meant deleting the entry (26 Oct 2026).
function renameEntry(name, { label = "", account = "", site, token = "", now = Date.now() } = {}) {
  const until = held(token, now); if (!until) return LOCKED;
  // the form shows a tidied label ("GitHub recovery codes" for "github recovery codes"): saved as it was shown, that's
  // the same name, kept as it is, so an Edit that only changes the website doesn't rename what agents ask for
  const typed = nameFrom(label, account), to = typed.toLowerCase() === String(name || "").toLowerCase() || typed === nameFrom(labelOf(name), accountOf(name)) ? String(name || "") : typed; if (!to) return { error: "Give it a name." };
  if (to !== name && listSecrets().some((s) => s.name !== name && s.name.toLowerCase() === to.toLowerCase())) return { error: `There's already one called “${labelOf(to)}”.` };
  if (site !== undefined && String(site || "").trim() && !fillSite(site)) return { error: "That isn't a website. Type its address, like example.com, or leave it empty." };
  const r = renameSecret(String(name || ""), to); if (r.error) return r;
  if (r.name !== name) note(r.name, "rename", now, { from: name });
  if (site !== undefined) {
    const was = (listSecrets().find((s) => s.name === r.name) || {}).site || "", want = String(site || "").trim() ? fillSite(site) : "";
    if (want !== was) { const m = setSite(r.name, want); if (m.error) return m; note(r.name, "site", now, want ? { site: want } : {}); }
  }
  return { ok: true, name: r.name, until };
}
function removeEntry(name, { token = "", now = Date.now() } = {}) {
  const until = held(token, now); if (!until) return LOCKED;
  const r = deleteSecret(String(name || "")); if (r.error) return r;
  note(name, "delete", now);
  return { ok: true, until };
}

// ---- the log: who looked at or changed what, on this computer --------------------------------
function note(name, act, at = Date.now(), extra = {}) {
  const log = readState(LOG_FILE(), Array.isArray) || [];
  log.push({ at, name: String(name).slice(0, 80), act, ...(extra.from ? { from: String(extra.from).slice(0, 80) } : {}), ...(extra.site ? { site: String(extra.site).slice(0, 80) } : {}) });
  try { writeJsonAtomic(LOG_FILE(), log.slice(-LOG_KEEP), { mode: 0o600 }); } catch {}
}
// What an agent did with one, without its value (a saved sign-in filled in the user's own Chrome, ownchrome.mjs).
const noteUse = (name, act, extra = {}) => note(name, act, Date.now(), extra);
const vaultLog = (n = 30) => (readState(LOG_FILE(), Array.isArray) || []).slice(-n).reverse().map((x) => ({ ...x, label: labelOf(x.name) }));

// Forgot the PIN: `symbiot secret pin-reset` in a terminal (someone at your own terminal can read the vault anyway).
function resetPin() { const had = !!(readPin() || {}).hash; try { writePin({ v: 1, reset: Date.now() }); } catch { return { error: "Couldn't reset it." }; } SESSIONS.clear(); return { ok: true, had }; }

export { noteUse, vaultList, vaultValue, vaultLog, setPin, unlock, lock, lockState, resetPin, addEntry, renameEntry, removeEntry, kindOf, accountOf, labelOf, groupOf, shortOf, issuesOf, nameFrom, UNLOCK_MS, TRIES, LOCKOUT_MS, PIN_MIN };
