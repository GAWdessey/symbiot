# One mind: Symbiot as the body, Claude as the mind

_Design plan · 2026-10-10 · for Pat's review. Nothing is built yet._

## Why

Pat: "all I want is to have Symbiot be you", meaning the single Claude Code session he works with, which
investigates, acts, checks the live system and reports back. Symbiot already runs Claude underneath
(`claude -p`), but it breaks Claude into many short runs that never see each other. That causes the problems
measured on 2026-10-10 from `~/.config/symbiot/tasks.json` (225 tasks, 10-08 10:11 → 10-10 19:06):

- **48% of all tasks (108) were Symbiot fixing Symbiot.** 72 of those read as bugs, and 49 are still open.
  The other projects (robin, quartz, marketing, meridian…) did fine: 90 of 100 approved.
- **Every one-shot call went to a local 8B model.** `useOllamaModel()` changes the provider for the whole
  app, so Home chat answered in the third person ("You can respond with…") and claimed work it hadn't done.
- **Runs contradicted each other.** A read-only run said "the tunnel is off" and asked Pat to delete two
  units, while another run (`act-6c850aab`) was still running and rewriting one of them. Lanes Pat never
  asked for (iq-option-bot-desk) kept relaunching and handing work to ops.
- **Approve committed other runs' unfinished work.** Commit `471a502` mixed the marketing fixes with the
  unrelated `route.mjs` and its test (since split into `324aa60` and `4b7a790`).
- **Blockers landed on Pat.** "Needs you" cards asked him to paste shell commands an agent had been
  blocked from running.

All of these come from the same place: **no single mind holds the whole picture.** Each run starts from a
short brief, can't see the other runs, and can't check what another run claims.

## The design

Symbiot becomes the **body**: eyes (watches), hands (browser, screens, posting), voice (Home, phone, tray),
and a record of what happened. One long-running Claude session becomes the **mind**, and decides everything.

```
 watches ─┐                                  ┌─ Symbiot tools (MCP): tasks, reports,
 schedule ┤                                  │   screens/browser, post, notify, ask
 CI / git ┼─► event inbox ─► THE MIND ───────┼─ shell, files, git (Claude Code's own)
 helpers  ┤   (queued,       one persistent  └─ helpers: sub-agents it starts, owns
 Pat ───┘    Pat first)  Claude session      and checks before reporting
                                   │
                                   └─► Pat: Home, phone, tray: one voice
```

### 1. The mind

- **One persistent process:**
  `claude -p --input-format stream-json --output-format stream-json --session-id <fixed id>`.
  It stays open, and Symbiot writes each event to its stdin as a user message. After a crash or restart it
  comes back with `--resume <id>`, so the conversation carries on. Claude Code compacts its own context.
- **Pat's own setup, not a stripped-down one.** It loads `~/.claude/CLAUDE.md`, the project CLAUDE.md
  files and auto-memory. Today `callClaude` turns these off (`--setting-sources ""`, no tools, a new session
  every call), and the mind must not. Its system prompt only adds who Symbiot is and which tools it has.
