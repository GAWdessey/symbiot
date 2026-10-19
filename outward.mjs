// symbiot — what goes out: release notes are for anyone who installs the app, not
// only the person whose work it came from. Symbiot is used by people whose tasks
// name their own products, clients, people, accounts, providers, servers and runs;
// the 0.66.6 notes (16 Oct 2026) went out in the tasks' own words ("Meta part, by
// the dailify lane itself…", "run act-2ae1923d", "Garth asked, Fri 16 Oct 2026")
// and every update panel showed them. So a release note is checked before it ships:
//
// - denyList(): what's yours alone, from what Symbiot knows here: your lanes (bar
//   the repo shipping, its own family and ops / marketing, which every Symbiot has),
//   the names in your memory (people, accounts, projects, sites), the providers your
//   lanes hold keys for and the servers you ssh to. The well-known platforms Symbiot
//   itself works with (Claude, GitHub, Gmail, WhatsApp…) aren't yours, so stay sayable.
// - leaksIn(line, deny): why a line can't go out: a term from that list, or one any
//   machine can see (a run id, a run's copy, an email, an address, a dated ask).
//   With no list (CI), only those.
// - internalOnly(line): a task that changed nothing in the product (deploy it,
//   find out why, a test's part done by another lane): left out of the notes.
// - publicItems(items, deny): the lines that may go out, and why the rest didn't.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR, readState } from "./core.mjs";

// Platforms Symbiot works with as a product, named in its own docs and screens:
// a release note may say "Gmail" or "Claude Code" whoever's memory names them.
const PRODUCT_TERMS = new Set(("symbiot claude anthropic openai chatgpt gemini github npm node git google gmail outlook microsoft office " +
  "linkedin whatsapp meta facebook instagram youtube reddit x twitter chrome chromium electron android ios iphone windows mac macos linux " +
  "termux ubuntu cosmic debian appimage apk mcp ops marketing home dashboard workdesk reports week standup todo drift map settings archive").split(" "));
