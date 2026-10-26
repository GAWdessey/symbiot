// symbiot — your own Chrome: Symbiot's extension in the user's everyday Chrome, signed in as them,
// with no DevTools and no automation flags, so a site sees a person's browser (the real-browser
// plan in Reports, Phase 2; the 26 Oct 2026 go-ahead). Three parts:
//  - the extension (extension/ in the package, plus page.js, built here from the very code the
//    hidden browser runs in a page: headless.mjs), copied to ~/.config/symbiot/own-chrome/extension,
//    whose fixed key keeps its ID the same wherever it's loaded from;
//  - its native messaging host (ownchrome-host.mjs), which Chrome starts for that extension alone,
//    registered for each Chromium browser on this computer;
//  - the broker here in the app: the host connects to OWN_SOCK, a socket only this user can open,
//    and the app asks the extension things on it (askChrome) and hears its hello.
// A site has to be one the user linked or trusted in Symbiot (headless.mjs linkedSite) and one they
// allowed in Chrome (the extension's toolbar button): either can be switched off on its own.
import { createServer } from "node:net";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, userInfo } from "node:os";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, chmodSync, readdirSync, statSync } from "node:fs";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { CONFIG_DIR, chromeBinary } from "./core.mjs";
import { FILE_BOX, uploadFiles, siteUrl, saveScreen, blockOf, collectJs, scrollJs, findRegion, BLOCK_TEXT, MODAL_OPEN, SELECT_PART, DEEP, PAGE_HEIGHT, MAX_TALL, CHOOSE_SELECT, CHOOSE_OPTION, chooseSaid, hostOf, linkedSite, isTrusted } from "./headless.mjs";
import { loadScreens, center, wirePng } from "./screens.mjs";
import { heldFor } from "./sends.mjs";
import { holdOrGo } from "./chromegate.mjs";
import { listSecrets, getSecret, onSite, fillSite, bindSite } from "./vault.mjs";
import { noteUse } from "./vaultview.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "extension");
const HOST_NAME = "com.symbiot.chrome";
const OWN_DIR = join(CONFIG_DIR, "own-chrome"), EXT_DIR = join(OWN_DIR, "extension");
const OWN_SOCK = process.platform === "win32" ? `\\\\.\\pipe\\symbiot-own-chrome-${userInfo().username}` : join(OWN_DIR, "app.sock");

// The extension's ID, from the key in its manifest: the first 32 hex digits of the key's SHA-256,
// each written a–p. Chrome works it out the same way for an unpacked extension.
function extId(key = JSON.parse(readFileSync(join(SRC, "manifest.json"), "utf8")).key) {
  return [...createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32)].map((h) => String.fromCharCode(97 + parseInt(h, 16))).join("");
}
const EXT_ID = extId();

