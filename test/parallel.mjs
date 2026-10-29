// Parallel runs in one lane (parallel.mjs): two independent tasks run at once, each in
// a git worktree of its own, merged back when they finish; a task that truly clashes,
// or a lane at its cap, waits and says what for. Isolated HOME (set before the modules load).
//
//   node test/parallel.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-par-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const sh = (cwd, ...a) => spawnSync("git", ["-C", cwd, "-c", "user.email=t@t", "-c", "user.name=t", ...a], { encoding: "utf8" });

const P = await import("../parallel.mjs");
const { workTick, workScene } = await import("../home.mjs");
const PRO = { plan: "pro" };

console.log("WHAT A TASK NEEDS — a clash holds it back; nothing else does");
ok("two edits to ui.mjs clash; ui.mjs and phone.mjs don't", P.clash("Fix ui.mjs card", "Rework ui.mjs home") === "file ui.mjs" && P.clash("Fix ui.mjs", "Fix phone.mjs") === "");
ok("the same port clashes", P.clash("Free up port 7392", "Fix the Port 7392 error") === "port 7392");
ok("the phone cable, the publish step and the browser are shared too", P.clash("test on the Android phone over adb", "plug in with USB") === "device" && P.clash("run npm publish", "the trusted publisher") === "publish" && P.clash("sign in with the Symbiot Browser", "use symbiot screens") === "browser");
ok("TASKS.md and ANSWERS.md are in every brief: not a clash", P.clash("Read TASKS.md", "Read TASKS.md") === "");
const v = (o) => P.verdict({ text: "Fix phone.mjs", name: "symbiot", active: [{ text: "Fix ui.mjs", who: "symbiot's run" }], count: 1, cap: 3, pro: true, dirty: [], git: true, ...o });
ok("independent, with room: goes beside", v({}).ok === true);
ok("at the cap: held, and it says how many and where to change it", (() => { const r = v({ count: 3 }); return !r.ok && r.kind === "cap" && /3 agents are already working in symbiot/.test(r.text) && /Settings/.test(r.text); })());
ok("a clash: held, naming the shared thing and the task that has it", (() => { const r = v({ text: "Rework ui.mjs", }); return !r.ok && r.kind === "clash" && /both need ui\.mjs, and "Fix ui\.mjs" has it now/.test(r.text); })());
ok("the same job in other words: held with the run that's on it, never a second run beside it (29 Oct 2026)", (() => {
  const job = "Home shows the proof behind each status line, from GitHub and the vault, not an agent's word";
  const r = v({ text: job + ".", active: [{ text: job, who: "symbiot's run" }] }), p = P.peel([{ id: "a", text: job }, { id: "b", text: "Fix tray.mjs" }, { id: "c", text: job + "." }], { name: "symbiot", cap: 3, pro: true, git: true });
  return !r.ok && r.kind === "same" && /same job as/.test(r.text) && p.peeled.map((x) => x.id).join() === "b" && p.held.c && p.held.c.kind === "same";
})());
ok("Free runs one agent at a time", v({ pro: false }).kind === "free");
ok("not a git project: held, saying why", v({ git: false }).kind === "nogit");
ok("a file with uncommitted work: held until it's approved", v({ text: "Fix a.mjs", dirty: ["a.mjs"] }).kind === "dirty");
ok("the cap is a setting: 3 by default, Free is 1", P.laneCap({}, PRO) === 3 && P.laneCap({ laneParallel: 5 }, PRO) === 5 && P.laneCap({ laneParallel: 99 }, PRO) === 8 && P.laneCap({ laneParallel: 5 }, { plan: "free" }) === 1);

console.log("PEEL — the first task is the lane's own run; the independent ones go beside it");
{
  const items = [{ id: "a", text: "Fix ui.mjs" }, { id: "b", text: "Fix phone.mjs" }, { id: "c", text: "Rework ui.mjs again" }, { id: "d", text: "Fix route.mjs" }, { id: "e", text: "Fix tray.mjs" }];
  const r = P.peel(items, { name: "symbiot", cap: 3, pro: true, git: true });
  ok("with a cap of 3: the first stays, two independent ones go beside it, a clash and an overflow stay", r.peeled.map((x) => x.id).join() === "b,d" && r.rest.map((x) => x.id).join() === "a,c,e", r);
  ok("each one held back says why", /ui\.mjs/.test(r.held.c.text) && r.held.e.kind === "cap", r.held);
  ok("a cap of 1 peels nothing", P.peel(items, { name: "s", cap: 1, pro: true, git: true }).peeled.length === 0);
}

