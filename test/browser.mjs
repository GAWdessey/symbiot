// The Symbiot Browser (headless.mjs openSymbiotBrowser and the hidden browser beside
// it): while a window has Symbiot's browser profile open, a background read waits
// instead of starting a second Chrome (which would hand over and pop an empty window
// into it); Done closes only visible windows, never a hidden one; and the app serves
// the Symbiot Browser's own page. Uses a real Chrome when there is one (Linux, Mac).
// Isolated HOME.
//
//   node test/browser.mjs
//
import { mkdtempSync, mkdirSync, rmSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-browser-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROFILE = join(HOME, ".config", "symbiot", "browser");
const locked = () => { try { return lstatSync(join(PROFILE, "SingletonLock")).isSymbolicLink(); } catch { return false; } }; // a link to "host-pid", not a file
const chromes = () => (spawnSync("ps", ["-eo", "args="], { encoding: "utf8" }).stdout || "").split("\n").filter((a) => a.includes("--user-data-dir=" + PROFILE) && !/--type=/.test(a));

let other = null;
try {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../browser.html", import.meta.url), "utf8");
  console.log("ITS PAGE");
  ok("titled Symbiot Browser, with an address bar, the sites and Done", /<title>Symbiot Browser<\/title>/.test(html) && /id="addr"/.test(html) && /id="list"/.test(html) && /id="done"/.test(html));
  ok("its sites come from Links, and Connect links without opening a second window", /\/api\/links/.test(html) && /here: true/.test(html));

  const { chromeBinary } = await import("../core.mjs");
  const chrome = chromeBinary();
  if (!chrome || process.platform === "win32") console.log("  (no Chrome here: the window checks need one)");
  else {
    const H = await import("../headless.mjs");
    console.log("AN AGENT'S HIDDEN BROWSER HAS THE PROFILE — background reads wait for it");
    mkdirSync(PROFILE, { recursive: true });
    // stands in for an agent's script on Symbiot's profile (the poster's hidden Chrome): not a
    // window anyone can click Done in, so it's waited for, never passed on as "click Done"
    other = spawn(chrome, ["--headless=new", "--user-data-dir=" + PROFILE, "--no-first-run", "about:blank"], { stdio: "ignore" });
    for (let i = 0; i < 50 && !locked(); i++) await sleep(200);
    ok("Chrome holds the profile", locked());
    const before = chromes().length;
    const reading = H.readPage("https://example.com");
    await sleep(2500);
    ok("…a background read waits, without starting a second Chrome", chromes().length === before, chromes().length - before);
    const done = await H.closeSymbiotBrowser();
    ok("Done closes visible windows only: the hidden one is left alone", done.closed === 0 && other.exitCode === null, done);
    other.kill("SIGKILL"); await new Promise((r) => other.once("exit", r)); other = null;
    const r = await reading;
    ok("once it lets go, the read goes ahead, and never says the Symbiot Browser is open", !(r && r.error), r && r.error);
    await H.closeBrowser();
  }
} finally {
  if (other) try { other.kill("SIGKILL"); } catch {}
  await sleep(300);
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} browser: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
