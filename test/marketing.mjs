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
const sym = repo("symbiot", "symbiot"), dai = repo("CallForge AI", "Dailify"), srv = repo("server", "server");
const map = { symbiot: sym, "CallForge AI": dai, server: srv, marketing: M.MARKETING_DIR };

console.log("MARKETING — product tags");
const names = M.productNames(map);
ok("the products are the repos' names as people say them, capitalised (Dailify for CallForge AI)", names.includes("Symbiot") && names.includes("Dailify") && !names.includes("marketing"), names);
ok("a [tag] wins: [Dailify] Write the launch post → Dailify", M.productOf("[Dailify] Write the launch post about Symbiot", names) === "Dailify");
ok("no tag: the first product named, as written", M.productOf("A demo video of Symbiot, then one of Dailify", names) === "Symbiot");
ok("a lowercase word isn't a product (\"the server\" isn't Server)", M.productOf("restart the server after the launch", names) === "");
ok("nothing named: no product", M.productOf("a post about my week", names) === "");
ok("tagged puts one tag first, replacing the old", M.tagged("[Symbiot] the launch post", "Dailify") === "[Dailify] the launch post" && M.tagged("plain", "") === "plain");
ok("untagged drops it for showing", M.untagged("[Dailify] Write it") === "Write it");
ok("marketing words: launches, pricing, LinkedIn posts, demo videos", ["Plan the launch", "a pricing page", "LinkedIn posts for the week", "cut a demo video"].every((t) => M.MARKETING_WORDS.test(t)) && !M.MARKETING_WORDS.test("fix the login bug"));

console.log("MARKETING — its folder, made once, a git repo of its own");
ok("not there before anything goes to it", !existsSync(M.MARKETING_DIR));
ok("ensureMarketing makes it: README, drafts/, .symbiot kept out", M.ensureMarketing() === M.MARKETING_DIR && /^# Marketing/.test(readFileSync(join(M.MARKETING_DIR, "README.md"), "utf8")) && existsSync(join(M.MARKETING_DIR, "drafts")) && /\.symbiot/.test(readFileSync(join(M.MARKETING_DIR, ".gitignore"), "utf8")));
const log = (() => { try { return execFileSync("git", ["-C", M.MARKETING_DIR, "log", "--oneline"], { encoding: "utf8" }); } catch { return ""; } })();
ok("with a first commit, so Approve has a branch to commit on", /a lane of its own/.test(log), log);
ok("a second call leaves it be", M.ensureMarketing() === M.MARKETING_DIR);
mkdirSync(join(M.MARKETING_DIR, "drafts", "dailify"), { recursive: true });
writeFileSync(join(M.MARKETING_DIR, "drafts", "dailify", "launch.md"), "# The Dailify launch post\nproduct: Dailify\n\nHook.\n");
mkdirSync(join(M.MARKETING_DIR, "drafts", "symbiot"), { recursive: true });
writeFileSync(join(M.MARKETING_DIR, "drafts", "symbiot", "demo-video-script.md"), "No title here.\n");
const files = M.draftFiles(M.MARKETING_DIR, names);
ok("what its agent drafted: title and product from the file, else its name and folder", files.length === 2 && files.some((f) => f.name === "The Dailify launch post" && f.product === "Dailify") && files.some((f) => f.name === "demo video script" && f.product === "Symbiot"), files);

console.log("MARKETING — the lane in every brief, and its own");
const rules = handoverRules(["symbiot", "dailify", "marketing"], "symbiot").join("\n");
ok("another lane's brief names marketing as a lane of its own, not a repo", /- `marketing`: marketing for any product/.test(rules) && !/`symbiot`, `dailify`, `marketing`/.test(rules), rules);
ok("Marketing's own brief doesn't offer itself", !/- `marketing`:/.test(handoverRules(["symbiot", "marketing"], "marketing").join("\n")));
const brief = M.marketingBrief([{ text: "[Dailify] Write the launch post" }, { text: "Cut a demo video of Symbiot" }, { text: "[Acme] a teaser" }], { map });
const md = buildTasksMd("marketing", { lanes: Object.keys(map), about: brief }, [{ text: "[Dailify] Write the launch post" }]);
ok("its brief says what the lane is, before its tasks", md.indexOf("## This lane: marketing") > 0 && md.indexOf("## This lane: marketing") < md.indexOf("## Tasks"));
ok("with each product its tasks name and where its code is", md.includes(`Dailify: \`${dai}\``) && md.includes(`Symbiot: \`${sym}\``), md.slice(md.indexOf("## This lane"), md.indexOf("## Tasks")));
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
  { id: "a", text: "[Dailify] Write the launch post", repo: "marketing", ts: now },
  { id: "b", text: "[Symbiot] A demo video", repo: "marketing", review: true, ts: now },
  { id: "c", text: "Add a pricing page to the Symbiot site", repo: "symbiot", ts: now },
  { id: "d", text: "Fix the login bug", repo: "symbiot", ts: now },
  { id: "e", text: "an old launch", repo: "marketing", done: true, archived: true }];
