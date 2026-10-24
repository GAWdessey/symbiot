// npm run bench:cheap [-- --model qwen3:8b] [--url http://127.0.0.1:11434] [--list]
// The 31 graded cases for Symbiot's cheap one-shot jobs (summarise, lane routing, signed-in check,
// commit lines, repo lookup, the last-message read, inbox triage), run against a local ollama model
// with the settings the local tier uses (think off, temperature 0, 4096 context). Check a model swap
// here before route.mjs sends it work. A model that doesn't answer a ping is reported as NOT RUN,
// never as 0%: a past bench counted unrun models as failures and nobody noticed.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "cheap");
const data = (f) => readFileSync(join(HERE, f), "utf8");
const GREP = data("grep.txt"), READ_SYS = data("read_system.txt"), CHAT_RULE = data("chat_rule.txt");

const LANES = "ops (anything outside a repo: this computer, installing tools, accounts, cloud, GitHub, DNS, email), " +
  "marketing (posts, demo videos, launches, landing-page copy, campaigns), " +
  "or a repo by folder name: steve, argena, symbiot, GuitarHero, callforge-ai, fatform, formfit, harvestconnect, PediPigeon, gawdessey.github.io";

const jparse = (a) => { const m = /\{[\s\S]*\}/.exec(a); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };
const lines = (a) => a.split("\n").filter((l) => l.trim());

const laneCase = (i, user, gold) => ({
  task: "classify", id: `lane${i}`, user,
  system: `You route tasks to a lane. Lanes: ${LANES}. Reply with JSON only: {"lane": "<name>", "confidence": <0-1>}.`,
  check(a) { const j = jparse(a); if (!j) return [false, "no JSON"]; const got = String(j.lane ?? "").trim(); return [got.toLowerCase() === gold.toLowerCase(), `got ${JSON.stringify(got)}, want ${JSON.stringify(gold)}`]; },
});
const signinCase = (i, site, page, gold) => ({
  task: "signin", id: `signin${i}`, user: `Site: ${site}\nPage text:\n${page}`,
  system: 'You check whether a browser session is signed in, from the page\'s visible text. Reply with JSON only: {"signed_in": true|false, "reason": "<short>"}.',
  check(a) { const j = jparse(a); if (!j) return [false, "no JSON"]; return [j.signed_in === gold, `got ${JSON.stringify(j.signed_in)}, want ${gold}`]; },
});
const kwCase = (task, i, system, user, must, forbid = [], maxlen = 0) => ({
  task, id: `${task}${i}`, system, user,
  check(a) {
    const t = a.trim(), low = t.toLowerCase(), notes = [];
    const miss = must.filter((m) => !m.split("|").some((alt) => low.includes(alt.toLowerCase())));
    const bad = forbid.filter((f) => low.includes(f.toLowerCase()));
    if (miss.length) notes.push("missing " + miss.join(","));
    if (bad.length) notes.push("hallucinated " + bad.join(","));
    if (maxlen && (t.split("\n")[0] || "").length > maxlen) notes.push(`first line >${maxlen} chars`);
    if (maxlen && lines(t).length > 2) notes.push("too many lines");
    return [!notes.length, notes.join("; ") || "ok"];
  },
});
const readCase = (i, user, needs, kind) => ({
  task: "lastwords", id: `read${i}`, user, system: READ_SYS,
  check(a) {
    const j = jparse(a);
    if (!j || typeof j.needs !== "boolean") return [false, "no/invalid JSON"];
    if (j.needs !== needs) return [false, `needs=${j.needs}, want ${needs}`];
    if (needs && kind && j.kind !== kind) return [false, `kind=${j.kind}, want ${kind}`];
    return [true, "ok"];
  },
});
const TRI_SYS = "You triage what just arrived on a page someone watches: their email inbox, their chats, or their GitHub notifications. " +
  "In at most 3 short lines of plain text, first what needs them (and why, in a few words), then what can wait. {rule}" +
  "Name things by sender and subject so they can find them. Use only what's shown; never guess at what a message says beyond it. No preamble, no markdown.";
const triCase = (i, name, items, must, forbid = [], chat = false) => {
  const c = kwCase("triage", i, TRI_SYS.replace("{rule}", chat ? CHAT_RULE : ""), `New on ${name}:\n${items.map((x) => "- " + x).join("\n")}\n\nWhat needs me, and what can wait?`, must, forbid);
  const inner = c.check;
  c.check = (a) => { const [ok, note] = inner(a); return lines(a.trim()).length > 3 ? [false, (note + "; >3 lines").replace(/^ok; /, "")] : [ok, note]; };
  return c;
};

