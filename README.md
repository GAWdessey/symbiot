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

The newer extras are [experimental](#experimental): email, CI checks,
local-model setup, Screens and Watch, and Symbiot on a phone. The list there says
what's stable and what isn't.

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

It opens on [the liquid](#the-liquid-a-home-that-shapes-itself-to-you); each of these parts opens from it:

- **Map** — a live node graph of your work from your local git:
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
- **Dashboard** — everything you [watch](#screens-blueprints-for-screen-automation),
  as a stream: time runs left to right, one current per feed (your inbox, GitHub,
  WhatsApp, any other page), "now" on the right where each feed pools. Every message
  is a bead placed when it arrived; the ones waiting for your reply are bigger and
  amber, and what you've already seen stays as small faint beads. Point at or tap a
  bead to read it and **Draft a reply** or **Open** it. Under each feed's name:
  **Seen** (sets its count back to 0; what it found stays under Watching, and the
  other feeds keep theirs), **Talk** (a chat with your AI about what's new there:
  what needs you, and what to say to whom; agree it there, then **Draft a reply**
  on one, and your agent gets that talk with the message, so it writes what you
  agreed) and **Check now**. The headline says what's waiting; switch between 24
  hours, 3 days and 7 days. Each feed's latest brief sits at the end of its
  current, the cards are still there under **All of it as a list**, and
  **Connections** below shows every site you can [link](#link-your-work).
  `symbiot watch board` prints the same feeds as JSON, and
  `symbiot watch board --line` as one line for a status bar (`2 emails · 1 WhatsApp message`).
  `symbiot watch chat <id> "question"` is a feed's Talk from a terminal, so an
  agent can go over what's new with you too.
- **Drift** — the [`symbiot drift`](#whats-out-of-sync-symbiot-drift) report, with
  a "fetch latest" toggle (and an [experimental](#experimental) "check CI").
- **Week / Standup / Todo** — the write-ups (these use your chosen AI).
- **Tasks** — a checklist, grouped by kind (Fixes, Tests & CI, Docs, …). Filter by
  type or repo, then **Send to repos** to hand just those to your agent (see
  [`symbiot push`](#hand-tasks-to-your-coding-agent-symbiot-push)). What your agent
  finishes lands in **Awaiting your review** (see
  [Review and approve](#review-and-approve-the-agents-work)). A task you tick
  yourself is done and **auto-archives**; the archived view (the liquid's
  **Archive**) can restore it. Opening Tasks or Agents from the liquid shows the
  work first: a sphere per task an agent is on, named in plain words, with small
  spheres orbiting it while it works; what's done and waiting for your OK; and what's
  waiting its turn, gathered round the agent in its repo. One **Go** (or saying
  "go") starts everything waiting. Tap a sphere for the details.
  **💬** on any task opens a Q&A thread: ask what it means, how to approach it, or
  (once it's awaiting review) what the agent changed. Answers use your chosen AI,
  grounded in that repo's commits, README, rules and pending diff; the thread is
  kept with the task.
- **Agents** — every agent run Symbiot has started (and local-model downloads):
  live status, elapsed time, exit code, the tail of its output, and **what it
  did** — files changed and commits made, read from git, whichever agent it was.
  When an agent leaves **questions, options or ideas** for you, they show up on its
  block (see [Questions from your agent](#questions-from-your-agent)).
- **Settings** — [Link your work](#link-your-work), your AI, the folders to scan, your agent command, the
  [weekly write-up and start at login](#every-week-and-at-login), plus the
  [experimental](#experimental) email, model recommendations and one-click local
  model.

**Stays current by itself.** The app checks npm for a newer Symbiot every couple of
minutes (and whenever you come back to the window); the version you're on is shown
next to the name. When there's a newer one, **Update & restart** installs that exact
version, relaunches the app on the same address, and the open window reloads itself
onto it. Restart `symbiot app` yourself and the open window reconnects the same way.
**What's new** on that bar lists what the update brings (read from the new
version's `CHANGELOG.md` on npm), and after an update the app shows once what came
with it, until you click **Got it**.

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
  Windows). The Week tab shows it until you write a new one, and a week you
  write there with its button is saved to `weeks/` the same way. It runs while
  `symbiot app` is running. A week missed while the computer was off is written
  when the app next starts, once. **Write it now** checks that it works.
- **Start Symbiot in the background when I log in** adds an autostart entry
  (`~/.config/autostart/symbiot.desktop` on Linux, a LaunchAgent on macOS, the
  Startup folder on Windows) that starts `symbiot app` with no window, so the
  weekly write-up happens even on days you don't open it. Running `symbiot app`
  then opens that copy's window. Switch it off to remove the entry. It needs an
  installed Symbiot (`npm install -g symbiot`), not `npx`.

For a script or tray of your own: `isAppRunningWeekly()` (from
`symbiot/index.mjs`) says whether a running `symbiot app` already writes the
week, with no port or token to know; and `runWeekly(produce, { notify: false })`
(from `symbiot/desktop.mjs`) writes and saves the week in the same `weeks/`
format without the notification, for a caller that tells you itself.

### On your phone (Android, in Termux)

Experimental, and tried on one phone so far (a Galaxy A26, Android 16), where it
found the projects in Termux's home and in a Debian `proot-distro`. Symbiot is a Node CLI, so it runs
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
- Claude Code's history is read from Termux's home and from those Linuxes'
  homes, so projects your agent worked on inside `proot-distro login debian` get
  their "agent" badge on the Map, as they do on a computer.
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
  `symbiot/<task>`, commits everything except `.symbiot/`, pushes, and opens a PR
  with the GitHub CLI (`gh`). The commit's subject (and the PR's title) is the
  first approved task, with how many more there are ("Watch GitHub too (+2
  more)"), and its message lists them all, so `git log` reads as a history. If
  you're already on a feature branch it commits and opens the PR from there,
  unless that branch's earlier PR was already squash-merged: then it starts a
  fresh `symbiot/` branch from the default one, so the new PR can merge. Each step that can't
  happen stops there and says why: no `origin` remote means a local commit only, and
  without `gh` it pushes and stops. Your commit is never lost. Then the tasks are
  archived with their commit and PR link. With no changes to commit the button
  reads **Approve → archive** and just archives them.
- **↩ (send back)** is for one that isn't right: it reopens the task and unticks it in
  `TASKS.md`, so the next **Send to repos** hands it to the agent again.
- **Auto-merge when CI passes** (a switch on the card, per repo, off by default)
  queues GitHub's own auto-merge on the PR Approve opens, so it merges once its
  required checks pass. It needs "Allow auto-merge" in the repo's GitHub
  settings; without it, the card says so.

When Approve bumps the version and the repo keeps a `CHANGELOG.md`, it writes the
release there too ("## 0.45.0 — 2026-10-06" and what was approved), in the same
commit. With an AI connected, it words each approved task as a short release note
("Added…", "Fixed…") from the task and its diff, since everyone who updates reads
these; the commit and PR keep the task's own words. With no AI, or no usable
answer within a minute, the changelog keeps the task's own words too.

Tasks waiting for review aren't re-sent to the agent, and while the repo's agent
is still running, Approve waits ("agent still working"), so half-done work isn't
committed.

**Tasks about tasks.** An agent can't edit your task list, so a task like
`Drop the "gosolr's own WhatsApp number" task` or ``Merge the two `WA_WABA_ID`
tasks into one`` is done once you approve it. The tasks it names then leave your
list, so a later **Send to repos** doesn't bring them back: a dropped one is
archived, and of merged ones the newest stays and the rest are archived. Symbiot
finds them by the quoted name before the word "task": tasks in that repo, from
before the approval, with all of its words ("'s" aside). If it names more than
four, it's too vague, and nothing is removed. In the archived view they're marked
**dropped** or **merged**, and one you restore stays.

**Releases.** The review card warns about merged work that isn't released yet,
measured the way the repo releases: from its last `v*` tag, or, for a repo whose
GitHub workflow runs `npm publish` on every push to its default branch, from the
version npm has. If `package.json`'s version is already released and the changes
don't touch it, a **Version** picker next to Approve bumps it in the same PR: a
patch by default, or a minor, or keep it. It updates `package.json` and the
lockfile's own version, and the PR says what happens next: it publishes when it
merges, or which tag to push once it does.

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

**Connectors.** The connectors you've linked to Claude (claude.ai's Google Drive,
Gmail, Notion…, and servers added with `claude mcp add`) are only usable by an
unattended run when `--allowedTools` names them, so a run asked to check your
Drive or mail used to be refused. Symbiot now adds each one's rule
(`mcp__claude_ai_Google_Drive` covers `mcp__claude_ai_Google_Drive__search_files`
and the rest of its tools) to a Claude command on every run. It reads them from
`~/.claude.json`, so linking one takes effect on the next run, and your saved
command stays as you typed it. A connector still waiting to be authorized at
claude.ai isn't added. Settings → Handoff lists them, and says so when your
command isn't Claude and its runs can't use them. Claude in Orca's tab asks you
before using one.

A site you link in Symbiot (Link your work: Gmail, Drive…) only signs Symbiot's own
browser in. It isn't a Claude connector, so runs get no tools for it until you
connect the same service in claude.ai → Settings → Connectors. That's why Drive,
linked in both, reached runs and Gmail, linked only in Symbiot, didn't. Settings →
Handoff says which of your linked sites aren't wired up, and each run's `TASKS.md`
says which connectors it has and which it doesn't, so it doesn't claim to have
checked your mail.

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
- 🤖 Agent: read both (recommended)
- 👤 You: migrate your config once, then the agent drops the old format

## Suggestions
- Add a --json flag to drift
- [repo: symbiot] Show the drift report in Standup
```

Up to five questions show on that agent's block in the **Agents** tab, each with
two options and room for your own answer, alongside its ideas, two at a time.
Two, because most people pick the recommended option or add every idea without
weighing them, so the agent is told to be the judge. Both options have to be good
routes, each saying in plain words what it changes for the project, the people on
it and the company. The recommended one has to be the best for, in that order,
the company, the people doing the work and the goal, based on evidence the agent
checked (git history, tests, logs). An idea that's in your Tasks leaves the list,
and the next one moves up. **Suggest next steps** on the Map follows the same rule
and suggests two. Each option says
who acts: **You** (a setting, a click, a command) or **Agent** (picking it is
enough). A question that needs a release ("Once 0.41.0 is installed: …") shows
the version installed here and the one on npm, and holds back a "Done" answer
until that release is out and installed. **Send answers &
continue** appends your answers to `.symbiot/ANSWERS.md` and runs your agent
command again so the agent carries on with them. **Save only** keeps them for the
next run. **+ task** adds an idea to your Tasks for that repo, or, for an idea
that starts with `[repo: <name>]`, to that repo's Tasks: an agent working on one
project can have ideas for another (Symbiot itself, say). The agent is told to
keep going with everything that doesn't depend on an answer, and to ask instead of
doing anything destructive. Both files live in `.symbiot/`, so they're never
committed. The questions stay on the Agents tab after Symbiot restarts (or when
`symbiot push --open` started the run): Symbiot notes each folder a run starts in
(`~/.config/symbiot/runs.json`) and lists the ones still waiting on you.

**A 👤 You answer is your step.** Picking an option that starts with **You** saves
the answer and reminds you the step is still yours to do. Your agent waits for it
instead of starting straight away and asking the same thing again. If the step
names a file in backticks (`` `.env` ``), the agent starts by itself once that
file changes, while the app runs. A step in Settings (**Allow command**, a
connector) changes the agent command rather than a file, so a changed agent
command counts as the step being done too. Otherwise **Start it now** on that
folder's block starts it once you've done the step. An answer in your own words
that says to wait ("don't start another run until it's in", "hold off until I've
added it", "not yet") is your step too: it waits on the file the question's 👤
option named. A send in the meantime, or another lane's result coming back,
doesn't start a run past it; the run starts by itself once the file changes.

**A run that stopped on questions isn't repeated for nothing.** When a run ends
having asked questions you haven't answered, with tasks still unticked, Symbiot
keeps what it ran with in `.symbiot/blocked.json`. The next send to that repo
starts no agent until something it could act on changes: `.env` (or another
`.env.*` file there), `ANSWERS.md`, the agent command (a command you allowed, a
connector), or a task it didn't have. Otherwise the run would only ask the same
questions again. The send says so, with **Start it anyway** for when what changed
is somewhere else (`symbiot push --open --force` from the terminal). **Draft a
reply** always starts its run.

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

## The liquid: a home that shapes itself to you

`symbiot app` opens on one surface of liquid. Pick its look at the top, next to the
name: **Ferrofluid** (glossy black liquid metal, lit like a studio; the default),
**Glass** (clear droplets that bend the colours behind them) or **Pearl** (silver
lit like a product photo). Every panel follows the look, and the typeface (Geist)
ships with Symbiot, so it looks the same offline.

Its droplets are what only you can do (an Approve waiting, an agent's question to
you), what's new on what you watch, and the parts of the app, grouped the
**P.A.R.A.** way, each group in its own part of the screen with its name over it:

- **Projects** (work with an end): Tasks, Agents, Todo and what's asking you. They
  move the most; Agents has spheres orbiting it while an agent works. Click the
  **Projects** name for your projects themselves: a sphere per repo with work on it,
  saying what's going on there, amber when its work waits for your OK; click one for
  just its tasks.
- **Areas** (what you keep up with): the Dashboard, your feeds, Week and Standup.
- **Resources** (to look things up in): Map, Drift and Settings.
- **Archive** (what's done): your archived tasks. It sits still, low on the right.

**Click a droplet** and its part opens over the liquid; click a group's name to open
that group. **Right-click** (or your mouse's back button) goes back one step at a
time; **Close** or Esc closes a part. In a text box, or over text you've selected,
right-click still gives the usual menu. Whatever needs you glows **amber**, here and
on the Dashboard. Talk to it in the bar at the bottom: "open tasks" opens Tasks,
"go" in the work view starts what's waiting, anything else goes to the same Symbiot
as every chat. Leave it alone and it rests as one orb. There are no settings for any
of this: it adapts to you.

- **Where things sit: nearest neighbours.** Inside a group, the parts you move
  between most sit together (k-nearest neighbours on the same Markov chain as
  below, counting only links stronger than chance), so the layout has clusters and
  gaps instead of a ring. Each droplet keeps a steady offset of its own, so it
  reads as grown, not ruled, and stays where it was from one visit to the next.
- **How you work** (`adapt.mjs`). Use decays with a 3-day half-life; what you open
  next comes from a Markov chain (with a Dirichlet prior, so a few moves can't
  swing it) and your hour of day. The more predictable you are (low Shannon
  entropy), the more it adapts. Sizes follow Fitts's law under a fixed amount of
  liquid (area ∝ how likely you are to open it); only the few that matter show
  (Hick–Hyman), the rest under **more**. It rearranges only when it wakes from
  rest and the gain is worth it (hysteresis), and nothing changes its angle, so
  things stay where your hand expects them. Talking more than clicking grows the
  talk bar; a touch screen gets finger-sized targets.
- **How you talk.** What you type into Symbiot's chats becomes a style profile
  (length, casing, punctuation, emoji, requests vs questions, Afrikaans), and
  every chat and agent brief is told to match it, without copying typos.
- **Your colours,** from your system, live: light or dark, high contrast, reduced
  transparency, forced colours, reduced motion, your accent colour, and dimmer
  at night.

Everything it learns stays on this computer: `adapt.json` and `mind.json` in
Symbiot's config folder, readable by you only.

## Link your work

**Connections** (on the Dashboard, and in Settings) has one entry per standard work site: Gmail,
Outlook, Google and Outlook Calendar, GitHub, GitLab, Slack, Microsoft Teams,
WhatsApp, Jira & Confluence, Linear, Asana, Trello, Google Drive, Notion,
HubSpot and Salesforce. One click:

1. opens the site in Symbiot's own browser, where you sign in the usual way (its
   own login, SSO and 2FA; Symbiot never sees your password). Close the window
   when you're signed in;
2. trusts the site, so [Screens](#screens-blueprints-for-screen-automation)' Press
   and Type work there without asking;
3. watches its inbox or notifications, so what arrives shows on the **Dashboard**,
   in Standup's "Waiting on you", and in **Week**. Someone who doesn't write code
   gets a Week from their linked sites too.

They're grouped by kind (Mail, Calendar, Code, Chat, Work, Docs, Sales), each with
a bead that shows where it stands: hollow (not linked), amber (sign in, or signed
out), solid (linked). Point at one for **Link**, **↻** (check now) and **Unlink**. Unlinking stops
watching it and stops trusting what the link trusted, never a site you trusted
yourself.

**For a whole company**, one `links.json` in Symbiot's config folder (or the file
`SYMBIOT_LINKS` names) gives everyone the same buttons. It adds your own sites and
hides the ones you don't use. An entry with a built-in's id replaces it:

```json
{ "links": [{ "id": "jira", "name": "Jira", "url": "https://acme.atlassian.net/jira/your-work", "watch": true },
            { "name": "Acme CRM", "url": "https://crm.acme.example/inbox", "hosts": ["sso.acme.example"], "watch": true }],
  "hide": ["whatsapp", "trello"] }
```

Linking stays in the app. Like trusted sites, there's no command an agent could
call to link a site itself.

## One Symbiot, everywhere

The chat on each Dashboard card and the chat on each task aren't separate bots:
they're the same Symbiot, and it does what you ask instead of explaining what it
can't do.

- **It acts.** Ask it to do something ("look into this", "close that account",
  "chase Dana") and it hands it to your coding agent right away, with what the page
  showed. The agent has your tools and connectors (MCP, the command line, a
  browser signed in to your linked sites). Something for later becomes a task on
  your list. Anything hard to undo (closing an account, deleting, paying, sending)
  the agent asks you about first, in the Agents tab.
- **It looks at links.** Ask about the links on a card and it looks each one up the
  way a link preview does (not signed in, no scripts run, nothing downloaded):
  where it really goes, what the page is, and whether it's a file such as an .apk.
  Links into your own network are refused.
- **It remembers across pages.** What's worth knowing elsewhere (who someone is,
  which account is what, what you decided) is kept in a small local memory,
  `mind.json` in Symbiot's config folder, readable by you only. Each chat gets just
  the parts its question touches, plus the last few things said anywhere in the
  app, so context carries from page to page without re-sending everything.
  Settings → **What Symbiot remembers** lists it, and forgets any of it.

### Lanes: agents hand work to each other

Each agent has its own lane: a repo, or **ops** for everything outside one (this
computer, accounts, services, your connectors). When an agent needs something
that's another lane's job, it doesn't stop and it doesn't ask you to do it. It
writes it to its `.symbiot/HANDOFF.md`, under the lane's name, and Symbiot:

1. starts that lane's agent on it: a repo gets it as a task, the way **Send to
   repos** does, and ops gets a run of its own;
2. when that agent is done, puts what it did into the asking agent's
   `.symbiot/ANSWERS.md` and starts that agent again, so it carries on.

The Agents tab lists the **Handovers**: who handed what to whom, and where it
stands. A handover to a lane that doesn't exist, or back to the agent's own lane,
goes back to the agent, not to you. After 4 handovers in a row, the next one isn't
started, so two lanes can't pass the same job back and forth.

What still reaches you is only what no agent can do: your body (a phone in your
hand, a cable, which network you're on), your identity or secrets (signing in, a
2FA code, a token from a provider's console) or a decision that's yours (closing an
account, spending money, sending something in your name). Every brief tells the
agent so, and such a question says which: `👤 You (only you: your Meta token): …`.

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
  sends the subjects and recipient names of mail you sent. When you ask about a
  task (💬) the agent has finished, it sends the first 6 KB of the agent's diff,
  which can include a new file's contents. An Approve that bumps the version of
  a repo with a `CHANGELOG.md` sends the approved tasks and the first 30 KB of
  their diff, to word the release notes. Standup sends up to 10 of what's new
  on each page you [Watch](#screens-blueprints-for-screen-automation) since
  yesterday, and the brief (if you switch it on) sends each batch of it: for
  Gmail, that's the sender, subject and one-line preview. Otherwise it does
  **not** send source files, and it never sends a whole email body. With a **local Ollama model, nothing leaves your machine.**
- **Shows its work:** every report ends with a footer — path, branch, how many
  commits matched you (e.g. "1090 of 1101"), the README's age, and the
  working-tree state — so you can see exactly what it read.
- **Never:** no keylogging, no browsing history, no accounts. The
  [experimental](#screens-blueprints-for-screen-automation) Screens takes a
  screenshot only when you click Capture, and opens only the web pages you map
  or Watch (in a browser profile of its own). What it maps and what Watch finds
  stay on your computer, unless you pair your phone (Watch on your phone) or
  switch on the brief, which sends what's new to your AI.
- **Runs only what you set:** the agent command is yours, and deploy commands are
  read only from your own `~/.config/symbiot/`, never from a repo.

## Experimental

**Stable:** `week`, `standup`, `todo`; the app's Map, Drift, Tasks, Agents and
Settings; folders to scan (including project folders without git); `push` and
the agent handoff; agent questions; review, Approve, the version bump and
auto-merge; `drift` from local git facts; the weekly write-up and start at
login. The test suite covers each of them.

**Experimental:** the rest, below, and Symbiot on a phone ([Termux](#on-your-phone-android-in-termux)
and the [Android app](#the-android-app-apk)). These work and are tested, but are
newer, have only been tried on one or two setups, or depend on things Symbiot
can't fully check, so they may change. Everything above works without them.

- **Email** (`symbiot mail`): tested on mbox and Maildir, not yet on real Apple
  Mail, Evolution or KMail stores.
- **CI status** (`drift --ci`): GitHub Actions only, and "not running" is a guess.
- **Local models** (`models`, `setup-local`).
- **Screens**: Capture depends on your desktop allowing screenshots; Click here
  hasn't been confirmed on Wayland (ydotool) or on Windows yet; Map page, Press,
  Type and Trusted sites work on web pages only.
- **Watch**: reads your Gmail inbox, but hasn't yet been seen to notify a new
  email on a real one. GitHub through `gh` has been read from a real account,
  but not yet left running. The brief, Standup's "Waiting on you" line and
  **Watch on your phone** are new; the phone side hasn't been tried on a real
  phone yet.

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

This is mail you **sent**, for write-ups. To be told about **new mail in your
inbox**, map it in Screens and [Watch](#screens-blueprints-for-screen-automation) it.

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
fold or covered by something else is left out. A site is usually taller than
the window, so a map only has the part that fits: when there's more, the screen
says so and **Scroll down** (and **Scroll up**) scrolls the page in the hidden
browser and maps what's in the window then, as a new screen. It scrolls what your
mouse wheel would: the page, or the part of it that scrolls on its own (Gmail's
list of mail). Scrolling only looks, so it never asks first. Or **Whole page**
maps all of it at once: one tall screenshot (up to 16,000 pixels) with every
button, link and field on it marked where it is on the page. The hidden browser
scrolls down a window at a time and puts the screenshots together, so a menu bar
that stays at the top shows once, at the top, and a sticky side menu shows in the
first window only. Where a list scrolls inside the page instead, like Gmail's
mail, Whole page opens that list out: it scrolls the list a part at a time and
puts the parts together, with the rest of the window (the search bar, Compose,
your folders) around it once, so a whole inbox page is one screen with every row
marked. **Press** on a region clicks it
in that hidden browser and maps the page it leads to as a new screen, so map,
press, map is how an agent finds its way around a site. **Type** on a field types
your text into it there (replacing what was in it) and, with **Type, then Enter**
ticked, presses Enter, which is how a search or a one-line form is sent; the
result is mapped as a new screen too. The hidden browser stays open for five
minutes after each map, press or type, so a press or type on the screen it just
mapped carries on from that page as it is: type into a field without Enter, then
press the form's own button (**Send**, **Next**) on the new screen. On an older
screen, or once the browser has closed, it opens the page from its address again,
and anything typed there is gone. Press and
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
symbiot screens type <id> To "sam@example.com" --yes   # without --enter: the text stays in the field...
symbiot screens press <new id> Send --yes  # ...for a press on the screen that just printed
symbiot screens scroll <id>            # "more": "below"? scroll down and map the next part (or up, top, bottom)
symbiot screens whole <id>             # all of that page in one tall screen (or: symbiot screens map <site> --whole)
symbiot screens show <id>              # a saved screen's blueprint
symbiot screens signin gmail           # sign in once, in Symbiot's browser window
symbiot screens                        # list them
```

While the app is running, these commands use its hidden browser, so it stays
open between them as it does in the app. Without the app, each command opens the
browser and closes it when done.

**Watch a page for what's new.** On a mapped page (your Gmail inbox, GitHub's
notifications), **Watch** has Symbiot read it again every 15 minutes (or 5, 30,
60) while the app runs, in the same hidden browser, and compare what's listed
there with what it has seen. It only reads: no screenshot is saved and nothing
on the page is pressed or typed. The first read just learns what's there, so it
never announces your whole inbox. After that, anything new (a new email, a new
reply in a thread) gets a desktop notification and goes under **Watching** in
Screens, newest first, and on the page's card in the **Dashboard** tab. A chat
works the same way: map `web.whatsapp.com` once you've signed in, watch it, and new
messages (counted as WhatsApp messages in Standup) arrive with your mail and GitHub. A row is the same row whether its time reads `9:05 AM`,
`Oct 5` or `2 hours ago`, or you've read it since. On a page with no rows it
watches the links instead. If the site has signed you out, the watch says so,
and notifies you once. With
**Start at login** on (Settings), this keeps going on days you never open
Symbiot. What's new is saved in `~/.config/symbiot/watch.json` (yours only).
Your coding agent reads it too, so it can act on it with `symbiot screens`:

```bash
symbiot watch add <screen id> --every 15   # watch a mapped page (or: symbiot watch add gmail)
symbiot watch add github                   # your GitHub notifications (see below)
symbiot watch new --hours 24               # what's new, newest first (JSON)
symbiot watch board                        # the Dashboard's cards (JSON; .total is the count, for a status bar)
symbiot watch board --line                 # the same as one line: "2 emails · 1 WhatsApp message" (empty when nothing's new)
symbiot watch seen <watch id>              # set a card back to 0, like its Seen button
symbiot watch chat <watch id> "what needs me?"  # talk a card over with your AI, like its Talk (--clear starts over)
symbiot watch check                        # read them all now (JSON)
symbiot watch draft <id>                   # Draft a reply to a new email or chat message (see below)
symbiot watch brief on                     # your AI says what needs you (off to stop)
symbiot watch                              # what you watch, and what's new
symbiot watch remove <id>
```

**GitHub too.** **Watch GitHub** (under Watching) or `symbiot watch add github`
watches your GitHub notifications: review requests, failed CI runs, mentions,
assignments. With the GitHub CLI signed in (`gh auth login`), Symbiot reads them
through it (GitHub's API, your unread notifications), so nothing needs mapping or
signing in. Without `gh`, it reads `github.com/notifications` in the hidden browser
like any page (click **Sign in** with `github.com` once). Each notification is new
when its thread changes, so a CI run that fails again on the same branch, or a new
comment on a pull request, notifies you again. Failed CI runs reach you only if
GitHub notifies you about them (GitHub → Settings → Notifications → Actions).

**The brief.** Tick **Brief me** under Watching (or `symbiot watch brief on`) and
the AI you connected reads each batch of what's new and says, in a line or three,
what needs you and what can wait. The brief shows above what's new, and it's the
text of the notification. The AI is sent what the page lists for each new item
(for Gmail, the sender, subject and the one-line preview), and nothing at all
leaves your computer with a local Ollama model. It's off until you tick it.

**WhatsApp: only unread messages need you.** A chat list's preview doesn't say who
wrote the last message (WhatsApp writes "You:" only in groups), and a chat moves to
the top for what you send too. So Symbiot reads each chat's unread badge and the
ticks on what you sent: a chat with unread messages is from them; ticks, "You:" or
"(You)" mean it's yours; anything else is unknown, never assumed to be theirs. Only
chats with unread messages from them count on the Dashboard and in Standup, get a
notification and a brief, and the brief and the card's chat are told who each one
is from.

**Draft a reply.** A new email under Watching has **Draft a reply**. It hands the
email to your coding agent (the command in Settings → Handoff), which opens it in
your inbox through Screens, reads it, writes a reply and leaves it in Drafts, for
you to read and send. It never sends: its brief says so, and Symbiot refuses that
run a press on Send (or Schedule send), even with `--yes`. It needs an agent that
runs by itself (Claude Code, Codex, Gemini or Aider, not an editor or Orca's tab),
the app running (its hidden browser stays open between the agent's steps), and
your mail's site (`mail.google.com`) under Trusted sites. Each email gets a folder
of its own in `~/.config/symbiot/drafts` (yours only) with the agent's brief, and
the run shows in the Agents tab like any other: what it asks (a date only you
know, say) is answered there. The agent sees the email's text, so it reaches
whatever AI your agent uses. From a terminal, `symbiot watch new` marks the
emails `"mail": true`, and `symbiot watch draft <id>` does the same as the button.

A new WhatsApp message (a watched `web.whatsapp.com`) has **Draft a reply** too.
There, the agent opens the chat in the hidden browser and types the reply into
its message box, and leaves it there unsent. WhatsApp keeps it as that chat's
draft in Symbiot's browser: once the agent is done, **Open in WhatsApp** on the
message opens that browser at `web.whatsapp.com` as a window, to read the reply
and send it (close the window after, so Watch can read WhatsApp again). The same guard holds, plus one for chats: a
draft's run can't press Enter (in a chat, Enter sends), and in WhatsApp its line
breaks are typed as spaces. Add `web.whatsapp.com` under Trusted sites for it.
`symbiot watch new` marks those `"chat": true`.

**In Standup.** Standup ends with what's waiting on you since yesterday, counted
from what Watch found: `Waiting on you: 3 emails, 2 GitHub notifications`. Symbiot
counts them itself, so the numbers are right; the AI only sees them to know
what's next.

**On your phone.** What Watch finds on your computer can show up as a
notification on your phone, through Symbiot there (the [Android app](#the-android-app-apk),
or Symbiot in [Termux](#on-your-phone-android-in-termux)). On the computer, tick
**Watch on your phone** in Settings: it shows the computer's address and a 6-digit
code, good for 10 minutes. On the phone, in Settings → **Watch on your phone**,
type both and click **Pair**. From then on, while Symbiot runs on both, the phone
asks the computer every 2 minutes and notifies what's new there, with its brief.
They have to be on the same network (or both on a VPN such as Tailscale, whose
address is listed too). For this, the computer listens on port 7392 of your
network, and serves only two things there: pairing with that code (5 wrong tries
and the code is gone), and what's new for a phone that paired (with a token of its
own; unpair it in Settings). Nothing can be changed from there, and the rest of
Symbiot stays on `127.0.0.1`. What's new crosses your network unencrypted, so
switch it on at home, not on a café's Wi-Fi. A firewall on the computer may need
to allow the port. In Termux, notifications need the Termux:API app and
`pkg install termux-api`.

In Termux you can pair from the command line too, without the app window:

```bash
symbiot phone pair 192.168.1.21:7392 123456   # the computer's address and the code it shows
symbiot phone                                 # the computer it's paired with
symbiot phone check                           # ask it what's new now
symbiot phone forget                          # stop asking it
```

On the computer, `symbiot phone` lists where it listens and the phones paired, and
`symbiot phone code` opens a new code (while `symbiot app` runs there). The phone
asks the computer while `symbiot app` runs in Termux, so start it after pairing.

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
