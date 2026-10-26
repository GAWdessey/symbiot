// Acting in the user's own Chrome (chromegate.mjs through the membrane, guard.mjs; sends.mjs): an agent
// may click, type and fill only on a site the user switched acting on for, and whatever sends, posts,
// pays or deletes waits for their Go on a card, then goes through once (review of 20 Oct 2026, proposal
// 1: 43 sign-in asks and 16 screenshots where the user was the agent's eyes and hands). Isolated HOME.
//
//   node test/chromegate.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-chromegate-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const G = await import("../chromegate.mjs");
const { judge } = await import("../guard.mjs");
const { heldFor } = await import("../sends.mjs");
const C = "mcp__claude-in-chrome__", o = { session: "s1", home: HOME };
const NC = "https://ap.www.namecheap.com/domains";
// what the hook reads after a Chrome tool ran: its result's Tab Context, each tab with its address now
const result = (tabId, url = NC) => `Clicked at (10, 10)\n\nTab Context:\n- Executed on tabId: ${tabId}\n- Available tabs:\n  • tabId ${tabId}: "Domains (2) | Namecheap" ("${url}")`;
const act = (tool, input, url) => { const r = judge(C + tool, input, o); if (r === null) G.seen(C + tool, [{ type: "text", text: result(input.tabId, url) }], o); return r; }; // through: its result, as the hook gets it
const click = (tabId, summary, x = {}, url) => act("computer", { action: "left_click", coordinate: [10, 10], tabId, ...(summary ? { action_summary: summary } : {}), ...x }, url);
const { loadConfig, saveConfig } = await import("../core.mjs");

