// Lemon Squeezy, as a payment adapter for scripts/sales.mjs. Everything that knows
// Lemon Squeezy's API is in this file: moving to another provider (Paddle, Paystack, Stripe)
// is a new adapter with the same two calls, not a new key step.
//
// An adapter is { name, payments(), reversals() }:
//   payments():  [{ id, kind: "order"|"renewal", email, name, plan: "monthly"|"yearly"|"",
//                   sub, at, test, ref }]   what was paid and not refunded
//   reversals(): [{ id, kind: "refund"|"cancel", payment, sub, email, at, ends, partial,
//                   test, ref }]            refunds (of one payment) and cancelled subscriptions
// id is unique and stable across polls ("ls:order:123"); a refund's payment is the id of
// the payment it gives back; sub ties renewals and a cancellation to their subscription;
// ref says it for a person ("order #1042"); at and ends are ms; test is the provider's
// test mode.
//
// Read only, by polling (GET /v1/orders, /v1/subscription-invoices, /v1/subscriptions),
// so no public webhook address is needed. The API key comes from the caller (the vault).
const API = "https://api.lemonsqueezy.com/v1";
const PAGES = 50; // 100 a page: 5,000 of each is plenty for one poll

const ms = (s) => { const t = Date.parse(s || ""); return Number.isFinite(t) ? t : 0; };
// Which Pro plan a variant is: the store's own map first (variant id → "monthly" or
// "yearly"), else its name ("Pro yearly", "Annual", "Monthly").
function planOf(variantId, names, plans = {}) {
  const mine = plans[String(variantId)];
  if (mine === "monthly" || mine === "yearly") return mine;
  const s = names.filter(Boolean).join(" ");
  return /\b(?:year(?:ly)?|annual(?:ly)?|12[\s-]*months?)\b/i.test(s) ? "yearly" : /\bmonth(?:ly)?\b/i.test(s) ? "monthly" : "";
}

function lemonSqueezy({ apiKey, storeId = "", plans = {}, fetch = globalThis.fetch, base = API } = {}) {
  if (!apiKey) throw new Error("Lemon Squeezy needs its API key");
  async function all(path) {
    const out = [];
    for (let page = 1; page <= PAGES; page++) {
      const q = new URLSearchParams({ "page[number]": String(page), "page[size]": "100" });
      if (storeId) q.set("filter[store_id]", String(storeId));
      const r = await fetch(`${base}/${path}?${q}`, { headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) throw new Error(`Lemon Squeezy ${path}: HTTP ${r.status}`);
      const j = await r.json();
      out.push(...(Array.isArray(j.data) ? j.data : []));
      const last = Number(j.meta && j.meta.page && j.meta.page.lastPage) || 1;
      if (page >= last || !(j.data || []).length) break;
    }
    return out;
  }
  let seen = null; // one read of the three lists serves both calls
  async function read() {
    if (seen) return seen;
    const [orders, invoices, subs] = await Promise.all([all("orders"), all("subscription-invoices"), all("subscriptions")]);
    const subOf = new Map(subs.map((s) => [String(s.id), s.attributes || {}]));
    const subByOrder = new Map(subs.map((s) => [String((s.attributes || {}).order_id), String(s.id)]));
    seen = { orders, invoices, subs, subOf, subByOrder };
    return seen;
  }
  return {
    name: "Lemon Squeezy",
    async payments() {
      const { orders, invoices, subOf, subByOrder } = await read(), out = [];
      for (const o of orders) {
        const a = o.attributes || {}, item = a.first_order_item || {};
        if (a.status !== "paid") continue; // pending, failed, refunded, fraudulent: nothing to key
        out.push({ id: `ls:order:${o.id}`, kind: "order", email: a.user_email || "", name: a.user_name || "", plan: planOf(item.variant_id, [item.variant_name, item.product_name], plans),
          sub: subByOrder.get(String(o.id)) || "", at: ms(a.created_at), test: !!a.test_mode, ref: `order #${a.order_number || o.id}` });
      }
      for (const i of invoices) {
        const a = i.attributes || {};
        if (a.billing_reason !== "renewal" || a.status !== "paid") continue; // "initial" is the order above
        const s = subOf.get(String(a.subscription_id)) || {};
        out.push({ id: `ls:invoice:${i.id}`, kind: "renewal", email: a.user_email || s.user_email || "", name: a.user_name || s.user_name || "", plan: planOf(s.variant_id, [s.variant_name, s.product_name], plans),
          sub: String(a.subscription_id || ""), at: ms(a.created_at), test: !!a.test_mode, ref: `renewal of order #${s.order_id || "?"}` });
      }
      return out;
    },
    async reversals() {
      const { orders, invoices, subs, subOf } = await read(), out = [];
      for (const o of orders) {
        const a = o.attributes || {};
        if (!a.refunded && a.status !== "refunded" && a.status !== "partial_refund") continue;
        out.push({ id: `ls:refund:order:${o.id}`, kind: "refund", payment: `ls:order:${o.id}`, sub: "", email: a.user_email || "", at: ms(a.refunded_at || a.updated_at), partial: a.status === "partial_refund", test: !!a.test_mode, ref: `order #${a.order_number || o.id}` });
      }
      for (const i of invoices) {
        const a = i.attributes || {};
        if (a.billing_reason !== "renewal" || (!a.refunded && a.status !== "refunded" && a.status !== "partial_refund")) continue;
        out.push({ id: `ls:refund:invoice:${i.id}`, kind: "refund", payment: `ls:invoice:${i.id}`, sub: String(a.subscription_id || ""), email: a.user_email || "", at: ms(a.refunded_at || a.updated_at), partial: a.status === "partial_refund", test: !!a.test_mode, ref: `renewal of order #${(subOf.get(String(a.subscription_id)) || {}).order_id || "?"}` });
      }
      for (const s of subs) {
        const a = s.attributes || {};
        if (a.status !== "cancelled" && a.status !== "expired") continue;
        out.push({ id: `ls:cancel:${s.id}`, kind: "cancel", payment: "", sub: String(s.id), email: a.user_email || "", at: ms(a.updated_at), ends: ms(a.ends_at), test: !!a.test_mode, ref: `order #${a.order_id || "?"}` });
      }
      return out;
    },
  };
}

export { lemonSqueezy, planOf };
