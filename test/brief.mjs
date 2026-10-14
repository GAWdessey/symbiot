// What every agent run reads before it starts (audit fix 4, 2026-10-14): about 30,000
// words of fixed reading, before any work.
//   1. ONE COPY OF EACH RULE: the clerk rules, the mail-provider rule and the Symbiot
//      Browser rule were each in the brief two or three times.
//   2. ONLY THIS LANE'S ANSWERS under "Already answered": it was the last 20 from every
//      lane, whole.
//   3. OLD ANSWERS ARCHIVED: ANSWERS.md only grew (62k characters here) and every run read
//      all of it. All but the newest move to ANSWERS.archive.md before a run, and nothing
//      that reads the answers loses one: a lane held back as "nothing changed" stays held.
//   4. ONLY THE PLUGINS A RUN NEEDS: every run loaded every plugin's tools (mojulo and
//      spritecook were 127 of 185); the claude.ai connectors stay.
// Isolated HOME, throwaway folders.
//
//   node test/brief.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, utimesSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-brief-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const { buildTasksMd } = await import("../tasks.mjs");
const { actBrief } = await import("../mind.mjs");
const { ONLY_YOU } = await import("../handover.mjs");
const { recordDone, doneBrief } = await import("../asksdone.mjs");
const { taskWords } = await import("../core.mjs");
const A = await import("../agents.mjs");
const { NOT_REPORTS } = await import("../reports.mjs");
const count = (s, re) => (s.match(re) || []).length;
const digest = (s) => createHash("sha1").update(String(s)).digest("hex").slice(0, 16);

