// symbiot — Peek: what's behind a link, the way a link preview finds out. One
// plain request, nothing more: not signed in (no cookies, not Symbiot's browser),
// no scripts run, nothing downloaded or installed. Redirects are followed and
// each hop is checked again. A page gives its title and description; a file
// (an .apk, a .zip) only its type, name and size, from the headers. A link to
// your own network (your router, localhost) is refused: a message can't make
// Symbiot poke it. For the Dashboard's card chat (watch.mjs boardChat), so
// "what are these links?" gets an answer instead of "I can't open links".
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const TIMEOUT = 8000, MAX_HOPS = 5, MAX_BYTES = 256 * 1024, MAX_LINKS = 6, KEEP = 3600000;
const seen = new Map(); // url -> { at, peek }

// The links in some text: with a scheme, or a bare host with a path
// (mentenaz-server.com/about/…), as chats write them. Trailing punctuation off.
function linksIn(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/\bhttps?:\/\/[^\s<>"']+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"']*/gi)) {
    let u = m[0].replace(/[).,;:!?'"\]]+$/, "");
    if (!/^https?:/i.test(u)) u = "https://" + u;
    try { const x = new URL(u); if (x.hostname.includes(".")) out.push(x.href); } catch {}
  }
  return [...new Set(out)];
}

// Loopback, private, link-local, carrier-grade NAT, unspecified: your own network.
function privateIp(ip) {
  if (isIP(ip) === 4) { const [a, b] = ip.split(".").map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127); }
  const v = ip.toLowerCase(); if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
  return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}
async function publicHost(host, resolve = lookup) {
  const h = host.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(h)) return false;
  if (isIP(h)) return !privateIp(h);
  try { const all = await resolve(h, { all: true }); return all.length > 0 && all.every((a) => !privateIp(a.address)); } catch { return false; }
}

const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, " ").trim();
function meta(html, names) {
  for (const n of names) {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, "i"));
    if (m && m[1].trim()) return decode(m[1]).slice(0, 300);
  }
  return "";
}

// One link: { url, final, status, type, title?, description?, site?, file?, size?, error? }.
async function peek(url, { get = fetch, resolve = lookup } = {}) {
  const hit = seen.get(url); if (hit && Date.now() - hit.at < KEEP) return hit.peek;
  let at = url, r = null, hops = 0;
  const out = { url };
  try {
    for (;;) {
      const u = new URL(at);
      if (!/^https?:$/.test(u.protocol)) return { ...out, error: "not a web link" };
      if (!(await publicHost(u.hostname, resolve))) return { ...out, final: at, error: "points into a private network (refused)" };
      r = await get(at, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT), headers: { "user-agent": "Mozilla/5.0 (link preview; Symbiot)", accept: "text/html,*/*;q=0.5" } });
      const next = r.status >= 300 && r.status < 400 && r.headers.get("location");
      if (!next) break;
      if (++hops > MAX_HOPS) return { ...out, final: at, error: "too many redirects" };
      try { await r.body?.cancel(); } catch {}
      at = new URL(next, at).href;
    }
    const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    Object.assign(out, { final: at, status: r.status, type });
    if (!/html|xml/.test(type)) {
      const cd = r.headers.get("content-disposition") || "", name = (cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i) || [])[1] || decodeURIComponent(new URL(at).pathname.split("/").pop() || "");
      const size = +r.headers.get("content-length") || 0;
      try { await r.body?.cancel(); } catch {} // a file: the headers say enough, nothing is downloaded
      Object.assign(out, { file: true, ...(name ? { name: name.slice(0, 120) } : {}), ...(size ? { size } : {}) });
    } else {
      let html = "", n = 0; const rd = r.body.getReader(), td = new TextDecoder();
      while (n < MAX_BYTES) { const { done, value } = await rd.read(); if (done) break; n += value.length; html += td.decode(value, { stream: true }); }
      try { await rd.cancel(); } catch {}
      const title = meta(html, ["og:title", "twitter:title"]) || decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).slice(0, 200);
      const description = meta(html, ["og:description", "description", "twitter:description"]), site = meta(html, ["og:site_name"]);
      Object.assign(out, title ? { title } : {}, description ? { description } : {}, site ? { site } : {});
    }
  } catch (e) { Object.assign(out, { final: out.final || at, error: e && e.name === "TimeoutError" ? "didn't answer in time" : String((e && e.message) || e).slice(0, 120) }); }
  seen.set(url, { at: Date.now(), peek: out });
  return out;
}
async function peekLinks(urls, opts) { return Promise.all([...new Set(urls)].slice(0, MAX_LINKS).map((u) => peek(u, opts))); }

// One line per link, for the chat's prompt.
function peekLine(p) {
  const host = (u) => { try { return new URL(u).hostname; } catch { return u; } };
  const moved = p.final && p.final !== p.url ? ` → goes to ${p.final}` : "";
  if (p.error) return `- ${p.url}${moved}: couldn't look (${p.error})`;
  if (p.file) return `- ${p.url}${moved}: a file download, not a page (${p.type || "unknown type"}${p.name ? `, ${p.name}` : ""}${p.size ? `, ${Math.round(p.size / 1024)} KB` : ""}); not downloaded`;
  return `- ${p.url}${moved}: ${p.status && p.status >= 400 ? `HTTP ${p.status}, ` : ""}${p.site || host(p.final || p.url)}${p.title ? ` · "${p.title}"` : ""}${p.description ? ` · ${p.description}` : ""}${!p.title && !p.description ? " · a page with no title or description" : ""}`;
}

export { linksIn, privateIp, publicHost, peek, peekLinks, peekLine, MAX_LINKS };
