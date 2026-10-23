// symbiot — the user's customisations: Symbiot shaped to one person without touching the code it
// ships. The installed package is replaced on every update and agents may never edit it (guard.mjs),
// so what's theirs lives in ~/.config/symbiot/overrides/, read at start and again after each change:
//
// - rules/*.md      extra lines for every run's brief (all lanes, or the ones its front matter names)
// - prompts/*.md    additions at named hook points: brief, card (the card writer), triage (the
//                   question checkpoint), intuition (the chief-of-staff pass); prompts/<hook>.md or
//                   prompts/<hook>-<anything>.md
// - triage/*.json   intuition's extra triage: { relevance: [words], ignore: [topics],
//                   channels: { act|prepare|notice|focus: now|digest|never } }
// - triggers/*.mjs  export default { name, every (minutes, 5 or more) | on: "run", run(ctx) }:
//                   it reads ctx.state and reports what it notices with ctx.event(text, { lane });
//                   those become intuition events, triaged and tiered like any other
//
// What a customisation can never do: loosen a gate (the tiers, the guard, the Chrome and send holds,
// approvals), touch credentials, sending or deleting, or reach outside its ctx (a trigger imports
// nothing and touches no file, process or network). The loader enforces it, and a file that breaks
// a rule, or doesn't load, is skipped and reported, never crashes the app.
//
// Every change, the user's or one Symbiot proposed, goes one way (applyOverride): staged, checked
// (the file's own rules, node --check, a sandbox app started with it that must still answer),
// the old version snapshotted under .history/, installed, logged in CHANGES.md in plain words, and
// revertable in one step. The kill switch (config.overrides "off") sets the whole folder aside.
// Friction (detectFriction): the user correcting, repeating or swearing at the same behaviour turns
// into a proposed rule, with their own words as the evidence, for their Apply (21-22 Oct 2026: "can
// you stop asking me this and just fucking check yourself?", "do it yourself", "stop asking me").
import { join, dirname, basename } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync, copyFileSync, appendFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { CONFIG_DIR, loadConfig, readState, writeJsonAtomic, sameTask } from "./core.mjs";

const DIR = () => process.env.SYMBIOT_OVERRIDES_DIR || join(CONFIG_DIR, "overrides");
const KINDS = { rules: ".md", prompts: ".md", triage: ".json", triggers: ".mjs" };
const HOOKS = ["brief", "card", "triage", "intuition"];
const EVENTS_ON = ["run"];
const CHANNEL = ["now", "digest", "never"], MOVE_KINDS = ["act", "prepare", "notice", "focus"];
const NAME = /^[a-z0-9][a-z0-9_-]{0,60}$/;
const MAX_TEXT = 4000, KEEP = 300, DAY = 86400000, WEEK = 7 * DAY, CACHE_MS = 5000;
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };

