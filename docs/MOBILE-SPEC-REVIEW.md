# Mobile companion spec review

Reviewed: *TECHNICAL ARCHITECTURE & SYSTEM SPECIFICATION: Local-First SaaS & Mobile Companion Design*, v1.0.0, a 3-page PDF (`~/Downloads/System Design Specification - Local-First SaaS Companion.pdf`, 2026-10-09). It names no product, so this review reads it against Symbiot as of 0.58.2. Section numbers (§1 to §8) are the spec's own.

What Symbiot has today, in short: the computer runs `symbiot app`, a Node server on 127.0.0.1 behind one per-install token (`server.mjs` 205-209, 258-261). Everything it keeps is JSON files under `~/.config/symbiot/` (`core.mjs` 22, 36: `config.json`, `tasks.json`, `watch.json`, `mind.json` and the rest). The phone is either Symbiot in Termux or the Android app (`android/`), and both run a whole separate Symbiot (Node inside the APK, shown in a WebView). The two meet only through **Watch on your phone** (`phone.mjs`). It's switched on in Settings. The computer listens on port 7392 for a 6-digit pairing code and for "what's new since …". The phone types in the computer's address and the code, then asks every 2 minutes and turns the answer into notifications. It is read-only by design (`phone.mjs` 1-14).

## What fits

- **No hardware IDs, a pairing token instead (§1, §8).** `phone.mjs` 68-78 already does this. A 6-digit code lasts 10 minutes and allows 5 tries. It is swapped for a random 24-byte token per phone, compared in constant time and revocable (`unpairPhone`). Nothing reads a MAC address or IMEI.
- **Local-first with no hosting fees (§2, Executive Overview).** This is how Symbiot already works: no accounts (README "No accounts, no OAuth"), free (site/index.html), and the computer as the main node. The phone only asks the computer for news (`pollComputer`).
- **Heavy work on the computer (§4 Mode A).** Agents run on the computer. README ("Your coding agent isn't inside it") says the phone app doesn't carry one.
- **The phone stays paired across restarts and IP changes on its side (§5, §8).** The token is saved in the phone's `config.computer` (`phone.mjs` 133) and doesn't depend on the phone's IP. A dropped connection never unpairs it (only a 403 means "pair again").

## What conflicts with how Symbiot works now

- **The stack (§7).** The spec picks Tauri or Electron, React Native or Flutter, and SQLite with WatermelonDB or PowerSync. Symbiot chose against each of these:
  - No Electron. The window is Chrome's `--app` mode (`desktop.mjs` 3, `server.mjs` `openApp`).
  - The Android app is Java plus a WebView with Node bundled inside, sideloaded on purpose at targetSdk 28 so it can run Node and git (`android/AndroidManifest.xml` 2-4, `android/build.sh`).
  - Storage is plain JSON files (`core.mjs`). There is one runtime dependency (`package.json` 83-85), and the package supports Node 18 or newer, while built-in SQLite needs Node 22.5 or newer.
  
  Adopting §7 would mean rewriting both apps, so the spec's goals should be met with the stack Symbiot already has (see Decisions).
- **CRDT merging (§6, §7: Yjs or Automerge).** Symbiot writes whole JSON files and has no per-field history. Some actions are relative: `toggleTask` flips "done" (`tasks.mjs` 52), so replaying a queued toggle twice would undo it. A phone queue needs absolute actions ("mark done") applied once each, by ID, with "last change wins". A CRDT library isn't needed for the few things a phone changes.
- **Two-way, real-time sync (§4 Mode A, §3 "WebSockets").** Today the phone link is read-only and polls every 2 minutes (`phone.mjs` 5-7, 24). The UI promises "Nothing can be changed from there" (`ui.mjs` 1870). Letting the phone write is a change to a security promise, not just to how data moves.
- **"Mobile companion with local SQLite" (§3) versus a second full Symbiot.** The Android app runs its own Symbiot over the phone's own storage (README "The Android app (APK)"). Its tasks and memory are separate from the computer's, and nothing syncs them. The spec's phone is a cache of the computer's state. That role would sit beside the phone's own Symbiot, and the UI must label which data is whose.
- **"SaaS", "High-Availability", "zero downtime" (header, Executive Overview).** Symbiot has no server to keep up. A laptop that's asleep is simply Mode B, so the docs shouldn't promise more than that.

## Gaps (in the spec, not in Symbiot yet)

