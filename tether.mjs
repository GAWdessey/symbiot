// symbiot — the tether: one shared log per lane, that every session working on the
// lane reads first and writes to. Each agent was soloing: a trading bot's session on the
// user's phone wrote a request to a REQUEST.md on the bot's server, then told them to
// "tell the PC session: Read and do REQUEST.md"; the PC agents never saw it, chat read it
// as GitHub work and as server work, and the user carried messages between sessions by
// hand (29 Oct 2026). Now there's one record per lane of who asked what, what was done
// and what is still open, and no session needs the user to carry anything.
//
// ~/.config/symbiot/tether/<lane>.json: { lane, entries: [{ id, key, at, lane, from,
// who: { session, device, run }, kind, to?, asked, done, open, status, closed?, source? }] }.
// kind: ask (a request to this lane), handover (work handed between lanes), request (a
// request file another session left, pulled down to this computer), finish (a run ended,
// in its own words), note. status: "open" for a request nobody has finished or turned
// down yet, "closed" once one has (closed: { at, by, note }), "" for what needs nothing.
//
// Who writes it:
// - Every brief (tasks.mjs buildTasksMd, mind.mjs actBrief) carries the lane's open
//   requests and newest entries (tetherBrief), and tells the agent to add its own in
//   .symbiot/TETHER.json, closing what it finished (`closes`). tetherTick takes those
//   in, once each, from every folder a run works in: the lane's own, a run beside it
//   (a worktree, par.json names the lane), an ops run (the lane it is for).
// - Symbiot itself logs what it already knows: each handover in lanes.json, in both
//   lanes' logs, closed when its result comes back; and each run's end, in its own last
//   words, so the log exists even when an agent forgets it.
// - A session that can't reach this computer (the phone's, a server's) leaves its ask as
//   a REQUEST.md that the lane pulls down, read-only where the lane's rules say so (the
//   bot's server is pulled from, never run on). Found in the lane's folder, it becomes an
//   open request here and a task for the lane, so its agent picks it up.
// - Chat reads it too (tetherLines, in Home's context), to answer "where are we".
// `symbiot tether` shows, adds to and closes it from a terminal.
import { join, relative } from "node:path";
import { hostname } from "node:os";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { CONFIG_DIR, readState, writeJsonAtomic, clipWords } from "./core.mjs";

const TETHER_DIR = join(CONFIG_DIR, "tether");
const FILE = "TETHER.json"; // what a run writes, in its .symbiot/
const KINDS = ["ask", "handover", "request", "finish", "note"], OPENS = new Set(["ask", "handover", "request"]);
const KEEP = 200, REQUESTS_EVERY = 5 * 60000, BRIEF_RECENT = 8, BRIEF_OPEN = 10, BACKFILL = 2 * 86400000;
const REQUEST_NAME = /^(?:[\w.-]*[-_.])?REQUEST\.md$/i, SKIP_DIRS = new Set([".git", "node_modules", ".symbiot", ".venv", "venv", "__pycache__", "dist", "build", ".next", "target"]), REQUEST_DEPTH = 5, REQUEST_MAX = 8000;

const str = (v, n) => clipWords(String(v ?? "").replace(/\s+/g, " ").trim(), n);
const digest = (...xs) => createHash("sha1").update(xs.map(String).join("\n")).digest("hex").slice(0, 16);
const safe = (lane) => String(lane || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[.-]+/, "").slice(0, 80);
const fileOf = (lane, dir = TETHER_DIR) => join(dir, `${safe(lane)}.json`);
const isOpen = (e) => e && e.status === "open";
const when = (t) => new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC";

