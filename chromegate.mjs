// symbiot — the gate on an agent acting in the user's own Chrome (Claude in Chrome's tools that
// click, type and fill: review of 20 Oct 2026, proposal 1). The membrane's hook (guard.mjs) asks it
// before every Chrome tool call:
// - reading (tabs, navigate, read_page, find, get_page_text, a screenshot) goes ahead anywhere;
// - acting (computer clicks, typing, keys, form_input, file_upload) only on a site the user switched
//   "act" on for (config.chromeAct, a list of hosts; none by default: Settings → Connections), or
//   every site ("*" in that list: the user asked not to be asked per site, 22 Oct 2026);
// - and there, an action that says it sends, posts, pays or deletes (its action_summary, sends.mjs
//   heldFor, the same rule as Symbiot's own browser) is held until the user's Go on a card: the agent
//   is told to ask, with the hold's id; Go (agents.mjs answerQuestions) lets that one action through,
//   once, within GO_FOR.
// - Enter or Return pressed (ctrl/cmd+Enter too, or typed text with a line break) is held as a send:
//   in a chat or message box it sends, whatever the action says it does.
// Which site a tab is on is what its last navigate said (TABS), per run, and then what each Chrome
// tool's result says the tab is on now (seen, from the hook after the call: every result ends with
// the tabs' addresses). An action on a tab whose site isn't known yet is refused until it's navigated,
// so nothing acts on a site no one named; and after a click or an Enter (either can take the tab to
// another site) the tab's site is unknown again until a result says where it is.
// What stands in the way on a site isn't always a sign-in: a run that was refused here (acting off)
// had the user sign LinkedIn in again while LinkedIn's feed was open signed in in two of its tab
// groups (21 Oct 2026). So the gate notes, per site, when it refused acting there (off) and when a
// run's tab was last on it signed in (in) or on its sign-in page (out) (SITES): a question asking
// to sign in there becomes the switch it really needs, or isn't asked (signInNotNeeded).
import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { heldFor, addsPayment } from "./sends.mjs";

