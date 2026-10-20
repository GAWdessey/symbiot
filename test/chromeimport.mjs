// The user's own Chrome sign-in taken for the Symbiot Browser (chromeimport.mjs, headless.takeChromeSignIn):
// a v10 cookie is decrypted the way Chrome does, tracking cookies alone are no sign-in, and a sign-in that
// loads the site signed in is taken without opening a Sign in window. Isolated HOME, no real Chrome.
//
//   node test/chromeimport.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-chromeimport-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { chromeSession, hostsOf, decrypt, profilesOf, keyFor } = await import("../chromeimport.mjs");
const { takeChromeSignIn, openSite, CHROME_TRIED } = await import("../headless.mjs");

ok("hostsOf walks up to the registrable host", JSON.stringify(hostsOf("www.mail.example.com")) === '["mail.example.com","example.com"]', hostsOf("www.mail.example.com"));

const key = pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
const enc = (v, host, hashed = true) => {
  const c = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  const plain = Buffer.concat([hashed ? createHash("sha256").update(host).digest() : Buffer.alloc(0), Buffer.from(v)]);
  return Buffer.concat([Buffer.from("v10"), c.update(plain), c.final()]);
};
ok("decrypt gives the value back (Chrome 130+ host hash dropped)", decrypt(enc("secret1", ".example.com"), ".example.com", key) === "secret1");
ok("decrypt gives the value back (older Chrome)", decrypt(enc("secret2", ".example.com", false), ".example.com", key) === "secret2");

// a Chrome profile under the isolated HOME
const prof = join(HOME, ".config/google-chrome/Default/Network");
mkdirSync(prof, { recursive: true });
const future = (Math.floor(Date.now() / 1000) + 86400 + 11644473600) * 1e6;
const past = (Math.floor(Date.now() / 1000) - 86400 + 11644473600) * 1e6;
const rows = [
  [".example.com", "sessionid", enc("abc123", ".example.com").toString("hex"), "/", future, 1, 1, 1],
  [".example.com", "_ga", enc("tracking", ".example.com").toString("hex"), "/", future, 0, 0, 0],
  [".expired.com", "sessionid", enc("old", ".expired.com").toString("hex"), "/", past, 1, 1, 1],
  [".tracked.com", "_ga", enc("only", ".tracked.com").toString("hex"), "/", future, 0, 0, 0],
];
const py = [
  "import sqlite3,sys,json",
  "c=sqlite3.connect(sys.argv[1])",
  "c.execute('create table cookies(host_key,name,value,encrypted_value,path,expires_utc,is_secure,is_httponly,samesite)')",
  "for r in json.loads(sys.argv[2]): c.execute(\"insert into cookies values(?,?,'',x'\"+r[2]+\"',?,?,?,?,0)\",[r[0],r[1],r[3],r[4],r[5],r[6]])",
  "c.commit()",
].join("\n");
const made = spawnSync("python3", ["-I", "-c", py, join(prof, "Cookies"), JSON.stringify(rows)], { encoding: "utf8" });
ok("fake Chrome cookie store made", made.status === 0, made.stderr);

const s = chromeSession("www.example.com");
const sid = s.cookies.find((c) => c.name === "sessionid");
ok("the sign-in cookie comes out decrypted", sid && sid.value === "abc123" && sid.domain === ".example.com" && sid.secure && sid.httpOnly && sid.expires > Date.now() / 1000, s);
ok("it names the Chrome profile it came from", /google-chrome\/Default/.test(s.from || ""), s.from);
ok("a site with tracking cookies only is not signed in", chromeSession("tracked.com").cookies.length === 0, chromeSession("tracked.com"));
ok("an expired sign-in is not taken", chromeSession("expired.com").cookies.length === 0);
ok("a site Chrome has nothing for says so", /no sign-in/.test(chromeSession("nothing.org").reason || ""), chromeSession("nothing.org"));