// ---- the store ---------------------------------------------------------------------
function loadLog(lane, { dir = TETHER_DIR } = {}) {
  if (!safe(lane)) return { lane: "", entries: [] };
  const d = readState(fileOf(lane, dir));
  return { lane: String((d && d.lane) || lane), entries: d && Array.isArray(d.entries) ? d.entries : [] };
}
// What sessions asked and did can name people and accounts: yours only (0600). Open requests
// are never the ones dropped to keep it short.
function saveLog(log, { dir = TETHER_DIR } = {}) {
  const all = log.entries.slice().sort((a, b) => a.at - b.at), over = all.length - KEEP;
  const drop = over > 0 ? new Set(all.filter((e) => !isOpen(e)).slice(0, over)) : new Set();
  try { writeJsonAtomic(fileOf(log.lane, dir), { lane: log.lane, entries: all.filter((e) => !drop.has(e)) }, { indent: 1, mode: 0o600 }); return true; } catch { return false; }
}
function lanesLogged({ dir = TETHER_DIR } = {}) {
  try { return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => { const d = readState(join(dir, f)); return String((d && d.lane) || f.slice(0, -5)); }); } catch { return []; }
}
// One entry, shaped and bounded; null when it says nothing.
function shape(x, { lane, from, now = Date.now() } = {}) {
  if (!x || typeof x !== "object") return null;
  const kind = KINDS.includes(x.kind) ? x.kind : x.to && safe(x.to) !== safe(lane) ? "ask" : "note";
  const e = {
    lane, from: str(x.from || from || lane, 80), kind, at: Number.isFinite(x.at) ? x.at : Date.parse(x.at) || now,
    who: { session: str((x.who && x.who.session) || x.session, 120), device: str((x.who && x.who.device) || x.device, 60), run: str((x.who && x.who.run) || x.run, 60) },
    asked: str(x.asked, 1500), done: str(x.done, 1500), open: str(x.open, 800),
    ...(x.to ? { to: str(x.to, 80) } : {}), ...(x.source ? { source: str(x.source, 300) } : {}), ...(x.task ? { task: str(x.task, 40) } : {}),
  };
  if (!e.asked && !e.done && !e.open) return null;
  e.status = x.status === "closed" ? "closed" : OPENS.has(kind) && x.status !== "" ? "open" : "";
  return e;
}
// Add one, once: `key` says what it is (the same run's same words, the same handover), and an
// entry with a key already logged changes nothing. The entry, or the one there already.
function addEntry(lane, x, { key, now = Date.now(), dir = TETHER_DIR } = {}) {
  if (!safe(lane)) return { error: "Which lane? Give its name (a repo's folder name, or ops)." };
  const log = loadLog(lane, { dir }), e = shape(x, { lane: log.lane || lane, now });
  if (!e) return { error: "Nothing to log: say what was asked, done or is still open." };
  e.key = key || digest(lane, e.kind, e.from, e.asked, e.done, e.open, e.who.run);
  const had = log.entries.find((y) => y.key === e.key); if (had) return { entry: had, had: true };
  e.id = "t-" + randomBytes(3).toString("hex");
  log.entries.push(e);
  return saveLog(log, { dir }) ? { entry: e } : { error: `Couldn't write ${fileOf(lane, dir)}.` };
}
// Close an open request: finished, or turned down, with what was done. By id, or by key.
function closeEntry(lane, ref, { by = "", note = "", now = Date.now(), dir = TETHER_DIR } = {}) {
  const log = loadLog(lane, { dir }), e = log.entries.find((y) => y.id === ref || y.key === ref);
  if (!e) return { error: `There's no entry ${ref} in ${lane}'s log.` };
  if (!isOpen(e)) return { entry: e, had: true };
  e.status = "closed"; e.closed = { at: now, by: str(by, 120), note: str(note, 800) };
  return saveLog(log, { dir }) ? { entry: e } : { error: `Couldn't write ${fileOf(lane, dir)}.` };
}
// The lane's open requests (oldest first: the longest waiting), and its newest entries.
const openOf = (lane, o = {}) => loadLog(lane, o).entries.filter(isOpen).sort((a, b) => a.at - b.at);
const recentOf = (lane, n = BRIEF_RECENT, o = {}) => loadLog(lane, o).entries.slice().sort((a, b) => b.at - a.at).slice(0, n);

