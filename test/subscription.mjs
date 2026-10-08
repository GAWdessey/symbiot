// Your Claude subscription (ai.mjs): Claude Code signed in on this computer answers
// for Symbiot, no API key. A stand-in `claude` (SYMBIOT_CLAUDE_CMD) says whether it's
// signed in and answers -p calls, writing down how it was called.
// Isolated HOME (set before the modules load).
//
//   node test/subscription.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-sub-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "SYMBIOT_MODEL"]) delete process.env[k];
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

// the stand-in: SIGNED=1 says signed in with a Claude account; -p answers RESULT (or fails)
const fake = join(HOME, "fake-claude"), calls = join(HOME, "calls.json");
writeFileSync(fake, `#!/usr/bin/env node
const fs = require("fs"), a = process.argv.slice(2);
if (a[0] === "auth") { console.log(JSON.stringify({ loggedIn: process.env.SIGNED === "1", authMethod: "claude.ai" })); process.exit(0); }
let stdin = ""; process.stdin.on("data", (d) => stdin += d).on("end", () => {
  fs.writeFileSync(${JSON.stringify(calls)}, JSON.stringify({ args: a, stdin, cwd: process.cwd() }));
  if (process.env.FAIL === "1") { console.log(JSON.stringify({ type: "result", is_error: true, result: "Your usage limit is reached" })); process.exit(1); }
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "hello from your subscription" }));
});
`); chmodSync(fake, 0o755);
process.env.SYMBIOT_CLAUDE_CMD = fake;
const setCfg = (c) => writeFileSync(join(CFG, "config.json"), JSON.stringify(c));

try {
  const { resolveProvider, write, connectProvider, claudeState, PROVIDERS } = await import("../ai.mjs");

  console.log("WHICH AI — the subscription first, with no choice saved");
  process.env.SIGNED = "1"; setCfg({});
  let r = resolveProvider(); claudeState(true);
  r = resolveProvider();
  ok("Claude Code signed in, nothing chosen: your subscription, no key", r && r.provider === "claude" && !r.key && /subscription/.test(r.source), r);
  setCfg({ apiKey: "sk-ant-old" }); claudeState(true);
  ok("…even with an old key saved: the subscription comes first", resolveProvider().provider === "claude", resolveProvider());
  setCfg({ provider: "openai", openai: { apiKey: "sk-x" } }); claudeState(true);
  ok("a provider you chose stays chosen", resolveProvider().provider === "openai", resolveProvider());
  process.env.SIGNED = "0"; setCfg({ apiKey: "sk-ant-old" }); claudeState(true);
  ok("not signed in: the old key, as before", resolveProvider().provider === "anthropic" && resolveProvider().key === "sk-ant-old", resolveProvider());
  setCfg({}); claudeState(true);
  ok("…and with nothing at all: not connected (Home's Connect an AI)", resolveProvider() === null, resolveProvider());
  ok("it's first in the list of AIs", Object.keys(PROVIDERS)[0] === "claude" && PROVIDERS.claude.sub === true, Object.keys(PROVIDERS));

  console.log("ANSWERING — Claude Code, headless, on the subscription");
  process.env.SIGNED = "1"; setCfg({}); claudeState(true);
  const a = await write("You are Symbiot.", "Say hello.");
  const c = JSON.parse(readFileSync(calls, "utf8"));
  ok("its answer is the reply", a === "hello from your subscription", a);
  ok("run as claude -p with Symbiot's system prompt, the prompt on stdin, JSON out", c.args[0] === "-p" && c.args.includes("--output-format") && c.args[c.args.indexOf("--system-prompt") + 1] === "You are Symbiot." && c.stdin === "Say hello.", c);
  ok("…no tools, none of your settings, plugins or servers, no session kept", c.args[c.args.indexOf("--tools") + 1] === "" && c.args[c.args.indexOf("--setting-sources") + 1] === "" && c.args.includes("--strict-mcp-config") && c.args.includes("--no-session-persistence"), c.args);
  ok("…never --bare (it ignores the subscription sign-in), and in Symbiot's own folder", !c.args.includes("--bare") && c.cwd === CFG, [c.args, c.cwd]);
  await write("You are Symbiot.", "What's this?", { images: [{ mime: "image/png", data: Buffer.from("png").toString("base64") }] });
  const ci = JSON.parse(readFileSync(calls, "utf8")), shot = (ci.stdin.match(/Read tool\): (\S+)/) || [])[1];
  ok("a screenshot: saved for it, and the Read tool only, to look at it", ci.args[ci.args.indexOf("--tools") + 1] === "Read" && shot && existsSync(shot) && readFileSync(shot, "utf8") === "png", [ci.args, ci.stdin]);
  setCfg({ provider: "claude", claude: { model: "sonnet" } }); claudeState(true);
  await write("s", "p");
  ok("a model you picked is passed on", JSON.parse(readFileSync(calls, "utf8")).args.join(" ").includes("--model sonnet"), JSON.parse(readFileSync(calls, "utf8")).args);
  process.env.FAIL = "1";
  const f = await write("s", "p");
  ok("when it can't answer, it says why (a limit, signed out)", /Couldn't reach the model: Claude Code: Your usage limit is reached/.test(f || ""), f);
  delete process.env.FAIL;

  console.log("CONNECTING IT — Settings and symbiot login");
  process.env.SIGNED = "0"; setCfg({});
  const no = await connectProvider({ provider: "claude" });
  ok("not signed in: it says how (run claude once and sign in), and saves nothing", !no.ok && /sign in with your Claude account/.test(no.message) && !JSON.parse(readFileSync(join(CFG, "config.json"), "utf8")).provider, no);
  process.env.SIGNED = "1";
  const yes = await connectProvider({ provider: "claude", model: "" });
  ok("signed in: chosen, no key asked", yes.ok && /No key needed/.test(yes.message) && JSON.parse(readFileSync(join(CFG, "config.json"), "utf8")).provider === "claude", yes);
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} subscription: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
