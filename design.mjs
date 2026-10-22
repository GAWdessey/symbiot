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
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = join(fileURLToPath(new URL(".", import.meta.url)), "index.mjs");
// Asked for in words: building or changing something people look at. "app" and "site" only with a
// verb that makes them one ("build the app", "redesign the site"): "send it to the app" isn't UI work.
const UI_NOUN = /\b(ui|ux|user interface|front ?-?end|landing page|dashboard|mock-?up|wireframe|design system|stylesheet|look and feel)\b/i;
const UI_ACT = /\b(build|make|create|design|redesign|restyle|style|polish|improve|rework|lay ?out|mock|prototype|tidy|fix|update)\w*\b[^.\n]{0,60}?\b(app|website|web app|ui|page|screen|dashboard|console|demo|view|form|panel|look)s?\b/i;
const UI_FILE = /\.(html?|css|scss|sass|less|jsx|tsx|vue|svelte|astro|hbs|handlebars|ejs|njk|liquid|erb)$|(^|\/)(templates?|views|components|pages|public|styles)\//i;
function isUiWork(text = "", files = []) {
  const t = String(text || "");
  if (UI_NOUN.test(t) || UI_ACT.test(t)) return true;
  return (Array.isArray(files) ? files : []).some((f) => UI_FILE.test(String(f && f.file ? f.file : f || "")));
}

// The standard, as a brief section: concrete enough to check a screenshot against.
const CHECKLIST = [
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
    "A UI item ticked without that evidence goes back. After you tick it, Symbiot's design critic, a separate agent, looks at your screenshots and either passes it or reopens it with what to fix.", ""];
}

// ---- the critic ---------------------------------------------------------------------
const REVIEW = "ui-review.json", VERDICT = "ui-verdict.json", MAX_ROUNDS = 2;
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
const reviewOf = (path) => readJson(join(path, ".symbiot", REVIEW), {});
function saveReview(path, r) { try { mkdirSync(join(path, ".symbiot"), { recursive: true }); writeFileSync(join(path, ".symbiot", REVIEW), JSON.stringify(r, null, 1)); } catch {} }
const itemKey = (t) => String(t || "").replace(/^\s*[-*+]\s*\[[ xX~]\]\s*/, "").replace(/\s+—\s+UI review \(round \d\).*$/, "").trim().slice(0, 200);
// Ticked UI items the critic hasn't passed: [{ item }]. files: what the run touched (a task that
// doesn't name its UI still is one when it changed a page or a stylesheet).
function toReview(md, files = [], review = {}) {
  const ticked = String(md || "").split("\n").filter((l) => /^\s*[-*+]\s*\[[xX]\]/.test(l)).map(itemKey).filter(Boolean);
  const ui = ticked.filter((t) => isUiWork(t) || (files.length && isUiWork("", files) && ticked.length === 1));
  return ui.filter((t) => !(review[t] && (review[t].passed || review[t].rounds >= MAX_ROUNDS))).map((item) => ({ item, rounds: (review[item] && review[item].rounds) || 0 }));
}
// The critic's instructions, written to .symbiot/UI-CRITIC.md: the run's own prompt passes through
// two shells (agents.mjs HANDOFF_PROMPT), so it only says to read this file.
const CRITIC_PROMPT = "You are the design critic of Symbiot, a UI specialist: read .symbiot/UI-CRITIC.md and do exactly what it says. You review the finished UI work of another agent; you did not build it."; // no quotes, $ or backticks: like HANDOFF_PROMPT it may pass through two shells
function criticBrief(items, { cli = CLI } = {}) {
  return ["# Design critic: review the finished UI work", "",
    "You are Symbiot's design critic. Another agent built this and ticked it; you judge it, you don't polish it: change no code and tick nothing.", "",
    "## What to judge", ...items.map((x) => `- ${x.item}`), "",
    "## How",
    "1. Run it if it isn't running (its README or package.json says how).",
    `2. Screenshot every screen and state at both sizes: \`node "${cli}" shoot <url> --out .symbiot/shots/review\` (\`--full\` for a long page).`,
    "3. Open each screenshot (Read the image) and judge it point by point against the standard below. Pass only what a picky product designer would ship to a customer.", "",
    "## The standard", ...CHECKLIST.map((c) => `- ${c}`), "",
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
    const item = itemKey(x.item); if (!item) continue;
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

// ---- symbiot shoot ---------------------------------------------------------------------
// Screenshots of a page at the given sizes with headless Chrome, as PNG files in `out`.
// sizes: "1440x900,390x844". full: a tall window, so a long page is captured whole.
function shoot(url, { out, sizes = "1440x900,390x844", full = false, bin, now = Date.now(), run = spawnSync } = {}) {
  url = String(url || ""); if (!/^https?:\/\//i.test(url)) return { error: "Give a page's address, starting http:// or https://." };
  if (!bin) return { error: "No Chrome or Chromium found here." };
  mkdirSync(out, { recursive: true });
  const prof = join(out, `.chrome-${process.pid}-${now}`), shots = [], failed = [];
  const slug = (url.replace(/^https?:\/\/[^/]+/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home").slice(0, 40);
  for (const s of String(sizes).split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = s.match(/^(\d{3,4})x(\d{3,4})$/); if (!m) continue;
    const [w, h] = [Number(m[1]), full ? Math.max(Number(m[2]), 4000) : Number(m[2])], file = join(out, `${slug}-${m[1]}x${m[2]}${full ? "-full" : ""}.png`);
    run(bin, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--disable-crash-reporter", "--no-sandbox",
      `--user-data-dir=${prof}`, `--window-size=${w},${h}`, "--virtual-time-budget=4000", `--screenshot=${file}`, url], { timeout: 60000, stdio: "ignore" });
    (existsSync(file) ? shots : failed).push(file);
  }
  try { rmSync(prof, { recursive: true, force: true }); } catch {}
  return failed.length && !shots.length ? { error: "Chrome didn't take the screenshots here.", failed } : { shots, ...(failed.length ? { failed } : {}) };
}

export { isUiWork, designBrief, CHECKLIST, toReview, criticBrief, CRITIC_PROMPT, settleVerdict, reviewOf, saveReview, itemKey, shoot, REVIEW, VERDICT, MAX_ROUNDS };
