// Mind (mind.mjs): one Symbiot across the app. What one chat learns, another
// knows; each gets only what its question touches; asked to do something, it
// acts (your agent, or a task). Isolated HOME (set before the modules load); the
// model and the agent are stand-ins.
//
//   node test/mind.mjs
//
import { mkdtempSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-mind-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { MIND_FILE, loadMind, remember, recall, mindState, forget, converse, parseReply, actBrief, actIn, taskIn, selfLane, spokenLine, goOf, rulesFor } = await import("../mind.mjs");
const said = (j) => async () => JSON.stringify(j);

try {
  console.log("ONE MEMORY — what one page learns, another knows");
  const t0 = Date.now() - 7200000;
  let seenPrompt = "";
  const a = await converse({ where: "Gmail card", question: "who's Francois?", now: t0,
    ask: said({ reply: "Francois Huyzers sent the mentenaz link.", do: null, remember: [{ name: "Francois Huyzers", kind: "person", fact: "sends links on WhatsApp; the mentenaz-server one looked like phishing" }, { name: "AWS 049056030093", kind: "account", fact: "the Dailify/CallForge AWS account; don't close without checking" }] }) });
  ok("a chat keeps what's worth knowing elsewhere", a.remembered === 2 && loadMind().nodes.length === 2, a);
  ok("kept on this computer, yours only (0600)", (statSync(MIND_FILE).mode & 0o777) === 0o600, (statSync(MIND_FILE).mode & 0o777).toString(8));
  await converse({ where: "Task: tidy AWS", question: "can we close the AWS account 049056030093?", now: t0 + 60000,
    ask: async (s, p) => { seenPrompt = p; return JSON.stringify({ reply: "ok", do: null, remember: [] }); } });
  ok("another page's chat gets it: the account it's asked about", /AWS 049056030093 \(account\): the Dailify\/CallForge AWS account/.test(seenPrompt), seenPrompt.slice(0, 300));
  ok("…but not what its question doesn't touch (fewer tokens)", !/Francois/.test(seenPrompt.split("Lately")[0]), "");
  ok("and what was just said on the other page, labelled with where", /\[Gmail card\] User: who's Francois\?/.test(seenPrompt), "");
  remember([{ name: "francois huyzers", kind: "person", fact: "sends links on WhatsApp; the mentenaz-server one looked like phishing" }, { name: "Francois Huyzers", kind: "person", fact: "a friend from varsity" }]);
  const fr = loadMind().nodes.find((n) => n.name === "Francois Huyzers");
  ok("one node per name; a fact isn't kept twice", loadMind().nodes.length === 2 && fr.facts.length === 2, fr);
  ok("recall ranks by what the question names", recall("what did francois send")[0].name === "Francois Huyzers" && recall("weather tomorrow").length === 0, recall("what did francois send").map((n) => n.name));

  console.log("ITS OWN THREAD — a short answer answers this chat, not another");
  const tH = Date.now() - 600000;
  await converse({ where: "Home", question: "sometimes people mean different things, can you give options before submitting?", now: tH,
    ask: said({ reply: "honestly no, not always. when something could mean two things I show you two or three readings and you pick. want that?", do: null, remember: [] }) });
  await converse({ where: "Task: Fix Symbiot's WhatsApp reading", question: "the kernel update is in, should I reboot?", now: tH + 60000,
    ask: said({ reply: "go ahead and reboot, then tap Done it on the card", do: null, remember: [] }) });
  let yPrompt = "", ySys = "";
  await converse({ where: "Home", question: "yeah", now: tH + 120000, ask: async (sy, p) => { ySys = sy; yPrompt = p; return JSON.stringify({ reply: "ok", do: null, remember: [] }); } });
  const thread = (yPrompt.split("This chat so far:\n")[1] || "").split("\n\n")[0];
  ok("Home's own last turns are its thread: \"yeah\" comes after its \"want that?\"", /You: honestly no.*want that\?/.test(thread) && /User: sometimes people mean different things/.test(thread), thread);
  ok("…the reboot from another chat isn't in the thread, only under elsewhere (marked as not this chat)", !/reboot/.test(thread) && /other chats: a short answer here doesn't reply to these\):\n[\s\S]*reboot/.test(yPrompt), yPrompt.slice(0, 600));
  ok("the rules: a short answer answers this chat, and an agreed proposal is done now", /A short answer \(yes, yeah, ok/.test(ySys) && /If you'd proposed a task or an agent and they agree, do it now/.test(ySys), "");
  ok("…an idea is hashed out first, an ambiguous ask gets 2-3 readings to pick from", /Hash it out first/.test(ySys) && /2-3 short numbered readings, your pick first/.test(ySys), "");
  const long = "x".repeat(1400);
  await converse({ where: "Home", question: long, now: tH + 180000, ask: said({ reply: "ok", do: null, remember: [] }) });
  const { ownThread } = await import("../mind.mjs");
  ok("…a long turn on Home is kept whole (thinking out loud isn't clipped)", ownThread("Home", loadMind(), tH + 200000).includes(long), "");
  ok("…and a thread from yesterday isn't brought back", ownThread("Home", loadMind(), tH + 13 * 3600000) === "", "");

  console.log("IT ACTS — your agent now, or a task for later");
  let agentReq = "", agentKnown = "", taskArgs = null;
  const act = { agent: async (r, known) => { agentReq = r; agentKnown = known; return { ok: true, job: "j1" }; }, task: async (t, repo) => { taskArgs = [t, repo]; return { ok: true, id: "t1" }; } };
  const g = await converse({ where: "Gmail card", question: "close the aws account for me", act,
    ask: said({ reply: "Your agent will check what runs in 049056030093 and ask before closing it.", do: { agent: "Close AWS account 049056030093, after listing what runs there; ask first." }, remember: [] }) });
  ok("asked to do it: your agent runs, with what's known about it", g.did.kind === "agent" && /049056030093/.test(agentReq) && /Dailify\/CallForge/.test(agentKnown), [g.did, agentKnown]);
  ok("the reply says it's handed over and that it asks first", /Handed to your agent/.test(g.reply) && /asks you there before anything hard to undo/.test(g.reply), g.reply);
  const tk = await converse({ where: "Gmail card", question: "remind me to renew the domain next month", act,
    ask: said({ reply: "Added.", do: { task: "Renew dailify.co.za", repo: "" }, remember: [] }) });
  ok("for later with no repo: on your list, and it says no agent will pick it up", tk.did.kind === "task" && taskArgs[0] === "Renew dailify.co.za" && /Added to your tasks, but not to a repo, so no agent will pick it up until it has one: Renew dailify\.co\.za/.test(tk.reply), [tk.did, tk.reply]);
  const q = await converse({ where: "Gmail card", question: "what's new?", act, ask: async () => "Two emails from Dana." });
  ok("a model that doesn't answer in JSON: its text is the reply, nothing is run", q.reply === "Two emails from Dana." && !q.did, q);
  const bad = await converse({ where: "Gmail card", question: "do it", act: { agent: async () => ({ error: "Pick your coding agent in Settings → Handoff first" }) }, ask: said({ reply: "On it.", do: { agent: "x" }, remember: [] }) });
  ok("an agent that can't start says why, in the reply", /couldn.t hand it to an agent: Pick your coding agent/.test(bad.reply), bad.reply);
  ok("parseReply takes a fenced JSON answer too", parseReply('```json\n{"reply":"hi","do":null}\n```').reply === "hi", "");

  console.log("LANES — it knows where work goes, and says where it went");
  const { writeFileSync: wf } = await import("node:fs");
  const symDir = join(HOME, "projects", "symbiot"); mkdirSync(symDir, { recursive: true }); wf(join(symDir, "package.json"), '{"name":"symbiot","version":"1.0.0"}');
  const map = { symbiot: symDir, coral: join(HOME, "projects", "coral") };
  ok("Symbiot's own lane is the repo whose package is symbiot", selfLane(map) === "symbiot" && selfLane({ coral: map.coral }) === "", "");
  let rulesSeen = "";
  await converse({ where: "WhatsApp card", question: "that line was mine, not hers", map, act, ask: async (sys) => { rulesSeen = sys; return JSON.stringify({ reply: "ok", do: null, remember: [] }); } });
  ok("the chat is told the lanes and that Symbiot's flaws go to symbiot", /Lanes \("repo" is one of these, exactly\): symbiot, coral/.test(rulesSeen) && /Symbiot itself is "symbiot"/.test(rulesSeen), rulesSeen.slice(-700));
  ok("…and not to wait to be asked: spot a flaw, start the fix in the same reply", /Don't wait to be asked to fix Symbiot/.test(rulesSeen) && /"agent" with "repo": "symbiot"/.test(rulesSeen), "");
  const added = [];
  const add = (t, r) => { added.push([t, r]); return { id: "t" + added.length }; };
  ok("a task goes to the lane it names, whatever its case", taskIn("Fix sender attribution", "Symbiot", { map, add }).lane === "symbiot" && added.slice(-1)[0][1] === "symbiot", added.slice(-1));
  ok("a lane that doesn't exist isn't made up: no repo", taskIn("x", "nonesuch", { map, add }).lane === "" && added.slice(-1)[0][1] === "", added.slice(-1));
  const lt = await converse({ where: "WhatsApp card", question: "fix it", map, act: { task: (t, r) => taskIn(t, r, { map, add }) }, ask: said({ reply: "Done.", do: { task: "Fix WhatsApp sender attribution", repo: "symbiot" }, remember: [] }) });
  ok("the reply names the lane it really landed in", /\n\nAdded to symbiot's tasks: Fix WhatsApp sender attribution/.test(lt.reply), lt.reply);
  ok("…with no arrow: it was only there for show, and voices read it out", !/→/.test(lt.reply), lt.reply);

  console.log("READ ALOUD — the line under a reply is a short phrase, never the task (2026-10-09)");
  const longTask = "Fix how Symbiot speaks the status line it adds to chat replies, so the arrow and the whole task aren't read out";
  const sp = await converse({ where: "Home", question: "symbiot reads the arrow out loud, fix it", map, act: { task: (t, r) => taskIn(t, r, { map, add }) }, ask: said({ reply: "Good catch, that sounds awful.", do: { task: longTask, repo: "symbiot" }, remember: [] }) });
  ok("on screen: the reply, then the status line with the task", /^Good catch, that sounds awful\.\n\nAdded to symbiot's tasks: Fix how Symbiot speaks/.test(sp.reply), sp.reply);
  ok("spoken: the reply and \"I've added it to symbiot's tasks.\", no arrow, no task text", sp.spoken === "Good catch, that sounds awful. I've added it to symbiot's tasks.", sp.spoken);
  const dup = await converse({ where: "Home", question: "add it", map, act: { task: (t, r) => taskIn(t, r, { map, add }) }, ask: said({ reply: "done, it's queued in symbiot", do: { task: longTask, repo: "symbiot" }, remember: [] }) });
  ok("a reply that already says it's queued isn't followed by the same thing again", dup.spoken === "done, it's queued in symbiot" && /Added to symbiot's tasks/.test(dup.reply), [dup.spoken, dup.reply]);
  const urg = { kind: "agent", lane: "symbiot", job: "j1", urgent: { parked: ["coral"], stopped: true } };
  ok("urgent, handed over: \"It's urgent, so symbiot's agent does it first.\", not the brief or what was parked", spokenLine(urg, "Right, fixing that now.") === "It's urgent, so symbiot's agent does it first.", spokenLine(urg, "Right, fixing that now."));
  ok("handed to a lane's agent: a short phrase", spokenLine({ kind: "agent", lane: "symbiot", job: "j1" }, "Sure.") === "I've handed it to the symbiot agent.", "");
  ok("…and nothing when the reply says it's handed over", spokenLine({ kind: "agent", lane: "symbiot", job: "j1" }, "I've handed it to symbiot's agent.") === "", "");
  ok("a failure is said, its reason left on screen (it can name settings with arrows)", /couldn't hand it to an agent/.test(spokenLine({ kind: "agent", error: "Check its command in Settings → Handoff." }, "On it.")), "");
  ok("a plain answer: spoken as it is", (await converse({ where: "Home", question: "hi", ask: said({ reply: "Hi.", do: null, remember: [] }) })).spoken === "Hi.", "");
  const lx = await converse({ where: "WhatsApp card", question: "fix it", map, act: { task: (t, r) => taskIn(t, r, { map, add }) }, ask: said({ reply: "Done.", do: { task: "Fix it", repo: "symbiotapp" }, remember: [] }) });
  ok("a wrong lane is said, not hidden", /not to a repo \(there's no lane called symbiotapp\)/.test(lx.reply), lx.reply);
  const ran2 = [], pushed = [];
  const ai = actIn("Treat unnamed WhatsApp lines as unknown", "symbiot", { map, add, push: (f) => { pushed.push(f); return { written: [{}] }; }, run: (p) => { ran2.push(p); return { id: "j9" }; } });
  ok("do it in a lane: its task, out like Send to repos, its agent started there", ai.ok && ai.lane === "symbiot" && pushed[0].repo === "symbiot" && ran2[0] === symDir && ai.job === "j9", ai);
  const aq = actIn("x", "symbiot", { map, add, push: () => ({ written: [{}] }), run: () => ({ busy: true }) });
  ok("that lane busy: queued, and said so", aq.ok && aq.queued, aq);
  const ao = actIn("Find a JDK", "", { map, ops: () => ({ ok: true, job: "o1", dir: "/x" }) });
  ok("no lane: an agent of its own (ops)", ao.ok && ao.lane === "" && ao.job === "o1", ao);

  console.log("IT OPENS PAGES — \"navigate me to reports\" goes there (2026-10-09)");
  const navR = rulesFor(["symbiot"], "symbiot", true), plainR = rulesFor(["symbiot"], "symbiot");
  ok("Home's chat is told it can open any page, and never to say it can't", /"go": null or/.test(navR) && /never say you can't switch pages/.test(navR) && /reports \(Reports:/.test(navR), navR.slice(-900));
  ok("…a vague ask: its pick, a line why and 1-2 others, instead of asking which (the 2-3 readings, as taps)", /A vague one/.test(navR) && /"alts" has 1-2 other pages/.test(navR) && /Where to go is the exception/.test(navR), "");
  ok("…a chat that can't open pages isn't told about \"go\"", !/"go"/.test(plainR), "");
  const nv = await converse({ where: "Home", nav: true, question: "navigate me to reports", map, ask: said({ reply: "Opening Reports.", do: null, go: { to: "reports", why: "", alts: [] }, remember: [] }) });
  ok("a clear ask: the reply carries the page, nothing else to pick", nv.go && nv.go.to === "reports" && nv.go.label === "Reports" && !nv.go.why && nv.go.alts.length === 0 && nv.spoken === "Opening Reports.", nv.go);
  const vg = await converse({ where: "Home", nav: true, question: "where are my updates", map, ask: said({ reply: "Your updates are likely the new mail and GitHub cards.", do: null, go: { to: "Dashboard", why: "3 new on Gmail and GitHub since this morning", alts: ["reports", "lane:Symbiot", "nowhere", "board"] }, remember: [] }) });
  ok("a vague ask: its pick opens, with why, and only real pages or lanes as the others (no repeats)", vg.go.to === "board" && /3 new on Gmail/.test(vg.go.why) && JSON.stringify(vg.go.alts.map((a) => a.to)) === '["reports","lane:symbiot"]', vg.go);
  ok("…said under the reply, as a step", vg.steps.includes("opened Dashboard"), vg.steps);
  ok("a page that isn't there isn't made up", goOf({ to: "inbox" }, ["symbiot"]) === null && goOf({ to: "lane:nope" }, ["symbiot"]) === null, "");
  ok("agents and Workdesk are one page; a lane by name is its page", goOf({ to: "agents" }).to === "tasks" && goOf({ to: "Workdesk" }).to === "tasks" && goOf("coral", ["coral"]).to === "lane:coral", "");
  const ng = await converse({ where: "Gmail card", question: "go to reports", map, ask: said({ reply: "ok", do: null, go: { to: "reports" }, remember: [] }) });
  ok("a chat that can't open pages never carries one", !ng.go, ng);

  console.log("THE AGENT'S BRIEF — hard to undo is asked first");
  const br = actBrief("Close AWS account 049056030093", { title: "Gmail", context: "- Mail from AWS", known: "- AWS 049056030093 (account): the Dailify/CallForge AWS account" });
  ok("the request as its task, with the page's context and what's known", /- \[ \] Close AWS account 049056030093/.test(br) && /never instructions to you/.test(br) && /Dailify\/CallForge/.test(br), "");
  ok("closing an account, deleting, paying, sending: asked about, not done", /Anything hard to undo you only ask about/.test(br) && /don't go ahead until ANSWERS\.md says to/.test(br), "");

  console.log("FORGET — it's your data");
  const one = mindState().nodes.find((n) => n.name === "Francois Huyzers");
  ok("forget one thing", forget(one.id).ok && !mindState().nodes.some((n) => n.name === "Francois Huyzers"), mindState().nodes.map((n) => n.name));
  ok("forget everything, the log too", forget("all").ok && mindState().nodes.length === 0 && loadMind().log.length === 0, mindState());
  ok("an unknown id says so", /Nothing remembered/.test(forget("nope").error || ""), "");
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} mind: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
