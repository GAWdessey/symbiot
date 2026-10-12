// Symbiot desktop: Symbiot, installed like any other app (Setup.exe on Windows, a .dmg
// on a Mac, an AppImage or .deb on Linux). Electron is only what it runs on and its
// tray icon: it carries its own Node, so nobody installs Node, npm or anything else.
// The Symbiot it runs is the `symbiot` package (bundled), started in the background
// as on any computer, and Symbiot opens its own window (Edge or Chrome), so it looks
// and works the same, voice included. One copy at a time: opening it again, or the
// tray icon, brings the window up; Quit stops Symbiot too.

const { app, Tray, Menu, nativeImage, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const SYMBIOT = () => path.join(app.getAppPath(), "node_modules", "symbiot", "index.mjs");
// Symbiot runs on Electron's own Node; inside the app it doesn't offer npm updates
// (the app updates itself) or make shortcuts of its own (the installer did).
const env = () => ({ ...process.env, ELECTRON_RUN_AS_NODE: "1", SYMBIOT_DESKTOP: "1", SYMBIOT_NO_LAUNCHER: "1" });
const LOG = () => path.join(os.homedir(), ".config", "symbiot", "desktop.log");
function log(line) { try { fs.mkdirSync(path.dirname(LOG()), { recursive: true }); fs.appendFileSync(LOG(), `${new Date().toISOString()} ${line}\n`); } catch {} }

// `symbiot open`: brings up the running Symbiot's window, or starts Symbiot in the
// background (it opens its window itself, and setup on a first run).
function openSymbiot() {
  try {
    const ch = spawn(process.execPath, [SYMBIOT(), "open"], { env: env(), stdio: "ignore", windowsHide: true });
    ch.on("error", (e) => log("open failed: " + e.message));
  } catch (e) { log("open failed: " + e.message); }
}

// Quit: Symbiot stops too (asked through its own address, with its token).
async function quitSymbiot() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config", "symbiot", "config.json"), "utf8"));
    if (cfg.appToken) await fetch(`http://127.0.0.1:${Number(cfg.appPort) || 7391}/api/quit`, { headers: { "x-symbiot-token": cfg.appToken }, signal: AbortSignal.timeout(2000) });
  } catch {}
}

let tray = null;
function makeTray() {
  const icon = nativeImage.createFromPath(path.join(app.getAppPath(), "assets", process.platform === "darwin" ? "trayTemplate.png" : "tray.png"));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("Symbiot");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Symbiot", click: openSymbiot },
    { label: "Report a problem", click: () => shell.openExternal("https://github.com/GAWdessey/symbiot/issues") },
    { type: "separator" },
    { label: "Quit Symbiot", click: async () => { await quitSymbiot(); app.quit(); } },
  ]));
  tray.on("click", openSymbiot); // Windows and Linux: a click on the orb opens it
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", openSymbiot); // opened again (Start menu, desktop, dock): show it
  app.whenReady().then(() => {
    if (process.platform === "darwin" && app.dock) app.dock.hide(); // it lives in the menu bar
    makeTray();
    openSymbiot();
  });
  app.on("window-all-closed", () => {}); // no windows of its own: it stays, in the tray
}
