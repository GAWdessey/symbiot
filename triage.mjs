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
//
// agents.mjs agentQuestions asks verdictOf for each open question: only "user" ones (or ones the
// AI can't judge) are shown; a fresh one waits up to HOLD_MS for its verdict rather than flash up
// as a card. triageSweep (agents.mjs) judges the new ones, one call each.
import { join } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";

const FILE = "triage.json", FAULTS = join(CONFIG_DIR, "faults.json");
const VERDICTS = ["user", "answered", "agent", "symbiot"];
const HOLD_MS = 3 * 60000; // a question waits this long for its verdict; then it shows, judged or not
const key = (q) => String(q || "").trim().toLowerCase().replace(/\s+/g, " ");

function loadVerdicts(path) { try { const o = JSON.parse(readFileSync(join(path, ".symbiot", FILE), "utf8")); return o && typeof o === "object" ? o : {}; } catch { return {}; } }
function saveVerdict(path, q, v, now = Date.now()) {
  const all = loadVerdicts(path); all[key(q)] = { ...v, at: now };
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

const SYSTEM = `You decide who a question from an AI agent is for, before it reaches the user. The agents work for one person (the user) on their computer. Symbiot is the app that runs them. The user is fed up with being asked things that weren't theirs. Answer with JSON only: {"verdict":"user"|"answered"|"agent"|"symbiot","why":"one plain sentence","answer":"only for answered: the answer, in the user's own terms"}.

user: only the user can settle it. A real choice between their own options (business, wording, which plan), approving something that sends, posts, pays, deletes, merges or deploys in their name, a sign-in, a code or a secret they hold, something physical (their phone, a cable, pressing a button in an app on their phone), or turning on a permission Symbiot really has for them: Settings → Connections (link a site, or let agents act on a site in their own Chrome), or an Allow on a permission card.
answered: the user's earlier answers or standing rules below already settle it. Give the answer.
agent: an agent could do it instead: reading, checking, finding out, retrying, choosing how to route or send something already approved, drafting, running commands, using Symbiot's browser or the servers (the ops agent isn't sandboxed and has the network, Symbiot's signed-in browser and ssh), or handing a step to another agent. Asking the user "how should it go out" or "which way should I do this" when either way is fine is agent.
symbiot: it's only there because Symbiot itself is broken or lacks something: its browser or socket won't start, a setting the question names that isn't one of those above, a permission only Symbiot's code could give (write to a folder, run a command), restarting Symbiot, unparking lanes, re-running an item. Those are Symbiot's to fix, never the user's chore.

Always user: anything about the user's business or money (which company, plan, price, verification, whether to drop or delay work, what to tell a customer), anything sent, posted, paid, deleted, merged or deployed in their name that their answers haven't already approved word for word, and a sign-in the agent says it already tried every other way to avoid. Never the user's: housekeeping the agent made itself (its own scratch files, screenshots, folders), and anything Symbiot or an agent could check or do.
answered needs an answer below that settles this very question, not a similar one; when in doubt between answered and user, say user.
Hiding a real decision from the user is worse than asking them one question too many: when it's truly theirs, say user.`;

// One verdict for one question. write: ai.mjs write. ctx: { answers, rules, lane }.
async function judge(q, { answers = "", rules = [], lane = "" } = {}, { write }) {
  const opts = (q.options || []).map((o) => `- ${o}`).join("\n");
  const prompt = `Agent's lane: ${lane || "unknown"}\n\nThe question:\n### ${q.q}\n${q.context ? q.context + "\n" : ""}${opts}\n\nThe user's standing rules:\n${rules.map((r) => `- ${r}`).join("\n") || "(none)"}\n\nThe user's newest answers in this lane (newest last):\n${String(answers || "").slice(-5000) || "(none)"}`;
  const r = await write(SYSTEM, prompt, { fast: true, kind: "triage" });
  const text = r && typeof r.text === "string" ? r.text : "";
  const m = text.match(/\{[\s\S]*\}/); if (!m) return null;
  let o; try { o = JSON.parse(m[0]); } catch { return null; }
  if (!o || !VERDICTS.includes(o.verdict)) return null;
  if (o.verdict === "answered" && !String(o.answer || "").trim()) o.verdict = "user"; // an answer it can't give isn't one
  return { verdict: o.verdict, why: String(o.why || "").slice(0, 300), ...(o.verdict === "answered" ? { answer: String(o.answer).slice(0, 800) } : {}) };
}

export { judge, verdictOf, saveVerdict, loadVerdicts, shows, answerFor, recordFault, faults, askedAt, HOLD_MS, VERDICTS, FAULTS };
