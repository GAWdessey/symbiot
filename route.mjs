// symbiot — Route: which model answers a job, and why. A one-shot call's kind
// sets its tier outright (JOBS below: read/summary/classify -> local, triage/todo/lang
// -> Haiku, chat/writeup/update/notes/post -> Sonnet). An agent run starts on Sonnet and is scored up to
// Opus, with no model call involved, when its brief is long, names more than
// one repo, uses words like research/investigate/refactor/debug/why/design,
// its lane's past runs (costs.json) cost $1 or more at the median or fail
// often, or it touches keys, money or publishing. Dials: routing.json overrides TUNING (no code change); calibrate() suggests values from costs.json. An answer-resume stays on
// Sonnet. An override — a task line's [model: …], or a lane's own setting —
// always wins, and Auto never drops below it. Pure: everything comes from the
// arguments and costs.json, which may not exist yet (nothing writes it until
// a later task; until then, "no history" is never itself a reason to escalate).
// Report: ~/.config/symbiot/drafts/act-6407ab9b/.symbiot/LOCAL-MODEL-ROUTING.md §5.

import { join } from "node:path";
import { readFileSync } from "node:fs";
import { CONFIG_DIR } from "./core.mjs";
import { kindOf } from "./estimate.mjs";

const COSTS_FILE = join(CONFIG_DIR, "costs.json"), TUNING_FILE = join(CONFIG_DIR, "routing.json");

// Calibrated 2026-10-13 on 48 finished Sonnet runs (2026-10-10 17:04 to 10-11 04:40; none failed,
// lane medians $0.17-$0.43, dearest run $1.74) and the LOCAL-MODEL-ROUTING.md benchmark. A lane
// median of $1 on Sonnet is 2-3x anything seen there and about $2 on Opus, so $1 (was $2, which
// nothing reached) is where a lane starts going to Opus. No failures yet, so 0.5 stays.
const TUNING = {
  minSamples: 3, costFloor: 1, failFloor: 0.5, longBrief: 1500,
  // ids as Claude Code reports them in costs.json (claude-sonnet-5-5, not claude-sonnet-5)
  models: { L: "qwen3:8b", H: "claude-haiku-4-5", S: "claude-sonnet-5-5", O: "claude-opus-5-5" },
};
function tuning() {
  let t = {};
  try { t = JSON.parse(readFileSync(TUNING_FILE, "utf8")) || {}; } catch { /* no file: defaults */ }
  const num = (k) => (Number.isFinite(t[k]) && t[k] >= 0 ? t[k] : TUNING[k]);
  return {
    minSamples: num("minSamples"), costFloor: num("costFloor"), failFloor: num("failFloor"), longBrief: num("longBrief"),
    models: { ...TUNING.models, ...(t.models || {}) }, tiers: { ...ONE_SHOT_TIER, ...(t.tiers || {}) },
  };
}

const MODEL = TUNING.models; // the defaults; pickModel uses tuning().models
const OVERRIDE_TIER = { opus: "O", sonnet: "S", fable: "O", local: "L", haiku: "H" }; // fable: Opus's tier, Fable's model
const OVERRIDE_MODEL = { fable: "claude-fable-5-1" }; // other overrides share MODEL[tier]
// Every one-shot job, its tier and the one-line reason (audit of 2026-10-13: the benchmark in
// LOCAL-MODEL-ROUTING.md §3 and the 48 agent runs in costs.json, Oct 10-11). Local only where a job
// has no tools, no images, short input and measured within a hair of Haiku; anything that acts, speaks
// in the user's name or judges what to build stays on Sonnet; Opus is for agent runs only.
const JOBS = {
  read: { tier: "L", why: "last-message reader: JSON, short input, qwen3:8b 5/5 against Haiku 4/5" },
  summary: { tier: "L", why: "notification/email summary: short, no judgement, qwen3:8b 3/3 like Haiku" },
  classify: { tier: "L", why: "task to lane: 8/8 on qwen3:8b once each lane has a one-line description" },
  triage: { tier: "H", why: "what needs them: qwen3:8b 1/3 filed real requests under can-wait, Haiku 3/3" },
  todo: { tier: "H", why: "summary of open work: the list can run long, past a local model's short context" },
  lang: { tier: "H", why: "UI translation in batches: not benchmarked local, Haiku is the fastest Claude and enough" },
  chat: { tier: "S", why: "Home, Reports, card and task chat: can act on agents and tasks, and local models made things up" },
  writeup: { tier: "S", why: "project review, advice and overview: judges what is worth building, so the quality bar is high" },
  update: { tier: "S", why: "standup and week update: read by the user as written, prose over commits, mail and arrivals" },
  notes: { tier: "S", why: "release notes from a diff: must claim nothing the diff doesn't show, long input" },
  post: { tier: "S", why: "post drafts go out in the user's name, in their voice: never below Sonnet" },
};
const ONE_SHOT_TIER = Object.fromEntries(Object.entries(JOBS).map(([k, j]) => [k, j.tier]));
const TIER_LABEL = { L: "local", H: "Haiku", S: "Sonnet", O: "Opus" };

const HARD_WORDS = /\b(research|investigat\w*|refactor\w*|debugg?\w*|why|design\w*)\b/i;
const SENSITIVE = /\b(ssh key|api key|password|secret|token|pay|payment|publish|release|push(?:es|ed|ing)? to main|force.?push)\b/i;

