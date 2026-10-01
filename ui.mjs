// symbiot — the `symbiot app` page, served at / by index.mjs (cmdApp).
//
// Self-contained HTML served at / — no backticks or ${} inside (it lives in a
// template literal), apart from the ${..._JS} that splices in each view's
// script. Talks to the local API with the per-launch token.
// Kept apart from the CLI/server so UI edits can't break the backend (and vice
// versa); test/smoke.mjs boots the real page and exercises every handler.
//
// This file is the shell: CSS + markup. The JavaScript lives in ui/, one module
// per view, and each goes into its OWN <script> block, so a syntax slip in one
// view's file leaves the other views' code loaded. core.mjs comes first (api,
// $, esc, shared state, tabs); the last block boots the page, once every view
// has defined its functions. Same rule inside ui/*.mjs: no backticks or ${}.
// A new ui/ file must also go in package.json "files" (test/load.mjs checks).
import { CORE_JS } from "./ui/core.mjs";
import { MAP_JS } from "./ui/map.mjs";
import { TASKS_JS } from "./ui/tasks.mjs";
import { AGENTS_JS } from "./ui/agents.mjs";
import { DRIFT_JS } from "./ui/drift.mjs";
import { SETTINGS_JS } from "./ui/settings.mjs";
import { UPDATE_JS } from "./ui/update.mjs";