// page.js: the hidden browser's page code (headless.mjs), as functions the extension calls by
// name. A builder there writes each argument into its code as JSON; built with a stand-in for
// each, the stand-in's JSON becomes __a[i], the function's own argument. So the extension carries
// the code itself and the app only ever sends a name and values, never code (no remote code).
// One the builder makes a string first (String(want)) is the same; a number it writes as one
// (Number(at.x)) is the stand-in's own number, 987650000 + i.
const ARG = (i) => ({ toJSON: () => "\u0001" + i, toString: () => "\u0001" + i, valueOf: () => 987650000 + i });
function fnOf(build, n) {
  let src = build(...Array.from({ length: n }, (_, i) => ARG(i)));
  for (let i = 0; i < n; i++) src = src.split(JSON.stringify("\u0001" + i)).join(`__a[${i}]`).split(String(987650000 + i)).join(`__a[${i}]`);
  return `(...__a) => ${src}`;
}
// A click as a mouse gives one, at x, y in the window: what's there gets the pointer and mouse
// events and a click, and its field the focus. Script-made (isTrusted false): most sites take it,
// the few that don't (a captcha box) are the user's anyway.
const CLICK_JS = `(x, y) => { ${DEEP}
  const t = deepAt(x, y); if (!t) return { error: 'Nothing is there on the page now.' };
  const o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1, view: window }, p = { ...o, pointerId: 1, isPrimary: true, pointerType: 'mouse' };
  const f = deepClosest(t, 'input,textarea,select,button,a[href],[contenteditable]:not([contenteditable=false i]),[tabindex]');
  t.dispatchEvent(new PointerEvent('pointerover', p)); t.dispatchEvent(new MouseEvent('mouseover', o));
  t.dispatchEvent(new PointerEvent('pointerdown', p)); t.dispatchEvent(new MouseEvent('mousedown', o));
  if (f && typeof f.focus === 'function') f.focus();
  t.dispatchEvent(new PointerEvent('pointerup', { ...p, buttons: 0 })); t.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
  t.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0, detail: 1 }));
  return { ok: true };
}`;
// Type into the field that has the focus (after CLICK_JS on it): what's in it is replaced, the
// way a React or rich editor listens for (the value's own setter, then input and change; an
// editable box takes insertText), and Enter pressed after if asked, submitting a one-line form.
// held: the field holds the text after.
const TYPE_JS = `(text, enter) => { ${DEEP}
  const e = deepActive();
  if (!e || e === document.body || e === document.documentElement) return { error: "The click didn't land in a field, so nothing was typed." };
  const box = e.tagName === 'INPUT' || e.tagName === 'TEXTAREA';
  if (box) {
    const set = Object.getOwnPropertyDescriptor(e.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value').set;
    set.call(e, text); e.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text })); e.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (e.isContentEditable) { getSelection().selectAllChildren(e); if (!document.execCommand('insertText', false, text)) e.textContent = text; }
  else return { error: "What has the focus isn't a field, so nothing was typed." };
  if (enter) {
    const k = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
    const go = e.dispatchEvent(new KeyboardEvent('keydown', k)); e.dispatchEvent(new KeyboardEvent('keypress', k)); e.dispatchEvent(new KeyboardEvent('keyup', k));
    if (go && e.tagName === 'INPUT' && e.form) { try { e.form.requestSubmit(); } catch (x) { e.form.submit(); } }
  }
  return { ok: true, held: String(box ? e.value : e.innerText).trim() === String(text).trim() };
}`;
// The files, as the extension put them together ({ name, type, b64 }), into the file box fileBox
// found (window.__symbiotFileBox), as a person's pick would: its files set, then input and change.
const ATTACH_JS = `(files) => {
  const box = window.__symbiotFileBox; delete window.__symbiotFileBox;
  if (!box) return { error: "Lost the page's file box. Map the page again." };
  const dt = new DataTransfer();
  for (const f of files) { const bin = atob(f.b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); dt.items.add(new File([a], f.name, { type: f.type || 'application/octet-stream' })); }
  box.files = dt.files;
  box.dispatchEvent(new Event('input', { bubbles: true })); box.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, n: box.files.length };
}`;
// A saved sign-in into the box at x, y, here in the extension's own world on the page: only when
// the page is on the site it was saved for (its domain or one under it, over https) and the box is
// a password box or one for a code, as a password manager fills. The value is never given back.
const SECRET_JS = `(x, y, value, site) => { ${DEEP}
  const host = location.hostname.replace(/^www\\./, '').toLowerCase();
  if (!site || (host !== site && !host.endsWith('.' + site))) return { error: 'This page is on ' + host + ', not ' + site + ', so nothing was filled.' };
  if (location.protocol !== 'https:' && !/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname)) return { error: "This page isn't on a secure (https) connection, so nothing was filled." };
  const t = deepAt(x, y), e = t && deepClosest(t, 'input');
  if (!e) return { error: "There's no box there to fill, so nothing was filled." };
  const ty = String(e.type || 'text').toLowerCase(), said = [e.autocomplete, e.name, e.id, e.getAttribute('aria-label'), e.placeholder, e.labels && e.labels[0] ? e.labels[0].textContent : ''].join(' ');
  const fits = ty === 'password' || (/^(text|tel|number)$/.test(ty) && (/one-time-code/i.test(e.autocomplete || '') || /(^|[^a-z])(code|otp|pin|passcode|token|verification|verify|2fa|mfa|one[ -]?time|recovery|backup)([^a-z]|$)/i.test(said)));
  if (!fits) return { error: "A saved sign-in goes only into a password box or a box for a code, and this one is neither, so nothing was filled." };
  e.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, value);
  e.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' })); e.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, held: e.value === value };
}`;
function pageJs() {
  const fns = {
    collect: `() => ${collectJs(false)}`,
    collectWhole: `() => ${collectJs(true)}`,
    height: `() => ${PAGE_HEIGHT}`,
    wholeDone: "() => { window.__symbiotWhole = null; scrollTo({ top: 0, behavior: 'instant' }); return true; }",
    block: `() => ${BLOCK_TEXT}`,
    view: "() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 })",
    scroll: fnOf((to, where) => scrollJs(to, where), 2),
    find: fnOf((sel, label, c) => findRegion({ selector: sel, label }, c, false), 3),
    modal: `() => ${MODAL_OPEN}`,
    chooseSelect: fnOf((sel, x, y, want) => CHOOSE_SELECT(sel, { x, y }, want), 4),
    chooseOption: fnOf((want) => CHOOSE_OPTION(want), 1),
    selectPart: fnOf((old) => SELECT_PART(old), 1),
    insert: "(text) => ({ ok: document.execCommand('insertText', false, text) })",
    fileBox: fnOf((sel, x, y) => FILE_BOX(sel, { x, y }), 3),
    attach: ATTACH_JS,
    click: CLICK_JS,
    type: TYPE_JS,
    secret: SECRET_JS,
  };
  return "// Built by Symbiot (ownchrome.mjs pageJs) from the code its hidden browser runs in a page. Don't edit.\n" +
    "self.__symbiot = {\n" + Object.entries(fns).map(([k, v]) => `  ${k}: ${v},`).join("\n") + "\n};\n";
}

