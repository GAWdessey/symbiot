// symbiot — your email, without an API.
//
// Reads the mail a desktop client already keeps on this computer (Thunderbird,
// Apple Mail, Evolution, KMail, mutt/neomutt — any Maildir or mbox) or an
// exported .mbox (e.g. Google Takeout). No OAuth, no app registration, no
// password, no server: it works the same for anyone with mail on disk, which is
// how everyone else can link theirs too. Only headers are read (Date, From, To,
// Subject, Message-ID), never a message body — and only mail YOU sent, so a
// write-up gets "what I did over email", not your inbox. The one exception is a
// reply Symbiot waits on (inboxMail): it looks for that one, and keeps only it.
import { homedir } from "node:os";
import { join, basename, dirname } from "node:path";
import { readdirSync, statSync, openSync, readSync, closeSync, fstatSync } from "node:fs";

const TAIL_BYTES = 24 * 1024 * 1024; // an mbox appends: the newest mail is at the end
const HEAD_BYTES = 64 * 1024;        // enough for one message's headers
const MAX_FILES = 600;               // message files read per folder
const MAX_ITEMS = 80;
const WALK_MS = 8000;                // one folder walk
const READ_MS = 15000;               // everything, all sources
const SKIP_DIRS = new Set(["node_modules", ".git", "Attachments", "attachments", "cache2", "startupCache", "crashes", "minidumps", "storage", "datareporting", "extensions"]);
const NOT_MAIL = /\.(msf|dat|sqlite|sqlite-wal|sqlite-shm|json|plist|db|summary|cmeta|ibex|index|lock|log|txt|js|html|css|png|jpg|gif)$/i;
const SENTNAME = /^\.?sent\b/i; // Sent, Sent Mail, Sent Items, Sent Messages(.mbox), .Sent

// Bounded directory walk in plain JS (no `find`, so it also works on Windows).
function walk(root, { depth = 6, limit = 200, dirs = false, match, deadline = Date.now() + WALK_MS }) {
  const out = [];
  const go = (dir, d) => {
    if (out.length >= limit || Date.now() > deadline) return;
    let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= limit || Date.now() > deadline) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (dirs && match(e.name, p)) { out.push(p); continue; }
        if (d < depth && !SKIP_DIRS.has(e.name)) go(p, d + 1);
      } else if (!dirs && e.isFile() && match(e.name, p)) out.push(p);
    }
  };
  go(root, 0);
  return out;
}

// Where desktop mail clients keep sent mail, per OS. Returns [{ path, kind }].
export function detectMailSources() {
  const H = homedir(), out = [];
  const add = (kind, paths) => { for (const p of paths) if (!out.some((x) => x.path === p)) out.push({ path: p, kind }); };
  const sentFile = (n) => SENTNAME.test(n) && !NOT_MAIL.test(n);
  const tb = process.platform === "darwin" ? [join(H, "Library/Thunderbird/Profiles")]
    : process.platform === "win32" ? [join(process.env.APPDATA || join(H, "AppData/Roaming"), "Thunderbird/Profiles")]
    : [join(H, ".thunderbird"), join(H, "snap/thunderbird/common/.thunderbird"), join(H, ".var/app/org.mozilla.Thunderbird/.thunderbird")];
  for (const r of tb) add("Thunderbird", walk(r, { depth: 6, limit: 12, match: sentFile })); // mbox files: Mail/…/Sent, ImapMail/…/Sent Mail
  if (process.platform === "darwin") add("Apple Mail", walk(join(H, "Library/Mail"), { depth: 4, limit: 12, dirs: true, match: (n) => SENTNAME.test(n) && /\.mbox$/i.test(n) }));
  if (process.platform === "linux") {
    for (const r of [join(H, ".local/share/evolution/mail"), join(H, ".cache/evolution/mail")]) add("Evolution", walk(r, { depth: 5, limit: 8, dirs: true, match: (n) => SENTNAME.test(n) }));
    add("KMail", walk(join(H, ".local/share/local-mail"), { depth: 3, limit: 4, dirs: true, match: (n) => SENTNAME.test(n) }));
  }
  for (const r of [join(H, "Maildir"), join(H, "mail"), join(H, "Mail"), join(H, ".mail")]) {
    add("Maildir", walk(r, { depth: 3, limit: 6, dirs: true, match: (n) => SENTNAME.test(n) }));
    add("mbox", walk(r, { depth: 3, limit: 6, match: sentFile }));
  }
  return out.slice(0, 24);
}

