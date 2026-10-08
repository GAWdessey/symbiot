# Friction, 2026-10-08: Marketing and LinkedIn

What Garth hit using Symbiot on 2026-10-08, mostly its Marketing lane, one case at a time: what it
showed, why it was wrong, and what it should do instead, with where it's fixed.
Tracked on GitHub as [#136](https://github.com/GarthGhostai/symbiot/issues/136).

**Principle (Garth's): never turn an agent's job into a step for the user. The user
approves, the agent does.**

## 1. A post opened as a `.txt` file, notes mixed in

- **What happened:** opening a draft of the weekly [Steve] LinkedIn series under Marketing
  opened the raw file, with the agent's working notes mixed into the post text.
- **Why it was wrong:** he couldn't see what the post would look like, and the notes
  could have gone out as part of it.
- **What it should do instead:** show each draft as the platform's own post: for LinkedIn,
  name, headline and photo, the text with its real line breaks, the "…see more" fold at
  about 210 characters, hashtags, and its picture or clip inline. Notes folded away below,
  never in the post. The draft file keeps the post (`## Post`) apart from the notes
  (`## Notes`), so the preview and what gets posted are the same text.
- **Fixed in:** `marketing.mjs` `parseDraft` / `draftPreview`, the Marketing page's
  **Preview** (`ui.mjs` `mkPreviewHtml`), with **Approve** / **Skip** next to it
  (`home.mjs` `marketingDraftAnswer`). Tests: `test/marketing.mjs`, "a draft shown as the
  post it will be".

## 2. A card told him to schedule weeks 2–4 in LinkedIn himself

- **What happened:** "Marketing asks: schedule weeks 2–4 of the steve linkedin series"
  offered two options, both "👤 You (only you: your linkedin)": schedule all three in
  LinkedIn's scheduler and paste each post's text and card, or schedule week 2 and approve
  3 and 4 one at a time. After he answered, it said "Sent to Paperclip Steve".
- **Why it was wrong:** LinkedIn is linked in Symbiot's signed-in browser; posting and
  scheduling there is the agent's work. His only step is approving each preview. And the
  answer belonged to the marketing lane, not paperclip-steve.
- **What it should do instead:** offer it as the agent's ("🤖 Agent: schedule …, once you
  approve its preview on the Workdesk"), post or schedule through the signed-in browser
  once approved, and say **Sent to Marketing**.
- **Fixed in:** `handover.mjs` `agentsPosting` (applied to every question in `agents.mjs`
  `parseQuestions`), the marketing brief (`marketing.mjs` `marketingBrief`), the answer's
  lane. Tests: `test/lanes.mjs`, "posting, scheduling or pasting on a linked platform is
  never only you".

## 3. A card asked him to link or sign in to LinkedIn when it was already linked

- **What happened:** cards asked for his LinkedIn sign-in, or to link it, with LinkedIn
  already signed in in Symbiot's browser (`~/.config/symbiot/browser`).
- **Why it was wrong:** what's linked is a fact Symbiot can check; asking for it again
  makes him do what's already done.
- **What it should do instead:** check what's linked (Connections, Symbiot's browser, the
  Claude connectors) before asking; use that session; ask him to sign in again only when
  a real attempt found the session expired, and say that's why.
- **Fixed in:** `handover.mjs` `linkedAsks` (a 👤 sign-in / link / consent / developer-app
  option on a linked platform becomes the agent's; one that says the session expired
  stays his) and `linkedChore` (a run's last words asking the same aren't put on Home,
  `agents.mjs` `needsOf`); every brief's "Prefer what's already linked" rule
  (`handover.mjs` `ONLY_YOU`). Tests: `test/lanes.mjs` and `test/marketing.mjs`,
  "LinkedIn linked: no card asks you to sign in or do it by hand".

## 4. "Let a poster on this computer put the steve posts up for you?"

- **What happened:** an item under Home's "Only the user can do" offered "👤 You (only
  you: your linkedin sign-in): ok it, and i'll have the ops…" and "👤 You (only you: your
  linkedin): keep doing it by hand. schedule…".
