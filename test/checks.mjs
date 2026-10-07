// Checks (checks.mjs): where two files of a knowledge folder disagree. A small
// made-up company folder in an isolated HOME (set before the modules load).
//
//   node test/checks.mjs
//
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-checks-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const C = await import("../checks.mjs");

// ---- a tiny company folder ----------------------------------------------------------
const CO = join(HOME, "Co");
const put = (rel, text) => { const p = join(CO, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, text); return p; };
// leave, and work booked on it
put("hr/leave/active/leave-register.csv", "Ref,Employee,Leave type,From,To,Working days,Status\nLV-101,Thandi Mokoena,Annual,2026-11-09,2026-11-13,5,Approved\nLV-102,Sipho Dube,Sick,2026-10-20,2026-10-20,1,Declined\n");
put("marketing/active/2026-10-launch/STATUS.md", "---\nitem: Spring launch\nowner: Thandi Mokoena\nstatus: In progress\ndue: 2026-11-11\n---\n\n# Spring launch\n\n## Checklist\n- [ ] Send the invitations (Thandi, 12 Nov)\n- [ ] Book the venue (Sipho Dube, 20 Oct)\n");
// a public holiday, and a task due on it
put("admin/calendar/active/public-holidays.md", "# Public holidays\n\n| Date | Day | Holiday |\n|---|---|---|\n| 16 Dec 2026 | Wednesday | Day of Reconciliation |\n| 26 Dec 2026 | Saturday | Day of Goodwill: **no** Monday holiday |\n");
put("ops/active/tracker.csv", "Action,Owner,Due date\nQuarterly stock count,Sipho Dube,2026-12-16\nPrint the price list,Sipho Dube,2026-12-15\n");
// office days, and an all-hands on another day
put("policies/hybrid-work.md", "# Hybrid work\n\nAnchor days are Tuesday and Thursday. All-hands and team planning are scheduled on anchor days.\n");
put("admin/all-hands/STATUS.md", "# November all-hands\n\nThe all-hands is pencilled for Friday 27 November, 15:00.\n");
// a customer whose renewal date and account owner two files disagree on
put("sales/accounts.csv", "Customer,Plan,Users,ARR excl VAT,Contract end,Health,Account owner\nAcacia Mining,Business,20,107760,2027-03-31,Green,Garth White\nBluegum Logistics,Starter,5,17340,2027-01-31,Green,Garth White\n");
put("cs/renewals.csv", "Customer,Plan,Users,Renewal date,Health,Account owner\nAcacia Mining (Pty) Ltd,Business,20,2027-06-30,Green,Lerato Khoza\nBluegum Logistics,Starter,5,2027-02-01,Green,Garth White\n");
// examples: a templates/ folder and a file marked example: true, never facts
put("sales/templates/accounts.csv", "Customer,Plan,Users,ARR excl VAT,Contract end,Health,Account owner\nAcacia Mining,Enterprise,999,1,2029-01-01,Red,Zed Example\n");
put("hr/old-demo.md", "---\nexample: true\n---\n# Demo\n\nThandi Mokoena was on sick leave on 12 Nov. The all-hands is pencilled for Monday 30 November, 15:00.\n");
put("hr/templates/leave-register.csv", "Ref,Employee,Leave type,From,To,Working days,Status\nLV-900,Sipho Dube,Annual,2026-10-19,2026-10-23,5,Approved\n");
const folders = [{ path: CO, examples: ["templates/"] }], now = Date.parse("2026-10-07T09:00:00Z");

