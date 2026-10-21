// An idea an agent tagged for another lane (agents.mjs routeIdeas, home.mjs workScene).
// On 2026-10-20 the bookly agent's card on Home showed two ideas tagged "for symbiot"
// (a Chrome fix for `symbiot screens`, a walk-through recorder), and the user asked why
// they were under bookly. They're symbiot's: they show on symbiot's card and project
// sheet, the bookly card keeps one line ("2 ideas sent to symbiot"), and + task and
// Skip work the same from there. Isolated HOME (set before the modules load).
//
//   node test/ideas.mjs
//
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-ideas-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const C = join(HOME, ".config", "symbiot");
mkdirSync(C, { recursive: true });
writeFileSync(join(C, "config.json"), JSON.stringify({ scanRoots: [join(HOME, "work")] }));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 400) : "")); } };
const a = await import("../agents.mjs");
const { workScene } = await import("../home.mjs");

const CHROME = "Chrome inside a lane's sandbox hangs on Google's sites over HTTP/2 through the network proxy: build --disable-http2 into symbiot screens";
const FILM = "Offer a record this walk-through action that runs in the user's signed-in Chrome";
const bookly = join(HOME, "work", "bookly"), symbiot = join(HOME, "work", "symbiot");
for (const d of [bookly, symbiot]) mkdirSync(join(d, ".symbiot"), { recursive: true });
writeFileSync(join(bookly, ".symbiot", "QUESTIONS.md"), `## Suggestions\n- [repo: symbiot] ${CHROME}\n- [repo: symbiot] ${FILM}\n- Retry the broker invite once Meta approves it\n`);
writeFileSync(join(symbiot, ".symbiot", "QUESTIONS.md"), "## Suggestions\n- Cache the map scan\n");
writeFileSync(join(C, "runs.json"), JSON.stringify([{ path: bookly, name: "bookly", startedAt: 1 }, { path: symbiot, name: "symbiot", startedAt: 1 }]));
const card = (path, name, status = "done") => ({ id: name, name, path, status, startedAt: Date.now() - 60e3, ask: a.agentQuestions(path, name) });

console.log("ON ITS LANE'S CARD — an idea for symbiot leaves bookly's card for symbiot's");
{
  const [d, s] = a.routeIdeas([card(bookly, "bookly", "running"), card(symbiot, "symbiot")]);
  ok("the bookly card keeps only its own idea", d.ask.suggestions.map((x) => x.text).join("|") === "Retry the broker invite once Meta approves it", d.ask.suggestions);
  ok("...and one line saying where the others went", d.ask.sent && d.ask.sent.length === 1 && d.ask.sent[0].repo === "symbiot" && d.ask.sent[0].n === 2, d.ask.sent);
  ok("the symbiot card shows them after its own, marked from bookly", s.ask.suggestions.map((x) => x.text).join("|") === `Cache the map scan|${CHROME}|${FILM}` && s.ask.suggestions.slice(1).every((x) => x.from === "bookly" && x.repo === "symbiot" && !x.other), s.ask.suggestions);
  ok("...each keeping the folder that raised it, so Skip notes it there", s.ask.suggestions.slice(1).every((x) => x.path === bookly), s.ask.suggestions);
  ok("...and the source knows they were delivered", d.ask.away.length === 2 && d.ask.away.every((x) => x.delivered && x.from === "bookly"), d.ask.away);

  // Skip on symbiot's card: the idea is turned down where it was raised, and leaves both cards
  const sk = a.skipIdea(s.ask.suggestions[1].path, s.ask.suggestions[1].text);
  const skMd = existsSync(join(bookly, ".symbiot", "SKIPPED.md")) ? readFileSync(join(bookly, ".symbiot", "SKIPPED.md"), "utf8") : "";
  const [d2, s2] = a.routeIdeas([card(bookly, "bookly", "running"), card(symbiot, "symbiot")]);
  ok("Skip from symbiot's card turns it down in bookly's folder, so bookly's agent isn't told to suggest it again", sk.ok && skMd.includes(CHROME), [sk, skMd]);
  ok("...and it's gone from both cards", !s2.ask.suggestions.some((x) => x.text === CHROME) && d2.ask.sent[0].n === 1, [s2.ask.suggestions, d2.ask.sent]);
}

