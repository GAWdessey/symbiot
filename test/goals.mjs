// Goals (goals.mjs): what the user asked for is owned until it's done, followed through while it
// waits, and closed with a breakdown: "Done: …", or "Not finished: …" with what's missing, never
// dropped. The audit of 16-21 Oct 2026 found 7 of 20 asks done and verified. Isolated HOME.
//
//   node test/goals.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-goals-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };
const G = await import("../goals.mjs");
const J = await import("../jobs.mjs");
const H = 3600e3, DAY = 86400e3;
const lane = join(HOME, "work", "bookly"), ops = join(CFG, "drafts", "act-11112222");
const ai = (o) => async () => ({ text: typeof o === "string" ? o : JSON.stringify(o) });
const base = (x = {}) => ({ tasks: [], ledger: { handoffs: [] }, waits: [], map: { bookly: lane }, running: () => false, ...x });
const run = (id, path, o = {}) => J.track("run:" + id, { kind: "agent", path, lane: "bookly", text: "a run", state: o.state || "done", waitingOn: o.waitingOn || "", what: o.what || "", summary: o.summary || "", outcome: true }, { now: o.at || Date.now() });

try {
  console.log("GOALS — made where the user asks, with what it went to");
  const t0 = Date.now() - 2 * H;
  const g = G.openGoal("Send the client the redirect fix and get QA to pass", { child: "task:t1", lane: "bookly", path: lane, now: t0 });
  ok("a goal row: the user's words, its first part, where", g && g.key.startsWith("goal:") && J.loadJobs().some((j) => j.key === g.key && j.kind === "goal" && j.children[0] === "task:t1" && j.paths[0] === lane), g);
  ok("…found from its part", G.goalOf("task:t1").key === g.key);
  await G.doneWhenFor(g, { write: ai("The client has the reply and QA passes on both networks") });
  ok("…with one line of what done means (or the words themselves with no AI)", G.goalById(g.key).doneWhen === "The client has the reply and QA passes on both networks");

  console.log("GOALS — the work that follows joins it, and its state comes from that work");
  run("r1", lane, { at: t0 + 1000, state: "waiting", waitingOn: "lane", what: "ops: send the reply" });
  const ledger = { handoffs: [{ id: "h1", from: { lane: "bookly", path: lane }, to: { lane: "ops", path: ops }, text: "Send the reply to the client", at: t0 + 2000, status: "started" }, { id: "h0", from: { lane: "bookly", path: lane }, to: { lane: "ops", path: ops }, text: "older", at: t0 - 5000, status: "done", reportedAt: t0 - 1000 }] };
  const ctx = { ...base({ ledger, tasks: [{ id: "t1", repo: "bookly", text: "x", done: true }] }), jobs: J.loadJobs() };
  const gg = { ...G.goalById(g.key) }; G.adopt(gg, ctx);
  ok("its folder's later runs and handovers join it, not earlier ones", gg.children.includes("run:r1") && gg.children.includes("handoff:h1") && !gg.children.includes("handoff:h0") && gg.paths.includes(ops), gg.children);
  ok("…waiting on the lane it handed to, saying what", G.rollUp(gg, ctx).state === "waiting" && G.rollUp(gg, ctx).waitingOn === "lane", G.rollUp(gg, ctx));

  console.log("GOALS — a shared lane folder: only its own work joins it (the marketing goals, 24 Oct 2026)");
  {
    const mk = join(HOME, "work", "marketing"), dy = join(HOME, "work", "daaymn"), m0 = Date.now() - 3 * H;
    const goal = G.openGoal("Fix the GitHub installer downloads figure that shows n/a in the daily marketing results", { child: "task:m1", lane: "marketing", path: mk, now: m0 });
    const other = (id, path, o) => J.track("run:" + id, { kind: "agent", path, lane: "x", text: "a run", state: o.state, waitingOn: o.waitingOn || "", what: o.what || "", task: o.task || "", outcome: true }, { now: o.at });
    other("mk-mine", mk, { at: m0 + 1000, state: "done", task: "Fix the GitHub installer downloads figure that shows n/a in the daily marketing results." });
    other("mk-other", mk, { at: m0 + 2000, state: "waiting", waitingOn: "lane", what: "daaymn: demo screens", task: "[Daaymn][Symbiot] Garth wants marketing for Daaymn and Symbiot running now" });
    other("dy-badges", dy, { at: m0 + 4000, state: "waiting", waitingOn: "user", what: "the release that turns verification on: faceVerificationEnabled is still false", task: "Clear every existing verified badge once verify-face is live" });
    other("mk-later", mk, { at: m0 + 2 * H, state: "waiting", waitingOn: "user", what: "something else" });
    const ld = { handoffs: [{ id: "hd", from: { lane: "marketing", path: mk }, to: { lane: "daaymn", path: dy }, text: "Give each demo screen its own address", at: m0 + 3000, status: "done", reportedAt: m0 + 5000, job: "dy-spec" }] };
    const tasks = [{ id: "m1", repo: "marketing", text: "Fix the GitHub installer downloads figure that shows n/a in the daily marketing results.", done: true, archived: true, approvedAt: m0 + H }];
    const cx = { ...base({ ledger: ld, tasks, map: { marketing: mk, daaymn: dy } }), jobs: J.loadJobs() };
    const gm = { ...G.goalById(goal.key), children: [...G.goalById(goal.key).children, "run:dy-badges", "run:mk-other"] }; // as the old adopt left it
    G.adopt(gm, cx);
    ok("its own run joins; another item's run, the other lane's runs, its handover and runs after its task was done don't (and are taken out)", gm.children.includes("run:mk-mine") && !gm.children.some((k) => /mk-other|dy-badges|mk-later|handoff:hd/.test(k)) && !gm.paths.includes(dy), gm.children);
    ok("…so the other lane's release isn't its blocker, and with its task done it ends", G.rollUp(gm, cx).state === "ended", G.rollUp(gm, cx));
  }

  console.log("GOALS — followed through");
  const notes = [], started = [], settled = [];
  const deps = (x = {}) => ({ ...base({ ledger, tasks: [{ id: "t1", repo: "bookly", text: "x", done: true }] }), jobs: J.loadJobs(), start: (p) => (started.push(p), { id: "s" + started.length }), autoStart: () => true, notify: (t, b) => notes.push(t + ": " + b), settle: (p) => settled.push(p), ...x });
  await G.goalsTick(deps(), { now: t0 + 2 * H });
  ok("a handover not started an hour on: its run is made to go", started.includes(ops), started);
  // the handover came back done; ops's run ended: everything ended → judged
  ledger.handoffs[0].reportedAt = t0 + 3 * H; ledger.handoffs[0].status = "done"; ledger.handoffs[0].result = "Sent the reply to the client at 10:03 (Re: onboarding).";
  run("r1", lane, { at: t0 + 1000, state: "done", summary: "Reply sent; QA re-run passed on both networks." });
  await G.goalsTick(deps({ write: ai({ met: true, done: ["Reply sent at 10:03 on the onboarding thread", "QA passed on both networks"], verified: "ops's report and the run's summary", left: "" }) }), { now: t0 + 4 * H });
  const done = G.goalById(g.key), dir = join(G.folderOf(done), ".symbiot"), file = existsSync(dir) ? readdirSync(dir).find((f) => /^DONE-/.test(f)) : "";
  ok("met: closed as done", done.state === "done" && done.closed.kind === "done", done);
  const md = file ? readFileSync(join(dir, file), "utf8") : "";
  ok("…a breakdown under Reports: what was asked, what was done, how it's known, what's left, time", /^# Done: Send the client/.test(md) && /## What was done\n- Reply sent at 10:03/.test(md) && /## How it's known\nops's report/.test(md) && /## What's left\nNothing\./.test(md) && /Took \d+ (min|h) from asking/.test(md), md.slice(0, 400));
  ok("…a card that says so, and a notification", G.goalCards().some((c) => c.path === g.key && /^Done: /.test(c.q)) && notes.some((n) => /^Done: Send the client/.test(n)), [G.goalCards(), notes]);

  console.log("GOALS — not met: one run asked what's left, then \"Not finished\", never closed silently");
  const g2 = G.openGoal("Get the delivered count for the first round", { child: "run:r2", lane: "ops", path: ops, now: t0 });
  run("r2", ops, { at: t0 + 1, state: "done", summary: "Tried the API; it has no report endpoint." });
  const asked = [];
  const no = ai({ met: false, done: [], verified: "nothing shows the count", left: "the delivered count itself" });
  await G.goalsTick(deps({ write: no, ops: (req) => (asked.push(req), { ok: true, job: "r3", dir: ops }) }), { now: t0 + 5 * H });
  ok("a run is started on what's left, with what was missing", asked.length === 1 && /What's left on this/.test(asked[0]) && /the delivered count itself/.test(asked[0]) && G.goalById(g2.key).children.includes("run:r3"), asked);
  run("r3", ops, { at: t0 + 5 * H + 1, state: "done", summary: "Still no report endpoint." });
  await G.goalsTick(deps({ write: no, ops: (req) => (asked.push(req), { job: "r4" }) }), { now: t0 + 6 * H });
  const g2d = G.goalById(g2.key);
  ok("…once, then \"Not finished: <goal>: <what's missing>\", with its breakdown and card", asked.length === 1 && g2d.closed.kind === "not" && G.goalCards().some((c) => c.path === g2.key && /^Not finished: Get the delivered count.*the delivered count itself/.test(c.q)) && readdirSync(join(G.folderOf(g2d), ".symbiot")).some((f) => /^NOT-FINISHED-/.test(f)), g2d);
  ok("with no AI to judge it: closed as its parts ended, the breakdown says unverified", await (async () => {
    const g3 = G.openGoal("Tidy the folder", { child: "run:r5", path: ops, now: t0 }); run("r5", ops, { at: t0 + 1, state: "done", summary: "Tidied." });
    await G.goalsTick(deps(), { now: t0 + 7 * H }); const x = G.goalById(g3.key);
    return x.closed.kind === "done" && /Not verified/.test(readFileSync(join(G.folderOf(x), ".symbiot", x.closed.report), "utf8"));
  })());

  console.log("GOALS — waiting on the user, on a reply, on a time; stalled");
  const p4 = join(HOME, "work", "atlas"), g4 = G.openGoal("Approve the copy", { child: "run:r6", path: p4, now: t0 });
  run("r6", p4, { at: t0 + 1, state: "waiting", waitingOn: "user", what: "the wording of the welcome text" });
  await G.goalsTick(deps({ cardPaths: new Set([p4]) }), { now: t0 + 2 * H });
  ok("on the user, with a card already on Home for that work: no second card", !G.goalById(g4.key).card, G.goalById(g4.key).card);
  await G.goalsTick(deps(), { now: t0 + 2 * H });
  ok("…without one: one card, saying what", G.goalById(g4.key).card && G.goalById(g4.key).card.kind === "user" && /^the wording/.test(G.goalById(g4.key).card.q) && !G.goalById(g4.key).card.q.includes(g4.text), G.goalById(g4.key).card);
  const r = G.goalAnswer(g4.key, [{ q: "x", a: "I've done it" }], deps());
  ok("\"I've done it\": its run's record moves on and it starts again", r.ok && settled.includes(p4) && started.includes(p4) && !G.goalById(g4.key).card, r);

  const p5 = join(HOME, "work", "meridian"), g5 = G.openGoal("Get the partner's routes", { child: "wait:w1", path: p5, now: t0 });
  const waits = [{ id: "w1", to: "alex@example.com", subject: "Routes", sent: new Date(t0).toISOString(), status: "waiting", from: { lane: "meridian", path: p5 } }];
  await G.goalsTick(deps({ waits }), { now: t0 + 2 * H });
  const sinceAt = G.goalById(g5.key).since;
  await G.goalsTick(deps({ waits, write: ai("Could you send the routes when you have a moment?") }), { now: sinceAt + DAY + H });
  const nc = G.goalById(g5.key).card;
  ok("on a reply, a day on: a drafted follow-up on a card, nothing sent", nc && nc.kind === "nudge" && /Could you send the routes/.test(nc.q) && nc.options[0] === "Send the follow-up as drafted", nc);
  await G.goalsTick(deps({ waits }), { now: sinceAt + 3 * DAY + H });
  ok("…three days on: the card says it's had no reply", /^No reply in 3 days/.test(G.goalById(g5.key).card.q), G.goalById(g5.key).card);
  const sent = [];
  G.goalAnswer(g5.key, [{ q: "x", a: "Send the follow-up as drafted" }], deps({ waits, ops: (req) => (sent.push(req), { job: "r7", dir: ops }) }));
  ok("…sent only on the user's word, exactly as drafted, on the same thread", sent.length === 1 && /exactly as written/.test(sent[0]) && /"Routes", to alex@example\.com/.test(sent[0]) && /Could you send the routes/.test(sent[0]), sent);

  const p6 = join(HOME, "work", "quartz"); G.openGoal("Check the window tomorrow", { child: "run:r8", path: p6, now: t0 });
  run("r8", p6, { at: t0 + 1, state: "waiting", waitingOn: "time", what: "stays waiting until 08:00 tomorrow" });
  const n0 = started.length;
  await G.goalsTick(deps({ until: () => t0 + 3 * H }), { now: t0 + 2 * H });
  ok("on a time: not before it", started.length === n0);
  await G.goalsTick(deps({ until: () => t0 + 3 * H }), { now: t0 + 4 * H });
  ok("…and started again once it comes", started.length === n0 + 1 && started.includes(p6));

  const p7 = join(HOME, "work", "minnow"), g7 = G.openGoal("Move the mailbox", { child: "handoff:h9", path: p7, now: t0 });
  const led7 = { handoffs: [{ id: "h9", from: { lane: "minnow", path: p7 }, to: { lane: "ops", path: "" }, text: "Move it", at: t0, status: "started" }] };
  await G.goalsTick(deps({ ledger: led7 }), { now: t0 + H });
  await G.goalsTick(deps({ ledger: led7 }), { now: t0 + 2 * DAY });
  ok("nothing moving for a day: \"Stalled: <goal>\" on Home, waiting on what, since when", G.goalCards().some((c) => c.path === g7.key && /^Stalled: Move the mailbox, waiting on lane/.test(c.q)), G.goalById(g7.key).card);
  G.goalAnswer(g7.key, [{ q: "x", a: "Drop it" }], deps({ ledger: led7 }));
  ok("Drop it: closed as dropped, with its breakdown, no card", G.goalById(g7.key).closed.kind === "dropped" && !G.goalCards().some((c) => c.path === g7.key) && existsSync(join(G.folderOf(G.goalById(g7.key)), ".symbiot", G.goalById(g7.key).closed.report)));

  console.log("GOALS — an email that's waited a week comes up, not left forever");
  const old = [{ id: "w9", to: "pat@example.com", subject: "Domains", sent: new Date(Date.now() - 9 * DAY).toISOString(), status: "waiting", from: { lane: "atlas" } }];
  ok("a card: no reply in 9 days, keep waiting or stop", G.goalCards({ waits: old }).some((c) => c.path === "goal:wait:w9" && /No reply in 9 days from pat@example\.com about "Domains"/.test(c.q)));
  const stopped = []; G.goalAnswer("goal:wait:w9", [{ q: "x", a: "Stop waiting" }], { stop: (id) => stopped.push(id) });
  ok("…Stop waiting stops it", stopped[0] === "w9");
  G.goalAnswer("goal:wait:w9", [{ q: "x", a: "Keep waiting" }], {});
  ok("…Keep waiting puts it away for a week", !G.goalCards({ waits: old }).some((c) => c.path === "goal:wait:w9"));

  console.log("GOALS — where are we: the chat answers from the goals first");
  const lines = J.jobsLines().join("\n");
  ok("goals first, each with where it stands", /^Goals the user asked for/.test(lines) && /Send the client the redirect fix and get QA to pass: done/.test(lines) && /Get the delivered count for the first round: not finished: the delivered count itself/.test(lines), lines.slice(0, 600));
  const A = await import("../agents.mjs");
  A.onGoalAnswer((p, a) => ({ ok: true, routed: p, a }));
  ok("a goal card's answer goes through answerQuestions, by its path", A.answerQuestions(g4.key, [{ q: "x", a: "Keep waiting" }]).routed === g4.key);
  const many = Array.from({ length: 320 }, (_, i) => ({ key: "run:n" + i, kind: "agent", state: "done", at: i, changed: i, history: [] }));
  J.saveJobs([...J.loadJobs(), ...many]);
  ok("open goals are never pushed out of the record by newer rows", J.loadJobs().some((j) => j.key === g5.key));

  console.log("GOALS — only a request for work opens one; a follow-up joins its goal");
  const replies = ["yes", "1", "proceeed", "who makes these cards? is it not you?", "how should i know you are the one thats manning it not me", "give me a list of whats open so i can be disappointed in you please", "everytime i say approve it fails so wtf? (The user attached 1 screenshot)", "did you launch it so i can?"];
  const kinds = await Promise.all(replies.map((w) => G.goalKind(w)));
  ok("questions, replies, complaints and status asks never open a goal", kinds.every((k) => k === "none"), replies.map((w, i) => [w, kinds[i]]));
  ok("…a request for work does, and a short line pointing at work going is a follow-up", (await G.goalKind("Move the client's domain into its own account and send the ticket")) === "new" && (await G.goalKind("do it yourself")) === "follow");
  ok("…with an AI, its call stands, and a reply it can't read falls back to the rules", (await G.goalKind("email from the registrar just landed", { write: ai('{"kind":"follow"}') })) === "follow" && (await G.goalKind("Set up the new mailbox", { write: ai("hmm") })) === "new" && (await G.goalKind("yes", { write: ai('{"kind":"new"}') })) === "none");
  const before = J.goalRows().length, lanePath = join(HOME, "work", "atlas");
  const ga = await G.goalFor("Move the client's domain into its own account", { child: "run:ra", lane: "atlas", path: lanePath });
  const none = await G.goalFor("yes", { child: "run:rb", lane: "atlas", path: lanePath });
  const fol = await G.goalFor("do it yourself", { child: "run:rc", lane: "atlas", path: join(CFG, "drafts", "act-99990000") });
  ok("a request opens a goal; \"yes\" opens none; \"do it yourself\" joins the lane's goal with its run", ga && none === null && fol && fol.key === ga.key && G.goalById(ga.key).children.includes("run:rc") && J.goalRows().length === before + 1, [ga && ga.key, none, fol && fol.key]);
  ok("…a follow-up with nothing open to join opens nothing", (await G.goalFor("do it again", { lane: "nowhere", path: "" })) === null);
  console.log("GOALS — rows opened before from questions and replies are closed as not goals");
  const junk = G.openGoal("who makes these cards? is it not you?", { lane: "ops" }), real = G.openGoal("Ship the redesigned demo console", { lane: "ops" });
  const n = G.tidyGoals();
  ok("closed as not a goal, off every list, kept in the record", n >= 1 && !J.goalRows().some((x) => x.key === junk.key) && J.goalRows().some((x) => x.key === real.key) && J.loadJobs().find((x) => x.key === junk.key).notGoal === true, n);
  ok("…once each", G.tidyGoals() === 0);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} goals: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
