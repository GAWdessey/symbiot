// symbiot — the computer says it's here on your network (multicast DNS, the way
// printers and AirPlay are found), so your phone finds it after the router hands
// it a new address, without pairing again (phone.mjs).
//
// announce() answers queries for _symbiot._tcp.local while the phone link is on:
// a neutral name ("Symbiot-1a2b", never this computer's hostname), its port, and
// a TXT record with the link key's fingerprint, which is how a paired phone knows
// it's its computer. browse() asks the network and gives what answers (the tests,
// and Symbiot in Termux, which has no Android discovery). Only node:dgram.
import { createSocket } from "node:dgram";

const GROUP = "224.0.0.251", PORT = 5353, SERVICE = "_symbiot._tcp.local", TTL = 120;
const T = { A: 1, PTR: 12, TXT: 16, SRV: 33, ANY: 255 };

// ---- DNS messages ------------------------------------------------------------------
function encName(name) {
  const parts = String(name).replace(/\.$/, "").split("."), out = [];
  for (const p of parts) { const b = Buffer.from(p, "utf8"); out.push(Buffer.from([Math.min(63, b.length)]), b.subarray(0, 63)); }
  out.push(Buffer.from([0]));
  return Buffer.concat(out);
}
function readName(buf, at, depth = 0) {
  const labels = []; let end = -1;
  for (let guard = 0; guard < 128; guard++) {
    if (at >= buf.length) throw new Error("short");
    const len = buf[at];
    if (len === 0) { at++; break; }
    if ((len & 0xc0) === 0xc0) {
      if (depth > 8) throw new Error("loop");
      const ptr = ((len & 0x3f) << 8) | buf[at + 1];
      if (end < 0) end = at + 2;
      labels.push(readName(buf, ptr, depth + 1).name); at = -1; break;
    }
    labels.push(buf.toString("utf8", at + 1, at + 1 + len)); at += 1 + len;
  }
  return { name: labels.filter(Boolean).join("."), next: end >= 0 ? end : at };
}
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
function encRecord({ name, type, ttl = TTL, flush = false, data }) {
  let rd;
  if (type === T.A) rd = Buffer.from(String(data).split(".").map(Number));
  else if (type === T.PTR) rd = encName(data);
  else if (type === T.SRV) rd = Buffer.concat([u16(0), u16(0), u16(data.port), encName(data.target)]);
  else if (type === T.TXT) rd = Buffer.concat(Object.entries(data).map(([k, v]) => { const s = Buffer.from(`${k}=${v}`, "utf8").subarray(0, 255); return Buffer.concat([Buffer.from([s.length]), s]); }));
  return Buffer.concat([encName(name), u16(type), u16((flush ? 0x8000 : 0) | 1), u32(ttl), u16(rd.length), rd]);
}
function encMessage({ id = 0, response = false, questions = [], answers = [], additionals = [] }) {
  const head = Buffer.concat([u16(id), u16(response ? 0x8400 : 0), u16(questions.length), u16(answers.length), u16(0), u16(additionals.length)]);
  return Buffer.concat([head, ...questions.map((q) => Buffer.concat([encName(q.name), u16(q.type), u16(q.unicast ? 0x8001 : 1)])), ...answers.map(encRecord), ...additionals.map(encRecord)]);
}
function decMessage(buf) {
  const id = buf.readUInt16BE(0), flags = buf.readUInt16BE(2), qd = buf.readUInt16BE(4), an = buf.readUInt16BE(6), ns = buf.readUInt16BE(8), ar = buf.readUInt16BE(10);
  let at = 12; const questions = [], records = [];
  for (let i = 0; i < qd; i++) { const n = readName(buf, at); at = n.next; questions.push({ name: n.name, type: buf.readUInt16BE(at), unicast: !!(buf.readUInt16BE(at + 2) & 0x8000) }); at += 4; }
  for (let i = 0; i < an + ns + ar; i++) {
    const n = readName(buf, at); at = n.next;
    const type = buf.readUInt16BE(at), ttl = buf.readUInt32BE(at + 4), len = buf.readUInt16BE(at + 8); at += 10;
    const rd = buf.subarray(at, at + len); let data = null;
    if (type === T.A && len === 4) data = [...rd].join(".");
    else if (type === T.PTR) data = readName(buf, at).name;
    else if (type === T.SRV) data = { port: rd.readUInt16BE(4), target: readName(buf, at + 6).name };
    else if (type === T.TXT) { data = {}; for (let j = 0; j < rd.length;) { const l = rd[j], s = rd.toString("utf8", j + 1, j + 1 + l), eq = s.indexOf("="); if (s) data[eq < 0 ? s : s.slice(0, eq)] = eq < 0 ? "" : s.slice(eq + 1); j += 1 + l; } }
    records.push({ name: n.name, type, ttl, data }); at += len;
  }
  return { id, response: !!(flags & 0x8000), questions, records };
}

