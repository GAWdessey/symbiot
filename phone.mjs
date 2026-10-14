// symbiot — Your phone: what Symbiot on your computer has (your tasks, what needs
// you, agents' questions, what Watch found) on your phone, through the Symbiot
// there (the Android app, or Symbiot in Termux), and the few things you do from
// it (add and tick tasks, answer agents, approve) sent back.
//
// The computer: switched on in Settings (or Setup), it listens on your network
// (port 7392) for just this: pairing, with a 6-digit code (or its QR) shown for 10
// minutes, and sealed requests from a phone that paired. The app itself stays on
// 127.0.0.1, and nothing here reaches its API: a phone gets what's new, a copy of
// your work, and a short list of changes (PHONE_OPS), each checked again here.
// It also says it's here on the network (mdns.mjs), so a phone finds it after the
// router hands it a new address, and, with a phone paired, keeps a line open to the
// relay (relay/), so the phone reaches it away from home.
// The phone: paired once, it asks every 2 minutes while it runs (sooner after a
// failed try, and at once when its network changes), notifies what's new, keeps the
// copy (computer.json) to show with the computer off, and queues what you change
// meanwhile (phone-queue.json), sent in order once the computer is back.
//
// Sealed: at pairing the two agree a key (X25519, then HKDF), and every request and
// answer after is AES-256-GCM with it, stamped so it can't be replayed. The relay,
// and anyone on your Wi-Fi, see only that. The QR carries the computer key's
// fingerprint, so a scan can't pair with a stand-in.
//
// config.phoneLink = { on, port?, relay?: false to keep it to your Wi-Fi, pub,
//   phones: [{ id, name, hash (of its token), pub, added }], gone: [{ id, pub, at }] }
// config.phoneSecret = { priv } (secrets.json)            — the computer
// config.computer = { v: 2, url, urls, name, id, fp, pub, relay, relayUrl, since, offset, paired }
// config.computerSecret = { token, key } (secrets.json; on the Android app, sealed by
//   its Keystore instead and handed in at start: SYMBIOT_COMPUTER_SECRET)  — the phone
import { createServer } from "node:http";
import { hostname, networkInterfaces } from "node:os";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync, unlinkSync, statSync } from "node:fs";
import { randomBytes, randomInt, randomUUID, timingSafeEqual, createHash, generateKeyPairSync, createPublicKey, createPrivateKey, diffieHellman, hkdfSync, createCipheriv, createDecipheriv } from "node:crypto";
import { CONFIG_DIR, loadConfig, saveConfig, hasCmd, loadTasks, readState, writeJsonAtomic } from "./core.mjs";
import { newsAfter, newsNotice } from "./watch.mjs";
import { desktopNotify } from "./desktop.mjs";
import { announce, browse } from "./mdns.mjs";
import { qrSvg } from "./qr.mjs";

const PORT = 7392;
const CODE_MS = 10 * 60 * 1000, CODE_TRIES = 5;
const POLL_MS = 2 * 60 * 1000, BACKOFF = [15000, 30000, 60000]; // after a failed ask: sooner, then back to every 2 minutes
const SKEW_MS = 10 * 60 * 1000; // a request older (or newer) than this is refused: it could be a replay
const ANDROID_APP = process.env.SYMBIOT_ANDROID_APP === "1";
const PHONE = process.platform === "android" || ANDROID_APP || process.env.SYMBIOT_AS_PHONE === "1"; // the Android app, or Termux (or a test of either)
const PAIR_SITE = "https://symbiot.co.za/pair";
const relayBase = () => String(process.env.SYMBIOT_RELAY || "https://relay.symbiot.co.za").replace(/\/+$/, "");
const relayAllowed = () => process.env.SYMBIOT_NO_RELAY !== "1";
const same = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && x.length > 0 && timingSafeEqual(x, y); };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const PATHS = { queue: join(CONFIG_DIR, "phone-queue.json"), copy: join(CONFIG_DIR, "computer.json"), applied: join(CONFIG_DIR, "phone-applied.json"),
  seal: join(CONFIG_DIR, "android-seal.json"), nsdWant: join(CONFIG_DIR, "android-nsd.want"), nsd: join(CONFIG_DIR, "android-nsd.json") };
const readJson = (f, d) => { const v = readState(f); return v === undefined ? d : v; };
const writeJson = (f, v) => { try { writeJsonAtomic(f, v, { indent: 0, newline: false, mode: 0o600 }); return true; } catch { return false; } };

// ---- sealing --------------------------------------------------------------------------
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex"); // DER head of an X25519 public key; the 32 raw bytes follow
function newKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return { pub: publicKey.export({ type: "spki", format: "der" }).subarray(12).toString("base64url"), priv: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url") };
}
// The key a phone and its computer share: X25519 between one's private key and the
// other's public one, through HKDF, salted with both public keys (phone's first).
function linkKey(myPriv, theirPub, phonePub, computerPub) {
  const s = diffieHellman({ privateKey: createPrivateKey({ key: Buffer.from(myPriv, "base64url"), format: "der", type: "pkcs8" }),
    publicKey: createPublicKey({ key: Buffer.concat([X25519_SPKI, Buffer.from(theirPub, "base64url")]), format: "der", type: "spki" }) });
  return Buffer.from(hkdfSync("sha256", s, Buffer.concat([Buffer.from(phonePub, "base64url"), Buffer.from(computerPub, "base64url")]), "symbiot phone link v1", 32));
}
// What a phone checks the computer by: in the QR, in the mDNS TXT record, pinned at pairing.
const fingerprint = (pub) => createHash("sha256").update(Buffer.from(String(pub || ""), "base64url")).digest("base64url").slice(0, 22);
// aad binds a sealed message to its place: a request to its phone, an answer to its request.
function seal(key, obj, aad) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv); c.setAAD(Buffer.from(aad));
  return { n: iv.toString("base64url"), c: Buffer.concat([c.update(JSON.stringify(obj)), c.final(), c.getAuthTag()]).toString("base64url") };
}
function unseal(key, env, aad) {
  try {
    const iv = Buffer.from(String(env.n), "base64url"), b = Buffer.from(String(env.c), "base64url");
    if (iv.length !== 12 || b.length < 17) return null;
    const d = createDecipheriv("aes-256-gcm", key, iv); d.setAAD(Buffer.from(aad)); d.setAuthTag(b.subarray(-16));
    return JSON.parse(Buffer.concat([d.update(b.subarray(0, -16)), d.final()]).toString("utf8"));
  } catch { return null; }
}

// ---- the computer --------------------------------------------------------------------------
function linkCfg(cfg = loadConfig()) {
  const l = cfg.phoneLink || {};
  return { on: !!l.on, port: Number(l.port) || PORT, relay: l.relay !== false, pub: String(l.pub || ""),
    phones: (Array.isArray(l.phones) ? l.phones : []).filter((p) => p && p.id && (p.hash || p.token)), gone: (Array.isArray(l.gone) ? l.gone : []).filter((g) => g && g.id && g.pub).slice(-10) };
}
function saveLink(l) { const cfg = loadConfig(); cfg.phoneLink = { ...(cfg.phoneLink || {}), ...l }; return saveConfig(cfg); }
// Only a hash of each phone's token is kept: a copied config can't pose as a phone.
// One kept whole (paired before 0.59) is hashed the first time it's read.
function hashTokens() {
  const cfg = loadConfig(), l = cfg.phoneLink; if (!l || !Array.isArray(l.phones) || !l.phones.some((p) => p && p.token)) return;
  l.phones = l.phones.map((p) => (p && p.token ? (({ token, ...rest }) => ({ ...rest, hash: sha(token), ...(p.pub ? {} : { legacy: true }) }))(p) : p));
  saveConfig(cfg);
}
// This computer's key pair, made the first time the link is switched on.
function linkKeys() {
  const cfg = loadConfig(), l = cfg.phoneLink || {}, s = cfg.phoneSecret || {};
  if (l.pub && s.priv) return { pub: l.pub, priv: s.priv };
  const k = newKeys(); cfg.phoneLink = { ...l, pub: k.pub }; cfg.phoneSecret = { priv: k.priv }; saveConfig(cfg);
  return k;
}
const keys = new Map(); // a phone's public key -> the key we share
function keyFor(phonePub) {
  if (!keys.has(phonePub)) { const k = linkKeys(); keys.set(phonePub, linkKey(k.priv, phonePub, phonePub, k.pub)); }
  return keys.get(phonePub);
}
// The relay knows this computer by a hash of a secret drawn from its key; only this
// computer can answer for it (it shows the secret, the relay hashes it). Phones get the id.
function relayOf(priv) {
  const secret = Buffer.from(hkdfSync("sha256", Buffer.from(priv, "base64url"), Buffer.alloc(0), "symbiot relay v1", 32)).toString("base64url");
  return { secret, id: createHash("sha256").update(secret).digest("base64url").slice(0, 32) };
}
// This computer's addresses on your network, the likeliest first (not Docker's,
// a VM's or a VPN's bridges).
function lanAddresses(ifs = networkInterfaces()) {
  const out = [];
  for (const [name, list] of Object.entries(ifs || {})) {
    if (/^(docker|br-|veth|virbr|vmnet|vboxnet|lxc|lxd|podman|cni|flannel)/i.test(name)) continue;
    for (const a of list || []) if ((a.family === "IPv4" || a.family === 4) && !a.internal) out.push(a.address);
  }
  const rank = (ip) => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b));
}
// What the network announcement (mdns.mjs) gives a device that asks: the address on
// its own subnet, as it came in on that interface. With no asker (an announcement), or
// none on its subnet, every address but a VPN's: Tailscale, WireGuard and other tunnels
// (100.64.0.0/10 is Tailscale's), which a phone on the Wi-Fi can't reach.
const overlay = (name, ip) => /^(tailscale|ts\d|wg|tun|utun|tap|zt|nordlynx|proton|mullvad)/i.test(name) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);
const ip4 = (ip) => String(ip).split(".").reduce((n, x) => ((n << 8) | (Number(x) & 255)) >>> 0, 0);
function mdnsAddresses(asker, ifs = networkInterfaces()) {
  const all = [];
  for (const [name, list] of Object.entries(ifs || {})) {
    if (/^(docker|br-|veth|virbr|vmnet|vboxnet|lxc|lxd|podman|cni|flannel)/i.test(name)) continue;
    for (const a of list || []) if ((a.family === "IPv4" || a.family === 4) && !a.internal) all.push({ name, ip: a.address, mask: a.netmask || "255.255.255.0" });
  }
  const from = String(asker || "").replace(/^::ffff:/i, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(from)) {
    const same = all.filter((a) => (ip4(a.ip) & ip4(a.mask)) === (ip4(from) & ip4(a.mask)));
    if (same.length) return same.map((a) => a.ip);
  }
  const lan = all.filter((a) => !overlay(a.name, a.ip));
  return (lan.length ? lan : all).map((a) => a.ip);
}

