// The pick tray (tray.mjs): a product's captures under drafts/<product>/tray in Marketing's
// lane, as its agent writes them (tray.json, each capture's .blur.json), shown on the
// Marketing page with their blur boxes; a box switched, written back and blurred again by
// Symbiot with ffmpeg (never by the lane's own script); a capture served
// only from inside a tray; one put on a post as its media (marketing.mjs setDraftMedia).
// Isolated HOME (set before the modules load).
//
//   node test/tray.mjs
//
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-tray-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const M = await import("../marketing.mjs");
const T = await import("../tray.mjs");

// a lane with a tray as its agent leaves it: a still, a clip (the same box in two moments), a reel
const dir = join(HOME, "lane"), tray = join(dir, "drafts", "symbiot", "tray");
mkdirSync(tray, { recursive: true }); mkdirSync(join(dir, ".symbiot", "tray-originals", "symbiot"), { recursive: true }); mkdirSync(join(HOME, "outside"), { recursive: true });
for (const f of ["home.png", "clip-dash.gif", "clip-dash.mp4", "reel.mp4"]) writeFileSync(join(tray, f), "x");
writeFileSync(join(dir, ".symbiot", "tray-originals", "symbiot", "home.png"), "unblurred");
writeFileSync(join(HOME, "outside", "secret.png"), "secret");
symlinkSync(join(HOME, "outside", "secret.png"), join(tray, "linked.png"));
const still = { source: "home.png", kind: "still", size: [1600, 900], screen: "Home", caption: "Home", for: ["01-first.md"], demo: true, regions: [{ id: 1, kind: "email", x: 400, y: 90, w: 160, h: 45, hint: "", on: true }, { id: 2, kind: "path", x: 0, y: 0, w: 800, h: 450, hint: "", on: false }] };
const clip = { source: "clip-dash.webm", kind: "clip", size: [1600, 900], screen: "Dashboard", caption: "Clip: the Dashboard", for: ["02-second.md"], fps: 10, regions: [{ id: 1, kind: "inbox", x: 1267, y: 275, w: 238, h: 59, from: 6.7, to: 7.5, on: false }, { id: 5, kind: "inbox", x: 1267, y: 275, w: 238, h: 59, from: 7.5, to: 14.9, on: false }] };
writeFileSync(join(tray, "home.blur.json"), JSON.stringify(still, null, 2));
writeFileSync(join(tray, "clip-dash.blur.json"), JSON.stringify(clip, null, 2));
writeFileSync(join(tray, "tray.json"), JSON.stringify({ tray: "symbiot", items: [
  { name: "home", kind: "still", files: ["home.png"], screen: "Home", caption: "Home", for: ["01-first.md"], blur: "home.blur.json", blurred: ["email"], found: 2, on: 1, demo: true },
  { name: "clip-dash", kind: "clip", files: ["clip-dash.gif", "clip-dash.mp4"], screen: "Dashboard", caption: "Clip: the Dashboard", for: ["02-second.md"], blur: "clip-dash.blur.json", blurred: [], found: 2, on: 0, demo: true },
  { name: "reel", kind: "reel", files: ["reel.mp4"], screen: "several", caption: "Reel", for: ["01-first.md"], parts: ["clip-dash"], blurred: [], demo: true },
  { name: "../evil", kind: "still", files: ["../../../outside/secret.png"] }] }, null, 2));
const draft = (f, title, extra = "") => writeFileSync(join(dir, "drafts", "symbiot", f), `# ${title}\nproduct: Symbiot\nplatform: linkedin\n${extra}\n## Post\n${title}, the post.\n\n## Notes\nnone\n`);
draft("01-first.md", "First look", "when: 2026-10-13 08:00\n"); draft("02-second.md", "Second", "media: old.png\n"); draft("03-third.md", "Third");
writeFileSync(join(dir, "drafts", "symbiot", "old.png"), "x");

