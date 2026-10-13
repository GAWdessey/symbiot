// symbiot — A Symbiot with made-up work in it, to show: Acme, a company that doesn't
// exist, its six repos with a few weeks of git, four agents each asking a question
// with two answers, tasks, what arrived in its inbox, GitHub, WhatsApp and LinkedIn,
// its week written up, and a Marketing draft. Nothing in it is anyone's real work, so
// it can be captured and posted. `symbiot capture Symbiot` (capture.mjs) starts one in
// a throwaway home, captures it and stops it, instead of your own app with your work in
// it. Ported from the marketing lane's seed.py, which made the first tray (9 October).
//
// seedDemo(home): fills that home. startDemo(): a throwaway home, seeded, and Symbiot
// started in it as a sandbox (sandbox.mjs: no AI keys of yours, its own port, never an
// update), no window: { url, stop } or { error }. stop() quits it and deletes the home.
import { join } from "node:path";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { sandboxEnv } from "./sandbox.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const VERSION = (() => { try { return JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).version; } catch { return ""; } })();
const DAY = 86400000;
const REPOS = {
  storefront: ["# Storefront\nAcme's web shop: product pages, cart and checkout.\n", "ts", ["Add guest checkout", "Cache product images at the edge", "Fix cart total rounding on discounts", "Move checkout to the new payments page", "Tidy the product grid on small screens", "Release 2.4.0"]],
  "billing-api": ["# Billing API\nInvoices, subscriptions and payment webhooks for Acme.\n", "py", ["Retry failed webhooks with backoff", "Add proration for mid-cycle upgrades", "Invoice PDFs in the customer's currency", "Release 1.9.0"]],
  "mobile-app": ["# Acme Mobile\nThe iOS and Android app.\n", "kt", ["Push notifications for order updates", "Dark mode on every screen", "Offline basket", "Fix login loop on Android 15"]],
  "docs-site": ["# Docs\nAcme's public docs.\n", "md", ["Getting started in five minutes", "API reference from the OpenAPI spec", "Search across every page"]],
  "data-pipeline": ["# Data pipeline\nNightly sales and stock reports.\n", "py", ["Load stock levels hourly", "Weekly sales report to the team", "Drop the old CSV export"]],
  "design-system": ["# Design system\nAcme's shared components.\n", "tsx", ["Button and input tokens", "Accessible colour contrast", "Date picker"]],
};
const QUESTIONS = {
  storefront: ["Send the price-change email to the 1,240 customers on the old plan?", "It's drafted and goes out in your name, so it waits for your OK.", "🤖 Agent: send it on Monday at 09:00 (recommended)", "🤖 Agent: hold it until the new pricing page is live"],
  "billing-api": ["Refund the duplicate charge on order 4471 now?", "A webhook ran twice on Tuesday, so the customer paid twice for one order.", "🤖 Agent: refund the second charge and tell the customer (recommended)", "🤖 Agent: refund it, and add a guard so it can't happen again"],
  "mobile-app": ["Which release goes to the App Store first?", "3.2 is ready and tested; 3.3 adds the offline basket but needs another week.", "🤖 Agent: ship 3.2 today, 3.3 next week (recommended)", "🤖 Agent: wait and ship 3.3 as one release"],
  "docs-site": ["Publish the new getting-started guide?", "It's checked against the current API and every example runs.", "🤖 Agent: publish it now (recommended)", "🤖 Agent: publish it with Monday's release notes"],
};
const DONE = {
  storefront: "Apple Pay is in checkout and tested. The price-change email is drafted and waits for your OK.",
  "billing-api": "Found why order 4471 was charged twice: the webhook ran twice. The refund waits for your OK.",
  "mobile-app": "3.2 passed every test on iOS and Android and is ready to submit.",
  "docs-site": "The getting-started guide is written and every example in it runs.",
};
const TASKS = [
  ["storefront", "Add Apple Pay to checkout", false], ["storefront", "Lazy-load the reviews block on product pages", false], ["storefront", "Fix the 404 on old category links", true],
  ["billing-api", "Add a guard so one webhook can never charge twice", false], ["billing-api", "Send a receipt email on every refund", false],
  ["mobile-app", "Ship 3.2 to the App Store", false], ["mobile-app", "Fix the crash on rotate in the order screen", false],
  ["docs-site", "Add a page for the new refunds API", false], ["data-pipeline", "Alert in chat when the nightly job fails", false], ["design-system", "Publish the date picker", false],
];
const WATCH = { gmail: ["a1b2c3d4", "Inbox", "https://mail.google.com/mail/u/0/#inbox"], github: ["b2c3d4e5", "GitHub notifications", "https://github.com/notifications"], whatsapp: ["c3d4e5f6", "WhatsApp", "https://web.whatsapp.com/"], linkedin: ["d4e5f6a7", "LinkedIn", "https://www.linkedin.com/notifications/"] };
const NEWS = [
  ["github", 25, "acme/billing-api · CI failed on main: 2 tests in webhooks"], ["github", 70, "acme/storefront · Pull request #212 approved: guest checkout"], ["github", 140, "acme/mobile-app · Release 3.2 build passed"],
  ["gmail", 35, "Supplier: the new stock feed goes live on Monday"], ["gmail", 95, "Accountant: September invoices are ready to check"], ["gmail", 180, "Payments provider: your payout is on its way"],
  ["whatsapp", 50, "Design team: the new banners are in the shared folder"], ["linkedin", 120, "3 people viewed your profile"], ["linkedin", 300, "Your post on guest checkout has 41 reactions"],
];
const BRIEFS = [
  ["github", 20, 3, "billing-api's CI failed on main: 2 webhook tests. That's the one that needs you.\nThe guest checkout PR is approved and the 3.2 build passed: nothing to do."],
  ["gmail", 30, 3, "The accountant needs you to check September's invoices.\nThe stock feed and the payout are only news."],
  ["whatsapp", 45, 1, "The design team's new banners are in: nothing waits on you."],
  ["linkedin", 110, 2, "Your guest checkout post is doing well. Nothing needs a reply."],
];
const WEEK = `**Storefront** (main focus): I shipped 2.4.0 this week.
- **Checkout:** guest checkout is live, and checkout moved to the new payments page.
- **Speed:** product images are cached at the edge, and the grid is tidier on small screens.
- **Fixes:** the cart total no longer rounds wrong on discounts.

**Billing API:**
- Failed webhooks now retry with backoff, and mid-cycle upgrades are prorated.
- Invoice PDFs come in the customer's currency. Released 1.9.0.
- Still open: a webhook ran twice on Tuesday; the guard against it is next.

**Acme Mobile:**
- Order updates arrive as push notifications, and every screen has dark mode.
- The Android 15 login loop is fixed. 3.2 is ready for the App Store.

**Docs, data and design:**
- A five-minute getting-started guide and an API reference built from the spec.
- Stock levels load hourly, and the weekly sales report goes to the team.
- Buttons and inputs share tokens, with accessible contrast.
`;
const POST = `# Guest checkout is live
product: Storefront
platform: linkedin

## Post
You can now buy from Acme without making an account.

Guest checkout went live this week: pick what you want, pay with your card or Apple Pay, and you're done. No password to remember, no sign-up form in the way.

Since we turned it on, 1 in 3 orders has used it.

What's the one step you'd remove from checkout?

#Ecommerce #ProductUpdate

## Notes
From this week's storefront release (2.4.0).
`;

