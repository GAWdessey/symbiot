// One shared record of the questions the user has answered, for every agent and Home:
// an ask that's in it isn't raised again (Home drops it) and each agent's brief lists it.
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { CONFIG_DIR } from "./core.mjs";

const FILE = () => join(CONFIG_DIR, "asks-done.json");
const KEEP = 200;
const key = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const SAYS_NO = /^\s*(skip|no|nope|don'?t|do not|cancel|leave it|never ?mind|stop)\b/i;
function doneList() { try { const l = JSON.parse(readFileSync(FILE(), "utf8")); return Array.isArray(l) ? l : []; } catch { return []; } }
// q: the question, a: what the user answered. A "skip" or "no" isn't a done ask: it may come back.
function recordDone(q, a) {
  const k = key(q); if (!k || !String(a || "").trim() || SAYS_NO.test(a)) return false;
  const l = doneList().filter((x) => x.k !== k);
  l.push({ k, q: String(q).trim().slice(0, 200), a: String(a).trim().slice(0, 200), at: new Date().toISOString().slice(0, 10) });
  try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(FILE(), JSON.stringify(l.slice(-KEEP), null, 1)); } catch { return false; }
  return true;
}
const isDone = (q) => { const k = key(q); return !!k && doneList().some((x) => x.k === k); };
// For a brief: what's already answered, so no agent asks it again.
const doneBrief = (n = 20) => {
  const l = doneList().slice(-n); if (!l.length) return [];
  return ["## Already answered: don't ask these again", ...l.map((x) => `- ${x.q} → ${x.a}`), ""];
};

// ---- standing rules: what the user and chat agree, for every agent ----------
// Agents only see their brief, so a rule agreed in chat ("don't ask which mailbox") goes
// into .config/symbiot/standing.json and into every brief. BASE is the clerk rule itself.
const RULES = () => join(CONFIG_DIR, "standing.json");
const BASE = [
  "Work like a capable clerk, not someone who keeps bugging the boss: decide and do the work with the user's linked accounts, sites and tools, then report after.",
  "Ask only for (1) passwords, SMS or 2FA codes, (2) a yes before spending money, (3) a yes before anything hard to undo (deleting, closing accounts, sending on their behalf). Work out any other answer from what you can access (a linked account, the repo, a file) instead of asking.",
  "Never name a provider you haven't confirmed (a mailbox's host, a site's login system): check its MX or DNS records first, or ask which it is. Don't build a question's choices on a guess.",
  "When asks are needed, put them in ONE question, never several for the same cause.",
  "Never ask the user to close or click Done in the Symbiot Browser: if it's open, wait and retry on a shared resource, and ask only if they're mid-sign-in. That is never an \"only you\" step.",
];
function standingList() { try { const l = JSON.parse(readFileSync(RULES(), "utf8")); return Array.isArray(l) ? l.filter((x) => x && x.rule) : []; } catch { return []; } }
function addRule(rule) {
  const r = String(rule || "").replace(/\s+/g, " ").trim().slice(0, 300); if (!r) return false;
  const l = standingList().filter((x) => key(x.rule) !== key(r)); l.push({ rule: r, at: new Date().toISOString().slice(0, 10) });
  try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(RULES(), JSON.stringify(l.slice(-50), null, 1)); } catch { return false; }
  return true;
}
// Rules agreed with the user that look like they answer this question (shared words): only
// listed on the card as "already covered?" for the user to confirm, never closed on a fuzzy match.
const STOP = new Set("the a an and or to of in on for is are be it this that you your i my with from at by do does not no can should what which how when use".split(" "));
const words = (s) => new Set(key(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
function coveredBy(q) {
  const w = words(q); if (!w.size) return [];
  return standingList().map((x) => ({ r: x.rule, n: [...words(x.rule)].filter((t) => w.has(t)).length })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 2).map((x) => x.r);
}
const standingBrief = () => ["## Standing rules: they apply to every run", ...BASE.map((x) => `- ${x}`), ...standingList().map((x) => `- ${x.rule}`), ""];
export { recordDone, isDone, doneList, doneBrief, addRule, standingList, standingBrief, coveredBy };
