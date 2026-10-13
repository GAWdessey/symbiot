// symbiot — the pick tray: every capture Marketing's agent took of a product, blurred where
// it shows something private, to pick a post's picture or video from on the Marketing page.
// A tray is drafts/<product>/tray/ in the lane: tray.json, its index ({ tray, items: [{ name,
// kind: still|clip|reel, files, screen, caption, for: [draft file], blur }] }), and for each
// capture <name>.blur.json ({ source, kind, size: [w, h], trim?, fps?, width?, regions: [{ id,
// kind, x, y, w, h, on, hint, from?, to? }] }) beside its blurred files; a reel is
// <name>.reel.json ({ parts: [clip names] }), its clips' videos one after another. A box
// switched on or off is written back to that .blur.json, then Symbiot blurs the capture again
// itself, with ffmpeg: the app never runs a script an agent wrote (the lane's tools/tray.py
// did it until 2026-10-09, with the app's access). The unblurred originals stay in the lane's
// .symbiot/tray-originals/<product>/ and are never served from here.
import { join, dirname, basename } from "node:path";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, realpathSync, renameSync, rmSync, mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { MARKETING_DIR, MEDIA_TYPES, draftFiles, parseDraft, inLane, reviewOf } from "./marketing.mjs";

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
    const regions = spec && Array.isArray(spec.regions) && w > 0 && h > 0 ? spec.regions.filter((r) => r && r.id != null).map((r) => ({ id: r.id, kind: String(r.kind || "box"), hint: String(r.hint || ""), on: !!r.on, ...(r.hand ? { hand: true } : {}),
      x: r.x / w, y: r.y / h, w: r.w / w, h: r.h / h, ...(r.from != null || r.to != null ? { from: Number(r.from) || 0, to: Number(r.to) || 0 } : {}) })) : [];
    let at = 0; try { at = show ? statSync(join(root, show)).mtimeMs : 0; } catch {}
    return { name: it.name, kind: String(it.kind || (spec && spec.kind) || "still"), caption: String(it.caption || (spec && spec.caption) || ""), screen: String(it.screen || ""), for: (Array.isArray(it.for) ? it.for : []).map(String),
      show: show ? `${rel}/${show}` : "", showKind: VID.test(show) ? "video" : "image", use: use ? `${rel}/${use}` : "", blur: !!spec, regions, parts: Array.isArray(it.parts) ? it.parts.map(String) : [], at,
      ...(spec && spec.desktop ? { desktop: true } : {}), ...(spec && Array.isArray(spec.size) ? { size: spec.size.map(Number) } : {}) };
  });
  // to look over before it's used: its own reason, or a reel's from the clips in it
  for (const it of items) { const why = lookFirst(root, it); if (why) it.review = why; }
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
// ---- yours: a box drawn, and a capture looked over --------------------------------------
// A box of your own over a capture (x, y, w, h as fractions of it, as the page draws it),
// blurred: on a clip, all the way through. { ok, id } or { error }.
function specOf(dir, tray, name) {
  if (!isTray(dir, tray) || !NAME.test(String(name || ""))) return { error: "That capture isn't in a tray any more." };
  const f = join(dir, tray, `${name}.blur.json`), spec = readJson(f);
  if (!spec || !Array.isArray(spec.regions)) return { error: "That capture has no blur boxes to add to." };
  return { f, spec };
}
const saveSpec = (f, spec) => { try { writeFileSync(f, JSON.stringify(spec, null, 2)); return null; } catch (e) { return { error: "Couldn't save it: " + ((e && e.message) || e) }; } };
function addBlur(tray, name, box, { dir = MARKETING_DIR } = {}) {
  const o = specOf(dir, tray, name); if (o.error) return o;
  const [W, H] = Array.isArray(o.spec.size) ? o.spec.size.map(Number) : [0, 0];
  if (!(W > 0 && H > 0)) return { error: "Couldn't tell how big the capture is." };
  const n = (v) => Math.min(1, Math.max(0, Number(v)));
  const b = box || {}, x = n(b.x), y = n(b.y), w = Math.min(1 - x, n(b.w)), h = Math.min(1 - y, n(b.h));
  if (![b.x, b.y, b.w, b.h].every((v) => Number.isFinite(Number(v))) || w * W < 4 || h * H < 4) return { error: "Draw the box over what to blur: drag across it." };
  const id = Math.max(0, ...o.spec.regions.map((r) => Number(r && r.id) || 0)) + 1;
  o.spec.regions.push({ id, kind: "yours", x: Math.round(x * W), y: Math.round(y * H), w: Math.round(w * W), h: Math.round(h * H), hint: "", on: true, hand: true });
  return saveSpec(o.f, o.spec) || { ok: true, id };
}
// A box you drew, gone. One Symbiot found stays (switch it off instead), so it can go back on.
function removeBlur(tray, name, id, { dir = MARKETING_DIR } = {}) {
  const o = specOf(dir, tray, name); if (o.error) return o;
  const r = o.spec.regions.find((x) => x && String(x.id) === String(id));
  if (!r) return { error: "That blur box isn't there any more." };
  if (!r.hand) return { error: "Symbiot found that one: switch it off instead, so it can go back on." };
  o.spec.regions = o.spec.regions.filter((x) => x !== r);
  return saveSpec(o.f, o.spec) || { ok: true };
}
// A capture to look over before it's used (marketing.mjs reviewOf): its own reason, or a reel's from its clips.
const lookFirst = (root, it) => reviewOf(root, it.name, it.kind, it.parts);
function setReviewed(tray, name, { dir = MARKETING_DIR, now = Date.now() } = {}) {
  const o = specOf(dir, tray, name); if (o.error) return o;
  o.spec.reviewed = now;
  return saveSpec(o.f, o.spec) || { ok: true };
}
// The capture rendered again from its original with its boxes as they are now, and every
// reel it's in joined again (a box blurred in a clip is blurred in its reel too). One at a
// time a capture: two clicks don't write the same files at once. { ok, files } or { error }.
const RENDERING = new Map();
function renderCapture(tray, name, { dir = MARKETING_DIR, run = ffmpeg, size = sizeOf } = {}) {
  if (!isTray(dir, tray) || !NAME.test(String(name || ""))) return Promise.resolve({ error: "That capture isn't in a tray any more." });
  const key = `${dir}\0${tray}\0${name}`, next = (RENDERING.get(key) || Promise.resolve()).then(() => render(dir, tray, name, run, size));
  RENDERING.set(key, next.catch(() => {}));
  return next;
}
async function render(dir, tray, name, run, size) {
  const root = join(dir, tray), spec = readJson(join(root, `${name}.blur.json`));
  if (!spec || !Array.isArray(spec.regions) || !["still", "clip"].includes(spec.kind)) return { error: "That capture has nothing to blur." };
  const orig = join(dir, ".symbiot", "tray-originals", basename(dirname(root))), src = join(orig, String(spec.source || ""));
  let real = ""; try { real = NAME.test(String(spec.source || "")) && dirname(realpathSync(src)) === realpathSync(orig) ? realpathSync(src) : ""; } catch {}
  if (!real) return { error: "Its unblurred original isn't in the lane's .symbiot/tray-originals: its agent renders it next time." };
  if (spec.file) return renderFile(root, name, spec, real, run);
  const [w, h] = size(real) || (Array.isArray(spec.size) ? spec.size.map(Number) : []);
  if (!(w > 0 && h > 0)) return { error: "Couldn't tell how big the capture is." };
  const still = spec.kind === "still", fps = Number(spec.fps) || 12, [start, end] = Array.isArray(spec.trim) ? spec.trim.map(Number) : [0, 0];
  const { graph, out } = blurGraph(spec.regions.filter((r) => r && r.on), w, h, still ? null : start || 0, still ? "[0:v]format=rgb24[v0]" : `[0:v]fps=${fps},format=rgb24[v0]`);
  const outs = still ? [`${name}.png`] : [`${name}.gif`, `${name}.mp4`], tmp = outs.map((f) => join(root, `.${f}.render.${f.split(".").pop()}`)); // dotted: not served, nor in tray.json, until it's whole
  const args = still ? ["-i", real, "-filter_complex", graph, "-map", out, "-frames:v", "1", tmp[0]]
    : [...(start > 0 ? ["-ss", String(start)] : []), ...(end > 0 ? ["-to", String(end)] : []), "-i", real, "-filter_complex",
      `${graph};${out}split[g][m];[g]scale=${Number(spec.width) || 1200}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle[gif];[m]scale=1600:-2[mp4]`,
      "-map", "[gif]", tmp[0], "-map", "[mp4]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", "-an", tmp[1]];
  const r = await run(["-loglevel", "error", "-y", ...args]);
  if (!r.ok) { for (const f of tmp) rmSync(f, { force: true }); return r; }
  outs.forEach((f, k) => renameSync(tmp[k], join(root, f)));
  const files = [...outs];
  if (!still) for (const reel of reelsWith(root, name)) { const j = await joinReel(root, reel, run); if (!j.ok) return { error: `Blurred, but its reel ${reel} isn't joined again: ${j.error}` }; files.push(`${reel}.mp4`); }
  return { ok: true, files };
}
// A product's own video (capture.mjs captureFile): the file as it came while no box is on
// and it isn't trimmed; else its picture blurred at its own size and rate, in its own
// kind of file, and its sound copied across as it is. Its size is the one it plays at
// (a phone's video turned upright), as its boxes were found. { ok, files } or { error }.
async function renderFile(root, name, spec, real, run) {
  const out = String(spec.source), tmp = join(root, `.${out}.render.${out.split(".").pop()}`), on = spec.regions.filter((r) => r && r.on);
  const [w, h] = Array.isArray(spec.size) ? spec.size.map(Number) : [0, 0], [start, end] = Array.isArray(spec.trim) ? spec.trim.map(Number) : [0, 0];
  if (!on.length && !(start > 0) && !(end > 0)) { try { copyFileSync(real, tmp); renameSync(tmp, join(root, out)); return { ok: true, files: [out] }; } catch (e) { rmSync(tmp, { force: true }); return { error: "Couldn't copy it into the tray: " + ((e && e.message) || e) }; } }
  if (!(w > 0 && h > 0)) return { error: "Couldn't tell how big the capture is." };
  const { graph, out: v } = blurGraph(on, w, h, start || 0, "[0:v]format=rgb24[v0]");
  const webm = /\.webm$/i.test(out), video = webm ? ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-row-mt", "1"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-movflags", "+faststart"];
  const r = await run(["-loglevel", "error", "-y", ...(start > 0 ? ["-ss", String(start)] : []), ...(end > 0 ? ["-to", String(end)] : []), "-i", real, "-filter_complex", `${graph};${v}format=yuv420p[out]`,
    "-map", "[out]", "-map", "0:a?", ...video, "-c:a", "copy", tmp]);
  if (!r.ok) { rmSync(tmp, { force: true }); return r; }
  renameSync(tmp, join(root, out));
  return { ok: true, files: [out] };
}
// ffmpeg's filters for the boxes switched on: each pixelated (a tenth its size), then blurred,
// so the text under it can't be read back, as tray.py did. A clip's box is there only in its
// moments (from/to, in the original's seconds; its times start at its trim). { graph, out }
function blurGraph(boxes, W, H, start, head) {
  const parts = [head]; let n = 0;
  for (const b of boxes) {
    const x = Math.max(0, Math.round(Number(b.x) || 0)), y = Math.max(0, Math.round(Number(b.y) || 0));
    const cw = Math.min(W, Math.round((Number(b.x) || 0) + (Number(b.w) || 0))) - x, ch = Math.min(H, Math.round((Number(b.y) || 0) + (Number(b.h) || 0))) - y;
    if (cw <= 0 || ch <= 0) continue;
    const when = start == null || (b.from == null && b.to == null) ? "" : `:enable='between(t,${(Number(b.from) || 0) - start},${(b.to == null ? 1e9 : Number(b.to)) - start})'`;
    parts.push(`[v${n}]split[v${n}a][v${n}b];[v${n}b]crop=${cw}:${ch}:${x}:${y},scale=${Math.max(1, Math.floor(cw / 10))}:${Math.max(1, Math.floor(ch / 10))}:flags=bilinear,scale=${cw}:${ch}:flags=neighbor,gblur=sigma=6[p${n}];[v${n}a][p${n}]overlay=${x}:${y}:format=rgb${when}[v${n + 1}]`);
    n++;
  }
  return { graph: parts.join(";"), out: `[v${n}]` };
}
// The reels (<reel>.reel.json) a clip is a part of, and one joined again from its clips' videos.
function reelsWith(root, name) {
  let fs = []; try { fs = readdirSync(root); } catch {}
  return fs.filter((f) => f.endsWith(".reel.json") && NAME.test(f)).map((f) => f.slice(0, -10)).filter((r) => { const s = readJson(join(root, `${r}.reel.json`)); return s && Array.isArray(s.parts) && s.parts.includes(name); });
}
async function joinReel(root, reel, run) {
  const s = readJson(join(root, `${reel}.reel.json`)), parts = (s && Array.isArray(s.parts) ? s.parts : []).map(String);
  if (!parts.length || !parts.every((p) => NAME.test(p) && existsSync(join(root, `${p}.mp4`)))) return { error: "one of its clips is missing" };
  const t = mkdtempSync(join(tmpdir(), "symbiot-reel-")), list = join(t, "parts.txt"), tmp = join(root, `.${reel}.mp4.render.mp4`);
  try {
    writeFileSync(list, parts.map((p) => `file '${join(root, `${p}.mp4`).replace(/'/g, "'\\''")}'\n`).join(""));
    const r = await run(["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", tmp]);
    if (!r.ok) { rmSync(tmp, { force: true }); return r; }
    renameSync(tmp, join(root, `${reel}.mp4`)); return { ok: true };
  } finally { rmSync(t, { recursive: true, force: true }); }
}
// A capture's size, by ffprobe ([w, h]), or null (then its .blur.json's size is used).
function sizeOf(file) {
  try { const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file], { encoding: "utf8", timeout: 20000 }); const m = String(r.stdout || "").match(/(\d+)x(\d+)/); return m ? [+m[1], +m[2]] : null; } catch { return null; }
}
function ffmpeg(args, { timeout = 180000 } = {}) {
  return new Promise((done) => {
    let err = "", p; try { p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"], timeout }); } catch (e) { done({ error: String((e && e.message) || e) }); return; }
    p.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    p.on("error", (e) => done({ error: e.code === "ENOENT" ? "Blurring needs ffmpeg, which isn't installed (on Linux: sudo apt install ffmpeg; on a Mac: brew install ffmpeg)." : String(e.message || e) }));
    p.on("close", (code) => done(code === 0 ? { ok: true } : { error: (err.trim().split("\n").pop() || `ffmpeg stopped (${code})`).slice(0, 300) }));
  });
}

export { trayDirs, trayMedia, trayOf, trays, setBlur, addBlur, removeBlur, setReviewed, renderCapture };
