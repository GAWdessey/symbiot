// A list that scrolls inside a pop-up, on a real page in a real (headless) browser, as in
// LinkedIn's scheduled posts: the page behind is tall too, the pop-up is smaller than half
// the window, and scroll and the whole-page map used to move the page (or nothing) and stop
// at the first few slots. Now the pop-up's own list is what scrolls and what's mapped.
// Needs a Chromium-family browser (CI has Chrome); without one it says so and passes.
//
//   node test/popup-scroll.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-popup-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };

const { chromeBinary } = await import("../core.mjs");
const h = await import("../headless.mjs");
console.log("POP-UP LISTS — a long list inside a pop-up scrolls, not the page behind it");
const slots = Array.from({ length: 30 }, (_, i) => `<li style="height:40px"><button type="button">Slot ${i + 1}</button></li>`).join("");
const page = `<!doctype html><title>Scheduled</title><body style="margin:0;font:16px sans-serif">
<div style="height:3000px;padding:20px">Page behind</div>
<div role="dialog" aria-label="Scheduled posts" style="position:fixed;left:30%;top:35%;width:40%;height:25%;background:#fff;border:1px solid #888">
<ul id="list" style="margin:0;padding:0;list-style:none;height:100%;overflow-y:auto">${slots}</ul></div></body>`;
if (!chromeBinary()) console.log("  - no Chrome here: skipped");
else {
  const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(page); }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  h.keepBrowserOpen(60000);
  try {
    const s1 = await h.mapPage("127.0.0.1:" + srv.address().port + "/", "Scheduled");
    if (s1 && /browser didn.t start/.test(s1.error || "")) { console.log("  - the browser can't start here: skipped"); throw new Error("skip"); }
    const sc = await h.scrollPage(s1.id, "down");
    ok("Scroll moves the pop-up's list", sc && !sc.error && sc.scroll && /list/.test(sc.scroll.selector || ""), sc && { error: sc.error, scroll: sc.scroll });
    const w = await h.wholePage(s1.id);
    const labels = ((w && w.regions) || []).map((r) => r.label);
    ok("Whole page reaches the last slot, not just the first few", labels.includes("Slot 30"), labels.slice(-5));
  } catch (e) { if (e.message !== "skip") throw e; } finally { srv.close(); h.keepBrowserOpen(0); await h.closeBrowser(); }
}
rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log((fail ? "✗" : "✓") + " popup-scroll: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
