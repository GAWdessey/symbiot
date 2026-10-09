// Lint pass run by CI (`npm run lint`). Deliberately narrow: only the two rules
// that catch a name lost when code moves between modules — an identifier used
// but never imported or defined (no-undef), and an import or helper left behind
// with nothing using it (no-unused-vars). Not a style checker.
import globals from "globals";

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
const pageScripts = {
  meta: { name: "symbiot/page-scripts" },
  preprocess(text) {
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
