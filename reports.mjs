// symbiot — Reports: what agents wrote up for you, in one place. A run that
// finds things (an audit, findings, a plan, a pitch) leaves them as a `.md` in
// its folder's .symbiot/ (handover.mjs HANDBACK tells every brief so). Before
// this, the only way to read one was to find the file by hand.
//
// - Where: the .symbiot/ of every folder runs work in (your repos, and the runs
//   of their own under ~/.config/symbiot/drafts: handback.mjs runFolders).
// - What counts: any .md there except the files Symbiot and the run talk through
//   (TASKS, QUESTIONS, ANSWERS, HANDOFF, SKIPPED, CARRYON) and the briefs handed in
//   (BRIEF*.md). Its title is its first `# ` heading, else the file name.
// - New: a report you haven't opened since it last changed. Home shows how many
//   (home.mjs); opening one marks it read.
// - Reading: only a file this list found can be read, by its id, never by a
//   path; it's shown as HTML made here (mdHtml), with everything escaped first.
//
// Stored in ~/.config/symbiot/reports.json, yours only: { seen: { id: mtime }, decided, handed:
// { id: { mtime, done: { idea: "handed" | "dismissed" | "superseded" } } } }.
import { join, basename, dirname, resolve, extname, sep } from "node:path";
import { homedir } from "node:os";
import { readFileSync, readdirSync, statSync, realpathSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { CONFIG_DIR, isFinding, readState, writeJsonAtomic, loadTasks, sameTask } from "./core.mjs";
import { runFolders, laneOf, runTitle } from "./handback.mjs";
import { runningHandoff } from "./agents.mjs";
import { laneMap } from "./scan.mjs";
import { MARKETING_DIR, draftFiles, draftStatuses, draftPreview, parseDraft, inLane } from "./marketing.mjs";

const SEEN_FILE = join(CONFIG_DIR, "reports.json");
const NOT_REPORTS = /^(?:TASKS(?:\.[\w-]+)?|QUESTIONS|ANSWERS(?:\.archive)?|HANDOFF|SKIPPED|CLAUDE|AGENTS|CARRYON)\.md$|^BRIEF/i; // TASKS.next.md too: the tasks held for after a run; CARRYON.md is a run's note to the next (agents.mjs carryOn), and crowded out the reports (21 Oct 2026)
const MAX_READ = 512 * 1024, MAX_LIST = 200;
const WRITING_FOR = 15 * 60 * 1000; // a run is "still writing" a report only if the file changed in the last 15 minutes
const idOf = (file) => createHash("sha1").update(file).digest("hex").slice(0, 12);

const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
function loadSeen(file = SEEN_FILE) { const d = readState(file, (v) => !!v && typeof v === "object" && !Array.isArray(v)); return { seen: obj(d && d.seen), decided: obj(d && d.decided), handed: obj(d && d.handed) }; }
// Whole or not at all (writeJsonAtomic): torn, it read as "nothing seen", and every report came back unread (15 Oct 2026).
function saveSeen(d, file = SEEN_FILE) { try { writeJsonAtomic(file, d, { indent: 0, mode: 0o600 }); return true; } catch { return false; } }

// What an ops run (a folder called act-xxxxxxxx) was for, in words: the first line of the request
// quoted at the top of its TASKS.md. "" for any other folder (its lane's name says enough).
function sourceOf(folder) {
  if (!/^act-[0-9a-f]+$/.test(basename(folder))) return "";
  let t = ""; try { t = readFileSync(join(folder, ".symbiot", "TASKS.md"), "utf8").slice(0, 3000); } catch { return ""; }
  const q = t.match(/^>\s*(.+)$/m); if (!q) return "";
  const s = q[1].replace(/\s+/g, " ").trim();
  return s.length > 80 ? s.slice(0, 77).replace(/\s+\S*$/, "") + "…" : s;
}

// A report's title: its first "# " heading, without markdown; else its file name.
function titleOf(text, name) {
  const h = String(text || "").match(/^#\s+(.+)$/m);
  return (h ? h[1].replace(/[*_`]/g, "").trim() : "") || name.replace(/\.md$/i, "").replace(/[-_]+/g, " ");
}

// Every report runs left, newest first: [{ id, title, name, file, folder, lane,
// run, size, mtime, new, running }]. `folders`, `running` and `seen` can be given
// (the tests do).
function listReports({ map, folders, running = runningHandoff, seen } = {}) {
  if (!folders) { map = map || laneMap(); folders = runFolders(map); }
  const s = (seen || loadSeen()).seen, out = [];
  for (const folder of folders) {
    const dir = join(folder, ".symbiot");
    let names = []; try { names = readdirSync(dir).filter((f) => /\.md$/i.test(f) && !NOT_REPORTS.test(f)); } catch { continue; }
    for (const name of names) {
      const file = join(dir, name);
      let st; try { st = statSync(file); } catch { continue; }
      if (!st.isFile() || !st.size) continue;
      let head = ""; try { head = readFileSync(file, "utf8").slice(0, 4000); } catch { continue; }
      const id = idOf(file), mtime = Math.round(st.mtimeMs);
      out.push({ id, title: titleOf(head, name), name, file, folder, lane: map ? laneOf(folder, map) : basename(folder), run: runTitle(folder), size: st.size, mtime, new: s[id] !== mtime, running: Date.now() - mtime < WRITING_FOR && !!running(folder), source: sourceOf(folder) });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_LIST);
}

// One report, by its id: its text, as HTML too. Opening it marks it read.
function readReport(id, { list, mark = true, seenFile = SEEN_FILE } = {}) {
  const r = (list || listReports()).find((x) => x.id === String(id || ""));
  if (!r) return { error: "No report by that id: it may have been moved or deleted." };
  let text = ""; try { text = readFileSync(r.file, "utf8"); } catch (e) { return { error: `Couldn't read ${r.file}: ${e.message}` }; }
  const cut = text.length > MAX_READ; if (cut) text = text.slice(0, MAX_READ);
  if (mark) { const d = loadSeen(seenFile); d.seen[r.id] = r.mtime; saveSeen(d, seenFile); }
  const draft = isDraftReport(r.title, r.name), cards = draftCardsIn(text, { lane: r.folder === MARKETING_DIR });
  return { ...r, new: false, ...(cards.length ? { cards } : {}), text, html: mdHtml(text, { id: r.id, base: dirname(r.file), roots: imageRoots(r) }) + (cut ? "<p class='muted'>(cut at 512 KB: open the file for the rest)</p>" : ""), draft, ...(draft ? { decided: decidedOn(r, seenFile) } : { ideas: openIdeas(r, text, seenFile), handled: handledIdeas(r, seenFile) }) };
}
// The list with what each report leaves for the user: `needs` is "draft" (undecided, waits
// on an Approve or Reject), "ideas" (it ends in next steps), or "" (nothing to act on).
// Uses reportIdeas, isDraftReport and decidedOn as they are; the text is read per report.
function withNeeds(list, { seenFile = SEEN_FILE, tasks } = {}) {
  try { sweepSuperseded({ list, seenFile, tasks }); } catch { /* the list still shows */ }
  const ctx = supersedeContext({ list, tasks, file: seenFile });
  return list.map((r) => {
    if (isDraftReport(r.title, r.name)) return { ...r, needs: decidedOn(r, seenFile) ? "" : "draft", ideas: 0, steps: [], draft: true };
    let text = ""; try { text = readFileSync(r.file, "utf8").slice(0, MAX_READ); } catch { /* gone: nothing to act on */ }
    const steps = openIdeas(r, text, seenFile, ctx), n = steps.length;
    if (draftCardsIn(text, { lane: r.folder === MARKETING_DIR }).some((rel) => { const p = draftPreview(rel); return p && p.isPost && (!p.status || p.status === "change"); })) return { ...r, needs: "draft", ideas: n, steps }; // a draft in it waits for an answer (never answered, or edited since)
    return { ...r, needs: n ? "ideas" : "", ideas: n, steps };
  });
}
// On a phone: its computer's newest reports, from the copy it sent (phone.mjs
// computerCopy, reportsForPhone), beside the phone's own. Their ids start "pc:", they
// say where they're from, and one is read from the copy, so it opens offline too.
// It can't be asked about or ticked into ideas here: that's the computer's (remote).
function phoneReports(pc) {
  if (!pc || !pc.copy || !Array.isArray(pc.copy.reports)) return [];
  return pc.copy.reports.map((r) => ({ id: "pc:" + r.id, title: r.title, name: r.name, lane: r.lane, run: r.run, file: `${pc.from}: ${r.lane ? r.lane + " · " : ""}${r.name}`, folder: "", size: r.size, mtime: r.mtime, new: false, running: false, computer: pc.from }));
}
function phoneReport(pc, id) {
  const r = phoneReports(pc).find((x) => x.id === String(id || "")), raw = r && pc.copy.reports.find((x) => "pc:" + x.id === r.id);
  if (!r || !raw) return { error: "That report isn't in the copy from your computer any more: it sends its newest few." };
  const text = String(raw.text || "");
  return { ...r, remote: true, text, html: mdHtml(text) + (raw.cut ? mdHtml(`_That's its first part: the rest is on ${pc.from}._`) : ""), draft: false, ideas: [] };
}
// Mark them all read (the list's "Mark all read").
function markAllRead({ list, seenFile = SEEN_FILE } = {}) {
  const d = loadSeen(seenFile); for (const r of list || listReports()) d.seen[r.id] = r.mtime;
  return saveSeen(d, seenFile) ? { ok: true } : { error: "Couldn't write " + seenFile };
}

// ---- markdown, as safe HTML ----------------------------------------------------------
// What reports use: headings, paragraphs, lists (numbered or not, nested by
// indent), tables, code (fenced and inline), quotes, rules, bold, italic and
// links (http, https and mailto only), and images. Everything is escaped before any
// tag is made, so a report can't put its own HTML or script on the page.
//
// Images: the Robin LinkedIn previews put their card and composer shots in as
// ![alt](/home/…/x.png), and they showed as raw text (2026-10-08). A local image
// (absolute, ~/, or relative to the report) now shows in place, fetched by the
// report's id and that src (reportImage), never by a bare path, and only from
// ~/.config/symbiot, the report's own folder or your projects. One that isn't
// there says so. A web image stays a link: opening a report loads nothing remote.
// A ```text block (a draft post, say) wraps and keeps its line breaks.
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const unEsc = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const IMG = /!\[([^\]]*)\]\s?\(\s*(&lt;.+?&gt;|[^\s)]+)(?:\s+&quot;[^]*?&quot;)?\s*\)/g; // on escaped text; a break between ] and ( is joined to one space
const IMG_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" }; // no svg: it can carry script
// Where a report's image src points on disk ("" for a web one or nothing usable).
function imagePath(src, base) {
  let s = String(src || "").trim().replace(/^<(.*)>$/, "$1");
  if (/^(?:https?:|data:|mailto:)/i.test(s)) return "";
  s = s.replace(/^file:\/\//i, ""); try { s = decodeURI(s); } catch {}
  if (!s) return "";
  if (s === "~" || s.startsWith("~/")) return join(homedir(), s.slice(1));
  return resolve(base || ".", s);
}
// Folders a report's images may come from: Symbiot's own, the report's, your projects.
function imageRoots(r) { let lanes = []; try { lanes = Object.values(laneMap()); } catch {} return [CONFIG_DIR, r && r.folder, ...lanes].filter(Boolean); }
// The real file an image path is, if it's an image under one of roots; else why not.
function imageFile(p, roots) {
  if (!p) return { error: "not a local image" };
  if (!IMG_TYPES[extname(p).toLowerCase()]) return { error: "not an image file" };
  let real; try { real = realpathSync(p); if (!statSync(real).isFile()) throw 0; } catch { return { error: "missing", missing: true }; }
  const ok = (roots || []).some((r) => { let rr; try { rr = realpathSync(r); } catch { return false; } return real === rr || real.startsWith(rr.endsWith(sep) ? rr : rr + sep); });
  return ok ? { file: real, type: IMG_TYPES[extname(real).toLowerCase()] } : { error: "outside your project folders" };
}
function image(alt, src, o) {
  const raw = unEsc(src).replace(/^<(.*)>$/, "$1"), p = imagePath(raw, o.base);
  if (!p && /^https?:\/\//i.test(raw)) return `<a href="${escHtml(raw)}" target="_blank" rel="noopener noreferrer">${alt || "image"}</a>`;
  const f = o.id ? imageFile(p, o.roots) : { error: "no report to fetch it by" };
  if (f.error) return `<span class="rimgmiss" title="${escHtml(raw)}">🖼 Image ${f.missing ? "missing" : "not shown (" + f.error + ")"}: ${alt ? alt + " · " : ""}<code>${escHtml(raw)}</code></span>`;
  const url = `/api/reports/image?id=${encodeURIComponent(o.id)}&src=${encodeURIComponent(raw)}`;
  return `<img class="rimg" data-src="${escHtml(url)}" alt="${alt}" title="${alt ? alt + " · " : ""}click to enlarge" loading="lazy">`;
}
// A report's image, for its <img>: only a src the report itself shows, only under its roots.
function reportImage(id, src, { list, roots } = {}) {
  const r = (list || listReports()).find((x) => x.id === String(id || ""));
  if (!r) return { error: "No report by that id." };
  let text = ""; try { text = readFileSync(r.file, "utf8").slice(0, MAX_READ); } catch { return { error: "Couldn't read the report." }; }
  const want = String(src || ""), seen = [...escHtml(text.replace(/\r?\n/g, " ")).matchAll(IMG)].some((m) => unEsc(m[2]).replace(/^<(.*)>$/, "$1") === want);
  if (!seen) return { error: "That image isn't in the report." };
  return imageFile(imagePath(want, dirname(r.file)), roots || imageRoots(r));
}
function inline(s, o = {}) {
  const code = [];
  let t = escHtml(s).replace(/`([^`]+)`/g, (_, c) => { code.push(c); return `\u0000${code.length - 1}\u0000`; });
  const imgs = []; t = t.replace(IMG, (_, alt, src) => { imgs.push(image(alt, src, o)); return `\u0001${imgs.length - 1}\u0001`; });
  t = t.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (_, txt, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/__([^_]+)__/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>").replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>");
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${code[+i]}</code>`).replace(/\u0001(\d+)\u0001/g, (_, i) => imgs[+i]);
}
const cells = (line) => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
const PROSE = /^(?:text|txt|plain|prose|post|linkedin|markdown|md)$/i; // a fence holding writing, not code
function mdHtml(md, o = {}) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n"), out = [];
  let i = 0, para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "), o)}</p>`); para = []; } };
  while (i < lines.length) {
    const l = lines[i];
    const fence = l.match(/^\s*(```|~~~)\s*([\w+-]*)/);
    if (fence) { flush(); const body = []; i++; while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]); i++; out.push(`<pre${PROSE.test(fence[2]) ? ' class="prose"' : ""}><code>${escHtml(body.join("\n"))}</code></pre>`); continue; }
    const h = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { flush(); const n = Math.min(h[1].length + 1, 6); out.push(`<h${n}>${inline(h[2], o)}</h${n}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); out.push("<hr>"); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush(); const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="rtable"><table><thead><tr>${head.map((c) => `<th>${inline(c, o)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, o)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^\s*>/.test(l)) { flush(); const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, "")); out.push(`<blockquote>${mdHtml(q.join("\n"), o)}</blockquote>`); continue; }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(l)) { flush(); i = list(lines, i, out, o); continue; }
    if (!l.trim()) { flush(); i++; continue; }
    para.push(l.trim()); i++;
  }
  flush();
  return out.join("\n");
}
// A list from line i, its items' deeper lines as nested lists; gives the next line.
function list(lines, i, out, o) {
  const ind = (l) => l.match(/^\s*/)[0].replace(/\t/g, "    ").length, base = ind(lines[i]);
  const ordered = /^\s*\d+[.)]\s/.test(lines[i]), items = [];
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { if (i + 1 < lines.length && /^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[i + 1]) && ind(lines[i + 1]) >= base) { i++; continue; } break; }
    const m = l.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/), d = ind(l);
    if (m && d === base) { items.push({ text: m[1].replace(/^\[([ xX~])\]\s+/, (_, x) => (x === " " ? "☐ " : x === "~" ? "⏳ " : "☑ ")), sub: [] }); i++; continue; }
    if (d > base && items.length) { if (m) { const sub = []; i = list(lines, i, sub, o); items[items.length - 1].sub.push(...sub); } else { items[items.length - 1].text += " " + l.trim(); i++; } continue; }
    break;
  }
  const tag = ordered ? "ol" : "ul";
  out.push(`<${tag}>${items.map((it) => `<li>${inline(it.text, o)}${it.sub.join("")}</li>`).join("")}</${tag}>`);
  return i;
}

// ---- what to do with it --------------------------------------------------------------
// the user read the "Meridian catch-up" report, then copied its "Top 3 next" into Home's chat
// by hand to act on it (2026-10-08): the report gave him nothing to act on. Its end now
// offers 2-4 ideas drawn from it, each one tick from the Workdesk in its lane, and a
// box to ask about it in place (home.mjs reportIdeasAdd, reportAsk). A draft for the
// user's OK (a post preview, say) gets Approve and Reject instead.
// "fix" and "plan" alone head the record of what was done ("The fix", "Battery scorer fix") as often as
// what is left, so they count only with a qualifier; a heading that says what was done or wrong
// (DONE_HEAD) never counts. The report's own title (its `# ` line) never counts (2026-10-16).
const NEXT_HEAD = /\b(?:next(?: steps?)?|top \d+|recommend\w*|suggest\w*|ideas?|actions?|action items?|to ?dos?|follow[- ]?ups?|what to do|priorit\w*|(?:implementation|rollout|migration|action|fix|launch|improvement) plan|plan, in order|plan for|fixes? (?:to make|needed|left|still)|still to fix|(?:what )?must change|needs? (?:to|your|doing|attention)|remaining|still open|left for you|open (?:items?|issues?|questions?)|outstanding|not done|to (?:fix|change|build|do|add|decide)|gaps)\b/i;
const DONE_HEAD = /\b(?:done|fixed|changed|ticked|shipped|completed|flaws?|causes?)\b/i;
// A bullet that asks for nothing: it says to leave things be, or reports what is already so.
const NOT_ACTION = /^(?:paused\b|hold\b|do not|don'?t|never|keep\b|leave\b|no action|nothing (?:to|more)|no [\w ]{0,40}(?:so far|yet)|revisit only if|ticked:|release:)|\b(?:is|are|was|were) now\b|\bhas been\b|\bhad actually\b|\bnot worth\b|\bnothing more for you\b|\bin progress\)/i;
const IDEAS_MAX = 8;
// A half-sentence lifted off a wrapped line is not an action (2026-10-13): one word, one that
// carries on from something before it ("and then…", "which…"), one that stops on a joining word
// or a comma, or one with a bracket or quote left open.
const CARRIES_ON = /^(?:and|or|but|nor|which|that|who|whose|because|so|then|while|where|when|if|with|without|to|for|of|in|on|by|as|than|including|e\.g\.|i\.e\.)\b/i;
const STOPS_SHORT = /(?:[,;:(—-]|\b(?:and|or|but|the|a|an|to|of|for|with|in|on|by|as|that|which|from|into|at))$/i;
function isFragment(t) {
  if (t.split(" ").length < 2 || CARRIES_ON.test(t) || STOPS_SHORT.test(t)) return true;
  const open = (c, d) => t.split(c).length - t.split(d).length; // brackets
  return open("(", ")") > 0 || open("[", "]") > 0 || (t.split("`").length - 1) % 2 === 1;
}
const cleanIdea = (s) => String(s).replace(/^\[[ xX~]\]\s+/, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
// The top-level items of its "next" sections ("## Top 3 next", "## Recommendations"…),
// first sections first, at most IDEAS_MAX, but not the findings among them. None when it has no such section.
function reportIdeas(text, max = IDEAS_MAX) {
  const out = []; let on = false, base = -1;
  for (const l of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
    const h = l.match(/^(#{1,6})\s+(.*)$/) || l.match(/^\s*()\*\*([^*]+)\*\*:?\s*$/) || l.match(/^\s*()\*\*([^*]+)\*\*[^\n]{0,80}:\s*$/); // "**What must change** (full fixes in x.json):" leads a list too
    if (h) { on = h[1].length !== 1 && NEXT_HEAD.test(h[2]) && !DONE_HEAD.test(h[2]); base = -1; continue; }
    if (!on) continue;
    const m = l.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.+)$/); if (!m) continue;
    const ind = m[1].replace(/\t/g, "    ").length; if (base < 0) base = ind; if (ind > base) continue;
      const t = cleanIdea(m[2]); if (t && !isFinding(t) && !isFragment(t) && !NOT_ACTION.test(t) && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t); // a fact it found is no next step (core.mjs isFinding)
    if (out.length >= max) break;
  }
  return out;
}
// Which of a report's ideas were handed to an agent or dismissed, kept by the report's mtime
// (a rewritten report offers its ideas again). A report leaves "Read, open actions" once none is open.
// An idea handed, done or dismissed in ANY report stays so in the others: an agent saved its plan again under a new name
// nine times (KAGGLE-SQUARES-PLAN-xxxxxx.md, 25 Oct 2026), each copy a new report with the same ideas, so "Hand to agent" was
// pressed again and again and the idea was always back. Long enough that it is the same idea, not a common few words.
const SAME_IDEA = 30, HANDLED = /^(?:handed|done|dismissed)$/;
function handledIdeas(r, file = SEEN_FILE) {
  // Keys are trimmed: an idea cut at IDEAS' length keeps or loses its last space from one copy to the next (ed54e8, 25 Oct 2026).
  const all = loadSeen(file).handed, h = all[r.id], out = {};
  if (h && h.mtime === r.mtime && h.done && typeof h.done === "object") for (const [t, st] of Object.entries(h.done)) out[t.trim()] = st;
  for (const [id, x] of Object.entries(all)) {
    if (id === r.id || !x || typeof x.done !== "object" || !x.done) continue;
    for (const [t, st] of Object.entries(x.done)) if (t.trim().length >= SAME_IDEA && HANDLED.test(st) && !out[t.trim()]) out[t.trim()] = st;
  }
  return out;
}
const openIdeas = (r, text, file = SEEN_FILE, ctx) => {
  const done = handledIdeas(r, file), open = reportIdeas(text, 40).filter((t) => !done[t.trim()]).slice(0, IDEAS_MAX); // handled ones don't use up the slots
  if (!open.length) return open;
  const why = supersededIdeas(r, open, ctx || supersedeContext({ file }));
  return open.filter((t) => !why.has(t));
};

// ---- superseded actions ----------------------------------------------------------------
// An action leaves "Read, open actions" when it no longer needs doing (2026-10-13), by any of:
//  1. a task made from it (or one that says the same, written after the report) is done,
//     merged or cancelled: the Workdesk's tasks, archived ones too;
//  2. a later report in the same lane covers the same thing (the same title, bar dates and numbers);
//  3. another task is already open for it, or a newer report lists it;
//  4. its subject is gone: the patch it names isn't there any more.
// supersededIdeas gives { idea => why } for the ideas it is given; sweepSuperseded writes
// them down as "superseded" (so the report drops to Read and done on its own) and returns
// what it cleared. withNeeds and the work tick run it, so it follows every task that
// finishes and every report that lands.
const FROM_TAIL = /\s*\(from the report "[^"]*", [^)]*\)\s*$/;
const topicKey = (title) => String(title || "").toLowerCase().replace(/[\d.:/_-]+/g, " ").replace(/\b(?:report|audit|plan|findings|update|summary)\b/g, " ").replace(/\s+/g, " ").trim();
function supersedeContext({ list, tasks, file = SEEN_FILE } = {}) {
  const ctx = { file, _l: list, _t: tasks, _i: new Map() };
  Object.defineProperties(ctx, {
    list: { get() { return this._l || (this._l = listReports()); } },
    tasks: { get() { if (!this._t) { try { this._t = loadTasks(); } catch { this._t = []; } } return this._t; } },
  });
  ctx.ideasOf = (r) => { // a report's open ideas, read once
    if (!ctx._i.has(r.id)) { let t = ""; try { t = readFileSync(r.file, "utf8").slice(0, MAX_READ); } catch {} const done = handledIdeas(r, file); ctx._i.set(r.id, isDraftReport(r.title, r.name) ? [] : reportIdeas(t, 40).filter((x) => !done[x.trim()]).slice(0, IDEAS_MAX)); }
    return ctx._i.get(r.id);
  };
  return ctx;
}
// Words that say what an action is about (not the glue), for judging that a task covers it when
// the two are worded differently (sameTask only matches the same sentence, near enough).
const GLUE = new Set("the and for with that this from into onto then than when what which will would should could must have has been being are was were not but all any can its it's our your their there here also only just more most some such each both before after about under over out off per via".split(" "));
const subjectWords = (s) => new Set(String(s || "").toLowerCase().replace(FROM_TAIL, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3 && !GLUE.has(w)));
// 70% of an action's subject words (it needs 4+) in a task written after the report.
function coversIdea(idea, taskText) {
  const a = subjectWords(idea); if (a.size < 4) return false;
  const b = subjectWords(taskText); let n = 0; for (const w of a) if (b.has(w)) n++;
  return n / a.size >= 0.7;
}
const newerThan = (a, b) => a.mtime > b.mtime || (a.mtime === b.mtime && a.id < b.id);
function supersededIdeas(r, ideas, ctx = supersedeContext()) {
  const out = new Map(), key = topicKey(r.title);
  const later = key && ctx.list.find((o) => o.id !== r.id && newerThan(o, r) && o.lane === r.lane && topicKey(o.title) === key && !isDraftReport(o.title, o.name));
  for (const t of ideas) {
    if (later) { out.set(t, `a later report, "${later.title}", covers the same thing`); continue; }
    const mine = (x) => String(x.text || "").includes(r.file) || (FROM_TAIL.test(x.text || "") && String(x.text).includes(`"${r.title}"`));
    const like = ctx.tasks.filter((x) => sameTask(t, String(x.text || "").replace(FROM_TAIL, "")) && (mine(x) || (x.ts || 0) >= r.mtime));
    const closed = like.find((x) => x.done || x.archived);
    if (closed) { out.set(t, `a task made from it is ${closed.merged ? "merged" : closed.dropped ? "cancelled" : "done"}`); continue; }
    if (like.length) { out.set(t, "another task already covers it"); continue; }
    const wide = ctx.tasks.filter((x) => (x.ts || 0) >= r.mtime && coversIdea(t, x.text)); // worded differently: judged by what it is about
    const wideClosed = wide.find((x) => x.done || x.archived);
    if (wideClosed) { out.set(t, `a task about the same thing is ${wideClosed.merged ? "merged" : wideClosed.dropped ? "cancelled" : "done"}`); continue; }
    if (wide.length) { out.set(t, "another task already covers it"); continue; }
    const twin = ctx.list.find((o) => o.id !== r.id && newerThan(o, r) && !isDraftReport(o.title, o.name) && ctx.ideasOf(o).some((x) => sameTask(t, x)));
    if (twin) { out.set(t, `a newer report, "${twin.title}", lists it too`); continue; }
    const m = t.match(/(?:~|\/)[^\s"'`)]*\.(?:patch|diff)\b/);
    if (m && !existsSync(m[0].replace(/^~/, homedir()))) out.set(t, `${basename(m[0])} is gone, so there is nothing to apply`);
  }
  return out;
}
// Clear them for good, per report, and say what was cleared: [{ id, title, idea, why }].
function sweepSuperseded({ list, seenFile = SEEN_FILE, tasks } = {}) {
  list = list || listReports(); const ctx = supersedeContext({ list, tasks, file: seenFile }), cleared = [];
  for (const r of list) {
    if (isDraftReport(r.title, r.name)) continue;
    const open = ctx.ideasOf(r); if (!open.length) continue;
    const why = supersededIdeas(r, open, ctx); if (!why.size) continue;
    markIdeas(r, [...why.keys()], "superseded", seenFile);
    for (const [idea, w] of why) cleared.push({ id: r.id, title: r.title, idea, why: w });
  }
  return cleared;
}
function markIdeas(r, ideas, status, file = SEEN_FILE) {
  const d = loadSeen(file), h = d.handed[r.id] && d.handed[r.id].mtime === r.mtime ? d.handed[r.id] : { mtime: r.mtime, done: {} };
  for (const t of ideas) h.done[String(t)] = status;
  d.handed[r.id] = h; return saveSeen(d, file);
}
// The Marketing drafts a report is about, as their own cards (the user, 2026-10-16: a report said
// "approve both drafts under Marketing" and there was nothing to press). A report that names a
// draft's file (drafts/<product>/<file>.md), or a marketing-lane report that asks for approval and
// names a waiting draft's date, carries that draft's card (ui.mjs mkPreview: the post as it will
// look, with Approve, Reject and Change). Posts not yet posted or superseded only: [rel].
function draftCardsIn(text, { dir = MARKETING_DIR, lane = false } = {}) {
  const t = String(text || ""), out = [], st = draftStatuses(dir), live = (rel) => { const s = st[rel]; return !(s && (s.status === "posted" || s.posted || s.status === "superseded")); };
  const add = (rel) => { if (rel && !out.includes(rel) && live(rel)) out.push(rel); };
  for (const m of t.matchAll(/\bdrafts\/[\w.-]+\/[\w.-]+\.md\b/g)) { const f = inLane(dir, m[0]); if (f) { try { if (parseDraft(readFileSync(f, "utf8")).isPost) add(m[0]); } catch { /* unreadable: no card */ } } }
  if (lane && /\bapprov/i.test(t)) {
    const dates = new Set(t.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []);
    for (const f of draftFiles(dir, [], { max: 200 })) {
      if (f.doc || f.status || !f.rel) continue; // waiting for an answer only
      let d; try { d = parseDraft(readFileSync(f.file, "utf8")); } catch { continue; }
      const day = (d.when.match(/^\d{4}-\d{2}-\d{2}/) || [])[0];
      if (day && dates.has(day) && d.product && new RegExp("\\b" + d.product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(t)) add(f.rel);
    }
  }
  return out;
}
// A draft waiting on the user's OK (its title or file says draft or preview): Approve and
// Reject rather than ideas.
const isDraftReport = (title, name) => /\bdrafts?\b|\bpreviews?\b/i.test(`${title} ${String(name || "").replace(/[-_.]+/g, " ")}`);
// What the user decided on a draft report, kept by its mtime (a changed draft asks again).
function decidedOn(r, file = SEEN_FILE) { const d = loadSeen(file).decided[r.id]; return d && d.mtime === r.mtime ? d.status : ""; }
function decide(r, status, file = SEEN_FILE) { const d = loadSeen(file); d.decided[r.id] = { status, mtime: r.mtime, at: Date.now() }; return saveSeen(d, file); }

// How many reports are new, and the newest one's title (Home's droplet).
function reportsNews(opts) { const l = listReports(opts).filter((r) => r.new); return { count: l.length, latest: l[0] ? l[0].title : "" }; }

export { draftCardsIn, supersededIdeas, sweepSuperseded, supersedeContext, SEEN_FILE, NOT_REPORTS, titleOf, listReports, readReport, phoneReports, phoneReport, reportImage, imagePath, markAllRead, reportsNews, mdHtml, reportIdeas, isDraftReport, decidedOn, decide, withNeeds, IDEAS_MAX, handledIdeas, openIdeas, markIdeas };
