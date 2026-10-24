// symbiot — the daily sweep of ~/.config/symbiot. Nothing pruned itself: the folder
// was 2.6 GB, drafts/ held 161 finished ops runs (403 MB), screens/ 1,700 maps of the
// same pages (258 MB), settled.json a key per run folder for ever, and prompt files
// and .corrupt-* copies from crashes stayed (15 Oct 2026). Once at start and every
// day after, it removes:
// - drafts/act-* run folders quiet for 3 days, with no run going, no open question, no reply
//   being waited on, no report still unread and no handover still to report back (they were
//   kept 14 days, and about 16 new ops runs a day outgrew that: 3.5 GB on 20 Oct 2026);
// - agent-made page maps past the newest 30 per page title (screens.json, written
//   whole), and PNGs in screens/ older than 7 days that no map refers to;
// - .system-*.txt prompt files and .tmp halves of saves left by a process that's gone;
// - .corrupt-* copies and .bak.bak copies older than 30 days;
// - settled.json keys whose folder is gone;
// - tasks archived more than 30 days ago, moved to tasks-archive.json (the Archive still
//   lists them, and Restore brings one back): tasks.json held 781 done tasks of 797;
// and it makes every state file in the folder yours only (0600), as writeAtomic writes them.
// It logs what it removed, one line. Never the real folder from a test: pass dirs.
import { join } from "node:path";
import { readdirSync, statSync, rmSync, unlinkSync, existsSync, chmodSync } from "node:fs";
import { CONFIG_DIR, readState, writeJsonAtomic, alive, privateDir, loadTasks, saveTasks } from "./core.mjs";

