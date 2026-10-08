// Setup (home.mjs onboarding) and what makes a first run quick: your projects found
// once and kept (scan.mjs refreshRepos), never searched again on each Home refresh;
// and the icon in your look (desktop.mjs). Isolated HOME (set before the modules load).
//
//   node test/onboarding.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-onb-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")] }));
const fake = join(HOME, "fake-claude");
writeFileSync(fake, '#!/usr/bin/env node\nif (process.argv[2] === "auth") console.log(JSON.stringify({ loggedIn: true, authMethod: "claude.ai" }));\n'); chmodSync(fake, 0o755);
process.env.SYMBIOT_CLAUDE_CMD = fake;
const repo = (n) => { const d = join(HOME, "work", n); mkdirSync(d, { recursive: true }); execSync(`git init -q && echo x > a && git add . && git -c user.email=a@b -c user.name=a commit -q -m init`, { cwd: d }); };
repo("alpha"); repo("beta");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

try {
  const scan = await import("../scan.mjs");
  const { onboarding, setOnboarding, ONB_STEPS } = await import("../home.mjs");
  const { iconSvg } = await import("../desktop.mjs");

  console.log("YOUR PROJECTS — found once and kept, in the app");
  scan.setScanOptions({ cache: true });
  ok("before the first search ends: nothing yet, rather than a wait", Array.isArray(scan.findAllRepos()) && scan.reposState().searching, scan.reposState());
  const list = await scan.refreshRepos();
  ok("the search (a worker thread) finds them, and the app keeps them", list.map((r) => r.name).sort().join() === "alpha,beta" && scan.findAllRepos().length === 2 && !scan.reposState().searching, list);
  ok("…saved for the next start (repos.json)", JSON.parse(readFileSync(join(CFG, "repos.json"), "utf8")).list.length === 2, "");
  repo("gamma");
  ok("a Home refresh doesn't search again (the kept list, at once)", scan.findAllRepos().length === 2, scan.findAllRepos().map((r) => r.name));
  scan.addScanRoot(join(HOME, "work"));
  await scan.refreshRepos();
  ok("…your folders change: it searches again, and finds the new one", scan.findAllRepos().map((r) => r.name).sort().join() === "alpha,beta,gamma", scan.findAllRepos().map((r) => r.name));
  scan.setScanOptions({ cache: false });
  ok("the CLI still searches each time", scan.findAllRepos().length === 3, "");
  scan.setScanOptions({ cache: true });

  console.log("SETUP — the steps, where you are, every app decided");
  ok("a Symbiot that ran before setup existed isn't sent through it", onboarding().pending === false, onboarding().pending);
  let o = setOnboarding({ restart: true });
  ok("started (a new install, or Run setup again): pending, at the welcome", o.pending && o.step === "welcome" && ONB_STEPS.join() === "welcome,ai,work,agent,apps,docs,done", [o.pending, o.step]);
  ok("…your AI: the Claude subscription when Claude Code is signed in", o.ai.connected && o.ai.provider === "claude", o.ai);
  ok("…your work: what it found, and where it looks (your home as ~)", o.work.count === 3 && o.work.roots.some((r) => r === "~/work"), o.work);
  ok("…every app listed, none decided yet", o.apps.length > 10 && o.apps.every((a) => a.state === "off" && !a.skipped) && o.decided === false, o.apps.length);
  o = setOnboarding({ step: "apps" });
  ok("where you are is kept (closing it resumes there)", onboarding().step === "apps", onboarding().step);
  o = setOnboarding({ skip: "gmail" });
  ok("\"I don't use it\": that app is decided", o.apps.find((a) => a.id === "gmail").skipped && !o.decided, "");
  o = setOnboarding({ unskip: "gmail" });
  ok("…undo", !o.apps.find((a) => a.id === "gmail").skipped, "");
  o = setOnboarding({ skipRest: true });
  ok("\"I don't use the rest\": all decided, so you can go on", o.decided && o.apps.every((a) => a.skipped), o.decided);
  o = setOnboarding({ step: "nowhere" });
  ok("a step that isn't one: ignored", o.step === "apps", o.step);
  o = setOnboarding({ done: true });
  ok("done: Home is yours", o.pending === false && JSON.parse(readFileSync(join(CFG, "config.json"), "utf8")).onboarding.done > 0, o.pending);

  console.log("THE ICON — in your look");
  const f = iconSvg("ferro"), g = iconSvg("glass"), p = iconSvg("pearl");
  ok("Ferrofluid is the dark orb", /#1B1D22/.test(f) && /#08090B/.test(f), "");
  ok("Glass and Pearl are light, each its own", /#F4F7FB/.test(g) && /#F7F4EE/.test(p) && g !== p && !/#1B1D22/.test(g), "");
  ok("a look it doesn't know: the dark orb", iconSvg("neon") === f, "");
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} onboarding: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
