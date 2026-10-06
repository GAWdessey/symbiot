// symbiot — Knowledge: folders of your own documents (a company folder of
// Markdown and CSV, policies, notes) that chats quote and cite. Kept apart from
// Mind's memory: mind.json holds short facts and pointers; this holds documents.
//
// - Folders: config.json's knowledgeFolders, [{ path, examples }]. examples are
//   paths inside the folder whose files are worked examples (default templates/):
//   searchable when you ask for them, labelled, never recalled in a chat as a fact.
//   A file whose front matter says `example: true` is one too, wherever it is.
// - The index (~/.config/symbiot/knowledge.json, yours only): each .md, .csv and
//   .txt file cut into short pieces (a section, a CSV row), with its size and
//   mtime, so a re-index reads only what changed. Word, PDF and Excel files are
//   counted as "not read yet".
// - Cases: a README.md with "Who does it", "When", "Steps", "Hands off to" and
//   "What Symbiot should learn and remember", and items with front matter (owner,
//   status, due, waiting_on), like active/<item>/STATUS.md: what answers "what's
//   waiting on me" and "who owns X" without the model guessing.
import { join, relative, extname, sep, basename } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, mkdirSync, chmodSync, readdirSync, statSync } from "node:fs";
import { CONFIG_DIR, loadConfig, saveConfig, clipWords } from "./core.mjs";
import { expandRoot, me } from "./scan.mjs";

const KNOW_FILE = join(CONFIG_DIR, "knowledge.json");
const READ = new Set([".md", ".markdown", ".csv", ".txt"]);
const LATER = new Set([".docx", ".doc", ".pdf", ".xlsx", ".xls", ".pptx", ".ppt", ".odt", ".ods", ".rtf"]); // counted, not read yet
const DEFAULT_EXAMPLES = ["templates/"];
const MAX_FILES = 5000, MAX_BYTES = 512 * 1024, MAX_PIECES = 400, PIECE = 900, EXCERPT = 360, HITS = 3;

// ---- folders ----------------------------------------------------------------------
// "templates/, active/" or a list: each a folder (ends in /) or a file name.
const examplePaths = (s) => (Array.isArray(s) ? s : String(s == null ? "" : s).split(/[,\n]/)).map((x) => String(x).trim().replace(/\\/g, "/")).filter(Boolean).map((x) => (x.endsWith("/") || /\.[a-z0-9]+$/i.test(x) ? x : x + "/"));
const trimSlash = (p) => p.replace(/(.)[/\\]+$/, "$1");
function knowledgeFolders(cfg = loadConfig()) {
  return (Array.isArray(cfg.knowledgeFolders) ? cfg.knowledgeFolders : []).map((f) => (typeof f === "string" ? { path: f } : f)).filter((f) => f && f.path)
    .map((f) => ({ path: trimSlash(expandRoot(f.path)), examples: Array.isArray(f.examples) ? examplePaths(f.examples) : DEFAULT_EXAMPLES }));
}
// Add a folder (or change its examples: adding it again replaces them). examples
// left out or blank: templates/; "none": nothing in it is an example.
function addKnowledgeFolder(p, examples) {
  p = trimSlash(expandRoot(p)); if (!p) return { error: "Give a folder." };
  let st; try { st = statSync(p); } catch { return { error: "folder not found: " + p }; }
  if (!st.isDirectory()) return { error: "not a folder: " + p };
  const ex = examples === undefined || examples === null || String(examples).trim() === "" ? DEFAULT_EXAMPLES : /^none$/i.test(String(examples).trim()) ? [] : examplePaths(examples);
  const cfg = loadConfig(), list = knowledgeFolders(cfg).filter((f) => f.path !== p);
  cfg.knowledgeFolders = [...list, { path: p, examples: ex }];
  return saveConfig(cfg) ? { ok: true, folders: cfg.knowledgeFolders } : { error: "Couldn't save the config." };
}
function removeKnowledgeFolder(p) {
  const x = trimSlash(expandRoot(p)), cfg = loadConfig(), list = knowledgeFolders(cfg), left = list.filter((f) => f.path !== x);
  if (left.length === list.length) return { error: "Not a knowledge folder: " + x };
  if (left.length) cfg.knowledgeFolders = left; else delete cfg.knowledgeFolders;
  saveConfig(cfg); return { ok: true, folders: left };
}
// Is this file (its path inside the folder, with /) an example? "templates/" is
// any folder of that name at any depth; "/active/" only the one at the top; a
// file name matches that file.
function isExample(rel, examples) {
  const r = "/" + rel;
  return examples.some((e) => {
    const anchored = e.startsWith("/"), pat = anchored ? e : "/" + e;
    if (pat.endsWith("/")) return anchored ? r.startsWith(pat) : r.includes(pat);
    return anchored ? r === pat : r.endsWith(pat);
  });
}

