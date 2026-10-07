// An agent's allow list inside the owner's work turns on by itself (agents.mjs autoAllow):
// no question for the user. Outside it (~/.ssh, ~/.config, another machine), it still asks.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-autoallow-"));
process.env.HOME = HOME;
const C = join(HOME, ".config", "symbiot");
mkdirSync(join(HOME, "work", "Company"), { recursive: true });
mkdirSync(C, { recursive: true });
writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")], knowledgeFolders: [join(HOME, "work", "Company")] }));
const a = await import("../agents.mjs");

let pass = 0, fail = 0;
function ok(name, cond, got) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + "  got: " + JSON.stringify(got).slice(0, 300)); } }

console.log("YOUR WORK — what agents reach, and what turns on without asking");
ok("inside the folders you gave Symbiot is your work; a hidden folder at the top of home, or outside them, isn't", a.inWork(join(HOME, "work", "Company", "x.md")) && !a.inWork(join(HOME, ".ssh")) && !a.inWork(join(HOME, ".config", "symbiot", "config.json")) && !a.inWork("/etc/passwd") && a.inWork(join(C, "drafts", "act-1")), "");

const run = join(C, "drafts", "act-test"), s = join(run, ".symbiot");
mkdirSync(s, { recursive: true });
const ask = (q) => writeFileSync(join(s, "QUESTIONS.md"), `## Questions\n\n### ${q}\nI can't reach it yet.\n- 👤 You (only you: a permission): allow the list in .symbiot/allowlist.proposed.json\n- skip it for now\n`);
const propose = (allow, dirs = []) => writeFileSync(join(s, "allowlist.proposed.json"), JSON.stringify({ permissions: { allow, deny: ["Bash(rm:*)"], additionalDirectories: dirs } }));

ask("still can't reach ~/Company, allow it?");
propose([`Read(${HOME}/work/Company/**)`, `Bash(find ${HOME}/work/Company:*)`, "Bash(cat:*)"], [join(HOME, "work", "Company")]);
ok("a list inside your work, nothing wide or publishing, can go on without asking", a.allowlistInWork(run).ok === true, a.allowlistInWork(run));
const r1 = a.autoAllow(run);
const local = existsSync(join(run, ".claude", "settings.local.json")) ? JSON.parse(readFileSync(join(run, ".claude", "settings.local.json"), "utf8")) : {};
const answers = existsSync(join(s, "ANSWERS.md")) ? readFileSync(join(s, "ANSWERS.md"), "utf8") : "";
ok("...when the run ends it's turned on for that folder, Symbiot's config still off limits", r1 && r1.allowed && local.permissions && local.permissions.allow.includes("Bash(cat:*)") && local.permissions.deny.some((d) => /config\.json/.test(d)), [r1, local]);
ok("...its question is answered for the user, so it never reaches them", /### still can't reach ~\/Company, allow it\?\nSymbiot turned your list on/.test(answers) && a.agentQuestions(run, "").questions.length === 0, answers);
ok("...once per proposal: the same list again isn't turned on again (no loops)", (ask("still can't reach ~/Company, allow it?"), a.autoAllow(run)) === null, "");

ask("allow the tunnel?");
propose(["Bash(cloudflared:*)", `Read(${HOME}/.cloudflared/**)`], [join(HOME, ".cloudflared")]);
const r2 = a.autoAllow(run);
ok("a list reaching outside your work (~/.cloudflared) still asks you, and says why", r2 && r2.asked && /outside your work: .*\.cloudflared/.test(r2.why), r2);
propose(["Bash(git push:*)"]);
ok("...as does one that publishes or reaches another machine", /publishes/.test(a.allowlistInWork(run).why || ""), a.allowlistInWork(run));
propose(["Bash(bash:*)"]);
ok("...and one that could run anything", /wide/.test(a.allowlistInWork(run).why || ""), a.allowlistInWork(run));
const cmd = a.withScope('claude -p "{prompt}"', run);
ok("an agent reaches your knowledge folders from the start", cmd.includes(`--add-dir "${join(HOME, "work", "Company")}"`), cmd);

rmSync(HOME, { recursive: true, force: true });
console.log((fail ? "✗" : "✓") + " autoallow: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
