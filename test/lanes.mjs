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

const { dispatch, lanesTick, outcome, loadLedger, lanesState, stageOf, underWay, MAX_CHAIN, aboutIt, partlyDone, remoteKey, orcaMoves, orcaRelink, stuckHandovers, allowHandover, skipHandover, namedDirs, handingOf } = await import("../lanes.mjs");
const { parseHandoffs, handoverRules, CLI_LOGIN, ONLY_YOU, leftToYou, dangles, gitWork, agentsGitWork, agentsClicking, agentsCodeWork, heldAsks, agentsPosting, linkedAsks, linkedChore } =await import("../handover.mjs");
const { buildTasksMd, mergeWhenGreen } = await import("../tasks.mjs");
{
  const fake = (buckets, mergeStatus = 0) => { const calls = []; const gh = (a) => { calls.push(a.slice(0, 2).join(" ")); return a[1] === "checks" ? { status: 0, stdout: JSON.stringify(buckets.map((bucket) => ({ bucket }))) } : { status: mergeStatus, stderr: "" }; }; return { gh, calls }; };
  const g = fake(["pass", "pass"]), f = fake(["pass", "fail"]), p = fake(["pass", "pending"]);
  const rg = await mergeWhenGreen("/tmp", "7", g.gh), rf = await mergeWhenGreen("/tmp", "7", f.gh), rp = await mergeWhenGreen("/tmp", "7", p.gh);
  ok("merging from Symbiot: green checks merge past the self-review rule, so no second GitHub account is needed", rg.ok && g.calls.join() === "pr checks,pr merge", [rg, g.calls]);
  ok("…but a failing or running check never merges", rf.error && !f.calls.includes("pr merge") && rp.pending && !p.calls.includes("pr merge"), [rf, rp]);
  const wf = join(HOME, "wf-repo"); mkdirSync(join(wf, ".github", "workflows"), { recursive: true }); writeFileSync(join(wf, ".github", "workflows", "ci.yml"), "on: pull_request\n");
  const n0 = fake([]), rn = await mergeWhenGreen(wf, "7", n0.gh), n1 = fake([]), rn1 = await mergeWhenGreen(join(HOME, "no-wf"), "7", n1.gh);
  ok("…nor one whose checks haven't started yet (a PR just opened), in a repo that has them; one with no checks at all merges", rn.pending && !n0.calls.includes("pr merge") && rn1.ok, [rn, rn1]);
}
const { actBrief } = await import("../mind.mjs");

