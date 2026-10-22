// symbiot — intuition: what a sharp assistant would do next, unasked. Symbiot waited to be told:
// a goal stalled a day before anyone looked, a reply sat until the user asked "did they answer?",
// a merge stayed undeployed until someone noticed (22 Oct 2026, "it's more reactive than
// proactive"). So, every 30 minutes and soon after a run ends or a reply arrives, it reads the
// whole situation (a digest built from its own records, no AI) and the strongest chat model says
// up to five moves, each one of:
//
// - act:     internal, reversible work started through the usual paths (mind.mjs actIn/actNow):
//            the next step on a stalled goal, the lane on a reply that came in, a deploy check
//            after a merge (never the deploy), a check, research, a draft;
// - prepare: something the user will need next, written up by an agent as a report under
//            Reports (a follow-up's draft, a status summary, a plan), never sent;
// - notice:  something worth knowing (a risk, a deadline, the same failure three times), on
//            Updates (needs.mjs), never on Needs you.
//
// It never sends, posts, pays, deletes, merges or deploys: an outward move is dropped here, and
// anything a run finds needs the user goes through the usual question checkpoint (triage.mjs).
// Starts are capped: the lane's hourly cap (agents.mjs autoStart) and a daily budget
// (config.intuitionBudget, 10). What it did is kept in intuition.json, so it doesn't repeat
// itself, and it learns: a pass the user puts away on Updates counts against that kind of move
// in that lane; one left there a day counts for it. config.intuition false switches it off.
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { CONFIG_DIR, readState, writeJsonAtomic, sameTask } from "./core.mjs";

