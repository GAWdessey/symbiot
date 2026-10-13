// Home's hands on the agents (mind.mjs "control"): stop one, cancel or move a task, answer or
// redirect an agent, fold a duplicate into the one that has the job. Until now Home could only
// start work, so it told Garth to click a card to stop an agent (2026-10-10, two agents on the
// same npm job). Stopping, cancelling and redirecting can all be undone, so none asks for a yes:
// what is hard to undo stays the agent's own question on the Workdesk.
// Every op gives { op, ok, said } or { op, error }, said in words for someone who doesn't code.
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stopRun, parkLane, answerQuestions, agentQuestions, runningHandoff, runHandoff } from "./agents.mjs";
import { loadTasks, saveTasks } from "./core.mjs";

const OPS = ["stop", "cancel", "redirect", "answer", "front", "merge"];
const clip = (s, n = 60) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

// "run:/path", "ask:/path", a bare path, or a lane's name -> the folder an agent works in
function pathOf(id, map = {}) {
  id = String(id || "").trim().replace(/^(run|ask):/, "");
  if (!id) return "";
  if (id.startsWith("/")) return id;
  const n = Object.keys(map).find((k) => k.toLowerCase() === id.toLowerCase());
  return n ? map[n] : "";
}
const taskOf = (id, tasks) => { id = String(id || "").replace(/^task:/, ""); return id ? tasks.find((t) => t && String(t.id) === id) : null; };
const noteTo = (path, heading, text) => {
  const f = join(path, ".symbiot", "ANSWERS.md"), day = new Date().toISOString().slice(0, 10);
  let prev = ""; try { prev = readFileSync(f, "utf8"); } catch {}
  mkdirSync(join(path, ".symbiot"), { recursive: true });
  writeFileSync(f, (prev || "# Answers from the user\nAnswers to the questions in QUESTIONS.md, newest last. Follow them; ask again in QUESTIONS.md if one is unclear.\n").replace(/\s*$/, "\n") + `\n### ${heading}\n${text}\n_answered ${day}_\n`);
};

// deps: map (lane -> folder), and stand-ins for the agent side, so a test needs no real run
function control(ops, deps = {}) {
  const map = deps.map || {}, stop = deps.stop || stopRun, park = deps.park || parkLane, running = deps.running || runningHandoff;
  const answer = deps.answer || answerQuestions, questions = deps.questions || ((p) => agentQuestions(p, "").questions), start = deps.start || ((p) => runHandoff(p, { force: true }));
  const load = deps.load || loadTasks, save = deps.save || saveTasks;
  const out = [];
  for (const o of (Array.isArray(ops) ? ops : []).slice(0, 5)) {
    const op = String((o && o.op) || "").toLowerCase();
    if (!OPS.includes(op)) continue;
    try { out.push({ op, ...one(op, o, clip(o.text, 1500)) }); } catch (e) { out.push({ op, error: (e && e.message) || String(e) }); }
  }
  return out;

  function halt(path, why) {
    if (!path) return { error: "I don't know which agent that is." };
    if (!running(path)) return { error: "no agent is running there, so there's nothing to stop." };
    if (!stop(path)) return { error: "I couldn't stop it." };
    park(path, true); // else its open tasks start it again at once; unparking brings it back
    return { ok: true, said: `Stopped ${why}. Its lane is paused so it doesn't start again by itself; its changes stay.` };
  }
  function one(op, o, text) {
    const tasks = load();
    if (op === "stop") {
      const t = taskOf(o.id, tasks), path = pathOf(o.id, map) || (t && t.repo ? map[t.repo] : "");
      return halt(path, clip(o.id, 40));
    }
    if (op === "cancel") {
      const t = taskOf(o.id, tasks); if (!t) return { error: "I can't find that task." };
      t.archived = true; t.archivedAt = Date.now(); t.dropped = true; save(tasks);
      return { ok: true, said: `Cancelled the task "${clip(t.text)}".` };
    }
    if (op === "front") {
      const i = tasks.findIndex((t) => t && String(t.id) === String(o.id || "").replace(/^task:/, "")); if (i < 0) return { error: "I can't find that task." };
      const [t] = tasks.splice(i, 1); t.first = Date.now(); tasks.unshift(t); save(tasks);
      return { ok: true, said: `Moved "${clip(t.text)}" to the front of ${t.repo ? t.repo + "'s" : "the"} queue.` };
    }
    if (op === "answer") {
      const path = pathOf(o.id, map); if (!path) return { error: "I don't know which agent that is." };
      if (!text) return { error: "there's no answer to give." };
      const q = questions(path)[0]; if (!q) return { error: "that agent isn't asking anything right now." };
      const r = answer(path, [{ q: q.q, a: text }]);
      return r && r.ok ? { ok: true, said: `Answered "${clip(q.q)}" for you.` } : { error: (r && r.error) || "the answer didn't go through." };
    }
    if (op === "redirect") {
      const path = pathOf(o.id, map); if (!path) return { error: "I don't know which agent that is." };
      if (!text) return { error: "there's no new instruction to give." };
      noteTo(path, "From Home: change of plan", text);
      const was = running(path);
      if (was && !stop(path)) return { error: "I wrote the new instruction down but couldn't stop the run, so it carries on as before." };
      // a stopped run's lane starts again by itself, and its next run reads the note first (agents.mjs resumeFor)
      const r = was ? null : start(path);
      return { ok: true, said: was ? "Stopped it and left the new instruction for its next run, which picks it up." : r && r.id ? "Left the new instruction and started it." : "Left the new instruction for its next run." };
    }
    if (op === "merge") {
      // o.id: the duplicate to stop, o.into: the one that keeps the job
      const path = pathOf(o.id, map), keep = pathOf(o.into, map);
      if (!keep) return { error: "I don't know which agent keeps the job." };
      if (path === keep) return { error: "those are the same agent." };
      const r = halt(path, clip(o.id, 40)); if (!r.ok) return r;
      noteTo(keep, "From Home: another agent was on the same job", `${clip(o.id, 80)} was doing the same job, so Home stopped it. This agent owns it: carry on, and don't ask the user the other agent's questions.`);
      return { ok: true, said: "Stopped the duplicate; the other agent owns the job." };
    }
    return { error: "unknown op" };
  }
}

export { control, OPS, pathOf };
