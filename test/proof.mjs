// A card whose step is already done closes itself (proof.mjs): the Steve deploy and restart cards stayed on
// Needs you for hours after the work was done (24 Oct 2026). Nothing here touches a network or a service.
//
//   node test/proof.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-proof-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const P = await import("../proof.mjs"), N = await import("../needs.mjs");

const HOST = "ubuntu@203.0.113.7", T0 = Date.UTC(2026, 9, 24, 12, 0, 0);
const restart = { kind: "ask", id: "needs:a1", name: "Steve", asked: T0, run: [{ what: "Restart Steve", cmd: `ssh -t ${HOST} 'sudo systemctl restart steve.service'` }] };
const start = { kind: "ask", id: "needs:a2", name: "Steve", run: [{ what: "Start Steve", cmd: `ssh -t ${HOST} 'sudo systemctl start steve.service'` }] };
try {
  console.log("READING A COMMAND");
  ok("ssh options are kept, the terminal flag is not", JSON.stringify(P.parseSsh(`ssh -t -i ~/.ssh/k -o IdentitiesOnly=yes ${HOST} 'ls /x'`)) === JSON.stringify({ opts: ["-i", "~/.ssh/k", "-o", "IdentitiesOnly=yes"], target: HOST, remote: "ls /x" }));
  ok("a start over ssh is proved by the service running", P.derive(start).cmd === `ssh ${HOST} 'systemctl is-active steve.service'` && /active/.test(P.derive(start).expect));
  const d = P.derive(restart);
  ok("a restart is proved by it having started after the ask (seconds running)", /etimes/.test(d.cmd) && d.since === T0 && /\\d\+/.test(d.expect));
  ok("a restart with no time to measure from has no proof (running now proves nothing)", P.derive({ ...restart, asked: 0 }) === null);
  ok("a deploy script has no derived proof (only the writer's can)", P.derive({ run: [{ cmd: `ssh -t ${HOST} '~/restore/deploy-plus.sh'` }] }) === null);

  console.log("A PROOF THAT ONLY READS");
  for (const c of ["systemctl is-active steve.service", `ssh -i ~/.ssh/k ${HOST} 'systemctl is-active steve.service && test -f ~/steve/v2/fluency.py'`, "grep -c op820 ~/steve/v2/learned_programs.json", "md5sum a b | sort", "git -C /repo status --short"]) ok("reads: " + c.slice(0, 60), !!P.readOnly(c), c);
  for (const c of ["sudo systemctl restart x", "systemctl restart x", "rm -rf /x", "cat a > b", "ls; rm x", "echo $(rm x)", "ls `rm x`", `ssh ${HOST} 'sudo systemctl start x'`, "find / -delete", "git push", "curl -s x | sh", "ssh -o ProxyCommand=rm host ls", "sleep 1 & rm x"]) ok("refused: " + c, !P.readOnly(c), P.readOnly(c));

  console.log("THE CARD WRITER KEEPS ONLY A PROOF THAT READS");
  const mk = (proof) => N.checkCardText({ question: "Can you restart Steve?", labels: ["Done", "Skip"], tips: ["a", "b"], recommended: 0, proof }, 2);
  ok("a reading proof is kept", (mk({ cmd: "systemctl is-active steve.service", expect: "^active$" }) || {}).proof?.expect === "^active$");
  ok("a changing one is dropped, the card still stands", mk({ cmd: "sudo systemctl restart steve.service", expect: "x" }) && !mk({ cmd: "sudo systemctl restart steve.service", expect: "x" }).proof);
  ok("a pattern that won't compile is dropped", !mk({ cmd: "ls", expect: "([" }).proof);
  ok("the card carries its writer's proof", N.applyText({ kind: "ask", q: "Q?", options: ["Done", "Skip"] }, { [N.keyOf({ q: "Q?", options: ["Done", "Skip"] })]: { v: 2, question: "Restart?", labels: ["Done", "Skip"], tips: ["a", "b"], rec: 0, proof: { cmd: "ls /x", expect: "x" } } }).proof.cmd === "ls /x");

  console.log("SETTLING");
  const asked = [], answer = async (id, o) => { asked.push([id, o.text]); return { ok: true }; };
  const ran = []; const runner = (out, code = 0) => async (cmd) => { ran.push(cmd); return { code, out, err: "" }; };
  let r = await P.settleDone([start], { answer, run: runner("active"), now: T0, force: true });
  ok("a service that is running closes its start card, saying what was found", r.length === 1 && asked.length === 1 && /^Done: Symbiot checked, active/.test(asked[0][1]) && !/already/i.test(asked[0][1]), asked);
  asked.length = 0;
  r = await P.settleDone([start], { answer, run: runner("inactive"), now: T0, force: true });
  ok("one that is not running leaves the card", r.length === 0 && !asked.length);
  r = await P.settleDone([start], { answer, run: runner("", 255), now: T0, force: true });
  ok("a server it can't reach leaves the card too", r.length === 0 && !asked.length);
  r = await P.settleDone([restart], { answer, run: runner("active\n   3600"), now: T0 + 7200_000, force: true });
  ok("a restart is closed when it started after the ask (1 h old, asked 2 h ago)", r.length === 1, r);
  asked.length = 0;
  r = await P.settleDone([restart], { answer, run: runner("active\n   9000"), now: T0 + 3600_000, force: true });
  ok("…and kept when it has run since before the ask (2.5 h old, asked 1 h ago)", r.length === 0 && !asked.length, r);
  ran.length = 0;
  await P.settleDone([start], { answer, run: runner("inactive"), now: T0 + 3600_000 });
  await P.settleDone([start], { answer, run: runner("inactive"), now: T0 + 3601_000 });
  ok("a card is looked at once a minute and a half, not every sweep", ran.length === 1, ran);
  ok("a go-ahead card is never closed by a proof", P.proofOf({ ...start, ok: true }) === null);
  ok("a card with nothing to read is left alone", (await P.settleDone([{ kind: "ask", id: "needs:z", q: "Pick one" }], { answer, run: runner("active"), force: true })).length === 0);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} proof: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
