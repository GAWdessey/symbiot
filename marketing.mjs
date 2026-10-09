// symbiot — Marketing: a lane of its own, for marketing work across every product the
// user makes (Symbiot, Dailify, the agent products…), not one repo's. Tasks go to it as
// "marketing" (a lane, the way ops is one), from the Marketing page, any chat, or
// another lane's handover; its agent works in ~/.config/symbiot/marketing, a git repo
// of its own (local only, no remote), so what it drafts is reviewed and approved like
// any repo's work (Approve commits it there). Each item is tagged with the product it
// markets: "[Dailify] …" as written, else the product its words name. Home shows the
// lane as an orb among the projects, lit when something there needs you (home.mjs
// marketingState). Low level on purpose: scan.mjs (laneMap) imports it.
import { join, relative, basename, dirname } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR, loadConfig } from "./core.mjs";
import { MARKETING } from "./handover.mjs";

const MARKETING_DIR = join(CONFIG_DIR, "marketing");
const CLI = fileURLToPath(new URL("./index.mjs", import.meta.url));
const DRAFTS = "drafts";
const README = `# Marketing

Symbiot's marketing lane: posts, demo videos and screenshots, launches and campaigns for
every product, not one repo's. Its agent drafts here, one folder per product under
\`${DRAFTS}/\`, each post's text under \`## Post\` and its notes under \`## Notes\`. You
approve each one's preview under Marketing in Symbiot; only then does its agent post or
schedule it, through Symbiot's signed-in browser, with exactly the text you approved.
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
      const rel = relative(dir, p); let st = null; try { st = statusOf(dir, rel, parseDraft(readFileSync(p, "utf8")).body); } catch {}
      out.push({ file: p, rel, name: (title || basename(e.name, ".md").replace(/[-_]+/g, " ")).trim().slice(0, 120), product, at, status: st ? st.status : "" });
    }
  };
  walk(root, 0);
  // newest first; two written in the same moment, by name, so the order never depends on timing
  return out.sort((a, b) => b.at - a.at || String(a.rel || a.file || "").localeCompare(String(b.rel || b.file || ""))).slice(0, max);
}

// ---- a draft as the post it will be ---------------------------------------------------
// Opening a draft showed the raw file, its agent's working notes mixed into the post
// (the [Steve] LinkedIn series, 2026-10-08). A draft is now read into the post itself
// and the notes beside it, so the preview, the approval and what gets posted are the
// same text: the head's `key: value` lines, the text under `## Post`, and every other
// `## ` section as notes. One written before that: the post is what's between its first
// two `---` lines, and the rest is notes (with the picture and the date they name).
const MEDIA_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };
const SEE_MORE = 210; // where LinkedIn's feed cuts a post off with "…see more"
const HEAD_KEYS = { product: "product", platform: "platform", when: "when", schedule: "when", date: "when", media: "media", image: "media", video: "media", picture: "media" };
function parseDraft(text) {
  const src = String(text || "").replace(/\r\n/g, "\n"), out = { title: "", product: "", platform: "", when: "", media: [], body: "", notes: "", format: "" };
  const lines = src.split("\n"), head = [];
  let i = 0;
  for (; i < lines.length; i++) { const l = lines[i]; if (/^##\s/.test(l) || /^\s*-{3,}\s*$/.test(l)) break; head.push(l); }
  for (const l of head) {
    let m;
    if (!out.title && (m = l.match(/^#\s+(.+?)\s*$/))) { out.title = m[1]; continue; }
    if ((m = l.match(/^\s*([a-z]+)\s*:\s*(.+?)\s*$/i)) && HEAD_KEYS[m[1].toLowerCase()]) { const k = HEAD_KEYS[m[1].toLowerCase()]; if (k === "media") out.media.push(...m[2].split(/\s*,\s*/).map((x) => x.replace(/`/g, "").trim()).filter(Boolean)); else out[k] = out[k] || m[2]; }
  }
  const rest = lines.slice(i).join("\n");
  if (/^##\s+(?:the\s+)?post\s*$/im.test(rest)) {
    out.format = "sections";
    const notes = [];
    for (const part of rest.split(/^(?=##\s)/m)) {
      const m = part.match(/^##[ \t]+([^\n]+?)[ \t]*(?:\n|$)([\s\S]*)$/); if (!m) continue;
      if (/^(?:the\s+)?post$/i.test(m[1]) && !out.body) out.body = m[2].replace(/^\n+|\s+$/g, "");
      else if (m[2].trim()) notes.push(/^notes?$/i.test(m[1]) ? m[2].trim() : `${m[1]}\n${m[2].trim()}`);
    }
    out.notes = notes.join("\n\n");
  } else if (/^\s*-{3,}\s*$/m.test(rest)) {
    out.format = "legacy";
    const parts = rest.split(/^\s*-{3,}\s*$/m);
    out.body = (parts[1] || "").replace(/^\n+|\s+$/g, "");
    out.notes = parts.slice(2).join("\n").trim();
  } else { out.format = "plain"; out.body = rest.replace(/^\n+|\s+$/g, ""); }
  // what the notes name: its picture or video (`week-02-card.png`), and when it goes out
  if (!out.media.length) out.media = [...new Set((out.notes.match(/[\w./-]+\.(?:png|jpe?g|gif|webp|mp4|mov|webm)\b/gi) || []))];
  if (!out.when) { const w = out.notes.match(/(\d{4}-\d{2}-\d{2})(?:[ ,T]+(\d{1,2}:\d{2}))?/); if (w) out.when = w[2] ? `${w[1]} ${w[2]}` : w[1]; }
  out.platform = (out.platform || "linkedin").toLowerCase();
  return out;
}
// The post's text as the feed shows it before "…see more": cut at a word, at most SEE_MORE.
function seeMore(body, at = SEE_MORE) {
  const t = String(body || "");
  if (t.length <= at) return { shown: t, cut: false };
  const head = t.slice(0, at), k = Math.max(head.lastIndexOf(" "), head.lastIndexOf("\n"));
  return { shown: head.slice(0, k > at * 0.6 ? k : at).replace(/\s+$/, ""), cut: true };
}
// Who the post is from: config.profile ({ name, headline, avatar }), else your git name.
function author({ cfg = loadConfig(), dir = MARKETING_DIR } = {}) {
  const p = (cfg && cfg.profile) || {};
  let name = String(p.name || "").trim();
  if (!name) name = String(spawnSync("git", ["-C", dir, "config", "user.name"], { encoding: "utf8", timeout: 5000 }).stdout || "").trim();
  const avatar = p.avatar && existsSync(String(p.avatar)) && MEDIA_TYPES[String(p.avatar).split(".").pop().toLowerCase()] ? String(p.avatar) : "";
  return { name: name || "You", headline: String(p.headline || "").trim(), avatar: !!avatar, initials: (name || "You").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() };
}
// A file of the lane's, by its path there, only if it is there (no ../ out of it).
function inLane(dir, rel) {
  if (!rel || /\0/.test(rel)) return "";
  const f = join(dir, String(rel));
  try { const real = realpathSync(f), root = realpathSync(dir); return real.startsWith(root + "/") ? real : ""; } catch { return ""; }
}
// The text an approval is for: a draft's post changed after you approved it isn't approved.
const sigOf = (body) => createHash("sha256").update(String(body || "")).digest("hex").slice(0, 16);
const STATUS = ".symbiot/drafts.json";
function draftStatuses(dir = MARKETING_DIR) { try { const d = JSON.parse(readFileSync(join(dir, STATUS), "utf8")); return d && typeof d === "object" ? d : {}; } catch { return {}; } }
function statusOf(dir, rel, body) { const s = draftStatuses(dir)[rel]; return s && s.sig === sigOf(body) ? s : null; }
// Approve or skip a draft: kept by its text (a changed post asks again). { ok, status, draft } or { error }.
function setDraftStatus(rel, status, { dir = MARKETING_DIR, now = Date.now() } = {}) {
  const f = inLane(dir, rel); if (!f || !/\.md$/i.test(f)) return { error: "That draft isn't there any more." };
  if (!["approved", "skipped"].includes(status)) return { error: "Approve or skip it." };
  const d = parseDraft(readFileSync(f, "utf8"));
  if (!d.body) return { error: "That draft has no post in it yet." };
  const all = draftStatuses(dir); all[rel] = { status, sig: sigOf(d.body), at: now };
  try { mkdirSync(join(dir, ".symbiot"), { recursive: true }); writeFileSync(join(dir, STATUS), JSON.stringify(all, null, 2)); } catch (e) { return { error: "Couldn't save it: " + ((e && e.message) || e) }; }
  return { ok: true, status, draft: d };
}
// Everything the Marketing page needs to show a draft as the platform's post: who it's
// from, the text whole and cut where the feed cuts it, its hashtags, its picture or
// video (each a file next to it), its notes apart, and whether you approved it.
function draftPreview(rel, { dir = MARKETING_DIR, cfg } = {}) {
  const f = inLane(dir, rel); if (!f || !/\.md$/i.test(f)) return { error: "That draft isn't there any more." };
  const d = parseDraft(readFileSync(f, "utf8")), base = relative(realpathSync(dir), dirname(f));
  const media = d.media.map((m) => { const r = join(base, m), ext = m.split(".").pop().toLowerCase(); return inLane(dir, r) && MEDIA_TYPES[ext] ? { rel: r, name: basename(m), kind: MEDIA_TYPES[ext].startsWith("video") ? "video" : "image" } : null; }).filter(Boolean);
  const st = statusOf(dir, rel, d.body);
  return { rel, title: d.title, product: d.product, platform: d.platform, when: d.when, body: d.body, ...seeMore(d.body), hashtags: d.body.match(/#[\p{L}\p{N}_]+/gu) || [], chars: d.body.length,
    media, missing: d.media.filter((m) => !media.some((x) => x.name === basename(m))), notes: d.notes, format: d.format, author: author({ cfg, dir }), status: st ? st.status : "", statusAt: st ? st.at : 0 };
}
// A picture or video a draft shows, or the avatar in config.profile: { file, type } or null.
function laneMedia(rel, { dir = MARKETING_DIR, cfg = loadConfig() } = {}) {
  const f = rel === "avatar" ? String(((cfg && cfg.profile) || {}).avatar || "") : inLane(dir, rel), type = f && MEDIA_TYPES[f.split(".").pop().toLowerCase()];
  return type && existsSync(f) ? { file: f, type } : null;
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
    `- Each draft holds the post apart from your notes: a \`# \` title, then \`product:\`, \`platform:\` (linkedin), \`when:\` (YYYY-MM-DD HH:MM, if it's scheduled) and \`media:\` (its picture or video, next to it) lines, then \`## Post\` with exactly the text that goes out (its line breaks, its hashtags) and nothing else, then \`## Notes\` for your reasoning, sources and anything for the user. Symbiot shows \`## Post\` as the platform's own preview, and what you post is that text, unchanged.`,
    `- The user's only step is approving each post's preview under Marketing in Symbiot: never ask them to post, schedule, paste or attach anything themselves, and never mark that as a 👤 step. Symbiot's browser is signed in to the platforms they linked (LinkedIn among them): once a post is approved (ANSWERS.md says "Approved: <its file>"), you post it, or schedule it in the platform's own scheduler for its \`when:\`, through that browser (\`node "${CLI}" screens map <the platform's page>\`, then \`screens type\` and \`screens press\`), with the approved text and media, then check it's there.`
      + " A post not yet approved is a question in QUESTIONS.md with a 🤖 Agent: option (\"🤖 Agent: post it on Tuesday at 08:00, once you approve its preview\"), and what to check first in its context line. Never offer doing it by hand, and never ask them to sign in to or link a platform that's linked: use its session. Only signing in (a platform not linked yet, or a real attempt found its session expired: say so) is the user's: `👤 You (only you: signing in to LinkedIn)`. Never sign in as them, and never post what they haven't approved."];
}

export { MARKETING, MARKETING_DIR, displayName, productNames, ensureMarketing, productOf, untagged, tagged, MARKETING_WORDS, draftFiles, marketingBrief, parseDraft, seeMore, SEE_MORE, draftPreview, setDraftStatus, draftStatuses, laneMedia };
