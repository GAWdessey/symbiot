// Sites that refuse this computer's connection itself (lineblocks.mjs): a block page that names
// its address or calls it a proxy is recorded for its site, and a card's step there becomes the
// user's phone on mobile data, never their Chrome here or the Symbiot Browser. Settings →
// Connections checks the line against two proxy lists, only when asked.
//
//   node test/lineblocks.mjs
//
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const HOME = mkdtempSync(join(tmpdir(), "symbiot-lineblocks-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const L = await import("../lineblocks.mjs");
const B = await import("../browserfails.mjs");
const { signInAsked } = await import("../links.mjs");
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
try {
  console.log("A BLOCK PAGE — the connection refused, not the person");
  const page = "Blocked - Insecure Proxy Connection. Access to this site from an insecure proxy is not allowed. Your IP address: 203.0.113.45. If you believe this is a mistake, request a review.";
  const b = L.lineBlock(page);
  ok("a registrar's 403 page that calls this computer a proxy is one, with the address it names", b && /proxy/.test(b.why) && b.ip === "203.0.113.45", b);
  ok("…a VPN block too", /VPN/.test((L.lineBlock("We detected that you are using a VPN. VPN connections are not allowed on this site.") || {}).why || ""));
  ok("…and a page that names your address and refuses it", /address/.test((L.lineBlock("Access denied. Your IP address is 198.51.100.7 and has been blocked.") || {}).why || ""));
  ok("an ordinary page isn't: a sign-in, an article about proxies, a long page", L.lineBlock("Sign in to your account. Email. Password. Forgot your password?") === null && L.lineBlock("How to set up a proxy server for your office network. A proxy sits between you and the internet.") === null && L.lineBlock("blocked by proxy " + "x".repeat(3000)) === null && L.lineBlock("") === null);

  console.log("RECORDED — and named in cards and briefs");
  const e = L.noteBlocked("www.clientzone.example.net", b, { review: "https://clientzone.example.net/ip-reputation/review", at: "2026-10-26" });
  ok("the site is recorded without www, with why, the address and its review form", e.host === "clientzone.example.net" && e.ip === "203.0.113.45" && /review/.test(e.review) && L.blockedSites().length === 1);
  L.noteBlocked("clientzone.example.net", b, { at: "2026-10-27" });
  ok("…once per site", L.blockedSites().length === 1 && L.blockedSites()[0].at === "2026-10-27");
  L.noteBlocked("clientzone.example.net", b, { review: "https://clientzone.example.net/ip-reputation/review", at: "2026-10-26" });
  const opt = "👤 You (only you: your registrar password): in your own Chrome (its \"Work\" profile, pat@example.com), at clientzone.example.net/domains → Nameservers, set ns1.example.com and ns2.example.com (recommended)";
  const step = B.ownChromeStep(opt);
  ok("a card's step there becomes the phone on mobile data, with why and the review form", /on your phone, on mobile data \(not Wi-Fi\)/.test(step) && !/own Chrome/.test(step) && /refuses this computer's connection/.test(step) && /ip-reputation\/review/.test(step) && /\(recommended\)$/.test(step), step);
  ok("…the same when it said the Symbiot Browser", /mobile data/.test(B.ownChromeStep("👤 You: sign in at clientzone.example.net in the Symbiot Browser (Settings → Connections → Add a site), then click Done")));
  ok("…and in a question's options", /mobile data/.test(B.apiOptions([opt])[0]));
  ok("…once only, however often it's reworded", (B.ownChromeStep(step).match(/mobile data/g) || []).length === 1);
  ok("a step on another site is left as it was", B.ownChromeStep("👤 You: in your own Chrome, at www.domains.example.org → DNS, add the record") === "👤 You: in your own Chrome, at www.domains.example.org → DNS, add the record");
  ok("no Sign in button for it", signInAsked("Sign in to clientzone.example.net to switch the nameservers") === null && signInAsked(step) === null && !!signInAsked("Sign in to www.domains.example.org/client/dashboard"));
  ok("every brief names it, and says to use its API or the phone, not retry it here", B.browserBrief(false, []).some((l) => /clientzone\.example\.net \(since 2026-10-26; review form/.test(l) && /mobile data/.test(l) && /Don't retry/.test(l)));
  ok("Screens checks every page it reads, records the site and tells the agent", /const block = await lineBlocked\(page, info\)/.test(src("headless.mjs")) && /noteBlocked\(host, b, \{ review: v\.review \}\)/.test(src("headless.mjs")) && /if \(info\.block\) return \{ \.\.\.s, note: info\.block\.note/.test(src("headless.mjs")));
  ok("Forget takes it off", L.forgetBlocked("clientzone.example.net").ok === true && L.blockedSites().length === 0);
  ok("…and then nothing is reworded or briefed", B.ownChromeStep(opt) === opt && !B.browserBrief(false, []).some((l) => /refuse this computer's internet connection/.test(l)));

  console.log("THE LINE CHECK — this computer's address against two proxy lists, when asked");
  const asked = [];
  const get = async (url) => { asked.push(url); if (/ipify/.test(url)) return { ip: "203.0.113.45" }; if (/ip-api/.test(url)) return { status: "success", proxy: true, hosting: false, mobile: false }; if (/proxycheck/.test(url)) return { status: "ok", "203.0.113.45": { proxy: "no", type: "Residential" } }; return null; };
  const r = await L.checkLine({ get, now: 1761465600000 });
  ok("it finds the address, then asks both lists about it", r.ip === "203.0.113.45" && asked.length === 3 && asked.some((u) => /ip-api\.com\/json\/203\.0\.113\.45/.test(u)) && asked.some((u) => /proxycheck\.io\/v2\/203\.0\.113\.45/.test(u)));
  ok("…and says what each says: one lists it as a proxy, one calls it a home connection", r.listed === true && r.lists[0].proxy === true && r.lists[0].kind === "a proxy" && r.lists[1].proxy === false && r.lists[1].kind === "a home connection", r.lists);
  ok("…kept for Settings", L.lineState().line.ip === "203.0.113.45");
  const r2 = await L.checkLine({ get: async (u) => (/ipify/.test(u) ? { ip: "203.0.113.45" } : null) });
  ok("a list that doesn't answer says so; it isn't counted as listed", r2.listed === false && r2.lists.every((x) => x.error === "didn't answer"));
  ok("no address, a plain error", /Couldn't find this computer's internet address/.test((await L.checkLine({ get: async () => null })).error));
  process.env.SYMBIOT_NO_NET = "1";
  ok("switched off where nothing may go out (the smoke test presses every button)", /switched off/.test((await L.checkLine({ get })).error));
  delete process.env.SYMBIOT_NO_NET;
  ok("the smoke test switches it off", /SYMBIOT_NO_NET: "1"/.test(src("test/smoke.mjs")) && /\["\/api\/line\/check", "POST"\]/.test(src("test/smoke.mjs")));
  const { EMBEDDED_UI } = await import("../ui.mjs");
  ok("Settings → Connections has the check, says which lists it asks, and lists the refused sites with Forget", /id="linecheck"/.test(EMBEDDED_UI) && /ip-api\.com and proxycheck\.io/.test(EMBEDDED_UI) && /lineforget/.test(EMBEDDED_UI) && /loadLinks\(\);loadLine\(\);/.test(EMBEDDED_UI));
  ok("it ships", JSON.parse(src("package.json")).files.includes("lineblocks.mjs"));
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
