// "Record this walk-through" (walkthrough.mjs): the plan says up front which steps need the user.
//   node test/walkthrough.mjs
import { planWalkthrough, walkthroughText, walkthroughBrief } from "../walkthrough.mjs";
import { browserBrief, CHROME_READ } from "../browserfails.mjs";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const p = planWalkthrough(["Open the dashboard", "Sign in with Google", "Enter the code sent by SMS", "Tap your security key", "Click New project", "Already signed in to the console"], { title: "Demo", site: "example.com" });
ok("six steps", p.steps.length === 6, p.steps);
ok("sign-in needs the password", p.steps[1].needs === "password");
ok("an SMS code needs the phone", p.steps[2].needs === "phone");
ok("a security key is named", p.steps[3].needs === "key");
ok("plain clicks are the agent's", p.steps[0].by === "agent" && p.steps[4].by === "agent");
ok("'already signed in' needs nothing", p.steps[5].by === "agent");
const t = walkthroughText(p);
ok("text says up front which steps are yours", /3 steps need you/.test(t) && /step 2 needs your password/.test(t) && /step 3 needs your phone/.test(t), t);
ok("nothing-needed plan says so", /Nothing here needs your password or phone/.test(walkthroughText(planWalkthrough(["Open the page", "Scroll down"]))));
ok("brief points at gif_creator, not the hidden browser", /gif_creator/.test(walkthroughBrief([])) && /hidden browser/.test(walkthroughBrief([])));
ok("brief names the sites acting is on for", /`a\.com`/.test(walkthroughBrief(["a.com"])));
ok("the recorder is allowed in a run", CHROME_READ.includes("mcp__claude-in-chrome__gif_creator"));
ok("every brief with Chrome ready carries it", browserBrief(true, []).some((l) => /walk-through/.test(l)) && !browserBrief(false, []).some((l) => /walk-through/.test(l)));
if (existsSync(new URL("../node_modules", import.meta.url))) {
const out = execFileSync(process.execPath, ["index.mjs", "walkthrough", "Demo", "--step", "Sign in", "--step", "Click Go"], { encoding: "utf8", env: { ...process.env, SYMBIOT_NO_UPDATE: "1" } });
ok("the command prints the plan", /1 step needs|One step needs/.test(out) && /\[you\] Sign in/.test(out), out);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
