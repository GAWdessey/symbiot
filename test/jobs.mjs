// The job record (jobs.mjs): one row per job, states from the code that knows, and the
// lines the chat answers "where are we?" from. Isolated HOME.
//
//   node test/jobs.mjs
//
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-jobs-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const J = await import("../jobs.mjs");
const D = await import("../deploy.mjs");
const { saveTasks } = await import("../core.mjs");
const T0 = 1_800_000_000_000;

console.log("A JOB'S ROW");
ok("a row needs a state to start", J.track("run:x", { text: "x" }) === null && J.loadJobs().length === 0);
J.track("run:a1", { kind: "agent", lane: "ops", text: "Fix  the\nlogin", state: "running" }, { now: T0 });
ok("it starts running, text flattened", J.loadJobs()[0].state === "running" && J.loadJobs()[0].text === "Fix the login");
J.track("run:a1", { state: "review", waitingOn: "user", text: "other words" }, { now: T0 + 60e3 });
const a = J.loadJobs()[0];
ok("one row per key, first words kept, history kept", J.loadJobs().length === 1 && a.text === "Fix the login" && a.history[0].state === "running", a);
ok("waiting on the user", a.waitingOn === "user" && J.waitingOnUser().length === 1);
J.track("run:a1", { state: "nonsense" }, { now: T0 });
ok("an unknown state changes nothing", J.loadJobs()[0].state === "review");
J.track("run:a1", { state: "failed" }, { now: T0 + 120e3 });
ok("an ended job waits on nobody", J.loadJobs()[0].waitingOn === "" && J.waitingOnUser().length === 0);

console.log("MERGED IS NOT LIVE");
saveTasks([{ id: "t1", text: "fix it", repo: "web", pr: "https://github.com/o/web/pull/42", archived: true, done: true }]);
D.afterShip(null, "web", "https://github.com/o/web/pull/42", "approved", { ask: false, files: [] });
ok("an Approve that queued the merge says approved, not merged", J.loadJobs().find((j) => j.key === "pr:web#42")?.state === "approved");
D.afterShip(null, "web", "https://github.com/o/web/pull/42", "merged", { ask: false, files: [] });
ok("merged once it is", J.loadJobs().find((j) => j.key === "pr:web#42")?.state === "merged");
D.markLive("t1");
ok("live only when checked", J.loadJobs().find((j) => j.key === "pr:web#42")?.state === "live");

console.log("WHAT THE CHAT AND THE TERMINAL SAY");
J.track("task:e1", { kind: "email", text: "Email the partner", state: "sent" }, { now: T0 });
J.track("run:b2", { lane: "web", text: "Add a footer", state: "asked", waitingOn: "lane" }, { now: T0 + 3600e3 });
const lines = J.jobsLines({ now: T0 + 3700e3 }).join("\n");
ok("open jobs are listed with their state", /\[web\] Add a footer: asked, not started, waiting on lane/.test(lines), lines);
ok("a sent email waits on a third party", /Email the partner: sent, waiting on third party/.test(lines), lines);
ok("the chat is told to say 'no record', not infer", /say you have no record/.test(lines));
ok("an old ended job leaves the list after a day", !/Fix the login/.test(J.jobsLines({ now: T0 + 3 * 86400e3 }).join("\n")));
ok("the terminal prints the same rows", /Open:\n  \[web\] Add a footer/.test(J.jobsText({ now: T0 + 3700e3 })));
ok("an empty record says so", J.jobsText({ jobs: [] }) === "No jobs on record yet.");
ok("a failing save never throws", J.track("run:c", { state: "running" }, { now: "bad" }) !== undefined);

