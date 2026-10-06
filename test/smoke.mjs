// Smoke test: boot `symbiot app`, load the page it actually SERVES, and
//   1. parse its embedded JS — a syntax error is a dead UI (the 0.9.4 bug);
//   2. RUN that JS against a minimal fake DOM with fetch wired to the live
//      server, open every tab and fire every button/input handler — so a
//      boot-time error, a handler that throws, or a call to a missing route or
//      wrong method (the 0.10.2 GET/POST mismatch) fails here;
//   3. hit every endpoint the UI calls, with the SAME method the UI uses,
//      asserting none 404 — and fail if the UI calls an endpoint this test
//      doesn't cover, so a new route can't slip past unexercised;
//   4. with a newer version on a fake registry, the page offers the update once
//      and, after an update that didn't take, stops offering it (the 0.28.2 loop).
// Runs in an isolated HOME, on a random port, with AI keys stripped and a fake
// npm registry, so it never touches real config or repos, a running app, npm,
// or a paid model.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = mkdtempSync(join(tmpdir(), "symbiot-smoke-"));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a fake npm registry that always has a newer Symbiot
const LATEST = "999.0.0";
const reg = createServer((req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ "dist-tags": { latest: LATEST } })); });
await new Promise((r) => reg.listen(0, "127.0.0.1", r));
const env = { ...process.env, HOME, USERPROFILE: HOME, SYMBIOT_NO_OPEN: "1", SYMBIOT_PORT: String(20000 + Math.floor(Math.random() * 20000)), SYMBIOT_REGISTRY: `http://127.0.0.1:${reg.address().port}` };
for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "SYMBIOT_MODEL"]) delete env[k];
const child = spawn(process.execPath, [join(HERE, "..", "index.mjs"), "app"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buf = "";
const url = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("app did not start in time")), 8000);
  child.stdout.on("data", (d) => { buf += d; const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[a-f0-9]+/); if (m) { clearTimeout(t); resolve(m[0]); } });
  child.on("exit", () => { clearTimeout(t); reject(new Error("app exited: " + buf)); });
});
const base = url.replace(/\/\?t=.*/, "");
const token = url.replace(/.*t=/, "");
const H = { "x-symbiot-token": token, "content-type": "application/json" };

