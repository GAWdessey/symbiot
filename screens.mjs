// symbiot — Screens: screenshots with named regions, i.e. a blueprint of where
// things are on a screen, in screenshot pixels. The first slice of screen
// automation: it captures, stores and maps. Nothing here clicks or types yet.
//
// Stored in ~/.config/symbiot/screens/: <id>.png per screen, and screens.json =
// [{ id, name, w, h, ts, via, regions: [{ id, label, x, y, w, h }] }], which is
// also what an agent or script reads to find a region.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
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

// Screenshot tools to try, in order, as [cmd, args] that write a PNG to `file`.
function captureCmds(file, platform = process.platform) {
  if (platform === "darwin") return [["screencapture", ["-x", "-t", "png", file]]];
  if (platform === "win32") {
    const ps = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b = [System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size); $bmp.Save('" + file.replace(/'/g, "''") + "', [System.Drawing.Imaging.ImageFormat]::Png)";
    return [["powershell", ["-NoProfile", "-Command", ps]]];
  }
  return [["gnome-screenshot", ["-f", file]], ["spectacle", ["-b", "-n", "-f", "-o", file]], ["grim", [file]], ["scrot", [file]], ["import", ["-window", "root", file]], ["xfce4-screenshooter", ["-f", "-s", file]]];
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
  for (const [cmd, args] of captureCmds(file)) {
    if (posix && !hasCmd(cmd)) continue;
    tried.push(cmd);
    spawnSync(cmd, args, { stdio: "ignore", timeout: 20000, killSignal: "SIGKILL" });
    let size = null; try { size = pngSize(readFileSync(file)); } catch {}
    if (size) return addScreen(id, name, size, cmd);
    try { unlinkSync(file); } catch {}
  }
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
// What automation reads: each region with the point to aim at (its centre).
function blueprint(s) {
  return { screen: s.name, size: { w: s.w, h: s.h }, regions: (s.regions || []).map((r) => ({ label: r.label, x: r.x, y: r.y, w: r.w, h: r.h, center: { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) } })) };
}

export { loadScreens, screenImage, pngSize, captureCmds, captureScreen, importScreen, setRegions, renameScreen, removeScreen, blueprint };
