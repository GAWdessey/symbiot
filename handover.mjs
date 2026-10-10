// symbiot — Handover: what every brief says about lanes, and about the steps
// only the user can do. Each agent works in its own lane (a repo, or ops for
// everything outside one), and hands what's another lane's job to that lane
// instead of stopping or asking the user (lanes.mjs runs it). What reaches the
// user is only what no agent can do, and the brief makes the agent say which.
// Text and parsing only, no imports: shared by every brief (tasks.mjs
// buildTasksMd, mind.mjs actBrief), by lanes.mjs and by handback.mjs.

const OPS = "ops";
// Marketing across every product, a lane of its own too (marketing.mjs)
const MARKETING = "marketing";
const MAX_LANES_LISTED = 40;
// How long a handover can be: an email to draft, quoted whole, fits. 4000 cut
// the one to ops mid-email (a repo lane's task links to the rest: addTask).
const HANDOVER_MAX = 20000;

// The lines a brief gets about lanes. here: this agent's lane; lanes: the others
// it can hand to (repo folder names).
function handoverRules(lanes = [], here = "") {
  const mk = lanes.includes(MARKETING) && here !== MARKETING, others = [...new Set(lanes.filter((l) => l && l !== here && l !== MARKETING))].slice(0, MAX_LANES_LISTED);
  return ["## Hand over what's another lane's job",
    `Each agent has its own lane${here ? `: this one is \`${here}\`` : ""}. When something you need is another lane's job, don't stop, and don't ask the user to do it: hand it over. Write \`.symbiot/HANDOFF.md\` with a \`### \` heading naming the lane, then what's needed, self-contained (names, paths, links, ids) and why. Symbiot starts that lane's agent on it, and its result comes back to you in \`.symbiot/ANSWERS.md\`. Carry on with what doesn't depend on it, and don't tick what does.`,
    `- \`${OPS}\`: anything outside a repo: this computer (find or install a tool, a JDK, an SDK), accounts and services (cloud, GitHub, DNS, email), the user's connectors.`,
    ...(mk ? [`- \`${MARKETING}\`: marketing for any product: posts, demo videos and screenshots, launches, landing-page copy, campaigns. It drafts them; the user approves each one's preview, and then it posts or schedules it itself through Symbiot's signed-in browser.`] : []),
    `- A repo, by its folder name, for work that belongs in that project${others.length ? `: ${others.map((l) => `\`${l}\``).join(", ")}` : ""}.`,
    ""];
}
// The rule for options in QUESTIONS.md: the user gets only what no agent can do,
// and the option says which kind it is.
const ONLY_YOU = "- Only what no agent can do is the user's: their body (a phone in their hand, a cable, which network they're on), their identity or secrets (signing in, a 2FA code, a token from a provider's console) or a decision that's theirs (closing an account, spending money, sending something in their name). Start such an option with `👤 You (only you: <which>):`, e.g. `👤 You (only you: your Meta token): paste it into .env`. Anything an agent could do, yours or another lane's, is never a 👤 step: do it, or hand it over. Local git work (staging, committing, pulling, pushing, in this repo or another lane's) is never a 👤 step either: do it, or hand it to that repo's lane, and ask only for an OK in QUESTIONS.md before a push, with the files it pushes. Prefer what's already linked: Symbiot's own browser (`~/.config/symbiot/browser`) is signed in to the sites the user linked under Connections, so use that session over any route that needs a new sign-in, an app, a key or their consent (a platform's API, a developer app, OAuth). Check what's linked before you write a 👤 sign-in or link step, ask them to sign in only when a real attempt found the session expired (and say so), and never offer doing an agent's job by hand. When they do have to sign in to a site, name the site's address and the place in the app: `👤 You (only you: your sign-in): sign in to <site, e.g. www.domains.co.za/client/dashboard> in the Symbiot Browser (Settings → Connections → Add a site)`, never just \"in Symbiot's browser\": Symbiot puts a Sign in button on that card, which opens the window there. An option where picking it is enough starts with `🤖 Agent:`. Tag actions only: an option that just reports what the user saw or decides (`it notified me`, `not tried yet`) gets no tag. A permission your run doesn't have (a command, a folder) is never a chore for the user. Write the rules, as narrow as the task needs, to `.symbiot/allowlist.proposed.json` (`{\"permissions\": {\"allow\": [...], \"deny\": [...], \"additionalDirectories\": [...]}}`), ask for it in QUESTIONS.md with the option `👤 You (only you: a permission): allow the list in .symbiot/allowlist.proposed.json`, and stop. If it stays inside the user's work (the folders they gave Symbiot, not ~/.ssh or ~/.config), asks for nothing wide, and doesn't publish or reach another machine, Symbiot turns it on by itself and runs you again: no question reaches the user. Their knowledge folders are already yours to read. Never ask them to copy files or run claude in a terminal for it. Decide what can be undone yourself, as a trusted colleague would: the approach, names, which of two fixes, how to lay files out; pick, do it, and say what you chose and why in your last message. Ask only about what can't be undone, costs money, goes out in the user's name, or needs who they are, and then give 2–3 options with your pick first, marked (recommended). Their answer comes back into this same conversation, so you'll remember everything when it does. Symbiot's membrane (its guard) stops the few things only the user does (pushing to main, publishing, deleting outside your folder, sudo, their keys); if it stops you, ask, don't work around it. Whatever waits on the user's OK (sending, posting, deleting, paying, closing) or on a step only they can take goes in QUESTIONS.md as a question, with what they should check first in its context line, never only in your last message: they aren't asked about what your last message says. Work like a capable clerk, not someone who keeps bugging the boss: decide, do the work with the user's linked accounts, sites and tools, and report after. Before you ask anything, check whether it's already done or answered: the task, ANSWERS.md, what Symbiot knows about them, the key or sign-in or version actually in place (load a real page and look). Never ask again for something they already did or answered. Ask only for passwords or 2FA/SMS codes, a yes before spending money, and a yes before anything hard to undo; put them together in ONE question, never several for the same cause. Never ask them to close the Symbiot Browser: wait and retry, or close it yourself when no sign-in is in progress. Never name a service you haven't confirmed (find a mail provider from the domain's MX records, don't guess). When a step fails or is blocked, find out why and fix or report the cause before you hand anything to them; a tool failing is never a reason to hand them the step. Write every question and option in plain words for someone who doesn't code: no file paths, config names or commands, the exact sign-in address, the reason for asking and what happens if they say no, and never cut an option short. Secrets they've handed over (passwords, recovery codes, tokens) are in Symbiot's vault: `symbiot secret list` shows the names, `symbiot secret get <name>` prints the next unused value (add `--use` to mark a one-use code spent), so ask them for a password or code only when none is saved. Never write a secret into a file, a report, a question or a log.";