// Run the UI's JS against a fake DOM just deep enough for its own code paths.
// Elements exist only if the page has them: static ids from the HTML, plus ids
// the UI itself rendered via innerHTML (e.g. the archived-tasks toggle) — so a
// handler grabbing an element that isn't there throws, like in a browser.
// `storage` seeds the page's localStorage; `handlers: false` only boots the page;
// `android` stands in for the Android app's window.SymbiotAndroid.
async function runUi(js, page, { storage = {}, handlers = true, android = null, termux = false, ua = "" } = {}) {
  const errors = [], hits = [];
  const store = { ...storage };
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  let inflight = 0;
  const onRejection = (e) => errors.push("unhandled rejection: " + ((e && e.message) || e));
  process.on("unhandledRejection", onRejection);
  const markup = page.replace(/<script>[\s\S]*?<\/script>/g, "");
  const ids = new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const initial = { provider: "anthropic" };
  for (const m of markup.matchAll(/<input[^>]*\sid="([^"]+)"[^>]*\svalue="([^"]*)"/g)) initial[m[1]] = m[2];
  const rendered = []; // every innerHTML the UI has written
  const els = {};
  const makeEl = (id, extra) => {
    let inner = "";
    const listeners = {};
    return {
      id, listeners, value: initial[id] || "", textContent: "", checked: false, disabled: false, className: "", scrollTop: 0, scrollHeight: 0,
      style: {}, dataset: {}, onclick: null,
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      get innerHTML() { return inner; }, set innerHTML(v) { inner = String(v); rendered.push(inner); },
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; },
      setAttribute() {}, getAttribute() { return null; }, remove() {}, setPointerCapture() {},
      getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 620 }; },
      ...extra,
    };
  };
  const exists = (id) => ids.has(id) || rendered.some((h) => h.includes(`id='${id}'`) || h.includes(`id="${id}"`));
  const tabs = [...markup.matchAll(/data-tab="([^"]+)"/g)].map((m) => makeEl("tab:" + m[1], { dataset: { tab: m[1] } }));
  const document = {
    body: makeEl("body"),
    getElementById(id) { return exists(id) ? (els[id] = els[id] || makeEl(id)) : null; },
    querySelectorAll(sel) { return sel === ".tab" ? tabs : []; },
    querySelector() { return null; },
  };
  const location = { host: "127.0.0.1:7391", search: "?t=" + token, reload() {} };
  const window = { location, open() {}, addEventListener() {}, ...(android ? { SymbiotAndroid: android } : {}) };
  if (android) globalThis.SymbiotAndroid = android; // the page also calls it bare, as a browser global
  const navigator = { userAgent: ua, clipboard: { writeText: () => Promise.resolve() } };
  const fetchShim = (path, opts = {}) => {
    inflight++;
    return fetch(base + path, opts)
      .then(async (r) => {
        hits.push({ path: path.split("?")[0], method: opts.method || "GET", status: r.status });
        // a Symbiot running in Termux says so in its ping
        if (termux && path.startsWith("/api/ping")) return new Response(JSON.stringify({ ...(await r.json()), termux: true }), { status: r.status });
        return r;
      })
      .finally(() => { inflight--; });
  };
  const noop = () => 0; // timers off: no polling, no delayed tab switches
  // wait until no request has been in flight for a quarter second
  const settle = async () => { let quiet = 0; for (let i = 0; i < 400 && quiet < 5; i++) { await sleep(50); quiet = inflight ? 0 : quiet + 1; } };
  const fire = async (label, el, type) => {
    for (const fn of [...(el.listeners[type] || [])]) { // snapshot: handlers may re-wire this element
      try { await fn.call(el, { type, key: "Enter", target: el, preventDefault() {} }); } catch (e) { errors.push(`${label} ${type}: ${e.message}`); }
    }
    await settle();
  };
  try {
    new Function("window", "document", "location", "navigator", "localStorage", "fetch", "setTimeout", "clearTimeout", "setInterval", "clearInterval", js)(
      window, document, location, navigator, localStorage, fetchShim, noop, noop, noop, noop);
  } catch (e) { errors.push("boot: " + e.message); }
  await settle();
  const bar = els.updatebar ? els.updatebar.innerHTML : "";
  if (!handlers) { process.off("unhandledRejection", onRejection); return { errors, hits, tabs: tabs.length, bar, els, store }; }
  for (const t of tabs) await fire("tab " + t.dataset.tab, t, "click");
  // Every handler the page wired up, except Quit (stops the server), the
  // local-model setup (starts a download; its route is hit directly below),
  // screen capture (takes a real screenshot) and "Write it now" (pops a real
  // desktop notification), and Watch GitHub (the app would read GitHub a minute
  // later; its route is hit directly below). The updater is only wired via
  // onclick, never called.
  const SKIP = new Set(["quit", "setuplocal", "capture", "weeklynow", "wgithub"]);
  for (const [id, el] of Object.entries({ ...els })) {
    if (SKIP.has(id)) continue;
    for (const type of ["click", "change", "keydown"]) if (el.listeners[type]) await fire("#" + id, el, type);
  }
  process.off("unhandledRejection", onRejection);
  return { errors, hits, tabs: tabs.length, bar, els };
}

