// symbiot — the preview on a question's card: what an agent asks the user to approve, drawn where
// they approve it. A question "Create Dailify's LinkedIn page as shown?" (29 Oct 2026) held its
// pictures, its ten fields and its About text as markdown in the context, and the card showed it as
// one run-on paragraph with "![cover](…)" in it: "as shown where?". Here the context, kept line by
// line (agents.mjs parseQuestions), becomes a lead-in, pictures, label → value fields, folded long
// text and an "after that" list; and a card that can't draw what it refers to stops saying "as shown".
// Pure but for reading the lane's own picture files (their size, and whether they're there).
import { existsSync, realpathSync, openSync, readSync, closeSync, statSync } from "node:fs";
import { join, resolve, relative, isAbsolute, basename, sep } from "node:path";

// The words that point at a preview, in the question or its choices (the spec's list, any case).
const REFERS = /\b(?:as shown|shown (?:below|here)|the preview|its preview|see (?:above|below)|as below|like this)\b/i;
// The ones that can go from a sentence and leave it whole: "Create the page as shown?" → "Create the page?"
const DROPPABLE = /\s*\(?\b(?:as shown(?: (?:below|here|above))?|shown (?:below|here)|as below|like this|see (?:above|below))\b\)?/gi;
const IMG_EXT = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const VID = /\.(?:mp4|mov|webm|m4v)$/i, IMG = /\.(?:png|jpe?g|gif|webp)$/i;
const MD_IMG = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?\s*\)/g;
// A line that is only pictures: markdown images, bare picture or video paths, and separators.
const PIC_ONLY = /^(?:\s*(?:!\[[^\]]*\]\([^)]*\)|`?[\w./~-]+\.(?:png|jpe?g|gif|webp|mp4|mov|webm|m4v)`?)\s*[,;·|]?)+\s*$/i;
// "Name ......... Dailify", "Website: https://…": a short label (at most 3 words), dots or a colon, the value.
const FIELD = /^(?:[-*+]\s+)?([A-Za-z][\w'&/-]*(?: [\w'&/-]+){0,2})\s*(?:\.{3,}|:(?!\/\/))\s*(.*)$/;
const ASK_PREVIEW = "Show me the preview on the card: put the pictures and the details in the question itself.";
const cap = (s) => String(s || "").replace(/^\s*\p{Ll}/u, (c) => c.toUpperCase());
// A file path in words the user reads: a backticked path goes, with its brackets if that's all they held.
const noPaths = (s) => String(s || "").replace(/\s*\(\s*`[^`]*[/\\][^`]*`\s*\)/g, "").replace(/`[^`]*[/\\][^`]*`/g, "a file").replace(/\s{2,}/g, " ").trim();
const dropShown = (s) => String(s || "").replace(DROPPABLE, "").replace(/\s+([?.!,;:])/g, "$1").replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").trim();

