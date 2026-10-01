// Load test: the files npm actually ships parse and load, before anything else
// runs. Guards the ui.mjs split (0.28.1): a syntax error in ui.mjs, a broken
// script block in its embedded page, or a local import missing from
// package.json "files" (fine in the repo, dead once installed). Fast, offline.
//
//   node test/load.mjs
//
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8"));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };

const files = (pkg.files || []).map(normalize);
const shipped = files.filter((f) => f.endsWith(".mjs"));

console.log("PACKAGE — the bin entry point is shipped and runnable");
const binRaw = (pkg.bin && pkg.bin.symbiot) || "";
const bin = binRaw ? normalize(binRaw) : "";
ok(`bin "symbiot" -> ${bin}, listed in "files"`, !!bin && files.includes(bin), { bin, files });
ok("bin starts with a node shebang", existsSync(join(PKG, bin)) && readFileSync(join(PKG, bin), "utf8").startsWith("#!/usr/bin/env node"), bin);

console.log("PARSE — every shipped module is valid JavaScript");
for (const f of shipped) {
  const r = spawnSync(process.execPath, ["--check", join(PKG, f)], { encoding: "utf8" });
  ok(`node --check ${f}`, r.status === 0, (r.stderr || "").trim().split("\n").slice(0, 6).join("\n"));
}

console.log("IMPORTS — every local import of a shipped module is shipped too");
const missing = [];
for (const f of shipped) {
  const src = readFileSync(join(PKG, f), "utf8");
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+["'](\.{1,2}\/[^"']+)["']|\bimport\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
    const dep = normalize(join(dirname(f), m[1] || m[2]));
    if (!files.includes(dep) || !existsSync(join(PKG, dep))) missing.push(`${f} -> ${dep}`);
  }
}
ok(`local imports of ${shipped.join(", ")} are all in "files"`, missing.length === 0, missing);

console.log("UI — ui.mjs loads on its own and its page's JS parses");
let ui = null;
try { ui = await import(pathToFileURL(join(PKG, "ui.mjs")).href); } catch (e) { console.log("    import error: " + e.message); }
ok("ui.mjs imports", !!ui);
const page = ui && ui.EMBEDDED_UI;
ok("exports EMBEDDED_UI as an HTML page", typeof page === "string" && /<html/i.test(page) && /<\/html>/i.test(page), typeof page);
const scripts = typeof page === "string" ? [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]) : [];
const parseErrors = [];
for (const s of scripts) { try { new Function(s); } catch (e) { parseErrors.push(e.message); } }
ok(`page JS parses (${scripts.length} script block)`, scripts.length > 0 && parseErrors.length === 0, parseErrors);
let main = null;
try { main = await import(pathToFileURL(join(PKG, "index.mjs")).href); } catch (e) { console.log("    import error: " + e.message); }
ok("index.mjs imports and serves that same page", !!main && main.EMBEDDED_UI === page);

console.log(`\n${fail ? "✗" : "✓"} load: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
