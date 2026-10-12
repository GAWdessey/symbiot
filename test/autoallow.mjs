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

// Marketing, 2026-10-11: a list that only takes access away (a deny rule, nothing
// allowed) was dropped, so the click did nothing and the run waited on it for good.
ask("lock marketing out of symbiot's code?");
propose([], []); writeFileSync(join(s, "allowlist.proposed.json"), JSON.stringify({ permissions: { allow: [], deny: [`Edit(/${HOME}/work/Company/**)`], additionalDirectories: [] } }));
a.autoAllow(run);
const l2 = JSON.parse(readFileSync(join(run, ".claude", "settings.local.json"), "utf8"));
ok("a list that only denies is turned on too (it takes access away)", l2.permissions.deny.includes(`Edit(/${HOME}/work/Company/**)`) && a.agentQuestions(run, "").questions.length === 0, l2.permissions.deny);

// Daaymn, 2026-10-11: a script run by its path in the project, and a check of a public URL,
// were read as folders outside the work (/scripts/…, /dev/null, //host).
propose(["Bash(python3 supabase/scripts/test_account.py)", "Bash(curl -s -o /dev/null -w * https://example.supabase.co/storage/v1/object/public/x/*)"]);
ok("a script in the project and a URL check stay inside your work", a.allowlistInWork(run).ok === true, a.allowlistInWork(run));
propose(["Bash(curl -X POST https://example.com/api -d *)"]);
ok("...but a curl that sends something goes out, so it asks", /publishes/.test(a.allowlistInWork(run).why || ""), a.allowlistInWork(run));
ok("...and a question about the live project is never picked for you", a.autoPick({ context: "", q: "Run the seeding on the live Supabase project?", options: ["🤖 Agent: run it (recommended)", "skip"] }) === "", "");

