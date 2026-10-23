// symbiot — watches read through an API, not off the page. A watch reads its page in Symbiot's hidden
// browser and an AI or a parser picks the lines out (watch.mjs), which breaks when a layout or a sign-in
// changes, and Google's sign-ins don't hold in that browser at all. Where a service has a way in that
// doesn't need its page, and you've put its key in the vault, the watch uses that instead:
// - mail (a Gmail or Google Workspace inbox): IMAP with an app password. Read-only: the inbox is opened
//   with EXAMINE and messages read with BODY.PEEK, so nothing is marked read; only who, what and when.
//   The vault's "Gmail app password (you@domain)" (Google account → Security → App passwords).
// - Trello: its REST API, with the vault's "Trello API key" and "Trello token" (trello.com/app-key):
//   unread notifications, and the open cards on you that are due soon.
// Each returns what a page read would ({ list: [{ text, href?, unread? }], via }) or null to read the page.
import { connect as tlsConnect } from "node:tls";
import { connect as netConnect } from "node:net";
import { listSecrets, getSecret } from "./vault.mjs";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
const hostOf = (u) => { try { return new URL(/^https?:/.test(u) ? u : "https://" + u).hostname.replace(/^www\./, ""); } catch { return ""; } };

// ---- IMAP: just enough to list an inbox's newest messages ------------------------------------
// A response reader that knows IMAP's literals ({n}\r\n then n bytes), one tagged command at a time.
function imapSession({ host, port = 993, tls = true, timeout = 20000, connect = null }) {
  return new Promise((resolve, reject) => {
    const sock = connect ? connect() : tls ? tlsConnect({ host, port, servername: host }) : netConnect({ host, port });
    let buf = Buffer.alloc(0), waiting = null, n = 0, greeted = false;
    const fail = (e) => { try { sock.destroy(); } catch {} if (waiting) { waiting.reject(e); waiting = null; } else reject(e); };
    sock.setTimeout(timeout, () => fail(new Error("IMAP: no answer")));
    sock.on("error", fail);
    // a whole response: lines, with each literal's bytes kept in place
    const take = () => {
      for (;;) {
        if (!greeted) { const i = buf.indexOf("\r\n"); if (i < 0) return; const line = buf.subarray(0, i).toString("utf8"); buf = buf.subarray(i + 2); greeted = true; if (!/^\* (OK|PREAUTH)/i.test(line)) return fail(new Error("IMAP: " + line)); resolve(api); continue; }
        if (!waiting) return;
        let pos = 0, text = "";
        for (;;) {
          const i = buf.indexOf("\r\n", pos); if (i < 0) return;
          const line = buf.subarray(pos, i).toString("utf8"), lit = line.match(/\{(\d+)\}$/);
          if (lit) { const len = +lit[1]; if (buf.length < i + 2 + len) return; text += line + "\r\n" + buf.subarray(i + 2, i + 2 + len).toString("utf8"); pos = i + 2 + len; continue; }
          text += line + "\r\n"; pos = i + 2;
          if (line.startsWith(waiting.tag + " ")) { buf = buf.subarray(pos); const w = waiting; waiting = null; if (/^\S+ OK/i.test(line)) w.resolve(text); else w.reject(new Error("IMAP: " + line.replace(/^\S+\s+/, ""))); break; }
        }
      }
    };
    sock.on("data", (d) => { buf = Buffer.concat([buf, d]); take(); });
    const api = {
      cmd: (c) => new Promise((res, rej) => { const tag = "s" + (++n); waiting = { tag, resolve: res, reject: rej }; sock.write(`${tag} ${c}\r\n`); take(); }),
      close: () => { try { sock.write("z LOGOUT\r\n"); sock.end(); } catch {} },
    };
  });
}
const q = (s) => '"' + String(s).replace(/(["\\])/g, "\\$1") + '"';
// =?UTF-8?B?…?= and =?…?Q?…?= in a header, as text.
function decodeWords(s) {
  return String(s || "").replace(/\?=\s+=\?/g, "?==?").replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, t) => {
    try { const b = /b/i.test(enc) ? Buffer.from(t, "base64") : Buffer.from(t.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))), "latin1"); return new TextDecoder(/utf-?8/i.test(cs) ? "utf-8" : cs.toLowerCase()).decode(b); } catch { return t; }
  });
}
// The FETCH responses: [{ uid, seen, from, subject, date }].
function parseFetch(text) {
  const out = [];
  for (const part of String(text).split(/^\* \d+ FETCH /m).slice(1)) {
    const uid = (part.match(/UID (\d+)/) || [])[1], flags = (part.match(/FLAGS \(([^)]*)\)/) || [])[1] || "";
    const hdr = (h) => { const m = part.match(new RegExp(`^${h}:\\s*((?:.*)(?:\\r?\\n[ \\t].*)*)`, "mi")); return m ? decodeWords(m[1].replace(/\r?\n[ \t]+/g, " ").trim()) : ""; };
    if (uid) out.push({ uid: +uid, seen: /\\Seen/i.test(flags), from: hdr("From"), subject: hdr("Subject"), date: hdr("Date") });
  }
  return out;
}
// The inbox's newest `count` messages, newest first, read-only.
async function readImap({ host = "imap.gmail.com", port = 993, tls = true, user, pass, count = 25, connect = null }) {
  const s = await imapSession({ host, port, tls, connect });
  try {
    await s.cmd(`LOGIN ${q(user)} ${q(pass)}`);
    await s.cmd("EXAMINE INBOX");
    const found = await s.cmd("UID SEARCH ALL"), uids = ((found.match(/^\* SEARCH([\d ]*)$/m) || [])[1] || "").trim().split(/\s+/).filter(Boolean).map(Number).slice(-count);
    if (!uids.length) return [];
    const got = await s.cmd(`UID FETCH ${uids.join(",")} (UID FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])`);
    return parseFetch(got).sort((a, b) => b.uid - a.uid);
  } finally { s.close(); }
}
const nameOf = (from) => { const m = String(from).match(/^"?([^"<]+?)"?\s*<[^>]+>$/); return (m ? m[1] : String(from).replace(/[<>]/g, "")).trim(); };

