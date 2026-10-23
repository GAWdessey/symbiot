// The Vault page: what's saved is listed with no value in it; a value is given only to a page
// unlocked with the vault PIN, for a short while; wrong PINs lock it for a time; showing one
// changes nothing in the vault and is logged without the value; a copied value is wiped from
// the clipboard after 30 seconds; and agent runs can't read the PIN's file.
//
//   node test/vaultview.mjs
//
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-vaultview-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_VAULT = "file";
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const { saveSecret, getSecret, listSecrets } = await import("../vault.mjs");
const V = await import("../vaultview.mjs");
const PW = "Brisk7Otter!92", KEY = "sk_test_" + "4f9a2c7e1b".repeat(3), C1 = "0123456789abcdef".repeat(4), C2 = "fedcba9876543210".repeat(4), PIN = "harbour-41";
const files = () => readdirSync(CFG).map((f) => readFileSync(join(CFG, f), "utf8")).join("\n");

try {
  saveSecret("acme.io password (jane@example.com)", [PW]);
  saveSecret("Example Pay test API key", [KEY]);
  saveSecret("npm recovery codes", [C1, C2]);

  console.log("HIDDEN BY DEFAULT — the list has names and what's known, never a value");
  const l = V.vaultList();
  ok("every entry is listed", l.entries.length === 3, l.entries.map((e) => e.name));
  ok("no value is in the list", ![PW, KEY, C1, C2].some((v) => JSON.stringify(l).includes(v)), l);
  const pw = l.entries.find((e) => e.name.startsWith("acme"));
  ok("a password's kind, account and date", pw.kind === "Password" && pw.account === "jane@example.com" && pw.saved > 0, pw);
  ok("a key's and a set of codes' kinds, and how many codes are left", l.entries.find((e) => /API key/.test(e.name)).kind === "API key or token" && l.entries.find((e) => /npm/.test(e.name)).kind === "Recovery codes" && l.entries.find((e) => /npm/.test(e.name)).left === 2);
  ok("kinds read from names: a one-time code, an account id, anything else", V.kindOf("zoho.com code") === "One-time code" && V.kindOf("twilio-account-sid") === "Account ID" && V.kindOf("twilio-auth-token") === "API key or token" && V.kindOf("wifi") === "Secret");
  ok("locked, with no PIN set yet", l.pin === false && !l.unlocked);

  console.log("THE UNLOCK GATE — a fresh unlock with the vault PIN, for a short while");
  ok("no value without an unlock", V.vaultValue("npm recovery codes").locked === true && V.vaultValue("npm recovery codes", { token: "made-up" }).locked === true);
  ok("unlocking before a PIN is set is refused", !!V.unlock(PIN).error);
  ok("a short PIN is refused", /at least 6/.test(V.setPin("1234").error || ""));
  const t0 = Date.now(), s = V.setPin(PIN, { now: t0 });
  ok("setting a PIN unlocks the page", s.ok && typeof s.token === "string" && s.until === t0 + V.UNLOCK_MS, s);
  ok("the PIN isn't on disk, only its hash", !files().includes(PIN) && /"hash"/.test(readFileSync(join(CFG, "vault-pin.json"), "utf8")));
  const r = V.vaultValue("npm recovery codes", { token: s.token, now: t0 + 1000 });
  ok("unlocked: every value of the entry, and which are used", r.ok && r.values.map((x) => x.v).join() === [C1, C2].join() && r.values.every((x) => x.used === false), r);
  ok("showing it spends nothing and changes nothing", getSecret("npm recovery codes").value === C1 && listSecrets().find((x) => x.name === "npm recovery codes").used === 0);
  ok("the unlock runs out", V.vaultValue("npm recovery codes", { token: s.token, now: t0 + V.UNLOCK_MS + 1 }).locked === true);
  ok("…and the list says when it's unlocked till", V.vaultList({ token: s.token, now: t0 + 1000 }).unlocked === t0 + V.UNLOCK_MS && !V.vaultList({ token: s.token, now: t0 + V.UNLOCK_MS + 1 }).unlocked);
  const u = V.unlock(PIN, { now: t0 });
  ok("the right PIN unlocks again, with a new token", u.ok && u.token !== s.token);
  V.lock(u.token);
  ok("Lock now ends it at once", V.vaultValue("npm recovery codes", { token: u.token, now: t0 + 1000 }).locked === true);
  ok("changing the PIN needs the old one", /current vault PIN/.test(V.setPin("another-pin-9", { old: "wrong-pin-0", now: t0 }).error || ""));

  console.log("WRONG PINS — a few tries, then a wait");
  const t1 = t0 + 10000; let w;
  for (let i = 0; i < V.TRIES - 2; i++) w = V.unlock("not-the-pin", { now: t1 }); // the wrong old PIN above was one
  ok("a wrong PIN says how many tries are left", /1 try left/.test(w.error || ""), w);
  w = V.unlock("not-the-pin", { now: t1 });
  ok(`after ${V.TRIES} wrong tries in a row, it waits`, w.wait === V.LOCKOUT_MS && /Too many/.test(w.error), w);
  ok("…even the right PIN, until the wait is over", !!V.unlock(PIN, { now: t1 + 1000 }).error && V.vaultList({ now: t1 + 1000 }).wait > 0);
  ok("…and after it, the right PIN works", V.unlock(PIN, { now: t1 + V.LOCKOUT_MS + 1 }).ok);

  console.log("THE LOG — each show and copy, on this computer, never the value");
  const t2 = t1 + V.LOCKOUT_MS + 2, k = V.unlock(PIN, { now: t2 });
  V.vaultValue("Example Pay test API key", { token: k.token, act: "copy", now: t2 + 1 });
  const log = V.vaultLog();
  ok("shows and copies are logged, newest first", log.length === 2 && log[0].act === "copy" && log[0].name === "Example Pay test API key" && log[1].act === "reveal", log);
  ok("no value in the log or any other file but the vault's own", ![PW, KEY, C1, C2].some((v) => readFileSync(join(CFG, "vault-log.json"), "utf8").includes(v)) && !readdirSync(CFG).filter((f) => !/^vault\.(json|key)$/.test(f)).some((f) => [PW, KEY, C1, C2].some((v) => readFileSync(join(CFG, f), "utf8").includes(v))));
  const rp = V.resetPin();
  ok("a forgotten PIN is cleared from a terminal: the page asks for a new one, the vault is untouched", rp.ok && rp.had && V.vaultList().pin === false && V.vaultValue("npm recovery codes", { token: k.token, now: t2 + 2 }).locked === true && listSecrets().length === 3);

  console.log("AGENT RUNS — can't read the PIN's file");
  const { judge } = await import("../guard.mjs");
  const g = judge("Read", { file_path: join(HOME, ".config", "symbiot", "vault-pin.json") }, { cwd: join(HOME, "repo"), home: HOME });
  ok("the guard stops a run reading it", !!(g && g.why), g);
  ok("the sandbox seals it", /\.config\/symbiot\/vault-pin\.json/.test(readFileSync(new URL("../agents.mjs", import.meta.url), "utf8").match(/const SANDBOX_SECRETS = \[[^\]]*\]/)[0]));

  console.log("THE PAGE — values hidden until shown; a copy leaves the clipboard after 30 s");
  const { EMBEDDED_UI } = await import("../ui.mjs");
  const uiJs = [...EMBEDDED_UI.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const grab = (name) => { const i = uiJs.indexOf("function " + name + "("); let depth = 0, j = uiJs.indexOf("{", i); for (; j < uiJs.length; j++) { if (uiJs[j] === "{") depth++; else if (uiJs[j] === "}" && --depth === 0) break; } return uiJs.slice(i, j + 1); };
  const page = new Function(uiJs.match(/var VLT=\{.*\n/)[0] + ["esc", "escQ", "vaultDate", "vaultRow", "vaultClip", "vaultUnclip"].map(grab).join("\n") + "\nreturn {VLT:VLT,VCLIP:VCLIP,VCLIP_MS:VCLIP_MS,vaultRow:vaultRow,vaultClip:vaultClip,vaultUnclip:vaultUnclip};")();
  const e = { name: "npm recovery codes", kind: "Recovery codes", account: "", saved: Date.now(), count: 2, left: 2 };
  const hid = page.vaultRow(e);
  ok("a row shows its name and kind, and dots where the value is", /npm recovery codes/.test(hid) && /Recovery codes/.test(hid) && /vhid/.test(hid) && />Show</.test(hid) && !hid.includes(C1));
  page.VLT.shown[e.name] = [{ v: C1, used: true }, { v: C2, used: false }];
  const shown = page.vaultRow(e);
  ok("shown: its values, which one is used, a copy for each, and Hide", shown.includes(C1) && shown.includes(C2) && /vused/.test(shown) && (shown.match(/class='ghost vone'/g) || []).length === 2 && />Hide</.test(shown));
  ok("the page waits 30 seconds", page.VCLIP_MS === 30000);
  const board = { text: "", focused: true, writeText(t) { if (!this.focused) return Promise.reject(new Error("Document is not focused")); this.text = t; return Promise.resolve(); } };
  const timers = []; const later = (f, ms) => { timers.push({ f, ms, live: true }); return timers.length; }, stop = (id) => { if (timers[id - 1]) timers[id - 1].live = false; };
  ok("Copy puts the value on the clipboard", (await page.vaultClip(KEY, { clip: board, later, stop })) === true && board.text === KEY);
  ok("…and sets it to be wiped after 30 s", timers.length === 1 && timers[0].ms === 30000);
  timers[0].f(); await new Promise((r) => setTimeout(r, 0));
  ok("30 s later the clipboard is empty", board.text === "" && page.VCLIP.v === "");
  await page.vaultClip(PW, { clip: board, later, stop }); await page.vaultClip(KEY, { clip: board, later, stop });
  ok("a second copy replaces the first one's timer", timers[1].live === false && timers[2].live === true && board.text === KEY);
  board.focused = false; timers[2].f(); await new Promise((r) => setTimeout(r, 0));
  ok("not focused when the time's up: it waits to wipe it", board.text === KEY && page.VCLIP.pend === true);
  board.focused = true; await page.vaultUnclip(board);
  ok("…and wipes it once the window has focus again", board.text === "" && page.VCLIP.pend === false);
  ok("…the page does that on focus", /addEventListener\('focus',function\(\)\{if\(VCLIP\.pend/.test(uiJs));
  ok("no clipboard: Copy says so instead of pretending", (await page.vaultClip(KEY, { clip: {}, later, stop })) === false);
  ok("leaving the page or hiding the window locks it", /if\(tab==='vault'\)\{[^}]*\}else if\(VLT\.token\|\|Object\.keys\(VLT\.shown\)\.length\)vaultLockNow\(\)/.test(uiJs) && /document\.hidden&&VLT\.token\)vaultLockNow\(\)/.test(uiJs));
  ok("Settings links to it, and it's a page by name", /id="openvault"/.test(EMBEDDED_UI) && /vault:'Vault'/.test(uiJs) && (await import("../adapt.mjs")).SHAPES.includes("vault"));
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
