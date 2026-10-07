// Reading your repos: where to look (scan folders, --dir, Termux's proot
// distros), finding repos and project folders without hanging, the facts each
// one gives (who you are in it, its commits, open work, README, rules), the
// Map's graph, and the one repo set every view shares.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { VERSION, loadConfig, saveConfig, sh, repoState } from "./core.mjs";
import { detectHandoffs } from "./agents.mjs";
import { PROVIDERS, resolveProvider } from "./ai.mjs";
import { mapKnn } from "./mapknn.mjs";

const MAX_COMMITS = 140;

let LAST_MAP = null;  // cached graph so node clicks don't rescan
// How this process scans: dir (--dir, one folder this run instead of the scan
// folders), quiet (the app: no progress line) and plain (no colour). Set by
// index.mjs from its flags.
const OPTS = { dir: "", quiet: false, plain: false };
function setScanOptions(o) { Object.assign(OPTS, o); }
const paint = (code) => (s) => OPTS.plain ? s : `\x1b[38;5;${code}m${s}\x1b[0m`;
const green = paint(42), faint = paint(66), amber = paint(179);

// ---- scan deadline + progress ---------------------------------------------
// One slow disk or giant tree must never hang a scan (the 0.7.1 map hang): each
// scan gets an overall deadline (SYMBIOT_SCAN_TIMEOUT seconds), after which it
// stops and returns what it has, marked partial. Progress is a live stderr line
// in the CLI, and served at /api/scan for the app, which polls it while the Map
// loads. Nested scans (findAllRepos inside buildMap) share the outer deadline.
const SCAN_TIMEOUT_MS = (Number(process.env.SYMBIOT_SCAN_TIMEOUT) || 60) * 1000;
const FIND_TIMEOUT_MS = 20000; // one `find` walk; partial results are kept past it
const SCAN = { active: false, phase: "", done: 0, total: 0, item: "", startedAt: 0, deadline: 0, partial: false };
function scanBegin() {
  if (SCAN.active) return false;
  Object.assign(SCAN, { active: true, phase: "", done: 0, total: 0, item: "", startedAt: Date.now(), deadline: Date.now() + SCAN_TIMEOUT_MS, partial: false });
  return true;
}
function scanPhase(phase, total) { Object.assign(SCAN, { phase, done: 0, total: total || 0, item: "" }); scanDraw(); }
function scanTick(item) { SCAN.done++; SCAN.item = item || ""; scanDraw(); }
function scanExpired() { if (SCAN.active && Date.now() > SCAN.deadline) SCAN.partial = true; return SCAN.partial; }
function scanEnd(owner) {
  if (!owner) return;
  SCAN.active = false;
  if (OPTS.quiet) return;
  if (!OPTS.plain && process.stderr.isTTY) process.stderr.write("\r\x1b[K");
  if (SCAN.partial) process.stderr.write(amber(`⚠ scan stopped after ${SCAN_TIMEOUT_MS / 1000}s — results are partial (raise SYMBIOT_SCAN_TIMEOUT, or narrow the scan folders)`) + "\n");
}
// Written synchronously (the scan blocks the event loop, so a timer-driven
// spinner would freeze): one overwritten stderr line, TTY only.
function scanDraw() {
  if (OPTS.quiet || OPTS.plain || !process.stderr.isTTY) return;
  const n = SCAN.total ? ` ${SCAN.done}/${SCAN.total}` : SCAN.done ? ` ${SCAN.done}` : "";
  process.stderr.write(`\r\x1b[K${green("⠿")} ${faint(`${SCAN.phase}${n}${SCAN.item ? " · " + SCAN.item : ""}`.slice(0, (process.stderr.columns || 80) - 3))}`);
}
// Run `find` directly (no shell, no pipe): a timeout then kills find itself
// rather than a shell whose piped children keep running, and whatever it found
// before the timeout is kept instead of discarded.
function findPaths(args, limit) {
  const timeout = SCAN.active ? Math.max(1000, Math.min(FIND_TIMEOUT_MS, SCAN.deadline - Date.now())) : FIND_TIMEOUT_MS;
  const r = spawnSync("find", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024, timeout, killSignal: "SIGKILL" });
  if (r.error && r.error.code !== "ETIMEDOUT") return [];
  if (r.error && SCAN.active) SCAN.partial = true;
  return String(r.stdout || "").split("\n").filter(Boolean).slice(0, limit);
}
const PRUNE = ["node_modules", ".cache", ".local", ".npm", "venv", ".venv", ".gradle", "Pods"];
const anyName = (names) => ["(", ...names.flatMap((n, i) => (i ? ["-o", "-name", n] : ["-name", n])), ")"];
// find .git dirs quickly by PRUNING heavy trees (node_modules etc.) instead of
// crawling into them — this is the big speedup for the map scan.
function findGitDirs(base, limit) {
  return findPaths([base, "-maxdepth", "7", ...anyName([...PRUNE, ".git-crypt"]), "-prune", "-o", "-name", ".git", "-print"], limit);
}
function me() {
  return { email: sh("git config --global user.email").trim(), name: sh("git config --global user.name").trim() };
}

