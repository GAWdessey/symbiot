// symbiot — the pick tray: every capture Marketing's agent took of a product (its lane's
// tools/tray.py makes them), blurred where it shows something private, to pick a post's
// picture or video from on the Marketing page. A tray is drafts/<product>/tray/ in the
// lane: tray.json, its index ({ tray, items: [{ name, kind: still|clip|reel, files, screen,
// caption, for: [draft file], blur }] }), and for each capture <name>.blur.json ({ source,
// kind, size: [w, h], regions: [{ id, kind, x, y, w, h, on, hint, from?, to? }] }) beside
// its blurred files. A box switched on or off is written back to that .blur.json (where
// tray.py reads it), then tray.py renders the capture again. The unblurred originals stay
// in .symbiot/tray-originals and are never served from here.
import { join, dirname, basename } from "node:path";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { MARKETING_DIR, MEDIA_TYPES, draftFiles, parseDraft, inLane } from "./marketing.mjs";

const NAME = /^\w[\w.-]{0,100}$/; // a capture's file: no slashes, no dot first
const IMG = /\.(?:png|jpe?g|gif|webp)$/i, VID = /\.(?:mp4|webm|mov)$/i;
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };

// The lane's trays, by their path there: drafts/<product>/tray, each with its tray.json.
function trayDirs(dir = MARKETING_DIR) {
  let ents = []; try { ents = readdirSync(join(dir, "drafts"), { withFileTypes: true }); } catch { return []; }
  return ents.filter((e) => e.isDirectory() && !e.name.startsWith(".") && existsSync(join(dir, "drafts", e.name, "tray", "tray.json"))).map((e) => `drafts/${e.name}/tray`).sort();
}
const isTray = (dir, rel) => trayDirs(dir).includes(String(rel || ""));

// A file of a tray, only if it's really in one (no ../, no link out of it): { file, type } or null.
function trayMedia(rel, { dir = MARKETING_DIR } = {}) {
  const m = String(rel || "").match(/^(drafts\/[^/]+\/tray)\/([^/]+)$/); if (!m || !NAME.test(m[2]) || !isTray(dir, m[1])) return null;
  const f = inLane(dir, rel), type = f && MEDIA_TYPES[f.split(".").pop().toLowerCase()];
  try { return type && dirname(f) === realpathSync(join(dir, m[1])) ? { file: f, type } : null; } catch { return null; }
}

// One tray as the page shows it: each capture with what shows it (its picture, else its
// video), the file a post takes (a still's picture, a clip's video), its blur boxes as
// fractions of its size (so they sit on it at any width), and when it was last rendered.
function trayOf(dir, rel) {
  const root = join(dir, rel), idx = readJson(join(root, "tray.json")) || {};
  const items = (Array.isArray(idx.items) ? idx.items : []).filter((it) => it && NAME.test(String(it.name || ""))).map((it) => {
    const files = (Array.isArray(it.files) ? it.files : []).filter((f) => NAME.test(String(f)) && existsSync(join(root, f)));
    const show = files.find((f) => IMG.test(f)) || files.find((f) => VID.test(f)) || "";
    const use = (it.kind === "still" ? files.find((f) => IMG.test(f)) : files.find((f) => VID.test(f))) || show;
    const spec = NAME.test(`${it.name}.blur.json`) ? readJson(join(root, `${it.name}.blur.json`)) : null;
    const [w, h] = spec && Array.isArray(spec.size) ? spec.size.map(Number) : [0, 0];
    const regions = spec && Array.isArray(spec.regions) && w > 0 && h > 0 ? spec.regions.filter((r) => r && r.id != null).map((r) => ({ id: r.id, kind: String(r.kind || "box"), hint: String(r.hint || ""), on: !!r.on,
      x: r.x / w, y: r.y / h, w: r.w / w, h: r.h / h, ...(r.from != null || r.to != null ? { from: Number(r.from) || 0, to: Number(r.to) || 0 } : {}) })) : [];
    let at = 0; try { at = show ? statSync(join(root, show)).mtimeMs : 0; } catch {}
    return { name: it.name, kind: String(it.kind || (spec && spec.kind) || "still"), caption: String(it.caption || (spec && spec.caption) || ""), screen: String(it.screen || ""), for: (Array.isArray(it.for) ? it.for : []).map(String),
      show: show ? `${rel}/${show}` : "", showKind: VID.test(show) ? "video" : "image", use: use ? `${rel}/${use}` : "", blur: !!spec, regions, parts: Array.isArray(it.parts) ? it.parts.map(String) : [], at };
  });
  return { rel, folder: dirname(rel), items };
}
// Every tray in the lane, each with its product's drafts (not those in the tray) to use a
// capture in: their status (posted and superseded ones take no picture) and media now.
function trays({ dir = MARKETING_DIR } = {}) {
  const drafts = draftFiles(dir, [], { max: 500 });
  return trayDirs(dir).map((rel) => {
    const t = trayOf(dir, rel), ds = drafts.filter((d) => d.rel.startsWith(t.folder + "/") && !d.rel.startsWith(rel + "/"));
    const media = (r) => { try { return parseDraft(readFileSync(join(dir, r), "utf8")).media.map((m) => join(dirname(r), m)); } catch { return []; } };
    return { ...t, product: (ds.find((d) => d.product) || {}).product || basename(t.folder), drafts: ds.sort((a, b) => a.rel.localeCompare(b.rel)).map((d) => ({ rel: d.rel, name: d.name, status: d.status, media: media(d.rel) })) };
  });
}

