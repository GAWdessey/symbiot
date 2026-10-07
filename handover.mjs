// symbiot — Handover: what every brief says about lanes, and about the steps
// only the user can do. Each agent works in its own lane (a repo, or ops for
// everything outside one), and hands what's another lane's job to that lane
// instead of stopping or asking the user (lanes.mjs runs it). What reaches the
// user is only what no agent can do, and the brief makes the agent say which.
// Text and parsing only, no imports: shared by every brief (tasks.mjs
// buildTasksMd, mind.mjs actBrief), by lanes.mjs and by handback.mjs.

const OPS = "ops";
const MAX_LANES_LISTED = 40;
// How long a handover can be: an email to draft, quoted whole, fits. 4000 cut
// the one to ops mid-email (a repo lane's task links to the rest: addTask).
const HANDOVER_MAX = 20000;

// The lines a brief gets about lanes. here: this agent's lane; lanes: the others
// it can hand to (repo folder names).
function handoverRules(lanes = [], here = "") {
  const others = [...new Set(lanes.filter((l) => l && l !== here))].slice(0, MAX_LANES_LISTED);
  return ["## Hand over what's another lane's job",
    `Each agent has its own lane${here ? `: this one is \`${here}\`` : ""}. When something you need is another lane's job, don't stop, and don't ask the user to do it: hand it over. Write \`.symbiot/HANDOFF.md\` with a \`### \` heading naming the lane, then what's needed, self-contained (names, paths, links, ids) and why. Symbiot starts that lane's agent on it, and its result comes back to you in \`.symbiot/ANSWERS.md\`. Carry on with what doesn't depend on it, and don't tick what does.`,
    `- \`${OPS}\`: anything outside a repo: this computer (find or install a tool, a JDK, an SDK), accounts and services (cloud, GitHub, DNS, email), the user's connectors.`,
    `- A repo, by its folder name, for work that belongs in that project${others.length ? `: ${others.map((l) => `\`${l}\``).join(", ")}` : ""}.`,
    ""];
}
// The rule for options in QUESTIONS.md: the user gets only what no agent can do,
// and the option says which kind it is.
const ONLY_YOU = "- Only what no agent can do is the user's: their body (a phone in their hand, a cable, which network they're on), their identity or secrets (signing in, a 2FA code, a token from a provider's console) or a decision that's theirs (closing an account, spending money, sending something in their name). Start such an option with `👤 You (only you: <which>):`, e.g. `👤 You (only you: your Meta token): paste it into .env`. Anything an agent could do, yours or another lane's, is never a 👤 step: do it, or hand it over. An option where picking it is enough starts with `🤖 Agent:`. Tag actions only: an option that just reports what the user saw or decides (`it notified me`, `not tried yet`) gets no tag. A permission your run doesn't have (a command, a folder) is never a chore for the user. Write the rules, as narrow as the task needs, to `.symbiot/allowlist.proposed.json` (`{\"permissions\": {\"allow\": [...], \"deny\": [...], \"additionalDirectories\": [...]}}`), ask for it in QUESTIONS.md with the option `👤 You (only you: a permission): allow the list in .symbiot/allowlist.proposed.json`, and stop. If it stays inside the user's work (the folders they gave Symbiot, not ~/.ssh or ~/.config), asks for nothing wide, and doesn't publish or reach another machine, Symbiot turns it on by itself and runs you again: no question reaches the user. Their knowledge folders are already yours to read. Never ask them to copy files or run claude in a terminal for it. Decide what can be undone yourself, as a trusted colleague would: the approach, names, which of two fixes, how to lay files out; pick, do it, and say what you chose and why in your last message. Ask only about what can't be undone, costs money, goes out in the user's name, or needs who they are, and then give 2–3 options with your pick first, marked (recommended). Their answer comes back into this same conversation, so you'll remember everything when it does. Symbiot's membrane (its guard) stops the few things only the user does (pushing to main, publishing, deleting outside your folder, sudo, their keys); if it stops you, ask, don't work around it. Whatever waits on the user's OK (sending, posting, deleting, paying, closing) or on a step only they can take goes in QUESTIONS.md as a question, with what they should check first in its context line, never only in your last message: they aren't asked about what your last message says.";

