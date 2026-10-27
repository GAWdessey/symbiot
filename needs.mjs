// symbiot — what may sit under "Needs you", and how a card there reads.
//
// The user, 22 Oct 2026: "nothing is being asked that i can visually see immediately and make a
// decision". Three cards side by side: a goal card whose question was their own request echoed back
// ("no as discussed we have created the …company…"), a close-out "Done: where are we with …? Got it"
// that only told them something, and "Listen to the … coach voices on a call, since the agent can't…"
// cut off mid-sentence, with "I've done this / Skip" where the decision (which voice) had no button.
// Nothing checked what a card said before it was shown. So:
//
// - splitNeeds(you): a card stays under Needs you only when it's a decision or a step only the user
//   takes. Information (a close-out, a report to read, a card whose only button is "Got it") goes to
//   `updates`, a quiet list of its own.
// - The card writer: one short AI pass per card (cached in cardtext.json by the card's words) gives
//   its question (≤15 words, a real question or a clear step, never the user's own words back, never
//   cut off), why (one line), a short label and "what happens" for each option (same indexes, so an
//   answer is saved exactly as before), the recommended one, and whether the step is a judgement the
//   user reports back on ("Tell the agent what you found", the card's talk box). With no AI, or
//   before it has run, a card reads as it did.
import { readOnly } from "./proof.mjs";
// - Money up front (moneyNote): a card that has the user add a card, billing details or claim a credit
//   says first that the site may hold or charge money on it. One said nothing, and the site reserved
//   some R425 on the user's card minutes later (23 Oct 2026). The writer keeps that warning or isn't
//   used, and a card that still lacks one gets it in its context line.
// - A step says exactly what, where and as whom (unclear): "Can I use Workdesk and Chrome to open
//   console.cloud.google.com?" with "Access is set up / Drop the move" was written from a run's own
//   status note ("waits on the user's answer on the Workdesk and Chrome access to the Google consoles"),
//   and the user asked "what does it want from me????" (26 Oct 2026). It never said which account,
//   what the agent would do there, or what "access" meant, and it offered a Symbiot page as something
//   to grant. A sign-in or access step now names the site, the account and what the agent does next,
//   its button says what it confirms ("I'm signed in"), and a card that can't say those, or that
//   offers a Symbiot page as something to grant, is unclear: a goal's card goes back to its run to ask
//   properly (goals.mjs), and the user never sees it.
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CONFIG_DIR, readState, writeJsonAtomic } from "./core.mjs";
import { promptFor } from "./overrides.mjs";
import { addsPayment, warnsHold, HOLD_WARNING } from "./sends.mjs";
import { dangles } from "./handover.mjs";

const CARDTEXT = () => join(CONFIG_DIR, "cardtext.json");
const MAX_KEEP = 300, CARD_V = 4; // CARD_V: a card written before its agent's own line (doing), its check (proof, run), or the unclear rule, is written again
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

