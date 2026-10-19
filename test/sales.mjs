// Paid on the site, key by email (scripts/sales.mjs, scripts/pay/lemonsqueezy.mjs), against
// made-up Lemon Squeezy data: one key per payment, the right months, nothing keyed or sent
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

  console.log("A POLL — one key per payment, the right months, emailed once");
  STORE.orders = [order(1), order(2, { first_order_item: { variant_id: 22, variant_name: "Default" } })];
  let did = await poll({ adapter: adapter(), send });
  ok("two test payments: two keys, two emails", did.keyed.length === 2 && did.sent.length === 2 && sent.length === 2, did);
  let st = loadState();
  const m = st.payments["ls:order:1"], y = st.payments["ls:order:2"];
  const km = readKey(sent.find((s) => s.to === "buyer1@example.com").text.match(/SYM1-\S+/)[0]), ky = readKey(sent.find((s) => s.to === "buyer2@example.com").text.match(/SYM1-\S+/)[0]);
  ok("the emailed keys are genuine Pro keys for the buyer", km.ok && km.plan === "pro" && km.email === "buyer1@example.com" && ky.ok && ky.email === "buyer2@example.com", km);
  const paid = Date.parse(at(10));
  ok(`monthly: one month and ${GRACE_DAYS} days from the payment`, km.expires === new Date(paid).setUTCMonth(9 + 1) + GRACE_DAYS * DAY, [new Date(km.expires).toISOString()]);
  ok("yearly: twelve months from the payment", ky.expires === new Date(paid).setUTCMonth(9 + 12), [new Date(ky.expires).toISOString()]);
  ok("sales.json logs each order against its key id", m.key === km.id && y.key === ky.id && m.sent > 0 && y.sent > 0, st.payments);
  const mail = sent[0];
  ok("the email says where the key goes", /Your Symbiot Pro key \(order #100\d\)/.test(mail.subject) && /Settings/.test(mail.text) && /Symbiot Pro/.test(mail.text) && /Add key/.test(mail.text) && /sales@symbiot\.co\.za/.test(mail.text), mail);
  did = await poll({ adapter: adapter(), send });
  ok("polled again: nothing keyed or sent twice", did.keyed.length === 0 && did.sent.length === 0 && sent.length === 2, did);
  const issued = readFileSync(join(ISSUER, "issued.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  ok("issued.jsonl has each key once, under its payment", issued.length === 2 && issued.map((k) => k.ref).sort().join() === "ls:order:1,ls:order:2", issued.map((k) => k.ref));

  console.log("RENEWALS — a new key each time it's paid");
  STORE["subscription-invoices"].push(invoice(902));
  did = await poll({ adapter: adapter(), send });
  const renewed = sent[sent.length - 1], kr = readKey(renewed.text.match(/SYM1-\S+/)[0]);
  ok("a paid renewal gets its own key, for its plan, from its date", did.keyed.join() === "ls:invoice:902" && kr.ok && kr.expires === new Date(Date.parse(at(18))).setUTCMonth(9 + 1) + GRACE_DAYS * DAY, did);
  ok("…and says how to swap the old key for it", /renewal/i.test(renewed.subject) || /Remove this key/.test(renewed.text), renewed.text);

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
  ok("after the OK (sales.mjs live), the held keys go out once", did.sent.length === 2 && sent.length === before + 2 && sent.slice(-2).map((s) => s.to).sort().join() === "buyer7@example.com,buyer8@example.com", did);

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
  STORE.subscriptions[0].attributes.status = "cancelled"; STORE.subscriptions[0].attributes.ends_at = at(30);
  STORE.orders.push(order(10, { status: "refunded", refunded: true }));
  did = await poll({ adapter: adapter(), send });
  const hs = heads();
  ok("a refunded order: asked to cancel its key, cancelling recommended", hs.some((h) => /cancel the Pro key of buyer2@example\.com, whose payment was refunded/.test(h)) && /refunded\?\n[^\n]+\n- 🤖 Agent: cancel their key[^\n]*\(recommended\)/.test(questions()), hs);
  ok("a cancelled subscription: asked, leaving it to end by itself recommended", hs.some((h) => /buyer1@example\.com now that they cancelled/.test(h)) && /cancelled their subscription\?\n[^\n]+\n- 🤖 Agent: leave the key: it ends by itself[^\n]*\(recommended\)/.test(questions()), hs);
  ok("…about the subscription's newest key (the renewal)", loadState().reversals["ls:cancel:501"].key === loadState().payments["ls:invoice:902"].key, loadState().reversals);
  ok("refunded before it was ever keyed: no key, no question", !loadState().payments["ls:order:10"]?.key && !hs.some((h) => /buyer10/.test(h)), loadState().payments["ls:order:10"]);
  ok("nothing was revoked by itself", readFileSync(revoked, "utf8") === revokedBefore);
  const n = heads().length;
  await poll({ adapter: adapter(), send });
  ok("polled again: no question twice", heads().length === n, heads());
  ok("the refunded payment's key isn't emailed again", sent.filter((s) => s.to === "buyer2@example.com").length === 1);

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
  const card = html.match(/<div class="card pro" data-checkout-monthly="([^"]*)" data-checkout-yearly="([^"]*)">/);
  ok("the Pro card carries the one setting", !!card);
  ok("unset, Get Pro by email stays; set, both are https links", card && ((!card[1] && !card[2] && /id="get-pro" href="mailto:sales@symbiot\.co\.za/.test(html)) || (/^https:\/\//.test(card[1]) && /^https:\/\//.test(card[2]))), card && card.slice(1));
  ok("the buttons say the prices and that the key comes by email", /Pro monthly, US\$12/.test(html) && /Pro yearly, US\$99/.test(html) && /Your key arrives by email in a minute/.test(html) && /email sales@symbiot\.co\.za/.test(html));
  ok("the key step and the adapter stay out of the npm package", !JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).files.some((f) => /^scripts/.test(f)));
  ok("no Workdesk file outside the test's lane", !existsSync(join(HOME, ".symbiot")));
} catch (e) { fail++; console.log("  ✗ threw: " + (e.stack || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
