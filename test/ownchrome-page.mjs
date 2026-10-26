// page.js of Symbiot's extension in the user's own Chrome (ownchrome.mjs pageJs), on a real page
// in a real (headless) browser, run as Chrome runs an extension's script: in a world of its own,
// apart from the page's. It maps the page, finds a region, clicks the way a mouse does (the page's
// own handlers hear it), types into a field and an editable box so the page's input handlers see
// it, and Enter submits a one-line form. Needs a Chromium-family browser (CI has Chrome);
// without one it says so and passes.
//
//   node test/ownchrome-page.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-ownpage-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };

const { chromeBinary } = await import("../core.mjs");
const h = await import("../headless.mjs");
const { pageJs } = await import("../ownchrome.mjs");
console.log("PAGE.JS — in its own world on a real page");
const html = `<!doctype html><title>Form</title><body style="margin:0;font:16px sans-serif;padding:20px">
<input id="name" aria-label="Name" style="width:300px"><button id="go" type="button">Go</button>
<div id="note" contenteditable="true" aria-label="Note" style="width:300px;height:40px;border:1px solid #888;margin-top:20px"></div>
<form id="f" style="margin-top:20px"><input id="q" aria-label="Search" name="q"></form>
<script>
  window.heard = { input: [], click: 0, down: 0, submit: 0, note: 0 };
  document.getElementById('name').addEventListener('input', (e) => heard.input.push(e.target.value));
  document.getElementById('go').addEventListener('mousedown', () => heard.down++);
  document.getElementById('go').addEventListener('click', () => heard.click++);
  document.getElementById('note').addEventListener('input', () => heard.note++);
  document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); heard.submit++; });
</script></body>`;
if (!chromeBinary()) console.log("  - no Chrome here: skipped");
else {
  const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(html); }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  try {
    await h.scratchPage(async (page) => {
      await page.send("Page.navigate", { url: `http://127.0.0.1:${srv.address().port}/` }); await page.until("Page.loadEventFired", 15000);
      const { frameTree } = await page.send("Page.getFrameTree");
      const { executionContextId } = await page.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: "symbiot" });
      const own = async (expr) => { const { result, exceptionDetails } = await page.send("Runtime.evaluate", { expression: expr, contextId: executionContextId, returnByValue: true, awaitPromise: true }); if (exceptionDetails) throw new Error(exceptionDetails.text + " " + ((exceptionDetails.exception || {}).description || "")); return result.value; };
      const main = async (expr) => (await page.send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.value;
      await own(pageJs());
      const call = (fn, ...args) => own(`self.__symbiot[${JSON.stringify(fn)}](...${JSON.stringify(args)})`);
      const info = await call("collect");
      const labels = info.items.map((r) => r.label);
      ok("collect maps the page from its own world", ["Name", "Go", "Note", "Search"].every((l) => labels.includes(l)) && info.title === "Form", labels);
      const go = info.items.find((r) => r.label === "Go"), name = info.items.find((r) => r.label === "Name"), note = info.items.find((r) => r.label === "Note"), q = info.items.find((r) => r.label === "Search");
      const at = await call("find", go.selector, "Go", { x: go.x + go.w / 2, y: go.y + go.h / 2 });
      ok("find: the region by its selector, clear of anything over it", at && at.by === "selector" && at.clear === true, at);
      await call("click", at.x, at.y);
      ok("click: the page's own mousedown and click handlers hear it", await main("heard.click") === 1 && await main("heard.down") === 1, await main("heard"));
      await call("click", name.x + 5, name.y + 5);
      const t = await call("type", "Pat Example", false);
      ok("type: the field holds it, and the page's input handler saw it", t.ok && t.held && await main("document.getElementById('name').value") === "Pat Example" && (await main("heard.input")).includes("Pat Example"), { t, heard: await main("heard") });
      await call("click", note.x + 5, note.y + 5);
      const n = await call("type", "A note", false);
      ok("type into an editable box: it holds it, and the page heard the input", n.ok && n.held && await main("document.getElementById('note').innerText.trim()") === "A note" && await main("heard.note") > 0, { n, heard: await main("heard") });
      await call("click", q.x + 5, q.y + 5);
      await call("type", "invoices", true);
      ok("Enter in a one-line form submits it", await main("heard.submit") === 1, await main("heard"));
      ok("nothing it set leaks into the page's world", await main("typeof self.__symbiot") === "undefined");
    });
  } catch (e) {
    if (/didn.t start/.test(String(e && e.message))) console.log("  - the browser can't start here: skipped");
    else { fail++; console.log("  ✗ threw: " + (e && e.stack || e)); }
  } finally { srv.close(); }
}
rmSync(HOME, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
