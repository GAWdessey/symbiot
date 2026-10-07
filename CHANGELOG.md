# Changelog

What each Symbiot release brought, newest first. When Approve bumps the version, it writes that release here from the tasks it approved, worded as release notes by your connected AI (or in the tasks' own words without one). The app shows the releases newer than yours under "What's new" when it offers an update, and once more after you update.

## 0.55.1

- **No more stray Symbiot windows.** 0.55.0's smoke test called Away like every other endpoint, so each full test run (yours, or an agent's in the symbiot repo) opened Away windows on your screen. Away now opens only when asked to by name, and never while windows are turned off (as in tests).
- **One Symbiot window, not a pile.** Opening Symbiot again (its icon, `symbiot app`) used to add a window each time. Now the newest window wins and older ones close themselves; a tab that can't close itself says Symbiot is open in a newer window, with **Use this one**. An update's restart that can't get its port bows out instead of lingering unseen.
- **Away is Super+`** (Super and the key above Tab). Super+S stacks windows on COSMIC, so it was the wrong key; `symbiot away --shortcut` sets up Super+` and clears the old one.

## 0.55.0

- **Away: Super+S.** Symbiot full screen while you're away from the desk: the orb at rest, the time, the agents at work and what each is doing, how many things only you can do, and how much waits on what you watch. Counts only, never anyone's words. Any key or click brings you back. On X11 with more than one screen the orb bounces across all of them; under Wayland (COSMIC, GNOME, KDE) it's one window on your screen, because no app may place windows there. `symbiot away --shortcut` sets up Super+S (on COSMIC it's done for you). Super+Esc still locks.
- **Approve no longer strands a commit.** It picked a branch name only by what's local, so a name already on GitHub (an earlier PR of that name, merged) had its push refused, and the approved work sat in a commit with no PR. Now it picks a name free on GitHub too, and if a push is still refused, it moves the commit to a fresh name and pushes that.

## 0.54.4 — 2026-10-07

- Removed the "Add a task" row from Tasks, since you add tasks through the bottom chat bar, and moved Send to repos beside Close.
- Fixed agent runs that wait on you, such as unsent drafts or steps only you can take, so they now appear on Home with what to check first.
- Moved the Reports Refresh button so it sits beside Close instead of under it.
- Added a Marketing section with post drafts, replies marked "maybe a customer", picture tools and the 4-week table, moved off the Dashboard.
- Reviewed where sandboxing for agent runs stands, with no changes to the app.
- Added marks on Connections showing which sites your agents can also use, visible before you link them.
- Changed the Dashboard to lead with what you watch; posts now appear under Marketing once drafting is possible.
- Fixed Home's right-side orbs overlapping zone names on screens 1366–1440 pixels wide.
- Added a "Pick your agent" step on first run that sets up the detected agent, such as Claude Code, in one click.

## 0.54.3 — 2026-10-07

- Added questions on Home for stuck or failed agent runs, so you can allow access, skip, or run them again right there.
- Added a ready picture to post drafts whose idea is a screen of an app you run locally; keep it or remove it.
- Changed post drafting to try once more by itself when every draft gets dropped for claiming things git doesn't show.
- Added a separate sandbox for trying Symbiot's first-run setup without touching your real settings, drafts or files.
- Fixed Orca losing track of a repo when a handover renames its folder; Symbiot now adds it again at the new location.
- Fixed reply tracking treating a signed-out inbox as watched; Home now asks you to sign in again so replies aren't missed.
- Added a "Where your files disagree" alert under Watching on Home when your files contradict each other on something important.

## 0.54.2

