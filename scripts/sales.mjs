#!/usr/bin/env node
// Paid for Pro on the site, key by email: Ghost AI's own key step, run in Ghost AI's own
// Symbiot (the signing key is only in ~/.config/symbiot-issuer/, so nowhere else can run it).
// Not part of the npm package.
//
//   node scripts/sales.mjs poll       read new payments, key each one once, email the key
//   node scripts/sales.mjs status     each payment and its key, and what's waiting
//   node scripts/sales.mjs live       the owner said yes on the Workdesk: real customers' key
//                                     emails go out from now on (the held ones on the next poll).
//                                     Their yes in this lane's answers does the same by itself.
//   node scripts/sales.mjs config [--store <id>] [--monthly <variant id>] [--yearly <variant id>]
//                                 [--from <address>] [--secret <vault name>] [--own <address,address>]
//
// A poll reads paid orders and subscription renewals from the payment provider (one adapter,
// scripts/pay/: Lemon Squeezy now), with its API key from Symbiot's vault. Each payment not
// handled yet gets a key the way scripts/licence.mjs issue does, and an email saying how to
// paste it into Settings. A subscription's key renews with it: it has no end date of its own,
// so a renewal needs no new key and no paste (twelve pastes a year was a reason to cancel).
// When the subscription is cancelled or lapses, the date it's paid up to goes in the site's
// site/licences/revoked.json (`ends`), which every Symbiot reads daily, and the key ends
// then; paid again, the date comes off. A payment with no subscription gets a key with an
// end (12 months for yearly, 1 month and GRACE_DAYS for monthly, from the payment's date).
// sales.json, next to the signing key, logs each payment against its key id, so a payment is
// never keyed twice, and a key is never emailed twice. A refund or a cancelled subscription
// goes to the Workdesk as a question; a key is never cancelled by itself. Test mode's keys go
// out at once, but only to the owner's own addresses (--own): with the pay buttons on the site
// in test mode, anyone's test-card "purchase" would otherwise get a real Pro key. A test payment
// from anyone else is left unkeyed and unlogged, so adding an address later still keys it. The
// first real customer's email waits for the owner's OK.
//
// SYMBIOT_ISSUER_DIR points elsewhere (tests); SYMBIOT_SALES_REPO is the lane whose Workdesk
// gets the questions (this repo by default).
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { issueKey } from "./licence.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = () => process.env.SYMBIOT_ISSUER_DIR || join(homedir(), ".config", "symbiot-issuer");
const REPO = () => process.env.SYMBIOT_SALES_REPO || join(HERE, "..");
const STATE = () => join(DIR(), "sales.json");
const GRACE_DAYS = 3;         // a monthly key outlasts its month by this, so the renewal's key lands first
const SEND_TRIES = 3;         // failed sends of one key before the Workdesk hears of it
const MONTHS = { monthly: 1, yearly: 12 };
const day = (t) => { try { return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); } catch { return ""; } };

function loadState() {
  let s = {}; try { s = JSON.parse(readFileSync(STATE(), "utf8")) || {}; } catch {}
  return { live: false, provider: "lemonsqueezy", secret: "lemonsqueezy", storeId: "", plans: {}, from: "", own: [], payments: {}, reversals: {}, asked: {}, ends: {}, ...s };
}
function saveState(s) {
  mkdirSync(DIR(), { recursive: true });
  const tmp = STATE() + ".tmp"; writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 }); renameSync(tmp, STATE());
}
// A key issued for a payment whose record was never saved (the step stopped in between):
// issued.jsonl has it under the payment's id, so it's taken up instead of keyed again.
function issuedFor(payId) {
  let lines = []; try { lines = readFileSync(join(DIR(), "issued.jsonl"), "utf8").trim().split("\n"); } catch {}
  for (const l of lines.reverse()) { try { const k = JSON.parse(l); if (k.ref === payId) return { id: k.id, key: k.key, expires: k.x }; } catch {} }
  return null;
}
const keyOf = (id) => { let lines = []; try { lines = readFileSync(join(DIR(), "issued.jsonl"), "utf8").trim().split("\n"); } catch {} for (const l of lines) { try { const k = JSON.parse(l); if (k.id === id) return k.key; } catch {} } return ""; };

