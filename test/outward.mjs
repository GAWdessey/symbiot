// Release notes are for anyone who installs Symbiot: they never name the maker's lanes,
// people, accounts, providers, run ids or task wording. The 0.66.6 notes (16 Oct 2026)
// went out in the tasks' own words and every update panel showed them.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-outward-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "projects")] }));
const o = await import("../outward.mjs");
const t = await import("../tasks.mjs");
const w = await import("../writeups.mjs");

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };

// what a maker's Symbiot knows: lanes, memory, the providers their lanes hold keys for, servers
const nodes = [
  { kind: "person", name: "Garth's phone" }, { kind: "person", name: "Jono on WhatsApp" },
  { kind: "account", name: "SMSPortal account" }, { kind: "site", name: "Twilio login in Symbiot's browser" },
  { kind: "site", name: "cp.smsportal.com" }, { kind: "site", name: "symbiot.co.za" }, { kind: "project", name: "Dailify" },
  { kind: "project", name: "First Step" }, { kind: "thing", name: "Sandboxed repo runs and devices" },
  { kind: "account", name: "Gmail connector account" }, { kind: "preference", name: "Symbiot Home orbs" },
];
const deny = o.denyTerms({ self: "symbiot", lanes: ["dailify", "gosolr", "voxi_agent", "symbiot-mobile"], nodes, providers: ["PAYSTACK", "SMS", "RESEND"], hosts: ["sts-prod"] });
const terms = deny.map((d) => d.term.toLowerCase());
try {
  console.log("THE DENY LIST — what's yours alone, from your lanes, memory, keys and servers");
  ok("your lanes, people, accounts, sites, projects, providers and servers", ["dailify", "gosolr", "voxi_agent", "garth", "jono", "smsportal", "twilio", "paystack", "sts-prod", "first step"].every((x) => terms.includes(x)), terms);
  ok("not the product's own (symbiot-mobile, symbiot.co.za), the platforms it works with (Gmail, WhatsApp), English, a preference or a word-like key prefix", !["symbiot", "symbiot-mobile", "symbiot.co.za", "gmail", "whatsapp", "sandboxed", "account", "home", "orbs", "sms", "resend"].some((x) => terms.includes(x)), terms);

  console.log("THE 0.66.6 NOTES — every line of them is caught");
  const old = [
    "Meta part, by the dailify lane itself: still waits on 0.66.4. npm and the installed app are on 0.66.3; the release run's copy (symbiot-825733) has 0.66.4 ready",
    "Twilio part of the test (d): done by ops, by the API (run act-2ae1923d, read only, 12:41 on 16 Oct).",
    "Find out why SMS Portal's sign-in keeps dropping out of Symbiot's browser.",
    "Deploy the new Symbiot release (Garth asked, Fri 16 Oct 2026).",
    "Fix a Symbiot flaw: project lane agents can't use Garth's connections, and handovers to ops keep erroring, so jobs stall or bounce.",
  ];
  const p = o.publicItems(old, deny);
  ok("with your list: none of them goes out", p.kept.length === 0 && p.dropped.length === 5, p);
  ok("...and each says why: a lane, a run id, a provider (written apart, \"SMS Portal\"), a dated ask, a person", /dailify/.test(p.dropped[0].why + p.dropped[0].text) && /act-2ae1923d/.test(o.leaksIn(old[1]).map((x) => x.term).join()) && o.leaksIn(old[2], deny).some((x) => x.term === "SMSPortal") && /Fri 16 Oct/.test(o.leaksIn(old[3]).map((x) => x.term).join()) && o.leaksIn(old[4], deny).some((x) => x.term === "Garth"), p.dropped);
  ok("with no list (CI): a run id, a run's copy, a dated ask and who asked still are", o.leaksIn(old[0]).length && o.leaksIn(old[1]).length && o.leaksIn(old[3]).length && o.leaksIn("Sent the invite to garth@example.com").length && o.leaksIn("Fixed the relay on 13.51.104.186").length, "");
  ok("not a change to the app: deploying it, finding out why, another lane's part of a test", o.internalOnly(old[2]) && o.internalOnly(old[3]) && o.internalOnly("- Publish 0.66.7") && !o.internalOnly("Fixed sign-ins dropping out of the built-in browser."), "");

  console.log("WHAT MAY GO OUT — generic notes pass");
  const good = ["Lane agents can now use all your linked connections.", "Sign-ins in the built-in browser hold better.", "Fixed handovers to ops stopping with \"4 handovers in a row\".",
    "Answering a card while Approve is busy now waits for it, rather than saying \"Check your agent\".", "Home asked git less often, so the app no longer stalls.", "A handover to a mistyped lane goes to the nearest lane.", "Gmail and WhatsApp drafts open in the Symbiot Browser."];
  ok("none of them is held back", good.every((g) => !o.leaksIn(g, deny).length && !o.internalOnly(g)), good.map((g) => o.leaksIn(g, deny)));

  console.log("SYMBIOT'S OWN CHANGELOG — what anyone can see in it (the check CI runs before it publishes)");
  // and, in CI, the names the repo's SYMBIOT_PRIVATE_TERMS secret holds (comma-separated), which the public repo can't
  const priv = String(process.env.SYMBIOT_PRIVATE_TERMS || "").split(",").map((x) => x.trim()).filter(Boolean).map((term) => ({ term, why: "a private name" }));
  const own = o.checkChangelog(readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"), priv);
  ok(`no release in CHANGELOG.md names a run, a run's copy, an email, an address, a dated ask or a lane${priv.length ? `, nor any of the ${priv.length} private names` : ""}`, !own.length, own);
  ok("...and the check finds one when it's there", o.checkChangelog("# Changelog\n\n## 1.0.1 — 2026-10-16\n\n- Twilio part of the test: done by ops (run act-2ae1923d).\n\n## 1.0.0\n\n- Fine.\n").length === 1, "");

  console.log("APPROVE — a bump's changelog takes only what may go out, and says what it left out");
  const repo = join(HOME, "projects", "rel"); mkdirSync(repo, { recursive: true });
  const env = { cwd: repo, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } };
  execSync(`git init -q -b main && git config user.email t@x.co && git config user.name T && printf '{"name":"x","version":"1.0.0"}\\n' > package.json && printf '# Changelog\\n\\nIntro.\\n\\n## 1.0.0 — 2026-01-01\\n\\n- First release\\n' > CHANGELOG.md && git add . && git commit -qm init && git tag v1.0.0`, env);
  writeFileSync(join(repo, "a.js"), "x\n");
  const r = await t.shipWithBump(repo, old.slice(1, 4).concat(["Lane agents can use every linked connection now. They couldn't before."]), { push: false, bump: "patch", deny });
  const log = execSync("git show HEAD:CHANGELOG.md", env);
  ok("in the tasks' own words (no AI): only the clean one", r.ok && r.bumped === "1.0.1" && /## 1\.0\.1 — [\d-]+\n\n- Lane agents can use every linked connection now\.\n\n## 1\.0\.0/.test(log), [r, log.slice(0, 300)]);
  ok("...and Approve says what it left out, and why", r.notesLeftOut && r.notesLeftOut.length === 3 && /Left out of the release notes/.test(r.note || ""), r);
  execSync(`git checkout -q main && git merge -q --ff-only ${r.branch} && git tag v1.0.1`, env); writeFileSync(join(repo, "b.js"), "y\n");
  const r2 = await t.shipWithBump(repo, ["Deploy the new release (Garth asked, Fri 16 Oct 2026)."], { push: false, bump: "patch", deny, notes: [] });
  ok("nothing that changed the app: a plain line, not the task", r2.ok && /## 1\.0\.2 — [\d-]+\n\n- Small fixes and improvements\.\n/.test(execSync("git show HEAD:CHANGELOG.md", env)), r2);
  execSync(`git checkout -q main && git merge -q --ff-only ${r2.branch} && git tag v1.0.2`, env);
  const md = readFileSync(join(repo, "CHANGELOG.md"), "utf8");
  writeFileSync(join(repo, "CHANGELOG.md"), md.replace("## 1.0.2", "## 1.0.3 — 2026-10-17\n\n- Fixed the dailify invite for Jono.\n\n## 1.0.2")); writeFileSync(join(repo, "c.js"), "z\n");
  const r3 = await t.shipWithBump(repo, [], { push: false, deny, confirm: true });
  ok("a release an agent wrote by hand: Approve flags the line that names what's yours", r3.ok && /Check the release notes before this merges/.test(r3.note || "") && /dailify/.test(r3.note) && /Jono/.test(r3.note), r3);

  console.log("YOUR AI'S NOTES — written for an outside user, the internal ones skipped");
  let sys = "", asked = "";
  const ai = (reply) => async (s, p) => { sys = s; asked = p; return reply; };
  const n = await w.releaseNotes({ texts: old.slice(2, 5), files: ["agents.mjs"], diff: "+ x", deny }, ai("- skip\n- skip\n- Lane agents can now use all your linked connections."));
  ok("skipped tasks stay out; the prompt says who reads them and what's private", JSON.stringify(n) === '["Lane agents can now use all your linked connections."]' && /outside user/.test(sys) && /private to the maker[\s\S]*dailify/.test(asked) && /"- skip"/.test(asked), [n, asked.slice(-300)]);
  ok("all skipped: [] (nothing in them changed the app), not the tasks' words", JSON.stringify(await w.releaseNotes({ texts: old.slice(2, 4), files: [], diff: "" }, ai("- skip\n- skip"))) === "[]", "");
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
