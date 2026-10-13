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

const { JOBS, pickModel, laneHistory, escalationReason, repoCount, calibrate, tuning } = await import("../route.mjs");

console.log("ROUTE — which model answers a job, and why");

// One-shot jobs: the kind sets the tier outright.
ok("read is local, with its reason", pickModel({ kind: "read" }).model === "qwen3:8b" && /^local: last-message reader/.test(pickModel({ kind: "read" }).why));
// The allocation audit (2026-10-13): every one-shot job pinned to its tier, so a move is a visible edit here.
const PINNED = { read: "L", summary: "L", classify: "L", triage: "H", todo: "H", lang: "H", chat: "S", writeup: "S", update: "S", notes: "S", post: "S" };
for (const [job, tier] of Object.entries(PINNED)) ok(`job ${job} is pinned to ${tier}, with a reason`, pickModel({ kind: job }).tier === tier && JOBS[job].why.length > 10 && pickModel({ kind: job }).why.endsWith(JOBS[job].why), pickModel({ kind: job }));
ok("no job is unpinned: every JOBS entry is in the pin list", Object.keys(JOBS).sort().join() === Object.keys(PINNED).sort().join());
ok("nothing one-shot goes to Opus", Object.keys(JOBS).every((k) => pickModel({ kind: k }).tier !== "O"));
// Agent runs, by kind of brief.
ok("an answer-resume stays on Sonnet", pickModel({ task: "Answers: the user said yes, carry on" , kind: "" }).tier === "S");
ok("a research brief goes to Opus", pickModel({ task: "Investigate why the build fails" }).tier === "O");
ok("a brief touching publishing goes to Opus", pickModel({ task: "Publish the release to npm" }).tier === "O");
ok("summary is local", pickModel({ kind: "summary" }).tier === "L");
ok("classify is local", pickModel({ kind: "classify" }).tier === "L");
ok("triage is Haiku", pickModel({ kind: "triage" }).model === "claude-haiku-4-5");
ok("chat is Sonnet, never Haiku or local", pickModel({ kind: "chat" }).model === "claude-sonnet-5-5");
ok("writeup is Sonnet", pickModel({ kind: "writeup" }).model === "claude-sonnet-5-5");
ok("post is Sonnet", pickModel({ kind: "post" }).tier === "S");
let threw = false; try { pickModel({ kind: "bogus" }); } catch { threw = true; } ok("an unknown kind throws rather than guessing", threw);

// Override always wins, over kind and over an agent run's own scoring.
ok("override: opus wins even over kind=read", pickModel({ kind: "read", override: "opus" }).model === "claude-opus-5-5");
ok("override: sonnet", pickModel({ override: "sonnet" }).model === "claude-sonnet-5-5");
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

// Re-tuning: calibrate() reads costs.json; routing.json changes a dial with no code change.
{
  const cal = calibrate();
  ok("calibrate: counts runs and finds the lanes with enough history", cal.runs === 9 && cal.lanes.length === 3, cal);
  ok("calibrate: suggests twice the dearest lane median", cal.suggested.costFloor === 4 && cal.wouldEscalate === 2, cal);
  ok("calibrate: an empty history suggests the minimum, not nonsense", calibrate([]).suggested.costFloor === 0.5);
  ok("defaults: $1 cost floor, Sonnet 5.5 id", tuning().costFloor === 1 && tuning().models.S === "claude-sonnet-5-5");
  writeFileSync(join(CFG, "routing.json"), JSON.stringify({ costFloor: 5, models: { S: "claude-sonnet-x" }, tiers: { triage: "S" } }));
  ok("routing.json: raising costFloor stops the $2 lane escalating", pickModel({ path: "/lane/b", task: "Fix the off-by-one in paginate()" }).tier === "S");
  ok("routing.json: a model id and a one-shot tier can be changed", pickModel({ kind: "triage" }).model === "claude-sonnet-x" && pickModel({ kind: "read" }).tier === "L");
  writeFileSync(join(CFG, "routing.json"), "{ not json");
  ok("routing.json: a broken file falls back to the defaults", tuning().costFloor === 1);
  writeFileSync(join(CFG, "routing.json"), JSON.stringify({ costFloor: "lots", longBrief: -1 }));
  ok("routing.json: nonsense values are ignored", tuning().costFloor === 1 && tuning().longBrief === 1500);
  writeFileSync(join(CFG, "routing.json"), "{}");
}

// repoCount and escalationReason are the same pure pieces pickModel is built from.
ok("repoCount dedupes by directory, not by file", repoCount("/a/b/one.mjs and /a/b/two.mjs") === 1);
ok("repoCount counts distinct directories", repoCount("/a/b/one.mjs and /c/d/two.mjs") === 2);
ok("escalationReason is \"\" when nothing calls for Opus", escalationReason("Fix the off-by-one in paginate()", { samples: 0 }) === "");

