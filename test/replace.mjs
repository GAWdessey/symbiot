// Screens' Type --replace: only part of a field typed over, on a real page in a real
// (headless) browser, the rest left as it was. Retyping all of a scheduled LinkedIn
// post to change one line dropped its picture (2026-10-12), so the rich editor here
// keeps a picture beside its text, as LinkedIn's does, and loses it when it's all
// retyped. A plain field and a textarea too, and the part that isn't there, or is
// there twice, changing nothing. Needs a Chromium-family browser (CI has Chrome);
// without one it says so and passes.
//
//   node test/replace.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-replace-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };

const { chromeBinary } = await import("../core.mjs");
const h = await import("../headless.mjs");
console.log("TYPE --REPLACE — part of a field typed over, the rest as it was");
// the page's title says what's in each: the editor's text, and whether its picture is still there
const page = `<!doctype html><title>start</title><body style="margin:0;font:16px sans-serif">
<form style="padding:20px"><input id="one" aria-label="Headline" value="Launch day is Monday">
<textarea id="two" aria-label="Notes" rows="3">first line
second line</textarea>
<div id="ed" contenteditable="true" role="textbox" aria-label="Post text" style="border:1px solid #888;min-height:80px;padding:8px"><p>We ship on <b>Monday</b> at nine.</p><p>See you there, see you there.</p><img id="pic" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40"></div></form>
<script>
const say = () => { document.title = JSON.stringify({ one: one.value, two: two.value, ed: ed.innerText.replace(/\\s+/g, " ").trim(), pic: !!document.getElementById("pic") }); };
for (const e of [one, two, ed]) e.addEventListener("input", say); say();
</script></body>`;
const state = (s) => { try { return JSON.parse((s && s.page && s.page.title) || "{}"); } catch { return {}; } };
if (!chromeBinary()) console.log("  - no Chrome here: skipped");
else {
  const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(page); }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  h.keepBrowserOpen(60000); // as the app does: each step goes on from the page as the last one left it
  try {
    const s = await h.mapPage("127.0.0.1:" + srv.address().port + "/post", "Post");
    // a field on a screen, by its label: each screen has its own region ids
    const field = (sc, re) => ((sc && sc.regions) || []).find((r) => r.kind === "field" && re.test(r.label)) || {};
    const type = (sc, re, text, replace) => h.typeRegion(sc && sc.id, field(sc, re).id, text, { confirmed: true, ...(replace == null ? {} : { replace }) });
    ok("the map has the three fields", field(s, /Headline/).id && field(s, /Notes/).id && field(s, /Post text/).id, ((s && s.regions) || []).map((r) => r.kind + ":" + r.label));
    const a = await type(s, /Post text/, "Tuesday", "Monday");
    let st = state(a);
    ok("the rich editor: one word changed, across its bold, the rest and its picture still there", a && !a.error && a.replaced === "Monday" && st.ed === "We ship on Tuesday at nine. See you there, see you there." && st.pic === true, a && { error: a.error, st });
    const b = await type(a, /Notes/, "2nd", "second");
    st = state(b);
    ok("a textarea: that line changed, the other kept, and the editor's change still there", st.two === "first line\n2nd line" && st.ed.startsWith("We ship on Tuesday"), st);
    const c = await type(b, /Headline/, "", " is Monday");
    st = state(c);
    ok("a plain field, replaced with nothing: that part deleted", st.one === "Launch day", st);
    const none = await type(c, /Post text/, "x", "Friday");
    ok("not in the field: says so, changes nothing", /doesn't have "Friday" in it/.test((none && none.error) || ""), none);
    const twice = await type(c, /Post text/, "x", "you there");
    ok("there twice: says how often, changes nothing", /2 times/.test((twice && twice.error) || ""), twice);
    const after = await type(c, /Post text/, "Tuesday", "Tuesday");
    ok("…the field as it was after those two refusals", state(after).ed === "We ship on Tuesday at nine. See you there, see you there.", state(after));
    ok("nothing to replace given: refused before a browser starts", /Give the words to replace/.test((await type(s, /Post text/, "x", "")).error || ""), "");
    const all = await type(after, /Post text/, "All new");
    ok("…and without it, Type still replaces all of it (which is what dropped the picture)", state(all).ed === "All new" && state(all).pic === false, state(all));
  } finally { srv.close(); await h.closeBrowser(); }
}
rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log((fail ? "✗" : "✓") + " replace: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
