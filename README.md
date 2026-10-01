# symbiot

Your week, written from your real work.

Symbiot reads your **local git activity** and writes the update you'd actually send —
your weekly summary, your standup, or what's still on your plate. No accounts, no
OAuth, no integrations to wire up. It writes with the **AI of your choice** —
Claude, OpenAI, Gemini, or a **local model** via Ollama — set up once.

```
symbiot            your last 7 days, written up   (same as: symbiot week)
symbiot standup    yesterday + today, for standup
symbiot todo       what's still on your plate
symbiot app        open the visual app in your browser
symbiot drift      what's out of sync / at risk across your repos
symbiot push       write tasks into each repo for your coding agent
symbiot models     recommend AI models for your hardware
symbiot setup-local  set up a free local model (Ollama), one command
symbiot login      connect it to an AI (once)
symbiot whoami     show how it's connected
symbiot logout     forget saved credentials
symbiot help
```

## Install

```bash
npm install -g symbiot        # or run without installing:  npx symbiot week
```

## Prefer a window? `symbiot app`

```bash
symbiot app
```

Starts a tiny local server (127.0.0.1 only, protected by a token) and opens the
visual app in your browser — in a clean, chrome-less window if you have
Chrome/Chromium/Edge/Brave (`--app` mode), otherwise a normal tab. No Electron,
no install — it's the same CLI. Press Ctrl+C (or click Quit) to stop.

Tabs:

