// symbiot — Away: Symbiot full screen on every screen while you're away from the
// desk (Super+S, or `symbiot away`): the orb at rest, the time, and what's going on
// (agents at work and what they're doing, how much waits on you), counts only, no
// one's words. One screen: the orb in the middle. More: it bounces across all of
// them, one kiosk window per screen, each working out where the orb is from the
// same clock over the screens' shared area and drawing it while it's on that
// screen, so it crosses from one to the next with nothing passed between them.
// That needs windows placed on screens, which only X allows: under Wayland (COSMIC,
// GNOME, KDE) no app can put a window on a screen, and COSMIC ignored every way tried
// (X moves, Chrome's position flags, fullscreen on a given screen, a keypress for its
// own move-to-screen shortcut). So under Wayland it's one window, full screen where
// you are, the orb in the middle. Each window's profile lets Symbiot's address see the
// screens and go full screen without a click, so nothing asks.
// Any key or click, or Super+S again, closes every window. Not a lock: Super+Esc
// locks the computer.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { CONFIG_DIR, chromeBinary } from "./core.mjs";

// The screens, from `xrandr --listmonitors` (X, and XWayland under COSMIC, GNOME and
// KDE): [{ x, y, w, h }], left to right. [] when it can't tell (then one window).
function parseMonitors(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/^\s*\d+:\s+\S+\s+(\d+)\/\d+x(\d+)\/\d+\+(-?\d+)\+(-?\d+)/gm)) out.push({ w: +m[1], h: +m[2], x: +m[3], y: +m[4] });
  return out.sort((a, b) => a.x - b.x || a.y - b.y);
}
function screens() {
  for (const d of [process.env.DISPLAY, ":0", ":1"].filter(Boolean)) {
    const r = spawnSync("xrandr", ["--listmonitors"], { encoding: "utf8", timeout: 3000, env: { ...process.env, DISPLAY: d } });
    const s = r.status === 0 ? parseMonitors(r.stdout) : [];
    if (s.length) return { list: s, display: d };
  }
  return { list: [], display: "" };
}
// Each window's place in the shared area: { x, y, w, h } plus the area's size, as
// the page's query (?away=1&ax=…&ay=…&gw=…&gh=…&n=…&t0=…).
function awayQueries(list, t0 = Date.now()) {
  if (!list.length) return [`away=1&n=1&t0=${t0}`];
  const x0 = Math.min(...list.map((s) => s.x)), y0 = Math.min(...list.map((s) => s.y));
  const gw = Math.max(...list.map((s) => s.x + s.w)) - x0, gh = Math.max(...list.map((s) => s.y + s.h)) - y0;
  return list.map((s) => `away=1&n=${list.length}&ax=${s.x - x0}&ay=${s.y - y0}&aw=${s.w}&ah=${s.h}&gw=${gw}&gh=${gh}&t0=${t0}`);
}

