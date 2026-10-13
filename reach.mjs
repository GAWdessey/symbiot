// symbiot — Reach: what each lane can and can't get to, for the brief another lane
// reads before it hands work over (handover.mjs handoverRules). On 13 Oct 2026 ops
// handed the dailify lane a change to the live server's .env as "your lane", but a
// repo run is sandboxed and reaches no server, so the job went back and forth
// until the handover guard (lanes.mjs MAX_CHAIN) stopped it, an hour lost.
// - Servers: the hosts this computer connects to (~/.ssh/config). Ops runs on this
//   computer, outside any sandbox, so it reaches them. A repo run's sandbox has no
//   way out to another machine (no network but its filtering proxy, ~/.ssh hidden),
//   so with the sandbox on a repo lane reaches none; with it off, the same as ops.
// - Keys: the providers a lane's own .env files hold keys for (names, never values).
//   The live server's .env is on the server: only a lane that reaches it can change it.
// { sandboxed, hosts: [alias], keys: { lane: [provider] } }
import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { loadConfig } from "./core.mjs";
import { handoffCmd, sandboxNeeds, trustFull } from "./agents.mjs";

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
  return /^\s*claude\b/.test(String(cmd || "")) && trustFull(cfg) && cfg.agentSandbox !== false && needs().ready;
}
// map: { lane: path }, the repo lanes (scan.mjs laneMap).
function laneReach(map = {}, { sandboxed = reposSandboxed(), ssh = readOr(join(homedir(), ".ssh", "config")), read = readOr } = {}) {
  const keys = {};
  for (const [lane, path] of Object.entries(map || {})) { if (!path) continue; const k = laneKeys(path, read); if (k.length) keys[lane] = k; }
  return { sandboxed: !!sandboxed, hosts: sshHosts(ssh), keys };
}
// The servers a handover names that the lane it goes to can't reach: [] for ops, or
// with the sandbox off.
function unreachable(text, lane, reach) {
  if (!reach || !reach.sandboxed || String(lane).toLowerCase() === "ops") return [];
  const t = String(text || "");
  return (reach.hosts || []).filter((h) => new RegExp(`(?<![\\w.-])${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i").test(t));
}

export { laneReach, sshHosts, envProviders, laneKeys, reposSandboxed, unreachable };