- **Map** (the landing view) — a live node graph of your work from your local git:
  you at the centre, your repos, the languages and tools they share (so related
  projects cluster), the coding **agents and editors** you have installed, and the
  **AI** powering Symbiot. Project folders that **aren't git repos** show up too
  (see [Where it looks](#where-it-looks)). **Scroll to zoom, drag to pan, click a
  node.** A repo's panel shows its branch, commits, uncommitted work and stack, a
  **Suggest next steps** button, and an **AI review**: what the project does, a
  one-line verdict on whether it needs new work at all (it prefers stabilising over
  new features), and ideas you can tick straight into **Tasks**. The graph needs
  **no AI key**; reviews and suggestions use your chosen model. While the scan runs
  the Map shows its progress.
- **Drift** — the [`symbiot drift`](#whats-out-of-sync-symbiot-drift) report, with
  "fetch latest" and "check CI" toggles.
- **Week / Standup / Todo** — the write-ups (these use your chosen AI).
- **Tasks** — a checklist, grouped by kind (Fixes, Tests & CI, Docs, …). Filter by
  type or repo, then **Send to repos** to hand just those to your agent (see
  [`symbiot push`](#hand-tasks-to-your-coding-agent-symbiot-push)). What your agent
  finishes lands in **Awaiting your review** (see
  [Review and approve](#review-and-approve-the-agents-work)). A task you tick
  yourself is done and **auto-archives**; the archived view can restore it.
- **Agents** — every agent run Symbiot has started (and local-model downloads):
  live status, elapsed time, exit code, the tail of its output, and **what it
  did** — files changed and commits made, read from git, whichever agent it was.
- **Settings** — your AI, the folders to scan, your agent command, model
  recommendations and a one-click local model.

**Stays current by itself.** The app checks npm for a newer Symbiot every couple of
minutes (and whenever you come back to the window); the version you're on is shown
next to the name. When there's a newer one, **Update & restart** installs that exact
version, relaunches the app on the same address, and the open window reloads itself
onto it. Restart `symbiot app` yourself and the open window reconnects the same way.

The app listens on port **7391** so its address survives restarts; set
`SYMBIOT_PORT` to use another (it falls back to a free port if that one is busy).
It works on **Linux, macOS and Windows**; with no Chromium-family browser to open
the chrome-less window, it uses your default browser.

## Hand tasks to your coding agent: `symbiot push`

```bash
symbiot push          # or the "Send to repos" button in the app's Tasks tab
symbiot push --open   # ...and run your agent command in each repo
```

Writes a **`.symbiot/TASKS.md`** into each repo your tasks reference — a checklist
**plus the context an agent needs to get oriented**: the stack, recent commits,
open `TODO/FIXME` markers (with `file:line`), and current drift. Then point Claude
Code / Cursor / any agent at it: *"Read `.symbiot/TASKS.md` and implement the
unchecked items."* Tasks come from ticking a repo review's ideas, or adding your
own in the Tasks tab. Non-git project folders on the Map can receive tasks too.

The brief asks the agent to tick each item (`- [x]`) as it finishes it and to leave
its changes **uncommitted**, ready for your review.

### Review and approve the agent's work

A tick from the agent doesn't archive anything. It moves the task into **Awaiting
your review** at the top of the Tasks tab, grouped by repo, with the branch, the
size of the uncommitted change and a **Show diff** button. For each repo:

- **Approve → PR** syncs the work. If you're on the default branch it creates
  `symbiot/<task>`, commits everything except `.symbiot/` with the approved tasks as
  the message, pushes, and opens a PR with the GitHub CLI (`gh`). If you're already
  on a feature branch it commits and opens the PR from there. Each step that can't
  happen stops there and says why: no `origin` remote means a local commit only, and
  without `gh` it pushes and stops. Your commit is never lost. Then the tasks are
  archived with their commit and PR link. With no changes to commit the button
  reads **Approve → archive** and just archives them.
- **↩ (send back)** is for one that isn't right: it reopens the task and unticks it in
  `TASKS.md`, so the next **Send to repos** hands it to the agent again.

Tasks waiting for review aren't re-sent to the agent.

### Run your agent automatically

Set an **agent command** in Settings (*Hand off to your agent*), and every
**Send to repos** (or `symbiot push --open`) runs it in each repo it wrote to. It's
a template — `{dir}` is the repo path, `{prompt}` is the instruction to read
`TASKS.md` — so it works with any agent or editor:

```
claude -p "{prompt}" --permission-mode acceptEdits
aider --message "{prompt}" --yes
code {dir}
```

Settings shows **one-click presets** for what's installed on your machine. A
preset only fills in the command box; the saved command is what runs.

- **Agents** (all make changes, ready for your review): Claude Code, Codex
  (OpenAI), Aider, Cursor agent, Gemini CLI.
- **Orca IDE** (any OS): opens the repo in Orca — either just the repo, to use
  Orca's own agent, or with Claude running in a new tab. It launches Orca if it's
  closed and waits for it to be ready first.
- **Editors:** VS Code, Cursor, Windsurf, Zed, Sublime Text, IntelliJ IDEA (on
  macOS, also found as `.app` bundles when the CLI isn't on your PATH). The
  handoff runs in the background without a terminal, so terminal editors like
  Neovim aren't offered.

Each run is logged to `.symbiot/agent.log` in the repo and shown live in the
**Agents** tab. The command is saved as `agentCmd` in
`~/.config/symbiot/config.json` — it's your command, Symbiot only fills in
`{dir}` and `{prompt}`. A command saved from an older preset keeps working as-is.

## What's out of sync? `symbiot drift`

```bash
symbiot drift          # local git facts only — fast, no network
symbiot drift --fetch  # fetch from origin first, so "behind" is current
symbiot drift --ci     # also check GitHub Actions state (needs gh)
```

A **deterministic** report of what's out of sync, stuck, or at risk across your
repos — computed from git facts, each line citing the fact behind it (no model
guessing). It flags: **stale checkouts** (a working tree that's an old snapshot,
not new work), **uncommitted work**, **behind upstream**, **multiple worktrees**,
**branches with work not on the default**, **PR merges that landed off the default
branch** (the "merged but main didn't move" trap — split into *likely never
landed*, when files the PR added are missing from main, and *probably re-done*,
when they're all there), and — if you configure it — **production running code
that isn't on your default branch**. With `--ci` it tells a real failing run apart
from **CI that isn't running at all** (jobs never started — usually a billing or
spending limit), quoting GitHub's reason when it can. Works on local-only repos
too: without a remote it compares against your local default branch.

For the production check, add a per-repo deploy command to
`~/.config/symbiot/deploys.json` (read only from your own config, never from a
repo), keyed by repo path or folder name, that prints the deployed commit sha:
`{ "/path/to/repo": "ssh prod cat ~/app/.deployed-sha" }`. Also the **Drift** tab
in the app.

## Which model? Ask your machine

```bash
symbiot models
```

Reads your RAM / CPU / GPU and recommends **local models by tier** (min / med / max,
marking which fit your RAM) to run free & private via [Ollama](https://ollama.com),
plus **paid** options (Claude / OpenAI / Gemini, cheap → top). Also available as
a button in the app's Settings.

### A free local model in one command: `symbiot setup-local`

```bash
symbiot setup-local                      # the best model for your RAM
symbiot setup-local --model llama3.2:3b  # or pick one
```

Starts Ollama if it isn't running, downloads the model (with progress), and
switches Symbiot over to it — free, private, nothing leaves your machine. If
Ollama isn't installed yet it prints the one-line install for your OS (Homebrew on
macOS, winget on Windows, the official script on Linux) and you re-run it after.
Also the **Set up a free local model** button in Settings, where the download shows
in the Agents tab and Symbiot switches over when it finishes.

## Connect it (once)

Pick the AI you want it to write with:

```bash
symbiot login     # choose Claude, OpenAI, Gemini, or a local model (Ollama)
```

You'll get a short menu; paste that provider's API key (or, for Ollama, just point
it at your local server) and it's saved to `~/.config/symbiot/config.json`. The
app's Settings tab does the same.

| Provider | Get a key | Default model |
|----------|-----------|---------------|
| Claude (Anthropic) | <https://console.anthropic.com/settings/keys> | `claude-opus-5-5` |
| OpenAI (GPT) | <https://platform.openai.com/api-keys> | `gpt-4o-mini` |
| Gemini (Google) | <https://aistudio.google.com/apikey> | `gemini-1.5-flash` |
| Local (Ollama) | runs on your machine, no key | `llama3.1` |

Non-interactive: `symbiot login --provider openai --key sk-... [--model gpt-4o]`.
Environment keys are auto-detected too (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GEMINI_API_KEY`), and `symbiot whoami` shows which one is active.

## Use

```bash
symbiot week                  # writes up what you did, grouped and readable
symbiot week --since 14       # a fortnight instead of a week
symbiot standup               # short: done + next
symbiot todo                  # TODOs + uncommitted work, prioritised
symbiot week --all            # everyone's commits, not just yours
symbiot week --plain          # no colour/spinner, good for piping
symbiot week --dir ~/work     # just this folder, this once
```

It summarises the commits **you** authored — matching all your identities in each
repo (per-repo and global email, your GitHub noreply address, your name), and
counting everyone if that filter would drop almost all of an active repo's history.

## Where it looks

By default Symbiot scans your **home folder**. To point it at where your work
actually lives — inside or outside your home folder, one place or several — add
folders under **Settings → Folders to scan for repos** in the app. Adding the first
extra folder keeps your home folder in the list; remove whichever you don't want.
They're saved as `scanRoots` in `~/.config/symbiot/config.json` (`~` works).
`--dir <path>` overrides them for a single run.

Every view uses the **same set of repos** — the Map, Week / Standup / Todo, Drift,
and Send to repos all agree. Heavy folders (`node_modules`, virtualenvs, caches, …)
are skipped, and worktrees of one repo count once (the freshest checkout).

**Not everything is a repo.** Inside your scan folders, Symbiot also picks up
**project folders without git** — any folder (up to three levels down) with a
project manifest such as `package.json`, `pyproject.toml`, `requirements.txt`,
`go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`, `Gemfile`, `composer.json`,
`Dockerfile`, `pubspec.yaml` or `CMakeLists.txt`. They appear on the Map (sand
coloured) with their languages, and can receive tasks like a repo.

**Scans can't hang.** A scan has an overall time limit (60 s by default; set
`SYMBIOT_SCAN_TIMEOUT` in seconds). If it runs out — a slow network drive, a
gigantic folder — it stops and shows what it found so far, marked **partial**,
instead of hanging. The CLI shows scan progress on one line as it goes.

## What it reads, and what it doesn't

- **Reads:** your local git — commit messages and changed-file names, plus
  `TODO`/`FIXME` markers and uncommitted changes for `todo`. All local.
- **Sends to the AI:** commit messages and dates, changed-file **names**, the
  folder structure, `TODO`/`FIXME` lines, and (for a repo review) an excerpt of
  the README and any `CLAUDE.md`/`AGENTS.md` conventions. It does **not** send
  whole source files. With a **local Ollama model, nothing leaves your machine.**
- **Shows its work:** every report ends with a footer — path, branch, how many
  commits matched you (e.g. "1090 of 1101"), the README's age, and the
  working-tree state — so you can see exactly what it read.
- **Never:** no keylogging, no screen capture, no browsing history, no accounts.
- **Runs only what you set:** the agent command is yours, and deploy commands are
  read only from your own `~/.config/symbiot/`, never from a repo.

## Config

Everything lives in `~/.config/symbiot/`: `config.json` (your AI, `scanRoots`,
`agentCmd`; readable only by you), `tasks.json` (your tasks),
`deploys.json` (optional, for drift's production check) and `rules.md` (optional
conventions every repo review must respect, alongside each repo's own
`CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md`).

- `SYMBIOT_MODEL` — override the model for any provider (e.g. `gpt-4o`,
  `claude-haiku-4-5`, `gemini-1.5-pro`).
- `SYMBIOT_SCAN_TIMEOUT` — the scan time limit, in seconds (default 60).
- `SYMBIOT_PORT` — the app's port (default 7391).
- `symbiot whoami` shows the active provider, model, and where the credential
  came from. `symbiot logout` forgets saved credentials.

## Development

```bash
npm test
```

Runs four suites, all against throwaway repos and an isolated `HOME`:

- `test/load.mjs` — the shipped files parse and load: `node --check` on each
  module, `ui.mjs` imported on its own with its page's JavaScript parsed, every
  local import listed in package.json `"files"`, and the `bin` entry point shipped.
- `test/fixtures.mjs` — accuracy fixtures: the facts Symbiot collects (identity
  matching, stale checkouts, worktrees, drift) and the `symbiot drift` report as
  printed, the scan time limit, the agent handoff, and the review → approve cycle.
- `test/smoke.mjs` — boots `symbiot app`, runs the page's own JavaScript against
  a fake DOM (every tab, every button), hits every endpoint the UI calls with the
  method the UI uses, and checks POST-only endpoints refuse GET and `/api` needs
  the token.
- `test/install.mjs` — runs the CLI through a bin symlink, then `npm pack` +
  global install into a temp prefix: `symbiot help`, every shipped file present,
  and the installed `symbiot app` serving its page. Needs npm registry access for
  dependencies; `SYMBIOT_SKIP_INSTALL_TEST=1` skips that part.

`SYMBIOT_NO_OPEN=1` stops `symbiot app` opening a window (the tests set it).
CI (`.github/workflows/ci.yml`) runs the full suite on every push to `main` and
every pull request. Releases publish from a version tag via
`.github/workflows/publish.yml`, which runs that same workflow first and only
publishes if it passes.

---

Part of Symbiot — an assistant that learns how you work and gives it back to you.
This CLI is the personal, install-it-yourself front door: it needs nothing but your
own machine and an AI of your choice.