let listener = null, listenErr = "", pairing = null; // pairing: { code, until, tries }
const lastSeen = new Map(); // phone id -> { at, via }
// The link a QR carries: the site's pairing page, which hands it to the app (the
// part after # never leaves the phone). Addresses, port, code and key fingerprint.
function pairLink(code, l = linkCfg()) { return `${PAIR_SITE}#a=${lanAddresses().slice(0, 3).join(",")}&p=${l.port}&c=${code}&k=${fingerprint(linkKeys().pub)}`; }
function linkState() {
  const l = linkCfg();
  if (pairing && Date.now() > pairing.until) pairing = null;
  const link = pairing && listener ? pairLink(pairing.code, l) : "";
  return { role: "computer", on: l.on, port: l.port, listening: !!listener, ...(listenErr ? { error: listenErr } : {}), ...(listenErr && holder ? { holder } : {}), addresses: lanAddresses(),
    ...(l.pub ? { fp: fingerprint(l.pub) } : {}), relay: { on: l.relay && relayAllowed(), ...(relayAllowed() ? {} : { off: "SYMBIOT_NO_RELAY" }), ...relayState() }, found: !!mdns,
    phones: l.phones.map((p) => ({ id: p.id, name: p.name, added: p.added, ...(p.legacy || !p.pub ? { old: true } : {}), ...(lastSeen.has(p.id) ? { seen: lastSeen.get(p.id).at, via: lastSeen.get(p.id).via } : p.seen ? { seen: p.seen } : {}) })),
    ...(pairing ? { code: pairing.code, until: pairing.until } : {}), ...(link ? { link, qr: qrSvg(link) } : {}) };
}
// A new pairing code, good for 10 minutes and 5 tries.
function newCode() { pairing = { code: String(randomInt(0, 1e6)).padStart(6, "0"), until: Date.now() + CODE_MS, tries: 0 }; return linkState(); }
// Unpaired: it gets nothing more, and what it had queued (an approve too) is refused.
// Its key is kept a while, so it's told so, sealed, rather than left guessing.
function unpairPhone(id) {
  const l = linkCfg(), p = l.phones.find((x) => x.id === id);
  l.phones = l.phones.filter((x) => x.id !== id); if (p && p.pub) l.gone = [...l.gone, { id: p.id, pub: p.pub, at: Date.now() }].slice(-10);
  lastSeen.delete(id); saveLink({ phones: l.phones, gone: l.gone });
  if (!l.phones.some((x) => x.pub)) stopRelay();
  return linkState();
}
function setRelay(on) { saveLink({ relay: !!on }); if (on) startRelay(); else stopRelay(); return linkState(); }

