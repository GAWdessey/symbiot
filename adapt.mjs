// symbiot — Adapt: Symbiot shapes itself to the person using it, with no
// settings. It measures how they work and how they talk; the browser side reads
// their colours from the system (ui.mjs). Every rule here is a known model, so
// what it does can be checked rather than taken on trust:
//
// - Frecency: each shape's use decays with a half-life (HALF_LIFE): score =
//   score·2^(−Δt/h) + 1 per use. Recent counts most; nothing needs a history.
// - What comes next: a Markov chain over shape-to-shape moves, with a Dirichlet
//   prior (Laplace smoothing, ALPHA) so a handful of moves can't swing it, and an
//   hour-of-day profile smoothed over neighbouring hours (circular kernel).
//   Combined as a product of experts into p, a probability per shape.
// - How predictable they are: Shannon entropy of p, normalised to 0..1. Low
//   entropy (habits) lets the layout adapt strongly; high entropy (scattered
//   use) keeps it uniform and stable. Few events in all: it barely adapts yet.
// - Size, Fitts's law: time to hit a target is a + b·log2(D/W + 1). Minimising
//   the expected time Σ p·T over all shapes with the total area fixed gives
//   area ∝ p (radius ∝ √p). The fixed total is conservation of mass: one
//   droplet growing takes liquid from the others.
// - How many to show, Hick–Hyman: choice time grows with log2(n + 1), so the
//   shapes that cover HICK_COVER of the probability show, the rest go under
//   "more" (always reachable, and by talking).
// - Stability, hysteresis: a new layout replaces the shown one only when it
//   saves at least HYSTERESIS of the expected Fitts time, and only when asked to
//   commit (the app does that when it wakes from rest, never mid-gesture). A
//   shape's angle is fixed once given, so spatial memory holds: adapting moves
//   size and distance, not where things are.
// - How they work it: talk vs click vs keyboard vs touch, each a frecency score,
//   decides the talk band's weight, the target size floor (a finger needs more
//   than a pointer: 48 vs 44 px) and whether focus rings stay on.
// - How they talk, Communication Accommodation: a style profile from what they
//   type (length, capitals, punctuation, emoji, questions vs instructions, the
//   languages they mix in) becomes one instruction for every reply and brief:
//   converge on their style, without copying their typos.
//
// Stored in ~/.config/symbiot/adapt.json, yours only.
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { CONFIG_DIR } from "./core.mjs";

const ADAPT_FILE = join(CONFIG_DIR, "adapt.json");
const MIND_FILE = join(CONFIG_DIR, "mind.json");
const DAY = 86400000;
const HALF_LIFE = 3 * DAY;
const ALPHA = 1;                         // Dirichlet prior per outcome
const EXPERT_W = { use: 1, next: 0.7, hour: 0.5 }; // product-of-experts exponents
const HOUR_KERNEL = [0.25, 0.5, 0.25];   // weights for the hour before, the hour, the hour after
const MIN_EVENTS = 12;                   // under this many uses, adaptation fades in
const HICK_COVER = 0.9, HICK_MIN = 3, HICK_MAX = 7;
const HYSTERESIS = 0.15;
const FITTS = { a: 0.1, b: 0.15 };       // seconds; only ratios matter here
const SHAPES = ["board", "map", "tasks", "agents", "week", "standup", "todo", "drift", "settings", "reports"];

function loadAdapt(file = ADAPT_FILE) {
  try { const d = JSON.parse(readFileSync(file, "utf8")); return { shapes: d.shapes || {}, trans: d.trans || {}, hours: d.hours || {}, modes: d.modes || {}, slots: d.slots || {}, shown: d.shown || null, events: d.events || 0 }; }
  catch { return { shapes: {}, trans: {}, hours: {}, modes: {}, slots: {}, shown: null, events: 0 }; }
}
function saveAdapt(d, file = ADAPT_FILE) {
  try { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(file, JSON.stringify(d), { mode: 0o600 }); try { chmodSync(file, 0o600); } catch {} return true; } catch { return false; }
}

// ---- frecency ---------------------------------------------------------------------
const decayed = (rec, now) => (rec ? rec.s * Math.pow(2, -(now - rec.t) / HALF_LIFE) : 0);
const bump = (rec, now) => ({ s: decayed(rec, now) + 1, t: now, n: ((rec && rec.n) || 0) + 1 });

