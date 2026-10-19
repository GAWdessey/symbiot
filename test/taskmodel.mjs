// The Model picker on a task card: setTaskModel stores the pick (route.mjs reads it as an
// override once the brief's line for the task ends [model: x]), Auto clears it.
//
//   node test/taskmodel.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const SRC = join(dirname(fileURLToPath(import.meta.url)), ".."), HOME = mkdtempSync(join(tmpdir(), "symbiot-tm-"));
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
const code = `
import { addTask, setTaskModel } from ${JSON.stringify(join(SRC, "tasks.mjs"))};
import { loadTasks } from ${JSON.stringify(join(SRC, "core.mjs"))};
const t = addTask("tidy the docs", "x");
const out = { bad: setTaskModel(t.id, "gpt9").error, none: setTaskModel("nope", "opus").error };
out.set = setTaskModel(t.id, "Opus").model; out.stored = loadTasks().find((x) => x.id === t.id).model;
out.auto = setTaskModel(t.id, "auto").model; process.stdout.write(JSON.stringify(out)); process.exit(0);`;
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log("  ✗ " + n); } };
try {
  const o = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, HOME }, encoding: "utf8" }));
  ok("an unknown model is refused", o.bad === "unknown model");
  ok("an unknown task is refused", o.none === "not found");
  ok("a pick is stored, lower-cased", o.set === "opus" && o.stored === "opus");
  ok("Auto clears it", o.auto === undefined);
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log((fail ? "✗" : "✓") + " taskmodel: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
