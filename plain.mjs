// A question an agent left, in words for someone who doesn't code (plainAsk): Home,
// the Workdesk's agent blocks, a project's card and the phone all show it this way, so
// "allow the list in .symbiot/allowlist.proposed.json" never reaches a screen. It was
// only Home's list: the same ask on the Workdesk still read as a file (2026-10-12).
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
function plainAsk(path, q, { max = 2 } = {}) {
  const text = String(q.q || ""), opts = (q.options || []).slice(0, max);
  let ask = text, labels = opts.map((o) => o.replace(PATHISH, "a file"));
  if (opts.some((o) => /allowlist\.proposed/i.test(o))) {
    let rules = []; try { const p = JSON.parse(readFileSync(join(path, ".symbiot", "allowlist.proposed.json"), "utf8")).permissions || {}; rules = [...new Set([...(p.allow || []).map(PLAIN_RULE), ...(p.additionalDirectories || []).map((d) => `work in ${base(d)}`)])]; } catch {}
    ask = `${text.replace(PATHISH, "a file")}${rules.length ? ` It wants to ${rules.slice(0, 6).join(", ")}${rules.length > 6 ? `, and ${rules.length - 6} more things` : ""}.` : ""} If you say no, it skips that part and tells you what it left out.`;
    labels = opts.map((o) => (/allowlist\.proposed/i.test(o) ? "Allow" + (/recommended/i.test(o) ? " (recommended)" : "") : o.replace(PATHISH, "a file")));
  }
  // raw: the question as the agent wrote it, the key its answer is saved under (agents.mjs
  // answerQuestions). Sending the plain words back matched nothing, so a permission card's
  // Allow, and Send under it, did nothing at all (whatsapp_module, 2026-10-12).
  const shown = ask.replace(PATHISH, "a file");
  return { q: shown, ...(shown !== text ? { raw: text } : {}), ...(labels.some((l, i) => l !== opts[i]) ? { labels } : {}) };
}

export { PATHISH, PLAIN_RULE, plainAsk };
