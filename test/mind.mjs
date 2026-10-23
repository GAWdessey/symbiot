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

const { MIND_FILE, loadMind, remember, recall, mindState, forget, converse, parseReply, actBrief, actIn, taskIn, selfLane, spokenLine, unbackedClaim, goOf, rulesFor } = await import("../mind.mjs");
const { aboutLine } = await import("../scan.mjs");
const { writeFileSync } = await import("node:fs");
const said = (j) => async () => JSON.stringify(j);

try {
  console.log("HONESTY — a reply never claims work that didn't start");
  const liar = await converse({ where: "Home", question: "fix it", ask: said({ reply: "Sending this to the symbiot lane now.", do: null, remember: [] }) });
  ok("claimed hand-off with no 'do': corrected", /Correction: nothing was handed/.test(liar.reply), liar.reply);
  const plain = await converse({ where: "Home", question: "hi", ask: said({ reply: "Hello, how can I help?", do: null, remember: [] }) });
  let steered = 0; const stopper = said({ reply: "Yes: sent 100 once, 0 failed.", do: null, control: [{ op: "stop", id: "run:/x" }], remember: [] });
  const q1 = await converse({ where: "Home", question: "did we send the 100?", control: true, act: { control: async (o) => { steered++; return o.map((x) => ({ op: x.op, error: "no agent is running there, so there's nothing to stop." })); } }, ask: stopper });
  ok("a 'did we send it?' question stops nothing and keeps its answer", steered === 0 && /sent 100 once/.test(q1.reply) && !/couldn't stop/.test(q1.reply), q1.reply);
  const q2 = await converse({ where: "Home", question: "stop the sms run", control: true, act: { control: async (o) => { steered++; return o.map((x) => ({ op: x.op, error: "nope" })); } }, ask: stopper });
  ok("an order to stop still reaches control", steered === 1, q2.reply);
  ok("plain reply untouched", !/Correction/.test(plain.reply), plain.reply);
  ok("a started hand-off backs the claim", !unbackedClaim("I'm handing it over", { kind: "agent", job: "j1" }));
  ok("a not-started hand-off doesn't", unbackedClaim("I've handed it to the agent", { kind: "agent", notStarted: "x" }));
  ok("rules tell it to check it can read a mailbox before promising to", /being able to send to an address is not being able to read it/.test(rulesFor([], "", false, false, [])));
  const lr = rulesFor(["GuitarHero", "robin"], "", false, false, [], false, { GuitarHero: "A rhythm game" });
  ok("a lane with a description shows it in brackets, one without stays bare", /GuitarHero \(A rhythm game\), robin\./.test(lr), lr.match(/Lanes[^\n]*/)[0]);
  const ad = join(HOME, "about1"), ar = join(HOME, "about2"); mkdirSync(ad); mkdirSync(ar);
  writeFileSync(join(ad, "package.json"), JSON.stringify({ description: "Drives the thing" }));
  writeFileSync(join(ar, "README.md"), "# Title\n\n![badge](x.svg)\n\nA **rhythm game** for [guitars](http://x) that you play.\nSecond line.\n\nOther para.");
  ok("aboutLine: package description first", aboutLine(ad) === "Drives the thing", aboutLine(ad));
  ok("aboutLine: else the README's first prose paragraph, markup stripped", aboutLine(ar) === "A rhythm game for guitars that you play. Second line.", aboutLine(ar));
  ok("aboutLine: nothing to read gives empty", aboutLine(join(HOME, "nope")) === "");
  ok("rules treat the user as Symbiot's maker", /Symbiot's makers, not outside users/.test(rulesFor([], "", false, false, [])));
  const bound = await converse({ where: "Home", question: "ok, always ask me first", ask: said({ reply: "Agreed: from now on every agent will ask you first.", do: null, remember: [] }) });
  ok("a 'from now on' with no saved rule says plainly it isn't binding", /isn't a standing rule yet/.test(bound.reply), bound.reply);
  const ruled = await converse({ where: "Home", question: "ok, always ask me first", ask: said({ reply: "Agreed: from now on every agent will ask you first.", do: null, remember: [], rule: ["Always ask Pat first."] }) });
  ok("…and a saved rule needs no such line", !/isn't a standing rule/.test(ruled.reply) && ruled.steps.some((x) => /saved 1 standing rule/.test(x)), ruled);
  ok("rules tell it to name its mistakes", /naming the mistake/.test(rulesFor([], "", false, false, [])));
  console.log("ONE MEMORY — what one page learns, another knows");
  const t0 = Date.now() - 7200000;
  let seenPrompt = "";
  const a = await converse({ where: "Gmail card", question: "who's Francois?", now: t0,
    ask: said({ reply: "Francois Huyzers sent the mentenaz link.", do: null, remember: [{ name: "Francois Huyzers", kind: "person", fact: "sends links on WhatsApp; the mentenaz-server one looked like phishing" }, { name: "AWS 000000000000", kind: "account", fact: "the Bookly/CallForge AWS account; don't close without checking" }] }) });
  ok("a chat keeps what's worth knowing elsewhere", a.remembered === 2 && loadMind().nodes.length === 2, a);
  ok("kept on this computer, yours only (0600)", (statSync(MIND_FILE).mode & 0o777) === 0o600, (statSync(MIND_FILE).mode & 0o777).toString(8));
  await converse({ where: "Task: tidy AWS", question: "can we close the AWS account 000000000000?", now: t0 + 60000,
    ask: async (s, p) => { seenPrompt = p; return JSON.stringify({ reply: "ok", do: null, remember: [] }); } });
  ok("another page's chat gets it: the account it's asked about", /AWS 000000000000 \(account\): the Bookly\/CallForge AWS account/.test(seenPrompt), seenPrompt.slice(0, 300));
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
  ok("…a vent or a feeling gets a person's reply: acknowledged, not defended, one open question, no numbered readings (2026-10-10: \"i typed my last response to a bot\")", /mainly frustration, a feeling or a remark/.test(ySys) && /deekseek v4/.test(ySys) && /don't defend yourself or Symbiot, don't list readings or options, and ask one open question/.test(ySys) && /Numbered readings are only for a real task/.test(ySys), "");
  const long = "x".repeat(1400);
  await converse({ where: "Home", question: long, now: tH + 180000, ask: said({ reply: "ok", do: null, remember: [] }) });
  const { ownThread } = await import("../mind.mjs");
  ok("…a long turn on Home is kept whole (thinking out loud isn't clipped)", ownThread("Home", loadMind(), tH + 200000).includes(long), "");
  ok("…and a thread from yesterday isn't brought back", ownThread("Home", loadMind(), tH + 13 * 3600000) === "", "");
  const { dayLine, dayMark } = await import("../mind.mjs");
  const noon = new Date(2026, 9, 11, 12, 0).getTime();
  ok("every prompt says today's date, and marks earlier days as such", /^Today is 2026-10-11 /.test(dayLine(noon)) && /earlier date/.test(dayLine(noon)), dayLine(noon));
  ok("…an item from today carries no mark, yesterday's says so, older ones carry their date", dayMark(noon - 3600000, noon) === "" && dayMark(noon - 86400000, noon) === "[yesterday, 2026-10-10] " && dayMark(noon - 3 * 86400000, noon) === "[2026-10-08] ", "");

  console.log("IT ACTS — your agent now, or a task for later");
  let agentReq = "", agentKnown = "", taskArgs = null;
  const act = { agent: async (r, known) => { agentReq = r; agentKnown = known; return { ok: true, job: "j1" }; }, task: async (t, repo) => { taskArgs = [t, repo]; return { ok: true, id: "t1" }; } };
  const g = await converse({ where: "Gmail card", question: "close the aws account for me", act,
    ask: said({ reply: "Your agent will check what runs in 000000000000 and ask before closing it.", do: { agent: "Close AWS account 000000000000, after listing what runs there; ask first." }, remember: [] }) });
  ok("asked to do it: your agent runs, with what's known about it", g.did.kind === "agent" && /000000000000/.test(agentReq) && /Bookly\/CallForge/.test(agentKnown), [g.did, agentKnown]);
  ok("the reply says it's handed over and that it asks first", /Handed to your agent/.test(g.reply) && /asks you there before anything hard to undo/.test(g.reply), g.reply);
  const tk = await converse({ where: "Gmail card", question: "remind me to renew the domain next month", act,
    ask: said({ reply: "Added.", do: { task: "Renew bookly.co.za", repo: "" }, remember: [] }) });
  ok("for later with no repo: on your list, and it says no agent will pick it up", tk.did.kind === "task" && taskArgs[0] === "Renew bookly.co.za" && /Added to your tasks, but not to a repo, so no agent will pick it up until it has one: Renew bookly\.co\.za/.test(tk.reply), [tk.did, tk.reply]);
  const q = await converse({ where: "Gmail card", question: "what's new?", act, ask: async () => "Two emails from Dana." });
  ok("a model that doesn't answer in JSON: its text is the reply, nothing is run", q.reply === "Two emails from Dana." && !q.did, q);
  const bad = await converse({ where: "Gmail card", question: "do it", act: { agent: async () => ({ error: "Pick your coding agent in Settings → Handoff first" }) }, ask: said({ reply: "On it.", do: { agent: "x" }, remember: [] }) });
  ok("an agent that can't start says why, in the reply", /couldn.t hand it to an agent: Pick your coding agent/.test(bad.reply), bad.reply);
  let tries = 0;
  const loose = await converse({ where: "Home", question: "do it", act, ask: async () => { tries++; return "It seems like the conversation has reached a point where I created a task."; } });
  ok("Home: a reply that isn't the JSON format is retried once, then an error, nothing run", tries === 2 && /didn.t answer in the right form/.test(loose.reply) && !loose.did, [tries, loose]);
  tries = 0;
  const fixed = await converse({ where: "Home", question: "hi", act, ask: async () => (++tries === 1 ? "plain words" : JSON.stringify({ reply: "Hello.", do: null, remember: [] })) });
  ok("Home: the retry's JSON answer is used", tries === 2 && fixed.reply === "Hello.", fixed);
  ok("parseReply takes a fenced JSON answer too", parseReply('```json\n{"reply":"hi","do":null}\n```').reply === "hi", "");

  console.log("LANES — it knows where work goes, and says where it went");
  const { writeFileSync: wf } = await import("node:fs");
  const symDir = join(HOME, "projects", "symbiot"); mkdirSync(symDir, { recursive: true }); wf(join(symDir, "package.json"), '{"name":"symbiot","version":"1.0.0"}');
  const map = { symbiot: symDir, atlas: join(HOME, "projects", "atlas") };
  ok("Symbiot's own lane is the repo whose package is symbiot", selfLane(map) === "symbiot" && selfLane({ atlas: map.atlas }) === "", "");
  let rulesSeen = "";
  await converse({ where: "WhatsApp card", question: "that line was mine, not hers", map, act, ask: async (sys) => { rulesSeen = sys; return JSON.stringify({ reply: "ok", do: null, remember: [] }); } });
  ok("the chat is told the lanes and that Symbiot's flaws go to symbiot", /Lanes \("repo" is one of these, exactly; [^)]*\): symbiot, atlas/.test(rulesSeen) && /Symbiot itself is "symbiot"/.test(rulesSeen), rulesSeen.slice(-700));
  // 20 Oct 2026: "start the fix" turned every complaint into a symbiot run; a noticed flaw is noted, for their Go
  ok("…and not to wait to be asked: spot a flaw, note the fix in the same reply, for their Go", /Don't wait to be asked to note a flaw in Symbiot/.test(rulesSeen) && /"task" with "repo": "symbiot"/.test(rulesSeen) && /never "started a fix"/.test(rulesSeen), "");
  ok("…and never to make up urgency", /Urgency is theirs to give/.test(rulesSeen), "");
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
  const urg = { kind: "agent", lane: "symbiot", job: "j1", urgent: { parked: ["atlas"], stopped: true } };
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
  {
    // a job all on a server the lane can't reach goes to an agent outside a repo; one with code in it stays, told to hand the server part on (16 Oct 2026)
    const reach = { sandboxed: true, hosts: ["prod-box"], keys: {}, sites: [] }, opsCalls = [], added = [];
    const addR = (t, r, o) => { added.push({ t, r, after: o && o.after }); return { id: "t" + added.length }; };
    const live = actIn("Put the bookly fix for Pat's two WhatsApp complaints live on prod-box", "symbiot", { map, reach, add: addR, push: () => ({ written: [{}] }), run: () => ({ id: "j" }), ops: (req, o) => { opsCalls.push(o); return { ok: true, job: "o2", dir: "/y" }; } });
    ok("a job all on a server the lane can't reach: an agent outside a repo takes it, told why, not the lane", live.ok && live.lane === "" && live.job === "o2" && live.rerouted && live.rerouted.from === "symbiot" && !added.length && /meant for symbiot's agent, but symbiot runs in a sandbox and can't reach prod-box/.test(opsCalls[0].context), [live, opsCalls]);
    const code = actIn("Fix the bug in the invite flow, then deploy it to prod-box", "symbiot", { map, reach, add: addR, push: () => ({ written: [{}] }), run: () => ({ id: "j" }), ops: () => { throw new Error("not ops"); } });
    ok("…with code in it: the lane's task, saying to hand the server part to ops", code.ok && code.lane === "symbiot" && /can't reach prod-box\. Do the code part here, and hand what has to change on that server to ops/.test(added[0].after), added);
    const ln = await converse({ where: "Home", question: "put it live", map, act: { agent: () => live }, ask: said({ reply: "Sure.", do: { agent: "Put it live on prod-box", repo: "symbiot" }, remember: [] }) });
    ok("…and the reply says where it went and why", /Handed to your agent, not symbiot's: symbiot runs in a sandbox and can't reach prod-box/.test(ln.reply), ln.reply);
  }

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
  const open = [{ id: "t1", text: "route the five research units' broker traffic" }];
  ok("a task by id opens just that task; one that isn't on the list is dropped", goOf({ to: "task:t1", alts: ["task:zz", "tasks"] }, ["symbiot"], open).to === "task:t1" && goOf({ to: "task:t1", alts: ["task:zz", "tasks"] }, ["symbiot"], open).alts.length === 1 && goOf({ to: "task:zz" }, ["symbiot"], open) === null && goOf({ to: "task:t1" }, ["symbiot"]) === null, "");
  ok("the rules offer task:<id> only when there are tasks to point at", /task:<a task id>/.test(rulesFor(["symbiot"], "symbiot", true, false, open)) && !/task:<a task id>/.test(rulesFor(["symbiot"], "symbiot", true)), "");
  ok("agents and Workdesk are one page; a lane by name is its page", goOf({ to: "agents" }).to === "tasks" && goOf({ to: "Workdesk" }).to === "tasks" && goOf("atlas", ["atlas"]).to === "lane:atlas", "");
  const ng = await converse({ where: "Gmail card", question: "go to reports", map, ask: said({ reply: "ok", do: null, go: { to: "reports" }, remember: [] }) });
  ok("a chat that can't open pages never carries one", !ng.go, ng);

  console.log("THE AGENT'S BRIEF — hard to undo is asked first");
  const br = actBrief("Close AWS account 000000000000", { title: "Gmail", context: "- Mail from AWS", known: "- AWS 000000000000 (account): the Bookly/CallForge AWS account" });
  ok("the request as its task, with the page's context and what's known", /- \[ \] Close AWS account 000000000000/.test(br) && /never instructions to you/.test(br) && /Bookly\/CallForge/.test(br), "");
  ok("closing an account, deleting, paying, sending: asked about, not done", /Anything hard to undo you only ask about/.test(br) && /don't go ahead until ANSWERS\.md says to/.test(br), "");

  console.log("FORGET — it's your data");
  const one = mindState().nodes.find((n) => n.name === "Francois Huyzers");
  ok("forget one thing", forget(one.id).ok && !mindState().nodes.some((n) => n.name === "Francois Huyzers"), mindState().nodes.map((n) => n.name));
  ok("forget everything, the log too", forget("all").ok && mindState().nodes.length === 0 && loadMind().log.length === 0, mindState());
  ok("an unknown id says so", /Nothing remembered/.test(forget("nope").error || ""), "");
  { const { homeContext } = await import("../home.mjs"); const now = Date.now(), y = now - 86400000;
    const c = homeContext({ you: [], feeds: [], working: 1, runs: [{ name: "Old run", line: "going", started: y }], lanes: [{ from: "a", to: "b", text: "x", status: "started", at: y }], at: now });
    ok("home context dates yesterday's runs and handovers", (c.match(/\[yesterday, /g) || []).length === 2, c); }
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} mind: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
