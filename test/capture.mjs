// Marketing's media capture (capture.mjs): a product's key screens found from its routes
// and README; what's private found in text (and in what tesseract reads off a picture);
// a web app captured for real in a browser of its own, every private thing blurred
// before it reaches the tray, a sign-in page skipped, a clip that jumps so nothing is
// ever between two looks unblurred; a desktop window's recording (its ffmpeg arguments,
// a Wayland window through the desktop's screen sharing, picked once and remembered,
// and a capture with a stand-in recorder) marked to look over; a box you draw, one you
// remove, a capture looked over, and none put on a post before then (marketing.mjs
// setDraftMedia); the lane's unblurred originals never served; and the lane's brief
// starting a product with no tray by capturing it. Real Chrome and ffmpeg when here.
// Isolated HOME (set before the modules load).
//
//   node test/capture.mjs
//
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-capture-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const put = (root, rel, text = "export default () => null\n") => { mkdirSync(join(root, rel, ".."), { recursive: true }); writeFileSync(join(root, rel), text); };

const C = await import("../capture.mjs");
const M = await import("../marketing.mjs");
const T = await import("../tray.mjs");
const { chromeBinary, hasCmd } = await import("../core.mjs");

console.log("ITS KEY SCREENS — from its routes and README");
{
  const r = join(HOME, "acme");
  put(r, "README.md", "# Acme\n\nAcme keeps your invoices in one place.\n\n- The `/dashboard` shows what's due this week\n- POST `/webhook` takes Stripe's events\n- Runs on http://localhost:3000/reports by default\n");
  for (const f of ["pages/index.tsx", "pages/dashboard.tsx", "pages/settings/team.tsx", "pages/users/[id].tsx", "pages/api/hello.ts", "pages/_app.tsx", "pages/login.tsx", "pages/reports.tsx"]) put(r, f);
  const s = C.screensOf(r, { product: "Acme" }), paths = s.map((x) => x.path);
  ok("its home first, then the README's screens, then the shallowest", paths[0] === "/" && paths[1] === "/dashboard" && paths[2] === "/reports" && paths.includes("/settings/team"), paths);
  ok("not a route with a parameter, an API, a sign-in page or Next's own files", !paths.some((p) => /\[|api|login|_app/.test(p)), paths);
  ok("a caption from the README's line about it, else its name", /what's due this week/.test(s[1].caption) && /^Acme: the Team screen$/.test(s.find((x) => x.path === "/settings/team").caption), s.map((x) => x.caption));
  ok("the home screen's caption is what the README says it is", /keeps your invoices/.test(s[0].caption), s[0].caption);
  // a monorepo: its front end a folder down, Next's app router, its route groups left out
  const m = join(HOME, "mono");
  for (const f of ["apps/web/src/app/page.tsx", "apps/web/src/app/(app)/inbox/page.tsx", "apps/web/src/app/week/page.tsx", "apps/web/src/app/agents/[id]/page.tsx", "apps/api/src/server.ts"]) put(m, f);
  put(m, "apps/api/src/server.ts", "router.get('/v1/rooms', (req, res) => res.json([]))\n");
  ok("a monorepo's front end a folder down, route groups left out, and an API's GET routes aren't screens", JSON.stringify(C.screensOf(m).map((x) => x.path)) === JSON.stringify(["/", "/inbox", "/week"]), C.screensOf(m).map((x) => x.path));
  // route tables
  const x = join(HOME, "tables");
  put(x, "server.js", "app.get('/pricing', (req, res) => res.render('pricing'))\napp.get('/about', (q, s) => s.render('about'))\napp.post('/signup', h)\n");
  put(x, "src/App.jsx", "<Route path=\"/board\" element={<Board/>} /><Route path=\"/board/:id\" element={<Card/>} />\n");
  put(x, "app.py", "@app.route('/faq')\ndef faq(): return render_template('faq.html')\n");
  const xs = C.screensOf(x).map((p) => p.path);
  ok("Express pages it renders, React Router's routes, Flask's templates", ["/pricing", "/about", "/board", "/faq"].every((p) => xs.includes(p)) && !xs.includes("/signup") && !xs.some((p) => p.includes(":")), xs);
  // an API service: its README's endpoints aren't screens
  const a = join(HOME, "api");
  put(a, "README.md", "# WA\n\nA WhatsApp service.\n\n- `POST /send` sends one\n- `/schedule` queues it\n");
  put(a, "main.py", "@app.post('/send')\ndef send(): pass\n");
  ok("an API service with no front end: only its home, not its endpoints", JSON.stringify(C.screensOf(a).map((p) => p.path)) === '["/"]', C.screensOf(a).map((p) => p.path));
  ok("at most 8", C.screensOf(r, { max: 2 }).length === 2, "");
  put(r, "package.json", JSON.stringify({ scripts: { dev: "next dev", "db:seed": "node seed.js" } }));
  ok("its demo-data script, when it has one", C.seedScript(r) === "npm run db:seed", C.seedScript(r));
}

console.log("WHAT'S PRIVATE, IN TEXT");
{
  const kinds = (t, n) => C.textHits(t, n).map((h) => h.kind);
  ok("emails, phone numbers, and a date isn't a phone number", kinds("mail jono@example.com or call +27 61 548 4462") .join() === "email,phone" && !kinds("on 2026-10-12").includes("phone"), [kinds("mail jono@example.com or call +27 61 548 4462"), kinds("on 2026-10-12")]);
  ok("a card number only when its digits pass the Luhn check", kinds("card 4111 1111 1111 1111").includes("card") && !kinds("ref 4111 1111 1111 1112").includes("card"), [kinds("card 4111 1111 1111 1111"), kinds("ref 4111 1111 1111 1112")]);
  ok("keys, tokens and secrets", ["sk_live_abcdefghijklmnop1234", "ghp_" + "a".repeat(30), "AKIAABCDEFGHIJKLMNOP", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijkl", "api_key: hunter2hunter2"].every((t) => kinds(t).some((k) => k === "secret" || k === "key")), "");
  ok("an IBAN, an account id, a home folder's path, a token in an address, an IP address, a street address", kinds("GB82 WEST 1234 5698 7654 32").includes("iban") && kinds("cus_ABCDEF123").includes("account") && kinds("at /home/garth/acme/.env").includes("path") && kinds("open /x?token=abcdefgh1234").includes("url token") && kinds("host 10.0.0.12").includes("ip address") && kinds("we're at 12 Main Street").includes("address"), "");
  ok("people's names, from the list, whole or in part", kinds("ask Sam Rivera", ["Sam Rivera", "Rivera"]).includes("name") && !kinds("ask Sam", ["Sam Rivera"]).includes("name"), "");
  // tesseract's TSV: a row a word; a match's words as one box, back at the picture's own scale
  const tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n" +
    "5\t1\t1\t1\t1\t1\t20\t40\t100\t20\t95\tcontact:\n5\t1\t1\t1\t1\t2\t130\t40\t300\t20\t91\talex@corp.example\n5\t1\t1\t1\t2\t1\t20\t80\t60\t20\t20\tjunk@low.conf\n";
  const b = C.tsvBoxes(tsv, [], 2);
  ok("text read off a picture: the match's own words, at the picture's scale, not a word read too poorly to trust", b.length === 1 && b[0].kind === "email" && b[0].x === 65 && b[0].y === 20 && b[0].w === 150, b);
  const n = C.namesToBlur("", { dir: join(HOME, "lane"), product: "Acme", mind: { nodes: [{ kind: "person", name: "Jono Smith" }, { kind: "account", name: "AWS" }, { kind: "person", name: "Al" }] } });
  ok("names to blur: the people Symbiot remembers, whole and by part (four letters up), not an account", n.includes("Jono Smith") && n.includes("Smith") && n.includes("Jono") && !n.includes("AWS") && !n.includes("Al"), n);
}

console.log("A CLIP'S BOXES — over each moment, and a little either side");
{
  const held = [{ at: 100, until: 101.5, boxes: [{ kind: "email", x: 1, y: 1, w: 5, h: 5 }] }, { at: 101.5, until: 103, boxes: [{ kind: "phone", x: 1, y: 50, w: 5, h: 5 }] }];
  const hb = C.heldBoxes(held, 100);
  ok("a web clip's boxes: each moment's, from a little before it to a little after the next jump; the last to the end", hb.length === 2 && hb[0].from === 0 && hb[0].to === 1.85 && hb[1].from === 1.15 && hb[1].to === 9999, hb);
  const tr = C.tracks([{ t: 0, r: [{ kind: "email", x: 1, y: 1, w: 5, h: 5 }] }, { t: 1, r: [{ kind: "email", x: 2, y: 1, w: 5, h: 5 }] }, { t: 2, r: [] }], 1.5);
  ok("a desktop clip's box: one track while it's seen, from a little before to a little after", tr.length === 1 && tr[0].from === 0 && tr[0].to === 1.4, tr);
}

const chrome = chromeBinary(), media = hasCmd("ffmpeg");
const lane = join(HOME, "lane"); mkdirSync(join(lane, "drafts"), { recursive: true });
if (!chrome || !media || process.platform === "win32") console.log("  (no Chrome or ffmpeg here: the real capture needs both)");
else {
  console.log("A WEB APP, CAPTURED — in a browser of its own, blurred before it reaches the tray");
  const repo = join(HOME, "shop");
  put(repo, "README.md", "# Shop\n\nShop sells your things.\n\n- `/dashboard` shows today's orders\n");
  for (const f of ["pages/index.tsx", "pages/dashboard.tsx", "pages/settings.tsx", "pages/billing.tsx", "pages/customers.tsx"]) put(repo, f);
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const page = (body) => `<!doctype html><title>Shop</title><body style="margin:0;font:16px sans-serif"><header style="padding:10px">Shop <img src="/a.png" style="width:40px;height:40px;border-radius:50%"> Sam Rivera</header>${body}<div style="height:1400px"></div><p>Footer: 99 High Street</p></body>`;
  const srv = createServer((q, res) => {
    if (q.url === "/a.png") { res.writeHead(200, { "content-type": "image/png" }); res.end(Buffer.from(PNG, "base64")); return; }
    res.writeHead(200, { "content-type": "text/html" });
    if (q.url === "/dashboard") res.end(page(`<p>Order for jono@example.com, card 4111 1111 1111 1111, key sk_live_abcdefghijklmnop1234</p><div role="alert">New message from Garth</div><img src="/a.png" alt="photo of the team" style="width:200px;height:120px">`));
    else if (q.url === "/customers") res.end(page(`<table><tr><th>Customer</th><th>Status</th></tr><tr><td>Thandi Mokoena</td><td>Paid</td></tr><tr><td>Pieter van Wyk</td><td>Pending</td></tr></table>`));
    else if (q.url === "/settings") res.end(page(`<label>Email <input value="me@shop.example"></label><label>Password <input type="password" value="hunter22"></label><button>Save</button>`));
    else if (q.url === "/billing") res.end(`<!doctype html><title>Sign in</title><input name=u><input type=password><button>Log in</button>`);
    else res.end(page(`<canvas aria-hidden="true" style="position:fixed;inset:0;width:100vw;height:100vh;z-index:-1"></canvas><h1 aria-live="polite">Shop</h1><p>Welcome.</p>`));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const t0 = Date.now();
  const r = await C.captureProduct({ product: repo, url, dir: lane, map: {}, seconds: 3 });
  srv.close();
  const tray = join(lane, "drafts", "shop", "tray"), spec = (n) => JSON.parse(readFileSync(join(tray, `${n}.blur.json`), "utf8")), kinds = (n) => new Set(spec(n).regions.map((x) => x.kind));
  ok(`captured: a picture of each screen, a clip of the first few, in the product's tray (${((Date.now() - t0) / 1000).toFixed(0)}s)`, r.ok && r.tray === "drafts/shop/tray" && ["home", "dashboard", "settings", "home-clip", "dashboard-clip"].every((n) => r.items.includes(n)), r);
  ok("a screen that sends you to sign in is skipped, said so; a settings page with a password field isn't", r.skipped.some((x) => x.path === "/billing" && /sign in/.test(x.why)) && r.items.includes("settings"), r.skipped);
  ok("its home's backdrop (a drawing behind it all, hidden from screen readers) and its live title aren't boxed", !spec("home").regions.some((x) => x.kind === "picture" || x.kind === "notification"), spec("home").regions);
  ok("its home: the avatar, and the name beside it (whoever they are), not the product's own name", kinds("home").has("avatar") && spec("home").regions.filter((x) => x.kind === "name").length === 1, spec("home").regions);
  ok("the dashboard: the email, the card, the key, the notification and the photo", ["email", "card", "secret", "notification", "picture"].every((k) => kinds("dashboard").has(k)), [...kinds("dashboard")]);
  ok("customers: each customer's name in its table, not its headings or a one-word status", spec("customers").regions.filter((x) => x.kind === "name").length === 3, spec("customers").regions);
  ok("settings: what's typed into its fields, the password too", spec("settings").regions.filter((x) => x.kind === "typed in").length === 2, spec("settings").regions);
  ok("every box found is on: blurred, until you switch one off", ["home", "dashboard", "settings"].every((n) => spec(n).regions.every((x) => x.on === true)), "");
  ok("the unblurred originals in the lane's .symbiot/tray-originals, the blurred ones in the tray", existsSync(join(lane, ".symbiot", "tray-originals", "shop", "dashboard.png")) && existsSync(join(tray, "dashboard.png")) && !readFileSync(join(tray, "dashboard.png")).equals(readFileSync(join(lane, ".symbiot", "tray-originals", "shop", "dashboard.png"))), "");
  const cs = spec("dashboard-clip"), first = cs.regions.filter((x) => x.from === 0), later = cs.regions.filter((x) => x.from > 0);
  ok("a clip's boxes cover each moment it shows them, from its start, and the next moment's from a little before it jumps", first.length && first.some((x) => x.kind === "email") && first.every((x) => x.to > 1) && later.length && later.every((x) => x.from < x.to) && later.some((x) => x.to === 9999), cs.regions);
  ok("…the footer's street address, found once it's scrolled to", later.some((x) => x.kind === "address"), later.map((x) => x.kind));
  ok("the clips joined into a tour", existsSync(join(tray, "tour.mp4")) && JSON.parse(readFileSync(join(tray, "tray.json"), "utf8")).items.some((x) => x.name === "tour" && x.kind === "reel"), "");
  ok("the tray as the Marketing page shows it", T.trays({ dir: lane }).some((t) => t.rel === "drafts/shop/tray" && t.items.length >= 5), "");
  ok("one product at a time", (await Promise.all([C.captureProduct({ product: repo, url: "http://127.0.0.1:1", dir: lane, map: {}, clips: false, web: () => new Promise((res) => setTimeout(() => res({ items: [] }), 200)) }), C.captureProduct({ product: repo, url: "http://127.0.0.1:1", dir: lane, map: {} })]))[1].error.startsWith("Already capturing"), "");
}

console.log("WHERE IT RUNS — given, or found running here; never your own Symbiot");
{
  const repo = join(HOME, "acme");
  const none = await C.captureProduct({ product: repo, dir: lane, map: {}, apps: async () => [] });
  ok("not running and no address: says to start it (with its demo data) or give its address", /isn't running here/.test(none.error) && /npm run db:seed/.test(none.error) && /--url/.test(none.error), none);
  // Symbiot itself: never your own app (on 7391, with your work in it), but a copy with made-up work in it, started and stopped for it
  let seen = null, stopped = 0; const demoApp = async () => ({ url: "http://127.0.0.1:9/?t=demo", stop: async () => { stopped++; } });
  const web = async (o) => { seen = o; return { items: [] }; }, render = async () => ({ ok: true }), ffmpeg = () => true; // recorded by stand-ins: no ffmpeg needed (CI has none)
  const own = await C.captureProduct({ product: repo, dir: lane, map: {}, apps: async () => [{ repo: "acme", url: "http://127.0.0.1:7391/", open: "http://127.0.0.1:7391/?t=secret", symbiot: true }], demoApp, web, render, ffmpeg });
  ok("Symbiot's own app, with your real work in it: never captured; a copy with made-up work in it is, then stopped", own.ok && seen && seen.url === "http://127.0.0.1:9/?t=demo" && stopped === 1 && /made-up work/.test(own.note), [own, seen && seen.url, stopped]);
  ok("…its screens, each by its #name on its one page, Home first", seen && seen.screens === C.SYMBIOT_SCREENS && seen.screens[0].path === "/" && seen.screens.some((x) => x.path === "#board"), seen && seen.screens);
  const symb = join(HOME, "symbiot-src"); mkdirSync(symb, { recursive: true }); writeFileSync(join(symb, "package.json"), JSON.stringify({ name: "symbiot" }));
  seen = null; const fromRepo = await C.captureProduct({ product: symb, dir: lane, map: {}, apps: async () => { throw new Error("it doesn't look for a running app"); }, demoApp, web, render, ffmpeg });
  ok("…Symbiot's repo itself, with nothing running: the same, in one go", fromRepo.ok && seen && seen.url === "http://127.0.0.1:9/?t=demo" && stopped === 2, [fromRepo, stopped]);
  const broke = await C.captureProduct({ product: symb, dir: lane, map: {}, demoApp: async () => ({ error: "The made-up Symbiot didn't start: port taken" }), web, render, ffmpeg });
  ok("…the copy didn't start: says so, and the next capture isn't held up", /didn't start/.test(broke.error || "") && (await C.captureProduct({ product: symb, dir: lane, map: {}, demoApp, web, render, ffmpeg })).ok, broke);
  ok("a one-page app's screen: its #name on the address, its ?token kept, a fresh load each", C.screenUrl("http://127.0.0.1:9/?t=abc", "#week", 3) === "http://127.0.0.1:9/?t=abc&shot=3#week" && C.screenUrl("http://127.0.0.1:9/?t=abc", "/", 0) === "http://127.0.0.1:9/?t=abc" && C.screenUrl("http://x.test", "/pricing", 1) === "http://x.test/pricing" && C.screenUrl("http://x.test", "#a", 2) === "http://x.test?shot=2#a", "");
  const D = await import("../demo.mjs"), dh = mkdtempSync(join(tmpdir(), "symbiot-demo-test-"));
  try {
    D.seedDemo(dh);
    const dc = join(dh, ".config", "symbiot"), log = spawnSync("git", ["-C", join(dh, "code", "storefront"), "log", "--format=%an %s"], { encoding: "utf8" }).stdout.trim().split("\n");
    ok("the made-up Symbiot: Acme's repos with their git, by a made-up person", log.length === 6 && log.every((l) => l.startsWith("Sam Rivera ")) && Object.keys(D.DEMO_REPOS).every((r) => existsSync(join(dh, "code", r, ".git"))), log);
    ok("…four agents asking, tasks, what arrived, its week and a Marketing draft", /Refund the duplicate charge/.test(readFileSync(join(dh, "code", "billing-api", ".symbiot", "QUESTIONS.md"), "utf8")) && JSON.parse(readFileSync(join(dc, "tasks.json"), "utf8")).length === 10 && JSON.parse(readFileSync(join(dc, "watch.json"), "utf8")).news.length === 9 && existsSync(join(dc, "marketing", "drafts", "storefront", "guest-checkout.md")), "");
    const dcfg = JSON.parse(readFileSync(join(dc, "config.json"), "utf8"));
    ok("…set up already, its key a fake, its agent a stand-in that does nothing, nothing of yours in it", /not-a-real-key/.test(dcfg.apiKey) && /-e ""/.test(dcfg.agentCmd) && dcfg.scanRoots[0] === join(dh, "code") && !JSON.stringify(dcfg).includes(process.env.USER || "\u0000"), dcfg);
  } finally { rmSync(dh, { recursive: true, force: true }); }
  let got = ""; const found = await C.captureProduct({ product: repo, dir: lane, map: {}, apps: async () => [{ repo: "acme", url: "http://localhost:3000/" }], web: async (o) => { got = o.url; return { items: [] }; }, render: async () => ({ ok: true }), ffmpeg: () => true });
  ok("an app of it running here: captured there", found.ok && got === "http://localhost:3000/", [found, got]);
  ok("not a product here and no address: says so", /isn't one of your projects/.test((await C.captureProduct({ product: "Nope", dir: lane, map: {} })).error), "");
  ok("by its name as people say it, from your projects", C.productRepo("acme", { acme: repo }).path === repo && !C.productRepo("marketing", { marketing: lane }), "");
}

console.log("A DESKTOP APP — its window recorded, read for what's private, to look over");
{
  ok("Linux: the window by its title (xdotool), recorded by its id (x11grab)", C.recordArgs({ id: "123" }, { out: "o.mp4", platform: "linux", env: { DISPLAY: ":1" }, seconds: 5 }).join(" ").includes("-f x11grab -window_id 123 -framerate 12 -draw_mouse 1 -i :1 -t 5"), "");
  ok("Windows: by its title (gdigrab); a Mac: the screen (avfoundation); a picture is one frame", C.recordArgs({ title: "Acme" }, { out: "o.png", platform: "win32", still: true }).join(" ").includes("-f gdigrab -framerate 12 -i title=Acme -frames:v 1 o.png") && C.recordArgs({}, { out: "o.mp4", platform: "darwin" }).includes("avfoundation"), "");
  const none = () => ({ stdout: "" }), all = () => true;
  ok("X11, no window by that title: says so", /No window called "Acme"/.test(C.windowOf("Acme", { platform: "linux", env: { DISPLAY: ":1" }, run: none, has: all }).error || ""), "");
  ok("no display: says so", /DISPLAY/.test(C.windowOf("Acme", { platform: "linux", env: {} }).error), "");
  ok("Wayland: an XWayland window is still recorded by its id, with no prompt", C.windowOf("Acme", { platform: "linux", env: { DISPLAY: ":1", WAYLAND_DISPLAY: "wayland-1" }, run: () => ({ stdout: "77\n" }), has: all }).id === "77", "");
  const wl = C.windowOf("Acme", { platform: "linux", env: { DISPLAY: ":1", WAYLAND_DISPLAY: "wayland-1" }, run: none, has: all });
  ok("…a Wayland-only one goes through the desktop's screen sharing", wl.portal && wl.title === "Acme", wl);
  ok("…Wayland with no X display at all, too", C.windowOf("Acme", { platform: "linux", env: { XDG_SESSION_TYPE: "wayland" }, has: all }).portal, "");
  ok("…without python3 it says what to install", /python3-gi/.test(C.windowOf("Acme", { platform: "linux", env: { WAYLAND_DISPLAY: "w" }, has: (c) => c !== "python3" }).error || ""), "");
  if (hasCmd("python3")) { const py = spawnSync("python3", ["-c", "import sys; compile(sys.stdin.read(), 'portal', 'exec')"], { input: C.PORTAL_PY, encoding: "utf8" }); ok("the screen-sharing helper is valid Python", py.status === 0, py.stderr); }
  // the portal's side stood in for: what it was asked, what it answers
  const picks = join(HOME, "picks.json"), asked = [], told = [];
  const answer = (o) => async (args) => { const a = JSON.parse(args[2]); asked.push(a); if (o.ok) { writeFileSync(a.still, "png"); if (a.clip) writeFileSync(a.clip, "avi"); } return { stdout: "a GStreamer warning\n" + JSON.stringify(o) + "\n", code: 0 }; };
  const encode = (avi, out) => { writeFileSync(out, "mp4"); return { ok: true }; };
  const notify = (t, b) => told.push(b);
  const p1 = await C.portalRecord("Acme Desk", { still: join(HOME, "s.png"), video: join(HOME, "c.mp4"), file: picks, py: answer({ ok: true, token: "t1", still: null, clip: null }), encode, notify });
  ok("the first time: you're told which window to pick, then a picture and a clip from one prompt", p1.still.ok && p1.clip.ok && asked.length === 1 && asked[0].clip.endsWith("c.avi") && !asked[0].token && /Pick "Acme Desk"/.test(told[0] || ""), [p1, asked, told]);
  ok("…the desktop's token for it kept, by its title", JSON.parse(readFileSync(picks, "utf8"))["acme desk"] === "t1", "");
  await C.portalRecord("acme desk", { still: join(HOME, "s.png"), file: picks, py: answer({ ok: true, token: "t2", still: null, clip: null }), encode, notify });
  ok("the next time: no prompt to tell you about, the token handed back, the new one kept", asked[1].token === "t1" && told.length === 1 && !asked[1].clip && JSON.parse(readFileSync(picks, "utf8"))["acme desk"] === "t2", [asked[1], told]);
  const says = async (o) => (await C.portalRecord("Acme", { still: join(HOME, "s.png"), file: picks, py: answer(o), encode, notify })).error || "";
  ok("closed the prompt: capture again and pick it", /pick "Acme" there/.test(await says({ error: "cancelled" })), "");
  ok("nobody picked: says how long it waited", /within 2 minutes/.test(await says({ error: "timeout" })), "");
  ok("no GStreamer bindings: what to install", /gstreamer1\.0-pipewire/.test(await says({ error: "missing", detail: "No module named 'gi'" })), "");
  ok("no session bus (a sandboxed run): capture from the app", /from the Symbiot app/.test(await says({ error: "nobus" })), "");
  ok("the helper said nothing we can read: its last words", /screen sharing stopped: boom/.test((await C.portalRecord("Acme", { still: "x", file: picks, py: async () => ({ stdout: "", stderr: "Traceback\nboom", code: 1 }), notify })).error || ""), "");
  if (media) {
    const t = C.trayPaths("Desk", lane); mkdirSync(t.root, { recursive: true }); mkdirSync(t.orig, { recursive: true });
    const record = async (args) => { const out = args[args.length - 1], still = args.includes("-frames:v"); const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x200:rate=12", ...(still ? ["-frames:v", "1"] : ["-t", "2", "-pix_fmt", "yuv420p"]), out]); return r.status === 0 ? { ok: true } : { error: "ffmpeg" }; };
    const ocr = () => ({ read: true, boxes: [{ kind: "email", x: 10, y: 10, w: 100, h: 20, hint: "" }] });
    const d = await C.captureDesktop({ product: "Desk", window: "Desk App", t, record, find: () => ({ id: "1" }), ocr, seconds: 2 });
    const sp = JSON.parse(readFileSync(join(t.root, "desk-app.blur.json"), "utf8")), cp = JSON.parse(readFileSync(join(t.root, "desk-app-clip.blur.json"), "utf8"));
    ok("a picture and a clip of the window, the text read in each blurred", d.items.join() === "desk-app,desk-app-clip" && sp.regions.length === 1 && sp.regions[0].kind === "email" && sp.size.join() === "320x200".replace("x", ",") && cp.regions.length >= 1, [d, sp.regions, cp.regions]);
    ok("…each marked to look over: Symbiot can't see faces or pictures in a window", /can't see faces or pictures/.test(sp.review) && /can't see faces or pictures/.test(cp.review), sp.review);
    const tw = C.trayPaths("Wl", lane); mkdirSync(tw.root, { recursive: true }); mkdirSync(tw.orig, { recursive: true });
    let prompts = 0;
    const portal = async (title, o) => { prompts++; await record(["-frames:v", o.still]); if (o.video) await record([o.video]); return { still: { ok: true }, clip: o.video ? { ok: true } : null }; };
    const w = await C.captureDesktop({ product: "Wl", window: "Wl App", t: tw, record: async () => ({ error: "x11grab under Wayland" }), portal, find: () => ({ title: "Wl App", portal: true }), ocr, seconds: 2 });
    ok("a Wayland window: its picture and clip from one pick, blurred like any other", prompts === 1 && (w.items || []).join() === "wl-app,wl-app-clip" && JSON.parse(readFileSync(join(tw.root, "wl-app.blur.json"), "utf8")).regions.length === 1, w);
    const wx = await C.captureDesktop({ product: "Wl", window: "Wl App", t: tw, portal: async () => ({ error: "The window wasn't picked" }), find: () => ({ title: "Wl App", portal: true }), ocr });
    ok("…not picked: says so, nothing half-made", /Couldn't record the window: The window wasn't picked/.test(wx.error || "") && !wx.items, wx);
  }
}

console.log("YOURS — a box you draw, one you remove, a capture looked over before it's used");
{
  const t = C.trayPaths("Desk", lane), rel = t.rel;
  if (existsSync(join(t.root, "desk-app.blur.json"))) {
    const a = T.addBlur(rel, "desk-app", { x: 0.5, y: 0.5, w: 0.25, h: 0.25 }, { dir: lane });
    const sp = JSON.parse(readFileSync(join(t.root, "desk-app.blur.json"), "utf8")), mine = sp.regions.find((x) => x.id === a.id);
    ok("a box you draw (as fractions of it) is saved in its pixels, yours, blurred", a.ok && mine && mine.hand && mine.on && mine.kind === "yours" && mine.x === 160 && mine.y === 100 && mine.w === 80 && mine.h === 50, [a, mine]);
    ok("…shown on the page as yours", T.trays({ dir: lane }).find((x) => x.rel === rel).items.find((x) => x.name === "desk-app").regions.some((x) => x.hand), "");
    ok("a click, not a drag: refused", !!T.addBlur(rel, "desk-app", { x: 0.5, y: 0.5, w: 0, h: 0 }, { dir: lane }).error, "");
    ok("one Symbiot found can't be removed (switch it off instead)", /switch it off/.test(T.removeBlur(rel, "desk-app", 1, { dir: lane }).error || ""), "");
    ok("one you drew can", T.removeBlur(rel, "desk-app", a.id, { dir: lane }).ok && !JSON.parse(readFileSync(join(t.root, "desk-app.blur.json"), "utf8")).regions.some((x) => x.hand), "");
    const r2 = await T.renderCapture(rel, "desk-app", { dir: lane });
    ok("blurred again with it, from the original", r2.ok && existsSync(join(t.root, "desk-app.png")), r2);
    // a post can't have it until it's been looked over
    writeFileSync(join(lane, "drafts", "desk", "launch.md"), "# Launch\nproduct: Desk\nplatform: linkedin\n\n## Post\nDesk is out.\n\n## Notes\nnone\n");
    const before = M.setDraftMedia("drafts/desk/launch.md", [`${rel}/desk-app.png`], { dir: lane });
    ok("on a post before it's been looked over: refused, and why", before.error && /Look it over first/.test(before.error) && before.review, before);
    ok("the page says so on it, with Looked it over", /can't see faces/.test(T.trays({ dir: lane }).find((x) => x.rel === rel).items.find((x) => x.name === "desk-app").review || ""), "");
    ok("looked over", T.setReviewed(rel, "desk-app", { dir: lane }).ok && !T.trays({ dir: lane }).find((x) => x.rel === rel).items.find((x) => x.name === "desk-app").review, "");
    const after = M.setDraftMedia("drafts/desk/launch.md", [`${rel}/desk-app.png`], { dir: lane });
    ok("…then it goes on the post", after.ok && after.media.join() === "tray/desk-app.png", after);
  }
  mkdirSync(join(lane, ".symbiot", "tray-originals", "x"), { recursive: true }); writeFileSync(join(lane, ".symbiot", "tray-originals", "x", "a.png"), "unblurred");
  ok("an unblurred original is never served, previewed or put on a post", !M.inLane(lane, ".symbiot/tray-originals/x/a.png") && !M.laneMedia(".symbiot/tray-originals/x/a.png", { dir: lane }) && !!M.setDraftMedia("drafts/desk/launch.md", ["../../.symbiot/tray-originals/x/a.png"], { dir: lane }).error, "");
}

console.log("THE LANE'S FIRST RUN — a product with no tray is captured first");
{
  const tasks = [{ text: "[Acme] write the launch post" }, { text: "[Desk] a post about it" }], map = { acme: join(HOME, "acme"), desk: join(HOME, "desk") };
  mkdirSync(map.desk, { recursive: true });
  const dt = C.trayPaths("Desk", lane); if (!existsSync(join(dt.root, "tray.json"))) { mkdirSync(dt.root, { recursive: true }); writeFileSync(join(dt.root, "tray.json"), JSON.stringify({ items: [] })); } // made above where ffmpeg is; on CI it isn't
  const b = M.marketingBrief(tasks, { map, names: ["Acme", "Desk"], dir: lane }).join("\n");
  ok("its brief: capture it first, with Symbiot's own command", /\*\*Acme has no pick tray yet: start by capturing it\.\*\* Run `node "[^"]+index\.mjs" capture "Acme"`/.test(b), b.slice(0, 600));
  ok("…not a product that has one", !/Desk has no pick tray/.test(b), "");
  ok("…and never a capture script of its own, nor an unblurred original", /never a capture script of your own/.test(b) && /never an unblurred original/.test(b), "");
}

console.log(`\n${fail ? "✗" : "✓"} capture: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