ask("allow the tunnel?");
propose(["Bash(cloudflared:*)", `Read(${HOME}/.cloudflared/**)`], [join(HOME, ".cloudflared")]);
const r2 = a.autoAllow(run);
ok("a list reaching outside your work (~/.cloudflared) still asks you, and says why", r2 && r2.asked && /outside your work: .*\.cloudflared/.test(r2.why), r2);
propose(["Bash(git push:*)"]);
ok("...as does one that publishes or reaches another machine", /publishes/.test(a.allowlistInWork(run).why || ""), a.allowlistInWork(run));
propose(["Bash(bash:*)"]);
ok("...and one that could run anything", /wide/.test(a.allowlistInWork(run).why || ""), a.allowlistInWork(run));
// The Daaymn screen-recording list of 2026-10-11: tools in ~/.local/bin and the marketing
// lane's own folder are not "outside your work", so it goes on without a card.
propose(["Bash(flutter build apk --debug --dart-define=ALLOW_SCREEN_RECORDING=true)", `Bash(${HOME}/.local/bin/adb:*)`, `Bash(${HOME}/.local/bin/ffmpeg:*)`], [join(HOME, "work", "daaymn"), join(C, "marketing", "automation")]);
ok("a program run from ~/.local/bin, and the marketing lane's folder, are your work", a.allowlistInWork(run).ok === true, a.allowlistInWork(run));
propose([`Bash(${HOME}/.local/bin/adb push ${HOME}/.ssh/id_ed25519:*)`]);
ok("...but a path it hands that program still counts (~/.ssh asks you)", /outside your work: .*\.ssh/.test(a.allowlistInWork(run).why || ""), a.allowlistInWork(run));
propose([`Bash(${HOME}/.ssh/run.sh:*)`]);
ok("...and a script that isn't in a bin folder is judged by where it lives", /outside your work: .*\.ssh/.test(a.allowlistInWork(run).why || ""), a.allowlistInWork(run));
// An agent's own recommendation, when it's a step it takes itself and nothing outward,
// is picked for the user (agents.mjs autoPick): no card.
const pick = (q, options) => a.autoPick({ q, context: "", options });
ok("the agent's own undoable recommendation is picked for you", /can't reproduce/.test(pick("How should I close this task?", ["🤖 Agent: close it as \"can't reproduce\" with these findings (recommended)", "👤 You (only you: a decision): tell me which card you saw"])), "");
ok("...but not when the recommendation is your step", pick("Phone isn't showing up?", ["👤 You (only you: the phone in your hand): plug it in (recommended)", "🤖 Agent: skip the phone check"]) === "", "");
ok("...nor when it goes out, touches money, an account or a machine", ["Approve it as it is?", "Publish 0.62.2 now?", "Start the tunnel on your PC again?", "Restart Symbiot to bind the port?", "Switch your default to Sonnet?", "Move the bank alerts back to the inbox?"].every((q) => pick(q, ["🤖 Agent: do it (recommended)", "Leave it"]) === ""), "");
ok("...nor when it states a fact before its 🤖 tag: only the user knows it", pick("Has the company registration come through?", ["Yes, it's through. 🤖 Agent: carry on with the bank account forms (recommended)", "Not yet. 🤖 Agent: wait for it"]) === "", "");
ok("...nor when it has no 🤖 tag at all", pick("How did the router restart go?", ["it reconnected by itself (recommended)", "it didn't"]) === "", "");
ok("...but a bolded 🤖 tag is still an action", /close it/.test(pick("How should I close this task?", ["**🤖 Agent:** close it as \"can't reproduce\" (recommended)", "Leave it open"])), "");
ok("...nor when there's no single recommendation", pick("Which layout?", ["🤖 Agent: grid", "🤖 Agent: list"]) === "", "");
// A lane whose run ended with open tasks starts again by itself, while it gets somewhere.
const lane = join(C, "drafts", "act-lane"); mkdirSync(join(lane, ".symbiot"), { recursive: true });
writeFileSync(join(lane, ".symbiot", "agent.log"), "=== x ===\n");
const started = [], go = (p) => { started.push(p); return { id: "r" + started.length }; }, later = Date.now() + 5 * 60000, runs = () => [{ path: lane }];
writeFileSync(join(lane, ".symbiot", "TASKS.md"), "- [x] one\n- [ ] two\n- [ ] three\n");
ok("a lane with open tasks and no run going starts again", a.continueLanes({ now: later, run: go, runs }).length === 1, started);
ok("...but not again while nothing more got ticked (no loop on a stuck lane)", a.continueLanes({ now: later, run: go, runs }).length === 0, started);
writeFileSync(join(lane, ".symbiot", "TASKS.md"), "- [x] one\n- [x] two\n- [ ] three\n");
ok("...and again once its last run ticked another", a.continueLanes({ now: later + 1, run: go, runs }).length === 1, started);
writeFileSync(join(lane, ".symbiot", "TASKS.md"), "- [x] one\n- [x] two\n- [x] three\n");
ok("...and never when everything's ticked", a.continueLanes({ now: later + 2, run: go, runs }).length === 0, started);
writeFileSync(join(lane, ".symbiot", "TASKS.md"), "- [ ] four\n");
ok("...nor within two minutes of its last run", a.continueLanes({ now: Date.now(), run: go, runs }).length === 0, started);
// ssh to a host this computer already knows is the owner's own machine (agents.mjs toKnownHost)
const known = (h) => h === "92.4.133.97";
ok("ssh, scp or rsync to a host this computer already knows is your own machine", ["Bash(ssh ubuntu@92.4.133.97:*)", "Bash(scp:* ubuntu@92.4.133.97:*)", "Bash(ssh -o BatchMode=yes ubuntu@92.4.133.97:*)"].every((r) => a.toKnownHost(r, known)), "");
ok("...but not a host it has never met, a wildcard host, or a push", !a.toKnownHost("Bash(ssh root@other.example:*)", known) && !a.toKnownHost("Bash(ssh ubuntu@*:*)", known) && !a.toKnownHost("Bash(git push:*)", known), "");
// a list too wide to turn on goes back to the agent, never to the user
ask("can I run my build script?");
propose(["Bash(bash /tmp/build.sh)"]);
const rw = a.autoAllow(run);
ok("a list too wide to turn on is sent back to the agent to write out, not shown to you", rw && rw.narrower && /write each command out exactly/i.test(readFileSync(join(s, "ANSWERS.md"), "utf8")), rw);
// what still reaches you reads in plain words with an Allow button
const { plainAsk } = await import("../home.mjs");
propose(["Bash(symbiot screens:*)", "Bash(git status)"]);
const card = plainAsk(run, { q: "Can I run Symbiot's Screens command?", options: ["👤 You (only you: a permission): allow the list in .symbiot/allowlist.proposed.json (recommended)", "Not now"] });
ok("a permission card lists the commands in plain words with Allow, and shows no file path", /run symbiot/.test(card.q) && /run git/.test(card.q) && card.labels[0] === "Allow (recommended)" && !/\.json|\.symbiot/.test(card.q + card.labels.join()), card);
const cmd = a.withScope('claude -p "{prompt}"', run);
ok("an agent reaches your knowledge folders from the start", cmd.includes(`--add-dir "${join(HOME, "work", "Company")}"`), cmd);

