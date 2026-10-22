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
import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { heldFor } from "./sends.mjs";

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
const TABS = (home) => join(dir(home), "chrome-tabs.json"), HOLDS = (home) => join(dir(home), "chrome-holds.json");
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
  if (!covered(host, sites)) return { why: `acting on ${host} in the user's own Chrome is off (reading is fine): the user switches it on for a site in Settings → Connections. Ask them in .symbiot/QUESTIONS.md if this site needs it, or do it through Symbiot's own browser (symbiot screens)`, setting: true };
  const summary = String(input.action_summary || "").trim();
  if (!summary) return { why: "say what this action does (action_summary) on every click, key, type and fill in the user's own Chrome: the membrane holds sends, payments and deletes for the user's Go" };
  const kind = name === "computer" && enterIn(input) ? "send" : heldFor(summary, host); if (!kind) return go();
  // held: let it through once if the user said Go to this very action; else hold it and say how to ask
  const holds = readJson(HOLDS(home), []), mine = holds.find((h) => h.host === host && key(h.summary) === key(summary) && h.go && !h.used && now - h.go < GO_FOR);
  if (mine) { mine.used = now; writeJson(HOLDS(home), holds); return go(); }
  let h = holds.find((x) => x.host === host && key(x.summary) === key(summary) && !x.go && now - x.at < 86400000);
  if (!h) { h = { id: randomBytes(4).toString("hex"), host, summary: summary.slice(0, 200), kind, at: now, session }; holds.push(h); writeJson(HOLDS(home), holds.slice(-200)); }
  const word = { send: "sends", pay: "pays", delete: "deletes" }[kind];
  return { why: `this ${word} as the user, on ${host} ("${h.summary}"), so it waits for their Go. Ask in .symbiot/QUESTIONS.md: a ### heading saying plainly what it ${word}, ending {#chrome-go-${h.id}}, and one option, "🤖 Agent: go ahead: ${h.summary}". Stop there; once they say Go, the same action goes through, once`, held: h.id };
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
  for (const m of text.matchAll(/tabId\s+(\d+):.*\("([^"\s]+)"\)\s*$/gm)) found[m[1]] = m[2];
  for (const m of text.matchAll(/"tabId"\s*:\s*(\d+)[^{}]*?"url"\s*:\s*"([^"]+)"/g)) found[m[1]] ??= m[2];
  const ids = Object.keys(found), whole = name === "tabs_context_mcp" && /availableTabs|Available tabs/i.test(text);
  if (!ids.length && !whole) return 0;
  const all = readJson(TABS(home), {});
  if (whole) for (const k of Object.keys(all)) if (k.startsWith(session + ":") && !ids.includes(k.slice(session.length + 1))) delete all[k];
  for (const id of ids) { const u = found[id]; if (name === "tabs_close_mcp" && String(id) === String(input && input.tabId)) continue; all[`${session}:${id}`] = { host: /^https?:\/\//i.test(u) ? hostOf(u) : "", at: now }; }
  writeJson(TABS(home), all); return ids.length;
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
// Turn acting on for a site (on) or off: config.chromeAct. Gives the list.
function setActSite(host, on, { load, save }) {
  const h = hostOf(host); if (!h) return { error: "Which site?" };
  const cfg = load(), list = new Set(Array.isArray(cfg.chromeAct) ? cfg.chromeAct.map(hostOf).filter(Boolean) : []); if (on) list.add(h); else list.delete(h);
  cfg.chromeAct = [...list]; save(cfg); return { ok: true, sites: cfg.chromeAct };
}

export { judgeChrome, seen, openTabs, goAhead, setActSite, setActAll, actSites, hostOf, PREFIX, READS, ACTS };
