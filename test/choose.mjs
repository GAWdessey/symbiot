// Screens' Choose: an option in a menu, on a real page in a real (headless) browser. A
// native <select> (domains.co.za's DNS record type, where Press only opened it) and a
// menu of the site's own making (role=combobox), and what depends on them updating (MX
// turns the Priority box on). Needs a Chromium-family browser (CI has Chrome); without
// one it says so and passes.
//
//   node test/choose.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-choose-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };

const { chromeBinary } = await import("../core.mjs");
const h = await import("../headless.mjs");
console.log("CHOOSE — an option in a menu: a <select>, and a site's own");
// the DNS form: its title says what's chosen, and whether Priority is on (only for MX)
const page = `<!doctype html><title>start</title><body style="margin:0;font:16px sans-serif">
<form style="padding:20px"><label>Type <select id="t"><option>A</option><option>AAAA</option><option>CNAME</option><option value="MX">MX (mail)</option><option>TXT</option><option>TXT2</option></select></label>
<input id="prio" placeholder="Priority" disabled> <input id="host" placeholder="Host">
<button type="button" id="ttl" role="combobox" aria-label="TTL" aria-expanded="false">1 hour</button>
<ul id="lb" role="listbox" style="display:none;list-style:none;padding:0"><li role="option" style="padding:6px">1 hour</li><li role="option" style="padding:6px">1 day</li><li role="option" style="padding:6px">1 week</li></ul></form>
<script>
const t = document.getElementById("t"), p = document.getElementById("prio"), ttl = document.getElementById("ttl"), lb = document.getElementById("lb");
const say = () => { document.title = "type=" + t.value + " prio=" + (p.disabled ? "off" : "on") + " ttl=" + ttl.textContent; };
t.addEventListener("change", () => { p.disabled = t.value !== "MX"; say(); });
ttl.addEventListener("click", () => { lb.style.display = "block"; ttl.setAttribute("aria-expanded", "true"); });
lb.addEventListener("click", (e) => { const o = e.target.closest("[role=option]"); if (!o) return; ttl.textContent = o.textContent; lb.style.display = "none"; say(); });
</script></body>`;
if (!chromeBinary()) console.log("  - no Chrome here: skipped");
else {
  const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(page); }).listen(0, "127.0.0.1");
  await new Promise((r) => srv.on("listening", r));
  try {
    const s = await h.mapPage("127.0.0.1:" + srv.address().port + "/dns", "DNS");
    const rs = (s && s.regions) || [], type = rs.find((r) => r.kind === "menu" && /MX/.test(r.label)), ttl = rs.find((r) => r.kind === "menu" && /TTL|1 hour/.test(r.label)), host = rs.find((r) => r.kind === "field" && /Host/.test(r.label));
    ok("the map has both menus (the <select>, the combobox)", type && ttl && host, rs.map((r) => r.kind + ":" + r.label));
    const mx = await h.chooseRegion(s.id, type.id, "MX", { confirmed: true });
    ok("Choose MX in the <select>: chosen, and the page told: Priority is on, and the map is of the page after", mx && !mx.error && mx.chose === "MX (mail)" && mx.value === "MX" && /type=MX prio=on/.test(mx.name || ""), mx && { error: mx.error, chose: mx.chose, name: mx.name });
    const txt = await h.chooseRegion(s.id, type.id, "txt", { confirmed: true });
    ok("…by its label, any case, exactly when one matches (TXT, not TXT2); Priority goes off again", txt && txt.chose === "TXT" && /type=TXT prio=off/.test(txt.name || ""), txt && { error: txt.error, chose: txt.chose, name: txt.name });
    const none = await h.chooseRegion(s.id, type.id, "SPF", { confirmed: true });
    ok("no such option: says so, with the options there are", /has no option "SPF"/.test((none && none.error) || "") && /"CNAME"/.test(none.error) && /"MX \(mail\)"/.test(none.error), none);
    const two = await h.chooseRegion(s.id, type.id, "TX", { confirmed: true }); // TXT and TXT2
    ok("…and more than one that fits: says so, chooses nothing", /More than one option/.test((two && two.error) || ""), two);
    const day = await h.chooseRegion(s.id, ttl.id, "1 day", { confirmed: true });
    ok("the site's own menu (role=combobox): opened, and its option clicked", day && !day.error && day.chose === "1 day" && /ttl=1 day/.test(day.name || ""), day && { error: day.error, chose: day.chose, name: day.name });
    ok("not a menu, or no option given: refused before a browser starts", /isn't a menu/.test((await h.chooseRegion(s.id, host.id, "x", { confirmed: true })).error || "") && /Give the option/.test((await h.chooseRegion(s.id, type.id, "", { confirmed: true })).error || ""), "");
    ok("Type on a menu says to Choose instead (it said only \"isn't a field\")", /pick its option with Choose/.test((await h.typeRegion(s.id, type.id, "MX", { confirmed: true })).error || ""), "");
    const ask = await h.chooseRegion(s.id, type.id, "MX");
    ok("off your trusted sites, it asks first, like Press and Type", ask && ask.confirm && /Choosing in/.test(ask.error || ""), ask);
  } finally { srv.close(); await h.closeBrowser(); }
}
rmSync(HOME, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log((fail ? "✗" : "✓") + " choose: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