console.log("WAITING ON THE USER IS WHAT HOME SHOWS");
const T1 = T0 + 10 * 86400e3, LP = "/home/x/web";
J.track("run:r5", { kind: "agent", lane: "web", path: LP, text: "Footer", state: "running" }, { now: T1 });
J.track("run:r5", { state: "review", waitingOn: "user" }, { now: T1 + 1000 });
const approve = { kind: "approve", id: "approve:web", repo: "web", title: "Approve web", sub: "1 task done · only you decide" };
const ask = { kind: "ask", id: "ask:" + LP, path: LP, repo: "web", title: "web asks", sub: "Monthly or yearly?", q: "Monthly or yearly?" };
J.syncOnUser([approve, ask], { now: T1 + 2000 });
ok("each card is a job waiting on the user", J.onUser().length === 2 && J.onUser().every((y) => y.lane === "web"), J.onUser());
ok("…with what the phone and the orbs need", J.onUser().find((y) => y.id === ask.id)?.path === LP && J.onUser().find((y) => y.id === ask.id)?.title === "web asks");
ok("the chat's job list leaves the cards to 'Only the user can do'", !/Approve web/.test(J.jobsLines({ now: T1 + 3000 }).join("\n")));
ok("the terminal lists them first", /^Only you can do \(2\):\n  \[web\] Approve web/.test(J.jobsText({ now: T1 + 3000 })), J.jobsText({ now: T1 + 3000 }));
const writes = () => J.loadJobs().map((j) => j.changed).join();
const before = writes(); J.syncOnUser([approve, ask], { now: T1 + 4000 });
ok("the same cards again change nothing", writes() === before);
J.syncOnUser([ask], { now: T1 + 5000 });
ok("the Approve gone from Home: its card is done", !J.onUser().some((y) => y.id === "approve:web") && J.loadJobs().find((j) => j.key === "you:approve:web").state === "done");
ok("…and the run still waits while its lane has a card", J.loadJobs().find((j) => j.key === "run:r5").waitingOn === "user");
J.syncOnUser([], { now: T1 + 10000 });
ok("a run just finished isn't let go before its card can show (grace)", J.loadJobs().find((j) => j.key === "run:r5").state === "review");
J.syncOnUser([], { now: T1 + 200e3 });
const r5 = J.loadJobs().find((j) => j.key === "run:r5");
ok("no card for its lane after that: it waits on nobody, not 'waiting for Approve' forever", r5.state === "done" && r5.waitingOn === "" && /no Approve/.test(r5.note), r5);
ok("nothing is waiting on the user once Home shows nothing", J.waitingOnUser().length === 0 && J.onUser().length === 0, J.waitingOnUser());

console.log("APPROVE CLOSES THE RUN IT APPROVED");
J.track("run:r6", { kind: "agent", lane: "web", path: LP, text: "Header", state: "review", waitingOn: "user" }, { now: T1 });
D.afterShip(null, "web", "https://github.com/o/web/pull/43", "approved", { ask: false, files: [] });
const r6 = J.loadJobs().find((j) => j.key === "run:r6");
ok("the lane's run waiting for Approve is done, in that PR", r6.state === "done" && r6.waitingOn === "" && /PR #43/.test(r6.note), r6);
ok("…and the PR carries on from approved", J.loadJobs().find((j) => j.key === "pr:web#43")?.state === "approved");
J.syncOnUser([ask], { now: T1 + 3 * 86400e3 }); J.syncOnUser([], { now: T1 + 3 * 86400e3 + 1 });
J.syncOnUser([], { now: T1 + 5 * 86400e3 });
ok("a card that left Home days ago is dropped from the record", !J.loadJobs().some((j) => j.key === "you:approve:web"));

console.log("RUNNING OR QUEUED IS THE WORKDESK'S WORD");
const T2 = T1 + 20 * 86400e3, W = (id, kind, text = "") => ({ id: "task:" + id, text: "Task " + id, repo: "web", why: { kind, text } });
J.syncTasks([W("k1", "working"), W("k2", "queued", "Queued behind web's run: footer."), W("k3", "asks"), W("k4", "blocked", "Blocked: no coding agent is set")], { now: T2 });
const st = (id) => J.loadJobs().find((j) => j.key === "task:" + id);
ok("on it now is running; behind a run is queued, waiting on the lane", st("k1").state === "running" && st("k2").state === "queued" && st("k2").waitingOn === "lane", [st("k1"), st("k2")]);
ok("held on the user's card is queued, waiting on the user; blocked says why", st("k3").waitingOn === "user" && st("k4").state === "asked" && /no coding agent/.test(st("k4").note));
ok("the chat reads queued as queued, with why", /\[web\] Task k2: queued, not started yet, waiting on lane \(since just now\) — Queued behind/.test(J.jobsLines({ now: T2 + 1000 }).join("\n")), J.jobsLines({ now: T2 + 1000 }));
J.syncOnUser([], { now: T2 + 400e3 });
ok("the card sync leaves a task's wait to the task sync (no tug of war)", st("k3").waitingOn === "user");
const t2w = J.loadJobs().map((j) => j.changed).join(); J.syncTasks([W("k1", "working"), W("k2", "queued", "Queued behind web's run: header now."), W("k3", "asks"), W("k4", "blocked")], { now: T2 + 500e3 });
ok("the same states again write nothing, even with the run's line moved on", J.loadJobs().map((j) => j.changed).join() === t2w);
J.syncTasks([W("k2", "working")], { now: T2 + 600e3 });
ok("its turn came: queued → running, history kept", st("k2").state === "running" && st("k2").history.at(-1).state === "queued");
ok("a task off the list is done there", ["k1", "k3", "k4"].every((k) => st(k).state === "done"), ["k1", "k3", "k4"].map(st));
J.track("task:k2", { kind: "email", state: "sent" }, { now: T2 + 700e3 });
J.syncTasks([], { now: T2 + 800e3 });
ok("…but a task sent by email stays sent", st("k2").state === "sent");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