// ---- the contract --------------------------------------------------------------------
const ACK = /^(got it|ok|okay|thanks|thank you|noted|seen|fine|close|dismiss)$/i;
function isUpdate(y) {
  if (!y || y.kind !== "ask") return !!(y && y.update);
  if (y.update) return true;
  if (y.goal && /:done$/.test(String(y.id || ""))) return true; // a goal's close-out
  const opts = (y.options || []).map((o) => String(o).replace(/\s*\(recommended[^)]*\)\s*$/i, "").replace(/[^\w ']/g, "").trim());
  if (opts.length && opts.every((o) => ACK.test(o))) return true; // its only answer is "Got it": nothing to decide
  return /^\s*done:/i.test(String(y.raw || y.q || ""));
}
// A card with nothing to ask: its words blank, a placeholder ("undefined", "n/a"), or only about
// itself ("this card"), or cut off on a word that needs more ("They wait on you for.", 27 Oct 2026). On 23 Oct 2026 a card's talk went to its agent as "this card", and the AI
// told the user the card was empty and had nothing behind it. Such a card is never shown or asked about.
const PLACEHOLDER = /^(?:(?:this|the|that|a)\s+)?(?:card|question|ask|step|item|task|one)$|^(?:this|that|it|here|undefined|null|nan|none|n a|na|tbd|todo|placeholder|untitled|object object|lorem ipsum.*)$/i;
const blankText = (s) => { const t = String(s || "").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); return !t || PLACEHOLDER.test(t) || dangles(s); };
const blankAsk = (y) => !!y && y.kind === "ask" && blankText(y.raw) && blankText(y.q) && blankText(y.sub);
// { you, updates }: updates as the list shows them, newest first.
// A card the writer found isn't theirs ("Is the domain moved yet?", "Have you scheduled the 29 Oct
// post?": status the agent can check) never reaches Needs you. Symbiot built those from what a goal or
// a run waited on, so they skipped the question checkpoint (triage.mjs), and the user was asked the same
// status three times in a row (22 Oct 2026). Its run carries on (goals.mjs follow-through).
function splitNeeds(you, all = loadText()) {
  const keep = [], updates = [];
  for (const y of you || []) {
    if (y && y.kind === "ask" && (all[keyOf(y)] || {}).notTheirs) continue;
    if (y && y.kind === "ask" && y.goal && (all[keyOf(y)] || {}).unclear) continue; // its run is asked to say it properly (goals.mjs)
    if (!isUpdate(y)) { keep.push(y); continue; }
    updates.push({ id: y.id, key: y.path && (y.raw || y.q) ? `${y.path}|${y.raw || y.q}` : `${y.id || ""}|${y.raw || y.q || y.sub || ""}`, title: clip(String(y.raw || y.q || y.sub || "").replace(/^\s*done:\s*/i, ""), 120), lane: y.repo || y.project || "", ...(y.report ? { report: y.report } : {}), ...(y.goal ? { goal: y.goal, answer: (y.options || [])[0] || "Got it", path: y.path, q: y.raw || y.q } : {}) });
  }
  return { you: keep, updates };
}

// ---- the card writer -------------------------------------------------------------------
const keyOf = (y) => createHash("sha1").update(`${y.raw || y.q || ""}\n${(y.options || []).join("\n")}`).digest("hex").slice(0, 16);
function loadText() { return readState(CARDTEXT(), (x) => x && typeof x === "object") || {}; }
function textFor(y, all = loadText()) { return all[keyOf(y)] || null; }
// The commands a card asks the user to run, each { what, cmd }: the writer's, after a look (one line
// or a short block, no more than 5, never empty), or, with no AI, those the agent fenced in its own
// words (``` blocks, lines that start "$ ").
const commandList = (list) => (Array.isArray(list) ? list : []).map((r) => ({ what: clip(r && r.what, 60), cmd: String((r && r.cmd) || "").replace(/\r/g, "").trim().slice(0, 600) })).filter((r) => r.cmd && r.cmd.split("\n").length <= 6).slice(0, 5);
function codeIn(text) {
  const t = String(text || ""), out = [];
  for (const m of t.matchAll(/```[\w-]*\n([\s\S]*?)```/g)) { const c = m[1].replace(/^\s*\$\s+/gm, "").trim(); if (c) out.push({ what: "", cmd: c }); }
  if (!out.length) for (const l of t.split("\n")) { const m = l.match(/^\s*\$\s+(\S.*)$/); if (m) out.push({ what: "", cmd: m[1].trim() }); }
  return commandList(out);
}
// The card as the user sees it: its question, why, labels and tips from the writer, its answer
// key (raw) and options unchanged.
function applyText(y, all = loadText()) {
  if (!y || y.kind !== "ask") return y;
  const t = textFor(y, all); if (t && (t.notTheirs || t.unclear)) return y;
  const run = (t && t.run && t.run.length ? t.run : codeIn([y.raw || y.q, y.why, y.context].filter(Boolean).join("\n"))), withRun = { ...(run.length ? { run } : {}), ...(t && t.proof ? { proof: t.proof } : {}) };
  if (!t) return run.length ? { ...y, ...withRun } : y;
  const n = (y.options || []).length;
  return { ...y, ...withRun, raw: y.raw || y.q, q: t.question, ...(t.doing ? { doing: t.doing } : {}), ...(t.why ? { why: t.why } : {}), ...(t.labels && t.labels.length === n ? { labels: t.labels } : {}), ...(t.tips && t.tips.length === n ? { tips: t.tips } : {}), ...(Number.isInteger(t.rec) && t.rec >= 0 && t.rec < n ? { rec: t.rec } : {}), ...(t.tell ? { tellAgent: true } : {}) };
}

const SYSTEM = `You rewrite one card on a person's "Needs you" list so they can decide at a glance. An AI agent wrote the card; it is often long, cut off, or echoes back what the person said. Answer with JSON only:
{"doing":"...","question":"...","why":"...","labels":["..."],"tips":["..."],"recommended":0,"judgement":false,"notTheirs":false,"run":[{"what":"...","cmd":"..."}],"proof":{"cmd":"...","expect":"..."}}
- doing: at most 25 words, in the agent's own voice (I, me), saying that it is the one doing the work, what the work is and what it has done so far ("I'm moving bookly.co.za to the company's own account. I've drafted the transfer ticket."). Never written as steps for the person. Say a job is new or started only if the card shows it is running.
- question: at most 15 words. The one thing the agent needs from them, from the agent ("Can I pay the R95 transfer fee?", "I need your OK to send the ticket."), or one clear step only they can take, saying exactly what to do and where. Never their own words repeated back. Never cut off. If it refers to a login, an account or a detail, name it (the address or account it means), never "the login".
- A sign-in or access step names the site's address, the account to be signed in as (its email address) and what the agent does there once it is ("Sign in to console.cloud.google.com in your Chrome as garth@example.com, so I can add pat@example.com as an Owner"; why can carry the second half). Never "access" or "set it up" on its own. Symbiot's own pages (Home, Dashboard, Workdesk, Reports, Settings and the rest) are where they read and answer cards: never something to grant, allow or use.
- why: one short line of context: what it's for, or what happens next. No jargon, no file names.
- labels: one per option, in the same order, at most 5 words each, saying what pressing it does ("Send it", "Keep waiting", "Skip this step"). For a step of theirs, what pressing it confirms they did ("I'm signed in", "It's added"), never a vague "Access is set up".
- tips: one per option, same order: one sentence on what happens if they press it.
- recommended: the index of the option to press first, or -1 if none stands out.
- run: when their step is to run commands in a terminal on their own computer (or over ssh), each command as one item: "what" is at most 8 words on what it does, "cmd" is the exact command copied from the card, one command or one short pipeline that runs as a unit. In the order to run them. At most 5. Never invent or change a command, and leave it out ([]) when the card holds no exact command.
- proof: when their step changes something a command can read afterwards (a service running, a file there, a version installed), one read-only command that shows it's done, and "expect": a short regular expression its output matches only once it is ("^active$"). Only reading commands (systemctl is-active, test -f, ls, cat, grep, git status, md5sum), over ssh if the step is on a server (same ssh options as the card's), never one that changes anything. For a script (a deploy), what it changes: a file's checksum the same in both places (md5sum a b | cut -d" " -f1 | uniq | wc -l, expect "^1$"), a version string, how long a service has run. Leave it out ({}) when nothing can be read.
- judgement: true when their step is to look, listen or try something and report what they found (which voice sounds better, whether it works), so they need to tell the agent the result, not just "done".
- notTheirs: true when the card asks them whether something has happened or what state something is in (is it moved, have you scheduled it, did it arrive), or asks for something an agent could check or do itself: a login, key, document or detail the saved keys or the linked sites and mailboxes listed hold, or a file on their computer. Those are the agent's to find out, never a card for them. Only a password nobody saved, a code sent to them, a payment, or a yes to something hard to undo is theirs. Then the other fields don't matter.
- A key, token or password they're to give: their step is to paste its value here, in chat or on this card, where it is saved to Symbiot's vault by itself. Never "save it to the vault" or "add it to .env" as their step. One they say they made but whose value isn't saved is real: the step is one line, "The token exists, but its value isn't in the vault: roll it in <the site> and paste the value in chat." Never doubt they made it.
- unclear: true when the card is a step only they can take (a sign-in, a grant, a setting on a site) or asks for access, but neither the card nor its context says which site, which account, or what the agent does once it's done; or when all it holds is the agent's own status note ("waits on the user's answer on …"). Never guess an account to fill the gap: it goes back to the agent to ask properly. Then the other fields don't matter.
- money: when the card has them add a card, a payment method or billing details, claim a credit or accept paid terms, why says first, plainly, that the site may hold or charge money on the card, with the amount if the card gives one. Never call it free.`;

// A Symbiot page offered as something to grant or use ("Can I use Workdesk and Chrome to open …?").
// Only the page names that aren't everyday words, so "Settings" or "Home" in a real step stays.
const PAGE_GRANT = /\b(?:use|grant|allow|access(?:\s+to)?|permission\s+(?:for|to|on)|give\s+me)\b[^.?!]{0,40}\b(?:Workdesk|Dashboard|Standup|Drift|Archive)\b/;
const grantsPage = (q) => PAGE_GRANT.test(String(q || ""));
// A sign-in step that dropped the account its agent named: the agent's own words, with it, are shown instead.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const dropsAccount = (q, why, src) => /\bsign(?:ed)?[- ]?in\b/i.test(String(q || "")) && EMAIL.test(String(src || "")) && !EMAIL.test(`${q} ${why}`);

// The writer's proof, kept only when it only reads (proof.mjs readOnly) and its expectation is a pattern that compiles.
function proofOf(p) {
  if (!p || typeof p !== "object") return null;
  const cmd = String(p.cmd || "").trim(), expect = String(p.expect || "").trim().slice(0, 120);
  if (!cmd || !expect || !readOnly(cmd)) return null;
  try { new RegExp(expect); } catch { return null; }
  return { cmd, expect };
}
// src: the card as its agent wrote it. One that adds a payment method and warns of a hold keeps that
// warning in what's written, or the writer's words aren't used.
function check(o, n, src = "") {
  if (!o || typeof o !== "object") return null;
  if (o.notTheirs === true) return { v: CARD_V, notTheirs: true, question: "" }; // "Is it moved yet?": the agent checks, it's no card
  if (o.unclear === true || grantsPage(o.question)) return { v: CARD_V, unclear: true, question: "" }; // "Can I use Workdesk and Chrome…?": back to its agent
  if (dropsAccount(o.question, o.why, src)) return null;
  const question = clip(o.question, 140), why = clip(o.why, 140), doing = words(o.doing) <= 30 && !/…$/.test(String(o.doing || "").trim()) ? clip(o.doing, 200) : "";
  if (!question || words(question) > 18 || /…$/.test(question)) return null;
  if (addsPayment(src) && !warnsHold(`${question} ${why}`)) return null; // the money warning was cut: the agent's own words, with it
  const labels = Array.isArray(o.labels) ? o.labels.map((l) => clip(l, 40)) : [], tips = Array.isArray(o.tips) ? o.tips.map((t) => clip(t, 160)) : [];
  const run = commandList(o.run), proof = proofOf(o.proof);
  return { v: CARD_V, question, ...(proof ? { proof } : {}), ...(run.length ? { run } : {}), ...(doing ? { doing } : {}), ...(why ? { why } : {}), ...(labels.length === n && labels.every(Boolean) ? { labels } : {}), ...(tips.length === n ? { tips } : {}), rec: Number.isInteger(o.recommended) ? o.recommended : -1, ...(o.judgement === true ? { tell: true } : {}) };
}
// Writes the cards not written yet, one AI call each. write: ai.mjs write. Returns how many.
// known: { keys: the vault's names, sites: the sites and mailboxes linked under Connections }, so a
// card asking for what they hold goes back to its agent: the bookly card asked about a login no one
// had saved, with the mailbox it'd come to linked and never read (22 Oct 2026). A card written before
// the agent's own line (v) is written again, once.
async function writeCards(cards, { write, now = Date.now(), known = {} } = {}) {
  if (typeof write !== "function") return 0;
  const all = loadText(); let n = 0;
  const keys = (known.keys || []).slice(0, 40), sites = (known.sites || []).slice(0, 40);
  const holds = `${keys.length ? `Saved keys the agents can use (names only): ${keys.join(", ")}.\n` : ""}${sites.length ? `Sites and mailboxes linked for the agents: ${sites.join(", ")}.\n` : ""}`;
  for (const y of cards || []) {
    if (!y || y.kind !== "ask" || isUpdate(y) || (all[keyOf(y)] && all[keyOf(y)].v === CARD_V)) continue;
    const opts = y.options || [];
    const prompt = `The card, from ${y.name || y.repo || "an agent"}${y.title ? ` (${y.title})` : ""}:\n${y.raw || y.q || y.sub}\n${y.task ? `The agent's job: ${y.task}\n` : ""}${y.done ? `What the agent says it has done: ${y.done}\n` : ""}${y.why ? `Its context: ${y.why}\n` : ""}${y.report && y.report.title ? `It links a report: "${y.report.title}"\n` : ""}${holds}Its options, in order:\n${opts.map((o, i) => `${i}. ${o}`).join("\n") || "(none: they answer in their own words)"}`;
    let r = null; try { r = await write(SYSTEM + promptFor("card"), prompt, { fast: true, kind: "triage" }); } catch {}
    const m = r && typeof r.text === "string" ? r.text.match(/\{[\s\S]*\}/) : null; let o = null; try { o = m ? JSON.parse(m[0]) : null; } catch {}
    const t = check(o, opts.length, [y.raw || y.q || y.sub, y.why, ...opts].filter(Boolean).join("\n")); if (!t) continue;
    all[keyOf(y)] = { ...t, at: now }; n++;
  }
  if (n) { const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0)).slice(0, MAX_KEEP), kept = Object.fromEntries(keys.map((k) => [k, all[k]])); try { writeJsonAtomic(CARDTEXT(), kept, { indent: 1, mode: 0o600 }); } catch {} }
  return n;
}

// A card (Home's, or a question as the Workdesk shows it) that has the user add a card, billing details or
// claim a credit without a word on money: the warning goes first in its context line (why, or context).
function moneyNote(y) {
  if (!y || typeof y !== "object") return y;
  const text = [y.q, y.raw, y.sub, y.why, y.context, y.doing, ...(y.options || []), ...(y.labels || []), ...(y.tips || [])].filter(Boolean).join("\n");
  if (!addsPayment(text) || warnsHold(text)) return y;
  const at = "context" in y && !("why" in y) ? "context" : "why";
  return { ...y, [at]: y[at] ? `${HOLD_WARNING} ${y[at]}` : HOLD_WARNING, money: true };
}

export { moneyNote, blankText, blankAsk, codeIn, commandList, isUpdate, splitNeeds, applyText, textFor, writeCards, keyOf, loadText as loadCardText, check as checkCardText, CARDTEXT };