// What a run hands back to Symbiot itself (handback.mjs reads it): facts for
// memory, and emails that wait on a reply, which Symbiot then watches for; and
// reports for the user to read (reports.mjs lists them).
const KINDS = ["person", "account", "site", "repo", "project", "decision", "preference", "thing"];
const HANDBACK = ["## Hand back to Symbiot",
  `- Found a lasting fact worth knowing elsewhere (who someone is, which account is what, a decision, how the user likes things)? Write \`.symbiot/REMEMBER.json\`: an array of \`{"name": "…", "kind": "…", "fact": "…"}\` (kind: ${KINDS.join(", ")}; a fact under 300 characters). The user sees them on your block in the Agents tab and picks Remember or Skip: that's the only way into Symbiot's memory.`,
  "- Sent an email, or drafted one for the user to send, that waits on a reply? Write `.symbiot/AWAITING.json`: an array of `{\"to\": \"their address\", \"subject\": \"its exact subject\", \"asked\": \"what you asked for\", \"next\": \"what to do once the reply is in\", \"task\": \"the task it's for\", \"lane\": \"the lane that does that\"}`. Symbiot watches the user's inbox for the reply itself and starts that lane's agent with it, so the user never has to say they replied. Don't tick a task that waits on the reply.",
  "- Wrote up something for the user to read (findings, an audit, a plan, a pitch)? Leave it in `.symbiot/` as a `.md` named for what it is (`COMPANY-AUDIT.md`, not `NOTES.md`), starting with a `# ` title. The user reads it under Reports in Symbiot, so say its name in your last message rather than repeating it there.",
  ""];
