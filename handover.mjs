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
// it can hand to (repo folder names); reach: what each can reach (reachLines).
function handoverRules(lanes = [], here = "", reach = null) {
  const mk = lanes.includes(MARKETING) && here !== MARKETING, others = [...new Set(lanes.filter((l) => l && l !== here && l !== MARKETING))].slice(0, MAX_LANES_LISTED);
  return ["## Hand over what's another lane's job",
    `Each agent has its own lane${here ? `: this one is \`${here}\`` : ""}. When something you need is another lane's job, don't stop, and don't ask the user to do it: hand it over. Write \`.symbiot/HANDOFF.md\` with a \`### \` heading naming the lane, then what's needed, self-contained (names, paths, links, ids) and why. Symbiot starts that lane's agent on it within 20 seconds, then rewrites the file as a list of what went where, so a HANDOFF.md with no \`### \` section means everything in it was sent (the Agents tab shows how far each lane's agent has got). Its result comes back to you in \`.symbiot/ANSWERS.md\`. Carry on with what doesn't depend on it, and don't tick what does. To add to something you handed to \`${OPS}\` while its run is still going, name that run (\`act-…\`, from the file's Sent list) in the new section: it goes to that run, which does it next, rather than a second run starting on the same thing alongside it. A section much like one you sent before replaces it, and waits for the run on that one; if it's a different job, start its first line with \`New job:\` and it starts a run of its own.`,
    `- \`${OPS}\`: anything outside a repo: this computer (find or install a tool, a JDK, an SDK), accounts and services (cloud, GitHub, DNS, email), the user's connectors.`,
    ...(mk ? [`- \`${MARKETING}\`: marketing for any product: posts, demo videos and screenshots, launches, landing-page copy, campaigns. It drafts them; the user approves each one's preview, and then it posts or schedules it itself through Symbiot's signed-in browser.`] : []),
    `- A repo, by its folder name, for work that belongs in that project${others.length ? `: ${others.map((l) => `\`${l}\``).join(", ")}` : ""}.`,
    ...reachLines(reach, here, [here, ...others]),
    ""];
}
// What each lane can and can't reach (reach.mjs laneReach: { sandboxed, hosts, keys, sites }),
// so a job goes to a lane that can do it. Ops handed bookly a change to the live
// server's .env as "your lane", and bookly can't reach the server: it went back and
// forth until the handover guard stopped it (13 Oct 2026).
function reachLines(reach, here = "", lanes = []) {
  if (!reach) return [];
  const code = (xs) => xs.map((x) => `\`${x}\``).join(", "), hosts = (reach.hosts || []).slice(0, 8);
  const servers = hosts.length ? `the servers this computer connects to (${code(hosts)})` : "any server this computer connects to";
  const repo = here && here !== OPS && here !== MARKETING, keyed = lanes.filter((l) => l && l !== OPS && (reach.keys || {})[l]).slice(0, 12);
  const apis = (reach.apis || []).filter((a) => keyed.includes(a.lane)).slice(0, 8);
  return ["", "What each lane can reach, so you hand a job to one that can do it:",
    `- \`${OPS}\`: runs on this computer, outside any sandbox: ${servers} over ssh, accounts and services, and Symbiot's vault (\`symbiot secret\`).`,
    reach.sandboxed
      ? `- Every repo lane runs in a sandbox: it writes only in its own folder and reaches no server, so it can't change anything on a live server (its \`.env\`, a restart, a deploy), even for its own project. That's \`${OPS}\`'s: the repo lane does the code and says what to change there.`
      : `- Repo lanes run on this computer without a sandbox: they reach the same servers as \`${OPS}\`.`,
    `- Websites are every lane's, not just \`${OPS}\`'s: Symbiot's browser is signed in to the sites the user linked${(reach.sites || []).length ? ` (${code((reach.sites || []).slice(0, 8))}, and more under Settings → Connections)` : " (Settings → Connections)"}, and \`symbiot screens\` reads and presses them from a sandboxed lane too (\`symbiot screens map <address>\`, then \`symbiot screens show <id>\`). A status check on a site the user linked (Meta's WhatsApp Manager, SMS Portal) is yours to do: try it, or the site's own API, before you say your lane can't reach a site, and hand it to \`${OPS}\` only if a real attempt failed. Twilio, Cloudflare and Google sign-ins don't hold in that browser: reach those through their API, CLI or a connector.`,
    ...(keyed.length ? [`- Keys in a lane's own \`.env\` (on this computer, not the server's): ${keyed.map((l) => `\`${l}\` (${reach.keys[l].join(", ")})`).join("; ")}.`] : []),
    ...(apis.length ? [`- A site whose own API one of those keys opens: ${apis.map((a) => `${a.host} (\`${a.lane}\`'s ${a.provider})`).join(", ")}. A check or a read there goes through that API (in that lane, or handed to it) whenever the browser is signed out there: don't ask the user to sign in again for it. Some sites end a browser sign-in by themselves (SMS Portal after about an hour unused), so asking them only brings the same ask back days later.`] : []),
    ...((reach.vault || []).length ? [`- Keys the user already gave, in Symbiot's vault (names only: \`${OPS}\` reads one with \`symbiot secret get "<name>"\`; a sandboxed lane hands that step to \`${OPS}\`): ${reach.vault.slice(0, 12).map((n) => `"${n}"`).join(", ")}. Never ask the user for one of these again, nor to make a new one, unless a real call with it failed (revoked or expired), and then say so.`] : []),
    ...((reach.vaultApis || []).length ? [`- A site whose own API a vault key opens: ${reach.vaultApis.slice(0, 8).map((a) => `${a.host} (the vault's "${a.name}", through \`${OPS}\`)`).join(", ")}.`] : []),
    ...(repo && reach.sandboxed ? [`- Your lane, \`${here}\`, reaches no server. If you're handed a job on one, hand that part to \`${OPS}\`, never back to a repo lane.`] : []),
    `- States outside Symbiot it watches for you through their APIs, every 15 minutes: the PRs it opened (merged, conflicts, a failed check), npm versions, and WhatsApp templates in Meta's review. \`symbiot watch new\` shows what changed (the Status card on the Dashboard). Don't spend a run or the browser checking one again, and don't stay running to wait for one: say what you're waiting for in your last message, and the change starts your lane when a task of yours names it.`,
    `- Deploys go by a lane's runbook (\`symbiot deploy show <lane>\`): the exact command, where it runs, and the address Symbiot checks to call it live. Use it as written. \`${OPS}\`: when you deploy a lane by hand and it has none, record it once, \`symbiot deploy set <lane> --where <host> --how "<the exact command>" --url <live address> --check <an address that answers when it's up>\` (--expect "<text it shows>" if a page always answers). Never set --policy always yourself: that standing yes is the user's, asked on the next deploy.`,
    `- Handed a job your lane can't reach? Don't hand it back to the lane that sent it: send it to the lane above that can, saying why, or say in your last message what stopped you.`];
}
// A command-line tool's own login (gh, gcloud, vercel…) is a different thing from
// the site's link in Symbiot's browser: a sync run found gh logged out, asked "gh is
// logged out… Log back in?" while Connections showed GitHub linked, and the user
// read it as Symbiot saying GitHub wasn't linked, for a step the agent could do.
// Where the site is signed in there, a web/device login the agent finishes itself.
const CLI_LOGIN = "A command-line tool that needs its own login (gh, gcloud, az, vercel, netlify, wrangler…) isn't a 👤 step when its site is signed in in Symbiot's browser (Connections shows it linked): start its web or device login yourself in the background (`gh auth login -h github.com --web --git-protocol https`), open the device page it prints with Symbiot's Screens (`symbiot screens map <that url>`), pick the right account, type the one-time code, press Continue and Authorize, then check it took (`gh auth status`). Only when that site isn't signed in there, it's the wrong account, or it wants a password or 2FA code is it the user's; then say plainly it's the command-line tool's login on this computer (\"the gh command-line tool is signed out\"), not Symbiot's connection, which can show linked while a CLI is signed out.";
// The rule for options in QUESTIONS.md: the user gets only what no agent can do,
// and the option says which kind it is.
const ONLY_YOU = "- Only what no agent can do is the user's: their body (a phone in their hand, a cable, which network they're on), their identity or secrets (signing in, a 2FA code, a token from a provider's console) or a decision that's theirs (closing an account, spending money, sending something in their name). " + CLI_LOGIN + " Start such an option with `👤 You (only you: <which>):`, e.g. `👤 You (only you: your Meta token): paste it into .env`. An option where picking it is enough starts with `🤖 Agent:`. Tag actions only: an option that just reports what the user saw or decides (`it notified me`, `not tried yet`) gets no tag. When the other option is a way to skip, make it a plain `Skip this part` (say what you will leave out), never one that asks for personal details such as their addresses, numbers or accounts.\n- Anything an agent could do, yours or another lane's, is never a 👤 step: do it, or hand it over, and never offer doing an agent's job by hand. Local git work (staging, committing, pulling, pushing, in this repo or another lane's) is never a 👤 step either: do it, or hand it to that repo's lane, and ask only for an OK in QUESTIONS.md before a push, with the files it pushes. A tool failing is never a reason to hand them the step: find out why and fix or report the cause.\n- Prefer what's already linked: Symbiot's own browser (`~/.config/symbiot/browser`) is signed in to the sites the user linked under Connections, so use that session over any route that needs a new sign-in, an app, a key or their consent (a platform's API, a developer app, OAuth). Read and press with `symbiot screens` (a hidden window that keeps your sign-ins), and map a link's address directly instead of pressing it. You can open the visible window yourself (`symbiot browser <url>`, or `symbiot screens signin <site>`): never tell the user you can't open it. But while it is open every `symbiot screens` command, yours and other agents', fails until the user clicks Done in it, so open it only for a sign-in a real attempt showed is expired, never to read, click or browse a page, and never to open an external link such as an Unsubscribe one. Check what's linked before you write a 👤 sign-in step, and ask them to sign in only when a real attempt found the session expired (and say so), and no lane holds a key to its API (What each lane can reach): if one does, use that API instead. Name the site's address and the place in the app: `👤 You (only you: your sign-in): sign in to <site, e.g. www.domains.co.za/client/dashboard> in the Symbiot Browser (Settings → Connections → Add a site)`, never just \"in Symbiot's browser\": Symbiot puts a Sign in button on that card.\n- Being able to send to a mailbox or site is not being able to read it: before you promise to read one, or write a card about it, check Symbiot is signed in to it (Settings → Connections, the linked accounts, the browser session), and if it isn't, say so plainly up front. Find a mail provider from the domain's records (`dig +short MX <domain>`), never a guess.\n- Before you write a step for the user on a site, read the live page (`symbiot screens`, a screenshot or its text) and check the step is possible there: a greyed-out field or \"cannot be changed\" means delete and add again, not Edit. If another running agent is already on that site or step, leave it to that agent or hand over to it: only the owner asks the user anything.\n- Secrets they've handed over are in Symbiot's vault: `symbiot secret list` names them, `symbiot secret get <name>` gives one (`--use` spends a one-use code); a sandboxed run hands that step to ops. One given but not saved (a token in a pasted command): save it, `symbiot secret add \"<name>\" --from <file>`. Never ask for one already given. Never write a secret into a file, a report, a question or a log.\n- A permission your run doesn't have (a command, a folder) is never a chore for the user. Write the rules, as narrow as the task needs, to `.symbiot/allowlist.proposed.json` (`{\"permissions\": {\"allow\": [...], \"deny\": [...], \"additionalDirectories\": [...]}}`), ask for it in QUESTIONS.md with the option `👤 You (only you: a permission): allow the list in .symbiot/allowlist.proposed.json` exactly (Symbiot shows it as an Allow button, with your rules in plain words, so write the question in plain words and never repeat the file's name in it), and stop. If it stays inside the user's work (the folders they gave Symbiot, not ~/.ssh or ~/.config), asks for nothing wide, and doesn't publish or reach another machine, Symbiot turns it on by itself and runs you again. Their knowledge folders are already yours to read. Never ask them to copy files or run claude in a terminal for it.\n- Decide what can be undone yourself, as a trusted colleague would (the approach, names, which of two fixes, how to lay files out), and say what you chose and why in your last message. Symbiot's membrane (its guard) stops the few things only the user does (pushing to main, publishing, deleting outside your folder, sudo, their keys); if it stops you, ask, don't work around it. Never offer an option saying the user changed a Symbiot setting unless Settings has it by name. Whatever waits on the user's OK (sending, posting, deleting, paying, closing) or on a step only they can take goes in QUESTIONS.md as a question, with what they should check first in its context line, never only in your last message: they aren't asked about what your last message says. Their answer comes back into this same conversation. You do every click and every field yourself, in the page, with `symbiot screens`: a card never says click Edit, press Delete, type this and Save. Drive the page to the exact step that needs them first (a security-key prompt, an SMS or 2FA code box, a password not in the vault), and then the card says only that, e.g. \"tap your security key now\". Before you ask them to sign in anywhere, `symbiot screens signin <site>` first: it takes the sign-in from their own Chrome when they have one there, and opens the window only when that fails.\n- Write every question and option in full, in plain words for someone who doesn't code: no file paths, config names or commands, the exact sign-in address, the reason for asking and what happens if they say no, never cut off. The `### ` heading is the card's title and is what the user reads first: make it a whole plain-words question saying what is being decided (\"Should I switch the nightly check to the cheaper AI model?\"), never a file name, a task label or a quote of your own plan (\"start now with the 12 hours of data plus the X.md benchmark\"). Name the real object and action, never a phrase borrowed from inside the content: for swapping the wording of the scheduled 29 Oct LinkedIn post, write \"Swap the 29 Oct LinkedIn post to the WhatsApp INFO wording?\", not \"Have you scheduled the WhatsApp INFO message?\". Its context line says why it matters and what each option means for them, and the first option is your recommendation, with its reason. If the call is low-risk and easy to undo (a setting you can re-tune, a name, a threshold, which of two fixes, whether to start now on what you have), do not ask: take your recommended option, say in your last message that you chose it and how to change it.";

// What a run hands back to Symbiot itself (handback.mjs reads it): facts for
// memory, and emails that wait on a reply, which Symbiot then watches for; and
// reports for the user to read (reports.mjs lists them).
const KINDS = ["person", "account", "site", "repo", "project", "decision", "preference", "thing"];
const HANDBACK = ["## Hand back to Symbiot",
  `- Found a lasting fact worth knowing elsewhere (who someone is, which account is what, a decision, how the user likes things)? Write \`.symbiot/REMEMBER.json\`: an array of \`{"name": "…", "kind": "…", "fact": "…"}\` (kind: ${KINDS.join(", ")}; a fact under 300 characters). The user sees them on your block in the Agents tab and picks Remember or Skip: that's the only way into Symbiot's memory.`,
  "- Sent an email, or drafted one for the user to send, that waits on a reply? Write `.symbiot/AWAITING.json`: an array of `{\"to\": \"their address\", \"subject\": \"its exact subject\", \"asked\": \"what you asked for\", \"next\": \"what to do once the reply is in\", \"task\": \"the task it's for\", \"lane\": \"the lane that does that\"}`. Symbiot watches the user's inbox for the reply itself and starts that lane's agent with it, so the user never has to say they replied. Don't tick a task that waits on the reply.",
  "- Wrote up something for the user to read (findings, an audit, a plan, a pitch)? Leave it in `.symbiot/` as a `.md` named for what it is (`COMPANY-AUDIT.md`, not `NOTES.md`), starting with a `# ` title. The user reads it under Reports in Symbiot, so say its name in your last message rather than repeating it there. Run every read-only check it calls for yourself (over ssh, an API or a CLI) and write what it showed; a command it leaves for the user is complete and copy-pasteable, with every argument's real value and where it runs (`systemctl is-active steve.service`, never `systemctl is-active`).",
  "- Need the user to see a message before it goes out (an SMS, a WhatsApp template with its buttons, a PDF, an email)? Write `.symbiot/PROOF.md`: a `# ` title, then `Kind: sms|whatsapp|pdf|email`, `To: who it goes to`, `File: the PDF's path` and `Buttons: Yes, No` lines as they apply, a blank line, then the message exactly as it goes out. Their phone shows it with Send and Change, and the answer comes back in ANSWERS.md (\"### Proof: …\"). Send nothing until it says Send.",
  "- Waiting for a code a site sends by SMS or email (a sign-in or verification code)? Ask for it in QUESTIONS.md naming the site's address (\"the 6-digit code zoho.com texted you\"): their phone can pass it on by itself, into the vault for one use, and your answer then names it. Read it with `symbiot secret get \"<name>\" --use` and type it only where it's asked.",
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
// (paperclip-robin, 2026-10-08). Staging, committing, pulling and pushing in a local
// repo is an agent's job: it does the work, and asks only for an OK on the Workdesk
// before a push. A step that needs who the user is (a password, a token, signing in)
// is still theirs.
const GIT_WORK = /\bgit\s+(?:add|commit|push|pull|fetch|merge|rebase|stash|restore|checkout|switch)\b|\b(?:stage|commit|push|pull)(?:es|ed|ing)?\b(?:[^.;:]{0,60})\b(?:changes?|diff|fix|files?|branch|main|master|origin|upstream|remote|commits?|them|it)\b/i;
const IDENTITY = /\bpassword\b|\b2fa\b|\btwo-factor\b|\b(?:api )?token\b|\bsign(?:ing)? in\b|\blog ?in\b|\bssh key\b|\bpassphrase\b|\bsudo\b/i;
// A permission is never git work, whatever its words: "allow the list … to check the
// deployed commit, git status and served files" was taken for a commit, and handed back to
// an agent that can't give itself permission, which asked again (LoveLink, 2026-10-12).
const PERMISSION = /allowlist\.proposed|only you: a permission/i;
const gitWork = (text) => { const t = String(text || ""); return GIT_WORK.test(t) && !IDENTITY.test(t) && !PERMISSION.test(t); };
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

// ---- clicking and typing is an agent's job -----------------------------------------
// A card read "👤 You (only you: your security key): at www.npmjs.com/package/symbiot/access
// click GitHub Actions, enter owner GAWdessey, repository symbiot, workflow filename
// publish.yml, tick 'Allow npm publish', click 'Set up…'" (2026-10-11). Clicking, filling a
// form and running a command in the signed-in browser is an agent's work; the user's part is
// the one tap (a security key, a password, an SMS code), which the agent pauses for on the
// Workdesk. A step with fewer than three such actions, or a physical one (a cable, a phone
// in hand, being there), stays the user's. Options in, options out.
const UI_STEP = /\b(?:click|tick|untick|select|choose|fill|enter|paste|type|toggle|press|run `[^`]+`)/gi;
const PHYSICAL = /\b(?:plug|unplug|usb|cable|in person|in hand|wi-?fi|network|reboot)\b/i;
const TAP = /\b(security key|passkey|password|2fa(?: code)?|sms code|verification code|one-time code|authenticator)\b/i;
const clicking = (text) => { const t = String(text || ""); return !PHYSICAL.test(t) && (t.match(UI_STEP) || []).length >= 3; };
function agentsClicking(options) {
  return (options || []).map(String).map((o) => {
    if (!/^\s*👤/.test(o) || !clicking(o)) return o;
    const rec = /\(recommended\)\s*$/i.test(o), tag = (o.match(/\(only you:\s*([^)]*)\)/i) || [])[1] || "", tap = (TAP.exec(tag) || TAP.exec(o) || [])[1];
    const body = o.replace(/^\s*👤\s*You(?:\s*\([^)]*\))?\s*:?\s*/i, "").replace(/\s*\(recommended\)\s*$/i, "").replace(/[.\s]+$/, "");
    return `🤖 Agent: ${body}${tap ? `, pausing on the Workdesk only for your ${tap.toLowerCase()}` : ""}${rec ? " (recommended)" : ""}`;
  });
}

// ---- code changes, patches, edits and uploads are an agent's job ------------------
// A card offered "👤 You (only you: a Symbiot code change)" for the WhatsApp photo-upload
// patch (2026-10-11); the user: "i dont know how to do this". Changing code, applying a patch,
// editing a file or uploading one is an agent's work; the user only approves. A step that
// needs who they are (a password, a code, signing in) or the body (a cable, a phone) stays theirs.
const CODE_WORK = /\bcode change|\b(?:apply|run|install)\b[^.;:]{0,40}\bpatch\b|\bpatch(?:es)?\b|\b(?:edit|change|modify|update|fix|rewrite)\b[^.;:]{0,40}\b(?:code|files?|config|source|repo|script)\b|\b(?:upload|attach)\b[^.;:]{0,30}\b(?:files?|images?|photos?)\b|\bpull request\b/i;
const codeWork = (text) => { const t = String(text || ""); return CODE_WORK.test(t) && !IDENTITY.test(t) && !PHYSICAL.test(t) && !TAP.test(t); };
function agentsCodeWork(options) {
  const opts = (options || []).map(String), agentDoes = opts.some((o) => /🤖/.test(o) && codeWork(o));
  return opts.flatMap((o) => {
    if (!/^\s*👤/.test(o) || !codeWork(o)) return [o];
    if (agentDoes) return [];
    const rec = /\(recommended\)\s*$/i.test(o), body = o.replace(/^\s*👤\s*You(?:\s*\([^)]*\))?\s*:?\s*/i, "").replace(/\s*\(recommended\)\s*$/i, "").replace(/[.\s]+$/, "");
    return [`🤖 Agent: ${body}, then asking for your OK on the Workdesk${rec ? " (recommended)" : ""}`];
  });
}

// ---- one agent owns a site at a time ----------------------------------------------
// Two agents ran the same npm step in the one Symbiot Browser window (2026-10-10) and each
// asked the user something different (a password, and to close the window). The first agent to
// ask about a site owns it; a later agent's question about the same site is held, and the
// owner's stays the one he sees. `asks`: [{ path, startedAt, text }], text = the question and
// its options. Gives the paths whose ask is held, with who holds it: { path: ownerPath }.
const SITE = /\b((?:[a-z0-9-]+\.)+(?:com|org|net|io|co\.za|co\.uk|dev|app|ai|gov|edu|za))\b/gi;
const sitesOf = (text) => [...new Set([...String(text || "").matchAll(SITE)].map((m) => m[1].toLowerCase().replace(/^www\./, "")))];
function heldAsks(asks) {
  const held = {}, owner = new Map();
  for (const a of [...(asks || [])].sort((x, y) => (x.startedAt || 0) - (y.startedAt || 0))) {
    const mine = sitesOf(a.text).filter((s) => owner.has(s) && owner.get(s) !== a.path);
    if (mine.length) { held[a.path] = owner.get(mine[0]); continue; }
    for (const s of sitesOf(a.text)) if (!owner.has(s)) owner.set(s, a.path);
  }
  return held;
}

// ---- posting on a linked platform is an agent's job -------------------------------
// A Marketing card offered two options, both "👤 You (only you: your linkedin): schedule
// all three now in linkedin's scheduler… paste each post's text and attach its card"
// (the [Robin] series, 2026-10-08), with LinkedIn linked in Symbiot's signed-in browser.
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

// ---- acting on an email is an agent's job when the mailbox is linked ---------------
// During the GitHub move a card told the user to accept GitHub's transfer email himself
// (2026-10-10), with his Gmail linked. Opening, reading, replying to or following a link in
// a mail is the agent's work through the mail connector or Symbiot's signed-in browser; the
// user only gives the yes before anything hard to undo. linked: the linked site ids (gmail,
// outlook). A password, a code or a physical step stays theirs. Options in, options out.
const MAIL_STEP = /\b(?:accept|approve|confirm|open|click|follow|check|find|reply|forward|read)\b[^.;:]{0,60}\b(?:e-?mails?|inbox|invit(?:e|ation)s?|transfer request|confirmation link|verification link|link in)\b|\b(?:e-?mail|invitation|inbox)\b[^.;:]{0,40}\b(?:accept|confirm|approve|click|follow)\b/i;
const mailLinked = (linked = []) => linked.map((x) => String(x).toLowerCase().replace(/[^a-z]/g, "")).some((x) => x === "gmail" || x === "outlook");
const mailWork = (text, linked = []) => { const t = String(text || ""); return mailLinked(linked) && MAIL_STEP.test(t) && !IDENTITY.test(t) && !PHYSICAL.test(t) && !TAP.test(t); };
function agentsMail(options, linked = []) {
  const opts = (options || []).map(String), agentDoes = opts.some((o) => /🤖/.test(o) && mailWork(o, linked));
  return opts.flatMap((o) => {
    if (!/^\s*👤/.test(o) || !mailWork(o, linked)) return [o];
    if (agentDoes) return [];
    const rec = /\(recommended\)\s*$/i.test(o), body = o.replace(/^\s*👤\s*You(?:\s*\([^)]*\))?\s*:?\s*/i, "").replace(/\s*\(recommended\)\s*$/i, "").replace(/[.\s]+$/, "");
    return [`🤖 Agent: ${body}, through your linked mailbox, asking for your OK on the Workdesk before anything that can't be undone${rec ? " (recommended)" : ""}`];
  });
}

// ---- what's linked is never asked for again ----------------------------------------
// A Marketing card asked "let a poster on this computer put the robin posts up for
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
const linkedChore = (text, linked = []) => { const t = String(text || ""), p = platformOf(t); return mailWork(t, linked) || isLinked(p, linked) && !EXPIRED.test(t) && (ASKS_ACCESS.test(t) || BY_HAND.test(t)); };

// ---- what a run's last words leave to the user ----------------------------------
// A run that ends saying something waits on the user ("the draft isn't sent",
// "only you can do that", "needs sudo") without asking it in QUESTIONS.md left it
// where nothing showed it: the email to Remy sat in Drafts and nothing asked for
// the OK. leftToYou finds it: { kind, what, check, label } or null.
// kind "approve": what an agent does once the user says go (send, post, delete, pay,
// close); "step": what only the user can do (sudo, a password, signing in). what:
// the sentence that says so; check: what to check first (the catch it named, else
// the point's next sentence); label: the point's bold name ("Reply to Alex").
const HELD = /\b(?:isn['’]t|wasn['’]t|not|never|hasn['’]t been|haven['’]t|didn['’]t) (?:yet )?(?:been )?(?:sent|send it|posted|post it)\b|\bunsent\b|\bbefore you (?:send|post)\b|\bfor you to (?:send|post)\b|\b(?:send|sending|post|posting) it yourself\b|\byou(?:['’]ll| will) (?:send|post) it\b|\bwaits? (?:on|for) your (?:ok|okay|go-ahead|approval|say-so)\b/i;
const YOURS = /\bonly you (?:can|could|do)\b|\b(?:needs?|waits? (?:on|for)|waiting (?:on|for)) (?:your (?!review)\w+|you to)\b|\btype your password\b|\bneeds sudo\b/i;
const DID = /\b(?:I|we)(?:['’]ve| have)? (?:sent|posted|deleted|paid|closed)\b|\balready (?:went out|sent|posted)\b|\bnothing (?:was |is )?(?:sent|posted)\b/i;
const ACTS = /\b(?:send|sent|sending|post|posted|publish|delete|remove|pay|close|cancel)\b/i;
const CATCH = /\b(?:catch|before you|check|make sure|careful|fix (?:that|it)|first)\b/i;
const NOT_THEIRS = /\bconnectors?\b|\bclaude\.ai\b/i; // a connector to sign in again shows on Home already
// Work another lane does: ops on a server, marketing posting, or a job handed over. The run
// handed it on (HANDOFF.md), so it's on its way and never the user's to do: bookly's "Ops has
// to load it on prod, which this lane can't reach." showed as a card with "I've done this"
// though ops had it, and had done it (14 Oct 2026). Unless it says only the user can.
const LANE_JOB = /\b(?:ops|marketing)(?:['’]s?)?(?: (?:lane|agent|run))? (?:has to|have to|must|needs? to|will|would|is (?:to|going to|doing|on)|does|do(?:es)? it|can|then|loads?|runs?|deploys?|applies|sets?|restarts?|ships?)\b|\b(?:hand(?:ed|ing)?|passed|sent|gave|given|went) (?:it |this |that |the [\w-]+ )?(?:over |back )?to (?:the )?(?:ops|marketing|[\w-]+(?:['’]s)? (?:lane|agent))\b|\b(?:this|my|our|the [\w-]+) lane can(?:['’]t|not) (?:reach|do|get to|touch)\b|\b(?:another|other|ops['’]?s?) lane\b|\bops['’]s? (?:job|work|side)\b/i;
const lanesJob = (t) => LANE_JOB.test(String(t || "")) && !/\bonly you\b/i.test(String(t || ""));
const SENDS = /draft|reply|email|mail|message|post/i;
// "when / if / once / until …" before it: it says how something behaves, not that
// something waits on the user now ("It's lit amber when something needs you: … work
// waiting for your OK" described a feature, and showed as a step only you could do).
const COND = /\b(?:when|whenever|if|once|until|unless)\b/i;
function asksNow(s) {
  for (const re of [HELD, YOURS]) { const m = re.exec(s); if (m) { const c = COND.exec(s); if (!c || c.index > m.index) return true; } }
  return false;
}
// A command, a path or code is never something the user is handed: they don't code. A card's
// check read "Not checked: To compare them yourself: diff <(jq -S . ~/.config/…) …" (24 Oct 2026).
const COMMANDISH = /`{1,3}[^`\n]{2,}`{1,3}|\$\(|<\(|(?:^|[\s(])~\/|(?:^|\s)\.{0,2}\/[\w.-]+\/[\w.-]|(?:^|[\s:])(?:diff|jq|cat|grep|sudo|npm|npx|node|git|curl|ls|cd|chmod|rm|cp|mv|sed|awk|python3?|bash|ssh|systemctl)\s+(?:-{1,2}\w|[~./<$|])/;
const commandish = (s) => COMMANDISH.test(String(s || ""));
// What's left of a sentence once the command in it is gone: "" when that leaves only its lead-in ("To compare them yourself:").
const noCommand = (s) => { s = String(s || ""); const m = COMMANDISH.exec(s); if (!m) return s; const t = s.slice(0, m.index).replace(/(?:[\s:;,(-]|\b(?:run|type|paste|use|try|with|enter|do)\b)+$/i, "").trim(); return t.split(/\s+/).length < 4 || /\byourself\b/i.test(t) ? "" : t + "."; };
function leftToYou(text) {
  const points = String(text || "").replace(/```[\s\S]*?```/g, (m) => m.replace(/\s+/g, " ")).split(/\n+|\s+-\s+(?=\*\*)/).map((p) => p.replace(/^\s*[-*•]\s+/, "").trim()).filter(Boolean)
    .map((p) => { const lm = p.match(/^\*\*([^*]{2,60}?):?\*\*:?\s*/), body = lm ? p.slice(lm[0].length) : p;
      return { label: lm ? lm[1].trim() : "", ss: body.split(/(?<=[.!?:])\s+(?=[A-Z`"*(])/).map((s) => s.trim()).filter(Boolean), off: NOT_THEIRS.test(p) || lanesJob(p) }; });
  const clean = (x, n) => { x = String(x || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : x; };
  for (let k = 0; k < points.length; k++) {
    const { label, ss, off } = points[k]; if (off) continue;
    const i = ss.findIndex((s) => !DID.test(s) && asksNow(s));
    if (i < 0) continue;
    const s = ss[i], next = points[k + 1] && !points[k + 1].off ? points[k + 1].ss : [];
    // what to check first: the catch it named (in this point, then the next), else what it says next
    const catches = ss.filter((x, j) => j !== i && CATCH.test(x) && !DID.test(x));
    const elsewhere = points.filter((p, j) => j !== k && !p.off && !BLOCKED_LABEL.test(p.label)).flatMap((p) => p.ss.filter((x) => /\byourself\b|\bbefore you\b|\bcatch\b/i.test(x) && !DID.test(x) && !commandish(x)).map((x) => (p.label ? `${p.label}: ${x}` : x)));
    let check = (catches.length ? catches.slice(0, 2).join(" ") : elsewhere[0]) || ss[i + 1] || next[0] || "";
    if (/:$/.test(check)) { const seq = [...ss.slice(i + 1), ...next, ...((points[k + 2] && points[k + 2].ss) || [])], at = seq.indexOf(check); if (at >= 0 && seq[at + 1]) check += " " + seq[at + 1]; } // "paste this:" and then the command
    // "The draft isn't sent." says which draft only in its own point ("**Draft:** it's in Gmail, to …")
    const about = !label && SENDS.test(s) ? points.find((p) => p.label && SENDS.test(p.label) && p.ss.length) : null;
    if (commandish(check)) check = noCommand(check);
    const said = label ? `${label}: ${s}` : about ? `${s} ${about.label}: ${about.ss[0]}` : s, what = commandish(said) ? noCommand(said) || said.replace(COMMANDISH, " ") : said;
    return { kind: HELD.test(s) || ACTS.test(s) || gitWork(s + " " + check) ? "approve" : "step", what: clean(what, 240), check: clean(check === s ? "" : check, 240), label: clean(label || (about && about.label), 60) };
  }
  return null;
}

// ---- a check a run couldn't make: a run that can makes it --------------------------
// "Not checked: Symbiot's settings and vault, because the membrane blocks me from reading them"
// left the check to the user, with a command to run (24 Oct 2026). A point like that, stopped by
// the sandbox, the membrane or a permission, is ops's to do (it runs with Symbiot's own access):
// [{ what }], each in the run's words with any command taken out. Not one the run handed on already.
const BLOCKED_LABEL = /^(?:not (?:checked|verified|tested|confirmed)|unchecked|unverified|couldn['’]t (?:check|verify)|didn['’]t (?:check|verify)|left unchecked)\b/i;
const STOPPED_READING = /\b(?:membrane|sandbox)\b[^.]{0,80}\b(?:block|stop|den(?:y|ies|ied)|won['’]t let|doesn['’]t let|kept)|\bblock(?:s|ed)? (?:me |this run |the run )?(?:from )?(?:reading|checking|opening|seeing)\b|\bpermission denied\b|\bEACCES\b|\b(?:can['’]t|cannot|couldn['’]t|could not|unable to|not allowed to) (?:read|open|access|see inside)\b/i;
function blockedChecks(text) {
  const out = [];
  for (const raw of String(text || "").replace(/```[\s\S]*?```/g, " ").split(/\n+/)) {
    const p = raw.replace(/^\s*(?:[-*•]\s+|#{1,4}\s*)/, "").trim(); if (!p) continue;
    const lm = p.match(/^\*\*([^*]{2,60}?):?\*\*:?\s*/) || p.match(/^((?:not|un|couldn|didn|left)[\w’' ]{2,30}?):\s+/i), label = lm ? lm[1].trim() : "", body = lm ? p.slice(lm[0].length) : p;
    if (!(BLOCKED_LABEL.test(label) || BLOCKED_LABEL.test(body)) || !STOPPED_READING.test(body) || lanesJob(body)) continue;
    const what = body.split(/(?<=[.!?])\s+/).map(noCommand).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (what) out.push({ what: what.slice(0, 400) });
  }
  return out;
}
// The handover for one: what ops is to check, by names only for the vault, and how to say what it found.
const blockedHandover = (lane, what) => `New job: a check the ${lane} lane's run couldn't make, because its sandbox or Symbiot's membrane stopped it reading what it needed. In its words: "${what}" Make that check with your own access and write what you found for the ${lane} lane, in plain words. For Symbiot's vault, compare entry names only (\`symbiot secret list\`), never their values. Give the user no commands or file paths.`;

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

export { lanesJob, agentsMail, mailWork, OPS, MARKETING, HANDOVER_MAX, handoverRules, CLI_LOGIN, ONLY_YOU, HANDBACK, gitWork, agentsGitWork, agentsClicking, agentsCodeWork, heldAsks, sitesOf, PUSH_OK, postsOnLinked, agentsPosting, APPROVE_FIRST, linkedAsks, linkedChore, parseFacts, parseAwaiting, parseHandoffs, leftToYou, commandish, blockedChecks, blockedHandover };