console.log("TRAY — what the page shows");
const ts = T.trays({ dir });
const t = ts[0] || { items: [], drafts: [] }, home = t.items.find((x) => x.name === "home") || {}, cl = t.items.find((x) => x.name === "clip-dash") || {}, reel = t.items.find((x) => x.name === "reel") || {};
ok("a tray a product with a tray.json: drafts/symbiot/tray, named by its drafts' product", ts.length === 1 && t.rel === "drafts/symbiot/tray" && t.product === "Symbiot", ts.map((x) => [x.rel, x.product]));
ok("its captures as tray.json lists them, none named out of the tray", t.items.map((x) => x.name).join() === "home,clip-dash,reel", t.items.map((x) => x.name));
ok("a still shows its picture and a post takes it; a clip shows its GIF and a post takes its MP4", home.show === "drafts/symbiot/tray/home.png" && home.use === home.show && cl.show === "drafts/symbiot/tray/clip-dash.gif" && cl.use === "drafts/symbiot/tray/clip-dash.mp4" && reel.showKind === "video", [home.show, cl.show, cl.use, reel.showKind]);
ok("its blur boxes from its .blur.json, as fractions of its size, on or off", home.regions.length === 2 && home.regions[0].on && !home.regions[1].on && home.regions[0].x === 0.25 && home.regions[0].y === 0.1 && home.regions[1].w === 0.5, home.regions);
ok("…a clip's keep the moments they're in", cl.regions[0].from === 6.7 && cl.regions[1].to === 14.9);
ok("…a reel has none of its own (its clips' blur is in it)", reel.regions.length === 0 && !reel.blur);
ok("its product's drafts to use one in, not the tray's own files, with their media now", t.drafts.map((d) => d.rel).join() === "drafts/symbiot/01-first.md,drafts/symbiot/02-second.md,drafts/symbiot/03-third.md" && t.drafts[1].media.join() === "drafts/symbiot/old.png", t.drafts);
ok("no tray.json: no tray", T.trays({ dir: join(HOME, "nothing") }).length === 0);

console.log("TRAY — a capture served only from inside a tray");
ok("one in the tray is served", T.trayMedia("drafts/symbiot/tray/home.png", { dir }) && T.trayMedia("drafts/symbiot/tray/home.png", { dir }).type === "image/png");
ok("../ out of it isn't", !T.trayMedia("drafts/symbiot/tray/../../../../outside/secret.png", { dir }) && !T.trayMedia("drafts/symbiot/tray/..%2F..%2Fx.png", { dir }));
ok("a link in it to a file outside isn't", !T.trayMedia("drafts/symbiot/tray/linked.png", { dir }));
ok("the unblurred originals (.symbiot/tray-originals) aren't", !T.trayMedia(".symbiot/tray-originals/symbiot/home.png", { dir }) && !T.trayMedia("drafts/symbiot/tray/../../../.symbiot/tray-originals/symbiot/home.png", { dir }));
ok("a draft beside the tray isn't (only the tray's own files)", !T.trayMedia("drafts/symbiot/old.png", { dir }) && !T.trayMedia("drafts/symbiot/01-first.md", { dir }));
ok("nor its .blur.json or tray.json (not pictures or videos)", !T.trayMedia("drafts/symbiot/tray/tray.json", { dir }) && !T.trayMedia("drafts/symbiot/tray/home.blur.json", { dir }));

