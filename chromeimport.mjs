// The user's everyday Chrome sign-ins, for the Symbiot Browser: an agent that hits a login wall on a
// site the user is already signed in to in their own Chrome takes that session instead of asking them
// to sign in again. One site at a time (the cookies of that host and its parents), read from a copy of
// the Chrome profile's cookie store, decrypted the way Chrome does (Linux and macOS), and handed to
// the hidden browser as cookies. Nothing is written to Chrome's own profile, and nothing leaves this computer.
import { spawnSync } from "node:child_process";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { existsSync, copyFileSync, mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
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

const LIBSECRET = "import gi,sys;gi.require_version('Secret','1');from gi.repository import Secret;s=Secret.Schema.new('chrome_libsecret_os_crypt_password_v2',Secret.SchemaFlags.DONT_MATCH_NAME,{'application':Secret.SchemaAttributeType.STRING});v=Secret.password_lookup_sync(s,{'application':sys.argv[1]},None);sys.exit(1) if not v else sys.stdout.write(v)";
// The key Chrome encrypts cookies with: from the system keyring when it has one (v11), else the
// fixed password Chrome uses without one (v10).
function keyFor(src, version, platform = process.platform, run = spawnSync) {
  let pass = "peanuts";
  if (version === "v11" && platform === "linux") {
    // secret-tool, else Python's libsecret binding (PyGObject): secret-tool isn't installed on a
    // stock Pop!_OS, and no sign-in ever came across there (2026-10-20)
    const tries = [["secret-tool", ["lookup", "application", src.app]], ["python3", ["-I", "-c", LIBSECRET, src.app]]];
    const r = tries.map(([cmd, args]) => { try { return run(cmd, args, { encoding: "utf8", timeout: 5000 }); } catch { return {}; } }).find((x) => x && x.status === 0 && x.stdout);
    if (!r) return null;
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

// The one profile agents act as: the one chosen (config.chromeProfile, by folder or by the name
// Chrome shows; "Default", Chrome's first, when unset), not whichever has a sign-in. The user's
// personal profile (Profile 6, another Google account) isn't who agents act as, and the list
// stopped at Profile 3 before (2026-10-20). Local State names every profile; a browser without
// the chosen one gives its last used.
function profilesOf(dir, chosen = "Default") {
  let info = {}, last = "";
  try { const p = JSON.parse(readFileSync(join(dir, "Local State"), "utf8")).profile || {}; info = p.info_cache || {}; last = p.last_used || ""; } catch {}
  let found = []; try { found = readdirSync(dir).filter((n) => /^(Default|Profile \d+)$/.test(n)); } catch {}
  const names = [...new Set([...Object.keys(info), ...found])].filter((n) => existsSync(join(dir, n)));
  const want = String(chosen || "Default"), byName = names.find((n) => info[n] && String(info[n].name || "").toLowerCase() === want.toLowerCase());
  const pick = names.includes(want) ? want : byName || (names.includes(last) ? last : names[0]);
  return pick ? [{ dir: pick, name: (info[pick] && info[pick].name) || pick }] : [];
}

const AUTH = /sess|auth|token|sid$|^sid|login|logged|user|jwt|c_user|li_at|^xs$|^sso/i;
// The signed-in cookies for a site from the user's own Chrome: { cookies, from } or { cookies: [], reason }.
// opts: profile (config.chromeProfile); and for tests home, platform, run, rows.
function chromeSession(host, opts = {}) {
  const platform = opts.platform || process.platform, now = Date.now();
  const hosts = hostsOf(host);
  if (!hosts.length) return { cookies: [], reason: "no site" };
  let found = false;
  for (const src of sources(opts.home, platform)) {
    if (!existsSync(src.dir)) continue;
    for (const { dir: p, name } of profilesOf(src.dir, opts.profile)) {
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
        if (cookies.some((c) => AUTH.test(c.name))) return { cookies, from: `${src.dir.split("/").pop()}/${p}`, profile: name };
        found = true;
      } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
    }
  }
  return { cookies: [], reason: found ? "Chrome has no sign-in for this site" : "no Chrome profile found on this computer" };
}

// The Google accounts each Chrome profile in dir is signed in to (Local State's info_cache
// user_name, and the account_info in the profile's Preferences): { "Default": ["a@gmail.com"], … }.
// The Symbiot Browser only opens Default, so an account that sits in another profile alone
// (a "Profile 1" Chrome made on 2026-10-13) never reaches an agent's reads.
function profileAccounts(dir) {
  let info = {}; try { info = JSON.parse(readFileSync(join(dir, "Local State"), "utf8")).profile.info_cache || {}; } catch {}
  const names = [...new Set([...Object.keys(info), ...(() => { try { return readdirSync(dir).filter((n) => /^(Default|Profile \d+)$/.test(n)); } catch { return []; } })()])];
  const out = {};
  for (const n of names) {
    const mails = new Set(), add = (m) => { if (/^[^@\s]+@[^@\s]+$/.test(String(m || ""))) mails.add(String(m).toLowerCase()); };
    add(info[n] && info[n].user_name);
    try { for (const a of JSON.parse(readFileSync(join(dir, n, "Preferences"), "utf8")).account_info || []) add(a.email); } catch {}
    out[n] = [...mails];
  }
  return out;
}
// A line for a Google site's card when an account is signed in to a profile other than the
// one the browser opens, or "" when Default has them all.
function accountNote(accts, opened = "Default") {
  const have = new Set(accts[opened] || []), stray = [];
  for (const [n, list] of Object.entries(accts)) if (n !== opened) for (const m of list) if (!have.has(m) && !stray.some((x) => x.m === m)) stray.push({ m, n });
  if (!stray.length) return "";
  const here = [...have];
  return `${stray.map((x) => `${x.m} is signed in only in Chrome's "${x.n}"`).join("; ")}, and the Symbiot Browser opens "${opened}" (${here.length ? "its accounts: " + here.join(", ") : "no Google account in it"}). If a page says you need additional access, sign in as that account in the Symbiot Browser.`;
}
export { profileAccounts, accountNote, chromeSession, hostsOf, decrypt, keyFor, toCookie, sources, profilesOf };