- **Is it the same pattern?** Yes. Both options made the agent's job his: one asked for a
  sign-in that already exists, the other offered doing it by hand. Posting is the agent's
  job once he approves a draft, and that was already his standing preference.
- **What it should do instead:** one option, the agent's: post through Symbiot's browser,
  already signed in to LinkedIn, once he approves each preview. Never "by hand".
- **Fixed in:** the same `linkedAsks` (by-hand options dropped on a linked platform; if
  none is left, the agent's option is offered, never none). Unapproved drafts are lit
  under Marketing's **Needs you** as "a post to approve", with Preview one click away
  (`home.mjs` `marketingState`), so approving is the one thing he's asked.

## 5. An agent picked a route that needed him, when the account was already linked

- **What happened:** the marketing lane handed ops "Build a LinkedIn auto-poster…" with
  the LinkedIn API route: a developer app with "Sign In with LinkedIn using OpenID
  Connect" + "Share on LinkedIn", OAuth consent, a client ID and secret. That put a card
  on Home under "Only the user can do": "creating linkedin's developer app needs your
  sign-in, and linkedin may ask for a company page… the one-time ok to let it post as
  you", then asked him for the app's client ID and secret. The spec reached ops twice
  (ledger ids `0ce3e9ca` and `cb3305e8` in `~/.config/symbiot/lanes.json`), a third copy
  of the same work: ops run `act-ea7164af` was already building a poster on the
  signed-in browser.
- **Why it was wrong:** his LinkedIn was already signed in in Symbiot's own browser
  profile. The API route needed new sign-ins, a new app, possibly a Company Page, and his
  consent; the browser route needs none of that. His only step should be approving each
  draft's preview on the Workdesk.
- **What it should do instead:** prefer the linked browser session over any route that
  needs new sign-ins, apps, keys or approvals. Before writing a handover or a "👤 You"
  step, check what's linked (Connections, the Screens browser). Only ask him to sign in
  if a real attempt fails because the session expired.
- **Where to fix it:**
  1. The handover/act prompt (`tasks.mjs` `buildTasksMd`, the "How" text): **done**, the
     "Prefer what's already linked" rule in `handover.mjs` `ONLY_YOU`, which every brief
     carries.
  2. `handover.mjs` `leftToYou` and the ask cards in `home.mjs`: **done**, a sign-in,
     app or consent step for a linked site is dropped from Home (`linkedChore` in
     `agents.mjs` `needsOf`) and turned into the agent's option on a card (`linkedAsks`).
  3. `lanes.mjs` `dispatch`: **open**. When a handover's text changes, the new key starts
     a fresh ops run even while an earlier run of the same handover is still going;
     that's how this one ran twice. It should supersede the running one instead.

## 6. A report gave him nothing to act on

- **What happened:** he read the "Argena catch-up" report under Reports, then had to copy
  its "Top 3 next" section into Home's chat by hand to act on it.
- **Why it was wrong:** the report knew its own next steps; copying them across is a
  step Symbiot made for him.
- **What it should do instead:** end every write-up with 2-4 ideas drawn from it (its own
  "Top 3 next"), ticked straight onto the Workdesk in that report's lane (here
  `argena`), plus a box to ask Symbiot about the report in place. A draft report (a
  LinkedIn post preview for the Steve series, say) gets Approve / Reject instead.
- **Fixed in:** `reports.mjs` `reportIdeas` / `isDraftReport`, `home.mjs`
  `reportIdeasAdd`, `reportAsk`, `reportDraftAnswer`, the Reports reader (`ui.mjs`
  `repActsHtml`). Tests: `test/reports.mjs`, "each ends with what to do about it".

## 7. A card asked him for something he'd already given

- **What happened:** Home kept showing "Show me your work: where your repos are" though
  he'd listed five scan folders in Settings, and it came back after he'd dealt with it
  before.
- **Why it was wrong:** the folders were saved (`~/.config/symbiot/config.json`
  `scanRoots`). The search was killed at 20s and lost what it had found (`find`'s piped
  output is block-buffered), so `repos.json` came back empty, and Home read "0 repos
  found" as "the user hasn't said where".
