// symbiot — the UI specialist. A run asked for a call-centre demo (22 Oct 2026) and ticked it on
// "15/15 tests pass, running on :3100": a bare developer console, KPI tiles reading "n/a" and "0%",
// an empty chat pane and an empty "Last results" with no empty state, raw codes like
// "order_phone_mismatch" in the table, heavy dark tiles, no hierarchy and no story for whoever the
// demo was for. Nobody had looked at it. Tests check code; nothing checked what a person sees.
//
// So UI work is a specialist's job here, in three parts:
// - isUiWork(text, files): what counts as UI work, from the task's words or the files it touches;
// - designBrief(): the standard a UI run works to, and the evidence it must leave (screenshots it
//   took and looked at, with `symbiot shoot`, and the checklist against them) before it ticks;
// - the critic (agents.mjs uiReview): a fresh run on the strongest model, not the builder grading
//   itself, looks at the screenshots and passes the item or reopens it with what to fix. Two rounds
//   at most; then it says honestly that it still doesn't pass.
// Verdicts and rounds are kept in the folder's .symbiot/ui-review.json.
// - the designer (agents.mjs runHandoff, designer: true): before a new screen or a rework is built,
//   a run on the strongest model decides what it should be and writes a spec (the job, the best
//   product of its kind, every flow, each screen at both sizes, states, words, an acceptance list),
//   changing no code. The builder builds to it and the critic judges against it. The Vault (23 Oct
//   2026) was built straight from a one-line task: tidy, and nothing like a password manager, and
//   design only came in afterwards, as a list of corrections. Kept in .symbiot/ui-design.json.
import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = join(fileURLToPath(new URL(".", import.meta.url)), "index.mjs");
// Asked for in words: building or changing something people look at. "app" and "site" only with a
// verb that makes them one ("build the app", "redesign the site"): "send it to the app" isn't UI work.
const UI_NOUN = /\b(ui|ux|user interface|front ?-?end|landing page|dashboard|mock-?up|wireframe|design system|stylesheet|look and feel|(?<!symbiot )screens?|screenshots?|css|styling|layouts?|components?|responsive|dark mode|light mode|tap targets?|(?:mobile|android|ios|desktop|phone|apk|electron) (?:app )?(?:ui|screens?|layouts?|design)|app ui|web ?pages?|home ?pages?|sign-?in page|login page|modal|navbar|nav bar|sidebar|widget|empty state|buttons?)\b/i;
const UI_ACT = /\b(build|make|create|design|redesign|restyle|style|polish|improve|rework|lay ?out|mock|prototype|tidy|fix|update)\w*\b[^.\n]{0,60}?\b(app|website|web app|ui|page|screen|dashboard|console|demo|view|form|panel|look|card|menu|header|footer|theme|button|modal|screenshot|component|layout|mobile app|android app|phone app|desktop app)s?\b/i;
const UI_FILE = /\.(html?|css|scss|sass|less|jsx|tsx|vue|svelte|astro|hbs|handlebars|ejs|njk|liquid|erb)$|(^|\/)(templates?|views|components|pages|public|styles)\//i;
function isUiWork(text = "", files = []) {
  const t = String(text || "");
  if (UI_NOUN.test(t) || UI_ACT.test(t)) return true;
  return (Array.isArray(files) ? files : []).some((f) => UI_FILE.test(String(f && f.file ? f.file : f || "")));
}

