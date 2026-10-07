// The Map's nearest neighbours (mapknn.mjs): which repos belong together, and why.
import { mapKnn, similarity, fingerprints, vitality } from "../mapknn.mjs";

let pass = 0, fail = 0;
function ok(name, cond, got) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + "  got: " + JSON.stringify(got).slice(0, 300)); } }

console.log("NEAREST NEIGHBOURS ON THE MAP — stack, weeks and words");
const DAY = 86400000, now = Date.parse("2026-10-06T12:00:00Z");
const repos = [
  { id: "repo:symbiot", name: "symbiot", langs: ["JavaScript", "Shell"], tools: ["Node"], weeks: [0, 0, 0, 0, 0, 0, 2, 5, 9, 12, 20, 30], text: "Your week, written from your real work. Hand tasks to your coding agent.", last: "2026-10-06" },
  { id: "repo:symbiot-desktop", name: "symbiot-desktop", langs: ["JavaScript"], tools: ["Node", "Electron"], weeks: [0, 0, 0, 0, 0, 0, 1, 4, 8, 10, 15, 22], text: "Symbiot as a desktop app: your coding agent, your week.", last: "2026-10-05" },
  { id: "repo:whatsapp_module", name: "whatsapp_module", langs: ["Python"], tools: [], weeks: [3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], text: "WhatsApp forwarding module: reads chats and forwards messages to a webhook.", last: "2026-07-20" },
  { id: "repo:BTS", name: "BTS", langs: ["Python"], tools: [], weeks: [2, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], text: "A webhook bot that forwards messages.", last: "2026-07-25" },
  { id: "folder:notes", name: "notes", langs: ["Markdown"], tools: [], weeks: [], text: "", last: "" },
];
const k = mapKnn(repos, { now });
ok("each repo's nearest is the one most like it: symbiot ↔ symbiot-desktop, whatsapp_module ↔ BTS", k.neighbours["repo:symbiot"][0].id === "repo:symbiot-desktop" && k.neighbours["repo:whatsapp_module"][0].id === "repo:BTS", [k.neighbours["repo:symbiot"][0], k.neighbours["repo:whatsapp_module"][0]]);
ok("at most k = 3 neighbours, never itself, best first", Object.entries(k.neighbours).every(([id, n]) => n.length <= 3 && n.every((x) => x.id !== id) && n.every((x, i) => !i || n[i - 1].sim >= x.sim)), k.neighbours);
ok("a repo with nothing in common has no neighbours (no forced links)", k.neighbours["folder:notes"].length === 0, k.neighbours["folder:notes"]);
const why = k.neighbours["repo:symbiot"][0].why.join("; ");
ok("the reasons say why, in plain words: shared stack, same weeks, same subject", /shares JavaScript, Node/.test(why) && /same weeks/.test(why) && /both about/.test(why), why);
ok("two clusters, named after what they share most", k.clusters.length === 2 && k.clusters.some((c) => c.ids.includes("repo:symbiot") && c.ids.includes("repo:symbiot-desktop") && /JavaScript/.test(c.label) && /Node/.test(c.label)) && k.clusters.some((c) => c.ids.includes("repo:BTS") && /Python/.test(c.label)), k.clusters);
ok("edges are listed once each", new Set(k.edges.map((e) => [e.a, e.b].sort().join("|"))).size === k.edges.length, k.edges.length);
ok("vitality: today is alive, months ago has faded, never-worked-on is 0", k.vitality["repo:symbiot"] > 0.9 && k.vitality["repo:whatsapp_module"] < 0.1 && k.vitality["folder:notes"] === 0, k.vitality);
ok("vitality halves every 3 weeks", Math.abs(vitality(new Date(now - 21 * DAY).toISOString().slice(0, 10), now) - 0.5) < 0.03, vitality(new Date(now - 21 * DAY).toISOString().slice(0, 10), now));
const fp = fingerprints(repos);
ok("similarity is symmetric", similarity(fp[0], fp[1]).sim === similarity(fp[1], fp[0]).sim, "");
ok("a word every repo shares counts for less than a rare one (TF-IDF)", (() => { const f = fingerprints([{ id: "a", name: "a", text: "webhook symbiot" }, { id: "b", name: "b", text: "webhook symbiot" }, { id: "c", name: "c", text: "webhook" }]); return f[0].words.get("symbiot") > f[0].words.get("webhook"); })(), "");
ok("the same repos give the same map (deterministic)", JSON.stringify(mapKnn(repos, { now })) === JSON.stringify(k), "");
ok("one repo alone: no neighbours, no clusters, no error", (() => { const one = mapKnn([repos[0]], { now }); return one.neighbours["repo:symbiot"].length === 0 && one.clusters.length === 0; })(), "");

console.log((fail ? "✗" : "✓") + " mapknn: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