const posts = { canDraft: true, posts: [{ id: "p1", status: "waiting", text: "This week Dailify learned to plan your day." }, { id: "p2", status: "approved", text: "x" }], done: [] };
const agents = [{ path: M.MARKETING_DIR, status: "done", ask: { questions: [{ q: "Dailify's end goal isn't written down. Use this one?", options: ["Use it (recommended)", "I'll write my own"] }] } }];
const pending = [{ repo: "marketing", path: M.MARKETING_DIR, tasks: [tasks[1]], files: [{ file: "drafts/symbiot/demo.md" }] }];
const s = marketingState({ deps: { repos: () => map, tasks: () => tasks, posts: () => posts, agents: () => agents, pending: () => pending } });
ok("what needs you: its agent's question, its work for your OK, the drafts waiting, each post it drafted to approve", s.needCount === 5 && s.needs.map((n) => n.kind).join() === "ask,approve,draft,post,post", s.needs);
const launchPost = s.needs.find((n) => n.kind === "post" && n.rel === "drafts/dailify/launch.md") || {};
ok("…a post to approve: by its file, so Preview opens it, with its product", launchPost.product === "Dailify" && launchPost.text === "The Dailify launch post", s.needs);
const s2 = marketingState({ deps: { repos: () => map, tasks: () => [], posts: () => ({ posts: [], done: [] }), agents: () => [], pending: () => [], files: () => [{ rel: "a.md", name: "A", product: "Steve", status: "approved" }, { rel: "b.md", name: "B", product: "Steve", status: "skipped" }, { rel: "c.md", name: "C", product: "Steve", status: "" }] } });
ok("…only the ones not approved or skipped yet", s2.needs.map((n) => n.rel).join() === "c.md" && s2.needCount === 1, s2.needs);
ok("each tagged: the question and the draft are Dailify's", s.needs[0].product === "Dailify" && s.needs[2].product === "Dailify");
ok("its tasks, open ones only, each with its product and where it is", s.lane.length === 2 && s.lane[0].product === "Dailify" && s.lane[0].status === "waiting" && s.lane[1].status === "review" && s.lane[0].text === "Write the launch post", s.lane);
ok("other lanes' tasks about marketing (pricing, not a login bug)", s.elsewhere.length === 1 && s.elsewhere[0].id === "c" && s.elsewhere[0].product === "Symbiot", s.elsewhere);
ok("what its agent drafted, and the products to pick from", s.files.length === 2 && s.products.includes("Dailify") && s.products.includes("Symbiot"));
ok("on: Home shows its orb", s.on === true);
const quiet = marketingState({ deps: { repos: () => ({ symbiot: sym }), tasks: () => [], posts: () => ({ posts: [], done: [] }), agents: () => [], pending: () => [], files: () => [] } });
ok("a new user with nothing to market: no orb", quiet.on === false && quiet.needCount === 0);

const h = homeState({ fresh: true, deps: { repos: () => ({ symbiot: sym, marketing: M.MARKETING_DIR }), board: () => ({ cards: [] }), pending: () => [], agents: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, waits: () => [], clashes: () => [], agentGone: () => "", signedOut: () => [], stuck: () => [], agentCmd: () => "claude", next: { taken: () => ({}), tasks: () => [], mind: () => [] }, marketing: () => ({ needs: 2, working: false, waiting: 1 }) } });
ok("Home carries what lights the orb", h.marketing && h.marketing.needs === 2);
const h0 = homeState({ fresh: true, deps: { search: () => ({ searching: false, at: 1 }), repos: () => ({ marketing: M.MARKETING_DIR }), board: () => ({ cards: [] }), pending: () => [], agents: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, waits: () => [], clashes: () => [], agentGone: () => "", signedOut: () => [], stuck: () => [], agentCmd: () => "claude", marketing: () => false } });
ok("Marketing alone isn't your work: once a search found nothing, Home asks for the folder", h0.you.some((y) => y.id === "setup:folders"));

