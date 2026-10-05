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
symbiot push       write tasks into each repo for your coding agent
symbiot drift      what's out of sync / at risk across your repos
symbiot login      connect it to an AI (once)
symbiot whoami     show how it's connected
symbiot logout     forget saved credentials
symbiot help
```

A few newer extras (email, CI checks, local-model setup) are
[experimental](#experimental).

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
  the Map shows its progress. Under the graph is the [experimental](#screens-blueprints-for-screen-automation)
  **Screens** view.
- **Drift** — the [`symbiot drift`](#whats-out-of-sync-symbiot-drift) report, with
  a "fetch latest" toggle (and an [experimental](#experimental) "check CI").
- **Week / Standup / Todo** — the write-ups (these use your chosen AI).
- **Tasks** — a checklist, grouped by kind (Fixes, Tests & CI, Docs, …). Filter by
  type or repo, then **Send to repos** to hand just those to your agent (see
  [`symbiot push`](#hand-tasks-to-your-coding-agent-symbiot-push)). What your agent
  finishes lands in **Awaiting your review** (see
  [Review and approve](#review-and-approve-the-agents-work)). A task you tick
  yourself is done and **auto-archives**; the archived view can restore it.
  **💬** on any task opens a Q&A thread: ask what it means, how to approach it, or
  (once it's awaiting review) what the agent changed. Answers use your chosen AI,
  grounded in that repo's commits, README, rules and pending diff; the thread is
  kept with the task.
- **Agents** — every agent run Symbiot has started (and local-model downloads):
  live status, elapsed time, exit code, the tail of its output, and **what it
  did** — files changed and commits made, read from git, whichever agent it was.
  When an agent leaves **questions, options or ideas** for you, they show up on its
  block (see [Questions from your agent](#questions-from-your-agent)).
- **Settings** — your AI, the folders to scan, your agent command, the
  [weekly write-up and start at login](#every-week-and-at-login), plus the
  [experimental](#experimental) email, model recommendations and one-click local
  model.

**Stays current by itself.** The app checks npm for a newer Symbiot every couple of
minutes (and whenever you come back to the window); the version you're on is shown
next to the name. When there's a newer one, **Update & restart** installs that exact
version, relaunches the app on the same address, and the open window reloads itself
onto it. Restart `symbiot app` yourself and the open window reconnects the same way.

The app listens on port **7391** so its address survives restarts; set
`SYMBIOT_PORT` to use another. **One app at a time:** running `symbiot app` while
it's already running just opens the existing window instead of starting a second
copy (`SYMBIOT_FORCE_NEW=1` starts one anyway). If something else holds the port,
it falls back to a free one.
It works on **Linux, macOS and Windows**; with no Chromium-family browser to open
the chrome-less window, it uses your default browser. On an Android phone it runs
in Termux ([experimental](#on-your-phone-android-in-termux)), or as an
[Android app](#the-android-app-apk) of its own.

### Every week, and at login

Two switches in Settings do what the old `symbiot-desktop` tray app did (that
repo is now archived), without Electron:

- **Write my week and notify me** on a day and hour you pick (Friday 16:00 by
  default). The app writes your week with your chosen AI, saves it to
  `~/.config/symbiot/weeks/<date>.md`, and sends a desktop notification
  (`notify-send` on Linux, Notification Center on macOS, a tray balloon on
  Windows). The Week tab shows it until you write a new one. It runs while
  `symbiot app` is running. A week missed while the computer was off is written
  when the app next starts, once. **Write it now** checks that it works.
- **Start Symbiot in the background when I log in** adds an autostart entry
  (`~/.config/autostart/symbiot.desktop` on Linux, a LaunchAgent on macOS, the
  Startup folder on Windows) that starts `symbiot app` with no window, so the
  weekly write-up happens even on days you don't open it. Running `symbiot app`
  then opens that copy's window. Switch it off to remove the entry. It needs an
  installed Symbiot (`npm install -g symbiot`), not `npx`.

### On your phone (Android, in Termux)

Experimental, and not yet tried on a real phone. Symbiot is a Node CLI, so it runs
in [Termux](https://termux.dev) (install it from F-Droid; the Play Store build is
out of date) next to the coding agent you use there. It works on the repos on your
phone, the same way it works on your computer's:

```bash
pkg install nodejs git gh termux-api        # gh: Approve opens the PR; termux-api: notifications
npm install -g symbiot
symbiot app                                 # opens in your phone's browser
```

- The app opens in Symbiot's Android app if it's installed (below), else in the
  phone's browser (through `termux-open-url`), and is laid out
  for a phone screen: Tasks, Agents (with your agent's questions), Approve and
  Settings all work there. Set your agent command in Settings as on a computer
  (Claude Code is detected if it's on Termux's `PATH`). "Add to Home screen" in
  Chrome gives it an icon.
- Clone repos into Termux's home (`~`), which Symbiot scans by default, along
  with the home folders (`/root`, `/home/<you>`) of any Linux you run with
  `proot-distro`. To reach
  the phone's shared storage, run `termux-setup-storage` and add `~/storage/shared`
  (or a folder in it) under Settings → Folders to scan.
- **Write my week and notify me** sends an Android notification when the
  `termux-api` package and the Termux:API app are installed.
- **Start Symbiot in the background when the phone starts** writes a
  [Termux:Boot](https://wiki.termux.com/wiki/Termux:Boot) script
  (`~/.termux/boot/symbiot`) that takes a wake lock, so Android doesn't stop it.
  Install Termux:Boot and open it once.
- **Screens** can't capture the screen from Termux; **Load image** still works.

### The Android app (APK)

Experimental, and so far tried in the Android emulator (Android 14) and on one
phone (a Galaxy A26, Android 16). The app is Symbiot on its own, with no Termux needed: Node, git and `gh`
are inside it (the same builds Termux installs), and it shows Symbiot full screen
with its own icon.

- **Install:** on your phone, download `symbiot-aarch64.apk` from the
  [latest release](https://github.com/GarthGhostai/symbiot/releases/latest)
  (or copy `symbiot-<version>-aarch64.apk` over from a computer that built it)
  and open it (allow your browser or file manager to install apps). Android may warn that the
  app was built for an older version of Android. That's on purpose: it's what lets
  an app run programs it carries, like Node and git, the same reason Termux does.
  It also keeps the app off the Play Store.
- **First start** unpacks Node, git and gh (a few seconds), then asks for **All
  files access**, so it can find the repos in your phone's shared storage. It scans
  shared storage (for example the folders Termux's `~/storage/shared` points at)
  instead of a home folder. Until it has that access, the Map says so and has an
  **Allow file access** button. Once you allow it and come back, the Map scans again.
- **Its own Symbiot only sees shared storage.** Projects in Termux's home folder
  (`~`) are private to Termux, and no other app can read them. Keep a project in
  shared storage (in Termux, run `termux-setup-storage` once, then work under
  `~/storage/shared`), or have the app show the Symbiot running in Termux (next
  point). The repos on your computer aren't on the phone either, so clone the
  ones you want.
- **Your Termux projects: show the Symbiot running in Termux.** A Symbiot started
  in Termux sees everything in its home folder and runs your agent there, and the
  app can be its window. **Open Termux** (on the Map when it finds no repos, and
  in Settings → Projects in Termux) copies a command that installs Node and
  Symbiot in Termux if they're missing, then runs `symbiot app`. Paste it in
  Termux (it also updates Symbiot there if it's older than the app's). Termux
  then opens Symbiot's link in the app, as a `symbiot://` link that only the app
  takes, and the app shows that Symbiot instead of its own, and stops its own. It
  keeps doing so until you tap **Use the app's own Symbiot**. If that Symbiot
  stops, the app says so and offers both buttons. If the page opens in your
  browser instead, it offers **Open in the app**. Termux from
  Google Play can't take commands from other apps (it
  has no `RUN_COMMAND`), so the app can't start Symbiot there by itself.
