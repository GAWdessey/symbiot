// Watches read through an API where the vault has the key (apiwatch.mjs): an inbox by IMAP, read-only
// (EXAMINE and BODY.PEEK: nothing marked read), and Trello by its REST API; any other watch, or one
// without its key, reads its page as before (23 Oct 2026). A fake IMAP server and a fake Trello.
//
//   node test/apiwatch.mjs
//
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-apiwatch-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_VAULT = "file";
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true }); writeFileSync(join(HOME, ".config", "symbiot", "config.json"), "{}");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const W = await import("../apiwatch.mjs");
// a small IMAP server: the commands it was sent, and three messages
const heard = [];
const srv = createServer((c) => {
  c.write("* OK fake IMAP ready\r\n"); let b = "";
  c.on("data", (d) => { b += d; let i; while ((i = b.indexOf("\r\n")) >= 0) { const line = b.slice(0, i); b = b.slice(i + 2); heard.push(line); const [tag, ...rest] = line.split(" "), cmd = rest.join(" ");
    if (/^LOGIN/.test(cmd)) c.write(/"pat@example.co.za" "abcdabcdabcdabcd"/.test(cmd) ? `${tag} OK logged in\r\n` : `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
    else if (/^EXAMINE INBOX/.test(cmd)) c.write(`* 3 EXISTS\r\n${tag} OK [READ-ONLY] done\r\n`);
    else if (/^UID SEARCH/.test(cmd)) c.write(`* SEARCH 101 102 103\r\n${tag} OK done\r\n`);
    else if (/^UID FETCH/.test(cmd)) {
      const h = (from, subj) => `From: ${from}\r\nSubject: ${subj}\r\nDate: Thu, 23 Oct 2026 09:00:00 +0200\r\n\r\n`;
      const msg = (n, uid, flags, hdr) => `* ${n} FETCH (UID ${uid} FLAGS (${flags}) BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {${Buffer.byteLength(hdr)}}\r\n${hdr})\r\n`;
      c.write(msg(1, 101, "\\Seen", h("Ann Lee <ann@example.com>", "Invoice for October")) + msg(2, 102, "", h('"Broker Desk" <desk@example.com>', "=?UTF-8?B?TWVldGluZyDinIUgbmV4dCB3ZWVr?=")) + msg(3, 103, "\\Seen \\Flagged", h("noreply@example.com", "Your code")) + `${tag} OK done\r\n`);
    } else if (/^LOGOUT/.test(cmd)) { c.write("* BYE\r\nz OK\r\n"); c.end(); }
  } });
}).listen(0);
await new Promise((r) => srv.on("listening", r));
const port = srv.address().port;
try {
  console.log("IMAP — the newest messages, who, what, read or not, and nothing marked read");
  const msgs = await W.readImap({ host: "127.0.0.1", port, tls: false, user: "pat@example.co.za", pass: "abcdabcdabcdabcd" });
  ok("newest first, with sender, subject (encoded words decoded) and whether it's been read", msgs.length === 3 && msgs[0].uid === 103 && msgs[1].subject === "Meeting ✅ next week" && msgs[1].from === '"Broker Desk" <desk@example.com>' && msgs[1].seen === false && msgs[2].seen === true, msgs);
  ok("read-only: the inbox examined (never selected), headers peeked, nothing stored", heard.some((l) => / EXAMINE INBOX$/.test(l)) && heard.some((l) => /BODY\.PEEK\[HEADER\.FIELDS \(FROM SUBJECT DATE\)\]/.test(l)) && !heard.some((l) => / (SELECT|STORE|EXPUNGE|COPY|MOVE) /.test(l)), heard);
  let err = null; try { await W.readImap({ host: "127.0.0.1", port, tls: false, user: "pat@example.co.za", pass: "wrong" }); } catch (e) { err = e.message; }
  ok("a wrong password says so", /Invalid credentials/.test(err || ""), err);

  console.log("WHICH WATCH READS HOW — from what's in the vault");
  const gmail = { url: "https://mail.google.com/mail/u/0/#inbox", title: "Inbox - pat@example.co.za - Mail" };
  ok("no key in the vault: the page, as before", W.apiReaderFor(gmail, { names: () => ["Twilio auth token"] }) === null && W.apiReaderFor({ url: "https://web.whatsapp.com" }, { names: () => ["Gmail app password (pat@example.co.za)"] }) === null);
  const rd = W.apiReaderFor(gmail, { names: () => ["Gmail app password (pat@example.co.za)"], get: () => "abcd abcd abcd abcd", imap: (o) => W.readImap({ ...o, host: "127.0.0.1", port, tls: false }) });
  const page = rd && await rd();
  ok("the inbox with its app password: read by IMAP, one line each, unread marked, a link to find it", page && page.via === "imap" && page.list.length === 3 && page.list[1].text === "Broker Desk — Meeting ✅ next week" && page.list[1].unread === 1 && !page.list[0].unread && /mail\.google\.com.*search/.test(page.list[1].href), page);
  const bad = await W.apiReaderFor(gmail, { names: () => ["Gmail app password (pat@example.co.za)"], get: () => "nope", imap: (o) => W.readImap({ ...o, host: "127.0.0.1", port, tls: false }) })();
  ok("…a refused password: the watch says to check the app password, never the page's sign-in", /Check the app password in the Vault/.test(bad.error || ""), bad);
  const calls = [], fakeTrello = async (url) => { calls.push(url); const u = new URL(url); const body = u.pathname.endsWith("/notifications") ? [{ type: "addedToCard", memberCreator: { fullName: "Sam Ray" }, data: { card: { name: "Launch checklist", shortLink: "ab12" } } }] : [{ name: "Send the quote", due: new Date(Date.now() + 86400000).toISOString(), shortUrl: "https://trello.com/c/cd34" }, { name: "Someday", due: null, shortUrl: "x" }]; return new Response(JSON.stringify(body), { status: 200 }); };
  const tr = W.apiReaderFor({ url: "https://trello.com/" }, { names: () => ["Trello API key", "Trello token"], get: (n) => (/key/i.test(n) ? "k1" : "t1"), fetchFn: fakeTrello });
  const tp = tr && await tr();
  ok("Trello: unread notifications and cards on you due soon, by its API with the key and token", tp && tp.via === "trello" && tp.list.length === 2 && /Sam Ray — added to card: Launch checklist/.test(tp.list[0].text) && /^Due \d{4}-\d\d-\d\d: Send the quote$/.test(tp.list[1].text) && calls.every((u) => /key=k1&token=t1/.test(u)), tp);
  const WM = await import("../watch.mjs");
  ok("no Trello key in the vault: no Trello watch", WM.ensureTrelloWatch({ names: () => [] }) === null);
  const tw = WM.ensureTrelloWatch({ names: () => ["Trello API key", "Trello token"] });
  ok("its key and token in the vault: a Trello watch, once", tw && tw.url === "https://trello.com/" && WM.ensureTrelloWatch({ names: () => ["Trello API key", "Trello token"] }).id === tw.id);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { srv.close(); rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} apiwatch: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
