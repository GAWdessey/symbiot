// symbiot — triage: every question a run writes for the user is judged before it can become
// a card. A run's brief lists what only the user does, and runs broke it all day on 21 Oct
// 2026: "You: restart the Symbiot app", "allow this folder", "sign in to LinkedIn in the
// Symbiot Browser", "switch on a setting" Settings doesn't have, "how should the reply get
// out?". The brief is words; nothing checked what came back, so whatever an agent wrote was
// the user's card. Here each question gets one verdict, kept in the folder's .symbiot/triage.json:
//
// - user:     only the user can settle it (a decision of theirs, money, sending or posting in
//             their name, a sign-in, a code, their phone or body). It becomes a card.
// - answered: the user's answers, or a standing rule, already settle it. It's answered with
//             what they said, and the run carries on.
// - agent:    an agent can do it (this run, or ops, which isn't sandboxed). The run is told so,
//             and to do it or hand it over.
// - symbiot:  it's there because Symbiot itself is broken or can't yet (its browser didn't start,
//             a setting it names doesn't exist, a permission only Symbiot's code can give). It's
//             recorded as a Symbiot fault (faults.json) for fixing, never the user's chore, and
//             the run is told to mark the item [~] and carry on.
// - redo:     it is the user's, but it can't be decided as written: it asks them to pay without
//             saying why (a card offered $16.40 for "replacement" domains while moving the ones
//             they had was the plan, 23 Oct 2026), has them add a card or claim a credit as if it
//             cost nothing (a site reserved some R425 on the card that same day), or to make an account
//             Symbiot already knows of. The run is told what's missing and asks again; the user wasn't asked yet.
//
// agents.mjs agentQuestions asks verdictOf for each open question: only "user" ones (or ones the
// AI can't judge) are shown; a fresh one waits up to HOLD_MS for its verdict rather than flash up
// as a card. triageSweep (agents.mjs) judges the new ones, one call each.
import { join } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";
import { promptFor } from "./overrides.mjs";
import { addsPayment, warnsHold } from "./sends.mjs";

const FILE = "triage.json", FAULTS = join(CONFIG_DIR, "faults.json");
const VERDICTS = ["user", "answered", "agent", "symbiot", "redo"];
const HOLD_MS = 3 * 60000; // a question waits this long for its verdict; then it shows, judged or not
const key = (q) => String(q || "").trim().toLowerCase().replace(/\s+/g, " ");

function loadVerdicts(path) { try { const o = JSON.parse(readFileSync(join(path, ".symbiot", FILE), "utf8")); return o && typeof o === "object" ? o : {}; } catch { return {}; } }
function saveVerdict(path, q, v, now = Date.now()) {
  const all = loadVerdicts(path); all[key(q)] = { ...v, q: String(q).slice(0, 300), at: now };
  if (v && v.verdict === "user") noteTriage("shown", { path, q, now }); // a card the user will see: what the misses are counted against
  try { writeJsonAtomic(join(path, ".symbiot", FILE), all, { indent: 1 }); } catch {}
  return all[key(q)];
}
const verdictOf = (path, q) => loadVerdicts(path)[key(q)] || null;
// Shown on Home and the Workdesk: judged the user's; or not judged, once it has waited HOLD_MS
// (or with no AI to judge it). `asked`: when the questions file was written.
function shows(path, q, { now = Date.now(), asked = askedAt(path), judging = true } = {}) {
  const v = verdictOf(path, q);
  if (v) return v.verdict === "user";
  return !judging || now - asked > HOLD_MS;
}
function askedAt(path) { try { return statSync(join(path, ".symbiot", "QUESTIONS.md")).mtimeMs; } catch { return 0; } }

// What a run is told for a verdict that isn't the user's: ANSWERS.md, under its question.
function answerFor(v) {
  const why = String(v.why || "").trim().replace(/\.$/, "");
  if (v.verdict === "answered") return `${String(v.answer || "").trim() || why}\n(Symbiot answered this from the user's earlier answers and rules; they weren't asked again.)`;
  if (v.verdict === "agent") return `This isn't the user's to do${why ? `: ${why}` : ""}. Do it yourself, or hand it to ops in .symbiot/HANDOFF.md (ops isn't sandboxed: it has Symbiot's browser, the network and the servers), and carry on. Don't ask the user for it.\n(Symbiot's triage; the user wasn't asked.)`;
  if (v.verdict === "redo") return `Not shown to the user yet: ${why || "as written it can't be decided"}. Fix that and ask again in .symbiot/QUESTIONS.md, under a new heading.\n(Symbiot's triage; the user wasn't asked yet.)`;
  if (v.verdict === "symbiot") return `This is Symbiot's fault, not the user's${why ? `: ${why}` : ""}. It's recorded for fixing in Symbiot. Hand the step to ops in .symbiot/HANDOFF.md if ops can do it; if not, mark the item [~] waiting on that Symbiot fix and carry on with the rest. Don't ask the user for it.\n(Symbiot's triage; the user wasn't asked.)`;
  return "";
}