// takeChromeSignIn: cookies set and the site loads signed in -> ok; a sign-in page -> not ok
const sent = [];
const at = (href) => ({ send: async (m) => (m === "Runtime.evaluate" ? { result: { value: href } } : {}), until: async () => ({}), idle: async () => {} });
const conn = { c: { send: async (m, p) => { sent.push(m + ":" + p.cookies.length); } } };
let r = await takeChromeSignIn("https://www.example.com/", chromeSession, (fn) => fn(at("https://www.example.com/home"), conn));
ok("a live Chrome sign-in is taken, no window needed", r.ok === true && r.imported === 2 && sent.includes("Storage.setCookies:2"), r);
r = await takeChromeSignIn("https://www.example.com/", chromeSession, (fn) => fn(at("https://www.example.com/login"), conn));
ok("a sign-in the site no longer accepts falls back to the window", r.ok === false && /expired/.test(r.reason), r);
r = await takeChromeSignIn("https://nothing.org/", chromeSession, async () => { throw new Error("must not start a browser"); });
ok("no Chrome sign-in: no browser is started", r.ok === false, r);

// Chrome's keyring key without secret-tool (not on a stock Pop!_OS): Python's libsecret binding (2026-10-20)
const asked = [], k11 = keyFor({ app: "chrome" }, "v11", "linux", (cmd) => { asked.push(cmd); return cmd === "secret-tool" ? { status: 127, stdout: "" } : { status: 0, stdout: "keyringpass" }; });
ok("no secret-tool: the key comes from libsecret through Python", asked.join(",") === "secret-tool,python3" && k11 && k11.equals(pbkdf2Sync("keyringpass", "saltysalt", 1, 16, "sha1")), asked);
ok("...and with neither, no key (nothing is taken)", keyFor({ app: "chrome" }, "v11", "linux", () => ({ status: 1, stdout: "" })) === null);

// the profile agents act as (2026-10-20): Chrome's Local State names them all, "Default" (Work here) unless
// config.chromeProfile says otherwise, and never a sign-in from the personal profile when Work has none
const CH = join(HOME, ".config/google-chrome");
mkdirSync(join(CH, "Profile 6", "Network"), { recursive: true });
writeFileSync(join(CH, "Local State"), JSON.stringify({ profile: { last_used: "Profile 6", info_cache: { Default: { name: "Work" }, "Profile 6": { name: "Garth" } } } }));
ok("Default (Work) is the profile, even when the personal one was used last", JSON.stringify(profilesOf(CH)) === '[{"dir":"Default","name":"Work"}]', profilesOf(CH));
ok("a profile is chosen by the name Chrome shows, past Profile 3", profilesOf(CH, "Garth")[0].dir === "Profile 6", profilesOf(CH, "Garth"));
copyFileSync(join(prof, "Cookies"), join(CH, "Profile 6", "Network", "Cookies"));
const madeP = spawnSync("python3", ["-I", "-c", "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute(\"delete from cookies where host_key='.example.com'\");c.commit()", join(prof, "Cookies")], { encoding: "utf8" });
ok("(Work's sign-in for example.com taken away)", madeP.status === 0, madeP.stderr);
ok("only the personal profile signed in: nothing is taken", chromeSession("example.com").cookies.length === 0, chromeSession("example.com"));
const g = chromeSession("example.com", { profile: "Garth" });
ok("...unless it's the one chosen, and it says which", g.cookies.length === 2 && g.profile === "Garth" && /Profile 6/.test(g.from), g);

// a page that lands on a login wall on a linked site takes the Chrome sign-in and opens again, once
writeFileSync(join(HOME, ".config", "symbiot", "config.json"), JSON.stringify({ sites: [{ hosts: ["example.com"] }], chromeProfile: "Garth" }));
const wall = () => { const calls = []; let signed = false; return { calls, page: { until: async () => ({}), idle: async () => {},
  send: async (m, p) => { calls.push(m); if (m === "Network.setCookies") signed = p.cookies.length > 0; return m === "Runtime.evaluate" ? { result: { value: signed ? "https://www.example.com/home" : "https://www.example.com/login" } } : {}; } } }; };
let w = wall(); await openSite(w.page, "https://www.example.com/");
ok("a login wall on a linked site: Chrome's sign-in goes in and the page opens again", w.calls.includes("Network.setCookies") && w.calls.filter((m) => m === "Page.navigate").length === 2, w.calls);
w = wall(); await openSite(w.page, "https://www.example.com/");
ok("...once in ten minutes, not on every page", !w.calls.includes("Network.setCookies"), w.calls);
CHROME_TRIED.clear(); w = wall(); await openSite(w.page, "https://other.example.org/");
ok("a site that isn't linked never gets one", !w.calls.includes("Network.setCookies") && w.calls.filter((m) => m === "Page.navigate").length === 1, w.calls);

rmSync(HOME, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
