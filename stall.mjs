// A run that stops making progress, handled by Symbiot itself. On 19 Oct 2026 the symbiot
// lane's run sat for 30+ minutes on one check ("the rest of the path … with a one-option
// question") with 7 tasks queued behind it, and Home only labelled it "(no progress in
// 30 min)" until Garth shouted. The hang rule (agents.mjs runsTick) didn't see it: a run
// that thinks, or a long call's heartbeat, keeps its log growing.
// So, every minute (runsTick): a live run with no new step for STALL_MIN minutes, and
// nothing of its own still going (a call, a command it left running in the background),
// or one with a call or background command going and no step for the hang time, is
// stalled. The first time, it's stopped and started again once, fresh, with a note
// naming where it got stuck and telling it to skip that step (CARRYON.md, ANSWERS.md);
// its changes stay in the folder. If it stalls again, it's stopped, its lane is parked
// (else its queued tasks start the same stuck run), and Home shows one urgent card in
// "Only the user can do" naming the agent and what it stuck on, with Start it again /
// Leave it paused. The record is the folder's .symbiot/stall.json:
// { count, at, run, where, step, task, quiet, restart?, card? }.
import { join } from "node:path";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, appendFileSync } from "node:fs";

const STALL_FILE = "stall.json", STALL_MIN = 20, STALL_RESET = 6 * 3600000;
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };

function loadStall(path) { try { const o = JSON.parse(readFileSync(join(path, ".symbiot", STALL_FILE), "utf8")); return o && typeof o === "object" ? o : null; } catch { return null; } }
function saveStall(path, rec) { try { mkdirSync(join(path, ".symbiot"), { recursive: true }); writeFileSync(join(path, ".symbiot", STALL_FILE), JSON.stringify(rec)); } catch {} }
function clearStall(path) { try { unlinkSync(join(path, ".symbiot", STALL_FILE)); } catch {} }

// work: a parsed run (work.mjs parseRun). Minutes without a step once that's a stall, else 0.
function stalledFor(work, { now = Date.now(), startedAt = 0, stallMs = STALL_MIN * 60000, hangMs = 45 * 60000 } = {}) {
  if (!work || !work.stream || work.final) return 0; // a log with no steps in it (another agent's plain output): the hang rule's alone
  const moved = Math.max(Number(work.moved) || 0, Number(startedAt) || 0); if (!moved) return 0;
  const quiet = now - moved, busy = !!work.running || (work.bg || 0) > 0;
  return quiet > (busy ? hangMs : stallMs) ? Math.round(quiet / 60000) : 0;
}

// Where it got stuck, in its own words: what it said it was doing, its last step, the item it was on.
function whereStuck(work = {}, tasksMd = "") {
  const todo = (work.todos || []).find((t) => t.status === "in_progress");
  const said = (work.talk || [])[(work.talk || []).length - 1] || "";
  const last = (work.steps || [])[(work.steps || []).length - 1];
  const open = String(tasksMd || "").split("\n").find((l) => /^\s*-\s*\[ \]/.test(l));
  return {
    where: clip(todo ? todo.active : said || work.doing || "", 240) || "no step it named",
    step: last ? clip(`${last.verb || ""} ${last.target || ""}`, 160) : "",
    task: open ? clip(open.replace(/^\s*-\s*\[ \]\s*/, ""), 160) : "",
    said: String(said).slice(-3000),
  };
}

// The note the restarted run reads first (CARRYON.md), and a shorter one in ANSWERS.md, so a
// run that resumes instead of starting fresh sees it too.
function stallNote(rec) {
  return `# Where the last run got to\n\nThe last run made no progress for ${rec.quiet} minutes, so Symbiot stopped it and started this one fresh. Its changes are still in the folder: keep them.\n\n` +
    `- Where it got stuck: ${rec.where}\n${rec.step ? `- Its last step: ${rec.step}\n` : ""}${rec.task ? `- The item it was on: ${rec.task}\n` : ""}` +
    `\nSkip that step: don't redo the check it was on. Finish the item with what's there, say in your last message what's left unverified, then carry on with the next item.\n` +
    (rec.said ? `\nWhat it said last:\n\n${rec.said}\n` : "");
}
function answerNote(rec) {
  return `Your last run made no progress for ${rec.quiet} minutes, stuck on: ${rec.where}. Symbiot stopped it; its changes stay. Skip that step, finish the item with what you have, say what's left unverified, then carry on.`;
}
function noteAnswers(path, rec) {
  const f = join(path, ".symbiot", "ANSWERS.md"); let had = ""; try { had = readFileSync(f, "utf8"); } catch {}
  try { writeFileSync(f, `${(had || "# Answers\n").replace(/\s*$/, "")}\n\n### From Symbiot: your last run got stuck\n${answerNote(rec)}\n_answered ${new Date().toISOString().slice(0, 10)}_\n`); } catch {}
}

// A run found stalled: the record says whether to restart it (the first time) or to
// park the lane and ask (again). prev: the folder's record, if any; a stall long after
// the last one counts as a first.
function onStall(path, { work, tasksMd = "", run = "", quiet = 0, now = Date.now(), prev = loadStall(path) } = {}) {
  const again = !!prev && prev.count >= 1 && now - (prev.at || 0) < STALL_RESET;
  const rec = { count: again ? prev.count + 1 : 1, at: now, run, quiet, ...whereStuck(work, tasksMd) };
  if (again) rec.card = true; else rec.restart = true;
  saveStall(path, rec);
  try { appendFileSync(join(path, ".symbiot", "agent.log"), `\n=== stopped by Symbiot ${new Date(now).toISOString()}: no progress for ${quiet} minutes, stuck on: ${rec.where}${again ? "; it stalled before, so its lane is paused until you say" : "; it starts again once, skipping that step"} ===\n`); } catch {}
  if (!again) { try { writeFileSync(join(path, ".symbiot", "CARRYON.md"), stallNote(rec)); } catch {} noteAnswers(path, rec); }
  return rec;
}

// Each folder's stall record, for Home: card (stalled twice: its urgent card) and run (the run it stopped,
// which isn't a failed run to offer again). [{ path, card, run, where, step, task, quiet, at, count }]
function stallCards(paths = []) {
  const out = [];
  for (const p of new Set(paths)) { const r = loadStall(p); if (r) out.push({ path: p, card: !!r.card, run: r.run || "", where: r.where || "", step: r.step || "", task: r.task || "", quiet: r.quiet || 0, at: r.at || 0, count: r.count || 1 }); }
  return out;
}

const STALL_PROMPT_TAIL = " This is a fresh start because the last run got stuck and Symbiot stopped it, so read .symbiot/CARRYON.md first: where it got stuck and what to skip. Do not redo what it says is done, and do not retry the step it stuck on.";

export { STALL_FILE, STALL_MIN, STALL_RESET, loadStall, saveStall, clearStall, stalledFor, whereStuck, stallNote, onStall, stallCards, STALL_PROMPT_TAIL };