// The extension's files, written to dir: those that changed, so Chrome's copy only moves when Symbiot's does.
function writeExtension(dir = EXT_DIR) {
  mkdirSync(dir, { recursive: true });
  const files = { "page.js": pageJs() };
  for (const f of readdirSync(SRC)) files[f] = readFileSync(join(SRC, f));
  let changed = 0;
  for (const [f, body] of Object.entries(files)) {
    const to = join(dir, f), b = Buffer.isBuffer(body) ? body : Buffer.from(body);
    if (existsSync(to) && readFileSync(to).equals(b)) continue;
    writeFileSync(to, b); changed++;
  }
  return { dir, changed };
}

// The browsers whose native messaging hosts this registers with: those on this computer.
function browsers(home = homedir(), platform = process.platform) {
  if (platform === "linux") return [["Chrome", ".config/google-chrome"], ["Chrome Beta", ".config/google-chrome-beta"], ["Chromium", ".config/chromium"], ["Brave", ".config/BraveSoftware/Brave-Browser"], ["Edge", ".config/microsoft-edge"]]
    .map(([name, d]) => ({ name, dir: join(home, d), hosts: join(home, d, "NativeMessagingHosts") }));
  if (platform === "darwin") return [["Chrome", "Google/Chrome"], ["Chromium", "Chromium"], ["Brave", "BraveSoftware/Brave-Browser"], ["Edge", "Microsoft Edge"]]
    .map(([name, d]) => ({ name, dir: join(home, "Library/Application Support", d), hosts: join(home, "Library/Application Support", d, "NativeMessagingHosts") }));
  if (platform === "win32") return [["Chrome", "Google\\Chrome"], ["Chromium", "Chromium"], ["Brave", "BraveSoftware\\Brave-Browser"], ["Edge", "Microsoft\\Edge"]]
    .map(([name, k]) => ({ name, key: `HKCU\\Software\\${k}\\NativeMessagingHosts\\${HOST_NAME}` }));
  return [];
}
const hostManifest = (path) => ({ name: HOST_NAME, description: "Symbiot in your own Chrome", path, type: "stdio", allowed_origins: [`chrome-extension://${EXT_ID}/`] });
// The program Chrome starts: node with the host, and the app's socket.
function writeLauncher(dir = OWN_DIR, { node = process.execPath, host = join(HERE, "ownchrome-host.mjs"), sock = OWN_SOCK, platform = process.platform } = {}) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (platform === "win32") {
    const f = join(dir, "host.bat"); writeFileSync(f, `@echo off\r\n"${node}" "${host}" --sock "${sock}" %*\r\n`); return f;
  }
  const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'", f = join(dir, "host.sh");
  writeFileSync(f, `#!/bin/sh\nexec ${q(node)} ${q(host)} --sock ${q(sock)} "$@"\n`); chmodSync(f, 0o700);
  return f;
}
// Set up: the extension's folder, the launcher, and the host registered with each browser on
// this computer. Nothing is installed in Chrome itself: the user loads the folder there once.
function setupOwnChrome({ home = homedir(), platform = process.platform, run = spawnSync } = {}) {
  const ext = writeExtension(), launcher = writeLauncher(), manifest = join(OWN_DIR, HOST_NAME + ".json"), done = [];
  writeFileSync(manifest, JSON.stringify(hostManifest(launcher), null, 2));
  for (const b of browsers(home, platform)) {
    if (b.key) { const r = run("reg", ["add", b.key, "/ve", "/t", "REG_SZ", "/d", manifest, "/f"], { encoding: "utf8", timeout: 10000 }); if (r && r.status === 0) done.push(b.name); continue; }
    if (!existsSync(b.dir)) continue;
    try { mkdirSync(b.hosts, { recursive: true }); writeFileSync(join(b.hosts, HOST_NAME + ".json"), JSON.stringify(hostManifest(launcher), null, 2)); done.push(b.name); } catch {}
  }
  return { ...ownChromeStatus({ home, platform }), folder: ext.dir, browsers: done };
}
// After an update: the extension's folder and the launcher follow Symbiot, once it was set up.
function refreshOwnChrome() {
  if (!existsSync(join(EXT_DIR, "manifest.json"))) return null;
  try { const e = writeExtension(); writeLauncher(); return e; } catch { return null; }
}
function hostsSetUp(home = homedir(), platform = process.platform) {
  return browsers(home, platform).filter((b) => b.hosts && existsSync(join(b.hosts, HOST_NAME + ".json"))).map((b) => b.name);
}

