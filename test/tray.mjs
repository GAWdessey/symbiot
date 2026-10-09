// The pick tray (tray.mjs): a product's captures under drafts/<product>/tray in Marketing's
// lane, as tools/tray.py writes them (tray.json, each capture's .blur.json), shown on the
// Marketing page with their blur boxes; a box switched and written back; a capture served
// only from inside a tray; one put on a post as its media (marketing.mjs setDraftMedia).
// Isolated HOME (set before the modules load).
//
//   node test/tray.mjs
//
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, existsSync } from "node:fs";
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

// a lane with a tray as tray.py leaves it: a still, a clip (the same box in two moments), a reel
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

console.log("TRAY — a blur box switched, written back where tray.py reads it");
const b1 = T.setBlur("drafts/symbiot/tray", "home", 2, true, { dir });
const back = JSON.parse(readFileSync(join(tray, "home.blur.json"), "utf8"));
ok("switched on in home.blur.json, everything else in it as it was", b1.ok && back.regions[1].on === true && back.regions[0].on === true && back.source === "home.png" && back.demo === true && back.regions[1].kind === "path" && back.regions[1].w === 800, back);
ok("…and off again", T.setBlur("drafts/symbiot/tray", "home", "1", false, { dir }).ok && JSON.parse(readFileSync(join(tray, "home.blur.json"), "utf8")).regions[0].on === false);
ok("a clip's box in each of its moments at once", T.setBlur("drafts/symbiot/tray", "clip-dash", [1, 5], true, { dir }).ok && JSON.parse(readFileSync(join(tray, "clip-dash.blur.json"), "utf8")).regions.every((r) => r.on));
ok("a box that isn't there: refused, nothing written", !!T.setBlur("drafts/symbiot/tray", "clip-dash", [1, 99], false, { dir }).error && JSON.parse(readFileSync(join(tray, "clip-dash.blur.json"), "utf8")).regions.every((r) => r.on));
ok("a capture outside a tray, or named with ../: refused", !!T.setBlur("drafts/symbiot", "home", 1, true, { dir }).error && !!T.setBlur("drafts/symbiot/tray", "../tray/home", 1, true, { dir }).error && !!T.setBlur("../outside", "x", 1, true, { dir }).error);
ok("the page sees it", T.trays({ dir })[0].items[0].regions[1].on === true);

console.log("TRAY — blurred again by the lane's tray.py");
const ran = [];
const r0 = await T.renderCapture("drafts/symbiot/tray", "home", { dir, run: (cwd, args) => (ran.push([cwd, ...args]), { ok: true }) });
ok("no tools/tray.py in the lane: says its agent renders it, runs nothing", /no tools\/tray\.py/.test(r0.error || "") && !ran.length, r0);
mkdirSync(join(dir, "tools"), { recursive: true }); writeFileSync(join(dir, "tools", "tray.py"), "import sys, pathlib\npathlib.Path(sys.argv[2], 'rendered-' + sys.argv[3]).write_text('ok')\n");
const r1 = await T.renderCapture("drafts/symbiot/tray", "home", { dir, run: (cwd, args) => (ran.push([cwd, ...args]), { ok: true }) });
ok("tray.py render <tray> <capture>, run in the lane", r1.ok && ran[0].join(" ") === `${dir} tools/tray.py render drafts/symbiot/tray home`, ran);
ok("not for a capture outside a tray", !!(await T.renderCapture("drafts", "x", { dir, run: () => ({ ok: true }) })).error);
if (spawnSync("python3", ["--version"]).status === 0) {
  const r2 = await T.renderCapture("drafts/symbiot/tray", "home", { dir });
  ok("…really run (python3 here): it ran in the lane", r2.ok && existsSync(join(tray, "rendered-home")), r2);
  writeFileSync(join(dir, "tools", "tray.py"), "raise SystemExit('PIL is missing')\n");
  const r3 = await T.renderCapture("drafts/symbiot/tray", "home", { dir });
  ok("…one that fails says why", /PIL is missing/.test(r3.error || ""), r3);
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