// A subscription's key, ending: the date it's paid up to, in the site's revoked.json (`ends`,
// licence.mjs keyEnds), or taken off again (end 0). Live once the site change is merged.
function publishEnd(keyId, end) {
  const f = join(REPO(), "site", "licences", "revoked.json");
  let j = { ids: [] }; try { j = JSON.parse(readFileSync(f, "utf8")) || j; } catch {}
  const ends = { ...(j.ends || {}) }; if (end) ends[keyId] = end; else delete ends[keyId];
  const out = { ids: Array.isArray(j.ids) ? j.ids : [], ...(Object.keys(ends).length ? { ends } : {}) };
  mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(out, null, 2) + "\n");
}
// The subscription's key: its newest keyed payment.
const subKey = (state, sub) => (sub ? Object.values(state.payments).filter((x) => x.sub === sub && x.key).sort((a, b) => b.at - a.at)[0] || null : null);
// What a key is paid up to, from the subscription's last payment: its plan's months on from it.
function paidUntil(state, sub) {
  const last = Object.values(state.payments).filter((x) => x.sub === sub && (x.key || x.renewed)).sort((a, b) => b.at - a.at)[0];
  return last ? new Date(last.at).setUTCMonth(new Date(last.at).getUTCMonth() + (MONTHS[last.plan] || 1)) : 0;
}

// The email a buyer gets. Plain words: where in Symbiot the key goes.
function keyEmail({ name = "", plan, kind, key, expires, ref, renews = "" }) {
  const hi = name ? `Hi ${String(name).split(/\s+/)[0]},` : "Hi,";
  const renew = kind === "renewal";
  return {
    subject: `Your Symbiot Pro key (${ref})`,
    text: [
      hi, "",
      renew ? `Thanks for staying with Symbiot Pro. Here is your key for the next ${plan === "yearly" ? "year" : "month"}:` : `Thanks for buying Symbiot Pro${plan ? ` (${plan})` : ""}. Here is your key:`,
      "", key, "",
      renew ? "To use it: open Symbiot, go to Settings, and under Symbiot Pro press Remove this key, then paste this one in and press Add key."
        : "To use it: open Symbiot, go to Settings, paste it in under Symbiot Pro, and press Add key.",
      renews ? `It renews by itself with your subscription, so there's nothing to paste again${renews === "yearly" ? " next year" : " each month"}. If you cancel, it works to the end of the time you paid for.`
        : `It works until ${day(expires)}.${plan === "monthly" ? " Each month's renewal sends you a new key the same way." : plan === "yearly" ? " Next year's renewal sends you a new one." : ""}`, "",
      "Any questions, just reply to this email, or write to sales@symbiot.co.za.", "",
      "Symbiot",
    ].join("\n"),
  };
}

// A question on the Workdesk: appended to the lane's QUESTIONS.md (the same shape as
// deploy.mjs's deploy question), once. Its answer goes back to the symbiot lane's agent,
// who acts on it (scripts/licence.mjs revoke, or `sales.mjs live`).
function ask(state, key, heading, context, options) {
  if (state.asked[key]) return false;
  const f = join(REPO(), ".symbiot", "QUESTIONS.md"), read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
  state.asked[key] = Date.now();
  if (read(f).includes("### " + heading) || read(join(REPO(), ".symbiot", "ANSWERS.md")).includes("### " + heading)) return false;
  const body = [`### ${heading}`, context, ...options.map((o) => `- ${o}`), ""].join("\n");
  mkdirSync(dirname(f), { recursive: true });
  const old = read(f), head = /^##\s+Questions\s*$/m.test(old) ? "" : (old.trim() ? "\n## Questions\n" : "# Questions\n\n## Questions\n");
  const at = old.search(/^##\s+Suggestions/m);
  writeFileSync(f, at < 0 ? old.replace(/\s*$/, "\n") + head + body : old.slice(0, at).replace(/\s*$/, "\n\n") + body + "\n" + old.slice(at));
  return true;
}

// The owner's OK for real customers' key emails: `sales.mjs live` (liveAt), or their yes to the
// Workdesk's question, read from this lane's answers (and kept, so it holds once they're
// archived). `live: true` alone isn't one: it was found set on 19 Oct 2026 with no OK on
// record, which would have sent the first real customer's key without asking.
const LIVE_Q = "Send the first Pro key to a paying customer?";
function liveOk(state, now = Date.now()) {
  if (state.liveAt) return true;
  const esc = LIVE_Q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const f of ["ANSWERS.md", "ANSWERS.archive.md"]) {
    let t = ""; try { t = readFileSync(join(REPO(), ".symbiot", f), "utf8"); } catch {}
    const a = (t.match(new RegExp(`^### ${esc}[ \\t]*\\n+([^\\n]+)`, "m")) || [])[1] || "";
    if (a && !/skip this part|\bhold\b|\bno\b|\bnot yet\b|\bwait\b/i.test(a) && /\bsend\b|\byes\b|\bgo ahead\b/i.test(a)) { state.liveAt = now; state.live = true; return true; }
  }
  return false;
}

