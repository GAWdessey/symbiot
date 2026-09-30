#!/usr/bin/env node
// symbiot — your week, written from your real work.
//
// Reads your local git activity (no accounts, no OAuth, no integrations) and
// writes the update you'd actually send. The only thing it needs is an AI key,
// which you bring yourself:  export ANTHROPIC_API_KEY=sk-ant-...  (or `ant auth login`).
//
//   symbiot week      your week, written up          (default)
//   symbiot standup   yesterday + today, for standup
//   symbiot todo      what's still on your plate
//   symbiot help
//
// Flags:  --dir <path>  where to look (default: your home folder)
//         --since <n>   days back for `week` (default 7)
//         --plain       no colour, no spinner (for piping)

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

const MODEL = process.env.SYMBIOT_MODEL || "claude-opus-5";
const MAX_REPOS = 14;
const MAX_COMMITS = 140;

// ---- tiny arg parse --------------------------------------------------------
const argv = process.argv.slice(2);
const cmd = (argv[0] && !argv[0].startsWith("-") ? argv[0] : "week").toLowerCase();
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const has = (name) => argv.includes(`--${name}`);
const PLAIN = has("plain") || !process.stdout.isTTY;

// ---- colour + spinner ------------------------------------------------------
const c = PLAIN
  ? { g: (s) => s, d: (s) => s, b: (s) => s, y: (s) => s }
  : {
      g: (s) => `\x1b[38;5;42m${s}\x1b[0m`,   // green
      d: (s) => `\x1b[38;5;66m${s}\x1b[0m`,    // faint
      b: (s) => `\x1b[1m${s}\x1b[0m`,          // bold
      y: (s) => `\x1b[38;5;179m${s}\x1b[0m`,   // amber
    };
function spinner(label) {
  if (PLAIN) { process.stderr.write(label + "\n"); return () => {}; }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const t = setInterval(() => process.stderr.write(`\r${c.g(frames[i++ % frames.length])} ${c.d(label)} `), 80);
  return () => { clearInterval(t); process.stderr.write("\r\x1b[K"); };
}

// ---- git ------------------------------------------------------------------
function sh(cmd) {
  try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 }); }
  catch { return ""; }
}
function me() {
  return { email: sh("git config --global user.email").trim(), name: sh("git config --global user.name").trim() };
}
function findRepos(base, sinceDays) {
  const out = sh(
    `find ${JSON.stringify(base)} -maxdepth 5 -name .git \\( -type d -o -type f \\) 2>/dev/null ` +
    `| grep -vE 'node_modules|/\\.cache/|/\\.local/|/venvs?/|/\\.npm' | head -400`,
  );
  const repos = [];
  for (const g of out.split("\n").filter(Boolean)) {
    const repo = g.replace(/\/\.git$/, "");
    const n = Number(sh(`git -C ${JSON.stringify(repo)} log --since="${sinceDays} days ago" --oneline 2>/dev/null | wc -l`).trim());
    const last = Number(sh(`git -C ${JSON.stringify(repo)} log -1 --format=%ct 2>/dev/null`).trim()) || 0;
    if (n > 0) repos.push({ path: repo, name: repo.split("/").pop(), recency: last });
  }
  return repos.sort((a, b) => b.recency - a.recency).slice(0, MAX_REPOS);
}
function commits(repos, sinceExpr, mineOnly = true) {
  const all = [];
  const seen = new Set();
  for (const r of repos) {
    // Filter to the identity you actually commit under IN THIS repo (people use
    // different emails per project); no filter with --all.
    const email = mineOnly ? sh(`git -C ${JSON.stringify(r.path)} config user.email`).trim() : "";
    const authorArg = email ? `--author=${JSON.stringify(email)}` : "";
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
    const dirty = sh(`git -C ${JSON.stringify(r.path)} status --porcelain 2>/dev/null`).split("\n").filter(Boolean);
    if (dirty.length) {
      const branch = sh(`git -C ${JSON.stringify(r.path)} rev-parse --abbrev-ref HEAD 2>/dev/null`).trim();
      items.push(`${r.name}: ${dirty.length} uncommitted file(s) on ${branch || "?"}`);
    }
  }
  return items;
}

