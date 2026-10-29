// The preview on a question's card (preview.mjs): a question that says "as shown" draws what it shows (the
// pictures, the fields, the long text, the "Then" list), and one that can't show it all stops saying so. The
// real case: a marketing lane's "Create the company's LinkedIn page as shown?" of 29 Oct 2026, its names made up here. Files in a temp folder.
//
//   node test/preview.mjs
//
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewOf, previewFile, picSize, missingNote, dropShown } from "../preview.mjs";
import { parseQuestions, QLINES } from "../agents.mjs";

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

// a PNG of a given size: only its header is read
const png = (w, h) => { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write("IHDR", 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const lane = mkdtempSync(join(tmpdir(), "symbiot-preview-")), tray = join(lane, ".symbiot", "tray", "bookwell-page");
mkdirSync(tray, { recursive: true });
writeFileSync(join(tray, "cover.png"), png(1128, 191)); writeFileSync(join(tray, "logo.png"), png(400, 400)); writeFileSync(join(tray, "logo-48.png"), png(48, 48));
writeFileSync(join(lane, "secret.png"), png(10, 10)); writeFileSync(join(tray, "notes.md"), "# not a picture\n");
try { symlinkSync("/etc/hostname", join(tray, "link.png")); } catch {}

const MD = `## Questions

### Create Bookwell's LinkedIn page as shown? {#bookwell-linkedin-page}
Nothing is on LinkedIn yet. I checked first: no Bookwell page exists that you run (proof in \`.symbiot/tray/bookwell-page/slug-check-*.png\`).

Legal name: Bookwell (Pty) Ltd.

![cover](tray/bookwell-page/cover.png) ![logo](tray/bookwell-page/logo.png) ![logo at 48px](tray/bookwell-page/logo-48.png)
(cover 1128×191, with a 2256×382 copy to upload; logo 400×400; feed-size check at 48px. The images are in \`.symbiot/tray/bookwell-page/\`.)

Name ......... Bookwell
Address ...... linkedin.com/company/bookwell   (free ✓ checked 29 Oct on LinkedIn's setup form)
Website ...... https://bookwell.example
Industry ..... Software Development
Size ......... 2-10 employees
Type ......... Privately held
Founded ...... 2026
Location ..... Randburg, Gauteng, South Africa   (street address not shown)
Tagline ...... Confirmed appointments in your diary. SA brokers pay only for verified meetings, never for dials.
Email ........ hello@bookwell.example
About ........
  > Bookwell phones consented prospects for independent advisers.
  >
  > How it works: you top up a prepaid wallet.
  >
  > You advise. We dial.

Then: you as super admin · the post (\`drafts/bookwell/2026-10-30-linkedin-diary-clip.md\`) moves to the page · [x] add "Founder, Bookwell" to your Experience · [ ] post it again
- 🤖 Agent: create it as shown, through Symbiot's signed-in browser, then do everything under "Then" (recommended)
- 🤖 Agent: change something first (say what), then show you the preview again
`;
const parsed = (md) => { const q = parseQuestions(md, { linked: [] }).questions[0]; return { q, lines: QLINES.get(q) }; };
const pv = (md, dir = lane) => { const { q, lines } = parsed(md); return { q, p: previewOf(dir, lines, { q: q.q, options: q.options, src: (f) => "/m?f=" + f }) }; };

// the question itself reads as before: its options are its choices, its context one line
{
  const { q, lines } = parsed(MD);
  ok("the question keeps its two choices", q.options.length === 2 && /create it as shown/.test(q.options[0]), q.options);
  ok("its context is still the one line other screens read", typeof q.context === "string" && !q.context.includes("\n") && q.context.includes("Name ......... Bookwell"));
  ok("its lines are kept beside it, blank lines too", Array.isArray(lines) && lines.includes("") && lines.includes("Name ......... Bookwell"), lines && lines.slice(0, 4));
  ok("but not in it: a question's keys are as before", !("lines" in q) && !("parts" in q), Object.keys(q));
}

const { p } = pv(MD);
ok("the three pictures are pictures, with their names and sizes", p.pics.length === 3 && p.pics.map((x) => x.alt).join("|") === "Cover|Logo|Logo at 48px" && p.pics[0].size === "1128×191" && p.pics[2].size === "48×48", p.pics);
ok("each loads from the card's own address", p.pics.every((x) => x.state === "ok" && x.src === "/m?f=" + x.f));
ok("the sentence naming their sizes is their caption, with no file path", /^Cover 1128×191, with a 2256×382 copy to upload · logo 400×400 · feed-size check at 48px$/.test(p.caption), p.caption);
ok("the 10 fields read label → value", p.fields.length === 10 && p.fields[0].label === "Name" && p.fields[0].value === "Bookwell" && p.fields[9].label === "Email", p.fields.map((f) => f.label));
ok("the bracketed text after a value is its note", p.fields[1].value === "linkedin.com/company/bookwell" && p.fields[1].note === "free ✓ checked 29 Oct on LinkedIn's setup form", p.fields[1]);
ok("a link in a value stays whole", p.fields[2].value === "https://bookwell.example", p.fields[2]);
ok("the quote is the long text, in paragraphs, under About", p.long && p.long.label === "About" && p.long.paras.length === 3 && p.long.paras[2] === "You advise. We dial.", p.long);
ok("Then: is the after-that list, ticks as ticks", p.then.length === 4 && p.then[0].text === "You as super admin" && p.then[2].checked === true && p.then[3].checked === false && p.then[0].checked === undefined, p.then);
ok("a file path in the list goes, with its brackets", p.then[1].text === "The post moves to the page", p.then[1]);
ok("the lead-in keeps its paragraphs, without the file path", p.lead.length === 2 && !/\.symbiot/.test(p.lead.join(" ")) && p.lead[1] === "Legal name: Bookwell (Pty) Ltd.", p.lead);
ok("its heading says what's approved", p.heading === "Preview · what will be created", p.heading);
ok("everything shown: no warning, no rewording, nothing missing", !p.warn && !p.shown && !p.missing && missingNote(p) === "", p);
// critic, 29 Oct: the button named a "Then" heading the card titles "After that", and began in lower case
ok("the first button names the card's \"After that\" heading, with a capital", p.labels && p.labels[0] === '🤖 Agent: Create it as shown, through Symbiot\'s signed-in browser, then do everything under "After that" (recommended)' && p.labels[1] === "🤖 Agent: Change something first (say what), then show you the preview again", p.labels);
ok("the lead-in leaves out the bracket about where the proof is", p.lead[0] === "Nothing is on LinkedIn yet. I checked first: no Bookwell page exists that you run.", p.lead[0]);
{
  const w = pv(MD.replace("Legal name: Bookwell (Pty) Ltd.", "Legal name: Bookwell (Pty) Ltd, from `COR21.1_conf.pdf` in ~/Downloads, under the `bookwell` and `bookwell-ai` names.")).p;
  ok("…and says paths and code in plain words", w.lead[1] === "Legal name: Bookwell (Pty) Ltd, from COR21.1_conf.pdf in your Downloads folder, under the bookwell and bookwell-ai names.", w.lead[1]);
}
ok("the phone says where the preview is", p.away === "Preview on your computer: 3 pictures, 10 details. Open the Workdesk there to see it.", p.away);
ok("no ![ anywhere in what the card reads", !JSON.stringify({ ...p, pics: p.pics.map((x) => x.alt) }).includes("!["));

// a picture that isn't there: its gap is named, and the card stops saying "as shown"
{
  const { p: m } = pv(MD.replace("tray/bookwell-page/cover.png", "tray/bookwell-page/gone.png"));
  ok("a missing picture is a named gap", m.pics[0].state === "missing" && m.pics[0].gap === "gone.png isn't in this lane's files" && !m.pics[0].src, m.pics[0]);
  ok("the warning names it", m.warn === "Part of the preview couldn't be shown: gone.png is missing. Check before you approve.", m.warn);
  ok("the question drops \"as shown\"", m.shown === "Create Bookwell's LinkedIn page?", m.shown);
  ok("so does its first button", m.labels && !/as shown/i.test(m.labels[0]) && /Create it, through/.test(m.labels[0]), m.labels);
  ok("the phone counts only the pictures the card can draw, and names the gap", m.away === "Preview on your computer: 2 pictures, 10 details. gone.png couldn't be shown. Open the Workdesk there to see it.", m.away);
  ok("and the agent is told what the card couldn't show", missingNote(m) === "(the card couldn't show: gone.png)", missingNote(m));
}
// nothing that can be drawn, but the words point at a preview
{
  const bare = MD.split("\n").filter((l) => !/^!\[|^\(cover|\.{3,}|^\s*>/.test(l)).join("\n");
  const { p: n } = pv(bare);
  ok("no panel when nothing can be drawn", !n.heading && !n.pics && !n.fields && !n.long, Object.keys(n));
  ok("the warning says none came with it", n.warn === "This question mentions a preview, but none came with it. Ask the agent for it before you approve.", n.warn);
  ok("the card offers to ask for it, in the agent's words", /^Show me the preview on the card/.test(n.ask), n.ask);
  ok("and its words drop \"as shown\"", n.shown === "Create Bookwell's LinkedIn page?", n.shown);
}
// outside the lane's files: never served, a named gap
{
  const { p: o } = pv(MD.replace("tray/bookwell-page/logo-48.png", "../../secret.png").replace("tray/bookwell-page/logo.png", "/etc/passwd.png"));
  ok("../ out of the lane is outside", o.pics[2].state === "outside" && o.pics[2].gap === "secret.png can't be shown: it's outside this lane's files", o.pics[2]);
  ok("an absolute path is outside", o.pics[1].state === "outside", o.pics[1]);
}
ok("previewFile: a picture in .symbiot is served", previewFile(lane, "tray/bookwell-page/logo.png").state === "ok");
ok("previewFile: relative to the lane's root too", previewFile(lane, ".symbiot/tray/bookwell-page/logo.png").state === "ok");
ok("previewFile: the lane's root, outside .symbiot, isn't", previewFile(lane, "../secret.png").state === "outside" && previewFile(lane, "secret.png").state !== "ok");
ok("previewFile: not a picture isn't", previewFile(lane, "tray/bookwell-page/notes.md").state === "outside");
ok("previewFile: a link out of the lane isn't", previewFile(lane, "tray/bookwell-page/link.png").state !== "ok");
ok("previewFile: a Marketing tray, when the lane has one", previewFile(lane, "drafts/x/tray/a.png", { tray: (r) => (r === "drafts/x/tray/a.png" ? { file: "/f", type: "image/png" } : null) }).state === "ok");
ok("picSize reads a PNG's size", JSON.stringify(picSize(join(tray, "cover.png"))) === JSON.stringify({ w: 1128, h: 191 }));
ok("dropShown leaves the sentence whole", dropShown("Create it as shown, then post it") === "Create it, then post it" && dropShown("Post it like this?") === "Post it?");

// a question with no preview and no "as shown": as before, but its paragraphs kept
{
  const { p: plain } = pv("## Questions\n### Ship 3.2 today?\n3.2 is ready.\n\nThe basket waits for 3.3.\n- 🤖 Agent: ship it (recommended)\n- 🤖 Agent: wait\n");
  ok("no preview, its lead-in in paragraphs", plain && !plain.heading && !plain.warn && !plain.shown && plain.lead.length === 2, plain);
  const { p: one } = pv("## Questions\n### Ship 3.2 today?\n3.2 is ready.\n- 🤖 Agent: ship it (recommended)\n");
  ok("one paragraph and no preview: nothing to change", one === null, one);
}

rmSync(lane, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