const parseJson = (text) => { try { return JSON.parse(String(text || "")); } catch { return null; } };
// .symbiot/REMEMBER.json: [{ name, kind, fact }], the shape mind.mjs remember() takes.
function parseFacts(text) {
  const a = parseJson(text), list = Array.isArray(a) ? a : a && Array.isArray(a.facts) ? a.facts : [];
  return list.map((x) => ({ name: String((x && x.name) || "").trim().slice(0, 80), kind: KINDS.includes(x && x.kind) ? x.kind : "thing", fact: String((x && x.fact) || "").replace(/\s+/g, " ").trim().slice(0, 300) }))
    .filter((x) => x.name && x.fact).slice(0, 40);
}
// .symbiot/AWAITING.json: [{ to, subject, asked, next, task, lane, sent? }]; to may be a list.
function parseAwaiting(text) {
  const a = parseJson(text), list = Array.isArray(a) ? a : a && typeof a === "object" ? [a] : [];
  const str = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
  return list.filter((x) => x && typeof x === "object").map((x) => ({
    to: (Array.isArray(x.to) ? x.to : String(x.to || "").split(/[,;]/)).map((s) => str(s, 200)).filter(Boolean).slice(0, 6),
    subject: str(x.subject, 300), asked: str(x.asked, 1000), next: str(x.next, 2000), task: str(x.task, 1000), lane: str(x.lane, 80),
    ...(Date.parse(x.sent) ? { sent: Date.parse(x.sent) } : {}),
  })).filter((x) => x.subject).slice(0, 20);
}

// ---- local git work is an agent's job --------------------------------------------
// A CI run failed, and the run that looked into it asked the user to paste `git add -A
// && git commit … && git push origin main` into a terminal ("👤 You: review the diff,
// commit and push"), and the card sat on Home under what only the user can do
// (paperclip-steve, 2026-10-08). Staging, committing, pulling and pushing in a local
// repo is an agent's job: it does the work, and asks only for an OK on the Workdesk
// before a push. A step that needs who the user is (a password, a token, signing in)
// is still theirs.
const GIT_WORK = /\bgit\s+(?:add|commit|push|pull|fetch|merge|rebase|stash|restore|checkout|switch)\b|\b(?:stage|commit|push|pull)(?:es|ed|ing)?\b(?:[^.;:]{0,60})\b(?:changes?|diff|fix|files?|branch|main|master|origin|upstream|remote|commits?|them|it)\b/i;
const IDENTITY = /\bpassword\b|\b2fa\b|\btwo-factor\b|\b(?:api )?token\b|\bsign(?:ing)? in\b|\blog ?in\b|\bssh key\b|\bpassphrase\b|\bsudo\b/i;
const gitWork = (text) => { const t = String(text || ""); return GIT_WORK.test(t) && !IDENTITY.test(t); };
const PUSH_OK = "asking for your OK on the Workdesk, with the files, before it pushes";
// A "👤 You: …" option that's local git work, as the agent's: "🤖 Agent: … (asking for
// your OK … before it pushes)". Dropped instead when another option already has the
// agent do it. Options in, options out.
function agentsGitWork(options) {
  const opts = (options || []).map(String), agentDoes = opts.some((o) => /🤖/.test(o) && gitWork(o));
  return opts.flatMap((o) => {
    if (!/^\s*👤/.test(o) || !gitWork(o)) return [o];
    if (agentDoes) return [];
    const rec = /\(recommended\)\s*$/i.test(o), body = o.replace(/^\s*👤\s*You(?:\s*\([^)]*\))?\s*:?\s*/i, "").replace(/\s*\(recommended\)\s*$/i, "").replace(/[.\s]+$/, "");
    return [`🤖 Agent: ${body}${/push/i.test(body) ? `, ${PUSH_OK}` : ""}${rec ? " (recommended)" : ""}`];
  });
}

