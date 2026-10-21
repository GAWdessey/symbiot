// What an agent asks the user (agents.mjs whereLine, whereAnswer, askTask). On 2026-10-13
// an agent in ~/.config/symbiot/worktrees/symbiot-25fada asked "which repo is this
// worktree for?", then what "work desk" meant: its folder's name said symbiot, and the
// Workdesk is Symbiot's own page. Its card didn't say which task it was about either, so
// the user answered "which work tree????". Isolated HOME (set before the modules load).
//
//   node test/asks.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-asks-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const C = join(HOME, ".config", "symbiot");
mkdirSync(C, { recursive: true });
writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")] }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const sh = (cwd, ...a) => spawnSync("git", ["-C", cwd, "-c", "user.email=t@t", "-c", "user.name=t", ...a], { encoding: "utf8" });
const a = await import("../agents.mjs");
const { homeState } = await import("../home.mjs");

// the lane's repo, and a copy of it for one task (parallel.mjs's worktree)
const lane = join(HOME, "work", "symbiot");
mkdirSync(join(lane, ".symbiot"), { recursive: true });
sh(lane, "init", "-q"); writeFileSync(join(lane, "a.txt"), "a\n"); sh(lane, "add", "-A"); sh(lane, "commit", "-qm", "one");
sh(lane, "remote", "add", "origin", "https://github.com/PatGhostai/symbiot.git");
const copy = join(C, "worktrees", "symbiot-25fada");
sh(lane, "worktree", "add", "-q", "-b", "symbiot/par-25fada", copy, "HEAD");
mkdirSync(join(copy, ".symbiot"), { recursive: true });
const parTask = "Make the Workdesk's question cards say which task they're about. Then add a test.";
writeFileSync(join(copy, ".symbiot", "par.json"), JSON.stringify({ id: "25fada", lane: "symbiot", repo: lane, wt: copy, branch: "symbiot/par-25fada", task: parTask }));

