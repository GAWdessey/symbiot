// symbiot — Watch on your phone: what Symbiot on your computer finds (Watch,
// watch.mjs) shows up as a notification on your phone, through the Symbiot there
// (the Android app, or Symbiot in Termux).
//
// The computer: switched on in Settings, it listens on your network (port 7392)
// for just two things: pairing, with a 6-digit code it shows for 10 minutes,
// and "what's new since …" for a phone that paired. Nothing else is served there,
// and nothing can be changed from it. The app itself stays on 127.0.0.1.
// The phone: paired once with the computer's address and that code, it asks every
// 2 minutes while it runs and notifies what's new, with the brief if there is one.
//
// config.phoneLink = { on, port?, phones: [{ id, name, token, added }] } (computer)
// config.computer  = { url, token, name, since } (phone; since: the computer's
// clock, so only what's newer comes back)
import { createServer } from "node:http";
import { hostname, networkInterfaces } from "node:os";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { loadConfig, saveConfig, hasCmd } from "./core.mjs";
import { newsAfter, newsNotice } from "./watch.mjs";
import { desktopNotify } from "./desktop.mjs";

const PORT = 7392;
const CODE_MS = 10 * 60 * 1000, CODE_TRIES = 5;
const POLL_MS = 2 * 60 * 1000;
const PHONE = process.platform === "android"; // the Android app, or Termux
const same = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && x.length > 0 && timingSafeEqual(x, y); };

// ---- the computer ----------------------------------------------------------------
function linkCfg(cfg = loadConfig()) {
  const l = cfg.phoneLink || {};
  return { on: !!l.on, port: Number(l.port) || PORT, phones: Array.isArray(l.phones) ? l.phones.filter((p) => p && p.token) : [] };
}
function saveLink(l) { const cfg = loadConfig(); cfg.phoneLink = l; return saveConfig(cfg); }
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

let listener = null, listenErr = "", pairing = null; // pairing: { code, until, tries }
const lastSeen = new Map(); // phone id -> when it last asked
function linkState() {
  const l = linkCfg();
  if (pairing && Date.now() > pairing.until) pairing = null;
  return { role: "computer", on: l.on, port: l.port, listening: !!listener, ...(listenErr ? { error: listenErr } : {}), addresses: lanAddresses(),
    phones: l.phones.map((p) => ({ id: p.id, name: p.name, added: p.added, ...(lastSeen.has(p.id) ? { seen: lastSeen.get(p.id) } : {}) })),
    ...(pairing ? { code: pairing.code, until: pairing.until } : {}) };
}
// A new pairing code, good for 10 minutes and 5 tries.
function newCode() { pairing = { code: String(randomInt(0, 1e6)).padStart(6, "0"), until: Date.now() + CODE_MS, tries: 0 }; return linkState(); }
function unpairPhone(id) { const l = linkCfg(); l.phones = l.phones.filter((p) => p.id !== id); lastSeen.delete(id); saveLink(l); return linkState(); }

