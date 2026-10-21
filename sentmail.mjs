// symbiot — an email task the user already sent.
//
// "Draft an email from the user to Alex Reed, cc Remy (…), about North Star" stays
// open until someone ticks it, but the user often sends the mail themselves. So an
// open email task is looked for in what they sent since it was made: the mail on
// this computer (mail.mjs) and Gmail's Sent page, read in the app's hidden browser.
// A match closes the task and keeps where it went (task.sent), so Home and the chat
// say "sent on <date>, waiting on reply" instead of listing it as work.
import { join } from "node:path";
import { createHash } from "node:crypto";
import { loadTasks, saveTasks, loadConfig, CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";
import { track } from "./jobs.mjs";
import { mailActivity } from "./mail.mjs";

const ACTION = /^\s*(?:(?:new job|urgent)\s*:\s*)?(?:please\s+)?(?:draft|write|compose|send|email|e-mail|mail|reply|respond|follow[\s-]?up)\b/i;
const MAILY = /\b(?:e-?mails?|mail|reply|replies)\b/i;
const ADDR = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const lc = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

// What an email task names: who it goes to (names and addresses), and its topic.
// null when the task isn't about writing or sending an email.
function emailJob(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!ACTION.test(t) || !MAILY.test(t.slice(0, 80))) return null;
  const addrs = [...new Set((t.match(ADDR) || []).map(lc))];
  const clean = t.replace(ADDR, " ").replace(/\(\s*\)/g, " ");
  const names = [];
  // "… to Alex Reed, cc Remy (…)": the capitalised words after to / cc / bcc
  for (const m of clean.matchAll(/\b(?:to|cc|bcc)\s+((?:[A-Z][\w'’-]+)(?:\s+[A-Z][\w'’-]+){0,2})/g)) names.push(lc(m[1]));
  const about = clean.match(/\babout\s+(.+?)(?:[.;:]|\s+\(|\s+(?:and|so|then|because)\s|$)/i);
  const topic = about ? lc(about[1].replace(/^(?:the|a|an|our|my)\s+/i, "")) : "";
  if (!addrs.length && !names.length) return null;
  return { addrs, names, topic };
}

// Whether a sent message ({ ts?, to: [names/addresses], subject, text? }) is this
// job's email: it went to the first person named and, when the task names a topic,
// the topic is in it. Mail from before the task was made doesn't count.
function sentMatch(job, task, row) {
  if (!job || !row) return false;
  if (row.ts && Number(task.ts) && row.ts < Number(task.ts) - 60000) return false;
  const hay = lc([...(row.to || []), row.subject, row.text].join(" "));
  const lead = job.addrs[0] ? job.addrs.some((a) => hay.includes(a)) : false;
  const first = job.names[0], named = first ? hay.includes(first) || first.split(" ").every((w) => hay.includes(w)) : false;
  if (!lead && !named) return false;
  if (job.topic) { const words = job.topic.split(/[^a-z0-9]+/).filter((w) => w.length > 2); if (words.length && !words.every((w) => hay.includes(w))) return false; }
  return true;
}

// Close the open email tasks that `rows` (what was sent) answer. Returns the tasks closed.
function settleSent(rows, { load = loadTasks, save = saveTasks, now = Date.now() } = {}) {
  const t = load(), done = [];
  for (const x of t) {
    if (!x || x.done || x.archived || x.sent) continue;
    const job = emailJob(x.full || x.text); if (!job) continue;
    const row = (rows || []).find((r) => sentMatch(job, x, r)); if (!row) continue;
    x.done = true; x.changed = now;
    x.sent = { at: row.ts || now, subject: String(row.subject || row.text || "").slice(0, 120), to: (row.to || []).slice(0, 3), via: row.via || "mail", ...(row.href ? { href: row.href } : {}) };
    done.push(x);
  }
  if (done.length) { save(t); for (const x of done) track("task:" + x.id, { kind: "email", text: x.text, state: "sent", waitingOn: "third party" }, { now }); }
  return done;
}
const sentLine = (x, now = Date.now()) => { const d = x && x.sent && new Date(x.sent.at || now); return d ? `sent on ${d.toISOString().slice(0, 10)}, waiting on reply` : ""; };

// Gmail's Sent page for each linked Gmail inbox (the same account: /mail/u/1/…).
function sentUrls(watches) {
  const out = [];
  for (const w of watches || []) { try { const u = new URL(w.url); if (u.hostname === "mail.google.com") { u.hash = "sent"; out.push(u.href); } } catch {} }
  return [...new Set(out)];
}

let lastWeb = 0;
const WEB_EVERY = 20 * 60000;
// The sent mail to look through: mail on this computer, and Gmail's Sent page now and then.
async function sentRows({ days = 21, local = mailActivity, read, watches, now = Date.now(), web = true } = {}) {
  const cfg = (() => { try { return loadConfig() || {}; } catch { return {}; } })();
  const mc = cfg.mail || {}, rows = [];
  try {
    for (const m of local({ days, sources: mc.sources || [], addresses: mc.addresses || [] })) rows.push({ ts: m.ts, to: m.to, subject: m.subject, via: "mail" });
  } catch {}
  if (web && read && now - lastWeb >= WEB_EVERY) {
    lastWeb = now;
    for (const url of sentUrls(watches)) {
      try {
        const page = await read(url); if (!page || page.error || page.login || page.busy) continue;
        const { itemsOf } = await import("./watch.mjs");
        for (const it of itemsOf(page)) rows.push({ text: it.text, subject: it.text, to: [], via: "Gmail Sent", ...(it.href ? { href: it.href } : {}) });
      } catch {}
    }
  }
  return rows;
}

// ---- a card that says an email is unsent, checked against what was sent ----------
// A run ended saying "the Remy catch-up email is unsent", and Home kept asking to send it after
// the user had sent it himself from Gmail at 06:40 (21 Oct 2026). So a "needs you" card that says an
// email isn't sent is looked for in the same sent mail: one to the person it names, sent since its
// run started, and the card says so instead of "unsent" (agents.mjs needsOf). Found ones are kept
// in sent-needs.json, by folder and the card's words.
const SENT_NEEDS = () => join(CONFIG_DIR, "sent-needs.json");
const UNSENT = /\b(?:unsent|(?:isn['’]?t|is not|wasn['’]?t|was not|not) (?:been |yet )?sent|ha(?:s|ve)n['’]?t (?:been )?sent|ha(?:s|ve) not (?:been )?sent|not sent yet|still (?:a |an |in )?(?:unsent )?drafts?|(?:sits|waits|is) in (?:your )?drafts)\b/i;
// Words that start sentences or name places, never the person an email is to.
const NOT_NAMES = new Set("unsent still sits waits been yet i i'm it it's its the a an this that check go skip draft drafts reply replies subject sent mail email gmail outlook inbox your you my we our once then when if and or but nothing nobody anyone everyone symbiot reports home workdesk monday tuesday wednesday thursday friday saturday sunday mon tue wed thu fri sat sun january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec".split(" "));
// What an "it's unsent" card names: { names, addrs, words } or null when it doesn't say an email is unsent.
// `mine`: the user's own addresses ("in your garth@… mail"), never who it's to.
function unsentClaim(text, mine = []) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!UNSENT.test(t) || !/\b(?:e-?mails?|mail|repl(?:y|ies)|drafts?|message|invite)\b/i.test(t)) return null;
  const own = new Set((mine || []).map(lc));
  const addrs = [...new Set((t.match(ADDR) || []).map(lc))].filter((a) => !own.has(a) && !new RegExp(`\\byour\\s+${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(t));
  const names = [...new Set([...t.replace(ADDR, " ").matchAll(/\b([A-Z][a-z][\w'’-]*)\b/g)].map((m) => lc(m[1])).filter((w) => !NOT_NAMES.has(w)))];
  if (!addrs.length && !names.length) return null;
  return { names, addrs, words: [...new Set(lc(t.replace(ADDR, " ")).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !NOT_NAMES.has(w)))] };
}
// The sent row that answers a claim: to someone it names, and sent since `since` (a row from Gmail's
// Sent page has no time: then 2 of the card's other words must be in it too). null when none is.
function sentFor(claim, rows, since = 0) {
  if (!claim) return null;
  for (const r of rows || []) {
    const hay = lc([...(r.to || []), r.subject, r.text].join(" ")), who = claim.addrs.find((a) => hay.includes(a)) || claim.names.find((n) => new RegExp(`\\b${n}\\b`).test(hay));
    if (!who) continue;
    if (r.ts) { if (r.ts >= since) return { ...r, who }; continue; }
    if (claim.words.filter((w) => w !== who && hay.includes(w)).length >= 2) return { ...r, who };
  }
  return null;
}
const needKey = (path, what) => createHash("sha1").update(`${path}\n${String(what || "").trim()}`).digest("hex").slice(0, 16);
// What sentTick found for this card: { subject, to, when, via } or null.
function sentAfter(path, what, file = SENT_NEEDS()) {
  if (!unsentClaim(what)) return null;
  const d = readState(file, (v) => !!v && typeof v === "object" && !Array.isArray(v)) || {};
  return d[needKey(path, what)] || null;
}
// Note the cards (`needs`: [{ path, what, since }]) whose email `rows` show was sent. Returns those found.
function settleUnsent(needs, rows, { mine = [], file = SENT_NEEDS(), now = Date.now() } = {}) {
  const d = readState(file, (v) => !!v && typeof v === "object" && !Array.isArray(v)) || {}, found = [];
  for (const n of needs || []) {
    const k = needKey(n.path, n.what); if (d[k]) continue;
    const r = sentFor(unsentClaim(n.what, mine), rows, n.since || 0); if (!r) continue;
    d[k] = { subject: String(r.subject || r.text || "").replace(/\s+/g, " ").trim().slice(0, 120), to: (r.to || []).slice(0, 2).join(", ") || r.who, ...(r.ts ? { when: new Date(r.ts).toISOString().slice(0, 16).replace("T", " ") } : {}), via: r.via || "mail", ...(r.by ? { by: r.path && r.path === n.path ? "its own run" : r.by } : {}), at: now };
    found.push({ ...n, sent: d[k] });
  }
  if (found.length) { for (const [k, v] of Object.entries(d)) if (now - (v.at || 0) > 14 * 86400000) delete d[k]; try { writeJsonAtomic(file, d, { mode: 0o600 }); } catch {} }
  return found;
}
// ---- what other agents sent ------------------------------------------------------
// The same morning another lane's agent sent "Re: LOVE LINK ONBOARDING" to the client from the user's
// mail at 08:33, while an ops run kept calling its own reply to her an unsent draft waiting on his
// OK, and never mentioned it (21 Oct 2026). A run that sends an email says so in its AWAITING.json,
// and Symbiot keeps every one in awaiting.json (handback.mjs): those are sent rows too, by that lane.
const AWAIT_FILE = () => join(CONFIG_DIR, "awaiting.json");
function agentSent({ file = AWAIT_FILE(), now = Date.now(), days = 7 } = {}) {
  const d = readState(file, (v) => !!v && typeof v === "object" && Array.isArray(v.waits));
  return ((d && d.waits) || []).filter((w) => w && w.subject && Number(w.sent || w.at) > now - days * 86400000)
    .map((w) => ({ ts: Number(w.sent || w.at), to: (Array.isArray(w.to) ? w.to : [w.to]).map(String), subject: String(w.subject), via: "agent", by: String((w.from && w.from.lane) || w.lane || "another agent"), path: String((w.from && w.from.path) || "") }))
    .sort((a, b) => b.ts - a.ts);
}
// For every brief: check before asking about an email, and what agents sent lately (to, subject, when, lane).
function sentBrief({ now = Date.now(), file, max = 8 } = {}) {
  const rows = agentSent({ now, days: 3, ...(file ? { file } : {}) }).slice(0, max);
  const when = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return ["## Emails already sent",
    "- Before you ask the user about sending an email, or call one unsent or a draft: read their Sent mail (the mail connector, or `symbiot screens` on its Sent page) for that person and thread since it was drafted, and check the list below for one another agent sent. If it has gone, don't ask and don't send it again: tell the user who sent it, to whom and when.",
    ...(rows.length ? ["- Sent by Symbiot's agents in the last 3 days:", ...rows.map((r) => `  - ${when(r.ts)}: ${r.by} sent "${r.subject.replace(/\s+/g, " ").slice(0, 120)}" to ${r.to.slice(0, 3).join(", ")}`)] : []),
    ""];
}
// From when a card's email may have gone: the first run of its job. An ops folder is one job (all its
// runs); a lane's folder, the run that said it. 08:33 was before the run that said "unsent" at 08:49.
async function jobStart(a) {
  const own = (a.startedAt || a.endedAt || Date.now()) - 60000;
  try {
    const { loadRunFiles } = await import("./agents.mjs");
    if (!String(a.path || "").startsWith(join(CONFIG_DIR, "drafts") + "/")) return own;
    return Math.min(own, ...loadRunFiles(a.path).map((r) => Number(r.startedAt) - 60000).filter((t) => t > 0));
  } catch { return own; }
}
// The "needs you" cards that say an email is unsent, from the runs Symbiot knows of.
async function unsentNeeds() {
  try {
    const { agentsNow } = await import("./agents.mjs"), out = [];
    for (const a of agentsNow()) { const what = a.needs && !a.needs.sent ? a.needs.claim || a.needs.what : ""; if (what && unsentClaim(what)) out.push({ path: a.path, what, since: await jobStart(a) }); }
    return out;
  } catch { return []; }
}

// One look: closes whatever the user has sent, and rechecks the cards that say an email is unsent.
// Cheap when no email task is open and no card says so.
async function sentTick({ load = loadTasks, rows = sentRows, now = Date.now(), needs = unsentNeeds, ...deps } = {}) {
  const open = (load() || []).filter((x) => x && !x.done && !x.archived && !x.sent && emailJob(x.full || x.text));
  const cards = await needs();
  if (!open.length && !cards.length) return [];
  let r = deps.read, w = deps.watches;
  if (!r) { try { r = (await import("./headless.mjs")).readPage; } catch {} }
  if (!w) { try { w = (await import("./watch.mjs")).watchState().watches; } catch { w = []; } }
  const got = await rows({ read: r, watches: w, now });
  if (cards.length) { const mine = (() => { try { return ((loadConfig() || {}).mail || {}).addresses || []; } catch { return []; } })(); settleUnsent(cards, [...(got || []), ...(deps.agentSent || agentSent)({ now })], { mine, now, ...(deps.sentFile ? { file: deps.sentFile } : {}) }); }
  return open.length ? settleSent(got, { load, now, ...(deps.save ? { save: deps.save } : {}) }) : [];
}

export { emailJob, sentMatch, settleSent, sentLine, sentUrls, sentRows, sentTick, unsentClaim, sentFor, sentAfter, settleUnsent, SENT_NEEDS, agentSent, sentBrief, jobStart };
