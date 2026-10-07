// Post (post.mjs): the week's real git as 3 draft LinkedIn posts in your voice,
// waiting on you; Approve copies one for you to paste, Edit and Skip, every
// action logged; never a claim git doesn't show; with no AI, nothing at all.
// Plus the replies: LinkedIn watched like an inbox, Draft a reply that can't
// post, and likely customers marked. Isolated HOME (set before the modules
// load), no AI keys; the model, the clipboard and the browser are stand-ins.
//
//   node test/post.mjs
//
import { execSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-post-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "SYMBIOT_MODEL", "SYMBIOT_DRAFT"]) delete process.env[k];
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
const INDEX = join(dirname(fileURLToPath(import.meta.url)), "..", "index.mjs");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const P = await import("../post.mjs");
const { isSend } = await import("../headless.mjs");
const { CATALOG } = await import("../links.mjs");
const W = await import("../watch.mjs");
const mode = (f) => (statSync(f).mode & 0o777).toString(8);
const today = new Date().toISOString().slice(0, 10);

// a repo with a week of real work: two commits, a release tag and a dated changelog
const REPO = join(HOME, "projects", "demo"); mkdirSync(REPO, { recursive: true });
const git = (s) => execSync(s, { cwd: REPO, shell: "/bin/bash", stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, GIT_CONFIG_GLOBAL: join(HOME, "gitconfig"), GIT_CONFIG_SYSTEM: "/dev/null" } });
writeFileSync(join(HOME, "gitconfig"), "[user]\n  name = Pat Example\n  email = pat@example.invalid\n");
writeFileSync(join(REPO, "CHANGELOG.md"), `# Changelog\n\n## 1.2.0 — ${today}\n\n### Added\n- **Weekly digest export.** Your week as one Markdown file.\n- Fixed a crash when the inbox is empty.\n\n## 1.1.0 — 2020-01-01\n\n- An old thing nobody should post about.\n`);
git(`git init -q && echo a > a && git add . && git commit -qm "Add weekly digest export" && echo b > b && git add . && git commit -qm "Fix crash when the inbox is empty" && git tag v1.2.0`);
const repos = [{ path: REPO, name: "demo" }];
const VOICE = "Shipped a thing this week. Small, but it scratches an itch I had for months. #BuildInPublic\n\n---\n\nLesson of the week: read the error message twice before you google it. Saved me an hour on Acme's import.\n";

// the model, stood in: it cites facts by their number in the prompt
const factNo = (prompt, re) => { const m = prompt.split("\n").find((l) => re.test(l)); return m ? Number(m.match(/^\[(\d+)\]/)[1]) : 0; };
const honest = async (sys, prompt) => {
  const rel = factNo(prompt, /released v1\.2\.0/), dig = factNo(prompt, /changelog: 1\.2\.0: Weekly digest/), fix = factNo(prompt, /commit: Fix crash/);
  return JSON.stringify({ posts: [
    { kind: "shipped", text: "Shipped demo v1.2.0 this week: a weekly digest export, your week as one Markdown file. #BuildInPublic", facts: [rel, dig] },
    { kind: "learned", text: "Lesson of the week: an empty inbox crashed demo. Fixed it, and now it just shows nothing new.", facts: [fix] },
    { kind: "long", text: "1/ This week demo got a weekly digest export.\n\n2/ It writes your week as one Markdown file.\n\n3/ Also fixed a crash when the inbox is empty.", facts: [dig, fix] },
  ] });
};