// One use of a shape: from where, how (click, talk, key or touch), when.
function recordUse(d, shape, { from = "", via = "click", now = Date.now() } = {}) {
  if (!shape) return d;
  d.shapes[shape] = bump(d.shapes[shape], now);
  if (from && from !== shape) { const row = d.trans[from] || (d.trans[from] = {}); row[shape] = (row[shape] || 0) + 1; }
  const h = new Date(now).getHours(), hs = d.hours[shape] || (d.hours[shape] = new Array(24).fill(0)); hs[h]++;
  if (["click", "talk", "key", "touch"].includes(via)) d.modes[via] = bump(d.modes[via], now);
  if (!(shape in d.slots)) d.slots[shape] = Object.keys(d.slots).length;
  d.events = (d.events || 0) + 1;
  return d;
}

// ---- prediction -------------------------------------------------------------------
const normalise = (xs) => { const s = xs.reduce((a, b) => a + b, 0); return s > 0 ? xs.map((x) => x / s) : xs.map(() => 1 / xs.length); };
function predict(d, ids = SHAPES, { from = "", hour = new Date().getHours(), now = Date.now() } = {}) {
  const K = ids.length;
  const pUse = normalise(ids.map((id) => decayed(d.shapes[id], now) + ALPHA));
  const row = (from && d.trans[from]) || {}, N = ids.reduce((s, id) => s + (row[id] || 0), 0);
  const pNext = ids.map((id) => ((row[id] || 0) + ALPHA) / (N + ALPHA * K));
  const pHour = normalise(ids.map((id) => { const hs = d.hours[id] || []; return HOUR_KERNEL.reduce((s, w, k) => s + w * (hs[(hour + k - 1 + 24) % 24] || 0), 0) + ALPHA; }));
  const log = ids.map((_, i) => EXPERT_W.use * Math.log(pUse[i]) + EXPERT_W.next * Math.log(pNext[i]) + EXPERT_W.hour * Math.log(pHour[i]));
  const m = Math.max(...log);
  return normalise(log.map((x) => Math.exp(x - m)));
}
// Shannon entropy of p over its K outcomes, normalised to 0 (certain) .. 1 (uniform).
function entropy(p) { const K = p.length; if (K < 2) return 0; return -p.reduce((s, x) => s + (x > 0 ? x * Math.log(x) : 0), 0) / Math.log(K); }
// How strongly to adapt, 0..1: predictable use and enough of it.
function adaptivity(d, p) { return (1 - entropy(p)) * Math.min(1, (d.events || 0) / MIN_EVENTS); }

// ---- layout: Fitts, Hick, mass conservation ---------------------------------------
const fittsTime = (D, W) => FITTS.a + FITTS.b * Math.log2(D / Math.max(W, 1) + 1);
// Radii from probability under a fixed total area (area ∝ p minimises Σ p·log(D/W)),
// clamped to [minR, maxR] with the leftover area shared again among the rest
// (water-filling), so the total stays the budget.
function allocate(p, { budget, minR, maxR }) {
  let r = p.map(() => 0), free = p.map((_, i) => i), area = budget;
  for (let pass = 0; pass < p.length && free.length; pass++) {
    const ps = free.reduce((s, i) => s + p[i], 0) || 1, next = [];
    for (const i of free) {
      const ri = Math.sqrt((area * p[i] / ps) / Math.PI);
      if (ri < minR) r[i] = minR;
      else if (ri > maxR) r[i] = maxR;
      else { r[i] = ri; next.push(i); }
    }
    if (next.length === free.length) break; // nothing clamped: done
    area = Math.max(0, budget - p.reduce((s, _, i) => s + (next.includes(i) ? 0 : Math.PI * r[i] * r[i]), 0));
    free = next;
  }
  return r;
}
// The shapes to show (Hick): fewest that cover HICK_COVER, within [HICK_MIN, HICK_MAX].
function hick(ids, p) {
  const order = ids.map((id, i) => ({ id, p: p[i] })).sort((a, b) => b.p - a.p);
  let cum = 0; const shown = [];
  for (const o of order) { if (shown.length >= HICK_MAX) break; if (shown.length >= HICK_MIN && cum >= HICK_COVER) break; shown.push(o.id); cum += o.p; }
  return { shown, more: order.filter((o) => !shown.includes(o.id)).map((o) => o.id) };
}
// Expected Fitts time of a layout under p: [{ id, d, r }] (d, r in px).
function expectedTime(items, pOf) { return items.reduce((s, it) => s + (pOf[it.id] || 0) * fittsTime(it.d, 2 * it.r), 0); }

