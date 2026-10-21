// An ask the user closed, or its run says needs nothing, stays closed; an email another agent sent
// counts as sent (asksdone.mjs closesAsk, runSaysClosed; agents.mjs needsOf, closeAsk, closedAsk,
// sameSubject, answerQuestions; home.mjs homeAnswer; sentmail.mjs agentSent, sentBrief, jobStart,
// sentTick). On 21 Oct 2026 Home asked Garth about a client reply a fourth time after he'd typed
// "this case is closed, no further aspects need to be done on this": it went to its run as "Go
// ahead: …", the run said "that asks for nothing further", and its last words ("it stays an unsent
// draft") raised the card again. Another lane's agent had sent the client a reply at 08:33, and the
// card never said so. Isolated HOME.
//
//   node test/closed.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-closed-"));
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

const run = join(C, "drafts", "act-bec1f0f5"), sym = join(run, ".symbiot");
mkdirSync(sym, { recursive: true });
writeFileSync(join(sym, "TASKS.md"), "# Tasks\n\n- [x] Garth asks: check Jono's emails\n");
const CARLA = "Carla reply: it's still an unsent draft in your garth@ghost-ai.co.za mail.";
const OPEN = `I've drafted the reply and changed nothing else.\n\n- **Carla reply:** it's still an unsent draft in your garth@ghost-ai.co.za mail. I haven't sent it.`;
const CLOSED = "Your latest answer is that you've read the report and the WinLove case is closed until Smartcall or Jono get back to you. That asks for nothing further, so I did nothing this run and sent nothing.\n\n- **Carla reply:** it stays an unsent draft in your garth@ghost-ai.co.za mail. I won't send it unless you say so.\n- **Tasks:** `TASKS.md` has no unchecked items.";
const lastAnswer = () => readFileSync(join(sym, "ANSWERS.md"), "utf8").split("### ").pop();
const now = Date.now(), end = now - 60000, start = now - 600000;
try {
  console.log("1) WHICH ANSWERS CLOSE AN ASK");
  for (const t of ["i read it. this case is closed, no further aspects need to be done on this until we hear further from them.", "no further action", "case closed", "that's settled, nothing more to do", "close it"])
    ok(`closes: ${t.slice(0, 60)}`, S.closesAsk(t));
  ok("a bare \"done\" closes an OK it waited on…", S.closesAsk("done", { approve: true }) && S.closesAsk("It's done.", { approve: true }));
  ok("…but on a step of theirs it means they did it", !S.closesAsk("done") && !S.closesAsk("It's done."));
  for (const t of ["go ahead, send it", "is this case closed?", "it isn't closed yet, send it", "the PR closed fine, carry on", "i need the report first"])
    ok(`doesn't close: ${t}`, !S.closesAsk(t, { approve: true }));

  console.log("2) A RUN WHOSE OUTCOME SAYS THE ASK NEEDS NOTHING");
  ok("its lead says so: closed", S.runSaysClosed(CLOSED));
  ok("\"there was nothing for me to do\" is about the run, not the ask", !S.runSaysClosed("There was nothing for me to do on this run, and I changed nothing.\n\n- **Carla reply:** unsent."));
  ok("a closing word in a bullet further down isn't its outcome", !S.runSaysClosed(`${OPEN}\n- **Old thread:** no further action on the March one.`));
  ok("an open ask raises its card", !!a.needsOf(run, { final: OPEN, end, start, now }));
  ok("the closing run's last words raise none, \"unsent draft\" or not", a.needsOf(run, { final: CLOSED, end, start, now }) === null);

  console.log("3) \"CASE CLOSED\" TYPED ON THE CARD");
  writeFileSync(join(sym, "ANSWERS.md"), "# Answers\n");
  const n = a.needsOf(run, { final: OPEN, end, start, now });
  ok("its card: an OK it waits on", n && n.kind === "approve" && n.claim, n);
  let ran = 0, settled = 0;
  const deps = { agents: () => [{ id: "r1", path: run, startedAt: start, endedAt: end, needs: n }], settle: (p, k) => { settled++; a.settleNeeds(p, k); }, run: () => { ran++; return { id: "run2" }; } };
  const h = H.homeAnswer("needs:r1", { text: "i read it. this case is closed, no further aspects need to be done on this until we hear further from them." }, deps);
  ok("settled, and nothing runs: there's nothing for it to do", h.ok && settled === 1 && ran === 0 && /^Closed\./.test(h.said), h);
  ok("its run is told it's closed, not \"Go ahead\"", /^Closed by the user/m.test(lastAnswer()) && !/^Go ahead/m.test(lastAnswer()), lastAnswer());
  ok("on the shared record as closed", S.isDone(n.what) && S.doneList().some((x) => /^Closed: /.test(x.a)));
  const again = "- **Carla reply:** it stays an unsent draft in your garth@ghost-ai.co.za mail. I won't send it unless you say so.";
  ok("a later run there saying it again in other words: no card", a.needsOf(run, { final: again, end: now, start: now - 1000, now }) === null);
  ok("…but a different ask in that folder still raises one", !!a.needsOf(run, { final: "- **Invoice:** the Jono invoice email is unsent: it sits in your drafts.", end: now, start: now - 1000, now }));
  ok("\"no further action\" starts with \"no\": still closed, not skipped", (() => { ran = 0; const h2 = H.homeAnswer("needs:r1", { text: "no further action" }, deps); return h2.ok && /^Closed\./.test(h2.said) && ran === 0; })());

  console.log("4) WHAT COUNTS AS THE SAME ASK");
  ok("the same email, worded again", a.sameSubject(CARLA, "Carla reply: it stays an unsent draft in your garth@ghost-ai.co.za mail. I won't send it unless you say so."));
  ok("another email to the same person isn't", !a.sameSubject(CARLA, "Carla's invoice email is unsent: it sits in your drafts."));
  ok("another person's isn't", !a.sameSubject(CARLA, "Jono reply: it's still an unsent draft in your mail."));

  console.log("5) A CLOSING ANSWER ON THE WORKDESK");
  const lane = join(HOME, "work", "dailify"), lsym = join(lane, ".symbiot"); mkdirSync(lsym, { recursive: true });
  writeFileSync(join(C, "runs.json"), JSON.stringify([{ path: lane, name: "dailify", startedAt: start }]));
  writeFileSync(join(lsym, "QUESTIONS.md"), "# Questions\n\n## Questions\n### Should I send the broker follow-up to Lerato now?\nIt's drafted.\n- 🤖 Agent: send it now (recommended)\n- Skip this part\n");
  const r = a.answerQuestions(lane, [{ q: "Should I send the broker follow-up to Lerato now?", a: "no further action, the case is closed" }], { start: false, run: () => null });
  ok("saved as an answer", r.ok, r);
  ok("…and a later run restating it raises no card", a.needsOf(lane, { final: "- **Lerato follow-up:** should I send the broker follow-up to Lerato now? It's drafted and waiting for your OK.", end: now, start: now - 1000, now }) === null);

  console.log("6) AN EMAIL ANOTHER AGENT SENT");
  const AW = join(C, "awaiting.json"), sentAt = now - 300000;
  writeFileSync(AW, JSON.stringify({ waits: [
    { id: "w1", from: { lane: "sts-platform", path: join(HOME, "work", "sts-platform") }, to: ["Carla@smartcalltech.co.za"], subject: "Re: WIN LOVE ONBOARDING", sent: sentAt, at: sentAt, status: "waiting" },
    { id: "w0", from: { lane: "ops", path: join(C, "drafts", "act-old") }, to: ["old@example.com"], subject: "Last month", sent: now - 20 * 86400000, at: now - 20 * 86400000, status: "waiting" },
  ] }));
  const rows = M.agentSent({ now });
  ok("awaiting.json's sends are sent rows, by lane; a month-old one isn't", rows.length === 1 && rows[0].by === "sts-platform" && rows[0].ts === sentAt, rows);
  const brief = M.sentBrief({ now }).join("\n");
  ok("every brief says check Sent and these first, and lists them", /^## Emails already sent/.test(brief) && /read their Sent mail/.test(brief) && /sts-platform sent "Re: WIN LOVE ONBOARDING" to Carla@smartcalltech\.co\.za/.test(brief), brief);
  ok("…the rule even when no agent sent anything", (() => { writeFileSync(AW, JSON.stringify({ waits: [] })); const b = M.sentBrief({ now }); writeFileSync(AW, JSON.stringify({ waits: [{ id: "w1", from: { lane: "sts-platform", path: join(HOME, "work", "sts-platform") }, to: ["Carla@smartcalltech.co.za"], subject: "Re: WIN LOVE ONBOARDING", sent: sentAt, at: sentAt }] })); return b.length === 3 && /read their Sent mail/.test(b[1]); })());
  // an ops folder is one job: its card may be from a later run than the send, the job began before it
  const run2 = join(C, "drafts", "act-carla"), s2 = join(run2, ".symbiot"); mkdirSync(s2, { recursive: true });
  writeFileSync(join(s2, "runfiles.json"), JSON.stringify([{ id: "x1", startedAt: sentAt - 3600000, endedAt: sentAt - 3500000, files: [] }, { id: "x2", startedAt: now - 60000, endedAt: now - 30000, files: [] }]));
  ok("an ops folder's job starts at its first run", (await M.jobStart({ path: run2, startedAt: now - 60000 })) === sentAt - 3600000 - 60000);
  ok("a lane's, at the run that said it", (await M.jobStart({ path: lane, startedAt: now - 60000 })) === now - 120000);
  const file = join(C, "sent-needs.json");
  const OPEN2 = "I drafted it.\n\n- **WinLove reply:** your reply to Carla is still unsent: it sits in your drafts. I haven't sent it.", card = a.needsOf(run2, { final: OPEN2, end: now - 30000, start: now - 60000, now });
  await M.sentTick({ load: () => [], rows: async () => [], needs: async () => [{ path: run2, what: card.claim, since: await M.jobStart({ path: run2, startedAt: now - 60000 }) }], read: async () => ({}), watches: [], sentFile: file });
  ok("sentTick finds it among what agents sent", M.sentAfter(run2, card.claim, file)?.by === "sts-platform", M.sentAfter(run2, card.claim, file));
  const nc = a.needsOf(run2, { final: OPEN2, end: now - 30000, start: now - 60000, now });
  ok("the card says it has gone, who sent it and to whom", nc && /^Another agent \(sts-platform\) already sent "Re: WIN LOVE ONBOARDING" to Carla@smartcalltech\.co\.za/.test(nc.check) && /go ahead only if that's a different email/.test(nc.check), nc);
  ran = 0;
  H.homeAnswer("needs:r5", { pick: 0 }, { agents: () => [{ id: "r5", path: run2, startedAt: now - 60000, endedAt: now - 30000, needs: nc }], settle() {}, run: () => { ran++; return { id: "r6" }; } });
  const told = readFileSync(join(s2, "ANSWERS.md"), "utf8");
  ok("Go ahead on it: its run hears another agent sent it, and never to send twice", ran === 1 && /Another agent \(sts-platform\) already sent "Re: WIN LOVE ONBOARDING"/.test(told) && /never send the same email twice/.test(told), told);
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
