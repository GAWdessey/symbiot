// The user's own Chrome sign-in taken for the Symbiot Browser (chromeimport.mjs, headless.takeChromeSignIn):
// a v10 cookie is decrypted the way Chrome does, tracking cookies alone are no sign-in, and a sign-in that
// loads the site signed in is taken without opening a Sign in window. Isolated HOME, no real Chrome.
//
//   node test/chromeimport.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-chromeimport-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { chromeSession, hostsOf, decrypt } = await import("../chromeimport.mjs");
const { takeChromeSignIn } = await import("../headless.mjs");

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

rmSync(HOME, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
