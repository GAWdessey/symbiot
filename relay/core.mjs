// symbiot relay — what both runtimes share (worker.mjs on Cloudflare, server.mjs on
// Node): the rules, and the check that the computer is the one it says it is.
//
// The relay passes sealed messages between a phone and its computer when the phone
// is away from home (phone.mjs). It can't read them: they're sealed with a key only
// the two hold. It stores nothing: a phone's request goes straight down the line the
// computer keeps open, or the phone is told the computer is away.
//
// A pair is known by an id: a hash of a secret the computer draws from its own key.
// The computer shows the secret when it connects, and the relay hashes it; phones
// only ever know the id. So a stranger with an id can't take the computer's place,
// and a request for an id no computer holds gets nothing.

const LIMITS = {
  body: 256 * 1024,  // a request or an answer: a phone's snapshot is a few KB
  wait: 25000,       // how long a phone's request waits for its answer
  perMinute: 120,    // requests per pair per minute (a phone asks 3 every 2 minutes)
  waiting: 20,       // requests in flight per pair
};
const ID = /^[\w-]{16,64}$/;

// The id a secret stands for: base64url of its SHA-256, first 32 characters (phone.mjs relayOf).
async function idOf(secret) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(secret))));
  let s = ""; for (const b of d) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 32);
}
async function provesId(id, secret) { return typeof secret === "string" && secret.length >= 16 && (await idOf(secret)) === id; }

// Requests per pair per minute, kept in memory (a restart forgets them: that's fine).
function limiter(perMinute = LIMITS.perMinute) {
  let minute = 0, count = 0;
  return (now = Date.now()) => { const m = Math.floor(now / 60000); if (m !== minute) { minute = m; count = 0; } return ++count <= perMinute; };
}

export { LIMITS, ID, idOf, provesId, limiter };
