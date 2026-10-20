// One shared record of the questions the user has answered, for every agent and Home:
// an ask that's in it isn't raised again (Home drops it) and each agent's brief lists it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";
import { signInDone, browserBrief } from "./browserfails.mjs";

const FILE = () => join(CONFIG_DIR, "asks-done.json");
const KEEP = 200;
const key = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const SAYS_NO = /^\s*(skip|no|nope|don'?t|do not|cancel|leave it|never ?mind|stop)\b/i;
// Both files are written whole or not at all, yours only (writeJsonAtomic): a plain
// write cut short read as "nothing answered", and every agent asked again (15 Oct 2026).
const save = (file, list) => { try { writeJsonAtomic(file, list, { indent: 1, mode: 0o600 }); return true; } catch { return false; } };
function doneList() { return readState(FILE(), Array.isArray) || []; }
// q: the question, a: what the user answered. A "skip" or "no" isn't a done ask: it may come back.
// lane: whose question it was, so a brief lists only its own lane's (doneBrief). back: the user
// asked something back instead (asksBack): its subject is held until they've read the write-up (heldBy).
// id: the question's own id (agents.mjs parseQuestions), which a later ask of it in other words finds (heldBy).
function recordDone(q, a, lane = "", { back = false, id = "" } = {}) {
  const k = key(q); if (!k || !String(a || "").trim() || SAYS_NO.test(a)) return false;
  id = String(id || "").toLowerCase();
  const l = doneList().filter((x) => x.k !== k && !(id && x.id === id));
  l.push({ k, ...(id ? { id } : {}), q: String(q).trim().slice(0, 200), a: String(a).trim().slice(0, 200), at: new Date().toISOString().slice(0, 10), ts: Date.now(), ...(lane ? { lane: String(lane) } : {}), ...(back ? { back: true } : {}) });
  try { signInDone(`${q}\n${a}`); } catch {} // a sign-in asked again after this: the browser didn't hold it (browserfails.mjs)
  return save(FILE(), l.slice(-KEEP));
}
const isDone = (q) => { const k = key(q); return !!k && doneList().some((x) => x.k === k); };
// For a brief: what's already answered in this lane, so its agent doesn't ask it again. It
// was the last 20 from every lane, whole: 4,500 characters of other lanes' answers in every
// run's brief (the audit, 2026-10-14). Its own answers are in its ANSWERS.md too, so a few,
// clipped, are enough. Home still checks every lane's (isDone).
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const doneBrief = (lane = "", n = 5) => {
  const l = doneList().filter((x) => lane && x.lane === lane).slice(-n); if (!l.length) return [];
  return ["## Already answered: don't ask these again", ...l.map((x) => `- ${clip(x.q, 120)}${x.id ? ` {#${x.id}}` : ""} → ${x.back ? `they asked back first: "${clip(x.a, 120)}". Do that first, written up for Reports, and don't ask about this again` : clip(x.a, 120)}`), ""];
};

// ---- an answer that asks back: the question isn't answered, the user wants something first ----
// On 20 Oct 2026 Garth answered the Paddle question four times: "can you explain to me what paddle
// is for?", "must i ask again?", "until i read something telling me what paddle is…", "put it in
// reports so i can read it". Each run read the reply as an answer and asked for the price ids again
// in new words, and the reply he typed on its "👤 You" card was passed on as "The user says it's done".
const WANTS_READ = /\b(?:put|write|leave|add|make|save)\b[^.?!\n]{0,40}\breports?\b|\bin (?:the )?reports\b|\bso i can read\b|\b(?:something|anything) (?:to read|i can read|telling me)\b|\buntil i (?:read|see|understand|know)\b|\bexplain\b|\btell me (?:what|why|how)\b|\bwrite (?:it |this |that |me )?(?:up|out|down)\b|\b(?:a )?write-?up\b|\bsummar(?:ise|ize)\b/i;
const wantsToRead = (a) => WANTS_READ.test(String(a || ""));
// A reply in the user's own words that asks for something to read or puts a question back, not
// an option picked (options: the question's own, which a click sends word for word).
function asksBack(a, options = []) {
  const t = String(a || "").trim(), k = key(t);
  if (!t || SAYS_NO.test(t) || /^[\s*_]*(?:🤖|👤|done\b|go ahead\b)/iu.test(t) || options.some((o) => key(String(o).replace(/\s*\(recommended[^)]*\)\s*$/i, "")) === k || key(o) === k)) return false;
  return wantsToRead(t) || /\?/.test(t);
}
// What the run is told, in place of a bare answer, when the user asked back.
const askBackNote = (a) => `The user didn't answer this: they asked you for something first ("${clip(a, 300)}"). Do what they asked before anything else, in writing: ` +
  `${wantsToRead(a) ? "write it up now" : "if it takes more than a line, write it up"} as a report, a .md in .symbiot/ named for what it is and starting with a # title (it shows under Reports), and name it in your last message. ` +
  `Don't ask this question again, in any words, until they've read it and answered.`;

// Reports (reports.mjs listReports) in a folder written after `ts`: { file, title, mtime, read }, newest
// first. read: opened since it last changed (reports.json seen, ids as reports.mjs idOf). Symbiot's own
// files there (TASKS.md…) are never opened as reports, so they never count as read.
function reportsSince(folder, ts) {
  const dir = join(String(folder || ""), ".symbiot"), seen = (readState(join(CONFIG_DIR, "reports.json"), (v) => !!v && typeof v === "object") || {}).seen || {}, out = [];
  let names = []; try { names = readdirSync(dir).filter((f) => /\.md$/i.test(f) && !/^(?:TASKS|QUESTIONS|ANSWERS|HANDOFF|SKIPPED|CLAUDE|AGENTS|CARRYON)\b|^BRIEF/i.test(f)); } catch { return out; }
  for (const name of names) {
    const file = join(dir, name); let st; try { st = statSync(file); } catch { continue; }
    const mtime = Math.round(st.mtimeMs); if (!st.isFile() || mtime <= ts) continue;
    let head = ""; try { head = readFileSync(file, "utf8").slice(0, 2000); } catch {}
    const h = head.match(/^#\s+(.+)$/m);
    out.push({ file, title: (h ? h[1].replace(/[*_`]/g, "").trim() : "") || name.replace(/\.md$/i, ""), mtime, read: seen[createHash("sha1").update(file).digest("hex").slice(0, 12)] === mtime });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
// The answered ask a new question repeats, or null: (1) the same question worded again (4+ content
// words shared, 75% of the longer's: a longer one that only starts the same asks something else), from any lane; (2) a subject the user asked back about (back),
// held until they've opened a report written after it (readSince(ts, lane)), or for HOLD_FOR: 3 shared
// words in the same lane, 4 from another. Garth's 4 Paddle asks shared paddle/symbiot/pro or more.
const HOLD_FOR = 14 * 86400000;
function heldBy(q, { lane = "", now = Date.now(), readSince = () => false, id = "" } = {}) {
  // the same id is the same question, whatever its words: answered once, or asked back about until read
  if (id) { const x = doneList().slice().reverse().find((y) => y.id === String(id).toLowerCase()); if (x && (!x.back || (x.ts && now - x.ts < HOLD_FOR && !readSince(x.ts, x.lane || lane)))) return x; }
  const w = words(q); if (w.size < 2) return null;
  let best = null, top = 0;
  for (const x of doneList()) {
    if (id && x.id && x.id !== String(id).toLowerCase()) continue; // both have ids, and they differ: another question, however alike the words
    const xw = words(x.q), n = [...xw].filter((t) => w.has(t)).length; if (n < 3 || n <= top) continue;
    const hit = x.back ? x.ts && now - x.ts < HOLD_FOR && n >= (lane && x.lane === lane ? 3 : 4) && !readSince(x.ts, x.lane || lane)
      : n >= 4 && n / Math.max(w.size, xw.size) >= 0.75;
    if (hit) { best = x; top = n; }
  }
  return best;
}

// ---- standing rules: what the user and chat agree, for every agent ----------
// Agents only see their brief, so a rule agreed in chat ("don't ask which mailbox") goes
// into .config/symbiot/standing.json and into every brief. BASE is the clerk rule itself.
const RULES = () => join(CONFIG_DIR, "standing.json");
const BASE = [
  "Work like a capable clerk, not someone who keeps bugging the boss: decide and do the work with the user's linked accounts, sites and tools, then report after.",
  "Ask only for (1) passwords, SMS or 2FA codes, (2) a yes before spending money, (3) a yes before anything hard to undo (deleting, closing accounts, sending on their behalf). Work out any other answer from what you can access (a linked account, the repo, a file) instead of asking.",
  "Never name a provider you haven't confirmed (a mailbox's host, a site's login system): check its MX or DNS records first, or ask which it is. Don't build a question's choices on a guess.",
  "Never ask which repo, project or lane you're in, or what a Symbiot page is: your folder's name, its git remote, your lane and this brief say so. Symbiot's pages are Home, Dashboard (board), Workdesk (tasks), Reports, Marketing, Week, Standup, Todo, Drift, Map, Settings and Archive.",
  "When asks are needed, put them in ONE question, never several for the same cause.",
  "A send or a save is done only when the saved record shows it, never the form you filled: after sending an email or an invite, saving a meeting or adding guests, run `symbiot screens verify <the record's address> --expect \"<a guest, a subject>\"` (it reloads the page fresh) or read Sent Items, and report it only if that finds it. If it doesn't, say it isn't done.",
  "Never write a report, note or card that hands the user a manual step a connector or a signed-in site could do (posting, submitting, scheduling, sending, filling a form, checking a page): do it through Symbiot's browser or the connector. A report that needs an approval names the draft's file and tells them nothing of where to go: Symbiot puts that draft's own card, with Approve, Reject and Change, in the report.",
  "When the user answers a question by asking for something (to explain it, write it up, put it in Reports) or asks a question back, they haven't answered it: do what they asked first, before anything else, as a report in .symbiot/ (it shows under Reports), and don't ask that question again in other words until they've read it.",
  "Never ask the user to close or click Done in the Symbiot Browser: if it's open, wait and retry on a shared resource, and ask only if they're mid-sign-in. That is never an \"only you\" step.",
  "On an unsubscribe or settings page: wait for it to settle, press from the page you mapped last, and read the page again to confirm the change saved. If it still won't save, never ask \"what now?\": say in plain words which sender you couldn't unsubscribe from, set up a mail filter for it instead, and carry on.",
];
function standingList() { return (readState(RULES(), Array.isArray) || []).filter((x) => x && x.rule); }
function addRule(rule) {
  const r = String(rule || "").replace(/\s+/g, " ").trim().slice(0, 300); if (!r) return false;
  const l = standingList().filter((x) => key(x.rule) !== key(r)); l.push({ rule: r, at: new Date().toISOString().slice(0, 10) });
  return save(RULES(), l.slice(-50));
}
// Rules agreed with the user that look like they answer this question (shared words): only
// listed on the card as "already covered?" for the user to confirm, never closed on a fuzzy match.
const STOP = new Set("the a an and or to of in on for is are be it this that you your i my with from at by do does not no can should what which how when use".split(" "));
const words = (s) => new Set(key(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
function coveredBy(q) {
  const w = words(q); if (!w.size) return [];
  return standingList().map((x) => ({ r: x.rule, n: [...words(x.rule)].filter((t) => w.has(t)).length })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 2).map((x) => x.r);
}
const standingBrief = () => ["## Standing rules: they apply to every run", ...BASE.map((x) => `- ${x}`), ...browserBrief(), ...standingList().map((x) => `- ${x.rule}`), ""];

// ---- approvals: a card that asks for an OK carries it, and never asks for one already given ----
// An agent once asked the user to "open the two drafts under Marketing and press Approve on each"
// for documents that have no Approve button, after they had already said yes in Home chat.
// So an ask for an approval (1) becomes an "approve" card, where Go ahead on the card IS the
// approval and nothing is pressed elsewhere, and (2) is dropped when chat, a task or an earlier
// answer already holds that approval.
const APPROVAL_ASK = /only you: (?:your )?(?:approval|OK)\b|\b(?:press|click|tap|hit)\s+(?:the\s+)?Approve\b|\bapprove (?:each|both|the|these|those|them|it)\b/i;
const isApprovalAsk = (t) => APPROVAL_ASK.test(String(t || ""));
// "open the two drafts dated 2026-10-20 under Marketing and press Approve on each; I then…"
// → "Approve the two drafts dated 2026-10-20; I then…": the card itself is where it's approved.
const approvalText = (what) => String(what || "").trim().replace(/^(?:open|go to|find)\s+(.*?)(?:\s+(?:under|in|on)\s+(?:the\s+)?[A-Za-z ]{2,24}?)?\s+(?:and\s+)?(?:press|click|tap|hit)\s+(?:the\s+)?Approve(?:\s+(?:on|for)\s+(?:each|both|it|them|all))?/i, "Approve $1");
const YES = /\b(yes|yeah|yep|yup|ok|okay|sure|go ahead|go for it|do (?:it|this|that|these|those|them)|approved?|looks good|ship it|send it|post it)\b/i;
const shared = (a, b) => { const wb = words(b); return [...words(a)].filter((t) => wb.has(t)).length; };
const NEED = 4; // shared content words that make two texts the same subject
// turns: [{ role, text }] oldest first; tasks: [{ text }]; answers: an ANSWERS.md's text.
function approvedBefore(what, { turns = [], tasks = [], answers = "" } = {}) {
  if (!String(what || "").trim()) return false;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]; if (t.role !== "user" || !YES.test(t.text) || SAYS_NO.test(t.text)) continue;
    if (shared(what, [turns[i - 2], turns[i - 1], t].filter(Boolean).map((x) => x.text).join(" ")) >= NEED) return true;
  }
  for (const t of tasks) if (/\b(?:approved|approval|go-?ahead)\b/i.test(t.text) && /\b(?:user|garth)\b/i.test(t.text) && shared(what, t.text) >= NEED) return true;
  for (const m of String(answers).split(/^### /m).slice(1)) {
    const [q, ...rest] = m.split("\n"), a = rest.join(" ").trim();
    if (shared(what, q) >= NEED && /^(?:Done|Go ahead|🤖|👤)/i.test(a) && !SAYS_NO.test(a)) return true;
  }
  return false;
}
function recentTurns(now = Date.now(), maxAge = 3 * 86400000) {
  try { const d = JSON.parse(readFileSync(join(CONFIG_DIR, "mind.json"), "utf8")); return (Array.isArray(d.log) ? d.log : []).filter((l) => now - (l.ts || 0) < maxAge).map((l) => ({ role: l.role, text: String(l.text || "") })); } catch { return []; }
}
function recentTasks() { try { const l = JSON.parse(readFileSync(join(CONFIG_DIR, "tasks.json"), "utf8")); return Array.isArray(l) ? l.map((t) => ({ text: String(t.text || "") })) : []; } catch { return []; } }

export { recordDone, isDone, doneList, doneBrief, asksBack, askBackNote, wantsToRead, heldBy, reportsSince, addRule, standingList, standingBrief, coveredBy, isApprovalAsk, approvalText, approvedBefore, recentTurns, recentTasks };
