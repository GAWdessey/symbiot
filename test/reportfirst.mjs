// A report the user asked for before anything goes ahead (asksdone.mjs wantsReport, runReport,
// reportAsked; agents.mjs needsOf, chaseReport; home.mjs troubles, homeAnswer; sentmail.mjs
// unsentClaim, settleUnsent). On 21 Oct 2026 Garth asked twice, on a Go ahead card about a reply
// to a client, for a thorough report first. The run had written it, but the card never linked it:
// both answers went to the run as "Go ahead: …", it found its one task ticked and ended "nothing
// for me to do", and the same card came back. It also said an email was unsent that he had sent
// from Gmail himself. Isolated HOME.
//
//   node test/reportfirst.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-reportfirst-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const C = join(HOME, ".config", "symbiot");
mkdirSync(C, { recursive: true });
writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")] }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const S = await import("../asksdone.mjs");
const a = await import("../agents.mjs");
const H = await import("../home.mjs");
const M = await import("../sentmail.mjs");
const R = await import("../reports.mjs");

// an ops run's own folder, as on the day: its report, its last words, the user's answers
const run = join(C, "drafts", "act-bec1f0f5"), sym = join(run, ".symbiot");
mkdirSync(sym, { recursive: true });
const FINAL = "There was nothing for me to do on this run, and I changed nothing.\n\n- **Report:** the full report is in `.symbiot/WINLOVE-FULL-EMAIL-REPORT.md`. It's on Reports.\n- **Carla reply:** it's still an unsent draft in your garth@ghost-ai.co.za mail. I haven't sent it.";
const REPORT = join(sym, "WINLOVE-FULL-EMAIL-REPORT.md");
const answers = (...rows) => writeFileSync(join(sym, "ANSWERS.md"), `# Answers from the user\n${rows.map(([q, t]) => `\n### ${q}\n${t}\n_answered 2026-10-21_\n`).join("")}`);
const lastAnswer = () => readFileSync(join(sym, "ANSWERS.md"), "utf8").split("### ").pop();
const now = Date.now(), end = now - 60000, start = now - 600000;
try {
  console.log("1) WHICH ANSWERS ASK FOR A REPORT FIRST");
  for (const t of ["Go ahead: agreed give me a report first so i can see whats going on and then once i am happy we will proceed and only then.", "Go ahead: i saw it, i need the report first then we can send it.", "i think give me a thorough report first before we sendeverything so i can be on the same page as these guys", "show me the report before you send anything"])
    ok(`report first: ${t.slice(0, 60)}`, S.wantsReport(t) && S.asksBack(t));
  for (const t of ["go ahead, send it", "Go ahead: send it as written", "yes send it, the report was fine", "draft it", "Go ahead (recommended)"])
    ok(`not a report ask: ${t}`, !S.wantsReport(t) && !S.asksBack(t, ["Go ahead (recommended)"]));

  console.log("2) THE REPORT A RUN LEFT");
  ok("none yet: no report", S.runReport(run, { said: FINAL, own: true }) === null);
  writeFileSync(join(sym, "WINLOVE-JONO-EMAIL-REVIEW.md"), "# WinLove: the Jono email review\n\nOlder.\n");
  writeFileSync(REPORT, "# WinLove: full email report, every thread read (21 Oct 2026)\n\nEvery thread.\n");
  writeFileSync(join(sym, "CARRYON.md"), "# Where the last run got to\n\nNot a report.\n");
  const named = S.runReport(run, { said: FINAL });
  ok("the one its last words name, with the id Reports opens it by", named && named.file === REPORT && named.title === "WinLove: full email report, every thread read (21 Oct 2026)" && R.listReports({ folders: [run], running: () => false, seen: { seen: {} } }).some((r) => r.id === named.id), named);
  ok("...named without .md too (\"on Reports as WINLOVE-FULL-EMAIL-REPORT\")", (S.runReport(run, { said: "It's on Reports as WINLOVE-FULL-EMAIL-REPORT, read it." }) || {}).file === REPORT);
  ok("an ops run's folder: its newest, when nothing names one", !!S.runReport(run, { own: true }));
  ok("a lane's folder: none written since the run started, none named → null", S.runReport(run, { said: "nothing named", since: Date.now() + 60000 }) === null);
  ok("CARRYON.md is a run's note to the next, not a report: never on Reports", !R.listReports({ folders: [run], running: () => false, seen: { seen: {} } }).some((r) => r.name === "CARRYON.md"));

  console.log("3) THE CARD LINKS IT, AND A REPORT-FIRST ANSWER REWORDS IT");
  answers(["Should I send this reply to Carla at Smartcall about the WinLove test links?", "i think give me a thorough report first before we sendeverything"], ["Who should deal with the test links?", "draft it"]);
  let n = a.needsOf(run, { final: FINAL, end, start, now });
  ok("its card: the OK it waits on, and Read the report", n && n.kind === "approve" && /unsent draft/.test(n.what) && n.report && n.report.file === REPORT && !n.reportFirst, n);
  const list = [{ id: "r1", name: "Agent: Wed 21 Oct 2026. Garth asks: check Jono's emails…", path: run, status: "done", startedAt: start, endedAt: end, needs: n }];
  let card = H.troubles({ list }).find((c) => c.id === "needs:r1");
  ok("...on Home, with the report's id and title for its button", card && card.report && card.report.id === named.id && /WinLove: full email report/.test(card.report.title) && card.options[0] === "Go ahead (recommended)", card);
  answers(["Carla reply: it's still an unsent draft in your garth@ghost-ai.co.za mail.", "Go ahead: i saw it, i need the report first then we can send it."]);
  n = a.needsOf(run, { final: FINAL, end, start, now });
  ok("the newest answer asks for the report first: the card says where it is before it asks again", n && n.reportFirst && /^You asked for a report first: it's on Reports, "WinLove: full email report, every thread read \(21 Oct 2026\)"\. Once you've read it: Carla reply/.test(n.what), n);
  card = H.troubles({ list: [{ ...list[0], needs: n }] }).find((c) => c.id === "needs:r1");
  ok("...and Home shows that one, linked", card && /^You asked for a report first/.test(card.q) && card.report && card.report.id === named.id, card);
  rmSync(REPORT); rmSync(join(sym, "WINLOVE-JONO-EMAIL-REVIEW.md"));
  ok("no report yet: the same question doesn't come back at all", a.needsOf(run, { final: FINAL, end, start, now }) === null);
  writeFileSync(REPORT, "# WinLove: full email report, every thread read (21 Oct 2026)\n\nEvery thread.\n");

  console.log("4) \"I NEED THE REPORT FIRST\" TYPED ON A GO AHEAD CARD");
  answers(["Should I send this reply to Carla?", "draft it"]);
  n = a.needsOf(run, { final: FINAL, end, start, now });
  let ran = 0, settled = 0;
  const deps = () => ({ agents: () => [{ id: "r1", path: run, startedAt: start, endedAt: end, needs: n }], settle: () => settled++, run: () => { ran++; return { id: "run2" }; } });
  let h = H.homeAnswer("needs:r1", { text: "i saw it, i need the report first then we can send it" }, deps());
  ok("isn't a go-ahead: nothing runs, and they're pointed at the report", h.ok && ran === 0 && /It's on Reports already: "WinLove: full email report/.test(h.said) && h.reportId === named.id, h);
  ok("...its run is told not to go ahead, and where the report is", /hasn't said go ahead: they asked for a report first/.test(lastAnswer()) && /WINLOVE-FULL-EMAIL-REPORT\.md/.test(lastAnswer()) && !/^Go ahead/m.test(lastAnswer()), lastAnswer());
  n = a.needsOf(run, { final: FINAL, end, start, now });
  ok("...and the card comes back pointing at the report", n && n.reportFirst && n.report, n);
  settled = 0; h = H.homeAnswer("needs:r1", { text: "i need the report first" }, deps());
  ok("asked again on the reworded card: it stays, not settled", h.ok && settled === 0 && ran === 0, h);
  h = H.homeAnswer("needs:r1", { pick: 0 }, deps());
  ok("Go ahead on it, after reading: its agent goes ahead", h.ok && ran === 1 && /^Go ahead: do it as you had it/m.test(lastAnswer()), [h, lastAnswer()]);
  ok("...and the answer after it settles the report-first", S.reportAsked(readFileSync(join(sym, "ANSWERS.md"), "utf8")) === null);
  // no report written: as before, its agent writes one first (askBackNote), on a Go ahead card too
  rmSync(REPORT); answers(["Should I send this reply to Carla?", "draft it"]); ran = 0;
  n = a.needsOf(run, { final: FINAL, end, start, now });
  h = H.homeAnswer("needs:r1", { text: "Go ahead: agreed give me a report first so i can see whats going on" }, deps());
  ok("no report yet: its agent is started to write it, and told not to go ahead", h.ok && ran === 1 && /hasn't said go ahead: don't do it yet/.test(lastAnswer()) && /write it up now/.test(lastAnswer()), [h, lastAnswer()]);

  console.log("5) A RUN THAT ENDS WITH THAT ANSWER UNMET");
  writeFileSync(join(sym, "TASKS.md"), "# Tasks\n\n- [x] Check Jono's emails\n");
  const lane = join(HOME, "work", "dailify"), lsym = join(lane, ".symbiot"); mkdirSync(lsym, { recursive: true });
  writeFileSync(join(lsym, "TASKS.md"), "# Tasks\n\n- [x] the one task\n");
  writeFileSync(join(lsym, "ANSWERS.md"), "# Answers\n\n### Should I send it?\nGo ahead: i need the report first then we can send it.\n_answered 2026-10-21_\n");
  let chased = 0; const e = { status: "done", path: lane, startedAt: Date.now() - 1000 };
  ok("every task ticked, no report written or named: its agent is told and started again", a.chaseReport(e, { run: () => (chased++, { id: "x" }) }) && chased === 1 && /without writing one or naming one/.test(readFileSync(join(lsym, "ANSWERS.md"), "utf8")));
  ok("...once per answer, not round and round", a.chaseReport(e, { run: () => (chased++, { id: "x" }) }) === null && chased === 1);
  writeFileSync(join(lsym, "ANSWERS.md"), "# Answers\n\n### Should I post it?\nshow me the report before you post\n_answered 2026-10-21_\n");
  writeFileSync(join(lsym, "POST-REPORT.md"), "# The post, checked\n\nDone.\n");
  ok("a run that wrote the report is done: nothing more", a.chaseReport({ ...e, startedAt: Date.now() - 60000 }, { run: () => (chased++, { id: "x" }) }) === null && chased === 1);
  writeFileSync(join(lsym, "TASKS.md"), "# Tasks\n\n- [ ] still open\n");
  writeFileSync(join(lsym, "ANSWERS.md"), "# Answers\n\n### Should I post it?\ngive me a report first\n_answered 2026-10-21_\n");
  ok("one with an item still open: its next run gets there", a.chaseReport({ ...e, startedAt: Date.now() + 60000 }, { run: () => (chased++, { id: "x" }) }) === null && chased === 1);
  ok("a resumed run is told every item ticked isn't nothing to do, in words that survive the shell", /newest answer is your work/.test(a.UNMET) && a.CARRY_PROMPT.endsWith(a.UNMET) && !/["'`$\\]/.test(a.CARRY_PROMPT));

  console.log("6) \"IT'S UNSENT\", CHECKED AGAINST SENT");
  answers(["Who should deal with the test links?", "draft it"]);
  const claim = M.unsentClaim("The Jono catch-up email is unsent: it sits in your garth@ghost-ai.co.za drafts.");
  ok("a card that says an email is unsent names who it's to, never the user's own mailbox", claim && claim.names.includes("jono") && !claim.addrs.length, claim);
  ok("one that says nothing about an email isn't a claim", M.unsentClaim("Run the release: the build is not sent to npm yet") === null && M.unsentClaim("Sign in to example.com") === null);
  const sent = [{ ts: now - 30000, to: ["schoemanjono@gmail.com", "Jono Schoeman"], subject: "WinLove: glad to be on it, 3 things I need from you", via: "mail" }];
  ok("a mail to that person since its run started answers it", M.sentFor(claim, sent, start) && !M.sentFor(claim, sent, now));
  ok("...a Gmail Sent row (no time) only with more of the card's words in it", !M.sentFor(claim, [{ text: "Jono  hello", to: [] }], start) && !!M.sentFor(M.unsentClaim("The Jono catch-up email about WinLove is unsent"), [{ text: "Jono WinLove catch-up", to: [] }], start));
  const jono = "The Jono catch-up email is unsent: it's still a draft in your Gmail.", file = join(C, "sent-needs.json"), JF = `- **Jono email:** ${jono} Check first: the subject line.`;
  const before = a.needsOf(run, { final: JF, end, start, now });
  ok("before Sent is read: the card as its run said it", before && !before.sent && before.claim === before.what && /unsent/.test(before.what), before);
  const found = M.settleUnsent([{ path: run, what: before.claim, since: start }], sent, { file });
  ok("found once, kept", found.length === 1 && M.sentAfter(run, before.claim, file).subject.startsWith("WinLove: glad") && M.settleUnsent([{ path: run, what: before.claim, since: start }], sent, { file }).length === 0, found);
  const nj = a.needsOf(run, { final: JF, end, start, now });
  ok("the card no longer says it's unsent without saying Sent has it", nj && nj.sent && /Your Sent folder has "WinLove: glad to be on it/.test(nj.check) && /go ahead only if that's a different email/.test(nj.check), nj);
  ran = 0; const nd = { id: "r9", path: run, startedAt: start, endedAt: end, needs: nj };
  h = H.homeAnswer("needs:r9", { pick: 0 }, { agents: () => [nd], settle() {}, run: () => { ran++; return { id: "r10" }; } });
  ok("...and Go ahead tells its run to read Sent first and never send twice", h.ok && ran === 1 && /never send the same email twice/.test(lastAnswer()), lastAnswer());
  let tick = 0;
  await M.sentTick({ load: () => [], rows: async () => { tick++; return sent; }, needs: async () => [], read: async () => ({}), watches: [] });
  ok("sentTick reads nothing when no email task is open and no card says unsent", tick === 0);
  await M.sentTick({ load: () => [], rows: async () => { tick++; return sent; }, needs: async () => [{ path: lane, what: jono, since: start }], read: async () => ({}), watches: [], sentFile: file });
  ok("...and rechecks the cards that do", tick === 1 && !!M.sentAfter(lane, jono, file));
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