console.log("TRAY — a blur box switched, written back to its .blur.json");
const b1 = T.setBlur("drafts/symbiot/tray", "home", 2, true, { dir });
const back = JSON.parse(readFileSync(join(tray, "home.blur.json"), "utf8"));
ok("switched on in home.blur.json, everything else in it as it was", b1.ok && back.regions[1].on === true && back.regions[0].on === true && back.source === "home.png" && back.demo === true && back.regions[1].kind === "path" && back.regions[1].w === 800, back);
ok("…and off again", T.setBlur("drafts/symbiot/tray", "home", "1", false, { dir }).ok && JSON.parse(readFileSync(join(tray, "home.blur.json"), "utf8")).regions[0].on === false);
ok("a clip's box in each of its moments at once", T.setBlur("drafts/symbiot/tray", "clip-dash", [1, 5], true, { dir }).ok && JSON.parse(readFileSync(join(tray, "clip-dash.blur.json"), "utf8")).regions.every((r) => r.on));
ok("a box that isn't there: refused, nothing written", !!T.setBlur("drafts/symbiot/tray", "clip-dash", [1, 99], false, { dir }).error && JSON.parse(readFileSync(join(tray, "clip-dash.blur.json"), "utf8")).regions.every((r) => r.on));
ok("a capture outside a tray, or named with ../: refused", !!T.setBlur("drafts/symbiot", "home", 1, true, { dir }).error && !!T.setBlur("drafts/symbiot/tray", "../tray/home", 1, true, { dir }).error && !!T.setBlur("../outside", "x", 1, true, { dir }).error);
ok("the page sees it", T.trays({ dir })[0].items[0].regions[1].on === true);