const SUM_SYS = "Summarise this email or notification for a busy person in at most 2 sentences. Keep amounts, dates and the action needed. No preamble.";
const COMMIT_SYS = "Write a one-line git commit message (imperative, max 72 characters) for this diff. Output only the message.";
const REPO_SYS = "Answer the question using only the grep output given. Name the file and line number. Be brief (1-2 sentences).";

const CASES = [
  kwCase("summarise", 1, SUM_SYS, "From: billing@hetzner.com\nSubject: Invoice R0012345678 overdue\n\nDear customer, your invoice R0012345678 for EUR 14.28 dated 2026-09-28 is now overdue. " +
    "Please pay by 2026-10-15 to avoid suspension of server CX22 (ubuntu-4gb-fsn1). You can pay in the Hetzner Console under Billing. Regards, Hetzner Online GmbH",
    ["14.28", "10-15|15 oct|october 15|oct 15|15th", "suspen|pay"], ["$14", "10-25"]),
  kwCase("summarise", 2, SUM_SYS, "GitHub notification\n[gawdessey/formfit] CI failed: build-android (#412)\nThe workflow 'build-android' failed on branch main at commit 3fa9c1e " +
    "('bump flutter to 3.38'). Step 'Gradle assemble' exited with code 1: Execution failed for task ':app:compileReleaseKotlin'.",
    ["formfit", "fail", "kotlin|gradle|compile"], ["passed", "succeeded"]),
  kwCase("summarise", 3, SUM_SYS, "From: Thandi Mokoena <thandi@harvestconnect.co.za>\nSubject: Re: pilot farms\n\nHi Garth, good news, three of the five pilot farms signed. " +
    "Ruiters and Kloof still want a call. Could you send me the onboarding deck before Thursday so I can forward it? Also the co-op asked if we can drop the price to R450/month, I said I'd check with you. Thanks, Thandi",
    ["three|3", "deck", "thursday", "450"], ["four farms", "R500"]),
  laneCase(1, "the ollama service won't start after the update, can you look at it", "ops"),
  laneCase(2, "draft a launch post for formfit on linkedin with a short demo clip", "marketing"),
  laneCase(3, "fix the failing test in symbiot's screens command, it times out on the second tab", "symbiot"),
  laneCase(4, "the note highway stutters at 120bpm when the song has a key change", "GuitarHero"),
  laneCase(5, "point gawdessey.com's DNS at the new github pages IP and check the cert", "ops"),
  laneCase(6, "add a dark mode toggle to the fatform settings screen", "fatform"),
  laneCase(7, "steve's verifier bench shows 0% for every model, find out why the calls never ran", "steve"),
  laneCase(8, "the farmers can't see their produce listings after logging in on android", "harvestconnect"),
  signinCase(1, "github.com", "Dashboard  Top repositories  Find a repository…  gawdessey/formfit  gawdessey/symbiot  Signed in as gawdessey  Your profile  Your repositories  Sign out", true),
  signinCase(2, "www.linkedin.com", "Welcome to your professional community  Email or phone  Password  Show  Forgot password?  Sign in  or  Continue with Google  New to LinkedIn? Join now", false),
  signinCase(3, "x.com", "Home  Explore  Notifications  Messages  Grok  Bookmarks  Profile  More  Post  For you  Following  What is happening?!", true),
  signinCase(4, "www.domains.co.za/client/dashboard", "Client Area  Please enter your details to log in.  Email Address  Password  Remember Me  Login  Forgotten Password?  Not registered? Create an account", false),
  signinCase(5, "accounts.google.com", "Choose an account  to continue to Gmail  Garth White garthwhite507@gmail.com  Signed out  Use another account", false),
  signinCase(6, "www.facebook.com/harvestconnect", "HarvestConnect  1.2K likes  Posts  About  Photos  See more of HarvestConnect on Facebook  Log in  or  Create new account", false),
  kwCase("commit", 1, COMMIT_SYS, '--- a/estimate.mjs\n+++ b/estimate.mjs\n@@ -17 +17 @@\n-const FILE = join(CONFIG_DIR, "durations.json"), KEEP = 400, MIN_SAMPLES = 3;\n+const FILE = join(CONFIG_DIR, "durations.json"), KEEP = 800, MIN_SAMPLES = 5;', ["keep|sample|duration"], [], 72),
  kwCase("commit", 2, COMMIT_SYS, '--- a/guard.mjs\n+++ b/guard.mjs\n@@ -21 +21 @@\n-const SECRET = [".ssh", ".gnupg", ".aws",\n+const SECRET = [".ssh", ".gnupg", ".aws", ".config/rclone",', ["rclone"], [], 72),
  kwCase("commit", 3, "Write a one-line status update (max 100 characters) saying what this agent run did. Output only the line.",
    "Run log: read TASKS.md; pulled qwen2.5-coder:7b via ollama; ran 22 benchmark cases on 4 models; wrote LOCAL-MODEL-ROUTING.md; ticked task 1.",
    ["benchmark|bench", "4 models|four models|models", "routing|report|LOCAL-MODEL"], [], 100),
  kwCase("repo", 1, REPO_SYS, `Question: where is the list of secret paths the guard protects?\n\ngrep output:\n${GREP}`, ["guard.mjs", "21"]),
  kwCase("repo", 2, REPO_SYS, `Question: how many duration samples does the estimator keep, and where is that set?\n\ngrep output:\n${GREP}`, ["400", "estimate.mjs", "17"]),
  kwCase("repo", 3, REPO_SYS, `Question: what is the maximum handover chain length, and in which file?\n\ngrep output:\n${GREP}`, ["4", "lanes.mjs", "33"], ["guard.mjs:33"]),
  readCase(1, "Done. Added the dark mode toggle in lib/settings_screen.dart and the tests pass. Changes are left uncommitted for review.", false),
  readCase(2, "Drafted the LinkedIn launch post in .symbiot/LAUNCH-POST.md. It's ready to publish once you OK it; check the demo clip link plays first.", true, "approve"),
  readCase(3, "I couldn't finish the Play Console upload: Google wants a 2FA code from your phone. Once you've signed in at play.google.com/console in the Symbiot Browser I'll carry on.", true, "step"),
  readCase(4, "Fixed the flaky screens test and committed it on branch fix/screens-timeout. Ready to push to origin when you say so.", true, "approve"),
  readCase(5, "Wrote COMPANY-AUDIT.md with the findings. One idea for later: the landing page could move to Astro.", false),
  triCase(1, "Gmail", ["Hetzner Online: Invoice R0012345678 overdue, pay EUR 14.28 by 15 Oct to avoid suspension", "Medium Daily Digest: 5 stories picked for you",
    "Thandi Mokoena: Re: pilot farms, can you send the onboarding deck before Thursday?", "LinkedIn: You appeared in 12 searches this week"], ["hetzner", "thandi", "medium|linkedin"]),
  triCase(2, "WhatsApp", ["Mom [from them, 2 unread]: are you coming on sunday? need to know for lunch", "Dev group [from you]: pushed the fix, can someone test",
    "Sipho [from them, read]: thanks bro", "Kloof Farm [from them, 1 unread]: can we do the call friday 10am?"], ["mom", "kloof"], ["sipho needs", "dev group needs"], true),
  triCase(3, "GitHub notifications", ["gawdessey/formfit: CI failed build-android #412 on main", "dependabot: Bump vite from 5.4.1 to 5.4.8 in gawdessey/symbiot",
    "octocat starred gawdessey/GuitarHero"], ["formfit", "dependabot|vite"]),
];