// A Symbiot fault, kept for whoever fixes Symbiot: what the run asked and why it's Symbiot's.
function recordFault({ path, q, why, lane = "" }, now = Date.now()) {
  const d = readState(FAULTS, (x) => x && Array.isArray(x.faults)) || { faults: [] };
  if (d.faults.some((f) => key(f.q) === key(q) && f.path === path)) return false;
  d.faults.push({ at: now, path, lane, q: String(q).slice(0, 400), why: String(why || "").slice(0, 400) });
  try { writeJsonAtomic(FAULTS, { faults: d.faults.slice(-200) }, { indent: 1, mode: 0o600 }); } catch {}
  return true;
}
const faults = () => (readState(FAULTS, (x) => x && Array.isArray(x.faults)) || { faults: [] }).faults;

const SYSTEM = `You decide who a question from an AI agent is for, before it reaches the user. The agents work for one person (the user) on their computer. Symbiot is the app that runs them. The user is fed up with being asked things that weren't theirs. Answer with JSON only: {"verdict":"user"|"answered"|"agent"|"symbiot"|"redo","why":"one plain sentence","answer":"only for answered: the answer, in the user's own terms"}.

user: only the user can settle it. A real choice between their own options (business, wording, which plan), approving something that sends, posts, pays, deletes, merges or deploys in their name, a sign-in, a code or a secret they hold, something physical (their phone, a cable, pressing a button in an app on their phone), or turning on a permission Symbiot really has for them: Settings → Connections (link a site, or let agents act on a site in their own Chrome), or an Allow on a permission card.
answered: the user's earlier answers, standing rules or what Symbiot remembers below already settle it (their email, phone number, company, which account, a choice they made before), or a newer answer has made it pointless (the plan moved to another account, that work was cancelled or is done): give the answer, saying what changed. An answer is never a step for the user to do by hand (open a page, press a button): when they said yes to the agent doing it, the answer is that yes.
agent: an agent could do it instead: asking the user whether something has happened or what state it is in (is it moved, did it arrive, is it live: the agent checks), reading, checking, finding out, retrying, choosing how to route or send something already approved, drafting, running commands, using Symbiot's browser or the servers (the ops agent isn't sandboxed and has the network, Symbiot's signed-in browser and ssh), or handing a step to another agent. Asking the user "how should it go out" or "which way should I do this" when either way is fine is agent.
redo: it is the user's, but it can't be decided as written: it asks them to spend money without saying why it's needed and why not a cheaper route already on the table (moving or transferring what they have, an account that exists), or to add a card, billing details, claim a credit or accept paid terms without saying up front that the site may hold or charge money on the card (and roughly how much, if known), or to create an account that what Symbiot remembers says exists already; or a step it hands the user that doesn't say what to do, where (the exact address and button, or the Symbiot page), why only they can, and what the agent does right after. Say in "why" what it must add or check.
symbiot: it's only there because Symbiot itself is broken or lacks something: its browser or socket won't start, a setting the question names that isn't one of those above, a permission only Symbiot's code could give (write to a folder, run a command), restarting Symbiot, unparking lanes, re-running an item. Those are Symbiot's to fix, never the user's chore.

Always user: anything about the user's business or money (which company, plan, price, verification, whether to drop or delay work, what to tell a customer), anything sent, posted, paid, deleted, merged or deployed in their name that their answers haven't already approved word for word, and a sign-in the agent says it already tried every other way to avoid. Never the user's: housekeeping the agent made itself (its own scratch files, screenshots, folders), and anything Symbiot or an agent could check or do.
answered needs an answer below that settles this very question, not a similar one; when in doubt between answered and user, say user.
Hiding a real decision from the user is worse than asking them one question too many: when it's truly theirs, say user.`;

