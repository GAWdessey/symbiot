// Adapt (adapt.mjs): the models behind a Symbiot that shapes itself to its user.
// Each check is a property of the model it uses (frecency's half-life, Markov
// smoothing, entropy's bounds, Fitts's optimum under conserved area, Hick's cap,
// hysteresis, stable angles, style). Isolated HOME, set before the modules load.
//
//   node test/adapt.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, statSync } from "node:fs";
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
  ok("scattered use: capped at 7, the rest under more (and still reachable)", hu.shown.length === 7 && hu.more.length === 2, hu);
  const hs = A.hick(A.SHAPES, [0.6, 0.25, 0.08, 0.03, 0.01, 0.01, 0.01, 0.005, 0.005]);
  ok("habits: as few as cover 90% (never under 3)", hs.shown.length === 3 && hs.more.length === 6, hs);

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

  console.log("LAYOUT — droplets never sit where their metal would flicker between merged and apart");
  const { EMBEDDED_UI } = await import("../ui.mjs");
  const uiJs = [...EMBEDDED_UI.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const grab = (name) => { const i = uiJs.indexOf("function " + name + "("); let depth = 0, j = uiJs.indexOf("{", i); for (; j < uiJs.length; j++) { if (uiJs[j] === "{") depth++; else if (uiJs[j] === "}" && --depth === 0) break; } return uiJs.slice(i, j + 1); };
  const { lqSep, lqRelax } = new Function(grab("lqSep") + "\n" + grab("lqRelax") + "\nreturn { lqSep, lqRelax };")();
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
  };
  const h = homeState({ deps });
  ok("only you: an Approve that's waiting (not one still being worked on) and an agent's question", h.you.length === 2 && h.you[0].title === "Approve symbiot" && /2 tasks done · 3 files · only you decide/.test(h.you[0].sub) && h.you[1].title === "whatsapp_module asks" && h.you[1].shape === "agents", h.you);
  ok("feeds: only what has something new", h.feeds.length === 1 && h.feeds[0].title === "WhatsApp" && h.feeds[0].shape === "board", h.feeds);
  ok("lanes and who's working", h.lanes[0].to === "ops" && h.working === 1, [h.lanes, h.working]);
  let sys = "", prm = "";
  const hr = await homeAsk("what needs me?", { state: h, ask: async (s2, p2) => { sys = s2; prm = p2; return JSON.stringify({ reply: "The symbiot Approve and whatsapp_module's question.", do: null, remember: [] }); } });
  ok("home's talk is the same Symbiot, told what home shows", hr.answer === "The symbiot Approve and whatsapp_module's question." && /You are Symbiot, the one assistant/.test(sys) && /Approve symbiot/.test(prm) && /whatsapp_module asks/.test(prm), hr);
  ok("…and in their style", /Match how they talk/.test(sys), "");
  ok("an empty question isn't sent", (await homeAsk("  ")).error === "empty", "");
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} adapt: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
