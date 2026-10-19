// Merged is not live. A lane's change is only live once it is deployed, so after Approve or a
// merge the task and the chat say which it is (dailify, 14 Oct 2026: Kea's fix was merged and
// showed as done, and the live site still failed, with nothing saying it was never deployed).
// deployTarget finds how a lane ships (the user's own config first, then the repo's deploy
// scripts and CI), liveNote says plainly what state a change is in, and deployAsk puts the
// "deploy it?" question on the Workdesk, because a deploy to production is the user's yes.
import { join } from "node:path";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { loadConfig, loadTasks, saveTasks } from "./core.mjs";
import { isDone } from "./asksdone.mjs";

const read = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
const json = (f) => { try { return JSON.parse(read(f)) || {}; } catch { return {}; } };
const SITE_FILES = { "fly.toml": "Fly.io", "vercel.json": "Vercel", "netlify.toml": "Netlify", "render.yaml": "Render", "app.yaml": "Google App Engine", "Procfile": "Heroku" };
const PUSH_MAIN = /\bpush\b[\s\S]{0,120}?branches:\s*(?:\[[^\]]*\b(?:main|master)\b|[\s\S]{0,40}?-\s*["']?(?:main|master)\b)/i;

// How a lane ships, or null when it has no deploy target. { how, url, auto, source }:
// how says it in words, auto is a CI deploy that runs by itself when the change lands on main.
// The user's config (config.json "deploy": { "<repo>": { "where", "url", "auto" } }) wins over
// what the repo's files suggest; a repo file is only ever read here, never run.
function deployTarget(path, repo = "") {
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
    return { how: `the ${f} workflow`, url: home, auto: PUSH_MAIN.test(t), source: ".github/workflows/" + f };
  }
  for (const [f, name] of Object.entries(SITE_FILES)) if (existsSync(join(path, f))) return { how: name, url: home, auto: false, source: f };
  return null;
}

const where = (t) => t.how + (t.url ? ` (${t.url})` : "");
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
    `- 🤖 Agent: hand the deploy to ops, then have it check the change on ${target.url || "the live site"} and report back (recommended)`,
    `- Skip this part: leave it merged and not live for now`,
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
function afterShip(path, repo, pr, stage, { ask = true } = {}) {
  const target = deployTarget(path, repo), live = liveNote(target, stage);
  if (pr) markTasks(repo, pr, live);
  const asked = ask && target && pr ? deployAsk(path, repo, pr, target, stage) : false; // stage: an Approve that queued the merge isn't merged yet (PR #209 was asked about as merged, 19 Oct 2026)
  return { ...live, ...(target ? { target: where(target) } : {}), ...(asked ? { asked: true } : {}) };
}
// Checked on the live site: the tasks of a PR (or the one task) are live now.
function markLive(id) {
  const t = loadTasks(), x = t.find((y) => y.id === id); if (!x) return { error: "not found" };
  x.liveState = "live"; x.liveNote = "Deployed and checked on the live site."; saveTasks(t);
  return { ok: true };
}

export { deployTarget, liveNote, deployAsk, markTasks, afterShip, markLive, askOf };
