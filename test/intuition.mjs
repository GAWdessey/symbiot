// Intuition (intuition.mjs): what a sharp assistant would do next, unasked. The digest is built from
// Symbiot's own records; the moves are internal only (outward ones dropped), capped by a daily budget
// and the lane's hourly cap, never repeated, and learned from: a pass put away counts against that
// kind of move (22 Oct 2026). Isolated HOME, a stand-in AI.
//
//   node test/intuition.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-intuition-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const I = await import("../intuition.mjs");

const now = Date.parse("2026-10-22T09:00:00Z"), H = 3600e3, DAY = 24 * H;
const jobs = [
  { key: "goal:g1", kind: "goal", text: "move the domain to the company account", asked: "move the domain to the company account", lane: "bookly", state: "waiting", waitingOn: "user", what: "the registrar account doesn't exist yet", moved: now - 30 * H, changed: now - 30 * H },
  { key: "goal:g2", kind: "goal", text: "yes", notGoal: true, state: "waiting" },
  { key: "run:r1", kind: "agent", text: "Deploy the booking fix", lane: "bookly", state: "done", summary: "Deployed and checked live.", changed: now - 2 * H },
  { key: "pr:bookly#12", kind: "pr", text: "Booking reminders", lane: "bookly", state: "merged", changed: now - 5 * H },
  ...[1, 2, 3].map((i) => ({ key: `run:f${i}`, kind: "agent", text: "Phone check", lane: "atlas", state: "failed", changed: now - i * H })),
];
const deps = (over = {}) => ({ config: () => ({}), jobs, waits: [{ to: "registrar@example.com", subject: "Move request", status: "waiting", sent: new Date(now - 3 * DAY).toISOString() }], rules: ["Never send anything to Remy before the user has seen it"], chat: [{ ts: now - H, text: "where are we with the domain?" }], map: () => ({ bookly: "/w/bookly", atlas: "/w/atlas" }), ...over });
try {
  console.log("INTUITION — the digest, from Symbiot's own records");
  const d = I.digest(deps(), now);
  ok("open goals with where they stand, a stalled one marked, not-goals left out", /move the domain to the company account" \(bookly\): waiting, waiting on user \(the registrar account doesn't exist yet\); last moved 30 h ago — STALLED/.test(d.text) && !/"yes"/.test(d.text), d.text.slice(0, 400));
  ok("…runs that ended, merges not live, a failure pattern, email waits, rules and recent chat", /Deploy the booking fix \(bookly\): done\. Said: Deployed and checked live\./.test(d.text) && /Booking reminders \(bookly\), merged 5 h ago/.test(d.text) && /Pattern: 3 runs failed in atlas/.test(d.text) && /registrar@example.com: "Move request" waiting since 3 days ago/.test(d.text) && /Never send anything to Remy/.test(d.text) && /where are we with the domain\?/.test(d.text), d.text);
  ok("its signature ignores the clock, so a pass is skipped when nothing changed", I.digest(deps(), now).sig === I.digest(deps(), now + 10 * 60000).sig);

  console.log("INTUITION — a pass: internal moves start, outward ones never do");
  const said = [
    { kind: "act", what: "Check the registrar for the company account and try the next step of the domain move", why: "It stalled 30 hours ago", lane: "bookly", confidence: 0.9 },
    { kind: "act", what: "Deploy the booking reminders to production", why: "Merged 5 hours ago", lane: "bookly", confidence: 0.9 },
    { kind: "act", what: "Email the registrar asking where the move stands", why: "No reply in 3 days", lane: "", confidence: 0.8 },
    { kind: "prepare", what: "Draft a follow-up to the registrar about the move request", why: "No reply in 3 days", lane: "", confidence: 0.85 },
    { kind: "notice", what: "The phone check has failed three times today", why: "Same failure", lane: "atlas", confidence: 0.8 },
    { kind: "act", what: "Tidy the readme", why: "meh", lane: "atlas", confidence: 0.3 },
  ];
  const started = [];
  const write = async () => ({ text: "Moves: " + JSON.stringify(said) });
  const actIn = (req, lane) => (started.push({ lane, req }), { ok: true, lane, task: "t" + started.length });
  const actNow = (req) => (started.push({ lane: "", req }), { ok: true, job: "j" + started.length, dir: "/runs/act-x" });
  const r = await I.intuitionPass(deps({ write, actIn, actNow, autoStart: () => true }), { now });
  const kinds = r.moves.map((m) => m.kind + ":" + m.what.slice(0, 20));
  ok("the stalled goal's next step and the draft start, the notice is kept", r.moves.length === 3 && started.length === 2 && started[0].lane === "bookly" && /Check the registrar/.test(started[0].req) && /Draft this as a report/.test(started[1].req) && /don't send/.test(started[1].req) && r.moves.some((m) => m.kind === "notice"), kinds);
  ok("…a deploy and an email are dropped as the user's, an unsure one as unsure", r.rejected.filter((x) => /outward/.test(x.why)).length === 2 && r.rejected.some((x) => /not sure/.test(x.why)), r.rejected.map((x) => x.why + ": " + x.move.what.slice(0, 30)));
  ok("every start is told it's on its own and to keep to internal work", started.every((s) => /Symbiot started this on its own/.test(s.req)) && /Never send, post, pay, delete, merge or deploy/.test(started[0].req));
  ok("one Updates entry for the pass, in plain words", r.pass && /^On my own: Check the registrar/.test(r.pass.title) && /Drafting for you \(under Reports, not sent\)/.test(r.pass.title) && /Worth knowing: The phone check/.test(r.pass.title), r.pass && r.pass.title);
  const ups = I.intuitionUpdates({ now });
  ok("…on Updates, put away by its key", ups.length === 1 && ups[0].key === `intu:${r.pass.id}` && I.intuitionUpdates({ now, dismissed: new Set([ups[0].key]) }).length === 0, ups);
  ok("the chat can say what it did on its own", I.intuitionLines({ now }).some((l) => /On my own: Check the registrar/.test(l)), I.intuitionLines({ now }));

  console.log("INTUITION — no repeats, nothing when nothing changed, a budget, the lane's cap");
  const again = await I.intuitionPass(deps({ write, actIn, actNow, autoStart: () => true }), { now: now + 60000 });
  ok("nothing changed since the last pass: skipped, no AI call", again.skipped === "nothing changed");
  const n0 = started.length;
  const forced = await I.intuitionPass(deps({ write, actIn, actNow, autoStart: () => true }), { now: now + 120000, force: true });
  ok("the same moves within the day aren't made again", started.length === n0 && forced.rejected.some((x) => /already done/.test(x.why)), forced.rejected.map((x) => x.why));
  const many = Array.from({ length: 8 }, (_, i) => ({ kind: "act", what: `Look into lane item number ${i} carefully`, why: "w", lane: "", confidence: 0.9 }));
  const chosen = I.choose(many, { st: { passes: [], weights: {} }, recent: [], cfg: { intuitionBudget: 3 }, now });
  ok("a daily budget of starts (config.intuitionBudget)", chosen.moves.length === 3 && chosen.rejected.filter((x) => /budget/.test(x.why)).length >= 2, chosen.rejected.map((x) => x.why));
  const capped = []; const mv = [{ kind: "act", what: "Check the booking calendar sync", why: "w", lane: "bookly", confidence: 0.9 }];
  const r2 = await I.intuitionPass(deps({ write: async () => ({ text: JSON.stringify(mv) }), actIn: (q, l) => (capped.push(l), { ok: true }), actNow, autoStart: () => false, jobs: [...jobs, { key: "run:new", kind: "agent", text: "x", state: "done", changed: now }] }), { now: now + 3 * H });
  ok("the lane's hourly cap holds: not started, says why", capped.length === 0 && r2.moves[0].error === "the lane's hourly cap" && !r2.pass, r2.moves);

  console.log("INTUITION — it learns: a pass put away counts against that kind of move there");
  const st0 = JSON.parse(readFileSync(join(CFG, "intuition.json"), "utf8")), key = `intu:${st0.passes[0].id}`;
  const st = { passes: st0.passes.map((p) => ({ ...p })), weights: {} };
  I.learn(st, { dismissed: () => [key] }, now + H);
  ok("put away: each of its kinds of move in its lane counts down, once", st.weights["act|bookly"] === -1 && st.weights["notice|atlas"] === -1 && st.passes[0].learned === "dismissed");
  I.learn(st, { dismissed: () => [key] }, now + 2 * H);
  ok("…not counted twice", st.weights["act|bookly"] === -1);
  const kept = { passes: st0.passes.map((p) => ({ ...p, learned: undefined })), weights: {} };
  I.learn(kept, { dismissed: () => [] }, now + 2 * DAY);
  ok("left there a day: counts for it", kept.weights["act|bookly"] === 0.5);
  const shy = I.choose([{ kind: "act", what: "Check the booking calendar sync again", why: "w", lane: "bookly", confidence: 0.9 }], { st: { passes: [], weights: { "act|bookly": -2 } }, recent: [], cfg: {}, now });
  ok("turned down enough: that kind of move there isn't made", !shy.moves.length && /turned down/.test(shy.rejected[0].why));

  console.log("INTUITION — off when the user says so, and the timer's rhythm");
  ok("config.intuition false: no pass", (await I.intuitionPass(deps({ config: () => ({ intuition: false }), write }), { now: now + 5 * H })).skipped === "off");
  const t1 = await I.intuitionTick(deps({ write, actIn, actNow, autoStart: () => true }), { now: now + 3 * H + 60000 });
  ok("the tick waits for its 30 minutes", t1.skipped === "not yet");
  I.nudge();
  const st2 = JSON.parse(readFileSync(join(CFG, "intuition.json"), "utf8"));
  ok("a nudge (a run ended, a reply came) brings the next pass to 5 minutes", st2.nudged > 0);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} intuition: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