- **Encryption (§3 "Encrypted", §8 handshake).** The link is plain HTTP on the LAN (`phone.mjs` 99, binds 0.0.0.0). The app tells users that mail senders and subjects cross the Wi-Fi unencrypted (`ui.mjs` 1870), and the APK allows cleartext (`AndroidManifest.xml` 22).
- **QR pairing (§8).** Today you type the address and the code by hand (`ui.mjs` 1862, 1867).
- **Automatic discovery (§5 mDNS).** There's none. The computer lists its addresses (`lanAddresses`, `phone.mjs` 36), and the phone stores one fixed URL (`phone.mjs` 133). If the computer's IP changes, the phone loses it until it's paired again.
- **Reaching the computer from outside the home network (§5 WAN).** Not possible: "The phone has to be on the same Wi-Fi" (`ui.mjs` 1862).
- **Mode B (§4).** There's no copy of the computer's state on the phone and no "Mobile Mode" status. A failed poll only sets a line in Settings (`phone.mjs` `pollErr`).
- **Offline queue (§6).** None. The phone can't change anything on the computer at all.
- **Secure token storage (§7, §8 Keystore/Keychain).** Tokens sit in `config.json` (mode 0600) on both sides. The computer keeps every phone's token in plain text (`config.phoneLink.phones`, `phone.mjs` 12). The Android app keeps its token in its private files (`allowBackup="false"`) but not in the Keystore.
- **iOS (§1, §7, §8).** No iOS app exists. iOS won't run a bundled Node, so an iPhone companion would have to be a different, thinner app. This is out of scope here and only noted.

## Risks

- **A phone becomes a remote control for a computer that runs agents.** The app's full API includes `/api/agentcmd`, which sets the shell command every agent run executes (`server.mjs` 310). It also includes `/api/update`, `/api/quit`, Screens clicks and typing, and provider keys (`/api/connect`). The phone link must never get the app token or forward to that API. It needs its own short allowlist on the 7392 listener, with each route checked against that phone's token.
- **Approve from a phone can publish a release.** Approve merges, and a version bump publishes to npm (project practice). Approving is a decision for the user (Decision 2).
- **Announcing on the network.** mDNS tells everyone on a café's Wi-Fi that a Symbiot is there. It should announce only while the phone link is on, under a neutral name and not the computer's hostname. (Pairing currently returns `hostname()`, `phone.mjs` 78.)
- **A relay server breaks the product's promise.** "No accounts" and "nothing leaves your computer" (README, site) stop being true once traffic goes through the company's servers (Decision 1).
- **Battery.** A WebSocket held open by the Android foreground service (`SymbiotService.java`) costs battery. Polling, plus faster refresh while the app window is open, covers Mode A's "instant" feel for a fraction of the cost.
- **Termux.** It has no Android discovery API and no camera, so typed pairing (`symbiot phone pair`, `index.mjs` 610-616) has to stay as the fallback.

## Tasks

Ordered: secure the link first, then make pairing easy, then sync. Each task ships with `npm run lint && npm test` green. New modules go in `package.json` `files`, and new test files go in the `test` script. Each task also gets a README section (the "Watch on your phone" part of "The Android app (APK)") and a CHANGELOG entry. Phone link tests live in `test/fixtures.mjs` ("WATCH ON YOUR PHONE", around line 1433) or a new `test/phone.mjs`. UI goes in the liquid (a droplet or a line, not a new tab or setting) and gets checked in a real browser in all three looks (Ferrofluid, Glass, Pearl), using `.symbiot/cdp.mjs`. APK changes get tested on the emulator and the phone.

The user decided first-run steps belong in onboarding. Onboarding today is **Setup**: `home.mjs` `ONB_STEPS = ["welcome", "ai", "work", "agent", "apps", "docs", "done"]`, saved in `config.onboarding`, served at `/api/onboarding*` (`server.mjs` 425-428), drawn by the `onb*` code in `ui.mjs` (from about line 3241) and tested in `test/onboarding.mjs`. Settings' checklist is `home.mjs` `firstSteps`. Task 4 adds the phone there, not as a separate wizard.

### 1. Encrypt the phone link

**Task.** Everything between the phone and the computer on port 7392 is plain HTTP today (`phone.mjs`), and the app warns that mail subjects cross the Wi-Fi unencrypted (`ui.mjs` around 1870). Encrypt it using only `node:crypto` (no new dependency):
- When the phone link is first switched on, the computer makes a long-lived X25519 key pair and keeps it in `config.phoneLink`.
- At pairing, the phone sends its own public key with the code. Both sides derive a shared key (HKDF over the ECDH secret plus the pairing code). From then on every request and response body is AES-256-GCM sealed, with a counter or timestamp so it can't be replayed.
- The pairing reply carries the computer's public-key fingerprint, and the phone pins it in `config.computer`.

