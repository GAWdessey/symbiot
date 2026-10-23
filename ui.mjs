// symbiot — the `symbiot app` page, served at / by index.mjs (cmdApp).
//
// Self-contained HTML served at / — no backticks or ${} inside (it lives in a
// template literal). Talks to the local API with the per-launch token.
// Kept apart from the CLI/server so UI edits can't break the backend (and vice
// versa); test/smoke.mjs boots the real page and exercises every handler.
//
// The page is kept in parts under ui/ (the stylesheet, the markup, and the script by area), joined
// here in order into one page, exactly as before (test/uisplit.mjs checks the join).
import STYLE from "./ui/style.mjs";
import MARKUP from "./ui/markup.mjs";
import CORE from "./ui/js/core.mjs";
import MAP from "./ui/js/map.mjs";
import TASKS from "./ui/js/tasks.mjs";
import AGENTS from "./ui/js/agents.mjs";
import PHONE from "./ui/js/phone.mjs";
import LINKS from "./ui/js/links.mjs";
import VAULT from "./ui/js/vault.mjs";
import SCREENS from "./ui/js/screens.mjs";
import MARKETING from "./ui/js/marketing.mjs";
import DASHBOARD from "./ui/js/dashboard.mjs";
import PAGES from "./ui/js/pages.mjs";
import WORKSCENE from "./ui/js/workscene.mjs";
import HOME from "./ui/js/home.mjs";
import TALK from "./ui/js/talk.mjs";
import LIQUID from "./ui/js/liquid.mjs";
import SETUP from "./ui/js/setup.mjs";

const HEAD = `<!doctype html><html><head><meta charset="utf8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" id="themecolor" content="#08090B">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><meta name="color-scheme" content="dark light"><title>Symbiot</title>
`;
const SCRIPT = [CORE, MAP, TASKS, AGENTS, PHONE, LINKS, VAULT, SCREENS, MARKETING, DASHBOARD, PAGES, WORKSCENE, HOME, TALK, LIQUID, SETUP];
export const EMBEDDED_UI = HEAD + STYLE + MARKUP + "<script>\n" + SCRIPT.join("") + "</script></body></html>";
