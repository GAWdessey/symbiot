// Symbiot's extension in the user's own Chrome (ownchrome.mjs, extension/, ownchrome-host.mjs):
// the extension's fixed ID and what it may ask Chrome for, page.js built from the hidden
// browser's page code with no code sent at run time, setting up the host for the browsers on
// this computer, the native host passing messages both ways, the broker, the service worker's
// rules (a site only once Chrome allowed it, its own window and tab group, Stop), and mapping,
// pressing and typing through it, with sends, payments and deletes never pressed by an agent, and
// a saved sign-in from the vault filled only on the site it's saved for, its value never given back.
//
//   node test/ownchrome.mjs
//
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { deflateSync } from "node:zlib";
const HOME = mkdtempSync(join(tmpdir(), "symbiot-ownchrome-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_VAULT = "file"; mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const O = await import("../ownchrome.mjs");
const { loadScreens } = await import("../screens.mjs");
const { saveConfig, loadConfig } = await import("../core.mjs");
// Chrome's picture of a page: 640×400 grey, as base64
const PNG = (() => {
  const W = 640, H = 400, crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4, "ascii"); d.copy(o, 8); o.writeUInt32BE(crc(o.subarray(4, 8 + d.length)), 8 + d.length); return o; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc((W + 1) * H, 200); for (let y = 0; y < H; y++) raw[y * (W + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
})();
const frame = (m) => { const b = Buffer.from(JSON.stringify(m)), h = Buffer.alloc(4); h.writeUInt32LE(b.length, 0); return Buffer.concat([h, b]); };
const unframe = (buf) => { const out = []; while (buf.length >= 4) { const n = buf.readUInt32LE(0); if (buf.length < 4 + n) break; out.push(JSON.parse(buf.subarray(4, 4 + n).toString())); buf = buf.subarray(4 + n); } return { out, rest: buf }; };
const until = async (f, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await f(); if (v) return v; await sleep(25); } return null; };

const procs = [];
try {
  console.log("THE EXTENSION — a fixed ID, nothing allowed when it's installed, no DevTools");
  const man = JSON.parse(readFileSync(join(ROOT, "extension/manifest.json"), "utf8"));
  ok("its ID comes from its key, 32 letters a–p", /^[a-p]{32}$/.test(O.EXT_ID) && O.EXT_ID === O.extId(man.key) && O.EXT_ID === "giiidfijnbnnbkmfgdejldfcpaanecil", O.EXT_ID);
  ok("Manifest V3, sites only as optional permissions (each asked for), never chrome.debugger", man.manifest_version === 3 && !man.host_permissions && !man.content_scripts && Array.isArray(man.optional_host_permissions) && !man.permissions.includes("debugger") && man.permissions.includes("nativeMessaging"), man);
  ok("its files are all in the package", ["background.js", "popup.html", "popup.js", "icon.png"].every((f) => existsSync(join(ROOT, "extension", f))) && JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).files.some((f) => f === "extension") && JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).files.includes("ownchrome.mjs") && JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).files.includes("ownchrome-host.mjs"));

  console.log("PAGE.JS — the hidden browser's page code, called by name");
  const js = O.pageJs();
  let page = null; try { const box = { self: {} }; vm.runInNewContext(js, box); page = box.self.__symbiot; } catch (e) { page = { error: String(e) }; }
  ok("it parses and names its functions", page && ["collect", "block", "view", "scroll", "find", "modal", "click", "type"].every((k) => typeof page[k] === "function"), page && Object.keys(page));
  ok("every argument is the function's own: no stand-in left in it", !js.includes("\\u0001") && !js.includes("\u0001") && /__a\[2\]/.test(js));
  ok("fnOf: a builder's JSON argument becomes the function's", O.fnOf((a, b) => `(${JSON.stringify(a)} + ${JSON.stringify({ x: b })}.x)`, 2) === "(...__a) => (__a[0] + {\"x\":__a[1]}.x)");
  const dir = join(HOME, "ext"), w1 = O.writeExtension(dir), w2 = O.writeExtension(dir);
  ok("writing the folder writes each file once; again, nothing changed", w1.changed === readdirSync(join(ROOT, "extension")).length + 1 && w2.changed === 0 && readFileSync(join(dir, "page.js"), "utf8") === js, { w1, w2 });

  console.log("SETTING UP — the host, for the browsers on this computer");
  const fake = join(HOME, "fakehome"); mkdirSync(join(fake, ".config/google-chrome"), { recursive: true }); mkdirSync(join(fake, ".config/BraveSoftware/Brave-Browser"), { recursive: true });
  const set = O.setupOwnChrome({ home: fake, platform: "linux" });
  const hm = JSON.parse(readFileSync(join(fake, ".config/google-chrome/NativeMessagingHosts", O.HOST_NAME + ".json"), "utf8"));
  ok("registered with Chrome and Brave, which are here, not Chromium or Edge, which aren't", set.browsers.join() === "Chrome,Brave" && !existsSync(join(fake, ".config/chromium")) && set.setUp && set.hosts.join() === "Chrome,Brave", set);
  ok("…for this extension alone, starting the launcher", hm.name === O.HOST_NAME && hm.type === "stdio" && hm.allowed_origins.length === 1 && hm.allowed_origins[0] === `chrome-extension://${O.EXT_ID}/` && existsSync(hm.path), hm);
  const sh = readFileSync(hm.path, "utf8");
  ok("the launcher runs node with the host and the app's socket, quoted", sh.startsWith("#!/bin/sh\nexec '") && sh.includes("ownchrome-host.mjs") && sh.includes("--sock '" + O.OWN_SOCK + "'"), sh);
  const { browserBrief, OWN_EXT_LINE } = await import("../browserfails.mjs");
  ok("once it's set up, every brief names the route and what stays the user's", browserBrief(false, []).includes(OWN_EXT_LINE) && /--own-chrome/.test(OWN_EXT_LINE) && /sends, posts, pays or deletes, or Enter in a message box, waits for their Go/.test(OWN_EXT_LINE));
  ok("Windows: a registry key per browser, pointing at the host's manifest", O.browsers(fake, "win32").every((b) => b.key && b.key.endsWith("\\NativeMessagingHosts\\" + O.HOST_NAME)));
  const regs = []; O.setupOwnChrome({ home: fake, platform: "win32", run: (cmd, args) => { regs.push([cmd, ...args].join(" ")); return { status: 0 }; } });
  ok("…written with reg add, its default value the manifest", regs.length === 4 && regs.every((r) => /^reg add HKCU\\Software\\.+ \/ve \/t REG_SZ \/d .+com\.symbiot\.chrome\.json \/f$/.test(r)), regs);

  console.log("THE NATIVE HOST — Chrome's 4-byte frames to the app's lines, and back");
  const sock = join(HOME, "t.sock");
  O.startBroker({ sock });
  ok("before the extension says hello: not connected, and a question says how to set it up", !O.ownChromeStatus().connected && /Settings → Connections → Your own Chrome/.test((await O.askChrome("hello")).error));
  const host = spawn(process.execPath, [join(ROOT, "ownchrome-host.mjs"), "--sock", sock, `chrome-extension://${O.EXT_ID}/`], { stdio: ["pipe", "pipe", "inherit"] }); procs.push(host);
  let hbuf = Buffer.alloc(0); const fromHost = [];
  host.stdout.on("data", (d) => { const r = unframe(Buffer.concat([hbuf, d])); hbuf = r.rest; fromHost.push(...r.out); });
  host.stdin.write(frame({ event: "hello", version: "0.1.0", origins: ["https://example.com/*", "chrome://favicon/*"], asks: [], stopped: false }));
  const st = await until(() => O.ownChromeStatus().connected && O.ownChromeStatus());
  ok("a site allowed there goes there by itself; any other, or a page that isn't a web address, doesn't", await until(() => O.ownChromeFor("example.com/x")) && !O.ownChromeFor("https://other.example/") && !O.ownChromeFor("chrome://settings"));
  ok("its hello reaches the app: connected, with the sites Chrome allowed", st && st.version === "0.1.0" && st.origins.join() === "https://example.com", st);
  const q = O.askChrome("map", { url: "https://example.com/" }, { timeout: 5000 });
  const asked = await until(() => fromHost.find((m) => m.op === "map"));
  ok("the app's question reaches the extension as a frame", asked && asked.url === "https://example.com/" && /^q\d+$/.test(asked.id), fromHost);
  host.stdin.write(frame({ id: asked.id, info: { url: "https://example.com/", title: "Ex", items: [] }, png: PNG, view: { w: 2, h: 2, dpr: 1 }, tab: 4 }));
  const ans = await q;
  ok("…and its answer comes back to the question", ans.tab === 4 && ans.png === PNG, ans);
  ok("a question no one answers gives up and says so", (await O.askChrome("look", { tab: 1 }, { timeout: 300 })).error === "Your Chrome didn't answer in time.");
  host.stdin.end(); await until(() => host.exitCode !== null);
  ok("Chrome closing the port ends the host, and the app hears it went", host.exitCode === 0 && await until(() => !O.ownChromeStatus().connected), host.exitCode);

  console.log("THE SERVICE WORKER — allowed sites only, its own window and group, Stop");
  const W = worker();
  await until(() => W.port);
  ok("it connects to Symbiot's host by name and says hello", W.native === O.HOST_NAME && W.sent.some((m) => m.event === "hello"));
  let r = await W.ask({ op: "map", url: "https://bank.example/" });
  ok("a site Chrome hasn't allowed: refused, asked for on its toolbar button, nothing opened", r.error === "not allowed" && r.origin === "https://bank.example" && W.local.asks.join() === "https://bank.example" && W.badge === "!" && W.tabs.size === 0, { r, asks: W.local.asks });
  r = await W.ask({ op: "map", url: "chrome://settings/" });
  ok("a page that isn't a web address isn't opened", /web address/.test(r.error || ""));
  W.granted.add("https://example.com/*");
  r = await W.ask({ op: "map", url: "https://example.com/a" });
  ok("an allowed site: opened in its own unfocused window, in the Symbiot group, mapped and pictured", r.png === "AAAA" && r.info && r.info.title === "Fake" && r.tab && W.windows[0].focused === false && W.groupTitle === "Symbiot" && r.view.dpr === 2, r);
  ok("…through page.js, by name: no code sent", W.calls.every((c) => c.files ? c.files.join() === "page.js" : typeof c.args[0] === "string") && W.calls.some((c) => c.args && c.args[0] === "collect"));
  const tab1 = r.tab;
  r = await W.ask({ op: "map", url: "https://example.com/b" });
  ok("the same site again: the same tab", r.tab === tab1 && W.tabs.size === 1, [...W.tabs.keys()]);
  r = await W.ask({ op: "tab", url: "https://example.com/b#x" });
  ok("its tab still at the page: left as it is (what was typed stays)", r.tab === tab1 && r.same === true, r);
  r = await W.ask({ op: "run", tab: 999, fn: "click", args: [1, 2] });
  ok("a tab that isn't one of Symbiot's is never touched", /isn't one of Symbiot's/.test(r.error || ""), r);
  r = await W.ask({ op: "run", tab: tab1, fn: "click", args: [1, 2] });
  ok("one of its tabs: the page.js function runs there", r.result && r.result.clicked === "1,2", r);
  W.granted.delete("https://example.com/*");
  r = await W.ask({ op: "run", tab: tab1, fn: "click", args: [1, 2] });
  ok("Forget in Chrome: its tab there is refused at once", r.error === "not allowed", r);
  W.granted.add("https://example.com/*");
  await W.ask({ op: "put", key: "k1", file: 0, part: 1, parts: 2, data: "Q0Q=" });
  await W.ask({ op: "put", key: "k1", file: 0, part: 0, parts: 2, data: "QUJ" });
  r = await W.ask({ op: "attach", tab: tab1, key: "k1", files: [{ name: "a.txt", type: "text/plain" }] });
  const att = W.calls.filter((c) => c.args && c.args[0] === "attach").pop();
  ok("Upload's pieces, in any order, put together and handed to page.js's attach in its tab", r.result && r.result.attached === 1 && att && att.args[1][0][0].b64 === "QUJQ0Q=" && att.args[1][0][0].name === "a.txt", { r, att: att && att.args });
  r = await W.ask({ op: "attach", tab: tab1, key: "k1", files: [{ name: "a.txt" }] });
  ok("…once: asked again, it says the file didn't arrive", /didn't arrive whole/.test(r.error || ""), r);
  await W.ask({ op: "put", key: "k2", file: 0, part: 0, parts: 2, data: "QUJ" });
  ok("…and a file missing a piece isn't put in the box", /didn't arrive whole/.test((await W.ask({ op: "attach", tab: tab1, key: "k2", files: [{ name: "a.txt" }] })).error || ""));
  W.granted.delete("https://example.com/*");
  r = await W.ask({ op: "stop" });
  ok("Stop closes its tabs and lets go of Symbiot", r.ok && W.tabs.size === 0 && W.disconnected === true && W.local.stopped === true, { tabs: W.tabs.size });

  console.log("MAPPING AND ACTING THROUGH IT — the screen, the rules");
  saveConfig({ ...loadConfig(), trustedSites: ["example.com"], sites: [{ hosts: ["linked.example"] }] });
  O.setStarter(() => { throw new Error("no Chrome is started in these tests"); });
  const fakeExt = await extension(sock);
  ok("a site that isn't linked or trusted in Symbiot isn't opened in your Chrome", /isn't one of your linked or trusted sites/.test((await O.mapInOwnChrome("https://other.example/")).error || "") && !fakeExt.got.some((m) => m.op === "map"));
  fakeExt.on.map = (m) => m.url.includes("linked.example") ? { error: "not allowed", origin: "https://linked.example" } : look(m.url);
  r = await O.mapInOwnChrome("https://linked.example/");
  ok("a linked site Chrome hasn't allowed: where to press Allow", /click Symbiot's button in the toolbar and press Allow next to linked\.example/.test(r.error || "") && r.allow === "linked.example", r);
  const s = await O.mapInOwnChrome("https://example.com/inbox", "Inbox");
  ok("an allowed one: saved as a screen of your own Chrome, its regions in the picture's pixels", s.via === "own-chrome" && s.name === "Inbox" && s.page.dpr === 2 && s.regions.length === 6 && s.regions[0].x === 20 && s.regions[0].w === 200, s);
  ok("…and kept as one", (loadScreens().find((x) => x.id === s.id) || {}).via === "own-chrome" && O.ownScreen(s.id));
  fakeExt.on.map = (m) => ({ ...look(m.url), png: "" });
  const d = await O.mapInOwnChrome("https://example.com/inbox", "Drawn");
  ok("no picture from Chrome (it needs every site for one): the page drawn at the window's size, regions in place, and says so", d.drawn === true && d.w === 320 && d.h === 200 && !d.page.dpr && d.regions[0].x === 10 && d.regions[0].w === 100 && /drawing of the page/.test(d.note), d);
  fakeExt.on.map = (m) => look(m.url);
  const send = s.regions.find((x) => x.label === "Send"), del = s.regions.find((x) => x.label === "Delete account"), box = s.regions.find((x) => x.label === "Message");
  fakeExt.got.length = 0;
  r = await O.pressInOwnChrome(s.id, send.id, { confirmed: true });
  ok("Send waits for the user's Go, confirmed or not: a hold, and the card to ask for it, nothing pressed", r.held === "send" && /^[0-9a-f]{8}$/.test(r.hold) && new RegExp("\\{#chrome-go-" + r.hold + "\\}").test(r.error) && /go ahead: Clicks Send/.test(r.error) && !fakeExt.got.length, r);
  const again = await O.pressInOwnChrome(s.id, send.id, { confirmed: true });
  ok("…asked again before the Go: the same hold, not a second card", again.hold === r.hold);
  const { goAhead } = await import("../chromegate.mjs");
  goAhead(r.hold);
  const went = await O.pressInOwnChrome(s.id, send.id, { confirmed: true });
  ok("…after the Go: pressed, once", went.pressed === "Send" && fakeExt.got.some((m) => m.fn === "click"), went);
  ok("…and the next Send waits again", (await O.pressInOwnChrome(s.id, send.id, { confirmed: true })).held === "send");
  ok("a draft-only run never sends, Go or not", /only drafts/.test((await O.pressInOwnChrome(s.id, send.id, { confirmed: true, noSend: true })).error || ""));
  fakeExt.got.length = 0;
  r = await O.pressInOwnChrome(s.id, del.id, { confirmed: true });
  ok("…a delete waits for the Go too", r.held === "delete" && /deletes as the user/.test(r.error) && !fakeExt.got.length, r);
  r = await O.typeInOwnChrome(s.id, box.id, "Hello there", { enter: true });
  ok("Enter in a message box can send: held for the Go, nothing typed", r.held === "send" && /Presses Enter in Message/.test(r.error) && !fakeExt.got.some((m) => m.fn === "type"), r);
  r = await O.typeInOwnChrome(s.id, box.id, "Hello there");
  ok("typing on a trusted site: clicked where the field is now (page pixels), typed, the page mapped again", r.typed === "Message" && r.via === "own-chrome" && r.found === true && r.kept === true && fakeExt.got.some((m) => m.fn === "click" && m.args[0] === 210 && m.args[1] === 70) && fakeExt.got.some((m) => m.fn === "type" && m.args[0] === "Hello there" && m.args[1] === false), { r, got: fakeExt.got.map((m) => [m.op, m.fn, m.args]) });
  fakeExt.got.length = 0;
  r = await O.typeInOwnChrome(s.id, box.id, "there", { replace: "Hello" });
  ok("Replace: the part selected, the new text put in its place", r.replaced === "Hello" && fakeExt.got.some((m) => m.fn === "selectPart" && m.args[0] === "Hello") && fakeExt.got.some((m) => m.fn === "insert" && m.args[0] === "there"), { r, got: fakeExt.got.map((m) => [m.fn, m.args]) });
  saveConfig({ ...loadConfig(), trustedSites: [], sites: [{ hosts: ["example.com"] }] });
  r = await O.pressInOwnChrome(s.id, box.id);
  ok("on a site that's linked but not trusted: your confirmation first", r.confirm === true && r.host === "example.com", r);
  const plan = s.regions.find((x) => x.label === "Plan"), subj = s.regions.find((x) => x.label === "Subject"), save = s.regions.find((x) => x.label === "Save");
  fakeExt.got.length = 0;
  const run0 = fakeExt.on.run;
  fakeExt.on.run = (m) => m.fn === "chooseSelect" ? { result: { native: true, chose: "Pro", value: "pro" } } : run0(m);
  saveConfig({ ...loadConfig(), trustedSites: ["example.com"] });
  r = await O.chooseInOwnChrome(s.id, plan.id, "Pro");
  ok("Choose: a native menu set in the page, by its label", r.chose === "Pro" && r.value === "pro" && fakeExt.got.some((m) => m.fn === "chooseSelect" && m.args[0] === "#p" && m.args[3] === "Pro"), r);
  ok("…only on a menu", /isn't a menu/.test((await O.chooseInOwnChrome(s.id, box.id, "x")).error || ""));
  fakeExt.on.run = (m) => m.fn === "chooseSelect" ? { result: { native: false } } : m.fn === "chooseOption" ? { result: { chose: "Delete everything", at: { x: 5, y: 5 } } } : run0(m);
  r = await O.chooseInOwnChrome(s.id, plan.id, "Delete everything");
  ok("…a site's own menu whose option deletes: not chosen by an agent", r.held === "delete" && !fakeExt.got.some((m) => m.fn === "click" && m.args[0] === 5), r);
  fakeExt.on.run = run0; fakeExt.got.length = 0;
  r = await O.fillInOwnChrome(s.id, [{ region: subj.id, text: "Hi" }, { region: box.id, text: "Body" }], { press: save.id });
  ok("Fill: each field typed where it is, then Save pressed, one map after", JSON.stringify(r.typed) === '["Subject","Message"]' && r.pressed === "Save" && fakeExt.got.filter((m) => m.fn === "type").length === 2 && fakeExt.got.filter((m) => m.op === "look").length === 1, { r, got: fakeExt.got.map((m) => [m.op, m.fn]) });
  fakeExt.got.length = 0;
  r = await O.fillInOwnChrome(s.id, [{ region: box.id, text: "Body" }], { press: send.id });
  ok("…with Send to press: held for the Go before anything is typed", r.held === "send" && !fakeExt.got.length, r);
  fakeExt.on.run = (m) => m.fn === "find" && m.args[0] === "#save" ? { result: { x: 1, y: 1, by: "spot" } } : run0(m);
  r = await O.fillInOwnChrome(s.id, [{ region: subj.id, text: "Hi" }], { press: save.id });
  ok("…and a button that isn't on the page now: nothing typed or pressed", /isn't on the page now/.test(r.error || "") && !fakeExt.got.some((m) => m.fn === "type"), r);
  fakeExt.on.run = run0;

  console.log("A SAVED SIGN-IN — filled on its own site only, never seen");
  const V = await import("../vault.mjs"), VV = await import("../vaultview.mjs");
  V.saveSecret("example password (pat@example.com)", ["S3cret-pw!"], { site: "https://accounts.example.com/login" });
  V.saveSecret("other password", ["0ther-pw!"], { site: "other.example" });
  V.saveSecret("loose password", ["L00se-pw!"]);
  V.saveSecret("example recovery codes", ["11111111", "22222222"], { site: "example.com" });
  ok("a site is kept as its domain, beside the name (never the value)", (V.listSecrets().find((x) => x.name === "example password (pat@example.com)") || {}).site === "example.com" && !readFileSync(join(HOME, ".config/symbiot/vault.json"), "utf8").includes("S3cret"));
  const pw = s.regions.find((x) => x.label === "Subject");
  fakeExt.got.length = 0;
  r = await O.secretInOwnChrome(s.id, pw.id, "example password (pat@example.com)");
  const sent = fakeExt.got.find((m) => m.fn === "secret");
  ok("on its site: the extension's page code is given it, the site and where the box is", r.filled === "Subject" && r.site === "example.com" && sent && sent.args[2] === "S3cret-pw!" && sent.args[3] === "example.com" && sent.args[0] === 210, { r, sent });
  ok("…and the answer, the screen after and the log never carry it", !JSON.stringify(r).includes("S3cret") && !JSON.stringify(loadScreens()).includes("S3cret") && VV.vaultLog().some((x) => x.act === "fill" && x.site === "example.com") && !JSON.stringify(VV.vaultLog()).includes("S3cret"), VV.vaultLog());
  ok("…a password isn't spent by filling it", (V.listSecrets().find((x) => x.name === "example password (pat@example.com)") || {}).left === 1);
  fakeExt.got.length = 0;
  r = await O.secretInOwnChrome(s.id, pw.id, "other password");
  ok("saved for another site: not filled here, and nothing reaches Chrome", /saved for other\.example, and this page is on example\.com/.test(r.error || "") && !fakeExt.got.length, r);
  r = await O.secretInOwnChrome(s.id, pw.id, "loose password");
  ok("saved with no site: its first fill waits for the user's Go on a card, nothing filled", r.held === "fill" && /fills a saved sign-in as the user, on example\.com/.test(r.error) && /which saved sign-in it fills, and on which site/.test(r.error) && new RegExp("\\{#chrome-go-" + r.hold + "\\}").test(r.error) && !fakeExt.got.length, r);
  goAhead(r.hold);
  r = await O.secretInOwnChrome(s.id, pw.id, "loose password");
  ok("…after the Go: filled, and that site is now its own", r.filled === "Subject" && (V.listSecrets().find((x) => x.name === "loose password") || {}).site === "example.com", r);
  ok("…so a save naming another site can't move it", V.saveSecret("loose password", ["junk"], { site: "evil.example" }).site === "example.com" && V.bindSite("loose password", "evil.example").error && (V.listSecrets().find((x) => x.name === "loose password") || {}).site === "example.com");
  fakeExt.got.length = 0;
  r = await O.secretInOwnChrome(s.id, pw.id, "loose password");
  ok("…and the next fill there goes straight through", r.filled === "Subject" && fakeExt.got.some((m) => m.fn === "secret"), r);
  r = await O.secretInOwnChrome(s.id, pw.id, "example recovery codes");
  ok("a set of codes: the next one filled, then spent", r.filled === "Subject" && (V.listSecrets().find((x) => x.name === "example recovery codes") || {}).left === 1, r);
  fakeExt.on.run = (m) => m.fn === "secret" ? { result: { error: "A saved sign-in goes only into a password box or a box for a code, and this one is neither, so nothing was filled." } } : run0(m);
  r = await O.secretInOwnChrome(s.id, pw.id, "example recovery codes");
  ok("the page refuses a box that isn't for a password or code: said, and the code isn't spent", /neither/.test(r.error || "") && (V.listSecrets().find((x) => x.name === "example recovery codes") || {}).left === 1, r);
  fakeExt.on.run = run0;
  ok("only into a field", /isn't a field/.test((await O.secretInOwnChrome(s.id, send.id, "loose password")).error || ""));
  ok("a name the vault doesn't have: says where the names are", /symbiot secret list/.test((await O.secretInOwnChrome(s.id, pw.id, "nope")).error || ""));
  const file = join(HOME, "invoice.pdf"); writeFileSync(file, Buffer.alloc(900 * 1024, 7));
  const putN = { n: 0 }; let joined = "";
  fakeExt.on.put = (m) => { putN.n++; joined += m.data; return { ok: true }; };
  fakeExt.on.attach = (m) => ({ result: { ok: m.files.length === 1 && m.files[0].name === "invoice.pdf" && m.files[0].type === "application/pdf" && Buffer.from(joined, "base64").length === 900 * 1024 } });
  fakeExt.on.run = (m) => m.fn === "fileBox" ? { result: { box: "the file box", how: "under the button", multiple: false } } : run0(m);
  r = await O.uploadInOwnChrome(s.id, subj.id, file);
  ok("Upload: the file sent in pieces a message can carry, put in the box whole", r.uploaded === "Subject" && putN.n === 3 && /the file box/.test(r.used), { r, pieces: putN.n });
  fakeExt.on.run = (m) => m.fn === "fileBox" ? { result: null } : run0(m);
  ok("…no file box on the page: says the system's file dialog can't be answered from here", /can't answer the system's file dialog/.test((await O.uploadInOwnChrome(s.id, subj.id, file)).error || ""));
  ok("…a file that isn't there: says so", /No file at/.test((await O.uploadInOwnChrome(s.id, subj.id, join(HOME, "nope.pdf"))).error || ""));
  fakeExt.on.run = run0;
  let y = 0;
  fakeExt.on.run = (m) => ({ result: m.fn === "height" ? { h: 1800, inside: false } : m.fn === "view" ? { w: 400, h: 600, dpr: 1 } : m.fn === "scroll" ? (y = Math.min(1200, m.args[0]), { from: 0, y, max: 1200 }) : m.fn === "collectWhole" ? { url: "https://example.com/inbox", title: "Inbox", items: [{ label: "Top", kind: "button", x: 5, y: 5, w: 50, h: 20, selector: "#t" }, ...(y >= 1200 ? [{ label: "Bottom", kind: "link", x: 5, y: 1700, w: 50, h: 20, selector: "#b" }] : [])] } : true });
  r = await O.wholeInOwnChrome(s.id);
  ok("Whole page: scrolled a window at a time to the bottom, drawn as one tall screen, top to bottom", r.drawn && r.h === 1800 && r.w === 400 && r.page.full === true && r.regions.map((x) => x.label).join() === "Top,Bottom" && /\(whole page\)$/.test(r.name) && fakeExt.got.filter((m) => m.fn === "wholeDone").length === 2, { r, got: fakeExt.got.filter((m) => m.op === "run").map((m) => [m.fn, m.args]) });
  fakeExt.on.run = (m) => ({ result: m.fn === "height" ? { h: 900, inside: true } : null });
  ok("…a page whose list scrolls inside it says to use Scroll", (await O.wholeInOwnChrome(s.id)).inside === true);
  fakeExt.on.run = run0;
  saveConfig({ ...loadConfig(), trustedSites: [], sites: [{ hosts: ["example.com"] }] });
  fakeExt.on.run = (m) => m.fn === "scroll" ? { result: { from: 0, y: 400, max: 800 } } : { result: null };
  r = await O.scrollInOwnChrome(s.id, "down");
  ok("Scroll: moved there, what's in the window then mapped, named for how far down", r.scrolled === "down" && r.name === "Inbox ↓ 50%" && r.via === "own-chrome", r);
  fakeExt.close(); await until(() => !O.ownChromeStatus().connected);
  let started = 0; O.setStarter(() => { started++; });
  r = await O.pressInOwnChrome(s.id, box.id, { confirmed: true });
  ok("Chrome closed: started plainly once, and when the extension doesn't come, says so; the hidden browser isn't used instead", started === 1 && r.offline === true && /isn't connected/.test(r.error), { started, r });
  r = await O.pressInOwnChrome(s.id, box.id, { confirmed: true });
  ok("…not started again within the minute", started === 1 && r.offline === true);
  O.setStarter(() => { started++; setTimeout(() => extension(sock).then((e) => { e.on.run = fakeExt.on.run; }), 300); });
  r = await O.pressInOwnChrome(s.id, box.id, { confirmed: true });
  ok("…and when it does come: carries on in it", started === 2 && r.pressed === "Message", r);
} catch (e) { fail++; console.log("  ✗ threw: " + (e && e.stack || e)); }
finally { for (const p of procs) try { p.kill(); } catch {} O.stopBroker(); rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// A page as the extension gives it: a field and two buttons, at a device pixel ratio of 2.
function look(url) {
  return { tab: 9, view: { w: 320, h: 200, dpr: 2 }, png: PNG, seen: { text: "Inbox", review: "" }, info: { url, title: "Inbox", items: [
    { label: "Message", kind: "field", x: 10, y: 50, w: 100, h: 20, selector: "#m" },
    { label: "Send", kind: "button", x: 120, y: 50, w: 40, h: 20, selector: "#s" },
    { label: "Delete account", kind: "button", x: 10, y: 100, w: 80, h: 20, selector: "#d" },
    { label: "Plan", kind: "menu", x: 10, y: 130, w: 80, h: 20, selector: "#p" },
    { label: "Subject", kind: "field", x: 10, y: 160, w: 80, h: 20, selector: "#subj" },
    { label: "Save", kind: "button", x: 100, y: 160, w: 40, h: 20, selector: "#save" },
  ] } };
}
// The extension's side of the app's socket, as the host passes it on: hello, then answers.
async function extension(sock) {
  const c = connect(sock), got = [], on = {
    tab: () => ({ tab: 9, same: true }), map: (m) => look(m.url), look: () => look("https://example.com/inbox"), wait: () => ({ ok: true }),
    run: (m) => ({ result: m.fn === "find" ? { x: 210, y: 70, by: "selector", clear: true } : m.fn === "modal" ? false : m.fn === "selectPart" ? { ok: true } : { ok: true, held: true } }),
  };
  let buf = "";
  c.on("data", (d) => { buf += d; for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); got.push(m); c.write(JSON.stringify({ id: m.id, ...on[m.op](m) }) + "\n"); } });
  await new Promise((r) => c.on("connect", r));
  c.write(JSON.stringify({ event: "hello", version: "0.1.0", origins: [], asks: [] }) + "\n");
  await until(() => O.ownChromeStatus().connected);
  return { got, on, close: () => c.destroy() };
}
// extension/background.js in a stand-in for Chrome's extension APIs.
function worker() {
  const W = { sent: [], local: {}, session: {}, granted: new Set(), tabs: new Map(), windows: [], calls: [], port: null, native: "", badge: "", groupTitle: "" };
  let next = 100;
  const port = { postMessage: (m) => W.sent.push(m), onMessage: { addListener: (f) => { port.f = f; } }, onDisconnect: { addListener: (f) => { port.gone = f; } }, disconnect: () => { W.disconnected = true; } };
  const ev = () => ({ addListener() {} });
  const chrome = {
    runtime: { id: "me", connectNative: (n) => { W.native = n; W.port = port; return port; }, getManifest: () => ({ version: "0.1.0" }), onMessage: ev(), onStartup: ev(), onInstalled: ev() },
    storage: {
      session: { get: async (k) => ({ [k]: W.session[k] }), set: async (o) => Object.assign(W.session, o) },
      local: { get: async (k) => ({ [k]: W.local[k] }), set: async (o) => Object.assign(W.local, o) },
    },
    permissions: { getAll: async () => ({ origins: [...W.granted] }), contains: async ({ origins }) => origins.every((o) => W.granted.has(o)), remove: async () => true },
    windows: {
      get: async (id) => { const w = W.windows.find((x) => x.id === id); if (!w) throw new Error("No window"); return w; },
      create: async (o) => { const w = { id: 1, ...o }; W.windows.push(w); const t = { id: next++, windowId: 1, url: "about:blank", status: "complete" }; W.tabs.set(t.id, t); return w; },
    },
    tabs: {
      get: async (id) => { const t = W.tabs.get(id); if (!t) throw new Error("No tab"); return t; },
      create: async (o) => { const t = { id: next++, windowId: o.windowId, url: o.url, status: "complete" }; W.tabs.set(t.id, t); return t; },
      update: async (id, o) => Object.assign(W.tabs.get(id), o.url ? { url: o.url } : {}),
      query: async ({ windowId }) => [...W.tabs.values()].filter((t) => t.windowId === windowId),
      remove: async (ids) => { for (const i of [].concat(ids)) W.tabs.delete(i); },
      group: async () => 7, captureVisibleTab: async () => "data:image/png;base64,AAAA", onRemoved: ev(),
    },
    tabGroups: { update: async (g, o) => { W.groupTitle = o.title; } },
    scripting: { executeScript: async (o) => { W.calls.push(o); if (o.files) return []; const [fn, args] = o.args; return [{ result: { collect: { url: "https://example.com/a", title: "Fake", items: [] }, block: { text: "", review: "" }, view: { w: 1280, h: 800, dpr: 2 }, click: { clicked: args.join() }, attach: { attached: (args[0] || []).length } }[fn] }]; } },
    alarms: { create() {}, onAlarm: ev() },
    action: { setBadgeText: ({ text }) => { W.badge = text; }, setBadgeBackgroundColor() {} },
  };
  const ctx = vm.createContext({ chrome, setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 5)), URL, console, Promise, Object, JSON, Array, String, Number, Date, Error });
  vm.runInContext(readFileSync(join(ROOT, "extension/background.js"), "utf8"), ctx);
  let n = 0;
  W.ask = async (m) => { const id = "w" + (++n); port.f({ id, ...m }); return until(() => W.sent.find((x) => x.id === id), 8000); };
  return W;
}