- **Lighter without a graphics card.** When the liquid is drawn by the CPU (no GPU, or a headless browser like the ones agents check Symbiot's screens in), it used 6 cores or more. Now it draws at a third of the resolution, without the breathing, and only when something actually moved, at most 20 times a second: about a third of the CPU. It does the same when your system asks for less motion. With a graphics card, Home also draws half as often at rest and a sixth as often behind an open panel, where it barely shows.

## 0.54.1

- **No more lag from a big agent log.** An agent's log keeps every run and everything it reads, screenshots included; one reached 144 MB, and Symbiot reread all of it on almost every refresh, so the app stalled for 5–28 seconds at a time and ate a core. Now it reads only the newest run, from the end of the file, and keeps it until the file changes. A log past 8 MB starts afresh at the next run, with the old one kept as `agent.log.old`.

## 0.54.0

- **Show Symbiot a screenshot.** Paste one into "Talk to Symbiot" (Ctrl+V) or drop it on the bar: it shows as a thumbnail you can remove, goes with what you say, and the AI you connected sees it (Claude, OpenAI, Gemini, or a local model that reads images). If Symbiot hands the work to an agent, the agent gets the screenshot too. Up to 4 at a time; they're kept a week, readable by you only.
- **A pass over every screen, in every look.**
  - Scrollbars match the look everywhere: thin, no arrows, no white track.
  - On the Dashboard, emails that land minutes apart fan out along their current instead of melting into one blob.
  - The **Go** button no longer peeks out under the top of an open panel.
  - A project's page no longer shows the same Approve twice ("Needs you here" and "Awaiting your review").
  - The Agents and Reports **Refresh** buttons are round icons, like the Dashboard's.
  - In Pearl, the main buttons lose the old chrome stripe for a soft pearl sheen.
  - In the light looks, the Tasks screen's status line is crisp instead of washed out.

## 0.53.4

- **Updates wait for npm instead of giving up.** npm lists a new version a little before its download is there, so an update straight after a release could fail and tell you to run `npm install` in a terminal. Now Symbiot tries again every 30 seconds (up to 5 times) and the bar says it's waiting on npm; there's nothing for you to do.

## 0.53.3

- **The window's top bar matches the look.** Symbiot now tells the browser its colour, so the bar the app window opens with is the look's own (warm grey in Pearl, near-black in Ferrofluid, cool grey in Glass) instead of your desktop's accent colour.
- **It opens maximised,** filling the screen but leaving your taskbar, rather than needing full screen.

## 0.53.2

- **Replies you're waiting on sit on the stream.** An email your agent is waiting on a reply to is a ring on your inbox's current, where it was sent, with a thread to now; it fills when the reply is in. Point at it for who, what was asked, and Stop waiting. The header says how many you're waiting on.
- **Drafts to post, as a shelf.** Your drafted posts sit side by side as cards: the start of each, where it goes, and Approve, Edit or Skip; Read it all opens the rest.
- **A project's tasks, calmer.** How tasks work folds away; each task shows two lines (click for all of it), without its repo's name inside its own page; the review card is a quiet card with a live dot while its agent works.
- **Fixed:** the top of the work view drew the heading, the old summary and the status line over each other; Go sat off the bottom of the window. Go now sits beside Home.

## 0.53.1

- **Named for Symbiot.** Agents working on their own is **Symbiosis** (Settings → Your agent); the guard that stops what only you do is **the membrane**; your answer going back into the same conversation is **one mind**; agents deciding what can be undone themselves is **instinct**. Same behaviour, each with what it does spelled out next to it.

## 0.53.0

- **Agents work on their own.** A Claude agent now just does the work: no permission prompts, no "You" for a folder or a command. Symbiot's guard, which Claude Code runs before every action, still stops the few things only you do: pushing to main, force-pushing, publishing, deleting outside its folder, sudo, piping a script from the internet into a shell, reading your keys, changing Symbiot's settings. A stopped agent is told why and asks. Settings → Your agent → **Agents work on their own** (on; off keeps allow lists).
- **One conversation that goes on.** When you answer an agent, the same conversation resumes, so it carries on knowing everything it knew, instead of a new agent rereading a brief.
- **Agents decide like a colleague.** They choose what can be undone themselves and say what they chose; they ask only about what can't be undone, costs money, goes out in your name or needs who you are, with their pick first.

## 0.52.1

- **Agents stop asking you for permission inside your work.** An agent reaches your knowledge folders from the start, and an ops agent your repos too. When it needs more and proposes a list that stays inside the folders you gave Symbiot, asks for nothing that could run anything, and doesn't publish or reach another machine, Symbiot turns it on by itself and the agent carries on: no question reaches you. Only a list that reaches outside your work (`~/.ssh`, `~/.config`, another machine) still asks, and it says why. Asks already waiting clear the same way.

## 0.52.0

- **Your agents, on the Tasks screen.** No need to open Agents: a line at the top says where everything stands ("1 question for you · 1 ready for your OK · 2 at work"), and a blob per project shows what its agent did or is doing, what it asks you (its answers as buttons, or your own words), Review and approve when its work is ready, and the extra tasks it suggests, each with **+ task** or **Skip**. The liquid moves left to make room.
- **Agents, organised.** Runs are grouped: what needs you first, then what's at work, then what's finished, folded away. Handovers show only what's under way; the finished ones fold into one line, and repeats show once (×2).

## 0.51.2 — 2026-10-07

- Replaced the Quit button with an X in the top corner, and Home warns about your AI, agent or connectors only when one is missing.
- Added a Park button so a blocked project stops starting agent runs, even when forced, until you unpark it.
- Changed the review card to say when a run is only partly done, with Answer its questions first and Approve the changes so far second.
- Added answer bubbles on Home linked to each asking project, showing its familiar name, the question and two answer buttons or your own words.
- Added a Home alert asking to see your inbox when a run awaits an emailed reply that nothing would notice.
- Added first steps at the top of Settings that tick themselves off and say whether agent runs can use your linked site.
- Added checks that flag where your company folder's files disagree on dates, leave, holidays or customer details, listed under Settings.
- Changed Home into tidy, fixed groups, with projects sortable by needs you, recent or name, and repeated handovers shown once.
- Moved Go to a small bottom-corner button, and opening a highlighted project now shows what needs you at the top.

## 0.51.1

- **Allowing an agent's list works when the list is fine.** An exact command such as `rm -r ~/dailify/site` no longer counts as dangerous; only Bash with no command, a shell, sudo, or a wildcard `rm`/`dd`/`chmod` does. Before, one such rule refused the whole list, silently, and the agent asked you again and again.
- **When a list is too wide, you're told why.** The note names the rules, the agent is asked for a narrower list, and it starts again, instead of waiting on a click that can't work.
- **An agent can never edit Symbiot's own settings.** Every list Symbiot turns on also blocks editing `config.json`, where what agents may do is kept.

## 0.51.0

What your agents built on the symbiot repo yesterday, merged with everything since:

- **`symbiot post`.** Drafts three posts a week from your real git activity, releases and CHANGELOG (shipped, learned or fixed, and a longer one) in your voice from `voice.md`. They wait on the Dashboard for Approve, Edit or Skip; nothing is published without your approval, and every choice is logged. It can draft replies to comments too, for you to approve.
- **Company knowledge folders.** Point Symbiot at a folder of documents (Settings → Knowledge folders) and every chat can quote them and say which file; worked examples are kept apart from facts.
- **Reports.** What agents write up (findings, audits, plans) shows in one place, unread ones marked.
- **Waiting on replies.** When an agent's email needs an answer, Symbiot watches your inbox for it and hands the reply on to the next step itself.
- **Facts from a run.** An agent can hand back what it learned; Remember or Skip it on the run's block.
- **A first-run sandbox**, to walk through Symbiot's setup like a new user, apart from your real data.
- **Fixed:** the same task listed twice in different words, or spelled out in steps; a task you closed coming back; long tasks cut mid-sentence; mail and WhatsApp chats you've already read still counting as waiting on you; agent runs denied the Gmail, Calendar, Drive and Notion tools right after you connected them.

## 0.50.3

- **Finer tags on the spheres.** A sphere's tag is the short form of its task: no "(§5 of .symbiot/BRIEF…)" asides, paths or markdown, cut at a word, in smaller type and two lines at most; point at it for the whole text. The layout makes room for every tag, so a tag never lands on another tag or sphere.
- **Go sits beside Home** at the top of the work view, clear of the chat.

## 0.50.2

- **An allow list is one click.** When an agent needs permissions it doesn't have, it proposes them, as narrow as the task needs, in `.symbiot/allowlist.proposed.json` and offers it as a choice. Pick it in the app and Symbiot turns it on for that folder only and runs the agent again: no copying files, no running claude in a terminal. A list that would let an agent run anything at all (a shell, sudo, rm) is never turned on by a click.
- **Fixed:** a flag could end up in the agent command as a rule (`Bash(--allowedtools:*)`). It can't any more, and an old one is cleaned out on the next grant.

## 0.50.1

- **A permission you pick is given.** When an agent asks for one ("let agents read ~/.config/symbiot/screens") and you choose it in the app, Symbiot grants it then and there (as Settings' grant boxes do) and the agent carries on, instead of leaving it as a step for you to do by hand. Steps only you can do, like pasting your own message, are still yours.
- **The chat on home rolls.** Newest at the bottom by the input; older lines fade as they rise and dissolve before they reach the droplets. Point at it or scroll back to read the whole conversation clearly.
- **No asterisks in names.** An agent's name on home no longer shows its markdown (`**What's needed:**`).

## 0.50.0

- **The Map, by nearest neighbours.** Your repos are droplets in the liquid, each beside the repos most like it: what they're built with, the weeks you work on them, and what they're about (from their READMEs). The closest merge into one shape, the next are joined by a thread of liquid; each cluster is named over its region; what you haven't touched in a while is smaller and sinks; "you are here" sits where your recent work is. Point at a repo to see its neighbours and why; click for its details, now with **Most like it** and your last 12 weeks. Zoom and fit buttons, and the languages and tools you build with underneath instead of a coloured legend. Screens folds away.
- **Every panel in the look.** Week, Standup and Todo are a page with a title and dates, the write-up set as a document. Tasks are calm rows with round check beads; Ask and Remove are icons. Agents' questions get a calm card with bead radio buttons. Drift has a status bead per repo, switches for its options, and its issues listed under each. Settings is a column of titled cards.
- **Icons, not emoji.** Chat, person, agent, idea, question, archive and plug are drawn line icons in the look's ink.
- **Close stays clean.** Content scrolls under the Close bar instead of colliding with it.

## 0.49.2

- **Projects shows your projects.** Click **Projects** on the liquid and each repo with work on it is a sphere: what's going on there under its name (an agent at work, ready for your OK, or how many tasks are waiting), spheres orbiting while an agent works, amber when its work waits for you. Click one to open just that project's tasks; right-click comes back.
- **The Dashboard, in detail.** A headline that says what's waiting, with when it was last read; a 24 hours / 3 days / 7 days switch instead of the old dropdown; a round refresh; **Close** instead of "Sink back". Feeds go by their short names ("Inbox", with your address under it). What you've already seen stays on the stream as small faint beads, so a quiet day isn't an empty line, and the stream lines up with "now" however wide the window is.
- **Connections.** The link chips are now a grid by kind of site, each with a bead: solid when linked, amber when it wants you to sign in, hollow when it isn't linked. Link, check and Unlink show when you point at one. It's on the Dashboard as well as in Settings.
- **Every panel's controls, in the look.** Dropdowns have a dark menu in Ferrofluid instead of the white one, buttons are solid in the look's ink (Pearl keeps its chrome), and the card list drops its emoji and green borders.
- **README** brought up to date: the looks, P.A.R.A., the stream, Connections, click to open and right-click to go back.

## 0.49.1

- **Click a sphere, it opens.** A sphere (or its name) opens its screen straight away.
- **Right-click goes back.** One step at a time: from a panel to the screen you opened it from, from the Tasks scene to home. Your mouse's back button does the same. In a text box, or over text you've selected, right-click still gives the usual menu.

## 0.49.0

- **Home by P.A.R.A.** The liquid groups everything Symbiot holds four ways: **Projects** (work with an end: Tasks, Agents, Todo, and what's asking you), **Areas** (what you keep up with: the Dashboard, your feeds, Week, Standup), **Resources** (to look things up in: Map, Drift, Settings) and the **Archive** (what's done). Each group has its own part of the screen and its name on the liquid; tap a name to open it. Projects move the most, the Archive is still, and Agents has spheres orbiting it while one works.
- **The Dashboard as a stream.** Time runs left to right, one current per feed, "now" on the right. Each message is a bead placed when it arrived, amber when it's waiting for your reply. Point at one to read it and Draft a reply or Open it; each feed's Seen, Talk and Check now sit under its name. The cards are still there under "All of it as a list".
- **Amber means it needs you, everywhere.** The liquid can tint a single droplet, so what's asking you glows amber at home and in the stream, in every look.

## 0.48.0

- **Three looks, one switch.** Ferrofluid (glossy black liquid metal, lit like a studio), Glass (clear droplets that bend the colours behind them) and Pearl (silver lit like a product photo). Switch at the top left, next to the name; Ferrofluid is first. Panels follow the look.
- **Geist, in the package.** The app's type is Geist, shipped with Symbiot, so it looks the same offline.
- **Names without pills.** Each droplet's name sits under it as plain type; tap the droplet or its name and it opens into a small card with Open.
- **A chat without boxes.** Symbiot's replies are plain text, yours sit in a soft capsule, and the steps fold into one line you can open. No more sideways scrolling.
- **Nearest neighbours.** Parts you go between sit together (k-nearest neighbours on how you move between them), so home grows into clusters with gaps between, not a ring. Before you've used it, the work (Tasks, Agents, Todo), your time (Week, Standup) and your repos (Dashboard, Map, Drift) start together. In the Tasks scene, waiting tasks gather round the agent working in their repo.

## 0.47.1

- **Sharp, not blurry.** The liquid renders at your screen's full pixel density (it was capped at 1.5x, so 2x screens were stretched). Sphere edges are crisp at any size, each sphere casts a tight shadow below it instead of a fuzzy halo round it, and tags sit on whole pixels with almost no frosting, so their text is sharp.

## 0.47.0

- **Tasks and agents in the liquid.** Opening Tasks or Agents re-forms the liquid: each agent at work is a sphere with small spheres revolving round it, named for what it's doing in plain words; work ready for your OK sits at the top; tasks waiting their turn sit below. One **Go** (or just say "go") starts everything waiting.
- **Tags float on their spheres.** Each sphere carries just its name, floating with a shadow. Tap the sphere to open its tag for a line about it and **Open** for the details.
- **Less to read.** An agent's block shows what it's doing and its to-do list; steps, files, tokens and cost are under "details".
- **No stray box.** The moving silver edge round open panels is gone.

## 0.46.0 — 2026-10-06

- **The Symbiot look on every part.** Whatever you open pools over the liquid as glass, with a slow silver edge: cards are glass, the main buttons chrome, the map's nodes small silver spheres.
- **Watch an agent work, as it works.** What it's doing right now, its own to-do list ticking off (with a progress ring), each step in plain words with how long it took, test results, the files it changed, its pace, its model, turns, tokens and cost, and finally its answer.
- **Update prompts show again.** Since 0.45.0 the "Update & restart" bar was hidden behind the liquid; it now sits on top, as a chrome bar at the top of the window.
- **Calm, readable droplets.** Droplets keep clear of each other, past where their metal would merge, so none of them flicker or shake their labels; when a screen can't hold them all, the least used go under "more" instead of crowding.
- **See Symbiot think.** Under each chat reply: what it did to answer (what it recalled, the links it looked up, that it matched how you talk, what it handed over or remembered).

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