Phones paired before this get a clear "pair again" message instead of a silent failure. Remove the "unencrypted" warning text. Keep the Termux CLI (`symbiot phone pair`) working.

**Spec:** §3 ("Encrypted" link), §8 (cryptographic handshake).
**Files:** `phone.mjs`, `ui.mjs` (phone link text), `index.mjs` (`cmdPhone`), `test/fixtures.mjs` or new `test/phone.mjs`, README, CHANGELOG.
**Done when:** a test shows that a raw request to `/phone/news` without the sealed envelope gets 403. A captured response body contains no plain subjects. A phone with a pre-encryption token is told to pair again. Pairing and polling work end to end between two test HOMEs.

### 2. Pair by scanning a QR code

**Task.** Make pairing a scan instead of typing.
- When the computer opens a pairing code (`newCode`), it also shows a QR code. The QR holds a link `symbiot://pair?a=<addresses>&p=<port>&c=<code>&k=<key fingerprint>`. Write a small built-in QR encoder (byte mode, error correction level M) as a new module rather than adding a dependency.
- Add an intent filter for `symbiot://pair` to `android/AndroidManifest.xml`. Then `MainActivity` hands it to the page (through the `SymbiotAndroid` bridge or a page URL), and the page calls `/api/phone/pair`. That way the phone's own camera app (Samsung Camera, Google Lens) scans it, and the APK needs no camera code.
- Try each address in the link until one answers. Pin the key fingerprint from task 1.
- Keep the typed address and code as the fallback, for Termux too.

**Spec:** §8 (QR pairing flow), §1 (pairing token as the identity).
**Files:** new `qr.mjs` (or similar, added to `package.json` `files`), `phone.mjs`, `ui.mjs`, `android/AndroidManifest.xml`, `android/src/co/symbiot/app/MainActivity.java`, tests, README, CHANGELOG.
**Done when:** a unit test decodes the generated QR matrix back to the same link. On the emulator, opening `symbiot://pair?...` with adb pairs the app with a test computer. The QR shows in all three looks and is readable at phone-camera distance. Typed pairing still works.

### 3. Find the computer on the network without an address

**Task.** While the phone link is on, the computer announces itself on the local network with mDNS. Write a minimal responder over `node:dgram` (multicast 224.0.0.251:5353) that answers queries for `_symbiot._tcp.local`. Use a neutral instance name, not the hostname, and include a TXT record with the key fingerprint. Stop announcing when the link is switched off.

On the Android app, use Android's `NsdManager` in Java to look for `_symbiot._tcp` and expose the results to the page through the `SymbiotAndroid` bridge. The phone then finds its paired computer by fingerprint rather than by stored IP, and updates `config.computer.url` when the IP has changed. The pairing screen also lists the computers it found.

Termux has no discovery API, so it keeps using the stored URL and typed addresses.

