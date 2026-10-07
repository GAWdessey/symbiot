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
ok("its rules: drafts per product, a strong hook and the end goal, never posting", /drafts\/<product>\//.test(md) && /strong hook/.test(md) && /end goal/.test(md) && /Never post, publish, schedule or send/.test(md));
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
ok("what needs you: its agent's question, its work for your OK, the drafts waiting", s.needCount === 3 && s.needs.map((n) => n.kind).join() === "ask,approve,draft", s.needs);
ok("each tagged: the question and the draft are Dailify's", s.needs[0].product === "Dailify" && s.needs[2].product === "Dailify");
ok("its tasks, open ones only, each with its product and where it is", s.lane.length === 2 && s.lane[0].product === "Dailify" && s.lane[0].status === "waiting" && s.lane[1].status === "review" && s.lane[0].text === "Write the launch post", s.lane);
ok("other lanes' tasks about marketing (pricing, not a login bug)", s.elsewhere.length === 1 && s.elsewhere[0].id === "c" && s.elsewhere[0].product === "Symbiot", s.elsewhere);
ok("what its agent drafted, and the products to pick from", s.files.length === 2 && s.products.includes("Dailify") && s.products.includes("Symbiot"));
ok("on: Home shows its orb", s.on === true);
const quiet = marketingState({ deps: { repos: () => ({ symbiot: sym }), tasks: () => [], posts: () => ({ posts: [], done: [] }), agents: () => [], pending: () => [], files: () => [] } });
ok("a new user with nothing to market: no orb", quiet.on === false && quiet.needCount === 0);

const h = homeState({ fresh: true, deps: { repos: () => ({ symbiot: sym, marketing: M.MARKETING_DIR }), board: () => ({ cards: [] }), pending: () => [], agents: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, waits: () => [], clashes: () => [], agentGone: () => "", signedOut: () => [], stuck: () => [], agentCmd: () => "claude", next: { taken: () => ({}), tasks: () => [], mind: () => [] }, marketing: () => ({ needs: 2, working: false, waiting: 1 }) } });
ok("Home carries what lights the orb", h.marketing && h.marketing.needs === 2);
const h0 = homeState({ fresh: true, deps: { repos: () => ({ marketing: M.MARKETING_DIR }), board: () => ({ cards: [] }), pending: () => [], agents: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, waits: () => [], clashes: () => [], agentGone: () => "", signedOut: () => [], stuck: () => [], agentCmd: () => "claude", marketing: () => false } });
ok("Marketing alone isn't your work: Home still asks where your repos are", h0.you.some((y) => y.id === "setup:folders"));

console.log("MARKETING — assigning work to it");
let saved = null;
const t1 = marketingTask("Write three follow-ups", "Dailify", { add: (text, r) => ({ id: "n", text, repo: r }) });
ok("Add: a task for Marketing, tagged with its product", t1.text === "[Dailify] Write three follow-ups" && t1.repo === "marketing", t1);
ok("Add with nothing to do: refused", !!marketingTask("  ", "Dailify").error);
const all = [{ id: "c", text: "Add a pricing page to the Symbiot site", repo: "symbiot" }, { id: "r", text: "A launch", repo: "symbiot", review: true }];
const mv = moveToMarketing("c", "", { load: () => all, save: (x) => { saved = x; }, map });
ok("Move: another lane's task goes to Marketing, tagged with the product its words name", mv.ok && saved[0].repo === "marketing" && saved[0].text === "[Symbiot] Add a pricing page to the Symbiot site", saved && saved[0]);
ok("not one waiting for your OK where it is", !!moveToMarketing("r", "", { load: () => all, save: () => {} }).error);

console.log(`\n${fail ? "✗" : "✓"} marketing: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
