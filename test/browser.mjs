// The Symbiot Browser (headless.mjs openSymbiotBrowser and the hidden browser beside
// it): while a window has Symbiot's browser profile open, a background read waits
// instead of starting a second Chrome (which would hand over and pop an empty window
// into it); Done closes its windows (with ps cut to 80 columns too), never a hidden one;
// closing it by its X tells the app, which checks the sites as Done does; another
// Symbiot's hidden browser isn't taken for a window, and is closed if it stays; and the
// app serves the Symbiot Browser's own page. Uses a real Chrome when there is one (Linux,
// Mac): a window stands in as a Chrome with no screen (--ozone-platform=headless), which
// is a whole browser, not a --headless one. Isolated HOME.
//
//   node test/browser.mjs
//
import { mkdtempSync, mkdirSync, rmSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-browser-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_STRAY_WAIT = "1500";
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROFILE = join(HOME, ".config", "symbiot", "browser");
const locked = () => { try { return lstatSync(join(PROFILE, "SingletonLock")).isSymbolicLink(); } catch { return false; } }; // a link to "host-pid", not a file
const chromes = () => (spawnSync("ps", ["-ww", "-eo", "args="], { encoding: "utf8" }).stdout || "").split("\n").filter((a) => a.includes("--user-data-dir=" + PROFILE) && !/--type=/.test(a));

let other = null;
try {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../browser.html", import.meta.url), "utf8");
  console.log("ITS PAGE");
  ok("titled Symbiot Browser, with an address bar, the sites and Done", /<title>Symbiot Browser<\/title>/.test(html) && /id="addr"/.test(html) && /id="list"/.test(html) && /id="done"/.test(html));
  ok("its sites come from Links, and Connect links without opening a second window", /\/api\/links/.test(html) && /here: true/.test(html));
  ok("Done: says so at once, can't be pressed again meanwhile, and closes the window itself if Symbiot didn't", /doneBtn\.disabled = true/.test(html) && /if \(DONE\) return/.test(html) && /window\.close\(\)/.test(html) && /\/api\/browser\/done/.test(html));
  ok("Done: a Symbiot that isn't answering is said so, and Done can be pressed again", /isn't answering, so it couldn't close this/.test(html) && /DONE = false; doneBtn\.disabled = false/.test(html));
  ok("its X: Symbiot hears it as the page goes (unless Done did it), and a reload isn't taken for it", /addEventListener\("pagehide"/.test(html) && /sendBeacon\("\/api\/browser\/closed\?t="/.test(html) && /!DONE && navigator\.sendBeacon/.test(html) && /\/api\/links\?hub=1/.test(html));

  const { chromeBinary } = await import("../core.mjs");
  const chrome = chromeBinary();
  if (!chrome || process.platform === "win32") console.log("  (no Chrome here: the window checks need one)");
  else {
    const H = await import("../headless.mjs");
    mkdirSync(PROFILE, { recursive: true });
    const gone = (p) => new Promise((r) => { if (p.exitCode !== null || p.signalCode) r(); else p.once("exit", r); });
    const window = () => spawn(chrome, ["--ozone-platform=headless", "--user-data-dir=" + PROFILE, "--no-first-run", "--password-store=basic", "about:blank"], { stdio: "ignore" });
    const hidden = () => spawn(chrome, ["--headless=new", "--user-data-dir=" + PROFILE, "--no-first-run", "about:blank"], { stdio: "ignore" });
    const up = async (p) => { for (let i = 0; i < 50 && !(locked() && H.lockHolder() && H.lockHolder().pid === p.pid); i++) await sleep(200); return locked(); };
    // a page of its own to read, so a read really starts the hidden browser
    const { createServer } = await import("node:http");
    const site = createServer((q, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(q.url === "/signup" ? "<title>Create an account</title><h1>Create an account</h1><p>Already have an account? <a href='/'>Log in here</a></p><button>Google</button><button>GitHub</button><input type=email placeholder='you@email.com'>" : q.url === "/team" ? "<title>Deepgram</title><h1>Projects</h1><h2>Create an account for a teammate</h2><button>Invite</button>" : q.url === "/out" ? "<title>Reddit</title><header><a href='/'>reddit</a><button>Log In</button></header><p>Hot posts</p>" : q.url === "/in" ? "<title>Reddit</title><header><a href='/'>reddit</a><button>Create</button><a href='/u/me'>u/garth</a></header><p>Log in to see more? Not here.</p>" : "<title>here</title><p>here</p>"); });
    await new Promise((r) => site.listen(0, "127.0.0.1", r));
    const PAGE = `http://127.0.0.1:${site.address().port}/`;

    console.log("A WINDOW HAS THE PROFILE — background reads wait");
    other = window();
    ok("Chrome holds the profile", await up(other));
    ok("…and it's taken for a window", H.windowOpen() && H.lockHolder() && H.lockHolder().headless === false, H.lockHolder());
    const before = chromes().length;
    const r = await H.readPage("https://example.com");
    ok("a background read says the Symbiot Browser is open, and waits", /Symbiot Browser is open/.test((r && r.error) || ""), r);
    await sleep(500);
    ok("…without starting a second Chrome", chromes().length === before, chromes().length - before);

    console.log("DONE — it closes, whatever ps's width");
    const cols = process.env.COLUMNS; process.env.COLUMNS = "80"; // an app started from a terminal: ps cut each line at 80, and Done found nothing
    const done = await H.closeSymbiotBrowser();
    if (cols === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = cols;
    await Promise.race([gone(other), sleep(3000)]);
    ok("Done closes the window", done.closed >= 1 && (other.exitCode !== null || !!other.signalCode), done);
    ok("…and the profile is free", !H.windowOpen() && !H.lockHolder(), H.lockHolder());
    other = null;
    const r2 = await H.readPage(PAGE);
    ok("once it's closed, a background read runs again", r2 && !r2.error && r2.title === "here", r2);
    console.log("SIGNED IN OR NOT — a page with just a Log In button is signed out (reddit has no password box)");
    const out = await H.readPage(PAGE + "out", { password: true }), inn = await H.readPage(PAGE + "in", { password: true });
    ok("Reddit signed out: its Log In button says so", out && out.login === true, out);
    ok("Reddit signed in: no Log In button, so signed in (words on the page don't count)", inn && !inn.error && inn.login === false, inn);
    const signup = await H.readPage(PAGE + "signup", { password: true }), team = await H.readPage(PAGE + "team", { password: true });
    ok("Deepgram signed out shows 'Create an account' at its own address: a sign-up page is signed out (2026-10-14)", signup && signup.login === true, signup);
    ok("…but a signed-in page that offers to create one further down isn't", team && !team.error && team.login === false, team);
    await H.closeBrowser();

    console.log("ITS X — closing it tells Symbiot, which checks the sites as Done does");
    let told = 0; H.onBrowserClosed(() => { told++; });
    other = window();
    await up(other);
    H.watchWindow({ every: 150, start: 5000 });
    await sleep(600);
    ok("not while it's open", told === 0, told);
    other.kill("SIGTERM"); await gone(other); other = null; // as its last window's X ends it
    for (let i = 0; i < 30 && !told; i++) await sleep(100);
    await sleep(400);
    ok("once it's closed, Symbiot is told, once", told === 1, told);
    H.watchWindow({ every: 100, start: 300 }); await sleep(700);
    ok("a window that never came up tells nothing", told === 1, told);
    H.onBrowserClosed(null);

    console.log("SIGN IN WITH AN AGENT'S READ WAITING — the window opens, not handed to a hidden copy");
    // A card's "Sign in to twilio.com" did nothing (16 Oct; the same since the 12th): it let go of
    // the one-at-a-time queue before its window had the profile, an agent's read waiting behind it
    // started the hidden browser in the gap, and Chrome handed the window to that, out of sight.
    process.env.SYMBIOT_BROWSER_ARGS = "--ozone-platform=headless"; // a window, with no screen
    const opening = H.openSymbiotBrowser(PAGE), waiting = H.readPage(PAGE);
    const o = await opening, w = await waiting;
    const shown = () => chromes().filter((a) => !/--headless/.test(a)).length;
    ok("Sign in opens a window that has the profile", o && o.ok && H.windowOpen() && shown() >= 1, [o, H.lockHolder(), chromes().length]);
    ok("…and the read behind it waits for Done instead of taking the profile", /Symbiot Browser is open/.test((w && w.error) || ""), w);
    await H.closeSymbiotBrowser();
    ok("…and Done closes it", !H.windowOpen(), H.lockHolder());
    other = hidden(); await up(other); // a lane's own `symbiot screens` (another Symbiot) has the profile
    const o2 = await H.openSymbiotBrowser(PAGE);
    await Promise.race([gone(other), sleep(3000)]);
    ok("another Symbiot's hidden browser on the profile is closed, and the window still opens", o2 && o2.ok && H.windowOpen() && (other.exitCode !== null || !!other.signalCode), [o2, H.lockHolder()]);
    other = null;
    await H.closeSymbiotBrowser();
    delete process.env.SYMBIOT_BROWSER_ARGS;

    console.log("ANOTHER SYMBIOT'S HIDDEN BROWSER — not a window, and it doesn't block");
    other = hidden();
    await up(other);
    ok("a hidden Chrome isn't taken for a window", H.lockHolder() && H.lockHolder().headless === true && !H.windowOpen(), H.lockHolder());
    const done2 = await H.closeSymbiotBrowser({ wait: 500 });
    ok("Done closes visible windows only: the hidden one is left alone", done2.closed === 0 && other.exitCode === null, done2);
    const r3 = await H.readPage(PAGE);
    await Promise.race([gone(other), sleep(3000)]);
    ok("one still there after a moment is a stray: closed, and the read goes ahead", r3 && !r3.error && r3.title === "here" && (other.exitCode !== null || !!other.signalCode), [r3, other.exitCode]);
    other = null;
    site.close();
    await H.closeBrowser();
  }
  console.log("AN AGENT'S STEP JUST RAN — a watcher read leaves the page alone");
  const H = await import("../headless.mjs");
  H.noteAgentUse();
  ok("…a watcher read backs off, though the browser has closed", !H.browserOpen() && (await H.readPage("https://example.com")).busy === true);
  ok("…and so do the text and LinkedIn reads", (await H.readTexts("https://example.com", "p")).busy === true && (await H.readLinkedIn("messages")).busy === true);
  H.noteAgentUse(Date.now() - H.WATCH_GRACE - 1000);
  ok("…until the grace window has passed", !H.watcherBusy());
} finally {
  if (other) try { other.kill("SIGKILL"); } catch {}
  await sleep(300);
  rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
console.log(`\n${fail ? "✗" : "✓"} browser: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
