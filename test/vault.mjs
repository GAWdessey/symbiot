// Secrets handed over in chat: saved in the vault, redacted from the stored chat and what the
// model sees, one-use codes marked spent, and the vault holds no plain value on disk.
//
//   node test/vault.mjs
//
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-vault-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_VAULT = "file";
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const { captureSecrets, findSecrets, listSecrets, getSecret, markUsed, deleteSecret, scrubStored } = await import("../vault.mjs");
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
  const sha = "3f2a9c1b7e4d6a8f0b1c2d3e4f5a6b7c8d9e0f1a", b64 = "QWxhZGRpbjpvcGVuIHNlc2FtZTEyMzQ1Njc4OTBhYmNkZWZn";
  ok("a git SHA, a long URL and a base64 blob aren't secrets: the words before them don't say so (15 Oct 2026)", findSecrets(`revert ${sha} and look at https://x.test/a/${b64}/b?v=${sha} then paste ${b64} into the form`).found.length === 0, findSecrets(`revert ${sha} ${b64}`).found);
  ok("…they are when the words before them say token, key or code", findSecrets(`the api key is ${b64}`).found.length === 1 && findSecrets(`recovery code: ${sha}`).found.length === 1 && findSecrets(`tokens: ${A}, ${B}`).found.flatMap((f) => f.values).length === 2, [findSecrets(`the api key is ${b64}`).found, findSecrets(`tokens: ${A}, ${B}`).found]);
  ok("…but never one inside a URL, even after such a word", findSecrets(`the token page is https://x.test/t/${b64}`).found.length === 0);
  ok("delete removes it", deleteSecret("npm recovery codes").ok && !listSecrets().length);

  console.log("CHAT — acknowledged, redacted, not refused");
  let seen = "";
  await converse({ where: "Home", question: `recovery code for npm ${A} ${B}`, ask: async (sys, p) => { seen = sys + "\n" + p; return JSON.stringify({ reply: "Saved as npm recovery codes.", do: null, remember: [] }); } });
  ok("the model never sees the codes", !seen.includes(A) && !seen.includes(B) && seen.includes("[saved: npm recovery codes]"));
  ok("the prompt says to acknowledge, not refuse", /never refuse it/.test(seen));
  ok("the stored chat has a placeholder, not the codes", !JSON.stringify(loadMind()).includes(A) && JSON.stringify(loadMind()).includes("[saved: npm recovery codes]"));
  ok("the secret is in the vault", getSecret("npm recovery codes").value === A);

  console.log("A PASSWORD WITH NO \"password:\" BEFORE IT (19 Oct 2026)");
  // made up, in the shape of the one that got through: a word-like string, mixed case, digits, symbols, right after an email
  const PW = "Brisk7Otter!92", said = `i signed up to lemon squeezy with jane@example.com ${PW}`;
  const c1 = captureSecrets(said);
  ok("right after an email: saved, named for the site and the account", c1.text === "i signed up to lemon squeezy with jane@example.com [saved: lemon squeezy password (jane@example.com)]" && getSecret("lemon squeezy password (jane@example.com)").value === PW, c1);
  ok("after \"password\" or \"pw\" with no \"is\" or colon", findSecrets(`my lemon squeezy password ${PW} ok`).found.length === 1 && findSecrets("pw: Kq83mnzz").found.length === 1 && findSecrets(`the pw ${PW}`).found.length === 1);
  ok("mixed into a sentence about an account, mid-sentence", findSecrets(`login for acme.io is jane@example.com and Tq9#vbn2Lp, thanks`).found.map((f) => f.name).join() === "acme.io password (jane@example.com)" && /and \[secret hidden\], thanks$/.test(findSecrets(`login for acme.io is jane@example.com and Tq9#vbn2Lp, thanks`).text));
  ok("…but a version, a date, a time or an ordinary word after an email isn't one", ["upgrade to Python3.12 and Node-22 then email jane@example.com tomorrow", "meet jane@example.com 10:30am", "send jane@example.com 2026-10-19 notes", "signed in to GitHub-Actions2 fine", "ask jane@example.com about the v0.66.9-beta build"].every((t) => !findSecrets(t).found.length), ["meet jane@example.com 10:30am", "signed in to GitHub-Actions2 fine"].map((t) => findSecrets(t).found));
  let seen2 = "";
  const { homeAsk } = await import("../home.mjs");
  await homeAsk(said.replace(PW, "Wren5Harbor#31"), { state: { you: [], feeds: [], lanes: [], runs: [] }, ask: async (sys, p) => { seen2 = sys + "\n" + p; return JSON.stringify({ reply: "Saved.", do: null, remember: [] }); } });
  ok("on Home: the model and the stored chat never see it, and the reply says it was saved", !seen2.includes("Wren5Harbor#31") && /saved what they pasted, under "lemon squeezy password \(jane@example\.com\)"/.test(seen2) && !JSON.stringify(loadMind()).includes("Wren5Harbor#31"), seen2.slice(-300));

  console.log("STORED BEFORE IT WAS CAUGHT — scrubbed once");
  const old = "Gale4Fjord$88", mf = join(CFG, "mind.json"), m = JSON.parse(readFileSync(mf, "utf8"));
  m.log.push({ ts: 1, where: "Home", role: "user", text: `i signed up to lemon squeezy with jane@example.com ${old}` }, { ts: 2, where: "Home", role: "assistant", text: `Noted: jane@example.com / ${old}.` });
  writeFileSync(mf, JSON.stringify(m));
  writeFileSync(join(CFG, "asks-done.json"), JSON.stringify([{ k: "x", q: "Sign up to Lemon Squeezy?", a: `answered in chat: i signed up to lemon squeezy with jane@example.com ${old}` }]));
  const run = join(CFG, "drafts", "act-1", ".symbiot"); mkdirSync(run, { recursive: true }); writeFileSync(join(run, "agent.log"), JSON.stringify({ text: `password ${old} "quoted"` }) + "\n");
  const sc = scrubStored({ force: true });
  const left = ["mind.json", "asks-done.json", join("drafts", "act-1", ".symbiot", "agent.log")].filter((f) => readFileSync(join(CFG, f), "utf8").includes(old));
  ok("the old password goes to the vault, and every stored copy (the chat, its reply, the answered record, a run's log) becomes [saved: …]", !left.length && sc.found.includes("lemon squeezy password (jane@example.com)") && getSecret("lemon squeezy password (jane@example.com)").ok && sc.files.length === 3 && readFileSync(mf, "utf8").includes("[saved: lemon squeezy password (jane@example.com)]"), { sc, left });
  ok("…the files it rewrote still read", !!JSON.parse(readFileSync(mf, "utf8")).log && JSON.parse(readFileSync(join(run, "agent.log"), "utf8").trim()).text.includes("[saved:"));
  ok("…and once done, it doesn't run again at start", scrubStored().skipped === true);
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
