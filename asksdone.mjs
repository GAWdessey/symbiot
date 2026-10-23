// One shared record of the questions the user has answered, for every agent and Home:
// an ask that's in it isn't raised again (Home drops it) and each agent's brief lists it.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";
import { signInDone, browserBrief } from "./browserfails.mjs";
import { codeAsk, codeIn } from "./codeask.mjs";

const FILE = () => join(CONFIG_DIR, "asks-done.json");
const KEEP = 200;
const key = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const SAYS_NO = /^\s*(skip|no|nope|don'?t|do not|cancel|leave it|never ?mind|stop)\b/i;
// Both files are written whole or not at all, yours only (writeJsonAtomic): a plain
// write cut short read as "nothing answered", and every agent asked again (15 Oct 2026).
const save = (file, list) => { try { writeJsonAtomic(file, list, { indent: 1, mode: 0o600 }); return true; } catch { return false; } };
// A code a site sent is one use: the record says the ask was answered, never the code. On 21 Oct
// 2026 a code typed on a code card was kept here whole, for repeatAnswer to write into another
// agent's brief. And a code ask asked again wants a new code, so nothing answers it from here
// (heldBy, isDone). Records kept before this are cleaned as they're read, and saved clean.
const CODE_KEPT = "answered with a code (one use, so it isn't kept)";
const codeRecord = (q, a) => !!codeAsk({ q }) || !!codeIn(a);
const unCoded = (x) => (x && (x.code || codeRecord(x.q, x.a)) ? { ...x, code: true, ...(/\d{3}/.test(x.a) ? { a: CODE_KEPT } : {}) } : x);
function doneList() { return (readState(FILE(), Array.isArray) || []).map(unCoded); }
// q: the question, a: what the user answered. A "skip" or "no" isn't a done ask: it may come back.
// lane: whose question it was, so a brief lists only its own lane's (doneBrief). back: the user
// asked something back instead (asksBack): its subject is held until they've read the write-up (heldBy).
// id: the question's own id (agents.mjs parseQuestions), which a later ask of it in other words finds (heldBy).
function recordDone(q, a, lane = "", { back = false, id = "" } = {}) {
  const k = key(q); if (!k || !String(a || "").trim() || SAYS_NO.test(a)) return false;
  id = String(id || "").toLowerCase();
  const l = doneList().filter((x) => x.k !== k && !(id && x.id === id));
  l.push(unCoded({ k, ...(id ? { id } : {}), q: String(q).trim().slice(0, 200), a: String(a).trim().slice(0, 200), at: new Date().toISOString().slice(0, 10), ts: Date.now(), ...(lane ? { lane: String(lane) } : {}), ...(back ? { back: true } : {}) }));
  try { signInDone(`${q}\n${l[l.length - 1].a}`); } catch {} // a sign-in asked again after this: the browser didn't hold it (browserfails.mjs)
  return save(FILE(), l.slice(-KEEP));
}
const isDone = (q) => { const k = key(q); return !!k && doneList().some((x) => x.k === k && !x.code); };
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
// On 20 Oct 2026 the user answered the Paddle question four times: "can you explain to me what paddle
// is for?", "must i ask again?", "until i read something telling me what paddle is…", "put it in
// reports so i can read it". Each run read the reply as an answer and asked for the price ids again
// in new words, and the reply he typed on its "👤 You" card was passed on as "The user says it's done".
const WANTS_READ = /\b(?:put|write|leave|add|make|save)\b[^.?!\n]{0,40}\breports?\b|\bin (?:the )?reports\b|\bso i can read\b|\b(?:something|anything) (?:to read|i can read|telling me)\b|\buntil i (?:read|see|understand|know)\b|\bexplain\b|\btell me (?:what|why|how)\b|\bwrite (?:it |this |that |me )?(?:up|out|down)\b|\b(?:a )?write-?up\b|\bsummar(?:ise|ize)\b/i;
const wantsToRead = (a) => WANTS_READ.test(String(a || "")) || wantsReport(a);
// "give me a thorough report first", "i need the report first then we can send it": a report before
// anything goes ahead. On 21 Oct 2026 the user said so twice on a Go ahead card about a reply to a client,
// and both went to its run as "Go ahead: …": it found nothing to do, and the card came back unchanged.
const REPORT_FIRST = /\b(?:report|write-?up|summary)\b[^.?!\n]{0,40}\b(?:first|before)\b|\b(?:first|before)\b[^.?!\n]{0,30}\b(?:a|the|your)\b[^.?!\n]{0,20}\breport\b|\b(?:give|show|send|get) me\b[^.?!\n]{0,30}\breport\b|\b(?:need|want|waiting (?:on|for)) (?:a|the|that|your)\b[^.?!\n]{0,30}\breport\b/i;
const wantsReport = (a) => REPORT_FIRST.test(String(a || ""));
// "i read it. this case is closed, no further aspects need to be done on this until we hear further from
// them" (21 Oct 2026): typed on a Go ahead card about a reply to a client, after two report-first answers.
// It went to its run as "Go ahead: …", the run did nothing, and its last words ("it stays an unsent
// draft") put the card back a fourth time. An answer that closes the ask settles it for good (home.mjs
// homeAnswer); a bare "done" closes only an OK it waited on: on a step of theirs it means they did it.
const CLOSES = /\b(?:case|matter|thread|issue|ticket|job|task|it|this|that)(?:['’]s|\s+is|\s+has been|\s+can be|\s+is now)\s+(?:closed|settled|resolved|sorted)\b|\bcase closed\b|\bno further (?:action|aspects?|steps?|work|follow[- ]?ups?)\b|\bnothing (?:more|further|else) (?:to (?:do|be done)|(?:is )?needed|needs (?:to be done|doing))\b|\bclose (?:it|this|the case)\b/i;
const BARE_DONE = /^\s*(?:(?:it['’]?s|that['’]?s|all|already)\s+)?(?:done|closed|sorted|handled)\s*[.!]*\s*$/i;
const closesAsk = (a, { approve = false } = {}) => { const t = String(a || "").trim(); return !!t && !/\?/.test(t) && (CLOSES.test(t) || (approve && BARE_DONE.test(t))); };
// A run's outcome that says the ask needs nothing (agents.mjs needsOf): its lead paragraph, the
// first that isn't a heading or a bullet, closes it ("That asks for nothing further, so I did nothing
// this run"). "There was nothing for me to do" is about the run, not the ask: it isn't one.
const RUN_CLOSED = /\b(?:asks?|calls?) for nothing (?:further|more|else)\b|\b(?:needs?|requires?) nothing (?:further|more|else)\b|\bnothing (?:further|more|else) (?:is )?(?:needed|required)\b/i;
function runSaysClosed(final) {
  const lead = String(final || "").split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !/^(?:#|[-*•]\s|\d+[.)]\s)/.test(p)) || "";
  return RUN_CLOSED.test(lead) || CLOSES.test(lead);
}
// A reply in the user's own words that asks for something to read or puts a question back, not
// an option picked (options: the question's own, which a click sends word for word).
function asksBack(a, options = []) {
  const t = String(a || "").trim(), k = key(t);
  if (t && wantsReport(t.replace(/^[\s*_]*(?:go ahead|done)\b\W*/i, ""))) return true; // "Go ahead: i need the report first" isn't a go-ahead
  if (!t || SAYS_NO.test(t) || /^[\s*_]*(?:🤖|👤|done\b|go ahead\b)/iu.test(t) || options.some((o) => key(String(o).replace(/\s*\(recommended[^)]*\)\s*$/i, "")) === k || key(o) === k)) return false;
  return wantsToRead(t) || /\?/.test(t) || asksQ(t);
}
// A question with no question mark: "did you fix the force app" was saved as the card's answer and
// its agent sent off to write a report, and the user got nothing back on the card (22 Oct 2026).
const ASKS = /^\s*(?:did|do|does|is|are|was|were|can|could|will|would|should|have|has|why|what|how|when|where|who|which|whats|what's|hows|how's|any news|so did|but did|and did)\b/i;
// …but "did it" on its own is a statement: "did it, she spoke" answers "Did you allow the mic?", "did it work" asks
const DID_IT = /^\s*did (?:it|that|this|so)(?:\s+(?:already|just now|now|earlier|yesterday|today))?\s*(?:[.!,;:-]|$)/i;
const asksQ = (t) => ASKS.test(t) && !DID_IT.test(t);
// Typed on a step card (a 👤 step of theirs: "Did you allow the mic?"), words say it's done only when
// they say so ("done", "i did", "allowed it", "yes"). "nothing at that local host" and "start it so i
// can press the allow mic button" both went to the run as "Done: the user did it (…)": it checked,
// found the step wasn't done, and asked again, so the card kept coming back (22 Oct 2026).
const NOT_DONE = /\b(?:not|nothing|never|none|nowhere|can['’]?t|cannot|couldn['’]?t|won['’]?t|isn['’]?t|aren['’]?t|doesn['’]?t|don['’]?t|didn['’]?t|wasn['’]?t|haven['’]?t|hasn['’]?t|fail(?:s|ed|ing)?|error|broken|stuck|blank|empty|still|(?:is|was|does|did|do|has|have|are|were|could|would|should|wo|ca)n['’]?t)\b/i;
const ASKS_FOR = /^\s*(?:(?:ok(?:ay)?|so|and|then|first)[,\s]+)?(?:please\s+|pls\s+)?(?:start|open|run|try|check|send|show|give|tell|launch|restart|reload|redo|retry|fix|make|turn|switch|put|let|wait|use|go|get|find|look|help|you)\b/i;
const DONE_SAID = /\b(?:done|did(?: it| that| this| so)?|finished|completed?|allowed|granted|pressed|clicked|signed (?:in|up)|logged in|installed|enabled|turned (?:it |that )?on|switched (?:it |that )?on|set (?:it |that )?up|sorted|fixed|works|working|went through|yes|yep|yeah|yup|ok|okay|sure|i have|i've|ive)\b/i;
const saysDone = (a) => { const t = String(a || "").trim(); return !!t && !/\?/.test(t) && !asksQ(t) && !NOT_DONE.test(t) && !ASKS_FOR.test(t) && DONE_SAID.test(t); };

// ---- a card is a conversation with its agent -------------------------------------------
// What was said on a card before it was answered: the user's questions and the agent's replies,
// per question, in the folder's .symbiot/talk.json. Shown on the card, and given to the run with
// the answer when it comes (agents.mjs answerQuestions).
const TALK = (path) => join(String(path || ""), ".symbiot", "talk.json");
function talkAll(path) { try { const o = JSON.parse(readFileSync(TALK(path), "utf8")); return o && typeof o === "object" ? o : {}; } catch { return {}; } }
const talkOf = (path, q) => talkAll(path)[key(q)] || [];
function addTalk(path, q, msg, now = Date.now()) {
  const all = talkAll(path), k = key(q); all[k] = [...(all[k] || []), { from: msg.from, text: String(msg.text || "").slice(0, 4000), at: now }].slice(-20);
  try { mkdirSync(join(String(path), ".symbiot"), { recursive: true }); writeFileSync(TALK(path), JSON.stringify(all, null, 1)); } catch {}
  return all[k];
}
function endTalk(path, q) { const all = talkAll(path), k = key(q); if (!all[k]) return; delete all[k]; try { writeFileSync(TALK(path), JSON.stringify(all, null, 1)); } catch {} }
const talkText = (t) => t.map((m) => `${m.from === "you" ? "The user" : "You"}: ${m.text}`).join("\n");
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
    const id = createHash("sha1").update(file).digest("hex").slice(0, 12);
    out.push({ id, file, title: (h ? h[1].replace(/[*_`]/g, "").trim() : "") || name.replace(/\.md$/i, ""), mtime, read: seen[id] === mtime });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
// The report a run's card points at ("Read the report"): the one `said` names (its last words, a
// question: "on Reports as LOVELINK-FULL-EMAIL-REPORT"), else, in an ops run's own folder (`own`: one
// job each), its newest, else the newest written since `since`. null when there's none.
function runReport(folder, { said = "", since = 0, own = false } = {}) {
  const all = reportsSince(folder, 0); if (!all.length) return null;
  const t = String(said || "");
  const named = all.find((r) => { const n = basename(r.file), stem = n.replace(/\.md$/i, ""); return t.includes(n) || (stem.length >= 6 && new RegExp(`(?:^|[^\\w-])${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(t)); });
  return named || (own ? all[0] : all.find((r) => r.mtime > since)) || null;
}
// The newest answer in a folder's ANSWERS.md, when it asks for a report before anything goes ahead:
// { heading, text } or null. Only the newest: an answer after it ("go ahead, send it") settles it.
// Symbiot's own reminder of it (agents.mjs chaseReport, "From Symbiot: …") isn't a new answer.
function reportAsked(answers) {
  const last = String(answers || "").split(/^### /m).slice(1).filter((x) => !/^From Symbiot\b/i.test(x)).pop(); if (!last) return null;
  const [heading, ...rest] = last.split("\n"), text = rest.filter((l) => !/^_(?:answered|shared)\b/.test(l.trim())).join(" ").trim();
  return wantsReport(text) ? { heading: heading.trim(), text } : null;
}
// The answered ask a new question repeats, or null: (1) the same question worded again (4+ content
// words shared, 75% of the longer's: a longer one that only starts the same asks something else), from any lane; (2) a subject the user asked back about (back),
// held until they've opened a report written after it (readSince(ts, lane)), or for HOLD_FOR: 3 shared
// words in the same lane, 4 from another. the user's 4 Paddle asks shared paddle/symbiot/pro or more.
const HOLD_FOR = 14 * 86400000;
function heldBy(q, { lane = "", now = Date.now(), readSince = () => false, id = "" } = {}) {
  // the same id is the same question, whatever its words: answered once, or asked back about until read
  if (id) { const x = doneList().slice().reverse().find((y) => y.id === String(id).toLowerCase() && !y.code); if (x && (!x.back || (x.ts && now - x.ts < HOLD_FOR && !readSince(x.ts, x.lane || lane)))) return x; }
  const w = words(q); if (w.size < 2) return null;
  let best = null, top = 0;
  for (const x of doneList()) {
    if (x.code) continue; // a code ask again: a new code
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
  "Never ask which repo, project or lane you're in, or what a Symbiot page is: your folder's name, its git remote, your lane and this brief say so. Symbiot's pages are Home, Dashboard (board), Workdesk (tasks), Reports, Marketing, Week, Standup, Todo, Drift, Map, Settings, Vault and Archive.",
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
// Two shared words was any card naming the user and "send": the Dana card showed two
// unrelated rules as "Already covered?" (21 Oct 2026). A word in three or more of the rules,
// or a third of them (the user's name, "send", "sign"), says nothing about which one it is.
const FILLER = new Set("has have had was were will would about her his him she they them their then than now first again also any anything all only just into out its our before after until never always yet still here there whether wait asks ask asked said says run agent".split(" "));
const covWords = (s) => new Set([...words(s)].filter((t) => !FILLER.has(t)));
function coveredBy(q) {
  const w = covWords(q); if (!w.size) return [];
  const rules = standingList().map((x) => ({ r: x.rule, w: covWords(x.rule) })), seen = new Map();
  for (const x of rules) for (const t of x.w) seen.set(t, (seen.get(t) || 0) + 1);
  const telling = (t) => rules.length < 3 || (seen.get(t) < 3 && seen.get(t) < rules.length / 3);
  return rules.map((x) => ({ r: x.r, n: [...x.w].filter((t) => w.has(t) && telling(t)).length })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 2).map((x) => x.r);
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

export { talkOf, addTalk, endTalk, talkText, ASKS, asksQ, saysDone, YES, recordDone, isDone, doneList, doneBrief, closesAsk, runSaysClosed, asksBack, askBackNote, wantsToRead, wantsReport, heldBy, reportsSince, runReport, reportAsked, addRule, standingList, standingBrief, coveredBy, isApprovalAsk, approvalText, approvedBefore, recentTurns, recentTasks };