export const EMBEDDED_UI = `<!doctype html><html><head><meta charset="utf8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Symbiot</title>
<style>
:root{--ink:#0E1A1F;--ink2:#15262C;--ink3:#1D333A;--line:#24404A;--bone:#F4F1EA;--text:#B7C9C4;--faint:#7E9690;--green:#3DDC97;--amber:#F2A541;--green-dim:#16322D;--sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--ink);color:var(--text);font-family:var(--sans);font-size:14px;display:flex;flex-direction:column}
header{padding:16px 18px 10px;display:flex;align-items:center;gap:10px}
.dot{width:10px;height:10px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green)}
.brand{font-weight:700;color:var(--bone);font-size:16px}
.status{margin-left:auto;font-size:12px;color:var(--faint);text-align:right;max-width:52%}
.tabs{display:flex;gap:6px;padding:0 14px;border-bottom:1px solid var(--line)}
.tab{padding:9px 14px;border:0;background:none;color:var(--faint);font:inherit;font-weight:600;cursor:pointer;border-bottom:2px solid transparent}
.tab.active{color:var(--bone);border-bottom-color:var(--green)}
main{flex:1;overflow:auto;padding:16px 18px}
.row{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
button.act{background:var(--green);color:var(--ink);border:0;border-radius:10px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer}
button.act:hover{filter:brightness(1.08)}
button.ghost{background:var(--ink3);color:var(--bone);border:1px solid var(--line);border-radius:10px;padding:9px 14px;font:inherit;font-weight:600;cursor:pointer}
button.ghost:hover{border-color:var(--faint)}
.out{white-space:pre-wrap;background:var(--ink2);border:1px solid var(--line);border-radius:12px;padding:16px;min-height:180px;color:var(--bone);line-height:1.6}
.muted{color:var(--faint)}
label{display:block;font-size:12px;color:var(--faint);margin:14px 0 5px}
select,input{width:100%;background:var(--ink);border:1px solid var(--line);border-radius:9px;padding:10px 12px;color:var(--bone);font:inherit}
select:focus,input:focus{outline:none;border-color:var(--green)}
a{color:var(--green);cursor:pointer}.hidden{display:none}
.note{font-size:12px;margin-top:10px}.ok{color:var(--green)}.err{color:var(--amber)}
.updatebar{display:none;align-items:center;gap:12px;padding:9px 16px;font-size:13px;font-weight:600;background:var(--green);color:var(--ink)}
.updatebar.show{display:flex}
.updatebar.reconnect{background:var(--amber)}
.updatebar button{font:inherit;font-weight:700;border:0;border-radius:8px;padding:5px 12px;background:var(--ink);color:var(--bone);cursor:pointer}
.ver{font-size:11px;color:var(--faint);background:var(--ink3);border:1px solid var(--line);border-radius:999px;padding:2px 8px;margin-left:2px;font-family:ui-monospace,Menlo,Consolas,monospace}
footer{padding:10px 18px;border-top:1px solid var(--line);display:flex}
.profile{font-size:13px;margin-bottom:8px;line-height:1.5}
.profile b{color:var(--bone)}
.maprow{display:flex;gap:12px;align-items:stretch}
#graph{flex:1;width:100%;height:62vh;min-height:340px;background:var(--ink2);border:1px solid var(--line);border-radius:12px;touch-action:none;cursor:grab}
#graph:active{cursor:grabbing}
#graph text{font-family:var(--sans);fill:var(--text);font-size:11px;pointer-events:none}
#graph .lbl-me{fill:var(--bone);font-weight:700;font-size:13px}
.detail{width:290px;flex:none;background:var(--ink2);border:1px solid var(--line);border-radius:12px;padding:14px;overflow:auto;max-height:62vh}
.detail h3{margin:0 0 4px;color:var(--bone);font-size:15px}
.detail .k{font-size:12px;color:var(--faint);margin-top:8px}
.detail ul{margin:6px 0 0;padding-left:18px}.detail li{margin:2px 0}
.detail .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.tag{display:inline-flex;font-size:11px;padding:4px 9px;border-radius:999px;background:var(--green-dim);border:1px solid #2a6b52;color:var(--green)}
.mapbar{margin-top:8px;font-size:12.5px;color:var(--text);background:var(--ink3);border:1px solid var(--line);border-radius:9px;padding:9px 12px;min-height:18px;font-family:ui-monospace,Menlo,Consolas,monospace}
.mapbar b{color:var(--bone)}
.review{margin-top:12px;background:var(--ink2);border:1px solid var(--line);border-radius:12px;padding:16px;min-height:120px}
.review h4{margin:0 0 8px;color:var(--green);font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:700}
.review .body{color:var(--text);line-height:1.65;font-size:14px;white-space:pre-wrap}
.review .rname{color:var(--bone);font-weight:600}
.rfoot{margin-top:12px;font-size:11px;color:var(--faint);font-family:ui-monospace,Menlo,Consolas,monospace;border-top:1px solid var(--line);padding-top:8px;line-height:1.5}
.verdict{margin-top:12px;padding:10px 12px;border-left:3px solid var(--amber);background:var(--ink3);border-radius:0 8px 8px 0;color:var(--bone);font-size:13.5px;line-height:1.5}
.ideas{margin-top:14px}
.ideas h4{margin:0 0 6px;color:var(--amber);font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700}
.idea{display:flex;align-items:flex-start;gap:9px;padding:5px 0;font-size:13.5px;color:var(--text)}
.idea input{margin-top:3px;flex:none;width:15px;height:15px;cursor:pointer}
.task{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--line);border-radius:9px;margin-top:8px;background:var(--ink2)}
.task input[type=checkbox]{width:16px;height:16px;flex:none;cursor:pointer}
.task .t{flex:1}.task.done .t{color:var(--faint);text-decoration:line-through}
.task .rp{font-size:11px;color:var(--faint);background:var(--ink3);border:1px solid var(--line);border-radius:999px;padding:2px 8px}
.task .rm{background:none;border:0;color:var(--faint);cursor:pointer;font-size:18px;line-height:1}
.task .rm:hover{color:var(--amber)}
.tgroup{margin:14px 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--green);font-weight:700}
.tcount{color:var(--faint);font-weight:400}
.taskfilter{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:10px 0 2px}
.fl{font-size:10px;color:var(--faint);text-transform:uppercase;letter-spacing:.12em;margin:0 2px 0 8px}
.fchip{font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid var(--line);background:var(--ink3);color:var(--text);cursor:pointer;font:inherit}
.fchip.on{background:var(--green-dim);border-color:#2a6b52;color:var(--green)}
.task .rm.restore{color:var(--green);font-size:15px}
.task .ask{background:none;border:0;color:var(--faint);cursor:pointer;font-size:14px;line-height:1;padding:0 2px}
.task .ask:hover,.task .ask.on,.task .ask.has{color:var(--green)}
.tchat{border:1px solid var(--line);border-top:0;border-radius:0 0 9px 9px;margin-top:-3px;padding:8px 11px 10px;background:var(--ink2)}
.tchat .msg{margin-top:6px;font-size:13px;line-height:1.55;white-space:pre-wrap}
.tchat .msg.q{color:var(--bone)}.tchat .msg.q:before{content:'You: ';color:var(--faint)}
.tchat .msg.a{color:var(--text);background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.tchat .row{margin:8px 0 0}.tchat .askclear{font-size:12px}
.rcard{border:1px solid var(--amber);border-radius:11px;padding:10px 12px;margin-top:8px}
.rcard .rhead{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.rcard .rhead .muted{font-size:12px}
.rcard .row{margin-top:8px}.rcard .task{margin-top:6px}
.rdiff{max-height:360px;overflow:auto;font-size:11px;line-height:1.45;background:var(--ink2);border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:8px;white-space:pre}
.drift{border:1px solid var(--line);border-radius:10px;margin-top:10px;padding:12px 14px;background:var(--ink2)}
.drift .dh{display:flex;gap:8px;align-items:center}
.drift .dn{color:var(--bone);font-weight:600}
.drift .dd{color:var(--faint);font-size:12px}
.drift ul{margin:8px 0 0;padding:0;list-style:none}
.drift li{padding:3px 0;font-size:13.5px}
.drift li.warn{color:var(--amber)}
.drift .ev{color:var(--faint);font-family:ui-monospace,Menlo,monospace;font-size:11px}
.dot-w{width:9px;height:9px;border-radius:50%;background:var(--amber);display:inline-block}
.dot-c{width:9px;height:9px;border-radius:50%;background:var(--green);display:inline-block}
.agent{border:1px solid var(--line);border-radius:10px;margin-top:10px;padding:12px 14px;background:var(--ink2)}
.adot{width:10px;height:10px;border-radius:50%;display:inline-block;flex:none}
.adot.run{background:var(--amber);animation:pulse 1s ease-in-out infinite}
.adot.ok{background:var(--green)} .adot.fail{background:#E5695B}
.changed{margin-top:8px;font-size:12.5px;color:var(--bone);background:var(--green-dim);border:1px solid #2a6b52;border-radius:8px;padding:7px 10px}
.changed.muted{color:var(--faint);background:var(--ink3);border-color:var(--line)}
.changed b{color:var(--green)}
.commits{margin-top:6px;font-size:12px;color:var(--text);font-family:ui-monospace,Menlo,Consolas,monospace}
.commits code{color:var(--amber);margin-right:6px}
@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(242,165,65,.5)}50%{opacity:.4;box-shadow:0 0 0 5px rgba(242,165,65,0)}}
.alogout{white-space:pre-wrap;background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;color:var(--text);max-height:260px;overflow:auto}
.bar{height:3px;background:var(--green-dim);border-radius:2px;overflow:hidden;margin-top:8px}
.bar > i{display:block;height:100%;width:35%;background:var(--green);border-radius:2px;animation:slide 1.3s ease-in-out infinite}
@keyframes slide{0%{margin-left:-35%}100%{margin-left:100%}}
.out2{white-space:pre-wrap;background:var(--ink);border:1px solid var(--line);border-radius:9px;padding:10px;margin-top:10px;font-size:13px;line-height:1.55;color:var(--bone)}
.legend{display:flex;gap:14px;align-items:center;margin-top:10px;font-size:12px;color:var(--faint);flex-wrap:wrap}
.lg{display:inline-flex;gap:6px;align-items:center}
.lg i{width:10px;height:10px;border-radius:50%;display:inline-block}
@media(max-width:760px){.maprow{flex-direction:column}.detail{width:auto;max-height:none}}
</style></head><body>
<div id="updatebar" class="updatebar"></div>
<header><span class="dot"></span><span class="brand">Symbiot</span><span class="ver" id="ver"></span><span class="status" id="status">...</span></header>
<div class="tabs">
<button class="tab active" data-tab="map">Map</button>
<button class="tab" data-tab="drift">Drift</button>
<button class="tab" data-tab="week">Week</button>
<button class="tab" data-tab="standup">Standup</button>
<button class="tab" data-tab="todo">Todo</button>
<button class="tab" data-tab="tasks">Tasks</button>
<button class="tab" data-tab="agents">Agents</button>
<button class="tab" data-tab="settings">Settings</button>
</div>
<main>
<section id="panel-map">
<div class="profile muted" id="profile">Mapping your work&hellip;</div>
<div class="maprow">
<svg id="graph" viewBox="0 0 960 620" preserveAspectRatio="xMidYMid meet"></svg>
<aside id="detail" class="detail hidden"></aside>
</div>
<div id="mapbar" class="mapbar">Hover a node for a summary &middot; click for details &middot; drag to move</div>
<div class="legend">
<span class="lg"><i style="background:var(--green)"></i>you</span>
<span class="lg"><i style="background:var(--bone)"></i>repos</span>
<span class="lg"><i style="background:var(--amber)"></i>languages</span>
<span class="lg"><i style="background:#6bb3ff"></i>tools</span>
<span class="lg"><i style="background:#c58af9"></i>agents</span>
<span class="lg"><i style="background:#5fe3b0"></i>AI</span>
<span class="lg"><i style="background:#b7a98c"></i>folders (no git)</span>
<span class="muted" style="margin-left:8px">scroll to zoom &middot; drag to pan &middot; click a node</span>
<button class="ghost" id="remap" style="margin-left:auto">Rescan</button>
</div>
<div id="review" class="review hidden"></div>
</section>
<section id="panel-run" class="hidden">
<div class="row"><button class="act" id="write">Write my <span id="what">week</span></button>
<button class="ghost hidden" id="copy">Copy</button>
<span class="muted">Reads your local git and writes it up.</span></div>
<div class="out muted" id="out">Nothing yet - hit the button.</div>
<div class="rfoot" id="outfoot" style="display:none"></div>
</section>
<section id="panel-tasks" class="hidden">
<div class="row"><input id="newtask" placeholder="Add a task..." style="flex:1"><select id="newtaskrepo" title="Which repo this task is for (needed to send it to an agent)" style="flex:0 0 auto;max-width:180px"><option value="">repo…</option></select><button class="act" id="addtask">Add</button><button class="ghost" id="pushtasks" title="Write .symbiot/TASKS.md into each repo for your coding agent">Send to repos</button></div>
<div class="note muted" style="margin-top:2px">To give tasks to your agent, use <b>Send to repos</b> &mdash; filter by tag below to choose which. As the agent finishes each one it lands in <b>Awaiting your review</b>: <b>Approve</b> commits it on a branch and opens a PR, <b>&#8630;</b> sends it back. Ticking a task yourself marks it done (it auto-archives). Click <b>&#128172;</b> on a task to ask questions about it.</div>
<div id="pushout"></div>
<div id="reviewout"></div>
<div id="reviewlist"></div>
<div id="taskfilter" class="taskfilter"></div>
<div id="tasklist"></div>
</section>
<section id="panel-agents" class="hidden">
<div class="row"><span class="muted">Agents Symbiot has handed work to — live status and output.</span><button class="ghost" id="agentsrefresh" style="margin-left:auto">Refresh</button></div>
<div id="agentslist"></div>
</section>
<section id="panel-drift" class="hidden">
<div class="row"><span class="muted">What's out of sync, stuck or at risk across your repos — local git facts.</span>
<label class="muted" style="margin-left:auto"><input type="checkbox" id="driftfetch"> fetch latest</label>
<label class="muted"><input type="checkbox" id="driftci"> check CI (needs gh)</label>
<button class="ghost" id="driftrun">Rescan</button></div>
<div id="driftout"></div>
</section>
<section id="panel-settings" class="hidden">
<label>Which AI should Symbiot write with?</label>
<select id="provider">
<option value="anthropic">Claude (Anthropic)</option>
<option value="openai">OpenAI (GPT)</option>
<option value="gemini">Gemini (Google)</option>
<option value="ollama">Local model (Ollama) - free, no key</option>
</select>
<div class="note muted">The Map above needs no key. For the write-ups, a hosted model needs an API key - or run <b>Ollama</b> locally for a free, private option (nothing leaves your machine).</div>
<div id="keyWrap"><label>API key</label><input id="key" type="password" placeholder="paste your key">
<div class="note"><a id="getkey">Where do I get a key?</a></div></div>
<div id="baseWrap" class="hidden"><label>Ollama URL</label><input id="baseUrl" type="text" value="http://localhost:11434"></div>
<label>Model <span class="muted" id="modelHint"></span></label>
<input id="model" type="text" placeholder="(blank = default)">
<div class="row" style="margin-top:16px"><button class="act" id="save">Save &amp; connect</button>
<span class="note" id="saveMsg"></span></div>
<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<label>Folders to scan for repos</label>
<div id="scanroots"></div>
<div class="row" style="margin-top:6px"><input id="newroot" placeholder="/path/to/folder  (or ~/work) — where your projects live" style="flex:1"><button class="ghost" id="addroot">Add folder</button></div>
<div class="note muted" id="scanrootnote">Point Symbiot at where your work lives — inside or outside your home folder. Defaults to your home folder.</div>
</div>
<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<label>Hand off to your agent when you "Send to repos"</label>
<input id="agentcmd" type="text" placeholder="e.g.  aider --message &quot;{prompt}&quot; --yes   ·   code {dir}   ·   leave blank to just write the file">
<div class="note muted">Runs in each repo after tasks are written. Use <b>{dir}</b> = repo path, <b>{prompt}</b> = the task instruction. Works with any agent or editor &mdash; it's your command.</div>
<div id="agentpresets" style="margin-top:8px"></div>
</div>
<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<button class="ghost" id="recbtn">Recommend models for my machine</button>
<button class="ghost" id="setuplocal" style="margin-left:8px">Set up a free local model</button>
<div id="setupout" class="note muted" style="margin-top:10px"></div>
<div id="recout" style="margin-top:12px"></div>
</div>
</section>
</main>
<footer><button class="ghost" id="quit" style="margin-left:auto">Quit</button></footer>
<script>${CORE_JS}</script>
<script>${MAP_JS}</script>
<script>${TASKS_JS}</script>
<script>${AGENTS_JS}</script>
<script>${DRIFT_JS}</script>
<script>${SETTINGS_JS}</script>
<script>${UPDATE_JS}</script>
<script>
initGraphEvents();syncP();refresh();loadMap();loadAgentCfg();loadScanRoots();
</script></body></html>`;