const DAY = 86400000;
const KEEP = { acts: 3 * DAY, screens: 7 * DAY, corrupt: 30 * DAY, perTitle: 30, archived: 30 * DAY };
const SCREENS_DIR = join(CONFIG_DIR, "screens");
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const mtimeOf = (f) => { try { return statSync(f).mtimeMs; } catch { return 0; } };
// When a run folder last changed: the folder, its .symbiot, and the files in it.
function lastTouched(dir) {
  let t = mtimeOf(dir); const sym = join(dir, ".symbiot"); t = Math.max(t, mtimeOf(sym));
  try { for (const n of readdirSync(sym)) t = Math.max(t, mtimeOf(join(sym, n))); } catch {}
  return t;
}
// What the sweep asks about a run folder, from the app (the defaults) or a test.
async function runDeps() {
  const a = await import("./agents.mjs"), h = await import("./handback.mjs"), r = await import("./reports.mjs"), l = await import("./lanes.mjs");
  const waits = h.loadWaits().waits.filter((w) => w.status === "waiting").map((w) => (w.from && w.from.path) || "");
  let ledger = { handoffs: [] }; try { ledger = l.loadLedger(); } catch {}
  const handing = new Set(ledger.handoffs.filter((x) => !x.reportedAt && !["done", "error", "failed"].includes(x.status)).flatMap((x) => [x.to && x.to.path, x.from && x.from.path]).filter(Boolean));
  return { running: (p) => !!a.runningHandoff(p), questions: (p) => { try { return a.agentQuestions(p, "").questions.length; } catch { return 0; } },
    waiting: (p) => waits.includes(p), unread: (p) => { try { return r.listReports({ folders: [p], map: {}, running: () => false }).some((x) => x.new); } catch { return false; } },
    handing: (p) => handing.has(p) };
}
function sweepActs({ now = Date.now(), dir = join(CONFIG_DIR, "drafts"), keep = KEEP.acts, running, questions, waiting, unread, handing = () => false }) {
  const gone = [];
  let names = []; try { names = readdirSync(dir).filter((n) => /^act-[0-9a-f]{8}$/.test(n)); } catch { return gone; }
  for (const n of names) {
    const p = join(dir, n);
    if (now - lastTouched(p) < keep || running(p) || questions(p) > 0 || waiting(p) || unread(p) || handing(p)) continue;
    try { rmSync(p, { recursive: true, force: true }); gone.push(p); } catch {}
  }
  return gone;
}
// screens.json: the newest perTitle maps of each page kept (a page mapped again and
// again by an agent: LinkedIn's feed 214 times); PNGs with no map and older than keep go.
function sweepScreens({ now = Date.now(), dir = SCREENS_DIR, keep = KEEP.screens, perTitle = KEEP.perTitle } = {}) {
  const file = join(dir, "screens.json"), list = readState(file, Array.isArray) || [], seen = new Map(), kept = [];
  for (const s of list.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))) {
    if (!s || !s.page) { kept.push(s); continue; } // your own screen captures stay
    const k = String(s.page.title || s.page.url || s.name || ""), n = (seen.get(k) || 0) + 1; seen.set(k, n);
    if (n <= perTitle) kept.push(s);
  }
  const entries = list.length - kept.length;
  if (entries > 0) try { writeJsonAtomic(file, kept.sort((a, b) => (b.ts || 0) - (a.ts || 0)), { mode: 0o600 }); } catch { return { entries: 0, pngs: 0 }; }
  const ids = new Set(kept.map((s) => s && s.id)); let pngs = 0;
  try { for (const n of readdirSync(dir)) { const id = (n.match(/^([0-9a-f]{12})\.png$/) || [])[1]; if (!id || ids.has(id) || now - mtimeOf(join(dir, n)) < keep) continue; try { unlinkSync(join(dir, n)); pngs++; } catch {} } } catch {}
  return { entries, pngs };
}
// Prompt files (.system-<pid>-…txt, ai.mjs) and tmp halves of saves (<file>.<pid>-<hex>.tmp,
// core.mjs writeAtomic) whose process is gone: a kill or a crash left them.
function sweepLeft({ dir = CONFIG_DIR, live = alive } = {}) {
  const gone = [];
  try {
    for (const n of readdirSync(dir)) {
      const m = n.match(/^\.system-(\d+)-\d+-\w+\.txt$/) || n.match(/\.(\d+)-[0-9a-f]{8}\.tmp$/); if (!m) continue;
      const pid = Number(m[1]); if (pid === process.pid || live(pid)) continue;
      try { unlinkSync(join(dir, n)); gone.push(n); } catch {}
    }
  } catch {}
  return gone;
}
function sweepCorrupt({ now = Date.now(), dir = CONFIG_DIR, keep = KEEP.corrupt } = {}) {
  const gone = [];
  try { for (const n of readdirSync(dir)) { const m = n.match(/\.corrupt-(\d+)$/); if (!m || now - Number(m[1]) < keep) continue; try { unlinkSync(join(dir, n)); gone.push(n); } catch {} } } catch {}
  // a .bak of a .bak: no writer makes them now, and the save before is in the .bak itself
  try { for (const n of readdirSync(dir)) { if (!/\.bak\.bak$/.test(n) || now - mtimeOf(join(dir, n)) < keep) continue; try { unlinkSync(join(dir, n)); gone.push(n); } catch {} } } catch {}
  return gone;
}
// Tasks archived more than keep ago leave tasks.json for tasks-archive.json, newest kept last.
const ARCHIVE_FILE = (dir = CONFIG_DIR) => join(dir, "tasks-archive.json"), ARCHIVE_MAX = 20000;
const archivedAt = (t) => Number(t.archivedAt || t.approvedAt || t.doneAt || t.ts) || 0;
function sweepTasks({ now = Date.now(), dir = CONFIG_DIR, keep = KEEP.archived, load = loadTasks, save = saveTasks } = {}) {
  const all = load(), out = all.filter((t) => t && t.archived && now - archivedAt(t) > keep); if (!out.length) return 0;
  const file = ARCHIVE_FILE(dir), had = readState(file, Array.isArray) || [], ids = new Set(out.map((t) => t.id));
  try { writeJsonAtomic(file, [...had.filter((t) => !ids.has(t.id)), ...out].slice(-ARCHIVE_MAX), { indent: 0 }); } catch { return 0; }
  if (!save(all.filter((t) => !ids.has(t.id)))) return 0;
  return out.length;
}
// What the archive file holds, for the Archive page and Restore (tasks.mjs restoreTask).
const archivedTasks = (dir = CONFIG_DIR) => readState(ARCHIVE_FILE(dir), Array.isArray) || [];
// Every state file in the folder, yours only: one an older Symbiot (or a plain write) left 0664.
// Only the group's and others' bits go: your own run bit stays. Set to 0600 outright, the
// agent wrapper kept here (claude-fallback, 0755) lost it, and every run failed at once with
// "Permission denied" (24 Oct 2026, the first start of 0.90.1).
function sweepModes({ dir = CONFIG_DIR } = {}) {
  if (process.platform === "win32") return 0;
  let n = 0;
  try { for (const name of readdirSync(dir)) { const f = join(dir, name); try { const st = statSync(f); if (st.isFile() && (st.mode & 0o077)) { chmodSync(f, st.mode & 0o700); n++; } } catch {} } } catch {}
  return n;
}
function sweepSettled({ file = join(CONFIG_DIR, "settled.json") } = {}) {
  const o = readState(file, isObj); if (!o) return 0;
  const gone = Object.keys(o).filter((k) => k !== "*" && k.startsWith("/") && !existsSync(k));
  if (gone.length) { for (const k of gone) delete o[k]; try { writeJsonAtomic(file, o, { mode: 0o600 }); } catch { return 0; } }
  return gone.length;
}
async function sweepState({ now = Date.now(), dir = CONFIG_DIR, deps, log = console.log } = {}) {
  privateDir(dir); privateDir(join(dir, "screens"));
  const d = deps || await runDeps();
  const acts = sweepActs({ now, dir: join(dir, "drafts"), ...d }), screens = sweepScreens({ now, dir: join(dir, "screens") }), left = sweepLeft({ dir, live: d.live }), corrupt = sweepCorrupt({ now, dir }), settled = sweepSettled({ file: join(dir, "settled.json") });
  const tasks = sweepTasks({ now, dir, ...(d.tasks || {}) }), modes = sweepModes({ dir });
  const r = { acts: acts.length, screens: screens.entries, pngs: screens.pngs, left: left.length, corrupt: corrupt.length, settled, tasks, modes };
  const said = [r.acts && `${r.acts} finished run folder${r.acts > 1 ? "s" : ""}`, r.screens && `${r.screens} old page map${r.screens > 1 ? "s" : ""}`, r.pngs && `${r.pngs} unused screenshot${r.pngs > 1 ? "s" : ""}`,
    r.left && `${r.left} file${r.left > 1 ? "s" : ""} a gone process left`, r.corrupt && `${r.corrupt} corrupt cop${r.corrupt > 1 ? "ies" : "y"}`, r.settled && `${r.settled} settled key${r.settled > 1 ? "s" : ""} with no folder`, r.tasks && `${r.tasks} archived task${r.tasks > 1 ? "s" : ""} moved to tasks-archive.json`, r.modes && `${r.modes} file${r.modes > 1 ? "s" : ""} made yours only`].filter(Boolean);
  if (said.length) try { log(`  Swept: ${said.join(", ")}.`); } catch {}
  return r;
}
// At start (a minute in, once the app is up) and daily. The app's start-up housekeeping
// also starts the Pro trial clock, which licenceState no longer writes on a read.
let TIMER = null;
function startSweep({ delay = 60000, every = DAY } = {}) {
  if (TIMER) return;
  import("./licence.mjs").then((l) => l.startTrial()).catch(() => {});
  const run = () => { sweepState().catch(() => {}); };
  TIMER = setTimeout(() => { run(); TIMER = setInterval(run, every); TIMER.unref(); }, delay); TIMER.unref();
}

export { sweepState, sweepActs, sweepScreens, sweepLeft, sweepCorrupt, sweepSettled, sweepTasks, sweepModes, archivedTasks, ARCHIVE_FILE, startSweep, KEEP };
