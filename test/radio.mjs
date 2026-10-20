// Screens on a site-drawn radio, as Google Cloud Console's "Application restrictions"
// (Angular Material, 2026-10-16): the real <input type=radio> sits over the circle at
// opacity 0, so it was left out of the map and `press "Android apps"` found no region.
// Now it is mapped as a radio, pressing it maps the fields it reveals. Needs a
// Chromium-family browser (CI has Chrome); without one it says so and passes.
//
//   node test/radio.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-radio-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };

const { chromeBinary } = await import("../core.mjs");
const h = await import("../headless.mjs");
console.log("RADIO — a site-drawn radio is mapped, pressed, and the fields it reveals are mapped");
const radio = (id, label, top) => `<div style="position:absolute;left:40px;top:${top}px"><span style="position:relative;display:inline-block;width:40px;height:40px"><input type="radio" name="r" id="${id}" style="position:absolute;inset:0;width:40px;height:40px;margin:0;opacity:0;cursor:pointer"></span><label for="${id}">${label}</label></div>`;
const page = `<!doctype html><title>Key</title><body style="margin:0;font:16px sans-serif">
${radio("none", "None", 20)}${radio("web", "Websites", 70)}${radio("and", "Android apps", 120)}
<mat-radio-button style="position:absolute;left:300px;top:20px;display:inline-block;width:40px;height:40px"><input type="radio" name="m" id="mat" style="position:absolute;inset:0;width:40px;height:40px;margin:0;opacity:0"><span class="mat-mdc-radio-touch-target" style="position:absolute;left:-10px;top:-10px;width:60px;height:60px"></span><label for="mat" style="position:absolute;left:50px;top:10px">Material host</label></mat-radio-button>
<div id="pkg" style="display:none;position:absolute;left:40px;top:200px"><input placeholder="Package name" style="width:300px;height:30px"></div>
<script>document.getElementById("and").addEventListener("change", () => { document.getElementById("pkg").style.display = "block"; });</script></body>`;
if (!chromeBinary()) console.log("  - no Chrome here: skipped");
else {
  const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(page); }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  h.keepBrowserOpen(60000);
  const find = (s, re, kind) => ((s && s.regions) || []).find((r) => re.test(r.label) && (!kind || r.kind === kind));
  const labels = (s) => ((s && s.regions) || []).map((r) => r.kind + ":" + r.label);
  try {
    const s1 = await h.mapPage("127.0.0.1:" + srv.address().port + "/key", "Key");
    ok("the three radios are mapped as radios", ["None", "Websites", "Android apps"].every((l) => find(s1, new RegExp("^" + l + "$"), "radio")) && !find(s1, /^Package name$/), labels(s1));
    ok("a radio with a touch-target span over it (Angular Material) is mapped too", find(s1, /Material host/, "radio"), labels(s1));
    const p = await h.pressRegion(s1.id, find(s1, /^Android apps$/).id, { confirmed: true });
    ok("pressing \"Android apps\" maps the field it reveals", p && !p.error && find(p, /^Package name$/, "field"), p && (p.error || labels(p)));
  } finally { srv.close(); h.keepBrowserOpen(0); await h.closeBrowser(); }
}
rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log((fail ? "✗" : "✓") + " radio: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
