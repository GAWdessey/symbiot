// A paused lane's "unpark it" card on Home (home.mjs parkedCards): none for a lane the user paused on purpose,
// none for a lane whose turning back on is a turned-down option or that a decision says is worked elsewhere, and
// one cleared stays cleared when its words change. 12 Nov 2026: "you dont work on brokerly". Isolated HOME.
//
//   node test/parkedlane.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const HOME = mkdtempSync(join(tmpdir(), "symbiot-parkedlane-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const C = join(HOME, ".config", "symbiot");
mkdirSync(C, { recursive: true });
writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")] }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const H = await import("../home.mjs");
const A = await import("../agents.mjs");
try {
  const map = { brokerly: "/x/brokerly", acme: "/x/acme", symbiot: "/x/symbiot" };
  const tasks = [{ id: "a", text: "[Brokerly] finish the Google OAuth verification demo video (take 2)", repo: "brokerly" }, { id: "b", text: "Fix the dialler", repo: "acme" }];
  const parked = new Set(["/x/brokerly", "/x/acme"]);
  console.log("1) THE CARD BUILDER SKIPS A LANE IT'S TOLD TO");
  const all = H.parkedCards(tasks, map, parked);
  ok("with nothing to skip, a card per paused lane, marked parked (its button isn't 'Pick its lane')", all.length === 2 && all.every((c) => c.parked === true && c.kind === "lane"), all);
  const some = H.parkedCards(tasks, map, parked, { skip: (name) => name === "brokerly" });
  ok("a skipped lane gets none; the other still does", some.length === 1 && some[0].id === "parked:acme", some);
  ok("a skip that throws still leaves the card (never hidden by a fault)", H.parkedCards(tasks, map, parked, { skip: () => { throw new Error("x"); } }).length === 2);

  console.log("2) A TURNED-DOWN UNPARK, OR A DECISION IT'S WORKED ELSEWHERE");
  const rejected = ["running anything on the trading VM", "turning the Brokerly lane back on"];
  ok("a turned-down 'turning the Brokerly lane back on' covers brokerly", H.laneOffSymbiot("brokerly", { rejected }));
  ok("…not another lane, nor one only named in a turned-down option that isn't about turning it on", !H.laneOffSymbiot("acme", { rejected }) && !H.laneOffSymbiot("trading-desk", { rejected: ["running anything on the trading-desk VM"] }));
  const decisions = ["Brokerly on Orca: 29 Oct 2026: Garth runs Brokerly work in Orca, not Symbiot, because he finds Symbiot unreliable.", "Kea pitch style: short and warm"];
  ok("a decision that it's run in another tool, not Symbiot, covers it", H.laneOffSymbiot("brokerly", { decisions }));
  ok("…'Symbiot doesn't work on Brokerly' too", H.laneOffSymbiot("brokerly", { decisions: ["Brokerly lane: Garth repeated that Symbiot doesn't work on Brokerly."] }));
  ok("…but a decision that only names the lane doesn't", !H.laneOffSymbiot("brokerly", { decisions: ["Brokerly refund policy: no refunds on the wallet"] }));
  ok("…and the symbiot lane itself is never off Symbiot", !H.laneOffSymbiot("symbiot", { decisions: ["Off Orca: the work runs in Symbiot, not Orca, not Symbiot's phone"] }));
  ok("…a lane whose name is part of a longer one isn't matched (brokerly vs brokerly-agents)", !H.laneOffSymbiot("brokerly-agents", { rejected }) && !H.laneOffSymbiot("dai", { rejected }));

  console.log("3) PAUSED ON PURPOSE: THE PARK BUTTON SAYS SO");
  const lane = join(HOME, "work", "shop");
  A.parkLane(lane, true, { by: "you" });
  ok("parked by you is on purpose", A.parkedOnPurpose(lane) && A.parkedPaths().includes(lane));
  A.parkLane(lane, false);
  ok("unparked: no longer, and nothing of it is left in the settings", !A.parkedOnPurpose(lane) && !("parkedBy" in JSON.parse(readFileSync(join(C, "config.json"), "utf8"))));
  A.parkLane(lane, true);
  ok("parked by Symbiot (urgent work) isn't on purpose, so its card still shows", !A.parkedOnPurpose(lane) && A.parkedPaths().includes(lane));
  A.parkLane(lane, false);

  console.log("4) HOME, BUILT: NO CARD FOR A LANE OFF SYMBIOT, AND ONE CLEARED STAYS CLEARED");
  const base = { agents: () => [], board: () => ({ cards: [] }), pending: () => [], tasks: () => tasks, parked: () => [...parked], dismissed: () => ({}), goalCards: () => [], openPrs: () => [], repos: () => map, lanes: () => ({ handoffs: [] }) };
  let st; try { st = H.homeState({ fresh: true, deps: { ...base, offSymbiot: { rejected, decisions: [] }, parkedOnPurpose: () => false } }); } catch (e) { st = { err: String(e) }; }
  const ids = ((st && st.you) || []).map((y) => y.id);
  ok("the turned-down lane's card isn't built; the other paused lane's is", !ids.includes("parked:brokerly") && ids.includes("parked:acme"), [ids, st && st.err]);
  const card = H.parkedCards(tasks, map, parked)[1];
  const gone = { [H.cardKey(card)]: Date.now() };
  const later = H.parkedCards([...tasks, { id: "c", text: "A newer task", repo: "acme" }], map, parked)[1];
  ok("a cleared paused-lane card stays gone though its count and first task changed", later.sub !== card.sub && H.goneKey(later, gone), [card.sub, later.sub]);
  ok("…while another card with changed words is not swept up by it", !H.goneKey({ id: "ask:/x/acme", q: "x" }, gone));
} finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} parkedlane: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
