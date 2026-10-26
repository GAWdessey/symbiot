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
  ok("using it keeps it unlocked: the list says till when, UNLOCK_MS after the last use", V.vaultList({ token: s.token, now: t0 + 2000 }).unlocked === t0 + 1000 + V.UNLOCK_MS && r.until === t0 + 1000 + V.UNLOCK_MS, r.until);
  ok("…left alone that long, it locks", V.vaultValue("npm recovery codes", { token: s.token, now: t0 + 1000 + V.UNLOCK_MS + 1 }).locked === true && !V.vaultList({ token: s.token, now: t0 + 1000 + V.UNLOCK_MS + 1 }).unlocked);
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

  console.log("READABLE — names people read, each under its service, and what needs a look");
  ok("names read as words: short forms in capitals, a brand cased its own way, the email left out", V.labelOf("twilio-account-sid") === "Twilio account SID" && V.labelOf("github token") === "GitHub token" && V.labelOf("acme.io password (jane@example.com)") === "Acme.io password" && V.labelOf("npm recovery codes") === "npm recovery codes");
  ok("…Wi-Fi keeps its hyphen, and a brand's site reads as the brand", V.labelOf("Office Wi-Fi (Harbourline 5G)") === "Office Wi-Fi (Harbourline 5G)" && V.labelOf("office wifi password") === "Office Wi-Fi password" && V.labelOf("github.com password (maya@example.com)") === "GitHub.com password" && V.shortOf("GitHub.com password", "GitHub") === "Password");
  ok("each under its service: a service it names, else its first word, else Other", V.groupOf("twilio-auth-token") === "Twilio" && V.groupOf("my lemon squeezy key") === "Lemon Squeezy" && V.groupOf("acme-portal password") === "Acme" && V.groupOf("token") === "Other" && V.groupOf("password (jane@example.com)") === "Other");
  ok("…and named under it without the service's name", V.shortOf("Twilio account SID", "Twilio") === "Account SID" && V.shortOf("Token", "Other") === "Token");
  const iss = V.issuesOf([{ name: "token", count: 1, used: 0 }, { name: "github token", count: 1, used: 0 }, { name: "plan.md password", count: 1, used: 0 }, { name: "old codes", count: 2, used: 2 }], { peek: (n) => ({ values: [{ v: n === "token" || n === "github token" ? "same-value" : "v-" + n }] }) });
  ok("needs a look: a name that says nothing, a file's name, every code used, and a value saved twice (both ways)", iss.token.some((x) => x.kind === "vague") && iss["plan.md password"][0].kind === "file" && iss["old codes"][0].kind === "spent" && iss.token.some((x) => x.kind === "same" && x.other === "github token") && iss["github token"].some((x) => x.kind === "same" && x.other === "token"), iss);
  ok("…which says no value", !JSON.stringify(iss).includes("same-value"));

  console.log("KEEPING IT TIDY — add, rename and delete, unlocked only, logged without the value");
  const t3 = Date.now() + 3600000;
  ok("locked, none of them does anything", V.addEntry({ label: "x", values: ["y"], now: t3 }).locked && V.renameEntry("npm recovery codes", { label: "z", now: t3 }).locked && V.removeEntry("npm recovery codes", { now: t3 }).locked && listSecrets().length === 3);
  V.setPin(PIN, { now: t3 }); const tk = V.unlock(PIN, { now: t3 }).token;
  const ad = V.addEntry({ label: "Acme portal password", account: "jane@example.com", values: ["Tidal5Fern!"], token: tk, now: t3 + 1 });
  ok("add: saved by what it's for, with the account in brackets as agents read it", ad.ok && ad.name === "Acme portal password (jane@example.com)" && getSecret(ad.name).value === "Tidal5Fern!", ad);
  ok("…one that's there already is refused, not added to", /already one/.test(V.addEntry({ label: "acme portal password", account: "jane@example.com", values: ["other"], token: tk, now: t3 + 2 }).error || "") && listSecrets().find((x) => x.name === ad.name).count === 1);
  const rn = V.renameEntry("Example Pay test API key", { label: "Example Pay sandbox key", token: tk, now: t3 + 3 });
  ok("rename: same value and date under the new name, the old name gone", rn.ok && getSecret("Example Pay sandbox key").value === KEY && !listSecrets().some((x) => x.name === "Example Pay test API key"), rn);
  ok("…not onto a name that's taken", /already one/.test(V.renameEntry("Example Pay sandbox key", { label: "npm recovery codes", token: tk, now: t3 + 4 }).error || ""));
  const rm = V.removeEntry(ad.name, { token: tk, now: t3 + 5 });
  ok("delete: gone", rm.ok && !listSecrets().some((x) => x.name === ad.name));
  const lg2 = V.vaultLog();
  ok("each change is in the log, newest first, without its value", lg2[0].act === "delete" && lg2[1].act === "rename" && lg2[1].from === "Example Pay test API key" && lg2[2].act === "add" && !readFileSync(join(CFG, "vault-log.json"), "utf8").includes("Tidal5Fern!"), lg2.slice(0, 3));
  ok("an agent's socket reaches none of it", !(await import("../screens.mjs")).sockGate("/api/vault/add") && !(await import("../screens.mjs")).sockGate("/api/vault/delete") && !(await import("../screens.mjs")).sockGate("/api/vault/rename"));

  console.log("AGENT RUNS — can't read the PIN's file");
  const { judge } = await import("../guard.mjs");
  const g = judge("Read", { file_path: join(HOME, ".config", "symbiot", "vault-pin.json") }, { cwd: join(HOME, "repo"), home: HOME });
  ok("the guard stops a run reading it", !!(g && g.why), g);
  ok("the sandbox seals it", /\.config\/symbiot\/vault-pin\.json/.test(readFileSync(new URL("../agents.mjs", import.meta.url), "utf8").match(/const SANDBOX_SECRETS = \[[^\]]*\]/)[0]));

  console.log("THE PAGE — values hidden until shown; a copy leaves the clipboard after 30 s");
  const { EMBEDDED_UI } = await import("../ui.mjs");
  const uiJs = [...EMBEDDED_UI.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const grab = (name) => { const i = uiJs.indexOf("function " + name + "("); let depth = 0, j = uiJs.indexOf("{", i); for (; j < uiJs.length; j++) { if (uiJs[j] === "{") depth++; else if (uiJs[j] === "}" && --depth === 0) break; } return uiJs.slice(i, j + 1); };
  const grabVar = (name) => (uiJs.match(new RegExp("var " + name + "=[\\s\\S]*?;\\n")) || [""])[0];
  const fns = ["esc", "escQ", "vaultDate", "vaultHue", "vaultMono", "vaultSub", "vaultFmt", "vaultFind", "vaultField", "vaultListHtml", "vaultIssue", "vaultLast", "vaultDetailHtml", "vaultCopyLabel", "vaultLine", "vaultClipLeft", "vaultClip", "vaultUnclip"];
  const page = new Function("var agoTxt=function(){return 'just now';};" + uiJs.match(/var VLT=\{.*\n/)[0] + grabVar("VIC") + fns.map(grab).join("\n") + "\nreturn {VLT:VLT,VCLIP:VCLIP,VCLIP_MS:VCLIP_MS,vaultField:vaultField,vaultListHtml:vaultListHtml,vaultDetailHtml:vaultDetailHtml,vaultClip:vaultClip,vaultUnclip:vaultUnclip};")();
  const e = { name: "npm recovery codes", label: "npm recovery codes", group: "npm", short: "Recovery codes", kind: "Recovery codes", account: "", saved: Date.now(), count: 2, left: 1, issues: [] };
  const tw = { name: "token", label: "Token", group: "Other", short: "Token", kind: "API key or token", account: "", saved: Date.now(), count: 1, left: 1, issues: [{ kind: "vague", text: "Its name doesn't say what it's for." }, { kind: "same", other: "npm recovery codes", text: "Same value as “npm recovery codes”." }] };
  page.VLT.list = [e, tw]; page.VLT.sel = e.name;
  const hid = page.vaultField(e);
  ok("hidden: dots where the value is, Show and Copy, no value", /vhid/.test(hid) && /data-va='show'/.test(hid) && /data-va='copy'/.test(hid) && !hid.includes(C1));
  page.VLT.shown[e.name] = [{ v: C1, used: true }, { v: C2, used: false }];
  const shown = page.vaultField(e);
  ok("shown: each code, the used one struck out and last, a Copy for each unused one, and Hide", shown.includes("vcode used") && shown.indexOf(">f<") < shown.indexOf(">0<") && (shown.match(/data-va='copyone'/g) || []).length === 1 && /data-va='hide'/.test(shown));
  const lst = page.vaultListHtml([e, tw]);
  ok("the list: each service's name over its entries, the picked one marked, and a dot on one that needs a look", /class='vgh'[^>]*>npm/.test(lst) && /class='vgh'[^>]*>Other/.test(lst) && /aria-selected='true'>[^]*Recovery codes/.test(lst) && (lst.match(/class='vdot'/g) || []).length === 1 && !lst.includes(C1));
  const det = page.vaultDetailHtml(tw);
  ok("the detail says what needs a look and offers the fix: rename it, open the other, delete this one", /say what it/.test(det) && /data-va='rename'/.test(det) && /data-va='pick' data-n='npm recovery codes'/.test(det) && /Delete this one/.test(det) && /Agents ask for/.test(det));
  if (!/Agents ask for/.test(det) || !/data-va=.pick./.test(det)) console.log(det.slice(0, 1500));
  page.VLT.mode = "delete"; const del = page.vaultDetailHtml(tw); page.VLT.mode = "";
  ok("Delete asks first, in the page, and says it can be undone", /Delete “Token”\?/.test(del) && /data-va='delyes'/.test(del) && /undo/.test(del));
  page.VLT.ok[tw.name] = "c"; page.VLT.okn = tw.name; Object.assign(page.VCLIP, { v: "x", who: { name: tw.name, key: "c" }, until: Date.now() + 24000 });
  const cop = page.vaultDetailHtml(tw); page.VLT.ok = {}; page.VLT.okn = "";
  ok("Copy answers where you pressed: Copied on its button, the 30 s note in its row, and Copy name the same", /data-va='copy'[^>]*><svg[^]*?<\/svg><span class='vbl'>Copied<\/span><\/button>/.test(cop) && /class='vok' role='status'>Copied\. <span class='vsl'>It leaves the clipboard in 30 seconds\.<\/span>/.test(cop) && /data-va='copyname'[^>]*><svg[^]*?<\/svg>Copied<\/button>/.test(cop));
  const later2 = page.vaultDetailHtml(tw);
  ok("…the row's line stays after the button goes back to Copy, counting down to the wipe", /<\/svg><span class='vbl'>Copy<\/span><\/button>/.test(later2) && /id='vclipleft' aria-hidden='true'>It leaves the clipboard in 24 s\.</.test(later2));
  page.VCLIP.pend = true; const pend = page.vaultDetailHtml(tw); page.VCLIP.pend = false;
  ok("…and if the window has lost focus when time's up, it says it goes when you're back", /when you're back in this window/.test(pend));
  page.VCLIP.v = ""; page.VLT.gone = tw.name; const gone = page.vaultDetailHtml(tw); page.VLT.gone = "";
  ok("…then that it was cleared", /role='status'>Cleared from the clipboard\.</.test(gone) && !/vclipleft/.test(gone));
  ok("…counted each second, without redrawing the page", /function vaultClipWatch\(\)\{[^\n]*setInterval\([^\n]*s\.textContent=vaultClipLeft\(\)/.test(uiJs));
  page.VCLIP.who = { name: tw.name, key: "n" }; page.VCLIP.v = "token"; const nm = page.vaultDetailHtml(tw); page.VCLIP.v = ""; page.VCLIP.who = null;
  ok("…a copied name replaces the value on the clipboard, so the value's countdown goes", !/vclipleft/.test(nm));
  page.VLT.bad = { name: tw.name, key: "c", text: "Couldn't copy: this window can't use the clipboard. Press Show and select it." }; const bad = page.vaultDetailHtml(tw);
  ok("the clipboard refuses: the button says Not copied, and why goes in its row, in red", /data-va='copy'[^>]*><svg[^]*?<\/svg><span class='vbl'>Not copied<\/span><\/button>/.test(bad) && /class='vok vbad' role='alert'>Couldn&#39;t copy|class='vok vbad' role='alert'>Couldn.t copy/.test(bad));
  ok("…never in the note at the foot of the screen", !/vaultSay\([^)]*clipboard/.test(uiJs) && /function vaultCopied[^\n]*vaultBad\(/.test(uiJs) && /vaultGet[^]*?if\(!r\|\|!r\.ok\)\{vaultBad\(/.test(uiJs));
  page.VLT.bad = { name: tw.name, key: "n", text: "Couldn't copy: this window can't use the clipboard. Select the name and copy it." }; const badn = page.vaultDetailHtml(tw); page.VLT.bad = null;
  ok("…and Copy name the same, beside the name", /data-va='copyname'[^>]*><svg[^]*?<\/svg>Not copied<\/button><span class='vbadn' role='alert'>/.test(badn) && !/vok vbad/.test(badn));
  ok("after a redraw, keyboard focus goes back to the button you pressed", /if\(fk&&!fa\.isConnected\)\{var fb=[^\n]*vaultKey\(x\)===fk[^\n]*fb\.focus\(/.test(uiJs));
  ok("copy buttons are wide enough for every label, so pressing one moves nothing", /#panel-vault \.vval button\[data-va='copy'\],#panel-vault \.vcode button\{min-width:124px;padding:0 10px\}/.test(EMBEDDED_UI) && /#panel-vault \.vcode button \.vbl\{display:none\}/.test(EMBEDDED_UI));
  ok("shown codes get a column wide enough to keep each one on a line", /\.vcodes\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,300px\),1fr\)\)/.test(EMBEDDED_UI));
  ok("the red Delete button: dark text on the dark looks' light red, white on the light looks' deep red", /button\.vdanger\{background:var\(--vred\);color:#1B0B0C/.test(EMBEDDED_UI) && /body\.lq-light #panel-vault button\.vdanger\{color:#fff\}/.test(EMBEDDED_UI));
  ok("…and the unlock clears a note left from before it", /vaultClose\(\);vaultSay\(was\?/.test(uiJs));
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
  ok("leaving the page or hiding the window locks it", /if\(tab==='vault'\)\{[^}]*\}else\{if\(VLT\.del\)vaultFlush\(\);if\(VLT\.token\|\|Object\.keys\(VLT\.shown\)\.length\)vaultLockNow\(\)/.test(uiJs) && /document\.hidden&&VLT\.token\)vaultLockNow\(\)/.test(uiJs));
  // a failed reload, over a list that had loaded with the lockout box and a note up: only the error and Try again are left
  const el = (id) => ({ id, innerHTML: "", textContent: "", className: "", style: {}, classes: new Set(), classList: { add(c) { this.o.classes.add(c); }, remove(c) { this.o.classes.delete(c); }, toggle(c, on) { if (on) this.o.classes.add(c); else this.o.classes.delete(c); }, contains(c) { return this.o.classes.has(c); } }, querySelector: () => null });
  const dom = {}; for (const id of ["panel-vault", "vaultlist", "vaultdetail", "vaultlock", "vaultfilters", "vaultlogbox", "vaultmsg", "vaultsheet"]) { dom[id] = el(id); dom[id].classList.o = dom[id]; }
  const vbar = el("vbar"); vbar.classList.o = vbar; dom["panel-vault"].querySelector = (s) => (s === ".vbar" ? vbar : null);
  const draw = new Function("$", "document", "var current='vault',agoTxt=function(){return 'just now';};" + uiJs.match(/var VLT=\{.*\n/)[0] + grabVar("VIC") + ["esc", "escQ", "vaultOpen", "vaultLeft", "vaultSay", "vaultChip", "vaultClose", "vaultDraw"].map(grab).join("\n") + "\nreturn {VLT:VLT,vaultDraw:vaultDraw};")((id) => dom[id] || null, { querySelector: () => null });
  Object.assign(draw.VLT, { state: "err", list: [e, tw], wait: 300000, waitTo: Date.now() + 300000, sheet: "unlock", then: { act: "show", name: e.name } });
  dom.vaultsheet.innerHTML = "Too many wrong tries"; dom.vaultmsg.innerHTML = "<span>Copied its name.</span>";
  draw.vaultDraw();
  ok("a failed reload: the error and Try again, alone", /Couldn't open the vault/.test(dom.vaultdetail.innerHTML) && /data-va='retry'/.test(dom.vaultdetail.innerHTML) && dom.vaultlist.innerHTML === "" && dom["panel-vault"].classes.has("vsolo"));
  ok("…no search, lock chip or filters, and no log", vbar.style.display === "none" && dom.vaultfilters.innerHTML === "" && dom.vaultlogbox.style.display === "none");
  ok("…the old lockout box is closed and the old note is gone", dom.vaultsheet.classes.has("hidden") && dom.vaultsheet.innerHTML === "" && draw.VLT.sheet === "" && draw.VLT.then === null && dom.vaultmsg.innerHTML === "");
  ok("…and Try again shows it loading", /else if\(a==='retry'\)\{VLT\.state='load';vaultDraw\(\);loadVault\(\);\}/.test(uiJs));
  ok("…the page lays it out alone, on a phone too", /#panel-vault\.vsolo \.vlist\{display:none\}/.test(EMBEDDED_UI) && /#panel-vault\.vsolo \.vdetail\{display:block\}/.test(EMBEDDED_UI));
  // the error note's text against its danger colour, dark looks and the light one: AA (4.5:1)
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = (re) => ((EMBEDDED_UI.match(re) || [])[1] || "").replace(/^#fff$/i, "#FFFFFF");
  const darkBg = hex(/#panel-vault,#vaultmsg\{--vred:(#[0-9A-Fa-f]{6})/), lightBg = hex(/body\.lq-light #vaultmsg\{--vred:(#[0-9A-Fa-f]{6})/);
  const darkFg = hex(/#vaultmsg\.err\{background:var\(--vred\);color:(#[0-9A-Fa-f]{3,6})\}/), lightFg = hex(/body\.lq-light #vaultmsg\.err\{color:(#[0-9A-Fa-f]{3,6})\}/);
  ok("the error note's text is readable on its red, in the dark looks and the light one", darkFg && lightFg && ratio(darkFg, darkBg) >= 4.5 && ratio(lightFg, lightBg) >= 4.5, { darkFg, darkBg, lightFg, lightBg });
  ok("Settings links to it, and it's a page by name", /id="openvault"/.test(EMBEDDED_UI) && /vault:'Vault'/.test(uiJs) && (await import("../adapt.mjs")).SHAPES.includes("vault"));
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
