// symbiot — building the Map off the app's main thread (scan.mjs buildMap): a git
// call per repo and a read of Claude Code's history take 10-16 s on a big home
// folder, and the app has to keep answering meanwhile. Posts { progress } as it
// goes (what /api/scan shows) and { map } at the end.
import { parentPort, workerData } from "node:worker_threads";
const scan = await import("./scan.mjs");
scan.setScanOptions({ ...((workerData && workerData.opts) || {}), quiet: true, plain: true });
const tick = setInterval(() => { const s = scan.SCAN; parentPort.postMessage({ progress: { phase: s.phase, done: s.done, total: s.total, item: s.item, partial: s.partial } }); }, 300);
let map = null;
try { map = await scan.buildMap(); } catch {}
clearInterval(tick);
parentPort.postMessage({ map, partial: scan.SCAN.partial });
