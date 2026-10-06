// Lanes (lanes.mjs, handover.mjs): an agent hands another lane's job over, that
// lane's agent does it, and the result goes back to the one that asked, which
// carries on. No user in the loop. Isolated HOME (set before the modules load);
// the agents are stand-ins.
//
//   node test/lanes.mjs
//
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-lanes-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { lanesTick, loadLedger, MAX_CHAIN } = await import("../lanes.mjs");
const { parseHandoffs, handoverRules, ONLY_YOU } = await import("../handover.mjs");
const { buildTasksMd } = await import("../tasks.mjs");
const { actBrief } = await import("../mind.mjs");

// two repo lanes and the ops folder, on disk
const lane = (name) => { const p = join(HOME, "projects", name); mkdirSync(join(p, ".symbiot"), { recursive: true }); return p; };
const coral = lane("coral"), ghost = lane("GhostAIChat"), map = { coral, GhostAIChat: ghost };
const put = (p, f, t) => { mkdirSync(join(p, ".symbiot"), { recursive: true }); writeFileSync(join(p, ".symbiot", f), t); };
const read = (p, f) => { try { return readFileSync(join(p, ".symbiot", f), "utf8"); } catch { return ""; } };
// a run that has finished: its log header (started at `ts`), then what it said
const ran = (p, ts, said) => put(p, "agent.log", `\n=== x ${new Date(ts).toISOString()} ===\n$ claude -p …\n${said}\n`);

// stand-ins: what was started, and which folders are busy
const calls = { act: [], run: [], add: [], push: [] };
let busy = new Set(), runResult = () => ({ id: "j" + calls.run.length });
const opsDir = join(CFG, "drafts", "act-0001");
const deps = (extra = {}) => ({ map, now: Date.now(), tasks: extra.tasks || [],
  act: (text, o) => { calls.act.push({ text, o }); mkdirSync(join(opsDir, ".symbiot"), { recursive: true }); return { ok: true, job: "ops1", dir: opsDir }; },
  run: (p, o) => { calls.run.push({ p, o }); return runResult(p); },
  running: (p) => busy.has(p),
  add: (text, repo) => { calls.add.push({ text, repo }); return { id: "task" + calls.add.length }; },
  push: (f) => { calls.push.push(f); return { written: [{}] }; } });

