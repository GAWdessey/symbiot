// symbiot — Checks: where two of your files disagree. A knowledge folder (a
// company folder of Markdown and CSV) is read for the facts it states more than
// once, and every place two files say different things is a clash:
//
// - People: a dated commitment (a due date, a booking, a checklist line with a
//   name and a date, a log entry of someone doing something that day) that falls
//   on that person's leave, on a public holiday or office closure, or, for the
//   things a hybrid policy says belong on office days (all-hands, planning), on a
//   day nobody is in the office. Two meetings at the same time. Leave that runs
//   into an office closure; two files giving the same leave different dates.
// - Customers: the renewal date, price (annual value), users, plan, health or
//   account owner one file gives that another contradicts.
// - Records: the same ID (A-0920, LV-2026-213) with different dates or amounts
//   in two files. A weekday that doesn't match its date ("Monday 29 Sep" when
//   the 29th is a Tuesday); a working day that doesn't ("WD7, 9 Nov" when a
//   public holiday that month makes WD7 the 11th).
//
// Deterministic: no model is asked; dates in the common forms (2026-10-12,
// 12 Oct, Mon 12 October 2026, 5–9 Oct, 12 and 13 Oct, 12/10/2026 day first),
// CSV columns and Markdown tables by their header names, front matter, and
// "Owner:"-style lines. Examples (knowledge.mjs: templates/, `example: true`)
// are never used as facts. The last result is kept in ~/.config/symbiot/checks.json
// (yours only, like the index) for the app to show.
import { join, relative, extname, sep, basename } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, chmodSync, statSync } from "node:fs";
import { CONFIG_DIR } from "./core.mjs";
import { READ, MAX_BYTES, walk, cite, knowledgeFolders, isExample, frontMatter, csvRows } from "./knowledge.mjs";

const CHECKS_FILE = join(CONFIG_DIR, "checks.json");
const DAY = 86400000, MAX_CLASHES = 500;

// ---- dates -------------------------------------------------------------------------------
// Dates are "YYYY-MM-DD" strings: they sort, compare and print without time zones.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MON = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const WD = "(Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)";
const WDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], WDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n) => String(n).padStart(2, "0");
function ymd(y, m, d) { const t = Date.UTC(y, m - 1, d), x = new Date(t); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : ""; }
const ms = (iso) => Date.parse(iso + "T00:00:00Z");
const isoOf = (t) => new Date(t).toISOString().slice(0, 10);
const dow = (iso) => new Date(ms(iso)).getUTCDay();
const addDays = (iso, n) => isoOf(ms(iso) + n * DAY);
const wdIndex = (s) => WDAYS.findIndex((w) => s.slice(0, 3).toLowerCase() === w.toLowerCase());
// A date written without its year: the year that puts it nearest the day the
// folder is read (in October, "12 Feb" is next February and "29 Sep" last month).
function nearYear(m, d, ref) {
  const y = Number(ref.slice(0, 4)); let best = "", gap = Infinity;
  for (const yy of [y - 1, y, y + 1]) { const iso = ymd(yy, m, d); if (iso && Math.abs(ms(iso) - ms(ref)) < gap) { gap = Math.abs(ms(iso) - ms(ref)); best = iso; } }
  return best;
}
const dayOf = (y, m, d, ref) => (y ? ymd(Number(y), m, Number(d)) : nearYear(m, Number(d), ref));
const monthOf = (s) => MONTHS[s.slice(0, 3).toLowerCase()];
const fmt = (iso) => { const t = new Date(ms(iso)); return `${WDAYS[t.getUTCDay()]} ${t.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t.getUTCMonth()]} ${t.getUTCFullYear()}`; };
const fmtRange = (a, b) => (a === b ? fmt(a) : `${fmt(a)} to ${fmt(b)}`);

const RE_DM = new RegExp(`(?:\\b${WD},?\\s+)?\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\b\\.?(?:,?\\s+(\\d{4})\\b)?`, "g");
const RE_MD = new RegExp(`(?:\\b${WD},?\\s+)?\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![:\\d])(?:,?\\s+(\\d{4})\\b)?`, "g");
const RE_ISO = new RegExp(`(?:\\b${WD},?\\s+)?(?<![\\w-])(\\d{4})-(\\d{2})-(\\d{2})(?![\\w-]|-\\d)`, "g");
const RE_DMY = /(?<![\w/])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\w/])/g;
// The days before a "9 Oct" that share its month: "5–9 Oct" (a range), "12 and
// 13 Oct", "12, 21, 23 Oct" (a list), "Mon 28 – Thu 31 Dec".
const RE_BEFORE = new RegExp(`(?:\\b${WD},?\\s+)?(?<![\\w.:/-])(\\d{1,2})(?:st|nd|rd|th)?\\s*(–|—|-|to|until|till|and|&|,)\\s*$`);
const RANGE = /^(–|—|-|to|until|till)$/;

// Every date in a piece of text: [{ from, to, at, end, wd }] (wd: the weekday
// written next to it, to check it against the date). ref: the day the folder is
// read, for dates written without a year.
function parseDates(text, ref) {
  const s = String(text || ""), found = [];
  const take = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(s))) { const r = fn(m); if (r && r.from) found.push({ ...r, at: m.index, end: m.index + m[0].length }); } };
  take(RE_ISO, (m) => ({ from: ymd(+m[2], +m[3], +m[4]), wd: m[1] }));
  take(RE_DM, (m) => ({ from: dayOf(m[4], monthOf(m[3]), m[2], ref), wd: m[1], year: m[4], month: monthOf(m[3]) }));
  take(RE_MD, (m) => ({ from: dayOf(m[4], monthOf(m[2]), m[3], ref), wd: m[1] }));
  take(RE_DMY, (m) => (+m[2] <= 12 ? { from: ymd(+m[3], +m[2], +m[1]) } : null));
  // the earliest, then the longest, wins where two readings overlap
  found.sort((a, b) => a.at - b.at || b.end - a.end);
  const out = [];
  for (const d of found) { if (out.length && d.at < out[out.length - 1].end) continue; out.push({ ...d, to: d.from }); }
  // days before it in the same month: ranges and lists
  const all = [];
  for (const d of out) {
    let head = s.slice(Math.max(0, d.at - 40), d.at), extra = [], m;
    if (d.month) while ((m = head.match(RE_BEFORE))) {
      const day = d.year ? ymd(+d.year, d.month, +m[2]) : nearYear(d.month, +m[2], d.from);
      if (!day) break;
      extra.unshift({ from: day, wd: m[1], range: RANGE.test(m[3]), at: d.at - head.length + m.index });
      head = head.slice(0, m.index);
      if (RANGE.test(m[3])) break;
    }
    if (extra.length === 1 && extra[0].range && extra[0].from <= d.from) { all.push({ from: extra[0].from, to: d.from, wd: extra[0].wd, wdTo: d.wd, at: extra[0].at, end: d.end }); continue; }
    for (const e of extra) if (!e.range) all.push({ from: e.from, to: e.from, wd: e.wd, at: e.at, end: d.end, list: true });
    all.push({ from: d.from, to: d.to, wd: d.wd, at: d.at, end: d.end, list: extra.length > 0 });
  }
  // two dates joined by "–" or "to": a range across months ("28 Sep – 2 Oct")
  for (let i = 0; i + 1 < all.length; i++) {
    const a = all[i], b = all[i + 1];
    if (a.from === a.to && b.from === b.to && /^\s*(–|—|-|to|until|till)\s*$/.test(s.slice(a.end, b.at)) && b.from > a.from && ms(b.from) - ms(a.from) <= 62 * DAY) { all.splice(i, 2, { from: a.from, to: b.from, wd: a.wd, wdTo: b.wd, at: a.at, end: b.end }); }
  }
  return all;
}
// A time in a piece of text: "10:00", "09:30–10:30", "10:00 to 11:50" → minutes.
const RE_TIME = /(?<![\d:])([01]?\d|2[0-3])[:h]([0-5]\d)(?:\s*(?:–|—|-|to)\s*([01]?\d|2[0-3])[:h]([0-5]\d))?(?![\d:])/;
function timeOf(text) { const m = String(text || "").match(RE_TIME); if (!m) return null; const a = +m[1] * 60 + +m[2]; return { start: a, end: m[3] ? +m[3] * 60 + +m[4] : a + 30 }; }

