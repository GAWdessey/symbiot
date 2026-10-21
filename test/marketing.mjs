// Marketing (marketing.mjs, home.mjs marketingState): a lane of its own for marketing
// across products. Its folder (a local git repo), the product each item is tagged with,
// its brief, other lanes handing to it, and what its page and Home's orb show. Isolated
// HOME (set before the modules load); the agents are stand-ins.
//
//   node test/marketing.mjs
//
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-marketing-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const M = await import("../marketing.mjs");
const { handoverRules } = await import("../handover.mjs");
const { buildTasksMd } = await import("../tasks.mjs");
const { marketingState, marketingTask, moveToMarketing, homeState } = await import("../home.mjs");
const { laneMap } = await import("../scan.mjs");
const { dispatch } = await import("../lanes.mjs");

// two repos, as the user names them
const repo = (folder, title) => { const p = join(HOME, "code", folder); mkdirSync(p, { recursive: true }); writeFileSync(join(p, "README.md"), `# ${title}\n`); return p; };
const sym = repo("symbiot", "symbiot"), dai = repo("CallForge AI", "Bookly"), srv = repo("server", "server");
const map = { symbiot: sym, "CallForge AI": dai, server: srv, marketing: M.MARKETING_DIR };

console.log("MARKETING — product tags");
const names = M.productNames(map);
ok("the products are the repos' names as people say them, capitalised (Bookly for CallForge AI)", names.includes("Symbiot") && names.includes("Bookly") && !names.includes("marketing"), names);
ok("a [tag] wins: [Bookly] Write the launch post → Bookly", M.productOf("[Bookly] Write the launch post about Symbiot", names) === "Bookly");
ok("no tag: the first product named, as written", M.productOf("A demo video of Symbiot, then one of Bookly", names) === "Symbiot");
ok("a lowercase word isn't a product (\"the server\" isn't Server)", M.productOf("restart the server after the launch", names) === "");
ok("nothing named: no product", M.productOf("a post about my week", names) === "");
ok("tagged puts one tag first, replacing the old", M.tagged("[Symbiot] the launch post", "Bookly") === "[Bookly] the launch post" && M.tagged("plain", "") === "plain");
ok("untagged drops it for showing", M.untagged("[Bookly] Write it") === "Write it");
ok("marketing words: launches, pricing, LinkedIn posts, demo videos", ["Plan the launch", "a pricing page", "LinkedIn posts for the week", "cut a demo video"].every((t) => M.MARKETING_WORDS.test(t)) && !M.MARKETING_WORDS.test("fix the login bug"));

