// Triage (triage.mjs, agents.mjs agentQuestions/triageSweep): every question a run writes is judged
// before it can be a card; only the user's become cards, the rest are answered for the run, and a
// Symbiot fault is recorded rather than handed to the user (21 Oct 2026). Isolated HOME.
//
//   node test/triage.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-triage-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const T = await import("../triage.mjs");
const A = await import("../agents.mjs");

const lane = join(HOME, "work", "telco-platform"); mkdirSync(join(lane, ".symbiot"), { recursive: true });
const Q = {
  restart: "The Dana reply is waiting on Symbiot's browser, which still won't start from my sandbox",
  route: "How should the Dana reply get out, now that Gmail is blocked in your Chrome?",
  send: "Should I send Dana the short reply about her Vodacom test now?",
  fresh: "Which of the two LOVE LINK plans should the page show first?",
};
writeFileSync(join(lane, ".symbiot", "QUESTIONS.md"), `## Questions\n\n### ${Q.restart}\n- 🧑 You: restart the Symbiot app\n- 🧑 You: allow this lane's shell to write to the browser folder\n\n### ${Q.route}\n- 🤖 Agent: send it through Symbiot's own browser\n- 🧑 You: switch on mail.google.com in Settings\n\n### ${Q.send}\n- Send it as drafted (recommended)\n- Hold it\n\n### ${Q.fresh}\n- R7 a day\n- R35 a week\n`);
try {
  console.log("TRIAGE — one verdict per question, from the AI's JSON");
  const said = (o) => ({ write: async () => ({ text: typeof o === "string" ? o : "Here: " + JSON.stringify(o) }) });
  const j1 = await T.judge({ q: Q.restart, options: ["restart"] }, {}, said({ verdict: "symbiot", why: "Symbiot's browser socket didn't answer" }));
  ok("a verdict and why, read out of the reply", j1 && j1.verdict === "symbiot" && /socket/.test(j1.why), j1);
  ok("…one it can't read is no verdict (the question shows as before)", (await T.judge({ q: "x" }, {}, said("no idea"))) === null && (await T.judge({ q: "x" }, {}, said({ verdict: "maybe" }))) === null);
  ok("…\"answered\" with no answer to give is the user's", (await T.judge({ q: "x" }, {}, said({ verdict: "answered", why: "w" }))).verdict === "user");
  let sawPrompt = "";
  await T.judge({ q: Q.send, options: ["Send it"] }, { answers: "### Old\nGo ahead: do it as you had it.", rules: ["Never send anything to Remy first"], lane: "telco-platform" }, { write: async (sys, p) => { sawPrompt = sys + p; return { text: '{"verdict":"answered","why":"w","answer":"Go ahead"}' }; } });
  ok("the judge sees the question, the lane, the user's rules and newest answers", /Should I send Dana/.test(sawPrompt) && /telco-platform/.test(sawPrompt) && /Never send anything to Remy/.test(sawPrompt) && /do it as you had it/.test(sawPrompt), sawPrompt.slice(-400));

  console.log("TRIAGE — only the user's questions become cards");
  T.saveVerdict(lane, Q.restart, { verdict: "symbiot", why: "its browser socket is gone" });
  T.saveVerdict(lane, Q.route, { verdict: "agent", why: "the text is approved; ops can send it from Symbiot's browser" });
  T.saveVerdict(lane, Q.send, { verdict: "answered", why: "he said go ahead", answer: "Go ahead: do it as you had it." });
  const aq = A.agentQuestions(lane, "telco-platform");
  const shown = aq.questions.map((q) => q.q), known = Object.fromEntries((aq.known || []).map((k) => [k.q, k.a]));
  ok("a Symbiot fault, an agent's job and an answered one never show", !shown.includes(Q.restart) && !shown.includes(Q.route) && !shown.includes(Q.send), shown);
  ok("…each is answered for the run instead: Symbiot's fault, do it or hand it to ops, and the user's own answer", /Symbiot's fault, not the user's/.test(known[Q.restart]) && /hand it to ops/.test(known[Q.route]) && /^Go ahead: do it as you had it\./.test(known[Q.send]), known);
  ok("a fresh one not judged yet waits for its verdict (no card that flashes up and goes)", !T.shows(lane, Q.fresh, { judging: true, asked: Date.now() }) && T.shows(lane, Q.fresh, { judging: true, asked: Date.now() - T.HOLD_MS - 1000 }) && T.shows(lane, Q.fresh, { judging: false, asked: Date.now() }));
  T.saveVerdict(lane, Q.fresh, { verdict: "user", why: "a pricing choice of his" });
  ok("…and once it's judged the user's, it's a card", A.agentQuestions(lane, "telco-platform").questions.map((q) => q.q).includes(Q.fresh));
  ok("raw: every open question, judged or not (for the sweep)", A.agentQuestions(lane, "", { raw: true }).questions.length === 4);

  console.log("TRIAGE — the sweep judges each new question once, and records Symbiot's faults");
  rmSync(join(lane, ".symbiot", "triage.json"));
  let calls = 0;
  const verdicts = { [Q.restart]: { verdict: "symbiot", why: "the browser socket is gone" }, [Q.route]: { verdict: "agent", why: "ops can send it" }, [Q.send]: { verdict: "user", why: "sending" }, [Q.fresh]: { verdict: "user", why: "his choice" } };
  const write = async (sys, p) => { calls++; const q = Object.keys(verdicts).find((k) => p.includes(k)); return { text: JSON.stringify(verdicts[q]) }; };
  const swept = await A.triageSweep({ write, runs: () => [{ path: lane }], rules: () => [] });
  ok("each open question judged once", calls === 4 && swept.length === 4 && T.verdictOf(lane, Q.route).verdict === "agent", swept);
  ok("…the Symbiot fault recorded for fixing, with the folder and why", T.faults().some((f) => f.path === lane && f.q === Q.restart && /socket/.test(f.why)), T.faults());
  await A.triageSweep({ write, runs: () => [{ path: lane }], rules: () => [] });
  ok("…and not judged again", calls === 4, calls);
  ok("a fault isn't recorded twice", !T.recordFault({ path: lane, q: Q.restart, why: "again" }) && T.faults().length === 1);

  console.log("TRIAGE — an ops folder's question held while it's judged still reaches Home after (questionFolders)");
  {
    // 21 Oct 2026: the phone check's scratch question was found while it was held, "nothing open" was kept as long as the
    // folder's files stayed the same, and Home never listed it, even 4.5 minutes later
    const ops = (n, q, age = 0) => { const p = join(CFG, "drafts", n), f = join(p, ".symbiot", "QUESTIONS.md"); mkdirSync(join(p, ".symbiot"), { recursive: true }); writeFileSync(f, `## Questions\n### ${q}\nIt matters.\n- 👤 You (only you: your phone): done\n- Skip this part\n`); if (age) utimesSync(f, new Date(Date.now() - age), new Date(Date.now() - age)); return p; };
    writeFileSync(join(CFG, "config.json"), JSON.stringify({ provider: "ollama" })); // an AI that judges: a fresh question is held
    const judged = ops("act-0f0f0f01", "Can you wake your phone so I can put the check card up?"), waited = ops("act-0f0f0f02", "Can you plug your phone into this computer?", T.HOLD_MS - 2000);
    let t = Date.now(); const listed = () => A.questionFolders(t += 31000).map((x) => x.path); // each look past the 30 s it keeps a list
    const first = listed();
    ok("fresh and not judged yet: held, not listed", !first.includes(judged) && !first.includes(waited), first);
    T.saveVerdict(judged, "Can you wake your phone so I can put the check card up?", { verdict: "user", why: "only they can" });
    await new Promise((r) => setTimeout(r, 2500));
    const next = listed();
    ok("…its verdict comes (the user's): listed at the next look", next.includes(judged), next);
    ok("…one never judged: listed once its wait is over, though its files are the same", next.includes(waited), next);
    writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
    const S = await import("../scripts/phone-codes-check.mjs"), check = ops("act-codecheck-test01", S.QUESTION);
    writeFileSync(join(check, ".symbiot", "triage.json"), JSON.stringify(S.TRIAGE()));
    ok("the phone check's own question comes judged the user's, so it's a card at once", T.verdictOf(check, S.QUESTION).verdict === "user" && A.agentQuestions(check, "").questions.some((q) => q.q === S.QUESTION) && listed().includes(check), T.verdictOf(check, S.QUESTION));
  }
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} triage: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
