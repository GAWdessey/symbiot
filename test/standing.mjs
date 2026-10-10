// Standing rules: the clerk rule is in every brief, and a rule agreed in chat joins it.
//
//   node test/standing.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const HOME = mkdtempSync(join(tmpdir(), "symbiot-standing-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 300) : "")); } };
const { addRule, standingList, standingBrief } = await import("../asksdone.mjs");
try {
  console.log("STANDING RULES");
  const b0 = standingBrief().join("\n");
  ok("clerk rule is always in the brief", /capable clerk/.test(b0) && /ONE question/.test(b0), b0);
  ok("never asks to close the Symbiot Browser", /Never ask the user to close/.test(b0));
  ok("never guesses a provider: checks the MX records first", /Never name a provider you haven't confirmed/.test(b0) && /MX/.test(b0));
  ok("a chat rule is saved and appears in the brief", addRule("Main inbox is garthwhite507@gmail.com, don't ask which mailbox") && /which mailbox/.test(standingBrief().join("\n")));
  addRule("main inbox is garthwhite507@gmail.com  don't ask which mailbox!");
  ok("the same rule worded again isn't doubled", standingList().length === 1, standingList());
  ok("an empty rule is refused", addRule("  ") === false);
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