- **A strong model always.** Opus 5.5 by default (Pat's call, see decision B), and never the local model.
- **It answers Pat directly.** Home chat, the Reports chat, card chats and the phone all post into the
  same session. So "do it" in Reports means the same mind that read the report does the work, or says
  exactly why it won't.

### 2. The event inbox

- Everything that happens becomes one short message in a queue:
  `[github · 17:42] PR #160 checks failed: test (link)`, `[gmail] 3 new, 1 from Kloof Farm`,
  `[timer] Monday 08:00 — write the week up`, `[helper act-7e5d] finished: 2 files changed, tests pass`.
- **Pat's messages go to the front of the queue.** Watch news gets batched: one digest per watch per
  interval, not one message per item. That keeps the mind's context and Pat's plan limits sane.
- **Watches only report.** They stop starting their own agents and briefs (`draftBrief`, `chatBrief`,
  `socialBrief`, `draftReply` → `runHandoff`). The mind decides what's worth doing.

### 3. The hands: Symbiot as tools

- **Symbiot runs a local MCP server** that offers the mind what only Symbiot can do. Most of this already
  exists as CLI commands; the server wraps them.
  - `tasks`: add, tick, list, park (the Workdesk becomes the mind's visible to-do list)
  - `reports`: list, read, mark read
  - `screens` / `browser`: open, read, press, upload (signed-in sites)
  - `post`: draft and publish (publishing always waits for Pat, see §6)
  - `notify`: push to the phone or tray
  - `ask_garth`: one question with options, rendered as a single Home card
- **Shell, files and git are Claude Code's own tools.** The mind checks the live system before it claims
  anything (`ps`, `systemctl --user is-active`, `git status`), the way a person would.

### 4. Helpers: the mind delegates, owns and checks

- **Long repo work goes to a helper** (a sub-agent or a `runHandoff` run), started only by the mind, so the
  mind stays responsive to Pat.
- **The mind owns each helper:**
  - it writes the brief from full context, not a 300-character task line
  - it records which files the helper may touch, and Symbiot logs which files it did touch
  - **two helpers never share a file:** the mind sequences them
  - when a helper finishes, the mind checks the result (diff, tests, live probe) before telling Pat
- **Approve commits only what the mind checked and attributed to that helper.** This is task
  `37fad265d585`. A run with no matched task never commits.

### 5. One voice to Pat

- **Only the mind writes to Pat.** It does so when something is truly his call (money, publishing,
  accounts, taste) or when he asked to be told.
- **"Needs you" only after the mind has checked live state and the other open work.** A card states the
  effect and has one button that does it ("Remove the IQ tunnel units" → done through the mind). It never
  hands him a shell command to paste.
- **The mind settles conflicts between helpers itself.** It never passes them on as two cards that
  disagree.

### 6. Safety: kept, and made sharper

- **The guard (`guard.mjs`, the "membrane") stays,** as the PreToolUse hook on the mind and every helper.
- **Outward and irreversible actions always wait for Pat:** publish, push to main (which publishes npm),
  payments, deleting outside a repo, account changes.
- **The agent command loses its blanket grants:** `--dangerously-skip-permissions`, `Bash(rm -rf:*)`,
  `Bash(git push origin main:*)` and `--add-dir /home/odessey`. The guard and per-helper file grants replace
  them.
- **Local models are only for internal, mechanical reads** that Pat never sees (the last-message reader,
  classify). That's `route.mjs`'s L tier. `useOllamaModel()` stops changing the provider for the whole app
  (task `b1ebfce8895a`).

## What goes, what stays

| Goes or shrinks | Why |
|---|---|
| Lane-to-lane handovers (`lanes.mjs` `dispatch`, `lanesTick`, the handover ledger) | The mind holds every lane's context. A lane becomes a folder it knows, not an agent that hands work to other agents |
| Auto-started one-shot runs per task (`runHandoff` from ticks, `urgentSweep`, `resumeParked`) | Only the mind starts helpers |
| `write()`-based `converse()` for Home, Reports and card chats | They post into the mind instead |
| The app-wide provider switch for chat | The mind is always a strong Claude model |
| "Needs you" built from runs' last words (`readPass`, `needsOf`) | Only the mind raises a card |
| `autoMerge` without checking | Merge only after the mind has checked |

**Stays:** the UI, phone link, tray, Screens and the Symbiot Browser, watches (as eyes only), write-ups,
Reports, the Workdesk (as the mind's to-do list) and the guard.

## Decisions for Pat (my position on each, for you to overrule)

- **A. Symbiot's own code.** Since 0.59.0, "Symbiot doesn't work on its own code", and that is where the
  108-task backlog piles up. My position: a **creator mode**, on for you only, that lets the mind work in
  `~/projects/symbiot`. It still never touches the installed files or the licence. Customers keep the
  current rule.
- **B. The mind's model.** My position: Opus 5.5 for the mind, and Sonnet for helpers unless the mind
  escalates. Least sure about: plan limits with one session open all day. The event batching in §2 is the
  lever. If it bites, the mind could drop to Sonnet when nothing needs it.
- **C. Where it lives.** My position: on this PC first. Moving it to the always-on VM comes later, once it's
  proven, because the browser sign-ins live here.
- **D. Existing lanes and drafts.** My position: let the open runs finish, then switch. Their open tasks
  become the mind's to-do list on day one.

## Build order: small steps, each checked on the real running app

1. **The mind behind Home chat** (flag `mind: true`). Check: Home answers with today's context, uses your
   CLAUDE.md and memory, and carries on after `symbiot` restarts.
2. **Symbiot's MCP tools:** tasks, reports, notify, ask_garth first; screens and post after. Check: "add
   that as a task" from Home lands in `tasks.json` once, with the mind's own wording.
3. **Watches become events,** and their own agent-starting is switched off. Check: a GitHub CI failure
   reaches the mind as one message, and no run starts unless the mind starts it.
4. **Helpers through the mind,** with a per-helper file record and Approve limited to it. Check: two helpers
   in one repo, where approving one never commits the other's files.
5. **Remove lane dispatch, auto-runs and runs' "Needs you".** Check: a week with zero contradicting cards.
6. **Phone and tray talk to the mind.**

## How we'll know it worked

Measured from `tasks.json`, `costs.json` and the cards, one week after step 5:

- Symbiot-fixing-Symbiot falls from **48%** of tasks to under 15%.
- **Zero** commits that mix runs.
- **Zero** wrong "Needs you" cards, and **zero** shell commands handed to Pat to paste.
- **Zero** replies Pat sees that came from a local model.
- Pat's own test: a request typed into Home gets the same answer this session would give.