try {
  console.log("ONE COPY OF EACH RULE");
  const md = buildTasksMd("coral", { lanes: ["coral", "symbiot"] }, [{ text: "Build the Android app" }]);
  ok("the clerk rule once", count(md, /capable clerk/g) === 1, count(md, /capable clerk/g));
  ok("the Symbiot Browser's close-it rule once", count(md, /close or click Done in the Symbiot Browser|Never ask them to close the Symbiot Browser/g) === 1);
  ok("ask-only-for-passwords-money-or-undo once", count(md, /Ask only for (\(1\) )?passwords/g) === 1);
  ok("the plain-words rule once", count(md, /in plain words for someone who doesn't code/g) === 1);
  ok("the user-only rules are a third shorter", ONLY_YOU.length < 5600, ONLY_YOU.length);
  const ab = actBrief("Find a JDK 17", { lanes: ["coral"], reach: null });
  ok("an ops brief still has the clerk rules (they were only in the user-only block there)", /capable clerk/.test(ab) && /Never name a provider you haven't confirmed/.test(ab));

  console.log("ONLY THIS LANE'S ANSWERS");
  for (let i = 0; i < 8; i++) recordDone(`Coral question ${i}: ${"which way should the build go ".repeat(8)}`, `answer ${i} ${"long words ".repeat(30)}`, "coral");
  recordDone("Dailify: send the WhatsApp test?", "yes", "dailify");
  recordDone("Something asked on Home", "done it");
  const b = doneBrief("coral");
  ok("the last 5 of this lane's", b.length === 7 && /question 7/.test(b[5]) && /question 3/.test(b[1]), b);
  ok("never another lane's, or one with no lane", !b.join("\n").includes("Dailify") && !b.join("\n").includes("Home"));
  ok("each clipped to about 120 characters a side", b.slice(1, 6).every((l) => l.length < 260), b.slice(1, 6).map((l) => l.length));
  ok("a lane with none gets no heading", doneBrief("wolfeel").length === 0 && doneBrief("").length === 0);
  ok("the brief has its own lane's", /question 7/.test(buildTasksMd("coral", {}, [{ text: "x" }])) && !/question 7/.test(buildTasksMd("symbiot", {}, [{ text: "x" }])));

  console.log("OLD ANSWERS ARCHIVED, NONE LOST");
  const repo = mkdtempSync(join(tmpdir(), "symbiot-brief-repo-")), sym = join(repo, ".symbiot"); mkdirSync(sym);
  const today = new Date().toISOString().slice(0, 10);
  const sec = (i, day, by = "") => `### Old question ${i}?\n${"An answer with some words in it. ".repeat(12)}\n_answered ${by}${day}_\n`;
  let ans = "# Answers from the user\nAnswers to the questions in QUESTIONS.md, newest last.\n";
  for (let i = 0; i < 40; i++) ans += "\n" + sec(i, "2026-09-0" + (1 + (i % 9)), i % 5 === 0 ? "by symbiot (handover) " : "");
  for (let i = 40; i < 43; i++) ans += "\n" + sec(i, today);
  writeFileSync(join(sym, "ANSWERS.md"), ans);
  writeFileSync(join(sym, "TASKS.md"), "## Tasks\n- [ ] Fix the thing\n");
  writeFileSync(join(sym, "QUESTIONS.md"), "## Questions\n### Old question 3?\nctx\n- a (recommended)\n- b\n### A new one?\nctx\n- a (recommended)\n- b\n");
  const old = new Date(Date.now() - 3600000); utimesSync(join(sym, "ANSWERS.md"), old, old);
  const before = digest(A.userAnswers(ans)), cmd = "claude -p";
  writeFileSync(join(sym, "blocked.json"), JSON.stringify({ at: Date.now(), questions: 1, env: digest(""), answers: before, cmd: digest(cmd), open: [taskWords("Fix the thing")] }));
  ok("(held back before: nothing changed)", !!A.blockedAgain(repo, cmd));
  const moved = A.archiveAnswers(repo);
  const kept = readFileSync(join(sym, "ANSWERS.md"), "utf8"), arch = readFileSync(join(sym, A.ANSWERS_ARCHIVE), "utf8");
  ok("all but the last 15 move to ANSWERS.archive.md", moved === 28 && count(kept, /^### /gm) === 15 && count(arch, /^### /gm) === 28, [moved, count(kept, /^### /gm)]);
  ok("oldest first, word for word", arch.indexOf("### Old question 0?") < arch.indexOf("### Old question 27?") && arch.includes(sec(5, "2026-09-06", "by symbiot (handover) ")) && kept.startsWith("# Answers from the user\n") && kept.includes("### Old question 28?"));
  ok("ANSWERS.md is a quarter of what it was", kept.length < ans.length / 2.5, [kept.length, ans.length]);
  ok("its time is kept: the move isn't a new answer", Math.abs(statSync(join(sym, "ANSWERS.md")).mtimeMs - old.getTime()) < 5);
  ok("the answers read the same as before, archive first", A.answersDigest(repo) === before);
  ok("so a lane held back as nothing-changed is still held", !!A.blockedAgain(repo, cmd));
  ok("an archived answer still answers its question: it isn't asked again", A.agentQuestions(repo, "repo").questions.map((q) => q.q).join("|") === "A new one?", A.agentQuestions(repo, "repo").questions);
  writeFileSync(join(sym, "ANSWERS.md"), kept + "\n### A new one?\nThe user's answer.\n_answered " + today + "_\n");
  ok("a real new answer does count as a change", A.answersDigest(repo) !== before && !A.blockedAgain(repo, cmd));
  for (let i = 43; i < 60; i++) writeFileSync(join(sym, "ANSWERS.md"), readFileSync(join(sym, "ANSWERS.md"), "utf8") + "\n" + sec(i, "2026-09-20"));
  const d2 = A.answersDigest(repo); A.archiveAnswers(repo);
  ok("a second round adds the old ones ahead of today's to the archive, and the answers still read the same", A.answersDigest(repo) === d2 && count(readFileSync(join(sym, A.ANSWERS_ARCHIVE), "utf8"), /^### /gm) === 28 + 12);
  ok("answers from the last day stay, even past 15", (() => { const r2 = mkdtempSync(join(tmpdir(), "symbiot-brief-fresh-")); mkdirSync(join(r2, ".symbiot")); let m = "# Answers\n"; for (let i = 0; i < 30; i++) m += "\n" + sec(i, today); writeFileSync(join(r2, ".symbiot", "ANSWERS.md"), m); const n = A.archiveAnswers(r2); rmSync(r2, { recursive: true, force: true }); return n === 0; })());
  ok("a small ANSWERS.md is left alone", (() => { const r3 = mkdtempSync(join(tmpdir(), "symbiot-brief-small-")); mkdirSync(join(r3, ".symbiot")); writeFileSync(join(r3, ".symbiot", "ANSWERS.md"), "# Answers\n\n" + sec(1, "2026-01-01")); const n = A.archiveAnswers(r3); rmSync(r3, { recursive: true, force: true }); return n === 0; })());
  ok("the brief says where older answers are", /ANSWERS\.archive\.md/.test(md));
  ok("the archive isn't listed as a report", NOT_REPORTS.test("ANSWERS.archive.md") && NOT_REPORTS.test("ANSWERS.md") && !NOT_REPORTS.test("SYMBIOT-AUDIT.md"));

  console.log("ONLY THE PLUGINS A RUN NEEDS");
  const plug = (acct, dir, p) => { const d = join(HOME, ".claude", "plugins", "synced", acct, dir, ".claude-plugin"); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "plugin.json"), JSON.stringify(p)); };
  plug("acct1", "aaa", { name: "mojulo", keywords: ["godot", "gltf", "mcp"] });
  plug("acct1", "bbb", { name: "spritecook", keywords: ["sprites", "pixel-art", "claude"] });
  writeFileSync(join(HOME, ".claude", "plugins", "synced", ".bucket-acct1"), "not a folder");
  writeFileSync(join(HOME, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "notes@market": true, "gone@market": false } }));
  const list = A.claudePlugins(HOME);
  ok("synced and installed plugins are found, a stray file skipped", list.map((p) => p.id).sort().join() === "mojulo@synced,notes@market,spritecook@synced", list);
  ok("a run whose tasks name none goes without all of them", JSON.stringify(A.idlePlugins(repo, { plugins: list, cfg: {} })) === JSON.stringify({ "mojulo@synced": false, "spritecook@synced": false, "notes@market": false }));
  writeFileSync(join(sym, "TASKS.md"), "## Tasks\n- [ ] Draw the sprites for the menu\n- [x] Export the level to Godot\n");
  ok("one an open task names (by a keyword of its own) keeps it; a ticked one doesn't count", JSON.stringify(A.idlePlugins(repo, { plugins: list, cfg: {} })) === JSON.stringify({ "mojulo@synced": false, "notes@market": false }));
  ok("a word every plugin has (mcp, claude) names none", !list.some((p) => p.words.includes("mcp") || p.words.includes("claude")));
  ok("an ops run keeps them all: it's whatever was asked in chat", A.idlePlugins(join(CFG, "drafts", "act-1"), { plugins: list, cfg: {} }) === null);
  ok("config.runPlugins \"all\" keeps them all", A.idlePlugins(repo, { plugins: list, cfg: { runPlugins: "all" } }) === null);
  const f = A.runSettings(repo), st = JSON.parse(readFileSync(f, "utf8"));
  ok("the run's settings keep the guard and switch the rest off", f !== A.GUARD_SETTINGS && st.hooks && st.hooks.PreToolUse && st.enabledPlugins["mojulo@synced"] === false && !("spritecook@synced" in st.enabledPlugins), st);
  const cmd2 = A.withTrust("claude -p {prompt}", null, repo);
  ok("and the run starts with them", cmd2.includes(`--settings ${JSON.stringify(f)}`), cmd2);
  rmSync(repo, { recursive: true, force: true });
  ok("(cleaned up)", !existsSync(repo));
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
