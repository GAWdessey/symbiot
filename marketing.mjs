// symbiot — Marketing: a lane of its own, for marketing work across every product the
// user makes (Symbiot, Dailify, the agent products…), not one repo's. Tasks go to it as
// "marketing" (a lane, the way ops is one), from the Marketing page, any chat, or
// another lane's handover; its agent works in ~/.config/symbiot/marketing, a git repo
// of its own (local only, no remote), so what it drafts is reviewed and approved like
// any repo's work (Approve commits it there). Each item is tagged with the product it
// markets: "[Dailify] …" as written, else the product its words name. Home shows the
// lane as an orb among the projects, lit when something there needs you (home.mjs
// marketingState). Low level on purpose: scan.mjs (laneMap) imports it.
import { join, relative, basename } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { CONFIG_DIR } from "./core.mjs";
import { MARKETING } from "./handover.mjs";

const MARKETING_DIR = join(CONFIG_DIR, "marketing");
const DRAFTS = "drafts";
const README = `# Marketing

Symbiot's marketing lane: posts, demo videos and screenshots, launches and campaigns for
every product, not one repo's. Its agent drafts here, one folder per product under
\`${DRAFTS}/\`; you review and approve each piece under Marketing in Symbiot, and post it
yourself. Nothing here is ever posted, published or sent by an agent.
`;

// The lane's folder, made the first time a task goes to it: a README (its name on the
// Workdesk), .symbiot kept out of git, and a first commit, so Approve has a branch to
// commit on. Your git name and email when you have them, else Symbiot's.
function ensureMarketing(dir = MARKETING_DIR) {
  if (existsSync(join(dir, ".git"))) return dir;
  try {
    mkdirSync(join(dir, DRAFTS), { recursive: true });
    if (!existsSync(join(dir, "README.md"))) writeFileSync(join(dir, "README.md"), README);
    if (!existsSync(join(dir, ".gitignore"))) writeFileSync(join(dir, ".gitignore"), ".symbiot/\n");
  } catch { return ""; }
  const git = (args, env = {}) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", timeout: 20000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env } });
  if (git(["init", "-q", "-b", "main"]).status !== 0 && git(["init", "-q"]).status !== 0) return "";
  const me = String(git(["config", "user.email"]).stdout || "").trim();
  const who = me ? {} : { GIT_AUTHOR_NAME: "Symbiot", GIT_AUTHOR_EMAIL: "symbiot@localhost", GIT_COMMITTER_NAME: "Symbiot", GIT_COMMITTER_EMAIL: "symbiot@localhost" };
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "Marketing: a lane of its own"], who);
  return dir;
}

