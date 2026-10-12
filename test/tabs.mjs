// Screens: a tab of its own for each agent in the hidden browser (headless.mjs withPage),
// on a real page in a real (headless) browser. Two lanes drove it at once on 2026-10-12
// (LinkedIn and the Twilio console), and a scheduled post being written lost its text
// and picture between steps, twice. Here two agents each type into the same form: each
// carries on from its own page as it left it, never the other's; one with no agent named
// gets Symbiot's own tab; past the most tabs it keeps, the one used longest ago goes.
// Needs a Chromium-family browser (CI has Chrome); without one it says so and passes.
//
//   node test/tabs.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-tabs-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };

const { chromeBinary } = await import("../core.mjs");
const h = await import("../headless.mjs");
console.log("TABS — each agent its own page in the hidden browser");
ok("whose tab: the agent's folder, else Symbiot's own", h.tabKey("/home/me/linkedin") === "/home/me/linkedin" && h.tabKey("") === "symbiot" && h.tabKey(null) === "symbiot");
// the page's title says what's in its field
const page = `<!doctype html><title>empty</title><body style="font:16px sans-serif;padding:20px"><input id="f" aria-label="Post text" style="width:600px">
<script>f.addEventListener("input", () => { document.title = "has:" + f.value; });</script></body>`;
const typed = (s) => String((s && s.page && s.page.title) || "");
const field = (s) => ((s && s.regions) || []).find((r) => r.kind === "field") || {};
if (!chromeBinary()) console.log("  - no Chrome here: skipped");
else {
  const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(page); }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  h.keepBrowserOpen(60000); // as the app does
  const A = "/work/linkedin-lane", B = "/work/twilio-lane", site = "127.0.0.1:" + srv.address().port + "/post";
  const type = (who, s, text, o = {}) => h.typeRegion(s.id, field(s).id, text, { confirmed: true, who, ...o });
  try {
    const sa = await h.mapPage(site, "A's post", { who: A }), sb = await h.mapPage(site, "B's post", { who: B });
    ok("both agents map the same page", field(sa).id && field(sb).id, [sa && sa.error, sb && sb.error]);
    const a1 = await type(A, sa, "hello from A"), b1 = await type(B, sb, "hello from B");
    ok("each types into its own", typed(a1) === "has:hello from A" && typed(b1) === "has:hello from B", [typed(a1), typed(b1)]);
    const a2 = await type(A, a1, "hi", { replace: "hello" });
    ok("A's next step carries on from A's page as A left it, not B's", a2 && a2.kept === true && typed(a2) === "has:hi from A", a2 && { kept: a2.kept, title: typed(a2), error: a2.error });
    const b2 = await type(B, b1, "hey", { replace: "hello" });
    ok("…and B's from B's", b2 && b2.kept === true && typed(b2) === "has:hey from B", b2 && { kept: b2.kept, title: typed(b2), error: b2.error });
    const own = await h.mapPage(site, "Symbiot's own");
    const a3 = await type(A, a2, "!", { replace: " from A" });
    ok("Symbiot's own look (no agent named) gets a tab of its own: A's page is still as A left it", own && !own.error && a3.kept === true && typed(a3) === "has:hi!", { kept: a3.kept, title: typed(a3) });
    for (let i = 0; i < 6; i++) await h.mapPage(site, "other " + i, { who: "/work/other-" + i });
    const a4 = await type(A, a3, "x", { replace: "!" });
    ok("past the most tabs it keeps, the one used longest ago is closed: A's next step opens its page afresh, its text gone", /doesn't have "!" in it/.test((a4 && a4.error) || ""), a4 && { kept: a4.kept, title: typed(a4), error: a4.error });
  } finally { srv.close(); await h.closeBrowser(); }
}
rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log((fail ? "✗" : "✓") + " tabs: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