try {
  console.log("DATES — the common forms, ranges and lists");
  const ref = "2026-10-07", d = (s) => C.parseDates(s, ref).map((x) => (x.from === x.to ? x.from : x.from + ".." + x.to)).join(" ");
  ok("ISO, day-month, weekday-day-month-year, day first with slashes", d("2026-10-12; 12 Oct; Friday 30 October 2026; 13/10/2026") === "2026-10-12 2026-10-12 2026-10-30 2026-10-13", d("2026-10-12; 12 Oct; Friday 30 October 2026; 13/10/2026"));
  ok("a range in one month, across months, and a list", d("on leave 5–9 Oct") === "2026-10-05..2026-10-09" && d("28 Sep – 2 Oct") === "2026-09-28..2026-10-02" && d("12 and 13 Oct") === "2026-10-12 2026-10-13", [d("on leave 5–9 Oct"), d("28 Sep – 2 Oct"), d("12 and 13 Oct")]);
  ok("no year: the nearest one (12 Feb in October is next February)", d("Fri 12 Feb") === "2027-02-12", d("Fri 12 Feb"));
  ok("a time and its end", JSON.stringify(C.timeOf("Wed 7 Oct, 09:30–10:15")) === JSON.stringify({ start: 570, end: 615 }), C.timeOf("Wed 7 Oct, 09:30–10:15"));

  console.log("FACTS — from the folder, examples left out");
  const files = C.loadFiles(folders), facts = C.extractFacts(files, { now });
  ok("files read, the examples marked", files.length === 11 && files.filter((f) => f.example).length === 3, files.map((f) => [f.rel, f.example]));
  ok("leave from the register (a declined request isn't leave)", facts.leave.length === 1 && facts.leave[0].person === "Thandi Mokoena" && facts.leave[0].from === "2026-11-09" && facts.leave[0].to === "2026-11-13", facts.leave);
  ok("commitments: an item's due date and checklist lines with a name and a date", facts.commitments.some((c) => c.person === "Thandi Mokoena" && c.date === "2026-11-11" && c.due) && facts.commitments.some((c) => c.person === "Thandi Mokoena" && c.date === "2026-11-12" && /invitations/.test(c.what)), facts.commitments);
  ok("holidays from a holiday table, not the 'no Monday holiday' line's day", facts.holidays.some((h) => h.date === "2026-12-16") && !facts.holidays.some((h) => h.date === "2026-12-28"), facts.holidays);
  ok("office days from the policy", facts.officeDays && facts.officeDays.days.join() === "Tuesday,Thursday", facts.officeDays);
  ok("customers' facts by column name, one customer under two spellings", facts.customers.filter((c) => c.customer === "Acacia Mining" && c.field === "renewal").length === 2, facts.customers.filter((c) => /acacia/i.test(c.customer)));
  ok("examples aren't facts: no 2029 renewal, no Zed Example, no demo leave", !facts.customers.some((c) => c.value === "2029-01-01" || c.value === "Zed Example") && !facts.leave.some((l) => l.person === "Sipho Dube") && !facts.commitments.some((c) => /old-demo|templates/.test(c.file)), facts.customers);

  console.log("CLASHES");
  const r = C.runChecks({ folders, now }), k = (kind) => r.clashes.filter((c) => c.kind === kind);
  const leave = k("leave")[0];
  ok("leave: work due while the person is away, with both files", leave && /Thandi Mokoena is on annual leave Mon 9 Nov 2026 to Fri 13 Nov 2026/.test(leave.text) && /Spring launch/.test(leave.text) && /invitations/.test(leave.text) && leave.files.some((f) => /leave-register\.csv$/.test(f)) && leave.files.some((f) => /STATUS\.md$/.test(f)) && leave.severity === "high", leave);
  ok("…and the declined sick day isn't leave: booking the venue that day is fine", !r.clashes.some((c) => /venue/.test(c.text)), r.clashes.map((c) => c.text));
  const hol = k("holiday")[0];
  ok("holiday: a task due on a public holiday", hol && /Wed 16 Dec 2026 is a public holiday \(Day of Reconciliation\)/.test(hol.text) && /Sipho Dube/.test(hol.text) && /stock count/.test(hol.text) && hol.files.length === 2, hol);
  ok("…and not the one due the day before", !r.clashes.some((c) => /price list/.test(c.text)), r.clashes.map((c) => c.text));
  const od = k("office-day")[0];
  ok("office day: the all-hands on a Friday when the office days are Tuesday and Thursday", od && /all-hands is on Fri 27 Nov 2026/.test(od.text) && /Tuesday and Thursday/.test(od.text) && od.files.some((f) => /hybrid-work\.md$/.test(f)), od);
  const ren = k("customer").find((c) => c.field === "renewal");
  ok("renewal date: two files, two dates, one plain sentence", ren && /^Acacia Mining's renewal date disagrees: .* vs .*\.$/.test(ren.text) && /Wed 31 Mar 2027 \(sales\/accounts\.csv\)/.test(ren.text) && /Wed 30 Jun 2027 \(cs\/renewals\.csv\)/.test(ren.text) && ren.files.length === 2 && ren.severity === "high", ren);
  ok("…an end date and a renewal the day after are the same date", !k("customer").some((c) => /Bluegum/.test(c.text) && c.field === "renewal"), k("customer"));
  const own = k("customer").find((c) => c.field === "owner");
  ok("owner: Garth White in one, Lerato Khoza in the other", own && /^Acacia Mining's account owner disagrees: /.test(own.text) && /Garth White \(sales\/accounts\.csv\)/.test(own.text) && /Lerato Khoza \(cs\/renewals\.csv\)/.test(own.text), own);
  ok("examples never clash: nothing cites a template or the demo file", !r.clashes.some((c) => c.files.some((f) => /templates|old-demo/.test(f)) || /2029|Zed|Monday 30 Nov|Mon 30 Nov/.test(c.text)), r.clashes);
  ok("files are cited like chats cite them (~/…)", r.clashes.every((c) => c.files.every((f) => f.startsWith("~/Co/"))), r.clashes.map((c) => c.files));
  ok("counts for the app", r.counts.files === 11 && r.counts.examples === 3 && r.counts.leave === 1 && r.counts.customers === 2, r.counts);

  console.log("STATE — the last run, kept for the app");
  const st = C.checksState();
  ok("checksState gives the last run and when", st.at === now && st.clashes.length === r.clashes.length && st.officeDays.join() === "Tuesday,Thursday", st);
  ok("kept yours only (0600)", (statSync(C.CHECKS_FILE).mode & 0o777) === 0o600, (statSync(C.CHECKS_FILE).mode & 0o777).toString(8));
  rmSync(C.CHECKS_FILE);
  ok("before the first run: nothing, at 0", C.checksState().at === 0 && C.checksState().clashes.length === 0);

  console.log("MORE — double bookings, working days, the same leave told twice");
  put("sales/active/discovery/STATUS.md", "---\nitem: Discovery call\nowner: Garth White\nstatus: In progress\nnext_step: Discovery call with Riaan Smit, Wed 4 Nov 10:00 (video call)\n---\n# Discovery\n");
  put("cs/active/kickoff/agenda.md", "# Kick-off agenda\n\n**Date:** Wednesday 4 November 2026, 10:00 to 11:00\n\n| Time | Item | Who |\n|---|---|---|\n| 10:05 | What you bought and why | Garth White |\n");
  put("finance/active/reforecast/STATUS.md", "# Reforecast\n\nStart the model after the close (WD7, 9 Dec).\n\nTreat 16 Dec as a public holiday: the close (WD12, 16 Dec) moves.\n");
  put("it/active/queue/STATUS.md", "# Queue\n\nLwazi Ndlela was on study leave on 1–2 October, so Mohammed covered.\n");
  put("hr/leave/active/study.csv", "Employee,Leave type,From,To,Status\nLwazi Ndlela,Study,2026-10-12,2026-10-13,Approved\n");
  const r2 = C.runChecks({ folders, now, save: false }), k2 = (kind) => r2.clashes.filter((c) => c.kind === kind);
  ok("double-booked: a call at 10:00 and a kick-off slot at 10:05, in two files", k2("double-booked").some((c) => /Garth White is double-booked on Wed 4 Nov 2026/.test(c.text)), r2.clashes.map((c) => c.text));
  ok("working day: WD12 isn't 16 Dec in a December with a holiday on the 16th; WD7 9 Dec is right", k2("working-day").length === 1 && /WD12, 16 Dec/.test(k2("working-day")[0].text) && /Thu 17 Dec 2026/.test(k2("working-day")[0].text), k2("working-day"));
  ok("the same study leave on two sets of dates", k2("leave-dates").some((c) => /Lwazi Ndlela's study leave is/.test(c.text)), k2("leave-dates"));
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} checks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