// Answering a card on Home (the whatsapp_module Allow pressed again and again with
// nothing happening, 2026-10-12): the card shows the question in plain words, but its
// answer is saved under the agent's own words, from a button or typed in.
console.log("ANSWERING ON HOME — what a card sends is saved, once");
writeFileSync(join(C, "runs.json"), JSON.stringify([{ path: run, name: "Agent: ops", startedAt: Date.now() }]));
const permQ = "Can I reach sts-prod myself to put the WhatsApp module back?";
writeFileSync(join(s, "ANSWERS.md"), "# Answers\n");
writeFileSync(join(s, "QUESTIONS.md"), `## Questions\n\n### ${permQ}\nBoth handovers died.\n- 👤 You (only you: a permission): allow the list in .symbiot/allowlist.proposed.json (recommended)\n- 👤 You (only you: starting another lane): ask ops directly\n`);
propose(["Bash(ssh sts-prod:*)", "Bash(scp:*)"]);
const permCard = plainAsk(run, a.agentQuestions(run, "").questions[0]);
ok("1) a permission card shows plain words, and keeps the agent's own question to answer it by", permCard.q !== permQ && permCard.raw === permQ, permCard);
ok("...whose plain words alone matched no question: why Allow did nothing", !!a.answerQuestions(run, [{ q: permCard.q, a: "x" }]).error, "");
const allow = a.answerQuestions(run, [{ q: permCard.raw || permCard.q, a: "👤 You (only you: a permission): allow the list in .symbiot/allowlist.proposed.json (recommended)" }]);
const local2 = existsSync(join(run, ".claude", "settings.local.json")) ? JSON.parse(readFileSync(join(run, ".claude", "settings.local.json"), "utf8")) : {};
ok("...and Allow, sent the way the card sends it, is saved and turns the list on", allow.ok && allow.saved === 1 && (local2.permissions.allow || []).includes("Bash(ssh sts-prod:*)") && a.agentQuestions(run, "").questions.length === 0, [allow, local2]);
const again = a.answerQuestions(run, [{ q: permCard.raw, a: "👤 You (only you: a permission): allow the list in .symbiot/allowlist.proposed.json (recommended)" }]);
const count = (t) => (readFileSync(join(s, "ANSWERS.md"), "utf8").match(new RegExp("### " + t.replace(/[?.]/g, "\\$&"), "g")) || []).length;
ok("2) pressed again, it says it's answered already and adds no second answer", again.ok && again.already && count(permQ) === 1, again);
const ownQ = "Which folder is ~/work/site/index.md in, the old one or `site/new.md`?";
writeFileSync(join(s, "QUESTIONS.md"), `## Questions\n\n### ${ownQ}\nTwo copies.\n- the old one (recommended)\n- the new one\n`);
const ownCard = plainAsk(run, a.agentQuestions(run, "").questions[0]);
const own = a.answerQuestions(run, [{ q: ownCard.raw || ownCard.q, a: "yes" }]);
ok("4) your own words, under a question with a file path in it, are saved too", ownCard.raw === ownQ && own.ok && count(ownQ) === 1 && /### Which folder[^\n]*\nyes\n/.test(readFileSync(join(s, "ANSWERS.md"), "utf8")), [ownCard, own]);
const longQ = "Should I " + "keep the old relay running alongside the new one ".repeat(8) + "until Friday?";
writeFileSync(join(s, "QUESTIONS.md"), `## Questions\n\n### ${longQ}\n- yes (recommended)\n- no\n`);
ok("...and a long question a phone shows cut short (…) is still found", a.answerQuestions(run, [{ q: longQ.slice(0, 299) + "…", a: "yes" }]).saved === 1, "");
// 3) a question about work handed over that's done since: the card says so, Close it first
const { doneSince } = await import("../lanes.mjs");
const lane2 = join(HOME, "work", "whatsapp_module"), ops2 = join(C, "drafts", "act-ops2");
mkdirSync(join(ops2, ".symbiot"), { recursive: true });
const putBack = "**What's needed:** put the WhatsApp module back on **sts-prod**, with Dailify's number routed to Dailify, then run two checks.\nMore detail.";
const ledger = { handoffs: [
  { from: { lane: "whatsapp_module", path: lane2 }, to: { lane: "ops", path: join(C, "drafts", "act-test-number") }, text: "**What's needed:** set up a WhatsApp test number for the WhatsApp module in a new Meta Business", at: Date.now() - 3600000, status: "started" },
  { from: { lane: "whatsapp_module", path: lane2 }, to: { lane: "ops", path: ops2 }, text: putBack, at: Date.now() - 1800000, status: "done" }] };
writeFileSync(join(ops2, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] **What's needed:** put the WhatsApp module back on **sts-prod**, with Dailify's number routed to Dailify, then run…\n");
ok("3) a question about a handover still being worked on stays as it is", doneSince(lane2, permQ, { ledger }) === null, "");
writeFileSync(join(ops2, ".symbiot", "TASKS.md"), "## Tasks\n- [x] **What's needed:** put the WhatsApp module back on **sts-prod**, with Dailify's number routed to Dailify, then run…\n");
const dn = doneSince(lane2, permQ, { ledger });
ok("...once the lane that took it has ticked it, the question is out of date, and says by whom", dn && dn.lane === "ops" && /^put the WhatsApp module back on sts-prod/.test(dn.text), dn);
ok("...but not a question about other work of that lane's", doneSince(lane2, "Set up a WhatsApp test number for the module?", { ledger }) === null && doneSince(lane2, "Can I restart the WhatsApp module's systemd unit?", { ledger }) === null, "");
ok("...nor one about a handover from over a week ago", doneSince(lane2, permQ, { ledger, now: Date.now() + 8 * 86400000 }) === null, "");
const { homeState } = await import("../home.mjs");
const hsDeps = { repos: () => ({ whatsapp_module: lane2 }), board: () => ({ cards: [] }), pending: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, waits: () => [], clashes: () => [], agentGone: () => "", signedOut: () => [], stuck: () => [], drafts: () => [], agentCmd: () => "claude", marketing: () => false,
  agents: () => [{ path: lane2, name: "whatsapp_module", status: "done", ask: { questions: [{ q: permQ, context: "", options: ["👤 You (only you: a permission): allow the list in .symbiot/allowlist.proposed.json (recommended)", "ask ops directly"] }] } }] };
const stale = homeState({ fresh: true, deps: { ...hsDeps, doneSince: (p, q) => doneSince(p, q, { ledger }) } }).you.find((y) => y.kind === "ask");
ok("...and its card on Home says it's done, with Close it first and the agent's own first choice after it", stale && stale.done && stale.done.lane === "ops" && /^Close it: ops has done this already/.test(stale.options[0]) && stale.labels[0] === "Close it: it's done" && /allowlist\.proposed/.test(stale.options[1]) && stale.labels[1] === "Allow", stale);
const live = homeState({ fresh: true, deps: { ...hsDeps, doneSince: () => null } }).you.find((y) => y.kind === "ask");
ok("...while one still open asks as before", live && !live.done && live.labels[0] === "Allow (recommended)" && live.raw === permQ, live);

rmSync(HOME, { recursive: true, force: true });
console.log((fail ? "✗" : "✓") + " autoallow: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
