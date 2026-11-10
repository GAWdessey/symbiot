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
// LinkedIn's box as it really is (2026-11-10): its tabs stick at the top of the list as it scrolls,
// and the list fetches its later slots each time it's scrolled to its end, so a map that stopped at
// the first end read up to 4 Nov when there were slots to the 16th.
const LAZY_ALL = 40, LAZY_STEP = 10;
const row = (i) => `<div class="slot" style="height:90px;border-bottom:1px solid #ddd"><a href="#s${i}">Posting slot ${i} of ${LAZY_ALL}</a></div>`;
const rows = (from) => Array.from({ length: Math.max(0, Math.min(LAZY_STEP, LAZY_ALL - from)) }, (_, k) => row(from + k + 1)).join("");
const lazy = `<!doctype html><title>Scheduled lazy</title><body style="margin:0;font:16px sans-serif">
<div style="height:3000px;padding:20px">Page behind</div>
<dialog id="dlg" aria-label="Scheduled posts" style="width:500px;height:520px;padding:0;border:1px solid #888">
<div id="lazylist" style="height:100%;overflow-y:auto">
<div style="position:sticky;top:0;background:#fff;height:56px;border-bottom:2px solid #000;display:flex;gap:16px;align-items:center"><a href="#new">Schedule post</a><a href="#all">Scheduled (${LAZY_ALL})</a></div>
<div id="slots">${rows(0)}</div></div></dialog>
<script>
document.getElementById('dlg').showModal();
const L = document.getElementById('lazylist'), S = document.getElementById('slots'); let busy = false;
L.addEventListener('scroll', () => {
  const n = S.children.length;
  if (busy || n >= ${LAZY_ALL} || L.scrollTop + L.clientHeight < L.scrollHeight - 40) return;
  busy = true;
  fetch('/more?from=' + n).then((r) => r.text()).then((h) => { S.insertAdjacentHTML('beforeend', h); busy = false; });
});
</script></body>`;
const count = (labels, l) => labels.filter((x) => x === l).length;
if (!chromeBinary()) console.log("  - no Chrome here: skipped");
else {
  const srv = createServer((q, r) => {
    const u = new URL(q.url, "http://x");
    if (u.pathname === "/more") return setTimeout(() => { r.writeHead(200, { "content-type": "text/html" }); r.end(rows(+u.searchParams.get("from") || 0)); }, 300);
    r.writeHead(200, { "content-type": "text/html" }); r.end(u.pathname === "/lazy" ? lazy : page);
  }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  h.keepBrowserOpen(60000);
  try {
    const s1 = await h.mapPage("127.0.0.1:" + srv.address().port + "/", "Scheduled");
    if (s1 && /browser didn.t start/.test(s1.error || "")) { console.log("  - the browser can't start here: skipped"); throw new Error("skip"); }
    const sc = await h.scrollPage(s1.id, "down"), at = ((sc || {}).page || {}).scroll || {};
    ok("Scroll moves the pop-up's list", sc && !sc.error && /list/.test(at.selector || "") && at.y > 0, sc && { error: sc.error, scroll: at });
    const w = await h.wholePage(s1.id);
    const labels = ((w && w.regions) || []).map((r) => r.label);
    ok("Whole page reaches the last slot, not just the first few", labels.includes("Slot 30"), labels.slice(-5));

    console.log("a pop-up list that loads more at its end, under a header that sticks:");
    const base = "127.0.0.1:" + srv.address().port + "/lazy";
    const wl = await h.mapPage(base, "Scheduled lazy", { whole: true }), wls = ((wl && wl.regions) || []).map((r) => r.label);
    const slotsRead = wls.filter((l) => /^Posting slot \d+ of/.test(l));
    ok("map --whole reads the list to its very end, loading more as it gets there", wls.includes(`Posting slot ${LAZY_ALL} of ${LAZY_ALL}`), { error: wl && wl.error, note: wl && wl.note, last: slotsRead.slice(-3) });
    ok("…every slot once, none lost under the sticky header or doubled", slotsRead.length === LAZY_ALL && Array.from({ length: LAZY_ALL }, (_, i) => `Posting slot ${i + 1} of ${LAZY_ALL}`).every((l) => count(wls, l) === 1), slotsRead.map((l) => +l.match(/\d+/)[0]));
    ok("…and the header that sticks is marked once, at the top", count(wls, `Scheduled (${LAZY_ALL})`) === 1 && count(wls, "Schedule post") === 1, wls.filter((l) => /^Schedule/.test(l)));
    const ys = (wl.regions || []).filter((r) => /^Posting slot/.test(r.label)).map((r) => r.y);
    ok("…each slot below the one before, where it is in the opened-out list", ys.every((y, i) => !i || y > ys[i - 1]) && wl.h > 800, { h: wl.h, ys: ys.slice(0, 6) });
    const m1 = await h.mapPage(base, "Scheduled lazy");
    const bt = await h.scrollPage(m1.id, "bottom"), bls = ((bt && bt.regions) || []).map((r) => r.label);
    ok("Scroll bottom goes to the end of all of it, not the end of what had loaded", bls.includes(`Posting slot ${LAZY_ALL} of ${LAZY_ALL}`), { error: bt && bt.error, labels: bls.slice(-4), scroll: bt && bt.page && bt.page.scroll });
  } catch (e) { if (e.message !== "skip") throw e; } finally { srv.close(); h.keepBrowserOpen(0); await h.closeBrowser(); }
}
rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log((fail ? "✗" : "✓") + " popup-scroll: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
