// Paid on the site, key by email (scripts/sales.mjs, scripts/pay/lemonsqueezy.mjs), against
// made-up Lemon Squeezy data: one key per subscription (renewals need nothing), nothing keyed or sent
// twice, the first real customer's email held for the OK, and refunds and cancellations
// asked on the Workdesk, never revoked by themselves. Plus the site's pay buttons, which
// stay off until the checkout links are set. Its own key pair and an isolated HOME.
//
//   node test/sales.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-sales-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
const ISSUER = join(HOME, "issuer"), LANE = join(HOME, "lane"); mkdirSync(ISSUER); mkdirSync(LANE);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
writeFileSync(join(ISSUER, "signing-key.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));
process.env.SYMBIOT_ISSUER_DIR = ISSUER; process.env.SYMBIOT_SALES_REPO = LANE;
process.env.SYMBIOT_LICENCE_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" });
process.env.SYMBIOT_REVOKED_URL = "http://127.0.0.1:9/none";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const DAY = 86400000;

// Made-up store data, in Lemon Squeezy's JSON:API shape.
const at = (d) => new Date(Date.UTC(2026, 9, d, 10)).toISOString();
// The date a cancelled subscription is paid up to: always ahead of the run, so it never ends before the test does.
const PAID_TO = new Date(Date.now() + 30 * DAY).toISOString();
const order = (id, o) => ({ type: "orders", id: String(id), attributes: { store_id: 1, order_number: 1000 + id, user_name: "Ann Buyer", user_email: `buyer${id}@example.com`, status: "paid", refunded: false, test_mode: true, created_at: at(10), first_order_item: { variant_id: 11, variant_name: "Monthly", product_name: "Symbiot Pro" }, ...o } });
const invoice = (id, o) => ({ type: "subscription-invoices", id: String(id), attributes: { store_id: 1, subscription_id: 501, user_name: "Ann Buyer", user_email: "buyer1@example.com", billing_reason: "renewal", status: "paid", refunded: false, test_mode: true, created_at: at(18), ...o } });
const sub = (id, o) => ({ type: "subscriptions", id: String(id), attributes: { store_id: 1, order_id: 1, user_email: "buyer1@example.com", variant_id: 11, variant_name: "Monthly", product_name: "Symbiot Pro", status: "active", ends_at: null, test_mode: true, updated_at: at(10), ...o } });
const STORE = { orders: [], "subscription-invoices": [], subscriptions: [] };
const calls = [];
// A paged API: page size 2 whatever was asked, so paging is exercised.
const fakeFetch = async (url, opts) => {
  const u = new URL(url), name = u.pathname.split("/").pop(), page = Number(u.searchParams.get("page[number]")) || 1;
  calls.push({ name, page, auth: opts.headers.Authorization, store: u.searchParams.get("filter[store_id]") });
  const all = STORE[name] || [], last = Math.max(1, Math.ceil(all.length / 2));
  return { ok: true, json: async () => ({ data: all.slice((page - 1) * 2, page * 2), meta: { page: { currentPage: page, lastPage: last } } }) };
};
const sent = [];
let failNext = 0;
const send = async (m) => { if (failNext > 0) { failNext--; return { ok: false, why: "the mailbox said no" }; } sent.push(m); return { ok: true }; };
const questions = () => { try { return readFileSync(join(LANE, ".symbiot", "QUESTIONS.md"), "utf8"); } catch { return ""; } };
const heads = () => questions().split("\n").filter((l) => l.startsWith("### "));

try {
  const { lemonSqueezy, planOf } = await import("../scripts/pay/lemonsqueezy.mjs");
  const { poll, keyEmail, loadState, GRACE_DAYS } = await import("../scripts/sales.mjs");
  const { readKey } = await import("../licence.mjs");
  const adapter = () => lemonSqueezy({ apiKey: "test-key", storeId: "1", plans: { 22: "yearly" }, fetch: fakeFetch });

  console.log("THE ADAPTER — Lemon Squeezy's orders, renewals and subscriptions, read the same way every provider is");
  ok("a plan from the store's own variant map", planOf(22, ["Whatever"], { 22: "yearly" }) === "yearly");
  ok("…else from its name", planOf(9, ["Pro yearly"]) === "yearly" && planOf(9, ["Annual plan"]) === "yearly" && planOf(9, ["Monthly"]) === "monthly" && planOf(9, ["Pro"]) === "");
  STORE.orders = [order(1), order(2, { first_order_item: { variant_id: 22, variant_name: "Default", product_name: "Symbiot Pro" } }), order(3, { status: "pending" }), order(4, { status: "failed" }), order(5, { first_order_item: { variant_id: 33, variant_name: "Pro yearly" } })];
  STORE["subscription-invoices"] = [invoice(901, { billing_reason: "initial", created_at: at(10) })];
  STORE.subscriptions = [sub(501)];
  let pays = await adapter().payments();
  ok("paid orders across pages are payments, pending and failed ones aren't", pays.map((p) => p.id).join() === "ls:order:1,ls:order:2,ls:order:5", pays.map((p) => p.id));
  ok("…each with its plan, buyer, subscription and a ref a person reads", pays[0].plan === "monthly" && pays[1].plan === "yearly" && pays[2].plan === "yearly" && pays[0].email === "buyer1@example.com" && pays[0].sub === "501" && pays[0].ref === "order #1001", pays[0]);
  ok("the subscription's first invoice isn't a second payment (its order is)", !pays.some((p) => p.kind === "renewal"));
  ok("it reads with the API key and only this store", calls.every((c) => c.auth === "Bearer test-key" && c.store === "1") && calls.some((c) => c.name === "orders" && c.page === 3), calls.slice(0, 3));
  let threw = false; try { lemonSqueezy({}); } catch { threw = true; }
  ok("no API key, no adapter", threw);

  // the made-up buyers stand in for the owner's own addresses: test mode keys only those
  writeFileSync(join(ISSUER, "sales.json"), JSON.stringify({ own: Array.from({ length: 12 }, (_, i) => `buyer${i + 1}@example.com`) }));
  console.log("A POLL — one key per payment, the right months, emailed once");
  STORE.orders = [order(1), order(2, { first_order_item: { variant_id: 22, variant_name: "Default" } })];
  let did = await poll({ adapter: adapter(), send });
  ok("two test payments: two keys, two emails", did.keyed.length === 2 && did.sent.length === 2 && sent.length === 2, did);
  let st = loadState();
  const m = st.payments["ls:order:1"], y = st.payments["ls:order:2"];
  const km = readKey(sent.find((s) => s.to === "buyer1@example.com").text.match(/SYM1-\S+/)[0]), ky = readKey(sent.find((s) => s.to === "buyer2@example.com").text.match(/SYM1-\S+/)[0]);
  ok("the emailed keys are genuine Pro keys for the buyer", km.ok && km.plan === "pro" && km.email === "buyer1@example.com" && ky.ok && ky.email === "buyer2@example.com", km);
  const paid = Date.parse(at(10));
  ok("a monthly subscription: a key that renews with it, with no end date of its own", km.expires === 0 && km.renews === "monthly", km);
  ok("…and its email says there's nothing to paste again", /renews by itself with your subscription, so there's nothing to paste again each month/.test(sent.find((s) => s.to === "buyer1@example.com").text) && !/new key/.test(sent.find((s) => s.to === "buyer1@example.com").text));
  ok("a payment with no subscription (yearly here): twelve months from the payment", ky.expires === new Date(paid).setUTCMonth(9 + 12) && !ky.renews, [new Date(ky.expires).toISOString()]);
  const ko = (await import("../scripts/licence.mjs")).issueKey({ email: "x@example.com", months: 1, days: GRACE_DAYS, from: paid });
  ok(`(a monthly key without a subscription: one month and ${GRACE_DAYS} days)`, ko.expires === new Date(paid).setUTCMonth(9 + 1) + GRACE_DAYS * DAY);
  ok("sales.json logs each order against its key id", m.key === km.id && y.key === ky.id && m.sent > 0 && y.sent > 0, st.payments);
  const mail = sent[0];
  ok("the email says where the key goes", /Your Symbiot Pro key \(order #100\d\)/.test(mail.subject) && /Settings/.test(mail.text) && /Symbiot Pro/.test(mail.text) && /Add key/.test(mail.text) && /sales@symbiot\.co\.za/.test(mail.text), mail);
  did = await poll({ adapter: adapter(), send });
  ok("polled again: nothing keyed or sent twice", did.keyed.length === 0 && did.sent.length === 0 && sent.length === 2, did);
  const issued = readFileSync(join(ISSUER, "issued.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  ok("issued.jsonl has each key once, under its payment", issued.filter((k) => k.ref).length === 2 && issued.map((k) => k.ref).filter(Boolean).sort().join() === "ls:order:1,ls:order:2", issued.map((k) => k.ref));

  console.log("RENEWALS — the subscription's key carries on: no new key, no email, nothing to paste");
  const sentBefore = sent.length, keysBefore = readFileSync(join(ISSUER, "issued.jsonl"), "utf8").trim().split("\n").length;
  STORE["subscription-invoices"].push(invoice(902));
  did = await poll({ adapter: adapter(), send });
  ok("a paid renewal: logged against the key it renews, nothing keyed or sent", did.renewed.join() === "ls:invoice:902" && !did.keyed.length && sent.length === sentBefore && loadState().payments["ls:invoice:902"].renewed === km.id && readFileSync(join(ISSUER, "issued.jsonl"), "utf8").trim().split("\n").length === keysBefore, did);

  console.log("A STOP IN BETWEEN — keyed but not logged yet: taken up, not keyed again");
  const { issueKey } = await import("../scripts/licence.mjs");
  STORE.orders.push(order(6));
  const early = issueKey({ email: "buyer6@example.com", months: 1, days: GRACE_DAYS, from: paid, ref: "ls:order:6" });
  did = await poll({ adapter: adapter(), send });
  ok("the key already issued for it is the one sent", loadState().payments["ls:order:6"].key === early.id && sent[sent.length - 1].text.includes(early.key), loadState().payments["ls:order:6"]);
  ok("…and no second key was made", readFileSync(join(ISSUER, "issued.jsonl"), "utf8").trim().split("\n").filter((l) => /"ls:order:6"/.test(l)).length === 1);

  console.log("THE FIRST REAL CUSTOMER — keyed at once, emailed only after the owner's OK");
  STORE.orders.push(order(7, { test_mode: false }), order(8, { test_mode: false }));
  const before = sent.length;
  did = await poll({ adapter: adapter(), send });
  ok("real payments are keyed and held, nothing sent", did.keyed.length === 2 && did.held.length === 2 && sent.length === before, did);
  ok("one question on the Workdesk asks to send it", heads().filter((h) => /Send the first Pro key/.test(h)).length === 1, heads());
  const q = questions();
  ok("…in the Workdesk's shape: two options, the recommended first", /### Send the first Pro key[^\n]*\n[^\n]+\n- 🤖 Agent: send it now[^\n]*\(recommended\)\n- Skip this part/.test(q), q);
  did = await poll({ adapter: adapter(), send });
  ok("polled again: still held, not asked twice", sent.length === before && heads().filter((h) => /Send the first Pro key/.test(h)).length === 1, did);
  const s2 = loadState(); s2.live = true; writeFileSync(join(ISSUER, "sales.json"), JSON.stringify(s2));
  did = await poll({ adapter: adapter(), send });
  ok("live switched on with no OK on record (as found on 19 Oct 2026): still held", sent.length === before && did.held.length === 2, did);
  const answers = join(LANE, ".symbiot", "ANSWERS.md");
  writeFileSync(answers, "### Send the first Pro key to a paying customer?\nSkip this part: hold the key emails, so no customer gets a key until you say so\n_answered 2026-10-19_\n");
  did = await poll({ adapter: adapter(), send });
  ok("the owner said hold on the Workdesk: still held", sent.length === before && did.held.length === 2, did);
  writeFileSync(answers, "### Send the first Pro key to a paying customer?\n🤖 Agent: send it now, and send each new customer's key by itself from now on (recommended)\n_answered 2026-10-19_\n");
  did = await poll({ adapter: adapter(), send });
  ok("after the owner's yes on the Workdesk, the held keys go out once", did.sent.length === 2 && sent.length === before + 2 && sent.slice(-2).map((s) => s.to).sort().join() === "buyer7@example.com,buyer8@example.com", did);
  writeFileSync(answers, "");
  ok("…and the yes is kept, so it holds once the answer is archived", loadState().liveAt > 0);
  const s3 = loadState(); delete s3.liveAt; s3.live = false; writeFileSync(join(ISSUER, "sales.json"), JSON.stringify(s3));
  execFileSync(process.execPath, [join(REPO, "scripts", "sales.mjs"), "live"], { env: process.env });
  ok("sales.mjs live records the OK too", loadState().liveAt > 0 && loadState().live === true);

  console.log("A FAILED SEND — retried next poll, never sent twice, the Workdesk told after 3 tries");
  STORE.orders.push(order(9));
  failNext = 3;
  for (let i = 0; i < 3; i++) await poll({ adapter: adapter(), send });
  const r9 = loadState().payments["ls:order:9"];
  ok("three failures: not sent, tries counted, why kept", !r9.sent && r9.tries === 3 && /mailbox said no/.test(r9.why), r9);
  ok("…and one question about it", heads().filter((h) => /buyer9@example\.com didn't go out/.test(h)).length === 1, heads());
  did = await poll({ adapter: adapter(), send });
  did = await poll({ adapter: adapter(), send });
  ok("it goes out on the next good poll, once", sent.filter((s) => s.to === "buyer9@example.com").length === 1, did);

  console.log("REFUNDS AND CANCELLATIONS — a question each, never revoked by themselves");
  const revoked = join(REPO, "site", "licences", "revoked.json"), revokedBefore = readFileSync(revoked, "utf8");
  STORE.orders[1].attributes.status = "refunded"; STORE.orders[1].attributes.refunded = true; STORE.orders[1].attributes.refunded_at = at(12);
  STORE.subscriptions[0].attributes.status = "cancelled"; STORE.subscriptions[0].attributes.ends_at = PAID_TO;
  STORE.orders.push(order(10, { status: "refunded", refunded: true }));
  did = await poll({ adapter: adapter(), send });
  const hs = heads();
  ok("a refunded order: asked to cancel its key, cancelling recommended", hs.some((h) => /cancel the Pro key of buyer2@example\.com, whose payment was refunded/.test(h)) && /refunded\?\n[^\n]+\n- 🤖 Agent: cancel their key[^\n]*\(recommended\)/.test(questions()), hs);
  ok("a cancelled subscription: asked, leaving it to end by itself recommended", hs.some((h) => /buyer1@example\.com now that they cancelled/.test(h)) && /cancelled their subscription\?\n[^\n]+\n- 🤖 Agent: leave the key: it ends by itself[^\n]*\(recommended\)/.test(questions()), hs);
  ok("…about the subscription's key", loadState().reversals["ls:cancel:501"].key === km.id, loadState().reversals);
  const ends = () => { try { return JSON.parse(readFileSync(join(LANE, "site", "licences", "revoked.json"), "utf8")).ends || {}; } catch { return {}; } };
  ok("the subscription's key gets its end on the site: the date it's paid up to", ends()[km.id] === Date.parse(PAID_TO) && did.ended.join() === km.id, ends());
  ok("…which says so in the question, not \"ends by itself\"", /ends on [^\n]*the site's list of keys/.test(questions()), questions());
  const { licenceState } = await import("../licence.mjs");
  const cfgOf = (key) => ({ licence: { key, trialStart: 1 } });
  const mine = sent.find((s) => s.to === "buyer1@example.com").text.match(/SYM1-\S+/)[0];
  writeFileSync(join(HOME, ".config", "symbiot", "licence-revoked.json"), JSON.stringify({ at: Date.now(), ids: [] }));
  const before30 = licenceState((Date.parse(PAID_TO) - DAY), cfgOf(mine));
  ok("on the customer's Symbiot, before the list has it: Pro, renewing, no end", before30.plan === "pro" && before30.renews === "monthly" && !before30.expires, before30);
  writeFileSync(join(HOME, ".config", "symbiot", "licence-revoked.json"), JSON.stringify({ at: Date.now(), ids: [], ends: ends() }));
  const s29 = licenceState((Date.parse(PAID_TO) - DAY), cfgOf(mine)), s40 = licenceState(Date.parse(PAID_TO) + 8 * DAY, cfgOf(mine));
  ok("…once it has: Pro until the date it was paid up to, then Free after the grace days", s29.plan === "pro" && s29.expires === Date.parse(PAID_TO) && !s29.renews && s40.plan === "free", [s29, s40]);
  STORE.subscriptions[0].attributes.status = "active"; STORE.subscriptions[0].attributes.ends_at = null;
  did = await poll({ adapter: adapter(), send });
  ok("resumed before it ended: the end comes off the site again", !ends()[km.id] && did.resumed.join() === km.id, [ends(), did]);
  STORE.subscriptions[0].attributes.status = "expired"; STORE.subscriptions[0].attributes.ends_at = PAID_TO;
  did = await poll({ adapter: adapter(), send });
  ok("lapsed later (a card that failed): the end goes back on", ends()[km.id] === Date.parse(PAID_TO), [ends(), did]);
  STORE.subscriptions[0].attributes.status = "active"; STORE["subscription-invoices"].push(invoice(903, { created_at: new Date(Date.now() + 60000).toISOString() }));
  did = await poll({ adapter: adapter(), send });
  ok("paid again: the same key carries on, its end off the site, nothing sent", !ends()[km.id] && did.renewed.join() === "ls:invoice:903" && !sent.slice(sentBefore).some((m) => m.to === "buyer1@example.com"), [ends(), did]);
  STORE.subscriptions[0].attributes.status = "cancelled"; STORE.subscriptions[0].attributes.ends_at = PAID_TO; STORE["subscription-invoices"].pop();
  ok("refunded before it was ever keyed: no key, no question", !loadState().payments["ls:order:10"]?.key && !hs.some((h) => /buyer10/.test(h)), loadState().payments["ls:order:10"]);
  ok("nothing was revoked by itself", readFileSync(revoked, "utf8") === revokedBefore);
  const n = heads().length;
  await poll({ adapter: adapter(), send });
  ok("polled again: no question twice", heads().length === n, heads());
  ok("the refunded payment's key isn't emailed again", sent.filter((s) => s.to === "buyer2@example.com").length === 1);

  console.log("TEST MODE ON THE SITE — a test-card buy by anyone else gets no key");
  STORE.orders.push(order(40, { user_email: "stranger@example.net" }));
  did = await poll({ adapter: adapter(), send });
  ok("a test purchase from an address that isn't the owner's: no key, no email, not logged (so it can be keyed once the address is added)", did.notOwn.join() === "ls:order:40" && !loadState().payments["ls:order:40"] && !sent.some((m) => m.to === "stranger@example.net"), did);
  const so = loadState(); so.own.push("stranger@example.net"); writeFileSync(join(ISSUER, "sales.json"), JSON.stringify(so));
  did = await poll({ adapter: adapter(), send });
  ok("…keyed once the address is one of the owner's", did.keyed.join() === "ls:order:40" && sent.some((m) => m.to === "stranger@example.net"), did);
  STORE.orders.push(order(41, { user_email: "someone@example.org", test_mode: false }));
  did = await poll({ adapter: adapter(), send });
  ok("…and a real payment from anyone is keyed as before", did.keyed.join() === "ls:order:41", did);

  console.log("A PAYMENT THAT DOESN'T SAY MONTHLY OR YEARLY — asked, not guessed");
  STORE.orders.push(order(11, { first_order_item: { variant_id: 99, variant_name: "Default", product_name: "Symbiot" } }));
  did = await poll({ adapter: adapter(), send });
  ok("no key, one question", !loadState().payments["ls:order:11"] && heads().filter((h) => /Which Pro plan did buyer11/.test(h)).length === 1, did);

  console.log("THE EMAIL ITSELF");
  const e = keyEmail({ name: "Ann Buyer", plan: "yearly", kind: "order", key: "SYM1-x.y", expires: Date.UTC(2027, 9, 10), ref: "order #1002" });
  ok("first name, the key on its own line, the end date", /^Hi Ann,/.test(e.text) && /\n\nSYM1-x\.y\n\n/.test(e.text) && /10 October 2027/.test(e.text), e.text);

  console.log("THE MAILER — the linked mailbox through Claude Code's Gmail connector (a stand-in Claude here)");
  const fake = join(HOME, "fake-claude.mjs"), seen = join(HOME, "fake-claude.json");
  writeFileSync(fake, `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
let input = ""; process.stdin.on("data", (d) => { input += d; }).on("end", () => {
  writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ args: process.argv.slice(2), input }));
  const sent = !/fail/.test(input);
  console.log(JSON.stringify({ is_error: false, result: sent ? 'Done. {"sent": true}' : '{"sent": false, "why": "no send-as address"}' }));
});`, { mode: 0o755 });
  process.env.SYMBIOT_CLAUDE_CMD = fake;
  const { claudeMailer } = await import("../scripts/sales.mjs");
  const r1 = await claudeMailer({ timeout: 20000 })({ to: "a@example.com", from: "sales@symbiot.co.za", subject: "Your Symbiot Pro key (order #1001)", text: "Hi,\n\nSYM1-abc.def\n" });
  const run = JSON.parse(readFileSync(seen, "utf8"));
  ok("sent once Claude says Sent has it", r1.ok === true, r1);
  ok("only the Gmail send and search tools, no others", run.args.includes("--allowedTools") && run.args[run.args.indexOf("--allowedTools") + 1] === "mcp__claude_ai_Gmail__send_message,mcp__claude_ai_Gmail__search_threads" && run.args[run.args.indexOf("--tools") + 1] === "" && !run.args.includes("--strict-mcp-config"), run.args);
  ok("it checks Sent first (no second send on a retry), sends the body unchanged, from the address set", /search the sent mail for subject "Your Symbiot Pro key \(order #1001\)" to a@example\.com/.test(run.input) && run.input.includes("-----\nHi,\n\nSYM1-abc.def\n\n-----") && /from sales@symbiot\.co\.za/.test(run.input), run.input);
  const r2 = await claudeMailer({ timeout: 20000 })({ to: "a@example.com", from: "", subject: "fail", text: "x" });
  ok("a send it couldn't make says why", r2.ok === false && r2.why === "no send-as address", r2);
  delete process.env.SYMBIOT_CLAUDE_CMD;

  console.log("THE SITE — pay buttons only once the checkout links are set");
  const html = readFileSync(join(REPO, "site", "index.html"), "utf8");
  const card = html.match(/<div class="card pro" data-checkout-monthly="([^"]*)" data-checkout-yearly="([^"]*)"(?: data-checkout-test="([01]?)")?>/);
  ok("the Pro card carries the setting", !!card);
  ok("Get Pro by email is always there; each link set is https", card && /id="get-pro" href="mailto:sales@symbiot\.co\.za/.test(html) && [card[1], card[2]].every((u) => !u || /^https:\/\//.test(u)), card && card.slice(1));
  ok("the buttons say the prices and that the key comes by email, or in test mode that buying is by email", /Pro monthly, US\$12/.test(html) && /Pro yearly, US\$99/.test(html) && /Your key arrives by email in a minute/.test(html) && /in test mode for now: no card is charged and no key is sent/.test(html) && /email sales@symbiot\.co\.za/.test(html));
  ok("…and a test-mode checkout is marked as one (19 Oct 2026: the pay buttons went up in test mode)", !card || !card[1] || card[3] === "1" || !/lemonsqueezy/.test(card[1]), card && card.slice(1));
  ok("the key step and the adapter stay out of the npm package", !JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).files.some((f) => /^scripts/.test(f)));
  ok("no Workdesk file outside the test's lane", !existsSync(join(HOME, ".symbiot")));
} catch (e) { fail++; console.log("  ✗ threw: " + (e.stack || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
