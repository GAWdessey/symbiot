// symbiot — Symbiot Free and Symbiot Pro.
//
// Free: the orb and Home, the week, standups, voice, the Away screen, one agent at a
// time, up to 3 projects and one connected inbox. Pro: any number of agents at once,
// every project, every inbox and chat, the marketing lane and Approve-and-ship.
//
// A Pro key is a few lines of text signed by Ghost AI's private key (Ed25519); every
// copy of Symbiot carries the public key below and checks keys offline: no account,
// no server. Keys can carry an end date; a key that's been cancelled is listed at
// symbiot.co.za/licences/revoked.json, which Symbiot reads about once a day (missing
// it changes nothing). Everyone gets a 14-day Pro trial, from the first time this
// version runs. Nothing already running is ever stopped: a limit only stops the next
// thing from starting, with a line saying why and what Pro adds.
//
// Symbiot never works on its own code (its repo, a fork of it, or its installed
// files), so it can't be asked to take its own limits out; Ghost AI's owner key is
// the exception. This is part of the licence (Elastic License 2.0: no getting round
// the licence key).
//
// SYMBIOT_LICENCE_PUBLIC_KEY replaces the public key (tests sign with their own).
import { createPublicKey, verify as edVerify } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { CONFIG_DIR, loadConfig, saveConfig } from "./core.mjs";

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGLISPmrOCX+t/KVY/u99rmFhjbXFbvRCGw1tStG1t8A=
-----END PUBLIC KEY-----`;
const REVOKED_URL = "https://symbiot.co.za/licences/revoked.json";
const TRIAL_DAYS = 14, GRACE_DAYS = 7, DAY = 86400000;
const FREE = { agents: 1, projects: 3, inboxes: 1 };
const PRICE = "US$12 a month or US$99 a year";
const UPGRADE_URL = "https://symbiot.co.za/#pro";

const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
const pubKey = () => createPublicKey(process.env.SYMBIOT_LICENCE_PUBLIC_KEY || PUBLIC_KEY);

// "SYM1-<payload>.<signature>", whitespace and line breaks ignored (keys get pasted from mail).
function readKey(text) {
  const t = String(text || "").replace(/\s+/g, "");
  const m = /^SYM1-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(t);
  if (!m) return { ok: false, why: "That isn't a Symbiot key. It starts with SYM1-." };
  let p;
  try {
    if (!edVerify(null, Buffer.from(m[1]), pubKey(), unb64u(m[2]))) return { ok: false, why: "That key wasn't issued by Ghost AI (its signature doesn't match)." };
    p = JSON.parse(unb64u(m[1]).toString("utf8"));
  } catch { return { ok: false, why: "That key is damaged. Copy it again, all of it." }; }
  if (!p || p.v !== 1 || !["pro", "owner"].includes(p.p) || !p.id) return { ok: false, why: "That key is for something this version of Symbiot doesn't know." };
  return { ok: true, key: t, id: String(p.id), plan: p.p, email: String(p.e || ""), name: String(p.n || ""), issued: Number(p.i) || 0, expires: Number(p.x) || 0 };
}

// Cancelled keys, from symbiot.co.za, refreshed at most once a day; a failed fetch keeps the last list.
const REVOKED_FILE = () => join(CONFIG_DIR, "licence-revoked.json");
function revokedIds() { try { return new Set(JSON.parse(readFileSync(REVOKED_FILE(), "utf8")).ids || []); } catch { return new Set(); } }
async function refreshRevoked(now = Date.now()) {
  try {
    const cur = existsSync(REVOKED_FILE()) ? JSON.parse(readFileSync(REVOKED_FILE(), "utf8")) : {};
    if (cur.at && now - cur.at < DAY) return false;
    const r = await fetch(process.env.SYMBIOT_REVOKED_URL || REVOKED_URL, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return false;
    const j = await r.json();
    writeFileSync(REVOKED_FILE(), JSON.stringify({ at: now, ids: Array.isArray(j.ids) ? j.ids.map(String) : [] }));
    return true;
  } catch { return false; }
}

// Where you stand: { plan: "pro" | "owner" | "trial" | "free", ... }. Starts the trial clock on first sight.
function licenceState(now = Date.now(), cfg = loadConfig()) {
  const L = cfg.licence || {};
  if (!L.trialStart) { L.trialStart = now; cfg.licence = L; try { saveConfig(cfg); } catch {} }
  const base = { limits: FREE, price: PRICE, upgrade: UPGRADE_URL };
  if (L.key) {
    const k = readKey(L.key);
    if (k.ok && revokedIds().has(k.id)) return { ...base, plan: "free", keyProblem: "This key has been cancelled. If that's a mistake, reply to the email it came in." };
    if (k.ok) {
      const left = k.expires ? k.expires - now : Infinity;
      const who = { email: k.email, name: k.name, keyId: k.id, ...(k.expires ? { expires: k.expires } : {}) };
      if (left > 0) return { ...base, plan: k.plan, ...who, ...(left < 14 * DAY ? { renewSoon: Math.ceil(left / DAY) } : {}) };
      if (left > -GRACE_DAYS * DAY) return { ...base, plan: k.plan, ...who, grace: Math.ceil((left + GRACE_DAYS * DAY) / DAY) };
      return { ...base, plan: "free", ...who, keyProblem: "Your Pro key has ended. Renew it to keep Pro." };
    }
    return { ...base, plan: "free", keyProblem: k.why };
  }
  const trialLeft = L.trialStart + TRIAL_DAYS * DAY - now;
  if (trialLeft > 0) return { ...base, plan: "trial", trialDaysLeft: Math.ceil(trialLeft / DAY) };
  return { ...base, plan: "free", trialEnded: true };
}
const isPro = (st = licenceState()) => st.plan === "pro" || st.plan === "owner" || st.plan === "trial";

function setKey(text) {
  const k = readKey(text);
  if (!k.ok) return { error: k.why };
  if (revokedIds().has(k.id)) return { error: "This key has been cancelled." };
  const cfg = loadConfig(); cfg.licence = { ...(cfg.licence || {}), key: k.key }; saveConfig(cfg);
  return licenceState();
}
function clearKey() { const cfg = loadConfig(); if (cfg.licence) { delete cfg.licence.key; saveConfig(cfg); } return licenceState(); }

// What Free stops, and how it says so. ctx: { running } agents now, { count } projects/inboxes now.
const WHY = {
  agents: (n) => `Symbiot Free runs one agent at a time, and one is at work. This one starts when it's done, or Pro runs as many as you like at once (${PRICE}).`,
  projects: () => `Symbiot Free works in ${FREE.projects} projects. Pro works in all of them (${PRICE}).`,
  inboxes: () => `Symbiot Free connects one inbox or chat. Pro connects all of them: every mail account, WhatsApp, LinkedIn and your calendars (${PRICE}).`,
  marketing: () => `The marketing lane is part of Symbiot Pro (${PRICE}).`,
  ship: () => `Approve-and-ship (Symbiot opening the pull request and shipping it) is part of Symbiot Pro (${PRICE}). Your agent's changes are kept on their branch either way.`,
};
function can(feature, ctx = {}, st = licenceState()) {
  if (isPro(st)) return { ok: true };
  const n = Number(ctx.count ?? ctx.running ?? 0);
  if (feature === "agents" && n < FREE.agents) return { ok: true };
  if (feature === "projects" && n < FREE.projects) return { ok: true };
  if (feature === "inboxes" && n < FREE.inboxes) return { ok: true };
  if (!WHY[feature]) return { ok: true };
  return { ok: false, pro: true, feature, why: WHY[feature](n), upgrade: UPGRADE_URL };
}

