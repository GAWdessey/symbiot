// Browser sign-ins that don't hold (browserfails.mjs): a sign-in ask for a site the Symbiot
// Browser can't hold (Twilio, Cloudflare, Google) never reaches the user, and one the user
// answered "done" to whose run still asks again is learned as one of them. Any other step
// the user takes on a site is theirs in their own Chrome, never the Symbiot Browser.
//
//   node test/browserfails.mjs
//
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const HOME = mkdtempSync(join(tmpdir(), "symbiot-browserfails-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const B = await import("../browserfails.mjs");
const { recordDone, standingBrief } = await import("../asksdone.mjs");
const { signInAsked } = await import("../links.mjs");
const { needsOf, parseQuestions, withOwnTools } = await import("../agents.mjs");
const { homeAnswer } = await import("../home.mjs");
try {
  console.log("KNOWN SITES — never a browser sign-in ask");
  const twilio = "Sign in to Twilio's console in the Symbiot browser so the run can read the parent account's balance and settle who pays Meta's template fees";
  ok("the 19 Oct card's ask is Twilio's", (B.blockedSignIn(twilio) || {}).host === "twilio.com", B.blockedSignIn(twilio));
  ok("…by its address too (twilio.com/login, console.twilio.com)", (B.blockedSignIn("Log in at twilio.com/login, then I'll read it") || {}).host === "twilio.com" && (B.blockedSignIn("sign in again to console.twilio.com") || {}).host === "twilio.com");
  ok("Cloudflare's dashboard and Google's sign-in are on the list", (B.blockedSignIn("Sign in to dash.cloudflare.com so I can add the DNS record") || {}).name === "Cloudflare" && (B.blockedSignIn("Please sign in to your Google account in the Symbiot Browser") || {}).name === "Google");
  ok("a site that works there isn't blocked", B.blockedSignIn("Sign in to www.domains.co.za/client/dashboard in the Symbiot Browser") === null);
  ok("a mention that isn't a sign-in ask isn't blocked", B.blockedSignIn("I read the Twilio balance through its API: $12.40") === null && B.blockedSignIn("Signed in to LinkedIn; the Twilio update is drafted") === null);
  ok("each one says the way round it (Twilio: its REST API's balance)", /Balance\.json/.test(B.apiRoute(B.blockedSignIn(twilio))) && /ask the user only for a key/.test(B.apiRoute(B.blockedSignIn(twilio))));
  ok("no Sign in button for one, on a card or a chat reply", signInAsked(twilio) === null && signInAsked("Sign in to twilio.com") === null && !!signInAsked("Sign in to www.domains.co.za/client/dashboard"));
  const brief = standingBrief().join("\n");
  ok("every brief says: API, CLI or connector first, and names the sites the browser can't hold", /Never ask the user to sign in to a site in the Symbiot Browser/.test(brief) && /twilio\.com/.test(brief) && /dash\.cloudflare\.com/.test(brief) && /accounts\.google\.com/.test(brief), brief);
  const opts = B.apiOptions(["👤 You (only you: your sign-in): sign in to twilio.com in the Symbiot Browser (recommended)", "Skip this part: leave the balance out"]);
  ok("a question's sign-in option becomes the agent's API route, recommended still; the skip stays", /^🤖 Agent: reach Twilio through Twilio's REST API/.test(opts[0]) && /\(recommended\)$/.test(opts[0]) && opts[1] === "Skip this part: leave the balance out", opts);
  const pq = parseQuestions("## Questions\n### Can I read the Twilio balance?\nIt settles who pays.\n- 👤 You (only you: your sign-in): sign in to twilio.com in the Symbiot Browser (Settings → Connections → Add a site) (recommended)\n- Skip this part\n", { linked: [] });
  ok("…on the Workdesk and Home too (the questions as Symbiot reads them)", /^🤖 Agent: reach Twilio/.test(pq.questions[0].options[0]), pq.questions[0].options);

  console.log("A RUN'S LAST WORDS — the card that came back twice");
  const dir = join(HOME, ".config", "symbiot", "drafts", "act-bookly-checks"); mkdirSync(join(dir, ".symbiot"), { recursive: true });
  const n = needsOf(dir, { final: `The checks are done but one. Twilio needs your sign-in: ${twilio.replace(/^S/, "s")}.`, end: Date.now() });
  ok("a run asking for the Twilio sign-in leaves no step for you: its agent goes ahead on the API", n && n.kind === "approve" && n.api === "twilio.com" && /can't hold this sign-in/.test(n.what) && /Balance\.json/.test(n.say), n);
  let reran = null; const g = homeAnswer("needs:r1", { pick: 0 }, { agents: () => [{ id: "r1", path: dir, status: "done", endedAt: Date.now(), needs: n }], running: () => false, run: (p) => { reran = p; return { id: "j1" }; }, settle: () => {} });
  const ans = readFileSync(join(dir, ".symbiot", "ANSWERS.md"), "utf8");
  ok("…Go ahead says the browser can't hold it, and its agent's told to take the API route", g.ok && reran === dir && /won't ask you again/.test(g.said) && /The Symbiot Browser can't hold the sign-in to twilio\.com/.test(ans) && /Balance\.json/.test(ans), [g, ans.slice(-400)]);

  console.log("DONE, AND STILL FAILING — never asked again");
  const ask = "The report needs your sign-in: sign in to app.example-sms.co.za in the Symbiot Browser so I can read the delivery report.";
  const other = join(HOME, "projects", "sms"); mkdirSync(join(other, ".symbiot"), { recursive: true });
  const before = Date.now() - 60000;
  ok("a sign-in to a site not on the list is the user's the first time", (needsOf(other, { final: ask, end: before }) || {}).kind === "step");
  recordDone(ask, "Done: the user did it. Check it worked, then carry on.", "sms");
  ok("…answered done: an ask from before that answer still isn't blocked", B.blockedSignIn(ask, before) === null);
  const again = needsOf(other, { final: "It still shows the login page, so this needs your sign-in again: sign in again to app.example-sms.co.za in the Symbiot Browser.", end: Date.now() + 1000 });
  ok("…asked again after it: the browser can't hold this sign-in, so it isn't the user's again", again && again.kind === "approve" && again.api === "app.example-sms.co.za" && /can't hold this sign-in/.test(again.what), again);
  ok("…and the site is learned: every brief lists it, and no ask for it reaches the user from now on", B.failingSites().some((e) => e.host === "app.example-sms.co.za") && /app\.example-sms\.co\.za/.test(standingBrief().join("\n")) && !!B.blockedSignIn("log in to app.example-sms.co.za"));
  ok("…a skip isn't a done (it may come back)", recordDone("Sign in to www.domains.co.za", "skip") === false && B.blockedSignIn("Sign in to www.domains.co.za", Date.now() + 1000) === null);

  console.log("THE USER'S OWN STEPS — in their own Chrome, never the Symbiot Browser (26 Oct 2026)");
  const reg = "👤 You (only you: your registrar sign-in): sign in at clientzone.example-registrar.co.za in the Symbiot Browser (Settings → Connections → Add a site), then I switch the nameservers and check the site and mail (recommended: everything's ready)";
  const ao = B.apiOptions([reg, "🤖 Agent: wait, leave the new route ready and switch later", "Skip this part: leave it as it is"]);
  ok("the 26 Oct card's sign-in option is theirs in their own Chrome, recommended still; the others stay", /^👤 You \(only you: your registrar sign-in\): sign in at clientzone\.example-registrar\.co\.za in your own Chrome, then I switch/.test(ao[0]) && !/Symbiot Browser/.test(ao[0]) && /\(recommended/.test(ao[0]) && ao[1] === "🤖 Agent: wait, leave the new route ready and switch later" && ao[2] === "Skip this part: leave it as it is", ao);
  ok("…its card has no Sign in button that opens the Symbiot Browser", !!signInAsked(reg) && signInAsked(ao[0]) === null, ao[0]);
  ok("…\"then click Done in the Symbiot Browser\" goes with it", B.ownChromeStep("Sign in to www.reddit.com in the Symbiot Browser, then click Done in the Symbiot Browser") === "Sign in to www.reddit.com in your own Chrome");
  ok("…a mention of the Symbiot Browser that isn't an ask stays as it was", B.ownChromeStep("I read it in the Symbiot Browser: 3 new messages") === "I read it in the Symbiot Browser: 3 new messages");
  const pq2 = parseQuestions("## Questions\n### Switch the domain's nameservers now?\nAll ready.\n- " + reg + "\n- Skip this part\n", { linked: [] });
  ok("…on the Workdesk and Home too", /in your own Chrome/.test(pq2.questions[0].options[0]) && !/Symbiot Browser/.test(pq2.questions[0].options[0]), pq2.questions[0].options);
  const step = needsOf(join(HOME, "projects", "sms"), { final: "One thing only you can do: sign in to www.domains.co.za/client/dashboard in the Symbiot Browser (Settings → Connections → Add a site), then I change the nameservers.", end: Date.now() });
  ok("a run's last words asking for one: the step card says their own Chrome", step && step.kind === "step" && /in your own Chrome/.test(step.what) && !/Symbiot Browser/.test(step.what), step);
  const chromeDir = join(HOME, ".config/google-chrome"); mkdirSync(join(chromeDir, "Default"), { recursive: true });
  ok("their own Chrome, with no profile to read, is just that", B.ownChrome({ home: HOME, platform: "linux" }) === "your own Chrome");
  writeFileSync(join(chromeDir, "Local State"), JSON.stringify({ profile: { info_cache: { Default: { name: "Work", user_name: "pat@example.com" } } } }));
  ok("…named by its profile and account when they can be read", B.ownChrome({ home: HOME, platform: "linux" }) === 'your own Chrome (its "Work" profile, pat@example.com)', B.ownChrome({ home: HOME, platform: "linux" }));
  const own = B.ownStepLine('your own Chrome (its "Work" profile, pat@example.com)');
  ok("every brief: a registrar or provider step is theirs in their own Chrome, with the address and the values, never the Symbiot Browser", standingBrief().join("\n").includes(B.ownStepLine()) && /its "Work" profile, pat@example\.com\), never in the Symbiot Browser/.test(own) && /exact address, where on the page, and the exact values/.test(own), own);
  ok("…and a site that refuses this computer's own address (a 403 that calls it a proxy) is their phone on mobile data", /403 that names this computer's IP address, or calls it a proxy/.test(own) && /phone on mobile data/.test(own));
  const { ONLY_YOU } = await import("../handover.mjs");
  ok("the brief's own example no longer sends them to the Symbiot Browser to sign in", !/in the Symbiot Browser \(Settings → Connections → Add a site\)/.test(ONLY_YOU) && /sign in to <site, e\.g\. www\.domains\.co\.za\/client\/dashboard> in your own Chrome/.test(ONLY_YOU) && /the window it opens is never the user's step/.test(ONLY_YOU));

  console.log("THE USER'S OWN CHROME — to read, never to click (2026-10-20)");
  ok("no Claude in Chrome on this computer: not offered", B.realChrome({ cfg: {}, platform: "linux" }) === false && !B.browserBrief(false).includes(B.CHROME_BRIEF));
  const hosts = join(HOME, ".config/google-chrome/NativeMessagingHosts"); mkdirSync(hosts, { recursive: true });
  writeFileSync(join(hosts, "com.anthropic.claude_code_browser_extension.json"), "{}");
  ok("its native host registered in Chrome: offered", B.realChrome({ cfg: {}, platform: "linux" }) === true);
  ok("…unless chromeAgents is off", B.realChrome({ cfg: { chromeAgents: false }, platform: "linux" }) === false);
  const cbrief = B.browserBrief(true).join("\n");
  ok("the brief gives the order (API, their Chrome, then symbiot screens), own tabs only, and reading only", /API, CLI or a connector first; then their Chrome; then `symbiot screens`/.test(cbrief) && /own tab group/.test(cbrief) && /only open, read and close/.test(cbrief), cbrief);
  const cmd = 'claude -p "{prompt}" --permission-mode acceptEdits --allowedTools "Bash(npm test:*)"', run = withOwnTools(cmd, true);
  ok("a run gets --chrome and the tools that open, read and close its tabs", /^claude --chrome -p /.test(run) && B.CHROME_READ.every((t) => run.includes(`"${t}"`)), run);
  ok("…none that click, type, fill or take the screen", !/claude-in-chrome__(computer|form_input|javascript_tool|file_upload|upload_image)/.test(run), run);
  ok("…and nothing when it's off or the command says --no-chrome", withOwnTools(cmd, false).indexOf("chrome") < 0 && !/--chrome/.test(withOwnTools(cmd.replace("claude -p", "claude --no-chrome -p"), true)));
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