// Deterministic: the same inputs give the same answer.
ok("pure: calling twice gives the same result", JSON.stringify(pickModel({ path: "/lane/b", task: "Fix the off-by-one in paginate()" })) === JSON.stringify(pickModel({ path: "/lane/b", task: "Fix the off-by-one in paginate()" })));

// withModel (agents.mjs): exactly one --model on a claude command, none on the others.
{
  const { withModel } = await import("../agents.mjs");
  const n = (s) => (s.match(/--model/g) || []).length;
  const a = withModel('claude -p "{prompt}" --model sonnet --x', "claude-opus-5-5"), b = withModel("claude -p x --model=haiku", "claude-sonnet-5-5");
  ok("withModel replaces an existing --model, leaving exactly one", n(a) === 1 && a.endsWith("--model claude-opus-5-5") && !/sonnet\b/.test(a.replace("claude-sonnet", "")), a);
  ok("withModel replaces --model=x too", n(b) === 1 && b.endsWith("--model claude-sonnet-5-5") && !b.includes("haiku"), b);
  ok("withModel adds one when there was none", n(withModel("claude -p x", "claude-fable-5-1")) === 1);
  ok("withModel leaves codex/aider/gemini commands alone", withModel("codex exec x", "claude-opus-5-5") === "codex exec x" && withModel("claude -p x", "") === "claude -p x");
  const { routedModel } = await import("../agents.mjs");
  ok("routedModel: a [model: opus] task line picks opus", routedModel("/tmp/nonexistent-repo", { model: "opus" }) === "opus");
  writeFileSync(join(CFG, "lanes.json"), JSON.stringify({ lanes: { steve: { model: "opus" } } }));
  ok("routedModel: a lane's own model in lanes.json always wins over Auto", routedModel("/tmp/steve") === "opus");
  ok("routedModel: another lane stays on Auto", routedModel("/tmp/other-lane") !== "opus");
  ok("routedModel: an unreadable repo falls back to a model or \"\", never throws", typeof routedModel("/tmp/nonexistent-repo") === "string");
}

// Chat floor (ai.mjs): Home and Reports chat never go to a local model, whatever the saved provider is.
{
  const ai = await import("../ai.mjs");
  const o = { provider: "ollama", model: "llama3.1:8b" }, h = { provider: "claude", model: "haiku" };
  const got = ai.aboveFloor(o);
  ok("chat: a local provider is never what answers (Claude if connected, else nothing)", got === null || got.provider !== "ollama", got);
  ok("chat: Haiku is lifted to Sonnet", ai.aboveFloor(h).model === "sonnet");
  ok("chat: Sonnet stays", ai.aboveFloor({ provider: "claude", model: "sonnet" }).model === "sonnet");
  if (!ai.aboveFloor(null)) ok("chat: with no Claude reachable the reply says so, not a local answer", (await ai.write("s", "p", { floor: "sonnet" })) === ai.NO_CHAT_MODEL);
  // installing a local model leaves the provider alone
  const { writeFileSync, readFileSync } = await import("node:fs");
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ provider: "claude" }));
  ai.useOllamaModel("llama3.1:8b");
  const c = JSON.parse(readFileSync(join(CFG, "config.json"), "utf8"));
  ok("installing a local model leaves cfg.provider unchanged but records the model", c.provider === "claude" && c.ollama.model === "llama3.1:8b", c);
}

// write() routing (ai.mjs routeFor): a job's kind picks the model when Claude is the provider.
{
  const ai = await import("../ai.mjs");
  const cl = { provider: "claude", model: "" }, an = { provider: "anthropic", model: "x", key: "k" }, oa = { provider: "openai", model: "gpt-4o-mini" };
  ok("triage goes to Haiku", (await ai.routeFor(cl, "triage")).r.model === "haiku");
  ok("writeup goes to Sonnet", (await ai.routeFor(cl, "writeup")).r.model === "sonnet");
  ok("the same on an Anthropic key", (await ai.routeFor(an, "post")).r.model === "claude-sonnet-5-5");
  ok("a provider the user picked (OpenAI) is left alone", (await ai.routeFor(oa, "triage")).r === oa);
  ok("no kind: unchanged", (await ai.routeFor(cl, "")).r === cl);
  // Ollama isn't answering on 11434 in the test (or lacks the model): a local job goes straight to Haiku, never waits.
  const t0 = Date.now(), loc = await ai.routeFor(cl, "read");
  ok("read falls to Haiku when the local model isn't ready", loc.local ? await ai.localReady() : loc.r.model === "haiku", loc);
  ok("…and doesn't wait on it", Date.now() - t0 < 25000); // the ping is capped at 20 s, even for a cold model load
  ok("the tier list offers qwen3:8b, the routed local model", ai.recommendModels({ ramGB: 16 }).local.some((m) => m.model === "qwen3:8b" && m.fits));
}

console.log((fail ? "✗" : "✓") + " route: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
