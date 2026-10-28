// symbiot — Status: the states of things outside Symbiot that runs kept being started to check,
// read through their own APIs, as one of Watch's watches (STATUS_URL, watch.mjs checkWatch).
// 31 status-check runs in 8 days asked "is the Meta template still in review", "is it on npm",
// "does the PR merge" (review of 20 Oct 2026, proposal 5): each a run, $0.2–5. Here:
// - the PRs Symbiot opened (tasks' pr), through gh: merged, closed, has conflicts, a check
//   failed, checks running, or ready to merge;
// - a lane's published npm package (the one with publishConfig, and Symbiot itself), its
//   version on the registry;
// - WhatsApp templates in Meta's review, through the Graph API, with the token and account id
//   in a lane's own .env (read here, never written anywhere).
// Each is one line, "<thing>: <state>", so a change of state is a new line: Watch's first read
// learns them, and a change is news (the Dashboard, a notification, `symbiot watch new`), never
// a run of its own. A run starts only when there's something to do (actOn): an open PR of
// Symbiot's with conflicts or a failed check becomes its lane's task, and a lane whose open
// task names the thing that changed is told in its ANSWERS.md, which starts it.
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { loadTasks } from "./core.mjs";
import { track, prKey, loadJobs } from "./jobs.mjs";

const STATUS_URL = "symbiot://status";
const PR_DAYS = 30, TIMEOUT = 20000;
const readOr = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
const run = (cmd, args, { cwd } = {}) => new Promise((resolve) => execFile(cmd, args, { cwd, timeout: TIMEOUT, maxBuffer: 8 << 20, windowsHide: true }, (err, out) => resolve(err ? null : String(out || ""))));
const getJson = async (url, fetchFn = fetch) => { try { const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), TIMEOUT); const r = await fetchFn(url, { signal: ctrl.signal }); clearTimeout(t); return r.ok ? await r.json() : null; } catch { return null; } };

// ---- PRs ------------------------------------------------------------------------------
// The PRs Symbiot opened in the last PR_DAYS (an Approve: tasks' pr), each once, with its lane.
function openedPrs(tasks = loadTasks(), now = Date.now()) {
  const seen = new Map();
  for (const t of tasks) {
    const pr = String((t && t.pr) || ""); if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(pr) || seen.has(pr)) continue;
    if (now - (Number(t.approvedAt || t.archivedAt || t.ts) || 0) > PR_DAYS * 86400000) continue;
    seen.set(pr, { url: pr, lane: t.repo || "" });
  }
  return [...seen.values()];
}
// gh pr view's JSON, as one word for where it stands.
function prState(v) {
  if (!v) return "";
  if (v.state === "MERGED") return "merged";
  if (v.state === "CLOSED") return "closed";
  if (v.mergeable === "CONFLICTING" || v.mergeStateStatus === "DIRTY") return "has conflicts";
  const checks = Array.isArray(v.statusCheckRollup) ? v.statusCheckRollup : [];
  if (checks.some((c) => /^(FAILURE|ERROR|CANCELLED|TIMED_OUT|ACTION_REQUIRED)$/.test(String(c.conclusion || c.state || "")))) return "a check failed";
  if (checks.some((c) => /^(IN_PROGRESS|QUEUED|PENDING|EXPECTED|WAITING)$/.test(String(c.status || c.state || "")) && !c.conclusion)) return "checks running";
  return "ready to merge";
}
const prName = (url) => { const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/); return m ? `${m[2]}#${m[3]}` : url; };
async function prItems({ prs = openedPrs(), gh = (args) => run("gh", args) } = {}) {
  const out = [];
  for (const p of prs) {
    const raw = await gh(["pr", "view", p.url, "--json", "state,mergeable,mergeStateStatus,statusCheckRollup"]);
    let v = null; try { v = JSON.parse(raw); } catch {}
    const st = prState(v); if (!st) continue;
    out.push({ text: `PR ${prName(p.url)}${p.lane ? ` (${p.lane})` : ""}: ${st}`, href: p.url, kind: "pr", lane: p.lane, subject: prName(p.url), state: st, open: v.state === "OPEN" });
  }
  return out;
}