console.log("NO DUPLICATES — an idea already a task, or already the lane's own, isn't shown again");
{
  writeFileSync(join(C, "tasks.json"), JSON.stringify([{ id: "t1", text: FILM, repo: "symbiot", done: false }]));
  const [d, s] = a.routeIdeas([card(bookly, "bookly"), card(symbiot, "symbiot")]);
  ok("one already in symbiot's Tasks leaves both cards", !s.ask.suggestions.some((x) => x.text === FILM) && !(d.ask.away || []).length && !d.ask.sent, [s.ask.suggestions, d.ask]);
  writeFileSync(join(C, "tasks.json"), "[]");
  writeFileSync(join(symbiot, ".symbiot", "QUESTIONS.md"), `## Suggestions\n- ${FILM}.\n`);
  const [, s3] = a.routeIdeas([card(bookly, "bookly"), card(symbiot, "symbiot")]);
  ok("one symbiot's own agent had in nearly the same words is there once", s3.ask.suggestions.filter((x) => /walk-through/.test(x.text)).length === 1, s3.ask.suggestions);
  const t = a.routeIdeas([card(bookly, "bookly")])[0];
  ok("no symbiot card here: the bookly card still says where they went, and holds them as not delivered", t.ask.sent[0].n === 1 && t.ask.away.length === 1 && !t.ask.away[0].delivered && !t.ask.suggestions.some((x) => x.other), t.ask);
}

console.log("ON ITS LANE'S PROJECT SHEET — Home's relay");
{
  const now = Date.now(), deps = (agents) => ({ agents: () => agents, pending: () => [], tasks: () => [], repos: () => ({ bookly, symbiot }), name: (p, n) => n, parked: () => [], handing: () => [], drafts: () => [], dismissed: () => ({}) });
  const raw = [{ name: "bookly", path: bookly, status: "running", startedAt: now - 60e3, work: { doing: "Fixing the invite" }, ask: { questions: [], suggestions: [{ text: CHROME, repo: "symbiot", other: true }, { text: FILM, repo: "symbiot", other: true }, { text: "Retry the invite", repo: "bookly" }] } }];
  for (const [how, list] of [["as an agent lists them (routed, no symbiot card)", a.routeIdeas(raw)], ["as they come, unrouted", raw]]) {
    const r = workScene({ deps: deps(list) }), d = r.projects.find((p) => p.repo === "bookly") || {}, s = r.projects.find((p) => p.repo === "symbiot") || {};
    ok(`${how}: symbiot's sheet carries them, marked from bookly, Skip noted in bookly's folder`, (s.ideas || []).map((x) => x.full).join("|") === `${CHROME}|${FILM}` && s.ideas.every((x) => x.from === "bookly" && x.repo === "symbiot" && x.path === bookly), s.ideas);
    ok(`${how}: bookly's sheet keeps its own idea and one line`, (d.ideas || []).map((x) => x.full).join("|") === "Retry the invite" && d.sent && d.sent[0].repo === "symbiot" && d.sent[0].n === 2, [d.ideas, d.sent]);
  }
  const both = a.routeIdeas([raw[0], { name: "symbiot", path: symbiot, status: "done", startedAt: now - 60e3, work: { final: "Done." }, ask: { questions: [], suggestions: [] } }]);
  const r = workScene({ deps: deps(both) }), s = r.projects.find((p) => p.repo === "symbiot") || {}, d = r.projects.find((p) => p.repo === "bookly") || {};
  ok("with a symbiot card: they're on its sheet once, and bookly's still says where they went", (s.ideas || []).length === 2 && s.ideas.every((x) => x.from === "bookly" && x.path === bookly) && d.sent && d.sent[0].n === 2 && d.ideas.length === 1, [s.ideas, d]);
}

console.log("DRAWN — both places, the same buttons");
{
  const ui = readFileSync(new URL("../ui.mjs", import.meta.url), "utf8");
  ok("the agent card draws the pointer line, and ideas from another agent tagged with it", /idea"\+\(x\.n>1\?"s":""\)\+" sent to "\+esc\(x\.repo\)/.test(ui) && />from "\+esc\(s\.from\)/.test(ui), "");
  ok("...Skip on a card is sent with the folder that raised the idea", /api\('\/api\/agents\/skip',\{path:s\.path\|\|a\.path,text:s\.text\}\)/.test(ui), "");
  ok("Home's relay draws the pointer, and the idea's source", /p\.sent\.map\(function\(x\)/.test(ui) && /d\.from\?" <small class='rlfrom'>from "/.test(ui), "");
}

rmSync(HOME, { recursive: true, force: true });
console.log((fail ? "✗" : "✓") + " ideas: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
