// symbiot — Marketing overview: the top of the Marketing page, split by product. Posts
// scheduled (marked posted for a moment still to come), drafts waiting on you, and the
// numbers its agent wrote into the newest weekly report; one line for what is open. All
// read from the lane's own files (drafts, their statuses, .symbiot/*.md, TASKS.md): no
// call to a platform. Where nothing was recorded it says so, never a zero.
import { join, basename } from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { MARKETING_DIR, draftFiles, draftStatuses, parseDraft, productOf } from "./marketing.mjs";

const PLATFORM_NAME = { linkedin: "LinkedIn", x: "X", twitter: "X", instagram: "Instagram", facebook: "Facebook", reddit: "Reddit", blog: "Blog", hackernews: "Hacker News", producthunt: "Product Hunt", devto: "DEV", medium: "Medium", substack: "Substack", threads: "Threads", bluesky: "Bluesky", mastodon: "Mastodon" };
const platformName = (p) => PLATFORM_NAME[String(p || "").toLowerCase()] || String(p || "").replace(/^./, (c) => c.toUpperCase());
const WEEKLY = /how marketing did this week/i;
const num = (s) => { const m = String(s || "").replace(/[,\s]/g, "").match(/^\*{0,2}(\d+)\*{0,2}$/); return m ? +m[1] : null; };
const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.replace(/\*\*/g, "").trim());

// The newest weekly report in the lane: { title, file, mtime } or null. Its title is the report's `# ` line.
function latestWeekly(dir = MARKETING_DIR) {
  const base = join(dir, ".symbiot"); let best = null;
  let names = []; try { names = readdirSync(base).filter((f) => /\.md$/i.test(f)); } catch { return null; }
  for (const name of names) {
    const file = join(base, name); let head = "", mtime = 0;
    try { head = readFileSync(file, "utf8").slice(0, 600); mtime = statSync(file).mtimeMs; } catch { continue; }
    const title = (head.match(/^#\s+(.+?)\s*$/m) || [])[1] || "";
    if (WEEKLY.test(title) && (!best || mtime > best.mtime)) best = { title, file, mtime };
  }
  return best;
}

// The rows of the report's results table that carry numbers: [{ product, title, reach, reactions, clicks }]
// (a number the report has is a number; a cell with words in it, "goes out at 08:00", is none).
function weeklyRows(text) {
  const lines = String(text || "").split("\n"), out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/impressions/i.test(lines[i])) continue;
    const head = cells(lines[i]).map((c) => c.toLowerCase());
    const at = (re) => head.findIndex((h) => re.test(h));
    const col = { title: at(/^post$/), product: at(/^product$/), reach: at(/^impressions$/), reactions: at(/^reactions$/), clicks: at(/click/) };
    for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      const c = cells(lines[j]), get = (k) => (col[k] >= 0 ? num(c[col[k]]) : null);
      const row = { product: col.product >= 0 ? c[col.product].replace(/^[—–-]$/, "") : "", title: col.title >= 0 ? c[col.title] : "", reach: get("reach"), reactions: get("reactions"), clicks: get("clicks") };
      if (row.title && row.reach != null && !/^total$/i.test(c[0])) out.push(row); // not the table's own Total row
    }
    break;
  }
  return out;
}

// What is open for the lane: its `[~]` tasks, one line each, those tagged ([LinkedIn Ads] …): the tag and what it waits on.
function openItems(dir = MARKETING_DIR) {
  let text = ""; try { text = readFileSync(join(dir, ".symbiot", "TASKS.md"), "utf8"); } catch { return []; }
  const out = [];
  for (const l of text.split("\n")) {
    const m = l.match(/^- \[~\]\s*\[([^\]]+)\]\s*(.*)$/); if (!m) continue; // the ones tagged with what they are about
    const w = (m[2].match(/\(waits on:\s*([^()]*(?:\([^)]*\)[^()]*)*)\)/i) || [])[1] || "";
    const say = (w || m[2]).replace(/\s*\(.*$/s, "").replace(/\s+/g, " ").trim().replace(/[.;:]+$/, "");
    if (!say) continue;
    out.push({ tag: m[1] || "", text: (w ? "waiting on " : "") + (say.length > 150 ? say.slice(0, 147).replace(/\s+\S*$/, "") + "…" : say) });
  }
  return out.slice(0, 5);
}

function marketingOverview({ dir = MARKETING_DIR, now = Date.now(), names = [], weekly = latestWeekly(dir) } = {}) {
  const by = new Map(), at = (p) => { p = p || "Other posts"; if (!by.has(p)) by.set(p, { name: p, scheduled: [], waiting: [], numbers: [] }); return by.get(p); };
  const canon = (p) => names.find((n) => n.toLowerCase() === String(p || "").toLowerCase()) || p;
  const fileProduct = (d, rel) => canon(d.product || (rel.split("/")[1] && rel.split("/").length > 2 ? rel.split("/")[1].replace(/^./, (c) => c.toUpperCase()) : ""));
  for (const [rel, s] of Object.entries(draftStatuses(dir))) {
    if (!s || s.status !== "posted" && !s.posted || !(s.posted > now)) continue;
    let d; try { d = parseDraft(readFileSync(join(dir, rel), "utf8")); } catch { continue; }
    if (!d.isPost) continue;
    // an agent's file for the post isn't always headed with its title ("Shipped: approved under Drafts to post"): its first line then
    const title = (d.title && !/approved under/i.test(d.title) ? d.title : d.body.split("\n").find((l) => l.trim()) || basename(rel, ".md").replace(/[-_]+/g, " ")).trim().slice(0, 120);
    const row = { rel, title, platform: platformName(s.postedOn || d.platform), when: s.posted }, list = at(fileProduct(d, rel)).scheduled;
    if (!list.some((x) => x.when === row.when && x.title === row.title && x.platform === row.platform)) list.push(row); // a redraft marked too is one post
  }
  for (const f of draftFiles(dir, names, { max: 200 })) if (!f.doc && !f.status) at(canon(f.product)).waiting.push({ rel: f.rel, title: f.name });
  let report = null;
  if (weekly) {
    let text = ""; try { text = readFileSync(weekly.file, "utf8"); } catch {}
    const result = (text.match(/^\*{0,2}Result:\*{0,2}\s*(.+?)\*{0,2}\s*$/m) || [])[1] || "";
    report = { title: weekly.title, file: weekly.file, result: result.replace(/\*\*/g, "").slice(0, 320) };
    for (const r of weeklyRows(text)) at(canon(r.product) || productOf(r.title, names) || "Other posts").numbers.push({ title: r.title, reach: r.reach, reactions: r.reactions, clicks: r.clicks });
  }
  const products = [...by.values()].filter((p) => p.name !== "Other posts" || p.scheduled.length || p.waiting.length || p.numbers.length).map((p) => {
    p.scheduled.sort((a, b) => a.when - b.when);
    const n = p.numbers, sum = (k) => (n.some((x) => x[k] != null) ? n.reduce((t, x) => t + (x[k] || 0), 0) : null);
    return { ...p, total: n.length ? { reach: sum("reach"), reactions: sum("reactions"), clicks: sum("clicks") } : null };
  }).sort((a, b) => b.scheduled.length + b.waiting.length - (a.scheduled.length + a.waiting.length) || a.name.localeCompare(b.name));
  return { products, open: openItems(dir), report };
}

export { marketingOverview, latestWeekly, weeklyRows, openItems, platformName };
