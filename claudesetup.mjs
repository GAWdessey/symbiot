// symbiot — Claude Code, set up from Symbiot's own setup, for someone who has never
// opened a terminal: Anthropic's installer (Windows: install.ps1 in PowerShell; Mac
// and Linux: install.sh), then `claude auth login --claudeai`, which opens the
// sign-in page in the browser and finishes by itself once they've signed in. If the
// page shows a code instead (the browser couldn't hand it back), setup has a box for
// it, which goes to the sign-in that's waiting. SYMBIOT_CLAUDE_INSTALL_CMD replaces
// the installer (tests); SYMBIOT_NO_SIGNIN turns both off (the smoke test presses every button).
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { claudeState, claudeSpawn } from "./ai.mjs";

const S = { installing: false, installError: "", signingIn: false, signinError: "", log: "", child: null };
const tail = (s) => String(s || "").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").slice(-1500);

function installCmd(platform = process.platform) {
  if (process.env.SYMBIOT_CLAUDE_INSTALL_CMD) return { cmd: process.env.SYMBIOT_CLAUDE_INSTALL_CMD, args: [], shell: true };
  if (platform === "win32") return { cmd: "powershell", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://claude.ai/install.ps1 | iex"], shell: false };
  return { cmd: "bash", args: ["-c", "curl -fsSL https://claude.ai/install.sh | bash"], shell: false };
}
function installClaude() {
  if (S.installing) return claudeSetup();
  if (process.env.SYMBIOT_NO_SIGNIN && !process.env.SYMBIOT_CLAUDE_INSTALL_CMD) { S.installError = "Installing is switched off here (SYMBIOT_NO_SIGNIN)."; return claudeSetup(); }
  S.installing = true; S.installError = ""; S.log = "";
  const c = installCmd();
  let ch; try { ch = spawn(c.cmd, c.args, { cwd: homedir(), shell: c.shell, windowsHide: true, env: process.env }); } catch (e) { S.installing = false; S.installError = String((e && e.message) || e); return claudeSetup(); }
  ch.stdout.on("data", (d) => { S.log = tail(S.log + d); }); ch.stderr.on("data", (d) => { S.log = tail(S.log + d); });
  ch.on("error", (e) => { S.installing = false; S.installError = String((e && e.message) || e); });
  ch.on("close", (code) => {
    S.installing = false;
    const st = claudeState(true);
    if (code !== 0 || !st.installed) S.installError = `The installer didn't finish (${code === 0 ? "Claude Code wasn't found after it" : "exit " + code}). ${S.log.trim().split("\n").pop() || ""}`.trim();
  });
  return claudeSetup();
}
function signInClaude() {
  if (S.signingIn) return claudeSetup();
  // tests press every button: a real sign-in would open the browser on someone's real account
  if (process.env.SYMBIOT_NO_SIGNIN) { S.signinError = "Signing in is switched off here (SYMBIOT_NO_SIGNIN)."; return claudeSetup(); }
  S.signingIn = true; S.signinError = "";
  let ch; try { ch = claudeSpawn(["auth", "login", "--claudeai"], { cwd: homedir(), stdio: ["pipe", "pipe", "pipe"], env: process.env }); } catch (e) { S.signingIn = false; S.signinError = String((e && e.message) || e); return claudeSetup(); }
  S.child = ch;
  let out = ""; ch.stdout.on("data", (d) => { out = tail(out + d); }); ch.stderr.on("data", (d) => { out = tail(out + d); });
  ch.on("error", (e) => { S.signingIn = false; S.child = null; S.signinError = String((e && e.message) || e); });
  ch.on("close", () => { S.signingIn = false; S.child = null; if (!claudeState(true).signedIn) S.signinError = "Signing in didn't finish. Try again, and sign in on the page that opens."; });
  return claudeSetup();
}
// the code the sign-in page shows, when the browser couldn't hand it back
function sendClaudeCode(code) {
  const c = String(code || "").trim();
  if (!c || !S.child || !S.child.stdin) return { error: "There's no sign-in waiting for a code. Click Sign in with Claude first." };
  try { S.child.stdin.write(c + "\n"); } catch (e) { return { error: String((e && e.message) || e) }; }
  return claudeSetup();
}
function claudeSetup(fresh = false) {
  const st = claudeState(fresh);
  return { installed: st.installed, signedIn: st.signedIn, installing: S.installing, signingIn: S.signingIn, ...(S.installError ? { installError: S.installError } : {}), ...(S.signinError ? { signinError: S.signinError } : {}) };
}

export { installCmd, installClaude, signInClaude, sendClaudeCode, claudeSetup };