// The broker: the host's connections, the one that said hello last, and the questions waiting on it.
let server = null, current = null, seq = 0;
const conns = new Set(), waiting = new Map();
function startBroker({ sock = OWN_SOCK } = {}) {
  if (server) return server;
  if (!sock.startsWith("\\\\")) { mkdirSync(dirname(sock), { recursive: true, mode: 0o700 }); rmSync(sock, { force: true }); }
  server = createServer((c) => {
    let buf = ""; conns.add(c);
    c.on("data", (d) => {
      buf += d.toString("utf8");
      for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        heard(c, m);
      }
    });
    const gone = () => { conns.delete(c); if (current === c) current = [...conns].filter((x) => x.hello).pop() || null; };
    c.on("close", gone); c.on("error", () => c.destroy());
  });
  server.on("error", () => {});
  server.listen(sock, () => { try { if (!sock.startsWith("\\\\")) chmodSync(sock, 0o600); } catch {} });
  return server;
}
function stopBroker() { for (const c of conns) c.destroy(); conns.clear(); current = null; if (server) server.close(); server = null; }
function heard(c, m) {
  if (!m || typeof m !== "object") return;
  // a hello, by itself or as the answer to one: what the extension may do now (and, kept, that it's loaded in Chrome)
  if (m.event === "hello") {
    c.hello = { version: String(m.version || ""), origins: Array.isArray(m.origins) ? m.origins : [], asks: Array.isArray(m.asks) ? m.asks : [], stopped: !!m.stopped, at: Date.now() }; current = c;
    try { mkdirSync(OWN_DIR, { recursive: true, mode: 0o700 }); writeFileSync(SEEN, JSON.stringify({ at: c.hello.at, stopped: c.hello.stopped })); } catch {}
  }
  const w = m.id && waiting.get(m.id); if (!w) return;
  waiting.delete(m.id); clearTimeout(w.t); w.resolve(m);
}
const NOT_CONNECTED = "Symbiot's extension in your own Chrome isn't connected: Chrome isn't open, the extension isn't loaded, or it was stopped from its toolbar button. Set it up in Settings → Connections → Your own Chrome.";
// When Chrome is closed: once the extension has said hello on this computer, and wasn't stopped,
// Symbiot starts Chrome the way a person does, with no window (its last profile, no automation
// flags), and waits for the extension to connect. Not more than once a minute.
const SEEN = join(OWN_DIR, "seen.json"), START_WAIT = 25000;
let starter = (bin) => { const p = spawn(bin, ["--no-startup-window"], { detached: true, stdio: "ignore" }); p.on("error", () => {}); p.unref(); };
let startedAt = 0;
function setStarter(f) { starter = f; startedAt = 0; }
async function wake() {
  let seen = null; try { seen = JSON.parse(readFileSync(SEEN, "utf8")); } catch {}
  if (!seen || seen.stopped || Date.now() - startedAt < 60000) return false;
  const bin = chromeBinary(); if (!bin) return false;
  startedAt = Date.now();
  try { starter(bin); } catch { return false; }
  for (const end = Date.now() + START_WAIT; Date.now() < end;) { if (current && !current.destroyed) return true; await new Promise((r) => setTimeout(r, 250)); }
  return false;
}
async function askChrome(op, args = {}, { timeout = 60000 } = {}) {
  if (!current || current.destroyed) await wake();
  const c = current;
  if (!c || c.destroyed) return { error: NOT_CONNECTED, offline: true };
  const id = "q" + (++seq);
  return new Promise((resolve) => {
    const t = setTimeout(() => { waiting.delete(id); resolve({ error: "Your Chrome didn't answer in time." }); }, timeout);
    waiting.set(id, { resolve, t });
    c.write(JSON.stringify({ ...args, id, op }) + "\n");
  });
}
function ownChromeStatus({ home, platform } = {}) {
  const h = current && !current.destroyed ? current.hello : null;
  return { id: EXT_ID, folder: EXT_DIR, setUp: existsSync(join(EXT_DIR, "manifest.json")), hosts: hostsSetUp(home, platform), connected: !!h,
    ...(h ? { version: h.version, origins: h.origins.filter((o) => /^https?:/.test(o)).map((o) => o.replace(/\/\*$/, "")), asks: h.asks, stopped: h.stopped } : {}) };
}

// A site the user allowed Symbiot on in their Chrome, with the extension connected and not stopped:
// a map of it goes there by itself. Allowing it there is the user saying so.
function ownChromeFor(url) {
  const h = current && !current.destroyed ? current.hello : null; if (!h || h.stopped) return false;
  let o = ""; try { o = new URL(siteUrl(url)).origin; } catch { return false; }
  return h.origins.some((x) => String(x).replace(/\/\*$/, "") === o);
}
// A site through the user's own Chrome, saved as a screen as the hidden browser's maps are
// (screens.mjs addPageScreen, via "own-chrome"): its regions in the picture's pixels.
const refusedBy = (r) => r.origin ? `Chrome hasn't allowed Symbiot on ${hostOf(r.origin)} yet. In Chrome, click Symbiot's button in the toolbar and press Allow next to ${hostOf(r.origin)}, then try again.` : r.error;
async function mapInOwnChrome(input, name = "", { cfg } = {}) {
  const url = siteUrl(input);
  if (!url) return { error: "Give a site to map: a name (gmail), a host (github.com/pulls) or a web address." };
  const host = hostOf(url);
  if (!linkedSite(host, cfg)) return { error: `${host} isn't one of your linked or trusted sites. Link it in Settings → Connections first: Symbiot works in your own Chrome only on sites you've chosen.` };
  const r = await askChrome("map", { url }, { timeout: 90000 });
  if (r.error) return { error: refusedBy(r), ...(r.origin ? { allow: hostOf(r.origin) } : {}), ...(r.offline ? { offline: true } : {}) };
  return saveLook(r, name);
}
// Chrome takes a picture of a page for an extension only with access to every site, or the user's
// click on its button, so a page here is usually drawn instead (screens.mjs wirePng): its regions
// in place, at the window's size. The regions are what an agent goes by either way.
const DRAWN = "This is a drawing of the page, not a picture of it: Chrome lets Symbiot's extension take pictures only with access to every site, and it has only the sites you allowed. The buttons, links and fields are all there, where they are on the page.";
function saveLook(r, name) {
  const info = r.info || {}, view = r.view || {}, drawn = !r.png, dpr = drawn ? 1 : Number(view.dpr) || 1;
  const k = (v) => Math.round(v * dpr);
  const items = (info.items || []).map((x) => dpr === 1 ? x : { ...x, x: k(x.x), y: k(x.y), w: k(x.w), h: k(x.h) });
  const png = drawn ? wirePng(view.w || 1280, view.h || 800, items) : r.png;
  const block = r.seen ? blockOf(r.seen, info.url) : null;
  const s = saveScreen(name, png, { ...info, items, dpr, via: "own-chrome", ...(block ? { block } : {}) });
  return drawn && !s.error && !s.note ? { ...s, drawn: true, note: DRAWN } : s;
}

