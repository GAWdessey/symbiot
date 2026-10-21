// The phone as the hand for codes and proofs (phone.mjs codeAsk/heardCode/code.give/proof.answer,
// vault.mjs saveCode). Zoho asked for three 7-digit codes in a row on 20 Oct 2026, each one an
// ANSWERS.md line typed by hand; proofs went through WhatsApp Web to the user's own number. Now
// a card that waits for a site's code takes it from the phone (only that site's, only once you
// switched it on, only the code), the vault keeps it for one use, and a proof shows on the phone
// with Send and Change. Isolated HOME (set before the modules load).
//
//   node test/codes.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-codes-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_VAULT = "file"; process.env.SYMBIOT_NO_POLL = "1";
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({ agentCmd: "" }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };
const put = (dir, f, text) => { mkdirSync(join(dir, ".symbiot"), { recursive: true }); writeFileSync(join(dir, ".symbiot", f), text); };
const read = (dir, f) => { try { return readFileSync(join(dir, ".symbiot", f), "utf8"); } catch { return ""; } };

const P = await import("../phone.mjs");
const V = await import("../vault.mjs");
try {
  console.log("WHICH QUESTIONS WAIT FOR A CODE, AND FROM WHICH SITE");
  const zoho = P.codeAsk({ q: "What's the 7-digit code zoho.com texted you?", options: ["👤 You (only you: the SMS code): type it here"] });
  ok("a question for a site's SMS code: that site", zoho && zoho.site === "zoho.com" && zoho.key === "zoho", zoho);
  ok("a site named, not its address", (P.codeAsk({ q: "Type the verification code that Namecheap sent to your phone" }) || {}).key === "namecheap");
  ok("an address with a sign-in part: the site's own name", P.siteKey("accounts.zoho.com") === "zoho" && P.siteKey("cp.smsportal.com") === "smsportal" && P.siteKey("www.domains.co.za") === "domains");
  ok("a code with no site named isn't offered (the phone passes on only the code it was asked for)", P.codeAsk({ q: "Type the code you got" }) === null);
  ok("a question that isn't for a code isn't either", P.codeAsk({ q: "Should I push the fix to zoho.com's DNS?" }) === null && P.codeAsk({ q: "Review the code in zoho.com's repo?" }) === null);
  // 21 Oct 2026: ops's own card quoted the real-phone check's card, and the phone offered it the button too
  const quoting = { q: "Can you press one button in Symbiot on your phone so the phone code check can finish?", context: "In Symbiot on your phone, find the card \"What's the 6-digit code codecheck.dev texted you?\" and press \"Let this phone pass on codecheck.dev's code\".", options: ["👤 You (only you: your phone): I pressed it, carry on", "Skip this part (leave the real-phone code check unfinished)"] };
  ok("a card that only quotes another card's code ask isn't waiting for that code", P.codeAsk(quoting) === null && P.codeAsk({ ...quoting, context: "Find the card “What's the 6-digit code codecheck.dev texted you?” on your phone." }) === null, P.codeAsk(quoting));
  ok("…while one that asks in its own words still is, with its site quoted or not", (P.codeAsk({ q: "What's the 6-digit code \"zoho.com\" texted you?" }) || {}).key === "zoho" && (P.codeAsk({ q: "What's the 6-digit code zoho.com texted you?", context: "It's for \"Zoho Mail\" on codecheck.dev." }) || {}).key === "zoho");

  console.log("THE CODE IN A NOTIFICATION, AND NOTHING ELSE");
  ok("\"Your Zoho verification code is 4829163\"", P.codeIn("Your Zoho verification code is 4829163. Don't share it.") === "4829163");
  ok("\"123 456 is your code\"", P.codeIn("123 456 is your Namecheap code") === "123456");
  ok("a letters-and-digits code", P.codeIn("Your one-time code: AB12-CD34") === "AB12-CD34");
  ok("a message with no code word passes nothing", P.codeIn("Meet at 1530 near gate 4829") === "");
  ok("a year isn't a code", P.codeIn("Your code expires in 2026, code below") === "");

  console.log("THE VAULT KEEPS A CODE FOR ONE USE, AND NOT PAST ITS TIME");
  const t0 = Date.now();
  ok("saved", V.saveCode("zoho.com code", "4829163", { now: t0 }).ok);
  ok("a newer code takes its place", V.saveCode("zoho.com code", "5550123", { now: t0 }).ok && V.getSecret("zoho.com code", { now: t0 }).value === "5550123");
  const used = V.getSecret("zoho.com code", { use: true, now: t0 + 1000 });
  ok("used once: it's gone, not just marked", used.ok && used.value === "5550123" && used.left === 0 && !V.listSecrets().some((x) => x.name === "zoho.com code"), [used, V.listSecrets()]);
  V.saveCode("late code", "1111", { now: t0, ttl: 60000 });
  const late = V.getSecret("late code", { now: t0 + 61000 });
  ok("out of time: refused, and gone", late.error && /ran out of time/.test(late.error) && !V.listSecrets().some((x) => x.name === "late code"), late);

  console.log("ON THE COMPUTER — the snapshot says which card waits for a code, and shows a proof");
  const lane = join(HOME, "work", "mail"); mkdirSync(lane, { recursive: true });
  put(lane, "QUESTIONS.md", "## Questions\n### What's the 7-digit code zoho.com texted you?\nZoho wants it to finish signing in.\n- 👤 You (only you: the SMS code): type it here\n- Skip this part\n");
  put(lane, "PROOF.md", "# The invite SMS, before it goes to the broker\nKind: sms\nTo: the broker\n\nHi! You're invited to try the app: reply YES to start.\n");
  writeFileSync(join(CFG, "runs.json"), JSON.stringify([{ id: "r1", name: "mail", path: lane, startedAt: Date.now() - 60000 }]));
  const snap = await P.snapshot({ fresh: true }), ask = snap.asks.find((a) => a.path === lane), q = ask && ask.questions[0];
  ok("the question carries the site its code is from", q && q.code && q.code.key === "zoho" && q.code.site === "zoho.com", ask);
  const pr = snap.proofs.find((x) => x.path === lane);
  ok("the proof: its title, kind, who it goes to and the message as it goes out", pr && pr.kind === "sms" && pr.to === "the broker" && /reply YES to start/.test(pr.body) && /invite SMS/.test(pr.title) && /^proof:/.test(pr.id), pr);

  console.log("ON THE COMPUTER — a code from the phone");
  const bad = await P.applyOps([{ id: "op-bad-0001", op: "code.give", args: { path: lane, key: "zoho", q: q.q, code: "not a code!" } }], { name: "Galaxy" });
  ok("something that isn't a code is refused", bad.results[0].error && /didn't look like a code/.test(bad.results[0].error), bad.results);
  const wrong = await P.applyOps([{ id: "op-wrong-001", op: "code.give", args: { path: lane, key: "paypal", q: q.q, code: "123456" } }], { name: "Galaxy" });
  ok("a code for a site nothing waits for isn't kept", /isn't kept|wasn't kept/.test(wrong.results[0].error || "") && !V.listSecrets().some((x) => /paypal/.test(x.name)), wrong.results);
  const give = await P.applyOps([{ id: "op-give-0001", op: "code.give", args: { path: lane, key: "zoho", q: q.q, code: "4829163" } }], { name: "Galaxy" });
  ok("the waiting one: into the vault for one use", give.results[0].ok && give.results[0].kept === "zoho.com code" && V.getSecret("zoho.com code").value === "4829163", give.results);
  const ans = read(lane, "ANSWERS.md");
  ok("…and the agent is told its name and how to read it, never the code", /zoho\.com code/.test(ans) && /symbiot secret get "zoho\.com code" --use/.test(ans) && !ans.includes("4829163"), ans);

  console.log("ON THE COMPUTER — Send or Change on a proof");
  const stale = await P.applyOps([{ id: "op-proof-old", op: "proof.answer", args: { path: lane, id: "proof:000000000000", send: true } }], { name: "Galaxy" });
  ok("a proof that changed since the phone showed it isn't sent", /changed or went/.test(stale.results[0].error || "") && existsSync(join(lane, ".symbiot", "PROOF.md")), stale.results);
  const ch = await P.applyOps([{ id: "op-proof-chg", op: "proof.answer", args: { path: lane, id: pr.id, change: "say hello with their name" } }], { name: "Galaxy" });
  ok("Change: the agent is told what to change, and to show it again", ch.results[0].ok && !ch.results[0].sent && /### Proof: The invite SMS[\s\S]*Change it: say hello with their name[\s\S]*PROOF\.md for another look/.test(read(lane, "ANSWERS.md")) && !existsSync(join(lane, ".symbiot", "PROOF.md")), [ch.results, read(lane, "ANSWERS.md").slice(-300)]);
  put(lane, "PROOF.md", "# The invite SMS, again\nKind: sms\nTo: the broker\n\nHi Sam! You're invited: reply YES to start.\n");
  const pr2 = (await P.snapshot({ fresh: true })).proofs.find((x) => x.path === lane);
  const send = await P.applyOps([{ id: "op-proof-snd", op: "proof.answer", args: { path: lane, id: pr2.id, send: true } }], { name: "Galaxy" });
  ok("Send: the agent is told to send it as shown, and the card goes", send.results[0].ok && send.results[0].sent && /Send it, exactly as shown/.test(read(lane, "ANSWERS.md")) && !(await P.snapshot({ fresh: true })).proofs.length, send.results);

  console.log("ON THE PHONE — only a switched-on site's code, from that site, goes");
  const cfg = JSON.parse(readFileSync(join(CFG, "config.json"), "utf8")); cfg.computer = { name: "pop-os", url: "http://127.0.0.1:1", fp: "x" }; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfg));
  writeFileSync(join(CFG, "computer.json"), JSON.stringify({ v: "1", name: "pop-os", tasks: [], needs: [], approves: [], proofs: [], asks: [{ id: "ask:1", path: lane, name: "mail", questions: [{ q: q.q, options: [], code: q.code }] }] }));
  const queue = () => { try { return JSON.parse(readFileSync(join(CFG, "phone-queue.json"), "utf8")); } catch { return []; } };
  ok("off by default: nothing passes", P.heardCode({ app: "com.google.android.apps.messaging", title: "Zoho", text: "Your Zoho verification code is 4829163" }).ignored && !queue().length, queue());
  ok("switched on for zoho", P.setCodeRelay("zoho.com", true).copy.codesOn.join() === "zoho");
  ok("a code from another site doesn't pass", P.heardCode({ app: "com.google.android.apps.messaging", title: "PayPal", text: "PayPal: your code is 902211" }).ignored && !queue().length, queue());
  ok("a Zoho message without a code doesn't either", P.heardCode({ app: "x", title: "Zoho", text: "Your Zoho invoice is ready" }).ignored && !queue().length);
  const heard = P.heardCode({ app: "com.google.android.apps.messaging", title: "Zoho", text: "Your Zoho verification code is 4829163. Don't share it." });
  const sent = queue();
  ok("Zoho's code passes, to the card waiting for it", heard.passed === "zoho.com" && sent.length === 1 && sent[0].op === "code.give" && sent[0].args.path === lane && sent[0].args.key === "zoho", [heard, sent]);
  ok("…and only the code goes, none of the message", sent[0].args.code === "4829163" && !JSON.stringify(sent[0]).includes("Don't share"), sent[0]);
  ok("the card says it's on its way", (P.computerView().copy.asks[0] || {}).waiting === true);
  ok("switched off again: none of it is kept", !P.setCodeRelay("zoho", false).copy.codesOn.length);

  console.log("THE REAL-PHONE CHECK (scripts/phone-codes-check.mjs) — its question and notifications read as meant");
  const S = await import("../scripts/phone-codes-check.mjs"), { parseQuestions } = await import("../agents.mjs");
  const sq = parseQuestions(S.QUESTIONS_MD("2026-10-21")).questions;
  ok("its scratch question is one card with two options", sq.length === 1 && sq[0].q === S.QUESTION && sq[0].options.length === 2, sq);
  const sc = P.codeAsk(sq[0]);
  ok(`…waiting for ${S.SITE}'s code`, sc && sc.site === S.SITE && sc.key === "codecheck", sc);
  ok("its notification's code is read, and only that", P.codeIn(S.NOTE("482913").text) === "482913");
  writeFileSync(join(CFG, "phone-queue.json"), "[]");
  writeFileSync(join(CFG, "computer.json"), JSON.stringify({ v: "2", name: "pop-os", tasks: [], needs: [], approves: [], proofs: [], asks: [{ id: "ask:2", path: lane, name: "codecheck", questions: [{ q: sq[0].q, options: [], code: sc }] }] }));
  P.setCodeRelay(S.SITE, true);
  ok("its decoy from another site goes nowhere", P.heardCode({ app: "com.android.shell", ...S.DECOY }).ignored && !queue().length, queue());
  const sh = P.heardCode({ app: "com.android.shell", ...S.NOTE("482913") });
  ok("its notification, posted from Android's shell, passes the code to the card", sh.passed === S.SITE && queue().length === 1 && queue()[0].args.code === "482913" && queue()[0].args.key === "codecheck", [sh, queue()]);
  P.setCodeRelay(S.SITE, false);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} codes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
