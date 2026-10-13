// quota.mjs: the AI usage meter — read from the rate-limit reports in agent logs.
import { quotaState, isLimitError, resetIn, infosIn } from "../quota.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name, extra === undefined ? "" : JSON.stringify(extra)); } };

const now = Date.now(), dir = mkdtempSync(join(tmpdir(), "quota-")); mkdirSync(join(dir, ".symbiot"));
const reset5 = Math.floor((now + 3600000) / 1000), reset7 = Math.floor((now + 86400000) / 1000);
const ev = (status, five, seven, ts) => JSON.stringify({ type: "rate_limit_event", timestamp: new Date(ts).toISOString(), rate_limit_info: { status, resetsAt: reset5, rateLimitType: "five_hour", unifiedWindows: { five_hour: { utilization: five, resetsAt: reset5 }, seven_day: { utilization: seven, resetsAt: reset7 } } } });
const run = (lines) => { writeFileSync(join(dir, ".symbiot", "agent.log"), lines.join("\n") + "\n"); return quotaState({ providers: { claude: { label: "Claude" }, ollama: { label: "Local", local: true } }, current: { provider: "claude" }, paths: [dir], now }); };

try {
  console.log("THE USAGE METER — from Claude Code's own rate-limit report");
  let s = run([ev("allowed", 0.3, 0.1, now - 5000)]);
  const c = s.rows.find((r) => r.id === "claude");
  ok("a run's report: both windows, as percent, with reset times", s.level === "ok" && c.windows.length === 2 && c.windows[0].used === 30 && c.windows[1].used === 10 && c.windows[0].resetText, s);
  ok("not paused when there's room", s.paused === false && s.pausedText === "");
  ok("a local model has no quota", s.rows.find((r) => r.id === "ollama").kind === "local");
  s = run([ev("allowed_warning", 0.85, 0.1, now - 5000)]);
  ok("near the limit: amber", s.level === "near" && /85%/.test(s.text), s);
  s = run([ev("allowed", 0.9, 0.1, now - 9000), ev("rejected", 1, 0.17, now - 5000)]);
  ok("limit hit: red, 'Claude out until <time>', agents paused", s.level === "hit" && /^Claude out until \d\d:\d\d/.test(s.text) && s.paused && /paused/.test(s.pausedText), s);
  s = run([ev("rejected", 1, 0.17, now - 9000), ev("allowed", 0.1, 0.17, now - 5000)]);
  ok("a later good run clears the hit", s.level === "ok" && !s.paused, s);
  const old = JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: Math.floor((now - 60000) / 1000), rateLimitType: "five_hour", unifiedWindows: { five_hour: { utilization: 1, resetsAt: Math.floor((now - 60000) / 1000) } } } });
  s = run([old]);
  ok("a hit whose window has since reset is not a hit", s.level === "ok" && !s.paused, s);
  ok("a log line that isn't JSON is skipped", infosIn("x\n{bad\n", 1).length === 0);

  console.log("LIMITS SEEN IN A FAILED CALL");
  ok("429 / usage limit / quota messages are limits; other errors aren't", isLimitError("API Error: 429 rate_limit") && isLimitError("You've hit your limit") && isLimitError("insufficient_quota") && !isLimitError("connection refused"));
  const t = resetIn("You've hit your limit · resets 7pm", now);
  ok("'resets 7pm' becomes the next 19:00", new Date(t).getHours() === 19 && t > now, t);
  ok("'resets in 2 hours' and the old |epoch form", resetIn("resets in 2 hours", now) === now + 7200000 && resetIn("usage limit reached|1760000000", now) === 1760000000000);
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
