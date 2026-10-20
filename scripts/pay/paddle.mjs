// Paddle (Billing), as a payment adapter for scripts/sales.mjs: same two calls as
// scripts/pay/lemonsqueezy.mjs (payments, reversals), same shapes. Everything that knows
// Paddle's API is in this file.
//
// Read only, by polling (GET /transactions, /adjustments, /subscriptions), so no public
// webhook address is needed. Paddle's sandbox (sandbox-api.paddle.com, its own account and
// keys) is the test mode: `sandbox: true` points there and marks every payment test. The API
// key comes from the caller (the vault). `plans` maps a Paddle price id (pri_…) to
// "monthly" or "yearly"; without it, the price's name or billing cycle says.
const LIVE = "https://api.paddle.com";
const SANDBOX = "https://sandbox-api.paddle.com";
const PAGES = 50; // 200 a page: 10,000 of each is plenty for one poll

const ms = (s) => { const t = Date.parse(s || ""); return Number.isFinite(t) ? t : 0; };
// Which Pro plan a transaction line / subscription item is: the store's map first, then the
// price's billing cycle (month / year), then its name.
function planOf(price, plans = {}) {
  const p = price || {};
  const mine = plans[String(p.id)];
  if (mine === "monthly" || mine === "yearly") return mine;
  const iv = p.billing_cycle && p.billing_cycle.interval;
  if (iv === "year") return "yearly";
  if (iv === "month") return "monthly";
  const s = [p.name, p.description].filter(Boolean).join(" ");
  return /\b(?:year(?:ly)?|annual(?:ly)?|12[\s-]*months?)\b/i.test(s) ? "yearly" : /\bmonth(?:ly)?\b/i.test(s) ? "monthly" : "";
}

function paddle({ apiKey, sandbox = false, plans = {}, fetch = globalThis.fetch, base = sandbox ? SANDBOX : LIVE } = {}) {
  if (!apiKey) throw new Error("Paddle needs its API key");
  async function all(path, query = {}) {
    const out = [];
    let url = `${base}/${path}?${new URLSearchParams({ per_page: "200", ...query })}`;
    for (let page = 1; url && page <= PAGES; page++) {
      const r = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) throw new Error(`Paddle ${path}: HTTP ${r.status}`);
      const j = await r.json();
      out.push(...(Array.isArray(j.data) ? j.data : []));
      const next = j.meta && j.meta.pagination && j.meta.pagination.has_more ? j.meta.pagination.next : "";
      url = next && next !== url ? next : "";
    }
    return out;
  }
  let seen = null; // one read of the lists serves both calls
  async function read() {
    if (seen) return seen;
    const [txns, adjustments, subs] = await Promise.all([all("transactions", { include: "customer", status: "completed,billed,paid" }), all("adjustments", { status: "approved" }), all("subscriptions")]);
    seen = { txns, adjustments, subs, subOf: new Map(subs.map((s) => [String(s.id), s])), txnOf: new Map(txns.map((t) => [String(t.id), t])) };
    return seen;
  }
  const who = (t) => { const c = t.customer || {}; return { email: c.email || "", name: c.name || "" }; };
  const ref = (t) => (t.invoice_number ? `invoice ${t.invoice_number}` : `payment ${t.id}`);
  const planOfTxn = (t) => { for (const i of t.items || []) { const p = planOf(i.price, plans); if (p) return p; } return ""; };
  return {
    name: "Paddle",
    async payments() {
      const { txns } = await read(), out = [];
      for (const t of txns) {
        if (t.status !== "completed" && t.status !== "paid") continue; // draft, ready, billed, past_due, canceled: not paid
        const renewal = t.origin === "subscription_recurring";
        out.push({ id: `pd:txn:${t.id}`, kind: renewal ? "renewal" : "order", ...who(t), plan: planOfTxn(t), sub: String(t.subscription_id || ""),
          at: ms((t.billed_at || t.created_at)), test: !!sandbox, ref: renewal ? `renewal ${ref(t)}` : ref(t) });
      }
      return out;
    },
    async reversals() {
      const { adjustments, subs, txnOf } = await read(), out = [];
      for (const a of adjustments) {
        if (a.action !== "refund" && a.action !== "chargeback") continue; // credits and the rest aren't money back
        const t = txnOf.get(String(a.transaction_id)) || {};
        const total = Number((t.details && t.details.totals && t.details.totals.total) || 0), part = Number((a.totals && a.totals.total) || 0);
        out.push({ id: `pd:refund:${a.id}`, kind: "refund", payment: `pd:txn:${a.transaction_id}`, sub: String(a.subscription_id || t.subscription_id || ""), email: who(t).email,
          at: ms(a.created_at), partial: !!(total && part && part < total), test: !!sandbox, ref: ref(t.id ? t : { id: a.transaction_id }) });
      }
      for (const s of subs) {
        if (s.status !== "canceled") continue;
        const t = [...txnOf.values()].find((x) => x.subscription_id === s.id) || {};
        out.push({ id: `pd:cancel:${s.id}`, kind: "cancel", payment: "", sub: String(s.id), email: who(t).email, at: ms(s.canceled_at),
          ends: ms((s.current_billing_period && s.current_billing_period.ends_at) || s.canceled_at), test: !!sandbox, ref: `subscription ${s.id}` });
      }
      return out;
    },
  };
}

export { paddle, planOf };
