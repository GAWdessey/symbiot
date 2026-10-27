// Sync (sync.mjs, docs/SYNC.md): two Symbiot homes (this computer and a work laptop) and one
// bare repo between them. A lane's tasks and a memory fact go both ways; the same repo in a
// folder of another name on each is one lane; nothing in the repo reads without the vault PIN.
// Each home runs in a process of its own (CONFIG_DIR is fixed when core.mjs loads).
//
//   node test/sync.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url)), T = mkdtempSync(join(tmpdir(), "symbiot-sync-"));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };
const sh = (cmd, args, cwd) => { const r = spawnSync(cmd, args, { cwd, encoding: "utf8" }); if (r.status) throw new Error(`${cmd} ${args.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
const PIN = "harbour-731";
// run code as one home: `S` is sync.mjs, `V` vaultview.mjs, `C` core.mjs, `M` mind.mjs; prints JSON
function as(home, code) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, SYMBIOT_VAULT: "file", GIT_TERMINAL_PROMPT: "0" };
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `const S = await import(${JSON.stringify(pathToFileURL(join(ROOT, "sync.mjs")).href)}), V = await import(${JSON.stringify(pathToFileURL(join(ROOT, "vaultview.mjs")).href)}), C = await import(${JSON.stringify(pathToFileURL(join(ROOT, "core.mjs")).href)}), M = await import(${JSON.stringify(pathToFileURL(join(ROOT, "mind.mjs")).href)});\nconst out = await (async () => { ${code} })();\nconsole.log("\\n@@" + JSON.stringify(out ?? null));`], { env, encoding: "utf8", timeout: 120000 });
  const line = (r.stdout || "").split("\n@@").pop();
  try { return JSON.parse(line); } catch { return { crashed: true, stderr: (r.stderr || "").slice(-1500), stdout: (r.stdout || "").slice(-500) }; }
}
const home = (n) => { const h = join(T, n); mkdirSync(join(h, ".config", "symbiot"), { recursive: true }); return h; };
const cfg = (h, f) => join(h, ".config", "symbiot", f);
const put = (h, f, v) => writeFileSync(cfg(h, f), JSON.stringify(v));

// One repo, Acme: in work/acme on this computer, in code/acme-app on the laptop.
const A = home("pop-os"), B = home("laptop"), REMOTE = join(T, "sync.git");
const repoA = join(A, "work", "acme"); mkdirSync(repoA, { recursive: true });
sh("git", ["init", "-q", "-b", "main"], repoA); writeFileSync(join(repoA, "README.md"), "acme\n");
sh("git", ["-c", "user.name=t", "-c", "user.email=t@t", "add", "."], repoA); sh("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "first"], repoA);
const repoB = join(B, "code", "acme-app"); mkdirSync(join(B, "code"), { recursive: true }); sh("git", ["clone", "-q", repoA, repoB], T);
const gid = "g" + sh("git", ["rev-list", "--max-parents=0", "HEAD"], repoA).slice(0, 12);
put(A, "lane-ids.json", { ids: { [gid]: { name: "acme", path: repoA, at: 1 } }, renamed: [] });
put(B, "lane-ids.json", { ids: { [gid]: { name: "acme-app", path: repoB, at: 1 } }, renamed: [] });
sh("git", ["init", "-q", "--bare", "-b", "main", REMOTE], T);

const TASK = "Add the streak counter to the Acme home screen";
put(A, "tasks.json", [{ id: "t1", text: TASK, repo: "acme", laneId: gid, done: false, ts: 1 }]);
put(A, "mind.json", { nodes: [{ id: "n1", name: "Acme", kind: "project", facts: [{ text: "Acme ships to the Play Store under GAWdessey.", ts: 1, where: "Home" }], ts: 1 }], log: [{ ts: 1, role: "user", text: "a chat line that stays here" }] });
mkdirSync(join(repoA, ".symbiot"), { recursive: true });
writeFileSync(join(repoA, ".symbiot", "ANSWERS.md"), "# Answers from the user\n\n### Which colour for the streak? {#colour}\nOrange.\n");

try {
  console.log("1) PAIRING");
  ok("the first computer won't set up sync without a vault PIN", /vault PIN/.test(as(A, `return S.init(${JSON.stringify(REMOTE)}, ${JSON.stringify(PIN)});`).error || ""));
  const init = as(A, `V.setPin(${JSON.stringify(PIN)}); return S.init(${JSON.stringify(REMOTE)}, ${JSON.stringify(PIN)});`);
  ok("…with one, it does, and publishes this computer's state", init.ok && init.tasks === 1 && init.memory === 1, init);
  const wrong = as(B, `return S.pair(${JSON.stringify(REMOTE)}, "not-the-pin");`);
  ok("the laptop can't pair with a wrong PIN", /doesn't open the sync/.test(wrong.error || ""), wrong);
  const paired = as(B, `return S.pair(${JSON.stringify(REMOTE)}, ${JSON.stringify(PIN)});`);
  ok("…with the right one it pairs, and that PIN becomes its vault PIN", paired.ok && paired.pinSet === true && paired.from.length === 1, paired);

  console.log("2) THIS COMPUTER → THE LAPTOP");
  const tb = JSON.parse(readFileSync(cfg(B, "tasks.json"), "utf8"));
  ok("the lane's task is on the laptop", tb.length === 1 && tb[0].text === TASK, tb);
  ok("…filed under the laptop's own folder for the same repo (acme-app), by the repo's id", tb[0].repo === "acme-app" && tb[0].laneId === gid, tb[0]);
  const mb = JSON.parse(readFileSync(cfg(B, "mind.json"), "utf8"));
  ok("the memory fact is on the laptop", mb.nodes.some((n) => n.name === "Acme" && n.facts.some((f) => /Play Store/.test(f.text))), mb.nodes);
  ok("…and the chat log stayed behind", !(mb.log || []).length, mb.log);
  ok("the lane's answers are in the laptop's folder for it", /Orange\./.test(readFileSync(join(repoB, ".symbiot", "ANSWERS.md"), "utf8")));

  console.log("3) THE LAPTOP → THIS COMPUTER");
  as(B, `const t = C.loadTasks(); t[0].done = true; t.push({ id: "t2", text: "Fix the streak reset at midnight", repo: "acme-app", laneId: ${JSON.stringify(gid)}, done: false, ts: 2 }); C.saveTasks(t); M.remember([{ name: "Acme", kind: "project", fact: "Acme's streak resets at the user's local midnight." }], "Home"); return true;`);
  const rb = as(B, `return S.now();`);
  ok("the laptop syncs", rb.ok && rb.tasks === 2 && rb.memory === 2, rb);
  const ra = as(A, `return S.now();`);
  ok("this computer syncs", ra.ok && ra.from.length === 1, ra);
  const ta = JSON.parse(readFileSync(cfg(A, "tasks.json"), "utf8"));
  ok("the tick made on the laptop is here", ta.find((t) => t.id === "t1")?.done === true, ta);
  ok("…and the laptop's new task, under this computer's folder name (acme)", ta.find((t) => t.id === "t2")?.repo === "acme", ta);
  const ma = JSON.parse(readFileSync(cfg(A, "mind.json"), "utf8")), node = ma.nodes.find((n) => n.name === "Acme");
  ok("the fact learned on the laptop is here, beside the one learned here, in one node", node && node.facts.length === 2 && node.id === "n1", node);
  ok("…and this computer's chat log is untouched", ma.log.length === 1);

  console.log("4) BOTH CHANGE THE SAME TASK");
  as(A, `const t = C.loadTasks(); t.find((x) => x.id === "t2").text = "Fix the streak reset at local midnight"; C.saveTasks(t); return true;`);
  as(B, `const t = C.loadTasks(); t.find((x) => x.id === "t2").done = true; C.saveTasks(t); return true;`);
  as(A, `return S.now();`); as(B, `return S.now();`); as(A, `return S.now();`);
  const a2 = as(A, `return C.loadTasks().find((x) => x.id === "t2");`), b2 = as(B, `return C.loadTasks().find((x) => x.id === "t2");`);
  ok("different fields changed on each side: both changes kept, on both", a2.text === "Fix the streak reset at local midnight" && a2.done === true && b2.text === a2.text && b2.done === true, [a2, b2]);
  as(A, `const t = C.loadTasks(); t.find((x) => x.id === "t1").text = "Streak counter (top right)"; C.saveTasks(t); return true;`);
  await new Promise((r) => setTimeout(r, 20));
  as(B, `const t = C.loadTasks(); t.find((x) => x.id === "t1").text = "Streak counter (under the title)"; C.saveTasks(t); return true;`);
  as(A, `return S.now();`); const rc = as(B, `return S.now();`); as(A, `return S.now();`);
  const a1 = as(A, `return C.loadTasks().find((x) => x.id === "t1").text;`), b1 = as(B, `return C.loadTasks().find((x) => x.id === "t1").text;`);
  ok("the same field changed on both: the newer change wins on both", a1 === "Streak counter (under the title)" && b1 === a1, [a1, b1]);
  const conf = JSON.parse(readFileSync(cfg(B, "sync-conflicts.json"), "utf8"));
  ok("…and the one it replaced is kept, not lost", rc.conflicts === 1 && conf.some((c) => c.replaced === "Streak counter (top right)"), conf);

  console.log("5) A TASK DELETED ON ONE SIDE");
  as(B, `C.saveTasks(C.loadTasks().filter((x) => x.id !== "t2")); return true;`); as(B, `return S.now();`); as(A, `return S.now();`); as(A, `return S.now();`);
  ok("is gone on the other, and stays gone", !as(A, `return C.loadTasks().some((x) => x.id === "t2");`) && !as(B, `return S.now().then(() => C.loadTasks().some((x) => x.id === "t2"));`));

  console.log("6) WHAT THE REPO HOLDS");
  const files = sh("git", ["--git-dir", REMOTE, "ls-tree", "-r", "--name-only", "main"], T).split("\n");
  ok("keys.json and one sealed file per machine", files.includes("keys.json") && files.filter((f) => /^machines\/[0-9a-f]+\.enc$/.test(f)).length === 2, files);
  const blob = files.map((f) => sh("git", ["--git-dir", REMOTE, "show", "main:" + f], T)).join("\n") + sh("git", ["--git-dir", REMOTE, "log", "--format=%s%n%b", "main"], T);
  ok("not a task, a fact, an answer or the PIN is readable in it", !/streak|Acme|Play Store|Orange|harbour/i.test(blob));
  ok("the sync key isn't in it either, only wrapped", !blob.includes(as(A, `const v = await import(${JSON.stringify(pathToFileURL(join(ROOT, "vault.mjs")).href)}); return v.peekSecret(S.KEY_NAME).values[0].v;`)));
  ok("the sync key is kept in each computer's vault, and isn't synced as a secret", !as(B, `const v = await import(${JSON.stringify(pathToFileURL(join(ROOT, "vault.mjs")).href)}); return (await S.stamped()).vault[S.KEY_NAME] || null;`));

  console.log("7) SECRETS");
  as(A, `const v = await import(${JSON.stringify(pathToFileURL(join(ROOT, "vault.mjs")).href)}); v.saveSecret("acme play console token", ["tok-123"]); return S.now();`);
  ok("a secret saved here reaches the laptop's vault", as(B, `await S.now(); const v = await import(${JSON.stringify(pathToFileURL(join(ROOT, "vault.mjs")).href)}); return v.peekSecret("acme play console token").values?.[0]?.v;`) === "tok-123");

  console.log("8) TWO LANES CALLED MARKETING, TWO REPOS");
  // each computer's marketing is a repo of its own: a task made for this one's is the laptop's to leave alone
  const mk = (h, word) => { const p = join(h, "lanes", "marketing"); mkdirSync(p, { recursive: true }); sh("git", ["init", "-q", "-b", "main"], p); writeFileSync(join(p, "README.md"), word + "\n"); sh("git", ["-c", "user.name=t", "-c", "user.email=t@t", "add", "."], p); sh("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", word], p); return { p, id: "g" + sh("git", ["rev-list", "--max-parents=0", "HEAD"], p).slice(0, 12) }; };
  const mA = mk(A, "tracker"), mB = mk(B, "site");
  const withLane = (h, m) => { const d = JSON.parse(readFileSync(cfg(h, "lane-ids.json"), "utf8")); d.ids[m.id] = { name: "marketing", path: m.p, at: 1 }; put(h, "lane-ids.json", d); };
  withLane(A, mA); withLane(B, mB);
  ok("the two marketing lanes have different ids", mA.id !== mB.id, [mA.id, mB.id]);
  const MT = "Resume the stalled fix for the GitHub installer downloads figure";
  as(A, `const t = C.loadTasks(); t.push({ id: "m1", text: ${JSON.stringify(MT)}, repo: "marketing", laneId: ${JSON.stringify(mA.id)}, done: false, ts: Date.now() }); C.saveTasks(t); return S.now();`);
  as(B, `return S.now();`);
  const L = `const L = await import(${JSON.stringify(pathToFileURL(join(ROOT, "laneids.mjs")).href)});`, Hm = `const H = await import(${JSON.stringify(pathToFileURL(join(ROOT, "home.mjs")).href)});`;
  const mb1 = as(B, `return C.loadTasks().find((x) => x.id === "m1");`);
  ok("the laptop has the task, under marketing, with this computer's lane id", mb1 && mb1.repo === "marketing" && mb1.laneId === mA.id, mb1);
  ok("…which the laptop knows is the other computer's lane, and this computer knows is its own", as(B, `${L} return L.otherMachine(C.loadTasks().find((x) => x.id === "m1"));`) === true && as(A, `${L} return L.otherMachine(C.loadTasks().find((x) => x.id === "m1"));`) === false);
  const why = (h, p) => as(h, `${Hm} return H.waitWhy({ map: { marketing: ${JSON.stringify(p)} }, named: (_, n) => n, running: [], held: {}, ready: new Set(), isParked: () => false, deps: { cmd: () => "claude", fails: {}, beside: () => new Set(), brief: () => ({ at: 0, tasks: [] }), lastRun: () => 0 } })(C.loadTasks().find((x) => x.id === "m1"));`);
  const wB = why(B, mB.p), wA = why(A, mA.p);
  ok("on the laptop it waits for the other computer, and nothing starts it there", wB.kind === "elsewhere" && wB.noGo === true && /other computer/.test(wB.text), wB);
  ok("…while this computer starts it in its own marketing", wA.kind === "next", wA);
  const T2 = `const T = await import(${JSON.stringify(pathToFileURL(join(ROOT, "tasks.mjs")).href)});`;
  const pb = as(B, `${T2} const fs = await import("node:fs"), r = T.pushTasks({ repo: "marketing" }); let brief = ""; try { brief = fs.readFileSync(${JSON.stringify(join(mB.p, ".symbiot", "TASKS.md"))}, "utf8"); } catch {} return { r, brief };`);
  ok("the laptop's marketing brief never gets it", pb && pb.r.empty === true && !/installer downloads/.test(pb.brief || ""), pb);
  const Gm = `const G = await import(${JSON.stringify(pathToFileURL(join(ROOT, "goals.mjs")).href)}), J = await import(${JSON.stringify(pathToFileURL(join(ROOT, "jobs.mjs")).href)});`;
  const old = Date.now() - 3 * 86400e3, deps = `{ tasks: C.loadTasks(), jobs: J.loadJobs(), map: { marketing: ${JSON.stringify(mB.p)} } }`;
  const gB = as(B, `${Gm} const g = { key: "goal:mk1", kind: "goal", lane: "marketing", text: "Fix the installer downloads figure", asked: "Fix the installer downloads figure", doneWhen: "the figure is right", children: ["task:m1"], paths: [], state: "running", waitingOn: "", what: "", at: ${old}, changed: ${old}, moved: ${old}, history: [] }; J.putGoal(g, { now: ${old} }); await G.goalsTick(${deps}, { now: ${old} }); await G.goalsTick(${deps}, { now: ${old} + 3 * 86400e3 }); return G.goalById("goal:mk1");`);
  ok("its goal, three days on, waits on the other computer and isn't called stalled", gB && gB.waitingOn === "another computer" && !(gB.card && gB.card.kind === "stalled"), gB);

  console.log("9) THE MERGE ITSELF");
  const U = await import("../sync.mjs");
  ok("answers given on both sides are all kept", (() => { const u = U.unionSections("# A\n\n### one\nx\n", "# A\n\n### two\ny\n"); return /### one\nx/.test(u) && /### two\ny/.test(u) && u.split("### one").length === 2; })());
  ok("a lane is its repo's first commit on every machine, its name otherwise", U.laneKey("gabc", "x") === "gabc" && U.laneKey("p123", "Notes") === "n:notes");
  const m = U.mergeRecords({ k: { f: { a: ["mine", 5] } } }, { k: { del: 7, f: { a: ["mine", 5] } } });
  ok("a delete newer than every change wins", m.k.del === 7);
  const n = U.mergeRecords({ k: { f: { a: ["changed", 9] } } }, { k: { del: 7, f: { a: ["old", 5] } } });
  ok("…a change newer than the delete keeps the record", n.k.f.a[0] === "changed" && n.k.f.a[1] > n.k.del);

  console.log("10) TWO IDS FOR ONE FOLDER");
  // a lane's old id was left naming the folder of a copy of its repo (the same first commit), so the sync
  // put its questions there and they left its own (27 Oct 2026): one key per folder, the newest
  const H = home("stale"), forge = join(H, "work", "forge"), daily = join(H, "work", "daily");
  for (const [p, q] of [[forge, "### Forge's own question? {#forge}\n"], [daily, "### Put main live? {#deploy-and-call}\n"]]) { mkdirSync(join(p, ".symbiot"), { recursive: true }); writeFileSync(join(p, ".symbiot", "QUESTIONS.md"), q); }
  put(H, "lane-ids.json", { ids: { g67de65ad23ce: { name: "forge", path: forge, at: 1 }, pf0: { name: "forge", path: forge, at: 2 }, pd0: { name: "daily", path: daily, at: 2 } }, renamed: [] });
  const st = as(H, `const s = await S.stamped(); return Object.fromEntries(Object.entries(s.lanes).map(([k, r]) => [k, r.f.text[0]]));`);
  ok("a folder's questions go under one key, its id now; the stale id carries nothing", st["n:forge/QUESTIONS.md"] && /\{#forge\}/.test(st["n:forge/QUESTIONS.md"]) && !("g67de65ad23ce/QUESTIONS.md" in st) && /deploy-and-call/.test(st["n:daily/QUESTIONS.md"] || ""), st);
} catch (e) { fail++; console.log("  ✗ threw: " + (e && e.stack || e)); }

console.log(`\n${fail ? "✗" : "✓"} sync: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