// ---- posting on a linked platform is an agent's job -------------------------------
// A Marketing card offered two options, both "👤 You (only you: your linkedin): schedule
// all three now in linkedin's scheduler… paste each post's text and attach its card"
// (the [Steve] series, 2026-10-08), with LinkedIn linked in Symbiot's signed-in browser.
// Posting, scheduling, pasting or attaching there is the agent's work; the user's only
// step is approving the post's preview. Signing in (a platform not linked, or signed
// out) is still theirs. linked: the platforms linked in Symbiot, by id or name.
const PLATFORMS = { linkedin: /\blinked ?in\b/i, x: /\b(?:twitter|tweets?|x\.com)\b/i, facebook: /\bfacebook\b/i, instagram: /\binstagram\b/i, threads: /\bthreads\b/i, bluesky: /\bbluesky\b/i, mastodon: /\bmastodon\b/i, youtube: /\byoutube\b/i, tiktok: /\btiktok\b/i, reddit: /\breddit\b/i };
const POSTS_THERE = /\b(?:post|schedul|publish|paste|attach|upload|share|put (?:it|them|the posts?) up)\w*/i;
const platformOf = (text) => Object.keys(PLATFORMS).find((k) => PLATFORMS[k].test(String(text || ""))) || "";
function postsOnLinked(text, linked = []) {
  const t = String(text || ""), on = platformOf(t);
  return !!on && linked.map((x) => String(x).toLowerCase().replace(/[^a-z]/g, "")).includes(on) && POSTS_THERE.test(t) && !IDENTITY.test(t);
}
const APPROVE_FIRST = "once you approve its preview on the Workdesk";
// A "👤 You: …" option that's posting on a linked platform, as the agent's: "🤖 Agent: …
// once you approve its preview". Options in, options out (like agentsGitWork).
function agentsPosting(options, linked = []) {
  return (options || []).map(String).map((o) => {
    if (!/^\s*👤/.test(o)) return o;
    const rec = /\(recommended\)\s*$/i.test(o), body = o.replace(/^\s*👤\s*You(?:\s*\([^)]*\))?\s*:?\s*/i, "").replace(/\s*\(recommended\)\s*$/i, "").replace(/[.\s]+$/, "");
    if (!postsOnLinked(o, linked)) return o; // the platform can be named only in its "(only you: your linkedin)"
    return `🤖 Agent: ${body}, ${APPROVE_FIRST}${rec ? " (recommended)" : ""}`;
  });
}

