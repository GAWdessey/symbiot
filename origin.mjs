// Where a checkout's uncommitted changes came from, and whether an agent is still making them.
//
// An agent's lock is in its own folder (.symbiot/agent.pid), so runningHandoff(path) sees only a
// run started in that checkout. An ops run in drafts/act-… that cds into a repo and edits it there
// left no trace in it: on 19 Oct 2026 act-c6a0236a edited vault.mjs, agents.mjs and
// test/vault.mjs in ~/orca/projects/symbiot at 14:05–14:06, the lane's own run there had just
// ended, and the Workdesk offered those half-done edits as "Uncommitted changes with no ticked
// task behind them", Approve button and all, while Home counted them as waiting on the user.
//
// changesBy(path, files): { atWork, run, at } (any of them may be missing)
// - atWork: an agent still editing here, this checkout's own run or one from a folder of its own
//   whose log shows it writing in this checkout: { id, name, path, startedAt, outside }.
// - run: the finished run that left them: { id, name, startedAt, endedAt, ticked?, outside }.
// - at: when the newest of them last changed (0 if none could be read).
// originLine(o, { open }) puts it in one line: where they came from and what the user should do.
import { readFileSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { loadRuns, runningHandoff, loadRunFiles } from "./agents.mjs";
import { readRunLog, runStarted } from "./work.mjs";

const SLACK = 2 * 60000; // a file's mtime vs a tool call's timestamp: the edit lands a moment after the call
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The ways a log names this checkout: its full path, and ~/… under the home folder.
function pathForms(path, home = homedir()) {
  const p = String(path || "").replace(/\/+$/, ""); if (!p) return [];
  return [p, ...(home && p.startsWith(home + "/") ? ["~" + p.slice(home.length)] : [])];
}
const FILE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
// A shell command that changes files, not one that only reads them: `node -e` or `python3 -`
// alone is a reader (it was how every look at a log went), so a script counts only once it
// writes (writeFile, open(…, 'w')).
const WRITES = /\bsed\s+-i\b|(?:^|[\s;|(])>{1,2}\s*(?![\d\s&])[^\s>|&)]|\btee\s|\b(?:mv|cp|rm|patch|touch)\s|\bgit\s+(?:apply|checkout|restore|stash|reset|add|commit|merge|cherry-pick|rebase|am)\b|writeFile|\.write_text\(|open\([^)]*['"][wa]\+?['"]/;
// The times (ms) a run's log shows it changing files in this checkout: a file tool on a path in
// it, or a shell command that names it and writes.
function writesIn(log, path, { home = homedir() } = {}) {
  const forms = pathForms(path, home); if (!forms.length || !log) return [];
  const inside = new RegExp("(?:" + forms.map(reEsc).join("|") + ")(?![\\w.-])");
  const out = [];
  for (const line of log.split("\n")) {
    if (!inside.test(line)) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    const c = j && j.type === "assistant" && j.message && j.message.content, t = Date.parse(j && j.timestamp) || 0;
    if (!Array.isArray(c) || !t) continue;
    for (const x of c) {
      if (!x || x.type !== "tool_use" || !x.input) continue;
      const file = String(x.input.file_path || x.input.notebook_path || ""), cmd = String(x.input.command || "");
      if ((FILE_TOOLS.has(x.name) && inside.test(file)) || (x.name === "Bash" && inside.test(cmd) && WRITES.test(cmd))) { out.push(t); break; }
    }
  }
  return out;
}
// A run folder's whole log, not just its newest run (readRunLog): an ops folder is one job, and a
// run carried on after a stop starts a new part of it that hasn't written anything yet. Its last
// LOG_CAP only; what writesIn found is kept until the log changes.
const SEEN = new Map(), LOG_CAP = 8 * 1024 * 1024;
function tailOf(file, size) {
  let fd; try { fd = openSync(file, "r"); } catch { return ""; }
  try { const n = Math.min(size, LOG_CAP), b = Buffer.alloc(n); readSync(fd, b, 0, n, size - n); return b.toString("utf8"); } catch { return ""; } finally { try { closeSync(fd); } catch {} }
}
function logWrites(file, path, home) {
  let st; try { st = statSync(file); } catch { return []; }
  const key = file + "\n" + path, hit = SEEN.get(key);
  if (hit && hit.size === st.size && hit.mtime === st.mtimeMs) return hit.w;
  const w = writesIn(tailOf(file, st.size), path, { home });
  SEEN.delete(key); SEEN.set(key, { size: st.size, mtime: st.mtimeMs, w }); if (SEEN.size > 80) SEEN.delete(SEEN.keys().next().value);
  return w;
}
const nameOf = (p) => { try { const h = JSON.parse(readFileSync(join(p, ".symbiot", "handoff.json"), "utf8")) || {}; return String(h.name || "").replace(/^Agent:\s*/, "").slice(0, 80); } catch { return ""; } };
const idOf = (p, live) => (live && live.id) || (basename(p).startsWith("act-") ? basename(p) : (() => { try { return String(JSON.parse(readFileSync(join(p, ".symbiot", "run-start.json"), "utf8")).id || ""); } catch { return ""; } })()) || basename(p);
const mtime = (f) => { try { return statSync(f).mtimeMs; } catch { return 0; } };

const BUSY_FOR = 6 * 3600000; // a live run that wrote here this recently, in an earlier part of its job, is still on it
function changesBy(path, files = [], { runs = loadRuns, running = runningHandoff, runFiles = loadRunFiles, log = readRunLog, home = homedir(), now = Date.now() } = {}) {
  if (!path) return {};
  const names = files.map((f) => (typeof f === "string" ? f : f && f.file)).filter(Boolean);
  const at = names.slice(0, 400).reduce((m, f) => Math.max(m, mtime(join(path, f))), 0);
  const own = running(path);
  const self = own ? { atWork: { id: own.id || idOf(path, own), name: nameOf(path), path, startedAt: own.startedAt || 0, outside: false } } : null;
  // other runs' folders: one alive that has written here (this run, or lately in its job) is at
  // work here; a finished one may be what left them, if its log was still going when they changed
  const others = []; let list = []; try { list = runs() || []; } catch {}
  for (const r of list) {
    if (!r || !r.path || r.path === path) continue;
    const lf = join(r.path, ".symbiot", "agent.log"), lm = mtime(lf), live = running(r.path);
    if (!live && (!at || lm < at - SLACK)) continue;
    const w = logWrites(lf, path, home); if (!w.length) continue;
    const began = (live && live.startedAt) || runStarted(log(lf)) || r.startedAt || 0, first = w[0], last = w[w.length - 1];
    others.push({ id: idOf(r.path, live), name: nameOf(r.path) || r.name || basename(r.path), path: r.path, startedAt: began ? Math.min(began, first) : first, first, last, live: !!live, outside: true });
  }
  const strip = ({ live: _v, ...x }) => x;
  const busy = others.filter((o) => o.live && now - o.last < BUSY_FOR).sort((a, b) => b.last - a.last)[0];
  if (self) return { ...self, at };
  if (busy) return { atWork: strip(busy), at };
  if (!names.length) return { at };
  // what left them: a run elsewhere writing here when they last changed; else this checkout's own
  // run that changed them (runfiles.json); else its newest run, if they changed while it ran
  const near = others.filter((o) => at && at >= o.first - SLACK && at <= o.last + SLACK).sort((a, b) => b.last - a.last)[0];
  if (near) return { run: strip(near), at };
  const set = new Set(names), rf = (runFiles(path) || []).filter((r) => r.files.some((f) => set.has(f))).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))[0];
  if (rf) return { run: { id: rf.id, name: nameOf(path), startedAt: rf.startedAt || 0, endedAt: rf.endedAt || 0, ticked: rf.ticked || 0, outside: false }, at };
  const lf = join(path, ".symbiot", "agent.log"), began = runStarted(log(lf)), ended = mtime(lf);
  if (began && at >= began - SLACK && at <= ended + SLACK) return { run: { id: idOf(path), name: nameOf(path), startedAt: began, endedAt: ended, outside: false }, at };
  return { at };
}

// "14:05", or "Sat 17 Oct 14:05" when it isn't today.
function clock(t, now = Date.now()) {
  const d = new Date(t), hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return new Date(now).toDateString() === d.toDateString() ? hm : `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${hm}`;
}
const runOf = (r) => `run ${r.id}${r.name ? ` (“${r.name.replace(/[“”"]/g, "")}”)` : ""}`;
const short = (s, n = 90) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
// The tasks changes no task is ticked for go with, found here rather than asked of the user: on
// 25 Oct 2026 run e2bd82ba in kaggle-squares-in-squares (07:42–07:46) ticked "Check the committed
// extension constructions…", which went up for review at 07:46 and was approved, and the card for
// what it left asked Garth which of four open tasks it finished, none of them, without naming it.
// A task ticked (reviewAt) or approved while the run that left them was going, or soon after, is
// theirs: the same run's tick, or a parallel one's. tasks: the repo's tasks; o: changesBy's.
const GOES_AFTER = 30 * 60000;
function goesWith(o, tasks = []) {
  const r = o && o.run; if (!r) return [];
  const from = (r.first || r.startedAt || o.at || 0) - SLACK, to = (r.last || r.endedAt || o.at || 0) + GOES_AFTER;
  if (!from || to <= from) return [];
  const inRun = (t) => Number(t) >= from && Number(t) <= to;
  return tasks.filter((x) => x && x.text && (x.review || x.done) && (inRun(x.reviewAt) || inRun(x.approvedAt))).sort((a, b) => (a.reviewAt || a.approvedAt || 0) - (b.reviewAt || b.approvedAt || 0))
    .map((x) => ({ id: x.id, text: x.text, ...(x.approvedAt ? { approved: true } : {}) })).slice(0, 6);
}
// What changed, in one line, and a word when it's big: 1014 files and half a million lines
// rewritten is regenerated data more often than work, and the user should see which before an OK.
const DATA = /\.(csv|tsv|jsonl?|ndjson|parquet|npy|npz|pkl|pickle|h5|hdf5|arrow|feather|sqlite|db|bin|dat|log|lock|svg|png|jpe?g|gif|webp|txt|xml|ya?ml)$/i;
const BIG_FILES = 200, BIG_LINES = 20000;
function diffLine(wc = {}) {
  const files = (wc.files || []).map((f) => (typeof f === "string" ? f : f && f.file)).filter(Boolean); if (!files.length) return "";
  const lines = String(wc.stat || "").match(/\d+/g), n = lines ? lines.slice(0, 2).reduce((a, b) => a + +b, 0) : 0;
  const top = (f) => (f.includes("/") ? f.slice(0, f.indexOf("/") + 1) : f), by = new Map();
  for (const f of files) by.set(top(f), (by.get(top(f)) || 0) + 1);
  const [dir, many] = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  const head = `${files.length} file${files.length > 1 ? "s" : ""} changed${wc.stat ? ` (${wc.stat})` : ""}`;
  if (files.length < BIG_FILES && n < BIG_LINES) return `${head}: ${short(files.slice(0, 5).join(", ") + (files.length > 5 ? ` and ${files.length - 5} more` : ""), 160)}.`;
  const bulk = dir.endsWith("/") && many / files.length >= 0.5 ? files.filter((f) => top(f) === dir) : [], data = bulk.filter((f) => DATA.test(f)).length;
  const rest = files.filter((f) => !bulk.includes(f)), named = rest.slice(0, 4).join(", ") + (rest.length > 4 ? ` and ${rest.length - 4} more` : "");
  const what = bulk.length ? `${bulk.length} of them in ${dir}${data / bulk.length >= 0.8 ? ", data files, which looks regenerated rather than written" : ""}` : "spread across the repo";
  return `Big: ${head}, ${what}${rest.length && bulk.length ? `; the rest: ${short(named, 140)}` : ""}. Check the diff before you approve.`;
}
// One line on the card: where they came from, and what to do. goes: goesWith's (the tasks they go
// with, found here); said: open tasks the run's summary says it finished. Never asks the user to
// judge which task a change finished: that's matched here, or they're a change of their own.
function originLine(o, { goes = [], said = [], now = Date.now() } = {}) {
  if (!o) return "";
  if (o.atWork) { const a = o.atWork; return `An agent is still at work here: ${runOf(a)}${a.outside ? ", from a folder of its own" : ""}, since ${clock(a.startedAt || now, now)}. Its changes may be half done, so there's nothing to approve until it finishes.`; }
  const names = (l) => l.map((x) => `“${short(x.text)}”`).join(" and ");
  const ticked = goes.length ? `They go with ${names(goes)}, ticked ${goes.every((x) => x.approved) ? "and approved " : ""}while it ran: approve them with it, or drop them.`
    : said.length ? `Its summary says it finished ${names(said)}, so they go out with ${said.length > 1 ? "those" : "it"}: approve them, or drop them.`
    : "No task they finish: approve them as a change of their own, or drop them.";
  if (o.run) { const r = o.run, s = clock(r.first || r.startedAt || o.at, now), e = clock(r.last || r.endedAt || o.at, now); return `Left by ${runOf(r)}${r.outside ? ", which edited here from a folder of its own" : ""}, ${e !== s ? `${s}–${e}` : `at ${s}`}. ${ticked}`; }
  return `Changed${o.at ? ` at ${clock(o.at, now)}` : ""} while no Symbiot run was working here, so by hand or by a session Symbiot didn't start: check the diff, and approve only if you know whose they are.`;
}

export { changesBy, originLine, goesWith, diffLine, writesIn, pathForms };
