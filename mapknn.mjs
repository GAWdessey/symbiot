// The Map's nearest neighbours: which of your repos belong together, and why.
//
// Each repo (and project folder) gets a fingerprint from three things the scan
// already reads, none of which needs an AI:
//   - its stack: the languages and tools it uses (Jaccard overlap);
//   - when you work on it: your commits per week over the last 12 weeks (cosine),
//     so two repos you worked on in the same weeks count as related;
//   - what it's about: the words of its name, README and package description
//     (TF-IDF cosine, so words every repo has count for little).
// Similarity is a weighted sum of the three. Each repo keeps its k nearest above a
// floor (k-NN), with the reasons; repos joined by strong links form clusters, named
// after what they share most. Vitality (how recently you worked on it) lets the Map
// size and sink repos by how alive they are.

const W = { stack: 0.4, weeks: 0.35, words: 0.25 };
const K = 3, FLOOR = 0.12, CLUSTER = 0.3, HALF_LIFE_DAYS = 21;
const STOP = new Set("a an and are as at be by can for from has have how if in into is it its of on or our so that the this to was we what when which will with you your use used using get set run runs make made new not but all any each one two more most also only than then there these those they them their just like via app apps code project projects repo repository readme install npm yarn pnpm license mit see docs file files src test tests build version".split(" "));

function words(text = "") {
  const tf = new Map();
  for (const w of String(text).toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || []) if (!STOP.has(w)) tf.set(w, (tf.get(w) || 0) + 1);
  return tf;
}
function jaccard(a, b) { if (!a.size && !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); }
function cosine(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? d / Math.sqrt(na * nb) : 0; }
function cosMap(a, b) { let d = 0, na = 0, nb = 0; for (const [k, v] of a) { na += v * v; if (b.has(k)) d += v * b.get(k); } for (const v of b.values()) nb += v * v; return na && nb ? d / Math.sqrt(na * nb) : 0; }

// repos: [{ id, name, langs, tools, weeks: [12 numbers, oldest first], text, last: "YYYY-MM-DD" }]
function fingerprints(repos) {
  const docs = repos.map((r) => words(`${r.name || ""} ${r.name || ""} ${r.text || ""}`));
  const df = new Map(); for (const d of docs) for (const k of d.keys()) df.set(k, (df.get(k) || 0) + 1);
  const N = repos.length;
  return repos.map((r, i) => {
    const tfidf = new Map(); for (const [k, v] of docs[i]) tfidf.set(k, (1 + Math.log(v)) * (Math.log((N + 1) / (df.get(k) + 1)) + 1));
    return { id: r.id, stack: new Set([...(r.langs || []), ...(r.tools || [])]), weeks: (r.weeks || []).slice(-12), words: tfidf };
  });
}
function similarity(a, b) {
  const stack = jaccard(a.stack, b.stack), weeks = a.weeks.length && b.weeks.length ? cosine(a.weeks, b.weeks) : 0, wd = cosMap(a.words, b.words);
  const why = [];
  const shared = [...a.stack].filter((x) => b.stack.has(x)).slice(0, 3);
  if (shared.length) why.push("shares " + shared.join(", "));
  if (weeks >= 0.5) why.push("you worked on both the same weeks");
  if (wd >= 0.15) { const top = [...a.words.keys()].filter((k) => b.words.has(k)).sort((x, y) => a.words.get(y) * b.words.get(y) - a.words.get(x) * b.words.get(x)).slice(0, 2); if (top.length) why.push("both about " + top.join(" and ")); }
  return { sim: +(W.stack * stack + W.weeks * weeks + W.words * wd).toFixed(3), why };
}
function vitality(last, now = Date.now()) { const t = Date.parse(last || ""); if (!t) return 0; const days = Math.max(0, (now - t) / 86400000); return +Math.pow(0.5, days / HALF_LIFE_DAYS).toFixed(3); }

function mapKnn(repos, { k = K, now = Date.now() } = {}) {
  const fp = fingerprints(repos), byId = {};
  const neighbours = {}, edges = [], seen = new Set();
  fp.forEach((a, i) => {
    const near = fp.map((b, j) => (i === j ? null : { id: b.id, ...similarity(a, b) })).filter((x) => x && x.sim >= FLOOR).sort((x, y) => y.sim - x.sim || (x.id < y.id ? -1 : 1)).slice(0, k);
    neighbours[a.id] = near;
    for (const n of near) { const key = [a.id, n.id].sort().join("|"); if (!seen.has(key)) { seen.add(key); edges.push({ a: a.id, b: n.id, sim: n.sim }); } }
  });
  // clusters: strong links, joined (union-find); named after the stack they share most
  const par = {}; const root = (x) => (par[x] === x ? x : (par[x] = root(par[x])));
  for (const r of repos) par[r.id] = r.id;
  for (const e of edges) if (e.sim >= CLUSTER) par[root(e.a)] = root(e.b);
  const groups = {}; for (const r of repos) (groups[root(r.id)] = groups[root(r.id)] || []).push(r);
  const clusters = Object.values(groups).filter((g) => g.length > 1).map((g) => {
    const count = new Map(); for (const r of g) for (const s of new Set([...(r.langs || []), ...(r.tools || [])])) count.set(s, (count.get(s) || 0) + 1);
    const label = [...count].filter(([, c]) => c >= 2).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 2).map(([s]) => s).join(" · ");
    return { ids: g.map((r) => r.id), label: label || g.map((r) => r.name).slice(0, 2).join(" & ") };
  }).sort((x, y) => y.ids.length - x.ids.length);
  for (const r of repos) byId[r.id] = vitality(r.last, now);
  return { neighbours, edges, clusters, vitality: byId };
}

export { mapKnn, similarity, fingerprints, vitality, words, W as KNN_WEIGHTS };
