// symbiot — done is checked, not said. An agent ticks `- [x]` when it says an item is done, and until
// now the tick was the whole story: Approve, the goal and every card took it as done. The 22 Oct 2026
// "Not finished" report on an overview said the run couldn't confirm the file it had ticked; sends were
// ticked with nothing showing they went; code was ticked with its tests never run. So each item a run
// newly ticks is checked, at its end, against what its own log shows it did (the commands it ran and
// what came back, the files it wrote):
// - code (a repo's lane): it changed files, and the repo's tests ran after its last edit and passed;
// - a send (a message, email, post or reply going out): a check that it landed (`symbiot screens
//   verify`, or a connector's send that came back without an error);
// - a deploy: a check of the live address after the last command that deployed;
// - anything else (finding out, a report, a draft, UI work: the design critic has that): as said.
// An item that fails is reopened with what's missing, and its run starts again on it; after ROUNDS it
// waits on the user ([~]), saying what couldn't be confirmed. Kept in the folder's .symbiot/done-check.json.
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const FILE = "done-check.json", ROUNDS = 2;
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
const checksOf = (path) => readJson(join(path, ".symbiot", FILE), {}) || {};
function saveChecks(path, c) { try { mkdirSync(join(path, ".symbiot"), { recursive: true }); writeFileSync(join(path, ".symbiot", FILE), JSON.stringify(c, null, 1)); } catch {} }
// An item's words without its mark and any note Symbiot added to it.
const itemKey = (l) => String(l || "").replace(/^\s*[-*+]\s*\[[ xX~]\]\s*/, "").replace(/\s+—\s+(?:not done yet|UI review \(round \d\))[\s\S]*$/, "").trim().slice(0, 200);
const ticked = (md) => String(md || "").split("\n").filter((l) => /^\s*[-*+]\s*\[[xX]\]/.test(l)).map(itemKey).filter(Boolean);

// What a run's log shows it did: { commands: [{ cmd, out, error, at }], tools: [{ name, input, out, error }], edits: [paths] }.
const resultText = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x && typeof x.text === "string" ? x.text : "")).join("\n") : "");
function evidenceOf(log) {
  const calls = new Map(), out = { commands: [], tools: [], edits: [], said: "" };
  for (const l of String(log || "").split("\n")) {
    if (!l.startsWith("{")) continue;
    let e; try { e = JSON.parse(l); } catch { continue; }
    const content = e.message && Array.isArray(e.message.content) ? e.message.content : [];
    if (e.type === "assistant") for (const b of content) {
      if (b.type === "text" && b.text) out.said = String(b.text).slice(0, 4000); // the run's last words
      if (b.type !== "tool_use") continue;
      const inp = b.input || {}, rec = { name: String(b.name || ""), input: inp, out: "", error: false, i: calls.size };
      calls.set(b.id, rec);
      if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(rec.name)) out.edits.push({ file: String(inp.file_path || inp.notebook_path || ""), i: rec.i });
    }
    if (e.type === "user") for (const b of content) {
      if (b.type !== "tool_result") continue;
      const rec = calls.get(b.tool_use_id); if (!rec) continue;
      rec.out = resultText(b.content).slice(0, 4000); rec.error = !!b.is_error;
    }
  }
  for (const rec of calls.values()) {
    if (rec.name === "Bash") out.commands.push({ cmd: String(rec.input.command || ""), out: rec.out, error: rec.error, i: rec.i });
    else if (!/^(Edit|Write|MultiEdit|NotebookEdit|Read|Grep|Glob|TodoWrite|TaskCreate|TaskUpdate|TaskList|TaskGet|ToolSearch)$/.test(rec.name)) out.tools.push({ name: rec.name, out: rec.out, error: rec.error, i: rec.i });
  }
  return out;
}

