// Screens inside web components, on a real page in a real (headless) browser, as on a
// Reddit post (2026-10-12): its "Join the conversation" box, and the comment editor and
// its image button behind it, are in shreddit-* / faceplate-* elements' shadow roots,
// and the map listed none of them. Now it walks open shadow roots: the box is a field,
// the image button a button, each with a selector that goes into its shadow root
// (" >>> "), and press, type and upload find them by it, and the file box beside them.
// Needs a Chromium-family browser (CI has Chrome); without one it says so and passes.
//
//   node test/shadow.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-shadow-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };

const { chromeBinary } = await import("../core.mjs");
const h = await import("../headless.mjs");
console.log("SHADOW ROOTS — a comment box inside web components, mapped, typed into, pressed and uploaded to");
// a post: Share in the page; the composer a web component, its editor another one inside it,
// and its Comment button the page's own, put in the composer's slot
const page = `<!doctype html><title>Post</title><body style="margin:0;font:16px sans-serif">
<div style="padding:20px"><button type="button" id="share">Share</button></div>
<shreddit-composer><button type="button" id="comment" slot="submit">Comment</button></shreddit-composer>
<script>
customElements.define("faceplate-textarea-input", class extends HTMLElement {
  constructor() { super(); const r = this.attachShadow({ mode: "open" });
    r.innerHTML = '<span id="lbl" style="display:none">Join the conversation</span><textarea aria-labelledby="lbl" style="width:400px;height:60px"></textarea>';
    r.querySelector("textarea").addEventListener("input", (e) => { document.title = "typed: " + e.target.value; }); }
});
customElements.define("shreddit-composer", class extends HTMLElement {
  constructor() { super(); const r = this.attachShadow({ mode: "open" });
    r.innerHTML = '<div style="padding:20px"><faceplate-textarea-input></faceplate-textarea-input>' +
      '<div><button type="button" aria-label="Add image" id="img">&#128247;</button><input type="file" accept="image/*" style="display:none"><slot name="submit"></slot></div></div>';
    r.getElementById("img").addEventListener("click", () => { document.title = "image button"; });
    r.querySelector("input[type=file]").addEventListener("change", (e) => { document.title = "attached: " + e.target.files[0].name; }); }
});
document.getElementById("comment").addEventListener("click", () => { document.title = "comment"; });
</script></body>`;
if (!chromeBinary()) console.log("  - no Chrome here: skipped");
else {
  const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(page); }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  h.keepBrowserOpen(60000); // as the app does: the page stays open between actions
  const find = (s, re, kind) => ((s && s.regions) || []).find((r) => re.test(r.label) && (!kind || r.kind === kind));
  const labels = (s) => ((s && s.regions) || []).map((r) => r.kind + ":" + r.label);
  const pic = join(HOME, "clip.gif"); writeFileSync(pic, "GIF89a");
  try {
    const s1 = await h.mapPage("127.0.0.1:" + srv.address().port + "/r/ClaudeAI/comments/1", "Post");
    const box = find(s1, /^Join the conversation$/, "field"), img = find(s1, /^Add image$/, "button");
    ok("the comment box two shadow roots down is a field, labelled from inside its own shadow root", !!box, labels(s1));
    ok("…its image button a button, and the page's own Share and slotted Comment once each", img && find(s1, /^Share$/) && labels(s1).filter((l) => /Comment/.test(l)).length === 1, labels(s1));
    ok("…each with a selector that goes into its shadow root", box && (box.selector.match(/ >>> /g) || []).length === 2 && img && / >>> /.test(img.selector), box && [box.selector, img && img.selector]);
    const t = box && await h.typeRegion(s1.id, box.id, "great thread", { confirmed: true });
    ok("Type into it: found by its selector, and the box has the words", t && !t.error && t.found && t.name === "typed: great thread", t && { error: t.error, found: t.found, name: t.name });
    const p = img && await h.pressRegion(s1.id, img.id, { confirmed: true });
    ok("Press the image button: found by its selector", p && !p.error && p.found && p.name === "image button", p && { error: p.error, found: p.found, name: p.name });
    const u = img && await h.uploadRegion(s1.id, img.id, pic, { confirmed: true });
    ok("Upload to the image button: the file box beside it in the shadow root gets the file", u && !u.error && u.found && u.name === "attached: clip.gif" && /nearest|only/.test(u.used || ""), u && { error: u.error, found: u.found, name: u.name, used: u.used });
    const cm = find(s1, /^Comment$/), c = cm && await h.pressRegion(s1.id, cm.id, { confirmed: true });
    ok("…and the slotted Comment button presses too", c && !c.error && c.found && c.name === "comment", c && { error: c.error, found: c.found, name: c.name });
    const w = await h.wholePage(s1.id);
    ok("Whole page maps the shadow roots' insides too", w && !w.error && find(w, /^Join the conversation$/, "field") && find(w, /^Add image$/, "button"), w && (w.error || labels(w)));
  } finally { srv.close(); h.keepBrowserOpen(0); await h.closeBrowser(); }
}
rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log((fail ? "✗" : "✓") + " shadow: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
