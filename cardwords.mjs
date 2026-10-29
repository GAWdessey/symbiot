// symbiot — the words on Home's project cards (the relay, workscene.mjs lqRelay), in plain English.
// The cards showed what the agents wrote, as they wrote it: "Ran ssh -i ~/.ssh/stevevm …
// ubuntu@203.0.113.7 'sudo -n s…", a raw "[~]", lowercase states for pills ("waiting on third
// party") and "ops: Sent: its agent asked you something first" (the user's screenshot, 24 Oct 2026;
// the design spec of 25 Oct). What the agents write upstream is left as it is: this is the layer
// the card puts on it. The full command still shows in the agent's log, under Its agents.
//
// pillOf(p): one of the 7 pills. nowLine(text, ms, lane): what a running agent is doing, as a verb
// phrase with how long it's taken. plainSummary(text, lane): a summary with no commands, hosts,
// key paths or task-file marks. handWords(row): a handover row's own words, after "To <Lane>:".

const PILLS = ["Asks you", "Ready for your OK", "At work", "Waiting on someone else", "Paused", "Idle", "Done", "Unverified"];
const AMBER = new Set(["Asks you", "Ready for your OK"]);

// p: a project of workScene's: qs (its questions), ready, shipping, running, parked, state (its
// newest run's: "done", "paused", "failed", "waiting on <who>"), waiting (its open tasks).
function pillOf(p = {}) {
  if ((p.qs && p.qs.length) || p.asks) return "Asks you";
  if (p.ready || p.shipping) return "Ready for your OK";
  if (p.running || p.state === "at work") return "At work";
  if (p.state === "paused") return "Paused";
  if (p.blocker) return p.blocker;
  if (p.parked || (/^waiting on /.test(p.state || "") && p.state !== "waiting on you")) return "Waiting on someone else";
  if (p.state === "unverified" && !p.waiting) return "Unverified"; // it says done, nothing confirms it (evidence.mjs)
  if (p.state === "done" && !p.waiting) return "Done";
  return "Idle";
}