// One poll. adapter: scripts/pay/*; send({ to, subject, text, from }) → { ok, why }.
// Gives what it did, for the log and the tests.
async function poll({ adapter, send, now = Date.now() } = {}) {
  const state = loadState(), did = { keyed: [], renewed: [], sent: [], held: [], failed: [], asked: [], ended: [], resumed: [], notOwn: [] };
  const [payments, reversals] = [await adapter.payments(), await adapter.reversals()];
  const refunded = new Set(reversals.filter((r) => r.kind === "refund").map((r) => r.payment));

  const own = new Set((state.own || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean));
  for (const p of payments.sort((a, b) => a.at - b.at)) {
    if (state.payments[p.id]) continue;
    if (p.test && !own.has(String(p.email || "").trim().toLowerCase())) { did.notOwn.push(p.id); continue; } // a test purchase by someone else: no key
    if (refunded.has(p.id)) { state.payments[p.id] = { email: p.email, ref: p.ref, skipped: "refunded before it was keyed", at: p.at }; saveState(state); continue; }
    if (!MONTHS[p.plan]) {
      if (ask(state, "plan:" + p.id, `Which Pro plan did ${p.email} pay for?`, `Their payment (${p.ref}) doesn't say monthly or yearly, so no key went out yet. Telling the key step which product is which keys this one and every later one.`,
        ["🤖 Agent: look the product up in the store and set which is monthly and which is yearly, then key this payment (recommended)", "Skip this part: leave this payment without a key for now"])) did.asked.push("plan:" + p.id);
      saveState(state); continue;
    }
    // a renewal of a subscription whose key renews with it: nothing to key or send; paid again
    // after it lapsed (its end published), the end comes off and the same key carries on
    const prior = subKey(state, p.sub);
    if (prior && prior.renews) {
      state.payments[p.id] = { renewed: prior.key, email: p.email, name: p.name, plan: p.plan, kind: p.kind, sub: p.sub, ref: p.ref, test: !!p.test, at: p.at };
      const e = state.ends[prior.key];
      if (e && p.at > (e.set || 0)) { publishEnd(prior.key, 0); delete state.ends[prior.key]; if (e.rev) delete state.reversals[e.rev]; did.resumed.push(prior.key); }
      saveState(state); did.renewed.push(p.id); continue;
    }
    const had = issuedFor(p.id), renews = p.sub ? p.plan : "";
    const k = had || issueKey({ email: p.email, name: p.name, plan: "pro", months: renews ? 0 : MONTHS[p.plan], days: !renews && p.plan === "monthly" ? GRACE_DAYS : 0, from: p.at || now, ref: p.id, renews });
    state.payments[p.id] = { key: k.id, email: p.email, name: p.name, plan: p.plan, kind: p.kind, sub: p.sub, ...(renews ? { renews } : {}), ref: p.ref, test: !!p.test, at: p.at, expires: k.expires, issued: now, sent: 0, tries: 0 };
    saveState(state); did.keyed.push(p.id); // saved before any send: a crash never keys it again
  }

  let yes = null; // the owner's OK, looked up once a real key is waiting
  for (const [id, r] of Object.entries(state.payments)) {
    if (!r.key || r.sent) continue;
    if (!r.test && !(yes ??= liveOk(state, now))) {
      r.held = true;
      if (ask(state, "live", LIVE_Q,
        `${r.email} paid for Pro ${r.plan} (${r.ref}), the first real payment. Their key is made and waiting, and goes out by email from your mailbox once you say yes. Check first that the test purchase's key email read right.`,
        ["🤖 Agent: send it now, and send each new customer's key by itself from now on (recommended)", "Skip this part: hold the key emails, so no customer gets a key until you say so"])) did.asked.push("live");
      did.held.push(id); continue;
    }
    const key = keyOf(r.key); if (!key) { r.why = "the key isn't in issued.jsonl"; did.failed.push(id); continue; }
    const mail = keyEmail({ ...r, key });
    let res; try { res = await send({ to: r.email, from: state.from, ...mail }); } catch (e) { res = { ok: false, why: e.message }; }
    if (res && res.ok) { r.sent = Date.now(); delete r.held; delete r.why; did.sent.push(id); }
    else {
      r.tries = (r.tries || 0) + 1; r.why = String((res && res.why) || "no answer").slice(0, 200); did.failed.push(id);
      if (r.tries >= SEND_TRIES && ask(state, "send:" + id, `The Pro key email to ${r.email} didn't go out. Should ops find out why?`,
        `It failed ${r.tries} times (${r.ref}): ${r.why}. They paid and have no key yet. Each poll tries again.`,
        ["🤖 Agent: hand it to ops to find out why your mailbox won't send it, and fix it (recommended)", "Skip this part: keep retrying as it is"])) did.asked.push("send:" + id);
    }
    saveState(state);
  }

  // a subscription back on (cancelled, then resumed before it ended): its key's end comes off
  const cancelled = new Set(reversals.filter((v) => v.kind === "cancel").map((v) => v.sub));
  for (const [id, e] of Object.entries(state.ends)) {
    if (!e.sub || cancelled.has(e.sub)) continue;
    publishEnd(id, 0); delete state.ends[id]; if (e.rev) delete state.reversals[e.rev]; did.resumed.push(id);
  }

  for (const v of reversals) {
    if (state.reversals[v.id]) continue;
    const pay = v.kind === "refund" ? state.payments[v.payment] : null;
    // a refunded renewal is about the key it renewed
    const r = v.kind === "refund" ? (pay && !pay.key && pay.renewed ? { ...pay, ...(subKey(state, pay.sub) || {}), plan: pay.plan, ref: pay.ref } : pay) : subKey(state, v.sub);
    state.reversals[v.id] = { kind: v.kind, email: v.email, ref: v.ref, at: v.at, key: (r && r.key) || "" };
    if (!r || !r.key) { saveState(state); continue; } // never keyed: nothing to cancel
    // the subscription has ended or will: its key ends on the date it's paid up to (what they paid for, so no question)
    if (v.kind === "cancel" && r.renews) {
      const end = v.ends || paidUntil(state, v.sub) || now;
      publishEnd(r.key, end); state.ends[r.key] = { at: end, sub: v.sub, rev: v.id, set: now }; r.expires = end; did.ended.push(r.key);
    }
    const until = r.expires || (state.ends[r.key] || {}).at || 0;
    const who = r.email || v.email, ends = until ? day(until) : "", left = ends ? `until ${ends}` : "for as long as their subscription runs";
    const asked = v.kind === "refund"
      ? ask(state, v.id, `Should I cancel the Pro key of ${who}, whose payment was ${v.partial ? "partly " : ""}refunded?`,
        `Their payment for Pro ${r.plan} (${r.ref}) was ${v.partial ? "partly " : ""}refunded. Their key still works ${left}. Cancelling stops Pro on their computer within about a day, once the change is on the site, and nothing is sent to them.`,
        v.partial ? [`🤖 Agent: leave the key: a part refund is usually goodwill, and it ${ends ? `ends by itself on ${ends}` : "ends with their subscription"} (recommended)`, "🤖 Agent: cancel their key, so Pro stops on their computer within about a day"]
          : ["🤖 Agent: cancel their key, so nobody keeps Pro they got their money back for (recommended)", `Skip this part: leave the key working ${left}`])
      : until && until < now ? false
        : ask(state, v.id, `Should I cancel the Pro key of ${who} now that they cancelled their subscription?`,
          r.renews ? `They cancelled Pro ${r.plan} (${r.ref}). Their key ends on ${ends}, the end of the time they paid for: that date is in the site's list of keys and when they end, and goes live once that site change is merged.`
            : `They cancelled Pro ${r.plan} (${r.ref}). Their key ends by itself on ${ends}, the end of the time they paid for, and no new key goes out after that.`,
          [`🤖 Agent: leave the key: it ends by itself on ${ends}, and they keep what they paid for (recommended)`, "🤖 Agent: cancel their key now, so Pro stops on their computer within about a day"]);
    if (asked) did.asked.push(v.id);
    saveState(state);
  }
  saveState(state);
  return did;
}