// The standard, as a brief section: concrete enough to check a screenshot against.
const CHECKLIST = [
  "The job first: it does what it's for as well as the best product of its kind does. Name that product (a password vault: 1Password or Bitwarden; a dashboard: Linear or Stripe's) and check the flows people expect of it are all there: finding, adding, changing, removing, undoing, a first use and an empty one, keyboard and phone. A flow that's missing fails it, however tidy the rest looks.",
  "First look: the headline says what this is and for whom; one primary action per view, visibly the strongest thing on it.",
  "Hierarchy and grouping: related things sit together under a plain heading; spacing on a 4/8 px scale, the same everywhere; nothing crammed against an edge.",
  "Type: two or three sizes and two weights at most; body text 14–16 px; numbers that matter big, their labels small.",
  "Colour: a small set of tokens (background, surface, text, muted text, one accent, one danger), contrast AA (4.5:1 for text); no heavy dark blocks for ordinary content; light and dark both, if the product has both.",
  "Real content: realistic names, places, amounts and times in demo data; never n/a, 0%, NaN, undefined, lorem, raw ids, enum or snake_case codes (order_phone_mismatch → \"Phone doesn't match the order\"), ISO timestamps or JSON on screen.",
  "States: every list, table, chat and result area has a designed empty state (what goes here and how to fill it), a loading state and an error state in plain words; no blank boxes.",
  "Responsive: right at 1440×900 and at 390×844, no horizontal scroll, nothing cut off, tap targets at least 40 px on the phone size.",
  "Accessible: every control has a visible label or an accessible name, keyboard focus is visible, images have alt text.",
  "Motion only where it explains a change.",
  "A demo tells a story: what the viewer sees first, a guided path through it (a step or a highlighted next action), seeded with data that makes the point the demo is for.",
];
function designBrief({ cli = CLI } = {}) {
  return ["## UI work: the design standard (Symbiot's UI specialist)",
    "This is work people look at, so it is judged by how it looks and reads, not only by its tests. Build it to this standard:",
    ...CHECKLIST.map((c) => `- ${c}`),
    "",
    "**Before you tick a UI item** you must have looked at it, every time:",
    `1. Run it, then screenshot every screen at both sizes: \`node "${cli}" shoot <url> --out .symbiot/shots\` (add \`--full\` for a long page; one URL per screen or state). It prints the PNG paths.`,
    "2. Open each screenshot (Read the image) and critique it in writing against the list above, point by point: what fails and why.",
    "3. Fix what fails, screenshot again, and repeat until every point passes.",
    "4. In your last message, and in a short report `.symbiot/UI-<what it is>.md` (a `# ` title first), list the final screenshots' paths and the checklist with each point's result.",
    "A UI item ticked without that evidence goes back. After you tick it, Symbiot's design critic, a separate agent, looks at your screenshots and either passes it or reopens it with what to fix.", "",
    "**A design spec comes first** for a new screen or a rework: Symbiot's designer writes it before you start, in `.symbiot/design/` (`.symbiot/ui-design.json` says which spec is for which item). Read the item's spec before you build and build to it: its flows, layout, states and words. Its acceptance list is part of done; tick the item only when every point is met and your screenshots show it. Where you have to depart from it, say where and why in your UI report. The critic judges your work against it.", ""];
}

// ---- the critic ---------------------------------------------------------------------
const REVIEW = "ui-review.json", VERDICT = "ui-verdict.json", MAX_ROUNDS = 2;
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
const reviewOf = (path) => readJson(join(path, ".symbiot", REVIEW), {});
function saveReview(path, r) { try { mkdirSync(join(path, ".symbiot"), { recursive: true }); writeFileSync(join(path, ".symbiot", REVIEW), JSON.stringify(r, null, 1)); } catch {} noteOpen(path, r); }

