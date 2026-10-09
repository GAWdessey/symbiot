// Symbiot Free and Pro (licence.mjs) and the issuing script (scripts/licence.mjs):
// genuine, forged, damaged, ended and cancelled keys; the trial; what Free stops; and
// Symbiot refusing to work on its own code (but not for the owner).
// Its own key pair (never Ghost AI's) and an isolated HOME.
//
//   node test/licence.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-licence-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
delete process.env.SYMBIOT_OWNER; // run from an owner's agent run, it's set: the guard's checks need it off
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
const ISSUER = join(HOME, "issuer"); mkdirSync(ISSUER);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
writeFileSync(join(ISSUER, "signing-key.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));
process.env.SYMBIOT_LICENCE_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" });
process.env.SYMBIOT_REVOKED_URL = "http://127.0.0.1:9/none"; // nothing there: refreshing never reaches the real site
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const issue = (...a) => { const r = spawnSync(process.execPath, [join(REPO, "scripts", "licence.mjs"), "issue", "--json", ...a], { encoding: "utf8", env: { ...process.env, SYMBIOT_ISSUER_DIR: ISSUER } }); return JSON.parse(r.stdout || "{}"); };
const DAY = 86400000;

try {
  const L = await import("../licence.mjs");
  const { loadConfig, saveConfig } = await import("../core.mjs");
  const reset = (licence) => { const c = loadConfig(); c.licence = licence; saveConfig(c); };

  console.log("KEYS — signed by Ghost AI, checked offline");
  const pro = issue("--email", "ann@example.com", "--name", "Ann B", "--months", "12");
  const k = L.readKey(pro.key);
  ok("a Pro key from the issuing script is genuine", k.ok && k.plan === "pro" && k.email === "ann@example.com" && k.name === "Ann B", k);
  ok("…and ends in 12 months", Math.abs(k.expires - Date.now() - 365 * DAY) < 3 * DAY, k.expires);
  ok("pasted with line breaks and spaces, still genuine", L.readKey(pro.key.replace(/(.{40})/g, "$1\n  ")).ok);
  const [body, sig] = pro.key.slice(5).split(".");
  const forged = "SYM1-" + Buffer.from(JSON.stringify({ v: 1, id: "x", p: "owner", e: "me@x", i: 0, x: 0 })).toString("base64url") + "." + sig;
  ok("a key someone wrote themselves: not Ghost AI's", /wasn't issued by Ghost AI/.test(L.readKey(forged).why || ""), L.readKey(forged));
  ok("a key with its end date edited: refused", !L.readKey("SYM1-" + body.slice(0, -2) + "AA." + sig).ok);
  ok("not a key at all: says what one looks like", /starts with SYM1-/.test(L.readKey("hello").why || ""));
  const { publicKey: otherPub, privateKey: otherPriv } = generateKeyPairSync("ed25519"); void otherPub; void otherPriv;

  console.log("THE TRIAL — 14 days of Pro, from the first run");
  reset({});
  const t0 = Date.now(); let st = L.licenceState(t0);
  ok("first run: a trial, 14 days left", st.plan === "trial" && st.trialDaysLeft === 14, st);
  ok("…and the clock is saved", loadConfig().licence.trialStart === t0);
  ok("day 10: 4 days left", L.licenceState(t0 + 10 * DAY).trialDaysLeft === 4);
  st = L.licenceState(t0 + 15 * DAY);
  ok("day 15: Free, and it says the trial ended", st.plan === "free" && st.trialEnded === true, st);

  console.log("WHAT FREE STOPS — and only the next thing, never what's running");
  const free = L.licenceState(t0 + 15 * DAY);
  ok("the first agent starts", L.can("agents", { running: 0 }, free).ok);
  const two = L.can("agents", { running: 1 }, free);
  ok("a second at once waits, saying why and what Pro adds", !two.ok && two.pro && /one agent at a time/.test(two.why) && /US\$12/.test(two.why), two);
  ok("projects: 3 free, the 4th is Pro", L.can("projects", { count: 2 }, free).ok && !L.can("projects", { count: 3 }, free).ok);
  ok("inboxes: 1 free, the 2nd is Pro", L.can("inboxes", { count: 0 }, free).ok && !L.can("inboxes", { count: 1 }, free).ok);
  ok("the marketing lane and Approve-and-ship are Pro", !L.can("marketing", {}, free).ok && !L.can("ship", {}, free).ok);
  ok("ship says the changes stay on their branch", /kept on their branch/.test(L.can("ship", {}, free).why));
  ok("anything else (the week, voice, Away…) is free", L.can("week", {}, free).ok && L.can("voice", {}, free).ok);
  ok("during the trial nothing is stopped", L.can("agents", { running: 5 }, L.licenceState(t0)).ok);

  console.log("A PRO KEY — entered once");
  reset({ trialStart: t0 - 30 * DAY });
  ok("a wrong key isn't saved, and says why", /starts with SYM1-/.test(L.setKey("nope").error || "") && !loadConfig().licence.key);
  st = L.setKey(pro.key);
  ok("a genuine key: Pro, with who it's for", st.plan === "pro" && st.email === "ann@example.com", st);
  ok("Pro stops nothing", L.can("agents", { running: 9 }).ok && L.can("ship").ok && L.can("inboxes", { count: 7 }).ok);
  ok("13 days before it ends: a renew reminder", L.licenceState(k.expires - 13 * DAY).renewSoon === 13);
  st = L.licenceState(k.expires + 2 * DAY);
  ok("2 days after it ends: still Pro, 5 days' grace", st.plan === "pro" && st.grace === 5, st);
  st = L.licenceState(k.expires + 8 * DAY);
  ok("after the grace: Free, saying the key ended", st.plan === "free" && /has ended/.test(st.keyProblem || ""), st);
  writeFileSync(join(HOME, ".config", "symbiot", "licence-revoked.json"), JSON.stringify({ at: Date.now(), ids: [k.id] }));
  st = L.licenceState();
  ok("a cancelled key: Free, saying it was cancelled", st.plan === "free" && /cancelled/.test(st.keyProblem || ""), st);
  ok("…and it can't be entered again", /cancelled/.test(L.setKey(pro.key).error || ""));
  writeFileSync(join(HOME, ".config", "symbiot", "licence-revoked.json"), JSON.stringify({ at: Date.now(), ids: [] }));
  ok("refreshing the cancelled list when the site can't be reached changes nothing", (await L.refreshRevoked(Date.now() + 2 * DAY)) === false && L.licenceState().plan === "pro");
  ok("removing the key: back to Free", L.clearKey().plan === "free");

  console.log("SYMBIOT NEVER WORKS ON ITS OWN CODE");
  const mk = (name, files, remote) => { const d = join(HOME, name); mkdirSync(d); for (const [f, t] of Object.entries(files)) writeFileSync(join(d, f), t); spawnSync("git", ["init", "-q"], { cwd: d }); if (remote) spawnSync("git", ["remote", "add", "origin", remote], { cwd: d }); return d; };
  const mine = mk("my-app", { "package.json": '{"name":"my-app"}', "index.js": "" });
  ok("someone's own project: fine", !L.isSymbiotCode(mine) && L.canWorkIn(mine).ok);
  ok("Symbiot's repo", L.isSymbiotCode(REPO));
  ok("Symbiot's installed copy (where this code runs from)", L.isSymbiotCode(L.SYMBIOT_HOME) && L.isSymbiotCode(join(L.SYMBIOT_HOME, "ui.mjs")));
  ok("a fork renamed in package.json, still Symbiot (its files give it away)", L.isSymbiotCode(mk("renamed", { "package.json": '{"name":"helper"}', "licence.mjs": "", "ui.mjs": "", "server.mjs": "" })));
  ok("a fork with every file renamed but the page, still Symbiot", L.isSymbiotCode(mk("rebadged", { "package.json": '{"name":"x"}', "ui.mjs": "export const EMBEDDED_UI = 1" })));
  ok("a clone of the repo by its remote, still Symbiot", L.isSymbiotCode(mk("clone", { "README.md": "" }, "https://github.com/someone/symbiot.git")));
  ok("a folder inside Symbiot's repo, still Symbiot", L.isSymbiotCode(join(REPO, "test")));
  reset({ trialStart: t0, key: pro.key });
  const no = L.canWorkIn(REPO);
  ok("Pro can't point it at its own code: refused, saying why", !no.ok && no.self && /doesn't work on its own code/.test(no.why), no);
  const owner = issue("--email", "owner@example.com", "--plan", "owner");
  ok("an owner key has no end date", owner.expires === 0, owner);
  L.setKey(owner.key);
  ok("the owner's Symbiot works on Symbiot", L.licenceState().plan === "owner" && L.canWorkIn(REPO).ok);

  console.log("WHERE IT'S ENFORCED — the real code paths, on Free");
  reset({ trialStart: Date.now() - 30 * DAY });
  const freeNow = L.licenceState();
  const { licenceGate, HANDOFFS } = await import("../agents.mjs");
  const { MARKETING_DIR } = await import("../marketing.mjs");
  const projs = ["a", "b", "c", "d"].map((x) => mk("proj-" + x, { "package.json": `{"name":"p${x}"}` }));
  ok("the first 3 projects start", projs.slice(0, 3).every((p) => licenceGate(p, freeNow) === null));
  ok("…and are remembered as Free's 3", JSON.stringify(loadConfig().licence.projects) === JSON.stringify(projs.slice(0, 3)));
  const fourth = licenceGate(projs[3], freeNow);
  ok("a 4th doesn't start, saying how to swap", fourth && fourth.blocked && fourth.pro && /3 projects/.test(fourth.note) && /swap/.test(fourth.note), fourth);
  ok("one of the 3 again: starts", licenceGate(projs[1], freeNow) === null);
  HANDOFFS.push({ handoff: true, status: "running", path: projs[0], id: "t" });
  const second = licenceGate(projs[1], freeNow);
  ok("a second agent while one runs: waits, saying why", second && second.blocked && /one agent at a time/.test(second.note), second);
  HANDOFFS.pop();
  ok("the marketing lane: Pro", /marketing lane/.test((licenceGate(MARKETING_DIR, freeNow) || {}).note || ""));
  ok("Symbiot's own repo: refused, even on Free", /own code/.test((licenceGate(REPO, freeNow) || {}).note || ""));
  const { linkSite } = await import("../links.mjs");
  const first = await linkSite("gmail", { open: async () => ({ url: "https://example.com" }) });
  ok("one inbox connects", !first.error, first);
  const more = await linkSite("whatsapp", { open: async () => ({ url: "https://example.com" }) });
  ok("a second inbox or chat: Pro, saying so", more.pro && /one inbox or chat/.test(more.error || ""), more);
  ok("Gmail again (already connected): fine", !(await linkSite("gmail", { open: async () => ({ url: "https://example.com" }) })).error);
  ok("GitHub isn't an inbox: connects", !(await linkSite("github", { open: async () => ({ url: "https://example.com" }) })).error);
  const { approveRepo, approveChanges } = await import("../tasks.mjs");
  const ship = await approveRepo("anything");
  ok("Approve-and-ship: Pro, and the work stays on its branch", ship.pro && /kept on their branch/.test(ship.error || ""), ship);
  ok("Approve (untasked changes): Pro too", (await approveChanges("anything")).pro === true);
  const { judge } = await import("../guard.mjs");
  const cwd = projs[0];
  ok("the guard: an agent can't edit Symbiot's own files", /own code/.test((judge("Write", { file_path: join(REPO, "licence.mjs") }, { cwd, home: HOME }) || {}).why || ""));
  ok("…or change them from the shell", /own code/.test((judge("Bash", { command: `sed -i s/a/b/ ${join(REPO, "licence.mjs")}` }, { cwd, home: HOME, branch: "x" }) || {}).why || ""));
  ok("…or its cancelled-keys list", !!judge("Write", { file_path: join(HOME, ".config", "symbiot", "licence-revoked.json") }, { cwd, home: HOME }));
  ok("…but its own project's files are fine", judge("Write", { file_path: join(cwd, "x.js") }, { cwd, home: HOME }) === null);
  process.env.SYMBIOT_OWNER = "1";
  ok("the owner's runs may edit Symbiot", judge("Write", { file_path: join(REPO, "licence.mjs") }, { cwd, home: HOME }) === null);
  delete process.env.SYMBIOT_OWNER;

  console.log("THE ISSUING SCRIPT");
  const listed = spawnSync(process.execPath, [join(REPO, "scripts", "licence.mjs"), "list"], { encoding: "utf8", env: { ...process.env, SYMBIOT_ISSUER_DIR: ISSUER } }).stdout;
  ok("every key issued is logged", listed.includes(pro.id) && listed.includes(owner.id) && listed.includes("ann@example.com"), listed);
  const noKey = spawnSync(process.execPath, [join(REPO, "scripts", "licence.mjs"), "issue", "--email", "a@b.c"], { encoding: "utf8", env: { ...process.env, SYMBIOT_ISSUER_DIR: join(HOME, "nowhere") } });
  ok("without the signing key it refuses", noKey.status !== 0 && /No signing key/.test(noKey.stderr), noKey.stderr);
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} licence: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