// ---- claude ---------------------------------------------------------------
async function write(system, prompt) {
  let client;
  try { client = new Anthropic(); } catch { client = null; }
  const stop = spinner("thinking…");
  try {
    const res = await client.messages.create({
      model: MODEL, max_tokens: 1600,
      system, messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") return "(the model declined this one — odd for a work summary; try again)";
    return res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || /api key|ANTHROPIC_API_KEY|credential/i.test(err?.message || "")) {
      return AUTH_HELP;
    }
    return `Couldn't reach the model: ${err?.message || err}`;
  } finally { stop(); }
}

const AUTH_HELP = c.y("Symbiot needs an AI key to write your update.\n") +
  "  Set one of these, then run again:\n" +
  "    export ANTHROPIC_API_KEY=sk-ant-...\n" +
  "    or:  ant auth login\n" +
  c.d("  (This is the only key it needs — no Google, no integrations.)");

// ---- render ---------------------------------------------------------------
function renderCommits(list) {
  return list.map((x) => `- [${x.repo}] ${x.subject}${x.files.length ? ` (${x.files.length} files)` : ""}`).join("\n");
}
function header(title, sub) {
  if (PLAIN) { console.log(`${title}\n${sub}\n`); return; }
  console.log(`\n${c.g("●")} ${c.b("Symbiot")} ${c.d("· " + sub)}\n`);
}

// ---- commands -------------------------------------------------------------
const SINCE_WEEK = Number(flag("since", "7"));
const BASE = flag("dir", homedir());

async function cmdWeek(days, label) {
  const who = me();
  const repos = findRepos(BASE, days);
  if (!repos.length) {
    console.log(c.y(`No git activity in the last ${days} days under ${BASE}.`));
    console.log(c.d("Try:  symbiot week --dir ~/projects   (point it at where your repos live)"));
    return;
  }
  // Your own commits (per-repo identity); --all includes everyone's.
  let cs = commits(repos, `${days} days ago`, !has("all"));
  if (!cs.length) cs = commits(repos, `${days} days ago`, false); // fall back to all if none matched you
  const open = label === "week" ? openWork(repos) : [];

  if (!cs.length) { console.log(c.y("Found repos, but no commits in the window.")); return; }

  const system =
    `You write a short, first-person work update from a person's git commits. ` +
    `Write as them ("I"), plainly and specifically, grouped by theme or project, most important first. ` +
    `Turn commit messages into outcomes a manager or teammate would understand — not a raw commit list. ` +
    `${label === "standup" ? "Keep it to 3-5 bullets: done, and what's next." : "A short paragraph or a few grouped bullets; end with a one-line 'In progress / next' if there are open items."} ` +
    `No preamble, no sign-off, no invented work — only what the commits and open items show.`;

  const prompt =
    `Person: ${who.name || "me"}. Window: ${label === "standup" ? "since yesterday" : `last ${days} days`}.\n\n` +
    `Commits:\n${renderCommits(cs)}\n\n` +
    (open.length ? `Open / in progress:\n${open.map((o) => `- ${o}`).join("\n")}\n\n` : "") +
    `Write the ${label === "standup" ? "standup" : "update"}.`;

  header("Symbiot", `${cs.length} commits across ${new Set(cs.map((x) => x.repo)).size} repos · ${label}`);
  console.log(await write(system, prompt));
  console.log("");
}

async function cmdTodo() {
  const repos = findRepos(BASE, 60);
  const open = openWork(repos);
  if (!open.length) { console.log(c.y("Nothing outstanding found (no TODOs or uncommitted work).")); return; }
  const system =
    `You summarise what's still on a developer's plate from their TODO markers and uncommitted work. ` +
    `Group by project, lead with what looks most in-flight (uncommitted work) then the to-dos. ` +
    `Be concise and concrete. No preamble.`;
  header("Symbiot", `${open.length} open items · todo`);
  console.log(await write(system, `Open work:\n${open.map((o) => `- ${o}`).join("\n")}\n\nWhat's still on my plate?`));
  console.log("");
}

const HELP = `${c.b("symbiot")} — your week, written from your real work.

${c.b("Usage")}
  symbiot ${c.d("(or)")} symbiot week      write up your last ${SINCE_WEEK} days
  symbiot standup                   yesterday + today, for standup
  symbiot todo                      what's still on your plate
  symbiot help

${c.b("Options")}
  --dir <path>    where your repos are (default: ${homedir()})
  --since <days>  window for 'week' (default 7)
  --plain         no colour/spinner (good for piping)

${c.b("Setup")}  one key, nothing else:
  export ANTHROPIC_API_KEY=sk-ant-...   ${c.d("(or: ant auth login)")}

${c.d("Reads only your local git. No accounts, no OAuth, no data leaves except the")}
${c.d("commit summaries sent to the model to write your update.")}`;

// ---- main -----------------------------------------------------------------
(async () => {
  if (cmd === "help" || cmd === "--help" || cmd === "-h") { console.log(HELP); return; }
  if (cmd === "week") return cmdWeek(SINCE_WEEK, "week");
  if (cmd === "standup") return cmdWeek(2, "standup");
  if (cmd === "todo") return cmdTodo();
  console.log(c.y(`Unknown command: ${cmd}`) + "\n"); console.log(HELP);
})();