// A blur box switched on or off (or several: a clip's box over the same place in each of its
// moments), written back to its capture's .blur.json, nothing else in it touched. { ok, on } or { error }.
function setBlur(tray, name, id, on, { dir = MARKETING_DIR } = {}) {
  if (!isTray(dir, tray) || !NAME.test(String(name || ""))) return { error: "That capture isn't in a tray any more." };
  const f = join(dir, tray, `${name}.blur.json`), spec = readJson(f);
  if (!spec || !Array.isArray(spec.regions)) return { error: "That capture has no blur boxes." };
  const ids = [].concat(id).map(String), rs = spec.regions.filter((x) => x && ids.includes(String(x.id)));
  if (!rs.length || rs.length < new Set(ids).size) return { error: "That blur box isn't there any more." };
  for (const r of rs) r.on = !!on;
  try { writeFileSync(f, JSON.stringify(spec, null, 2)); } catch (e) { return { error: "Couldn't save it: " + ((e && e.message) || e) }; }
  return { ok: true, on: !!on, ids };
}
// The capture rendered again with its boxes as they are now, by the lane's own tray.py (one
// at a time a capture: two clicks don't write the same files at once). { ok } or { error }.
const RENDERING = new Map();
function renderCapture(tray, name, { dir = MARKETING_DIR, run = runTray } = {}) {
  if (!isTray(dir, tray) || !NAME.test(String(name || ""))) return Promise.resolve({ error: "That capture isn't in a tray any more." });
  if (!existsSync(join(dir, "tools", "tray.py"))) return Promise.resolve({ error: "The lane has no tools/tray.py to blur it with: its agent renders it next time." });
  const key = `${dir}\0${tray}\0${name}`, next = (RENDERING.get(key) || Promise.resolve()).then(() => run(dir, ["tools/tray.py", "render", tray, name]));
  RENDERING.set(key, next.catch(() => {}));
  return next;
}
function runTray(cwd, args, { timeout = 180000 } = {}) {
  return new Promise((done) => {
    let err = "", p; try { p = spawn("python3", args, { cwd, stdio: ["ignore", "ignore", "pipe"], timeout }); } catch (e) { done({ error: String((e && e.message) || e) }); return; }
    p.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    p.on("error", (e) => done({ error: e.code === "ENOENT" ? "python3 isn't on this computer." : String(e.message || e) }));
    p.on("close", (code) => done(code === 0 ? { ok: true } : { error: (err.trim().split("\n").pop() || `tray.py stopped (${code})`).slice(0, 300) }));
  });
}

export { trayDirs, trayMedia, trayOf, trays, setBlur, renderCapture };
