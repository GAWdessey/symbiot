// Intuition (intuition.mjs): what a sharp assistant would do next, unasked. A digest from Symbiot's
// own records and the user's focus.md; each new event triaged once; every move given a permission
// tier (read, internal, outward, destructive) on top of the existing gates; outward kinds promoted
// after 3 yeses and demoted on a no; told now, in the twice-daily digest, or not at all; watch mode
// first; learning from what's put away and what's ignored (22 Oct 2026). Isolated HOME, a stand-in AI.
//
//   node test/intuition.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-intuition-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const I = await import("../intuition.mjs");
const reset = () => { try { rmSync(join(CFG, "intuition.json")); } catch {} };

const now = Date.parse("2026-10-22T09:00:00Z"), H = 3600e3, DAY = 24 * H;
const jobs = [
  { key: "goal:g1", kind: "goal", text: "move the domain to the company account", asked: "move the domain to the company account", lane: "bookly", state: "waiting", waitingOn: "user", what: "the registrar account doesn't exist yet", moved: now - 30 * H, changed: now - 30 * H },
  { key: "goal:g2", kind: "goal", text: "yes", notGoal: true, state: "waiting" },
  { key: "run:r1", kind: "agent", text: "Deploy the booking fix", lane: "bookly", state: "done", summary: "Deployed and checked live.", changed: now - 2 * H },
  { key: "pr:bookly#12", kind: "pr", text: "Booking reminders", lane: "bookly", state: "merged", changed: now - 5 * H },
  ...[1, 2, 3].map((i) => ({ key: `run:f${i}`, kind: "agent", text: "Phone check", lane: "atlas", state: "failed", changed: now - i * H })),
];
const started = [];
const actIn = (req, lane) => (started.push({ lane, req }), { ok: true, lane, task: "t" + started.length });
const actNow = (req) => (started.push({ lane: "", req }), { ok: true, job: "j" + started.length, dir: join(HOME, "runs", "act-" + started.length) });
const deps = (over = {}) => ({ config: () => ({ intuition: "act" }), jobs, waits: [{ id: "w1", to: "registrar@example.com", subject: "Move request", status: "waiting", sent: new Date(now - 3 * DAY).toISOString() }], rules: ["Never send anything to Remy before the user has seen it"], chat: [{ ts: now - H, text: "where are we with the domain?" }], news: [], map: () => ({ bookly: "/w/bookly", atlas: "/w/atlas" }), actIn, actNow, autoStart: () => true, ...over });
const said = (moves) => async () => ({ text: "Moves: " + JSON.stringify(moves) });
try {
  console.log("INTUITION — the digest, from Symbiot's own records");
  const d = I.digest(deps(), now);
  ok("open goals with where they stand, a stalled one marked, not-goals left out", /move the domain to the company account" \(bookly\): waiting, waiting on user \(the registrar account doesn't exist yet\); last moved 30 h ago — STALLED/.test(d.text) && !/"yes"/.test(d.text), d.text.slice(0, 400));
  ok("…runs that ended, merges not live, a failure pattern, email waits, rules and recent chat", /Deploy the booking fix \(bookly\): done\. Said: Deployed and checked live\./.test(d.text) && /Booking reminders \(bookly\), merged 5 h ago/.test(d.text) && /Pattern: 3 runs failed in atlas/.test(d.text) && /registrar@example.com: "Move request" waiting since 3 days ago/.test(d.text) && /Never send anything to Remy/.test(d.text) && /where are we with the domain\?/.test(d.text), d.text);
  ok("its signature ignores the clock, so a pass is skipped when nothing changed", I.digest(deps(), now).sig === I.digest(deps(), now + 10 * 60000).sig);

  console.log("INTUITION — permission tiers, in code");
  ok("read only, internal, outward, destructive", I.tierOf("Check whether the merge is live").tier === 0 && I.tierOf("Start the next step of the domain move").tier === 1 && I.tierOf("Email the registrar asking where the move stands").tier === 2 && I.tierOf("Deploy the booking reminders").tier === 2 && I.tierOf("Delete the old staging database").tier === 3 && I.tierOf("Pay the registrar invoice").tier === 3);
  ok("…a draft of something outward is still a draft", I.tierOf("Draft a follow-up email to the registrar").tier === 0 && I.tierOf("Draft a follow-up and then send it to the registrar").tier === 2);
  ok("…each outward kind named, for promotion", I.tierOf("Email the registrar about it").kind === "send email" && I.tierOf("Send a WhatsApp to the team").kind === "send WhatsApp");

  console.log("INTUITION — a pass in act mode: read and internal start, outward asks first");
  reset(); writeFileSync(join(CFG, "focus.md"), "# Focus\n## Goals\n- get the domain into the company account\n## Ignore\n- staging noise\n");
  let seenPrompt = "";
  const moves = [
    { kind: "act", what: "Check the registrar for the company account and try the next step of the domain move", why: "It stalled 30 hours ago", lane: "bookly", confidence: 0.9, interrupt: "now" },
    { kind: "act", what: "Deploy the booking reminders to production", why: "Merged 5 hours ago", lane: "bookly", confidence: 0.9, interrupt: "digest" },
    { kind: "prepare", what: "Draft a follow-up to the registrar about the move request", why: "No reply in 3 days", lane: "", confidence: 0.85, interrupt: "digest" },
    { kind: "notice", what: "The phone check has failed three times today", why: "Same failure", lane: "atlas", confidence: 0.8, interrupt: "now" },
    { kind: "focus", what: "The registrar team are people who matter for the domain move", why: "Three emails with them this week", lane: "", confidence: 0.7, interrupt: "digest" },
    { kind: "act", what: "Tidy the readme", why: "meh", lane: "atlas", confidence: 0.3 },
  ];
  const notes = [];
  const r = await I.intuitionPass(deps({ write: async (sys, p) => { seenPrompt = p; return { text: JSON.stringify(moves) }; }, notify: (t, b) => notes.push(b) }), { now });
  ok("the focus file is read on every pass", /get the domain into the company account/.test(seenPrompt) && /staging noise/.test(seenPrompt));
  const byWhat = (w) => r.moves.find((m) => m.what.startsWith(w));
  ok("the stalled goal's next step starts (internal), the draft starts (read only)", byWhat("Check the registrar").started && byWhat("Check the registrar").tier <= 1 && byWhat("Draft a follow-up").started && byWhat("Draft a follow-up").tier === 0, r.moves.map((m) => [m.what.slice(0, 20), m.tier, m.does]));
  const dep = byWhat("Deploy the booking");
  ok("the deploy (outward, tier 2) isn't done: an agent prepares it and asks the user first", dep.tier === 2 && dep.does === "ask" && dep.asked && started.some((s) => /ask the user for their OK in \.symbiot\/QUESTIONS\.md/.test(s.req) && /🤖 Agent: go ahead: Deploy the booking/.test(s.req)), dep);
  ok("an unsure move is dropped", r.rejected.some((x) => /not sure/.test(x.why)));
  ok("urgent ones notify now, the rest wait for the digest", notes.length === 1 && /On my own: Check the registrar/.test(notes[0]) && /Worth knowing: The phone check/.test(notes[0]) && !/Deploy/.test(notes[0]), notes);
  const ups = I.intuitionUpdates({ now });
  ok("Updates: the urgent line, and the focus suggestion with an Add button", ups.some((u) => /On my own: Check the registrar/.test(u.title)) && ups.some((u) => u.accept && /Add to your focus\? The registrar team/.test(u.title)), ups);
  const fp = ups.find((u) => u.accept), a = I.acceptFocus(fp.accept.id);
  ok("…its OK adds the line to focus.md; it never edits it on its own", a.ok && /- The registrar team are people who matter/.test(readFileSync(join(CFG, "focus.md"), "utf8")) && !I.intuitionUpdates({ now }).some((u) => u.accept));
  ok("the chat can say what it did on its own", I.intuitionLines({ now, cfg: { intuition: "act" } }).some((l) => /On my own: Check the registrar/.test(l)));

  console.log("INTUITION — promotion: an outward kind allowed after 3 yeses, back on a no; destructive never");
  const st = JSON.parse(readFileSync(join(CFG, "intuition.json"), "utf8"));
  const L = (answer, at) => { const s = { ...st, passes: [{ id: "p" + at, at: now, learned: "ignored", moves: [{ kind: "act", what: "Email the registrar", lane: "", tier: 2, action: "send email", does: "ask", asked: true, dir: "/x" + at }] }], tiers: st.tiers, weights: {}, noise: {} }; I.learn(s, { config: () => ({}), answersOf: () => answer, dismissed: () => [] }, now + at); st.tiers = s.tiers; return s; };
  st.tiers = {}; L("### Email?\n🤖 Agent: go ahead: Email the registrar\n_answered_", 1); L("yes", 2);
  ok("two yeses: counted, not yet allowed", st.tiers["send email"].approvals === 2 && !st.tiers["send email"].promoted);
  L("🤖 Agent: go ahead", 3);
  ok("three: promoted", st.tiers["send email"].promoted === true);
  const pick = I.choose([{ kind: "act", what: "Email the registrar asking where the move stands", why: "w", confidence: 0.9 }], { st: { passes: [], weights: {}, noise: {}, tiers: st.tiers }, recent: [], cfg: {}, now, mode: "act" });
  ok("…so that kind now starts without asking (the usual send gates still hold)", pick.moves[0].does === "start");
  L("Skip", 4);
  ok("a no demotes it", st.tiers["send email"].promoted === false && st.tiers["send email"].approvals === 0);
  const del = { "delete": { approvals: 9, promoted: true } };
  const pd = I.choose([{ kind: "act", what: "Delete the old staging database", why: "w", confidence: 0.9 }], { st: { passes: [], weights: {}, noise: {}, tiers: del }, recent: [], cfg: {}, now, mode: "act" });
  ok("destructive (tier 3) always asks, whatever its count", pd.moves[0].tier === 3 && pd.moves[0].does === "ask");
  writeFileSync(join(CFG, "intuition.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(CFG, "intuition.json"), "utf8")), tiers: { "send email": { approvals: 3, promoted: true } } }));
  ok("Settings lists it, and revoke takes it back", I.intuitionState({ cfg: {} }).promoted.some((t) => t.kind === "send email" && t.promoted) && I.revoke("send email").ok && !I.intuitionState({ cfg: {} }).promoted.some((t) => t.promoted));

  console.log("INTUITION — watch mode first: it says what it would have done, and does nothing");
  reset(); const n0 = started.length;
  const w = await I.intuitionPass(deps({ config: () => ({}), write: said(moves.slice(0, 2)) }), { now });
  ok("unset: watching on its first day, nothing started, \"I would have …\" on Updates", w.mode === "watch" && started.length === n0 && w.moves.every((m) => m.would) && I.intuitionUpdates({ now }).some((u) => /I would have done this on my own: Check the registrar/.test(u.title) && u.lane === "Watching"), w.moves);
  ok("…a day later it acts, unless the user chose", I.modeOf({}, { first: now }, now + DAY + 1) === "act" && I.modeOf({ intuition: "watch" }, { first: now }, now + 3 * DAY) === "watch" && I.modeOf({ intuition: "off" }, { first: now }, now) === "off" && I.modeOf({ intuition: false }, {}, now) === "off");
  ok("off: no pass", (await I.intuitionPass(deps({ config: () => ({ intuition: "off" }), write: said(moves) }), { now })).skipped === "off");

  console.log("INTUITION — a lane the user paused gets no moves");
  reset(); const n1 = started.length; let pausedPrompt = "";
  const pz = await I.intuitionPass(deps({ parked: () => ["/w/atlas"], write: async (sys, p) => { pausedPrompt = p; return { text: JSON.stringify([
    { kind: "act", what: "Check atlas's phone build", why: "w", lane: "atlas", confidence: 0.9 },
    { kind: "notice", what: "Atlas's phone check failed three times", why: "w", lane: "atlas", confidence: 0.9 },
    { kind: "act", what: "Check bookly's reminders", why: "w", lane: "bookly", confidence: 0.9 },
  ]) }; } }), { now, force: true });
  ok("the prompt names the paused lane, so none is proposed there", /Lanes the user paused \(no moves in them until they unpark one\): atlas/.test(pausedPrompt), pausedPrompt.slice(-200));
  ok("…a move in it starts nothing and is rejected as paused; a notice and other lanes still go", !started.slice(n1).some((s) => s.lane === "atlas") && pz.rejected.some((x) => x.why === "its lane is paused" && /atlas's phone build/.test(x.move.what)) && pz.moves.some((m) => m.kind === "notice" && m.lane === "atlas") && started.slice(n1).some((s) => s.lane === "bookly"), { rejected: pz.rejected, started: started.slice(n1) });

  console.log("INTUITION — each event triaged once, with a cursor per source");
  reset(); let evPrompt = "", calls = 0;
  const evDeps = (news, js = jobs) => deps({ jobs: js, news, write: async (sys, p) => { calls++; evPrompt = sys + p; return { text: "[]" }; } });
  const first = await I.intuitionPass(evDeps([{ id: "n1", name: "Shop site", text: "Price changed" }]), { now, events: true });
  ok("the first look is the baseline: seen, not triaged", first.skipped === "no new events" && calls === 0);
  const news2 = [{ id: "n1", name: "Shop site", text: "Price changed" }, { id: "n2", name: "GitHub notifications", text: "CI failed on main for bookly" }];
  await I.intuitionPass(evDeps(news2, [...jobs, { key: "run:r9", kind: "agent", text: "Calendar sync", lane: "bookly", state: "failed", changed: now + 60000 }]), { now: now + 2 * 60000, events: true });
  ok("new events triaged: a CI failure and a run that ended, with relevance, tier and when to tell", calls === 1 && /New events:/.test(evPrompt) && /CI: CI failed on main for bookly/.test(evPrompt) && /A run ended: Calendar sync \(bookly\): failed/.test(evPrompt) && !/Price changed/.test(evPrompt.split("The situation")[0]), evPrompt.slice(0, 700));
  await I.intuitionPass(evDeps(news2, [...jobs, { key: "run:r9", kind: "agent", text: "Calendar sync", lane: "bookly", state: "failed", changed: now + 60000 }]), { now: now + 4 * 60000, events: true });
  ok("…and never again", calls === 1);

  console.log("INTUITION — learning: put away counts against, ignored lowers how loudly it tells you");
  const s1 = { passes: [{ id: "a", at: now, moves: [{ kind: "act", lane: "bookly" }] }, { id: "b", at: now, moves: [{ kind: "notice", lane: "atlas" }] }], weights: {}, noise: {}, tiers: {} };
  I.learn(s1, { dismissed: () => ["intu:a"] }, now + 2 * DAY);
  ok("put away: fewer of that kind there; ignored a day: quieter", s1.weights["act|bookly"] === -1 && s1.noise["notice|atlas"] === -0.5 && s1.passes[0].learned === "dismissed" && s1.passes[1].learned === "ignored");
  I.learn(s1, { dismissed: () => ["intu:a"] }, now + 3 * DAY);
  ok("…each counted once", s1.weights["act|bookly"] === -1);
  ok("ignored enough: \"now\" drops to the digest, then to the log", I.channelOf({ kind: "notice", lane: "atlas", interrupt: "now", tier: 0 }, { noise: { "notice|atlas": -1 } }) === "digest" && I.channelOf({ kind: "notice", lane: "atlas", interrupt: "now", tier: 0 }, { noise: { "notice|atlas": -2 } }) === "never");
  ok("…but an approval it needs never sinks to a log line", I.channelOf({ kind: "act", lane: "x", interrupt: "never", tier: 2, does: "ask" }, { noise: {} }) === "digest");
  const shy = I.choose([{ kind: "act", what: "Check the booking calendar sync again", why: "w", lane: "bookly", confidence: 0.9 }], { st: { passes: [], weights: { "act|bookly": -2 }, noise: {}, tiers: {} }, recent: [], cfg: {}, now });
  ok("turned down enough: that kind of move there isn't made", !shy.moves.length && /turned down/.test(shy.rejected[0].why));
  // 24 Oct 2026: a run to close run 7740d069's review card ended with a review card of its own
  const tidy = I.choose(["Close the review card from run 7740d069 as done, since it asked nothing.", "Clear the Fly.io send review card from run bf02c1b3 and mark it done.", "Mark run 9b642234 done in the job record"].map((what) => ({ kind: "act", what, why: "w", confidence: 0.9 })).concat([{ kind: "act", what: "Check the booking calendar card layout on the Week page", why: "w", confidence: 0.9 }]), { st: { passes: [], weights: {}, noise: {}, tiers: {} }, recent: [], cfg: {}, now, mode: "act" });
  ok("closing Symbiot's own cards is never a move (no run, so no new card); other work naming a card still is", tidy.moves.length === 1 && /Week page/.test(tidy.moves[0].what) && tidy.rejected.filter((x) => /settle on their own/.test(x.why)).length === 3, tidy);
  const many = Array.from({ length: 8 }, (_, i) => ({ kind: "act", what: `Look into lane item number ${i} carefully`, why: "w", lane: "", confidence: 0.9 }));
  const chosen = I.choose(many, { st: { passes: [], weights: {}, noise: {}, tiers: {} }, recent: [], cfg: { intuitionBudget: 3 }, now, mode: "act" });
  ok("a daily budget of starts (config.intuitionBudget)", chosen.moves.length === 3 && chosen.rejected.filter((x) => /budget/.test(x.why)).length >= 2);

  console.log("INTUITION — the digest twice a day: a report and one Update");
  const dg = { digest: [{ at: now - H, line: "On my own: checked the merge" }, { at: now - 30 * 60000, line: "Worth knowing: a deadline tomorrow" }], digestAt: 0, passes: [] };
  const evening = new Date(2026, 9, 22, 17, 5).getTime(), dir = join(HOME, "digests");
  const out = await I.digestDue(dg, { digestDir: dir }, evening);
  ok("at 17:00 the waiting lines go into a report under Reports, and one Update says so", out && out.items === 2 && readdirSync(dir).some((f) => /^SYMBIOT-DIGEST-/.test(f)) && /Worth knowing: a deadline tomorrow/.test(readFileSync(out.file, "utf8")) && dg.passes[0].report && /Digest: 2 things/.test(dg.passes[0].title));
  const dm = { digest: [{ at: now - 3 * H, line: "I would have done this on my own: x", mode: "watch", how: "only suggested" }, { at: now - H, line: "On my own: y", mode: "act", how: "done" }], digestAt: 0, passes: [] };
  const dmo = await I.digestDue(dm, { digestDir: join(HOME, "digests2") }, evening), dtx = dmo ? readFileSync(dmo.file, "utf8") : "";
  ok("the digest opens with its mode and why, notes the change when it happened, and marks each line", /\*\*Mode: watching only\*\*: it watches its first day/.test(dtx) && /it changed from watching only to acting/.test(dtx) && /\[only suggested\] I would have/.test(dtx) && /\[done\] On my own/.test(dtx), dtx);
  ok("…not twice for the same slot", (await I.digestDue(dg, { digestDir: dir }, evening + 60000)) === null);

  console.log("INTUITION — a broken answer gets one more try");
  let tries = 0; const mv = await I.askMoves(async () => (++tries === 1 ? { text: '[{"kind":"notice","what":"the "site" changed"}]' } : { text: '[{"kind":"notice","what":"the ’site’ changed","confidence":0.9}]' }), "s", "p");
  ok("invalid JSON: asked again, and the good answer is used", tries === 2 && mv.length === 1 && /’site’/.test(mv[0].what));
  console.log("INTUITION — the timer's rhythm");
  reset(); I.nudge();
  ok("a nudge (a run ended, a reply came) is kept for the next tick", JSON.parse(readFileSync(join(CFG, "intuition.json"), "utf8")).nudged > 0);

  console.log("INTUITION — updates carry their moves, and each can be done or marked not useful");
  { const I2 = await import("../intuition.mjs"), F = join(CFG, "intuition.json");
    const st = JSON.parse(readFileSync(F, "utf8")); st.passes.push({ id: "pu1", at: Date.now(), mode: "watch", title: "t", moves: [
      { kind: "act", what: "Pick up the stalled recheck", why: "4 hours idle", lane: "atlas", tier: 1, action: "internal", does: "start", would: true },
      { kind: "notice", what: "A ticket has had no reply", lane: "", tier: 0, does: "notice" }] }); writeFileSync(F, JSON.stringify(st));
    const u = I2.intuitionUpdates().find((x) => x.id === "intu:pu1");
    ok("an update lists its moves: the would-have one can be done, a notice can't", u && u.moves.length === 2 && u.moves[0].do === "Do it" && !u.moves[1].do, u && u.moves);
    const asked = [];
    const r = I2.doMove("pu1", 0, { map: { atlas: "/w/atlas" }, actIn: (req, lane) => (asked.push([lane, req]), { job: "j1" }), autoStart: () => true });
    ok("Do it carries it out now, in its lane, saying it's Symbiot's own", r.ok && asked.length === 1 && asked[0][0] === "atlas" && /Pick up the stalled recheck/.test(asked[0][1]), [r, asked]);
    ok("…and it shows as done, and isn't done twice", I2.intuitionUpdates().find((x) => x.id === "intu:pu1").moves[0].state === "done" && /already under way/.test(I2.doMove("pu1", 0, {}).said));
    ok("Not useful marks it and counts that kind down", I2.markMove("pu1", 1).ok && I2.intuitionUpdates().find((x) => x.id === "intu:pu1").moves[1].state === "not useful" && JSON.parse(readFileSync(F, "utf8")).weights["notice|"] < 0);
    ok("the Ask box gets the moves as context", /Pick up the stalled recheck/.test(I2.moveContext("pu1")) && /\[done\]/.test(I2.moveContext("pu1"))); }

  console.log("WHAT UPDATES SHOW — only what's still news, and never a line that something waits on you (23 Oct 2026)");
  { const F = join(CFG, "intuition.json"), st = JSON.parse(readFileSync(F, "utf8")), now = Date.now();
    st.passes = [
      { id: "old1", at: now - 13 * 3600000, title: "t", moves: [{ kind: "notice", what: "A thing from yesterday", lane: "shop", does: "notice" }] },
      { id: "p1", at: now - 3600000, title: "t", moves: [{ kind: "notice", what: "The test texts went out; the 300 broker texts wait only for your Go.", lane: "shop", does: "notice" }, { kind: "notice", what: "The cafe page is slow again", lane: "cafe", does: "notice" }] },
      { id: "p2", at: now - 600000, title: "t", moves: [{ kind: "notice", what: "Batch 2 went out: all 300 were sent.", lane: "shop", does: "notice" }, { kind: "notice", what: "The Workspace run is waiting on one yes from you.", lane: "ops", does: "notice" }] },
    ];
    writeFileSync(F, JSON.stringify(st));
    const u = I.intuitionUpdates({ now }), all = u.flatMap((x) => (x.moves || []).map((m) => m.line));
    ok("a line that only says something waits on the user never shows (its card on Home has the buttons)", !all.some((l) => /wait(?:s|ing)? (?:only )?(?:on|for)/.test(l)), all);
    ok("a project's newer news replaces its older; another project's stays", all.some((l) => /Batch 2 went out/.test(l)) && all.some((l) => /cafe page is slow/.test(l)) && !all.some((l) => /test texts went out/.test(l)), all);
    ok("…and nothing older than 12 hours", !all.some((l) => /from yesterday/.test(l)) && !u.some((x) => x.id === "intu:old1"), u.map((x) => x.id));
    ok("the same check stops a new pass writing one", I.asksOfUser({ kind: "notice", what: "Answer only the ops run." }) && !I.asksOfUser({ kind: "act", what: "Check the deploy answers" })); }
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} intuition: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