// The layout for these shapes: who shows, how big (radius, px) and how far from
// the core (px), and its fixed angle. Mixed toward uniform by (1 − adaptivity),
// then held by hysteresis unless the saving is worth it and commit is set.
function layoutFor(d, ids = SHAPES, { from = "", now = Date.now(), hour, budget = 7 * Math.PI * 42 * 42, minR = 26, maxR = 64, near = 250, far = 400, commit = false, touch = false } = {}) {
  const pRaw = predict(d, ids, { from, now, hour: hour ?? new Date(now).getHours() });
  const a = adaptivity(d, pRaw), p = pRaw.map((x) => a * x + (1 - a) / ids.length);
  const pOf = Object.fromEntries(ids.map((id, i) => [id, p[i]]));
  const { shown, more } = hick(ids, p);
  const floor = touch ? Math.max(minR, 34) : minR;
  const radii = allocate(shown.map((id) => pOf[id]), { budget, minR: floor, maxR });
  const pmax = Math.max(...shown.map((id) => pOf[id])), pmin = Math.min(...shown.map((id) => pOf[id]));
  for (const id of ids) if (!(id in d.slots)) d.slots[id] = Object.keys(d.slots).length;
  const items = shown.map((id, i) => ({ id, p: pOf[id], r: radii[i], d: pmax > pmin ? far - (far - near) * (pOf[id] - pmin) / (pmax - pmin) : (near + far) / 2, angle: (d.slots[id] * 2.399963) % (2 * Math.PI) })); // golden angle: slots never collide
  let use = { items, more, at: now, touch: !!touch };
  const prev = d.shown && d.shown.items && d.shown.items.length ? d.shown : null;
  if (prev) {
    const sameSet = prev.items.map((x) => x.id).sort().join() === items.map((x) => x.id).sort().join();
    const gain = (expectedTime(prev.items, pOf) - expectedTime(items, pOf)) / Math.max(expectedTime(prev.items, pOf), 1e-9);
    // a new input method (a finger now, not a pointer) always re-lays out: its targets must fit it
    if (!!prev.touch === !!touch && (!commit || (sameSet && gain < HYSTERESIS))) use = prev; // not worth moving things under your hand
  }
  if (commit || !prev) d.shown = use;
  return { ...use, p: pOf, adaptivity: a, entropy: entropy(pRaw), changed: use !== prev };
}

// How they work it: shares of talk / click / key / touch, from frecency.
function modes(d, now = Date.now()) {
  const ks = ["talk", "click", "key", "touch"], v = ks.map((k) => decayed(d.modes[k], now)), s = v.reduce((a, b) => a + b, 0);
  const share = Object.fromEntries(ks.map((k, i) => [k, s ? v[i] / s : 0]));
  return { ...share, talkWeight: Math.min(1, 0.35 + share.talk), touch: share.touch > 0.3, keyboard: share.key > 0.25 };
}

