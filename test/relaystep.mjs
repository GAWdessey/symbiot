// A step never has the user carry a job between agents, nor do work on a place they turned down.
// The case (29 Oct 2026): an trading bot's run's last words were "What you do: tell the PC session,
// 'Read and do ~/bot/research/model_pc/REQUEST.md on the VM.'", though the user had ruled out
// running anything on the Trading Bot VM and agents hand over between themselves.
//
//   node test/relaystep.mjs
//
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const HOME = mkdtempSync(join(tmpdir(), "symbiot-relaystep-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const { carriesJob } = await import("../handover.mjs");
const A = await import("../asksdone.mjs");
const T = await import("../triage.mjs");
const { needsOf } = await import("../agents.mjs");
const folder = (n) => { const p = join(HOME, n); mkdirSync(join(p, ".symbiot"), { recursive: true }); return p; };
const STEP = "What you do: tell the PC session, \"Read and do ~/bot/research/model_pc/REQUEST.md on the VM.\" Once the files land, I'll set up the 2-week paper run without touching the live bot";

console.log("a job to carry between sessions");
for (const t of [STEP, "Paste this into the other Claude session.", "Ask the bookly lane to redeploy it.", "Please relay this between the two sessions.", "Forward the plan to the marketing agent."]) ok(`caught: ${t.slice(0, 50)}`, carriesJob(t));
for (const t of ["Tell the agent what you found.", "Tell your agent which voice sounds better.", "Sign in to linkedin.com in your own Chrome as garth@example.com.", "Ask the bank for a statement.", "The draft is in Gmail: send it when you're happy."]) ok(`left alone: ${t.slice(0, 50)}`, !carriesJob(t));

console.log("work on a place the user turned down");
ok("nothing turned down: nothing ruled out", A.ruledOut(STEP, "trading-bot-desk") === "");
A.addRejected("running anything on the Trading Bot VM");
ok("the trading bot lane's step onto the VM is", A.ruledOut(STEP, "trading-bot-desk") === "running anything on the Trading Bot VM");
ok("…named in the step itself, from any lane", A.ruledOut("Restart the signal service on the Trading Bot VM.", "bookly") !== "");
ok("another lane's VM isn't (Steve's server)", A.ruledOut("Restart steve.service on the VM.", "steve") === "");
ok("data pulled from it isn't", A.ruledOut("Train it on this PC from the data pulled from the VM.", "trading-bot-desk") === "");
ok("nor a sentence that keeps off it", A.ruledOut("I won't run anything on the VM.", "trading-bot-desk") === "");
ok("every brief says agents hand over between themselves", /carry a message or a job between agents/.test(A.standingBrief().join("\n")));

console.log("a question card");
const vm = T.precheck({ q: "Should I run the model job on the VM?", options: ["🤖 Agent: run it there (recommended)", "Skip this part"] }, "", "trading-bot-desk");
ok("one offering the VM is answered: the user turned it down", vm && vm.verdict === "answered" && /turned this down/.test(vm.answer) && /this computer/.test(vm.answer), vm);
const relay = T.precheck({ q: "Can the request reach the PC?", options: ["👤 You: paste it into the PC session", "Skip this part"] }, "", "x");
ok("one having the user carry it is the agent's", relay && relay.verdict === "agent" && /HANDOFF/.test(relay.why), relay);
ok("the agent handing it over itself is fine", T.precheck({ q: "Hand the request to the PC lane?", options: ["🤖 Agent: hand it to the PC session now (recommended)", "Skip this part"] }, "", "x") === null);

console.log("a run's last step on Home");
const iq = folder("trading-bot-desk");
ok("no card for it", needsOf(iq, { waiting: { step: "👤 You: " + STEP }, end: Date.now() }) === null);
const said = readFileSync(join(iq, ".symbiot", "ANSWERS.md"), "utf8");
ok("its run is told to hand it over and stay off the VM", /HANDOFF\.md/.test(said) && /turned down \("running anything on the Trading Bot VM"\)/.test(said) && /wasn't asked/.test(said), said);
needsOf(iq, { waiting: { step: "👤 You: " + STEP }, end: Date.now() });
ok("…once", readFileSync(join(iq, ".symbiot", "ANSWERS.md"), "utf8") === said);
const plain = folder("other");
ok("a real step of the user's still shows", !!needsOf(plain, { waiting: { step: "👤 You (only you: your password): sign in to npmjs.com in your own Chrome as garth@example.com, so I can publish" }, end: Date.now() }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
