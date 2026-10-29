// The proof behind a status on Home (Garth, 29 Oct 2026: "i see it working but i dont believe it at all because theres
// no substance to display it"). A lane card that says done or merged, or at work, carries one short line of evidence
// and the details behind it: the PR as GitHub says it now, the report it left on Reports, or the live agent's last step
// and how long it has run. A status nothing confirms reads "unverified", never done. Pure: home.mjs hands in what
// GitHub (probes.mjs prLive.info) and the live agent list say, so this only decides the words.
import { prRefs } from "./probes.mjs";

const took = (ms) => { const m = Math.floor((Number(ms) || 0) / 60000); return m < 1 ? "under a minute" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`; };
const UNVERIFIED = "unverified: the agent says so, nothing confirms it";

// A PR GitHub answered about: the line and the rows behind it. info: { state, conflicts, url, sha, checks }.
function prProof(n, i) {
  const rows = [`PR #${n}: ${i.conflicts ? "open, has conflicts" : i.state}${i.state === "merged" && i.at ? ` on ${i.at}` : ""} (GitHub, just now)`];
  if (i.sha) rows.push(`Commit on main: ${i.sha}`);
  if (i.checks) rows.push(`Checks: ${i.checks}`);
  if (i.url) rows.push(i.url);
  if (i.state === "merged") return { kind: "verified", line: `PR #${n} merged${i.sha ? ` · ${i.sha}` : ""}`, rows, ...(i.url ? { url: i.url } : {}) };
  if (i.state === "closed") return { kind: "contradicted", line: `PR #${n} was closed without merging`, rows, ...(i.url ? { url: i.url } : {}) };
  return { kind: "contradicted", line: i.conflicts ? `PR #${n} has conflicts: not merged` : `PR #${n} is still open: not merged`, rows, ...(i.url ? { url: i.url } : {}) };
}

// p: a lane card (home.mjs workScene): state, summary, running. ctx: { now, dir, info(n), live, reports }.
//   live: the running agent from the live list { startedAt, step } (never the job record).
//   reports: [{ id, name, title }] on Reports for this lane; a report file the card's words name is evidence.
// Returns { kind, line, rows, url? } or null when the card claims nothing (idle, asks you, waiting).
function proofOf(p, { now = Date.now(), dir = "", info = () => null, live = null, reports = [] } = {}) {
  if (p.running || p.state === "at work") {
    if (!live) return { kind: "unverified", line: "unverified: no live agent shows it running", rows: ["The live agent list has no run for this lane."] };
    const ran = live.startedAt ? took(now - live.startedAt) : "";
    return { kind: "running", line: `${ran ? `Running ${ran}` : "Running"}${live.step ? ` · last step: ${live.step}` : ""}`, rows: [ran && `Running for ${ran} (live agent list)`, live.step && `Last step: ${live.step}`, live.last && `Doing now: ${live.last}`].filter(Boolean) };
  }
  // its words say it merges, GitHub says it conflicts: the card shows GitHub's word, not the run's
  if (p.conflicts && p.conflicts.length) { const n = String(p.conflicts[0]).replace(/\D/g, ""), i = dir && info ? info(n) : null; return i && i.state ? prProof(n, i) : { kind: "contradicted", line: `PR #${n} has conflicts: not merged`, rows: [`PR #${n}: open, has conflicts (GitHub)`] }; }
  if (p.state !== "done" || p.waiting) return null;
  const text = String(p.summary || ""), prs = [...new Set(prRefs(text).filter((r) => !r.slug).map((r) => r.n))].slice(0, 3);
  const found = prs.map((n) => [n, dir && info ? info(n) : null]).filter(([, i]) => i && i.state);
  if (found.length) { const ps = found.map(([n, i]) => prProof(n, i)), bad = ps.find((x) => x.kind === "contradicted"); if (bad) return { ...bad, rows: ps.flatMap((x) => x.rows) }; return { ...ps[0], rows: ps.flatMap((x) => x.rows) }; }
  const names = new Set((text.match(/[\w.-]+\.md\b/g) || []).map((s) => s.toLowerCase()));
  const rep = reports.find((r) => r && names.has(String(r.name || "").toLowerCase()));
  if (rep) return { kind: "verified", line: `Report on Reports: ${rep.title}`, rows: [`Report "${rep.title}" is on Reports (${rep.name})`], report: { id: rep.id, title: rep.title } };
  return { kind: "unverified", line: UNVERIFIED, rows: [prs.length ? `PR ${prs.map((n) => `#${n}`).join(", ")} named, but GitHub has not answered yet.` : "No pull request, report, commit or test run is named in its words."] };
}

export { proofOf, UNVERIFIED };
