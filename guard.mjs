#!/usr/bin/env node
// The guard: what an agent working on its own (permission checks skipped, so it just
// does the work) still can't do. Claude Code runs this before every tool call (a
// PreToolUse hook, from the settings Symbiot passes the run), and a call it blocks
// never happens, whatever the agent was told or decided. The list is short on purpose:
// the things only the owner should do, or that can't be undone.
//   - push to main/master, or force-push; publish a package
//   - delete outside the agent's own folder, or wipe a disk
//   - sudo, or pipe something from the internet into a shell
//   - read SSH keys or cloud credentials, or Symbiot's own keys (secrets.json: your AI's
//     key and the app's token); change Symbiot's own settings
//   - open the user's running Symbiot in a browser (a check uses a sandbox copy)
//   - in a sandboxed repo run (agents.mjs sandboxFor), edit or write a file outside its
//     repo and your folders (SYMBIOT_WRITES): its commands are held there by the sandbox
// judge(tool, input, { cwd, home }) → null (go ahead) or { why }.
import { resolve, join, relative } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SECRET = [".ssh", ".gnupg", ".aws", ".azure", ".kube", ".docker/config.json", ".config/gcloud", ".config/gh/hosts.yml", ".netrc", ".npmrc", ".pypirc", ".git-credentials", ".config/symbiot/secrets.json", ".config/symbiot/vault.json", ".config/symbiot/vault.key"];
const under = (p, d) => p === d || p.startsWith(d.endsWith("/") ? d : d + "/");
const expand = (p, home, cwd) => resolve(cwd, String(p).replace(/^~(?=\/|$)/, home).replace(/^\$HOME(?=\/|$)/, home).replace(/^\$\{HOME\}(?=\/|$)/, home));
const BROWSER = /\b(google-chrome(-stable)?|chromium(-browser)?|chrome|firefox|msedge|playwright|puppeteer|wkhtmltoimage|cutycapt)\b/i;
const SCP_VALUE = /^-[346ABCOpqRrTv]*[iFoPSJcl]$/; // an scp option (alone or after flags, -rpi) whose value is the next word
function secretPath(p, home) { return SECRET.some((s) => under(p, join(home, s))); }
function symbiotConfig(p, home) { const d = join(home, ".config", "symbiot"); return p === join(d, "config.json") || p === join(d, "licence-revoked.json"); }
// Symbiot's own installed files (where this guard runs from): never edited by an agent, so
// it can't be asked to take out its own limits or rules. Ghost AI's owner key lets its own
// runs through (SYMBIOT_OWNER, set by Symbiot, not by the agent).
const SELF = resolve(fileURLToPath(new URL(".", import.meta.url)));
const selfFile = (p) => !process.env.SYMBIOT_OWNER && under(p, SELF);
// A shell command that names Symbiot's files changes them unless it only reads them, runs
// Symbiot's own CLI (`node <its index.mjs> screens map …`, as TASKS.md tells agents to),
// sets a variable to the path or prints it, and writes (>, >>, tee) nowhere inside them.
// Anything else naming them (sed -i, cp, mv, rm, git, npm, cd into them…) is stopped. A
// command that only named the path was stopped too, and ops couldn't use Screens (2026-10-09).
const SELF_READ = /^(cat|less|more|head|tail|grep|egrep|fgrep|rg|ls|wc|file|stat|diff|cmp|sha\d*sum|md5sum|readlink|realpath|du|tree|jq|echo|printf|test|\[)$/;
const SELF_WRAP = /^(timeout|nice|nohup|env|time|command|exec|xargs)$/;
const unquote = (x) => String(x).replace(/^['"]|['"]$/g, "");
function changesSelf(part, { home, cwd }) {
  const mentions = (x) => { const v = unquote(x); return v.includes(SELF) && (v === SELF || v.includes(SELF + "/") || under(expand(v.replace(/^[A-Za-z_][A-Za-z0-9_]*=/, ""), home, cwd), SELF)); };
  for (const seg of part.split(/\|(?!\|)/)) {
    const t = seg.trim(); if (!t || !t.includes(SELF)) continue;
    // where it writes: a redirect's file, or tee's
    for (const m of t.matchAll(/\d*>>?\s*(?!&)(\S+)/g)) if (mentions(m[1])) return true;
    let w = t.split(/\s+/), i = 0;
    while (i < w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[i])) i++; // VAR=… on its own sets a variable, nothing more
    if (i < w.length && w[i] === "export") { i++; while (i < w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[i])) i++; }
    while (i < w.length && SELF_WRAP.test(w[i])) { i++; while (i < w.length && (w[i].startsWith("-") || /^\d+[smhd]?$/.test(w[i]))) i++; }
    if (i >= w.length) continue;
    const cmd = w[i].split("/").pop(), args = w.slice(i + 1);
    if (cmd === "tee" && args.some((x) => !x.startsWith("-") && mentions(x))) return true;
    if (SELF_READ.test(cmd)) continue;
    if (cmd === "find" && !args.some((x) => /^-(delete|exec|execdir|ok|okdir|fprint\w*|fls)$/.test(x))) continue;
    // node running a script of Symbiot's (not code given inline, which could write anything)
    if (/^(node|nodejs)$/.test(cmd) && !args.some((x) => /^(-e|--eval|-p|--print)$/.test(x) || /^--(eval|print)=/.test(x))) { const script = args.find((x) => !x.startsWith("-")); if (script && mentions(script) && /\.(m?js|cjs)['"]?$/.test(script)) continue; }
    return true;
  }
  return false;
}

// the branch a bare `git push` pushes: the one checked out in cwd
function currentBranch(cwd) { try { return execFileSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } }

function judgeBash(cmd, { cwd, home, branch }) {
  const c = String(cmd || "");
  // each simple command on its own (a; b && c | d)
  for (const part of c.split(/&&|\|\||;|\n/)) {
    const s = part.trim(); if (!s) continue;
    const w = s.split(/\s+/);
    if (/^(sudo|su|doas)$/.test(w[0])) return { why: "sudo: only you run things as root" };
    if (!process.env.SYMBIOT_OWNER && s.includes(SELF) && changesSelf(s, { home, cwd })) return { why: "Symbiot doesn't edit its own code" };
    if (/^(shutdown|reboot|poweroff|halt)$/.test(w[0])) return { why: "shutting the computer down is yours to do" };
    if (/^(mkfs(\.\w+)?|fdisk|parted|wipefs)$/.test(w[0]) || (/^dd$/.test(w[0]) && /\bof=\/dev\//.test(s))) return { why: "that writes a disk directly" };
    if (/^git$/.test(w[0]) || /^git\s/.test(s)) {
      const args = w.slice(1).filter((x, i, a) => !(a[i - 1] === "-C" || x === "-C"));
      if (args[0] === "push") {
        if (args.some((a) => /^(-f|--force|--force-with-lease)(=|$)/.test(a) || /^\+/.test(a))) return { why: "force-pushing rewrites history others may have" };
        const refs = args.slice(1).filter((a) => !a.startsWith("-"));
        const target = refs.length >= 2 ? refs[refs.length - 1].split(":").pop() : branch;
        if (/^(main|master)$/.test(target || "")) return { why: "pushing to " + target + ": changes go on a branch and a PR (Approve), never straight to " + target };
      }
    }
    if (/^(npm|yarn|pnpm|bun)$/.test(w[0]) && w[1] === "publish") return { why: "publishing a package is yours to do (Approve ships it)" };
    if (/^(twine|cargo|gem|poetry)$/.test(w[0]) && /\b(upload|publish|push)\b/.test(s)) return { why: "publishing a package is yours to do" };
    if (/^rm$/.test(w[0])) {
      const paths = w.slice(1).filter((a) => !a.startsWith("-"));
      for (const p of paths) {
        const abs = expand(p, home, cwd);
        if (abs === "/" || abs === home || /^\/(\*|bin|boot|dev|etc|lib|lib64|proc|root|sbin|sys|usr|var)(\/|$)/.test(abs)) return { why: "deleting " + p + " can't be undone" };
        if (!under(abs, cwd) && !under(abs, "/tmp") && !under(abs, join(home, ".cache"))) return { why: "deleting outside this folder (" + p + "): ask for it" };
      }
    }
    if (/^(cat|less|more|head|tail|cp|scp|base64|xxd|strings|grep|rg|sed|awk)$/.test(w[0])) {
      // scp's sign-in options take a value (`-i ~/.ssh/key` is the key it signs in with, as
      // ssh's is, never a file it copies): those aren't what it reads. Only what it copies
      // counts: `scp ~/.ssh/id_rsa host:` stays blocked. The argena lane's approved deploy
      // (`scp -i ~/.ssh/oracle_key server/x.py ubuntu@host:…`) was blocked (2026-10-08).
      const own = w[0] === "scp" ? SCP_VALUE : null;
      for (const p of w.slice(1).filter((a, i, all) => !a.startsWith("-") && !(own && own.test(all[i - 1] || "")))) { if (secretPath(expand(p, home, cwd), home)) return { why: "your keys and cloud credentials stay yours" }; }
    }
    if (/(^|\s)(>|>>|tee|sed\s+-i)\s*\S*\.config\/symbiot\/(config|secrets)\.json/.test(s)) return { why: "Symbiot's own settings are yours to change" };
  }
  if (/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(c)) return { why: "running a script straight from the internet" };
  // a browser on the user's running Symbiot: each page it opened counted as a new window and
  // closed theirs, five times in four minutes (2026-10-08). Its API (curl) is fine to read.
  if (BROWSER.test(c) && /\b(127\.0\.0\.1|localhost):7391\b/.test(c)) return { why: "that's the user's running Symbiot (their window and data): check it in a copy of your own, `symbiot app --fresh`" };
  return null;
}

function judge(tool, input = {}, { cwd = process.cwd(), home = homedir(), branch, writes = null } = {}) {
  const t = String(tool || "");
  if (t === "Bash") return judgeBash(input.command, { cwd, home, branch: branch != null ? branch : currentBranch(cwd) });
  const p = input.file_path || input.path || input.notebook_path;
  if (!p) return null;
  const abs = expand(p, home, cwd);
  if (secretPath(abs, home)) return { why: "your keys and cloud credentials stay yours" };
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t) && symbiotConfig(abs, home)) return { why: "Symbiot's own settings are yours to change" };
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t) && selfFile(abs)) return { why: "Symbiot doesn't edit its own code" };
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t) && Array.isArray(writes) && writes.length && !writes.some((d) => under(abs, d))) return { why: "this run writes only in its repo and your folders (its sandbox), not " + p };
  return null;
}

// As a hook: Claude Code passes the call as JSON on stdin; exit 2 blocks it, and what's
// on stderr goes back to the agent as the reason (so it can ask, or do it another way).
const main = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (main) {
  let raw = ""; try { raw = readFileSync(0, "utf8"); } catch {}
  let ev = {}; try { ev = JSON.parse(raw); } catch {}
  let writes = null; try { writes = JSON.parse(process.env.SYMBIOT_WRITES || "null"); } catch {} // a sandboxed repo run's folders
  const r = judge(ev.tool_name, ev.tool_input || {}, { cwd: ev.cwd || process.cwd(), writes });
  if (r) { process.stderr.write("Blocked by Symbiot's membrane: " + r.why + ". If it's needed, ask the user in .symbiot/QUESTIONS.md with options.\n"); process.exit(2); }
  process.exit(0);
}

export { judge, judgeBash, relative };
