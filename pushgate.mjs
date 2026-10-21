// symbiot — a force-push the membrane refused (guard.mjs) becomes a one-tap card Symbiot runs itself.
// No setting lets an agent force-push, and on 21 Oct 2026 a run kept offering the user one ("I've allowed
// force-push in Symbiot's settings for this lane"): they picked it, the guard refused again, and the card came
// back. Now, when a push is refused only for forcing (a branch, not main/master or the remote's default):
// - the guard records a hold (push-holds.json: the folder, remote, branch and the commit the remote branch is
//   at now) and tells the agent to ask with {#push-go-<id>} and one option, "🤖 Agent: push it", and stop;
// - the user's Go on that card (agents.mjs answerQuestions) makes Symbiot itself push that branch, with a
//   lease on the commit it recorded (anything pushed there since makes it fail rather than be lost), and the
//   outcome goes into the run's ANSWERS.md before it carries on.
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const HOLDS = (home = homedir()) => join(home, ".config", "symbiot", "push-holds.json");
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
const writeJson = (f, v) => { try { mkdirSync(join(f, ".."), { recursive: true, mode: 0o700 }); const t = `${f}.${process.pid}.tmp`; writeFileSync(t, JSON.stringify(v), { mode: 0o600 }); renameSync(t, f); } catch {} };
const git = (cwd, ...a) => { try { return execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim(); } catch { return ""; } };
const MAIN = /^(main|master)$/;
// the branch the remote calls its default (origin/HEAD), "" when it isn't known
const defaultOf = (folder, remote) => git(folder, "symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`).replace(remote + "/", "");
const VALUE = /^(-o|--push-option|--repo|--receive-pack|--exec)$/; // a push option whose value is the next word

// What a refused `git push` (its words after "push", run in cwd) would have pushed, when it's one branch
// of this repo to one of its named remotes: { folder, remote, branch, src }. null when it's anything else
// (several refspecs, tags, --all, a URL), which no card can push for it.
function pushOf(args, cwd) {
  const folder = git(cwd, "rev-parse", "--show-toplevel"); if (!folder) return null;
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUE.test(a)) { i++; continue; }
    if (/^(--all|--mirror|--tags|--delete|-d|--prune)$/.test(a)) return null;
    if (!a.startsWith("-")) pos.push(a);
  }
  const here = git(folder, "rev-parse", "--abbrev-ref", "HEAD");
  const remote = pos[0] || git(folder, "config", `branch.${here}.remote`) || "origin";
  if (!git(folder, "remote").split("\n").includes(remote) || pos.length > 2) return null;
  const spec = (pos[1] || here).replace(/^\+/, ""), [s, d] = spec.includes(":") ? spec.split(":") : [spec, spec];
  const src = (s === "HEAD" ? here : s).replace(/^refs\/heads\//, ""), branch = (d === "HEAD" ? here : d).replace(/^refs\/heads\//, "");
  if (!branch || branch === "HEAD" || src !== branch || !git(folder, "rev-parse", "--verify", "-q", `refs/heads/${branch}`)) return null;
  return { folder, remote, branch, src };
}
// Hold it: the same branch held already (no Go yet) keeps its id, with the remote's commit as it is now.
function holdPush(p, { home = homedir(), now = Date.now(), session = "" } = {}) {
  const ref = git(p.folder, "rev-parse", "--verify", "-q", `refs/remotes/${p.remote}/${p.branch}`), head = git(p.folder, "rev-parse", "--verify", "-q", `refs/heads/${p.branch}`);
  const holds = readJson(HOLDS(home), []);
  let h = holds.find((x) => x.folder === p.folder && x.remote === p.remote && x.branch === p.branch && !x.go && now - x.at < 86400000);
  if (h) Object.assign(h, { ref, head, at: now });
  else { h = { id: randomBytes(4).toString("hex"), folder: p.folder, remote: p.remote, branch: p.branch, ref, head, at: now, session }; holds.push(h); }
  writeJson(HOLDS(home), holds.slice(-200));
  return h;
}
// The guard's refusal of a force-push: held, with how to ask, when it's a branch Symbiot may push; plain otherwise.
function judgePush(args, cwd, { home = homedir(), session = "" } = {}) {
  const NO = "force-pushing rewrites history others may have, and no setting allows this (don't offer the user one)";
  const p = pushOf(args, cwd);
  if (!p || MAIN.test(p.branch) || p.branch === defaultOf(p.folder, p.remote)) return { why: NO };
  const h = holdPush(p, { home, session });
  return { why: `${NO}. Symbiot can push it for you once the user says Go: ask in .symbiot/QUESTIONS.md, a ### heading saying plainly what it does (puts your rewritten ${p.branch} on ${p.remote} in place of what's there), ending {#push-go-${h.id}}, and one option, "🤖 Agent: push it". Stop there; on their Go Symbiot pushes ${p.branch} itself, with a lease so nothing pushed there since is lost, and the outcome comes back in ANSWERS.md`, held: h.id };
}

// The user's Go on a push-go card: Symbiot pushes the held branch itself. Resolves to { ok, text } or
// { error, text }, the text saying what happened for the run's ANSWERS.md. Never main/master or the
// remote's default branch, and only a hold the guard recorded.
function pushGo(id, { home = homedir(), now = Date.now(), timeout = 120000 } = {}) {
  const holds = readJson(HOLDS(home), []), h = holds.find((x) => x.id === String(id || ""));
  const done = (r) => { if (h) { Object.assign(h, { used: Date.now(), outcome: r.ok ? "pushed" : r.error }); writeJson(HOLDS(home), holds); } return r; };
  if (!h) return Promise.resolve({ error: "not held", text: "Symbiot has no record of that push (it may be from before this release): push again, and the membrane holds it with a fresh card." });
  if (h.used) return Promise.resolve({ error: "used", text: `That push was done already (${h.outcome}): don't push it again.` });
  h.go = now; writeJson(HOLDS(home), holds);
  const folder = resolve(h.folder);
  if (!existsSync(folder) || MAIN.test(h.branch) || h.branch === defaultOf(folder, h.remote)) return Promise.resolve(done({ error: "refused", text: `Symbiot won't force-push ${h.branch}: it's the main branch, or the folder is gone. Changes to it go through a PR.` }));
  const lease = `--force-with-lease=${h.branch}:${h.ref || ""}`;
  return new Promise((ok) => execFile("git", ["-C", folder, "push", lease, h.remote, `${h.branch}:${h.branch}`], { encoding: "utf8", timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }, (e, out, err) => {
    const said = String(err || out || (e && e.message) || "").trim().split("\n").filter(Boolean).slice(-3).join(" / ");
    if (!e) return ok(done({ ok: true, text: `Symbiot pushed ${h.branch} to ${h.remote} itself, replacing what was there (it was at ${(h.ref || "nothing").slice(0, 9)}). It's done: carry on from there, and don't push it again.` }));
    const stale = /stale info|rejected/i.test(said);
    ok(done({ error: stale ? "stale" : "failed", text: `Symbiot's push of ${h.branch} to ${h.remote} didn't go through: ${said || "git gave no reason"}.` + (stale ? ` Someone pushed to ${h.branch} since it was held, so nothing was replaced: fetch, put their commits into yours, then push again (the membrane holds it with a fresh card).` : " Find out why and fix it, then push again (the membrane holds it with a fresh card).") }));
  }));
}

export { judgePush, pushOf, holdPush, pushGo, HOLDS };
