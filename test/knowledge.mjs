// Knowledge (knowledge.mjs): folders of your own documents that chats quote and
// cite. A small made-up company folder in an isolated HOME (set before the modules
// load); the model is a stand-in that only records the prompt it was given.
//
//   node test/knowledge.mjs
//
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync, unlinkSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-know-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, ".config", "symbiot"), { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const K = await import("../knowledge.mjs");
const { converse } = await import("../mind.mjs");
const { loadConfig } = await import("../core.mjs");

// ---- a tiny company folder ----------------------------------------------------------
const CO = join(HOME, "Co");
const put = (rel, text) => { const p = join(CO, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, text); return p; };
put("README.md", "# Co\n\nHow work flows at Co.\n");
put("sales/renewals/README.md", `# Renewals

**Department:** Sales
**Who does it:** Account managers
**When:** 90 days before a contract ends

## Steps
1. Check the account's health
2. Send the renewal quote

## Hands off to
- Finance

## What Symbiot should learn and remember
Each customer's renewal date and notice period.
`);
put("sales/renewals/templates/renewal-letter.md", "# Renewal letter\n\nDear Pelican Freight, your Zephyrcorp subscription renews at R9,999 a month.\n");
put("sales/renewals/active/2026-10-bluegum-renewal/STATUS.md", `---
item: Bluegum Logistics renewal, notice by 30 November
case: sales/renewals
owner: Thandi Mokoena
people: [Garth White, Sipho Dube]
status: Waiting
due: 2026-11-30
next_step: Garth signs off the discount
waiting_on: Garth White (discount sign-off)
---

# Bluegum Logistics renewal

## Where it stands
Bluegum wants a 12% discount for a two-year term.
`);
put("sales/renewals/active/2026-09-acacia-renewal/STATUS.md", "---\nitem: Acacia Mining renewal\nowner: Garth White\nstatus: In progress\ndue: 2026-10-20\nwaiting_on: Sipho Dube (usage numbers)\n---\n\n# Acacia\n");
put("sales/renewals/active/2026-08-old-renewal/STATUS.md", "---\nitem: Marula renewal\nowner: Garth White\nstatus: Done\nwaiting_on: Garth White\n---\n");
put("sales/prices.csv", 'plan,price_excl_vat,notes\nStarter,"R1,200",for up to 5 users\nOrbital Plus,"R4,800","priority support, ""gold"" tier"\n');
put("notes.txt", "Office wifi password rotates every quarter. Ask Lerato in IT for the new one.\n");
put("sales/old-demo.md", "---\nexample: true\n---\n# Demo deal\n\nQuokka Industries signed for 400 seats.\n");
put("contracts/msa.pdf", "%PDF-1.4 not really");
put("contracts/terms.docx", "PK not really");
writeFileSync(join(HOME, ".config", "symbiot", "config.json"), JSON.stringify({ myName: "Garth White" }));

try {
  console.log("FOLDERS — a setting next to scanRoots");
  ok("a folder that isn't there says so", /folder not found/.test(K.addKnowledgeFolder(join(HOME, "nope")).error || ""));
  const a = K.addKnowledgeFolder("~/Co");
  ok("added with ~, examples default to templates/", a.ok && loadConfig().knowledgeFolders[0].path === CO && loadConfig().knowledgeFolders[0].examples.join() === "templates/", loadConfig().knowledgeFolders);
  ok("templates/ is that folder at any depth; /x/ only at the top; a file name is that file",
    K.isExample("sales/renewals/templates/a.md", ["templates/"]) && !K.isExample("sales/active/a.md", ["templates/"]) && !K.isExample("sales/active/a.md", ["/active/"]) && K.isExample("active/a.md", ["/active/"]) && K.isExample("x/notes.md", ["notes.md"]), "");

  console.log("INDEX — md, csv, txt read; the rest counted; only changes re-read");
  const r1 = K.indexKnowledge();
  ok("every .md, .csv and .txt read", r1.read === 9 && r1.files === 9, r1);
  ok("kept on this computer, yours only (0600)", (statSync(K.KNOW_FILE).mode & 0o777) === 0o600, (statSync(K.KNOW_FILE).mode & 0o777).toString(8));
  const st = K.knowledgeState();
  ok("PDF and Word counted as not read yet", st.folders[0].notRead.pdf === 1 && st.folders[0].notRead.docx === 1, st.folders[0].notRead);
  ok("the state counts examples, cases and open items", st.folders[0].exampleFiles === 2 && st.folders[0].cases === 1 && st.folders[0].items === 2 && st.me === "Garth White", st.folders[0]);
  const r2 = K.indexKnowledge();
  ok("nothing changed: nothing read again", r2.read === 0 && r2.kept === 9, r2);
  const np = put("notes.txt", "Office wifi password rotates every month now. Ask Lerato in IT for the new one, or the front desk.\n");
  utimesSync(np, new Date(), new Date(Date.now() + 5000));
  const r3 = K.indexKnowledge();
  ok("one file changed: only that one is read", r3.read === 1 && r3.kept === 8, r3);
  ok("…and search sees the new text", /every month now/.test((K.searchKnowledge("wifi password")[0] || {}).excerpt || ""), K.searchKnowledge("wifi password"));
  unlinkSync(join(CO, "sales", "old-demo.md"));
  const r4 = K.indexKnowledge();
  ok("a deleted file is dropped", r4.removed === 1 && r4.files === 8, r4);

  console.log("SEARCH — cites the file it came from");
  const s = K.searchKnowledge("how much is Orbital Plus");
  ok("a CSV row, with its file and row", s[0] && s[0].cite === "~/Co/sales/prices.csv" && s[0].where === "row 3" && /plan: Orbital Plus; price_excl_vat: R4,800; notes: priority support, "gold" tier/.test(s[0].excerpt), s[0]);
  const t = K.searchKnowledge("who does renewals hand off to");
  ok("a Markdown section, under its heading", t.some((h) => h.rel === "sales/renewals/README.md" && /Hands off to|Renewals/.test(h.where)), t);
  ok("a word finds the longer words it starts (renew: renewal)", K.searchKnowledge("renew").some((h) => h.rel === "sales/renewals/README.md"), K.searchKnowledge("renew"));
  ok("examples aren't found as facts", !K.searchKnowledge("Zephyrcorp subscription").length && !K.searchKnowledge("Quokka seats").length, K.searchKnowledge("Zephyrcorp"));
  put("sales/old-demo.md", "---\nexample: true\n---\n# Demo deal\n\nQuokka Industries signed for 400 seats.\n"); K.indexKnowledge();
  const ex = K.searchKnowledge("Zephyrcorp subscription", { examples: true }), qx = K.searchKnowledge("Quokka seats", { examples: true });
  ok("…only when asked for, and marked: templates/ and front matter example: true", ex[0] && ex[0].example && qx[0] && qx[0].example, [ex, qx]);

  console.log("CASES — what's waiting on you, who owns it");
  const w = K.waitingOn();
  ok("waiting on you: the open item whose waiting_on names you", w.me === "Garth White" && w.waiting.length === 1 && /Bluegum/.test(w.waiting[0].title) && w.waiting[0].cite.endsWith("2026-10-bluegum-renewal/STATUS.md"), w.waiting);
  ok("yours: the open items you own (a done one isn't)", w.mine.length === 1 && /Acacia/.test(w.mine[0].title), w.mine);
  ok("a first name counts, and a git name like GarthGhostai", K.namesYou("Garth (sign-off)", "Garth White") && K.namesYou("Garth (sign-off)", "GarthGhostai") && !K.namesYou("Gartha", "Garth White"), "");
  const o = K.ownerOf("who owns the Bluegum renewal?");
  ok("who owns it: the item's owner, with its file", o[0] && o[0].kind === "item" && o[0].owner === "Thandi Mokoena" && /STATUS\.md$/.test(o[0].cite), o);
  const oc = K.ownerOf("who handles renewals");
  ok("…or the case's Who does it", oc.some((x) => x.kind === "case" && x.who === "Account managers" && /Finance/.test(x.handsOff)), oc);

  console.log("CHATS — converse quotes and cites; never an example");
  let seen = "";
  const ask = async (sys, p) => { seen = p; return JSON.stringify({ reply: "ok", do: null, remember: [] }); };
  const c1 = await converse({ where: "Home", question: "how much does Orbital Plus cost?", ask, map: {} });
  ok("the chat gets the excerpt and its path, and is told to quote and cite", /~\/Co\/sales\/prices\.csv › row 3: "plan: Orbital Plus/.test(seen) && /quote the words you rely on and cite its path/.test(seen), seen.slice(0, 600));
  ok("…a few short excerpts, not documents", (seen.match(/^- ~\//gm) || []).length <= 3 && seen.length < 3000, seen.length);
  ok("the steps under the reply say it read your files", c1.steps.some((x) => /read sales\/prices\.csv|of your files: .*sales\/prices\.csv/.test(x)), c1.steps);
  await converse({ where: "Home", question: "what's the Zephyrcorp price in the renewal letter?", ask, map: {} });
  ok("example content never reaches a chat", !/Zephyrcorp subscription renews|R9,999/.test(seen), seen.slice(0, 600));
  await converse({ where: "Home", question: "what's waiting on me?", ask, map: {} });
  ok("what's waiting on me: the case items, from their front matter", /waiting on Garth White, [^\n]*\(cite the file[^\n]*:\n- Bluegum Logistics renewal, notice by 30 November · Waiting · due 2026-11-30 · owner Thandi Mokoena · waiting on Garth White \(discount sign-off\)/.test(seen) && /Open items Garth White owns:\n- Acacia Mining renewal/.test(seen) && !/Marula/.test(seen), seen.slice(0, 900));
  await converse({ where: "Home", question: "who owns the Bluegum renewal?", ask, map: {} });
  ok("who owns X: the owner, from the case files", /Who owns it, from their case files[^\n]*:\n- item: Bluegum Logistics renewal.*owner Thandi Mokoena/.test(seen), seen.slice(0, 900));

  console.log("EXAMPLES — set per folder, e.g. templates/ and active/");
  K.addKnowledgeFolder(CO, "templates/, active/"); const re = K.indexKnowledge();
  ok("changing a folder's examples re-flags without reading again", re.read === 0, re);
  ok("active/ items are now examples: nothing waiting on you, no item's owner answered (the real case README still is)", K.waitingOn().waiting.length === 0 && !K.ownerOf("Bluegum renewal").some((x) => x.kind === "item") && K.ownerOf("Bluegum renewal").some((x) => x.kind === "case"), [K.waitingOn(), K.ownerOf("Bluegum renewal")]);
  ok("…unless asked for, and then marked", K.waitingOn("", { examples: true }).waiting.some((i) => i.example), K.waitingOn("", { examples: true }).waiting);
  await converse({ where: "Home", question: "what's waiting on me?", ask, map: {} });
  const kpart = seen.split("This chat so far:")[0]; // Home's own thread (its earlier answers) comes after
  ok("…and a chat says none rather than an example", /waiting on Garth White, [^\n]*:\n- none/.test(kpart) && !/Bluegum/.test(kpart), kpart.slice(0, 600));

  console.log("REMOVE");
  const rm = K.removeKnowledgeFolder("~/Co"), r5 = K.indexKnowledge();
  ok("removing a folder drops its files from the index", rm.ok && !loadConfig().knowledgeFolders && r5.files === 0 && !K.searchKnowledge("wifi").length, r5);
  ok("an unknown folder says so", /Not a knowledge folder/.test(K.removeKnowledgeFolder("/nowhere").error || ""));
  ok("CSV fields: quotes, commas and newlines", JSON.stringify(K.csvRows('a,b\n"x, y","say ""hi""\nthere"\n')) === JSON.stringify([["a", "b"], ["x, y", 'say "hi"\nthere']]), K.csvRows('a,b\n"x, y","say ""hi""\nthere"\n'));
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
console.log(`\n${fail ? "✗" : "✓"} knowledge: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
