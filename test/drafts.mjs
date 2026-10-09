// What you type into a Home card's "answer in your own words" box is never lost
// (ui.mjs keepTyping, bdSet): on 2026-10-09 every refresh of Home (a new card, a
// count, an agent's step) rebuilt the cards and wiped a half-typed answer. In a
// real (headless) browser on an isolated HOME: type, let Home refresh with a change,
// and the text, the focus and the cursor are still there; reload, and the draft is
// back; send it, and it's gone. Skipped where there's no Chrome.
//
//   node test/drafts.mjs
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
const done = () => { console.log(`\n${fail ? "✗" : "✓"} drafts: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
if (!chromeBinary()) { console.log("  - no Chrome here: skipped"); done(); }

const HOME = realpathSync(mkdtempSync(join(tmpdir(), "symbiot-drafts-"))), CFG = join(HOME, ".config", "symbiot"), now = Date.now();
mkdirSync(CFG, { recursive: true });
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
writeFileSync(join(CFG, "config.json"), JSON.stringify({ lastSeenVersion: VERSION, agentCmd: 'claude -p "{prompt}"' }));
// two agents that ask you something: their questions are blobs on Home
const asker = (id, name, q, live) => {
  const p = join(CFG, "drafts", id); mkdirSync(join(p, ".symbiot"), { recursive: true });
  writeFileSync(join(p, ".symbiot", "TASKS.md"), "- [ ] " + name + "\n");
  if (q) writeFileSync(join(p, ".symbiot", "QUESTIONS.md"), `## Questions\n### ${q}\nThe preview is in drafts.\n- 🤖 Agent: approve it as it is (recommended)\n- 🤖 Agent: redo it with a live screenshot\n`);
  writeFileSync(join(p, ".symbiot", "agent.log"), "\n=== x " + new Date(now - 600000).toISOString() + " ===\n$ claude -p\n" + JSON.stringify({ type: "result", subtype: "success", result: "Asked about it." }) + "\n");
  if (live) writeFileSync(join(p, ".symbiot", "agent.pid"), JSON.stringify({ pid: process.pid, id: "j-" + id, startedAt: now - 300000 })); // an agent at work: the band under the cards
  return { path: p, name, startedAt: now - 600000 };
};
const RUNS = [asker("act-post1", "Agent: Marketing: Post 1, Symbiot: a first look", "Post 1, Symbiot: a first look: approve its preview?"), asker("act-audit", "Agent: Re-audit ~/Company", "Fix the 39 small problems now?"), asker("act-live", "Agent: Go through the Ghost AI mailbox, spam included", "", true)];
writeFileSync(join(CFG, "runs.json"), JSON.stringify(RUNS));

const app = spawn(process.execPath, [join(ROOT, "index.mjs"), "app"], { env: { ...sandboxEnv(HOME, process.env, 21000 + (process.pid % 3000)), SYMBIOT_NO_OPEN: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let chrome = null;
const finish = async () => { try { if (chrome) chrome.kill("SIGKILL"); } catch {} try { app.kill("SIGTERM"); } catch {} await sleep(300); try { rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} done(); }; // chrome's helpers can still be writing its profile
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
  await s("Emulation.setDeviceMetricsOverride", { width: 1590, height: 900, deviceScaleFactor: 1, mobile: false });
  await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await s("Page.navigate", { url });
  const BLOB = "[...document.querySelectorAll('#lqdrops .lqblob')].find(function(b){return /Post 1/.test(b.textContent)})";
  const find = `(function(){if(${BLOB})return true;if(LQ.need&&LQ.need.pages>1)lqNeedPage();return false;})()`; // page through the band to it: setup cards (no Claude Code on CI) come first
  console.log("DRAFTS — typing survives Home refreshing under it");
  ok("Home shows the question as a blob", await until(find), await js("JSON.stringify((LQ.home&&LQ.home.you||[]).map(function(y){return y.q}))"));
  await js(`(function(){var b=${BLOB};b.querySelector('.bfree').click();})()`);
  await js(`(function(){var i=(${BLOB}).querySelector('.bfx input');i.focus();})()`);
  await s("Input.insertText", { text: "redo it, but keep the first line and" });
  await js(`(function(){var i=(${BLOB}).querySelector('.bfx input');i.setSelectionRange(9,9);i.dispatchEvent(new Event('select'));})()`); // the cursor back mid-text, as a click would put it
  const node = await js(`(function(){window.__typed=(${BLOB}).querySelector('.bfx input');return !!window.__typed;})()`);
  // a refresh that changes what Home shows: another agent asks something, and Home's own poll redraws the cards
  writeFileSync(join(CFG, "runs.json"), JSON.stringify([asker("act-mail", "Agent: Go through the Ghost AI mailbox", "Reply to Cale about the quote?"), ...RUNS]));
  await js("LQ.fresh=true;lqLoad(false)");
  const redrew = await until("(LQ.home.you||[]).some(function(y){return /Cale/.test(y.q||'')})&&LQ.need&&LQ.need.count===LQ.home.you.length", 15000) || await js("JSON.stringify({you:(LQ.home.you||[]).map(function(y){return y.q}),need:LQ.need&&LQ.need.count})"); // the new card is in the band (on its next page: the one you're typing in stays in view)
  const after = JSON.parse(await js(`JSON.stringify((function(){var b=${BLOB},i=b&&b.querySelector('.bfx input');return {value:i&&i.value,focused:document.activeElement===i,same:i===window.__typed,start:i&&i.selectionStart,cards:document.querySelectorAll('#lqdrops .lqblob').length};})())`) || "{}");
  ok("the redraw really happened (the new card is up)", node && redrew === true, redrew);
  ok("what you typed is still there", after.value === "redo it, but keep the first line and", after);
  ok("the box still has the focus, as the same box", after.focused && after.same, after);
  ok("the cursor is where it was", after.start === 9, after);
  // the card with its box open is taller than the band's guess: the agents under it move down, not under it (2026-10-09)
  await sleep(400);
  const overlaps = await js("JSON.stringify((function(){var R=function(e){return e.getBoundingClientRect();},out=[],bands=[...document.querySelectorAll('#lqdrops .lq-band')];[...document.querySelectorAll('#lqdrops .lqblob')].forEach(function(b){var a=R(b);bands.forEach(function(n){var c=R(n);if(a.left<c.right&&a.right>c.left&&a.top<c.bottom&&a.bottom>c.top)out.push(b.textContent.slice(0,30)+' / '+n.textContent.slice(0,30));});});return {bands:bands.length,out:out};})())");
  ok("an agent at work is in the band under the cards, and no card sits on it", JSON.parse(overlaps).bands >= 1 && !JSON.parse(overlaps).out.length, overlaps);
  await s("Input.insertText", { text: "X" });
  ok("and typing carries on at the cursor", (await js(`(${BLOB}).querySelector('.bfx input').value`)) === "redo it, Xbut keep the first line and", await js(`(${BLOB}).querySelector('.bfx input').value`));

  console.log("DRAFTS — a reload brings it back; sending clears it");
  await s("Page.reload"); await sleep(500);
  ok("after a reload, the card comes back", await until(find));
  const back = JSON.parse(await js(`JSON.stringify((function(){var b=${BLOB},f=b.querySelector('.bfx'),i=f.querySelector('input');return {value:i.value,open:!f.classList.contains('hidden')};})())`));
  ok("with your draft in its box, the box open", back.value === "redo it, Xbut keep the first line and" && back.open, back);
  await js(`(function(){var f=(${BLOB}).querySelector('.bfx');f.dispatchEvent(new Event('submit',{cancelable:true}));})()`);
  ok("sent: it lands in that agent's ANSWERS.md", await until("true", 100) && await (async () => { for (let k = 0; k < 40; k++) { try { if (/Xbut keep the first line/.test(readFileSync(join(CFG, "drafts", "act-post1", ".symbiot", "ANSWERS.md"), "utf8"))) return true; } catch {} await sleep(250); } return false; })());
  ok("and its draft is gone", await until("!Object.keys(JSON.parse(localStorage.getItem('symbiot-blobdrafts')||'{}')).some(function(k){return /Post 1/.test(k)})", 5000), await js("localStorage.getItem('symbiot-blobdrafts')"));

  console.log("DRAFTS — a draft whose question went is said, not dropped");
  await js("localStorage.setItem('symbiot-blobdrafts',JSON.stringify({'/gone|Old question?':{text:'my half answer',at:Date.now(),name:'Old agent',q:'Old question?'}}))");
  await js("lqLoad(false)");
  ok("Home's talk says it wasn't sent, with what you wrote", await until("(LQ.talk||[]).some(function(t){return /wasn.t sent/.test(t.text)&&/my half answer/.test(t.text)})", 8000), await js("JSON.stringify(LQ.talk)"));
  ok("no errors on the page", !errors.length, errors);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
await finish();