// (path, method) exactly as the browser UI calls them. Body is always "{}".
const calls = [
  ["/", "GET"],
  ["/api/status", "GET"],
  ["/api/map", "GET"],
  ["/api/scan", "GET"],          // scan progress the Map polls while loading
  ["/api/node?id=me", "GET"],
  ["/api/tasks", "GET"],
  ["/api/tasks/push", "POST"],   // the button's call — the 0.10.2 bug
  ["/api/tasks/add", "POST"],
  ["/api/tasks/toggle", "POST"],
  ["/api/tasks/remove", "POST"],
  ["/api/tasks/restore", "POST"],
  ["/api/drift?ci=0&fetch=0", "GET"],
  ["/api/models", "GET"],
  ["/api/agentcfg", "GET"],
  ["/api/agentcmd", "POST"],
  ["/api/agents", "GET"],
  ["/api/open", "POST"],         // no path -> no handoff runs
  ["/api/setup-local", "POST"],
  ["/api/tasks/sync", "POST"],
  ["/api/tasks/chat", "POST"],   // no id -> "not found", no model call
  ["/api/tasks/chat/clear", "POST"],
  ["/api/tasks?archived=1", "GET"],
  ["/api/scanroots", "GET"],
  ["/api/scanroots/add", "POST"],
  ["/api/scanroots/remove", "POST"],
  ["/api/knowledge", "GET"],
  ["/api/knowledge/add", "POST"],     // no path -> "folder not found", nothing saved
  ["/api/knowledge/remove", "POST"],
  ["/api/knowledge/index", "POST"],   // no folders -> nothing read
  ["/api/knowledge/search?q=x", "GET"],
  ["/api/run", "POST"],         // no AI connected -> "not-connected", no model call
  ["/api/review", "POST"],
  ["/api/suggest", "POST"],
  ["/api/connect", "POST"],      // no provider -> rejected, nothing saved
  ["/api/ping", "GET"],          // heartbeat the UI polls for auto-refresh/update
  ["/api/whatsnew", "GET"],      // what's new since the version you last saw (the changelog)
  ["/api/whatsnew?latest=1", "GET"], // what the update on offer brings (none newer here -> nothing fetched)
  ["/api/whatsnew/seen", "POST"],    // Got it: seenVersion is this version
  ["/api/pending", "GET"],       // tasks the agent ticked, awaiting approval
  ["/api/pending/diff?repo=x", "GET"],
  ["/api/pending/approve", "POST"], // no repo -> "nothing awaiting review", no git runs
  ["/api/pending/sendback", "POST"],
  ["/api/automerge", "POST"],       // per-repo auto-merge opt-in toggle
  ["/api/agent/grant", "POST"],     // grant the agent a tool/folder it asked for
  ["/api/agents/answer", "POST"],   // no path -> "no agent has run there", nothing written
  ["/api/agents/skip", "POST"],     // no path -> "no agent has run there", nothing written
  ["/api/agents/remember", "POST"], // no path -> "no agent has run there", nothing remembered
  ["/api/awaiting", "GET"],
  ["/api/awaiting/stop", "POST"],   // no id -> "nothing's waiting by that id"
  ["/api/mail", "GET"],             // detected mail sources (isolated HOME -> none)
  ["/api/mail/set", "POST"],        // empty body -> nothing changes
  ["/api/mail/preview?days=7", "GET"],
  ["/api/screens", "GET"],          // saved screens (isolated HOME -> none)
  ["/api/screens/import", "POST"],  // no image -> "isn't a PNG", nothing saved
  ["/api/screens/regions", "POST"], // no id -> "not found"
  ["/api/screens/rename", "POST"],
  ["/api/screens/remove", "POST"],
  ["/api/screens/click", "POST"],   // not confirmed -> refused, nothing clicks
  ["/api/screens/allow", "POST"],   // not confirmed -> refused, no permission changes
  ["/api/screens/monitors", "GET"], // lists the displays (read-only)
  ["/api/screens/split", "POST"],   // no id -> "not found", nothing written
  ["/api/screens/map", "POST"],     // no site -> refused before a browser starts
  ["/api/screens/press", "POST"],   // not confirmed -> refused, nothing pressed
  ["/api/screens/type", "POST"],    // no id -> "not found", nothing typed
  ["/api/screens/scroll", "POST"],  // no id -> "not found", no browser starts
  ["/api/screens/whole", "POST"],   // no id -> "not found", no browser starts
  ["/api/screens/trusted", "GET"],  // trusted sites (isolated HOME -> none)
  ["/api/screens/trusted/add", "POST"],    // no site -> refused, nothing saved
  ["/api/screens/trusted/remove", "POST"],
  ["/api/screens/signin", "POST"],  // no site -> refused, no window opens
  ["/api/home", "GET"],             // the liquid's live data (isolated HOME -> empty)
  ["/api/home/ask", "POST"],        // no question -> "empty", no model call
  ["/api/adapt", "GET"],            // its shape from how it's used
  ["/api/adapt/use", "POST"],       // no shape -> "unknown shape", nothing saved
  ["/api/lanes", "GET"],            // handovers between agents' lanes (isolated HOME -> none)
  ["/api/mind", "GET"],             // what Symbiot remembers across the app (isolated HOME -> nothing)
  ["/api/mind/forget", "POST"],     // no id -> "Nothing remembered by that id"
  ["/api/links", "GET"],            // Link your work: the standard sites and where each stands
  ["/api/links/link", "POST"],      // no id -> "No link called", no browser opened
  ["/api/links/check", "POST"],     // no id -> "isn't linked"
  ["/api/links/unlink", "POST"],
  ["/api/posts", "GET"],            // the week's drafts waiting on you (isolated HOME -> none)
  ["/api/posts/draft", "POST"],     // no AI connected -> says so, nothing written
  ["/api/posts/approve", "POST"],   // no id -> "No draft", nothing copied
  ["/api/posts/edit", "POST"],      // no text -> refused
  ["/api/posts/skip", "POST"],      // no id -> "No draft"
  ["/api/posts/voice", "POST"],     // not confirmed -> refused, no browser opens
  ["/api/reports", "GET"],          // what runs wrote up (isolated HOME -> none)
  ["/api/reports/read", "GET"],     // no id -> "No report by that id"
  ["/api/reports/seen", "POST"],    // mark all read (none)
  ["/api/watch", "GET"],           // watched pages + what's new (isolated HOME -> none)
  ["/api/watch/add", "POST"],       // no screen or site -> refused, nothing saved
  ["/api/watch/every", "POST"],     // no id -> "No watch"
  ["/api/watch/remove", "POST"],
  ["/api/watch/check", "POST"],     // no id -> "No watch", no browser starts
  ["/api/watch/clear", "POST"],     // clears the (empty) list of what's new
  ["/api/watch/seen", "POST"],      // no id -> "No watch", nothing changes
  ["/api/watch/brief", "POST"],     // empty body -> the brief stays off
  ["/api/watch/draft", "POST"],     // no id -> refused, no agent starts
  ["/api/watch/open-chat", "POST"], // no id -> refused, no window opens
  ["/api/watch/chat", "POST"],      // no id -> "No watch", no model call
  ["/api/watch/chat/clear", "POST"],
  ["/api/watch/board", "GET"],      // the Dashboard: a card per watch (none here)
  ["/api/phone", "GET"],            // Watch on your phone: this computer's side (off)
  ["/api/phone/link", "POST"],      // empty body -> off: nothing listens on the network
  ["/api/phone/code", "POST"],      // a pairing code, held in memory (nothing listens while off)
  ["/api/phone/unpair", "POST"],    // no id -> nothing changes
  ["/api/phone/pair", "POST"],      // no address -> refused before any request
  ["/api/phone/check", "POST"],     // not paired -> nothing asked
  ["/api/phone/forget", "POST"],
  ["/api/desktop", "GET"],         // weekly write-up + start-at-login state
  ["/api/desktop/weekly", "POST"],  // empty body -> schedule unchanged (stays off)
  ["/api/desktop/autostart", "POST"], // empty body -> off: removes nothing outside the isolated HOME
];
// Endpoints never hit here, and why. Anything else the UI calls must be covered.
const NOT_HIT = { "/api/update": "runs a real global npm install", "/api/quit": "hit last, below", "/api/screens/capture": "takes a real screenshot", "/api/desktop/weekly/run": "the UI's {} pops a real desktop notification: hit below with notify: false" };

