// Home's chat knows Symbiot-to-Symbiot sync exists, its state here and how to run it (home.mjs syncLines).
//   node test/synchome.mjs
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const HOME = mkdtempSync(join(tmpdir(), "symbiot-synchome-"));
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
let fail = 0; const ok = (n, c) => { if (!c) { fail++; console.log("FAIL", n); } else console.log("ok  ", n); };
const { syncLines, homeContext } = await import("../home.mjs");
const now = Date.now();
const paired = syncLines({ now, status: () => ({ paired: true, url: "u", name: "laptop", lastSync: now - 120000, lastError: "", conflicts: 0 }) }).join("\n");
ok("paired: built, name, last sync, how", /is built and this computer is paired with u as laptop/.test(paired) && /2 min ago/.test(paired) && /symbiot sync now/.test(paired));
const un = syncLines({ now, status: () => ({ paired: false }) }).join("\n");
ok("unpaired: says how to pair", /not paired/.test(un) && /sync pair/.test(un) && /built/.test(un));
ok("never says not built", /Never say sync isn't built/.test(paired));
ok("in the Home context", /Symbiot-to-Symbiot sync is built/.test(homeContext({ you: [], feeds: [], working: 0, runs: [], lanes: [], at: now })));
process.exit(fail ? 1 : 0);
