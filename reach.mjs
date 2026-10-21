// symbiot — Reach: what each lane can and can't get to, for the brief another lane
// reads before it hands work over (handover.mjs handoverRules). On 13 Oct 2026 ops
// handed the bookly lane a change to the live server's .env as "your lane", but a
// repo run is sandboxed and reaches no server, so the job went back and forth
// until the handover guard (lanes.mjs MAX_CHAIN) stopped it, an hour lost.
// - Servers: the hosts this computer connects to (~/.ssh/config). Ops runs on this
//   computer, outside any sandbox, so it reaches them. A repo run's sandbox has no
//   way out to another machine (no network but its filtering proxy, ~/.ssh hidden),
//   so with the sandbox on a repo lane reaches none; with it off, the same as ops.
// - Keys: the providers a lane's own .env files hold keys for (names, never values).
//   The live server's .env is on the server: only a lane that reaches it can change it.
// - Sites: the web pages Symbiot's signed-in browser has mapped (Meta's WhatsApp Manager,
//   Twilio, SMS Portal…). `symbiot screens` reaches them from a sandboxed run too (it asks
//   the app, or runs through the sandbox's proxy), so EVERY lane reads them: the bookly
//   lane said "this lane can't reach Meta or Twilio" without trying it (16 Oct 2026).
// - APIs: a linked site whose own API a lane's key opens (SMSPORTAL for cp.smsportal.com).
//   Some sites end a browser sign-in by themselves: SMS Portal logs out after about an hour
//   unused ("You have been logged out due to inactivity"), so every check found it signed
//   out and the user was asked to sign in every few days (16 Oct 2026). Its key never runs out.
// { sandboxed, hosts: [alias], keys: { lane: [provider] }, sites: [hostname], apis: [{ host, lane, provider }] }
import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { loadConfig } from "./core.mjs";
import { listSecrets } from "./vault.mjs";
import { loadScreens } from "./screens.mjs";
import { handoffCmd, sandboxNeeds, trustFull, isClaudeCmd } from "./agents.mjs";

