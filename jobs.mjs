// "Where are we?" from one record. Each job (an agent run, a PR, an email) has one row in
// ~/.config/symbiot/jobs.json, written by the code paths that already know the truth
// (actNow, afterShip, markLive, settleSent), never worked out from text. Home's chat and
// `symbiot status` answer from it, and say there's no record rather than guess (20 Oct 2026:
// 17 of 120 replies took back a merged-vs-live or running-vs-queued answer).
import { join } from "node:path";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";

const FILE = join(CONFIG_DIR, "jobs.json");
const MAX_KEEP = 300, DAY = 86400e3;
// asked → queued (its turn is coming) → running → done, or review (done, waits on Approve) → approved
// (merge queued) → merged → live; email jobs end at sent. failed is a run or step that stopped.
const STATES = ["asked", "queued", "running", "done", "review", "approved", "merged", "live", "sent", "failed"];
const WAITING = ["user", "lane", "third party", "time", ""];
const SAYS = { asked: "asked, not started", queued: "queued, not started yet", running: "running now", done: "finished, nothing to approve", review: "done, waiting for Approve", approved: "approved, merge queued (not merged yet)", merged: "merged, not live", live: "live and checked", sent: "sent", failed: "failed" };
const ENDED = new Set(["done", "live", "sent", "failed"]);

const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
function loadJobs() { const d = readState(FILE, (v) => v && typeof v === "object" && Array.isArray(v.jobs)); return d ? d.jobs.filter((j) => j && j.key) : []; }
// a card that left Home, or a task that left the Workdesk, a day ago is dropped, so neither pushes PRs and runs out of the record
const passing = (j, now) => (String(j.key).startsWith("you:") || j.kind === "task") && ENDED.has(j.state) && now - j.changed > DAY;
function saveJobs(jobs, now = Date.now()) { try { writeJsonAtomic(FILE, { jobs: jobs.filter((j) => !passing(j, now)).slice(-MAX_KEEP) }, { indent: 1, mode: 0o600 }); return true; } catch { return false; } }
// A new state, the old one kept in its history with when it began.
function shift(j, state, now) { if (state === j.state) return; j.history = [...(j.history || []), { state: j.state, at: j.changed }].slice(-8); j.state = state; j.changed = now; }

// Record a job's state: one row per key, its first words kept, every change dated.
// patch: { state, waitingOn?, text?, lane?, path?, kind?, pr?, note? }. Never throws: a job that can't
// be recorded must not stop the run or the merge it describes.
function track(key, patch = {}, { now = Date.now() } = {}) {
  try {
    key = String(key || ""); if (!key) return null;
    const state = STATES.includes(patch.state) ? patch.state : null;
    const jobs = loadJobs(); let j = jobs.find((x) => x.key === key);
    if (!j) { if (!state) return null; j = { key, kind: patch.kind || "", lane: "", text: "", state, waitingOn: "", at: now, changed: now, history: [] }; jobs.push(j); }
    if (patch.kind) j.kind = patch.kind;
    if (patch.lane) j.lane = clip(patch.lane, 60);
    if (patch.text && !j.text) j.text = clip(patch.text, 140);
    if (patch.pr) j.pr = String(patch.pr);
    if (patch.path) j.path = String(patch.path);
    if (patch.note !== undefined) j.note = clip(patch.note, 200);
    if (state) shift(j, state, now);
    if (patch.waitingOn !== undefined) j.waitingOn = WAITING.includes(patch.waitingOn) ? patch.waitingOn : "";
    if (ENDED.has(j.state) && patch.waitingOn === undefined && j.state !== "sent") j.waitingOn = "";
    if (j.state === "sent" && patch.waitingOn === undefined) j.waitingOn = "third party";
    saveJobs(jobs, typeof now === "number" ? now : Date.now()); return j;
  } catch { return null; }
}
// The jobs of a PR, found by the repo and its number: a task's own card carries both.
const prKey = (repo, pr) => `pr:${repo}#${String(pr).replace(/^.*\/pull\//, "").replace(/\D/g, "") || pr}`;

