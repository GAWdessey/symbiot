#!/usr/bin/env node
// Builds the two zips the Android app carries in its assets:
//   runtime.zip  Node, git and gh for Android, from Termux's package repo (the
//                same builds `pkg install nodejs-lts git gh` gives you), laid out
//                as a prefix (bin/, lib/, libexec/, etc/, share/).
//   symbiot.zip  this checkout, packed like `npm install -g symbiot` would
//                install it (its files + node_modules).
// Zips can't carry symlinks or exec bits that Java's ZipInputStream would see,
// so each zip has a `.symlinks` (path<TAB>target) and `.executables` list that
// the app applies after unpacking.
//
//   node android/runtime.mjs [--arch aarch64|x86_64|arm|i686] [--out android/build/<arch>]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, lstatSync, readlinkSync, unlinkSync, openSync, writeSync, closeSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, crc32 } from "node:zlib";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { setDefaultResultOrder } from "node:dns";

// Node's 250 ms per-address connect race gives up on a slow link before the
// mirror answers; try IPv4 first and give each address longer.
setDefaultResultOrder("ipv4first"); setDefaultAutoSelectFamilyAttemptTimeout(5000);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const ARCH = arg("arch", "aarch64");
const OUT = resolve(arg("out", join(HERE, "build", ARCH)));
const CACHE = join(HERE, "build", "cache", ARCH);
const MIRROR = (process.env.TERMUX_MIRROR || "https://packages.termux.dev/apt/termux-main").replace(/\/+$/, "");
// What the app runs: Node (LTS) for Symbiot, npm for Settings' "Update & restart",
// git for your repos, gh for Approve's pull requests, and the CA bundle git's
// https needs. Their dependencies follow.
const ROOTS = ["nodejs-lts", "npm", "git", "gh", "ca-certificates"];
const TERMUX_PREFIX = "data/data/com.termux/files/usr";
// Not needed at runtime: docs, headers, shell completions, translations.
const DROP = [/^share\/(doc|man|info|locale|bash-completion|zsh|fish|lintian|gitweb|git-gui|gitk)(\/|$)/, /^include(\/|$)/, /^lib\/pkgconfig(\/|$)/,
  /^lib\/node_modules\/npm\/(docs|man)(\/|$)/, /^lib\/.*\.a$/, /^share\/perl5(\/|$)/, /^(lib\/node_modules|bin)\/corepack(\/|$)/,
  /^bin\/(scalar|git-shell|git-cvsserver|[\w-]+-config)$/, /^libexec\/git-core\/git-(daemon|imap-send|http-backend|http-push|shell|cvsserver)$/];

function log(s) { process.stderr.write(s + "\n"); }
async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// ---- Termux's apt index -> the packages to fetch ------------------------------
function parsePackages(txt) {
  const pk = {};
  for (const blk of txt.split(/\n\n+/)) {
    const d = {};
    for (const l of blk.split("\n")) { const m = /^([\w-]+): (.*)$/.exec(l); if (m) d[m[1]] = m[2]; }
    if (d.Package) pk[d.Package] = d;
  }
  return pk;
}
function closure(pk, roots) {
  const seen = new Set(), stack = [...roots];
  while (stack.length) {
    const n = stack.pop(); if (seen.has(n)) continue;
    if (!pk[n]) throw new Error(`package not in the ${ARCH} index: ${n}`);
    seen.add(n);
    for (const dep of String(pk[n].Depends || "").split(",")) {
      // "nodejs | nodejs-lts": the alternative we already ship, else the first
      const alts = dep.split("|").map((a) => a.trim().split(/[\s(]/)[0]).filter(Boolean);
      const name = alts.find((a) => roots.includes(a) || seen.has(a)) || alts[0];
      if (name) stack.push(name);
    }
  }
  return [...seen].sort();
}

// ---- .deb (ar) -> data.tar.* -> the prefix ------------------------------------
function debData(buf) {
  if (buf.toString("latin1", 0, 8) !== "!<arch>\n") throw new Error("not a .deb");
  for (let off = 8; off + 60 <= buf.length;) {
    const name = buf.toString("latin1", off, off + 16).trim().replace(/\/$/, "");
    const size = parseInt(buf.toString("latin1", off + 48, off + 58).trim(), 10);
    if (name.startsWith("data.tar")) return { name, data: buf.subarray(off + 60, off + 60 + size) };
    off += 60 + size + (size % 2);
  }
  throw new Error("no data.tar in .deb");
}

// ---- RUNPATH: Termux's prefix -> relative to the file -------------------------
// Termux links every binary and library with RUNPATH=/data/data/com.termux/files/usr/lib.
// The app's prefix is elsewhere, so rewrite it in place to $ORIGIN/../lib (and so
// on), which Android's linker resolves against the file's own folder. No
// LD_LIBRARY_PATH needed, so nothing leaks into the programs Symbiot starts.
function fixRunpath(file, rel) {
  const b = readFileSync(file);
  if (b.length < 64 || b.readUInt32BE(0) !== 0x7f454c46) return false; // not ELF
  const is64 = b[4] === 2;
  const word = (o) => (is64 ? Number(b.readBigUInt64LE(o)) : b.readUInt32LE(o));
  const phoff = word(is64 ? 32 : 28), phentsize = b.readUInt16LE(is64 ? 54 : 42), phnum = b.readUInt16LE(is64 ? 56 : 44);
  const loads = []; let dyn = null;
  for (let i = 0; i < phnum; i++) {
    const p = phoff + i * phentsize, type = b.readUInt32LE(p);
    const off = word(p + (is64 ? 8 : 4)), vaddr = word(p + (is64 ? 16 : 8)), filesz = word(p + (is64 ? 32 : 16));
    if (type === 1) loads.push({ off, vaddr, filesz });
    if (type === 2) dyn = { off, filesz };
  }
  if (!dyn) return false;
  const ent = is64 ? 16 : 8, tags = {}; const paths = [];
  for (let o = dyn.off; o + ent <= dyn.off + dyn.filesz; o += ent) {
    const tag = word(o), val = word(o + (is64 ? 8 : 4));
    if (tag === 0) break;
    if (tag === 5) tags.strtab = val;
    if (tag === 29 || tag === 15) paths.push(val); // DT_RUNPATH, DT_RPATH
  }
  if (!paths.length || tags.strtab == null) return false;
  const seg = loads.find((l) => tags.strtab >= l.vaddr && tags.strtab < l.vaddr + l.filesz);
  if (!seg) return false;
  const strtab = tags.strtab - seg.vaddr + seg.off;
  const up = relative(dirname(rel), "lib");
  const want = up ? "$ORIGIN/" + up : "$ORIGIN";
  for (const v of paths) {
    const at = strtab + v, end = b.indexOf(0, at), old = b.toString("latin1", at, end);
    if (!old.includes("com.termux")) continue;
    if (want.length > end - at) throw new Error(`${rel}: RUNPATH too short to rewrite (${old})`);
    b.fill(0, at, end); b.write(want, at, "latin1");
  }
  writeFileSync(file, b);
  return true;
}
function fixRunpaths(root) {
  let n = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name), st = lstatSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile() && fixRunpath(p, relative(root, p))) n++;
    }
  };
  walk(root);
  return n;
}

