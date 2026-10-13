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

const { dispatch, lanesTick, outcome, loadLedger, lanesState, MAX_CHAIN, aboutIt, partlyDone, remoteKey, orcaMoves, orcaRelink, stuckHandovers, allowHandover, skipHandover, namedDirs, handingOf } = await import("../lanes.mjs");
const { parseHandoffs, handoverRules, CLI_LOGIN, ONLY_YOU, leftToYou, gitWork, agentsGitWork, agentsClicking, agentsCodeWork, heldAsks, agentsPosting, linkedAsks, linkedChore } =await import("../handover.mjs");
const { buildTasksMd, mergeWhenGreen } = await import("../tasks.mjs");
{
  const fake = (buckets, mergeStatus = 0) => { const calls = []; const gh = (a) => { calls.push(a.slice(0, 2).join(" ")); return a[1] === "checks" ? { status: 0, stdout: JSON.stringify(buckets.map((bucket) => ({ bucket }))) } : { status: mergeStatus, stderr: "" }; }; return { gh, calls }; };
  const g = fake(["pass", "pass"]), f = fake(["pass", "fail"]), p = fake(["pass", "pending"]);
  const rg = mergeWhenGreen("/tmp", "7", g.gh), rf = mergeWhenGreen("/tmp", "7", f.gh), rp = mergeWhenGreen("/tmp", "7", p.gh);
  ok("merging from Symbiot: green checks merge past the self-review rule, so no second GitHub account is needed", rg.ok && g.calls.join() === "pr checks,pr merge", [rg, g.calls]);
  ok("…but a failing or running check never merges", rf.error && !f.calls.includes("pr merge") && rp.pending && !p.calls.includes("pr merge"), [rf, rp]);
}
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

  console.log("WHAT EACH LANE CAN REACH — ops handed dailify a live .env change it couldn't reach (13 Oct 2026)");
  {
    const { sshHosts, envProviders, laneReach, unreachable } = await import("../reach.mjs");
    const ssh = "Host sts-prod\n  HostName 41.76.1.2\n  User garth\nHost *\n  ServerAliveInterval 30\nHost gh github-work\n";
    ok("the servers this computer connects to come from its ssh config, wildcards left out", sshHosts(ssh).join() === "sts-prod,41.76.1.2,github-work", sshHosts(ssh));
    ok("…an alias too short to match safely is left out", !sshHosts(ssh).includes("gh"), sshHosts(ssh));
    const env = "# keys\nGOOGLE_CLIENT_SECRET=x\nexport TWILIO_AUTH_TOKEN=y\nNEXT_PUBLIC_STRIPE_KEY=z\nJWT_SECRET=a\nAPI_KEY=b\nPORT=3000\nMETA_APP_ID=1\n";
    ok("a lane's .env gives the providers it holds keys for, names only, no generic words", envProviders(env).join() === "GOOGLE,TWILIO,STRIPE", envProviders(env));
    const r = laneReach({ dailify: "/x/dailify", coral: "/x/coral" }, { sandboxed: true, ssh, read: (f) => (f === "/x/dailify/.env" ? env : "") });
    ok("laneReach: sandboxed, the hosts, and keys only for lanes that have some", r.sandboxed && r.hosts.includes("sts-prod") && r.keys.dailify.join() === "GOOGLE,TWILIO,STRIPE" && !r.keys.coral, r);
    const rules = handoverRules(["dailify", "coral"], "dailify", r).join("\n");
    ok("a repo's brief: ops reaches the servers, every repo lane reaches none, so a live server's .env is ops's", /`ops`: runs on this computer, outside any sandbox: the servers this computer connects to \(`sts-prod`/.test(rules) && /Every repo lane runs in a sandbox: it writes only in its own folder and reaches no server/.test(rules) && /its `\.env`, a restart, a deploy/.test(rules), rules);
    ok("…its own lane says it reaches no server, and a server job goes to ops, never back to a repo lane", /Your lane, `dailify`, reaches no server\. If you're handed a job on one, hand that part to `ops`, never back to a repo lane/.test(rules), rules);
    ok("…and which lane's .env holds which keys", /`dailify` \(GOOGLE, TWILIO, STRIPE\)/.test(rules) && !/`coral` \(/.test(rules), rules);
    const ops = actBrief("Change WHATSAPP_PROVIDER in the prod .env on sts-prod", { lanes: ["dailify"], reach: r });
    ok("the ops brief says it too, so ops doesn't hand a server job to a repo lane", /reaches no server/.test(ops) && /`sts-prod`/.test(ops) && !/Your lane,/.test(ops), "");
    const open = handoverRules(["dailify"], "dailify", { ...r, sandboxed: false }).join("\n");
    ok("sandbox off: repo lanes reach the same servers as ops", /without a sandbox: they reach the same servers as `ops`/.test(open) && !/reaches no server/.test(open), open);
    ok("no reach known: the rules are as they were", !/can reach/.test(handoverRules(["dailify"], "dailify").join("\n")), "");
    ok("unreachable: the servers a handover names that a sandboxed repo lane can't reach; none for ops, or unsandboxed", unreachable("Set WHATSAPP_PROVIDER=meta in /srv/dailify/.env on sts-prod and restart", "dailify", r).join() === "sts-prod" && !unreachable("on sts-prod", "ops", r).length && !unreachable("on sts-prod", "dailify", { ...r, sandboxed: false }).length && !unreachable("the sts-production-notes file", "dailify", r).length, "");
    const before = calls.add.length;
    put(coral, "HANDOFF.md", "### GhostAIChat\nSwitch WHATSAPP_PROVIDER to meta in the live .env on sts-prod, then restart the service.\n");
    dispatch(coral, { ...deps(), reach: r });
    const sent = calls.add.slice(before)[0] || {};
    ok("a handover to a repo lane naming a server it can't reach: its task says so, and to send that part to ops", sent.repo === "GhostAIChat" && /^\(handed over by coral\) Symbiot: GhostAIChat runs in a sandbox and can't reach sts-prod\. Do the code part here, and hand what has to change on that server to ops/.test(sent.after || ""), sent);
    put(coral, "HANDOFF.md", "");
  }

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
    { path: gone, displayName: "dailify", gitRemoteIdentity: { canonicalKey: "github.com/GAWdessey/dailify" } },
    { path: coral, displayName: "coral" },
    { path: join(HOME, "old", "nowhere"), displayName: "nowhere" } ] } };
  const remotes = { [dailify]: "git@github.com:GAWdessey/Dailify.git", [other]: "https://github.com/GAWdessey/other.git" };
  const orcaCalls = [];
  const fakeOrca = async (cli, args) => { orcaCalls.push(args); return args[1] === "list" ? JSON.stringify(orcaList) : '{"id":"x","ok":true,"result":{}}'; };
  const omap = { dailify, other, coral };
  ok("remotes compare however they're written", remoteKey("git@github.com:GAWdessey/Dailify.git") === "github.com/gawdessey/dailify" && remoteKey("https://user@github.com/GAWdessey/dailify.git/") === "github.com/gawdessey/dailify" && remoteKey("github.com/GAWdessey/dailify") === "github.com/gawdessey/dailify", "");
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
  // a parked lane (2026-10-09): "queued: that lane is busy" while nothing ran there
  map.parkedone = lane("parkedone");
  put(coral, "HANDOFF.md", "### parkedone\nSign the release APK with the upload key.\n");
  runResult = () => ({ blocked: true, parked: true, note: "Parked: its tasks start no agent runs until you unpark it." });
  lanesTick(deps());
  const hb = loadLedger().handoffs.find((h) => /release APK/.test(h.text)), rb = lanesState().handoffs.find((h) => /release APK/.test(h.text));
  ok("a lane that didn't start: blocked, with why, never held", hb.status === "blocked" && /Parked/.test(hb.note) && rb.status === "blocked" && /Parked/.test(rb.note), [hb, rb]);
  runResult = () => ({ busy: true });
  ran(ghost, h3.at + 2000, "Built android/app/build/outputs/apk/debug/app-debug.apk.");
  const t4 = lanesTick(deps({ tasks: [{ id: h3.task, review: true }] }));
  ok("its run done and the task ticked: coral hears it's done and waits for review", t4.reported.length === 1 && /Done in GhostAIChat: the task is ticked/.test(read(coral, "ANSWERS.md")) && /app-debug\.apk/.test(read(coral, "ANSWERS.md")), read(coral, "ANSWERS.md").slice(-300));
  runResult = () => ({ id: "j" });

  // Symbiot's own code (licence.mjs's self-work gate): unlike parked above, no one
  // unblocks this by waiting, so it's reported back at once instead of sitting as a
  // handover that never comes back (coral → symbiot, 2026-10-10: bounced silently)
  map.symbiot = lane("symbiot");
  put(coral, "HANDOFF.md", "### symbiot\nFix the thing in symbiot's own code.\n");
  runResult = () => ({ blocked: true, self: true, note: "Symbiot doesn't work on its own code (Symbiot's repo, a copy of it, or its installed files)." });
  const tself = lanesTick(deps());
  const hs = loadLedger().handoffs.find((h) => /thing in symbiot's own code/.test(h.text));
  ok("blocked on Symbiot's own code: reported back at once, not left waiting on a run that'll never start", tself.reported.length === 1 && hs.status === "done" && /Symbiot doesn't work on its own code/.test(read(coral, "ANSWERS.md")) && /on symbiot's own task list now, on the Workdesk/.test(read(coral, "ANSWERS.md")) && /don't hand this over again/.test(read(coral, "ANSWERS.md")), read(coral, "ANSWERS.md").slice(-400));
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
  const runs6 = calls.run.length; lanesTick(deps());
  const e6 = loadLedger().handoffs.find((h) => h.from.path === deep);
  ok(`${MAX_CHAIN} handovers in a row: the next one isn't started (no ping-pong)`, e6 && e6.status === "blocked" && /handovers in a row/.test(e6.note) && !calls.run.slice(runs6).some((x) => x.p === coral), [e6, calls.run.slice(runs6)]);
  ok("…but it's in that lane's tasks, for its next run, not dropped", e6 && e6.task && calls.add.slice(-1)[0].text === "And back again." && calls.add.slice(-1)[0].repo === "coral" && calls.push.slice(-1)[0].repo === "coral" && /waits in coral's tasks/.test(e6.note), [e6, calls.add.slice(-1)]);
  ok("…and the lane that asked sees why on its block", handingOf(deep, { ledger: loadLedger(), map, running: () => false }).some((x) => /didn't start: 4 handovers in a row/.test(x.why)), handingOf(deep, { ledger: loadLedger(), map, running: () => false }));
  L.handoffs.push({ id: "p2", key: "p2", from: { lane: "coral", path: coral }, to: { lane: "ops", path: deep }, text: "y", at: Date.now(), chain: MAX_CHAIN, status: "done", reportedAt: Date.now() });
  writeFileSync(join(CFG, "lanes.json"), JSON.stringify({ handoffs: [...loadLedger().handoffs, L.handoffs.at(-1)] }));
  put(deep, "HANDOFF.md", "### ops\nAnd on to ops.\n");
  const acts6 = calls.act.length; lanesTick(deps());
  const e7 = loadLedger().handoffs.find((h) => h.from.path === deep && h.text === "And on to ops.");
  ok("…to ops, which has no task list: not started, and the agent that asked is told", e7 && e7.status === "error" && /handovers in a row/.test(e7.error) && calls.act.length === acts6, e7);
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
  const sentNow = read(opsA, "HANDOFF.md"), sentRows = sentNow.split("\n").filter((l) => /^- /.test(l));
  ok("…and HANDOFF.md's Sent line says it started, as which run, not \"couldn't hand it over\"", sentRows.length === 1 && /→ \*\*ops\*\*: the user let it through, and ops's agent started on it, as run act-allowed\. "Needs a run that can read/.test(sentRows[0]) && !/couldn't hand it over/.test(sentNow), sentNow);
  ok("…the rest of HANDOFF.md as it was", /^# Handovers: sent/.test(sentNow) && /## Sent/.test(sentNow), sentNow);
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
  const pc = leftToYou("The commit and push didn't happen. The three changes are still uncommitted, and waiting for you to commit and push them: `git add -A && git commit`, then `git push origin main`.");
  ok("…local git work left in its last words (commit, push) is an OK for its agent to do it, never a step only you can take", pc && pc.kind === "approve", pc);
  ok("…git work is told apart from what needs who you are (a password, a token, signing in)", gitWork("git push origin main") && gitWork("Commit the fix and push it to main") && gitWork("pull the latest from origin") && !gitWork("type your GitHub password when git push asks") && !gitWork("sign in to gh, then push the branch") && !gitWork("paste the token into .env"), "");
  // the card a failed CI run left (paperclip-steve, 2026-10-08): paste git commands into a terminal yourself
  const ci = agentsGitWork(["👤 You: review the diff, then run `git add -A && git commit -m \"ci: skip claude test when absent\"` and `git push origin main` (recommended)", "Leave it for now"]);
  ok("a failed CI run's \"👤 You: … git add, commit, push\" option is the agent's, with an OK on the Workdesk before the push", /^🤖 Agent: review the diff, then run `git add -A/.test(ci[0]) && /asking for your OK on the Workdesk, with the files, before it pushes \(recommended\)$/.test(ci[0]) && ci[1] === "Leave it for now", ci);
  ok("…dropped when another option already has the agent do it", agentsGitWork(["🤖 Agent: commit and push the fix", "👤 You: commit and push it yourself"]).join("|") === "🤖 Agent: commit and push the fix", "");
  ok("…while a step that needs who you are stays yours", /^👤/.test(agentsGitWork(["👤 You: type your GitHub password when git push asks"])[0]), "");
  const npm = agentsClicking(["👤 You (only you: your security key): at www.npmjs.com/package/symbiot/access click GitHub Actions, enter owner GAWdessey, repository symbiot, workflow filename publish.yml, environment blank, tick 'Allow npm publish', click 'Set up' (recommended)"]);
  ok("clicking through a form is the agent's, pausing only for the security key", /^🤖 Agent: at www\.npmjs\.com.*pausing on the Workdesk only for your security key \(recommended\)$/.test(npm[0]), npm[0]);
  ok("…one tap alone stays yours", /^👤/.test(agentsClicking(["👤 You (only you: your security key): tap it when npm asks"])[0]), "");
  const cw = agentsCodeWork(["👤 You (only you: a Symbiot code change): apply `.symbiot/whatsapp-photo-upload.patch` in the checkout (recommended)", "Leave it"]);
  ok("a code change or patch is the agent's, with an OK asked on the Workdesk", /^🤖 Agent: .*patch.*OK on the Workdesk \(recommended\)$/.test(cw[0]) && cw[1] === "Leave it", cw);
  ok("…dropped when another option already has the agent do it", agentsCodeWork(["🤖 Agent: apply the patch", "👤 You: apply the patch yourself"]).join("|") === "🤖 Agent: apply the patch", "");
  ok("…while a password step stays yours", /^👤/.test(agentsCodeWork(["👤 You (only you: your password): type it when the patch tool asks"])[0]), "");
  ok("…and so does a physical step", /^👤/.test(agentsClicking(["👤 You (only you: your phone): plug it in, click Allow, enter the code, tick Always"])[0]), "");
  // two agents on the one npm step (2026-10-10): only the first asks
  const npmAsk = { path: "/a", startedAt: 1, text: "Type your password on www.npmjs.com/package/symbiot/access" }, closeAsk = { path: "/b", startedAt: 2, text: "Close the window so I can open npmjs.com" };
  const hl = heldAsks([closeAsk, npmAsk, { path: "/c", startedAt: 3, text: "Approve the invoice on xero.com" }]);
  ok("a second agent's question about the same site is held for the first", hl["/b"] === "/a" && !hl["/a"] && !hl["/c"], JSON.stringify(hl));
  ok("the brief: a CLI's own login (gh…) is the agent's when its site is signed in in Symbiot's browser", ONLY_YOU.includes(CLI_LOGIN) && /gh auth login -h github\.com --web/.test(CLI_LOGIN) && /not Symbiot's connection/.test(CLI_LOGIN), "");
  ok("…and the brief says to read the live page and leave a site to its owner", /read the live page/.test(ONLY_YOU) && /only the owner asks the user anything/.test(ONLY_YOU), "");
  // GitHub's transfer email (2026-10-10), with Gmail linked
  const { agentsMail } = await import("../handover.mjs");
  const ml = agentsMail(["👤 You (only you: your email): accept GitHub's transfer email for GarthGhostai/symbiot (recommended)", "Leave it"], ["gmail"]);
  ok("accepting an email is the agent's when the mailbox is linked, asking OK first", /^🤖 Agent: accept GitHub's transfer email.*linked mailbox.*OK on the Workdesk.*\(recommended\)$/.test(ml[0]) && ml[1] === "Leave it", ml);
  ok("…yours when no mailbox is linked", /^👤/.test(agentsMail(["👤 You: accept GitHub's transfer email"], [])[0]), "");
  ok("…and a password or code in the mail stays yours", /^👤/.test(agentsMail(["👤 You (only you: an SMS code): open the email and type the code"], ["gmail"])[0]), "");
  // the Marketing card (the [Steve] series, 2026-10-08), with LinkedIn linked in Symbiot's browser
  const mk = ["👤 You (only you: your linkedin): schedule all three now in linkedin's scheduler, 08:00 on tue 13, 20 and 27 oct. paste each post's text and attach its card (recommended)", "👤 You (only you: your linkedin): schedule only week 2 now and approve 3 and 4 one at a time"];
  const mp = agentsPosting(mk, ["github", "linkedin"]);
  ok("posting, scheduling or pasting on a linked platform is never \"only you\": the agent's, once you approve its preview", mp.every((o) => /^🤖 Agent: schedule/.test(o) && /once you approve its preview on the Workdesk/.test(o)) && /\(recommended\)$/.test(mp[0]) && !mp.some((o) => /only you/.test(o)), mp);
  ok("…signing in to it stays yours", /^👤/.test(agentsPosting(["👤 You (only you: your linkedin sign-in): sign in once on linkedin's own page"], ["linkedin"])[0]), "");
  ok("…and so does a platform that isn't linked in Symbiot", agentsPosting(mk, ["github"]).join() === mk.join(), "");
  // the poster card (2026-10-08): "let a poster on this computer put the steve posts up for you?", LinkedIn linked
  const pq = ["👤 You (only you: your linkedin sign-in): ok it, and i'll have the ops lane build a poster that posts each one as you (recommended)", "👤 You (only you: your linkedin): keep doing it by hand. schedule each post in linkedin yourself"];
  const pl = linkedAsks(pq, ["linkedin"]), shown = agentsPosting(pl, ["linkedin"]);
  ok("a linked platform: no sign-in or link step is yours, and doing it by hand isn't offered", shown.length === 1 && /^🤖 Agent: post it through Symbiot's browser, already signed in to LinkedIn, once you approve its preview on the Workdesk \(recommended\)$/.test(shown[0]) && !shown.some((o) => /👤|only you|by hand|yourself|sign-in/.test(o)), shown);
  ok("…every option by hand: the agent's one is offered instead, never none", linkedAsks(["do it by hand", "👤 You (only you: a browser): paste it in manually"], ["linkedin"], "Post week 2 on LinkedIn?").join() === "🤖 Agent: post it through Symbiot's browser, already signed in to LinkedIn, once you approve its preview on the Workdesk (recommended)", "");
  ok("…signing in again stays yours when a real attempt found the session expired, and says so", /^👤/.test(linkedAsks(["👤 You (only you: your linkedin sign-in): the session expired when it tried to post: sign in again in Symbiot's browser"], ["linkedin"])[0]), "");
  { const q = ["👤 You (only you: your npm sign-in): sign in to www.npmjs.com/login in the Symbiot Browser", "🤖 Agent: assume 5x and plan agent counts"];
    ok("an npm sign-in option never takes LinkedIn's buttons, even when the question mentions LinkedIn", linkedAsks(q, ["linkedin"], "Sign in to npm so I can post the release note, like the LinkedIn post?").join() === q.join(), linkedAsks(q, ["linkedin"], "LinkedIn").join());
    ok("…two questions back to back: the second keeps only its own options", linkedAsks(["Agent: assume 5x"], ["linkedin"], "Which Max plan are you on?").join() === "Agent: assume 5x", ""); }
  ok("…and a platform that isn't linked still asks you to sign in", linkedAsks(pq, ["github"]).join() === pq.join(), "");
  ok("a run's last words asking you to sign in to a linked platform, or make its developer app, aren't left to you", linkedChore("👤 You: create LinkedIn's developer app and sign in to give it the one-time OK to post as you", ["linkedin"]) && !linkedChore("👤 You: create LinkedIn's developer app", ["github"]) && !linkedChore("LinkedIn signed out when it tried: sign in again", ["linkedin"]), "");
  ok("the brief: agents open the Symbiot Browser themselves, on a given address", /symbiot browser <url>/.test(ONLY_YOU) && /never tell the user you can't open it/.test(ONLY_YOU));
  ok("…but only for a sign-in that really expired: it blocks every `symbiot screens` command until Done, so never to browse or follow an external link", /every `symbiot screens` command, yours and other agents', fails until the user clicks Done/.test(ONLY_YOU) && /only for a sign-in a real attempt showed is expired, never to read, click or browse a page/.test(ONLY_YOU) && /map a link's address directly/.test(ONLY_YOU));
  ok("the brief: sending is not reading; check access first, look up the provider by MX, full plain options", /is not being able to read it/.test(ONLY_YOU) && /dig \+short MX/.test(ONLY_YOU) && /never cut off/.test(ONLY_YOU));
  ok("the brief: prefer the linked browser session over APIs and apps that need the user; never offer it by hand", /Prefer what's already linked: Symbiot's own browser \(`~\/\.config\/symbiot\/browser`\) is signed in to the sites the user linked/.test(ONLY_YOU) && /ask them to sign in only when a real attempt found the session expired/.test(ONLY_YOU) && /never offer doing an agent's job by hand/.test(ONLY_YOU), "");
  ok("the brief: marketing posts once the user approves its preview, it doesn't leave it to them", /`marketing`:[^\n]*approves each one's preview, and then it posts or schedules it itself through Symbiot's signed-in browser/.test(handoverRules(["symbiot", "marketing"], "symbiot").join("\n")), "");
  ok("the brief: local git work is never a 👤 step: do it, ask for an OK before a push", /Local git work \(staging, committing, pulling, pushing[^)]*\) is never a 👤 step[^.]*ask only for an OK in QUESTIONS\.md before a push/.test(ONLY_YOU), "");
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
  const actT2 = join(CFG, "drafts", "act-tail2");
  put(actT2, "TASKS.md", "- [ ] Give the WhatsApp module a fixed public URL\n"); streamed(actT2, tAgo, "Running tailscale needs sudo, and only you can do that.\n\nPaste this: `sudo tailscale up`.");
  noted({ path: actT2, name: "Agent: a fixed URL again", startedAt: tAgo });
  ok("…and another agent asking the same thing doesn't raise it again", !needsOn(actT2), needsOn(actT2));
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

  console.log("A HANDOVER REWRITTEN MID-RUN — it supersedes that run, never a second one");
  {
    const asker = lane("marketer"), smap = { ...map, marketer: asker }, sOps = join(CFG, "drafts", "act-sup"); mkdirSync(join(sOps, ".symbiot"), { recursive: true });
    const led = { handoffs: [] }, acts = [], refreshed = [], drops = [], adds = [], runs = [];
    let going = new Set();
    const sd = (extra = {}) => ({ map: smap, ledger: led, now: Date.now(), running: (p) => going.has(p), tasks: () => extra.tasks || [],
      act: (text) => { acts.push(text); return { ok: true, job: "a" + acts.length, dir: sOps }; },
      refresh: (e, text) => { refreshed.push({ e: e.id, text }); return { ok: true }; },
      drop: (id) => drops.push(id), add: (text, repo) => { adds.push({ text, repo }); return { id: "t" + (adds.length) }; },
      push: () => ({ written: [{}] }), run: (p) => { runs.push(p); return { busy: true }; } });
    const v1 = "Build a LinkedIn auto-poster that posts approved drafts through the signed-in browser session.";
    const v2 = "Build a LinkedIn auto-poster that posts approved drafts through the signed-in browser session, and schedules weeks 2-4.";
    put(asker, "HANDOFF.md", "### ops\n" + v1 + "\n");
    dispatch(asker, sd()); going = new Set([sOps]);
    put(asker, "HANDOFF.md", "### ops\n" + v2 + "\n");
    const s2 = dispatch(asker, sd());
    ok("ops still building v1: v2 goes to that run, no second ops run", acts.length === 1 && refreshed.length === 1 && refreshed[0].text === v2 && s2.length === 1, { acts, refreshed });
    ok("…one ledger row, now v2, not counted done by the old run", led.handoffs.length === 1 && led.handoffs[0].text === v2 && led.handoffs[0].superseded === 1 && led.handoffs[0].was.length === 1, led.handoffs);
    ok("…and not picked up again on the next pass", dispatch(asker, sd()).length === 0 && acts.length === 1, acts.length);
    put(asker, "HANDOFF.md", "### ops\nFind a JDK 17 on this machine and give its path.\n");
    dispatch(asker, sd());
    ok("a different handover to the same lane: a run of its own", acts.length === 2 && refreshed.length === 1, acts.length);
    going = new Set(); led.handoffs.length = 0; acts.length = 0; refreshed.length = 0;
    put(asker, "HANDOFF.md", "### ops\n" + v1 + "\n"); dispatch(asker, sd());
    put(asker, "HANDOFF.md", "### ops\n" + v2 + "\n"); dispatch(asker, sd());
    ok("the earlier run already over: the new version starts as usual", acts.length === 2 && refreshed.length === 0, acts.length);
    // dailify, 12 Oct 2026: "New job, not a replacement: restart Kea…" queued behind a 40-minute run on the earlier one
    going = new Set([sOps]); led.handoffs.length = 0; acts.length = 0;
    put(asker, "HANDOFF.md", "### ops\n" + v1 + "\n"); dispatch(asker, sd());
    put(asker, "HANDOFF.md", "### ops\nNew job, not a replacement: " + v2 + "\n"); dispatch(asker, sd());
    ok("a handover that says it's a new job, not a replacement: a run of its own, even when it reads alike", acts.length === 2 && refreshed.length === 0 && led.handoffs.length === 2, { acts, refreshed });
    going = new Set();
    led.handoffs.length = 0;
    put(asker, "HANDOFF.md", "### coral\n" + v1 + "\n"); dispatch(asker, sd());
    put(asker, "HANDOFF.md", "### coral\n" + v2 + "\n"); const r2 = dispatch(asker, sd({ tasks: [{ id: "t1" }] }));
    ok("a repo lane, its task still open: the old task gives way to the new one, one row", drops[0] === "t1" && adds.length === 2 && adds[1].text === v2 && led.handoffs.length === 1 && led.handoffs[0].task === "t2" && r2[0].status === "held", { drops, adds, led: led.handoffs });
  }

  console.log("A REPLACEMENT'S SENT LINE — names the run it waits on, and says when that run starts on it");
  {
    // dailify, 12 Oct 2026: "ops's run on that one gets it when it ends" named no run and never changed. Its agent
    // checked an ops run that had ended, decided nothing had started, and sent the Kea brief again
    const asker = lane("kea-asker"), kOps = join(CFG, "drafts", "act-ca0f866a"); mkdirSync(join(kOps, ".symbiot"), { recursive: true });
    const kmap = { ...map, "kea-asker": asker }, led = { handoffs: [] }; let going = new Set();
    const kd = () => ({ map: kmap, ledger: led, now: Date.now(), running: (p) => going.has(p), tasks: () => [], refresh: () => ({ ok: true }),
      act: () => ({ ok: true, job: "k1", dir: kOps }) });
    const k1 = "Kea, the site assistant on sts-prod: put the deployed corpus live, then drop her cached answers that quote the old price.";
    const k2 = "Kea, the site assistant on sts-prod: put the deployed corpus live, then drop her cached answers that quote the old price, and check www.";
    put(asker, "HANDOFF.md", "### ops\n" + k1 + "\n"); dispatch(asker, kd()); ran(kOps, Date.now() - 1000, "");
    going = new Set([kOps]); put(asker, "HANDOFF.md", "### ops\n" + k2 + "\n"); dispatch(asker, kd());
    const waits = read(asker, "HANDOFF.md").split("\n").filter((l) => /^- /.test(l))[0];
    ok("while the run on the earlier version goes, the Sent line names it", /replaces the version sent earlier: ops's run act-ca0f866a is on that one, and gets this when that run ends\. "Kea/.test(waits), waits);
    const L0 = loadLedger(); writeFileSync(join(CFG, "lanes.json"), JSON.stringify({ handoffs: [...L0.handoffs, ...led.handoffs] }));
    lanesTick({ ...deps(), map: {}, running: () => true, run: () => ({ busy: true }) });
    ok("…nothing changes while that run is still on the earlier version", read(asker, "HANDOFF.md").split("\n").filter((l) => /^- /.test(l))[0] === waits, read(asker, "HANDOFF.md"));
    const began = Date.now() + 5; ran(kOps, began, "");
    lanesTick({ ...deps(), map: {}, running: () => true, run: () => ({ busy: true }) });
    const now3 = read(asker, "HANDOFF.md").split("\n").filter((l) => /^- /.test(l));
    ok("…once a run there starts on it, the Sent line says so, and when", new RegExp(`replaces the version sent earlier: ops's run act-ca0f866a started on it at ${new Date(began).toTimeString().slice(0, 5)}\\. "Kea`).test(now3[0])&& now3.length === 1 && /^# Handovers: sent/.test(read(asker, "HANDOFF.md")), now3);
    ok("…and remembers it did", !!loadLedger().handoffs.find((x) => x.to.path === kOps && x.pickedAt === began), "");
    writeFileSync(join(CFG, "lanes.json"), JSON.stringify(L0));
  }

  console.log("TWO OPS RUNS ON ONE JOB — an addition goes to the run on it; a new run is told what's going");
  {
    // dailify, 12 Oct 2026: "resume the blocked jobs", then "an addition to the 12:51 brief", each a run of its own,
    // texting the user PINs in turn and overwriting each other's audit sections
    const dl = lane("dailify"), dmap = { ...map, dailify: dl }, first = join(CFG, "drafts", "act-0a1b2c3d"), other = join(CFG, "drafts", "act-99887766");
    for (const p of [first, other]) mkdirSync(join(p, ".symbiot"), { recursive: true });
    writeFileSync(join(other, ".symbiot", "handoff.json"), JSON.stringify({ name: "Agent: **Read-only audit for moving production Dailify…" }));
    const led = { handoffs: [] }, acts = []; let going = new Set([other]);
    const dd = (extra = {}) => ({ map: dmap, ledger: led, now: Date.now(), running: (p) => going.has(p), tasks: () => [], dirs: [first, other],
      act: (text, o) => { acts.push({ text, o }); return { ok: true, job: "d" + acts.length, dir: first }; }, ...extra });
    const resume = "**Resume the dailify.co.za jobs that were blocked on sign-ins.** The user is signed in to domains.co.za in the Symbiot browser.";
    put(dl, "HANDOFF.md", "### ops\n" + resume + "\n"); dispatch(dl, dd());
    const told = acts[0].o.alongside || "";
    ok("a new ops run while another is going: its brief lists that run, by folder", /^## Other ops runs going now/.test(told) && /`act-99887766` \(~\/\.config\/symbiot\/drafts\/act-99887766\): "Read-only audit for moving production Dailify…"/.test(told), told);
    ok("…and says not to redo its steps or spoil its sign-in, to add to a shared file without rewriting it, and to check before crediting the user", /don't redo its steps/.test(told) && /new PIN/.test(told) && /never rewrite or delete what another run wrote/.test(told) && /rather than guessing it was the user/.test(told), told);
    ok("…the brief carries it, above its task", (() => { const b = actBrief("x", { alongside: told }); return b.indexOf("## Other ops runs going now") > 0 && b.indexOf("## Other ops runs going now") < b.indexOf("## Tasks"); })(), "");
    const sent = read(dl, "HANDOFF.md");
    ok("HANDOFF.md's Sent line names the run, so a follow-up can name it too", /ops's agent started on it, as run act-0a1b2c3d/.test(sent), sent);
    going = new Set([first, other]); led.handoffs[0].at = Date.now() - 60000; ran(first, Date.now() - 50000, "");
    const sudo = "**Addition to run act-0a1b2c3d (resume the blocked jobs): the user has OK'd sudo on sts-prod for these steps.**";
    put(first, "TASKS.next.md", ""); put(dl, "HANDOFF.md", sent + "\n### ops\n" + sudo + "\n");
    const s2 = dispatch(dl, dd());
    ok("an addition naming that run, while it runs: no second run, one ledger row", acts.length === 1 && s2.length === 1 && led.handoffs.length === 1 && led.handoffs[0].added === 1 && led.handoffs[0].text === resume, { acts: acts.length, led: led.handoffs });
    ok("…it waits in that run's folder for when it ends, and its ANSWERS.md says it adds to the work, not replaces it", /OK'd sudo on sts-prod/.test(read(first, "TASKS.next.md")) && /### More from dailify while you ran/.test(read(first, "ANSWERS.md")) && /doesn't replace it/.test(read(first, "ANSWERS.md")), [read(first, "TASKS.next.md").slice(0, 300), read(first, "ANSWERS.md")]);
    const sent2 = read(dl, "HANDOFF.md");
    ok("…the Sent list says where it went, the first line still the run on it", /added to act-0a1b2c3d, the ops run already on what it adds to/.test(sent2.split("\n").filter((l) => /^- /.test(l))[0]) && /started on it, as run act-0a1b2c3d/.test(sent2), sent2);
    ok("…the block says the run is on it, and does the addition when it's through", /act-0a1b2c3d is on it now, and does what you added/.test(handingOf(dl, { map: dmap, ledger: led, running: (p) => going.has(p), work: () => ({}) })[0].why), handingOf(dl, { map: dmap, ledger: led, running: (p) => going.has(p), work: () => ({}) }));
    ok("…not picked up again", dispatch(dl, dd()).length === 0 && acts.length === 1, acts.length);
    const job6 = "**Add to act-0a1b2c3d: run job 6 in DAILIFY-DOMAIN-MOVE-OPS-JOBS.md now.** The user OK'd it.";
    put(dl, "HANDOFF.md", read(dl, "HANDOFF.md") + "\n### ops\n" + job6 + "\n"); dispatch(dl, dd());
    const held = read(first, "TASKS.next.md");
    ok("a second addition before the run ends joins the first, not replaces it", acts.length === 1 && /OK'd sudo on sts-prod/.test(held) && /run job 6/.test(held) && led.handoffs[0].added === 2, held.slice(0, 600));
    ok("…not reported back when the run that was going ends: the additions haven't run yet", outcome(led.handoffs[0], { running: () => false, tasks: [] }) === null, led.handoffs[0]);
    going = new Set([first]);
    const tailEnd = "### ops\nAdd to act-0a1b2c3d: also check www.";
    put(dl, "HANDOFF.md", tailEnd + "\n"); led.handoffs[0].reportedAt = Date.now();
    dispatch(dl, dd());
    ok("a run that already came back takes no additions: the handover starts a run of its own", acts.length === 2, acts.length);
    led.handoffs.length = 0; acts.length = 0; going = new Set();
    put(dl, "HANDOFF.md", "### ops\n" + resume + "\n"); dispatch(dl, dd());
    ok("with no other ops run going, the brief says nothing about others", !acts[0].o.alongside, acts[0].o.alongside);
  }

  console.log("A HANDOVER WAITING — the lane's block says whether its lane has it, and if not, why");
  {
    // whatsapp_module, 2026-10-12: its rewritten test-number handover sat behind ops's run on the earlier version
    const wa = lane("whatsapp_module"), wmap = { ...map, whatsapp_module: wa }, wOps = join(CFG, "drafts", "act-wa"); mkdirSync(join(wOps, ".symbiot"), { recursive: true });
    const led = { handoffs: [] }, acts = []; let going = new Set();
    const wd = () => ({ map: wmap, ledger: led, now: Date.now(), running: (p) => going.has(p), tasks: () => [],
      act: (text) => { acts.push(text); return { ok: true, job: "w" + acts.length, dir: wOps }; }, refresh: () => ({ ok: true }) });
    const hv = (o = {}) => handingOf(wa, { map: wmap, ledger: led, running: (p) => going.has(p), work: () => ({ doing: "Filling in the app's settings", progress: { done: 2, total: 5 } }), ...o });
    const v1 = "**What's needed:** set up Meta's free test number for the WhatsApp module and put its credentials in .env.";
    const v2 = "**What's needed:** set up Meta's free test number for the WhatsApp module in a new VASINC account and put its credentials in .env.";
    put(wa, "HANDOFF.md", "### ops\n" + v1 + "\n");
    const fresh = hv({ changedAt: Date.now() - 5000 });
    ok("written seconds ago, not picked up yet: not sent, within 20 seconds", fresh.length === 1 && !fresh[0].gone && /within 20 seconds/.test(fresh[0].why) && fresh[0].lane === "ops" && !/\*\*/.test(fresh[0].text), fresh);
    ok("…minutes and still not picked up: says Symbiot sends them only while its app is open", /Not sent after 10 min: .*app is open/.test(hv({ changedAt: Date.now() - 600000 })[0].why), hv({ changedAt: Date.now() - 600000 }));
    ok("…a folder Symbiot doesn't have as a lane: says it's never read", /doesn't have this folder as a lane/.test(handingOf(wa, { map, ledger: led, changedAt: Date.now() - 600000 })[0].why), "");
    dispatch(wa, wd()); led.handoffs[0].at = Date.now() - 120000; going = new Set([wOps]); ran(wOps, Date.now() - 60000, "");
    const sent = read(wa, "HANDOFF.md");
    ok("once it's sent, HANDOFF.md says so: no section left to send, a dated line for what went where", parseHandoffs(sent).length === 0 && /^# Handovers: sent/.test(sent) && /^- \d{4}-\d\d-\d\d \d\d:\d\d → \*\*ops\*\*: ops's agent started on it, as run act-wa \(name that in a handover that adds to it while it runs\)\. "What's needed: set up Meta's free test number/m.test(sent) && /ANSWERS\.md/.test(sent), sent);
    const on = hv();
    ok("…and the block still shows it, from the ledger, with how far ops's run has got", on.length === 1 && on[0].gone && /^Sent: its agent is on it now/.test(on[0].why) && on[0].doing === "Filling in the app's settings" && on[0].progress.done === 2, on);
    ok("…nothing sent twice: the next pass starts nothing", dispatch(wa, wd()).length === 0 && acts.length === 1, acts.length);
    put(wa, "HANDOFF.md", sent + "\n### ops\n" + v2 + "\n"); dispatch(wa, wd());
    const behind = hv(), sent2 = read(wa, "HANDOFF.md");
    ok("a changed version added under the list: it goes to the run on the earlier one, which gets it when it ends", acts.length === 1 && behind.length === 1 && behind[0].gone && /^Sent: ops is on the earlier version now .* gets this one when that run ends/.test(behind[0].why), behind);
    ok("…and the list now has both, newest first, and nothing left to send", parseHandoffs(sent2).length === 0 && /replaces the version sent earlier: ops's run act-wa is on that one, and gets this when that run ends\. "What's needed: set up Meta's free test number for the WhatsApp module in a new VASINC/.test(sent2.split("\n").filter((l) => /^- /.test(l))[0]) && sent2.split("\n").filter((l) => /^- /.test(l)).length === 2, sent2);
    going = new Set(); led.handoffs[0].at = Date.now(); // the new brief started once the run ended
    ran(wOps, Date.now() + 20, ""); going = new Set([wOps]);
    ok("…once it ends and starts on the new version: sent, on it now", hv()[0].gone && /on it now/.test(hv()[0].why), hv());
    going = new Set(); put(wOps, "QUESTIONS.md", "## Questions\n### The code Meta sent?\nwhy\n- paste it (recommended)\n- not yet\n");
    ok("…its run ended asking you: sent, and it asked you first", /asked you something first/.test(hv()[0].why), hv());
    led.handoffs[0].reportedAt = Date.now(); led.handoffs[0].status = "done";
    ok("…and once it came back: nothing waiting", hv().length === 0, hv());
    put(wa, "HANDOFF.md", "### payroll\nPay the WhatsApp bill.\n"); dispatch(wa, wd());
    led.handoffs[led.handoffs.length - 1].reportedAt = Date.now();
    const bad = hv();
    ok("a lane that doesn't exist: couldn't hand it over, and why, even once that's gone back to it", bad.length === 1 && !bad[0].gone && /Couldn't hand it over: There's no lane called payroll/.test(bad[0].why), bad);
    ok("…its file says so too", /→ \*\*payroll\*\*: couldn't hand it over: There's no lane called payroll/.test(read(wa, "HANDOFF.md")), read(wa, "HANDOFF.md"));
    led.handoffs[led.handoffs.length - 1].skipped = Date.now();
    ok("…skipped: not shown again", hv().length === 0, hv());
    put(wa, "HANDOFF.md", "### coral\nAdd the WhatsApp webhook route to coral.\n");
    dispatch(wa, { ...wd(), add: () => ({ id: "c1" }), push: () => ({}), run: () => ({ busy: true }) }); going = new Set([coral]);
    const q = hv();
    ok("a repo lane that's busy: sent, and queued until that run ends", q.length === 1 && q[0].gone && /^Sent, and queued: coral's agent is busy/.test(q[0].why), q);
    ok("…its file: queued in coral", /→ \*\*coral\*\*: queued in coral: its agent was busy/.test(read(wa, "HANDOFF.md")), read(wa, "HANDOFF.md"));
    put(wa, "HANDOFF.md", "### ops\nFind a JDK 17.\n### coral\nAdd the WhatsApp webhook route to coral.\n");
    const half = read(wa, "HANDOFF.md");
    ok("the file changed by its agent while a pass ran: left as it is, for the next pass", (() => { const ledg = { handoffs: [] }; dispatch(wa, { ...wd(), ledger: ledg, act: () => { put(wa, "HANDOFF.md", half + "### GhostAIChat\nRebuild the APK.\n"); return { ok: true, job: "x", dir: wOps }; }, add: () => ({ id: "c2" }), push: () => ({}), run: () => ({ id: "r" }) }); return parseHandoffs(read(wa, "HANDOFF.md")).length === 3; })(), read(wa, "HANDOFF.md"));
    put(wa, "HANDOFF.md", "");
    led.handoffs.length = 0;
    ok("nothing handed over: nothing", handingOf(wa, { map: wmap, ledger: led }).length === 0, "");
  }
  console.log("ONE ANSWER, EVERY AGENT ON THAT WORK — Garth answered evra_avm's data loss three times (13 Oct 2026)");
  {
    const { shareAnswer, sharedFor, sharedTo, answerReaches } = await import("../lanes.mjs");
    const A = await import("../agents.mjs"), { buildTasksMd: brief } = await import("../tasks.mjs");
    const ask = (p, qs, why = "The evra_avm data, from the read-only checks.") => put(p, "QUESTIONS.md", "## Questions\n" + qs.map((q) => "### " + q + "\n" + why + "\n- 🤖 Agent: do it (recommended)\n- skip it\n").join("\n"));
    // card 1: evra_platform's read-only investigation; card 2: the ops run it handed sts-prod's checks to, one more question queued
    const evra = lane("evra_platform"), evraOps = join(CFG, "drafts", "act-evra01"), other = join(CFG, "drafts", "act-evra02"), elsewhere = join(CFG, "drafts", "act-dlfy01"), spent = join(CFG, "drafts", "act-evra03");
    const q1 = "Send the Supabase ticket about evra_avm now?", q2 = "Check the two shell histories only sudo can read, for an evra_avm dump?", q3 = "Restore from the evra_avm snapshot?";
    ask(evra, [q1]); put(evra, "TASKS.md", "- [ ] Find out what happened to evra_avm's data\n");
    ask(evraOps, [q2, "Ask AWS support for the volume's snapshots?"]); put(evraOps, "TASKS.md", "- [ ] Read-only checks on sts-prod (16.28.15.189)\n");
    ask(other, [q3]); put(other, "TASKS.md", "- [ ] Restore plan\n");
    ask(elsewhere, ["Move dailify.co.za's DNS now?"], "Its nameservers, for the site."); put(elsewhere, "TASKS.md", "- [ ] DNS\n");
    put(spent, "TASKS.md", "- [x] evra_avm: list the tables\n"); // finished, nothing open: left alone
    const eLedger = { handoffs: [{ id: "ev1", key: "ev1", from: { lane: "evra_platform", path: evra }, to: { lane: "ops", path: evraOps }, text: "Read-only checks on sts-prod for the evra_avm dump", at: Date.now() - 3600000, chain: 1, status: "started" }] };
    const eMap = { ...map, evra_platform: evra }, runsList = [evra, evraOps, other, elsewhere, spent].map((p) => ({ path: p, name: "Agent", startedAt: Date.now() - 600000 }));
    const started = [], o = { ledger: eLedger, runs: () => runsList, running: () => false, map: eMap, run: (p) => { started.push(p); return { id: "j" + started.length }; }, cfg: { profile: { name: "Garth White" } } };
    const said = "first check if evra_avm is saved somewhere else";
    const reach = answerReaches(evra, q1 + "\n" + said, o);
    ok("an answer to card 1 reaches card 2's agent (a handover links them) and another on evra_avm, not dailify's or a finished one", reach.map((r) => r.path).sort().join() === [evraOps, other].sort().join() && reach.find((r) => r.path === evraOps).why === "handover" && reach.find((r) => r.path === other).why === "evra_avm", reach.map((r) => [r.path, r.why]));
    const sh = shareAnswer(evra, [{ q: q1, a: said }], o);
    const opsAns = read(evraOps, "ANSWERS.md");
    ok("each gets it in its ANSWERS.md: the question, Garth's answer, and to use it and not ask if it settles its own", sh.length === 2 && opsAns.includes(said) && opsAns.includes(q1) && /Garth's answer to evra_platform/.test(opsAns) && /take that question out of QUESTIONS.md/.test(opsAns) && /answered by Garth's reply to evra_platform/.test(opsAns) && /ask only the part that's left/.test(opsAns), opsAns);
    ok("…with a question open and no run going, each starts on it and decides", started.sort().join() === [evraOps, other].sort().join() && sh.every((r) => r.started), [started, sh]);
    ok("…the others are left alone", !read(elsewhere, "ANSWERS.md") && !read(spent, "ANSWERS.md"), "");
    started.length = 0;
    ok("the same answer again isn't shared twice", shareAnswer(evra, [{ q: q1, a: said }], o).length === 0 && !started.length && read(evraOps, "ANSWERS.md").split(said).length === 2, "");
    const busyRun = shareAnswer(evra, [{ q: q1, a: "or set up our own supabase" }], { ...o, running: (p) => p === evraOps });
    ok("an agent at work gets it too, for a question it was about to ask, and isn't started twice", busyRun.some((r) => r.path === evraOps && !r.started) && read(evraOps, "ANSWERS.md").includes("set up our own supabase"), busyRun);
    const card = sharedTo(evraOps, { cfg: o.cfg });
    ok("card 2 on Home says Garth answered evra_platform on this, and what", card && card.lane === "evra_platform" && /supabase|evra_avm/.test(card.a) && card.who === "Garth", card);
    // through the answer itself: Home, the Workdesk and a phone all answer with answerQuestions(…, { share: true })
    writeFileSync(join(CFG, "runs.json"), JSON.stringify(runsList)); writeFileSync(join(CFG, "lanes.json"), JSON.stringify(eLedger));
    put(evra, "QUESTIONS.md", "## Questions\n### Which Supabase project holds evra_avm now?\nfor the ticket\n- 🤖 Agent: the old one (recommended)\n- the new one\n");
    put(evraOps, "QUESTIONS.md", "## Questions\n### " + q2 + "\nfor the evra_avm dump\n- 👤 You (only you: sudo on sts-prod): run that one line\n- skip it\n");
    A.onAnswered((p, rows) => shareAnswer(p, rows, { run: () => ({ id: "j" }), map: eMap }));
    const r1 = A.answerQuestions(evra, [{ q: "Which Supabase project holds evra_avm now?", a: "the old one, ap-south-1" }], { share: true });
    ok("answering card 1 says it went to card 2's agent too", r1.ok && (r1.also || []).includes("ops"), r1);
    put(evra, "QUESTIONS.md", "## Questions\n### Which region?\nfor the ticket\n- 🤖 Agent: ap-south-1 (recommended)\n- another\n");
    const r0 = A.answerQuestions(evra, [{ q: "Which region?", a: "ap-south-1 for evra_avm" }], {});
    ok("…only the user's answers are shared (not Symbiot's own picks)", r0.ok && !r0.also, r0);
    A.onAnswered(null);
    // before asking anything new: a run that starts on that work later is told what's answered, and every brief says to check
    const more = sharedFor(evra, "Check the evra_avm backups on sts-prod", { ledger: eLedger, cfg: o.cfg });
    ok("a new run on that work is told what Garth already answered there", /What Garth has already answered on this work/.test(more) && more.includes(said) && /don't ask/.test(more), more);
    calls.act.length = 0; put(evra, "HANDOFF.md", "### ops\nNew job: check the evra_avm backups in S3, read-only.\n");
    dispatch(evra, { ...deps(), map: eMap, ledger: eLedger });
    ok("…a handover on it to ops carries it in its brief", calls.act.length === 1 && String(calls.act[0].o.alongside || "").includes(said), calls.act[0] && calls.act[0].o.alongside);
    ok("and every brief says to read ANSWERS.md again before asking, for answers given to another agent", /Before you ask the user anything, read .\.symbiot\/ANSWERS\.md. again/.test(brief("coral", {}, [{ id: "1", text: "x", repo: "coral" }])) && /what this brief says the user has already answered/.test(actBrief("x", { lanes: [] })), "");
    writeFileSync(join(CFG, "lanes.json"), JSON.stringify({ handoffs: [] }));
  }
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} lanes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