function reply(res, code, obj) { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); }
function body(req, max = 256 * 1024) {
  return new Promise((resolve) => {
    let d = ""; req.on("data", (ch) => { d += ch; if (d.length > max) req.destroy(); });
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}
const NOT_PAIRED = "This phone isn't paired with this computer. Pair it again: in Symbiot on your computer, Settings → Your phone.";
const UNPAIRED = "This phone was unpaired on your computer. Pair it again to get its news and send it changes.";
const OLD_PHONE = "Symbiot on your computer now seals what it sends your phone. Update Symbiot on this phone, then pair it again.";
async function handle(req, res) {
  const u = new URL(req.url, "http://phone");
  if (u.pathname === "/phone/hello" && req.method === "GET") { const l = linkCfg(); return reply(res, 200, { v: 1, pub: l.pub || linkKeys().pub, fp: fingerprint(l.pub || linkKeys().pub) }); }
  if (u.pathname === "/phone/pair" && req.method === "POST") {
    const b = await body(req, 4096);
    if (!b.pub || !b.c) return reply(res, 400, { error: OLD_PHONE });
    if (!pairing || Date.now() > pairing.until) { pairing = null; return reply(res, 403, { error: "No pairing code is open. In Symbiot on your computer, open Settings → Your phone and click Pair a phone." }); }
    const k = linkKeys(), key = linkKey(k.priv, String(b.pub), String(b.pub), k.pub), m = unseal(key, b, "pair");
    if (!m || !same(String(m.code || "").replace(/\D/g, ""), pairing.code)) {
      if (++pairing.tries >= CODE_TRIES) pairing = null;
      return reply(res, 403, { error: pairing ? "That code isn't right. Check it on your computer." : "That code was wrong too many times. Click New code on your computer." });
    }
    pairing = null;
    const l = linkCfg(), token = randomBytes(24).toString("hex"), p = { id: randomBytes(4).toString("hex"), name: String(m.name || "Phone").replace(/\s+/g, " ").trim().slice(0, 40) || "Phone", hash: sha(token), pub: String(b.pub), added: Date.now() };
    saveLink({ phones: [...l.phones, p].slice(-5) });
    keys.set(p.pub, key); startRelay();
    return reply(res, 200, seal(key, { token, id: p.id, name: hostname(), now: Date.now(), port: l.port, addresses: lanAddresses().slice(0, 3), relay: relayOf(k.priv).id, relayUrl: relayBase() }, "pair:" + b.n));
  }
  // a phone paired before the link was sealed
  if (u.pathname === "/phone/news" && req.method === "GET") return reply(res, 403, { error: OLD_PHONE });
  const op = (u.pathname.match(/^\/phone\/(news|state|apply|chat)$/) || [])[1];
  if (op && req.method === "POST") { const r = await answer(await body(req), op, "wifi"); return reply(res, r.status, r.body); }
  reply(res, 404, { error: "not found" });
}

// A sealed request, from your Wi-Fi or through the relay: who sent it (its token,
// checked against the hash kept), that it's fresh, and what it asks. Gives { status,
// body }: sealed, or plain only when it can't be sealed (no such phone).
const seenNonces = new Map();
const sealed = (key, n, s, b) => ({ status: 200, body: seal(key, { s, b }, "res:" + n) });
async function answer(env, op, via, { max = 0 } = {}) {
  env = env && typeof env === "object" ? env : {};
  const l = linkCfg(), p = l.phones.find((x) => x.id === env.id && x.pub && !x.legacy);
  if (!p) {
    const g = l.gone.find((x) => x.id === env.id);
    if (g) { const k = keyFor(g.pub); if (unseal(k, env, "req:" + g.id)) return sealed(k, env.n, 403, { error: UNPAIRED, unpaired: true }); }
    return { status: 403, body: { error: NOT_PAIRED } };
  }
  const key = keyFor(p.pub), m = unseal(key, env, "req:" + p.id);
  if (!m) return { status: 403, body: { error: NOT_PAIRED } };
  const ok = p.hash ? same(sha(String(m.t || "")), p.hash) : same(m.t, p.token);
  if (!ok) return sealed(key, env.n, 403, { error: UNPAIRED, unpaired: true });
  if (p.token) hashTokens();
  const now = Date.now();
  for (const [n, t] of seenNonces) if (now - t > 2 * SKEW_MS) seenNonces.delete(n);
  if (Math.abs(now - Number(m.ts)) > SKEW_MS || seenNonces.has(env.n)) return sealed(key, env.n, 409, { error: "That message was old, or came twice, so it was ignored. Check the time on your phone.", now }); // now: the phone sets its clock by it, and asks again
  seenNonces.set(env.n, now);
  if ((op && m.op !== op) || !OPS[m.op]) return sealed(key, env.n, 403, { error: "That can't be asked from a phone." });
  lastSeen.set(p.id, { at: now, via: via || "wifi" });
  try { const r = await OPS[m.op](m.args && typeof m.args === "object" ? m.args : {}, p), f = fitRelay(r.status || 200, r.body !== undefined ? r.body : r, max); return sealed(key, env.n, f.status, f.body); }
  catch (e) { return sealed(key, env.n, 500, { error: "It failed on your computer: " + ((e && e.message) || e) }); }
}
// An answer through the relay has to fit under its cap (relay/core.mjs LIMITS.body), or
// the relay dropped it and the phone waited 25 s for nothing (FINE-TUNE item 10). The
// copy gives up its reports' text first (each says the rest is on the computer), then
// the reports; anything still too big is refused, saying so. max 0: no cap (your Wi-Fi).
const RELAY_MAX = 256 * 1024;
const sealedSize = (status, body) => Math.ceil(Buffer.byteLength(JSON.stringify({ s: status, b: body })) * 4 / 3) + 300; // base64url, and the envelope round it
function fitRelay(status, body, max) {
  if (!max || sealedSize(status, body) <= max) return { status, body };
  if (body && Array.isArray(body.reports)) {
    const brief = { ...body, reports: body.reports.map((r) => ({ ...r, text: cutReport(r.text, 1500).text, cut: true })) };
    if (sealedSize(status, brief) <= max) return { status, body: brief };
    const none = { ...body, reports: [] };
    if (sealedSize(status, none) <= max) return { status, body: none };
  }
  return { status: 413, body: { error: "Your computer's answer was too big to come through the relay. It comes whole on your Wi-Fi." } };
}
const OPS = {
  news: ({ since }) => { const { news, briefs } = newsAfter(since); return { name: hostname(), now: Date.now(), news: news.slice(0, 100), briefs: briefs.slice(0, 20) }; },
  state: async ({ etag }) => { const s = await snapshot(); return etag && etag === s.v ? { status: 304, body: { v: s.v } } : s; },
  apply: async ({ ops }, phone) => applyOps(ops, phone),
  // A phone has no AI of its own: its Home chat is answered here, by this computer's.
  chat: async ({ question }) => { const { homeAsk } = await import("./home.mjs"); return homeAsk(String(question || "").slice(0, 2000)); },
};

// ---- the copy a phone keeps ---------------------------------------------------------------
// Small and in plain words: your open tasks, what needs you, agents' questions, the
// work waiting for your Approve (with a sum of exactly what's waiting, which an
// approve from the phone has to match), what Watch found, what was approved from a
// phone lately, and the newest reports (reportsForPhone). v changes only when something
// in it does.
let snapCache = null;
const plainText = (s, n = 280) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const approveSum = (r) => sha(JSON.stringify([(r.tasks || []).map((t) => t.id).sort(), (r.files || []).map((f) => (typeof f === "string" ? f : f.path || f.file || JSON.stringify(f))).sort(), r.stat || ""])).slice(0, 16);
const askId = (path) => "ask:" + sha(String(path)).slice(0, 12);
// The newest few of what this computer's agents wrote up (reports.mjs), so the phone's
// Reports has them too, to read an audit or a plan away from the desk, offline as well.
// Each is cut at a paragraph past REPORT_CAP: the copy goes through the relay, which
// takes 256 KB at most, and the rest is here to read.
const PHONE_REPORTS = 5, REPORT_CAP = 12000;
function cutReport(text, cap = REPORT_CAP) {
  const t = String(text || ""); if (t.length <= cap) return { text: t, cut: false };
  const head = t.slice(0, cap), k = head.lastIndexOf("\n\n");
  return { text: (k > cap * 0.5 ? head.slice(0, k) : head).replace(/\s+$/, ""), cut: true };
}
async function reportsForPhone({ list } = {}) {
  if (!list) list = (await import("./reports.mjs")).listReports();
  return list.slice(0, PHONE_REPORTS).map((r) => {
    let t = ""; try { t = readFileSync(r.file, "utf8"); } catch { return null; }
    const c = cutReport(t);
    return { id: r.id, title: plainText(r.title, 140), name: r.name, lane: r.lane || "", run: r.run || "", mtime: r.mtime, size: r.size, text: c.text, ...(c.cut ? { cut: true } : {}) };
  }).filter(Boolean);
}
// On the phone: the copy, and the computer it's from, for its Reports (server.mjs). null on a computer.
function computerCopy() { const c = loadConfig().computer, copy = c ? loadCopy() : null; return copy ? { copy, from: copy.name || c.name || "your computer" } : null; }
async function snapshot({ now = Date.now(), fresh = false } = {}) {
  if (!fresh && snapCache && now - snapCache.at < 5000) return snapCache.snap;
  const tryOr = async (f, d) => { try { return await f(); } catch { return d; } };
  const home = await tryOr(() => import("./home.mjs"), null), tasksMod = await tryOr(() => import("./tasks.mjs"), null), agents = await tryOr(() => import("./agents.mjs"), null), watch = await tryOr(() => import("./watch.mjs"), null);
  const h = home ? await tryOr(() => home.homeState({ now }), { you: [] }) : { you: [] };
  const tasks = loadTasks().filter((t) => !t.archived).slice(0, 200).map((t) => ({ id: t.id, text: plainText(t.text), repo: t.repo || "", done: !!t.done, ...(t.review ? { review: true } : {}) }));
  const you = h.you || [];
  const needs = you.filter((y) => y.kind !== "ask" && y.kind !== "approve").map((y) => ({ id: y.id, title: plainText(y.title, 90), sub: plainText(y.sub, 160) }));
  const asks = [];
  for (const y of (await tryOr(() => agents.agentsList(), [])).filter((a, i, all) => all.findIndex((b) => b.path === a.path) === i)) {
    const qs = await tryOr(() => agents.agentQuestions(y.path, "").questions, []);
    if (qs.length) asks.push({ id: askId(y.path), path: y.path, name: plainText(String(y.name || "an agent").replace(/^Agent:\s*/, ""), 60), questions: qs.slice(0, 5).map((q) => ({ q: plainText(q.q, 300), ...(q.task ? { task: plainText(q.task, 120) } : {}), ...(q.shown ? { shown: plainText(q.shown, 400) } : {}), options: (q.options || []).slice(0, 2).map((o) => plainText(o, 200)), ...(q.labels ? { labels: q.labels.slice(0, 2).map((o) => plainText(o, 200)) } : {}) })) });
  }
  const approves = (await tryOr(() => tasksMod.pendingReview(), [])).filter((r) => r.path && !r.running && ((r.tasks || []).length || (r.files || []).length))
    .map((r) => ({ repo: r.repo, tasks: (r.tasks || []).map((t) => ({ id: t.id, text: plainText(t.text, 200) })), files: (r.files || []).length, stat: plainText(r.stat, 120), ...(r.untasked ? { untasked: true } : {}), sum: approveSum(r) }));
  const board = watch ? await tryOr(() => watch.watchBoard(24, now), { cards: [] }) : { cards: [] };
  const seen = (board.cards || []).filter((c) => c.count > 0).slice(0, 8).map((c) => ({ name: plainText(c.name, 60), label: plainText(c.label, 60), count: c.count, items: (c.items || []).filter((i) => i.need !== false).slice(0, 3).map((i) => ({ text: plainText(i.text, 140), ts: i.ts })) }));
  const recent = (readJson(PATHS.applied, {}).approvals || []).filter((a) => now - a.at < 24 * 3600000).slice(-10);
  const reports = await tryOr(() => reportsForPhone(), []);
  const body = { tasks, needs, asks, approves, watch: seen, recent, reports, relay: linkCfg().relay && relayAllowed() };
  const snap = { v: sha(JSON.stringify(body)).slice(0, 16), name: hostname(), at: now, ...body };
  snapCache = { at: now, snap };
  return snap;
}

// ---- changes from a phone --------------------------------------------------------------------
// Only these, each absolute ("mark it done", never "flip it"), so one sent twice or
// late lands the same. Each has an id, and an id applied once is never applied
// again (phone-applied.json). Anything else is refused and reaches nothing.
const PHONE_OPS = ["task.add", "task.setDone", "agent.answer", "pending.approve"];
let approveHook = null; // server.mjs: the same Approve as the button (release notes and all)
function setPhoneApprove(fn) { approveHook = typeof fn === "function" ? fn : null; }
async function defaultApprove(repo, untasked) { const t = await import("./tasks.mjs"); return untasked ? t.approveChanges(repo, { tick: [] }) : t.approveRepo(repo, {}); }
async function applyOne(o, phone) {
  const a = o.args && typeof o.args === "object" ? o.args : {}, at = Number(o.at) || Date.now();
  if (o.op === "task.add") {
    const text = String(a.text || "").trim().slice(0, 4000); if (!text) return { error: "That task was empty." };
    const repo = String(a.repo || ""), { laneMap } = await import("./scan.mjs");
    if (repo && !(repo in laneMap())) return { error: `There's no ${repo} on your computer any more, so the task wasn't added.` };
    const { addTask } = await import("./tasks.mjs"), t = addTask(text, repo);
    return t.error ? { error: "It couldn't be added." } : { ok: true, task: t.id, ...(t.duplicate ? { duplicate: true } : {}) };
  }
  if (o.op === "task.setDone") {
    const { setTaskDone } = await import("./tasks.mjs"), r = setTaskDone(String(a.id || ""), !!a.done, { at });
    if (r.conflict) return { conflict: true, error: `"${plainText(r.text, 60)}" was changed on your computer after you changed it here, so your computer's stays.` };
    return r.error ? { error: r.error === "not found" ? "That task isn't on your computer any more." : r.error } : { ok: true };
  }
  if (o.op === "agent.answer") {
    const path = String(a.path || ""), snap = await snapshot({ fresh: true });
    if (!snap.asks.some((x) => x.path === path)) return { error: "That agent isn't asking any more (answered on your computer, or its run moved on)." };
    const { answerQuestions } = await import("./agents.mjs"), r = answerQuestions(path, Array.isArray(a.answers) ? a.answers.slice(0, 5) : [], { rerun: true, share: true });
    return r && r.ok ? { ok: true, ...(r.note ? { note: r.note } : {}) } : { error: (r && r.error) || "It couldn't be answered." };
  }
  if (o.op === "pending.approve") {
    const repo = String(a.repo || ""), { pendingReview } = await import("./tasks.mjs");
    const now = pendingReview().find((r) => r.repo === repo && r.path && ((r.tasks || []).length || (r.files || []).length));
    if (!now) return { error: `Nothing in ${repo} is waiting for your Approve any more.` };
    if (now.running) return { error: `The agent is still working in ${repo}. Approve once it finishes.` };
    if (approveSum(now) !== String(a.sum || "")) return { refused: true, error: `The work in ${repo} changed since your phone showed it, so it wasn't approved. Look at what's there now, then approve that.` };
    const ap = readJson(PATHS.applied, { ids: {}, approvals: [] }), entry = { id: o.id, repo, phone: phone.name, at: Date.now(), status: "approving" };
    ap.approvals = [...(ap.approvals || []), entry].slice(-30); writeJson(PATHS.applied, { ids: ap.ids || {}, approvals: ap.approvals });
    // Approve takes a while (a branch, a push, a PR): it carries on here, and the copy says how it went
    Promise.resolve().then(() => (approveHook || defaultApprove)(repo, !!now.untasked)).then((r) => r || {}, (e) => ({ error: String((e && e.message) || e) })).then((r) => {
      const cur = readJson(PATHS.applied, { ids: {}, approvals: [] }), x = (cur.approvals || []).find((y) => y.id === o.id);
      if (x) { x.status = r.error ? "failed" : "approved"; if (r.error) x.error = plainText(r.error, 200); if (r.pr) x.pr = r.pr; x.done = Date.now(); writeJson(PATHS.applied, cur); }
      snapCache = null;
    });
    return { ok: true, started: true };
  }
  return { refused: true, status: 403, error: `"${String(o.op || "").slice(0, 40)}" can't be done from a phone.` };
}
async function applyOps(ops, phone) {
  ops = (Array.isArray(ops) ? ops : []).slice(0, 50);
  const results = [];
  for (const o of ops) {
    const id = String((o && o.id) || "");
    if (!/^[\w-]{8,64}$/.test(id)) { results.push({ id, refused: true, status: 403, error: "That isn't a change Symbiot knows." }); continue; }
    const ap = readJson(PATHS.applied, { ids: {}, approvals: [] }); ap.ids = ap.ids || {};
    if (ap.ids[id]) { results.push({ id, ok: true, again: true }); continue; }
    // one that throws is reported back as failed, and counts as applied: it used to answer
    // 500 for the whole batch, which the phone sent again forever, with no news meanwhile
    let r; try { r = PHONE_OPS.includes(o.op) ? await applyOne(o, phone) : { refused: true, status: 403, error: `"${String(o.op || "").slice(0, 40)}" can't be done from a phone.` }; }
    catch (e) { r = { failed: true, error: "It failed on your computer: " + plainText((e && e.message) || e, 200) }; }
    const now = readJson(PATHS.applied, { ids: {}, approvals: [] }), ids = { ...(now.ids || {}), [id]: Date.now() };
    const keep = Object.entries(ids).sort((x, y) => y[1] - x[1]).slice(0, 2000); // a month of changes, more than any queue holds
    writeJson(PATHS.applied, { ids: Object.fromEntries(keep), approvals: now.approvals || [] });
    results.push({ id, ...r });
  }
  snapCache = null;
  let state = null; try { state = await snapshot({ fresh: true }); } catch {} // the phone asks for it again anyway
  return { results, state };
}
// Approved from a phone, lately: Home and the Workdesk say so.
function phoneApprovals(now = Date.now()) { return (readJson(PATHS.applied, {}).approvals || []).filter((a) => now - a.at < 24 * 3600000); }

// ---- saying it's here (mdns.mjs) ----------------------------------------------------------------
let mdns = null;
function startMdns() {
  if (mdns || process.env.SYMBIOT_NO_MDNS === "1") return;
  const l = linkCfg(), k = linkKeys();
  mdns = announce({ id: sha(Buffer.from(k.pub, "base64url")).slice(0, 4), port: l.port, fp: fingerprint(k.pub), addresses: (asker) => mdnsAddresses(asker) }, { onError: () => {} });
}
function stopMdns() { if (mdns) mdns.stop(); mdns = null; }

// ---- away from home: the relay (relay/) --------------------------------------------------------
// While the link is on and a phone is paired, the computer keeps a line open to the
// relay (it connects out: no port opened on your router), and answers what a phone
// sends through it as it would on your Wi-Fi. The relay passes sealed messages only.
let relaySock = null, relayErr = "", relayUp = false, relayTries = 0, relayTimer = null, relayPing = null;
function relayState() { return { connected: relayUp, ...(relayErr ? { error: relayErr } : {}) }; }
function relayWanted() { const l = linkCfg(); return l.on && l.relay && relayAllowed() && l.phones.some((p) => p.pub && !p.legacy); }
function startRelay() {
  if (relaySock || relayTimer || !relayWanted()) return;
  if (typeof globalThis.WebSocket !== "function") { relayErr = "Away from home needs Node 22 or newer on this computer."; return; }
  const { id, secret } = relayOf(linkKeys().priv);
  let ws; try { ws = new WebSocket(relayBase().replace(/^http/, "ws") + `/v1/${id}/computer`); } catch (e) { relayErr = String((e && e.message) || e); return retryRelay(); }
  relaySock = ws;
  ws.addEventListener("open", () => { try { ws.send(JSON.stringify({ hello: secret })); } catch {} });
  ws.addEventListener("message", async (ev) => {
    let m; try { m = JSON.parse(String(ev.data)); } catch { return; }
    if (m.ready) { relayUp = true; relayErr = ""; relayTries = 0; return; }
    if (m.error) { relayErr = String(m.error).slice(0, 200); return; }
    if (!m.rid) return;
    const r = await answer(m.body, null, "relay", { max: RELAY_MAX });
    try { ws.send(JSON.stringify({ rid: m.rid, s: r.status, b: r.body })); } catch {}
  });
  ws.addEventListener("close", () => { if (relaySock === ws) { relaySock = null; relayUp = false; retryRelay(); } });
  ws.addEventListener("error", () => { relayErr = relayErr || `Couldn't reach ${relayBase()}.`; });
  clearInterval(relayPing); relayPing = setInterval(() => { try { if (relaySock && relaySock.readyState === 1) relaySock.send('{"ping":1}'); } catch {} }, 30000); relayPing.unref();
}
function retryRelay() {
  if (relayTimer || !relayWanted()) return;
  const wait = Math.min(5 * 60000, 2000 * 2 ** Math.min(relayTries++, 8));
  relayTimer = setTimeout(() => { relayTimer = null; startRelay(); }, wait); relayTimer.unref();
}
function stopRelay() {
  clearTimeout(relayTimer); relayTimer = null; clearInterval(relayPing); relayPing = null;
  const ws = relaySock; relaySock = null; relayUp = false; relayTries = 0;
  if (ws) try { ws.close(); } catch {}
}

// USB: a phone on adb needs nothing scanned. `adb reverse` lets it reach this computer at
// 127.0.0.1:7392 over the cable, and the pairing link is pushed to the Android app, which
// asks "Link to <this computer>?": Approve is the only step. Once per plug-in per phone.
const adbPushed = new Set();
const adbRun = (args) => execFileSync("adb", args, { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] });
function adbLink({ run = adbRun, has = () => hasCmd("adb") } = {}) {
  const l = linkCfg();
  if (!l.on || !listener || !has()) return [];
  let serials = [];
  try { serials = run(["devices"]).split("\n").slice(1).map((x) => x.trim().split(/\s+/)).filter((x) => x[1] === "device").map((x) => x[0]); } catch { return []; }
  for (const s of [...adbPushed]) if (!serials.includes(s)) adbPushed.delete(s); // unplugged: pushed again next time
  const did = [];
  for (const s of serials) {
    if (adbPushed.has(s)) continue;
    try {
      run(["-s", s, "reverse", `tcp:${l.port}`, `tcp:${l.port}`]);
      if (!pairing || Date.now() > pairing.until) newCode();
      const link = `symbiot://pair?a=127.0.0.1&p=${l.port}&c=${pairing.code}&k=${fingerprint(linkKeys().pub)}&n=${encodeURIComponent(hostname())}`;
      run(["-s", s, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `'${link}'`, "co.symbiot.app"]);
      adbPushed.add(s); did.push(s);
    } catch {}
  }
  return did;
}
let adbTimer = null;
function startAdbLink() { if (adbTimer || PHONE || process.env.SYMBIOT_NO_ADB === "1" || process.env.SYMBIOT_SANDBOX) return; // (tests and sandboxes never touch a real phone)
  adbLink(); adbTimer = setInterval(() => adbLink(), 30000); adbTimer.unref(); }

// Who holds a port on this computer: pid, command line, start time. `ss` first, `lsof` as the
// fallback; null when neither says (or nobody does). A holder running this app's own index.mjs
// is marked `symbiot` (and this process itself is never offered to be stopped).
function portHolder(port, run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] })) {
  const n = Number(port); if (!(n > 0)) return null;
  let pid = 0;
  try { const m = String(run("ss", ["-ltnpH", `sport = :${n}`])).match(/pid=(\d+)/); if (m) pid = Number(m[1]); } catch {}
  if (!pid) { try { const m = String(run("lsof", ["-nP", "-t", `-iTCP:${n}`, "-sTCP:LISTEN"])).match(/\d+/); if (m) pid = Number(m[0]); } catch {} }
  if (!pid) return null;
  let cmd = "", started = "";
  try {
    const out = String(run("ps", ["-o", "lstart=,args=", "-p", String(pid)])).trim();
    const m = out.match(/^(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/);
    if (m) { started = m[1]; cmd = m[2]; } else cmd = out;
  } catch {}
  return { pid, cmd, started, symbiot: pid !== process.pid && /symbiot/i.test(cmd) && /index\.mjs/.test(cmd) };
}
function holderText(port, h) {
  if (!h) return `Port ${port} is in use by something else on this computer.`;
  return `Port ${port} is held by ${(h.cmd || "another program").slice(0, 80)} (pid ${h.pid}${h.started ? ", started " + h.started : ""}).`;
}
let holder = null, starting = null;

// Listen on the network while it's switched on. Gives the state. (A second call while the
// first is still binding waits for it, so startPhone and setPhoneLink never bind twice.)
function startPhoneLink() {
  const l = linkCfg();
  if (!l.on || listener) return Promise.resolve(linkState());
  if (starting) return starting;
  hashTokens(); linkKeys();
  starting = new Promise((resolve) => {
    const done = () => { starting = null; resolve(linkState()); };
    const srv = createServer((req, res) => { handle(req, res).catch(() => { try { reply(res, 500, { error: "failed" }); } catch {} }); });
    srv.on("error", (e) => {
      if (e && e.code === "EADDRINUSE") { holder = portHolder(l.port); listenErr = holderText(l.port, holder); }
      else { holder = null; listenErr = `Couldn't listen on port ${l.port}: ${(e && e.message) || e}`; }
      listener = null; done();
    });
    srv.listen(l.port, "0.0.0.0", () => { listener = srv; listenErr = ""; holder = null; srv.unref(); startMdns(); startRelay(); startAdbLink(); done(); });
  });
  return starting;
}
// "Free it": stop the other Symbiot process that holds the port (SIGTERM, so it lets go cleanly), then listen again.
async function freePhonePort() {
  if (!linkCfg().on) return linkState(); // only to let this app's own link listen: never a stop with it off (smoke presses every route)
  const port = linkCfg().port, h = portHolder(port);
  if (!h) return startPhoneLink();
  if (!h.symbiot) return { ...linkState(), error: holderText(port, h) + " That isn't Symbiot, so it's left alone: use a different port." };
  try { process.kill(h.pid, "SIGTERM"); } catch {}
  for (let i = 0; i < 20 && portHolder(port); i++) await new Promise((r) => setTimeout(r, 150));
  listenErr = ""; holder = null;
  return startPhoneLink();
}
// "Use a different port": saved as phoneLink.port, and it listens there.
async function usePhonePort(port) {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) return { ...linkState(), error: "Pick a port between 1024 and 65535." };
  stopPhoneLink(); saveLink({ port: n }); listenErr = ""; holder = null;
  await startPhoneLink();
  return listener && !pairing ? newCode() : linkState();
}
function stopPhoneLink() { if (listener) { listener.close(); if (listener.closeAllConnections) listener.closeAllConnections(); } listener = null; pairing = null; stopMdns(); stopRelay(); clearInterval(adbTimer); adbTimer = null; adbPushed.clear(); }
async function setPhoneLink(on) {
  saveLink({ on: !!on });
  if (!on) { stopPhoneLink(); listenErr = ""; return linkState(); }
  await startPhoneLink();
  return listener && !pairing ? newCode() : linkState();
}

