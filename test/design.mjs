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
  ok("only a page's address", /http/.test(D.shoot("file:///etc/passwd", { out: join(HOME, "s"), bin: "chrome" }).error));
  const calls = [], out = join(HOME, "shots");
  const sh = D.shoot("http://localhost:3100/orders", { out, bin: "chrome", run: (bin, args) => { calls.push(args); const f = args.find((a) => a.startsWith("--screenshot=")).slice(13); writeFileSync(f, "png"); } });
  ok("one PNG per size, named for the page and size, at the window size asked", sh.shots.length === 2 && /orders-1440x900\.png$/.test(sh.shots[0]) && /orders-390x844\.png$/.test(sh.shots[1]) && calls[0].includes("--window-size=1440,900") && calls[1].includes("--window-size=390,844"), [sh, calls[0]]);
  ok("…--full takes a tall window for a long page", D.shoot("http://localhost:3100/", { out, bin: "chrome", full: true, sizes: "1440x900", run: (b, args) => { calls.push(args); writeFileSync(args.find((a) => a.startsWith("--screenshot=")).slice(13), "png"); } }).shots[0].endsWith("-full.png") && calls.at(-1).includes("--window-size=1440,4000"));
  ok("…and says so when Chrome took none", /didn't take/.test(D.shoot("http://localhost:3100/", { out: join(HOME, "none"), bin: "chrome", run: () => {} }).error));
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} design: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
