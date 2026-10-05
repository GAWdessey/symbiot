# Contributing to symbiot

How to configure, test and release Symbiot. For what it does and how to use it,
see the [README](README.md).

## Config

Everything lives in `~/.config/symbiot/`: `config.json` (your AI, `scanRoots`,
`agentCmd`, `mail`, `weekly`, `watchBrief`, `phoneLink` on a computer and
`computer` on a phone; readable only by you), `tasks.json` (your tasks),
`weeks/` (the saved weekly write-ups), `screens/` (Screens: each PNG plus
`screens.json` with its regions), `watch.json` (Watch: the pages you watch and
what's new on them; readable only by you),
`deploys.json` (optional, for drift's production check) and `rules.md` (optional
conventions every repo review must respect, alongside each repo's own
`CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md`).

- `SYMBIOT_MODEL` — override the model for any provider (e.g. `gpt-4o`,
  `claude-haiku-4-5`, `gemini-1.5-pro`).
- `SYMBIOT_SCAN_TIMEOUT` — the scan time limit, in seconds (default 60).
- `SYMBIOT_PORT` — the app's port (default 7391).
- `SYMBIOT_FORCE_NEW=1` — start a second app even if one is already running.
- `symbiot whoami` shows the active provider, model, and where the credential
  came from. `symbiot logout` forgets saved credentials.

## Development

The code is plain ES modules, no build step:

- `index.mjs` — the CLI: arguments, colours, and each command's output.
- `server.mjs` — `symbiot app`'s server: one instance per port, the `/api`
  routes (each a thin call into a module below), updates and restart.
- `ui.mjs` — the app's page.
- `scan.mjs` — reading your repos: scan folders and `--dir`, finding repos and
  project folders under a time limit, each repo's facts (your identities in it,
  commits, open work, README, rules), the Map, and the one repo set every view
  shares.
- `ai.mjs` — the AI it writes with: providers, which one is set up, one call per
  provider, and the local-model (Ollama) setup.
- `writeups.mjs` — what it writes: week, standup and todo, repo reviews and next
  steps, task Q&A, and the opt-in sent mail they fold in.
- `tasks.mjs` — tasks from your list to a PR: `tasks.json`, each repo's
  `.symbiot/TASKS.md`, review, Approve (branch, commit, push, PR) and the release
  facts on the review card.
- `agents.mjs` — handing work to an agent: the command template and presets, the
  Agents tab's job registry, and agent questions.
- `drift.mjs` — `symbiot drift`: each repo's drift facts, and all repos'.
- `core.mjs` — shared basics: the version, config and task files, the shell
  helper, a repo's working-tree state.
- `mail.mjs` (reading sent mail), `screens.mjs`, `headless.mjs` and `watch.mjs`
  (Screens and Watch, GitHub through `gh`, the brief), `phone.mjs` (Watch on
  your phone: the computer's pairing listener on port 7392, the phone's 2-minute
  ask), `desktop.mjs` (the weekly write-up and start at login).

A module never imports `index.mjs` or `server.mjs`, so each can be imported and
tested on its own.

```bash
npm test
```

Runs six suites, all against throwaway repos, an isolated `HOME` and (for the
update check) a fake npm registry:

- `test/load.mjs` — the shipped files parse and load: `node --check` on each
  module, `ui.mjs` imported on its own with its page's JavaScript parsed, every
  local import listed in package.json `"files"`, and the `bin` entry point shipped.
- `test/fixtures.mjs` — accuracy fixtures: the facts Symbiot collects (identity
  matching, stale checkouts, worktrees, drift) and the `symbiot drift` report as
  printed, the scan time limit, the agent handoff, review → send back → approve →
  ship (including a repo that gitignores `.symbiot/`), agent questions, mail
  ingestion (`symbiot mail` end to end), Watch (pages, GitHub through a stubbed
  `gh`, the brief), Watch on your phone (pairing and asking over real HTTP on
  127.0.0.1), and the update command.
- `test/paths.mjs` — the paths every release goes through: which repos a scan
  finds and from which folders, and that every view shares them; `week`,
  `standup` and `todo` through the real CLI with the AI stubbed by a fake Ollama
  (checking the prompt it gets: whose commits, which window, what's open, and
  Standup's "Waiting on you" line from Watch); and
  `tasks.json` ↔ `TASKS.md` round trips (push, your tick auto-archives, the
  agent's goes to review, send back, approve), plus the commit subject.
- `test/smoke.mjs` — boots `symbiot app`, runs the page's own JavaScript against
  a fake DOM (every tab, every button), hits every endpoint the UI calls with the
  method the UI uses, checks POST-only endpoints refuse GET and `/api` needs the
  token, and checks the update banner can't loop.
- `test/app.mjs` — the app's lifecycle: a second `symbiot app` reuses the running
  one (and `SYMBIOT_FORCE_NEW` / a foreign server on the port don't), the
  update check only offers a higher npm version, and Update & restart leaves one
  app serving the same address.
- `test/install.mjs` — runs the CLI through a bin symlink, then `npm pack` +
  global install into a temp prefix: `symbiot help`, every shipped file present,
  and the installed `symbiot app` serving its page. Needs npm registry access for
  dependencies; `SYMBIOT_SKIP_INSTALL_TEST=1` skips that part.

`SYMBIOT_NO_OPEN=1` stops `symbiot app` opening a window (the tests set it), and
`SYMBIOT_REGISTRY` points its update check at another registry, and
`SYMBIOT_UPDATE_CMD` replaces the global `npm install` that Update & restart runs. CI
(`.github/workflows/ci.yml`) runs the whole suite on every pull request.

## Releasing

A merge to `main` publishes, when it changes the version. Bump it in the pull
request (Symbiot's Approve does it for you: the **Version** picker on the review
card). `.github/workflows/publish.yml` runs on every push to `main`: if npm
doesn't have `package.json`'s version yet, it runs the full suite and publishes
it with npm trusted publishing (OIDC, no token anywhere). A merge that doesn't
change the version publishes nothing. Then it builds the Android APK and attaches
it to a GitHub release tagged `apk-<version>` (signed with the
`SYMBIOT_KEYSTORE_B64` / `SYMBIOT_KEYSTORE_PASS` secrets; skipped with a warning
without them).

`main` only takes a pull request whose `test` check (`.github/workflows/ci.yml`,
the whole suite) passed, and the repo allows auto-merge, so an approved PR with
**Auto-merge when CI passes** on goes from Approve to npm by itself.

npm is the record of what's released, not tags. A tag ruleset ("Protect release
tags (v*)", under Settings → Rules → Rulesets) lets only repo admins create, move
or delete `v*` tags, which includes the publish workflow's own token, so its
`v<version>` tag push is best effort and usually refused. To record the tag,
push it yourself:

```bash
git tag v0.41.0 <the merge commit> && git push origin v0.41.0
```