try {
  console.log("THE BRIEF — lanes to hand over to, and what's only the user's");
  const md = buildTasksMd("coral", { lanes: ["coral", "symbiot", "GhostAIChat"] }, [{ text: "Build the Android app" }]);
  ok("a repo's brief names its lane, the others, and ops", /this one is `coral`/.test(md) && /`symbiot`, `GhostAIChat`/.test(md) && /`ops`: anything outside a repo/.test(md) && /\.symbiot\/HANDOFF\.md/.test(md), "");
  ok("👤 only for what no agent can do, and the option says which", md.includes(ONLY_YOU) && /👤 You \(only you: <which>\)/.test(md) && /never a 👤 step: do it, or hand it over/.test(md), "");
  const ab = actBrief("Find a JDK 17", { lanes: ["coral", "GhostAIChat"] });
  ok("the ops brief has the same rules, and its lane is ops", /this one is `ops`/.test(ab) && /`coral`, `GhostAIChat`/.test(ab) && ab.includes(ONLY_YOU), "");
  const ph = parseHandoffs("# Handoffs\n### ops\nFind a JDK 17 on this machine.\nWhy: the android build needs it.\n### `GhostAIChat`\nBuild the debug APK.\n## Notes\nnot a handover");
  ok("HANDOFF.md parses into lanes and what's needed", ph.length === 2 && ph[0].lane === "ops" && /JDK 17/.test(ph[0].text) && ph[1].lane === "GhostAIChat" && !/not a handover/.test(ph[1].text), ph);
  ok("the rules list a lane once, never the agent's own", handoverRules(["coral", "coral", "x"], "coral").join("\n").match(/`x`/g).length === 1 && !/: `coral`, /.test(handoverRules(["coral", "x"], "coral")[3]), "");

  console.log("TO OPS AND BACK — coral needs a JDK; ops finds it; coral carries on");
  put(coral, "HANDOFF.md", "### ops\nFind a JDK 17 on this machine and give its path.\nWhy: GhostAIChat's android build needs one.\n");
  const t1 = lanesTick(deps());
  ok("the ops agent is started on it, told who asked", t1.started.length === 1 && calls.act.length === 1 && /JDK 17/.test(calls.act[0].text) && /coral's agent/.test(calls.act[0].o.context), t1.started);
  ok("picked up once, not again on the next tick", lanesTick(deps()).started.length === 0 && calls.act.length === 1, calls.act.length);
  const h1 = loadLedger().handoffs[0];
  busy = new Set([opsDir]);
  ok("while ops works, nothing is reported", lanesTick(deps()).reported.length === 0, "");
  busy = new Set(); ran(opsDir, h1.at + 1000, "Found it: ~/.gradle/jdks/eclipse_adoptium-17 (JDK 17.0.19)."); put(opsDir, "TASKS.md", "- [x] Find a JDK 17\n");
  busy = new Set([coral]);
  ok("…nor while coral's own agent is still running (it would miss it)", lanesTick(deps()).reported.length === 0, "");
  busy = new Set(); const runsBefore = calls.run.length;
  const t2 = lanesTick(deps());
  const ans = read(coral, "ANSWERS.md");
  ok("the result goes back into coral's ANSWERS.md, with what ops said", t2.reported.length === 1 && /### Handed over to ops: Find a JDK 17/.test(ans) && /Done \(the ops agent\)/.test(ans) && /eclipse_adoptium-17/.test(ans), ans);
  ok("and coral's agent is started again to carry on", calls.run.length === runsBefore + 1 && calls.run.slice(-1)[0].p === coral && calls.run.slice(-1)[0].o.force, calls.run.slice(-1));
  ok("reported once", lanesTick(deps()).reported.length === 0 && loadLedger().handoffs[0].status === "done", loadLedger().handoffs[0].status);

  console.log("TO ANOTHER REPO — coral hands GhostAIChat its part");
  put(coral, "HANDOFF.md", "### GhostAIChat\nBuild the debug APK with the JDK at ~/.gradle/jdks/eclipse_adoptium-17.\n");
  runResult = () => ({ busy: true });
  const t3 = lanesTick(deps());
  const h3 = loadLedger().handoffs.find((h) => h.to.lane === "GhostAIChat");
  ok("it joins GhostAIChat's tasks, marked who it's from, and goes out like Send to repos", calls.add.slice(-1)[0].repo === "GhostAIChat" && /\(handed over by coral\)/.test(calls.add.slice(-1)[0].text) && calls.push.slice(-1)[0].repo === "GhostAIChat" && t3.started.length === 1, calls.add.slice(-1));
  ok("that lane busy: queued, and not counted done when the busy run ends", h3.status === "held" && (ran(ghost, h3.at - 5000, "an earlier run"), lanesTick(deps()).reported.length === 0), h3.status);
  ran(ghost, h3.at + 2000, "Built android/app/build/outputs/apk/debug/app-debug.apk.");
  const t4 = lanesTick(deps({ tasks: [{ id: h3.task, review: true }] }));
  ok("its run done and the task ticked: coral hears it's done and waits for review", t4.reported.length === 1 && /Done in GhostAIChat: the task is ticked/.test(read(coral, "ANSWERS.md")) && /app-debug\.apk/.test(read(coral, "ANSWERS.md")), read(coral, "ANSWERS.md").slice(-300));
  runResult = () => ({ id: "j" });

  console.log("NOT DONE BY HAND — mistakes go back to the agent, not to the user");
  put(coral, "HANDOFF.md", "### payroll\nRun payroll.\n### coral\nDo my own thing.\n");
  const t5 = lanesTick(deps());
  const a5 = read(coral, "ANSWERS.md");
  ok("a lane that doesn't exist: the agent hears which lanes do", t5.reported.some((e) => e.to.lane === "payroll") && /There's no lane called payroll\. Lanes: ops, or a repo: coral, GhostAIChat/.test(a5), a5.slice(-400));
  ok("its own lane: told to do it itself", /coral is your own lane: do it yourself/.test(a5), "");
  const deep = join(CFG, "drafts", "act-deep"); mkdirSync(join(deep, ".symbiot"), { recursive: true });
  const L = JSON.parse(readFileSync(join(CFG, "lanes.json"), "utf8")); L.handoffs.push({ id: "p", key: "p", from: { lane: "coral", path: coral }, to: { lane: "ops", path: deep }, text: "x", at: Date.now(), chain: MAX_CHAIN, status: "done", reportedAt: Date.now() });
  writeFileSync(join(CFG, "lanes.json"), JSON.stringify(L));
  put(deep, "HANDOFF.md", "### coral\nAnd back again.\n");
  lanesTick(deps());
  const e6 = loadLedger().handoffs.find((h) => h.from.path === deep);
  ok(`${MAX_CHAIN} handovers in a row: the next one isn't started (no ping-pong)`, e6 && e6.status === "error" && /handovers in a row/.test(e6.error), e6);
  ok("the ledger is yours only (0600)", existsSync(join(CFG, "lanes.json")) && (await import("node:fs")).statSync(join(CFG, "lanes.json")).mode % 0o1000 === 0o600, "");
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} lanes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
