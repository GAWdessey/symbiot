// Mind (mind.mjs): one Symbiot across the app. What one chat learns, another
// knows; each gets only what its question touches; asked to do something, it
// acts (your agent, or a task). Isolated HOME (set before the modules load); the
// model and the agent are stand-ins.
//
//   node test/mind.mjs
//
import { mkdtempSync, readFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-mind-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { MIND_FILE, loadMind, remember, recall, mindState, forget, converse, parseReply, actBrief } = await import("../mind.mjs");
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

  console.log("IT ACTS — your agent now, or a task for later");
  let agentReq = "", agentKnown = "", taskArgs = null;
  const act = { agent: async (r, known) => { agentReq = r; agentKnown = known; return { ok: true, job: "j1" }; }, task: async (t, repo) => { taskArgs = [t, repo]; return { ok: true, id: "t1" }; } };
  const g = await converse({ where: "Gmail card", question: "close the aws account for me", act,
    ask: said({ reply: "Your agent will check what runs in 049056030093 and ask before closing it.", do: { agent: "Close AWS account 049056030093, after listing what runs there; ask first." }, remember: [] }) });
  ok("asked to do it: your agent runs, with what's known about it", g.did.kind === "agent" && /049056030093/.test(agentReq) && /Dailify\/CallForge/.test(agentKnown), [g.did, agentKnown]);
  ok("the reply says it's handed over and that it asks first", /Handed to your agent/.test(g.reply) && /asks you there before anything hard to undo/.test(g.reply), g.reply);
  const tk = await converse({ where: "Gmail card", question: "remind me to renew the domain next month", act,
    ask: said({ reply: "Added.", do: { task: "Renew dailify.co.za", repo: "" }, remember: [] }) });
  ok("for later: a task on your list", tk.did.kind === "task" && taskArgs[0] === "Renew dailify.co.za" && /Added to your tasks: Renew dailify\.co\.za/.test(tk.reply), [tk.did, tk.reply]);
  const q = await converse({ where: "Gmail card", question: "what's new?", act, ask: async () => "Two emails from Dana." });
  ok("a model that doesn't answer in JSON: its text is the reply, nothing is run", q.reply === "Two emails from Dana." && !q.did, q);
  const bad = await converse({ where: "Gmail card", question: "do it", act: { agent: async () => ({ error: "Pick your coding agent in Settings → Handoff first" }) }, ask: said({ reply: "On it.", do: { agent: "x" }, remember: [] }) });
  ok("an agent that can't start says why, in the reply", /couldn't hand it to your agent: Pick your coding agent/.test(bad.reply), bad.reply);
  ok("parseReply takes a fenced JSON answer too", parseReply('```json\n{"reply":"hi","do":null}\n```').reply === "hi", "");

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
