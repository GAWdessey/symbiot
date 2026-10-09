// Symbiot in any language (lang.mjs): the computer's language or one named in Settings;
// the line that makes the AI write in it; and the app's own words, translated once by
// the AI and kept (numbers kept out, names kept, a bad answer not kept). A stand-in AI.
// Isolated HOME.
//
//   node test/lang.mjs
//
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-lang-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const L = await import("../lang.mjs");

  console.log("WHICH LANGUAGE — the computer's, or any you name");
  let st = L.languageState();
  ok("nothing said yet: English", st.lang === "en" && st.english, st);
  st = L.setLanguage({ auto: "af-ZA" });
  ok("the window says the computer's in Afrikaans: Afrikaans", st.lang === "af-ZA" && /^Afrikaans/.test(st.name) && !st.english, st);
  ok("…shown in its own words in Settings", /^Afrikaans/.test(st.own), st.own);
  st = L.setLanguage({ chosen: "zu" });
  ok("named in Settings (isiZulu): that wins over the computer's", st.lang === "zu" && st.chosen === "zu" && st.auto === "af-ZA", st);
  ok("any language by name works too", L.setLanguage({ chosen: "Klingon" }).lang === "Klingon");
  ok("codes are tidied (pt_br -> pt-BR)", L.normalise("pt_br") === "pt-BR");
  st = L.setLanguage({ chosen: "" });
  ok("cleared: back to the computer's", st.lang === "af-ZA" && !st.chosen, st);

  console.log("WHAT SYMBIOT WRITES — in your language");
  ok("Afrikaans: the AI is told to write in it", /Write in Afrikaans.*\(af-ZA\)/.test(L.languageLine()), L.languageLine());
  ok("…and to answer in whatever language you write in", /another language, answer in that one/.test(L.languageLine()));
  ok("…keeping names, code and quotes", /Keep names, code/.test(L.languageLine()));
  ok("English: nothing added", L.languageLine({ english: true }) === "");
  const { converse } = await import("../mind.mjs");
  let sysSeen = "";
  await converse({ where: "Home", question: "hallo", ask: async (s) => { sysSeen = s; return '{"reply":"Hallo!"}'; }, map: {} });
  ok("a chat on Home is told to write in Afrikaans", /Write in Afrikaans/.test(sysSeen), sysSeen.slice(-300));

  console.log("THE APP'S OWN WORDS — translated once, kept");
  let calls = 0;
  const ai = async (system, prompt) => {
    calls++;
    const list = JSON.parse(prompt);
    if (!/into Afrikaans/.test(system) || !/Keep exactly: every \{#\}/.test(system)) return "[]";
    return JSON.stringify(list.map((s) => ({ "Settings": "Instellings", "{#} at work": "{#} aan die werk", "Add key": "Voeg sleutel by", "Bad one {#}": "Sleg" }[s] || "AF:" + s)));
  };
  let m = await L.translate("af-ZA", ["Settings", "{#} at work", "Add key", "", "Settings"], { ask: ai });
  ok("translated by the AI", m["Settings"] === "Instellings" && m["Add key"] === "Voeg sleutel by", m);
  ok("a number's place is kept", m["{#} at work"] === "{#} aan die werk");
  ok("one AI call for the lot", calls === 1, calls);
  ok("kept on this computer", existsSync(join(HOME, ".config", "symbiot", "i18n", "af-ZA.json")));
  m = await L.translate("af-ZA", ["Settings", "{#} at work"], { ask: ai });
  ok("asked again: from what's kept, no AI call", calls === 1 && m["Settings"] === "Instellings", calls);
  m = await L.translate("af-ZA", ["Bad one {#}"], { ask: ai });
  ok("a translation that loses the number's place isn't kept", !("Bad one {#}" in m) && !("Bad one {#}" in L.allTranslations("af-ZA")), m);
  m = await L.translate("af-ZA", ["New thing"], { ask: async () => "sorry, I can't" });
  ok("an AI that doesn't answer properly: nothing kept, asked again next time", !("New thing" in m) && !("New thing" in L.allTranslations("af-ZA")));
  ok("English: nothing to translate, no AI", Object.keys(await L.translate("en-GB", ["Settings"], { ask: async () => { throw new Error("no"); } })).length === 0);
  const many = Array.from({ length: 130 }, (_, i) => "Thing " + String.fromCharCode(65 + (i % 26)) + i);
  calls = 0;
  m = await L.translate("af-ZA", many, { ask: ai });
  ok("130 new ones: in batches (4 calls), all kept", calls === 4 && Object.keys(m).length === 130, { calls, n: Object.keys(m).length });
  calls = 0;
  const slow = async (s, p) => { await sleep(150); return ai(s, p); };
  await Promise.all([L.translate("af-ZA", ["Twice at once"], { ask: slow }), L.translate("af-ZA", ["Twice at once"], { ask: slow })]);
  ok("two windows asking at once: the AI is asked once", calls === 1, calls);
  ok("every language kept apart", JSON.parse(readFileSync(join(HOME, ".config", "symbiot", "i18n", "af-ZA.json"), "utf8"))["Settings"] === "Instellings" && Object.keys(L.allTranslations("zu")).length === 0);
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} lang: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