// Every api('/api/...') call in the UI's JS, with the method its api() helper
// sends: POST when a body argument is passed, else GET. Read from the source,
// so a UI call whose method drifts from the table above fails here.
function uiCalls(js) {
  const out = [];
  for (const m of js.matchAll(/\bapi\(\s*(['"])(\/api\/[A-Za-z0-9\/_-]+)/g)) {
    let q = m[1], depth = 0, method = "GET"; // we start inside the path's string literal
    for (let i = m.index + m[0].length; i < js.length; i++) {
      const ch = js[i];
      if (q) { if (ch === "\\") i++; else if (ch === q) q = ""; continue; }
      if (ch === "'" || ch === '"') q = ch;
      else if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) { if (!depth) break; depth--; }
      else if (ch === "," && !depth) { method = "POST"; break; }
    }
    out.push([m[2], method]);
  }
  return out;
}
try {
  console.log("UI — the served page's JS parses, boots, and every tab/button works");
  const page = await (await fetch(base + "/")).text();
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let parsed = scripts.length > 0;
  for (const s of scripts) { try { new Function(s); } catch (e) { parsed = false; console.log("    parse error: " + e.message); } }
  ok(`served page's JS parses (${scripts.length} script block)`, parsed, scripts.length);
  const js = scripts.join("\n");
  if (parsed) {
    const ui = await runUi(js, page);
    ok(`UI boots and runs ${ui.tabs} tabs + every handler without an error`, ui.errors.length === 0, ui.errors);
    const bad = ui.hits.filter((h) => h.status !== 200);
    ok(`all ${ui.hits.length} requests the UI made returned 200`, ui.hits.length > 0 && bad.length === 0, bad);
    const uiPaths = new Set([...js.matchAll(/api\(\s*['"](\/api\/[A-Za-z0-9\/_-]+)/g)].map((m) => m[1]));
    const covered = new Set([...ui.hits.map((h) => h.path), ...calls.map(([p]) => p.split("?")[0]), ...Object.keys(NOT_HIT)]);
    const missing = [...uiPaths].filter((p) => !covered.has(p));
    ok(`every endpoint the UI calls (${uiPaths.size}) is covered by this test`, missing.length === 0, missing);
    const apiCalls = uiCalls(js), table = new Set(calls.map(([p, m]) => p.split("?")[0] + " " + m));
    const drift = apiCalls.filter(([p, m]) => !(p in NOT_HIT) && !table.has(p + " " + m)).map(([p, m]) => `UI sends ${m} ${p}`);
    ok(`the UI's ${apiCalls.length} api() calls use the methods this test hits`, apiCalls.length > 0 && drift.length === 0, [...new Set(drift)]);

    console.log("UPDATE — the page offers a newer version once, and stops if the update didn't take");
    const { version } = await (await fetch(base + "/api/ping", { headers: H })).json();
    ok(`a newer version on npm (${LATEST}) shows the Update & restart button`, ui.bar.includes(LATEST) && ui.bar.includes("doupd"), ui.bar);
    // the page sets this before it updates; seeing the SAME version after the
    // restart means the install didn't advance — the button would just loop
    const stuck = await runUi(js, page, { storage: { symbiot_update_tried: version }, handlers: false });
    ok("after an update that didn't take: no button, tells you how to update by hand", stuck.errors.length === 0 && !stuck.bar.includes("doupd") && /didn't take/.test(stuck.bar) && /npm install -g symbiot@latest/.test(stuck.bar), { errors: stuck.errors, bar: stuck.bar });
    const moved = await runUi(js, page, { storage: { symbiot_update_tried: "0.0.1" }, handlers: false });
    ok("after an update that advanced: offers the next one normally", moved.errors.length === 0 && moved.bar.includes("doupd"), moved.bar);

    console.log("ANDROID APP — Settings offers the Symbiot running in Termux, and back");
    const said = [];
    const phone = (on) => ({ termux: () => JSON.stringify({ installed: true, on }), openTermux: () => said.push("openTermux"), builtIn: () => said.push("builtIn"), storage() {} });
    ok("in a browser, there's no Termux block", !ui.els.phonebtn);
    const off = await runUi(js, page, { handlers: false, android: phone(false) });
    const offBtn = off.els.phonebtn || {}, offNote = (off.els.phonenote || {}).innerHTML || "";
    if (offBtn.onclick) offBtn.onclick();
    ok("in the app, with Termux on the phone: Open Termux, which asks the app to open it", off.errors.length === 0 && offBtn.textContent === "Open Termux" && /private/.test(offNote) && said.join() === "openTermux", { errors: off.errors, btn: offBtn.textContent, said });
    const on = await runUi(js, page, { handlers: false, android: phone(true) });
    const onBtn = on.els.phonebtn || {};
    if (onBtn.onclick) onBtn.onclick();
    delete globalThis.SymbiotAndroid;
    ok("showing the Termux Symbiot: a way back to the app's own", on.errors.length === 0 && /own Symbiot/.test(onBtn.textContent) && said.join() === "openTermux,builtIn", { errors: on.errors, btn: onBtn.textContent, said });

    console.log("TERMUX — Symbiot in Termux, open in the phone's browser, offers the Android app");
    const PHONE = "Mozilla/5.0 (Linux; Android 16; SM-A266B) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
    ok("not in Termux: no app bar", !((ui.els.appbar || {}).innerHTML || ""), (ui.els.appbar || {}).innerHTML);
    const tb = await runUi(js, page, { handlers: false, termux: true, ua: PHONE });
    const tbar = (tb.els.appbar || {}).innerHTML || "";
    ok("in the phone's browser: Open in the app, an intent:// link to the app's symbiot:// scheme with this Symbiot's address", tb.errors.length === 0 && tbar.includes(`intent://127.0.0.1:7391/?t=${token}#Intent;scheme=symbiot;package=co.symbiot.app;end`) && /show/.test(tb.els.appbar.className), { errors: tb.errors, bar: tbar });
    const off2 = tb.els.appbaroff || {}; if (off2.onclick) off2.onclick();
    ok("Hide puts it away for good", !/show/.test(tb.els.appbar.className) && tb.store.symbiot_appbar_off === "1", tb.store);
    const hidden = await runUi(js, page, { handlers: false, termux: true, ua: PHONE, storage: { symbiot_appbar_off: "1" } });
    const inApp = await runUi(js, page, { handlers: false, termux: true, ua: PHONE, android: phone(true) });
    delete globalThis.SymbiotAndroid;
    const desk = await runUi(js, page, { handlers: false, termux: true, ua: "Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0" });
    ok("no app bar once hidden, inside the app, or off Android", [hidden, inApp, desk].every((r) => r.errors.length === 0 && !((r.els.appbar || {}).innerHTML || "")), [hidden, inApp, desk].map((r) => [r.errors, (r.els.appbar || {}).innerHTML]));
  }

  console.log("SMOKE — every UI endpoint responds (no 404 route/method mismatch)");
  for (const [path, method] of calls) {
    let status = 0;
    try { const r = await fetch(base + path, { method, headers: H, body: method === "POST" ? "{}" : undefined }); status = r.status; } catch (e) { status = -1; }
    ok(`${method} ${path} -> ${status}`, status !== 404 && status !== -1, status);
  }
  const wk = await fetch(base + "/api/desktop/weekly/run", { method: "POST", headers: H, body: JSON.stringify({ notify: false }) }).then((r) => r.json(), () => ({}));
  ok("POST /api/desktop/weekly/run with notify: false -> runs, no AI connected", wk.error === "not-connected", wk);

  console.log("WEEKLY — isAppRunningWeekly() finds this app and its schedule, with no port or token passed");
  const runningWeekly = (extra = {}) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["--input-type=module", "-e", `import { isAppRunningWeekly } from ${JSON.stringify(join(HERE, "..", "index.mjs"))}; console.log(JSON.stringify(await isAppRunningWeekly()));`], { env: { ...env, ...extra }, stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; p.stdout.on("data", (d) => (out += d)); p.on("exit", () => resolve(out.trim()));
  });
  const setWk = (on) => fetch(base + "/api/desktop/weekly", { method: "POST", headers: H, body: JSON.stringify({ on }) });
  const wkOff = await runningWeekly(); await setWk(true);
  const wkOn = await runningWeekly(), wkNoApp = await runningWeekly({ SYMBIOT_PORT: "1" }); await setWk(false);
  ok("false while the weekly write-up is off, true once it's on", wkOff === "false" && wkOn === "true", [wkOff, wkOn]);
  ok("false when no app answers", wkNoApp === "false", wkNoApp);

  console.log("MAIL — a website typed into the mail box points to Trusted sites, and trusts nothing by itself");
  const mailAdd = (add) => fetch(base + "/api/mail/set", { method: "POST", headers: H, body: JSON.stringify({ add }) }).then((r) => r.json(), () => ({}));
  const [mDomain, mUrl, mFile] = [await mailAdd("google.com"), await mailAdd("https://mail.google.com/mail/u/0/"), await mailAdd(join(HOME, "nope", "Sent.mbox"))];
  const trustedNow = await (await fetch(base + "/api/screens/trusted", { headers: H })).json();
  ok("google.com in the mail box -> says it's a website and to use Trusted sites", mDomain.site === "google.com" && /Trusted sites/.test(mDomain.error || "") && !(mDomain.sources || []).length, mDomain);
  ok("a Gmail address -> its host, mail.google.com", mUrl.site === "mail.google.com", mUrl);
  ok("a missing .mbox -> still \"not found\", not a website", !mFile.site && /^not found/.test(mFile.error || ""), mFile);
  ok("none of it trusts a site", (trustedNow.sites || []).length === 0, trustedNow);

  console.log("METHODS — POST-only endpoints refuse GET; /api/* needs the token");
  // a GET to a POST route must not reach its handler (a GET can't change state,
  // and a UI calling with the wrong method fails loudly instead of half-working)
  const postOnly = [...new Set([...calls.filter(([, m]) => m === "POST").map(([p]) => p.split("?")[0]), "/api/update"])];
  const answered = [];
  for (const p of postOnly) {
    let status = 0;
    try { status = (await fetch(base + p, { headers: H })).status; } catch { status = -1; }
    if (status !== 404) answered.push(`GET ${p} -> ${status}`);
  }
  ok(`all ${postOnly.length} POST-only endpoints answer GET with 404`, answered.length === 0, answered);
  const noTok = await fetch(base + "/api/status").then((r) => r.status, () => -1);
  const badTok = await fetch(base + "/api/status", { headers: { "x-symbiot-token": "wrong" } }).then((r) => r.status, () => -1);
  ok(`no token -> 403, wrong token -> 403`, noTok === 403 && badTok === 403, { noTok, badTok });

  let quit = 0;
  try { quit = (await fetch(base + "/api/quit", { headers: H })).status; } catch { quit = -1; }
  ok(`GET /api/quit -> ${quit}`, quit === 200, quit);
} finally {
  child.kill("SIGKILL");
  reg.close();
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
