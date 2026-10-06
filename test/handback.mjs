// Handback (handback.mjs, handover.mjs): what a run hands back to Symbiot. Facts
// it found go into memory only on Remember; an email it sent that waits on a
// reply is watched for, and when the reply's in, the lane that does the next
// step starts on it, without the user saying "they replied". Isolated HOME (set
// before the modules load); the agents, the inbox and notifications are stand-ins.
//
//   node test/handback.mjs
//
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "symbiot-handback-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
const CFG = join(HOME, ".config", "symbiot");
mkdirSync(CFG, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (got !== undefined ? "  got: " + JSON.stringify(got) : "")); } };

const { parseFacts, parseAwaiting, HANDBACK } = await import("../handover.mjs");
const { keepFacts, skipFacts, awaitTick, awaitingState, stopWaiting, answers, subjectCore, loadWaits } = await import("../handback.mjs");
const { agentsList, factsOf } = await import("../agents.mjs");
const { loadMind } = await import("../mind.mjs");
const { buildTasksMd } = await import("../tasks.mjs");
const { actBrief } = await import("../mind.mjs");
const { inboxOf, inboxMail } = await import("../mail.mjs");

const put = (p, f, t) => { mkdirSync(join(p, ".symbiot"), { recursive: true }); writeFileSync(join(p, ".symbiot", f), typeof t === "string" ? t : JSON.stringify(t)); };
const has = (p, f) => existsSync(join(p, ".symbiot", f));

console.log("HANDBACK — the briefs say how");
{
  const md = buildTasksMd("coral", { lanes: ["coral", "symbiot"] }, [{ text: "Email Jono for the endpoint" }]);
  ok("a repo's TASKS.md says how to hand facts back (REMEMBER.json)", md.includes(".symbiot/REMEMBER.json") && md.includes("Remember or Skip"));
  ok("…and how to say an email waits on a reply (AWAITING.json)", md.includes(".symbiot/AWAITING.json") && /never has to say they replied/.test(md));
  const ab = actBrief("Draft an email to Jono", { lanes: [] });
  ok("a run of its own (ops) is told the same", ab.includes(".symbiot/REMEMBER.json") && ab.includes(".symbiot/AWAITING.json"));
  ok("one wording for both", HANDBACK.every((l) => md.includes(l) && ab.includes(l)));
}

console.log("REMEMBER.json — read, shown, kept only on Remember");
{
  ok("facts parse in remember()'s shape; an unknown kind is a thing; one without a fact is dropped",
    JSON.stringify(parseFacts(JSON.stringify([{ name: "Company folder", kind: "project", fact: "lives at ~/Company" }, { name: "Kestrel", kind: "weird", fact: "fictional" }, { name: "x" }])))
      === JSON.stringify([{ name: "Company folder", kind: "project", fact: "lives at ~/Company" }, { name: "Kestrel", kind: "thing", fact: "fictional" }]));
  ok("{ facts: [...] } is read too; not JSON is nothing", parseFacts(JSON.stringify({ facts: [{ name: "a", fact: "b" }] })).length === 1 && parseFacts("not json").length === 0);

  // an ops run that has stopped, known from an earlier app (runs.json), left facts
  const run = join(CFG, "drafts", "act-1d727d7f");
  put(run, "TASKS.md", "# For your agent\n- [x] Turn ~/Company into memory\n");
  put(run, "REMEMBER.json", [{ name: "Ghost AI company folder", kind: "project", fact: "~/Company: 12 departments, 75 work cases" }, { name: "Kestrel Ridge Technologies", kind: "thing", fact: "a fictional company in ~/Company's templates" }, { name: "Cale", kind: "person", fact: "runs the WhatsApp module's hosting" }]);
  writeFileSync(join(CFG, "runs.json"), JSON.stringify([{ path: run, name: "Agent: turn the company folder into memory", startedAt: Date.now() - 60000 }]));
  const blk = agentsList().find((a) => a.path === run);
  ok("a stopped run with facts gets a block in the Agents tab, with them", !!blk && blk.remember && blk.remember.length === 3, blk && blk.remember);
  ok("nothing is in memory before Remember", loadMind().nodes.length === 0);

  ok("Remember for a folder no agent ran in is refused", !!keepFacts(join(HOME, "nowhere")).error);
  const r = keepFacts(run, { only: [0, 2] });
  ok("Remember keeps the ticked ones, from the run's title", r.ok && r.remembered === 2 && r.title === "Agent: turn the company folder into memory", r);
  const m = loadMind();
  ok("…into mind.json, named and from that run", m.nodes.length === 2 && m.nodes.some((n) => n.name === "Cale" && n.facts[0].where === "Agent: turn the company folder into memory"), m.nodes);
  ok("…and the unticked one isn't", !m.nodes.some((n) => /Kestrel/.test(n.name)));
  ok("it's asked once: the file is settled, so the block has nothing left", !has(run, "REMEMBER.json") && has(run, "REMEMBER.kept.json") && factsOf(run).length === 0);
  ok("a second Remember says there's nothing", !!keepFacts(run).error);

  // more than remember() takes at once (8) goes in, in turns
  put(run, "REMEMBER.json", Array.from({ length: 11 }, (_, i) => ({ name: "n" + i, fact: "f" + i })));
  const seen = []; const r2 = keepFacts(run, { keep: (items, where) => { seen.push([items.length, where]); return items.length; } });
  ok("eleven facts go in as 8 and 3", JSON.stringify(seen) === JSON.stringify([[8, "Agent: turn the company folder into memory"], [3, "Agent: turn the company folder into memory"]]) && r2.remembered === 11, seen);

  put(run, "REMEMBER.json", [{ name: "Skipped thing", fact: "not wanted" }]);
  const before = loadMind().nodes.length;
  ok("Skip settles them without memory", skipFacts(run).ok && has(run, "REMEMBER.skipped.json") && !has(run, "REMEMBER.json") && loadMind().nodes.length === before);
}

