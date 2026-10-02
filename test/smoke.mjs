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
// `storage` seeds the page's localStorage; `handlers: false` only boots the page.
async function runUi(js, page, { storage = {}, handlers = true } = {}) {
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
  const location = { search: "?t=" + token, reload() {} };
  const window = { location, open() {}, addEventListener() {} };
  const navigator = { clipboard: { writeText: () => Promise.resolve() } };
  const fetchShim = (path, opts = {}) => {
    inflight++;
    return fetch(base + path, opts)
      .then((r) => { hits.push({ path: path.split("?")[0], method: opts.method || "GET", status: r.status }); return r; })
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
  if (!handlers) { process.off("unhandledRejection", onRejection); return { errors, hits, tabs: tabs.length, bar }; }
  for (const t of tabs) await fire("tab " + t.dataset.tab, t, "click");
  // Every handler the page wired up, except Quit (stops the server), the
  // local-model setup (starts a download; its route is hit directly below),
  // screen capture (takes a real screenshot) and "Write it now" (pops a real
  // desktop notification). The updater is only wired via onclick, never called.
  const SKIP = new Set(["quit", "setuplocal", "capture", "weeklynow"]);
  for (const [id, el] of Object.entries({ ...els })) {
    if (SKIP.has(id)) continue;
    for (const type of ["click", "change", "keydown"]) if (el.listeners[type]) await fire("#" + id, el, type);
  }
  process.off("unhandledRejection", onRejection);
  return { errors, hits, tabs: tabs.length, bar };
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
  ["/api/run", "POST"],          // no AI connected -> "not-connected", no model call
  ["/api/review", "POST"],
  ["/api/suggest", "POST"],
  ["/api/connect", "POST"],      // no provider -> rejected, nothing saved
  ["/api/ping", "GET"],          // heartbeat the UI polls for auto-refresh/update
  ["/api/pending", "GET"],       // tasks the agent ticked, awaiting approval
  ["/api/pending/diff?repo=x", "GET"],
  ["/api/pending/approve", "POST"], // no repo -> "nothing awaiting review", no git runs
  ["/api/pending/sendback", "POST"],
  ["/api/automerge", "POST"],       // per-repo auto-merge opt-in toggle
  ["/api/agent/grant", "POST"],     // grant the agent a tool/folder it asked for
  ["/api/agents/answer", "POST"],   // no path -> "no agent has run there", nothing written
  ["/api/mail", "GET"],             // detected mail sources (isolated HOME -> none)
  ["/api/mail/set", "POST"],        // empty body -> nothing changes
  ["/api/mail/preview?days=7", "GET"],
  ["/api/screens", "GET"],          // saved screens (isolated HOME -> none)
  ["/api/screens/import", "POST"],  // no image -> "isn't a PNG", nothing saved
  ["/api/screens/regions", "POST"], // no id -> "not found"
  ["/api/screens/rename", "POST"],
  ["/api/screens/remove", "POST"],
  ["/api/desktop", "GET"],          // weekly write-up + start-at-login state
  ["/api/desktop/weekly", "POST"],  // empty body -> schedule unchanged (stays off)
  ["/api/desktop/autostart", "POST"], // empty body -> off: removes nothing outside the isolated HOME
];
// Endpoints never hit here, and why. Anything else the UI calls must be covered.
const NOT_HIT = { "/api/update": "runs a real global npm install", "/api/quit": "hit last, below", "/api/screens/capture": "takes a real screenshot", "/api/desktop/weekly/run": "pops a real desktop notification" };

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
  }

  console.log("SMOKE — every UI endpoint responds (no 404 route/method mismatch)");
  for (const [path, method] of calls) {
    let status = 0;
    try { const r = await fetch(base + path, { method, headers: H, body: method === "POST" ? "{}" : undefined }); status = r.status; } catch (e) { status = -1; }
    ok(`${method} ${path} -> ${status}`, status !== 404 && status !== -1, status);
  }

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
