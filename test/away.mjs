// Away (away.mjs): the screens from xrandr, each window's place in their shared
// area, the Super+S shortcut in COSMIC's config, and open/close with a stand-in browser.
// Isolated HOME (set before the modules load).
//
//   node test/away.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-away-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const { parseMonitors, awayQueries, toggleAway, awayOpen, withShortcut, installShortcut, COSMIC_CUSTOM } = await import("../away.mjs");

  console.log("SCREENS — from xrandr --listmonitors, left to right");
  const two = parseMonitors("Monitors: 2\n 0: +eDP-1 1920/340x1080/190+1600+0  eDP-1\n 1: +HDMI-A-1 1600/440x900/250+0+0  HDMI-A-1\n");
  ok("a laptop with a screen on its left: two, the left one first", two.length === 2 && two[0].x === 0 && two[0].w === 1600 && two[1].x === 1600 && two[1].h === 1080, two);
  ok("…nothing readable: none (then one window, the orb in the middle)", parseMonitors("").length === 0 && parseMonitors("Monitors: 0\n").length === 0, "");
  const four = parseMonitors(" 0: +A 1920/1x1080/1+0+0  A\n 1: +B 1920/1x1080/1+1920+0  B\n 2: +C 1920/1x1080/1+0+1080  C\n 3: +D 1920/1x1080/1+1920+1080  D\n");
  ok("four in a square", four.length === 4, four);

  console.log("WINDOWS — each one's part of the shared area, from the same start");
  const q2 = awayQueries(two, 1000).map((q) => Object.fromEntries(new URLSearchParams(q)));
  ok("two screens: a window each, both told the whole area (3520 x 1080) and the same start", q2.length === 2 && q2.every((q) => q.away === "1" && q.n === "2" && q.gw === "3520" && q.gh === "1080" && q.t0 === "1000"), q2);
  ok("…the right-hand one starts 1600 in", q2[1].ax === "1600" && q2[1].ay === "0" && q2[1].aw === "1920", q2[1]);
  const q4 = awayQueries(four, 5).map((q) => Object.fromEntries(new URLSearchParams(q)));
  ok("four: the area is 3840 x 2160, the bottom-right one at 1920,1080", q4.length === 4 && q4[0].gw === "3840" && q4[0].gh === "2160" && q4.some((q) => q.ax === "1920" && q.ay === "1080"), q4);
  ok("can't tell: one window, the orb in the middle", awayQueries([], 1).length === 1 && /n=1/.test(awayQueries([], 1)[0]), "");

  console.log("THE SHORTCUT — Super+` (above Tab) in COSMIC's custom shortcuts; Super+S stacks windows there");
  const cmd = "/usr/bin/node /home/x/.npm-global/bin/symbiot away";
  const fresh = withShortcut("", cmd);
  ok("a new file: just ours, on Super+grave", /^\{\n {4}\(modifiers: \[Super\], key: "grave"\): Spawn\("\/usr\/bin\/node \/home\/x\/\.npm-global\/bin\/symbiot away"\),\n\}\n$/.test(fresh), fresh);
  const other = '{\n    (modifiers: [Super], key: "t"): Spawn("cosmic-term"),\n    (modifiers: [Super], key: "s"): Spawn("/usr/bin/node /x/symbiot away"),\n    (modifiers: [Super], key: "grave"): Spawn("old"),\n}\n';
  const merged = withShortcut(other, cmd);
  ok("…another shortcut is kept; an earlier one of ours (Super+S) and an old Super+grave go; ours once", /key: "t"\): Spawn\("cosmic-term"\)/.test(merged) && !/key: "s"/.test(merged) && !/Spawn\("old"\)/.test(merged) && (merged.match(/key: "grave"/g) || []).length === 1, merged);
  ok("…set twice, still once", (withShortcut(merged, cmd).match(/key: "grave"/g) || []).length === 1, "");
  ok("not COSMIC: it says how to add it yourself, and writes nothing", installShortcut({ cmd, home: HOME, desktop: "GNOME" }).manual === true, "");
  const r = installShortcut({ cmd, home: HOME, desktop: "COSMIC" });
  ok("COSMIC: written to its custom shortcuts file", r.ok && /key: "grave"\): Spawn/.test(readFileSync(COSMIC_CUSTOM(HOME), "utf8")), r);

  console.log("OPEN AND CLOSE — a window per screen; again, or open: false, closes them");
  const fake = join(HOME, "fake-chrome"), seen = join(HOME, "seen.txt");
  writeFileSync(fake, `#!/bin/sh\necho "$@" >> ${JSON.stringify(seen)}\nexec sleep 30\n`); chmodSync(fake, 0o755);
  ok("a call that names nothing opens nothing (the smoke test calls every endpoint)", toggleAway("http://127.0.0.1:1/?t=abc", undefined, { chrome: fake, scr: { list: two, display: ":0" } }).open === false && !awayOpen(), "");
  process.env.SYMBIOT_NO_OPEN = "1";
  ok("…nor does anything while windows are off (SYMBIOT_NO_OPEN, as in tests)", toggleAway("http://127.0.0.1:1/?t=abc", true, { chrome: fake, scr: { list: two, display: ":0" } }).open === false && !awayOpen(), "");
  delete process.env.SYMBIOT_NO_OPEN;
  await sleep(300);
  let seenNothing = ""; try { seenNothing = readFileSync(seen, "utf8"); } catch {}
  ok("…no browser was started for either", seenNothing === "", seenNothing);
  const o = toggleAway("http://127.0.0.1:1/?t=abc", "toggle", { chrome: fake, scr: { list: two, display: ":0" }, now: 7 });
  await sleep(400);
  const args = readFileSync(seen, "utf8").trim().split("\n");
  ok("two screens (X): two kiosk windows, each placed on its screen and told which it is", o.open && o.screens === 2 && args.length === 2 && args.every((a) => /--kiosk/.test(a)) && /--window-position=1600,0/.test(args[1]) && /--window-size=1920,1080/.test(args[1]) && /&si=0$/.test(args[0]) && /&si=1$/.test(args[1]), args);
  ok("…each its own profile, on the app's address with its place", /away\/0\b/.test(args[0]) && /away\/1\b/.test(args[1]) && /http:\/\/127\.0\.0\.1:1\/\?t=abc&away=1&n=2&ax=1600/.test(args[1]), args[1]);
  const prefs = JSON.parse(readFileSync(join(HOME, ".config", "symbiot", "away", "1", "Default", "Preferences"), "utf8")).profile.content_settings.exceptions;
  ok("…its profile lets the app's address (only) see the screens and go full screen without a click", prefs.window_placement["http://127.0.0.1:1,*"].setting === 1 && prefs.automatic_fullscreen["http://127.0.0.1:1,*"].setting === 1 && Object.keys(prefs.window_placement).length === 1, prefs);
  ok("…open", awayOpen(), "");
  const c = toggleAway("http://127.0.0.1:1/?t=abc", "toggle", { chrome: fake, scr: { list: two, display: ":0" } });
  await sleep(300);
  ok("again: closed", c.open === false && !awayOpen(), c);
  ok("closing what isn't open is fine", toggleAway("x", false).open === false, "");
  const { grantProfile, placeable } = await import("../away.mjs");
  ok("windows go on screens under X only; under Wayland (COSMIC, GNOME, KDE) it's one window where you are", placeable({ XDG_SESSION_TYPE: "x11" }) && !placeable({ XDG_SESSION_TYPE: "wayland", WAYLAND_DISPLAY: "wayland-1", DISPLAY: ":1" }) && placeable({ DISPLAY: ":0" }), "");
  writeFileSync(seen, "");
  const w1 = toggleAway("http://127.0.0.1:1/?t=abc", true, { chrome: fake, scr: { list: [], display: "" }, now: 3 }); await sleep(400);
  const a1 = readFileSync(seen, "utf8").trim().split("\n");
  ok("…one window: full screen, the orb in the middle (n=1), not placed", w1.open && a1.length === 1 && /--kiosk/.test(a1[0]) && /away=1&n=1&/.test(a1[0]) && !/--window-position/.test(a1[0]), a1);
  toggleAway("x", false);
  const gd = join(HOME, "gp"); mkdirSync(join(gd, "Default"), { recursive: true });
  writeFileSync(join(gd, "Default", "Preferences"), JSON.stringify({ browser: { x: 1 }, profile: { content_settings: { exceptions: { notifications: { a: 1 } } } } }));
  grantProfile(gd, "http://127.0.0.1:9");
  const gp = JSON.parse(readFileSync(join(gd, "Default", "Preferences"), "utf8"));
  ok("granting keeps what the profile had", gp.browser.x === 1 && gp.profile.content_settings.exceptions.notifications.a === 1 && gp.profile.content_settings.exceptions.window_placement["http://127.0.0.1:9,*"].setting === 1, gp);
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} away: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