// ---- accurate repo signals (the field-report fixes) -----------------------
// All author identities in this repo that plausibly belong to the current user,
// with a fallback when the filter would keep almost nothing of an active repo.
function authorship(repoPath) {
  const gName = sh("git config --global user.name 2>/dev/null").trim();
  const gEmail = sh("git config --global user.email 2>/dev/null").trim();
  const rEmail = sh(`git -C ${JSON.stringify(repoPath)} config user.email 2>/dev/null`).trim();
  const rName = sh(`git -C ${JSON.stringify(repoPath)} config user.name 2>/dev/null`).trim();
  const total = Number(sh(`git -C ${JSON.stringify(repoPath)} rev-list --count HEAD 2>/dev/null`).trim()) || 0;
  const rows = sh(`git -C ${JSON.stringify(repoPath)} log --format='%ae|%an' 2>/dev/null | sort | uniq -c | sort -rn | head -60`)
    .split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^(\d+)\s+(.*)$/); if (!m) return null;
      const parts = m[2].split("|"); return { count: Number(m[1]), email: parts[0], name: parts.slice(1).join("|") };
    }).filter(Boolean);
  const myEmails = new Set([rEmail, gEmail].filter(Boolean));
  const myNames = new Set([gName, rName].filter(Boolean).map((n) => n.toLowerCase()));
  const nameKeys = new Set([...myNames].map((n) => n.replace(/\s+/g, "")));
  const mine = new Set();
  for (const r of rows) {
    const nore = r.email.match(/^\d+\+(.+)@users\.noreply\.github\.com$/i);
    const isMine = (r.email && myEmails.has(r.email))
      || (r.name && myNames.has(r.name.toLowerCase()))
      || (nore && nameKeys.has(nore[1].toLowerCase().replace(/\s+/g, "")));
    if (isMine) mine.add(r.email);
  }
  if (rEmail) mine.add(rEmail);
  let mineCount = rows.filter((r) => mine.has(r.email)).reduce((s, r) => s + r.count, 0);
  const filterDropped = total >= 20 && mineCount / Math.max(total, 1) < 0.10;
  const emails = filterDropped ? rows.map((r) => r.email) : [...mine];
  return { emails, mineCount, total, filterDropped, names: [...new Set(rows.filter((r) => mine.has(r.email)).map((r) => r.email))] };
}
function authorArgs(emails) { return (emails || []).filter(Boolean).map((e) => `--author=${JSON.stringify(e)}`).join(" "); }

