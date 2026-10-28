// An option the user firmly turned down is never offered again (asksdone.mjs addRejected,
// dropRejected; mind.mjs converse). 28 Oct 2026: chat listed "fix CI billing and auto-merge"
// after the user had said they never would. Isolated HOME (set before the modules load).
//
//   node test/rejected.mjs
//
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-rejected-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const A = await import("../asksdone.mjs");

console.log("nothing rejected: a reply stays as it is");
const reply = "Why the prod box looks negative:\n1) the check runs against a cold cache\n2) retry it in the morning\n3) fix CI billing and auto-merge\nWhich one?";
ok("unchanged", A.dropRejected(reply).reply === reply && !A.dropRejected(reply).dropped.length);
ok("no brief section", !A.rejectedBrief().length);

console.log("the user turns an option down");
ok("saved", A.addRejected("fix CI billing and auto-merge"));
ok("the same option twice is kept once", A.addRejected("Fix CI billing and auto-merge") && A.rejectedList().length === 1);
ok("every brief lists it", /never offer these again[\s\S]*fix CI billing and auto-merge/i.test(A.standingBrief().join("\n")));
const cut = A.dropRejected(reply);
ok("the line that offers it goes", !/billing/.test(cut.reply) && /cold cache/.test(cut.reply) && /retry it/.test(cut.reply), cut);
ok("and says what it left out", /^fix CI billing and auto-merge$/i.test(cut.dropped[0]), cut);
ok("a line in other words goes too", !/billing/.test(A.dropRejected("- Sort out the CI billing so auto-merge works\n- wait a day").reply));
ok("an unrelated line is kept", /wait a day/.test(A.dropRejected("- Sort out the CI billing so auto-merge works\n- wait a day").reply));
ok("plain prose is never cut", A.dropRejected("You said no to fixing CI billing and auto-merge.").reply.includes("auto-merge"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
