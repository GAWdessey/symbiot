// Preloaded into every Node the Android app starts (NODE_OPTIONS=--require).
// Termux builds Node so exec/execSync and `shell: true` run Termux's own
// /data/data/com.termux/files/usr/bin/sh, which doesn't exist without Termux.
// This puts stock Node's Android shell back: /system/bin/sh.
"use strict";
const cp = require("child_process");
const { promisify } = require("util");
const SH = "/system/bin/sh";
const shell = (o, dflt) => {
  o = o == null ? {} : o;
  return o.shell === true || (dflt && o.shell === undefined) ? { ...o, shell: SH } : o;
};
const wrap = (name, fix) => {
  const orig = cp[name];
  const fn = function (...a) { return orig.apply(this, fix(a)); };
  const custom = orig[promisify.custom];
  if (custom) fn[promisify.custom] = (...a) => custom(...fix(a));
  cp[name] = fn;
};
// exec(cmd[, options][, callback]): always through a shell
for (const name of ["exec", "execSync"]) wrap(name, (a) => (typeof a[1] === "function" || a.length < 2 ? [a[0], shell({}, true), ...a.slice(1)] : [a[0], shell(a[1], true), ...a.slice(2)]));
// spawn(file[, args][, options]) and friends: only when they ask for shell: true
for (const name of ["spawn", "spawnSync", "execFile", "execFileSync"]) wrap(name, (a) => a.map((x, i) => (i > 0 && x && typeof x === "object" && !Array.isArray(x) ? shell(x, false) : x)));
require("module").syncBuiltinESMExports(); // so `import { execSync } from "node:child_process"` sees these too
