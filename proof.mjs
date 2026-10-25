// A card that asks for a step is checked against the real thing before it's kept: "Run the deploy as root",
// "Restart Steve" stayed on Needs you for hours after the work was done (24 Oct 2026), because only the
// agent's own words said it wasn't. Each such card carries a proof, a command that only reads, and when
// it passes the card is answered "Done" by Symbiot (home.mjs homeAnswer) with what it found.
// A proof is the card writer's { cmd, expect } (needs.mjs), or one read off a command the card gives:
// `ssh host 'sudo systemctl restart X'` is proved by X running, and, for a restart, started after the ask.
import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";

const FILE = () => join(CONFIG_DIR, "proofs-done.json");
const TIMEOUT = 8000, EVERY = 90000, KEEP = 100;

// ---- reading a command ---------------------------------------------------------------------
// Words, as a shell would split them, honouring '…' and "…". null when a quote never closes.
function shellWords(s) {
  const out = []; let cur = "", q = "", has = false;
  for (const c of String(s || "").trim()) {
    if (q) { if (c === q) q = ""; else cur += c; continue; }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    if (/\s/.test(c)) { if (has || cur) out.push(cur); cur = ""; has = false; continue; }
    cur += c; has = true;
  }
  if (q) return null;
  if (has || cur) out.push(cur);
  return out;
}
// ssh options that take a value; the rest (-t, -tt, -4, -A, -q, -v) don't, and none of them matter to a read.
const SSH_VAL = new Set(["-i", "-p", "-l", "-o", "-F", "-J", "-L", "-R", "-D", "-b", "-c", "-E", "-e", "-m", "-O", "-S", "-w", "-W"]);
// { opts: [..the sign-in options, without -t..], target, remote } from `ssh [opts] host 'command'`, or null.
function parseSsh(cmd) {
  const w = shellWords(cmd); if (!w || w[0] !== "ssh") return null;
  const opts = []; let i = 1;
  for (; i < w.length; i++) {
    const a = w[i];
    if (!a.startsWith("-")) break;
    if (SSH_VAL.has(a)) { opts.push(a, w[++i] || ""); continue; }
    if (/^-[tTNnfsxXyY]+$/.test(a)) continue; // a terminal, no command… nothing a read needs
    opts.push(a);
  }
  const target = w[i]; if (!target) return null;
  return { opts, target, remote: w.slice(i + 1).join(" ") };
}

// ---- a proof that only reads ---------------------------------------------------------------
const READ_OK = new Set(["test", "[", "ls", "stat", "cat", "head", "tail", "wc", "grep", "egrep", "md5sum", "sha256sum", "sha1sum", "cmp", "diff", "pgrep", "date", "uname", "df", "free", "uptime", "hostname", "whoami", "echo", "true", "readlink", "realpath", "find", "ps", "sort", "uniq", "cut", "tr", "basename", "dirname"]);
const SYSTEMCTL_READ = /^(?:is-active|is-enabled|is-failed|show|status|cat|list-units|list-unit-files)$/;
const GIT_READ = /^(?:status|log|rev-parse|diff|show|describe|branch|ls-files|ls-remote|remote)$/;
// One simple command: its first word reads and nothing else (no sudo, rm, redirect, subshell, find -delete…).
function readsOnly(simple) {
  const w = shellWords(simple); if (!w || !w.length) return false;
  let i = 0; while (/^[A-Za-z_]\w*=/.test(w[i] || "")) i++;
  const cmd = w[i]; if (!cmd) return false;
  if (cmd === "systemctl") { const sub = w.slice(i + 1).find((x) => !x.startsWith("-")); return !!sub && SYSTEMCTL_READ.test(sub); }
  if (cmd === "journalctl") return !w.some((x) => /^--(?:vacuum|rotate|flush|setup-keys|relinquish)/.test(x));
  if (cmd === "git") { const a = w.slice(i + 1), sub = a.find((x, k) => !x.startsWith("-") && a[k - 1] !== "-C"); return !!sub && GIT_READ.test(sub); }
  if (cmd === "find") return !w.some((x) => /^-(?:delete|exec|execdir|ok|okdir|fprint\w*)$/.test(x));
  return READ_OK.has(cmd);
}
// A command the card writer gave, safe to run unasked: [ssh opts host '] simple commands joined by && ; | [']. null if not.
function readOnly(cmd) {
  const c = String(cmd || "").trim(); if (!c || c.length > 500 || /[\n\r`<>]|\$\(|\$\{|\|\||(?<!&)&(?!&)/.test(c.replace(/'[^']*'|"[^"]*"/g, (m) => m.replace(/[<>`$&|;]/g, "_")))) return null;
  const ssh = parseSsh(c), inner = ssh ? ssh.remote : c;
  if (ssh && /(?:^|\s)-[oOWRLDw]\s*(?:ProxyCommand|LocalCommand|PermitLocalCommand)|ProxyCommand|LocalCommand/i.test(c)) return null;
  const parts = inner.split(/&&|;|\|/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length || parts.length > 5 || !parts.every(readsOnly)) return null;
  return ssh ? { ssh, inner } : { ssh: null, inner };
}

