// Post (post.mjs): the week's real git as 3 draft LinkedIn posts in your voice,
// waiting on you; Approve hands one to Marketing's agent to post, Edit and Skip, every
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
  const MK = join(HOME, "marketing-lane"), runs = [];
  const hand = (p, o) => P.handToMarketing(p, { ...o, dir: MK, names: ["Demo"], run: (d, o2) => { runs.push({ d, o2 }); return { id: "mj" + runs.length }; }, running: () => false });
  let prompt = "";
  const d = await P.draftPosts({ repos, gh: false, ask: async (s, p) => { prompt = p; return honest(s, p); } });
  ok("3 drafts: Shipped, Learned / fixed, and a longer one", d.ok && d.posts.length === 3 && d.posts.map((p) => p.kind).join() === "shipped,learned,long" && d.dropped.length === 0, d);
  ok("the AI was given the numbered facts and your examples, and told they're the only claims", /\[1\] demo · /.test(prompt) && /the only things you may claim/.test(prompt) && /Lesson of the week/.test(prompt), prompt.slice(0, 300));
  ok("each draft keeps the git it rests on", d.posts.every((p) => p.sources.length && p.sources.every((s) => /^\[\d+\] demo · /.test(s))), d.posts.map((p) => p.sources));
  ok("they wait on you (the Dashboard's amber items)", P.postsState().posts.length === 3 && P.postsState().posts.every((p) => p.status === "waiting" && p.platform === "linkedin"), P.postsState().posts);
  ok("kept yours only (0600): drafts and log", mode(P.PATHS.posts) === "600" && mode(P.PATHS.log) === "600", [mode(P.PATHS.posts), mode(P.PATHS.log)]);
  ok("drafting hands nothing over and posts nothing", runs.length === 0 && !/fetch\(/.test(readFileSync(new URL("../post.mjs", import.meta.url), "utf8")), runs);
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
  let tries = 0;
  const none = await P.draftPosts({ repos, gh: false, ask: async () => { tries++; return JSON.stringify({ posts: [{ kind: "shipped", text: "We have 9000 users.", facts: [1] }] }); } });
  ok("none git backs, twice (a fresh try by itself first): an error, and the waiting drafts stay", none.code === "all-dropped" && none.retried && tries === 4 && /twice/.test(none.error) && P.postsState().posts.length === 2, [none, tries]);
  console.log("EVERY DRAFT DROPPED — a fresh try by itself before giving up (week 1: none of 3, then all 3)");
  let wk = 0; const drops0 = P.postLog().filter((x) => x.action === "dropped").length, kept0 = readFileSync(P.PATHS.posts, "utf8");
  const week1 = await P.draftPosts({ repos, gh: false, ask: async (s, p) => { wk++; if (wk <= 2) return JSON.stringify({ posts: P.KINDS.map((k) => ({ kind: k, text: "demo v9.9 shipped to 4000 teams.", facts: [1] })) }); return honest(s, p); } });
  ok("the first try kept none, so it tried again, and the second kept all 3", week1.ok && week1.retried && wk === 3 && week1.posts.length === 3 && week1.dropped.length === 0, [week1, wk]);
  ok("…the first try's drops are logged, with why", P.postLog().filter((x) => x.action === "dropped").length === drops0 + 3, P.postLog().slice(-6).map((x) => x.action));
  writeFileSync(P.PATHS.posts, kept0); // back to the two waiting, for what follows

  console.log("APPROVE, EDIT, SKIP — they work, and each is logged");
  const [a, b] = P.postsState().posts;
  const e = P.editPost(a.id, "Fixed the crash when the inbox is empty in demo. Small fix, big relief.");
  ok("Edit changes its words; it stays waiting", e.ok && P.loadPosts().posts.find((p) => p.id === a.id).text.startsWith("Fixed the crash") && P.postsState().posts.some((p) => p.id === a.id) && !e.unsupported, e);
  ok("…and says (doesn't block) what git doesn't show", P.editPost(a.id, "Fixed the crash for Stripe users.").unsupported.includes("Stripe"), "");
  P.editPost(a.id, "Fixed the crash when the inbox is empty in demo. Small fix, big relief.");
  ok("Edit with nothing in it is refused", /new text/.test(P.editPost(a.id, "  ").error || ""), "");
  ok("nothing handed over before an approval", runs.length === 0, runs);
  const ap = P.approvePost(a.id, { hand });
  const apMd = readFileSync(join(MK, ap.handed.rel || "x"), "utf8"), apAns = readFileSync(join(MK, ".symbiot", "ANSWERS.md"), "utf8");
  ok("Approve hands the post to Marketing's agent and starts it, once: nothing for you to copy or paste", ap.ok && ap.handed.job === "mj1" && runs.length === 1 && runs[0].d === MK && runs[0].o2.force && /posting it on LinkedIn now/.test(ap.note) && !/paste|yourself/i.test(ap.note) && ap.copied === undefined && ap.share === undefined, ap);
  ok("…as an approved draft in its lane, the text exactly as approved", /^## Post\n/m.test(apMd) && apMd.includes("## Post\n" + ap.post.text + "\n\n## Notes") && /platform: linkedin/.test(apMd) && JSON.parse(readFileSync(join(MK, ".symbiot", "drafts.json"), "utf8"))[ap.handed.rel].status === "approved", apMd);
  ok("…and its agent is told to post it through the signed-in browser and check it's there", apAns.includes(`### Approved: ${ap.handed.rel}`) && /signed-in browser/.test(apAns) && /check it's there/.test(apAns), apAns);
  ok("an approved post can't be approved, edited or skipped again", /approved already/.test(P.approvePost(a.id, { hand }).error) && /approved already/.test(P.editPost(a.id, "x").error) && /approved already/.test(P.skipPost(a.id).error) && runs.length === 1, "");
  ok("one that isn't there hands nothing over", P.approvePost("nope", { hand }).error && runs.length === 1, "");
  const busy = P.handToMarketing({ id: "zz", kind: "shipped", text: "Demo shipped a thing.", media: [] }, { dir: MK, names: ["Demo"], run: () => { throw new Error("must not start"); }, running: () => true });
  ok("Marketing's agent already running: it posts it once that run finishes, no second run", busy.queued && /once the run there now finishes/.test(busy.said) && busy.rel === "drafts/demo/post-zz.md", busy);
  const sk = P.skipPost(b.id);
  ok("Skip drops it from the Dashboard", sk.ok && P.postsState().posts.length === 0 && P.postsState().done.length === 2, P.postsState());
  const bare = { ...P.PATHS, voice: P.PATHS.voice + ".none" }, s0 = P.postsState(bare, { linked: () => ({}) }), s1 = P.postsState(bare, { linked: () => ({ linkedin: { at: 1 } }) });
  ok("it can't draft with no voice to go on: no examples in voice.md and LinkedIn not linked (the Dashboard says so in a line)", s0.canDraft === false && !s0.linkedin && s0.voice.count === 0, s0);
  ok("…LinkedIn linked is enough, once an AI is connected", s1.linkedin && s1.canDraft === s1.connected, s1);
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

  console.log("PICTURES AND VIDEOS — an idea for each draft, yours or a page's, handed over at Approve");
  const showing = async (s, p) => JSON.stringify({ posts: JSON.parse(await honest(s, p)).posts.map((x) => ({ ...x, show: "a picture of the   digest export\nin the app" })) });
  let sysSaid = "";
  const md = await P.draftPosts({ repos, gh: false, ask: async (s, p) => { sysSaid = s; return showing(s, p); } });
  ok("the AI is asked what picture or short video would show each post", /"show"/.test(sysSaid) && /picture or short video/.test(sysSaid), sysSaid.slice(-400));
  ok("…and each draft keeps it, on one line, with no media yet", md.ok && md.posts.every((x) => x.show === "a picture of the digest export in the app" && Array.isArray(x.media) && !x.media.length), md.posts);
  const [m1, m2, m3] = md.posts;
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]), JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]);
  const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(40)]), MOV = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  "), Buffer.alloc(40)]);
  ok("a file is known by its first bytes, not its name: PNG, JPG, MP4, MOV; text isn't one", P.mediaType(PNG) === "png" && P.mediaType(JPG) === "jpg" && P.mediaType(MP4) === "mp4" && P.mediaType(MOV) === "mov" && P.mediaType(Buffer.from("just some text, not a picture")) === "", [P.mediaType(PNG), P.mediaType(MOV)]);
  const pa = P.addMedia(m1.id, PNG, { name: "digest.png" });
  const pf = join(P.mediaDir(m1.id), pa.media && pa.media.file);
  ok("a picture of yours goes on a draft: a copy, yours only, in its own folder", pa.ok && pa.media.kind === "picture" && pa.media.from === "yours" && existsSync(pf) && readFileSync(pf).equals(PNG) && mode(pf) === "600" && P.loadPosts().posts.find((x) => x.id === m1.id).media.length === 1, pa);
  ok("…which the app can show, with its type", (P.mediaFile(m1.id, pa.media.id) || {}).type === "image/png" && P.mediaFile(m1.id, "nope") === null, P.mediaFile(m1.id, pa.media.id));
  ok("…and the log says what was added", P.postLog().slice(-1)[0].action === "media" && P.postLog().slice(-1)[0].added.file === pa.media.file, P.postLog().slice(-1)[0]);
  ok("a file that isn't a picture or video is refused, and says what is", /PNG, JPG or GIF/.test(P.addMedia(m1.id, Buffer.from("hello there, this is text")).error || ""), "");
  ok("LinkedIn's rule: pictures or a video, not both", /not both/.test(P.addMedia(m1.id, MP4).error || ""), P.addMedia(m1.id, MP4));
  ok("a second picture is fine", P.addMedia(m1.id, JPG, { name: "b.jpg" }).ok && P.loadPosts().posts.find((x) => x.id === m1.id).media.length === 2, "");
  const va = P.addMedia(m2.id, MP4, { name: "demo.mp4" });
  ok("a video on another draft; a second video is refused (one a post)", va.ok && va.media.kind === "video" && /one video a post/.test(P.addMedia(m2.id, MOV).error || ""), va);
  let shotUrl = "";
  const pp = await P.pictureOfPage(m3.id, "localhost:3000/reports", { shoot: async (u) => { shotUrl = u; return { png: PNG, url: u, title: "Reports" }; } });
  ok("a picture of a page (localhost works), on your click: kept with where it's from", pp.ok && shotUrl === "http://localhost:3000/reports" && pp.media.from === "page" && pp.media.url === shotUrl && pp.media.name === "Reports", pp);
  ok("…and the page is remembered for the next one", P.postsState().lastUrl === "localhost:3000/reports", P.postsState().lastUrl);
  ok("a page that won't open says why, and adds nothing", /refused/.test((await P.pictureOfPage(m3.id, "localhost:9", { shoot: async () => ({ error: "Couldn't open it (refused)." }) })).error) && P.loadPosts().posts.find((x) => x.id === m3.id).media.length === 1, "");
  ok("not a page: says how to give one", /web address/.test((await P.pictureOfPage(m3.id, "two words")).error || ""), "");
  ok("a clip goes only where there's nothing yet (LinkedIn: a video, or pictures)", /not both/.test((await P.clipOfPage(m3.id, "localhost:3000", { record: async () => ({}), encode: () => ({}) })).error || ""), "");
  const rm = P.removeMedia(m3.id, pp.media.id);
  ok("a picture comes off: its copy deleted, the draft as it was", rm.ok && !existsSync(join(P.mediaDir(m3.id), pp.media.file)) && !P.loadPosts().posts.find((x) => x.id === m3.id).media.length, rm);
  let recorded = null;
  const cl = await P.clipOfPage(m3.id, "localhost:3000", { seconds: 5, record: async (u, s) => { recorded = [u, s]; return { frames: [{ ts: 10, jpeg: JPG }, { ts: 10.5, jpeg: JPG }], end: 15, url: u, title: "Home" }; }, encode: (frames, end) => (frames.length === 2 && end === 15 ? { mp4: MP4 } : { error: "wrong frames" }) });
  ok("a clip of a page: recorded for the seconds asked, made a video, added", cl.ok && recorded[0] === "http://localhost:3000/" && recorded[1] === 5 && cl.media.kind === "video" && cl.media.from === "clip", cl);
  ok("ffmpeg's list: each frame until the next, the last until the end, the last listed twice", P.concatList([{ ts: 10 }, { ts: 10.5 }, { ts: 12 }], 15) === "ffconcat version 1.0\nfile f00000.jpg\nduration 0.500\nfile f00001.jpg\nduration 1.500\nfile f00002.jpg\nduration 3.000\nfile f00002.jpg\n", P.concatList([{ ts: 10 }, { ts: 10.5 }, { ts: 12 }], 15));
  if (P.canClip()) {
    // real frames, made by ffmpeg, then made a video by toVideo
    const fdir = join(HOME, "frames"); mkdirSync(fdir);
    const frame = (c) => { const f = join(fdir, c + ".jpg"); execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", `color=c=${c}:s=64x48`, "-frames:v", "1", f]); return readFileSync(f); };
    const v = P.toVideo([{ ts: 0, jpeg: frame("red") }, { ts: 1, jpeg: frame("blue") }], 3);
    ok("toVideo (ffmpeg here): real frames become an MP4, and its scratch folder goes", v.mp4 && P.mediaType(v.mp4) === "mp4" && !readdirSync(P.PATHS.media).some((x) => x.startsWith(".clip-")), v.error || readdirSync(P.PATHS.media));
  } else ok("toVideo: without ffmpeg a clip says to install it", /ffmpeg/.test(P.NO_FFMPEG), "");
  const am = P.approvePost(m1.id, { hand });
  const amMd = readFileSync(join(MK, am.handed.rel), "utf8"), amMedia = (amMd.match(/^media: (.+)$/m) || [])[1] || "";
  ok("Approve hands the post's pictures over with it, next to it in Marketing's lane, and its agent attaches them", am.ok && amMedia.split(", ").length === 2 && amMedia.split(", ").every((f) => existsSync(join(MK, am.handed.rel, "..", f))) && readFileSync(join(MK, ".symbiot", "ANSWERS.md"), "utf8").includes(amMedia + " attached"), amMd);
  ok("…and logs what it carried", (P.postLog().slice(-1)[0].media || []).length === 2, P.postLog().slice(-1)[0]);
  ok("a draft with a video: its one file goes over with it", (() => { const x = P.approvePost(m2.id, { hand }); return x.ok && /^media: [^,\n]+$/m.test(readFileSync(join(MK, x.handed.rel), "utf8")); })(), "");
  const clip3 = P.loadPosts().posts.find((x) => x.id === m3.id).media[0];
  ok("symbiot post add <id> <file>: a picture of yours, from the command line", (() => { writeFileSync(join(HOME, "shot.png"), PNG); const r = cli("add", m3.id, join(HOME, "shot.png")); return r.code === 1 && /not both/.test(r.out); })() && clip3.kind === "video", "");
  ok("symbiot post remove <id> <media id>, then add works", cli("remove", m3.id, clip3.id).code === 0 && cli("add", m3.id, join(HOME, "shot.png")).code === 0 && P.loadPosts().posts.find((x) => x.id === m3.id).media[0].name === "shot.png", P.loadPosts().posts.find((x) => x.id === m3.id).media);
  ok("symbiot post list shows the picture's file", cli("list").out.includes(P.mediaDir(m3.id)), cli("list").out.slice(-300));
  await P.draftPosts({ repos, gh: false, ask: honest });
  ok("after drafting, every media folder is a kept draft's (the approved one's stays)", existsSync(P.mediaDir(m1.id)) && readdirSync(P.PATHS.media).every((x) => P.loadPosts().posts.some((p) => p.id === x)), readdirSync(P.PATHS.media));

  console.log("A PICTURE BY ITSELF — a draft whose idea is a screen of an app you run here arrives with it");
  const apps = await P.localApps([{ name: "demo", path: REPO }, { name: "symbiot", path: join(dirname(fileURLToPath(import.meta.url)), "..") }, { name: "idle", path: "/nowhere" }],
    { ports: () => [{ port: 3000, pid: 1 }, { port: 5173, pid: 2 }, { port: 8080, pid: 3 }], cwd: (pid) => ({ 1: "/somewhere/else", 2: join(REPO, "web"), 3: REPO + "-other" })[pid], app: async () => ({ url: "http://127.0.0.1:7391/", open: "http://127.0.0.1:7391/?t=tok" }) });
  ok("the apps running here: one listening from inside a repo's folder, and Symbiot's own app for its repo", JSON.stringify(apps) === JSON.stringify([{ repo: "demo", url: "http://localhost:5173/" }, { repo: "symbiot", url: "http://127.0.0.1:7391/", open: "http://127.0.0.1:7391/?t=tok", symbiot: true }]), apps);
  const fx = [{ repo: "demo" }, { repo: "symbiot" }], at = (show, n = 1) => P.screenFor({ show, facts: [n] }, apps, fx);
  ok("an idea that names a screen: that app's page (a path it names too)", JSON.stringify(at("a picture of the new /digest page")) === JSON.stringify({ url: "http://localhost:5173/digest", open: "http://localhost:5173/digest" }) && at("a picture of the app's home screen").url === "http://localhost:5173/", [at("a picture of the new /digest page"), at("a picture of the app's home screen")]);
  ok("…Symbiot's screens by name, opened with its token but kept without it", at("a picture of the new Reports view", 2).url === "http://127.0.0.1:7391/#reports" && at("a picture of the new Reports view", 2).open === "http://127.0.0.1:7391/?t=tok#reports" && at("a picture of the Dashboard's cards", 2).url.endsWith("#board"), at("a picture of the new Reports view", 2));
  ok("…not a clip, a command or a terminal, and not a repo with no app running", !at("a clip of the install running") && !at("the digest command in a terminal") && !at("a picture of the page", 3) && !at(""), "");
  const showing2 = async (s, p) => { const ps = JSON.parse(await honest(s, p)).posts; return JSON.stringify({ posts: [{ ...ps[0], show: "a picture of the new /digest page" }, { ...ps[1], show: "a clip of the crash fix" }, { ...ps[2], show: "the digest command in a terminal" }] }); };
  const shots = [];
  const ap2 = await P.draftPosts({ repos, gh: false, ask: showing2, apps: async () => [{ repo: "demo", url: "http://localhost:5173/" }], shoot: async (u) => { shots.push(u); return { png: PNG, url: u, title: "Digest" }; } });
  const sh0 = ap2.posts.find((x) => x.kind === "shipped");
  ok("drafted: the screen's picture is on its draft already, from that page; the others keep their idea", ap2.ok && ap2.pictures === 1 && shots.join() === "http://localhost:5173/digest" && sh0.media.length === 1 && sh0.media[0].from === "page" && sh0.media[0].url === "http://localhost:5173/digest" && P.loadPosts().posts.find((x) => x.id === sh0.id).media.length === 1 && ap2.posts.filter((x) => x.kind !== "shipped").every((x) => !x.media.length), [ap2.pictures, shots, sh0.media]);
  ok("…you can take it off like any picture", P.removeMedia(sh0.id, sh0.media[0].id).ok && !P.loadPosts().posts.find((x) => x.id === sh0.id).media.length, "");
  const ap3 = await P.draftPosts({ repos, gh: false, ask: showing2, apps: async () => [{ repo: "demo", url: "http://localhost:5173/" }], shoot: async () => ({ error: "Couldn't open it (refused)." }) });
  ok("the app not answering: the drafts arrive all the same, with their idea", ap3.ok && ap3.posts.length === 3 && !ap3.pictures && ap3.posts.every((x) => !x.media.length && x.show), ap3);

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

  console.log("A DRAFT ON ITS CARD — the reply itself, Go ahead sends it, Change it redrafts (2026-10-08: Frikkie's reply never showed)");
  const meta = () => JSON.parse(readFileSync(join(dir, ".symbiot", "handoff.json"), "utf8")), brief = () => readFileSync(join(dir, ".symbiot", "TASKS.md"), "utf8");
  ok("the brief: the reply under ## The reply with To:, notes apart; no asking to send it, the card does", /a first line `To: <their first name>`/.test(br) && /## Notes/.test(br) && /Don't ask in QUESTIONS\.md to send/.test(br) && !/posts it themselves/.test(br), br.slice(0, 300));
  ok("its folder says it's a LinkedIn draft", meta().draft && meta().draft.kind === "social" && meta().draft.platform === "LinkedIn", meta());
  ok("no card while it's drafting", W.draftCard(dir) === null, "");
  writeFileSync(join(dir, ".symbiot", "TASKS.md"), brief().replace("- [ ] Draft a reply", "- [x] Draft a reply") + "\n## The reply\nTo: Sam\nHi Sam, it's free for teams of up to 5.\n\nHappy to help you set it up.\n\n## Notes\nI checked the pricing page first.\n");
  const dc = W.draftCard(dir);
  ok("drafted: the card has the reply, all of it and only it, to whom and where", dc && dc.to === "Sam" && dc.text === "Hi Sam, it's free for teams of up to 5.\n\nHappy to help you set it up." && dc.platform === "LinkedIn" && dc.kind === "social", dc);
  const { homeState, homeAnswer } = await import("../home.mjs");
  const hs = homeState({ fresh: true, deps: { pending: () => [], agents: () => [], repos: () => ({}), tasks: () => [], stuck: () => [], drafts: () => [dc], connected: () => true, rootsSet: () => true, search: () => ({ searching: false, at: 1 }), confirmed: () => true } });
  const dy = hs.you.find((x) => x.id === "draft:n1");
  ok("on Home: 'Reply to Sam on LinkedIn', the reply on it, Go ahead or Skip", dy && dy.title === "Reply to Sam on LinkedIn" && dy.draft && dy.draft.text === dc.text && dy.options.join() === "Go ahead (recommended),Skip", hs.you.map((x) => x.id));
  ok("…and it says what Go ahead does, never that the agent can't send", dy && /Go ahead sends it to Sam from your LinkedIn/.test(dy.q) && !/can't|cannot|won't let/i.test(dy.q + dy.sub), dy && dy.q);
  const ran2 = [];
  const dch = homeAnswer("draft:n1", { text: "make it shorter, no second line" }, { draftAnswer: (id, o) => W.draftAnswer(id, { ...o, run: (d, oo) => { ran2.push([d, oo]); return { id: "j2" }; } }) });
  ok("Change it (your own words): the drafting agent redrafts, still unable to send", dch.ok && ran2.length === 1 && /## Change it\n[^\n]*make it shorter, no second line/.test(brief()) && /- \[ \] Draft a reply/.test(brief()) && meta().env.SYMBIOT_DRAFT === "1", [dch, brief().slice(-400)]);
  ok("…the card waits for the new version", W.draftCard(dir) === null, "");
  writeFileSync(join(dir, ".symbiot", "TASKS.md"), brief().replace("- [ ] Draft a reply", "- [x] Draft a reply").replace(/## The reply\n[\s\S]*?(?=\n## )/, "## The reply\nTo: Sam\nHi Sam, it's free for teams of up to 5.\n"));
  ok("…and shows it when it's there", W.draftCard(dir) && W.draftCard(dir).text === "Hi Sam, it's free for teams of up to 5.", W.draftCard(dir));
  const ran3 = [];
  const dgo = homeAnswer("draft:n1", { pick: 0 }, { draftAnswer: (id, o) => W.draftAnswer(id, { ...o, run: (d, oo) => { ran3.push([d, oo]); return { id: "j3" }; } }) });
  ok("Go ahead: a run that sends it, without SYMBIOT_DRAFT, with the approved text", dgo.ok && ran3.length === 1 && ran3[0][1].force && !meta().env.SYMBIOT_DRAFT && /# Send the approved reply: LinkedIn/.test(brief()) && /## The reply\nTo: Sam\nHi Sam, it's free for teams of up to 5\.\n/.test(brief()), [dgo, meta(), brief().slice(0, 200)]);
  ok("…and the card is gone while it sends", W.draftCard(dir) === null && meta().draft.state === "sending", meta());
  const { needsOf } = await import("../agents.mjs"), said = "The reply to Sam is ready for you to send. It isn't sent.";
  ok("a draft folder's 'ready for you to send' is its card's, never a 'waits for your OK' rerun (that run can't send)", needsOf(dir, { final: said }) === null, needsOf(dir, { final: said }));
  const other = join(HOME, "elsewhere"); mkdirSync(join(other, ".symbiot"), { recursive: true });
  ok("…while any other run's still is", !!needsOf(other, { final: said }), "");
  writeFileSync(join(dir, ".symbiot", "TASKS.md"), "# Draft a reply: LinkedIn\n## Tasks\n- [x] Draft a reply to: x\n\n## The reply\nTo: Sam\nHi\n");
  const dsk = homeAnswer("draft:n1", { pick: 1 }, {});
  ok("Skip: it won't be sent, and the card goes", dsk.ok && W.draftCard(dir) === null && meta().draft.state === "skipped", [dsk, meta()]);

  console.log("HASHTAG LABELS — LinkedIn's \"hashtag\" line over each #tag stays out of the voice and the drafts");
  const tagged = "Shipped the liquid home this week, and it rests as one orb.\n\nhashtag\n#DeveloperTools\nhashtag\n#AI";
  ok("voice.md's examples lose the labels, keep the tags (and a word 'hashtag' in a sentence)", P.voiceOf(tagged + "\n---\nI wrote a hashtag guide once, plain words only.")[0].endsWith("orb.\n\n#DeveloperTools\n#AI") && /a hashtag guide/.test(P.voiceOf(tagged + "\n---\nI wrote a hashtag guide once, plain words only.")[1]), P.voiceOf(tagged));
  ok("…and so do the drafts", P.parseDrafts(JSON.stringify({ posts: [{ kind: "shipped", text: tagged, facts: [1] }] }))[0].text === "Shipped the liquid home this week, and it rests as one orb.\n\n#DeveloperTools\n#AI", P.parseDrafts(JSON.stringify({ posts: [{ kind: "shipped", text: tagged, facts: [1] }] })));

  { // its own names, apart from the rest
  console.log("THE 4-WEEK TEST — a row a week under Marketing");
  const T4 = join(HOME, "t4"); mkdirSync(T4, { recursive: true });
  const tp = { ...P.PATHS, posts: join(T4, "posts.json"), log: join(T4, "log.jsonl"), test: join(T4, "post-test.json") };
  const day = (s, h = 12) => new Date(s + "T" + String(h).padStart(2, "0") + ":00:00").getTime();
  ok("no drafts yet: no test", P.testWeeks({ paths: tp }) === null, "");
  writeFileSync(tp.posts, JSON.stringify({ posts: [{ id: "a1", kind: "shipped", text: "x", status: "waiting", drafted: day("2026-10-07", 8), sources: ["[1] demo · 2026-10-06 · release: released v1.2.0", "[2] other · 2026-10-06 · commit: y"] }] }));
  const t0 = P.testWeeks({ paths: tp, now: day("2026-10-09") });
  ok("nothing posted yet: week 1 is the week you're in, from the day of the first draft", t0 && t0.start === "2026-10-07" && t0.end === "2026-11-03" && t0.week === 1 && t0.rows.length === 4 && t0.rows[0].to === "2026-10-13" && t0.rows[1].from === "2026-10-14", t0);
  const t1 = P.testWeeks({ paths: tp, now: day("2026-10-16") });
  ok("…a week with nothing posted doesn't count: the test moves on", t1.start === "2026-10-14" && t1.week === 1, [t1.start, t1.week]);
  const line = (o) => JSON.stringify(o) + "\n";
  writeFileSync(tp.log, line({ ts: day("2026-10-15"), action: "approved", id: "a1", media: [{ kind: "image" }] }) + line({ ts: day("2026-10-16"), action: "approved", id: "a2" }) + line({ ts: day("2026-10-16"), action: "skipped", id: "a3" }) + line({ ts: day("2026-10-22"), action: "approved", id: "a4" }));
  const news = [{ id: "n1", social: true, ts: day("2026-10-15", 15), text: "how much is it for a team?", customer: "pricing" }, { id: "n2", social: true, ts: day("2026-10-17"), text: "nice one", }, { id: "n3", ts: day("2026-10-17"), text: "an email" }, { id: "n4", social: true, ts: day("2026-10-23"), text: "how do I install it?", customer: "install" }];
  const t2 = P.testWeeks({ paths: tp, now: day("2026-10-24"), news, map: { demo: REPO } });
  const [w1, w2, w3] = t2.rows;
  ok("week 1 is the first week a post went out; each row: published (with a picture), replies, maybe-customers, pricing", t2.start === "2026-10-14" && t2.week === 2 && w1.over && w1.published === 2 && w1.media === 1 && w1.replies === 2 && w1.customers === 1 && w1.pricing === 1 && w2.published === 1 && w2.replies === 1 && w2.customers === 1 && w2.pricing === 0 && !w3.started, t2.rows);
  writeFileSync(join(REPO, "package.json"), JSON.stringify({ name: "demo-cli" }));
  ok("installs: the npm packages the posts are about (their repos' package.json, not private)", JSON.stringify(P.testWeeks({ paths: tp, now: day("2026-10-24"), map: { demo: REPO } }).packages) === '["demo-cli"]' && !P.testWeeks({ paths: tp, now: day("2026-10-24"), map: {} }).packages.length, "");
  writeFileSync(tp.test, JSON.stringify({ start: "2026-10-13" }));
  const t3 = P.testWeeks({ paths: tp, now: day("2026-10-24"), news, map: { demo: REPO } });
  ok("moved by hand (post-test.json): the weeks start there", t3.start === "2026-10-13" && t3.end === "2026-11-09" && t3.rows[0].to === "2026-10-19", [t3.start, t3.end]);
  const asked = [];
  const days = { downloads: [{ day: "2026-10-13", downloads: 10 }, { day: "2026-10-19", downloads: 5 }, { day: "2026-10-20", downloads: 7 }, { day: "2026-10-30", downloads: 99 }] };
  const n3 = await P.testInstalls(t3, { now: day("2026-10-24"), get: async (u) => { asked.push(u); return days; } });
  ok("npm's daily downloads, summed per week, none for weeks not begun", JSON.stringify(n3) === "[15,7,null,null]" && asked.length === 1 && /downloads\/range\/2026-10-13:2026-11-09\/demo-cli$/.test(asked[0]), [n3, asked]);
  ok("…kept a while: no second fetch", JSON.stringify(await P.testInstalls(t3, { now: day("2026-10-24"), get: async () => { throw new Error("fetched again"); } })) === "[15,7,null,null]", "");
  ok("…and nothing when npm can't be reached or nothing's started", (await P.testInstalls({ ...t3, packages: ["x"], start: "2026-10-12" }, { get: async () => null })) === null && (await P.testInstalls({ ...t3, rows: t3.rows.map((r) => ({ ...r, started: false })) })) === null, "");
  }
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} post: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