try {
  console.log("WHAT SENDS, PAYS OR DELETES — by what the action says it does");
  for (const [t, k] of [["Sends the drafted reply to pat@example.com", "send"], ["Clicks the Send button", "send"], ["Presses Enter to send the message", "send"], ["Posts the update", "send"], ["Pays the invoice", "pay"], ["Clicks Pay now", "pay"], ["Places the order for 3 domains", "pay"], ["Deletes the old template", "delete"], ["Closes the account", "delete"]]) ok(`"${t}": ${k}`, heldFor(t) === k, heldFor(t));
  for (const t of ["Opens the Posts tab", "Opens the payment settings", "Types the subject line", "Clicks Next", "Closes the dialog", "Fills in the name field"]) ok(`"${t}": nothing to hold`, heldFor(t) === "", heldFor(t));
  ok("Enter, Return and ctrl+Enter pressed are sends too, as the action says; a click on \"Return policy\" isn't", ["Presses Enter", "Hits Return", "Presses ctrl+Enter in the message box"].every((t) => heldFor(t, "linkedin.com") === "send") && heldFor("Clicks the Return policy link", "linkedin.com") === "");
  for (const t of ["Adds the company card under Billing setup", "Clicks Save card", "Presses Add payment method", "Claims the ads credit", "Enters the card details on the billing page"]) ok(`"${t}": adding a card or claiming a credit is held like a payment`, heldFor(t, "www.linkedin.com") === "pay", heldFor(t, "www.linkedin.com"));
  for (const t of ["Opens the billing settings", "Types the card number", "Saves the draft post", "Accepts the cookie banner", "Clicks Save"]) ok(`"${t}": nothing to hold`, heldFor(t, "www.linkedin.com") === "", heldFor(t, "www.linkedin.com"));
  ok("…and in mail, Reply only opens a draft (as Symbiot's own browser has it)", heldFor("Clicks the Reply button", "mail.google.com") === "" && heldFor("Clicks the Reply button", "linkedin.com") === "send");

  console.log("READING — anywhere, as before");
  ok("tabs, navigate, read_page, find, a screenshot: all go ahead", ["tabs_context_mcp", "read_page", "find", "get_page_text"].every((t) => judge(C + t, { tabId: 1 }, o) === null) && judge(C + "navigate", { tabId: 1, url: "https://ap.www.namecheap.com/domains" }, o) === null && judge(C + "computer", { action: "screenshot", tabId: 1 }, o) === null);

  console.log("ACTING — only where the user switched it on");
  ok("off by default: a click on a site the user hasn't switched on is refused, reading is fine", /acting on ap\.www\.namecheap\.com in the user's own Chrome is switched off/.test((click(1, "Clicks Next") || {}).why || ""), click(1, "Clicks Next"));
  ok("a tab no navigate named: refused, nothing acts on a site no one named", /doesn't know which site this tab is on/.test((click(9, "Clicks Next") || {}).why || ""));
  ok("scripts in their Chrome: never", /isn't allowed/.test((judge(C + "javascript_tool", { tabId: 1, text: "x" }, o) || {}).why || ""));
  ok("switched on for a site (its subdomains too)", G.setActSite("https://namecheap.com", true, { load: loadConfig, save: saveConfig }).sites.join() === "namecheap.com");
  ok("…a click there goes ahead", click(1, "Clicks Next") === null);
  ok("…but not one that doesn't say what it does", /action_summary/.test((click(1) || {}).why || ""));
  ok("…and a fill goes ahead too", act("form_input", { tabId: 1, ref: "ref_3", value: "pat", action_summary: "Fills in the account name" }) === null);

  console.log("A SEND, A PAYMENT, A DELETE — held for the user's Go, then through once");
  const held = click(1, "Places the order for 3 domains");
  const id = ((held && held.why) || "").match(/\{#chrome-go-([0-9a-f]+)\}/);
  ok("held, with the card to ask for and its id", held && /pays as the user, on ap\.www\.namecheap\.com/.test(held.why) && id && /🤖 Agent: go ahead: Places the order for 3 domains/.test(held.why), held);
  ok("…asked again, the same hold (no second card)", (((click(1, "Places the order for 3 domains") || {}).why || "").match(/chrome-go-([0-9a-f]+)/) || [])[1] === id[1]);
  ok("the user's Go on that card", G.goAhead(id[1], { home: HOME }));
  ok("…lets that very action through", click(1, "Places the order for 3 domains") === null);
  ok("…once: the next time it's held again", !!click(1, "Places the order for 3 domains"));
  ok("…and a Go for one action isn't a Go for another", !!click(1, "Deletes the domain"));

  console.log("ENTER — held as a send, whatever the action says it does");
  const key = (text, summary = "Moves to the next line") => judge(C + "computer", { action: "key", text, tabId: 1, action_summary: summary }, o);
  ok("Return, Enter, ctrl+Enter and cmd+Return pressed: held, as sends", ["Return", "Enter", "ctrl+Enter", "cmd+Return", "KP_Enter"].every((t) => /sends as the user/.test((key(t) || {}).why || "")), ["Return", "ctrl+Enter"].map((t) => key(t)));
  ok("…and typing a line break into a box is too", /sends as the user/.test((judge(C + "computer", { action: "type", text: "hi there\n", tabId: 1, action_summary: "Types the reply" }, o) || {}).why || ""));
  ok("…while other keys and plain typing go ahead", key("Tab", "Moves to the next field") === null && key("ctrl+a", "Selects the text") === null && act("computer", { action: "type", text: "hi there", tabId: 1, action_summary: "Types the greeting" }) === null);
  const enterId = ((key("Return", "Sends the reply with Enter") || {}).why || "").match(/chrome-go-([0-9a-f]+)/);
  G.goAhead(enterId && enterId[1], { home: HOME });
  ok("…with the user's Go, that Enter goes through once", key("Return", "Sends the reply with Enter") === null);

  console.log("THE TAB'S SITE — read again after anything that can leave the page");
  ok("after a click or an Enter with no result read yet, the next act waits until it's known where the tab is", /may have left ap\.www\.namecheap\.com/.test((click(1, "Clicks Next") || {}).why || ""));
  G.seen(C + "tabs_context_mcp", [{ type: "text", text: JSON.stringify({ availableTabs: [{ tabId: 1, title: "Domains", url: NC }], tabGroupId: 5 }) }], o);
  ok("…tabs_context_mcp's list says it's still there: acting carries on", click(1, "Clicks Next") === null && click(1, "Clicks Next") === null);
  ok("a click that followed a link to another site: the result says so, and acting there is refused", click(1, "Clicks the partner link", {}, "https://evil.example/pay") === null && /acting on evil\.example in the user's own Chrome is switched off/.test((click(1, "Clicks Next") || {}).why || ""), click(1, "Clicks Next"));
  ok("…and back is somewhere unknown until a result says where", judge(C + "navigate", { tabId: 1, url: "back" }, o) === null && /may have left/.test((judge(C + "form_input", { tabId: 1, ref: "r", value: "x", action_summary: "Fills in the name" }, o) || {}).why || ""));
  ok("a fill or a typed word doesn't leave the page: the next act goes ahead without a result", judge(C + "navigate", { tabId: 2, url: NC }, o) === null && judge(C + "form_input", { tabId: 2, ref: "r", value: "x", action_summary: "Fills in the name" }, o) === null && judge(C + "computer", { action: "type", text: "pat", tabId: 2, action_summary: "Types the name" }, o) === null);
  ok("a result that isn't Chrome's, or names no tab, notes nothing", G.seen("Bash", result(2, "https://evil.example"), o) === 0 && G.seen(C + "find", "Found 1 matching element", o) === 0);

  console.log("THE RUN — its tools, and the hook on them");
  const A = await import("../agents.mjs");
  const cmd = A.withOwnTools('claude -p "{prompt}"', true, () => true), rd = A.withOwnTools('claude -p "{prompt}"', true, () => false);
  ok("with acting switched on somewhere, a run gets the tools that act in their Chrome", /--chrome/.test(cmd) && /mcp__claude-in-chrome__computer/.test(cmd) && /mcp__claude-in-chrome__form_input/.test(cmd), cmd);
  ok("…and none of them when it's on nowhere", /--chrome/.test(rd) && !/mcp__claude-in-chrome__computer/.test(rd), rd);
  const hook = (ev) => spawnSync(process.execPath, [new URL("../guard.mjs", import.meta.url).pathname], { input: JSON.stringify(ev), encoding: "utf8", env: { ...process.env, HOME } });
  const h1 = hook({ session_id: "s9", tool_name: C + "navigate", tool_input: { tabId: 4, url: "https://www.linkedin.com/feed/" } }), h2 = hook({ session_id: "s9", tool_name: C + "computer", tool_input: { tabId: 4, action: "left_click", coordinate: [1, 1], action_summary: "Posts the update" } });
  // the agent can't give itself the Go: the holds and the tabs are the gate's to write, not the run's
  const holdsF = join(CFG, "chrome-holds.json"), tabsF = join(CFG, "chrome-tabs.json");
  const selfGo = [{ tool_name: "Write", tool_input: { file_path: holdsF, content: "[]" } }, { tool_name: "Edit", tool_input: { file_path: tabsF, old_string: "a", new_string: "b" } },
    { tool_name: "Bash", tool_input: { command: `node -e "const f='${holdsF}',h=JSON.parse(require('fs').readFileSync(f));h[0].go=Date.now();require('fs').writeFileSync(f,JSON.stringify(h))"` } },
    { tool_name: "Bash", tool_input: { command: `echo '{"s9:4":{"host":"namecheap.com","at":${Date.now()}}}' > ~/.config/symbiot/chrome-tabs.json` } }].map((ev) => hook({ session_id: "s9", cwd: HOME, ...ev }));
  ok("an agent can't set Go on its own hold, or say its tab is on an allowed site: Write, Edit and the shell are blocked", selfGo.every((r) => r.status === 2 && /Symbiot's own settings/.test(r.stderr)), selfGo.map((r) => [r.status, r.stderr]));
  ok("…while reading the holds goes ahead", hook({ session_id: "s9", cwd: HOME, tool_name: "Bash", tool_input: { command: `cat ${holdsF}` } }).status === 0);
  ok("the membrane's hook sees Chrome's tools: a navigate goes ahead, a post on a site not switched on is blocked", h1.status === 0 && h2.status === 2 && /Blocked by Symbiot's membrane: acting on linkedin\.com/.test(h2.stderr), [h1.status, h2.status, h2.stderr]);
  const post = hook({ hook_event_name: "PostToolUse", session_id: "s9", tool_name: C + "computer", tool_input: { tabId: 4 }, tool_response: [{ type: "text", text: result(4, "https://evil.example/") }] });
  ok("…and after one ran, the hook notes the site each tab is on now, from its result", post.status === 0 && JSON.parse(readFileSync(join(CFG, "chrome-tabs.json"), "utf8"))["s9:4"].host === "evil.example", [post.status, post.stderr]);
  const gs = JSON.parse(readFileSync(A.runSettings(HOME), "utf8")); // the settings file a run gets
  ok("…a run's settings call it after every Chrome tool, not only before", gs.hooks.PostToolUse.some((h) => /claude-in-chrome/.test(h.matcher) && /guard\.mjs/.test(h.hooks[0].command)), gs.hooks);
  ok("…and before the run ends, to close its tabs", (gs.hooks.Stop || []).some((h) => /guard\.mjs/.test(h.hooks[0].command)), gs.hooks);
  const BF = await import("../browserfails.mjs");
  const brief = BF.browserBrief(true, ["namecheap.com"]).join("\n");
  ok("the brief says where it may act, and that sends wait for the user's Go", /On `namecheap\.com` the user also lets you ACT in their Chrome/.test(brief) && /holds whatever sends, posts, pays or deletes until the user says Go/.test(brief) && !/ACT in their Chrome/.test(BF.browserBrief(true, []).join("\n")), brief.slice(0, 300));
  console.log("CHROMEGATE — every site at once, sends still held");
  {
    G.setActSite("https://namecheap.com", false, { load: loadConfig, save: saveConfig });
    const before = judge(C + "computer", { action: "left_click", coordinate: [1, 1], tabId: 901, action_summary: "Open the settings tab" }, o);
    G.seen(C + "navigate", `Navigated\n\nTab Context:\n- Available tabs:\n  • tabId 901: "Example" ("https://www.example.org/x")`, o);
    const off = judge(C + "computer", { action: "left_click", coordinate: [1, 1], tabId: 901, action_summary: "Open the settings tab" }, o);
    G.setActAll(true, { load: loadConfig, save: saveConfig });
    const on = judge(C + "computer", { action: "left_click", coordinate: [1, 1], tabId: 901, action_summary: "Open the settings tab" }, o);
    G.seen(C + "navigate", `Navigated\n\nTab Context:\n- Available tabs:\n  • tabId 901: "Example" ("https://www.example.org/x")`, o);
    const send = judge(C + "computer", { action: "left_click", coordinate: [1, 1], tabId: 901, action_summary: "Send the message to the team" }, o);
    ok("off for a site it's never been switched on for; with every site on, a click goes through", before && off && /is (switched )?off/.test(off.why) && /any site in your Chrome/.test(off.why) && on === null, [before, off, on]);
    ok("…and a send there still waits for the user's Go", send && /waits for their Go/.test(send.why), send);
    ok("…the brief says any site", /On any site the user also lets you ACT/.test((await import("../browserfails.mjs")).browserBrief(true, ["*"]).join("\n")));
    G.setActAll(false, { load: loadConfig, save: saveConfig });
    ok("switched off again, what was on per site stays", !G.actSites(HOME).includes("*"));
  }
  console.log("CHROMEGATE — what isn't a send isn't held; a Go is matched by its hold's id");
  {
    ok("opening, editing or saving a post isn't posting; Post and Schedule still are", !heldFor("Chooses Edit post for the 29 Oct post", "linkedin.com") && !heldFor("Edit post", "linkedin.com") && !heldFor("Save draft", "linkedin.com") && heldFor("Clicks Post", "linkedin.com") === "send" && heldFor("Clicks the Schedule post button", "linkedin.com") === "send");
    ok("a greeting to the user's own AI coach in a test call isn't a message to a person; one that names a channel or address is", !heldFor("Sends the greeting to the coach in the test call", "example.org") && heldFor("Sends the greeting to the client in the test call by email", "example.org") === "send" && heldFor("Sends the message to the team channel", "example.org") === "send");
    G.setActAll(true, { load: loadConfig, save: saveConfig });
    G.seen(C + "navigate", `Navigated\n\nTab Context:\n- Available tabs:\n  • tabId 902: "Composer" ("https://www.example.org/post")`, o);
    const held = judge(C + "computer", { action: "left_click", coordinate: [1, 1], tabId: 902, action_summary: "Publishes the post to the page" }, o);
    ok("held, and the refusal says to name the hold on the retry", held && held.held && new RegExp(`\\[go:${held.held}\\]`).test(held.why), held);
    G.goAhead(held.held);
    G.seen(C + "navigate", `Navigated\n\nTab Context:\n- Available tabs:\n  • tabId 902: "Composer" ("https://www.example.org/post")`, o);
    const retried = judge(C + "computer", { action: "left_click", coordinate: [1, 1], tabId: 902, action_summary: `[go:${held.held}] Publishes the post to the page now` }, o);
    ok("…after the Go, the retry naming it goes through though its words moved, once", retried === null, retried);
    G.seen(C + "navigate", `Navigated\n\nTab Context:\n- Available tabs:\n  • tabId 902: "Composer" ("https://www.example.org/post")`, o);
    ok("…and not twice", !!judge(C + "computer", { action: "left_click", coordinate: [1, 1], tabId: 902, action_summary: `[go:${held.held}] Publishes the post to the page now` }, o));
    G.setActAll(false, { load: loadConfig, save: saveConfig });
  }
  console.log("CHROMEGATE — a run closes the tabs it opened before it ends");
  {
    const t = { session: "tabs1", home: HOME }, ctx = (ids) => ids.map((id) => `  • tabId ${id}: "Feed | LinkedIn" ("https://www.linkedin.com/feed/")`).join("\n");
    G.seen(C + "tabs_create_mcp", `Created tab\n\nTab Context:\n- Available tabs:\n${ctx([41, 42])}`, t);
    ok("the tabs it opened are its open tabs", G.openTabs("tabs1", t).map((x) => x.tab).sort().join() === "41,42" && G.openTabs("tabs1", t)[0].host === "linkedin.com", G.openTabs("tabs1", t));
    ok("…another run's aren't", G.openTabs("other", t).length === 0 && G.openTabs("", t).length === 0);
    G.seen(C + "tabs_close_mcp", `Closed tab 41\n\nTab Context:\n- Available tabs:\n${ctx([42])}`, { ...t, input: { tabId: 41 } });
    ok("a tab it closed is gone", G.openTabs("tabs1", t).map((x) => x.tab).join() === "42", G.openTabs("tabs1", t));
    const hook = (ev) => spawnSync(process.execPath, [new URL("../guard.mjs", import.meta.url).pathname], { input: JSON.stringify(ev), encoding: "utf8", env: { ...process.env, HOME } });
    const stop = hook({ hook_event_name: "Stop", session_id: "tabs1", stop_hook_active: false });
    ok("ending with one open: the Stop hook sends it back to close it, naming the tab", stop.status === 2 && /tabs_close_mcp on tab 42 \(linkedin\.com\)/.test(stop.stderr), [stop.status, stop.stderr]);
    ok("…only once: a tab it can't close never keeps it from ending", hook({ hook_event_name: "Stop", session_id: "tabs1", stop_hook_active: true }).status === 0);
    G.seen(C + "tabs_context_mcp", '{"availableTabs":[]}', t);
    ok("the group's list without it (closed some other way): not open any more", G.openTabs("tabs1", t).length === 0, G.openTabs("tabs1", t));
    ok("…and nothing open: it ends", hook({ hook_event_name: "Stop", session_id: "tabs1" }).status === 0);
  }

  // 21 Oct 2026: refused acting on linkedin.com, a run asked the user to "sign LinkedIn back in"; they signed in twice,
  // with LinkedIn's feed open signed in in two of the runs' tab groups, and were still asked
  console.log("A SIGN-IN THAT ISN'T ONE — the setting that's really in the way, named; a site signed in, not asked for");
  const LI = "https://www.linkedin.com/feed/", lo = { session: "s7", home: HOME }, lane = join(HOME, "lane"), lq = { ...lo, cwd: lane, branch: "x" };
  const tabsSay = (tabId, url, title) => [{ type: "text", text: `Navigated\n\nTab Context:\n- Executed on tabId: ${tabId}\n- Available tabs:\n  • tabId ${tabId}: "${title}" ("${url}")` }];
  const ask = "Can you sign LinkedIn back in so I can schedule the two approved posts?";
  judge(C + "navigate", { tabId: 7, url: LI }, lo);
  G.seen(C + "computer", tabsSay(7, "https://www.linkedin.com/login/?session_redirect=x", "LinkedIn Login, Sign in | LinkedIn"), lo);
  ok("its sign-in page seen last, a sign-in ask there is a real one", G.signInNotNeeded(ask, { home: HOME }) === null);
  G.seen(C + "computer", tabsSay(7, LI, "(2) Feed | LinkedIn"), lo);
  const off = judge(C + "computer", { tabId: 7, action: "left_click", coordinate: [1, 1], action_summary: "Opens the LinkedIn post composer" }, lo);
  ok("acting refused there names the exact setting, says it isn't a sign-in, and gives the card to ask for it", off && /not a sign-in: don't ask the user to sign in/.test(off.why) && /Settings → Connections, the Reads button on linkedin\.com's row/.test(off.why) && /\{#chrome-act-linkedin\.com\}/.test(off.why) && /🤖 Agent: switch it on for linkedin\.com/.test(off.why), off);
  ok("…so asking to sign LinkedIn back in, or in to linkedin.com, is asking for that switch", ["Can you sign LinkedIn back in so I can schedule the two approved posts?", "Please sign in to linkedin.com again", "log in to LinkedIn"].every((t) => (G.signInNotNeeded(t, { home: HOME }) || {}).host === "linkedin.com" && G.signInNotNeeded(t, { home: HOME }).off === true));
  ok("…while another site's sign-in, or words that only mention one, aren't", G.signInNotNeeded("Can you sign in to domains.co.za?", { home: HOME }) === null && G.signInNotNeeded("This isn't a sign-in problem on LinkedIn", { home: HOME }) === null && G.signInNotNeeded("LinkedIn's posts are scheduled", { home: HOME }) === null);
  const w = judge("Write", { file_path: join(lane, ".symbiot", "QUESTIONS.md"), content: `## Questions\n\n### ${ask} {#linkedin-signin}\nLinkedIn is signed out.\n- 🤖 Agent: once you've signed LinkedIn in, schedule both (recommended)\n` }, lq);
  ok("the membrane won't let a run write that ask, and says what to ask instead", w && /signing in isn't what's in the way/.test(w.why) && /\{#chrome-act-linkedin\.com\}/.test(w.why), w);
  const py = judge("Bash", { command: `python3 - <<'E'\ns=open('QUESTIONS.md').read()\nq='''### ${ask} {#linkedin-signin}'''\nopen('QUESTIONS.md','w').write(s+q)\nE` }, lq);
  ok("…nor through the shell", py && /signing in isn't what's in the way/.test(py.why), py);
  ok("…while reading QUESTIONS.md, and asking for the switch, go ahead", judge("Bash", { command: "grep -n 'sign LinkedIn back in' QUESTIONS.md" }, lq) === null && judge("Write", { file_path: join(lane, ".symbiot", "QUESTIONS.md"), content: `### ${G.actAsk("linkedin.com").q}\nTwo approved posts wait.\n- ${G.actAsk("linkedin.com").option}\n` }, lq) === null);
  const P = await import("../plain.mjs"), L = await import("../links.mjs");
  const card = P.plainAsk(lane, { q: ask, context: "LinkedIn is signed out in the browser I can reach.", options: ["🤖 Agent: once you've signed LinkedIn in, schedule both and move the displaced posts (recommended)", "Skip this part"] }, { max: 2 });
  ok("an ask written before reads, on its card, as the switch, with the setting named and Switch it on first", /^Should agents click and type on linkedin\.com in your Chrome\?/.test(card.q) && /Settings → Connections, the Reads button/.test(card.q) && card.labels[0] === "Switch it on for linkedin.com (recommended)" && card.labels[1] === "Skip this part" && card.raw === ask && card.context === "", card);
  ok("…with no Sign in button, while a real sign-in ask keeps one", L.signInAsked(`${ask}\n🤖 Agent: once you've signed LinkedIn in, schedule both`) === null && (L.signInAsked("Can you sign in to domains.co.za?") || {}).name === "domains.co.za");
  ok("the user's yes switches it on, only for a site the gate refused lately", G.switchOnAct("linkedin.com", { load: loadConfig, save: saveConfig, home: HOME }) && G.actSites(HOME).includes("linkedin.com") && !G.switchOnAct("never-refused.example", { load: loadConfig, save: saveConfig, home: HOME }));
  ok("…and the click goes ahead", judge(C + "computer", { tabId: 7, action: "left_click", coordinate: [1, 1], action_summary: "Opens the LinkedIn post composer" }, lo) === null);
  const inCard = P.plainAsk(lane, { q: ask, options: ["🤖 Agent: once you've signed in, schedule both"] });
  ok("switched on and open signed in: a sign-in ask there is still not needed, and its card says it was signed in", (G.signInNotNeeded(ask, { home: HOME }) || {}).off === false && /No sign-in needed: linkedin\.com was open signed in in your Chrome/.test(inCard.q) && /it's signed in/.test((judge("Write", { file_path: join(lane, ".symbiot", "QUESTIONS.md"), content: `### ${ask}\n` }, lq) || {}).why || ""), inCard);

  console.log("A CONNECTOR THAT SENDS AS THE USER — held for their Go too (23 Oct 2026: mail went out through one unseen)");
  writeFileSync(join(CFG, "standing.json"), JSON.stringify([{ rule: "Never send anything to Pat (pat.lee@example.com) until the user has seen it on WhatsApp and said yes." }, { rule: "Keep replies short." }]));
  const MAIL = "mcp__claude_ai_Gmail__send_message", mail = { to: "pat.lee@example.com", subject: "The setup guide", body: "Here it is." };
  const m1 = judge(MAIL, mail, o);
  ok("a mail sent through the connector: held, with a card to ask and the Go id", m1 && m1.held && /\{#chrome-go-[0-9a-f]+\}/.test(m1.why) && /Sends "The setup guide" to pat\.lee@example\.com through Gmail/.test(m1.why), m1);
  ok("…the user's own rule about who it goes to is on it", /Their own rule for this: "Never send anything to Pat/.test(m1.why) && !/Keep replies short/.test(m1.why), m1.why);
  ok("…the same call again keeps its one card", judge(MAIL, mail, o).held === m1.held);
  writeFileSync(join(CFG, "standing.json"), JSON.stringify([{ rule: "Never send anything to Robbie (Robert Vance) until the user has seen it on WhatsApp." }]));
  const m2 = judge(MAIL, { to: "vancerobbie@example.com", subject: "Notes" }, o);
  ok("…a name in the rule that's part of the address counts too", /Their own rule for this: "Never send anything to Robbie/.test((m2 || {}).why || ""), m2);
  ok("their Go lets that call through once", G.goAhead(m1.held, { home: HOME }) && judge(MAIL, mail, o) === null && !!judge(MAIL, mail, o));
  ok("reading mail, searching, drafting: never held", ["search_threads", "get_message", "create_draft", "list_labels"].every((n) => judge("mcp__claude_ai_Gmail__" + n, { query: "x" }, o) === null));
  ok("an event with no guests sends nothing; one with guests is held", judge("mcp__claude_ai_Google_Calendar__create_event", { summary: "Focus" }, o) === null && !!(judge("mcp__claude_ai_Google_Calendar__create_event", { summary: "Kickoff", attendees: [{ email: "sam@example.com" }] }, o) || {}).held);
  ok("a reply and a forward are held too", !!(judge("mcp__claude_ai_Gmail__reply", { threadId: "t1", body: "ok" }, o) || {}).held && !!(judge("mcp__claude_ai_Gmail__forward", { messageId: "m1", to: "x@example.com" }, o) || {}).held);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} chromegate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
