// symbiot — Reports: what agents wrote up for you, in one place. A run that
// finds things (an audit, findings, a plan, a pitch) leaves them as a `.md` in
// its folder's .symbiot/ (handover.mjs HANDBACK tells every brief so). Before
// this, the only way to read one was to find the file by hand.
//
// - Where: the .symbiot/ of every folder runs work in (your repos, and the runs
//   of their own under ~/.config/symbiot/drafts: handback.mjs runFolders).
// - What counts: any .md there except the files Symbiot and the run talk through
//   (TASKS, QUESTIONS, ANSWERS, HANDOFF, SKIPPED) and the briefs handed in
//   (BRIEF*.md). Its title is its first `# ` heading, else the file name.
// - New: a report you haven't opened since it last changed. Home shows how many
//   (home.mjs); opening one marks it read.
// - Reading: only a file this list found can be read, by its id, never by a
//   path; it's shown as HTML made here (mdHtml), with everything escaped first.
//
// Stored in ~/.config/symbiot/reports.json, yours only: { seen: { id: mtime } }.
import { join, basename, dirname, resolve, extname, sep } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, chmodSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { CONFIG_DIR } from "./core.mjs";
import { runFolders, laneOf, runTitle } from "./handback.mjs";
import { runningHandoff } from "./agents.mjs";
import { laneMap } from "./scan.mjs";

const SEEN_FILE = join(CONFIG_DIR, "reports.json");
const NOT_REPORTS = /^(?:TASKS(?:\.[\w-]+)?|QUESTIONS|ANSWERS|HANDOFF|SKIPPED|CLAUDE|AGENTS)\.md$|^BRIEF/i; // TASKS.next.md too: the tasks held for after a run
const MAX_READ = 512 * 1024, MAX_LIST = 200;
const idOf = (file) => createHash("sha1").update(file).digest("hex").slice(0, 12);

function loadSeen(file = SEEN_FILE) { try { const d = JSON.parse(readFileSync(file, "utf8")), obj = (x) => (x && typeof x === "object" ? x : {}); return { seen: obj(d && d.seen), decided: obj(d && d.decided) }; } catch { return { seen: {}, decided: {} }; } }
function saveSeen(d, file = SEEN_FILE) { try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(file, JSON.stringify(d), { mode: 0o600 }); try { chmodSync(file, 0o600); } catch {} return true; } catch { return false; } }

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
      out.push({ id, title: titleOf(head, name), name, file, folder, lane: map ? laneOf(folder, map) : basename(folder), run: runTitle(folder), size: st.size, mtime, new: s[id] !== mtime, running: !!running(folder) });
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
  const draft = isDraftReport(r.title, r.name);
  return { ...r, new: false, text, html: mdHtml(text, { id: r.id, base: dirname(r.file), roots: imageRoots(r) }) + (cut ? "<p class='muted'>(cut at 512 KB: open the file for the rest)</p>" : ""), draft, ...(draft ? { decided: decidedOn(r, seenFile) } : { ideas: reportIdeas(text) }) };
}
// The list with what each report leaves for the user: `needs` is "draft" (undecided, waits
// on an Approve or Reject), "ideas" (it ends in next steps), or "" (nothing to act on).
// Uses reportIdeas, isDraftReport and decidedOn as they are; the text is read per report.
function withNeeds(list, { seenFile = SEEN_FILE } = {}) {
  return list.map((r) => {
    if (isDraftReport(r.title, r.name)) return { ...r, needs: decidedOn(r, seenFile) ? "" : "draft", ideas: 0 };
    let text = ""; try { text = readFileSync(r.file, "utf8").slice(0, MAX_READ); } catch { /* gone: nothing to act on */ }
    const n = reportIdeas(text).length;
    return { ...r, needs: n ? "ideas" : "", ideas: n };
  });
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
// Images: the Steve LinkedIn previews put their card and composer shots in as
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
    if (m && d === base) { items.push({ text: m[1].replace(/^\[([ xX])\]\s+/, (_, x) => (x === " " ? "☐ " : "☑ ")), sub: [] }); i++; continue; }
    if (d > base && items.length) { if (m) { const sub = []; i = list(lines, i, sub, o); items[items.length - 1].sub.push(...sub); } else { items[items.length - 1].text += " " + l.trim(); i++; } continue; }
    break;
  }
  const tag = ordered ? "ol" : "ul";
  out.push(`<${tag}>${items.map((it) => `<li>${inline(it.text, o)}${it.sub.join("")}</li>`).join("")}</${tag}>`);
  return i;
}

// ---- what to do with it --------------------------------------------------------------
// Garth read the "Argena catch-up" report, then copied its "Top 3 next" into Home's chat
// by hand to act on it (2026-10-08): the report gave him nothing to act on. Its end now
// offers 2-4 ideas drawn from it, each one tick from the Workdesk in its lane, and a
// box to ask about it in place (home.mjs reportIdeasAdd, reportAsk). A draft for the
// user's OK (a post preview, say) gets Approve and Reject instead.
const NEXT_HEAD = /\b(?:next|top \d+|recommend\w*|suggest\w*|ideas?|actions?|action items?|to ?dos?|follow[- ]?ups?|what to do|priorit\w*|fix(?:es)?|plan)\b/i;
const IDEAS_MAX = 4;
const cleanIdea = (s) => String(s).replace(/^\[[ xX]\]\s+/, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
// The top-level items of its "next" sections ("## Top 3 next", "## Recommendations"…),
// first sections first, at most IDEAS_MAX. None when it has no such section.
function reportIdeas(text, max = IDEAS_MAX) {
  const out = []; let on = false, base = -1;
  for (const l of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
    const h = l.match(/^#{1,6}\s+(.*)$/) || l.match(/^\s*\*\*([^*]+)\*\*:?\s*$/);
    if (h) { on = NEXT_HEAD.test(h[1]); base = -1; continue; }
    if (!on) continue;
    const m = l.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.+)$/); if (!m) continue;
    const ind = m[1].replace(/\t/g, "    ").length; if (base < 0) base = ind; if (ind > base) continue;
    const t = cleanIdea(m[2]); if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= max) break;
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

export { SEEN_FILE, NOT_REPORTS, titleOf, listReports, readReport, reportImage, imagePath, markAllRead, reportsNews, mdHtml, reportIdeas, isDraftReport, decidedOn, decide, withNeeds, IDEAS_MAX };
