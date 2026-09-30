#!/usr/bin/env node
// symbiot — your week, written from your real work.
//
// Reads your local git activity (no accounts, no OAuth, no integrations) and
// writes the update you'd actually send. It writes with Claude, so it needs an
// Anthropic API key — set one up once with `symbiot login`.
//
//   symbiot week      your week, written up          (default)
//   symbiot standup   yesterday + today, for standup
//   symbiot todo      what's still on your plate
//   symbiot login     connect it to Claude (once)
//   symbiot whoami    show how it's connected
//   symbiot help
//
// Flags:  --dir <path>  where to look (default: your home folder)
//         --since <n>   days back for `week` (default 7)
//         --plain       no colour, no spinner (for piping)

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { createInterface } from "node:readline";

const MODEL = process.env.SYMBIOT_MODEL || "claude-opus-5-5";
const MAX_REPOS = 14;
const MAX_COMMITS = 140;
const CONFIG_DIR = join(homedir(), ".config", "symbiot");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

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

// ---- auth ------------------------------------------------------------------
// Symbiot writes with Claude. Credentials can come from (first wins):
//   1. ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN in the environment
//   2. a key saved by `symbiot login` (~/.config/symbiot/config.json)
//   3. an Anthropic CLI profile on disk (`ant auth login`), which the SDK reads
function loadConfig() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf8")); } catch { return {}; }
}
function saveConfig(cfg) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
    try { chmodSync(CONFIG_PATH, 0o600); } catch {}
    return true;
  } catch { return false; }
}
function antProfileExists() {
  try { return existsSync(join(homedir(), ".config", "anthropic")); } catch { return false; }
}
// Returns { opts, source } for building the client, or null if nothing is set up.
function resolveAuth() {
  if (process.env.ANTHROPIC_API_KEY) return { opts: {}, source: "ANTHROPIC_API_KEY (environment)" };
  if (process.env.ANTHROPIC_AUTH_TOKEN) return { opts: {}, source: "ANTHROPIC_AUTH_TOKEN (environment)" };
  const cfg = loadConfig();
  if (cfg.apiKey) return { opts: { apiKey: cfg.apiKey }, source: "your saved login (~/.config/symbiot)" };
  if (antProfileExists()) return { opts: {}, source: "your Anthropic CLI login (ant auth login)" };
  return null;
}
function getClient() {
  const auth = resolveAuth();
  if (!auth) return null;
  try { return { client: new Anthropic(auth.opts), source: auth.source }; }
  catch { return null; }
}

// ---- prompt (with masked secret input) ------------------------------------
function ask(question, { secret = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (secret && !PLAIN) {
      rl._writeToOutput = (str) => {
        if (str.includes(question)) rl.output.write(question);
        else if (str.includes("\n")) rl.output.write("\n");
        else rl.output.write("*");
      };
    }
    rl.question(question, (ans) => {
      rl.close();
      if (secret) process.stdout.write("\n");
      resolve((ans || "").trim());
    });
  });
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
  const conn = getClient();
  if (!conn) { console.log(AUTH_HELP); return null; }
  const stop = spinner("thinking…");
  try {
    const res = await conn.client.messages.create({
      model: MODEL, max_tokens: 1600,
      output_config: { effort: "low" }, // a summary doesn't need deep reasoning — keeps it fast + cheap
      system, messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") return "(the model declined this one — odd for a work summary; try again)";
    return res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || /api key|ANTHROPIC_API_KEY|authentication|credential|401/i.test(err?.message || "")) {
      console.log(c.y("Your Claude key was rejected. ") + "Re-connect with:  " + c.b("symbiot login --force"));
      return null;
    }
    return `Couldn't reach the model: ${err?.message || err}`;
  } finally { stop(); }
}

const AUTH_HELP =
  c.y("Symbiot writes your updates with Claude, so it needs an Anthropic API key.\n") +
  "  Fastest:   " + c.b("symbiot login") + c.d("        paste a key once; saved to ~/.config/symbiot") + "\n" +
  "  Or set:    export ANTHROPIC_API_KEY=sk-ant-...\n" +
  "  Get a key: https://console.anthropic.com/settings/keys\n" +
  c.d("  (If you use the Anthropic CLI, `ant auth login` works too.)");

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
  if (!resolveAuth()) { console.log(AUTH_HELP); return; }
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
  const out = await write(system, prompt);
  if (out) console.log(out + "\n");
}

async function cmdTodo() {
  if (!resolveAuth()) { console.log(AUTH_HELP); return; }
  const repos = findRepos(BASE, 60);
  const open = openWork(repos);
  if (!open.length) { console.log(c.y("Nothing outstanding found (no TODOs or uncommitted work).")); return; }
  const system =
    `You summarise what's still on a developer's plate from their TODO markers and uncommitted work. ` +
    `Group by project, lead with what looks most in-flight (uncommitted work) then the to-dos. ` +
    `Be concise and concrete. No preamble.`;
  header("Symbiot", `${open.length} open items · todo`);
  const out = await write(system, `Open work:\n${open.map((o) => `- ${o}`).join("\n")}\n\nWhat's still on my plate?`);
  if (out) console.log(out + "\n");
}