// Capitalised words a memory's name starts with that name nothing (a "Sandboxed
// repo runs" node): the README's own lower-case words stand for English, plus these.
const COMMON = new Set("the and for with from into about after before over under not no new old own one two all any each every this that these those its it's is are was were be on in at to of by or as up out off via per prod dev test live main first last next team company user users phone laptop server account accounts login logins mailbox email emails token tokens key keys site sites page pages project projects app apps mobile desktop web domain domains dns registration registrant registrar program startup startups application calendar template templates content legal buttons button checkout list lists move migration number numbers rates call calls sms env host webhook console cloud oauth client project's idea mode logo usage admin access profile profiles browser relay demo channel verification forwarding issuer attribution capture media posts post drafts draft reply replies voice orbs blobs chat suggestion box tasks rails back side approach tools video sandboxed always-on technologies inc ltd pty vids resend".split(" "));
let README_WORDS = null;
function readmeWords() {
  if (README_WORDS) return README_WORDS;
  let t = ""; try { t = readFileSync(fileURLToPath(new URL("./README.md", import.meta.url)), "utf8"); } catch {}
  README_WORDS = new Set(t.match(/(?<![A-Za-z])[a-z][a-z'-]{2,}/g) || []); // only words it writes lower-case: "gosolr's" in an example isn't English, but it's a lane anyway
  return README_WORDS;
}
const commonWord = (w) => { const l = w.toLowerCase().replace(/['’]s$/, ""); return COMMON.has(l) || PRODUCT_TERMS.has(l) || readmeWords().has(l); };
// A domain's own name: "cp.smsportal.com" → "smsportal", "ghost-ai.co.za" → "ghost-ai".
const SLD = /\.(co|com|org|net|gov|ac)\.[a-z]{2}$|\.[a-z]{2,}$/;
function domainName(d) { const parts = String(d).toLowerCase().replace(SLD, "").split("."); return parts[parts.length - 1] || ""; }

// The names in one memory node worth keeping out: a person's first name; a
// domain's own name; a product-like name of up to three words, as written; and
// each capitalised word that isn't English or a platform Symbiot works with.
function nodeTerms(n) {
  const name = String((n && n.name) || "").trim(), out = [];
  if (!name || n.kind === "preference") return out; // "Symbiot Home orbs": how you like the app, not who you are
  for (const d of name.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi) || []) { if (/^\d+(\.\d+)+$/.test(d)) continue; out.push(d.toLowerCase()); const s = domainName(d); if (s && !commonWord(s)) out.push(s); }
  const words = name.replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi, " ").split(/[\s/(),]+/).filter(Boolean);
  if ((n.kind === "project" || n.kind === "repo") && words.length > 1 && words.length <= 3 && words.every((w) => /^[A-Z]/.test(w))) out.push(words.join(" "));
  for (const w0 of words) {
    if (w0.includes("_")) continue; // CORS_ALLOWED_ORIGINS: a setting's name, not whose it is
    const w = w0.replace(/['’]s$/, "").replace(/[^A-Za-z0-9-]/g, "");
    if (/^\d{6,}$/.test(w)) { out.push(w); continue; } // an account number
    if (w.length < 3 || !/^[A-Z]/.test(w) || /^[A-Z0-9_]+$/.test(w) && w.length <= 4) continue; // SMS, DNS, AWS: too short to tell
    if (n.kind === "person" ? !COMMON.has(w.toLowerCase()) : !commonWord(w)) out.push(w);
  }
  return out;
}
// The deny list: [{ term, why }], each term once (case aside).
function denyTerms({ self = "", lanes = [], nodes = [], providers = [], hosts = [], people = [] } = {}) {
  const me = String(self).toLowerCase(), seen = new Map();
  const add = (term, why) => {
    const t = String(term || "").trim(), k = t.toLowerCase(); if (t.length < 3 || seen.has(k)) return;
    if (PRODUCT_TERMS.has(k) || (me && k.split(/[^a-z0-9]+/).includes(me))) return; // symbiot-mobile, symbiot.co.za: the product's own
    seen.set(k, { term: t, why });
  };
  for (const l of lanes) add(l, "a lane of yours");
  for (const p of people) add(p, "a person");
  for (const n of nodes) for (const t of nodeTerms(n)) add(t, n.kind === "person" ? "a person" : `in your memory (${n.kind})`);
  for (const p of providers) if (String(p).length >= 4 && !commonWord(p)) add(String(p).toLowerCase(), "a provider your lanes hold keys for"); // not SMS_ or RESEND_: words too
  for (const h of hosts) add(h, "a server you connect to");
  return [...seen.values()];
}
// From what Symbiot knows on this computer. Every part is best effort: a sandboxed
// run can't read the ssh config, and CI has none of it (generic checks only).
async function denyList(self = "symbiot", { home = homedir() } = {}) {
  let lanes = {}, nodes = [], providers = [], hosts = [];
  try { const { repoPathMap } = await import("./scan.mjs"); lanes = repoPathMap() || {}; } catch {}
  try { const d = readState(join(CONFIG_DIR, "mind.json")); nodes = Array.isArray(d && d.nodes) ? d.nodes : []; } catch {}
  try {
    const { laneKeys, sshHosts } = await import("./reach.mjs");
    providers = [...new Set(Object.values(lanes).flatMap((p) => { try { return laneKeys(p); } catch { return []; } }))];
    try { hosts = sshHosts(readFileSync(join(home, ".ssh", "config"), "utf8")); } catch {}
  } catch {}
  return denyTerms({ self, lanes: Object.keys(lanes).filter((l) => l !== "ops" && l !== "marketing"), nodes, providers, hosts });
}

// What anyone can see is private, list or not.
const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*";
const LANE_OK = new Set("the a an each every its your their this that one another other same own ops marketing project repo next first whole right wrong new symbiot".split(" "));
const GENERIC = [
  [/\bact-[0-9a-f]{6,}\b/i, "a run id"],
  [/\b[a-z][a-z0-9_]*-\d{5,}\b/i, "a run's copy"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/, "an email address"],
  [/\b(?!(?:192\.0\.2|198\.51\.100|203\.0\.113|127\.\d+\.\d+)\.\d+\b)\d{1,3}(?:\.\d{1,3}){3}\b/, "an IP address"], // not the ones kept for examples, nor this computer's own
  [new RegExp(`\\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]* \\d{1,2} ${MONTH}\\b`), "a dated ask (task wording)"],
];
const ASKED = /\b([A-Z][a-z]+) (?:asked|said|wants)\b/g; // "Garth asked", not "Home asked"
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termRe = (t) => new RegExp(`(?<![A-Za-z0-9])${t.split(/[\s._-]+/).filter(Boolean).map(escRe).join("[\\s._-]*")}(?:['’]s)?(?![A-Za-z0-9])`, "i");
// Why a line can't go out: [{ term, why }], empty when it may.
function leaksIn(line, deny = []) {
  const s = String(line || ""), out = [], squeezed = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [re, why] of GENERIC) { const m = s.match(re); if (m) out.push({ term: m[0], why }); }
  for (const m of s.matchAll(ASKED)) if (!commonWord(m[1])) out.push({ term: m[0], why: "names who asked" });
  for (const m of s.matchAll(/\b(?:the|by|in|from|to|for) ([A-Za-z][\w-]*) lane\b/gi)) if (!LANE_OK.has(m[1].toLowerCase()) && !commonWord(m[1])) out.push({ term: m[0], why: "names a lane" });
  for (const d of deny) {
    const t = d.term, single = !/[\s._-]/.test(t) && t.length >= 6; // "smsportal" is also "SMS Portal"
    if (termRe(t).test(s) || (single && squeezed.includes(t.toLowerCase()))) out.push(d);
  }
  return out.filter((x, i) => out.findIndex((y) => y.term.toLowerCase() === x.term.toLowerCase()) === i);
}
// A task that's about the work, not a change to the product: shipping or deploying
// it, looking into something, another lane's part of a test, a round's report.
const INTERNAL = /^(?:deploy|publish|release|ship|find out|look into|investigate|ask|tell|email|send|chase|follow up|remind|wait|merge|round done)\b|\b(?:part of the test|still waits on|lane itself|the release run)\b/i;
const internalOnly = (line) => INTERNAL.test(String(line || "").replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim());
// The lines that may go out ({ kept }) and those that can't, with why ({ dropped }).
function publicItems(items = [], deny = []) {
  const kept = [], dropped = [];
  for (const text of items) {
    if (internalOnly(text)) { dropped.push({ text, why: "not a change to the app" }); continue; }
    const l = leaksIn(text, deny); if (l.length) { dropped.push({ text, why: l.map((x) => `"${x.term}" (${x.why})`).join(", ") }); continue; }
    kept.push(text);
  }
  return { kept, dropped };
}
// Every release's "- " lines in a CHANGELOG.md that can't go out: [{ version, line, why }].
function checkChangelog(md, deny = []) {
  const out = []; let version = "";
  for (const raw of String(md || "").split("\n")) {
    const h = raw.match(/^##\s+\[?v?(\d+\.\d+\.\d+)/); if (h) { version = h[1]; continue; }
    if (!version || !/^\s*[-*]\s+/.test(raw)) continue;
    const l = leaksIn(raw, deny); if (l.length) out.push({ version, line: raw.replace(/^\s*[-*]\s+/, ""), why: l.map((x) => `"${x.term}" (${x.why})`).join(", ") });
  }
  return out;
}

export { PRODUCT_TERMS, nodeTerms, denyTerms, denyList, leaksIn, internalOnly, publicItems, checkChangelog };
