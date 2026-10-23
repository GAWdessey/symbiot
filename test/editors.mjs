// Screens maps rich-text editors as fields: a contenteditable box in any spelling
// (domains.co.za's ticket Message box is an editor with only Undo/Redo mapped), and an
// editor drawn in a same-origin frame (TinyMCE-style), so Type and Fill can use them.
// Needs a Chromium-family browser (CI has Chrome); without one it says so and passes.
//
//   node test/editors.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-editors-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };

const { chromeBinary } = await import("../core.mjs");
const h = await import("../headless.mjs");
console.log("EDITORS — rich-text boxes show up as fields");
const page = `<!doctype html><title>start</title><body style="margin:0;font:16px sans-serif">
<div style="padding:20px"><button>Undo</button><button>Redo</button>
<div id="a" contenteditable="True" style="border:1px solid #888;min-height:60px;padding:8px" aria-label="Plain editor"></div>
<div id="b" contenteditable="plaintext-only" style="border:1px solid #888;min-height:60px;padding:8px" aria-label="Plain text only"></div>
<div id="c" contenteditable="false" style="border:1px solid #888;min-height:30px" aria-label="Locked box"></div>
<div class="grp"><label>Message</label><iframe id="f" title="Rich Text Area. Press ALT-0 for help." style="width:400px;height:120px;border:1px solid #888" srcdoc="<body contenteditable=true style='margin:8px'></body>"></iframe></div></div>
<script>setInterval(() => { document.title = "frame:" + f.contentDocument.body.innerText; }, 50);</script></body>`;
if (!chromeBinary()) console.log("  - no Chrome here: skipped");
else {
  const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(page); }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  h.keepBrowserOpen(60000);
  try {
    const s = await h.mapPage("127.0.0.1:" + srv.address().port + "/t", "Editors");
    const fields = ((s && s.regions) || []).filter((r) => r.kind === "field").map((r) => r.label);
    ok("contenteditable=True (any case) is a field", fields.includes("Plain editor"), fields);
    ok("contenteditable=plaintext-only is a field", fields.includes("Plain text only"), fields);
    ok("contenteditable=false is not", !fields.includes("Locked box"), fields);
    ok("an editor in a frame is a field, named by the label beside it", fields.includes("Message"), fields);
    const msg = ((s && s.regions) || []).find((r) => r.kind === "field" && r.label === "Message") || {};
    const t = await h.typeRegion(s && s.id, msg.id, "Please move my domain", { confirmed: true });
    await new Promise((r) => setTimeout(r, 200));
    const typed = t && t.page && t.page.title;
    ok("Type works in the frame's editor", t && !t.error && /Please move my domain/.test(String(typed)), { t, typed });
  } finally { try { await h.closeBrowser(); } catch {} srv.close(); }
}
rmSync(HOME, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
