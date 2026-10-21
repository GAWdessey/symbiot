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
  // and a second card, for the code a card answered "Skip" on the phone (below)
  const lane2 = join(HOME, "work", "bank"); mkdirSync(lane2, { recursive: true });
  put(lane2, "QUESTIONS.md", "## Questions\n### Which 6-digit code did namecheap.com text you?\nNamecheap wants it for the transfer.\n- 👤 You (only you: the SMS code): let your phone pass it on\n- Skip this part\n");
  writeFileSync(join(CFG, "runs.json"), JSON.stringify([{ id: "r1", name: "mail", path: lane, startedAt: Date.now() - 60000 }, { id: "r2", name: "bank", path: lane2, startedAt: Date.now() - 60000 }]));
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
  {
    // 21 Oct 2026, the real phone: "Skip" pressed on the card while its code was on the way, and the code still went into the vault
    const q2 = snap.asks.find((a) => a.path === lane2).questions[0];
    const both = await P.applyOps([{ id: "op-skip-0001", op: "agent.answer", args: { path: lane2, answers: [{ q: q2.q, a: "Skip this part" }] } }, { id: "op-late-0001", op: "code.give", args: { path: lane2, key: q2.code.key, q: q2.q, code: "551234" } }], { name: "Galaxy" });
    const ans2 = read(lane2, "ANSWERS.md");
    ok("a code for a card already answered Skip isn't kept, and Skip stays its one answer", both.results[0].ok && /answered already|wasn't kept/.test(both.results[1].error || "") && !V.listSecrets().some((x) => /namecheap/.test(x.name)) && (ans2.match(/^### /gm) || []).length === 1 && !ans2.includes("vault"), [both.results, ans2]);
  }

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
  writeFileSync(join(CFG, "phone-queue.json"), JSON.stringify([{ id: "op-skip-0002", at: Date.now(), op: "agent.answer", args: { path: lane, answers: [{ q: q.q, a: "Skip this part" }] } }]));
  ok("a card answered here, not yet taken by the computer, gets no code", P.heardCode({ app: "com.google.android.apps.messaging", title: "Zoho", text: "Your Zoho verification code is 4829163" }).ignored && queue().length === 1 && queue()[0].op === "agent.answer", queue());
  writeFileSync(join(CFG, "phone-queue.json"), "[]");
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
  ok("its question is this run's own: its words and its id name the run", /^Phone check \w+:/.test(S.QUESTION) && /^codecheck-\w+$/.test(sq[0].id || "") && S.QUESTION.includes(sq[0].id.slice(10)), [S.QUESTION, sq[0].id]);
  ok("…and the card says it's a test, nothing to type, its switch the one thing to press", /\btest\b/i.test(sq[0].context) && /not a real site/i.test(sq[0].context) && /don't type/i.test(sq[0].context) && /switch/i.test(sq[0].context), sq[0].context);
  const src = readFileSync(new URL("../scripts/phone-codes-check.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  ok("the check never launches the app or pairs the phone, and posts the test code once", !/\bam\b[^\n]*\bstart\b|symbiot:\/\/pair/.test(src) && (src.match(/post\(`codecheck-\$\{RUN\}`, NOTE\(A\)\)/g) || []).length === 1 && !/while \([^)]*got !== A/.test(src));

  console.log("ON THE PHONE — a code card's switch is its main button, and its own 👤 code answer doesn't close it (21 Oct 2026: pressed for the switch, it answered the card)");
  {
    // the page's own renderComputer (ui.mjs), with a stand-in DOM: each button of the card, pressed, says what it did
    const { EMBEDDED_UI } = await import("../ui.mjs");
    const uiJs = [...EMBEDDED_UI.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
    const grab = (name) => { const i = uiJs.indexOf("function " + name + "("); let depth = 0, j = uiJs.indexOf("{", i); for (; j < uiJs.length; j++) { if (uiJs[j] === "{") depth++; else if (uiJs[j] === "}" && --depth === 0) break; } return uiJs.slice(i, j + 1); };
    const card = (options, { android = true, on = [] } = {}) => {
      const did = [], btn = (html, box) => { const cls = (html.match(/class='([^']*)'/) || [])[1] || "", at = (k) => (html.match(new RegExp(k + "='([^']*)'")) || [])[1] ?? null, ev = {};
        return { cls, text: html.replace(/<[^>]+>/g, "").trim(), disabled: false, getAttribute: at, closest: () => box, addEventListener: (k, f) => { ev[k] = f; }, click: () => ev.click && ev.click() }; };
      // one stand-in per button of the card's own (not its form's Send), kept, so a handler wired to it is there when it's pressed
      let parsed = null;
      const el = { innerHTML: "", contains: () => false, querySelector: () => null, querySelectorAll: (sel) => {
        const boxes = parsed || (parsed = [...el.innerHTML.matchAll(/<div class='pcq' data-ask='(\d+)'>([\s\S]*?)(?=<div class='pcq|<div class='pshead|$)/g)].map((m) => { const box = { getAttribute: () => m[1], html: m[2] };
          box.buttons = [...m[2].matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map((b) => btn(b[0], box)).filter((b) => /\bpc(?:opt|codes)\b/.test(b.cls)); box.querySelectorAll = (s) => box.buttons.filter((b) => s === ".pcopt" ? /\bpcopt\b/.test(b.cls) : false); box.querySelector = () => null; return box; }));
        if (sel === ".pcq[data-ask]") return boxes; if (sel === ".pccodes") return boxes.flatMap((b) => b.buttons.filter((x) => /\bpccodes\b/.test(x.cls))); return []; } };
      const ln = { innerHTML: "" }, $ = (id) => (id === "pcbody" ? el : id === "pcline" ? ln : null);
      const PCV = { role: "phone", paired: true, name: "pop-os", heard: Date.now(), copy: { asks: [{ id: "ask:1", path: "/x/ops", name: "ops", questions: [{ q: "Phone check abc: which 6-digit code did codecheck.dev text you?", options, code: { site: "codecheck.dev", key: "codecheck" } }] }], codesOn: on, tasks: [] } };
      const window = android ? { SymbiotAndroid: { codes: () => '{"allowed":true}', allowCodes: () => did.push("allowCodes") } } : {};
      const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");
      const run = new Function("window", "SymbiotAndroid", "document", "$", "LQ", "LQNAMES", "lqTitle", "esc", "escQ", "projChip", "agoTxt", "pcTime", "okUrl", "api", "pcDo", "PCV",
        `${grab("pcSwitchOpt")}\n${grab("pcOpts")}\n${grab("renderComputer")}\nrenderComputer();`);
      run(window, window.SymbiotAndroid, { activeElement: null }, $, {}, {}, () => {}, esc, esc, () => "", () => "just now", () => "", (u) => u,
        (path, body) => { did.push(["api", path, body]); return { then: () => {} }; }, (op, body) => did.push([op, body]), PCV);
      const box = el.querySelectorAll(".pcq[data-ask]")[0], buttons = box ? box.buttons : [];
      return { html: box ? box.html : el.innerHTML, buttons, press: (b) => { did.length = 0; b.click(); return did.slice(); } };
    };
    const OPTS = ["👤 You (only you: the SMS code): let your phone pass it on", "Skip this part"];
    const c = card(OPTS), [first] = c.buttons;
    ok("on Android, the card's first button is the switch, and it's the big one", first && /\bpccodes\b/.test(first.cls) && /\bact\b/.test(first.cls) && /pass on codecheck\.dev/.test(first.text), c.buttons.map((b) => [b.cls, b.text]));
    ok("…its own 👤 code answer isn't on the card: it only restated the switch", !c.buttons.some((b) => /only you: the SMS code/.test(b.text)), c.buttons.map((b) => b.text));
    const pressed = first ? c.press(first) : [];
    ok("pressing the main button turns the relay on and doesn't answer the card", pressed.some((x) => x[0] === "api" && x[1] === "/api/phone/codes" && x[2].on === true && x[2].key === "codecheck") && !pressed.some((x) => x[0] === "agent.answer"), pressed);
    const skip = c.buttons.find((b) => b.text === "Skip this part"), skipped = skip ? c.press(skip) : [];
    ok("…the other answer is still there, small, and answers with its own words", skip && /\bghost\b/.test(skip.cls) && skipped.some((x) => x[0] === "agent.answer" && x[1].answers[0].a === "Skip this part"), [skip && skip.cls, skipped]);
    const typed = card(["👤 You (only you: the 6-digit code): type it here", "Skip this part"]);
    ok("a 👤 code answer worded another way isn't on it either", !typed.buttons.some((b) => /type it here/.test(b.text)) && /\bpccodes\b/.test((typed.buttons[0] || {}).cls), typed.buttons.map((b) => b.text));
    const plain = card(["Yes, it came", "Skip this part"]);
    ok("answers that aren't the switch stay, after it", plain.buttons.length === 3 && /\bpccodes\b/.test(plain.buttons[0].cls) && plain.buttons[1].text === "Yes, it came" && /\bghost\b/.test(plain.buttons[1].cls), plain.buttons.map((b) => b.text));
    const onNow = card(OPTS, { on: ["codecheck"] });
    ok("switched on: the card says so first, with Stop, and still no 👤 code answer", /^This phone passes on the code codecheck\.dev texts you/.test(onNow.html.replace(/^[\s\S]*?<div class='pccode'>/, "")) && /\bpccodes\b/.test((onNow.buttons[0] || {}).cls) && onNow.buttons[0].text === "Stop" && !onNow.buttons.some((b) => /SMS code/.test(b.text)), onNow.buttons.map((b) => b.text));
    const desk = card(OPTS, { android: false });
    ok("off Android (no switch to press), the card keeps its answers as written, the first one big", desk.buttons.length === 2 && /\bact\b/.test(desk.buttons[0].cls) && /SMS code/.test(desk.buttons[0].text) && !/pccodes/.test(desk.html), desk.buttons.map((b) => [b.cls, b.text]));
  }

  console.log("A CODE TYPED ON A CODE CARD ISN'T KEPT IN THE SHARED RECORD (21 Oct 2026: it was, for other agents' briefs)");
  const D = await import("../asksdone.mjs"), DONE = join(CFG, "asks-done.json");
  const cq = "What's the 6-digit code codecheck.dev texted you?";
  D.recordDone(cq, "820119", "ops");
  const rec = D.doneList().find((x) => x.q === cq);
  ok("it's recorded as answered, without the code", rec && rec.code && !rec.a.includes("820119") && !readFileSync(DONE, "utf8").includes("820119"), rec);
  ok("…so no brief carries it", !D.doneBrief("ops").join("\n").includes("820119"), D.doneBrief("ops"));
  ok("the same code ask again isn't answered from it: a code is one use", !D.heldBy(cq, { lane: "ops" }) && !D.isDone(cq));
  D.recordDone("Which plan should Pro be sold on?", "the yearly one, 1200 a year", "ops");
  ok("an answer with a number in it, to a question that isn't a code ask, is kept as it was", D.doneList().some((x) => x.a === "the yearly one, 1200 a year" && !x.code) && D.isDone("Which plan should Pro be sold on?"));
  D.recordDone("Should I merge it?", "yes, the code is 482913 if it asks", "ops");
  ok("a code in an answer to any question isn't kept either", !readFileSync(DONE, "utf8").includes("482913"));
  writeFileSync(DONE, JSON.stringify([{ k: "whats the 6 digit code codecheck dev texted you", q: cq, a: "820119", lane: "ops", ts: Date.now() }]));
  ok("a code kept before this isn't read back…", !JSON.stringify(D.doneList()).includes("820119") && !D.heldBy(cq, { lane: "ops" }), D.doneList());
  D.recordDone("Which plan should Pro be sold on?", "monthly", "ops");
  ok("…and is cleaned from the file with the next answer", !readFileSync(DONE, "utf8").includes("820119"));
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} codes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