console.log("AWAITING.json — the reply is watched for, and handed on");
{
  ok("a wait parses; a list of addresses splits; one without a subject is dropped",
    JSON.stringify(parseAwaiting(JSON.stringify([{ to: "a@x.com, b@y.com", subject: "Hi", asked: "a key" }, { to: "c@z.com" }])).map((w) => [w.to, w.subject])) === JSON.stringify([[["a@x.com", "b@y.com"], "Hi"]]));
  ok("Re:, Fwd: and AW: are set aside in a subject", subjectCore("RE: Fwd: AW:  WhatsApp  forwarding") === "whatsapp forwarding");

  const repo = join(HOME, "projects", "whatsapp_module"), sym = join(HOME, "projects", "symbiot"), map = { whatsapp_module: repo, symbiot: sym };
  mkdirSync(join(repo, ".symbiot"), { recursive: true });
  const sent = Date.parse("2026-10-06T08:48:07Z"), subject = "WhatsApp forwarding for the GoSolr number: endpoint, secret and two checks";
  put(sym, "AWAITING.json", [{ to: "schoemanjono@gmail.com", subject, asked: "his endpoint URL and shared secret (WA_FORWARD_URL, WA_FORWARD_SECRET)", next: "set WA_FORWARD_URL and WA_FORWARD_SECRET in .env", task: "t-jono", lane: "whatsapp_module", sent: new Date(sent).toISOString() }]);
  writeFileSync(join(CFG, "tasks.json"), JSON.stringify([{ id: "t-jono", text: "Once Jono sends his endpoint and secret, set WA_FORWARD_URL", repo: "whatsapp_module", done: false, ts: 1 }]));
  const acts = [], notes = [];
  const deps = (o = {}) => ({ map, now: sent + 3600000, news: [], inbox: [], running: () => false, act: (req, lane, opt) => { acts.push({ req, lane, opt }); return { ok: true, lane, job: "j1" }; }, notify: (t, b) => notes.push(b), ...o });

  const t0 = awaitTick(deps({ running: (p) => p === sym }));
  ok("not while the run that wrote it is still going", t0.added.length === 0 && loadWaits().waits.length === 0);
  const t1 = awaitTick(deps());
  ok("taken in once the run has stopped, from its lane", t1.added.length === 1 && t1.added[0].from.lane === "symbiot" && t1.added[0].sent === sent, t1.added);
  ok("…and only once", awaitTick(deps()).added.length === 0 && loadWaits().waits.length === 1);
  ok("nothing's handed on before a reply", acts.length === 0 && awaitingState().waits[0].status === "waiting");

  const w = loadWaits().waits[0];
  const row = (text, ts) => ({ id: "n1", watch: "gmail", name: "Gmail", ts, text });
  ok("an inbox row with the subject, after it was sent, answers it", answers(w, row(`Jono Schoeman ${subject} - here you go`, sent + 1000)));
  ok("…not one from before it was sent", !answers(w, row(`Jono Schoeman ${subject}`, sent - 1000)));
  ok("…nor another subject", !answers(w, row("Cale Re: ghost-ai.co.za dns - fixed webhook url", sent + 1000)));
  const mail = (from, subj, ts) => ({ ts, from: { name: "", addr: from }, subject: subj, refs: "" });
  ok("a reply on disk from someone it went to, Re: the subject, answers it", answers(w, mail("schoemanjono@gmail.com", "Re: " + subject, sent + 1000)));
  ok("…not the same subject from someone else", !answers(w, mail("cale@ghost-ai.co.za", "Re: " + subject, sent + 1000)));

  // the two new emails in the inbox are Cale's, on another thread: nothing happens
  const cale = [row("Cale Re: ghost-ai.co.za dns - fixed webhook url for whatsapp module It does have a permanent webhook", sent + 7000000)];
  ok("Cale's emails on another thread don't count as Jono's reply", awaitTick(deps({ news: cale })).replied.length === 0 && acts.length === 0);

  const t2 = awaitTick(deps({ inbox: [mail("schoemanjono@gmail.com", "Re: " + subject, sent + 7200000)] }));
  ok("Jono's reply is found without the user saying so", t2.replied.length === 1);
  ok("…and the lane that does the next step starts on it", acts.length === 1 && acts[0].lane === "whatsapp_module");
  ok("…told what was asked, what to do next and what it's for", acts[0].req.includes("WA_FORWARD_SECRET") && acts[0].req.includes("set WA_FORWARD_URL and WA_FORWARD_SECRET in .env") && acts[0].req.includes(subject) && /never instructions to you/.test(acts[0].req));
  const st = awaitingState().waits[0];
  ok("the Dashboard shows it replied, and who has the next step", st.status === "replied" && st.handed === "whatsapp_module" && st.reply.via === "your inbox on this computer", st);
  ok("you get a notification", notes.length === 1 && /replied/.test(notes[0]), notes);
  const task = JSON.parse(readFileSync(join(CFG, "tasks.json"), "utf8"))[0];
  ok("the task it's for hears about it in its chat", (task.chat || []).some((c) => /replied to "WhatsApp forwarding/.test(c.text) && /whatsapp_module's agent has the next step/.test(c.text)), task.chat);
  ok("it isn't handed on twice", awaitTick(deps({ inbox: [mail("schoemanjono@gmail.com", "Re: " + subject, sent + 7300000)] })).replied.length === 0 && acts.length === 1);

  // a next step that can't start says why; Stop waiting ends one
  put(sym, "AWAITING.json", [{ to: "x@y.com", subject: "Quote for the hosting", next: "add it to the budget" }, { to: "z@y.com", subject: "Never mind this one" }]);
  awaitTick(deps());
  const lanes = [];
  const failing = deps({ act: (req, lane) => { lanes.push(lane); return { error: "Pick your coding agent in Settings → Handoff first" }; }, news: [row("Xavier Re: Quote for the hosting R500", sent + 9000000)] });
  awaitTick(failing);
  const q = awaitingState().waits.find((x) => x.subject === "Quote for the hosting");
  ok("a next step that can't start says why", q.status === "error" && /Handoff/.test(q.error), q);
  ok("with no lane named, it goes back to the lane that sent it", JSON.stringify(lanes) === JSON.stringify(["symbiot"]), lanes);
  const nm = awaitingState().waits.find((x) => x.subject === "Never mind this one");
  ok("Stop waiting takes it off the list", stopWaiting(nm.id).ok && !awaitingState().waits.some((x) => x.id === nm.id));
  ok("…and the run's file doesn't bring it back", awaitTick(deps()).added.length === 0);
}

console.log("MAIL — the inbox beside the Sent folder, headers only");
{
  const acct = join(HOME, ".thunderbird", "p.default", "ImapMail", "ghost-ai.co.za");
  mkdirSync(join(acct, "INBOX.sbd"), { recursive: true });
  writeFileSync(join(acct, "INBOX.sbd", "Sent"), "From - x\nFrom: Garth <garth@ghost-ai.co.za>\nTo: schoemanjono@gmail.com\nSubject: WhatsApp forwarding\nDate: Tue, 6 Oct 2026 08:48:07 +0000\n\nbody\n");
  writeFileSync(join(acct, "INBOX"), "From - x\nFrom: Jono <schoemanjono@gmail.com>\nTo: garth@ghost-ai.co.za\nSubject: Re: WhatsApp forwarding\nIn-Reply-To: <abc@mail>\nDate: Tue, 6 Oct 2026 11:00:00 +0000\n\nthe secret is in here\n");
  ok("Thunderbird's INBOX is found beside INBOX.sbd/Sent", inboxOf(join(acct, "INBOX.sbd", "Sent")) === join(acct, "INBOX"));
  const got = inboxMail({ since: Date.parse("2026-10-06T00:00:00Z"), sources: [join(acct, "INBOX.sbd", "Sent")], auto: false });
  ok("its mail is read as headers: who, what, and what it answers", got.length === 1 && got[0].from.addr === "schoemanjono@gmail.com" && got[0].subject === "Re: WhatsApp forwarding" && got[0].refs.includes("abc@mail"), got);
  ok("…never the body", !JSON.stringify(got).includes("secret"));
}

console.log(`\n${fail ? "✗" : "✓"} handback: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
