// Release notes are for anyone who installs Symbiot: they never name the maker's lanes,
// people, accounts, providers, run ids or task wording. The 0.66.6 notes (16 Oct 2026)
// went out in the tasks' own words and every update panel showed them.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
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
  { kind: "person", name: "Pat's phone" }, { kind: "person", name: "Remy on WhatsApp" },
  { kind: "account", name: "SMSPortal account" }, { kind: "site", name: "Twilio login in Symbiot's browser" },
  { kind: "site", name: "cp.smsportal.com" }, { kind: "site", name: "symbiot.co.za" }, { kind: "project", name: "Bookly" },
  { kind: "project", name: "North Star" }, { kind: "thing", name: "Sandboxed repo runs and devices" },
  { kind: "account", name: "Gmail connector account" }, { kind: "preference", name: "Symbiot Home orbs" },
];
const deny = o.denyTerms({ self: "symbiot", lanes: ["bookly", "sunco", "vocal_agent", "symbiot-mobile"], nodes, providers: ["PAYSTACK", "SMS", "RESEND"], hosts: ["prod-box"] });
const terms = deny.map((d) => d.term.toLowerCase());
try {
  console.log("THE DENY LIST — what's yours alone, from your lanes, memory, keys and servers");
  ok("your lanes, people, accounts, sites, projects, providers and servers", ["bookly", "sunco", "vocal_agent", "pat", "remy", "smsportal", "twilio", "paystack", "prod-box", "north star"].every((x) => terms.includes(x)), terms);
  ok("not the product's own (symbiot-mobile, symbiot.co.za), the platforms it works with (Gmail, WhatsApp), English, a preference or a word-like key prefix", !["symbiot", "symbiot-mobile", "symbiot.co.za", "gmail", "whatsapp", "sandboxed", "account", "home", "orbs", "sms", "resend"].some((x) => terms.includes(x)), terms);
  // the README is a short newcomer's page now: the full guide's words count as English too
  const guideOnly = o.nodeTerms({ kind: "thing", name: "Knowledge folders index" });
  ok("a word only the full guide uses (knowledge) is English, not yours", !guideOnly.includes("Knowledge"), guideOnly);

  console.log("THE 0.66.6 NOTES — every line of them is caught");
  const old = [
    "Meta part, by the bookly lane itself: still waits on 0.66.4. npm and the installed app are on 0.66.3; the release run's copy (symbiot-825733) has 0.66.4 ready",
    "Twilio part of the test (d): done by ops, by the API (run act-2ae1923d, read only, 12:41 on 16 Oct).",
    "Find out why SMS Portal's sign-in keeps dropping out of Symbiot's browser.",
    "Deploy the new Symbiot release (Pat asked, Fri 16 Oct 2026).",
    "Fix a Symbiot flaw: project lane agents can't use Pat's connections, and handovers to ops keep erroring, so jobs stall or bounce.",
  ];
  const p = o.publicItems(old, deny);
  ok("with your list: none of them goes out", p.kept.length === 0 && p.dropped.length === 5, p);
  ok("...and each says why: a lane, a run id, a provider (written apart, \"SMS Portal\"), a dated ask, a person", /bookly/.test(p.dropped[0].why + p.dropped[0].text) && /act-2ae1923d/.test(o.leaksIn(old[1]).map((x) => x.term).join()) && o.leaksIn(old[2], deny).some((x) => x.term === "SMSPortal") && /Fri 16 Oct/.test(o.leaksIn(old[3]).map((x) => x.term).join()) && o.leaksIn(old[4], deny).some((x) => x.term === "Pat"), p.dropped);
  ok("with no list (CI): a run id, a run's copy, a dated ask and who asked still are", o.leaksIn(old[0]).length && o.leaksIn(old[1]).length && o.leaksIn(old[3]).length && o.leaksIn("Sent the invite to pat@example.com").length && o.leaksIn("Fixed the relay on 10.20.30.40").length, "");
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

  console.log("EVERY FILE IN THE REPO — the code, tests and docs are public too (GitHub and npm), not only the notes");
  // 21 Oct 2026: the notes were checked and the code wasn't. Comments and test fixtures named the
  // maker's people, clients, servers and personal addresses in every published version. Each tracked
  // file is checked for the names the SYMBIOT_PRIVATE_NAMES secret holds (comma-separated: people,
  // clients, servers, addresses), and anywhere for a personal mail address that isn't a placeholder.
  // The author credit ("<first> <last>" in LICENSE and package.json) is the one place a name belongs.
  {
    const { execSync } = await import("node:child_process"), root = new URL("..", import.meta.url).pathname;
    const files = execSync("git ls-files", { cwd: root, encoding: "utf8" }).split("\n").filter((f) => f && !/^(LICENSE|site\/|fonts\/|icons\/)|\.(png|ico|jpg|jpeg|gif|webp|woff2?|ttf|apk|jar|keystore)$|package-lock\.json$/.test(f));
    const names = String(process.env.SYMBIOT_PRIVATE_NAMES || "").split(",").map((x) => x.trim()).filter(Boolean);
    const author = (() => { try { return String(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).author || "").replace(/\s*<.*$/, "").trim(); } catch { return ""; } })();
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), rx = names.length ? new RegExp(`(?<![A-Za-z0-9])(?:${names.map(esc).join("|")})(?![A-Za-z0-9])`, "i") : null;
    const PLACEHOLDER = /^(me|a|b|x|you|them|owner|user|someone|test|example|name|pat|sam|remy|dana|alex)$/i, MAIL = /\b([A-Za-z0-9._%+-]+)@(gmail|googlemail|outlook|hotmail|yahoo|icloud|live)\.com\b/gi;
    const found = [];
    for (const f of files) {
      let t = ""; try { t = readFileSync(join(root, f), "utf8"); } catch { continue; }
      const lines = t.split("\n");
      for (let i = 0; i < lines.length && found.length < 20; i++) {
        const l = author ? lines[i].split(author).join("") : lines[i];
        const m = rx && l.match(rx); if (m) found.push(`${f}:${i + 1}: "${m[0]}"`);
        for (const e of l.matchAll(MAIL)) if (!PLACEHOLDER.test(e[1])) found.push(`${f}:${i + 1}: ${e[0]}`);
      }
    }
    ok(`no tracked file names a personal mail address${names.length ? `, nor any of the ${names.length} private names` : ""} (${files.length} files)`, !found.length, found);
  }

  // 23 Oct 2026: the names were checked, but not the addresses. Test fixtures held this computer's own
  // home-network and Tailscale addresses, the phone's, and two real servers' (one in ssh's known hosts),
  // copied from real runs. CI on GitHub can't know which addresses are the maker's; this computer can.
  // So, run here: no tracked file holds an address of this computer, or of a server it has signed in to.
  {
    const { execSync, spawnSync } = await import("node:child_process"), os = await import("node:os"), root = new URL("..", import.meta.url).pathname;
    const realHome = os.userInfo().homedir, kh = join(realHome, ".ssh", "known_hosts");
    const mine = new Set(Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === "IPv4" && !a.internal).map((a) => a.address));
    const files = execSync("git ls-files", { cwd: root, encoding: "utf8" }).split("\n").filter((f) => f && !/\.(png|ico|jpg|jpeg|gif|webp|woff2?|ttf|apk|jar|keystore)$|package-lock\.json$/.test(f));
    const DOC = /^(127\.|0\.|255\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|224\.)/, seen = new Map();
    for (const f of files) { let t = ""; try { t = readFileSync(join(root, f), "utf8"); } catch { continue; } for (const m of t.matchAll(/(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d])/g)) if (!DOC.test(m[1]) && m[1].split(".").every((x) => +x < 256) && !seen.has(m[1])) seen.set(m[1], f); }
    const known = (ip) => { try { return existsSync(kh) && /\S/.test(spawnSync("ssh-keygen", ["-F", ip, "-f", kh], { encoding: "utf8", timeout: 5000 }).stdout || ""); } catch { return false; } };
    const found = [...seen].filter(([ip]) => mine.has(ip) || known(ip)).map(([ip, f]) => `${f}: an address of ${mine.has(ip) ? "this computer" : "a server this computer has signed in to"}`);
    ok(`no tracked file holds an address of this computer or of a server it has signed in to (${seen.size} addresses checked)`, !found.length, found);
  }

  console.log("A PUBLIC REPO — Approve holds a change that names what's yours, before it's pushed (23 Oct 2026)");
  {
    const diff = "diff --git a/t.mjs b/t.mjs\n--- a/t.mjs\n+++ b/t.mjs\n@@ -3,0 +4,3 @@\n+const WATCH_GRACE = 1;\n+// the bookly client asked prod-box for it, from 192.168.1.40\n+const ok = 1; // Cloudflare's DNS, 21 Oct\n";
    const added = o.addedLines(diff);
    ok("the lines a diff adds, with their file and line", added.length === 3 && added[1].file === "t.mjs" && added[1].line === 5, added);
    const hits = o.privateIn(added, [...deny, { term: "Grace", why: "a person" }], { mine: ["192.168.1.40"] });
    ok("a lane, a server and this computer's address are held; a provider, a month and a word inside an identifier aren't", hits.map((h) => h.term).sort().join() === "192.168.1.40,bookly,prod-box" && hits.every((h) => h.line === 5), hits);
    const rp = join(HOME, "projects", "pub"), bare = join(HOME, "pub.git"); mkdirSync(rp, { recursive: true });
    const e2 = { cwd: rp, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } };
    execSync(`git init -q --bare ${bare} && git init -q -b main && git config user.email t@x.co && git config user.name T && git remote add origin ${bare} && printf 'x\\n' > a.js && git add -A && git commit -qm init && git push -q origin main`, e2);
    writeFileSync(join(rp, "b.js"), "// ask the bookly team\n");
    const held = await t.shipWithBump(rp, ["Add b"], { bump: false, verify: false, pr: false, publicRepo: true, deny });
    ok("shipping it to a public repo: committed, not pushed, and it says what and where", held.privacy && held.privacy[0].term === "bookly" && /not pushed: this repo is public/.test(held.note || "") && /b\.js:1/.test(held.note || "") && !execSync(`git -C ${bare} branch --list`, e2).includes("symbiot/"), held);
    const priv = await t.shipWithBump(rp, ["Add b again"], { bump: false, verify: false, pr: false, publicRepo: false, deny });
    ok("…a private repo is the user's own: it goes", !priv.privacy && priv.pushed, priv);
  }

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
  const r2 = await t.shipWithBump(repo, ["Deploy the new release (Pat asked, Fri 16 Oct 2026)."], { push: false, bump: "patch", deny, notes: [] });
  ok("nothing that changed the app: a plain line, not the task", r2.ok && /## 1\.0\.2 — [\d-]+\n\n- Small fixes and improvements\.\n/.test(execSync("git show HEAD:CHANGELOG.md", env)), r2);
  execSync(`git checkout -q main && git merge -q --ff-only ${r2.branch} && git tag v1.0.2`, env);
  const md = readFileSync(join(repo, "CHANGELOG.md"), "utf8");
  writeFileSync(join(repo, "CHANGELOG.md"), md.replace("## 1.0.2", "## 1.0.3 — 2026-10-17\n\n- Fixed the bookly invite for Remy.\n\n## 1.0.2")); writeFileSync(join(repo, "c.js"), "z\n");
  const r3 = await t.shipWithBump(repo, [], { push: false, deny, confirm: true });
  // 20 Oct 2026 review, Q10: a flag didn't stop it; CI's outward check failed on such a line in 3 of 13 runs
  const shipped = r3.ok ? execSync(`git show ${r3.commit || "HEAD"}:CHANGELOG.md`, env) : "";
  ok("a release an agent wrote by hand: Approve takes out the line that names what's yours, and says so", r3.ok && /Taken out of the release notes/.test(r3.note || "") && /bookly/.test(r3.note) && /Remy/.test(r3.note), r3);
  ok("…the commit has the plain line in its place, once, and the rest as it was", !/Remy/.test(shipped) && /## 1\.0\.3 — 2026-10-17\n\n- Small fixes and improvements\.\n\n## 1\.0\.2/.test(shipped) && /- First release/.test(shipped) && !o.checkChangelog(shipped).length, shipped.slice(0, 300));

  console.log("YOUR AI'S NOTES — written for an outside user, the internal ones skipped");
  let sys = "", asked = "";
  const ai = (reply) => async (s, p) => { sys = s; asked = p; return reply; };
  const n = await w.releaseNotes({ texts: old.slice(2, 5), files: ["agents.mjs"], diff: "+ x", deny }, ai("- skip\n- skip\n- Lane agents can now use all your linked connections."));
  ok("skipped tasks stay out; the prompt says who reads them and what's private", JSON.stringify(n) === '["Lane agents can now use all your linked connections."]' && /outside user/.test(sys) && /private to the maker[\s\S]*bookly/.test(asked) && /"- skip"/.test(asked), [n, asked.slice(-300)]);
  ok("all skipped: [] (nothing in them changed the app), not the tasks' words", JSON.stringify(await w.releaseNotes({ texts: old.slice(2, 4), files: [], diff: "" }, ai("- skip\n- skip"))) === "[]", "");
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
