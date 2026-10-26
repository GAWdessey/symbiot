// Lint pass run by CI (`npm run lint`). Deliberately narrow: only the two rules
// that catch a name lost when code moves between modules — an identifier used
// but never imported or defined (no-undef), and an import or helper left behind
// with nothing using it (no-unused-vars). Not a style checker.
import globals from "globals";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

const RULES = {
  "no-undef": "error",
  "no-unused-vars": ["error", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
};

// The page's own JavaScript lives in ui.mjs as text inside a template literal,
// so plain ESLint sees one string. This hands each <script>…</script> in it to
// ESLint as a browser script of its own, and puts what it finds back on
// ui.mjs's own lines. The template has no ${} or backticks inside (ui.mjs keeps
// it that way), so the script is its text with the escapes undone (\\' → \'),
// which is done a line at a time to keep the lines where they are.
const cookLine = (l) => { try { return new Function("return `" + l + "`;")().replace(/[\r\n]/g, " "); } catch { return l; } };
// The page in parts (ui.mjs joins ui/js/<area>.mjs in the order of its SCRIPT list): the script is
// linted as the one script it is (a name one part defines and another uses is no "undefined"), and
// what's found is said with the part and line it's on.
function partsScript(text) {
  const m = text.match(/const SCRIPT = \[([^\]]+)\]/); if (!m) return null;
  const lines = [], from = [];
  for (const name of m[1].split(",").map((x) => x.trim().toLowerCase())) {
    const file = `ui/js/${name}.mjs`, src = readFileSync(join(ROOT, file), "utf8");
    const open = src.indexOf("export default `") + "export default `".length, body = src.slice(open, src.lastIndexOf("`;"));
    const before = src.slice(0, open).split("\n").length;
    body.split("\n").forEach((l, i) => { lines.push(cookLine(l)); from.push(`${file}:${before + i}`); });
  }
  return { text: lines.join("\n"), from };
}
const pageScripts = {
  meta: { name: "symbiot/page-scripts" },
  preprocess(text) {
    const parts = partsScript(text);
    if (parts) { pageScripts.offsets.push({ from: parts.from }); return [text, { text: parts.text, filename: "page1.js" }]; }
    const blocks = [text], re = /<script>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(text))) {
      const start = m.index + "<script>".length, before = text.slice(0, start);
      const line = before.split("\n").length - 1, col = start - before.lastIndexOf("\n") - 1;
      pageScripts.offsets.push({ line, col });
      blocks.push({ text: m[1].split("\n").map(cookLine).join("\n"), filename: `page${blocks.length}.js` });
    }
    return blocks;
  },
  postprocess(lists) {
    const offs = pageScripts.offsets.splice(0, lists.length - 1);
    return lists.flatMap((msgs, i) => {
      if (!i) return msgs;
      const o = offs[i - 1];
      if (o.from) return msgs.map((m) => ({ ...m, message: `${m.message} (page script, ${o.from[m.line - 1] || "ui/js"})`, line: 1, column: 1, endLine: undefined, endColumn: undefined, fix: undefined, suggestions: undefined }));
      const at = (l, c) => (l === 1 ? c + o.col : c);
      return msgs.map((m) => ({ ...m, message: `${m.message} (page script)`, line: m.line + o.line, column: at(m.line, m.column),
        ...(m.endLine ? { endLine: m.endLine + o.line, endColumn: at(m.endLine, m.endColumn) } : {}), fix: undefined, suggestions: undefined }));
    });
  },
  offsets: [],
  supportsAutofix: false,
};

export default [
  { ignores: ["node_modules/", "android/", ".symbiot/", "desktop/node_modules/", "desktop/dist/"] }, // .symbiot: Symbiot's and its agents' scratch, never shipped
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: RULES,
  },
  { files: ["ui.mjs"], processor: pageScripts },
  // Symbiot's extension in the user's own Chrome (ownchrome.mjs): classic scripts with Chrome's extension APIs
  { files: ["extension/*.js"], languageOptions: { sourceType: "script", globals: { ...globals.browser, chrome: "readonly" } } },
  // the relay on Cloudflare: a Worker's own globals
  { files: ["relay/worker.mjs"], languageOptions: { globals: { WebSocketPair: "readonly", WebSocketRequestResponsePair: "readonly" } } },
  {
    // the page script itself: a classic browser <script>, so its top-level
    // functions are globals the page's onclick="…" attributes can call.
    // SymbiotAndroid is the bridge the Android app puts on the page (MainActivity).
    files: ["ui.mjs/*.js"],
    languageOptions: { sourceType: "script", globals: { ...globals.browser, SymbiotAndroid: "readonly" } },
    rules: { ...RULES, "no-unused-vars": ["error", { vars: "local", args: "none", caughtErrors: "none" }] },
  },
];
