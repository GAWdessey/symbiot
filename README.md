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
symbiot models     recommend AI models for your hardware
symbiot login      connect it to an AI (once)
symbiot whoami     show how it's connected
symbiot help
```

## Prefer a window? `symbiot app`

```bash
symbiot app
```

Starts a tiny local server (127.0.0.1 only, protected by a one-time token) and
opens the visual app in your browser — in a clean, chrome-less window if you have
Chrome/Chromium/Edge/Brave (`--app` mode), otherwise a normal tab. No Electron,
no install — it's the same CLI. Press Ctrl+C (or click Quit) to stop.

Tabs:

- **Map** — a live, interactive node graph of your work, built from your local git:
  you at the centre, your repos, and the languages and tools they share (so related
  projects cluster). **Scroll to zoom, drag to pan, click a node.** Clicking a repo
  shows its branch/commits/uncommitted/stack and a **Suggest next steps** button —
  your model reads that repo's recent commits + open TODOs and proposes *In flight /
  Next steps / Ideas*. The graph itself **needs no AI key** (pure local data);
  suggestions use your chosen model (free with local Ollama). This is the landing view.
- **Week / Standup / Todo** — the write-ups (these use your chosen AI).
- **Settings** — pick your AI. Free/private option: run **Ollama** locally, no key.

**Cross-platform:** the app works on **Linux, macOS, and Windows** — the server
and UI are just a local web page. The chrome-less window is detected per-OS
(PATH on Linux, the `/Applications` bundle on macOS, `Program Files` on Windows);
where no Chromium-family browser is found it opens your default browser instead.

## Install

```bash
npm install -g symbiot        # or run without installing:  npx symbiot week
```

## Which model? Ask your machine

```bash
symbiot models
```

Reads your RAM / CPU / GPU and recommends **local models by tier** (min / med / max,
marking which fit your RAM) to run free & private via [Ollama](https://ollama.com),
plus **paid** options (Claude / OpenAI / Gemini, cheap → top). Also available as
a button in the app's Settings.

## Connect it (once)

Pick the AI you want it to write with:

```bash
symbiot login     # choose Claude, OpenAI, Gemini, or a local model (Ollama)
```

You'll get a short menu; paste that provider's API key (or, for Ollama, just point
it at your local server) and it's saved to `~/.config/symbiot/config.json`.

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
- **Sends to the AI:** only those commit/TODO summaries, so it can write the
  update. Not your code, not file contents. With a **local Ollama model,
  nothing leaves your machine at all.**
- **Never:** no keylogging, no screen capture, no browsing history, no accounts.

## Config

- `SYMBIOT_MODEL` — override the model for any provider (e.g. `gpt-4o`,
  `claude-haiku-4-5`, `gemini-1.5-pro`).
- `symbiot whoami` shows the active provider, model, and where the credential
  came from. `symbiot logout` forgets saved credentials.

---

Part of Symbiot — an assistant that learns how you work and gives it back to you.
This CLI is the personal, install-it-yourself front door: it needs nothing but your
own machine and an AI of your choice.
