// Drift facts for one repo: what's out of sync, stuck or at risk, from git
// alone (plus gh for --ci and the user's own deploy commands).
import { join } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { CONFIG_DIR, sh, hasCmd, repoState } from "./core.mjs";

// ---- drift: what's out of sync / stuck / at risk (deterministic git facts) -
function gitDefaultBranch(repo) {
  const d = sh(`git -C ${JSON.stringify(repo)} symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null`).trim();
  if (d) return d.replace(/^origin\//, "");
  for (const b of ["main", "master", "develop"]) if (sh(`git -C ${JSON.stringify(repo)} rev-parse --verify -q refs/remotes/origin/${b} 2>/dev/null`).trim()) return b;
  return sh(`git -C ${JSON.stringify(repo)} rev-parse --abbrev-ref HEAD 2>/dev/null`).trim() || "main";
}
function fetchAgeDays(repo) {
  const gd = sh(`git -C ${JSON.stringify(repo)} rev-parse --git-common-dir 2>/dev/null`).trim();
  if (!gd) return null;
  const p = gd.startsWith("/") ? join(gd, "FETCH_HEAD") : join(repo, gd, "FETCH_HEAD");
  try { return Math.floor((Date.now() - statSync(p).mtimeMs) / 86400000); } catch { return null; }
}
function worktreeCount(repo) { return sh(`git -C ${JSON.stringify(repo)} worktree list 2>/dev/null`).split("\n").filter(Boolean).length; }
// Deployed-sha commands are read ONLY from the user's own config (never from a
// repo file, which could be attacker-controlled): ~/.config/symbiot/deploys.json
function loadDeploys() { try { return JSON.parse(readFileSync(join(CONFIG_DIR, "deploys.json"), "utf8")); } catch { return {}; } }
function ciState(repo, def) {
  if (!hasCmd("gh")) return null;
  if (!/github\.com/i.test(sh(`git -C ${JSON.stringify(repo)} remote get-url origin 2>/dev/null`))) return null;
  const j = sh(`cd ${JSON.stringify(repo)} && gh run list --branch ${def} --limit 1 --json databaseId,conclusion,status 2>/dev/null`).trim();
  if (!j) return null;
  try {
    const a = JSON.parse(j); if (!a.length) return null; const r = a[0];
    if (r.status && r.status !== "completed") return { level: "info", text: `CI on ${def}: ${r.status}` };
    if (r.conclusion === "success") return { level: "info", text: `CI on ${def}: passing` };
    if (r.conclusion === "failure") {
      // Deterministic "not running" signal: every job has 0 steps (never started).
      let notRun = false, reason = "";
      try {
        const jobs = (JSON.parse(sh(`cd ${JSON.stringify(repo)} && gh run view ${r.databaseId} --json jobs 2>/dev/null`)).jobs) || [];
        notRun = jobs.length > 0 && jobs.every((x) => ((x.steps || []).length === 0));
        if (notRun && jobs[0] && jobs[0].databaseId) {
          // Only on the not-running path: fetch the one job's annotation to quote
          // GitHub's exact reason (billing / spending limit / runner / disabled).
          const cru = sh(`cd ${JSON.stringify(repo)} && gh api repos/{owner}/{repo}/actions/jobs/${jobs[0].databaseId} --jq .check_run_url 2>/dev/null`).trim();
          const crid = (cru.match(/check-runs\/(\d+)/) || [])[1];
          if (crid) { const m = sh(`cd ${JSON.stringify(repo)} && gh api repos/{owner}/{repo}/check-runs/${crid}/annotations --jq '.[0].message' 2>/dev/null`).trim(); if (m) reason = m.slice(0, 240); }
        }
      } catch {}
      if (notRun) return { level: "warn", text: reason ? `CI is NOT running on ${def}: "${reason}"` : `CI is NOT running on ${def} — jobs never started (reason unavailable; usually a billing/spending-limit stop), not failing tests` };
      return { level: "warn", text: `CI's last run on ${def} failed (a real failure — jobs ran)` };
    }
    if (r.conclusion) return { level: "warn", text: `CI on ${def}: ${r.conclusion}` };
    return null;
  } catch { return null; }
}
// For merges that aren't on the default branch, tell "likely never landed"
// (added files missing from default) from "merged another way" (all present).
function mergedOffDefault(p, defRef) {
  const raw = sh(`git -C ${JSON.stringify(p)} log --merges --all --not ${defRef} --format='%H|%s' 2>/dev/null`)
    .split("\n").filter((l) => /merge pull request/i.test(l));
  if (!raw.length) return [];
  const defFiles = new Set(sh(`git -C ${JSON.stringify(p)} ls-tree -r --name-only ${defRef} 2>/dev/null`).split("\n").filter(Boolean));
  const hits = [];
  for (const line of raw.slice(0, 12)) {
    const [sha, subj] = line.split("|");
    const prNum = (subj.match(/#(\d+)/) || [])[1] || "?";
    const parents = sh(`git -C ${JSON.stringify(p)} rev-list --parents -n1 ${sha} 2>/dev/null`).trim().split(/\s+/);
    const head = parents[2]; // 2nd parent = the merged branch head
    let added = 0, missing = 0;
    if (head) {
      const mb = sh(`git -C ${JSON.stringify(p)} merge-base ${head} ${defRef} 2>/dev/null`).trim();
      const files = sh(`git -C ${JSON.stringify(p)} diff --name-status ${mb || defRef} ${head} 2>/dev/null`)
        .split("\n").map((l) => l.trim()).filter((l) => /^A\b|^A\t/.test(l)).map((l) => l.split(/\s+/).pop());
      added = files.length;
      for (const f of files) if (f && !defFiles.has(f)) missing++;
    }
    hits.push({ prNum, sha: sha.slice(0, 9), added, missing });
  }
  return hits;
}
// Drift facts for ONE repo. Compares against origin/<default> when a remote
// exists, else the local default branch (so it also works on local-only repos).
function driftRepo(p, opts = {}) {
  const name = p.split("/").pop();
  const def = gitDefaultBranch(p), st = repoState(p), flags = [];
  const originDef = sh(`git -C ${JSON.stringify(p)} rev-parse --verify -q refs/remotes/origin/${def} 2>/dev/null`).trim();
  const localDef = sh(`git -C ${JSON.stringify(p)} rev-parse --verify -q refs/heads/${def} 2>/dev/null`).trim();
  const defRef = originDef ? `origin/${def}` : (localDef ? def : "");
  const cmd = opts.deploys && (opts.deploys[p] || opts.deploys[name]);
  // Fetch only when asked, or for a deploy-configured repo (comparing a live
  // deployed sha against a stale origin gives a confidently wrong answer).
  if (originDef && (opts.fetch || cmd)) sh(`git -C ${JSON.stringify(p)} fetch -q origin 2>/dev/null`);
  const fa = fetchAgeDays(p);
  const stale = fa != null && fa > 1 ? ` (as of ${fa}d ago)` : "";

  if (st.stale) flags.push({ level: "warn", text: `checkout is stale — working tree ≈ ${st.staleBy ? "HEAD~" + st.staleBy : "an older commit"}, not new work` });
  else if (st.dirty) flags.push({ level: "info", text: `${st.dirty} uncommitted (${st.mod} mod / ${st.del} del / ${st.add} new)` });
  if (st.behind) flags.push({ level: "warn", text: `${st.behind} behind upstream on ${st.branch}${stale}` });
  const wc = worktreeCount(p); if (wc > 1) flags.push({ level: "info", text: `${wc} checkouts of this repo` });
  if (originDef) {
    const unmerged = sh(`git -C ${JSON.stringify(p)} branch -r --no-merged origin/${def} 2>/dev/null`).split("\n").map((s) => s.trim()).filter((b) => b && !b.startsWith("origin/HEAD"));
    if (unmerged.length) flags.push({ level: "info", text: `${unmerged.length} branch(es) with work not on ${def}` });
  }
  if (defRef) {
    const hits = mergedOffDefault(p, defRef);
    const gone = hits.filter((h) => h.added > 0 && h.missing > 0);
    const other = hits.length - gone.length;
    if (gone.length) flags.push({ level: "warn", text: `${gone.length} PR(s) merged off ${def} with added files MISSING from ${def} — likely never landed`, evidence: gone.slice(0, 5).map((h) => `#${h.prNum} (${h.missing}/${h.added} files missing)`).join(" | ") });
    if (other > 0) flags.push({ level: "info", text: `${other} other PR merge(s) off ${def} (files present — probably re-done/squashed)` });
  }
  if (cmd && defRef) {
    const sha = sh(cmd).trim().split(/\s+/)[0];
    if (sha) {
      const onDef = sh(`git -C ${JSON.stringify(p)} merge-base --is-ancestor ${sha} ${defRef} 2>/dev/null && echo Y`).trim() === "Y";
      const behind = Number(sh(`git -C ${JSON.stringify(p)} rev-list --count ${sha}..${defRef} 2>/dev/null`).trim()) || 0;
      const ahead = Number(sh(`git -C ${JSON.stringify(p)} rev-list --count ${defRef}..${sha} 2>/dev/null`).trim()) || 0;
      if (!onDef) flags.push({ level: "warn", text: `production runs code NOT on ${def}${ahead ? ` (${ahead} commits ahead of it)` : ""}`, evidence: sha.slice(0, 9) });
      else if (behind) flags.push({ level: "warn", text: `production is ${behind} behind ${def}`, evidence: sha.slice(0, 9) });
      else flags.push({ level: "info", text: `production in sync with ${def}`, evidence: sha.slice(0, 9) });
    }
  }
  if (opts.ci) { const ci = ciState(p, def); if (ci) flags.push(ci); }
  return { name, path: p, def, flags, fetchAgeDays: fa };
}

export { gitDefaultBranch, loadDeploys, driftRepo };