function readmeInfo(repoPath) {
  for (const f of ["README.md", "README.MD", "Readme.md", "readme.md", "README.txt", "README"]) {
    try {
      const p = join(repoPath, f);
      if (existsSync(p)) {
        const hash = sh(`git -C ${JSON.stringify(repoPath)} log -1 --format=%H -- ${JSON.stringify(f)} 2>/dev/null`).trim();
        return {
          file: f, excerpt: readFileSync(p, "utf8").slice(0, 2500),
          lastDate: sh(`git -C ${JSON.stringify(repoPath)} log -1 --format=%cd --date=short -- ${JSON.stringify(f)} 2>/dev/null`).trim(),
          commitsAgo: hash ? (Number(sh(`git -C ${JSON.stringify(repoPath)} rev-list --count ${hash}..HEAD 2>/dev/null`).trim()) || 0) : 0,
        };
      }
    } catch {}
  }
  return { file: null, excerpt: "", lastDate: "", commitsAgo: 0 };
}
function repoShape(repoPath) {
  const files = sh(`git -C ${JSON.stringify(repoPath)} ls-files 2>/dev/null | head -4000`).split("\n").filter(Boolean);
  const top = {}; const docs = []; const manifests = [];
  for (const f of files) {
    const seg = f.includes("/") ? f.split("/")[0] : "(root)";
    top[seg] = (top[seg] || 0) + 1;
    const base = f.split("/").pop();
    if (MANIFEST_TOOL[base]) manifests.push(f);
    if (/^(readme|contributing|claude|agents|changelog|architecture|design)/i.test(base) || /(^|\/)(docs|knowledge)\//i.test(f)) docs.push(f);
  }
  return {
    total: files.length,
    dirs: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([d, n]) => `${d}/ (${n})`),
    manifests: manifests.slice(0, 12), docs: [...new Set(docs)].slice(0, 16),
  };
}
// House rules the model must respect (e.g. "we commit .env on purpose").
function houseRules(repoPath) {
  const out = [];
  for (const [label, f] of [["Project rules", "CLAUDE.md"], ["Agent rules", "AGENTS.md"], ["Contributing", "CONTRIBUTING.md"]]) {
    try { const p = join(repoPath, f); if (existsSync(p)) out.push(`## ${label} (${f})\n` + readFileSync(p, "utf8").slice(0, 1500)); } catch {}
  }
  try { const g = join(homedir(), ".config", "symbiot", "rules.md"); if (existsSync(g)) out.push("## Your global rules\n" + readFileSync(g, "utf8").slice(0, 1500)); } catch {}
  return out.join("\n\n");
}
// "Show what was read" footer for every report.
function reportFooter(repoPath, auth, state, rd) {
  const b = [`symbiot ${VERSION}`, `path ${repoPath}`];
  if (state.branch) b.push(`branch ${state.branch}`);
  b.push(`${auth.mineCount} of ${auth.total} commits matched you${auth.filterDropped ? " — filter dropped, counting everyone" : ""}`);
  if (rd && rd.lastDate) b.push(`README changed ${rd.lastDate}${rd.commitsAgo ? ` (${rd.commitsAgo} commits ago)` : ""}`);
  if (state.stale) b.push(`⚠ STALE checkout: working tree ≈ ${state.staleBy ? "HEAD~" + state.staleBy : "an older commit"} — not new work`);
  else if (state.dirty) b.push(`${state.dirty} uncommitted (${state.mod} mod / ${state.del} del / ${state.add} new)`);
  if (state.behind) b.push(`${state.behind} behind upstream`);
  return b.join(" · ");
}
function expandRoot(p) { p = String(p || "").trim(); return p.startsWith("~") ? join(homedir(), p.slice(1)) : p; }
// The default place to look: your home folder. The Android app's HOME is private
// to it, so it sets SYMBIOT_SCAN_HOME to the phone's shared storage instead.
function scanHome() { return process.env.SYMBIOT_SCAN_HOME || homedir(); }
// The folder reports name as where they looked: --dir, else that home.
function scanBase() { return OPTS.dir || scanHome(); }
// Without "All files access", the Android app sees shared storage as empty (it
// always has Download, DCIM...), which would read as "no repos". The map says so
// instead, with a button that asks for access.
function storageBlocked() {
  if (process.env.SYMBIOT_ANDROID_APP !== "1") return false;
  try { return readdirSync(scanHome()).length === 0; } catch { return true; }
}
// Termux: a Linux run with proot-distro (`proot-distro login debian`) keeps its
// home folders in $PREFIX/var/lib/proot-distro/installed-rootfs/<distro>, outside
// Termux's home, and that's where projects worked on in it live. Symbiot in
// Termux reads them there: /root and /home/<user> of each installed distro.
const subdirs = (p) => { try { return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(p, d.name)); } catch { return []; } };
// The folder each installed distro sees as "/".
function prootDistros() {
  if (!process.env.PREFIX) return [];
  return subdirs(join(process.env.PREFIX, "var", "lib", "proot-distro", "installed-rootfs"));
}
// Each distro's home folders, with the distro they're in.
function prootHomeDirs() {
  const out = [];
  for (const rootfs of prootDistros()) {
    if (existsSync(join(rootfs, "root"))) out.push({ rootfs, home: join(rootfs, "root") });
    for (const home of subdirs(join(rootfs, "home"))) out.push({ rootfs, home });
  }
  return out;
}
function prootHomes() { return prootHomeDirs().map((h) => h.home); }
// Where to look when you haven't picked folders: your home folder (and in Termux,
// the homes of its proot-distro Linuxes).
function scanDefaults() { return [scanHome(), ...prootHomes()]; }
// Where to look for repos: configured folders, or --dir, else the defaults.
function scanRoots() {
  if (OPTS.dir) return [OPTS.dir];
  const r = loadConfig().scanRoots;
  const roots = (Array.isArray(r) ? r : []).map(expandRoot).filter((x) => { try { return existsSync(x); } catch { return false; } });
  return roots.length ? roots : scanDefaults();
}
function addScanRoot(p) {
  p = expandRoot(p); if (!p) return { error: "empty" };
  try { if (!existsSync(p)) return { error: "folder not found: " + p }; } catch { return { error: "can't read: " + p }; }
  const cfg = loadConfig();
  let list = Array.isArray(cfg.scanRoots) && cfg.scanRoots.length ? cfg.scanRoots : scanDefaults(); // keep home when adding the first extra folder
  if (!list.includes(p)) list.push(p);
  cfg.scanRoots = list; saveConfig(cfg); LAST_MAP = null; return { ok: true, roots: cfg.scanRoots };
}
function removeScanRoot(p) {
  const cfg = loadConfig(); cfg.scanRoots = (Array.isArray(cfg.scanRoots) ? cfg.scanRoots : []).filter((x) => x !== p);
  if (!cfg.scanRoots.length) delete cfg.scanRoots; saveConfig(cfg); LAST_MAP = null; return { ok: true, roots: cfg.scanRoots || [] };
}