// ---- what's linked is never asked for again ----------------------------------------
// A Marketing card asked "let a poster on this computer put the steve posts up for
// you?" with two options, both "👤 You (only you: your linkedin sign-in)": "ok it…" and
// "keep doing it by hand. schedule…" (2026-10-08), with LinkedIn already signed in in
// Symbiot's browser. On a platform that's linked, a 👤 sign-in, link, consent or
// developer-app step is the agent's (it uses that session), and doing it by hand is
// never offered. Signing in again stays the user's only when a real attempt found the
// session expired, and the option says so. Options in, options out; never none.
const ASKS_ACCESS = /\bsign(?:ing|ed)?[- ]?(?:in|up)\b|\blog(?:ging)?[- ]?in\b|\blink(?:ing)?\b|\bconnect(?:ing)?\b|\bconsent\b|\bauthori[sz]e\b|\bok it\b|\bdeveloper app\b|\bclient (?:id|secret)\b|\bapi (?:key|access)\b|\boauth\b/i;
const BY_HAND = /\bby hand\b|\bmanually\b|\byourself\b|\bon your own\b/i;
const EXPIRED = /\bexpired?\b|\bsigned out\b|\blogged out\b/i;
const LINKED_NAMES = { linkedin: "LinkedIn", x: "X", facebook: "Facebook", instagram: "Instagram", threads: "Threads", bluesky: "Bluesky", mastodon: "Mastodon", youtube: "YouTube", tiktok: "TikTok", reddit: "Reddit" };
const isLinked = (on, linked) => !!on && linked.map((x) => String(x).toLowerCase().replace(/[^a-z]/g, "")).includes(on);
const viaLinked = (on) => `🤖 Agent: post it through Symbiot's browser, already signed in to ${LINKED_NAMES[on] || on}, ${APPROVE_FIRST}`;
// about: the question, for an option that doesn't name the platform. An option that names
// some other site to sign in to ("sign in to npm") never takes the question's platform: a
// question that only mentions LinkedIn gave an npm sign-in card LinkedIn's buttons.
const NAMES_TARGET = /\b(?:sign|log)(?:ging|ed)?[- ]?in\s+(?:to|at|on|into)\s+(?:your\s+|the\s+)?[\w.-]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i;
function linkedAsks(options, linked = [], about = "") {
  const opts = (options || []).map(String), q = platformOf(about); let on = "";
  const out = opts.flatMap((o) => {
    const p = platformOf(o) || (NAMES_TARGET.test(o) ? "" : q); if (!isLinked(p, linked) || EXPIRED.test(o)) return [o];
    on = p;
    if (BY_HAND.test(o)) return []; // the agent does it: "do it by hand" is never an option
    if (!/^\s*👤/.test(o) || !ASKS_ACCESS.test(o)) return [o];
    return [viaLinked(p) + (/\(recommended\)\s*$/i.test(o) ? " (recommended)" : "")];
  });
  const seen = new Set(), kept = out.filter((o) => { const k = o.replace(/\s*\(recommended\)\s*$/i, ""); if (seen.has(k)) return false; seen.add(k); return true; });
  return kept.length ? kept : on ? [viaLinked(on) + " (recommended)"] : opts;
}
// A "👤 You" step a run's last words leave (leftToYou) that's signing in, linking or
// doing by hand what a linked platform's session already does: not the user's.
const linkedChore = (text, linked = []) => { const t = String(text || ""), p = platformOf(t); return isLinked(p, linked) && !EXPIRED.test(t) && (ASKS_ACCESS.test(t) || BY_HAND.test(t)); };

