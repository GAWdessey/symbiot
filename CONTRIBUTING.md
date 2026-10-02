# Contributing to symbiot

How to configure, test and release Symbiot. For what it does and how to use it,
see the [README](README.md).

## Config

Everything lives in `~/.config/symbiot/`: `config.json` (your AI, `scanRoots`,
`agentCmd`, `mail`, `weekly`; readable only by you), `tasks.json` (your tasks),
`weeks/` (the saved weekly write-ups), `screens/` (Screens: each PNG plus
`screens.json` with its regions),
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

- `index.mjs` — the CLI and `symbiot app`'s server: commands, scans, the Map,
  write-ups, tasks and review.
- `core.mjs` — shared basics: config and task files, the shell helper, a repo's
  working-tree state.
- `agents.mjs` — handing work to an agent: the command template and presets, the
  Agents tab's job registry, and agent questions.
- `drift.mjs` — the per-repo drift facts behind `symbiot drift`.
- `ui.mjs` — the app's page. `mail.mjs` — reading sent mail.

```bash
npm test
```

Runs five suites, all against throwaway repos, an isolated `HOME` and (for the
update check) a fake npm registry:

- `test/load.mjs` — the shipped files parse and load: `node --check` on each
  module, `ui.mjs` imported on its own with its page's JavaScript parsed, every
  local import listed in package.json `"files"`, and the `bin` entry point shipped.
- `test/fixtures.mjs` — accuracy fixtures: the facts Symbiot collects (identity
  matching, stale checkouts, worktrees, drift) and the `symbiot drift` report as
  printed, the scan time limit, the agent handoff, review → send back → approve →
  ship (including a repo that gitignores `.symbiot/`), agent questions, mail
  ingestion (`symbiot mail` end to end), and the update command.
- `test/smoke.mjs` — boots `symbiot app`, runs the page's own JavaScript against
  a fake DOM (every tab, every button), hits every endpoint the UI calls with the
  method the UI uses, checks POST-only endpoints refuse GET and `/api` needs the
  token, and checks the update banner can't loop.
- `test/app.mjs` — the app's lifecycle: a second `symbiot app` reuses the running
  one (and `SYMBIOT_FORCE_NEW` / a foreign server on the port don't), and the
  update check only offers a higher npm version.
- `test/install.mjs` — runs the CLI through a bin symlink, then `npm pack` +
  global install into a temp prefix: `symbiot help`, every shipped file present,
  and the installed `symbiot app` serving its page. Needs npm registry access for
  dependencies; `SYMBIOT_SKIP_INSTALL_TEST=1` skips that part.

`SYMBIOT_NO_OPEN=1` stops `symbiot app` opening a window (the tests set it), and
`SYMBIOT_REGISTRY` points its update check at another registry. CI
(`.github/workflows/ci.yml`) runs the whole suite on every pull request.

## Releasing

Bump the version in the pull request, merge it into `main`, then tag `main`'s
commit:

```bash
git checkout main && git pull
git tag v$(node -p "require('./package.json').version") && git push origin --tags
```

`.github/workflows/publish.yml` publishes from that tag only if it's on `main`,
matches `package.json`, and the full suite passes. A tag on any other branch is
refused, so what's on npm is always what's on `main`.