// One call the way the local tier makes it (ai.mjs callOllama, tuned).
async function ask(url, model, system, prompt, timeout = 120000) {
  const res = await fetch(`${url}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({ model, stream: false, think: false, keep_alive: "15m", options: { temperature: 0, num_ctx: 4096 }, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ollama ${res.status}: ${text.slice(0, 120)}`);
  return (JSON.parse(text).message?.content || "").trim();
}

// Runs every case; { ran: false, why } when the model can't be reached, so an unrun model is never a 0%.
async function bench({ url = "http://127.0.0.1:11434", model = "qwen3:8b", say = () => {} } = {}) {
  try { if (!(await ask(url, model, "Reply with one word.", "ping", 60000))) throw new Error("empty answer to the ping"); }
  catch (e) { return { ran: false, model, why: String(e.message || e) }; }
  const out = [];
  for (const c of CASES) {
    let ok = false, note = "";
    try { [ok, note] = c.check(await ask(url, model, c.system, c.user)); } catch (e) { note = "call failed: " + (e.message || e); }
    out.push({ id: c.id, task: c.task, ok, note }); say(`  ${ok ? "✓" : "✗"} ${c.id}${ok ? "" : "  " + note}`);
  }
  return { ran: true, model, passed: out.filter((r) => r.ok).length, total: out.length, results: out };
}

export { CASES, bench, ask };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
  if (process.argv.includes("--list")) { for (const c of CASES) console.log(c.id); console.log(`${CASES.length} cases`); process.exit(0); }
  const r = await bench({ url: arg("url", "http://127.0.0.1:11434"), model: arg("model", "qwen3:8b"), say: console.log });
  if (!r.ran) { console.log(`NOT RUN: ${r.model} did not answer a ping (${r.why}). This is not a score.`); process.exit(2); }
  const by = {}; for (const x of r.results) { (by[x.task] ||= [0, 0])[1]++; if (x.ok) by[x.task][0]++; }
  console.log(`\n${r.model}: ${r.passed}/${r.total}  ` + Object.entries(by).map(([k, [a, b]]) => `${k} ${a}/${b}`).join("  "));
}