function load(file) { try { const a = JSON.parse(readFileSync(file, "utf8")); return Array.isArray(a) ? a : []; } catch { return []; } }
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) / 2; return (s[Math.floor(i)] + s[Math.ceil(i)]) / 2; };

// A lane's own track record: its runs' median cost and the share that failed,
// from costs.json. Too few samples (or no file yet) reads as "no history".
function laneHistory(path, costs = load(COSTS_FILE), MIN_SAMPLES = tuning().minSamples) {
  const own = path ? costs.filter((c) => c.path === path) : [];
  if (own.length < MIN_SAMPLES) return { median: 0, failRate: 0, escalated: 0, samples: own.length };
  return { median: median(own.map((c) => c.cost || 0)), failRate: own.filter((c) => c.ok === false).length / own.length, escalated: own.filter((c) => c.escalatedFrom).length / own.length, samples: own.length };
}

// How many different project directories a brief names — one repo's work
// reads differently from a brief that spans several.
function repoCount(task) {
  const hits = String(task || "").match(/\/[\w.-]+(?:\/[\w.-]+)+/g) || [];
  return new Set(hits.map((p) => p.split("/").slice(0, -1).join("/"))).size;
}

// Why an agent run should go to Opus instead of Sonnet, or "" if Sonnet is fine.
function escalationReason(task, history, t = tuning()) {
  const { longBrief: LONG_BRIEF, costFloor: COST_FLOOR, failFloor: FAIL_FLOOR, minSamples: MIN_SAMPLES } = t;
  const text = String(task || "");
  if (SENSITIVE.test(text)) return "touches keys, money or publishing";
  if (text.length > LONG_BRIEF) return "long brief";
  if (repoCount(text) > 1) return "names several repos";
  if (HARD_WORDS.test(text)) return "research/refactor/debug-style work";
  if (history.samples >= MIN_SAMPLES && history.median >= COST_FLOOR) return `lane median $${history.median.toFixed(2)}`;
  if (history.samples >= MIN_SAMPLES && history.failRate >= FAIL_FLOOR) return "lane fails often";
  if (history.samples >= MIN_SAMPLES && history.escalated >= FAIL_FLOOR) return "lane keeps escalating";
  return "";
}

// pickModel({kind, task, lane, path, override}) -> { tier: "L"|"H"|"S"|"O", model, why }
//   kind:     a one-shot job's kind (read, summary, classify, triage, chat, writeup, post).
//   task:     the brief an agent run is about (leave kind unset for agent runs).
//   lane, path: whose run this is; path is the lane history key in costs.json.
//   override: "opus" | "sonnet" | "fable" | "local" | "haiku" | "auto"/"" — a task
//             line's [model: …] or a lane's own setting. Always wins; Auto never
//             goes below it.
function pickModel({ kind = "", task = "", lane = "", path = "", override = "" } = {}) {
  const t = tuning(), MODEL = t.models;
  const ov = String(override || "").trim().toLowerCase();
  if (ov && ov !== "auto") {
    if (!OVERRIDE_TIER[ov]) throw new Error(`pickModel: unknown override "${override}"`);
    const tier = OVERRIDE_TIER[ov];
    return { tier, model: OVERRIDE_MODEL[ov] || MODEL[tier], why: `override: ${ov}` };
  }

  if (kind) {
    if (!t.tiers[kind]) throw new Error(`pickModel: unknown kind "${kind}"`);
    const tier = t.tiers[kind];
    return { tier, model: MODEL[tier], why: `${TIER_LABEL[tier]}: ${JOBS[kind].why}` };
  }

  if (kindOf(task) === "answer") return { tier: "S", model: MODEL.S, why: "Sonnet: answer-resume" };

  const history = laneHistory(path, undefined, t.minSamples);
  const reason = escalationReason(task, history, t);
  if (reason) return { tier: "O", model: MODEL.O, why: `Opus: ${reason}` };
  const note = history.samples >= t.minSamples ? `, lane median $${history.median.toFixed(2)}` : "";
  return { tier: "S", model: MODEL.S, why: `Sonnet: short brief${note}` };
}

// What costs.json says about the dials: runs, spend and failures per model, each lane's median
// cost, and the costFloor those suggest (2x the dearest lane median, never under $0.50).
// Read-only: copy a number into routing.json to apply it.
function calibrate(costs = load(COSTS_FILE)) {
  const t = tuning(), by = new Map(), models = {};
  for (const c of costs) {
    if (c.path) { if (!by.has(c.path)) by.set(c.path, []); by.get(c.path).push(c); }
    const m = models[c.model || "?"] ||= { runs: 0, failed: 0, spend: 0 };
    m.runs++; m.spend += c.cost || 0; if (c.ok === false) m.failed++;
  }
  const lanes = [...by].filter(([, r]) => r.length >= t.minSamples).map(([path, r]) => ({ path, runs: r.length, median: median(r.map((c) => c.cost || 0)), failRate: r.filter((c) => c.ok === false).length / r.length }));
  const top = Math.max(0, ...lanes.map((l) => l.median));
  return {
    runs: costs.length, models, lanes, current: { costFloor: t.costFloor, failFloor: t.failFloor, longBrief: t.longBrief },
    suggested: { costFloor: Math.max(0.5, Math.round(top * 200) / 100) },
    wouldEscalate: lanes.filter((l) => l.median >= t.costFloor || l.failRate >= t.failFloor).length,
  };
}

export { JOBS, calibrate, tuning, pickModel, laneHistory, escalationReason, repoCount, MODEL };
