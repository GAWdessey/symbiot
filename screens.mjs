// symbiot — Screens: screenshots with named regions, i.e. a blueprint of where
// things are on a screen, in screenshot pixels. The first slices of screen
// automation: it captures, stores and maps, and clicks a region's centre when
// asked (the app confirms each click). Nothing types yet.
//
// Stored in ~/.config/symbiot/screens/: <id>.png per screen, and screens.json =
// [{ id, name, w, h, ts, via, regions: [{ id, label, x, y, w, h }] }], which is
// also what an agent or script reads to find a region.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync, renameSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { CONFIG_DIR, hasCmd } from "./core.mjs";

const SCREENS_DIR = join(CONFIG_DIR, "screens");
const INDEX = join(SCREENS_DIR, "screens.json");
const MAX_REGIONS = 200;
const MAX_IMAGE = 40 * 1024 * 1024;
function loadScreens() { try { const a = JSON.parse(readFileSync(INDEX, "utf8")); return Array.isArray(a) ? a : []; } catch { return []; } }
function saveScreens(a) { mkdirSync(SCREENS_DIR, { recursive: true }); writeFileSync(INDEX, JSON.stringify(a, null, 2)); }
const validId = (id) => /^[a-f0-9]{12}$/.test(String(id || ""));
const screenFile = (id) => join(SCREENS_DIR, id + ".png");
// The PNG's own file, or "" (ids are checked, so a request can't reach outside the folder).
function screenImage(id) { return validId(id) && existsSync(screenFile(id)) ? screenFile(id) : ""; }

// Width and height from a PNG's IHDR chunk, or null if it isn't a PNG.
function pngSize(buf) {
  if (!buf || buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a || buf.toString("ascii", 12, 16) !== "IHDR") return null;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  return w && h ? { w, h } : null;
}

// Windows: user32 calls for PowerShell. DPI-aware first, so with display scaling
// the capture is the whole screen in real pixels and a click lands in the same ones.
const WIN_USER32 = "Add-Type -Namespace Symbiot -Name User32 -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware(); [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int x, int y); [DllImport(\"user32.dll\")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, System.UIntPtr e);'; ";
const WIN_DPI = WIN_USER32 + "[Symbiot.User32]::SetProcessDPIAware() | Out-Null; ";
// -EncodedCommand (base64 UTF-16LE) carries the script's quotes through untouched.
const psEncoded = (script) => ["powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")]];