// A run's last words that name a step only the user can take on a pull request ("PR #612 … needs
// Garth's hand merge because auto-merge is refused"): "Needs your merge: PR #612", else "". A lane that
// handed its work over and is done reads this, not "Waiting on someone else" (28 Oct 2026).
function blockerOf(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  const pr = (t.match(/\bPR\s*#?(\d+)/i) || t.match(/\bpull request\s*#?(\d+)/i) || [])[1];
  if (!pr) return "";
  const mine = "(?:your|garth'?s|the user'?s)";
  const hand = new RegExp(`\\b(?:needs|need|waits? (?:on|for)|waiting (?:on|for)|requires?)\\s+${mine}\\s+(?:hand[- ])?merg`, "i");
  return hand.test(t) || /\bauto-?merge (?:is )?(?:refused|off|disabled|not allowed)\b/i.test(t) ? `Needs your merge: PR #${pr}` : "";
}

// How long it's taken: "4m", "1h 5m"; under a minute, nothing.
function took(ms) {
  const m = Math.floor((Number(ms) || 0) / 60000);
  if (m < 1) return "";
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
}

const IP = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;
const HOMEPATH = /(?:~|\$HOME|\/home\/[\w.-]+|\/Users\/[\w.-]+|\/root)\/[\w./-]*/;
// Signs a line is a command, not words: a pipe, a redirect, sudo, an ssh, a host, a key path, a flag
// after a tool's name, or "Ran …" (work.mjs describe: a Bash call).
const SHELLY = new RegExp(`^\\s*(?:ran|running)\\s+\\S|\\|\\s*\\w|\\d?>&\\d|\\s2>|&&|\\bsudo\\b|\\bssh\\b|${IP.source}|${HOMEPATH.source}|\\b[\\w-]+\\.(?:sh|py|mjs|js|json|log)\\b.*\\s-{1,2}\\w|^\\s*(?:npm|npx|node|git|gh|grep|rg|sed|awk|cat|ls|cd|curl|wget|pip|python3?|pytest|cargo|go|make|docker|systemctl|journalctl|tail|head|find|chmod|mkdir|rm|cp|mv|scp|rsync|kill|ps)\\s`, "i");
const looksShell = (s) => SHELLY.test(String(s || ""));

// Whose server an ssh reaches: the key's name (~/.ssh/steve_vm → Steve), else the lane's.
function serverOf(cmd, lane) {
  const k = String(cmd).match(/-i\s+(\S+)/), w = k ? k[1].replace(/['"]/g, "").split("/").pop().replace(/^id_/, "").replace(/[._-]?(?:vm|key|rsa|ed25519|pem|server)$/i, "").replace(/[._-]+/g, " ").trim() : "";
  const n = w && !/^(?:rsa|ed25519|ecdsa|dsa)$/i.test(w) ? w : String(lane || "").trim();
  return n ? `the ${n.charAt(0).toUpperCase()}${n.slice(1)} server` : "a server";
}
const owner = (lane) => { const n = String(lane || "").trim(); return n ? `${n.charAt(0).toUpperCase()}${n.slice(1)}${/s$/i.test(n) ? "'" : "'s"}` : "the"; };

// A command, as what it's for. Unknown: "Working".
function cmdWords(cmd, lane) {
  const c = String(cmd || "").replace(/^\s*(?:ran|running)\s+/i, "");
  if (/\b(?:ssh|scp|rsync)\b/.test(c) || IP.test(c)) return `Checking ${serverOf(c, lane)}`;
  if (/\b(?:npm (?:run )?test|npm t\b|node test\/|pytest|jest|vitest|mocha|cargo test|go test|gradlew? test|mvn test|flutter test)|"test"/.test(c)) return `Running ${owner(lane)} tests`;
  if (/\bgit\s+push\b/.test(c)) return "Pushing changes";
  if (/\bgh\s+pr\b/.test(c)) return "Working on a pull request";
  if (/\bgh\s/.test(c)) return "Checking GitHub";
  if (/\bgit\s+commit\b/.test(c)) return "Saving changes";
  if (/\bgit\s+(?:pull|fetch|rebase|merge)\b/.test(c)) return "Getting the latest changes";
  if (/\bgit\s/.test(c)) return "Looking at the changes";
  if (/\b(?:npm|pnpm|yarn|pip3?|cargo|apt(?:-get)?|brew)\s+(?:install|add|ci)\b/.test(c)) return "Installing packages";
  if (/\b(?:npm run build|vite build|tsc\b|gradlew? (?:assemble|build)|flutter build|make\b|cargo build|go build)/.test(c)) return "Building";
  if (/\b(?:curl|wget)\b/.test(c)) return "Checking a website";
  if (/\b(?:systemctl|journalctl|docker|pm2)\b/.test(c)) return "Checking a service";
  if (/^\s*(?:grep|rg|find|ls|cat|sed|awk|head|tail|wc)\b/.test(c)) return "Reading the code";
  return "Working";
}

// What a running agent is doing now, with how long it's taken: "Checking the Steve server · 4m".
// Words that aren't a command (a to-do's "Fixing the cards") stay as they are, with no host or path.
function nowLine(text, ms = 0, lane = "") {
  let s = String(text || "").replace(/[`*_#>]/g, "").replace(/\s+/g, " ").trim();
  s = !s || /^working on it\b/i.test(s) ? "Working" : looksShell(s) ? cmdWords(s, lane) : s.replace(/…$/, "");
  if (s.length > 90) s = s.slice(0, 89).replace(/\s+\S*$/, "") + "…";
  const t = took(ms);
  return t ? `${s} · ${t}` : s;
}

// Task-file marks in words: "[~]" → "marked as waiting", "[x]" → "ticked", "[ ]" → "open";
// a "ticked"/"marked" right before "[x]" folds into the one "ticked".
const plainMarks = (s) => String(s || "")
  .replace(/(?:\bmarked\s+(?:them\s+|it\s+|as\s+)?)?(?:`|")?\[~\](?:`|")?/gi, (m) => (/^marked/i.test(m) ? m.replace(/[`"]?\[~\][`"]?/, "as waiting").replace(/\bas\s+as\b/, "as") : "marked as waiting"))
  .replace(/(?:\b(?:ticked|marked)\s+(them\s+|it\s+)?(?:as\s+)?)?(?:`|")?\[[xX]\](?:`|")?/gi, (m, who) => (/^(?:ticked|marked)/i.test(m) ? `${/^M/.test(m) ? "Ticked" : "ticked"}${who ? " " + who.trim() : ""}` : "ticked"))
  .replace(/(?:`|")?\[ \](?:`|")?/g, "open");

// A summary with no commands, hosts, key paths or marks: a sentence that is a command becomes
// what it's for ("Ran grep … (npm test 2>&1 | tail -15)" → "Ran Symbiot's tests").
function plainSummary(text, lane = "") {
  const s = plainMarks(String(text || "").replace(/`/g, "")).replace(/\s+/g, " ").trim();
  if (!s) return "";
  const parts = s.split(/(?<=[.!?])\s+(?=[A-Z(])/);
  return parts.map((x) => {
    if (!looksShell(x)) return x;
    const bare = x.replace(/\s*\(([^()]*)\)/g, (m, inner) => (looksShell(inner) ? "" : m)).replace(/\s+([.!?])/g, "$1");
    if (bare.trim() && !looksShell(bare)) return bare.trim(); // "Tests pass (npm test 2>&1 | tail)." → "Tests pass."
    const w = cmdWords(x, lane), ran = /^\s*ran\s/i.test(x);
    return (ran ? w.replace(/^Checking/, "Checked").replace(/^Running/, "Ran").replace(/^Pushing/, "Pushed").replace(/^Working on/, "Worked on").replace(/^Reading/, "Read").replace(/^Working$/, "Ran a command") : w) + ".";
  }).join(" ").replace(/\s+/g, " ").replace(/\.\s*\./g, ".").trim();
}

// A handover row's words, after "To <Lane>:" (lanes.mjs handingOf gives its why). ask: the
// question is the user's, so the row ends "Answer ›".
function handWords(x = {}) {
  const why = String(x.why || "");
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  let w;
  if (/asked you something first/.test(why)) w = x.thenAsks ? `${cap(x.then)} has a question for you` : "it has a question for you";
  else if (/^Sent: its agent is on it now/.test(why)) w = "on it";
  else if (/^Sent: .* is on it now, and does what you added/.test(why)) w = "on it, and does what you added next";
  else if (/^Sent, and queued:/.test(why)) w = "queued behind the run it's on now";
  else if (/^Sent: .* is on the earlier version now/.test(why)) w = "on the earlier version, and gets this one next";
  else if (/starts on it when it's free/.test(why)) w = "starts on it when it's free";
  else if (/^Sent: its run ended/.test(why)) w = "done; what it did comes back shortly";
  else if (/^Sent, but it didn't start: /.test(why)) w = "it didn't start: " + lower(why.replace(/^Sent, but it didn't start: /, ""));
  else w = lower(why.replace(/^Sent:\s*/, "").replace(/^Sent,\s*/, ""));
  const bits = [plainSummary(w, x.lane).replace(/\.$/, "")];
  if (x.progress && x.progress.total) bits.push(`${x.progress.done} of ${x.progress.total} done`);
  if (x.doing) bits.push(lower(nowLine(x.doing, 0, x.then || x.lane)));
  return bits.filter(Boolean).join(" · ");
}
// A lane's name as people say it: a folder slug with no name of its own ("kaggle-squares-in-squares")
// reads "Kaggle squares in squares"; a name it has ("Billing API") stays as it is.
const laneName = (n) => { n = String(n || ""); return /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(n) ? cap(n.replace(/[-_]+/g, " ")) : n; };
const cap = (s) => { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); };

export { PILLS, AMBER, pillOf, blockerOf, nowLine, plainSummary, plainMarks, handWords, laneName, looksShell, took };