- It keeps running with its window closed (a quiet "Symbiot is running"
  notification has **Stop**), so the weekly write-up, agent runs and Approve keep
  going. **Start Symbiot in the background when the phone starts** and **Write my
  week and notify me** work as they do on a computer, with Android notifications.
  **Update & restart** updates it from npm, as on a computer.
- **Your coding agent isn't inside it.** Keep running Claude Code (or your agent)
  in Termux, on the same repos in shared storage, the way you do now.
- **Screens:** no capture and no Map page (a phone has no desktop browser to
  drive); **Load image** works.

To build it yourself: `android/build.sh` (or `android/build.sh x86_64` for the
emulator) writes `android/build/symbiot-<version>-<arch>.apk`. It needs Node, the
Android SDK and a JDK 17 (or Docker). The script's header lists the details,
including the signing key to keep (`~/.android/symbiot.jks`): an update has to be
signed with the same key. Each release also builds the aarch64 APK and attaches it
to a GitHub release tagged `apk-<version>`, signed with that same key once it's
in the repo's `SYMBIOT_KEYSTORE_B64` and `SYMBIOT_KEYSTORE_PASS` secrets (see
`.github/workflows/publish.yml`).

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

**Releases.** For a repo that releases with `v*` tags, the review card warns when
the default branch is past its last tag (merged work that isn't released). If
`package.json`'s version is already released and the changes don't touch it, a
**Version** picker next to Approve bumps it in the same PR: a patch by default, or a
minor, or keep it. It updates `package.json` and the lockfile's own version, and the
PR says which tag to push once it merges.

If a repo you sent tasks to has uncommitted changes but no ticked task (say the
agent made a fix and didn't tick anything), it still shows up here, with
**Approve changes without a task → PR**. That ships the changes the same way, on
a `symbiot/changes-<date>` branch, and leaves your tasks as they are. It also
lists your own uncommitted work in those repos, so check the diff first.

### Run your agent automatically

Set an **agent command** in Settings (*Hand off to your agent*), and every
**Send to repos** (or `symbiot push --open`) runs it in each repo it wrote to. It's
a template — `{dir}` is the repo path, `{prompt}` is the instruction to read
`TASKS.md` — so it works with any agent or editor:

```
claude -p "{prompt}" --permission-mode acceptEdits --allowedTools "Bash(npm test:*)" "Bash(node:*)"
aider --message "{prompt}" --yes
code {dir}
```

Settings shows **one-click presets** for what's installed on your machine. A
preset only fills in the command box; the saved command is what runs.

- **Agents** (all make changes, ready for your review): Claude Code, Codex
  (OpenAI), Aider, Cursor agent, Gemini CLI. The Claude preset may also run
  `npm test` and `node`, so it can check its own work; a command saved from the
  older preset is upgraded automatically, and an edited one is left alone.
  The others run as-is, with their own limits: Codex (`--full-auto`) can run
  tests but has no network in its sandbox, so tests that download packages
  fail; Gemini (`--yolo`) approves every shell command, tests included; Aider
  doesn't run shell commands unattended, so it can't check its own work.
- **Orca IDE** (any OS): opens the repo in Orca — either just the repo, to use
  Orca's own agent, or with Claude running in a new tab (allowed `npm test` and
  `node` like the Claude preset, and upgraded the same way). It launches Orca if
  it's closed and waits for it to be ready first.
- **Editors — opens only, no review:** VS Code, Cursor, Windsurf, Zed, Sublime
  Text, IntelliJ IDEA, Neovim (on macOS, also found as `.app` bundles when the CLI
  isn't on your PATH). They just open the repo. Nothing comes back for review unless
  you run an agent there yourself, and Neovim needs a terminal to open in.

Each run is logged to `.symbiot/agent.log` in the repo and shown live in the
**Agents** tab. The command is saved as `agentCmd` in
`~/.config/symbiot/config.json` — it's your command, Symbiot only fills in
`{dir}` and `{prompt}`. A command saved from an older preset keeps working as-is.

One agent per repo: while a run is still going (tracked in
`.symbiot/agent.pid`, so the app and `symbiot push --open` both see it), sending
again doesn't start a second agent there, and doesn't rewrite the `TASKS.md` it's
working from either: the new tasks wait in `.symbiot/TASKS.next.md` and replace
`TASKS.md` when it finishes, keeping anything it ticked. The agent's block in the
**Agents** tab shows "tasks held" meanwhile (hover it for their titles), and
when the agent finishes, the app starts one on the held tasks by itself. If
`symbiot push --open` started the running agent, the app can't see it exit, so
it starts one the next time it checks that repo after it finishes (opening the
**Tasks** tab), or you can send again. Orca and
editor presets only open a tab and exit, so Symbiot can't see the agent you run
in them. Send to repos stays disabled until its
handoffs have started, so a double click can't send twice.

### Questions from your agent

An agent working in your terminal or IDE stops to ask you things: which way to go,
whether to do something risky, ideas it had along the way. A handed-off run can't
do that, because it runs unattended. So the brief gives **every** agent (Claude,
Codex, Aider, Gemini, Cursor, whatever you run) a way to ask anyway. It writes
**`.symbiot/QUESTIONS.md`**:

```markdown
## Questions
### Keep the old config format working?
Reading both costs about 40 lines.
- Yes, read both (recommended)
- No, migrate once and drop it

## Suggestions
- Add a --json flag to drift
```

Up to five questions show on that agent's block in the **Agents** tab, each with
its options and room for your own answer, alongside its ideas. **Send answers &
continue** appends your answers to `.symbiot/ANSWERS.md` and runs your agent
command again so the agent carries on with them. **Save only** keeps them for the
next run. **+ task** adds an idea to your Tasks for that repo. The agent is told to
keep going with everything that doesn't depend on an answer, and to ask instead of
doing anything destructive. Both files live in `.symbiot/`, so they're never
committed.

## What's out of sync? `symbiot drift`

```bash
symbiot drift          # local git facts only — fast, no network
symbiot drift --fetch  # fetch from origin first, so "behind" is current
```

A **deterministic** report of what's out of sync, stuck, or at risk across your
repos — computed from git facts, each line citing the fact behind it (no model
guessing). It flags: **stale checkouts** (a working tree that's an old snapshot,
not new work), **uncommitted work**, **behind upstream**, **multiple worktrees**,
**branches with work not on the default**, **PR merges that landed off the default
branch** (the "merged but main didn't move" trap — split into *likely never
landed*, when files the PR added are missing from main, and *probably re-done*,
when they're all there), and — if you configure it — **production running code
that isn't on your default branch**. Works on local-only repos too: without a
remote it compares against your local default branch. (CI checks with `--ci` are
[experimental](#ci-status-symbiot-drift---ci).)

For the production check, add a per-repo deploy command to
`~/.config/symbiot/deploys.json` (read only from your own config, never from a
repo), keyed by repo path or folder name, that prints the deployed commit sha:
`{ "/path/to/repo": "ssh prod cat ~/app/.deployed-sha" }`. Also the **Drift** tab
in the app.

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
  `TODO`/`FIXME` markers and uncommitted changes for `todo`. If you switch
  [email](#your-sent-email-without-an-api-symbiot-mail) on, it also reads the headers
  of mail you sent (subject, recipients, date). All local.
- **Sends to the AI:** commit messages and dates, changed-file **names**, the
  folder structure, `TODO`/`FIXME` lines, and (for a repo review) an excerpt of
  the README and any `CLAUDE.md`/`AGENTS.md` conventions. With email on, it also
  sends the subjects and recipient names of mail you sent. It does **not** send
  whole source files or any email body. With a **local Ollama model, nothing leaves your machine.**
- **Shows its work:** every report ends with a footer — path, branch, how many
  commits matched you (e.g. "1090 of 1101"), the README's age, and the
  working-tree state — so you can see exactly what it read.
- **Never:** no keylogging, no screen capture, no browsing history, no accounts.
- **Runs only what you set:** the agent command is yours, and deploy commands are
  read only from your own `~/.config/symbiot/`, never from a repo.

## Experimental

These work and are tested, but are newer or depend on things Symbiot can't fully
check, so they may change. Everything above works without them.

### Your sent email, without an API: `symbiot mail`

```bash
symbiot mail                 # what mail it can read, and what you sent this week
symbiot mail --on            # use it in week / standup   (--off to stop)
symbiot mail --add ~/Takeout/Mail/All\ mail.mbox   # an export, or any mail folder
```

Week and Standup can include **what you sent**. It needs no Gmail or Outlook API,
OAuth, app registration or password: Symbiot reads the mail a desktop client
already keeps on your computer, so anyone can link theirs the same way.
**Thunderbird** (including Snap and Flatpak), **Apple Mail**, **Evolution**,
**KMail**, and **mutt/neomutt** or any `~/Maildir` / `~/mail` are found
automatically, and only their **Sent** folders are read. Webmail only? Add an
export: Google Takeout gives you an `.mbox`, and Symbiot keeps just the messages
with Gmail's *Sent* label (or from one of your addresses). Any `.mbox` file or
folder of `.eml` files works too.

It reads **headers only** (date, recipients, subject), never a message body, and
it's **off until you switch it on** in Settings (*Email*) or with
`symbiot mail --on`. **Preview** shows exactly what a write-up would see. Why it's
experimental: the tests cover mbox and Maildir, but it hasn't been tried against
real Apple Mail, Evolution or KMail stores. On macOS, reading Apple Mail needs Full
Disk Access for your terminal. Outlook for Windows (`.pst`) isn't supported:
export to `.mbox` or use Thunderbird.

### CI status: `symbiot drift --ci`

```bash
symbiot drift --ci     # also check GitHub Actions state (needs gh)
```

Adds CI to the drift report, telling a real failing run apart from **CI that isn't
running at all** (jobs never started, usually a billing or spending limit) and
quoting GitHub's reason when it can. Also the **check CI** toggle in the Drift tab.
Why it's experimental: it needs the GitHub CLI (`gh`), only covers GitHub Actions,
and spotting "not running" is a heuristic.

### Local models: `symbiot models` and `symbiot setup-local`

```bash
symbiot models                           # recommend models for this machine
symbiot setup-local                      # the best local model for your RAM
symbiot setup-local --model llama3.2:3b  # or pick one
```

`models` reads your RAM / CPU / GPU and recommends **local models by tier** (min /
med / max, marking which fit your RAM) to run free and private via
[Ollama](https://ollama.com), plus **paid** options (Claude / OpenAI / Gemini,
cheap → top). `setup-local` starts Ollama if it isn't running, downloads the model
with progress, and switches Symbiot over to it. If Ollama isn't installed it prints
the one-line install for your OS and you re-run it after. Both are buttons in
Settings, where the download shows in the Agents tab. You can always pick a model
yourself with `symbiot login`.

### Screens: blueprints for screen automation

Under the Map, **Screens** builds the map that screen automation needs: what's on a
screen, and where. **Capture screen** (now, or after a few seconds so you can bring
the right window to the front) or **Load image** for a PNG you already have, then
drag a box over each part that matters (a button, a field, a menu) and name it.
Hovering shows the pixel under the pointer. Each region keeps its position and size
in the screenshot's own pixels, plus its **centre**, the point a click would aim at.
**Copy blueprint** copies them as JSON; everything is also saved in
`~/.config/symbiot/screens/screens.json` (next to each screen's PNG), where an
agent or script can read it. Screenshots and that file are readable by you only.

**A web page maps itself.** Type a site next to **Map page** (`gmail`,
`github.com/pulls` or a full address) and Symbiot opens it in a hidden (headless)
browser, takes its screenshot and marks every button, link and field on it by
itself, named from the page (`Compose`, `Search mail`, …) with what each one is
and a CSS selector to find it again. Nothing to bring to the front, nothing to
drag. Only what you could click right now counts: anything hidden, below the
fold or covered by something else is left out. **Press** on a region clicks it
in that hidden browser and maps the page it leads to as a new screen, so map,
press, map is how an agent finds its way around a site. **Type** on a field types
your text into it there (replacing what was in it) and, with **Type, then Enter**
ticked, presses Enter, which is how a search or a one-line form is sent; the
result is mapped as a new screen too. Each press or type opens the page from its
address again, so text typed without Enter is gone by the next press. Press and
Type act on the real site, signed in as you, so they ask first, unless the site
is under **Trusted sites** in Settings: there, they go ahead without asking, for
you and for agents. A trusted site covers its subdomains (`google.com` covers
`mail.google.com`), and only you add sites, in Settings (there's no command for
an agent to do it). The hidden browser is your
Chrome, Chromium, Edge or Brave, with a profile of its own
(`~/.config/symbiot/browser`, separate from your everyday one). For a site behind
a sign-in, **Sign in** opens it there as a normal window. Sign in once, close the
window, and later maps are signed in. When a map lands on a sign-in page, Symbiot
says so. It works for web pages only. A desktop app still needs **Capture screen**.

From a terminal, or for your coding agent, the same thing prints JSON:

```bash
symbiot screens map gmail              # the screen's id, and each region's id, label, kind, centre and selector
symbiot screens press <id> Compose --yes   # press a region (by id or label), map where it lands
symbiot screens type <id> "Search mail" "invoice" --enter --yes   # type into a field, press Enter, map the result
                                       # (--yes isn't needed on a site under Trusted sites in Settings)
symbiot screens show <id>              # a saved screen's blueprint
symbiot screens signin gmail           # sign in once, in Symbiot's browser window
symbiot screens                        # list them
```

**More than one display?** Symbiot reads how your displays are laid out
(`cosmic-randr`, `wlr-randr`, `kscreen-doctor` or `xrandr` on Linux, PowerShell on
Windows, AppKit on macOS) and a picker appears next to Capture: **each display**
(one screen per display, named after it, e.g. "PR page · HDMI-1 (left)"), **one
display only**, or **all displays in one image**. The choice is remembered. A
screenshot you already took of the whole desktop has **Split by display**, which
cuts it up the same way and moves each region onto the display it's on (the whole
image stays). A display's screen remembers where that display sits, so **Click
here** lands on the right display, and its blueprint gives each region's point on
the whole desktop too (`desktop`). If the screenshot doesn't match the layout (say
a display was plugged in since), Symbiot keeps it whole and says why.

**Click here** on a region moves your mouse to the region's centre and clicks there,
on your real screen. It asks you to confirm every time, and can wait 3, 5 or 10
seconds first so you can bring the right window to the front. It clicks with
`cliclick` on macOS (`brew install cliclick`), with PowerShell on Windows (nothing to
install), and on Linux with `xdotool` on X11 or `ydotool` on Wayland (which needs
access to `/dev/uinput`, and `ydotoold` running for ydotool 1.x). Nothing types on your real screen yet (Type works on a mapped web page only).

Capture uses the screenshot tool your system has: `screencapture` on macOS,
PowerShell on Windows, and on Linux `gnome-screenshot`, `spectacle`,
`cosmic-screenshot`, `grim` or `xfce4-screenshooter` (plus `scrot` / ImageMagick
`import` on X11). Why it's experimental: Wayland desktops restrict screenshots, so
capture may fail or ask for permission (use **Load image** then). If your desktop
has screenshots turned off for the app Symbiot was started from (say, the COSMIC
dock), Symbiot says so and offers **Allow screenshots**, which turns them on for
apps started that way. And on a scaled
(HiDPI) display, screenshot pixels can differ from the coordinates a click tool
expects. Symbiot rescales for `xdotool` and for `cliclick` on a Retina screen, but
it can't read the scale on Wayland, and ydotool's moves follow your pointer
acceleration, so a click there can land off target.

## Config, development and releasing

Config files, environment variables (`SYMBIOT_MODEL`, `SYMBIOT_PORT`, …), the test
suites and how releases are cut are in [CONTRIBUTING.md](CONTRIBUTING.md).

---

Part of Symbiot — an assistant that learns how you work and gives it back to you.
This CLI is the personal, install-it-yourself front door: it needs nothing but your
own machine and an AI of your choice.
