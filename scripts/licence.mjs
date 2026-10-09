#!/usr/bin/env node
// Issuing Symbiot Pro keys: Ghost AI's own tool, run by hand or by Ghost AI's Symbiot.
// Not part of the npm package. The signing key stays in ~/.config/symbiot-issuer/
// (never in a repo: anyone holding it could make free Pro keys), and every key issued
// is logged there in issued.jsonl.
//
//   node scripts/licence.mjs issue --email a@b.com [--name "Ann B"] [--months 12] [--plan pro|owner]
//   node scripts/licence.mjs check <key>            what a key says, and whether it's genuine
//   node scripts/licence.mjs list                   every key issued
//   node scripts/licence.mjs revoke <key-id>        cancels it: adds it to site/licences/revoked.json
//                                                   (live once that change is merged to main)
//
// SYMBIOT_ISSUER_DIR points elsewhere (tests).
import { createPrivateKey, sign, randomBytes } from "node:crypto";
import { readFileSync, appendFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const DIR = process.env.SYMBIOT_ISSUER_DIR || join(homedir(), ".config", "symbiot-issuer");
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const fail = (m) => { console.error(m); process.exit(1); };

function issue() {
  const email = arg("email"); if (!email || !/@/.test(email)) fail("--email is needed");
  const plan = arg("plan", "pro"); if (!["pro", "owner"].includes(plan)) fail("--plan is pro or owner");
  const months = Number(arg("months", plan === "owner" ? "0" : "12"));
  const keyFile = join(DIR, "signing-key.pem"); if (!existsSync(keyFile)) fail(`No signing key at ${keyFile}`);
  const now = Date.now(), id = b64u(randomBytes(9));
  const expires = months > 0 ? new Date(new Date(now).setMonth(new Date(now).getMonth() + months)).getTime() : 0;
  const payload = { v: 1, id, p: plan, e: email, ...(arg("name") ? { n: arg("name") } : {}), i: now, x: expires };
  const body = b64u(JSON.stringify(payload));
  const key = `SYM1-${body}.${b64u(sign(null, Buffer.from(body), createPrivateKey(readFileSync(keyFile))))}`;
  mkdirSync(DIR, { recursive: true });
  appendFileSync(join(DIR, "issued.jsonl"), JSON.stringify({ ...payload, key }) + "\n", { mode: 0o600 });
  if (process.argv.includes("--json")) console.log(JSON.stringify({ id, plan, email, expires, key }));
  else console.log(`${plan === "owner" ? "Owner" : "Pro"} key for ${email}${expires ? ", until " + new Date(expires).toISOString().slice(0, 10) : ", no end date"} (id ${id}):\n\n${key}\n`);
}
async function check() {
  const { readKey } = await import("../licence.mjs");
  const k = readKey(process.argv[3]);
  console.log(k.ok ? `Genuine. ${k.plan} for ${k.email}${k.expires ? ", until " + new Date(k.expires).toISOString().slice(0, 10) : ", no end date"} (id ${k.id})` : k.why);
}
function list() {
  const f = join(DIR, "issued.jsonl"); if (!existsSync(f)) return console.log("No keys issued yet.");
  for (const l of readFileSync(f, "utf8").trim().split("\n")) { const k = JSON.parse(l); console.log(`${k.id}  ${k.p.padEnd(5)}  ${new Date(k.i).toISOString().slice(0, 10)}  ${k.x ? "until " + new Date(k.x).toISOString().slice(0, 10) : "no end   "}  ${k.e}`); }
}
function revoke() {
  const id = process.argv[3]; if (!id) fail("revoke <key-id> (see list)");
  const f = join(REPO, "site", "licences", "revoked.json");
  const j = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { ids: [] };
  if (!j.ids.includes(id)) j.ids.push(id);
  mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  console.log(`Cancelled ${id} in site/licences/revoked.json. It takes effect once that's merged to main (Symbiot checks about once a day).`);
}

const cmd = process.argv[2];
if (cmd === "issue") issue(); else if (cmd === "check") await check(); else if (cmd === "list") list(); else if (cmd === "revoke") revoke();
else fail("node scripts/licence.mjs issue|check|list|revoke  (see the top of this file)");