// A project's name as people say it (Home's droplets, and the products to tag by): the
// folder can lag behind (CallForge AI is Dailify). The README's title when it's a short name, else package.json's name
// when it's a word, else the folder's. Read once per folder.
const NAMES = new Map();
function displayName(path, folder) {
  folder = String(folder || ""); if (!path) return folder;
  if (NAMES.has(path)) return NAMES.get(path);
  const read = (f) => { try { return readFileSync(join(path, f), "utf8"); } catch { return ""; } };
  const plainName = (s) => { s = String(s || "").replace(/[*`[\]]|^_+|_+$/g, "").trim(); return s && s.length <= 32 && s.split(/\s+/).length <= 4 && !/[:—–|]|\s-\s/.test(s) ? s : ""; };
  const h1 = plainName((read("README.md").match(/^#\s+(.+?)\s*#*\s*$/m) || [])[1]);
  let pkg = ""; try { pkg = String(JSON.parse(read("package.json")).name || "").replace(/^@[^/]+\//, ""); } catch {}
  const name = h1 || (/^[a-z][a-z0-9-]{1,30}$/i.test(pkg) && pkg.toLowerCase() !== folder.toLowerCase().replace(/\s+/g, "-") ? pkg.charAt(0).toUpperCase() + pkg.slice(1) : "") || folder;
  NAMES.set(path, name);
  return name;
}
// The products to tag by: each repo's name as people say it, capitalised.
function productNames(map = {}) {
  const out = new Set();
  for (const [n, p] of Object.entries(map)) { if (n === MARKETING) continue; const d = displayName(p, n); if (d) out.add(d.charAt(0).toUpperCase() + d.slice(1)); }
  return [...out];
}

// ---- product tags -------------------------------------------------------------------
// "[Dailify] Write the launch post": the tag as written. Without one, the first product
// its words name as it's written (capitalised: "Dailify" in a sentence, not "server").
const TAG = /^\s*\[([^\]\n]{2,40})\]\s*/;
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function productOf(text, names = []) {
  const t = String(text || ""), m = t.match(TAG); if (m) return m[1].trim();
  let best = "", at = Infinity;
  for (const n of names) {
    const s = String(n || "").trim(); if (s.length < 3 || !/^[A-Z0-9]/.test(s)) continue;
    const r = new RegExp(`(^|[^A-Za-z0-9])${reEsc(s)}(?![A-Za-z0-9])`).exec(t);
    if (r && r.index < at) { at = r.index; best = s; }
  }
  return best;
}
const untagged = (text) => String(text || "").replace(TAG, "");
// A task's text with its product's tag first (one tag: a new one replaces the old).
function tagged(text, product) {
  const p = String(product || "").replace(/[[\]\n]/g, "").trim().slice(0, 40), t = untagged(text).trim();
  return p ? `[${p}] ${t}` : t;
}
// What counts as marketing in another lane's tasks: posting, launches, campaigns, pricing.
const MARKETING_WORDS = /\b(marketing|symbiot post|posting|posts? (?:to|on) linkedin|linkedin posts?|social (?:media )?posts?|launch|campaign|audience|newsletter|brand|pricing|4-week test|landing page|drafts to post|demo video)\b/i;

// ---- what its agent has drafted -------------------------------------------------------
// drafts/<product>/<name>.md (two levels down at most), newest first: [{ file, name,
// product, at }]. Its product: the "product:" line at its top, else its folder's name.
function draftFiles(dir = MARKETING_DIR, names = [], { max = 30 } = {}) {
  const root = join(dir, DRAFTS), out = [];
  const walk = (d, depth) => {
    let ents = []; try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith(".")) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { if (depth < 2) walk(p, depth + 1); continue; }
      if (!/\.md$/i.test(e.name)) continue;
      let head = "", at = 0; try { head = readFileSync(p, "utf8").slice(0, 600); at = statSync(p).mtimeMs; } catch {}
      const tagLine = (head.match(/^\s*product:\s*(.+)$/im) || [])[1], folder = relative(root, d).split("/")[0] || "";
      const product = (tagLine || "").trim() || names.find((n) => n.toLowerCase() === folder.toLowerCase()) || (folder ? folder.charAt(0).toUpperCase() + folder.slice(1) : "");
      const title = (head.match(/^#\s+(.+)$/m) || [])[1];
      out.push({ file: p, rel: relative(dir, p), name: (title || basename(e.name, ".md").replace(/[-_]+/g, " ")).trim().slice(0, 120), product, at });
    }
  };
  walk(root, 0);
  return out.sort((a, b) => b.at - a.at).slice(0, max);
}

// ---- its brief ----------------------------------------------------------------------------
// The lines TASKS.md gets for this lane (tasks.mjs buildTasksMd): what it is, the products
// its tasks name and where each one's code and docs are, and its rules.
function marketingBrief(list = [], { map = {}, names = productNames(map) } = {}) {
  const named = [...new Set(list.map((t) => productOf(t.text, names)).filter(Boolean))];
  // its repo: by folder, or by its name as people say it (Dailify is in CallForge AI)
  const pathOf = (p) => { const k = Object.keys(map).find((n) => n !== MARKETING && map[n] && [n, basename(map[n]), displayName(map[n], n)].some((x) => x.toLowerCase() === p.toLowerCase())); return k ? map[k] : ""; };
  const where = named.map((p) => ({ p, path: pathOf(p) }));
  return ["## This lane: marketing",
    "This lane markets every product the user makes, not one repo's: posts, demo videos and screenshots, launches, landing-page copy, campaigns. This folder is the lane's own (a local git repo, no remote): what you write here is reviewed and approved under Marketing in Symbiot.",
    ...(where.length ? ["- **Products in these tasks** (read each one's README and docs for what it is and its end goal):", ...where.map((w) => `  - ${w.p}${w.path ? `: \`${w.path}\`` : " (not one of the user's repos here: ask in QUESTIONS.md where it lives, or hand it over)"}`)] : []),
    `- Write each piece as a \`.md\` under \`${DRAFTS}/<product>/\` (\`${DRAFTS}/dailify/launch-post.md\`), a \`# \` title first, then \`product: <Product>\`, so the Marketing page tags it. Its screenshots and clips go next to it.`,
    "- Every post opens with a strong hook (its first line written for reach), says plainly what the product is, and states its end goal. Where the end goal isn't written down, draft one and flag it in QUESTIONS.md for the user to confirm.",
    "- Never post, publish, schedule or send anything, and never sign in anywhere as the user: they approve each draft under Marketing and post it themselves. A post that waits on their OK is a question in QUESTIONS.md, with what to check first."];
}

export { MARKETING, MARKETING_DIR, displayName, productNames, ensureMarketing, productOf, untagged, tagged, MARKETING_WORDS, draftFiles, marketingBrief };
