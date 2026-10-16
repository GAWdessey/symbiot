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
  ok("…at most 4, from \"Recommendations\" or \"Next steps\" too; none when it has no such section", R.reportIdeas("## Next steps\n- fix a\n- fix b\n- fix c\n- fix d\n- fix e\n").length === 4 && R.reportIdeas("## Recommendations\n* ship x\n").join() === "ship x" && R.reportIdeas("# Plain\n\n- a list\n").length === 0);
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

console.log("REPORTS — a handed-off or dismissed next step leaves 'Read, to action'");
{
  const { reportIdeasAdd, reportIdeasDismiss } = await import("../home.mjs");
  const d = join(CFG, "drafts", "act-handed001"), sf = join(CFG, "seen-handed.json");
  put(d, "MOVE-PLAN.md", "# Move plan\n\n## Next steps\n\n- move the repo\n- update the links\n");
  const l = R.listReports({ map: { symbiot: repo }, folders: [d], running: () => false }), id = l[0].id;
  const needs = () => R.withNeeds(R.listReports({ map: { symbiot: repo }, folders: [d], running: () => false }), { seenFile: sf })[0];
  ok("a report with two open next steps needs action", needs().needs === "ideas" && needs().ideas === 2);
  reportIdeasAdd(id, ["move the repo"], { list: () => l, add: () => ({ id: "t" }), mark: (r, i, st) => R.markIdeas(r, i, st, sf) });
  ok("handing one over leaves one open, still to action", needs().needs === "ideas" && needs().ideas === 1);
  const rd = R.readReport(id, { list: l, mark: false, seenFile: sf });
  ok("…and reading it lists only the open one, with the handed one recorded", rd.ideas.join() === "update the links" && rd.handled["move the repo"] === "handed", rd);
  reportIdeasDismiss(id, ["update the links"], { list: () => l, mark: (r, i, st) => R.markIdeas(r, i, st, sf) });
  ok("dismissing the last one drops it to Read", needs().needs === "" && needs().ideas === 0);
  ok("nothing was handed over when the Workdesk add failed", (reportIdeasAdd(id, ["x"], { list: () => l, add: () => ({ error: "no" }), mark: () => { throw new Error("marked"); } })).error === "Couldn't add them.");
  put(d, "MOVE-PLAN.md", "# Move plan\n\n## Next steps\n\n- move the repo\n- update the links\n- a new one\n");
  ok("a rewritten report offers its steps again", needs().needs === "ideas" && needs().ideas === 3);
}

console.log("REPORTS — superseded actions leave 'Read, open actions' (2026-10-13)");
{
  ok("half-sentence fragments are not actions", R.reportIdeas("## Next steps\n- and then restart it\n- which covers the login, and\n- Restart\n- Fix the (broken link\n- Fix the login redirect\n").join("|") === "Fix the login redirect", R.reportIdeas("## Next steps\n- and then restart it\n- Restart\n- Fix the login redirect\n"));
  const d1 = join(CFG, "drafts", "act-sup00001"), d2 = join(CFG, "drafts", "act-sup00002"), sf = join(CFG, "seen-sup.json");
  const gone = join(HOME, "no-such", "login.patch");
  put(d1, "AUDIT.md", `# Symbiot audit\n\n## Next steps\n\n- Add the Pro key email step\n- Apply the patch ${gone}\n- Ship the docs fix\n- Rename the footer link\n- Fix the cache bug\n`, 5000);
  put(d2, "AUDIT.md", "# Footer follow-up\n\n## Next steps\n\n- Rename the footer link\n", 1000);
  const l = R.listReports({ map: { symbiot: repo }, folders: [d1, d2], running: () => false }), old = l.find((r) => r.folder === d1);
  const tasks = [
    { id: "t1", text: `Add the Pro key email step (from the report "Symbiot audit", ${old.file})`, repo: "symbiot", done: false, archived: true, merged: true, ts: Date.now() },
    { id: "t2", text: "Fix the cache bug in the proxy layer today", repo: "symbiot", done: false, ts: Date.now() },
    { id: "t3", text: "Ship the docs fix", repo: "symbiot", done: false, ts: Date.now() },
  ];
  const why = R.supersededIdeas(old, R.reportIdeas(readFileSync(old.file, "utf8")), R.supersedeContext({ list: l, tasks, file: sf }));
  ok("an action whose task was merged is superseded", /merged/.test(why.get("Add the Pro key email step")), [...why]);
  ok("…one whose patch file is gone", /login\.patch is gone/.test(why.get(`Apply the patch ${gone}`)), [...why]);
  ok("…one an open task already covers", /another task/.test(why.get("Ship the docs fix")), [...why]);
  ok("…one a newer report lists too", /newer report/.test(why.get("Rename the footer link")), [...why]);
  ok("…and one nothing has settled stays open", !why.has("Fix the cache bug"), [...why]);
  const cleared = R.sweepSuperseded({ list: l, seenFile: sf, tasks });
  ok("the sweep says what it cleared and why, and the report keeps just the live one", cleared.length === 4 && cleared.every((c) => c.why) && R.withNeeds(l, { seenFile: sf, tasks }).find((r) => r.id === old.id).ideas === 1, cleared);
  ok("…and records them as superseded", R.handledIdeas(old, sf)["Ship the docs fix"] === "superseded");
  const same = R.supersededIdeas(old, ["Fix the cache bug"], R.supersedeContext({ list: [...l, { ...old, id: "later", title: "Symbiot audit 2", mtime: old.mtime + 10, file: join(d2, "X.md") }], tasks: [], file: sf }));
  ok("a later report with the same title in the lane replaces the earlier one", /later report/.test(same.get("Fix the cache bug")), [...same]);
}