- **What it should do instead:** a failed or short search is Symbiot's problem to retry,
  never a question for the user. Ask for folders only when none are set, and don't ask
  "is that all?" about folders he chose himself.
- **Fixed in:** `scan.mjs` (`stdbuf -oL` so a cut-short `find` keeps what it found,
  `findGitDirs` gets the whole `SCAN_TIMEOUT_MS`, `.nvm`/`.rustup`/… pruned); `home.mjs`
  `reposCard` (no `setup:folders` or `repos:confirm` card once `scanRoots` is set); a note
  under the folders in Settings when the last search found none (`ui.mjs`
  `loadScanRoots`, `/api/scanroots`). Tests: `test/adapt.mjs`, "nor once you've set your
  work folders".

## 8. Two agents at work, and no way to tell what they were doing

- **What happened:** the steve lane (aptitude tests on Steve against the last good
  baseline) and the argena lane (a v6.7 device pass, then the art style and Toram-style
  zones, then apprenticeships, then the slow loop) had both been running for 30+
  minutes. All Home showed was "Agents working: 2".
- **Why it was wrong:** he couldn't tell what either one was doing, how far through its
  brief it was, or whether it was stuck, without reading raw logs. A stalled run looks
  exactly like a busy one.
- **What it should do instead:** give each working lane a line on Home with its current
  step, taken from the agent's latest actions, and its progress against the brief's plan
  ("step 2 of 4: look and feel, plus a zoned world · shooting the monsters"), and how
  long it has left as a range ("5–15 min left"), from the lane's past runs and anything
  queued behind it. Flag a run that hasn't made progress for a while.