// ---- Termux's shell -> Android's -----------------------------------------------
// git runs hooks, aliases and credential helpers with a shell compiled in as
// Termux's sh; swap that C string in place for a same-length path to Android's
// (same length, so a shorter string the linker merged into its tail still reads
// right). Scripts' #! lines get Android's sh too. Node's copy is in its built-in
// JS, which ships precompiled, so node-shell.cjs fixes that one at runtime.
const TERMUX_SH = "/data/data/com.termux/files/usr/bin/sh";
const ANDROID_SH = "/system/bin/" + "./".repeat((TERMUX_SH.length - "/system/bin/sh".length) / 2) + "sh";
function fixShells(root) {
  let n = 0;
  const from = Buffer.from("\0" + TERMUX_SH + "\0"), to = Buffer.from("\0" + ANDROID_SH + "\0");
  const shebang = /^#!\/data\/data\/com\.termux\/files\/usr\/bin\/(?:env (?:ba)?sh|ba)?sh\b/;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name), st = lstatSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      if (!st.isFile()) continue;
      const b = readFileSync(p);
      if (b.length > 4 && b.readUInt32BE(0) === 0x7f454c46) {
        let hit = false;
        for (let i = b.indexOf(from); i >= 0; i = b.indexOf(from, i + 1)) { to.copy(b, i); hit = true; }
        if (hit) { writeFileSync(p, b); n++; }
      } else if (shebang.test(b.toString("latin1", 0, 80))) {
        writeFileSync(p, b.toString("latin1").replace(shebang, "#!/system/bin/sh"), "latin1"); n++;
      }
    }
  };
  walk(root);
  return n;
}