// ---- Symbiot never works on its own code -------------------------------------
const HERE = (() => { try { return realpathSync(dirname(fileURLToPath(import.meta.url))); } catch { return dirname(fileURLToPath(import.meta.url)); } })();
const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
const inside = (p, root) => { const a = real(p), b = real(root); return a === b || a.startsWith(b + sep); };
// Its repo or a fork (whatever it's renamed to), or the copy of Symbiot that's installed.
function isSymbiotCode(dir) {
  if (!dir) return false;
  const d = real(dir);
  if (inside(d, HERE)) return true;
  let top = d;
  try { const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: d, encoding: "utf8", timeout: 5000, windowsHide: true }); if (r.status === 0 && r.stdout.trim()) top = r.stdout.trim(); } catch {}
  try { const pj = JSON.parse(readFileSync(join(top, "package.json"), "utf8")); if (pj.name === "symbiot" || pj.name === "symbiot-desktop") return true; } catch {}
  const has = (f) => existsSync(join(top, f));
  if (has("licence.mjs") && has("ui.mjs") && has("server.mjs")) return true;
  try { if (/EMBEDDED_UI/.test(readFileSync(join(top, "ui.mjs"), "utf8"))) return true; } catch {}
  try { const r = spawnSync("git", ["remote", "-v"], { cwd: top, encoding: "utf8", timeout: 5000, windowsHide: true }); if (/[/:]symbiot(\.git)?\s/i.test(r.stdout || "")) return true; } catch {}
  return false;
}
const SELF_WHY = "Symbiot doesn't work on its own code (Symbiot's repo, a copy of it, or its installed files). That keeps its licence and its safety rules from being edited away.";
function canWorkIn(dir, st = licenceState()) {
  if (!isSymbiotCode(dir)) return { ok: true };
  if (st.plan === "owner") return { ok: true };
  return { ok: false, self: true, why: SELF_WHY };
}

export { readKey, licenceState, isPro, setKey, clearKey, can, refreshRevoked, isSymbiotCode, canWorkIn, FREE, PRICE, TRIAL_DAYS, SELF_WHY, HERE as SYMBIOT_HOME };