// ---- what a run's last words leave to the user ----------------------------------
// A run that ends saying something waits on the user ("the draft isn't sent",
// "only you can do that", "needs sudo") without asking it in QUESTIONS.md left it
// where nothing showed it: the email to Jono sat in Drafts and nothing asked for
// the OK. leftToYou finds it: { kind, what, check, label } or null.
// kind "approve": what an agent does once the user says go (send, post, delete, pay,
// close); "step": what only the user can do (sudo, a password, signing in). what:
// the sentence that says so; check: what to check first (the catch it named, else
// the point's next sentence); label: the point's bold name ("Reply to Cale").
const HELD = /\b(?:isn['’]t|wasn['’]t|not|never|hasn['’]t been|haven['’]t|didn['’]t) (?:yet )?(?:been )?(?:sent|send it|posted|post it)\b|\bunsent\b|\bbefore you (?:send|post)\b|\bfor you to (?:send|post)\b|\b(?:send|sending|post|posting) it yourself\b|\byou(?:['’]ll| will) (?:send|post) it\b|\bwaits? (?:on|for) your (?:ok|okay|go-ahead|approval|say-so)\b/i;
const YOURS = /\bonly you (?:can|could|do)\b|\b(?:needs?|waits? (?:on|for)|waiting (?:on|for)) (?:your (?!review)\w+|you to)\b|\btype your password\b|\bneeds sudo\b/i;
const DID = /\b(?:I|we)(?:['’]ve| have)? (?:sent|posted|deleted|paid|closed)\b|\balready (?:went out|sent|posted)\b|\bnothing (?:was |is )?(?:sent|posted)\b/i;
const ACTS = /\b(?:send|sent|sending|post|posted|publish|delete|remove|pay|close|cancel)\b/i;
const CATCH = /\b(?:catch|before you|check|make sure|careful|fix (?:that|it)|first)\b/i;
const NOT_THEIRS = /\bconnectors?\b|\bclaude\.ai\b/i; // a connector to sign in again shows on Home already
const SENDS = /draft|reply|email|mail|message|post/i;
// "when / if / once / until …" before it: it says how something behaves, not that
// something waits on the user now ("It's lit amber when something needs you: … work
// waiting for your OK" described a feature, and showed as a step only you could do).
const COND = /\b(?:when|whenever|if|once|until|unless)\b/i;
function asksNow(s) {
  for (const re of [HELD, YOURS]) { const m = re.exec(s); if (m) { const c = COND.exec(s); if (!c || c.index > m.index) return true; } }
  return false;
}
function leftToYou(text) {
  const points = String(text || "").replace(/```[\s\S]*?```/g, (m) => m.replace(/\s+/g, " ")).split(/\n+|\s+-\s+(?=\*\*)/).map((p) => p.replace(/^\s*[-*•]\s+/, "").trim()).filter(Boolean)
    .map((p) => { const lm = p.match(/^\*\*([^*]{2,60}?):?\*\*:?\s*/), body = lm ? p.slice(lm[0].length) : p;
      return { label: lm ? lm[1].trim() : "", ss: body.split(/(?<=[.!?:])\s+(?=[A-Z`"*(])/).map((s) => s.trim()).filter(Boolean), off: NOT_THEIRS.test(p) }; });
  const clean = (x, n) => { x = String(x || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : x; };
  for (let k = 0; k < points.length; k++) {
    const { label, ss, off } = points[k]; if (off) continue;
    const i = ss.findIndex((s) => !DID.test(s) && asksNow(s));
    if (i < 0) continue;
    const s = ss[i], next = points[k + 1] && !points[k + 1].off ? points[k + 1].ss : [];
    // what to check first: the catch it named (in this point, then the next), else what it says next
    const catches = ss.filter((x, j) => j !== i && CATCH.test(x) && !DID.test(x));
    const elsewhere = points.filter((p, j) => j !== k && !p.off).flatMap((p) => p.ss.filter((x) => /\byourself\b|\bbefore you\b|\bcatch\b/i.test(x) && !DID.test(x)).map((x) => (p.label ? `${p.label}: ${x}` : x)));
    let check = (catches.length ? catches.slice(0, 2).join(" ") : elsewhere[0]) || ss[i + 1] || next[0] || "";
    if (/:$/.test(check)) { const seq = [...ss.slice(i + 1), ...next, ...((points[k + 2] && points[k + 2].ss) || [])], at = seq.indexOf(check); if (at >= 0 && seq[at + 1]) check += " " + seq[at + 1]; } // "paste this:" and then the command
    // "The draft isn't sent." says which draft only in its own point ("**Draft:** it's in Gmail, to …")
    const about = !label && SENDS.test(s) ? points.find((p) => p.label && SENDS.test(p.label) && p.ss.length) : null;
    const what = label ? `${label}: ${s}` : about ? `${s} ${about.label}: ${about.ss[0]}` : s;
    return { kind: HELD.test(s) || ACTS.test(s) || gitWork(s + " " + check) ? "approve" : "step", what: clean(what, 240), check: clean(check === s ? "" : check, 240), label: clean(label || (about && about.label), 60) };
  }
  return null;
}

// What an agent handed over: [{ lane, text }] from its .symbiot/HANDOFF.md.
function parseHandoffs(md) {
  const out = []; let cur = null;
  for (const raw of String(md || "").split(/\r?\n/)) {
    const m = raw.match(/^###\s+`?([^`\s]+)`?\s*$/);
    if (m) { cur = { lane: m[1].trim(), text: "" }; out.push(cur); continue; }
    if (/^#{1,2}\s/.test(raw)) { cur = null; continue; }
    if (cur) cur.text += raw + "\n";
  }
  return out.map((h) => ({ lane: h.lane, text: h.text.trim().slice(0, HANDOVER_MAX) })).filter((h) => h.lane && h.text);
}

export { OPS, MARKETING, HANDOVER_MAX, handoverRules, ONLY_YOU, HANDBACK, gitWork, agentsGitWork, PUSH_OK, postsOnLinked, agentsPosting, APPROVE_FIRST, linkedAsks, linkedChore, parseFacts, parseAwaiting, parseHandoffs, leftToYou };
