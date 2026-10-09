// symbiot — Post: your week's real work as three draft posts (LinkedIn), in your
// own voice, each waiting on you under Marketing: Approve, Edit or Skip.
//
// - What it writes from: the last 7 days of commits, the release tags (and gh's
//   releases, when gh works) and the CHANGELOG.md sections dated in that window,
//   in the repos Symbiot already scans. Each is a numbered fact; the AI must cite
//   the facts each post uses, and a post that names a number, a version or a name
//   the facts don't show is sent back once, then dropped (checkClaims).
// - Your voice: example posts of yours in voice.md (Symbiot's config folder), a
//   line of --- between each. Without them it doesn't draft. Link LinkedIn and it
//   can read your recent posts into voice.md for you, on your click.
// - Nothing is posted until you approve it, and then posting is the agent's job,
//   not yours: Approve hands the post to Marketing's agent, which posts it through
//   Symbiot's browser signed in to LinkedIn (LinkedIn has no posting route without
//   a partner app), with exactly the text you approved, and checks it's there.
// - Every action (drafted, edited, approved, skipped, dropped, replaced) is
//   appended to posts-log.jsonl, with the text, the date and the platform.
// - Pictures and videos: each draft says in a line what would show it best
//   (show), and can carry its own: a picture or video of yours, a picture of a
//   page, or a short clip of one (see "pictures and videos" below). One whose idea
//   is a screen of an app you run here arrives with its picture (a picture by itself).
//
// Stored in ~/.config/symbiot/posts.json, readable by you only:
// { posts: [{ id, kind, text, show, facts: [n], sources: [fact line], media: [{ id, kind, file, name, from, url?, bytes, added }], platform, status, drafted, edited?, approved?, skipped? }], lastUrl }
// status: waiting (under Marketing), approved, skipped or replaced (a newer draft took its place).
import { join, dirname } from "node:path";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, chmodSync, existsSync, readdirSync, rmSync, readlinkSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { connect } from "node:net";
import { CONFIG_DIR, sh, hasCmd, loadConfig } from "./core.mjs";
import { resolveProvider, write } from "./ai.mjs";
import { commits, discoveredRepos, laneMap } from "./scan.mjs";
import { readTexts, pagePicture, pageClip, siteUrl, CLIP } from "./headless.mjs";
import { runHandoff, runningHandoff } from "./agents.mjs";
import { MARKETING_DIR, ensureMarketing, setDraftStatus, productOf, productNames, draftStatuses, postedCmd, parseDraft, inLane } from "./marketing.mjs";

const PATHS = { posts: join(CONFIG_DIR, "posts.json"), log: join(CONFIG_DIR, "posts-log.jsonl"), voice: join(CONFIG_DIR, "voice.md"), media: join(CONFIG_DIR, "post-media"), test: join(CONFIG_DIR, "post-test.json") };
const PLATFORM = "linkedin";
// LinkedIn's share box, opened for you to paste an approved post into.
const SHARE_URL = "https://www.linkedin.com/feed/?shareActive=true";
const KINDS = ["shipped", "learned", "long"];
const KIND_LABEL = { shipped: "Shipped", learned: "Learned / fixed", long: "Longer post" };
const MAX_FACTS = 120, MAX_TEXT = 3000, KEEP = 200; // LinkedIn takes 3000 characters a post
const q = (s) => JSON.stringify(String(s));

const NO_AI = "Symbiot needs an AI to draft your posts, and none is connected. Connect one with  symbiot login  (or Settings in the app), then run  symbiot post  again. Nothing was drafted, saved or logged.";
const noVoice = (file) => `Symbiot drafts posts in your voice, from examples of your own posts, and has none yet. Either link LinkedIn (Marketing → Link LinkedIn, sign in once) and click Fill from LinkedIn (or run  symbiot post voice --linkedin), or paste 5–10 posts you wrote into ${file}, with a line of --- between each. Nothing was drafted.`;

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
  if (r.login || /linkedin\.com\/(login|authwall|uas\/|checkpoint|signup)/i.test(r.url || "")) return { error: "You're not signed in to LinkedIn in Symbiot's browser. Link LinkedIn (Marketing → Link LinkedIn, or Connections), sign in in the window that opens, close it, then try again." };
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
  return list.map((p, i) => ({ kind: KINDS.includes(p && p.kind) ? p.kind : KINDS[i] || "", text: noTagLabels((p && p.text) || "").trim().slice(0, MAX_TEXT), show: String((p && p.show) || "").replace(/\s+/g, " ").trim().slice(0, 200), facts: (Array.isArray(p && p.facts) ? p.facts : []).map(Number).filter(Number.isInteger) }))
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
  `Answer with JSON only: {"posts":[{"kind":"shipped","text":"…","show":"…","facts":[1,4]},{"kind":"learned","text":"…","show":"…","facts":[…]},{"kind":"long","text":"…","show":"…","facts":[…]}]}, ` +
  `where "facts" lists the numbers of every fact the post uses, and "show" is one short line (not posted) saying what picture or short video would show it best, ` +
  `for them to take: the screen, page or command the post is about, as the facts name it (e.g. "a picture of the new Reports view", "a clip of the install running").`;