// ---- a merge waits for the critic ------------------------------------------------------------
// On 23 Oct 2026 a page was merged and shipped while the critic had it back with ten fixes: the
// card asking "Can I merge it?" was answered after the critic reopened the work, and nothing tied
// the two. So UI work the critic is still judging, or sent back to be fixed, holds a merge in its
// repo (guard.mjs, `gh pr merge`) until the critic passes it, or, after MAX_ROUNDS, until it's the
// user's call (the item waits [~] on them with what still fails). Kept for the guard, by repo, in
// ui-open.json: { folder: { slug, items, at } }; an entry older than OPEN_MS no longer holds anything.
const OPEN = (home = homedir()) => join(home, ".config", "symbiot", "ui-open.json"), OPEN_MS = 2 * 86400000;
function slugOf(url) { const m = String(url || "").trim().match(/github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i); return m ? `${m[1]}/${m[2]}`.toLowerCase() : ""; }
function folderSlug(folder) { try { return slugOf(spawnSync("git", ["-C", folder, "remote", "get-url", "origin"], { encoding: "utf8", timeout: 5000 }).stdout); } catch { return ""; } }
function noteOpen(path, review, { now = Date.now(), home = homedir(), slug } = {}) {
  const items = Object.entries(review || {}).filter(([, v]) => v && v.rounds > 0 && !v.passed && !v.failed).map(([k]) => k);
  const f = OPEN(home), all = readJson(f, {}) || {};
  if (items.length) all[path] = { slug: slug ?? folderSlug(path), items, at: now }; else if (all[path]) delete all[path]; else return;
  try { mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, JSON.stringify(all, null, 1), { mode: 0o600 }); } catch {}
}
// What holds a merge into this repo (slug "owner/name"): [{ folder, item }], [] when nothing does.
function holdsMerge(slug, { now = Date.now(), home = homedir() } = {}) {
  slug = String(slug || "").toLowerCase(); if (!slug) return [];
  const all = readJson(OPEN(home), {}) || {};
  const name = (x) => String(x || "").split("/").pop(); // by its name too: a repo that moved owner keeps an old remote (GitHub redirects it)
  return Object.entries(all).filter(([, v]) => v && v.slug && (v.slug === slug || name(v.slug) === name(slug)) && now - (v.at || 0) < OPEN_MS).flatMap(([folder, v]) => (v.items || []).map((item) => ({ folder, item })));
}
// A step's own brief that came back in as a task line: on 24 Oct 2026 an agent handed the webapp lane
// "Act as Symbiot's design critic for the webapp lane. Judge the finished job… The job: give each
// screen of the Flutter web demo its own address…", and a designer was started on the critic's
// brief, for a job that already had its spec and its review, with a spec named after the brief.
// A step works from the task it's for: a brief's "The job: …", or nothing when it names none.
const BRIEF = /^(?:new job:\s*)?(?:(?:act as|you are)\s+(?:symbiot'?s\s+|the\s+|a\s+)?(?:design critic|product designer|ui designer|designer|critic|ui specialist)\b|(?:design critic|design first)\s*:)/i;
const isBrief = (t) => BRIEF.test(String(t || "").trim());
const taskOf = (t) => { t = String(t || "").trim(); if (!isBrief(t)) return t; const m = t.match(/\bthe job(?: is)?:\s*(.+)$/i); return m ? m[1].trim() : ""; };
// The same job in other words' clothing: "New job: X…" and a brief's "The job: X…", cut at 200.
const jobNorm = (t) => taskOf(t).replace(/^new job:\s*/i, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function sameJob(a, b) { const x = jobNorm(a), y = jobNorm(b), n = Math.min(x.length, y.length, 60); return n >= 20 && x.slice(0, n) === y.slice(0, n); }
const itemKey = (t) => String(t || "").replace(/^\s*[-*+]\s*\[[ xX~]\]\s*/, "").replace(/\s+—\s+UI review \(round \d\).*$/, "").trim().slice(0, 200);
// Ticked UI items the critic hasn't passed: [{ item }]. files: what the run touched (a task that
// doesn't name its UI still is one when it changed a page or a stylesheet).
function toReview(md, files = [], review = {}) {
  const ticked = String(md || "").split("\n").filter((l) => /^\s*[-*+]\s*\[[xX]\]/.test(l)).map(itemKey).filter(Boolean);
  const ui = ticked.filter((t) => isUiWork(t) || (files.length && isUiWork("", files) && ticked.length === 1));
  return ui.filter((t) => taskOf(t) && !(review[t] && (review[t].passed || review[t].rounds >= MAX_ROUNDS))).map((item) => ({ item, rounds: (review[item] && review[item].rounds) || 0 }));
}
// The critic's instructions, written to .symbiot/UI-CRITIC.md: the run's own prompt passes through
// two shells (agents.mjs HANDOFF_PROMPT), so it only says to read this file.
const CRITIC_PROMPT = "You are the design critic of Symbiot, a UI specialist: read .symbiot/UI-CRITIC.md and do exactly what it says. You review the finished UI work of another agent; you did not build it."; // no quotes, $ or backticks: like HANDOFF_PROMPT it may pass through two shells
function criticBrief(items, { cli = CLI, specs = [] } = {}) {
  const sp = specs.filter((x) => items.some((i) => i.item === x.item || sameJob(i.item, x.item)));
  return ["# Design critic: review the finished UI work", "",
    "You are Symbiot's design critic. Another agent built this and ticked it; you judge it, you don't polish it: change no code and tick nothing.", "",
    "## What to judge", ...items.map((x) => `- ${taskOf(x.item)}`), "",
    "## How",
    "1. Run it if it isn't running (its README or package.json says how).",
    `2. Screenshot every screen and state at both sizes: \`node "${cli}" shoot <url> --out .symbiot/shots/review\` (\`--full\` for a long page).`,
    "3. Open each screenshot (Read the image) and judge it point by point against the standard below. Pass only what a picky product designer would ship to a customer.", "",
    "## The standard", ...CHECKLIST.map((c) => `- ${c}`), "",
    ...(sp.length ? ["## The spec it was built to", "Symbiot's designer wrote what this should be before it was built. Judge each item against its spec as well as the standard: a flow, a screen, a state or an acceptance point in the spec that's missing or wrong fails it.", ...sp.map((x) => `- ${x.item}: \`${x.spec}\``), ""] : []),
    "## Your verdict",
    `Write \`.symbiot/${VERDICT}\`:`, "```json", '{"items":[{"item":"<the item, exactly as listed above>","pass":false,"fixes":["which screen, what is wrong, what it should be"],"shots":[".symbiot/shots/review/…png"]}]}', "```",
    "and a short report `.symbiot/UI-REVIEW.md` (a `# ` title first: passed, or what must change), listing the screenshots. Symbiot sends failed items back to their builder with your fixes.", ""].join("\n");
}
// After the critic: each item passes, or goes back to its builder with the fixes (round 1), or, after
// round 2, is left waiting [~] on the user with what still fails, never silently passed.
function settleVerdict(path, { md = null, now = Date.now() } = {}) {
  const f = join(path, ".symbiot", VERDICT), v = readJson(f, null); if (!v || !Array.isArray(v.items)) return null;
  const review = reviewOf(path), tasksF = join(path, ".symbiot", "TASKS.md");
  let text = md != null ? md : (() => { try { return readFileSync(tasksF, "utf8"); } catch { return ""; } })();
  const out = { passed: [], reopened: [], failed: [] };
  for (const x of v.items) {
    let item = itemKey(x.item); if (!item) continue;
    if (!review[item]) item = Object.keys(review).find((k) => isBrief(k) && sameJob(k, item)) || item; // it was listed by its task
    const r = review[item] || { rounds: 1 }, fixes = (Array.isArray(x.fixes) ? x.fixes : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 12);
    const line = text.split("\n").findIndex((l) => /^\s*[-*+]\s*\[[xX]\]/.test(l) && itemKey(l) === item);
    if (x.pass) { review[item] = { ...r, passed: true, at: now, shots: x.shots || [] }; out.passed.push(item); continue; }
    const lines = text.split("\n");
    if (r.rounds < MAX_ROUNDS) {
      if (line >= 0) lines[line] = `- [ ] ${item} — UI review (round ${r.rounds}): fix ${fixes.join("; ") || "what UI-REVIEW.md lists"}`;
      review[item] = { ...r, at: now, fixes }; out.reopened.push(item);
    } else {
      if (line >= 0) lines[line] = `- [~] (waits on the user: the design critic still fails it after ${MAX_ROUNDS} rounds, see UI-REVIEW.md) ${item}`;
      review[item] = { ...r, failed: true, at: now, fixes }; out.failed.push(item);
    }
    text = lines.join("\n");
  }
  if (md == null) try { writeFileSync(tasksF, text); } catch {}
  saveReview(path, review);
  try { rmSync(f, { force: true }); } catch {}
  return { ...out, md: text };
}

// ---- design first --------------------------------------------------------------------------
const DESIGN = "ui-design.json", MIN_SPEC = 600;
const DESIGNER_PROMPT = "You are the product designer of Symbiot, a UI specialist: read .symbiot/UI-DESIGNER.md and do exactly what it says. You decide what is built; you write no code."; // no quotes, $ or backticks: like HANDOFF_PROMPT it may pass through two shells
// Worth a spec: a new screen, page, app, dashboard, demo or flow, or a rework of one. A small fix
// (spacing, a colour, a typo, moving a button) isn't, unless it says it's a redesign.
const BIG = /\b(build|make|create|add|design|redesign|rework|rebuild|overhaul|revamp|reimagine|new)\b/i;
const THING = /\b(viewers?|pages?|screens?|dashboards?|demos?|portals?|apps?|sites?|website|forms?|panels?|views?|editors?|wizards?|flows?|onboarding|ui|ux|interface|landing)\b/i;
const NOT_LOOK = /\b(faster|performance|speed|memory|tests?|bug|crash|refactor|deploy|migrat\w*|endpoint|api|backend|server|database|schema|cron|webhook)\b/i;
const SMALL = /\b(fix|tweak|nudge|align|typo|colou?r|spacing|padding|margin|rename|bump|move|wording|label)\b/i;
const WHOLE = /\b(redesign|rework|rebuild|overhaul|revamp|new (?:page|screen|app|view|flow|dashboard|site))\b/i;
// A job with no screens: a command or the plumbing under one. "Make symbiot shoot wait for the page's
// network to settle, then take its picture" (24 Oct 2026) got a designer asking for wireframes at 1440
// and 390: "page" and "make" read as a new screen.
const NO_SCREEN = /\b(cli|command[- ]line|terminal|network|time-?outs?|wait(?:s|ing)? (?:for|until)|retr(?:y|ies)|symbiot (?:shoot|screens|browser|capture|secret|login|logout|push|post|watch|models|setup-local|overrides|whoami|uninstall))\b|(?:^|\s)--[a-z]/i;
// A job that says it's built already (the work sits uncommitted in a worktree, say): nothing to design.
const BUILT = /\b(already (?:done|built|made|fixed|written|in place|shipped|merged|finished|implemented)|(?:done|built) already|uncommitted in)\b/i;
function designWorthy(text = "") {
  const t = String(text || ""); if (BUILT.test(t)) return false; if (WHOLE.test(t)) return true;
  return THING.test(t) && BIG.test(t) && !SMALL.test(t) && !NOT_LOOK.test(t) && !NO_SCREEN.test(t);
}
const designOf = (path) => readJson(join(path, ".symbiot", DESIGN), {}) || {};
function saveDesign(path, d) { try { mkdirSync(join(path, ".symbiot"), { recursive: true }); writeFileSync(join(path, ".symbiot", DESIGN), JSON.stringify(d, null, 1)); } catch {} }
const specSlug = (item) => String(taskOf(item) || item).replace(/^new job:\s*/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "ui";
// Open UI items that need a spec and have none, nor a failed try: [{ item, spec }] (spec: its path in the folder).
// A job with a spec already (under its own words or a brief's), or with a critic's verdict on it, is
// past design. review: the folder's ui-review.json.
function toDesign(md, design = {}, review = {}) {
  const open = String(md || "").split("\n").filter((l) => /^\s*[-*+]\s*\[ \]/.test(l)).map(itemKey).filter(Boolean);
  const done = (t) => Object.entries(design).some(([k, v]) => k !== t && v && !v.pending && !v.missing && sameJob(k, t)) || Object.entries(review).some(([k, v]) => v && (v.rounds > 0 || v.passed) && (k === t || sameJob(k, t)));
  return [...new Set(open)].filter((t) => taskOf(t) && designWorthy(taskOf(t)) && (!design[t] || design[t].pending) && !done(t)).map((item) => ({ item, spec: `.symbiot/design/${specSlug(item)}.md` }));
}
// The designer's instructions, written to .symbiot/UI-DESIGNER.md.
function designerBrief(items, { cli = CLI } = {}) {
  return ["# Design first: what this should be, before anyone builds it", "",
    "You are Symbiot's product designer. A builder will build this after you, to your spec, and a critic will judge it against your spec. You decide what it should be. Write no code and tick nothing: your work is the spec.", "",
    "## What to design", ...items.map((x) => `- ${taskOf(x.item)}\n  → write the spec to \`${x.spec}\``), "",
    "## How",
    "1. Read the task, the code it touches and what exists now. If there's a screen already, run it and look at it: " + `\`node "${cli}" shoot <url> --out .symbiot/shots/design\`` + ", then open the screenshots. Read the product's own UI code for its looks, components and words, so what you design fits it.",
    "2. Work out who it's for and what they're trying to do, from the task and the repo. Don't ask unless it truly can't be told; then say what you assumed.",
    "3. Write the spec, a `# ` title first, with these sections:",
    "   - **The job:** what it's for and for whom, and what done looks like to them, in a short paragraph.",
    "   - **The bar:** the best product of its kind (a password vault: 1Password or Bitwarden; a dashboard: Linear or Stripe's; a booking flow: Calendly) and what it does that people now expect.",
    "   - **Flows:** every flow people expect, step by step, with what's on screen at each step: first use, the empty state, finding, adding, changing, removing and undoing, errors, keyboard, phone. Say which flows are in this round.",
    "   - **Screens:** each screen as a plain-text wireframe at desktop (1440 wide) and phone (390 wide): what's where, what's grouped, the one main action, what sticks when it scrolls.",
    "   - **States:** loading, empty, error, success, and locked or no permission where it applies, each with its words.",
    "   - **Words:** the real headings, button labels, empty states and messages, in plain language, as they'll appear.",
    "   - **Out of scope:** what this round deliberately leaves out, so the critic doesn't count it.",
    "   - **Acceptance:** a short checklist anyone can check on a screenshot: concrete and visible, not \"looks good\".",
    "4. Keep it to what this product is: its looks, its components, its tone. Design the best version of it, not a different app.",
    "",
    "Symbiot records each spec when you finish and starts the builder on it. A spec that isn't written leaves the builder without one.", ""].join("\n");
}
// At the designer's end: each item's spec, if it was written (enough of one), else recorded as missing
// so the builder carries on without and no designer is started for it again.
function settleDesign(path, { now = Date.now() } = {}) {
  const d = designOf(path), out = { written: [], missing: [] };
  for (const [item, v] of Object.entries(d)) {
    if (!v || !v.pending) continue;
    let ok = false; try { ok = readFileSync(join(path, v.spec), "utf8").trim().length >= MIN_SPEC; } catch {}
    d[item] = ok ? { spec: v.spec, at: now } : { spec: v.spec, missing: true, at: now };
    (ok ? out.written : out.missing).push(item);
  }
  saveDesign(path, d);
  return out;
}
// A designer that didn't start: its items are no longer pending, so the next run designs them.
function dropDesign(path) { const d = designOf(path); let n = 0; for (const [k, v] of Object.entries(d)) if (v && v.pending) { delete d[k]; n++; } if (n) saveDesign(path, d); return n; }
// The specs written for this folder's items: [{ item, spec }].
const specsFor = (path) => Object.entries(designOf(path)).filter(([, v]) => v && v.spec && !v.pending && !v.missing && existsSync(join(path, v.spec))).map(([item, v]) => ({ item, spec: v.spec }));
// Before a run: what needs designing first. Marks them pending and writes the designer's brief.
function startDesign(path, md, { now = Date.now() } = {}) {
  const items = toDesign(md, designOf(path), reviewOf(path)); if (!items.length) return [];
  const d = designOf(path); for (const x of items) d[x.item] = { pending: true, spec: x.spec, at: now };
  try { mkdirSync(join(path, ".symbiot", "design"), { recursive: true }); writeFileSync(join(path, ".symbiot", "UI-DESIGNER.md"), designerBrief(items)); } catch { return []; }
  saveDesign(path, d);
  return items;
}

// ---- symbiot shoot ---------------------------------------------------------------------
// Screenshots of a page at the given sizes with headless Chrome, as PNG files in `out`.
// sizes: "1440x900,390x844". full: a tall window, so a long page is captured whole.
// Each is taken once the page has loaded and its network has settled (headless.mjs open and
// netWatch, the rule symbiot capture waits by), then its fonts and the images in the window are
// decoded, all inside SHOOT_MS, and one more frame drawn. Not on Chrome's simulated (virtual time)
// clock: that one didn't wait for the first request to another site, so a CDN's photos came out
// late or missing in pictures of a page that was fine (the Daaymn demo, 24 Oct 2026). One browser
// of its own (scratchPage), the page opened again at each size, so what reads the width as it
// loads sees the size it's shot at. A page that never goes quiet is still shot, with what was
// still loading in `late`; images that failed are in `broken` (the page's, not the picture's).
const SHOOT_MS = 8000;
// Runs in the page, with the ms left: fonts ready and every image in the window loaded and
// decoded, or the time's up; then a frame. Gives the images still not there.
const SETTLE_JS = (ms) => `(async () => {
  const end = Date.now() + ${Math.max(0, ms)}, left = () => new Promise((r) => setTimeout(r, Math.max(0, end - Date.now())));
  const by = (p) => Promise.race([Promise.resolve(p).catch(() => {}), left()]);
  await by(document.fonts && document.fonts.ready);
  const seen = [...document.images].filter((i) => { const b = i.getBoundingClientRect(); return b.width && b.height && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; });
  await by(Promise.all(seen.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); }))
    .then(() => (i.naturalWidth ? i.decode() : null)).catch(() => {}))));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return seen.filter((i) => !i.complete).map((i) => i.currentSrc || i.src);
})()`;
const things = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const andList = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a.join(""));
// The words for what shoot couldn't help: still loading at the limit first, then broken images.
function shootNote(late, broken) {
  const sizes = Object.keys(late), all = [...new Set(Object.values(late).flat())], out = [];
  if (sizes.length) out.push(`The page was still loading ${things(all.length, "thing", "things")} after ${SHOOT_MS / 1000} seconds (${all.slice(0, 3).join(", ")}), so the ${andList(sizes)} ${sizes.length === 1 ? "picture" : "pictures"} may be missing them.`);
  if (broken.length) out.push(`${things(broken.length, "image", "images")} on the page didn't load (${broken.slice(0, 3).join(", ")}): that's the page, not the screenshot.`);
  return out.join(" ");
}
async function shoot(url, { out, sizes = "1440x900,390x844", full = false, bin, now = Date.now(), page: withPage, open, short } = {}) {
  url = String(url || ""); if (!/^https?:\/\//i.test(url)) return { error: "Give a page's address, starting http:// or https://." };
  if (!bin) return { error: "No Chrome or Chromium found here." };
  if (!withPage || !open || !short) { const H = await import("./headless.mjs"); withPage = withPage || H.scratchPage; open = open || H.openPage; short = short || H.shortUrl; }
  mkdirSync(out, { recursive: true });
  const shots = [], failed = [], todo = [], late = {}, broken = new Set();
  const slug = (url.replace(/^https?:\/\/[^/]+/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home").slice(0, 40);
  for (const s of String(sizes).split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = s.match(/^(\d{3,4})x(\d{3,4})$/); if (!m) continue;
    todo.push({ size: s, w: Number(m[1]), h: full ? Math.max(Number(m[2]), 4000) : Number(m[2]), file: join(out, `${slug}-${m[1]}x${m[2]}${full ? "-full" : ""}.png`) });
  }
  let why = "";
  try {
    await withPage(async (page) => {
      for (const t of todo) {
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: t.w, height: t.h, deviceScaleFactor: 1, mobile: false });
          const t0 = Date.now(), r = (await open(page, url, { chrome: false, budget: SHOOT_MS })) || {};
          const { result } = (await page.send("Runtime.evaluate", { expression: SETTLE_JS(SHOOT_MS - (Date.now() - t0)), awaitPromise: true, returnByValue: true })) || {};
          const still = [...(r.quiet === false && page.net ? page.net.late() : []), ...((result && Array.isArray(result.value) ? result.value : []).map(short))];
          if (still.length) late[t.size] = [...new Set(still)].slice(0, 5);
          if (page.net) for (const b of page.net.broken()) broken.add(b);
          const { data } = await page.send("Page.captureScreenshot", { format: "png" });
          writeFileSync(t.file, Buffer.from(data, "base64")); shots.push(t.file);
        } catch (e) { why = why || String((e && e.message) || e); failed.push(t.file); delete late[t.size]; }
      }
    }, { width: todo.length ? todo[0].w : 1440, height: todo.length ? todo[0].h : 900 });
  } catch (e) { why = String((e && e.message) || e); }
  for (const t of todo) if (!shots.includes(t.file) && !failed.includes(t.file)) failed.push(t.file);
  if (failed.length && !shots.length) return { error: "Chrome didn't take the screenshots here." + (why ? ` (${why})` : ""), failed };
  const bad = [...broken].slice(0, 5), note = shootNote(late, bad);
  return { shots, ...(failed.length ? { failed } : {}), ...(Object.keys(late).length ? { late } : {}), ...(bad.length ? { broken: bad } : {}), ...(note ? { note } : {}) };
}

export { dropDesign, designWorthy, toDesign, designerBrief, settleDesign, specsFor, startDesign, designOf, DESIGNER_PROMPT, DESIGN, MIN_SPEC, slugOf, folderSlug, noteOpen, holdsMerge, OPEN_MS, isUiWork, designBrief, CHECKLIST, toReview, criticBrief, CRITIC_PROMPT, settleVerdict, reviewOf, saveReview, itemKey, shoot, shootNote, SHOOT_MS, REVIEW, VERDICT, MAX_ROUNDS };
