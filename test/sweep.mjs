// The daily sweep (sweep.mjs): finished run folders, old page maps and screenshots,
// leftovers of gone processes, corrupt copies and settled keys go; what's live, open,
// waited on, unread or recent stays. A throwaway HOME, never the real one.
//
//   node test/sweep.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-sweep-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const DAY = 86400000, now = Date.now();
const old = (p, days) => { const t = new Date(now - days * DAY); utimesSync(p, t, t); };
const S = await import("../sweep.mjs");
const { writeJsonAtomic } = await import("../core.mjs");

try {
  console.log("RUN FOLDERS — finished, quiet for 3 days, nothing open");
  const drafts = join(CFG, "drafts");
  const act = (name, days, files = {}) => { const d = join(drafts, name, ".symbiot"); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "TASKS.md"), "- [x] done\n"); for (const [f, t] of Object.entries(files)) writeFileSync(join(d, f), t); for (const f of ["TASKS.md", ...Object.keys(files)]) old(join(d, f), days); old(d, days); old(join(drafts, name), days); return join(drafts, name); };
  const gone = act("act-aaaa0001", 20), fresh = act("act-aaaa0002", 1), running = act("act-aaaa0003", 20), asking = act("act-aaaa0004", 20), waited = act("act-aaaa0005", 20), unread = act("act-aaaa0006", 20, { "audit.md": "# Audit\n\nfindings\n" });
  mkdirSync(join(drafts, "not-a-run"), { recursive: true }); old(join(drafts, "not-a-run"), 40);
  const handed = act("act-aaaa0007", 5), quiet4 = act("act-aaaa0008", 4);
  const deps = { running: (p) => p === running, questions: (p) => (p === asking ? 1 : 0), waiting: (p) => p === waited, unread: (p) => p === unread, handing: (p) => p === handed, live: () => false };
  let said = "";
  const r = await S.sweepState({ now, dir: CFG, deps, log: (s) => { said += s; } });
  ok("the finished ones quiet for 3 days or more go (they were kept 14: 3.5 GB by 20 Oct 2026)", !existsSync(gone) && !existsSync(quiet4) && r.acts === 2, r);
  ok("one whose handover hasn't reported back yet stays", existsSync(handed));
  ok("a recent one stays", existsSync(fresh));
  ok("one still running stays", existsSync(running));
  ok("one with an open question stays", existsSync(asking));
  ok("one waiting on a reply stays", existsSync(waited));
  ok("one with an unread report stays", existsSync(unread));
  ok("other folders in drafts/ aren't touched", existsSync(join(drafts, "not-a-run")));
  ok("it says what it removed", /Swept: 2 finished run folders/.test(said), said);

  console.log("SCREENS — the newest 30 maps per page, screenshots nobody refers to");
  const scr = join(CFG, "screens"); mkdirSync(scr, { recursive: true });
  const id = (i) => i.toString(16).padStart(12, "0");
  const maps = Array.from({ length: 230 }, (_, i) => ({ id: id(i), name: "Feed", w: 1, h: 1, ts: now - i * 1000, via: "headless", page: { url: "https://x/feed", title: "Feed" }, regions: [] }));
  const other = { id: id(500), name: "Desk", w: 1, h: 1, ts: now - 90 * DAY, via: "gnome-screenshot", regions: [] };
  writeJsonAtomic(join(scr, "screens.json"), [...maps, other]);
  for (const i of [0, 229, 500, 700, 701]) writeFileSync(join(scr, id(i) + ".png"), "png");
  old(join(scr, id(229) + ".png"), 30); old(join(scr, id(500) + ".png"), 90); old(join(scr, id(700) + ".png"), 30);
  const s = S.sweepScreens({ now, dir: scr });
  const left = JSON.parse(readFileSync(join(scr, "screens.json"), "utf8"));
  ok("all but the newest 30 maps of the page go", s.entries === 200 && left.filter((x) => x.page).length === 30 && left.some((x) => x.id === id(0)) && !left.some((x) => x.id === id(229)), s);
  ok("your own screen capture stays, however old", left.some((x) => x.id === id(500)));
  ok("a dropped map's old PNG goes, and an orphan older than a week; a referred-to one and a fresh orphan stay", !existsSync(join(scr, id(229) + ".png")) && !existsSync(join(scr, id(700) + ".png")) && existsSync(join(scr, id(500) + ".png")) && existsSync(join(scr, id(0) + ".png")) && existsSync(join(scr, id(701) + ".png")) && s.pngs === 2, s);
  ok("screens.json is written whole, with a .bak", existsSync(join(scr, "screens.json.bak")) && !readdirSync(scr).some((n) => n.endsWith(".tmp")));

  console.log("LEFTOVERS — prompt files and tmp halves of a process that's gone, old corrupt copies, settled keys with no folder");
  writeFileSync(join(CFG, ".system-424242-1-abc.txt"), "prompt"); writeFileSync(join(CFG, `.system-${process.pid}-1-abc.txt`), "mine");
  writeFileSync(join(CFG, "tasks.json.424242-0123abcd.tmp"), "["); writeFileSync(join(CFG, `tasks.json.${process.pid}-0123abcd.tmp`), "[");
  writeFileSync(join(CFG, `tasks.json.corrupt-${now - 40 * DAY}`), "x"); writeFileSync(join(CFG, `tasks.json.corrupt-${now - 2 * DAY}`), "x");
  writeJsonAtomic(join(CFG, "settled.json"), { "*": ["k1"], [fresh]: "k1", [gone]: "k2", "/nowhere/at/all": "k3" });
  const r2 = await S.sweepState({ now, dir: CFG, deps, log: () => {} });
  const names = readdirSync(CFG);
  ok("a gone process's prompt file and tmp half go; this process's stay", !names.includes(".system-424242-1-abc.txt") && !names.includes("tasks.json.424242-0123abcd.tmp") && names.includes(`.system-${process.pid}-1-abc.txt`) && names.includes(`tasks.json.${process.pid}-0123abcd.tmp`) && r2.left === 2, [names, r2]);
  ok("a corrupt copy older than 30 days goes, a recent one stays", !names.includes(`tasks.json.corrupt-${now - 40 * DAY}`) && names.includes(`tasks.json.corrupt-${now - 2 * DAY}`) && r2.corrupt === 1, r2);
  const settled = JSON.parse(readFileSync(join(CFG, "settled.json"), "utf8"));
  ok("settled keys whose folder is gone go; the shared list and a live folder's stay", !(gone in settled) && !("/nowhere/at/all" in settled) && settled[fresh] === "k1" && settled["*"][0] === "k1" && r2.settled === 2, settled);
  ok("the second sweep found no run folder to remove", r2.acts === 0);
  if (process.platform !== "win32") {
    const { statSync } = await import("node:fs");
    ok("the config folder and screens/ are yours only after a sweep (0700)", (statSync(CFG).mode & 0o777) === 0o700 && (statSync(scr).mode & 0o777) === 0o700, [(statSync(CFG).mode & 0o777).toString(8), (statSync(scr).mode & 0o777).toString(8)]);
  }

  console.log("OLD COPIES, OLD TASKS, LOOSE FILES — .bak.bak, the archive, 0600");
  writeFileSync(join(CFG, "lanes.json.bak.bak"), "[]"); old(join(CFG, "lanes.json.bak.bak"), 40); writeFileSync(join(CFG, "tasks.json.bak.bak"), "[]");
  const D = 86400000, tl = [{ id: "a1", text: "old archived", archived: true, done: true, archivedAt: now - 45 * D }, { id: "a2", text: "new archived", archived: true, done: true, archivedAt: now - 2 * D }, { id: "o1", text: "open one", done: false, ts: now - 90 * D }];
  writeJsonAtomic(join(CFG, "tasks.json"), tl);
  writeFileSync(join(CFG, "continued.json"), "{}", { mode: 0o664 });
  const { chmodSync, statSync: st2 } = await import("node:fs"); chmodSync(join(CFG, "continued.json"), 0o664);
  const r3 = await S.sweepState({ now, dir: CFG, deps, log: () => {} });
  ok("a .bak.bak older than 30 days goes, a newer one stays", !existsSync(join(CFG, "lanes.json.bak.bak")) && existsSync(join(CFG, "tasks.json.bak.bak")), readdirSync(CFG));
  const tj = JSON.parse(readFileSync(join(CFG, "tasks.json"), "utf8")), ar = JSON.parse(readFileSync(join(CFG, "tasks-archive.json"), "utf8"));
  ok("a task archived over 30 days ago moves to tasks-archive.json; a recent one and an open one stay", r3.tasks === 1 && tj.map((t) => t.id).join() === "a2,o1" && ar.map((t) => t.id).join() === "a1", { tj, ar });
  ok("…and the Archive still lists it", S.archivedTasks(CFG).some((t) => t.id === "a1"));
  const T = await import("../tasks.mjs"), back = T.restoreTask("a1");
  ok("…and Restore brings it back into tasks.json", back && back.id === "a1" && !back.archived && JSON.parse(readFileSync(join(CFG, "tasks.json"), "utf8")).some((t) => t.id === "a1") && !S.archivedTasks(CFG).length, back);
  if (process.platform !== "win32") {
    // 24 Oct 2026: the sweep set ~/.config/symbiot/claude-fallback (0755) to 0600, and 25 agent runs failed "Permission denied"
    const w = join(CFG, "claude-fallback"); writeFileSync(w, "#!/bin/sh\necho ran\n"); chmodSync(w, 0o755);
    S.sweepModes({ dir: CFG });
    const { execFileSync } = await import("node:child_process"); let out = ""; try { out = execFileSync(w, { encoding: "utf8" }); } catch {}
    ok("a 0755 script in the swept folder comes out 0700, and still runs", (st2(w).mode & 0o777) === 0o700 && out.trim() === "ran", (st2(w).mode & 0o777).toString(8));
  }
  if (process.platform !== "win32") ok("a state file left 0664 is yours only after a sweep (0600)", (st2(join(CFG, "continued.json")).mode & 0o777) === 0o600 && r3.modes >= 1, (st2(join(CFG, "continued.json")).mode & 0o777).toString(8));
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} sweep: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