// ---- the guardrails --------------------------------------------------------------------------------
// Words a customisation may not say: loosening an approval, a hold or a tier; credentials; sending,
// posting, paying or deleting on its own. A rule can make Symbiot stricter, quieter or more thorough,
// never let it do more without the user.
const LOOSENS = [
  /\b(skip|bypass|ignore|disable|turn off|remove|lift|loosen|override)\b[^.\n]{0,60}\b(approv\w*|permission\w*|go[- ]ahead|confirm\w*|guard|membrane|hold\w*|tier\w*|gate\w*|check\w*|limit\w*|cap)\b/i,
  /\b(without|no need (?:for|to)|don'?t|do not|never)\s+(?:\w+\s+){0,3}(ask\w*|wait\w*|approv\w*|confirm\w*)\b[^.\n]{0,60}\b(send\w*|email\w*|messag\w*|post\w*|publish\w*|pay\w*|delet\w*|deploy\w*|merg\w*|push\w*)\b/i,
  /\b(send\w*|email\w*|messag\w*|post\w*|publish\w*|pay\w*|delet\w*|deploy\w*|merg\w*|push\w*)\b[^.\n]{0,50}\b(without (?:asking|approval|permission|my ok|the user)|automatically|on (?:your|its) own|by yourself)\b/i,
  /\b(tier|tiers|promot\w*|chromegate|guard\.mjs|sends\.mjs|selfFile|SYMBIOT_OWNER|validat\w* (?:code|pipeline))\b/i,
  /\b(credential\w*|password\w*|secret\w*|api[- ]?key\w*|token\w*|2fa|otp|one-time code)\b/i,
];
// "never skip an approval" makes a rule stricter: a match right after never / not / don't / no is let be.
function loosens(text) {
  const t = String(text || "");
  for (const re of LOOSENS) { const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"); for (const m of t.matchAll(g)) { if (/\b(never|not|don'?t|do not|no|nor)\s+(?:\w+\s+)?$/i.test(t.slice(Math.max(0, m.index - 24), m.index))) continue;
      if (/^(?:never|not|don'?t|do not|no)\s+(?:\w+\s+){0,2}?(?:skip|bypass|ignore|break|loosen|get around)\b/i.test(m[0])) continue; /* "never skip an approval": a double no, stricter */ return `it would loosen a safety rule ("${clip(m[0], 60)}")`; } }
  return "";
}
// A trigger's code: it gets ctx and nothing else.
const UNSAFE = /\bimport\b|\brequire\s*\(|\bprocess\b|\bglobalThis\b|\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bchild_process\b|\bnode:|\bDeno\b|\bBun\b|\bsetInterval\s*\(|\bwhile\s*\(\s*true\s*\)/;
function codeTrouble(src) {
  const s = String(src || "").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ""), m = s.match(UNSAFE);
  if (m) return `a trigger may only use what it's given (ctx): "${m[0]}" isn't allowed`;
  if (!/\bexport\s+default\b/.test(s)) return "a trigger must export default { name, every or on, run(ctx) }";
  return "";
}
// Front matter: "---\nlanes: a, b\nwhy: …\n---\n".
function front(text) {
  const t = String(text || ""), m = t.match(/^---\n([\s\S]*?)\n---\n?/); if (!m) return { meta: {}, body: t };
  const meta = {}; for (const l of m[1].split("\n")) { const k = l.match(/^\s*([a-z]+)\s*:\s*(.*)$/i); if (k) meta[k[1].toLowerCase()] = k[2].trim(); }
  return { meta, body: t.slice(m[0].length) };
}
// One file's trouble, or "": what the loader and the pipeline both check.
function fileTrouble(kind, name, text) {
  if (!KINDS[kind]) return "not a kind of customisation (rules, prompts, triage or triggers)";
  if (!NAME.test(name)) return "its name must be short, lower-case letters, digits, - or _";
  const t = String(text || ""); if (!t.trim()) return "it's empty";
  if (t.length > (kind === "triggers" ? 20000 : MAX_TEXT)) return "it's too long";
  if (kind === "rules" || kind === "prompts") {
    const { meta, body } = front(t);
    if (kind === "prompts" && !HOOKS.some((h) => name === h || name.startsWith(h + "-"))) return `a prompt names its hook: ${HOOKS.join(", ")}`;
    if (meta.lanes && !/^[\w ,.-]+$/.test(meta.lanes)) return "its lanes line is a list of lane names";
    return loosens(body);
  }
  if (kind === "triage") {
    let o; try { o = JSON.parse(t); } catch { return "it isn't valid JSON"; }
    if (!o || typeof o !== "object" || Array.isArray(o)) return "it's a JSON object";
    const extra = Object.keys(o).filter((k) => !["relevance", "ignore", "channels", "why"].includes(k)); if (extra.length) return `only relevance, ignore and channels are allowed, not ${extra.join(", ")}`;
    for (const k of ["relevance", "ignore"]) if (o[k] != null && !(Array.isArray(o[k]) && o[k].every((x) => typeof x === "string" && x.length < 120))) return `${k} is a list of short words or topics`;
    if (o.channels != null) { if (typeof o.channels !== "object" || Array.isArray(o.channels)) return "channels maps a kind of move to now, digest or never"; for (const [k, v] of Object.entries(o.channels)) if (!MOVE_KINDS.includes(k) || !CHANNEL.includes(v)) return `channels: ${k} → ${v} isn't one of ${MOVE_KINDS.join("/")} → ${CHANNEL.join("/")}`; }
    return loosens([].concat(o.relevance || [], o.ignore || []).join(". "));
  }
  return codeTrouble(t);
}
// A loaded trigger's shape.
function triggerTrouble(t) {
  if (!t || typeof t !== "object") return "it exports nothing";
  if (typeof t.name !== "string" || !NAME.test(t.name)) return "its name must be short, lower-case";
  if (typeof t.run !== "function") return "it has no run(ctx)";
  if (t.on == null && !(Number(t.every) >= 5)) return "it needs every (minutes, 5 or more) or on: \"run\"";
  if (t.on != null && !EVENTS_ON.includes(t.on)) return `on is one of ${EVENTS_ON.join(", ")}`;
  return "";
}

// ---- loading ----------------------------------------------------------------------------------------
let cache = null;
const isOff = (cfg) => { try { return (cfg || loadConfig()).overrides === "off"; } catch { return false; } };
function readKind(dir, kind) {
  let names = []; try { names = readdirSync(join(dir, kind)).filter((f) => f.endsWith(KINDS[kind])).sort(); } catch { return []; }
  return names.map((f) => { const file = join(dir, kind, f); let text = ""; try { text = readFileSync(file, "utf8"); } catch {} return { kind, name: f.slice(0, -KINDS[kind].length), file, rel: `${kind}/${f}`, text }; });
}
// { on, rules, prompts, triage, triggerFiles, errors } from a folder (the live one, or a staging copy).
function loadFrom(dir, { cfg } = {}) {
  const out = { on: !isOff(cfg), dir, rules: [], prompts: {}, triage: { relevance: [], ignore: [], channels: {} }, triggerFiles: [], errors: [] };
  if (!out.on) return out;
  for (const kind of Object.keys(KINDS)) for (const f of readKind(dir, kind)) {
    const why = fileTrouble(kind, f.name, f.text); if (why) { out.errors.push({ file: f.rel, why }); continue; }
    if (kind === "rules") { const { meta, body } = front(f.text); out.rules.push({ file: f.rel, lanes: (meta.lanes || "").split(",").map((x) => x.trim()).filter(Boolean), text: body.trim() }); }
    else if (kind === "prompts") { const hook = HOOKS.find((h) => f.name === h || f.name.startsWith(h + "-")); (out.prompts[hook] = out.prompts[hook] || []).push(front(f.text).body.trim()); }
    else if (kind === "triage") { const o = JSON.parse(f.text); out.triage.relevance.push(...(o.relevance || [])); out.triage.ignore.push(...(o.ignore || [])); Object.assign(out.triage.channels, o.channels || {}); }
    else out.triggerFiles.push(f);
  }
  return out;
}
function overridesNow() { if (cache && Date.now() - cache.at < CACHE_MS) return cache.v; const v = loadFrom(DIR()); cache = { at: Date.now(), v }; return v; }
function reload() { cache = null; return overridesNow(); }

// ---- what the rest of Symbiot asks ---------------------------------------------------------------
// A run's brief: the user's own rules for this lane (or every lane), as brief lines.
function ruleLines(lane = "") {
  const o = overridesNow(), mine = o.rules.filter((r) => !r.lanes.length || r.lanes.includes(lane));
  const extra = promptFor("brief");
  if (!mine.length && !extra) return [];
  return ["## The user's own rules for how you work (their customisations: follow them; they never loosen a safety rule)", ...mine.map((r) => r.text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => (/^[-*]/.test(l) ? l : `- ${l}`)).join("\n")), ...(extra ? [extra] : []), ""];
}
// Extra words at a named hook point (card, triage, intuition, brief), or "".
function promptFor(hook) { const p = overridesNow().prompts[hook] || []; return p.length ? `\n\nThe user's own adjustments:\n${p.join("\n")}` : ""; }
// Intuition's extra triage: relevance words, topics to ignore, a channel per kind of move.
function triageExtra() { return overridesNow().triage; }

// ---- triggers ----------------------------------------------------------------------------------------
// Loaded with a fresh import each time the file changes; run with a time limit; what they report is
// held for intuition's event source (registerTriggers).
const TRIGGERS = new Map(); // name → { def, file, mtime, last, events }
const TRIGGER_MS = 5000;
async function importTrigger(f) {
  let mtime = 0; try { mtime = statSync(f.file).mtimeMs; } catch {}
  const mod = await import(`${pathToFileURL(f.file).href}?v=${mtime}`);
  const def = mod && mod.default, why = triggerTrouble(def);
  if (why) throw new Error(why);
  return { def, mtime };
}
async function loadTriggers() {
  const o = overridesNow(), seen = new Set(), errors = [];
  for (const f of o.triggerFiles) {
    try {
      const had = TRIGGERS.get(f.name); let mtime = 0; try { mtime = statSync(f.file).mtimeMs; } catch {}
      if (had && had.mtime === mtime) { seen.add(f.name); continue; }
      const { def } = await importTrigger(f);
      TRIGGERS.set(f.name, { def, file: f.rel, mtime, last: 0, events: had ? had.events : [] }); seen.add(f.name);
    } catch (e) { errors.push({ file: f.rel, why: String((e && e.message) || e) }); }
  }
  for (const k of [...TRIGGERS.keys()]) if (!seen.has(k)) TRIGGERS.delete(k);
  return { triggers: [...TRIGGERS.keys()], errors };
}
// ctx: a frozen copy of what it may read, and event() to report. state: { digest, goals, now }.
async function runTrigger(t, state, now = Date.now()) {
  const out = [], ctx = Object.freeze({ state: Object.freeze(JSON.parse(JSON.stringify(state || {}))), now, event: (text, o = {}) => { if (out.length < 5 && String(text || "").trim()) out.push({ text: clip(text, 240), lane: clip(o.lane, 60) }); } });
  try { await Promise.race([Promise.resolve(t.def.run(ctx)), new Promise((_, rej) => setTimeout(() => rej(new Error("took too long")), TRIGGER_MS))]); } catch (e) { return { error: String((e && e.message) || e), events: out }; }
  return { events: out };
}
// Each minute (server.mjs) and when a run ends ("run"): triggers that are due run, and what they
// report waits for intuition's next look.
async function triggersTick({ state = {}, on = "", now = Date.now() } = {}) {
  if (isOff()) { TRIGGERS.clear(); return { off: true }; }
  await loadTriggers();
  const ran = [];
  for (const [name, t] of TRIGGERS) {
    const due = on ? t.def.on === on : t.def.every && now - t.last >= Number(t.def.every) * 60000;
    if (!due) continue;
    t.last = now; const r = await runTrigger(t, state, now);
    for (const e of r.events) t.events.push({ id: `${name}:${createHash("sha1").update(e.text).digest("hex").slice(0, 10)}`, text: `${e.text} (your trigger "${name}")`, lane: e.lane });
    t.events = t.events.slice(-40); ran.push({ name, events: r.events.length, ...(r.error ? { error: r.error } : {}) });
  }
  return { ran };
}
// Intuition's sources gain one per trigger (intuition.mjs SOURCES); earlier ones are replaced.
function registerTriggers(sources) {
  if (!Array.isArray(sources)) return 0;
  for (let i = sources.length - 1; i >= 0; i--) if (String(sources[i].name).startsWith("override:")) sources.splice(i, 1);
  for (const [name, t] of TRIGGERS) sources.push({ name: `override:${name}`, list: () => t.events.slice() });
  return TRIGGERS.size;
}

// ---- the change pipeline ---------------------------------------------------------------------------
const INDEX = () => join(DIR(), "index.json"), CHANGES = () => join(DIR(), "CHANGES.md"), PROPOSALS = () => join(DIR(), "proposals.json");
function loadIndex() { const d = readState(INDEX(), (x) => x && Array.isArray(x.changes)); return d ? d : { changes: [] }; }
function saveIndex(d) { mkdirSync(DIR(), { recursive: true }); writeJsonAtomic(INDEX(), { changes: d.changes.slice(-KEEP) }, { indent: 1, mode: 0o600 }); }
function logChange(line, now = Date.now()) {
  mkdirSync(DIR(), { recursive: true });
  const had = existsSync(CHANGES()) ? "" : "# Your customisations: what changed\n\nNewest last. Each can be undone in Settings → Customisations, or with `symbiot overrides revert <id>`.\n\n";
  appendFileSync(CHANGES(), `${had}- ${new Date(now).toLocaleString("en-ZA", { hour12: false })}: ${line}\n`);
}
function copyTree(from, to) {
  for (const kind of Object.keys(KINDS)) { let names = []; try { names = readdirSync(join(from, kind)); } catch { continue; } mkdirSync(join(to, kind), { recursive: true }); for (const f of names) { try { copyFileSync(join(from, kind, f), join(to, kind, f)); } catch {} } }
}
// The app started on a sandbox home with the staged folder loaded: it must answer /api/ping and
// /api/home. A customisation that stops Symbiot answering never goes in.
async function smokeApp(staging, { timeout = 25000 } = {}) {
  const { sandboxEnv } = await import("./sandbox.mjs"), { mkdtempSync, realpathSync } = await import("node:fs"), { tmpdir } = await import("node:os");
  const home = realpathSync(mkdtempSync(join(tmpdir(), "symbiot-override-check-"))), cfg = join(home, ".config", "symbiot");
  mkdirSync(cfg, { recursive: true }); writeFileSync(join(cfg, "config.json"), JSON.stringify({}));
  const index = join(dirname(fileURLToPath(import.meta.url)), "index.mjs"), port = 7600 + Math.floor(Math.random() * 300);
  const app = spawn(process.execPath, [index, "app"], { env: { ...sandboxEnv(home, process.env, port), SYMBIOT_NO_OPEN: "1", SYMBIOT_OVERRIDES_DIR: staging }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; app.stdout.on("data", (d) => { out += d; }); app.stderr.on("data", (d) => { out += d; });
  const done = (r) => { try { app.kill("SIGTERM"); } catch {} setTimeout(() => { try { rmSync(home, { recursive: true, force: true }); } catch {} }, 1500); return r; };
  try {
    const url = await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("it didn't start")), timeout); app.stdout.on("data", () => { const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (m) { clearTimeout(t); res(`http://127.0.0.1:${m[1]}`); } }); app.on("exit", (c) => { clearTimeout(t); rej(new Error(`it stopped (exit ${c})`)); }); });
    let tk = ""; for (const f of ["secrets.json", "config.json"]) { try { tk = tk || JSON.parse(readFileSync(join(cfg, f), "utf8")).appToken || ""; } catch {} }
    for (const p of ["/api/ping", "/api/home"]) { const r = await fetch(url + p, { headers: { "x-symbiot-token": tk } }); if (!r.ok) return done({ ok: false, why: `${p} answered ${r.status}` }); }
    return done({ ok: true });
  } catch (e) { return done({ ok: false, why: String((e && e.message) || e) + (out ? `: ${clip(out.split("\n").filter(Boolean).slice(-2).join(" "), 200)}` : "") }); }
}
// change: { file: "rules/x.md", content, why, by: "user" | "symbiot", what? }. deps: { smoke(dir), note(line) }.
// { ok, id } or { error }; nothing is installed unless every check passed.
async function applyOverride(change = {}, deps = {}) {
  const now = Date.now(), id = randomBytes(4).toString("hex"), rel = String(change.file || "").replace(/^\/+/, "");
  const m = rel.match(/^(rules|prompts|triage|triggers)\/([^/]+)$/), kind = m && m[1], name = m && m[2].replace(/\.[a-z]+$/i, "");
  const fail = (why) => { const d = loadIndex(); d.changes.push({ id, file: rel, what: clip(change.what || rel, 140), why: clip(change.why, 300), by: change.by || "user", at: now, status: "failed", error: why }); try { saveIndex(d); logChange(`Tried ${rel || "a change"} (${change.by === "symbiot" ? "Symbiot's" : "yours"}): not installed, ${why}.`, now); } catch {} return { error: why, id }; };
  if (isOff()) return { error: "Customisations are switched off: turn them on in Settings → Customisations first." };
  if (!kind || !m[2].endsWith(KINDS[kind])) return fail(`it must be one of rules/*.md, prompts/*.md, triage/*.json or triggers/*.mjs`);
  const content = String(change.content || ""), why1 = fileTrouble(kind, name, content); if (why1) return fail(why1);
  const live = DIR(), staging = join(live, ".staging", id), file = join(staging, rel);
  try {
    mkdirSync(staging, { recursive: true }); copyTree(live, staging); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content);
    if (kind === "triggers") {
      const c = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", timeout: 15000 }); if (c.status !== 0) return fail(`it doesn't parse: ${clip(c.stderr, 160)}`);
      try { await importTrigger({ file, rel }); } catch (e) { return fail(String((e && e.message) || e)); }
    }
    const loaded = loadFrom(staging), bad = loaded.errors.find((e) => e.file === rel); if (bad) return fail(bad.why);
    const smoke = await (deps.smoke || smokeApp)(staging); if (!smoke || !smoke.ok) return fail(`Symbiot didn't run with it (${(smoke && smoke.why) || "no answer"})`);
    // snapshot what was there, then install
    const hist = join(live, ".history", id), target = join(live, rel), existed = existsSync(target);
    mkdirSync(hist, { recursive: true }); if (existed) copyFileSync(target, join(hist, basename(rel)));
    writeFileSync(join(hist, "meta.json"), JSON.stringify({ file: rel, existed, at: now }));
    mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content);
    const what = clip(change.what || `${existed ? "Changed" : "Added"} ${rel}`, 140), d = loadIndex();
    d.changes.push({ id, file: rel, what, why: clip(change.why, 300), by: change.by || "user", at: now, status: "active", existed }); saveIndex(d);
    logChange(`${what} [${id}], ${change.by === "symbiot" ? "proposed by Symbiot and applied with your OK" : "by you"}${change.why ? `: ${clip(change.why, 200)}` : ""}.`, now);
    reload(); if (deps.note) { try { deps.note(`Customisation: ${what}`); } catch {} }
    return { ok: true, id, what };
  } finally { try { rmSync(staging, { recursive: true, force: true }); } catch {} }
}
// One step back: the file as it was before that change (or gone, if it was new).
function revertOverride(id, deps = {}) {
  const d = loadIndex(), c = d.changes.find((x) => x.id === String(id || "") && x.status === "active"); if (!c) return { error: "There's no active change with that id." };
  const live = DIR(), hist = join(live, ".history", c.id), target = join(live, c.file);
  try { if (c.existed && existsSync(join(hist, basename(c.file)))) copyFileSync(join(hist, basename(c.file)), target); else rmSync(target, { force: true }); } catch (e) { return { error: String((e && e.message) || e) }; }
  c.status = "reverted"; c.revertedAt = Date.now(); saveIndex(d); logChange(`Undid ${c.what} [${c.id}].`); reload();
  if (deps.note) { try { deps.note(`Customisation undone: ${c.what}`); } catch {} }
  return { ok: true, id: c.id };
}
// The kill switch: off sets the whole folder aside (base behaviour); on brings it back.
function setOverrides(on, { load = loadConfig, save } = {}) { const cfg = load(); cfg.overrides = on ? "on" : "off"; if (save) save(cfg); cache = null; if (!on) TRIGGERS.clear(); return { ok: true, on: !!on }; }
function setSelfChange(mode, { load = loadConfig, save } = {}) { if (!["ask", "auto"].includes(mode)) return { error: "ask or auto" }; const cfg = load(); cfg.selfChange = mode; if (save) save(cfg); return { ok: true, selfChange: mode }; }