- **Fixed in:** `work.mjs` `briefPlan` (the numbered steps of the brief's open task),
  `stepOf` (the step it's on, from "Step N: …" or two words of a step's label in what
  it said), `nowLine` and `runLine` (the line, `quiet` past `STALL_MS` = 20 min since
  its last move, and `looping` when its last 5 steps were the same call); `agents.mjs`
  `workOf` (`line` on each running agent); `home.mjs` `runNow`, `homeState` `runs`, and
  `workScene`; Home's run drops, the core's "(n stalled)", the lane line and the Away
  screen (`ui.mjs` `runWarn`); and the brief's ask to say "Step N: …" (`tasks.mjs`).
  The time left: `estimate.mjs` `estimate` (past run lengths from each lane's
  agent.log, plus `durations.json`, written as each run ends with its lane, kind and
  task; judged on the runs that lasted longer than this one so far), shown after the
  step. Shipped in 0.57.3. Tests: `test/work.mjs`, "HOW FAR ALONG" and "HOW LONG IT
  HAS LEFT".

## 9. Agents at work broke Home's layout

- **What happened:** with three agents at work (argena "step 3 of 4: wire the class
  bible…", Steve "pulling the diffs", an ops run "Garth just restarted his…"), Home at
  about 1840×873 put their orbs among the section orbs. That pushed the headings off
  their own orbs ("Projects" over Todo, "Resources" over Workdesk) and drew "Watching"
  on top of "Areas". The watched sites scattered, and the names were cut letter by
  letter ("ar / g…", "Ste / ve"). A small orb with no label floated above Chat, and the
  Needs-you card covered its own orb.
- **Why it was wrong:** he couldn't tell which orb belonged to which group, or which
  agent was which. The 0.57.3 drops added to the very group they crowded out: with
  them, the Projects group no longer fit its corner, so Home gave up its zoned layout.
- **What it should do instead:** give the agents a band or ring of their own, apart from
  the groups. Lay the groups out so no heading or label overlaps another at that window
  size or smaller, and keep each heading by its own orbs. Show agent names in full,
  with the step under them.
- **Fixed in:** `ui.mjs` `lqRunBand` (a band under the needs band: an orb each, the
  name on one line, its step and time left under it; the groups lay out below it, and
  `lqPara` keeps it out of every group), the headings' placement in `lqStep` (in the
  free layout, never on another heading), the pointer bulge kept on the orb's edge (the
  stray orb), and the needs card set 2r+22 clear of its orb (`lqNeeds`, the liquid line
  in `lqDraw`). Tests: `test/adapt.mjs`, "HOME'S LAYOUT": at 1840×873, 1600×900,
  1440×860 and 1280×800, with four agents at work, no orb, label or heading overlaps
  another, everything stays on screen, and the groups keep their zones. Shipped in
  0.57.4 (PR #139).

## 10. "Symbiot keeps crashing": its window closed itself

- **What happened:** from about 13:38, Symbiot's window kept vanishing. He rebooted at
  13:39 and wrote "symiot keep crashing" at 13:47 and "still crashing" at 13:50, and
  reopened it six times in four minutes. The app itself never stopped: the server ran
  from 13:40 straight through, with nothing in `app.log` or the journal. Each time,
  the symbiot agent working on case 9 had just taken a headless screenshot of Home
  (13:46, 13:49:31, 13:49:43, 13:51:05, 13:51:20). Since 0.55.1, a newer Symbiot window
  makes older ones close themselves. The screenshot's page said it was a new window
  (straight to the app, or through the agent's stand-in server, which passed
  `/api/ping` on to it), so his real window closed 1–5 s later, every time. 0.57.2
  wasn't the cause.
- **Why it was wrong:** an agent checking its own work closed the app in his face, and
  it looked exactly like a crash, so it cost him a reboot and an urgent task.
- **What it should do instead:** only a window someone can see takes part in "one
  window": never a headless browser. The window you're in never closes itself; if a
  newer one opens, it says so and offers "Use this one".
- **Fixed in:** `ui.mjs` `winHeadless` (a headless or driven browser gets no window id)
  and `winOld` (closes only when it isn't the window you're in), `server.mjs`
  `headlessAgent` (a headless browser's ping never becomes the newest window). Tests:
  `test/app.mjs`, "ONE WINDOW". Shipped in 0.57.5 (PR #140).

## 11. The urgent crash fix waited behind routine work

- **What happened:** the crash fix (case 10) was handed to the symbiot lane three times.
  Each time it waited behind the lane's run on Home's layout (step 5 of 6) and 5 other
  queued tasks, and it went into the brief under "Docs". He parked argena and steve by
  hand so the crash could be fixed, and said: "that is what SHOULD happen, everything
  gets parked and if something becomes urgent thats handled first".
- **Why it was wrong:** a broken app is the most urgent thing there is. It had to wait for
  layout work, and he had to do the scheduling himself.
- **What it should do instead:** when something is urgent (the app crashing or broken,
  "urgent", "comes first", or him writing in capitals), Symbiot parks every other lane
  at a safe point and runs the urgent task first. If the lane's own agent is on routine
  work, that run stops and the urgent one starts now. Once it's done, the parked work
  resumes in its old order. The reply says what got parked.
- **Fixed in:** `agents.mjs` `isUrgent`, `urgentFirst` (parks the lanes with work going
  or waiting, whose current run finishes first, the end of a run being the safe point;
  stops the lane's routine run, never one already on urgent work), `urgentDone` /
  `urgentSweep` (unpark in order and start what's waiting; a 6-hour cap if the urgent
  run never ends). `mind.mjs` `actIn` (Home's hand-over, and its reply naming what got
  parked) and `tasks.mjs` `buildTasksMd` (an "Urgent: do these first" section on top).
  Tests: `test/urgent.mjs`. Shipped in 0.57.5 (PR #140).

## 12. A draft to approve that didn't show the draft

- **What happened:** on Home, under "Only the user can do", the card "Draft: Messaging,
  1 new notification waits for your OK" said "The reply to Frikkie is ready for you to
  send" with Go ahead / Skip, but never showed the reply. Its own text also said "I can't
  send it myself, because Symbiot won't let me press Send", next to a Go ahead button.
  Go ahead only started the same drafting run again, which couldn't send, so it retyped
  the reply and asked again, four times, until he pasted and sent it himself (14:10).
- **Why it was wrong:** to check a reply, he had to open LinkedIn, read it there, and come
  back to say it was wrong. He called that a waste of his time. The card also contradicted
  itself.
- **What it should do instead:** every draft approval card (messages, replies, posts) shows
  the whole draft inline, as it will look on the platform, with none of the agent's notes.
  Go ahead sends it through the signed-in browser, Skip drops it, and Change it takes his
  words, so the agent redrafts and the new version shows on the same card. The card says
  what Go ahead does, never that the agent can't send.
- **Fixed in:** `watch.mjs`: every draft brief writes the reply under `## The reply`
  (`To:` first, notes under `## Notes`) and never asks to send or paste it; `draftCard` /
  `draftCards` (the card's draft, from the folder, after a restart too); `draftAnswer`
  (Go ahead: a send run with `sendBrief`, without SYMBIOT_DRAFT; Change it: a redraft;
  Skip). `home.mjs` `troubles` (the "Reply to Frikkie on LinkedIn" card) and `homeAnswer`;
  `agents.mjs` `needsOf` (a draft's "ready for you to send" is no longer a needs card);
  `ui.mjs` `draftHtml` (the reply as a LinkedIn message, a WhatsApp bubble or an email)
  and "Change it" on the card. Marketing's posts already preview this way (case 1).
  Tests: `test/post.mjs`, "A DRAFT ON ITS CARD". Shipped in 0.57.6.
- **The Frikkie reply itself:** already sent. He pasted and sent it at 14:10 ("Pasted and
  sent, so this one's done"), so there was nothing left in the box to pull onto the card.

## 13. A reply he'd already sent, still waiting for his OK

- **What happened:** once 0.57.6 was installed, Home showed "Reply on LinkedIn" to
  Frikkie with Go ahead and Skip. He had pasted that reply in and sent it himself at
  14:10, and told Symbiot so ("Pasted and sent, so this one's done"). The card's text
  also ended with the agent's note: "Sent by the user on 2026-10-08 at 2:10 PM,
  shortened to: …".
- **Why it was wrong:** it asked for an OK on something already done, and Go ahead
  would have sent the reply a second time. The note wasn't part of the reply.
- **What it should do instead:** a draft the user sent, or one its run notes as sent,
  has no card. A note after the reply is never shown as part of it.
- **Fixed in:** `watch.mjs` `replyOf` (stops at a "Sent …/Posted … by/on/at" note and
  marks the draft sent) and `sentByUser` (the newest answers say it was sent); and
  `draftCard`, which returns no card for either. Tests: `test/post.mjs`, "A DRAFT ON
  ITS CARD". Shipped in 0.57.7.

## 14. Two Symbiots at once, after an update

- **What happened:** as 0.57.6 installed and relaunched itself at 15:43, a second launch
  (the install opening Symbiot) found the port taken, but no answer from it yet. So it
  started its own app on port 41017, with its own window. Two apps ran side by side,
  each with the timers that start agents and hand over work.
- **Why it was wrong:** one Symbiot is the rule (since 0.32). Two race the same config
  and can start the same work twice.
- **What it should do instead:** while the usual port stays busy, ask whether it's
  Symbiot. If it is, open that window and exit. Only something else on the port earns
  another port.
- **Fixed in:** `server.mjs` `startApp` (its port-busy fallback asks the app on the port
  first; `SYMBIOT_FORCE_NEW` still starts a second one on purpose). Tests:
  `test/app.mjs`, "a Symbiot that answers late". Shipped in 0.57.7.

## Other places the same pattern shows up

- **`post.mjs` `approvePost`** (Marketing's "Drafts to post": Shipped, Learned / fixed,
  Longer post): Approve copies the text and says "Symbiot doesn't post or schedule it:
  paste it into LinkedIn's share box … and post it yourself". With LinkedIn linked, that
  is the agent's job too: Approve should hand it to Marketing's agent to post through the
  signed-in browser, as the lane's drafts now do. **Open.**
- **Any brief that names a platform's API first.** The new rule covers the briefs; a run
  that still picks an API route over a linked session should be caught by the same check
  as case 5 before its handover is written. **Covered by the brief; watch for it.**