const FILE = () => join(CONFIG_DIR, "intuition.json");
const EVERY = 30 * 60000, NUDGE_GAP = 5 * 60000, DAY = 86400000, STALE = DAY;
const BUDGET = 10, MAX_MOVES = 5, MIN_CONF = 0.6, SHUN = -2, KEEP_MOVES = 200;
const KINDS = ["act", "prepare", "notice"];
// a move that would reach someone or change something for good: never Symbiot's own to make
const OUTWARD = /\b(send|sends|sending|sent|post|posts|posting|publish|publishes|pay|pays|purchase|buy|delete|deletes|remove|removes|merge|merges|deploy|deploys|release|releases|email|e-mail|message|text|sms|whatsapp|call|invite|book|transfer|reply to|respond to|tell|notify|announce|unsubscribe|cancel)\b/i;
const INWARD = /\b(draft|drafts|prepare|check|checks|plan|summar\w*|look into|find out|research|read|review|compare|work out|verify|test)\b/i;
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const ago = (t, now) => { const m = Math.max(0, Math.round((now - t) / 60000)); return m < 90 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

function load() { const d = readState(FILE(), (x) => x && typeof x === "object") || {}; return { at: d.at || 0, sig: d.sig || "", nudged: d.nudged || 0, passes: Array.isArray(d.passes) ? d.passes : [], weights: d.weights && typeof d.weights === "object" ? d.weights : {} }; }
function save(st) { try { writeJsonAtomic(FILE(), { ...st, passes: st.passes.slice(-KEEP_MOVES) }, { indent: 1, mode: 0o600 }); } catch {} }
const on = (cfg) => !cfg || cfg.intuition !== false;

// ---- the digest: the situation in plain lines, from Symbiot's own records -----------------------
// deps: { jobs, waits, rules, chat, now } (each a value or a function giving one).
function digest(deps = {}, now = Date.now()) {
  const v = (x, d) => { try { return typeof x === "function" ? x() : x === undefined ? d : x; } catch { return d; } };
  const jobs = v(deps.jobs, []) || [], waits = v(deps.waits, []) || [], rules = v(deps.rules, []) || [], chat = v(deps.chat, []) || [];
  const L = [], stale = [];
  const goals = jobs.filter((j) => j.kind === "goal" && !j.notGoal && !["done", "closed", "not"].includes(j.state));
  L.push("Open goals (what the user asked for, and where each stands):");
  for (const g of goals.slice(0, 15)) {
    const moved = g.moved || g.changed || g.at || now, old = now - moved > STALE;
    if (old) stale.push(g.text || g.asked);
    L.push(`- "${clip(g.asked || g.text, 140)}"${g.lane ? ` (${g.lane})` : ""}: ${g.state}${g.waitingOn ? `, waiting on ${g.waitingOn}` : ""}${g.what ? ` (${clip(g.what, 120)})` : ""}; last moved ${ago(moved, now)}${old ? " — STALLED" : ""}`);
  }
  if (!goals.length) L.push("- none");
  const runs = jobs.filter((j) => String(j.key).startsWith("run:") && j.state !== "running" && now - (j.changed || 0) < DAY).sort((a, b) => b.changed - a.changed);
  L.push("Runs that ended in the last day:");
  for (const r of runs.slice(0, 12)) L.push(`- ${clip(r.text, 80)}${r.lane ? ` (${r.lane})` : ""}: ${r.state}${r.waitingOn ? `, waiting on ${r.waitingOn}` : ""}${r.what ? ` (${clip(r.what, 100)})` : ""}${r.summary ? `. Said: ${clip(r.summary, 160)}` : ""}`);
  if (!runs.length) L.push("- none");
  const failed = {}; for (const r of runs) if (r.state === "failed") failed[r.lane || "ops"] = (failed[r.lane || "ops"] || 0) + 1;
  for (const [lane, n] of Object.entries(failed)) if (n >= 3) L.push(`Pattern: ${n} runs failed in ${lane} in the last day.`);
  const merged = jobs.filter((j) => j.state === "merged");
  L.push("Merged but not live:", ...(merged.length ? merged.slice(0, 8).map((j) => `- ${clip(j.text, 100)}${j.lane ? ` (${j.lane})` : ""}, merged ${ago(j.changed || now, now)}`) : ["- none"]));
  L.push("Email waits:", ...(waits.length ? waits.slice(0, 10).map((w) => `- to ${w.to}: "${clip(w.subject, 80)}" ${w.status === "waiting" ? `waiting since ${ago(Date.parse(w.sent || "") || now, now)}` : w.status}${w.reply ? `; reply: ${clip(typeof w.reply === "string" ? w.reply : w.reply.subject || "", 80)}` : ""}`) : ["- none"]));
  L.push("The user's standing rules:", ...(rules.length ? rules.slice(0, 15).map((r) => `- ${clip(r, 200)}`) : ["- none"]));
  L.push("What they asked in chat lately (newest last):", ...(chat.length ? chat.slice(-8).map((c) => `- ${ago(c.ts || now, now)}: ${clip(c.text, 160)}`) : ["- nothing lately"]));
  const body = L.join("\n"), d = new Date(now);
  return { text: `It's ${d.toLocaleString("en-ZA", { weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false })}.\n${body}`, sig: createHash("sha1").update(body.replace(/\d+ (?:min|h|days) ago/g, "")).digest("hex").slice(0, 16), stale };
}

const SYSTEM = `You are the user's chief of staff inside Symbiot, the app that runs their AI agents across their projects. From the situation below, say what a sharp assistant would do next, unasked: what's stalled and could move, what's obviously next after something finished, what they'll need before they ask, and what they should know. Answer with JSON only: a list of at most 5 moves, best first:
[{"kind":"act|prepare|notice","what":"…","why":"…","lane":"…","confidence":0.0}]
- act: internal, reversible work an agent can start now: the next step on a stalled goal, checking something, research, a draft, a deploy CHECK after a merge. Never anything that sends, posts, publishes, pays, deletes, merges or deploys: those stay the user's.
- prepare: something they'll need next, written up as a report for them to read (a follow-up's draft, a status summary, a plan). Never sent.
- notice: one line they should know (a risk, a deadline, the same failure again and again).
- what: one plain sentence, the move itself. why: one plain sentence, what in the situation calls for it. lane: the project it's for if one fits, else "".
- confidence: how sure you are it's wanted (0 to 1). Leave out anything under 0.6, anything already in hand, anything already done, and anything the user turned down before (listed below). An empty list [] is a fine answer.`;

// ---- a pass ------------------------------------------------------------------------------------
// deps: { config, write, digest deps…, map, actIn, actNow, autoStart, dismissed, now }
// Returns { skipped } or { pass, moves, rejected }.
async function intuitionPass(deps = {}, { now = Date.now(), force = false } = {}) {
  const cfg = (() => { try { return deps.config ? deps.config() : {}; } catch { return {}; } })();
  if (!on(cfg)) return { skipped: "off" };
  if (typeof deps.write !== "function") return { skipped: "no AI" };
  const st = load(); learn(st, deps, now);
  const d = digest(deps, now);
  if (!force && st.sig === d.sig) { save(st); return { skipped: "nothing changed" }; }
  const recent = st.passes.filter((p) => now - p.at < DAY).flatMap((p) => p.moves || []);
  const shunned = Object.entries(st.weights).filter(([, w]) => w <= SHUN).map(([k]) => k);
  const prompt = `${d.text}\n\nAlready done on its own in the last day (don't repeat):\n${recent.length ? recent.map((m) => `- ${m.kind}: ${m.what}`).join("\n") : "- nothing"}\n\nTurned down by the user before (kind|lane):\n${shunned.length ? shunned.map((k) => `- ${k}`).join("\n") : "- nothing"}`;
  let r = null; try { r = await deps.write(SYSTEM, prompt, { floor: "sonnet", kind: "intuition" }); } catch {}
  const text = r && typeof r.text === "string" ? r.text : "", m = text.match(/\[[\s\S]*\]/);
  let raw = []; try { raw = m ? JSON.parse(m[0]) : []; } catch {}
  const { moves, rejected } = choose(Array.isArray(raw) ? raw : [], { st, recent, cfg, now });
  const map = (() => { try { return deps.map ? deps.map() : {}; } catch { return {}; } })();
  for (const mv of moves) if (mv.kind !== "notice") start(mv, deps, map);
  st.sig = d.sig; st.at = now; st.nudged = 0;
  const did = moves.filter((x) => x.kind === "notice" || x.started);
  const pass = did.length ? { id: randomBytes(4).toString("hex"), at: now, moves: did, title: titleOf(did) } : null;
  if (pass) st.passes.push(pass);
  save(st);
  return { pass, moves, rejected };
}

// The moves it may make: known kind, sure enough, not outward, not repeated, not turned down, within
// the day's budget of starts. rejected: [{ move, why }].
function choose(raw, { st, recent, cfg, now }) {
  const budget = Number(cfg && cfg.intuitionBudget) > 0 ? Number(cfg.intuitionBudget) : BUDGET;
  let started = st.passes.filter((p) => now - p.at < DAY).flatMap((p) => p.moves || []).filter((x) => x.started).length;
  const moves = [], rejected = [];
  for (const x of raw.slice(0, MAX_MOVES * 2)) {
    const mv = { kind: String(x && x.kind || ""), what: clip(x && x.what, 300), why: clip(x && x.why, 300), lane: clip(x && x.lane, 60), confidence: Number(x && x.confidence) || 0 };
    const no = (why) => rejected.push({ move: mv, why });
    if (!KINDS.includes(mv.kind) || !mv.what) { no("not a move"); continue; }
    if (mv.confidence < MIN_CONF) { no("not sure enough"); continue; }
    if (mv.kind !== "notice" && OUTWARD.test(mv.what) && !(INWARD.test(mv.what) && !/\b(and|then) (send|post|publish|pay|delete|merge|deploy|email|message)\b/i.test(mv.what))) { no("outward: that's the user's to do"); continue; }
    if ((st.weights[`${mv.kind}|${mv.lane}`] || 0) <= SHUN) { no("turned down before"); continue; }
    if (recent.some((r) => r.kind === mv.kind && (r.lane || "") === mv.lane && sameTask(r.what, mv.what)) || moves.some((r) => r.kind === mv.kind && sameTask(r.what, mv.what))) { no("already done"); continue; }
    if (mv.kind !== "notice" && started >= budget) { no("the day's budget is spent"); continue; }
    if (mv.kind !== "notice") started++;
    moves.push(mv); if (moves.length >= MAX_MOVES) break;
  }
  return { moves, rejected };
}

// Starts one move through the usual paths: the lane's agent (actIn, which also respects its hourly
// cap through autoStart) or an agent run of its own (actNow).
function start(mv, deps, map) {
  const req = mv.kind === "prepare"
    ? `Draft this as a report for the user to read, under Reports (a .md in .symbiot/ starting with a # title), and don't send or share it anywhere: ${mv.what}\n\nWhy now: ${mv.why}\n\nSymbiot started this on its own; no one asked.`
    : `${mv.what}\n\nWhy now: ${mv.why}\n\nSymbiot started this on its own (no one asked): keep it to internal, reversible work. Never send, post, pay, delete, merge or deploy; if any of that is needed, ask the user in .symbiot/QUESTIONS.md as usual.`;
  const lanePath = mv.lane && map[mv.lane];
  if (lanePath && deps.autoStart && !deps.autoStart(lanePath)) { mv.error = "the lane's hourly cap"; return; }
  let r = null;
  try { r = lanePath && deps.actIn ? deps.actIn(req, mv.lane, { map, title: "Symbiot, on its own" }) : deps.actNow ? deps.actNow(req, { title: "Symbiot, on its own", lane: mv.lane || "" }) : null; } catch (e) { r = { error: String((e && e.message) || e) }; }
  if (r && !r.error) { mv.started = true; if (r.job) mv.job = r.job; if (r.dir) mv.dir = r.dir; if (r.task) mv.task = r.task; } else mv.error = (r && r.error) || "it didn't start";
}

// What the user sees on Updates, one line per pass.
function line(mv) {
  if (mv.kind === "notice") return `Worth knowing: ${mv.what}`;
  if (mv.kind === "prepare") return `Drafting for you (under Reports, not sent): ${mv.what}`;
  return `On my own: ${mv.what}`;
}
const titleOf = (moves) => clip(moves.map(line).join(" · "), 240);

// Learning: a pass put away on Updates counts against its kinds of move in their lanes; one left a
// day counts for them. Each pass is counted once.
function learn(st, deps, now) {
  let gone = new Set(); try { gone = new Set(deps.dismissed ? deps.dismissed() : []); } catch {}
  for (const p of st.passes) {
    if (p.learned) continue;
    const away = gone.has(`intu:${p.id}`), kept = !away && now - p.at > DAY;
    if (!away && !kept) continue;
    for (const mv of p.moves || []) { const k = `${mv.kind}|${mv.lane || ""}`; st.weights[k] = Math.max(-5, Math.min(5, (st.weights[k] || 0) + (away ? -1 : 0.5))); }
    p.learned = away ? "dismissed" : "kept";
  }
}

// ---- where it shows -----------------------------------------------------------------------------
// Home's Updates: the last two days' passes, as needs.mjs's updates look.
function intuitionUpdates({ now = Date.now(), dismissed = new Set() } = {}) {
  return load().passes.filter((p) => now - p.at < 2 * DAY && !dismissed.has(`intu:${p.id}`)).slice(-4).reverse()
    .map((p) => ({ id: `intu:${p.id}`, key: `intu:${p.id}`, title: p.title, lane: "On its own", intuition: true }));
}
// Home chat ("what are you doing on your own?"): the last day's moves.
function intuitionLines({ now = Date.now() } = {}) {
  const st = load(), moves = st.passes.filter((p) => now - p.at < DAY).flatMap((p) => (p.moves || []).map((m) => ({ ...m, at: p.at })));
  return [`What Symbiot did on its own in the last day (its intuition; answer "what are you doing on your own?" from this):`, ...(moves.length ? moves.map((m) => `- ${ago(m.at, now)}: ${line(m)}${m.error ? ` (didn't start: ${m.error})` : ""}`) : ["- nothing"])];
}
// A run ended, a reply came in: look again soon, not at the next half hour.
function nudge() { const st = load(); if (!st.nudged) { st.nudged = Date.now(); save(st); } }
// The timer (server.mjs, every 2 minutes): a pass every 30 minutes, or 5 minutes after a nudge.
async function intuitionTick(deps = {}, { now = Date.now() } = {}) {
  const st = load();
  if (now - st.at < (st.nudged ? NUDGE_GAP : EVERY)) return { skipped: "not yet" };
  return intuitionPass(deps, { now });
}

export { SYSTEM as INTUITION_SYSTEM, digest, intuitionPass, intuitionTick, choose, learn, intuitionUpdates, intuitionLines, nudge, line, on as intuitionOn, OUTWARD, FILE as INTUITION_FILE, EVERY, NUDGE_GAP, BUDGET };