// ---- how an entry reads ------------------------------------------------------------
function whoOf(e) {
  const w = e.who || {}, bits = [w.session, w.device && `on ${w.device}`, w.run && `run ${w.run}`].filter(Boolean);
  return `${e.from && e.from !== e.lane ? e.from : e.lane}${bits.length ? ` (${bits.join(", ")})` : ""}`;
}
function entryLine(e) {
  const what = [e.asked && `asked: ${e.asked}`, e.done && `done: ${e.done}`, e.open && `still open: ${e.open}`].filter(Boolean).join("; ");
  const st = e.status === "open" ? " [open]" : e.status === "closed" ? ` [closed${e.closed && e.closed.by ? ` by ${e.closed.by}` : ""}${e.closed && e.closed.note ? `: ${e.closed.note}` : ""}]` : "";
  return `${when(e.at)} · ${e.id} · ${e.kind}${e.to && e.to !== e.lane ? ` to ${e.to}` : ""} · ${whoOf(e)}: ${what}${e.source ? ` (file: ${e.source})` : ""}${st}`;
}
// `symbiot tether show <lane>`: the whole log, newest last.
function logText(lane, o = {}) {
  const log = loadLog(lane, o);
  if (!log.entries.length) return `Nothing in ${lane}'s shared log yet.`;
  const open = log.entries.filter(isOpen);
  return [`${lane}'s shared log: ${log.entries.length} entr${log.entries.length === 1 ? "y" : "ies"}, ${open.length} open.`, ...log.entries.slice().sort((a, b) => a.at - b.at).map((e) => "- " + entryLine(e))].join("\n");
}

// ---- what every brief says ---------------------------------------------------------
function tetherBrief(lane, o = {}) {
  if (!safe(lane)) return [];
  const open = openOf(lane, o).slice(0, BRIEF_OPEN), recent = recentOf(lane, BRIEF_RECENT, o).filter((e) => !open.includes(e));
  return ["## The lane's shared log",
    `Every session working on \`${lane}\` shares one log: this computer's runs, runs beside them in copies of their own, ops runs and the design critic, the phone's and a server's sessions. Read it before you start: what other sessions asked, did and left open is there, so you never work blind and the user never carries a message from one session to another. The whole log: \`symbiot tether show ${lane}\`.`,
    ...(open.length ? ["- Open requests for this lane, oldest first. Each is work for you: do what your lane may do, and where its rules say no (a machine the user turned down, say), say so and close it anyway, with why:", ...open.map((e) => "  - " + entryLine(e))] : ["- No open requests for this lane."]),
    ...(recent.length ? ["- Lately:", ...recent.map((e) => "  - " + entryLine(e))] : []),
    `- Write to it when you ask something, hand over, or finish or stop: \`.symbiot/${FILE}\`, an array of \`{"kind": "ask|note|finish", "asked": "what was asked", "done": "what you did", "open": "what is still open, and on whom", "closes": ["<the id of each request above you finished or turned down>"]}\`. Symbiot adds who wrote it (session, device, run) and when, and takes it in within a minute. Your handovers (HANDOFF.md) and your run's end are logged by themselves, so write what they don't say.`,
    "- A session that can't reach this computer (the phone's, a server's) leaves its request as a `REQUEST.md` that the lane pulls down to this computer the way it pulls its data, read-only where the lane's rules say so: found in the lane's folder, it's logged here as an open request and becomes a task for the lane. Never tell the user to pass a request on to another session (\"tell the PC session…\"): write it here, or hand it over.",
    ""];
}
// For chat's context (home.mjs homeContext): what's open in every lane's log, and the newest entries.
function tetherLines({ now = Date.now(), dir = TETHER_DIR, within = 86400000, max = 12 } = {}) {
  const lanes = lanesLogged({ dir }), all = lanes.flatMap((l) => loadLog(l, { dir }).entries);
  const open = all.filter(isOpen).sort((a, b) => a.at - b.at), recent = all.filter((e) => !isOpen(e) && now - e.at < within).sort((a, b) => b.at - a.at);
  if (!open.length && !recent.length) return [];
  return ["Each lane's shared log (what every session asked, did and left open; answer 'where are we' and 'did the other session see it?' from this, never tell the user to carry a message between sessions):",
    ...open.slice(0, max).map((e) => `- [${e.lane}] ${entryLine(e)}`), ...recent.slice(0, max).map((e) => `- [${e.lane}] ${entryLine(e)}`)];
}

