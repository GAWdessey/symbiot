// symbiot — Screens: screenshots with named regions, i.e. a blueprint of where
// things are on a screen, in screenshot pixels. The first slices of screen
// automation: it captures, stores and maps, and clicks a region's centre when
// asked (the app confirms each click). Nothing types yet.
//
// Stored in ~/.config/symbiot/screens/: <id>.png per screen, and screens.json =
// [{ id, name, w, h, ts, via, monitor?, regions: [{ id, label, x, y, w, h }] }],
// which is also what an agent or script reads to find a region. `monitor` is set
// when the screen is one display of several: { name, x, y, w, h, where } is where
// that display sits on the desktop, in the units the click tool uses. `page`
// ({ url, title }) is set on a web page mapped in the hidden browser
// (headless.mjs), whose regions also have kind, selector and href.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync, renameSync, rmSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { CONFIG_DIR, hasCmd } from "./core.mjs";

const SCREENS_DIR = join(CONFIG_DIR, "screens");
const INDEX = join(SCREENS_DIR, "screens.json");
const MAX_REGIONS = 200;
const MAX_IMAGE = 40 * 1024 * 1024;
function loadScreens() { try { const a = JSON.parse(readFileSync(INDEX, "utf8")); return Array.isArray(a) ? a : []; } catch { return []; } }
function saveScreens(a) { mkdirSync(SCREENS_DIR, { recursive: true }); writePrivate(INDEX, JSON.stringify(a, null, 2)); }
// A screenshot can show anything that was on screen, so Symbiot's are readable
// by you only (0600), the way the desktop's own screenshot tool saves its images.
// `mode` only applies to a new file; the chmod covers one that was already there.
function writePrivate(file, data) { writeFileSync(file, data, { mode: 0o600 }); makePrivate(file); }
function makePrivate(file) { try { chmodSync(file, 0o600); } catch {} }
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