// The same made-up history every time: a small seeded random, not Math.random.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const writeJson = (f, o) => writeFileSync(f, JSON.stringify(o, null, 2));

function seedDemo(home, { now = Date.now() } = {}) {
  const C = join(home, ".config", "symbiot"), code = join(home, "code"), rand = rng(4), hex = (n) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join("");
  mkdirSync(C, { recursive: true });
  writeFileSync(join(home, ".gitconfig"), "[user]\n\tname = Sam Rivera\n\temail = sam@acme.example\n[init]\n\tdefaultBranch = main\n");
  const env = { ...process.env, HOME: home, GIT_CONFIG_GLOBAL: join(home, ".gitconfig"), GIT_TERMINAL_PROMPT: "0" };
  const git = (args, extra = {}) => { const r = spawnSync("git", args, { env: { ...env, ...extra }, encoding: "utf8", timeout: 20000 }); if (r.status !== 0) throw new Error(`git ${args[0]}: ${(r.stderr || r.error || "").toString().trim().split("\n").pop()}`); };
  for (const [name, [readme, ext, commits]] of Object.entries(REPOS)) {
    const d = join(code, name); if (existsSync(join(d, ".git"))) continue;
    mkdirSync(join(d, "src"), { recursive: true });
    git(["init", "-q", "-b", "main", d]);
    writeFileSync(join(d, "README.md"), readme);
    for (const f of ["index", "routes", "models", "utils"]) writeFileSync(join(d, "src", `${f}.${ext}`), `// ${f}\n`);
    commits.forEach((msg, i) => {
      const at = new Date(now - (commits.length - i) * Math.round(DAY * (0.6 + rand() * 0.5))).toISOString();
      appendFileSync(join(d, "CHANGES.md"), `- ${msg}\n`);
      git(["-C", d, "add", "-A"]); git(["-C", d, "commit", "-q", "-m", msg], { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at });
    });
  }
  // four agents, each with its question and what it said
  writeJson(join(C, "runs.json"), Object.entries(QUESTIONS).map(([name, [q, why, a, b]], i) => {
    const s = join(code, name, ".symbiot"); mkdirSync(s, { recursive: true });
    writeFileSync(join(s, "QUESTIONS.md"), `# Questions\n\n## Questions\n### ${q}\n${why}\n- ${a}\n- ${b}\n`);
    writeFileSync(join(s, "agent.log"), JSON.stringify({ type: "result", subtype: "success", result: DONE[name] }) + "\n");
    return { path: join(code, name), name, startedAt: now - (i + 1) * 3600000 };
  }));
  writeJson(join(C, "tasks.json"), TASKS.map(([repo, text, done], i) => ({ id: hex(12), text, repo, done, ts: now - (i + 2) * 7200000, ...(done ? { review: true, reviewAt: now - 3600000 } : {}) })));
  // what arrived: Watch's sources, what's new in each, and a line on each that says what needs you
  const watches = Object.values(WATCH).map(([id, name, url]) => ({ id, name, url, every: 525600, added: now - 5 * DAY, last: now, seen: [], checked: now - 600000, cleared: 0, marksUnread: false }));
  const news = NEWS.map(([w, min, text]) => ({ id: hex(8), watch: WATCH[w][0], name: WATCH[w][1], ts: now - min * 60000, text, href: WATCH[w][2] }));
  const briefs = BRIEFS.map(([w, min, count, text]) => ({ id: hex(8), watch: WATCH[w][0], name: WATCH[w][1], ts: now - min * 60000, count, text }));
  writeJson(join(C, "watch.json"), { watches, news, briefs });
  // set up already: its AI, its agent (a stand-in that does nothing: no agent of yours runs on Acme), its folders, its links
  writeJson(join(C, "config.json"), { apiKey: "sk-ant-demo-not-a-real-key", agentCmd: `"${process.execPath}" -e "" "{prompt}"`, scanRoots: [code], watchBrief: true,
    linked: Object.fromEntries(Object.entries(WATCH).map(([k, [id]]) => [k, { at: now - 5 * DAY, watch: id, hosts: k === "linkedin" ? ["linkedin.com"] : [] }])),
    seenVersion: VERSION, lastSeenVersion: VERSION, onboarding: { pending: false, step: "done", skipped: [], done: now - 5 * DAY } });
  mkdirSync(join(C, "weeks"), { recursive: true });
  writeFileSync(join(C, "weeks", `${new Date(now).toISOString().slice(0, 10)}.md`), WEEK);
  // Marketing: a lane of its own, with a post waiting for your OK
  const MK = join(C, "marketing"); mkdirSync(join(MK, "drafts", "storefront"), { recursive: true });
  writeFileSync(join(MK, "README.md"), "# Marketing\n"); writeFileSync(join(MK, ".gitignore"), ".symbiot/\n");
  git(["init", "-q", "-b", "main", MK]); git(["-C", MK, "add", "-A"]); git(["-C", MK, "commit", "-qm", "Marketing: a lane of its own"]);
  writeFileSync(join(MK, "drafts", "storefront", "guest-checkout.md"), POST);
  return { home, code };
}

