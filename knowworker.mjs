// symbiot — your knowledge folders, re-read off the app's main thread (knowledge.mjs
// knowledgeTick): the files that changed are read again, and when any did (or the
// folders were never checked), the folders are checked for where two files disagree
// (checks.mjs runChecks). Posts { index, checks } at the end; the files written are
// the same ones (knowledge.json, checks.json), so the app reads them as before.
import { parentPort, workerData } from "node:worker_threads";
const K = await import("./knowledge.mjs"), C = await import("./checks.mjs");
let index = null, checks = null;
try {
  index = K.indexKnowledge();
  if ((workerData || {}).checks !== false && (index.read || index.removed || !C.checksState().at)) { const r = C.runChecks(); checks = { clashes: r.clashes.length, files: r.counts.files, ms: r.ms }; }
} catch (e) { index = { error: String((e && e.message) || e) }; }
parentPort.postMessage({ index, checks });
