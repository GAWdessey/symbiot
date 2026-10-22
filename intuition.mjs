// symbiot — intuition: what a sharp assistant would do next, unasked. Symbiot waited to be told:
// a goal stalled a day before anyone looked, a reply sat until the user asked "did they answer?",
// a merge stayed undeployed until someone noticed (22 Oct 2026, "it's more reactive than
// proactive"). Two ways in, one way out:
//
// - Each new event (a run ended, a merge, a reply, a watched site changed, a CI failure) is seen
//   once (a cursor per source) and triaged: is it relevant to the user's focus, what would be done,
//   and is it worth interrupting them now, in the digest, or never.
// - Every 30 minutes, and 5 minutes after an event, a whole-situation pass reads a digest of
//   Symbiot's own records plus focus.md and says what's stalled, what's obviously next, what
//   they'll need, and what they should know.
//
// Every move goes through the same rules, explicit here and on top of every existing gate (the
// guard, chromegate holds, sends.mjs, runbook policies), never loosening one:
//   tier 0  read only (summarise, search, check, draft): allowed;
//   tier 1  internal and reversible (start or continue a run, a draft, a label): allowed, logged;
//   tier 2  outward (email, WhatsApp, a GitHub comment, a push, a post): approval first, through a
//           normal agent question (triage and the card contract). A kind of action the user has
//           approved PROMOTE_AFTER times (3) is promoted to allowed; a rejection demotes it.
//   tier 3  destructive or financial: always approval, never promoted.
// Where it tells the user: now (a desktop notification and Updates, urgent only), in the digest
// (twice a day, a report and one Update), or nowhere (the log). Kinds the user keeps ignoring
// drop a channel.
// Modes (config.intuition): "off", "watch" (it says what it would have done, and does nothing),
// "act". Unset, it watches for its first 24 hours and then acts, unless the user chose.
// focus.md (~/.config/symbiot/focus.md) is the user's: goals, projects, people, topics to ignore.
// Every pass reads it; Symbiot only proposes additions, on Updates, for their OK.
// Sources and tiers are lists, so later overrides can add triggers and rules without changing the loop.
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { CONFIG_DIR, readState, writeJsonAtomic, sameTask } from "./core.mjs";
import { sentAt } from "./handback.mjs";

