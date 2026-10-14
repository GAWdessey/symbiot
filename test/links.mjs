// Links (links.mjs): one button per standard work site. Linking trusts the
// site, watches its page and opens it to sign in; unlinking undoes only what the
// link did. Runs in an isolated HOME (set before the modules load, since they
// read the config folder then), and never opens a browser: sign-in and reads
// are stand-ins.
//
//   node test/links.mjs
//
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-links-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; delete process.env.SYMBIOT_LINKS;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { catalog, linksState, linkSite, checkLink, checkSignIns, settleSignIns, sitesCheck, unlinkSite, addSite, ownSites, signInAsked } = await import("../links.mjs");
const { trustedSites, trustSite } = await import("../headless.mjs");
const { arrivedOn } = await import("../writeups.mjs");
const watchFile = join(CFG, "watch.json");
const watchJson = () => JSON.parse(readFileSync(watchFile, "utf8"));
const item = (id) => linksState().items.find((x) => x.id === id);
const opened = [];
const open = async (url) => { opened.push(url); return { ok: true, url }; };

try {
  console.log("CATALOG — the standard sites, and a company's own");
  const c0 = catalog();
  ok("standard sites are there for everyone: mail, calendar, code, chat, work, docs", ["gmail", "outlook", "gcal", "github", "slack", "teams", "jira", "gdrive"].every((id) => c0.list.some((x) => x.id === id)) && !c0.error, c0.list.map((x) => x.id));
  writeFileSync(join(CFG, "links.json"), JSON.stringify({ links: [{ id: "jira", name: "Jira (Acme)", url: "acme.atlassian.net/jira/your-work", watch: true }, { name: "Acme CRM", url: "https://crm.acme.example/inbox", hosts: ["sso.acme.example"] }], hide: ["whatsapp"] }));
  const c1 = catalog(), jira = c1.list.find((x) => x.id === "jira"), crm = c1.list.find((x) => x.company && x.name === "Acme CRM");
  ok("links.json: a company's entry replaces the built-in with its id", jira && jira.url === "https://acme.atlassian.net/jira/your-work" && jira.hosts.includes("acme.atlassian.net") && jira.company, jira);
  ok("links.json: adds the company's own site (group Company), hosts tidied", crm && crm.group === "Company" && crm.hosts.join() === "crm.acme.example,sso.acme.example" && crm.id === "crm.acme.example".replace(/\./g, "-"), crm);
  ok("links.json: hide drops a site nobody there uses", !c1.list.some((x) => x.id === "whatsapp"), "");
  writeFileSync(join(CFG, "links.json"), "{ not json");
  const c2 = catalog();
  ok("a broken links.json is skipped and said so; the standard sites stay", /isn't valid JSON/.test(c2.error) && c2.list.some((x) => x.id === "whatsapp"), c2.error);
  rmSync(join(CFG, "links.json"));

  console.log("LINK — one click: trust, watch, open to sign in");
  ok("nothing linked yet", linksState().linked === 0 && item("gmail").state === "off", linksState().linked);
  const g = await linkSite("gmail", { open });
  const gw = watchJson().watches.find((w) => w.url.startsWith("https://mail.google.com/"));
  ok("opens the site to sign in", g.ok && opened[0] === "https://mail.google.com/mail/u/0/#inbox", [g, opened]);
  ok("trusts its domain and watches its inbox", trustedSites().includes("mail.google.com") && gw && gw.name === "Gmail", [trustedSites(), gw]);
  ok("waits for you to sign in", item("gmail").state === "signin" && linksState().linked === 1, item("gmail"));
  const d = watchJson(); d.watches[0].error = "Signed out of accounts.google.com. Under Screens…"; writeFileSync(watchFile, JSON.stringify(d));
  ok("a read before you've signed in is still 'sign in', not 'signed out'", item("gmail").state === "signin", item("gmail"));
  const d2 = watchJson(); delete d2.watches[0].error; d2.watches[0].checked = Date.now(); writeFileSync(watchFile, JSON.stringify(d2));
  ok("read signed in -> linked", item("gmail").state === "ok", item("gmail"));
  const d3 = watchJson(); d3.watches[0].error = "Signed out of accounts.google.com. Under Screens…"; writeFileSync(watchFile, JSON.stringify(d3));
  ok("signed out after being linked -> signed out", item("gmail").state === "signedout", item("gmail"));
  const again = await linkSite("gmail", { open });
  ok("clicking it again opens it to sign in, with no second watch", again.ok && opened.length === 2 && watchJson().watches.length === 1, watchJson().watches.length);

  console.log("UNLINK — undoes only what the link did");
  trustSite("github.com");
  await linkSite("github", { open });
  ok("GitHub watches its notifications", watchJson().watches.some((w) => w.url === "https://github.com/notifications"), watchJson().watches.map((w) => w.url));
  unlinkSite("github");
  ok("a site you'd trusted yourself stays trusted after unlinking", trustedSites().includes("github.com") && !watchJson().watches.some((w) => w.url === "https://github.com/notifications"), trustedSites());
  await linkSite("outlook", { open }); await linkSite("outlookcal", { open });
  unlinkSite("outlook");
  ok("a domain another link still uses stays trusted", trustedSites().includes("outlook.office.com") && !trustedSites().includes("outlook.live.com") && item("outlookcal").state === "signin", trustedSites());
  unlinkSite("outlookcal");
  ok("…and goes when the last link using it does", !trustedSites().includes("outlook.office.com") && !trustedSites().includes("outlook.office365.com"), trustedSites());
  const u = unlinkSite("gmail");
  ok("unlink stops watching and stops trusting", u.ok && !trustedSites().includes("mail.google.com") && !watchJson().watches.some((w) => w.name === "Gmail") && item("gmail").state === "off", trustedSites());
  ok("unlinking what isn't linked says so", /isn't linked/.test(unlinkSite("gmail").error || ""), "");
  ok("an unknown id isn't linked, and nothing opens", /No link called/.test((await linkSite("nope", { open })).error || "") && opened.length === 5, opened.length);

  console.log("ALL — every standard site can be linked at once (the watch limit leaves room)");
  const { CATALOG } = await import("../links.mjs");
  const { addWatch, removeWatch } = await import("../watch.mjs");
  const own = addWatch({ site: "https://intranet.acme.example/news", name: "Intranet" }); // one of your own, so 13 > the old limit of 12
  const all = await Promise.all(CATALOG.map((e) => linkSite(e.id, { open })));
  ok(`all ${CATALOG.length} link, ${CATALOG.filter((e) => e.watch).length} of them watched`, all.every((r) => r.ok) && watchJson().watches.length === CATALOG.filter((e) => e.watch).length + 1, all.filter((r) => !r.ok));
  for (const e of CATALOG) unlinkSite(e.id); removeWatch(own.id);
  ok("…and all unlink, leaving nothing watched or trusted", watchJson().watches.length === 0 && trustedSites().join() === "github.com", [watchJson().watches.length, trustedSites()]);

  console.log("CHECK — a site that isn't watched is checked by reading it");
  await linkSite("notion", { open });
  const n0 = item("notion"), n1 = (await checkLink("notion", { read: async () => ({ url: "https://www.notion.so/login", login: true }) })).item, n2 = (await checkLink("notion", { read: async () => ({ url: "https://www.notion.so/acme" }) })).item;
  ok("not watched: 'sign in' until a read finds it signed in", n0.state === "signin" && n1.state === "signin" && n2.state === "ok", [n0.state, n1.state, n2.state]);
  ok("a busy browser (sign-in window open) is said so, not counted", (await checkLink("notion", { read: async () => ({ busy: true }) })).busy === true && item("notion").state === "ok", "");

  console.log("ANY SITE — added in Settings → Connections or the Symbiot Browser, opened to sign in (domains.co.za, 2026-10-09)");
  {
    const openC = async (url) => { opened.push(url); return { ok: true, url }; };
    const r = await addSite("www.domains.co.za/client/dashboard", { open: openC });
    const it = item("site-domains-co-za");
    ok("Add a site: under Your sites, linked, waiting for you to sign in, at the page you gave", r.ok && it && it.group === "Your sites" && it.own && it.state === "signin" && it.url === "https://www.domains.co.za/client/dashboard" && opened[opened.length - 1] === it.url, [r, it]);
    ok("…and trusted (Press and Type go ahead there), www. or not", trustedSites().includes("domains.co.za"), trustedSites());
    const s1 = (await checkLink("site-domains-co-za", { read: async (u, o) => ({ url: "https://www.domains.co.za/login/dashboard", login: !!(o && o.password) }) })).item;
    const s2 = (await checkLink("site-domains-co-za", { read: async () => ({ url: "https://www.domains.co.za/client/dashboard", title: "Welcome Garth" }) })).item;
    ok("checked: still 'sign in' on its login page (or one asking for a password), 'linked' once it shows the dashboard", s1.state === "signin" && s2.state === "ok", [s1.state, s2.state]);
    await addSite("domains.co.za", { open: openC });
    ok("added again by its bare name: still one, keeping the page you gave first", ownSites().length === 1 && item("site-domains-co-za").url === "https://www.domains.co.za/client/dashboard", ownSites());
    const li = await addSite("https://www.linkedin.com/feed/", { open: openC });
    ok("a site that's one of the buttons (linkedin.com) links that button, not a copy", li.ok && li.item && li.item.id === "linkedin" && !ownSites().some((x) => /linkedin/.test(x.id)), li.item);
    ok("not a site: refused, nothing opened", !!(await addSite("two words", { open: openC })).error && !!(await addSite("", { open: openC })).error, "");
    console.log("THE SYMBIOT BROWSER CLOSES (Done, or its X) — each site is checked, and what that settles is answered (reddit, 2026-10-12)");
    await addSite("www.reddit.com", { open: openC });
    ok("a site added and not read yet waits for you to sign in", item("site-reddit-com") && item("site-reddit-com").state === "signin", item("site-reddit-com"));
    const shown = await checkLink("site-reddit-com", { read: async () => ({ error: "The Symbiot Browser is open: Symbiot reads your sites once you click Done in it." }) });
    ok("read while the window's still open: busy, not 'not signed in'", shown.busy === true && item("site-reddit-com").state === "signin", shown);
    let n = 0; const seen = [];
    const check = async (id) => { seen.push(id); if (id === "site-reddit-com" && n++ === 0) return { busy: true }; return checkLink(id, { read: async () => ({ url: "https://www.reddit.com/", title: "Reddit" }) }); };
    const got = await checkSignIns({ check, wait: 10 });
    ok("every site not signed in is read, and one the browser couldn't take yet is read again", seen.filter((x) => x === "site-reddit-com").length === 2 && seen.includes("site-domains-co-za") && got.some((x) => x.id === "site-reddit-com"), [seen, got.map((x) => x.id)]);
    ok("…and reads signed in", item("site-reddit-com").state === "ok", item("site-reddit-com"));
    ok("a signed-in site isn't read again", (seen.length = 0, await checkSignIns({ check, wait: 10 }), !seen.includes("site-reddit-com")), seen);
    const Q = { q: "Reddit isn't signed in yet: sign in, then click Done in the Symbiot Browser?", options: ["👤 You (only you: signing in to Reddit): sign in to www.reddit.com in the Symbiot Browser (Settings → Connections → Add a site), then click Done (recommended)", "🤖 Agent: skip Reddit, and draft the clip as a LinkedIn post instead"] };
    const other = { q: "Post 4 on LinkedIn on Tuesday?", options: ["🤖 Agent: yes (recommended)", "🤖 Agent: wait"] }, gm = { q: "Sign in to gmail.com again?", options: [] };
    const answered = [];
    const ask = (path) => ({ questions: path === "/m" ? [Q, other] : path === "/o" ? [gm] : [] });
    const answer = (path, rows, o) => { answered.push({ path, rows, o }); return { ok: true, saved: rows.length }; };
    const res = settleSignIns([item("site-reddit-com")], { paths: ["/m", "/o", "/x"], ask, answer });
    ok("the question asking you to sign in to it is answered for you, and its agent carries on", res.length === 1 && res[0].path === "/m" && answered.length === 1 && answered[0].rows[0].q === Q.q && /^Done: you're signed in to reddit\.com/.test(answered[0].rows[0].a) && answered[0].o.rerun === true, answered);
    ok("…not one about something else, or another site", !answered.some((x) => x.rows.some((r) => r.q === other.q || r.q === gm.q)), answered);
    ok("nothing signed in: nothing answered", settleSignIns([], { paths: ["/m"], ask, answer }).length === 0 && answered.length === 1, answered.length);
    let calls = 0; const slow = async () => { calls++; await new Promise((r) => setTimeout(r, 30)); return []; };
    const [a1, a2] = await Promise.all([sitesCheck({ check: slow, settle: () => [], after: 0 }), sitesCheck({ check: slow, settle: () => [], after: 0 })]);
    ok("Done and the window closing because of it are checked once", calls === 1 && a1 === a2, calls);
    unlinkSite("site-reddit-com");
    unlinkSite("site-domains-co-za");
    ok("unlinked: it leaves Your sites, and isn't trusted any more", !item("site-domains-co-za") && !ownSites().length && !trustedSites().includes("domains.co.za"), [ownSites(), trustedSites()]);
    unlinkSite("linkedin");
  }

  console.log("SIGNED IN BY ITS COOKIE — x.com was asked for four times while its auth_token sat in the profile (2026-10-10)");
  {
    const openC = async (url) => ({ ok: true, url });
    await addSite("x.com", { open: openC });
    let reads = 0;
    const r1 = (await checkLink("site-x-com", { cookie: () => ({ host: "x.com", cookie: "auth_token", found: true }), read: async () => { reads++; throw new Error("The Symbiot Browser is open: Symbiot reads your sites once you click Done in it."); } })).item;
    ok("its session cookie in the profile: signed in, without loading the page", r1.state === "ok" && reads === 0, [r1, reads]);
    const r2 = (await checkLink("site-x-com", { cookie: () => ({ host: "x.com", cookie: "auth_token", found: false }), read: async () => ({ error: "Timed out" }) })).item;
    ok("no cookie yet and the page didn't load: says what it found, not just 'sign in'", r2.state === "signin" && /No session cookie \(auth_token\) for x\.com yet/.test(r2.note || ""), r2);
    const r3 = (await checkLink("site-x-com", { cookie: () => ({ host: "x.com", cookie: "auth_token", found: false }), read: async () => ({ login: true }) })).item;
    ok("no cookie and its sign-in page: that, and only then, says sign in again", r3.state === "signin" && /showed its sign-in page.*sign in there again/.test(r3.note || ""), r3);
    const r4 = (await checkLink("site-x-com", { cookie: () => null, read: async () => { throw new Error("Symbiot's browser is busy"); } })).item;
    ok("a check that couldn't run isn't a sign-out", r4.state === "signin" && /That isn't a sign-out/.test(r4.note || ""), r4);
    const r5 = (await checkLink("site-x-com", { cookie: () => ({ host: "x.com", cookie: "auth_token", found: true }) })).item;
    ok("…and the note goes once it's signed in", r5.state === "ok" && !r5.note, r5);
    unlinkSite("site-x-com");
  }

  console.log("ASKED TO SIGN IN — a card or reply that asks it carries the site, for its Sign in button");
  {
    const zoho = signInAsked("👤 You (only you: a new account): sign up for Zoho Mail's free plan as Symbiot and sign in to domains.co.za in Symbiot's browser");
    ok("an agent's 👤 step: sign in to domains.co.za", zoho && zoho.site === "domains.co.za" && zoho.name === "domains.co.za", zoho);
    const page = signInAsked("Log in at https://www.domains.co.za/client/dashboard, then say done.");
    ok("…a full address keeps its page", page && page.site === "www.domains.co.za/client/dashboard" && page.name === "domains.co.za", page);
    const named = signInAsked("The session expired when it tried to post: sign in again to LinkedIn.");
    ok("…one of the buttons by its name (LinkedIn)", named && named.id === "linkedin" && named.name === "LinkedIn", named);
    ok("…and nothing when it doesn't ask you to sign in to a site", ["Approve the release?", "Sign in to your Claude account", "edit .symbiot/QUESTIONS.md", "Symbiot's browser is signed in to the sites the user linked"].every((t) => signInAsked(t) === null), "");
  }

  console.log("SIGN IN BUTTON — clicking a card's 'Sign in to <site>' opens the Symbiot Browser on it");
  {
    // the page's own code (ui.mjs), with a stand-in for the card's DOM and the app's api: the
    // lane block's ask card ("Agent runs asks") drew the button but was wired without its site,
    // so a click did nothing at all (2026-10-14)
    const { EMBEDDED_UI } = await import("../ui.mjs");
    const js = [...EMBEDDED_UI.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
    const grab = (name) => { const i = js.indexOf("function " + name + "("); let depth = 0, j = js.indexOf("{", i); for (; j < js.length; j++) { if (js[j] === "{") depth++; else if (js[j] === "}" && --depth === 0) break; } return js.slice(i, j + 1); };
    const calls = [], said = [];
    const btn = () => ({ disabled: false, on: {}, addEventListener(t, f) { this.on[t] = f; }, classList: { add() {}, remove() {}, toggle() {} } });
    const box = () => { const b = btn(); return { bsign: b, querySelector: (s) => (s === ".bsign" ? b : null), querySelectorAll: () => [] }; };
    const F = new Function("api", "lqSaid", "localStorage", ["var BLOBBUSY={},BLOBSENT={};", "function loadLinks(){}function loadTrusted(){}", ...["bdKey", "bdAll", "bdGet", "signInSaid", "openSignIn", "wireBlob", "rlAsk"].map(grab)].join("\n") + "\nreturn { wireBlob, rlAsk, openSignIn };")(
      (path, body) => { calls.push({ path, body }); return Promise.resolve({ ok: true, item: { name: "outlook.live.com" } }); },
      (t, bad) => said.push({ t, bad }), { getItem: () => null, setItem() {} });
    const q = "Outlook is signed out, can you sign back in so I can add Jono to the 11:00 meeting?";
    const s = signInAsked("👤 You (only you: your Microsoft sign-in): sign in to outlook.live.com in the Symbiot Browser (Settings → Connections → Add a site), then tell me it's done");
    const p = { repo: "agents", qs: [{ q, options: ["Skip Jono (Jurgen only)"], path: "/x/.symbiot/QUESTIONS.md", signInTo: s }] };
    const y = F.rlAsk(p, "Agent runs", p.qs[0]), b = box();
    ok("the lane block's ask card carries the site it asks you to sign in to", y.signInTo && y.signInTo.site === "outlook.live.com", y);
    F.wireBlob(b, y, {});
    b.bsign.on.click();
    await new Promise((r) => setTimeout(r, 0));
    ok("…and its button opens it: /api/links/site with outlook.live.com", calls.length === 1 && calls[0].path === "/api/links/site" && calls[0].body.site === "outlook.live.com", calls);
    ok("…says it opened, and the button works again", said.some((x) => /Opened the Symbiot Browser with outlook\.live\.com/.test(x.t)) && !b.bsign.disabled, said);
    ok("every place that draws a card wires the same object it drew (nothing drawn left unwired)", !/wireBlob\(ab,\{/.test(js) && /blobBody\(rlAsk\(p,nm,q\),false\)/.test(js) && /wireBlob\(ab,rlAsk\(p,nm,q\)/.test(js), "");
    const b2 = box(); said.length = 0; calls.length = 0;
    F.wireBlob(b2, { kind: "ask", q, signInTo: {} }, {});
    b2.bsign.on.click();
    ok("a button with no site says so, rather than doing nothing", !calls.length && said.length === 1 && said[0].bad && !b2.bsign.disabled, said);
  }

  console.log("WEEK — what arrived on linked sites reaches the write-up");
  const now = Date.now(), day = 86400000;
  writeFileSync(watchFile, JSON.stringify({ watches: [], briefs: [], news: [
    { id: "1", watch: "a", name: "Gmail", ts: now - day, text: "Invoice from Acme" },
    { id: "2", watch: "a", name: "Gmail", ts: now - 2 * day, text: "Re: Q4 plan" },
    { id: "3", watch: "b", name: "Jira", ts: now - 3 * day, text: "ACME-12 assigned to you" },
    { id: "4", watch: "a", name: "Gmail", ts: now - 9 * day, text: "too old" },
  ] }));
  const a = arrivedOn(7, now);
  ok("grouped per site, busiest first, only within the week", a.length === 2 && a[0].name === "Gmail" && a[0].count === 2 && a[1].name === "Jira" && !a[0].items.includes("too old"), a);
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} links: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
