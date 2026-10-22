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
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} needs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
