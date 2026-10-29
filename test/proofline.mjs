// Garth (29 Oct 2026): "i see it working but i dont believe it at all because theres no substance to display it".
// A status on Home carries its evidence: a PR as GitHub says it now, a report on Reports, the live agent's last step
// and run time; a status nothing confirms reads "unverified", never done.
//
//   node test/proofline.mjs
//
import { proofOf, UNVERIFIED } from "../evidence.mjs";
import { pillOf } from "../cardwords.mjs";
import { prLive } from "../probes.mjs";

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const now = Date.now(), dir = "/x/symbiot";

console.log("1) done, checked against GitHub");
let pr = proofOf({ state: "done", summary: "PR #336 merged and released." }, { now, dir, info: () => ({ state: "merged", sha: "ab12cd3", at: "2026-10-29", url: "https://github.com/GAWdessey/symbiot/pull/336", checks: "3 of 3 passed" }) });
ok("a PR GitHub says is merged: verified, with number and commit", pr.kind === "verified" && /PR #336 merged · ab12cd3/.test(pr.line), pr);
ok("its rows hold the state, commit, checks and link", pr.rows.some((r) => /merged on 2026-10-29/.test(r)) && pr.rows.includes("Commit on main: ab12cd3") && pr.rows.some((r) => /3 of 3/.test(r)) && pr.rows.some((r) => /pull\/336$/.test(r)), pr.rows);
pr = proofOf({ state: "done", summary: "PR 336 merges by itself once CI passes." }, { now, dir, info: () => ({ state: "open", conflicts: true }) });
ok("'merges by itself' while GitHub says conflicts: contradicted, not done", pr.kind === "contradicted" && /has conflicts/.test(pr.line), pr);
pr = proofOf({ state: "idle", conflicts: ["#336"], summary: "x" }, { now, dir, info: () => ({ state: "open", conflicts: true }) });
ok("a card whose PR conflicts shows GitHub's word whatever its state", pr.kind === "contradicted" && /#336/.test(pr.line), pr);
pr = proofOf({ state: "done", summary: "PR #7 is done." }, { now, dir, info: () => ({ state: "closed" }) });
ok("closed unmerged is never 'merged'", pr.kind === "contradicted" && /closed without merging/.test(pr.line), pr);

console.log("2) done with no PR");
pr = proofOf({ state: "done", summary: "Wrote the notes in NOTES.md" }, { now, dir, reports: [{ id: "r1", name: "NOTES.md", title: "The notes" }] });
ok("a report it names that is on Reports: verified, with the report's title", pr.kind === "verified" && /The notes/.test(pr.line) && pr.report.id === "r1", pr);
pr = proofOf({ state: "done", summary: "All finished, everything works." }, { now, dir });
ok("nothing checkable: 'unverified: the agent says so, nothing confirms it'", pr.kind === "unverified" && pr.line === UNVERIFIED, pr);
pr = proofOf({ state: "done", summary: "PR #50 merged." }, { now, dir, info: () => null });
ok("a PR GitHub hasn't answered about yet is unverified, not merged", pr.kind === "unverified" && /not answered/.test(pr.rows[0]), pr);
ok("the pill says Unverified, and Done only when confirmed", pillOf({ state: "unverified" }) === "Unverified" && pillOf({ state: "done" }) === "Done");

console.log("3) running, from the live agent");
pr = proofOf({ running: { doing: "x" }, state: "at work" }, { now, live: { startedAt: now - 12 * 60000, step: "Edit home.mjs" } });
ok("running shows how long and its last step", pr.kind === "running" && /Running 12 min · last step: Edit home\.mjs/.test(pr.line), pr);
pr = proofOf({ running: { doing: "x" } }, { now, live: null });
ok("'running' with no live agent is unverified", pr.kind === "unverified" && /no live agent/.test(pr.line), pr);

console.log("4) nothing claimed, nothing shown");
ok("idle, waiting and asking cards have no proof line", proofOf({ state: "idle" }, { now }) === null && proofOf({ state: "done", waiting: 2 }, { now }) === null);

console.log("5) prLive.info carries what GitHub said");
prLive.clear();
const gh = async () => JSON.stringify({ state: "MERGED", mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN", url: "https://github.com/o/r/pull/9", mergedAt: "2026-10-29T10:00:00Z", mergeCommit: { oid: "deadbeef1234" }, statusCheckRollup: [{ conclusion: "SUCCESS", detailsUrl: "https://github.com/o/r/actions/runs/777/job/1" }] });
const git = async () => "https://github.com/o/r.git";
ok("no look yet: nothing claimed", prLive("/d", 9, { gh, git }) === "" && prLive.info("/d", 9) === null);
await prLive.wait("/d", 9);
const inf = prLive.info("/d", 9);
ok("after it: state, short commit, date, link, check run id", inf && inf.state === "merged" && inf.sha === "deadbee" && inf.at === "2026-10-29" && inf.url.endsWith("/pull/9") && /1 of 1 passed, run 777/.test(inf.checks), inf);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