console.log("REPORTS — what is not an action never sits in 'Read, open actions' (2026-10-16)");
{
  ok("an archive of answers is not a report", /^(?:ANSWERS(?:\.archive)?)\.md$/.test("ANSWERS.archive.md") && R.NOT_REPORTS.test("ANSWERS.archive.md") && !R.NOT_REPORTS.test("ANSWERS-REVIEW.md"));
  ok("a report's title never opens an actions section", R.reportIdeas("# Recommended local models refresh\n\n- qwen3.5:4b is 3.3 GB\n- qwen3.5:9b is 6.6 GB\n").length === 0);
  ok("the record of what was fixed is not a to-do list, 'Next 3 fixes' is", R.reportIdeas("## The fix\n\n- Changed the scorer to match whole words\n\n## Battery scorer fix\n\n- Plurals now match\n\n## The date-boundary flaw (top priority)\n\n- The prompt carried no date at all\n").length === 0 && R.reportIdeas("## Next 3 fixes, in order\n\n- Stop the pruner retiring learned skills\n").length === 1);
  ok("a bullet that says to leave things be, or what is already so, is not an action", R.reportIdeas("## Recommendation\n\n- Do not add Colibri to the model list\n- Keep the routing as is\n- Revisit only if Garth gets 64 GB of RAM\n- Ticked: the two sign-in items\n- Media hashing is now cached by path\n- Add the Colibri note to the docs\n").join("|") === "Add the Colibri note to the docs");
  ok("a plan that is to be done still counts", R.reportIdeas("## 6. Implementation plan (a task for the symbiot lane)\n\n- Escalate a failed run to the next tier up\n").length === 1);
  // the real case: the launch-posts report's action, worded differently from the task that covers it
  const idea = "Give the two Symbiot launch drafts an Approve button under Marketing, then approve both";
  const task = { id: "87af67989d55", text: "Fix in Symbiot: the marketing report 'Symbiot launch posts: last link and claim check' tells Garth to 'approve both drafts under Marketing', but no approval card or button exists for them. The two drafts are the blog post and the Show HN launch drafts", repo: "symbiot", done: false, ts: Date.now() };
  const rep = { id: "lc", title: "Symbiot launch posts: last link and claim check", name: "LINK-CHECK.md", file: "/x/LINK-CHECK.md", lane: "marketing", mtime: Date.now() - 1000 };
  const w = R.supersededIdeas(rep, [idea, "Rotate the signing key"], R.supersedeContext({ list: [rep], tasks: [task], file: join(CFG, "seen-wide.json") }));
  ok("a task worded differently still covers an action about the same thing", /another task/.test(w.get(idea)) && !w.has("Rotate the signing key"), [...w]);
  const done = R.supersededIdeas(rep, [idea], R.supersedeContext({ list: [rep], tasks: [{ ...task, done: true, archived: true }], file: join(CFG, "seen-wide.json") }));
  ok("…and a done one clears it as done", /done/.test(done.get(idea)), [...done]);
  const old = R.supersededIdeas({ ...rep, mtime: Date.now() + 5000 }, [idea], R.supersedeContext({ list: [rep], tasks: [task], file: join(CFG, "seen-wide.json") }));
  ok("a task written before the report does not clear it", !old.has(idea), [...old]);
}

