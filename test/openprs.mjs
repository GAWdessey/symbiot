// Garth (29 Oct 2026): "why don't I get told there are PRs waiting for me to merge?" Every open, mergeable PR on a
// lane's own repo is a card under "Only the user can do", read live from GitHub through that lane's remote, and gone
// once it merges or closes. Conflicting, failing and draft PRs are a fix run's job, not a merge for the user.
//
//   node test/openprs.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-openprs-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const sh = (cwd, ...a) => spawnSync("git", ["-C", cwd, ...a], { encoding: "utf8" });
const { openPrCards } = await import("../probes.mjs");

try {
  const a = join(HOME, "a"), b = join(HOME, "b"), c = join(HOME, "c");
  for (const [d, u] of [[a, "https://github.com/GAWdessey/symbiot.git"], [b, "git@github.com:Acme/widgets.git"], [c, "https://github.com/flutter/flutter.git"]]) { mkdirSync(d, { recursive: true }); sh(d, "init", "-q"); sh(d, "remote", "add", "origin", u); }
  const pr = (number, extra = {}) => ({ number, title: `Title ${number}`, url: `https://github.com/x/y/pull/${number}`, body: "<!-- c -->\nFixes the thing", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", autoMergeRequest: null, statusCheckRollup: [{ conclusion: "SUCCESS" }], ...extra });
  let board = { "GAWdessey/symbiot": [pr(333, { autoMergeRequest: { enabledAt: "x" }, statusCheckRollup: [{ status: "IN_PROGRESS" }] }), pr(334, { mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" }), pr(335, { isDraft: true }), pr(336, { statusCheckRollup: [{ conclusion: "FAILURE" }] })], "Acme/widgets": [pr(598, { author: { login: "GarthGhostai" } }), pr(599, { author: { login: "someone" } })], "flutter/flutter": [pr(195579, { author: { login: "GarthGhostai" } })] };
  const asked = [];
  const perms = { "GAWdessey/symbiot": { push: true }, "Acme/widgets": { push: true }, "flutter/flutter": { pull: true } };
  const gh = async (args) => { asked.push(args.join(" ")); if (args[0] === "api") return JSON.stringify(perms[args[1].slice(6)] || {}); return JSON.stringify(board[args[args.indexOf("-R") + 1]]); };
  console.log("1) each lane's own repo, mergeable PRs only");
  openPrCards.clear();
  const map = { symbiot: a, widgets: b, flutter: c };
  openPrCards(map, { gh });
  await openPrCards.wait();
  const cards = openPrCards(map, { gh });
  ok("asked GitHub for each lane's own remote, never another repo", asked.filter((x) => /^pr list/.test(x)).length === 2 && asked.some((x) => x.includes("-R GAWdessey/symbiot")) && asked.some((x) => x.includes("-R Acme/widgets")), asked);
  ok("a mergeable PR on each repo is a card, a conflicting, draft or failing one is not", cards.map((c) => c.id).sort().join() === "pr:Acme/widgets#598,pr:Acme/widgets#599,pr:GAWdessey/symbiot#333", cards.map((c) => c.id));
  const c598 = cards.find((c) => /598/.test(c.id)), c333 = cards.find((c) => /333/.test(c.id));
  ok("the card has its link, title, what it fixes and who merges", c598.url.endsWith("/598") && /Title 598/.test(c598.title) && /Fixes the thing/.test(c598.sub) && /auto-merge is off/.test(c598.sub) && c598.repo === "widgets", c598);
  ok("one behind CI with auto-merge on says so", /CI is still running/.test(c333.sub) && /merges itself/.test(c333.sub), c333.sub);
  ok("a repo he has no push on makes no card even for a PR his own login opened; a repo he owns still does", !cards.some((c) => /195579/.test(c.id)) && !asked.some((x) => /^pr list -R flutter/.test(x)) && cards.some((c) => /598/.test(c.id)), cards.map((c) => c.id));
  console.log("2) it clears when the PR merges");
  board["Acme/widgets"] = [];
  openPrCards(map, { gh, now: Date.now() + 3 * 60000 }); await openPrCards.wait();
  ok("the next look drops it", !openPrCards(map, { gh }).some((c) => /598/.test(c.id)));
  console.log("3) Home");
  const { homeState } = await import("../home.mjs");
  const st = homeState({ fresh: true, deps: { repos: () => ({ widgets: b }), openPrs: () => [mergeOne()], board: () => ({ cards: [] }), pending: () => [], agents: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, waits: () => [], clashes: () => [], agentGone: () => "", signedOut: () => [], stuck: () => [], drafts: () => [], stalls: () => [], tasks: () => [], rootsSet: () => true, marketing: () => false, dismissed: () => ({}), cardText: () => ({}), syncJobs: () => {}, intuition: () => [], overrides: () => [], reviewHolds: () => [], pairedPhone: () => false, goalCards: () => [], troubles: () => [] } });
  ok("Home shows it under Only the user can do", st.you.some((y) => y.kind === "merge" && y.url), st.you);
  function mergeOne() { return { ...c333 }; }
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