// ---- the phone -------------------------------------------------------------------------------
// What the user typed as the computer's address: "192.168.8.50", ":7392" optional.
function computerUrl(input) {
  let s = String(input || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  try { const u = new URL(s); if (!u.hostname) return ""; if (!u.port) u.port = String(PORT); return `${u.protocol}//${u.host}`; } catch { return ""; }
}
// A scanned pairing link: the site's (https://symbiot.co.za/pair#a=…) or the app's
// own (symbiot://pair?a=…). { addresses, port, code, fp } or null.
function parsePairLink(s) {
  s = String(s || "").trim();
  const m = s.match(/^(?:https:\/\/(?:www\.)?symbiot\.co\.za\/pair\/?[#?]|symbiot:\/\/pair\/?\?)(.*)$/i); if (!m) return null;
  const q = new URLSearchParams(m[1].replace(/^[#?]/, "")), addresses = String(q.get("a") || "").split(",").map((a) => a.trim()).filter((a) => /^[\w.:-]+$/.test(a)).slice(0, 5);
  const port = Number(q.get("p")) || PORT, code = String(q.get("c") || "").replace(/\D/g, ""), fp = String(q.get("k") || "");
  return addresses.length && /^\d{6}$/.test(code) ? { addresses, port, code, fp } : null;
}
const canNotify = () => ANDROID_APP || process.platform !== "android" || hasCmd("termux-notification");
// The phone's half of the key, its token too: sealed by the Android app's Keystore
// there (android-seal.json is how it's handed over, for a few seconds; it comes back
// in SYMBIOT_COMPUTER_SECRET at the next start), else in secrets.json (0600).
// That variable is read once, as this loads (at start: index.mjs imports it), and taken
// out of the environment: everything the app starts (agents, git, npm, gh) inherited it,
// which undid keeping it in the Keystore (FINE-TUNE item 11). Only Symbiot relaunching
// itself after an update gets it again (relaunchEnv).
let memSecret, envSecret = null;
if (ANDROID_APP && "SYMBIOT_COMPUTER_SECRET" in process.env) { try { envSecret = JSON.parse(process.env.SYMBIOT_COMPUTER_SECRET || "null"); } catch {} delete process.env.SYMBIOT_COMPUTER_SECRET; }
function readSecret() {
  if (ANDROID_APP) {
    if (memSecret === undefined) { memSecret = readJson(PATHS.seal, null); if (!memSecret || !memSecret.token) memSecret = envSecret; }
    return memSecret && memSecret.token && memSecret.key ? memSecret : null;
  }
  const s = loadConfig().computerSecret; return s && s.token && s.key ? s : null;
}
function writeSecret(s) {
  if (ANDROID_APP) { memSecret = s || null; writeJson(PATHS.seal, s || {}); return; }
  const cfg = loadConfig(); if (s) cfg.computerSecret = s; else delete cfg.computerSecret; saveConfig(cfg);
}
// What Symbiot relaunching itself (server.mjs, after an update) needs in its environment:
// the link's secret on the Android app, which the app hands in only at the service's start.
function relaunchEnv() { const s = ANDROID_APP ? readSecret() : null; return s ? { SYMBIOT_COMPUTER_SECRET: JSON.stringify(s) } : {}; }
let pollLast = 0, pollErr = "", pollTimer = null, fails = 0, lastVia = "", polling = null, route = ""; // route: where the next ask starts (ask)
const loadQueue = () => { const q = readJson(PATHS.queue, []); return Array.isArray(q) ? q : []; };
const saveQueue = (q) => (q.length ? writeJson(PATHS.queue, q) : (() => { try { unlinkSync(PATHS.queue); } catch {} return true; })());
const loadCopy = () => readJson(PATHS.copy, null);
function computerState() {
  const c = loadConfig().computer, s = c && readSecret(), copy = c ? loadCopy() : null, heard = Math.max(pollLast, (copy && copy.got) || 0);
  const old = !!c && !s; // paired before the link was sealed (or its key is gone)
  return { role: "phone", paired: !!(c && (c.token || s)), ...(c ? { name: c.name, url: c.url } : {}), ...(old ? { old: true } : {}), ...(pollLast ? { last: pollLast } : {}), ...(heard ? { heard } : {}),
    ...(lastVia ? { via: lastVia } : {}), ...(c && !old && fails >= 2 ? { away: true } : {}), ...(old ? { error: OLD_PAIRING } : pollErr ? { error: pollErr } : {}),
    queued: c ? loadQueue().length : 0, notify: canNotify(), termux: PHONE && !ANDROID_APP };
}
const OLD_PAIRING = "Pair this phone with your computer again: the link between them is sealed now, and this pairing is from before.";
const OLD_COMPUTER = "Symbiot on your computer is older than this phone's. Update it there (Settings → Update), then pair again.";
const cantReach = (url) => `Couldn't reach ${url}. Is Symbiot running there, with Your phone switched on, and is this phone on the same Wi-Fi? A firewall on the computer may need to allow port ${new URL(url).port}.`;
// Pair with the address and code typed in, or a scanned link (opts.link), which
// gives both and the key to expect; each address in it is tried until one answers.
async function pairComputer(address, code, { fetchFn = fetch, name = hostname(), link = "" } = {}) {
  const err = (e) => ({ ...computerState(), error: e });
  const p = link ? parsePairLink(link) : null;
  if (link && !p) return err("That isn't a pairing code from Symbiot. On your computer, open Settings → Your phone and scan the code it shows.");
  const urls = p ? p.addresses.map((a) => computerUrl(`${a}:${p.port}`)).filter(Boolean) : [computerUrl(address)].filter(Boolean);
  if (!urls.length) return err("Type your computer's address, as Symbiot shows it there (like 192.168.8.50:7392).");
  code = p ? p.code : String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return err("Type the 6-digit code your computer shows.");
  let last = "";
  for (const url of urls) {
    let h;
    try { const r = await fetchFn(url + "/phone/hello", { signal: AbortSignal.timeout(5000) }); h = r.ok ? await r.json().catch(() => null) : null; if (!h || !h.pub) { last = OLD_COMPUTER; continue; } }
    catch { last = cantReach(url); continue; }
    if (p && p.fp && fingerprint(h.pub) !== p.fp) { last = `The computer at ${url} isn't the one whose code you scanned. Scan it again on your computer.`; continue; }
    const mine = newKeys(), key = linkKey(mine.priv, h.pub, mine.pub, h.pub), env = { v: 1, pub: mine.pub, ...seal(key, { code, name: name === "localhost" ? "Phone" : name }, "pair") };
    let r, j;
    try { r = await fetchFn(url + "/phone/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(env), signal: AbortSignal.timeout(8000) }); j = await r.json().catch(() => ({})); }
    catch { last = cantReach(url); continue; }
    if (!r.ok) return err(j.error || `Your computer answered ${r.status}.`);
    const m = unseal(key, j, "pair:" + env.n);
    if (!m || !m.token) return err("Your computer's answer couldn't be read. Pair again with a new code.");
    const cfg = loadConfig(), was = cfg.computer, fp = fingerprint(h.pub);
    const more = (Array.isArray(m.addresses) ? m.addresses : []).map((a) => computerUrl(`${a}:${Number(m.port) || PORT}`)).filter(Boolean);
    cfg.computer = { v: 2, url, urls: [...new Set([url, ...more, ...urls])].slice(0, 6), name: String(m.name || "your computer").slice(0, 60), id: String(m.id), fp, pub: h.pub,
      relay: String(m.relay || ""), relayUrl: String(m.relayUrl || ""), since: Number(m.now) || Date.now(), offset: (Number(m.now) || Date.now()) - Date.now(), paired: Date.now() };
    saveConfig(cfg); writeSecret({ token: m.token, key: key.toString("base64url") });
    if (!was || was.fp !== fp) { try { unlinkSync(PATHS.copy); } catch {} saveQueue([]); } // another computer: what was kept for the last one isn't its
    pollErr = ""; fails = 0; lastVia = ""; route = ""; startComputerPoll({ soon: true });
    return computerState();
  }
  return err(last);
}
function forgetComputer() {
  const cfg = loadConfig(); delete cfg.computer; delete cfg.computerSecret; saveConfig(cfg); if (ANDROID_APP) writeSecret(null);
  for (const f of [PATHS.copy, PATHS.queue]) try { unlinkSync(f); } catch {}
  pollErr = ""; pollLast = 0; fails = 0; lastVia = ""; route = ""; clearTimeout(pollTimer); pollTimer = null;
  return computerState();
}
// Where the paired computer is now, by its key's fingerprint: the Android app asks
// Android's own discovery (the service runs it: android-nsd.want, then .json),
// anything else asks the network itself (mdns.mjs).
async function discoverComputer(c) {
  return (await findComputers()).filter((f) => f.fp === c.fp).map((f) => f.url);
}
// Every Symbiot saying it's here on this network, for the pairing screen: [{ name, url, fp }].
const NSD_WAIT = 15000;
async function findComputers() {
  let found = [];
  if (ANDROID_APP) {
    // Android's discovery takes 3.5 s, then up to 3 s to resolve each computer found, after the
    // service sees the ask (it looks every second): one computer took about 9.5 s, past the 8 s
    // this waited (FINE-TUNE item 7), so it waits 15 s, and the answer is read as soon as it's there
    // android-nsd.json is the Android app's to write, not ours: one read mid-write is nothing yet, not a broken file to move aside
    const asked = Date.now(); writeJson(PATHS.nsdWant, { at: asked });
    for (let i = 0; i < NSD_WAIT / 500; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try { if (statSync(PATHS.nsd).mtimeMs >= asked - 1000) { found = (() => { try { return JSON.parse(readFileSync(PATHS.nsd, "utf8")); } catch { return []; } })(); break; } } catch {}
    }
  } else found = await browse({ timeout: 2000 }).catch(() => []);
  return (Array.isArray(found) ? found : []).filter((f) => f && f.port).flatMap((f) => (f.addresses || [f.host]).filter(Boolean).map((a) => ({ name: String(f.name || "Symbiot").slice(0, 40), url: computerUrl(`${a}:${f.port}`), fp: String(f.fp || "") }))).filter((f) => f.url);
}
// One sealed request to the paired computer, wherever it is: the address that last
// answered, the others it gave at pairing, wherever it says it is now (mDNS), and
// only then the relay. Only an answer sealed with the pair's key is the computer's:
// another device that has its old address now answered a plain 403, read as "isn't
// paired", and the search stopped there (FINE-TUNE item 4). So an address counts only
// once its hello shows the key pinned at pairing (isThere), and a plain answer (the
// computer no longer knows this phone, say) only when no route gives a sealed one.
// { status, body, via } or { unreachable: true }.
async function ask(op, args, { fetchFn = fetch, discover = discoverComputer, again = false } = {}) {
  const c = loadConfig().computer, s = readSecret();
  if (!c || !s) return { status: 0, body: { error: OLD_PAIRING } };
  const key = Buffer.from(s.key, "base64url");
  const make = () => ({ v: 1, id: c.id, ...seal(key, { t: s.token, ts: Date.now() + (Number(c.offset) || 0), op, args }, "req:" + c.id) });
  const wait = op === "chat" ? 120000 : op === "apply" ? APPLY_MS : ASK_MS, tried = new Set();
  // what came back from one route: { status, body, sealed, via }, sealed only when it unseals
  const read = (env, status, j, via, sent) => { const m = j && j.n && j.c ? unseal(key, j, "res:" + env.n) : null; if (m && m.b) clockFrom(c, m.b.now, sent); return m ? { status: Number(m.s) || 0, body: m.b || {}, sealed: true, via } : j && j.n && j.c ? { status: 0, body: { error: "Your computer's answer couldn't be read." }, sealed: false, via } : { status, body: j || {}, sealed: false, via }; };
  const viaUrl = async (url) => { const env = make(), sent = Date.now(), r = await fetchFn(`${url}/phone/${op}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(env), signal: AbortSignal.timeout(wait) }); return read(env, r.status, await r.json().catch(() => ({})), url, sent); };
  let res = null, plain = null, relayNo = ""; // relayNo: what went wrong at the relay, when it wasn't the computer being away
  const take = (r) => { if (r.sealed) res = r; else plain = plain || r; return !!res; };
  // the addresses where it says hello, in order, asked all at once: 3 s at most for the lot
  const there = async (urls) => { urls = urls.filter((u) => u && !tried.has(u)); urls.forEach((u) => tried.add(u)); const ok = await Promise.all(urls.map((u) => isThere(u, c, fetchFn))); return urls.filter((u, i) => ok[i]); };
  const lan = async (urls) => { for (const url of await urls) { try { if (take(await viaUrl(url))) return; } catch {} } };
  const relay = async () => {
    if (res || !c.relay || c.relayOff || !relayAllowed()) return;
    try {
      const env = make(), sent = Date.now(), r = await fetchFn(`${String(process.env.SYMBIOT_RELAY || c.relayUrl || relayBase()).replace(/\/+$/, "")}/v1/${c.relay}/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(env), signal: AbortSignal.timeout(wait + 5000) });
      if (r.status === 200) { const j = await r.json(); take(read(env, Number(j.s) || 0, j.b || {}, "relay", sent)); }
      else relayNo = relayTrouble(r.status, await r.json().catch(() => null), c);
    } catch {}
  };
  const saved = [c.url, ...(c.urls || [])];
  if (route === "relay" && c.relay && !c.relayOff && relayAllowed()) {
    // away from home last time: the relay first, and the Wi-Fi looked at alongside, so
    // being away costs no wait on dead addresses (it cost up to 6 of them at 6 s each, then
    // discovery, before the relay, on every ask; FINE-TUNE item 8). Back home, the next ask goes there.
    const home = there(saved);
    await relay();
    if (!res) { await lan(home); if (!res) await lan(there(await discover(c).catch(() => []))); }
    else home.then((h) => { if (h.length) route = "wifi"; }, () => {});
  } else {
    await lan(there(saved));
    if (!res) await lan(there(await discover(c).catch(() => [])));
    await relay();
  }
  if (!res) return plain || { unreachable: true, ...(relayNo ? { relay: relayNo } : {}) };
  route = res.via === "relay" ? "relay" : "wifi";
  if (res.via !== "relay" && res.via !== c.url) { const cfg = loadConfig(); if (cfg.computer && cfg.computer.id === c.id) { cfg.computer.url = res.via; cfg.computer.urls = [...new Set([res.via, ...(cfg.computer.urls || [])])].slice(0, 6); saveConfig(cfg); } }
  // refused as old: the clocks drifted apart since pairing, and the answer gave the computer's; once more by it
  if (res.status === 409 && !again && Number(res.body.now)) return ask(op, args, { fetchFn, discover, again: true });
  return res;
}
// What the relay's answer says went wrong, in words, or "" when the computer is just
// away (not connected to it). A busy relay (429, or Cloudflare's own errors) and an answer
// too big for it read as the computer being "off or asleep" (FINE-TUNE item 10).
function relayTrouble(status, j, c) {
  const name = c.name || "your computer", host = (() => { try { return new URL(String(process.env.SYMBIOT_RELAY || c.relayUrl || relayBase())).host; } catch { return "the relay"; } })();
  if (j && j.away && status === 503) return "";
  if (j && j.tooBig) return `${name}'s answer was too big for the relay (${host}). It comes whole when this phone is on the same Wi-Fi.`;
  if (status === 504) return `${name} is connected to the relay but didn't answer in time: it may be busy. It's asked again shortly.`;
  if (status === 429) return `The relay (${host}) is busy: too many requests from this phone just now. It's asked again shortly.`;
  if (status === 413) return `What this phone sent was too big for the relay (${host}).`;
  return `The relay (${host}) isn't working right now (it answered ${status}). Your computer may be fine: it's asked again shortly.`;
}
// Whether the paired computer is at an address: its hello, quick, with the key pinned at
// pairing. The ask itself then gets the time a busy computer needs to answer (news and
// the copy had 6 s in all, and a slow snapshot read as the computer being away, FINE-TUNE
// item 9), while an address with nothing there still costs only PROBE_MS. One that
// answered lately isn't asked again.
const PROBE_MS = 3000, ASK_MS = 25000, APPLY_MS = 30000, PROBE_KEEP = 60000, probed = new Map(); // url -> when it last said hello as the computer
async function isThere(url, c, fetchFn) {
  if (Date.now() - (probed.get(url) || 0) < PROBE_KEEP) return true;
  try {
    const r = await fetchFn(`${url}/phone/hello`, { signal: AbortSignal.timeout(PROBE_MS) }), h = r.ok ? await r.json().catch(() => null) : null;
    if (!h || !h.pub || (c.fp && fingerprint(h.pub) !== c.fp)) { probed.delete(url); return false; }
  } catch { probed.delete(url); return false; }
  probed.set(url, Date.now()); return true;
}
// The computer's clock, from the now a sealed answer carries (news, a refusal as old),
// halfway through the ask. The offset was only set at pairing, so once either clock
// drifted 10 minutes every request was refused (FINE-TUNE item 5). Kept when it moves 2 s.
function clockFrom(c, now, sent) {
  now = Number(now); if (!now || !sent) return;
  const offset = Math.round(now - (sent + Date.now()) / 2);
  if (Math.abs(offset - (Number(c.offset) || 0)) < 2000) return;
  const cfg = loadConfig(); if (cfg.computer && cfg.computer.id === c.id) { cfg.computer.offset = offset; saveConfig(cfg); c.offset = offset; }
}
// The copy from the computer, with what you changed here that hasn't reached it yet
// laid over it ("waiting to send"), and what couldn't be applied there.
function saveCopy(snap, extra = {}) { const old = loadCopy() || {}; writeJson(PATHS.copy, { ...snap, got: Date.now(), notes: extra.notes !== undefined ? extra.notes : old.notes || [] }); }
function computerView() {
  const st = computerState(), copy = loadCopy(), q = loadQueue();
  if (!copy) return { ...st, copy: null };
  const v = JSON.parse(JSON.stringify(copy));
  for (const k of ["tasks", "needs", "asks", "approves", "watch", "recent", "notes", "reports"]) if (!Array.isArray(v[k])) v[k] = [];
  for (const o of q) {
    const a = o.args || {};
    if (o.op === "task.add") v.tasks.unshift({ id: "q:" + o.id, text: plainText(a.text), repo: a.repo || "", done: false, waiting: true });
    if (o.op === "task.setDone") { const t = v.tasks.find((x) => x.id === a.id); if (t) { t.done = !!a.done; t.waiting = true; } }
    if (o.op === "agent.answer") { const x = v.asks.find((y) => y.path === a.path); if (x) { x.waiting = true; x.answered = (a.answers || []).map((y) => y.a); } }
    if (o.op === "pending.approve") { const x = v.approves.find((y) => y.repo === a.repo); if (x) x.waiting = true; }
  }
  return { ...st, copy: v };
}
// A change made here: kept in order, shown at once, sent as soon as the computer answers.
// (refused: why it wasn't kept; error stays what the last ask of the computer said)
function queueChange(op, args = {}) {
  const c = loadConfig().computer; if (!c) return { ...computerState(), refused: "Pair with your computer first." };
  if (!PHONE_OPS.includes(op)) return { ...computerView(), refused: "That can't be done from here." };
  const a = {};
  if (op === "task.add") { a.text = String(args.text || "").trim().slice(0, 4000); a.repo = String(args.repo || ""); if (!a.text) return { ...computerView(), refused: "Type the task first." }; }
  if (op === "task.setDone") { a.id = String(args.id || ""); a.done = !!args.done; }
  if (op === "agent.answer") { a.path = String(args.path || ""); a.answers = (Array.isArray(args.answers) ? args.answers : []).slice(0, 5).map((x) => ({ q: String((x && x.q) || ""), a: String((x && x.a) || "").slice(0, 2000) })).filter((x) => x.q && x.a); if (!a.answers.length) return { ...computerView(), refused: "Pick or type an answer first." }; }
  if (op === "pending.approve") { a.repo = String(args.repo || ""); a.sum = String(args.sum || ""); }
  const q = loadQueue();
  if (op === "task.setDone") for (let i = q.length - 1; i >= 0; i--) if (q[i].op === "task.setDone" && q[i].args.id === a.id) q.splice(i, 1); // the last tick wins
  q.push({ id: randomUUID(), at: Date.now() + (Number(c.offset) || 0), op, args: a }); saveQueue(q);
  if (process.env.SYMBIOT_NO_POLL !== "1") setTimeout(() => { pollComputer().catch(() => {}); }, 30).unref();
  return computerView();
}
// What waits on you there, each by a key that holds while it waits: an agent's
// questions (by what they ask, so a new question tells you again), work waiting for
// your Approve (by its tasks: a file more isn't news, a task more is), and Home's
// other needs. Watch's news is told on its own (newsNotice), so it isn't here.
function waitingOn(s) {
  const out = new Map();
  for (const a of (s && s.asks) || []) { const qs = (a.questions || []).map((q) => q.q); out.set(a.id + ":" + sha(JSON.stringify(qs)).slice(0, 8), `${a.name} asks: ${qs[0] || "a question"}`); }
  for (const r of (s && s.approves) || []) { const ids = (r.tasks || []).map((t) => t.id).sort(), n = ids.length;
    out.set("approve:" + r.repo + ":" + sha(JSON.stringify(ids)).slice(0, 8), `${r.repo}: ${n ? `${n} task${n > 1 ? "s" : ""} done` : "changes without a task"}, waiting for your Approve`); }
  for (const n of (s && s.needs) || []) out.set("need:" + n.id, n.sub ? `${n.title}: ${n.sub}` : n.title);
  return out;
}
// What's newly waiting since the copy before, as one notification (a poll that finds
// three things buzzes once), or null. Nothing for the first copy after pairing: what
// was already waiting isn't news. What went (answered, approved) says nothing.
function waitingNotice(was, now, name = "your computer") {
  if (!was || !now) return null;
  const before = waitingOn(was), fresh = [...waitingOn(now)].filter(([k]) => !before.has(k)).map(([, t]) => plainText(t, 160));
  if (!fresh.length) return null;
  const more = fresh.length > 4 ? `\nand ${fresh.length - 4} more` : "";
  return [`${fresh.length === 1 ? "1 thing needs" : `${fresh.length} things need`} you · ${name}`, fresh.slice(0, 4).join("\n") + more];
}
function dismissNote(id) { const c = loadCopy(); if (c) saveCopy(c, { notes: (c.notes || []).filter((n) => n.id !== id) }); return computerView(); }
// What goes in one apply: the oldest changes, as many as fit well under the relay's cap
// (50 long tasks sealed came to more than its 256 KB, refused there), the rest next poll.
function batch(q, max = 120 * 1024) { let n = 0, size = 0; for (const o of q) { size += Buffer.byteLength(JSON.stringify(o)); if (n && size > max) break; n++; } return q.slice(0, Math.min(n, 50)); }
// Ask the computer: send what was queued here, then what's new (notified, one
// notification per watch per read), then the copy (unchanged costs nothing), and
// tell what newly waits on you in it (waitingNotice).
async function pollComputer(opts = {}) { if (polling) return polling; polling = pollOnce(opts).finally(() => { polling = null; schedulePoll(); }); return polling; }
async function pollOnce({ fetchFn = fetch, notify = desktopNotify, discover } = {}) {
  const c = loadConfig().computer; if (!c) return { ...computerState(), shown: 0 };
  if (!readSecret()) return { ...computerState(), shown: 0 };
  const via = { fetchFn, ...(discover ? { discover } : {}) }, was = loadCopy();
  const away = (r = {}) => { fails++; if (r.relay) { pollErr = r.relay; return { ...computerState(), shown: 0 }; } pollErr = `Couldn't reach ${c.name}${fails > 1 ? "" : `. It's asked again in ${BACKOFF[0] / 1000} seconds`} (it may be off or asleep${c.relay ? "" : ", or on another network"}).`; return { ...computerState(), shown: 0 }; };
  const what = (o) => plainText((o.args && (o.args.text || o.args.repo)) || "", 80);
  const note = (list) => { const copy = loadCopy(); if (copy && list.length) saveCopy(copy, { notes: [...(copy.notes || []), ...list].slice(-20) }); };
  const refused = (r) => {
    pollErr = (r.body && r.body.error) || `${c.name} answered ${r.status}.`; fails = 0;
    // unpaired there: nothing it had queued ever goes, even if it's paired again later; it
    // stayed queued, and every poll sent it again and stopped there (FINE-TUNE item 1)
    if (r.sealed && r.body && r.body.unpaired) {
      const gone = loadQueue();
      if (gone.length) { saveQueue([]); note(gone.map((o) => ({ id: o.id, op: o.op, what: what(o), error: o.op === "pending.approve" ? `Not approved: this phone was unpaired on ${c.name}.` : `Not sent: this phone was unpaired on ${c.name}.`, at: Date.now() }))); }
    }
    return { ...computerState(), shown: 0 };
  };
  let sendErr = "";
  for (let q = batch(loadQueue()), round = 0; q.length && round < 5; q = sendErr ? [] : batch(loadQueue()), round++) {
    const r = await ask("apply", { ops: q }, via);
    if (r.unreachable) return away(r);
    if (r.sealed && r.body && r.body.unpaired) return refused(r);
    // refused as a whole (a clock off, a fault there): what's queued waits for the next
    // try, and news and the copy still come, rather than stopping here every poll
    if (r.status !== 200) sendErr = `Your changes here haven't reached ${c.name} yet: ${String((r.body && r.body.error) || `it answered ${r.status}`).replace(/\.$/, "")}. They're sent again at the next try.`;
    else {
      const done = new Set((r.body.results || []).map((x) => x.id)), failed = (r.body.results || []).filter((x) => !x.ok && x.error);
      saveQueue(loadQueue().filter((o) => !done.has(o.id)));
      const fresh = failed.map((x) => { const o = q.find((y) => y.id === x.id) || {}; return { id: x.id, op: o.op, what: what(o), error: x.error, at: Date.now() }; });
      if (r.body.state && r.body.state.v) saveCopy(r.body.state, { notes: [...((loadCopy() || {}).notes || []), ...fresh].slice(-20) }); else note(fresh);
    }
  }
  const r = await ask("news", { since: c.since || 0 }, via);
  if (r.unreachable) return away(r);
  if (r.status !== 200) return refused(r);
  pollErr = sendErr; fails = 0; pollLast = Date.now(); lastVia = r.via === "relay" ? "relay" : "wifi";
  const news = Array.isArray(r.body.news) ? r.body.news : [], briefs = Array.isArray(r.body.briefs) ? r.body.briefs : [];
  const batches = new Map();
  for (const n of news) { const k = n.watch + " " + n.ts; if (!batches.has(k)) batches.set(k, []); batches.get(k).push(n); }
  for (const [k, list] of batches) { const b = briefs.find((x) => x.watch + " " + x.ts === k); notify(...newsNotice(list, list[0].name, b ? b.text : "")); }
  if (news.length) { const cfg = loadConfig(); if (cfg.computer) { cfg.computer.since = Math.max(Number(cfg.computer.since) || 0, ...news.map((n) => Number(n.ts) || 0)); saveConfig(cfg); } }
  const copy = loadCopy(), st = await ask("state", { etag: (copy && copy.v) || "" }, via);
  if (st.status === 200 && st.body && st.body.v) { saveCopy(st.body); const cfg = loadConfig(); if (cfg.computer && !!cfg.computer.relayOff !== (st.body.relay === false)) { cfg.computer.relayOff = st.body.relay === false; saveConfig(cfg); } }
  else if (st.status === 304 && copy) saveCopy(copy);
  const waiting = waitingNotice(was, loadCopy(), c.name);
  if (waiting) notify(...waiting);
  return { ...computerState(), shown: batches.size + (waiting ? 1 : 0) };
}
// Every 2 minutes; after a failed ask sooner (15 s, 30 s, a minute), so a phone
// that changed networks or a computer that woke is back without a wait.
function schedulePoll(wait) {
  if (!(loadConfig().computer || {}).id || process.env.SYMBIOT_NO_POLL === "1") return;
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => { pollTimer = null; pollComputer().catch(() => {}); }, wait !== undefined ? wait : fails ? BACKOFF[Math.min(fails, BACKOFF.length + 1) - 1] || POLL_MS : POLL_MS);
  pollTimer.unref();
}
function startComputerPoll({ soon = false } = {}) { if (pollTimer && !soon) return; schedulePoll(soon ? 1500 : 15000); }

// ---- both ------------------------------------------------------------------------------------
const phoneState = () => (PHONE ? computerView() : linkState());
// While the app runs: the computer listens if it's switched on; the phone asks if it's paired.
function startPhone() { if (PHONE) startComputerPoll(); else startPhoneLink(); }

export { computerCopy, reportsForPhone, cutReport, PHONE_REPORTS, REPORT_CAP, PORT, PHONE, ANDROID_APP, PHONE_OPS, lanAddresses, mdnsAddresses, linkState, newCode, unpairPhone, setRelay, startPhoneLink, stopPhoneLink, setPhoneLink, setPhoneApprove, phoneApprovals, snapshot, computerUrl, parsePairLink, pairLink, computerState, computerView, waitingNotice, findComputers, pairComputer, forgetComputer, pollComputer, queueChange, dismissNote, startComputerPoll, phoneState, startPhone, newKeys, linkKey, fingerprint, seal, unseal, relayOf, answer, fitRelay, RELAY_MAX, relaunchEnv, adbLink, freePhonePort, usePhonePort, portHolder, ask };
