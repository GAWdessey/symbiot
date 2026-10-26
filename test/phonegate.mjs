// The user's phone over adb (phonegate.mjs through the membrane, guard.mjs): an app opened on it, or a tap
// on its screen, waits for the user's yes and goes through once; one run uses the phone at a time; a run
// that ends lets it go (21 Oct 2026: runs kept opening Symbiot on the phone while the user was on it).
// Isolated HOME.
//
//   node test/phonegate.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-phonegate-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const P = await import("../phonegate.mjs");
const { judge } = await import("../guard.mjs");
const lane = join(HOME, "drafts", "act-one"), other = join(HOME, "drafts", "act-two");
const sh = (command, session = "s1", cwd = lane) => judge("Bash", { command }, { session, cwd, home: HOME, branch: "x" });
const LAUNCH = "adb -s R5X shell monkey -p co.example.app -c android.intent.category.LAUNCHER 1";

try {
  console.log("WHAT TOUCHES THE PHONE — read from the command line");
  ok("adb's own housekeeping reaches no phone", ["adb devices", "adb connect 192.168.0.9:37001", "timeout 10 adb mdns services", "adb version"].every((c) => !P.adbCalls(c).some((x) => x.sub && !/^(devices|connect|mdns|version)$/.test(x.sub))));
  ok("a shell command, an install, the phone check: each is a call on the phone", P.adbCalls("adb -s R5X shell getprop ro.product.model")[0].sub === "shell" && P.adbCalls("adb install -r x.apk")[0].sub === "install" && P.adbCalls("node scripts/phone-codes-check.mjs --install")[0].sub === "check");

  console.log("READING THE PHONE — goes ahead");
  ok("devices, getprop, dumpsys, settings get: no yes needed", ["adb devices", "adb -s R5X shell getprop ro.product.model", "adb shell dumpsys package co.example.app | grep versionName", "adb shell settings get secure enabled_notification_listeners"].every((c) => sh(c) === null));

  console.log("OPENING AN APP OR ACTING ON THE SCREEN — held for the user's yes");
  const held = ["adb shell am start -n co.example.app/.Main", LAUNCH, "adb -s R5X shell input tap 500 900", "adb shell 'cmd activity start-activity -n co.example.app/.Main'", "timeout 20 adb shell input keyevent KEYCODE_HOME"].map((c) => [c, sh(c)]);
  ok("am start, monkey, input, start-activity: each refused, with a card to ask", held.every(([, r]) => r && r.held && /never done without their yes/.test(r.why) && /\{#phone-go-[0-9a-f]+\}/.test(r.why) && /🤖 Agent: go ahead, I'm at the phone/.test(r.why)), held.filter(([, r]) => !r || !r.held).map(([c]) => c));
  const r1 = sh(LAUNCH), r2 = sh(LAUNCH);
  ok("…the same command again keeps its card (one ask, not one per try)", r1.held === r2.held, [r1.held, r2.held]);
  ok("…no setting is offered for it", !/no setting allows/.test(r1.why));
  ok("an unknown hold, or one Go'd already, can't be Go'd", !P.goAhead("nope", { home: HOME }));
  ok("the user's Go lets that one command through", P.goAhead(r1.held, { home: HOME }) && sh(LAUNCH) === null);
  const again = sh(LAUNCH);
  ok("…once: running it again needs a new yes (no relaunch in a loop)", again && again.held && again.held !== r1.held, again);
  ok("…and a Go for one command doesn't open another", P.goAhead(again.held, { home: HOME }) && !!sh("adb shell am start -n co.other.app/.Main"));

  console.log("ONE RUN ON THE PHONE AT A TIME");
  const busy = sh("adb shell getprop ro.product.model", "s2", other);
  ok("another run's adb is refused while this one has the phone, saying where to hand it", busy && /only one run touches the phone at a time/.test(busy.why) && busy.why.includes(lane), busy);
  ok("…its phone check too", !!sh("node scripts/phone-codes-check.mjs --install", "s2", other));
  ok("…but adb's housekeeping isn't", sh("adb devices", "s2", other) === null);
  const hook = (ev) => spawnSync(process.execPath, [new URL("../guard.mjs", import.meta.url).pathname], { input: JSON.stringify(ev), encoding: "utf8", env: { ...process.env, HOME } });
  ok("another run's end doesn't free it", !P.letGo("s2", { home: HOME }) && !!sh("adb shell getprop x", "s2", other));
  hook({ hook_event_name: "Stop", session_id: "s1", stop_hook_active: false });
  ok("the run that has it ends: the next one may use the phone", sh("adb shell getprop ro.product.model", "s2", other) === null);
  ok("…and a while after a run last used it, it's free anyway", P.judgePhone("adb shell getprop x", { session: "s3", home: HOME, now: Date.now() + P.LOCK_MS + 1000 }) === null);

  console.log("THE CARD — the user's at once, and their Go on it lets the command through once");
  const folder = join(CFG, "drafts", "act-three"), s4 = (c) => judge("Bash", { command: c }, { session: "s4", cwd: folder, home: HOME, branch: "x" });
  mkdirSync(join(folder, ".symbiot"), { recursive: true }); P.letGo("s3", { home: HOME }); // the run before has ended
  const MONKEY = "adb shell monkey -p co.example.app 1", h4 = s4(MONKEY), Q4 = "Can I open the app on your phone now, to put the check's card up?";
  const card = `## Questions\n### ${Q4} {#phone-go-${h4.held}}\nBe at the phone, and not in the middle of something.\n- 🤖 Agent: go ahead, I'm at the phone\n`;
  ok("writing its card goes ahead", judge("Write", { file_path: join(folder, ".symbiot", "QUESTIONS.md"), content: card }, { session: "s4", cwd: folder, home: HOME }) === null);
  writeFileSync(join(folder, ".symbiot", "QUESTIONS.md"), card);
  const T = await import("../triage.mjs");
  ok("…and it's judged the user's as it's written: no wait for the AI's verdict", (T.verdictOf(folder, Q4) || {}).verdict === "user" && T.shows(folder, Q4, { judging: true, asked: Date.now() }), T.loadVerdicts(folder));
  ok("…a phone-go id that isn't a held launch is left to the AI", P.phoneAsked(folder, "### Open it? {#phone-go-deadbeef}\n", { home: HOME }) === 0);
  const A = await import("../agents.mjs");
  ok("before the user answers, it's still held", !!s4(MONKEY));
  A.answerQuestions(folder, [{ q: Q4, id: `phone-go-${h4.held}`, a: "🤖 Agent: go ahead, I'm at the phone" }]);
  ok("their Go on the card lets that command through", s4(MONKEY) === null);
  ok("…once: the next is held again, on a new card", (s4(MONKEY) || {}).held && s4(MONKEY).held !== h4.held);
  const h5 = s4("adb shell input tap 1 1"), Q5 = "Can I tap the card's switch on your phone?";
  writeFileSync(join(folder, ".symbiot", "QUESTIONS.md"), `## Questions\n### ${Q5} {#phone-go-${h5.held}}\n- 🤖 Agent: go ahead, I'm at the phone\n`);
  A.answerQuestions(folder, [{ q: Q5, id: `phone-go-${h5.held}`, a: "no, not now" }]);
  ok("a no lets nothing through", !!s4("adb shell input tap 1 1"));

  console.log("A LAUNCH INSIDE ANOTHER PROGRAM OR A SCRIPT — held too (23 Oct 2026: only adb typed on the line was seen)");
  P.letGo("s4", { home: HOME }); // (that run has ended)
  const wrapped = ["bash -c \"adb -s R5X shell am start -n co.example.app/.Main\"", "node -e \"require('child_process').execFileSync('adb', ['shell', 'am', 'start', '-n', 'co.example.app/.Main'])\"", "sh -c 'adb shell input keyevent KEYCODE_WAKEUP'"];
  ok("bash -c, node -e, sh -c around adb's am start or a key: each held for a yes", wrapped.every((c) => (P.judgePhone(c, { session: "s9", cwd: folder, home: HOME }) || {}).held), wrapped.map((c) => { const r = P.judgePhone(c, { session: "s9", cwd: folder, home: HOME }); return r && (r.held || r.why.slice(0, 60)); }));
  writeFileSync(join(folder, "open-it.mjs"), "import { execFileSync } from 'node:child_process';\nexecFileSync('adb', ['-s', 'R5X', 'shell', 'am', 'start', '-n', 'co.example.app/.Main']);\n");
  writeFileSync(join(folder, "read-it.sh"), "adb shell getprop ro.product.model\n");
  const viaScript = P.judgePhone("node open-it.mjs", { session: "s9", cwd: folder, home: HOME });
  ok("a script in the run's folder that opens an app over adb: held", (viaScript || {}).held, [viaScript, P.adbCalls("node open-it.mjs", { cwd: folder })]);
  ok("…one that only reads the phone goes ahead", P.judgePhone("bash read-it.sh", { session: "s9", cwd: folder, home: HOME }) === null);
  ok("…and words that only mention it reach no phone", P.judgePhone("echo am start", { session: "s9", cwd: folder, home: HOME }) === null && P.judgePhone("node test/phone.mjs", { session: "s9", cwd: folder, home: HOME }) === null);
  P.letGo("s9", { home: HOME });

  console.log("NOTHING SYMBIOT SHIPS OPENS AN APP ON THE PHONE BY ITSELF");
  const { readFileSync: rf } = await import("node:fs"), SRC = new URL("..", import.meta.url).pathname;
  const files = JSON.parse(rf(join(SRC, "package.json"), "utf8")).files.filter((f) => /\.m?js$/.test(f));
  const LAUNCH_IN = /["'`](?:am|monkey)["'`]\s*,\s*["'`](?:start|start-activity|-p)\b|["'`]input["'`]\s*,\s*["'`](?:tap|swipe|text|keyevent|press)["'`]|\bam\s+start\b.*\$\{|termux-open\b/;
  const sites = files.flatMap((f) => { let t = ""; try { t = rf(join(SRC, f), "utf8"); } catch { return []; } return t.split("\n").map((l, i) => [f, i + 1, l]).filter(([, , l]) => LAUNCH_IN.test(l) && !/^\s*\/\//.test(l)); });
  // the two there are: Pair a phone's push to a phone on a cable (phone.mjs adbLink, only right after the user pressed
  // it), and `symbiot app` typed in Termux opening its own window there (server.mjs openApp)
  const known = sites.filter(([f]) => f === "phone.mjs" || f === "server.mjs");
  ok("the only places that start an app on a phone: Pair a phone's push and openApp", sites.length === known.length && known.filter(([f]) => f === "phone.mjs").length === 1, sites.map(([f, n, l]) => `${f}:${n} ${l.trim().slice(0, 80)}`));
  const PH = rf(join(SRC, "phone.mjs"), "utf8"), push = PH.slice(PH.indexOf("function adbLink("), PH.indexOf("let adbTimer"));
  ok("…and the push waits for a code the user opened with Pair a phone", /!p\.usb/.test(push) && /p\.pushed\.includes\(s\)/.test(push) && !/newCode\(/.test(push), push.slice(0, 300));
  const java = ["SymbiotService", "BootReceiver", "Bootstrap", "CodeListener", "LinkKey"].map((n) => [n, rf(join(SRC, "android/src/co/symbiot/app", n + ".java"), "utf8")]);
  ok("the phone app's background parts never bring an activity up (a notification opens it only when tapped)", java.every(([, t]) => !/startActivit|setFullScreenIntent|moveTaskToFront/.test(t)), java.filter(([, t]) => /startActivit|setFullScreenIntent|moveTaskToFront/.test(t)).map(([n]) => n));
  const MA = rf(join(SRC, "android/src/co/symbiot/app/MainActivity.java"), "utf8");
  ok("an approved computer pairs again without asking, and the approval outlives the app's restart", /pairApproved/.test(MA) && /approved\(this\)\.contains\(fp\)/.test(MA) && /pendingPair\(this\)/.test(MA));

  console.log("THE GATE'S OWN FILES — never written by an agent");
  ok("the held launches and the lock can't be written from the shell, nor with Write", !!sh(`echo '{}' > ${join(CFG, "phone-lock.json")}`) && !!judge("Write", { file_path: join(CFG, "phone-holds.json"), content: "[]" }, { session: "s3", cwd: lane, home: HOME }));
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} phonegate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