console.log("MARKETING — its folder, made once, a git repo of its own");
ok("not there before anything goes to it", !existsSync(M.MARKETING_DIR));
ok("ensureMarketing makes it: README, drafts/, .symbiot kept out", M.ensureMarketing() === M.MARKETING_DIR && /^# Marketing/.test(readFileSync(join(M.MARKETING_DIR, "README.md"), "utf8")) && existsSync(join(M.MARKETING_DIR, "drafts")) && /\.symbiot/.test(readFileSync(join(M.MARKETING_DIR, ".gitignore"), "utf8")));
const log = (() => { try { return execFileSync("git", ["-C", M.MARKETING_DIR, "log", "--oneline"], { encoding: "utf8" }); } catch { return ""; } })();
ok("with a first commit, so Approve has a branch to commit on", /a lane of its own/.test(log), log);
ok("a second call leaves it be", M.ensureMarketing() === M.MARKETING_DIR);
mkdirSync(join(M.MARKETING_DIR, "drafts", "bookly"), { recursive: true });
writeFileSync(join(M.MARKETING_DIR, "drafts", "bookly", "launch.md"), "# The Bookly launch post\nproduct: Bookly\ntype: post\nplatform: linkedin\n\nHook.\n");
mkdirSync(join(M.MARKETING_DIR, "drafts", "symbiot"), { recursive: true });
writeFileSync(join(M.MARKETING_DIR, "drafts", "symbiot", "demo-video-script.md"), "No title here.\n");
const files = M.draftFiles(M.MARKETING_DIR, names);
ok("what its agent drafted: title and product from the file, else its name and folder", files.length === 2 && files.some((f) => f.name === "The Bookly launch post" && f.product === "Bookly") && files.some((f) => f.name === "demo video script" && f.product === "Symbiot"), files);

console.log("MARKETING — the lane in every brief, and its own");
const rules = handoverRules(["symbiot", "bookly", "marketing"], "symbiot").join("\n");
ok("another lane's brief names marketing as a lane of its own, not a repo", /- `marketing`: marketing for any product/.test(rules) && !/`symbiot`, `bookly`, `marketing`/.test(rules), rules);
ok("Marketing's own brief doesn't offer itself", !/- `marketing`:/.test(handoverRules(["symbiot", "marketing"], "marketing").join("\n")));
const brief = M.marketingBrief([{ text: "[Bookly] Write the launch post" }, { text: "Cut a demo video of Symbiot" }, { text: "[Acme] a teaser" }], { map });
const md = buildTasksMd("marketing", { lanes: Object.keys(map), about: brief }, [{ text: "[Bookly] Write the launch post" }]);
ok("its brief says what the lane is, before its tasks", md.indexOf("## This lane: marketing") > 0 && md.indexOf("## This lane: marketing") < md.indexOf("## Tasks"));
ok("with each product its tasks name and where its code is", md.includes(`Bookly: \`${dai}\``) && md.includes(`Symbiot: \`${sym}\``), md.slice(md.indexOf("## This lane"), md.indexOf("## Tasks")));
ok("a product that isn't a repo here: ask where it lives", /Acme \(not one of the user's repos here/.test(md));
ok("its rules: drafts per product, a strong hook and the end goal", /drafts\/<product>\//.test(md) && /strong hook/.test(md) && /end goal/.test(md));
ok("…each draft's post under ## Post, its notes under ## Notes, never mixed", /`## Post` with exactly the text that goes out/.test(md) && /`## Notes` for your reasoning/.test(md));
ok("…the user's only step is approving the preview: posting, scheduling and pasting on a linked platform are its agent's, never 👤", /only step is approving each post's preview/.test(md) && /never ask them to post, schedule, paste or attach anything themselves, and never mark that as a 👤 step/.test(md) && /screens map/.test(md) && /never post what they haven't approved/.test(md));
ok("a repo's brief has no such section", !/## This lane/.test(buildTasksMd("symbiot", { lanes: Object.keys(map) }, [{ text: "x" }])));

console.log("MARKETING — a lane every task can go to");
ok("laneMap has it, with no repo of yours called marketing", laneMap().marketing === M.MARKETING_DIR);
const hand = join(HOME, "code", "symbiot");
mkdirSync(join(hand, ".symbiot"), { recursive: true });
writeFileSync(join(hand, ".symbiot", "HANDOFF.md"), "### marketing\nA launch post for the new Home, for Symbiot, with screenshots.\n");
const added = [], runs = [];
const st = dispatch(hand, { map, ledger: { handoffs: [] }, add: (text, r) => { added.push({ text, r }); return { id: "t1" }; }, push: () => ({ written: [{}] }), run: (p) => { runs.push(p); return { id: "j1" }; }, act: () => ({ error: "not ops" }) });
ok("a handover to marketing becomes its task, and its agent starts in its folder", st.length === 1 && st[0].status === "started" && added[0].r === "marketing" && runs[0] === M.MARKETING_DIR, { st, added, runs });

console.log("MARKETING — its page and Home's orb");
const now = Date.now();
const tasks = [
  { id: "a", text: "[Bookly] Write the launch post", repo: "marketing", ts: now },
  { id: "b", text: "[Symbiot] A demo video", repo: "marketing", review: true, ts: now },
  { id: "c", text: "Add a pricing page to the Symbiot site", repo: "symbiot", ts: now },
  { id: "d", text: "Fix the login bug", repo: "symbiot", ts: now },
  { id: "f", text: "Pat pasted GitHub's 'This branch has conflicts that must be resolved' box for a symbiot PR. Conflicting files: CHANGELOG.md, agents.mjs, marketing.mjs, site/index.html, `marketing`", repo: "symbiot", ts: now },
  { id: "e", text: "an old launch", repo: "marketing", done: true, archived: true }];
const posts = { canDraft: true, posts: [{ id: "p1", status: "waiting", text: "This week Bookly learned to plan your day." }, { id: "p2", status: "approved", text: "x" }], done: [] };
const agents = [{ path: M.MARKETING_DIR, status: "done", ask: { questions: [{ q: "Bookly's end goal isn't written down. Use this one?", options: ["Use it (recommended)", "I'll write my own"] }] } }];
const pending = [{ repo: "marketing", path: M.MARKETING_DIR, tasks: [tasks[1]], files: [{ file: "drafts/symbiot/demo.md" }] }];
const s = marketingState({ deps: { repos: () => map, tasks: () => tasks, posts: () => posts, agents: () => agents, pending: () => pending } });
ok("what needs you: its agent's question, its work for your OK, the drafts waiting, each post it drafted to approve", s.needCount === 4 && s.needs.map((n) => n.kind).join() === "ask,approve,draft,post", s.needs);
const launchPost = s.needs.find((n) => n.kind === "post" && n.rel === "drafts/bookly/launch.md") || {};
ok("…a post to approve: by its file, so Preview opens it, with its product", launchPost.product === "Bookly" && launchPost.text === "The Bookly launch post", s.needs);
const s2 = marketingState({ deps: { repos: () => map, tasks: () => [], posts: () => ({ posts: [], done: [] }), agents: () => [], pending: () => [], files: () => [{ rel: "a.md", name: "A", product: "Robin", status: "approved" }, { rel: "b.md", name: "B", product: "Robin", status: "skipped" }, { rel: "c.md", name: "C", product: "Robin", status: "" }] } });
ok("…only the ones not approved or skipped yet", s2.needs.map((n) => n.rel).join() === "c.md" && s2.needCount === 1, s2.needs);
ok("each tagged: the question and the draft are Bookly's", s.needs[0].product === "Bookly" && s.needs[2].product === "Bookly");
ok("its tasks, open ones only, each with its product and where it is", s.lane.length === 2 && s.lane[0].product === "Bookly" && s.lane[0].status === "waiting" && s.lane[1].status === "review" && s.lane[0].text === "Write the launch post", s.lane);
ok("other lanes' tasks about marketing (pricing, not a login bug)", s.elsewhere.length === 1 && s.elsewhere[0].id === "c" && !s.elsewhere.some((t) => t.id === "f") && s.elsewhere[0].product === "Symbiot", s.elsewhere);
ok("what its agent drafted, and the products to pick from", s.files.length === 2 && s.products.includes("Bookly") && s.products.includes("Symbiot"));
ok("on: Home shows its orb", s.on === true);
const quiet = marketingState({ deps: { repos: () => ({ symbiot: sym }), tasks: () => [], posts: () => ({ posts: [], done: [] }), agents: () => [], pending: () => [], files: () => [] } });
ok("a new user with nothing to market: no orb", quiet.on === false && quiet.needCount === 0);

const h = homeState({ fresh: true, deps: { repos: () => ({ symbiot: sym, marketing: M.MARKETING_DIR }), board: () => ({ cards: [] }), pending: () => [], agents: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, waits: () => [], clashes: () => [], agentGone: () => "", signedOut: () => [], stuck: () => [], agentCmd: () => "claude", next: { taken: () => ({}), tasks: () => [], mind: () => [] }, marketing: () => ({ needs: 2, working: false, waiting: 1 }) } });
ok("Home carries what lights the orb", h.marketing && h.marketing.needs === 2);
const h0 = homeState({ fresh: true, deps: { search: () => ({ searching: false, at: 1 }), repos: () => ({ marketing: M.MARKETING_DIR }), board: () => ({ cards: [] }), pending: () => [], agents: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, waits: () => [], clashes: () => [], agentGone: () => "", signedOut: () => [], stuck: () => [], agentCmd: () => "claude", marketing: () => false } });
ok("Marketing alone isn't your work: once a search found nothing, Home asks for the folder", h0.you.some((y) => y.id === "setup:folders"));

console.log("MARKETING — assigning work to it");
let saved = null;
const t1 = marketingTask("Write three follow-ups", "Bookly", { add: (text, r) => ({ id: "n", text, repo: r }) });
ok("Add: a task for Marketing, tagged with its product", t1.text === "[Bookly] Write three follow-ups" && t1.repo === "marketing", t1);
ok("Add with nothing to do: refused", !!marketingTask("  ", "Bookly").error);
const all = [{ id: "c", text: "Add a pricing page to the Symbiot site", repo: "symbiot" }, { id: "r", text: "A launch", repo: "symbiot", review: true }];
const mv = moveToMarketing("c", "", { load: () => all, save: (x) => { saved = x; }, map });
ok("Move: another lane's task goes to Marketing, tagged with the product its words name", mv.ok && saved[0].repo === "marketing" && saved[0].text === "[Symbiot] Add a pricing page to the Symbiot site", saved && saved[0]);
ok("not one waiting for your OK where it is", !!moveToMarketing("r", "", { load: () => all, save: () => {} }).error);

console.log("MARKETING — a draft shown as the post it will be");
{
  const { marketingDraftAnswer } = await import("../home.mjs");
  const dir = join(HOME, "lane"), d = join(dir, "drafts", "robin");
  mkdirSync(d, { recursive: true }); mkdirSync(join(HOME, "outside"), { recursive: true });
  writeFileSync(join(d, "card.png"), "png"); writeFileSync(join(HOME, "outside", "secret.png"), "x");
  const post = "The best answer my AI gave this month was \"I don't know.\"\n\nI gave Robin a number puzzle he hadn't cracked yet. His reply:\n\n\"I can't work out what you're doing to those numbers yet. I'd be guessing.\"\n\nMost AI tools would give you a confident answer anyway. Robin doesn't.\n\n#AI #Trust #BuildInPublic";
  writeFileSync(join(d, "week-02.md"), `# Week 2\n\nproduct: Robin\nplatform: linkedin\nwhen: 2026-10-13 08:00\nmedia: card.png\n\n## Post\n${post}\n\n## Notes\nWhy this result: it shows doubt. Checked against the never-list.\n`);
  writeFileSync(join(d, "week-03.md"), `# Week 3\n\nproduct: Robin\n\n---\n\n${post}\n\n---\n_Image: \`card.png\` (1200×1200). Schedule for Tue 2026-10-20, 08:00._\n`);
  writeFileSync(join(d, "sneaky.md"), "# x\nplatform: linkedin\nmedia: ../../../outside/secret.png\n\n## Post\nhi\n");
  const cfg = { profile: { name: "Pat Lee", headline: "Building Robin" } };
  const p2 = M.draftPreview("drafts/robin/week-02.md", { dir, cfg });
  ok("## Post is the post, to the character: its line breaks and hashtags, nothing of the notes", p2.body === post && !/never-list/.test(p2.body) && p2.notes === "Why this result: it shows doubt. Checked against the never-list.", p2);
  ok("…its head: platform, when, its picture next to it, and who it's from (config.profile)", p2.platform === "linkedin" && p2.when === "2026-10-13 08:00" && p2.media.length === 1 && p2.media[0].rel === "drafts/robin/card.png" && p2.author.name === "Pat Lee" && p2.author.headline === "Building Robin" && p2.author.initials === "PL", p2);
  ok("…cut where LinkedIn's feed cuts it (about 210 characters, at a word), the whole text kept", p2.cut && p2.shown.length <= M.SEE_MORE && post.startsWith(p2.shown) && !/\s$/.test(p2.shown), p2.shown);
  ok("…its hashtags found", p2.hashtags.join(" ") === "#AI #Trust #BuildInPublic", p2.hashtags);
  ok("a short post isn't cut", !M.seeMore("short and sweet").cut);
  const p3 = M.draftPreview("drafts/robin/week-03.md", { dir, cfg });
  ok("a draft from before (post between ---): the same post, its picture and date read from the notes, the notes kept apart", p3.body === post && p3.format === "legacy" && p3.media[0].name === "card.png" && p3.when === "2026-10-20 08:00" && /^_Image/.test(p3.notes), p3);
  writeFileSync(join(d, "reddit-01.md"), "# I approve my agents' work from my phone\nproduct: Robin\nplatform: reddit\n\n## Post\nThe clip: an agent finishes and asks.\n\n## Notes\n**Where:** r/ClaudeAI, its feed, flair \"Built with Claude\" (check the list). Posted as u/steve_dev.\n");
  writeFileSync(join(d, "reddit-02.md"), "# Another\nplatform: reddit\nsubreddit: SideProject\nflair: Showcase\n\n## Post\nhi\n\n## Notes\nnot r/ClaudeAI this time\n");
  const r1 = M.draftPreview("drafts/robin/reddit-01.md", { dir, cfg }), r2 = M.draftPreview("drafts/robin/reddit-02.md", { dir, cfg });
  ok("where a Reddit draft goes, for its preview as Reddit shows it: the subreddit, flair and who posts it its notes give", r1.where === "r/ClaudeAI" && r1.flair === "Built with Claude" && r1.handle === "u/steve_dev" && r1.title === "I approve my agents' work from my phone", [r1.where, r1.flair, r1.handle]);
  ok("…or its own subreddit: and flair: lines, ahead of the notes", r2.where === "r/SideProject" && r2.flair === "Showcase", [r2.where, r2.flair]);
  ok("…and a LinkedIn draft says nowhere past LinkedIn", p2.where === "" && p2.flair === "", [p2.where, p2.flair]);
  ok("a draft can't show a file outside the lane, nor be read from outside it", M.draftPreview("drafts/robin/sneaky.md", { dir, cfg }).media.length === 0 && !!M.draftPreview("../outside/secret.png", { dir, cfg }).error && !M.laneMedia("../outside/secret.png", { dir, cfg }));
  const ran = [];
  const ap = marketingDraftAnswer("drafts/robin/week-02.md", "approved", { dir, running: () => false, run: (p) => (ran.push(p), { id: "j" }) });
  const ans = readFileSync(join(dir, ".symbiot", "ANSWERS.md"), "utf8");
  ok("Approve on the preview: its agent is told to schedule it through Symbiot's signed-in browser with exactly that text, and starts", ap.ok && ran.join() === dir && /### Approved: drafts\/robin\/week-02\.md/.test(ans) && /scheduled in linkedin's own scheduler for 2026-10-13 08:00, through Symbiot's signed-in browser, with exactly the text/.test(ans) && /card\.png attached/.test(ans), [ap, ans]);
  ok("…and the preview says it's approved", M.draftPreview("drafts/robin/week-02.md", { dir, cfg }).status === "approved" && M.draftFiles(dir).find((f) => f.rel === "drafts/robin/week-02.md").status === "approved");
  writeFileSync(join(d, "week-02.md"), readFileSync(join(d, "week-02.md"), "utf8").replace("Robin doesn't.", "Robin won't."));
  ok("…until its post changes: a changed post asks for your OK again", M.draftPreview("drafts/robin/week-02.md", { dir, cfg }).status === "");
  const sk = marketingDraftAnswer("drafts/robin/week-03.md", "skipped", { dir, run: () => { throw new Error("ran"); } });
  ok("Skip: its agent is told not to post it, and nothing starts", sk.ok && /### Skipped: drafts\/robin\/week-03\.md\nDon't post it/.test(readFileSync(join(dir, ".symbiot", "ANSWERS.md"), "utf8")), sk);
  ok("one that isn't there: says so", !!marketingDraftAnswer("drafts/robin/gone.md", "approved", { dir }).error);
  writeFileSync(join(d, "00-plan.md"), "# Robin: 2-week content plan\nproduct: Robin\nplatform: plan\n\n## Plan\nTwo posts a week on LinkedIn.\n");
  const before = readFileSync(join(dir, ".symbiot", "ANSWERS.md"), "utf8"), pl = marketingDraftAnswer("drafts/robin/00-plan.md", "approved", { dir, run: () => { throw new Error("ran"); } });
  ok("a plan (platform: plan): Approve just marks it accepted: no \"Post it on plan\", nothing starts", pl.ok && pl.accepted && readFileSync(join(dir, ".symbiot", "ANSWERS.md"), "utf8") === before && M.draftPreview("drafts/robin/00-plan.md", { dir, cfg }).done && M.draftPreview("drafts/robin/00-plan.md", { dir, cfg }).type === "plan", [pl, M.draftPreview("drafts/robin/00-plan.md", { dir, cfg }).type]);

  console.log("MARKETING — Change it, its own platform's preview, a redraft asks again (2026-10-10)");
  writeFileSync(join(d, "reddit.md"), `# Symbiot on Reddit\n\nproduct: Symbiot\nplatform: reddit\nsubreddit: r/ClaudeAI\nwhen: 2026-10-15 15:00\nmedia: card.png\n\n## Post\nI built a desktop app that hands tasks to Claude Code\n\nThe body.\n\n## Notes\nnone\n`);
  const rd = M.draftPreview("drafts/robin/reddit.md", { dir, cfg });
  ok("a reddit draft carries its platform and subreddit, for a Reddit layout", rd.platform === "reddit" && rd.where === "r/ClaudeAI", rd);
  ok("…a subreddit named only in its notes is found too, written either way", M.whereOf(M.parseDraft("# t\nplatform: reddit\n\n## Post\nx\n\n## Notes\nPost to /r/SideProject at 15:00")).where === "r/SideProject" && M.whereOf(M.parseDraft("# t\nplatform: reddit\nsubreddit: webdev\n\n## Post\nx")).where === "r/webdev");
  ok("Change it with nothing said: refused", /Say what to change/.test(marketingDraftAnswer("drafts/robin/reddit.md", "change", { dir, ask: " " }).error || ""));
  const ran2 = [];
  const ch = marketingDraftAnswer("drafts/robin/reddit.md", "change", { dir, ask: "Make the title a question.", running: () => false, run: (p) => (ran2.push(p), { id: "k" }) });
  const ans2 = readFileSync(join(dir, ".symbiot", "ANSWERS.md"), "utf8");
  ok("Change it: what you typed goes to its agent for that exact draft, and it starts", ch.ok && ran2.join() === dir && /### Change: drafts\/robin\/reddit\.md\nMake the title a question\./.test(ans2) && /Redraft that same file/.test(ans2), [ch, ans2.slice(-500)]);
  const rc = M.draftPreview("drafts/robin/reddit.md", { dir, cfg });
  ok("…its card says a change is asked, with what you asked, and it leaves your list meanwhile", rc.status === "change" && rc.ask === "Make the title a question." && M.draftFiles(dir).find((f) => f.rel === "drafts/robin/reddit.md").status === "change", rc);
  writeFileSync(join(d, "reddit.md"), readFileSync(join(d, "reddit.md"), "utf8").replace("I built a desktop app that hands tasks to Claude Code", "Would you let an app hand tasks to Claude Code?"));
  ok("…its agent's new version comes back for your OK", M.draftPreview("drafts/robin/reddit.md", { dir, cfg }).status === "");
  marketingDraftAnswer("drafts/robin/reddit.md", "approved", { dir, running: () => true });
  ok("approved, then its picture redrawn: not approved any more", M.draftPreview("drafts/robin/reddit.md", { dir, cfg }).status === "approved" && (writeFileSync(join(d, "card.png"), "png, redrawn"), M.draftPreview("drafts/robin/reddit.md", { dir, cfg }).status === ""));
  const sf0 = join(dir, ".symbiot", "drafts.json"), raw0 = JSON.parse(readFileSync(sf0, "utf8")); delete raw0["drafts/robin/reddit.md"].msig; writeFileSync(sf0, JSON.stringify(raw0));
  ok("…an approval from before pictures were fingerprinted holds for its text", M.draftPreview("drafts/robin/reddit.md", { dir, cfg }).status === "approved");
  writeFileSync(join(d, "card.png"), "png");

  console.log("MARKETING — posted and superseded: off the orb for good");
  const ap2 = marketingDraftAnswer("drafts/robin/week-02.md", "approved", { dir, running: () => true });
  ok("Approve tells its agent how to mark it posted once it's out", ap2.ok && /marketing posted "drafts\/robin\/week-02\.md" --url/.test(readFileSync(join(dir, ".symbiot", "ANSWERS.md"), "utf8")));
  ok("…and the lane's brief says it, and how to mark a redone one superseded", /marketing posted <its file> --url/.test(M.marketingBrief([], { map })) && /marketing superseded <old file> --by <new file>/.test(M.marketingBrief([], { map })) && /never edit `\.symbiot\/drafts\.json` by hand/.test(M.marketingBrief([], { map })));
  ok("a link that isn't a web address: refused", /web address/.test(M.setDraftStatus("drafts/robin/week-02.md", "posted", { dir, url: "javascript:alert(1)" }).error || ""));
  ok("a date that isn't one: refused", /isn't a date/.test(M.setDraftStatus("drafts/robin/week-02.md", "posted", { dir, at: "tuesday-ish" }).error || ""));
  const ps = M.setDraftStatus(join(dir, "drafts/robin/week-02.md"), "posted", { dir, url: "https://www.linkedin.com/feed/update/urn:li:activity:1/", at: "2026-10-13 08:00", now: 5 });
  const kept = M.draftStatuses(dir)["drafts/robin/week-02.md"];
  ok("posted: when, where (its platform) and its link kept by marketing.mjs, the draft named by its full path too", ps.ok && ps.rel === "drafts/robin/week-02.md" && kept.status === "posted" && kept.postedOn === "linkedin" && kept.url.startsWith("https://www.linkedin.com/") && kept.posted === Date.parse("2026-10-13T08:00"), kept);
  const pp = M.draftPreview("drafts/robin/week-02.md", { dir, cfg });
  ok("…its preview says so, with its link", pp.status === "posted" && pp.url === kept.url && /posted already on linkedin/.test(pp.final), pp);
  writeFileSync(join(d, "week-02.md"), readFileSync(join(d, "week-02.md"), "utf8").replace("Robin won't.", "Robin never does."));
  const pe = M.draftPreview("drafts/robin/week-02.md", { dir, cfg });
  ok("an edit after it's posted doesn't reopen it: still posted (its file changed, said)", pe.status === "posted" && pe.edited === true && M.draftFiles(dir).find((f) => f.rel === "drafts/robin/week-02.md").status === "posted", pe);
  const again = marketingDraftAnswer("drafts/robin/week-02.md", "approved", { dir, run: () => { throw new Error("ran"); } });
  ok("Approve on a posted draft: refused, saying it's posted (when, where, its link), and nothing starts", /posted already on linkedin, 2026-10-13 08:00 \(https:\/\/www\.linkedin\.com\/.+\): it can't be approved or posted again/.test(again.error || ""), again);
  ok("…Skip too", /posted already/.test(marketingDraftAnswer("drafts/robin/week-02.md", "skipped", { dir }).error || ""));
  const twice = M.setDraftStatus("drafts/robin/week-02.md", "posted", { dir, now: 9 });
  ok("marked posted twice: the first time stands (its date and link), said", twice.ok && twice.already && M.draftStatuses(dir)["drafts/robin/week-02.md"].posted === kept.posted, twice);
  ok("…and media can't be changed on it", /posted already/.test(M.setDraftMedia("drafts/robin/week-02.md", ["drafts/robin/card.png"], { dir }).error || ""));
  // one its agent marked by hand before there was a posted status: { status: "approved", posted }
  const sf = join(dir, ".symbiot", "drafts.json"), raw = JSON.parse(readFileSync(sf, "utf8"));
  raw["drafts/robin/week-03.md"] = { status: "approved", sig: "old", at: 1, posted: Date.parse("2026-10-09T07:50"), postedOn: "linkedin" }; writeFileSync(sf, JSON.stringify(raw));
  ok("one marked posted by hand before ({ status: approved, posted }) is posted, whatever its text now", M.draftPreview("drafts/robin/week-03.md", { dir, cfg }).status === "posted" && !!marketingDraftAnswer("drafts/robin/week-03.md", "approved", { dir }).error);
  // superseded: a redo replaces the old one
  writeFileSync(join(d, "week-04.md"), `# Week 4\nproduct: Robin\n\n## Post\nThe old take.\n`);
  writeFileSync(join(d, "week-04b.md"), `# Week 4, redone\nproduct: Robin\n\n## Post\nThe new take.\n`);
  ok("superseded by a draft that isn't there: refused", /isn't a draft in the lane/.test(M.setDraftStatus("drafts/robin/week-04.md", "superseded", { dir, by: "drafts/robin/nope.md" }).error || ""));
  ok("…nor by itself", /can't replace itself/.test(M.setDraftStatus("drafts/robin/week-04.md", "superseded", { dir, by: "drafts/robin/week-04.md" }).error || ""));
  const sp = M.setDraftStatus("drafts/robin/week-04.md", "superseded", { dir, by: "drafts/robin/week-04b.md" });
  ok("superseded, naming the draft that replaces it", sp.ok && M.draftStatuses(dir)["drafts/robin/week-04.md"].by.join() === "drafts/robin/week-04b.md");
  const sa = marketingDraftAnswer("drafts/robin/week-04.md", "approved", { dir, run: () => { throw new Error("ran"); } });
  ok("…Approve on it: refused, naming the one to approve instead", /superseded by drafts\/robin\/week-04b\.md: approve that one instead/.test(sa.error || ""), sa);
  ok("…superseded without naming one is fine too (and has no post to need)", M.setDraftStatus("drafts/robin/sneaky.md", "superseded", { dir }).ok);
  const ms = marketingState({ deps: { repos: () => ({}), tasks: () => [], posts: () => ({ posts: [], done: [] }), agents: () => [], pending: () => [], files: () => M.draftFiles(dir) } });
  ok("posted and superseded drafts leave the Marketing orb; the redo is there to approve", !ms.needs.some((n) => ["drafts/robin/week-02.md", "drafts/robin/week-03.md", "drafts/robin/week-04.md"].includes(n.rel)) && ms.needs.some((n) => n.rel === "drafts/robin/week-04b.md"), ms.needs.map((n) => n.rel));
  ok("a status there isn't: refused", !!M.setDraftStatus("drafts/robin/week-04b.md", "maybe", { dir }).error);
  const cli = (args) => { try { return { out: execFileSync(process.execPath, [join(process.cwd(), "index.mjs"), "marketing", ...args], { encoding: "utf8", env: { ...process.env, HOME } }), code: 0 }; } catch (e) { return { out: String(e.stdout || ""), code: e.status }; } };
  mkdirSync(join(M.MARKETING_DIR, "drafts", "bookly"), { recursive: true });
  writeFileSync(join(M.MARKETING_DIR, "drafts", "bookly", "teaser.md"), "# Teaser\nproduct: Bookly\n\n## Post\nSoon.\n");
  writeFileSync(join(M.MARKETING_DIR, "drafts", "bookly", "teaser-2.md"), "# Teaser, redone\nproduct: Bookly\n\n## Post\nSoon, sooner.\n");
  const c1 = cli(["posted", "drafts/bookly/teaser-2.md", "--url", "https://www.linkedin.com/feed/update/x/", "--plain"]);
  ok("the CLI an agent runs: symbiot marketing posted <draft> --url <link>", c1.code === 0 && /posted on linkedin/.test(c1.out) && M.draftStatuses()["drafts/bookly/teaser-2.md"].url === "https://www.linkedin.com/feed/update/x/", c1);
  const c2 = cli(["superseded", "drafts/bookly/teaser.md", "--by", "drafts/bookly/teaser-2.md", "--plain"]);
  ok("…symbiot marketing superseded <draft> --by <new draft>", c2.code === 0 && M.draftStatuses()["drafts/bookly/teaser.md"].by[0] === "drafts/bookly/teaser-2.md", c2);
  const c3 = cli(["superseded", "drafts/bookly/teaser-2.md", "--plain"]);
  ok("…refusing, with why and a non-zero exit, what it can't do", c3.code === 1 && /posted already/.test(c3.out), c3);
  ok("…and listing them", /posted\s+drafts\/bookly\/teaser-2\.md/.test(cli(["list", "--plain"]).out));
}

console.log("MARKETING — LinkedIn linked: no card asks you to sign in or do it by hand");
{
  const { parseQuestions } = await import("../agents.mjs");
  const { loadConfig, saveConfig } = await import("../core.mjs");
  const md = "## Questions\n### let a poster on this computer put the robin posts up for you?\nweeks 2-4 of the robin linkedin series are drafted.\n- 👤 You (only you: your linkedin sign-in): ok it, and i'll have the ops lane build the poster (recommended)\n- 👤 You (only you: your linkedin): keep doing it by hand. schedule each one in linkedin yourself\n";
  const cfg0 = loadConfig(); saveConfig({ ...cfg0, linked: { linkedin: { at: 1 } } });
  const ask = parseQuestions(md), st = marketingState({ deps: { repos: () => map, tasks: () => [], posts: () => ({ posts: [], done: [] }), agents: () => [{ path: M.MARKETING_DIR, status: "done", ask }], pending: () => [], files: () => [] } });
  const opts = st.needs[0].options;
  ok("the card's options, as Marketing and Home show them: the agent posts through the linked account once you approve; no sign-in, no by hand, nothing \"only you\"", opts.length === 1 && /^🤖 Agent: post it through Symbiot's browser, already signed in to LinkedIn, once you approve its preview/.test(opts[0]) && !opts.some((o) => /👤|only you|sign[- ]?in|by hand|yourself/i.test(o)), opts);
  saveConfig({ ...cfg0, linked: undefined });
  ok("…while LinkedIn isn't linked, signing in is still yours to do", /^👤/.test(parseQuestions(md).questions[0].options[0]), parseQuestions(md).questions[0].options);
}

// only a file that says it is a social post is one; schedules and store listings are documents
{
  const { marketingDraftAnswer } = await import("../home.mjs");
  const dir = join(HOME, "lane-docs"), d = join(dir, "drafts", "quartz");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "posting-schedule.md"), "# Quartz posting schedule (SAST)\n\nproduct: Quartz\n\nOne post a day per platform.\n\n| Day | Instagram | Facebook | X |\n|---|---|---|---|\n| Mon | 08:00 | 09:00 | 10:00 |\n\nhttps://play.google.com/store/apps/details?id=com.quartz.quartz\n");
  writeFileSync(join(d, "play-listing.md"), "# Quartz Google Play listing\n\nproduct: Quartz\ntype: listing\n\nTitle (30 max): Quartz: Dating, Likes That Count\nShort description (80 max): x\n");
  writeFileSync(join(d, "typed-schedule.md"), "# s\ntype: schedule\nplatform: instagram\n\n## Post\nnot a post\n");
  writeFileSync(join(d, "ig.md"), "# IG\ntype: post\nplatform: instagram\n\n## Post\nHello world #quartz\n");
  const get = (n) => M.draftFiles(dir, []).find((f) => f.rel === "drafts/quartz/" + n);
  ok("a schedule saying nothing about being a post is a document", get("posting-schedule.md").doc === true && M.parseDraft("# s\n\n| a |\n").isPost === false);
  ok("…a store listing typed `listing` too, and `type:` wins over a platform and a ## Post", get("play-listing.md").doc && get("typed-schedule.md").doc);
  ok("…a `type: post` with a platform is a post", !get("ig.md").doc && M.draftPreview("drafts/quartz/ig.md", { dir, cfg: {} }).isPost === true);
  ok("…and one in the old layout (## Post, or --- fenced) still is", M.parseDraft("# t\nplatform: linkedin\n\n## Post\nx\n").isPost && M.parseDraft("# t\n\n---\n\nx\n\n---\nn\n").isPost);
  ok("…the real schedule's shape (## Post, no platform, a table in it) is a document; a table-free ## Post stays a post", M.parseDraft("# Quartz posting schedule (SAST)\nproduct: Quartz\n\n## Post\n\nOne post a day.\n\n| Day | X |\n|-----|---|\n| Mon | 12:30 |\n").isPost === false && M.parseDraft("# t\n\n## Post\nhello\n").isPost === true);
  const pv = M.draftPreview("drafts/quartz/posting-schedule.md", { dir, cfg: {} });
  ok("a document previews as its whole text, with no post card", pv.isPost === false && /\| Mon \|/.test(pv.text) && pv.body === undefined);
  ok("it isn't on Home's needs-you list as a post to approve; the real post is", marketingState({ map: { marketing: dir }, deps: { repos: () => ({}), tasks: () => [], posts: () => ({ posts: [], done: [] }), agents: () => [], pending: () => [], files: () => M.draftFiles(dir, []) } }).needs.filter((n) => n.kind === "post").map((n) => n.rel).join() === "drafts/quartz/ig.md");
  ok("a document can't be approved or posted", !!M.setDraftStatus("drafts/quartz/posting-schedule.md", "approved", { dir }).error && !!marketingDraftAnswer("drafts/quartz/play-listing.md", "approved", { dir }).error);
  ok("…but a listing is marked done", marketingDraftAnswer("drafts/quartz/play-listing.md", "done", { dir }).ok && M.draftPreview("drafts/quartz/play-listing.md", { dir, cfg: {} }).done === true);
  ok("a post can't be 'done'", !!M.setDraftStatus("drafts/quartz/ig.md", "done", { dir }).error);
  ok("the agent's brief says to type each file", /`type: post`/.test(M.marketingBrief([]).join("\n")));
}

{
  ok("any other named platform (tiktok, facebook groups) is a post too, but a site page, a store or a post with no text stays a document", M.parseDraft("# t\nplatform: tiktok\n\n## Post\nhi\n").isPost === true && M.parseDraft("# t\nplatform: facebook groups\n\n## Post\nHi group.\n").isPost === true && M.parseDraft("# t\nplatform: web\n\n## Post\nCopy for the site.\n").isPost === false && M.parseDraft("# p\nplatform: play store\n\n## Post\nx\n").isPost === false && M.parseDraft("# p\nplatform: hackernews\n").isPost === false);
  console.log("MARKETING — blog and Show HN drafts get an approval card; an edit after approval asks again (2026-10-16)");
  const dir = join(HOME, "lane-launch"), d = join(dir, "drafts", "symbiot"); mkdirSync(d, { recursive: true });
  const hn = (link) => `# Symbiot hackernews 2026-10-20\n\nproduct: Symbiot\nplatform: hackernews\nwhen: 2026-10-20 15:00\n\n## Post\n\nShow HN: Symbiot – a desktop app\n\nI built it for people who use Claude Code.\n\n## First comment\n\nLink: ${link}\nInstall: npm install -g symbiot\n\n## Notes\n\n- submit by hand? no.\n`;
  writeFileSync(join(d, "2026-10-20-hackernews.md"), hn("https://symbiot.co.za/?utm_source=hackernews"));
  writeFileSync(join(d, "2026-10-20-launch-post.md"), "# Launch post\n\nproduct: Symbiot\nplatform: blog\nwhen: 2026-10-20 08:00\n\n## Post\n\nSymbiot: one orb\n\nIf you already use a coding agent.\n\n- Free to use\n\n## Notes\n\nn\n");
  const { marketingDraftAnswer } = await import("../home.mjs");
  const H = "drafts/symbiot/2026-10-20-hackernews.md", B = "drafts/symbiot/2026-10-20-launch-post.md";
  ok("a blog or Hacker News draft is a post, not a document (they had no Approve at all)", M.parseDraft(readFileSync(join(d, "2026-10-20-launch-post.md"), "utf8")).isPost && M.parseDraft(readFileSync(join(d, "2026-10-20-hackernews.md"), "utf8")).isPost);
  ok("…also under the names people write (hn, Hacker News)", M.parseDraft("# t\nplatform: HN\n\n## Post\nx").platform === "hackernews" && M.parseDraft("# t\nplatform: Hacker News\n\n## Post\nx").isPost);
  ok("…and a place for documents (a landing page, a store listing) is still a document", !M.parseDraft("# t\nplatform: landing page\n\n## Post\nx").isPost);
  const hp = M.draftPreview(H, { dir, cfg: {} }), bp = M.draftPreview(B, { dir, cfg: {} });
  ok("both lit as posts to approve on the Marketing orb, each by its file", marketingState({ map: { marketing: dir }, deps: { repos: () => ({}), tasks: () => [], posts: () => ({ posts: [], done: [] }), agents: () => [], pending: () => [], files: () => M.draftFiles(dir, []) } }).needs.filter((n) => n.kind === "post").map((n) => n.rel).sort().join() === [H, B].join());
  ok("the Show HN card: title, the site's address without tracking, the first comment", hp.hn && hp.hn.title === "Show HN: Symbiot – a desktop app" && hp.hn.url === "https://symbiot.co.za/" && /npm install/.test(hp.comment) && hp.hn.signedIn === true, hp.hn);
  ok("…and a Sign in to Hacker News when the browser is known to be signed out of it", M.draftPreview(H, { dir, cfg: {}, cookie: (h) => ({ host: h[0], cookie: "user", found: false }) }).hn.signedIn === false && M.draftPreview(H, { dir, cfg: {}, cookie: () => ({ found: null }) }).hn.signedIn === true);
  ok("the blog card is the whole post, its headline first", bp.platform === "blog" && /^Symbiot: one orb/.test(bp.body) && /Free to use/.test(bp.body));
  const ran = [];
  const ap = marketingDraftAnswer(H, "approved", { dir, running: () => false, run: (p) => (ran.push(p), { id: "j" }) });
  const ans = readFileSync(join(dir, ".symbiot", "ANSWERS.md"), "utf8");
  ok("approving the Show HN tells its agent to submit it itself, from the user's account: title, URL, first comment; never by hand", ap.ok && ran.join() === dir && /Submit it to Hacker News at 2026-10-20 15:00/.test(ans) && /URL https:\/\/symbiot\.co\.za\/(?!\?)/.test(ans) && /first comment/.test(ans) && /never a step for the user/.test(ans), ans.slice(0, 600));
  ok("…and approves it with its first comment: a changed comment asks again", M.draftPreview(H, { dir, cfg: {} }).status === "approved" && (writeFileSync(join(d, "2026-10-20-hackernews.md"), hn("https://symbiot.co.za/?utm_source=hn2")), M.draftPreview(H, { dir, cfg: {} }).status === ""));
  const re = M.draftPreview(H, { dir, cfg: {} });
  ok("…its card says it was edited after you approved it", re.reopened && re.reopened.was === "approved", re.reopened);
  const need = marketingState({ map: { marketing: dir }, deps: { repos: () => ({}), tasks: () => [], posts: () => ({ posts: [], done: [] }), agents: () => [], pending: () => [], files: () => M.draftFiles(dir, []) } }).needs.find((n) => n.rel === H);
  ok("…and is back on the orb at once, saying so", need && /edited since you approved it/.test(need.text), need);
  ok("a draft never answered isn't said to be edited", !M.draftPreview(B, { dir, cfg: {} }).reopened);
  const { draftCardsIn, readReport } = await import("../reports.mjs");
  const rep = "# Symbiot launch posts: last link and claim check\n\n| Post | Link |\n|---|---|\n| Blog post, 2026-10-20 08:00 | x |\n| Show HN, 2026-10-20 15:00 | y |\n\nTitle and text are in `drafts/symbiot/2026-10-20-hackernews.md`.\n\nApprove both drafts.\n";
  ok("a report naming a draft's file carries that draft's card", draftCardsIn(rep, { dir }).join() === H, draftCardsIn(rep, { dir }));
  ok("…a marketing report asking for approval, with a waiting draft's product and date in it, carries both cards", draftCardsIn(rep, { dir, lane: true }).sort().join() === [H, B].join(), draftCardsIn(rep, { dir, lane: true }));
  ok("…a report that doesn't ask for approval, or names no waiting draft, carries none", draftCardsIn(rep.replace(/Approve both drafts\./, "All fine."), { dir, lane: true }).join() === H && draftCardsIn("# Notes about Robin 2026-10-20\napprove it", { dir, lane: true }).length === 0);
  mkdirSync(join(dir, ".symbiot"), { recursive: true }); writeFileSync(join(dir, ".symbiot", "LINK-CHECK.md"), rep);
  mkdirSync(join(M.MARKETING_DIR, "drafts", "symbiot"), { recursive: true }); writeFileSync(join(M.MARKETING_DIR, H), readFileSync(join(dir, H), "utf8")); // the lane's own, where a report's path points
  const rr = readReport("x", { list: [{ id: "x", title: "t", name: "LINK-CHECK.md", file: join(dir, ".symbiot", "LINK-CHECK.md"), folder: dir, mtime: 1 }], mark: false });
  ok("an opened report hands the UI those cards, to render with Approve, Reject and Change", Array.isArray(rr.cards) && rr.cards.join() === H, rr.cards);
  ok("the brief: Show HN is submitted by the agent, no hand-offs a signed-in site could do", /never write \\?"submit by hand\\?"/i.test(M.marketingBrief([]).join("\n")) && /hands the user a step a connector or a signed-in site could do|never hand the user a step a connector or a signed-in site could do/i.test(M.marketingBrief([]).join("\n")));
}

console.log(`\n${fail ? "✗" : "✓"} marketing: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