// ---- the computer: answer while the link is on ------------------------------------------
// opts: { id (a few hex characters, from the fingerprint), port, fp, addresses: (asker) => [...] }.
// addresses gets the asking device's address (none for an announcement), so the answer
// carries only what that device can reach: RFC 6762 6.2's "the interface it came in on".
// Gives { stop() } (a goodbye, so phones forget it at once), or null where nothing
// can listen on 5353 (it's in use without sharing, or there's no network).
// (socket: a dgram-like factory, for the tests)
const udp = (o) => createSocket(o);
function announce({ id, port, fp, addresses }, { onError = () => {}, socket = udp } = {}) {
  const inst = `Symbiot-${id}.${SERVICE}`, host = `symbiot-${id}.local`;
  const records = (ttl = TTL, asker) => {
    const ips = addresses(asker);
    return { answers: [{ name: SERVICE, type: T.PTR, ttl, data: inst }],
      additionals: [{ name: inst, type: T.SRV, ttl, flush: true, data: { port, target: host } }, { name: inst, type: T.TXT, ttl, flush: true, data: { v: 1, fp } },
        ...ips.map((ip) => ({ name: host, type: T.A, ttl, flush: true, data: ip }))] };
  };
  const ours = (q) => { const n = q.name.toLowerCase(); return (n === SERVICE.toLowerCase() && (q.type === T.PTR || q.type === T.ANY)) || (n === inst.toLowerCase() && [T.SRV, T.TXT, T.ANY].includes(q.type)) || (n === host && [T.A, T.ANY].includes(q.type)); };
  let sock; try { sock = socket({ type: "udp4", reuseAddr: true }); } catch (e) { onError(e); return null; }
  let closed = false;
  const send = (msg, port_ = PORT, to = GROUP) => { if (!closed) try { sock.send(msg, port_, to); } catch {} };
  sock.on("error", (e) => { onError(e); try { sock.close(); } catch {} closed = true; });
  sock.on("message", (buf, from) => {
    let m; try { m = decMessage(buf); } catch { return; }
    if (m.response || !m.questions.some(ours)) return;
    const legacy = from.port !== PORT; // a one-shot query from any port: answered to it directly (RFC 6762 6.7)
    const msg = encMessage({ id: legacy ? m.id : 0, response: true, questions: legacy ? m.questions.filter(ours) : [], ...records(legacy ? 10 : TTL, from.address) });
    if (legacy || m.questions.some((q) => q.unicast)) send(msg, from.port, from.address); else send(msg);
  });
  sock.bind(PORT, () => {
    try { sock.setMulticastTTL(255); sock.setMulticastLoopback(true); } catch {}
    const ips = addresses(); let joined = 0;
    for (const ip of ips) try { sock.addMembership(GROUP, ip); joined++; } catch {}
    if (!joined) try { sock.addMembership(GROUP); } catch (e) { onError(e); }
    // say it's here, twice a second apart, as RFC 6762 8.3 asks
    send(encMessage({ response: true, ...records() })); setTimeout(() => send(encMessage({ response: true, ...records() })), 1000).unref();
  });
  sock.unref();
  return { stop() { if (closed) return; send(encMessage({ response: true, ...records(0) })); setTimeout(() => { closed = true; try { sock.close(); } catch {} }, 50); } };
}

// ---- the phone (and the tests): who answers -------------------------------------------
// [{ name, host, port, addresses, fp }] after `timeout` ms. Asked from a passing
// port, so answers come straight back here and nothing else needs 5353.
function browse({ timeout = 2500, iface, socket = udp } = {}) {
  return new Promise((resolve) => {
    const found = new Map(); let sock;
    try { sock = socket({ type: "udp4" }); } catch { return resolve([]); }
    const done = () => { try { sock.close(); } catch {} resolve([...found.values()].filter((x) => x.port && x.addresses.length)); };
    sock.on("error", done);
    sock.on("message", (buf) => {
      let m; try { m = decMessage(buf); } catch { return; }
      if (!m.response) return;
      const recs = m.records;
      for (const p of recs.filter((r) => r.type === T.PTR && r.name.toLowerCase() === SERVICE.toLowerCase())) {
        const inst = p.data, srv = recs.find((r) => r.type === T.SRV && r.name === inst), txt = recs.find((r) => r.type === T.TXT && r.name === inst);
        if (!srv) continue;
        const addrs = recs.filter((r) => r.type === T.A && r.name.toLowerCase() === srv.data.target.toLowerCase()).map((r) => r.data);
        found.set(inst, { name: inst.split(".")[0], host: srv.data.target, port: srv.data.port, addresses: addrs, fp: (txt && txt.data && txt.data.fp) || "" });
      }
    });
    sock.bind(0, () => {
      try { sock.setMulticastLoopback(true); if (iface) sock.setMulticastInterface(iface); } catch {}
      try { sock.send(encMessage({ id: Math.floor(Math.random() * 65535), questions: [{ name: SERVICE, type: T.PTR }] }), PORT, GROUP); } catch { return done(); }
      setTimeout(done, timeout);
    });
  });
}

export { announce, browse, encMessage, decMessage, SERVICE, T };
