// A question an agent left, in words for someone who doesn't code (plainAsk): Home,
// the Workdesk's agent blocks, a project's card and the phone all show it this way, so
// "allow the list in .symbiot/allowlist.proposed.json" never reaches a screen. It was
// only Home's list: the same ask on the Workdesk still read as a file (2026-10-12).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signInNotNeeded, SETTING, holdOf, goWords, holdState } from "./chromegate.mjs";

// An ask in words for someone who doesn't code: a permission request lists what the agent
// wants to run, with Allow / Don't allow; any file path left in the question or choices
// becomes "a file". The answer sent back is still the choice's own text (labels only change what shows).
const PATHISH = /`?(?:~|\.{0,2})?\/?(?:[\w.-]+\/)+[\w.-]+\.(?:json|md|mjs|js|env|txt|sh)`?|`?\b[\w-]+\.(?:json|mjs)\b`?/g;
// What a rule lets an agent do, said the way you'd say it to someone who doesn't code.
const base = (p) => String(p || "").replace(/[/*]+$/, "").split("/").filter(Boolean).pop() || "your files";
function PLAIN_RULE(r) {
  const m = String(r).match(/^(\w+)\((.*)\)$/); if (!m) return "work in " + base(r);
  const [, tool, arg] = m, a = arg.replace(/:?\*+$/, "").trim(), first = a.split(/\s+/)[0].replace(/:\*?$/, "").split("/").pop();
  if (tool === "Read") return `read files in ${base(a)}`;
  if (/^(Edit|Write|MultiEdit)$/.test(tool)) return `change files in ${base(a)}`;
  if (tool !== "Bash") return `use ${tool}`;
  const host = (a.match(/@([\w.-]+)/) || [])[1];
  if (/^(ssh|scp|rsync)$/.test(first)) return host ? `connect to the computer at ${host}` : "connect to another computer";
  if (first === "adb") return "use your phone over the USB cable";
  if (/^(flutter|gradle|gradlew|godot|xcodebuild)$/.test(first) || /\bbuild\b/.test(a)) return "build the app";
  if (first === "ffmpeg" || first === "ffprobe") return "make and trim video clips";
  if (first === "git" && /\bpush\b/.test(a)) return "send code to GitHub";
  if (/^(npm|yarn|pnpm)$/.test(first) && /\bpublish\b/.test(a)) return "publish a new version";
  if (/^(bash|sh|zsh)$/.test(first)) return "run a script it wrote";
  if (/^(python\d*|node)$/.test(first)) return "run code in this project";
  if (/^(rm|shred)$/.test(first)) return "delete files";
  if (first === "sudo") return "make changes as administrator";
  return `run ${first}`;
}
const ONE_VERBS = /^(send|post|publish|start|run|go|deploy|merge|approve|book|pay|place|call|schedule|ship|submit|reply|share|launch|release|push|retry|restart|continue|confirm|accept|delete|remove|cancel|unsubscribe|install|update|order|buy|sign|open|add|apply|archive|close)$/i;
function oneButton(o) {
  const w = String(o || "").replace(/^\s*(?:🤖|👤)\s*(?:Agent|You(?:\s*\([^)]*\))?)?\s*:?\s*/u, "").replace(/\s*\(recommended\)\s*$/i, "").trim().split(/\s+/)[0] || "";
  return ONE_VERBS.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "Go ahead";
}
function plainAsk(path, q, { max = 2 } = {}) {
  const text = String(q.q || ""), opts = (q.options || []).slice(0, max);
  let ask = text, labels = opts.map((o) => o.replace(PATHISH, "a file"));
  if (opts.some((o) => /allowlist\.proposed/i.test(o))) {
    let rules = []; try { const p = JSON.parse(readFileSync(join(path, ".symbiot", "allowlist.proposed.json"), "utf8")).permissions || {}; rules = [...new Set([...(p.allow || []).map(PLAIN_RULE), ...(p.additionalDirectories || []).map((d) => `work in ${base(d)}`)])]; } catch {}
    ask = `${text.replace(PATHISH, "a file")}${rules.length ? ` It wants to ${rules.slice(0, 6).join(", ")}${rules.length > 6 ? `, and ${rules.length - 6} more things` : ""}.` : ""} If you say no, it skips that part and tells you what it left out.`;
    labels = opts.map((o) => (/allowlist\.proposed/i.test(o) ? "Allow" + (/recommended/i.test(o) ? " (recommended)" : "") : o.replace(PATHISH, "a file")));
  }
  // One option is one button, named for what it does: "🤖 Agent: send it to Remy now" is Send, so a
  // card that waits only on the go-ahead ("nothing goes out until you tap Send") reads as that (19 Oct 2026).
  if (opts.length === 1 && !(q.options || [])[1]) labels = [oneButton(opts[0])];
  // A sign-in ask where signing in isn't what's in the way (chromegate.mjs signInNotNeeded): acting on that site in the
  // user's Chrome is switched off, so the card asks for that switch and its first choice turns it on (agents.mjs
  // answerQuestions); or the site was open signed in lately, and the card says so. The user signed LinkedIn in twice
  // for a card like that and was still asked (21 Oct 2026).
  // Its context loses the sentences saying the site is signed out or wants a password: they're what's wrong with it.
  let n = null, context; try { n = signInNotNeeded([text, q.context].join("\n")); } catch {}
  if (n && n.off && opts.length) { ask = `Should agents click and type on ${n.host} in your Chrome? What stops the agent there is Symbiot's own setting, not a sign-in: ${SETTING(n.host)}. Yes switches it on, and the agent carries on.`; labels = [`Switch it on for ${n.host}${/recommended/i.test(opts[0]) ? " (recommended)" : ""}`, ...labels.slice(1)]; }
  else if (n && !n.off) ask = `${text} (No sign-in needed: ${n.host} was open signed in in your Chrome ${Math.max(1, Math.round((Date.now() - n.at) / 60000))} min ago.)`;
  if (n && q.context) { const c = String(q.context).split(/(?<=[.!?])\s+/).filter((s) => !/\b(?:sign(?:ed)?|log(?:ged)?)[ -]?(?:in|out)\b|\bpassword\b/i.test(s)).join(" "); if (c !== q.context) context = c; }
  // A Go card on a held press in the user's Chrome (chrome-go-<hold>): its buttons name the press and its no
  // (Send / Don't send, Pay R 289 / Don't pay), and go carries the hold's own line (where, and what's pressed)
  // and the money line, so the user agrees to what will be pressed, not to the agent's heading (26 Oct 2026).
  const gm = String(q.id || "").match(/^chrome-go-([0-9a-f]+)$/);
  let go = null; if (gm) try { const h = holdOf(gm[1]), w = goWords(h, `${text}\n${q.context || ""}`); if (w) go = goCard(w, h, q); } catch {}
  if (go && opts.length === 2) labels = [go.button, go.dont];
  // raw: the question as the agent wrote it, the key its answer is saved under (agents.mjs
  // answerQuestions). Sending the plain words back matched nothing, so a permission card's
  // Allow, and Send under it, did nothing at all (whatsapp_module, 2026-10-12).
  const shown = ask.replace(PATHISH, "a file");
  return { q: shown, ...(shown !== text ? { raw: text } : {}), ...(labels.some((l, i) => l !== opts[i]) ? { labels } : {}), ...(context != null ? { context } : {}), ...(go ? { go } : {}) };
}
// What a Go card shows besides its heading: the hold's line, and for a payment the money said plainly (the
// agent's own sentence about it if it wrote one, else the amount). Home showed that only on the Workdesk.
function goCard(w, h, q) {
  const said = String(q.context || "").split(/(?<=[.!?])\s+/).find((x) => /\b(?:hold|charge|charges|money|costs?)\b/i.test(x)) || "";
  const money = w.kind === "pay" ? said || (w.amount ? `It pays ${w.amount}.` : "It pays money from your account or card.") : "";
  return { id: w.id, kind: w.kind, line: w.line, button: w.button, dont: w.dont, given: w.given, state: holdState(h), ...(money ? { money } : {}) };
}

export { PATHISH, PLAIN_RULE, plainAsk };
