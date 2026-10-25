// The words on Home's project cards (cardwords.mjs): no shell command, host, key path or task-file
// mark on a card, one of 7 pills, and handover rows that read "To <Lane>: …" (the user's screenshot
// of 24 Oct 2026 and the design spec of 25 Oct). Pure: no HOME, no app.
//
//   node test/cardwords.mjs
//
import { pillOf, nowLine, plainSummary, plainMarks, handWords, laneName, PILLS } from "../cardwords.mjs";

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const BANNED = /~\/\.ssh|\b\d{1,3}(?:\.\d{1,3}){3}\b|\||2>&1|\bsudo\b|\[[ x~]\]/i;

// the "now" line: a verb phrase and how long it's taken, never the command
const ssh = nowLine("Ran ssh -i ~/.ssh/stevevm -o BatchMode=yes ubuntu@92.4.133.97 'sudo -n systemctl status steve'", 4 * 60000, "Symbiot");
ok("an ssh to Steve's server reads \"Checking the Steve server · 4m\" (the key's name, not the IP)", ssh === "Checking the Steve server · 4m", ssh);
const tests = nowLine(`Ran grep -n '"test"' package.json; (npm test 2>&1 | tail -15)`, 4 * 60000, "Symbiot");
ok("npm test reads \"Running Symbiot's tests · 4m\"", tests === "Running Symbiot's tests · 4m", tests);
ok("git push reads \"Pushing changes\"", nowLine("Ran git push origin HEAD") === "Pushing changes");
ok("gh pr reads \"Working on a pull request\"", nowLine("Ran gh pr create --fill") === "Working on a pull request");
ok("a command it doesn't know reads \"Working\", with its time", nowLine("Ran ./tools/xyz --flag=1 | tee out.log", 2 * 60000) === "Working · 2m", nowLine("Ran ./tools/xyz --flag=1 | tee out.log", 2 * 60000));
ok("a to-do's own words stay as they are", nowLine("Fixing the cards on Home", 30000) === "Fixing the cards on Home");
ok("an hour and more reads \"1h 5m\"", nowLine("Building the app", 65 * 60000) === "Building the app · 1h 5m");

// summaries: marks in words, commands as what they were for
const mk = plainSummary("I didn't tick any of the three tasks. Each one is waiting on something that hasn't happened yet, so I marked them [~], with what each waits on.", "Marketing");
ok("[~] reads \"marked as waiting\"", /marked them as waiting/.test(mk) && !BANNED.test(mk), mk);
ok("[x] reads \"ticked\" and [ ] \"open\"", plainMarks("2 [x], 1 [ ]") === "2 ticked, 1 open", plainMarks("2 [x], 1 [ ]"));
{
  const a = plainMarks("Shipped the sign-up fix and ticked [x] both tasks."), b = plainMarks("marked `[x]` the task"), c = plainMarks("Marked them [x]."), d = plainMarks("Marked it as [x] and moved on");
  ok("a ticked/marked right before [x] folds into one \"ticked\"", a === "Shipped the sign-up fix and ticked both tasks." && b === "ticked the task" && c === "Ticked them." && d === "Ticked it and moved on", [a, b, c, d].join(" | "));
}
const cmd = plainSummary("Ran ssh -i ~/.ssh/steve_vm ubuntu@92.4.133.97 sudo ls /srv. All good. Tests pass (npm test 2>&1 | tail).", "Steve");
ok("a summary's command sentence becomes what it did, and its words stay (no host, key path, pipe or sudo)", cmd === "Checked the Steve server. All good. Tests pass." && !BANNED.test(cmd), cmd);

// pills: only the 7
ok("a question: Asks you", pillOf({ qs: [{ q: "?" }] }) === "Asks you");
ok("something to approve: Ready for your OK", pillOf({ ready: 2 }) === "Ready for your OK" && pillOf({ shipping: "pushing" }) === "Ready for your OK");
ok("a running agent: At work", pillOf({ running: { doing: "x" } }) === "At work");
ok("stuck on a third party: Waiting on someone else", pillOf({ state: "waiting on third party" }) === "Waiting on someone else");
ok("paused: Paused", pillOf({ state: "paused" }) === "Paused");
ok("done with nothing open: Done; done with tasks waiting, or failed: Idle", pillOf({ state: "done" }) === "Done" && pillOf({ state: "done", waiting: 2 }) === "Idle" && pillOf({ state: "failed" }) === "Idle");
ok("a run that waits on you with no question left to answer isn't amber", pillOf({ state: "waiting on you" }) === "Idle");
ok("every pill is one of the 7", [{}, { qs: [1] }, { ready: 1 }, { running: {} }, { state: "paused" }, { parked: true }, { state: "done" }].every((p) => PILLS.includes(pillOf(p))));

// handover rows
ok("a question first: \"it has a question for you\"", handWords({ lane: "ops", why: "Sent: its agent asked you something first" }) === "it has a question for you");
ok("handed on again, with the second lane asking: \"Ops has a question for you\"", handWords({ lane: "steve", then: "ops", thenAsks: true, why: "Sent: its agent asked you something first" }) === "Ops has a question for you");
const on = handWords({ lane: "steve", why: "Sent: its agent is on it now", progress: { done: 0, total: 4 }, doing: "Ran ssh -i ~/.ssh/steve_vm ubuntu@92.4.133.97 uptime" });
ok("on it, with how far and what it's doing in words", on === "on it · 0 of 4 done · checking the Steve server", on);
ok("never \"Sent: …\"", !/^Sent/i.test(handWords({ lane: "ops", why: "Sent: its run ended, and what it did comes back within 20 seconds" })));

// names
ok("a folder slug reads as a name; a name stays", laneName("kaggle-squares-in-squares") === "Kaggle squares in squares" && laneName("Billing API") === "Billing API" && laneName("symbiot") === "Symbiot");

// Drift: work not saved to git, in words (the page read "1 uncommitted (0 mod / 0 del / 1 new)")
const { unsavedWords } = await import("../drift.mjs");
ok("one new file: \"1 new file not saved to git\"", unsavedWords({ dirty: 1, mod: 0, del: 0, add: 1 }) === "1 new file not saved to git");
ok("several kinds: \"3 changed, 1 deleted and 2 new files not saved to git\"", unsavedWords({ dirty: 6, mod: 3, del: 1, add: 2 }) === "3 changed, 1 deleted and 2 new files not saved to git", unsavedWords({ dirty: 6, mod: 3, del: 1, add: 2 }));

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