// ---- reading files ------------------------------------------------------------------
const unq = (s) => s.replace(/^(["'])(.*)\1$/, "$2");
// The front matter between --- lines: key: value, and [a, b] lists. Enough for
// STATUS.md (owner, status, due, waiting_on) and `example: true`.
function frontMatter(text) {
  const m = String(text).match(/^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/); if (!m) return { meta: null, body: text };
  const meta = {};
  for (const l of m[1].split(/\r?\n/)) {
    const kv = l.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/); if (!kv) continue;
    const v = kv[2].trim();
    meta[kv[1].toLowerCase()] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(",").map((x) => unq(x.trim())).filter(Boolean) : unq(v);
  }
  return { meta, body: text.slice(m[0].length) };
}
// Text cut at paragraphs into pieces of about PIECE characters.
function cut(t, max = PIECE) {
  const out = []; let cur = "";
  for (const para of String(t).split(/\n\s*\n/)) {
    const p = para.trim(); if (!p) continue;
    if (cur && cur.length + p.length + 2 > max) { out.push(cur); cur = ""; }
    if (p.length > max) { for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max)); continue; }
    cur = cur ? cur + "\n\n" + p : p;
  }
  if (cur) out.push(cur);
  return out;
}
// Markdown: a piece per section, under its heading.
function mdPieces(body) {
  const out = []; let head = "", buf = [];
  const flush = () => { const t = buf.join("\n").trim(); buf = []; for (const p of t ? cut(t) : []) out.push({ h: head, t: p }); };
  for (const l of String(body).split(/\r?\n/)) { const m = l.match(/^#{1,4}\s+(.*)$/); if (m) { flush(); head = m[1].trim(); } else buf.push(l); }
  flush(); return out;
}
// CSV: quoted fields with commas and newlines in them.
function csvRows(text) {
  const rows = []; let row = [], f = "", q = false;
  const end = () => { row.push(f); f = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; end(); }
    else f += ch;
  }
  if (f || row.length) end();
  return rows;
}
// A piece per row, each value with its column's name ("customer: Acme; owner: …"),
// labelled with its line ("row 3": the header is row 1).
function csvPieces(text) {
  const [head, ...rows] = csvRows(String(text).replace(/^﻿/, "")); if (!head) return [];
  return rows.slice(0, MAX_PIECES).map((r, i) => ({ h: "row " + (i + 2), t: clipWords(head.map((c, j) => (r[j] && r[j].trim() ? `${c.trim()}: ${r[j].trim()}` : "")).filter(Boolean).join("; "), PIECE) }));
}
// A case README's parts: "**Who does it:** …" lines (or sections of that name),
// and its Steps, Hands off to, and What Symbiot should learn and remember.
function caseOf(body, pieces) {
  const line = (k) => { const m = String(body).match(new RegExp("\\*\\*" + k + ":?\\*\\*:?[ \\t]*(.+)", "i")); return m ? m[1].trim() : ""; };
  const sec = (k) => { const p = pieces.find((x) => new RegExp("^" + k, "i").test(x.h)); return p ? clipWords(p.t, 400) : ""; };
  const c = { who: line("Who does it") || sec("Who does it"), when: line("When") || sec("When"), steps: sec("Steps"), handsOff: sec("Hands off to"), learn: sec("What Symbiot should learn") };
  return c.who || c.handsOff || c.learn ? c : null;
}
const FIELDS = ["item", "title", "case", "owner", "people", "status", "priority", "opened", "due", "next_step", "waiting_on", "hands_off_to", "related", "example"];
function readOne(abs, ext) {
  const raw = readFileSync(abs, "utf8");
  const { meta, body } = ext === ".csv" ? { meta: null, body: raw } : frontMatter(raw);
  const pieces = ext === ".csv" ? csvPieces(body) : ext === ".txt" ? cut(body).map((t) => ({ h: "", t })) : mdPieces(body);
  const m = {}; for (const k of FIELDS) if (meta && meta[k] !== undefined && meta[k] !== "") m[k] = Array.isArray(meta[k]) ? meta[k].map((x) => x.slice(0, 120)) : String(meta[k]).slice(0, 300);
  if (meta) pieces.unshift({ h: "front matter", t: Object.entries(m).map(([k, v]) => `${k}: ${[].concat(v).join(", ")}`).join("; ") });
  const title = String(m.item || m.title || (String(body).match(/^#\s+(.+)$/m) || [])[1] || basename(abs)).trim();
  const kase = /^readme\.(md|markdown)$/i.test(basename(abs)) ? caseOf(body, pieces) : null;
  return { title: title.slice(0, 200), ...(meta ? { meta: m } : {}), auto: !!(meta && /^(true|yes|1)$/i.test(String(meta.example || ""))), ...(kase ? { case: kase } : {}), pieces: pieces.slice(0, MAX_PIECES) };
}
// Every file under a folder: hidden folders and node_modules skipped, symlinks not followed.
function walk(dir, max = MAX_FILES) {
  const out = [], stack = [dir];
  while (stack.length && out.length < max) {
    const d = stack.pop(); let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of es) { if (e.name.startsWith(".") || e.name === "node_modules") continue; const p = join(d, e.name); if (e.isDirectory()) stack.push(p); else if (e.isFile()) out.push(p); }
  }
  return out.sort();
}

// ---- the index ----------------------------------------------------------------------
function loadIndex(file = KNOW_FILE) {
  try { const d = JSON.parse(readFileSync(file, "utf8")); return { files: d.files && typeof d.files === "object" ? d.files : {}, notRead: d.notRead || {}, at: d.at || 0 }; }
  catch { return { files: {}, notRead: {}, at: 0 }; }
}
// What's in your documents is yours only (0600), like mind.json.
function saveIndex(d, file = KNOW_FILE) {
  try { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, JSON.stringify(d), { mode: 0o600 }); try { chmodSync(file, 0o600); } catch {} CACHE = null; return true; }
  catch { return false; }
}
// Bring the index up to date: only files that are new or changed (size or mtime)
// are read; files gone (or in a folder you removed) are dropped. Cheap enough to
// run every few minutes: a stat per file when nothing changed. full: read all.
function indexKnowledge({ folders = knowledgeFolders(), file = KNOW_FILE, now = Date.now(), full = false } = {}) {
  const idx = loadIndex(file), seen = new Set(), notRead = {};
  let read = 0, kept = 0, failed = 0, changed = false;
  for (const f of folders) {
    const nr = notRead[f.path] = {};
    for (const abs of walk(f.path)) {
      const ext = extname(abs).toLowerCase();
      if (LATER.has(ext)) { nr[ext.slice(1)] = (nr[ext.slice(1)] || 0) + 1; continue; }
      if (!READ.has(ext) || seen.has(abs)) continue;
      let st; try { st = statSync(abs); } catch { continue; }
      if (st.size > MAX_BYTES) { nr["too big"] = (nr["too big"] || 0) + 1; continue; }
      seen.add(abs);
      const rel = relative(f.path, abs).split(sep).join("/"), old = idx.files[abs];
      if (!full && old && old.size === st.size && old.mtime === st.mtimeMs && old.root === f.path) {
        const ex = !!old.auto || isExample(rel, f.examples);
        if (old.example !== ex) { old.example = ex; changed = true; } // examples changed in Settings: no need to read it again
        kept++; continue;
      }
      try { const r = readOne(abs, ext); idx.files[abs] = { root: f.path, rel, size: st.size, mtime: st.mtimeMs, ...r, example: r.auto || isExample(rel, f.examples) }; read++; changed = true; }
      catch { failed++; }
    }
  }
  let removed = 0;
  for (const abs of Object.keys(idx.files)) if (!seen.has(abs)) { delete idx.files[abs]; removed++; changed = true; }
  if (JSON.stringify(notRead) !== JSON.stringify(idx.notRead)) changed = true;
  if (changed) saveIndex({ files: idx.files, notRead, at: now }, file);
  return { read, kept, removed, failed, files: Object.keys(idx.files).length };
}
// Re-index on the app's timer, when there are folders to read.
function knowledgeTick() { const folders = knowledgeFolders(); return folders.length ? indexKnowledge({ folders }) : null; }

// The index once per change of the file, with its pieces tokenized for search.
let CACHE = null;
function cached(file = KNOW_FILE) {
  let m = 0; try { m = statSync(file).mtimeMs; } catch { CACHE = null; return { idx: { files: {}, notRead: {}, at: 0 }, docs: null }; }
  if (!CACHE || CACHE.file !== file || CACHE.m !== m) CACHE = { file, m, idx: loadIndex(file), docs: null };
  return CACHE;
}

// ---- search ---------------------------------------------------------------------------
const STOP = new Set("the and for you your are was were what with this that from have has had but not can will would could should into about them they their there here when then than just also more some any all its it's i'm i've me my mine our ours how why who whom which does did done get got want need please look check go make let tell know is be of to in on at by or an as it if do so up no we us".split(" "));
// Words for search: lower case, 2+ characters, a plural's s dropped ("renewals" finds "renewal").
const tokens = (s) => (String(s || "").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_@-]*/gu) || []).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
// Each piece's words. A section carries its file's title (the Steps of the Payroll
// README are about payroll); only a file's first piece carries its folder path,
// and CSV rows don't repeat the file's name, or a 50-row register would make its
// folder's name look common. Word counts kept twice: over every piece, and over
// the pieces that aren't examples (what a chat searches).
function docsOf(c) {
  if (c.docs) return c.docs;
  const list = [], all = new Map(), real = new Map(); let total = 0, nReal = 0;
  for (const [path, f] of Object.entries(c.idx.files)) (f.pieces || []).forEach((p, i) => {
    const row = /^row \d+$/.test(p.h);
    const toks = tokens(`${!row || !i ? f.title : ""} ${i ? "" : f.rel.replace(/[/_.]+/g, " ")} ${row ? "" : p.h} ${p.t}`), tf = new Map();
    for (const w of toks) tf.set(w, (tf.get(w) || 0) + 1);
    for (const w of tf.keys()) { all.set(w, (all.get(w) || 0) + 1); if (!f.example) real.set(w, (real.get(w) || 0) + 1); }
    list.push({ path, f, p, tf, len: toks.length }); total += toks.length; if (!f.example) nReal++;
  });
  return (c.docs = { list, all, real, nAll: list.length, nReal, avg: total / Math.max(1, list.length) });
}
// A word asked about, and the longer words it starts ("complain": complaint,
// complained), which count for a little less.
function variants(w, df) {
  const out = [[w, 1]]; if (w.length < 5) return out;
  for (const v of df.keys()) { if (v !== w && v.startsWith(w)) out.push([v, 0.6]); if (out.length > 6) break; }
  return out;
}
// A path as a chat cites it: ~/Company/… for one in your home folder.
const cite = (p) => { const h = homedir(); return h && p.startsWith(h + sep) ? "~" + p.slice(h.length).split(sep).join("/") : p; };
// The part of a piece around the first word asked about.
function excerpt(t, q, max = EXCERPT) {
  t = String(t).replace(/\s+/g, " ").trim(); if (t.length <= max) return t;
  const low = t.toLowerCase(); let at = -1;
  for (const w of q) { const i = low.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
  let s = Math.max(0, Math.min(at - 80, t.length - max)); if (s > 0) s = t.indexOf(" ", s) + 1 || s;
  return (s > 0 ? "…" : "") + clipWords(t.slice(s), max);
}
// The pieces that best answer a question (BM25 over words), each with the file
// it came from. Examples only when asked for (examples: true), and marked.
// perFile: at most that many pieces from one file.
function searchKnowledge(query, { file = KNOW_FILE, limit = 5, perFile = 2, examples = false } = {}) {
  const q = [...new Set(tokens(query))]; if (!q.length) return [];
  const st = docsOf(cached(file)), df = examples ? st.all : st.real, N = examples ? st.nAll : st.nReal, k = 1.2, b = 0.75;
  const vars = q.map((w) => variants(w, df)), scored = [];
  for (const d of st.list) {
    if (d.f.example && !examples) continue;
    let s = 0, hit = 0;
    for (const vs of vars) {
      let best = 0;
      for (const [w, weight] of vs) { const tf = d.tf.get(w), n = df.get(w); if (!tf || !n) continue; best = Math.max(best, weight * Math.log(1 + (N - n + 0.5) / (n + 0.5)) * (tf * (k + 1)) / (tf + k * (1 - b + (b * d.len) / st.avg))); }
      if (best) { hit++; s += best; }
    }
    if (hit) scored.push({ d, s: s * (0.5 + hit / q.length) }); // a piece with more of the words asked about ranks first
  }
  scored.sort((x, y) => y.s - x.s);
  const out = [], per = {};
  for (const { d, s } of scored) {
    if ((per[d.path] = (per[d.path] || 0) + 1) > perFile) continue;
    out.push({ path: d.path, cite: cite(d.path), rel: d.f.rel, root: d.f.root, title: d.f.title, where: d.p.h, excerpt: excerpt(d.p.t, q), example: !!d.f.example, score: Math.round(s * 100) / 100 });
    if (out.length >= limit) break;
  }
  return out;
}

// ---- cases: who owns it, what's waiting on you ---------------------------------------
const DONE = /^(done|closed|complete|completed|cancelled|canceled|finished|archived)$/i;
const joined = (v) => [].concat(v || []).join(", ");
// Who "me" is: config.json's myName (symbiot knowledge me "Your Name"), else your
// git name (git config --global user.name).
function myName(cfg = loadConfig()) { return String(cfg.myName || "").trim() || (me().name || "").trim(); }
function setMyName(name) { const cfg = loadConfig(), n = String(name || "").trim().slice(0, 80); if (n) cfg.myName = n; else delete cfg.myName; saveConfig(cfg); return { ok: true, me: myName(cfg) }; }
// Does this field name you? Your whole name, or your first name as a word of its
// own ("Garth (sign-off)"; "GarthGhostai" counts as Garth).
function namesYou(field, name) {
  const f = joined(field).toLowerCase(); name = String(name || "").trim(); if (!f || !name) return false;
  if (f.includes(name.toLowerCase())) return true;
  const w = name.split(/\s+/)[0], first = ((w.match(/^\p{Lu}?\p{Ll}+/u) || [w])[0]).toLowerCase();
  return first.length >= 3 && new RegExp(`(^|[^\\p{L}])${first.replace(/[^\p{L}]/gu, "")}([^\\p{L}]|$)`, "u").test(f);
}
// Items: files with front matter that names an owner, a status or who it waits on.
function itemsOf(idx, examples = false) {
  return Object.entries(idx.files).filter(([, f]) => f.meta && (f.meta.owner || f.meta.waiting_on || f.meta.status) && (examples || !f.example))
    .map(([path, f]) => ({ path, cite: cite(path), rel: f.rel, title: f.title, case: f.meta.case || "", owner: joined(f.meta.owner), status: f.meta.status || "", priority: f.meta.priority || "", due: f.meta.due || "", waitingOn: joined(f.meta.waiting_on), next: f.meta.next_step || "", people: joined(f.meta.people), related: joined(f.meta.related), example: !!f.example, open: !DONE.test(String(f.meta.status || "").trim()) }));
}
function casesOf(idx, examples = false) {
  return Object.entries(idx.files).filter(([, f]) => f.case && (examples || !f.example))
    .map(([path, f]) => ({ path, cite: cite(path), rel: f.rel, title: f.title, ...f.case, example: !!f.example }));
}
const byDue = (a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999"));
// What's waiting on you (open items whose waiting_on names you), and what's yours
// (open items you own), soonest due first.
function waitingOn(name, { file = KNOW_FILE, examples = false, cfg } = {}) {
  name = name || myName(cfg || loadConfig());
  const items = itemsOf(cached(file).idx, examples).filter((i) => i.open);
  return { me: name, waiting: name ? items.filter((i) => namesYou(i.waitingOn, name)).sort(byDue) : [], mine: name ? items.filter((i) => namesYou(i.owner, name)).sort(byDue) : [] };
}
const OWNER_WORDS = new Set(tokens("who owns own owner is responsible for handles handle does runs run doing looks after on the case item"));
// Who owns what a question names: the items and cases whose title, case, folder
// or references share its words, best first.
function ownerOf(query, { file = KNOW_FILE, examples = false, limit = 5 } = {}) {
  const q = [...new Set(tokens(query))].filter((w) => !OWNER_WORDS.has(w)); if (!q.length) return [];
  const idx = cached(file).idx, score = (s) => { const t = new Set(tokens(s)); return q.filter((w) => t.has(w)).length; };
  const all = [
    // words in its own title count a little more: "Highveld QBR" is the QBR before the trip to it
    ...itemsOf(idx, examples).map((i) => ({ kind: "item", ...i, s: score(`${i.title} ${i.case} ${i.rel.replace(/[/_.]+/g, " ")} ${i.related}`) + score(i.title) / 4 })),
    ...casesOf(idx, examples).map((c) => ({ kind: "case", ...c, s: score(`${c.title} ${c.rel.replace(/[/_.]+/g, " ")}`) + score(c.title) / 4 })),
  ].filter((x) => x.s > 0).sort((a, b) => b.s - a.s || (a.kind === "case" ? -1 : 1));
  const top = all.length ? all[0].s : 0;
  return all.filter((x) => x.s >= Math.max(1, top / 2)).slice(0, limit).map(({ s, ...x }) => x);
}
const itemLine = (i) => clipWords(`${i.title}${i.status ? " · " + i.status : ""}${i.due ? " · due " + i.due : ""}${i.owner ? " · owner " + i.owner : ""}${i.waitingOn ? " · waiting on " + i.waitingOn : ""}${i.next ? " · next: " + i.next : ""}`, 300) + ` (${i.cite})`;
const caseLine = (c) => clipWords(`${c.title}${c.who ? " · who does it: " + c.who : ""}${c.when ? " · when: " + c.when : ""}${c.handsOff ? " · hands off to: " + c.handsOff.replace(/\s*\n\s*-?\s*/g, ", ").replace(/^-\s*/, "") : ""}`, 300) + ` (${c.cite})`;

// ---- for a chat -------------------------------------------------------------------------
const WAITING = /\b(waiting (on|for) me|waits on me|on my plate|assigned to me|what('?s| is| do i) (mine|own)|my (open )?(items|cases|work)|do i owe)\b/i;
const OWNER = /\b(who('?s| is)? ?(owns?|responsible|handles?|handling|does|doing|runs?|running|looks after|on)\b|owner of)/i;
// What a chat gets from your folders: the case items for "what's waiting on me" /
// "who owns X", and the few pieces that best answer the question, each with the
// file it's from. Never examples. { text, hits, steps } ("" when nothing bears on it).
function knowledgeFor(question, { file = KNOW_FILE, limit = HITS, cfg } = {}) {
  const c = cached(file); if (!Object.keys(c.idx.files).length) return { text: "", hits: [], steps: [] };
  const parts = [], steps = [];
  let answered = false; // the case files answer it: no loose excerpts next to that
  if (WAITING.test(question)) {
    const w = waitingOn("", { file, cfg }); answered = true;
    if (!w.me) parts.push(`What's waiting on them: their name isn't known, so the case files can't be matched to them (they can set it: symbiot knowledge me "Their Name").`);
    else {
      parts.push(`Case items waiting on ${w.me}, from the front matter of their own files (cite the file in brackets when you name one):\n` + (w.waiting.length ? w.waiting.slice(0, 8).map((i) => "- " + itemLine(i)).join("\n") : "- none") +
        (w.mine.length ? `\nOpen items ${w.me} owns:\n` + w.mine.slice(0, 8).map((i) => "- " + itemLine(i)).join("\n") : ""));
      steps.push(`checked ${w.waiting.length + w.mine.length} case item${w.waiting.length + w.mine.length === 1 ? "" : "s"} for you`);
    }
  }
  if (OWNER.test(question)) {
    const o = ownerOf(question, { file });
    if (o.length) { answered = true; parts.push("Who owns it, from their case files (cite the file in brackets when you use one):\n" + o.map((x) => "- " + (x.kind === "case" ? "case: " + caseLine(x) : "item: " + itemLine(x))).join("\n")); steps.push(`looked up who owns it in ${o.length} case file${o.length === 1 ? "" : "s"}`); }
  }
  const hits = answered ? [] : searchKnowledge(question, { file, limit, perFile: 1 });
  if (hits.length) {
    parts.push(`From their own files (when you use one, quote the words you rely on and cite its path, like "(source: ${hits[0].cite})"):\n` + hits.map((h) => `- ${h.cite}${h.where ? " › " + h.where : ""}: "${h.excerpt}"`).join("\n"));
    const name = (h) => h.rel.split("/").slice(-2).join("/"); // payroll/README.md, not README.md
    steps.push(`read ${hits.length === 1 ? name(hits[0]) : hits.length + " of your files: " + hits.map(name).join(", ")}`);
  }
  return { text: parts.join("\n\n"), hits, steps };
}

// For Settings and `symbiot knowledge`: each folder, what's read, the examples,
// the open items, and what isn't read yet.
function knowledgeState({ file = KNOW_FILE, cfg = loadConfig() } = {}) {
  const c = cached(file), files = Object.values(c.idx.files);
  return {
    me: myName(cfg), indexed: c.idx.at || 0,
    folders: knowledgeFolders(cfg).map((f) => {
      const fs = files.filter((x) => x.root === f.path), real = fs.filter((x) => !x.example);
      return { path: f.path, cite: cite(f.path), examples: f.examples, files: fs.length, exampleFiles: fs.length - real.length, pieces: fs.reduce((t, x) => t + (x.pieces || []).length, 0),
        cases: real.filter((x) => x.case).length, items: real.filter((x) => x.meta && (x.meta.owner || x.meta.status) && !DONE.test(String(x.meta.status || "").trim())).length, notRead: (c.idx.notRead || {})[f.path] || {} };
    }),
  };
}

export { KNOW_FILE, DEFAULT_EXAMPLES, knowledgeFolders, addKnowledgeFolder, removeKnowledgeFolder, isExample, frontMatter, csvRows, indexKnowledge, knowledgeTick, searchKnowledge, myName, setMyName, namesYou, waitingOn, ownerOf, knowledgeFor, knowledgeState, itemLine, caseLine };
