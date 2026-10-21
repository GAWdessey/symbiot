#!/usr/bin/env node
// The phone's code relay on a real phone, end to end. On Android, CodeListener hands a
// notification with a code in it to the phone's own Symbiot, which passes only the code on to
// the card on your computer that waits for it (phone.mjs heardCode, then code.give), and the
// computer keeps it in the vault for one use. test/codes.mjs covers both ends in Node; this is
// the part only a phone can show: Android's Notification access, a real notification's words,
// and the trip from the phone to the computer. Not part of the npm package.
//
// Run it on the computer the phone is paired with, outside any sandbox (it needs adb, the phone
// on the same network or a cable, and Symbiot's app running here):
//
//   node scripts/phone-codes-check.mjs [--serial <adb serial>] [--install] [--wait <seconds>] [--keep]
//
//   --install   put the release's phone app on the phone when the one there is older
//   --wait      how long to wait for the phone's switch to be pressed (default 300)
//   --keep      leave the scratch question, the test code and Notification access for a look
//
// What it changes, and puts back unless --keep: a scratch question in drafts/ (a card on Home and
// on the phone while it runs), Notification access for Symbiot (only if it was off), and one test
// code in the vault. The test notifications come from Android's shell, so no SMS is sent.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// The scratch question and the notifications: test/codes.mjs checks phone.mjs reads them as meant
const SITE = "codecheck.dev", NAME = `${SITE} code`, QUESTION = `What's the 6-digit code ${SITE} texted you?`;
const QUESTIONS_MD = (day) => `## Questions\n### ${QUESTION}\nA check of your phone passing codes on, started ${day}: nothing waits for this code and nothing signs in with it. It goes by itself once the check ends.\n- 👤 You (only you: the SMS code): let your phone pass it on\n- Skip this part\n`;
const TASKS_MD = (day) => `# A check of the phone passing codes on (${day})\n- [x] Nothing to do here: scripts/phone-codes-check.mjs reads the vault itself. Don't read or use the code, and stop.\n`;
const NOTE = (code) => ({ title: "Codecheck", text: `Your Codecheck verification code is ${code}. Do not share it.` });
const DECOY = { title: "PayPal", text: "PayPal: your code is 902211" };
const PKG = "co.symbiot.app", LISTENER = `${PKG}/${PKG}.CodeListener`, REPO = "GAWdessey/symbiot";

