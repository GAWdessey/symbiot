// The Go card on a held press in the user's own Chrome (chromegate.mjs, plain.mjs, agents.mjs answerQuestions), from
// the UI review of 26 Oct 2026: its button names the press (Send, Pay R 289), a Don't beside it closes the hold, the
// hold's own line says where and what, only a Go opens it (typed words go to the agent and leave it shut), and what
// came of each Go is kept (sent, lapsed, refused). Also the Vault's "Fills only on", set and changed by the user.
// Isolated HOME.
//
//   node test/gocards.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-gocards-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_VAULT = "file";
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const G = await import("../chromegate.mjs");
const A = await import("../agents.mjs");
const o = { home: HOME };
const folder = (n) => { const f = join(CFG, "drafts", n); mkdirSync(join(f, ".symbiot"), { recursive: true }); writeFileSync(join(f, ".symbiot", "handoff.json"), JSON.stringify({ name: "Agent: Reply to Pat Lee about the March invoices" })); return f; };
const ask = (f, q, id, opt, context = "") => writeFileSync(join(f, ".symbiot", "QUESTIONS.md"), `## Questions\n### ${q} {#chrome-go-${id}}\n${context ? context + "\n" : ""}- ${opt}\n`);
const answers = (f) => { try { return readFileSync(join(f, ".symbiot", "ANSWERS.md"), "utf8"); } catch { return ""; } };