// ---- the proof of a card -------------------------------------------------------------------
// { cmd, expect: RegExp source, since?: ms } … `since` is for a restart: it's proved only by a start after the ask.
// A command in the card that starts or restarts a service (here or over ssh) is proved by that service running.
const SERVICE = /\bsystemctl\s+(?:--user\s+)?(start|restart|reload-or-restart|try-restart)\s+((?:--\S+\s+)*)([A-Za-z0-9@._-]+)/;
function derive(y) {
  const asked = Number(y && y.asked) || 0;
  for (const r of (y && y.run) || []) {
    const cmd = String((r && r.cmd) || ""), m = cmd.match(SERVICE); if (!m) continue;
    const unit = m[3], restart = m[1] !== "start", ssh = parseSsh(cmd);
    if (restart && !asked) continue; // "restart" with no time to measure from: running isn't proof
    const probe = restart ? `systemctl is-active ${unit}; ps -o etimes= -p $(systemctl show -p MainPID --value ${unit})` : `systemctl is-active ${unit}`;
    const full = ssh ? ["ssh", ...ssh.opts.map(quote), ssh.target, quote(probe)].join(" ") : probe;
    return { cmd: full, unit, expect: restart ? "^active\\s+\\d+\\s*$" : "^active\\s*$", ...(restart ? { since: asked } : {}), derived: true };
  }
  return null;
}
const quote = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, "'\\''")}'`);
// The card writer's proof (needs.mjs checkProof) first, else what its commands say.
const proofOf = (y) => {
  if (!y || y.kind !== "ask" || !String(y.id || "").startsWith("needs:") || y.ok) return null; // a go-ahead is theirs to give
  if (y.proof && y.proof.cmd && readOnly(y.proof.cmd)) return { cmd: y.proof.cmd, expect: y.proof.expect || "" };
  return derive(y);
};

// ---- running it ----------------------------------------------------------------------------
// Private keys Symbiot may try for a host that signs in with a key the card's command didn't name:
// the ones with a .pub beside them, a few. BatchMode: never a prompt, never a password.
function keys() {
  try { const d = join(homedir(), ".ssh"), all = readdirSync(d); return all.filter((f) => f.endsWith(".pub") && all.includes(f.slice(0, -4))).map((f) => join(d, f.slice(0, -4))).slice(0, 6); } catch { return []; }
}
const run1 = (file, args, timeout = TIMEOUT) => new Promise((res) => {
  try { execFile(file, args, { timeout, maxBuffer: 1 << 16, env: { ...process.env, LC_ALL: "C" } }, (e, out, err) => res({ code: e ? (typeof e.code === "number" ? e.code : 1) : 0, out: String(out || "").trim(), err: String(err || "").trim() })); } catch { res({ code: 1, out: "", err: "" }); }
});
const goodKey = new Map(); // target → the key that worked
async function exec(cmd) {
  const ssh = parseSsh(cmd);
  if (!ssh) return run1("sh", ["-c", cmd]);
  const base = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=6", "-o", "StrictHostKeyChecking=accept-new", ...ssh.opts], named = ssh.opts.includes("-i");
  const tries = named ? [[]] : [...(goodKey.has(ssh.target) ? [[ "-i", goodKey.get(ssh.target), "-o", "IdentitiesOnly=yes" ]] : []), [], ...keys().map((k) => ["-i", k, "-o", "IdentitiesOnly=yes"])];
  let last = { code: 255, out: "", err: "" };
  for (const t of tries) {
    last = await run1("ssh", [...base, ...t, ssh.target, ssh.remote]);
    if (last.code !== 255) { const i = t.indexOf("-i"); if (i >= 0) goodKey.set(ssh.target, t[i + 1]); return last; } // 255: it couldn't sign in or reach it
  }
  return last;
}
// Passed when the command ran and its output matches `expect`. `since`: the card was asked at that time and the
// output's last number is how many seconds the thing has run, so it must be younger than the ask is old.
function passes(p, r, now) {
  if (!r || r.code !== 0 || !r.out) return false;
  let ok; try { ok = new RegExp(p.expect || ".", "m").test(r.out); } catch { return false; }
  if (!ok) return false;
  if (p.since) { const n = Number((r.out.match(/(\d+)\s*$/) || [])[1]); if (!Number.isFinite(n) || now - n * 1000 < p.since) return false; }
  return true;
}

// ---- settling ------------------------------------------------------------------------------
const seen = new Map(); // card id → { at, ok }
function log(entry) {
  const l = (readState(FILE(), Array.isArray) || []).concat(entry).slice(-KEEP);
  try { writeJsonAtomic(FILE(), l, { indent: 1, mode: 0o600 }); } catch {}
}
// Cards whose proof passes are answered "Done". answer(id, { text }) → { ok } | { error }; run: exec's stand-in (tests).
// Returns [{ id, name, found }] for those it closed.
async function settleDone(cards, { answer, run = exec, now = Date.now(), force = false } = {}) {
  const closed = [];
  for (const y of cards || []) {
    const p = proofOf(y); if (!p) continue;
    const s = seen.get(y.id); if (!force && s && now - s.at < EVERY) continue;
    const r = await run(p.cmd); seen.set(y.id, { at: now, ok: passes(p, r, now) });
    if (!passes(p, r, now)) continue;
    const found = String(r.out).split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(", ").slice(0, 120);
    const a = typeof answer === "function" ? await answer(y.id, { text: `Done: Symbiot checked, ${found}` }) : null;
    if (a && !a.error) { closed.push({ id: y.id, name: y.name || "", found }); log({ at: now, id: y.id, name: y.name || "", q: String(y.raw || y.q || "").slice(0, 160), proof: p.cmd, found }); }
  }
  return closed;
}

export { shellWords, parseSsh, readOnly, derive, proofOf, passes, settleDone, exec as runProof, quote };