// ---- how they talk -----------------------------------------------------------------
// Words that are distinctly Afrikaans (none that are also everyday English:
// not "is", "met", "van", "op", "more"). A message counts as Afrikaans with two.
const AFRIKAANS = new Set("die en ek jy julle ons nie baie dankie lekker uit asseblief wat hoe nou ja nee maar ook vir sal kan moet hier daar goed mooi totsiens aand dit hulle weet gaan kom".split(" "));
// A request, however it's put: a bare verb, "i want / i need / can you / it
// should / make sure …", with a greeting or "now / ok / so" in front.
const IMPERATIVE = /^(?:(?:hey|hi|ok|okay|so|and|now|then|right|please)[,!.]?\s+)*(?:(?:i|we)\s+(?:want|need|would like|'d like)|can you|could you|would you|it should|make sure|let's|lets)?\s*(?:please\s+)?(add|make|fix|build|do|go|check|look|show|tell|send|close|open|set|put|take|stop|start|run|push|get|give|find|write|change|update|remove|delete|merge|bump|move|use|try|create|let|keep|raise|lower|link|ship|publish|approve|test|clean|rename|drop|turn|switch|copy|paste|install|connect|sign|watch|read|reply|draft|answer|have|be|see|know)?\b/i;
const isRequest = (t) => { const m = t.match(IMPERATIVE); return !!(m && (m[1] || /^(?:(?:hey|hi|ok|okay|so|and|now|then|right|please)[,!.]?\s+)*(?:(?:i|we)\s+(?:want|need|would like|'d like)|can you|could you|would you|it should|make sure)/i.test(t))); };
const EMOJI = /\p{Extended_Pictographic}/u;
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// A style profile from what they've typed; null with too little to go on.
function styleOf(texts) {
  const ms = (texts || []).map((t) => String(t || "").trim()).filter((t) => t.length > 1).slice(-120);
  if (ms.length < 3) return null;
  const share = (f) => ms.filter(f).length / ms.length;
  const words = ms.map((t) => t.split(/\s+/).length);
  const afrikaans = (t) => (t.toLowerCase().match(/[a-z']+/g) || []).filter((w) => AFRIKAANS.has(w)).length >= 2;
  return {
    samples: ms.length,
    words: median(words),
    lowercase: share((t) => /^[a-z]/.test(t)),
    endsPunct: share((t) => /[.!?]$/.test(t)),
    emoji: share((t) => EMOJI.test(t)),
    questions: share((t) => /\?\s*$/.test(t)),
    instructions: share(isRequest),
    emphasis: share((t) => /[A-Z]{3,}/.test(t) || /!{2,}/.test(t)),
    afrikaans: share(afrikaans),
  };
}
// One instruction from the profile: converge on their style (accommodation),
// never copy their typos. "" when there isn't enough to go on.
function styleLine(st) {
  if (!st) return "";
  const parts = [];
  const target = Math.round(Math.min(120, Math.max(20, st.words * 2.5)));
  parts.push(st.words <= 12 ? `They write short (about ${Math.round(st.words)} words a message): keep replies brief, about ${target} words, the point first, no pleasantries` : `They write at length (about ${Math.round(st.words)} words): you can explain, up to about ${target} words`);
  if (st.lowercase > 0.6 && st.endsPunct < 0.5) parts.push("their tone is casual (lowercase, little punctuation): plain and relaxed, not formal");
  if (st.instructions > 0.4) parts.push("they mostly give instructions: act and say what you did, rather than discuss");
  else if (st.questions > 0.4) parts.push("they mostly ask: answer directly");
  if (st.emoji < 0.05) parts.push("no emoji"); else if (st.emoji > 0.2) parts.push("an emoji is fine where it fits");
  if (st.emphasis > 0.08) parts.push("when they write in capitals they mean it: take it as the priority");
  if (st.afrikaans > 0.08) parts.push("they mix in Afrikaans: understand it, keep their Afrikaans words as they are, and reply in Afrikaans only when they write a whole message in it");
  return "Match how they talk: " + parts.join("; ") + ". Don't copy their typos.";
}
// The style line from everything typed to Symbiot's chats (mind.json's log).
function userStyleLine(file = MIND_FILE) {
  try { const d = JSON.parse(readFileSync(file, "utf8")); return styleLine(styleOf((d.log || []).filter((l) => l.role === "user").map((l) => l.text))); } catch { return ""; }
}

// ---- the app's view ------------------------------------------------------------------
function adaptState({ from = "", commit = false, touch, now = Date.now() } = {}) {
  const d = loadAdapt(), m = modes(d, now);
  const layout = layoutFor(d, SHAPES, { from, now, commit, touch: touch ?? m.touch });
  if (commit || layout.changed) saveAdapt(d);
  let style = null; try { const md = JSON.parse(readFileSync(MIND_FILE, "utf8")); style = styleOf((md.log || []).filter((l) => l.role === "user").map((l) => l.text)); } catch {}
  return { layout, modes: m, style, styleLine: styleLine(style), events: d.events || 0 };
}
function noteUse(body = {}) {
  const shape = String(body.shape || ""), via = String(body.via || "click"), from = String(body.from || "");
  if (!SHAPES.includes(shape)) return { error: "unknown shape" };
  const d = recordUse(loadAdapt(), shape, { from: SHAPES.includes(from) ? from : "", via });
  saveAdapt(d);
  return { ok: true, events: d.events };
}

export { ADAPT_FILE, SHAPES, HALF_LIFE, HYSTERESIS, decayed, bump, recordUse, predict, entropy, adaptivity, fittsTime, allocate, hick, expectedTime, layoutFor, modes, styleOf, styleLine, userStyleLine, adaptState, noteUse, loadAdapt, saveAdapt };
