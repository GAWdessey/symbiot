// The UI specialist (design.mjs; tasks.mjs, mind.mjs, route.mjs, agents.mjs uiReview): UI work gets
// the design standard in its brief, the strongest model, screenshots it must look at before it
// ticks, and a separate critic who passes it or sends it back, two rounds at most. A call-centre
// demo was ticked on its tests alone, a bare developer console nobody had looked at (22 Oct 2026).
// Isolated HOME.
//
//   node test/design.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-design-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const D = await import("../design.mjs");
const { pickModel } = await import("../route.mjs");
const { buildTasksMd } = await import("../tasks.mjs");
const { actBrief } = await import("../mind.mjs");
const A = await import("../agents.mjs");

try {
  console.log("DESIGN — what counts as UI work");
  const ui = ["Build the call-centre demo for the pilot", "Fix the login page layout on mobile", "Redesign the landing page", "Make the admin dashboard easier to read", "Polish the onboarding screens", "Fix the Settings page layout on mobile", "Restyle the sign-in page", "Update the Android app screens", "Take new demo screenshots", "Add a button to Home", "Style the card component with CSS"];
  const not = ["Draft the post for the Marketing page", "use symbiot screens to read the report", "deploy the api to prod", "Rebase the branch onto main", "Send Pat the proof", "Add a test for the export", "Move the domain into a new account", "Write the report to the Reports page"];
  ok("asked for in words: a demo, a page, a dashboard, screens, layout, styling, a component, mobile app screens, demo screenshots", ui.every((t) => D.isUiWork(t)), ui.filter((t) => !D.isUiWork(t)));
  ok("…not a post, a Symbiot command, a deploy, a rebase, a message or a test", not.every((t) => !D.isUiWork(t)), not.filter((t) => D.isUiWork(t)));
  ok("a picture to look at isn't a screen to build (25 Oct 2026), while new screenshots to take still are", !D.isUiWork("Take a look at this screenshot.\n(The user attached 1 screenshot: you can see it.)") && !D.isUiWork("describe the attached image") && D.isUiWork("Take new demo screenshots") && D.isUiWork("look at this screenshot and fix the login page layout"));
  ok("or by the files it touches: a page, a stylesheet, a component", D.isUiWork("tidy it", ["public/index.html"]) && D.isUiWork("x", [{ file: "src/components/Card.tsx" }]) && !D.isUiWork("x", ["src/server.js"]));

  console.log("DESIGN — the standard goes in the brief, with the evidence it must leave");
  const brief = D.designBrief({ cli: "/x/index.mjs" }).join("\n");
  ok("the standard: hierarchy, spacing, type, tokens and contrast, real content, states, both sizes, access, a demo's story", ["primary action", "4/8 px", "two or three sizes", "AA", "never n/a, 0%", "empty state", "1440×900", "390×844", "accessible name", "tells a story"].every((w) => brief.includes(w)), brief);
  ok("…and the proof: screenshots taken with symbiot shoot, looked at, critiqued, the checklist in the last message", /node "\/x\/index\.mjs" shoot <url> --out \.symbiot\/shots/.test(brief) && /Read the image/.test(brief) && /checklist with each point's result/.test(brief) && /design critic/.test(brief));
  const md = buildTasksMd("demo-app", {}, [{ text: "Build the call-centre demo for the pilot" }]), plainMd = buildTasksMd("api", {}, [{ text: "Add a test for the export" }]);
  ok("a repo's brief with UI work carries it; one without doesn't", /## UI work: the design standard/.test(md) && !/## UI work/.test(plainMd));
  ok("…so does an ops brief asking for UI work", /## UI work: the design standard/.test(actBrief("Build a demo page for the pilot", { lanes: [] })) && !/## UI work/.test(actBrief("Check the server's disk space", { lanes: [] })));

  console.log("DESIGN — UI work goes to the strongest model");
  const r = pickModel({ task: "Build the call-centre demo for the pilot" });
  ok("on Opus, saying why", r.tier === "O" && /UI work/.test(r.why), r);
  ok("…a short plain task stays on Sonnet", pickModel({ task: "Add a test for the export" }).tier === "S");

  console.log("DESIGN — the critic: a fresh run judges it, passes it or sends it back, two rounds at most");
  const lane = join(HOME, "work", "demo-app"); mkdirSync(join(lane, ".symbiot"), { recursive: true });
  const ITEM = "Build the call-centre demo for the pilot";
  writeFileSync(join(lane, ".symbiot", "TASKS.md"), `## Tasks\n- [x] ${ITEM}\n- [x] Add a test for the export\n`);
  const started = [], reruns = [], now = Date.now(), go = { start: (p) => started.push(p), rerun: (p) => reruns.push(p), cap: () => true, later: (f) => f(), now };
  const u1 = A.uiReview(lane, { id: "r1" }, go);
  ok("a ticked UI item starts the critic, only for the UI item, round 1", u1 && u1.critic.join() === ITEM && started.length === 1 && D.reviewOf(lane)[ITEM].rounds === 1, [u1, D.reviewOf(lane)]);
  const brief2 = readFileSync(join(lane, ".symbiot", "UI-CRITIC.md"), "utf8");
  ok("…its instructions name the item, the standard, the screenshots and the verdict file; it changes no code", brief2.includes(`- ${ITEM}`) && /never n\/a/.test(brief2) && /shoot <url>/.test(brief2) && /ui-verdict\.json/.test(brief2) && /change no code and tick nothing/.test(brief2));
  {
    const wrap = "What's left on this, and do it: Take a look at this screenshot. (The user attached 1 screenshot: you can see it.) Done when: No image came through with your…";
    const w = D.toReview(`- [x] ${wrap}\n`, []), wb = D.criticBrief(w);
    ok("a written answer about a screenshot gets a plain check against its source, not the design critic (25 Oct 2026)", w.length === 1 && w[0].kind === "written" && /Check the finished written work/.test(wb) && !/shoot|The job first|Design critic/.test(wb) && /Read tool/.test(wb), wb.slice(0, 300));
    ok("…listing the job, not the goal's follow-up brief round it or its done-when", wb.includes("- Take a look at this screenshot.") && !/What's left on this|Done when/.test(wb));
    const md = D.toReview("- [x] Redesign the landing page\n", ["docs/LANDING-NOTES.md"]);
    ok("a UI-sounding job that only wrote documents built no screens: checked as writing", md.length === 1 && md[0].kind === "written");
    const both = D.criticBrief([{ item: "Redesign the landing page", rounds: 0, kind: "ui" }, { item: "Describe the attached screenshot", rounds: 0, kind: "written" }]);
    ok("…and alongside UI work, written items are told apart from the screens", /Design critic/.test(both) && /Also: written work/.test(both) && /Describe the attached screenshot/.test(both.split("Also: written work")[1]));
    ok("a job with screens still gets the design critic", D.toReview("- [x] Redesign the landing page\n", ["site/index.html"])[0].kind === "ui" && D.toReview("- [x] Redesign the landing page\n")[0].kind === "ui");
    ok("an item with no screens and no source to check gets no review", D.toReview("- [x] Rebase the branch onto main\n").length === 0);
  }
  ok("the critic's prompt only points at that file, with no quote, $ or backtick (it goes through two shells)", !/["'$`]/.test(D.CRITIC_PROMPT) && /UI-CRITIC\.md/.test(D.CRITIC_PROMPT));
  ok("under the hourly cap: none when it's used up", A.uiReview(lane, { id: "r1b" }, { ...go, cap: () => false }) === null);
  const verdict = (pass, fixes = []) => writeFileSync(join(lane, ".symbiot", "ui-verdict.json"), JSON.stringify({ items: [{ item: ITEM, pass, fixes, shots: [".symbiot/shots/review/home-1440x900.png"] }] }));
  verdict(false, ["Dashboard: the KPI tiles read n/a and 0%: seed realistic numbers", "Handoffs table: order_phone_mismatch shown raw: say \"Phone doesn't match the order\""]);
  const s1 = A.uiReview(lane, { id: "c1" }, { ...go, critic: true });
  const t1 = readFileSync(join(lane, ".symbiot", "TASKS.md"), "utf8");
  ok("failed in round 1: reopened with the fixes, and its builder starts on them", s1.reopened.join() === ITEM && /- \[ \] Build the call-centre demo for the pilot — UI review \(round 1\): fix Dashboard: the KPI tiles read n\/a/.test(t1) && reruns.length === 1 && !existsSync(join(lane, ".symbiot", "ui-verdict.json")), [s1, t1]);
  writeFileSync(join(lane, ".symbiot", "TASKS.md"), t1.replace(/- \[ \] (Build the call-centre demo for the pilot) — UI review \(round 1\).*$/m, "- [x] $1"));
  const u2 = A.uiReview(lane, { id: "r2" }, go);
  ok("ticked again: round 2 of the critic", u2 && started.length === 2 && D.reviewOf(lane)[ITEM].rounds === 2, D.reviewOf(lane));
  verdict(false, ["Phone size: the chat input runs off the screen"]);
  const s2 = A.uiReview(lane, { id: "c2" }, { ...go, critic: true });
  const t2 = readFileSync(join(lane, ".symbiot", "TASKS.md"), "utf8");
  ok("failed again: not passed, not sent round a third time: waiting on the user, saying so", s2.failed.join() === ITEM && /- \[~\] \(waits on the user: the design critic still fails it after 2 rounds/.test(t2) && reruns.length === 1 && A.uiReview(lane, { id: "r3" }, go) === null, [s2, t2]);
  writeFileSync(join(lane, ".symbiot", "TASKS.md"), `## Tasks\n- [x] Redesign the landing page\n`);
  A.uiReview(lane, { id: "r4" }, go);
  writeFileSync(join(lane, ".symbiot", "ui-verdict.json"), JSON.stringify({ items: [{ item: "Redesign the landing page", pass: true, fixes: [] }] }));
  const s3 = A.uiReview(lane, { id: "c3" }, { ...go, critic: true });
  ok("passed: kept as passed, nothing reopened, and not reviewed again", s3.passed.join() === "Redesign the landing page" && D.reviewOf(lane)["Redesign the landing page"].passed && A.uiReview(lane, { id: "r5" }, go) === null);

  console.log("DESIGN — symbiot shoot");
  ok("only a page's address", /http/.test((await D.shoot("file:///etc/passwd", { out: join(HOME, "s"), bin: "chrome" })).error));
  // a fake browser: what it was asked, in order. open() stands for headless.mjs's, which
  // waits for the load and then for the network to settle before it returns.
  const calls = [], out = join(HOME, "shots");
  const fake = (log, { fail = () => false } = {}) => ({
    page: async (fn, size) => { log.push(["start", size]); return fn({ send: async (method, params) => { log.push([method, params]); if (method === "Page.captureScreenshot") { if (fail(log)) throw new Error("tab crashed"); return { data: Buffer.from("png").toString("base64") }; } return {}; } }); },
    open: async (page, url, o) => { log.push(["open", url, o]); log.push(["settled"]); },
  });
  const sh = await D.shoot("http://localhost:3100/orders", { out, bin: "chrome", ...fake(calls) });
  const sized = calls.filter((c) => c[0] === "Emulation.setDeviceMetricsOverride").map((c) => `${c[1].width},${c[1].height}`);
  ok("one PNG per size, named for the page and size, at the window size asked", sh.shots.length === 2 && /orders-1440x900\.png$/.test(sh.shots[0]) && /orders-390x844\.png$/.test(sh.shots[1]) && readFileSync(sh.shots[0], "utf8") === "png" && sized.join(" ") === "1440,900 390,844", [sh, sized]);
  const order = calls.map((c) => c[0]), shot1 = order.indexOf("Page.captureScreenshot");
  ok("…each taken after the page has loaded and its network settled, not on a timer: open, settle, then the picture, the page opened again at each size", order.filter((x) => x === "start").length === 1 && order.filter((x) => x === "open").length === 2 && order.indexOf("settled") < shot1 && order.lastIndexOf("open") > shot1 && !JSON.stringify(calls).includes("virtual-time-budget") && calls.find((c) => c[0] === "open")[2].chrome === false, order);
  const tall = []; const full = await D.shoot("http://localhost:3100/", { out, bin: "chrome", full: true, sizes: "1440x900", ...fake(tall) });
  ok("…--full takes a tall window for a long page", full.shots[0].endsWith("-full.png") && tall.some((c) => c[0] === "Emulation.setDeviceMetricsOverride" && c[1].height === 4000));
  const none = await D.shoot("http://localhost:3100/", { out: join(HOME, "none"), bin: "chrome", page: async () => { throw new Error("The browser didn't start: no display"); }, open: async () => {} });
  ok("…and says so when Chrome took none, with why", /didn't take/.test(none.error) && /no display/.test(none.error) && none.failed.length === 2, none);
  const half = await D.shoot("http://localhost:3100/", { out, bin: "chrome", ...fake([], { fail: (log) => log.filter((c) => c[0] === "Page.captureScreenshot").length > 1 }) });
  ok("…one size that fails is listed, the other kept", half.shots.length === 1 && half.failed.length === 1 && /390x844/.test(half.failed[0]), half);
  ok("…a clean shot says only where its pictures are: no late, broken or note", JSON.stringify(Object.keys(sh)) === '["shots"]', sh);
  ok("…the load and the settling share one 8 s limit, and fonts and the images in the window are waited for after it", calls.find((c) => c[0] === "open")[2].budget === 8000 && calls.some((c) => c[0] === "Runtime.evaluate" && /document\.fonts/.test(c[1].expression) && /decode\(\)/.test(c[1].expression) && c[1].awaitPromise), calls.find((c) => c[0] === "open"));
  // a page that never went quiet, and an image still not in at the limit, and one that 404'd
  const busy = (log) => ({
    page: async (fn) => fn({ net: { late: () => ["api.example.com/poll"], broken: () => ["cdn.example.com/missing.png"] }, send: async (method, params) => { log.push([method, params]); if (method === "Runtime.evaluate") return { result: { value: ["https://cdn.example.com/hero.jpg?w=800"] } }; if (method === "Page.captureScreenshot") return { data: Buffer.from("png").toString("base64") }; return {}; } }),
    open: async () => ({ loaded: false, quiet: false }), short: (u) => { const x = new URL(u); return x.host + x.pathname; },
  });
  const slow = await D.shoot("http://localhost:3100/", { out, bin: "chrome", ...busy([]) });
  ok("never quiet: the pictures are still taken, with what was still loading per size, host and path only", slow.shots.length === 2 && JSON.stringify(slow.late) === JSON.stringify({ "1440x900": ["api.example.com/poll", "cdn.example.com/hero.jpg"], "390x844": ["api.example.com/poll", "cdn.example.com/hero.jpg"] }), slow);
  ok("…a broken image is listed once, as the page's", JSON.stringify(slow.broken) === '["cdn.example.com/missing.png"]', slow.broken);
  ok("…and the note says both, in the designer's words, still loading first", slow.note === "The page was still loading 2 things after 8 seconds (api.example.com/poll, cdn.example.com/hero.jpg), so the 1440x900 and 390x844 pictures may be missing them. 1 image on the page didn't load (cdn.example.com/missing.png): that's the page, not the screenshot.", slow.note);
  ok("…one size late, one thing: singular words", D.shootNote({ "1440x900": ["cdn.example.com/hero.jpg"] }, []) === "The page was still loading 1 thing after 8 seconds (cdn.example.com/hero.jpg), so the 1440x900 picture may be missing them.");
  ok("…at most 5 addresses per size, 3 in the note", D.shootNote({ "1440x900": ["a/1", "a/2", "a/3", "a/4"] }, ["b/1", "b/2"]).includes("(a/1, a/2, a/3), so") && D.shootNote({}, ["b/1", "b/2"]) === "2 images on the page didn't load (b/1, b/2): that's the page, not the screenshot.");
  const shootSrc = readFileSync(new URL("../design.mjs", import.meta.url), "utf8");
  ok("…no simulated clock left in shoot", !/virtual-time-budget/.test(shootSrc.slice(shootSrc.indexOf("---- symbiot shoot"))));

  console.log("THE JOB FIRST — the standard asks for the flows the best product of its kind has, not only tidiness");
  ok("the builder's brief and the critic's both start from the job and the flows people expect", /The job first/.test(D.CHECKLIST[0]) && /removing, undoing/.test(D.CHECKLIST[0]) && D.designBrief().join("\n").includes("The job first") && D.criticBrief([{ item: "x", rounds: 0 }]).includes("The job first"));

  console.log("A MERGE WAITS FOR THE CRITIC — UI work it sent back holds a merge in its repo (23 Oct 2026)");
  const mlane = join(HOME, "work", "app"); mkdirSync(join(mlane, ".symbiot"), { recursive: true });
  D.noteOpen(mlane, { "Build the vault page": { rounds: 1, at: Date.now(), fixes: ["rows too tall"] } }, { slug: "acme/app" });
  ok("under review or sent back: a merge into that repo is held, by owner/name or by its name (a moved repo)", D.holdsMerge("acme/app").length === 1 && D.holdsMerge("newowner/app")[0].item === "Build the vault page" && D.holdsMerge("acme/other").length === 0);
  const { judge } = await import("../guard.mjs");
  const g = judge("Bash", { command: "gh pr merge 251 --repo acme/app --merge" }, { cwd: HOME, home: HOME });
  ok("the guard holds `gh pr merge` there, says why and what to do, and offers the user no way round it", !!(g && g.why) && /design critic/.test(g.why) && /UI-REVIEW\.md/.test(g.why) && !g.setting, g);
  ok("…by a PR's address too, and not in another repo", !!judge("Bash", { command: "gh pr merge https://github.com/acme/app/pull/9" }, { cwd: HOME, home: HOME }) && !judge("Bash", { command: "gh pr merge 3 -R acme/other" }, { cwd: HOME, home: HOME }));
  D.noteOpen(mlane, { "Build the vault page": { rounds: 1, passed: true } }, { slug: "acme/app" });
  ok("passed: the merge is open again", D.holdsMerge("acme/app").length === 0 && !judge("Bash", { command: "gh pr merge 251 --repo acme/app" }, { cwd: HOME, home: HOME }));
  D.noteOpen(mlane, { "Build the vault page": { rounds: 2, failed: true } }, { slug: "acme/app" });
  ok("after two rounds it's the user's call: nothing is held", D.holdsMerge("acme/app").length === 0);
  D.noteOpen(mlane, { "Old page": { rounds: 1 } }, { slug: "acme/app", now: Date.now() - D.OPEN_MS - 1000 });
  ok("a review left open for days holds nothing", D.holdsMerge("acme/app").length === 0);
  const rv = join(HOME, "work", "app2"); mkdirSync(join(rv, ".symbiot"), { recursive: true });
  D.saveReview(rv, { "A page": { rounds: 1, at: Date.now() } });
  ok("saving a review is what records it (no remote here: nothing to hold)", existsSync(join(CFG, "ui-open.json")) && D.holdsMerge("").length === 0);

  {
  console.log("DESIGN FIRST — a new screen or a rework gets a spec from Symbiot's designer before it's built (23 Oct 2026)");
  const worthy = ["Build a vault viewer in Symbiot that lists the saved secrets by name", "Redesign the settings page", "Make the demo dashboard for the call centre", "Add a new screen for invoices"];
  const notWorthy = ["Fix the spacing on the vault button", "Tweak the colour of the header", "Add a delete button to each row", "Make the app faster on startup", "Add a webhook endpoint for SMS", "Rename the Save button to Keep"];
  ok("a new screen, page, dashboard or a rework is designed first", worthy.every((t) => D.designWorthy(t)), worthy.filter((t) => !D.designWorthy(t)));
  ok("…a small fix, one control, or work nobody looks at isn't", notWorthy.every((t) => !D.designWorthy(t)), notWorthy.filter((t) => D.designWorthy(t)));
  const noScreen = ["Make symbiot shoot wait for the page's network to settle, then take its picture", "Make the page capture command-line tool retry on a timeout", "Add a --full option to the screenshot page command"];
  ok("…nor a job with no screens: a command or what's under one (24 Oct 2026)", noScreen.every((t) => !D.designWorthy(t)), noScreen.filter((t) => D.designWorthy(t)));
  const built = ["Build the booking page for the salon: already done, uncommitted in worktree ~/projects/salon-book", "Redesign the settings page (already built on branch x)"];
  ok("…nor one that's built already", built.every((t) => !D.designWorthy(t)), built.filter((t) => D.designWorthy(t)));
  ok("…and a ticked or waiting one gets no designer", D.toDesign("- [x] Build the booking page for the salon\n- [~] Redesign the settings page (waits on: Garth)\n").length === 0);
  const dl = join(HOME, "work", "atlas"); mkdirSync(join(dl, ".symbiot"), { recursive: true });
  const md = "## Tasks\n- [ ] Build the booking page for the salon\n- [ ] Fix the spacing on the footer\n- [x] Redesign the old report page\n";
  const st = D.startDesign(dl, md);
  ok("only the open one worth it: marked pending, with a spec path under .symbiot/design/", st.length === 1 && st[0].item === "Build the booking page for the salon" && /^\.symbiot\/design\/build-the-booking-page-for-the-salon\.md$/.test(st[0].spec) && D.designOf(dl)[st[0].item].pending, st);
  const brief = readFileSync(join(dl, ".symbiot", "UI-DESIGNER.md"), "utf8");
  ok("the designer's brief: write no code, look at what's there, and every section of a spec (the bar, flows, both sizes, states, words, out of scope, acceptance)", /Write no code/.test(brief) && /shoot/.test(brief) && ["The job", "The bar", "Flows", "Screens", "States", "Words", "Out of scope", "Acceptance"].every((h) => brief.includes(`**${h}`)) && brief.includes(st[0].spec), brief.slice(0, 300));
  ok("…and a pending one is offered again (its designer never started or never finished), but not twice at once", D.toDesign(md, D.designOf(dl)).length === 1);
  ok("settled with no spec written: missing, the builder goes on without, and it isn't designed again", (() => { const r = D.settleDesign(dl); return r.missing.length === 1 && D.toDesign(md, D.designOf(dl)).length === 0 && D.specsFor(dl).length === 0; })());
  writeFileSync(join(dl, ".symbiot", "ui-design.json"), "{}"); D.startDesign(dl, md); mkdirSync(join(dl, ".symbiot", "design"), { recursive: true });
  writeFileSync(join(dl, st[0].spec), "# Booking page\n\n" + "**The job:** a client books a cut in under a minute. ".repeat(20));
  const sd = D.settleDesign(dl);
  ok("settled with its spec written: recorded, and it's the spec for that item", sd.written.length === 1 && D.specsFor(dl)[0].spec === st[0].spec, [sd, D.specsFor(dl)]);
  ok("the builder's brief says to build to the spec, its acceptance list part of done", D.designBrief().join("\n").includes(".symbiot/design/") && /acceptance list is part of done/.test(D.designBrief().join("\n")));
  const cb = D.criticBrief([{ item: st[0].item, rounds: 0 }], { specs: D.specsFor(dl) });
  ok("the critic judges against the spec as well as the standard", cb.includes("The spec it was built to") && cb.includes(st[0].spec) && /missing or wrong fails it/.test(cb));
  D.startDesign(dl, md.replace("booking page for the salon", "staff rota screen")); ok("a designer that didn't start leaves nothing pending", D.dropDesign(dl) === 1 && Object.values(D.designOf(dl)).every((v) => !v.pending));

  console.log("DESIGN FIRST — a step's brief handed in as a task is never designed or judged as a job of its own (24 Oct 2026, webapp)");
  const job = "New job: give each screen of the Flutter web demo its own address, so Marketing can capture the Play-listing screenshots";
  const critic = "Act as Symbiot's design critic for the webapp lane. Judge the finished job, don't polish it: change no code and tick nothing. The job: give each screen of the Flutter web demo its own address, so Marketing can capture them";
  ok("a critic's or designer's brief is told from a task, and its job read from it", D.isBrief(critic) && D.isBrief("You are Symbiot's product designer: read .symbiot/UI-DESIGNER.md") && !D.isBrief(job) && /^give each screen/.test(D.taskOf(critic)) && D.sameJob(critic, job));
  const dj = join(HOME, "work", "webapp"); mkdirSync(join(dj, ".symbiot", "design"), { recursive: true });
  const jobSpec = ".symbiot/design/give-each-screen-of-the-flutter-web-demo-its-own-address-so-m.md";
  writeFileSync(join(dj, ".symbiot", "ui-design.json"), JSON.stringify({ [job]: { spec: jobSpec, at: 1 } }));
  D.saveReview(dj, { [job]: { rounds: 1, at: 1, fixes: ["the photo fades in"] } });
  ok("a job that has its spec and a critic's verdict gets no designer, even under a brief's words", D.startDesign(dj, `## Tasks\n- [ ] ${critic}\n`).length === 0 && !existsSync(join(dj, ".symbiot", "UI-DESIGNER.md")), D.designOf(dj));
  const fresh = D.toDesign(`## Tasks\n- [ ] Act as Symbiot's product designer. The job: build the booking page for the salon\n`, {});
  ok("…one with neither is designed from the task, and its spec named after the task, not the brief's first line", fresh.length === 1 && fresh[0].spec === ".symbiot/design/build-the-booking-page-for-the-salon.md" && D.designerBrief(fresh).includes("- build the booking page for the salon\n") && !D.designerBrief(fresh).includes("Act as"), fresh);
  ok("…a brief that names no job is no job at all", D.toDesign("- [ ] You are Symbiot's design critic: read .symbiot/UI-CRITIC.md and redesign the page\n", {}).length === 0 && D.toReview("- [x] Act as Symbiot's design critic: judge the new dashboard page\n").length === 0);
  const items = D.toReview(`- [x] ${critic}\n`), cbj = D.criticBrief(items, { specs: [{ item: job, spec: jobSpec }] });
  ok("the critic judges the task, against the job's spec, never the brief", /## What to judge\n- give each screen/.test(cbj) && !/What to judge\n- Act as/.test(cbj) && cbj.includes(jobSpec), cbj.slice(0, 400));
  D.saveReview(dj, { [D.itemKey(critic)]: { rounds: 1, at: 1 } });
  writeFileSync(join(dj, ".symbiot", "ui-verdict.json"), JSON.stringify({ items: [{ item: D.taskOf(critic), pass: true, shots: [] }] }));
  const sv = D.settleVerdict(dj, { md: `- [x] ${critic}\n` });
  ok("…and its verdict, given by the task, settles the item it came from", sv && sv.passed.length === 1 && D.reviewOf(dj)[D.itemKey(critic)].passed, sv);

  console.log("DESIGN FIRST — the run: the designer goes first, on the strongest model, then the builder, told of the spec");
  const { execSync } = await import("node:child_process");
  const rl = join(HOME, "work", "salon"); mkdirSync(join(rl, ".symbiot"), { recursive: true }); execSync("git init -q", { cwd: rl });
  writeFileSync(join(rl, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Build the booking page for the salon\n");
  const stub = join(HOME, "stub.mjs");
  writeFileSync(stub, `import { appendFileSync, writeFileSync, mkdirSync, readFileSync } from "node:fs"; import { join } from "node:path";
const [prompt, dir] = process.argv.slice(2); appendFileSync(join(dir, ".symbiot", "prompts.txt"), prompt + "\\n---\\n");
if (/product designer/.test(prompt)) { const b = readFileSync(join(dir, ".symbiot", "UI-DESIGNER.md"), "utf8"); const p = b.match(/write the spec to \x60([^\x60]+)\x60/)[1]; mkdirSync(join(dir, ".symbiot", "design"), { recursive: true }); writeFileSync(join(dir, p), "# Spec\\n" + "x".repeat(800)); }`);
  A.setHandoffCmd(`"${process.execPath}" ${stub} "{prompt}" {dir}`);
  const run = A.runHandoff(rl, { force: true });
  const pf = join(rl, ".symbiot", "prompts.txt"), two = () => (existsSync(pf) ? readFileSync(pf, "utf8").split("---").filter((x) => x.trim()).length : 0);
  for (let i = 0; i < 200 && two() < 2; i++) await new Promise((r) => setTimeout(r, 50));
  const told = existsSync(pf) ? readFileSync(pf, "utf8").split("---").map((x) => x.trim()).filter(Boolean) : [];
  ok("the first run is the designer, and it's named so", run && run.designer && /product designer/.test(told[0] || ""), [run && run.designer, told[0]]);
  ok("…its spec is recorded when it ends, and the builder starts next, told to build to it", told.length >= 2 && !/product designer/.test(told[1]) && /designer has written the spec/.test(told[1]) && D.specsFor(rl).length === 1, told);
  A.setHandoffCmd("");
  }
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} design: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