const FILE = () => join(CONFIG_DIR, "intuition.json"), FOCUS = () => join(CONFIG_DIR, "focus.md");
const DIGEST_DIR = () => join(CONFIG_DIR, "drafts", "act-intuition", ".symbiot"); // a run folder Reports reads
const EVERY = 30 * 60000, NUDGE_GAP = 5 * 60000, DAY = 86400000, STALE = DAY, WATCH_FIRST = DAY;
const BUDGET = 10, MAX_MOVES = 5, MIN_CONF = 0.6, SHUN = -2, KEEP = 300, PROMOTE_AFTER = 3, EVENTS_MAX = 12;
const DIGEST_HOURS = [8, 17];
const KINDS = ["act", "prepare", "notice", "focus"], CHANNELS = ["now", "digest", "never"];
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const ago = (t, now) => { const m = Math.max(0, Math.round((now - t) / 60000)); return m < 90 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

// ---- tiers --------------------------------------------------------------------------------------
// First match wins, highest tier first. `kind` names the action for promotion ("send email").
const TIERS = [
  { tier: 3, kind: "pay or buy", re: /\b(pay|pays|payment|purchase|buy|buys|refund|transfer money|top up|subscribe to)\b/i },
  { tier: 3, kind: "delete", re: /\b(delete|deletes|remove|removes|wipe|drop the (?:table|database)|close (?:the |an )?account|cancel (?:the |a )?(?:subscription|account|order))\b/i },
  { tier: 2, kind: "send email", re: /\b(email|e-mail)\b.*\b(to|the|him|her|them)\b|\bsend (?:an? )?(?:email|e-mail|mail)\b|\breply to\b/i },
  { tier: 2, kind: "send WhatsApp", re: /\b(whatsapp|sms|text message)\b/i },
  { tier: 2, kind: "comment on GitHub", re: /\bcomment\b.*\b(github|pr|pull request|issue)\b/i },
  { tier: 2, kind: "push", re: /\b(push|merge|merges|deploy|deploys|release|releases|publish|publishes)\b/i },
  { tier: 2, kind: "post", re: /\b(post|posts|tweet|announce)\b(?! (?:draft|edit))/i },
  { tier: 2, kind: "send", re: /\b(send|sends|message|invite|notify|tell|call|book)\b/i },
  { tier: 0, kind: "read", re: /\b(summar\w*|search|look into|find out|research|read|review|compare|check|verify|draft|prepare|plan|work out)\b/i },
];
const LOOKS = /^\s*(?:have an? \w+ (?:agent )?)?(?:check|checks|verify|look into|look at|find out|review|summar\w*|research|compare|read|search|see whether|see if|confirm whether|investigate|work out)\b/i;
const THEN_OUT = /\b(and|then) (send|post|publish|email|message|deploy|merge|push|delete|pay)\b/i;
function tierOf(text) {
  const t = String(text || ""), drafting = /\b(draft|prepare)\b/i.test(t) && !THEN_OUT.test(t);
  if (LOOKS.test(t) && !THEN_OUT.test(t)) return { tier: 0, kind: "read" }; // "Check whether the merge is live": a look, whatever it's about
  for (const x of TIERS) if (x.re.test(t)) return drafting && x.tier === 2 ? { tier: 0, kind: "draft" } : { tier: x.tier, kind: x.kind };
  return { tier: 1, kind: "internal" };
}

// ---- state --------------------------------------------------------------------------------------
function load() {
  const d = readState(FILE(), (x) => x && typeof x === "object") || {};
  return { first: d.first || 0, at: d.at || 0, evAt: d.evAt || 0, sig: d.sig || "", nudged: d.nudged || 0, passes: Array.isArray(d.passes) ? d.passes : [], weights: obj(d.weights), noise: obj(d.noise), tiers: obj(d.tiers), seen: obj(d.seen), digest: Array.isArray(d.digest) ? d.digest : [], digestAt: d.digestAt || 0, proposals: Array.isArray(d.proposals) ? d.proposals : [] };
}
function obj(x) { return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
function save(st) { try { writeJsonAtomic(FILE(), { ...st, passes: st.passes.slice(-KEEP), digest: st.digest.slice(-100), proposals: st.proposals.slice(-50) }, { indent: 1, mode: 0o600 }); } catch {} }
// The mode now: "off", "watch" or "act". Unset (or true), it watches its first day, then acts.
function modeOf(cfg = {}, st = load(), now = Date.now()) {
  const v = cfg ? cfg.intuition : undefined;
  if (v === false || v === "off") return "off";
  if (v === "watch" || v === "act") return v;
  return st.first && now - st.first >= WATCH_FIRST ? "act" : "watch";
}
const FOCUS_START = "# What I'm focused on\n\nSymbiot reads this before it does anything on its own. Write in plain words; it never edits this file without asking you.\n\n## Goals\n\n## Projects\n\n## People who matter\n\n## Ignore\n";
function readFocus() { try { return readFileSync(FOCUS(), "utf8"); } catch { return ""; } }
function writeFocus(text) { try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(FOCUS(), String(text || "").slice(0, 20000)); return { ok: true }; } catch (e) { return { error: String((e && e.message) || e) }; } }

// ---- the digest of the situation -----------------------------------------------------------------
// deps: { jobs, waits, rules, chat } (each a value or a function giving one).
const val = (x, d) => { try { return typeof x === "function" ? x() : x === undefined ? d : x; } catch { return d; } };
function digest(deps = {}, now = Date.now()) {
  const jobs = val(deps.jobs, []) || [], waits = val(deps.waits, []) || [], rules = val(deps.rules, []) || [], chat = val(deps.chat, []) || [];
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
  L.push("Email waits:", ...(waits.length ? waits.slice(0, 10).map((w) => `- to ${w.to}: "${clip(w.subject, 80)}" ${w.status === "waiting" ? `waiting since ${ago(sentAt(w) || now, now)}` : w.status}${w.reply ? `; reply: ${clip(typeof w.reply === "string" ? w.reply : w.reply.subject || "", 80)}` : ""}`) : ["- none"]));
  L.push("The user's standing rules:", ...(rules.length ? rules.slice(0, 15).map((r) => `- ${clip(r, 200)}`) : ["- none"]));
  L.push("What they asked in chat lately (newest last):", ...(chat.length ? chat.slice(-8).map((c) => `- ${ago(c.ts || now, now)}: ${clip(c.text, 160)}`) : ["- nothing lately"]));
  const body = L.join("\n"), d = new Date(now);
  return { text: `It's ${d.toLocaleString("en-ZA", { weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false })}.\n${body}`, sig: createHash("sha1").update(body.replace(/\d+ (?:min|h|days) ago/g, "")).digest("hex").slice(0, 16), stale };
}

// ---- events: each seen once ------------------------------------------------------------------------
// A source lists its events now: [{ id, text, lane? }]. Later overrides can push more sources.
const SOURCES = [
  { name: "run", list: (deps, now) => (val(deps.jobs, []) || []).filter((j) => String(j.key).startsWith("run:") && j.state !== "running" && now - (j.changed || 0) < DAY).map((j) => ({ id: `${j.key}@${j.changed}`, text: `A run ended: ${clip(j.text, 100)}${j.lane ? ` (${j.lane})` : ""}: ${j.state}${j.waitingOn ? `, waiting on ${j.waitingOn}` : ""}${j.summary ? `. It said: ${clip(j.summary, 200)}` : ""}`, lane: j.lane || "" })) },
  { name: "merge", list: (deps) => (val(deps.jobs, []) || []).filter((j) => j.state === "merged").map((j) => ({ id: `${j.key}@merged`, text: `Merged, not live yet: ${clip(j.text, 120)}${j.lane ? ` (${j.lane})` : ""}`, lane: j.lane || "" })) },
  { name: "reply", list: (deps) => (val(deps.waits, []) || []).filter((w) => w.status === "replied" || w.reply).map((w) => ({ id: `wait:${w.id}@reply`, text: `A reply came in from ${w.to} on "${clip(w.subject, 100)}"${w.reply && w.reply.subject ? `: ${clip(w.reply.subject, 100)}` : ""}`, lane: w.lane || "" })) },
  { name: "watch", list: (deps) => (val(deps.news, []) || []).filter((n) => !/github/i.test(n.name || "")).map((n) => ({ id: `news:${n.id}`, text: `New on ${n.name}: ${clip(n.text, 200)}` })) },
  { name: "ci", list: (deps) => (val(deps.news, []) || []).filter((n) => /github/i.test(n.name || "") && /\b(fail|failed|failing|error|cancelled)\b/i.test(n.text || "")).map((n) => ({ id: `ci:${n.id}`, text: `CI: ${clip(n.text, 200)}` })) },
];
// New events since each source's cursor. The first time a source is read, what's there is the
// baseline: seen, not triaged (no flood of old news on the first day).
function newEvents(deps, st, now) {
  const out = [];
  for (const s of SOURCES) {
    let list = []; try { list = s.list(deps, now) || []; } catch {}
    const had = st.seen[s.name], seen = new Set(had || []);
    if (!had) { st.seen[s.name] = list.map((e) => e.id).slice(-400); continue; }
    for (const e of list) if (!seen.has(e.id)) { out.push({ ...e, source: s.name }); seen.add(e.id); }
    st.seen[s.name] = [...seen].slice(-400);
  }
  return out.slice(0, EVENTS_MAX);
}

const RULES_TEXT = `Moves, as a JSON list (best first, at most 5):
[{"kind":"act|prepare|notice|focus","what":"…","why":"…","lane":"…","confidence":0.0,"interrupt":"now|digest|never","event":"…"}]
- act: work an agent can start: the next step on stalled work, a check, research, a draft, a deploy CHECK after a merge. If it would send, post, pay, delete, merge or deploy, still say it plainly: Symbiot asks the user first.
- prepare: something they'll need next, written up as a report (a follow-up's draft, a status summary, a plan). Never sent.
- notice: one line they should know (a risk, a deadline, the same failure again and again).
- focus: an addition to their focus file you'd suggest from a pattern you see ("what": the line to add). They decide.
- what: one plain sentence. why: one plain sentence, what calls for it. lane: the project if one fits, else "".
- confidence 0..1; leave out anything under 0.6, anything in hand or done, anything listed as turned down, and anything their focus says to ignore.
- interrupt: "now" only if it's urgent and matters to their focus; "digest" for what can wait for the twice-daily summary; "never" for what's only worth a log line.
- event: for a triaged event, its id; else "".
An empty list [] is a fine answer. Inside a sentence, quote with ’single’ marks, never a double quote.`;
const SYSTEM = `You are the user's chief of staff inside Symbiot, the app that runs their AI agents across their projects. From the situation and their focus, say what a sharp assistant would do next, unasked: what's stalled and could move, what's obviously next after something finished, what they'll need before they ask, and what they should know. Answer with JSON only.\n${RULES_TEXT}`;
const EVENT_SYSTEM = `You are the user's chief of staff inside Symbiot. New events just happened. For each, decide: is it relevant to their focus (goals, projects, people), what (if anything) would a sharp assistant do about it, and is it worth interrupting them now, putting in the digest, or neither. Ignore what's irrelevant. Answer with JSON only.\n${RULES_TEXT}`;

// ---- a pass ------------------------------------------------------------------------------------
// deps: { config, write, jobs, waits, rules, chat, news, map, actIn, actNow, autoStart, dismissed,
//         answersOf(dir), notify(title, body) }. events: true triages new events instead of the
// whole situation. Returns { skipped } or { pass, moves, rejected, mode }.
async function intuitionPass(deps = {}, { now = Date.now(), force = false, events = false } = {}) {
  const cfg = val(deps.config, {}) || {};
  const st = load(); if (!st.first) st.first = now;
  const mode = modeOf(cfg, st, now);
  if (mode === "off") { save(st); return { skipped: "off" }; }
  if (typeof deps.write !== "function") { save(st); return { skipped: "no AI" }; }
  learn(st, deps, now);
  const focus = readFocus(), d = digest(deps, now);
  let system = SYSTEM, ask = "";
  const evs = events ? newEvents(deps, st, now) : [];
  if (events) {
    if (!evs.length) { save(st); return { skipped: "no new events" }; }
    system = EVENT_SYSTEM; ask = `New events:\n${evs.map((e) => `- [${e.id}] ${e.text}`).join("\n")}\n\nThe situation, for context:\n${d.text}`;
  } else {
    if (!force && st.sig === d.sig) { save(st); return { skipped: "nothing changed" }; }
    ask = d.text;
  }
  const recent = st.passes.filter((p) => now - p.at < DAY).flatMap((p) => p.moves || []);
  const shunned = Object.entries(st.weights).filter(([, w]) => w <= SHUN).map(([k]) => k);
  const prompt = `Their focus (focus.md, theirs to edit):\n${focus.trim() || "(empty: they haven't written one)"}\n\n${ask}\n\nAlready done on its own in the last day (don't repeat):\n${recent.length ? recent.map((m) => `- ${m.kind}: ${m.what}`).join("\n") : "- nothing"}\n\nTurned down by the user before (kind|lane):\n${shunned.length ? shunned.map((k) => `- ${k}`).join("\n") : "- nothing"}`;
  const raw = await askMoves(deps.write, system, prompt);
  const { moves, rejected } = choose(Array.isArray(raw) ? raw : [], { st, recent, cfg, now, mode });
  const map = val(deps.map, {}) || {};
  for (const mv of moves) carry(mv, { deps, map, st, cfg, mode, now });
  if (events) { st.evAt = now; if (!st.nudged) st.nudged = now; } // something happened: the whole picture again soon
  else { st.sig = d.sig; st.at = now; st.nudged = 0; }
  const shown = moves.filter((x) => x.channel !== "never" && (x.started || x.asked || x.kind === "notice" || x.kind === "focus" || x.would));
  // on Updates: what's urgent; while watching, everything it would have done too (that's the point)
  const pass = shown.length || moves.length ? { id: randomBytes(4).toString("hex"), at: now, mode, events: events ? evs.map((e) => e.id) : undefined, moves, title: titleOf(shown.filter((x) => x.channel === "now" || (mode === "watch" && x.channel === "digest"))) } : null;
  if (pass) st.passes.push(pass);
  for (const mv of shown) if (mv.channel === "digest") st.digest.push({ at: now, line: line(mv), pass: pass.id });
  const urgent = shown.filter((x) => x.channel === "now");
  if (urgent.length && deps.notify) { try { deps.notify("Symbiot", clip(urgent.map(line).join(" · "), 200)); } catch {} }
  await digestDue(st, deps, now);
  save(st);
  return { pass, moves, rejected, mode };
}

// The model's moves, as a list. An answer that isn't valid JSON (a quote left unescaped in a sentence)
// gets one more try, told so, rather than quietly meaning "nothing to do".
async function askMoves(write, system, prompt) {
  const read = (r) => { const t = r && typeof r.text === "string" ? r.text : "", m = t.match(/\[[\s\S]*\]/); if (!m) return t.trim() ? null : []; try { const v = JSON.parse(m[0]); return Array.isArray(v) ? v : null; } catch { return null; } };
  let r = null; try { r = await write(system, prompt, { floor: "sonnet", kind: "intuition" }); } catch {}
  let v = read(r); if (v) return v;
  try { r = await write(system, `${prompt}\n\nYour last answer wasn't valid JSON. Answer again: the JSON list only, valid, with no double quotes inside sentences.`, { floor: "sonnet", kind: "intuition" }); } catch {}
  v = read(r); return v || [];
}
// The moves it may make: known kind, sure enough, not repeated, not turned down, within the day's
// budget of starts. Each gets its tier and its channel. rejected: [{ move, why }].
function choose(raw, { st, recent, cfg = {}, now, mode = "act" }) {
  const budget = Number(cfg.intuitionBudget) > 0 ? Number(cfg.intuitionBudget) : BUDGET;
  let started = st.passes.filter((p) => now - p.at < DAY).flatMap((p) => p.moves || []).filter((x) => x.started || x.asked).length;
  const moves = [], rejected = [];
  for (const x of raw.slice(0, MAX_MOVES * 2)) {
    const mv = { kind: String(x && x.kind || ""), what: clip(x && x.what, 300), why: clip(x && x.why, 300), lane: clip(x && x.lane, 60), confidence: Number(x && x.confidence) || 0, interrupt: CHANNELS.includes(x && x.interrupt) ? x.interrupt : "digest", ...(x && x.event ? { event: clip(x.event, 120) } : {}) };
    const no = (why) => rejected.push({ move: mv, why });
    if (!KINDS.includes(mv.kind) || !mv.what) { no("not a move"); continue; }
    if (mv.confidence < MIN_CONF) { no("not sure enough"); continue; }
    if (moves.length >= MAX_MOVES) { no("five is enough for one pass"); continue; }
    if ((st.weights[`${mv.kind}|${mv.lane}`] || 0) <= SHUN) { no("turned down before"); continue; }
    if (recent.some((r) => r.kind === mv.kind && (r.lane || "") === mv.lane && sameTask(r.what, mv.what)) || moves.some((r) => r.kind === mv.kind && sameTask(r.what, mv.what))) { no("already done"); continue; }
    const t = mv.kind === "notice" || mv.kind === "focus" ? { tier: 0, kind: mv.kind } : mv.kind === "prepare" ? { tier: 0, kind: "draft" } : tierOf(mv.what);
    mv.tier = t.tier; mv.action = t.kind;
    const promoted = t.tier === 2 && (st.tiers[t.kind] || {}).promoted;
    mv.does = mv.kind === "notice" || mv.kind === "focus" ? mv.kind : t.tier <= 1 || promoted ? "start" : "ask";
    if (mv.does !== "notice" && mv.does !== "focus" && mode === "act" && started >= budget) { no("the day's budget is spent"); continue; }
    if (mv.does === "start" || mv.does === "ask") started++;
    mv.channel = channelOf(mv, st);
    moves.push(mv);
  }
  return { moves, rejected };
}
// A kind the user keeps ignoring drops a channel: now → digest → never.
function channelOf(mv, st) {
  const n = st.noise[`${mv.kind}|${mv.lane || ""}`] || 0, order = CHANNELS;
  let i = Math.max(0, order.indexOf(mv.interrupt)); if (n <= -1) i++; if (n <= -2) i++;
  if (mv.tier >= 2 && mv.does === "ask" && i === 2) i = 1; // an approval it needs is never only a log line
  return order[Math.min(i, 2)];
}

// Doing a move: start it (tier 0/1, or a promoted tier 2), have an agent prepare it and ask the user
// first (tier 2/3), note it, or propose a focus line. In watch mode: only what it would have done.
function carry(mv, { deps, map, st, mode }) {
  if (mv.kind === "focus") { if (mode === "watch") { mv.would = true; return; } const id = randomBytes(4).toString("hex"); st.proposals.push({ id, line: mv.what, why: mv.why, at: Date.now() }); mv.proposal = id; return; }
  if (mv.does === "notice") return;
  if (mode === "watch") { mv.would = true; return; }
  const lanePath = mv.lane && map[mv.lane];
  if (lanePath && deps.autoStart && !deps.autoStart(lanePath)) { mv.error = "the lane's hourly cap"; return; }
  const own = "\n\nSymbiot started this on its own (no one asked).";
  const req = mv.does === "ask"
    ? `Prepare this fully, then ask the user for their OK in .symbiot/QUESTIONS.md before doing the outward part (a ### heading saying plainly what would go out and to whom, then the options "🤖 Agent: go ahead: ${clip(mv.what, 120)}" and "Skip"). Don't do the outward part until the answer says go: ${mv.what}\n\nWhy now: ${mv.why}${own}`
    : mv.kind === "prepare"
      ? `Draft this as a report for the user to read, under Reports (a .md in .symbiot/ starting with a # title), and don't send or share it anywhere: ${mv.what}\n\nWhy now: ${mv.why}${own}`
      : `${mv.what}\n\nWhy now: ${mv.why}${own} Keep to internal, reversible work${mv.tier === 2 ? " except the one outward step named above, which the user has approved this kind of before; every usual check still applies" : ": never send, post, pay, delete, merge or deploy; if any of that is needed, ask the user in .symbiot/QUESTIONS.md as usual"}.`;
  let r = null;
  try { r = lanePath && deps.actIn ? deps.actIn(req, mv.lane, { map, title: "Symbiot, on its own" }) : deps.actNow ? deps.actNow(req, { title: "Symbiot, on its own", lane: mv.lane || "" }) : null; } catch (e) { r = { error: String((e && e.message) || e) }; }
  if (r && !r.error) { if (mv.does === "ask") mv.asked = true; else mv.started = true; if (r.job) mv.job = r.job; if (r.dir) mv.dir = r.dir; if (r.task) mv.task = r.task; } else mv.error = (r && r.error) || "it didn't start";
}

// What the user sees, one line per move.
function line(mv) {
  const would = mv.would ? "I would have " : "";
  if (mv.kind === "notice") return `Worth knowing: ${mv.what}`;
  if (mv.kind === "focus") return mv.would ? `I would have suggested adding to your focus: ${mv.what}` : `Add to your focus? ${mv.what}`;
  if (mv.does === "ask") return mv.would ? `I would have prepared this and asked you first: ${mv.what}` : `Preparing, and asking you before anything goes out: ${mv.what}`;
  if (mv.kind === "prepare") return mv.would ? `I would have drafted for you: ${mv.what}` : `Drafting for you (under Reports, not sent): ${mv.what}`;
  return would ? `I would have done this on my own: ${mv.what}` : `On my own: ${mv.what}`;
}
const titleOf = (moves) => clip(moves.map(line).join(" · "), 240);

// ---- learning ----------------------------------------------------------------------------------------
// - A pass put away on Updates: rejected, its kinds of move in their lanes count down (fewer of them).
// - Left a day untouched: ignored, its kinds drop in notification priority (noise).
// - An approval it asked for (the ask run's ANSWERS.md): "go ahead" approves that kind of action
//   (promoted after PROMOTE_AFTER, never for tier 3), answered in their own words counts as approved
//   with an edit, "skip"/"no" rejects it and demotes the kind.
function learn(st, deps = {}, now = Date.now()) {
  let gone = new Set(); try { gone = new Set(deps.dismissed ? deps.dismissed() : []); } catch {}
  const cfg = val(deps.config, {}) || {}, n = Number(cfg.intuitionPromoteAfter) > 0 ? Number(cfg.intuitionPromoteAfter) : PROMOTE_AFTER;
  for (const p of st.passes) {
    for (const mv of p.moves || []) {
      if (mv.asked && mv.dir && !mv.answered && deps.answersOf) {
        let a = ""; try { a = String(deps.answersOf(mv.dir) || ""); } catch {}
        const yes = /🤖 Agent: go ahead|^\s*(?:yes|go ahead|ok|okay|do it)\b/im.test(a), noo = /^\s*(?:skip|no|don'?t|do not|stop)\b/im.test(a);
        if (yes || noo || a.trim()) {
          mv.answered = yes ? "approved" : noo ? "rejected" : "edited";
          const t = st.tiers[mv.action] || { approvals: 0, promoted: false };
          if (mv.answered === "rejected") { t.approvals = 0; t.promoted = false; t.rejectedAt = now; st.weights[`${mv.kind}|${mv.lane || ""}`] = (st.weights[`${mv.kind}|${mv.lane || ""}`] || 0) - 1; }
          else { t.approvals = (t.approvals || 0) + 1; if (mv.tier === 2 && t.approvals >= n) t.promoted = true; }
          t.at = now; st.tiers[mv.action] = t;
        }
      }
    }
    if (p.learned) continue;
    const away = gone.has(`intu:${p.id}`), idle = !away && now - p.at > DAY;
    if (!away && !idle) continue;
    for (const mv of p.moves || []) {
      const k = `${mv.kind}|${mv.lane || ""}`;
      if (away) st.weights[k] = Math.max(-5, (st.weights[k] || 0) - 1);
      else st.noise[k] = Math.max(-3, (st.noise[k] || 0) - 0.5);
    }
    p.learned = away ? "dismissed" : "ignored";
  }
}

// ---- the digest, twice a day -----------------------------------------------------------------------
// At 08:00 and 17:00 (the first pass after), what waited for it: a report under Reports and one Update.
async function digestDue(st, deps, now) {
  const items = st.digest.filter((x) => x.at > st.digestAt); if (!items.length) return null;
  const d = new Date(now), due = DIGEST_HOURS.map((h) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime()).filter((t) => t <= now).pop();
  if (!due || st.digestAt >= due) return null;
  const name = `SYMBIOT-DIGEST-${d.toISOString().slice(0, 10)}-${String(d.getHours()).padStart(2, "0")}.md`, dir = deps.digestDir || DIGEST_DIR(), file = join(dir, name);
  const body = `# Symbiot on its own: ${d.toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}\n\nWhat it did, would have done or noticed since the last digest, for when you have a minute.\n\n${items.map((x) => `- ${new Date(x.at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false })}: ${x.line}`).join("\n")}\n`;
  try { mkdirSync(dir, { recursive: true }); writeFileSync(file, body); } catch { return null; }
  st.digestAt = now;
  const id = randomBytes(4).toString("hex");
  st.passes.push({ id, at: now, digest: true, report: { id: createHash("sha1").update(file).digest("hex").slice(0, 12), title: body.split("\n")[0].slice(2) }, moves: [], title: `Digest: ${items.length} thing${items.length > 1 ? "s" : ""} Symbiot did or noticed on its own` });
  return { file, items: items.length };
}

// ---- where it shows -------------------------------------------------------------------------------
// Home's Updates: urgent passes and digests from the last two days, focus proposals waiting for an OK.
function intuitionUpdates({ now = Date.now(), dismissed = new Set() } = {}) {
  const st = load(), out = [];
  for (const p of st.passes.filter((x) => now - x.at < 2 * DAY && x.title && !dismissed.has(`intu:${x.id}`)).slice(-4).reverse())
    out.push({ id: `intu:${p.id}`, key: `intu:${p.id}`, title: p.title, lane: p.mode === "watch" ? "Watching" : "On its own", intuition: true, ...(p.report ? { report: p.report } : {}) });
  for (const f of st.proposals.filter((x) => !x.done && !dismissed.has(`intu:focus:${x.id}`)).slice(-3))
    out.push({ id: `intu:focus:${f.id}`, key: `intu:focus:${f.id}`, title: `Add to your focus? ${f.line}`, lane: "On its own", intuition: true, accept: { id: f.id, label: "Add it" } });
  return out;
}
// The user's OK on a focus proposal: the line goes into focus.md, under its last heading's end.
function acceptFocus(id) {
  const st = load(), f = st.proposals.find((x) => x.id === String(id || "")); if (!f) return { error: "That suggestion isn't there any more." };
  const had = readFocus() || FOCUS_START, w = writeFocus(had.replace(/\s*$/, "\n") + `- ${f.line}\n`); if (w.error) return w;
  f.done = Date.now(); save(st); return { ok: true, said: "Added to your focus." };
}
// Settings: the mode, focus.md, and what's been promoted (with a revoke).
function intuitionState({ cfg = {}, now = Date.now() } = {}) {
  const st = load();
  return { mode: modeOf(cfg, st, now), chosen: ["off", "watch", "act"].includes(cfg.intuition) || cfg.intuition === false, watchUntil: st.first ? st.first + WATCH_FIRST : 0, focus: readFocus() || FOCUS_START,
    promoted: Object.entries(st.tiers).map(([kind, t]) => ({ kind, approvals: t.approvals || 0, promoted: !!t.promoted })).filter((t) => t.approvals || t.promoted), after: PROMOTE_AFTER };
}
function revoke(kind) { const st = load(), t = st.tiers[String(kind || "")]; if (!t) return { error: "Nothing to revoke there." }; t.promoted = false; t.approvals = 0; t.revokedAt = Date.now(); save(st); return { ok: true }; }
// Home chat ("what are you doing on your own?"): the last day's moves.
function intuitionLines({ now = Date.now(), cfg } = {}) {
  const st = load(), moves = st.passes.filter((p) => now - p.at < DAY).flatMap((p) => (p.moves || []).map((m) => ({ ...m, at: p.at })));
  return [`What Symbiot did on its own in the last day (its intuition, mode: ${modeOf(cfg || {}, st, now)}; answer "what are you doing on your own?" from this):`, ...(moves.length ? moves.map((m) => `- ${ago(m.at, now)}: ${line(m)}${m.error ? ` (didn't start: ${m.error})` : ""}`) : ["- nothing"])];
}
// A run ended, a reply came in: look again soon, not at the next half hour.
function nudge() { const st = load(); if (!st.nudged) { st.nudged = Date.now(); save(st); } }
// The timer (server.mjs, every 2 minutes): new events each time, the whole situation every 30
// minutes or 5 minutes after a nudge.
async function intuitionTick(deps = {}, { now = Date.now() } = {}) {
  const ev = await intuitionPass(deps, { now, events: true });
  const st = load(), gap = st.nudged ? NUDGE_GAP : EVERY, since = st.nudged ? now - Math.max(st.at, st.nudged) : now - st.at;
  if (st.at && since < gap) return { events: ev, skipped: "not yet" };
  return { events: ev, pass: await intuitionPass(deps, { now }) };
}

export { askMoves, SYSTEM as INTUITION_SYSTEM, EVENT_SYSTEM, digest, newEvents, intuitionPass, intuitionTick, choose, carry, learn, tierOf, modeOf, channelOf, digestDue, intuitionUpdates, intuitionState, intuitionLines, acceptFocus, revoke, readFocus, writeFocus, nudge, line, SOURCES, TIERS, FILE as INTUITION_FILE, FOCUS as FOCUS_FILE, EVERY, NUDGE_GAP, BUDGET, PROMOTE_AFTER, WATCH_FIRST, FOCUS_START };