async function cmdLogin() {
  const existing = resolveAuth();
  const provided = flag("key", null);
  if (existing && !provided && !has("force")) {
    console.log(c.g("✓ ") + `Already connected — Symbiot is using ${existing.source}.`);
    console.log(c.d("  Replace it with `symbiot login --force`, or just run `symbiot week`."));
    return;
  }
  console.log("\n" + c.b("Connect Symbiot to Claude") + "\n");
  console.log("Symbiot writes your updates with Claude (Anthropic). It needs an API key,");
  console.log("stored locally on this machine and used only to write your updates.\n");
  console.log(c.d("  Get a key at:  https://console.anthropic.com/settings/keys") + "\n");

  let key = provided;
  if (!key) key = await ask("Paste your Anthropic API key (sk-ant-…): ", { secret: true });
  key = (key || "").trim();
  if (!key) { console.log(c.y("No key entered — nothing saved.")); return; }
  if (!/^sk-ant-/.test(key)) console.log(c.d("(that doesn't look like an sk-ant- key, but I'll try it)"));

  const stop = spinner("checking the key…");
  let ok = false, why = "";
  try { await new Anthropic({ apiKey: key }).models.list(); ok = true; }
  catch (e) {
    if (e instanceof Anthropic.AuthenticationError || /401|invalid|authentication/i.test(e?.message || ""))
      why = "Anthropic rejected it — the key looks invalid.";
    else why = `couldn't reach Anthropic — ${e?.message || e}`;
  }
  finally { stop(); }

  if (!ok) {
    console.log(c.y("That key didn't work: ") + why);
    console.log(c.d("Double-check it and run `symbiot login` again."));
    process.exitCode = 1;
    return;
  }
  if (saveConfig({ ...loadConfig(), apiKey: key })) {
    console.log(c.g("✓ ") + "Connected. You're set — try:  " + c.b("symbiot week"));
    console.log(c.d(`  Key saved in ${CONFIG_PATH} (readable only by you).`));
  } else {
    console.log(c.y("Couldn't write the config file. Set it in your shell instead:"));
    console.log("  export ANTHROPIC_API_KEY=" + key);
  }
}

function cmdLogout() {
  const cfg = loadConfig();
  if (!cfg.apiKey) { console.log("No saved key to remove."); return; }
  delete cfg.apiKey;
  saveConfig(cfg);
  console.log(c.g("✓ ") + `Removed the saved key from ${CONFIG_PATH}.`);
  if (process.env.ANTHROPIC_API_KEY) console.log(c.d("Note: ANTHROPIC_API_KEY is still set in your environment."));
}

function cmdWhoami() {
  const a = resolveAuth();
  if (a) console.log(c.g("✓ ") + `Symbiot is connected — using ${a.source}.  Model: ${MODEL}`);
  else { console.log(c.y("Not connected yet.\n")); console.log(AUTH_HELP); }
}

const HELP = `${c.b("symbiot")} — your week, written from your real work.

${c.b("Usage")}
  symbiot ${c.d("(or)")} symbiot week      write up your last ${SINCE_WEEK} days
  symbiot standup                   yesterday + today, for standup
  symbiot todo                      what's still on your plate
  symbiot login                     connect it to Claude (once)
  symbiot whoami                    show how it's connected
  symbiot logout                    forget the saved key
  symbiot help

${c.b("Options")}
  --dir <path>    where your repos are (default: ${homedir()})
  --since <days>  window for 'week' (default 7)
  --all           everyone's commits, not just yours
  --plain         no colour/spinner (good for piping)

${c.b("Setup")}  it writes with Claude, so it needs one Anthropic key:
  symbiot login                         ${c.d("paste a key once (recommended)")}
  export ANTHROPIC_API_KEY=sk-ant-...   ${c.d("or set it yourself")}
  ${c.d("Change the model with SYMBIOT_MODEL (default " + MODEL + "; e.g. claude-haiku-4-5 is cheaper).")}

${c.d("Reads only your local git. No accounts, no OAuth, no data leaves except the")}
${c.d("commit summaries sent to the model to write your update.")}`;

// ---- main -----------------------------------------------------------------
(async () => {
  if (cmd === "help" || cmd === "--help" || cmd === "-h") { console.log(HELP); return; }
  if (cmd === "login" || cmd === "auth") return cmdLogin();
  if (cmd === "logout") return cmdLogout();
  if (cmd === "whoami" || cmd === "status") return cmdWhoami();
  if (cmd === "week") return cmdWeek(SINCE_WEEK, "week");
  if (cmd === "standup") return cmdWeek(2, "standup");
  if (cmd === "todo") return cmdTodo();
  console.log(c.y(`Unknown command: ${cmd}`) + "\n"); console.log(HELP);
})();
