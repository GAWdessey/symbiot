// symbiot — Marketing's media capture: pictures and short clips of a product, taken by
// Symbiot itself for its pick tray (tray.mjs), so a post needs no demo video. Most people
// don't have one. A web app is opened in a browser of its own (a fresh profile: nothing
// you're signed in to shows) at the screens its code and README name (screensOf); a
// desktop app's window is recorded (captureDesktop). Before anything reaches the tray,
// whatever could get you into trouble is found and blurred: names, emails, phone numbers,
// addresses, API keys, tokens and secrets, account and card numbers, what's typed into
// forms, notifications and chats, avatars and pictures (faces), and text inside pictures
// (read with tesseract, where it's installed). Each capture keeps its boxes in its
// .blur.json, all switched on, so the Marketing page shows what was blurred and you can
// switch any off, or draw one of your own (tray.mjs addBlur). The unblurred original
// stays in the lane's .symbiot/tray-originals/<product>/, never served, never posted.
//
// Symbiot itself is captured from a copy with made-up work in it (demo.mjs: Acme), started
// for the capture and stopped after it, never your own app with your work in it: so its
// tray can be brought up to date after every release in one go.
//
// `symbiot capture <product> [--url <its address>] [--window "<title>"]` runs it, from
// the app (index.mjs, server.mjs /api/marketing/capture): the marketing lane's agent
// calls it on a product's first run (marketing.mjs marketingBrief), instead of writing
// capture scripts of its own, which Symbiot won't run with the app's access.
import { join, relative, basename, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, mkdtempSync, rmSync, copyFileSync, renameSync, createWriteStream } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn, spawnSync } from "node:child_process";
import { MARKETING_DIR, displayName } from "./marketing.mjs";
import { MARKETING } from "./handover.mjs";
import { scratchPage, openPage, evaluate, SCROLLER as SCROLLER_JS } from "./headless.mjs";
import { renderCapture } from "./tray.mjs";
import { CONFIG_DIR, hasCmd } from "./core.mjs";
import { loadMind } from "./mind.mjs";
import { desktopNotify } from "./desktop.mjs";
import { laneMap as laneMapNow } from "./scan.mjs";
import { startDemo, DEMO_NAMES } from "./demo.mjs";

