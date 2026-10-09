#!/usr/bin/env node
// symbiot relay on Node: the same relay as worker.mjs, for the tests and for anyone
// who'd rather run it on a server of their own (node relay/server.mjs, PORT to
// choose the port; put HTTPS in front of it). Only node:http and node:crypto: its
// WebSocket is the few frames the computer's line needs.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { LIMITS, ID, provesId, limiter } from "./core.mjs";

// ---- a WebSocket, server side: text frames, ping/pong, close -----------------------------
function frame(op, data) {
  const p = Buffer.from(data), n = p.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x80 | op, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
  return Buffer.concat([head, p]);
}
function upgrade(req, socket, onOpen) {
  const key = req.headers["sec-websocket-key"];
  if (!key || String(req.headers.upgrade || "").toLowerCase() !== "websocket") { socket.end("HTTP/1.1 426 Upgrade Required\r\n\r\n"); return; }
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64") + "\r\n\r\n");
  const ws = { open: true, onmessage: () => {}, onclose: () => {},
    send(t) { if (ws.open) try { socket.write(frame(1, t)); } catch {} },
    close() { if (!ws.open) return; ws.open = false; try { socket.end(frame(8, Buffer.alloc(0))); } catch {} ws.onclose(); } };
  let buf = Buffer.alloc(0), parts = [];
  socket.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > LIMITS.body * 2) return ws.close();
      if (buf.length < off + (masked ? 4 : 0) + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null; off += masked ? 4 : 0;
      const p = Buffer.from(buf.subarray(off, off + len)); buf = buf.subarray(off + len);
      if (mask) for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
      if (op === 8) return ws.close();
      if (op === 9) { try { socket.write(frame(10, p)); } catch {} continue; }
      if (op === 1 || op === 0) { parts.push(p); if (fin) { const t = Buffer.concat(parts).toString("utf8"); parts = []; ws.onmessage(t); } }
    }
  });
  socket.on("close", () => { if (ws.open) { ws.open = false; ws.onclose(); } });
  socket.on("error", () => {});
  onOpen(ws);
}

// ---- the relay ------------------------------------------------------------------------
// tap(kind, text): every message as it passes, for the tests (they check it's sealed).
function startRelay({ port = 0, host = "127.0.0.1", tap = null } = {}) {
  const pairs = new Map(); // id -> { ws, waiting: Map(rid -> resolve), allow }
  const pairOf = (id) => { if (!pairs.has(id)) pairs.set(id, { ws: null, waiting: new Map(), allow: limiter() }); return pairs.get(id); };
  const send = (res, status, obj) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };
  const srv = createServer((req, res) => {
    const u = new URL(req.url, "http://relay"), m = u.pathname.match(/^\/v1\/([^/]+)\/ask$/);
    if (u.pathname === "/") { res.end("symbiot relay: it passes sealed messages between a phone and its computer, and can't read them.\n"); return; }
    if (!m || !ID.test(m[1]) || req.method !== "POST") return send(res, 404, { error: "not found" });
    const pair = pairs.get(m[1]);
    if (pair && !pair.allow()) return send(res, 429, { error: "Too many requests: wait a minute." });
    let body = ""; req.on("data", (d) => { body += d; if (body.length > LIMITS.body) req.destroy(); });
    req.on("end", () => {
      if (tap) tap("ask", body);
      if (!pair || !pair.ws) return send(res, 503, { away: true, error: "Your computer isn't connected to the relay (it may be off, asleep or offline)." });
      if (pair.waiting.size >= LIMITS.waiting) return send(res, 429, { error: "Too many requests waiting." });
      let env; try { env = JSON.parse(body); } catch { return send(res, 400, { error: "not JSON" }); }
      const rid = randomUUID();
      const t = setTimeout(() => { pair.waiting.delete(rid); send(res, 504, { away: true, error: "Your computer didn't answer in time." }); }, LIMITS.wait);
      pair.waiting.set(rid, (a) => { clearTimeout(t); pair.waiting.delete(rid); send(res, 200, { s: a.s, b: a.b }); });
      pair.ws.send(JSON.stringify({ rid, body: env }));
    });
  });
  srv.on("upgrade", (req, socket) => {
    const m = new URL(req.url, "http://relay").pathname.match(/^\/v1\/([^/]+)\/computer$/);
    if (!m || !ID.test(m[1])) { socket.end("HTTP/1.1 404 Not Found\r\n\r\n"); return; }
    const id = m[1];
    upgrade(req, socket, (ws) => {
      let ok = false;
      ws.onmessage = async (t) => {
        if (tap) tap("computer", t);
        let msg; try { msg = JSON.parse(t); } catch { return; }
        if (msg.ping) return ws.send('{"pong":1}');
        if (!ok) {
          if (!(await provesId(id, msg.hello))) { ws.send(JSON.stringify({ error: "That isn't this pair's computer." })); return ws.close(); }
          ok = true; const p = pairOf(id); if (p.ws && p.ws !== ws) p.ws.close(); p.ws = ws; ws.send(JSON.stringify({ ready: true }));
          return;
        }
        const p = pairs.get(id); if (msg.rid && p && p.waiting.has(msg.rid)) p.waiting.get(msg.rid)({ s: msg.s, b: msg.b });
      };
      ws.onclose = () => { const p = pairs.get(id); if (p && p.ws === ws) p.ws = null; };
    });
  });
  return new Promise((resolve) => srv.listen(port, host, () => resolve({ port: srv.address().port, close: () => { for (const p of pairs.values()) if (p.ws) p.ws.close(); srv.closeAllConnections && srv.closeAllConnections(); srv.close(); } })));
}

export { startRelay };

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const r = await startRelay({ port: Number(process.env.PORT) || 8787, host: process.env.HOST || "0.0.0.0" });
  console.log(`symbiot relay on :${r.port}`);
}