// two repo lanes and the ops folder, on disk
const lane = (name) => { const p = join(HOME, "projects", name); mkdirSync(join(p, ".symbiot"), { recursive: true }); return p; };
const atlas = lane("atlas"), ghost = lane("ChatApp"), map = { atlas, ChatApp: ghost };
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
  const md = buildTasksMd("atlas", { lanes: ["atlas", "symbiot", "ChatApp"] }, [{ text: "Build the Android app" }]);
  ok("a repo's brief names its lane, the others, and ops", /this one is `atlas`/.test(md) && /`symbiot`, `ChatApp`/.test(md) && /`ops`: anything outside a repo/.test(md) && /\.symbiot\/HANDOFF\.md/.test(md), "");
  ok("👤 only for what no agent can do, and the option says which", md.includes(ONLY_YOU) && /👤 You \(only you: <which>\)/.test(md) && /never a 👤 step: do it, or hand it over/.test(md), "");
  const ab = actBrief("Find a JDK 17", { lanes: ["atlas", "ChatApp"] });
  ok("the ops brief has the same rules, and its lane is ops", /this one is `ops`/.test(ab) && /`atlas`, `ChatApp`/.test(ab) && ab.includes(ONLY_YOU), "");
  const ph = parseHandoffs("# Handoffs\n### ops\nFind a JDK 17 on this machine.\nWhy: the android build needs it.\n### `ChatApp`\nBuild the debug APK.\n## Notes\nnot a handover");
  ok("HANDOFF.md parses into lanes and what's needed", ph.length === 2 && ph[0].lane === "ops" && /JDK 17/.test(ph[0].text) && ph[1].lane === "ChatApp" && !/not a handover/.test(ph[1].text), ph);
  ok("the rules list a lane once, never the agent's own", handoverRules(["atlas", "atlas", "x"], "atlas").join("\n").match(/`x`/g).length === 1 && !/: `atlas`, /.test(handoverRules(["atlas", "x"], "atlas")[3]), "");

  console.log("WHAT EACH LANE CAN REACH — ops handed bookly a live .env change it couldn't reach (13 Oct 2026)");
  {
    const { sshHosts, envProviders, laneReach, unreachable, serverOnly } = await import("../reach.mjs");
    const ssh = "Host prod-box\n  HostName 41.76.1.2\n  User pat\nHost *\n  ServerAliveInterval 30\nHost gh github-work\n";
    ok("the servers this computer connects to come from its ssh config, wildcards left out", sshHosts(ssh).join() === "prod-box,41.76.1.2,github-work", sshHosts(ssh));
    ok("…an alias too short to match safely is left out", !sshHosts(ssh).includes("gh"), sshHosts(ssh));
    const env = "# keys\nGOOGLE_CLIENT_SECRET=x\nexport TWILIO_AUTH_TOKEN=y\nNEXT_PUBLIC_STRIPE_KEY=z\nJWT_SECRET=a\nAPI_KEY=b\nPORT=3000\nMETA_APP_ID=1\n";
    ok("a lane's .env gives the providers it holds keys for, names only, no generic words", envProviders(env).join() === "GOOGLE,TWILIO,STRIPE", envProviders(env));
    const r = laneReach({ bookly: "/x/bookly", atlas: "/x/atlas" }, { sandboxed: true, ssh, read: (f) => (f === "/x/bookly/.env" ? env : "") });
    ok("laneReach: sandboxed, the hosts, and keys only for lanes that have some", r.sandboxed && r.hosts.includes("prod-box") && r.keys.bookly.join() === "GOOGLE,TWILIO,STRIPE" && !r.keys.atlas, r);
    const rs = laneReach({}, { sandboxed: true, ssh: "", screens: () => [{ page: { url: "https://business.facebook.com/x?a=1" } }, { page: { url: "https://www.console.twilio.com/" } }, { page: { url: "http://127.0.0.1:7391/" } }, {}] });
    ok("laneReach: the sites Symbiot's browser has mapped, the app's own address left out", rs.sites.join() === "business.facebook.com,console.twilio.com", rs);
    ok("a repo's brief: websites are every lane's, via symbiot screens or the site's API, so a Meta check isn't handed away untried, and a Twilio one goes by its API, never a browser sign-in", /Websites are every lane's[^\n]*business\.facebook\.com[^\n]*symbiot screens[^\n]*try it, or the site's own API, before you say your lane can't reach a site[^\n]*Twilio, Cloudflare and Google sign-ins don't hold in that browser: reach those through their API/.test(handoverRules(["bookly"], "bookly", rs).join("\n")), handoverRules(["bookly"], "bookly", rs).join("\n"));
    const rules = handoverRules(["bookly", "atlas"], "bookly", r).join("\n");
    ok("a repo's brief: ops reaches the servers, every repo lane reaches none, so a live server's .env is ops's", /`ops`: runs on this computer, outside any sandbox: the servers this computer connects to \(`prod-box`/.test(rules) && /Every repo lane runs in a sandbox: it writes only in its own folder and reaches no server/.test(rules) && /its `\.env`, a restart, a deploy/.test(rules), rules);
    ok("…its own lane says it reaches no server, and a server job goes to ops, never back to a repo lane", /Your lane, `bookly`, reaches no server\. If you're handed a job on one, hand that part to `ops`, never back to a repo lane/.test(rules), rules);
    ok("…and which lane's .env holds which keys", /`bookly` \(GOOGLE, TWILIO, STRIPE\)/.test(rules) && !/`atlas` \(/.test(rules), rules);
    // SMS Portal logs a browser sign-in out after about an hour unused, and sms_service's .env holds its API key (16 Oct 2026)
    const { keyedSites } = await import("../reach.mjs");
    const ks = keyedSites({ sms_service: ["SMSPORTAL", "SMS"], bookly: ["GOOGLE", "TWILIO"] }, ["cp.smsportal.com", "console.twilio.com", "mail.google.com", "console.cloud.google.com", "smsportalx.com"]);
    ok("keyedSites: a linked site whose own API a lane's key opens, by a label of its host; not a short name, nor a company of many products (GOOGLE)", JSON.stringify(ks) === JSON.stringify([{ host: "cp.smsportal.com", lane: "sms_service", provider: "SMSPORTAL" }, { host: "console.twilio.com", lane: "bookly", provider: "TWILIO" }]), ks);
    const ra = laneReach({ sms_service: "/x/sms" }, { sandboxed: true, ssh: "", read: (f) => (f === "/x/sms/.env" ? "SMSPORTAL_CLIENT_ID=a\nSMSPORTAL_API_SECRET=b\n" : ""), screens: () => [], linked: () => ["cp.smsportal.com"] });
    ok("laneReach: the linked sites a lane's key opens", JSON.stringify(ra.apis) === JSON.stringify([{ host: "cp.smsportal.com", lane: "sms_service", provider: "SMSPORTAL" }]), ra);
    const apiRules = handoverRules(["sms_service"], "symbiot", ra).join("\n");
    ok("…and the brief sends a check there through that API, not another sign-in for the user", /cp\.smsportal\.com \(`sms_service`'s SMSPORTAL\)[^\n]*goes through that API[^\n]*don't ask the user to sign in again/.test(apiRules), apiRules);
    ok("…none when no key opens a linked site", !/own API one of those keys opens/.test(rules), "");
    ok("…and no blank line inside the reach list", !/\n\n/.test(apiRules.split("What each lane can reach")[1] || "\n\n"), apiRules);
    // 20 Oct 2026: "i gave my api key to symbiot but it keeps asking me for it": a key in the vault opened nothing in the brief
    const rv = laneReach({}, { sandboxed: true, ssh: "", screens: () => [], linked: () => ["dash.cloudflare.com"], vault: () => [{ name: "cloudflare api token", provider: "CLOUDFLARE" }] });
    const vRules = handoverRules(["bookly"], "bookly", rv).join("\n");
    ok("a key already in the vault is named in every brief (never its value), with not to ask for it again", rv.vault.join() === "cloudflare api token" && /Keys the user already gave, in Symbiot's vault[^\n]*"cloudflare api token"[^\n]*Never ask the user for one of these again/.test(vRules), vRules);
    ok("…and the linked site its API opens, through ops", /dash\.cloudflare\.com \(the vault's "cloudflare api token", through `ops`\)/.test(vRules), rv.vaultApis);
    ok("…none of that when the vault holds no key", !/already gave, in Symbiot's vault/.test(apiRules), "");
    const ops = actBrief("Change WHATSAPP_PROVIDER in the prod .env on prod-box", { lanes: ["bookly"], reach: r });
    ok("the ops brief says it too, so ops doesn't hand a server job to a repo lane", /reaches no server/.test(ops) && /`prod-box`/.test(ops) && !/Your lane,/.test(ops), "");
    const open = handoverRules(["bookly"], "bookly", { ...r, sandboxed: false }).join("\n");
    ok("sandbox off: repo lanes reach the same servers as ops", /without a sandbox: they reach the same servers as `ops`/.test(open) && !/reaches no server/.test(open), open);
    ok("no reach known: the rules are as they were", !/can reach/.test(handoverRules(["bookly"], "bookly").join("\n")), "");
    ok("unreachable: the servers a handover names that a sandboxed repo lane can't reach; none for ops, or unsandboxed", unreachable("Set WHATSAPP_PROVIDER=meta in /srv/bookly/.env on prod-box and restart", "bookly", r).join() === "prod-box" && !unreachable("on prod-box", "ops", r).length && !unreachable("on prod-box", "bookly", { ...r, sandboxed: false }).length && !unreachable("the telcohub-production-notes file", "bookly", r).length, "");
    ok("serverOnly: a job that's all on a server the lane can't reach (a deploy, a restart, a check there), none with code in it, none for ops or unsandboxed", serverOnly("Put the bookly fix for Pat's two WhatsApp complaints live on prod-box", "bookly", r).join() === "prod-box" && serverOnly("Read-only: check the relay's logs on prod-box", "bookly", r).length === 1 && !serverOnly("Fix the bug in the invite flow, then deploy it to prod-box", "bookly", r).length && !serverOnly("Add a WHATSAPP_PROVIDER switch to the code, then set it in the live .env on prod-box", "bookly", r).length && !serverOnly("Put it live on prod-box", "ops", r).length && !serverOnly("Put it live on prod-box", "bookly", { ...r, sandboxed: false }).length && !serverOnly("Check the Meta template's status", "bookly", r).length, "");
    ok("serverOnly: a deploy that names no server goes to ops too, not a sandboxed lane (a go-ahead on batch 2 moved nothing, 23 Oct 2026)", serverOnly("Go ahead: deploy batch 2 of the reminders", "bookly", r).join() === "the server it deploys to" && !serverOnly("Fix the reminders, then deploy batch 2", "bookly", r).length && !serverOnly("Deploy batch 2", "ops", r).length && !serverOnly("Deploy batch 2", "bookly", { ...r, sandboxed: false }).length, "");
    const before = calls.add.length;
    put(atlas, "HANDOFF.md", "### ChatApp\nAdd a WHATSAPP_PROVIDER switch to the code, then set it to meta in the live .env on prod-box and restart the service.\n");
    dispatch(atlas, { ...deps(), reach: r });
    const sent = calls.add.slice(before)[0] || {};
    ok("a handover to a repo lane naming a server it can't reach: its task says so, and to send that part to ops", sent.repo === "ChatApp" && /^\(handed over by atlas\) Symbiot: ChatApp runs in a sandbox and can't reach prod-box\. Do the code part here, and hand what has to change on that server to ops/.test(sent.after || ""), sent);
    // all of it on the server: it goes to ops, which can, rather than to a lane that can only hand it on (16 Oct 2026)
    const adds = calls.add.length, acts = calls.act.length;
    put(atlas, "HANDOFF.md", "### ChatApp\nSwitch WHATSAPP_PROVIDER to meta in the live .env on prod-box, then restart the service.\n");
    const [rr] = dispatch(atlas, { ...deps(), reach: r });
    ok("…all of it on that server: Symbiot sends it to ops instead, and ops hears why", rr && rr.to.lane === "ops" && rr.rerouted && rr.rerouted.from === "ChatApp" && calls.add.length === adds && calls.act.length === acts + 1 && /It was for ChatApp, but ChatApp runs in a sandbox and can't reach prod-box/.test(calls.act.at(-1).o.context), [rr, calls.act.at(-1) && calls.act.at(-1).o.context]);
    ok("…and the lane that asked reads where it went in its HANDOFF.md", /→ \*\*ops\*\*: sent to ops instead of ChatApp \(ChatApp runs in a sandbox and can't reach prod-box\), and ops's agent started on it/.test(read(atlas, "HANDOFF.md")), read(atlas, "HANDOFF.md"));
    { const L0 = loadLedger(); L0.handoffs = L0.handoffs.filter((h) => !h.rerouted); writeFileSync(join(CFG, "lanes.json"), JSON.stringify(L0)); calls.act.length = acts; }
    put(atlas, "HANDOFF.md", "");
  }

  console.log("TO OPS AND BACK — atlas needs a JDK; ops finds it; atlas carries on");
  put(atlas, "HANDOFF.md", "### ops\nFind a JDK 17 on this machine and give its path.\nWhy: ChatApp's android build needs one.\n");
  const t1 = lanesTick(deps());
  ok("the ops agent is started on it, told who asked", t1.started.length === 1 && calls.act.length === 1 && /JDK 17/.test(calls.act[0].text) && /atlas's agent/.test(calls.act[0].o.context), t1.started);
  ok("picked up once, not again on the next tick", lanesTick(deps()).started.length === 0 && calls.act.length === 1, calls.act.length);
  const h1 = loadLedger().handoffs[0];
  busy = new Set([opsDir]);
  ok("while ops works, nothing is reported", lanesTick(deps()).reported.length === 0, "");
  busy = new Set(); ran(opsDir, h1.at + 1000, "Found it: ~/.gradle/jdks/eclipse_adoptium-17 (JDK 17.0.19)."); put(opsDir, "TASKS.md", "- [x] Find a JDK 17\n");
  busy = new Set([atlas]);
  ok("…nor while atlas's own agent is still running (it would miss it)", lanesTick(deps()).reported.length === 0, "");
  busy = new Set(); const runsBefore = calls.run.length;
  put(atlas, "TASKS.md", "- [ ] Build the APK once ops finds a JDK 17\n"); // what it waits on: a lane with no open task isn't started for a report (21 Oct 2026)
  const t2 = lanesTick(deps());
  const ans = read(atlas, "ANSWERS.md");
  ok("the result goes back into atlas's ANSWERS.md, with what ops said", t2.reported.length === 1 && /### Handed over to ops: Find a JDK 17/.test(ans) && /Done \(the ops agent\)/.test(ans) && /eclipse_adoptium-17/.test(ans), ans);
  ok("and atlas's agent is started again to carry on", calls.run.length === runsBefore + 1 && calls.run.slice(-1)[0].p === atlas && calls.run.slice(-1)[0].o.force, calls.run.slice(-1));
  ok("reported once", lanesTick(deps()).reported.length === 0 && loadLedger().handoffs[0].status === "done", loadLedger().handoffs[0].status);
  ok("…and once it's back, Orca is checked for a lane folder the handover renamed", calls.relink === 1, calls.relink);

  console.log("ORCA — a lane's folder renamed by a handover is added again where it is now");
  const bookly = join(HOME, "bookly"), other = join(HOME, "proj", "other"), gone = join(HOME, "CallForge AI");
  mkdirSync(bookly, { recursive: true }); mkdirSync(other, { recursive: true });
  const orcaList = { ok: true, result: { repos: [
    { path: gone, displayName: "bookly", gitRemoteIdentity: { canonicalKey: "github.com/GAWdessey/bookly" } },
    { path: atlas, displayName: "atlas" },
    { path: join(HOME, "old", "nowhere"), displayName: "nowhere" } ] } };
  const remotes = { [bookly]: "git@github.com:GAWdessey/Bookly.git", [other]: "https://github.com/GAWdessey/other.git" };
  const orcaCalls = [];
  const fakeOrca = async (cli, args) => { orcaCalls.push(args); return args[1] === "list" ? JSON.stringify(orcaList) : '{"id":"x","ok":true,"result":{}}'; };
  const omap = { bookly, other, atlas };
  ok("remotes compare however they're written", remoteKey("git@github.com:GAWdessey/Bookly.git") === "github.com/gawdessey/bookly" && remoteKey("https://user@github.com/GAWdessey/bookly.git/") === "github.com/gawdessey/bookly" && remoteKey("github.com/GAWdessey/bookly") === "github.com/gawdessey/bookly", "");
  const rl = await orcaRelink({ map: omap, cli: "/x/orca-ide", orca: fakeOrca, remoteOf: async (p) => remotes[p] || "" });
  ok("the gone path's repo is found by its GitHub remote, and added again in Orca", rl.moves.length === 1 && rl.moves[0].from === gone && rl.moves[0].to === bookly && rl.moves[0].ok && orcaCalls.some((a) => a.join(" ") === `repo add --path ${bookly} --json`), rl.moves);
  ok("…a folder that still exists, or one with nowhere to go, is left alone", orcaCalls.filter((a) => a[1] === "add").length === 1, orcaCalls);
  const byName = await orcaMoves([{ path: join(HOME, "Old Name"), displayName: "other" }], omap, { remoteOf: async () => "" });
  ok("…with no remote kept, by its name", byName.length === 1 && byName[0].to === other, byName);
  const twins = await orcaMoves([{ path: gone, displayName: "bookly", gitRemoteIdentity: { canonicalKey: "github.com/x/y" } }], omap, { remoteOf: async () => "github.com/x/y" });
  ok("…never a guess: two matches move nothing", twins.length === 0, twins);
  ok("no Orca here: nothing happens", (await orcaRelink({ map: omap, cli: "", orca: fakeOrca })).moves.length === 0, "");
  ok("Orca not running (its CLI says nothing): nothing happens", (await orcaRelink({ map: omap, cli: "/x/orca-ide", orca: async () => "" })).moves.length === 0, "");

  console.log("A STEP OF THE USER'S — a result coming back doesn't start a run they said to hold");
  // atlas's run asked for a key in .env, and the user said "don't start another run until it's in"
  put(atlas, "waiting.json", JSON.stringify({ step: "put the key in `.env`", files: [{ name: ".env", path: join(atlas, ".env"), sig: "none" }], at: Date.now() }));
  put(atlas, "HANDOFF.md", "### ops\nFind the WABA id in the Meta dashboard export.\n"); ran(opsDir, Date.now() - 60000, "the JDK run, long done");
  lanesTick(deps());
  const hw = loadLedger().handoffs.find((h) => /WABA/.test(h.text));
  ran(opsDir, hw.at + 1000, "Found it in the export."); put(opsDir, "TASKS.md", "- [x] Find the WABA id\n");
  const runsW = calls.run.length, tw = lanesTick(deps());
  ok("the result is reported, but atlas's run isn't forced past the user's step (it starts once .env changes)", tw.reported.length === 1 && calls.run.length === runsW + 1 && calls.run.slice(-1)[0].o.force === false && /Found it in the export/.test(read(atlas, "ANSWERS.md")), [tw.reported.length, calls.run.slice(-1)]);
  rmSync(join(atlas, ".symbiot", "waiting.json"));

  console.log("A HANDOVER THAT FINISHED NOTHING — the lane waiting on it isn't forced to start again (14 Oct 2026 audit)");
  {
    const { report } = await import("../lanes.mjs"), A = await import("../agents.mjs");
    const opsRun = join(CFG, "drafts", "act-nofin"); put(opsRun, "TASKS.md", "- [ ] Check the number switch\n"); ran(opsRun, Date.now() - 1000, "The switch isn't live yet.");
    const e = { from: { lane: "atlas", path: atlas }, to: { lane: "ops", path: opsRun }, text: "Check the number switch", at: Date.now() - 60000 };
    const o = outcome(e, { running: () => false, tasks: [] }), runs = [], r = (p, opt) => { runs.push(opt); return { id: "x" }; };
    ok("ops stopped without finishing: reported, but atlas's run isn't forced (blockedAgain decides)", /It stopped without finishing/.test(o.text) && !o.settled && report(e, o, { run: r, running: () => false, waiting: () => null, auto: () => true }) && runs[0].force === false, [o, runs]);
    put(opsRun, "TASKS.md", "- [x] Check the number switch\n");
    const done = outcome(e, { running: () => false, tasks: [] });
    ok("…once it's done, it is forced, as before", done.settled && report(e, done, { run: r, running: () => false, waiting: () => null, auto: () => true }) && runs[1].force === true, runs);
    put(atlas, "TASKS.md", "- [x] Build the APK\n");
    ok("…but a lane with no open task isn't started for a report: its next run reads it (21 Oct 2026)", report(e, done, { run: r, running: () => false, waiting: () => null, auto: () => true }) && runs.length === 2, runs);
    put(atlas, "TASKS.md", "- [ ] Build the APK once ops finds a JDK 17\n");
    ok("…nor past the lane's automatic starts for the hour", report(e, done, { run: r, running: () => false, waiting: () => null, auto: () => false }) && runs.length === 2, runs);
    ok("…and a handover that couldn't be made is news too", outcome({ ...e, status: "error", error: "no lane" }, {}).settled, "");
    const md = "# Answers\n\n### Which port?\n3000\n_answered 2026-10-14_\n";
    const plusNotes = md + "\n### Handed over to ops: x\nIt stopped without finishing (the ops agent).\n_answered by symbiot (handover) 2026-10-14_\n\n### Pat's answer to ops, on the same work as you\nabout outlook.live.com too\n_shared by Symbiot 2026-10-14 (background)_\n\n### More from atlas while you ran\nx\n_symbiot (handover) 2026-10-14_\n";
    ok("the answers a blocked lane's inputs hash are only the user's: Symbiot's own notes don't count as something new", A.userAnswers(plusNotes) === A.userAnswers(md) && A.userAnswers(md + "\n### Which host?\nhomebox\n_answered 2026-10-14_\n") !== A.userAnswers(md), A.userAnswers(plusNotes));
    ok("…but an answer shared from a linked lane still counts", A.userAnswers(md + "\n### Pat's answer to ops\nyes\n_shared by Symbiot 2026-10-14_\n") !== A.userAnswers(md), "");
  }

  console.log("TO ANOTHER REPO — atlas hands ChatApp its part");
  put(atlas, "HANDOFF.md", "### ChatApp\nBuild the debug APK with the JDK at ~/.gradle/jdks/eclipse_adoptium-17.\n");
  runResult = () => ({ busy: true });
  const t3 = lanesTick(deps());
  const h3 = loadLedger().handoffs.find((h) => h.to.lane === "ChatApp");
  ok("it joins ChatApp's tasks, marked who it's from, and goes out like Send to repos", calls.add.slice(-1)[0].repo === "ChatApp" && /\(handed over by atlas\)/.test(calls.add.slice(-1)[0].after) && calls.push.slice(-1)[0].repo === "ChatApp" && t3.started.length === 1, calls.add.slice(-1));
  ok("that lane busy: queued, and not counted done when the busy run ends", h3.status === "held" && (ran(ghost, h3.at - 5000, "an earlier run"), lanesTick(deps()).reported.length === 0), h3.status);
  // a parked lane (2026-10-09): "queued: that lane is busy" while nothing ran there
  map.parkedone = lane("parkedone");
  put(atlas, "HANDOFF.md", "### parkedone\nSign the release APK with the upload key.\n");
  runResult = () => ({ blocked: true, parked: true, note: "Parked: its tasks start no agent runs until you unpark it." });
  lanesTick(deps());
  const hb = loadLedger().handoffs.find((h) => /release APK/.test(h.text)), rb = lanesState().handoffs.find((h) => /release APK/.test(h.text));
  ok("a lane that didn't start: blocked, with why, never held", hb.status === "blocked" && /Parked/.test(hb.note) && rb.status === "blocked" && /Parked/.test(rb.note), [hb, rb]);
  runResult = () => ({ busy: true });
  ran(ghost, h3.at + 2000, "Built android/app/build/outputs/apk/debug/app-debug.apk.");
  const t4 = lanesTick(deps({ tasks: [{ id: h3.task, review: true }] }));
  ok("its run done and the task ticked: atlas hears it's done and waits for review", t4.reported.length === 1 && /Done in ChatApp: the task is ticked/.test(read(atlas, "ANSWERS.md")) && /app-debug\.apk/.test(read(atlas, "ANSWERS.md")), read(atlas, "ANSWERS.md").slice(-300));
  runResult = () => ({ id: "j" });

  // Symbiot's own code (licence.mjs's self-work gate): unlike parked above, no one
  // unblocks this by waiting, so it's reported back at once instead of sitting as a
  // handover that never comes back (atlas → symbiot, 2026-10-10: bounced silently)
  map.symbiot = lane("symbiot");
  put(atlas, "HANDOFF.md", "### symbiot\nFix the thing in symbiot's own code.\n");
  runResult = () => ({ blocked: true, self: true, note: "Symbiot doesn't work on its own code (Symbiot's repo, a copy of it, or its installed files)." });
  const tself = lanesTick(deps());
  const hs = loadLedger().handoffs.find((h) => /thing in symbiot's own code/.test(h.text));
  ok("blocked on Symbiot's own code: reported back at once, not left waiting on a run that'll never start", tself.reported.length === 1 && hs.status === "done" && /Symbiot doesn't work on its own code/.test(read(atlas, "ANSWERS.md")) && /on symbiot's own task list now, on the Workdesk/.test(read(atlas, "ANSWERS.md")) && /don't hand this over again/.test(read(atlas, "ANSWERS.md")), read(atlas, "ANSWERS.md").slice(-400));
  runResult = () => ({ id: "j" });

  console.log("LONG HANDOVERS — nothing cut: an email to draft arrives whole");
  const email = "Draft the email below to Remy, then stop.\n\n" + Array.from({ length: 60 }, (_, i) => `${i + 1}. A shared secret, line ${i + 1}: we'll both use it to sign and verify each request.`).join("\n") + "\n\nPat";
  put(atlas, "HANDOFF.md", "### ops\n" + email + "\n### ChatApp\n" + email + "\n");
  lanesTick(deps());
  ok("to ops, every line of it", calls.act.slice(-1)[0].text === email, calls.act.slice(-1)[0].text.length);
  ok("to a repo, all of it goes to its task (a long one links to the rest there)", calls.add.slice(-1)[0].text === email && calls.add.slice(-1)[0].after === "(handed over by atlas)", calls.add.slice(-1)[0].text.length);
  const eb = actBrief(email, { lanes: [] });
  ok("the ops brief quotes it line by line, sign-off and all; its task line ends at a word", eb.includes("> 60. A shared secret, line 60: we'll both") && /\n>\n> Pat\n/.test(eb) && /- \[ \] Draft the email below to Remy, then stop\. 1\. A shared .*\S…\n/.test(eb), eb.slice(0, 300));
  const ls = lanesState().handoffs.find((h) => h.to === "ChatApp" && h.full);
  ok("the Agents tab gets its first line, and all of it to open", ls && ls.text === "Draft the email below to Remy, then stop." && ls.full === email, ls && ls.text);

  console.log("NOT DONE BY HAND — mistakes go back to the agent, not to the user");
  put(atlas, "HANDOFF.md", "### payroll\nRun payroll.\n### atlas\nDo my own thing.\n");
  const acts5 = calls.act.length; lanesTick(deps());
  const a5 = read(atlas, "ANSWERS.md"), pay5 = loadLedger().handoffs.find((h) => h.from.path === atlas && /Run payroll/.test(h.text));
  ok("a lane that doesn't exist: ops takes it, told the name and which lanes do (16 Oct 2026)", pay5 && pay5.status !== "error" && pay5.to.lane === "ops" && pay5.rerouted && pay5.rerouted.noLane && pay5.rerouted.from === "payroll" && calls.act.length === acts5 + 1 && /doesn't exist \(payroll\)[^\n]*atlas, ChatApp/.test(calls.act.at(-1).o.context), [pay5, calls.act.at(-1) && calls.act.at(-1).o.context]);
  ok("its own lane: told to do it itself", /atlas is your own lane: do it yourself/.test(a5), "");
  const deep = join(CFG, "drafts", "act-deep"); mkdirSync(join(deep, ".symbiot"), { recursive: true });
  // the chain counts through the handover this run is on (its brief quotes it), not every row ever into the folder
  const L = JSON.parse(readFileSync(join(CFG, "lanes.json"), "utf8")); L.handoffs.push({ id: "p", key: "p", from: { lane: "atlas", path: atlas }, to: { lane: "ops", path: deep }, text: "Restart the relay on prod-box and say what you saw.", at: Date.now(), chain: MAX_CHAIN, status: "done", reportedAt: Date.now() });
  writeFileSync(join(CFG, "lanes.json"), JSON.stringify(L));
  put(deep, "TASKS.md", "The user asked Symbiot for this:\n\n> Restart the relay on prod-box and say what you saw.\n\n## Tasks\n- [ ] Restart the relay on prod-box and say what you saw.\n");
  put(deep, "HANDOFF.md", "### atlas\nRestart the relay on prod-box again, and say what you saw.\n");
  const runs6 = calls.run.length; lanesTick(deps());
  const e6 = loadLedger().handoffs.find((h) => h.from.path === deep);
  ok(`${MAX_CHAIN} handovers in a row: the next one isn't started (no ping-pong)`, e6 && e6.status === "blocked" && /handovers in a row/.test(e6.note) && !calls.run.slice(runs6).some((x) => x.p === atlas), [e6, calls.run.slice(runs6)]);
  ok("…but it's in that lane's tasks, for its next run, not dropped", e6 && e6.task && calls.add.slice(-1)[0].text === "Restart the relay on prod-box again, and say what you saw." && calls.add.slice(-1)[0].repo === "atlas" && calls.push.slice(-1)[0].repo === "atlas" && /waits in atlas's tasks/.test(e6.note), [e6, calls.add.slice(-1)]);
  ok("…and the lane that asked sees why on its block", handingOf(deep, { ledger: loadLedger(), map, running: () => false }).some((x) => /didn't start: 4 handovers in a row/.test(x.why)), handingOf(deep, { ledger: loadLedger(), map, running: () => false }));
  L.handoffs.push({ id: "p2", key: "p2", from: { lane: "atlas", path: atlas }, to: { lane: "ops", path: deep }, text: "Restart the relay on prod-box and say what you saw.", at: Date.now(), chain: MAX_CHAIN, status: "done", reportedAt: Date.now() });
  writeFileSync(join(CFG, "lanes.json"), JSON.stringify({ handoffs: [...loadLedger().handoffs, L.handoffs.at(-1)] }));
  put(deep, "HANDOFF.md", "### ops\nOps: restart the relay on prod-box once more and say what you saw.\n");
  const acts6 = calls.act.length; lanesTick(deps());
  const e7 = loadLedger().handoffs.find((h) => h.from.path === deep && /restart the relay on prod-box once more/.test(h.text));
  {
    // a lane's own open task that merely shares words with a brief line isn't the handover it is "on" (16 Oct 2026)
    const { parentOf } = await import("../lanes.mjs");
    const led = { handoffs: [{ id: "q", key: "q", from: { lane: "ops", path: deep }, to: { lane: "atlas", path: atlas }, text: "Pat can't merge the one-tap yes link change into main: atlas conflicts uncommitted please resolve", at: 1, chain: 7, status: "done" }] };
    const brief = "# Tasks\n- **Open markers:**\n  - atlas: 2 uncommitted conflicts main\n\n## Tasks\n- [ ] Report the Meta template status of atlas broker invite, read only.\n\n## When you finish an item\n- Tick it.\n";
    ok("a lane's own task, and brief lines that share a few words, are not a handover's chain", parentOf(atlas, led, brief) === null, parentOf(atlas, led, brief));
    ok("…but the handover's own task line still is", parentOf(atlas, led, brief.replace("Report the Meta template status of atlas broker invite, read only.", led.handoffs[0].text)) === led.handoffs[0], "");
  }
  ok("…to ops, which has no task list: not started, and the agent that asked is told, and where it waits", e7 && e7.status === "error" && /handovers in a row[^.]*the same job coming round again/.test(e7.error) && /on Home for the user to start or skip/.test(e7.error) && calls.act.length === acts6, e7);
  {
    // past MAX_CHAIN, a different job is new work, not a loop: it starts (bookly's deploy to ops errored at chain 8, 16 Oct 2026)
    put(deep, "HANDOFF.md", "### ChatApp\nNew job: add the JDK 21 path to the Android build's settings.\n");
    const runs8 = calls.run.length; lanesTick(deps());
    const e9 = loadLedger().handoffs.find((h) => h.from.path === deep && /JDK 21/.test(h.text));
    ok("past the chain limit, a different job still starts, and names the handover it came from", e9 && e9.chain === MAX_CHAIN + 1 && e9.status !== "error" && e9.status !== "blocked" && e9.parent === "p2" && calls.run.slice(runs8).some((x) => x.p === e9.to.path), e9);
    const { ancestry, loops } = await import("../lanes.mjs");
    const led = { handoffs: [{ id: "a1", text: "Restart the relay on prod-box.", chain: 1 }, { id: "a2", parent: "a1", text: "Fix the relay's crash in the code.", chain: 2 }, { id: "a3", parent: "a2", text: "Put the relay fix live.", chain: 3 }] };
    ok("ancestry: the handovers a chain came through, newest first", ancestry(led.handoffs[2], led).map((h) => h.id).join() === "a3,a2,a1", ancestry(led.handoffs[2], led).map((h) => h.id));
    ok("loops: only past the limit, and the same job coming round again; past three times the limit, anything", !loops("New job: restart the relay on prod-box", MAX_CHAIN, ancestry(led.handoffs[2], led)) && loops("New job: restart the relay on prod-box", MAX_CHAIN + 1, ancestry(led.handoffs[2], led)) && !loops("Renew the SSL certificate for atlas.example.com", MAX_CHAIN + 1, ancestry(led.handoffs[2], led)) && loops("Renew the SSL certificate for atlas.example.com", MAX_CHAIN * 3 + 1, []), "");
  }
  // a later, unrelated job in that folder starts a chain of its own (the old rows into it aren't its parent)
  put(deep, "TASKS.md", "The user asked Symbiot for this:\n\n> Renew the SSL certificate for atlas.example.com before it lapses.\n\n## Tasks\n- [ ] Renew the SSL certificate for atlas.example.com before it lapses.\n");
  put(deep, "HANDOFF.md", "### ChatApp\nAdd the renewed certificate's date to the status page.\n");
  const runs7 = calls.run.length; lanesTick(deps());
  const e8 = loadLedger().handoffs.find((h) => h.from.path === deep && /renewed certificate/.test(h.text));
  ok("a new job in a folder that once took a long chain starts fresh: chain 1, and its lane is started", e8 && e8.chain === 1 && e8.status !== "error" && e8.status !== "blocked" && calls.run.length > runs7, e8);
  ok("the ledger is yours only (0600)", existsSync(join(CFG, "lanes.json")) && (await import("node:fs")).statSync(join(CFG, "lanes.json")).mode % 0o1000 === 0o600, "");

  console.log("ONE ROW FOR WHAT READS THE SAME — a run that handed it over twice");
  const L2 = JSON.parse(readFileSync(join(CFG, "lanes.json"), "utf8")), run2 = { lane: "ops", path: join(CFG, "drafts", "act-1d727d7f") }, sym = { lane: "symbiot", path: "/s" };
  L2.handoffs.push({ id: "d1", key: "d1", from: run2, to: sym, text: "Three gaps found while turning the company folder into memory.\n1. one", at: Date.now() - 2000, chain: 1, status: "done" },
    { id: "d2", key: "d2", from: run2, to: sym, text: "Three gaps found while turning the company folder into memory.\n1. one, in other words", at: Date.now() - 1000, chain: 1, status: "started" },
    { id: "d3", key: "d3", from: run2, to: { lane: "atlas", path: atlas }, text: "Three gaps found while turning the company folder into memory.", at: Date.now(), chain: 1, status: "done" });
  writeFileSync(join(CFG, "lanes.json"), JSON.stringify(L2));
  const rows = lanesState().handoffs.filter((h) => /^Three gaps/.test(h.text));
  ok("the same first line from one lane to the same lane: one row, the newest, said twice", rows.length === 2 && rows.find((h) => h.to === "symbiot").id === "d2" && rows.find((h) => h.to === "symbiot").times === 2, rows);
  ok("…the same words to another lane stay a row of their own", rows.find((h) => h.to === "atlas").times === 1, rows);

  console.log("ABOUT THIS ONE — a repo run's last words cover its whole brief; only the part about the handover goes back");
  const said = "I finished 7 of the 8 items.\n- **Home:** a needs-you band at the top, with blobs.\n- **Posts:** hidden on the Dashboard until it can draft.\n- **Company folder checks:** checks.mjs flags commitments on leave days, scored against the company audit.";
  ok("the lines sharing the handover's words, not the rest", aboutIt(said, "Cross-file checks for the company folder: score them against the company audit") === "- **Company folder checks:** checks.mjs flags commitments on leave days, scored against the company audit.", aboutIt(said, "Cross-file checks for the company folder: score them against the company audit"));
  ok("nothing about it: nothing", aboutIt(said, "Four gaps found while turning the user's knowledge into memory, reports wanted") === "", aboutIt(said, "Four gaps found while turning the user's knowledge into memory, reports wanted"));
  put(ghost, "HANDOFF.md", "### atlas\nBuild the release APK and sign it with the new key.\n");
  const L3 = JSON.parse(readFileSync(join(CFG, "lanes.json"), "utf8"));
  L3.handoffs.push({ id: "w", key: "w", from: { lane: "ChatApp", path: ghost }, to: { lane: "ops", path: opsDir }, text: "Move the folder `CallForge AI` to `bookly`.\nWhy: the rename.", at: Date.now(), chain: 1, status: "started" });
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
  // from ops itself there's nowhere to send a lane that doesn't exist: an error, and a card to start it as a run of its own
  const pay = join(CFG, "drafts", "act-pay"); mkdirSync(join(pay, ".symbiot"), { recursive: true }); put(pay, "HANDOFF.md", "### payroll\nRun payroll.\n"); lanesTick(deps());
  const nowhere = loadLedger().handoffs.find((h) => h.from.path === pay && h.to.lane === "payroll");
  const sp = nowhere && stuckHandovers().find((x) => x.id === nowhere.id);
  ok("a lane that doesn't exist, from ops: start it as a run of its own?", sp && /^ops's handover didn't start \(There's no lane called payroll\)\. Start it as a run of its own\?$/.test(sp.q) && sp.options[0] === "Start it (recommended)", sp || nowhere);
  ok("Skip: it stops asking, and its agent reads that you skipped it", skipHandover(nowhere.id).ok && !stuckHandovers().some((x) => x.id === nowhere.id) && /Handed over to payroll: Run payroll\.\nThe user skipped it/.test(read(pay, "ANSWERS.md")), read(pay, "ANSWERS.md").slice(-200));
  const L4 = JSON.parse(readFileSync(join(CFG, "lanes.json"), "utf8")), t0 = Date.now() - 60000;
  L4.handoffs.push({ id: "e-old", key: "e-old", from: { lane: "atlas", path: atlas }, to: { lane: "ops", path: "" }, text: "Renew the SSL certificate for atlas.example.com before it lapses.", at: Date.now() - 4 * 86400000, chain: 1, status: "error", error: "x" },
    { id: "e-done", key: "e-done", from: { lane: "atlas", path: atlas }, to: { lane: "atlas", path: "" }, text: "Rotate the staging database password and update the vault entry.", at: t0, chain: 1, status: "error", error: "atlas is your own lane: do it yourself." },
    { id: "e-later", key: "e-later", from: { lane: "atlas", path: atlas }, to: { lane: "ops", path: opsDir }, text: "Rotate the staging database password, then update the vault entry for it.", at: t0 + 1000, chain: 1, status: "done", reportedAt: t0 + 2000 });
  writeFileSync(join(CFG, "lanes.json"), JSON.stringify(L4));
  const ids = stuckHandovers().map((x) => x.id);
  ok("past it: one from days ago, and one done another way since", !ids.includes("e-old") && !ids.includes("e-done"), ids);

  console.log("WAITS ON YOU — a run that ended leaving you an OK to give, or a step only you can take");
  // the last words of real runs that ended "success" with it only said there, so nothing asked the user
  const remy = "Both parts are done and the task is ticked. The draft isn't sent.\n\n- **Remy's endpoint and secret:** neither is in your mail.\n- **Draft:** it's in Gmail, to remy@example.com, with the right subject.\n- **Cc:** empty, like you said. You'll add Alex yourself.\n\nGemini and Notion need authorizing in your claude.ai connector settings before an agent can use them.";
  const l1 = leftToYou(remy);
  ok("the email to Remy, drafted, not sent: your OK, which draft, and what to check first", l1 && l1.kind === "approve" && /^The draft isn't sent\. Draft: it's in Gmail, to remy@example\.com/.test(l1.what) && l1.check === "Cc: You'll add Alex yourself.", l1);
  const l2 = leftToYou("Nothing left to do here.\n\n- **Reply to Alex:** you picked sending it yourself. The draft is still in drafts, not sent. One catch: the link in it is wrapped in a google.com redirect. Fix that before you send.\n- **Remy:** left alone, you'll tell him.");
  ok("…the reply to Alex you said you'd send: named by its point, with the catch it found", l2 && l2.kind === "approve" && l2.label === "Reply to Alex" && /^Reply to Alex: you picked sending it yourself/.test(l2.what) && l2.check === "One catch: the link in it is wrapped in a google.com redirect. Fix that before you send.", l2);
  const l3 = leftToYou("The fixed URL still isn't live. Running tailscale needs sudo, and only you can do that.\n\nOpen a terminal, paste this, and type your password when it asks:\n\n```\nsudo tailscale up\n```\n\nThat gives the URL.");
  ok("…a sudo step: yours, with what to do, but never the command itself (the user doesn't code)", l3 && l3.kind === "step" && /only you can do that/.test(l3.what) && /type your password when it asks\.$/.test(l3.check) && !/sudo tailscale|`/.test(l3.check), l3);
  // 27 Oct 2026: another lane's last words pointed at its open Workdesk questions, and the card read "They wait on you for."
  const dfy = "I ticked four items and opened PR #596.\n\nTen items stay `[~]`, and none has anything new to act on. They wait on you for `{#kea-realtime-turns}` and `{#ns-switch}` on Workdesk, and on the 10 numbers waiting for your verdict on the speech-to-speech re-test.";
  ok("…pointing at questions already on the Workdesk is no new step (never \"They wait on you for.\")", leftToYou(dfy) === null, leftToYou(dfy));
  const cut = leftToYou("All done. It needs your sign-in for `https://example.com/login`.");
  ok("…nor a sentence that's cut off once its code is taken out", cut === null || !/\bfor\.?$/.test(cut.what), cut);
  ok("…cut off on \"for\" is a fragment, a question that ends on \"with\" isn't", dangles("They wait on you for.") && dangles("It waits on your OK for **") && !dangles("Which account should I sign in with?") && !dangles("Only you can do that."));
  // 24 Oct 2026: "Not checked: … because the membrane blocks me from reading them. To compare them yourself: diff <(jq -S . ~/.config/…)" was the card's check
  const blk = "Changes 7 and 8 are in.\n\n- **Not checked:** the settings and vault files before and after 05:44, because the membrane blocks me from reading them. To compare them yourself: diff <(jq -S . ~/.cfg/a.json.bak) <(jq -S . ~/.cfg/a.json)\n- **Email:** the draft to Dana isn't sent yet.";
  const l4 = leftToYou(blk);
  ok("a card never hands the user a command: a 'compare them yourself' with one isn't its check", l4 && /Dana/.test(l4.what) && !/diff|jq|~\/|yourself/.test(l4.check + l4.what), l4);
  ok("…nor a path or a command in its own sentence", !/`|npm login/.test((leftToYou("- **Key:** only you can paste it: run `npm login` in a terminal.") || {}).what || "`"));
  const { blockedChecks, blockedHandover } = await import("../handover.mjs");
  const bc = blockedChecks(blk);
  ok("a check its run couldn't make because the membrane stopped it reading is found, without the command", bc.length === 1 && /membrane blocks me from reading them\.$/.test(bc[0].what) && !/diff|jq/.test(bc[0].what), bc);
  ok("…not one with no block in it, nor one it handed to ops already", !blockedChecks("- **Not checked:** iPhone (none connected).").length && !blockedChecks("- **Not checked:** the vault, as the sandbox stops me reading it; I handed it to ops.").length);
  ok("…and its handover asks ops for names only in the vault, and no commands for the user", /compare entry names only/.test(blockedHandover("x", "y")) && /no commands or file paths/.test(blockedHandover("x", "y")));
  {
    const { handBlocked } = await import("../agents.mjs");
    const lane = join(HOME, "blk-lane"); mkdirSync(join(lane, ".symbiot"), { recursive: true });
    const n1 = handBlocked(lane, { final: blk }), md = readFileSync(join(lane, ".symbiot", "HANDOFF.md"), "utf8"), n2 = handBlocked(lane, { final: blk });
    ok("a run that ends with such a check hands it to ops by itself, once", n1 === 1 && n2 === 0 && parseHandoffs(md).length === 1 && parseHandoffs(md)[0].lane === "ops" && /blk-lane lane's run/.test(md) && !/diff|jq/.test(md), [n1, n2, md]);
    const act = join(CFG, "drafts", "act-blk"); mkdirSync(join(act, ".symbiot"), { recursive: true });
    ok("…but not from an ops run: what ops can't read, nothing can", handBlocked(act, { final: blk }) === 0 && !existsSync(join(act, ".symbiot", "HANDOFF.md")));
  }
  const none = ["I sent the email to Alex (2:19pm, it's in Sent).", "Done. Nothing was sent, since you said you'll drag it into your chat yourself.", "The Gemini and Notion connectors need authorizing in your claude.ai connector settings before an agent can use them.", "**Forwarding code removal:** done in whatsapp_module and waiting for your review.", "All 39 registers moved.", ""];
  ok("…not what's done, a connector to sign in to (Home has those), or an Approve waiting in Tasks", none.every((t) => leftToYou(t) === null), none.map(leftToYou));
  const feat = "I finished 4 of the 5 open items.\n\n- **Marketing lane:** It's lit amber with a count when something needs you: its agent's questions (also shown as blobs under Needs you), its work waiting for your OK, and the week's drafts. Clicking it opens the Marketing page with those lit at the top.";
  ok("…nor a feature it describes (\"lit amber when something needs you: work waiting for your OK\")", leftToYou(feat) === null, leftToYou(feat));
  ok("…while a held draft still counts, with a \"when\" after it", (leftToYou("The draft isn't sent. Send it when you're happy with it.") || {}).kind === "approve", leftToYou("The draft isn't sent. Send it when you're happy with it."));
  ok("the brief: what waits on the user's OK goes in QUESTIONS.md with what to check first, never only in the last message", /Whatever waits on the user's OK \(sending, posting, deleting, paying, closing\)[^.]*goes in QUESTIONS\.md as a question, with what they should check first[^.]*never only in your last message/.test(ONLY_YOU), "");
  const pc = leftToYou("The commit and push didn't happen. The three changes are still uncommitted, and waiting for you to commit and push them: `git add -A && git commit`, then `git push origin main`.");
  ok("…local git work left in its last words (commit, push) is an OK for its agent to do it, never a step only you can take", pc && pc.kind === "approve", pc);
  ok("…git work is told apart from what needs who you are (a password, a token, signing in)", gitWork("git push origin main") && gitWork("Commit the fix and push it to main") && gitWork("pull the latest from origin") && !gitWork("type your GitHub password when git push asks") && !gitWork("sign in to gh, then push the branch") && !gitWork("paste the token into .env"), "");
  // the card a failed CI run left (paperclip-robin, 2026-10-08): paste git commands into a terminal yourself
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
  const ml = agentsMail(["👤 You (only you: your email): accept GitHub's transfer email for PatGhostai/symbiot (recommended)", "Leave it"], ["gmail"]);
  ok("accepting an email is the agent's when the mailbox is linked, asking OK first", /^🤖 Agent: accept GitHub's transfer email.*linked mailbox.*OK on the Workdesk.*\(recommended\)$/.test(ml[0]) && ml[1] === "Leave it", ml);
  ok("…yours when no mailbox is linked", /^👤/.test(agentsMail(["👤 You: accept GitHub's transfer email"], [])[0]), "");
  ok("…and a password or code in the mail stays yours", /^👤/.test(agentsMail(["👤 You (only you: an SMS code): open the email and type the code"], ["gmail"])[0]), "");
  // the Marketing card (the [Robin] series, 2026-10-08), with LinkedIn linked in Symbiot's browser
  const mk = ["👤 You (only you: your linkedin): schedule all three now in linkedin's scheduler, 08:00 on tue 13, 20 and 27 oct. paste each post's text and attach its card (recommended)", "👤 You (only you: your linkedin): schedule only week 2 now and approve 3 and 4 one at a time"];
  const mp = agentsPosting(mk, ["github", "linkedin"]);
  ok("posting, scheduling or pasting on a linked platform is never \"only you\": the agent's, once you approve its preview", mp.every((o) => /^🤖 Agent: schedule/.test(o) && /once you approve its preview on the Workdesk/.test(o)) && /\(recommended\)$/.test(mp[0]) && !mp.some((o) => /only you/.test(o)), mp);
  ok("…signing in to it stays yours", /^👤/.test(agentsPosting(["👤 You (only you: your linkedin sign-in): sign in once on linkedin's own page"], ["linkedin"])[0]), "");
  ok("…and so does a platform that isn't linked in Symbiot", agentsPosting(mk, ["github"]).join() === mk.join(), "");
  // the poster card (2026-10-08): "let a poster on this computer put the robin posts up for you?", LinkedIn linked
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
  const actJ = join(CFG, "drafts", "act-remy"), tAgo = Date.now() - 3600000;
  put(actJ, "TASKS.md", "- [x] Draft an email to Remy, cc Alex, asking for the WA_FORWARD_URL endpoint and WA_FORWARD_SECRET\n"); streamed(actJ, tAgo, remy);
  noted({ path: actJ, name: "Agent: Draft an email to Remy", startedAt: tAgo });
  const needsOn = (p) => { const a = agentsList().find((x) => x.path === p); return a && a.needs; };
  const nj = needsOn(actJ);
  ok("a past run (before Symbiot last started) that left the draft for your OK is listed, needing you", nj && nj.kind === "approve" && /The draft isn't sent/.test(nj.what) && nj.check === "Cc: You'll add Alex yourself." && nj.key, nj);
  const actJ2 = join(CFG, "drafts", "act-jono2");
  put(actJ2, "TASKS.md", "- [x] Draft an email to Remy, cc Alex, asking for the WA_FORWARD_URL endpoint and WA_FORWARD_SECRET\n"); streamed(actJ2, Date.now(), "Sent it to Remy at 10:48.");
  noted({ path: actJ2, name: "Agent: Draft an email to Remy", startedAt: Date.now() + 1000 });
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
  streamed(actT, Date.now(), "The draft to Alex isn't sent: it waits for your OK.");
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
  ok("your AI reads the last words of the finished runs the patterns didn't catch (Acme's, and \"Sent it to Remy\"), not the ones they did", rw1.read === 2 && aiAsked.some((p) => p.includes("give me the word")) && aiAsked.some((p) => p.includes("Sent it to Remy")) && !aiAsked.some((p) => /isn't sent/.test(p)), [rw1, aiAsked.map((p) => p.slice(0, 80))]);
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
    // bookly, 12 Oct 2026: "New job, not a replacement: restart Wren…" queued behind a 40-minute run on the earlier one
    going = new Set([sOps]); led.handoffs.length = 0; acts.length = 0;
    put(asker, "HANDOFF.md", "### ops\n" + v1 + "\n"); dispatch(asker, sd());
    put(asker, "HANDOFF.md", "### ops\nNew job, not a replacement: " + v2 + "\n"); dispatch(asker, sd());
    ok("a handover that says it's a new job, not a replacement: a run of its own, even when it reads alike", acts.length === 2 && refreshed.length === 0 && led.handoffs.length === 2, { acts, refreshed });
    going = new Set();
    led.handoffs.length = 0;
    put(asker, "HANDOFF.md", "### atlas\n" + v1 + "\n"); dispatch(asker, sd());
    put(asker, "HANDOFF.md", "### atlas\n" + v2 + "\n"); const r2 = dispatch(asker, sd({ tasks: [{ id: "t1" }] }));
    ok("a repo lane, its task still open: the old task gives way to the new one, one row", drops[0] === "t1" && adds.length === 2 && adds[1].text === v2 && led.handoffs.length === 1 && led.handoffs[0].task === "t2" && r2[0].status === "held", { drops, adds, led: led.handoffs });
  }

  console.log("A REPLACEMENT'S SENT LINE — names the run it waits on, and says when that run starts on it");
  {
    // bookly, 12 Oct 2026: "ops's run on that one gets it when it ends" named no run and never changed. Its agent
    // checked an ops run that had ended, decided nothing had started, and sent the Wren brief again
    const asker = lane("kea-asker"), kOps = join(CFG, "drafts", "act-ca0f866a"); mkdirSync(join(kOps, ".symbiot"), { recursive: true });
    const kmap = { ...map, "kea-asker": asker }, led = { handoffs: [] }; let going = new Set();
    const kd = () => ({ map: kmap, ledger: led, now: Date.now(), running: (p) => going.has(p), tasks: () => [], refresh: () => ({ ok: true }),
      act: () => ({ ok: true, job: "k1", dir: kOps }) });
    const k1 = "Wren, the site assistant on prod-box: put the deployed corpus live, then drop her cached answers that quote the old price.";
    const k2 = "Wren, the site assistant on prod-box: put the deployed corpus live, then drop her cached answers that quote the old price, and check www.";
    put(asker, "HANDOFF.md", "### ops\n" + k1 + "\n"); dispatch(asker, kd()); ran(kOps, Date.now() - 1000, "");
    going = new Set([kOps]); put(asker, "HANDOFF.md", "### ops\n" + k2 + "\n"); dispatch(asker, kd());
    const waits = read(asker, "HANDOFF.md").split("\n").filter((l) => /^- /.test(l))[0];
    ok("while the run on the earlier version goes, the Sent line names it", /replaces the version sent earlier: ops's run act-ca0f866a is on that one, and gets this when that run ends\. "Wren/.test(waits), waits);
    const L0 = loadLedger(); writeFileSync(join(CFG, "lanes.json"), JSON.stringify({ handoffs: [...L0.handoffs, ...led.handoffs] }));
    lanesTick({ ...deps(), map: {}, running: () => true, run: () => ({ busy: true }) });
    ok("…nothing changes while that run is still on the earlier version", read(asker, "HANDOFF.md").split("\n").filter((l) => /^- /.test(l))[0] === waits, read(asker, "HANDOFF.md"));
    const began = Date.now() + 5; ran(kOps, began, "");
    lanesTick({ ...deps(), map: {}, running: () => true, run: () => ({ busy: true }) });
    const now3 = read(asker, "HANDOFF.md").split("\n").filter((l) => /^- /.test(l));
    ok("…once a run there starts on it, the Sent line says so, and when", new RegExp(`replaces the version sent earlier: ops's run act-ca0f866a started on it at ${new Date(began).toTimeString().slice(0, 5)}\\. "Wren`).test(now3[0])&& now3.length === 1 && /^# Handovers: sent/.test(read(asker, "HANDOFF.md")), now3);
    ok("…and remembers it did", !!loadLedger().handoffs.find((x) => x.to.path === kOps && x.pickedAt === began), "");
    writeFileSync(join(CFG, "lanes.json"), JSON.stringify(L0));
  }

  console.log("TWO OPS RUNS ON ONE JOB — an addition goes to the run on it; a new run is told what's going");
  {
    // bookly, 12 Oct 2026: "resume the blocked jobs", then "an addition to the 12:51 brief", each a run of its own,
    // texting the user PINs in turn and overwriting each other's audit sections
    const dl = lane("bookly"), dmap = { ...map, bookly: dl }, first = join(CFG, "drafts", "act-0a1b2c3d"), other = join(CFG, "drafts", "act-99887766");
    for (const p of [first, other]) mkdirSync(join(p, ".symbiot"), { recursive: true });
    writeFileSync(join(other, ".symbiot", "handoff.json"), JSON.stringify({ name: "Agent: **Read-only audit for moving production Bookly…" }));
    const led = { handoffs: [] }, acts = []; let going = new Set([other]);
    const dd = (extra = {}) => ({ map: dmap, ledger: led, now: Date.now(), running: (p) => going.has(p), tasks: () => [], dirs: [first, other],
      act: (text, o) => { acts.push({ text, o }); return { ok: true, job: "d" + acts.length, dir: first }; }, ...extra });
    const resume = "**Resume the bookly.co.za jobs that were blocked on sign-ins.** The user is signed in to domains.co.za in the Symbiot browser.";
    put(dl, "HANDOFF.md", "### ops\n" + resume + "\n"); dispatch(dl, dd());
    const told = acts[0].o.alongside || "";
    ok("a new ops run while another is going: its brief lists that run, by folder", /^## Other ops runs going now/.test(told) && /`act-99887766` \(~\/\.config\/symbiot\/drafts\/act-99887766\): "Read-only audit for moving production Bookly…"/.test(told), told);
    ok("…and says not to redo its steps or spoil its sign-in, to add to a shared file without rewriting it, and to check before crediting the user", /don't redo its steps/.test(told) && /new PIN/.test(told) && /never rewrite or delete what another run wrote/.test(told) && /rather than guessing it was the user/.test(told), told);
    ok("…the brief carries it, above its task", (() => { const b = actBrief("x", { alongside: told }); return b.indexOf("## Other ops runs going now") > 0 && b.indexOf("## Other ops runs going now") < b.indexOf("## Tasks"); })(), "");
    const sent = read(dl, "HANDOFF.md");
    ok("HANDOFF.md's Sent line names the run, so a follow-up can name it too", /ops's agent started on it, as run act-0a1b2c3d/.test(sent), sent);
    going = new Set([first, other]); led.handoffs[0].at = Date.now() - 60000; ran(first, Date.now() - 50000, "");
    const sudo = "**Addition to run act-0a1b2c3d (resume the blocked jobs): the user has OK'd sudo on prod-box for these steps.**";
    put(first, "TASKS.next.md", ""); put(dl, "HANDOFF.md", sent + "\n### ops\n" + sudo + "\n");
    const s2 = dispatch(dl, dd());
    ok("an addition naming that run, while it runs: no second run, one ledger row", acts.length === 1 && s2.length === 1 && led.handoffs.length === 1 && led.handoffs[0].added === 1 && led.handoffs[0].text === resume, { acts: acts.length, led: led.handoffs });
    ok("…it waits in that run's folder for when it ends, and its ANSWERS.md says it adds to the work, not replaces it", /OK'd sudo on prod-box/.test(read(first, "TASKS.next.md")) && /### More from bookly while you ran/.test(read(first, "ANSWERS.md")) && /doesn't replace it/.test(read(first, "ANSWERS.md")), [read(first, "TASKS.next.md").slice(0, 300), read(first, "ANSWERS.md")]);
    const sent2 = read(dl, "HANDOFF.md");
    ok("…the Sent list says where it went, the first line still the run on it", /added to act-0a1b2c3d, the ops run already on what it adds to/.test(sent2.split("\n").filter((l) => /^- /.test(l))[0]) && /started on it, as run act-0a1b2c3d/.test(sent2), sent2);
    ok("…the block says the run is on it, and does the addition when it's through", /act-0a1b2c3d is on it now, and does what you added/.test(handingOf(dl, { map: dmap, ledger: led, running: (p) => going.has(p), work: () => ({}) })[0].why), handingOf(dl, { map: dmap, ledger: led, running: (p) => going.has(p), work: () => ({}) }));
    ok("…not picked up again", dispatch(dl, dd()).length === 0 && acts.length === 1, acts.length);
    const job6 = "**Add to act-0a1b2c3d: run job 6 in BOOKLY-DOMAIN-MOVE-OPS-JOBS.md now.** The user OK'd it.";
    put(dl, "HANDOFF.md", read(dl, "HANDOFF.md") + "\n### ops\n" + job6 + "\n"); dispatch(dl, dd());
    const held = read(first, "TASKS.next.md");
    ok("a second addition before the run ends joins the first, not replaces it", acts.length === 1 && /OK'd sudo on prod-box/.test(held) && /run job 6/.test(held) && led.handoffs[0].added === 2, held.slice(0, 600));
    ok("…not reported back when the run that was going ends: the additions haven't run yet", outcome(led.handoffs[0], { running: () => false, tasks: [] }) === null, led.handoffs[0]);
    going = new Set([first]);
    const tailEnd = "### ops\nAdd to act-0a1b2c3d: also check www.";
    put(dl, "HANDOFF.md", tailEnd + "\n"); led.handoffs[0].reportedAt = Date.now();
    dispatch(dl, dd());
    ok("a run that already came back still takes the addition, in its own folder: no second run beside it (22 Oct 2026)", acts.length === 1 && /also check www/.test(read(first, "TASKS.next.md")), acts.length);
    going = new Set(); const runs0 = calls.run.length;
    put(dl, "HANDOFF.md", "### ops\nAdd to run act-0a1b2c3d (do not start a second copy): and the apex too.\n");
    const s3 = dispatch(dl, dd({ run: (p) => { calls.run.push(p); return { id: "r" + calls.run.length }; } }));
    ok("…and once its run has ended, the addition lands in that folder and its run starts there again, no new folder", acts.length === 1 && s3.length === 1 && calls.run.slice(runs0).includes(first) && /and the apex too/.test(read(first, "TASKS.md")), { acts: acts.length, runs: calls.run.slice(runs0), s3 });
    led.handoffs.length = 0; acts.length = 0; going = new Set();
    put(dl, "HANDOFF.md", "### ops\n" + resume + "\n"); dispatch(dl, dd());
    ok("with no other ops run going, the brief says nothing about others", !acts[0].o.alongside, acts[0].o.alongside);
  }

  console.log("AN OPS RUN THAT WAITS IS STILL ON ITS JOB — what adds to it goes to it, not to a second run beside it");
  {
    // 21 Oct 2026: the phone code check's run waited on the user's answer, and "Adds to run act-ab2bbaf1…", "Re-run the phone
    // code check…" and "Finish ops's phone code check…" (from Reports) each started a run of its own: test cards on the phone from three at once
    const sy = lane("symbiot"), smap = { ...map, symbiot: sy }, check = join(CFG, "drafts", "act-ab2bbaf1"), done = join(CFG, "drafts", "act-0d0e0f10"), theirs = join(CFG, "drafts", "act-7e7e7e7e");
    for (const p of [check, done, theirs]) mkdirSync(join(p, ".symbiot"), { recursive: true });
    const led = { handoffs: [] }, acts = []; let going = new Set();
    const sd = () => ({ map: smap, ledger: led, now: Date.now(), running: (p) => going.has(p), tasks: () => [], dirs: [check, done, theirs],
      act: (text, o) => { acts.push({ text, o }); return { ok: true, job: "s" + acts.length, dir: acts.length === 1 ? check : join(CFG, "drafts", "act-5" + acts.length + "5" + acts.length + "5" + acts.length + "5" + acts.length) }; } });
    const job = "New job: run the phone code check on the user's phone (Wed 21 Oct 2026, for the symbiot lane): scripts/phone-codes-check.mjs on the Galaxy A26, a fake code from a made-up site only.";
    put(sy, "HANDOFF.md", "### ops\n" + job + "\n"); dispatch(sy, sd());
    put(check, "TASKS.md", "# For your agent\n## Tasks\n- [ ] " + job + "\n"); put(check, "QUESTIONS.md", "## Questions\n### Can you wake your phone and keep its screen on, so I can put the check card up?\nThe phone answers adb only while it's awake.\n- 👤 You (only you: your phone): it's awake, go ahead\n- Skip this part\n");
    led.handoffs[0].at = Date.now() - 60000; ran(check, Date.now() - 50000, "Waiting for the user to wake the phone.");
    const adds = "Adds to run act-ab2bbaf1 (the phone code check, for the symbiot lane): both findings from your re-run are fixed in the checkout, so re-run the check.";
    put(sy, "HANDOFF.md", read(sy, "HANDOFF.md") + "\n### ops\n" + adds + "\n"); const a1 = dispatch(sy, sd());
    ok("an addition naming a run that waits on the user, not running: no second run, it's that run's", acts.length === 1 && a1.length === 1 && led.handoffs.length === 1 && led.handoffs[0].added === 1, { acts: acts.length, led: led.handoffs });
    ok("…its brief has it now (the run isn't going, so nothing holds it back), and its ANSWERS.md says it adds to the job", /both findings from your re-run are fixed/.test(read(check, "TASKS.md")) && !read(check, "TASKS.next.md") && /### More from symbiot while you ran/.test(read(check, "ANSWERS.md")), [read(check, "TASKS.md").slice(-300), read(check, "ANSWERS.md")]);
    const rerun = "Re-run the phone code check on the user's Galaxy A26 (already paired over Wi-Fi with adb wireless debugging; no cable), with the fixed check script.";
    put(sy, "HANDOFF.md", read(sy, "HANDOFF.md") + "\n### ops\n" + rerun + "\n"); dispatch(sy, sd());
    ok("one that names no run but is about the job that run is on: an addition to it too", acts.length === 1 && led.handoffs.length === 1 && led.handoffs[0].added === 2 && /Galaxy A26/.test(read(check, "TASKS.md")), { acts: acts.length, led: led.handoffs.length });
    put(sy, "HANDOFF.md", read(sy, "HANDOFF.md") + "\n### ops\nNew job: re-run the phone code check on the user's tablet, a separate check of its own.\n"); dispatch(sy, sd());
    ok("…but one that says it's a new job starts a run of its own", acts.length === 2 && led.handoffs.length === 2, acts.length);
    put(theirs, "TASKS.md", "# For your agent\n## Tasks\n- [~] Find the phone over adb (waits on: the user waking the phone)\n");
    put(sy, "HANDOFF.md", read(sy, "HANDOFF.md") + "\n### ops\nAdds to run act-7e7e7e7e: the phone is awake now.\n"); const a3 = dispatch(sy, sd());
    ok("a run someone else started, waiting on an item marked [~]: named, it takes the addition, on a row of the asker's own", acts.length === 2 && a3.length === 1 && a3[0].to.path === theirs && a3[0].from.path === sy && led.handoffs.length === 3 && /the phone is awake now/.test(read(theirs, "TASKS.md")), a3);
    put(done, "TASKS.md", "# For your agent\n## Tasks\n- [x] Check the phone's battery\n");
    put(sy, "HANDOFF.md", read(sy, "HANDOFF.md") + "\n### ops\nAdds to run act-0d0e0f10: check its storage too.\n"); dispatch(sy, sd());
    ok("a run that has finished (nothing open, nothing waiting) takes none: that starts a run of its own", acts.length === 3, acts.length);
    const { actNow } = await import("../mind.mjs"), started = [], cfgFile = join(CFG, "config.json");
    let cfg0 = null; try { cfg0 = readFileSync(cfgFile, "utf8"); } catch {}
    writeFileSync(cfgFile, JSON.stringify({ ...(cfg0 ? JSON.parse(cfg0) : {}), agentCmd: "claude -p {prompt}" }));
    const r = actNow("Finish ops's phone code check (report: " + join(check, ".symbiot", "PHONE-CODE-CHECK-PROGRESS.md") + ", read it first).", { title: "Reports", run: (p, o) => { started.push([p, o]); return { id: "job-r" }; } });
    ok("a request from a chat naming that run's folder goes to that run, started there, not a new folder", r.ok && r.added && r.dir === check && started.length === 1 && started[0][0] === check && /Finish ops's phone code check/.test(read(check, "TASKS.md")) && /### More for you, from Reports/.test(read(check, "ANSWERS.md")), [r, started]);
    if (cfg0 === null) rmSync(cfgFile, { force: true }); else writeFileSync(cfgFile, cfg0);
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
    const v2 = "**What's needed:** set up Meta's free test number for the WhatsApp module in a new ACMEINC account and put its credentials in .env.";
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
    ok("…and the list now has both, newest first, and nothing left to send", parseHandoffs(sent2).length === 0 && /replaces the version sent earlier: ops's run act-wa is on that one, and gets this when that run ends\. "What's needed: set up Meta's free test number for the WhatsApp module in a new ACMEINC/.test(sent2.split("\n").filter((l) => /^- /.test(l))[0]) && sent2.split("\n").filter((l) => /^- /.test(l)).length === 2, sent2);
    going = new Set(); led.handoffs[0].at = Date.now(); // the new brief started once the run ended
    ran(wOps, Date.now() + 20, ""); going = new Set([wOps]);
    ok("…once it ends and starts on the new version: sent, on it now", hv()[0].gone && /on it now/.test(hv()[0].why), hv());
    going = new Set(); put(wOps, "QUESTIONS.md", "## Questions\n### The code Meta sent?\nwhy\n- paste it (recommended)\n- not yet\n");
    ok("…its run ended asking you: sent, and it asked you first", /asked you something first/.test(hv()[0].why), hv());
    led.handoffs[0].reportedAt = Date.now(); led.handoffs[0].status = "done";
    ok("…and once it came back: nothing waiting", hv().length === 0, hv());
    put(wa, "HANDOFF.md", "### payroll\nPay the WhatsApp bill.\n"); const acts0 = acts.length; dispatch(wa, wd());
    const rr = led.handoffs[led.handoffs.length - 1], bad = hv();
    ok("a lane that doesn't exist: ops takes it, told the name, and the block shows it sent to ops", acts.length === acts0 + 1 && rr.to.lane === "ops" && rr.rerouted && rr.rerouted.noLane && bad.length === 1 && bad[0].gone && bad[0].lane === "ops", [rr, bad]);
    ok("…its file says so too", /→ \*\*ops\*\*: sent to ops instead of payroll \(there's no lane called payroll\)/.test(read(wa, "HANDOFF.md")), read(wa, "HANDOFF.md"));
    rr.reportedAt = Date.now(); rr.status = "done";
    ok("…and once it came back: nothing waiting", hv().length === 0, hv());
    put(wa, "HANDOFF.md", "### atlas\nAdd the WhatsApp webhook route to atlas.\n");
    dispatch(wa, { ...wd(), add: () => ({ id: "c1" }), push: () => ({}), run: () => ({ busy: true }) }); going = new Set([atlas]);
    const q = hv();
    ok("a repo lane that's busy: sent, and queued until that run ends", q.length === 1 && q[0].gone && /^Sent, and queued: atlas's agent is busy/.test(q[0].why), q);
    ok("…its file: queued in atlas", /→ \*\*atlas\*\*: queued in atlas: its agent was busy/.test(read(wa, "HANDOFF.md")), read(wa, "HANDOFF.md"));
    put(wa, "HANDOFF.md", "### ops\nFind a JDK 17.\n### atlas\nAdd the WhatsApp webhook route to atlas.\n");
    const half = read(wa, "HANDOFF.md");
    ok("the file changed by its agent while a pass ran: left as it is, for the next pass", (() => { const ledg = { handoffs: [] }; dispatch(wa, { ...wd(), ledger: ledg, act: () => { put(wa, "HANDOFF.md", half + "### ChatApp\nRebuild the APK.\n"); return { ok: true, job: "x", dir: wOps }; }, add: () => ({ id: "c2" }), push: () => ({}), run: () => ({ id: "r" }) }); return parseHandoffs(read(wa, "HANDOFF.md")).length === 3; })(), read(wa, "HANDOFF.md"));
    put(wa, "HANDOFF.md", "");
    led.handoffs.length = 0;
    ok("nothing handed over: nothing", handingOf(wa, { map: wmap, ledger: led }).length === 0, "");
    // symbiot → steve → ops (25 Oct 2026): the chain was hard to follow on Home's card
    const t0 = Date.now() - 60000, two = { handoffs: [
      { from: { path: wa }, to: { lane: "atlas", path: atlas }, at: t0, status: "sent", key: "k1", text: "Check the server" },
      { from: { path: atlas }, to: { lane: "ops", path: wOps }, at: t0 + 1000, status: "sent", key: "k2", text: "Read the server's log" }] };
    const chain = handingOf(wa, { map: wmap, ledger: two, running: () => false });
    ok("handed on again by the lane it went to: the row names both lanes, and says the second asks you", chain.length === 1 && chain[0].lane === "atlas" && chain[0].then === "ops" && chain[0].thenAsks && chain[0].askLane === "ops" && /asked you something first/.test(chain[0].why), chain);
    rmSync(join(wOps, ".symbiot", "QUESTIONS.md"), { force: true });
    const chain2 = handingOf(wa, { map: wmap, ledger: two, running: () => false });
    ok("…with no question there: both lanes named, no Answer", chain2.length === 1 && chain2[0].then === "ops" && !chain2[0].askLane, chain2);
  }
  console.log("ONE ANSWER, EVERY AGENT ON THAT WORK — Pat answered orbit_avm's data loss three times (13 Oct 2026)");
  {
    const { shareAnswer, sharedFor, sharedTo, answerReaches } = await import("../lanes.mjs");
    const A = await import("../agents.mjs"), { buildTasksMd: brief } = await import("../tasks.mjs");
    const ask = (p, qs, why = "The orbit_avm data, from the read-only checks.") => put(p, "QUESTIONS.md", "## Questions\n" + qs.map((q) => "### " + q + "\n" + why + "\n- 🤖 Agent: do it (recommended)\n- skip it\n").join("\n"));
    // card 1: orbit_platform's read-only investigation; card 2: the ops run it handed prod-box's checks to, one more question queued
    const orbit = lane("orbit_platform"), evraOps = join(CFG, "drafts", "act-evra01"), other = join(CFG, "drafts", "act-evra02"), elsewhere = join(CFG, "drafts", "act-dlfy01"), spent = join(CFG, "drafts", "act-evra03");
    const q1 = "Send the Supabase ticket about orbit_avm now?", q2 = "Check the two shell histories only sudo can read, for an orbit_avm dump?", q3 = "Restore from the orbit_avm snapshot?";
    ask(orbit, [q1]); put(orbit, "TASKS.md", "- [ ] Find out what happened to orbit_avm's data\n");
    ask(evraOps, [q2, "Ask AWS support for the volume's snapshots?"]); put(evraOps, "TASKS.md", "- [ ] Read-only checks on prod-box (203.0.113.20)\n");
    ask(other, [q3]); put(other, "TASKS.md", "- [ ] Restore plan\n");
    ask(elsewhere, ["Move bookly.co.za's DNS now?"], "Its nameservers, for the site."); put(elsewhere, "TASKS.md", "- [ ] DNS\n");
    put(spent, "TASKS.md", "- [x] orbit_avm: list the tables\n"); // finished, nothing open: left alone
    const eLedger = { handoffs: [{ id: "ev1", key: "ev1", from: { lane: "orbit_platform", path: orbit }, to: { lane: "ops", path: evraOps }, text: "Read-only checks on prod-box for the orbit_avm dump", at: Date.now() - 3600000, chain: 1, status: "started" }] };
    const eMap = { ...map, orbit_platform: orbit }, runsList = [orbit, evraOps, other, elsewhere, spent].map((p) => ({ path: p, name: "Agent", startedAt: Date.now() - 600000 }));
    const started = [], o = { ledger: eLedger, runs: () => runsList, running: () => false, map: eMap, run: (p) => { started.push(p); return { id: "j" + started.length }; }, cfg: { profile: { name: "Pat Lee" } } };
    const said = "first check if orbit_avm is saved somewhere else";
    const reach = answerReaches(orbit, q1 + "\n" + said, o);
    ok("an answer to card 1 reaches card 2's agent (a handover links them) and another on orbit_avm, not bookly's or a finished one", reach.map((r) => r.path).sort().join() === [evraOps, other].sort().join() && reach.find((r) => r.path === evraOps).why === "handover" && reach.find((r) => r.path === other).why === "orbit_avm", reach.map((r) => [r.path, r.why]));
    const sh = shareAnswer(orbit, [{ q: q1, a: said }], o);
    const opsAns = read(evraOps, "ANSWERS.md");
    ok("each gets it in its ANSWERS.md: the question, Pat's answer, and to use it and not ask if it settles its own", sh.length === 2 && opsAns.includes(said) && opsAns.includes(q1) && /Pat's answer to orbit_platform/.test(opsAns) && /take that question out of QUESTIONS.md/.test(opsAns) && /answered by Pat's reply to orbit_platform/.test(opsAns) && /ask only the part that's left/.test(opsAns), opsAns);
    ok("…with a question open and no run going, each starts on it and decides", started.sort().join() === [evraOps, other].sort().join() && sh.every((r) => r.started), [started, sh]);
    ok("…the others are left alone", !read(elsewhere, "ANSWERS.md") && !read(spent, "ANSWERS.md"), "");
    // a lane whose open task names orbit_avm, but none of its questions: it gets the answer as background, and isn't started on it
    const bystander = join(CFG, "drafts", "act-evra04"); ask(bystander, ["Which Cloudflare zone?"], "For the DNS."); put(bystander, "TASKS.md", "- [ ] Move orbit_avm's DNS\n");
    started.length = 0;
    const bs = shareAnswer(orbit, [{ q: q1, a: "orbit_avm: check the replica too" }], { ...o, runs: () => [...runsList, { path: bystander }] });
    ok("an answer that matches only a lane's task, not its question, is background: it gets it, nothing starts there", bs.some((r) => r.path === bystander && !r.started) && !started.includes(bystander) && /_shared by Symbiot [^\n]*\(background\)_/.test(read(bystander, "ANSWERS.md")), [bs, started]);
    ok("…while a lane whose question it bears on still starts", started.includes(other) && !/\(background\)/.test(read(other, "ANSWERS.md")), started);
    started.length = 0;
    ok("the same answer again isn't shared twice", shareAnswer(orbit, [{ q: q1, a: said }], o).length === 0 && !started.length && read(evraOps, "ANSWERS.md").split(said).length === 2, "");
    const busyRun = shareAnswer(orbit, [{ q: q1, a: "or set up our own supabase" }], { ...o, running: (p) => p === evraOps });
    ok("an agent at work gets it too, for a question it was about to ask, and isn't started twice", busyRun.some((r) => r.path === evraOps && !r.started) && read(evraOps, "ANSWERS.md").includes("set up our own supabase"), busyRun);
    const card = sharedTo(evraOps, { cfg: o.cfg });
    ok("card 2 on Home says Pat answered orbit_platform on this, and what", card && card.lane === "orbit_platform" && /supabase|orbit_avm/.test(card.a) && card.who === "Pat", card);
    // through the answer itself: Home, the Workdesk and a phone all answer with answerQuestions(…, { share: true })
    writeFileSync(join(CFG, "runs.json"), JSON.stringify(runsList)); writeFileSync(join(CFG, "lanes.json"), JSON.stringify(eLedger));
    put(orbit, "QUESTIONS.md", "## Questions\n### Which Supabase project holds orbit_avm now?\nfor the ticket\n- 🤖 Agent: the old one (recommended)\n- the new one\n");
    put(evraOps, "QUESTIONS.md", "## Questions\n### " + q2 + "\nfor the orbit_avm dump\n- 👤 You (only you: sudo on prod-box): run that one line\n- skip it\n");
    A.onAnswered((p, rows) => shareAnswer(p, rows, { run: () => ({ id: "j" }), map: eMap }));
    const r1 = A.answerQuestions(orbit, [{ q: "Which Supabase project holds orbit_avm now?", a: "the old one, ap-south-1" }], { share: true });
    ok("answering card 1 says it went to card 2's agent too", r1.ok && (r1.also || []).includes("ops"), r1);
    put(orbit, "QUESTIONS.md", "## Questions\n### Which region?\nfor the ticket\n- 🤖 Agent: ap-south-1 (recommended)\n- another\n");
    const r0 = A.answerQuestions(orbit, [{ q: "Which region?", a: "ap-south-1 for orbit_avm" }], {});
    ok("…only the user's answers are shared (not Symbiot's own picks)", r0.ok && !r0.also, r0);
    A.onAnswered(null);
    // before asking anything new: a run that starts on that work later is told what's answered, and every brief says to check
    const more = sharedFor(orbit, "Check the orbit_avm backups on prod-box", { ledger: eLedger, cfg: o.cfg });
    ok("a new run on that work is told what Pat already answered there", /What Pat has already answered on this work/.test(more) && more.includes(said) && /don't ask/.test(more), more);
    calls.act.length = 0; put(orbit, "HANDOFF.md", "### ops\nNew job: check the orbit_avm backups in S3, read-only.\n");
    dispatch(orbit, { ...deps(), map: eMap, ledger: eLedger });
    ok("…a handover on it to ops carries it in its brief", calls.act.length === 1 && String(calls.act[0].o.alongside || "").includes(said), calls.act[0] && calls.act[0].o.alongside);
    ok("and every brief says to read ANSWERS.md again before asking, for answers given to another agent", /Before you ask the user anything, read .\.symbiot\/ANSWERS\.md. again/.test(brief("atlas", {}, [{ id: "1", text: "x", repo: "atlas" }])) && /what this brief says the user has already answered/.test(actBrief("x", { lanes: [] })), "");
    writeFileSync(join(CFG, "lanes.json"), JSON.stringify({ handoffs: [] }));
  }
  // 20 Oct 2026 review, finding 1: over 14 days and two hops every lane linked every other, and each
  // had an old question open, so one answer started them all ("nothing here needed doing")
  // 20 Oct 2026 review, Q4: "why are these under bookly?", "for what project is it?": a card says its project from the record
  console.log("WHICH PROJECT A RUN IS FOR — from the record, never its words");
  {
    const { projectOf } = await import("../lanes.mjs");
    const dl = lane("dlfy_proj"), o1 = join(CFG, "drafts", "act-proj0001"), o2 = join(CFG, "drafts", "act-proj0002"), o3 = join(CFG, "drafts", "act-proj0003"), o4 = join(CFG, "drafts", "act-proj0004");
    for (const p of [o1, o2, o3, o4]) mkdirSync(join(p, ".symbiot"), { recursive: true });
    put(o3, "handoff.json", JSON.stringify({ name: "Agent: the webhook URL", for: "atlas" }));
    put(o4, "handoff.json", JSON.stringify({ name: "Agent: Draft an email to Remy about the bookly invoices" }));
    const led = { handoffs: [
      { id: "p1", from: { lane: "dlfy_proj", path: dl }, to: { lane: "ops", path: o1 }, text: "deploy", at: 1, status: "started" },
      { id: "p2", from: { lane: "ops", path: o1 }, to: { lane: "ops", path: o2 }, text: "a check", at: 2, status: "started" },
    ] }, pm = { dlfy_proj: dl };
    ok("a lane's own folder: that lane", projectOf(dl, { map: pm, ledger: led }) === "dlfy_proj");
    ok("an ops run a lane handed over: that lane", projectOf(o1, { map: pm, ledger: led }) === "dlfy_proj");
    ok("…and one that ops run handed on: still that lane", projectOf(o2, { map: pm, ledger: led }) === "dlfy_proj");
    ok("an ops run chat started for a lane: that lane (handoff.json)", projectOf(o3, { map: pm, ledger: led }) === "atlas");
    ok("one nothing names: no project, though its words say bookly", projectOf(o4, { map: pm, ledger: led }) === "");
  }
  console.log("ONE ANSWER, ONE LANE — old handovers and stale questions start nothing");
  {
    const { shareAnswer, answerReaches, linkedPaths } = await import("../lanes.mjs");
    const ask = (p, q, why) => put(p, "QUESTIONS.md", "## Questions\n### " + q + "\n" + why + "\n- 🤖 Agent: do it (recommended)\n- skip it\n");
    const dl = lane("dlfy_fan"), mk = lane("mkt_fan"), op = join(CFG, "drafts", "act-fan001");
    ask(dl, "Record the consent-screen video now?", "For the review."); put(dl, "TASKS.md", "- [ ] New video with the consent screen\n");
    ask(mk, "Post the week-2 reading on Thursday?", "The 4-week test."); put(mk, "TASKS.md", "- [ ] 4-week test, once a week\n");
    ask(op, "Restart the relay on the box?", "It's slow."); put(op, "TASKS.md", "- [ ] Relay check\n");
    const day = 86400000, at = Date.now();
    const old = { handoffs: [
      { id: "f1", from: { lane: "dlfy_fan", path: dl }, to: { lane: "ops", path: op }, text: "Deploy bookly", at: at - 3 * day, status: "done", reportedAt: at - 2 * day },
      { id: "f2", from: { lane: "mkt_fan", path: mk }, to: { lane: "dlfy_fan", path: dl }, text: "Screenshots for the post", at: at - 4 * day, status: "done", reportedAt: at - 3 * day },
      { id: "f3", from: { lane: "ops", path: op }, to: { lane: "mkt_fan", path: mk }, text: "Copy for the status page", at: at - 5 * day, status: "error" },
    ] };
    const started = [], o = { ledger: old, runs: () => [dl, mk, op].map((p) => ({ path: p })), running: () => false, map: { dlfy_fan: dl, mkt_fan: mk }, run: (p) => { started.push(p); return { id: "j" + started.length }; }, cfg: { profile: { name: "Pat Lee" } } };
    ok("finished handovers link nobody for an answer, though a new run's brief still hears of them", !linkedPaths(dl, { ledger: old, open: true }).length && linkedPaths(dl, { ledger: old }).length === 2, linkedPaths(dl, { ledger: old }));
    const sh = shareAnswer(dl, [{ q: "Record the consent-screen video now?", a: "yes, record it today" }], o);
    ok("one answer to one lane: zero starts anywhere else", !started.length && !sh.some((r) => r.started), [started, sh]);
    ok("…and no other lane's ANSWERS.md is touched", !read(mk, "ANSWERS.md") && !read(op, "ANSWERS.md"), [read(mk, "ANSWERS.md"), read(op, "ANSWERS.md")]);
    // an open handover still links them, but starts the other lane only for a question the answer bears on
    old.handoffs.push({ id: "f4", from: { lane: "dlfy_fan", path: dl }, to: { lane: "ops", path: op }, text: "Upload the video", at: at - 3600000, status: "started" });
    const r2 = answerReaches(dl, "Record the consent-screen video now?\nyes", o);
    ok("an open handover links the lane it went to, one step only", r2.map((r) => r.path).join() === op && r2[0].why === "handover" && !r2[0].asks, r2);
    const s2 = shareAnswer(dl, [{ q: "Record the consent-screen video now?", a: "yes, and keep it under 2 minutes" }], o);
    ok("…it gets the answer as background, and isn't started for a question the answer doesn't touch", s2.length === 1 && !started.length && /\(background\)_/.test(read(op, "ANSWERS.md")), [s2, started]);
    ask(op, "Record the consent-screen video now?", "Ops records the screen too.");
    const s3 = shareAnswer(dl, [{ q: "Record the consent-screen video now?", a: "yes, from the staging site" }], o);
    ok("…and started when its own open question is the one answered", started.join() === op && s3[0].started, [s3, started]);
  }
  // a started handover says where its run really is, not "working on it" for good (25 Oct 2026)
  {
    const d = join(HOME, "stage"); mkdirSync(join(d, ".symbiot"), { recursive: true });
    const e = { status: "started", at: 1000, to: { lane: "ops", path: d } }, none = () => null;
    ok("a handover whose agent hasn't started yet is queued", stageOf(e, { running: none }).stage === "queued", stageOf(e, { running: none }));
    writeFileSync(join(d, ".symbiot", "agent.log"), "=== ops 2026-10-25T10:00:00.000Z ===\n$ x\n");
    ok("…its run still going is running", stageOf(e, { running: () => ({ pid: 1 }) }).stage === "running");
    ok("…its run ended with nothing asked is ended, not working", stageOf(e, { running: none }).stage === "ended", stageOf(e, { running: none }));
    writeFileSync(join(d, ".symbiot", "QUESTIONS.md"), "## Questions\n\n### Run it as root?\nx\n- a\n- b\n");
    ok("…its run ended on a question for the user is asks", stageOf(e, { running: none }).stage === "asks");
    ok("…a reported or finished one has no stage", !stageOf({ ...e, reportedAt: 5 }).stage && !stageOf({ ...e, status: "done" }).stage);
    // only what is really going counts as under way, so the count matches (25 Oct 2026: 13, most of them over)
    ok("…a running or queued one is under way", underWay(e, { status: "started", stage: "running" }) && underWay(e, { status: "held" }) && underWay(e, { status: "started", stage: "asks" }));
    ok("…an ended run, a stopped, finished or failed one, or one you skipped is not", !underWay(e, { status: "started", stage: "ended" }) && !underWay({ ...e, reportedAt: 5 }, { status: "stopped" }) && !underWay(e, { status: "done" }) && !underWay(e, { status: "error" }) && !underWay({ ...e, skipped: 5 }, { status: "started", stage: "running" }));
  }
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} lanes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