// Acting on a screen mapped in the user's own Chrome: in its tab there (the extension's tab for
// its site, opened at its address again when it has moved on), then what that leads to is mapped
// as a new screen. The rules are the hidden browser's (headless.mjs actOnRegion): the user's
// confirmation unless the site is trusted, and a draft-only run never sends. On top: whatever
// sends, posts, pays or deletes (sends.mjs heldFor), and Enter in a message box, waits for the
// user's Go on a card, the same holds as an agent's actions in their Chrome (chromegate.mjs
// holdOrGo): it's their own identity in their own browser. Once they say Go, the same press goes
// through, once.
const RETRY = "do the same again (the same symbiot screens command): it goes through, once";
const gate = (host, summary, kind) => { const h = holdOrGo(host, summary, kind, { retry: RETRY }); return h ? { error: h.why, held: kind, hold: h.held } : null; };
function ownScreen(id) { const s = loadScreens().find((x) => x.id === id); return s && s.via === "own-chrome" && s.page && s.page.url ? s : null; }
const toPage = (s, p) => { const k = (s.page && s.page.dpr) || 1; return { x: p.x / k, y: p.y / k }; };
async function tabOf(s) {
  const r = await askChrome("tab", { url: s.page.url }, { timeout: 60000 });
  if (r.error) return { error: refusedBy(r), ...(r.offline ? { offline: true } : {}) };
  return r;
}
async function actInOwnChrome(id, regionId, verb, { confirmed = false, noSend = false } = {}, act, before = null) {
  const s = ownScreen(id); if (!s) return { error: "not found" };
  const r = (s.regions || []).find((x) => x.id === regionId); if (!r) return { error: "That region is gone. Reload the screen." };
  const host = hostOf(s.page.url);
  if (noSend && verb === "Press" && heldFor("Clicks " + r.label, host) === "send") return { error: `"${r.label}" sends or posts. This run only drafts: it never presses Send, Post, Comment or Reply. The draft stays for the user to send or post.` };
  if (!confirmed && !isTrusted(s.page.url)) return { error: `${{ Type: "Typing into", Upload: "Attaching a file with", Choose: "Choosing in", Secret: "Filling a saved sign-in into" }[verb] || "Pressing"} "${r.label}" acts on the real site in your own Chrome, signed in as you, and ${host} isn't one of your trusted sites.`, confirm: true, host };
  const held = before ? before(r, host) : null; if (held) return held;
  const t = await tabOf(s); if (t.error) return t;
  const run = (fn, args = []) => askChrome("run", { tab: t.tab, fn, args }).then((x) => x.error ? { error: refusedBy(x) } : x.result);
  const c = toPage(s, center(r));
  const hit = await run("find", [r.selector || "", r.label || "", c]);
  if (hit && hit.error) return hit;
  if (t.same && !(hit && hit.by === "selector" && hit.clear) && await run("modal")) return { error: `"${r.label}" is covered by a pop-up that is open on the page now. Press in the pop-up (map the page again to see it), or close it first.`, stay: true };
  const at = hit ? { x: hit.x, y: hit.y } : c;
  const done = await act(run, at, r, t.tab);
  if (done && done.error) return { ...done, stay: true };
  await askChrome("wait", { tab: t.tab, ms: 15000 });
  const next = await askChrome("look", { tab: t.tab }, { timeout: 60000 });
  if (next.error) return { error: refusedBy(next) };
  const saved = saveLook(next, "");
  return saved.error ? saved : { ...saved, ...done, found: !!hit && hit.by === "selector", kept: !!t.same };
}
function pressInOwnChrome(id, regionId, opts = {}) {
  return actInOwnChrome(id, regionId, "Press", opts, async (run, at, r) => { const x = await run("click", [at.x, at.y]); return x && x.error ? x : { pressed: r.label }; },
    (r, host) => { const k = heldFor("Clicks " + r.label, host); return k ? gate(host, "Clicks " + r.label, k) : null; });
}
// Enter sends in a chat or a message box: an agent presses it only in a search or filter box
// replace: only that part of what's in the field is typed over (selected, then typed, as a person
// would), so the rest stays as it is (headless.mjs typeRegion's replace).
function typeInOwnChrome(id, regionId, text, { enter = false, replace = null, ...opts } = {}) {
  text = String(text == null ? "" : text);
  if (text.length > 2000) return Promise.resolve({ error: "That's more than 2000 characters to type." });
  if (replace != null && !String(replace)) return Promise.resolve({ error: "Give the part of the field to replace." });
  return actInOwnChrome(id, regionId, "Type", opts, async (run, at, r) => {
    const c = await run("click", [at.x, at.y]); if (c && c.error) return c;
    if (replace != null) {
      const p = await run("selectPart", [String(replace)]);
      if (!p || !p.ok) return { error: p && p.problem === "more" ? `"${replace}" is in "${r.label}" ${p.count} times, so nothing was changed: give a longer part, one that's there once.` : `"${replace}" isn't in "${r.label}", so nothing was changed.` };
      const x = await run("insert", [text]);
      return x && x.ok ? { typed: r.label, replaced: String(replace) } : { error: `"${r.label}" wouldn't take the new text.` };
    }
    const x = await run("type", [text, !!enter]);
    return x && x.error ? x : { typed: r.label, ...(x && x.held === false ? { note: "The field doesn't show all of what was typed: check it on the new screen." } : {}) };
  }, (r, host) => {
    if (!enter || /\b(search|find|filter|look ?up|query)\b/i.test(r.label || "")) return null;
    if (opts.noSend) return { error: `Enter in "${r.label}" can send it. This run only drafts: type without Enter, and the draft stays for the user to send.` };
    return gate(host, `Presses Enter in ${r.label}`, "send");
  });
}
// Choose: an option in a menu, a native one set as the page listens for it, else the site's own
// opened and its option clicked (headless.mjs chooseRegion's page code).
function chooseInOwnChrome(id, regionId, option, opts = {}) {
  const want = String(option == null ? "" : option).trim(), s = ownScreen(id), r = s && (s.regions || []).find((x) => x.id === regionId);
  if (r && !want) return Promise.resolve({ error: "Give the option to choose: its label, as the menu shows it." });
  if (r && r.kind !== "menu") return Promise.resolve({ error: `"${r.label}" isn't a menu (it's a ${r.kind || "region"}). Choose works on a menu; use Press or Type for the rest.` });
  return actInOwnChrome(id, regionId, "Choose", opts, async (run, at, r) => {
    const sel = await run("chooseSelect", [r.selector || "", at.x, at.y, want]);
    if (sel && sel.native) return sel.problem ? { error: chooseSaid(r, want, sel) } : { chose: sel.chose, value: sel.value };
    const c = await run("click", [at.x, at.y]); if (c && c.error) return c;
    await new Promise((ok) => setTimeout(ok, 400));
    const o = await run("chooseOption", [want]);
    if (!o || o.problem) return { error: chooseSaid(r, want, o || {}) };
    const host = hostOf(s.page.url), kind = heldFor("Clicks " + o.chose, host), held = kind && gate(host, `Chooses ${o.chose} in ${r.label}`, kind);
    if (held) { await run("click", [at.x, at.y]); return held; } // the menu closed again, nothing chosen
    const k = await run("click", [o.at.x, o.at.y]); if (k && k.error) return k;
    return { chose: o.chose };
  });
}
// A saved sign-in from the vault (a password, a key, a code) into a field, in the user's own Chrome
// only: the app reads it and the extension puts it in the box, so the agent never sees it, and
// nothing gives it back (the map after never reads a box's value). It fills only on the site it
// was saved for (vault.mjs fillSite: that domain or one under it), checked here and again on the
// page itself; one with no site yet waits for the user's Go on its first fill, and that site is
// then its own. A set of codes, or a code a site sent, is spent once filled.
async function secretInOwnChrome(id, regionId, name, opts = {}) {
  name = String(name || "").trim();
  const s = ownScreen(id); if (!s) return { error: "not found" };
  const r = (s.regions || []).find((x) => x.id === regionId); if (!r) return { error: "That region is gone. Reload the screen." };
  if (r.kind !== "field") return { error: `"${r.label}" isn't a field (it's a ${r.kind || "region"}). A saved sign-in goes into its password box.` };
  const m = listSecrets().find((x) => x.name === name);
  if (!m) return { error: `No saved sign-in called "${name}". symbiot secret list shows the names.` };
  if (m.left < 1) return { error: `Every value in "${name}" has been used.` };
  const host = hostOf(s.page.url), site = m.site || fillSite(host);
  if (!site) return { error: "This page isn't on a site a saved sign-in can be filled on." };
  if (m.site && !onSite(m.site, host)) return { error: `"${name}" is saved for ${m.site}, and this page is on ${host}, so it isn't filled here. A saved sign-in fills only on its own site.` };
  return actInOwnChrome(id, regionId, "Secret", opts, async (run, at) => {
    const v = getSecret(name); if (v.error) return v;
    const x = await run("secret", [at.x, at.y, v.value, site]);
    if (!x || x.error) return { error: (x && x.error) || "Your Chrome didn't fill it." };
    if (!m.site) bindSite(name, host);
    if (m.count > 1 || v.once) getSecret(name, { use: true });
    noteUse(name, "fill", { site });
    return { filled: r.label, secret: name, site, ...(x.held === false ? { note: "The box doesn't hold all of it: check it on the new screen." } : {}) };
  }, () => m.site ? null : gate(host, `Fills your saved "${name}" on ${site}`, "fill"));
}
// Fill: several fields on the one screen, then one button if asked, in the same tab without
// opening it again, as the hidden browser's fillForm does. Every field and the button must be
// on the page before anything is typed; a button that sends, pays or deletes is never pressed.
async function fillInOwnChrome(id, fields, { press = "", ...opts } = {}) {
  const s = ownScreen(id); if (!s) return { error: "not found" };
  if (!Array.isArray(fields) || !fields.length) return { error: "Give at least one field to fill." };
  const rs = s.regions || [], host = hostOf(s.page.url), steps = [];
  for (const f of fields) {
    const r = rs.find((x) => x.id === f.region); if (!r) return { error: "That region is gone. Reload the screen." };
    const text = String(f.text == null ? "" : f.text);
    if (r.kind !== "field") return { error: `"${r.label}" isn't a field (it's a ${r.kind || "region"}). Fill works on fields; press the rest with --press.` };
    if (text.length > 2000) return { error: "That's more than 2000 characters." };
    steps.push({ r, text });
  }
  const button = press ? rs.find((x) => x.id === press) : null;
  if (press && !button) return { error: "That region is gone. Reload the screen." };
  const k = button ? heldFor("Clicks " + button.label, host) : "";
  if (k && opts.noSend && k === "send") return { error: `"${button.label}" sends or posts. This run only drafts: fill without pressing it, and the draft stays for the user to send.` };
  if (!opts.confirmed && !isTrusted(s.page.url)) return { error: `Filling this form acts on the real site in your own Chrome, signed in as you, and ${host} isn't one of your trusted sites.`, confirm: true, host };
  const held = k && gate(host, "Clicks " + button.label, k); if (held) return held;
  const t = await tabOf(s); if (t.error) return t;
  const run = (fn, args = []) => askChrome("run", { tab: t.tab, fn, args }).then((x) => x.error ? { error: refusedBy(x) } : x.result);
  const spots = [];
  for (const r of [...steps.map((x) => x.r), ...(button ? [button] : [])]) {
    const hit = await run("find", [r.selector || "", r.label || "", toPage(s, center(r))]);
    if (hit && hit.error) return hit;
    if (!(hit && hit.by === "selector")) return { error: `"${r.label}" isn't on the page now${t.same ? "" : " (it was opened again from its address, which closes a pop-up and loses what was typed)"}, so nothing was filled or pressed. Map the page as it is now, then fill it.`, stay: true };
    spots.push({ x: hit.x, y: hit.y });
  }
  const typed = [];
  for (const [i, { r, text }] of steps.entries()) {
    const c = await run("click", [spots[i].x, spots[i].y]); if (c && c.error) return { ...c, typed };
    const x = await run("type", [text, false]); if (x && x.error) return { ...x, typed };
    typed.push(r.label);
  }
  if (button) { const at = spots[spots.length - 1], c = await run("click", [at.x, at.y]); if (c && c.error) return { ...c, typed }; await askChrome("wait", { tab: t.tab, ms: 15000 }); }
  const next = await askChrome("look", { tab: t.tab }, { timeout: 60000 });
  if (next.error) return { error: refusedBy(next), typed };
  const saved = saveLook(next, "");
  return saved.error ? saved : { ...saved, typed, pressed: button ? button.label : "", kept: !!t.same };
}
// Scroll: the page (or the part of it that scrolls) moved, and what's in the window then mapped.
async function scrollInOwnChrome(id, to = "down") {
  to = String(to || "down").toLowerCase();
  if (!["down", "up", "top", "bottom"].includes(to)) return { error: `Scroll down, up, top or bottom: not "${to}".` };
  const s = ownScreen(id); if (!s) return { error: "not found" };
  const t = await tabOf(s); if (t.error) return t;
  const sc = s.page.scroll, m = await askChrome("run", { tab: t.tab, fn: "scroll", args: [to, sc ? sc.selector || "" : null] });
  if (m.error) return { error: refusedBy(m) };
  const v = m.result;
  if (!v) return { error: "Nothing scrolls on this page: it all fits in the window.", stay: true };
  if (v.y === v.from) return { error: `That's the ${/^(up|top)$/.test(to) ? "top" : "bottom"} of the page already.`, stay: true };
  const next = await askChrome("look", { tab: t.tab }, { timeout: 60000 });
  if (next.error) return { error: refusedBy(next) };
  const pct = v.max > 0 ? Math.round(v.y / v.max * 100) : 0;
  const saved = saveLook(next, s.name.replace(/ ↓ \d+%$/, "") + (pct ? ` ↓ ${pct}%` : ""));
  return saved.error ? saved : { ...saved, scrolled: to, kept: !!t.same };
}
// Upload: the files into the region's file box (headless.mjs FILE_BOX finds it, as for the hidden
// browser), sent to the extension in pieces a message can carry, then put in the box together.
// A box that only opens the system's file dialog can't be filled from here: that says so.
const UPLOAD_MAX = 25 * 1024 * 1024, PIECE = 512 * 1024;
const TYPES = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", csv: "text/csv", txt: "text/plain", json: "application/json", zip: "application/zip", mp4: "video/mp4", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
function uploadInOwnChrome(id, regionId, files, opts = {}) {
  const f = uploadFiles(files);
  if (f.error) return Promise.resolve(f);
  const total = f.files.reduce((n, x) => n + statSync(x).size, 0);
  if (total > UPLOAD_MAX) return Promise.resolve({ error: `Those files come to ${Math.round(total / 1048576)} MB: your own Chrome takes up to ${UPLOAD_MAX / 1048576} MB at a time from Symbiot.` });
  return actInOwnChrome(id, regionId, "Upload", opts, async (run, at, r, tab) => {
    const box = await run("fileBox", [r.selector || "", at.x, at.y]);
    if (!box) return { error: `No file box on the page for "${r.label}". In your own Chrome Symbiot can't answer the system's file dialog: map the page after pressing it, and upload into the box it shows.` };
    if (box.error) return box;
    if (f.files.length > 1 && !box.multiple) return { error: `${box.box} takes one file at a time.` };
    const key = Math.random().toString(36).slice(2), meta = [];
    for (const [i, file] of f.files.entries()) {
      const b64 = readFileSync(file).toString("base64"), n = Math.max(1, Math.ceil(b64.length / PIECE));
      for (let k = 0; k < n; k++) { const x = await askChrome("put", { key, file: i, part: k, parts: n, data: b64.slice(k * PIECE, (k + 1) * PIECE) }); if (x.error) return x; }
      meta.push({ name: basename(file), type: TYPES[(file.split(".").pop() || "").toLowerCase()] || "" });
    }
    const x = await askChrome("attach", { tab, key, files: meta }, { timeout: 120000 });
    if (x.error) return { error: refusedBy(x) };
    return x.result && x.result.ok ? { uploaded: r.label, files: f.files, used: `${box.box}, ${box.how}` } : { error: (x.result && x.result.error) || "The file box didn't take the files." };
  });
}
// Whole page: the page scrolled a window at a time, what's on each part kept (collectJs(true), in
// the extension's own world on the page), drawn as one tall screen. Only looks, so it never asks.
// A page whose list scrolls inside it (a mailbox) can't be opened out here: Scroll goes down it.
async function wholeInOwnChrome(id) {
  const s = ownScreen(id); if (!s) return { error: "not found" };
  const t = await tabOf(s); if (t.error) return t;
  const run = (fn, args = []) => askChrome("run", { tab: t.tab, fn, args }).then((x) => x.error ? { error: refusedBy(x) } : x.result);
  const first = await run("height"); if (!first || first.error) return first || { error: "Couldn't read the page." };
  if (first.inside) return { error: "This page's list scrolls inside it, so it can't be opened out in your own Chrome: use Scroll down to map the next part of it.", inside: true, stay: true };
  const view = await run("view"); if (!view || view.error) return view || { error: "Couldn't read the page." };
  let info = null, h = first.h, end = 0;
  await run("wholeDone");
  try {
    for (let y = 0, i = 0; i < 60; i++) {
      const m = await run("scroll", [y, ""]); const at = (m && m.y) || 0;
      await new Promise((ok) => setTimeout(ok, 150));
      info = await run("collectWhole"); if (!info || info.error) return info || { error: "Couldn't read the page." };
      end = at + view.h; h = ((await run("height")) || {}).h || h;
      if (end >= Math.min(MAX_TALL, h) || at < y || info.items.length >= 200) break;
      y = Math.min(at + view.h - 200, Math.min(MAX_TALL, h) - view.h);
    }
  } finally { await run("wholeDone"); }
  const tall = Math.min(MAX_TALL, end), items = info.items.filter((r) => r.y < tall);
  const saved = saveScreen(s.name.replace(/ ↓ \d+%$/, "").slice(0, 67) + " (whole page)", wirePng(view.w, tall, items), { url: info.url, title: info.title, full: true, items, via: "own-chrome" });
  if (saved.error) return saved;
  const note = [DRAWN, h > tall + 1 && `The page goes on past ${tall} pixels, so this map stops there.`, items.length >= 200 && "It marks the first 200 buttons, links and fields, from the top."].filter(Boolean).join(" ");
  return { ...saved, drawn: true, note, kept: !!t.same };
}

export { secretInOwnChrome, SECRET_JS, uploadInOwnChrome, wholeInOwnChrome, setStarter, ownChromeFor, ownScreen, actInOwnChrome, pressInOwnChrome, typeInOwnChrome, chooseInOwnChrome, fillInOwnChrome, scrollInOwnChrome, CLICK_JS, TYPE_JS, HOST_NAME, EXT_ID, OWN_DIR, EXT_DIR, OWN_SOCK, extId, fnOf, pageJs, writeExtension, browsers, hostManifest, writeLauncher, setupOwnChrome, refreshOwnChrome, hostsSetUp, startBroker, stopBroker, askChrome, ownChromeStatus, mapInOwnChrome, saveLook, NOT_CONNECTED };
