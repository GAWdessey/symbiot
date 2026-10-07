// Adapt (adapt.mjs): the models behind a Symbiot that shapes itself to its user.
// Each check is a property of the model it uses (frecency's half-life, Markov
// smoothing, entropy's bounds, Fitts's optimum under conserved area, Hick's cap,
// hysteresis, stable angles, style). Isolated HOME, set before the modules load.
//
//   node test/adapt.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "node:fs";
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

  console.log("HOME — the liquid's droplets from real data, and its talk");
  const { homeState, homeAsk } = await import("../home.mjs");
  const deps = {
    board: () => ({ cards: [{ id: "w1", name: "WhatsApp", label: "2 WhatsApp messages", count: 2 }, { id: "g1", name: "Gmail", label: "0 new", count: 0 }] }),
    pending: () => [{ repo: "symbiot", path: "/x", tasks: [{}, {}], files: [{}, {}, {}] }, { repo: "busy", path: "/y", running: true, tasks: [{}], files: [{}] }],
    agents: () => [{ name: "whatsapp_module", path: "/w", status: "done", ask: { questions: [{ q: "Paste the new Meta token?" }] } }, { name: "coral", path: "/c", status: "running", ask: { questions: [] } }],
    lanes: () => ({ handoffs: [{ from: "coral", to: "ops", text: "Find a JDK 17", status: "done" }] }),
    connected: () => true, repos: () => ({ symbiot: "/x" }), reports: () => ({ count: 0 }), agentCmd: () => 'claude -p "{prompt}"',
  };
  const h = homeState({ deps });
  const first = homeState({ deps: { ...deps, pending: () => [], agents: () => [], connected: () => false, repos: () => ({}) } });
  ok("first run: connect an AI, then show it your folders, both out front and opening Settings", first.you.map((y) => y.id).join() === "setup:ai,setup:folders" && first.you.every((y) => y.shape === "settings"), first.you);
  ok("…and neither once that's done", !h.you.some((y) => y.kind === "setup"), h.you);
  const claude = { name: "Claude Code", tmpl: 'claude -p "{prompt}"' };
  const pk = homeState({ fresh: true, deps: { ...deps, agentCmd: () => "", pickAgent: () => claude } }).you.find((y) => y.id === "setup:pick");
  ok("no agent picked: \"Pick your agent\" on Home, not \"All handled\", one click for the one on this computer", pk && pk.kind === "setup" && pk.title === "Pick your agent" && /^Claude Code is on this computer: one click/.test(pk.sub) && pk.pick && pk.pick.tmpl === claude.tmpl && pk.focus === "agent" && pk.shape === "settings", pk);
  const pk2 = homeState({ fresh: true, deps: { ...deps, agentCmd: () => "", pickAgent: () => null } }).you.find((y) => y.id === "setup:pick");
  ok("…none on this computer: it opens Settings, with no one-click pick", pk2 && !pk2.pick && pk2.sub === "the coding agent that takes your tasks", pk2);
  ok("…and not once an agent is picked", !h.you.some((y) => y.id === "setup:pick"), "");
  ok("only you: an Approve that's waiting (not one still being worked on) and an agent's question", h.you.length === 2 && h.you[0].title === "Approve symbiot" && /2 tasks done · 3 files · only you decide/.test(h.you[0].sub) && h.you[1].title === "whatsapp_module asks" && h.you[1].shape === "agents", h.you);
  ok("feeds: only what has something new", h.feeds.length === 1 && h.feeds[0].title === "WhatsApp" && h.feeds[0].shape === "board", h.feeds);
  const clashed = homeState({ fresh: true, deps: { ...deps, clashes: () => [{ kind: "leave", severity: "high", text: "Lerato Khoza's annual leave Mon 12 Oct to Fri 16 Oct 2026 (~/Co/hr/leave.csv) covers the **VAT return** due Wed 14 Oct (~/Co/finance/STATUS.md)." }, { kind: "customer", severity: "high", text: "Acacia Mining's renewal date disagrees." }] } }).feeds[0];
  ok("a clash in your files that matters: first under Watching, opening the checks", clashed && clashed.id === "feed:clash" && clashed.title === "Where your files disagree" && clashed.sub === "2 clashes to look at" && clashed.count === 2 && clashed.shape === "settings" && /^Lerato Khoza's annual leave .*VAT return/.test(clashed.latest) && !/\*\*/.test(clashed.latest), clashed);
  ok("…and none without one", !homeState({ fresh: true, deps: { ...deps, clashes: () => [] } }).feeds.some((f) => f.id === "feed:clash"), "");
  ok("lanes and who's working", h.lanes[0].to === "ops" && h.working === 1, [h.lanes, h.working]);
  const blob = homeState({ fresh: true, deps: { ...deps, board: () => ({ cards: [] }), pending: () => [], repos: () => ({ "CallForge AI": "/cf" }), name: (p, n) => (p === "/cf" ? "Dailify" : n),
    agents: () => [{ name: "CallForge AI", path: "/cf", status: "done", ask: { questions: [{ q: "Rename the folder `CallForge AI` to `dailify`?", options: ["🤖 Agent: rename it (recommended)", "Keep the folder's name", "a third, never shown"] }, { q: "And the other?" }] } },
      { name: "Agent: Find the newest Kooha clip", path: join(HOME, ".config", "symbiot", "drafts", "act-c165d613"), status: "done", ask: { questions: [{ q: "which way?", options: [] }] } }] } });
  const cf = blob.you.find((y) => y.path === "/cf"), run = blob.you.find((y) => /act-c165d613/.test(y.id));
  ok("an ask carries its blob: the lane, its name as people say it, the question and its two options", cf && cf.repo === "CallForge AI" && cf.name === "Dailify" && /^Rename the folder/.test(cf.q) && cf.options.length === 2 && cf.more === 1 && cf.title === "CallForge AI asks", cf);
  ok("…an ops run's ask has no repo, and is named by what it's doing", run && run.repo === "" && run.name === "Find the newest Kooha clip" && !run.options.length, run);
  const wait = [{ status: "waiting", subject: "endpoint and secret" }];
  const blind = homeState({ fresh: true, deps: { ...deps, waits: () => wait, seesInbox: () => false } });
  ok("a reply is waited on and no inbox is watched (Email off too): only you can let it see your inbox", blind.you.some((y) => y.id === "setup:inbox" && y.title === "Let me see your inbox" && y.sub === "so I notice their reply" && y.shape === "settings"), blind.you);
  ok("…not once an inbox is watched or Email is on, and not with nothing waited on", !homeState({ fresh: true, deps: { ...deps, waits: () => wait, seesInbox: () => true } }).you.some((y) => y.id === "setup:inbox") && !homeState({ fresh: true, deps: { ...deps, waits: () => [{ status: "replied" }], seesInbox: () => false } }).you.some((y) => y.id === "setup:inbox"), "");
  const out = homeState({ fresh: true, deps: { ...deps, waits: () => wait, seesInbox: () => ({ sees: false, signedOut: ["Gmail"] }) } }).you.find((y) => y.id === "setup:inbox");
  ok("…the inbox watched but signed out: it says so, and asks you to sign in again", out && out.signin && out.title === "Sign in to Gmail again" && /signed out, so I won't notice their reply/.test(out.sub) && out.focus === "links", out);
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
  const failedRun = (o = {}) => ({ id: "r1", name: "coral", path: "/c", status: "failed", exitCode: 1, startedAt: Date.now() - 60000, endedAt: Date.now() - 1000, tail: "Working on it\nAPI Error: 529 overloaded", ask: { questions: [] }, ...o });
  const fr = homeState({ fresh: true, deps: { ...deps, pending: () => [], repos: () => ({ coral: "/c" }), agents: () => [failedRun()] } }).you.find((y) => y.fix === "failed");
  ok("a run that ended in an error: a question on its lane, Run it again or Skip", fr && fr.id === "failed:r1" && fr.repo === "coral" && /Its run stopped with an error: API Error: 529 overloaded\. Run it again\?/.test(fr.q) && fr.options[0] === "Run it again (recommended)", fr);
  const noFail = (agents) => !homeState({ fresh: true, deps: { ...deps, pending: () => [], repos: () => ({ coral: "/c" }), agents } }).you.some((y) => y.fix === "failed");
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

  // Next up: with nothing waiting on you, a few things that CAN be done next, each with its gain and one tap
  const { homeNext, nextUp, laneNamed, NEXT_FILE } = await import("../home.mjs");
  const NOW0 = Date.now(), DAYS = (n) => NOW0 - n * 86400000 - 60000; // a minute past the day: a slow run never reads 5 days as 4
  const nx = (o = {}) => ({ taken: () => ({}), parked: () => [], mind: () => [], stuck: () => [], board: () => ({ cards: [] }), reports: () => ({ count: 0 }), tasks: () => [], ...o });
  const calm = { ...deps, pending: () => [], agents: () => [], repos: () => ({ whatsapp_module: "/wa", coral: "/c" }), board: () => ({ cards: [] }) };
  const busyNext = nx({
    reports: () => ({ count: 8 }),
    stuck: (o) => (o && o.within > 3 * 86400000 ? [{ id: "h1", from: { lane: "symbiot", path: "/s" }, text: "Move ~/Company's registers\nmore", error: "ops is your own lane: do it yourself.", at: DAYS(5) }] : []),
    tasks: () => [{ id: "t1", text: "Wire the webhook", repo: "coral", ts: DAYS(9) }, { id: "t2", text: "And its test", repo: "coral", ts: DAYS(1) }, { id: "t3", text: "Read the WhatsApp module's group and summarise it", repo: "", ts: DAYS(2) }, { id: "t4", text: "Fresh one", repo: "whatsapp_module", ts: DAYS(0.5) }],
    board: () => ({ cards: [{ id: "w9", name: "Inbox - me@x.co - Mail", source: "mail", label: "4 emails", count: 4, items: [{ id: "n1", need: true }, { id: "n2", need: true }, { id: "n3", need: false }, { id: "n4", need: true }, { id: "n5", need: true }] }, { id: "p1", name: "A page", source: "page", label: "2 new", count: 2 }] }),
  });
  const hx = homeState({ fresh: true, deps: { ...calm, next: busyNext } });
  const ids = hx.next.map((s) => s.id);
  ok("nothing needs you: Home suggests what can be done next, best first, at most 5", hx.you.length === 0 && ids.join() === "next:reports,next:retry:h1,next:go:coral,next:float:t3,next:drafts:w9", ids);
  const byId = Object.fromEntries(hx.next.map((s) => [s.id, s]));
  ok("…each with its gain and time spelled out, and one tap (a label)", hx.next.every((s) => s.title && s.gain && s.time && s.label && s.act), hx.next);
  ok("…unread reports: triage them, ~10 min for 8, by an agent", byId["next:reports"].title === "Triage the 8 unread reports" && /clears the backlog/.test(byId["next:reports"].gain) && byId["next:reports"].time === "~10 min, by an agent" && byId["next:reports"].act === "agent", byId["next:reports"]);
  ok("…a handover that errored days ago and was left: retry it (Home's own asks only look back 3 days)", byId["next:retry:h1"].act === "retry" && /^Retry symbiot's handover: Move ~\/Company's registers$/.test(byId["next:retry:h1"].title) && /errored 5 days ago \(ops is your own lane/.test(byId["next:retry:h1"].gain), byId["next:retry:h1"]);
  ok("…a project's tasks waiting days with nothing at work there (not one added today)", byId["next:go:coral"].title === "Send coral's 2 waiting tasks to its agent" && /oldest has waited 9 days/.test(byId["next:go:coral"].gain) && !ids.includes("next:go:whatsapp_module"), byId["next:go:coral"]);
  ok("…a task with no project goes to the project its words name", byId["next:float:t3"].act === "assign" && byId["next:float:t3"].repo === "whatsapp_module" && /^Give whatsapp_module "Read the WhatsApp/.test(byId["next:float:t3"].title), byId["next:float:t3"]);
  ok("…new mail with no reply: drafts of the newest 3, unsent (not a plain page)", /^Draft replies to the newest 3 of the 4 emails on Inbox$/.test(byId["next:drafts:w9"].title) && /unsent/.test(byId["next:drafts:w9"].gain), byId["next:drafts:w9"]);
  ok("a task's words name its lane, the longest name that fits, whole words only", laneNamed("fix the whatsapp module webhook", ["whatsapp_module", "whatsapp"]) === "whatsapp_module" && laneNamed("read whatsapp", ["whatsapp_module", "whatsapp"]) === "whatsapp" && laneNamed("coralreef", ["coral"]) === "", "");
  const busyRun = nextUp({ map: { coral: "/c" }, list: [{ path: "/c", status: "running" }], deps: nx({ tasks: () => [{ id: "t1", text: "x", repo: "coral", ts: DAYS(9) }] }) });
  const parkedNx = nextUp({ map: { coral: "/c" }, deps: nx({ parked: () => ["/c"], tasks: () => [{ id: "t1", text: "x", repo: "coral", ts: DAYS(9) }] }) });
  ok("…not a project whose agent is at work, nor a parked one", !busyRun.length && !parkedNx.length, [busyRun, parkedNx]);
  const dec = (text, ts = DAYS(1)) => [{ id: "dn1", name: "Symbiot", kind: "decision", facts: [{ text, ts }] }];
  const dn1 = nextUp({ map: { symbiot: "/s" }, deps: nx({ mind: () => dec("The user wants Symbiot's weekly report emailed every Friday") }) });
  ok("a decision you made lately that no task carries yet: make it a task, in the project it names", dn1.length === 1 && dn1[0].act === "task" && dn1[0].repo === "symbiot" && /^Make a task of what you decided: The user wants Symbiot's weekly report/.test(dn1[0].title), dn1);
  const dn2 = nextUp({ map: {}, deps: nx({ mind: () => dec("The user wants Symbiot's weekly report emailed every Friday"), tasks: () => [{ id: "x", text: "Email Symbiot's weekly report every Friday", done: true }] }) });
  const dn3 = nextUp({ map: {}, deps: nx({ mind: () => dec("~/Company is a test set the user made") }) });
  const dn4 = nextUp({ map: {}, deps: nx({ mind: () => dec("The user wants the weekly report emailed", DAYS(30)) }) });
  ok("…not once a task took it on (even a done one), not a fact about how things are, not an old one", !dn2.length && !dn3.length && !dn4.length, [dn2, dn3, dn4]);
  ok("…and no suggestions at all while anything waits on you", homeState({ fresh: true, deps: { ...deps, next: busyNext } }).next.length === 0, "");
  ok("…nor with nothing to suggest", homeState({ fresh: true, deps: { ...calm, next: nx() } }).next.length === 0, "");
  ok("Home's talk knows them", /^Could be done next \(Home suggests these, one tap each\):\n- Triage the 8 unread reports: clears the backlog/m.test(homeContext(hx)), "");
  // one tap: it starts the agent, or makes the task, and stays away a week
  const did = [], nfile = join(HOME, "next-test.json");
  const tap = (id, o = {}) => homeNext(id, { state: hx, file: nfile, repos: () => ({ coral: "/c", whatsapp_module: "/wa" }), act: (req, o2) => { did.push(["act", req.split("\n")[0], o2.title]); return { ok: true, job: "j", dir: "/d" }; }, run: (p) => { did.push(["run", p]); return { id: "j" }; }, push: (f) => { did.push(["push", f.repo]); return { written: [{ path: "/c" }] }; }, allow: (id2) => { did.push(["allow", id2]); return { ok: true }; }, draft: (nid) => { did.push(["draft", nid]); return { ok: true }; }, board: busyNext.board, ...o });
  const tr = tap("next:reports", { reportsList: () => [{ title: "symbiot post: the 4-week test", lane: "symbiot", file: "/s/.symbiot/POST-TEST.md", new: true }, { title: "Old", file: "/o.md", new: false }] });
  ok("Triage: an agent of its own, told which reports (the unread ones) and to leave one page", tr.ok && did[0][0] === "act" && did[0][1] === "Triage the user's 1 unread Symbiot reports, so they read one page instead of 1. Read each:" && did[0][2] === "Home: what's next", [tr, did]);
  did.length = 0; const tg = tap("next:go:coral");
  ok("Send to its agent: the project's tasks written for it, and its agent started", tg.ok && JSON.stringify(did) === JSON.stringify([["push", "coral"], ["run", "/c"]]), did);
  did.length = 0; const saved = []; const ta = tap("next:float:t3", { tasks: () => [{ id: "t3", text: "Read the WhatsApp module's group", repo: "" }], save: (all) => saved.push(all[0].repo) });
  ok("Give it a project: the task joins it, and that project's agent starts", ta.ok && saved.join() === "whatsapp_module" && JSON.stringify(did) === JSON.stringify([["push", "whatsapp_module"], ["run", "/wa"]]), [ta, did, saved]);
  did.length = 0; const tt = tap("next:retry:h1");
  ok("Retry: the handover runs on its own, and goes back to the agent that asked", tt.ok && JSON.stringify(did) === JSON.stringify([["allow", "h1"]]) && /goes back to the agent that asked/.test(tt.said), [tt, did]);
  did.length = 0; const td = tap("next:drafts:w9");
  ok("Draft replies: the newest 3 that need one, each drafted and left unsent", td.ok && JSON.stringify(did) === JSON.stringify([["draft", "n1"], ["draft", "n2"], ["draft", "n4"]]) && /drafting 3 replies.*unsent/.test(td.said), [td, did]);
  const taken = JSON.parse(readFileSync(nfile, "utf8")).taken;
  ok("…each one taken stays away a week", ["next:reports", "next:go:coral", "next:float:t3", "next:retry:h1", "next:drafts:w9"].every((k) => taken[k] > 0) && nextUp({ map: { coral: "/c" }, deps: nx({ taken: () => taken, reports: () => ({ count: 8 }), tasks: () => [{ id: "t1", text: "x", repo: "coral", ts: DAYS(9) }] }) }).length === 0, taken);
  const te = tap("next:go:coral", { push: () => ({ written: [] }) }), tn = tap("next:nope");
  ok("…and when it can't start, it says why; one that isn't there any more says so", /Nothing of coral's is waiting/.test(te.error) && /isn't here any more/.test(tn.error), [te, tn]);
  ok("the taken ones are kept in the config folder", NEXT_FILE.endsWith(join(".config", "symbiot", "home-next.json")), NEXT_FILE);
  // a run that ended waiting on you (agents.mjs needsOf): before, Home said "Only the user can do (0)"
  const jonoDir = join(HOME, ".config", "symbiot", "drafts", "act-jono"); mkdirSync(join(jonoDir, ".symbiot"), { recursive: true });
  const waitsRun = (o = {}) => ({ id: "r5", name: "Agent: **What's needed:** draft the email to Jono", path: jonoDir, status: "done", ask: { questions: [] }, needs: { kind: "approve", what: "The draft isn't sent. Draft: it's in Gmail, to jono@example.com.", check: "Cc: You'll add Alex yourself.", label: "Draft", key: "k1" }, ...o });
  const hn = homeState({ fresh: true, deps: { ...deps, pending: () => [], agents: () => [waitsRun()] } }), nb = hn.you.find((y) => y.fix === "needs");
  ok("a run that ended with a draft for your OK: on Home, with what to check first, Go ahead or Skip", nb && nb.id === "needs:r5" && nb.kind === "ask" && nb.repo === "" && nb.title === "Draft the email to Jono waits for your OK" && nb.q === "The draft isn't sent. Draft: it's in Gmail, to jono@example.com. Check first: Cc: You'll add Alex yourself." && nb.options.join() === "Go ahead (recommended),Skip", nb);
  ok("…and Home's talk counts it", /^Only the user can do \([1-9]\):[\s\S]*- Draft the email to Jono waits for your OK: Draft \(asks: The draft isn't sent/m.test(homeContext(hn)), homeContext(hn).split("\n").slice(0, 3));
  const st5 = homeState({ fresh: true, deps: { ...deps, pending: () => [], agents: () => [waitsRun({ needs: { kind: "step", what: "Running tailscale needs sudo, and only you can do that.", check: "", label: "", key: "k2" } })] } }).you.find((y) => y.fix === "needs");
  ok("…a step only you can take: Done it or Skip", st5 && st5.title === "Draft the email to Jono needs you" && st5.q === "Running tailscale needs sudo, and only you can do that." && st5.options.join() === "Done it (recommended),Skip", st5);
  const noNeeds = (agents) => !homeState({ fresh: true, deps: { ...deps, pending: () => [], agents } }).you.some((y) => y.fix === "needs");
  ok("…not while an agent works there, nor when it asked in QUESTIONS.md (that's its question)", noNeeds(() => [{ id: "r6", path: jonoDir, status: "running", ask: { questions: [] } }, waitsRun()]) && noNeeds(() => [waitsRun({ ask: { questions: [{ q: "Send the draft to Jono?" }] } })]), "");
  const reran5 = [], settled5 = [], nd = { agents: () => [waitsRun()], running: () => false, run: (p, o) => { reran5.push([p, o.force]); return { id: "j5" }; }, settle: (p, k) => settled5.push([p, k]) };
  const g5 = homeAnswer("needs:r5", { pick: 0 }, nd), ans5 = readFileSync(join(jonoDir, ".symbiot", "ANSWERS.md"), "utf8");
  ok("…Go ahead: its agent goes ahead, told so in its ANSWERS.md, and it stops asking", g5.ok && g5.rerun === "j5" && JSON.stringify(reran5) === JSON.stringify([[jonoDir, true]]) && /### The draft isn't sent\. Draft: it's in Gmail, to jono@example\.com\.\nGo ahead: do it as you had it/.test(ans5) && JSON.stringify(settled5) === JSON.stringify([[jonoDir, "k1"]]), [g5, reran5, ans5, settled5]);
  const s5 = homeAnswer("needs:r5", { text: "skip, I sent it" }, nd);
  ok("…Skip (or your words saying no): it stops asking, and no agent starts", s5.ok && /won't ask again/.test(s5.said) && reran5.length === 1 && settled5.length === 2, [s5, reran5, settled5]);
  const pj = ws3({ deps: { repos: () => ({}), pending: () => [], tasks: () => [], parked: () => [], agents: () => [waitsRun({ id: "r8" })], stuck: () => [] } }).projects.find((p) => p.repo === "ops");
  ok("…and on its lane in Tasks: lit, the OK first, answerable there", pj && pj.lit && pj.qs[0].fix === "needs" && pj.qs[0].id === "needs:r8", pj);
  const wsS = ws3({ deps: { repos: () => ({ coral: "/c" }), pending: () => [], tasks: () => [], parked: () => [], agents: () => [failedRun({ id: "r9" })], stuck: () => stuckT } });
  const pc = wsS.projects.find((p) => p.repo === "coral"), po = wsS.projects.find((p) => p.repo === "ops");
  ok("on its lane in Tasks too: the project lit, the question first, answerable there", pc && pc.lit && pc.asks === 1 && pc.qs[0].fix === "failed" && pc.qs[0].id === "failed:r9" && po && po.lit && po.qs[0].q === "Allow this run access to ~/Company?" && po.qs[0].id === "stuck:2d8f4ec8", [pc, po]);
  const { agentMissing } = await import("../agents.mjs");
  ok("the agent's program: found on PATH, or named when it isn't", agentMissing('node -e "{prompt}"') === "" && agentMissing('no-such-agent-xyz -p "{prompt}"') === "no-such-agent-xyz" && agentMissing('FOO=1 no-such-agent-xyz "{prompt}"') === "no-such-agent-xyz" && agentMissing("/nowhere/agent {dir}") === "/nowhere/agent" && agentMissing("") === "", "");
  const { firstSteps } = await import("../home.mjs");
  const fsd = { connected: () => true, repos: () => ({ a: "/a" }), cmd: () => "claude -p {prompt}", knowledge: () => ({ folders: [] }), links: () => ({ items: [{ id: "gmail", name: "Gmail", state: "ok" }] }) };
  const f1 = firstSteps({ deps: { ...fsd, connectors: () => ({ claude: true, links: [{ id: "gmail", name: "Gmail", connector: "claude.ai Gmail", ready: true }] }) } });
  ok("first steps, in order: an AI, where your work is, your agent, one site, a company folder (optional)", f1.steps.map((s) => s.id).join() === "ai,work,agent,site,company" && f1.steps.slice(0, 4).every((s) => s.done) && !f1.steps[4].done && f1.steps[4].optional && !f1.done, f1.steps);
  ok("…the linked site says agent runs can use it, through Claude's connector", /Gmail linked\. Agent runs can use it too, through Claude's claude\.ai Gmail connector/.test(f1.steps[3].sub), f1.steps[3].sub);
  const f2 = firstSteps({ deps: { ...fsd, connectors: () => ({ claude: true, links: [{ id: "gmail", name: "Gmail", connector: "", ready: false }] }) } });
  ok("…or that they can't yet, and the one step that's yours", /can't use it yet: connect Gmail in claude\.ai/.test(f2.steps[3].sub), f2.steps[3].sub);
  const f3 = firstSteps({ deps: { connected: () => false, repos: () => ({}), cmd: () => "", knowledge: () => ({ folders: [] }), links: () => ({ items: [{ id: "x", state: "off" }] }), connectors: () => ({}) } });
  ok("…each ticks itself from what's set up: nothing yet, none ticked", f3.steps.every((s) => !s.done), f3.steps);
  ok("…and all done (the company folder too) says so", firstSteps({ deps: { ...fsd, knowledge: () => ({ folders: [{}] }), connectors: () => ({ claude: true, links: [] }) } }).done, "");
  let sys = "", prm = "";
  const hr = await homeAsk("what needs me?", { state: h, ask: async (s2, p2) => { sys = s2; prm = p2; return JSON.stringify({ reply: "The symbiot Approve and whatsapp_module's question.", do: null, remember: [] }); } });
  ok("home's talk is the same Symbiot, told what home shows", hr.answer === "The symbiot Approve and whatsapp_module's question." && /You are Symbiot, the one assistant/.test(sys) && /Approve symbiot/.test(prm) && /whatsapp_module asks/.test(prm), hr);
  ok("…and in their style", /Match how they talk/.test(sys), "");
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
        { name: "dailify", path: "/d", status: "done", startedAt: now - 3600e3, work: { final: "I read the **lead** code.\n\nMore detail here." }, ask: { questions: [{ q: "Who gets each yes?", options: ["one brokerage (recommended)", "book on the first call", "a third", "a fourth"] }], suggestions: [{ text: "Fix the exhausted-campaign dead end" }, { text: "Already added", added: true }] } },
        { name: "symbiot", path: "/s", status: "running", elapsed: 60e3, work: { doing: "Ran npm test", todos: [{ status: "in_progress", active: "Editing ui.mjs" }] }, ask: { questions: [] } },
        { name: "ancient", path: "/a", status: "done", elapsed: 9 * 86400e3, work: { final: "old news" }, ask: { questions: [] } }],
      pending: () => [], tasks: () => [], repos: () => ({ dailify: "/d", symbiot: "/s", ancient: "/a" }), name: (p, n) => n, parked: () => [] } });
    const d = r.projects.find((p) => p.repo === "dailify") || {}, sy = r.projects.find((p) => p.repo === "symbiot") || {};
    ok("a project's summary is its agent's last word, first paragraph, plain (no markdown)", d.summary === "I read the lead code." && d.state === "asks you", d);
    ok("its open question comes with up to 3 answers and the folder to send the answer to", d.qs && d.qs[0].q === "Who gets each yes?" && d.qs[0].options.length === 3 && d.qs[0].path === "/d", d.qs);
    ok("the extra tasks it suggests, not the ones already added", d.ideas && d.ideas.length === 1 && d.ideas[0].full === "Fix the exhausted-campaign dead end" && d.ideas[0].repo === "dailify" && d.ideas[0].path === "/d", d.ideas);
    ok("a running agent's summary is the to-do it's on now (from elapsed, as the agent list gives it)", sy.summary === "Editing ui.mjs" && sy.state === "at work", sy);
    ok("a project with nothing new in a day, and nothing asked or suggested, isn't relayed", !r.projects.some((p) => p.repo === "ancient"), r.projects.map((p) => p.repo));
  }
  console.log("WORK SCENE — plain words for what's at work, waiting and ready; Go starts it");
  const { workScene, workGo } = await import("../home.mjs");
  const ws = workScene({ deps: {
    agents: () => [{ name: "symbiot", path: "/s", status: "running", progress: { done: 1, total: 3 }, work: { todos: [{ status: "completed", text: "a", active: "A" }, { status: "in_progress", text: "Fix the reader", active: "Fixing the **WhatsApp** reader" }] }, ask: { questions: [] } },
      { name: "coral", path: "/c", status: "running", work: { doing: "Ran npm test", todos: [] }, ask: { questions: [{ q: "?" }] } }, { name: "old", path: "/o", status: "done" }],
    pending: () => [{ repo: "GhostAIChat", path: "/g", tasks: [{}, {}], files: [{}] }, { repo: "busy", path: "/b", running: true, tasks: [{}] }],
    tasks: () => [{ id: "1", text: "Add a Skip button to each idea in the Agents tab, so you can turn down an idea you don't want", repo: "symbiot" }, { id: "2", text: "Merge near-duplicates", repo: "whatsapp_module" }, { id: "3", text: "done one", repo: "x", done: true }, { id: "4", text: "no repo", repo: "" }],
  } });
  ok("at work: what each agent is doing, in its own plain words (no markdown), with progress", ws.running.length === 2 && ws.running[0].doing === "Fixing the WhatsApp reader" && ws.running[0].progress.done === 1 && ws.running[1].doing === "Ran npm test" && ws.running[1].waiting, ws.running);
  ok("ready for your OK: only what's waiting on an Approve, not what's still being worked on", ws.ready.length === 1 && ws.ready[0].repo === "GhostAIChat" && ws.ready[0].count === 2, ws.ready);
  ok("waiting: open tasks with a repo, short, and marked when their repo's agent is busy", ws.waiting.length === 2 && ws.waiting[0].text.length <= 160 && ws.waiting[0].text.startsWith("Add a Skip button") && ws.waiting[0].busy && !ws.waiting[1].busy && ws.canGo === 1, ws.waiting);
  const started = [];
  const g = workGo({ push: () => ({ written: [{ name: "a", path: "/a" }, { name: "b", path: "/b" }] }), run: (p) => (started.push(p), p === "/a" ? { id: "j1" } : { busy: true }) });
  ok("Go: every repo's brief written and its agent started, or queued behind one already there", g.started === 1 && g.queued === 1 && started.join() === "/a,/b" && g.repos.join() === "a,b", g);
  ok("projects: each repo with work on it, with what's waiting and what's ready", ws.projects.length === 4 && ws.projects.some((p) => p.repo === "symbiot" && p.running && p.waiting === 1) && ws.projects.some((p) => p.repo === "GhostAIChat" && p.ready === 2) && ws.projects.some((p) => p.repo === "whatsapp_module" && p.waiting === 1 && !p.running), ws.projects);
  ok("…what needs you first (a question, an Approve: lit), then the one an agent is in, then what waits", ws.projects.map((p) => p.repo).join() === "coral,GhostAIChat,symbiot,whatsapp_module" && ws.projects[0].lit && ws.projects[0].asks === 1 && ws.projects[1].lit && !ws.projects[2].lit, ws.projects.map((p) => [p.repo, p.lit]));
  const RUNDIR = join(HOME, ".config", "symbiot", "drafts");
  const wr = workScene({ deps: { repos: () => ({ symbiot: "/s" }), name: (p, n) => (n === "symbiot" ? "Symbiot" : n), pending: () => [], tasks: () => [],
    agents: () => [{ name: "Agent: Find the newest Kooha clip", path: join(RUNDIR, "act-c165d613"), status: "done", ask: { questions: [{ q: "which way?" }] } }, { name: "Agent: tidy ~/Company", path: join(RUNDIR, "act-1d727d7f"), status: "running", work: {} }, { name: "symbiot", path: "/s", status: "running", work: {} }] } });
  const ops = wr.projects.find((p) => p.repo === "ops");
  ok("ops runs (act-…) are one lane, Agent runs, not a sphere each named by an id", wr.projects.length === 2 && ops && ops.name === "Agent runs" && ops.runs === 1 && ops.asks === 1 && ops.lit && wr.projects[0] === ops, wr.projects);
  ok("…and a repo is shown by the name people use for it", wr.projects.find((p) => p.repo === "symbiot").name === "Symbiot", wr.projects);
  ok("Go with nothing waiting says so", /Nothing waiting/.test(workGo({ push: () => ({ empty: true }) }).note), "");

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
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} adapt: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