// A picture's size from its first bytes (PNG, GIF, JPEG, WebP), or null.
function picSize(file) {
  let fd; const b = Buffer.alloc(65536);
  try { fd = openSync(file, "r"); const n = readSync(fd, b, 0, b.length, 0); const d = b.subarray(0, n);
    if (d.length > 24 && d.readUInt32BE(0) === 0x89504e47) return { w: d.readUInt32BE(16), h: d.readUInt32BE(20) };
    if (d.length > 10 && d.toString("ascii", 0, 3) === "GIF") return { w: d.readUInt16LE(6), h: d.readUInt16LE(8) };
    if (d.length > 30 && d.toString("ascii", 0, 4) === "RIFF" && d.toString("ascii", 8, 12) === "WEBP") {
      const k = d.toString("ascii", 12, 16);
      if (k === "VP8X") return { w: 1 + d.readUIntLE(24, 3), h: 1 + d.readUIntLE(27, 3) };
      if (k === "VP8 ") return { w: d.readUInt16LE(26) & 0x3fff, h: d.readUInt16LE(28) & 0x3fff };
      if (k === "VP8L") { const v = d.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    }
    if (d[0] === 0xff && d[1] === 0xd8) for (let i = 2; i + 9 < d.length;) {
      if (d[i] !== 0xff) { i++; continue; }
      const m = d[i + 1], len = d.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: d.readUInt16BE(i + 5), w: d.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  } catch {} finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
  return null;
}
const inside = (dir, f) => { const r = relative(dir, f); return !!r && !r.startsWith("..") && !isAbsolute(r) && r.split(sep)[0] !== ".."; };
// Where a picture named in a lane's question is, and whether it may be shown: only a picture file whose real
// path is inside the lane's .symbiot/ (relative to it, as agents write them, or to the lane's root), or in a
// Marketing tray (tray(rel), tray.mjs trayMedia). No ../ out, no absolute path, no link out, no other file.
// { state: "ok", file, type } | { state: "missing" } | { state: "outside" }
function previewFile(root, f, { tray = null } = {}) {
  const rel = String(f || "").trim().replace(/^`|`$/g, "");
  const ext = (rel.split(".").pop() || "").toLowerCase(), type = IMG_EXT[ext];
  if (!root || !rel || !type || isAbsolute(rel) || /^~|^[a-z]+:/i.test(rel) || /\0/.test(rel)) return { state: "outside" };
  if (tray && /^drafts\/[^/]+\/tray\/[^/]+$/.test(rel)) { try { const m = tray(rel); if (m) return { state: "ok", file: m.file, type: m.type }; } catch {} }
  const sym = join(root, ".symbiot"), cands = [resolve(sym, rel), resolve(root, rel)].filter((c) => inside(sym, c));
  let realSym = ""; try { realSym = realpathSync(sym); } catch {}
  for (const c of cands) {
    if (!existsSync(c)) continue;
    try { const r = realpathSync(c); if (realSym && inside(realSym, r) && statSync(r).isFile()) return { state: "ok", file: r, type }; } catch {}
    return { state: "outside" }; // a link out of the lane's files
  }
  if (cands.length) return { state: "missing" };
  return { state: "outside" };
}

// The preview of one question, from its context lines (blank lines are "" and part a paragraph). Gives null
// when the question neither draws nor refers to anything (its card is as before, its lead-in in paragraphs).
//   path: the lane's folder; q / options / labels: the question as shown; src(f): the address a picture
//   loads from; tray: a Marketing tray's file finder.
function previewOf(path, lines, { q = "", options = [], labels = null, src = null, tray = null } = {}) {
  const L = (Array.isArray(lines) ? lines : []).map((l) => String(l == null ? "" : l));
  const lead = [], pics = [], fields = [], then = [], files = [], quote = [];
  let caption = "", longLabel = "", para = [];
  const flush = () => { if (para.length) lead.push(noPaths(para.join(" "))); para = []; };
  for (let i = 0; i < L.length; i++) {
    const l = L[i].trim();
    if (!l) { flush(); continue; }
    if (PIC_ONLY.test(l)) {
      flush();
      const md = [...l.matchAll(MD_IMG)].map((m) => ({ alt: m[1], f: m[2] }));
      const bare = l.replace(MD_IMG, " ").split(/[\s,;·|]+/).map((t) => t.replace(/^`|`$/g, "")).filter((t) => IMG.test(t) || VID.test(t)).map((f) => ({ alt: "", f }));
      for (const p of [...md, ...bare]) {
        const name = basename(p.f);
        if (VID.test(p.f)) { files.push(`${name} (a video: open it in Marketing)`); continue; }
        const at = previewFile(path, p.f, { tray }), size = at.state === "ok" ? picSize(at.file) : null;
        const alt = cap(p.alt || name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
        pics.push({ name, alt, f: p.f, state: at.state, ...(size ? { w: size.w, h: size.h, size: `${size.w}×${size.h}` } : {}),
          ...(at.state === "ok" && src ? { src: src(p.f) } : {}),
          ...(at.state === "missing" ? { gap: `${name} isn't in this lane's files` } : at.state === "outside" ? { gap: `${name} can't be shown: it's outside this lane's files` } : {}) });
      }
      // the sentence under the pictures that names their sizes is their caption
      const nx = (L[i + 1] || "").trim();
      if (pics.length && /\d+\s*[×x]\s*\d+|\b\d+\s*px\b/i.test(nx) && !FIELD.test(nx)) {
        caption = cap(nx.replace(/^\(|\)$/g, "").split(/(?<=[.!?])\s+/).filter((s) => !/`|[\w.-]+\/[\w.-]+/.test(s)).join(" ").replace(/\s*;\s*/g, " · ").replace(/[.]\s*$/, "").trim());
        i++;
      }
      continue;
    }
    const th = l.match(/^Then:\s*(.+)$/i);
    if (th) {
      flush();
      for (const raw of th[1].split(/\s+·\s+/)) {
        const m = raw.trim().match(/^\[([ xX])\]\s*(.*)$/), text = cap(noPaths(m ? m[2] : raw).replace(/[.]\s*$/, ""));
        if (text) then.push({ text, ...(m ? { checked: m[1] !== " " } : {}) });
      }
      continue;
    }
    if (/^>/.test(l)) { flush(); quote.push(l.replace(/^>\s?/, "")); continue; }
    // a run of 3 or more field lines (a blank line or a quote may not break it)
    if (FIELD.test(l)) {
      let j = i; const run = [];
      while (j < L.length) { const t = L[j].trim(), m = t.match(FIELD); if (!t || !m || /^Then$/i.test(m[1])) break; run.push(m); j++; }
      if (run.length >= 3) {
        flush();
        for (const m of run) {
          let value = m[2].trim(), note = "";
          const n = value.match(/^(.*?)\s+\(([^()]+)\)\s*$/); if (n && n[1]) { value = n[1].trim(); note = n[2].trim(); }
          if (!value && !note) { longLabel = cap(m[1]); continue; } // "About ........" over a quote: the long text's heading
          fields.push({ label: cap(m[1]), value: noPaths(value), ...(note ? { note: noPaths(note) } : {}) });
        }
        i = j - 1; continue;
      }
    }
    para.push(l);
  }
  flush();
  // the quote, as paragraphs: a bare ">" between them
  const long = []; let cur = [];
  for (const x of quote) { if (!x.trim()) { if (cur.length) long.push(cur.join(" ")); cur = []; } else cur.push(x.trim()); }
  if (cur.length) long.push(cur.join(" "));
  const shownLabels = (labels || options || []).map(String);
  const refers = REFERS.test(q) || (options || []).some((o) => REFERS.test(o));
  const drawn = pics.length > 0 || fields.length > 0 || long.length > 0;
  if (!drawn && !refers) return lead.length > 1 ? { lead } : null;
  const gone = pics.filter((p) => p.state !== "ok"), missing = gone.map((p) => p.name);
  const reword = refers && (gone.length > 0 || !drawn);
  const said = (names, what) => names.length ? `${names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0]} ${what(names.length > 1)}` : "";
  const warn = !drawn ? "This question mentions a preview, but none came with it. Ask the agent for it before you approve."
    : gone.length ? `Part of the preview couldn't be shown: ${[said(gone.filter((p) => p.state === "missing").map((p) => p.name), (n) => n ? "are missing" : "is missing"), said(gone.filter((p) => p.state === "outside").map((p) => p.name), () => "can't be shown")].filter(Boolean).join("; ")}. Check before you approve.` : "";
  const pictures = pics.length, details = fields.length;
  const away = drawn ? `Preview on your computer: ${[pictures ? `${pictures} picture${pictures > 1 ? "s" : ""}` : "", details ? `${details} detail${details > 1 ? "s" : ""}` : "", long.length && !pictures && !details ? "its text" : ""].filter(Boolean).join(", ")}. Open the Workdesk there to see it.` : "";
  return {
    ...(lead.length ? { lead } : {}),
    ...(drawn ? { heading: /\bcreat/i.test(q) ? "Preview · what will be created" : "Preview · what you're approving" } : {}),
    ...(pics.length ? { pics } : {}), ...(caption ? { caption } : {}), ...(fields.length ? { fields } : {}),
    ...(long.length ? { long: { label: longLabel, paras: long } } : {}), ...(files.length ? { files } : {}), ...(then.length ? { then } : {}),
    ...(warn ? { warn } : {}), ...(missing.length ? { missing } : {}), ...(!drawn ? { ask: ASK_PREVIEW } : {}), ...(away ? { away } : {}),
    ...(reword ? { shown: cap(dropShown(q)), labels: shownLabels.map((o) => cap(dropShown(o))) } : {}),
  };
}
// What the agent is told with the answer when part of its preview didn't reach the card.
const missingNote = (p) => (p && p.missing && p.missing.length ? `(the card couldn't show: ${p.missing.join(", ")})` : "");

export { REFERS, ASK_PREVIEW, previewOf, previewFile, picSize, missingNote, dropShown };