console.log("A RUN BESIDE — its own worktree, merged back");
{
  const repo = join(HOME, "repo"); mkdirSync(repo, { recursive: true });
  sh(repo, "init", "-q", "-b", "main"); writeFileSync(join(repo, "a.mjs"), "a1\n"); writeFileSync(join(repo, "b.mjs"), "b1\n"); sh(repo, "add", "-A"); sh(repo, "commit", "-qm", "init");
  mkdirSync(join(repo, ".symbiot"), { recursive: true });
  writeFileSync(join(repo, ".symbiot", "TASKS.md"), "# Symbiot tasks\n\n## Tasks\n- [ ] Change a.mjs\n- [ ] Change b.mjs\n\n## When you finish an item\n- tick it\n");
  const ran = []; let hook;
  const run = (wt, o) => { ran.push(wt); hook = o && o.onExit; return { id: "run1" }; };
  const r = P.startParallel("repo", repo, { id: "t2", text: "Change b.mjs" }, { run });
  ok("started: a worktree of its own on its own branch", r.ok && ran.length === 1 && existsSync(join(ran[0], "b.mjs")) && /symbiot\/par-/.test(sh(ran[0], "branch", "--show-current").stdout), r);
  const brief = readFileSync(join(ran[0], ".symbiot", "TASKS.md"), "utf8");
  ok("its brief lists only its task, and keeps the lane's rules", /- \[ \] Change b\.mjs/.test(brief) && !/Change a\.mjs/.test(brief) && /When you finish an item/.test(brief) && /parallel run/.test(brief), brief);
  ok("it counts as in flight, so the lane's own brief leaves it out", P.inflightIds().has("t2") && P.parallelLane(ran[0]) === "repo");
  // the agent does its work in the worktree and ticks
  const wt = ran[0];
  writeFileSync(join(wt, "b.mjs"), "b2\n"); writeFileSync(join(wt, "new.mjs"), "n\n");
  writeFileSync(join(wt, ".symbiot", "TASKS.md"), brief.replace("- [ ] Change b.mjs", "- [x] Change b.mjs"));
  writeFileSync(join(repo, "a.mjs"), "a2\n"); // the lane's own run changes another file meanwhile
  hook(0);
  ok("merged back: the file changed and the new one are in the lane's folder, beside the lane's own edit", readFileSync(join(repo, "b.mjs"), "utf8") === "b2\n" && existsSync(join(repo, "new.mjs")) && readFileSync(join(repo, "a.mjs"), "utf8") === "a2\n");
  const main = readFileSync(join(repo, ".symbiot", "TASKS.md"), "utf8");
  ok("the task shows ticked in the lane's brief, once", (main.match(/- \[x\] Change b\.mjs/g) || []).length === 1 && /- \[ \] Change a\.mjs/.test(main), main);
  const rf = JSON.parse(readFileSync(join(repo, ".symbiot", "runfiles.json"), "utf8"));
  ok("Approve ships its files: they're recorded as a finished run that ticked", rf.some((x) => x.ticked === 1 && x.files.includes("b.mjs") && x.files.includes("new.mjs")), rf);
  ok("the worktree and branch are gone", !existsSync(wt) && !/par-/.test(sh(repo, "branch").stdout) && P.inflight().length === 0);

  // a clash: both changed the same lines
  const conflicts = [];
  const r2 = P.startParallel("repo", repo, { id: "t3", text: "Rework a.mjs" }, { run }), wt2 = ran[1];
  writeFileSync(join(wt2, "a.mjs"), "a-beside\n"); writeFileSync(join(wt2, ".symbiot", "TASKS.md"), "## Tasks\n- [x] Rework a.mjs\n");
  writeFileSync(join(repo, "a.mjs"), "a-main\n");
  hook(0);
  void r2;
  // addTask is passed at start; call mergeBack again isn't possible (gone), so check the saved patch instead
  ok("a real clash isn't forced in: the lane's file is untouched and the changes are saved as a patch", readFileSync(join(repo, "a.mjs"), "utf8") === "a-main\n" && existsSync(join(repo, ".symbiot")) && /parallel-/.test(sh(repo, "status", "--porcelain", "-uall").stdout + require_ls(join(repo, ".symbiot"))));
  void conflicts;
  // not finished: nothing merges, the task stays open
  const r3 = P.startParallel("repo", repo, { id: "t4", text: "Change b.mjs more" }, { run }), wt3 = ran[2];
  writeFileSync(join(wt3, "b.mjs"), "half\n"); hook(0);
  ok("an unfinished run (nothing ticked) merges nothing", readFileSync(join(repo, "b.mjs"), "utf8") === "b2\n" && r3.ok);
  // and it isn't started beside again on the same inputs: four such runs left byte-identical patches (14 Oct 2026 audit)
  const again = P.besideAgain(repo, "t4");
  ok("…and isn't started beside again while nothing it ran with has changed", again && again.tries === 1 && /stopped without finishing/.test(again.note), again);
  P.noteTried(repo, "t4", "half-patch");
  ok("…tries counted, and an identical patch noticed", P.besideAgain(repo, "t4").tries === 2 && JSON.parse(readFileSync(join(repo, ".symbiot", "beside.json"), "utf8")).t4.same === false, readFileSync(join(repo, ".symbiot", "beside.json"), "utf8"));
  writeFileSync(join(repo, ".symbiot", "ANSWERS.md"), "# Answers\n\n### Handed over to ops: x\nIt stopped without finishing.\n_answered by symbiot (handover) 2026-10-14_\n");
  ok("…Symbiot's own notes in ANSWERS.md don't count as a change", !!P.besideAgain(repo, "t4"));
  writeFileSync(join(repo, ".symbiot", "ANSWERS.md"), "# Answers\n\n### Which file?\nb.mjs only\n_answered 2026-10-14_\n");
  ok("…the user's answer does: it may go beside again", P.besideAgain(repo, "t4") === null);
  P.noteTried(repo, "t4", "", { done: true });
  ok("…and a finished one is on record as merged, so no second copy starts on it while its tick lands", P.besideAgain(repo, "t4").kind === "merged" && JSON.parse(readFileSync(join(repo, ".symbiot", "beside.json"), "utf8")).t4.merged === true);
}
function require_ls(d) { return spawnSync("ls", [d], { encoding: "utf8" }).stdout; }

