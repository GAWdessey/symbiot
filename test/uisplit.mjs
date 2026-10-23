// The app page in parts (ui.mjs, ui/): the stylesheet, the markup and the script by area, joined in
// order into the one page it always was (23 Oct 2026: 4,744 lines in one file, split, the page the
// same to the byte). Each part keeps to what a part may hold, and the page still parses.
//
//   node test/uisplit.mjs
//
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 300) : "")); } };
const ROOT = new URL("..", import.meta.url).pathname;
const { EMBEDDED_UI } = await import("../ui.mjs");
const js = readdirSync(join(ROOT, "ui", "js")).filter((f) => f.endsWith(".mjs"));
const parts = await Promise.all(["style.mjs", "markup.mjs", ...js.map((f) => "js/" + f)].map(async (f) => [f, (await import(`../ui/${f}`)).default]));
ok("every part is in the page, in the order ui.mjs joins them", (() => { const order = readFileSync(join(ROOT, "ui.mjs"), "utf8").match(/const SCRIPT = \[([^\]]+)\]/)[1].split(",").map((x) => x.trim().toLowerCase()); let at = 0; for (const n of ["style.mjs", "markup.mjs", ...order.map((o) => `js/${o}.mjs`)]) { const p = parts.find((x) => x[0] === n); const i = EMBEDDED_UI.indexOf(p[1], at); if (i < at) return false; at = i + p[1].length; } return order.length === js.length; })());
ok("no part holds a backtick or a dollar-brace (each is a template literal)", parts.every(([, t]) => !t.includes("`") && !t.includes("${")), parts.filter(([, t]) => t.includes("`") || t.includes("${")).map(([f]) => f));
ok("one page: a head, one stylesheet, one script, closed", /^<!doctype html>/.test(EMBEDDED_UI) && (EMBEDDED_UI.match(/<style>/g) || []).length === 1 && (EMBEDDED_UI.match(/<script>/g) || []).length === 1 && EMBEDDED_UI.endsWith("</script></body></html>"));
const script = EMBEDDED_UI.slice(EMBEDDED_UI.indexOf("<script>") + 8, EMBEDDED_UI.lastIndexOf("</script>"));
ok("the script still parses as one", (() => { try { new Function(script); return true; } catch (e) { console.log(e.message); return false; } })());
console.log(`\n${fail ? "✗" : "✓"} uisplit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