// What a run hands back to Symbiot itself (handback.mjs reads it): facts for
// memory, and emails that wait on a reply, which Symbiot then watches for; and
// reports for the user to read (reports.mjs lists them).
const KINDS = ["person", "account", "site", "repo", "project", "decision", "preference", "thing"];
const HANDBACK = ["## Hand back to Symbiot",
  `- Found a lasting fact worth knowing elsewhere (who someone is, which account is what, a decision, how the user likes things)? Write \`.symbiot/REMEMBER.json\`: an array of \`{"name": "…", "kind": "…", "fact": "…"}\` (kind: ${KINDS.join(", ")}; a fact under 300 characters). The user sees them on your block in the Agents tab and picks Remember or Skip: that's the only way into Symbiot's memory.`,
  "- Sent an email, or drafted one for the user to send, that waits on a reply? Write `.symbiot/AWAITING.json`: an array of `{\"to\": \"their address\", \"subject\": \"its exact subject\", \"asked\": \"what you asked for\", \"next\": \"what to do once the reply is in\", \"task\": \"the task it's for\", \"lane\": \"the lane that does that\"}`. Symbiot watches the user's inbox for the reply itself and starts that lane's agent with it, so the user never has to say they replied. Don't tick a task that waits on the reply.",
  "- Wrote up something for the user to read (findings, an audit, a plan, a pitch)? Leave it in `.symbiot/` as a `.md` named for what it is (`COMPANY-AUDIT.md`, not `NOTES.md`), starting with a `# ` title. The user reads it under Reports in Symbiot, so say its name in your last message rather than repeating it there.",
  ""];
const parseJson = (text) => { try { return JSON.parse(String(text || "")); } catch { return null; } };
// .symbiot/REMEMBER.json: [{ name, kind, fact }], the shape mind.mjs remember() takes.
function parseFacts(text) {
  const a = parseJson(text), list = Array.isArray(a) ? a : a && Array.isArray(a.facts) ? a.facts : [];
  return list.map((x) => ({ name: String((x && x.name) || "").trim().slice(0, 80), kind: KINDS.includes(x && x.kind) ? x.kind : "thing", fact: String((x && x.fact) || "").replace(/\s+/g, " ").trim().slice(0, 300) }))
    .filter((x) => x.name && x.fact).slice(0, 40);
}
// .symbiot/AWAITING.json: [{ to, subject, asked, next, task, lane, sent? }]; to may be a list.
function parseAwaiting(text) {
  const a = parseJson(text), list = Array.isArray(a) ? a : a && typeof a === "object" ? [a] : [];
  const str = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
  return list.filter((x) => x && typeof x === "object").map((x) => ({
    to: (Array.isArray(x.to) ? x.to : String(x.to || "").split(/[,;]/)).map((s) => str(s, 200)).filter(Boolean).slice(0, 6),
    subject: str(x.subject, 300), asked: str(x.asked, 1000), next: str(x.next, 2000), task: str(x.task, 1000), lane: str(x.lane, 80),
    ...(Date.parse(x.sent) ? { sent: Date.parse(x.sent) } : {}),
  })).filter((x) => x.subject).slice(0, 20);
}

