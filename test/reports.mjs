// Reports (reports.mjs): what agents wrote up for the user, in one place. A run
// leaves a .md in its .symbiot/; the app lists it (unread ones marked), shows it
// as safe HTML, and Home says when there's one unread. Isolated HOME (set before
// the modules load).
//
//   node test/reports.mjs
//
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from "node:fs";
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
const { homeState } = await import("../home.mjs");
const { SHAPES } = await import("../adapt.mjs");

const put = (p, f, t, ago = 0) => { mkdirSync(join(p, ".symbiot"), { recursive: true }); const file = join(p, ".symbiot", f); writeFileSync(file, t); if (ago) { const s = (Date.now() - ago) / 1000; utimesSync(file, s, s); } };
const run = join(CFG, "drafts", "act-1d727d7f"), repo = join(HOME, "code", "symbiot");
const AUDIT = "# COMPANY-AUDIT.md: mistakes, conflicts and to-dos\n\n_Ops run, read-only._\n\n## Do today\n\n| # | What | Who |\n|---|---|---|\n| 1 | **v4.18.0 ships tonight** untested | Nadia (`10-…/releases/`) |\n\n- one\n  - nested\n- [x] ticked\n";
put(run, "COMPANY-AUDIT.md", AUDIT, 60000);
put(run, "COMPANY.md", "# What's in ~/Company\n\nTwelve departments.\n", 3600000);
for (const f of ["TASKS.md", "QUESTIONS.md", "ANSWERS.md", "HANDOFF.md", "SKIPPED.md"]) put(run, f, "# not a report\n");
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

console.log(`\n${fail ? "✗" : "✓"} reports: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