// Cutting a PNG into pieces (one per display), with no dependencies: decode the
// pixels (zlib + PNG's row filters), copy each rectangle out, encode it again.
// 8- and 16-bit images, the kind screenshot tools write; null for anything else.
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const KEEP_CHUNKS = new Set(["PLTE", "tRNS", "gAMA", "sRGB", "cHRM", "iCCP", "pHYs"]);
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, "ascii"); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out;
}
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
function pngDecode(buf) {
  const size = pngSize(buf); if (!size) return null;
  const depth = buf[24], ctype = buf[25];
  if (!CHANNELS[ctype] || (depth !== 8 && depth !== 16) || buf[28] /* interlaced */) return null;
  const bpp = CHANNELS[ctype] * depth / 8, stride = size.w * bpp, idat = [], keep = [];
  for (let p = 8; p + 12 <= buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8), end = p + 12 + len;
    if (end > buf.length) return null;
    if (type === "IDAT") idat.push(buf.subarray(p + 8, p + 8 + len)); else if (KEEP_CHUNKS.has(type)) keep.push(buf.subarray(p, end));
    if (type === "IEND") break;
    p = end;
  }
  let raw; try { raw = inflateSync(Buffer.concat(idat)); } catch { return null; }
  if (raw.length < (stride + 1) * size.h) return null;
  const px = Buffer.alloc(stride * size.h);
  for (let y = 0; y < size.h; y++) {
    const f = raw[y * (stride + 1)], s = y * (stride + 1) + 1, o = y * stride, u = o - stride;
    if (f > 4) return null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[o + i - bpp] : 0, b = y ? px[u + i] : 0, v = raw[s + i];
      px[o + i] = f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, y && i >= bpp ? px[u + i - bpp] : 0);
    }
  }
  return { ...size, depth, ctype, bpp, stride, px, keep };
}
function pngCrop(img, r) {
  const rs = r.w * img.bpp, raw = Buffer.alloc((rs + 1) * r.h); // each row: filter 0, then its pixels
  for (let y = 0; y < r.h; y++) { const from = (r.y + y) * img.stride + r.x * img.bpp; img.px.copy(raw, y * (rs + 1) + 1, from, from + rs); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(r.w, 0); ihdr.writeUInt32BE(r.h, 4); ihdr[8] = img.depth; ihdr[9] = img.ctype;
  return Buffer.concat([PNG_SIG, pngChunk("IHDR", ihdr), ...img.keep, pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}
// One PNG per rectangle ({ x, y, w, h } in the image's pixels), or null when the
// image can't be read or a rectangle doesn't fit inside it.
function splitPng(buf, rects) {
  const img = pngDecode(buf); if (!img) return null;
  if (!rects.every((r) => r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= img.w && r.y + r.h <= img.h)) return null;
  return rects.map((r) => pngCrop(img, r));
}

// Displays: where each one sits on the desktop, as { name, x, y, w, h } in the
// units the click tool uses (logical pixels on Wayland, X pixels on X11, physical
// pixels from the virtual screen's corner on Windows, points on macOS). Each
// parser reads one tool's output.
const rotated = (t) => /90|270/.test(String(t || ""));
function parseCosmicRandr(kdl) {
  const out = [];
  for (const block of String(kdl || "").split(/^output /m).slice(1)) {
    const head = block.split("\n")[0], name = (head.match(/^"([^"]+)"/) || [])[1];
    const pos = block.match(/^\s*position (-?\d+) (-?\d+)/m), mode = block.match(/^\s*mode (\d+) (\d+) \d+[^\n]*current=#true/m);
    if (!name || /enabled=#false/.test(head) || !pos || !mode) continue;
    const sc = Number((block.match(/^\s*scale ([\d.]+)/m) || [])[1]) || 1, d = block.match(/^\s*description make="([^"]*)" model="([^"]*)"/m);
    let w = +mode[1] / sc, h = +mode[2] / sc; if (rotated((block.match(/^\s*transform "([^"]*)"/m) || [])[1])) [w, h] = [h, w];
    out.push({ name, model: d ? (d[1] + " " + d[2]).trim() : "", x: +pos[1], y: +pos[2], w: Math.round(w), h: Math.round(h) });
  }
  return out;
}
function parseWlrRandr(json) { // sway, Hyprland, river, labwc…
  let a; try { a = JSON.parse(json); } catch { return []; }
  return (Array.isArray(a) ? a : []).map((o) => {
    const m = o && o.enabled !== false && o.position && (o.modes || []).find((x) => x.current); if (!m) return null;
    const sc = Number(o.scale) || 1; let w = m.width / sc, h = m.height / sc; if (rotated(o.transform)) [w, h] = [h, w];
    return { name: String(o.name || ""), model: [o.make, o.model].filter((x) => x && x !== "Unknown").join(" "), x: +o.position.x, y: +o.position.y, w: Math.round(w), h: Math.round(h) };
  }).filter(Boolean);
}
function parseKscreen(json) { // KDE Plasma
  let a; try { a = JSON.parse(json); } catch { return []; }
  return ((a && a.outputs) || []).map((o) => {
    const m = o && o.enabled && o.connected !== false && o.pos && (o.modes || []).find((x) => String(x.id) === String(o.currentModeId)); if (!m || !m.size) return null;
    const sc = Number(o.scale) || 1; let w = m.size.width / sc, h = m.size.height / sc; if (o.rotation === 2 || o.rotation === 8) [w, h] = [h, w];
    return { name: String(o.name || ""), model: "", x: +o.pos.x, y: +o.pos.y, w: Math.round(w), h: Math.round(h) };
  }).filter(Boolean);
}
function parseXrandr(text) { // " 0: +*HDMI-1 1600/440x900/250+0+0  HDMI-1"
  return [...String(text || "").matchAll(/^\s*\d+:\s+\S+\s+(\d+)\/\d+x(\d+)\/\d+\+(-?\d+)\+(-?\d+)\s+(\S+)/gm)].map((m) => ({ name: m[5], model: "", x: +m[3], y: +m[4], w: +m[1], h: +m[2] }));
}
function parseLines(text) { // "name|x|y|w|h" per display, from the Windows and macOS scripts below
  return String(text || "").split(/\r?\n/).map((l, i) => { const p = l.trim().split("|"); return p.length === 5 ? { name: p[0].replace(/^\\\\\.\\/, "") || "Display " + (i + 1), model: "", x: +p[1], y: +p[2], w: Math.round(+p[3]), h: Math.round(+p[4]), display: i + 1 } : null; }).filter(Boolean);
}
const WIN_SCREENS = WIN_DPI + "Add-Type -AssemblyName System.Windows.Forms; $b = [System.Windows.Forms.SystemInformation]::VirtualScreen; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { $_.DeviceName + '|' + ($_.Bounds.X - $b.Left) + '|' + ($_.Bounds.Y - $b.Top) + '|' + $_.Bounds.Width + '|' + $_.Bounds.Height }";
// NSScreen frames are in points from the main display's bottom-left corner; this
// flips them to top-left, which is what cliclick uses. screens[0] is the main
// display, which is screencapture's -D 1.
const MAC_SCREENS = "ObjC.import('AppKit'); var s = $.NSScreen.screens, top = s.objectAtIndex(0).frame.size.height, out = []; for (var i = 0; i < s.count; i++) { var o = s.objectAtIndex(i), f = o.frame, n = 'Display ' + (i + 1); try { n = ObjC.unwrap(o.localizedName) || n; } catch (e) {} out.push(String(n).replace(/[|]/g, ' ') + '|' + f.origin.x + '|' + (top - f.origin.y - f.size.height) + '|' + f.size.width + '|' + f.size.height); } out.join('\\n')";
// Tools that list the displays, in order, as [cmd, args, parser].
function monitorCmds(platform = process.platform, wayland = process.env.XDG_SESSION_TYPE === "wayland") {
  if (platform === "darwin") return [["osascript", ["-l", "JavaScript", "-e", MAC_SCREENS], parseLines]];
  if (platform === "win32") return [[...psEncoded(WIN_SCREENS), parseLines]];
  const xr = ["xrandr", ["--listmonitors"], parseXrandr]; // on Wayland, through Xwayland: right unless the display is scaled
  return wayland ? [["cosmic-randr", ["list", "--kdl"], parseCosmicRandr], ["wlr-randr", ["--json"], parseWlrRandr], ["kscreen-doctor", ["-j"], parseKscreen], xr] : [xr];
}
// Drop what can't be used, fold mirrored displays into one, order them left to
// right and say where each one is ("left", "right", "top"…) when there are several.
function tidyMonitors(list) {
  const out = [];
  for (const m of list || []) {
    if (!m || !m.name || ![m.x, m.y, m.w, m.h].every(Number.isFinite) || m.w <= 0 || m.h <= 0) continue;
    const twin = out.find((o) => o.x === m.x && o.y === m.y && o.w === m.w && o.h === m.h);
    if (twin) twin.name += "+" + m.name; else out.push({ ...m });
  }
  out.sort((a, b) => a.x - b.x || a.y - b.y);
  const overlap = (a0, a1, b0, b1) => a0 < b1 && b0 < a1, n = out.length;
  const rank = (i) => (i === 0 ? 0 : i === n - 1 ? 2 : 1);
  if (n > 1 && out.every((a) => out.every((b) => overlap(a.y, a.y + a.h, b.y, b.y + b.h)))) out.forEach((m, i) => { m.where = ["left", n > 3 ? "middle " + i : "middle", "right"][rank(i)]; });
  else if (n > 1 && out.every((a) => out.every((b) => overlap(a.x, a.x + a.w, b.x, b.x + b.w)))) [...out].sort((a, b) => a.y - b.y).forEach((m, i) => { m.where = ["top", n > 3 ? "middle " + i : "middle", "bottom"][rank(i)]; });
  return out;
}
// The displays connected now, from the first tool here that lists them; [] if none can.
function listMonitors() {
  const linux = process.platform !== "win32" && process.platform !== "darwin";
  for (const [cmd, args, parse] of monitorCmds()) {
    if (linux && !hasCmd(cmd)) continue;
    const p = spawnSync(cmd, args, { encoding: "utf8", timeout: 8000, killSignal: "SIGKILL" });
    const mons = p.status === 0 ? tidyMonitors(parse(p.stdout)) : [];
    if (mons.length) return mons;
  }
  return [];
}
// Where each display is in a screenshot of the whole desktop, in its pixels: the
// layout's bounding box, scaled to fit the image (a HiDPI capture is bigger than
// the layout's logical size). null when the image isn't the whole layout, e.g. a
// tool that took one display only, or an image from another setup.
function monitorAreas(monitors, w, h) {
  if (!monitors || monitors.length < 2) return null;
  const x0 = Math.min(...monitors.map((m) => m.x)), y0 = Math.min(...monitors.map((m) => m.y));
  const lw = Math.max(...monitors.map((m) => m.x + m.w)) - x0, lh = Math.max(...monitors.map((m) => m.y + m.h)) - y0, k = w / lw;
  if (!(k >= 0.25 && k <= 4) || Math.abs(h - lh * k) > Math.max(2, 2 * k)) return null;
  return monitors.map((m) => {
    const x = Math.round((m.x - x0) * k), y = Math.round((m.y - y0) * k);
    return { ...m, area: { x, y, w: Math.min(w - x, Math.round(m.w * k)), h: Math.min(h - y, Math.round(m.h * k)) } };
  });
}
const monitorLabel = (m) => m.name + (m.where ? " (" + m.where + ")" : "");
const monitorOf = (m) => ({ name: m.name, x: m.x, y: m.y, w: m.w, h: m.h, ...(m.where ? { where: m.where } : {}) });

// Screenshot tools to try, in order, as [cmd, args] that write a PNG to `file`,
// or [cmd, args, dir] for a tool that only takes a folder (it picks the name).
// scrot and import only see X11, which on Wayland is a blank screen, so they're
// left out there. Each captures the whole desktop (every display in one image),
// except screencapture: the main display, or `display` (1 = main, 2…) if given.
function captureCmds(file, platform = process.platform, wayland = process.env.XDG_SESSION_TYPE === "wayland", display = 0) {
  if (platform === "darwin") return [["screencapture", ["-x", ...(display ? ["-D", String(display)] : []), "-t", "png", file]]];
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
const newId = () => randomBytes(6).toString("hex");
const defaultName = () => "Screen " + new Date().toLocaleString();
function addScreens(list) { saveScreens([...list, ...loadScreens()]); return list; }
const screenOf = (id, name, size, via, extra = {}) => ({ id, name: String(name || "").trim().slice(0, 80) || defaultName(), w: size.w, h: size.h, ts: Date.now(), via, ...extra, regions: extra.regions || [] });
function addScreen(id, name, size, via, extra) { return addScreens([screenOf(id, name, size, via, extra)])[0]; }
// "<name> · HDMI-1 (left)", kept within the 80 characters a name can have.
const pieceName = (name, m) => { const tail = " · " + monitorLabel(m), base = String(name || "").trim() || defaultName(); return base.slice(0, Math.max(10, 80 - tail.length)) + tail; };

// Run the screenshot tools until one writes a PNG to `file`: { size, via }, or
// { tried } with the tools that ran and failed.
function shoot(file, display) {
  const tried = [], linux = process.platform !== "win32" && process.platform !== "darwin";
  for (const [cmd, args, dir] of captureCmds(file, process.platform, process.env.XDG_SESSION_TYPE === "wayland", display)) {
    if (linux && !hasCmd(cmd)) continue;
    tried.push(cmd);
    if (dir) try { mkdirSync(dir, { recursive: true }); } catch {}
    spawnSync(cmd, args, { stdio: "ignore", timeout: 20000, killSignal: "SIGKILL" });
    if (dir) { try { const f = readdirSync(dir).find((x) => /\.png$/i.test(x)); if (f) renameSync(join(dir, f), file); } catch {} rmSync(dir, { recursive: true, force: true }); }
    let size = null; try { size = pngSize(readFileSync(file)); } catch {}
    if (size) { makePrivate(file); return { size, via: cmd }; } // whatever mode the tool gave it
    try { unlinkSync(file); } catch {}
  }
  return { tried };
}
// Cut a whole-desktop PNG into one screen per display in `want` (each with its
// regions, if `regions` are given in the whole image's pixels). null when the
// image doesn't match how the displays are laid out now.
function piecesOf(buf, size, monitors, want, name, via, regions) {
  const areas = monitorAreas(monitors, size.w, size.h); if (!areas) return null;
  const mine = areas.filter((a) => want.some((m) => m.name === a.name));
  const pngs = mine.length && splitPng(buf, mine.map((a) => a.area)); if (!pngs) return null;
  const ids = mine.map(() => newId());
  try { pngs.forEach((p, i) => writePrivate(screenFile(ids[i]), p)); } catch (e) { ids.forEach((id) => { try { unlinkSync(screenFile(id)); } catch {} }); return { error: String((e && e.message) || e) }; }
  return addScreens(mine.map((a, i) => {
    // a region goes with the display its centre is on, moved into that display's pixels
    const rs = (regions || []).filter((r) => { const c = center(r); return c.x >= a.area.x && c.x < a.area.x + a.area.w && c.y >= a.area.y && c.y < a.area.y + a.area.h; })
      .map((r) => { const x = Math.max(0, r.x - a.area.x), y = Math.max(0, r.y - a.area.y); return { ...r, x, y, w: Math.max(1, Math.min(a.area.w - x, r.x + r.w - a.area.x - x)), h: Math.max(1, Math.min(a.area.h - y, r.y + r.h - a.area.y - y)) }; });
    return screenOf(ids[i], pieceName(name, a), { w: a.area.w, h: a.area.h }, via, { monitor: monitorOf(a), regions: rs });
  }));
}
const layoutOf = (mons) => mons.map((m) => `${m.name} ${m.w}×${m.h} at ${m.x},${m.y}`).join(", ");

// Take a screenshot with the first tool that works here. `which` picks what to
// keep when there are several displays: "all" (one image of the whole desktop,
// the default), "each" (one screen per display) or a display's name (just that
// one). Gives the screen, or { screens: [...] } for several, or { error }.
// When the screenshot can't be cut up, it keeps the whole image and says why (`note`).
function captureScreen(name, which = "all") {
  try { mkdirSync(SCREENS_DIR, { recursive: true }); } catch (e) { return { error: String((e && e.message) || e) }; }
  const mons = which && which !== "all" ? listMonitors() : [], want = which === "each" ? mons : mons.filter((m) => m.name === which);
  if (which && which !== "all" && which !== "each" && !want.length) return { error: `There's no display called ${which} connected now. Pick one again.` };
  // macOS: screencapture takes one display at a time, in its own pixels
  if (process.platform === "darwin" && mons.length > 1) {
    const out = [];
    for (const m of want) {
      const id = newId(), r = shoot(screenFile(id), m.display);
      if (!r.size) { if (out.length) break; return captureFailed(r.tried); }
      out.push(screenOf(id, pieceName(name, m), r.size, r.via, { monitor: monitorOf(m) }));
    }
    addScreens(out);
    return out.length === 1 ? out[0] : { screens: out };
  }
  const id = newId(), file = screenFile(id), r = shoot(file);
  if (!r.size) return captureFailed(r.tried);
  if (!mons.length && which && which !== "all") return { ...addScreen(id, name, r.size, r.via), note: "Couldn't read how your displays are laid out (Symbiot asks cosmic-randr, wlr-randr, kscreen-doctor or xrandr), so it's kept as one image." };
  if (mons.length < 2) return addScreen(id, name, r.size, r.via); // one display: the image is that display
  let buf = null; try { buf = readFileSync(file); } catch {}
  const pieces = buf && piecesOf(buf, r.size, mons, want, name, r.via);
  if (!pieces || pieces.error) {
    const why = pieces && pieces.error ? "Couldn't save the pieces (" + pieces.error + ")" : `The screenshot (${r.size.w}×${r.size.h}) doesn't match how your displays are laid out (${layoutOf(mons)})`;
    return { ...addScreen(id, name, r.size, r.via), note: why + ", so it's kept as one image." };
  }
  try { unlinkSync(file); } catch {}
  return pieces.length === 1 ? pieces[0] : { screens: pieces };
}
// Cut a saved screen of the whole desktop into one screen per display, regions
// included. The original stays, so nothing is lost if the cut looks wrong.
function splitScreen(id) {
  const s = loadScreens().find((x) => x.id === id); if (!s) return { error: "not found" };
  if (s.monitor) return { error: "This screen is already one display." };
  const mons = listMonitors();
  if (mons.length < 2) return { error: mons.length ? "Only one display is connected now, so there's nothing to split it into." : "Couldn't read how your displays are laid out (Symbiot asks cosmic-randr, wlr-randr, kscreen-doctor or xrandr on Linux)." };
  let buf = null; try { buf = readFileSync(screenFile(id)); } catch {}
  if (!buf) return { error: "This screen's image is missing." };
  const pieces = piecesOf(buf, s, mons, mons, s.name, s.via, s.regions);
  if (!pieces) return { error: `This image (${s.w}×${s.h}) doesn't match how your displays are laid out now (${layoutOf(mons)}), so it can't be split by display.` };
  return pieces.error ? pieces : { screens: pieces };
}
function captureFailed(tried) {
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
  try { mkdirSync(SCREENS_DIR, { recursive: true }); writePrivate(screenFile(id), buf); } catch (e) { return { error: String((e && e.message) || e) }; }
  return addScreen(id, name, size, "loaded");
}
// Regions clamped to a w×h image and rounded to whole pixels. A mapped page's
// regions (headless.mjs) also keep what they are (`kind`: button, link, field…),
// how to find them again (`selector`) and where a link goes (`href`).
const EXTRAS = { kind: 20, selector: 1000, href: 500 };
function cleanRegions(size, regions) {
  const out = [];
  for (const r of (Array.isArray(regions) ? regions : []).slice(0, MAX_REGIONS)) {
    if (!r) continue;
    const x = Math.max(0, Math.min(size.w - 1, Math.round(Number(r.x) || 0))), y = Math.max(0, Math.min(size.h - 1, Math.round(Number(r.y) || 0)));
    const w = Math.max(1, Math.min(size.w - x, Math.round(Number(r.w) || 0))), h = Math.max(1, Math.min(size.h - y, Math.round(Number(r.h) || 0)));
    const extra = {}; for (const [k, max] of Object.entries(EXTRAS)) if (typeof r[k] === "string" && r[k].trim()) extra[k] = r[k].trim().slice(0, max);
    out.push({ id: validId(r.id) ? r.id : newId(), label: String(r.label || "").trim().slice(0, 80) || "region " + (out.length + 1), x, y, w, h, ...extra });
  }
  return out;
}
// Replace a screen's regions.
function setRegions(id, regions) {
  const all = loadScreens(), s = all.find((x) => x.id === id); if (!s) return { error: "not found" };
  s.regions = cleanRegions(s, regions); saveScreens(all);
  return s;
}
// A web page mapped in the hidden browser (headless.mjs): its screenshot, with a
// region for each button, link and field found on it. `page` is { url, title }.
function addPageScreen(name, png, page, regions) {
  const size = pngSize(png); if (!size) return { error: "The page's screenshot isn't a PNG." };
  const id = newId();
  try { mkdirSync(SCREENS_DIR, { recursive: true }); writePrivate(screenFile(id), png); } catch (e) { return { error: String((e && e.message) || e) }; }
  const p = { url: String(page.url || "").slice(0, 2000), title: String(page.title || "").trim().slice(0, 200) };
  return addScreen(id, name, size, "headless", { page: p, regions: cleanRegions(size, regions) });
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
// Where a point in a one-display screen's pixels is on the desktop, in the click
// tool's units: from that display's corner, scaled to its size (so a HiDPI or
// Retina capture still lands right).
const onDesktop = (s, p) => ({ x: Math.round(s.monitor.x + p.x * s.monitor.w / s.w), y: Math.round(s.monitor.y + p.y * s.monitor.h / s.h) });
// What automation reads: each region with the point to aim at (its centre), and
// for one display of several, which display and that point on the whole desktop.
function blueprint(s) {
  const extras = (r) => Object.fromEntries(Object.keys(EXTRAS).filter((k) => r[k]).map((k) => [k, r[k]]));
  return { screen: s.name, size: { w: s.w, h: s.h }, ...(s.monitor ? { monitor: s.monitor } : {}), ...(s.page ? { page: s.page } : {}),
    regions: (s.regions || []).map((r) => ({ label: r.label, x: r.x, y: r.y, w: r.w, h: r.h, center: center(r), ...(s.monitor ? { desktop: onDesktop(s, center(r)) } : {}), ...extras(r) })) };
}

// Click tools to try, in order, as a list of [cmd, args] steps that move the
// mouse to (x, y) and left-click there. xdotool only reaches X11 windows, so on
// Wayland it's ydotool (it needs /dev/uinput). ydotool 1.x moves relative unless
// told --absolute and takes a button code; 0.1.x (Debian/Ubuntu) moves to the
// point and takes a button number. On Windows, PowerShell: SetCursorPos, offset
// by the virtual screen's corner (the capture's 0,0), then left down + up.
// cliclick reads "-5" as relative, so a display left of or above the main one
// gets "=-5" (absolute).
function clickCmds(x, y, platform = process.platform, wayland = process.env.XDG_SESSION_TYPE === "wayland", ydotool1 = false) {
  x = String(Math.round(Number(x)) || 0); y = String(Math.round(Number(y)) || 0);
  if (platform === "darwin") return [[["cliclick", ["c:" + x.replace(/^-/, "=-") + "," + y.replace(/^-/, "=-")]]]];
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
  if (s.page) return { error: "This screen is a page in Symbiot's hidden browser, not your screen: use Press instead." };
  const c = center(r), wayland = process.env.XDG_SESSION_TYPE === "wayland";
  // The first tool that's installed does it. If that fails it says so, rather
  // than trying the next one: a half-done move + click could otherwise click twice.
  const tool = clickCmds(c.x, c.y).map((st) => st[0][0]).find((t) => hasCmd(t));
  if (tool) {
    // one display of several: its place on the desktop; the whole desktop: rescaled to the click tool's size
    const sp = !s.monitor && clickSpace(tool), d = s.monitor ? onDesktop(s, c) : null;
    const x = d ? d.x : sp ? Math.round(c.x * sp.w / s.w) : c.x, y = d ? d.y : sp ? Math.round(c.y * sp.h / s.h) : c.y;
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

export { loadScreens, screenImage, pngSize, pngDecode, splitPng, captureCmds, monitorCmds, parseCosmicRandr, parseWlrRandr, parseKscreen, parseXrandr, parseLines, tidyMonitors, monitorAreas, listMonitors, portalAppId, allowScreenshots, captureScreen, splitScreen, importScreen, setRegions, addPageScreen, renameScreen, removeScreen, blueprint, center, clickCmds, clickRegion };