async function main() {
  const argv = process.argv.slice(2), flag = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; }, has = (k) => argv.includes("--" + k);
  const CFG = join(homedir(), ".config", "symbiot"), WAIT = Number(flag("wait", 300)) * 1000;
  let pass = 0, fail = 0, n = 0;
  const ok = (what, c, got) => { if (c) { pass++; console.log("  ✓ " + what); } else { fail++; console.log("  ✗ " + what + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } return c; };
  const step = (s) => console.log(`\nStep ${++n}: ${s}`);
  const stop = (why) => { console.log(`\n✗ stopped: ${why}`); return finish(); };
  const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }).trim(); } catch (e) { return e.stdout ? String(e.stdout).trim() || null : null; } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const code = () => String(100000 + Math.floor(Math.random() * 900000)), A = code(); let B = code(); while (B === A) B = code();
  const day = new Date().toISOString().slice(0, 10), scratch = join(CFG, "drafts", "act-codecheck-" + Date.now().toString(36));
  let serial = flag("serial", ""), granted = false;
  const adb = (...a) => sh("adb", [...(serial ? ["-s", serial] : []), ...a]);
  const vault = (...a) => sh("symbiot", ["secret", ...a]);
  const answers = () => { try { return readFileSync(join(scratch, ".symbiot", "ANSWERS.md"), "utf8"); } catch { return ""; } };
  const post = (tag, { title, text }) => adb("shell", `cmd notification post -S bigtext -t '${title}' ${tag} '${text}'`);
  // put back what the check changed (all of it ours: the scratch folder by its name, the code by its name)
  async function finish() {
    if (!has("keep")) {
      if (vault("get", NAME) !== null) vault("delete", NAME);
      // the code's answer starts a run there (answerQuestions rerun), told to stop at once: let it end first
      const pid = () => { try { const l = JSON.parse(readFileSync(join(scratch, ".symbiot", "agent.pid"), "utf8")); process.kill(l.pid || l.owner, 0); return true; } catch { return false; } };
      for (let i = 0; i < 60 && pid(); i++) await sleep(2000);
      if (/act-codecheck-/.test(scratch) && existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
      if (granted) adb("shell", "cmd", "notification", "disallow_listener", LISTENER);
    } else console.log(`\nKept: ${scratch}, "${NAME}" in the vault${granted ? ", Notification access" : ""}.`);
    console.log(`\n${fail ? "✗" : "✓"} phone codes: ${pass} passed, ${fail} failed`);
    return fail ? 1 : 0;
  }

  step("Symbiot here has the code relay, and is the one running");
  const bin = sh("sh", ["-c", "command -v symbiot"]), pkg = bin && dirname(realpathSync(bin));
  if (!ok("symbiot is installed", !!pkg)) return stop("no symbiot on this computer's PATH");
  const version = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).version;
  if (!ok(`${version} passes codes from a phone`, readFileSync(join(pkg, "phone.mjs"), "utf8").includes("code.give"), version)) return stop(`${version} came out before the code relay: install the release that has it, then run this again`);
  const { loadConfig } = await import(pathToFileURL(join(pkg, "core.mjs")).href), cfg = loadConfig(), base = `http://127.0.0.1:${Number(cfg.appPort) || 7391}`, headers = { "x-symbiot-token": cfg.appToken || "" };
  const api = async (path) => { try { const r = await fetch(base + path, { headers, signal: AbortSignal.timeout(5000) }); return r.ok ? await r.json() : null; } catch { return null; } };
  const ping = await api("/api/ping");
  if (!ok("the app is running", !!ping)) return stop("Symbiot's app isn't running here: start it, then run this again");
  if (!ok(`it runs ${version}, the one installed`, ping.version === version, ping.version)) return stop("the app still runs the old version: restart it");
  const link = await api("/api/phone"), seen = Math.max(0, ...((link && link.phones) || []).map((p) => Number(p.seen) || 0));
  if (!ok("a phone is paired and heard from in the last 15 minutes", Date.now() - seen < 15 * 60000, link && link.phones)) return stop("no paired phone has been in touch: open Symbiot on the phone (or pair it under Settings → Phone), then run this again");

  step("the phone is reachable over adb");
  if (!serial) {
    const listed = () => (sh("adb", ["devices"]) || "").split("\n").slice(1).map((l) => l.split(/\s+/)).filter((x) => x[1] === "device").map((x) => x[0]);
    if (!listed().length) for (const l of (sh("avahi-browse", ["-rpt", "_adb-tls-connect._tcp"]) || "").split("\n")) { const f = l.split(";"); if (f[0] === "=" && f[2] === "IPv4") sh("adb", ["connect", `${f[7]}:${f[8]}`]); }
    serial = listed()[0] || "";
  }
  if (!ok("a phone answers adb", !!serial && adb("get-state") === "device", serial)) return stop("no phone on adb: turn on Wireless debugging on the phone (Developer options), or pass --serial");
  console.log(`  ${adb("shell", "getprop", "ro.product.model")} (${serial})`);

  step("the phone app has CodeListener, and Notification access");
  const dump = () => adb("shell", "dumpsys", "package", PKG) || "", appVersion = () => (dump().match(/versionName=(\S+)/) || [])[1] || "";
  const older = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };
  let app = appVersion();
  if ((!app || older(app, version)) && has("install")) {
    const apk = join(tmpdir(), `symbiot-${version}-aarch64.apk`), url = `https://github.com/${REPO}/releases/download/apk-${version}/symbiot-${version}-aarch64.apk`;
    try { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); writeFileSync(apk, Buffer.from(await r.arrayBuffer())); } catch (e) { return stop(`couldn't download the ${version} phone app (${url}): ${e.message}`); }
    console.log("  " + (adb("install", "-r", apk) || "install said nothing")); app = appVersion();
  }
  if (!ok(`the phone app is ${version} or newer`, !!app && !older(app, version), app)) return stop(app ? `the phone has ${app}: run again with --install` : "Symbiot isn't on the phone: run again with --install");
  if (!ok("it has CodeListener", /\.CodeListener\b/.test(dump()))) return stop("that phone app has no code relay");
  const listeners = () => adb("shell", "settings", "get", "secure", "enabled_notification_listeners") || "";
  if (!listeners().includes(LISTENER)) { adb("shell", "cmd", "notification", "allow_listener", LISTENER); granted = true; }
  if (!ok(`Notification access is on${granted ? " (turned on for this check)" : ""}`, listeners().includes(LISTENER), listeners())) return stop("Android didn't take Notification access for Symbiot");

  step(`a scratch question waits for ${SITE}'s code`);
  mkdirSync(join(scratch, ".symbiot"), { recursive: true });
  writeFileSync(join(scratch, ".symbiot", "QUESTIONS.md"), QUESTIONS_MD(day)); writeFileSync(join(scratch, ".symbiot", "TASKS.md"), TASKS_MD(day));
  ok(`no "${NAME}" in the vault before`, vault("get", NAME) === null);
  const before = new Set((vault("list") || "").split("\n").map((l) => l.split("  ")[0]).filter(Boolean));
  console.log(`  ${scratch}\n\n  On the phone: open Symbiot, find the card "${QUESTION}"\n  and press "Let this phone pass on ${SITE}'s code". Waiting up to ${WAIT / 1000} s.`);

  step("a code notification reaches the vault, and only the code");
  let got = null; const until = Date.now() + WAIT;
  for (let last = 0; Date.now() < until && got !== A;) {
    if (Date.now() - last > 20000) { post("codecheck", NOTE(A)); last = Date.now(); } // again until the switch is on: same tag, so one notification
    await sleep(2000); got = vault("get", NAME);
  }
  if (!ok(`"${NAME}" is in the vault, and it's the code the notification had`, got === A, got)) return stop("the code never came: was the switch pressed? (check the card on the phone)");
  const ans = answers(), blocks = ans.split(`### ${QUESTION}`).length - 1;
  ok("the card got one answer, naming the vault entry", blocks === 1 && ans.includes(`"${NAME}"`), ans.slice(-400));
  ok("…with no code and none of the message in it", !ans.includes(A) && !/share/i.test(ans), ans.slice(-400));
  const added = (vault("list") || "").split("\n").map((l) => l.split("  ")[0]).filter((x) => x && !before.has(x));
  ok("the vault gained that one entry and nothing else", added.length === 1 && added[0] === NAME, added);

  step("once: a second code for the same site, and another site's, go nowhere");
  post("codecheck", NOTE(B)); await sleep(5000); post("codecheck", NOTE(B)); post("codecheck-decoy", DECOY);
  await sleep(45000); // a few of the phone's polls
  const now = vault("get", NAME), ans2 = answers();
  ok("the vault still has the first code (or none, if it was used): not the second", now === A || now === null, now);
  ok("still one answer, with neither code in it", ans2.split(`### ${QUESTION}`).length - 1 === 1 && !ans2.includes(A) && !ans2.includes(B), ans2.slice(-400));
  const added2 = (vault("list") || "").split("\n").map((l) => l.split("  ")[0]).filter((x) => x && !before.has(x) && x !== NAME);
  ok("nothing kept from the other site", !added2.length, added2);
  return finish();
}

export { SITE, NAME, QUESTION, QUESTIONS_MD, NOTE, DECOY };
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exit(await main());
