// symbiot — Post: your week's real work as three draft posts (LinkedIn), in your
// own voice, each waiting on you on the Dashboard: Approve, Edit or Skip.
//
// - What it writes from: the last 7 days of commits, the release tags (and gh's
//   releases, when gh works) and the CHANGELOG.md sections dated in that window,
//   in the repos Symbiot already scans. Each is a numbered fact; the AI must cite
//   the facts each post uses, and a post that names a number, a version or a name
//   the facts don't show is sent back once, then dropped (checkClaims).
// - Your voice: example posts of yours in voice.md (Symbiot's config folder), a
//   line of --- between each. Without them it doesn't draft. Link LinkedIn and it
//   can read your recent posts into voice.md for you, on your click.
// - Nothing is posted by Symbiot, ever. LinkedIn has no posting route without a
//   partner app, so Approve copies the post to your clipboard and opens LinkedIn's
//   share box for you to paste it. It doesn't schedule.
// - Every action (drafted, edited, approved, skipped, dropped, replaced) is
//   appended to posts-log.jsonl, with the text, the date and the platform.
//
// Stored in ~/.config/symbiot/posts.json, readable by you only:
// { posts: [{ id, kind, text, facts: [n], sources: [fact line], platform, status, drafted, edited?, approved?, skipped? }] }
// status: waiting (on the Dashboard), approved, skipped or replaced (a newer draft took its place).
import { join, dirname } from "node:path";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { CONFIG_DIR, sh, hasCmd, loadConfig } from "./core.mjs";
import { resolveProvider, write } from "./ai.mjs";
import { commits, discoveredRepos } from "./scan.mjs";
import { readTexts } from "./headless.mjs";

const PATHS = { posts: join(CONFIG_DIR, "posts.json"), log: join(CONFIG_DIR, "posts-log.jsonl"), voice: join(CONFIG_DIR, "voice.md") };
const PLATFORM = "linkedin";
// LinkedIn's share box, opened for you to paste an approved post into.
const SHARE_URL = "https://www.linkedin.com/feed/?shareActive=true";
const KINDS = ["shipped", "learned", "long"];
const KIND_LABEL = { shipped: "Shipped", learned: "Learned / fixed", long: "Longer post" };
const MAX_FACTS = 120, MAX_TEXT = 3000, KEEP = 200; // LinkedIn takes 3000 characters a post
const q = (s) => JSON.stringify(String(s));

const NO_AI = "Symbiot needs an AI to draft your posts, and none is connected. Connect one with  symbiot login  (or Settings in the app), then run  symbiot post  again. Nothing was drafted, saved or logged.";
const noVoice = (file) => `Symbiot drafts posts in your voice, from examples of your own posts, and has none yet. Either link LinkedIn (Dashboard → Links → LinkedIn, sign in once) and click Fill from LinkedIn (or run  symbiot post voice --linkedin), or paste 5–10 posts you wrote into ${file}, with a line of --- between each. Nothing was drafted.`;

// ---- your voice ------------------------------------------------------------------
// voice.md's examples: what's between lines of ---, each long enough to be a post.
// LinkedIn's page text puts a "hashtag" line (a label for screen readers) over each
// #tag; read into voice.md, the drafts copied it under every tag. Dropped wherever seen.
const noTagLabels = (t) => String(t || "").replace(/^[ \t]*hashtag[ \t]*\r?\n(?=[ \t]*#)/gim, "");
function voiceOf(text) { return noTagLabels(text).split(/^\s*-{3,}\s*$/m).map((s) => s.trim()).filter((s) => s.length >= 20); }
function loadVoice(file = PATHS.voice) { try { return voiceOf(readFileSync(file, "utf8")); } catch { return []; } }
function saveText(file, text) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text, { mode: 0o600 }); try { chmodSync(file, 0o600); } catch {} }