// ---- reading the folder --------------------------------------------------------------------
const clean = (s) => String(s == null ? "" : s).replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
const normHead = (h) => clean(h).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
// A Markdown table's cells, and the rest of the file as lines.
const cells = (line) => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => clean(c));
function mdParts(body) {
  const lines = String(body).split(/\r?\n/), tables = [], text = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\|.*\|\s*$/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(lines[i]), rows = [], start = i + 1; i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push({ c: cells(lines[i]), line: i + 1 }), i++;
      tables.push({ head, rows, line: start }); i--; continue;
    }
    text.push({ t: lines[i], line: i + 1 });
  }
  return { tables, text };
}
// The files of a knowledge folder: [{ path, rel, root, ext, text, example }]. The
// same walk, file types and example rules as the index (knowledge.mjs).
function loadFiles(folders) {
  const out = [], seen = new Set();
  for (const f of folders) for (const abs of walk(f.path)) {
    const ext = extname(abs).toLowerCase(); if (!READ.has(ext) || seen.has(abs)) continue;
    let st; try { st = statSync(abs); } catch { continue; }
    if (st.size > MAX_BYTES) continue;
    seen.add(abs);
    let text = ""; try { text = readFileSync(abs, "utf8"); } catch { continue; }
    const rel = relative(f.path, abs).split(sep).join("/"), fm = ext === ".csv" ? { meta: null } : frontMatter(text);
    out.push({ path: abs, rel, root: f.path, ext, text, example: isExample(rel, f.examples || []) || !!(fm.meta && /^(true|yes|1)$/i.test(String(fm.meta.example || ""))) });
  }
  return out;
}
// One file as rows (CSV rows and Markdown table rows, each { h: headers, c: cells }),
// lines of text, and key: value pairs (front matter, two-column tables,
// "**Owner:** Grace" lines) with the file's title.
function partsOf(file) {
  const rows = [], lines = [], kv = [];
  if (file.ext === ".csv") {
    const [head, ...rs] = csvRows(String(file.text).replace(/^﻿/, ""));
    if (head) { const h = head.map(normHead); rs.forEach((r, i) => rows.push({ h, c: r.map(clean), line: i + 2, table: 0 })); }
    return { title: basename(file.rel), rows, lines, kv, meta: null };
  }
  const { meta, body } = frontMatter(file.text);
  if (meta) for (const [k, v] of Object.entries(meta)) { kv.push({ k: normHead(k), v: [].concat(v).join(", "), line: 1 }); if (/^(next_step|waiting_on)$/.test(k)) lines.push({ t: [].concat(v).join(", "), line: 1 }); }
  const { tables, text } = mdParts(body);
  tables.forEach((t, ti) => {
    const h = t.head.map(normHead);
    if (h.length === 2) { kv.push({ k: h[0], v: t.head[1], line: t.line }); for (const r of t.rows) kv.push({ k: normHead(r.c[0]), v: r.c[1] || "", line: r.line }); }
    for (const r of t.rows) rows.push({ h, c: r.c, line: r.line, table: ti + 1 });
  });
  for (const l of text) {
    // "**Owner:** Grace · **Renewal date:** 31 Dec 2026", "Owner: Grace"
    for (const seg of l.t.split(/\s+·\s+|\s+\|\s+/)) { const m = seg.match(/^\s*(?:[-*]\s+)?\*\*([^*:]{2,40}):?\*\*:?\s*(.+)$/) || seg.match(/^\s*([A-Z][A-Za-z ]{1,30}):\s+(.+)$/); if (m) kv.push({ k: normHead(m[1]), v: clean(m[2]), line: l.line }); }
    if (l.t.trim()) lines.push({ t: l.t, line: l.line });
  }
  const title = clean((meta && (meta.item || meta.title)) || (String(body).match(/^#\s+(.+)$/m) || [])[1] || basename(file.rel));
  return { title, rows, lines, kv, meta };
}

// ---- who's who: people and customers --------------------------------------------------------
const PERSON_COL = /\b(owner|employee|person|traveller|attendees?|assigned( to)?|assignee|caller|host|presenter|chair|facilitator|on duty|standby|primary|backup|taken over by|release manager|account executive|assigned ae|sdr|writer|designer|subject expert|who|lead|new user|read by|done by|counted by|raised by|reported by|logged by|checked by|approved by|prepared by|requester|requested by|reviewer|action owner|follow up owner|success contact|kestrel contact|people|waiting on|incident lead)\b/;
// The person columns that say who does a thing on the row's date (raised by,
// approved by say who did something else, earlier).
const DOER_COL = /\b(owner|employee|traveller|attendees?|assigned( to)?|assignee|caller|host|presenter|chair|facilitator|on duty|standby|primary|backup|taken over by|release manager|assigned ae|sdr|writer|designer|who|lead|new user|read by|done by|counted by|action owner|follow up owner)\b/;
const NOT_DOER_COL = /\b(business owner|internal owner|kestrel owner|account owner|relationship owner|policy owner|owner \(signs off\)|line manager|lead id|lead time)\b/;
const WHEN_COL = /\b(date|dates|due|deadline|planned|booked|scheduled|publish|post date|call( 1)? date|meeting date|when|target|by|travel dates|go live|time or deadline|filming|day|weekend)\b/;
const NOT_WHEN_COL = /\b(booked on|raised|logged|applied|created|closed|signed|received|approved|submitted|resolved|sent|last|since|purchase|acknowledged|captured|first response|done on|fixed on|completed|reported|opened|start date|end date|renewal|contract|expiry|expires|valid|warranty|replacement|dispatched|delivery|invoice|issue date|bought|effective|discovered|contained|added|reviewed|checked|updated|identified|filing|registration|birth|joined|ends|period|window|notice|scan|customer since|actual|as at|disclosure|confidentiality|response|week commencing|wc)\b/;
const NAME_TOKEN = "[A-Z](?:[a-z]+|'[A-Z][a-z]+)(?:-[A-Z][a-z]+)?";
const RE_FULLNAME = new RegExp(`^${NAME_TOKEN}(?: (?:(?:van|der|de|du|le|la|von|da|ten|ter) )*${NAME_TOKEN}){1,2}$`);
const NOT_FIRST = new Set("The A An All Any Each Every No Not New Old Our Their Your This That Head Team Finance Sales Marketing Legal Product Engineering Support Customer Customers Operations Admin Leadership Board Account Accounts Office IT HR CEO CFO Kestrel FieldFlow Google Microsoft Volunteer Business Starter Enterprise Payroll Company Staff Ops Security Human Field Project Projects Internal External Senior Junior Line Monthly Weekly Annual Public Year Q1 Q2 Q3 Q4 Mon Tue Wed Thu Fri Sat Sun Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Done Open Late Waiting Blocked Pending Approved Draft Planned Booked Sent Cape South North East West Mzansi Highveld Bayside Coastal Boland Ndlovu".split(" "));
// Names from a person cell: "Zanele (Kabelo on leave until 12 Oct)" is Zanele;
// "Fatima Adams; Megan Fourie" is two.
const namesIn = (cell) => clean(String(cell).replace(/\([^)]*\)/g, " ")).split(/\s*(?:[;,/&+]|\band\b|\bwith\b|\bor\b)\s*/).map((x) => x.replace(/[.:]+$/, "").trim()).filter(Boolean);
function peopleOf(parts) {
  const full = new Map(); // name → times seen
  const add = (n) => { n = n.replace(/'s$/, ""); if (RE_FULLNAME.test(n) && !NOT_FIRST.has(n.split(" ")[0]) && !NOT_FIRST.has(n.split(" ").slice(-1)[0])) full.set(n, (full.get(n) || 0) + 1); };
  for (const p of parts) {
    for (const r of p.rows) r.h.forEach((h, i) => { if (PERSON_COL.test(h) && r.c[i]) namesIn(r.c[i]).forEach(add); });
    for (const kv of p.kv) if (PERSON_COL.test(kv.k)) namesIn(kv.v).forEach(add);
  }
  // a first name stands for the one person who has it ("Megan" is Megan Fourie)
  const firsts = new Map();
  for (const n of full.keys()) { const f = n.split(" ")[0]; firsts.set(f, firsts.has(f) && firsts.get(f) !== n ? null : n); }
  const alias = new Map([...full.keys()].map((n) => [n, n]));
  for (const [f, n] of firsts) if (n && f.length >= 3 && !alias.has(f)) alias.set(f, n);
  const keys = [...alias.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = keys.length ? new RegExp(`(?<![\\p{L}'’])(${keys.join("|")})(?:['’]s)?(?![\\p{L}])`, "gu") : null;
  return { names: [...full.keys()], alias, re };
}
// Every person a piece of text names, in order: [{ name, at }].
function peopleIn(text, P) { if (!P.re) return []; const out = []; P.re.lastIndex = 0; let m; while ((m = P.re.exec(text))) out.push({ name: P.alias.get(m[1]), at: m.index }); return out; }

const CUSTOMER_COL = /^(customer|customer name|company|client|account|account name|counterparty|deal or account)$/;
const LEGAL = /\b(\(pty\)|pty|ltd|limited|inc|cc|llc|plc|\(owner\)|group|holdings|services|and|the|&)\b/g;
const custWords = (n) => clean(String(n).replace(/\([^)]*\)/g, " ")).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(LEGAL, " ").split(/\s+/).filter(Boolean);
// One name per customer: its first word when no other customer starts with it
// ("Bayside"), else its first two ("Coastal Aircon").
function customersOf(parts) {
  const names = new Map();
  for (const p of parts) for (const r of p.rows) r.h.forEach((h, i) => { if (CUSTOMER_COL.test(h) && r.c[i] && !/[;\n]/.test(r.c[i]) && custWords(r.c[i]).length) { const n = clean(r.c[i]).replace(/\s*\([^)]*\)\s*/g, " ").trim(); names.set(n, (names.get(n) || 0) + 1); } });
  const firsts = new Map();
  for (const n of names.keys()) { const w = custWords(n); firsts.set(w[0], (firsts.get(w[0]) || new Set()).add(w.slice(0, 2).join(" "))); }
  const keyOf = (n) => { const w = custWords(n); if (!w.length) return ""; return firsts.has(w[0]) && firsts.get(w[0]).size > 1 ? w.slice(0, 2).join(" ") : w[0]; };
  const display = new Map();
  // shown by the name the files use most ("Bayside Plumbing Services", not "… (Pty) Ltd")
  for (const [n, c] of names) { const k = keyOf(n), cur = display.get(k); if (k && (!cur || c > names.get(cur) || c === names.get(cur) && n.length < cur.length)) display.set(k, n); }
  return { keyOf, display };
}

// ---- facts -----------------------------------------------------------------------------------
const LEAVE_WORDS = /\b(on (?:(?:annual|sick|study|unpaid|family responsibility|maternity|paternity|parental) )?leave|(?:annual|sick|study|unpaid|family responsibility|maternity|paternity|parental) leave|off sick|leave form|leave request|leave for|leave on|leave from|away)\b/i;
const LEAVE_TYPE = /\b(annual|sick|study|unpaid|family responsibility|maternity|paternity|parental|compassionate)\b/i;
const MENTIONS_LEAVE = /\b(leave|sick|away|off|absent|back (?:on|from)|holiday|shutdown|closed)\b/i;
// Something you attend, not a thing you did at 11:05.
const MEETING = /\b(call|meeting|sync|review|triage|training|workshop|interview|demo|webinar|kick-?off|visit|session|hearing|stand-?up|1:1|one-to-one|go-live|course|presentation|briefing|check-in|QBR|drill|Q&A|planning|sign-off meeting|walkthrough)\b/i;
const AWAY =/\b(trip|travel(?:s|ling)?|flight|fly(?:ing)? to|on-?site|site visit|expo|conference|course|offsite|away day|go-live on site|in (?:Midrand|Pretoria|Johannesburg|Durban|Gqeberha|Paarl|Pietermaritzburg))\b/i;
const COVER =/\b(cover(?:s|ing|ed)?|instead|while|in (?:her|his|their) place|stand(?:s|ing)? in)\b/i;
const CUSTOMER_FIELDS = [
  ["renewal", /\b(renewal date|contract end|end date|renews|renewal|expiry|end or renewal date)\b/, /\b(window|notice|opens|deadline|reminder|call|action|risk|status|readiness|term|months)\b/],
  ["price", /\b(arr|annual value|annual fee|mrr|monthly fee|monthly cost|october fee|customer arr)\b/, /\b(upsell|est|weighted|services|option|credit|prepay|at risk|target|change|new|net|pipeline|incl)\b/],
  ["users", /\b(users|seats|licences|licenses)\b/, /\b(est|field staff|band|expected|active|assigned|purchased|before|after)\b/],
  ["plan", /^(plan|customer plan|tier)$/, null],
  ["health", /^(health|health status|rag)$/, null],
  ["owner", /^(account owner|account manager|relationship owner)$/, null],
];
const num = (s) => { const m = String(s).replace(/\s/g, "").match(/^R?(-?[\d,]+(?:\.\d+)?)$/); return m ? Number(m[1].replace(/,/g, "")) : NaN; };
// A customer field's value as compared: one date, one amount a year, one count,
// one word (a plan, a colour), or a person.
function fieldValue(field, raw, head, ref, P) {
  const v = clean(raw); if (!v || /^(n\/?a|none|tbc|tbd|-|—|unknown)$/i.test(v)) return null;
  if (field === "renewal") { if (/^(monthly|month[- ]to[- ]month|rolling|evergreen)\b/i.test(v)) return { v: "monthly", show: "month to month" }; const d = parseDates(v, ref); return d.length === 1 ? { v: d[0].from, show: fmt(d[0].from) } : null; }
  if (field === "price") { const n = num(v); if (!(n > 0)) return null; const a = /\b(mrr|monthly|october fee)\b/.test(head) ? n * 12 : n; return { v: Math.round(a), show: "R" + Math.round(a).toLocaleString("en-ZA").replace(/ /g, " ") + " a year" }; }
  if (field === "users") { const n = /^\d[\d ,]*$/.test(v) ? num(v) : NaN; return Number.isInteger(n) && n > 0 && n < 100000 ? { v: n, show: n + " users" } : null; }
  if (field === "plan" && P.plans && P.plans.size) { const w = (v.match(/[A-Za-z]+/g) || []).find((x) => P.plans.has(x.toLowerCase())); return w ? { v: w.toLowerCase(), show: w } : null; }
  if (field === "plan" || field === "health") { const w = (v.match(/^[A-Za-z]+/) || [""])[0]; return w ? { v: w.toLowerCase(), show: w } : null; }
  if (field === "owner") { const p = peopleIn(v.replace(/\([^)]*\)/g, " "), P); return p.length ? { v: p[0].name, show: p[0].name } : null; }
  return null;
}
const sentences = (t) => String(t).split(/(?<=[.!?;])\s+(?=[A-Z(*])|\s+[–—]\s+(?=[A-Z])/);
const ID = /^[A-Z]{1,6}(?:-[A-Z0-9]{1,6})*-\d{2,}[a-z]?$/;
// A record's facts worth comparing: its dates and amounts. (Its status moves on
// between a register and a working copy, and is worded differently in each.)
const RECORD_ID = /^[A-Z]{1,6}(?:-[A-Z0-9]{1,6})*-\d{3,}[a-z]?$/;
const FACT_COL = /\b(date|due|from|to|start|end|users|amount|value|arr|rand|days|total|term)\b/;
const NOT_FACT_COL = /\b(note|notes|comment|update|next|reason|summary|description|action|detail|why|what|lesson|text|title|item|task|subject|purpose|proposed|status|raised|logged|applied|opened|received)\b/;

// What a folder's files state: people's dated commitments, leave, holidays,
// office days, customers' facts, and records by ID. Example files are skipped.
// files: [{ path, rel, text, ext?, example? }] (runChecks reads them).
function extractFacts(files, { now = Date.now() } = {}) {
  const ref = isoOf(typeof now === "number" ? now : Date.parse(now));
  const real = files.filter((f) => !f.example).map((f) => ({ ...f, ext: f.ext || extname(f.path || f.rel).toLowerCase(), rel: f.rel || f.path, path: f.path || f.rel }));
  const parts = real.map((f) => ({ f, ...partsOf(f) }));
  const P = peopleOf(parts), C = customersOf(parts);
  const commitments = [], leave = [], holidays = [], customers = [], records = [], weekdays = [], officeRules = [], wdLabels = [];
  const fileOf = (p) => p.f.path;
  // the plans customers are on, as the registers name them (so "FieldFlow Business" is Business)
  const plans = new Set(); for (const p of parts) if (p.f.ext === ".csv") for (const r of p.rows) r.h.forEach((h, i) => { if (/^(plan|customer plan|tier)$/.test(h) && r.c[i]) plans.add((r.c[i].match(/^[A-Za-z]+/) || [""])[0].toLowerCase()); });
  P.plans = plans;

  for (const p of parts) {
    const file = fileOf(p), isLeaveFile = /leave/i.test(p.f.rel);
    // ---- rows: CSV and Markdown tables ----
    for (const r of p.rows) {
      const get = (re, not) => r.h.findIndex((h) => re.test(h) && !(not && not.test(h)));
      const rowText = r.c.join(" · ");
      const what = whatOf(r, ref);
      // leave: a person, a first and a last day, in a leave register
      const iP = get(/\b(employee|name|staff|person)\b/), iF = get(/^(from|start|first day|leave from|date from|start date)$/), iT = get(/^(to|end|until|last day|leave to|date to|end date)$/), iTy = get(/\b(leave type|type)\b/);
      if (iP >= 0 && iF >= 0 && iT >= 0 && (isLeaveFile || iTy >= 0 && /leave|sick|annual|study/i.test(r.c[iTy] || ""))) {
        const who = peopleIn(r.c[iP], P)[0], a = parseDates(r.c[iF], ref)[0], b = parseDates(r.c[iT], ref)[0], type = iTy >= 0 ? r.c[iTy] : "leave", status = r.c[get(/^status$/)] || "", days = num(r.c[get(/\b(working days|days)\b/)] || "");
        if (who && a && b && b.from >= a.from && !/\b(pay|payout|encash|termination)\b/i.test(type) && !/\b(declin|reject|cancel|withdrawn)/i.test(status))
          leave.push({ person: who.name, from: a.from, to: b.from, type: clean(type).toLowerCase(), status, days: isNaN(days) ? null : days, file, line: r.line });
        continue;
      }
      // a working day written next to its date: "WD2" in one column, 2026-10-02 in another
      const iW = r.c.findIndex((x) => /^WD ?\d{1,2}$/i.test(x)), iDue = get(/\b(due|date)\b/);
      if (iW >= 0 && iDue >= 0 && iDue !== iW) { const d = parseDates(r.c[iDue], ref); if (d.length === 1) wdLabels.push({ n: +r.c[iW].replace(/\D/g, ""), date: d[0].from, text: `${r.c[iW]}, ${r.c[iDue]}`, file, line: r.line }); }
      // a holiday: a row of a table of holidays ("Date | Day | Holiday"), or a
      // calendar row whose category is "Public holiday"
      const iH = get(/\b(holiday|public holiday)\b/), iD = get(/^(date|dates)$/), iK = get(/\b(category|type|kind)\b/);
      if (iD >= 0 && (iH >= 0 || iK >= 0 && /^public holiday/i.test(r.c[iK] || ""))) {
        const d = parseDates(r.c[iD], ref)[0];
        if (d && !/\bno\b[^.]{0,20}\bholiday\b/i.test(r.c[iH] || "")) holidays.push({ date: d.from, name: clean(iH >= 0 ? r.c[iH] : what), file, line: r.line });
        continue;
      }
      // a holiday named in a cell: "Extra public holiday: Wednesday 4 November"
      r.c.forEach((x, i) => { if (!/date/.test(r.h[i] || "")) for (const h of holidaysIn(x, ref)) holidays.push({ ...h, file, line: r.line }); });
      // a customer's facts
      // (not a deal, a draft contract or a totals row: those aren't the account's facts yet)
      const iC = get(CUSTOMER_COL), iS = get(/^(status|stage)\b/), iDT = get(/^(type|deal type|kind)$/);
      if (iC >= 0 && r.c[iC] && !/[;\n]/.test(r.c[iC]) && !(iDT >= 0 && /^(expansion|upsell|upgrade|new|new business|new logo|renewal|cross-sell|downgrade)\b/i.test(r.c[iDT] || "")) &&!r.h.some((h) => /^(deal|deal id|stage|stage \d.*|probability|probability pct|weighted arr|opportunity|expected close)$/.test(h)) && !/^(total|sub ?total|grand total|sum)\b/i.test(r.c[iC]) && !(iS >= 0 && /\b(draft|proposed|negotiat|pending|for signature|not signed|quote|lost|prospect)/i.test(r.c[iS] || ""))) {
        const key = C.keyOf(r.c[iC]);
        const register = r.h.filter((h) => CUSTOMER_FIELDS.slice(0, 5).some(([, re, not]) => re.test(h) && !(not && not.test(h)))).length >= 2;
        if (key) for (const [field, re, not] of CUSTOMER_FIELDS) {
          if (field === "owner" && !register) continue;
          const i = get(re, not); if (i < 0) continue;
          const val = fieldValue(field, r.c[i], r.h[i], ref, P); if (val) customers.push({ customer: C.display.get(key) || r.c[iC], key, field, value: val.v, show: val.show, file, line: r.line, col: r.h[i] });
        }
      }
      // "Named account owner (Priya Naidoo)" in a cell about one customer
      const rowCust = customerIn(rowText, C);
      r.c.forEach((x) => { for (const o of ownersIn(x, C, P, rowCust)) customers.push({ ...o, customer: C.display.get(o.key), file, line: r.line }); });
      // a record by its ID: its dated, numbered and short facts
      if (r.c[0] && RECORD_ID.test(r.c[0])) {
        const facts = {};
        r.h.forEach((h, i) => { if (i && FACT_COL.test(h) && !NOT_FACT_COL.test(h) && r.c[i]) facts[h] = r.c[i]; });
        records.push({ id: r.c[0], facts, file, line: r.line, what });
      }
      // commitments: a person who does something on a date
      const doers = []; r.h.forEach((h, i) => { if (DOER_COL.test(h) && !NOT_DOER_COL.test(h) && r.c[i] && !COVER.test(r.c[i])) for (const x of peopleIn(clean(r.c[i].replace(/\([^)]*\)/g, " ")), P)) doers.push(x.name); });
      if (!doers.length || LEAVE_WORDS.test(rowText) && !r.h.some((h) => /due|deadline/.test(h))) continue;
      const time = timeOf(r.c[r.h.findIndex((h) => /\btime\b/.test(h))] || "") || null;
      r.h.forEach((h, i) => {
        if (!WHEN_COL.test(h) || NOT_WHEN_COL.test(h) || !r.c[i]) return;
        const ds = parseDates(r.c[i], ref); if (ds.length !== 1 || ds[0].to !== ds[0].from && ms(ds[0].to) - ms(ds[0].from) > 14 * DAY) return;
        for (const name of new Set(doers)) for (let d = ds[0].from; d <= ds[0].to; d = addDays(d, 1)) commitments.push({ person: name, date: d, what: clip(what), file, line: r.line, time: timeOf(r.c[i]) || time, due: /due|deadline|by|target/.test(h), src: "row", about: iC >= 0 && r.c[iC] ? C.keyOf(r.c[iC]) : "" });
      });
    }
    // ---- front matter: an item's owner and due date ----
    if (p.meta && p.meta.owner && p.meta.due && !/^(done|closed|complete|completed|cancelled)$/i.test(String(p.meta.status || ""))) {
      const d = parseDates(p.meta.due, ref)[0], who = peopleIn(String(p.meta.owner), P)[0];
      if (d && who) commitments.push({ person: who.name, date: d.from, what: clip(p.title), file, line: 1, due: true, src: "item" });
    }
    // an item's next step at a set time is its owner's: "Discovery call with Riaan Smit, Wed 7 Oct 10:00"
    if (p.meta && p.meta.owner && p.meta.next_step) for (const s of String(p.meta.next_step).split(/;\s*/)) {
      const ds = parseDates(s, ref), tm = timeOf(s), who = peopleIn(String(p.meta.owner), P)[0], others = peopleIn(s, P).filter((x) => !who || x.name !== who.name);
      if (who && ds.length === 1 && tm && !others.length) commitments.push({ person: who.name, date: ds[0].from, what: clip(s), file, line: 1, time: tm, src: "meeting" });
    }
    // a trip or a course in an item's title: "QBR trip to Midrand, Thu 19 Nov 2026 (Ryan Pillay, Priya Naidoo)"
    if (AWAY.test(p.title)) { const ds = parseDates(p.title, ref); if (ds.length === 1 && ms(ds[0].to) - ms(ds[0].from) <= 7 * DAY) for (const x of peopleIn(p.title, P)) for (let d = ds[0].from; d <= ds[0].to; d = addDays(d, 1)) commitments.push({ person: x.name, date: d, what: clip(p.title), file, line: 1, time: { start: 0, end: 24 * 60, allDay: true }, src: "meeting", about: customerIn(p.title, C) }); }
    // ---- a meeting's file: its date (a "Date:" line, or a title like "Bug triage,
    // Tuesday 6 October (09:30)") and who is in it when: Chair, Attendees, and an
    // agenda's "09:20 | … | Themba Zulu" rows
    const dateKv = p.kv.find((k) => /^(date|meeting date|date and time|when|date and venue|call|meeting|session)$/.test(k.k) && parseDates(k.v, ref).length === 1);
    const titleD = parseDates(p.title, ref), titleT = timeOf(p.title);
    const meet = dateKv ? { date: parseDates(dateKv.v, ref)[0].from, time: timeOf(dateKv.v) } : titleD.length === 1 && titleT ? { date: titleD[0].from, time: titleT } : null;
    if (meet) {
      const names = new Set();
      for (const k of p.kv) if (/\b(chair|attendees|facilitator|host|presenter|organiser|organizer|participants|present|owner|people)\b/.test(k.k)) for (const x of peopleIn(k.v.replace(/\([^)]*\)/g, " "), P)) names.add(x.name);
      if (meet.time) for (const n of names) commitments.push({ person: n, date: meet.date, what: clip(p.title), file, line: 1, time: meet.time, src: "meeting" });
      for (const r of p.rows) {
        const iTm = r.h.findIndex((h) => /^(time|start|when|slot)$/.test(h)), tm = iTm >= 0 ? timeOf(r.c[iTm]) : null; if (!tm || r.c.some((x, i) => i !== iTm && /\b(date|day|dates)\b/.test(r.h[i]) && parseDates(x, ref).length)) continue;
        const who = new Set(); r.h.forEach((h, i) => { if (/\b(owner|lead|who|presenter|by|led by|speaker)\b/.test(h) && r.c[i]) for (const x of peopleIn(r.c[i].replace(/\([^)]*\)/g, " "), P)) who.add(x.name); });
        for (const n of who) commitments.push({ person: n, date: meet.date, what: clip(whatOf(r, ref)), ctx: p.title, file, line: r.line, time: tm, src: "agenda" });
      }
    }
    // ---- key: value lines: a customer's facts when the file is about one ----
    const subject = customerIn(p.title, C) || customerIn(p.kv.filter((k) => /^(customer|account|client)$/.test(k.k)).map((k) => k.v).join(" "), C);
    if (subject) for (const kv of p.kv) for (const [field, re, not] of CUSTOMER_FIELDS) {
      if (!re.test(kv.k) || not && not.test(kv.k) || field === "price" && !/\barr\b|annual/.test(kv.k)) continue;
      const val = fieldValue(field, kv.v, kv.k, ref, P); if (val) customers.push({ customer: C.display.get(subject) || subject, key: subject, field, value: val.v, show: val.show, file, line: kv.line, col: kv.k });
    }
    // ---- lines of text ----
    for (const l of p.lines) {
      const t = clean(l.t);
      // the weekday written next to a date
      for (const d of parseDates(l.t, ref)) {
        if (d.wd && wdIndex(d.wd) !== dow(d.from)) weekdays.push({ text: `${d.wd} ${fmt(d.from).replace(/^\w+ /, "")}`, wrote: d.wd, date: d.from, file, line: l.line });
        if (d.wdTo && wdIndex(d.wdTo) !== dow(d.to)) weekdays.push({ text: `${d.wdTo} ${fmt(d.to).replace(/^\w+ /, "")}`, wrote: d.wdTo, date: d.to, file, line: l.line });
      }
      // office days: "Anchor days are Tuesday and Thursday", "in the office on Tuesdays and Thursdays"
      const od = t.match(new RegExp(`\\b(?:anchor days?|office days?|(?:everyone|all staff|staff) (?:is |are |work )?(?:in|from) (?:the office )?on)\\b[^.]{0,30}?\\b(?:are |is |on |: ?)?(${WD}s?(?:\\s*(?:,|and|&|/)\\s*${WD}s?)+)`, "i"));
      if (od && !/\bweek ?1\b|\bfirst week\b|\bher\b|\bhis\b/i.test(t)) officeRules.push({ days: [...new Set((od[1].match(new RegExp(WD, "g")) || []).map(wdIndex))].sort(), file, line: l.line, text: clip(t) });
      for (const h of holidaysIn(t, ref)) holidays.push({ ...h, file, line: l.line });
      for (const o of ownersIn(t, C, P)) customers.push({ ...o, customer: C.display.get(o.key), file, line: l.line });
      // a working day and its date: "WD7, 9 Nov", "working day 4 (Tuesday 6 October)"
      for (const m of t.matchAll(/\b(?:WD|working day)\s?(\d{1,2})\b[\s,:(]*/gi)) {
        const d = parseDates(t.slice(m.index + m[0].length, m.index + m[0].length + 40), ref)[0];
        if (d && d.at === 0 && d.from === d.to) wdLabels.push({ n: +m[1], date: d.from, text: clip(t.slice(m.index, m.index + m[0].length + d.end), 40), file, line: l.line });
      }
      for (const s of sentences(t)) {
        // closures: "office closed from 24 Dec to 1 Jan", "closes after 23 December and reopens on 4 January"
        const cl = s.match(/\b(?:office|company|we)\b[^.]{0,20}\bclos(?:es|ed)\b/i);
        if (cl) {
          const ds = parseDates(s, ref);
          if (/\bclos(?:es|ed) after\b/i.test(s) && /\breopens?\b/i.test(s) && ds.length >= 2) { for (let d = addDays(ds[0].from, 1); d < ds[ds.length - 1].from; d = addDays(d, 1)) holidays.push({ date: d, name: "office closed", closure: true, file, line: l.line }); }
          else if (ds.length === 1 && ds[0].to > ds[0].from) for (let d = ds[0].from; d <= ds[0].to; d = addDays(d, 1)) holidays.push({ date: d, name: "office closed", closure: true, file, line: l.line });
        }
        // leave in a sentence: "Lwazi was on study leave on 1–2 October"
        const lw = s.match(LEAVE_WORDS);
        if (lw && !/\buntil\b|\bback\b|\bbefore\b|\bafter\b|\bpay\b|\bbalance\b|\bapplied\b|\brequest(?:ed)?\b|\bform\b/i.test(s) && /leave|sick/i.test(lw[0])) {
          // the dates right after the leave words: "on sick leave 5–6 Oct", "study leave on 1–2 October"
          const who = peopleIn(s, P).filter((x) => x.at < lw.index).pop(), tail = s.slice(lw.index + lw[0].length), ds = parseDates(tail, ref);
          if (who && ds.length && ds[0].at <= 12 && !/[,;]/.test(tail.slice(0, ds[0].at))) {
            const from = ds[0].from, to = ds.filter((d) => d.list || d === ds[0]).reduce((m, d) => (d.to > m ? d.to : m), ds[0].to);
            if (ms(to) - ms(from) <= 31 * DAY) leave.push({ person: who.name, from, to, type: (s.match(LEAVE_TYPE) || ["leave"])[0].toLowerCase(), status: "", file, line: l.line, prose: true });
          }
        }
      }
      // commitments in a line: "(Megan, 12 Oct)", a log "- 2026-10-05 Sipho: …",
      // or a clause naming one person and one date
      if (LEAVE_WORDS.test(t) && !/\(([^()]*)\)/.test(t)) continue;
      const log = t.match(/^[-*]\s*(\d{4}-\d{2}-\d{2})\s+([^:]{2,60}):\s*(.*)$/);
      if (log) {
        const who = peopleIn(log[2].replace(/\([^)]*\)/g, " "), P)[0];
        if (who && !LEAVE_WORDS.test(log[2])) commitments.push({ person: who.name, date: log[1], what: clip(log[3]), file, line: l.line, time: timeOf(log[3]), src: "log" });
        continue;
      }
      let used = false;
      for (const m of t.matchAll(/\(([^()]*)\)/g)) {
        const inner = m[1], who = peopleIn(inner, P), ds = parseDates(inner, ref);
        if (!who.length || ds.length !== 1 || who[0].at > ds[0].at || LEAVE_WORDS.test(inner) || COVER.test(inner)) continue;
        const what = clean(t.slice(0, m.index).replace(/^[-*]\s*(\[[ xX]\]\s*)?/, "")) || t;
        for (let d = ds[0].from; d <= ds[0].to && ms(ds[0].to) - ms(ds[0].from) <= 14 * DAY; d = addDays(d, 1)) commitments.push({ person: who[0].name, date: d, what: clip(what), file, line: l.line, time: timeOf(inner), due: /\bby\b/.test(inner), src: "paren" });
        used = true;
      }
      if (used) continue;
      for (const s of t.split(/(?<=[.!?;])\s+|\s+·\s+/)) {
        const who = peopleIn(s, P), ds = parseDates(s, ref);
        // "Megan tests the form on Thu 8 Oct": one person, one date, the date said as when ("on", "by")
        if (new Set(who.map((x) => x.name)).size !== 1 || ds.length !== 1 || ds[0].from !== ds[0].to || MENTIONS_LEAVE.test(s) || COVER.test(s) || !/\b(on|by|at|for|due|until|before)\s+$/i.test(s.slice(0, ds[0].at))) continue;
        commitments.push({ person: who[0].name, date: ds[0].from, what: clip(s), file, line: l.line, time: timeOf(s), src: "text" });
      }
    }
  }
  // a trip, a course, an expo or a day on site takes the whole day
  for (const c of commitments) if (!c.time && !c.due && c.src === "row" && AWAY.test(c.what) && !/\b(request|follow[- ]up|book(?:ing)?|claim|policy|report|invoice|quote|find)\b/i.test(c.what)) c.time = { start: 0, end: 24 * 60, allDay: true };
  // what each is about, by the customer it names, to tell one thing told twice from two things
  for (const c of commitments) if (!c.about) c.about = customerIn(c.what, C);
  // the office days: the rule most files state
  const tally = new Map(); for (const r of officeRules) { const k = r.days.join(","); tally.set(k, (tally.get(k) || 0) + 1); }
  const top = [...tally].sort((a, b) => b[1] - a[1])[0];
  const officeDays = top ? { days: top[0].split(",").map(Number).map((i) => WDAY_NAMES[i]), kinds: ["all-hands", "team planning"], file: officeRules.find((r) => r.days.join(",") === top[0]).file, rules: officeRules } : null;
  return { commitments, customers, leave, holidays, officeDays, events: eventsOf(real, ref), records, weekdays, wdLabels, people: P.names, ref };
}
// A customer's account owner named in a sentence about that one customer:
// "Sales account owner: Jacques Botha", "Naledi Khumalo (account owner)".
function ownersIn(text, C, P, about = "") {
  const out = [];
  for (const s of sentences(clean(text))) {
    if (!/account owner/i.test(s)) continue;
    const key = customerIn(s, C) || about; if (!key) continue;
    const m = s.match(/account owner\b\s*(?:\(|:|is|was|-|–)?\s*([^,;)]{3,40})/i), b = s.match(/([^,;(]{3,40}?)\s*\((?:the )?account owner\)/i);
    const who = (m && peopleIn(m[1], P)[0]) || (b && peopleIn(b[1], P).pop());
    if (who) out.push({ key, field: "owner", value: who.name, show: who.name, col: "account owner" });
  }
  return out;
}
// What a row is about: its action, task or title column, else its first wordy cell.
const WHAT_COL = /\b(action|task|item|title|entry|event|training|milestone|what|summary|description|key result|paper|request|next step|step|point|issue|topic|deliverable|change|agenda item|purpose)\b/;
const wordy = (x, ref) => x && !ID.test(x) && !/^[\d\s.,R%:-]+$/.test(x) && !(parseDates(x, ref).length && x.length < 25) && x.length > 3;
const whatOf = (r, ref) => r.c.find((x, i) => WHAT_COL.test(r.h[i] || "") && wordy(x, ref)) || r.c.find((x) => wordy(x, ref) && !timeOf(x)) || "";
// Public holidays a sentence names, with the date right next to the word:
// "4 Nov is a declared holiday", "Extra public holiday: Wednesday 4 November".
// Not "no Monday holiday on 28 Dec", not "the Friday after a public holiday".
const HOL_AFTER = /^\s*(?:\([^)]*\)\s*)?(?:,\s*)?(?:is|was|will be|becomes|has been)?\s*(?:now\s+)?(?:a|an)?\s*(?:declared|extra|additional|new|special)?\s*(?:public|national|statutory)\s+holiday\b|^\s*(?:\([^)]*\)\s*)?(?:is|was) (?:a )?(?:declared )?holiday\b/i;
const HOL_BEFORE = /\b(?:public|national|statutory) holiday(?: on)?\s*[:(]?\s*$/i;
function holidaysIn(text, ref) {
  const s = clean(text), out = [];
  if (!/holiday/i.test(s)) return out;
  for (const d of parseDates(s, ref)) {
    if (d.from !== d.to) continue;
    const before = s.slice(Math.max(0, d.at - 40), d.at), after = s.slice(d.end, d.end + 60);
    if (!HOL_AFTER.test(after) && !HOL_BEFORE.test(before)) continue;
    if (/\b(no|not|isn't|after|before|around|near)\b[^.]{0,15}$/i.test(before.replace(HOL_BEFORE, ""))) continue;
    out.push({ date: d.from, name: clip(s.slice(Math.max(0, d.at - 40), d.end + 50), 80) });
  }
  return out;
}
const clip = (s, n = 140) => { s = clean(s); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
function customerIn(text, C) {
  const w = custWords(text); if (!w.length) return "";
  const keys = new Set(); for (let i = 0; i < w.length; i++) for (const k of [w[i], w.slice(i, i + 2).join(" ")]) if (C.display.has(k)) keys.add(k);
  return keys.size === 1 ? [...keys][0] : "";
}

// ---- clashes ---------------------------------------------------------------------------------
const short = (f) => String(f).split("/").slice(-2).join("/"); // october-leave-and-payroll-input/october-leave-register.csv
const uniq = (a) => [...new Set(a)];
const leaveKind = (t) => (String(t).match(LEAVE_TYPE) || ["leave"])[0].toLowerCase();
const leaveName = (t) => (leaveKind(t) === "leave" ? "leave" : leaveKind(t) + " leave");
const words = (s) => new Set((String(s).toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []).filter((w) => !STOPW.has(w)));
const STOPW = new Set("with from that this into have will what when then them they their there about after before call meeting review today tomorrow week weekly monthly update item items notes draft agenda working copy status done open first second plan".split(" "));

// Where the facts disagree: [{ kind, text, files, severity, … }], the most
// pressing first. Kinds: leave, holiday, office-day, double-booked,
// leave-dates, customer, working-day, record, office-days, weekday.
function findClashes(facts) {
  const out = [], ref = facts.ref || isoOf(Date.now());
  const push = (c) => { if (out.length < MAX_CLASHES * 2) out.push(c); };
  // one commitment per person, day and thing (a task is often in a CSV and its STATUS.md)
  const seenC = new Set(), commits = facts.commitments.filter((c) => { const k = `${c.person}|${c.date}|${c.what.toLowerCase().slice(0, 40)}`; if (seenC.has(k)) return false; seenC.add(k); return true; });
  const hol = new Map(); for (const h of facts.holidays) if (!hol.has(h.date) || hol.get(h.date).closure && !h.closure) hol.set(h.date, h);

  // leave: merge the records of one stretch of leave (the register and the STATUS.md that mention it)
  const stretches = [];
  for (const l of [...facts.leave].sort((a, b) => (a.prose ? 1 : 0) - (b.prose ? 1 : 0))) {
    const s = stretches.find((x) => x.person === l.person && leaveKind(x.type) === leaveKind(l.type) && l.from <= x.to && l.to >= x.from);
    if (s) { s.files.push(l.file); s.from = s.from < l.from ? s.from : l.from; s.to = s.to > l.to ? s.to : l.to; if (s.days == null) s.days = l.days; } else stretches.push({ ...l, files: [l.file] });
  }
  // leave that runs into an office closure, or counts a holiday as a leave day
  for (const s of stretches) {
    const days = []; for (let d = s.from; d <= s.to; d = addDays(d, 1)) days.push(d);
    const closed = days.filter((d) => dow(d) % 6 && hol.has(d) && hol.get(d).closure), holi = days.filter((d) => dow(d) % 6 && hol.has(d) && !hol.get(d).closure);
    const weekdays = days.filter((d) => dow(d) % 6).length;
    if (closed.length) push({ kind: "leave", person: s.person, date: s.from, severity: "medium", files: uniq([s.files[0], hol.get(closed[0]).file]), text: `${s.person}'s ${leaveName(s.type)} ${fmtRange(s.from, s.to)} (${short(s.files[0])}) runs into the office closure (${fmtRange(closed[0], closed[closed.length - 1])}, ${short(hol.get(closed[0]).file)}): ${closed.length === 1 ? "that day" : "those days"} shouldn't come off ${s.person.split(" ")[0]}'s leave as booked.` });
    else if (holi.length && s.days != null && s.days >= weekdays) push({ kind: "leave", person: s.person, date: s.from, severity: "low", files: uniq([s.files[0], hol.get(holi[0]).file]), text: `${s.person}'s ${leaveName(s.type)} ${fmtRange(s.from, s.to)} counts ${s.days} days (${short(s.files[0])}), but ${fmt(holi[0])} is a public holiday (${short(hol.get(holi[0]).file)}).` });
  }
  for (const s of stretches) {
    const hits = commits.filter((c) => c.person === s.person && c.date >= s.from && c.date <= s.to && dow(c.date) % 6 && !s.files.includes(c.file) || c.person === s.person && c.date >= s.from && c.date <= s.to && dow(c.date) % 6 && c.src !== "text" && s.files.includes(c.file) && !LEAVE_WORDS.test(c.what));
    if (!hits.length) continue;
    const list = hits.slice(0, 4).map((c) => `${c.what || "something"} (${fmt(c.date)}, ${short(c.file)})`).join("; ");
    push({ kind: "leave", person: s.person, date: s.from, severity: hits.some((c) => c.due) ? "high" : "medium", files: uniq([s.files[0], ...hits.map((c) => c.file)]),
      text: `${s.person} is on ${leaveName(s.type)} ${fmtRange(s.from, s.to)} (${short(s.files[0])}), but is down for ${hits.length === 1 ? "" : hits.length + " things then: "}${list}${hits.length > 4 ? "; …" : ""}.` });
  }
  // the same leave with different dates: a rarer kind of leave (study, unpaid,
  // family), one person, two files, a few weeks apart and not overlapping
  for (let i = 0; i < stretches.length; i++) for (let j = i + 1; j < stretches.length; j++) {
    const a = stretches[i], b = stretches[j], k = leaveKind(a.type);
    if (a.person !== b.person || k !== leaveKind(b.type) || /^(leave|annual|sick)$/.test(k) || a.files.some((f) => b.files.includes(f)) || Math.abs(ms(a.from) - ms(b.from)) > 21 * DAY) continue;
    push({ kind: "leave-dates", person: a.person, date: a.from, severity: "medium", files: uniq([a.files[0], b.files[0]]), text: `${a.person}'s ${leaveName(k)} is ${fmtRange(a.from, a.to)} in ${short(a.files[0])} but ${fmtRange(b.from, b.to)} in ${short(b.files[0])}.` });
  }
  // two things at the same time: one person, one day, times that overlap, in two
  // files that aren't about the same thing
  // (times from a log line or a loose sentence are often about something else: "booked on 2 Oct: lunch 12:30")
  const timed = new Map(); for (const c of commits) if (c.time && dow(c.date) % 6 && (c.time.allDay || /^(meeting|agenda)$/.test(c.src) || /^(row|paren)$/.test(c.src) && MEETING.test(c.what))) { const k = c.person + "|" + c.date; if (!timed.has(k)) timed.set(k, []); timed.get(k).push(c); }
  for (const list of timed.values()) {
    let found = null;
    for (let i = 0; i < list.length && !found; i++) for (let j = i + 1; j < list.length && !found; j++) {
      const a = list[i], b = list[j];
      if (a.file === b.file || a.file.split("/").slice(0, -1).join("/") === b.file.split("/").slice(0, -1).join("/")) continue;
      if (!(a.time.start < b.time.end && b.time.start < a.time.end)) continue;
      const wa = words(a.what + " " + (a.ctx || "")), wb = words(b.what + " " + (b.ctx || "")); if ([...wa].some((w) => wb.has(w)) || a.about && a.about === b.about) continue; // the same meeting, told twice
      found = [a, b];
    }
    if (!found) continue;
    const [a, b] = found, at = (c) => (c.time.allDay ? "all day" : `at ${pad(Math.floor(c.time.start / 60))}:${pad(c.time.start % 60)}`);
    const label = (c) => (c.ctx ? `${c.what} (${clip(c.ctx, 60)})` : c.what);
    push({ kind: "double-booked", person: a.person, date: a.date, severity: "medium", files: [a.file, b.file], text: `${a.person} is double-booked on ${fmt(a.date)}: ${label(a)} ${at(a)} (${short(a.file)}) and ${label(b)} ${at(b)} (${short(b.file)}).` });
  }
  // a working day that isn't its date: "WD7, 9 Nov" when 4 Nov is a public holiday
  const seenWd = new Set();
  for (const w of facts.wdLabels || []) {
    const first = w.date.slice(0, 8) + "01"; let n = 0, d = first;
    for (; d.slice(0, 7) === w.date.slice(0, 7); d = addDays(d, 1)) if (dow(d) % 6 && !hol.has(d) && ++n === w.n) break;
    const k = w.file + "|" + w.n + "|" + w.date; if (n !== w.n || d === w.date || seenWd.has(k)) continue; seenWd.add(k);
    const hs = []; for (let x = first; x <= (d > w.date ? d : w.date); x = addDays(x, 1)) if (dow(x) % 6 && hol.has(x)) hs.push(x);
    push({ kind: "working-day", date: w.date, severity: "medium", files: uniq([w.file, ...hs.map((x) => hol.get(x).file)]), text: `${short(w.file)} says "${w.text}", but working day ${w.n} of that month is ${fmt(d)}${hs.length ? ": " + fmt(hs[0]) + " is " + (hol.get(hs[0]).closure ? "an office closure" : "a public holiday") + " (" + short(hol.get(hs[0]).file) + ")" : ""}.` });
  }
  // holidays and closures
  const byHol = new Map();
  for (const c of commits) {
    // (not when the thing is about that day: "Agree the 4 Nov cover", "on duty")
    const h = hol.get(c.date); if (!h || !(dow(c.date) % 6) || c.file === h.file || /\b(holiday|shutdown|closed|on duty|standby|on[- ]call|volunteer|rota|cover)\b/i.test(c.what) || c.src !== "text" && parseDates(c.what, ref).some((d) => d.from <= c.date && d.to >= c.date)) continue;
    const k = c.date + "|" + c.person; if (!byHol.has(k)) byHol.set(k, { h, list: [] }); byHol.get(k).list.push(c);
  }
  for (const { h, list } of byHol.values()) {
    const c = list[0];
    push({ kind: "holiday", person: c.person, date: c.date, severity: list.some((x) => x.due) ? "high" : "medium", files: uniq([h.file, ...list.map((x) => x.file)]),
      text: `${fmt(c.date)} is ${h.closure ? "an office closure day" : "a public holiday (" + clip(h.name, 60) + ")"} per ${short(h.file)}, but ${c.person} is down for ${list.slice(0, 3).map((x) => `${x.what || "something"} (${short(x.file)})`).join("; ")} that day.` });
  }
  // office days: what the policy says belongs on an office day, booked on another day
  const od = facts.officeDays;
  if (od && od.days.length) {
    const days = new Set(od.days.map((d) => WDAY_NAMES.indexOf(d))), seen = new Map();
    for (const e of facts.events || []) {
      if (days.has(dow(e.date)) || !(dow(e.date) % 6) || hol.has(e.date)) continue;
      const k = e.kind + "|" + e.date; if (!seen.has(k)) seen.set(k, { ...e, files: [] }); seen.get(k).files.push(e.file);
    }
    for (const e of seen.values()) push({ kind: "office-day", date: e.date, severity: "medium", files: uniq([...e.files, od.file]),
      text: `The ${e.kind} is on ${fmt(e.date)} (${short(e.files[0])}), but ${WDAY_NAMES[dow(e.date)]} isn't an office day: ${short(od.file)} says ${od.kinds.join(" and ")} go on ${od.days.join(" and ")}.` });
    // two files stating different office days
    const other = od.rules.find((r) => r.days.join(",") !== [...days].sort().join(","));
    if (other) push({ kind: "office-days", severity: "low", files: uniq([od.file, other.file]), text: `${short(od.file)} says the office days are ${od.days.join(" and ")}, but ${short(other.file)} says ${other.days.map((i) => WDAY_NAMES[i]).join(" and ")}.` });
  }
  // customers: a field with two values in two files
  const byField = new Map();
  for (const c of facts.customers) { const k = c.key + "|" + c.field; if (!byField.has(k)) byField.set(k, []); byField.get(k).push(c); }
  for (const list of byField.values()) {
    const vals = new Map();
    for (const c of list) { const same = [...vals.keys()].find((v) => sameValue(c.field, v, c.value)); const k = same === undefined ? c.value : same; if (!vals.has(k)) vals.set(k, []); vals.get(k).push(c); }
    if (vals.size < 2 || new Set(list.map((c) => c.file)).size < 2) continue;
    const groups = [...vals.values()].sort((a, b) => b.length - a.length), f = list[0].field;
    if (groups.every((g) => g.every((c) => c.file === groups[0][0].file))) continue; // one file with two rows, not two files
    const label = { renewal: "renewal date", price: "annual value", users: "user count", plan: "plan", health: "health", owner: "account owner" }[f];
    push({ kind: "customer", field: f, customer: list[0].customer, severity: f === "renewal" || f === "price" ? "high" : "medium", files: uniq(groups.map((g) => g[0].file)),
      text: `${list[0].customer}'s ${label} disagrees: ${groups.slice(0, 4).map((g) => `${g[0].show} (${short(g[0].file)})`).join(" vs ")}.` });
  }
  // records: one ID, two files, a different date, amount or status
  const byId = new Map(); for (const r of facts.records) { if (!byId.has(r.id)) byId.set(r.id, []); byId.get(r.id).push(r); }
  for (const [id, list] of byId) {
    if (new Set(list.map((r) => r.file)).size < 2) continue;
    const diffs = [], files = new Set();
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]; if (a.file === b.file) continue;
      for (const h of Object.keys(a.facts)) if (h in b.facts && !sameCell(a.facts[h], b.facts[h], ref) && diffs.length < 3 && !diffs.some((d) => d.h === h)) { diffs.push({ h, a: a.facts[h], b: b.facts[h], fa: a.file, fb: b.file }); files.add(a.file); files.add(b.file); }
    }
    if (diffs.length) push({ kind: "record", id, severity: "low", files: [...files], text: `${id} differs between ${short(diffs[0].fa)} and ${short(diffs[0].fb)}: ${diffs.map((d) => `${d.h} "${clip(d.a, 40)}" vs "${clip(d.b, 40)}"`).join("; ")}.` });
  }
  // a weekday that isn't its date's
  const seenW = new Set();
  for (const w of facts.weekdays) { const k = w.file + "|" + w.date; if (seenW.has(k)) continue; seenW.add(k); push({ kind: "weekday", date: w.date, severity: "low", files: [w.file], text: `${short(w.file)} says "${w.text}", but ${fmt(w.date).replace(/^\w+ /, "")} is a ${WDAY_NAMES[dow(w.date)]}.` }); }

  const rank = { high: 0, medium: 1, low: 2 }, kindRank = { leave: 0, customer: 1, holiday: 2, "office-day": 3, "double-booked": 4, "leave-dates": 5, "working-day": 6, record: 7, "office-days": 8, weekday: 9 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || kindRank[a.kind] - kindRank[b.kind] || String(a.date || "").localeCompare(String(b.date || ""))).slice(0, MAX_CLASHES);
}
function sameValue(field, a, b) {
  if (field === "renewal") return a === b || /^\d{4}-/.test(a) && /^\d{4}-/.test(b) && Math.abs(ms(a) - ms(b)) <= DAY; // an end date and the renewal the day after are one date
  if (field === "price") return Math.abs(a - b) <= Math.max(1, 0.01 * Math.max(a, b));
  return a === b;
}
// Two cells of one record: the same date, the same amount, or the same first word.
function sameCell(a, b, ref) {
  const da = parseDates(a, ref), db = parseDates(b, ref);
  if (da.length && db.length) return da[0].from === db[0].from && da[0].to === db[0].to;
  const na = num(a), nb = num(b); if (!isNaN(na) && !isNaN(nb)) return Math.abs(na - nb) < 0.01;
  const w = (s) => clean(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/).slice(0, 2).join(" ");
  return w(a) === w(b) || !w(a) || !w(b);
}

// ---- running it -----------------------------------------------------------------------------
// Read the folders (default: the knowledge folders in config.json), find the
// clashes, keep the result for checksState. { clashes, counts, files, at, ms }.
function runChecks({ folders, now = Date.now(), file = CHECKS_FILE, save = true } = {}) {
  const t0 = Date.now();
  folders = (folders || knowledgeFolders()).map((f) => (typeof f === "string" ? { path: f, examples: ["templates/"] } : { path: f.path, examples: f.examples || ["templates/"] }));
  const files = loadFiles(folders), facts = extractFacts(files, { now });
  const clashes = findClashes(facts).map((c) => ({ ...c, files: c.files.map(cite) }));
  const counts = { files: files.length, examples: files.filter((f) => f.example).length, people: facts.people.length, commitments: facts.commitments.length, leave: facts.leave.length, holidays: new Set(facts.holidays.map((h) => h.date)).size, customers: new Set(facts.customers.map((c) => c.key)).size, customerFacts: facts.customers.length, records: facts.records.length };
  const res = { clashes, counts, officeDays: facts.officeDays ? facts.officeDays.days : [], folders: folders.map((f) => cite(f.path)), at: now, ms: Date.now() - t0 };
  if (save) { try { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, JSON.stringify(res), { mode: 0o600 }); try { chmodSync(file, 0o600); } catch {} } catch {} }
  return res;
}
// Things the office-day rule covers, from any line or row that names one with a
// date: [{ kind, date, file }]. The kinds are the ones the policy names
// (all-hands, team planning); an all-staff meeting counts as an all-hands.
function eventsOf(files, ref) {
  const out = [];
  const KIND = /\b(all[- ]hands|all[- ]staff meeting|team planning|planning day|kick-?off)\b/i;
  for (const f of files) for (const [i, l] of String(f.text).split(/\r?\n/).entries()) {
    for (const s of sentences(l.replace(/\|/g, " · "))) {
      const k = s.match(KIND); if (!k || /\b(option|alternative|or|instead|move|moved|not|isn't|breaks)\b/i.test(s) && !/\bpencil/i.test(s)) continue;
      const ds = parseDates(s, ref).filter((d) => d.from === d.to); if (ds.length !== 1 || !/\d{1,2}:\d{2}|pencil|booked|is on|held on|on (Mon|Tue|Wed|Thu|Fri)/i.test(s)) continue;
      out.push({ kind: k[1].toLowerCase().replace(/ /g, "-").replace(/^kickoff$/, "kick-off").replace(/^all-staff-meeting$/, "all-hands"), date: ds[0].from, file: f.path, line: i + 1 });
    }
  }
  return out.filter((e) => e.kind === "all-hands" || e.kind === "team-planning");
}
// What the app shows: the last run, or { at: 0 } before the first.
function checksState({ file = CHECKS_FILE } = {}) {
  try { const d = JSON.parse(readFileSync(file, "utf8")); return { at: d.at || 0, clashes: d.clashes || [], counts: d.counts || {}, officeDays: d.officeDays || [], folders: d.folders || [], ms: d.ms || 0 }; }
  catch { return { at: 0, clashes: [], counts: {}, officeDays: [], folders: [], ms: 0 }; }
}
// Home's "Where your files disagree" droplet: the high clashes (a deadline on
// someone's leave or a holiday, a renewal or price told two ways) you haven't
// opened from it yet. Opening it marks them seen (checks-seen.json), so the same
// clash reaches you once; a new one, or one that changes, comes back.
const SEEN_FILE = join(CONFIG_DIR, "checks-seen.json");
const clashKey = (c) => c.kind + "|" + c.text;
function seenClashes({ file = SEEN_FILE } = {}) { try { const d = JSON.parse(readFileSync(file, "utf8")); return Array.isArray(d) ? d : []; } catch { return []; } }
function newClashes({ state = checksState(), seen = seenClashes() } = {}) {
  const s = new Set(seen);
  return (state.clashes || []).filter((c) => c.severity === "high" && !s.has(clashKey(c)));
}
function markClashesSeen({ state = checksState(), file = SEEN_FILE } = {}) {
  const keys = [...new Set([...seenClashes({ file }), ...(state.clashes || []).filter((c) => c.severity === "high").map(clashKey)])].slice(-MAX_CLASHES);
  try { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, JSON.stringify(keys), { mode: 0o600 }); return { ok: true }; } catch { return { error: "Couldn't write " + file + "." }; }
}

export { CHECKS_FILE, parseDates, timeOf, loadFiles, extractFacts, findClashes, runChecks, checksState, newClashes, markClashesSeen, seenClashes };