// What's open now, and what ended in the last day, newest first.
function jobsNow({ now = Date.now(), jobs = loadJobs() } = {}) {
  jobs = jobs.filter((j) => !String(j.key).startsWith("you:")); // the cards: onUser
  const open = jobs.filter((j) => !ENDED.has(j.state) || (j.state === "sent" && now - j.changed < 7 * DAY)).sort((a, b) => b.changed - a.changed);
  const ended = jobs.filter((j) => ENDED.has(j.state) && j.state !== "sent" && now - j.changed < DAY).sort((a, b) => b.changed - a.changed);
  return { open, ended };
}
const whenOf = (t, now) => { const m = Math.max(0, Math.round((now - t) / 60e3)); return m < 2 ? "just now" : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
function jobLine(j, now = Date.now()) {
  return `${j.lane ? `[${j.lane}] ` : ""}${j.text || j.key}: ${SAYS[j.state] || j.state}${j.waitingOn ? `, waiting on ${j.waitingOn === "user" ? "the user" : j.waitingOn}` : ""} (since ${whenOf(j.changed, now)})${j.note ? ` — ${j.note}` : ""}`;
}
// For the chat's context: the one record to answer "where are we?" from.
function jobsLines({ now = Date.now(), jobs } = {}) {
  const { open, ended } = jobsNow({ now, jobs });
  const head = "Job record (one row per job, written when its state changed; answer 'where are we / is it merged / is it live / is it running' from this ONLY, and say you have no record of a job that isn't here, never infer one. 'merged' is not 'live'; 'asked' and 'queued' are not 'running'):";
  return [head, ...(open.length ? open.slice(0, 15).map((j) => `- ${jobLine(j, now)}`) : ["- nothing open"]), ...(ended.length ? ["Ended in the last 24h:", ...ended.slice(0, 8).map((j) => `- ${jobLine(j, now)}`)] : [])];
}
// `symbiot status`: the same record, for a terminal.
function jobsText({ now = Date.now(), jobs = loadJobs() } = {}) {
  const { open, ended } = jobsNow({ now, jobs }), you = onUser({ jobs });
  if (!open.length && !ended.length && !you.length) return "No jobs on record yet.";
  return [...(you.length ? [`Only you can do (${you.length}):`, ...you.map((y) => `  ${y.lane ? `[${y.lane}] ` : ""}${y.text}`)] : []), ...(open.length ? ["Open:", ...open.map((j) => "  " + jobLine(j, now))] : ["Nothing open."]), ...(ended.length ? ["Ended in the last 24h:", ...ended.map((j) => "  " + jobLine(j, now))] : [])].join("\n");
}
// Only what's waiting on the user: the one list the ember balls, the "needs you" cards and the phone can read.
const waitingOnUser = ({ jobs = loadJobs() } = {}) => jobs.filter((j) => j.waitingOn === "user" && !ENDED.has(j.state));

// What's on the user is what Home's "Only the user can do" holds, all of it (home.mjs homeState,
// after its filters: answered already, held in the vault, one agent's step asked twice, dismissed).
// Each card is a job ("you:" + its id) waiting on the user; one that left Home is done. The ember
// orbs (workScene), the phone's lists and the chat read this, never their own count of agents'
// questions: on 19 Oct 2026 5 orbs were lit with nothing behind them, and the phone listed
// questions Home had dropped. A job waiting on the user elsewhere (a run for Approve, a PR's deploy
// ask) still is only while its lane has a card here; after GRACE it waits on nobody.
const CARD = "you:", GRACE = 120e3;
const isCard = (j) => String(j.key).startsWith(CARD);
const cardOf = (y) => ({ id: String(y.id || ""), kind: y.kind || "", title: clip(y.title, 90), ...(y.sub ? { sub: clip(y.sub, 160) } : {}), ...(y.fix ? { fix: y.fix } : {}), ...(y.path ? { path: y.path } : {}), ...(y.ok ? { ok: true } : {}), ...(y.q ? { q: clip(y.q, 300) } : {}) });
function syncOnUser(cards = [], { now = Date.now() } = {}) {
  try {
    const jobs = loadJobs(), byKey = new Map(jobs.map((j) => [j.key, j])), on = new Set(), lanes = new Set(), paths = new Set();
    let changed = false;
    const move = (j, state, waitingOn, note) => { shift(j, state, now); j.waitingOn = waitingOn; if (note !== undefined) j.note = note; changed = true; };
    for (const y of cards) {
      if (!y || !y.id) continue;
      const key = CARD + y.id, text = clip(`${y.title || ""}${y.sub ? `: ${y.sub}` : ""}`, 140), card = cardOf(y);
      on.add(key); if (y.repo) lanes.add(y.repo); if (y.path) paths.add(y.path);
      let j = byKey.get(key);
      if (!j) { j = { key, kind: "card", lane: clip(y.repo, 60), text, state: "asked", waitingOn: "user", at: now, changed: now, history: [], card }; jobs.push(j); byKey.set(key, j); changed = true; continue; }
      if (j.state !== "asked" || j.waitingOn !== "user") move(j, "asked", "user", "");
      if (j.text !== text || JSON.stringify(j.card) !== JSON.stringify(card) || j.lane !== clip(y.repo, 60)) { j.text = text; j.card = card; j.lane = clip(y.repo, 60); changed = true; }
    }
    for (const j of jobs) {
      if (isCard(j)) { if (!on.has(j.key) && !ENDED.has(j.state)) move(j, "done", "", "off Home: answered, done or dismissed"); continue; }
      if (j.kind === "task" || j.waitingOn !== "user" || ENDED.has(j.state) || now - j.changed < GRACE) continue; // a task's wait is syncTasks', read off these same cards
      if ((j.lane && lanes.has(j.lane)) || (j.path && paths.has(j.path))) continue;
      if (j.state === "review") move(j, "done", "", "no Approve for it on Home any more"); else move(j, j.state, "");
    }
    if (changed) saveJobs(jobs, now);
    return jobs.filter((j) => isCard(j) && on.has(j.key));
  } catch { return []; }
}
// Each open task where the Workdesk has it (home.mjs workScene's waiting list, every tick): on
// it now is running, its turn coming is queued, held on a card of the user's waits on the user,
// blocked is asked with why. A task that left the list is done there (a run, Approve or a send
// takes it from there). Its note is why, as of when its state last changed.
const TASK_STATE = { working: ["running", ""], queued: ["queued", "lane"], beside: ["queued", ""], next: ["queued", ""], peak: ["queued", "time"], asks: ["queued", "user"], step: ["queued", "user"], approve: ["queued", "user"] };
function syncTasks(items = [], { now = Date.now() } = {}) {
  try {
    const jobs = loadJobs(), byKey = new Map(jobs.map((j) => [j.key, j])), on = new Set();
    let changed = false;
    for (const t of items) {
      const id = String(t.id || "").replace(/^task:/, ""); if (!id) continue;
      const key = "task:" + id, [state, waitingOn] = TASK_STATE[t.why && t.why.kind] || ["asked", ""], note = clip(t.why && t.why.text, 200);
      on.add(key);
      let j = byKey.get(key);
      if (!j) { jobs.push({ key, kind: "task", lane: clip(t.repo, 60), text: clip(t.text, 140), state, waitingOn, note, at: now, changed: now, history: [] }); changed = true; continue; }
      if (j.state === state && j.waitingOn === waitingOn) continue;
      shift(j, state, now); j.waitingOn = waitingOn; j.note = note; changed = true;
    }
    for (const j of jobs) if (j.kind === "task" && !on.has(j.key) && ["asked", "queued", "running"].includes(j.state)) { shift(j, "done", now); j.waitingOn = ""; j.note = "left the waiting list: finished, in review, or closed"; changed = true; }
    if (changed) saveJobs(jobs, now);
    return changed;
  } catch { return false; }
}
// The cards on record now: { lane, path, kind, fix, id, ok, text }, the same list Home shows.
const onUser = ({ jobs = loadJobs() } = {}) => jobs.filter((j) => isCard(j) && j.waitingOn === "user" && !ENDED.has(j.state)).map((j) => ({ ...(j.card || {}), lane: j.lane || "", text: j.text }));
// A lane's work went up (deploy.mjs afterShip): its runs that waited for Approve are done, in that PR.
function landed(lane, pr, { now = Date.now() } = {}) {
  try {
    const jobs = loadJobs(); let n = 0;
    for (const j of jobs) if (!isCard(j) && j.lane === lane && j.state === "review") { shift(j, "done", now); j.waitingOn = ""; j.note = `approved, in PR ${String(pr).replace(/^.*\/pull\//, "#")}`; n++; }
    if (n) saveJobs(jobs, now);
    return n;
  } catch { return 0; }
}

export { track, loadJobs, jobsNow, jobsLines, jobsText, jobLine, waitingOnUser, syncOnUser, syncTasks, onUser, landed, prKey, isCard, STATES, FILE };
