// The user's everyday Chrome sign-ins, for the Symbiot Browser: an agent that hits a login wall on a
// site the user is already signed in to in their own Chrome takes that session instead of asking them
// to sign in again. One site at a time (the cookies of that host and its parents), read from a copy of
// the Chrome profile's cookie store, decrypted the way Chrome does (Linux and macOS), and handed to
// the hidden browser as cookies. Nothing is written to Chrome's own profile, and nothing leaves this computer.
import { spawnSync } from "node:child_process";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { existsSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

// Where each browser keeps its profiles, and the keyring entry its cookie key lives under.
function sources(home = homedir(), platform = process.platform) {
  if (platform === "linux") return [
    { dir: join(home, ".config/google-chrome"), app: "chrome" }, { dir: join(home, ".config/chromium"), app: "chromium" },
    { dir: join(home, ".config/BraveSoftware/Brave-Browser"), app: "brave" }, { dir: join(home, ".config/microsoft-edge"), app: "chromium" },
  ];
  if (platform === "darwin") return [
    { dir: join(home, "Library/Application Support/Google/Chrome"), service: "Chrome Safe Storage", account: "Chrome" },
    { dir: join(home, "Library/Application Support/Chromium"), service: "Chromium Safe Storage", account: "Chromium" },
  ];
  return [];
}

// The key Chrome encrypts cookies with: from the system keyring when it has one (v11), else the
// fixed password Chrome uses without one (v10).
function keyFor(src, version, platform = process.platform, run = spawnSync) {
  let pass = "peanuts";
  if (version === "v11" && platform === "linux") {
    const r = run("secret-tool", ["lookup", "application", src.app], { encoding: "utf8", timeout: 5000 });
    if (r.status !== 0 || !r.stdout) return null;
    pass = r.stdout.replace(/\n$/, "");
  } else if (platform === "darwin") {
    const r = run("security", ["find-generic-password", "-w", "-s", src.service, "-a", src.account], { encoding: "utf8", timeout: 5000 });
    if (r.status !== 0 || !r.stdout) return null;
    pass = r.stdout.replace(/\n$/, "");
  }
  return pbkdf2Sync(pass, "saltysalt", platform === "darwin" ? 1003 : 1, 16, "sha1");
}

// A cookie's value from its encrypted_value: v10/v11 AES-128-CBC. Chrome 130+ puts a SHA-256 of the
// cookie's host in front of the value, which is dropped. null if it can't be decrypted.
function decrypt(buf, host, key) {
  try {
    const d = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
    let out = Buffer.concat([d.update(buf.subarray(3)), d.final()]);
    if (out.length >= 32 && out.subarray(0, 32).equals(createHash("sha256").update(host).digest())) out = out.subarray(32);
    return out.toString("utf8");
  } catch { return null; }
}

// The rows for these hosts, with whichever SQLite this computer has (Python's, always there with
// python3): [{ host, name, value, enc (hex), path, exp, secure, httpOnly, sameSite }].
const QUERY = "select host_key, name, value, hex(encrypted_value), path, expires_utc, is_secure, is_httponly, samesite from cookies where ";
function readRows(file, hosts) {
  const where = hosts.map(() => "(host_key = ? or host_key = ?)").join(" or ");
  const args = hosts.flatMap((h) => [h, "." + h]);
  const py = "import sqlite3,sys,json;c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True);print(json.dumps(c.execute(sys.argv[2],sys.argv[3:]).fetchall()))";
  for (const cmd of ["python3", "python"]) {
    try {
      const r = spawnSync(cmd, ["-I", "-c", py, file, QUERY + where, ...args], { encoding: "utf8", timeout: 10000, maxBuffer: 16 << 20 });
      if (r.status === 0) return JSON.parse(r.stdout).map(([host, name, value, enc, path, exp, secure, httpOnly, sameSite]) => ({ host, name, value, enc, path, exp, secure: !!secure, httpOnly: !!httpOnly, sameSite }));
    } catch {}
  }
  return null;
}

// "mail.google.com" -> ["mail.google.com", "google.com"]: the hosts whose cookies the site receives.
function hostsOf(host) {
  const parts = String(host || "").toLowerCase().replace(/^www\./, "").split(".").filter(Boolean), out = [];
  for (let i = 0; i <= parts.length - 2; i++) out.push(parts.slice(i).join("."));
  return out;
}

// Chrome's cookie rows as DevTools cookies. expires_utc is microseconds since 1601; 0 is a session cookie.
const SAME = { 0: "None", 1: "Lax", 2: "Strict" };
function toCookie(r, value, now = Date.now()) {
  const c = { name: r.name, value, domain: r.host, path: r.path || "/", secure: r.secure, httpOnly: r.httpOnly };
  if (SAME[r.sameSite] && (r.sameSite !== 0 || r.secure)) c.sameSite = SAME[r.sameSite];
  if (r.exp > 0) c.expires = Math.floor(r.exp / 1e6 - 11644473600);
  else c.expires = Math.floor(now / 1000) + 12 * 3600; // a session cookie lasts as long as keepSessions keeps one
  return c;
}

const AUTH = /sess|auth|token|sid$|^sid|login|logged|user|jwt|c_user|li_at|^xs$|^sso/i;
// The signed-in cookies for a site from the user's own Chrome: { cookies, from } or { cookies: [], reason }.
// opts (tests): home, platform, run, rows.
function chromeSession(host, opts = {}) {
  const platform = opts.platform || process.platform, now = Date.now();
  const hosts = hostsOf(host);
  if (!hosts.length) return { cookies: [], reason: "no site" };
  let found = false;
  for (const src of sources(opts.home, platform)) {
    if (!existsSync(src.dir)) continue;
    const profiles = ["Default", "Profile 1", "Profile 2", "Profile 3"].filter((p) => existsSync(join(src.dir, p)));
    for (const p of profiles) {
      const db = ["Network/Cookies", "Cookies"].map((f) => join(src.dir, p, f)).find((f) => existsSync(f));
      if (!db) continue;
      const dir = mkdtempSync(join(tmpdir(), "symbiot-chrome-"));
      try {
        for (const ext of ["", "-wal", "-journal"]) if (existsSync(db + ext)) copyFileSync(db + ext, join(dir, "Cookies" + ext));
        const rows = (opts.rows || readRows)(join(dir, "Cookies"), hosts);
        if (!rows) return { cookies: [], reason: "Symbiot can't read Chrome's cookie store here (python3 is missing)" };
        const keys = {}, cookies = [];
        for (const r of rows) {
          if (r.exp > 0 && r.exp / 1e6 - 11644473600 < now / 1000) continue; // expired
          let value = r.value;
          if (!value && r.enc) {
            const buf = Buffer.from(r.enc, "hex"), ver = buf.subarray(0, 3).toString();
            if (ver !== "v10" && ver !== "v11") continue;
            if (!(ver in keys)) keys[ver] = keyFor(src, ver, platform, opts.run || spawnSync);
            if (!keys[ver]) continue;
            value = decrypt(buf, r.host, keys[ver]);
            if (value === null) continue;
          }
          cookies.push(toCookie(r, value, now));
        }
        // only a cookie that looks like a sign-in counts: a site's tracking cookies alone are not one
        if (cookies.some((c) => AUTH.test(c.name))) return { cookies, from: `${src.dir.split("/").pop()}/${p}` };
        found = true;
      } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
    }
  }
  return { cookies: [], reason: found ? "Chrome has no sign-in for this site" : "no Chrome profile found on this computer" };
}

export { chromeSession, hostsOf, decrypt, keyFor, toCookie, sources };
