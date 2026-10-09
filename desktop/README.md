# Symbiot desktop

Symbiot, installed like any other app: download it from
[symbiot.co.za](https://symbiot.co.za), open it, and you're in setup. No terminal,
no Node, no npm.

- **Windows:** `Symbiot-Setup.exe` installs for you alone (no admin), adds Symbiot
  to the Start menu and the desktop, and opens it.
- **Mac:** `Symbiot.dmg`, drag Symbiot to Applications.
- **Linux:** `symbiot.deb` (Ubuntu, Pop!_OS, Debian, Mint), or `Symbiot.AppImage`
  for other Linux (it needs FUSE).

## How it works

Electron here is only what Symbiot runs on, plus its tray icon. It carries its own
Node, and the app bundles the [`symbiot`](https://www.npmjs.com/package/symbiot)
package and runs it in the background exactly as on any computer. Symbiot then
opens its own window (Edge or Chrome), so the app looks and works the same as
everywhere else, voice included. Inside the app Symbiot doesn't offer npm updates
or make shortcuts of its own (`SYMBIOT_DESKTOP`, `SYMBIOT_NO_LAUNCHER`).

One copy at a time: opening it again, or clicking the tray icon, brings the window
up. **Quit Symbiot** in the tray menu stops Symbiot too. Your data lives in
`~/.config/symbiot`, shared with the npm version.

## Releases

Nothing to do by hand. Every new Symbiot version that reaches npm also builds the
installers: the `desktop` job in `.github/workflows/publish.yml` sets this app to
that version, bundles that exact `symbiot`, builds on real Windows, Mac and Linux
machines and attaches `Symbiot-Setup.exe`, `Symbiot.dmg`, `symbiot.deb` and
`Symbiot.AppImage` to the version's GitHub release. The website offers the newest
release that has each one.

## Develop

```bash
cd desktop
npm install
npm start          # the tray, and Symbiot's window
npm run dist:linux # or dist:win / dist:mac, into dist/
```
