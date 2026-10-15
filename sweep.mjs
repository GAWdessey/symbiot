// symbiot — the daily sweep of ~/.config/symbiot. Nothing pruned itself: the folder
// was 2.6 GB, drafts/ held 161 finished ops runs (403 MB), screens/ 1,700 maps of the
// same pages (258 MB), settled.json a key per run folder for ever, and prompt files
// and .corrupt-* copies from crashes stayed (15 Oct 2026). Once at start and every
// day after, it removes:
// - drafts/act-* run folders whose run ended more than 14 days ago, with no open
//   question, no reply being waited on, and no report still unread;
// - agent-made page maps past the newest 200 per page title (screens.json, written
//   whole), and PNGs in screens/ older than 7 days that no map refers to;
// - .system-*.txt prompt files and .tmp halves of saves left by a process that's gone;
// - .corrupt-* copies older than 30 days (the save before was read in their place);
// - settled.json keys whose folder is gone.
// It logs what it removed, one line. Never the real folder from a test: pass dirs.
import { join } from "node:path";
import { readdirSync, statSync, rmSync, unlinkSync, existsSync } from "node:fs";
import { CONFIG_DIR, readState, writeJsonAtomic, alive, privateDir } from "./core.mjs";

const DAY = 86400000;
const KEEP = { acts: 14 * DAY, screens: 7 * DAY, corrupt: 30 * DAY, perTitle: 200 };
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
  const a = await import("./agents.mjs"), h = await import("./handback.mjs"), r = await import("./reports.mjs");
  const waits = h.loadWaits().waits.filter((w) => w.status === "waiting").map((w) => (w.from && w.from.path) || "");
  return { running: (p) => !!a.runningHandoff(p), questions: (p) => { try { return a.agentQuestions(p, "").questions.length; } catch { return 0; } },
    waiting: (p) => waits.includes(p), unread: (p) => { try { return r.listReports({ folders: [p], map: {}, running: () => false }).some((x) => x.new); } catch { return false; } } };
}
function sweepActs({ now = Date.now(), dir = join(CONFIG_DIR, "drafts"), keep = KEEP.acts, running, questions, waiting, unread }) {
  const gone = [];
  let names = []; try { names = readdirSync(dir).filter((n) => /^act-[0-9a-f]{8}$/.test(n)); } catch { return gone; }
  for (const n of names) {
    const p = join(dir, n);
    if (now - lastTouched(p) < keep || running(p) || questions(p) > 0 || waiting(p) || unread(p)) continue;
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
  return gone;
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
  const r = { acts: acts.length, screens: screens.entries, pngs: screens.pngs, left: left.length, corrupt: corrupt.length, settled };
  const said = [r.acts && `${r.acts} finished run folder${r.acts > 1 ? "s" : ""}`, r.screens && `${r.screens} old page map${r.screens > 1 ? "s" : ""}`, r.pngs && `${r.pngs} unused screenshot${r.pngs > 1 ? "s" : ""}`,
    r.left && `${r.left} file${r.left > 1 ? "s" : ""} a gone process left`, r.corrupt && `${r.corrupt} corrupt cop${r.corrupt > 1 ? "ies" : "y"}`, r.settled && `${r.settled} settled key${r.settled > 1 ? "s" : ""} with no folder`].filter(Boolean);
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

export { sweepState, sweepActs, sweepScreens, sweepLeft, sweepCorrupt, sweepSettled, startSweep, KEEP };
