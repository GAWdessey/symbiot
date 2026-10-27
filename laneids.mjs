// symbiot — a lane by what it is, not what its folder is called. A lane was its folder's name, matched
// as a string: a task kept its lane's name, so a folder renamed or moved (shop → shop-app) left
// its tasks under a name that was no lane any more, picked up by nothing (the same class as the copy's
// folder name, symbiot-825733, 16–22 Oct 2026). Now each lane has an id that survives that:
// - a git repo: its first commit (the root of its history), the same whatever the folder's called or
//   where it is, and whatever its remote is now;
// - anything else (a project folder without git): its path.
// Two lanes that share a first commit (two clones of one repo) each take an id from their path instead,
// so neither is mistaken for the other. Tasks keep their lane's id beside its name (tasks.mjs addTask);
// a task whose name is no lane, but whose id is, goes to the lane's name now (tasks.mjs placeTasks).
// Kept in lane-ids.json: { ids: { id: { name, path, at } }, renamed: [{ id, from, to, at }], retired: { oldId: id now }, roots: { path: root } }.
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { createHash } from "node:crypto";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";

const FILE = () => join(CONFIG_DIR, "lane-ids.json");
const load = () => { const d = readState(FILE(), (x) => x && typeof x === "object") || {}; return { ids: d.ids || {}, renamed: Array.isArray(d.renamed) ? d.renamed : [], retired: d.retired && typeof d.retired === "object" ? d.retired : {}, roots: d.roots && typeof d.roots === "object" ? d.roots : {} }; };
const save = (d) => { try { writeJsonAtomic(FILE(), { ids: d.ids, renamed: d.renamed.slice(-100), retired: d.retired || {}, roots: d.roots || {} }, { indent: 1, mode: 0o600 }); } catch {} };
const short = (s) => createHash("sha1").update(String(s)).digest("hex").slice(0, 12);
// A folder's first commit, asked of git once per folder while its HEAD doesn't move.
// git failing (a 10 s timeout on a busy disk, a lock mid-checkout) isn't "no history": the root it had
// stands, and it's asked again next time. Taken as none, a lane went by its path for a moment while
// a copy of its repo (the same first commit) took the shared id alone (27 Oct 2026).
const ROOTS = new Map();
function rootOf(path, { git = (p, a) => spawnSync("git", ["-C", p, ...a], { encoding: "utf8", timeout: 10000 }) } = {}) {
  let head = 0; try { head = statSync(join(path, ".git")).mtimeMs; } catch { return ""; }
  const hit = ROOTS.get(path); if (hit && hit.head === head) return hit.root;
  const r = git(path, ["rev-list", "--max-parents=0", "HEAD"]);
  if (!r || r.status !== 0 || r.error) return hit ? hit.root : "";
  const root = String(r.stdout || "").trim().split("\n").sort()[0] || "";
  ROOTS.set(path, { head, root }); return root;
}
// Each lane's id, from its name → path map: { name: id }.
function idsFor(map, { root = rootOf } = {}) {
  const byRoot = new Map(), out = {};
  for (const [name, path] of Object.entries(map || {})) { const r = path ? root(path) : ""; if (r) byRoot.set(r, [...(byRoot.get(r) || []), name]); }
  for (const [name, path] of Object.entries(map || {})) {
    const r = path ? root(path) : "";
    out[name] = r && byRoot.get(r).length === 1 ? "g" + r.slice(0, 12) : "p" + short(resolve(String(path || name)));
  }
  return out;
}
// The lanes as they are now, noted: each id's name and path; an id whose name changed is a rename.
// An id a lane here no longer goes by (a second clone of its repo came, so both went by their paths)
// is retired, kept as the id that lane has now: left in place, it still named the folder it last
// pointed at, and the sync (sync.mjs, keyed by lane id) wrote one lane's questions into
// the copy's folder, where no card shows them (27 Oct 2026).
// { renamed: [{ id, from, to }] } for the ones this saw happen.
function noteLanes(map, { now = Date.now(), root = rootOf } = {}) {
  const d = load(), out = [];
  // each folder's root as last read, kept: git failing just after a restart (nothing read yet) falls back to it
  const kept = (p) => { const r = root(p); if (r) { d.roots[p] = r; return r; } let git = false; try { statSync(join(p, ".git")); git = true; } catch {} return git ? d.roots[p] || "" : ""; };
  const ids = idsFor(map, { root: kept });
  for (const p of Object.keys(d.roots)) if (!Object.values(map).includes(p)) delete d.roots[p];
  for (const [name, id] of Object.entries(ids)) {
    const had = d.ids[id];
    if (had && had.name !== name && !(had.name in map)) { d.renamed.push({ id, from: had.name, to: name, at: now }); out.push({ id, from: had.name, to: name }); }
    d.ids[id] = { name, path: map[name] || "", at: now };
  }
  const byPath = new Map(Object.entries(ids).map(([name, id]) => [resolve(String(map[name] || name)), id]));
  for (const [id, v] of Object.entries(d.ids)) {
    const cur = v && v.path ? byPath.get(resolve(String(v.path))) : undefined;
    if (cur && cur !== id) { delete d.ids[id]; d.retired[id] = cur; }
  }
  for (const id of Object.values(ids)) delete d.retired[id]; // an id in use again isn't retired
  save(d);
  return { renamed: out, ids };
}
const laneIdOf = (name, d = load()) => { const k = String(name || "").toLowerCase(); const e = Object.entries(d.ids).find(([, v]) => String(v.name).toLowerCase() === k); return e ? e[0] : ""; };
const nameOfId = (id, d = load()) => (d.ids[id] ? d.ids[id].name : "");
// A task whose lane is on another machine only: its id is a repo's first commit (sync.mjs carries it) that
// no lane here has, while a lane here has its name and an id of its own. Two marketing goals synced from
// the other PC were run in this laptop's marketing, another repo, where their code isn't (27 Oct 2026):
// such a task is left for the machine that has its lane.
function otherMachine(t, d = load()) {
  if (!t || !/^g/.test(String(t.laneId || "")) || d.ids[t.laneId] || (d.retired || {})[t.laneId]) return false; // an id a lane here went by is this machine's
  const here = laneIdOf(t.repo, d); return !!here && here !== t.laneId;
}

export { rootOf, idsFor, noteLanes, laneIdOf, nameOfId, otherMachine, load as loadLaneIds, FILE as LANE_IDS };
