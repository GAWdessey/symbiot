// Adapt (adapt.mjs): the models behind a Symbiot that shapes itself to its user.
// Each check is a property of the model it uses (frecency's half-life, Markov
// smoothing, entropy's bounds, Fitts's optimum under conserved area, Hick's cap,
// hysteresis, stable angles, style). Isolated HOME, set before the modules load.
//
//   node test/adapt.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-adapt-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const A = await import("../adapt.mjs");
const fresh = () => ({ shapes: {}, trans: {}, hours: {}, modes: {}, slots: {}, shown: null, events: 0 });
const T0 = Date.UTC(2026, 9, 6, 7, 0, 0); // a Tuesday morning

try {
  console.log("FRECENCY — use decays with a half-life");
  ok("one use is worth half after one half-life, a quarter after two", near(A.decayed({ s: 1, t: 0 }, A.HALF_LIFE), 0.5, 1e-9) && near(A.decayed({ s: 1, t: 0 }, 2 * A.HALF_LIFE), 0.25, 1e-9), "");
  const b = A.bump(A.bump(null, 0), A.HALF_LIFE);
  ok("a use adds 1 on top of what's left (exact, no history kept)", near(b.s, 1.5, 1e-9) && b.n === 2, b);

  console.log("PREDICTION — what they'll open, from habit, sequence and time of day");
  const p0 = A.predict(fresh(), A.SHAPES, { now: T0 });
  ok("no history: every shape equally likely", p0.every((x) => near(x, 1 / A.SHAPES.length, 1e-9)), p0);
  let d = fresh();
  for (let i = 0; i < 10; i++) { A.recordUse(d, "board", { now: T0 + i * 60000 }); A.recordUse(d, "tasks", { from: "board", now: T0 + i * 60000 + 1000 }); }
  const pB = A.predict(d, A.SHAPES, { from: "board", now: T0 + 3600000 }), iT = A.SHAPES.indexOf("tasks");
  ok("they always open Tasks after the Dashboard: from the Dashboard, Tasks is the most likely", pB[iT] === Math.max(...pB) && pB[iT] > 0.3, pB.map((x) => +x.toFixed(3)));
  const d1 = fresh(); A.recordUse(d1, "board", { now: T0 }); A.recordUse(d1, "drift", { from: "board", now: T0 + 1000 });
  const pOne = A.predict(d1, A.SHAPES, { from: "board", now: T0 + 2000 });
  ok("one move can't swing it (Dirichlet prior): P(drift | board) stays under 0.5", pOne[A.SHAPES.indexOf("drift")] < 0.5, pOne[A.SHAPES.indexOf("drift")]);
  const dh = fresh();
  for (let day = 0; day < 6; day++) { A.recordUse(dh, "week", { now: T0 + day * 86400000 + 2 * 3600000 }); A.recordUse(dh, "map", { now: T0 + day * 86400000 + 14 * 3600000 }); }
  const morn = A.predict(dh, A.SHAPES, { hour: new Date(T0 + 2 * 3600000).getHours(), now: T0 + 7 * 86400000 }), eve = A.predict(dh, A.SHAPES, { hour: new Date(T0 + 14 * 3600000).getHours(), now: T0 + 7 * 86400000 });
  const iW = A.SHAPES.indexOf("week"), iM = A.SHAPES.indexOf("map");
  ok("time of day: Week leads when they usually write it, Map when they usually look at it", morn[iW] > morn[iM] && eve[iM] > eve[iW], [morn[iW], morn[iM], eve[iW], eve[iM]].map((x) => +x.toFixed(3)));

  console.log("ENTROPY & ADAPTIVITY — adapt to habits, hold still for scattered use");
  ok("entropy is 1 when uniform, 0 when certain", near(A.entropy([0.25, 0.25, 0.25, 0.25]), 1, 1e-9) && near(A.entropy([1, 0, 0, 0]), 0, 1e-9), "");
  ok("habits (low entropy, enough use) adapt strongly; no history doesn't adapt at all", A.adaptivity(d, pB) > 0.15 && A.adaptivity(fresh(), p0) === 0, [A.adaptivity(d, pB), A.adaptivity(fresh(), p0)]);
  const few = fresh(); A.recordUse(few, "tasks", { now: T0 }); A.recordUse(few, "tasks", { now: T0 + 1 });
  ok("a couple of uses only nudge it (fades in over the first uses)", A.adaptivity(few, A.predict(few, A.SHAPES, { now: T0 + 2 })) < 0.1, A.adaptivity(few, A.predict(few, A.SHAPES, { now: T0 + 2 })));

  console.log("FITTS & MASS — size from probability, the total liquid conserved");
  const p = [0.5, 0.3, 0.15, 0.05], budget = 4 * Math.PI * 50 * 50;
  const r = A.allocate(p, { budget, minR: 1, maxR: 1000 });
  ok("area ∝ probability: radius ∝ √p", near(r[0] / r[3], Math.sqrt(0.5 / 0.05), 1e-6) && near(r[1] / r[2], Math.sqrt(0.3 / 0.15), 1e-6), r);
  ok("conservation: the areas add up to the budget", near(r.reduce((s, x) => s + Math.PI * x * x, 0), budget, 1e-6 * budget), "");
  const rc = A.allocate(p, { budget, minR: 40, maxR: 80 });
  ok("clamped to [min, max], and the leftover goes to the rest (still within the budget)", rc.every((x) => x >= 40 - 1e-9 && x <= 80 + 1e-9) && rc.reduce((s, x) => s + Math.PI * x * x, 0) <= budget * 1.0001 + Math.PI * 40 * 40, rc);
  const D = 240, uni = p.map(() => Math.sqrt(budget / p.length / Math.PI));
  const E = (rs) => p.reduce((s, x, i) => s + x * A.fittsTime(D, 2 * rs[i]), 0);
  ok("Fitts: √p sizing beats equal sizes on expected time for the same liquid", E(r) < E(uni), [E(r), E(uni)]);

  console.log("HICK — show the few that matter, the rest under more");
  const hu = A.hick(A.SHAPES, A.SHAPES.map(() => 1 / A.SHAPES.length));
  ok("scattered use: capped at 7, the rest under more (and still reachable)", hu.shown.length === 7 && hu.more.length === A.SHAPES.length - 7, hu);
  const hs = A.hick(A.SHAPES, [0.6, 0.25, 0.08, 0.03, 0.01, 0.01, 0.01, 0.005, 0.005, 0, 0, 0].slice(0, A.SHAPES.length));
  ok("habits: as few as cover 90% (never under 3)", hs.shown.length === 3 && hs.more.length === A.SHAPES.length - 3, hs);

  console.log("NEW PARTS — a page that just shipped is seen, and every part can be asked for (the Vault, 23 Oct 2026)");
  const BASE = ["board", "map", "tasks", "agents", "week", "standup", "todo", "drift", "settings", "reports", "marketing"];
  ok("every part added since has the date it shipped (else it's born under more, unseen)", A.SHAPES.filter((id) => !BASE.includes(id)).every((id) => A.ADDED[id] > 0), A.SHAPES.filter((id) => !BASE.includes(id) && !A.ADDED[id]));
  const M = await import("../mind.mjs");
  ok("every part can be opened by asking the chat (\"open the vault\")", A.SHAPES.every((id) => id === "agents" || M.PAGES[id]) && M.goOf({ to: "vault" }).to === "vault" && M.goOf("Vault").to === "vault", A.SHAPES.filter((id) => id !== "agents" && !M.PAGES[id]));
  const TV = A.ADDED.vault + 3600000, dv = fresh();
  for (let i = 0; i < 40; i++) for (const s of ["tasks", "board", "reports", "marketing", "settings", "map", "drift", "week"]) A.recordUse(dv, s, { now: TV - 86400000 + i * 60000 });
  const before = A.layoutFor(dv, A.SHAPES, { now: A.ADDED.vault - 3600000, commit: true });
  ok("(before it shipped, habits fill Home and the Vault is under more)", !before.items.some((x) => x.id === "vault") && before.more.includes("vault"), before.items.map((x) => x.id));
  const lv = A.layoutFor(dv, A.SHAPES, { now: TV });
  ok("once it's out, the new Vault is on Home, even before the next commit, and Home still holds at most 7", lv.items.some((x) => x.id === "vault") && lv.items.length <= 7 && !lv.more.includes("vault"), lv.items.map((x) => x.id));
  A.recordUse(dv, "vault", { now: TV + 1000 });
  ok("opened once, it's ranked like the rest", !A.isNew(dv, "vault", TV + 2000));
  ok("…and after three weeks unopened it's ranked like the rest too", !A.isNew(fresh(), "vault", A.ADDED.vault + A.NEW_MS + 1) && A.isNew(fresh(), "vault", TV));

  console.log("STABILITY — it doesn't move things under your hand");
  const s = fresh();
  for (let i = 0; i < 20; i++) A.recordUse(s, "tasks", { now: T0 + i * 1000 });
  const L1 = A.layoutFor(s, A.SHAPES, { now: T0 + 30000, commit: true });
  const angleTasks = L1.items.find((x) => x.id === "tasks").angle;
  A.recordUse(s, "map", { now: T0 + 31000 });
  const L2 = A.layoutFor(s, A.SHAPES, { now: T0 + 32000 });
  ok("without a commit (mid-use), the shown layout stays exactly as it was", JSON.stringify(L2.items) === JSON.stringify(L1.items) && !L2.changed, "");
  const L3 = A.layoutFor(s, A.SHAPES, { now: T0 + 33000, commit: true });
  ok("a commit with a tiny gain (under the hysteresis) keeps it too", JSON.stringify(L3.items) === JSON.stringify(L1.items), "");
  for (let i = 0; i < 40; i++) A.recordUse(s, "map", { now: T0 + 40000 + i * 1000 });
  const L4 = A.layoutFor(s, A.SHAPES, { now: T0 + 100000, commit: true });
  const m4 = L4.items.find((x) => x.id === "map"), t4 = L4.items.find((x) => x.id === "tasks");
  ok("a real shift in habit, on wake: it adapts (Map now biggest and nearest)", L4.changed && m4 && m4.r >= Math.max(...L4.items.map((x) => x.r)) - 1e-9 && m4.d <= Math.min(...L4.items.map((x) => x.d)) + 1e-9, L4.items.map((x) => [x.id, Math.round(x.r), Math.round(x.d)]));
  ok("…but every shape keeps its angle: where things are doesn't change", t4 && t4.angle === angleTasks, [t4 && t4.angle, angleTasks]);
  const L5 = A.layoutFor(s, A.SHAPES, { now: T0 + 100000, commit: true, touch: true });
  ok("on a touch screen, nothing is smaller than a finger's target", L5.items.every((x) => x.r >= 34), L5.items.map((x) => Math.round(x.r)));

  console.log("HOW THEY WORK IT — talk, click, keyboard, touch");
  const w = fresh();
  for (let i = 0; i < 8; i++) A.recordUse(w, "tasks", { via: "talk", now: T0 + i });
  A.recordUse(w, "map", { via: "click", now: T0 + 9 });
  const mo = A.modes(w, T0 + 10);
  ok("mostly talking: the talk band gets the weight", mo.talk > 0.8 && mo.talkWeight > 0.9 && !mo.touch, mo);

  console.log("HOW THEY TALK — converge on their style");
  const mine = ["i want Link buttons that go to the normal standard sites", "push it", "close it for me, the mcp is set up and you have access", "Hey check die uit", "its informative, but not helpful", "raise the watch limit too", "merge it in now and bump the version", "i highly doubt that it made the task...", "NOW the UI. ive been seeing a lot of NEW UI aspects"];
  const st = A.styleOf(mine), line = A.styleLine(st);
  ok("short messages are measured as short", st.words <= 12, st);
  ok("mostly instructions, casual, no emoji, emphasis in capitals", st.instructions > 0.4 && st.lowercase > 0.6 && st.emoji === 0 && st.emphasis > 0.1, st);
  ok("the instruction: brief, act and say what you did, no emoji, capitals = priority, no copying typos", /keep replies brief/.test(line) && /act and say what you did/.test(line) && /no emoji/.test(line) && /in capitals they mean it/.test(line) && /Don't copy their typos/.test(line), line);
  ok("Afrikaans mixed in is noticed, and answered in kind only for a whole Afrikaans message", A.styleLine({ ...st, afrikaans: 0.2 }).includes("they mix in Afrikaans"), "");
  ok("English that shares words with Afrikaans (van, met, more, is) isn't taken for it", A.styleOf(["is this the right van to get more?", "what is it", "met him today"]).afrikaans === 0 && A.styleOf(["ek sal dit nou doen", "baie dankie", "ok"]).afrikaans > 0.5, "");
  ok("too little to go on: no instruction at all", A.styleOf(["hi", "ok"]) === null && A.styleLine(null) === "", "");
  writeFileSync(join(CFG, "mind.json"), JSON.stringify({ nodes: [], log: mine.map((text) => ({ role: "user", text, where: "x", ts: 1 })) }));
  ok("read from what they typed into Symbiot's chats", /Match how they talk/.test(A.userStyleLine()), A.userStyleLine());

  console.log("THE APP'S VIEW — note a use, get the layout");
  ok("only known shapes are noted", /unknown shape/.test(A.noteUse({ shape: "evil" }).error || "") && A.noteUse({ shape: "tasks", via: "talk" }).ok, "");
  const v = A.adaptState({ commit: true });
  ok("the state has a layout, the modes and the style", v.layout.items.length >= 3 && typeof v.modes.talkWeight === "number" && /Match how they talk/.test(v.styleLine), [v.layout.items.length, v.modes]);
  ok("adapt.json is yours only (0600)", (statSync(A.ADAPT_FILE).mode & 0o777) === 0o600, (statSync(A.ADAPT_FILE).mode & 0o777).toString(8));

  console.log("NEAREST NEIGHBOURS — parts you go between sit together; before any use, parts that belong together do");
  {
    const fresh = { shapes: {}, trans: {}, hours: {}, modes: {}, slots: {}, shown: null, events: 0 };
    const n0 = A.neighbours(fresh);
    ok("at most k = 2 nearest, each above chance, never itself", A.SHAPES.every((id) => n0[id].length <= 2 && n0[id].every((n) => n.id !== id && n.w > 1 / A.SHAPES.length)), n0);
    ok("with no use yet, the parts form P.A.R.A. clusters, not a chain: nothing links a Project to an Area or a Resource", !n0.tasks.some((n) => ["board", "week", "standup", "map", "drift", "settings"].includes(n.id)) && !n0.week.some((n) => ["tasks", "agents", "todo", "map", "drift", "settings"].includes(n.id)) && n0.settings.every((n) => ["map", "drift"].includes(n.id)), [n0.tasks, n0.week, n0.settings]);
    ok("with no use yet, P.A.R.A. groups lead (Tasks beside Agents, Week beside Standup, Map beside Drift)", n0.tasks.some((n) => n.id === "agents") && n0.week.some((n) => n.id === "standup") && n0.map.some((n) => n.id === "drift"), [n0.tasks, n0.week, n0.map]);
    ok("affinity is symmetric", A.affinity(fresh, "map", "week") === A.affinity(fresh, "week", "map"), "");
    const used = { ...fresh, trans: { week: { map: 12 }, map: { week: 9 } } };
    ok("going between two parts makes them nearest, over the built-in pairs", A.neighbours(used).week[0].id === "map" && A.neighbours(used).map[0].id === "week", A.neighbours(used).week);
    ok("the same history gives the same neighbours (a steady picture)", JSON.stringify(A.neighbours(used)) === JSON.stringify(A.neighbours(used)), "");
  }
  console.log("LAYOUT — droplets never sit where their metal would flicker between merged and apart");
  const { EMBEDDED_UI } = await import("../ui.mjs");
  const uiJs = [...EMBEDDED_UI.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const grab = (name) => { const i = uiJs.indexOf("function " + name + "("); let depth = 0, j = uiJs.indexOf("{", i); for (; j < uiJs.length; j++) { if (uiJs[j] === "{") depth++; else if (uiJs[j] === "}" && --depth === 0) break; } return uiJs.slice(i, j + 1); };
  const { lqSep, lqRelax } = new Function(grab("lqSep") + "\n" + grab("lqRelax") + "\nreturn { lqSep, lqRelax };")();
  {
    const { lqNear } = new Function(grab("lqSep") + "\n" + grab("lqNear") + "\nreturn { lqNear };")();
    const ring = (n) => Array.from({ length: n }, (_, i) => { const a = i * 2 * Math.PI / n, x = 600 + Math.cos(a) * 300, y = 400 + Math.sin(a) * 260; return { r: 40, tx: x, ty: y, ax: x, ay: y }; });
    const L = ring(8), d0 = Math.hypot(L[0].tx - L[4].tx, L[0].ty - L[4].ty);
    lqNear(L, [[0, 4, 0.3]], 600, 400, 90, { s: 1 });
    const d1 = Math.hypot(L[0].tx - L[4].tx, L[0].ty - L[4].ty);
    ok("nearest neighbours: two linked droplets across the ring are drawn together", d1 < d0 * 0.75, [Math.round(d0), Math.round(d1)]);
    let clear = true; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const dx = L[j].tx - L[i].tx, dy = L[j].ty - L[i].ty; if (Math.hypot(dx, dy) < 2 * Math.sqrt(L[i].r ** 2 + L[j].r ** 2)) clear = false; }
    ok("…and still never so close their metal bridges", clear, "");
    ok("…and kept off the core", L.every((d) => Math.hypot(d.tx - 600, d.ty - 400) >= 90 + d.r + 59), "");
    const { lqSeed } = new Function("function lqOrg(id,k){var h=k*977;id=String(id);for(var i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))|0;return ((h>>>0)%1000)/1000;}\n" + grab("lqSeed") + "\nreturn { lqSeed };")();
    const C = ring(7).map((d, i) => ({ ...d, id: "s" + i, kind: "shape" })), CL = [[0, 3, 0.2], [3, 5, 0.2], [1, 6, 0.2]];
    lqSeed(C, CL, 600, 400, 1, 1); lqNear(C, CL, 600, 400, 90, { s: 1 });
    const dd = (i, j) => Math.hypot(C[i].tx - C[j].tx, C[i].ty - C[j].ty), within = Math.max(dd(0, 3), dd(3, 5), dd(1, 6)), across = Math.min(dd(0, 1), dd(0, 6), dd(5, 1), dd(5, 6), dd(3, 1), dd(3, 6));
    ok("clusters: each linked group sits together, closer within than to the other group, even when they began across a ring", within < across, [Math.round(within), Math.round(across)]);
  }
  const crowd = (w, h) => Array.from({ length: 11 }, (_, i) => ({ r: 40 + (i % 3) * 12, tx: w / 2 + Math.cos(i * 2.4) * 60, ty: h * 0.47 + Math.sin(i * 2.4) * 60 }));
  const bridged = (L) => { let worst = Infinity; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const d = Math.hypot(L[i].tx - L[j].tx, L[i].ty - L[j].ty), b = 2 * Math.sqrt(L[i].r ** 2 + L[j].r ** 2); worst = Math.min(worst, d / b); } return worst; };
  ok("the rule keeps two droplets past where their metal bridges, with margin (2.4·√(r1²+r2²))", lqSep({ r: 50 }, { r: 50 }, 500) >= 2.4 * Math.sqrt(5000) && lqSep({ r: 20 }, { r: 20 }, 500) === 110 && lqSep({ r: 20 }, { r: 20 }, 0) === 158, [lqSep({ r: 50 }, { r: 50 }, 500), lqSep({ r: 20 }, { r: 20 }, 0)]);
  let small = crowd(480, 860), fits = lqRelax(small, { w: 480, h: 860 }, 240, 404, 80), dropped = 0;
  ok("eleven on a phone can't all fit clear of each other, and the solver says so", fits === false, fits);
  while (!fits && dropped < 8) { small = crowd(480, 860).slice(0, 11 - ++dropped); fits = lqRelax(small, { w: 480, h: 860 }, 240, 404, 80); } // as the app does: the least likely part goes under "more"
  ok("with fewer (the rest under more), every pair is clear of the bridging distance, with margin", fits && bridged(small) >= 1.15 && small.length >= 3, [small.length, bridged(small)]);
  const big = crowd(1600, 1000), rb = big.map((x) => x.r);
  lqRelax(big, { w: 1600, h: 1000 }, 800, 470, 90);
  ok("with room, nothing shrinks, and every pair keeps the rule", big.every((x, i) => x.r === rb[i]) && bridged(big) >= 1.15, [bridged(big)]);
  const again = crowd(1600, 1000); lqRelax(again, { w: 1600, h: 1000 }, 800, 470, 90);
  ok("the same data, the same layout (deterministic: nothing jitters from run to run)", JSON.stringify(again) === JSON.stringify(big), "");

  console.log("GOING SOMEWHERE BY ASKING — straight there, no wait for the model (2026-10-09)");
  {
    const line = (re) => uiJs.match(re)[0];
    const { lqNavHit } = new Function([line(/var LQNAMES=\{[^}]*\};/), line(/var LQ_NAV_ALIAS=\{[^}]*\};/), grab("lqNavHit")].join("\n") + "\nreturn { lqNavHit };")();
    const cases = { "navigate me to reports": "reports", "take me to reports": "reports", "Take me to Reports.": "reports", "can you open settings please": "settings", "go to the workdesk": "tasks", "show me my tasks": "tasks", "open the dashboard": "board", "dashboard": "board", "reports": "reports", "open my week": "week", "take me home": "home", "go back home": "home", "Symbiot, navigate to marketing": "marketing", "open archive": "archive" };
    const got = Object.fromEntries(Object.keys(cases).map((q) => [q, lqNavHit(q)]));
    ok("clear asks go straight to their page", Object.keys(cases).every((q) => got[q] === cases[q]), got);
    const not = ["show me that thing from earlier", "where are my updates", "go for it", "go", "home", "open settings and change my voice", "show me the bug in bookly"];
    ok("…a vague ask, or more than a page, goes to the model (it picks and says why)", not.every((q) => lqNavHit(q) === ""), not.map((q) => [q, lqNavHit(q)]));
    ok("the model's pick opens, with its reason and the others on the page it opened", /if\(r\.go&&r\.go\.to\)\{lqNav\(r\.go\.to,r\.go\)/.test(uiJs) && /id="lqwhy"/.test(EMBEDDED_UI), "");
  }

  console.log("HOME'S LAYOUT — agents at work in a band of their own; no label, heading or orb on another (2026-10-08)");
  {
    const line = (re) => uiJs.match(re)[0];
    const pre = ["var LQ={};", line(/var PARA_OF=\{[^}]*\};/), line(/var ZONE_ORDER=\[[^\]]*\],ZONE_KIND=\{[^}]*\};/), line(/var LQ_RUNW=\d+;/)].join("\n");
    const F = new Function(pre + grab("lqPara") + grab("runWarn") + grab("lqRunBand") + grab("lqZones") + "\nreturn { lqZones, lqRunBand, LQ };")();
    const shapes = [["tasks", 58.7], ["settings", 48.5], ["reports", 41.5], ["marketing", 35], ["board", 34.8], ["todo", 34.5], ["map", 34.5]]; // the layout Pat's Home had
    const names = ["meridian", "robin", "Pat just restarted his Symbiot app", "symbiot"];
    const runs = names.map((n) => ({ id: "run:" + n, name: n, repo: n, line: "step 3 of 4: wire the class bible into the game · trials in a sealed circle", eta: "5–15 min left" }));
    const over = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    const tag = (d) => Math.min(170, String(d.title).length * 6.6 + 18);
    for (const [w, hgt, needBottom] of [[1840, 873, 320], [1600, 900, 320], [1440, 860, 0], [1280, 800, 320]]) {
      const S = { w, h: hgt, s: Math.max(0.55, Math.min(1.15, Math.min(w, hgt) / 860)) };
      const band = F.lqRunBand({ runs }, S, needBottom);
      const list = shapes.map(([id, r]) => ({ id: "shape:" + id, kind: "shape", shape: id, title: id, r: r * S.s }))
        .concat([{ id: "feed:gh", kind: "feed", shape: "board", title: "GitHub", r: 33 }, { id: "feed:li", kind: "feed", shape: "board", title: "LinkedIn", r: 33 }, { id: "archive", kind: "archive", shape: "tasks", title: "Archive", r: 22 }, { id: "more", kind: "more", title: "more", r: 24 }]);
      const z = F.lqZones(list, S, band.bottom || needBottom, 92 * S.s);
      const at = `${w}×${hgt}`;
      ok(`${at}: the agents are a band of their own, below the needs band, never in a group`, band.items.length >= 3 && band.items.every((d) => d.band && d.ty - d.r - 20 >= needBottom && !list.includes(d)) && band.bottom > needBottom, band.items.map((d) => [d.tx, d.ty]));
      ok(`${at}: each agent's name in full, on one line, with its step under it`, band.items.every((d, i) => d.title === names[i] && /^step 3 of 4/.test(d.sub) && /5–15 min left/.test(d.sub)), band.items.map((d) => d.title));
      if (w < 1400) { ok(`${at}: too little room for the groups' own places: the solver's layout instead, under the band`, z === null || !!z, ""); if (!z) continue; }
      else ok(`${at}: the groups keep their own places (zones) with agents at work`, !!z, z);
      if (!z) continue;
      const boxes = [];
      band.items.forEach((d) => { boxes.push({ who: d.title + " orb", b: [d.tx - d.r - 20, d.ty - d.r - 20, d.tx + d.r + 20, d.ty + d.r + 20] }); boxes.push({ who: d.title + " label", b: [d.tx + d.r + 30, d.ty - 18, d.tx + d.r + 30 + 270, d.ty + 18] }); });
      list.forEach((d) => { boxes.push({ who: d.id + " orb", b: [d.tx - d.r, d.ty - d.r, d.tx + d.r, d.ty + d.r] }); boxes.push({ who: d.id + " label", b: [d.tx - tag(d) / 2, d.ty + d.r + 4, d.tx + tag(d) / 2, d.ty + d.r + 30] }); });
      Object.entries(F.LQ.zoneT).forEach(([g, p]) => boxes.push({ who: "heading " + g, b: [p[0] - 75, p[1] - 20, p[0] + 75, p[1] + 20] }));
      const cr = 92 * S.s; boxes.push({ who: "core", b: [w / 2 - cr, z.cy - cr, w / 2 + cr, z.cy + cr] });
      const clash = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxes[i].who.split(" ")[0] !== boxes[j].who.split(" ")[0] && over(boxes[i].b, boxes[j].b)) clash.push(boxes[i].who + " × " + boxes[j].who);
      ok(`${at}: no label, heading or orb overlaps another`, !clash.length, clash.slice(0, 6));
      ok(`${at}: all of it on screen, above the chat`, boxes.every((x) => x.b[0] >= 0 && x.b[2] <= w && x.b[3] <= hgt - 150), boxes.filter((x) => x.b[0] < 0 || x.b[2] > w || x.b[3] > hgt - 150).map((x) => x.who));
    }
  }
  console.log("HOME — the liquid's droplets from real data, and its talk");
  const { homeState, homeAsk } = await import("../home.mjs");
  const deps = {
    board: () => ({ cards: [{ id: "w1", name: "WhatsApp", label: "2 WhatsApp messages", count: 2 }, { id: "g1", name: "Gmail", label: "0 new", count: 0 }] }),
    pending: () => [{ repo: "symbiot", path: "/x", tasks: [{}, {}], files: [{}, {}, {}] }, { repo: "busy", path: "/y", running: true, tasks: [{}], files: [{}] }],
    agents: () => [{ name: "whatsapp_module", path: "/w", status: "done", ask: { questions: [{ q: "Paste the new Meta token?" }] } }, { name: "atlas", path: "/c", status: "running", ask: { questions: [] } }],
    lanes: () => ({ handoffs: [{ from: "atlas", to: "ops", text: "Find a JDK 17", status: "done" }] }),
    connected: () => true, repos: () => ({ symbiot: "/x" }), reports: () => ({ count: 0 }), agentCmd: () => 'claude -p "{prompt}"',
    search: () => ({ searching: false, at: 1 }), confirmed: () => true, rootsSet: () => false,
  };
  const h = homeState({ deps });
  const first = homeState({ deps: { ...deps, pending: () => [], agents: () => [], connected: () => false, repos: () => ({}) } });
  // bookly, 13 Oct 2026: approved, committed, never pushed, and the card went with the tasks
  const stuckHome = homeState({ fresh: true, deps: { ...deps, pending: () => [{ repo: "bookly", path: "/d", tasks: [], files: [], unsent: { why: "tests", branch: "symbiot/4-tasks" } }] } }).you.find((y) => y.id === "approve:bookly");
  ok("approved work not on GitHub keeps a card on Home, saying why, that opens its review", stuckHome && stuckHome.kind === "approve" && /not on GitHub yet: its tests failed here/.test(stuckHome.sub), stuckHome);
  ok("first run, a finished search found nothing: connect an AI, then the folder your repos are in, both out front and opening Settings", first.you.map((y) => y.id).join() === "setup:ai,setup:folders" && first.you.every((y) => y.shape === "settings"), first.you);
  const looking = homeState({ fresh: true, deps: { ...deps, pending: () => [], agents: () => [], repos: () => ({}), search: () => ({ searching: true, at: 0 }) } });
  ok("…never while it's still looking: where your repos are is found, not asked", !looking.you.some((y) => y.id === "setup:folders"), looking.you);
  const unsearched = homeState({ fresh: true, deps: { ...deps, pending: () => [], agents: () => [], repos: () => ({}), search: () => ({ searching: false, at: 0 }) } });
  ok("…nor before the first search has run", !unsearched.you.some((y) => y.id === "setup:folders"), unsearched.you);
  const given = (search) => homeState({ fresh: true, deps: { ...deps, pending: () => [], agents: () => [], repos: () => ({}), rootsSet: () => true, search: () => search } }).you;
  ok("…nor once you've set your work folders, when a search finds none or is cut short: that's Symbiot's to retry", [{ searching: false, at: 1 }, { searching: false, at: 1, partial: true }].every((s) => !given(s).some((y) => y.id === "setup:folders" || y.kind === "setup" && /folder|projects/i.test(y.title))), given({ searching: false, at: 1 }));
  const givenFound = homeState({ fresh: true, deps: { ...deps, repos: () => ({ symbiot: "/x", meridian: "/a" }), confirmed: () => false, rootsSet: () => true } }).you;
  ok("…and the folders you set count as confirmed: no \"is that all?\"", !givenFound.some((y) => y.id === "repos:confirm"), givenFound);
  const found2 = homeState({ fresh: true, deps: { ...deps, pending: () => [], agents: () => [], repos: () => ({ symbiot: "/x", meridian: "/a" }), confirmed: () => false } }).you.find((y) => y.id === "repos:confirm");
  ok("found: asked once to confirm the list, not where it is", found2 && found2.fix === "repos" && found2.title === "I found 2 projects" && found2.sub === "symbiot, meridian" && found2.options[0] === "Looks right (recommended)", found2);
  ok("…and neither once that's done", !h.you.some((y) => y.kind === "setup"), h.you);
  const claude = { name: "Claude Code", tmpl: 'claude -p "{prompt}"' };
  let picked = null;
  const auto = homeState({ fresh: true, deps: { ...deps, agentCmd: () => "", pickAgent: () => claude, agentOff: () => false, setAgent: (t) => (picked = t) } });
  ok("no agent picked, one on this computer: Symbiot sets it, and Home doesn't ask", picked === claude.tmpl && !auto.you.some((y) => y.id === "setup:pick"), auto.you);
  const pk = homeState({ fresh: true, deps: { ...deps, agentCmd: () => "", pickAgent: () => claude, agentOff: () => true, setAgent: () => { throw new Error("set"); } } }).you.find((y) => y.id === "setup:pick");
  ok("…you cleared yours: \"Pick your agent\" on Home, not \"All handled\", one click for the one on this computer", pk && pk.kind === "setup" && pk.title === "Pick your agent" && /^Claude Code is on this computer: one click/.test(pk.sub) && pk.pick && pk.pick.tmpl === claude.tmpl && pk.focus === "agent" && pk.shape === "settings", pk);
  const pk2 = homeState({ fresh: true, deps: { ...deps, agentCmd: () => "", pickAgent: () => null, agentOff: () => false } }).you.find((y) => y.id === "setup:pick");
  ok("…none on this computer: it opens Settings, with no one-click pick", pk2 && !pk2.pick && /^no coding agent on this computer yet/.test(pk2.sub), pk2);
  ok("…and not once an agent is picked", !h.you.some((y) => y.id === "setup:pick"), "");
  ok("only you: an Approve that's waiting (not one still being worked on) and an agent's question", h.you.length === 2 && h.you[0].title === "Approve symbiot" && /2 tasks done · 3 files · only you decide/.test(h.you[0].sub) && h.you[1].title === "whatsapp_module asks" && h.you[1].shape === "agents", h.you);
  // symbiot, 19 Oct 2026: Approve committed at 08:12 and its tests ran till 08:30; all that time Home's card read
  // "2 tasks done · only you decide", and pressing it met "Already approving here"
  const shipping = { repo: "symbiot", path: "/x", tasks: [{}, {}], files: [], shipping: { step: "running its tests", since: Date.now() - 9 * 60000 } };
  const shipHome = homeState({ fresh: true, deps: { ...deps, pending: () => [shipping] } });
  ok("…not an Approve that's already being put in: nothing there for you to press", !shipHome.you.some((y) => y.kind === "approve"), shipHome.you);
  const shipFail = homeState({ fresh: true, deps: { ...deps, pending: () => [{ ...shipping, tasks: [], shipping: undefined, unsent: { why: "tests", branch: "symbiot/5-tasks" } }] } }).you.find((y) => y.id === "approve:symbiot");
  ok("…and once it ends without getting up, its card is back, saying why", shipFail && /not on GitHub yet/.test(shipFail.sub), shipFail);
  const asks = homeState({ fresh: true, deps: { ...deps, pending: () => [], agents: () => [{ name: "ops", path: "/o", status: "done", ask: { questions: [{ q: "Where should the garth@symbiot.co.za mailbox live?", options: ["👤 You (only you: a new account): sign up for Zoho Mail's free plan as Symbiot and sign in to domains.co.za in Symbiot's browser (recommended)", "🤖 Agent: wait"] }] } }, { name: "atlas", path: "/c", status: "done", ask: { questions: [{ q: "Paste the new Meta token?" }] } }] } }).you;
  const zc = asks.find((y) => y.title === "ops asks"), other = asks.find((y) => y.title === "atlas asks");
  ok("a card that asks you to sign in to a site carries it, for its Sign in button (the 'mythical browser', 2026-10-09); one that doesn't, doesn't", zc && zc.signInTo && zc.signInTo.site === "domains.co.za" && other && !other.signInTo, [zc && zc.signInTo, other && other.signInTo]);
  ok("feeds: only what has something new", h.feeds.length === 1 && h.feeds[0].title === "WhatsApp" && h.feeds[0].shape === "board", h.feeds);
  const clashed = homeState({ fresh: true, deps: { ...deps, clashes: () => [{ kind: "leave", severity: "high", text: "Lerato Khoza's annual leave Mon 12 Oct to Fri 16 Oct 2026 (~/Co/hr/leave.csv) covers the **VAT return** due Wed 14 Oct (~/Co/finance/STATUS.md)." }, { kind: "customer", severity: "high", text: "Acacia Mining's renewal date disagrees." }] } }).feeds[0];
  ok("a clash in your files that matters: first under Watching, opening the checks", clashed && clashed.id === "feed:clash" && clashed.title === "Where your files disagree" && clashed.sub === "2 clashes to look at" && clashed.count === 2 && clashed.shape === "settings" && /^Lerato Khoza's annual leave .*VAT return/.test(clashed.latest) && !/\*\*/.test(clashed.latest), clashed);
  ok("…and none without one", !homeState({ fresh: true, deps: { ...deps, clashes: () => [] } }).feeds.some((f) => f.id === "feed:clash"), "");
  ok("lanes and who's working", h.lanes[0].to === "ops" && h.working === 1, [h.lanes, h.working]);
  const blob = homeState({ fresh: true, deps: { ...deps, board: () => ({ cards: [] }), pending: () => [], repos: () => ({ "CallForge AI": "/cf" }), name: (p, n) => (p === "/cf" ? "Bookly" : n),
    agents: () => [{ name: "CallForge AI", path: "/cf", status: "done", ask: { questions: [{ q: "Rename the folder `CallForge AI` to `bookly`?", options: ["🤖 Agent: rename it (recommended)", "Keep the folder's name", "a third, never shown"] }, { q: "And the other?" }] } },
      { name: "Agent: Find the newest Kooha clip", path: join(HOME, ".config", "symbiot", "drafts", "act-c165d613"), status: "done", ask: { questions: [{ q: "which way?", options: [] }] } }] } });
  const cf = blob.you.find((y) => y.path === "/cf"), run = blob.you.find((y) => /act-c165d613/.test(y.id));
  ok("an ask carries its blob: the lane, its name as people say it, the question and its two options", cf && cf.repo === "CallForge AI" && cf.name === "Bookly" && /^Rename the folder/.test(cf.q) && cf.options.length === 2 && cf.more === 1 && cf.title === "CallForge AI asks", cf);
  ok("…an ops run's ask has no repo, and is named by what it's doing", run && run.repo === "" && run.name === "Find the newest Kooha clip" && !run.options.length, run);
  const wait = [{ status: "waiting", subject: "endpoint and secret" }];
  const blind = homeState({ fresh: true, deps: { ...deps, waits: () => wait, seesInbox: () => false } });
  ok("a reply is waited on and no inbox is watched (Email off too): only you can let it see your inbox", blind.you.some((y) => y.id === "setup:inbox" && y.title === "Let me see your inbox" && y.sub === "so I notice their reply" && y.shape === "settings"), blind.you);
  ok("…not once an inbox is watched or Email is on, and not with nothing waited on", !homeState({ fresh: true, deps: { ...deps, waits: () => wait, seesInbox: () => true } }).you.some((y) => y.id === "setup:inbox") && !homeState({ fresh: true, deps: { ...deps, waits: () => [{ status: "replied" }], seesInbox: () => false } }).you.some((y) => y.id === "setup:inbox"), "");
  const out = homeState({ fresh: true, deps: { ...deps, waits: () => wait, seesInbox: () => ({ sees: false, signedOut: ["Gmail"] }) } }).you.find((y) => y.id === "setup:inbox");
  ok("…the inbox watched but signed out: it says so, and asks you to sign in again", out && out.signin && out.title === "Sign in to Gmail again" && /signed out, so I won't notice their reply/.test(out.sub) && out.focus === "links", out);
  { // linked sites that signed out: no standing card (Pat, 2026-10-14); a run that needs one asks for it, with its Sign in button
    const L = () => ({ items: [{ id: "a", name: "Twilio", state: "signedout" }, { id: "b", name: "Azure", state: "signedout" }, { id: "c", name: "AWS", state: "signedout" }, { id: "d", name: "Brevo", state: "signedout" }, { id: "e", name: "GitHub", state: "ok" }] });
    const quiet = homeState({ fresh: true, deps: { ...deps, links: L } });
    ok("sites signed out that nothing is using: no card asking you to sign in to them", !quiet.you.some((y) => y.signin || /^Sign in/.test(y.title || "") || /signed out/.test(y.sub || "")), quiet.you);
  }
  ok("…not when another inbox (or Email) still sees it", !homeState({ fresh: true, deps: { ...deps, waits: () => wait, seesInbox: () => ({ sees: true, signedOut: ["Gmail"] }) } }).you.some((y) => y.id === "setup:inbox"), "");
  ok("no AI: urgent, first, saying Symbiot can't work without one", first.you[0].id === "setup:ai" && first.you[0].urgent && /can't work without one/.test(first.you[0].sub), first.you[0]);
  const down = homeState({ fresh: true, deps: { ...deps, agentGone: () => "claude", signedOut: () => [{ id: "gmail", name: "Gmail", connector: "claude.ai Gmail", ready: false }] } });
  const ag = down.you.find((y) => y.id === "setup:agent"), gm = down.you.find((y) => y.id === "setup:conn:gmail");
  ok("the agent gone from this computer: an urgent ask to reconnect it, opening its part of Settings", ag && ag.urgent && /claude isn't on this computer/.test(ag.sub) && ag.focus === "agent", ag);
  ok("…a linked site's connector signed out: an urgent Reconnect", gm && gm.urgent && gm.title === "Reconnect Gmail" && /signed out/.test(gm.sub), gm);
  ok("…and with all of it working, no status at all", !h.you.some((y) => y.urgent), h.you);
  const { homeAnswer, homeContext, workScene: ws3 } = await import("../home.mjs");
  const stuckT = [{ id: "2d8f4ec8", from: { lane: "ops", path: "/d/act-4e9461d3" }, text: "Needs a run that can read, edit and `git mv` in `/home/x/Company` (like ops run `act-1d727d7f`).\nMove the registers.", error: "ops is your own lane: do it yourself.", q: "Allow this run access to ~/Company?", options: ["Allow (recommended)", "Skip"], dirs: ["/home/x/Company"] }];
  const sth = homeState({ fresh: true, deps: { ...deps, pending: () => [], stuck: () => stuckT } });
  const sb = sth.you.find((y) => y.id === "stuck:2d8f4ec8");
  ok("a handover that couldn't start (ops handed itself ~/Company): a question blob on Home, Allow or Skip", sb && sb.kind === "ask" && sb.fix === "handover" && sb.q === "Allow this run access to ~/Company?" && sb.options.join() === "Allow (recommended),Skip" && sb.repo === "" && sb.name === "Agent runs" && /^Needs a run that can read, edit and git mv/.test(sb.sub) && /own lane/.test(sb.why), sb);
  ok("…and Home's talk counts it: not \"Only the user can do (0)\"", /^Only the user can do \(2\):[\s\S]*- An agent run is stuck: Needs a run.*\(asks: Allow this run access to ~\/Company\? Allow \(recommended\) \/ Skip\)$/m.test(homeContext(sth)), homeContext(sth).split("\n").slice(0, 3));
  const failedRun = (o = {}) => ({ id: "r1", name: "atlas", path: "/c", status: "failed", exitCode: 1, startedAt: Date.now() - 60000, endedAt: Date.now() - 1000, tail: "Working on it\nAPI Error: 529 overloaded", ask: { questions: [] }, ...o });
  const fr = homeState({ fresh: true, deps: { ...deps, pending: () => [], repos: () => ({ atlas: "/c" }), agents: () => [failedRun()] } }).you.find((y) => y.fix === "failed");
  ok("a run that ended in an error: a question on its lane, Run it again or Skip", fr && fr.id === "failed:r1" && fr.repo === "atlas" && /Its run stopped with an error: API Error: 529 overloaded\. Run it again\?/.test(fr.q) && fr.options[0] === "Run it again (recommended)", fr);
  const noFail = (agents) => !homeState({ fresh: true, deps: { ...deps, pending: () => [], repos: () => ({ atlas: "/c" }), agents } }).you.some((y) => y.fix === "failed");
  ok("…not a day later, not once another run started there, not when it asked a question instead", noFail(() => [failedRun({ endedAt: Date.now() - 2 * 86400000 })]) && noFail(() => [{ id: "r2", path: "/c", status: "running", ask: { questions: [] } }, failedRun()]) && noFail(() => [failedRun({ ask: { questions: [{ q: "Which key?" }] } })]), "");
  const calls = [];
  const ad = { allow: (id, o) => { calls.push(["allow", id, o.note]); return { ok: true, job: "j", dirs: [join(HOME, "Company")] }; }, skip: (id) => { calls.push(["skip", id]); return { ok: true }; } };
  const a1 = homeAnswer("stuck:2d8f4ec8", { pick: 0 }, ad), a2 = homeAnswer("stuck:2d8f4ec8", { pick: 1 }, ad), a3 = homeAnswer("stuck:2d8f4ec8", { text: "skip it, I did it" }, ad), a4 = homeAnswer("stuck:2d8f4ec8", { text: "yes, only the csvs" }, ad);
  ok("answering on the blob: Allow starts it (in ~/Company), Skip skips, your own words go ahead unless they say no", a1.ok && /allowed into ~\/Company/.test(a1.said) && a2.ok && a3.ok && a4.ok && JSON.stringify(calls) === JSON.stringify([["allow", "2d8f4ec8", ""], ["skip", "2d8f4ec8"], ["skip", "2d8f4ec8"], ["allow", "2d8f4ec8", "yes, only the csvs"]]), calls);
  const reran = [], fd = { agents: () => [failedRun()], running: () => false, run: (p, o) => { reran.push([p, o.force]); return { id: "j2" }; } };
  const r1 = homeAnswer("failed:r1", { pick: 0 }, fd);
  ok("…Run it again starts its agent again in its folder", r1.ok && r1.rerun === "j2" && JSON.stringify(reran) === JSON.stringify([["/c", true]]), [r1, reran]);
  homeAnswer("failed:r1", { pick: 1 }, fd);
  ok("…Skip: it stops asking", noFail(() => [failedRun()]), "");
  ok("…and an agent's own question is answered on its block, as before", !!homeAnswer("ask:/w", { pick: 0 }).error, "");
  // the launcher couldn't run (exit 126): Symbiot's fault, not "Run it again?", and Fix and start checks first
  const faultRun = () => failedRun({ id: "rf126", exitCode: 126, tail: "sh: 1: /home/u/.config/symbiot/claude-fallback: Permission denied" });
  const fy = homeState({ fresh: true, deps: { ...deps, pending: () => [], repos: () => ({ atlas: "/c" }), agents: () => [faultRun()] } }).you;
  const fc = fy.find((y) => y.fix === "fault");
  ok("a run whose launcher couldn't run: a Symbiot-fault card, never Run it again", fc && fc.id === "fault:rf126" && /fault in Symbiot/.test(fc.q) && /claude-fallback/.test(fc.q) && fc.options[0] === "Fix and start (recommended)" && !fy.some((y) => y.fix === "failed"), fy);
  ok("…and none once it started again by itself", !homeState({ fresh: true, deps: { ...deps, pending: () => [], repos: () => ({ atlas: "/c" }), agents: () => [{ ...faultRun(), relaunched: true }] } }).you.some((y) => y.fix === "fault" || y.fix === "failed"));
  const fRan = [], fdeps = { agents: () => [faultRun()], running: () => false, handoffCmd: () => "/x/claude-fallback -p x", run: (p) => { fRan.push(p); return { id: "j3" }; } };
  const stillBad = homeAnswer("fault:rf126", { pick: 0 }, { ...fdeps, ensureRunnable: () => ({ ok: false, path: "/x/claude-fallback", why: "it can't be made runnable" }) });
  ok("…Fix and start: still not runnable, it says why and starts nothing", stillBad.error && /can't be made runnable/.test(stillBad.error) && !fRan.length, stillBad);
  const fixed = homeAnswer("fault:rf126", { pick: 0 }, { ...fdeps, ensureRunnable: () => ({ ok: true, path: "/x/claude-fallback", fixed: true }) });
  ok("…runnable now, it starts the run", fixed.ok && fixed.rerun === "j3" && fRan.join() === "/c", fixed);
  // a permission card: Done writes the rules into the lane's allow list, a glob is never a file to look for
  const lane = join(HOME, "robin-lane"); mkdirSync(lane, { recursive: true });
  const permCard = { id: "pc1", path: lane, needs: { kind: "step", key: "k1", what: "👤 You (only you: a permission): allow `python3 -I -c` / `py_compile` on `v2/*.py`", check: "" } };
  const pran = [], settled = [], pd = { agents: () => [permCard], running: () => false, run: (p, o) => { pran.push(p); return { id: "j3" }; }, settle: (p, k) => settled.push(k) };
  const pa = homeAnswer("needs:pc1", { pick: 0 }, pd);
  const sl = JSON.parse(readFileSync(join(lane, ".claude", "settings.local.json"), "utf8")).permissions.allow;
  ok("Done on a permission card writes the allow rules itself (the glob v2/*.py isn't a rule or a file)", pa.ok && sl.includes("Bash(python3 -I -c:*)") && sl.includes("Bash(python3 -I -m py_compile:*)") && !sl.some((r) => /v2/.test(r)), [pa, sl]);
  ok("…closes the card and starts the agent, with no \"make the change yourself\"", settled[0] === "k1" && pran[0] === lane && !/make the change/i.test(pa.said), [settled, pran, pa]);
  const wideCard = { id: "pc2", path: lane, needs: { kind: "step", key: "k2", what: "👤 You (only you: a permission): allow `bash`", check: "" } };
  const wa = homeAnswer("needs:pc2", { pick: 0 }, { ...pd, agents: () => [wideCard] });
  ok("a permission too wide to write is refused plainly, and the card stays", !!wa.error && settled.length === 1, wa);

  // Next up: with nothing waiting on you, a few things that CAN be done next, each with its gain and one tap
  const { homeNext, nextUp, laneNamed, NEXT_FILE } = await import("../home.mjs");
  const NOW0 = Date.now(), DAYS = (n) => NOW0 - n * 86400000 - 60000; // a minute past the day: a slow run never reads 5 days as 4
  const nx = (o = {}) => ({ taken: () => ({}), parked: () => [], mind: () => [], stuck: () => [], board: () => ({ cards: [] }), reports: () => ({ count: 0 }), tasks: () => [], ...o });
  const calm = { ...deps, pending: () => [], agents: () => [], repos: () => ({ whatsapp_module: "/wa", atlas: "/c" }), board: () => ({ cards: [] }) };
  const busyNext = nx({
    reports: () => ({ count: 8 }),
    stuck: (o) => (o && o.within > 3 * 86400000 ? [{ id: "h1", from: { lane: "symbiot", path: "/s" }, text: "Move ~/Company's registers\nmore", error: "ops is your own lane: do it yourself.", at: DAYS(5) }] : []),
    tasks: () => [{ id: "t1", text: "Wire the webhook", repo: "atlas", ts: DAYS(9) }, { id: "t2", text: "And its test", repo: "atlas", ts: DAYS(1) }, { id: "t3", text: "Read the WhatsApp module's group and summarise it", repo: "", ts: DAYS(2) }, { id: "t4", text: "Fresh one", repo: "whatsapp_module", ts: DAYS(0.5) }],
    board: () => ({ cards: [{ id: "w9", name: "Inbox - me@x.co - Mail", source: "mail", label: "4 emails", count: 4, items: [{ id: "n1", need: true }, { id: "n2", need: true }, { id: "n3", need: false }, { id: "n4", need: true }, { id: "n5", need: true }] }, { id: "p1", name: "A page", source: "page", label: "2 new", count: 2 }] }),
  });
  const hx = homeState({ fresh: true, deps: { ...calm, next: busyNext } });
  const ids = hx.next.map((s) => s.id);
  ok("nothing needs you: Home suggests what can be done next, best first, at most 5", hx.you.length === 0 && ids.join() === "next:reports,next:retry:h1,next:go:atlas,next:float:t3,next:drafts:w9", ids);
  const byId = Object.fromEntries(hx.next.map((s) => [s.id, s]));
  ok("…each with its gain and time spelled out, and one tap (a label)", hx.next.every((s) => s.title && s.gain && s.time && s.label && s.act), hx.next);
  ok("…unread reports: triage them, ~10 min for 8, by an agent", byId["next:reports"].title === "Triage the 8 unread reports" && /clears the backlog/.test(byId["next:reports"].gain) && byId["next:reports"].time === "~10 min, by an agent" && byId["next:reports"].act === "agent", byId["next:reports"]);
  ok("…a handover that errored days ago and was left: retry it (Home's own asks only look back 3 days)", byId["next:retry:h1"].act === "retry" && /^Retry symbiot's handover: Move ~\/Company's registers$/.test(byId["next:retry:h1"].title) && /errored 5 days ago \(ops is your own lane/.test(byId["next:retry:h1"].gain), byId["next:retry:h1"]);
  ok("…a project's tasks waiting days with nothing at work there (not one added today)", byId["next:go:atlas"].title === "Send atlas's 2 waiting tasks to its agent" && /oldest has waited 9 days/.test(byId["next:go:atlas"].gain) && !ids.includes("next:go:whatsapp_module"), byId["next:go:atlas"]);
  ok("…a task with no project goes to the project its words name", byId["next:float:t3"].act === "assign" && byId["next:float:t3"].repo === "whatsapp_module" && /^Give whatsapp_module "Read the WhatsApp/.test(byId["next:float:t3"].title), byId["next:float:t3"]);
  ok("…new mail with no reply: drafts of the newest 3, unsent (not a plain page)", /^Draft replies to the newest 3 of the 4 emails on Inbox$/.test(byId["next:drafts:w9"].title) && /unsent/.test(byId["next:drafts:w9"].gain), byId["next:drafts:w9"]);
  ok("a task's words name its lane, the longest name that fits, whole words only", laneNamed("fix the whatsapp module webhook", ["whatsapp_module", "whatsapp"]) === "whatsapp_module" && laneNamed("read whatsapp", ["whatsapp_module", "whatsapp"]) === "whatsapp" && laneNamed("coralreef", ["atlas"]) === "", "");
  const busyRun = nextUp({ map: { atlas: "/c" }, list: [{ path: "/c", status: "running" }], deps: nx({ tasks: () => [{ id: "t1", text: "x", repo: "atlas", ts: DAYS(9) }] }) });
  const parkedNx = nextUp({ map: { atlas: "/c" }, deps: nx({ parked: () => ["/c"], tasks: () => [{ id: "t1", text: "x", repo: "atlas", ts: DAYS(9) }] }) });
  ok("…not a project whose agent is at work, nor a parked one", !busyRun.length && !parkedNx.length, [busyRun, parkedNx]);
  const dec = (text, ts = DAYS(1)) => [{ id: "dn1", name: "Symbiot", kind: "decision", facts: [{ text, ts }] }];
  const dn1 = nextUp({ map: { symbiot: "/s" }, deps: nx({ mind: () => dec("The user wants Symbiot's weekly report emailed every Friday") }) });
  ok("a decision you made lately that no task carries yet: make it a task, in the project it names", dn1.length === 1 && dn1[0].act === "task" && dn1[0].repo === "symbiot" && /^Make a task of what you decided: The user wants Symbiot's weekly report/.test(dn1[0].title), dn1);
  const dn2 = nextUp({ map: {}, deps: nx({ mind: () => dec("The user wants Symbiot's weekly report emailed every Friday"), tasks: () => [{ id: "x", text: "Email Symbiot's weekly report every Friday", done: true }] }) });
  const dn3 = nextUp({ map: {}, deps: nx({ mind: () => dec("~/Company is a test set the user made") }) });
  const dn4 = nextUp({ map: {}, deps: nx({ mind: () => dec("The user wants the weekly report emailed", DAYS(30)) }) });
  ok("…not once a task took it on (even a done one), not a fact about how things are, not an old one", !dn2.length && !dn3.length && !dn4.length, [dn2, dn3, dn4]);
  ok("…and no suggestions at all while anything waits on you", homeState({ fresh: true, deps: { ...deps, next: busyNext } }).next.length === 0, "");
  ok("…nor with nothing to suggest", homeState({ fresh: true, deps: { ...calm, next: nx({ tasks: () => [{ id: "x", text: "Done one", repo: "atlas", done: true }] }) } }).next.length === 0, "");
  // someone new: projects found, no task yet anywhere (first-run review, 19 Oct 2026: Home said "Nothing needs you" and showed none of them)
  const firstNx = homeState({ fresh: true, deps: { ...calm, next: nx({ touched: (d) => (d === "/c" ? 2 : 1) }) } }).next;
  ok("someone new, projects but not one task: their agent looks over the one worked on last, and suggests what to do first", firstNx.length === 1 && firstNx[0].id === "next:first:atlas" && firstNx[0].act === "first" && /^Have your agent look over atlas and suggest what to do first$/.test(firstNx[0].title) && /changes nothing/.test(firstNx[0].gain) && firstNx[0].label, firstNx);
  const firstOff = [nextUp({ map: { marketing: "/m", ops: "/o" }, deps: nx() }), nextUp({ map: { atlas: "/c" }, deps: nx({ taken: () => ({ "next:first:atlas": Date.now() }) }) }), nextUp({ map: { atlas: "/c" }, deps: nx({ reports: () => ({ count: 2 }) }) }).filter((x) => x.act === "first")];
  ok("…not for the marketing or ops lanes, not again once taken, and not beside anything else to do", firstOff.every((x) => !x.length), firstOff);
  ok("Home's talk knows them", /^Could be done next \(Home suggests these, one tap each\):\n- Triage the 8 unread reports: clears the backlog/m.test(homeContext(hx)), "");
  // one tap: it starts the agent, or makes the task, and stays away a week
  const did = [], nfile = join(HOME, "next-test.json");
  const tap = (id, o = {}) => homeNext(id, { state: hx, file: nfile, repos: () => ({ atlas: "/c", whatsapp_module: "/wa" }), act: (req, o2) => { did.push(["act", req.split("\n")[0], o2.title]); return { ok: true, job: "j", dir: "/d" }; }, run: (p) => { did.push(["run", p]); return { id: "j" }; }, push: (f) => { did.push(["push", f.repo]); return { written: [{ path: "/c" }] }; }, allow: (id2) => { did.push(["allow", id2]); return { ok: true }; }, draft: (nid) => { did.push(["draft", nid]); return { ok: true }; }, board: busyNext.board, ...o });
  const tr = tap("next:reports", { reportsList: () => [{ title: "symbiot post: the 4-week test", lane: "symbiot", file: "/s/.symbiot/POST-TEST.md", new: true }, { title: "Old", file: "/o.md", new: false }] });
  ok("Triage: an agent of its own, told which reports (the unread ones) and to leave one page", tr.ok && did[0][0] === "act" && did[0][1] === "Triage the user's 1 unread Symbiot reports, so they read one page instead of 1. Read each:" && did[0][2] === "Home: what's next", [tr, did]);
  did.length = 0; const tg = tap("next:go:atlas");
  ok("Send to its agent: the project's tasks written for it, and its agent started", tg.ok && JSON.stringify(did) === JSON.stringify([["push", "atlas"], ["run", "/c"]]), did);
  did.length = 0; const saved = []; const ta = tap("next:float:t3", { tasks: () => [{ id: "t3", text: "Read the WhatsApp module's group", repo: "" }], save: (all) => saved.push(all[0].repo) });
  ok("Give it a project: the task joins it, and that project's agent starts", ta.ok && saved.join() === "whatsapp_module" && JSON.stringify(did) === JSON.stringify([["push", "whatsapp_module"], ["run", "/wa"]]), [ta, did, saved]);
  did.length = 0; const tt = tap("next:retry:h1");
  ok("Retry: the handover runs on its own, and goes back to the agent that asked", tt.ok && JSON.stringify(did) === JSON.stringify([["allow", "h1"]]) && /goes back to the agent that asked/.test(tt.said), [tt, did]);
  did.length = 0; const td = tap("next:drafts:w9");
  ok("Draft replies: the newest 3 that need one, each drafted and left unsent", td.ok && JSON.stringify(did) === JSON.stringify([["draft", "n1"], ["draft", "n2"], ["draft", "n4"]]) && /drafting 3 replies.*unsent/.test(td.said), [td, did]);
  did.length = 0; const tf = homeNext("next:first:atlas", { state: { next: firstNx, nextAll: firstNx }, file: nfile, repos: () => ({ atlas: "/c" }), task: (text, repo) => { did.push(["task", repo, text]); return { ok: true }; }, run: (p) => { did.push(["run", p]); return { id: "j" }; }, push: (f) => { did.push(["push", f.repo]); return { written: [{ path: "/c" }] }; } });
  ok("Look it over: a task in that project saying change nothing and leave ideas as Suggestions, then its agent starts", tf.ok && did[0][0] === "task" && did[0][1] === "atlas" && /Change no files/.test(did[0][2]) && /## Suggestions/.test(did[0][2]) && JSON.stringify(did.slice(1)) === JSON.stringify([["push", "atlas"], ["run", "/c"]]) && /looking over atlas\. Its ideas show on the Workdesk/.test(tf.said), [tf, did]);
  const taken = JSON.parse(readFileSync(nfile, "utf8")).taken;
  ok("…each one taken stays away a week", ["next:reports", "next:go:atlas", "next:float:t3", "next:retry:h1", "next:drafts:w9"].every((k) => taken[k] > 0) && nextUp({ map: { atlas: "/c" }, deps: nx({ taken: () => taken, reports: () => ({ count: 8 }), tasks: () => [{ id: "t1", text: "x", repo: "atlas", ts: DAYS(9) }] }) }).length === 0, taken);
  const te = tap("next:go:atlas", { push: () => ({ written: [] }) }), tn = tap("next:nope");
  ok("…and when it can't start, it says why; one that isn't there any more says so", /Nothing of atlas's is waiting/.test(te.error) && /isn't here any more/.test(tn.error), [te, tn]);
  ok("the taken ones are kept in the config folder", NEXT_FILE.endsWith(join(".config", "symbiot", "home-next.json")), NEXT_FILE);
  // a run that ended waiting on you (agents.mjs needsOf): before, Home said "Only the user can do (0)"
  const jonoDir = join(HOME, ".config", "symbiot", "drafts", "act-remy"); mkdirSync(join(jonoDir, ".symbiot"), { recursive: true });
  const waitsRun = (o = {}) => ({ id: "r5", name: "Agent: **What's needed:** draft the email to Remy", path: jonoDir, status: "done", ask: { questions: [] }, needs: { kind: "approve", what: "The draft isn't sent. Draft: it's in Gmail, to remy@example.com.", check: "Cc: You'll add Alex yourself.", label: "Draft", key: "k1" }, ...o });
  const hn = homeState({ fresh: true, deps: { ...deps, pending: () => [], agents: () => [waitsRun()] } }), nb = hn.you.find((y) => y.fix === "needs");
  ok("a run that ended with a draft for your OK: on Home, with what to check first, Go ahead or Skip", nb && nb.id === "needs:r5" && nb.kind === "ask" && nb.repo === "" && nb.title === "Draft the email to Remy waits for your OK" && nb.q === "The draft isn't sent. Draft: it's in Gmail, to remy@example.com. Check first: Cc: You'll add Alex yourself." && nb.options.join() === "Go ahead (recommended),Skip", nb);
  ok("…and Home's talk counts it", /^Only the user can do \([1-9]\):[\s\S]*- Draft the email to Remy waits for your OK: Draft \(asks: The draft isn't sent/m.test(homeContext(hn)), homeContext(hn).split("\n").slice(0, 3));
  const st5 = homeState({ fresh: true, deps: { ...deps, pending: () => [], agents: () => [waitsRun({ needs: { kind: "step", what: "Running tailscale needs sudo, and only you can do that.", check: "", label: "", key: "k2" } })] } }).you.find((y) => y.fix === "needs");
  ok("…a step only you can take: says it waits on you, and offers I-have-done-this (not marked recommended, which read as already done) or Skip", st5 && st5.title === "Draft the email to Remy needs you" && st5.q === "Running tailscale needs sudo, and only you can do that." && st5.options.join() === "I've done this,Skip" && st5.status === "Waiting on you" && !st5.options.some((o) => /recommended/i.test(o)), st5);
  const noNeeds = (agents) => !homeState({ fresh: true, deps: { ...deps, pending: () => [], agents } }).you.some((y) => y.fix === "needs");
  ok("…not while an agent works there, nor when it asked in QUESTIONS.md (that's its question)", noNeeds(() => [{ id: "r6", path: jonoDir, status: "running", ask: { questions: [] } }, waitsRun()]) && noNeeds(() => [waitsRun({ ask: { questions: [{ q: "Send the draft to Remy?" }] } })]), "");
  const reran5 = [], settled5 = [], nd = { agents: () => [waitsRun()], running: () => false, run: (p, o) => { reran5.push([p, o.force]); return { id: "j5" }; }, settle: (p, k) => settled5.push([p, k]) };
  const g5 = homeAnswer("needs:r5", { pick: 0 }, nd), ans5 = readFileSync(join(jonoDir, ".symbiot", "ANSWERS.md"), "utf8");
  ok("…Go ahead: its agent goes ahead, told so in its ANSWERS.md, and it stops asking", g5.ok && g5.rerun === "j5" && JSON.stringify(reran5) === JSON.stringify([[jonoDir, true]]) && /### The draft isn't sent\. Draft: it's in Gmail, to remy@example\.com\.\nGo ahead: do it as you had it/.test(ans5) && JSON.stringify(settled5) === JSON.stringify([[jonoDir, "k1"]]), [g5, reran5, ans5, settled5]);
  const stepRun = () => waitsRun({ id: "r10", needs: { kind: "step", what: "Sign in to npmjs.com as pat in the Symbiot Browser.", check: "", label: "", key: "k10" } });
  homeAnswer("needs:r10", { pick: 0 }, { agents: () => [stepRun()], running: () => false, run: () => ({ id: "j10" }), settle: () => {} });
  ok("…I've done this on a step is on the shared record: no agent's card asks it again", noNeeds(() => [stepRun()]), "");
  const s5 = homeAnswer("needs:r5", { text: "skip, I sent it" }, nd);
  ok("…Skip (or your words saying no): it stops asking, and no agent starts", s5.ok && /won't ask again/.test(s5.said) && reran5.length === 1 && settled5.length === 2, [s5, reran5, settled5]);
  // answered while Approve was committing and testing that lane: "It didn't start. Check your agent in Settings." (bookly, 16 Oct 2026)
  const later11 = [], settled11 = [], shipRun = waitsRun({ id: "r11", needs: { kind: "approve", what: "Send the test invite.", check: "", label: "", key: "k11" } });
  const sh11 = homeAnswer("needs:r11", { pick: 0 }, { agents: () => [shipRun], running: () => false, run: () => ({ busy: true, shipping: true, step: "running its tests", id: "" }), settle: (p, k) => settled11.push(k), later: (p) => later11.push(p) });
  ok("…answered while Approve puts that lane's changes in: saved, it says so (not \"check your agent\"), stops asking, and its agent starts once Approve is done", sh11.ok && /Approve is still putting this lane's changes in \(running its tests\)/.test(sh11.said) && !/Settings/.test(sh11.said) && settled11.join() === "k11" && later11.join() === jonoDir, [sh11, settled11, later11]);
  const laterF = [], shF = homeAnswer("failed:r1", { pick: 0 }, { agents: () => [failedRun()], running: () => false, run: () => ({ busy: true, shipping: true, step: "pushing", id: "" }), later: (p) => laterF.push(p) });
  ok("…and Run it again on a failed run, the same", shF.ok && /runs again once that's done/.test(shF.said) && laterF.join() === "/c", [shF, laterF]);
  // Done it on a step naming a file: a run was told "Done: the user did it" while the `.env` it named was last changed days before it asked
  const envDir = join(HOME, "projects", "envlane"), envF = join(envDir, ".env"), envEnd = Date.parse("2026-10-12T05:00:00Z"); mkdirSync(join(envDir, ".symbiot"), { recursive: true });
  writeFileSync(envF, "A=1\n"); utimesSync(envF, new Date("2026-10-06T09:00:00Z"), new Date("2026-10-06T09:00:00Z"));
  const envRun = { id: "r10", name: "envlane", path: envDir, status: "done", endedAt: envEnd, ask: { questions: [] }, needs: { kind: "step", what: "Paste your Meta token into `.env` as META_TOKEN.", check: "", label: "", key: "k10" } };
  const reran10 = [], ed = { agents: () => [envRun], running: () => false, run: (p) => { reran10.push(p); return { id: "j10" }; }, settle: () => {} };
  const d10 = homeAnswer("needs:r10", { pick: 0 }, ed);
  ok("…Done it, but the file the step names hasn't changed since the run asked: not done yet, no agent starts, and it says when it last changed", d10.error && /^\.env was last changed on 2026-10-06, before its agent asked/.test(d10.error) && /press Done it again, or say how you did it/.test(d10.error) && reran10.length === 0, d10);
  const w10 = homeAnswer("needs:r10", { text: "put it in the shell profile instead" }, ed), ans10 = readFileSync(join(envDir, ".symbiot", "ANSWERS.md"), "utf8");
  ok("…said in your own words (done some other way): its agent starts, told the file hasn't changed so it checks", w10.ok && reran10.length === 1 && /The user says it's done \(put it in the shell profile instead\), but `\.env` was last changed on 2026-10-06, before you asked\. Check it yourself/.test(ans10), [w10, ans10]);
  utimesSync(envF, new Date(envEnd + 60000), new Date(envEnd + 60000));
  const c10 = homeAnswer("needs:r10", { pick: 0 }, ed), ans10b = readFileSync(join(envDir, ".symbiot", "ANSWERS.md"), "utf8");
  ok("…changed after the run asked: Done goes ahead as before", c10.ok && reran10.length === 2 && /Done: the user did it\. Check it worked/.test(ans10b), [c10, ans10b.slice(-200)]);
  ok("…and a step that names no file goes ahead as before", homeAnswer("needs:r10", { pick: 0 }, { ...ed, agents: () => [{ ...envRun, needs: { ...envRun.needs, what: "Run tailscale up with sudo." } }] }).ok && reran10.length === 3, reran10);
  // Done it on a step that needs a release not installed here: "once 0.65.2 is installed, sign in…" was passed on as done while 0.65.1 ran (2026-10-14)
  const relRun = { ...envRun, needs: { ...envRun.needs, what: "Once 0.65.2 is installed, sign in at cp.smsportal.com." } }, relOut = { name: "symbiot", needs: "0.65.2", installed: "0.65.1" };
  const r10 = homeAnswer("needs:r10", { pick: 0 }, { ...ed, agents: () => [relRun], releaseNotIn: () => relOut });
  ok("…Done it on a step that needs a release not installed here: not done yet, saying which, and no agent starts", r10.error && /needs symbiot 0\.65\.2, and 0\.65\.1 is installed here/.test(r10.error) && reran10.length === 3, r10);
  ok("…once it's installed, Done goes ahead", homeAnswer("needs:r10", { pick: 0 }, { ...ed, agents: () => [relRun], releaseNotIn: () => null }).ok && reran10.length === 4, reran10);
  const pj = ws3({ deps: { repos: () => ({}), pending: () => [], tasks: () => [], parked: () => [], agents: () => [waitsRun({ id: "r8" })], stuck: () => [] } }).projects.find((p) => p.repo === "ops");
  ok("…and on its lane in Tasks: lit, the OK first, answerable there", pj && pj.lit && pj.qs[0].fix === "needs" && pj.qs[0].id === "needs:r8", pj);
  const wsS = ws3({ deps: { repos: () => ({ atlas: "/c" }), pending: () => [], tasks: () => [], parked: () => [], agents: () => [failedRun({ id: "r9" })], stuck: () => stuckT } });
  const pc = wsS.projects.find((p) => p.repo === "atlas"), po = wsS.projects.find((p) => p.repo === "ops");
  ok("on its lane in Tasks too: the project lit, the question first, answerable there", pc && pc.lit && pc.asks === 1 && pc.qs[0].fix === "failed" && pc.qs[0].id === "failed:r9" && po && po.lit && po.qs[0].q === "Allow this run access to ~/Company?" && po.qs[0].id === "stuck:2d8f4ec8", [pc, po]);
  const { agentMissing } = await import("../agents.mjs");
  ok("the agent's program: found on PATH, or named when it isn't", agentMissing('node -e "{prompt}"') === "" && agentMissing('no-such-agent-xyz -p "{prompt}"') === "no-such-agent-xyz" && agentMissing('FOO=1 no-such-agent-xyz "{prompt}"') === "no-such-agent-xyz" && agentMissing("/nowhere/agent {dir}") === "/nowhere/agent" && agentMissing("") === "", "");
  const { firstSteps } = await import("../home.mjs");
  const fsd = { connected: () => true, repos: () => ({ a: "/a" }), cmd: () => "claude -p {prompt}", knowledge: () => ({ folders: [] }), phone: () => ({ phones: [] }), links: () => ({ items: [{ id: "gmail", name: "Gmail", state: "ok" }] }) };
  const f1 = firstSteps({ deps: { ...fsd, connectors: () => ({ claude: true, links: [{ id: "gmail", name: "Gmail", connector: "claude.ai Gmail", ready: true }] }) } });
  ok("first steps, in order: an AI, where your work is, your agent, one site, a company folder and your phone (both optional)", f1.steps.map((s) => s.id).join() === "ai,work,agent,site,company,phone" && f1.steps.slice(0, 4).every((s) => s.done) && !f1.steps[4].done && f1.steps[4].optional && !f1.steps[5].done && f1.steps[5].optional && !f1.done, f1.steps);
  ok("…the linked site says agent runs can use it, through Claude's connector", /Gmail linked\. Agent runs can use it too, through Claude's claude\.ai Gmail connector/.test(f1.steps[3].sub), f1.steps[3].sub);
  const f2 = firstSteps({ deps: { ...fsd, connectors: () => ({ claude: true, links: [{ id: "gmail", name: "Gmail", connector: "", ready: false }] }) } });
  ok("…or that they can't yet, and the one step that's yours", /can't use it yet: connect Gmail in claude\.ai/.test(f2.steps[3].sub), f2.steps[3].sub);
  const f3 = firstSteps({ deps: { connected: () => false, repos: () => ({}), cmd: () => "", knowledge: () => ({ folders: [] }), links: () => ({ items: [{ id: "x", state: "off" }] }), connectors: () => ({}) } });
  ok("…each ticks itself from what's set up: nothing yet, none ticked", f3.steps.every((s) => !s.done), f3.steps);
  ok("…and all done (the company folder and a paired phone too) says so", firstSteps({ deps: { ...fsd, knowledge: () => ({ folders: [{}] }), phone: () => ({ phones: [{ name: "Pixel" }] }), connectors: () => ({ claude: true, links: [] }) } }).done, "");
  let sys = "", prm = "";
  const hr = await homeAsk("what needs me?", { state: h, ask: async (s2, p2) => { sys = s2; prm = p2; return JSON.stringify({ reply: "The symbiot Approve and whatsapp_module's question.", do: null, remember: [] }); } });
  ok("home's talk is the same Symbiot, told what home shows", hr.answer === "The symbiot Approve and whatsapp_module's question." && /You are Symbiot, the one assistant/.test(sys) && /Approve symbiot/.test(prm) && /whatsapp_module asks/.test(prm), hr);
  ok("…and in their style (the voice line ends the prompt: the system prompt stays the same from turn to turn, for caching)", /Match how they talk/.test(prm) && !/Match how they talk/.test(sys), prm.slice(-200));
  ok("an empty question isn't sent", (await homeAsk("  ")).error === "empty", "");
  // a screenshot dropped into the talk: the model gets the picture, and the words say so
  const shot = join(HOME, "shot.png"); writeFileSync(shot, Buffer.from("89504e470d0a1a0a", "hex"));
  let seen = null, sprm = "";
  const sr = await homeAsk("", { state: h, images: [shot], ask: async (s2, p2, o2) => { seen = o2; sprm = p2; return JSON.stringify({ reply: "I see it.", do: null, remember: [] }); } });
  ok("a screenshot alone is a question, and the model is sent the image", sr.answer === "I see it." && seen && seen.images && seen.images.length === 1 && seen.images[0].mime === "image/png" && seen.images[0].data === Buffer.from("89504e470d0a1a0a", "hex").toString("base64"), seen);
  ok("…and told it can see it", /attached 1 screenshot/.test(sprm), sprm.slice(-200));
  ok("…no screenshot, no image sent", (await homeAsk("hi", { state: h, ask: async (s2, p2, o2) => { seen = o2; return JSON.stringify({ reply: "hi", do: null, remember: [] }); } })) && !seen, seen);

  console.log("THE RELAY — Agents on the Tasks screen: what each project's agent did, asks and suggests");
  {
    const { workScene: ws2 } = await import("../home.mjs");
    const now = Date.now();
    const r = ws2({ deps: {
      agents: () => [
        { name: "bookly", path: "/d", status: "done", startedAt: now - 3600e3, work: { final: "I read the **lead** code.\n\nMore detail here." }, ask: { questions: [{ q: "Who gets each yes?", options: ["one brokerage (recommended)", "book on the first call", "a third", "a fourth"] }], suggestions: [{ text: "Fix the exhausted-campaign dead end" }, { text: "Already added", added: true }] } },
        { name: "symbiot", path: "/s", status: "running", elapsed: 60e3, work: { doing: "Ran npm test", todos: [{ status: "in_progress", active: "Editing ui.mjs" }] }, ask: { questions: [] } },
        { name: "ancient", path: "/a", status: "done", elapsed: 9 * 86400e3, work: { final: "old news" }, ask: { questions: [] } }],
      pending: () => [], tasks: () => [], repos: () => ({ bookly: "/d", symbiot: "/s", ancient: "/a" }), name: (p, n) => n, parked: () => [] } });
    const d = r.projects.find((p) => p.repo === "bookly") || {}, sy = r.projects.find((p) => p.repo === "symbiot") || {};
    ok("a project's summary is its agent's last word, first paragraph, plain (no markdown)", d.summary === "I read the lead code." && d.state === "asks you", d);
    ok("its open question comes with up to 3 answers and the folder to send the answer to", d.qs && d.qs[0].q === "Who gets each yes?" && d.qs[0].options.length === 3 && d.qs[0].path === "/d", d.qs);
    ok("the extra tasks it suggests, not the ones already added", d.ideas && d.ideas.length === 1 && d.ideas[0].full === "Fix the exhausted-campaign dead end" && d.ideas[0].repo === "bookly" && d.ideas[0].path === "/d", d.ideas);
    ok("a running agent's card has a now line, the to-do it's on with how long it's taken (from elapsed), and the At work pill", /^Editing ui\.mjs · 1m$/.test(sy.now || "") && !sy.summary && sy.pill === "At work", sy);
    ok("a project with nothing new in a day, and nothing asked or suggested, isn't relayed", !r.projects.some((p) => p.repo === "ancient"), r.projects.map((p) => p.repo));
  }
  console.log("WORK SCENE — plain words for what's at work, waiting and ready; Go starts it");
  const { workScene, workGo } = await import("../home.mjs");
  const ws = workScene({ deps: {
    agents: () => [{ name: "symbiot", path: "/s", status: "running", progress: { done: 1, total: 3 }, work: { todos: [{ status: "completed", text: "a", active: "A" }, { status: "in_progress", text: "Fix the reader", active: "Fixing the **WhatsApp** reader" }] }, ask: { questions: [] } },
      { name: "atlas", path: "/c", status: "running", work: { doing: "Ran npm test", todos: [] }, ask: { questions: [{ q: "Ship the atlas fix?" }] } }, { name: "old", path: "/o", status: "done" }],
    pending: () => [{ repo: "ChatApp", path: "/g", tasks: [{}, {}], files: [{}] }, { repo: "busy", path: "/b", running: true, tasks: [{}] }],
    tasks: () => [{ id: "1", text: "Add a Skip button to each idea in the Agents tab, so you can turn down an idea you don't want", repo: "symbiot" }, { id: "2", text: "Merge near-duplicates", repo: "whatsapp_module" }, { id: "3", text: "done one", repo: "x", done: true }, { id: "4", text: "no repo", repo: "" }],
  } });
  ok("at work: what each agent is doing, in its own plain words (no markdown, a command as what it is for), with progress", ws.running.length === 2 && ws.running[0].doing === "Fixing the WhatsApp reader" && ws.running[0].progress.done === 1 && ws.running[1].doing === "Running the tests" && ws.running[1].waiting, ws.running);
  ok("ready for your OK: only what's waiting on an Approve, not what's still being worked on", ws.ready.length === 1 && ws.ready[0].repo === "ChatApp" && ws.ready[0].count === 2, ws.ready);
  ok("waiting: open tasks with a repo, short, and marked when their repo's agent is busy", ws.waiting.length === 2 && ws.waiting[0].text.length <= 160 && ws.waiting[0].text.startsWith("Add a Skip button") && ws.waiting[0].busy && !ws.waiting[1].busy && ws.canGo === 1, ws.waiting);
  const started = [];
  const g = workGo({ push: () => ({ written: [{ name: "a", path: "/a" }, { name: "b", path: "/b" }] }), run: (p) => (started.push(p), p === "/a" ? { id: "j1" } : { busy: true }) });
  ok("Go: every repo's brief written and its agent started, or queued behind one already there", g.started === 1 && g.queued === 1 && started.join() === "/a,/b" && g.repos.join() === "a,b", g);
  ok("projects: each repo with work on it, with what's waiting and what's ready", ws.projects.length === 4 && ws.projects.some((p) => p.repo === "symbiot" && p.running && p.waiting === 1) && ws.projects.some((p) => p.repo === "ChatApp" && p.ready === 2) && ws.projects.some((p) => p.repo === "whatsapp_module" && p.waiting === 1 && !p.running), ws.projects);
  ok("…what needs you first (a question, an Approve: lit), then the one an agent is in, then what waits", ws.projects.map((p) => p.repo).join() === "atlas,ChatApp,symbiot,whatsapp_module" && ws.projects[0].lit && ws.projects[0].asks === 1 && ws.projects[1].lit && !ws.projects[2].lit, ws.projects.map((p) => [p.repo, p.lit]));
  const RUNDIR = join(HOME, ".config", "symbiot", "drafts");
  const wr = workScene({ deps: { repos: () => ({ symbiot: "/s" }), name: (p, n) => (n === "symbiot" ? "Symbiot" : n), pending: () => [], tasks: () => [],
    agents: () => [{ name: "Agent: Find the newest Kooha clip", path: join(RUNDIR, "act-c165d613"), status: "done", ask: { questions: [{ q: "which way?" }] } }, { name: "Agent: tidy ~/Company", path: join(RUNDIR, "act-1d727d7f"), status: "running", work: {} }, { name: "symbiot", path: "/s", status: "running", work: {} }] } });
  const ops = wr.projects.find((p) => p.repo === "ops");
  ok("ops runs (act-…) are one lane, Agent runs, not a sphere each named by an id", wr.projects.length === 2 && ops && ops.name === "Agent runs" && ops.runs === 1 && ops.asks === 1 && ops.lit && wr.projects[0] === ops, wr.projects);
  ok("…and a repo is shown by the name people use for it", wr.projects.find((p) => p.repo === "symbiot").name === "Symbiot", wr.projects);
  const wm = workScene({ deps: { repos: () => ({}), pending: () => [], tasks: () => [],
    agents: () => [{ name: "Agent: Adds to run act-49963706 (the phone code check)", path: join(RUNDIR, "act-ab2bbaf1"), status: "done", startedAt: Date.now() - 60000, work: { final: "The phone code check is still not done." } },
      { name: "Agent: New job: the Bookly broker test on Pat's own phone", path: join(RUNDIR, "act-83eb4b9c"), status: "done", startedAt: Date.now() - 600000, work: { final: "Waiting on your press of Set up a meeting." }, ask: { questions: [{ q: "Press Set up a meeting on WhatsApp?" }] } }] } });
  const om = wm.projects.find((p) => p.repo === "ops");
  ok("Agent runs' card: its line is from the run whose question it shows, and the question says which job (not the newest run's line over another's question)", om && om.summary === "Waiting on your press of Set up a meeting." && om.qs[0].task === "the Bookly broker test on Pat's own phone" && om.path === join(RUNDIR, "act-83eb4b9c"), om);
  const wk = workScene({ deps: { repos: () => ({}), pending: () => [], tasks: () => [],
    agents: () => [{ name: "Agent: New job: the Render security check", path: join(RUNDIR, "act-cae4cbb3"), status: "done", startedAt: Date.now() - 60000, work: { final: "The Render check is still blocked." } },
      { name: "Agent: New job: the phone code check", path: join(RUNDIR, "act-1014d60a"), status: "running", startedAt: Date.now() - 3 * 3600e3, work: {} },
      { name: "Agent: tidy ~/Company", path: join(RUNDIR, "act-1d727d7f"), status: "running", startedAt: Date.now() - 60000, work: {} }] } });
  const ok2 = wk.projects.find((p) => p.repo === "ops");
  ok("Agent runs' card at work: what the running run is doing by name, never a finished run's last words under Working (27 Oct 2026)", ok2 && ok2.pill === "At work" && !ok2.summary && ok2.now === "Working on: the phone code check · 3h (and 1 more at work)", ok2);
  {
    const mk = (final, why) => workScene({ deps: { repos: () => ({ bookshop: "/dl" }), pending: () => [], tasks: () => [], parked: () => [],
      agents: () => [{ name: "bookshop", path: "/dl", status: "done", startedAt: Date.now() - 60000, work: { final }, outcome: { state: "waiting", waitingOn: "lane", what: "ops: done", summary: final } }],
      handing: () => [{ lane: "ops", text: "done", gone: true, why }] } }).projects.find((p) => p.repo === "bookshop");
    const ended = "Sent: its run ended, and what it did comes back within 20 seconds";
    const a = mk("Handed the deploy to ops. The real blocker is PR #612 in GarthGhostai/bookshop, which needs Garth's hand merge because auto-merge is refused.", ended);
    ok("a done handover no longer reads Waiting on someone else: the badge names the real blocker from the run's words (28 Oct 2026)", a.pill === "Needs your merge: PR #612", a.pill);
    const b = mk("Handed the deploy to ops. Nothing else is open.", ended);
    ok("…and with no blocker named it reads Done/Idle, never Waiting on someone else", b.pill !== "Waiting on someone else", b.pill);
    const c = mk("Handed the deploy to ops.", "Sent: its agent is on it now");
    ok("a handover still being worked keeps Waiting on someone else", c.pill === "Waiting on someone else", c.pill);
  }
  const wh = workScene({ deps: { repos: () => ({ whatsapp_module: "/w", atlas: "/c" }), pending: () => [], tasks: () => [], agents: () => [],
    handing: (p) => (p === "/w" ? [{ lane: "ops", text: "set up a WhatsApp test number", gone: false, why: "Not sent yet: ops is still on the earlier version (its run started 5 min ago), and gets this one when that run ends" }] : []) } });
  const whp = wh.projects.find((p) => p.repo === "whatsapp_module");
  ok("a lane's handover not sent yet shows on its block, with why (whatsapp_module, 2026-10-12)", whp && whp.handing.length === 1 && /still on the earlier version/.test(whp.handing[0].why) && !wh.projects.some((p) => p.repo === "atlas"), wh.projects);
  ok("Go with nothing waiting says so", /Nothing waiting/.test(workGo({ push: () => ({ empty: true }) }).note), "");

  console.log("WAITING — each waiting task says why, and starts by itself once its lane is free");
  {
    const { workTick, STUCK_AFTER } = await import("../home.mjs");
    const NOW = 1e13, old = NOW - STUCK_AFTER - 1000, fresh = NOW - 40000;
    const map = { symbiot: "/s", atlas: "/c", g: "/g", f: "/f" };
    const T = () => [{ id: "1", text: "Fix the reader", repo: "symbiot", ts: fresh }, { id: "2", text: "Add a Skip button", repo: "symbiot", ts: fresh },
      { id: "3", text: "Tidy the docs", repo: "atlas", ts: fresh }, { id: "4", text: "🤖 Agent: free space on /mnt/storage", repo: "ops", ts: fresh },
      { id: "5", text: "👤 You (only you: deleting outside the agent's folder): run the delete", repo: "ops", ts: fresh }, { id: "6", text: "Old one", repo: "g", ts: old },
      { id: "7", text: "Write the README", repo: "f", ts: old }, { id: "8", text: "Somewhere", repo: "nowhere", ts: fresh }, { id: "9", text: "Just added", repo: "f", ts: NOW - 5000 }];
    let tasks = T();
    const base = { repos: () => map, name: (p, n) => n, pending: () => [], parked: () => [], cmd: () => "claude -p {prompt}", now: NOW, tasks: () => tasks, save: () => {}, config: () => ({}),
      agents: () => [{ name: "symbiot", path: "/s", status: "running", work: { doing: "Fixing the reader", todos: [] }, ask: { questions: [] } }, { name: "atlas", path: "/c", status: "done", ask: { questions: [{ q: "Which docs?" }] } }],
      brief: (p) => (p === "/s" ? { at: 1, tasks: ["Fix the reader"] } : p === "/g" ? { at: 5, tasks: ["Old one"] } : { at: 0, tasks: [] }), lastRun: (p) => (p === "/g" ? 10 : 0), autoStart: () => true };
    const sc = workScene({ deps: { ...base, fails: {} } }), why = (id) => (sc.waiting.find((w) => w.id === "task:" + id) || {}).why || {};
    ok("in the brief of the run at work in its lane: its agent is on it now", why(1).kind === "working" && /symbiot's agent is on it now/.test(why(1).text), why(1));
    ok("not in it: queued behind that lane's run, named, with what it's doing", why(2).kind === "queued" && /Queued behind symbiot's run: fixing the reader/.test(why(2).text), why(2));
    ok("its lane's last run asked something: waiting on your answer, with the Workdesk card's folder", why(3).kind === "asks" && why(3).path === "/c" && /your answer/.test(why(3).text), why(3));
    ok("an ops task (🤖 Agent: …) is next, as a run of its own; a 👤 one is yours and counts for no Go", why(4).kind === "next" && why(5).kind === "you" && sc.canGo === 4, [why(4), why(5), sc.canGo]);
    ok("its lane's run ended without ticking it: it starts again on its own, under that task's cap (25 Oct 2026)", why(6).kind === "next" && why(6).retryKey === "ended:6" && /ended without finishing it, so it starts again/.test(why(6).text), why(6));
    const capped = workScene({ deps: { ...base, fails: {}, autoStart: () => false } }).waiting.find((w) => w.id === "task:6").why;
    ok("…and once that cap is used up: flagged, not started again and again", capped.stuck && capped.ended && /ended without finishing/.test(capped.text), capped);
    ok("a free lane, waiting past a few minutes: flagged as stuck with nothing in its way", why(7).stuck && /Not started after \d+ min/.test(why(7).text) && sc.stuckCount === 1, [why(7), sc.stuckCount]);
    {
      const named = workScene({ deps: { ...base, fails: {}, brief: (p) => (p === "/g" ? { at: 5, tasks: ["Old one"] } : { at: 0, tasks: [] }), lastRun: () => 0, waiting: (p) => (p === "/g" ? "someone with root on the VM" : "") } }).waiting.find((w) => w.id === "task:6").why;
      ok("a task marked [~] that names no real blocker isn't held as waiting: steve's OOM fix sat on 'someone with root' (25 Oct 2026)", named.kind !== "waiting" && !named.noGo, named);
    }
    ok("a lane Symbiot can't find a folder for: blocked, saying so", why(8).kind === "blocked" && /can't find nowhere's folder/.test(why(8).text), why(8));
    // its agent marked it [~]: waiting on that, not "didn't start", and never started again and again (22 Oct 2026)
    {
      const wmap = { ...map, telcohub: "/w" }, wt = [{ id: "w1", text: "Rebuild the coach avatars", repo: "telcohub", ts: old }, { id: "w2", text: "Write the changelog", repo: "telcohub", ts: old }];
      const wb = { ...base, repos: () => wmap, tasks: () => wt, agents: () => [], brief: (p) => (p === "/w" ? { at: 5, tasks: ["Rebuild the coach avatars"] } : { at: 0, tasks: [] }), lastRun: () => 1,
        waiting: (p, text) => (p === "/w" && text === "Rebuild the coach avatars" ? "ops, run act-c1d2e3f4, which holds the key" : "") };
      const wf = { telcohub: { at: old, note: "Not started: every task on telcohub's list is done or waiting on something" } };
      const sw = workScene({ deps: { ...wb, fails: wf } }), ww = (id) => (sw.waiting.find((w) => w.id === "task:" + id) || {}).why || {};
      ok("a task its agent marked waiting says what on, plainly, not blocked, and counts for no Go", ww("w1").kind === "waiting" && ww("w1").noGo && !ww("w1").stuck && /^Waiting on ops, run act-c1d2e3f4, which holds the key\. telcohub's agent carries on once that's in$/.test(ww("w1").text), ww("w1"));
      ok("…a refused start says why in plain words, not twice 'not started'", ww("w2").kind === "blocked" && /^Blocked: telcohub's agent didn't start: every task on telcohub's list/.test(ww("w2").text), ww("w2"));
      const wran = []; workTick({ deps: { ...wb, tasks: () => wt.slice(0, 1), fails: {}, push: ({ repo }) => ({ written: [{ name: repo, path: wmap[repo] }] }), run: (p) => (wran.push(p), { blocked: true, note: "x" }) } });
      ok("…and the tick doesn't start the lane on it every few minutes", !wran.includes("/w"), wran);
      const { goLane } = await import("../home.mjs"); let pushedWith = null;
      const gl = goLane("telcohub", wmap, { push: (f) => (pushedWith = f, { written: [{ name: "telcohub", path: "/w" }] }), run: () => ({ id: "j" }) });
      ok("Start for one lane opens what its agent marked waiting, and starts it", gl.ok && gl.job === "j" && pushedWith && pushedWith.reopen === true && pushedWith.repo === "telcohub", [gl, pushedWith]);
    }
    const ws0 = workScene({ deps: { ...base, cmd: () => "", fails: {} } });
    ok("no agent set: every one says it's blocked on that", ws0.waiting.filter((w) => w.why.kind !== "you").every((w) => /no coding agent/.test(w.why.text)), ws0.waiting.map((w) => w.why.kind));
    const pushed = [], ran = [], acted = [], fails = {};
    const took = [];
    const r = workTick({ deps: { ...base, fails, autoStart: (p, o) => (o && o.take !== false && took.push([p, o.key]), true), push: ({ repo }) => (pushed.push(repo), { written: [{ name: repo, path: map[repo] }] }), run: (p) => (ran.push(p), { id: "j" }), act: (t) => (acted.push(t), { ok: true, dir: "/runs/act-1" }) } });
    ok("the tick starts the free lane's tasks (one run per lane), and an ended one under its cap, not a busy or asking one, nor one just added", [...r.started].sort().join() === "f,g" && [...pushed].sort().join() === "f,g" && [...ran].sort().join() === "/f,/g" && took.length === 1 && took[0].join() === "/g,ended:6", [r, took]);
    // peak hours: weekdays 5–11am Pacific = 2–8pm SAST (northern summer)
    {
      const WED = Date.parse("2026-10-14T13:00:00Z"), SAT = Date.parse("2026-10-17T13:00:00Z"), WED_NIGHT = Date.parse("2026-10-14T19:00:00Z");
      const batch = (at) => [{ id: "a", text: "One", repo: "symbiot", ts: at - 40000 }, { id: "b", text: "Two", repo: "atlas", ts: at - 40000 }, { id: "c", text: "Three", repo: "g", ts: at - 40000 }];
      const mk = (at, list, cfg = {}) => { const ran = [], b = { repos: () => ({ symbiot: "/s", atlas: "/c", g: "/g" }), name: (p, n) => n, pending: () => [], parked: () => [], cmd: () => "claude -p {prompt}", now: at, tasks: () => list, save: () => {}, config: () => cfg, agents: () => [], brief: () => ({ at: 0, tasks: [] }), lastRun: () => 0 };
        const t = workTick({ deps: { ...b, fails: {}, push: ({ repo }) => ({ written: [{ name: repo, path: "/" + repo }] }), run: (p) => (ran.push(p), { id: "j" }) } });
        return { t, ran, kind: (id) => (workScene({ deps: { ...b, fails: {} } }).waiting.find((w) => w.id === "task:" + id) || {}).why || {} }; };
      const w1 = mk(WED, batch(WED)), s1 = mk(SAT, batch(SAT)), n1 = mk(WED_NIGHT, batch(WED_NIGHT)), l1 = mk(WED, batch(WED).slice(0, 1)), o1 = mk(WED, batch(WED), { peakGuard: false });
      ok("a 3-lane batch on a weekday afternoon (SAST) is held, with its own reason", w1.ran.length === 0 && w1.kind("a").kind === "peak" && /off-peak/.test(w1.kind("a").text), [w1.t, w1.kind("a")]);
      ok("the same batch on a Saturday, or after 8pm SAST, starts normally", s1.ran.length === 3 && n1.ran.length === 3 && s1.kind("a").kind === "next", [s1.t, n1.t]);
      ok("a lone lane isn't a batch: it starts at peak too", l1.ran.length === 1, l1.t);
      ok("config.peakGuard: false turns the gate off", o1.ran.length === 3 && o1.kind("a").kind === "next", o1.t);
      const g = workGo({ now: WED, config: () => ({}), ops: () => ({ ops: [], failed: [] }), push: () => ({ written: [{ name: "x", path: "/x" }, { name: "y", path: "/y" }] }), run: () => ({ id: "j" }) });
      ok("Go isn't blocked at peak, but says so", g.started === 2 && /peak hours/.test(g.note || ""), g);
    }
    ok("…and an ops 🤖 Agent: task as an agent run of its own, without the tag; never a 👤 one", r.ops.join() === "4" && acted.join() === "free space on /mnt/storage" && tasks.find((t) => t.id === "4").done && tasks.find((t) => t.id === "4").act === "/runs/act-1" && !tasks.find((t) => t.id === "5").done, [r, acted]);
    tasks = T(); const f2 = {};
    const r2 = workTick({ deps: { ...base, fails: f2, push: ({ repo }) => ({ written: [{ name: repo, path: map[repo] }] }), run: () => null, act: () => ({ error: "Pick your coding agent first" }) } });
    const sc2 = workScene({ deps: { ...base, fails: f2 } }), w7 = sc2.waiting.find((w) => w.id === "task:7").why, w4 = sc2.waiting.find((w) => w.id === "task:4").why;
    ok("a start that didn't take is shown as the block on its tasks, in plain words", r2.failed.includes("f") && r2.failed.includes("ops") && w7.kind === "blocked" && /didn't start/.test(w7.text) && /Pick your coding agent/.test(w4.text), [r2, w7, w4]);
    const ran4 = []; workTick({ deps: { ...base, fails: f2, push: ({ repo }) => ({ written: [{ name: repo, path: map[repo] }] }), run: (p) => (ran4.push(p), { id: "j" }), act: () => ({ ok: true, dir: "/x" }) } });
    const ran5 = []; workTick({ deps: { ...base, now: NOW + STUCK_AFTER, fails: f2, push: ({ repo }) => ({ written: [{ name: repo, path: map[repo] }] }), run: (p) => (ran5.push(p), { id: "j" }), act: () => ({ ok: true, dir: "/x" }) } });
    ok("…and tried again a few minutes later, not on every tick", !ran4.length && ran5.includes("/f") && !f2.f, [ran4, ran5, f2]);
    const r3 = workTick({ deps: { ...base, config: () => ({ autoStart: false }), fails: {}, run: () => { throw new Error("ran"); } } });
    ok("autoStart: false leaves it all to Go", !r3.started.length && !r3.ops.length, r3);
  }

  console.log("PARKED — a lane blocked on you starts no runs until you unpark it");
  const wp = workScene({ deps: { repos: () => ({ whatsapp_module: "/w", symbiot: "/s" }), parked: () => ["/w"], pending: () => [], agents: () => [],
    tasks: () => [{ id: "1", text: "Submit the template", repo: "whatsapp_module" }, { id: "2", text: "Fix the reader", repo: "symbiot" }] } });
  ok("its tasks don't count towards Go, and it's marked parked, after the rest", wp.canGo === 1 && wp.waiting.find((w) => w.repo === "whatsapp_module").parked && wp.projects.map((p) => p.repo).join() === "symbiot,whatsapp_module" && wp.projects[1].parked, wp);
  const gp = workGo({ push: () => ({ written: [{ name: "whatsapp_module", path: "/w" }, { name: "symbiot", path: "/s" }] }), run: (p) => (p === "/w" ? { blocked: true, parked: true } : { id: "j" }) });
  ok("Go starts the rest and says which it left parked", gp.started === 1 && gp.queued === 0 && gp.parked.join() === "whatsapp_module" && gp.repos.join() === "symbiot", gp);
  const { parkLane, parkedPaths, runHandoff, setHandoffCmd } = await import("../agents.mjs");
  const pdir = join(HOME, "projects", "parked"); mkdirSync(join(pdir, ".symbiot"), { recursive: true });
  setHandoffCmd("true {dir}");
  parkLane(pdir, true);
  const pr = runHandoff(pdir, { force: true });
  ok("parked: no run starts there, not even Start it anyway", pr && pr.blocked && pr.parked && /Parked/.test(pr.note) && parkedPaths().join() === pdir, pr);
  parkLane(pdir, false);
  ok("…unparked, it's gone from the list", !parkedPaths().length, parkedPaths());
  setHandoffCmd("");

  // a run in ~ started with no TASKS.md there, and only cost a session (2026-10-07)
  console.log("NOTHING TO DO — a folder with no open task, and no answer since its last run, starts no run");
  const { runningHandoff, writeTasks } = await import("../agents.mjs");
  const ended = async (p) => { for (let i = 0; i < 100 && runningHandoff(p); i++) await new Promise((r) => setTimeout(r, 50)); };
  const idir = join(HOME, "projects", "idle"), is = join(idir, ".symbiot"); mkdirSync(is, { recursive: true });
  setHandoffCmd("true {dir} {prompt}");
  const n1 = runHandoff(idir, { force: true });
  ok("no TASKS.md: not started, not even Start it anyway, and the note says why", n1 && n1.blocked && n1.idle && !n1.id && /^Not started: idle has no \.symbiot\/TASKS\.md/.test(n1.note), n1);
  writeFileSync(join(is, "TASKS.md"), "## Tasks\n- [x] Done already\n");
  const n2 = runHandoff(idir);
  ok("every task ticked: not started either", n2 && n2.blocked && n2.idle && /every task .* is done or waiting/.test(n2.note), n2);
  writeFileSync(join(is, "agent.log"), `\n=== idle ${new Date(Date.now() - 60000).toISOString()} ===\n$ true\n`);
  writeFileSync(join(is, "ANSWERS.md"), "# Answers\n\n### Approved: drafts/post.md\nPost it.\n");
  const n3 = runHandoff(idir, { force: true });
  ok("…but an answer since its last run started (an approved post) starts one, every task ticked", n3 && n3.id && !n3.blocked, n3);
  await ended(idir);
  const n4 = runHandoff(idir, { force: true });
  ok("…once: after that run, the same answer starts no other", n4 && n4.blocked && n4.idle, n4);
  const n5 = runHandoff(idir, { force: true, lost: true });
  ok("restarting a lost conversation goes ahead (its answer is older than the failed resume)", n5 && n5.id && !n5.blocked, n5);
  await ended(idir);
  writeTasks(idir, "## Tasks\n- [x] Done already\n- [ ] A new one\n");
  const n6 = runHandoff(idir);
  ok("a new task: it starts", n6 && n6.id && !n6.blocked, n6);
  await ended(idir);
  // an ops run (drafts/act-*): its TASKS.md is written right before it starts
  const { actNow } = await import("../mind.mjs");
  const an = actNow("Check the build on the server");
  ok("an ops run in a new act-* folder still starts: its brief lands first", an.ok && an.job && /[\\/]drafts[\\/]act-[0-9a-f]+$/.test(an.dir) && /- \[ \]/.test(readFileSync(join(an.dir, ".symbiot", "TASKS.md"), "utf8")), an);
  await ended(an.dir);
  setHandoffCmd("");
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} adapt: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
