// `symbiot screens type/press/…` while the app is up but doesn't answer (index.mjs viaAppKept). On
// 21 Oct 2026 the app didn't answer a lane for five minutes, and each command opened a browser of its
// own: the LinkedIn post editor was opened again from its address at every step, losing the post's
// text, then its new date. Now a command that changes a page waits for the app, goes through it once
// it answers, and says it couldn't reach it, with nothing done, rather than use a browser of its own.
// Isolated HOME; the app is a stand-in on the screens socket.
//
//   node test/screenskept.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-kept-"));
const CFG = join(HOME, ".config", "symbiot"), SHOTS = join(CFG, "screens"), SOCK = join(SHOTS, "app.sock"); mkdirSync(SHOTS, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({ agentCmd: "" }));
writeFileSync(join(SHOTS, "screens.json"), JSON.stringify([{ id: "a1b2c3d4e5f6", name: "Feed | LinkedIn", w: 1280, h: 800, ts: Date.now(), via: "headless", page: { url: "https://www.linkedin.com/feed/", title: "Feed | LinkedIn" },
  regions: [{ id: "f1e2d3c4b5a6", label: "Text editor for creating content", kind: "field", x: 100, y: 100, w: 600, h: 200 }, { id: "0a0b0c0d0e0f", label: "Schedule", kind: "button", x: 700, y: 400, w: 80, h: 30 }] }]));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };
const env = { ...process.env, HOME, USERPROFILE: HOME, SYMBIOT_NO_UPDATE: "1", SYMBIOT_PORT: "1", SYMBIOT_APP_WAIT_MS: "6000" };
const cli = (...args) => new Promise((done) => { const t0 = Date.now(); execFile(process.execPath, [fileURLToPath(new URL("../index.mjs", import.meta.url)), "screens", ...args], { env, timeout: 60000 }, (e, out) => { let j = null; try { j = JSON.parse(String(out).slice(String(out).indexOf("{"))); } catch {} done({ j, out: String(out), ms: Date.now() - t0 }); }); });
// the app, on its socket: what each command asked it
const asked = [];
const app = () => new Promise((up) => { const s = createServer((req, res) => { let b = ""; req.on("data", (d) => { b += d; }); req.on("end", () => { asked.push([req.url, JSON.parse(b || "{}")]); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: "b2c3d4e5f6a1", typed: "Text editor for creating content", kept: true, page: { url: "https://www.linkedin.com/feed/" }, regions: [] })); }); }); s.listen(SOCK, () => up(s)); });

try {
  console.log("THE APP IS UP BUT DOESN'T ANSWER — nothing is typed in a browser of its own");
  writeFileSync(SOCK, ""); // the app's socket is there, and nothing answers on it
  const dead = await cli("type", "a1b2c3d4e5f6", "f1e2d3c4b5a6", "What R650 buys", "--yes");
  ok("type: it says it couldn't reach the app, and that nothing was typed", /didn't answer this command/.test((dead.j && dead.j.error) || "") && /nothing was typed/.test(dead.j.error), dead.out.slice(0, 400));
  ok("…after waiting for it (an update or a restart), not at once", dead.ms >= 5000, dead.ms);
  ok("…and not the browser-of-its-own answer (which opens the page again and loses what's open on it)", !/each command has a browser of its own|opened again from its address/.test(dead.out) && !/The browser didn't start/.test(dead.out), dead.out.slice(0, 300));
  const press = await cli("press", "a1b2c3d4e5f6", "Schedule", "--yes");
  ok("press: the same", /didn't answer this command/.test((press.j && press.j.error) || ""), press.out.slice(0, 300));

  console.log("THE APP ANSWERS AGAIN WHILE A COMMAND WAITS — it goes through the app");
  rmSync(SOCK, { force: true }); writeFileSync(SOCK, "");
  const later = cli("type", "a1b2c3d4e5f6", "f1e2d3c4b5a6", "What R650 buys", "--yes");
  await new Promise((r) => setTimeout(r, 2500)); rmSync(SOCK, { force: true }); const s = await app();
  const back = await later;
  ok("it waited for the app, and the app typed it, in the tab it keeps", back.j && back.j.typed === "Text editor for creating content" && asked.length === 1 && asked[0][0] === "/api/screens/type" && asked[0][1].text === "What R650 buys", [back.out.slice(0, 300), asked]);
  await new Promise((r) => s.close(r));

  console.log("NO APP AT ALL — a browser of its own, as before");
  rmSync(SOCK, { force: true });
  const none = await cli("type", "a1b2c3d4e5f6", "f1e2d3c4b5a6", "What R650 buys", "--yes");
  ok("without the app it doesn't wait for one", !/didn't answer this command/.test(none.out) && none.ms < 30000 && !existsSync(SOCK), [none.out.slice(0, 300), none.ms]);
} catch (e) { fail++; console.log("  ✗ ran  got: " + JSON.stringify(String((e && e.stack) || e))); }
rmSync(HOME, { recursive: true, force: true });
console.log(`\n${fail ? "✗" : "✓"} screenskept: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