// What GitHub says now about the PRs a text names ("PR 321", "#322", "PRs 321 and 322", or a pull URL): agents' last words
// said #321 and #322 were "written but never merged" when both were merged (28 Oct 2026). A bare number is looked up on
// the repo's current remote (git remote get-url origin), never one remembered from before it moved owners.
const remoteSlug = (cwd, git = (args) => run("git", args, { cwd })) => Promise.resolve(git(["remote", "get-url", "origin"])).then((u) => { const m = String(u || "").trim().match(/github\.com[:/]([^/]+\/[^/.\s]+?)(?:\.git)?$/); return m ? m[1] : ""; });
function prRefs(text) {
  const t = String(text || ""), out = new Map();
  for (const m of t.matchAll(/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/g)) out.set(`${m[1]}#${m[2]}`, { slug: m[1], n: m[2] });
  for (const m of t.matchAll(/\bPRs?\s*#?(\d+(?:\s*(?:,|and|&|\/)\s*#?\d+)*)|(?<![\w&/])#(\d{2,5})\b/gi)) for (const n of String(m[1] || m[2]).match(/\d+/g)) out.set(`#${n}`, { slug: "", n });
  return [...out.values()].slice(0, 8);
}
async function prFacts(text, { cwd = new URL(".", import.meta.url).pathname, gh = (args) => run("gh", args), git } = {}) {
  const refs = prRefs(text); if (!refs.length) return [];
  const own = refs.some((r) => !r.slug) ? await remoteSlug(cwd, git) : "";
  const lines = [];
  for (const r of refs) {
    const slug = r.slug || own; if (!slug) continue;
    const raw = await gh(["pr", "view", r.n, "-R", slug, "--json", "state,mergedAt,title"]);
    let v = null; try { v = JSON.parse(raw); } catch {}
    const word = v ? (v.state === "MERGED" ? `merged${v.mergedAt ? ` on ${String(v.mergedAt).slice(0, 10)}` : ""}` : v.state === "CLOSED" ? "closed, not merged" : "open") : raw === null ? "" : "no such PR";
    if (word) lines.push(`PR #${r.n} (${slug}): ${word}${v && v.title ? `, "${String(v.title).slice(0, 80)}"` : ""}`);
  }
  return lines;
}

// ---- npm ------------------------------------------------------------------------------
// A lane's package that's published (publishConfig), or Symbiot's own: { lane, name, version }.
function packagesOf(map = {}) {
  const out = [];
  for (const [lane, path] of Object.entries(map || {})) {
    let p = null; try { p = JSON.parse(readOr(join(path, "package.json"))); } catch {}
    if (p && p.name && !p.private && (p.publishConfig || p.name === "symbiot")) out.push({ lane, name: p.name, version: p.version || "" });
  }
  return out;
}
async function npmItems({ map = {}, fetchFn = fetch } = {}) {
  const out = [];
  for (const p of packagesOf(map)) {
    const j = await getJson(`https://registry.npmjs.org/${encodeURIComponent(p.name).replace("%40", "@")}/latest`, fetchFn); if (!j || !j.version) continue;
    out.push({ text: `npm ${p.name}: ${j.version} is the latest`, href: `https://www.npmjs.com/package/${p.name}`, kind: "npm", lane: p.lane, subject: p.name, state: j.version });
  }
  return out;
}

// ---- Meta (WhatsApp templates) ---------------------------------------------------------
// The WhatsApp Business account a lane's .env names, with its token: { lane, waba, token } or null.
const ENVS = [".env", ".env.local", ".env.production"];
function envOf(path) {
  const o = {};
  for (const f of ENVS) for (const line of readOr(join(path, f)).split(/\r?\n/)) { const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^"'\s#]*)/); if (m && m[2] && !(m[1] in o)) o[m[1]] = m[2]; }
  return o;
}
function metaOf(lane, path) {
  const e = envOf(path), key = (re) => Object.keys(e).find((k) => re.test(k));
  const t = key(/^(?:WA|WHATSAPP|META|FB|FACEBOOK)_\w*(?:ACCESS_)?TOKEN$/i), w = key(/WABA(?:_ID)?$|WHATSAPP_BUSINESS_ACCOUNT_ID$|(?:WA|WHATSAPP)_BUSINESS_ID$/i);
  return t && w && /^\d{6,}$/.test(e[w]) ? { lane, waba: e[w], token: e[t] } : null;
}
const META_STATE = { APPROVED: "approved", PENDING: "in review", IN_APPEAL: "in appeal", REJECTED: "rejected", PAUSED: "paused", DISABLED: "disabled", PENDING_DELETION: "being deleted" };
async function metaItems({ map = {}, fetchFn = fetch } = {}) {
  const out = [], done = new Set();
  for (const [lane, path] of Object.entries(map || {})) {
    const m = metaOf(lane, path); if (!m || done.has(m.waba)) continue; done.add(m.waba);
    const j = await getJson(`https://graph.facebook.com/v21.0/${m.waba}/message_templates?fields=name,status,language&limit=200&access_token=${encodeURIComponent(m.token)}`, fetchFn);
    for (const t of (j && Array.isArray(j.data) ? j.data : [])) {
      if (!t || !t.name) continue;
      const st = META_STATE[t.status] || String(t.status || "").toLowerCase(); if (!st) continue;
      out.push({ text: `WhatsApp template ${t.name}${t.language ? ` (${t.language})` : ""}: ${st}`, kind: "meta", lane: m.lane, subject: t.name, state: st });
    }
  }
  return out;
}

// What Watch reads for the Status watch: { url, list, via }. Never an error: a source that can't be
// read this time (gh signed out, no network) lists nothing, and a line that was there and isn't
// now isn't news.
async function readStates({ map, deps = {} } = {}) {
  if (!map) { try { map = (await import("./scan.mjs")).laneMap(); } catch { map = {}; } }
  const parts = await Promise.all([(deps.prs || prItems)(), (deps.npm || npmItems)({ map }), (deps.meta || metaItems)({ map })].map((p) => p.catch(() => [])));
  return { url: STATUS_URL, list: parts.flat(), via: "api" };
}

// ---- something to do ---------------------------------------------------------------------
// The lines that are new this read (Watch's news, with the items they came from). An open PR of
// Symbiot's that now has conflicts or a failed check: a task for its lane (its agent starts on
// it when the lane is free, home.mjs workTick). Any change a lane's open task names (the
// template, the package, the PR): that lane is told in its ANSWERS.md and started, so the run
// waiting for "once Meta approves it" goes then, and not to check again before.
// merged: a PR of Symbiot's that merged goes to its lane's deploy (deploy.mjs onMerged: "Deploy it?",
// or with a standing yes, deployed and checked).
function actOn(items, { map = {}, add, run, merged, now = Date.now() } = {}) {
  const did = [];
  for (const it of items || []) {
    if (it.kind === "pr" && it.state === "merged" && it.lane && map[it.lane] && merged) { try { Promise.resolve(merged(map[it.lane], it.lane, it.href)).catch(() => {}); did.push({ merged: it.lane, pr: it.href }); } catch {} }
    // the job record follows GitHub: a queued merge that is blocked says so (PR #258 read "merge queued" while it had conflicts, 23 Oct 2026), and says approved again once it clears
    if (it.kind === "pr" && it.open && it.lane && it.href) {
      const key = prKey(it.lane, it.href), j = loadJobs().find((x) => x.key === key), bad = /conflicts|check failed/.test(it.state);
      if (bad) track(key, { kind: "pr", lane: it.lane, text: `PR ${it.href.replace(/^.*\/pull\//, "")}`, pr: it.href, state: "blocked", note: `blocked: ${/conflicts/.test(it.state) ? "conflicts with main" : "a check failed"}; a fix run is queued` }, { now });
      else if (j && j.state === "blocked") track(key, { state: "approved", note: "" }, { now });
    }
    if (it.kind === "pr" && it.open && it.lane && /conflicts|check failed/.test(it.state) && add) {
      const t = add(`PR ${it.subject} (${it.href}) ${it.state === "has conflicts" ? "has conflicts with main: rebase its branch on main, fix them, run the tests, and push to the same branch" : "has a failed check: read why (gh pr checks), fix it on its branch, run the tests, and push"}. Don't open a new PR.`, it.lane);
      if (t && !t.error) did.push({ task: t.id, lane: it.lane });
    }
    for (const [lane, path] of Object.entries(map || {})) {
      const open = readOr(join(path, ".symbiot", "TASKS.md")).split("\n").filter((l) => /^\s*-\s*\[ \]/.test(l)).join("\n");
      if (!open || !it.subject || !open.toLowerCase().includes(String(it.subject).toLowerCase())) continue;
      const file = join(path, ".symbiot", "ANSWERS.md"), day = new Date(now).toISOString().slice(0, 10);
      try { mkdirSync(join(path, ".symbiot"), { recursive: true }); writeFileSync(file, (existsSync(file) ? readOr(file) : "# Answers from the user\n").replace(/\s*$/, "\n") + `\n### Symbiot: ${it.text}\nSymbiot watches this through its API (Dashboard → Status), so it's news, not a guess: carry on with what was waiting for it. Don't start a check of your own on it.\n_${day}_\n`); } catch { continue; }
      if (run) { try { run(path); } catch {} }
      did.push({ told: lane, about: it.subject });
    }
  }
  return did;
}

export { prRefs, prFacts, STATUS_URL, readStates, actOn, prItems, prState, openedPrs, npmItems, packagesOf, metaItems, metaOf, envOf };
