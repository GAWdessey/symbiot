// Where uncommitted changes came from (origin.mjs), and what the Workdesk and Home make of them.
// 19 Oct 2026: an ops run (act-c6a0236a) edited three files in symbiot's checkout from a folder
// of its own; the Workdesk offered them as "Uncommitted changes with no ticked task behind them"
// with a bare Approve button while it was still at it, and Home counted them as waiting on the
// user. Isolated HOME, set before the modules load.
//
//   node test/origin.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, unlinkSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-origin-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const gitEnv = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const repo = join(HOME, "projects", "orig"), act = join(CFG, "drafts", "act-test1");
mkdirSync(join(repo, ".symbiot"), { recursive: true }); mkdirSync(join(act, ".symbiot"), { recursive: true });
execSync("git init -q -b main && echo a > a.txt && echo b > b.txt && git add . && git commit -qm init", { cwd: repo, env: gitEnv });
writeFileSync(join(repo, ".symbiot", "TASKS.md"), "- [ ] Make the Home balls say what they wait on\n- [ ] Pay for Pro on the site\n");
writeFileSync(join(CFG, "tasks.json"), JSON.stringify([{ id: "o1", text: "Make the Home balls say what they wait on", repo: "orig", done: false, ts: 1 }, { id: "o2", text: "Pay for Pro on the site", repo: "orig", done: false, ts: 2 }]));
writeFileSync(join(act, ".symbiot", "handoff.json"), JSON.stringify({ name: "Agent: Save the Lemon Squeezy key" }));
writeFileSync(join(CFG, "runs.json"), JSON.stringify([{ path: act, name: "Agent: Save the Lemon Squeezy key", startedAt: Date.now() - 120000 }]));
// the ops run's log: it reads the repo (a node -e look, a cat), then edits a.txt there with a script
const T0 = Date.now() - 60000;
const step = (t, cmd) => JSON.stringify({ type: "assistant", timestamp: new Date(t).toISOString(), message: { role: "assistant", content: [{ type: "tool_use", id: "x" + t, name: "Bash", input: { command: cmd } }] } });
writeFileSync(join(act, ".symbiot", "agent.log"), [
  `=== Agent: Save the Lemon Squeezy key ${new Date(T0 - 60000).toISOString()} ===`, "$ claude -p go",
  step(T0 - 30000, "cd ~/projects/orig; git status --short; node -e 'console.log(1)' 2>&1 | head"),
  step(T0 - 20000, `cat ${repo}/a.txt`),
  step(T0, "cd ~/projects/orig; python3 - <<'E'\np='a.txt'; s=open(p).read()\nopen(p,'w').write(s+'x')\nE"),
].join("\n") + "\n");
writeFileSync(join(repo, "a.txt"), "edited by the ops run\n"); utimesSync(join(repo, "a.txt"), new Date(T0 + 1000), new Date(T0 + 1000));
const lock = join(act, ".symbiot", "agent.pid"), live = () => writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: Date.now() })); // a live pid (this one), started after this process (else it reads as a reused pid)

const O = await import("../origin.mjs");
const T = await import("../tasks.mjs");
const { homeState, workScene } = await import("../home.mjs");

