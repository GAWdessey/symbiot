// symbiot — "record this walk-through": a screen demo filmed by an agent in the user's own
// signed-in Chrome (20 Oct 2026: a lane is expected to film one itself, but Symbiot's hidden
// browser crashes at start inside the sandbox and has no signed-in Google session). Claude in
// Chrome's gif_creator records the agent's own tab there, signed in as the user, where sites see
// a person's browser. Two things come with it:
// - planWalkthrough(steps) reads the steps and says, before anything is filmed, which ones only
//   the user can do (a password, a code sent to their phone, a security key, a captcha, a card)
//   and which the agent does; walkthroughText(plan) is that, in plain words, for the user.
// - walkthroughBrief(sites) is what a run is told: record in the user's Chrome, never the hidden
//   browser, and ask for the user's steps up front, in one question, not midway.
// `symbiot walkthrough "<title>" --site <host> --step "<step>" …` prints the plan.
const NEEDS = [
  ["password", /\b(password|passphrase|pass\s?word|sign[- ]?in|log[- ]?in|log\s?on|sign\s?on)\b/i, "your password (or an already signed-in session)"],
  ["phone", /\b(sms|text message|one[- ]time (?:code|pass)|otp|2fa|two[- ]factor|2-step|two[- ]step|verification code|authenticator|call(?:s|ing)? (?:your|the) phone|phone (?:call|rings?)|ring your phone|answer (?:the|your) phone|tap (?:yes|approve|allow) on your phone|on your phone)\b/i, "your phone"],
  ["key", /\b(security key|passkey|fingerprint|face id|touch id|yubikey)\b/i, "your security key or fingerprint"],
  ["captcha", /\b(captcha|i'?m not a robot|human check|prove you(?:'re| are) human)\b/i, "a human check"],
  ["card", /\b(card number|credit card|cvv|payment details|pay(?:s|ing)? for|purchase|checkout)\b/i, "your card"],
];
// A login step that is only a statement that it's already done ("already signed in") needs nothing.
const DONE = /\b(already|stay(?:s|ing)?|remain(?:s|ing)?)\s+(?:be\s+)?(?:signed|logged)[- ]?in\b/i;

function planWalkthrough(steps = [], { title = "", site = "" } = {}) {
  const list = [].concat(steps).map((s) => String(s || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40);
  const out = list.map((text, i) => {
    const hit = DONE.test(text) ? null : NEEDS.find(([, re]) => re.test(text));
    return { n: i + 1, text, by: hit ? "you" : "agent", ...(hit ? { needs: hit[0], needsText: hit[2] } : {}) };
  });
  const yours = out.filter((s) => s.by === "you");
  return { title: String(title || "").trim(), site: String(site || "").trim(), steps: out, yours, needsUser: yours.length > 0 };
}

// Said up front, before a frame is filmed: the steps that need the user, then the rest.
function walkthroughText(plan) {
  const L = [`Walk-through${plan.title ? `: ${plan.title}` : ""}${plan.site ? ` (on ${plan.site})` : ""}, filmed in your own Chrome.`];
  if (!plan.steps.length) return [...L, "No steps given."].join("\n");
  if (plan.needsUser) {
    L.push(`${plan.yours.length === 1 ? "One step needs" : plan.yours.length + " steps need"} you, so be ready before it starts:`);
    for (const s of plan.yours) L.push(`  • step ${s.n} needs ${s.needsText}: ${s.text}`);
    L.push("The rest I do myself. I stop at those steps and tell you; nothing is typed for you there.");
  } else L.push("Nothing here needs your password or phone: I do every step myself.");
  L.push("Steps:", ...plan.steps.map((s) => `  ${s.n}. ${s.by === "you" ? "[you] " : ""}${s.text}`));
  return L.join("\n");
}

// What a run is told. `sites` are the hosts the user switched acting on for (config.chromeAct).
function walkthroughBrief(sites = []) {
  return `- To film a screen demo or walk-through, record it in the user's own Chrome with the Claude in Chrome tools: mcp__claude-in-chrome__gif_creator (start, then stop and export, with a meaningful file name) around the clicks, in your own tab, signed in as them. Never try Symbiot's hidden browser for this: it crashes at start inside a run. Before filming anything, run \`symbiot walkthrough "<title>" --site <host> --step "<step>" …\` with every step, tell the user in one question which steps need their password, their phone (a code, a call) or their security key, and film only once they're ready. ${sites.includes("*") ? "Clicking and typing is on for every site." : sites.length ? `Clicking and typing is on for ${sites.map((h) => "`" + h + "`").join(", ")}; for any other site, ask the user to switch it on in Settings → Connections.` : "Clicking and typing in their Chrome is off for every site until they switch it on for one in Settings → Connections, so ask for that first."} At a step that is theirs, stop and say so: never type a password or a code for them.`;
}

export { planWalkthrough, walkthroughText, walkthroughBrief, NEEDS };