console.log("A CONFLICT — the task stays open, naming the patch, for the lane's own run (no merge task, no tick, no second copy)");
{
  const repo = join(HOME, "repo2"); mkdirSync(repo, { recursive: true });
  sh(repo, "init", "-q", "-b", "main"); writeFileSync(join(repo, "a.mjs"), "a1\n"); sh(repo, "add", "-A"); sh(repo, "commit", "-qm", "init");
  mkdirSync(join(repo, ".symbiot"), { recursive: true }); writeFileSync(join(repo, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Rework a.mjs\n");
  const TASKS = join(HOME, ".config", "symbiot", "tasks.json"), tasks = () => JSON.parse(readFileSync(TASKS, "utf8"));
  writeFileSync(TASKS, JSON.stringify([{ id: "t9", text: "Rework a.mjs", repo: "repo2", ts: 1 }, { id: "t10", text: "Tidy b.mjs", repo: "repo2", ts: 1 }]));
  let hook; const added = [];
  const run = (wt, o) => { hook = o.onExit; return { id: "r" }; };
  const r = P.startParallel("repo2", repo, { id: "t9", text: "Rework a.mjs" }, { run, addTask: (text, lane) => added.push({ text, lane }) });
  const started = JSON.parse(readFileSync(join(repo, ".symbiot", "beside.json"), "utf8")).t9;
  ok("on record from the start: beside.json says which copy is on it", r.ok && started && started.wt === P.inflight()[0].wt && P.besideAgain(repo, "t9").kind === "working", started);
  const wt = P.inflight().find((m) => m.taskId === "t9").wt;
  writeFileSync(join(wt, "a.mjs"), "beside\n"); writeFileSync(join(wt, ".symbiot", "TASKS.md"), "## Tasks\n- [x] Rework a.mjs\n");
  writeFileSync(join(repo, "a.mjs"), "main\n");
  hook(0);
  const t9 = tasks().find((t) => t.id === "t9"), patch = (t9.text.match(/\.symbiot\/parallel-[0-9a-f]+\.patch/) || [])[0];
  ok("no merge task: the task itself stays open, naming the patch and what to do with it", added.length === 0 && !t9.review && patch && t9.patch === patch && /merge them by hand/.test(t9.text) && existsSync(join(repo, patch)), t9);
  ok("nothing was ticked in the lane's brief, and the lane's file is as it was", /- \[ \] Rework a\.mjs/.test(readFileSync(join(repo, ".symbiot", "TASKS.md"), "utf8")) && readFileSync(join(repo, "a.mjs"), "utf8") === "main\n" && P.inflight().length === 0);
  const again = P.besideAgain(repo, "t9");
  ok("…and the record holds: it isn't started beside again, it says why, whatever the inputs", again && again.kind === "conflict" && /clash with the main folder's/.test(again.note), again);
  ok("a task that names a patch, or a merge task, never goes beside", P.verdict({ text: t9.text, name: "repo2", pro: true, git: true, cap: 3 }).kind === "merge" && P.verdict({ text: "Merge a finished task's changes into repo2: \"x\" was done in a copy", name: "repo2", pro: true, git: true, cap: 3 }).kind === "merge" && !!P.startParallel("repo2", repo, { id: "t9", text: t9.text }, { run }).error);
  // a second clash on the same task replaces the note instead of nesting one in another
  P.attachPatch({ id: "ffffff", lane: "repo2", repo, task: t9.text, taskId: "t9" }, join(repo, ".symbiot", "parallel-ffffff.patch"));
  const t9b = tasks().find((t) => t.id === "t9");
  ok("a second clash on it names the new patch in place of the old: never nested", (t9b.text.match(/parallel-/g) || []).length === 1 && /parallel-ffffff\.patch/.test(t9b.text) && t9b.text.startsWith("Rework a.mjs — "), t9b.text);
  // an older task not in tasks.json: a merge task once, with the innermost task's words
  const r2 = P.startParallel("repo2", repo, { id: "zz", text: "Merge a finished task's changes into repo2: \"Tidy c.mjs\" was done in a copy of the repo, and its changes clash" }, { run });
  ok("…and a merge task is never started beside", !!r2.error);
  P.attachPatch({ id: "aaaaaa", lane: "repo2", repo, task: "Merge a finished task's changes into repo2: \"Tidy c.mjs\" was done in a copy of the repo, and its changes clash with newer ones in the main folder. They're saved as x.", taskId: "zz" }, join(repo, ".symbiot", "parallel-aaaaaa.patch"), { addTask: (text, lane) => added.push({ text, lane }) });
  ok("a task Symbiot has no record of gets one merge task, naming the real task, not a merge task's", added.length === 1 && /into repo2: "Tidy c\.mjs" was done/.test(added[0].text) && !/Merge a finished.*Merge a finished/.test(added[0].text), added);
  // merged cleanly: the task goes to review at once, not on the next push
  writeFileSync(TASKS, JSON.stringify([{ id: "t10", text: "Tidy b.mjs", repo: "repo2", ts: 1 }]));
  P.startParallel("repo2", repo, { id: "t10", text: "Tidy b.mjs" }, { run });
  const wt2 = P.inflight().find((m) => m.taskId === "t10").wt;
  writeFileSync(join(wt2, "b.mjs"), "b\n"); writeFileSync(join(wt2, ".symbiot", "TASKS.md"), "## Tasks\n- [x] Tidy b.mjs\n");
  hook(0);
  ok("merged: the task is in review in tasks.json at once, so the next tick can't peel it again", tasks().find((t) => t.id === "t10").review === true && readFileSync(join(repo, "b.mjs"), "utf8") === "b\n");
}

console.log("THE BASE — a copy starts from the lane's tree as it is, uncommitted work and all");
{
  const repo = join(HOME, "repo3"); mkdirSync(repo, { recursive: true });
  sh(repo, "init", "-q", "-b", "main"); writeFileSync(join(repo, "a.mjs"), "a1\n"); writeFileSync(join(repo, "b.mjs"), "b1\n"); writeFileSync(join(repo, ".gitignore"), "ignored.txt\n"); sh(repo, "add", "-A"); sh(repo, "commit", "-qm", "init");
  mkdirSync(join(repo, ".symbiot"), { recursive: true }); writeFileSync(join(repo, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Change b.mjs\n");
  writeFileSync(join(repo, "a.mjs"), "a-dirty\n"); writeFileSync(join(repo, "u.mjs"), "untracked\n"); writeFileSync(join(repo, "ignored.txt"), "no\n"); // the lane's own run's work, not yet approved
  let hook; const run = (wt, o) => { hook = o.onExit; return { id: "r" }; };
  const r = P.startParallel("repo3", repo, { id: "b1", text: "Change b.mjs" }, { run }), wt = P.inflight()[0].wt;
  ok("the copy has the lane's uncommitted edit and its new file, not an ignored one; the lane's index is untouched", r.ok && readFileSync(join(wt, "a.mjs"), "utf8") === "a-dirty\n" && readFileSync(join(wt, "u.mjs"), "utf8") === "untracked\n" && !existsSync(join(wt, "ignored.txt")) && sh(repo, "status", "--porcelain", "--", ".", ":(exclude).symbiot").stdout.trim() === "M a.mjs\n?? u.mjs", sh(repo, "status", "--porcelain").stdout);
  writeFileSync(join(wt, "b.mjs"), "b2\n"); writeFileSync(join(wt, ".symbiot", "TASKS.md"), "## Tasks\n- [x] Change b.mjs\n");
  hook(0);
  ok("merged back without a clash: only its own change comes over, the lane's dirty work stays as it was", readFileSync(join(repo, "b.mjs"), "utf8") === "b2\n" && readFileSync(join(repo, "a.mjs"), "utf8") === "a-dirty\n" && readFileSync(join(repo, "u.mjs"), "utf8") === "untracked\n" && !existsSync(join(repo, ".symbiot", "parallel-" + P.inflight().length)) && !readdirSync(join(repo, ".symbiot")).some((f) => /\.patch$/.test(f)), readdirSync(join(repo, ".symbiot")));
  ok("a clean tree starts from HEAD itself", P.snapshot(repo, sh(repo, "rev-parse", "HEAD").stdout.trim(), []).dirty === false);
}

console.log("WHAT A COPY LEAVES — handovers, questions, waits, facts and reports land in the lane before the copy goes");
{
  const repo = join(HOME, "repo4"); mkdirSync(repo, { recursive: true });
  sh(repo, "init", "-q", "-b", "main"); writeFileSync(join(repo, "a.mjs"), "a1\n"); sh(repo, "add", "-A"); sh(repo, "commit", "-qm", "init");
  mkdirSync(join(repo, ".symbiot"), { recursive: true }); writeFileSync(join(repo, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Remove the trial account on production\n"); writeFileSync(join(repo, ".symbiot", "REPORT.md"), "# Older\n");
  writeFileSync(join(repo, ".symbiot", "ANSWERS.md"), "# Answers\n\n### Which account?\nthe trial one\n_answered 2026-10-15_\n");
  let hook; const run = (wt, o) => { hook = o.onExit; return { id: "r" }; };
  P.startParallel("repo4", repo, { id: "p1", text: "Remove the trial account on production" }, { run });
  const wt = P.inflight()[0].wt, sd = join(wt, ".symbiot");
  writeFileSync(join(sd, "HANDOFF.md"), "# Handovers\n\n### ops\nNew job: remove the trial account on prod-box (ssh root@prod, `rm -rf /srv/trial`).\n");
  writeFileSync(join(sd, "QUESTIONS.md"), "# Questions\n\n## Questions\n### Which account?\nanswered in the copy\n- a\n### Delete its backups too?\nThey hold 2 GB.\n- Yes\n- Keep them\n\n## Suggestions\n### Add a trial flag\n");
  writeFileSync(join(sd, "ANSWERS.md"), readFileSync(join(sd, "ANSWERS.md"), "utf8") + "\n### Which account?\nthe trial one\n_answered 2026-10-15_\n"); // the copy's answers started as the lane's
  writeFileSync(join(sd, "AWAITING.json"), JSON.stringify([{ to: "host@prod.example", subject: "Trial removal", asked: "confirm", next: "tick" }]));
  writeFileSync(join(sd, "REMEMBER.json"), JSON.stringify([{ name: "prod-box", kind: "thing", fact: "production Bookly runs on prod-box" }]));
  writeFileSync(join(sd, "REPORT.md"), "# Trial removal\nWhat I found.\n"); writeFileSync(join(sd, "PLAN.md"), "# Plan\nSteps.\n");
  hook(0); // nothing changed in the code, nothing ticked: it handed over and asked instead
  const L = (f) => { try { return readFileSync(join(repo, ".symbiot", f), "utf8"); } catch { return ""; } };
  ok("the handover is in the lane's HANDOFF.md as a section to send, marked with the task", /### ops\nNew job: remove the trial account on prod-box/.test(L("HANDOFF.md")) && /from a run beside repo4 on "Remove the trial account/.test(L("HANDOFF.md")), L("HANDOFF.md"));
  ok("its open question is in the lane's QUESTIONS.md with its context and options; the answered one isn't; the idea comes too", /### Delete its backups too\?\nThey hold 2 GB\.\n- Yes\n- Keep them/.test(L("QUESTIONS.md")) && !/### Which account\?/.test(L("QUESTIONS.md")) && /## Suggestions\n### Add a trial flag/.test(L("QUESTIONS.md")), L("QUESTIONS.md"));
  ok("the email it waits on and the fact it found join the lane's lists, the wait marked with the task", JSON.parse(L("AWAITING.json"))[0].task === "Remove the trial account on production" && JSON.parse(L("REMEMBER.json"))[0].name === "prod-box", [L("AWAITING.json"), L("REMEMBER.json")]);
  ok("its reports are kept, a clashing name set apart, each saying which run wrote it", /^# Plan\n_\(from a run beside repo4/.test(L("PLAN.md")) && L("REPORT.md") === "# Older\n" && readdirSync(join(repo, ".symbiot")).some((f) => /^REPORT-[0-9a-f]{6}\.md$/.test(f)), readdirSync(join(repo, ".symbiot")));
  const again = P.besideAgain(repo, "p1");
  ok("an empty patch that handed over counts as handed over, not unfinished: no retry on the same inputs or any others", again && again.kind === "handed" && /handed this to another lane/.test(again.note) && !existsSync(wt), again);
  // asked only
  writeFileSync(join(repo, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Rename the trial plan\n");
  P.startParallel("repo4", repo, { id: "p2", text: "Rename the trial plan" }, { run });
  writeFileSync(join(P.inflight()[0].wt, ".symbiot", "QUESTIONS.md"), "### To what?\n- Starter\n- Free\n");
  hook(0);
  ok("one that only asked counts as asking", P.besideAgain(repo, "p2").kind === "asked" && /### To what\?\n- Starter/.test(L("QUESTIONS.md")), P.besideAgain(repo, "p2"));
  // left waiting: the copy marked it [~] (Steve's chat fix, run in four copies on 24 Oct 2026)
  writeFileSync(join(repo, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Make chat read-only\n");
  P.startParallel("repo4", repo, { id: "p3", text: "Make chat read-only" }, { run });
  writeFileSync(join(P.inflight()[0].wt, ".symbiot", "TASKS.md"), "## Tasks\n- [~] (waits on the user: Symbiot couldn't confirm it's done after 2 tries: x) Make chat read-only\n");
  hook(0);
  const w = P.besideAgain(repo, "p3");
  ok("one it left waiting ([~]) is on record as waiting, so no fresh copy runs it when an answer comes in; the lane's brief carries the [~]", w && w.kind === "waited" && /^- \[~\] \(waits on the user.*Make chat read-only$/m.test(L("TASKS.md")), [w, L("TASKS.md")]);
  writeFileSync(join(repo, ".symbiot", "ANSWERS.md"), "# Answers\n\n### Something new\nyes\n");
  ok("…even after a new answer", P.besideAgain(repo, "p3") && P.besideAgain(repo, "p3").kind === "waited");
}

console.log("REPORTS IT ONLY CHECKED OUT — a lane that commits its .symbiot/ gets back only what the copy wrote (28 Oct 2026)");
{
  const repo = join(HOME, "repo-committed"); mkdirSync(join(repo, ".symbiot"), { recursive: true });
  sh(repo, "init", "-q", "-b", "main"); writeFileSync(join(repo, "a.mjs"), "a1\n");
  writeFileSync(join(repo, ".symbiot", "PHONE-TEST.md"), "# Phone test\n_(from a run beside repo-committed on \"earlier\")_\nYes.\n");
  writeFileSync(join(repo, ".symbiot", "PLAN.md"), "# Plan\nOld steps.\n");
  writeFileSync(join(repo, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Check the broker list\n");
  sh(repo, "add", "-A"); sh(repo, "commit", "-qm", "init");
  let hook; const run = (wt, o) => { hook = o.onExit; return { id: "r" }; };
  P.startParallel("repo-committed", repo, { id: "c1", text: "Check the broker list" }, { run });
  const wt = P.inflight().find((m) => m.repo === repo).wt;
  writeFileSync(join(wt, ".symbiot", "PLAN.md"), "# Plan\nNew steps.\n"); writeFileSync(join(wt, ".symbiot", "BROKERS.md"), "# Brokers\n856 loaded.\n");
  hook(0);
  const names = readdirSync(join(repo, ".symbiot"));
  ok("a report it only checked out doesn't come back as a run-id copy", !names.some((f) => /^PHONE-TEST-[0-9a-f]{6}\.md$/.test(f)) && /^# Phone test\n_\(from a run beside repo-committed on "earlier"\)_\nYes\.\n$/.test(readFileSync(join(repo, ".symbiot", "PHONE-TEST.md"), "utf8")), names);
  ok("one it rewrote replaces the lane's (untouched since), saying once which run wrote it; a new one lands", /^# Plan\n_\(from a run beside repo-committed/.test(readFileSync(join(repo, ".symbiot", "PLAN.md"), "utf8")) && /New steps/.test(readFileSync(join(repo, ".symbiot", "PLAN.md"), "utf8")) && !names.some((f) => /^PLAN-/.test(f)) && names.includes("BROKERS.md"), names);
}

console.log("RESTARTS — a tick alone isn't success, and a running lane's brief isn't rewritten");
{
  const repo = join(HOME, "repo5"); mkdirSync(repo, { recursive: true });
  sh(repo, "init", "-q", "-b", "main"); writeFileSync(join(repo, "a.mjs"), "a1\n"); sh(repo, "add", "-A"); sh(repo, "commit", "-qm", "init");
  mkdirSync(join(repo, ".symbiot"), { recursive: true }); writeFileSync(join(repo, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Change a.mjs\n");
  const run = () => ({ id: "r" });
  P.startParallel("repo5", repo, { id: "k1", text: "Change a.mjs" }, { run });
  const wt = P.inflight()[0].wt;
  writeFileSync(join(wt, "a.mjs"), "half\n"); writeFileSync(join(wt, ".symbiot", "TASKS.md"), "## Tasks\n- [x] Change a.mjs\n");
  writeFileSync(join(wt, ".symbiot", "agent.log"), '{"type":"system","subtype":"init"}\n{"type":"assistant"}\n=== stopped by Symbiot 2026-10-15T08:00:00Z: no output for 45 minutes, so it was taken for hung ===\n');
  ok("the log says how it ended: stopped by the hang guard", P.exitOf(wt) === 1);
  const done = P.mergeEnded({ running: () => null, sweeping: false });
  ok("ended while Symbiot was down, ticked but killed: not merged, its changes kept as a patch, the task open", done.length === 1 && !done[0].merged && done[0].saved && readFileSync(join(repo, "a.mjs"), "utf8") === "a1\n" && /- \[ \] Change a\.mjs/.test(readFileSync(join(repo, ".symbiot", "TASKS.md"), "utf8")), done);
  const logs = (t) => { mkdirSync(join(repo, "x", ".symbiot"), { recursive: true }); writeFileSync(join(repo, "x", ".symbiot", "agent.log"), t); return P.exitOf(join(repo, "x")); };
  ok("a result event says 0 or 1; a stream cut off is 1; no stream says nothing", logs('{"type":"result","is_error":false}\n') === 0 && logs('{"type":"result","is_error":true}\n') === 1 && logs('{"type":"assistant"}\n') === 1 && logs("plain text\n") === null && logs('{"type":"result"}\n=== stopped by Symbiot x ===\n') === 1);
  // the lane's own agent is running: the tick goes into the held brief, never into the TASKS.md it works from
  const running = () => ({ pid: 1 });
  writeFileSync(join(repo, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Other work\n");
  ok("nothing held: TASKS.md is left alone", P.tickInMain(repo, ["Change a.mjs"], { running }) === false && readFileSync(join(repo, ".symbiot", "TASKS.md"), "utf8") === "## Tasks\n- [ ] Other work\n");
  writeFileSync(join(repo, ".symbiot", "TASKS.next.md"), "## Tasks\n- [ ] Change a.mjs\n- [ ] Other work\n");
  ok("a held brief: the tick lands there, for agents.mjs releaseHeldTasks to swap in", P.tickInMain(repo, ["Change a.mjs"], { running }) === true && /- \[x\] Change a\.mjs/.test(readFileSync(join(repo, ".symbiot", "TASKS.next.md"), "utf8")) && !/\[x\]/.test(readFileSync(join(repo, ".symbiot", "TASKS.md"), "utf8")));
}

console.log("CLEANUP — nothing runs on from a deleted copy, and what piles up is pruned");
{
  const wt = join(HOME, "wt-x"), proc = join(HOME, "proc"); mkdirSync(join(wt, "sub"), { recursive: true });
  for (const [pid, cwd, argv] of [[11, join(wt, "sub"), "node\0app.mjs"], [12, HOME, `node\0${join(wt, "index.mjs")}\0app`], [13, HOME, "node\0other.mjs"], [14, join(HOME, "wt-xy"), "sh"]]) { mkdirSync(join(proc, String(pid)), { recursive: true }); spawnSync("ln", ["-s", cwd, join(proc, String(pid), "cwd")]); writeFileSync(join(proc, String(pid), "cmdline"), argv); }
  const told = []; const got = P.killUnder(wt, { kill: (p, s) => told.push(p + ":" + s), proc, later: false });
  ok("every process with its folder or its command under the copy is told to stop; others, and a folder with a longer name, aren't", got.sort().join() === "11,12" && told.join() === "11:SIGTERM,12:SIGTERM", [got, told]);
  // patches: handled or a week old go; one an open task names stays
  const repo = join(HOME, "repo6", ".symbiot"); mkdirSync(repo, { recursive: true });
  const NOW = Date.now(), old = (f, ms) => { const t = new Date(NOW - ms); spawnSync("touch", ["-d", t.toISOString(), f]); };
  for (const f of ["parallel-aaa111.patch", "parallel-bbb222.patch", "parallel-ccc333.patch", "parallel-ddd444.patch"]) writeFileSync(join(repo, f), "x");
  old(join(repo, "parallel-aaa111.patch"), 8 * 86400000); old(join(repo, "parallel-bbb222.patch"), 2 * 3600000); old(join(repo, "parallel-ccc333.patch"), 2 * 3600000);
  writeFileSync(join(repo, "beside.json"), JSON.stringify({ o: { tries: 1, at: NOW - 8 * 86400000 }, n: { conflict: true, at: NOW } }));
  const gone = P.prunePatches(join(HOME, "repo6"), NOW, { tasks: [{ id: "1", text: "Merge … saved as .symbiot/parallel-ccc333.patch", repo: "r" }, { id: "2", text: "x", patch: ".symbiot/parallel-aaa111.patch", done: true }] });
  ok("a week-old patch goes even when named; one no open task names goes after an hour; a named one and a fresh one stay", gone.sort().join() === "parallel-aaa111.patch,parallel-bbb222.patch" && existsSync(join(repo, "parallel-ccc333.patch")) && existsSync(join(repo, "parallel-ddd444.patch")), gone);
  ok("…and week-old beside.json records with them", Object.keys(JSON.parse(readFileSync(join(repo, "beside.json"), "utf8"))).join() === "n");
  // orphan worktree folders: no par.json and not a worktree, older than an hour
  const dir = join(HOME, "wts"); mkdirSync(join(dir, "lane-aaaaaa", ".symbiot"), { recursive: true }); mkdirSync(join(dir, "lane-bbbbbb", ".symbiot"), { recursive: true }); mkdirSync(join(dir, "lane-cccccc", ".symbiot"), { recursive: true });
  writeFileSync(join(dir, "lane-cccccc", ".symbiot", "par.json"), JSON.stringify({ id: "cccccc" }));
  old(join(dir, "lane-aaaaaa"), 2 * 3600000); old(join(dir, "lane-cccccc"), 2 * 3600000);
  const orphans = P.pruneOrphans(NOW, dir);
  ok("an old folder with no par.json goes; a fresh one and a copy still in flight stay", orphans.length === 1 && /lane-aaaaaa$/.test(orphans[0]) && existsSync(join(dir, "lane-bbbbbb")) && existsSync(join(dir, "lane-cccccc")), orphans);
}

console.log("THE TICK — two independent tasks queued at one lane both run at once");
{
  const NOW = 1e13, old = NOW - 120000, map = { symbiot: "/s" };
  const T = [{ id: "1", text: "Fix the phone pairing in phone.mjs", repo: "symbiot", ts: old }, { id: "2", text: "Add a Skip button in ui.mjs", repo: "symbiot", ts: old }, { id: "3", text: "Tidy tray.mjs", repo: "symbiot", ts: old }];
  const base = { repos: () => map, name: (p, n) => n, pending: () => [], parked: () => [], cmd: () => "claude -p {prompt}", now: NOW, tasks: () => T, save: () => {}, config: () => ({}),
    facts: () => ({ git: true, dirty: [] }), licence: () => PRO, cap: () => 3, parallel: () => [], beside: () => new Set(), openTasks: () => [], brief: () => ({ at: 0, tasks: [] }), lastRun: () => 0 };
  // lane idle: the first is the lane's run; the independent two go beside it, at the same time
  const pushed = [], ran = [], beside = [];
  const r = workTick({ deps: { ...base, agents: () => [], fails: {}, push: (f) => (pushed.push(f), { written: [{ name: f.repo, path: "/s" }] }), run: (p) => (ran.push(p), { id: "j" }), startParallel: (lane, path, it) => (beside.push(it.id), { ok: true }) } });
  ok("one run for the lane's brief, and the other two started beside it in the same tick", ran.join() === "/s" && beside.sort().join() === "2,3" && pushed[0].exclude.sort().join() === "2,3" && r.beside.length === 2, [ran, beside, pushed]);
  // lane busy: two queued ones that don't clash start beside the running agent
  const busy = { ...base, agents: () => [{ name: "symbiot", path: "/s", status: "running", work: { doing: "Working", todos: [] }, ask: { questions: [] } }], openTasks: () => ["Fix the reader in core.mjs"] };
  const beside2 = [], pushed2 = [];
  const r2 = workTick({ deps: { ...busy, fails: {}, push: (f) => (pushed2.push(f), { empty: true }), run: () => { throw new Error("no second run in the lane's folder"); }, startParallel: (lane, path, it) => (beside2.push(it.id), { ok: true }) } });
  ok("queued behind a run: two start beside it (the cap of 3 counts the run itself), none in its folder; the third waits for a slot", beside2.sort().join() === "1,2" && r2.started.length === 0 && r2.beside.length === 2, [beside2, r2]);
  // a clash with what's running: held, and the card says what for
  const clashing = { ...busy, openTasks: () => ["Rework phone.mjs pairing"] };
  const sc = workScene({ deps: { ...clashing, fails: {} } }), why = (id) => sc.waiting.find((w) => w.id === "task:" + id).why;
  // an Approve putting a lane's work in: the project says so, and it isn't "ready for your OK" (symbiot, 19 Oct 2026)
  const shipSc = workScene({ deps: { ...clashing, fails: {}, pending: () => [{ repo: "symbiot", path: "/s", tasks: [{}, {}], files: [], shipping: { step: "running its tests", since: 1 } }] } }), shipP = shipSc.projects.find((p) => p.repo === "symbiot");
  ok("an Approve under way: the project says what it's on, and nothing waits on your OK", !shipSc.ready.length && shipP && shipP.shipping === "running its tests" && !shipP.ready, { ready: shipSc.ready, shipP });
  ok("a clash: queued, naming what it waits on and the run", why("1").kind === "queued" && /both need phone\.mjs, and "Rework phone\.mjs pairing" has it now/.test(why("1").text) && /Queued behind symbiot's run: working/.test(why("1").text), why("1"));
  ok("…while the independent ones are next, beside the run", why("2").kind === "beside" && why("3").kind === "beside", [why("2"), why("3")]);
  const full = workScene({ deps: { ...clashing, parallel: () => [{ lane: "symbiot", task: "Fix core.mjs", taskId: "9" }, { lane: "symbiot", task: "Fix route.mjs", taskId: "8" }], fails: {} } });
  ok("with two already beside the run, the next waits for a slot and says so", full.waiting.find((w) => w.id === "task:3").why.waitKind === "cap", full.waiting.find((w) => w.id === "task:3").why);
  // the cap
  const capped = { ...busy, cap: () => 1 };
  const sc2 = workScene({ deps: { ...capped, fails: {} } });
  ok("at the cap: every queued one says the limit and where to change it", sc2.waiting.every((w) => w.why.kind === "queued" && /the limit \(change it in Settings\)/.test(w.why.text)), sc2.waiting.map((w) => w.why.text));
  // Free
  const sc3 = workScene({ deps: { ...busy, licence: () => ({ plan: "free" }), fails: {} } });
  ok("Symbiot Free runs one at a time, and says so", sc3.waiting.every((w) => /Symbiot Free runs one agent at a time/.test(w.why.text)), sc3.waiting.map((w) => w.why.text));
  // one already running beside: that task is "working", not queued
  const sc4 = workScene({ deps: { ...busy, beside: () => new Set(["2"]), fails: {} } });
  ok("a task running in its own copy shows as working", sc4.waiting.find((w) => w.id === "task:2").why.kind === "working");
  // a run beside already stopped on task 2, nothing changed since: it waits for the lane's own run, saying why
  const tried = (p, id) => (id === "2" ? { tries: 2, note: "a run beside it stopped without finishing this (2 tries), and nothing it ran with has changed since" } : null);
  const sc5 = workScene({ deps: { ...busy, besideAgain: tried, fails: {} } }), w2 = sc5.waiting.find((w) => w.id === "task:2").why;
  ok("a task a run beside already stopped on isn't started beside again: queued for the lane's own run, saying why", w2.kind === "queued" && w2.waitKind === "tried" && /stopped without finishing this \(2 tries\).*own agent takes it next/.test(w2.text) && sc5.waiting.find((w) => w.id === "task:3").why.kind === "beside", w2);
  const beside6 = [], pushed6 = [];
  workTick({ deps: { ...base, besideAgain: tried, agents: () => [], fails: {}, push: (x) => (pushed6.push(x), { written: [{ name: x.repo, path: "/s" }] }), run: () => ({ id: "j" }), startParallel: (lane, path, it) => (beside6.push(it.id), { ok: true }) } });
  ok("…and with the lane idle, it goes in the lane's own brief, not beside it", beside6.join() === "3" && pushed6[0].exclude.join() === "3", [beside6, pushed6]);
}

console.log("A COPY REMOVED UNDER ITS RUN — nothing is removed while a run uses it; a copy that is gone puts its task back, once, and asks nobody");
{
  const repo = join(HOME, "repo7"); mkdirSync(repo, { recursive: true });
  sh(repo, "init", "-q", "-b", "main"); writeFileSync(join(repo, "a.mjs"), "a1\n"); sh(repo, "add", "-A"); sh(repo, "commit", "-qm", "init");
  mkdirSync(join(repo, ".symbiot"), { recursive: true });
  const rec = () => JSON.parse(readFileSync(join(repo, ".symbiot", "beside.json"), "utf8"));
  const run = () => ({ id: "r" });
  const start = (id) => P.startParallel("repo7", repo, { id, text: "Rework a.mjs " + id }, { run });
  // 1) a run on the copy (its lock), or one about to start again: mergeEnded leaves the copy alone
  start("u1"); const wtA = P.inflight().find((m) => m.taskId === "u1").wt;
  writeFileSync(join(wtA, "a.mjs"), "beside\n"); writeFileSync(join(wtA, ".symbiot", "TASKS.md"), "## Tasks\n- [x] Rework a.mjs u1\n");
  const seen = [], merge = (m, o) => (seen.push(m.wt), { merged: false });
  P.mergeEnded({ merge, running: (p) => p === wtA, sweeping: false });
  ok("a copy a run is on isn't merged or removed", seen.length === 0 && existsSync(wtA), seen);
  ok("…mergeBack itself refuses too, and says busy", P.mergeBack(P.inflight().find((m) => m.taskId === "u1"), { running: (p) => p === wtA }).busy === true && existsSync(wtA));
  P.mergeEnded({ merge, running: () => false, sweeping: false });
  ok("a copy nothing is on is merged", seen.join() === wtA);
  // 2) the copy is gone while its run was using it: the task goes back, once
  start("u2"); const mB = P.inflight().find((m) => m.taskId === "u2");
  ok("started: on record as on it now", P.besideAgain(repo, "u2").kind === "working");
  rmSync(mB.wt, { recursive: true, force: true });
  const gone1 = P.mergeBack(mB, { ended: true }), gone2 = P.mergeBack(mB, { ended: true });
  ok("gone: requeued the first time, nothing to do the second", gone1.requeued === true && gone2.requeued === false, [gone1, gone2]);
  ok("…its record is forgotten, so it starts again in a fresh copy", P.besideAgain(repo, "u2") === null && !rec().u2);
  ok("the lane named by the removed copy's folder is still the lane", P.parallelLane(mB.wt) === "repo7");
  // 3) a task that finished, clashed or was handed on meanwhile keeps its word
  start("u3"); const mC = P.inflight().find((m) => m.taskId === "u3");
  P.noteTried(repo, "u3", "", { how: "merged" }); rmSync(mC.wt, { recursive: true, force: true });
  ok("a task already merged isn't put back", P.mergeBack(mC, { ended: true }).requeued === false && P.besideAgain(repo, "u3").kind === "merged");
  // 4) removed before it began: no record in this copy, nothing is requeued twice
  ok("a copy that was never recorded requeues nothing", P.requeueGone(repo, { taskId: "nope", wt: "/x", branch: "b" }) === false);
}

rmSync(HOME, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
