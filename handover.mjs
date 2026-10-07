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
const ONLY_YOU = "- Only what no agent can do is the user's: their body (a phone in their hand, a cable, which network they're on), their identity or secrets (signing in, a 2FA code, a token from a provider's console) or a decision that's theirs (closing an account, spending money, sending something in their name). Start such an option with `👤 You (only you: <which>):`, e.g. `👤 You (only you: your Meta token): paste it into .env`. Anything an agent could do, yours or another lane's, is never a 👤 step: do it, or hand it over. An option where picking it is enough starts with `🤖 Agent:`. Tag actions only: an option that just reports what the user saw or decides (`it notified me`, `not tried yet`) gets no tag. A permission your run doesn't have (a command, a folder) is never a chore for the user: write the rules, as narrow as the task needs, to `.symbiot/allowlist.proposed.json` (`{\"permissions\": {\"allow\": [...], \"deny\": [...], \"additionalDirectories\": [...]}}`) and offer `👤 You (only you: a permission): allow the list in .symbiot/allowlist.proposed.json`. Picking it in Symbiot turns it on for this folder and runs you again; don't ask them to copy files or run claude in a terminal for it.";

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

export { OPS, HANDOVER_MAX, handoverRules, ONLY_YOU, HANDBACK, parseFacts, parseAwaiting, parseHandoffs };
