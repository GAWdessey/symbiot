// Changes made in a lane's folder for a job it handed over (daaymn → ops) aren't "changes without
// a task" for Garth to approve: lanes.mjs ties them to the handoff and ships them by itself,
// unless they look like they hold a secret. Isolated HOME (set before the modules load).
//
//   node test/shiphanded.mjs
//
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-shiphanded-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { secretIn, shipHanded, handedLookup, HELD_HANDED } = await import("../lanes.mjs");
const now = Date.now(), P = "/p/daaymn";
const row = (o = {}) => ({ id: "h1", from: { lane: "daaymn", path: P }, to: { lane: "ops", path: "/o/act-1" }, text: "New job: install a JDK so keytool works\nmore", at: now - 3600000, status: "started", ...o });
const entry = (files, o = {}) => ({ repo: "daaymn", path: P, untasked: true, tasks: [], files: files.map((f) => ({ st: "M", file: f })), ...o });
const never = () => false;

try {
  console.log("SECRETS — what stays with the user");
  ok("a plain build file is fine", secretIn([{ file: "android/app/build.gradle" }], "+ minSdk 23\n") === "");
  ok("a keystore or .env file is held", !!secretIn([{ file: "android/upload.jks" }], "") && !!secretIn([{ file: "a/.env.local" }], ""));
  ok("a private key in the diff is held", !!secretIn([{ file: "x.txt" }], "+-----BEGIN RSA PRIVATE KEY-----\n"));
  ok("a password set to a real value is held", !!secretIn([{ file: "x.gradle" }], "+storePassword = hunter2hunter2\n"));
  ok("a password read from the environment is not", secretIn([{ file: "x.gradle" }], "+storePassword = System.getenv(\"X\")\n") === "");

  console.log("HANDED — changes tied to the handoff, then shipped");
  const ledger = { handoffs: [row()] };
  ok("the lookup names the handoff", handedLookup(P, { files: [] }, { ledger, now }).to === "ops" && /install a JDK/.test(handedLookup(P, { files: [] }, { ledger, now }).text));
  ok("none from another lane, or older than a week", handedLookup("/p/other", {}, { ledger, now }) === null && handedLookup(P, {}, { ledger: { handoffs: [row({ at: now - 8 * 864e5 })] }, now }) === null);

  const shipped = [];
  const ship = async (repo, o) => { shipped.push([repo, o]); return { pr: "https://x/pr/1", commit: "abc" }; };
  let r = await shipHanded({ review: () => [entry(["pubspec.yaml"])], ship, diff: () => "+x", running: never, ledger, now });
  ok("clean changes go up with auto-merge", shipped.length === 1 && shipped[0][1].autoMerge === true && r[0].pr, { shipped, r });

  shipped.length = 0;
  r = await shipHanded({ review: () => [entry(["pubspec.yaml"])], ship, diff: () => "+x", running: (p) => p === "/o/act-1", ledger, now });
  ok("not while the ops run is still going", !shipped.length && !r.length);

  r = await shipHanded({ review: () => [entry(["pubspec.yaml"])], ship, diff: () => "+x", running: never, ledger: { handoffs: [] }, now });
  ok("changes no handoff made are left alone", !shipped.length && !r.length);

  r = await shipHanded({ review: () => [entry(["key.properties"])], ship, diff: () => "", running: never, ledger, now });
  ok("a secret-looking file is held, not shipped", !shipped.length && r[0].held, r);
  ok("…and the card says why", /check it before it goes up/.test(handedLookup(P, { files: [{ st: "M", file: "key.properties" }] }, { ledger, now }).held));
  HELD_HANDED.clear();

  const bad = async () => ({ error: "tests failed" });
  r = await shipHanded({ review: () => [entry(["a.txt"])], ship: bad, diff: () => "", running: never, ledger, now });
  r = await shipHanded({ review: () => [entry(["a.txt"])], ship: bad, diff: () => "", running: never, ledger, now: now + 1000 });
  ok("a failed ship is tried once, then waits (and shows on Home)", r.length === 0 && /tests failed/.test(handedLookup(P, { files: [{ st: "M", file: "a.txt" }] }, { ledger, now }).held));
} finally { /* tmp HOME left to the OS */ }
console.log((fail ? "✗" : "✓") + " shiphanded: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
