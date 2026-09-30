# symbiot

Your week, written from your real work.

Symbiot reads your **local git activity** and writes the update you'd actually send —
your weekly summary, your standup, or what's still on your plate. No accounts, no
OAuth, no integrations to wire up. The only thing it needs is an AI key, which you
bring yourself.

```
symbiot            your last 7 days, written up   (same as: symbiot week)
symbiot standup    yesterday + today, for standup
symbiot todo       what's still on your plate
symbiot login      connect it to Claude (once)
symbiot whoami     show how it's connected
symbiot help
```

## Install

```bash
npm install -g symbiot        # or run without installing:  npx symbiot week
```

## Connect it (once)

Symbiot writes with **Claude**, so it needs an Anthropic API key. The easiest way:

```bash
symbiot login     # paste a key once — saved locally to ~/.config/symbiot
```

Get a key at <https://console.anthropic.com/settings/keys>. Prefer an env var? Set
`ANTHROPIC_API_KEY=sk-ant-...` instead and skip `login`. If you already use the
Anthropic CLI, `ant auth login` works too — Symbiot picks up any of these
automatically, and `symbiot whoami` shows which one it's using.

## Use

```bash
cd ~/your/projects            # or use --dir
symbiot week                  # writes up what you did, grouped and readable
symbiot week --since 14       # a fortnight instead of a week
symbiot standup               # short: done + next
symbiot todo                  # TODOs + uncommitted work, prioritised
symbiot week --all            # everyone's commits, not just yours
symbiot week --plain          # no colour/spinner, good for piping
```

By default it looks under your home folder for repos with recent commits, and
summarises the commits you authored (the email you commit under in each repo).
Point it somewhere specific with `--dir ~/work`.

## What it reads, and what it doesn't

- **Reads:** your local git — commit messages and changed-file names, plus
  `TODO`/`FIXME` markers and uncommitted changes for `todo`. All local.
- **Sends to the model:** only those commit/TODO summaries, so it can write the
  update. Not your code, not file contents.
- **Never:** no keylogging, no screen capture, no browsing history, no accounts.

## Config

- `SYMBIOT_MODEL` — the model to use (default `claude-opus-5-5`; `claude-haiku-4-5`
  is a cheaper option for this kind of summary).
- `ANTHROPIC_API_KEY` — your key. Or run `symbiot login` once, or use an
  `ant auth login` profile. `symbiot whoami` shows which credential is active;
  `symbiot logout` forgets a saved key.

---

Part of Symbiot — an assistant that learns how you work and gives it back to you.
This CLI is the personal, install-it-yourself front door: it needs nothing but your
own machine and one key.
