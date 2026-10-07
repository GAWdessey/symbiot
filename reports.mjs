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
import { join, basename } from "node:path";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import { CONFIG_DIR } from "./core.mjs";
import { runFolders, laneOf, runTitle } from "./handback.mjs";
import { runningHandoff } from "./agents.mjs";
import { laneMap } from "./scan.mjs";

const SEEN_FILE = join(CONFIG_DIR, "reports.json");
const NOT_REPORTS = /^(?:TASKS(?:\.[\w-]+)?|QUESTIONS|ANSWERS|HANDOFF|SKIPPED|CLAUDE|AGENTS)\.md$|^BRIEF/i; // TASKS.next.md too: the tasks held for after a run
const MAX_READ = 512 * 1024, MAX_LIST = 200;
const idOf = (file) => createHash("sha1").update(file).digest("hex").slice(0, 12);

function loadSeen(file = SEEN_FILE) { try { const d = JSON.parse(readFileSync(file, "utf8")); return { seen: d && typeof d.seen === "object" && d.seen ? d.seen : {} }; } catch { return { seen: {} }; } }
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
  return { ...r, new: false, text, html: mdHtml(text) + (cut ? "<p class='muted'>(cut at 512 KB: open the file for the rest)</p>" : "") };
}
// Mark them all read (the list's "Mark all read").
function markAllRead({ list, seenFile = SEEN_FILE } = {}) {
  const d = loadSeen(seenFile); for (const r of list || listReports()) d.seen[r.id] = r.mtime;
  return saveSeen(d, seenFile) ? { ok: true } : { error: "Couldn't write " + seenFile };
}

// ---- markdown, as safe HTML ----------------------------------------------------------
// What reports use: headings, paragraphs, lists (numbered or not, nested by
// indent), tables, code (fenced and inline), quotes, rules, bold, italic and
// links (http, https and mailto only). Everything is escaped before any tag is
// made, so a report can't put its own HTML or script on the page.
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
function inline(s) {
  const code = [];
  let t = escHtml(s).replace(/`([^`]+)`/g, (_, c) => { code.push(c); return `\u0000${code.length - 1}\u0000`; });
  t = t.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (_, txt, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/__([^_]+)__/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>").replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>");
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${code[+i]}</code>`);
}
const cells = (line) => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
function mdHtml(md) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n"), out = [];
  let i = 0, para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  while (i < lines.length) {
    const l = lines[i];
    const fence = l.match(/^\s*(```|~~~)/);
    if (fence) { flush(); const body = []; i++; while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]); i++; out.push(`<pre><code>${escHtml(body.join("\n"))}</code></pre>`); continue; }
    const h = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { flush(); const n = Math.min(h[1].length + 1, 6); out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); out.push("<hr>"); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush(); const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="rtable"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^\s*>/.test(l)) { flush(); const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, "")); out.push(`<blockquote>${mdHtml(q.join("\n"))}</blockquote>`); continue; }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(l)) { flush(); i = list(lines, i, out); continue; }
    if (!l.trim()) { flush(); i++; continue; }
    para.push(l.trim()); i++;
  }
  flush();
  return out.join("\n");
}
// A list from line i, its items' deeper lines as nested lists; gives the next line.
function list(lines, i, out) {
  const ind = (l) => l.match(/^\s*/)[0].replace(/\t/g, "    ").length, base = ind(lines[i]);
  const ordered = /^\s*\d+[.)]\s/.test(lines[i]), items = [];
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { if (i + 1 < lines.length && /^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[i + 1]) && ind(lines[i + 1]) >= base) { i++; continue; } break; }
    const m = l.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/), d = ind(l);
    if (m && d === base) { items.push({ text: m[1].replace(/^\[([ xX])\]\s+/, (_, x) => (x === " " ? "☐ " : "☑ ")), sub: [] }); i++; continue; }
    if (d > base && items.length) { if (m) { const sub = []; i = list(lines, i, sub); items[items.length - 1].sub.push(...sub); } else { items[items.length - 1].text += " " + l.trim(); i++; } continue; }
    break;
  }
  const tag = ordered ? "ol" : "ul";
  out.push(`<${tag}>${items.map((it) => `<li>${inline(it.text)}${it.sub.join("")}</li>`).join("")}</${tag}>`);
  return i;
}

// How many reports are new, and the newest one's title (Home's droplet).
function reportsNews(opts) { const l = listReports(opts).filter((r) => r.new); return { count: l.length, latest: l[0] ? l[0].title : "" }; }

export { SEEN_FILE, NOT_REPORTS, titleOf, listReports, readReport, markAllRead, reportsNews, mdHtml };