function readChunk(file, bytes, fromEnd) {
  let fd;
  try {
    fd = openSync(file, "r");
    const size = fstatSync(fd).size, len = Math.min(bytes, size), buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, fromEnd ? size - len : 0);
    return { text: buf.toString("utf8"), partial: fromEnd && size > len };
  } catch { return { text: "", partial: false }; }
  finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
}
// RFC 5322 header block -> { lowercased name: first value }, folded lines joined.
export function parseHeaders(raw) {
  const s = String(raw || ""), end = s.search(/\r?\n\r?\n/);
  const head = (end >= 0 ? s.slice(0, end) : s).replace(/\r?\n[ \t]+/g, " ");
  const h = {};
  for (const line of head.split(/\r?\n/)) {
    const i = line.indexOf(":"); if (i <= 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(); if (!(k in h)) h[k] = line.slice(i + 1).trim();
  }
  return h;
}
// RFC 2047 encoded words: =?UTF-8?B?…?= / =?iso-8859-1?Q?…?=
export function decodeWords(s) {
  return String(s || "").replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=(?:\s+(?==\?))?/g, (all, cs, enc, txt) => {
    try {
      const buf = /b/i.test(enc) ? Buffer.from(txt, "base64")
        : Buffer.from(txt.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (x, hx) => String.fromCharCode(parseInt(hx, 16))), "latin1");
      return new TextDecoder(/^(utf-?8|us-ascii)$/i.test(cs) ? "utf-8" : cs.replace(/\*.*$/, "").toLowerCase()).decode(buf);
    } catch { return all; }
  });
}
// "Ann <a@x.com>, b@y.com" -> [{ name, addr }]
export function people(v) {
  const out = [];
  for (const part of decodeWords(v).split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const m = part.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
    const addr = (m ? m[2] : part).trim().toLowerCase();
    if (addr.includes("@")) out.push({ name: m ? m[1].trim() : "", addr });
  }
  return out;
}
function toItem(h, fallbackTs) {
  if (parseInt(h["x-mozilla-status"] || "0", 16) & 0x0008) return null; // Thunderbird: deleted, not yet compacted away
  const ts = Date.parse(String(h.date || "").replace(/\s*\([^)]*\)\s*$/, "")) || fallbackTs || 0;
  return {
    ts, id: String(h["message-id"] || "").trim(), labels: String(h["x-gmail-labels"] || ""),
    from: people(h.from || "")[0] || null, to: people([h.to, h.cc].filter(Boolean).join(", ")),
    subject: decodeWords(h.subject || "").replace(/\s+/g, " ").trim().slice(0, 200) || "(no subject)",
    refs: [h["in-reply-to"], h.references].filter(Boolean).join(" ").slice(0, 2000),
  };
}
// One mbox file: read its tail, split on the "From " separator lines.
function readMbox(file) {
  const { text, partial } = readChunk(file, TAIL_BYTES, true);
  const parts = text.split(/\r?\n(?=From )/);
  if (partial) parts.shift(); // starts mid-message
  return parts.map((p) => toItem(parseHeaders(p.replace(/^From [^\n]*\n/, "")), 0)).filter(Boolean);
}
// A folder of one-file-per-message mail: Maildir cur/new, .eml, Apple Mail .emlx.
function readMailDir(dir, since, deadline) {
  const msg = (n, p) => !n.startsWith(".") && !NOT_MAIL.test(n) && (/\.(eml|emlx)$/i.test(n) || /^(cur|new)$/.test(basename(dirname(p))) || /[\\/](cur|new)[\\/]/.test(p.slice(dir.length)));
  const recent = (p) => { try { return statSync(p).mtimeMs >= since - 86400000; } catch { return false; } };
  const files = walk(dir, { depth: 8, limit: MAX_FILES, deadline: Math.min(deadline, Date.now() + WALK_MS), match: (n, p) => msg(n, p) && recent(p) });
  return files.map((f) => {
    const t = readChunk(f, HEAD_BYTES, false).text.replace(/^\d+[ \t]*\r?\n/, ""); // .emlx starts with a byte count
    let mt = 0; try { mt = statSync(f).mtimeMs; } catch {}
    return toItem(parseHeaders(t), mt);
  }).filter(Boolean);
}
const sentLabel = (l) => /(^|,)\s*"?sent"?\s*(,|$)/i.test(l); // Google Takeout's X-Gmail-Labels

