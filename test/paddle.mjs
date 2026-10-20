// scripts/pay/paddle.mjs against made-up Paddle Billing data: same payment and reversal
// shapes as the Lemon Squeezy adapter, paged, sandbox marked as test.
//
//   node test/paddle.mjs
//
import { paddle, planOf } from "../scripts/pay/paddle.mjs";

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const price = (id, interval) => ({ id, name: interval === "year" ? "Pro yearly" : "Pro monthly", billing_cycle: { interval, frequency: 1 } });
const txn = (id, o = {}) => ({ id, status: "completed", origin: "web", subscription_id: "sub_1", invoice_number: `1${id.slice(-2)}`, created_at: "2026-10-10T10:00:00Z", billed_at: "2026-10-10T10:00:05Z",
  customer: { email: `${id}@example.com`, name: "Ann Buyer" }, items: [{ price: price("pri_m", "month") }], details: { totals: { total: "1200" } }, ...o });
const DATA = {
  transactions: [txn("txn_01"), txn("txn_02", { items: [{ price: price("pri_y", "year") }], subscription_id: "sub_2" }), txn("txn_03", { status: "draft" }),
    txn("txn_04", { origin: "subscription_recurring" }), txn("txn_05", { status: "canceled" })],
  adjustments: [{ id: "adj_1", action: "refund", transaction_id: "txn_01", subscription_id: "sub_1", created_at: "2026-10-11T10:00:00Z", totals: { total: "400" } },
    { id: "adj_2", action: "credit", transaction_id: "txn_02", created_at: "2026-10-11T10:00:00Z", totals: { total: "100" } }],
  subscriptions: [{ id: "sub_1", status: "active" }, { id: "sub_2", status: "canceled", canceled_at: "2026-10-12T10:00:00Z", current_billing_period: { ends_at: "2027-10-10T10:00:00Z" } }],
};
const calls = [];
// pages of two, whatever was asked, so paging is exercised
const fakeFetch = async (url, opts) => {
  const u = new URL(url), name = u.pathname.slice(1), page = Number(u.searchParams.get("page")) || 1;
  calls.push({ host: u.host, name, auth: opts.headers.Authorization, page });
  const all = DATA[name] || [], more = page * 2 < all.length;
  return { ok: true, json: async () => ({ data: all.slice((page - 1) * 2, page * 2), meta: { pagination: { has_more: more, next: more ? `${u.origin}/${name}?page=${page + 1}` : "" } } }) };
};

console.log("PADDLE — payments, refunds and cancellations in the shape sales.mjs reads");
ok("a plan from the price map, else its billing cycle, else its name", planOf({ id: "x" }, { x: "yearly" }) === "yearly" && planOf(price("a", "year")) === "yearly" && planOf({ name: "Annual" }) === "yearly" && planOf({ name: "Pro" }) === "");
const a = paddle({ apiKey: "k", sandbox: true, fetch: fakeFetch });
const pays = await a.payments();
ok("completed transactions across pages are payments; draft and canceled aren't", pays.map((p) => p.id).join() === "pd:txn:txn_01,pd:txn:txn_02,pd:txn:txn_04", pays.map((p) => p.id));
ok("…with plan, buyer, subscription and a ref", pays[0].plan === "monthly" && pays[1].plan === "yearly" && pays[0].email === "txn_01@example.com" && pays[0].sub === "sub_1" && /invoice/.test(pays[0].ref), pays[0]);
ok("a recurring transaction is a renewal, the first one an order", pays[2].kind === "renewal" && pays[0].kind === "order");
ok("the sandbox marks every payment test", pays.every((p) => p.test === true));
const rev = await a.reversals();
ok("a refund points at its payment and is partial when less than the total", rev.some((r) => r.kind === "refund" && r.payment === "pd:txn:txn_01" && r.partial === true && r.email === "txn_01@example.com"), rev);
ok("credits aren't refunds", !rev.some((r) => r.id === "pd:refund:adj_2"));
ok("a canceled subscription ends when its paid period does", rev.some((r) => r.kind === "cancel" && r.sub === "sub_2" && r.ends === Date.parse("2027-10-10T10:00:00Z")), rev);
ok("it reads with the key, on the sandbox host, once per list", calls.every((c) => c.auth === "Bearer k" && c.host === "sandbox-api.paddle.com") && calls.some((c) => c.name === "transactions" && c.page === 3), calls.length);
ok("live reads the live host and isn't test", (await (async () => { const c2 = []; const p = paddle({ apiKey: "k", fetch: async (u, o) => { c2.push(new URL(u).host); return fakeFetch(u, o); } }); const r = await p.payments(); return c2.every((h) => h === "api.paddle.com") && r.every((x) => !x.test); })()));
let threw = false; try { paddle({}); } catch { threw = true; }
ok("no API key, no adapter", threw);
console.log(fail ? `\n${fail} failed, ${pass} passed` : `\nall ${pass} passed`);
process.exit(fail ? 1 : 0);