// ---- friction ---------------------------------------------------------------------------------------
// Themes the user keeps pushing back on, each with the rule that would answer it. Swearing counts
// toward whatever it's said about; a repeated instruction is its own theme.
const THEMES = [
  { theme: "check-yourself", re: /\b(stop asking|just (?:\w+ )?check|check (?:it )?(?:yourself|urself)|do it (?:yourself|urself)|why (?:are|is|do) (?:you|it|symbiot) (?:keep )?ask|you should know|how (?:should|must|would) i know)\b/i,
    rule: "Before you ask the user anything, check it yourself: look it up, read the records, open the site, or ask another agent. Ask them only for what no agent can find or do, and never whether something has happened." },
  { theme: "no-progress", re: /\b(nothing (?:is )?happen\w*|doesn'?t do anything|does nothing|not doing anything|nothing (?:is )?(?:being )?complet\w*|it'?s broken|running my patience|still not done|nothing was launched)\b/i,
    rule: "When the user says go ahead, do it in this run. If something truly stops you, say the one thing that blocks you and exactly where the user can clear it, then stop; never end a run having only checked and reported the same blocker again." },
  { theme: "cards", re: /\b(cards?|needs you)\b[^.?!]{0,80}\b(ask\w*|prompt\w*|annoy\w*|again|nothing|wtf|why)\b|\b(asking me|prompts me)\b/i,
    rule: "Write a question for the user only when it's a decision of theirs: one short question, the choices as options, and what each does. Never a status check, never their own words back, never a step an agent could take." },
  { theme: "say-it-plainly", re: /\b(shorten|plain words|what (?:the fuck|tf) is wrong|just say|too long|wall of text)\b/i,
    rule: "Say what's wrong or done in one plain line first, then the details. No git or file jargon in what the user reads first." },
];
const SWEAR = /\b(fuck\w*|wtf|shit\w*|bullshit|damn)\b/i;
const SYMBIOTS = /^\s*(?:the user\b|symbiot\b|\(symbiot|not the user'?s|🤖|done\b|go ahead\b|skip\b|close it\b|keep waiting\b)|\bthe user\b/i, LOOK = /^\s*(?:please\s+)?(?:take a )?(?:look|see|check)\s+(?:at\s+)?(?:this|that|these|the)\b/i;
// log: [{ ts, role, text }] (mind.mjs), answers: [{ at, q, a }] (card answers), now. Returns
// [{ theme, count, evidence: [quotes], rule }] for themes over the threshold, and repeats.
function detectFriction({ log = [], answers = [], now = Date.now(), min = 3 } = {}) {
  const said = log.filter((l) => l && l.role === "user" && now - (l.ts || 0) < WEEK && String(l.text || "").trim()).map((l) => ({ ts: l.ts, text: String(l.text), typed: true }))
    .concat(answers.filter((a) => a && now - (a.at || 0) < WEEK && String(a.a || "").trim() && !SYMBIOTS.test(String(a.a))).map((a) => ({ ts: a.at, text: String(a.a) }))); // an answer Symbiot wrote for the user isn't theirs
  const out = [];
  for (const th of THEMES) {
    const hits = said.filter((s) => th.re.test(s.text) || (SWEAR.test(s.text) && th.re.test(s.text.replace(SWEAR, ""))));
    if (hits.length >= min) out.push({ theme: th.theme, count: hits.length, evidence: hits.slice(-4).map((h) => clip(h.text, 160)), rule: th.rule });
  }
  // the same instruction, given again: an instruction, not "look at this screenshot", a question or a complaint
  const asks = said.filter((s) => s.typed).map((s) => ({ ...s, text: s.text.replace(/\(The user attached[^)]*\)/gi, "").trim() })).filter((s) => s.text.split(/\s+/).length >= 6 && !/\?/.test(s.text) && !SWEAR.test(s.text) && !LOOK.test(s.text) && !/\b(why|keeps?|again|still)\b/i.test(s.text));
  const rep = [];
  for (let i = 0; i < asks.length; i++) {
    const same = asks.filter((b, j) => j !== i && sameTask(b.text, asks[i].text));
    if (same.length && !rep.some((r) => sameTask(r.text, asks[i].text))) rep.push({ text: asks[i].text, count: same.length + 1 });
  }
  for (const r of rep.slice(0, 2)) out.push({ theme: `repeat-${createHash("sha1").update(r.text).digest("hex").slice(0, 6)}`, count: r.count, evidence: [clip(r.text, 160)], rule: `The user has said this ${r.count} times; treat it as standing: "${clip(r.text, 200)}". Read their answers and Symbiot's memory before asking anything it touches.` });
  return out.filter((f) => !loosens(f.rule));
}
function loadProposals() { const d = readState(PROPOSALS(), (x) => x && Array.isArray(x.list)); return d ? d : { list: [] }; }
function saveProposals(d) { mkdirSync(DIR(), { recursive: true }); writeJsonAtomic(PROPOSALS(), { list: d.list.slice(-100) }, { indent: 1, mode: 0o600 }); }
// New proposals from what detectFriction found: one per theme a week, never one already decided.
// write (optional): words the rule in the user's terms from the evidence, still checked by the guardrails.
async function proposeFromFriction(found, { write, now = Date.now() } = {}) {
  const d = loadProposals(), made = [];
  for (const f of found) {
    if (d.list.some((p) => p.theme === f.theme && (p.status === "pending" || now - (p.at || 0) < WEEK))) continue;
    let rule = f.rule;
    if (write) {
      try { const r = await write("Write one rule (one to three plain sentences, addressed to the AI agents) that would stop what this user keeps pushing back on. It may make the agents stricter, more thorough or quieter, never let them send, post, pay, delete, deploy or skip an approval. The rule only, no preamble.", `What they keep saying:\n${f.evidence.map((e) => `- "${e}"`).join("\n")}\n\nA starting point: ${f.rule}`, { fast: true, kind: "triage" }); const t = String((r && r.text) || "").trim(); if (t && t.length < 600 && !loosens(t)) rule = t; } catch {}
    }
    const name = `friction-${f.theme}`.slice(0, 60).replace(/[^a-z0-9_-]/g, "-");
    const content = `---\nwhy: you pushed back on this ${f.count} times this week\n---\n${rule}\n`;
    if (fileTrouble("rules", name, content)) continue;
    const p = { id: randomBytes(4).toString("hex"), theme: f.theme, file: `rules/${name}.md`, content, rule, why: `You pushed back on this ${f.count} time${f.count > 1 ? "s" : ""} this week`, evidence: f.evidence, at: now, status: "pending" };
    d.list.push(p); made.push(p);
  }
  if (made.length) saveProposals(d);
  return made;
}
// The user's Apply on a proposal: through the pipeline, as Symbiot's change with their OK.
async function applyProposal(id, deps = {}) {
  const d = loadProposals(), p = d.list.find((x) => x.id === String(id || "") && x.status === "pending"); if (!p) return { error: "That proposal isn't waiting any more." };
  const r = await applyOverride({ file: p.file, content: p.content, why: `${p.why}: ${p.evidence.map((e) => `"${e}"`).join(", ")}`, what: `A rule from what you kept saying: ${clip(p.rule, 100)}`, by: "symbiot" }, deps);
  const d2 = loadProposals(), q = d2.list.find((x) => x.id === p.id); if (q) { q.status = r.ok ? "applied" : "failed"; q.decided = Date.now(); if (r.id) q.change = r.id; if (r.error) q.error = r.error; saveProposals(d2); }
  return r.ok ? { ok: true, said: "Applied. You can undo it in Settings → Customisations.", id: r.id } : r;
}
function dismissProposal(id) { const d = loadProposals(), p = d.list.find((x) => x.id === String(id || "")); if (!p) return { error: "That proposal isn't there any more." }; p.status = "dismissed"; p.decided = Date.now(); saveProposals(d); return { ok: true }; }
// The friction check (server.mjs, every half hour): new proposals; with config.selfChange "auto",
// a rule (never a trigger or triage file) goes in through the same pipeline by itself.
async function frictionTick(deps = {}) {
  if (isOff()) return { off: true };
  let log = [], answers = []; try { log = deps.log ? deps.log() : []; } catch {} try { answers = deps.answers ? deps.answers() : []; } catch {}
  const made = await proposeFromFriction(detectFriction({ log, answers }), { write: deps.write });
  const cfg = (() => { try { return loadConfig(); } catch { return {}; } })(), applied = [];
  if (cfg.selfChange === "auto") for (const p of made) if (/^rules\//.test(p.file)) { const r = await applyProposal(p.id, deps); if (r.ok) applied.push(p.id); }
  return { proposed: made.length, applied };
}

// ---- where it shows ----------------------------------------------------------------------------------
// Updates: proposals waiting for Apply / Not now.
function overridesUpdates({ dismissed = new Set() } = {}) {
  if (isOff()) return [];
  return loadProposals().list.filter((p) => p.status === "pending" && !dismissed.has(`ovr:${p.id}`)).slice(-3).reverse()
    .map((p) => ({ id: `ovr:${p.id}`, key: `ovr:${p.id}`, title: `Change how Symbiot works? ${clip(p.rule, 600)} (${p.why.toLowerCase()})`, lane: "Customisations", overrides: true, accept: { id: p.id, label: "Apply" } }));
}
// Settings → Customisations.
function overridesState({ cfg } = {}) {
  const c = cfg || (() => { try { return loadConfig(); } catch { return {}; } })(), o = loadFrom(DIR(), { cfg: c }), d = loadIndex();
  return { on: c.overrides !== "off", selfChange: c.selfChange === "auto" ? "auto" : "ask", dir: DIR(),
    active: d.changes.filter((x) => x.status === "active").slice(-30).reverse().map(({ id, file, what, why, by, at }) => ({ id, file, what, why, by, at })),
    proposals: loadProposals().list.filter((p) => p.status === "pending").map(({ id, rule, why, evidence, at }) => ({ id, rule, why, evidence, at })),
    errors: o.errors, triggers: [...TRIGGERS.keys()], hooks: HOOKS };
}
// What the CLI prints: `symbiot overrides`.
function overridesText() {
  const s = overridesState(), L = [`Customisations: ${s.on ? "on" : "off (base behaviour)"} · self-change: ${s.selfChange} · ${s.dir}`];
  L.push(...(s.active.length ? s.active.map((a) => `  ${a.id}  ${a.what}  (${a.by}, ${new Date(a.at).toISOString().slice(0, 16).replace("T", " ")})`) : ["  none active"]));
  if (s.proposals.length) L.push("Proposed:", ...s.proposals.map((p) => `  ${p.id}  ${p.rule}`));
  if (s.errors.length) L.push("Skipped (not loaded):", ...s.errors.map((e) => `  ${e.file}: ${e.why}`));
  return L.join("\n");
}

export { DIR as OVERRIDES_DIR, KINDS, HOOKS, loosens, codeTrouble, fileTrouble, triggerTrouble, front, loadFrom, overridesNow, reload, ruleLines, promptFor, triageExtra, loadTriggers, runTrigger, triggersTick, registerTriggers, TRIGGERS, applyOverride, revertOverride, setOverrides, setSelfChange, smokeApp, detectFriction, proposeFromFriction, applyProposal, dismissProposal, frictionTick, overridesUpdates, overridesState, overridesText, loadIndex, loadProposals, THEMES };