// Before the AI: a spend with no reason, and an account to make that Symbiot knows exists (redo).
// A spend: buying, paying for or registering something, with an amount on it (a plan's price
// in a choice between plans is no spend of theirs).
const AMOUNT = /(?:[$€£]\s?\d|\b(?:R\s?\d{2,}|(?:USD|ZAR|EUR|GBP)\s?\d)|\b\d(?:[\d,.]*\d)?\s?(?:USD|ZAR|EUR|GBP|dollars?|rand|euros?|pounds?)\b)/i;
const SPEND = /\b(?:buy|buying|bought|purchase|purchasing|pay|paying|spend|spending|charge|register(?:ing)? (?:a |the |two |new )?(?:new )?domains?|upgrade to|subscribe)\b/i;
const spends = (t) => AMOUNT.test(t) && SPEND.test(t);
const BECAUSE = /\b(?:because|since|so that|so (?:we|it|you|the|they)|why|instead of|rather than|the reason|needed (?:for|to|because)|otherwise|as (?:the|your) (?:old|current)|in place of|to (?:claim|get|keep|unlock|activate|verify)|can'?t (?:be )?(?:moved|transferred)|no (?:way|longer)|isn'?t (?:possible|available)|unavailable|expired|lost)\b/i;
const NEW_ACCOUNT = /\b(?:create|make|open|set up|sign up for|register)\s+(?:a |an |your |the )?(?:new )?([A-Z][\w.-]+(?:\s[A-Z][\w.-]+)?)\s+account\b|\bsign up (?:at|for|with)\s+([A-Z][\w.-]+)/;
// A key the user says they made, whose value never reached the vault: the card doubted them ("Your answer
// says you created one, but I can't find it") or had them save it to the vault themselves, and another
// agent asked again (a Cloudflare token, 26 Oct 2026). A value pasted in chat or on a card is saved by itself.
const SAVE_YOURSELF = /\b(?:save|add|store|put|enter|keep|copy)\b[^.?!\n]{0,60}\b(?:in|into|to)\s+(?:the\s+|symbiot['’]?s\s+)?vault\b/i;
const YOU_MADE = /\b(?:you (?:said|say|wrote|told me)?\s*(?:you(?:'|’)?ve |you )?(?:created|made|generated|rolled)|your (?:answer|reply|message) says you)\b/i;
const NOT_FOUND = /\b(?:can(?:'|’)?t|cannot|couldn(?:'|’)?t|didn(?:'|’)?t|don(?:'|’)?t) (?:find|see|locate)\b|\b(?:has|holds|have) no\b[^.?!\n]{0,40}\b(?:token|key)\b|\bno sign of\b/i;
const doubtsMade = (t) => (YOU_MADE.test(t) && NOT_FOUND.test(t)) || /\b(?:did|have) you (?:actually |really )?(?:create|make|generate|roll)d?\b[^.?!\n]{0,30}\b(?:token|key)\b/i.test(t);
const byAgent = (t) => /^\s*🤖|^\s*(?:can|may|shall|should) i\b/i.test(String(t || ""));
const MADE_KEY_LINE = "\"The token exists, but its value isn't in the vault: roll it in <the site> and paste the value in chat.\"";
const READ_REPORT = /\b(?:read|go through|look over|look through|review|check)\s+(?:the|my|this|that|our)\s+(?:[\w'"“”‘’:-]+\s+){0,8}?(?:report|write-?up|findings)\b/i;
// A hold Symbiot remembers on a site the card names ("LinkedIn reserved R425.45 on the card when it
// was added"): the line, so the agent can give the amount. "" when none is.
function heldBefore(all, known) {
  const words = new Set(String(all).toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []);
  return String(known || "").split("\n").find((l) => /\b(?:hold|held|reserv\w*|charged|pre-?auth\w*)\b/i.test(l) && /\d/.test(l) && (l.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []).some((w) => words.has(w) && !/^(?:card|hold|held|charged|reserved|account|billing|payment|when|added|with|from|that|this|their|your)$/.test(w))) || "";
}
function precheck(q, known = "") {
  const all = [q.q, q.context, ...(q.options || [])].filter(Boolean).join("\n");
  // adding a card, billing details or claiming a credit presented as free: it isn't (sends.mjs addsPayment)
  if (addsPayment(all) && !warnsHold(all)) {
    const was = heldBefore(all, known).trim().replace(/^[-*]\s*/, "").slice(0, 200);
    return { verdict: "redo", why: `it has the user add a payment method, billing details or claim a credit as if it cost nothing, and sites often place a hold or a charge on the card the moment it's added. Say so plainly at the top of the context, with roughly how much if it's known${was ? ` (Symbiot remembers: ${was})` : ""}, and make the recommended option their yes to that before they do it` };
  }
  if (spends(all) && !BECAUSE.test(all)) return { verdict: "redo", why: "it asks the user to spend money without saying why it's needed, or why not a cheaper route already on the table (moving what they have, an account that exists). Every spend on a card carries its reason" };
  // "read the report before I carry on": the card is the summary, not a pointer to one (a 7am report
  // planned under an account the user had since replaced, and they were sent to read it, 23 Oct 2026)
  if ([q.q, ...(q.options || [])].some((t) => READ_REPORT.test(String(t || "")))) return { verdict: "redo", why: "it sends the user to read a report instead of asking them something. First check the report against newer answers in ANSWERS.md and what Symbiot remembers (a newer decision, an account made since) and update it if it's out of date; then put a 2-3 line summary in the card's context and ask only the one question that's left, linking the report for detail" };
  if ([q.q, ...(q.options || [])].some((t) => !byAgent(t) && SAVE_YOURSELF.test(String(t || "")))) return { verdict: "redo", why: `it tells the user to save a key or password to the vault themselves, and a value they paste in chat or on this card is saved there by itself. Ask them to paste it here instead; for one they made whose value never reached the vault, say it in one line: ${MADE_KEY_LINE}` };
  if (/\b(?:token|key|password|secret)s?\b/i.test(all) && doubtsMade(all)) return { verdict: "redo", why: `it questions whether the user made the key. They did: its value just never reached the vault. Say it once, in one line, and nothing more: ${MADE_KEY_LINE} Don't ask for it on another card` };
  const m = all.match(NEW_ACCOUNT), svc = m && (m[1] || m[2]);
  if (svc && known) {
    const line = String(known).split("\n").find((l) => new RegExp(`\\b${svc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(l) && /\baccount\b/i.test(l));
    if (line) return { verdict: "redo", why: `Symbiot already knows of a ${svc} account (${line.trim().replace(/^[-*]\s*/, "").slice(0, 200)}): check it exists through its API or the user's linked session before asking them to make one` };
  }
  return null;
}
// One verdict for one question. write: ai.mjs write. ctx: { answers, rules, lane }.
async function judge(q, { answers = "", rules = [], lane = "", known = "" } = {}, { write }) {
  const pre = precheck(q, known); if (pre) return pre;
  const opts = (q.options || []).map((o) => `- ${o}`).join("\n");
  const prompt = `Agent's lane: ${lane || "unknown"}\n\nThe question:\n### ${q.q}\n${q.context ? q.context + "\n" : ""}${opts}\n\nThe user's standing rules:\n${rules.map((r) => `- ${r}`).join("\n") || "(none)"}${known ? `\n\nWhat Symbiot remembers that may bear on it:\n${known.slice(0, 3000)}` : ""}\n\nThe user's newest answers in this lane (newest last):\n${String(answers || "").slice(-5000) || "(none)"}`;
  const r = await write(SYSTEM + promptFor("triage") + missesForPrompt(), prompt, { fast: true, kind: "triage" });
  const text = r && typeof r.text === "string" ? r.text : "";
  const m = text.match(/\{[\s\S]*\}/); if (!m) return null;
  let o; try { o = JSON.parse(m[0]); } catch { return null; }
  if (!o || !VERDICTS.includes(o.verdict)) return null;
  if (o.verdict === "answered" && !String(o.answer || "").trim()) o.verdict = "user"; // an answer it can't give isn't one
  return { verdict: o.verdict, why: String(o.why || "").slice(0, 300), ...(o.verdict === "answered" ? { answer: String(o.answer).slice(0, 800) } : {}) };
}

// ---- how often it's wrong ------------------------------------------------------------------------
// Nothing measured it: faults.json held 2 entries while the user asked "who makes these cards? is it
// not you?" (22 Oct 2026). Each question judged the user's is counted, and so is each sign it wasn't:
// - needless: what the user typed on its card says it wasn't theirs ("you should know this", "it's in
//   the vault", "who makes these cards", "I already answered");
// - withdrawn: its agent took it back with no answer from the user anywhere (it found the answer itself).
// triage-log.json keeps the events; triageStats gives this week's and last week's rate (Settings), and the
// newest needless ones go back into the judge's prompt, as what not to put to the user.
const LOG = () => join(CONFIG_DIR, "triage-log.json"), LOG_KEEP = 3000, WEEK = 7 * 86400000;
const NEEDLESS = /\b(?:who (?:makes|made|writes|wrote|sends) (?:these|this|the) cards?|why (?:are|do|did) you (?:ask|asking|need me)|you (?:should|must|already|can|could) (?:know|have it|find it|look|check|do (?:it|this|that) yourself)|(?:it'?s|its|they'?re|that'?s) (?:already )?in (?:the|my|your) vault|check (?:the|my|your) vault|find (?:it|that|out) yourself|look it up yourself|i (?:already|have already|'?ve already) (?:answered|told you|said|gave (?:it|you))|stop asking|not my job|you have (?:the|my|its) (?:login|password|details|access|key)|how (?:must|should|would|do) i know|isn'?t (?:that|this) your job|you did (?:this|it) before)\b/i;
const needless = (said) => NEEDLESS.test(String(said || ""));
function readLog() { return readState(LOG(), Array.isArray) || []; }
function noteTriage(kind, { path = "", q = "", said = "", now = Date.now() } = {}) {
  const log = readLog(); log.push({ at: now, kind, path: String(path).slice(0, 300), q: String(q).slice(0, 300), ...(said ? { said: String(said).slice(0, 300) } : {}) });
  try { writeJsonAtomic(LOG(), log.slice(-LOG_KEEP), { indent: 0, mode: 0o600 }); } catch {}
}
// The user's words on a card: counted when they say it wasn't theirs to answer (once per card).
function noteCardWords(path, q, said, now = Date.now()) {
  if (!needless(said)) return false;
  if (readLog().some((e) => e.kind === "needless" && e.path === path && key(e.q) === key(q))) return false;
  noteTriage("needless", { path, q, said, now }); return true;
}
// Cards judged the user's that are gone from their agent's questions: answered (ANSWERS.md, or settled
// for every agent: answeredElsewhere) or taken back unanswered, which is a miss. Each once.
function sweepGone(path, open = [], { answers = "", answeredElsewhere = () => false, now = Date.now() } = {}) {
  const all = loadVerdicts(path), still = new Set(open.map(key)), ans = String(answers || "").toLowerCase(); let n = 0;
  for (const [k, v] of Object.entries(all)) {
    if (!v || v.verdict !== "user" || v.gone || still.has(k)) continue;
    const q = v.q || k, answered = ans.includes("### " + k) || ans.includes(k.slice(0, 80)) || answeredElsewhere(q);
    all[k] = { ...v, gone: answered ? "answered" : "withdrawn", goneAt: now };
    if (!answered) { noteTriage("withdrawn", { path, q, now }); n++; }
  }
  try { writeJsonAtomic(join(path, ".symbiot", FILE), all, { indent: 1 }); } catch {}
  return n;
}
// This week's and the week before's: { shown, needless, withdrawn, misses, rate } each, rate a share (0–1) or null.
function triageStats({ now = Date.now(), log = readLog() } = {}) {
  const week = (from, to) => { const e = log.filter((x) => x.at >= from && x.at < to), c = (k) => e.filter((x) => x.kind === k).length;
    const shown = c("shown"), nl = c("needless"), wd = c("withdrawn"), misses = nl + wd; return { shown, needless: nl, withdrawn: wd, misses, rate: shown ? Math.min(1, misses / shown) : null }; };
  return { week: week(now - WEEK, now + 1), before: week(now - 2 * WEEK, now - WEEK), recent: log.filter((x) => x.kind !== "shown").slice(-5).reverse() };
}
// The newest questions the user said weren't theirs: shown to the judge as what not to put to them.
function missesForPrompt(n = 5, log = readLog()) {
  const m = log.filter((x) => x.kind === "needless").slice(-n);
  return m.length ? `\n\nQuestions the user was asked lately and said weren't theirs to answer (judge ones like these "agent" or "answered", not "user"):\n${m.map((x) => `- "${x.q}" (they said: "${x.said}")`).join("\n")}` : "";
}

export { noteTriage, noteCardWords, needless, sweepGone, triageStats, missesForPrompt, LOG as TRIAGE_LOG, judge, precheck, verdictOf, saveVerdict, loadVerdicts, shows, answerFor, recordFault, faults, askedAt, HOLD_MS, VERDICTS, FAULTS };