function commits(repos, sinceExpr, mineOnly = true) {
  const all = [];
  const seen = new Set();
  for (const r of repos) {
    // Match ALL of your identities in this repo (per-repo email, global email,
    // GitHub noreply login, matching name), with a fallback when almost nothing
    // matches an active repo. No filter with --all.
    const authorArg = mineOnly ? authorArgs(authorship(r.path).emails) : "";
    const raw = sh(
      `git -C ${JSON.stringify(r.path)} log --since=${JSON.stringify(sinceExpr)} ${authorArg} ` +
      `--no-merges --date=short --name-only --pretty=format:'@@@%H|%ad|%s' -n 60`,
    );
    let cur = null;
    const flush = () => {
      if (cur && !seen.has(cur.h)) { seen.add(cur.h); all.push({ ...cur, repo: r.name }); }
    };
    for (const line of raw.split("\n")) {
      if (line.startsWith("@@@")) {
        flush();
        const [h, date, subject] = line.slice(3).split("|");
        cur = { h, date, subject: subject || "", files: [] };
      } else if (line.trim() && cur) cur.files.push(line.trim());
    }
    flush();
  }
  return all.slice(0, MAX_COMMITS);
}
function openWork(repos) {
  const items = [];
  for (const r of repos) {
    const todos = sh(
      `git -C ${JSON.stringify(r.path)} grep -nEI '(TODO|FIXME|HACK)[:( ]' -- ` +
      `'*.ts' '*.tsx' '*.js' '*.py' '*.go' '*.rs' '*.java' '*.sql' '*.vue' 2>/dev/null | head -8`,
    );
    for (const l of todos.split("\n").filter(Boolean)) {
      const m = l.match(/^([^:]+):(\d+):(.*)$/);
      if (m) items.push(`${r.name}: ${m[3].replace(/^[\s/*#-]+/, "").trim().slice(0, 120)} (${m[1]}:${m[2]})`);
    }
    const st = repoState(r.path);
    if (st.stale) {
      items.push(`${r.name}: STALE checkout — working tree ≈ ${st.staleBy ? "HEAD~" + st.staleBy : "an older commit"}, NOT new work; do not commit (would revert history)`);
    } else if (st.dirty) {
      items.push(`${r.name}: ${st.dirty} uncommitted (${st.mod} mod / ${st.del} del / ${st.add} new) on ${st.branch || "?"}`);
    }
  }
  return items;
}