let KIDS = [];
const awayOpen = () => KIDS.some((k) => k.exitCode === null && !k.killed);
function closeAway() {
  for (const k of KIDS) { try { process.kill(-k.pid, "SIGTERM"); } catch { try { k.kill("SIGTERM"); } catch {} } }
  const n = KIDS.length; KIDS = []; return n;
}
// The two permissions an Away window needs, for the app's address only, in the
// window's own profile: the screens (window_placement) and fullscreen without a
// click (automatic_fullscreen). Chrome keeps them when it writes the file back.
function grantProfile(dir, origin) {
  const f = join(dir, "Default", "Preferences"); let p = {}; try { p = JSON.parse(readFileSync(f, "utf8")) || {}; } catch {}
  const ex = (((p.profile ||= {}).content_settings ||= {}).exceptions ||= {});
  for (const k of ["window_placement", "automatic_fullscreen"]) (ex[k] ||= {})[`${origin},*`] = { setting: 1 };
  try { mkdirSync(join(dir, "Default"), { recursive: true }); writeFileSync(f, JSON.stringify(p)); } catch {}
}
// Opens a window per screen on the app's url (http://127.0.0.1:port/?t=token), the
// i-th told it's for screen i (si). Each has a profile of its own under Symbiot's
// config, so its flags take (a window for a profile already open would join that
// browser and ignore them).
const placeable = (env = process.env) => (env.XDG_SESSION_TYPE || "").toLowerCase() === "x11" || (!env.WAYLAND_DISPLAY && !!env.DISPLAY);
function openAway(url, { chrome = chromeBinary(), scr = placeable() ? screens() : { list: [], display: "" }, now = Date.now() } = {}) {
  if (!chrome) return { error: "Away needs Chrome or Chromium on this computer." };
  closeAway();
  const qs = awayQueries(scr.list, now);
  const origin = (String(url).match(/^https?:\/\/[^/?#]+/) || [""])[0];
  qs.forEach((q, i) => {
    const s = scr.list[i], dir = join(CONFIG_DIR, "away", String(i)); grantProfile(dir, origin);
    const args = ["--user-data-dir=" + dir, "--no-first-run", "--no-default-browser-check", "--disable-session-crashed-bubble", "--hide-crash-restore-bubble", "--noerrdialogs", "--kiosk"];
    if (s) args.push(`--window-position=${s.x},${s.y}`, `--window-size=${s.w},${s.h}`); // X places it on its screen
    args.push(url + (url.includes("?") ? "&" : "?") + q + `&si=${i}`);
    try { const k = spawn(chrome, args, { detached: true, stdio: "ignore", env: { ...process.env, ...(s && scr.display ? { DISPLAY: scr.display } : {}) } }); k.on("exit", () => {}); k.unref(); KIDS.push(k); } catch {}
  });
  return { open: KIDS.length > 0, screens: Math.max(1, scr.list.length) };
}
// Open, close (open: false) or, with neither said, the other way round.
function toggleAway(url, open, deps) {
  const want = open === undefined || open === null ? !awayOpen() : !!open;
  if (!want) { closeAway(); return { open: false }; }
  return openAway(url, deps);
}

// ---- the shortcut -------------------------------------------------------------
// Super+S runs `symbiot away`. COSMIC: a custom shortcut in its config (it reloads
// it as it changes; one for Super+S takes over the default there, which stacks
// windows). Elsewhere it says how to add one.
const COSMIC_CUSTOM = (home = homedir()) => join(home, ".config", "cosmic", "com.system76.CosmicSettings.Shortcuts", "v1", "custom");
function shortcutLine(cmd) { return `    (modifiers: [Super], key: "s"): Spawn(${JSON.stringify(cmd)}),`; }
// The new custom file: whatever was there, minus any Super+S, plus ours.
function withShortcut(text, cmd) {
  const body = String(text || "").trim().replace(/^\{/, "").replace(/\}\s*$/, "");
  const kept = body.split("\n").filter((l) => l.trim() && !/\(modifiers:\s*\[\s*Super\s*,?\s*\],\s*key:\s*"s"\s*\)/.test(l));
  return "{\n" + [...kept.map((l) => l.replace(/\s*$/, "")), shortcutLine(cmd)].join("\n") + "\n}\n";
}
function installShortcut({ cmd, home = homedir(), desktop = process.env.XDG_CURRENT_DESKTOP || "" } = {}) {
  if (!/cosmic/i.test(desktop)) return { manual: true, note: `Add a keyboard shortcut in your desktop's settings: Super+S runs  ${cmd}` };
  const f = COSMIC_CUSTOM(home);
  let had = ""; try { had = existsSync(f) ? readFileSync(f, "utf8") : ""; } catch {}
  try { mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, withShortcut(had, cmd)); } catch (e) { return { error: "Couldn't write " + f + ": " + ((e && e.message) || e) }; }
  return { ok: true, file: f, replaced: /key:\s*"s"/.test(had) };
}

export { placeable, grantProfile, parseMonitors, screens, awayQueries, openAway, closeAway, awayOpen, toggleAway, withShortcut, installShortcut, COSMIC_CUSTOM };