// Your recent posts on LinkedIn, read in Symbiot's signed-in hidden browser (Link
// LinkedIn first), added to voice.md. Only on your click or command: nothing here
// runs by itself. `read` is headless.mjs readTexts (the tests pass their own).
const LINKEDIN_ACTIVITY = "https://www.linkedin.com/in/me/recent-activity/shares/";
const LINKEDIN_POST_TEXT = ".update-components-text, .feed-shared-update-v2__description, .feed-shared-text";
const tidyPost = (t) => noTagLabels(t).replace(/\s*…\s*(see )?more\s*$/i, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
async function voiceFromLinkedIn({ read = readTexts, paths = PATHS, max = 10 } = {}) {
  const r = (await read(LINKEDIN_ACTIVITY, LINKEDIN_POST_TEXT)) || { error: "Nothing came back from LinkedIn." };
  if (r.busy) return { error: "Symbiot's browser is busy (a sign-in window, or a map). Close it, then try again." };
  if (r.login || /linkedin\.com\/(login|authwall|uas\/|checkpoint|signup)/i.test(r.url || "")) return { error: "You're not signed in to LinkedIn in Symbiot's browser. Link LinkedIn on the Dashboard (Links → LinkedIn), sign in in the window that opens, close it, then try again." };
  if (r.error) return { error: r.error };
  const found = []; for (const t of (r.texts || []).map(tidyPost)) if (t.length >= 40 && !found.includes(t)) found.push(t);
  if (!found.length) return { error: `Found no posts of yours on LinkedIn's activity page. Paste 5–10 of your posts into ${paths.voice} instead, with a line of --- between each.` };
  const had = loadVoice(paths.voice), add = found.filter((t) => !had.includes(t));
  const all = [...had, ...add].slice(0, Math.max(max, had.length));
  saveText(paths.voice, all.join("\n\n---\n\n") + "\n");
  return { ok: true, added: all.length - had.length, total: all.length, file: paths.voice };
}

// ---- the facts: what git shows for the week ---------------------------------------
// Release tags made in the window: [{ tag, date }].
function tagsIn(path, since) {
  return sh(`git -C ${q(path)} for-each-ref refs/tags --sort=-creatordate --count=12 --format='%(refname:short)|%(creatordate:short)' 2>/dev/null`)
    .split("\n").map((l) => l.split("|")).filter((x) => x[0] && x[1] && x[1] >= since).map(([tag, date]) => ({ tag, date }));
}
// gh's releases in the window, when gh is there and signed in: [{ tag, name, date }].
function ghReleasesIn(path, since) {
  if (!/github\.com/.test(sh(`git -C ${q(path)} remote get-url origin 2>/dev/null`))) return [];
  try { return JSON.parse(sh(`cd ${q(path)} && gh release list --limit 10 --json tagName,name,publishedAt 2>/dev/null`) || "[]").map((r) => ({ tag: r.tagName, name: r.name || "", date: String(r.publishedAt || "").slice(0, 10) })).filter((r) => r.tag && r.date >= since); } catch { return []; }
}
// CHANGELOG.md's sections whose heading has a date in the window, each bullet a
// line: [{ version, date, text }]. "## 0.46.1 — 2026-10-06" or "## [1.2.0] - 2026-10-01".
function changelogIn(path, since) {
  const file = ["CHANGELOG.md", "changelog.md", "CHANGES.md"].map((f) => join(path, f)).find((f) => existsSync(f)); if (!file) return [];
  let text = ""; try { text = readFileSync(file, "utf8"); } catch { return []; }
  const out = []; let cur = null;
  for (const line of text.split("\n")) {
    const h = line.match(/^##\s+(.*)$/); // a release; its ### Added / Fixed stay in it
    if (h) { const d = h[1].match(/\b(\d{4}-\d{2}-\d{2})\b/), v = h[1].match(/\bv?(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)\b/); cur = d && d[1] >= since ? { version: v ? v[1] : "", date: d[1] } : null; continue; }
    const b = cur && line.match(/^\s*[-*]\s+(.+)/);
    if (b) out.push({ ...cur, text: b[1].replace(/\*\*(.+?)\*\*/g, "$1").trim().slice(0, 400) });
  }
  return out;
}
// Everything the week shows, as facts: releases first, then the changelog, then
// commits (yours; everyone's if none are yours). [{ repo, date, kind, text }]
function gatherFacts({ days = 7, now = Date.now(), repos, gh } = {}) {
  const sinceIso = new Date(now - days * 86400000).toISOString(), since = sinceIso.slice(0, 10);
  const useGh = gh === undefined ? hasCmd("gh") : !!gh;
  const list = (repos || discoveredRepos()).filter((r) => r && r.path);
  const rel = [], log = [], seen = new Set();
  const add = (into, f) => { const k = `${f.repo}|${f.text}`.toLowerCase(); if (!seen.has(k)) { seen.add(k); into.push(f); } };
  const active = [];
  for (const r of list) {
    const tags = tagsIn(r.path, since), notes = changelogIn(r.path, since);
    const ghr = useGh && (tags.length || notes.length) ? ghReleasesIn(r.path, since) : [];
    for (const g of ghr) add(rel, { repo: r.name, date: g.date, kind: "release", text: `released ${g.tag}${g.name && g.name !== g.tag ? ` "${g.name}"` : ""}` });
    for (const t of tags) add(rel, { repo: r.name, date: t.date, kind: "release", text: `released ${t.tag}` });
    for (const n of notes) add(log, { repo: r.name, date: n.date, kind: "changelog", text: `${n.version ? n.version + ": " : ""}${n.text}` });
    if (sh(`git -C ${q(r.path)} log --since=${q(sinceIso)} --oneline -1 2>/dev/null`).trim()) active.push(r);
  }
  let cs = commits(active, sinceIso, true); if (!cs.length) cs = commits(active, sinceIso, false);
  const work = []; for (const c of cs) add(work, { repo: c.repo, date: c.date, kind: "commit", text: c.subject.slice(0, 300) });
  // a busy week's changelog can't crowd out the commits
  const top = [...rel.slice(0, 15), ...log.slice(0, 60)];
  return [...top, ...work.slice(0, MAX_FACTS - top.length)];
}
const factLine = (f, i) => `[${i + 1}] ${f.repo} · ${f.date} · ${f.kind}: ${f.text}`;

// ---- never invent: what a draft claims has to be in the facts -----------------------
// The numbers in a text ("0.46.1", "1,000", "40"), without a thread's "1/3" or a
// list's "2." markers; dates in the facts count by their parts too ("2026-10-06" → 10, 6).
function numbersIn(text) {
  const t = String(text || "").replace(/(^|\n)\s*\d+\s*(?:\/\s*\d*|[.)])[ \t]+/g, "$1").replace(/\(?\b\d+\s*\/\s*\d+\)?/g, " ");
  return (t.match(/\d+(?:[.,]\d+)*/g) || []).map((n) => (/^\d{1,3}(,\d{3})+$/.test(n) ? n.replace(/,/g, "") : n));
}
function numberSet(texts) {
  const s = new Set();
  for (const t of texts) {
    for (const n of String(t).match(/\d+(?:[.,]\d+)*/g) || []) { s.add(n); s.add(n.replace(/,/g, "")); for (const p of n.split(/[.,-]/)) { s.add(p); s.add(String(Number(p))); } }
    for (const d of String(t).match(/\d{4}-\d{2}-\d{2}/g) || []) for (const p of d.split("-")) { s.add(p); s.add(String(Number(p))); }
  }
  return s;
}
// Words that are capitalised in the middle of a sentence (or inside, like GitHub):
// names of products, people and companies. Starting a sentence, a line or a
// bullet doesn't count.
function namesIn(text) {
  const s = String(text || ""), out = [];
  for (const m of s.matchAll(/\p{L}[\p{L}\p{N}'’-]*/gu)) {
    const w = m[0].replace(/['’]s$/i, "").replace(/['’-]+$/, ""), before = s.slice(0, m.index);
    if (/#$/.test(before)) continue; // a hashtag is style, not a claim
    const start = !before.trim() || /[.!?:;]["'”’)\]]*\s*$/.test(before) || /(^|\n)[\s\p{P}\p{S}\p{Extended_Pictographic}\d]*$/u.test(before);
    if (w.length > 1 && ((/^\p{Lu}/u.test(w) && !start) || /\p{Lu}/u.test(w.slice(1)))) out.push(w);
  }
  return out;
}
// Ordinary words that are capitalised anyway.
const ALLOW = new Set(("i i'm i've i'd i'll ai cli ui ux api apis ok pr prs ci cd mvp dev devs json html css js npm git linkedin " +
  "monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december").split(" "));
// Claims no fact could back: numbers of users or downloads in words, testimonials, money.
const METRIC = /(?:\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|fifty|hundreds?|thousands?|millions?|dozens?|several|many|countless)|\d[\d,.]*\s*[kKm]?\+?)\s+(?:\w+\s+)?(?:users?|customers?|clients?|downloads?|installs?|stars?|sign-?ups?|companies|teams|subscribers?|followers?|developers|devs|people|businesses)\b/gi;
const PRAISE = /\b(?:customers?|users?|clients?|people|everyone)\s+(?:love|loved|loves|say|said|told|are saying|rave)\b|\b(?:revenue|MRR|ARR|paying customers?|sold out)\b/gi;
// What a draft says that the facts (or your own voice examples, for names) don't
// show: [token], [] when it all checks out. Numbers must be in the facts; names in
// the facts or your examples; `code` and file names in the facts.
function checkClaims(text, facts, voice = []) {
  const ft = facts.map((f) => (typeof f === "string" ? f : `${f.repo} ${f.date} ${f.text}`)), lower = ft.join("\n").toLowerCase(), mine = voice.join("\n").toLowerCase();
  const nums = numberSet(ft), bad = new Set();
  // a version or decimal is whole ("1.2" for 1.2.0, never "2.0"); a plain number may be a part of one, or a date's
  const dotted = [...nums].filter((x) => /\./.test(x)), known = (n) => (/\./.test(n) ? dotted.some((x) => x === n || x.startsWith(n + ".")) : nums.has(n) || nums.has(String(Number(n))));
  for (const n of numbersIn(text)) if (!known(n)) bad.add(n);
  for (const w of namesIn(text)) { const l = w.toLowerCase(); if (!ALLOW.has(l) && !lower.includes(l) && !mine.includes(l)) bad.add(w); }
  for (const m of String(text).matchAll(/`([^`]+)`/g)) if (!lower.includes(m[1].toLowerCase())) bad.add(m[1]);
  for (const m of String(text).matchAll(/\b[\w-]+\.(?:m?js|cjs|tsx?|md|json|py|go|rs|java|kt|sh|ya?ml|toml|css|html)\b/gi)) if (!lower.includes(m[0].toLowerCase())) bad.add(m[0]);
  for (const re of [METRIC, PRAISE]) for (const m of String(text).matchAll(re)) if (!lower.includes(m[0].toLowerCase())) bad.add(m[0]);
  return [...bad];
}

// ---- drafting ----------------------------------------------------------------------
function extractJson(s) {
  const t = String(s || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim(), a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}
// The AI's answer as drafts, by kind: [{ kind, text, facts: [n] }].
function parseDrafts(raw) {
  const j = extractJson(raw), list = j && Array.isArray(j.posts) ? j.posts : [];
  return list.map((p, i) => ({ kind: KINDS.includes(p && p.kind) ? p.kind : KINDS[i] || "", text: noTagLabels((p && p.text) || "").trim().slice(0, MAX_TEXT), facts: (Array.isArray(p && p.facts) ? p.facts : []).map(Number).filter(Number.isInteger) }))
    .filter((p) => p.kind && p.text);
}
// A draft checked against the facts: the facts it cites that exist, and what it
// claims that they don't show. ok when it cites one at least and claims nothing more.
function vetDraft(p, facts, voice = []) {
  const cited = [...new Set(p.facts)].filter((n) => n >= 1 && n <= facts.length);
  const unsupported = checkClaims(p.text, cited.length ? cited.map((n) => facts[n - 1]) : facts, voice);
  return { ...p, facts: cited, unsupported, ok: cited.length > 0 && !unsupported.length };
}
const SYSTEM = `You draft LinkedIn posts for a developer, from their real work this week, in their own voice. ` +
  `Write exactly 3 posts: "shipped" (what was built or released this week), "learned" (one problem they hit and how it was solved, as the facts show it), ` +
  `and "long" (a slightly deeper write-up of the best item: a longer post, or a short thread of 3 to 5 parts numbered 1/, 2/… with a blank line between). ` +
  `Write the way their example posts do (length, tone, emoji, hashtags, how they open and close), but take nothing from the examples as fact: they're old posts. ` +
  `Every claim must come from the numbered facts. Never invent anything: no numbers, versions, names, users, downloads, revenue, results or testimonials the facts don't show, ` +
  `and no counts ("12 commits"). Use versions and names exactly as the facts write them. Plain text, no markdown, no links unless a fact has one. Never say it was written by AI. ` +
  `Answer with JSON only: {"posts":[{"kind":"shipped","text":"…","facts":[1,4]},{"kind":"learned","text":"…","facts":[…]},{"kind":"long","text":"…","facts":[…]}]}, ` +
  `where "facts" lists the numbers of every fact the post uses.`;
// Draft this week's 3 posts and put them on the Dashboard (waiting on you). With
// no AI connected it says so and does nothing else: nothing is read, written or
// logged. `ask` is ai.mjs write (the tests pass their own); `repos`, `gh`, `now`
// and `paths` likewise. Gives { ok, posts, dropped, facts } or { error, code }.
async function draftPosts({ ask = write, now = Date.now(), days = 7, repos, gh, paths = PATHS } = {}) {
  if (ask === write && !resolveProvider()) return { error: NO_AI, code: "not-connected" };
  const voice = loadVoice(paths.voice);
  if (!voice.length) return { error: noVoice(paths.voice), code: "no-voice" };
  const facts = gatherFacts({ days, now, repos, gh });
  if (!facts.length) return { error: `Nothing in git in the last ${days} days (no commits, release tags or dated CHANGELOG.md sections) in the repos Symbiot scans, so there's nothing true to post about. Nothing was drafted.`, code: "no-facts" };
  const listed = facts.map(factLine).join("\n");
  const prompt = `Example posts of mine (my voice; not facts about this week):\n\n${voice.slice(0, 10).map((v, i) => `Example ${i + 1}:\n${v}`).join("\n\n")}\n\n` +
    `This week's facts (the only things you may claim), numbered:\n${listed}\n\nDraft the 3 posts.`;
  const said = async (sys, p) => { const raw = await ask(sys, p); return !raw || /^\(?couldn't reach the model/i.test(raw) ? null : raw; };
  const first = await said(SYSTEM, prompt);
  if (first == null) return { error: "Your AI didn't answer (or turned the request down). Nothing was drafted. Check it with  symbiot whoami,  then try again.", code: "no-answer" };
  const byKind = new Map(); for (const p of parseDrafts(first)) if (!byKind.has(p.kind)) byKind.set(p.kind, vetDraft(p, facts, voice));
  // once more for any that's missing or claims what git doesn't show, told what was wrong
  const wrong = KINDS.filter((k) => !byKind.get(k) || !byKind.get(k).ok);
  if (wrong.length) {
    const why = wrong.map((k) => { const d = byKind.get(k); return `- "${k}": ${!d ? "missing" : !d.facts.length ? "it cited no facts" : `it claims ${d.unsupported.map((x) => `"${x}"`).join(", ")}, which the facts don't show`}`; }).join("\n");
    const again = await said(SYSTEM, `${prompt}\n\nYour last answer had problems:\n${why}\n\nWrite only ${wrong.map((k) => `"${k}"`).join(", ")} again, in the same JSON shape, using only what the facts show.`);
    for (const p of again ? parseDrafts(again) : []) if (wrong.includes(p.kind)) { const v = vetDraft(p, facts, voice); if (v.ok || !byKind.get(p.kind)) byKind.set(p.kind, v); }
  }
  const good = KINDS.map((k) => byKind.get(k)).filter((d) => d && d.ok), dropped = KINDS.map((k) => byKind.get(k)).filter((d) => d && !d.ok);
  const logDropped = () => { for (const x of dropped) logAction("dropped", { id: "", kind: x.kind, text: x.text, platform: PLATFORM }, now, paths, { why: x.facts.length ? `claims ${x.unsupported.join(", ")}, which git doesn't show` : "cited no facts" }); };
  const droppedOut = dropped.map((x) => ({ kind: x.kind, unsupported: x.unsupported, cited: x.facts.length }));
  // none that git backs: the drafts already waiting stay
  if (!good.length) { logDropped(); return { error: "Your AI's drafts all claimed things git doesn't show (or cited nothing), so none was kept. Try again, or add to voice.md.", code: "all-dropped", dropped: droppedOut }; }
  const d = loadPosts(paths);
  for (const p of d.posts) if (p.status === "waiting") { p.status = "replaced"; p.replaced = now; logAction("replaced", p, now, paths); }
  const posts = good.map((g) => ({ id: randomBytes(4).toString("hex"), kind: g.kind, text: g.text, facts: g.facts, sources: g.facts.map((n) => factLine(facts[n - 1], n - 1)), platform: PLATFORM, status: "waiting", drafted: now }));
  d.posts = [...posts, ...d.posts].slice(0, KEEP);
  savePosts(d, paths);
  for (const p of posts) logAction("drafted", p, now, paths);
  logDropped();
  return { ok: true, posts, dropped: droppedOut, facts: facts.length, voice: voice.length };
}

// ---- the drafts, and what you do with them ------------------------------------------
function loadPosts(paths = PATHS) { try { const d = JSON.parse(readFileSync(paths.posts, "utf8")); return { posts: Array.isArray(d.posts) ? d.posts : [] }; } catch { return { posts: [] }; } }
function savePosts(d, paths = PATHS) { try { saveText(paths.posts, JSON.stringify(d, null, 2)); return true; } catch { return false; } }
// The log: one JSON line per action, only ever appended to. Yours only (0600).
function logAction(action, p, now = Date.now(), paths = PATHS, extra = {}) {
  try {
    mkdirSync(dirname(paths.log), { recursive: true });
    appendFileSync(paths.log, JSON.stringify({ ts: now, date: new Date(now).toISOString(), action, id: p.id, kind: p.kind, platform: p.platform || PLATFORM, text: p.text, ...extra }) + "\n", { mode: 0o600 });
    try { chmodSync(paths.log, 0o600); } catch {}
    return true;
  } catch { return false; }
}
function postLog(paths = PATHS) { try { return readFileSync(paths.log, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } }
// What the Dashboard shows: the drafts waiting on you, the last few you dealt with,
// and whether it can draft: an AI connected, and your voice (examples in voice.md,
// or LinkedIn linked to fill it from). Until then the Dashboard says so in a line.
function postsState(paths = PATHS, { linked = () => (loadConfig().linked || {}) } = {}) {
  const d = loadPosts(paths), voice = loadVoice(paths.voice).length, connected = !!resolveProvider();
  let linkedin = false; try { linkedin = !!linked().linkedin; } catch {}
  return { posts: d.posts.filter((p) => p.status === "waiting"), done: d.posts.filter((p) => p.status === "approved" || p.status === "skipped").slice(0, 5),
    voice: { count: voice, file: paths.voice }, connected, linkedin, canDraft: connected && (linkedin || voice > 0), share: SHARE_URL, labels: KIND_LABEL };
}
// One waiting draft, by id (or the start of one), and the store it's in.
function waiting(id, paths) {
  const d = loadPosts(paths), s = String(id || "").trim();
  const p = s && (d.posts.find((x) => x.id === s) || (s.length >= 3 && d.posts.filter((x) => x.id.startsWith(s)).length === 1 && d.posts.find((x) => x.id.startsWith(s))));
  if (!p) return { error: `No draft ${s || "(no id)"}. symbiot post list shows them.` };
  if (p.status !== "waiting") return { error: `That draft was ${p.status} already.` };
  return { d, p };
}
// Edit: your words replace the draft's; it stays waiting. What it names that git
// doesn't show is said (unsupported), not blocked: you're allowed to say it.
function editPost(id, text, { now = Date.now(), paths = PATHS } = {}) {
  text = String(text == null ? "" : text).trim();
  if (!text) return { error: "Give the post's new text." };
  if (text.length > MAX_TEXT) return { error: `LinkedIn takes ${MAX_TEXT} characters a post; that's ${text.length}.` };
  const w = waiting(id, paths); if (w.error) return w;
  w.p.text = text; w.p.edited = now; savePosts(w.d, paths); logAction("edited", w.p, now, paths);
  const unsupported = checkClaims(text, w.p.sources || [], loadVoice(paths.voice));
  return { ok: true, post: w.p, ...(unsupported.length ? { unsupported } : {}) };
}
function skipPost(id, { now = Date.now(), paths = PATHS } = {}) {
  const w = waiting(id, paths); if (w.error) return w;
  w.p.status = "skipped"; w.p.skipped = now; savePosts(w.d, paths); logAction("skipped", w.p, now, paths);
  return { ok: true, post: w.p };
}
// Approve: your yes to this one post. It's logged, then copied to your clipboard
// (`copy`: copyText in a terminal; the app's page copies it itself, so it passes
// null) for you to paste into LinkedIn's share box (`share`). Symbiot doesn't post
// or schedule it.
function approvePost(id, { copy = copyText, now = Date.now(), paths = PATHS } = {}) {
  const w = waiting(id, paths); if (w.error) return w;
  w.p.status = "approved"; w.p.approved = now; savePosts(w.d, paths); logAction("approved", w.p, now, paths);
  const copied = copy ? copy(w.p.text) : "";
  return { ok: true, post: w.p, copied, share: SHARE_URL, note: "Symbiot doesn't post or schedule it: paste it into LinkedIn's share box and post it yourself." };
}

// ---- clipboard, and opening the share box, from a terminal -----------------------
// The first clipboard tool that's here and takes it: its name, or "" when none did.
function copyText(text) {
  const tools = process.platform === "darwin" ? [["pbcopy", []]] : process.platform === "win32" ? [["clip", []]]
    : [...(process.env.WAYLAND_DISPLAY ? [["wl-copy", []]] : []), ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]];
  for (const [cmd, args] of tools) {
    if (!hasCmd(cmd)) continue;
    // only stdin piped: wl-copy and xclip stay behind to serve the clipboard, and must not hold our pipes
    const r = spawnSync(cmd, args, { input: String(text), stdio: ["pipe", "ignore", "ignore"], timeout: 4000 });
    if (r.status === 0) return cmd;
  }
  return "";
}
function openUrl(url) {
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try { spawn(cmd, args, { detached: true, stdio: "ignore" }).unref(); return true; } catch { return false; }
}

// ---- replies: who might be a customer ------------------------------------------------
// A comment or mention that asks how to install it, what it costs or about its
// licence, or about using it in a team: "maybe a customer" on the Dashboard.
// Gives why ("install", "pricing", "team") or "".
const CUSTOMER = [
  ["pricing", /\b(?:pric(?:e|es|ed|ing)|costs?|how much|licen[cs](?:e|es|ing)|subscriptions?|paid (?:plan|version|tier)|free tier|pay(?:ing)? for|per (?:seat|user|month))\b/i],
  ["install", /\b(?:install(?:ing|ed|ation)?|npm i|npx|download(?:ing)?)\b|\bhow (?:do|can|would|could) (?:i|we|you|one) (?:set (?:it |this )?up|get started|start|use|try|get|run)\b|\bwhere (?:can|do) (?:i|we) (?:get|find)\b/i],
  ["team", /\b(?:my|our|whole)\s+(?:dev\s+|engineering\s+)?(?:team|teams|company|org|organi[sz]ation|startup)\b|\bteam (?:use|plan|licen[cs]e|version|pricing)\b|\bfor (?:a |small )?teams\b|\b(?:enterprise|seats)\b/i],
];
function maybeCustomer(text) { const s = String(text || ""); const hit = CUSTOMER.find(([, re]) => re.test(s)); return hit ? hit[0] : ""; }

export { PATHS, PLATFORM, SHARE_URL, KINDS, KIND_LABEL, LINKEDIN_ACTIVITY, NO_AI, voiceOf, loadVoice, voiceFromLinkedIn, tagsIn, changelogIn, gatherFacts, factLine, numbersIn, namesIn, checkClaims, parseDrafts, vetDraft, draftPosts, loadPosts, postLog, postsState, editPost, skipPost, approvePost, copyText, openUrl, maybeCustomer };