const PREFIX = "mcp__claude-in-chrome__";
const READS = new Set(["tabs_context_mcp", "tabs_create_mcp", "tabs_close_mcp", "navigate", "get_page_text", "read_page", "find", "read_console_messages", "read_network_requests", "gif_creator", "resize_window", "list_connected_browsers", "select_browser", "switch_browser", "shortcuts_list"]);
const ACTS = new Set(["computer", "form_input", "file_upload", "upload_image", "javascript_tool", "shortcuts_execute", "browser_batch"]);
const LOOKS = new Set(["screenshot", "zoom", "wait", "scroll", "scroll_to", "hover"]); // computer actions that only look
const GO_FOR = 30 * 60000;
const MOVES = new Set(["left_click", "right_click", "double_click", "triple_click", "middle_click", "left_click_drag"]); // a click may follow a link
const enterIn = (input) => { const a = String(input.action || ""), t = String(input.text || ""); return (a === "key" && t.split(/\s+/).some((k) => /(^|\+)(return|enter|kp_enter)$/i.test(k))) || (a === "type" && /[\r\n]/.test(t)); };
const dir = (home = homedir()) => join(home, ".config", "symbiot");
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
const writeJson = (f, v) => { try { mkdirSync(join(f, ".."), { recursive: true, mode: 0o700 }); const t = `${f}.${process.pid}.tmp`; writeFileSync(t, JSON.stringify(v), { mode: 0o600 }); renameSync(t, f); } catch {} };
const hostOf = (u) => { try { return new URL(/^[a-z]+:\/\//i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
// The sites the user lets agents act on in their Chrome (a host covers its subdomains).
function actSites(home = homedir()) { const a = readJson(join(dir(home), "config.json"), {}).chromeAct; return Array.isArray(a) ? a.map((h) => (h === "*" ? "*" : hostOf(h))).filter(Boolean) : []; }
const covered = (host, sites) => !!host && sites.some((s) => s === "*" || host === s || host.endsWith("." + s));
// Every site at once ("*"), on or off: what the user switched on for one site stays as it was.
function setActAll(on, { load, save }) {
  const cfg = load(), list = new Set(Array.isArray(cfg.chromeAct) ? cfg.chromeAct.filter(Boolean) : []); if (on) list.add("*"); else list.delete("*");
  cfg.chromeAct = [...list]; save(cfg); return { ok: true, all: !!on, sites: cfg.chromeAct };
}
const TABS = (home) => join(dir(home), "chrome-tabs.json"), HOLDS = (home) => join(dir(home), "chrome-holds.json"), SITES = (home) => join(dir(home), "chrome-sites.json");
const DAY = 86400000, SIGNED_FOR = 12 * 3600000;
const LOGIN_PATH = /\/(?:login|log-in|signin|sign-in|uas\/login|authwall|checkpoint|session[-_]?expired)(?:[/?#._-]|$)/i, LOGIN_TITLE = /\b(?:log ?in|sign ?in|session expired)\b/i;
// The setting that lets agents act on a site in the user's Chrome, as the user finds it, and the card that asks for it.
const SETTING = (host) => `Settings → Connections, the Reads button on ${host}'s row (pressed, it says Acts), or for every site at once the switch at the top, "Agents may click and type on any site in your Chrome"`;
const actAsk = (host) => ({ q: `Should agents click and type on ${host} in your Chrome? {#chrome-act-${host}}`, option: `🤖 Agent: switch it on for ${host}` });
function noteSite(host, field, now, home) { if (!host) return; const all = readJson(SITES(home), {}); all[host] = { ...(all[host] || {}), [field]: now }; writeJson(SITES(home), all); }
const key = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9@.]+/g, " ").trim();

// judge(tool, input, { session, home, now }) → null (go ahead) or { why } (refused, and why).
function judgeChrome(tool, input = {}, { session = "", home = homedir(), now = Date.now() } = {}) {
  const t = String(tool || ""); if (!t.startsWith(PREFIX)) return null;
  const name = t.slice(PREFIX.length), tab = String(input.tabId ?? "");
  if (name === "navigate") { // remember the site this tab is on, for what acts on it next (back or forward: somewhere unknown till its result says)
    if (tab) { const all = readJson(TABS(home), {}), k = `${session}:${tab}`, hist = /^(back|forward)$/i.test(String(input.url || "").trim()), host = hist ? (all[k] || {}).host || "" : hostOf(input.url); if (host) { all[k] = { host, at: now, ...(hist ? { moved: now } : {}) }; for (const [x, v] of Object.entries(all)) if (now - (v.at || 0) > 86400000) delete all[x]; writeJson(TABS(home), all); } }
    return null;
  }
  if (READS.has(name) || (name === "computer" && LOOKS.has(String(input.action || "")))) return null;
  if (!ACTS.has(name) && name !== "computer") return null; // a tool not known here: the run's own permissions decide
  if (["javascript_tool", "browser_batch", "shortcuts_execute"].includes(name)) return { why: "running scripts or batches in the user's own Chrome isn't allowed: click, type or fill one step at a time, each saying what it does" };
  const tabs = readJson(TABS(home), {}), k = `${session}:${tab}`, at = tabs[k] || {}, host = at.host || "";
  if (!host) return { why: "Symbiot doesn't know which site this tab is on: open it with navigate first, in this run, then act" };
  if (at.moved) return { why: `this tab may have left ${host} since the last click or Enter: see where it is now (tabs_context_mcp) or navigate, then act` };
  // through: a click or an Enter may take the tab elsewhere, so its site is unknown until the result says where it is (seen)
  const go = () => { if ((name === "computer" && MOVES.has(String(input.action || ""))) || (name === "computer" && enterIn(input))) { tabs[k] = { ...at, moved: now }; writeJson(TABS(home), tabs); } return null; };
  const sites = actSites(home);
  if (!covered(host, sites)) {
    noteSite(host, "off", now, home); const a = actAsk(host);
    return { why: `acting on ${host} in the user's own Chrome is switched off (reading is fine). That's Symbiot's setting, not a sign-in: don't ask the user to sign in for it, or say the site is signed out. The setting is ${SETTING(host)}. Ask in .symbiot/QUESTIONS.md: the heading "### ${a.q}", a line saying what for, and one option, "${a.option}". Their yes switches it on, and the same action then goes through. Or do it through Symbiot's own browser (symbiot screens); if that one is signed out there, ask for this switch, not a sign-in`, setting: true };
  }
  // a retry after the user's Go names the hold it was given for ("[go:1a2b3c4d] …"), so it goes through
  // even when its wording moved a little; the tag isn't part of what the action says it does
  const tagged = (String(input.action_summary || "").match(/\[go:([0-9a-f]{6,})\]/i) || [])[1] || "", summary = String(input.action_summary || "").replace(/\s*\[go:[0-9a-f]+\]\s*/gi, " ").trim();
  if (!summary) return { why: "say what this action does (action_summary) on every click, key, type and fill in the user's own Chrome: the membrane holds sends, payments and deletes for the user's Go" };
  const kind = name === "computer" && enterIn(input) ? "send" : heldFor(summary, host); if (!kind) return go();
  // held: let it through once if the user said Go to this very action; else hold it and say how to ask
  const holds = readJson(HOLDS(home), []), live = (h) => h.go && !h.used && now - h.go < GO_FOR;
  const mine = (tagged && holds.find((h) => h.id === tagged && h.host === host && live(h))) || holds.find((h) => h.host === host && key(h.summary) === key(summary) && live(h));
  if (mine) { mine.used = now; writeJson(HOLDS(home), holds); return go(); }
  let h = holds.find((x) => x.host === host && key(x.summary) === key(summary) && !x.go && now - x.at < 86400000);
  if (!h) { h = { id: randomBytes(4).toString("hex"), host, summary: summary.slice(0, 200), kind, at: now, session }; holds.push(h); writeJson(HOLDS(home), holds.slice(-200)); }
  const word = { send: "sends", pay: "pays", delete: "deletes" }[kind];
  return { why: `this ${word} as the user, on ${host} ("${h.summary}"), so it waits for their Go. Ask in .symbiot/QUESTIONS.md: a ### heading saying plainly what it ${word}, ending {#chrome-go-${h.id}}, ${kind === "pay" && addsPayment(h.summary) ? "a context line saying first that the site may hold or charge money on the card once it's added, with roughly how much if known, " : ""}and one option, "🤖 Agent: go ahead: ${h.summary}". Stop there; once they say Go, the same action goes through, once: when you retry it, start its action_summary with [go:${h.id}]`, held: h.id };
}
// A connector that sends as the user (mail's send, reply and forward, a calendar invite or reply, a
// shared file): held for their Go like a send in their Chrome, on the same kind of card. The guard
// never saw these, and a guide went out by email to someone the user's rule said hears nothing before
// the user has seen it on WhatsApp (23 Oct 2026). A standing rule that names who it goes to is on the card.
const CONNECTOR_SENDS = /^mcp__.+?__(send_message|send_email|send_draft|reply|reply_all|forward|share_file|respond_to_event|create_event|update_event)$/;
const SAYS = { send_message: "Sends", send_email: "Sends", send_draft: "Sends", reply: "Replies", reply_all: "Replies to all", forward: "Forwards", share_file: "Shares", respond_to_event: "Answers the invite", create_event: "Invites", update_event: "Updates the invite" };
const RECIPIENT = /^(?:to|cc|bcc|recipients?|emails?|email_?address|attendees?|guests?|people|addresses|share_?with|role_?email)$/i;
function recipients(input) {
  const out = new Set();
  // a value under a recipients' key, or inside one ({ attendees: [{ email }] }): each address or name
  const walk = (v, k = "", d = 0) => {
    if (d > 4 || out.size > 20) return;
    if (typeof v === "string") { if (RECIPIENT.test(k)) for (const x of v.split(/[,;]\s*/)) if (x.trim()) out.add(x.trim().slice(0, 80)); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, k, d + 1); return; }
    if (v && typeof v === "object") for (const [kk, x] of Object.entries(v)) walk(x, RECIPIENT.test(kk) || !RECIPIENT.test(k) ? kk : /^(?:email|address|value)$/i.test(kk) ? k : "", d + 1);
  };
  walk(input); return [...out];
}
function judgeConnector(tool, input = {}, { session = "", home = homedir(), now = Date.now() } = {}) {
  const m = String(tool || "").match(CONNECTOR_SENDS); if (!m) return null;
  const op = m[1], to = recipients(input || {});
  if (/^(?:create|update)_event$/.test(op) && !to.length) return null; // no guests: nothing goes to anyone
  const service = String(tool).slice(5, String(tool).length - op.length - 2).replace(/^claude_ai_/, "").replace(/_/g, " ");
  const subject = String((input && (input.subject || input.summary || input.title || input.name)) || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const summary = `${SAYS[op]}${subject ? ` "${subject}"` : ""}${to.length ? ` to ${to.slice(0, 4).join(", ")}${to.length > 4 ? ` and ${to.length - 4} more` : ""}` : ""} through ${service}`.slice(0, 200), host = "connector:" + service;
  const holds = readJson(HOLDS(home), []), live = (h) => h.go && !h.used && now - h.go < GO_FOR;
  const mine = holds.find((h) => h.host === host && key(h.summary) === key(summary) && live(h));
  if (mine) { mine.used = now; writeJson(HOLDS(home), holds); return null; }
  let h = holds.find((x) => x.host === host && key(x.summary) === key(summary) && !x.go && now - x.at < 86400000);
  if (!h) { h = { id: randomBytes(4).toString("hex"), host, summary, kind: "send", at: now, session }; holds.push(h); writeJson(HOLDS(home), holds.slice(-200)); }
  // the user's standing rules that name who it goes to (their address, or a name in it)
  const names = new Set(to.flatMap((x) => [x.toLowerCase(), ...x.toLowerCase().split(/[@.+_\s-]+/).filter((w) => /^[a-z]{4,}$/.test(w) && !/^(gmail|outlook|yahoo|hotmail|mail|info|team|hello|support|com)$/.test(w))]));
  // …or a name in a rule that's part of the address ("Alex" in jsmithalex@…): not a word that starts a sentence
  const locals = to.map((x) => ((x.match(/([\w.+-]+)@/) || [])[1] || "").toLowerCase()).filter(Boolean);
  const named = (r) => [...r.matchAll(/(?<![.!?]\s|^)\b([A-Z][a-z]{3,})\b/g)].some((w) => locals.some((l) => l.includes(w[1].toLowerCase())));
  const rules = (readJson(join(dir(home), "standing.json"), []) || []).map((r) => String((r && r.rule) || "")).filter((r) => r && ([...names].some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(r)) || named(r)));
  return { held: h.id, why: `this sends as the user ("${h.summary}"), so it waits for their Go, as a send in their Chrome does.${rules.length ? ` Their own rule for this: "${rules.join('" "')}" Do what it says first (a proof where it says), and ask only after.` : ""} Ask in .symbiot/QUESTIONS.md: a ### heading saying plainly what it sends and to whom, ending {#chrome-go-${h.id}}, and one option, "🤖 Agent: go ahead: ${h.summary}". Stop there. Their Go lets this same call through once: make it again exactly as it is` };
}
// After a Chrome tool ran (the hook's PostToolUse): its result ends with "Tab Context", each tab of the
// run's group with its address now (`• tabId 7: "Title" ("https://…")`), or tabs_context_mcp's list as
// JSON. That's the site each is on, whatever a click or a redirect did. Gives how many it noted.
function textOf(v) { return typeof v === "string" ? v : Array.isArray(v) ? v.map(textOf).join("\n") : v && typeof v === "object" ? Object.values(v).map(textOf).join("\n") : ""; }
// A tab the run closed (tabs_close_mcp) is gone from its list, and tabs_context_mcp's answer is the
// whole group: a tab of this run's not in it was closed some other way. What's left is what the run
// still has open when it ends (openTabs).
function seen(tool, response, { session = "", home = homedir(), now = Date.now(), input = {} } = {}) {
  if (!String(tool || "").startsWith(PREFIX)) return 0;
  const name = String(tool).slice(PREFIX.length);
  if (name === "tabs_close_mcp" && input && input.tabId != null) { const all = readJson(TABS(home), {}); delete all[`${session}:${input.tabId}`]; writeJson(TABS(home), all); }
  const text = textOf(response), found = {};
  for (const m of text.matchAll(/tabId\s+(\d+):\s*(.*?)\s*\("([^"\s]+)"\)\s*$/gm)) found[m[1]] = { url: m[3], title: m[2].replace(/^"|"$/g, "") };
  for (const m of text.matchAll(/\{[^{}]*"tabId"\s*:\s*(\d+)[^{}]*\}/g)) { let t = {}; try { t = JSON.parse(m[0]); } catch {} if (t.url && !found[m[1]]) found[m[1]] = { url: String(t.url), title: String(t.title || "") }; }
  const ids = Object.keys(found), whole = name === "tabs_context_mcp" && /availableTabs|Available tabs/i.test(text);
  if (!ids.length && !whole) return 0;
  const all = readJson(TABS(home), {}), sites = readJson(SITES(home), {});
  if (whole) for (const k of Object.keys(all)) if (k.startsWith(session + ":") && !ids.includes(k.slice(session.length + 1))) delete all[k];
  for (const id of ids) {
    if (name === "tabs_close_mcp" && String(id) === String(input && input.tabId)) continue;
    const { url, title } = found[id], host = /^https?:\/\//i.test(url) ? hostOf(url) : ""; all[`${session}:${id}`] = { host, at: now };
    // signed in there or not: its sign-in page (by address or title) is out; any page past the front one, its title loaded, is in
    let path = "/"; try { path = new URL(url).pathname; } catch {}
    const state = !host ? "" : LOGIN_PATH.test(path) || LOGIN_TITLE.test(title) ? "out" : title && !/^https?:/i.test(title) && path.replace(/\/+$/, "") ? "in" : "";
    if (state) sites[host] = { ...(sites[host] || {}), [state]: now };
  }
  writeJson(TABS(home), all); writeJson(SITES(home), sites); return ids.length;
}
// The tabs a run opened in the user's Chrome and hasn't closed: [{ tab, host }]. Runs left theirs
// open, and the user's Chrome filled with "Claude" groups (an expired SMS Portal login, two LinkedIn
// feeds, 21 Oct 2026); the membrane's Stop hook sends a run back to close them before it ends.
function openTabs(session, { home = homedir() } = {}) {
  if (!session) return [];
  return Object.entries(readJson(TABS(home), {})).filter(([k]) => k.startsWith(session + ":")).map(([k, v]) => ({ tab: k.slice(session.length + 1), host: (v && v.host) || "" }));
}
// The user's Go on a held action's card (a question whose id is chrome-go-<id>): it may go through once.
function goAhead(id, { home = homedir(), now = Date.now() } = {}) {
  const holds = readJson(HOLDS(home), []), h = holds.find((x) => x.id === String(id || "")); if (!h) return false;
  h.go = now; writeJson(HOLDS(home), holds); return true;
}
// A question asking the user to sign in to a site (sign in to linkedin.com, sign LinkedIn back in) when signing in isn't
// what stands in the way there: { host, off: true } when the gate refused acting on it in the last day and it's still
// switched off (unless a tab hit its sign-in page since it was last seen signed in); { host, off: false, at } when a
// run's tab was on it signed in within SIGNED_FOR and not on its sign-in page since; else null.
function signInNotNeeded(text, { home = homedir(), now = Date.now() } = {}) {
  const t = String(text || ""); if (!/\b(?:sign|log)/i.test(t)) return null;
  const sites = readJson(SITES(home), {}), on = actSites(home), esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [host, s] of Object.entries(sites)) {
    const p = host.split("."), name = p.length > 2 && p[p.length - 2].length <= 3 ? p[p.length - 3] : p[p.length - 2] || ""; // linkedin.com: LinkedIn; domains.co.za: domains
    const site = `(?:https?:\\/\\/)?(?:www\\.)?(?:${esc(host)}${name.length >= 3 ? "|" + esc(name) : ""})\\b`;
    const asks = new RegExp(`\\b(?:sign|log)(?:ged)?[ -]?(?:back[ -])?in(?:\\s+again)?(?:\\s+(?:to|at|on|into))?\\s+(?:your\\s+|the\\s+)?${site}|\\b(?:sign|log)\\s+${site}\\s+(?:back\\s+)?in\\b`, "i");
    if (!asks.test(t)) continue;
    const seenIn = s.in || 0, seenOut = s.out || 0;
    if (s.off && now - s.off < DAY && !covered(host, on) && seenOut <= seenIn) return { host, off: true };
    if (seenIn && now - seenIn < SIGNED_FOR && seenIn > seenOut) return { host, off: false, at: seenIn };
  }
  return null;
}
// The user's yes to switching acting on for a site the gate refused it on lately (a chrome-act-<host> card, or a
// sign-in ask that was really that): turns it on. Only a site refused in the last week. Gives whether it did.
function switchOnAct(host, { load, save, home = homedir(), now = Date.now() }) {
  const h = hostOf(host), all = readJson(SITES(home), {}), s = all[h]; if (!s || !s.off || now - s.off > 7 * DAY) return false;
  const r = setActSite(h, true, { load, save }); if (r.error) return false;
  delete s.off; writeJson(SITES(home), all); return true;
}
// Turn acting on for a site (on) or off: config.chromeAct. Gives the list.
function setActSite(host, on, { load, save }) {
  const h = hostOf(host); if (!h) return { error: "Which site?" };
  const cfg = load(), list = new Set(Array.isArray(cfg.chromeAct) ? cfg.chromeAct.map(hostOf).filter(Boolean) : []); if (on) list.add(h); else list.delete(h);
  cfg.chromeAct = [...list]; save(cfg); return { ok: true, sites: cfg.chromeAct };
}

export { judgeChrome, judgeConnector, recipients, CONNECTOR_SENDS, seen, openTabs, goAhead, setActSite, setActAll, actSites, hostOf, signInNotNeeded, switchOnAct, actAsk, SETTING, PREFIX, READS, ACTS };
