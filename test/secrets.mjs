// Symbiot's own keys out of every run's reach (core.mjs secrets.json): your AI's key
// and the app's token sat in config.json, which a run outside the sandbox could
// `cat`, and with the token change the agent command through Symbiot's own API. Now
// they're in secrets.json, which the membrane (guard.mjs) and a run's sandbox refuse,
// and loadConfig/saveConfig join and split them, so nothing else changes. Isolated HOME.
//
//   node test/secrets.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-secrets-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const { loadConfig, saveConfig, moveSecrets, SECRETS_PATH, CONFIG_PATH } = await import("../core.mjs");
const { judge } = await import("../guard.mjs");
const raw = (f) => JSON.parse(readFileSync(f, "utf8"));

try {
  console.log("SECRETS — kept apart, read as one");
  ok("secrets.json sits beside config.json", SECRETS_PATH === join(CFG, "secrets.json") && CONFIG_PATH === join(CFG, "config.json"), SECRETS_PATH);
  saveConfig({ appToken: "tok123", apiKey: "sk-ant-legacy", provider: "openai", openai: { apiKey: "sk-openai", model: "gpt-x" }, agentCmd: "claude -p", parked: ["/a"] });
  const pub = raw(CONFIG_PATH), sec = raw(SECRETS_PATH);
  ok("config.json keeps the settings, and no key or token", pub.agentCmd === "claude -p" && pub.openai.model === "gpt-x" && !("appToken" in pub) && !("apiKey" in pub) && !("apiKey" in pub.openai), pub);
  ok("secrets.json has the keys and the token", sec.appToken === "tok123" && sec.apiKey === "sk-ant-legacy" && sec.openai.apiKey === "sk-openai" && !sec.agentCmd, sec);
  if (process.platform !== "win32") ok("only you can read it (0600)", (statSync(SECRETS_PATH).mode & 0o777) === 0o600, (statSync(SECRETS_PATH).mode & 0o777).toString(8));
  const c = loadConfig();
  ok("loadConfig gives them back as one, as before", c.appToken === "tok123" && c.apiKey === "sk-ant-legacy" && c.openai.apiKey === "sk-openai" && c.openai.model === "gpt-x" && c.agentCmd === "claude -p", c);
  delete c.apiKey; delete c.openai; saveConfig(c);
  ok("a key you remove is gone from both", !("apiKey" in raw(SECRETS_PATH)) && !raw(SECRETS_PATH).openai && !("apiKey" in loadConfig()) && loadConfig().appToken === "tok123", raw(SECRETS_PATH));

  console.log("SECRETS — a config.json from before");
  rmSync(SECRETS_PATH);
  writeFileSync(CONFIG_PATH, JSON.stringify({ appToken: "old-tok", anthropic: { apiKey: "sk-old", model: "m" }, agentCmd: "x" }));
  ok("still reads", loadConfig().appToken === "old-tok" && loadConfig().anthropic.apiKey === "sk-old", loadConfig());
  ok("moveSecrets moves its keys out", moveSecrets() === true && !("appToken" in raw(CONFIG_PATH)) && !("apiKey" in raw(CONFIG_PATH).anthropic) && raw(SECRETS_PATH).appToken === "old-tok" && raw(SECRETS_PATH).anthropic.apiKey === "sk-old", [raw(CONFIG_PATH), raw(SECRETS_PATH)]);
  ok("…once: with nothing left to move it does nothing", moveSecrets() === false && loadConfig().appToken === "old-tok" && loadConfig().anthropic.model === "m", loadConfig());
  writeFileSync(CONFIG_PATH, JSON.stringify({ ...raw(CONFIG_PATH), appToken: "newer-tok" })); // an older Symbiot wrote one back
  ok("one an older Symbiot wrote into config.json wins (it's newer)", loadConfig().appToken === "newer-tok", loadConfig());

  console.log("SECRETS — the membrane refuses it; config.json stays readable");
  const s = join(CFG, "secrets.json"), opts = { cwd: join(HOME, "repo"), home: HOME, branch: "x" };
  ok("Read of secrets.json is blocked", !!judge("Read", { file_path: s }, opts), "");
  ok("cat, grep and base64 of it are blocked", ["cat ~/.config/symbiot/secrets.json", "grep -r appToken " + s, "base64 $HOME/.config/symbiot/secrets.json"].every((cmd) => judge("Bash", { command: cmd }, opts)), "");
  ok("writing it is blocked", !!judge("Write", { file_path: s, content: "{}" }, opts) && !!judge("Bash", { command: "echo {} > ~/.config/symbiot/secrets.json" }, opts), "");
  ok("reading config.json (its settings, no keys now) is fine", !judge("Read", { file_path: join(CFG, "config.json") }, opts) && !judge("Bash", { command: "cat ~/.config/symbiot/config.json" }, opts), "");
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} secrets: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
