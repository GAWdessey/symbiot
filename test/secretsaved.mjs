// Symbiot says a secret is saved only once the vault has it. 9 Nov 2026: a card asking the user to
// "create a new API key … and paste it in chat" was pressed Done with nothing pasted; its run was told
// "Done: the user did it", triage then told it the key was pasted and "being saved to the vault", the
// vault never had it, and the user was asked for the key again. Isolated HOME, the vault on file.
//
//   node test/secretsaved.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-secretsaved-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_VAULT = "file";
const C = join(HOME, ".config", "symbiot"); mkdirSync(C, { recursive: true });
writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")] }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const v = await import("../vault.mjs");
const T = await import("../triage.mjs");
const { homeAnswer } = await import("../home.mjs");

const KEY = "q7Rk2mVx9TbL4wNz8Hc3", STEP = "The one step only you can take is to create a new Example API key at app.example-avatars.com, under your sign-in, and paste it in chat.";
const lane = join(HOME, "work", "avatars"), sym = join(lane, ".symbiot"); mkdirSync(sym, { recursive: true });
const last = () => { try { return readFileSync(join(sym, "ANSWERS.md"), "utf8").split("### ").pop(); } catch { return ""; } };
try {
  console.log("1) A STEP THAT ASKS FOR A KEY");
  ok("pasting or making a key is one", v.asksForSecret(STEP) && v.asksForSecret("Generate new avatar and payment keys in the Example console, since the swap waits on them"));
  ok("…checking a page or restarting a server isn't", !v.asksForSecret("Restart the avatar server after the deploy") && !v.asksForSecret("Check the Example dashboard shows the new plan"));

  console.log("2) DONE WITH NOTHING PASTED");
  const card = { id: "r1", path: lane, startedAt: Date.now() - 60000, endedAt: Date.now() - 1000, needs: { key: "k1", kind: "step", what: STEP } };
  let settled = 0, ran = 0;
  const deps = { agents: () => [card], settle: () => settled++, run: () => { ran++; return { id: "run2" }; }, unchanged: () => [], releaseNotIn: () => null };
  const bare = homeAnswer("needs:r1", { pick: 0 }, deps);
  ok("isn't taken as done: the user is told to paste the key on the card", bare.error && /No key came with that/.test(bare.error) && /Paste the key itself/.test(bare.error), bare);
  ok("…its run isn't told the user did it, nor started, and the card stays", !/Done: the user did it/.test(last()) && ran === 0 && settled === 0, [last(), ran, settled]);
  const said = homeAnswer("needs:r1", { text: "done" }, deps);
  ok("typing \"done\" with no key is the same", said.error && /No key came with that/.test(said.error), said);

  console.log("3) THE KEY TYPED ON THE CARD");
  const got = homeAnswer("needs:r1", { text: KEY }, deps);
  const name = v.listSecrets().map((x) => x.name).find((n) => /example/.test(n)) || "";
  ok("a key on its own goes to the vault, named for the card's service", name && v.getSecret(name).value === KEY, [name, v.listSecrets()]);
  ok("…its run is told where it is, checked, never the key itself", got.ok && ran === 1 && settled === 1 && last().includes(`"${name}"`) && /checked: it's there/.test(last()) && !readFileSync(join(sym, "ANSWERS.md"), "utf8").includes(KEY), [got, last()]);

  console.log("4) SAVED ON THE VAULT PAGE SINCE THE RUN ASKED");
  const card2 = { ...card, id: "r2", needs: { ...card.needs, key: "k2" }, endedAt: Date.now() - 1000 };
  const met = homeAnswer("needs:r2", { pick: 0 }, { ...deps, agents: () => [card2] });
  ok("a Done then counts, and names it", met.ok && new RegExp(`"${name}"`).test(last()), [met, last()]);

  console.log("5) A SAVE THAT DIDN'T TAKE");
  const r = v.captureSecrets(`the api key is ${KEY.split("").reverse().join("")}x9`, {});
  ok("a save read back from the vault is [saved: …]", r.saved.length === 1 && !r.failed.length && v.holds(r.saved[0], [KEY.split("").reverse().join("") + "x9"]), r);
  const lock = () => chmodSync(C, 0o500), unlock = () => chmodSync(C, 0o700); // the vault's folder can't be written
  lock();
  const bad = v.captureSecrets("my token: Zk8yW2vU7tS6rQ5pO4nM3lK2jH1g", {});
  unlock();
  ok("one the vault couldn't write is [not saved], named as failed, never [saved: …]", !bad.saved.length && bad.failed.length === 1 && /\[not saved\]/.test(bad.text) && !/\[saved:/.test(bad.text), bad);
  const card3 = { ...card, id: "r3", needs: { ...card.needs, key: "k3", what: "Make a new Other API key at console.othersite.com and paste it here." }, endedAt: Date.now() + 1000 };
  lock();
  const failed = homeAnswer("needs:r3", { text: "Zk8yW2vU7tS6rQ5pO4nM3lK2jH1gXX" }, { ...deps, agents: () => [card3] });
  unlock();
  ok("…and on a card the user is told it didn't save, with nothing sent to its run", failed.error && /couldn't save that key/.test(failed.error), failed);

  console.log("6) TRIAGE CAN'T SAY A KEY WAS HANDED OVER WHEN THE VAULT HASN'T IT");
  const q = { q: "Example key swap: the new key did not reach me", context: "You marked the key as done, but the vault lists only the old one. With it, I update the env files; if you skip it, the old key stays live.", options: ["👤 You (only you: your Example sign-in): paste the new key here", "Skip this part"] };
  const claims = { verdict: "answered", why: "the user already pasted it", answer: "No sign-in is needed. You already created the new key and pasted it in chat, so I'm saving that key to the vault and carrying on." };
  ok("a claim with no key in the vault goes to the user instead", T.unheldClaim(q, claims, { met: () => "" })?.verdict === "user");
  ok("…the same for 'agent: find the paste'", T.unheldClaim(q, { verdict: "agent", why: "Garth already created the new key and pasted it in chat, so the agent should find that paste" }, { met: () => "" })?.verdict === "user");
  ok("…but stands when the vault has one for that step", T.unheldClaim(q, claims, { met: () => "example api key" }) === null);
  ok("…and an answer that claims nothing of a key is left alone", T.unheldClaim(q, { verdict: "answered", answer: "Use the staging server first, as you said on 3 Nov." }, { met: () => "" }) === null);
  const j = await T.judge(q, {}, { write: async () => ({ text: JSON.stringify(claims) }), met: () => "" });
  ok("judge() applies it to the AI's verdict", j.verdict === "user", j);
} finally { try { chmodSync(C, 0o700); } catch {} rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
