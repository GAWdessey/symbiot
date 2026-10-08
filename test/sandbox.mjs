// Sandbox (sandbox.mjs): `symbiot app --fresh` is a brand-new Symbiot to walk
// through first run in: its own empty home, no AI keys from the environment, no
// update offered, and the home deleted when it quits. Yours (here, this test's
// own HOME) isn't touched.
//
//   node test/sandbox.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = mkdtempSync(join(tmpdir(), "symbiot-sandbox-test-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { sandboxEnv, AI_ENV } = await import("../sandbox.mjs");

console.log("SANDBOX — its environment");
{
  const e = sandboxEnv("/tmp/symbiot-fresh-x", { PATH: "/usr/bin", HOME: "/home/me", ANTHROPIC_API_KEY: "sk-1", OPENAI_API_KEY: "sk-2", XDG_CONFIG_HOME: "/home/me/.config", SYMBIOT_PORT: "7391", CLAUDE_CONFIG_DIR: "/home/me/.claude" });
  ok("its own home", e.HOME === "/tmp/symbiot-fresh-x" && e.USERPROFILE === "/tmp/symbiot-fresh-x" && e.SYMBIOT_SANDBOX === "/tmp/symbiot-fresh-x");
  ok("no AI keys, and nothing pointing at your config", !e.ANTHROPIC_API_KEY && !e.OPENAI_API_KEY && !e.XDG_CONFIG_HOME && !e.CLAUDE_CONFIG_DIR, e);
  ok("its own port, and it starts even with yours running", e.SYMBIOT_PORT !== "7391" && e.SYMBIOT_FORCE_NEW === "1");
  ok("the rest of the environment stays (PATH: git, node, your browser)", e.PATH === "/usr/bin");
  ok("the keys it drops include every one Symbiot reads", ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"].every((k) => AI_ENV.includes(k)));
}

console.log("SYMBIOT APP --FRESH — a brand-new Symbiot, gone when it quits");
{
  // yours: connected, with memory
  const mine = join(HOME, ".config", "symbiot"); mkdirSync(mine, { recursive: true });
  writeFileSync(join(mine, "config.json"), JSON.stringify({ provider: "anthropic", anthropic: { apiKey: "sk-mine" } }));
  writeFileSync(join(mine, "mind.json"), JSON.stringify({ nodes: [{ name: "Jono", facts: ["a friend"] }] }));
  const before = readdirSync(mine).sort().join();
  const tmpBefore = new Set(readdirSync(tmpdir()).filter((d) => d.startsWith("symbiot-fresh-")));
  const app = spawn(process.execPath, [join(ROOT, "index.mjs"), "app", "--fresh", "--plain"], { env: { ...process.env, HOME, USERPROFILE: HOME, SYMBIOT_NO_OPEN: "1", ANTHROPIC_API_KEY: "sk-env" }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; app.stdout.on("data", (d) => { out += d; }); app.stderr.on("data", (d) => { out += d; });
  const url = await new Promise((res) => { const t = setTimeout(() => res(""), 30000); const iv = setInterval(() => { const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?t=[\w-]+/); if (m) { clearTimeout(t); clearInterval(iv); res(m[0]); } }, 100); });
  ok("it starts, and says it's a sandbox with its own empty home", !!url && /Sandbox: a brand-new Symbiot/.test(out), out.slice(0, 400));
  const home = (out.match(/own empty home at (\S+?)\.\n/) || [])[1] || "";
  ok("that home is a new folder under the temp folder", !!home && home.includes("symbiot-fresh-") && existsSync(home), home);
  const u = new URL(url), base = `${u.origin}`, h = { "x-symbiot-token": u.searchParams.get("t") };
  const get = (p) => fetch(base + p, { headers: h }).then((r) => r.json());
  const post = (p, b = {}) => fetch(base + p, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
  const ping = await get("/api/ping");
  ok("the app says it's a sandbox, and offers no update", ping.sandbox === true && ping.newer === false, ping);
  const st = await get("/api/status");
  ok("no AI connected: not yours, not the one in the environment", st.connected === false, st);
  const up = await post("/api/update");
  ok("Update & restart is refused (it would replace your real install)", !!up.error && /sandbox/.test(up.error), up);
  const wn = await get("/api/whatsnew");
  ok("first run: no changelog to catch up on", Array.isArray(wn.changes) && wn.changes.length === 0, wn);
  // Home doesn't ask where your repos are while the first search is still looking (a slow CI runner
  // read it mid-search, 2026-10-08): wait for that search to finish, as a new user would see it
  let hs = await get("/api/home?fresh=1");
  for (let i = 0; i < 60 && !(hs.you || []).some((y) => y.id === "setup:folders"); i++) { await new Promise((r) => setTimeout(r, 500)); hs = await get("/api/home?fresh=1"); }
  const ids = (hs.you || []).map((y) => y.id), pick = (hs.you || []).find((y) => y.id === "setup:pick");
  ok("first run: Home asks for what only a new user can do (connect an AI; a folder, as its empty home has no repos), not for an agent that's on this computer", ids.slice(0, 2).join() === "setup:ai,setup:folders" && (!pick || /^no coding agent/.test(pick.sub)), hs.you);
  const mind = await get("/api/mind");
  ok("no memory", !JSON.stringify(mind).includes("Jono"), mind);
  const links = await get("/api/links");
  ok("no linked accounts", !(links.items || links.links || []).some((x) => x.state === "ok" || x.linked), links);
  await fetch(base + "/api/quit", { headers: h }).catch(() => {});
  const code = await new Promise((res) => { const t = setTimeout(() => res("timeout"), 15000); app.on("exit", (c) => { clearTimeout(t); res(c); }); });
  ok("Quit closes it", code === 0, code);
  ok("…and its home is deleted", !existsSync(home), home);
  ok("no sandbox folder is left behind", readdirSync(tmpdir()).filter((d) => d.startsWith("symbiot-fresh-") && !tmpBefore.has(d)).length === 0);
  ok("yours is as it was: the same files, the same key", readdirSync(mine).sort().join() === before && JSON.parse(readFileSync(join(mine, "config.json"), "utf8")).anthropic.apiKey === "sk-mine", readdirSync(mine));
}

console.log(`\n${fail ? "✗" : "✓"} sandbox: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
