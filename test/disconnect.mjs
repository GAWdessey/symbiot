// The disconnect (29 Oct 2026): agents and the chat each acted on a partial view. A typed reply to an options
// card is its answer; a task naming an open one is its follow-up; a run is told the user's own words; a paused
// lane's queue shows on Home; a goal is Done only with proof. Isolated HOME.
//
//   node test/disconnect.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const HOME = mkdtempSync(join(tmpdir(), "symbiot-disconnect-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const C = join(HOME, ".config", "symbiot");
mkdirSync(C, { recursive: true });
writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")] }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const T = await import("../tasks.mjs");
const a = await import("../agents.mjs");
const H = await import("../home.mjs");
const lane = join(HOME, "work", "marketing"), sym = join(lane, ".symbiot");
mkdirSync(sym, { recursive: true });
writeFileSync(join(C, "runs.json"), JSON.stringify([{ path: lane, name: "Agent: marketing", startedAt: Date.now() }]));
try {
  console.log("1) A TYPED REPLY TO A CARD WITH OPTIONS IS ITS ANSWER");
  const q = "Create the LinkedIn page as shown?";
  writeFileSync(join(sym, "QUESTIONS.md"), `# Questions\n\n## Questions\n\n### ${q} {#page}\nAddress: linkedin.com/company/acme\n- 🤖 Agent: Create it as shown (recommended)\n- 🤖 Agent: Don't create it\n`);
  const r = a.answerQuestions(lane, [{ q, a: "Address linkedin.com/company/acme" }]);
  const md = readFileSync(join(sym, "ANSWERS.md"), "utf8");
  ok("it's saved", r.ok && r.saved === 1, r);
  ok("...with a note that it answers that question and a detail means yes with it", /typed this under the question/.test(md) && /means yes with that change/.test(md), md);
  const q2 = "Post it today?";
  writeFileSync(join(sym, "QUESTIONS.md"), `# Questions\n\n## Questions\n\n### ${q2} {#today}\nThe post.\n- 🤖 Agent: Post it today (recommended)\n- 🤖 Agent: Wait\n`);
  a.answerQuestions(lane, [{ q: q2, a: "Post it today (recommended)" }]);
  ok("an option picked as it is gets no note", !/typed this under/.test(readFileSync(join(sym, "ANSWERS.md"), "utf8").split("### ").pop()));

  console.log("2) A TASK THAT NAMES AN OPEN ONE IS ITS FOLLOW-UP");
  const t1 = T.addTask("Create a LinkedIn company page for Acme on Sam's LinkedIn and start using it. Check first whether one exists.", "marketing");
  const t2 = T.addTask(`Create Acme's LinkedIn company page now (task ${t1.id}). Sam approved the preview with the address linkedin.com/company/acme. Treat that as his go.`, "marketing");
  ok("the second is the first, not a new job", t2.duplicate && t2.id === t1.id, [t1, t2]);
  const all = (await import("../core.mjs")).loadTasks().filter((x) => !x.done && x.repo === "marketing");
  ok("...one task is open", all.length === 1, all.length);
  ok("...and it carries the follow-up's words", /Update: Create Acme's LinkedIn company page now/.test(all[0].full || ""), all[0]);
  const other = T.addTask(`Something else (task ${t1.id}) in another lane`, "symbiot");
  ok("a task in another lane naming it is its own", !other.duplicate, other);

  console.log("3) A RUN IS GIVEN THE USER'S OWN WORDS");
  const md2 = T.buildTasksMd("ml", { branch: "main" }, [{ text: "Copy the ML bot to the VM", said: "put the ML bot from ~/iqbot/research/lgbm_pc/ on the VM" }, { text: "Plain task" }]);
  ok("the ask is quoted under its task", /Copy the ML bot to the VM\n  - _The user's own words[^\n]*~\/iqbot\/research\/lgbm_pc\//.test(md2), md2.split("\n").slice(14, 30));
  ok("a task with no words of theirs gets no line", !/Plain task\n  - _The user/.test(md2));

  console.log("4) A PAUSED LANE'S QUEUE SHOWS ON HOME");
  const cards = H.parkedCards([{ id: "a", text: "Fix the dialler", repo: "acme" }, { id: "b", text: "Second", repo: "acme" }, { id: "c", text: "Done one", repo: "acme", done: true }, { id: "d", text: "Other lane", repo: "symbiot" }],
    { acme: "/x/acme", symbiot: "/x/symbiot" }, new Set(["/x/acme"]));
  ok("one card for the paused lane, counting its open tasks", cards.length === 1 && /2 tasks are queued in acme, which is paused/.test(cards[0].title) && /Unpark it on the Workdesk/.test(cards[0].sub), cards);
  ok("no card for a lane that isn't paused", !H.parkedCards([{ id: "d", text: "x", repo: "symbiot" }], { symbiot: "/x/symbiot" }, new Set()).length);
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