{
  const ask = (path, q) => ({ kind: "ask", id: "ask:" + path, q, options: [] });
  const left = settleAsks([ask("a", "Close the Symbiot Browser so I can carry on?"), ask("b", "Click Done in the browser window"), ask("c", "Which plan are you on?"), ask("d", "Which plan are you on?!"), { kind: "setup", id: "s" }]);
  const { addRule: ar } = await import("../asksdone.mjs");
  ar("Main inbox is garthwhite507@gmail.com, never ask which mailbox to clean");
  const cv = settleAsks([ask("m", "Which mailbox should I clean?")]);
  ok("a standing rule that looks like it answers an ask is listed on the card, which stays open", cv.length === 1 && cv[0].covered && cv[0].covered.length === 1, JSON.stringify(cv));
  const npm = settleAsks([ask("n1", "Tap your security key to save the npm Trusted Publisher for GAWdessey symbiot publish.yml"), ask("n2", "On npm, save the Trusted Publisher (GAWdessey / symbiot / publish.yml) with your security key tap"), ask("n3", "Which plan are you on today?")]);
  const clicks = settleAsks([ask("c1", "Click Edit on the trusted publisher, set owner GAWdessey, and Save"), ask("c2", "Press Delete next to GarthGhostai/symbiot, then click Done"), ask("c3", "Tap your security key, then click Save on npm"), ask("c4", "Which plan are you on?")]);
  ok("a card that hands the agent's clicks to the user never reaches Home; a key tap or a real question does", clicks.length === 2 && clicks[0].id === "ask:c3" && clicks[1].id === "ask:c4", JSON.stringify(clicks.map((y) => y.id)));
  ok("the same human step worded two ways is one card", npm.length === 2 && npm[0].id === "ask:n1" && npm[1].id === "ask:n3", JSON.stringify(npm.map((y) => y.id)));
  ok("asks to close the Symbiot Browser never reach Home, and the same question from two agents is one card", left.length === 2 && left[0].path === undefined && left[0].id === "ask:c" && left[1].id === "s", JSON.stringify(left.map((y) => y.id)));
}
{
  const { recordDone } = await import("../asksdone.mjs");
  const dir = join(HOME, "perm"); mkdirSync(join(dir, ".symbiot"), { recursive: true });
  writeFileSync(join(dir, ".symbiot", "allowlist.proposed.json"), JSON.stringify({ permissions: { allow: ["Bash(symbiot screens:*)", "Bash(git status)"] } }));
  const c = plainAsk(dir, { q: "Can I run Symbiot's Screens command?", options: ["👤 You (only you: a permission): allow the list in .symbiot/allowlist.proposed.json (recommended)", "Not now"] });
  ok("a permission card lists the commands in plain words with Allow, and shows no file path", /run symbiot/.test(c.q) && /run git/.test(c.q) && c.labels[0] === "Allow (recommended)" && !/\.json|\.symbiot/.test(c.q + c.labels.join()), JSON.stringify(c));
  ok("a permission card keeps the agent's own question to answer with, since the shown one is reworded", c.raw === "Can I run Symbiot's Screens command?" && c.q !== c.raw, JSON.stringify(c));
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
console.log("FINDINGS AND REMOVING — a fact a report found isn't filed as a job; any card or task goes in one click, with Undo");
{
  const { isFinding } = await import("../core.mjs");
  const facts = ["Google is already fully on dailify.co.za. The only OAuth client lists only https://dailify.co.za.",
    "API_EXTERNAL_URL is https://dailify.fshub.dev, not supabase.seekerai.dev. That's the value in the running container.",
    "The 14 WhatsApp templates are already approved, not pending. All 14 show Approved in Twilio. (from the report \"Dailify domain move: ops audit (read only)\", /x/AUDIT.md)"];
  ok("the three dailify findings of 15 Oct read as findings", facts.every(isFinding), facts.filter((f) => !isFinding(f)));
  const jobs = ["Fix the sign-in page on Safari.", "Login is not working on mobile.", "Sign-in is still broken on Safari.", "Paystack's live webhook is empty, not set: that's for the dailify lane to check.",
    "Reconnect Garth's calendar: it is already expiring.", "Is the live key from another Paystack business?", "Don't start a handoff where an agent is already running.", "When the reply is already in, hand it on."];
  ok("…and jobs, bug reports and questions don't", !jobs.some(isFinding), jobs.filter(isFinding));
  const ideas = R.reportIdeas("# Audit\n\n## Four things that change the plan\n\n- Google is already fully on dailify.co.za.\n- API_EXTERNAL_URL is https://dailify.fshub.dev, not supabase.seekerai.dev.\n- Reconnect Garth's own calendar once.\n");
  ok("a report's next steps leave its findings out", ideas.join("|") === "Reconnect Garth's own calendar once.", ideas);
  const { reportIdeasAdd } = await import("../home.mjs");
  const d = join(CFG, "drafts", "act-finding01"); put(d, "AUDIT.md", "# Audit\n\n## Next\n\n- Reconnect the calendar\n");
  const l = R.listReports({ map: {}, folders: [d], running: () => false }), got = [];
  const r = reportIdeasAdd(l[0].id, ["Reconnect the calendar", facts[0]], { list: () => l, add: (t, lane, o) => (got.push(o), { id: "x" + got.length, ...(o.finding ? { done: true, finding: "a finding" } : {}) }), mark: () => {} });
  ok("an older ticked finding goes in ticked as done, and the answer says so", !got[0].finding && got[1].finding === true && /One is a finding, not a job/.test(r.said) && /It's on the Workdesk/.test(r.said), r);

  const T = await import("../tasks.mjs"), { loadTasks } = await import("../core.mjs");
  const by = (id) => loadTasks().find((x) => x.id === id);
  const f = T.addTask(facts[1], "dailify", { after: '(from the report "Dailify domain move: ops audit (read only)", /x/AUDIT.md)' });
  const job = T.addTask("Reconnect Garth's calendar (from the report \"Audit\", /x/A.md)", "dailify");
  T.syncTasks();
  ok("sync ticks a finding filed from a report as done, saying why, into the Archive", by(f.id).done && by(f.id).archived && /a finding, not a job/.test(by(f.id).finding), by(f.id));
  ok("…and leaves a job from the same report open", !by(job.id).done && !by(job.id).archived);
  T.restoreTask(f.id); T.syncTasks();
  ok("a finding you restore stays open: you said there's something to do", !by(f.id).done && !by(f.id).archived && by(f.id).kept, by(f.id));
  const c = T.cancelTask(job.id);
  ok("Remove cancels a task: archived, marked removed, not deleted", c.ok && by(job.id).archived && by(job.id).cancelled, by(job.id));
  T.restoreTask(job.id);
  ok("…and Undo brings it back open, as it was", !by(job.id).archived && !by(job.id).cancelled && !by(job.id).done, by(job.id));
  ok("removing a task that's gone says so", !!T.cancelTask("nope").error);

  const H = await import("../home.mjs");
  const stub = { board: () => ({ cards: [] }), agents: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, agentCmd: () => "claude", repos: () => ({}), confirmed: () => true, rootsSet: () => true, signedOut: () => [], agentGone: () => "", waits: () => [], clashes: () => [], stuck: () => [], drafts: () => [],
    pending: () => [{ path: "/code/dailify", repo: "dailify", tasks: [{ text: "a" }], files: ["x"] }] };
  const card = () => H.homeState({ fresh: true, deps: stub }).you.find((y) => y.id === "approve:dailify");
  ok("an Approve card is on Home", !!card());
  const key = H.cardKey(card());
  ok("Dismiss takes it off Home", H.dismissCard(key).ok && !card());
  ok("…Undo brings it back", H.dismissCard(key, { undo: true }).ok && !!card());
  H.dismissCard(key);
  const more = { ...stub, pending: () => [{ path: "/code/dailify", repo: "dailify", tasks: [{ text: "a" }, { text: "b" }], files: ["x"] }] };
  ok("a changed card (another task done) shows again", !!H.homeState({ fresh: true, deps: more }).you.find((y) => y.id === "approve:dailify"));
  ok("…and the card's key is the app's (bdKey): path and question for a question, else id and what it says", H.cardKey({ path: "/p", q: "Q?", raw: "Raw?" }) === "/p|Raw?" && H.cardKey({ id: "setup:x", sub: "s" }) === "setup:x|s");
  ok("dismissing nothing says so", !!H.dismissCard("").error);
  const ui = readFileSync(join(ROOT, "ui.mjs"), "utf8");
  ok("every card has its × (blobBody), wired to dismiss with Undo", /class='bx'/.test(ui) && /api\('\/api\/home\/dismiss',\{key:key\}\)/.test(ui) && /lqUndo\('Dismissed: '/.test(ui) && /undo:true/.test(ui));
  ok("a task's × on the Workdesk cancels it with Undo, never deletes it", /api\('\/api\/tasks\/cancel',\{id:id\}\)/.test(ui) && /lqUndo\('Removed: '/.test(ui) && !/rm\.addEventListener\('click',function\(\)\{api\('\/api\/tasks\/remove'/.test(ui));
  ok("a waiting task on Home's work scene has Remove too", /class='lrm'/.test(ui) && /api\('\/api\/tasks\/cancel',\{id:tid\}\)/.test(ui));
}
{
  const ui = readFileSync(join(ROOT, "ui.mjs"), "utf8");
  ok("Reports is split into Unread / Read, open actions / Read and done tabs with counts, Unread first, grouped by lane", /REPTAB='unread'/.test(ui) && /Read, open actions/.test(ui) && /Read and done/.test(ui) && /id='reptabs'/.test(ui) && /by\[r\.lane\]/.test(ui), "");
  ok("Approve's overlap question is an in-app note, never window.confirm", !/if\(confirm\(r\.error\)\)/.test(ui) && /askyes/.test(ui), "");
  ok("an open report's back row sticks to the top while the report scrolls", /#reportslist:has\(#reportback\)\{[^}]*position:sticky;top:0/.test(ui), "");
}

console.log("REPORTS — usable rows (2026-10-16): honest 'still writing', readable source, steps and buttons on the row");
{
  const old = join(run, ".symbiot", "COMPANY.md"), days = (Date.now() - 4 * 864e5) / 1000;
  utimesSync(old, days, days);
  writeFileSync(join(run, ".symbiot", "TASKS.md"), "# For your agent: Home\n\nThe user asked Symbiot for this:\n\n> Research for Garth: can Symbiot run its cheaper agent work on local models, combined with picking a model per task by cost? Don't edit code.\n");
  const l = R.listReports({ map, folders, running: (p) => p === run });
  ok("a 4-day-old report is not 'still writing' even while its folder has a run going", l.find((r) => r.name === "COMPANY.md").running === false && l.find((r) => r.name === "COMPANY-AUDIT.md").running === true, l.map((r) => [r.name, r.running]));
  ok("an ops report shows what the run was for, not its act id", /^Research for Garth: can Symbiot run/.test(l[0].source) && l[0].source.length <= 80 && l.find((r) => r.lane === "symbiot").source === "", l.map((r) => r.source));
  const w = R.withNeeds(R.listReports({ map, folders, running: none }), { seenFile: join(CFG, "seen-rows.json"), tasks: [] });
  ok("a report with next steps carries them on its row", w.every((r) => Array.isArray(r.steps) && r.steps.length === r.ideas), w.map((r) => [r.name, r.ideas, r.steps]));
  const ui = readFileSync(join(ROOT, "ui.mjs"), "utf8");
  ok("each row offers Hand to agent, Done and Drop per step, Hand all per report, and Approve on a draft", /rsgo/.test(ui) && /rsdone/.test(ui) && /rsdrop/.test(ui) && /Hand all to agents/.test(ui) && /rsapprove/.test(ui) && /r\.source\?/.test(ui));
  const r0 = w.find((r) => r.steps.length) || w[0];
  R.markIdeas(r0, r0.steps.length ? r0.steps : ["x"], "done", join(CFG, "seen-rows.json"));
  const w2 = R.withNeeds(R.listReports({ map, folders, running: none }), { seenFile: join(CFG, "seen-rows.json"), tasks: [] }).find((r) => r.id === r0.id);
  ok("a report whose steps are all done moves to Read and done by itself", w2.needs === "" && w2.steps.length === 0, w2);
}
console.log(`\n${fail ? "✗" : "✓"} reports: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
