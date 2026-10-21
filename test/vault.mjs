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
  // 20 Oct 2026 review, finding 3: the scrub rewrote run logs and briefs by text, and "Symbiot's" became "[saved: password]" in 77 places
  ok("the old password goes to the vault, and the chat, its reply and the answered record become [saved: …]", left.join() === join("drafts", "act-1", ".symbiot", "agent.log") && sc.found.includes("lemon squeezy password (jane@example.com)") && getSecret("lemon squeezy password (jane@example.com)").ok && sc.files.filter((f) => !f.endsWith(".bak")).length === 2 && readFileSync(mf, "utf8").includes("[saved: lemon squeezy password (jane@example.com)]"), { sc, left });
  ok("…a run's log is never rewritten", readFileSync(join(run, "agent.log"), "utf8").includes(old));
  const jn = readFileSync(join(CFG, "scrub-journal.json"), "utf8");
  ok("…and each swap is journalled, its value sealed, so a wrong one can be undone exactly", JSON.parse(jn).length >= 3 && !jn.includes(old) && JSON.parse(jn).every((e) => e.mark && e.value && typeof e.before === "string"), jn.slice(0, 300));
  ok("…the files it rewrote still read", !!JSON.parse(readFileSync(mf, "utf8")).log && JSON.parse(readFileSync(join(CFG, "asks-done.json"), "utf8"))[0].a.includes("[saved:"));
  ok("…and once done, it doesn't run again at start", scrubStored().skipped === true);
  console.log("A WORD TAKEN FOR A PASSWORD — never again, and put back");
  ok("\"Symbiot's\", \"don't\" or an Azure subscription id in a sentence about an account isn't a password", !findSecrets("i signed up to lemon squeezy, it's in Symbiot's vault").found.length && !findSecrets("Account information Subscription ID: 3f2504e0-4f89-41d3-9a0c-0305e82c3301 Subscription name: x").found.length && !findSecrets("my login: don't share it").found.length, [findSecrets("i signed up to lemon squeezy, it's in Symbiot's vault").found.map((f) => f.name)]);
  ok("…while a real one still is", findSecrets("login for acme.io is jane@example.com and Tq9#vbn2Lp, thanks").found.length === 1 && findSecrets("i signed up with jane@example.com Gale4Fjord$88").found.length === 1);
  const { repairFalseSaves, saveSecret } = await import("../vault.mjs");
  saveSecret("password", ["Symbiot's"]); saveSecret("twitter password", ["3f2504e0-4f89-41d3-9a0c-0305e82c3301"]); saveSecret("mixed password", ["Symbiot's", "Real9#pass"]);
  writeFileSync(join(CFG, "tasks.json"), JSON.stringify([{ id: "t9", text: "review [saved: password] startup, and [saved: password] website; id [saved: twitter password]; keep [saved: mixed password]" }]));
  const rp = repairFalseSaves({ force: true }), t9 = JSON.parse(readFileSync(join(CFG, "tasks.json"), "utf8"))[0].text;
  ok("a word wrongly vaulted goes back where it was blanked, and out of the vault", t9 === "review Symbiot's startup, and Symbiot's website; id 3f2504e0-4f89-41d3-9a0c-0305e82c3301; keep [saved: mixed password]" && !getSecret("password").ok && !getSecret("twitter password").ok && rp.restored.sort().join() === "password,twitter password", [rp, t9]);
  ok("…one that also holds a real value only loses the word", getSecret("mixed password").ok && getSecret("mixed password").value === "Real9#pass" && rp.dropped.join() === "mixed password", getSecret("mixed password"));
  ok("…and it runs once", repairFalseSaves().skipped === true);
  // the 0.66.x scrub left "[saved: password]" for "Symbiot's" with no journal: put back from the word after it
  writeFileSync(join(run, "agent.log"), "Blocked by [saved: password] membrane: npm publish.\nUse [saved: lemon password (a@b.co)] to sign in.\nIn [saved: x password] browser\n");
  const rp2 = repairFalseSaves({ force: true }), lg = readFileSync(join(run, "agent.log"), "utf8");
  ok("\"Blocked by [saved: password] membrane\" in a run's log reads \"Symbiot's membrane\" again", /Blocked by Symbiot's membrane: npm publish/.test(lg) && /In Symbiot's browser/.test(lg) && rp2.files.some((f) => f.endsWith("agent.log")), [lg, rp2]);
  ok("…a real password's mark stays", lg.includes("Use [saved: lemon password (a@b.co)] to sign in."), lg);

  console.log("A PASTED KEY, LATER QUOTED IN PIECES");
  const KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI5NGQ1OWNlZi1kYmI4LTRlYTUifQ." + "pu3l95JISSAlj-yNPyHtdA9l1gnmuIkp-vTqNJVzslGQY3JiTOPrt43-lKecwAGcbAV9VcmODwVyRoe5QnfHtONnbhsCnmutzSg9GD2Hex";
  const m2 = JSON.parse(readFileSync(mf, "utf8"));
  m2.log.push({ ts: 3, where: "Home", role: "assistant", text: "Paste the Lemon Squeezy API key (test mode) here and I'll save it." }, { ts: 4, where: "Home", role: "user", text: KEY });
  writeFileSync(mf, JSON.stringify(m2));
  const lane = join(HOME, "lane"); mkdirSync(join(lane, ".symbiot"), { recursive: true });
  writeFileSync(join(CFG, "runs.json"), JSON.stringify([{ path: lane, name: "lane", startedAt: 1 }]));
  writeFileSync(join(lane, ".symbiot", "TASKS.md"), `- [ ] Save the key: it begins '${KEY.slice(0, 64)}' and ends '${KEY.slice(-60)}'.\n`);
  writeFileSync(join(CFG, "tasks.json"), JSON.stringify([{ id: "t1", text: `a JWT beginning '${KEY.slice(0, 64)}' and ending '${KEY.slice(-60)}'` }]));
  const sc2 = scrubStored({ force: true }), lt = readFileSync(join(lane, ".symbiot", "TASKS.md"), "utf8"), tj = readFileSync(join(CFG, "tasks.json"), "utf8");
  ok("the key goes to the vault under the name the chat gave it", sc2.found.includes("lemon squeezy api key (test mode)") && getSecret("lemon squeezy api key (test mode)").ok, sc2.found);
  ok("…and the pieces of it quoted in a task are blanked too", !tj.includes(KEY.slice(-60)) && /\[saved: lemon squeezy api key \(test mode\)\]/.test(tj), tj);
  ok("…a lane's brief is a run's, and isn't rewritten", lt.includes(KEY.slice(-60)), lt);
  ok("…while what's around them stays", /^- \[ \] Save the key: it begins '/.test(lt) && JSON.parse(tj)[0].id === "t1");

  console.log("A JWT API KEY, AND A WAIT IT SATISFIES");
  const JWT = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9." + "eyJhdWQiOiI5NGQ1OWNlZi1kYmI4LTRlYTUtYjE3OC1kMjU0MGZjZDY5MTkiLCJzdWIiOiI4MjAwNjczIn0" + ".c2lnbmF0dXJlLXBhcnQtMTIzNDU2Nzg5MA";
  const jr = captureSecrets(`here is my lemon squeezy test api key ${JWT}`);
  ok("a JWT with no cue word is caught and named for what it is", jr.saved.join() === "lemon squeezy test api key" && !jr.text.includes("eyJ") && getSecret("lemon squeezy test api key").value === JWT, jr);
  const { meetsStep, serviceOf } = await import("../vault.mjs");
  const ASKED = "Symbiot: How should the Paddle test store get made? 👤 You (only you: your Paddle sign-in): at vendors.paddle.com in your own Chrome, in test mode, make a store, then under Settings → API make a key and paste it on Home";
  const JWT2 = JWT.replace("c2lnbmF0dXJl", "c2lnbmF0dXJm");
  const alone = captureSecrets(JWT2, { context: ASKED });
  ok("a key pasted alone is named from what was just asked for, not \"token\"", alone.saved.join() === "paddle api key (test mode)" && alone.text === "[saved: paddle api key (test mode)]" && getSecret("paddle api key (test mode)").value === JWT2, alone);
  ok("…the service as the chat wrote it, the last one mentioned, never Symbiot's own pages", serviceOf("your GitHub token… then on dash.cloudflare.com") === "cloudflare" && serviceOf("open Settings, then paste the Twilio auth token") === "twilio" && serviceOf("on the Workdesk, under Settings") === "", [serviceOf("your GitHub token… then on dash.cloudflare.com"), serviceOf("open Settings, then paste the Twilio auth token")]);
  ok("…and with nothing said about it, still \"token\"", findSecrets(`here ${JWT}`).found[0].name === "token" || findSecrets(`${JWT}`).found[0].name === "token", findSecrets(JWT).found);
  const wait = "You (only you: your Lemon Squeezy sign-in): make a store, then under Settings → API make a key and paste it on Home";
  ok("a key saved after the wait began meets a step that asks for it", /^lemon squeezy .*api key/.test(meetsStep(wait, 1)) && !/password/.test(meetsStep(wait, 1)));
  ok("…not one saved before it began", !meetsStep(wait, Date.now() + 60000));
  ok("…and not a step about something else", !meetsStep("You (only you: your phone): say ready and keep it with you", 1) && !meetsStep("paste the Twilio token on Home", 1));
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
