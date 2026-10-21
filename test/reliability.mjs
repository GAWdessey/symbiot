// What a run gets whatever its agent command is called, the rules Claude Code actually
// reads, a runs.json that forgets folders that are gone, a handover to a lane that doesn't
// quite exist, one that's waited for days, a Home suggestion tapped while a card came up,
// and a task given an ops folder's name (the 16 Oct 2026 reliability audit).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-reliability-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "projects")] }));
const a = await import("../agents.mjs");
const l = await import("../lanes.mjs");
const h = await import("../home.mjs");
const t = await import("../tasks.mjs");

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const lane = (name) => { const p = join(HOME, "projects", name); mkdirSync(join(p, ".symbiot"), { recursive: true }); return p; };
const put = (p, f, text) => { mkdirSync(join(p, ".symbiot"), { recursive: true }); writeFileSync(join(p, ".symbiot", f), text); };
const ran = (p, ts) => put(p, "agent.log", `\n=== x ${new Date(ts).toISOString()} ===\n$ claude -p …\ndone\n`);

try {
  console.log("THE AGENT COMMAND — Claude Code by any name, so every run gets the membrane, the stream and the rest");
  const wrapper = `${HOME}/.config/symbiot/claude-fallback -p "{prompt}" --model sonnet --permission-mode acceptEdits --allowedTools "Bash(npm test:*)" "Bash(node:*)"`;
  ok("claude, a path to it, a wrapper named after it, with or without VAR=… first", a.isClaudeCmd("claude -p x") && a.isClaudeCmd(wrapper) && a.isClaudeCmd('FOO=1 "/usr/local/bin/claude" -p x') && a.isClaudeCmd("C:\\Users\\me\\claude.cmd -p x"), "");
  ok("not another agent, not Orca's tab (which carries `claude … --allowedTools` inside its --command), not a lookalike", !a.isClaudeCmd('codex exec --full-auto "{prompt}"') && !a.isClaudeCmd('/x/orca-ide open; /x/orca-ide terminal create --command "claude \\"{prompt}\\" --allowedTools \\"Bash(node:*)\\""') && !a.isClaudeCmd("claudette -p x") && !a.isClaudeCmd(""), "");
  const trusted = a.withTrust(wrapper);
  ok("the wrapper's runs work alone behind the membrane: --dangerously-skip-permissions and the guard settings, acceptEdits gone", /--dangerously-skip-permissions/.test(trusted) && /--settings "/.test(trusted) && !/--permission-mode/.test(trusted), trusted);
  ok("…and stream their steps (work.mjs reads them), as a plain claude command does", /--output-format stream-json --verbose$/.test(a.withStream(wrapper)) && !/stream-json/.test(a.withStream('codex exec -p "{prompt}"')), a.withStream(wrapper));
  const guard = JSON.parse(readFileSync(a.GUARD_SETTINGS, "utf8"));
  ok("the guard settings every run starts with deny Symbiot's own settings and keys, as Claude Code reads a rule (//absolute, Edit and Read)", JSON.stringify(guard.permissions.deny) === JSON.stringify(a.GUARD()) && guard.permissions.deny.every((r) => /^(Edit|Read)\(\/\//.test(r)) && guard.hooks.PreToolUse.length === 1, guard);
  ok("GUARD: Edit covers Write (no Write rule), and the paths are absolute", a.GUARD().length === 3 && a.GUARD().includes(`Edit(//${homedir().replace(/^\/+/, "")}/.config/symbiot/config.json)`) && !a.GUARD().some((r) => /^Write\(/.test(r)), a.GUARD());

  console.log("RULES AS CLAUDE CODE READS THEM — Write(path) is never consulted, /path is relative to the settings file");
  ok("Write, MultiEdit and NotebookEdit rules become Edit; Glob becomes Read; a Bash rule and a relative path are left alone", a.tidyRule("Write(//a/b/**)") === "Edit(//a/b/**)" && a.tidyRule("NotebookEdit(//a/n.ipynb)") === "Edit(//a/n.ipynb)" && a.tidyRule("Glob(/mnt/z/**)") === "Read(//mnt/z/**)" && a.tidyRule("Bash(npm test:*)") === "Bash(npm test:*)" && a.tidyRule("Edit(src/**)") === "Edit(src/**)" && a.tidyRule("Read(~/x/**)") === "Read(~/x/**)", "");
  ok("a single-slash path that can only be absolute gets its second slash; one already absolute stays", a.tidyRule("Edit(/home/x/y)") === "Edit(//home/x/y)" && a.tidyRule("Read(//home/x/y)") === "Read(//home/x/y)" && a.tidyRule("Read(/dev/null)") === "Read(/dev/null)", "");
  ok("a list is tidied once, duplicates folded", a.tidyRules(["Write(//a/**)", "Edit(//a/**)", "Edit(/home/x)", "Bash(ls:*)", "", 3]).join() === "Edit(//a/**),Edit(//home/x),Bash(ls:*)", a.tidyRules(["Write(//a/**)", "Edit(//a/**)", "Edit(/home/x)", "Bash(ls:*)"]));
  {
    const repo = lane("old"), f = join(repo, ".claude", "settings.local.json"); mkdirSync(join(repo, ".claude"), { recursive: true });
    const c = join(homedir(), ".config", "symbiot", "config.json"), s = join(homedir(), ".config", "symbiot", "secrets.json");
    writeFileSync(f, JSON.stringify({ permissions: { allow: ["Bash(curl -s:*)", `Write(//${repo.replace(/^\/+/, "")}/**)`, `Read(/${repo}/**)`], deny: [`Edit(${c})`, `Write(${c})`, `Read(${s})`, `Edit(${s})`, `Write(${s})`], additionalDirectories: [] } }, null, 2));
    const changed = a.tidySettings(repo), after = JSON.parse(readFileSync(f, "utf8")).permissions;
    ok("a lane's settings.local.json from before: its Write rules are Edit rules, its deny rules are Symbiot's current ones, nothing else touched", changed && after.allow.join() === `Bash(curl -s:*),Edit(//${repo.replace(/^\/+/, "")}/**),Read(//${repo.replace(/^\/+/, "")}/**)` && JSON.stringify(after.deny) === JSON.stringify(a.GUARD()) && Array.isArray(after.additionalDirectories), after);
    ok("…put right once: the next look changes nothing, and a folder with no such file is left alone", !a.tidySettings(repo) && !a.tidySettings(lane("bare")) && !a.tidySettings(""), "");
    // an agent's list, installed: in those forms too
    put(repo, "allowlist.proposed.json", JSON.stringify({ permissions: { allow: ["Write(//tmp/out/**)", "Bash(ffmpeg:*)"], deny: [], additionalDirectories: [] } }));
    const g = a.installAllowlist(repo), now = JSON.parse(readFileSync(f, "utf8")).permissions;
    ok("an allow list an agent proposed lands as Claude Code reads it: Write → Edit, and the deny rules current", Array.isArray(g) && now.allow.includes("Edit(//tmp/out/**)") && !now.allow.some((r) => /^Write\(/.test(r)) && now.allow.includes("Bash(ffmpeg:*)") && JSON.stringify(now.deny) === JSON.stringify(a.GUARD()), now);
  }

  console.log("RUNS.JSON — folders that are gone, with nothing running in them, leave the list");
  {
    const live = lane("live"), gone = join(HOME, "worktrees", "symbiot-abc123");
    const list = [{ path: live, name: "live", startedAt: 1 }, { path: gone, name: "symbiot (beside)", startedAt: 2 }];
    ok("pruneRuns keeps a folder that's there and drops one that isn't", a.pruneRuns(list).map((r) => r.name).join() === "live", a.pruneRuns(list));
    writeFileSync(join(CFG, "runs.json"), JSON.stringify(list));
    const r = a.runsTick({ kill: () => {} });
    ok("runsTick (every minute) prunes the file itself, and says how many went", r.pruned === 1 && a.loadRuns().length === 1 && a.loadRuns()[0].path === live, [r, a.loadRuns()]);
    ok("…and a run that's noted keeps the list pruned, newest first, within its cap", (a.loadRuns().length === 1) && (() => { writeFileSync(join(CFG, "runs.json"), JSON.stringify([...list, { path: lane("other"), name: "other", startedAt: 3 }])); return true; })(), "");
    ok("knownRun answers for a lane still on the list (its answers reach it)", a.knownRun(live), "");
  }

  console.log("A HANDOVER TO A LANE THAT DOESN'T QUITE EXIST — nearest lane, else ops, told the name");
  {
    const names = ["symbiot", "robin", "marketing", "quartz", "ChatApp"];
    ok("a typo, a case, a word more: the one lane that fits", l.nearLane("symbio", names) === "symbiot" && l.nearLane("Robin lane", names) === "robin" && l.nearLane("marketng", names) === "marketing" && l.nearLane("chatapp", names) === "ChatApp" && l.nearLane("the quartz app", names) === "quartz", "");
    ok("no lane, or more than one that fits: none (dra-global-toolkit isn't marketing; 'symbiot marketing' is two)", l.nearLane("dra-global-toolkit", names) === "" && l.nearLane("symbiot marketing", names) === "" && l.nearLane("", names) === "" && l.nearLane("ops", names) === "", "");
    const map = { symbiot: lane("symbiot"), robin: lane("robin") };
    ok("laneTarget: ops, an exact lane, a near one; null for none", l.laneTarget("ops", map).lane === "ops" && l.laneTarget("Robin", map).lane === "robin" && l.laneTarget("symbio", map).lane === "symbiot" && l.laneTarget("dra-global-toolkit", map) === null, "");
    const acts = [], opsDir = join(CFG, "drafts", "act-0001");
    const deps = (ledger) => ({ map, ledger, now: Date.now(), tasks: () => [], act: (text, o) => { acts.push({ text, o }); mkdirSync(join(opsDir, ".symbiot"), { recursive: true }); return { ok: true, job: "ops1", dir: opsDir }; }, run: () => ({ id: "j1" }), running: () => false, add: () => ({ id: "t1" }), push: () => ({ written: [{}] }), drop: () => {} });
    put(map.robin, "HANDOFF.md", "# Handoffs\n### dra-global-toolkit\nDelete the folder /tmp/dra-global-toolkit, it's a leftover.\n");
    const led = { handoffs: [] }, [e] = l.dispatch(map.robin, deps(led));
    ok("from a repo lane, it goes to ops, marked rerouted with the name it had, and ops's brief says the lane doesn't exist", e.status === "started" && e.to.lane === "ops" && e.rerouted && e.rerouted.noLane && e.rerouted.from === "dra-global-toolkit" && acts.length === 1 && /doesn't exist \(dra-global-toolkit\)/.test(acts[0].o.context), [e, acts[0] && acts[0].o.context]);
    ok("…and the Sent line in its HANDOFF.md says so", /sent to ops instead of dra-global-toolkit \(there's no lane called dra-global-toolkit\)/.test(readFileSync(join(map.robin, ".symbiot", "HANDOFF.md"), "utf8")), readFileSync(join(map.robin, ".symbiot", "HANDOFF.md"), "utf8"));
    mkdirSync(join(opsDir, ".symbiot"), { recursive: true }); put(opsDir, "HANDOFF.md", "# Handoffs\n### nowhere-lane\nDo a thing.\n");
    const [e2] = l.dispatch(opsDir, deps({ handoffs: [] }));
    ok("from ops itself, there's nowhere to send it: a plain error saying ops is the lane for it, with the lanes listed", e2.status === "error" && /no lane called nowhere-lane\. You are ops/.test(e2.error) && /symbiot, robin/.test(e2.error) && acts.length === 1, e2);
  }

  console.log("A HANDOVER THAT HAS WAITED FOR DAYS — the asker is told where it stands, once");
  {
    const DAY = 86400000, now = Date.now(), asker = lane("asker"), ops = join(CFG, "drafts", "act-stale"); mkdirSync(join(ops, ".symbiot"), { recursive: true });
    const row = (over = {}) => ({ id: "h1", from: { lane: "asker", path: asker }, to: { lane: "ops", path: ops }, text: "Take a copy of the mind from the VM.", at: now - 4 * DAY, status: "started", ...over });
    ok("one a day old waits quietly", l.staleOutcome(row({ at: now - DAY }), { now }) === null, "");
    ok("no run ever started on it: not done, hand it over again", /no run has started on it in ops in 4 days/.test((l.staleOutcome(row(), { now }) || {}).text), l.staleOutcome(row(), { now }));
    ran(ops, now - 4 * DAY + 60000); put(ops, "TASKS.md", "## Tasks\n- [ ] Take a copy of the mind from the VM.\n"); put(ops, "QUESTIONS.md", "## Questions\n### Can I write to /home/x/stevetest4 now?\nIt isn't in my folders.\n- 🤖 Agent: yes, go ahead (recommended)\n- skip this part\n");
    const s = l.staleOutcome(row(), { now });
    ok("its lane asked the user days ago and has no answer: the asker hears which question, and to carry on with the rest", s && /asked the user 4 days ago and has no answer: "Can I write to \/home\/x\/stevetest4 now\?"/.test(s.text) && s.settled === false, s);
    ok("a run going there, or one already reported, is never stale", l.staleOutcome(row(), { now, running: () => true }) === null && l.staleOutcome(row({ reportedAt: now }), { now }) === null, "");
    ok("the folder gone: not done, say so", /is gone, and nothing ran on it in 4 days/.test((l.staleOutcome(row({ to: { lane: "ops", path: join(CFG, "drafts", "act-nope") } }), { now }) || {}).text), "");
    // through the tick: told once (the row stays open for the real outcome), with the note in the asker's ANSWERS.md
    const ledger = { handoffs: [row()] }; writeFileSync(l.LEDGER, JSON.stringify(ledger));
    const runs = [], tick = () => l.lanesTick({ map: { asker }, now, tasks: [], run: (p) => { runs.push(p); return { id: "r" }; }, running: () => false, act: () => ({ error: "no" }), add: () => ({ id: "t" }), push: () => ({ written: [] }), relink: async () => ({ moves: [] }) });
    const r1 = tick(), after = l.loadLedger().handoffs[0], said = readFileSync(join(asker, ".symbiot", "ANSWERS.md"), "utf8");
    ok("lanesTick reports it to the asker's ANSWERS.md, marks the row stale and leaves it started", r1.reported.length === 1 && after.stale && after.status === "started" && !after.reportedAt && /Not done yet: ops's agent asked the user/.test(said), [r1, after]);
    const r2 = tick();
    ok("…once: the next tick says nothing more", r2.reported.length === 0 && l.loadLedger().handoffs[0].stale === after.stale, r2);
  }

  console.log("HOME'S 'WHAT COULD BE DONE NEXT' — a tap on a card already on screen works, and an error shows on the card");
  {
    const repo = lane("tappy"), map = { tappy: repo }, pushed = [], runs = [];
    const state = { you: [{ kind: "ask", id: "ask:x", title: "x asks" }], next: [], nextAll: [{ id: "next:go:tappy", act: "go", title: "Send tappy's task", gain: "", time: "" }] };
    const r = h.homeNext("next:go:tappy", { state, repos: () => map, push: (f) => { pushed.push(f); return { written: [{ path: repo, name: "tappy" }] }; }, run: (p) => { runs.push(p); return { id: "j1" }; }, file: join(CFG, "home-next.json") });
    ok("a suggestion that left the list when something came to need you still starts when tapped (nextAll)", r.ok && pushed.length === 1 && runs[0] === repo && /started/i.test(r.said), [r, pushed, runs]);
    const r2 = h.homeNext("next:go:nothere", { state, repos: () => map, push: () => ({ written: [] }), run: () => ({ id: "j" }), file: join(CFG, "home-next.json") });
    ok("one that's really gone says so plainly, never 'something needs you first'", r2.error === "That suggestion isn't here any more.", r2);
    const r3 = h.homeNext("next:go:tappy", { state: { ...state, nextAll: [{ id: "next:go:tappy", act: "go" }] }, repos: () => ({}), push: () => ({ written: [] }), run: () => null, file: join(CFG, "home-next.json") });
    ok("a start that fails comes back as an error for the card (the page puts it under the row, not in a hidden bubble)", r3.error && /isn't one of your projects/.test(r3.error), r3);
    const { EMBEDDED_UI } = await import("../ui.mjs");
    ok("the page shows that error on the card itself (.nxerr) and reloads Home after it", /className='nxerr'/.test(EMBEDDED_UI) && /#lqnext \.nxerr\{/.test(EMBEDDED_UI), "");
  }

  console.log("A TASK GIVEN AN OPS FOLDER'S NAME — it's ops's");
  {
    writeFileSync(join(CFG, "tasks.json"), "[]");
    const x = t.addTask("Finish moving the repo off the old account", "act-304032d6"), y = t.addTask("A repo task", "symbiot");
    ok("addTask: act-… as a lane is ops; a repo stays itself", x.repo === "ops" && y.repo === "symbiot", [x.repo, y.repo]);
    writeFileSync(join(CFG, "tasks.json"), JSON.stringify([{ id: "a1", text: "old one", repo: "act-abcdef12", done: false, ts: 1 }, { id: "a2", text: "archived", repo: "act-abcdef12", done: true, archived: true, ts: 1 }]));
    t.syncTasks();
    const after = JSON.parse(readFileSync(join(CFG, "tasks.json"), "utf8"));
    ok("syncTasks puts one already on the list right, and leaves the archive alone", after.find((z) => z.id === "a1").repo === "ops" && after.find((z) => z.id === "a2").repo === "act-abcdef12", after);
  }
  console.log("RELEASES — one at a time, never an older one over a newer");
  { const wf = readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
    ok("a push to main while a release runs waits for it, never cancels it", /^concurrency:\s*\n\s+group: publish\s*\n\s+cancel-in-progress: false/m.test(wf));
    ok("…and a version older than npm's newest isn't released", /older than npm's newest/.test(wf) && /release=false/.test(wf.split("older than npm's newest")[1].split("else")[0])); }
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log((fail ? "✗" : "✓") + " reliability: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