// Screenshot tools to try, in order, as [cmd, args] that write a PNG to `file`,
// or [cmd, args, dir] for a tool that only takes a folder (it picks the name).
// scrot and import only see X11, which on Wayland is a blank screen, so they're
// left out there.
function captureCmds(file, platform = process.platform, wayland = process.env.XDG_SESSION_TYPE === "wayland") {
  if (platform === "darwin") return [["screencapture", ["-x", "-t", "png", file]]];
  if (platform === "win32") {
    const ps = WIN_DPI + "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b = [System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size); $bmp.Save('" + file.replace(/'/g, "''") + "', [System.Drawing.Imaging.ImageFormat]::Png)";
    return [psEncoded(ps)];
  }
  const dir = file.replace(/\.png$/, ".d");
  return [["gnome-screenshot", ["-f", file]], ["spectacle", ["-b", "-n", "-f", "-o", file]], ["cosmic-screenshot", ["--interactive=false", "--modal=false", "--notify=false", "--save-dir", dir], dir], ["grim", [file]],
    ["xfce4-screenshooter", ["-f", "-s", file]], ...(wayland ? [] : [["scrot", [file]], ["import", ["-window", "root", file]]])];
}
// On Wayland, cosmic-screenshot (and other portal tools) ask xdg-desktop-portal,
// which keys its screenshot permission on the app that started us: the systemd
// unit in our cgroup, app[-<launcher>]-<AppID>-<random>.scope or
// app[-<launcher>]-<AppID>[@<random>].service. Started from the COSMIC dock,
// that's com.system76.CosmicAppList; from a terminal, "" (no app id).
function portalAppId(cgroup) {
  const unit = String(cgroup || "").trim().split("\n").pop().split("/").pop();
  const m = unit.match(/^app-(?:[A-Za-z0-9]+-)?(.+?)(?:-[^-]*)?\.scope$/) || unit.match(/^app-(?:[A-Za-z0-9]+-)?(.+?)(?:@.*)?\.service$/);
  const id = m ? m[1].replace(/\\x2d/g, "-") : "";
  return /^[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)+$/.test(id) ? id : "";
}
const PERMS = ["--session", "--dest", "org.freedesktop.impl.portal.PermissionStore", "--object-path", "/org/freedesktop/impl/portal/PermissionStore", "--method"];
// The app id the portal has screenshots turned off for (it answers "no" without
// asking again), or "" when they're allowed, unset or it can't be read.
function screenshotBlocked() {
  if (process.platform !== "linux" || !hasCmd("gdbus")) return "";
  let id = ""; try { id = portalAppId(readFileSync("/proc/self/cgroup", "utf8")); } catch {}
  if (!id) return "";
  const out = String(spawnSync("gdbus", ["call", ...PERMS, "org.freedesktop.impl.portal.PermissionStore.Lookup", "screenshot", "screenshot"], { encoding: "utf8", timeout: 5000 }).stdout || "");
  const m = out.match(new RegExp("'" + id.replace(/[.\\-]/g, "\\$&") + "': \\['(\\w+)'"));
  return m && m[1] === "no" ? id : "";
}
// Turn screenshots on for the app id that blocks them. Only when the user asks,
// in the app: it's their desktop's permission, and it covers every app started
// the same way (e.g. everything from the COSMIC dock).
function allowScreenshots() {
  const id = screenshotBlocked(); if (!id) return { error: "Screenshots aren't turned off for Symbiot. Try Capture screen again." };
  const p = spawnSync("gdbus", ["call", ...PERMS, "org.freedesktop.impl.portal.PermissionStore.SetPermission", "screenshot", "true", "screenshot", id, "['yes']"], { encoding: "utf8", timeout: 5000 });
  return p.status === 0 ? { ok: true, app: id } : { error: "Couldn't change the permission: " + (String(p.stderr || "").trim() || "exit " + p.status) };
}
function addScreen(id, name, size, via) {
  const s = { id, name: String(name || "").trim().slice(0, 80) || "Screen " + new Date().toLocaleString(), w: size.w, h: size.h, ts: Date.now(), via, regions: [] };
  saveScreens([s, ...loadScreens()]);
  return s;
}
// Take a screenshot of the whole screen with the first tool that works here.
function captureScreen(name) {
  const id = randomBytes(6).toString("hex"), file = screenFile(id), tried = [];
  try { mkdirSync(SCREENS_DIR, { recursive: true }); } catch (e) { return { error: String((e && e.message) || e) }; }
  const posix = process.platform !== "win32" && process.platform !== "darwin";
  for (const [cmd, args, dir] of captureCmds(file)) {
    if (posix && !hasCmd(cmd)) continue;
    tried.push(cmd);
    if (dir) try { mkdirSync(dir, { recursive: true }); } catch {}
    spawnSync(cmd, args, { stdio: "ignore", timeout: 20000, killSignal: "SIGKILL" });
    if (dir) { try { const f = readdirSync(dir).find((x) => /\.png$/i.test(x)); if (f) renameSync(join(dir, f), file); } catch {} rmSync(dir, { recursive: true, force: true }); }
    let size = null; try { size = pngSize(readFileSync(file)); } catch {}
    if (size) return addScreen(id, name, size, cmd);
    try { unlinkSync(file); } catch {}
  }
  const blocked = tried.length && screenshotBlocked();
  if (blocked) return { error: `Your desktop has screenshots turned off for apps started from ${blocked}, which is how Symbiot was started (tried ${tried.join(", ")}). Allow screenshots to turn them back on, or take one yourself and use Load image.`, blocked };
  return { error: tried.length ? `Couldn't take a screenshot (tried ${tried.join(", ")}). Take one yourself and use Load image.` : "No screenshot tool found. Install gnome-screenshot, spectacle, grim or scrot, or take one yourself and use Load image." };
}
// A PNG you already have (base64, or a data: URL), for when capture can't run.
function importScreen(name, data) {
  const buf = Buffer.from(String(data || "").replace(/^data:[^,]*,/, ""), "base64");
  if (buf.length > MAX_IMAGE) return { error: "That image is too big (40 MB at most)." };
  const size = pngSize(buf); if (!size) return { error: "That isn't a PNG image." };
  const id = randomBytes(6).toString("hex");
  try { mkdirSync(SCREENS_DIR, { recursive: true }); writeFileSync(screenFile(id), buf); } catch (e) { return { error: String((e && e.message) || e) }; }
  return addScreen(id, name, size, "loaded");
}
// Replace a screen's regions, clamped to the image and rounded to whole pixels.
function setRegions(id, regions) {
  const all = loadScreens(), s = all.find((x) => x.id === id); if (!s) return { error: "not found" };
  const out = [];
  for (const r of (Array.isArray(regions) ? regions : []).slice(0, MAX_REGIONS)) {
    if (!r) continue;
    const x = Math.max(0, Math.min(s.w - 1, Math.round(Number(r.x) || 0))), y = Math.max(0, Math.min(s.h - 1, Math.round(Number(r.y) || 0)));
    const w = Math.max(1, Math.min(s.w - x, Math.round(Number(r.w) || 0))), h = Math.max(1, Math.min(s.h - y, Math.round(Number(r.h) || 0)));
    out.push({ id: validId(r.id) ? r.id : randomBytes(6).toString("hex"), label: String(r.label || "").trim().slice(0, 80) || "region " + (out.length + 1), x, y, w, h });
  }
  s.regions = out; saveScreens(all);
  return s;
}
function renameScreen(id, name) {
  const all = loadScreens(), s = all.find((x) => x.id === id); if (!s) return { error: "not found" };
  s.name = String(name || "").trim().slice(0, 80) || s.name; saveScreens(all); return s;
}
function removeScreen(id) {
  const all = loadScreens(); if (!all.some((x) => x.id === id)) return { error: "not found" };
  saveScreens(all.filter((x) => x.id !== id));
  try { if (validId(id)) unlinkSync(screenFile(id)); } catch {}
  return { ok: true };
}
const center = (r) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });
// What automation reads: each region with the point to aim at (its centre).
function blueprint(s) {
  return { screen: s.name, size: { w: s.w, h: s.h }, regions: (s.regions || []).map((r) => ({ label: r.label, x: r.x, y: r.y, w: r.w, h: r.h, center: center(r) })) };
}