const VIEW = { w: 1440, h: 900 };
const MAX_SCREENS = 8, MAX_CLIPS = 3, CLIP_SECONDS = 6, CLIP_FPS = 12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// ---- the key screens ----------------------------------------------------------------
// A product's screens, from the routes in its code (file-based routers: Next, Nuxt,
// SvelteKit, Astro, Remix; route tables: Express and the like, React and Vue Router,
// Flask, FastAPI, Django, Rails; plain .html pages) and the addresses its README gives.
// Not a route with a parameter (/users/:id), nor one that isn't a screen (/api, /login,
// /webhook, a file). The README's first, then the shallowest.
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".output", ".svelte-kit", ".vercel", "vendor", "coverage", ".symbiot", "target", "venv", ".venv", "env", "__pycache__", "android", "ios", "Pods", "tmp", ".cache", "test", "tests", "__tests__", "e2e", "cypress", "fixtures", "migrations"]);
const CODE = /\.(?:m?[jt]sx?|cjs|vue|svelte|astro|mdx?|py|rb|html?)$/i;
const NOT_A_SCREEN = /^\/(?:api|auth|oauth2?|login|log-?out|sign-?(?:in|up|out)|register|callback|webhooks?|hooks?|health|healthz|status|static|assets|public|_[\w-]*|favicon[\w.-]*|robots\.txt|sitemap[\w.-]*|graphql|metrics|ws|socket(?:\.io)?)(?:\/|$)|\.(?!html?$)[a-z0-9]{1,5}$/i;
const PARAM = /[:*{}[\]<>$]|\(\.\*\)/;
function routeOf(p) {
  let s = String(p || "").trim().split(/[?#]/)[0];
  if (!s) return "/";
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/{2,}/g, "/").replace(/\/index(?:\.html?)?$/i, "/").replace(/(.)\/$/, "$1");
  if (PARAM.test(s) || NOT_A_SCREEN.test(s) || /\s/.test(s) || s.length > 80) return "";
  return s;
}
function sourceFiles(root, { max = 4000, depth = 8 } = {}) {
  const out = [];
  const walk = (dir, d) => {
    if (out.length >= max || d > depth) return;
    let ents = []; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= max) return;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(join(dir, e.name), d + 1); }
      else if (e.isFile() && CODE.test(e.name)) out.push(relative(root, join(dir, e.name)).split("\\").join("/"));
    }
  };
  walk(root, 0);
  return out;
}
// a file-based router's file, as its route: "" when it isn't one
const segs = (s) => s.split("/").filter((x) => x && !/^\(.*\)$/.test(x) && !x.startsWith("@")); // route groups and slots aren't in the address
function fileRoute(rel) {
  let m; const at = "^(?:.*?\\/)?"; // in a monorepo, the front end is a folder down (apps/web/, frontend/)
  if ((m = rel.match(new RegExp(at + "(?:src\\/)?pages\\/(.+)\\.(?:m?[jt]sx?|mdx?|vue|astro)$")))) { if (/^(?:api\/|_|404|500)/.test(m[1])) return ""; return "/" + segs(m[1].replace(/(?:^|\/)index$/, "")).join("/"); }
  if ((m = rel.match(new RegExp(at + "(?:src\\/)?app\\/(?:(.*)\\/)?page\\.(?:m?[jt]sx?|mdx)$")))) return "/" + segs(m[1] || "").join("/");
  if ((m = rel.match(new RegExp(at + "src\\/routes\\/(?:(.*)\\/)?\\+page\\.(?:svelte|[jt]s)$")))) return "/" + segs(m[1] || "").join("/");
  if ((m = rel.match(new RegExp(at + "app\\/routes\\/([^/]+)\\.[jt]sx?$")))) { const p = m[1].replace(/(?:^|\.)_index$/, "").split(".").filter((x) => x && !x.startsWith("_")); return "/" + p.join("/"); }
  if ((m = rel.match(/^(?:(?:.*?\/)?(?:public|static)\/)?([\w-]+)\.html?$/))) return m[1] === "index" ? "/" : "/" + m[1] + ".html";
  return "";
}
// a server's GET routes are screens only where it renders a page there (an API's answer JSON)
const SERVER_ROUTES = [/\b(?:app|router|server|routes)\s*\.\s*(?:get|route)\(\s*(['"`])(\/[^'"`\s]*)\1/g, /@\w+\.(?:route|get)\(\s*(['"])(\/[^'"]*)\1/g]; // Express, Koa, Fastify, Hono; Flask, FastAPI
const RENDERS = /\bres\.render\(|\bsendFile\(|\breply\.view\(|\bc\.html\(|\brender_template\(|\bTemplateResponse\(|\bHTMLResponse\b|text\/html/;
const JSX_ROUTE = /<Route\b[^>]*?\bpath\s*=\s*\{?\s*(['"`])([^'"`]+)\1/g; // React Router
const ROUTER_KEY = /\bpath\s*:\s*(['"`])(\/?[\w\-/]*)\1/g; // Vue Router, React Router's objects, Angular
function codeRoutes(root, { files = sourceFiles(root) } = {}) {
  const routes = new Set();
  const add = (p) => { const r = routeOf(p); if (r) routes.add(r); };
  // a file-based router's routes are the real ones: a table's path keys there are menu items, often relative
  const byFile = files.map(fileRoute).filter((r) => r && r !== "/" && !r.endsWith(".html")).length > 0;
  for (const rel of files) {
    const fr = fileRoute(rel); if (fr) add(fr);
    let text = ""; try { const f = join(root, rel); if (statSync(f).size > 400000) continue; text = readFileSync(f, "utf8"); } catch { continue; }
    if (RENDERS.test(text)) for (const re of SERVER_ROUTES) for (const m of text.matchAll(re)) add(m[2]);
    for (const m of text.matchAll(JSX_ROUTE)) add(m[2]);
    if (!byFile && /\b(?:createBrowserRouter|createRouter|RouterModule|routes)\b/.test(text)) for (const m of text.matchAll(ROUTER_KEY)) add(m[2]);
    if (/(?:^|\/)urls\.py$/.test(rel)) for (const m of text.matchAll(/\b(?:re_)?path\(\s*r?(['"])([\w\-/]*)\1/g)) add("/" + m[2]);
    if (/(?:^|\/)config\/routes\.rb$/.test(rel)) { for (const m of text.matchAll(/^\s*get\s+['"]([\w\-/]+)['"]/gm)) add(m[1]); for (const m of text.matchAll(/^\s*resources?\s+:(\w+)/gm)) add("/" + m[1]); }
  }
  return [...routes];
}
function readmeOf(root) {
  let ents = []; try { ents = readdirSync(root); } catch {}
  const f = ents.find((x) => /^readme(?:\.md|\.markdown|\.txt)?$/i.test(x));
  try { return f ? readFileSync(join(root, f), "utf8") : ""; } catch { return ""; }
}
// the addresses a README gives: its localhost links, and a path in backticks (`/dashboard`)
function readmePaths(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/[^\s)"'`<>]*)?/g)) out.push([m.index, m[1] || "/"]);
  // not an API call ("POST /send", "`GET /status`")
  for (const m of String(text || "").matchAll(/(\b(?:GET|POST|PUT|PATCH|DELETE)\s+)?`(?:(?:GET|POST|PUT|PATCH|DELETE)\s+)?(\/[a-z][\w\-/]*)`/gi)) if (!m[1] && !/`(?:GET|POST|PUT|PATCH|DELETE)\s/i.test(m[0]) && !/^\/(?:usr|etc|home|tmp|var|opt|bin|Users|dev|proc)\b/.test(m[2])) out.push([m.index, m[2]]);
  return out.sort((a, b) => a[0] - b[0]).map((x) => routeOf(x[1])).filter(Boolean); // in the README's order
}
const words = (p) => p.split("/").filter(Boolean).pop() || "";
const title = (p) => { const w = words(p).replace(/\.html?$/, "").replace(/[-_]+/g, " ").trim(); return w ? w.charAt(0).toUpperCase() + w.slice(1) : "Home"; };
// Symbiot's own screens: one page, each opened by its #name (ui.mjs lqDeep), from the made-up
// copy (demo.mjs). Home first: what only you can do, the agents' questions.
const SYMBIOT_SCREENS = [
  { path: "/", name: "home", screen: "Home", caption: "Symbiot: Home, what only you can do, each agent's question with two answers" },
  { path: "#tasks", name: "workdesk", screen: "Workdesk", caption: "Symbiot: the Workdesk, agents at work on every project" },
  { path: "#board", name: "dashboard", screen: "Dashboard", caption: "Symbiot: the Dashboard, what arrived and which of it needs you" },
  { path: "#week", name: "week", screen: "Week", caption: "Symbiot: the week, written up from git" },
  { path: "#map", name: "map", screen: "Map", caption: "Symbiot: the Map, every repo and what needs you first" },
  { path: "#marketing", name: "marketing", screen: "Marketing", caption: "Symbiot: Marketing, a drafted post waiting for your OK" },
].map((x) => ({ ...x, from: "symbiot" }));
// Before each picture of it: its version without "· sandbox", which the copy shows by it
const SYMBIOT_TIDY = "(() => { const v = document.getElementById('ver'); if (v) v.textContent = v.textContent.replace(/\\s*·\\s*sandbox$/, ''); })()";
// A screen's address: its route, or on a one-page app its #name, with the address's own
// ?token kept (and a ?shot= of its own, so each is a fresh load, not a jump on one page).
function screenUrl(base, path, i) {
  const q = base.includes("?");
  if (String(path).startsWith("#")) return `${base}${q ? "&" : "?"}shot=${i}${path}`;
  return q && path === "/" ? base : base + (path === "/" ? "/" : path);
}
// What the README says about a screen: the line that names it, plain. Else its name.
function captionFor(path, readme, product) {
  const lines = String(readme || "").split(/\r?\n/).map((l) => l.replace(/^\s*(?:#+|[-*+]|\d+[.)])\s*/, "").replace(/[*_`[\]]|\(https?:[^)]*\)/g, "").trim()).filter((l) => l.length > 8 && l.length < 220 && !/^[<!|]/.test(l));
  const w = words(path).replace(/\.html?$/, "").replace(/[-_]+/g, " ").trim();
  if (!w) { const tag = lines.find((l) => !/^#/.test(l) && /[a-z]/.test(l) && l.split(/\s+/).length >= 4 && !/[─│└┌┐┘├┤►◄═║]/.test(l)); return `${product}: ${tag ? clip(tag) : "its first screen"}`; }
  // a line that says something about it: words, not the path alone, a table or a drawing
  const says = (l) => !/[─│└┌┐┘├┤►◄═║]|[={}]/.test(l) && l.replace(/\S*\/\S*/g, "").split(/\s+/).filter((x) => /[a-z]{2}/i.test(x)).length >= 4;
  const hit = lines.find((l) => says(l) && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(l));
  return `${product}: ${hit ? clip(hit) : `the ${title(path)} screen`}`;
}
const clip = (s, n = 110) => { s = String(s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
// [{ path, name, caption, from: readme|routes }], the home screen first, at most max.
function screensOf(root, { product = basename(root), max = MAX_SCREENS, extra = [], files } = {}) {
  files = files || sourceFiles(root);
  const readme = readmeOf(root), code = codeRoutes(root, { files }), told = readmePaths(readme), inCode = new Set(code);
  const depth = (p) => p.split("/").filter(Boolean).length;
  // what a product shows first: its README's screens, then its dashboard and the like, then the shallowest
  const key = (p) => (/\/(?:dashboard|overview|home|app|inbox|projects?|analytics|reports?|agents?|workspace)$/i.test(p) ? 1 : 0);
  const page = (p) => (p.endsWith(".html") ? 1 : 0); // a static page (terms, privacy) after the app's own
  const ranked = [...code].sort((a, b) => (told.includes(b) ? 1 : 0) - (told.includes(a) ? 1 : 0) || page(a) - page(b) || key(b) - key(a) || depth(a) - depth(b) || a.length - b.length || (a < b ? -1 : 1));
  // a path only its README gives counts when there's a front end to show it (not an API's endpoints)
  const ui = files.some((f) => /\.(?:html?|[jt]sx|vue|svelte|astro)$/i.test(f));
  const all = [...new Set(["/", ...extra.map(routeOf).filter(Boolean), ...told.filter((p) => inCode.has(p) || p === "/" || (!code.length && ui)), ...ranked])];
  return all.slice(0, max).map((path) => ({ path, name: slug(words(path).replace(/\.html?$/, "")) || "home", caption: captionFor(path, readme, product), from: told.includes(path) ? "readme" : path === "/" ? "home" : "routes" }));
}
// A seed or demo script it has (package.json): captures with made-up data, not real.
function seedScript(root) {
  const s = (readJson(join(root, "package.json")) || {}).scripts || {};
  const k = Object.keys(s).find((x) => /^(?:db:)?seed$|demo|fixtures?/i.test(x));
  return k ? `npm run ${k}` : "";
}

// ---- what's private ---------------------------------------------------------------------
// The kinds found in text, in the page (DETECT) and in what tesseract reads off a picture
// (ocrBoxes) alike. A card number counts only when its digits pass the Luhn check.
const TEXT_KINDS = [
  ["email", "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+", "g"],
  ["phone", "\\+?\\(?\\d[\\d ()-]{8,}\\d", "g"],
  ["secret", "\\b(?:sk|pk|rk)[-_](?:live|test|proj)?[-_]?[\\w-]{12,}|\\bgh[pousr]_\\w{20,}|\\bxox[abposr]-[\\w-]{10,}|\\bAKIA[0-9A-Z]{12,}|\\bAIza[\\w-]{30,}|\\beyJ[\\w-]{8,}\\.[\\w-]{8,}\\.[\\w-]{8,}|\\b[a-f0-9]{32,}\\b|\\b[A-Za-z0-9_-]{40,}\\b", "g"],
  ["key", "\\b(?:api[_-]?key|token|secret|password|passwd|pwd|bearer)\\b\\s*[:=]\\s*\\S{6,}", "gi"],
  ["card", "\\b(?:\\d[ -]?){13,19}\\b", "g"],
  ["iban", "\\b[A-Z]{2}\\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\\b", "g"],
  ["account", "\\b(?:acct|cus|sub|pi|ch|in|txn|ord)_[A-Za-z0-9]{6,}\\b|\\b\\d{9,}\\b", "g"],
  ["path", "(?:\\/home|\\/Users|C:\\\\Users)[\\\\/][^\\s\"'<>]+|~\\/[\\w./-]+", "g"],
  ["url token", "[?&#](?:t|token|key|code|sig|signature|auth|access_token|session)=[\\w.%-]{8,}", "gi"],
  ["ip address", "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b", "g"],
  ["address", "\\b\\d{1,5}\\s+(?:[A-Z][a-z]+\\s){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Way|Close|Crescent|Court|Ct|Place|Pl)\\b\\.?", "g"],
];
const luhn = (s) => { const d = String(s).replace(/\D/g, ""); if (d.length < 13 || d.length > 19) return false; let sum = 0; for (let i = 0; i < d.length; i++) { let n = +d[d.length - 1 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } sum += n; } return sum % 10 === 0; };
const isDate = (s) => /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$|^\d{4}\s*-\s*\d{2}/.test(String(s).trim());
// the matches in one line of text: [{ kind, at, end, text }]; names: people's names to blur
function textHits(text, names = []) {
  const out = [], t = String(text || "");
  const kinds = [...TEXT_KINDS.map(([k, src, fl]) => [k, new RegExp(src, fl)])];
  if (names.length) kinds.push(["name", new RegExp("\\b(?:" + names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "gi")]);
  for (const [kind, re] of kinds) for (const m of t.matchAll(re)) {
    if (kind === "phone" && (isDate(m[0]) || m[0].replace(/\D/g, "").length < 9)) continue;
    if (kind === "card" && !luhn(m[0])) continue;
    if (kind === "ip address" && m[0].split(".").some((x) => +x > 255)) continue;
    out.push({ kind, at: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return out;
}
const hint = (s) => { s = String(s || ""); return s.length > 4 ? s.slice(0, 2) + "…" + s.slice(-2) : "…"; };
// In the page: the boxes to blur, in CSS pixels, each { kind, x, y, w, h, hint }. Runs
// there as it is, so it carries its own copy of the kinds above.
const DETECT = (names, { drawings = true } = {}) => `(() => {
  const KINDS = ${JSON.stringify(TEXT_KINDS)}, NAMES = ${JSON.stringify(names)};
  const luhn = ${luhn.toString()}, isDate = ${isDate.toString()};
  const kinds = KINDS.map(([k, s, f]) => [k, new RegExp(s, f)]);
  if (NAMES.length) kinds.push(["name", new RegExp("\\\\b(?:" + NAMES.map((n) => n.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&")).join("|") + ")\\\\b", "gi")]);
  const out = [], W = innerWidth, H = innerHeight;
  const seen = (b) => b.width > 1 && b.height > 1 && b.bottom > 0 && b.right > 0 && b.top < H && b.left < W;
  const shows = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const st = getComputedStyle(e); if (st.visibility === "hidden" || st.display === "none" || +st.opacity === 0) return false; } return true; };
  const hint = (s) => s.length > 4 ? s.slice(0, 2) + "…" + s.slice(-2) : "…";
  const box = (kind, b, h) => out.push({ kind, x: b.left, y: b.top, w: b.width, h: b.height, hint: h || "" });
  // text: every match of a kind, as the boxes its characters take up
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const t = n.nodeValue; if (!t || !t.trim() || !n.parentElement || !shows(n.parentElement)) continue;
    for (const [kind, re] of kinds) {
      re.lastIndex = 0;
      for (let m; (m = re.exec(t));) {
        if (!m[0]) { re.lastIndex++; continue; }
        if (kind === "phone" && (isDate(m[0]) || m[0].replace(/\\D/g, "").length < 9)) continue;
        if (kind === "card" && !luhn(m[0])) continue;
        if (kind === "ip address" && m[0].split(".").some((x) => +x > 255)) continue;
        const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
        for (const b of r.getClientRects()) if (seen(b)) box(kind, b, hint(m[0]));
      }
    }
  }
  const all = (sel) => [...document.querySelectorAll(sel)].filter((e) => { const b = e.getBoundingClientRect(); return seen(b) && shows(e); });
  // what's typed into a form (a field's value isn't text on the page)
  for (const e of all("input, textarea, select")) {
    const t = (e.type || "").toLowerCase(); if (/^(?:button|submit|reset|checkbox|radio|range|color|hidden|file|image)$/.test(t)) continue;
    if (t === "password" || String(e.value || "").trim()) box("typed in", e.getBoundingClientRect(), t === "password" ? "a password" : hint(String(e.value)));
  }
  // notifications and chats: what arrived, and who said what
  // (a heading that's aria-live is the page's title, said as it changes: not a notification)
  for (const e of all('[role=alert], [role=status], [aria-live]:not([aria-live=off]):not(h1,h2,h3,h4,h5,h6), [class*=toast], [class*=notification], [class*=snackbar]')) if (e.innerText && e.innerText.trim()) box("notification", e.getBoundingClientRect());
  for (const e of all('[role=log], [class*=conversation], [class*=chat-], [class*=message-list], [class*=messages]')) { const b = e.getBoundingClientRect(); if (b.width > 40 && b.height > 30 && e.innerText && e.innerText.trim()) box("chat", b); }
  // someone's name, whoever they are: the words beside an avatar, and what's marked as a person's name
  const textBoxes = (el, kind) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) { if (!n.nodeValue.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); for (const b of r.getClientRects()) if (seen(b)) box(kind, b, hint(n.nodeValue.trim())); } };
  const PERSONISH = /^[\\p{Lu}][\\p{L}'’.-]+(?:\\s+(?:(?:van|von|de|der|den|du|da|di|dos|le|la|bin|ibn|al|el)\\s+)*[\\p{Lu}][\\p{L}'’.-]+){0,3}$/u; // particles too: Pieter van Wyk
  // the name-like words nearest an avatar (within 160px, a parent or two up), not all its row's
  const near = (img) => {
    const a = img.getBoundingClientRect(); let best = null, d0 = 160;
    for (let p = img.parentElement, i = 0; p && i < 3; p = p.parentElement, i++) {
      const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        const t = n.nodeValue.trim(); if (!t || t.length > 60 || !(PERSONISH.test(t) || /@/.test(t)) || document.title.trim().toLowerCase().startsWith(t.toLowerCase())) continue; // not the product's own name
        const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); if (!seen(b)) continue;
        const d = Math.hypot(Math.max(0, b.left - a.right, a.left - b.right), Math.max(0, b.top - a.bottom, a.top - b.bottom)) + (b.right <= a.left || b.bottom <= a.top ? 20 : 0); // a name usually follows its picture
        if (d < d0) { d0 = d; best = b; }
      }
      if (best) break;
    }
    if (best) box("name", best);
  };
  // a customer's or client's name in a table of them: a cell that's just a name (two to four words, each capitalised)
  for (const e of all('td, [role=gridcell], [role=cell]')) { const t = (e.innerText || "").trim(); if (t.length <= 50 && /\\s/.test(t) && PERSONISH.test(t)) textBoxes(e, "name"); }
  for (const e of all('[class*=username], [class*=user-name], [class*=author], [class*=display-name], [class*=displayname], [class*=profile-name], [class*=account-name], [itemprop=name], [data-testid*=user], [aria-label*=account i]')) { const t = (e.innerText || "").trim(); if (t && t.length <= 60 && (PERSONISH.test(t) || /@/.test(t))) textBoxes(e, "name"); }
  // pictures: an avatar (a face, someone's photo), or any picture that isn't an icon or a logo
  const pic = (e) => { const s = String(e.currentSrc || e.src || e.getAttribute("href") || getComputedStyle(e).backgroundImage || ""); return { s, svg: /\\.svg(?:[?#]|$)|^data:image\\/svg|image\\/svg/i.test(s) }; };
  const ICON = /logo|icon|brand|sprite|emoji|badge|flag/i, AVATAR = /avatar|profile|user|gravatar|googleusercontent|pfp|headshot|portrait|people|person|member|author/i;
  for (const e of all("img, picture > img, video, canvas, image, [style*=background-image]")) {
    const b = e.getBoundingClientRect(); if (b.width < 16 || b.height < 16) continue;
    const { s, svg } = pic(e), tag = e.tagName.toLowerCase(), what = [s, e.alt || "", e.className && e.className.baseVal != null ? e.className.baseVal : e.className || "", e.id || "", e.getAttribute("aria-label") || ""].join(" ");
    if (tag !== "video" && tag !== "canvas" && (svg || (ICON.test(what) && !AVATAR.test(what)))) continue;
    // a drawing hidden from screen readers that fills most of the window is the page's backdrop
    // (Symbiot's liquid), not something on it; and with drawings off (made-up data), none is boxed
    if (tag === "canvas" && (!${drawings ? "true" : "false"} || (e.getAttribute("aria-hidden") === "true" && b.width * b.height >= innerWidth * innerHeight * 0.5))) continue;
    if (tag !== "img" && tag !== "video" && tag !== "canvas" && tag !== "image" && !/url\\(/.test(s)) continue;
    const round = parseFloat(getComputedStyle(e).borderRadius) >= Math.min(b.width, b.height) * 0.35;
    if ((round || AVATAR.test(what)) && b.width <= 200 && b.height <= 200) { box("avatar", b); near(e); }
    else if (tag === "canvas") box("picture", b, "a drawing on the page");
    else if (b.width >= 40 && b.height >= 40) box("picture", b);
  }
  return out;
})()`;
const pad = (r, W, H) => { const x = Math.max(0, Math.floor(r.x - 4)), y = Math.max(0, Math.floor(r.y - 3)); return { ...r, x, y, w: Math.min(W - x, Math.ceil(r.w + 8)), h: Math.min(H - y, Math.ceil(r.h + 6)) }; };
// one box per place: the same kind over the same spot once
function merge(boxes) {
  const out = [];
  for (const b of boxes) if (!out.some((o) => o.kind === b.kind && Math.abs(o.x - b.x) < 3 && Math.abs(o.y - b.y) < 3 && Math.abs(o.w - b.w) < 6 && Math.abs(o.h - b.h) < 6)) out.push(b);
  return out;
}
const covered = (b, by) => by.some((o) => b.x >= o.x - 4 && b.y >= o.y - 4 && b.x + b.w <= o.x + o.w + 4 && b.y + b.h <= o.y + o.h + 4);

// Text read off a picture with tesseract (a page's pictures and drawings, or a desktop app's
// window), as boxes in its pixels. Read at twice its size (screen text is small). [] when
// tesseract isn't here: { boxes, read: false }.
const canOcr = () => hasCmd("tesseract") && hasCmd("ffmpeg");
function ocrBoxes(png, names = [], { run = spawnSync } = {}) {
  if (!canOcr()) return { boxes: [], read: false };
  const t = mkdtempSync(join(tmpdir(), "symbiot-ocr-")), big = join(t, "big.png");
  try {
    const s = run("ffmpeg", ["-loglevel", "error", "-y", "-i", png, "-vf", "scale=iw*2:ih*2:flags=lanczos,format=gray", big], { encoding: "utf8", timeout: 60000 });
    if (s.status !== 0) return { boxes: [], read: false };
    const r = run("tesseract", [big, "stdout", "--psm", "11", "tsv"], { encoding: "utf8", timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
    if (r.status !== 0) return { boxes: [], read: false };
    return { boxes: tsvBoxes(String(r.stdout || ""), names, 2), read: true };
  } catch { return { boxes: [], read: false }; } finally { rmSync(t, { recursive: true, force: true }); }
}
// tesseract's TSV (a row a word, with its box) as lines; each match's words as one box
function tsvBoxes(tsv, names = [], scale = 1) {
  const lines = new Map();
  for (const row of tsv.split("\n").slice(1)) {
    const c = row.split("\t"); if (c.length < 12 || c[0] !== "5") continue;
    const text = c.slice(11).join("\t").trim(); if (!text || Number(c[10]) < 30) continue;
    const key = c.slice(1, 5).join("."), l = lines.get(key) || { words: [], text: "" };
    const at = l.text ? l.text.length + 1 : 0; l.text += (l.text ? " " : "") + text;
    l.words.push({ at, end: at + text.length, x: +c[6] / scale, y: +c[7] / scale, w: +c[8] / scale, h: +c[9] / scale });
    lines.set(key, l);
  }
  const out = [];
  for (const l of lines.values()) for (const m of textHits(l.text, names)) {
    const ws = l.words.filter((w) => w.end > m.at && w.at < m.end); if (!ws.length) continue;
    const x = Math.min(...ws.map((w) => w.x)), y = Math.min(...ws.map((w) => w.y)), x2 = Math.max(...ws.map((w) => w.x + w.w)), y2 = Math.max(...ws.map((w) => w.y + w.h));
    out.push({ kind: m.kind, x, y, w: x2 - x, h: y2 - y, hint: hint(m.text), read: true });
  }
  return out;
}

// People's names to blur: the people Symbiot remembers, the product's git authors and
// yours, and any listed in the lane's .symbiot/names.json (["Remy", "Sam Rivera"]). A whole
// name, and its parts from four letters (not the product's own name).
const NOT_NAMES = new Set(["admin", "user", "users", "team", "home", "support", "info", "hello", "root", "github", "symbiot", "bot", "dependabot", "renovate"]);
function namesToBlur(root, { dir = MARKETING_DIR, product = "", mind } = {}) {
  const raw = new Set();
  if (!mind) mind = loadMind(); // through mind.mjs: a corrupt save reads its .bak, not as nobody to blur (15 Oct 2026)
  for (const n of (mind && Array.isArray(mind.nodes) ? mind.nodes : [])) if (n && n.kind === "person" && n.name) raw.add(String(n.name));
  if (root) {
    const r = spawnSync("git", ["-C", root, "log", "-500", "--format=%an"], { encoding: "utf8", timeout: 15000 });
    for (const l of String(r.stdout || "").split("\n")) if (l.trim()) raw.add(l.trim());
    const me = spawnSync("git", ["-C", root, "config", "user.name"], { encoding: "utf8", timeout: 5000 });
    if (String(me.stdout || "").trim()) raw.add(String(me.stdout).trim());
  }
  for (const n of [].concat(readJson(join(dir, ".symbiot", "names.json")) || [])) if (typeof n === "string" && n.trim()) raw.add(n.trim());
  const own = new Set(slug(product).split("-"));
  const out = new Set();
  for (const n of raw) {
    if (/\[bot\]|noreply|^\W*$/i.test(n)) continue;
    const whole = n.replace(/\s+/g, " ").trim(); if (whole.length >= 3 && !NOT_NAMES.has(whole.toLowerCase())) out.add(whole);
    for (const p of whole.split(/[\s._-]+/)) if (p.length >= 4 && /^[A-Za-z]/.test(p) && !NOT_NAMES.has(p.toLowerCase()) && !own.has(p.toLowerCase())) out.add(p);
  }
  return [...out].sort((a, b) => b.length - a.length).slice(0, 300);
}

// ---- the tray -----------------------------------------------------------------------
// drafts/<product>/tray/ in the lane, with its tray.json; the originals beside it in the
// lane's .symbiot/tray-originals/<product>/ (tray.mjs reads them from there).
function trayPaths(product, dir = MARKETING_DIR) {
  const folder = slug(product) || "product";
  return { folder, rel: `drafts/${folder}/tray`, root: join(dir, "drafts", folder, "tray"), orig: join(dir, ".symbiot", "tray-originals", folder) };
}
// A capture into tray.json (one of its name replaced), and its .blur.json beside it.
function putInTray(t, item, spec) {
  mkdirSync(t.root, { recursive: true }); mkdirSync(t.orig, { recursive: true });
  writeFileSync(join(t.root, `${item.name}.blur.json`), JSON.stringify(spec, null, 2));
  const f = join(t.root, "tray.json"), idx = readJson(f) || { tray: t.folder, items: [] };
  idx.items = [...(Array.isArray(idx.items) ? idx.items : []).filter((x) => x && x.name !== item.name), item];
  writeFileSync(f, JSON.stringify(idx, null, 2));
}
const regionsOf = (boxes) => boxes.map((r, i) => ({ id: i + 1, kind: r.kind, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), hint: r.hint || "", on: true, ...(r.from != null ? { from: r.from, to: r.to } : {}) }));
// one track a box across a clip's moments: the same kind within a few pixels, close in time
function tracks(samples, gap = 0.6) {
  const out = [];
  for (const s of samples) for (const r of s.r) {
    const tr = out.find((k) => k.kind === r.kind && Math.abs(k.x - r.x) < 8 && Math.abs(k.y - r.y) < 8 && Math.abs(k.w - r.w) < 14 && s.t - k.last <= gap);
    if (tr) { tr.last = s.t; tr.x = Math.min(tr.x, r.x); tr.y = Math.min(tr.y, r.y); tr.w = Math.max(tr.w, r.w); tr.h = Math.max(tr.h, r.h); } else out.push({ ...r, first: s.t, last: s.t });
  }
  // a little before it's seen and after it goes (a sample is a moment apart); one still there at the end stays to the end
  const end = samples.length ? samples[samples.length - 1].t : 0;
  return out.map(({ first, last, ...r }) => ({ ...r, from: Math.max(0, +(first - 0.4).toFixed(2)), to: end - last < 0.3 ? 9999 : +(last + 0.4).toFixed(2) }));
}

// A stepped clip's boxes: each moment's, over the whole of it and a little either side
// (a jump's frame may come a beat before or after it's found), in seconds from its start.
const HOLD = 1.5, SLACK = 0.35;
function heldBoxes(held, start) {
  const out = [];
  held.forEach((h, i) => {
    const from = Math.max(0, +(h.at - start - SLACK).toFixed(2)), to = i === held.length - 1 ? 9999 : +(held[i + 1].at - start + SLACK).toFixed(2);
    for (const b of h.boxes) out.push({ ...b, from, to });
  });
  return out;
}

// ---- a web app --------------------------------------------------------------------------
// Each screen: a still (its picture, with its boxes, and the text tesseract reads off its
// pictures); the first few also a short clip, scrolling through it, its boxes found as it
// moves. A screen that sends you to sign in is skipped, said so. { items, skipped, read }.
async function captureWeb({ product, url, screens, t, names = [], drawings = true, tidy = "", clips = MAX_CLIPS, seconds = CLIP_SECONDS, page: withPage = scratchPage, ocr = ocrBoxes, encode = framesToVideo, now = Date.now() }) {
  const base = String(url).replace(/\/+$/, ""), items = [], skipped = []; let read = null;
  await withPage(async (page) => {
    for (const [i, s] of screens.entries()) {
      const at = screenUrl(base, s.path, i), scr = s.screen || title(s.path);
      try { await openPage(page, at); } catch (e) { skipped.push({ path: s.path, why: String((e && e.message) || e) }); continue; }
      await sleep(800);
      if (tidy) await evaluate(page, tidy);
      if (s.path !== "/" && await signInWall(page, at)) { skipped.push({ path: s.path, why: "it asks you to sign in (capture it with a demo account signed in, or give screens that don't)" }); continue; }
      const name = `${s.name}`, still = `${name}.png`;
      const { data } = await page.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(t.orig, still), Buffer.from(data, "base64"));
      let boxes = merge(((await evaluate(page, DETECT(names, { drawings }))) || []).map((b) => pad(b, VIEW.w, VIEW.h)));
      const o = ocr(join(t.orig, still), names); read = read === null ? o.read : read && o.read;
      boxes = [...boxes, ...o.boxes.map((b) => pad(b, VIEW.w, VIEW.h)).filter((b) => !covered(b, boxes))];
      putInTray(t, { name, kind: "still", files: [still], screen: scr, caption: s.caption, for: [], blur: `${name}.blur.json`, path: s.path, captured: now },
        { source: still, kind: "still", size: [VIEW.w, VIEW.h], screen: scr, caption: s.caption, path: s.path, regions: regionsOf(boxes), ...(o.read ? {} : { review: NO_OCR }) });
      items.push(name);
      if (i >= clips) continue;
      // the clip: the page a window at a time, a moment on each. It jumps rather than glides,
      // so what's private is found where it is in each, and its box covers the whole of that
      // moment, a little either side: nothing is ever between two looks unblurred.
      const frames = [], held = [];
      // each frame timed as it arrives, by the same clock its moments are (not the browser's own)
      const off = page.on("Page.screencastFrame", (p) => { frames.push({ ts: Date.now() / 1000, jpeg: Buffer.from(p.data, "base64") }); page.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {}); });
      try {
        const steps = Math.max(2, Math.round(seconds / HOLD));
        const tall = Number(await evaluate(page, `(() => { ${SCROLLER_JS} const sc = scroller(); window.__symbiotSc = sc; return sc ? sc.scrollHeight - sc.clientHeight : 0; })()`)) || 0;
        await evaluate(page, "window.__symbiotSc ? (window.__symbiotSc.scrollTop = 0) : 0");
        await page.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: VIEW.w, maxHeight: VIEW.h, everyNthFrame: 1 });
        for (let k = 0; k < steps; k++) {
          const at = Date.now() / 1000;
          if (k) await evaluate(page, `window.__symbiotSc ? (window.__symbiotSc.scrollTop = ${Math.round((tall * k) / (steps - 1))}) : 0`);
          await evaluate(page, "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
          const first = merge(((await evaluate(page, DETECT(names, { drawings }))) || []).map((b) => pad(b, VIEW.w, VIEW.h)));
          await sleep(HOLD * 1000 - 300);
          const again = merge(((await evaluate(page, DETECT(names, { drawings }))) || []).map((b) => pad(b, VIEW.w, VIEW.h)));
          held.push({ at, until: Date.now() / 1000, boxes: merge([...first, ...again]) });
          if (!tall) { await sleep(Math.max(0, (seconds - HOLD) * 1000)); held[held.length - 1].until = Date.now() / 1000; break; }
        }
        await page.send("Page.stopScreencast").catch(() => {});
      } finally { off(); }
      if (frames.length < 2) { skipped.push({ path: s.path, clip: true, why: "nothing moved on it, so its picture is all there is" }); continue; }
      const start = frames[0].ts, end = Math.max(frames[frames.length - 1].ts, held.length ? held[held.length - 1].until : start + seconds), cname = `${name}-clip`;
      const v = encode(frames, end, join(t.orig, `${cname}.mp4`)); if (v.error) { skipped.push({ path: s.path, clip: true, why: v.error }); continue; }
      const regions = heldBoxes(held, start);
      putInTray(t, { name: cname, kind: "clip", files: [`${cname}.gif`, `${cname}.mp4`], screen: scr, caption: `${s.caption} (a clip)`, for: [], blur: `${cname}.blur.json`, path: s.path, captured: now },
        { source: `${cname}.mp4`, kind: "clip", size: [VIEW.w, VIEW.h], screen: scr, caption: `${s.caption} (a clip)`, path: s.path, trim: [0, 0], fps: CLIP_FPS, width: 1200, regions: regionsOf(regions),
          ...(o.read ? {} : { review: NO_OCR }) });
      items.push(cname);
    }
  }, { width: VIEW.w, height: VIEW.h });
  return { items, skipped, read: !!read };
}
// Sent to sign in instead of the screen: taken to a sign-in address, or a page that's a
// sign-in form (a password box, a Log in button, hardly any other fields). A settings page
// with a password field on it isn't one.
async function signInWall(page, asked) {
  const where = String((await evaluate(page, "location.href")) || asked);
  if (where.split(/[?#]/)[0] !== asked.split(/[?#]/)[0] && /\/(?:log-?in|sign-?in|auth|sso|session)\b/i.test(where)) return true;
  return !!(await evaluate(page, `(() => { const pw = document.querySelector('input[type=password]'); if (!pw) return false;
    const fields = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]), textarea, select')].length;
    const go = [...document.querySelectorAll('button, input[type=submit], a, [role=button]')].some((b) => /^(?:log ?in|sign ?in|continue|next)$/i.test(String(b.innerText || b.value || '').trim()));
    return go && fields <= 3; })()`));
}
const NO_OCR = "tesseract isn't installed here, so text inside this capture's pictures wasn't read (pictures are blurred anyway): look it over before you use it.";
// A clip's frames (each shown until the next) as an MP4 at `out`. { ok } or { error }.
function framesToVideo(frames, end, out) {
  const t = mkdtempSync(join(tmpdir(), "symbiot-clip-"));
  try {
    const name = (i) => `f${String(i).padStart(5, "0")}.jpg`, list = ["ffconcat version 1.0"];
    frames.forEach((f, i) => { writeFileSync(join(t, name(i)), f.jpeg); list.push(`file ${name(i)}`, `duration ${Math.max(0.001, (i + 1 < frames.length ? frames[i + 1].ts : end) - f.ts).toFixed(3)}`); });
    list.push(`file ${name(frames.length - 1)}`); writeFileSync(join(t, "list.ffconcat"), list.join("\n") + "\n");
    const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-i", "list.ffconcat", "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-an", out], { cwd: t, encoding: "utf8", timeout: 180000 });
    return r.error || r.status !== 0 ? { error: r.error && r.error.code === "ENOENT" ? NO_FFMPEG : `ffmpeg couldn't make the clip: ${String(r.stderr || "").trim().split("\n").pop() || "it stopped"}` } : { ok: true };
  } finally { rmSync(t, { recursive: true, force: true }); }
}
const NO_FFMPEG = "Capturing needs ffmpeg, which isn't installed (on Linux: sudo apt install ffmpeg; on a Mac: brew install ffmpeg).";

// ---- a desktop app ----------------------------------------------------------------------
// Its window recorded with ffmpeg: on Linux an X11 window (x11grab, by the id xdotool
// finds for its title: an app under XWayland counts), on Windows by its title
// (gdigrab), on a Mac the screen (avfoundation). A Wayland window no other program can
// see, so under Wayland (COSMIC, GNOME, KDE) it goes through the desktop's own screen
// sharing (portalRecord): you pick the window in its prompt once, and it's remembered.
// Then each second of it read with tesseract for what's private. It can't see faces or
// pictures in a window, so the capture says so: look it over, and draw a box over
// anything (tray.mjs addBlur) before it goes on a post.
function windowOf(title, { run = spawnSync, platform = process.platform, env = process.env, has = hasCmd } = {}) {
  if (platform !== "linux") return { title };
  const wayland = !!env.WAYLAND_DISPLAY || env.XDG_SESSION_TYPE === "wayland";
  if (env.DISPLAY && has("xdotool")) {
    const r = run("xdotool", ["search", "--onlyvisible", "--name", String(title)], { encoding: "utf8", timeout: 10000 });
    const id = String(r.stdout || "").split("\n").map((x) => x.trim()).find(Boolean);
    if (id) return { id };
  }
  if (wayland) return has("python3") ? { title, portal: true } : { error: NO_PORTAL_KIT };
  if (!env.DISPLAY) return { error: "There's no X display here (DISPLAY isn't set), so a window can't be recorded." };
  if (!has("xdotool")) return { error: "Recording a window on Linux needs xdotool (sudo apt install xdotool), to find it." };
  return { error: `No window called "${title}" that Symbiot can record here: start the app first, or give a web address instead.` };
}

// ---- a Wayland window, through the desktop's screen sharing ----------------------------
// The ScreenCast portal (xdg-desktop-portal: COSMIC, GNOME, KDE all have one) asks you to
// pick the window, then hands over a PipeWire stream of it, which GStreamer records: a
// picture, then the clip, in one go, so it's one prompt. The portal's restore token is
// kept for the window's title (capture-windows.json), so the next capture of it doesn't
// ask again. Python's GLib/GStreamer bindings do the D-Bus and PipeWire side: Node has
// neither. Prints one JSON line: { ok, token, still, clip } (each an error or null) or
// { error, detail }.
const NO_PORTAL_KIT = "Recording a window under Wayland goes through your desktop's screen sharing, which needs Python's GStreamer bindings and PipeWire's GStreamer plugin (on Ubuntu: sudo apt install python3-gi gir1.2-gst-plugins-base-1.0 gstreamer1.0-pipewire).";
const PORTAL_PY = String.raw`
import sys, os, json
def out(**k):
    print(json.dumps(k), flush=True); sys.exit(0)
try:
    import gi
    gi.require_version("Gst", "1.0")
    from gi.repository import Gio, GLib, Gst
except Exception as e:
    out(error="missing", detail=str(e))
a = json.loads(sys.argv[1])
D, O, SC = "org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop", "org.freedesktop.portal.ScreenCast"
try:
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
except Exception as e:
    out(error="nobus", detail=str(e))
loop, me, n = GLib.MainLoop(), bus.get_unique_name()[1:].replace(".", "_"), [0]
def prop(name, default):
    try:
        return bus.call_sync(D, O, "org.freedesktop.DBus.Properties", "Get", GLib.Variant("(ss)", (SC, name)), GLib.VariantType("(v)"), Gio.DBusCallFlags.NONE, 5000, None).unpack()[0]
    except Exception:
        return default
def ask(method, sig, args, opts, wait):
    n[0] += 1
    tok = "symbiot%d_%d" % (os.getpid(), n[0])
    path = "%s/request/%s/%s" % (O, me, tok)
    got, timer = {}, {}
    def on(conn, sender, p, iface, s, params):
        got["r"] = params.unpack(); loop.quit()
    def late():
        timer["done"] = True; loop.quit(); return False
    # by our own request path: a well-known sender name can miss the signal in GDBus
    sub = bus.signal_subscribe(None, "org.freedesktop.portal.Request", "Response", path, None, Gio.DBusSignalFlags.NONE, on)
    t = GLib.timeout_add_seconds(wait, late)
    try:
        opts["handle_token"] = GLib.Variant("s", tok)
        bus.call_sync(D, O, SC, method, GLib.Variant(sig, tuple(args) + (opts,)), None, Gio.DBusCallFlags.NONE, -1, None)
        loop.run()
    finally:
        bus.signal_unsubscribe(sub)
        if not timer: GLib.source_remove(t)
    return got.get("r")
try:
    version = prop("version", 0)
    if not version:
        out(error="noportal")
    types, cursors = prop("AvailableSourceTypes", 1), prop("AvailableCursorModes", 1)
    r = ask("CreateSession", "(a{sv})", [], {"session_handle_token": GLib.Variant("s", "symbiot%d" % os.getpid())}, 30)
    if not r or r[0] != 0:
        out(error="nosession")
    session = r[1]["session_handle"]
    opts = {"types": GLib.Variant("u", 2 if types & 2 else 1), "multiple": GLib.Variant("b", False)}
    if version >= 2:
        opts["cursor_mode"] = GLib.Variant("u", 2 if cursors & 2 else 1)
    if version >= 4:
        opts["persist_mode"] = GLib.Variant("u", 2)
        if a.get("token"):
            opts["restore_token"] = GLib.Variant("s", a["token"])
    r = ask("SelectSources", "(oa{sv})", [session], opts, 30)
    if not r or r[0] != 0:
        out(error="cancelled" if r and r[0] == 1 else "nosession")
    r = ask("Start", "(osa{sv})", [session, ""], {}, int(a.get("wait") or 120))
    if not r:
        out(error="timeout")
    if r[0] != 0:
        out(error="cancelled" if r[0] == 1 else "nosession")
    streams, token = r[1].get("streams") or [], r[1].get("restore_token") or ""
    if not streams:
        out(error="cancelled")
    node = streams[0][0]
    res, fds = bus.call_with_unix_fd_list_sync(D, O, SC, "OpenPipeWireRemote", GLib.Variant("(oa{sv})", (session, {})), GLib.VariantType("(h)"), Gio.DBusCallFlags.NONE, -1, None, None)
    fd = fds.get(res.unpack()[0])
    Gst.init(None)
    def play(desc, file, seconds=0, wait=20):
        p = Gst.parse_launch(desc)
        src = p.get_by_name("src")
        src.set_property("fd", os.dup(fd)); src.set_property("path", str(node))
        p.get_by_name("out").set_property("location", file)
        b, kinds = p.get_bus(), Gst.MessageType.ERROR | Gst.MessageType.EOS
        p.set_state(Gst.State.PLAYING)
        m = b.timed_pop_filtered(seconds * Gst.SECOND, kinds) if seconds else None
        if seconds and m is None:
            p.send_event(Gst.Event.new_eos())
        if m is None:
            m = b.timed_pop_filtered(wait * Gst.SECOND, kinds)
        p.set_state(Gst.State.NULL)
        if m is None:
            return "the window sent no picture"
        if m.type == Gst.MessageType.ERROR:
            return m.parse_error()[0].message
        return None
    still = play("pipewiresrc name=src do-timestamp=true keepalive-time=500 ! videoconvert ! pngenc snapshot=true ! filesink name=out", a["still"]) if a.get("still") else None
    clip = play("pipewiresrc name=src do-timestamp=true keepalive-time=100 ! videorate ! video/x-raw,framerate=%d/1 ! videoconvert ! jpegenc quality=92 ! avimux ! filesink name=out" % int(a.get("fps") or 12), a["clip"], int(a.get("seconds") or 6)) if a.get("clip") else None
    try:
        bus.call_sync(D, session, "org.freedesktop.portal.Session", "Close", None, None, Gio.DBusCallFlags.NONE, 5000, None)
    except Exception:
        pass
    out(ok=True, token=token, still=still, clip=clip)
except SystemExit:
    raise
except Exception as e:
    out(error="failed", detail=str(e))
`;
const PORTAL_SAYS = {
  missing: NO_PORTAL_KIT,
  nobus: "Couldn't reach your desktop's session (D-Bus) to ask for the window. Capture from the Symbiot app (Marketing → Capture a product), not from a sandboxed run.",
  noportal: "Your desktop has no screen sharing (xdg-desktop-portal) for Symbiot to ask, so a Wayland window can't be recorded: start the app under X11 (XWayland), or give a web address instead.",
  nosession: "Your desktop's screen sharing wouldn't start a recording.",
};
const WINDOW_PICKS = () => join(CONFIG_DIR, "capture-windows.json");
const pickKey = (title) => String(title || "").trim().toLowerCase();
function pyRun(args, { timeout }) {
  return new Promise((done) => {
    let out = "", err = "", p; try { p = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"], timeout }); } catch (e) { done({ error: String((e && e.message) || e) }); return; }
    p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    p.on("error", (e) => done({ error: e.code === "ENOENT" ? NO_PORTAL_KIT : String(e.message || e) }));
    p.on("close", (code) => done({ stdout: out, stderr: err, code }));
  });
}
// The clip GStreamer wrote (MJPEG in AVI) as the MP4 the rest expects.
function aviToMp4(avi, out) {
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", avi, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-an", out], { encoding: "utf8", timeout: 180000 });
  rmSync(avi, { force: true });
  return r.error || r.status !== 0 ? { error: r.error && r.error.code === "ENOENT" ? NO_FFMPEG : `ffmpeg couldn't make the clip: ${String(r.stderr || "").trim().split("\n").pop() || "it stopped"}` } : { ok: true };
}
// { still: { ok } | { error }, clip: { ok } | { error } | null } or { error }.
async function portalRecord(title, { still, video = "", seconds = CLIP_SECONDS, fps = CLIP_FPS, wait = 120, file = WINDOW_PICKS(), py = pyRun, encode = aviToMp4, notify = desktopNotify } = {}) {
  const picks = readJson(file) || {}, token = picks[pickKey(title)] || "";
  // the first time, the desktop's prompt comes up out of nowhere: say which window to pick
  if (!token) notify("Symbiot: pick a window to record", `Pick "${title}" in your desktop's screen-sharing prompt, for Marketing's pictures of it. Symbiot remembers it, so it won't ask again.`);
  const avi = video ? video.replace(/\.mp4$/i, "") + ".avi" : "";
  const r = await py(["-c", PORTAL_PY, JSON.stringify({ still, clip: avi, seconds, fps, token, wait })], { timeout: (wait + seconds + 90) * 1000 });
  if (r.error) return { error: r.error };
  const line = String(r.stdout || "").trim().split("\n").pop() || "";
  let o = null; try { o = JSON.parse(line); } catch { /* not ours: its last words below */ }
  if (!o) return { error: `Your desktop's screen sharing stopped: ${String(r.stderr || "").trim().split("\n").pop() || `python3 exited ${r.code}`}`.slice(0, 300) };
  if (o.error === "cancelled") return { error: `The window wasn't picked in your desktop's screen-sharing prompt: capture again, and pick "${title}" there.` };
  if (o.error === "timeout") return { error: `Nobody picked a window in your desktop's screen-sharing prompt within ${Math.round(wait / 60)} minutes: capture again, and pick "${title}" there.` };
  if (o.error) return { error: PORTAL_SAYS[o.error] ? `${PORTAL_SAYS[o.error]}${o.error === "missing" ? "" : o.detail ? ` (${String(o.detail).slice(0, 160)})` : ""}` : `Your desktop's screen sharing stopped: ${String(o.detail || o.error).slice(0, 200)}` };
  if (o.token) { picks[pickKey(title)] = o.token; try { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, JSON.stringify(picks, null, 2)); } catch { /* asked again next time */ } }
  const clip = !video ? null : o.clip ? { error: o.clip } : existsSync(avi) ? encode(avi, video) : { error: "the window sent no picture" };
  return { still: o.still ? { error: o.still } : { ok: true }, clip };
}
// ffmpeg's arguments for it: a picture (still) or `seconds` of video, to `out`.
function recordArgs(win, { seconds = CLIP_SECONDS, still = false, out, platform = process.platform, env = process.env, fps = CLIP_FPS } = {}) {
  const take = still ? ["-frames:v", "1"] : ["-t", String(seconds), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"];
  if (platform === "linux") return ["-loglevel", "error", "-y", "-f", "x11grab", "-window_id", String(win.id), "-framerate", String(fps), "-draw_mouse", "1", "-i", env.DISPLAY || ":0", ...take, out];
  if (platform === "win32") return ["-loglevel", "error", "-y", "-f", "gdigrab", "-framerate", String(fps), "-i", `title=${win.title}`, ...take, out];
  if (platform === "darwin") return ["-loglevel", "error", "-y", "-f", "avfoundation", "-framerate", String(fps), "-capture_cursor", "1", "-i", "1:none", ...take, out];
  return null;
}
function ffmpegRun(args, { timeout = 180000 } = {}) {
  return new Promise((done) => {
    let err = "", p; try { p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"], timeout }); } catch (e) { done({ error: String((e && e.message) || e) }); return; }
    p.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    p.on("error", (e) => done({ error: e.code === "ENOENT" ? NO_FFMPEG : String(e.message || e) }));
    p.on("close", (code) => done(code === 0 ? { ok: true } : { error: (err.trim().split("\n").pop() || `ffmpeg stopped (${code})`).slice(0, 300) }));
  });
}
const sizeOf = (f) => { const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", f], { encoding: "utf8", timeout: 20000 }); const m = String(r.stdout || "").match(/(\d+)x(\d+)/); return m ? [+m[1], +m[2]] : null; };
const DESKTOP_REVIEW = "A desktop recording: Symbiot read the words in it, but it can't see faces or pictures in a window. Look it over, and draw a box over anything private, before you use it.";
async function captureDesktop({ product, window: title, t, names = [], seconds = CLIP_SECONDS, clip = true, record = ffmpegRun, portal = portalRecord, find = windowOf, ocr = ocrBoxes, size = sizeOf, platform = process.platform, now = Date.now() }) {
  const win = find(title, { platform }); if (win.error) return { error: win.error };
  const name = `${slug(title) || "window"}`, items = [], cname = `${name}-clip`, video = join(t.orig, `${cname}.mp4`);
  // under Wayland the picture and the clip come from one pick in the desktop's prompt
  const shot = win.portal ? await portal(title, { still: join(t.orig, `${name}.png`), video: clip ? video : "", seconds }) : null;
  if (shot && shot.error) return { error: `Couldn't record the window: ${shot.error}` };
  const still = `${name}.png`, r1 = shot ? shot.still : await record(recordArgs(win, { still: true, out: join(t.orig, still), platform }));
  if (r1.error) return { error: `Couldn't record the window: ${r1.error}` };
  const [w, h] = size(join(t.orig, still)) || [0, 0];
  const o = ocr(join(t.orig, still), names);
  putInTray(t, { name, kind: "still", files: [still], screen: title, caption: `${product}: ${title}`, for: [], blur: `${name}.blur.json`, desktop: true, captured: now },
    { source: still, kind: "still", size: [w, h], screen: title, caption: `${product}: ${title}`, desktop: true, regions: regionsOf(o.boxes.map((b) => pad(b, w, h))), review: o.read ? DESKTOP_REVIEW : `${NO_OCR} ${DESKTOP_REVIEW}` });
  items.push(name);
  if (clip) {
    const r2 = shot ? shot.clip : await record(recordArgs(win, { seconds, out: video, platform }));
    if (r2.error) return { items, error: `The picture's in, but the clip didn't record: ${r2.error}` };
    // a moment a second, read for what's private, as boxes over the time it shows
    const tmp = mkdtempSync(join(tmpdir(), "symbiot-frames-")), samples = [];
    try {
      const x = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", video, "-vf", "fps=1", join(tmp, "s%03d.png")], { encoding: "utf8", timeout: 120000 });
      if (x.status === 0) for (const f of readdirSync(tmp).filter((f) => /^s\d+\.png$/.test(f)).sort()) samples.push({ t: Number(f.slice(1, 4)) - 1, r: ocr(join(tmp, f), names).boxes.map((b) => pad(b, w, h)) });
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    putInTray(t, { name: cname, kind: "clip", files: [`${cname}.gif`, `${cname}.mp4`], screen: title, caption: `${product}: ${title} (a clip)`, for: [], blur: `${cname}.blur.json`, desktop: true, captured: now },
      { source: `${cname}.mp4`, kind: "clip", size: [w, h], screen: title, caption: `${product}: ${title} (a clip)`, desktop: true, trim: [0, 0], fps: CLIP_FPS, width: Math.min(1200, w || 1200), regions: regionsOf(tracks(samples, 1.5)), review: DESKTOP_REVIEW });
    items.push(cname);
  }
  return { items };
}

// ---- a product's own video ----------------------------------------------------------
// A video it already has (`--file <its address or path>`: an invite video, a demo), taken
// as it is, sound and all, not recorded off a screen playing it. Its moments sampled (one
// a second, at most MAX_SAMPLES), each read with tesseract for names and numbers and
// looked at for faces (OpenCV, where it's installed), as boxes over the time they show,
// all switched on. The original goes in tray-originals as it came; the tray's copy is that
// file again until a box is on, then the picture's blurred and its sound copied across
// (tray.mjs). Marked to look over: a sample a second can miss what's on for less.
const VIDEO_FILE = /\.(mp4|mov|webm)$/i, FILE_MAX = 500 * 1024 * 1024, MAX_SAMPLES = 90;
const FILE_REVIEW = "The product's own video: Symbiot read the words in a moment of it each second and looked for faces, but what shows for less than a second can be missed. Watch it through, and draw a box over anything private, before you use it.";
const NO_FACES = "OpenCV's face finder isn't here (on Ubuntu: sudo apt install python3-opencv opencv-data), so faces in it weren't looked for.";
// It fetched to `out`, at most `max` bytes: { ok } or { error }.
async function download(url, out, { max = FILE_MAX, timeout = 300000 } = {}) {
  let res; try { res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeout) }); } catch (e) { return { error: `Couldn't fetch ${url}: ${(e && e.cause && e.cause.code) || (e && e.message) || e}` }; }
  if (!res.ok) return { error: `${url} answered ${res.status}, not the video.` };
  if (/^text\/html/i.test(res.headers.get("content-type") || "")) return { error: `${url} is a page, not a video file: give the video's own address (it ends .mp4, .mov or .webm).` };
  if (Number(res.headers.get("content-length")) > max) return { error: `That video is too big: Symbiot keeps videos up to ${Math.round(max / 1048576)} MB.` };
  const tmp = `${out}.part`; let n = 0;
  try {
    await pipeline(Readable.fromWeb(res.body), new Transform({ transform(c, _, cb) { n += c.length; cb(n > max ? new Error(`That video is too big: Symbiot keeps videos up to ${Math.round(max / 1048576)} MB.`) : null, c); } }), createWriteStream(tmp));
    renameSync(tmp, out); return { ok: true };
  } catch (e) { rmSync(tmp, { force: true }); return { error: String((e && e.message) || e) }; }
}
// What ffprobe says of it: { w, h, seconds, audio } or null when it's no video.
function probeVideo(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file], { encoding: "utf8", timeout: 30000 });
  let o = null; try { o = JSON.parse(r.stdout); } catch { return null; }
  const ss = (o && Array.isArray(o.streams) ? o.streams : []), v = ss.find((s) => s.codec_type === "video" && s.width > 0);
  return v ? { w: +v.width, h: +v.height, seconds: Number(o.format && o.format.duration) || 0, audio: ss.some((s) => s.codec_type === "audio") } : null;
}
// Faces in pictures, by OpenCV's frontal and profile face finders: { boxes: { file: [box] }, read }.
const FACES_PY = String.raw`
import sys, os, json
try:
    import cv2
except Exception:
    print(json.dumps({"error": "missing"})); sys.exit(0)
a = json.loads(sys.argv[1])
dirs = [getattr(getattr(cv2, "data", None), "haarcascades", "")] + a.get("dirs", [])
finders = []
for name in ("haarcascade_frontalface_default.xml", "haarcascade_profileface.xml"):
    for d in dirs:
        f = os.path.join(d, name) if d else ""
        if f and os.path.exists(f):
            c = cv2.CascadeClassifier(f)
            if not c.empty():
                finders.append(c); break
if not finders:
    print(json.dumps({"error": "nocascade"})); sys.exit(0)
out = {}
for f in a["files"]:
    img = cv2.imread(f, cv2.IMREAD_GRAYSCALE)
    if img is None:
        continue
    img = cv2.equalizeHist(img)
    found = []
    for c in finders:
        for (x, y, w, h) in c.detectMultiScale(img, scaleFactor=1.1, minNeighbors=6, minSize=(28, 28)):
            found.append([int(x), int(y), int(w), int(h)])
    out[f] = found
print(json.dumps({"ok": True, "faces": out}))
`;
const FACE_DIRS = () => ["/usr/share/opencv4/haarcascades", "/usr/share/opencv/haarcascades", "/usr/local/share/opencv4/haarcascades", join(CONFIG_DIR, "haarcascades")];
function faceBoxes(files, { dirs = FACE_DIRS(), run = spawnSync } = {}) {
  if (!files.length || !hasCmd("python3")) return { boxes: {}, read: false };
  const r = run("python3", ["-c", FACES_PY, JSON.stringify({ files, dirs })], { encoding: "utf8", timeout: 60000 + files.length * 5000, maxBuffer: 16 * 1024 * 1024 });
  let o = null; try { o = JSON.parse(String(r.stdout || "").trim().split("\n").pop()); } catch {}
  if (!o || !o.ok) return { boxes: {}, read: false };
  // a face with room round it: hair, ears, the chin
  const boxes = {};
  for (const [f, fs] of Object.entries(o.faces || {})) boxes[f] = fs.map(([x, y, w, h]) => ({ kind: "face", x: x - w * 0.2, y: y - h * 0.25, w: w * 1.4, h: h * 1.5, hint: "a face" }));
  return { boxes, read: true };
}
// Its name in the tray, from the file's own: trial.mp4 stays trial.mp4.
function videoName(file) {
  let p = String(file || "").trim(); if (/^https?:\/\//i.test(p)) { try { p = decodeURIComponent(new URL(p).pathname); } catch { return null; } }
  const m = basename(p).match(VIDEO_FILE); if (!m) return null;
  const name = slug(basename(p).slice(0, -m[0].length)) || "video";
  return { name, file: `${name}.${m[1].toLowerCase()}` };
}
async function captureFile({ product, file, t, names = [], fetchFile = download, probe = probeVideo, ocr = ocrBoxes, faces = faceBoxes, now = Date.now() }) {
  const src = String(file || "").trim(), url = /^https?:\/\//i.test(src), v = videoName(src);
  if (!v) return { error: `${src || "That"} isn't a video file Symbiot can take: give its address or path, ending .mp4, .mov or .webm.` };
  const orig = join(t.orig, v.file), path = url ? "" : resolve(src.replace(/^~(?=\/|$)/, homedir()));
  if (!url && !existsSync(path)) return { error: `There's no file at ${src}.` };
  mkdirSync(t.orig, { recursive: true });
  const got = url ? await fetchFile(src, orig) : (() => { try { if (statSync(path).size > FILE_MAX) return { error: `That video is too big: Symbiot keeps videos up to ${Math.round(FILE_MAX / 1048576)} MB.` }; copyFileSync(path, orig); return { ok: true }; } catch (e) { return { error: `Couldn't read ${src}: ${(e && e.message) || e}` }; } })();
  if (got.error) return { error: got.error };
  const info = probe(orig);
  if (!info) { rmSync(orig, { force: true }); return { error: `${src} isn't a video Symbiot can read (ffprobe found no picture in it).` }; }
  // its moments, a second apart (further for a long one), each read and looked at for faces
  const rate = info.seconds > MAX_SAMPLES ? MAX_SAMPLES / info.seconds : 1, tmp = mkdtempSync(join(tmpdir(), "symbiot-frames-")), samples = [];
  let w = info.w, h = info.h, read = true, faced = false;
  try {
    const x = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", orig, "-vf", `fps=${rate.toFixed(4)}`, "-frames:v", String(MAX_SAMPLES + 1), join(tmp, "s%04d.png")], { encoding: "utf8", timeout: 300000 });
    const frames = x.status === 0 ? readdirSync(tmp).filter((f) => /^s\d+\.png$/.test(f)).sort().map((f) => join(tmp, f)) : [];
    if (!frames.length) return { error: `Couldn't read the moments of ${v.file}: ${String(x.stderr || "").trim().split("\n").pop() || "ffmpeg stopped"}` };
    // the size it plays at (a phone's video turned upright), as its moments come out
    const s = sizeOf(frames[0]); if (s) [w, h] = s;
    const fc = faces(frames); faced = fc.read;
    for (const [i, f] of frames.entries()) {
      const o = ocr(f, names); read = read && o.read;
      samples.push({ t: +(i / rate).toFixed(2), r: [...o.boxes, ...(fc.boxes[f] || [])].map((b) => pad(b, w, h)) });
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  // each box from the sample before it's seen to the one after it goes: nothing between two looks shows unblurred
  const gap = 1 / rate, regions = tracks(samples, gap * 1.5).map((b) => ({ ...b, from: Math.max(0, +(b.from - gap + 0.4).toFixed(2)), to: b.to === 9999 ? 9999 : +(b.to + gap - 0.4).toFixed(2) }));
  const caption = `${product}: its video ${v.file}`, review = [FILE_REVIEW, read ? "" : NO_OCR, faced ? "" : NO_FACES].filter(Boolean).join(" ");
  putInTray(t, { name: v.name, kind: "clip", files: [v.file], screen: "its own video", caption, for: [], blur: `${v.name}.blur.json`, file: true, ...(url ? { origin: src } : {}), captured: now },
    { source: v.file, kind: "clip", file: true, audio: info.audio, size: [w, h], seconds: +info.seconds.toFixed(2), screen: "its own video", caption, trim: [0, 0], regions: regionsOf(regions), review });
  return { items: [v.name] };
}

// ---- one product, end to end --------------------------------------------------------
// Its repo (by folder, or by its name as people say it), where it runs (the address
// given, else an app of it listening here: post.mjs localApps), its screens, then each
// captured and blurred, and the tray's captures rendered (tray.mjs). { ok, product, tray,
// items, skipped, seed?, note } or { error }.
function productRepo(product, map = {}) {
  const p = String(product || "").trim(); if (!p) return null;
  if (p.startsWith("/") && existsSync(p)) return { path: p, name: displayName(p, basename(p)) };
  const k = Object.keys(map).find((n) => n !== MARKETING && map[n] && [n, basename(map[n]), displayName(map[n], n)].some((x) => String(x).toLowerCase() === p.toLowerCase()));
  return k ? { path: map[k], name: displayName(map[k], k) } : null;
}
// The products there are to capture (your projects), each with whether it has a tray yet:
// [{ name, tray }], the ones without one first.
function captureProducts({ map, dir = MARKETING_DIR } = {}) {
  if (!map) { try { map = laneMapNow(); } catch { map = {}; } }
  const seen = new Set(), out = [];
  for (const [k, p] of Object.entries(map)) {
    if (k === MARKETING || !p) continue;
    const name = displayName(p, k); if (!name || seen.has(name.toLowerCase())) continue; seen.add(name.toLowerCase());
    out.push({ name, tray: existsSync(join(trayPaths(name, dir).root, "tray.json")) });
  }
  return out.sort((a, b) => (a.tray ? 1 : 0) - (b.tray ? 1 : 0) || a.name.localeCompare(b.name));
}
let BUSY = null;
// Symbiot's own repo (this package, or a clone of it), by its package.json's name.
const isSymbiotRepo = (path) => { try { return JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name === "symbiot"; } catch { return false; } };
async function captureProduct({ product, url = "", window: win = "", file = "", screens: extra = [], clips = true, seconds = CLIP_SECONDS, map, dir = MARKETING_DIR, apps, render = renderCapture, web = captureWeb, desktop = captureDesktop, video = captureFile, demoApp = startDemo, ffmpeg = () => hasCmd("ffmpeg"), now = Date.now() } = {}) {
  if (BUSY) return { error: `Already capturing ${BUSY}: one product at a time.` };
  if (!map) { try { map = laneMapNow(); } catch { map = {}; } }
  const repo = productRepo(product, map), name = (repo && repo.name) || String(product || "").trim();
  if (!name) return { error: "Say which product to capture: its name, or its folder." };
  let symbiot = false, demo = null;
  if (!win && !url && !file) {
    if (!repo) return { error: `${name} isn't one of your projects here: give its address with --url, its window with --window, or a video of it with --file.` };
    // Symbiot itself shows your real work: it's captured from a copy with made-up work in it instead
    symbiot = isSymbiotRepo(repo.path);
    const found = symbiot ? null : (await (apps || (await import("./post.mjs")).localApps)([{ name: name, path: repo.path }])).find((a) => a && a.url);
    if (found && found.symbiot) symbiot = true;
    url = found && !symbiot ? found.url : "";
    if (!url && !symbiot) return { error: `${name} isn't running here, so there's nothing to capture yet. Start it (${seedScript(repo.path) ? `with its demo data: ${seedScript(repo.path)}, then ` : ""}its dev server), then capture again, or give its address with --url.` };
  }
  if (!ffmpeg()) return { error: NO_FFMPEG };
  BUSY = name;
  try {
    if (symbiot) { demo = await demoApp(); if (demo.error) return { error: demo.error }; url = demo.url; }
    const t = trayPaths(name, dir); mkdirSync(t.root, { recursive: true }); mkdirSync(t.orig, { recursive: true });
    const names = [...namesToBlur(repo && repo.path, { dir, product: name }), ...(symbiot ? DEMO_NAMES : [])];
    let r;
    if (file) r = await video({ product: name, file, t, names, now });
    else if (win) r = await desktop({ product: name, window: win, t, names, seconds, clip: clips, now });
    else {
      const screens = symbiot ? SYMBIOT_SCREENS : repo ? screensOf(repo.path, { product: name, extra }) : [{ path: "/", name: "home", caption: `${name}: its first screen`, from: "home" }, ...extra.map((p) => ({ path: routeOf(p), name: slug(words(routeOf(p))) || "home", caption: captionFor(routeOf(p), "", name), from: "given" })).filter((s) => s.path && s.path !== "/")];
      // Symbiot's made-up copy: its charts and map are drawings of made-up work, the point of those screens
      r = await web({ product: name, url, screens, t, names, ...(symbiot ? { drawings: false, tidy: SYMBIOT_TIDY } : {}), clips: clips ? MAX_CLIPS : 0, seconds, now });
    }
    if (r.error && !(r.items || []).length) return { error: r.error };
    const failed = [];
    for (const it of r.items || []) { const d = await render(t.rel, it, { dir }); if (!d.ok) failed.push(`${it}: ${d.error}`); }
    // a reel of the clips, one after another, when there's more than one
    const cl = (r.items || []).filter((x) => x.endsWith("-clip"));
    if (cl.length > 1) { writeFileSync(join(t.root, "tour.reel.json"), JSON.stringify({ parts: cl }, null, 2)); const idx = readJson(join(t.root, "tray.json")); idx.items = [...idx.items.filter((x) => x.name !== "tour"), { name: "tour", kind: "reel", files: ["tour.mp4"], screen: "several", caption: `${name}: a tour, its clips one after another`, for: [], parts: cl, captured: now }]; writeFileSync(join(t.root, "tray.json"), JSON.stringify(idx, null, 2)); if (cl.length) await render(t.rel, cl[cl.length - 1], { dir }); }
    const seed = repo && !win && !file && !symbiot ? seedScript(repo.path) : "";
    const n = (r.items || []).length, blurred = (r.items || []).reduce((k, it) => k + ((readJson(join(t.root, `${it}.blur.json`)) || {}).regions || []).length, 0);
    return { ok: true, product: name, tray: t.rel, items: r.items || [], skipped: r.skipped || [], ...(failed.length ? { failed } : {}), ...(seed ? { seed } : {}), ...(r.error ? { warning: r.error } : {}),
      note: `${n} capture${n === 1 ? "" : "s"} of ${name}${symbiot ? ", from a copy with made-up work in it (Acme), not yours," : ""} in its pick tray (Marketing), with ${blurred} blur box${blurred === 1 ? "" : "es"} over what could be private${file ? ", its sound kept" : ""}. Look ${n === 1 ? "it" : "them"} over there: switch a box off, or draw one of your own.` };
  } finally { BUSY = null; if (demo && demo.stop) await demo.stop(); }
}

export { SYMBIOT_SCREENS, screenUrl, isSymbiotRepo, screensOf, codeRoutes, fileRoute, routeOf, readmePaths, captionFor, seedScript, TEXT_KINDS, textHits, DETECT, tsvBoxes, ocrBoxes, namesToBlur, trayPaths, putInTray, tracks, heldBoxes, captureWeb, captureDesktop, captureFile, videoName, faceBoxes, FACES_PY, windowOf, recordArgs, portalRecord, PORTAL_PY, productRepo, captureProduct, captureProducts, framesToVideo, NO_OCR, DESKTOP_REVIEW };
