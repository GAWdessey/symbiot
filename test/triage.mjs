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
  let sawKnown = "";
  await T.judge({ q: "Which mobile number should go on the new account?", options: ["Use mine"] }, { known: "- Pat (person): mobile +27 82 000 0000" }, { write: async (sys, p) => { sawKnown = sys + p; return { text: '{"verdict":"answered","why":"w","answer":"+27 82 000 0000"}' }; } });
  ok("…and what Symbiot remembers (a detail it already holds is answered, not asked)", /What Symbiot remembers/.test(sawKnown) && /\+27 82 000 0000/.test(sawKnown) && /whether something has happened or what state it is in/.test(sawKnown), sawKnown.slice(-300));
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

  console.log("HOW OFTEN IT'S WRONG — the questions that reached the user and weren't theirs, counted (23 Oct 2026)");
  {
    const p2 = join(HOME, "work", "shop"); mkdirSync(join(p2, ".symbiot"), { recursive: true });
    const said = ["who makes these cards? is it not you?", "how must i know if you havent given me the login?", "its in the vault", "I already answered this", "you should know this"];
    ok("what the user types that says a question wasn't theirs", said.every((x) => T.needless(x)) && !T.needless("yes, send it") && !T.needless("skip it") && !T.needless("the second one, but shorter"), said.filter((x) => !T.needless(x)));
    const now = Date.now();
    T.saveVerdict(p2, "Which login should I use for the registrar?", { verdict: "user", why: "a sign-in" }, now - 1000);
    T.saveVerdict(p2, "Which plan should the page show first?", { verdict: "user", why: "a choice" }, now - 900);
    T.saveVerdict(p2, "Should the invoice go out today?", { verdict: "user", why: "a send" }, now - 800);
    ok("a card the user said wasn't theirs is a miss, once", T.noteCardWords(p2, "Which login should I use for the registrar?", "its in the vault") && !T.noteCardWords(p2, "Which login should I use for the registrar?", "you should know this") && !T.noteCardWords(p2, "Which plan should the page show first?", "the cheaper one"));
    const gone = T.sweepGone(p2, ["Which login should I use for the registrar?"], { answers: "### Which plan should the page show first?\nthe cheaper one\n" });
    ok("a card gone with its answer isn't a miss; one its agent took back unanswered is", gone === 1 && T.verdictOf(p2, "Should the invoice go out today?").gone === "withdrawn" && T.verdictOf(p2, "Which plan should the page show first?").gone === "answered", [gone, T.loadVerdicts(p2)]);
    ok("…counted once", T.sweepGone(p2, [], { answers: "" }) === 1 && T.sweepGone(p2, [], { answers: "" }) === 0);
    const st = T.triageStats({ now: now + 1000 });
    ok("this week: how many came to the user, how many shouldn't have, and the share", st.week.shown >= 3 && st.week.needless === 1 && st.week.withdrawn >= 1 && st.week.misses === st.week.needless + st.week.withdrawn && st.week.rate > 0 && st.week.rate <= 1 && st.before.shown === 0, st);
    ok("…and a week later it's last week's", T.triageStats({ now: now + 8 * 86400000 }).before.misses === st.week.misses && T.triageStats({ now: now + 8 * 86400000 }).week.shown === 0);
    let sys = ""; await T.judge({ q: "Which account is the domain in?" }, {}, { write: async (s) => { sys = s; return { text: '{"verdict":"agent","why":"w"}' }; } });
    ok("the newest ones the user said weren't theirs are shown to the judge, as what not to put to them", /said weren't theirs to answer/.test(sys) && sys.includes("Which login should I use for the registrar?") && sys.includes("its in the vault"), sys.slice(-400));
  }

  console.log("REDO — a spend with no reason, or an account Symbiot knows exists, goes back before it's a card (23 Oct 2026)");
  const buy = { q: "Can I buy the two replacement domains for $16.40?", context: "They're ready in the cart.", options: ["🤖 Agent: buy them now (recommended)", "Skip this part"] };
  const pre = T.precheck(buy);
  ok("a $16.40 domain buy that never says why: redo, not a card", pre && pre.verdict === "redo" && /without saying why/.test(pre.why), pre);
  ok("…and the run is told to ask again with the reason, the user not asked yet", /Not shown to the user yet/.test(T.answerFor(pre)) && /ask again/.test(T.answerFor(pre)), T.answerFor(pre));
  ok("…the AI isn't asked for it", (await T.judge(buy, {}, { write: async () => { throw new Error("asked"); } })).verdict === "redo");
  const why = { q: "Can I pay R250 for the new domain?", context: "The old one can't be transferred: its registrar locked it, so a new one is the only way to keep the site up." , options: ["🤖 Agent: pay it (recommended)", "Skip this part"] };
  ok("a spend that says why it's needed: left to judge as the user's", T.precheck(why) === null, T.precheck(why));
  ok("an R2 bucket or a plain number isn't money", T.precheck({ q: "Can I make the R2 bucket for the 3 reports?", options: [] }) === null);
  const acct = { q: "Can you create an Acme Cloudflare account?", context: "The rebuild needs one.", options: ["👤 You (only you: your sign-up): create it", "Skip this part"] };
  const knownAcct = "- account: Acme Cloudflare account sam@acme.example, made 23 Oct under the main login\n- person: Sam runs sales";
  const pa = T.precheck(acct, knownAcct);
  ok("an account Symbiot remembers: redo, check it exists first", pa && pa.verdict === "redo" && /already knows of a (Acme )?Cloudflare account/.test(pa.why), pa);
  ok("…none remembered: left to judge", T.precheck(acct, "- person: Sam runs sales") === null);
  const rd = T.precheck({ q: "Can you read the report 'Who owns what at the host' before I carry on?", options: ["👤 You: read it, then tell me to go on", "Skip this part"] });
  ok("a card that sends the user to read a report: redo, with check it's current, a summary and the one question left", rd && rd.verdict === "redo" && /out of date/.test(rd.why) && /2-3 line summary/.test(rd.why), rd);
  ok("…one that asks a real question and links the report for detail: left to judge", T.precheck({ q: "Should the site move to the new account this week?", context: "The details are in the report 'Who owns what'.", options: ["🤖 Agent: move it this week (recommended)", "Skip this part"] }) === null);

  console.log("MONEY UP FRONT — a card that has the user add a card or claim a credit says a hold or charge may come (23 Oct 2026)");
  const card = { q: "Can you add the company card in the ad account's Campaign Manager?", context: "Under Billing setup, so the ads credit can be claimed.", options: ["👤 You (only you: your card): add it under Billing setup (recommended)", "Skip this part"] };
  const pc = T.precheck(card);
  ok("adding a card with no word on money: redo, not a card", pc && pc.verdict === "redo" && /hold or a charge/.test(pc.why) && /their yes/.test(pc.why), pc);
  ok("…and the run is told to ask again, the user not asked yet", /Not shown to the user yet/.test(T.answerFor(pc)));
  ok("…the AI isn't asked for it", (await T.judge(card, {}, { write: async () => { throw new Error("asked"); } })).verdict === "redo");
  const was = T.precheck(card, "- site: Campaign Manager reserved R425.45 on the card when one was added, 23 Oct\n- person: Sam runs sales");
  ok("a hold Symbiot remembers on that site: its amount goes to the agent", was && /R425\.45/.test(was.why) && !/Sam/.test(was.why), was);
  ok("\"claim the credit\" and \"nothing is charged\" is calling it free: redo too", T.precheck({ q: "Can you claim the R1,000 ads credit?", context: "Nothing is charged to claim it.", options: ["👤 You: claim it", "Skip this part"] })?.verdict === "redo");
  const warned = { q: "Can you add the company card in the ad account's Campaign Manager to claim the ads credit?", context: "The site may place a hold of about R425 on the card when it's added; I spend nothing on ads.", options: ["👤 You (only you: your card): add it, knowing about the hold (recommended)", "Skip this part"] };
  ok("one that says the site may hold about R425 on the card: left to judge as the user's", T.precheck(warned) === null, T.precheck(warned));
  const real = { q: "Ads: the ad account 1234567 is made. Claiming the credit needs a card on it: add one, or hold?", context: "Done: the ad account exists (ID 1234567, USD, no campaign). The site says a valid payment method must be on the account before any coupon can be redeemed. I won't spend anything either way.", options: ["👤 You (only you: entering card details): add the card at Billing → Billing setup, then I claim the credit unspent (recommended)", "Hold the credit: leave the account as it is", "Skip ads for now"] };
  const pr = T.precheck(real);
  ok("the card as it was written that day (\"Hold the credit\" is waiting, not money; an id before USD is no price): redo for the money warning", pr && pr.verdict === "redo" && /hold or a charge/.test(pr.why), pr);
  ok("a card on a board, a logo on a card: no money", T.precheck({ q: "Can you add the new task card to the board?", options: [] }) === null && T.precheck({ q: "Should I add the logo to the business card?", options: [] }) === null);

  console.log("A KEY THE USER MADE, WHOSE VALUE NEVER REACHED THE VAULT (26 Oct 2026)");
  const doubt = { q: "Your answer says you created one, but I can't find it. Can you make the tunnel-edit token?", context: "The vault has no tunnel-edit token.", options: ["👤 You (only you: your Cloudflare sign-in): make the token", "Skip this part"] };
  const pd = T.precheck(doubt);
  ok("a card that doubts the user made the token goes back, with the one line to say instead", pd && pd.verdict === "redo" && /The token exists, but its value isn't in the vault: roll it in <the site> and paste the value in chat/.test(pd.why) && /another card/.test(pd.why), pd);
  ok("…the AI isn't asked for it", (await T.judge(doubt, {}, { write: async () => { throw new Error("asked"); } })).verdict === "redo");
  const self = T.precheck({ q: "Can you roll the Cloudflare token?", options: ["👤 You (only you: your Cloudflare sign-in): roll it, then save it to the vault", "Skip this part"] });
  ok("a card that has the user save it to the vault themselves goes back: a pasted value is saved by itself", self && self.verdict === "redo" && /saved there by itself/.test(self.why), self);
  ok("…while asking them to paste it, the agent's own vault step, and a key the agent can't find on a server are left to judge", T.precheck({ q: "Can you paste the Cloudflare token in chat?", context: "It lets me fix the tunnel for the site move; without it the site stays down.", options: ["👤 You (only you: your Cloudflare token): roll it and paste it here"] }) === null && T.precheck({ q: "Shall I use the key you pasted?", options: ["🤖 Agent: I'll put it in the vault"] }) === null && T.precheck({ q: "I can't find the SSH key on the server: which one should I use?", options: ["Skip this part"] }) === null);

  console.log("A KEY OR LOGIN ASKED FOR SAYS WHY (27 Oct 2026)");
  const render = { q: "Can you create a Render API key?", context: "Creating one needs your Render login (Account Settings → API Keys at dashboard.render.com). The check stays blocked until a Render API key is in the vault as 'render api key'.", options: ["👤 You (only you: your Render login): create the key and paste it here (recommended)", "Skip this part"] };
  const pk = T.precheck(render);
  ok("the Render card as written that day (no word on what the check is for): redo, with the three things to say", pk && pk.verdict === "redo" && /which task needs it/.test(pk.why) && /check or change/.test(pk.why) && /skip it/.test(pk.why), pk);
  ok("…the AI isn't asked for it", (await T.judge(render, {}, { write: async () => { throw new Error("asked"); } })).verdict === "redo");
  const keyFor = { ...render, context: "For the security review task: the key lets me list your Render services and check each one's environment variables for leaked secrets. I change nothing. If you skip it, those services stay unchecked." };
  ok("…the same card saying what it's for and what skipping loses: left to judge", T.precheck(keyFor) === null, T.precheck(keyFor));
  ok("…and the agent's own key step isn't the user's", T.precheck({ q: "Shall I generate a deploy key for the repo?", options: ["🤖 Agent: generate it (recommended)", "Skip this part"] }) === null);
  const { ONLY_YOU } = await import("../handover.mjs");
  ok("every brief says a key or login asked for says why", /A card asking for a key, token or login says in one line why/.test(ONLY_YOU));
  ok("every brief says a pasted key saves itself, and the one line for a made key that isn't in the vault", /never ask them to save it there or in a file/.test(ONLY_YOU) && /The token exists, but its value isn't in the vault: roll it in Cloudflare and paste the value in chat/.test(ONLY_YOU) && /never doubting they made it/.test(ONLY_YOU));
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} triage: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
