// Smoke test: boot `symbiot app` and hit every endpoint the UI calls, with the
// SAME method the UI uses, asserting none 404s. This catches route/method
// mismatches (e.g. the button sending GET to a POST-only route) that unit tests
// and curl (which picks its own method) miss. Runs in an isolated HOME so it
// never touches real config or repos.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = mkdtempSync(join(tmpdir(), "symbiot-smoke-"));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + got : "")); } };

const child = spawn(process.execPath, [join(HERE, "..", "index.mjs"), "app"], { env: { ...process.env, HOME, SYMBIOT_NO_OPEN: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let buf = "";
const url = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("app did not start in time")), 8000);
  child.stdout.on("data", (d) => { buf += d; const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[a-f0-9]+/); if (m) { clearTimeout(t); resolve(m[0]); } });
  child.on("exit", () => { clearTimeout(t); reject(new Error("app exited: " + buf)); });
});
const base = url.replace(/\/\?t=.*/, "");
const token = url.replace(/.*t=/, "");
const H = { "x-symbiot-token": token, "content-type": "application/json" };

// (path, method) exactly as the browser UI calls them.
const calls = [
  ["/", "GET"],
  ["/api/status", "GET"],
  ["/api/map", "GET"],
  ["/api/node?id=me", "GET"],
  ["/api/tasks", "GET"],
  ["/api/tasks/push", "POST"],   // the button's call — the 0.10.2 bug
  ["/api/drift?ci=0&fetch=0", "GET"],
  ["/api/models", "GET"],
  ["/api/agentcfg", "GET"],
  ["/api/agentcmd", "POST"],
  ["/api/agents", "GET"],
  ["/api/setup-local", "POST"],
  ["/api/tasks/sync", "POST"],
  ["/api/tasks?archived=1", "GET"],
];
try {
  console.log("SMOKE — every UI endpoint responds (no 404 route/method mismatch)");
  for (const [path, method] of calls) {
    let status = 0;
    try { const r = await fetch(base + path, { method, headers: H, body: method === "POST" ? "{}" : undefined }); status = r.status; } catch (e) { status = -1; }
    ok(`${method} ${path} -> ${status}`, status !== 404 && status !== -1, status);
  }
} finally {
  child.kill("SIGKILL");
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
