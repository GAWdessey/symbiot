#!/usr/bin/env node
// Issuing Symbiot Pro keys: Ghost AI's own tool, run by hand or by Ghost AI's Symbiot.
// Not part of the npm package. The signing key stays in ~/.config/symbiot-issuer/
// (never in a repo: anyone holding it could make free Pro keys), and every key issued
// is logged there in issued.jsonl.
//
//   node scripts/licence.mjs issue --email a@b.com [--name "Ann B"] [--months 12] [--days 5] [--plan pro|owner]
//                                                   (--days: grace on top of the months)
//   node scripts/licence.mjs check <key>            what a key says, and whether it's genuine
//   node scripts/licence.mjs list                   every key issued
//   node scripts/licence.mjs revoke <key-id>        cancels it: adds it to site/licences/revoked.json
//                                                   (live once that change is merged to main)
//
// SYMBIOT_ISSUER_DIR points elsewhere (tests). scripts/sales.mjs imports issueKey, so a
// paid order is keyed exactly the way a key issued by hand is.
import { createPrivateKey, sign, randomBytes } from "node:crypto";
import { readFileSync, appendFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const DIR = () => process.env.SYMBIOT_ISSUER_DIR || join(homedir(), ".config", "symbiot-issuer");
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const fail = (m) => { console.error(m); process.exit(1); };

// A signed key, logged in issued.jsonl. Months (0: no end date) plus days of grace, counted
// from `from` (a payment's date; now by default). ref (a payment's id) is kept in the log,
// not in the key. Throws when there's no signing key.
function issueKey({ email, name = "", plan = "pro", months = plan === "owner" ? 0 : 12, days = 0, from = Date.now(), ref = "" } = {}) {
  if (!email || !/@/.test(email)) throw new Error("An email is needed");
  if (!["pro", "owner"].includes(plan)) throw new Error("The plan is pro or owner");
  const keyFile = join(DIR(), "signing-key.pem"); if (!existsSync(keyFile)) throw new Error(`No signing key at ${keyFile}`);
  const now = Date.now(), id = b64u(randomBytes(9));
  const expires = months > 0 || days > 0 ? new Date(from).setUTCMonth(new Date(from).getUTCMonth() + months) + days * 86400000 : 0;
  const payload = { v: 1, id, p: plan, e: email, ...(name ? { n: name } : {}), i: now, x: expires };
  const body = b64u(JSON.stringify(payload));
  const key = `SYM1-${body}.${b64u(sign(null, Buffer.from(body), createPrivateKey(readFileSync(keyFile))))}`;
  mkdirSync(DIR(), { recursive: true });
  appendFileSync(join(DIR(), "issued.jsonl"), JSON.stringify({ ...payload, key, ...(ref ? { ref } : {}) }) + "\n", { mode: 0o600 });
  return { id, plan, email, expires, key };
}
function issue() {
  const email = arg("email"); if (!email || !/@/.test(email)) fail("--email is needed");
  const plan = arg("plan", "pro"); if (!["pro", "owner"].includes(plan)) fail("--plan is pro or owner");
  let k; try { k = issueKey({ email, plan, name: arg("name", ""), months: Number(arg("months", plan === "owner" ? "0" : "12")), days: Number(arg("days", "0")) }); } catch (e) { fail(e.message); }
  const { id, expires, key } = k;
  if (process.argv.includes("--json")) console.log(JSON.stringify(k));
  else console.log(`${plan === "owner" ? "Owner" : "Pro"} key for ${email}${expires ? ", until " + new Date(expires).toISOString().slice(0, 10) : ", no end date"} (id ${id}):\n\n${key}\n`);
}
async function check() {
  const { readKey } = await import("../licence.mjs");
  const k = readKey(process.argv[3]);
  console.log(k.ok ? `Genuine. ${k.plan} for ${k.email}${k.expires ? ", until " + new Date(k.expires).toISOString().slice(0, 10) : ", no end date"} (id ${k.id})` : k.why);
}
function list() {
  const f = join(DIR(), "issued.jsonl"); if (!existsSync(f)) return console.log("No keys issued yet.");
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

export { issueKey };

const cmd = process.argv[2];
if (process.argv[1] && resolve(process.argv[1]) !== fileURLToPath(import.meta.url)) { /* imported */ }
else if (cmd === "issue") issue(); else if (cmd === "check") await check(); else if (cmd === "list") list(); else if (cmd === "revoke") revoke();
else fail("node scripts/licence.mjs issue|check|list|revoke  (see the top of this file)");