// What kind of item it is, from its words and where it runs.
const SEND = /\b(send|sends|sent|email|e-mail|reply|replies|post|posts|publish|message|whatsapp|dm|invite|forward)\b/i;
const NOT_OUT = /\b(draft|drafts|drafted|prepare|write up|unsent|don't send|do not send|not send)\b/i;
const DEPLOY = /\b(deploy|deploys|deployed|redeploy|go live|goes live|put (?:it |them )?live|release to|roll out|ship (?:it )?to (?:prod|production|the server))\b/i;
const LOOK = /^\s*(?:find out|look into|investigate|check|audit|research|report|explain|why|work out|figure out|list|read|review|summari[sz]e|write (?:a|the) (?:report|summary|note|plan))\b/i;
// In a repo's lane a send is an item that starts by sending: "two older replies still start a learning goal"
// (Steve) and "sends back 1 line" (gamerepo) are code that mentions replies, and judged as sends they were
// reopened for a `screens verify` no code change can give, then run again in copy after copy (24 Oct 2026).
const SEND_LEAD = /^\s*(?:(?:agent|now|then|please)\s*:\s*)?(?:send|email|e-mail|reply|post|publish|message|whatsapp|dm|invite|forward)\b/i;
function kindOf(item, { ops = false } = {}) {
  const t = String(item || "");
  if (LOOK.test(t)) return "look";
  if (DEPLOY.test(t)) return "deploy";
  if ((ops ? SEND : SEND_LEAD).test(t) && !NOT_OUT.test(t)) return "send";
  if (NOT_OUT.test(t)) return "draft";
  return ops ? "other" : "code";
}

// The evidence an item of that kind needs, read from the run: { ok } or { ok: false, missing }.
const TEST_CMD = /\b(npm (?:run )?test|pnpm (?:-r )?test|yarn test|node --test|node test\/|pytest|go test|cargo test|gradle\w* test|\.\/gradlew \w*test|mvn test|make test|vitest|jest|bun test)\b/i;
// `symbiot screens verify`, or the same through node: `node $S screens verify` was the check that landed, and
// missed, the Kaggle, Sonora and Fly.io sends were reopened and their runs sent them again (24 Oct 2026)
const VERIFY_CMD = /\bscreens\s+verify\b/;
// A code item ticked with no change, saying why (on the item, or in the run's last words): the brief tells a run to tick what's already done or no
// longer applies with a one-line note, and reopening it ran the same item again (gamerepo's Meadow Zone)
const ALREADY = /\b(already (?:done|in|there|built|fixed|merged|applied|ticked|in place|in the code)|no longer appl(?:y|ies)|nothing (?:needed|left) to (?:change|do)|no (?:code )?change(?:s)? (?:was |were )?needed|needed no (?:code )?change)/i;
const SENT_TOOL = /send|reply|post|publish|forward|create_comment|comment/i;
const DEPLOY_CMD = /\b(ssh|scp|rsync|kubectl|docker (?:compose|push)|fly deploy|vercel|netlify deploy|wrangler (?:deploy|publish)|gh workflow run|symbiot deploy)\b/;
const LIVE_CMD = /\b(curl|wget|http|symbiot\s+screens\s+(?:verify|show|read)|symbiot deploy (?:check|show))\b|https?:\/\//;
function failedTests(c) { const m = String(c.out).match(/(\d+)\s+failed/); return c.error || (m && +m[1] > 0) || /\b(FAIL|Tests failed|failing)\b/.test(c.out) && !/\b0 failed\b/.test(c.out); }
function judge(item, ev, { ops = false, hasTests = false, changed = 0 } = {}) {
  const kind = kindOf(item, { ops });
  if (kind === "look" || kind === "draft" || kind === "other") return { ok: true, kind };
  if (kind === "send") {
    const v = ev.commands.find((c) => VERIFY_CMD.test(c.cmd) && !c.error && !/\b(not found|missing|didn't find|no match)\b/i.test(c.out));
    const t = ev.tools.find((x) => /^mcp__/.test(x.name) && SENT_TOOL.test(x.name.split("__").pop()) && !/draft/i.test(x.name) && !x.error);
    return v || t ? { ok: true, kind } : { ok: false, kind, missing: "nothing in the run shows it went out. Don't send it again before you look: it may have gone. Check it landed with `symbiot screens verify <the page> --expect \"<words from it>\"` (or show the connector's send that came back without an error), then tick it." };
  }
  if (kind === "deploy") {
    const last = Math.max(-1, ...ev.commands.filter((c) => DEPLOY_CMD.test(c.cmd)).map((c) => c.i));
    const live = ev.commands.find((c) => c.i > last && LIVE_CMD.test(c.cmd) && !c.error);
    return last >= 0 && live ? { ok: true, kind } : { ok: false, kind, missing: last < 0 ? "nothing in the run deployed it. Deploy it, then check the live address answers as it should, then tick it." : "nothing checked the live address after the deploy. Check it answers as it should (curl it, or `symbiot screens verify <address> --expect \"<words>\"`), then tick it." };
  }
  // code
  if (!changed && !ev.edits.length && (ALREADY.test(item) || ALREADY.test(ev.said || ""))) return { ok: true, kind, already: true };
  if (!changed && !ev.edits.length) return { ok: false, kind, missing: "the run changed no files. Make the change (or, if nothing needed changing because it is already done or no longer applies, tick it with a one-line note on the item saying so), then tick it." };
  if (!hasTests) return { ok: true, kind };
  const lastEdit = Math.max(-1, ...ev.edits.map((x) => x.i)), runs = ev.commands.filter((c) => TEST_CMD.test(c.cmd) && c.i > lastEdit);
  if (!runs.length) return { ok: false, kind, missing: "the tests weren't run after the last change. Run them, fix what fails, then tick it." };
  return failedTests(runs[runs.length - 1]) ? { ok: false, kind, missing: "the last test run after the change failed. Fix what fails, run them again, then tick it." } : { ok: true, kind };
}

// The check already on record for this item: under its own words, or under its words before the run that
// re-ticked it added a note ("— verified: …"). Keyed by the words alone, each re-tick was a first round,
// so ROUNDS was never reached and Sonora's send ran four times (24 Oct 2026).
const base = (k) => String(k || "").toLowerCase().replace(/\s+/g, " ").trim();
function priorKey(all, item) {
  if (all[item]) return item;
  const b = base(item); let best = "";
  for (const k of Object.keys(all)) { const kb = base(k); if (kb.length >= 20 && (b.startsWith(kb) || kb.startsWith(b)) && k.length > best.length) best = k; }
  return best;
}
// At a run's end: each item it newly ticked, checked. before: the items ticked when it started.
// Rewrites TASKS.md for the ones that fail and returns { checked, reopened, waiting, md }.
function settleDone(path, { log = "", before = [], ops = false, hasTests = false, changed = 0, md = null, now = Date.now() } = {}) {
  const f = join(path, ".symbiot", "TASKS.md");
  let text = md != null ? md : (() => { try { return readFileSync(f, "utf8"); } catch { return ""; } })();
  const fresh = ticked(text).filter((t) => !before.includes(t)), out = { checked: [], reopened: [], waiting: [] };
  if (!fresh.length) return { ...out, md: text };
  const ev = evidenceOf(log), all = checksOf(path);
  for (const item of fresh) {
    const v = judge(item, ev, { ops, hasTests, changed });
    const prior = priorKey(all, item), r = all[prior] || { rounds: 0 };
    if (prior && prior !== item) delete all[prior]; // the same item, re-ticked with a note of its own: its rounds go on
    if (v.ok) { all[item] = { ...r, ok: true, kind: v.kind, at: now }; out.checked.push(item); continue; }
    const lines = text.split("\n"), at = lines.findIndex((l) => /^\s*[-*+]\s*\[[xX]\]/.test(l) && itemKey(l) === item);
    if (r.rounds + 1 < ROUNDS) { if (at >= 0) lines[at] = `- [ ] ${item} — not done yet: ${v.missing}`; out.reopened.push(item); }
    else { if (at >= 0) lines[at] = `- [~] (waits on the user: Symbiot couldn't confirm it's done after ${ROUNDS} tries: ${v.missing.split(". ")[0]}) ${item}`; out.waiting.push(item); }
    all[item] = { rounds: r.rounds + 1, kind: v.kind, missing: v.missing, at: now };
    text = lines.join("\n");
  }
  if (md == null && (out.reopened.length || out.waiting.length)) try { writeFileSync(f, text); } catch {}
  saveChecks(path, all);
  return { ...out, md: text };
}

export { evidenceOf, kindOf, judge, settleDone, ticked, itemKey, checksOf, ROUNDS, FILE };
