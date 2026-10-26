#!/usr/bin/env node
// symbiot — the native messaging host of Symbiot's extension in the user's own Chrome
// (ownchrome.mjs). Chrome starts it for that extension alone (its manifest's allowed_origins)
// and talks to it on stdin and stdout: each message is a 4-byte length, then that much JSON.
// It passes them on to the app's socket (--sock), a line of JSON each, and back. It holds
// nothing and decides nothing: the app and the extension do. While the app isn't running it
// tries the socket again every few seconds.
import { connect } from "node:net";

const at = process.argv.indexOf("--sock"), SOCK = at > 0 ? process.argv[at + 1] : "";
const MAX_OUT = 1024 * 1024; // Chrome takes at most 1 MB a message from a host

function toChrome(m) {
  const body = Buffer.from(JSON.stringify(m)); if (body.length > MAX_OUT) return;
  const head = Buffer.alloc(4); head.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([head, body]));
}

let app = null, appBuf = "";
const hello = []; // the extension's last hello, for the app when it comes (back)
function toApp(m) { if (app && !app.destroyed) { app.write(JSON.stringify(m) + "\n"); return true; } return false; }
function dial() {
  if (!SOCK || app) return;
  const s = connect(SOCK);
  s.on("connect", () => { app = s; appBuf = ""; for (const m of hello) toApp(m); });
  s.on("data", (d) => {
    appBuf += d.toString("utf8");
    for (let i = appBuf.indexOf("\n"); i >= 0; i = appBuf.indexOf("\n")) {
      const line = appBuf.slice(0, i); appBuf = appBuf.slice(i + 1);
      try { toChrome(JSON.parse(line)); } catch {}
    }
  });
  const gone = () => { if (app === s) app = null; s.destroy(); };
  s.on("error", gone); s.on("close", gone);
}

let inBuf = Buffer.alloc(0);
process.stdin.on("data", (d) => {
  inBuf = Buffer.concat([inBuf, d]);
  while (inBuf.length >= 4) {
    const n = inBuf.readUInt32LE(0); if (inBuf.length < 4 + n) break;
    const body = inBuf.subarray(4, 4 + n); inBuf = inBuf.subarray(4 + n);
    let m; try { m = JSON.parse(body.toString("utf8")); } catch { continue; }
    if (m && m.event === "hello") hello.splice(0, 1, m);
    toApp(m); // an answer the app is no longer there for is dropped: it gave up on it
  }
});
// Chrome closed the port: so does this
process.stdin.on("end", () => process.exit(0));

dial();
setInterval(dial, 3000);
// a message every 20 s keeps the extension's service worker awake while it's connected
setInterval(() => toChrome({ event: "ping" }), 20000);