console.log("TRAY — blurred again by Symbiot itself, with ffmpeg, never by the lane's own script");
// a fake ffmpeg: notes what it was asked and writes the files it was to make
const ran = [], fake = (args) => { ran.push(args); for (const a of args) if (/\.render\.(png|gif|mp4)$/.test(a)) writeFileSync(a, "rendered"); return { ok: true }; };
const sz = () => [1600, 900], ORIG = join(dir, ".symbiot", "tray-originals", "symbiot");
mkdirSync(join(dir, "tools"), { recursive: true }); writeFileSync(join(dir, "tools", "tray.py"), "import pathlib\npathlib.Path('RAN-TRAY-PY').write_text('ran')\n"); // an agent's script: never run by the app
const r0 = await T.renderCapture("drafts/symbiot/tray", "clip-dash", { dir, run: fake, size: sz });
ok("its unblurred original isn't there: says its agent renders it, runs nothing", /tray-originals/.test(r0.error || "") && !ran.length, r0);
const r1 = await T.renderCapture("drafts/symbiot/tray", "home", { dir, run: fake, size: sz }), a1 = (ran[0] || []).join(" ");
ok("a still: from its original, into its picture in the tray", r1.ok && r1.files.join() === "home.png" && ran[0].includes(join(ORIG, "home.png")) && readFileSync(join(tray, "home.png"), "utf8") === "rendered", [r1, a1]);
ok("…only the boxes switched on, pixelated, then blurred", /crop=800:450:0:0,scale=80:45:flags=bilinear,scale=800:450:flags=neighbor,gblur=sigma=6/.test(a1) && !/crop=160:45/.test(a1), a1);
ok("…and the lane's tools/tray.py isn't run", !existsSync(join(dir, "RAN-TRAY-PY")) && !existsSync("RAN-TRAY-PY") && !ran.some((x) => x.some((y) => /tray\.py|python/.test(y))));
writeFileSync(join(ORIG, "clip-dash.webm"), "unblurred");
writeFileSync(join(tray, "reel.reel.json"), JSON.stringify({ parts: ["clip-dash"], caption: "Reel" })); writeFileSync(join(tray, "other.reel.json"), JSON.stringify({ parts: ["home-clip"] }));
ran.length = 0;
const r2 = await T.renderCapture("drafts/symbiot/tray", "clip-dash", { dir, run: fake, size: sz }), a2 = (ran[0] || []).join(" ");
ok("a clip: its GIF and MP4, at its fps, each box only in its moments", r2.ok && /fps=10,/.test(a2) && /enable='between\(t,6\.7,7\.5\)'/.test(a2) && /enable='between\(t,7\.5,14\.9\)'/.test(a2) && readFileSync(join(tray, "clip-dash.gif"), "utf8") === "rendered" && readFileSync(join(tray, "clip-dash.mp4"), "utf8") === "rendered", [r2, a2]);
ok("…and the reel it's in joined again (its blur is in the reel too), not a reel it isn't in", r2.files.join() === "clip-dash.gif,clip-dash.mp4,reel.mp4" && ran.length === 2 && ran[1].includes("concat") && readFileSync(join(tray, "reel.mp4"), "utf8") === "rendered", [r2.files, ran.length]);
ok("…no half-made file left in the tray", !readdirSync(tray).some((f) => /\.render\./.test(f)), readdirSync(tray));
const keep = readFileSync(join(tray, "home.png"), "utf8");
const r3 = await T.renderCapture("drafts/symbiot/tray", "home", { dir, run: (args) => { for (const a of args) if (/\.render\./.test(a)) writeFileSync(a, "half"); return { error: "Invalid too big or non positive size" }; }, size: sz });
ok("ffmpeg fails: says why, the picture there stays, nothing half-made left", /non positive size/.test(r3.error || "") && readFileSync(join(tray, "home.png"), "utf8") === keep && !readdirSync(tray).some((f) => /\.render\./.test(f)), r3);
const spec = JSON.parse(readFileSync(join(tray, "home.blur.json"), "utf8"));
writeFileSync(join(tray, "home.blur.json"), JSON.stringify({ ...spec, source: "../../outside/secret.png" })); ran.length = 0;
ok("an original named out of tray-originals: refused, nothing run", !!(await T.renderCapture("drafts/symbiot/tray", "home", { dir, run: fake, size: sz })).error && !ran.length);
symlinkSync(join(HOME, "outside", "secret.png"), join(ORIG, "linked.png")); writeFileSync(join(tray, "home.blur.json"), JSON.stringify({ ...spec, source: "linked.png" }));
ok("…or linked out of it: refused", !!(await T.renderCapture("drafts/symbiot/tray", "home", { dir, run: fake, size: sz })).error && !ran.length);
writeFileSync(join(tray, "home.blur.json"), JSON.stringify(spec));
ok("not for a capture outside a tray", !!(await T.renderCapture("drafts", "x", { dir, run: fake })).error && !!(await T.renderCapture("drafts/symbiot/tray", "../tray/home", { dir, run: fake })).error);
if (spawnSync("ffmpeg", ["-version"]).status === 0) {
  // really blurred (ffmpeg here): a picture and a clip with text on, a box over part of it
  const real = join(HOME, "real"), rt = join(real, "drafts", "demo", "tray"), ro = join(real, ".symbiot", "tray-originals", "demo");
  mkdirSync(rt, { recursive: true }); mkdirSync(ro, { recursive: true });
  spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=1", "-frames:v", "1", join(ro, "pic.png")]);
  spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10", "-t", "2", "-pix_fmt", "yuv420p", join(ro, "mov.mp4")]);
  writeFileSync(join(rt, "pic.blur.json"), JSON.stringify({ source: "pic.png", kind: "still", size: [320, 180], regions: [{ id: 1, kind: "name", x: 20, y: 20, w: 120, h: 60, on: true }, { id: 2, kind: "edge", x: 300, y: 170, w: 100, h: 100, on: true }] }));
  writeFileSync(join(rt, "mov.blur.json"), JSON.stringify({ source: "mov.mp4", kind: "clip", size: [320, 180], fps: 10, width: 160, trim: [0.5, 0], regions: [{ id: 1, kind: "name", x: 20, y: 20, w: 120, h: 60, from: 1, to: 2, on: true }] }));
  writeFileSync(join(rt, "reel.reel.json"), JSON.stringify({ parts: ["mov", "mov"] }));
  writeFileSync(join(rt, "tray.json"), JSON.stringify({ tray: "demo", items: [] }));
  const px = (f, x, y) => spawnSync("ffmpeg", ["-loglevel", "error", "-i", f, "-vf", `crop=1:1:${x}:${y},format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "-"]).stdout.toString("hex");
  const s1 = await T.renderCapture("drafts/demo/tray", "pic", { dir: real }), out = join(rt, "pic.png");
  ok("…really blurred (ffmpeg here): inside the box changed, outside it as it was, a box over the edge cut to fit", s1.ok && existsSync(out) && px(out, 60, 50) !== px(join(ro, "pic.png"), 60, 50) && px(out, 250, 120) === px(join(ro, "pic.png"), 250, 120), s1);
  const s2 = await T.renderCapture("drafts/demo/tray", "mov", { dir: real });
  ok("…a clip: a GIF and an MP4, and its reel joined", s2.ok && readFileSync(join(rt, "mov.gif")).subarray(0, 6).toString() === "GIF89a" && existsSync(join(rt, "mov.mp4")) && existsSync(join(rt, "reel.mp4")) && s2.files.includes("reel.mp4"), s2);
}

console.log("TRAY — a capture as a post's media, one click (marketing.mjs setDraftMedia)");
const u1 = M.setDraftMedia("drafts/symbiot/03-third.md", ["drafts/symbiot/tray/home.png"], { dir });
const third = readFileSync(join(dir, "drafts", "symbiot", "03-third.md"), "utf8");
ok("no media yet: a media: line after its head, by its path from the draft", u1.ok && u1.media.join() === "tray/home.png" && /^platform: linkedin\nmedia: tray\/home\.png\n/m.test(third) && /## Post\nThird, the post\./.test(third), third);
ok("…which its preview shows", M.draftPreview("drafts/symbiot/03-third.md", { dir, cfg: {} }).media[0].rel === "drafts/symbiot/tray/home.png");
const u2 = M.setDraftMedia("drafts/symbiot/02-second.md", ["drafts/symbiot/tray/clip-dash.mp4"], { dir }), second = readFileSync(join(dir, "drafts", "symbiot", "02-second.md"), "utf8");
ok("one there already: replaced where it was, nothing else moved", u2.ok && second === "# Second\nproduct: Symbiot\nplatform: linkedin\nmedia: tray/clip-dash.mp4\n\n## Post\nSecond, the post.\n\n## Notes\nnone\n", second);
M.setDraftStatus("drafts/symbiot/01-first.md", "approved", { dir });
const u3 = M.setDraftMedia("drafts/symbiot/01-first.md", ["drafts/symbiot/tray/reel.mp4"], { dir });
ok("approved with another picture: it asks for your OK again", u3.ok && u3.reopened && M.draftPreview("drafts/symbiot/01-first.md", { dir, cfg: {} }).status === "", u3);
M.setDraftStatus("drafts/symbiot/01-first.md", "approved", { dir });
ok("…the same one again changes nothing, and keeps the approval", M.setDraftMedia("drafts/symbiot/01-first.md", ["drafts/symbiot/tray/reel.mp4"], { dir }).same && M.draftPreview("drafts/symbiot/01-first.md", { dir, cfg: {} }).status === "approved");
ok("a video and pictures together: refused", /one video, or pictures/.test(M.setDraftMedia("drafts/symbiot/03-third.md", ["drafts/symbiot/tray/home.png", "drafts/symbiot/tray/reel.mp4"], { dir }).error || ""));
ok("a file outside the lane, or not a picture or video: refused", !!M.setDraftMedia("drafts/symbiot/03-third.md", ["../outside/secret.png"], { dir }).error && !!M.setDraftMedia("drafts/symbiot/03-third.md", ["drafts/symbiot/tray/tray.json"], { dir }).error);
M.setDraftStatus("drafts/symbiot/03-third.md", "superseded", { dir, by: "drafts/symbiot/01-first.md" });
ok("not on a superseded post", /superseded by drafts\/symbiot\/01-first\.md/.test(M.setDraftMedia("drafts/symbiot/03-third.md", ["drafts/symbiot/tray/home.png"], { dir }).error || ""));
ok("the page lists its status, so Use skips it", T.trays({ dir })[0].drafts.find((d) => d.rel === "drafts/symbiot/03-third.md").status === "superseded");

console.log(`\n${fail ? "✗" : "✓"} tray: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