try {
  console.log("THE CARD — named for the press, with its no, and the hold's own line");
  const send = G.holdOrGo("mail.google.com", "Clicks Send on the reply to Pat Lee", "send", o);
  const f1 = folder("act-go1"), Q1 = "Send the reply to Pat Lee about the March invoices from your Gmail?";
  ask(f1, Q1, send.held, "🤖 Agent: go ahead: Clicks Send on the reply to Pat Lee", "It says the two invoices are paid.");
  const q1 = A.agentQuestions(f1, "").questions[0];
  ok("two choices: its Go and a Don't", q1 && q1.options.length === 2 && /^Don't send: the user said no/.test(q1.options[1]), q1);
  ok("…shown as Send and Don't send", q1 && q1.labels && q1.labels[0] === "Send" && q1.labels[1] === "Don't send", q1 && q1.labels);
  ok("…with the hold's line: where, and what's pressed", q1 && q1.go && q1.go.line === "In your Chrome, on mail.google.com: Clicks Send on the reply to Pat Lee", q1 && q1.go);
  const pay = G.holdOrGo("www.domains.co.za", "Clicks Pay now for the ghost-ai.co.za renewal", "pay", o), f2 = folder("act-go2");
  ask(f2, "Pay R 289 to renew ghost-ai.co.za for a year on domains.co.za?", pay.held, "🤖 Agent: go ahead: Clicks Pay now for the ghost-ai.co.za renewal", "The site may hold or charge money on the card once it's added: about R 289.");
  const q2 = A.agentQuestions(f2, "").questions[0];
  ok("a payment: Pay R 289 and Don't pay, with its money line", q2.labels[0] === "Pay R 289" && q2.labels[1] === "Don't pay" && /about R 289/.test(q2.go.money || ""), q2);
  const words = (kind, summary, host = "example.com") => G.goWords({ id: "x", host, kind, summary });
  ok("Delete, Fill password and Fill code", words("delete", "Clicks Delete on the old draft").button === "Delete" && words("fill", 'Fills your saved "github password" on github.com').button === "Fill password" && words("fill", 'Fills your saved "github recovery codes" on github.com').button === "Fill code");
  const mail = words("send", 'Replies "Re: invoices" to pat@example.com through Gmail', "connector:Gmail");
  ok("a connector's send: Send reply, and the line says through which, once", mail.button === "Send reply" && mail.dont === "Don't send" && mail.line === 'Through Gmail: Replies "Re: invoices" to pat@example.com', mail);
  const { plainAsk } = await import("../plain.mjs");
  const home = plainAsk(f2, A.agentQuestions(f2, "").questions[0]);
  ok("Home's card gets the same labels, line and money", home.labels && home.labels[0] === "Pay R 289" && home.go && /domains\.co\.za/.test(home.go.line) && !!home.go.money, home);

  console.log("ONLY A GO OPENS IT — typed words go to the agent and leave it shut");
  for (const t of ["Not yet", "Please don't send it", "Wait, change the subject first", "Only after Pat confirms"]) {
    const r = A.answerQuestions(f1, [{ q: Q1, a: t }]);
    ok(`"${t}": said to the agent on the card, the hold stays shut`, r.ok && Array.isArray(r.talk) && !G.holdOf(send.held, o).go && !G.holdOf(send.held, o).no, { r, h: G.holdOf(send.held, o) });
  }
  ok("…the card is still open", A.agentQuestions(f1, "").questions.length === 1);
  ok("…and the agent has the words, told it's not a Go", /The user's words on your Go card, not a Go/.test(answers(f1)) && /Wait, change the subject first/.test(answers(f1)) && /nothing was pressed/.test(answers(f1)));
  for (const t of ["yes", "Send", "go ahead"]) ok(`"${t}" is a Go`, G.goAnswer(t, { options: q1.options, button: "Send" }) === "go");
  ok("\"Yes, but change the subject\" isn't", G.goAnswer("Yes, but change the subject", { options: q1.options, button: "Send" }) === "");
  const r1 = A.answerQuestions(f1, [{ q: Q1, a: q1.options[0] }]);
  ok("the Go button opens it, and says what happens next", !!G.holdOf(send.held, o).go && /^Go given: Symbiot presses Send on mail\.google\.com once, when its agent tries again \(within 30 minutes\)\.$/.test(r1.go || ""), r1);
  ok("…for that agent", G.holdOf(send.held, o).path === f1 && G.holdOf(send.held, o).agent === "Reply to Pat Lee about the March invoices", G.holdOf(send.held, o));

  console.log("DON'T — closes it and tells the agent");
  const f3 = folder("act-go3"), del = G.holdOrGo("drive.google.com", "Clicks Delete on the Q3 folder", "delete", o), Q3 = "Delete the Q3 folder in your Drive?";
  ask(f3, Q3, del.held, "🤖 Agent: go ahead: Clicks Delete on the Q3 folder");
  const q3 = A.agentQuestions(f3, "").questions[0];
  A.answerQuestions(f3, [{ q: Q3, a: q3.options[1] }]);
  ok("Don't delete: the hold is closed, nothing went", !!G.holdOf(del.held, o).no && !G.holdOf(del.held, o).go);
  ok("…its agent is told", /Don't delete: the user said no, so nothing was pressed/.test(answers(f3)));
  ok("…the card is settled", A.agentQuestions(f3, "").questions.length === 0);
  const again = G.holdOrGo("drive.google.com", "Clicks Delete on the Q3 folder", "delete", o);
  ok("asked for again, it's a new card, not the closed one", again.held && again.held !== del.held, again);
  const f4 = folder("act-go4"), del2 = G.holdOrGo("drive.google.com", "Clicks Delete on the Q4 folder", "delete", o);
  ask(f4, "Delete the Q4 folder in your Drive?", del2.held, "🤖 Agent: go ahead: Clicks Delete on the Q4 folder");
  A.answerQuestions(f4, [{ q: "Delete the Q4 folder in your Drive?", a: "no" }]);
  ok("a typed no is a no too", !!G.holdOf(del2.held, o).no && /that's a no, so the hold is closed/.test(answers(f4)));

  console.log("WHAT CAME OF EACH GO — kept, for Settings and the agent's block");
  let used = ""; ok("the retry goes through once", G.holdOrGo("mail.google.com", "Clicks Send on the reply to Pat Lee", "send", { ...o, onUse: (id) => { used = id; } }) === null && used === send.held);
  ok("…and is noted as sent once its press landed", G.settleHold(send.held, { ok: true }, o) && G.goHistory(o).find((h) => h.id === send.held).state === "done" && G.goHistory(o).find((h) => h.id === send.held).landed);
  const pend = G.holdOrGo("x.example.com", "Clicks Post", "send", o); G.goAhead(pend.held, o);
  ok("a Go not used yet waits, until 30 minutes after", G.goHistory(o).find((h) => h.id === pend.held).state === "given");
  ok("…then it has lapsed", G.goHistory({ ...o, now: Date.now() + G.GO_FOR + 1000 }).find((h) => h.id === pend.held).state === "lapsed");
  ok("a Don't is kept as refused", G.goHistory(o).find((h) => h.id === del.held).state === "refused");
  G.settleHold(pend.held, { ok: false, error: "Your Chrome didn't answer" }, o);
  ok("a press that failed says what went wrong", G.goHistory(o).find((h) => h.id === pend.held).state === "failed" && G.goHistory(o).find((h) => h.id === pend.held).error === "Your Chrome didn't answer");
  ok("one agent's only, for its block", G.goHistory({ ...o, path: f1 }).length === 1 && G.goHistory({ ...o, path: f1 })[0].id === send.held);
  ok("a hold only asked about isn't in the history", !G.goHistory(o).some((h) => h.id === pay.held));

  console.log("THE VAULT'S \"FILLS ONLY ON\" — set when adding, changed or cleared later");
  const V = await import("../vaultview.mjs"), { listSecrets } = await import("../vault.mjs");
  const t = V.setPin("harbour-41").token;
  const add = V.addEntry({ label: "github password", account: "pat@example.com", values: ["Brisk7Otter!92"], site: "https://www.github.com/login", token: t });
  ok("added with a website: it fills only on that site", add.ok && add.site === "github.com" && listSecrets().find((s) => s.name === add.name).site === "github.com", add);
  ok("a website that isn't one is refused", /isn't a website/.test(V.addEntry({ label: "x", values: ["y"], site: "not a site", token: t }).error || ""));
  const ed = V.renameEntry(add.name, { label: "github password", account: "pat@example.com", site: "gitlab.com", token: t });
  ok("changed later", ed.ok && listSecrets().find((s) => s.name === add.name).site === "gitlab.com", ed);
  V.renameEntry(add.name, { label: "github password", account: "pat@example.com", site: "", token: t });
  ok("…or cleared: it asks before its next fill", !listSecrets().find((s) => s.name === add.name).site);
  ok("…each change logged, without the value", V.vaultLog().some((x) => x.act === "site" && x.site === "gitlab.com") && V.vaultLog().some((x) => x.act === "site" && !x.site));
  ok("locked, nothing changes", V.renameEntry(add.name, { label: "github password", site: "evil.example", token: "nope" }).locked === true && !listSecrets().find((s) => s.name === add.name).site);
  V.renameEntry(add.name, { label: "github password", account: "pat@example.com", token: t });
  ok("a rename that doesn't mention the site leaves it as it is", !listSecrets().find((s) => s.name === add.name).site);
  const tidy = V.renameEntry(add.name, { label: "GitHub password", account: "pat@example.com", site: "github.com", token: t });
  ok("saving the form as it shows (a tidied label) keeps the name agents ask for, while the site changes", tidy.ok && tidy.name === add.name && listSecrets().find((s) => s.name === add.name).site === "github.com", tidy);
  ok("…a real rename still renames", V.renameEntry(add.name, { label: "GitHub work password", account: "pat@example.com", token: t }).name === "GitHub work password (pat@example.com)");
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} gocards: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
