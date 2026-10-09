# symbiot relay

Your phone reaches Symbiot on your computer through this when it's away from home
(`phone.mjs`, README "Your phone"). Both connect out to it, so neither opens a port.

- **It can't read anything.** Everything a phone and its computer send each other is
  sealed (AES-256-GCM) with a key only the two hold, agreed when they paired. The relay
  passes those envelopes on, unopened.
- **It stores nothing.** A phone's request goes straight down the line the computer
  keeps open, and the answer straight back. With the computer away, the phone is told
  so at once (503); the phone keeps its own changes until the computer is back.
- **It knows a pair only by an id**: a hash of a secret the computer draws from its own
  key. The computer shows the secret when it connects and the relay hashes it, so no
  one else can take the computer's place; phones only ever know the id. Never a
  token, a name or an address.
- **Limits:** 256 KB a message, 120 requests a minute per pair, 20 waiting, 25 seconds
  for an answer.

It does see when a pair talks and how much, and the addresses the requests come from.

## Protocol

| | |
|---|---|
| `GET /v1/<id>/computer` | the computer's line, a WebSocket: first `{ "hello": "<secret>" }` (answered `{ "ready": true }`), then `{ rid, body }` down and `{ rid, s, b }` back up; `{"ping":1}` keeps it open |
| `POST /v1/<id>/ask` | a phone's sealed request (`phone.mjs` envelope) → `200 { s, b }`, the computer's sealed answer; `503 { away }` when no computer holds the id; `504` when it didn't answer in time |

## Two ways to run it

- **`worker.mjs`, on Cloudflare** (how relay.symbiot.co.za runs): a Worker, and a
  Durable Object per pair holding the computer's line. The line hibernates between
  messages and its keep-alive ping is answered without waking it, so the free plan
  covers it. Deploy from this folder with `npx wrangler deploy` (`wrangler.toml`
  binds the Durable Object, `PairObject`, SQLite-backed as the free plan requires,
  and puts it on `relay.symbiot.co.za`, which needs the domain's DNS on Cloudflare).
  `npx wrangler tail` shows its log, which holds no message contents.
- **`server.mjs`, on Node**: the same relay, for the tests and for running your own
  (`PORT=8787 node relay/server.mjs`, behind HTTPS). Point Symbiot on your computer at
  it with `SYMBIOT_RELAY=https://your-relay`; the phone learns the address when it
  pairs.

## Checking it

`node test/phone.mjs` runs a computer and a phone (two homes, one computer) through
`server.mjs`. `SYMBIOT_TEST_RELAY=<url> node test/phone.mjs` runs the same relay
checks against another one: the Worker in `wrangler dev` or Miniflare, or the
deployed relay.symbiot.co.za.

It isn't part of the npm package (`package.json` `files`): the app only talks to it.