function reply(res, code, obj) { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); }
function body(req) {
  return new Promise((resolve) => {
    let d = ""; req.on("data", (ch) => { d += ch; if (d.length > 4096) req.destroy(); });
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}
async function handle(req, res) {
  const u = new URL(req.url, "http://phone");
  if (u.pathname === "/phone/pair" && req.method === "POST") {
    const b = await body(req);
    if (!pairing || Date.now() > pairing.until) { pairing = null; return reply(res, 403, { error: "No pairing code is open. In Symbiot on your computer, open Settings → Watch on your phone and click New code." }); }
    if (!same(String(b.code || "").replace(/\D/g, ""), pairing.code)) {
      if (++pairing.tries >= CODE_TRIES) pairing = null;
      return reply(res, 403, { error: pairing ? "That code isn't right. Check it on your computer." : "That code was wrong too many times. Click New code on your computer." });
    }
    pairing = null;
    const l = linkCfg(), p = { id: randomBytes(4).toString("hex"), name: String(b.name || "Phone").replace(/\s+/g, " ").trim().slice(0, 40) || "Phone", token: randomBytes(24).toString("hex"), added: Date.now() };
    l.phones = [...l.phones, p].slice(-5); saveLink(l);
    return reply(res, 200, { token: p.token, id: p.id, name: hostname(), now: Date.now() });
  }
  if (u.pathname === "/phone/news" && req.method === "GET") {
    const p = linkCfg().phones.find((x) => same(x.token, req.headers["x-symbiot-phone"]));
    if (!p) return reply(res, 403, { error: "This phone isn't paired any more. Pair it again." });
    lastSeen.set(p.id, Date.now());
    const { news, briefs } = newsAfter(u.searchParams.get("since"));
    return reply(res, 200, { name: hostname(), now: Date.now(), news: news.slice(0, 100), briefs: briefs.slice(0, 20) });
  }
  reply(res, 404, { error: "not found" });
}
// Listen on the network while it's switched on. Gives the state.
function startPhoneLink() {
  const l = linkCfg();
  if (!l.on || listener) return Promise.resolve(linkState());
  return new Promise((resolve) => {
    const srv = createServer((req, res) => { handle(req, res).catch(() => { try { reply(res, 500, { error: "failed" }); } catch {} }); });
    srv.on("error", (e) => {
      listenErr = e && e.code === "EADDRINUSE" ? `Port ${l.port} is in use by something else on this computer.` : `Couldn't listen on port ${l.port}: ${(e && e.message) || e}`;
      listener = null; resolve(linkState());
    });
    srv.listen(l.port, "0.0.0.0", () => { listener = srv; listenErr = ""; srv.unref(); resolve(linkState()); });
  });
}
function stopPhoneLink() { if (listener) { listener.close(); if (listener.closeAllConnections) listener.closeAllConnections(); } listener = null; pairing = null; }
async function setPhoneLink(on) {
  const l = linkCfg(); l.on = !!on; saveLink(l);
  if (!on) { stopPhoneLink(); listenErr = ""; return linkState(); }
  await startPhoneLink();
  return listener && !pairing ? newCode() : linkState();
}

// ---- the phone -------------------------------------------------------------------
// What the user typed as the computer's address: "192.168.8.50", ":7392" optional.
function computerUrl(input) {
  let s = String(input || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  try { const u = new URL(s); if (!u.hostname) return ""; if (!u.port) u.port = String(PORT); return `${u.protocol}//${u.host}`; } catch { return ""; }
}
const canNotify = () => process.env.SYMBIOT_ANDROID_APP === "1" || !PHONE || hasCmd("termux-notification");
let pollLast = 0, pollErr = "", pollTimer = null;
function computerState() {
  const c = loadConfig().computer;
  return { role: "phone", paired: !!(c && c.token), ...(c && c.token ? { name: c.name, url: c.url } : {}), ...(pollLast ? { last: pollLast } : {}), ...(pollErr ? { error: pollErr } : {}), notify: canNotify(), termux: PHONE && process.env.SYMBIOT_ANDROID_APP !== "1" };
}
async function pairComputer(address, code, { fetchFn = fetch, name = hostname() } = {}) {
  const url = computerUrl(address);
  if (!url) return { ...computerState(), error: "Type your computer's address, as Symbiot shows it there (like 192.168.8.50:7392)." };
  if (!/^\d{6}$/.test(String(code || "").replace(/\s/g, ""))) return { ...computerState(), error: "Type the 6-digit code your computer shows." };
  let r;
  try { r = await fetchFn(url + "/phone/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: String(code).replace(/\s/g, ""), name: name === "localhost" ? "Phone" : name }), signal: AbortSignal.timeout(8000) }); }
  catch { return { ...computerState(), error: `Couldn't reach ${url}. Is Symbiot running there, with Watch on your phone switched on, and is this phone on the same Wi-Fi? A firewall on the computer may need to allow port ${new URL(url).port}.` }; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) return { ...computerState(), error: j.error || `Your computer answered ${r.status}.` };
  const cfg = loadConfig(); cfg.computer = { url, token: j.token, name: String(j.name || "your computer").slice(0, 60), since: Number(j.now) || Date.now() }; saveConfig(cfg);
  pollErr = ""; startComputerPoll();
  return computerState();
}
function forgetComputer() { const cfg = loadConfig(); delete cfg.computer; saveConfig(cfg); pollErr = ""; pollLast = 0; return computerState(); }
// Ask the computer what's new and notify it here, one notification per watch
// per read, as the computer did. Gives { state, shown }.
async function pollComputer({ fetchFn = fetch, notify = desktopNotify } = {}) {
  const c = loadConfig().computer; if (!c || !c.token) return { ...computerState(), shown: 0 };
  let r;
  try { r = await fetchFn(`${c.url}/phone/news?since=${encodeURIComponent(c.since || 0)}`, { headers: { "x-symbiot-phone": c.token }, signal: AbortSignal.timeout(10000) }); }
  catch { pollErr = `Couldn't reach ${c.name} at ${c.url}. It's asked again in a few minutes (the computer may be off or asleep, or on another network).`; return { ...computerState(), shown: 0 }; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { pollErr = j.error || `${c.name} answered ${r.status}.`; return { ...computerState(), shown: 0 }; }
  pollErr = ""; pollLast = Date.now();
  const news = Array.isArray(j.news) ? j.news : [], briefs = Array.isArray(j.briefs) ? j.briefs : [];
  const batches = new Map();
  for (const n of news) { const k = n.watch + " " + n.ts; if (!batches.has(k)) batches.set(k, []); batches.get(k).push(n); }
  for (const [k, list] of batches) { const b = briefs.find((x) => x.watch + " " + x.ts === k); notify(...newsNotice(list, list[0].name, b ? b.text : "")); }
  if (news.length) { const cfg = loadConfig(); if (cfg.computer) { cfg.computer.since = Math.max(Number(cfg.computer.since) || 0, ...news.map((n) => Number(n.ts) || 0)); saveConfig(cfg); } }
  return { ...computerState(), shown: batches.size };
}
function startComputerPoll(opts) {
  if (pollTimer || !(loadConfig().computer || {}).token) return;
  const tick = () => { if (!(loadConfig().computer || {}).token) { clearInterval(pollTimer); pollTimer = null; return; } pollComputer(opts).catch(() => {}); };
  setTimeout(tick, 15000).unref();
  pollTimer = setInterval(tick, POLL_MS); pollTimer.unref();
}

// ---- both ------------------------------------------------------------------------
const phoneState = () => (PHONE ? computerState() : linkState());
// While the app runs: the computer listens if it's switched on; the phone asks if it's paired.
function startPhone() { if (PHONE) startComputerPoll(); else startPhoneLink(); }

export { PORT, lanAddresses, linkState, newCode, unpairPhone, startPhoneLink, stopPhoneLink, setPhoneLink, computerUrl, computerState, pairComputer, forgetComputer, pollComputer, startComputerPoll, phoneState, startPhone };