const freePort = () => new Promise((r) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); s.on("error", () => r(0)); });
// The names it shows, for a capture to blur the way it would anyone's (none of them is real).
const DEMO_NAMES = ["Sam Rivera"];
async function startDemo({ bin = join(HERE, "index.mjs"), wait = 30000, now = Date.now() } = {}) {
  let home = "";
  try { home = realpathSync(mkdtempSync(join(tmpdir(), "symbiot-demo-"))); seedDemo(home, { now }); }
  catch (e) { if (home) rmSync(home, { recursive: true, force: true }); return { error: `Couldn't make the made-up Symbiot to capture: ${(e && e.message) || e}` }; }
  const port = await freePort();
  const app = spawn(process.execPath, [bin, "app"], { env: { ...sandboxEnv(home, process.env, port || 7381), SYMBIOT_NO_OPEN: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", gone = false; app.on("exit", () => { gone = true; });
  const stop = async () => {
    if (!gone) { app.kill("SIGTERM"); for (let i = 0; i < 40 && !gone; i++) await new Promise((r) => setTimeout(r, 100)); if (!gone) app.kill("SIGKILL"); }
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  const url = await new Promise((done) => {
    const look = (d) => { out = (out + d).slice(-20000); const m = out.replace(/\x1b\[[0-9;]*m/g, "").match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[\w-]+/); if (m) done(m[0]); };
    app.stdout.on("data", look); app.stderr.on("data", (d) => { out = (out + d).slice(-20000); });
    app.on("exit", () => done("")); setTimeout(() => done(""), wait);
  });
  if (!url) { await stop(); return { error: `The made-up Symbiot didn't start: ${out.trim().split("\n").pop() || "no address within " + wait / 1000 + " s"}` }; }
  return { url, home, stop };
}

export { seedDemo, startDemo, DEMO_NAMES, REPOS as DEMO_REPOS };