// Draft this week's 3 posts and put them under Marketing (waiting on you). With
// no AI connected it says so and does nothing else: nothing is read, written or
// logged. `ask` is ai.mjs write (the tests pass their own); `repos`, `gh`, `now`
// and `paths` likewise. Gives { ok, posts, dropped, facts } or { error, code }.
async function draftPosts({ ask = write, now = Date.now(), days = 7, repos, gh, paths = PATHS, apps = localApps, shoot = pagePicture } = {}) {
  if (ask === write && !resolveProvider()) return { error: NO_AI, code: "not-connected" };
  const voice = loadVoice(paths.voice);
  if (!voice.length) return { error: noVoice(paths.voice), code: "no-voice" };
  const list = (repos || discoveredRepos()).filter((r) => r && r.path);
  const facts = gatherFacts({ days, now, repos: list, gh });
  if (!facts.length) return { error: `Nothing in git in the last ${days} days (no commits, release tags or dated CHANGELOG.md sections) in the repos Symbiot scans, so there's nothing true to post about. Nothing was drafted.`, code: "no-facts" };
  const listed = facts.map(factLine).join("\n");
  const prompt = `Example posts of mine (my voice; not facts about this week):\n\n${voice.slice(0, 10).map((v, i) => `Example ${i + 1}:\n${v}`).join("\n\n")}\n\n` +
    `This week's facts (the only things you may claim), numbered:\n${listed}\n\nDraft the 3 posts.`;
  const said = async (sys, p) => { const raw = await ask(sys, p); return !raw || /^\(?couldn't reach the model/i.test(raw) ? null : raw; };
  // One try: the 3 drafts, then once more for any that's missing or claims what git
  // doesn't show, told what was wrong. null when the AI didn't answer.
  const attempt = async () => {
    const first = await said(SYSTEM, prompt); if (first == null) return null;
    const byKind = new Map(); for (const p of parseDrafts(first)) if (!byKind.has(p.kind)) byKind.set(p.kind, vetDraft(p, facts, voice));
    const wrong = KINDS.filter((k) => !byKind.get(k) || !byKind.get(k).ok);
    if (wrong.length) {
      const why = wrong.map((k) => { const d = byKind.get(k); return `- "${k}": ${!d ? "missing" : !d.facts.length ? "it cited no facts" : `it claims ${d.unsupported.map((x) => `"${x}"`).join(", ")}, which the facts don't show`}`; }).join("\n");
      const again = await said(SYSTEM, `${prompt}\n\nYour last answer had problems:\n${why}\n\nWrite only ${wrong.map((k) => `"${k}"`).join(", ")} again, in the same JSON shape, using only what the facts show.`);
      for (const p of again ? parseDrafts(again) : []) if (wrong.includes(p.kind)) { const v = vetDraft(p, facts, voice); if (v.ok || !byKind.get(p.kind)) byKind.set(p.kind, v); }
    }
    return KINDS.map((k) => byKind.get(k)).filter(Boolean);
  };
  const logDropped = (ds) => { for (const x of ds.filter((y) => !y.ok)) logAction("dropped", { id: "", kind: x.kind, text: x.text, platform: PLATFORM }, now, paths, { why: x.facts.length ? `claims ${x.unsupported.join(", ")}, which git doesn't show` : "cited no facts" }); };
  let drafts = await attempt(), retried = false;
  if (drafts == null) return { error: "Your AI didn't answer (or turned the request down). Nothing was drafted. Check it with  symbiot whoami,  then try again.", code: "no-answer" };
  // every one dropped: a fresh try by itself before giving up (week 1's first try
  // kept none of 3; the second, the same request again, kept all 3)
  if (!drafts.some((x) => x.ok)) {
    logDropped(drafts); retried = true;
    const again = await attempt(); if (again && again.length) drafts = again; else drafts = drafts.map((x) => ({ ...x, logged: true }));
  }
  const good = drafts.filter((x) => x.ok), dropped = drafts.filter((x) => !x.ok);
  const droppedOut = dropped.map((x) => ({ kind: x.kind, unsupported: x.unsupported, cited: x.facts.length }));
  // none that git backs, twice: the drafts already waiting stay
  if (!good.length) { logDropped(dropped.filter((x) => !x.logged)); return { error: "Your AI's drafts all claimed things git doesn't show (or cited nothing), twice, so none was kept. Try again, or add to voice.md.", code: "all-dropped", dropped: droppedOut, retried }; }
  const d = loadPosts(paths);
  for (const p of d.posts) if (p.status === "waiting") { p.status = "replaced"; p.replaced = now; logAction("replaced", p, now, paths); }
  const posts = good.map((g) => ({ id: randomBytes(4).toString("hex"), kind: g.kind, text: g.text, show: g.show, facts: g.facts, sources: g.facts.map((n) => factLine(facts[n - 1], n - 1)), media: [], platform: PLATFORM, status: "waiting", drafted: now }));
  d.posts = [...posts, ...d.posts].slice(0, KEEP);
  savePosts(d, paths); pruneMedia(d, paths);
  for (const p of posts) logAction("drafted", p, now, paths);
  logDropped(dropped);
  let pictures = 0; try { pictures = await picturesFor(posts, facts, { apps: await apps(list), shoot, now, paths }); } catch {}
  return { ok: true, posts, dropped: droppedOut, facts: facts.length, voice: voice.length, ...(retried ? { retried: true } : {}), ...(pictures ? { pictures } : {}) };
}

// ---- the drafts, and what you do with them ------------------------------------------
function loadPosts(paths = PATHS) { try { const d = JSON.parse(readFileSync(paths.posts, "utf8")); return { posts: Array.isArray(d.posts) ? d.posts : [], lastUrl: typeof d.lastUrl === "string" ? d.lastUrl : "" }; } catch { return { posts: [], lastUrl: "" }; } }
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
// What Marketing shows: the drafts waiting on you, the last few you dealt with,
// and whether it can draft: an AI connected, and your voice (examples in voice.md,
// or LinkedIn linked to fill it from). Until then Marketing says so in a line, and
// Home shows no Marketing orb (home.mjs).
function postsState(paths = PATHS, { linked = () => (loadConfig().linked || {}) } = {}) {
  const d = loadPosts(paths), voice = loadVoice(paths.voice).length, connected = !!resolveProvider();
  let linkedin = false; try { linkedin = !!linked().linkedin; } catch {}
  return { posts: d.posts.filter((p) => p.status === "waiting"), done: d.posts.filter((p) => p.status === "approved" || p.status === "skipped").slice(0, 5),
    voice: { count: voice, file: paths.voice }, connected, linkedin, canDraft: connected && (linkedin || voice > 0), share: SHARE_URL, labels: KIND_LABEL,
    lastUrl: d.lastUrl, canClip: canClip(), clip: CLIP };
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
// Approve: your yes to this one post, and your only step in it. It's logged, then
// handed to Marketing's agent (handToMarketing), which posts it through Symbiot's
// browser signed in to LinkedIn, pictures or video and all. Nothing for you to
// copy, paste or attach (that made posting your job: the last place that still did).
function approvePost(id, { hand = handToMarketing, now = Date.now(), paths = PATHS } = {}) {
  const w = waiting(id, paths); if (w.error) return w;
  w.p.status = "approved"; w.p.approved = now; savePosts(w.d, paths); logAction("approved", w.p, now, paths, mediaNote(w.p));
  const h = hand(w.p, { now, paths }) || { error: "Marketing's agent wasn't given it." };
  return { ok: true, post: w.p, handed: h, note: h.error ? `Approved, but it didn't reach Marketing's agent: ${h.error}` : h.said };
}
// The post, into Marketing's lane as an approved draft (drafts/<product>/post-<id>.md,
// the text under ## Post, unchanged, its pictures or video copied next to it, approved
// by its text as the Marketing page approves one), and its agent told in ANSWERS.md to
// post it, then started: now, or once the run there finishes. { rel, said, job?, queued? } or { error }.
function handToMarketing(p, { now = Date.now(), paths = PATHS, dir = MARKETING_DIR, run = runHandoff, running = runningHandoff, names } = {}) {
  if (!ensureMarketing(dir)) return { error: "Couldn't make Marketing's folder." };
  if (!names) { try { names = productNames(laneMap()); } catch { names = []; } }
  const product = productOf(p.text, names), folder = (product.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "linkedin"), rel = `drafts/${folder}/post-${p.id}.md`;
  // posted already (its agent marked it): never written over and handed out a second time
  const was = draftStatuses(dir)[rel]; if (was && (was.status === "posted" || was.posted)) return { error: `It's posted already (${rel}): it isn't posted twice.` };
  const media = [];
  try {
    mkdirSync(join(dir, "drafts", folder), { recursive: true });
    for (const m of p.media || []) { const name = `post-${p.id}-${m.file}`; writeFileSync(join(dir, "drafts", folder, name), readFileSync(join(mediaDir(p.id, paths), m.file))); media.push(name); }
    writeFileSync(join(dir, rel), `# ${KIND_LABEL[p.kind] || "Post"}: approved under Drafts to post\n${product ? `product: ${product}\n` : ""}platform: ${PLATFORM}\n${media.length ? `media: ${media.join(", ")}\n` : ""}\n## Post\n${p.text}\n\n## Notes\nDrafted by Symbiot from the week's git and approved by the user on ${new Date(now).toISOString().slice(0, 10)}.${(p.sources || []).length ? `\nFrom git:\n${p.sources.map((x) => "- " + x).join("\n")}` : ""}\n`);
  } catch (e) { return { error: "Couldn't write it into Marketing's folder: " + ((e && e.message) || e) }; }
  const st = setDraftStatus(rel, "approved", { dir, now }); if (st.error) return st;
  try {
    const f = join(dir, ".symbiot", "ANSWERS.md"), had = existsSync(f) ? readFileSync(f, "utf8") : "# Answers\n";
    writeFileSync(f, `${had.replace(/\s*$/, "")}\n\n### Approved: ${rel}\nThe user approved this post under Drafts to post. Post it on LinkedIn now, through Symbiot's signed-in browser, with exactly the text under its post (${p.text.length} characters, unchanged)${media.length ? ` and ${media.join(", ")} attached` : ""}. Then check it's there, mark it posted (\`${postedCmd(rel)}\`), and say so in your last message.\n_answered ${new Date(now).toISOString().slice(0, 10)}_\n`);
  } catch (e) { return { error: "Couldn't tell Marketing's agent: " + ((e && e.message) || e) }; }
  if (running(dir)) return { rel, queued: true, said: "Approved. Marketing's agent posts it on LinkedIn once the run there now finishes." };
  const e = run(dir, { force: true });
  return e && e.id && !e.blocked && !e.busy ? { rel, job: e.id, said: "Approved. Marketing's agent is posting it on LinkedIn now, through Symbiot's signed-in browser." }
    : { rel, queued: true, said: `Approved. ${(e && e.note) || "Marketing's agent posts it once it starts: pick your coding agent in Settings → Handoff if it doesn't."}` };
}

// ---- pictures and videos -----------------------------------------------------------
// A post on LinkedIn takes one video, or up to 20 pictures, not both. A draft can
// carry its own: a picture or video of yours, a picture of a page (the hidden
// browser, at twice the pixels), or a short clip of one (recorded there, scrolling
// slowly down, and made an MP4 by ffmpeg). Each is a copy, kept yours only in
// post-media/<post id>/ in Symbiot's config folder. Symbiot attaches nothing:
// Approve hands them to Marketing's agent with the post, to attach in LinkedIn's
// share box through Symbiot's signed-in browser.
const MEDIA = { png: ["picture", "image/png"], jpg: ["picture", "image/jpeg"], gif: ["picture", "image/gif"], mp4: ["video", "video/mp4"], mov: ["video", "video/quicktime"], webm: ["video", "video/webm"] };
const MAX_PICTURES = 20, MAX_BYTES = { picture: 20 * 1024 * 1024, video: 500 * 1024 * 1024 };
const NOT_MEDIA = "That isn't a picture or video LinkedIn takes: a PNG, JPG or GIF picture, or an MP4, MOV or WebM video.";
// What a file is, by its first bytes (not its name): a key of MEDIA, or "".
function mediaType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return "";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  const box = buf.subarray(4, 8).toString("latin1");
  if (box === "ftyp") return buf.subarray(8, 10).toString("latin1") === "qt" ? "mov" : "mp4";
  if (["moov", "mdat", "wide"].includes(box)) return "mov";
  if (buf.readUInt32BE(0) === 0x1a45dfa3) return "webm";
  return "";
}
const mediaDir = (postId, paths = PATHS) => join(paths.media, String(postId).replace(/[^\w-]/g, ""));
// "2 pictures", "its video": what a post carries, in words ("" for nothing)
function mediaWords(media = []) {
  const v = media.filter((m) => m.kind === "video").length, n = media.length - v;
  return v ? "video" : n ? (n === 1 ? "picture" : `${n} pictures`) : "";
}
const mediaNote = (p) => ((p.media || []).length ? { media: (p.media || []).map((m) => ({ kind: m.kind, from: m.from, file: m.file, ...(m.url ? { url: m.url } : {}) })) } : {});
// Add a picture or video (a Buffer, or base64) to a waiting draft. `from`: yours, page or clip.
function addMedia(id, data, { name = "", from = "yours", url = "", now = Date.now(), paths = PATHS } = {}) {
  const w = waiting(id, paths); if (w.error) return w;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data || ""), "base64"), ext = mediaType(buf);
  if (!ext) return { error: NOT_MEDIA };
  const kind = MEDIA[ext][0], have = w.p.media || [];
  if (buf.length > MAX_BYTES[kind]) return { error: `That ${kind} is ${Math.round(buf.length / 1048576)} MB: Symbiot keeps ${kind === "video" ? "videos" : "pictures"} up to ${MAX_BYTES[kind] / 1048576} MB.` };
  if (kind === "video" && have.length) return { error: have.some((m) => m.kind === "video") ? "LinkedIn takes one video a post: remove this one's first." : "LinkedIn takes pictures or a video in a post, not both: remove the pictures first." };
  if (kind === "picture" && have.some((m) => m.kind === "video")) return { error: "LinkedIn takes pictures or a video in a post, not both: remove the video first." };
  if (have.length >= MAX_PICTURES) return { error: `LinkedIn takes up to ${MAX_PICTURES} pictures a post.` };
  const mid = randomBytes(4).toString("hex");
  const m = { id: mid, kind, file: `${mid}.${ext}`, name: String(name || "").replace(/\s+/g, " ").trim().slice(0, 120), from, ...(url ? { url: String(url).slice(0, 500) } : {}), bytes: buf.length, added: now };
  try { mkdirSync(mediaDir(w.p.id, paths), { recursive: true, mode: 0o700 }); saveText(join(mediaDir(w.p.id, paths), m.file), buf); } catch (e) { return { error: `Couldn't keep it: ${e.message}` }; }
  w.p.media = [...have, m]; savePosts(w.d, paths); logAction("media", w.p, now, paths, { added: { kind, from, file: m.file, ...(m.url ? { url: m.url } : {}) } });
  return { ok: true, post: w.p, media: m };
}
function removeMedia(id, mediaId, { now = Date.now(), paths = PATHS } = {}) {
  const w = waiting(id, paths); if (w.error) return w;
  const m = (w.p.media || []).find((x) => x.id === mediaId); if (!m) return { error: "That picture or video isn't on this draft." };
  try { rmSync(join(mediaDir(w.p.id, paths), m.file), { force: true }); } catch {}
  w.p.media = w.p.media.filter((x) => x !== m); savePosts(w.d, paths); logAction("media", w.p, now, paths, { removed: { kind: m.kind, file: m.file } });
  return { ok: true, post: w.p };
}
// A draft's picture or video, for the app to show: { file, type }, or null.
function mediaFile(postId, mediaId, paths = PATHS) {
  const p = loadPosts(paths).posts.find((x) => x.id === postId), m = p && (p.media || []).find((x) => x.id === mediaId);
  const file = m && join(mediaDir(p.id, paths), m.file);
  return file && existsSync(file) ? { file, type: (MEDIA[m.file.split(".").pop()] || [])[1] || "application/octet-stream" } : null;
}
// The folders of drafts no longer kept (posts.json keeps the last KEEP), and a clip's leftovers, go.
function pruneMedia(d, paths = PATHS) {
  const ids = new Set(d.posts.map((p) => p.id));
  let dirs = []; try { dirs = readdirSync(paths.media); } catch { return; }
  for (const x of dirs) if (!ids.has(x)) try { rmSync(join(paths.media, x), { recursive: true, force: true }); } catch {}
}
// The page you gave, kept as the next one's default.
function rememberUrl(url, paths) { const d = loadPosts(paths); d.lastUrl = url; savePosts(d, paths); }
// A picture of a page (headless.mjs pagePicture), added to a waiting draft. Only on your click.
async function pictureOfPage(id, input, { shoot = pagePicture, now = Date.now(), paths = PATHS } = {}) {
  const w = waiting(id, paths); if (w.error) return w;
  const url = siteUrl(input); if (!url) return { error: "Give a page: a web address (localhost:3000 works), a host (github.com/you) or a site's name." };
  rememberUrl(String(input).trim(), paths);
  const r = (await shoot(url)) || { error: "Nothing came back from the page." };
  if (r.error) return { error: r.error };
  return addMedia(id, r.png, { name: r.title || url, from: "page", url: r.url || url, now, paths });
}
// A clip of a page: recorded (headless.mjs pageClip), made an MP4 (`encode`), added. Needs ffmpeg.
let FFMPEG = null;
const canClip = () => (FFMPEG === null ? (FFMPEG = hasCmd("ffmpeg")) : FFMPEG);
const NO_FFMPEG = "Recording a clip needs ffmpeg, which isn't installed (on Linux: sudo apt install ffmpeg; on a Mac: brew install ffmpeg). Or add a video of yours.";
async function clipOfPage(id, input, { seconds = 8, record = pageClip, encode = toVideo, now = Date.now(), paths = PATHS } = {}) {
  const w = waiting(id, paths); if (w.error) return w;
  if (encode === toVideo && !canClip()) return { error: NO_FFMPEG };
  if ((w.p.media || []).length) return { error: (w.p.media || []).some((m) => m.kind === "video") ? "LinkedIn takes one video a post: remove this one's first." : "LinkedIn takes pictures or a video in a post, not both: remove the pictures first." };
  const url = siteUrl(input); if (!url) return { error: "Give a page: a web address (localhost:3000 works), a host (github.com/you) or a site's name." };
  rememberUrl(String(input).trim(), paths);
  const r = (await record(url, seconds)) || { error: "Nothing came back from the page." };
  if (r.error) return { error: r.error };
  const v = encode(r.frames, r.end, paths);
  if (v.error) return { error: v.error };
  return addMedia(id, v.mp4, { name: r.title || url, from: "clip", url: r.url || url, now, paths });
}
// ffmpeg's concat list for frames that each show until the next one (the last
// until `end`), times in seconds: so a page that sat still stays still that long.
function concatList(frames, end) {
  const name = (i) => `f${String(i).padStart(5, "0")}.jpg`, out = ["ffconcat version 1.0"];
  frames.forEach((f, i) => out.push(`file ${name(i)}`, `duration ${Math.max(0.001, (i + 1 < frames.length ? frames[i + 1].ts : end) - f.ts).toFixed(3)}`));
  if (frames.length) out.push(`file ${name(frames.length - 1)}`); // ffmpeg keeps the last one's duration only when it's listed again
  return out.join("\n") + "\n";
}
const FFMPEG_ARGS = ["-y", "-loglevel", "error", "-f", "concat", "-i", "list.ffconcat", "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", "-an", "clip.mp4"];
// The frames as an MP4 that plays anywhere (H.264, yuv420p): { mp4 } or { error }.
function toVideo(frames, end, paths = PATHS) {
  const dir = join(paths.media, `.clip-${randomBytes(4).toString("hex")}`);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    frames.forEach((f, i) => writeFileSync(join(dir, `f${String(i).padStart(5, "0")}.jpg`), f.jpeg));
    writeFileSync(join(dir, "list.ffconcat"), concatList(frames, end));
    const r = spawnSync("ffmpeg", FFMPEG_ARGS, { cwd: dir, encoding: "utf8", timeout: 180000 });
    if (r.error || r.status !== 0) return { error: `ffmpeg couldn't make the video: ${String((r.error && r.error.message) || r.stderr || "").trim().split("\n").pop() || "it stopped"}` };
    return { mp4: readFileSync(join(dir, "clip.mp4")) };
  } catch (e) { return { error: `Couldn't make the video: ${e.message}` }; }
  finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

// ---- a picture by itself ---------------------------------------------------------------
// A draft whose picture idea (show) names a screen of an app you run here arrives
// with a picture of it, taken in the hidden browser as it's drafted: keep it or
// remove it (it saves that step most weeks). The apps (localApps): each one
// listening on localhost, as the repo it was started in (its process's folder),
// and Symbiot's own app, open, as the symbiot repo: its screens by name (the Reports
// view → #reports). Only a draft about that repo, whose idea is a picture of a
// screen (not a clip, not a command), and nothing on failure: the idea stays.
const SCREEN_WORD = /\b(screens?|pages?|views?|dashboards?|tabs?|panels?|panes?|home ?page|ui|app|window|cards?|blobs?|map)\b/i;
const NOT_A_PICTURE = /\b(clip|video|recording|gif|terminal|command|cli|commit|diff|code|log|chart|graph)\b/i;
const SYMBIOT_SCREENS = [["reports", /\breports?\b/i], ["board", /\bdashboard\b/i], ["map", /\bmap\b/i], ["agents", /\bagents?\b/i], ["tasks", /\btasks?\b/i], ["week", /\bweek(ly)?\b/i], ["standup", /\bstand-?up\b/i], ["todo", /\bto-?do\b/i], ["drift", /\bdrift\b/i], ["settings", /\bsettings\b/i]];
const isSymbiot = (path) => { try { return JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name === "symbiot"; } catch { return false; } };
// What's listening on localhost: [{ port, pid }]. ss on Linux, else lsof.
function listening() {
  const out = [], local = /^(127\.0\.0\.1|0\.0\.0\.0|\*|\[::1?\]|::1?|localhost)$/;
  if (hasCmd("ss")) {
    for (const l of sh("ss -ltnpH 2>/dev/null").split("\n")) {
      const f = l.trim().split(/\s+/), addr = f[3] || "", at = addr.lastIndexOf(":"), pid = (l.match(/pid=(\d+)/) || [])[1];
      if (at > 0 && pid && local.test(addr.slice(0, at))) out.push({ port: Number(addr.slice(at + 1)), pid: Number(pid) });
    }
  } else if (hasCmd("lsof")) {
    let pid = 0; for (const l of sh("lsof -nP -iTCP -sTCP:LISTEN -Fpn 2>/dev/null").split("\n")) {
      if (l[0] === "p") pid = Number(l.slice(1));
      else if (l[0] === "n") { const at = l.lastIndexOf(":"); if (at > 1 && local.test(l.slice(1, at))) out.push({ port: Number(l.slice(at + 1)), pid }); }
    }
  }
  return out.filter((x) => x.port > 0 && x.pid > 0);
}
function cwdOf(pid) {
  try { return readlinkSync(`/proc/${pid}/cwd`); } catch {}
  return (sh(`lsof -a -p ${Number(pid)} -d cwd -Fn 2>/dev/null`).split("\n").find((l) => l[0] === "n") || "").slice(1);
}
// The apps running here, by repo: [{ repo, url, symbiot? }]; url carries no token.
async function localApps(repos = [], { ports = listening, cwd = cwdOf, app = symbiotApp } = {}) {
  const out = [];
  for (const r of repos) {
    if (isSymbiot(r.path)) { const a = await app(); if (a) out.push({ repo: r.name, url: a.url, open: a.open, symbiot: true }); continue; }
    const hit = ports().filter((x) => { const d = cwd(x.pid); return d && (d === r.path || d.startsWith(r.path + "/")); }).sort((a, b) => a.port - b.port)[0];
    if (hit) out.push({ repo: r.name, url: `http://localhost:${hit.port}/` });
  }
  return out;
}
// Symbiot's own app, if it's open: { url, open } (open has its token, to load it).
// Whether it's listening, by a local connection: post.mjs never sends anything out.
async function symbiotApp() {
  const cfg = loadConfig(), port = Number(process.env.SYMBIOT_PORT || cfg.appPort) || 7391; if (!cfg.appToken) return null;
  const up = await new Promise((res) => { const c = connect({ host: "127.0.0.1", port }); const done = (v) => { c.destroy(); res(v); }; c.setTimeout(800, () => done(false)); c.on("connect", () => done(true)); c.on("error", () => done(false)); });
  return up ? { url: `http://127.0.0.1:${port}/`, open: `http://127.0.0.1:${port}/?t=${encodeURIComponent(cfg.appToken)}` } : null;
}
// The page a draft's idea names, in an app of its repo's: { url, open } or null.
function screenFor(post, apps, facts) {
  const show = String(post.show || ""); if (!show || NOT_A_PICTURE.test(show) || !SCREEN_WORD.test(show)) return null;
  const repos = new Set((post.facts || []).map((n) => facts[n - 1] && facts[n - 1].repo).filter(Boolean));
  const a = apps.find((x) => repos.has(x.repo)); if (!a) return null;
  if (!a.symbiot) { const path = (show.match(/(?:^|\s)(\/[\w./-]*[\w/])/) || [])[1] || ""; return { url: a.url.replace(/\/$/, "") + (path || "/"), open: a.url.replace(/\/$/, "") + (path || "/") }; }
  const s = (SYMBIOT_SCREENS.find(([, re]) => re.test(show)) || [])[0];
  return { url: a.url + (s ? "#" + s : ""), open: a.open + (s ? "#" + s : "") };
}
// Take each one's picture (one at a time: the hidden browser is one). How many came.
async function picturesFor(posts, facts, { apps = [], shoot = pagePicture, now = Date.now(), paths = PATHS } = {}) {
  let n = 0;
  for (const p of posts) {
    const at = screenFor(p, apps, facts); if (!at) continue;
    const r = await shoot(at.open).catch(() => null);
    if (!r || r.error || !r.png) continue;
    const m = addMedia(p.id, r.png, { name: r.title || at.url, from: "page", url: at.url, now, paths });
    if (m.ok) { p.media = m.post.media; n++; }
  }
  return n;
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
// licence, or about using it in a team: "maybe a customer" under Marketing and on the Dashboard.
// Gives why ("install", "pricing", "team") or "".
const CUSTOMER = [
  ["pricing", /\b(?:pric(?:e|es|ed|ing)|costs?|how much|licen[cs](?:e|es|ing)|subscriptions?|paid (?:plan|version|tier)|free tier|pay(?:ing)? for|per (?:seat|user|month))\b/i],
  ["install", /\b(?:install(?:ing|ed|ation)?|npm i|npx|download(?:ing)?)\b|\bhow (?:do|can|would|could) (?:i|we|you|one) (?:set (?:it |this )?up|get started|start|use|try|get|run)\b|\bwhere (?:can|do) (?:i|we) (?:get|find)\b/i],
  ["team", /\b(?:my|our|whole)\s+(?:dev\s+|engineering\s+)?(?:team|teams|company|org|organi[sz]ation|startup)\b|\bteam (?:use|plan|licen[cs]e|version|pricing)\b|\bfor (?:a |small )?teams\b|\b(?:enterprise|seats)\b/i],
];
// ---- the 4-week test: a row a week (Marketing) -------------------------------------
// Does posting bring anyone? Four weeks, a row each. Weeks run from the day of your
// first draft; week 1 is the first of them a post went out in (until one has, the one
// you're in: a week with nothing posted doesn't count), or the day post-test.json's
// start names, when you've moved it ({ "start": "2026-10-13" }). Each row: posts published, and how many
// carried a picture or video (approved under Drafts to post, or gone out through Marketing:
// laneOut); replies on LinkedIn (its watched notifications, marked
// by watch.mjs markNews: comments, replies, mentions and messages, not reactions or a
// badge's bare count), the ones that may be a customer and those asking what it
// costs; and npm installs of the packages your posts are about. Profile visits are
// only in LinkedIn's own analytics. null before there's a first draft.
const TEST_WEEKS = 4;
const isReply = (n) => !!n.social && (n.li === "message" || ["comment", "reply", "mention"].includes(n.type) || !!n.customer);
const dayStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
const ymd = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// What went out through Marketing's lane: drafts its agent marked posted (when they went
// out), or approved for a time in the platform's scheduler that has come. Not one handed
// over from Drafts to post (post-<id>.md): the log has that one, from its approve. [{ ts, media }]
function laneOut(dir = MARKETING_DIR, now = Date.now()) {
  const out = [];
  for (const [rel, s] of Object.entries(draftStatuses(dir))) {
    if (!s || /(^|\/)post-[0-9a-f]{8}\.md$/i.test(rel)) continue;
    const ts = Number(s.posted) || (s.status === "approved" && s.scheduled ? Date.parse(String(s.scheduled).replace(" ", "T")) : NaN);
    if (!Number.isFinite(ts) || ts > now) continue;
    let media = 0; try { media = parseDraft(readFileSync(inLane(dir, rel), "utf8")).media.length; } catch {} // its file gone: still out
    out.push({ ts, media });
  }
  return out;
}
function testPlan(paths = PATHS, now = Date.now(), lane = []) {
  const posts = loadPosts(paths).posts;
  let set = NaN; try { set = Date.parse(String(JSON.parse(readFileSync(paths.test, "utf8")).start || "").slice(0, 10) + "T00:00:00"); } catch {}
  const first = Math.min(posts.reduce((m, p) => Math.min(m, Number(p.drafted) || Infinity), Infinity), ...lane.map((l) => l.ts));
  if (!set && first === Infinity) return null;
  let start = set ? dayStart(set) : dayStart(first);
  if (!set) { const out = [...postLog(paths).filter((l) => l.action === "approved").map((l) => Number(l.ts)), ...lane.map((l) => l.ts)].sort((a, b) => a - b)[0], to = out || now; while (addDays(start, 7) <= to) start = addDays(start, 7); }
  return { start, weeks: Array.from({ length: TEST_WEEKS }, (_, i) => [addDays(start, 7 * i), addDays(start, 7 * (i + 1))]), posts };
}
// The npm packages your posts are about: the repos their git facts came from
// ("[21] symbiot · 2026-10-06 · changelog: …"), each one's package.json name unless private.
function testPackages(posts, map = {}) {
  const repos = new Set(posts.flatMap((p) => (Array.isArray(p.sources) ? p.sources : []).map((x) => (String(x).match(/^(?:\[\d+\]\s*)?(.+?)\s+·\s/) || [])[1]).filter(Boolean)));
  const out = [];
  for (const r of repos) { if (!map[r]) continue; try { const j = JSON.parse(readFileSync(join(map[r], "package.json"), "utf8")); if (j.name && !j.private && !out.includes(j.name)) out.push(j.name); } catch {} }
  return out.slice(0, 3);
}
function testWeeks({ paths = PATHS, now = Date.now(), news = [], installs = null, map = {}, dir = MARKETING_DIR } = {}) {
  const lane = laneOut(dir, now), plan = testPlan(paths, now, lane); if (!plan) return null;
  const out = [...postLog(paths).filter((l) => l.action === "approved").map((l) => ({ ts: Number(l.ts), media: (l.media || []).length })), ...lane];
  const rows = plan.weeks.map(([from, to], i) => {
    const inW = (t) => Number(t) >= from && Number(t) < to, pub = out.filter((o) => inW(o.ts)), rep = news.filter((n) => isReply(n) && inW(n.ts));
    return { week: i + 1, from: ymd(from), to: ymd(addDays(to, -1)), started: now >= from, over: now >= to, published: pub.length, media: pub.filter((o) => o.media).length,
      replies: rep.length, customers: rep.filter((n) => n.customer).length, pricing: rep.filter((n) => n.customer === "pricing").length, installs: installs && installs[i] != null ? installs[i] : null };
  });
  return { start: ymd(plan.start), end: ymd(addDays(plan.weeks[TEST_WEEKS - 1][1], -1)), rows, packages: testPackages(plan.posts, map), week: rows.filter((r) => r.started).length };
}
// npm's daily downloads for those packages, summed per test week (weeks not begun:
// null): [n, …] or null. get(url) reads npm's JSON (the app passes it: nothing here
// goes on the network by itself). One read per package for the whole test, kept a few hours.
const NPM_DAYS = "https://api.npmjs.org/downloads/range/";
let npmCache = { key: "", at: 0, counts: null };
async function testInstalls(t, { now = Date.now(), get = null } = {}) {
  if (!t || !t.packages.length || !t.rows[0].started || typeof get !== "function") return null;
  const key = t.packages.join(",") + "|" + t.start; if (npmCache.key === key && now - npmCache.at < 3 * 3600000) return npmCache.counts;
  const counts = t.rows.map((r) => (r.started ? 0 : null));
  for (const p of t.packages) {
    let d = null; try { d = await get(`${NPM_DAYS}${t.start}:${t.end}/${encodeURIComponent(p)}`); } catch {}
    if (!d || !Array.isArray(d.downloads)) return null;
    for (const x of d.downloads) { const r = t.rows.findIndex((w) => x.day >= w.from && x.day <= w.to); if (r >= 0 && counts[r] != null) counts[r] += Number(x.downloads) || 0; }
  }
  npmCache = { key, at: now, counts };
  return counts;
}
function maybeCustomer(text) { const s = String(text || ""); const hit = CUSTOMER.find(([, re]) => re.test(s)); return hit ? hit[0] : ""; }

export { TEST_WEEKS, testWeeks, testInstalls, testPackages, laneOut, PATHS, PLATFORM, SHARE_URL, KINDS, KIND_LABEL, LINKEDIN_ACTIVITY, NO_AI, voiceOf, loadVoice, voiceFromLinkedIn, tagsIn, changelogIn, gatherFacts, factLine, numbersIn, namesIn, checkClaims, parseDrafts, vetDraft, draftPosts, loadPosts, postLog, postsState, editPost, skipPost, approvePost, handToMarketing, copyText, openUrl, maybeCustomer,
  mediaType, mediaDir, mediaWords, addMedia, removeMedia, mediaFile, pictureOfPage, clipOfPage, concatList, toVideo, canClip, NO_FFMPEG, localApps, screenFor, picturesFor, listening };
