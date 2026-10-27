// symbiot — one Symbiot to another (docs/SYNC.md). Garth works the same projects from two
// computers; GitHub carried the code, but memory, standing rules, every lane's tasks, questions
// and answers, and the vault stayed on the machine they were made on (24 Oct 2026).
// A private git repo (or any folder both can reach) holds keys.json (the sync key, wrapped with
// a key made from the vault PIN) and machines/<id>.enc (each machine's state, AES-256-GCM).
// Each machine writes only its own file, so git never conflicts; each merges the others in.
// A record is { f: { field: [value, changedAt] }, del?: deletedAt }: per field, the newer change
// wins, and a delete wins only over changes older than it.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync, createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { CONFIG_DIR, readState, writeJsonAtomic, writeAtomic, loadTasks, saveTasks, privateDir } from "./core.mjs";
import { loadMind, saveMind } from "./mind.mjs";
import { LANE_IDS } from "./laneids.mjs";

const DIR = () => join(CONFIG_DIR, "sync"), REPO = () => join(DIR(), "repo");
const CONF = () => join(DIR(), "sync.json"), LAST = () => join(DIR(), "published.json"), CONFLICTS = () => join(CONFIG_DIR, "sync-conflicts.json");
const KEY_NAME = "symbiot sync key"; // the sync key, in this machine's own vault; never synced itself
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, BRANCH = "main", CONFLICTS_KEEP = 200;
const git = promisify(execFile);
const G = (args, cwd = REPO()) => git("git", ["-c", "user.name=Symbiot", "-c", "user.email=sync@symbiot.local", "-c", "commit.gpgsign=false", ...args], { cwd, timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
const h = (v) => createHash("sha1").update(JSON.stringify(v ?? null)).digest("hex");
const same = (a, b) => h(a) === h(b);
const conf = () => readState(CONF()) || null;

// ---- the sealed files ------------------------------------------------------------
const seal = (key, obj) => { const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv), ct = Buffer.concat([c.update(gzipSync(JSON.stringify(obj))), c.final()]); return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") }); };
function unseal(key, text) {
  const o = JSON.parse(text), d = createDecipheriv("aes-256-gcm", key, Buffer.from(o.iv, "base64")); d.setAuthTag(Buffer.from(o.tag, "base64"));
  return JSON.parse(gunzipSync(Buffer.concat([d.update(Buffer.from(o.ct, "base64")), d.final()])).toString("utf8"));
}
// keys.json: the sync key, sealed with scrypt(PIN). Only the PIN opens it.
function wrapKey(key, pin) { const salt = randomBytes(16), k = scryptSync(String(pin), salt, 32, SCRYPT); return { v: 1, salt: salt.toString("base64"), N: SCRYPT.N, wrapped: JSON.parse(seal(k, { key: key.toString("base64") })) }; }
function unwrapKey(keys, pin) {
  try { const k = scryptSync(String(pin), Buffer.from(keys.salt, "base64"), 32, { ...SCRYPT, N: keys.N || SCRYPT.N }); return Buffer.from(unseal(k, JSON.stringify(keys.wrapped)).key, "base64"); }
  catch { return null; }
}

// ---- what travels: each collection read as { key: fields }, and written back -------------
const laneMap = () => { const d = readState(LANE_IDS(), (x) => x && typeof x === "object") || {}; return d.ids || {}; };
// A lane's key on every machine: a git lane's id is its first commit (laneids.mjs), the same anywhere; else its name.
const laneKey = (id, name) => (/^g/.test(id || "") ? id : "n:" + String(name || "").toLowerCase());
// One key per folder: two ids naming one folder (one of them stale, from before a clone of the same
// repo came) put another lane's questions in it and deleted its own (27 Oct 2026). The newest stands.
function localLanes() {
  const byKey = {}, byPath = new Map();
  for (const [id, v] of Object.entries(laneMap())) if (v && v.path) { const o = byPath.get(v.path); if (!o || (v.at || 0) > (o.v.at || 0)) byPath.set(v.path, { id, v }); }
  for (const { id, v } of byPath.values()) byKey[laneKey(id, v.name)] = { id, name: v.name, path: v.path };
  return byKey;
}
const LANE_FILES = ["QUESTIONS.md", "ANSWERS.md"];
const listFile = (f) => join(CONFIG_DIR, f);
const COLLECTIONS = {
  tasks: {
    read() {
      const out = {};
      for (const t of loadTasks()) if (t && t.id) { const { laneId, repo, ...rest } = t; out[t.id] = { ...rest, lane: laneKey(laneId, repo), laneName: repo || "" }; }
      return out;
    },
    write(recs) {
      const lanes = localLanes(), cur = loadTasks(), seen = new Set(), out = [];
      const local = (r) => { const { lane, laneName, ...t } = r, l = lanes[lane]; return { ...t, repo: l ? l.name : laneName, ...(l ? { laneId: l.id } : /^g/.test(lane) ? { laneId: lane } : {}) }; };
      for (const t of cur) { if (!t || !t.id || !(t.id in recs)) continue; seen.add(t.id); if (recs[t.id]) out.push(local(recs[t.id])); }
      for (const [id, r] of Object.entries(recs)) if (r && !seen.has(id)) out.push(local(r));
      saveTasks(out);
    },
    once: ["laneName"], // the name it had where it was made: each machine has its own folder name for it
  },
  // one record per fact: two machines adding facts to the same name both keep theirs
  memory: {
    read() { const out = {}; for (const n of loadMind().nodes) for (const f of n.facts || []) if (f && f.text) out[String(n.name).toLowerCase() + "\n" + f.text] = { name: n.name, kind: n.kind, fact: f }; return out; },
    write(recs) {
      const d = loadMind(), facts = new Map();
      for (const r of Object.values(recs)) if (r) { const k = String(r.name).toLowerCase(); if (!facts.has(k)) facts.set(k, { r, list: [] }); facts.get(k).list.push(r.fact); }
      const nodes = [];
      for (const n of d.nodes) { const k = String(n.name).toLowerCase(), f = facts.get(k); if (!f) { if (!(n.facts || []).length) nodes.push(n); continue; } const had = new Set((n.facts || []).map((x) => x.text)); nodes.push({ ...n, kind: f.r.kind || n.kind, facts: [...(n.facts || []).filter((x) => f.list.some((y) => y.text === x.text)), ...f.list.filter((y) => !had.has(y.text))] }); facts.delete(k); }
      for (const [, f] of facts) nodes.push({ id: randomBytes(4).toString("hex"), name: f.r.name, kind: f.r.kind || "thing", facts: f.list, ts: Math.max(...f.list.map((x) => x.ts || 0)) || Date.now() });
      saveMind({ ...d, nodes });
    },
  },
  rules: listCollection("standing.json", (x) => x && x.rule && String(x.rule).toLowerCase()),
  shared: listCollection("answers-shared.json", (x) => x && x.key),
  asked: listCollection("asks-done.json", (x) => x && (x.k || x.q)),
  // a lane's questions and answers, written into that lane's own folder on each machine
  lanes: {
    read() {
      const out = {};
      for (const [k, l] of Object.entries(localLanes())) for (const f of LANE_FILES) { let text; try { text = readFileSync(join(l.path, ".symbiot", f), "utf8"); } catch { continue; } out[k + "/" + f] = { text }; }
      return out;
    },
    write(recs, gone) {
      const lanes = localLanes();
      for (const [key, r] of Object.entries(recs)) {
        const i = key.lastIndexOf("/"), l = lanes[key.slice(0, i)]; if (!l) continue;
        const p = join(l.path, ".symbiot", key.slice(i + 1));
        if (!r) { if (gone.has(key)) try { rmSync(p, { force: true }); } catch {} continue; }
        let cur; try { cur = readFileSync(p, "utf8"); } catch {} if (cur !== r.text) { mkdirSync(join(l.path, ".symbiot"), { recursive: true }); writeAtomic(p, r.text, { mode: 0o644 }); }
      }
    },
    // a lane this machine doesn't have: its records wait in the sync state until it does
    here: (key) => key.slice(0, key.lastIndexOf("/")) in localLanes(),
    merge: { text: (a, b, key) => (key.endsWith("/ANSWERS.md") ? unionSections(a, b) : null) },
  },
  vault: {
    async read() {
      const v = await import("./vault.mjs"), out = {};
      for (const s of v.listSecrets()) { if (s.name === KEY_NAME) continue; const e = v.peekSecret(s.name); if (e.ok && !e.once) out[s.name] = { values: e.values }; }
      return out;
    },
    async write(recs) {
      const v = await import("./vault.mjs");
      for (const [name, r] of Object.entries(recs)) {
        if (name === KEY_NAME) continue;
        if (!r) { v.deleteSecret(name); continue; }
        const cur = v.peekSecret(name); if (cur.ok && same(cur.values, r.values)) continue;
        if (cur.ok) v.deleteSecret(name);
        v.saveSecret(name, r.values.map((x) => x.v)); for (const x of r.values) if (x.used) v.markUsed(name, x.v);
      }
    },
  },
};
function listCollection(file, keyOf) {
  return {
    read() { const out = {}; for (const x of readState(listFile(file), Array.isArray) || []) { const k = keyOf(x); if (k) out[k] = { e: x }; } return out; },
    write(recs) {
      const cur = readState(listFile(file), Array.isArray) || [], seen = new Set(), out = [];
      for (const x of cur) { const k = keyOf(x); if (!k || !(k in recs)) { out.push(x); continue; } seen.add(k); if (recs[k]) out.push(recs[k].e); }
      for (const [k, r] of Object.entries(recs)) if (r && !seen.has(k)) out.push(r.e);
      writeJsonAtomic(listFile(file), out, { mode: 0o600 });
    },
  };
}
// Both machines answered in one lane: every answer from both, each once, in the order they came.
function unionSections(a, b) {
  const parts = (s) => String(s || "").split(/^(?=### )/m), pa = parts(a), seen = new Set(pa.map((x) => x.trim()));
  return pa.concat(parts(b).slice(1).filter((x) => !seen.has(x.trim()))).join("").replace(/([^\n])(### )/g, "$1\n\n$2");
}

// ---- stamping and merging ----------------------------------------------------------
// This machine's state as records, each field stamped with when it last changed here
// (compared with what it published last time). A record gone since is a tombstone.
async function stamped(last = {}, now = Date.now()) {
  const out = {};
  for (const [name, c] of Object.entries(COLLECTIONS)) {
    const cur = await c.read(), was = last[name] || {}, recs = {};
    for (const [k, fields] of Object.entries(cur)) {
      const p = was[k] && !was[k].del ? was[k].f : {}, f = {};
      for (const [fk, v] of Object.entries(fields)) f[fk] = (c.once || []).includes(fk) && p[fk] ? p[fk] : p[fk] && same(p[fk][0], v) ? p[fk] : [v, now];
      for (const fk of Object.keys(p)) if (!(fk in fields)) f[fk] = p[fk][0] === null ? p[fk] : [null, Math.max(now, p[fk][1] + 1)]; // a field taken away
      recs[k] = { f };
    }
    for (const [k, r] of Object.entries(was)) if (!(k in cur)) recs[k] = r.del || (c.here && !c.here(k)) ? r : { del: now, f: r.f }; // gone here, unless it's for a lane not here
    out[name] = recs;
  }
  return out;
}
const newest = (r) => Math.max(0, ...Object.values(r.f || {}).map((x) => x[1]));
const alive = (r) => r && (!r.del || newest(r) > r.del);
// Theirs into mine, per field. prev: what this machine published last time, the value both started
// from; a field both changed away from it is a conflict.
function mergeRecords(mine, theirs, { prev = {}, merge = {}, conflicts = [], coll = "" } = {}) {
  const out = { ...mine };
  for (const [k, t] of Object.entries(theirs)) {
    const m = mine[k]; if (!m) { out[k] = t; continue; }
    const f = { ...m.f };
    for (const [fk, tv] of Object.entries(t.f || {})) {
      const mv = f[fk]; if (!mv) { f[fk] = tv; continue; }
      if (same(mv[0], tv[0])) { f[fk] = [mv[0], Math.max(mv[1], tv[1])]; continue; }
      const was = prev[k] && prev[k].f && prev[k].f[fk], both = !(was && (same(was[0], mv[0]) || same(was[0], tv[0])));
      const custom = merge[fk] && both ? merge[fk](mv[0], tv[0], k) : null;
      if (custom != null) { f[fk] = [custom, Math.max(mv[1], tv[1]) + 1]; continue; }
      const win = tv[1] > mv[1] ? tv : mv, lose = win === tv ? mv : tv;
      if (both) conflicts.push({ coll, key: k, field: fk, kept: win[0], replaced: lose[0], at: Date.now() });
      f[fk] = win;
    }
    const del = Math.max(m.del || 0, t.del || 0);
    out[k] = del ? { del, f } : { f };
  }
  return out;
}
const toLocal = (recs) => Object.fromEntries(Object.entries(recs).map(([k, r]) => [k, alive(r) ? Object.fromEntries(Object.entries(r.f).filter(([, v]) => v[0] !== null).map(([fk, v]) => [fk, v[0]])) : null]));
async function applyLocal(before, after) {
  for (const [name, c] of Object.entries(COLLECTIONS)) {
    const a = after[name] || {}, b = before[name] || {}, changed = {}, gone = new Set();
    for (const [k, r] of Object.entries(a)) if (!same(r, b[k])) { changed[k] = r; if (!alive(r) && alive(b[k])) gone.add(k); }
    if (!Object.keys(changed).length) continue;
    // a list collection is written whole: unchanged records ride along as they are
    const full = toLocal(a), only = Object.fromEntries(Object.keys(changed).map((k) => [k, full[k]]));
    await c.write(name === "lanes" ? only : full, gone);
  }
}

// ---- the commands ------------------------------------------------------------------------
const myId = () => (conf() || {}).machine || "";
async function vaultPinOk(pin, { setIfNone = false } = {}) {
  const V = await import("./vaultview.mjs");
  if (!V.vaultList().pin) { if (!setIfNone) return { error: "Set a vault PIN first (the Vault page): it's what locks the sync." }; const r = V.setPin(pin); return r.error ? r : { ok: true, set: true }; }
  const r = V.unlock(pin); if (r.ok) V.lock(r.token); return r.ok ? { ok: true } : r;
}
async function keepKey(key) { const v = await import("./vault.mjs"); if (v.peekSecret(KEY_NAME).ok) v.deleteSecret(KEY_NAME); const r = v.saveSecret(KEY_NAME, [key.toString("base64")]); return !r.error; }
async function syncKey() { const v = await import("./vault.mjs"), r = v.peekSecret(KEY_NAME); return r.ok && r.values[0] ? Buffer.from(r.values[0].v, "base64") : null; }
async function clone(url) {
  privateDir(DIR()); rmSync(REPO(), { recursive: true, force: true });
  await G(["clone", "--quiet", url, REPO()], DIR());
  try { await G(["checkout", "--quiet", "-B", BRANCH, "origin/" + BRANCH]); } catch { await G(["checkout", "--quiet", "-B", BRANCH]); } // an empty repo: the branch starts here
}
// First machine: the sync key, made here and locked with the vault PIN, into the repo.
async function init(url, pin, { name = hostname() } = {}) {
  const ok = await vaultPinOk(pin); if (ok.error) return ok;
  await clone(url);
  if (existsSync(join(REPO(), "keys.json"))) return { error: "That repo is already set up for sync: pair this computer to it instead (symbiot sync pair)." };
  const key = randomBytes(32);
  writeFileSync(join(REPO(), "keys.json"), JSON.stringify(wrapKey(key, pin), null, 1));
  if (!(await keepKey(key))) return { error: "Couldn't keep the sync key in this computer's vault." };
  writeJsonAtomic(CONF(), { url, machine: randomBytes(6).toString("hex"), name, at: Date.now(), met: {} });
  await G(["add", "keys.json"]); await G(["commit", "--quiet", "-m", "sync: keys"]); await G(["push", "--quiet", "-u", "origin", BRANCH]);
  return { ok: true, machine: myId(), ...(await now()) };
}
// Another machine: the same repo, opened with the same vault PIN.
async function pair(url, pin, { name = hostname() } = {}) {
  await clone(url);
  const keys = readState(join(REPO(), "keys.json")); if (!keys) return { error: "That repo isn't set up for sync yet: run symbiot sync init on the first computer." };
  const key = unwrapKey(keys, pin);
  if (!key) { const V = await import("./vaultview.mjs"); if (V.vaultList().pin) await vaultPinOk(pin); return { error: "That PIN doesn't open the sync: use the vault PIN of the computer that set it up." }; } // a wrong PIN counts against the vault's tries
  const ok = await vaultPinOk(pin, { setIfNone: true }); if (ok.error) return { error: ok.error.replace("That PIN isn't right", "That PIN opens the sync but isn't this computer's vault PIN") };
  if (!(await keepKey(key))) return { error: "Couldn't keep the sync key in this computer's vault." };
  writeJsonAtomic(CONF(), { url, machine: randomBytes(6).toString("hex"), name, at: Date.now(), met: {} });
  return { ok: true, machine: myId(), pinSet: !!ok.set, ...(await now()) };
}
// Pull, merge every other machine in, write the result here, publish ours. Safe to run any time.
async function now({ at = Date.now() } = {}) {
  const c = conf(); if (!c || !c.url) return { error: "Not paired: symbiot sync init <repo> on the first computer, symbiot sync pair <repo> on the next." };
  const key = await syncKey(); if (!key) return { error: "This computer's sync key is gone from its vault: pair it again (symbiot sync pair)." };
  if (!existsSync(join(REPO(), ".git"))) await clone(c.url);
  await G(["fetch", "--quiet", "origin"]); try { await G(["reset", "--quiet", "--hard", "origin/" + BRANCH]); } catch {}
  const last = readState(LAST()) || {}, mine = await stamped(last, at), conflicts = [], met = { ...(c.met || {}) }, from = [];
  let merged = mine;
  const dir = join(REPO(), "machines"); let files = []; try { files = readdirSync(dir).filter((f) => f.endsWith(".enc") && f !== c.machine + ".enc"); } catch {}
  for (const f of files) {
    let theirs; try { theirs = unseal(key, readFileSync(join(dir, f), "utf8")); } catch { from.push({ machine: f.replace(/\.enc$/, ""), error: "couldn't open it with this sync key" }); continue; }
    const id = f.replace(/\.enc$/, ""), next = {};
    for (const name of Object.keys(COLLECTIONS)) next[name] = mergeRecords(merged[name] || {}, (theirs.state || {})[name] || {}, { prev: last[name] || {}, merge: COLLECTIONS[name].merge, conflicts, coll: name });
    merged = next; met[id] = theirs.at || at; from.push({ machine: id, name: theirs.name || "" });
  }
  await applyLocal(mine, merged);
  writeJsonAtomic(LAST(), merged, { indent: 0, mode: 0o600 });
  if (conflicts.length) writeJsonAtomic(CONFLICTS(), [...(readState(CONFLICTS(), Array.isArray) || []), ...conflicts].slice(-CONFLICTS_KEEP), { mode: 0o600 });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, c.machine + ".enc"), seal(key, { v: 1, machine: c.machine, name: c.name, at, state: merged }));
  await G(["add", "-A"]);
  let pushed = false;
  for (let i = 0; i < 3 && !pushed; i++) {
    try { await G(["commit", "--quiet", "-m", "sync: " + c.machine]); } catch {} // nothing new is fine
    try { await G(["push", "--quiet", "origin", "HEAD:" + BRANCH]); pushed = true; }
    catch { await G(["fetch", "--quiet", "origin"]); await G(["rebase", "--quiet", "origin/" + BRANCH]).catch(() => G(["rebase", "--abort"]).catch(() => {})); } // another machine pushed first: ours is its own file, so it goes on top
  }
  writeJsonAtomic(CONF(), { ...c, met, lastSync: at, ...(pushed ? { lastError: "" } : { lastError: "couldn't push" }) });
  const count = (r) => Object.values(r || {}).filter(alive).length;
  return { ok: pushed, ...(pushed ? {} : { error: "Merged here, but couldn't push this computer's state to the sync repo." }), from, conflicts: conflicts.length, tasks: count(merged.tasks), memory: count(merged.memory) };
}
const status = () => { const c = conf(); return c ? { paired: true, url: c.url, machine: c.machine, name: c.name, lastSync: c.lastSync || 0, lastError: c.lastError || "", conflicts: (readState(CONFLICTS(), Array.isArray) || []).length } : { paired: false }; };

export { init, pair, now, status, wrapKey, unwrapKey, seal, unseal, mergeRecords, unionSections, stamped, laneKey, KEY_NAME };
