// Type into a one-time code split across one-character boxes (GitHub's device page: 8 boxes
// and a hidden "-" box between the halves) spreads the code over the boxes in order, the "-"
// box kept, instead of cutting it to one character. Needs Chrome; without one it says so and passes.
//
//   node test/code-boxes.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-codeboxes-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { chromeBinary } = await import("../core.mjs");
const h = await import("../headless.mjs");
console.log("CODE BOXES — Type spreads a one-time code over one-character boxes");
if (!chromeBinary()) console.log("  - no Chrome here: the rest skipped");
else {
  const boxes = (n, extra = "") => Array.from({ length: n }, (_, i) => `<input id="b${i}" maxlength="1" type="text" style="width:30px;position:absolute;left:${10 + i * 40}px;top:10px">${i === 3 ? extra : ""}`).join("");
  // the "-" box sits between the halves: hidden, one wide, holding the separator
  const html = `<form>${boxes(8, '<input id="dash" maxlength="3" type="text" value="" style="width:1px;position:absolute;left:170px;top:60px">')}<input id="other" type="text" style="position:absolute;left:10px;top:100px"></form>`;
  const p = spawn(chromeBinary(), ["--headless=new", "--no-sandbox", "--disable-gpu", "--user-data-dir=" + join(HOME, "profile"), "--remote-debugging-pipe", "about:blank"], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  let id = 1, buf = Buffer.alloc(0); const wait = new Map();
  p.stdio[4].on("data", (d) => { buf = Buffer.concat([buf, d]); for (let e; (e = buf.indexOf(0)) >= 0; buf = buf.subarray(e + 1)) { let m; try { m = JSON.parse(buf.subarray(0, e)); } catch { continue; } if (m.id && wait.has(m.id)) { wait.get(m.id)(m.result || {}); wait.delete(m.id); } } });
  const send = (method, params = {}, sessionId) => new Promise((res) => { const i = id++; wait.set(i, res); p.stdio[3].write(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0"); });
  try {
    await sleep(1500);
    const { targetId } = await send("Target.createTarget", { url: "data:text/html," + encodeURIComponent(html) });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const page = { send: (m, pr) => send(m, pr, sessionId) };
    await sleep(800);
    const read = async () => (await page.send("Runtime.evaluate", { returnByValue: true, expression: `[...document.querySelectorAll('input')].map((e) => e.id + '=' + e.value).join(' ')` })).result.value;
    await h.typeInto(page, { x: 25, y: 25 }, "ABCD-1234");
    const got = await read();
    ok("the code goes a character a box, in order", /b0=A b1=B b2=C b3=D dash=- b4=1 b5=2 b6=3 b7=4/.test(got), got);
    ok("…the separator box keeps its \"-\", and the field after the row is untouched", /dash=- /.test(got) && /other=$/.test(got), got);
    await page.send("Runtime.evaluate", { expression: `document.querySelectorAll('input').forEach((e) => e.value = '')` });
    await h.typeInto(page, { x: 25, y: 25 }, "ABCD1234");
    const bare = await read();
    ok("a code typed without the dash lands the same way", /b0=A b1=B b2=C b3=D dash=- b4=1 b5=2 b6=3 b7=4/.test(bare), bare);
    await page.send("Runtime.evaluate", { expression: `document.querySelectorAll('input').forEach((e) => e.value = '')` });
    await h.typeInto(page, { x: 25, y: 110 }, "hello world");
    const plain = await read();
    ok("an ordinary field still gets its whole text", /other=hello world/.test(plain) && /b0= /.test(plain), plain);
  } finally { try { await send("Browser.close"); } catch {} await new Promise((r) => (p.exitCode !== null ? r() : p.on("exit", r))); }
}
rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log((fail ? "✗" : "✓") + " code-boxes: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
