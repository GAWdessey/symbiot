// symbiot — Route: which model answers a job, and why. A one-shot call's kind
// sets its tier outright (JOBS below: read/summary/classify -> local, triage/todo/lang
// -> Haiku, chat/writeup/update/notes/post -> Sonnet). An agent run starts on Sonnet and is scored up to
// Opus, with no model call involved, when its brief is long, names more than
// one repo, uses words like research/investigate/refactor/debug/why/design,
// its lane's past runs (costs.json) cost $2 or more at the median or fail
// often, or it touches keys, money or publishing. An answer-resume stays on
// Sonnet. An override — a task line's [model: …], or a lane's own setting —
// always wins, and Auto never drops below it. Pure: everything comes from the
// arguments and costs.json, which may not exist yet (nothing writes it until
// a later task; until then, "no history" is never itself a reason to escalate).
// Report: ~/.config/symbiot/drafts/act-6407ab9b/.symbiot/LOCAL-MODEL-ROUTING.md §5.

import { join } from "node:path";
import { readFileSync } from "node:fs";
import { CONFIG_DIR } from "./core.mjs";
import { kindOf } from "./estimate.mjs";

const COSTS_FILE = join(CONFIG_DIR, "costs.json");
const MIN_SAMPLES = 3, COST_FLOOR = 2, FAIL_FLOOR = 0.5, LONG_BRIEF = 1500;

const MODEL = { L: "qwen3:8b", H: "claude-haiku-4-5", S: "claude-sonnet-5", O: "claude-opus-5-5" };
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
function laneHistory(path, costs = load(COSTS_FILE)) {
  const own = path ? costs.filter((c) => c.path === path) : [];
  if (own.length < MIN_SAMPLES) return { median: 0, failRate: 0, samples: own.length };
  return { median: median(own.map((c) => c.cost || 0)), failRate: own.filter((c) => c.ok === false).length / own.length, samples: own.length };
}

// How many different project directories a brief names — one repo's work
// reads differently from a brief that spans several.
function repoCount(task) {
  const hits = String(task || "").match(/\/[\w.-]+(?:\/[\w.-]+)+/g) || [];
  return new Set(hits.map((p) => p.split("/").slice(0, -1).join("/"))).size;
}

// Why an agent run should go to Opus instead of Sonnet, or "" if Sonnet is fine.
function escalationReason(task, history) {
  const text = String(task || "");
  if (SENSITIVE.test(text)) return "touches keys, money or publishing";
  if (text.length > LONG_BRIEF) return "long brief";
  if (repoCount(text) > 1) return "names several repos";
  if (HARD_WORDS.test(text)) return "research/refactor/debug-style work";
  if (history.samples >= MIN_SAMPLES && history.median >= COST_FLOOR) return `lane median $${history.median.toFixed(2)}`;
  if (history.samples >= MIN_SAMPLES && history.failRate >= FAIL_FLOOR) return "lane fails often";
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
  const ov = String(override || "").trim().toLowerCase();
  if (ov && ov !== "auto") {
    if (!OVERRIDE_TIER[ov]) throw new Error(`pickModel: unknown override "${override}"`);
    const tier = OVERRIDE_TIER[ov];
    return { tier, model: OVERRIDE_MODEL[ov] || MODEL[tier], why: `override: ${ov}` };
  }

  if (kind) {
    if (!ONE_SHOT_TIER[kind]) throw new Error(`pickModel: unknown kind "${kind}"`);
    const tier = ONE_SHOT_TIER[kind];
    return { tier, model: MODEL[tier], why: `${TIER_LABEL[tier]}: ${JOBS[kind].why}` };
  }

  if (kindOf(task) === "answer") return { tier: "S", model: MODEL.S, why: "Sonnet: answer-resume" };

  const history = laneHistory(path);
  const reason = escalationReason(task, history);
  if (reason) return { tier: "O", model: MODEL.O, why: `Opus: ${reason}` };
  const note = history.samples >= MIN_SAMPLES ? `, lane median $${history.median.toFixed(2)}` : "";
  return { tier: "S", model: MODEL.S, why: `Sonnet: short brief${note}` };
}

export { JOBS, pickModel, laneHistory, escalationReason, repoCount, MODEL };
