// Marketing overview (mkoverview.mjs): the top of the Marketing page, split by product,
// read from the lane's own files. Isolated HOME; a lane folder built here.
//
//   node test/mkoverview.mjs
//
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-mkover-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { marketingOverview, weeklyRows } = await import("../mkoverview.mjs");

const dir = mkdtempSync(join(tmpdir(), "mklane-"));
const put = (rel, text) => { const f = join(dir, rel); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, text); };
const post = (title, product, when) => `# ${title}\ntype: post\nproduct: ${product}\nplatform: linkedin\nwhen: ${when}\n\n## Post\n${title} body\n`;
const NOW = Date.parse("2026-10-23T09:00:00");
const at = (s) => Date.parse(s.replace(" ", "T"));

put("drafts/dailify/06-life-cover.md", post("12:32, a life cover call", "Dailify", "2026-10-29 08:00"));
put("drafts/dailify/06b-life-cover.md", post("12:32, a life cover call", "Dailify", "2026-10-29 08:00"));
put("drafts/dailify/new-draft.md", post("A new idea for brokers", "Dailify", ""));
put("drafts/dailify/old.md", post("Already out", "Dailify", "2026-10-19 08:00"));
put("drafts/symbiot/stall.md", post("The app stalled for two seconds", "Symbiot", "2026-11-13 08:00"));
put("drafts/symbiot/plan.md", "# A plan\ntype: plan\nproduct: Symbiot\n\n## Notes\nnot a post\n");
const statuses = {};
for (const [rel, when] of [["drafts/dailify/06-life-cover.md", "2026-10-29 08:00"], ["drafts/dailify/06b-life-cover.md", "2026-10-29 08:00"], ["drafts/dailify/old.md", "2026-10-19 08:00"], ["drafts/symbiot/stall.md", "2026-11-13 08:00"]]) {
  statuses[rel] = { status: "approved", sig: "x", at: NOW - 1000, posted: at(when), postedOn: "linkedin" };
}
put(".symbiot/drafts.json", JSON.stringify(statuses));

console.log("no weekly report yet:");
{
  const o = marketingOverview({ dir, now: NOW, names: ["Dailify", "Symbiot"] });
  const d = o.products.find((p) => p.name === "Dailify"), s = o.products.find((p) => p.name === "Symbiot");
  ok("scheduled posts sit under their product, soonest first, a redraft marked too counted once", d && d.scheduled.length === 1 && d.scheduled[0].title === "12:32, a life cover call" && d.scheduled[0].platform === "LinkedIn", d && d.scheduled);
  ok("a post that already went out isn't scheduled", !d.scheduled.some((x) => /Already/.test(x.title)));
  ok("a draft without a verdict waits on you", d.waiting.length === 1 && d.waiting[0].title === "A new idea for brokers", d.waiting);
  ok("a plan isn't a post", !s.waiting.length && s.scheduled.length === 1);
  ok("no numbers is null, never a zero", d.total === null && s.total === null && !d.numbers.length);
  ok("no report: none pinned", o.report === null);
}

put(".symbiot/MARKETING-WEEK.md", `# How marketing did this week (Mon 19 to Fri 23 Oct 2026)

**Result: a quiet week. Four posts reached 375 impressions.**

| Day | Post | Product | Impressions | Reached | Reactions | Comments | Reposts |
|---|---|---|---|---|---|---|---|
| Mon 19 Oct | Nine, not Nein | Dailify | 107 | 74 | 0 | 0 | 0 |
| Tue 20 Oct | Steve's post | — | 35 | 18 | 1 | 2 | 1 |
| Wed 21 Oct | What arrived | Symbiot | 1,178 | 118 | 2 | 0 | 0 |
| Fri 23 Oct | New address | Dailify | goes out at 08:00 | | | | |
| **Total** | 3 posts out | | **1,320** | | **3** | **2** | **1** |
`);
put(".symbiot/MARKETING-WEEK-OLD.md", "# How marketing did this week (Mon 12 to Fri 16 Oct 2026)\n\n| Post | Product | Impressions |\n|---|---|---|\n| Old | Dailify | 999 |\n");
const { utimesSync } = await import("node:fs");
utimesSync(join(dir, ".symbiot/MARKETING-WEEK-OLD.md"), new Date(NOW - 7 * 86400000), new Date(NOW - 7 * 86400000));
put(".symbiot/TASKS.md", `# t\n- [~] [LinkedIn Ads] Claim the credit. (waits on: Garth turning on two-step verification at linkedin.com (re-checked 23 Oct))\n- [~] An untagged long item that waits\n- [x] [Dailify] done\n`);

console.log("with the week's report:");
{
  const o = marketingOverview({ dir, now: NOW, names: ["Dailify", "Symbiot"] });
  const d = o.products.find((p) => p.name === "Dailify"), s = o.products.find((p) => p.name === "Symbiot"), x = o.products.find((p) => p.name === "Other posts");
  ok("the newest weekly report is the one pinned", o.report && /19 to Fri 23 Oct/.test(o.report.title) && /quiet week/.test(o.report.result), o.report);
  ok("a product's numbers are its posts' own; a post that hasn't gone out has none", d.numbers.length === 1 && d.total.reach === 107 && d.total.reactions === 0, d.total);
  ok("thousands read as numbers", s.total.reach === 1178, s.total);
  ok("a post of no product is listed apart, the Total row not counted", x && x.total.reach === 35 && x.numbers.length === 1, x);
  ok("clicks the report doesn't hold stay null, not zero", d.total.clicks === null && s.numbers[0].clicks === null);
  ok("open items: the tagged one, by what it waits on, without its brackets of detail", o.open.length === 1 && o.open[0].tag === "LinkedIn Ads" && o.open[0].text === "waiting on Garth turning on two-step verification at linkedin.com", o.open);
}
{
  const rows = weeklyRows("| Post | Product | Impressions | Link clicks |\n|---|---|---|---|\n| A | Dailify | 10 | 3 |\n| B | Dailify | 5 | n/a |\n");
  ok("a clicks column is read when the report has one", rows.length === 2 && rows[0].clicks === 3 && rows[1].clicks === null, rows);
}
{
  const o = marketingOverview({ dir: mkdtempSync(join(tmpdir(), "mkempty-")), now: NOW });
  ok("an empty lane: no products, nothing pinned, no crash", !o.products.length && !o.open.length && o.report === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