try {
  console.log("WHERE CHANGES CAME FROM");
  ok("a run's log shows it writing in this checkout only where it changes files there, not where it reads them", O.writesIn([step(1e12, "cd ~/projects/orig; cat a.txt; node -e 'x=>1' 2>&1"), step(2e12, "sed -i s/a/b/ " + repo + "/a.txt"), step(3e12, "cat " + repo + "-other/a.txt > /tmp/x")].join("\n"), repo, { home: HOME }).join() === String(2e12));

  console.log("(1) AN AGENT STILL AT WORK THERE, FROM A FOLDER OF ITS OWN");
  live();
  const busy = O.changesBy(repo, ["a.txt"]);
  ok("an ops run alive in its own folder that edited this checkout is at work here", busy.atWork && busy.atWork.id === "act-test1" && busy.atWork.outside === true && busy.atWork.name === "Save the Lemon Squeezy key", busy);
  T.forgetReview();
  const card = T.pendingReview().find((r) => r.repo === "orig");
  ok("the review card says an agent is at work, which run, and offers nothing to approve", card && card.running === true && card.atWork && /still at work here: run act-test1 \(“Save the Lemon Squeezy key”\), from a folder of its own/.test(card.origin) && /nothing to approve until it finishes/.test(card.origin), card);
  const ac = await T.approveChanges("orig", { push: false, confirm: true });
  ok("…and Approve refuses meanwhile, nothing committed", ac.running && /still at work/.test(ac.error || "") && /M a\.txt/.test(execSync("git status --porcelain", { cwd: repo, encoding: "utf8" })), ac);
  ok("Home leaves it out: no Approve card in \"Only the user can do\", no ember", !homeState({ fresh: true, deps: homeDeps([card]) }).you.some((y) => y.kind === "approve") && !workScene({ deps: sceneDeps([card]) }).ready.length);

  console.log("(2) LEFT WITH NO TICKED TASK: WHERE FROM, AND WHAT TO DO");
  unlinkSync(lock); T.forgetReview();
  const left = T.pendingReview().find((r) => r.repo === "orig");
  ok("the run ended: the card is no longer at work, and its changes are leftover (no task ticked, none said finished)", left && left.running === false && left.untasked && left.leftover === true && !left.atWork, left);
  ok("…its one line says which run left them and when, and what to do", left && /^Left by run act-test1 \(“Save the Lemon Squeezy key”\), which edited here from a folder of its own, (at )?\d\d:\d\d/.test(left.origin) && /with no task ticked: check the diff, tick the task below it finished and approve, or leave it for the next run here to finish\.$/.test(left.origin), left && left.origin);
  const own = O.changesBy(repo, ["a.txt"], { runs: () => [], runFiles: () => [{ id: "042c556d", startedAt: T0 - 5000, endedAt: T0 + 5000, ticked: 0, files: ["a.txt"] }] });
  ok("changes this checkout's own run made are put down to that run", own.run && own.run.id === "042c556d" && own.run.outside === false && /^Left by run 042c556d, /.test(O.originLine(own)), own);
  writeFileSync(join(repo, "b.txt"), "by hand\n");
  const hand = O.changesBy(repo, ["b.txt"], { runs: () => [], runFiles: () => [] });
  ok("changes no Symbiot run was making say so, rather than offering them bare", !hand.run && !hand.atWork && /^Changed at \d\d:\d\d while no Symbiot run was working here, so by hand or by a session Symbiot didn't start: check the diff, and approve only if you know whose they are\.$/.test(O.originLine(hand)), O.originLine(hand));

  console.log("(3) LEFTOVER CHANGES AREN'T WAITING ON THE USER ON HOME");
  const h = homeState({ fresh: true, deps: homeDeps([left]) }), w = workScene({ deps: sceneDeps([left]) });
  ok("no \"Approve orig · changes without a task · only you decide\" in Only the user can do", !h.you.some((y) => y.kind === "approve"), h.you);
  ok("…and no ember: the project isn't ready for your OK, nor lit", !w.ready.length && !(w.projects || []).some((p) => p.repo === "orig" && (p.lit || p.ready)), [w.ready, w.projects]);
  const done = { ...left, leftover: undefined, open: [{ id: "o1", text: "Make the Home balls say what they wait on", finished: true }] };
  ok("changes a run says finished a task still wait on you, on both", homeState({ fresh: true, deps: homeDeps([done]) }).you.some((y) => y.id === "approve:orig") && workScene({ deps: sceneDeps([done]) }).ready.length === 1);
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

function homeDeps(pending) {
  return { board: () => ({ cards: [] }), pending: () => pending, agents: () => [], lanes: () => ({ handoffs: [] }), connected: () => true, repos: () => ({ orig: repo }), reports: () => ({ count: 0 }), agentCmd: () => 'claude -p "{prompt}"', search: () => ({ searching: false, at: 1 }), confirmed: () => true, rootsSet: () => true };
}
function sceneDeps(pending) { return { agents: () => [], pending: () => pending, tasks: () => [], repos: () => ({ orig: repo }), parked: () => [] }; }