// ---- taking it in ------------------------------------------------------------------
const parseJson = (t) => { try { return JSON.parse(String(t || "")); } catch { return null; } };
// .symbiot/TETHER.json: an array of entries (or one), each maybe with `closes`.
function parseTether(text) {
  const a = parseJson(text), list = Array.isArray(a) ? a : a && Array.isArray(a.entries) ? a.entries : a && typeof a === "object" ? [a] : [];
  return list.filter((x) => x && typeof x === "object").slice(0, 40).map((x) => ({ ...x, closes: (Array.isArray(x.closes) ? x.closes : x.closes ? [x.closes] : []).map((c) => String(c).trim()).filter(Boolean).slice(0, 20) }));
}
// The request files in a lane's folder: REQUEST.md (or <name>-REQUEST.md), a few levels down.
function requestFiles(root, { depth = REQUEST_DEPTH } = {}) {
  const out = [], walk = (d, n) => {
    let ents = []; try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const x of ents) {
      if (x.isDirectory()) { if (n < depth && !SKIP_DIRS.has(x.name) && !x.name.startsWith(".")) walk(join(d, x.name), n + 1); }
      else if (x.isFile() && REQUEST_NAME.test(x.name)) out.push(join(d, x.name));
    }
  };
  if (root && existsSync(root)) walk(root, 0);
  return out.slice(0, 50);
}
// Who a request file says it's from, from its title: "# Request from the phone session (2026-10-29) -- …".
function requestWho(text) {
  const head = (String(text).split("\n").find((l) => l.trim()) || "").replace(/^#+\s*/, "");
  const sess = (/\bfrom (?:the |my |[\w]+'s )?([\w .'-]{2,40}?)(?: session| agent| run|\s*\(|\s+--|\s+—|$)/i.exec(head) || [])[1] || "";
  const device = /\bphone\b/i.test(head) ? "phone" : /\b(?:vm|server)\b/i.test(head) ? "a server" : /\b(?:pc|laptop|desktop|computer)\b/i.test(head) ? "pc" : "";
  return { session: sess ? `${sess.trim()} session` : "another session", device, title: clipWords(head, 200) };
}
// The task a request file becomes in its lane: what to read, and how to close it.
const requestTask = (e, rel) => `A request from another session came in for this lane (${whoOf(e)}, ${when(e.at)}), pulled down to this computer at \`${rel}\`: "${clipWords(e.asked, 240)}". Read the file and do what it asks that this lane may do. Where the lane's rules say no (a machine the user turned down, an account it must not touch), don't: say so in the lane's shared log and in your last message, with what you did instead. Then close it in the log (\`"closes": ["${e.id}"]\` in .symbiot/${FILE}).`;

// One pass, from the app every minute. deps (the app passes them; tests give their own):
// - folders: [{ path, lane }], every folder a run works in, with the lane it is for
// - lanes: { name: path }, the lane folders, scanned for request files
// - handoffs: lanes.json's rows; runs: [{ path, lane, name, endedAt, final }], runs that ended
// - add(text, lane) / push(lane): a request file becomes a task for its lane
// - requests: look for request files on this pass (every REQUESTS_EVERY when not given: it walks every lane's folder)
// { added, closed, tasks }
let requestsAt = 0;
function tetherTick({ folders = [], lanes = {}, handoffs = [], runs = [], add, push, requests, now = Date.now(), dir = TETHER_DIR, device = hostname() } = {}) {
  let added = 0, closed = 0; const tasks = [];
  const put = (lane, x, key) => { const r = addEntry(lane, x, { key, now, dir }); if (r.entry && !r.had) added++; return r; };
  // what runs wrote, once each
  for (const f of folders) {
    let text = ""; try { text = readFileSync(join(f.path, ".symbiot", FILE), "utf8"); } catch { continue; }
    const run = (/(act-[0-9a-z]+|[\w.-]+-[0-9a-f]{6})$/i.exec(f.path) || [])[1] || "";
    for (const x of parseTether(text)) {
      const to = x.to && safe(x.to) !== safe(f.lane) ? String(x.to) : "", target = to || f.lane;
      const said = { ...x, from: f.lane, session: x.session || (run ? `run in ${run}` : `${f.lane}'s run`), device: x.device || device, run: x.run || run };
      if (x.asked || x.done || x.open) put(target, said, digest("file", f.path, target, x.kind, x.asked, x.done, x.open));
      for (const id of x.closes) for (const l of new Set([f.lane, target])) { const r = closeEntry(l, id, { by: said.session, note: [x.done, x.open].filter(Boolean).join("; "), now, dir }); if (r.entry && !r.had) closed++; }
    }
  }
  // handovers: an open request in the lane that has it, a note in the one that asked; closed, and
  // its result noted for the asker, once it comes back
  for (const h of handoffs) {
    const from = h && h.from && h.from.lane, to = h && h.to && h.to.lane;
    if (!h || !h.id || !from || !to) continue;
    const key = `handoff:${h.id}`, back = h.reportedAt || h.status === "error", run = String(h.job || "").slice(0, 60);
    if (now - (h.at || 0) <= BACKFILL) {
      put(to, { kind: "handover", from, to, at: h.at, asked: h.text, open: `${to} has it`, session: `${from}'s agent`, device, run }, key);
      put(from, { kind: "handover", from, to, at: h.at, asked: `handed to ${to}: ${h.text}`, open: back ? "" : `waiting on ${to}`, status: "", session: `${from}'s agent`, device }, key);
    }
    if (!back) continue;
    const r = closeEntry(to, key, { by: `${to}'s agent`, note: h.result || h.error || h.status, now, dir }); if (r.entry && !r.had) closed++;
    if (r.entry && !r.had) put(from, { kind: "note", from: to, at: h.reportedAt || now, done: `${to} came back on "${clipWords(h.text, 120)}": ${h.result || h.error || h.status}`, session: `${to}'s agent`, device, run }, `${key}:back`);
  }
  // each run's end, in its own last words
  for (const r of runs) {
    const final = String((r && r.final) || "").trim();
    if (!r || !r.lane || !final || now - (r.endedAt || 0) > BACKFILL) continue;
    const run = (/(act-[0-9a-z]+|[\w.-]+-[0-9a-f]{6})$/i.exec(r.path || "") || [])[1] || "";
    put(r.lane, { kind: "finish", from: r.lane, at: r.endedAt, done: final, session: str(r.name, 120) || `${r.lane}'s run`, device, run }, digest("run", r.path, r.endedAt));
  }
  // request files other sessions left, pulled down into the lane's folder
  if (requests === undefined) requests = now - requestsAt >= REQUESTS_EVERY;
  if (requests) requestsAt = now;
  for (const [lane, root] of requests ? Object.entries(lanes) : []) {
    for (const p of requestFiles(root)) {
      let text = "", st; try { st = statSync(p); text = readFileSync(p, "utf8").slice(0, REQUEST_MAX); } catch { continue; }
      if (!text.trim()) continue;
      const who = requestWho(text), rel = relative(root, p), key = digest("request", p, text);
      const r = put(lane, { kind: "request", from: lane, at: st.mtimeMs, asked: who.title || clipWords(text, 300), session: who.session, device: who.device, source: rel }, key);
      if (r.entry && !r.had && add) { const t = add(requestTask(r.entry, rel), lane); if (t && t.id) { tasks.push({ lane, task: t.id }); try { push && push(lane); } catch {} } }
    }
  }
  return { added, closed, tasks };
}

export { TETHER_DIR, FILE as TETHER_FILE, KINDS, safe as laneFile, loadLog, saveLog, lanesLogged, addEntry, closeEntry, openOf, recentOf, entryLine, logText, tetherBrief, tetherLines, parseTether, requestFiles, requestWho, requestTask, tetherTick };
