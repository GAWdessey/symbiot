// symbiot — Route: which model answers a job, and why. A one-shot call's kind
// sets its tier outright (read/summary/classify -> local, triage -> Haiku,
// chat/writeup/post -> Sonnet). An agent run starts on Sonnet and is scored up to
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
const ONE_SHOT_TIER = { read: "L", summary: "L", classify: "L", triage: "H", chat: "S", writeup: "S", post: "S" };
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
    return { tier, model: MODEL[tier], why: `${kind} is a ${TIER_LABEL[tier]} job` };
  }

  if (kindOf(task) === "answer") return { tier: "S", model: MODEL.S, why: "Sonnet: answer-resume" };

  const history = laneHistory(path);
  const reason = escalationReason(task, history);
  if (reason) return { tier: "O", model: MODEL.O, why: `Opus: ${reason}` };
  const note = history.samples >= MIN_SAMPLES ? `, lane median $${history.median.toFixed(2)}` : "";
  return { tier: "S", model: MODEL.S, why: `Sonnet: short brief${note}` };
}

export { pickModel, laneHistory, escalationReason, repoCount, MODEL };
