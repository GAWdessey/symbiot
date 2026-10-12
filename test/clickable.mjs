// Screens on a sign-in's pop-up, on a real page in a real (headless) browser, as on
// www.domains.co.za's "Two-Factor Verification" (2026-10-12): its "Resend One-Time
// PIN" and "Send Email OTP instead?" are text with a click handler, no link or button
// role, and are mapped and pressed now; Whole page maps the pop-up as it is, instead of
// opening the page again (which closed it); and Type refuses when its field is gone,
// instead of typing the PIN into the page's Email field at the same spot. Needs a
// Chromium-family browser (CI has Chrome); without one it says so and passes.
//
//   node test/clickable.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-clickable-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };

const { chromeBinary } = await import("../core.mjs");
const h = await import("../headless.mjs");
console.log("CLICKABLE TEXT — a sign-in's pop-up, mapped and pressed as it is");
// the sign-in: Email over where the pop-up's PIN field opens, so a PIN typed at its spot lands in Email
const page = `<!doctype html><title>Sign in</title><body style="margin:0;font:16px sans-serif">
<form style="padding:20px"><input id="email" placeholder="Email" style="position:absolute;left:300px;top:300px;width:300px;height:30px">
<button type="button" id="signin" style="position:absolute;left:300px;top:360px">Sign In</button></form>
<p style="padding:20px">Plain words, not a button.</p>
<div style="cursor:pointer;padding:20px;width:300px"><button type="button">Inside a pointer card</button></div>
<div id="all" style="padding:20px">The page itself listens for clicks.</div>
<div id="own" style="padding:20px;width:200px">Its own mousedown</div>
<div id="otpCellModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4)">
  <div style="background:#fff;position:absolute;left:250px;top:250px;width:400px;height:300px;padding:16px">
    <h4>Two-Factor Verification</h4>
    <input id="otpCellPin" placeholder="PIN" style="position:absolute;left:50px;top:50px;width:300px;height:30px">
    <button type="button" id="otpCellBttn" style="position:absolute;left:50px;top:110px">Verify</button>
    <a id="resend" style="position:absolute;left:50px;top:170px">Resend One-Time PIN</a>
    <span class="email-otp" style="position:absolute;left:50px;top:210px;cursor:pointer"><b>Send Email OTP</b> instead?</span>
  </div>
</div>
<script>
const m = document.getElementById("otpCellModal");
document.getElementById("signin").addEventListener("click", () => { m.style.display = "block"; });
document.getElementById("resend").addEventListener("click", () => { document.title = "resent"; });
// a delegated handler, as jQuery's on("click", ".email-otp"): only its cursor says it's clickable
document.addEventListener("click", (e) => { if (e.target.closest(".email-otp")) document.title = "email otp sent"; });
document.body.addEventListener("click", () => {});
document.getElementById("own").addEventListener("mousedown", () => { document.title = "own"; });
</script></body>`;
if (!chromeBinary()) console.log("  - no Chrome here: skipped");
else {
  const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(page); }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  h.keepBrowserOpen(60000); // as the app does: the page stays open between actions
  const find = (s, re, kind) => ((s && s.regions) || []).find((r) => re.test(r.label) && (!kind || r.kind === kind));
  const labels = (s) => ((s && s.regions) || []).map((r) => r.kind + ":" + r.label);
  try {
    const s1 = await h.mapPage("127.0.0.1:" + srv.address().port + "/login/dashboard", "Sign in");
    ok("the sign-in is mapped, without its plain words or the page that listens for clicks", find(s1, /^Sign In$/) && find(s1, /^Email$/, "field") && !find(s1, /Plain words/) && !find(s1, /^The page itself/), labels(s1));
    ok("…and a part with a mousedown handler of its own is a button", find(s1, /^Its own mousedown$/, "button"), labels(s1));
    ok("…a card that points as a link isn't a button of its own around the button in it", find(s1, /Inside a pointer card/, "button") && labels(s1).filter((l) => /Inside a pointer card/.test(l)).length === 1, labels(s1));
    const s2 = await h.pressRegion(s1.id, find(s1, /^Sign In$/).id, { confirmed: true });
    ok("Sign In opens the pop-up: its field and button are mapped, and not what's behind it", s2 && !s2.error && find(s2, /^PIN$/, "field") && find(s2, /^Verify$/) && !find(s2, /^Email$/), s2 && (s2.error || labels(s2)));
    ok("…and its clickable text too: a bare <a> with a click handler, and text the site points at", find(s2, /^Resend One-Time PIN$/, "button") && find(s2, /^Send Email OTP instead\?$/, "button"), labels(s2));
    const s3 = await h.pressRegion(s2.id, find(s2, /Send Email OTP instead/).id, { confirmed: true });
    ok("pressing \"Send Email OTP instead?\" works, found by its selector", s3 && !s3.error && s3.found && s3.name === "email otp sent", s3 && { error: s3.error, found: s3.found, name: s3.name });
    const w = await h.wholePage(s2.id);
    ok("Whole page of the pop-up's screen maps it as it is (the pop-up still open), not opened again", w && !w.error && w.kept === true && find(w, /^PIN$/, "field") && find(w, /^Resend One-Time PIN$/), w && (w.error || { kept: w.kept, labels: labels(w) }));
    const typed = await h.typeRegion(s2.id, find(s2, /^PIN$/).id, "123456", { confirmed: true });
    ok("Type into the pop-up's field while it's open: typed", typed && !typed.error && typed.typed === "PIN" && typed.found, typed && (typed.error || typed));
    const resent = await h.pressRegion(s2.id, find(s2, /^Resend One-Time PIN$/).id, { confirmed: true });
    ok("…and \"Resend One-Time PIN\" (a bare <a>, its own click handler)", resent && !resent.error && resent.found && resent.name === "resent", resent && { error: resent.error, found: resent.found, name: resent.name });
    const behind = await h.pressRegion(s1.id, find(s1, /^Sign In$/).id, { confirmed: true });
    ok("an earlier screen's region the pop-up covers: the page is opened again for it, not the pop-up pressed", behind && !behind.error && behind.found && behind.kept === false && find(behind, /^PIN$/, "field"), behind && (behind.error || { kept: behind.kept, labels: labels(behind) }));
    await h.closeBrowser(); // the browser closed (or another command's own): the page opens again, without the pop-up
    const gone = await h.typeRegion(s2.id, find(s2, /^PIN$/).id, "654321", { confirmed: true });
    ok("…once the page was opened again (the pop-up closed): refused, not typed into Email at the same spot", gone && /isn't on the page now/.test(gone.error || "") && /opened again/.test(gone.error) && gone.kept === false, gone);
    const after = await h.mapPage("127.0.0.1:" + srv.address().port + "/login/dashboard", "Again");
    ok("…and the Email field is as it was (a fresh page anyway; nothing pressed)", after && !after.error && find(after, /^Email$/, "field"), after && (after.error || labels(after)));
  } finally { srv.close(); h.keepBrowserOpen(0); await h.closeBrowser(); }
}
rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log((fail ? "✗" : "✓") + " clickable: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