console.log("1) WHERE IT IS — every run is told, and never asks the user");
const wl = a.whereLine(lane), wc = a.whereLine(copy);
ok("a lane's run is told its folder, lane, git remote and Symbiot's pages", /this folder is symbiot, the repo of the symbiot lane, git remote https:\/\/github\.com\/PatGhostai\/symbiot\.git/.test(wl) && /Workdesk \(the tasks page/.test(wl) && /Dashboard/.test(wl) && /Archive/.test(wl), wl);
ok("...and not to ask which repo or project it is, or what a page is", /never ask which repo or project this is, or what a Symbiot page is/.test(wl), wl);
ok("a copy's run is told it's a copy of its lane's repo, made for one task", new RegExp(`this folder is symbiot-25fada, a copy of the repo of the symbiot lane \\(${lane.replace(/[/.]/g, "\\$&")}\\), made for one task, git remote https://github`).test(wc), wc);
ok("...in words that pass through two shells (no quotes, $ or backticks)", !/["'`$\\]/.test(wl + wc), wl + wc);

const asked = [
  "I can't tell which project \"what work desk\" means. Which repo is this worktree for?",
  "Which project is this worktree for?",
  "Which repo is this for?",
  "What does \"Workdesk\" mean?",
];
for (const q of asked) {
  const ans = a.whereAnswer(copy, { q, context: "" });
  ok(`answered from the folder, not asked: ${q}`, /symbiot-25fada, is a copy of the symbiot repo/.test(ans) && /PatGhostai\/symbiot\.git/.test(ans) && /Workdesk \(the tasks page/.test(ans) && /don't ask this again/.test(ans), ans);
}
const real = [
  "Which project should the landing page link to: bookly or symbiot?",
  "Should I mark the tasks done, which means Approve shows them?",
  "Which repo has the LoveLink invite code, telco-platform or bookly?",
];
for (const q of real) ok(`a real question still goes to the user: ${q}`, a.whereAnswer(copy, { q, context: "" }) === "", a.whereAnswer(copy, { q, context: "" }));

// the folder's question file, as the agent wrote it on 2026-10-13, beside a real one
writeFileSync(join(copy, ".symbiot", "QUESTIONS.md"), `# Questions\n\n### ${asked[0]}\n.symbiot/TASKS.md still doesn't exist here and the worktree has no source files.\n\n### Which project should the landing page link to: bookly or symbiot?\nThe task doesn't say.\n- bookly (recommended)\n- symbiot\n`);
const aq = a.agentQuestions(copy, "symbiot");
ok("its card never shows: only the real question is left for the user", aq.questions.length === 1 && /landing page/.test(aq.questions[0].q) && aq.known && aq.known.length === 1, aq);
const r = a.autoDecide(copy), ans = readFileSync(join(copy, ".symbiot", "ANSWERS.md"), "utf8");
ok("...Symbiot answers it in the agent's ANSWERS.md itself", r && r.where && r.decided === 1 && ans.includes(`### ${asked[0]}\nThis folder, symbiot-25fada, is a copy of the symbiot repo`), [r, ans]);
ok("...once: answered, it isn't answered again", a.agentQuestions(copy, "symbiot").known === undefined && a.autoDecide(copy) === null, a.agentQuestions(copy, "symbiot"));

// a copy removed after its merge, its .symbiot made again by an answer coming in
const gone = join(C, "worktrees", "symbiot-0d1e0a");
mkdirSync(join(gone, ".symbiot"), { recursive: true });
writeFileSync(join(gone, ".symbiot", "ANSWERS.md"), "# Answers\n\n### Handed over to ops: install OpenCV\nDone.\n");
ok("a copy removed after its merge gets no run, and says why", /was a copy of the symbiot repo made for one task, and it was removed when that task was merged/.test(a.nothingToDo(gone)), a.nothingToDo(gone));

// the run's prompt carries it (a stand-in agent that writes down what it was told), in a
// lane that isn't Symbiot's own code (licence.mjs never lets a run edit that)
const atlas = join(HOME, "work", "atlas");
mkdirSync(join(atlas, ".symbiot"), { recursive: true }); sh(atlas, "init", "-q");
a.setHandoffCmd(`printf %s "{prompt}" > {dir}/.symbiot/prompt.txt`);
writeFileSync(join(atlas, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Fix the board's empty state.\n");
const e = a.runHandoff(atlas, { force: true });
const pf = join(atlas, ".symbiot", "prompt.txt");
for (let i = 0; i < 100 && !(existsSync(pf) && readFileSync(pf, "utf8")); i++) await new Promise((res) => setTimeout(res, 50));
const told = existsSync(pf) ? readFileSync(pf, "utf8") : "";
ok("the run's prompt starts with the brief and says where it is", e && e.id && told.startsWith("Read .symbiot/TASKS.md") && told.includes(a.whereLine(atlas)) && /this folder is atlas, the repo of the atlas lane/.test(told), [e && e.note, told]);
a.setHandoffCmd("");

console.log("2) WHICH TASK — every question card says it in one line");
const q0 = aq.questions[0];
ok("a copy's question is about its one task, in a line: its first sentence", q0.task === "Make the Workdesk's question cards say which task they're about.", q0);
writeFileSync(join(lane, ".symbiot", "TASKS.md"), "## Tasks\n- [x] Fix the board's empty state.\n- [ ] Move the **phone pairing** code to its own module: pairing.mjs, then add tests.\n- [ ] Make the marketing page's post previews load faster: cache the thumbnails.\n");
writeFileSync(join(lane, ".symbiot", "QUESTIONS.md"), "## Questions\n\n### Cache the post thumbnails on disk or in memory?\nThe previews on the marketing page are slow.\n- on disk (recommended)\n- in memory\n\n### Can I restart the app?\n- 🤖 Agent: restart it (recommended)\n- skip it\n");
const lq = a.agentQuestions(lane, "symbiot").questions;
ok("a lane's question names the open task it shares words with", lq[0].task === "Make the marketing page's post previews load faster: cache the thumbnails.", lq[0]);
ok("...else the first open one, without markdown (never a ticked one)", lq[1].task === "Move the phone pairing code to its own module: pairing.mjs, then add tests.", lq[1]);
writeFileSync(join(lane, ".symbiot", "TASKS.md"), `## Tasks\n- [ ] ${"Rework the onboarding flow so that a new user sees their own projects first and every empty screen explains itself in plain words without jargon"} today.\n`);
ok("...clipped to one line", (() => { const t = a.agentQuestions(lane, "symbiot").questions[0].task; return t.length <= 90 && t.endsWith("…"); })(), a.agentQuestions(lane, "symbiot").questions[0].task);

const hsDeps = { repos: () => ({ symbiot: lane }), board: () => ({ cards: [] }), pending: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, waits: () => [], clashes: () => [], agentGone: () => "", signedOut: () => [], stuck: () => [], drafts: () => [], agentCmd: () => "claude", marketing: () => false, doneSince: () => null,
  agents: () => [{ path: copy, name: "symbiot (beside): Make the Workdesk's question cards…", status: "done", ask: { questions: [{ ...aq.questions[0] }] } }] };
const card = homeState({ fresh: true, deps: hsDeps }).you.find((y) => y.kind === "ask");
ok("Home's card for it carries the task's line", card && card.task === "Make the Workdesk's question cards say which task they're about.", card);
// 20 Oct 2026 review, Q4: an ops run's card said only its first sentence; it says the project it's for, from the record
{ const opsA = join(C, "drafts", "act-card0001"), opsB = join(C, "drafts", "act-card0002"); for (const p of [opsA, opsB]) mkdirSync(join(p, ".symbiot"), { recursive: true });
  const q0 = { q: "Can I give my user the rights to change Tailscale settings?", options: ["👤 You (only you: your password): run that one line"] };
  const ph = homeState({ fresh: true, deps: { ...hsDeps, ledger: () => ({ handoffs: [{ from: { lane: "symbiot", path: lane }, to: { lane: "ops", path: opsA }, at: 1 }] }),
    agents: () => [{ path: opsA, name: "Agent: New job: a fixed public URL for the webhook", status: "done", ask: { questions: [q0] } }, { path: opsB, name: "Agent: Draft an email to Remy about the invoices", status: "done", ask: { questions: [{ ...q0, q: "Send the draft now?" }] } }] } }).you.filter((y) => y.kind === "ask");
  ok("an ops run's card says the project that handed it over", (ph.find((y) => y.path === opsA) || {}).project === "symbiot", ph);
  ok("…and one nothing names says none, rather than a guess", (ph.find((y) => y.path === opsB) || {}).project === "", ph); }
// 20 Oct 2026 review, finding 4: how long the Symbiot Browser has been open, on Home
{ const since = Date.now() - 25 * 60000, hb = homeState({ fresh: true, deps: { ...hsDeps, browserSince: () => since } }), hn = homeState({ fresh: true, deps: { ...hsDeps, browserSince: () => 0 } });
  ok("Home knows how long the Symbiot Browser has been open, and when it closes itself", hb.browserSince === since && hb.browserIdle === 20 && !("browserSince" in hn), [hb.browserSince, hb.browserIdle]); }
const ui = readFileSync(new URL("../ui.mjs", import.meta.url), "utf8");
ok("...and every card shows it: Home's, the Workdesk's and the phone's", /var tk=String\(y\.task\|\|''\)[^;]*;if\(tk&&[^\n]*?\)h\+="<div class='bfor' title='"\+escQ\(tk\)\+"'>for: "\+esc\(tk\)/.test(ui) && /\(q\.task\?"<div class='qfor'[^"]*"\+escQ\(q\.task\)\+"'>for: "\+esc\(q\.task\)/.test(ui) && (ui.match(/<div class='qfor'/g) || []).length === 2 && /task:q\.task/.test(ui), "");

// 20 Oct 2026 review, S2: Paddle was asked four times in new words. A question with an id is asked once.
console.log("ASKED ONCE — a question's id keeps its answer");
const ops1 = join(C, "drafts", "act-ids0001"), ops2 = join(C, "drafts", "act-ids0002");
mkdirSync(join(ops1, ".symbiot"), { recursive: true }); mkdirSync(join(ops2, ".symbiot"), { recursive: true });
writeFileSync(join(ops1, ".symbiot", "QUESTIONS.md"), "## Questions\n### Which payment company should sell Symbiot Pro? {#pro-payments}\nLemon Squeezy is dropped.\n- 🤖 Agent: Paddle (recommended)\n- 🤖 Agent: Polar\n");
const pq = a.parseQuestions(readFileSync(join(ops1, ".symbiot", "QUESTIONS.md"), "utf8")).questions[0];
ok("the id comes off the heading, so no screen shows it", pq.q === "Which payment company should sell Symbiot Pro?" && pq.id === "pro-payments", pq);
const idAns = a.answerQuestions(ops1, [{ q: "Which payment company should sell Symbiot Pro?", a: "🤖 Agent: Paddle (recommended)" }]);
ok("answered: ANSWERS.md keeps it under its words and its id", idAns.ok && /### Which payment company should sell Symbiot Pro\? \{#pro-payments\}\n🤖 Agent: Paddle/.test(readFileSync(join(ops1, ".symbiot", "ANSWERS.md"), "utf8")), idAns);
ok("…and the shared record keeps the id", JSON.parse(readFileSync(join(C, "asks-done.json"), "utf8")).some((x) => x.id === "pro-payments" && /Paddle/.test(x.a)));
ok("the same run asking it again in other words, same id: answered already", (writeFileSync(join(ops1, ".symbiot", "QUESTIONS.md"), "## Questions\n### Paddle or Polar for the Pro checkout? {#pro-payments}\nstill deciding\n- Paddle\n- Polar\n"), !a.agentQuestions(ops1, "").questions.length));
writeFileSync(join(ops2, ".symbiot", "QUESTIONS.md"), "## Questions\n### Do you still want a payment company to take the money for Pro? {#pro-payments}\nfor the checkout\n- 🤖 Agent: yes, Paddle (recommended)\n- skip it\n");
const q2 = a.agentQuestions(ops2, "");
ok("another run asking it in other words, same id: never a card, answered from the record", !q2.questions.length && q2.known && q2.known[0].id === "pro-payments" && /Paddle/.test(q2.known[0].a) && /don't ask it again/.test(q2.known[0].a), q2);
writeFileSync(join(ops2, ".symbiot", "QUESTIONS.md"), "## Questions\n### Which payment company should sell Symbiot Teams? {#teams-payments}\nfor Teams\n- Paddle\n- Polar\n");
ok("a different id is a different question, however alike the words", a.agentQuestions(ops2, "").questions.length === 1);

// 21 Oct 2026: a run asked twice whether the user had "allowed force-push in Symbiot settings for this lane".
// No such setting exists. A refused force-push is a Push it card now, and Symbiot pushes it itself on Go.
console.log("PUSH IT — a held force-push, pushed by Symbiot on the user's Go");
{ const P = await import("../pushgate.mjs"), { judge } = await import("../guard.mjs");
  const bare = join(HOME, "remote.git"), run = join(C, "drafts", "act-push0001"), other = join(HOME, "other");
  spawnSync("git", ["init", "-q", "--bare", "-b", "main", bare]); spawnSync("git", ["clone", "-q", bare, run]);
  mkdirSync(join(run, ".symbiot"), { recursive: true });
  sh(run, "commit", "-q", "--allow-empty", "-m", "base"); sh(run, "push", "-q", "origin", "main");
  sh(run, "checkout", "-q", "-b", "fix/x"); writeFileSync(join(run, "f.txt"), "1\n"); sh(run, "add", "-A"); sh(run, "commit", "-qm", "one"); sh(run, "push", "-q", "-u", "origin", "fix/x");
  const was = sh(run, "rev-parse", "HEAD").stdout.trim();
  writeFileSync(join(run, "f.txt"), "2\n"); sh(run, "commit", "-q", "-a", "--amend", "-m", "one, rewritten"); const now = sh(run, "rev-parse", "HEAD").stdout.trim();
  const held = judge("Bash", { command: "git push --force-with-lease origin fix/x" }, { cwd: run, home: HOME, branch: "fix/x" });
  const id = ((held && held.why) || "").match(/\{#push-go-([0-9a-f]+)\}/);
  ok("the guard holds it and says how to ask: no setting, one Push it option", id && /no setting allows this/.test(held.why) && /"🤖 Agent: push it"/.test(held.why), held);
  writeFileSync(join(run, ".symbiot", "QUESTIONS.md"), `## Questions\n### Should Symbiot put the rewritten fix/x branch on GitHub in place of the old one? {#push-go-${id && id[1]}}\nIt replaces one commit.\n- 🤖 Agent: push it\n`);
  const r = a.answerQuestions(run, [{ q: "Should Symbiot put the rewritten fix/x branch on GitHub in place of the old one?", a: "🤖 Agent: push it" }]);
  let ans = ""; for (let i = 0; i < 100 && !/Symbiot: the push you asked for/.test(ans); i++) { await new Promise((ok) => setTimeout(ok, 50)); ans = readFileSync(join(run, ".symbiot", "ANSWERS.md"), "utf8"); }
  const there = spawnSync("git", ["-C", bare, "rev-parse", "fix/x"], { encoding: "utf8" }).stdout.trim();
  ok("Go: Symbiot pushes it itself, and the outcome is in the run's answers", r.ok && there === now && there !== was && /Symbiot pushed fix\/x to origin itself/.test(ans), [r, there, now, ans.slice(-400)]);
  const used = JSON.parse(readFileSync(P.HOLDS(HOME), "utf8")).find((h) => h.id === id[1]);
  ok("…once: the hold is spent, and a second Go says it's done rather than pushing again", used.used && used.outcome === "pushed" && /done already/.test((await P.pushGo(id[1], { home: HOME })).text), used);
  // someone pushed to the branch after it was held: the lease fails, and nothing of theirs is lost
  writeFileSync(join(run, "f.txt"), "3\n"); sh(run, "commit", "-q", "-a", "--amend", "-m", "again"); sh(run, "fetch", "-q");
  const h2 = judge("Bash", { command: "git push -f" }, { cwd: run, home: HOME, branch: "fix/x" }).why.match(/push-go-([0-9a-f]+)/)[1];
  spawnSync("git", ["clone", "-q", "-b", "fix/x", bare, other]); sh(other, "commit", "-q", "--allow-empty", "-m", "theirs"); sh(other, "push", "-q", "origin", "fix/x");
  const theirs = sh(other, "rev-parse", "HEAD").stdout.trim(), stale = await P.pushGo(h2, { home: HOME });
  ok("…a branch someone pushed to since it was held isn't replaced: the run is told to fetch and merge", stale.error === "stale" && spawnSync("git", ["-C", bare, "rev-parse", "fix/x"], { encoding: "utf8" }).stdout.trim() === theirs && /fetch/.test(stale.text), stale);
  // a No on the card pushes nothing
  sh(run, "fetch", "-q"); const h3 = judge("Bash", { command: "git push --force origin fix/x" }, { cwd: run, home: HOME, branch: "fix/x" }).why.match(/push-go-([0-9a-f]+)/)[1];
  writeFileSync(join(run, ".symbiot", "QUESTIONS.md"), `## Questions\n### Should Symbiot replace fix/x on GitHub again? {#push-go-${h3}}\nctx\n- 🤖 Agent: push it\n`);
  a.answerQuestions(run, [{ q: "Should Symbiot replace fix/x on GitHub again?", a: "no, leave it" }]); await new Promise((ok) => setTimeout(ok, 300));
  ok("…and No pushes nothing", spawnSync("git", ["-C", bare, "rev-parse", "fix/x"], { encoding: "utf8" }).stdout.trim() === theirs && !JSON.parse(readFileSync(P.HOLDS(HOME), "utf8")).find((h) => h.id === h3).go);
  // never main, and never a hold written by hand for it
  const hp = JSON.parse(readFileSync(P.HOLDS(HOME), "utf8")); hp.push({ id: "0000beef", folder: run, remote: "origin", branch: "main", ref: "", at: Date.now() }); writeFileSync(P.HOLDS(HOME), JSON.stringify(hp));
  const mainGo = await P.pushGo("0000beef", { home: HOME });
  ok("…never the main branch, even from a hold it didn't make", mainGo.error === "refused" && /main/.test(judge("Bash", { command: "git push -f origin main" }, { cwd: run, home: HOME, branch: "fix/x" }).why), mainGo);
  const { ONLY_YOU } = await import("../handover.mjs");
  ok("the run's brief says never to offer a setting Settings doesn't have", /Never offer an option saying the user changed a Symbiot setting unless Settings has it by name/.test(ONLY_YOU)); }

sh(lane, "worktree", "remove", "--force", copy);
rmSync(HOME, { recursive: true, force: true });
console.log((fail ? "✗" : "✓") + " asks: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