// ---- work map: a node graph of your repos, languages, and tools -----------
const EXT_LANG = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript",
  py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", rb: "Ruby", php: "PHP",
  cs: "C#", cpp: "C++", cc: "C++", c: "C", swift: "Swift", vue: "Vue", svelte: "Svelte",
  sql: "SQL", sh: "Shell", css: "CSS", scss: "CSS", html: "HTML",
};
const MANIFEST_TOOL = {
  "package.json": "Node", "requirements.txt": "Python", "pyproject.toml": "Python",
  "go.mod": "Go", "Cargo.toml": "Rust", "pom.xml": "Maven", "build.gradle": "Gradle",
  "Gemfile": "Ruby", "composer.json": "PHP", "Dockerfile": "Docker", "docker-compose.yml": "Docker",
  "terraform.tf": "Terraform", "kubernetes.yml": "Kubernetes", ".github": "GitHub Actions",
};
function findAllRepos(base) {
  const own = scanBegin();
  try {
    const roots = base ? [base] : scanRoots();
    const repos = []; const seen = new Set();
    for (const root of roots) {
      if (scanExpired()) break;
      scanPhase("finding repos in " + root.replace(homedir(), "~"));
      const gits = findGitDirs(root, 300);
      scanPhase("reading repos", gits.length);
      for (const g of gits) {
        if (scanExpired()) break;
        const repo = g.replace(/\/\.git$/, ""); scanTick(repo.split("/").pop());
        if (seen.has(repo)) continue; seen.add(repo);
        const last = Number(sh(`git -C ${JSON.stringify(repo)} log -1 --format=%ct 2>/dev/null`).trim()) || 0;
        if (last) repos.push({ path: repo, name: repo.split("/").pop(), recency: last });
      }
    }
    // Group worktrees by shared git dir; keep only the freshest checkout of each.
    // (Not deadline-bound: it's what makes the result correct, and it's cheap.)
    const byCommon = {};
    for (const r of repos) {
      const cd = sh(`git -C ${JSON.stringify(r.path)} rev-parse --git-common-dir 2>/dev/null`).trim() || r.path;
      const key = cd.startsWith("/") ? cd : join(r.path, cd);
      if (!byCommon[key] || byCommon[key].recency < r.recency) byCommon[key] = r;
    }
    return Object.values(byCommon).sort((a, b) => b.recency - a.recency).slice(0, 60);
  } finally { scanEnd(own); }
}
// What a project is about, in its own words: its package description and keywords
// and the start of its README (the Map's neighbours read the words, nothing else).
function aboutText(path) {
  let t = "";
  try { const p = JSON.parse(readFileSync(join(path, "package.json"), "utf8")); t += " " + (p.description || "") + " " + (Array.isArray(p.keywords) ? p.keywords.join(" ") : ""); } catch {}
  for (const f of ["README.md", "readme.md", "README"]) { try { t += " " + readFileSync(join(path, f), "utf8").slice(0, 3000); break; } catch {} }
  return t.slice(0, 4000);
}
function detectRepo(r) {
  const files = sh(`git -C ${JSON.stringify(r.path)} ls-files 2>/dev/null | head -3000`).split("\n").filter(Boolean);
  const count = {}; const tools = new Set();
  for (const f of files) {
    const base = f.split("/").pop();
    if (MANIFEST_TOOL[base]) tools.add(MANIFEST_TOOL[base]);
    const ext = (base.includes(".") ? base.split(".").pop() : "").toLowerCase();
    if (EXT_LANG[ext]) count[EXT_LANG[ext]] = (count[EXT_LANG[ext]] || 0) + 1;
  }
  const langs = Object.entries(count).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  const email = sh(`git -C ${JSON.stringify(r.path)} config user.email`).trim();
  const mine = Number(sh(`git -C ${JSON.stringify(r.path)} log ${email ? `--author=${JSON.stringify(email)}` : ""} --oneline 2>/dev/null | wc -l`).trim()) || 0;
  const branch = sh(`git -C ${JSON.stringify(r.path)} rev-parse --abbrev-ref HEAD 2>/dev/null`).trim();
  const last = sh(`git -C ${JSON.stringify(r.path)} log -1 --format=%cd --date=short 2>/dev/null`).trim();
  // for the Map's neighbours (mapknn.mjs): your commits per week, 12 weeks, oldest first; and what it's about
  const weeks = Array(12).fill(0), now = Date.now();
  for (const t of sh(`git -C ${JSON.stringify(r.path)} log ${email ? `--author=${JSON.stringify(email)}` : ""} --since=84.days --format=%ct 2>/dev/null`).split("\n").filter(Boolean)) { const w = Math.floor((now - Number(t) * 1000) / (7 * 86400000)); if (w >= 0 && w < 12) weeks[11 - w]++; }
  return { ...r, langs, tools: [...tools], mine, files: files.length, branch, last, weeks, text: aboutText(r.path) };
}
// Non-git PROJECT folders inside your scan roots (you added them = consent):
// a directory with a manifest but no .git — "not everything is a repo".
function findProjectFolders(root) {
  const manifests = findPaths([root, "-maxdepth", "3", ...anyName([...PRUNE, ".git"]), "-prune", "-o", "-type", "f",
    ...anyName(["package.json", "requirements.txt", "pyproject.toml", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "Gemfile", "composer.json", "Dockerfile", "pubspec.yaml", "CMakeLists.txt"]), "-print"], 200);
  const dirs = new Set(); for (const m of manifests) dirs.add(m.replace(/\/[^/]+$/, ""));
  const out = [];
  for (const d of dirs) {
    if (sh(`git -C ${JSON.stringify(d)} rev-parse --is-inside-work-tree 2>/dev/null`).trim() === "true") continue; // inside a repo already
    out.push(d); if (out.length >= 24) break;
  }
  return out;
}
function detectFolder(path) {
  const files = sh(`find ${JSON.stringify(path)} -maxdepth 2 \\( -name node_modules -o -name .git \\) -prune -o -type f -print 2>/dev/null | head -2000`).split("\n").filter(Boolean);
  const count = {}; const tools = new Set();
  for (const f of files) { const base = f.split("/").pop(); if (MANIFEST_TOOL[base]) tools.add(MANIFEST_TOOL[base]); const ext = (base.includes(".") ? base.split(".").pop() : "").toLowerCase(); if (EXT_LANG[ext]) count[EXT_LANG[ext]] = (count[EXT_LANG[ext]] || 0) + 1; }
  return { path, name: path.split("/").pop(), langs: Object.entries(count).sort((a, b) => b[1] - a[1]).map((x) => x[0]), tools: [...tools], files: files.length };
}
// Projects you've run an AI coding agent on. Claude Code stores one dir per
// project under ~/.claude/projects, named by the project path with every
// non-alphanumeric char → "-" (so "/" "." "_" "-" all collide). Returns
// { "<key>": { agent, last, path, rootfs, enc } } — last = newest session mtime
// (epoch secs); path = the real project dir, read from the "cwd" a session
// records (empty when no session says, then callers fall back to decoding enc).
// In Termux it also reads Claude Code's history inside each proot-distro (in
// the distro's /root and /home/<user>). Paths there are the distro's own
// ("/root/work/proj"), so rootfs is the distro's folder ("" outside one), path
// is prefixed with it, and key = agentKey(rootfs, enc).
// (Gemini's dir is global config, Codex's is empty, so no reliable per-project
// signal there yet; add them here when there is.)
const claudeEnc = (p) => String(p || "").replace(/[^a-zA-Z0-9]/g, "-");
function sessionCwd(file) {
  const head = sh(`head -c 262144 ${JSON.stringify(file)} 2>/dev/null`);
  const m = head.match(/"cwd":"((?:[^"\\]|\\.)*)"/);
  if (!m) return "";
  try { return JSON.parse(`"${m[1]}"`); } catch { return ""; }
}
const agentKey = (rootfs, enc) => (rootfs ? rootfs + "\0" : "") + enc;
// The keys a project folder's history could be under: its path, and its path as
// seen from inside the proot-distro it's in (if any), each encoded both ways.
function agentKeys(path, distros) {
  const enc = (p) => [claudeEnc(p), p.replace(/\//g, "-")]; // older Claude Code mapped only "/"
  const rootfs = distros.find((r) => path.startsWith(r + "/"));
  return [...enc(path), ...(rootfs ? enc(path.slice(rootfs.length)).map((e) => agentKey(rootfs, e)) : [])];
}
function claudeProjects() {
  const out = {};
  readClaudeProjects(join(homedir(), ".claude", "projects"), "", out);
  for (const { rootfs, home } of prootHomeDirs()) readClaudeProjects(join(home, ".claude", "projects"), rootfs, out);
  return out;
}
function readClaudeProjects(base, rootfs, out) {
  let dirs = [];
  try { dirs = sh(`ls -1 ${JSON.stringify(base)} 2>/dev/null`).split("\n").filter(Boolean); } catch {}
  for (const enc of dirs) {
    let last = 0, path = "";
    const newest = sh(`find ${JSON.stringify(join(base, enc))} -maxdepth 1 -name '*.jsonl' -printf '%T@ %p\\n' 2>/dev/null | sort -rn | head -1`).trim();
    if (newest) {
      const sp = newest.indexOf(" ");
      last = parseInt(newest.slice(0, sp), 10) || 0;
      const cwd = sessionCwd(newest.slice(sp + 1));
      if (cwd && (claudeEnc(cwd) === enc || cwd.replace(/\//g, "-") === enc)) path = cwd; // only trust a cwd that matches this dir
    }
    if (!last) { try { last = Math.floor(statSync(join(base, enc)).mtimeMs / 1000); } catch {} }
    const key = agentKey(rootfs, enc);
    if (out[key] && out[key].last >= last) continue; // one project worked on from two of the distro's homes: keep the newest
    out[key] = { agent: "Claude Code", last, path: path && rootfs + path, rootfs, enc };
  }
}
// Async only to YIELD between repos, so the app server can answer /api/scan
// (progress) mid-scan; the git calls themselves stay synchronous. Concurrent
// callers (e.g. Rescan while a scan runs) share the one in-flight build.
let MAP_BUILD = null;
function buildMap() {
  if (!MAP_BUILD) MAP_BUILD = buildMapNow().finally(() => { MAP_BUILD = null; });
  return MAP_BUILD;
}
const yieldTick = () => new Promise((r) => setImmediate(r));
async function buildMapNow() {
  const own = scanBegin();
  try { return await buildMapScan(); } finally { scanEnd(own); }
}
async function buildMapScan() {
  const who = me();
  const found = findAllRepos();
  const repos = [];
  scanPhase("reading repo details", found.length);
  for (const r of found) {
    if (scanExpired()) break;
    await yieldTick();
    repos.push(detectRepo(r)); scanTick(r.name);
  }
  const nodes = []; const edges = []; const have = new Set();
  const add = (n) => { if (!have.has(n.id)) { have.add(n.id); nodes.push(n); } };
  add({ id: "me", type: "person", label: who.name || "You", weight: 22 });
  for (const r of repos) {
    const rid = "repo:" + r.path;
    add({ id: rid, type: "repo", label: r.name, weight: Math.min(9 + Math.log2(1 + r.mine) * 3, 26),
      meta: { commits: r.mine, langs: r.langs.slice(0, 3), tools: r.tools, files: r.files, branch: r.branch, last: r.last, path: r.path, weeks: r.weeks } });
    edges.push({ source: "me", target: rid });
    for (const L of r.langs.slice(0, 3)) { const id = "lang:" + L; add({ id, type: "lang", label: L, weight: 15 }); edges.push({ source: rid, target: id }); }
    for (const T of r.tools) { const id = "tool:" + T; add({ id, type: "tool", label: T, weight: 12 }); edges.push({ source: rid, target: id }); }
  }
  // Non-git project folders in the scan roots (capped; deduped against repos).
  try {
    const repoPaths = new Set(repos.map((r) => r.path)); let folders = 0;
    for (const root of scanRoots()) { if (scanExpired()) break; scanPhase("finding project folders"); for (const d of findProjectFolders(root)) {
      if (repoPaths.has(d) || have.has("folder:" + d) || folders >= 20) continue;
      if (scanExpired()) break;
      await yieldTick();
      const det = detectFolder(d); folders++; scanTick(det.name);
      add({ id: "folder:" + d, type: "folder", label: det.name, weight: 10, meta: { path: d, langs: det.langs.slice(0, 3), tools: det.tools, files: det.files } });
      edges.push({ source: "me", target: "folder:" + d });
      for (const L of det.langs.slice(0, 3)) { const id = "lang:" + L; add({ id, type: "lang", label: L, weight: 15 }); edges.push({ source: "folder:" + d, target: id }); }
    } }
  } catch {}
  // What you build WITH (person-level, not per-repo): detected agents/editors
  // and the AI currently powering Symbiot — so the initial scan shows the whole
  // setup, not just code. All local detection, nothing invasive.
  try {
    const hands = detectHandoffs();
    for (const a of [...hands.agents, ...hands.editors]) {
      const id = "agent:" + a.label;
      add({ id, type: "agent", label: a.label.replace(/\s*\(.*\)$/, ""), weight: 11, meta: { cmd: a.tmpl, kind: a.kind } });
      edges.push({ source: "me", target: id });
    }
    const prov = resolveProvider();
    if (prov) { const id = "ai:" + prov.provider; add({ id, type: "ai", label: PROVIDERS[prov.provider].label, weight: 14, meta: { model: prov.model, source: prov.source } }); edges.push({ source: "me", target: id }); }
  } catch {}
  // Agent projects: badge the repo/folder nodes an AI coding agent has worked,
  // and surface agent-worked projects the scan missed as their own nodes.
  try {
    const ap = claudeProjects(), distros = prootDistros(); const used = new Set();
    for (const n of nodes) {
      if ((n.type === "repo" || n.type === "folder") && n.meta && n.meta.path) {
        const e = agentKeys(n.meta.path, distros).find((k) => ap[k]);
        if (e) { n.meta.agents = [{ agent: ap[e].agent, last: ap[e].last }]; used.add(e); }
      }
    }
    let extra = 0;
    for (const e of Object.keys(ap)) {
      if (used.has(e) || extra >= 20) continue;
      // the session's recorded cwd; else best-effort decode (names with - . _ won't resolve and are skipped)
      const decoded = ap[e].path || ap[e].rootfs + ap[e].enc.replace(/-/g, "/");
      if (!existsSync(decoded) || !statSync(decoded).isDirectory()) continue;
      if (nodes.some((n) => n.meta && n.meta.path === decoded)) continue;
      const isGit = existsSync(join(decoded, ".git"));
      const id = (isGit ? "repo:" : "folder:") + decoded; if (have.has(id)) continue;
      const det = isGit ? null : detectFolder(decoded);
      add({ id, type: isGit ? "repo" : "folder", label: decoded.split("/").pop(), weight: 10, meta: { path: decoded, agents: [{ agent: ap[e].agent, last: ap[e].last }], agentOnly: true, langs: det ? det.langs.slice(0, 3) : [], tools: det ? det.tools : [], files: det ? det.files : 0 } });
      edges.push({ source: "me", target: id }); extra++;
    }
  } catch {}
  // the Map's nearest neighbours (mapknn.mjs): repos and project folders, by stack, weeks and words
  let knn = null;
  try { const byPath = new Map(repos.map((r) => [r.path, r]));
    knn = mapKnn(nodes.filter((n) => n.type === "repo" || n.type === "folder").map((n) => { const m = n.meta || {}, r = byPath.get(m.path) || {};
      return { id: n.id, name: n.label, langs: m.langs || [], tools: m.tools || [], weeks: r.weeks || [], text: r.text != null ? r.text : (m.path ? aboutText(m.path) : ""), last: m.last || r.last || "" }; })); } catch {}
  const out = { nodes, edges, ...(knn ? { knn } : {}), stats: {
    repos: repos.length,
    folders: nodes.filter((n) => n.type === "folder").length,
    languages: nodes.filter((n) => n.type === "lang").length,
    tools: nodes.filter((n) => n.type === "tool").length,
    agents: nodes.filter((n) => n.type === "agent").length,
    commits: repos.reduce((s, r) => s + r.mine, 0),
    files: repos.reduce((s, r) => s + (r.files || 0), 0),
    base: scanBase(),
    roots: scanRoots(), // every folder scanned (base is the first, unless you picked others)
    partial: SCAN.partial, // the scan hit its deadline — this is what it found so far
    android: process.env.SYMBIOT_ANDROID_APP === "1",
    noStorage: storageBlocked(),
  } };
  LAST_MAP = out;
  return out;
}
// Local detail for a clicked node (no AI).
async function nodeDetail(id) {
  const map = LAST_MAP || await buildMap();
  if (id === "me") { const n = map.nodes.find((x) => x.id === "me"); return { type: "person", label: (n && n.label) || "You", stats: map.stats }; }
  if (id.startsWith("repo:")) {
    const path = id.slice(5); const n = map.nodes.find((x) => x.id === id); const m = (n && n.meta) || {};
    return {
      type: "repo", label: n ? n.label : path.split("/").pop(), path,
      branch: sh(`git -C ${JSON.stringify(path)} rev-parse --abbrev-ref HEAD 2>/dev/null`).trim(),
      dirty: sh(`git -C ${JSON.stringify(path)} status --porcelain 2>/dev/null`).split("\n").filter(Boolean).length,
      last: sh(`git -C ${JSON.stringify(path)} log -1 --format=%cd --date=short 2>/dev/null`).trim(),
      commits: m.commits || 0, langs: m.langs || [], tools: m.tools || [], agents: m.agents || [],
    };
  }
  if (id.startsWith("lang:") || id.startsWith("tool:")) {
    const n = map.nodes.find((x) => x.id === id);
    const repos = map.edges.filter((e) => e.target === id).map((e) => { const r = map.nodes.find((x) => x.id === e.source); return r ? r.label : null; }).filter(Boolean);
    return { type: id.startsWith("lang:") ? "lang" : "tool", label: n ? n.label : id.split(":")[1], repos };
  }
  if (id.startsWith("agent:") || id.startsWith("ai:")) {
    const n = map.nodes.find((x) => x.id === id);
    return { type: id.startsWith("agent:") ? "agent" : "ai", label: n ? n.label : id.split(":")[1], meta: (n && n.meta) || {} };
  }
  if (id.startsWith("folder:")) {
    const path = id.slice(7); const n = map.nodes.find((x) => x.id === id); const m = (n && n.meta) || {};
    return { type: "folder", label: n ? n.label : path.split("/").pop(), path, langs: m.langs || [], tools: m.tools || [], files: m.files || 0, agents: m.agents || [] };
  }
  return { error: "unknown node" };
}

// Each repo or project folder's name -> its path, from the Map's last scan (or
// a fresh one): how a task's repo name finds its folder.
function repoPathMap() {
  const byName = {};
  const src = (LAST_MAP && LAST_MAP.nodes) ? LAST_MAP.nodes.filter((n) => n.type === "repo" || n.type === "folder").map((n) => ({ name: n.label, path: n.meta && n.meta.path })) : findAllRepos();
  for (const r of src) if (r.path && !byName[r.name]) byName[r.name] = r.path;
  return byName;
}

// The SAME repo set the Map uses — reuse its cached scan when present, else do
// the identical discovery. So week/standup/todo/drift all agree with the Map.
function discoveredRepos() {
  if (LAST_MAP && LAST_MAP.nodes) return LAST_MAP.nodes.filter((n) => n.type === "repo" && n.meta && n.meta.path).map((n) => ({ path: n.meta.path, name: n.label, recency: 0 }));
  return findAllRepos();
}

export { SCAN, SCAN_TIMEOUT_MS, setScanOptions, scanBegin, scanPhase, scanTick, scanExpired, scanEnd, me, authorship, authorArgs, readmeInfo, repoShape, houseRules, reportFooter, expandRoot, scanHome, scanBase, storageBlocked, prootDistros, prootHomes, scanRoots, addScanRoot, removeScanRoot, commits, openWork, findAllRepos, detectRepo, findProjectFolders, detectFolder, claudeProjects, buildMap, nodeDetail, repoPathMap, discoveredRepos };