**Spec:** §5 (Local auto-discovery, mDNS/Zeroconf), §7 (Local Discovery).
**Files:** new `mdns.mjs` (added to `files`), `phone.mjs`, `android/src/co/symbiot/app/MainActivity.java` (or a small new Java class), `ui.mjs`, tests, README, CHANGELOG.
**Done when:** a test that sends an mDNS query over loopback multicast gets the service back (skipped cleanly where multicast isn't available). On a real network, changing the computer's IP doesn't break a paired phone: it finds the computer again within one poll. Nothing is announced while the link is off.

### 4. Add "Your phone" to Setup (onboarding), on both sides

**Task.** Put phone pairing in Setup, the first-run flow in `home.mjs` (`ONB_STEPS`, `onboarding`, `setOnboarding`) drawn by the `onb*` code in `ui.mjs`. Don't build a separate wizard.
- **On a computer:** add an optional `phone` step between `docs` and `done`. It explains in one line what the phone gets. If the user says yes, it switches the phone link on and shows the QR from task 2. "I don't have the app" skips it. The `done` summary lists the paired phone.
- **On the phone** (`process.env.SYMBIOT_ANDROID_APP === "1"`, see `desktop.mjs` 17): Setup starts with a "Your computer" step. "Scan the code your computer shows" pairs through task 2, and "No computer, use Symbiot on this phone" continues to the existing steps.
- Add an optional "Your phone" item to `firstSteps` (Settings' checklist), so people who already finished Setup can find it.

Existing installs that finished Setup are not sent back through it.

**Spec:** §8 (pairing flow), §5 (no manual IP setup). This is the user's onboarding decision.
**Files:** `home.mjs`, `ui.mjs`, `server.mjs` (only if a route is needed), `test/onboarding.mjs`, README (setup section), CHANGELOG.
**Done when:** `test/onboarding.mjs` covers the new step order, skipping it, and the Android variant starting at "Your computer". In `symbiot app --fresh` (`sandbox.mjs`), Setup shows the phone step with a working QR in all three looks. A config with `onboarding.done` set is not re-prompted.

### 5. Reconnect quietly after a network switch

**Task.** When the phone moves between Wi-Fi and mobile data, or the computer sleeps, `pollComputer` (`phone.mjs`) only records an error and waits 2 minutes. Make it reconnect on its own:
- On a failed poll, retry with backoff (15 s, 30 s, 1 min, then the normal 2 min).
- Try, in order: the last working URL, the computer's other addresses saved at pairing, mDNS rediscovery (task 3), and the Tailscale address if task 9 is in.
- Never drop the pairing because of a network error. Only a sealed 403 means "pair again".
- In the Android app, poll right away when the network changes (`ConnectivityManager` callback in `SymbiotService.java`) and when the window comes to the front.

**Spec:** §5 (Network transition handling), §4 (switching between Mode A and Mode B).
**Files:** `phone.mjs`, `android/src/co/symbiot/app/SymbiotService.java`, tests (inject `fetchFn` failures), README, CHANGELOG.
**Done when:** a test with a fake `fetchFn` that fails, then succeeds on a second address, ends with `config.computer.url` updated and no error. A test shows a network error never clears `config.computer`. On the phone, switching Wi-Fi off and on brings notifications back without opening Settings.

### 6. Keep a copy of the computer's state on the phone

**Task.** Add a read-only, sealed route `/phone/state` to the phone link (`phone.mjs` listener only; never the app's 127.0.0.1 API or its token). It returns a small snapshot with a version number:
- open tasks (id, text, repo, done),
- what needs you (home.mjs "needs" items, in plain words),
- agent runs waiting on an answer, with their questions,
- the Watch board's latest items.

The phone saves the latest snapshot in `~/.config/symbiot/computer.json` and shows it in its UI as "On <computer name>", clearly apart from the phone's own Symbiot tasks. Use a droplet or group in the liquid (`home.mjs` droplets, `ui.mjs` lq*), with details behind a tap. Ask with `If-None-Match` so an unchanged state costs nothing. Rename the feature from "Watch on your phone" to something like "Your phone" where it now covers more than Watch.

**Spec:** §4 (Mode A reads, Mode B reads from local storage), §2 (mobile as edge client), §3 (state on both nodes).
**Files:** `phone.mjs`, `home.mjs`, `agents.mjs` (read helpers only), `tasks.mjs` (read only), `ui.mjs`, tests, README, CHANGELOG.
**Done when:** tests show that a paired phone gets the snapshot, a stranger gets 403, and an unchanged version gets 304. The phone shows the computer's tasks and waiting questions with the computer off (from `computer.json`). The new droplet is checked in all three looks on the phone screen size.

### 7. Show when the computer is out of reach

**Task.** When polls have failed for more than one round, the phone's home shows one calm line, in the liquid and not as a pop-up. Something like "Your computer is out of reach. Showing what it sent at 14:05." Changes made meanwhile are marked "waiting to send" (task 8). It disappears on the next good poll. On the computer side, `linkState` already records when each phone last asked. Show "last seen" on the computer's phone droplet too.

**Spec:** §4 (Mode B "Mobile Mode – Processing Limited" status).
**Files:** `phone.mjs` (state fields), `home.mjs`, `ui.mjs`, tests, CHANGELOG.
**Done when:** a test of `computerState()` after failed polls reports `away: true` with the time of the last good poll. A UI check in all three looks shows the line with the computer off and hides it after reconnecting.

### 8. Queue the phone's changes and send them when the computer is back

**Task.** Let the phone make the few changes chosen in Decision 2 to the computer's state, even while the computer is away.
- Each change is appended to `~/.config/symbiot/phone-queue.json` as `{ id: <random UUID>, at, op, args }`. Allowed ops are the absolute ones only: `task.add`, `task.setDone` (not toggle; `tasks.mjs` 52 flips), `agent.answer`, plus `pending.approve` only if Decision 2 allows it.
- The phone applies each change to its cached snapshot at once, so the UI reflects it.
- When the computer is reachable, the phone sends the queue in order to a new sealed route `/phone/apply`. The computer:
  - applies each op through the existing functions (`addTask`, a new `setTaskDone`, `answerQuestions`),
  - records applied ids in `~/.config/symbiot/phone-applied.json` so a resent op is ignored,
  - resolves clashes as "the later change wins" by `at`,
  - replies with a per-op result and a fresh snapshot.
- Ops that couldn't apply (the task was deleted on the computer) are shown on the phone in plain words, not silently dropped.

Do not use a CRDT library.

**Spec:** §6 (mutation queue and reconnection protocol), §4 (Mode B writes).
**Files:** `phone.mjs`, `tasks.mjs` (`setTaskDone`), `agents.mjs` (reuse `answerQuestions`), `ui.mjs`, `home.mjs`, tests, README, CHANGELOG.
**Done when:** tests show that sending the same queue twice applies it once, ops apply in order, and a later change on the computer wins over an earlier phone change. Any op outside the allowlist (for example a route like `agentcmd`) is refused with 403 and never reaches the app API. A task added on the phone with the computer off shows up on the computer after it starts.

### 9. Reach the computer away from home through Tailscale

**Task.** Following Decision 1, make Symbiot work with Tailscale without any server of its own.
- `lanAddresses` (`phone.mjs` 36) recognises Tailscale addresses (interface `tailscale0` / `utun*` with 100.64.0.0/10) and labels them "works away from home" instead of ranking them last.
- The QR (task 2) includes them.
- The phone tries them when the LAN addresses fail (task 5).
- In Setup's phone step and in the phone droplet, if Tailscale isn't on the computer, explain in two lines what it is and that it's free for personal use, with its download link. Don't install it automatically.

**Spec:** §5 (Remote WAN reachability, P2P tunnel e.g. Tailscale).
**Files:** `phone.mjs`, `ui.mjs`, `home.mjs` (Setup text), tests (`lanAddresses` with a fake `tailscale0`), README, CHANGELOG.
**Done when:** a test shows a 100.x address on `tailscale0` is returned and labelled. With Tailscale on both devices, the phone gets notifications and the snapshot over mobile data with Wi-Fi off. Without Tailscale, nothing changes for LAN users.

### 10. Protect the stored pairing keys

**Task.** Protect the stored keys on both sides.
- **Computer:** store only a SHA-256 hash of each phone's token in `config.phoneLink.phones` (compare hashes in constant time). Then a copied `config.json` can't be used to pose as a phone. Migrate existing entries on load.
- **Android app:** wrap the phone's token and the key from task 1 with an Android Keystore key (AES/GCM, `KeyGenParameterSpec`, no user authentication). Do this in `Bootstrap.java` or a small helper, and hand the plaintext to Node only through the service's environment at start. Then the files on disk alone aren't enough.
- **Termux:** keep the 0600 file and say so in the README.

**Spec:** §7 (Secure Auth: Keystore), §8 (token storage).
**Files:** `phone.mjs`, `android/src/co/symbiot/app/Bootstrap.java`, `android/src/co/symbiot/app/SymbiotService.java`, tests, README, CHANGELOG.
**Done when:** a test shows `config.json` holds no raw phone token after pairing and old raw entries still work once, then are hashed. On the emulator, `run-as` shows no plain token in the app's files, and the app still polls after a reboot.

## Decisions for the user

### How should the phone reach the computer away from home?
Today the phone only works on the same Wi-Fi as the computer.
- Use Tailscale, a free app installed once on the computer and the phone (recommended). Symbiot runs no servers and pays nothing. Nothing passes through the company, so "nothing leaves your computer" stays true. Each user has to install and sign in to one more app.
- Run a Symbiot relay server on the internet. It works with no extra app for users. The company pays for hosting every month and must keep the server up and secure. Users' data passes through the company's machines, which changes what the README and site can promise.

### What can you do from the phone?
Today the phone can only receive notifications. Nothing on the computer can be changed from it.
- Add tasks, tick them off and answer your agents' questions. Approve stays on the computer (recommended). The phone becomes useful away from the desk, and the worst a lost phone can do is add or tick tasks until you unpair it.
- All of that plus Approve, which merges the work and can publish a release. You can ship from anywhere, but a lost or borrowed phone could release code until it's unpaired.

### Rebuild on the spec's stack, or keep the current one?
The spec suggests Electron or Tauri, React Native or Flutter, and SQLite. Symbiot uses its own Node app and JSON files.
- Keep the current stack and add the spec's features to it (recommended). The tasks above fit in weeks, users update as usual, and nothing breaks.
- Rebuild both apps on the spec's stack. It would take months with no new features meanwhile, and current users would face a migration. In return there's a more standard base for a future iPhone app.
