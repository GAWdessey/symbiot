// symbiot — Handover: what every brief says about lanes, and about the steps
// only the user can do. Each agent works in its own lane (a repo, or ops for
// everything outside one), and hands what's another lane's job to that lane
// instead of stopping or asking the user (lanes.mjs runs it). What reaches the
// user is only what no agent can do, and the brief makes the agent say which.
// Text and parsing only, no imports: shared by every brief (tasks.mjs
// buildTasksMd, mind.mjs actBrief) and by lanes.mjs.

const OPS = "ops";
const MAX_LANES_LISTED = 40;

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
const ONLY_YOU = "- Only what no agent can do is the user's: their body (a phone in their hand, a cable, which network they're on), their identity or secrets (signing in, a 2FA code, a token from a provider's console) or a decision that's theirs (closing an account, spending money, sending something in their name). Start such an option with `👤 You (only you: <which>):`, e.g. `👤 You (only you: your Meta token): paste it into .env`. Anything an agent could do, yours or another lane's, is never a 👤 step: do it, or hand it over. An option where picking it is enough starts with `🤖 Agent:`. Tag actions only: an option that just reports what the user saw or decides (`it notified me`, `not tried yet`) gets no tag.";

// What an agent handed over: [{ lane, text }] from its .symbiot/HANDOFF.md.
function parseHandoffs(md) {
  const out = []; let cur = null;
  for (const raw of String(md || "").split(/\r?\n/)) {
    const m = raw.match(/^###\s+`?([^`\s]+)`?\s*$/);
    if (m) { cur = { lane: m[1].trim(), text: "" }; out.push(cur); continue; }
    if (/^#{1,2}\s/.test(raw)) { cur = null; continue; }
    if (cur) cur.text += raw + "\n";
  }
  return out.map((h) => ({ lane: h.lane, text: h.text.trim().slice(0, 4000) })).filter((h) => h.lane && h.text);
}

export { OPS, handoverRules, ONLY_YOU, parseHandoffs };
