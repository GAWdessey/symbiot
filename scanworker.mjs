// symbiot — finding your projects off the app's main thread (scan.mjs refreshRepos):
// a walk of your folders and a git call per repo can take a minute on a big home
// folder, and the app has to keep answering meanwhile. Posts { progress } as it goes
// and { list } at the end.
import { parentPort } from "node:worker_threads";
const scan = await import("./scan.mjs");
scan.setScanOptions({ quiet: true });
const tick = setInterval(() => { const s = scan.SCAN; parentPort.postMessage({ progress: { phase: s.phase, done: s.done, total: s.total } }); }, 400);
let list = [];
try { list = scan.findAllRepos(); } catch {}
clearInterval(tick);
parentPort.postMessage({ list });
