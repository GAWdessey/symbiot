// Lint pass run by CI (`npm run lint`). Deliberately narrow: only the two rules
// that catch a name lost when code moves between modules — an identifier used
// but never imported or defined (no-undef), and an import or helper left behind
// with nothing using it (no-unused-vars). Not a style checker.
import globals from "globals";

export default [
  { ignores: ["node_modules/", "android/"] },
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
    },
  },
];
