// Lanes (lanes.mjs, handover.mjs): an agent hands another lane's job over, that
// lane's agent does it, and the result goes back to the one that asked, which
// carries on. No user in the loop. Isolated HOME (set before the modules load);
// the agents are stand-ins.
//
//   node test/lanes.mjs
//
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-lanes-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { lanesTick, loadLedger, lanesState, MAX_CHAIN, aboutIt, partlyDone, remoteKey, orcaMoves, orcaRelink, stuckHandovers, allowHandover, skipHandover, namedDirs } = await import("../lanes.mjs");
const { parseHandoffs, handoverRules, ONLY_YOU, leftToYou } = await import("../handover.mjs");
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
const calls = { act: [], run: [], add: [], push: [], relink: 0 };
let busy = new Set(), runResult = () => ({ id: "j" + calls.run.length });
const opsDir = join(CFG, "drafts", "act-0001");
const deps = (extra = {}) => ({ map, now: Date.now(), tasks: extra.tasks || [], relink: async () => { calls.relink++; return { moves: [] }; },
  act: (text, o) => { calls.act.push({ text, o }); mkdirSync(join(opsDir, ".symbiot"), { recursive: true }); return { ok: true, job: "ops1", dir: opsDir }; },
  run: (p, o) => { calls.run.push({ p, o }); return runResult(p); },
  running: (p) => busy.has(p),
  add: (text, repo, o = {}) => { calls.add.push({ text, repo, after: o.after }); return { id: "task" + calls.add.length }; },
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
  ok("…and once it's back, Orca is checked for a lane folder the handover renamed", calls.relink === 1, calls.relink);

  console.log("ORCA — a lane's folder renamed by a handover is added again where it is now");
  const dailify = join(HOME, "dailify"), other = join(HOME, "proj", "other"), gone = join(HOME, "CallForge AI");
  mkdirSync(dailify, { recursive: true }); mkdirSync(other, { recursive: true });
  const orcaList = { ok: true, result: { repos: [
    { path: gone, displayName: "dailify", gitRemoteIdentity: { canonicalKey: "github.com/GarthGhostai/dailify" } },
    { path: coral, displayName: "coral" },
    { path: join(HOME, "old", "nowhere"), displayName: "nowhere" } ] } };
  const remotes = { [dailify]: "git@github.com:GarthGhostai/Dailify.git", [other]: "https://github.com/GarthGhostai/other.git" };
  const orcaCalls = [];
  const fakeOrca = async (cli, args) => { orcaCalls.push(args); return args[1] === "list" ? JSON.stringify(orcaList) : '{"id":"x","ok":true,"result":{}}'; };
  const omap = { dailify, other, coral };
  ok("remotes compare however they're written", remoteKey("git@github.com:GarthGhostai/Dailify.git") === "github.com/garthghostai/dailify" && remoteKey("https://user@github.com/GarthGhostai/dailify.git/") === "github.com/garthghostai/dailify" && remoteKey("github.com/GarthGhostai/dailify") === "github.com/garthghostai/dailify", "");
  const rl = await orcaRelink({ map: omap, cli: "/x/orca-ide", orca: fakeOrca, remoteOf: async (p) => remotes[p] || "" });
  ok("the gone path's repo is found by its GitHub remote, and added again in Orca", rl.moves.length === 1 && rl.moves[0].from === gone && rl.moves[0].to === dailify && rl.moves[0].ok && orcaCalls.some((a) => a.join(" ") === `repo add --path ${dailify} --json`), rl.moves);
  ok("…a folder that still exists, or one with nowhere to go, is left alone", orcaCalls.filter((a) => a[1] === "add").length === 1, orcaCalls);
  const byName = await orcaMoves([{ path: join(HOME, "Old Name"), displayName: "other" }], omap, { remoteOf: async () => "" });
  ok("…with no remote kept, by its name", byName.length === 1 && byName[0].to === other, byName);
  const twins = await orcaMoves([{ path: gone, displayName: "dailify", gitRemoteIdentity: { canonicalKey: "github.com/x/y" } }], omap, { remoteOf: async () => "github.com/x/y" });
  ok("…never a guess: two matches move nothing", twins.length === 0, twins);
  ok("no Orca here: nothing happens", (await orcaRelink({ map: omap, cli: "", orca: fakeOrca })).moves.length === 0, "");
  ok("Orca not running (its CLI says nothing): nothing happens", (await orcaRelink({ map: omap, cli: "/x/orca-ide", orca: async () => "" })).moves.length === 0, "");

  console.log("A STEP OF THE USER'S — a result coming back doesn't start a run they said to hold");
  // coral's run asked for a key in .env, and the user said "don't start another run until it's in"
  put(coral, "waiting.json", JSON.stringify({ step: "put the key in `.env`", files: [{ name: ".env", path: join(coral, ".env"), sig: "none" }], at: Date.now() }));
  put(coral, "HANDOFF.md", "### ops\nFind the WABA id in the Meta dashboard export.\n"); ran(opsDir, Date.now() - 60000, "the JDK run, long done");
  lanesTick(deps());
  const hw = loadLedger().handoffs.find((h) => /WABA/.test(h.text));
  ran(opsDir, hw.at + 1000, "Found it in the export."); put(opsDir, "TASKS.md", "- [x] Find the WABA id\n");
  const runsW = calls.run.length, tw = lanesTick(deps());
  ok("the result is reported, but coral's run isn't forced past the user's step (it starts once .env changes)", tw.reported.length === 1 && calls.run.length === runsW + 1 && calls.run.slice(-1)[0].o.force === false && /Found it in the export/.test(read(coral, "ANSWERS.md")), [tw.reported.length, calls.run.slice(-1)]);
  rmSync(join(coral, ".symbiot", "waiting.json"));

  console.log("TO ANOTHER REPO — coral hands GhostAIChat its part");
  put(coral, "HANDOFF.md", "### GhostAIChat\nBuild the debug APK with the JDK at ~/.gradle/jdks/eclipse_adoptium-17.\n");
  runResult = () => ({ busy: true });
  const t3 = lanesTick(deps());
  const h3 = loadLedger().handoffs.find((h) => h.to.lane === "GhostAIChat");
  ok("it joins GhostAIChat's tasks, marked who it's from, and goes out like Send to repos", calls.add.slice(-1)[0].repo === "GhostAIChat" && /\(handed over by coral\)/.test(calls.add.slice(-1)[0].after) && calls.push.slice(-1)[0].repo === "GhostAIChat" && t3.started.length === 1, calls.add.slice(-1));
  ok("that lane busy: queued, and not counted done when the busy run ends", h3.status === "held" && (ran(ghost, h3.at - 5000, "an earlier run"), lanesTick(deps()).reported.length === 0), h3.status);
  ran(ghost, h3.at + 2000, "Built android/app/build/outputs/apk/debug/app-debug.apk.");
  const t4 = lanesTick(deps({ tasks: [{ id: h3.task, review: true }] }));
  ok("its run done and the task ticked: coral hears it's done and waits for review", t4.reported.length === 1 && /Done in GhostAIChat: the task is ticked/.test(read(coral, "ANSWERS.md")) && /app-debug\.apk/.test(read(coral, "ANSWERS.md")), read(coral, "ANSWERS.md").slice(-300));
  runResult = () => ({ id: "j" });

  console.log("LONG HANDOVERS — nothing cut: an email to draft arrives whole");
  const email = "Draft the email below to Jono, then stop.\n\n" + Array.from({ length: 60 }, (_, i) => `${i + 1}. A shared secret, line ${i + 1}: we'll both use it to sign and verify each request.`).join("\n") + "\n\nGarth";
  put(coral, "HANDOFF.md", "### ops\n" + email + "\n### GhostAIChat\n" + email + "\n");
  lanesTick(deps());
  ok("to ops, every line of it", calls.act.slice(-1)[0].text === email, calls.act.slice(-1)[0].text.length);
  ok("to a repo, all of it goes to its task (a long one links to the rest there)", calls.add.slice(-1)[0].text === email && calls.add.slice(-1)[0].after === "(handed over by coral)", calls.add.slice(-1)[0].text.length);
  const eb = actBrief(email, { lanes: [] });
  ok("the ops brief quotes it line by line, sign-off and all; its task line ends at a word", eb.includes("> 60. A shared secret, line 60: we'll both") && /\n>\n> Garth\n/.test(eb) && /- \[ \] Draft the email below to Jono, then stop\. 1\. A shared .*\S…\n/.test(eb), eb.slice(0, 300));
  const ls = lanesState().handoffs.find((h) => h.to === "GhostAIChat" && h.full);
  ok("the Agents tab gets its first line, and all of it to open", ls && ls.text === "Draft the email below to Jono, then stop." && ls.full === email, ls && ls.text);

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

  console.log("ONE ROW FOR WHAT READS THE SAME — a run that handed it over twice");
  const L2 = JSON.parse(readFileSync(join(CFG, "lanes.json"), "utf8")), run2 = { lane: "ops", path: join(CFG, "drafts", "act-1d727d7f") }, sym = { lane: "symbiot", path: "/s" };
  L2.handoffs.push({ id: "d1", key: "d1", from: run2, to: sym, text: "Three gaps found while turning the company folder into memory.\n1. one", at: Date.now() - 2000, chain: 1, status: "done" },
    { id: "d2", key: "d2", from: run2, to: sym, text: "Three gaps found while turning the company folder into memory.\n1. one, in other words", at: Date.now() - 1000, chain: 1, status: "started" },
    { id: "d3", key: "d3", from: run2, to: { lane: "coral", path: coral }, text: "Three gaps found while turning the company folder into memory.", at: Date.now(), chain: 1, status: "done" });
  writeFileSync(join(CFG, "lanes.json"), JSON.stringify(L2));
  const rows = lanesState().handoffs.filter((h) => /^Three gaps/.test(h.text));
  ok("the same first line from one lane to the same lane: one row, the newest, said twice", rows.length === 2 && rows.find((h) => h.to === "symbiot").id === "d2" && rows.find((h) => h.to === "symbiot").times === 2, rows);
  ok("…the same words to another lane stay a row of their own", rows.find((h) => h.to === "coral").times === 1, rows);

  console.log("ABOUT THIS ONE — a repo run's last words cover its whole brief; only the part about the handover goes back");
  const said = "I finished 7 of the 8 items.\n- **Home:** a needs-you band at the top, with blobs.\n- **Posts:** hidden on the Dashboard until it can draft.\n- **Company folder checks:** checks.mjs flags commitments on leave days, scored against the company audit.";
  ok("the lines sharing the handover's words, not the rest", aboutIt(said, "Cross-file checks for the company folder: score them against the company audit") === "- **Company folder checks:** checks.mjs flags commitments on leave days, scored against the company audit.", aboutIt(said, "Cross-file checks for the company folder: score them against the company audit"));
  ok("nothing about it: nothing", aboutIt(said, "Four gaps found while turning the user's knowledge into memory, reports wanted") === "", aboutIt(said, "Four gaps found while turning the user's knowledge into memory, reports wanted"));
  put(ghost, "HANDOFF.md", "### coral\nBuild the release APK and sign it with the new key.\n");
  const L3 = JSON.parse(readFileSync(join(CFG, "lanes.json"), "utf8"));
  L3.handoffs.push({ id: "w", key: "w", from: { lane: "GhostAIChat", path: ghost }, to: { lane: "ops", path: opsDir }, text: "Move the folder `CallForge AI` to `dailify`.\nWhy: the rename.", at: Date.now(), chain: 1, status: "started" });
  writeFileSync(join(CFG, "lanes.json"), JSON.stringify(L3));
  put(ghost, "QUESTIONS.md", "## Questions\n### Rename the folder?\nwhy\n- yes (recommended)\n- no\n### Which key?\nwhy\n- the new one (recommended)\n- the old one\n");
  const pd = partlyDone(ghost);
  ok("partly done: its open questions and the handover not back yet, in its own words", pd && pd.questions === 2 && pd.handed.length === 2 && pd.handed[0].lane === "ops" && /^Move the folder/.test(pd.handed[0].text) && /release APK/.test(pd.handed[1].text), pd);
  put(ghost, "QUESTIONS.md", ""); put(ghost, "HANDOFF.md", "");
  L3.handoffs.find((h) => h.id === "w").reportedAt = Date.now(); writeFileSync(join(CFG, "lanes.json"), JSON.stringify(L3));
  ok("nothing open and the handover back: not partly done", partlyDone(ghost) === null, partlyDone(ghost));

  console.log("STUCK, ON HOME — an ops run limited to its folder needs ~/Company; it handed that to ops, its own lane");
  const co = join(HOME, "Company"); mkdirSync(join(co, "hr", "templates"), { recursive: true }); writeFileSync(join(co, "hr", "templates", "leave-register.csv"), "name,from,to\n");
  const opsA = join(CFG, "drafts", "act-4e9461d3"); mkdirSync(join(opsA, ".symbiot"), { recursive: true });
  put(opsA, "TASKS.md", "- [ ] Move ~/Company's registers out of templates/\n");
  put(opsA, "HANDOFF.md", `### ops\nNeeds a run that can read, edit and \`git mv\` in \`${co}\` (like ops run \`act-1d727d7f\`).\nMove \`${join(co, "hr", "templates", "leave-register.csv")}\` up a level, and fix every link to it.\n`);
  lanesTick(deps());
  const err = loadLedger().handoffs.find((h) => h.from.path === opsA);
  ok("it errors, as before: ops is its own lane", err && err.status === "error" && /ops is your own lane/.test(err.error), err);
  const st = stuckHandovers().find((x) => x.id === err.id);
  ok("…and now waits on you: \"Allow this run access to ~/Company?\", Allow or Skip", st && st.q === "Allow this run access to ~/Company?" && st.options.join() === "Allow (recommended),Skip" && st.dirs.join() === co, st);
  ok("the folders it names: ~/Company once (a file in it counts as it), never Symbiot's, a hidden one or your home", namedDirs(`in ${co} and ${join(co, "hr")} and ~/.ssh and ${HOME} and ${CFG}`).join() === co, namedDirs(`in ${co} and ${join(co, "hr")} and ~/.ssh and ${HOME} and ${CFG}`));
  const ops2 = join(CFG, "drafts", "act-allowed"), acted = [];
  const al = allowHandover(err.id, { note: "only the csvs", act: (text, o) => { acted.push({ text, o }); mkdirSync(join(ops2, ".symbiot"), { recursive: true }); o.run(ops2, { force: true }); return { ok: true, job: "j-allow", dir: ops2 }; }, run: () => ({ id: "j-allow" }) });
  const grant = JSON.parse(readFileSync(join(ops2, ".claude", "settings.local.json"), "utf8")).permissions;
  ok("Allow: a run of its own on it, with what you said, told it may work in ~/Company", al.ok && acted.length === 1 && /git mv/.test(acted[0].text) && /The user said: only the csvs/.test(acted[0].text) && acted[0].o.context.includes(co), [al, acted[0] && acted[0].o.context]);
  ok("…that run only is allowed to read, edit and move files there", grant.additionalDirectories.includes(co) && grant.allow.includes(`Edit(/${co}/**)`) && grant.allow.includes("Bash(git mv:*)") && !grant.allow.some((r) => /^Bash\((bash|sudo|rm)/.test(r)), grant);
  const now2 = loadLedger().handoffs.find((h) => h.id === err.id);
  ok("…the handover is started, there, and no longer waits on you", now2.status === "started" && now2.to.path === ops2 && !now2.reportedAt && !stuckHandovers().some((x) => x.id === err.id), now2);
  ok("…a second Allow does nothing", !!allowHandover(err.id, { act: () => { throw new Error("ran again"); } }).error, "");
  put(ops2, "TASKS.md", "- [x] Move the registers\n"); ran(ops2, Date.now() + 5, "All 39 registers moved.");
  lanesTick(deps({ tasks: [] }));
  ok("…and when it's done, the run that asked hears it, like any handover", /Handed over to ops: Needs a run that can read[\s\S]*Done \(the ops agent\)[\s\S]*All 39 registers moved/.test(read(opsA, "ANSWERS.md")), read(opsA, "ANSWERS.md").slice(-300));
  const nowhere = loadLedger().handoffs.find((h) => h.to.lane === "payroll");
  const sp = stuckHandovers().find((x) => x.id === nowhere.id);
  ok("a lane that doesn't exist: start it as a run of its own?", sp && /^coral's handover didn't start \(There's no lane called payroll\)\. Start it as a run of its own\?$/.test(sp.q) && sp.options[0] === "Start it (recommended)", sp);
  ok("Skip: it stops asking, and its agent reads that you skipped it", skipHandover(nowhere.id).ok && !stuckHandovers().some((x) => x.id === nowhere.id) && /Handed over to payroll: Run payroll\.\nThe user skipped it/.test(read(coral, "ANSWERS.md")), read(coral, "ANSWERS.md").slice(-200));
  const L4 = JSON.parse(readFileSync(join(CFG, "lanes.json"), "utf8")), t0 = Date.now() - 60000;
  L4.handoffs.push({ id: "e-old", key: "e-old", from: { lane: "coral", path: coral }, to: { lane: "ops", path: "" }, text: "Renew the SSL certificate for coral.example.com before it lapses.", at: Date.now() - 4 * 86400000, chain: 1, status: "error", error: "x" },
    { id: "e-done", key: "e-done", from: { lane: "coral", path: coral }, to: { lane: "coral", path: "" }, text: "Rotate the staging database password and update the vault entry.", at: t0, chain: 1, status: "error", error: "coral is your own lane: do it yourself." },
    { id: "e-later", key: "e-later", from: { lane: "coral", path: coral }, to: { lane: "ops", path: opsDir }, text: "Rotate the staging database password, then update the vault entry for it.", at: t0 + 1000, chain: 1, status: "done", reportedAt: t0 + 2000 });
  writeFileSync(join(CFG, "lanes.json"), JSON.stringify(L4));
  const ids = stuckHandovers().map((x) => x.id);
  ok("past it: one from days ago, and one done another way since", !ids.includes("e-old") && !ids.includes("e-done"), ids);

  console.log("WAITS ON YOU — a run that ended leaving you an OK to give, or a step only you can take");
  // the last words of real runs that ended "success" with it only said there, so nothing asked the user
  const jono = "Both parts are done and the task is ticked. The draft isn't sent.\n\n- **Jono's endpoint and secret:** neither is in your mail.\n- **Draft:** it's in Gmail, to jono@example.com, with the right subject.\n- **Cc:** empty, like you said. You'll add Alex yourself.\n\nGemini and Notion need authorizing in your claude.ai connector settings before an agent can use them.";
  const l1 = leftToYou(jono);
  ok("the email to Jono, drafted, not sent: your OK, which draft, and what to check first", l1 && l1.kind === "approve" && /^The draft isn't sent\. Draft: it's in Gmail, to jono@example\.com/.test(l1.what) && l1.check === "Cc: You'll add Alex yourself.", l1);
  const l2 = leftToYou("Nothing left to do here.\n\n- **Reply to Cale:** you picked sending it yourself. The draft is still in drafts, not sent. One catch: the link in it is wrapped in a google.com redirect. Fix that before you send.\n- **Jono:** left alone, you'll tell him.");
  ok("…the reply to Cale you said you'd send: named by its point, with the catch it found", l2 && l2.kind === "approve" && l2.label === "Reply to Cale" && /^Reply to Cale: you picked sending it yourself/.test(l2.what) && l2.check === "One catch: the link in it is wrapped in a google.com redirect. Fix that before you send.", l2);
  const l3 = leftToYou("The fixed URL still isn't live. Running tailscale needs sudo, and only you can do that.\n\nOpen a terminal, paste this, and type your password when it asks:\n\n```\nsudo tailscale up\n```\n\nThat gives the URL.");
  ok("…a sudo step: yours, with the command to run", l3 && l3.kind === "step" && /only you can do that/.test(l3.what) && /type your password when it asks: ``` sudo tailscale up ```/.test(l3.check), l3);
  const none = ["I sent the email to Cale (2:19pm, it's in Sent).", "Done. Nothing was sent, since you said you'll drag it into your chat yourself.", "The Gemini and Notion connectors need authorizing in your claude.ai connector settings before an agent can use them.", "**Forwarding code removal:** done in whatsapp_module and waiting for your review.", "All 39 registers moved.", ""];
  ok("…not what's done, a connector to sign in to (Home has those), or an Approve waiting in Tasks", none.every((t) => leftToYou(t) === null), none.map(leftToYou));
  const feat = "I finished 4 of the 5 open items.\n\n- **Marketing lane:** It's lit amber with a count when something needs you: its agent's questions (also shown as blobs under Needs you), its work waiting for your OK, and the week's drafts. Clicking it opens the Marketing page with those lit at the top.";
  ok("…nor a feature it describes (\"lit amber when something needs you: work waiting for your OK\")", leftToYou(feat) === null, leftToYou(feat));
  ok("…while a held draft still counts, with a \"when\" after it", (leftToYou("The draft isn't sent. Send it when you're happy with it.") || {}).kind === "approve", leftToYou("The draft isn't sent. Send it when you're happy with it."));
  ok("the brief: what waits on the user's OK goes in QUESTIONS.md with what to check first, never only in the last message", /Whatever waits on the user's OK \(sending, posting, deleting, paying, closing\)[^.]*goes in QUESTIONS\.md as a question, with what they should check first[^.]*never only in your last message/.test(ONLY_YOU), "");
  const { agentsList, settleNeeds, NEEDS_FOR } = await import("../agents.mjs");
  const streamed = (p, ts, result) => put(p, "agent.log", `\n=== x ${new Date(ts).toISOString()} ===\n$ claude -p …\n${JSON.stringify({ type: "result", subtype: "success", is_error: false, result })}\n`);
  const noted = (...rs) => { let had = []; try { had = JSON.parse(readFileSync(join(CFG, "runs.json"), "utf8")); } catch {} writeFileSync(join(CFG, "runs.json"), JSON.stringify([...rs, ...had])); };
  const actJ = join(CFG, "drafts", "act-jono"), tAgo = Date.now() - 3600000;
  put(actJ, "TASKS.md", "- [x] Draft an email to Jono, cc Alex, asking for the WA_FORWARD_URL endpoint and WA_FORWARD_SECRET\n"); streamed(actJ, tAgo, jono);
  noted({ path: actJ, name: "Agent: Draft an email to Jono", startedAt: tAgo });
  const needsOn = (p) => { const a = agentsList().find((x) => x.path === p); return a && a.needs; };
  const nj = needsOn(actJ);
  ok("a past run (before Symbiot last started) that left the draft for your OK is listed, needing you", nj && nj.kind === "approve" && /The draft isn't sent/.test(nj.what) && nj.check === "Cc: You'll add Alex yourself." && nj.key, nj);
  const actJ2 = join(CFG, "drafts", "act-jono2");
  put(actJ2, "TASKS.md", "- [x] Draft an email to Jono, cc Alex, asking for the WA_FORWARD_URL endpoint and WA_FORWARD_SECRET\n"); streamed(actJ2, Date.now(), "Sent it to Jono at 10:48.");
  noted({ path: actJ2, name: "Agent: Draft an email to Jono", startedAt: Date.now() + 1000 });
  ok("…not once a newer ops run took up the same task", !needsOn(actJ), needsOn(actJ));
  const actT = join(CFG, "drafts", "act-tail");
  put(actT, "TASKS.md", "- [ ] Give the WhatsApp module a fixed public URL\n"); streamed(actT, tAgo, "Running tailscale needs sudo, and only you can do that.\n\nPaste this: `sudo tailscale up`.");
  noted({ path: actT, name: "Agent: a fixed URL", startedAt: tAgo });
  const nt = needsOn(actT);
  ok("…a step only you can take, the same way", nt && nt.kind === "step", nt);
  settleNeeds(actT, nt.key);
  ok("…skipped (or gone ahead), it stops asking, until a newer run there says something else", !needsOn(actT), "");
  streamed(actT, Date.now(), "The draft to Cale isn't sent: it waits for your OK.");
  ok("…which it then does", needsOn(actT) && needsOn(actT).kind === "approve", needsOn(actT));
  const old = Date.now() - NEEDS_FOR - 60000; utimesSync(join(actT, ".symbiot", "agent.log"), old / 1000, old / 1000);
  ok("…and not days later", !needsOn(actT), "");

  // a new way of saying it: your AI reads each finished run's last words, once
  const { readLastWords, parseRead, READ_FILE } = await import("../agents.mjs");
  const actN = join(CFG, "drafts", "act-new"), lastSaid = "Everything's set up. The invoice to Acme is ready in Xero as a draft; give me the word and it goes out.";
  put(actN, "TASKS.md", "- [x] Make Acme's October invoice\n"); streamed(actN, Date.now(), lastSaid);
  noted({ path: actN, name: "Agent: Acme's invoice", startedAt: Date.now() - 60000 });
  ok("the patterns miss a new way of saying it (\"give me the word and it goes out\")", leftToYou(lastSaid) === null && !needsOn(actN), leftToYou(lastSaid));
  const aiAsked = [], aiReply = (o) => async (system, prompt) => { aiAsked.push(prompt); return typeof o === "string" ? o : JSON.stringify(o); };
  const aiYes = { needs: true, kind: "approve", what: "The invoice to Acme is ready in Xero as a draft; give me the word and it goes out.", check: "", label: "Acme invoice" };
  const rw1 = await readLastWords({ ask: aiReply(aiYes) });
  ok("your AI reads the last words of the finished runs the patterns didn't catch (Acme's, and \"Sent it to Jono\"), not the ones they did", rw1.read === 2 && aiAsked.some((p) => p.includes("give me the word")) && aiAsked.some((p) => p.includes("Sent it to Jono")) && !aiAsked.some((p) => /isn't sent/.test(p)), [rw1, aiAsked.map((p) => p.slice(0, 80))]);
  const nAi = needsOn(actN);
  ok("…what it found waits on you, on Home and on its block, like the ones the patterns catch", nAi && nAi.kind === "approve" && /give me the word/.test(nAi.what) && nAi.label === "Acme invoice" && nAi.read && nAi.key, nAi);
  const rw2 = await readLastWords({ ask: aiReply(aiYes) });
  ok("…once per run's words: the next pass doesn't ask again", rw2.read === 0 && aiAsked.length === 2, rw2);
  settleNeeds(actN, nAi.key);
  ok("…and Skip settles it, as for the others", !needsOn(actN), "");
  const actD = join(CFG, "drafts", "act-done"); put(actD, "TASKS.md", "- [x] Tidy the README\n"); streamed(actD, Date.now(), "Tidied the README: three sections merged, links checked.");
  noted({ path: actD, name: "Agent: README", startedAt: Date.now() - 60000 });
  await readLastWords({ ask: aiReply({ needs: false }) });
  const store = JSON.parse(readFileSync(READ_FILE, "utf8")), doneRead = Object.values(store).filter((x) => !x.what && !x.error).length;
  ok("…work that's done: nothing waits on you, and it's not asked about again", !needsOn(actD) && doneRead === 1 && (await readLastWords({ ask: aiReply({ needs: false }) })).read === 0, [doneRead, store]);
  const actE = join(CFG, "drafts", "act-err"); put(actE, "TASKS.md", "- [x] x\n"); streamed(actE, Date.now(), "Left a note for you somewhere.");
  noted({ path: actE, name: "Agent: x", startedAt: Date.now() - 60000 });
  const c0 = aiAsked.length; await readLastWords({ ask: aiReply("Couldn't reach the model: 529") });
  const c1 = aiAsked.length; await readLastWords({ ask: aiReply({ needs: false }) });
  ok("…a model that couldn't answer is tried again later, not every minute", c1 === c0 + 1 && aiAsked.length === c1 && !needsOn(actE), [c0, c1, aiAsked.length]);
  const rw3 = await readLastWords({ ask: async () => { throw new Error("no"); }, connected: () => false, list: [] });
  ok("…and with no runs to read, nothing is asked", rw3.read === 0, rw3);
  ok("its answer, read strictly: JSON only, a kind it knows, a what it says", parseRead('{"needs": true, "kind": "weird", "what": "Sign in to Meta and copy the token."}').kind === "step" && parseRead('```json\n{"needs": false}\n```').needs === false && parseRead("I think so") === null && parseRead('{"needs": true, "what": ""}').needs === false, "");
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} lanes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