// Click tools to try, in order, as a list of [cmd, args] steps that move the
// mouse to (x, y) and left-click there. xdotool only reaches X11 windows, so on
// Wayland it's ydotool (it needs /dev/uinput). ydotool 1.x moves relative unless
// told --absolute and takes a button code; 0.1.x (Debian/Ubuntu) moves to the
// point and takes a button number. On Windows, PowerShell: SetCursorPos, offset
// by the virtual screen's corner (the capture's 0,0), then left down + up.
function clickCmds(x, y, platform = process.platform, wayland = process.env.XDG_SESSION_TYPE === "wayland", ydotool1 = false) {
  x = String(Math.round(Number(x)) || 0); y = String(Math.round(Number(y)) || 0);
  if (platform === "darwin") return [[["cliclick", ["c:" + x + "," + y]]]];
  if (platform === "win32") return [[psEncoded(WIN_DPI + "Add-Type -AssemblyName System.Windows.Forms; $b = [System.Windows.Forms.SystemInformation]::VirtualScreen; if (-not [Symbiot.User32]::SetCursorPos($b.Left + " + x + ", $b.Top + " + y + ")) { [Console]::Error.WriteLine('SetCursorPos failed'); exit 1 }; Start-Sleep -Milliseconds 50; [Symbiot.User32]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); [Symbiot.User32]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)")]];
  const ydo = ydotool1 ? [["ydotool", ["mousemove", "--absolute", "-x", x, "-y", y]], ["ydotool", ["click", "0xC0"]]] : [["ydotool", ["mousemove", x, y]], ["ydotool", ["click", "1"]]];
  const xdo = [["xdotool", ["mousemove", "--sync", x, y, "click", "1"]]];
  return wayland ? [ydo] : [xdo, ydo];
}
const ydotoolIs1 = () => /absolute/i.test(String(spawnSync("ydotool", ["mousemove", "--help"], { encoding: "utf8", timeout: 5000 }).stdout || ""));
// The size of the screen in the units the click tool uses, when it can be read:
// on macOS screencapture saves Retina pixels but cliclick takes points.
function clickSpace(tool) {
  const run = (cmd, args) => String(spawnSync(cmd, args, { encoding: "utf8", timeout: 5000 }).stdout || "");
  const m = tool === "xdotool" ? run("xdotool", ["getdisplaygeometry"]).match(/(\d+)\s+(\d+)/)
    : tool === "cliclick" ? run("osascript", ["-l", "JavaScript", "-e", "ObjC.import('AppKit'); var f = $.NSScreen.screens.objectAtIndex(0).frame; f.size.width + ' ' + f.size.height"]).match(/(\d+)\s+(\d+)/) : null;
  return m && +m[1] && +m[2] ? { w: +m[1], h: +m[2] } : null;
}
// Move the mouse to a region's centre and click it. The caller confirms first:
// it clicks whatever is at that spot on the screen right now.
function clickRegion(id, regionId) {
  const s = loadScreens().find((x) => x.id === id); if (!s) return { error: "not found" };
  const r = (s.regions || []).find((x) => x.id === regionId); if (!r) return { error: "That region is gone. Reload the screen." };
  const c = center(r), wayland = process.env.XDG_SESSION_TYPE === "wayland";
  // The first tool that's installed does it. If that fails it says so, rather
  // than trying the next one: a half-done move + click could otherwise click twice.
  const tool = clickCmds(c.x, c.y).map((st) => st[0][0]).find((t) => hasCmd(t));
  if (tool) {
    const sp = clickSpace(tool), x = sp ? Math.round(c.x * sp.w / s.w) : c.x, y = sp ? Math.round(c.y * sp.h / s.h) : c.y;
    const steps = clickCmds(x, y, process.platform, wayland, tool === "ydotool" && ydotoolIs1()).find((st) => st[0][0] === tool);
    for (const [cmd, args] of steps) {
      const p = spawnSync(cmd, args, { encoding: "utf8", timeout: 10000, killSignal: "SIGKILL" });
      if (p.status !== 0) return { error: `${tool} couldn't click: ` + (String(p.stderr || (p.error && p.error.message) || "").trim().split("\n").filter((l) => l && !/notice:/.test(l)).pop() || "exit " + p.status) };
    }
    return { ok: true, label: r.label, x, y, via: tool };
  }
  const want = process.platform === "darwin" ? "cliclick (brew install cliclick)" : process.platform === "win32" ? "Windows PowerShell" : wayland ? "ydotool" : "xdotool or ydotool";
  return { error: `No click tool found. Install ${want}.` };
}

export { loadScreens, screenImage, pngSize, captureCmds, portalAppId, allowScreenshots, captureScreen, importScreen, setRegions, renameScreen, removeScreen, blueprint, clickCmds, clickRegion };
