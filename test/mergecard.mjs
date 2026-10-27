// A card on Home that asked "Should I merge PR 251 to publish the Vault page?" (23 Oct 2026) had
// two flaws: a green line reading "undefined has done this already: undefined" (a goal's card has a
// done of its own, a string, and the line read it as the { lane, text } of lanes.mjs doneSince), and
// the merge itself was offered after the design critic had failed the page (design.mjs heldMergeCard).
// Isolated HOME (set before the modules load).
//
//   node test/mergecard.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-mergecard-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const C = join(HOME, ".config", "symbiot");
mkdirSync(C, { recursive: true });
writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")] }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const sh = (cwd, ...a) => spawnSync("git", ["-C", cwd, "-c", "user.email=t@t", "-c", "user.name=t", ...a], { encoding: "utf8" });
const D = await import("../design.mjs");
const { homeState } = await import("../home.mjs");
const { EMBEDDED_UI } = await import("../ui.mjs");

try {
  const lane = join(HOME, "work", "app");
  mkdirSync(join(lane, ".symbiot"), { recursive: true });
  sh(lane, "init", "-q"); writeFileSync(join(lane, "a.txt"), "a\n"); sh(lane, "add", "-A"); sh(lane, "commit", "-qm", "one");
  sh(lane, "remote", "add", "origin", "https://github.com/acme/app.git");
  const mergeQ = "Should I merge PR 251 to publish the Vault page?";
  const goal = { kind: "ask", id: "goal:g1:user", path: "goal:g1", repo: "app", title: "Your goal", sub: mergeQ, q: mergeQ, options: ["I've done it", "Drop it"], goal: "g1", done: "I built the Vault page as pull request 251, version 0.81.0. Checks passed on it." };
  const asker = { path: lane, name: "app", status: "done", ask: { questions: [{ q: mergeQ, context: "", options: ["Merge it and publish 0.81.0 (recommended)", "Close it without publishing"] }] } };
  const base = { repos: () => ({ app: lane }), board: () => ({ cards: [] }), pending: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, waits: () => [], clashes: () => [], agentGone: () => "", signedOut: () => [], stuck: () => [], drafts: () => [], stalls: () => [], agentCmd: () => "claude", marketing: () => false, doneSince: () => null, cardText: () => ({}), dismissed: () => ({}), syncJobs: () => {}, intuition: () => [], overrides: () => [], browserSince: () => 0, agents: () => [], goalCards: () => [] };
  const home = (deps) => homeState({ fresh: true, deps: { ...base, ...deps } }).you;

  console.log("1) THE DONE-ALREADY LINE — only with who did it and what, never 'undefined'");
  const g = home({ goalCards: () => [goal] }).find((y) => y.id === goal.id);
  ok("a goal's card keeps what its run has done so far as its own words, and has no done-already line", g && g.done === goal.done && !g.doneBy, g);
  const stale = home({ agents: () => [asker], doneSince: () => ({ lane: "ops", text: "merged PR 251 and published 0.81.0" }) }).find((y) => y.path === lane);
  ok("work another lane has done: the card names that lane's agent and what it did, Close it first", stale && stale.doneBy && stale.doneBy.lane === "ops" && /^Close it: ops's agent has done this already \(merged PR 251/.test(stale.options[0]), stale);
  for (const [why, r] of [["no lane", { text: "merged it" }], ["no words", { lane: "ops", text: "" }], ["an empty record", {}]]) {
    const y = home({ agents: () => [asker], doneSince: () => r }).find((x) => x.path === lane);
    ok(`…and with ${why}, no line and no Close it: the agent's own options stand`, y && !y.doneBy && !/Close it:/.test(y.options[0]) && y.options[0] === asker.ask.questions[0].options[0], y);
  }
  // the card as the page draws it (ui.mjs blobBody)
  const js = [...EMBEDDED_UI.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const grab = (name) => { const i = js.indexOf("function " + name + "("); let depth = 0, j = js.indexOf("{", i); for (; j < js.length; j++) { if (js[j] === "{") depth++; else if (js[j] === "}" && --depth === 0) break; } return js.slice(i, j + 1); };
  const draw = new Function(["esc", "escQ", "projChip", "lqShort", "blobOpt", "whoHtml", "bdKey", "blobTalk", "draftHtml", "goLines"].map(grab).join("\n") + "\nfunction codeText(t){return esc(t);}\nvar BLOBTALK={};\n" + grab("blobBody") + "\nreturn blobBody;")();
  const gHtml = draw({ ...goal, name: "app" }, true), sHtml = draw({ ...stale, name: "app" }, true);
  ok("drawn: a goal's card says what its run has done, and nowhere 'undefined'", !/undefined/.test(gHtml) && !/bdone/.test(gHtml) && /So far: I built the Vault page/.test(gHtml), gHtml.slice(0, 600));
  ok("drawn: a done-already line names who did it and what they did", /<div class='bdone'[^>]*>Already done by ops&#39;s agent: merged PR 251 and published 0\.81\.0<\/div>/.test(sHtml) && !/undefined/.test(sHtml), sHtml.slice(0, 900));
  ok("drawn: a doneBy missing its lane or words draws no line", !/bdone/.test(draw({ ...stale, name: "app", doneBy: { text: "x" } }, true)) && !/bdone/.test(draw({ ...stale, name: "app", doneBy: { lane: "ops" } }, true)));

  console.log("2) NO MERGE CARD WHILE THE DESIGN REVIEW FAILS IT");
  const fixes = ["PIN lockout: the locked state shows no time left", "Names: entries show raw ids", "Type: four sizes on the list"];
  const asks = (deps) => home(deps).filter((y) => /merge PR 251/.test(y.q || ""));
  ok("nothing under review: the merge card asks as it did, the agent's or the goal's", asks({ agents: () => [asker] }).length === 1 && asks({ goalCards: () => [goal] }).length === 1);
  D.noteOpen(lane, { "Build the Vault page": { rounds: 1, at: Date.now(), fixes } }, { slug: "acme/app" });
  const judging = [...home({ agents: () => [asker] }), ...home({ goalCards: () => [goal] })];
  ok("sent back with fixes (its builder is on them): no merge card on Home, from the agent or the goal, found by the repo's own remote", !judging.some((y) => /merge/i.test([y.q, y.sub].join(" "))), judging);
  ok("…and the guard still holds the merge itself", D.holdsMerge("acme/app").length === 1);
  D.noteOpen(lane, { "Build the Vault page": { rounds: 2, at: Date.now(), failed: true, fixes } }, { slug: "acme/app" });
  ok("failed after the last round: kept with what still fails, holding no merge (the user's call)", D.holdsMerge("acme/app").length === 0 && D.reviewHolds("acme/app").length === 1 && D.reviewHolds("acme/app")[0].failed && D.reviewHolds("acme/app")[0].fixes.length === 3, D.reviewHolds("acme/app"));
  const fa = home({ agents: () => [asker] }).find((y) => y.path === lane), fg = home({ goalCards: () => [goal] }).find((y) => y.id === goal.id);
  ok("its card says PR 251 isn't ready and what's still missing", fa && fa.q === "PR 251 isn't ready to merge: 3 design review fixes left." && /^Still missing: PIN lockout/.test(fa.why) && fa.why.includes("Names: entries show raw ids") && /isn't ready/.test(fa.sub) && /holding PR 251 back until the design review passes/.test(fa.doing), fa);
  ok("…and offers no merge or publish, only the way that doesn't", fa && fa.options.length === 1 && fa.options[0] === "Close it without publishing" && !/I built|Checks passed/.test(fa.doing), fa && fa.options);
  ok("the goal's card the same, without its 'checks passed' summary or a done-already line", fg && /^PR 251 isn't ready/.test(fg.q) && !fg.done && !fg.doneBy && fg.options.join() === "Drop it" && fg.held, fg);
  const labelled = D.heldMergeCard({ ...goal, labels: ["I've merged it myself", "Close it without publishing"], tips: ["a", "b"], rec: 0 }, () => [{ item: "x", failed: true, fixes }]);
  ok("a card writer's label that merges ('I've merged it myself') goes with its option, labels and tips kept in step", labelled.options.join() === "Drop it" && labelled.labels.join() === "Close it without publishing" && labelled.tips.join() === "b" && labelled.rec === undefined, labelled);
  const other = { kind: "ask", path: lane, repo: "app", q: "Which of the two logos should the page use?", options: ["The round one", "The square one"] };
  ok("a card that isn't about merging or publishing is left as it is", D.heldMergeCard(other, () => [{ item: "x", failed: false, fixes }]) === other);
  ok("…nor one about merge conflicts or releasing a hold", ["Should I fix the merge conflicts on the branch?", "Can I release the hold on the domain?"].every((q) => { const c = { ...other, q }; return D.heldMergeCard(c, () => [{ item: "x", failed: false, fixes }]) === c; }));
  ok("…but one to ship or release a version is a merge card", [D.heldMergeCard({ ...other, q: "Can I release 0.81.0 now?" }, () => [{ item: "x", failed: false, fixes }]), D.heldMergeCard({ ...other, q: "Should I ship it?" }, () => [{ item: "x", failed: false, fixes }])].every((c) => c === null));
  ok("…and a merge card in a repo with nothing held, too", D.heldMergeCard(goal, () => []) === goal);
  D.noteOpen(lane, { "Build the Vault page": { rounds: 2, passed: true } }, { slug: "acme/app" });
  ok("passed: the merge card is back as it asked", home({ agents: () => [asker] }).some((y) => y.path === lane && y.q === mergeQ && /^Merge it/.test(y.options[0])));
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} mergecard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
