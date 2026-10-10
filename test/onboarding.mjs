// Setup (home.mjs onboarding) and what makes a first run quick: your projects found
// once and kept (scan.mjs refreshRepos), never searched again on each Home refresh;
// and the icon in your look (desktop.mjs). Isolated HOME (set before the modules load).
//
//   node test/onboarding.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import net from "node:net";

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
  ok("started (a new install, or Run setup again): pending, at the welcome", o.pending && o.step === "welcome" && ONB_STEPS.join() === "welcome,ai,work,agent,apps,docs,phone,done" && o.steps.join() === ONB_STEPS.join(), [o.pending, o.step, o.steps]);
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
  console.log("SETUP — your phone: an optional step on a computer, Your computer first in the phone's app");
  o = setOnboarding({ step: "phone" });
  ok("on a computer, Your phone comes after your documents: the link off until you say yes", o.step === "phone" && o.steps.indexOf("phone") === o.steps.indexOf("docs") + 1 && o.phone && o.phone.role === "computer" && o.phone.on === false && !o.phone.qr, o.phone);
  const { setPhoneLink, stopPhoneLink } = await import("../phone.mjs");
  const free = await new Promise((r) => { const sv = net.createServer().listen(0, "127.0.0.1", () => { const pt = sv.address().port; sv.close(() => r(pt)); }); });
  const c0 = JSON.parse(readFileSync(join(CFG, "config.json"), "utf8")); c0.phoneLink = { port: free }; writeFileSync(join(CFG, "config.json"), JSON.stringify(c0));
  await setPhoneLink(true); o = onboarding();
  ok("…\"Show the code\" switches it on: the step has the QR, its code and this computer's address", o.phone.on && o.phone.listening && /^\d{6}$/.test(o.phone.code) && /^<svg/.test(o.phone.qr) && /symbiot\.co\.za\/pair#/.test(o.phone.link), { ...o.phone, qr: (o.phone.qr || "").slice(0, 20) });
  stopPhoneLink();
  o = setOnboarding({ step: "done" });
  ok("…\"I don't have the app\" goes on to the end, the phone left unpaired", o.step === "done" && o.phone.phones.length === 0, o.step);
  const { firstSteps } = await import("../home.mjs");
  const fsPhone = firstSteps({ deps: { connected: () => true, repos: () => ({}), cmd: () => "", links: () => ({ items: [] }), connectors: () => ({}), knowledge: () => ({ folders: [] }) } }).steps.find((x) => x.id === "phone");
  const fsPaired = firstSteps({ deps: { phone: () => ({ phones: [{ name: "Pixel" }] }), connected: () => true, repos: () => ({}), cmd: () => "", links: () => ({ items: [] }), connectors: () => ({}), knowledge: () => ({ folders: [] }) } }).steps.find((x) => x.id === "phone");
  ok("Settings' first steps have Your phone too (optional), for whoever finished setup before", fsPhone && fsPhone.optional && !fsPhone.done && fsPaired.done && /Pixel paired/.test(fsPaired.sub), [fsPhone, fsPaired]);
  const droid = execSync(`${JSON.stringify(process.execPath)} --input-type=module -e 'const h = await import(${JSON.stringify(join(dirname(fileURLToPath(import.meta.url)), "..", "home.mjs"))}); const c = await import(${JSON.stringify(join(dirname(fileURLToPath(import.meta.url)), "..", "core.mjs"))}); const cf = c.loadConfig(); delete cf.onboarding; c.saveConfig(cf); const first = h.startOnboarding().step; const a = h.setOnboarding({ restart: true }); const b = h.setOnboarding({ step: "phone" }); console.log(JSON.stringify({ first, steps: a.steps, step: a.step, phone: a.phone, after: b.step }));'`, { env: { ...process.env, HOME, USERPROFILE: HOME, SYMBIOT_ANDROID_APP: "1" }, encoding: "utf8" });
  const dj = JSON.parse(droid.trim().split("\n").pop());
  ok("in the phone's app, Setup starts at Your computer, a new install's too (and has no Your phone step)", dj.steps.join() === "computer,welcome,done" && !dj.steps.includes("ai") && dj.step === "computer" && dj.first === "computer" && dj.phone.role === "phone" && dj.phone.paired === false && dj.after === "computer", dj);
  // the phone app installed over an older one: its setup had started at "Meet Symbiot"
  const { phoneSetupFirst } = await import("../home.mjs");
  const { loadConfig: lc, saveConfig: sc } = await import("../core.mjs");
  const setOnb = (x) => { const c = lc(); c.onboarding = x; sc(c); };
  setOnb({ pending: true, step: "welcome", skipped: [] });
  let pf = phoneSetupFirst({ app: true, paired: () => false });
  ok("the phone app over an older one: its unfinished setup goes to Your computer, not on to Claude Code", pf.step === "computer" && pf.computer === true, pf);
  setOnb({ ...lc().onboarding, step: "welcome" });
  ok("…once: chose No computer, it stays on Meet Symbiot", phoneSetupFirst({ app: true, paired: () => false }).step === "welcome");
  setOnb({ pending: true, step: "computer", skipped: [], computer: true });
  ok("a phone already paired keeps its step", phoneSetupFirst({ app: true, paired: () => true }).step === "computer");
  setOnb({ pending: false, step: "done", skipped: [] });
  ok("a finished setup isn't reopened", phoneSetupFirst({ app: true, paired: () => false }).pending === false);
  setOnb({ pending: true, step: "welcome", skipped: [] });
  ok("on a computer: nothing changes", phoneSetupFirst({ app: false }) === null && lc().onboarding.step === "welcome");
  setOnboarding({ restart: true });
  o = setOnboarding({ done: true });
  ok("done: Home is yours", o.pending === false && JSON.parse(readFileSync(join(CFG, "config.json"), "utf8")).onboarding.done > 0, o.pending);
  ok("a Symbiot that finished setup isn't sent through it again (the new step doesn't reopen it)", onboarding().pending === false, onboarding().pending);

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