try {
  console.log("NO AI CONNECTED — a clear message, and nothing else happens");
  writeFileSync(join(CFG, "voice.md"), VOICE);
  const before = readdirSync(CFG).sort().join();
  const na = await P.draftPosts({ repos, gh: false });
  ok("it fails with a clear message: connect an AI with symbiot login", na.code === "not-connected" && /needs an AI/.test(na.error) && /symbiot login/.test(na.error), na);
  ok("…and writes nothing: no drafts, no log, the config folder as it was", !existsSync(P.PATHS.posts) && !existsSync(P.PATHS.log) && readdirSync(CFG).sort().join() === before, readdirSync(CFG));
  let code = 0, out = "";
  try { out = execFileSync(process.execPath, [INDEX, "post", "--plain"], { env: { ...process.env, HOME }, encoding: "utf8", timeout: 60000 }); } catch (e) { code = e.status; out = String(e.stdout || ""); }
  ok("the CLI too: symbiot post says so, exits 1, and writes nothing", code === 1 && /needs an AI/.test(out) && !existsSync(P.PATHS.posts) && !existsSync(P.PATHS.log), [code, out.slice(0, 200)]);

  console.log("VOICE — no examples, no drafting");
  writeFileSync(join(CFG, "voice.md"), "");
  let asked = 0;
  const nv = await P.draftPosts({ repos, gh: false, ask: async () => { asked++; return ""; } });
  ok("without example posts it doesn't draft, and says how to add them (Link LinkedIn, or voice.md)", nv.code === "no-voice" && /LinkedIn/.test(nv.error) && /voice\.md/.test(nv.error) && /---/.test(nv.error) && asked === 0 && !existsSync(P.PATHS.posts), nv);
  writeFileSync(join(CFG, "voice.md"), VOICE);
  ok("voice.md's examples are what's between lines of ---", P.loadVoice().length === 2 && /^Lesson of the week/.test(P.loadVoice()[1]), P.loadVoice());

  console.log("THE FACTS — real git from the last 7 days");
  const facts = P.gatherFacts({ repos, gh: false });
  const has = (re) => facts.some((f) => re.test(`${f.kind}: ${f.text}`));
  ok("the release tag, the changelog's dated section and the commits", has(/^release: released v1\.2\.0$/) && has(/^changelog: 1\.2\.0: Weekly digest export\. Your week/) && has(/^changelog: 1\.2\.0: Fixed a crash/) && has(/^commit: Add weekly digest export$/) && has(/^commit: Fix crash/), facts);
  ok("…not a changelog section from outside the week", !has(/old thing/), facts.map((f) => f.text));

  console.log("NEVER INVENT — the claim check");
  const F = facts;
  ok("an honest post passes", P.checkClaims("Shipped demo v1.2.0: a weekly digest export. #BuildInPublic", F).length === 0, P.checkClaims("Shipped demo v1.2.0: a weekly digest export. #BuildInPublic", F));
  ok("a version git doesn't show is caught", P.checkClaims("Shipped demo v2.0 this week.", F).includes("2.0"), P.checkClaims("Shipped demo v2.0 this week.", F));
  ok("a user count is caught, in digits or in words", P.checkClaims("Already 500 users love demo.", F).includes("500") && P.checkClaims("Thousands of developers use demo now.", F).length > 0, [P.checkClaims("Already 500 users love demo.", F), P.checkClaims("Thousands of developers use demo now.", F)]);
  ok("a name git doesn't show is caught (Stripe); one in your own examples isn't (Acme)", P.checkClaims("Moved billing to Stripe.", F).includes("Stripe") && P.checkClaims("Thanks again, Acme.", F, P.loadVoice()).length === 0, [P.checkClaims("Moved billing to Stripe.", F), P.checkClaims("Thanks again, Acme.", F, P.loadVoice())]);
  ok("a file or `code` git doesn't show is caught", P.checkClaims("Rewrote `billing.mjs` from scratch.", F).length > 0, P.checkClaims("Rewrote `billing.mjs` from scratch.", F));
  ok("testimonials and revenue are caught", P.checkClaims("Customers love the digest.", F).length > 0 && P.checkClaims("Our MRR doubled.", F).length > 0, "");
  ok("a thread's 1/ 2/ and a list's 1. aren't claims; neither is today's date", P.checkClaims(`1/ The digest export.\n\n2/ The crash fix.\n\n3. On ${today}.`, F).length === 0, P.checkClaims(`1/ The digest export.\n\n2/ The crash fix.\n\n3. On ${today}.`, F));

  console.log("SYMBIOT POST — 3 drafts from real git, nothing published");
  const copies = [];
  const copy = (t) => { copies.push(t); return "test-clip"; };
  let prompt = "";
  const d = await P.draftPosts({ repos, gh: false, ask: async (s, p) => { prompt = p; return honest(s, p); } });
  ok("3 drafts: Shipped, Learned / fixed, and a longer one", d.ok && d.posts.length === 3 && d.posts.map((p) => p.kind).join() === "shipped,learned,long" && d.dropped.length === 0, d);
  ok("the AI was given the numbered facts and your examples, and told they're the only claims", /\[1\] demo · /.test(prompt) && /the only things you may claim/.test(prompt) && /Lesson of the week/.test(prompt), prompt.slice(0, 300));
  ok("each draft keeps the git it rests on", d.posts.every((p) => p.sources.length && p.sources.every((s) => /^\[\d+\] demo · /.test(s))), d.posts.map((p) => p.sources));
  ok("they wait on you (the Dashboard's amber items)", P.postsState().posts.length === 3 && P.postsState().posts.every((p) => p.status === "waiting" && p.platform === "linkedin"), P.postsState().posts);
  ok("kept yours only (0600): drafts and log", mode(P.PATHS.posts) === "600" && mode(P.PATHS.log) === "600", [mode(P.PATHS.posts), mode(P.PATHS.log)]);
  ok("drafting copies nothing and posts nothing", copies.length === 0 && !/fetch\(/.test(readFileSync(new URL("../post.mjs", import.meta.url), "utf8")), copies);
  ok("each draft is logged: drafted, with its text, date and platform", P.postLog().filter((l) => l.action === "drafted").length === 3 && P.postLog().every((l) => l.text && /^\d{4}-\d{2}-\d{2}T/.test(l.date) && l.platform === "linkedin"), P.postLog());

  console.log("A DRAFT THAT CLAIMS WHAT GIT DOESN'T SHOW — sent back once, then dropped");
  let round = 0, retry = "";
  const lying = async (s, p) => {
    round++; if (round === 2) retry = p;
    const ok1 = JSON.parse(await honest(s, p)).posts;
    if (round === 1) return JSON.stringify({ posts: [{ ...ok1[0], text: "demo v2.0 is out and 500 users love it." }, { ...ok1[1], facts: [] }, ok1[2]] });
    return JSON.stringify({ posts: [{ ...ok1[0], text: "demo v2.0 is out, used by 500 teams." }, ok1[1]] });
  };
  const l = await P.draftPosts({ repos, gh: false, ask: lying });
  ok("the AI is told exactly what was wrong, and asked again for those", round === 2 && /"shipped": it claims "2\.0"/.test(retry) && /"learned": it cited no facts/.test(retry), retry.slice(-400));
  ok("still claiming it after: dropped; the fixed one and the honest one kept", l.ok && l.posts.map((p) => p.kind).join() === "learned,long" && l.dropped.length === 1 && l.dropped[0].kind === "shipped" && l.dropped[0].unsupported.includes("500"), l);
  ok("the dropped one is logged, with why", P.postLog().some((x) => x.action === "dropped" && /git doesn't show/.test(x.why)), P.postLog().slice(-3));
  ok("drafting again replaces the drafts still waiting (logged as replaced)", P.postLog().filter((x) => x.action === "replaced").length === 3 && P.postsState().posts.length === 2, P.postsState().posts.length);
  const none = await P.draftPosts({ repos, gh: false, ask: async () => JSON.stringify({ posts: [{ kind: "shipped", text: "We have 9000 users.", facts: [1] }] }) });
  ok("none git backs: an error, and the waiting drafts stay", none.code === "all-dropped" && P.postsState().posts.length === 2, none);

  console.log("APPROVE, EDIT, SKIP — they work, and each is logged");
  const [a, b] = P.postsState().posts;
  const e = P.editPost(a.id, "Fixed the crash when the inbox is empty in demo. Small fix, big relief.");
  ok("Edit changes its words; it stays waiting", e.ok && P.loadPosts().posts.find((p) => p.id === a.id).text.startsWith("Fixed the crash") && P.postsState().posts.some((p) => p.id === a.id) && !e.unsupported, e);
  ok("…and says (doesn't block) what git doesn't show", P.editPost(a.id, "Fixed the crash for Stripe users.").unsupported.includes("Stripe"), "");
  P.editPost(a.id, "Fixed the crash when the inbox is empty in demo. Small fix, big relief.");
  ok("Edit with nothing in it is refused", /new text/.test(P.editPost(a.id, "  ").error || ""), "");
  ok("nothing copied before an approval", copies.length === 0, copies);
  const ap = P.approvePost(a.id, { copy });
  ok("Approve copies that post to the clipboard, once, and gives LinkedIn's share box", ap.ok && copies.length === 1 && copies[0] === ap.post.text && ap.copied === "test-clip" && /linkedin\.com\/feed\/\?shareActive=true/.test(ap.share), ap);
  ok("…says plainly it doesn't post or schedule", /doesn't post or schedule/.test(ap.note), ap.note);
  ok("an approved post can't be approved, edited or skipped again", /approved already/.test(P.approvePost(a.id, { copy }).error) && /approved already/.test(P.editPost(a.id, "x").error) && /approved already/.test(P.skipPost(a.id).error) && copies.length === 1, "");
  ok("the app's Approve (copy: null) records it; the page copies", P.approvePost("nope", { copy: null }).error && copies.length === 1, "");
  const sk = P.skipPost(b.id);
  ok("Skip drops it from the Dashboard", sk.ok && P.postsState().posts.length === 0 && P.postsState().done.length === 2, P.postsState());
  const acts = P.postLog().map((x) => x.action);
  ok("every action is in the log: drafted, replaced, dropped, edited, approved, skipped", ["drafted", "replaced", "dropped", "edited", "approved", "skipped"].every((x) => acts.includes(x)) && P.postLog().filter((x) => x.action === "edited").some((x) => /big relief/.test(x.text)), acts);
  ok("the log only grows (append-only lines)", readFileSync(P.PATHS.log, "utf8").trim().split("\n").length === acts.length, "");
  ok("an unknown id says so", /No draft nope/.test(P.skipPost("nope").error), "");
  const cli = (...args) => { try { return { code: 0, out: execFileSync(process.execPath, [INDEX, "post", ...args, "--plain"], { env: { ...process.env, HOME }, encoding: "utf8", timeout: 60000 }) }; } catch (x) { return { code: x.status, out: String(x.stdout || "") }; } };
  const fresh = await P.draftPosts({ repos, gh: false, ask: honest });
  const [c1, c2] = fresh.posts;
  ok("symbiot post list: the drafts waiting, with their ids and the git they rest on", /Shipped/.test(cli("list").out) && cli("list").out.includes(c1.id) && /from git: /.test(cli("list").out), cli("list").out.slice(0, 300));
  const ce = cli("edit", c1.id, "Shipped demo v1.2.0: the weekly digest export.");
  ok("symbiot post edit <id> \"text\": changed and logged", ce.code === 0 && P.loadPosts().posts.find((p) => p.id === c1.id).text === "Shipped demo v1.2.0: the weekly digest export." && P.postLog().slice(-1)[0].action === "edited", ce);
  ok("symbiot post skip <id>: skipped and logged", cli("skip", c2.id).code === 0 && P.loadPosts().posts.find((p) => p.id === c2.id).status === "skipped" && P.postLog().slice(-1)[0].action === "skipped", "");
  ok("symbiot post log: every action, with its date", /skipped/.test(cli("log").out) && /edited/.test(cli("log").out) && /approved/.test(cli("log").out) && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(cli("log").out), cli("log").out.slice(-400));
  ok("a CLI id that isn't there fails, and says so", cli("approve", "nope").code === 1 && /No draft nope/.test(cli("approve", "nope").out), "");

  console.log("YOUR VOICE FROM LINKEDIN — read on your click, in Symbiot's signed-in browser");
  rmSync(P.PATHS.voice);
  const signedOut = await P.voiceFromLinkedIn({ read: async () => ({ url: "https://www.linkedin.com/authwall?x=1", texts: [] }) });
  ok("signed out: says to link LinkedIn, and writes nothing", /not signed in to LinkedIn/.test(signedOut.error) && !existsSync(P.PATHS.voice), signedOut);
  ok("busy browser: says so", /busy/.test((await P.voiceFromLinkedIn({ read: async () => ({ busy: true }) })).error), "");
  let readUrl = "";
  const long = "Two years ago I wrote my first CLI. This week it wrote my standup for me. Funny how that goes.";
  const vr = await P.voiceFromLinkedIn({ read: async (url) => { readUrl = url; return { url: "https://www.linkedin.com/in/pat/recent-activity/shares/", texts: [long + "\n…see more", long, "Like", "Shipping beats polishing. Every single time, and I keep relearning it."] }; } });
  ok("your recent posts on your activity page go into voice.md, --- between, once each", vr.ok && vr.added === 2 && /recent-activity/.test(readUrl) && P.loadVoice().length === 2 && /\n---\n/.test(readFileSync(P.PATHS.voice, "utf8")) && mode(P.PATHS.voice) === "600", [vr, P.loadVoice()]);
  ok("reading again adds only what's new", (await P.voiceFromLinkedIn({ read: async () => ({ url: "https://www.linkedin.com/in/pat/", texts: [long] }) })).added === 0, "");

  console.log("REPLIES — LinkedIn watched like an inbox; Draft a reply can't post");
  const li = CATALOG.find((x) => x.id === "linkedin");
  ok("LinkedIn is a standard Link, watched: its notifications page", li && li.watch && /linkedin\.com\/notifications/.test(li.url) && li.hosts.includes("linkedin.com") && li.group === "Social", li);
  ok("a draft's run can't press LinkedIn's Post, Comment, Reply, Send or Repost", ["Post", "Comment", "Reply", "Send", "Repost", "Reply to Sam's comment"].every((label) => isSend({ kind: "button", label }, "linkedin.com")), "");
  ok("…while Gmail's Reply (it only opens a reply) still works, and Send never does", !isSend({ kind: "button", label: "Reply" }, "mail.google.com") && isSend({ kind: "button", label: "Send" }, "mail.google.com") && !isSend({ kind: "row", label: "Sam commented on your post" }, "linkedin.com") && !isSend({ kind: "button", label: "Posts" }, "linkedin.com"), "");
  ok("likely customers: install, pricing, team use", P.maybeCustomer("How do I install this on Windows?") === "install" && P.maybeCustomer("What does it cost?") === "pricing" && P.maybeCustomer("Is there a licence for commercial use?") === "pricing" && P.maybeCustomer("Could our team use this for standups?") === "team", "");
  ok("…not praise, thanks or a congrats to the team", ["Great post!", "Congrats to the team on the launch", "Love the setup", "Thanks for sharing"].every((t) => P.maybeCustomer(t) === ""), ["Great post!", "Congrats to the team on the launch", "Love the setup"].map(P.maybeCustomer));
  const now = Date.now();
  writeFileSync(join(CFG, "watch.json"), JSON.stringify({ watches: [{ id: "w1", name: "LinkedIn", url: "https://www.linkedin.com/notifications/", every: 15, added: now, last: now, checked: now, seen: [] }],
    news: [{ id: "n1", watch: "w1", name: "LinkedIn", ts: now, text: "Sam Ng commented on your post: How much does it cost for a team of 5?", href: "https://www.linkedin.com/feed/update/urn:li:activity:1/" }, { id: "n2", watch: "w1", name: "LinkedIn", ts: now, text: "Ann Lee commented on your post: Great post!" }], briefs: [] }));
  const card = W.watchBoard(24, now).cards[0];
  ok("its card on the Dashboard: source social, counted as news", card.source === "social" && card.count === 2 && /2 LinkedIn notifications/.test(card.label), card);
  ok("each can get a drafted reply, and the one asking the price is marked maybe a customer", card.items.every((n) => n.social) && card.items.find((n) => n.id === "n1").customer === "pricing" && !card.items.find((n) => n.id === "n2").customer, card.items);
  const br = W.socialBrief(card.items[0], { name: "LinkedIn", url: "https://www.linkedin.com/notifications/" });
  ok("the agent's brief: never post it, type it unposted, write it under ## The reply", /\*\*Never post it\.\*\*/.test(br) && /can't press those anyway/.test(br) && /## The reply/.test(br) && /without `--enter`/.test(br) && /feed\/update\/urn:li:activity:1/.test(br), br.slice(0, 400));
  ok("…and with a likely customer: answer plainly, never state a price", /possible customer/.test(br) && /Never state a price/.test(br), "");
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ trustedSites: ["linkedin.com"], agentCmd: 'echo "{prompt}" > prompt.txt' }));
  const ran = [];
  const dr = W.draftReply("n1", { run: (dir, o) => { ran.push([dir, o]); return { id: "j1" }; } });
  const dir = join(CFG, "drafts", "n1");
  ok("Draft a reply on it: the run gets the LinkedIn brief and SYMBIOT_DRAFT (no Post, no Send)", dr.ok && dr.social && ran.length === 1 && /Never post it/.test(readFileSync(join(dir, ".symbiot", "TASKS.md"), "utf8")) && JSON.parse(readFileSync(join(dir, ".symbiot", "handoff.json"), "utf8")).env.SYMBIOT_DRAFT === "1", dr);
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} post: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
