// The tether: one shared log per lane that every session reads first and writes to, so
// no session needs the user to carry a message to another (29 Oct 2026: the phone's
// session for a trading bot left a REQUEST.md on its server and told the user to relay it to the PC).
//
//   node test/tether.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const HOME = mkdtempSync(join(tmpdir(), "symbiot-tether-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const T = await import("../tether.mjs");
const { buildTasksMd } = await import("../tasks.mjs");
const { actBrief } = await import("../mind.mjs");
const LANE = "bot-desk", NOW = Date.parse("2026-10-29T10:00:00Z");
try {
  console.log("THE STORE");
  const a = T.addEntry(LANE, { kind: "ask", from: "symbiot", asked: "Score the model on paper", session: "chat", device: "phone" }, { now: NOW });
  ok("an ask is logged as an open request, with who wrote it", a.entry && a.entry.status === "open" && a.entry.who.device === "phone" && /^t-/.test(a.entry.id), a);
  ok("the same entry again is logged once", T.addEntry(LANE, { kind: "ask", from: "symbiot", asked: "Score the model on paper", session: "chat", device: "phone" }, { now: NOW }).had && T.loadLog(LANE).entries.length === 1);
  ok("an entry that says nothing is refused", !!T.addEntry(LANE, { kind: "note" }).error);
  ok("a note needs nothing, so it's never open", T.addEntry(LANE, { kind: "note", done: "pulled the 1s tape" }, { now: NOW + 1 }).entry.status === "");
  ok("open requests list it", T.openOf(LANE).map((e) => e.id).includes(a.entry.id));
  const c = T.closeEntry(LANE, a.entry.id, { by: "the lane's run", note: "scored: 61% on the top 2%", now: NOW + 2 });
  ok("closing it says by whom and what was done", c.entry.status === "closed" && c.entry.closed.note.includes("61%") && !T.openOf(LANE).length, c);
  ok("the log reads in plain lines, newest last", /2 entries, 0 open/.test(T.logText(LANE)) && /closed by the lane's run: scored/.test(T.logText(LANE)), T.logText(LANE));
  ok("lanes with a log are listed", T.lanesLogged().includes(LANE));

  console.log("EVERY BRIEF CARRIES THE LOG");
  const open = T.addEntry(LANE, { kind: "request", asked: "Copy the model onto the VM", session: "phone session", device: "phone", source: "data/model/REQUEST.md" }, { now: NOW + 3 }).entry;
  const b = T.tetherBrief(LANE).join("\n");
  ok("the brief lists the lane's open requests with their ids", b.includes(open.id) && /Open requests for this lane/.test(b) && /data\/model\/REQUEST\.md/.test(b), b);
  ok("...and what other sessions did lately", /scored: 61%/.test(b) || /pulled the 1s tape/.test(b));
  ok("...tells the agent how to write to it and close what it did", /\.symbiot\/TETHER\.json/.test(b) && /"closes"/.test(b));
  ok("...and never to have the user pass a request between sessions", /Never tell the user to pass a request on to another session/.test(b));
  ok("...and says a lane's rules can turn a request down", /where its rules say no/.test(b));
  const md = buildTasksMd(LANE, { lanes: [LANE, "symbiot"] }, [{ text: "Score the model" }]);
  const at = md.indexOf("## The lane's shared log");
  ok("a repo lane's TASKS.md has the log, after its tasks (a run beside it keeps it)", at > md.indexOf("## Tasks") && at < md.indexOf("## When you finish an item") && md.includes(open.id));
  ok("an ops run's brief has the log of the lane it's for", actBrief("Check the VM's tape", { lane: LANE, lanes: [LANE], reach: null }).includes(open.id));
  ok("...and ops's own log otherwise", /`ops` shares one log/.test(actBrief("Check DNS", { lanes: [], reach: null })));

  console.log("TAKING IT IN");
  const repo = join(HOME, "projects", LANE), wt = join(HOME, ".config", "symbiot", "worktrees", `${LANE}-fda5bf`), act = join(HOME, ".config", "symbiot", "drafts", "act-1a2b3c4d");
  for (const d of [repo, wt, act]) mkdirSync(join(d, ".symbiot"), { recursive: true });
  writeFileSync(join(wt, ".symbiot", "TETHER.json"), JSON.stringify([{ kind: "finish", done: "Packaged the model in data/model/package", open: "the VM copy: turned down, the VM is pulled from only", closes: [open.id] }]));
  writeFileSync(join(act, ".symbiot", "TETHER.json"), JSON.stringify({ kind: "ask", to: LANE, asked: "Say which pairs the model scores" }));
  mkdirSync(join(repo, "data", "model"), { recursive: true });
  writeFileSync(join(repo, "data", "model", "REQUEST.md"), "# Request from the phone session (2026-10-29) -- drop the model here\n\nPlease copy into the server's research folder the model files.\n");
  mkdirSync(join(repo, "node_modules", "x"), { recursive: true }); writeFileSync(join(repo, "node_modules", "x", "REQUEST.md"), "# not a request\n");
  const added = [], pushed = [];
  const deps = {
    folders: [{ path: repo, lane: LANE }, { path: wt, lane: LANE }, { path: act, lane: "ops" }], lanes: { [LANE]: repo },
    handoffs: [{ id: "h1", from: { lane: "symbiot", path: "/x" }, to: { lane: LANE, path: repo }, text: "Run the paper scorer nightly", at: NOW, status: "started" }],
    runs: [{ path: repo, lane: LANE, name: "bot-desk", endedAt: NOW + 60000, final: "Installed the nightly timer; the first run exited cleanly." }],
    add: (text, lane) => { added.push({ text, lane }); return { id: "task" + added.length }; }, push: (lane) => pushed.push(lane), now: NOW + 120000, device: "odessey-pc", requests: true,
  };
  const r1 = T.tetherTick(deps), log1 = T.loadLog(LANE).entries;
  ok("a run beside the lane closes the request it finished, saying what it did", T.loadLog(LANE).entries.find((e) => e.id === open.id).status === "closed" && /VM copy: turned down/.test(T.loadLog(LANE).entries.find((e) => e.id === open.id).closed.note), r1);
  const fin = log1.find((e) => e.kind === "finish" && /Packaged/.test(e.done));
  ok("...and its entry names the run and the device", fin && fin.who.run === `${LANE}-fda5bf` && fin.who.device === "odessey-pc", fin);
  ok("an ops run's ask to the lane lands in the lane's log, open, from ops", log1.some((e) => e.kind === "ask" && e.from === "ops" && e.status === "open" && /which pairs/.test(e.asked)));
  ok("a handover is an open request in the lane that has it", log1.some((e) => e.key === "handoff:h1" && e.status === "open" && e.from === "symbiot"));
  ok("...and a note in the lane that asked, not a request of its own", T.loadLog("symbiot").entries.some((e) => e.key === "handoff:h1" && e.status === "" && /waiting on bot-desk/.test(e.open)));
  ok("a run's end is logged in its own last words", log1.some((e) => e.kind === "finish" && /nightly timer/.test(e.done)));
  const req = log1.find((e) => e.kind === "request" && e.source === join("data", "model", "REQUEST.md") && e.id !== open.id); // the file's own, not the one logged by hand above
  ok("a REQUEST.md another session left is an open request, from the phone", req && req.status === "open" && req.who.device === "phone" && /phone session/.test(req.who.session), req);
  ok("...and a task for the lane, naming the file and the entry to close", added.length === 1 && added[0].lane === LANE && added[0].text.includes(req.id) && added[0].text.includes("data/model/REQUEST.md") && pushed.includes(LANE), added);
  ok("...which says to turn down what the lane's rules forbid", /Where the lane's rules say no/.test(added[0].text));
  ok("a REQUEST.md under node_modules is no request", !log1.some((e) => /not a request/.test(e.asked)));
  const n1 = log1.length, r2 = T.tetherTick(deps);
  ok("the next pass adds nothing it already has, and no second task", r2.added === 0 && T.loadLog(LANE).entries.length === n1 && added.length === 1, r2);
  writeFileSync(join(repo, "data", "model", "REQUEST.md"), "# Request from the phone session (2026-10-30) -- score last night\n\nScore 29 Oct.\n");
  T.tetherTick(deps);
  ok("a request file that changed is a new request", added.length === 2 && T.openOf(LANE).some((e) => /score last night/.test(e.asked)));
  deps.handoffs[0] = { ...deps.handoffs[0], reportedAt: NOW + 200000, result: "done: the timer runs at 01:20 UTC", status: "done" };
  T.tetherTick({ ...deps, now: NOW + 300000 });
  ok("a handover whose result came back is closed with it", T.loadLog(LANE).entries.find((e) => e.key === "handoff:h1").status === "closed" && /01:20 UTC/.test(T.loadLog(LANE).entries.find((e) => e.key === "handoff:h1").closed.note));
  ok("...and the lane that asked hears what came back", T.loadLog("symbiot").entries.some((e) => e.key === "handoff:h1:back" && /01:20 UTC/.test(e.done)));
  const old = { ...deps, handoffs: [{ id: "h-old", from: { lane: "symbiot" }, to: { lane: LANE }, text: "Old job", at: NOW - 10 * 86400000, status: "started" }], runs: [], folders: [], lanes: {} };
  T.tetherTick({ ...old, now: NOW + 300000 });
  ok("handovers older than two days aren't backfilled", !T.loadLog(LANE).entries.some((e) => e.key === "handoff:h-old"));
  ok("request files are looked for every 5 minutes, not every pass", (() => { const n = added.length; writeFileSync(join(repo, "data", "REQUEST.md"), "# Request from the VM session\n\nPull it.\n"); T.tetherTick({ ...deps, requests: undefined, now: NOW + 700000 }); const a1 = added.length; T.tetherTick({ ...deps, requests: undefined, now: NOW + 760000 }); const a2 = added.length; rmSync(join(repo, "data", "REQUEST.md")); return a1 === n + 1 && a2 === a1; })(), added.length);
  ok("a TETHER.json that doesn't parse is skipped, not a crash", (() => { writeFileSync(join(act, ".symbiot", "TETHER.json"), "{ half"); try { T.tetherTick(deps); return true; } catch { return false; } })());

  console.log("CHAT READS IT");
  const lines = T.tetherLines({ now: NOW + 300000 }).join("\n");
  ok("chat's context has every lane's open requests and newest entries", /Each lane's shared log/.test(lines) && /\[bot-desk\]/.test(lines) && /score last night/.test(lines) && /never tell the user to carry a message between sessions/.test(lines), lines);
  ok("the phone's title gives its session", T.requestWho("# Request from the phone session (2026-10-29) -- drop the model here").session === "phone session");

  console.log("SAFE");
  ok("the log file is the user's only", (() => { const f = join(T.TETHER_DIR, `${LANE}.json`); return existsSync(f) && (process.platform === "win32" || (statSync(f).mode & 0o077) === 0); })());
  ok("a lane name can't climb out of the log's folder", !T.addEntry("../../etc", { kind: "note", done: "x" }).error && !existsSync(join(HOME, ".config", "etc.json")) && JSON.parse(readFileSync(join(T.TETHER_DIR, "etc.json"), "utf8")).entries.length === 1);
  for (let i = 0; i < 230; i++) T.addEntry("busy", { kind: "note", done: `step ${i}` }, { now: NOW + i });
  T.addEntry("busy", { kind: "ask", asked: "the oldest open one" }, { now: NOW - 1 });
  for (let i = 0; i < 5; i++) T.addEntry("busy", { kind: "note", done: `later ${i}` }, { now: NOW + 1000 + i });
  ok("a long log keeps its newest 200, and never drops an open request", T.loadLog("busy").entries.length === 200 && T.openOf("busy").length === 1);
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
