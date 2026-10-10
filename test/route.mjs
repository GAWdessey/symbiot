// Route (route.mjs): which model answers a job, and why.
// Isolated HOME (set before the modules load, like test/work.mjs).
//
//   node test/route.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-route-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { pickModel, laneHistory, escalationReason, repoCount } = await import("../route.mjs");

console.log("ROUTE — which model answers a job, and why");

// One-shot jobs: the kind sets the tier outright.
ok("read is local", JSON.stringify(pickModel({ kind: "read" })) === JSON.stringify({ tier: "L", model: "qwen3:8b", why: "read is a local job" }));
ok("summary is local", pickModel({ kind: "summary" }).tier === "L");
ok("classify is local", pickModel({ kind: "classify" }).tier === "L");
ok("triage is Haiku", pickModel({ kind: "triage" }).model === "claude-haiku-4-5");
ok("chat is Haiku", pickModel({ kind: "chat" }).tier === "H");
ok("writeup is Sonnet", pickModel({ kind: "writeup" }).model === "claude-sonnet-5");
ok("post is Sonnet", pickModel({ kind: "post" }).tier === "S");
let threw = false; try { pickModel({ kind: "bogus" }); } catch { threw = true; } ok("an unknown kind throws rather than guessing", threw);

// Override always wins, over kind and over an agent run's own scoring.
ok("override: opus wins even over kind=read", pickModel({ kind: "read", override: "opus" }).model === "claude-opus-5-5");
ok("override: sonnet", pickModel({ override: "sonnet" }).model === "claude-sonnet-5");
ok("override: local", pickModel({ override: "local" }).model === "qwen3:8b");
ok("override: haiku", pickModel({ override: "haiku" }).model === "claude-haiku-4-5");
ok("override: fable sits in Opus's tier but names Fable's model", JSON.stringify({ t: pickModel({ override: "fable" }).tier, m: pickModel({ override: "fable" }).model }) === JSON.stringify({ t: "O", m: "claude-fable-5-1" }));
ok("override: auto is no override — falls through to the brief's own scoring", pickModel({ override: "auto", task: "fix a typo" }).tier === "S");
ok("override: empty is no override", pickModel({ override: "", task: "fix a typo" }).tier === "S");
threw = false; try { pickModel({ override: "bogus" }); } catch { threw = true; } ok("an unknown override throws rather than guessing", threw);

// An answer-resume (estimate.mjs's own kindOf) stays on Sonnet.
ok("an answer-resume stays on Sonnet", pickModel({ task: "The user has answered: go ahead" }).why === "Sonnet: answer-resume");

// Agent runs with no history: short, plain briefs stay on Sonnet.
ok("a short plain brief stays on Sonnet", pickModel({ task: "Fix the off-by-one in paginate()" }).tier === "S");

// Escalation signals, each enough on its own.
ok("a long brief escalates", pickModel({ task: "x".repeat(1501) }).why === "Opus: long brief");
ok("a brief naming several repos escalates", pickModel({ task: "Port the fix from /home/odessey/projects/argena/bot.mjs into /home/odessey/projects/steve/bot.mjs" }).why === "Opus: names several repos");
ok("two files in the same repo don't count as several", pickModel({ task: "Move a helper from /home/odessey/projects/symbiot/ai.mjs to /home/odessey/projects/symbiot/route.mjs" }).tier === "S");
ok("research/refactor/debug-style words escalate", pickModel({ task: "Investigate why the lane keeps failing" }).why === "Opus: research/refactor/debug-style work");
ok("touching keys escalates", pickModel({ task: "Rotate the API key in .env" }).why === "Opus: touches keys, money or publishing");
ok("a push to main escalates", pickModel({ task: "push to main once CI is green" }).why === "Opus: touches keys, money or publishing");

// Lane history (costs.json): too little history reads as none.
ok("no costs.json yet: no history, no escalation from it", JSON.stringify(laneHistory("/x")) === JSON.stringify({ median: 0, failRate: 0, samples: 0 }));
writeFileSync(join(CFG, "costs.json"), JSON.stringify([
  { path: "/lane/a", cost: 0.5, ok: true }, { path: "/lane/a", cost: 0.8, ok: true }, { path: "/lane/a", cost: 1.1, ok: true },
  { path: "/lane/b", cost: 1, ok: true }, { path: "/lane/b", cost: 2, ok: true }, { path: "/lane/b", cost: 3, ok: true },
  { path: "/lane/c", cost: 0.1, ok: false }, { path: "/lane/c", cost: 0.1, ok: false }, { path: "/lane/c", cost: 0.1, ok: true },
]));
ok("a cheap, reliable lane's median shows up without escalating", pickModel({ path: "/lane/a", task: "Fix the off-by-one in paginate()" }).why === "Sonnet: short brief, lane median $0.80");
ok("a lane whose median is $2 or more escalates", pickModel({ path: "/lane/b", task: "Fix the off-by-one in paginate()" }).why === "Opus: lane median $2.00");
ok("a lane that fails half the time or more escalates, even if cheap", pickModel({ path: "/lane/c", task: "Fix the off-by-one in paginate()" }).why === "Opus: lane fails often");
ok("two samples isn't enough history to act on", laneHistory("/lane/a", [{ path: "/lane/a", cost: 9, ok: false }, { path: "/lane/a", cost: 9, ok: false }]).samples === 2);

// repoCount and escalationReason are the same pure pieces pickModel is built from.
ok("repoCount dedupes by directory, not by file", repoCount("/a/b/one.mjs and /a/b/two.mjs") === 1);
ok("repoCount counts distinct directories", repoCount("/a/b/one.mjs and /c/d/two.mjs") === 2);
ok("escalationReason is \"\" when nothing calls for Opus", escalationReason("Fix the off-by-one in paginate()", { samples: 0 }) === "");

// Deterministic: the same inputs give the same answer.
ok("pure: calling twice gives the same result", JSON.stringify(pickModel({ path: "/lane/b", task: "Fix the off-by-one in paginate()" })) === JSON.stringify(pickModel({ path: "/lane/b", task: "Fix the off-by-one in paginate()" })));

console.log((fail ? "✗" : "✓") + " route: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
