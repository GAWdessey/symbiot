// The chat open over Home, at desktop width, in a real (headless) browser with the app's
// own stylesheet: a Needs-you card is solid and on top (the chat never shows through it),
// the chat stops above the Needs-you band, and the lane labels (a run line, GitHub,
// Archive) aren't drawn between its messages. Garth's screenshot of 28 Oct 2026 had all
// three. Canned markup only: it never touches the running app.
// Needs a Chromium-family browser (CI has Chrome); without one it says so and passes.
//
//   node test/chatover.mjs
//
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 600) : "")); } };

const STYLE = (await import("../ui/style.mjs")).default; // its </style> opens markup.mjs
const { chromeBinary } = await import("../core.mjs");
console.log("CHAT OVER HOME — a card is solid and on top, lane labels step away, the chat stops above the band");

// the band as lqNeeds lays it: a blob's top at LQ_NEEDY (128), the band's bottom 128 + its height + 20
const needb = (cardH) => 128 + cardH + 20;
const msgs = Array.from({ length: 14 }, (_, i) => `<div class='lqmsg${i % 2 ? " me" : ""}'>Message ${i + 1}: sent to the lane, saved in its ANSWERS.md, its agent is checking and carrying on.</div>`).join("");
const page = (light, cardH) => `<!doctype html><html><head>${STYLE}</style></head><body class="lq-liquid lq-look-ferro lq-chat lq-talking${light ? " lq-light" : ""}" style="--lqneedb:${needb(cardH)}px;--lqfh:56px;margin:0">
<div id="liquid"><div id="lqdrops">
<div class="lqd lq-you lqblob" id="card" style="transform:translate(560px,124px);height:${cardH}px"><button type="button" class="lt"><span>a lane</span><i>open &rsaquo;</i></button><div class="bq">Do you approve the opt-out wording I drafted?</div><div class="bo"><button type="button" class="nopt rec"><span class="bt">I've approved the wording</span></button></div></div>
<div class="lqd lq-run lq-band" id="lane" style="transform:translate(420px,660px)"><button type="button" class="lt"><span>Marketing</span><span class="lm">meanwhile, I'm recording the Facebook result</span></button></div>
</div>
<div id="lqtalk" class="back">${msgs}</div><div id="lqtalkbar"><span class="lqtb-t">Chat with Symbiot</span></div></div>
<pre id="out"></pre>
<script>
var c=document.getElementById('card'),t=document.getElementById('lqtalk'),l=document.getElementById('lane');t.scrollTop=t.scrollHeight;
var cr=c.getBoundingClientRect(),tr=t.getBoundingClientRect(),cs=getComputedStyle(c),ls=getComputedStyle(l);
var mid=document.elementFromPoint(cr.left+cr.width/2,cr.top+cr.height/2);
var low=document.elementFromPoint(cr.left+cr.width/2,Math.min(cr.bottom-4,tr.top+20));
document.getElementById('out').textContent=JSON.stringify({opacity:cs.opacity,bg:cs.backgroundColor,onTop:!!(mid&&c.contains(mid)),onTopLow:!!(low&&c.contains(low)),chatTop:Math.round(tr.top),cardBottom:Math.round(cr.bottom),vh:innerHeight,chatH:Math.round(tr.height),lane:ls.visibility+'/'+ls.opacity});
</script></body></html>`;

const bin = chromeBinary();
if (!bin) console.log("  - no Chrome here: skipped");
else {
  const dir = mkdtempSync(join(tmpdir(), "symbiot-chatover-"));
  try {
    run: for (const [light, cardH] of [[false, 220], [true, 220], [false, 470]]) {
      const f = join(dir, (light ? "light" : "dark") + cardH + ".html");
      writeFileSync(f, page(light, cardH));
      let dom = "";
      try { dom = execFileSync(bin, ["--headless=new", "--no-sandbox", "--disable-gpu", "--user-data-dir=" + join(dir, "prof"), "--window-size=1440,900", "--dump-dom", "file://" + f], { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"] }); }
      catch (e) { dom = String((e && e.stdout) || ""); }
      const m = /<pre id="out">([^<]*)<\/pre>/.exec(dom);
      if (!m || !m[1]) { console.log("  - the browser can't start here: skipped"); break run; }
      const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      const look = (light ? "light" : "dark") + ", a " + cardH + "px card";
      ok(look + ": the card isn't see-through (opacity 1, a solid background)", r.opacity === "1" && /^rgb\(/.test(r.bg), r);
      ok(look + ": the card is drawn over the chat, not under it", r.onTop && r.onTopLow, r);
      // the chat's bottom is 64 + the input's 56 up; above it, what's left under the band (less 12), or 230 if that's less
      const room = r.vh - 120 - needb(cardH) - 12;
      if (room >= 230) ok(look + ": the chat stops above the Needs-you band", r.chatTop >= needb(cardH) && r.chatH > 200, r);
      else ok(look + ": too tall a card still leaves the chat room to read in", r.chatH >= 230, r);
      ok(look + ": the card ends above the chat (a tall one scrolls in itself)", r.cardBottom <= r.chatTop, r);
      ok(look + ": the lane labels are hidden while the chat is open", r.lane === "hidden/0", r);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
