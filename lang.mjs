// symbiot — Symbiot in any language.
//
// The language is your computer's (the app window reports it), unless you name one in
// Settings: any language at all, by name or code ("Afrikaans", "isiZulu", "pt-BR").
// Two things follow it:
//   - what Symbiot writes: chats, the week, standups and to-dos come out in it (and a
//     chat answers in whatever language you write to it in);
//   - the app itself: its own words, translated by your AI the first time they're
//     shown, then kept in ~/.config/symbiot/i18n/<language>.json, so they're instant
//     after that. Your content (tasks, chats, drafts, names, code) is never touched.
// Numbers are kept out of what's translated ("3 at work" and "5 at work" are one
// string, "{#} at work"), so a page's counts changing costs nothing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR, loadConfig, saveConfig } from "./core.mjs";
import { write } from "./ai.mjs";

const DIR = () => join(CONFIG_DIR, "i18n");
const BATCH = 40, PARALLEL = 6, MAX_LEN = 400;
const clean = (s) => String(s || "").trim().slice(0, 60);

// "af-ZA" / "afrikaans" / "" -> a tag ("af-ZA"), or the name as typed when it isn't a tag.
function normalise(l) {
  const s = clean(l); if (!s) return "";
  if (/^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/i.test(s)) { try { return Intl.getCanonicalLocales(s.replace(/_/g, "-"))[0]; } catch { return s; } }
  return s;
}
// What it's called, in English (for the AI) and in itself (for Settings).
function languageName(tag, inLang = "en") {
  if (!/^[a-z]{2,3}(-|$)/i.test(tag)) return tag;
  try { return new Intl.DisplayNames([inLang], { type: "language" }).of(tag) || tag; } catch { return tag; }
}
const isEnglish = (tag) => !tag || /^en(-|$)/i.test(tag) || /^english$/i.test(tag);

// { lang, auto, chosen, name, own, english }
function languageState(cfg = loadConfig()) {
  const chosen = normalise(cfg.language), auto = normalise(cfg.languageAuto), lang = chosen || auto || "en";
  return { lang, auto: auto || "en", chosen: chosen || "", name: languageName(lang), own: languageName(lang, /^[a-z]{2,3}(-|$)/i.test(lang) ? lang : "en"), english: isEnglish(lang) };
}
// The window says what the computer's set to; Settings can name another (or "" for the computer's).
function setLanguage({ auto, chosen } = {}) {
  const cfg = loadConfig();
  if (auto !== undefined) cfg.languageAuto = normalise(auto);
  if (chosen !== undefined) { const c = normalise(chosen); if (c) cfg.language = c; else delete cfg.language; }
  saveConfig(cfg);
  return languageState(cfg);
}
// One line for an AI's instructions: "" in English.
function languageLine(st = languageState()) {
  if (st.english) return "";
  return `\n\nWrite in ${st.name}${st.name !== st.lang ? ` (${st.lang})` : ""}: that's the language they use Symbiot in. If they write to you in another language, answer in that one. Keep names, code, file names, commands, URLs and quoted text as they are.`;
}

// ---- the app's own words ----------------------------------------------------
const fileFor = (lang) => join(DIR(), lang.replace(/[^A-Za-z0-9_-]/g, "_") + ".json");
function cached(lang) { try { return JSON.parse(readFileSync(fileFor(lang), "utf8")); } catch { return {}; } }
function saveCache(lang, map) { mkdirSync(DIR(), { recursive: true }); writeFileSync(fileFor(lang), JSON.stringify(map)); }
const holes = (s) => (String(s).match(/\{#\}/g) || []).length;

const BUSY = new Map(); // lang -> the translation in progress, so two windows don't pay twice
// Translations for these strings: what's kept is returned at once; what's missing is
// translated (by the AI, in batches) and kept. ask is the AI (tests pass their own).
async function translate(lang, strings, { ask = write } = {}) {
  const tag = normalise(lang);
  if (isEnglish(tag)) return {};
  const want = [...new Set((strings || []).map((s) => String(s)).filter((s) => s.trim() && s.length <= MAX_LEN))];
  while (BUSY.has(tag)) { try { await BUSY.get(tag); } catch {} }
  let map = cached(tag);
  const missing = want.filter((s) => !(s in map));
  if (missing.length) {
    const job = (async () => {
      const name = languageName(tag), parts = [];
      for (let i = 0; i < missing.length; i += BATCH) parts.push(missing.slice(i, i + BATCH));
      // up to 4 batches at a time: the first look at a new language takes about a minute, not several
      const one = async (part) => {
        const system = `You translate the interface of Symbiot, a desktop assistant app, from English into ${name}${name !== tag ? ` (${tag})` : ""}. These are its buttons, labels, headings and messages. Translate each one as a native ${name} app would say it: short, plain and natural, the same tone, the same capitalisation style. Keep exactly: every {#} (a number goes there), product and company names (Symbiot, Symbiot Pro, Claude, Claude Code, GitHub, Gmail, WhatsApp, LinkedIn, Ghost AI…), file names, code, commands, keyboard keys, emails and URLs. Answer with only a JSON array of the translations, in the same order, one for each.`;
        let out = null;
        try {
          const raw = String(await ask(system, JSON.stringify(part), { fast: true }) || "");
          const a = raw.indexOf("["), b = raw.lastIndexOf("]");
          out = JSON.parse(raw.slice(a, b + 1));
        } catch {}
        // the AI didn't answer properly: those stay English, and are asked for again next time
        if (!Array.isArray(out) || out.length !== part.length) return;
        const kept = { ...cached(tag) };
        part.forEach((src, k) => { const t = typeof out[k] === "string" ? out[k].trim() : ""; if (t && holes(t) === holes(src)) kept[src] = t; });
        saveCache(tag, kept);
      };
      for (let i = 0; i < parts.length; i += PARALLEL) await Promise.all(parts.slice(i, i + PARALLEL).map(one));
    })();
    BUSY.set(tag, job);
    try { await job; } finally { BUSY.delete(tag); }
    map = cached(tag);
  }
  const res = {}; for (const s of want) if (s in map) res[s] = map[s];
  return res;
}
function allTranslations(lang) { const tag = normalise(lang); return isEnglish(tag) ? {} : cached(tag); }
function forgetTranslations(lang) { const f = fileFor(normalise(lang)); if (existsSync(f)) writeFileSync(f, "{}"); return true; }

export { languageState, setLanguage, languageLine, languageName, normalise, isEnglish, translate, allTranslations, forgetTranslations };