const readOr = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
// The hosts in an ssh config (`Host a b`, `HostName x`): aliases, then the names
// they stand for, wildcards left out. The app reads it; a sandboxed run can't.
function sshHosts(text) {
  const out = new Set();
  for (const raw of String(text || "").split(/\r?\n/)) {
    const m = raw.trim().match(/^(HostName|Host)(?:\s*=\s*|\s+)(.+)$/i); if (!m) continue;
    for (const h of m[2].split(/\s+/)) if (h && !/[*?!]/.test(h) && h.length >= 3) out.add(h);
  }
  return [...out].slice(0, 20);
}
// The providers an .env holds keys for: GOOGLE_CLIENT_SECRET and TWILIO_AUTH_TOKEN
// give GOOGLE and TWILIO. Framework prefixes (NEXT_PUBLIC_, VITE_…) and words that
// name no provider (API_KEY, JWT_SECRET, DB_PASSWORD) are left out.
const SECRET = /(KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|SID|AUTH|CREDENTIALS?)$/;
const FRAMEWORK = /^(NEXT_PUBLIC|VITE|REACT_APP|EXPO_PUBLIC|NUXT_PUBLIC|PUBLIC)_/;
const GENERIC = new Set(["API", "APP", "AUTH", "SECRET", "JWT", "DB", "DATABASE", "SESSION", "NEXTAUTH", "ENCRYPTION", "PRIVATE", "ACCESS", "ADMIN", "MASTER", "SIGNING", "COOKIE", "CSRF", "WEBHOOK", "CLIENT", "SERVER", "PASSWORD", "TOKEN", "KEY", "USER", "SMTP", "MAIL", "EMAIL", "REDIS", "POSTGRES", "MYSQL", "MONGO", "MONGODB", "LLM", "AI", "AGENT", "BETTER", "INTERNAL", "SERVICE", "SYSTEM", "HMAC", "VERIFY", "SHARED", "LOCAL", "PROD", "DEV", "TEST"]);
function envProviders(text) {
  const out = new Set();
  for (const raw of String(text || "").split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/); if (!m) continue;
    const name = m[1].toUpperCase().replace(FRAMEWORK, ""); if (!SECRET.test(name)) continue;
    const p = name.split("_")[0]; if (p && name.includes("_") && !GENERIC.has(p) && p.length >= 2) out.add(p);
  }
  return [...out];
}
const ENV_FILES = [".env", ".env.local", ".env.production"];
function laneKeys(path, read = readOr) { return [...new Set(ENV_FILES.flatMap((f) => envProviders(read(join(path, f)))))].slice(0, 6); }
// Whether a repo run is sandboxed: runHandoff sandboxes it when the agent is Claude
// Code, trusted to work alone, the sandbox isn't turned off and it can run here.
function reposSandboxed({ cfg = loadConfig(), cmd = handoffCmd(), needs = sandboxNeeds } = {}) {
  return isClaudeCmd(cmd) && trustFull(cfg) && cfg.agentSandbox !== false && needs().ready;
}
// map: { lane: path }, the repo lanes (scan.mjs laneMap).
function mappedSites(list) {
  const n = new Map();
  for (const s of Array.isArray(list) ? list : []) { let h = ""; try { h = new URL(String(s && s.page && s.page.url)).hostname.replace(/^www\./, ""); } catch {} if (h && !/^(localhost|127\.|\[)/.test(h)) n.set(h, (n.get(h) || 0) + 1); }
  return [...n].sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 10);
}
// The user's linked sites (Settings → Connections, config.sites): their hostnames.
function linkedHosts(cfg = loadConfig()) {
  return [...new Set((Array.isArray(cfg && cfg.sites) ? cfg.sites : []).flatMap((x) => [].concat((x && x.hosts) || [])).map((h) => String(h).toLowerCase().replace(/^www\./, "")).filter(Boolean))];
}
// A site whose own API a lane's key opens: a provider named by one of the host's labels
// (SMSPORTAL: cp.smsportal.com, TWILIO: console.twilio.com). Not a company whose domain
// holds many products: a GOOGLE maps key opens neither Gmail nor the Cloud console.
const BROAD = new Set(["GOOGLE", "MICROSOFT", "META", "FACEBOOK", "AMAZON", "APPLE", "LIVE", "OFFICE"]);
function keyedSites(keys = {}, hosts = []) {
  const out = [];
  for (const host of [...new Set(hosts)]) {
    const labels = host.toLowerCase().split(".").slice(0, -1);
    for (const [lane, provs] of Object.entries(keys || {})) for (const p of provs || []) {
      if (p.length < 4 || BROAD.has(p) || !labels.includes(p.toLowerCase())) continue;
      if (!out.some((x) => x.host === host && x.lane === lane)) out.push({ host, lane, provider: p });
    }
  }
  return out.slice(0, 12);
}
// The keys the user already handed over, by name only (vault.mjs listSecrets): a site's API key
// in the vault opened nothing in the brief, so agents asked for it again ("i gave my api key to
// symbiot but it keeps asking me for it", 20 Oct 2026). A one-use code, or one all used up, isn't
// a key. Each with its provider word, the name's first ("cloudflare api token" -> CLOUDFLARE).
const KEYISH = /\b(?:api|key|keys|token|tokens|secret|sid|credentials?)\b/i;
function vaultKeys(list = listSecrets()) {
  return (Array.isArray(list) ? list : []).filter((x) => x && x.name && x.left > 0 && KEYISH.test(x.name) && !/\bcode\b/i.test(x.name))
    .map((x) => ({ name: x.name, provider: String(x.name).split(/[^A-Za-z0-9]+/).find(Boolean).toUpperCase() })).slice(0, 20);
}
function laneReach(map = {}, { sandboxed = reposSandboxed(), ssh = readOr(join(homedir(), ".ssh", "config")), read = readOr, screens = () => loadScreens(), linked = () => linkedHosts(), vault = () => vaultKeys() } = {}) {
  const keys = {};
  for (const [lane, path] of Object.entries(map || {})) { if (!path) continue; const k = laneKeys(path, read); if (k.length) keys[lane] = k; }
  let sites = []; try { sites = mappedSites(screens()); } catch {}
  let own = []; try { own = linked(); } catch {}
  let held = []; try { held = vault(); } catch {}
  // a site the vault's key opens: through ops, which reads the vault (a sandboxed lane can't)
  const vaultApis = keyedSites({ vault: held.map((v) => v.provider) }, [...sites, ...own]).map((a) => ({ ...a, name: (held.find((v) => v.provider === a.provider) || {}).name }));
  return { sandboxed: !!sandboxed, hosts: sshHosts(ssh), keys, sites, apis: keyedSites(keys, [...sites, ...own]), vault: held.map((v) => v.name), vaultApis };
}
// The servers a handover names that the lane it goes to can't reach: [] for ops, or
// with the sandbox off.
function unreachable(text, lane, reach) {
  if (!reach || !reach.sandboxed || String(lane).toLowerCase() === "ops") return [];
  const t = String(text || "");
  return (reach.hosts || []).filter((h) => new RegExp(`(?<![\\w.-])${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i").test(t));
}
// A job that's all on a server the lane can't reach, with no code in it for the lane to
// write (put it live on prod-box, a restart, a status check there): the servers, so Symbiot
// sends it to ops itself, or []. "Put the bookly fix live on prod-box" went to the bookly
// lane, which could only hand it on, and that handover errored: the job stalled (16 Oct 2026).
const SERVER_WORK = /\b(deploy\w*|restart\w*|reload\w*|live|status|logs?|check\w*|read[- ]only|ssh|server|pm2|systemctl|docker|nginx|migrat\w*)\b|\.env\b/i;
const CODE_WORK = /\b(code|commit\w*|branch\w*|pull request|PR|refactor\w*|implement\w*|tests?|bug\w*|patch\w*|repo|function|component|endpoint)\b/i;
function serverOnly(text, lane, reach) {
  const far = unreachable(text, lane, reach), t = String(text || "");
  return far.length && SERVER_WORK.test(t) && !CODE_WORK.test(t) ? far : [];
}

export { vaultKeys, mappedSites, laneReach, keyedSites, linkedHosts, sshHosts, envProviders, laneKeys, reposSandboxed, unreachable, serverOnly };
