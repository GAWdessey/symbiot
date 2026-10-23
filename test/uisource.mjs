// The app page's source, every part of it (ui.mjs and ui/): for tests that look for a rule or a
// function in the code as written. ui.mjs joins the parts into the page (EMBEDDED_UI).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const parts = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? parts(join(dir, e.name)) : e.name.endsWith(".mjs") ? [join(dir, e.name)] : [])).sort();
export const uiSource = () => [join(ROOT, "ui.mjs"), ...parts("ui").map((p) => join(ROOT, p))].map((f) => readFileSync(f, "utf8")).join("\n");
