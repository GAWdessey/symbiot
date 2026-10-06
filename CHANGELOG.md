# Changelog

What each Symbiot release brought, newest first. When Approve bumps the version, it writes that release here from the tasks it approved, worded as release notes by your connected AI (or in the tasks' own words without one). The app shows the releases newer than yours under "What's new" when it offers an update, and once more after you update.

## 0.45.0 — 2026-10-06

- **The liquid.** Symbiot's home is now one surface of liquid silver that shapes itself to you, with no settings. Its droplets are what only you can do, what's new on what you watch, and the parts of the app, which pool open over it. Talk to it in the bar at the bottom; leave it alone and it rests as one orb.
- It learns how you work: what you open, in what order and at what time of day decides each part's size and distance (Fitts's law, Hick's law, entropy), and it only rearranges when it wakes from rest, so nothing moves under your hand.
- It matches how you talk: every chat and agent brief is told your style (short or long, casual, requests or questions, Afrikaans words kept as they are).
- It follows your system's colours, live: light or dark, high contrast, reduced transparency, forced colours, reduced motion, your accent colour, dimmer at night.
- WhatsApp lines that don't name their sender are no longer read as coming from the other person.
- Linked mail connectors reach agent runs (or you're told they aren't wired up), runs don't start again until the file a "👤 You" step names has changed, near-duplicate tasks are merged, and this changelog shows what's new when you update.

## 0.44.1 — 2026-10-06

- Add a **Skip** button to each idea in the Agents tab, so you can turn down an idea you don't want and the next one moves up, without having to open the rest with "more ideas"
- Tasks whose work was approved as "changes without a task" come back on the next send: all seven in this round were already done in #93, with nothing ticked, so this run only checked and ticked them.

## 0.44.0 — 2026-10-06

- Version bump only.

## 0.43.1 — 2026-10-06

- Changed agents' questions to two options at a time, each saying what it changes for the project and the company, with the recommended one judged on evidence first.
- `symbiot watch chat <id> "question"`: a Dashboard card's chat from a terminal, so an agent can go over what's new with you too
- A 👤 step done in Settings (Allow command, a connector) changes the agent command, not a file in the repo, so the run waiting on it needs **Start it now**.
- Don't start an agent run when the files that the open "👤 You:" answers point to (here `.env`) haven't changed since the last run.
- Added a 💬 chat on each Dashboard card, to agree a reply with the agent before it drafts one.
- Show a repo's open questions in the Agents tab after the app restarts.
- `symbiot watch board --line`: one line like "2 emails · 1 WhatsApp message", for a status bar with no `jq`
- An "Open in WhatsApp" button on a WhatsApp reply that's been drafted.
- Whole page for Gmail too: scroll the list of mail inside the page and put the pieces together, so a whole inbox is one screen
- When an answer picks a "👤 You:" option, remind the user that the step is still theirs to do, and don't start the next run until the file it names has changed.

## 0.43.0 — 2026-10-06

- TASKS.md lists two items twice in slightly different words: the webhook tunnel restart (Aug 03 and Aug 04) and setting `WA_WABA_ID` (templates and Flows).
- Connectors linked in Symbiot (mail, Drive) don't reach agent runs, because `--allowedTools` lists only `Bash(...)` entries.

## 0.42.0 — 2026-10-06

- Changes approved without a task, in README.md, agents.mjs, headless.mjs, index.mjs, links.mjs, screens.mjs and 8 more.

## 0.41.7 — 2026-10-06

- Changes approved without a task, in core.mjs.

## 0.41.6 — 2026-10-05

- Don't start an agent run when `.env` and ANSWERS.md haven't changed since the last run that blocked on them.
- Connectors a user links in Symbiot (mail, Drive) never reach agent runs, because `--allowedTools` lists only `Bash(...)` entries.
- Tasks that were approved as merged or dropped (the duplicate `WA_WABA_ID` task, gosolr's own number) reappear when TASKS.md is regenerated.
- Add `mcp__claude_ai_Google_Drive__search_files` (and a mail connector, if there is one) to `--allowedTools` when a task asks the agent to check your messages.

## 0.41.5 — 2026-10-05

- Map the whole page at once: one tall screenshot with every button, link and field on it, for a page that scrolls as a whole (not for Gmail, whose list scrolls inside the page)
- Make `symbiot app`'s Week tab button save to `weeks/` too, like the tray's "Write my week now" now does, so the two apps behave the same.
- `symbiot watch board`: the Dashboard's cards as JSON from a terminal, for an agent or a status bar
- Open the Dashboard first, instead of the Map, once you watch at least one page
- A "Seen" button on each Dashboard card that sets its count back to 0 without clearing what the other cards found
- Draft a reply on WhatsApp too: the agent types the reply into the chat's message box in Symbiot's hidden browser and leaves it unsent, the same Send guard as mail

## 0.41.4 — 2026-10-05

- Added Scroll down to Map page, so the part of a site below the window gets mapped too.

## 0.41.3 — 2026-10-05

- Added the Dashboard: one card each for your mail, WhatsApp and GitHub, with what's new on them.
- `symbiot watch draft <id>`: Draft a reply from a terminal too, for an email `symbiot watch new` lists, the same as the button
- Export a tiny `isAppRunningWeekly()` helper from the CLI, so the tray doesn't have to know about `/api/desktop` and the app token.
- Let `runWeekly()` in `desktop.mjs` skip its own notification (e.g. `runWeekly(produce, { notify: false })`), so symbiot-desktop can call it instead of copying the `weeks/` file format.
- Lint the page's own JavaScript too: `npm run lint` covers the modules, but the browser code inside ui.mjs is a string, so a name lost there is only caught when the smoke test happens to run that button
- An agent's suggestion is still cut at 300 characters (`parseQuestions` in agents.mjs), though a task now holds 1000, so a long idea added in one click arrives cut off.

## 0.41.2 — 2026-10-05

- `symbiot phone pair <address> <code>` for Termux, to pair from the command line without the app window
- Lint in CI: an ESLint `no-undef` / `no-unused-vars` pass over the modules would catch a name lost in a move like the module split
- Drafts, the second half of the assistant you asked for: a "Draft a reply" button on a new email under Watching that hands it to your coding agent, which opens it in Gmail through Screens, writes a reply and leaves it…

## 0.41.1 — 2026-10-05

- Lint in CI: an ESLint `no-undef` / `no-unused-vars` pass over the modules would catch a name lost in a move like this split (I ran one by hand here, outside the repo)
- Catch near-duplicate tasks, not just exact ones: #70, #72 and #81 each list the same task twice in slightly different words (a colon for a bracket, one clause more)

## 0.41.0 — 2026-10-05

- Let Watch notifications reach your phone when the computer finds something, through the Symbiot app on the phone
- Put what's new from Watch into Standup: "3 emails waiting on you", next to your commits
- Watch GitHub too: map github.com/notifications and click Watch, so new review requests and failed CI runs reach you the same way
- ## Next steps 1. **Add the `v*` tag-protection rule from #71.** #77 and #78 made publishing hands-off, so an unprotected tag namespace is now the weak point.
- Reconcile the README and CONTRIBUTING with what actually ships: Android, Watch, email, auto-merge, agent Q&A and tag protection.
- Continue the ui.mjs split (#50) by pulling the server routes and the scan code out of index.mjs into their own modules, so each piece can be tested on its own.
- Review the batches of 'symbiot: N approved tasks' and 'changes approved without a task' commits (#64–#83) for half-finished or overlapping features (email tracking, Watch, Screens, proot history).
- Add tests for the core paths that auto-publish on every merge now exercises: git scan and repo-set selection, the week/standup/todo prompts with a stubbed AI, and the tasks.json/TASKS.md round-trip with auto-archive.
- Let a suggestion name its target repo, so Symbiot app ideas from a coral run go to the symbiot project's tasks, not coral's

## 0.40.5 — 2026-10-05

- Fix Symbiot's `grantAgent()` (symbiot repo) so a rule already in `Bash(…)` form is kept as is and only bare commands get wrapped, so `Bash(npm install:*)` can't become `Bash(Bashnpm install:*:*)`
- Tag Symbiot's question options with 👤 You / 🤖 Agent so it's always clear who acts

## 0.40.4 — 2026-10-05

- Added Watch: Symbiot checks the pages you've mapped, like your inbox, and notifies you of what's new.

## 0.40.3 — 2026-10-05

- Read Claude Code's history inside proot distros too (`debian/root/.claude/projects`), so projects your agent worked on in Debian get their "agent" badge on the Map, as they do on a computer

## 0.40.2 — 2026-10-05

- Don't offer a "Done" answer for a step that needs a release that hasn't published yet.
- Approve shouldn't add to a PR that can't merge any more.
- Keep the hidden browser open between actions for a few minutes, so an agent can type into a field and then press a separate button on the same page.
- Add Gmail under Settings → Trusted sites as `mail.google.com` (or `google.com` for all of Google): "gmail" opens gmail.com, which sends you on to mail.google.com, so trusting `gmail.com` alone wouldn't cover your inbox
- Map page on gmail: click Sign in, sign in to Google once in the window that opens, close it, then Map page again to see your inbox mapped

## 0.40.1 — 2026-10-05

- Fixed an update opening a second copy of the app: it now restarts the one that's open.
- Release 0.39.0 after merging: on `main`, run `git pull && git tag v0.39.0 && git push origin --tags`.
- Tag releases automatically: a GitHub workflow that, when a merge to `main` changes `package.json`'s version, tags `v<version>` and publishes, so the manual tag step goes away.
- Split your three existing whole-desktop screenshots: open each in Screens and click "Split by display" (the one with the "Meta" region moves it onto eDP-1), then delete the whole ones.
- Added Map page: Symbiot opens a site in a hidden browser, takes its screenshot and marks its buttons, links and fields, with no clicking by hand.
- Save screenshots privately: split pieces, "each display" captures and loaded images are written readable by every user on the computer (0664), while the desktop's screenshot tool saves its own images private (0600).
- Added the Android app (APK), with Symbiot inside.
- Fixed the Android app so it installs and starts on a real phone.
- Attach the APK to each GitHub release from the publish workflow, so a phone can download the current one instead of copying it from this PC
- Try the Android app on your phone: copy `android/build/symbiot-0.39.1-aarch64.apk` (built from these changes) to it, install it, allow All files access, and note anything that doesn't work
- Fixed the Android app not finding your files and projects: it asks for All files access and reads your phone's storage.
- Try Symbiot in Termux on your phone (`pkg install nodejs git gh`, `npm install -g symbiot`, `symbiot app`) and note anything that doesn't work there
- Once the split screens look right in Screens, delete the backup of the three whole screenshots: `rm -r ~/.config/symbiot/screens-whole-backup`
- Pick a version bump when you approve this batch: it carries the phone fixes, and GitHub now has the signing key, so it would also be the first release with the APK attached.
- Pick a version bump when you approve this batch, so the phone fix reaches npm (and the first APK release).
- Keep the hidden browser open between actions for a few minutes, so an agent can type into a field and then press a separate button on the same page (today each press or type starts from the page's address again, so…

## 0.39.1 — 2026-10-02

- Changes approved without a task, in .github/workflows/publish.yml.

## 0.39.0 — 2026-10-02

- Added a capture for each display on its own, and Split by display for a screenshot of the whole desktop.
- Release 0.38.0 after merging: on `main`, run `git pull && git tag v0.38.0 && git push origin --tags`.
- Auto-bump the version on Approve: this batch shows a warning on the review card when `main` is past the last `v*` tag (and says which tag to push if the changes bump `package.json`).

## 0.38.0 — 2026-10-02

- Couldn't take a screenshot (tried cosmic-screenshot, grim).
- Bump the version in every approved PR that changes the app (or warn on Approve when `main` is ahead of the last `v*` tag), so merged features don't sit unreleased like these did.
- Screens, next slice: "Click here" on Windows (PowerShell `SetCursorPos` + `mouse_event`), so clicking works on all three platforms.
- Adding the same task twice makes a duplicate (this brief had both tasks listed twice).

## 0.37.0 — 2026-10-02

- Version bump only.

## 0.36.1 — 2026-10-02

- fix: QUESTIONS.md preamble list showed up as fake questions

## 0.36.0 — 2026-10-02

- agents: grant a blocked agent a tool/folder from Settings (no command surgery)

## 0.35.0 — 2026-10-02

- Let Approve ship uncommitted changes that have no ticked task behind them (for example "Approve changes without a task"), so work like the 0.34.0 preset change can't get stuck again.
- Give the Codex, Gemini and Aider presets the same "can run the tests" treatment.
- Give the "Orca IDE: run Claude in a tab" preset the same `--allowedTools` rules, so runs started that way can test their own work too.
- Run `npm test` before approving this batch.
- Move the README's Development, Releasing and Config sections into CONTRIBUTING.md to shorten the README further.
- Run `npm test` before approving this batch. test/app.mjs, the smoke and fixture additions, and the grouped preset chips in Settings were all written without being run.
- Make the Claude Code handoff preset allow running the repo's tests (`--allowedTools "Bash(npm test:*)"`), so unattended runs can check their own work instead of leaving it unrun.
- Run `npm test` locally before approving this batch.
- Consider splitting the large single-file app or embedded UI into a few modules, so changes stop breaking unrelated views.
- Don't start a handoff in a folder where an agent is already running (two identical runs started on this repo, 6 seconds apart, in an earlier round)
- Disable the Send to repos button until its handoffs have started, so a double click can't send twice
- Don't rewrite a repo's TASKS.md while an agent is still running there; hold the new tasks until it finishes, so a run doesn't see its task list change under it

## 0.34.0 — 2026-10-02

- Audit the command and feature surface (handoff presets, mail, folders, drift --ci) and either cut or clearly mark as experimental anything you don't use weekly.
- Stop the 'sync main to published X' commits by tagging releases from main only, so main and npm cannot diverge.
- Added ideas and options from every agent, not only Claude: they show in the Agents tab, ready to add as tasks.
- Added Email (experimental): Week and Standup can include the mail you sent, read from your desktop mail app's files, with no API or password.
- Add a few fixture-based tests for the risky stateful flows: review→approve→ship (including the .symbiot gitignore case), single-instance reuse, and mail ingestion.
- Add smoke tests that catch the regressions you have already hit: the installed bin actually executes, embedded app JS parses, every app endpoint answers with the right method, and the update check does not loop.

## 0.33.0 — 2026-10-02

- Agent questions/ideas: the handoff brief tells any agent to write decisions it needs + ideas to .symbiot/QUESTIONS.md; the Agents tab shows up to 5 questions with options + answer boxes and a '+ task' per idea.
- Email without an API (mail.mjs): reads a desktop mail app's Sent folder (Thunderbird/Apple Mail/Evolution/KMail/Maildir) or an exported .mbox — HEADERS ONLY (date/to/subject), Sent only, OFF by default (Settings →…
- Correctly did NOT do the ui/ split (couldn't verify without running tests).

## 0.32.0 — 2026-10-01

- Version bump only.

## 0.31.0 — 2026-10-01

- Changes approved without a task, in README.md, index.mjs, test/smoke.mjs, ui.mjs.

## 0.30.0 — 2026-10-01

- Changes approved without a task, in index.mjs, ui.mjs.

## 0.29.0 — 2026-10-01

- folders: Overview & suggestions

## 0.28.4 — 2026-10-01

- fix: add-task needs a repo + visibility

## 0.28.3 — 2026-10-01

- fix: Approve/ship 'git add failed: .symbiot ignored'

## 0.28.2 — 2026-10-01

- fix: in-app update loop

## 0.28.1 — 2026-10-01

- refactor: split app UI into ui.mjs

## 0.28.0 — 2026-10-01

- Changes approved without a task, in .github/workflows/publish.yml, test/fixtures.mjs.

## 0.27.2 — 2026-10-01

- Version bump only.

## 0.27.1 — 2026-10-01

- fix: Map AI review summary disappeared

## 0.27.0 — 2026-10-01

- Review loop: pendingReview/approveRepo/sendBack/shipChanges — after an agent runs, its ticked tasks land in a Review list showing the working diff; Approve branches+commits+pushes+opens a PR (gh), Send back reopens the…
- agentChanges(): the Agents tab shows 'What it did · N files · +x/-y' + commits, excluding .symbiot/.
- semverGt(): update bar only shows when npm is strictly newer (fixes a false 'update' when a local build runs ahead of npm).
- New test/install.mjs (bin-symlink + npm-pack install); fixtures+smoke expanded. gitignore .symbiot/ scratch.

## 0.26.0 — 2026-10-01

- orca handoff: wait for graph-ready before terminal create

## 0.25.0 — 2026-10-01

- No version anywhere in the UI. Added a version badge next to the brand (fed by /api/ping's version field).
- The server cached npm's 'latest' at startup and only re-checked every 10 min, so a version published after launch stayed invisible until then.

## 0.24.0 — 2026-10-01

- Both Orca presets now lead with '<orca> open; ' (full orca-ide path, never bare 'orca' — that's @blade-ai/orca, a different tool on PATH).
- migrateOrcaCmd(): a command saved BEFORE this (no open step) is patched in place on next use — inserts '<orca> open; ' before the first 'repo add', idempotent, non-orca commands untouched.

## 0.23.0 — 2026-10-01

- Stable URL: the app binds a fixed port (7391, SYMBIOT_PORT/appPort to override; random fallback if busy) and a persisted token, so the URL survives a restart.
- Heartbeat: the page polls /api/ping every 4s.
- /api/ping reports {version, started, latest}; a background check polls npm every 10min for the newest symbiot.
- Update bar: when a newer version is on npm, a banner offers 'Update & restart'.

## 0.22.0 — 2026-10-01

- hasCmd(): command -v on posix, 'where' on Windows.
- Orca IDE found across OSes: known Linux/mac/Windows paths + a bounded, cached find fallback (so a Mac picks it up).
- Orca preset no longer hardcodes Claude: adds 'Orca — open repo (use your Orca agent)' (generic, for GPT etc.) alongside 'run Claude in a tab'.
- macOS editors detected as .app bundles -> 'open -a "App" {dir}' when the CLI isn't on PATH.
- More agent CLIs: codex (OpenAI --full-auto), gemini, plus claude/aider/ cursor-agent.

## 0.21.0 — 2026-10-01

- week/standup/todo use the Map's repo set

## 0.20.0 — 2026-10-01

- map: non-git project folders

## 0.19.0 — 2026-10-01

- scan: configurable folders, inside or outside home

## 0.18.0 — 2026-10-01

- handoff: make-changes preset + wider repo scan

## 0.17.0 — 2026-10-01

- Filter the Tasks list by Type and Repo (clickable chips); Send to repos respects the active filter, so filtering IS selecting what to send.
- Auto-archive: a Sync (runs on Tasks-tab open) reads each repo's .symbiot/TASKS.md, marks done any task the AGENT checked off (- [x]), then archives every done task — completed work clears itself out.
- Clarify the left checkbox (= mark done/auto-archive, NOT send) with a note + tooltip, since it was mistaken for a send-selector.
- Ollama: a model that isn't pulled now returns a clear 'run setup-local --model X' message instead of a cryptic error.

## 0.16.0 — 2026-10-01

- one-command local-model setup, OS-aware

## 0.15.0 — 2026-10-01

- map: scan agents + AI into the initial picture

## 0.14.1 — 2026-10-01

- handoff: Orca IDE preset

## 0.14.0 — 2026-09-30

- agents: live activity view — watch the handoff work

## 0.13.0 — 2026-09-30

- handoff: generic settings-based agent command

## 0.12.0 — 2026-09-30

- Batch: tasks were a flat, mixed pile of near-identical items.
- Open in IDE: writing the file still left you to open it.

## 0.11.0 — 2026-09-30

- review: restraint verdict — gauge against over-engineering

## 0.10.3 — 2026-09-30

- app: suppress Chrome first-run ToS prompt

## 0.10.2 — 2026-09-30

- fix: Send to repos GET/POST mismatch + endpoint smoke test

## 0.10.1 — 2026-09-30

- push: fast + clear feedback

## 0.10.0 — 2026-09-30

- push tasks to the coding agent

## 0.9.4 — 2026-09-30

- fix: app UI dead since 0.6.4 — embedded JS syntax error

## 0.9.3 — 2026-09-30

- fix: installed CLI ran nothing (bin symlink guard)

## 0.9.2 — 2026-09-30

- drift --ci: quote GitHub's exact not-running reason

## 0.9.1 — 2026-09-30

- Off-default PR merges: for each, diff its head vs merge-base and check whether its ADDED files exist on the default branch.
- CI (--ci): deterministic not-running signal — conclusion=failure AND every job has 0 steps => 'CI is NOT running (billing/spending-limit), not failing tests'; otherwise a real failure.
- Staleness loud: show FETCH_HEAD age; tag behind/upstream lines '(as of Nd ago)' when >1 day.
- F7 fixture now asserts the never-landed signal.

## 0.9.0 — 2026-09-30

- drift report: what's out of sync/at risk across repos

## 0.8.1 — 2026-09-30

- test: accuracy regression fixtures

## 0.8.0 — 2026-09-30

- Identity: match ALL of your author identities (per-repo + global email, GitHub noreply login, matching name), fallback to everyone if <10% of an active repo matches.
- Stale checkout: detect when the working tree equals an ancestor of HEAD (or is mostly deletions) and report 'STALE, not new work' instead of 'N uncommitted' — and never advise committing it (would revert history).
- Worktrees: group by git-common-dir, review only the freshest checkout.
- README: send its last-changed date + commits-ago; tell the model recent commits beat the README.
- Repo shape: send a folder tree with counts + manifests + docs, not the first 60 filenames alphabetically.
- House rules: read CLAUDE.md/AGENTS.md/CONTRIBUTING.md + ~/.config/symbiot/ rules.md as 'conventions, do not advise against' (kills the .env advice).
- Footer on every report: version, path, branch, commits matched vs total, README age, working-tree state — show what was read.
- Privacy wording in README corrected to what's actually sent.

## 0.7.1 — 2026-09-30

- fix: map scan hang

## 0.7.0 — 2026-09-30

- hardware-based model recommendations

## 0.6.4 — 2026-09-30

- map: tick ideas into a persistent Tasks list

## 0.6.3 — 2026-09-30

- map: AI repo review under the graph

## 0.6.2 — 2026-09-30

- Drag a node to reposition it (pointerdown on node = move; on empty = pan).
- Bottom summary bar: hover shows a node's facts (repo path, branch, last commit, file count, languages, tools); click still opens the detail panel.
- Prove it's the user's machine: /api/map stats now include the scanned base path and total file count; each repo node carries branch, last-commit date, file count and full path.

## 0.6.1 — 2026-09-30

- map: fix node click

## 0.6.0 — 2026-09-30

- map: interactive graph + per-repo suggestions

## 0.5.0 — 2026-09-30

- app: Map view — local node graph of your work

## 0.4.1 — 2026-09-30

- app: cross-platform chrome-less window

## 0.4.0 — 2026-09-30

- symbiot app: visual UI in a chrome-less browser window

## 0.3.0 — 2026-09-30

- symbiot login is now a provider picker (1-4) or --provider <name>.
- Providers: anthropic (SDK), openai / gemini / ollama via fetch — no new deps.
- Per-provider default models; SYMBIOT_MODEL overrides any of them.
- Auto-detect env keys in order: ANTHROPIC_* -> OPENAI_API_KEY -> GEMINI/GOOGLE.
- Config gains { provider, <provider>: { apiKey, model } }; legacy { apiKey } still resolves as Claude (backward compatible).
- Each provider validated against its own endpoint at login; local Ollama needs no key and keeps all data on the machine. whoami shows provider + model.

## 0.2.0 — 2026-09-30

- symbiot login: paste a key once, validated against the API, saved to ~/.config/symbiot/config.json (0600).
- Auto-detect credentials: ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN env, saved login, or an 'ant auth login' profile. symbiot whoami shows which.
- Replace the dead 'ant auth login' hint with a real setup path.
- Default model -> claude-opus-5-5 (newer, cheaper); effort:low for this summary workload; SYMBIOT_MODEL documented with a cheaper option.

## 0.1.1 — 2026-09-30

- Version bump only.

## 0.1.0 — 2026-09-30

- symbiot — your week, written from your real work