console.log("MARKETING — assigning work to it");
let saved = null;
const t1 = marketingTask("Write three follow-ups", "Dailify", { add: (text, r) => ({ id: "n", text, repo: r }) });
ok("Add: a task for Marketing, tagged with its product", t1.text === "[Dailify] Write three follow-ups" && t1.repo === "marketing", t1);
ok("Add with nothing to do: refused", !!marketingTask("  ", "Dailify").error);
const all = [{ id: "c", text: "Add a pricing page to the Symbiot site", repo: "symbiot" }, { id: "r", text: "A launch", repo: "symbiot", review: true }];
const mv = moveToMarketing("c", "", { load: () => all, save: (x) => { saved = x; }, map });
ok("Move: another lane's task goes to Marketing, tagged with the product its words name", mv.ok && saved[0].repo === "marketing" && saved[0].text === "[Symbiot] Add a pricing page to the Symbiot site", saved && saved[0]);
ok("not one waiting for your OK where it is", !!moveToMarketing("r", "", { load: () => all, save: () => {} }).error);

console.log("MARKETING — a draft shown as the post it will be");
{
  const { marketingDraftAnswer } = await import("../home.mjs");
  const dir = join(HOME, "lane"), d = join(dir, "drafts", "steve");
  mkdirSync(d, { recursive: true }); mkdirSync(join(HOME, "outside"), { recursive: true });
  writeFileSync(join(d, "card.png"), "png"); writeFileSync(join(HOME, "outside", "secret.png"), "x");
  const post = "The best answer my AI gave this month was \"I don't know.\"\n\nI gave Steve a number puzzle he hadn't cracked yet. His reply:\n\n\"I can't work out what you're doing to those numbers yet. I'd be guessing.\"\n\nMost AI tools would give you a confident answer anyway. Steve doesn't.\n\n#AI #Trust #BuildInPublic";
  writeFileSync(join(d, "week-02.md"), `# Week 2\n\nproduct: Steve\nplatform: linkedin\nwhen: 2026-10-13 08:00\nmedia: card.png\n\n## Post\n${post}\n\n## Notes\nWhy this result: it shows doubt. Checked against the never-list.\n`);
  writeFileSync(join(d, "week-03.md"), `# Week 3\n\nproduct: Steve\n\n---\n\n${post}\n\n---\n_Image: \`card.png\` (1200×1200). Schedule for Tue 2026-10-20, 08:00._\n`);
  writeFileSync(join(d, "sneaky.md"), "# x\nmedia: ../../../outside/secret.png\n\n## Post\nhi\n");
  const cfg = { profile: { name: "Garth White", headline: "Building Steve" } };
  const p2 = M.draftPreview("drafts/steve/week-02.md", { dir, cfg });
  ok("## Post is the post, to the character: its line breaks and hashtags, nothing of the notes", p2.body === post && !/never-list/.test(p2.body) && p2.notes === "Why this result: it shows doubt. Checked against the never-list.", p2);
  ok("…its head: platform, when, its picture next to it, and who it's from (config.profile)", p2.platform === "linkedin" && p2.when === "2026-10-13 08:00" && p2.media.length === 1 && p2.media[0].rel === "drafts/steve/card.png" && p2.author.name === "Garth White" && p2.author.headline === "Building Steve" && p2.author.initials === "GW", p2);
  ok("…cut where LinkedIn's feed cuts it (about 210 characters, at a word), the whole text kept", p2.cut && p2.shown.length <= M.SEE_MORE && post.startsWith(p2.shown) && !/\s$/.test(p2.shown), p2.shown);
  ok("…its hashtags found", p2.hashtags.join(" ") === "#AI #Trust #BuildInPublic", p2.hashtags);
  ok("a short post isn't cut", !M.seeMore("short and sweet").cut);
  const p3 = M.draftPreview("drafts/steve/week-03.md", { dir, cfg });
  ok("a draft from before (post between ---): the same post, its picture and date read from the notes, the notes kept apart", p3.body === post && p3.format === "legacy" && p3.media[0].name === "card.png" && p3.when === "2026-10-20 08:00" && /^_Image/.test(p3.notes), p3);
  ok("a draft can't show a file outside the lane, nor be read from outside it", M.draftPreview("drafts/steve/sneaky.md", { dir, cfg }).media.length === 0 && !!M.draftPreview("../outside/secret.png", { dir, cfg }).error && !M.laneMedia("../outside/secret.png", { dir, cfg }));
  const ran = [];
  const ap = marketingDraftAnswer("drafts/steve/week-02.md", "approved", { dir, running: () => false, run: (p) => (ran.push(p), { id: "j" }) });
  const ans = readFileSync(join(dir, ".symbiot", "ANSWERS.md"), "utf8");
  ok("Approve on the preview: its agent is told to schedule it through Symbiot's signed-in browser with exactly that text, and starts", ap.ok && ran.join() === dir && /### Approved: drafts\/steve\/week-02\.md/.test(ans) && /scheduled in linkedin's own scheduler for 2026-10-13 08:00, through Symbiot's signed-in browser, with exactly the text/.test(ans) && /card\.png attached/.test(ans), [ap, ans]);
  ok("…and the preview says it's approved", M.draftPreview("drafts/steve/week-02.md", { dir, cfg }).status === "approved" && M.draftFiles(dir).find((f) => f.rel === "drafts/steve/week-02.md").status === "approved");
  writeFileSync(join(d, "week-02.md"), readFileSync(join(d, "week-02.md"), "utf8").replace("Steve doesn't.", "Steve won't."));
  ok("…until its post changes: a changed post asks for your OK again", M.draftPreview("drafts/steve/week-02.md", { dir, cfg }).status === "");
  const sk = marketingDraftAnswer("drafts/steve/week-03.md", "skipped", { dir, run: () => { throw new Error("ran"); } });
  ok("Skip: its agent is told not to post it, and nothing starts", sk.ok && /### Skipped: drafts\/steve\/week-03\.md\nDon't post it/.test(readFileSync(join(dir, ".symbiot", "ANSWERS.md"), "utf8")), sk);
  ok("one that isn't there: says so", !!marketingDraftAnswer("drafts/steve/gone.md", "approved", { dir }).error);
}

console.log("MARKETING — LinkedIn linked: no card asks you to sign in or do it by hand");
{
  const { parseQuestions } = await import("../agents.mjs");
  const { loadConfig, saveConfig } = await import("../core.mjs");
  const md = "## Questions\n### let a poster on this computer put the steve posts up for you?\nweeks 2-4 of the steve linkedin series are drafted.\n- 👤 You (only you: your linkedin sign-in): ok it, and i'll have the ops lane build the poster (recommended)\n- 👤 You (only you: your linkedin): keep doing it by hand. schedule each one in linkedin yourself\n";
  const cfg0 = loadConfig(); saveConfig({ ...cfg0, linked: { linkedin: { at: 1 } } });
  const ask = parseQuestions(md), st = marketingState({ deps: { repos: () => map, tasks: () => [], posts: () => ({ posts: [], done: [] }), agents: () => [{ path: M.MARKETING_DIR, status: "done", ask }], pending: () => [], files: () => [] } });
  const opts = st.needs[0].options;
  ok("the card's options, as Marketing and Home show them: the agent posts through the linked account once you approve; no sign-in, no by hand, nothing \"only you\"", opts.length === 1 && /^🤖 Agent: post it through Symbiot's browser, already signed in to LinkedIn, once you approve its preview/.test(opts[0]) && !opts.some((o) => /👤|only you|sign[- ]?in|by hand|yourself/i.test(o)), opts);
  saveConfig({ ...cfg0, linked: undefined });
  ok("…while LinkedIn isn't linked, signing in is still yours to do", /^👤/.test(parseQuestions(md).questions[0].options[0]), parseQuestions(md).questions[0].options);
}

console.log(`\n${fail ? "✗" : "✓"} marketing: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
