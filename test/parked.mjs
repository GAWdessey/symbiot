// Parked jobs on Home (jobs.mjs parkedJobs, home.mjs workScene, ui.mjs): a job waiting on a lane,
// a third party or a time isn't running and isn't a card for the user, so it used to be invisible.
// 22 Oct 2026: 100 Dailify texts staged and held for a yes; Home said only "symbiot working on it".
// Isolated HOME.
//
//   node test/parked.mjs
//
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-parked-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const { parkedJobs } = await import("../jobs.mjs");
const { homeContext } = await import("../home.mjs");

const now = Date.now(), J = (o) => ({ key: "run:" + Math.random().toString(36).slice(2, 8), kind: "agent", lane: "", text: "", state: "waiting", waitingOn: "", at: now - 5e3, changed: now - 5e3, history: [], what: "", ...o });
const jobs = [
  J({ lane: "dailify", text: "Agent: Dailify 100 broker texts", waitingOn: "third party", what: "staged, nothing sent, waiting on Jono's yes" }),
  J({ lane: "dailify", text: "Agent: older run, same lane", waitingOn: "third party", what: "old", changed: now - 9e6 }),
  J({ lane: "sts", text: "sts", waitingOn: "lane", what: "ops: install the build" }),
  J({ lane: "winlove", text: "WinLove", waitingOn: "time", what: "Simli finishing the face" }),
  J({ lane: "mine", text: "needs the user", waitingOn: "user", what: "Approve" }),
  J({ lane: "busy", text: "also running", waitingOn: "lane", what: "x" }), J({ lane: "busy", text: "busy", state: "running" }),
  J({ lane: "gone", text: "finished", state: "done" }),
  J({ key: "you:ask:x", kind: "card", lane: "c", text: "a card", waitingOn: "lane" }),
];
console.log("PARKED — which jobs");
const p = parkedJobs({ now, jobs });
ok("a job on a third party, a lane or a time, one per lane", p.map((x) => x.lane).sort().join() === "dailify,sts,winlove", p);
ok("…the newest of a lane's, in plain words with who and what it waits on", p.find((x) => x.lane === "dailify").text === "Dailify 100 broker texts" && p.find((x) => x.lane === "dailify").why.includes("Jono's yes") && p.find((x) => x.lane === "dailify").who === "someone outside", p);
ok("…a lane's wait names the lane; a time says a set time", p.find((x) => x.lane === "sts").who === "ops" && p.find((x) => x.lane === "winlove").who === "a set time", p);
ok("not the user's waits, a lane that is running, an ended job or a card", !p.some((x) => ["mine", "busy", "gone", "c"].includes(x.lane)));

console.log("PARKED — Home and the chat");
const ctx = homeContext({ you: [], youCount: 0, feeds: [], working: 0, runs: [], finished: [], digest: [], ledger: [], handed: [], lanes: [], next: [], at: now });
ok("the chat is told plainly when no card waits for the user", /no card is waiting for them, so never say one is/.test(ctx), ctx.slice(0, 200));
const ui = readFileSync(new URL("../ui.mjs", import.meta.url), "utf8");
ok("Home draws them (a drop each, a count in its line)", /kind:'park'/.test(ui) && /parked on others/.test(ui) && /w\.parked\|\|\[\]/.test(ui));
console.log(`\n${fail ? "✗" : "✓"} parked: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
