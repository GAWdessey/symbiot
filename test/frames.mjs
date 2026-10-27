// Screens maps what's inside a page's frames (iframes): an ad box drawn in one (LinkedIn's
// "Claim offer", 27 Oct 2026) was in no map, so Press answered "No region". A frame from
// the page's own site, one from another site (its own process), and a frame in a frame are
// all mapped where they show, links with their href, and Press reaches them; a link in a
// frame that opens a new tab is followed in this one. A frame scrolled out of the window
// isn't mapped by the window's map, but is by the whole page's.
// Needs a Chromium-family browser (CI has Chrome); without one it says so and passes.
//
//   node test/frames.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-frames-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };

const { chromeBinary } = await import("../core.mjs");
const h = await import("../headless.mjs");
console.log("FRAMES — what's inside a page's frames is mapped, and Press reaches it");
const hits = [];
let port = 0;
const pages = {
  "/": () => `<!doctype html><title>Notifications</title><body style="margin:0;font:16px sans-serif">
<div style="display:flex;gap:20px;padding:20px"><main style="width:600px"><button>Mark all as read</button></main>
<aside><iframe id="ad" title="advertisement" src="/ad" style="width:300px;height:160px;border:0"></iframe>
<iframe id="other" src="http://localhost:${port}/other" style="width:300px;height:200px;border:1px solid #ccc"></iframe></aside></div>
<div style="height:2400px"></div><iframe id="low" src="/low" style="width:300px;height:100px;border:0"></iframe></body>`,
  "/ad": () => `<!doctype html><body style="margin:8px"><p>Sam, don't forget to claim your Ads credits</p>
<button onclick="fetch('/hit?claim')">Claim offer</button><iframe src="/inner" style="width:260px;height:50px;border:0"></iframe></body>`,
  "/inner": () => `<!doctype html><body style="margin:4px"><a href="/landing?inner">Learn more</a></body>`,
  "/other": () => `<!doctype html><body style="margin:8px"><button onclick="fetch('/hit?other')">Try it free</button><br>
<a href="http://localhost:${port}/landing?other" target="_blank">See plans</a></body>`,
  "/low": () => `<!doctype html><body><button>Far down</button></body>`,
  "/landing": () => `<!doctype html><title>Landing</title><body>Welcome</body>`,
};
if (!chromeBinary()) console.log("  - no Chrome here: skipped");
else {
  const srv = createServer((q, r) => {
    const u = new URL(q.url, "http://x");
    if (u.pathname === "/hit") { hits.push(u.search.slice(1)); r.writeHead(204, { "access-control-allow-origin": "*" }); return r.end(); }
    const f = pages[u.pathname]; r.writeHead(f ? 200 : 404, { "content-type": "text/html" }); r.end(f ? f() : "");
  }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  port = srv.address().port;
  h.keepBrowserOpen(60000);
  const wait = async (f) => { for (let i = 0; i < 30 && !f(); i++) await new Promise((r) => setTimeout(r, 100)); return f(); };
  try {
    const s = await h.mapPage(`127.0.0.1:${port}/`, "Notifications");
    const rs = (s && s.regions) || [], by = (l) => rs.find((r) => r.label === l);
    ok("the page's own button is mapped", !!by("Mark all as read"), rs.map((r) => r.label));
    const claim = by("Claim offer");
    ok("a button in a same-site frame is mapped, with its frame", !!claim && claim.kind === "button" && /\/ad$/.test(claim.frame || ""), claim);
    ok("it sits where the frame shows it (right of the page's column)", !!claim && claim.x >= 640 && claim.y >= 20 && claim.y < 180, claim);
    const learn = by("Learn more");
    ok("a link in a frame in a frame is mapped, with its href", !!learn && /\/landing\?inner$/.test(learn.href || ""), learn);
    const other = by("Try it free"), plans = by("See plans");
    ok("a button in a frame from another site is mapped", !!other && /localhost/.test(other.frame || ""), other || rs.map((r) => r.label));
    ok("a link there has its href", !!plans && /\/landing\?other$/.test(plans.href || ""), plans);
    ok("a frame scrolled out of the window isn't in the window's map", !by("Far down"));
    ok("nothing in a frame has a selector (the page's can't reach in)", rs.filter((r) => r.frame).every((r) => !r.selector), rs.filter((r) => r.frame));

    const p1 = await h.pressRegion(s.id, claim && claim.id, { confirmed: true });
    ok("Press reaches the same-site frame's button", !p1.error && await wait(() => hits.includes("claim")), { p1: p1.error, hits });
    const s2 = await h.mapPage(`127.0.0.1:${port}/`, "Notifications");
    const other2 = ((s2 && s2.regions) || []).find((r) => r.label === "Try it free");
    const p2 = await h.pressRegion(s2.id, other2 && other2.id, { confirmed: true });
    ok("Press reaches the other site's frame", !p2.error && await wait(() => hits.includes("other")), { p2: p2.error, hits });
    const s3 = await h.mapPage(`127.0.0.1:${port}/`, "Notifications");
    const plans3 = ((s3 && s3.regions) || []).find((r) => r.label === "See plans");
    const p3 = await h.pressRegion(s3.id, plans3 && plans3.id, { confirmed: true });
    ok("a frame's link that opens a new tab is followed in this one", !p3.error && /\/landing\?other$/.test((p3.page && p3.page.url) || ""), { err: p3.error, url: p3.page && p3.page.url });

    const w = await h.mapPage(`127.0.0.1:${port}/`, "Notifications", { whole: true });
    const wr = (w && w.regions) || [], far = wr.find((r) => r.label === "Far down");
    ok("the whole page's map has the frame far down, where it is on the page", !!far && far.y > 2400, far || wr.map((r) => r.label));
    ok("…and the ones at the top, once each", wr.filter((r) => r.label === "Claim offer").length === 1, wr.filter((r) => r.label === "Claim offer"));
  } finally { try { await h.closeBrowser(); } catch {} srv.close(); }
}
rmSync(HOME, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
