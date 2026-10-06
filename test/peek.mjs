// Peek (peek.mjs) and the Dashboard card chat (watch.mjs): "go look at the
// links" gets what's behind them, and what the chat can't do goes to your agent.
// Isolated HOME (set before the modules load); no real request leaves: fetch,
// DNS, the model and the agent are stand-ins.
//
//   node test/peek.mjs
//
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-peek-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { linksIn, privateIp, peek, peekLine } = await import("../peek.mjs");
const { boardChat } = await import("../watch.mjs");

// fetch and DNS stand-ins: a tiny web of pages by URL
const PUBLIC = async () => [{ address: "93.184.216.34", family: 4 }];
function web(pages) {
  const asked = [];
  const get = async (url) => {
    asked.push(url); const p = pages[url];
    if (!p) return new Response("nope", { status: 404, headers: { "content-type": "text/html" } });
    return new Response(p.body ?? "", { status: p.status || 200, headers: p.headers || { "content-type": "text/html; charset=utf-8" } });
  };
  return { get, asked };
}

try {
  console.log("LINKS IN TEXT — the way chats write them");
  const ls = linksIn("Hey check die uit mentenaz-server.com/about/x. Also (https://store.godotengine.org/asset/godotvmf) and Argena.apk");
  ok("a bare host with a path, and a full link; trailing punctuation off; a file name isn't a link", ls.join() === "https://mentenaz-server.com/about/x,https://store.godotengine.org/asset/godotvmf", ls);

  console.log("YOUR NETWORK — refused, so a message can't make Symbiot poke it");
  ok("private, loopback, link-local and CGNAT (Tailscale) addresses are yours", ["192.168.1.1", "10.0.0.5", "127.0.0.1", "169.254.1.1", "100.78.4.37", "::1", "fd00::1", "::ffff:192.168.8.121"].every(privateIp) && !privateIp("93.184.216.34"), "");
  const lan = await peek("http://192.168.1.1/admin", { get: web({}).get, resolve: PUBLIC });
  ok("a link to your router isn't fetched", /private network/.test(lan.error || ""), lan);
  const w0 = web({ "https://short.example/r": { status: 302, headers: { location: "http://intranet.local/x" } } });
  const hop = await peek("https://short.example/r", { get: w0.get, resolve: PUBLIC });
  ok("nor is a redirect that leads into it", /private network/.test(hop.error || "") && w0.asked.length === 1, hop);

  console.log("WHAT'S BEHIND A LINK — like a link preview");
  const w1 = web({
    "https://mentenaz-server.com/about/x": { status: 301, headers: { location: "https://login-verify.mentenaz-server.com/" } },
    "https://login-verify.mentenaz-server.com/": { body: '<html><head><title>Sign in &amp; verify</title><meta property="og:description" content="Confirm your WhatsApp account"></head></html>' },
    "https://store.example/app": { headers: { "content-type": "application/vnd.android.package-archive", "content-disposition": 'attachment; filename="Argena.apk"', "content-length": "5242880" }, body: "x".repeat(10) },
  });
  const pg = await peek("https://mentenaz-server.com/about/x", { get: w1.get, resolve: PUBLIC });
  ok("a page: where it ends up, its title and description", pg.final === "https://login-verify.mentenaz-server.com/" && pg.title === "Sign in & verify" && pg.description === "Confirm your WhatsApp account", pg);
  ok("…said in one line for the chat, redirect included", /goes to https:\/\/login-verify/.test(peekLine(pg)) && /"Sign in & verify"/.test(peekLine(pg)), peekLine(pg));
  const apk = await peek("https://store.example/app", { get: w1.get, resolve: PUBLIC });
  ok("a file: its type, name and size from the headers, not downloaded", apk.file && apk.name === "Argena.apk" && apk.size === 5242880 && /file download.*not downloaded/.test(peekLine(apk)), [apk, peekLine(apk)]);

  console.log("CARD CHAT — looks at the links when asked, and doesn't refuse");
  const now = Date.now();
  writeFileSync(join(CFG, "watch.json"), JSON.stringify({ watches: [{ id: "wa", name: "WhatsApp", url: "https://web.whatsapp.com/", every: 15, added: now, last: now, seen: [] }], briefs: [], news: [
    { id: "n1", watch: "wa", name: "WhatsApp", ts: now - 60000, text: "Francois Huyzers: Hey check die uit mentenaz-server.com/about/x" },
    { id: "n2", watch: "wa", name: "WhatsApp", ts: now - 120000, text: "Jaden white: Argena.apk" },
  ] }));
  let sys = "", prm = "", looked = [];
  const ask = async (s, p) => { sys = s; prm = p; return "The mentenaz link redirects to a sign-in page asking to verify WhatsApp: phishing-shaped."; };
  const look = async (urls) => { looked = urls; return Promise.all(urls.map((u) => peek(u, { get: w1.get, resolve: PUBLIC }))); };
  const r1 = await boardChat("wa", "go look at the links for me and report back", { ask, look, now });
  ok("asked about the links: they're looked up and what's behind them reaches the AI", looked.join() === "https://mentenaz-server.com/about/x" && /What's behind the links/.test(prm) && /login-verify/.test(prm) && r1.links && r1.links.length === 1, [looked, r1.links]);
  ok("the AI is Symbiot everywhere, and acts instead of refusing", /You are Symbiot, the one assistant/.test(sys) && /don't explain what you can't do/.test(sys), "");
  looked = [];
  await boardChat("wa", "who's waiting on me?", { ask, look, now });
  ok("a question that isn't about links doesn't fetch anything", looked.length === 0 && !/What's behind the links/.test(prm), looked);

  console.log("IT ACTS — asked to do something, the card chat hands it to your agent itself");
  let ran = null;
  const act = async () => JSON.stringify({ reply: "That's account 049056030093. Closing it can't be undone, so your agent will check what runs there and ask you first.", do: { agent: "Close AWS account 049056030093: first list what's running and what it costs, and ask before closing." }, remember: [{ name: "AWS 049056030093", kind: "account", fact: "the Dailify/CallForge AWS account" }] });
  const r2 = await boardChat("wa", "close it for me, the mcp is set up", { ask: act, look, now, run: (req, o) => { ran = { req, o }; return { ok: true, job: "j1", dir: "/tmp/x" }; } });
  ok("no button, no pasting: the request goes to your agent", ran && /Close AWS account 049056030093/.test(ran.req) && r2.did && r2.did.kind === "agent" && r2.did.ok, r2.did);
  ok("with what the card showed, as context", ran && /Francois Huyzers/.test(ran.o.context), ran && ran.o);
  ok("the reply says it's handed over, and that the agent asks before anything hard to undo", /Handed to your agent/.test(r2.answer) && /asks you there before anything hard to undo/.test(r2.answer), r2.answer);
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} peek: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
