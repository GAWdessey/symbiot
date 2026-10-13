// Symbiot at phone size (390x844, touch): every page opens with no errors and nothing
// wider than the screen, Home's chat box and mic are on screen and take typing, and
// the tabs scroll sideways instead of running off it. In a real (headless) browser on
// an isolated HOME, never the running app. Skipped where there's no Chrome.
//
//   node test/mobile.mjs
//
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromeBinary } from "../core.mjs";
import { sandboxEnv } from "../sandbox.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = () => { console.log(`\n${fail ? "✗" : "✓"} mobile: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
if (!chromeBinary()) { console.log("  - no Chrome here: skipped"); done(); }

const HOME = realpathSync(mkdtempSync(join(tmpdir(), "symbiot-mobile-"))), CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
writeFileSync(join(CFG, "config.json"), JSON.stringify({ lastSeenVersion: VERSION, agentCmd: 'claude -p "{prompt}"' }));

const app = spawn(process.execPath, [join(ROOT, "index.mjs"), "app"], { env: { ...sandboxEnv(HOME, process.env, 21000 + (process.pid % 3000)), SYMBIOT_NO_OPEN: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let chrome = null;
const finish = async () => { try { if (chrome) chrome.kill("SIGKILL"); } catch {} try { app.kill("SIGTERM"); } catch {} await sleep(300); try { rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} done(); };
try {
  let o = "";
  const url = await new Promise((res, rej) => { app.stdout.on("data", (d) => { o += d; const m = o.match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[\w-]+/); if (m) res(m[0]); }); setTimeout(() => rej(new Error("the app gave no address: " + o)), 20000); });
  chrome = spawn(chromeBinary(), ["--headless=new", "--remote-debugging-pipe", "--user-data-dir=" + join(HOME, "chrome"), "--no-first-run", "--no-sandbox", "about:blank"], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  let next = 1, buf = Buffer.alloc(0); const wait = new Map(), errors = [];
  chrome.stdio[4].on("data", (c) => { buf = Buffer.concat([buf, c]); for (let e; (e = buf.indexOf(0)) >= 0; buf = buf.subarray(e + 1)) { const m = JSON.parse(buf.subarray(0, e).toString()); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } else if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text); } });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const id = next++; wait.set(id, r); chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0"); });
  const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
  const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  const js = async (e) => { const r = await s("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); return r.result && r.result.exceptionDetails ? "EXC: " + JSON.stringify(r.result.exceptionDetails).slice(0, 300) : r.result && r.result.result ? r.result.result.value : null; };
  const until = async (e, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await js(e)) === true) return true; await sleep(250); } return false; };
  await s("Page.enable"); await s("Runtime.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await s("Emulation.setTouchEmulationEnabled", { enabled: true });
  await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await s("Page.navigate", { url });
  const over = () => js("document.documentElement.scrollWidth - window.innerWidth");

  console.log("MOBILE — Home");
  ok("Home loads", await until("typeof LQ!=='undefined'&&!!LQ.home"), await js("typeof LQ"));
  ok("the page isn't wider than the phone", (await over()) <= 1, await over());
  const box = JSON.parse(await js("JSON.stringify((function(){var R=function(e){if(!e)return null;var r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height}};return {ask:R(document.getElementById('lqask')),mic:R(document.getElementById('lqmic')),w:innerWidth,h:innerHeight}})())"));
  ok("the chat box is on screen", box.ask && box.ask.l >= 0 && box.ask.r <= box.w && box.ask.b <= box.h && box.ask.w > 120, box);
  ok("the mic is on screen and big enough to touch", box.mic && box.mic.r <= box.w && box.mic.b <= box.h && box.mic.w >= 36 && box.mic.h >= 36, box);
  await js("document.getElementById('lqask').focus()");
  await s("Input.insertText", { text: "hello from a phone" });
  ok("typing in the chat box lands", (await js("document.getElementById('lqask').value")) === "hello from a phone");

  console.log("MOBILE — every page");
  for (const tab of ["map", "board", "drift", "week", "standup", "todo", "tasks", "reports", "marketing", "settings"]) {
    errors.length = 0;
    const had = await js(`(function(){var t=document.querySelector('.tab[data-tab="${tab}"]');if(!t)return false;t.click();return true})()`);
    await sleep(700);
    const st = JSON.parse((await js(`JSON.stringify({over:document.documentElement.scrollWidth-innerWidth,shown:typeof current==='undefined'?null:current,text:(document.querySelector('main')||document.body).innerText.length})`)) || "{}");
    ok(tab + ": its tab is there and opens", had === true && st.shown === tab, st);
    ok(tab + ": not wider than the phone", st.over <= 1, st);
    ok(tab + ": says something", st.text > 20, st);
    ok(tab + ": no errors", !errors.length, errors);
  }
  const tabs = JSON.parse(await js("JSON.stringify((function(){var t=document.querySelector('.tabs'),r=t.getBoundingClientRect();return {w:r.width,scroll:t.scrollWidth,ox:getComputedStyle(t).overflowX,h:r.height}})())"));
  ok("the tabs scroll sideways inside the screen", tabs.w <= 390 && tabs.ox !== "visible" && tabs.h < 80, tabs);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
await finish();
