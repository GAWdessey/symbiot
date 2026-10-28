// Status (probes.mjs, watch.mjs): the states runs kept being started to check, read through their
// APIs as a watch. 31 status-check runs in 8 days asked "is the Meta template still in review", "is
// it on npm", "does the PR merge" (review of 20 Oct 2026, proposal 5). A change is news; a run starts
// only when there's something to do. Stand-ins for gh, npm and Meta. Isolated HOME.
//
//   node test/probes.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-probes-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot"); mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, "config.json"), JSON.stringify({}));
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got).slice(0, 500) : "")); } };
const P = await import("../probes.mjs");
const W = await import("../watch.mjs");
const lane = (name, files = {}) => { const p = join(HOME, "work", name); mkdirSync(join(p, ".symbiot"), { recursive: true }); for (const [f, t] of Object.entries(files)) writeFileSync(join(p, f), t); return p; };
const json = (o) => ({ ok: true, json: async () => o });

try {
  console.log("PRS — where each PR Symbiot opened stands, from gh");
  ok("merged, closed, conflicts, a failed check, checks running, ready", P.prState({ state: "MERGED" }) === "merged" && P.prState({ state: "CLOSED" }) === "closed" && P.prState({ state: "OPEN", mergeable: "CONFLICTING" }) === "has conflicts"
    && P.prState({ state: "OPEN", mergeable: "MERGEABLE", statusCheckRollup: [{ conclusion: "FAILURE" }] }) === "a check failed" && P.prState({ state: "OPEN", statusCheckRollup: [{ status: "IN_PROGRESS" }] }) === "checks running"
    && P.prState({ state: "OPEN", mergeable: "MERGEABLE", statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS" }] }) === "ready to merge");
  const now = Date.now(), tasks = [{ id: "a", repo: "symbiot", pr: "https://github.com/me/symbiot/pull/216", approvedAt: now - 3600000 }, { id: "b", repo: "symbiot", pr: "https://github.com/me/symbiot/pull/216", approvedAt: now }, { id: "c", repo: "bookly", pr: "https://github.com/me/bookly/pull/9", approvedAt: now - 40 * 86400000 }, { id: "d", repo: "x" }];
  ok("the PRs it opened lately, each once, with their lane", JSON.stringify(P.openedPrs(tasks, now)) === JSON.stringify([{ url: "https://github.com/me/symbiot/pull/216", lane: "symbiot" }]));
  const asked = [];
  const pi = await P.prItems({ prs: P.openedPrs(tasks, now), gh: async (args) => { asked.push(args.join(" ")); return JSON.stringify({ state: "OPEN", mergeable: "CONFLICTING" }); } });
  ok("one line each, what and where it stands", pi.length === 1 && pi[0].text === "PR symbiot#216 (symbiot): has conflicts" && pi[0].open && /pr view https:\/\/github\.com\/me\/symbiot\/pull\/216 --json/.test(asked[0]), [pi, asked]);
  ok("gh signed out or missing: nothing listed, no error", (await P.prItems({ prs: P.openedPrs(tasks, now), gh: async () => null })).length === 0);

  console.log("NPM — a published package's version on the registry");
  const sym = lane("symbiot", { "package.json": JSON.stringify({ name: "symbiot", version: "0.66.13" }) }), app = lane("bookly", { "package.json": JSON.stringify({ name: "bookly", version: "1.0.0" }) }), lib = lane("kit", { "package.json": JSON.stringify({ name: "@me/kit", version: "2.0.0", publishConfig: { access: "public" } }) });
  ok("Symbiot's and one with publishConfig; never an app's (someone else may own its name on npm)", P.packagesOf({ symbiot: sym, bookly: app, kit: lib }).map((p) => p.name).join() === "symbiot,@me/kit");
  const urls = [];
  const ni = await P.npmItems({ map: { symbiot: sym, bookly: app }, fetchFn: async (u) => { urls.push(u); return json({ version: "0.66.14" }); } });
  ok("its latest version, from the registry", ni.length === 1 && ni[0].text === "npm symbiot: 0.66.14 is the latest" && urls[0] === "https://registry.npmjs.org/symbiot/latest", [ni, urls]);

  console.log("META — WhatsApp templates in review, with the key in a lane's own .env");
  const wa = lane("whatsapp_module", { ".env": "WHATSAPP_ACCESS_TOKEN=EAAsecret123\nWABA_ID=1234567890\nOTHER=1\n" });
  ok("the account and its token, from the lane's .env", JSON.stringify(P.metaOf("whatsapp_module", wa)) === JSON.stringify({ lane: "whatsapp_module", waba: "1234567890", token: "EAAsecret123" }));
  ok("a lane with no such keys: none", P.metaOf("bookly", app) === null);
  const mu = [];
  const mi = await P.metaItems({ map: { whatsapp_module: wa, bookly: app }, fetchFn: async (u) => { mu.push(u); return json({ data: [{ name: "bookly_invite_v3", status: "PENDING", language: "en" }, { name: "bookly_invite_v1", status: "APPROVED", language: "en" }] }); } });
  ok("each template and where its review stands", mi.map((x) => x.text).join(" | ") === "WhatsApp template bookly_invite_v3 (en): in review | WhatsApp template bookly_invite_v1 (en): approved" && /graph\.facebook\.com\/v21\.0\/1234567890\/message_templates/.test(mu[0]), mi);
  ok("…and the token is only in the request, never in what's kept or shown", !JSON.stringify(mi).includes("EAAsecret123"));

  console.log("THE STATUS WATCH — the first read learns, a change is news, never a run of its own");
  const st = W.ensureStatusWatch();
  ok("it's there by itself, every 15 minutes", st && st.url === P.STATUS_URL && st.every === 15 && W.ensureStatusWatch().id === st.id);
  let list = [{ text: "WhatsApp template bookly_invite_v3 (en): in review", kind: "meta", lane: "whatsapp_module", subject: "bookly_invite_v3", state: "in review" }], acted = [];
  const deps = { states: async () => ({ url: P.STATUS_URL, list, via: "api" }), act: (items) => { acted.push(...items); }, notify: () => {}, brief: async () => "" };
  const r1 = await W.checkWatch(st.id, deps);
  ok("first read: learns what's there, no news, nothing started", r1.learned === 1 && !acted.length && !JSON.parse(readFileSync(W.WATCH_FILE, "utf8")).news.length, r1);
  const r2 = await W.checkWatch(st.id, deps);
  ok("the same states again: nothing new", !(r2.new || []).length && !acted.length, r2);
  list = [{ text: "WhatsApp template bookly_invite_v3 (en): approved", kind: "meta", lane: "whatsapp_module", subject: "bookly_invite_v3", state: "approved" }];
  const r3 = await W.checkWatch(st.id, deps);
  ok("it's approved: that's news", (r3.new || []).length === 1 && r3.new[0].text === "WhatsApp template bookly_invite_v3 (en): approved", r3);
  ok("…and what changed goes to what it may start", acted.length === 1 && acted[0].subject === "bookly_invite_v3", acted);
  const board = W.watchBoard(24).cards.find((c) => c.url === P.STATUS_URL);
  ok("the Dashboard's Status card counts it as a change", board && board.label === "1 change" && board.source === "status", board);

  console.log("SOMETHING TO DO — a run only then");
  const dl = lane("acme2"); writeFileSync(join(dl, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Once Meta approves bookly_invite_v3, switch the server to it\n- [x] done one\n");
  const quiet = lane("atlas"); writeFileSync(join(quiet, ".symbiot", "TASKS.md"), "## Tasks\n- [ ] Fix the header\n");
  const added = [], ran = [];
  const did = P.actOn([{ text: "WhatsApp template bookly_invite_v3 (en): approved", kind: "meta", subject: "bookly_invite_v3", state: "approved" }, { text: "PR symbiot#216 (symbiot): has conflicts", href: "https://github.com/me/symbiot/pull/216", kind: "pr", lane: "symbiot", subject: "symbiot#216", state: "has conflicts", open: true }, { text: "PR atlas#3 (atlas): closed", kind: "pr", lane: "atlas", subject: "atlas#3", state: "closed", open: false }],
    { map: { acme2: dl, atlas: quiet }, add: (t, l) => { added.push([t, l]); return { id: "t" + added.length }; }, run: (p) => ran.push(p) });
  ok("the lane whose open task names it is told, and started", ran.join() === dl && /### Symbiot: WhatsApp template bookly_invite_v3 \(en\): approved/.test(readFileSync(join(dl, ".symbiot", "ANSWERS.md"), "utf8")), [ran, did]);
  ok("…a lane whose tasks don't name it isn't", !ran.includes(quiet));
  ok("an open PR of Symbiot's with conflicts becomes its lane's task, on the same branch", added.length === 1 && added[0][1] === "symbiot" && /has conflicts with main: rebase its branch on main/.test(added[0][0]) && /Don't open a new PR/.test(added[0][0]), added);
  const J = await import("../jobs.mjs"), blocked = J.loadJobs().find((j) => j.key === J.prKey("symbiot", "https://github.com/me/symbiot/pull/216"));
  ok("…and its job record says blocked: conflicts, not merge queued", blocked && blocked.state === "blocked" && /conflicts/.test(J.jobLine(blocked) + blocked.note) && !/merge queued/.test(J.jobLine(blocked)), blocked);
  P.actOn([{ text: "PR symbiot#216 (symbiot): ready to merge", href: "https://github.com/me/symbiot/pull/216", kind: "pr", lane: "symbiot", subject: "symbiot#216", state: "ready to merge", open: true }], { map: {} });
  ok("…and approved again once GitHub has no objection", J.loadJobs().find((j) => j.key === blocked.key).state === "approved");
  ok("…a PR you closed is left alone", !added.some((a) => /atlas#3/.test(a[0])));

  console.log("STOPPED BY YOU — stays stopped");
  W.removeWatch(st.id);
  ok("removed, it isn't added back at the next start", W.ensureStatusWatch() === null && !JSON.parse(readFileSync(W.WATCH_FILE, "utf8")).watches.some((w) => w.url === P.STATUS_URL));

  console.log("PRS A TEXT NAMES — GitHub's word, on the repo's current remote");
  {
    const asked = [], states = { "321": { state: "MERGED", mergedAt: "2026-10-28T08:47:31Z", title: "Answered" }, "400": { state: "CLOSED", title: "Old" } };
    const gh = async (a) => { asked.push(a.join(" ")); const n = a[2]; return states[n] ? JSON.stringify(states[n]) : "no pull requests found"; };
    const git = async () => "https://github.com/GAWdessey/symbiot.git\n";
    ok("PR numbers are read in each wording", JSON.stringify(P.prRefs("PRs 321 and 322, then PR #400 and #55 and issue#9").map((r) => r.n)) === JSON.stringify(["321", "322", "400", "55"]), P.prRefs("PRs 321 and 322, then PR #400 and #55"));
    const lanes = { symbiot: "/p/symbiot", lanex: "/p/lanex" };
    const f = await P.prFacts("- [symbiot] they were written but never merged: PRs 321 and 400, and #999", { gh, git, lanes });
    ok("merged says merged, with the day", /^PR #321 \(GAWdessey\/symbiot\): merged on 2026-10-28/.test(f[0]), f);
    ok("closed says closed, not merged", /^PR #400 .*: closed, not merged/.test(f[1]), f);
    ok("a number GitHub does not know says no such PR", /^PR #999 .*: no such PR/.test(f[2]), f);
    ok("it asks the current remote's repo", asked.every((a) => a.includes("-R GAWdessey/symbiot")), asked);
    ok("gh unreachable says nothing rather than guessing", (await P.prFacts("symbiot: PR 321", { gh: async () => null, git, lanes })).length === 0);
    // lanex's #612 (28 Oct 2026): looked up in nvm-sh/nvm, the git repo Symbiot's install folder sits in
    const asked2 = [], dirs = [];
    const gh2 = async (a) => { asked2.push(a.join(" ")); return JSON.stringify({ state: "MERGED", mergedAt: "2026-10-28T09:00:00Z", title: "Realtime pitch" }); };
    const git2 = async (_a, dir) => { dirs.push(dir); return dir === "/p/lanex" ? "git@github.com:GarthGhostai/lanex.git\n" : "https://github.com/GAWdessey/symbiot.git\n"; };
    const ctx = "- lanex [lanex] (finished)\n    said: I pushed to PR #612, the only open PR… needs Garth's hand merge\n- symbiot [symbiot] (finished)\n    outcome: #322 merged";
    const g = await P.prFacts(ctx + "\nhas #612 merged?", { gh: gh2, git: git2, lanes });
    ok("a bare number is looked up in the repo of the lane its line names", g.some((x) => /^PR #612 \(GarthGhostai\/lanex\): merged/.test(x)) && g.some((x) => /^PR #322 \(GAWdessey\/symbiot\)/.test(x)), g);
    ok("…the user's own mention of it is that same PR, asked once", asked2.filter((a) => / 612 /.test(a)).length === 1, asked2);
    ok("…and never in the folder Symbiot runs from", dirs.every((d) => d === "/p/lanex" || d === "/p/symbiot"), dirs);
    ok("a bare number no line ties to a lane is not looked up in a guessed repo", (await P.prFacts("PR 310 is open", { gh: async () => { throw new Error("called"); }, git, lanes })).length === 0);
    ok("owner/repo#n is read as that repo's PR", JSON.stringify(P.prRefs("see GarthGhostai/lanex#612")) === JSON.stringify([{ slug: "GarthGhostai/lanex", n: "612" }]));
    P.prLive.clear();
    const live0 = P.prLive("/p/lanex", 612, { gh: gh2, git: git2 });
    await P.prLive.wait("/p/lanex", 612);
    ok("a card's PR state is unknown until GitHub answers, then GitHub's word", live0 === "" && P.prLive("/p/lanex", 612, { gh: gh2, git: git2 }) === "merged");
    ok("no PR named, no call", (await P.prFacts("nothing here", { gh: async () => { throw new Error("called"); }, git })).length === 0);
  }
} catch (e) { ok("ran", false, String((e && e.stack) || e)); }
finally { rmSync(HOME, { recursive: true, force: true }); }
console.log(`\n${fail ? "✗" : "✓"} probes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