// ---- a minimal zip writer (deflate; no zip64, the runtime is well under 4 GB) ---
function writeZip(file, entries) {
  const fd = openSync(file, "w"); let off = 0; const central = [];
  const put = (b) => { writeSync(fd, b); off += b.length; };
  for (const { name, data, mode = 0o644 } of entries) {
    const nameB = Buffer.from(name, "utf8"), crc = crc32(data), comp = deflateRawSync(data, { level: 9 });
    const store = comp.length >= data.length, body = store ? data : comp, method = store ? 0 : 8;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8);
    h.writeUInt32LE(0x00210000, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nameB.length, 26);
    const at = off; put(h); put(nameB); put(body);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x031e, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(0x00210000, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameB.length, 28);
    c.writeUInt32LE(((0o100000 | mode) << 16) >>> 0, 38); c.writeUInt32LE(at, 42); central.push(Buffer.concat([c, nameB]));
  }
  const cdAt = off; for (const c of central) put(c);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(central.length, 8); e.writeUInt16LE(central.length, 10);
  e.writeUInt32LE(off - cdAt, 12); e.writeUInt32LE(cdAt, 16); put(e); closeSync(fd);
}
// A directory tree -> zip entries + the .symlinks / .executables lists. Hard links
// (same inode) are written once and the rest become symlinks to it.
function zipTree(root, file, keep = () => true) {
  const entries = [], links = [], execs = [], inodes = new Map();
  const walk = (dir) => {
    for (const n of readdirSync(dir).sort()) {
      const p = join(dir, n), rel = relative(root, p), st = lstatSync(p);
      if (!keep(rel)) continue;
      if (st.isSymbolicLink()) links.push(rel + "\t" + readlinkSync(p));
      else if (st.isDirectory()) walk(p);
      else if (st.isFile()) {
        if (st.nlink > 1 && inodes.has(st.ino)) { links.push(rel + "\t" + relative(dirname(rel), inodes.get(st.ino))); continue; }
        inodes.set(st.ino, rel);
        entries.push({ name: rel, data: readFileSync(p), mode: st.mode & 0o777 });
        if (st.mode & 0o111) execs.push(rel);
      }
    }
  };
  walk(root);
  entries.push({ name: ".symlinks", data: Buffer.from(links.join("\n") + "\n") }, { name: ".executables", data: Buffer.from(execs.join("\n") + "\n") });
  writeZip(file, entries);
  return { files: entries.length - 2, links: links.length };
}

async function buildRuntime() {
  mkdirSync(CACHE, { recursive: true });
  log(`fetching the Termux package index (${ARCH})`);
  const pk = parsePackages((await get(`${MIRROR}/dists/stable/main/binary-${ARCH}/Packages`)).toString("utf8"));
  const names = closure(pk, ROOTS);
  const stage = join(OUT, "stage"); rmSync(stage, { recursive: true, force: true }); mkdirSync(stage, { recursive: true });
  const versions = {};
  for (const n of names) {
    const p = pk[n], deb = join(CACHE, p.Filename.split("/").pop());
    if (!existsSync(deb) || createHash("sha256").update(readFileSync(deb)).digest("hex") !== p.SHA256) {
      log(`  ${n} ${p.Version}`);
      const buf = await get(`${MIRROR}/${p.Filename}`);
      if (createHash("sha256").update(buf).digest("hex") !== p.SHA256) throw new Error(`${n}: checksum mismatch`);
      writeFileSync(deb, buf);
    }
    const { name, data } = debData(readFileSync(deb));
    const tarFile = join(stage, name); writeFileSync(tarFile, data);
    execFileSync("tar", ["-xf", tarFile, "-C", stage]); unlinkSync(tarFile);
    versions[n] = p.Version;
  }
  const usr = join(stage, TERMUX_PREFIX);
  // npm's own bin is a symlink to a script whose #! names Termux's env; the app
  // can't run that path, so replace them with wrappers that call node directly.
  for (const [bin, cli] of [["npm", "npm-cli.js"], ["npx", "npx-cli.js"]]) {
    const f = join(usr, "bin", bin); try { unlinkSync(f); } catch {}
    writeFileSync(f, `#!/system/bin/sh\nexec "$PREFIX/bin/node" "$PREFIX/lib/node_modules/npm/bin/${cli}" "$@"\n`, { mode: 0o755 });
  }
  log(`rewrote the library path in ${fixRunpaths(usr)} binaries`);
  log(`pointed ${fixShells(usr)} files at Android's shell`);
  writeFileSync(join(usr, "lib", "node-shell.cjs"), readFileSync(join(HERE, "node-shell.cjs")));
  const drop = (rel) => !DROP.some((re) => re.test(rel));
  const st = zipTree(usr, join(OUT, "runtime.zip"), drop);
  writeFileSync(join(OUT, "runtime.json"), JSON.stringify({ arch: ARCH, versions }, null, 2) + "\n");
  rmSync(stage, { recursive: true, force: true });
  log(`runtime.zip: ${st.files} files, ${st.links} links (${Object.keys(versions).length} packages)`);
}

// ---- this checkout, as `npm install -g` lays it out ----------------------------
function buildSymbiot() {
  const stage = join(OUT, "symbiot-stage"); rmSync(stage, { recursive: true, force: true }); mkdirSync(stage, { recursive: true });
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const tgz = execFileSync(npm, ["pack", "--silent", "--pack-destination", stage], { cwd: REPO, encoding: "utf8" }).trim().split("\n").pop();
  execFileSync(npm, ["install", "-g", "--prefix", join(stage, "g"), "--omit=dev", "--no-audit", "--no-fund", "--silent", join(stage, tgz)], { stdio: "inherit" });
  const pkgDir = join(stage, "g", "lib", "node_modules", "symbiot");
  const version = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
  const st = zipTree(pkgDir, join(OUT, "symbiot.zip"));
  writeFileSync(join(OUT, "symbiot.version"), version + "\n");
  rmSync(stage, { recursive: true, force: true });
  log(`symbiot.zip: symbiot ${version}, ${st.files} files`);
}

mkdirSync(OUT, { recursive: true });
if (!process.argv.includes("--symbiot-only")) await buildRuntime();
buildSymbiot();
