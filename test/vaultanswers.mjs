// A secret handed over in an answer to an agent's question goes to the vault, not into saved
// answers; agents can add to the vault themselves; and no card asks for a secret Symbiot holds.
// 20 Oct 2026: Garth answered "Can you paste the Cloudflare token into the vault…?" with a curl
// carrying "Authorization: Bearer cfat_…". It stayed whole in the saved answers, the agent found
// no way to vault it, and Home asked him to re-save it himself.
//
//   node test/vaultanswers.mjs
//
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-vaultanswers-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_VAULT = "file";
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "index.mjs");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const v = await import("../vault.mjs");
const a = await import("../agents.mjs");

const TOKEN = "cfat_" + "xQ7gdYCvByFzMqSpYE6qYz8yJXDiVvlzzZpsJlBac4b2", ACCT = "715fd1bf33cd78db71147e967e997bc1";
const CURL = `curl -X GET "https://api.cloudflare.com/client/v4/accounts/${ACCT}/tokens/verify" \\\n     -H "Authorization: Bearer ${TOKEN}"`;
const Q = "Can you paste the Cloudflare token into the vault with the project in its name?";
const everywhere = () => [join(CFG, "asks-done.json"), join(CFG, "vault.json")].map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");

try {
  console.log("DETECTING — a token inside a pasted command");
  const f = v.findSecrets(CURL, undefined, { context: Q });
  ok("the Bearer token in a curl is found, and only it (not the account id in the address)", f.found.length === 1 && f.found[0].values.join() === TOKEN, f.found);
  ok("…named for the service the command calls, not the command's words", f.found[0].name === "cloudflare api token", f.found[0].name);
  ok("…and the command keeps its shape, the token hidden", f.text.includes(ACCT) && f.text.includes("Authorization: Bearer [secret hidden]") && !f.text.includes(TOKEN), f.text);
  ok("an API key header, a --token flag and an exported variable are caught too",
    v.findSecrets('curl -H "X-Api-Key: Zx9yW8vU7tS6rQ5pO4nM3lK2" https://api.example-shop.io/v1').found[0]?.name === "example-shop api token"
    && v.findSecrets("wrangler deploy --token Zx9yW8vU7tS6rQ5pO4nM3lK2").found.length === 1
    && v.findSecrets(`export CLOUDFLARE_API_TOKEN=${TOKEN}`).found[0]?.name === "cloudflare api token",
    [v.findSecrets('curl -H "X-Api-Key: Zx9yW8vU7tS6rQ5pO4nM3lK2" https://api.example-shop.io/v1').found, v.findSecrets(`export CLOUDFLARE_API_TOKEN=${TOKEN}`).found]);
  ok("a placeholder in a command isn't a secret", !v.findSecrets('curl -H "Authorization: Bearer $CF_TOKEN" https://api.cloudflare.com/x').found.length && !v.findSecrets("Bearer ${TOKEN}").found.length);

  console.log("ANSWERING — an agent's question answered with the curl");
  const run = join(CFG, "drafts", "act-cf"), s = join(run, ".symbiot"); mkdirSync(s, { recursive: true });
  writeFileSync(join(CFG, "runs.json"), JSON.stringify([{ path: run, name: "Agent: ops", startedAt: Date.now() }]));
  writeFileSync(join(s, "QUESTIONS.md"), `## Questions\n\n### ${Q}\nI need it to list your domains.\n- 👤 You (only you: your Cloudflare token): paste it here\n- Skip this part\n`);
  const r = a.answerQuestions(run, [{ q: Q, a: CURL }]);
  const ans = readFileSync(join(s, "ANSWERS.md"), "utf8");
  ok("the answer is saved", r.ok && r.saved === 1, r);
  ok("…the token went to the vault, under a clear name", (r.vaulted || []).join() === "cloudflare api token" && v.getSecret("cloudflare api token").value === TOKEN, r);
  ok("…and ANSWERS.md has the placeholder and where to read it, never the token", !ans.includes(TOKEN) && ans.includes("Bearer [saved: cloudflare api token]") && /symbiot secret get/.test(ans), ans);
  ok("…nor does the shared record of answers, or any file on disk", !everywhere().includes(TOKEN) && !readFileSync(join(CFG, "asks-done.json"), "utf8").includes(TOKEN));

  console.log("SAVED ALREADY — a second copy keeps the first name");
  v.saveSecret("cloudflare-garth-ghost-ai (garths domains)", ["cfat_OtherValue1234567890abcdefghijklmnopqrstu"]);
  const T2 = "cfat_" + "Kp3LmN8qRsT2uVwX5yZaB9cDeF4gHiJ7kLmN0pQr";
  v.saveSecret("cloudflare-ops (named by ops)", [T2]);
  const again = v.captureSecrets(`curl -H "Authorization: Bearer ${T2}" https://api.cloudflare.com/client/v4/user/tokens/verify`);
  ok("a token already in the vault is marked with the name it has there, not saved twice", again.saved.join() === "cloudflare-ops (named by ops)" && again.text.includes("[saved: cloudflare-ops (named by ops)]") && !v.listSecrets().some((x) => x.name === "cloudflare api token" && x.count > 1), [again, v.listSecrets()]);

  console.log("STORED BEFORE — answers kept whole by an older Symbiot");
  const T3 = "cfat_" + "Zz1Yy2Xx3Ww4Vv5Uu6Tt7Ss8Rr9Qq0Pp1Oo2Nn3Mm4";
  writeFileSync(join(CFG, "asks-done.json"), JSON.stringify([{ k: "x", q: Q, a: CURL.replace(TOKEN, T3), at: "2026-10-20", lane: "ops" }]));
  writeFileSync(join(CFG, "answers-shared.json"), JSON.stringify([{ q: Q, a: CURL.replace(TOKEN, T3), topics: ["api.cloudflare.com", T3.toLowerCase()] }]));
  v.saveSecret("cloudflare-garth-ghost-ai (garths domains)", [T3]);
  const sc = v.scrubStored({ force: true }), shared = readFileSync(join(CFG, "answers-shared.json"), "utf8");
  ok("the start-up scrub reads answers to agents' questions, not only chat", !readFileSync(join(CFG, "asks-done.json"), "utf8").includes(T3) && !shared.includes(T3), sc);
  ok("…blanks the lowercased copy among an answer's topics too", !shared.includes(T3.toLowerCase()), shared);
  ok("…under the name it was already saved by (ops named it with care)", shared.includes("[saved: cloudflare-garth-ghost-ai (garths domains)]") && sc.found.length >= 1, [sc, shared]);

  console.log("NO CARD — for a secret Symbiot holds");
  ok("a step asking to paste or re-save a held token names it", v.heldFor("👤 You (only you: your Cloudflare token): re-save the Cloudflare token into the vault yourself").startsWith("cloudflare"), v.heldFor("re-save the Cloudflare token into the vault yourself"));
  ok("…but not one asking for a new one (revoked, rotated, a new token)", !v.heldFor("The Cloudflare token was revoked: make a new token and paste it") && !v.heldFor("paste a new Cloudflare token"));
  ok("…nor a secret nothing holds, nor a step that isn't about a secret", !v.heldFor("paste your Twilio auth token") && !v.heldFor("check the Cloudflare dashboard"));
  let told = null;
  const name = a.heldAsk(run, { q: "Can you paste your Cloudflare API token into the vault?", options: ["👤 You (only you: your Cloudflare token): paste it into the vault", "Skip"] }, { answer: (p, rows, o) => { told = { p, rows, o }; return { ok: true }; } });
  ok("an agent's question asking for it is answered for the user, with where it is, and its agent runs again", name.startsWith("cloudflare") && told && /already holds it.*vault as/.test(told.rows[0].a) && told.o.rerun === true, told);
  ok("…one asking something else still reaches the user", a.heldAsk(run, { q: "Which Cloudflare zone should the site use?", options: ["🤖 Agent: symbiot.co.za"] }, { answer: () => ({ ok: true }) }) === "");

  console.log("AGENTS ADD — symbiot secret add");
  const env = { ...process.env, HOME, SYMBIOT_VAULT: "file", SYMBIOT_PORT: "1" };
  const p1 = spawnSync(process.execPath, [CLI, "secret", "add", "example api token"], { env, input: "Zx9yW8vU7tS6rQ5pO4nM3lK2\n", encoding: "utf8" });
  ok("a value piped in is saved under the name given", p1.status === 0 && v.getSecret("example api token").value === "Zx9yW8vU7tS6rQ5pO4nM3lK2", [p1.stdout, p1.stderr]);
  const file = join(HOME, "pasted.txt"); writeFileSync(file, `here's the curl:\n${CURL}\n`);
  const p2 = spawnSync(process.execPath, [CLI, "secret", "add", "cloudflare from a file", "--from", file], { env, encoding: "utf8" });
  ok("…or the one secret found in a file (--from), so the value is never typed in a command", p2.status === 0 && /Saved as "cloudflare api token"|Saved as "cloudflare from a file"/.test(p2.stdout) && !p2.stdout.includes(TOKEN), [p2.stdout, p2.stderr]);
  const p3 = spawnSync(process.execPath, [CLI, "secret", "add", "nothing", "--from", join(HOME, "missing.txt")], { env, encoding: "utf8" });
  ok("…and a file that isn't there says so", p3.status === 1 && /Couldn't read/.test(p3.stderr), p3.stderr);

  console.log("SEALED — a run that can't read the vault says so");
  if (process.getuid && process.getuid() !== 0) {
    chmodSync(join(CFG, "vault.json"), 0o000);
    const l = spawnSync(process.execPath, [CLI, "secret", "list"], { env, encoding: "utf8" });
    const g = spawnSync(process.execPath, [CLI, "secret", "get", "cloudflare api token"], { env, encoding: "utf8" });
    chmodSync(join(CFG, "vault.json"), 0o600);
    ok("list says the vault is sealed from this run, never \"No secrets saved\"", /can't read the vault/.test(l.stdout) && !/No secrets saved/.test(l.stdout), l.stdout);
    ok("get says so too, and to hand the step to ops", g.status === 1 && /ops/.test(g.stderr), g.stderr);
  } else ok("(running as root: the sealed check is skipped)", true);
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