// Sends through the linked mailbox: Claude Code with only claude.ai's Gmail connector, which
// sends it, then reads Sent to confirm it's there (a send counts only once the record shows
// it). The subject names the order, so a retry after a lost answer finds the first one and
// doesn't send it again.
function claudeMailer({ timeout = 240000 } = {}) {
  return async ({ to, from, subject, text }) => {
    const { claudeSpawn } = await import("../ai.mjs");
    const prompt = [
      "Send one email with the Gmail tools, exactly as written below, then confirm it was sent.",
      `First search the sent mail for subject "${subject}" to ${to}. If it's already there, don't send it again.`,
      `Otherwise send it once${from ? `, from ${from} (the mailbox's own send-as address for it; if the mailbox can't send as it, don't send and say so)` : ""}, then search the sent mail again to check it's there.`,
      `To: ${to}`, `Subject: ${subject}`, "Body (plain text, everything between the lines, unchanged):", "-----", text, "-----",
      'Reply with one line of JSON only: {"sent": true} once the sent mail shows it, or {"sent": false, "why": "<what stopped it>"}.',
    ].join("\n");
    const args = ["-p", "--output-format", "json", "--tools", "", "--allowedTools", "mcp__claude_ai_Gmail__send_message,mcp__claude_ai_Gmail__search_threads", "--setting-sources", "", "--no-session-persistence", "--disable-slash-commands"];
    return new Promise((done) => {
      let out = "";
      const ch = claudeSpawn(args, { cwd: homedir(), stdio: ["pipe", "pipe", "pipe"], env: process.env });
      const t = setTimeout(() => { try { ch.kill("SIGTERM"); } catch {} done({ ok: false, why: "Claude Code didn't answer in time" }); }, timeout);
      ch.stdout.on("data", (d) => { out += d; });
      ch.on("error", (e) => { clearTimeout(t); done({ ok: false, why: e.message }); });
      ch.on("close", () => {
        clearTimeout(t);
        let j = {}; try { j = JSON.parse(out.trim().split("\n").filter(Boolean).pop() || "{}"); } catch {}
        let a = {}; try { a = JSON.parse((String(j.result || "").match(/\{[^{}]*"sent"[^{}]*\}/) || ["{}"])[0]); } catch {}
        done(a.sent === true ? { ok: true } : { ok: false, why: a.why || String(j.result || "no answer").slice(0, 200) });
      });
      ch.stdin.end(prompt);
    });
  };
}

async function adapterFor(state) {
  if (state.provider !== "lemonsqueezy") throw new Error(`No adapter for ${state.provider}`);
  const { getSecret } = await import("../vault.mjs");
  const s = getSecret(state.secret); if (!s.ok) throw new Error(`The provider's API key isn't in the vault (symbiot secret add ${state.secret}): ${s.error}`);
  const { lemonSqueezy } = await import("./pay/lemonsqueezy.mjs");
  return lemonSqueezy({ apiKey: s.value.trim(), storeId: state.storeId, plans: state.plans });
}

function status() {
  const s = loadState(), rows = Object.entries(s.payments);
  console.log(`Real customers' key emails: ${liveOk(s) ? "going out" : "held until the owner's OK"}${s.from ? `, from ${s.from}` : ""}.`);
  if (!rows.length) return console.log("No payments yet.");
  for (const [id, r] of rows) console.log(`${new Date(r.at || 0).toISOString().slice(0, 10)}  ${(r.ref || id).padEnd(26)}  ${(r.plan || "").padEnd(7)}  ${r.test ? "test " : "     "} ${r.email}  ${r.key ? "key " + r.key : r.skipped || "no key"}  ${r.sent ? "sent " + new Date(r.sent).toISOString().slice(0, 16) : r.key ? (r.held ? "held" : "not sent" + (r.why ? ": " + r.why : "")) : ""}`);
  for (const [id, v] of Object.entries(s.reversals)) console.log(`${v.kind.padEnd(7)} ${v.ref || id}  ${v.email}  ${v.key ? "key " + v.key + ", asked on the Workdesk" : "never keyed"}`);
}
function config() {
  const s = loadState(), arg = (n) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : undefined; };
  if (arg("store") !== undefined) s.storeId = arg("store");
  if (arg("monthly")) s.plans[arg("monthly")] = "monthly";
  if (arg("yearly")) s.plans[arg("yearly")] = "yearly";
  if (arg("from") !== undefined) s.from = arg("from");
  if (arg("secret")) s.secret = arg("secret");
  if (arg("own") !== undefined) s.own = String(arg("own")).split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /@/.test(e));
  saveState(s);
  console.log(JSON.stringify({ provider: s.provider, secret: s.secret, storeId: s.storeId, plans: s.plans, from: s.from, own: s.own, live: s.live }, null, 2));
}

export { poll, keyEmail, claudeMailer, loadState, publishEnd, GRACE_DAYS };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === "poll") {
    try { const s = loadState(), did = await poll({ adapter: await adapterFor(s), send: claudeMailer() }); console.log(JSON.stringify(did)); }
    catch (e) { console.error(e.message); process.exit(1); }
  } else if (cmd === "status") status();
  else if (cmd === "live") { const s = loadState(); s.live = true; s.liveAt = Date.now(); saveState(s); console.log("Real customers' key emails go out from the next poll on."); }
  else if (cmd === "config") config();
  else { console.error("node scripts/sales.mjs poll|status|live|config  (see the top of this file)"); process.exit(1); }
}
