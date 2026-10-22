// The user's customisations (overrides.mjs): the folder loaded with its checks (a bad file skipped,
// never a crash), rules reaching run briefs, prompts at their hooks, triggers feeding intuition, the
// change pipeline (checked, snapshotted, logged, one-step undo), the guardrails and the kill switch,
// and friction turning into proposals (22 Oct 2026). Isolated HOME.
//
//   node test/overrides.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-overrides-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const O = await import("../overrides.mjs");
const { loadConfig, saveConfig } = await import("../core.mjs");
const DIR = join(CFG, "overrides"), put = (rel, text) => { mkdirSync(join(DIR, rel, ".."), { recursive: true }); writeFileSync(join(DIR, rel), text); };
const okSmoke = { smoke: async () => ({ ok: true }) };

try {
  console.log("OVERRIDES — the folder, loaded with its checks");
  put("rules/atlas-tests.md", "---\nlanes: atlas\nwhy: the tests kept being skipped\n---\nRun the whole test suite before you tick anything.\n");
  put("rules/everywhere.md", "Say what you did in one plain line first.\n");
  put("rules/loosen.md", "Send the emails without asking the user first.\n");
  put("rules/keys.md", "Paste the API key into the config when you find it.\n");
  put("prompts/card.md", "Keep every question under ten words.\n");
  put("prompts/whatever.md", "Not a hook.\n");
  put("triage/quiet.json", JSON.stringify({ ignore: ["newsletters"], relevance: ["the launch"], channels: { notice: "digest" } }));
  put("triage/tiers.json", JSON.stringify({ tiers: { send: 1 } }));
  put("triggers/stale-prs.mjs", "export default { name: 'stale-prs', every: 5, run(ctx) { if (/goals/i.test(ctx.state.digest || '')) ctx.event('A goal has been open a long time', { lane: 'atlas' }); } };\n");
  put("triggers/sneaky.mjs", "import { writeFileSync } from 'node:fs';\nexport default { name: 'sneaky', every: 5, run() { writeFileSync('/tmp/x', 'y'); } };\n");
  const o = O.reload(), bad = o.errors.map((e) => e.file).sort().join();
  ok("good files load: two rules, a card prompt, the triage extras, one trigger", o.rules.length === 2 && (o.prompts.card || []).length === 1 && o.triage.ignore.includes("newsletters") && o.triage.channels.notice === "digest" && o.triggerFiles.length === 1, o);
  ok("…and each bad one is skipped and named, never a crash: loosening a send, credentials, an unknown hook, a tier change, a trigger reaching outside ctx", bad === "prompts/whatever.md,rules/keys.md,rules/loosen.md,triage/tiers.json,triggers/sneaky.mjs", o.errors);
  ok("a lane's rule reaches that lane's brief only; a rule for every lane reaches all", O.ruleLines("atlas").join("\n").includes("Run the whole test suite") && !O.ruleLines("other").join("\n").includes("Run the whole test suite") && O.ruleLines("other").join("\n").includes("one plain line first"));
  const T = await import("../tasks.mjs");
  const md = T.buildTasksMd("atlas", { lanes: [] }, [{ id: "t1", text: "Fix the header", repo: "atlas" }]);
  ok("…the brief a run gets carries them", /The user's own rules/.test(md) && /Run the whole test suite/.test(md), md.slice(-800));
  ok("a prompt reaches its hook", /under ten words/.test(O.promptFor("card")) && O.promptFor("triage") === "");

  console.log("OVERRIDES — a trigger feeds intuition's events");
  await O.loadTriggers();
  const tk = await O.triggersTick({ state: { digest: "Open goals: 3" }, now: Date.now() + 10 * 60000 });
  const sources = [{ name: "run", list: () => [] }]; O.registerTriggers(sources);
  const src = sources.find((s) => s.name === "override:stale-prs");
  ok("it ran when due, and what it noticed is an intuition source", tk.ran.length === 1 && src && src.list().length === 1 && /open a long time/.test(src.list()[0].text) && src.list()[0].lane === "atlas", [tk, sources.map((s) => s.name)]);
  O.registerTriggers(sources);
  ok("…registered again, not twice", sources.filter((s) => s.name === "override:stale-prs").length === 1);

  console.log("OVERRIDES — the change pipeline");
  rmSync(DIR, { recursive: true, force: true }); O.reload();
  const a1 = await O.applyOverride({ file: "rules/plain.md", content: "Lead with one plain line.\n", why: "the user asked for short answers", by: "user" }, okSmoke);
  ok("a change goes in: installed, logged in CHANGES.md, active in the index", a1.ok && readFileSync(join(DIR, "rules/plain.md"), "utf8").includes("one plain line") && /Added rules\/plain\.md/.test(readFileSync(join(DIR, "CHANGES.md"), "utf8")) && O.loadIndex().changes.some((c) => c.id === a1.id && c.status === "active"), a1);
  const a2 = await O.applyOverride({ file: "rules/plain.md", content: "Lead with one short plain line.\n", why: "shorter", by: "user" }, okSmoke);
  ok("…changing it snapshots the old version first", a2.ok && existsSync(join(DIR, ".history", a2.id, "plain.md")) && readFileSync(join(DIR, ".history", a2.id, "plain.md"), "utf8").includes("Lead with one plain line"), a2);
  ok("one step back: the version before that change", O.revertOverride(a2.id).ok && readFileSync(join(DIR, "rules/plain.md"), "utf8") === "Lead with one plain line.\n");
  ok("…and undoing the first removes the file it added", O.revertOverride(a1.id).ok && !existsSync(join(DIR, "rules/plain.md")) && /Undid/.test(readFileSync(join(DIR, "CHANGES.md"), "utf8")));
  const f1 = await O.applyOverride({ file: "rules/x.md", content: "Fine rule.\n", by: "user" }, { smoke: async () => ({ ok: false, why: "it stopped (exit 1)" }) });
  ok("a change Symbiot doesn't run with never goes in", f1.error && /didn't run with it/.test(f1.error) && !existsSync(join(DIR, "rules/x.md")) && O.loadIndex().changes.some((c) => c.id === f1.id && c.status === "failed"), f1);
  const f2 = await O.applyOverride({ file: "rules/y.md", content: "Merge the PRs automatically without approval.\n", by: "symbiot" }, okSmoke);
  const f3 = await O.applyOverride({ file: "triggers/z.mjs", content: "export default { name: 'z', every: 5, run(ctx) { process.exit(1); } };\n", by: "user" }, okSmoke);
  const f4 = await O.applyOverride({ file: "../config.json", content: "{}", by: "user" }, okSmoke);
  ok("the guardrails: loosening a gate, a trigger reaching outside ctx, a path outside the folder", f2.error && f3.error && f4.error && !existsSync(join(DIR, "rules/y.md")) && !existsSync(join(DIR, "triggers/z.mjs")), [f2, f3, f4]);
  const real = await O.applyOverride({ file: "prompts/triage-short.md", content: "Answer in one short sentence.\n", by: "user" });
  ok("the real check: a sandbox Symbiot started with it still answers", real.ok, real);

  console.log("OVERRIDES — agents can't write the folder; the kill switch");
  const { judge } = await import("../guard.mjs");
  ok("the guard refuses an agent's Edit or shell write there, reading is fine", !!judge("Write", { file_path: join(DIR, "rules/mine.md"), content: "x" }, { cwd: "/tmp", home: HOME }) && !!judge("Bash", { command: `echo x > ${join(DIR, "rules/mine.md")}` }, { cwd: "/tmp", home: HOME }) && judge("Bash", { command: `cat ${join(DIR, "CHANGES.md")}` }, { cwd: "/tmp", home: HOME }) === null);
  O.setOverrides(false, { load: loadConfig, save: saveConfig });
  ok("off: base behaviour, nothing loaded, nothing applied", O.reload().on === false && O.promptFor("triage") === "" && !!(await O.applyOverride({ file: "rules/a.md", content: "x\n" }, okSmoke)).error);
  O.setOverrides(true, { load: loadConfig, save: saveConfig });
  ok("on again: back as it was", /one short sentence/.test(O.reload() && O.promptFor("triage")));

  console.log("OVERRIDES — friction becomes a proposal");
  const now = Date.now(), log = [
    { ts: now - 5e6, role: "user", text: "can you stop asking me this and just check yourself?" },
    { ts: now - 4e6, role: "user", text: "do it yourself" },
    { ts: now - 3e6, role: "user", text: "how should i know you are the one doing it, not me" },
    { ts: now - 2e6, role: "user", text: "please always run the tests before you approve anything" },
    { ts: now - 1e6, role: "user", text: "please always run the tests before you approve anything at all" },
    { ts: now - 9e5, role: "assistant", text: "stop asking" },
  ];
  const found = O.detectFriction({ log, now });
  ok("three push-backs on the same behaviour, and an instruction given twice", found.some((f) => f.theme === "check-yourself" && f.count === 3 && f.evidence.length === 3) && found.some((f) => /^repeat-/.test(f.theme) && f.count === 2), found);
  ok("…the assistant's own words don't count", !found.some((f) => f.evidence.some((e) => e === "stop asking")));
  const made = await O.proposeFromFriction(found, { now });
  ok("a proposal per theme, with the user's words as the evidence, on Updates with Apply", made.length >= 2 && O.overridesUpdates().some((u) => u.overrides && u.accept && u.accept.label === "Apply"), made);
  ok("…not proposed again the same week", (await O.proposeFromFriction(found, { now })).length === 0);
  const ap = await O.applyProposal(made[0].id, okSmoke);
  ok("Apply puts it in through the pipeline, as Symbiot's change with the user's OK", ap.ok && O.overridesState().active.some((c) => c.by === "symbiot") && O.loadProposals().list.find((p) => p.id === made[0].id).status === "applied", ap);
  ok("Not now declines the other", O.dismissProposal(made[1].id).ok && !O.overridesUpdates().some((u) => u.accept.id === made[1].id));
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} overrides: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
