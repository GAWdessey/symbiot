// Reports (reports.mjs): what agents wrote up for the user, in one place. A run
// leaves a .md in its .symbiot/; the app lists it (unread ones marked), shows it
// as safe HTML, and Home says when there's one unread. Isolated HOME (set before
// the modules load).
//
//   node test/reports.mjs
//
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = mkdtempSync(join(tmpdir(), "symbiot-reports-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const R = await import("../reports.mjs");
const { HANDBACK } = await import("../handover.mjs");
const { buildTasksMd } = await import("../tasks.mjs");
const { actBrief } = await import("../mind.mjs");
const { homeState, settleAsks, plainAsk, settleFromChat } = await import("../home.mjs");
const { SHAPES } = await import("../adapt.mjs");

const put = (p, f, t, ago = 0) => { mkdirSync(join(p, ".symbiot"), { recursive: true }); const file = join(p, ".symbiot", f); writeFileSync(file, t); if (ago) { const s = (Date.now() - ago) / 1000; utimesSync(file, s, s); } };
const run = join(CFG, "drafts", "act-1d727d7f"), repo = join(HOME, "code", "symbiot");
const AUDIT = "# COMPANY-AUDIT.md: mistakes, conflicts and to-dos\n\n_Ops run, read-only._\n\n## Do today\n\n| # | What | Who |\n|---|---|---|\n| 1 | **v4.18.0 ships tonight** untested | Nadia (`10-…/releases/`) |\n\n- one\n  - nested\n- [x] ticked\n";
put(run, "COMPANY-AUDIT.md", AUDIT, 60000);
put(run, "COMPANY.md", "# What's in ~/Company\n\nTwelve departments.\n", 3600000);
for (const f of ["TASKS.md", "TASKS.next.md", "QUESTIONS.md", "ANSWERS.md", "HANDOFF.md", "SKIPPED.md"]) put(run, f, "# not a report\n");
put(run, "REMEMBER.json", "[]");
put(repo, "BRIEF-symbiot-post.md", "# a brief handed in\n");
put(repo, "PILOTS.md", "Pilot pitch, no heading.\n", 7200000);
put(repo, "EMPTY.md", "");
const map = { symbiot: repo };
const folders = [repo, run];
const none = () => null;

console.log("REPORTS — what runs left in their .symbiot/");
{
  const l = R.listReports({ map, folders, running: none });
  ok("lists the reports, newest first", l.map((r) => r.name).join() === "COMPANY-AUDIT.md,COMPANY.md,PILOTS.md", l.map((r) => r.name));
  ok("not the files Symbiot and the run talk through, not briefs handed in, not empty ones", !l.some((r) => /^(TASKS|QUESTIONS|ANSWERS|HANDOFF|SKIPPED|BRIEF|EMPTY)/.test(r.name)));
  ok("its title is its first # heading, without markdown", l[0].title === "COMPANY-AUDIT.md: mistakes, conflicts and to-dos" && l[1].title === "What's in ~/Company", l.map((r) => r.title));
  ok("…else its file name", l[2].title === "PILOTS", l[2].title);
  ok("which lane left it: ops for a run of its own, the repo's name for a repo", l[0].lane === "ops" && l[2].lane === "symbiot", l.map((r) => r.lane));
  ok("all unread at first", l.every((r) => r.new));
  ok("a run still writing is marked", R.listReports({ map, folders, running: (p) => p === run })[0].running === true);
}

console.log("READING ONE — by its id, as safe HTML; it's read after");
{
  const l = R.listReports({ map, folders, running: none }), a = l[0];
  const r = R.readReport(a.id, { list: l });
  ok("its text and its HTML", r.text === AUDIT && /<h2>COMPANY-AUDIT\.md/.test(r.html), r.html && r.html.slice(0, 80));
  ok("tables, bold and code come through", /<table>/.test(r.html) && /<b>v4\.18\.0 ships tonight<\/b>/.test(r.html) && /<code>10-…\/releases\/<\/code>/.test(r.html));
  ok("nested lists and ticked items", /<ul><li>one<ul><li>nested<\/li><\/ul><\/li><li>☑ ticked<\/li><\/ul>/.test(r.html), r.html);
  const after = R.listReports({ map, folders, running: none });
  ok("opening it marks it read; the others stay unread", after.find((x) => x.id === a.id).new === false && after.filter((x) => x.new).length === 2);
  put(run, "COMPANY-AUDIT.md", AUDIT + "\n- one more finding\n");
  ok("when the run changes it, it's unread again", R.listReports({ map, folders, running: none }).find((x) => x.id === a.id).new === true);
  ok("an id it didn't list can't be read (no paths)", !!R.readReport("../../etc/passwd", { list: l }).error && !!R.readReport(join(run, ".symbiot", "TASKS.md"), { list: l }).error);
  R.markAllRead({ list: R.listReports({ map, folders, running: none }) });
  ok("Mark all read", R.listReports({ map, folders, running: none }).every((r) => !r.new));
}

console.log("IMAGES AND DRAFT TEXT — the Steve LinkedIn week 5 preview showed its pictures as raw text and cut its post off (2026-10-08)");
{
  const prev = join(CFG, "drafts", "act-dfac7fff"), card = join(CFG, "marketing", "drafts", "steve", "linkedin-week-05-card.png");
  mkdirSync(dirname(card), { recursive: true }); writeFileSync(card, Buffer.from("89504e470d0a1a0a", "hex"));
  put(prev, "shot.png", "x"); // relative to the report: .symbiot/shot.png
  const outside = join(HOME, "elsewhere", "secret.png"); mkdirSync(dirname(outside), { recursive: true }); writeFileSync(outside, "x");
  const long = "My AI spent half an hour one morning thinking about capacitors. Nobody asked him to. Here's every step, unedited, including the one he got wrong.";
  const md = `# Steve LinkedIn previews\n\n## Week 5: Tue 3 Nov 2026, 08:00 SAST (scheduled)\n\n![week 5 card](${card})\n\n\`\`\`text\n${long}\n\n- novel — look at capacitor\n\`\`\`\n\nIn LinkedIn, ready to schedule: ![week 5 in LinkedIn's composer]\n(${join(CFG, "poster", "shots", "linkedin-week-05-capacitor-3-ready.png")})\n\n![tilde](~/.config/symbiot/marketing/drafts/steve/linkedin-week-05-card.png) ![rel](shot.png) ![nope](${outside}) ![web](https://example.com/a.png)\n`;
  put(prev, "STEVE-LINKEDIN-PREVIEWS.md", md);
  const l = R.listReports({ map: {}, folders: [prev], running: none, seen: { seen: {} } }), r = R.readReport(l[0].id, { list: l, mark: false });
  const imgs = [...r.html.matchAll(/<img class="rimg" data-src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  ok("an absolute local image shows as a picture, not as ![…](…) text", imgs.length === 3 && !/!\[week 5 card\]/.test(r.html), r.html);
  ok("~/ paths and paths relative to the report show too", imgs.some((u) => /src=~/.test(u)) && imgs.some((u) => /src=shot\.png/.test(u)), imgs);
  ok("one that isn't there says 'Image missing', even split across a line", /class="rimgmiss"[^>]*>🖼 Image missing: week 5 in LinkedIn&#39;s composer/.test(r.html), r.html);
  ok("one outside Symbiot's folder and your projects isn't shown", /Image not shown \(outside your project folders\): nope/.test(r.html), r.html);
  ok("a web image stays a link (nothing remote loads)", /<a href="https:\/\/example\.com\/a\.png"[^>]*>web<\/a>/.test(r.html) && !/data-src="https/.test(r.html));
  ok("the draft post is a wrapping block, its line breaks kept", /<pre class="prose"><code>My AI spent[^<]*\n\n- novel/.test(r.html), r.html);
  ok("…and code fences still don't wrap", /<pre><code>/.test(R.mdHtml("```js\nconst a = 1;\n```")));
  const q = (u) => Object.fromEntries(new URL(u, "http://x").searchParams), first = q(imgs[0]);
  const got = R.reportImage(first.id, first.src, { list: l, roots: [CFG] });
  ok("the image is fetched by the report's id and the src it shows", got.file === card && got.type === "image/png", got);
  ok("…the relative one from the report's own folder", R.reportImage(first.id, "shot.png", { list: l, roots: [CFG] }).file === join(prev, ".symbiot", "shot.png"));
  ok("…not a src the report doesn't show", !!R.reportImage(first.id, "/etc/passwd", { list: l, roots: [CFG] }).error && !!R.reportImage(first.id, join(CFG, "config.json"), { list: l, roots: [CFG] }).error);
  ok("…not from outside its folders, even when the report shows it", /outside/.test(R.reportImage(first.id, outside, { list: l, roots: [CFG] }).error || ""));
  ok("…not by an id it didn't list", !!R.reportImage("nope", first.src, { list: l }).error);
  ok("without a report to fetch by, a local image is a placeholder, never a bare path in an <img>", !/<img/.test(R.mdHtml(`![x](${card})`)));
  ok("an image's alt can't break out of its attribute", !/onerror/.test(R.mdHtml(`![" onerror="alert(1)](${card})`, { id: "a", roots: [CFG] }).replace(/&quot; onerror=&quot;/g, "")));
}

console.log("SAFE HTML — a report can't put its own HTML or script on the page");
{
  const h = R.mdHtml("# Hi <script>alert(1)</script>\n\n<img src=x onerror=alert(1)> and [x](javascript:alert(1)) and [ok](https://example.com) and 'q' \"d\"\n\n```\n<b>raw</b>\n```\n\n| a | b |\n|---|---|\n| <i>x</i> | `<y>` |");
  ok("tags are escaped", !/<script|<img|<i>x/.test(h) && /&lt;script&gt;/.test(h) && /&lt;img/.test(h), h);
  ok("only http, https and mailto links", !/href="javascript/.test(h) && /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">ok<\/a>/.test(h), h);
  ok("code blocks keep their text, escaped", /<pre><code>&lt;b&gt;raw&lt;\/b&gt;<\/code><\/pre>/.test(h));
  ok("quotes are escaped too (nothing can break out of an attribute)", /&#39;q&#39; &quot;d&quot;/.test(h));
  ok("a snake_case name isn't italic", !/<i>/.test(R.mdHtml("set WA_FORWARD_URL and WA_FORWARD_SECRET")));
}

console.log("THE BRIEF AND HOME — runs know where to leave one; the user hears there's one");
{
  const md = buildTasksMd("symbiot", { lanes: ["symbiot"] }, [{ text: "Audit the company folder" }]);
  ok("a repo's TASKS.md says to leave reports in .symbiot/ as .md, read under Reports", /\.symbiot\/.*as a `\.md`/.test(md) && md.includes("under Reports"));
  ok("…and a run of its own (ops) is told the same", HANDBACK.every((l) => actBrief("Map ~/Company", { lanes: [] }).includes(l)));
  ok("Reports is one of the app's parts (a droplet, or under more)", SHAPES.includes("reports"));
  const stub = { board: () => ({ cards: [] }), pending: () => [], agents: () => [], lanes: () => ({ handoffs: [] }) };
  const h = homeState({ fresh: true, deps: { ...stub, reports: () => ({ count: 2, latest: "COMPANY-AUDIT.md: mistakes" }) } });
  const f = h.feeds.find((x) => x.id === "feed:reports");
  ok("Home shows unread reports as a feed that opens Reports", !!f && f.shape === "reports" && f.count === 2 && f.sub === "2 unread" && /COMPANY-AUDIT/.test(f.latest), h.feeds);
  ok("…and nothing when all are read", !homeState({ fresh: true, deps: { ...stub, reports: () => ({ count: 0 }) } }).feeds.length);
}

console.log("SYMBIOT REPORTS — the CLI lists them and prints one");
{
  put(run, "NEW-FINDINGS.md", "# New findings\n\nThree things.\n");
  const env = { ...process.env, HOME, USERPROFILE: HOME, SYMBIOT_SCAN_HOME: join(HOME, "code"), NO_COLOR: "1" };
  const ls = spawnSync(process.execPath, [join(ROOT, "index.mjs"), "reports", "--plain"], { env, encoding: "utf8", timeout: 60000 });
  ok("symbiot reports lists them, unread first marked", ls.status === 0 && /New findings/.test(ls.stdout) && /COMPANY-AUDIT/.test(ls.stdout), ls.stdout + ls.stderr);
  const id = R.listReports({ map, folders, running: none }).find((r) => r.name === "NEW-FINDINGS.md").id;
  const one = spawnSync(process.execPath, [join(ROOT, "index.mjs"), "reports", id.slice(0, 6), "--plain"], { env, encoding: "utf8", timeout: 60000 });
  ok("symbiot reports <id> prints it", one.status === 0 && /Three things\./.test(one.stdout), one.stdout + one.stderr);
  const bad = spawnSync(process.execPath, [join(ROOT, "index.mjs"), "reports", "zzzzzz", "--plain"], { env, encoding: "utf8", timeout: 60000 });
  ok("an id that isn't there fails, and says so", bad.status === 1 && /No report zzzzzz/.test(bad.stdout), bad.stdout);
}

console.log("REPORTS — each ends with what to do about it");
{
  const { reportIdeasAdd, reportAsk, reportDraftAnswer } = await import("../home.mjs");
  const arg = join(HOME, "code", "argena");
  const CATCH = "# Argena catch-up\n\nWhere it stands.\n\n## What changed\n\n- the API moved to v2\n\n## Top 3 next\n\n1. **Fix the login redirect** on staging (`auth.ts`)\n2. Add a test for [the export](https://x.y/z)\n   - with a big file\n3. Ship 0.9 to the beta group\n\n## Notes\n\n- not an idea\n";
  put(arg, "ARGENA-CATCHUP.md", CATCH);
  const list = R.listReports({ map: { argena: arg }, folders: [arg], running: () => false, seen: { seen: {} } });
  const seenFile = join(HOME, "seen-ideas.json");
  const r = R.readReport(list[0].id, { list, seenFile });
  ok("a write-up's end: its own \"Top 3 next\", as ideas, in plain words, nothing from other sections", r.ideas.join("|") === "Fix the login redirect on staging (auth.ts)|Add a test for the export|Ship 0.9 to the beta group" && !r.draft, r.ideas);
  ok("…at most 4, from \"Recommendations\" or \"Next steps\" too; none when it has no such section", R.reportIdeas("## Next steps\n- a\n- b\n- c\n- d\n- e\n").length === 4 && R.reportIdeas("## Recommendations\n* x\n").join() === "x" && R.reportIdeas("# Plain\n\n- a list\n").length === 0);
  const added = [];
  const ia = reportIdeasAdd(list[0].id, [r.ideas[0], r.ideas[2]], { list: () => list, add: (t, lane, o) => (added.push({ t, lane, o }), { id: "x" }) });
  ok("ticked ideas go onto the Workdesk in the report's lane, saying which report they came from", ia.ok && ia.added === 2 && ia.lane === "argena" && added.every((a) => a.lane === "argena" && /from the report "Argena catch-up"/.test(a.o.after)) && added[0].t === "Fix the login redirect on staging (auth.ts)", [ia, added]);
  ok("…none ticked: says so", !!reportIdeasAdd(list[0].id, [], { list: () => list }).error);
  let saw = "";
  const asked = await reportAsk(list[0].id, "which of these first?", { ask: async (sys, prompt) => { saw = prompt; return JSON.stringify({ reply: "The login redirect: it blocks the beta." }); }, deps: { read: (id) => R.readReport(id, { list, mark: false, seenFile }) } });
  ok("ask about it in place: the report is in front of the model, the answer comes back here", asked.answer === "The login redirect: it blocks the beta." && /Top 3 next/.test(saw) && /which of these first\?/.test(saw), [asked, saw.slice(0, 200)]);
  put(arg, "LINKEDIN-POST-PREVIEW.md", "# Draft: Steve week 2 LinkedIn post\n\nThe post.\n\n## Next\n- post it\n");
  const l2 = R.listReports({ map: { argena: arg }, folders: [arg], running: () => false, seen: { seen: {} } }), dr = l2.find((x) => /PREVIEW/.test(x.name));
  const d2 = R.readReport(dr.id, { list: l2, seenFile });
  ok("a draft report gets Approve / Reject, not ideas", d2.draft === true && !d2.ideas && d2.decided === "", d2);
  const ran = [];
  const ap = reportDraftAnswer(dr.id, true, { list: () => l2, decide: (x, st) => R.decide(x, st, seenFile), running: () => false, run: (p) => (ran.push(p), { id: "j" }) });
  const ans = readFileSync(join(arg, ".symbiot", "ANSWERS.md"), "utf8");
  ok("Approve: its agent is told in ANSWERS.md and goes ahead; the report says you approved it", ap.ok && ran.join() === arg && /### Approved: \.symbiot\/LINKEDIN-POST-PREVIEW\.md/.test(ans) && R.readReport(dr.id, { list: l2, seenFile }).decided === "approved", [ap, ans]);
  const rj = reportDraftAnswer(dr.id, false, { list: () => l2, decide: (x, st) => R.decide(x, st, seenFile), run: () => { throw new Error("ran"); } });
  ok("Reject: told not to use it, nothing starts", rj.ok && /### Rejected: \.symbiot\/LINKEDIN-POST-PREVIEW\.md\nThe user rejected/.test(readFileSync(join(arg, ".symbiot", "ANSWERS.md"), "utf8")), rj);
}

console.log("REPORTS — the list says which ones need the user");
{
  const d = join(CFG, "drafts", "act-needs0001");
  put(d, "PLAN.md", "# A plan\n\n## Next steps\n\n- do the first\n- do the second\n");
  put(d, "FINDINGS.md", "# Findings\n\nNothing to do.\n");
  put(d, "POST-DRAFT.md", "# Post draft\n\nText.\n");
  const l = R.withNeeds(R.listReports({ map: { symbiot: repo }, folders: [d], running: () => false }), { seenFile: join(CFG, "seen-needs.json") });
  const by = (n) => l.find((r) => r.name === n);
  ok("a report ending in next steps is 'ideas' with a count", by("PLAN.md").needs === "ideas" && by("PLAN.md").ideas === 2, by("PLAN.md"));
  ok("a report with nothing to act on needs nothing", by("FINDINGS.md").needs === "" && by("FINDINGS.md").ideas === 0);
  ok("an undecided draft is 'draft'", by("POST-DRAFT.md").needs === "draft");
  R.decide(by("POST-DRAFT.md"), "approved", join(CFG, "seen-needs.json"));
  const l2 = R.withNeeds(l, { seenFile: join(CFG, "seen-needs.json") });
  ok("a decided draft stops needing the user", l2.find((r) => r.name === "POST-DRAFT.md").needs === "");
}

{
  const ask = (path, q) => ({ kind: "ask", id: "ask:" + path, q, options: [] });
  const left = settleAsks([ask("a", "Close the Symbiot Browser so I can carry on?"), ask("b", "Click Done in the browser window"), ask("c", "Which plan are you on?"), ask("d", "Which plan are you on?!"), { kind: "setup", id: "s" }]);
  const { addRule: ar } = await import("../asksdone.mjs");
  ar("Main inbox is garthwhite507@gmail.com, never ask which mailbox to clean");
  const cv = settleAsks([ask("m", "Which mailbox should I clean?")]);
  ok("a standing rule that looks like it answers an ask is listed on the card, which stays open", cv.length === 1 && cv[0].covered && cv[0].covered.length === 1, JSON.stringify(cv));
  ok("asks to close the Symbiot Browser never reach Home, and the same question from two agents is one card", left.length === 2 && left[0].path === undefined && left[0].id === "ask:c" && left[1].id === "s", JSON.stringify(left.map((y) => y.id)));
}
{
  const { recordDone } = await import("../asksdone.mjs");
  const dir = join(HOME, "perm"); mkdirSync(join(dir, ".symbiot"), { recursive: true });
  writeFileSync(join(dir, ".symbiot", "allowlist.proposed.json"), JSON.stringify({ permissions: { allow: ["Bash(symbiot screens:*)", "Bash(git status)"] } }));
  const c = plainAsk(dir, { q: "Can I run Symbiot's Screens command?", options: ["👤 You (only you: a permission): allow the list in .symbiot/allowlist.proposed.json (recommended)", "Not now"] });
  ok("a permission card lists the commands in plain words with Allow, and shows no file path", /symbiot screens/.test(c.q) && /git status/.test(c.q) && c.labels[0] === "Allow (recommended)" && !/\.json|\.symbiot/.test(c.q + c.labels.join()), JSON.stringify(c));
  recordDone("Sign in to X as Daaymn?", "Done: signed in");
  ok("an ask the user already answered is not raised again, by any agent", settleAsks([{ kind: "ask", id: "ask:z", q: "Sign in to X as Daaymn" }]).length === 0, "");
}
{
  const { converse } = await import("../mind.mjs");
  const q = "Sign in to the ghost inbox so I can read it?";
  const r = await converse({ where: "Home", question: "here is the email: owner key abc", settle: true, map: {}, ask: async (sys) => JSON.stringify({ reply: "Got it.", settled: [q, "A card that isn't there"] }) });
  ok("Home chat can say a card's question was answered", r.settled && r.settled.length === 2, JSON.stringify(r.settled));
  const n = settleFromChat({ you: [{ kind: "ask", q, id: "ask:g" }] }, r.settled, "here is the email");
  ok("…only a question really on Home closes, and it's then recorded so no agent asks it again", n === 1 && settleAsks([{ kind: "ask", id: "ask:g", q }]).length === 0, n);
  const r2 = await converse({ where: "Reports", question: "hi", map: {}, ask: async () => JSON.stringify({ reply: "Hi", settled: [q] }) });
  ok("…and other chats can't settle cards", !r2.settled, "");
}
console.log(`\n${fail ? "✗" : "✓"} reports: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
