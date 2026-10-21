// Merged is not live. A lane's change is only live once it is deployed, so after Approve or a
// merge the task and the chat say which it is (bookly, 14 Oct 2026: Wren's fix was merged and
// showed as done, and the live site still failed, with nothing saying it was never deployed).
// deployTarget finds how a lane ships (the user's own config first, then the repo's deploy
// scripts and CI), liveNote says plainly what state a change is in, and deployAsk puts the
// "deploy it?" question on the Workdesk, because a deploy to production is the user's yes.
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { loadConfig, saveConfig, loadTasks, saveTasks, CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";
import { isDone } from "./asksdone.mjs";
import { track, prKey, landed } from "./jobs.mjs";

const read = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
const json = (f) => { try { return JSON.parse(read(f)) || {}; } catch { return {}; } };
const SITE_FILES = { "fly.toml": "Fly.io", "vercel.json": "Vercel", "netlify.toml": "Netlify", "render.yaml": "Render", "app.yaml": "Google App Engine", "Procfile": "Heroku" };
const PUSH_MAIN = /\bpush\b[\s\S]{0,120}?branches:\s*(?:\[[^\]]*\b(?:main|master)\b|[\s\S]{0,40}?-\s*["']?(?:main|master)\b)/i;

// How a lane ships, or null when it has no deploy target. { how, url, auto, source }:
// how says it in words, auto is a CI deploy that runs by itself when the change lands on main.
// The user's config (config.json "deploy": { "<repo>": { "where", "url", "auto" } }) wins over
// what the repo's files suggest; a repo file is only ever read here, never run.
function deployTarget(path, repo = "") {
  const rb = runbookOf(repo); if (rb) return { how: rb.where, url: rb.url, auto: false, source: "its runbook", runbook: rb };
  const mine = (loadConfig().deploy || {})[repo];
  if (mine && typeof mine === "object") return { how: String(mine.where || "production"), url: String(mine.url || ""), auto: !!mine.auto, source: "your config" };
  if (!path) return null;
  const pkg = json(join(path, "package.json"));
  const home = typeof pkg.homepage === "string" && !/github\.com|npmjs\.com/i.test(pkg.homepage) ? pkg.homepage : "";
  const script = Object.keys(pkg.scripts || {}).find((k) => /^deploy/i.test(k));
  if (script) return { how: `npm run ${script}`, url: home, auto: false, source: "package.json" };
  for (const f of ["deploy.sh", "scripts/deploy.sh", "scripts/deploy.mjs", "scripts/deploy.js", "scripts/deploy"]) if (existsSync(join(path, f))) return { how: f, url: home, auto: false, source: f };
  if (/^deploy\s*:/m.test(read(join(path, "Makefile")))) return { how: "make deploy", url: home, auto: false, source: "Makefile" };
  const wf = join(path, ".github", "workflows");
  let files = []; try { files = readdirSync(wf).filter((f) => /\.ya?ml$/.test(f)); } catch {}
  for (const f of files) {
    const t = read(join(wf, f));
    if (!/deploy/i.test(f) && !/\b(?:ssh|rsync|scp|kubectl|helm|flyctl|vercel|netlify|gcloud\s+(?:app|run)|aws\s+(?:s3\s+sync|ecs|deploy)|docker\s+push)\b|\bdeploy\b/i.test(t)) continue;
    const paths = pushPaths(t);
    return { how: `the ${f} workflow`, url: home, auto: PUSH_MAIN.test(t), source: ".github/workflows/" + f, ...(paths.length ? { paths } : {}) };
  }
  for (const [f, name] of Object.entries(SITE_FILES)) if (existsSync(join(path, f))) return { how: name, url: home, auto: false, source: f };
  return null;
}

const where = (t) => t.how + (t.url ? ` (${t.url})` : "");
// The files a workflow deploys for: its push trigger's `paths:` ([] when it has none, so every
// change counts). symbiot's pages.yml runs only for site/**, so asking "deploy it?" about PRs
// #202 and #209, which changed no site file, asked about a deploy that never happens (19 Oct 2026).
function pushPaths(yml) {
  const m = String(yml || "").match(/^[ \t]*push:[^\n]*\n((?:[ \t]+[^\n]*\n?|[ \t]*\n)*)/m); if (!m) return [];
  const p = m[1].match(/^[ \t]*paths:[ \t]*(\[[^\]]*\]|\n(?:[ \t]*-[^\n]*\n?)+)/m); if (!p) return [];
  return [...p[1].matchAll(/["']([^"']+)["']|-\s*([^\s#"'][^\s#]*)/g)].map((x) => x[1] || x[2]).filter((g) => g && !g.startsWith("!"));
}
const globRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*") + "$");
const reaches = (target, files) => !target.paths || !Array.isArray(files) || files.some((f) => target.paths.some((g) => globRe(g).test(f)));
// A PR's changed files, from GitHub (null when gh can't say: then it's asked as before).
function prFiles(path, pr, gh = (args) => spawnSync("gh", args, { cwd: path, encoding: "utf8", timeout: 30000 })) {
  try { const r = gh(["pr", "view", String(pr), "--json", "files"]); if (r.status !== 0) return null; const f = (JSON.parse(String(r.stdout || "{}")).files || []).map((x) => x && x.path).filter(Boolean); return f.length ? f : null; } catch { return null; }
}
// The plain sentence for a change: stage "approved" (PR open, may be queued to merge) or "merged".
// state is what the task keeps: "none" nothing to deploy, "pending" not live yet.
function liveNote(target, stage = "merged") {
  if (!target) return { state: "none", text: stage === "merged" ? "Merged. This repo has no deploy target, so there is nothing more to ship." : "Nothing to deploy: this repo has no deploy target, so it is done once the PR merges." };
  if (stage !== "merged") return { state: "pending", text: `Not live yet: the PR still has to merge, then ${target.auto ? "CI deploys it" : "it has to be deployed"} to ${where(target)}.` };
  return { state: "pending", text: target.auto
    ? `Merged, and CI deploys it to ${where(target)} by itself. It is not live until that run finishes and the live site is checked.`
    : `Merged, but NOT live: it still has to be deployed to ${where(target)}. Symbiot asks you on the Workdesk before it deploys.` };
}

const askOf = (repo, pr, target) => `Deploy ${repo}${pr ? ` (${prName(pr)})` : ""} to ${where(target)}?`;
const prName = (pr) => { const n = String(pr || "").match(/(\d+)\/?$/); return n ? "PR #" + n[1] : String(pr); };
const same = (a, b) => { const x = String(a || "").match(/(\d+)\/?$/), y = String(b || "").match(/(\d+)\/?$/); return !!x && !!y && x[1] === y[1]; };

// ---- a lane's deploy runbook (review of 20 Oct 2026, proposal 4) ---------------------------
// 98 tasks in 11 days were about putting something live, and ops improvised the same ssh deploy each
// time. config.deploy[repo] = { where, how, url, check, expect?, policy }: the exact command (how)
// on where, the live address, an address (check) whose answer says it's up (2xx, with expect in
// it when given), and policy: "ask" (a "Deploy it?" each merge), "always" (a standing yes: after
// a merge it's deployed with no question) or "never". Written once, by ops after a deploy it did
// by hand (`symbiot deploy set`), or by the user's standing yes on the deploy question. "always" is
// only ever the user's (user: their Yes on the deploy card): from anyone else, the CLI
// an ops agent runs included, it's refused, and a standing yes given for one command on one host
// goes back to "ask" once either changes (review of the 20 Oct 2026 run). A change
// is live only once that check answered after the deploy run ended (deployTick), never because a
// command ran.
const POLICIES = ["ask", "always", "never"];
function runbookOf(repo, cfg = loadConfig()) {
  const r = (cfg.deploy || {})[repo]; if (!r || typeof r !== "object" || !r.how) return null;
  return { where: String(r.where || "production"), how: String(r.how), url: String(r.url || ""), check: String(r.check || r.url || ""), ...(r.expect ? { expect: String(r.expect) } : {}), policy: POLICIES.includes(r.policy) ? r.policy : "ask" };
}
function setRunbook(repo, f = {}, { user = false } = {}) {
  repo = String(repo || "").trim(); if (!repo) return { error: "Which lane?" };
  const cfg = loadConfig(), deploy = { ...(cfg.deploy || {}) }, was = deploy[repo] && typeof deploy[repo] === "object" ? deploy[repo] : {};
  const next = { ...was }; for (const k of ["where", "how", "url", "check", "expect", "policy"]) if (f[k] !== undefined) next[k] = String(f[k]).trim();
  if (!next.how) return { error: "The runbook needs the exact deploy command (--how)." };
  if (next.policy && !POLICIES.includes(next.policy)) return { error: `The policy is one of ${POLICIES.join(", ")}.` };
  if (f.policy !== undefined && next.policy === "always" && !user) return { error: "Deploying after every merge is the user's to switch on: they say so on the deploy card (\"after every merge from now on\"). Set the runbook with --policy ask, and the next merge asks them." };
  let dropped = false;
  if (next.policy === "always" && was.policy === "always" && !(user && f.policy === "always") && ["how", "where"].some((k) => String(next[k] || "") !== String(was[k] || ""))) { next.policy = "ask"; dropped = true; } // their yes was for that command there
  if (next.policy === "always" && !/^https?:\/\//.test(next.check || next.url || "")) return { error: "A standing yes needs a live check: give the address to check (--check) first." };
  deploy[repo] = next; cfg.deploy = deploy; saveConfig(cfg);
  return { ok: true, repo, runbook: runbookOf(repo, cfg), ...(dropped ? { dropped: true } : {}) };
}
// Deploys started from a runbook, waiting for their live check: [{ repo, pr, dir, at, state, note? }].
const DEPLOYS = () => join(CONFIG_DIR, "deploying.json"); // not deploys.json: that one is yours (drift.mjs loadDeploys: the production check)
const loadDeploys = () => readState(DEPLOYS(), Array.isArray) || [];
const saveDeploys = (l) => { try { writeJsonAtomic(DEPLOYS(), l.slice(-100), { indent: 1 }); } catch {} };
// Hand the runbook's command to ops (a repo lane reaches no server), told to run it as written.
async function startDeploy(repo, pr = "", { act } = {}) {
  const rb = runbookOf(repo); if (!rb) return { error: `${repo} has no deploy runbook.` };
  if (loadDeploys().some((d) => d.repo === repo && d.state === "running" && (!pr || same(d.pr, pr)))) return { ok: true, already: true };
  if (!act) act = (await import("./mind.mjs")).actNow;
  const brief = `Deploy ${repo}${pr ? ` (${prName(pr)}, merged)` : ""} with its runbook, exactly as written: on ${rb.where}, run \`${rb.how}\`. Don't improvise another way; if it fails, stop and say why in your last message, with the last lines of its output. Don't check the live site yourself: Symbiot checks ${rb.check || rb.url} once your run ends, and only that marks it live.`;
  const r = act(brief, { title: `Deploy ${repo}`, lane: repo });
  if (!r || r.error) return { error: (r && r.error) || "The deploy didn't start." };
  saveDeploys([...loadDeploys(), { repo, pr: String(pr || ""), dir: r.dir || "", at: Date.now(), state: "running" }]);
  if (pr) markTasks(repo, pr, { state: "pending", text: `Deploying to ${where({ how: rb.where, url: rb.url })} now, from its runbook. It's live once the check on ${rb.check || rb.url} answers.` });
  return { ok: true, dir: r.dir };
}
// The live check, once a deploy's run has ended: live only when it answers (2xx, with expect).
async function checkLive(rb, fetchFn = fetch) {
  const url = rb.check || rb.url; if (!/^https?:\/\//.test(url)) return { ok: false, why: "no address to check" };
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 20000), r = await fetchFn(url, { signal: ctrl.signal, redirect: "follow" }); clearTimeout(t);
    if (!r.ok) return { ok: false, why: `${url} answered ${r.status}` };
    if (rb.expect) { const body = await r.text(); if (!body.includes(rb.expect)) return { ok: false, why: `${url} answered, but without "${rb.expect}"` }; }
    return { ok: true };
  } catch (e) { return { ok: false, why: `${url} didn't answer (${String((e && e.message) || e).slice(0, 80)})` }; }
}
const DEPLOY_MAX = 2 * 3600000, clock = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
async function deployTick({ running = () => false, fetchFn = fetch, notify = () => {}, now = Date.now() } = {}) {
  const l = loadDeploys(); let changed = false;
  for (const d of l.filter((x) => x.state === "running")) {
    if (d.dir && running(d.dir) && now - d.at < DEPLOY_MAX) continue;
    const rb = runbookOf(d.repo); if (!rb) { d.state = "failed"; d.note = "its runbook was removed"; changed = true; continue; }
    const c = now - d.at >= DEPLOY_MAX && d.dir && running(d.dir) ? { ok: false, why: "the deploy run didn't finish in 2 hours" } : await checkLive(rb, fetchFn);
    d.state = c.ok ? "live" : "failed"; d.checked = now; if (!c.ok) d.note = c.why; changed = true;
    const text = c.ok ? `Live: deployed from its runbook and checked on ${rb.check || rb.url} at ${clock(now)}.` : `Deploy not live: ${c.why}. The deploy run's last words are on the Workdesk${d.dir ? ` (${d.dir.split("/").pop()})` : ""}.`;
    if (d.pr) markTasks(d.repo, d.pr, { state: c.ok ? "live" : "failed", text });
    try { notify("Symbiot", `${d.repo}: ${text}`); } catch {}
  }
  if (changed) saveDeploys(l);
  return l;
}
// A merge the Status watch saw (probes.mjs): "Deploy it?" as before, or with a standing yes, deployed.
async function onMerged(path, repo, pr, { act } = {}) {
  const rb = runbookOf(repo);
  if (rb && rb.policy === "never") return { skipped: "never" };
  if (rb && rb.policy === "always") return startDeploy(repo, pr, { act });
  return afterShip(path, repo, pr, "merged");
}
// The user's answer to "Deploy it?" for a lane with a runbook: Symbiot starts it itself (so the
// lane's agent doesn't improvise one through ops), and "from now on" is the standing yes.
const STANDING = /\bafter every merge\b|\bfrom now on\b/i;
async function onDeployAnswer(repo, q, a, { act } = {}) {
  const m = String(q || "").match(/^Deploy (.+?)(?: \((PR #\d+)\))? to /); const rb = runbookOf(repo);
  if (!m || !rb || !/^\W*(?:🤖\s*)?(?:Agent:\s*)?deploy\b/i.test(String(a || "").replace(/^\W+/u, ""))) return null;
  if (STANDING.test(a)) setRunbook(repo, { policy: "always" }, { user: true }); // the user's own Yes: the one way to a standing yes
  const prs = loadTasks().filter((t) => t.repo === repo && t.pr && m[2] && same(t.pr, m[2])).map((t) => t.pr);
  return startDeploy(repo, prs[0] || "", { act });
}

// Put the question on the Workdesk: appended to the lane's QUESTIONS.md, so the user's answer
// goes back to that lane's agent, who hands the deploy to ops (a repo lane reaches no server).
// Raised once per PR, and not again once it was answered. Gives true when it wrote one.
function deployAsk(path, repo, pr, target, stage = "merged") {
  if (!path || !target) return false;
  const q = askOf(repo, pr, target), f = join(path, ".symbiot", "QUESTIONS.md");
  if (isDone(q) || read(f).includes(q) || read(join(path, ".symbiot", "ANSWERS.md")).includes("### " + q)) return false;
  const body = [
    `### ${q}`,
    `${stage === "merged" ? "The change is merged but" : "The PR isn't merged yet (it merges by itself once its checks pass, if it can), and the change is"} not live until it is deployed${target.auto ? "; CI does that itself, so this is the check that it reached the site" : ""}. Deploying to production is your yes. Check first that the PR's tests passed${target.url ? ` and that ${target.url} still works` : ""}.`,
    ...(target.runbook ? [
      `- 🤖 Agent: deploy it now with its runbook, and after every merge from now on, each checked on ${target.runbook.check || target.url || "the live site"} (recommended)`,
      `- 🤖 Agent: deploy it now with its runbook, and ask again next time`,
    ] : [
      `- 🤖 Agent: hand the deploy to ops, then have it check the change on ${target.url || "the live site"} and report back (recommended)`,
      `- Skip this part: leave it merged and not live for now`,
    ]),
    "",
  ].join("\n");
  try {
    mkdirSync(join(path, ".symbiot"), { recursive: true });
    const old = read(f), head = /^##\s+Questions\s*$/m.test(old) ? "" : (old.trim() ? "\n## Questions\n" : "# Questions\n\n## Questions\n");
    const at = old.search(/^##\s+Suggestions/m), add = (at < 0 ? old.replace(/\s*$/, "\n") + head + body : old.slice(0, at).replace(/\s*$/, "\n\n") + body + "\n" + old.slice(at));
    writeFileSync(f, add);
    return true;
  } catch { return false; }
}

// What the tasks of a PR keep, so their card says merged-not-live: liveState "pending" or "none".
function markTasks(repo, pr, live) {
  const t = loadTasks(); let n = 0;
  for (const x of t) if (x.repo === repo && x.archived && (pr ? same(x.pr, pr) : false)) { x.liveState = live.state; x.liveNote = live.text; n++; }
  if (n) saveTasks(t);
  return n;
}
// After a merge, or an Approve that queued one: the note, the tasks marked, the question raised.
function afterShip(path, repo, pr, stage, { ask = true, files } = {}) {
  let target = deployTarget(path, repo);
  if (target && target.runbook && target.runbook.policy !== "ask") ask = false; // a standing yes deploys after the merge (onMerged); never, never asks
  if (target && target.paths && pr) { if (files === undefined) files = prFiles(path, pr); if (!reaches(target, files)) target = null; } // none of its files are ones the deploy runs for
  const live = target || !files ? liveNote(target, stage) : { state: "none", text: `${stage === "merged" ? "Merged." : "Nothing to deploy once the PR merges:"} None of its files are ones the site's deploy runs for, so nothing goes to the site.` };
  if (pr) markTasks(repo, pr, live);
  const asked = ask && target && pr ? deployAsk(path, repo, pr, target, stage) : false; // stage: an Approve that queued the merge isn't merged yet (PR #209 was asked about as merged, 19 Oct 2026)
  if (pr) landed(repo, pr); // the lane's runs that waited for this Approve are done, in this PR
  if (pr) track(prKey(repo, pr), { kind: "pr", lane: repo, text: `PR ${pr}`, pr, state: stage === "merged" ? "merged" : "approved", waitingOn: asked ? "user" : "", note: live.text });
  return { ...live, ...(target ? { target: where(target) } : {}), ...(asked ? { asked: true } : {}) };
}
// Checked on the live site: the tasks of a PR (or the one task) are live now.
function markLive(id) {
  const t = loadTasks(), x = t.find((y) => y.id === id); if (!x) return { error: "not found" };
  x.liveState = "live"; x.liveNote = "Deployed and checked on the live site."; saveTasks(t);
  if (x.repo && x.pr) track(prKey(x.repo, x.pr), { kind: "pr", lane: x.repo, state: "live", note: x.liveNote });
  return { ok: true };
}

export { deployTarget, liveNote, deployAsk, markTasks, afterShip, markLive, askOf, pushPaths, prFiles, runbookOf, setRunbook, startDeploy, checkLive, deployTick, onMerged, onDeployAnswer, loadDeploys, POLICIES };
