// symbiot relay on Cloudflare: a Worker, and a Durable Object per pair that holds
// the computer's line (relay/README.md says how it's deployed). The computer's
// WebSocket hibernates between messages, so a pair that's quiet costs nothing; its
// keep-alive ping is answered without waking it.
//
//   POST /v1/<id>/ask       a phone's sealed request -> { s, b }, the computer's
//                           sealed answer; 503 { away } when no computer holds <id>
//   GET  /v1/<id>/computer  the computer's line (WebSocket): first { hello: secret },
//                           then { rid, body } down, { rid, s, b } up
import { LIMITS, ID, provesId, limiter } from "./core.mjs";

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default {
  async fetch(req, env) {
    const u = new URL(req.url), m = u.pathname.match(/^\/v1\/([^/]+)\/(ask|computer)$/);
    if (u.pathname === "/") return new Response("symbiot relay: it passes sealed messages between a phone and its computer, and can't read them.\n");
    if (!m || !ID.test(m[1])) return json(404, { error: "not found" });
    return env.PAIRS.get(env.PAIRS.idFromName(m[1])).fetch(req);
  },
};

export class PairObject {
  constructor(state) {
    this.state = state;
    this.waiting = new Map(); // rid -> resolve, while a phone's request waits
    this.allow = limiter();
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"ping":1}', '{"pong":1}'));
  }
  computer() { return this.state.getWebSockets().find((ws) => { try { return (ws.deserializeAttachment() || {}).ok; } catch { return false; } }); }
  async fetch(req) {
    const u = new URL(req.url), [, id, what] = u.pathname.match(/^\/v1\/([^/]+)\/(ask|computer)$/);
    if (what === "computer") {
      if (req.headers.get("upgrade") !== "websocket") return json(426, { error: "a WebSocket" });
      // a line that hasn't shown the secret yet holds nothing; more than a few are dropped
      const unproven = this.state.getWebSockets().filter((ws) => { try { return !(ws.deserializeAttachment() || {}).ok; } catch { return true; } });
      for (const ws of unproven.slice(0, Math.max(0, unproven.length - 2))) try { ws.close(1008, "too many"); } catch {}
      const { 0: client, 1: server } = new WebSocketPair();
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ id, ok: false });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (req.method !== "POST") return json(405, { error: "POST" });
    if (!this.allow()) return json(429, { error: "Too many requests: wait a minute." });
    const body = await req.text();
    if (body.length > LIMITS.body) return json(413, { error: "too big" });
    const ws = this.computer();
    if (!ws) return json(503, { away: true, error: "Your computer isn't connected to the relay (it may be off, asleep or offline)." });
    if (this.waiting.size >= LIMITS.waiting) return json(429, { error: "Too many requests waiting." });
    let env; try { env = JSON.parse(body); } catch { return json(400, { error: "not JSON" }); }
    const rid = crypto.randomUUID();
    const answer = new Promise((resolve) => { this.waiting.set(rid, resolve); setTimeout(() => resolve(null), LIMITS.wait); });
    try { ws.send(JSON.stringify({ rid, body: env })); } catch { this.waiting.delete(rid); return json(503, { away: true }); }
    const a = await answer; this.waiting.delete(rid);
    return a ? json(200, { s: a.s, b: a.b }) : json(504, { away: true, error: "Your computer didn't answer in time." });
  }
  async webSocketMessage(ws, msg) {
    if (typeof msg !== "string" || msg.length > LIMITS.body) return;
    let m; try { m = JSON.parse(msg); } catch { return; }
    const at = ws.deserializeAttachment() || {};
    if (!at.ok) {
      if (!(await provesId(at.id, m.hello))) { ws.send(JSON.stringify({ error: "That isn't this pair's computer." })); ws.close(1008, "not this pair"); return; }
      for (const other of this.state.getWebSockets()) if (other !== ws) try { other.close(1000, "replaced"); } catch {} // a computer that reconnected: the new line
      ws.serializeAttachment({ ...at, ok: true });
      ws.send(JSON.stringify({ ready: true }));
      return;
    }
    if (m.rid && this.waiting.has(m.rid)) this.waiting.get(m.rid)({ s: m.s, b: m.b });
  }
  async webSocketClose(ws) { try { ws.close(); } catch {} }
}