// Mail you sent in the last `days`: from the detected sources plus any you added.
// Mail in a Sent folder is yours; elsewhere (e.g. a whole-mailbox export) it
// counts only with Gmail's Sent label or a From matching one of `addresses`.
export function mailActivity({ days = 7, sources = [], addresses = [], auto = true } = {}) {
  const now = Date.now(), since = now - days * 86400000, deadline = now + READ_MS;
  const me = new Set(addresses.map((a) => String(a).trim().toLowerCase()).filter(Boolean));
  const paths = [...new Set([...(auto ? detectMailSources().map((s) => s.path) : []), ...sources])];
  const seen = new Set(), items = [];
  for (const p of paths) {
    if (Date.now() > deadline) break;
    let st; try { st = statSync(p); } catch { continue; }
    if (!st.isDirectory() && st.mtimeMs < since) continue; // nothing appended in the window
    const sentSrc = SENTNAME.test(basename(p));
    for (const m of st.isDirectory() ? readMailDir(p, since, deadline) : readMbox(p)) {
      if (m.ts < since || m.ts > now + 86400000) continue;
      if (!(sentSrc || sentLabel(m.labels) || (m.from && me.has(m.from.addr)))) continue;
      const k = m.id || m.ts + "|" + m.subject; if (seen.has(k)) continue; seen.add(k);
      items.push({ ts: m.ts, date: new Date(m.ts).toISOString().slice(0, 10), to: m.to.slice(0, 3).map((x) => x.name || x.addr), subject: m.subject, source: p });
    }
  }
  return items.sort((a, b) => b.ts - a.ts).slice(0, MAX_ITEMS);
}

// ---- replies you're waiting on ----------------------------------------------------
// The inbox beside a Sent folder: Thunderbird keeps an IMAP account's subfolders
// (Sent among them) in INBOX.sbd/ next to its INBOX file; other stores keep an
// INBOX or Inbox next to Sent. "" when there's none.
export function inboxOf(sent) {
  const dir = dirname(String(sent || "")), up = /\.sbd$/i.test(dir) ? dir.replace(/\.sbd$/i, "") : "";
  for (const p of [up, join(dir, "INBOX"), join(dir, "Inbox"), join(dir, ".INBOX"), join(dir, "Inbox.mbox")]) { try { if (p && statSync(p)) return p; } catch {} }
  return "";
}
// Mail that came into those inboxes since `since`, headers only: [{ ts, from,
// subject, refs }]. Only for handback.mjs, which waits on a reply to an email you
// (or an agent) sent and keeps only the one that answers it; nothing else is kept.
export function inboxMail({ since = Date.now() - 7 * 86400000, sources = [], auto = true } = {}) {
  const deadline = Date.now() + READ_MS, out = [];
  const inboxes = [...new Set([...(auto ? detectMailSources().map((s) => s.path) : []), ...sources].map(inboxOf).filter(Boolean))];
  for (const p of inboxes) {
    if (Date.now() > deadline) break;
    let st; try { st = statSync(p); } catch { continue; }
    if (!st.isDirectory() && st.mtimeMs < since) continue;
    for (const m of st.isDirectory() ? readMailDir(p, since, deadline) : readMbox(p)) if (m.ts >= since) out.push({ ts: m.ts, from: m.from, subject: m.subject, refs: m.refs, source: p });
  }
  return out.sort((a, b) => b.ts - a.ts);
}