// ---- what a run's last words leave to the user ----------------------------------
// A run that ends saying something waits on the user ("the draft isn't sent",
// "only you can do that", "needs sudo") without asking it in QUESTIONS.md left it
// where nothing showed it: the email to Jono sat in Drafts and nothing asked for
// the OK. leftToYou finds it: { kind, what, check, label } or null.
// kind "approve": what an agent does once the user says go (send, post, delete, pay,
// close); "step": what only the user can do (sudo, a password, signing in). what:
// the sentence that says so; check: what to check first (the catch it named, else
// the point's next sentence); label: the point's bold name ("Reply to Cale").
const HELD = /\b(?:isn['’]t|wasn['’]t|not|never|hasn['’]t been|haven['’]t|didn['’]t) (?:yet )?(?:been )?(?:sent|send it|posted|post it)\b|\bunsent\b|\bbefore you (?:send|post)\b|\bfor you to (?:send|post)\b|\b(?:send|sending|post|posting) it yourself\b|\byou(?:['’]ll| will) (?:send|post) it\b|\bwaits? (?:on|for) your (?:ok|okay|go-ahead|approval|say-so)\b/i;
const YOURS = /\bonly you (?:can|could|do)\b|\b(?:needs?|waits? (?:on|for)|waiting (?:on|for)) (?:your (?!review)\w+|you to)\b|\btype your password\b|\bneeds sudo\b/i;
const DID = /\b(?:I|we)(?:['’]ve| have)? (?:sent|posted|deleted|paid|closed)\b|\balready (?:went out|sent|posted)\b|\bnothing (?:was |is )?(?:sent|posted)\b/i;
const ACTS = /\b(?:send|sent|sending|post|posted|publish|delete|remove|pay|close|cancel)\b/i;
const CATCH = /\b(?:catch|before you|check|make sure|careful|fix (?:that|it)|first)\b/i;
const NOT_THEIRS = /\bconnectors?\b|\bclaude\.ai\b/i; // a connector to sign in again shows on Home already
const SENDS = /draft|reply|email|mail|message|post/i;
function leftToYou(text) {
  const points = String(text || "").replace(/```[\s\S]*?```/g, (m) => m.replace(/\s+/g, " ")).split(/\n+|\s+-\s+(?=\*\*)/).map((p) => p.replace(/^\s*[-*•]\s+/, "").trim()).filter(Boolean)
    .map((p) => { const lm = p.match(/^\*\*([^*]{2,60}?):?\*\*:?\s*/), body = lm ? p.slice(lm[0].length) : p;
      return { label: lm ? lm[1].trim() : "", ss: body.split(/(?<=[.!?:])\s+(?=[A-Z`"*(])/).map((s) => s.trim()).filter(Boolean), off: NOT_THEIRS.test(p) }; });
  const clean = (x, n) => { x = String(x || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : x; };
  for (let k = 0; k < points.length; k++) {
    const { label, ss, off } = points[k]; if (off) continue;
    const i = ss.findIndex((s) => !DID.test(s) && (HELD.test(s) || YOURS.test(s)));
    if (i < 0) continue;
    const s = ss[i], next = points[k + 1] && !points[k + 1].off ? points[k + 1].ss : [];
    // what to check first: the catch it named (in this point, then the next), else what it says next
    const catches = ss.filter((x, j) => j !== i && CATCH.test(x) && !DID.test(x));
    const elsewhere = points.filter((p, j) => j !== k && !p.off).flatMap((p) => p.ss.filter((x) => /\byourself\b|\bbefore you\b|\bcatch\b/i.test(x) && !DID.test(x)).map((x) => (p.label ? `${p.label}: ${x}` : x)));
    let check = (catches.length ? catches.slice(0, 2).join(" ") : elsewhere[0]) || ss[i + 1] || next[0] || "";
    if (/:$/.test(check)) { const seq = [...ss.slice(i + 1), ...next, ...((points[k + 2] && points[k + 2].ss) || [])], at = seq.indexOf(check); if (at >= 0 && seq[at + 1]) check += " " + seq[at + 1]; } // "paste this:" and then the command
    // "The draft isn't sent." says which draft only in its own point ("**Draft:** it's in Gmail, to …")
    const about = !label && SENDS.test(s) ? points.find((p) => p.label && SENDS.test(p.label) && p.ss.length) : null;
    const what = label ? `${label}: ${s}` : about ? `${s} ${about.label}: ${about.ss[0]}` : s;
    return { kind: HELD.test(s) || ACTS.test(s) ? "approve" : "step", what: clean(what, 240), check: clean(check === s ? "" : check, 240), label: clean(label || (about && about.label), 60) };
  }
  return null;
}

// What an agent handed over: [{ lane, text }] from its .symbiot/HANDOFF.md.
function parseHandoffs(md) {
  const out = []; let cur = null;
  for (const raw of String(md || "").split(/\r?\n/)) {
    const m = raw.match(/^###\s+`?([^`\s]+)`?\s*$/);
    if (m) { cur = { lane: m[1].trim(), text: "" }; out.push(cur); continue; }
    if (/^#{1,2}\s/.test(raw)) { cur = null; continue; }
    if (cur) cur.text += raw + "\n";
  }
  return out.map((h) => ({ lane: h.lane, text: h.text.trim().slice(0, HANDOVER_MAX) })).filter((h) => h.lane && h.text);
}

export { OPS, HANDOVER_MAX, handoverRules, ONLY_YOU, HANDBACK, parseFacts, parseAwaiting, parseHandoffs, leftToYou };
