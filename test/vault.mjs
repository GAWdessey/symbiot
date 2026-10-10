// Secrets handed over in chat: saved in the vault, redacted from the stored chat and what the
// model sees, one-use codes marked spent, and the vault holds no plain value on disk.
//
//   node test/vault.mjs
//
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-vault-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_VAULT = "file";
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const { captureSecrets, findSecrets, listSecrets, getSecret, markUsed, deleteSecret } = await import("../vault.mjs");
const { converse, loadMind } = await import("../mind.mjs");
const A = "0123456789abcdef".repeat(4), B = "fedcba9876543210".repeat(4);

try {
  console.log("VAULT — pasted secrets");
  const r = captureSecrets(`recovery codes for npm: ${A} ${B}`);
  ok("both codes saved under one name", r.saved.length === 1 && r.saved[0] === "npm recovery codes", r);
  ok("the text keeps a placeholder, no code", r.text === "recovery codes for npm: [saved: npm recovery codes]", r.text);
  ok("list shows a count, never a value", listSecrets()[0].count === 2 && !JSON.stringify(listSecrets()).includes(A));
  ok("no plain value on disk", readdirSync(CFG).every((f) => !readFileSync(join(CFG, f), "utf8").includes(A)));
  const g = getSecret("npm recovery codes", { use: true });
  ok("get --use gives the first and spends it", g.value === A && g.left === 1, g);
  ok("the next get gives the next", getSecret("npm recovery codes").value === B);
  ok("markUsed spends one by value", markUsed("npm recovery codes", B).left === 0 && getSecret("npm recovery codes").error);
  ok("tokens and password lines are caught", findSecrets("npm_" + "x".repeat(30) + " and password: hunter22x").found.length === 2);
  ok("ordinary text is left alone", captureSecrets("deploy the 0.62.1 build to abc123def").saved.length === 0);
  ok("delete removes it", deleteSecret("npm recovery codes").ok && !listSecrets().length);

  console.log("CHAT — acknowledged, redacted, not refused");
  let seen = "";
  const out = await converse({ where: "Home", question: `recovery code for npm ${A} ${B}`, ask: async (sys, p) => { seen = sys + "\n" + p; return JSON.stringify({ reply: "Saved as npm recovery codes.", do: null, remember: [] }); } });
  ok("the model never sees the codes", !seen.includes(A) && !seen.includes(B) && seen.includes("[saved: npm recovery codes]"));
  ok("the prompt says to acknowledge, not refuse", /never refuse it/.test(seen));
  ok("the stored chat has a placeholder, not the codes", !JSON.stringify(loadMind()).includes(A) && JSON.stringify(loadMind()).includes("[saved: npm recovery codes]"));
  ok("the secret is in the vault", getSecret("npm recovery codes").value === A);
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
