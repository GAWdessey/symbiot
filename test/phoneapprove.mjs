// An Approve from the phone that meets an agent still at work, or an Approve already going, waits and goes
// then (phone.mjs retryApprovals), instead of "failed" all day on Home; and Home shows a failure only while
// it's news (23 Oct 2026). Isolated HOME.
//
//   node test/phoneapprove.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-phoneapprove-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const P = await import("../phone.mjs");
const applied = join(CFG, "phone-applied.json"), read = () => JSON.parse(readFileSync(applied, "utf8")).approvals;
const settle = () => new Promise((r) => setTimeout(r, 50));
try {
  const work = (extra = {}) => ({ repo: "shop", path: "/w/shop", tasks: [{ id: "t1", text: "Fix it" }], files: [], ...extra });
  const sum = P.approveSum(work());
  const now = Date.now();
  writeFileSync(applied, JSON.stringify({ ids: {}, approvals: [
    { id: "a", repo: "shop", phone: "Phone", at: now - 600000, sum, status: "waiting", why: "its agent finishes" },
    { id: "b", repo: "cafe", phone: "Phone", at: now - 600000, sum: "old", status: "waiting", why: "its agent finishes" },
    { id: "c", repo: "gone", phone: "Phone", at: now - 600000, sum: "x", status: "waiting", why: "its agent finishes" },
  ] }));
  const calls = []; P.setPhoneApprove(async (repo) => { calls.push(repo); return { ok: true, pr: "https://github.com/acme/shop/pull/9" }; });
  console.log("WAITING — it goes once nothing's in the way, if the work is what the phone showed");
  let r = await P.retryApprovals({ now, pending: [work({ running: true }), { repo: "cafe", path: "/w/cafe", tasks: [{ id: "t9" }], files: [] }] });
  ok("the agent still at work: it keeps waiting; the work changed meanwhile: not approved, and says so; nothing left there: dropped without a word", calls.length === 0 && read().find((x) => x.id === "a").status === "waiting" && read().find((x) => x.id === "b").status === "failed" && /changed while it waited/.test(read().find((x) => x.id === "b").error) && read().find((x) => x.id === "c").status === "gone", read());
  r = await P.retryApprovals({ now: now + 60000, pending: [work()] }); await settle();
  ok("the agent's done: it's approved, the same Approve as the button, with its PR", calls.join() === "shop" && read().find((x) => x.id === "a").status === "approved" && /pull\/9/.test(read().find((x) => x.id === "a").pr), [r, read()]);
  writeFileSync(applied, JSON.stringify({ ids: {}, approvals: [{ id: "d", repo: "shop", phone: "Phone", at: now - 7 * 3600000, sum, status: "waiting", why: "its agent finishes" }] }));
  await P.retryApprovals({ now, pending: [work({ running: true })] });
  ok("still busy hours later: it gives up, saying why, rather than wait for ever", read()[0].status === "failed" && /still busy 6 hours later/.test(read()[0].error), read());
  P.setPhoneApprove(async () => ({ error: "An agent is still at work here: run 81f0 (deploy), since 08:08." }));
  writeFileSync(applied, JSON.stringify({ ids: {}, approvals: [{ id: "e", repo: "shop", phone: "Phone", at: now, sum, status: "waiting" }] }));
  await P.retryApprovals({ now, pending: [work()] }); await settle();
  ok("Approve itself finding an agent at work: back to waiting, not failed", read()[0].status === "waiting", read());

  console.log("ON HOME — a failure only while it's news");
  writeFileSync(applied, JSON.stringify({ ids: {}, approvals: [
    { id: "f1", repo: "shop", phone: "Phone", at: now - 3 * 3600000, done: now - 3 * 3600000, status: "failed", error: "old news" },
    { id: "f2", repo: "cafe", phone: "Phone", at: now - 600000, done: now - 600000, status: "failed", error: "fresh" },
    { id: "f3", repo: "bar", phone: "Phone", at: now - 900000, done: now - 900000, status: "failed", error: "then approved again" },
    { id: "f4", repo: "bar", phone: "Phone", at: now - 300000, status: "approved" },
    { id: "f5", repo: "deli", phone: "Phone", at: now - 300000, status: "gone" },
  ] }));
  const shown = P.phoneApprovals(now).map((x) => x.id);
  ok("an old failure, one approved again since, and one with nothing left to do aren't shown; a fresh one is", shown.join() === "f2,f4", shown);
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} phoneapprove: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
