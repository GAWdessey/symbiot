// What may sit under Needs you, and how a card there reads (needs.mjs; home.mjs homeState; goals.mjs):
// a decision or the user's own step only, information goes to Updates, and each card is a short
// question with labelled options that still answer exactly as before (22 Oct 2026). Isolated HOME.
//
//   node test/needs.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-needs-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const N = await import("../needs.mjs");
const { homeState } = await import("../home.mjs");

const voices = { kind: "ask", id: "ask:/runs/act-1", path: "/runs/act-1", repo: "", name: "LoveLink", q: "Listen to the Ashley and Dennis coach voices on a call, since the agent can't hear audio, and say which one sounds more natural for the coaching role before the switch goes live on the site", options: ["I've done this", "Skip"] };
const done = { kind: "ask", id: "goal:ab12:done", path: "goal:ab12", goal: "ab12", q: "Done: where are we with the call-centre demo? is there a system i can see?", options: ["Got it"], report: { id: "r1", title: "Done: where are we" } };
const ack = { kind: "ask", id: "ask:/runs/act-2", path: "/runs/act-2", q: "The report is written.", options: ["OK"] };
const choose = { kind: "ask", id: "ask:/w/a", path: "/w/a", q: "Cache the thumbnails on disk or in memory?", options: ["on disk (recommended)", "in memory"] };
try {
  console.log("NEEDS YOU — decisions and the user's own steps only");
  ok("a goal's close-out, a card whose only answer is Got it, and a \"Done: …\" are updates", N.isUpdate(done) && N.isUpdate(ack) && N.isUpdate({ kind: "ask", q: "Done: the move", options: ["Read it", "Close"] }));
  ok("…a step of theirs and a choice are not", !N.isUpdate(voices) && !N.isUpdate(choose));
  const sp = N.splitNeeds([voices, done, ack, choose, { kind: "approve", id: "approve:x" }]);
  ok("split: the decisions stay, in order; the updates carry what to show and how to put them away", sp.you.map((y) => y.id).join() === "ask:/runs/act-1,ask:/w/a,approve:x" && sp.updates.length === 2 && sp.updates[0].title.startsWith("where are we") && sp.updates[0].report.id === "r1" && sp.updates[0].goal === "ab12" && sp.updates[0].key === "goal:ab12|" + done.q, sp);

  console.log("NEEDS YOU — the card writer: a short question, why, labelled options, same answers");
  const said = { [voices.q]: { question: "Which coach voice sounds more natural: Ashley or Dennis?", why: "Open the demo call and listen to both; the site switches to the one you pick.", labels: ["Done listening", "Skip this step"], tips: ["Tells the agent you've listened; it asks which next.", "The agent leaves the voice as it is."], recommended: 0, judgement: true },
    [choose.q]: { question: "Where should thumbnails be cached?", why: "Previews are slow.", labels: ["On disk", "In memory"], tips: ["Survives a restart.", "Faster, lost on restart."], recommended: 0, judgement: false } };
  let calls = 0;
  const write = async (sys, prompt) => { calls++; const k = Object.keys(said).find((q) => prompt.includes(q)); return { text: JSON.stringify(said[k] || { question: "x " .repeat(30) }) }; };
  const n = await N.writeCards([voices, done, choose], { write });
  ok("only the decisions are written, one call each", n === 2 && calls === 2, [n, calls]);
  const v = N.applyText(voices);
  ok("the question is short and whole; the answer key and options are the agent's own", v.q === "Which coach voice sounds more natural: Ashley or Dennis?" && v.raw === voices.q && v.options.join() === voices.options.join() && v.labels.join() === "Done listening,Skip this step" && v.tips.length === 2 && v.rec === 0, v);
  ok("…a judgement step gets \"Tell the agent what you found\"", v.tellAgent === true && !N.applyText(choose).tellAgent);
  ok("…a question that's too long or cut off isn't used", N.checkCardText({ question: "a ".repeat(25) }, 0) === null && N.checkCardText({ question: "Which one sounds…" }, 0) === null);
  ok("…and a card with no text written reads as it did", N.applyText(ack) === ack);
  const calls0 = calls; await N.writeCards([voices, choose], { write });
  ok("written once: not again", calls === calls0);

  console.log("NEEDS YOU — on Home");
  const hs = homeState({ fresh: true, deps: { repos: () => ({}), board: () => ({ cards: [] }), pending: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, waits: () => [], clashes: () => [], agentGone: () => "", signedOut: () => [], stuck: () => [], drafts: () => [], agentCmd: () => "claude", marketing: () => false, agents: () => [], goalCards: () => [done], troubles: () => [] } });
  ok("the close-out is under Updates, not Needs you", !(hs.you || []).some((y) => y.id === done.id) && (hs.updates || []).some((u) => u.goal === "ab12"), hs);

  console.log("NEEDS YOU — a status the agent can check is never a card");
  const status = { kind: "ask", id: "goal:cd34:user", path: "goal:cd34", goal: "cd34", q: "Move the domain into the company's own account at the registrar", options: ["I've done it", "Drop it"] };
  await N.writeCards([status], { write: async () => ({ text: JSON.stringify({ notTheirs: true, question: "Is the domain moved yet?" }) }) });
  ok("the writer says it isn't theirs, and it's off Needs you", N.textFor(status).notTheirs === true && !N.splitNeeds([status, choose]).you.some((y) => y.id === status.id) && N.splitNeeds([status, choose]).you.some((y) => y.id === choose.id));
  const G = await import("../goals.mjs"), J = await import("../jobs.mjs");
  const run = join(CFG, "drafts", "act-dom1"); mkdirSync(join(run, ".symbiot"), { recursive: true });
  J.putGoal && J.putGoal({ key: "goal:cd34", kind: "goal", text: "move the domain", asked: "move the domain", state: "waiting", waitingOn: "user", at: Date.now() - 3600e3, changed: Date.now() - 3600e3, children: ["run:r9"], paths: [run], card: { kind: "user", q: status.q, options: status.options, at: Date.now() - 600e3 } });
  J.track && J.track("run:r9", { kind: "agent", path: run, state: "waiting", waitingOn: "user", what: status.q });
  const started = [];
  await G.goalsTick({ notTheirs: (c) => c.q === status.q, running: () => false, start: (p) => { started.push(p); return { id: "x" }; }, autoStart: () => true, settle: () => {}, cardPaths: new Set(), waits: [], ledger: { handoffs: [] }, map: {} });
  ok("…and its run is started to check it itself, not the user asked", started.includes(run), started);

  console.log("NEEDS YOU — a card says the agent is doing the work, what it has done, and the one thing it needs (22 Oct 2026)");
  const dom = { kind: "ask", id: "ask:/runs/act-dm", path: "/runs/act-dm", repo: "bookly", q: "Create the company's account at the registrar and send the transfer ticket?", task: "New job: move the domain to the company's own account", done: "I drafted the ticket and the account form; nothing is sent.", options: ["Go ahead", "Skip"] };
  let seen = "";
  await N.writeCards([dom], { write: async (sys, prompt) => { seen = sys + "\n" + prompt; return { text: JSON.stringify({ doing: "I'm moving the domain to the company's own account. I've drafted the ticket and the form.", question: "Can I create the account and send the ticket?", labels: ["Go ahead", "Skip it"], tips: ["", ""], recommended: 0 }) }; }, known: { keys: ["registrar-login"], sites: ["gmail", "www.domains.co.za"] } });
  const d = N.applyText(dom);
  ok("the card opens with the agent's own line, then its one ask", d.doing === "I'm moving the domain to the company's own account. I've drafted the ticket and the form." && d.q === "Can I create the account and send the ticket?", d);
  ok("…the writer saw the job, what's done, the saved keys and the linked sites, and is told to send back what they hold", /The agent's job: New job: move the domain/.test(seen) && /I drafted the ticket/.test(seen) && /registrar-login/.test(seen) && /www\.domains\.co\.za/.test(seen) && /saved keys or the linked sites and mailboxes/.test(seen) && /in the agent's own voice/.test(seen), seen.slice(-700));
  const old1 = { kind: "ask", id: "ask:/w/b", path: "/w/b", q: "Which plan should Pro be sold on?", options: ["Monthly", "Yearly"] };
  const all0 = N.loadCardText(); all0[N.keyOf(old1)] = { question: "Which plan for Pro?", at: 1 }; writeFileSync(N.CARDTEXT(), JSON.stringify(all0));
  let again = 0; await N.writeCards([old1], { write: async () => (again++, { text: JSON.stringify({ doing: "I'm setting up Pro's pricing.", question: "Which plan should Pro be sold on?", labels: ["Monthly", "Yearly"] }) }) });
  ok("a card written before the agent's line is written again, once", again === 1 && N.applyText(old1).doing === "I'm setting up Pro's pricing.", N.textFor(old1));
  const { jobWords } = await import("../core.mjs");
  ok("a job reads without Agent: or a handover's New job:", jobWords("Agent: New job: finish the coach avatars") === "finish the coach avatars" && jobWords("New job, not a replacement: restart Wren") === "restart Wren" && jobWords("Lerato done. New job: finish Clay") === "Lerato done. finish Clay");

  console.log("NEEDS YOU — a goal's card never shows the task's words as the user's step");
  const A = await import("../agents.mjs");
  const lane = join(HOME, "lane-d"); mkdirSync(join(lane, ".symbiot"), { recursive: true });
  writeFileSync(join(lane, ".symbiot", "TASKS.md"), "## Tasks\n- [~] New job: Move the domain into the company's own account. The owner registered the company; copy its documents into a folder.\n");
  const bare = A.runOutcome(lane, {}, 0, { files: 0, final: "The move isn't done. I drafted the ticket; creating the account and sending it need your yes.", questions: [], waiting: null, needs: null });
  ok("a [~] item with no note: marked bare, its job kept without New job:", bare.state === "waiting" && bare.bare === true && bare.task === "Move the domain into the company's own account. The owner registered the company; copy its documents into a folder.", bare);
  writeFileSync(join(lane, ".symbiot", "TASKS.md"), "## Tasks\n- [~] (waits on: ops, run act-c1, which holds the key) Finish the coach avatars\n");
  const noted = A.runOutcome(lane, {}, 0, { files: 0, final: "Lerato is done.", questions: [], waiting: null, needs: null });
  ok("…with a note: what it waits on is the note, and the job is the rest", noted.what === "ops, run act-c1, which holds the key" && noted.task === "Finish the coach avatars" && !noted.bare, noted);
  const run2 = join(CFG, "drafts", "act-dom2"); mkdirSync(join(run2, ".symbiot"), { recursive: true });
  J.putGoal({ key: "goal:ef56", kind: "goal", text: "no as discussed we have created the company", asked: "no as discussed we have created the company", state: "running", at: Date.now() - 3600e3, changed: Date.now() - 3600e3, children: ["run:r10"], paths: [run2] });
  J.track("run:r10", { kind: "agent", lane: "bookly", text: "bookly", path: run2, state: "waiting", waitingOn: "user", what: bare.task, task: bare.task, bare: true, summary: bare.summary, outcome: true });
  await G.goalsTick({ running: () => false, start: () => null, autoStart: () => false, settle: () => {}, cardPaths: new Set(), waits: [], ledger: { handoffs: [] }, map: {} });
  const gc = G.goalCards().find((c) => c.goal === "ef56");
  ok("its card asks in the run's own words, the sentence that needs them, says the job is the agent's, and isn't the task's words", gc && gc.q === "I drafted the ticket; creating the account and sending it need your yes." && !/copy its documents/.test(gc.q) && gc.task === bare.task && !gc.done, gc);
  ok("…a yes it asks for is a Go ahead, not \"I've done it\"", gc && gc.options.join() === "Go ahead,Drop it", gc && gc.options);
  const settled = [], began = [];
  const ga = G.goalAnswer("goal:ef56", [{ q: gc.q, a: "Go ahead" }], { settle: (p, why) => settled.push([p, why]), start: (p) => began.push(p), jobs: J.loadJobs(), map: {} });
  ok("…and Go ahead carries the run on with the user's yes", ga.ok && settled.length === 1 && settled[0][0] === run2 && /go ahead/.test(settled[0][1]) && began.includes(run2), [ga, settled, began]);
  J.putGoal({ key: "goal:ef57", kind: "goal", text: "the avatars", asked: "the avatars", state: "running", at: Date.now() - 3600e3, changed: Date.now() - 3600e3, children: ["run:r11"], paths: [join(CFG, "drafts", "act-av1")] });
  J.track("run:r11", { kind: "agent", lane: "agent", text: "New job: finish the coach avatars", path: join(CFG, "drafts", "act-av1"), state: "waiting", waitingOn: "user", what: "allow the microphone for Lerato's test call", summary: "Lerato is set up; I couldn't hear her voice.", outcome: true });
  await G.goalsTick({ running: () => false, start: () => null, autoStart: () => false, settle: () => {}, cardPaths: new Set(), waits: [], ledger: { handoffs: [] }, map: {} });
  const gv = G.goalCards().find((c) => c.goal === "ef57");
  ok("…an ops run's card: its step, its job without New job:, and what it has done", gv && gv.q === "allow the microphone for Lerato's test call" && gv.task === "finish the coach avatars" && gv.done === "Lerato is set up; I couldn't hear her voice.", gv);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} needs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