// ---- which watch reads how ---------------------------------------------------------------------
// The vault's entry for a key, by what its name says (values never leave here except to the service).
const findSecret = (rx, names = () => listSecrets().map((s) => s.name)) => names().find((n) => rx.test(n)) || "";
// A reader for this watch from what's in the vault, or null (it reads the page, as before).
function apiReaderFor(w, { names, get = (n) => { const r = getSecret(n); return r && r.ok ? r.value : ""; }, imap = readImap, fetchFn = fetch } = {}) {
  const host = hostOf(w && w.url), all = names || (() => listSecrets().map((s) => s.name));
  if (host === "mail.google.com") {
    const name = findSecret(/\b(?:gmail|google|imap|mail)\b.*\bapp[ -]?password\b/i, all); if (!name) return null;
    const user = (name.match(EMAIL) || String((w && w.title) || "").match(EMAIL) || [])[0]; if (!user) return null;
    return async () => {
      const pass = String(get(name) || "").replace(/\s+/g, ""); if (!pass) return null;
      try {
        const msgs = await imap({ host: "imap.gmail.com", user, pass });
        return { url: w.url, via: "imap", list: msgs.map((m) => ({ text: `${nameOf(m.from)} — ${m.subject || "(no subject)"}`, href: `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`subject:"${String(m.subject || "").slice(0, 80)}"`)}`, ...(m.seen ? {} : { unread: 1 }) })) };
      } catch (e) { return { url: w.url, via: "imap", error: `Couldn't read ${user}'s inbox by IMAP: ${String((e && e.message) || e).replace(/^IMAP:\s*/, "")}. Check the app password in the Vault.` }; }
    };
  }
  if (host === "trello.com") {
    const k = findSecret(/\btrello\b.*\b(?:api )?key\b/i, all), t = findSecret(/\btrello\b.*\btoken\b/i, all); if (!k || !t) return null;
    return async () => {
      const key = get(k), token = get(t); if (!key || !token) return null;
      const call = async (path) => { const r = await fetchFn(`https://api.trello.com/1/${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`Trello answered ${r.status}`); return r.json(); };
      try {
        const [notes, cards] = await Promise.all([call("members/me/notifications?read_filter=unread&limit=30"), call("members/me/cards?filter=open&fields=name,due,shortUrl,dateLastActivity")]);
        const soon = Date.now() + 3 * 86400000;
        const list = [
          ...notes.map((x) => ({ text: `${(x.memberCreator && x.memberCreator.fullName) || "Trello"} — ${String(x.type || "").replace(/([A-Z])/g, " $1").toLowerCase().trim()}: ${(x.data && x.data.card && x.data.card.name) || (x.data && x.data.board && x.data.board.name) || ""}`.trim(), unread: 1, ...(x.data && x.data.card && x.data.card.shortLink ? { href: `https://trello.com/c/${x.data.card.shortLink}` } : {}) })),
          ...cards.filter((c) => c.due && Date.parse(c.due) < soon).map((c) => ({ text: `Due ${new Date(c.due).toISOString().slice(0, 10)}: ${c.name}`, href: c.shortUrl, unread: 1 })),
        ];
        return { url: w.url, via: "trello", list };
      } catch (e) { return { url: w.url, via: "trello", error: `Couldn't read Trello: ${String((e && e.message) || e)}. Check the key and token in the Vault.` }; }
    };
  }
  return null;
}

export { readImap, imapSession, parseFetch, decodeWords, apiReaderFor };
