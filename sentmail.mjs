// symbiot — an email task the user already sent.
//
// "Draft an email from Garth to Cale Morris, cc Jono (…), about First Step" stays
// open until someone ticks it, but the user often sends the mail themselves. So an
// open email task is looked for in what they sent since it was made: the mail on
// this computer (mail.mjs) and Gmail's Sent page, read in the app's hidden browser.
// A match closes the task and keeps where it went (task.sent), so Home and the chat
// say "sent on <date>, waiting on reply" instead of listing it as work.
import { loadTasks, saveTasks, loadConfig } from "./core.mjs";
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
  // "… to Cale Morris, cc Jono (…)": the capitalised words after to / cc / bcc
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

// One look: closes whatever the user has sent. Cheap when no email task is open.
async function sentTick({ load = loadTasks, rows = sentRows, now = Date.now(), ...deps } = {}) {
  const open = (load() || []).filter((x) => x && !x.done && !x.archived && !x.sent && emailJob(x.full || x.text));
  if (!open.length) return [];
  let r = deps.read, w = deps.watches;
  if (!r) { try { r = (await import("./headless.mjs")).readPage; } catch {} }
  if (!w) { try { w = (await import("./watch.mjs")).watchState().watches; } catch { w = []; } }
  return settleSent(await rows({ read: r, watches: w, now }), { load, now, ...(deps.save ? { save: deps.save } : {}) });
}

export { emailJob, sentMatch, settleSent, sentLine, sentUrls, sentRows, sentTick };
