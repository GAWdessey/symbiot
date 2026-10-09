// Claude Code from Symbiot's setup (claudesetup.mjs): installed with Anthropic's own
// installer, signed in through the browser, a pasted code passed on. A stand-in
// installer (SYMBIOT_CLAUDE_INSTALL_CMD) "installs" a stand-in claude into a bin on
// PATH; the stand-in signs in when it's run with `auth login`.
// Isolated HOME (set before the modules load).
//
//   node test/claudesetup.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-ccsetup-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
delete process.env.SYMBIOT_CLAUDE_CMD;
const BIN = join(HOME, "bin"), signed = join(HOME, "signed-in"), codes = join(HOME, "codes.txt");
mkdirSync(BIN, { recursive: true });
process.env.PATH = BIN; // only the stand-in: a real claude elsewhere on this computer mustn't count
// the stand-in claude, as the installer leaves it: signed in once `auth login` has run
const claude = `#!${process.execPath}
const fs = require("fs"), a = process.argv.slice(2);
try { process.cwd(); } catch { console.error("error: The current working directory was deleted"); process.exit(1); } // as the real one does
if (a[0] === "auth" && a[1] === "status") { console.log(JSON.stringify({ loggedIn: fs.existsSync(${JSON.stringify(signed)}), authMethod: "claude.ai" })); process.exit(0); }
if (a[0] === "auth" && a[1] === "login") {
  console.log("Opening browser to sign in…");
  if (process.env.NEEDS_CODE === "1") { process.stdin.on("data", (d) => { fs.appendFileSync(${JSON.stringify(codes)}, String(d)); fs.writeFileSync(${JSON.stringify(signed)}, "1"); process.exit(0); }); }
  else setTimeout(() => { fs.writeFileSync(${JSON.stringify(signed)}, "1"); process.exit(0); }, 300);
}
`;
const stage = join(HOME, "claude-stand-in"); writeFileSync(stage, claude); chmodSync(stage, 0o755);
process.env.SYMBIOT_CLAUDE_INSTALL_CMD = `/bin/sleep 0.3 && /bin/cp ${JSON.stringify(stage)} ${JSON.stringify(join(BIN, "claude"))} && echo installed`;
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (f()) return true; await sleep(100); } return false; };

try {
  const { installCmd, installClaude, signInClaude, sendClaudeCode, claudeSetup } = await import("../claudesetup.mjs");
  const { resolveProvider } = await import("../ai.mjs");

  console.log("THE INSTALLER — Anthropic's own, per computer");
  delete process.env.SYMBIOT_CLAUDE_INSTALL_CMD;
  ok("Windows: install.ps1 in PowerShell", /irm https:\/\/claude\.ai\/install\.ps1 \| iex/.test(installCmd("win32").args.join(" ")) && installCmd("win32").cmd === "powershell", installCmd("win32"));
  ok("Mac and Linux: install.sh", /curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash/.test(installCmd("linux").args.join(" ")), installCmd("linux"));
  process.env.SYMBIOT_CLAUDE_INSTALL_CMD = `/bin/sleep 0.3 && /bin/cp ${JSON.stringify(stage)} ${JSON.stringify(join(BIN, "claude"))} && echo installed`;

  console.log("FROM SETUP — install, then sign in, no terminal");
  let s = claudeSetup(true);
  ok("to start with: not installed, not signed in", !s.installed && !s.signedIn && !s.installing, s);
  s = installClaude();
  ok("Install: it's installing", s.installing === true, s);
  ok("…and when it's done, Claude Code is there (not yet signed in)", await until(() => { const x = claudeSetup(); return !x.installing && x.installed; }) && !claudeSetup().signedIn, claudeSetup());
  s = signInClaude();
  ok("Sign in: it's waiting for the browser", s.signingIn === true, s);
  ok("…signed in on the page, it ticks itself", await until(() => { const x = claudeSetup(); return !x.signingIn && x.signedIn; }), claudeSetup());
  ok("…and the subscription is Symbiot's AI, no key", (resolveProvider() || {}).provider === "claude", resolveProvider());

  console.log("A DELETED FOLDER — the app was started in one (an update, a removed worktree)");
  const gone = join(HOME, "gone"), back = process.cwd(); mkdirSync(gone); process.chdir(gone); rmSync(gone, { recursive: true });
  ok("still signed in: Claude Code is asked from home, not from the deleted folder", claudeSetup(true).signedIn === true, claudeSetup());
  process.chdir(back);

  console.log("A CODE — when the page shows one instead");
  rmSync(signed); process.env.NEEDS_CODE = "1"; claudeSetup(true);
  ok("no sign-in waiting: a pasted code goes nowhere, and it says so", /no sign-in waiting/i.test(sendClaudeCode("abc").error || ""), "");
  signInClaude(); await sleep(400);
  const r = sendClaudeCode("  CODE-123  ");
  ok("the pasted code goes to the sign-in that's waiting, trimmed", !r.error && await until(() => existsSync(codes) && readFileSync(codes, "utf8") === "CODE-123\n"), existsSync(codes) ? readFileSync(codes, "utf8") : "");
  ok("…and then it's signed in", await until(() => claudeSetup(true).signedIn), claudeSetup());
  delete process.env.NEEDS_CODE;

  console.log("WHEN IT FAILS — it says so, and you can try again");
  rmSync(join(BIN, "claude")); claudeSetup(true);
  process.env.SYMBIOT_CLAUDE_INSTALL_CMD = "echo 'could not reach claude.ai' >&2; exit 3";
  installClaude();
  ok("an installer that fails: its last words, and Install again", await until(() => !claudeSetup().installing) && /exit 3.*could not reach claude\.ai/.test(claudeSetup().installError || ""), claudeSetup());
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} claudesetup: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
