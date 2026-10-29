// Clearing cards from Home's chat (home.mjs clearCards, control.mjs "clear", mind.mjs clearedClaim). On
// 29 Oct 2026 the chat said "Cleared all 16 merge cards" while all 18 stayed under "Only the user can do":
// it had no way to clear a Merge PR card (it settled only questions, by their words), and a Merge PR card
// dismissed by hand came back once its CI line changed (it was kept by that line). Isolated HOME.
//
//   node test/clearcards.mjs
//
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-clearcards-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME; process.env.SYMBIOT_VAULT = "file";
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { homeState, dismissCard, cardKey, loadDismissed, clearCards, clearable, goneKey } = await import("../home.mjs");
const { control } = await import("../control.mjs");
const { clearedClaim, rulesFor } = await import("../mind.mjs");

const merge = (slug, n, how = "auto-merge is off and CI is still running: merge it yourself when green", lane = "flutter") =>
  ({ kind: "merge", id: `pr:${slug}#${n}`, repo: lane, name: lane, title: `Merge PR #${n}: a change`, sub: `${slug} #${n} · ${how} · What this changes`, url: `https://github.com/${slug}/pull/${n}`, shape: "tasks" });
const base = { repos: () => ({}), board: () => ({ cards: [] }), pending: () => [], agents: () => [], lanes: () => ({ handoffs: [] }), reports: () => ({ count: 0 }), connected: () => true, waits: () => [], clashes: () => [], agentGone: () => "", signedOut: () => [], stuck: () => [], drafts: () => [], stalls: () => [], tasks: () => [], rootsSet: () => true, marketing: () => false, cardText: () => ({}), syncJobs: () => {}, intuition: () => [], overrides: () => [], reviewHolds: () => [], pairedPhone: () => false, goalCards: () => [], troubles: () => [] };

try {
  console.log("1) a dismissed Merge PR card stays dismissed when its line changes");
  const running = merge("bilawalsidhu/gods-eye-view", 1467, "auto-merge is off and CI is still running: merge it yourself when green", "mapview");
  const ready = merge("bilawalsidhu/gods-eye-view", 1467, "ready, and auto-merge is off: merge it yourself", "mapview");
  dismissCard(cardKey(running));
  const look = (cards) => homeState({ fresh: true, deps: { ...base, openPrs: () => cards } }).you.filter((y) => y.kind === "merge").map((y) => y.id);
  ok("dismissed while its CI ran: gone", !look([running]).length);
  ok("…and still gone once CI finished and its line reads ready", !look([ready]).length, look([ready]));
  ok("another PR of the same repo isn't taken with it (#1467 doesn't hide #14670)", look([merge("bilawalsidhu/gods-eye-view", 14670)]).length === 1);
  ok("a question card is still kept by its words: a new question shows", !goneKey({ kind: "ask", id: "ask:/x", path: "/x", q: "New?" }, { "/x|Old?": 1 }));
  dismissCard(cardKey(running), { undo: true });

  console.log("2) clearCards: dismisses, builds Home again, and calls cleared only what it no longer shows");
  const flutter = [195579, 195578, 195565].map((n) => merge("flutter/flutter", n));
  const gev = [1472, 1470].map((n) => merge("bilawalsidhu/gods-eye-view", n, undefined, "mapview"));
  const ask = { kind: "ask", id: "ask:/lane", path: "/lane", q: "Which plan?", title: "symbiot asks" };
  const all = [...flutter, ...gev, ask];
  const fresh = () => homeState({ fresh: true, deps: { ...base, openPrs: () => [...flutter, ...gev] } }).you;
  const r = clearCards("merge:flutter/flutter", { cards: fresh });
  ok("merge:<owner/repo> clears that repo's 3 and says it checked", r.ok && r.cleared === 3 && /3 flutter\/flutter/.test(r.said) && /no longer shows/.test(r.said), r);
  ok("…they're off Home now", !fresh().some((y) => /flutter\/flutter/.test(y.id)) && fresh().filter((y) => y.kind === "merge").length === 2);
  const r2 = clearCards("merge:all", { cards: fresh });
  ok("merge:all clears the rest", r2.ok && r2.cleared === 2 && !fresh().some((y) => y.kind === "merge"), r2);
  ok("nothing of that name on the list: an error, never 'cleared'", !!clearCards("merge:jlevy/squares", { cards: fresh }).error);
  ok("one card by its id", clearCards(ask.id, { cards: () => all.filter((y) => y.id === ask.id && !loadDismissed()[cardKey(ask)]) }).ok);
  // a dismissal that doesn't take (the next build still shows them): reported as still there, not cleared
  const stuck = clearCards("merge:all", { cards: () => flutter, dismiss: () => ({ ok: true }) });
  ok("still shown after: an error saying they're still on the list", stuck.error && /3 cards are still on your list/.test(stuck.error), stuck);
  const half = clearCards("merge:all", { cards: (() => { let n = 0; return () => (n++ ? flutter.slice(0, 1) : flutter); })(), dismiss: () => ({ ok: true }) });
  ok("some went, some didn't: says both", half.ok && half.cleared === 2 && /1 card didn't go/.test(half.said), half);

  console.log("3) the chat can clear, and knows the ids");
  const viaControl = control([{ op: "clear", id: "merge:all" }], { clear: (id) => ({ ok: true, said: `cleared ${id}` }) });
  ok("control runs clear through Home", viaControl[0].op === "clear" && viaControl[0].ok && viaControl[0].said === "cleared merge:all", viaControl);
  ok("…and without Home's hand says it can't", !!control([{ op: "clear", id: "x" }], {})[0].error);
  const lines = clearable(all).join("\n");
  ok("its context lists every Merge PR card by repo, past the six Home shows", /merge:flutter\/flutter \(3 Merge PR cards/.test(lines) && /merge:bilawalsidhu\/gods-eye-view \(2/.test(lines) && /ask:\/lane/.test(lines), lines);
  ok("nothing built: no line", !clearable([]).length);
  ok("the chat's rules name clear", /merge\|clear/.test(rulesFor([], "", false, true, [], true)) && /"merge:all"/.test(rulesFor([], "", false, true, [], true)));

  console.log("4) a reply that says cards are cleared, with nothing cleared, is corrected");
  ok("'Cleared all 16 merge cards' with no clear: corrected", clearedClaim("Cleared all 16 merge cards: flutter, gods-eye-view, jlevy/squares and paperclip."));
  ok("'I've closed all 18 now' with no clear: corrected", clearedClaim("I got that wrong. I've closed all 18 cards now."));
  ok("…not once a clear went through", !clearedClaim("Cleared all 16 merge cards.", [{ op: "clear", ok: true }]));
  ok("…nor when it only failed", clearedClaim("Cleared all 16 merge cards.", [{ op: "clear", error: "no" }]));
  ok("owning up to the earlier claim isn't a claim", !clearedClaim("I said I'd cleared all 16 merge cards, but they never left your list."));
  ok("a promise isn't a claim", !clearedClaim("I'll clear the cards once #349 merges."));
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
