// symbiot — the `symbiot app` page, served at / by index.mjs (cmdApp).
//
// Self-contained HTML served at / — no backticks or ${} inside (it lives in a
// template literal). Talks to the local API with the per-launch token.
// Kept apart from the CLI/server so UI edits can't break the backend (and vice
// versa); test/smoke.mjs boots the real page and exercises every handler.
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
<div class="row"><input id="newtask" placeholder="Add a task..." style="flex:1"><button class="act" id="addtask">Add</button><button class="ghost" id="pushtasks" title="Write .symbiot/TASKS.md into each repo for your coding agent">Send to repos</button></div>
<div class="note muted" style="margin-top:2px">To give tasks to your agent, use <b>Send to repos</b> &mdash; filter by tag below to choose which. As the agent finishes each one it lands in <b>Awaiting your review</b>: <b>Approve</b> commits it on a branch and opens a PR, <b>&#8630;</b> sends it back. Ticking a task yourself marks it done (it auto-archives).</div>
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
<input id="agentcmd" type="text" placeholder="e.g.  claude -p &quot;{prompt}&quot;   ·   code {dir}   ·   leave blank to just write the file">
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
<script>
var T=new URLSearchParams(window.location.search).get('t')||'';
function api(path,body){return fetch(path,{method:body?'POST':'GET',headers:{'x-symbiot-token':T,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json();});}
var KEYURL={anthropic:'https://console.anthropic.com/settings/keys',openai:'https://platform.openai.com/api-keys',gemini:'https://aistudio.google.com/apikey',ollama:'https://ollama.com'};
var DEFMODEL={anthropic:'claude-opus-5-5',openai:'gpt-4o-mini',gemini:'gemini-1.5-flash',ollama:'llama3.1'};
function $(id){return document.getElementById(id);}
var current='map';var mapLoaded=false;var driftLoaded=false;
var COLORS={person:'#3DDC97',repo:'#F4F1EA',lang:'#F2A541',tool:'#6bb3ff',agent:'#c58af9',ai:'#5fe3b0',folder:'#b7a98c'};
function tabs(){return document.querySelectorAll('.tab');}
function setTab(tab){current=tab;tabs().forEach(function(t){t.classList.toggle('active',t.dataset.tab===tab);});
var isMap=tab==='map',isSet=tab==='settings',isTasks=tab==='tasks',isDrift=tab==='drift',isAgents=tab==='agents',isRun=(tab==='week'||tab==='standup'||tab==='todo');
$('panel-map').classList.toggle('hidden',!isMap);
$('panel-run').classList.toggle('hidden',!isRun);
$('panel-settings').classList.toggle('hidden',!isSet);
$('panel-tasks').classList.toggle('hidden',!isTasks);
$('panel-drift').classList.toggle('hidden',!isDrift);
$('panel-agents').classList.toggle('hidden',!isAgents);
if(isRun){$('what').textContent=tab;$('out').textContent='Nothing yet - hit the button.';$('out').classList.add('muted');$('copy').classList.add('hidden');}
if(isMap&&!mapLoaded)loadMap();
if(isTasks)loadTasks();
if(isDrift&&!driftLoaded)loadDrift();
if(isAgents)loadAgents(); else stopAgentsPoll();}
tabs().forEach(function(t){t.addEventListener('click',function(){setTab(t.dataset.tab);});});
function refresh(){api('/api/status').then(function(s){$('status').textContent=s.connected?s.line:'Not connected - open Settings';});}
$('write').addEventListener('click',function(){$('out').textContent='Writing...';$('out').classList.add('muted');$('copy').classList.add('hidden');
api('/api/run',{cmd:current}).then(function(r){var f=$('outfoot');if(r.error==='not-connected'){$('out').textContent='Not connected yet - open Settings and pick an AI.';f.style.display='none';return;}
$('out').textContent=r.text||'(no output)';$('out').classList.remove('muted');$('copy').classList.remove('hidden');if(r.footer){f.textContent=r.footer;f.style.display='block';}else{f.style.display='none';}});});
$('copy').addEventListener('click',function(){navigator.clipboard.writeText($('out').textContent);$('copy').textContent='Copied';setTimeout(function(){$('copy').textContent='Copy';},1400);});
function syncP(){var p=$('provider').value;var local=p==='ollama';$('keyWrap').classList.toggle('hidden',local);$('baseWrap').classList.toggle('hidden',!local);
$('getkey').textContent=local?'About Ollama':'Where do I get a key?';$('modelHint').textContent='(default '+DEFMODEL[p]+')';$('model').placeholder='(blank = '+DEFMODEL[p]+')';}
$('provider').addEventListener('change',syncP);
$('getkey').addEventListener('click',function(){window.open(KEYURL[$('provider').value],'_blank');});
$('save').addEventListener('click',function(){var p=$('provider').value;$('saveMsg').textContent='checking...';$('saveMsg').className='note muted';
var cfg={provider:p,model:$('model').value.trim()};if(p==='ollama')cfg.baseUrl=$('baseUrl').value.trim();else cfg.key=$('key').value.trim();
api('/api/connect',cfg).then(function(r){$('saveMsg').textContent=r.message||(r.ok?'Connected.':'Could not connect.');$('saveMsg').className='note '+(r.ok?'ok':'err');if(r.ok){$('key').value='';refresh();}});});
$('quit').addEventListener('click',function(){api('/api/quit');document.body.innerHTML='<div style=\\'padding:40px;color:#7E9690;font-family:sans-serif\\'>Symbiot stopped. You can close this window.</div>';});
var GRAPH=null,sel=null,view={k:1,x:0,y:0},GW=960,GH=620;
function esc(s){return String(s).replace(/[&<>]/g,function(ch){return ch==='&'?'&amp;':ch==='<'?'&lt;':'&gt;';});}
function layout(nodes,edges){var idx={};nodes.forEach(function(n){n.x=GW/2+(Math.random()-0.5)*GW*0.8;n.y=GH/2+(Math.random()-0.5)*GH*0.8;n.vx=0;n.vy=0;idx[n.id]=n;});
for(var it=0;it<340;it++){for(var i=0;i<nodes.length;i++)for(var j=i+1;j<nodes.length;j++){var a=nodes[i],b=nodes[j];var dx=a.x-b.x,dy=a.y-b.y;var d2=dx*dx+dy*dy+0.01;var d=Math.sqrt(d2);var f=4600/d2;a.vx+=f*dx/d;a.vy+=f*dy/d;b.vx-=f*dx/d;b.vy-=f*dy/d;}
edges.forEach(function(e){var a=idx[e.source],b=idx[e.target];if(!a||!b)return;var dx=b.x-a.x,dy=b.y-a.y;var d=Math.sqrt(dx*dx+dy*dy)+0.01;var f=(d-115)*0.03;a.vx+=f*dx/d;a.vy+=f*dy/d;b.vx-=f*dx/d;b.vy-=f*dy/d;});
nodes.forEach(function(n){n.vx+=(GW/2-n.x)*0.002;n.vy+=(GH/2-n.y)*0.002;n.x+=Math.max(-9,Math.min(9,n.vx));n.y+=Math.max(-9,Math.min(9,n.vy));n.vx*=0.86;n.vy*=0.86;n.x=Math.max(30,Math.min(GW-30,n.x));n.y=Math.max(24,Math.min(GH-28,n.y));});}}
function nbrs(id){var s={};s[id]=1;GRAPH.edges.forEach(function(e){if(e.source===id)s[e.target]=1;if(e.target===id)s[e.source]=1;});return s;}
function render(){if(!GRAPH)return;var idx={};GRAPH.nodes.forEach(function(n){idx[n.id]=n;});var nb=sel?nbrs(sel):null;
var s="<g id='vp' transform='translate("+view.x.toFixed(1)+","+view.y.toFixed(1)+") scale("+view.k.toFixed(3)+")'>";
GRAPH.edges.forEach(function(e){var a=idx[e.source],b=idx[e.target];if(!a||!b)return;var op=nb?((nb[e.source]&&nb[e.target])?0.75:0.06):0.45;s+="<line x1='"+a.x.toFixed(1)+"' y1='"+a.y.toFixed(1)+"' x2='"+b.x.toFixed(1)+"' y2='"+b.y.toFixed(1)+"' stroke='#24404A' stroke-width='1' opacity='"+op+"'/>";});
GRAPH.nodes.forEach(function(n){var r=Math.max(5,Math.sqrt(n.weight)*2);var col=COLORS[n.type]||"#888";var op=nb?(nb[n.id]?1:0.14):0.95;var st=(n.id===sel)?" stroke='#F4F1EA' stroke-width='2'":"";var title=esc(n.label)+(n.meta?(" - "+(n.meta.commits||0)+" commits"):"");
s+="<g class='node' data-id='"+esc(n.id)+"' opacity='"+op+"'><circle cx='"+n.x.toFixed(1)+"' cy='"+n.y.toFixed(1)+"' r='"+r.toFixed(1)+"' fill='"+col+"'"+st+"><title>"+title+"</title></circle>";
var cls=n.type==="person"?"lbl-me":"";s+="<text x='"+n.x.toFixed(1)+"' y='"+(n.y+r+12).toFixed(1)+"' text-anchor='middle' class='"+cls+"'>"+esc(n.label)+"</text></g>";});
document.getElementById("graph").innerHTML=s+"</g>";}
function profileLine(g){var repos=g.nodes.filter(function(n){return n.type==="repo";});var base=g.stats.base||"your home folder";if(!repos.length)return "No git repositories found under "+esc(base)+" yet.";var langs=g.nodes.filter(function(n){return n.type==="lang";}).map(function(n){return n.label;});var top=repos.slice().sort(function(a,b){return (b.meta.commits||0)-(a.meta.commits||0);})[0];var s="Scanned <b>"+esc(base)+"</b> &middot; <b>"+g.stats.repos+"</b> repos &middot; <b>"+g.stats.commits+"</b> of your commits &middot; <b>"+(g.stats.files||0)+"</b> files &middot; ";s+=langs.length?("mostly <b>"+esc(langs.slice(0,3).join(", "))+"</b>"):"no languages detected";if(top)s+=" &middot; most active: <b>"+esc(top.label)+"</b>";return s;}
function nodeById(id){for(var i=0;i<GRAPH.nodes.length;i++)if(GRAPH.nodes[i].id===id)return GRAPH.nodes[i];return null;}
function summarize(n){if(!n)return "";if(n.type==='repo'){var m=n.meta||{};var bits=[m.commits+' commits'];if(m.branch)bits.push('branch '+m.branch);if(m.last)bits.push('last '+m.last);if(typeof m.files==='number')bits.push(m.files+' files');if(m.langs&&m.langs.length)bits.push(m.langs.join(', '));if(m.tools&&m.tools.length)bits.push(m.tools.join(', '));return "<b>"+esc(n.label)+"</b>  "+esc(m.path||'')+"  —  "+esc(bits.join('  ·  '));}if(n.type==='lang')return "<b>"+esc(n.label)+"</b>  —  language (click to see repos)";if(n.type==='tool')return "<b>"+esc(n.label)+"</b>  —  tool (click to see repos)";if(n.type==='person')return "<b>"+esc(n.label)+"</b>  —  you";return "<b>"+esc(n.label)+"</b>";}
function updateBar(id){var bar=document.getElementById('mapbar');if(!bar)return;var n=id?nodeById(id):(sel?nodeById(sel):null);bar.innerHTML=n?summarize(n):"Hover a node for a summary &middot; click for details &middot; drag to move";}
function hideDetail(){document.getElementById('detail').classList.add('hidden');}
function showDetail(d){var el=document.getElementById('detail');el.classList.remove('hidden');
if(d.error){el.innerHTML="<h3>&mdash;</h3><div class='k'>"+esc(d.error)+"</div>";return;}
if(d.type==='repo'){var chips="";['branch: '+(d.branch||'?'),d.commits+' commits',(d.dirty?d.dirty+' uncommitted':'clean'),(d.last?'last '+d.last:'')].concat(d.langs||[]).concat(d.tools||[]).forEach(function(x){if(x)chips+="<span class='tag'>"+esc(x)+"</span>";});
el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='chips'>"+chips+"</div><button class='act' id='suggest' style='margin-top:12px'>Suggest next steps</button><div id='sugout'></div>";
document.getElementById('suggest').addEventListener('click',function(){var o=document.getElementById('sugout');o.innerHTML="<div class='out2'>Thinking...</div>";api('/api/suggest',{path:d.path}).then(function(r){if(r.error==='not-connected'){o.innerHTML="<div class='out2'>Connect a model in Settings to get suggestions - Ollama is free and runs locally.</div>";return;}o.innerHTML="<div class='out2'>"+esc(r.text||'(no output)')+"</div>"+(r.footer?"<div class='rfoot'>"+esc(r.footer)+"</div>":"");});});return;}
if(d.type==='lang'||d.type==='tool'){var lis=(d.repos||[]).map(function(r){return "<li>"+esc(r)+"</li>";}).join("");el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>Used in "+((d.repos||[]).length)+" repos</div><ul>"+lis+"</ul>";return;}
if(d.type==='agent'){var m=d.meta||{};el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>"+(m.kind==='agent'?'AI coding agent you have installed':'editor you have installed')+"</div>"+(m.cmd?"<div class='out2' style='font-size:11px'>"+esc(m.cmd)+"</div>":"");return;}
if(d.type==='ai'){var m=d.meta||{};el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>Currently powering Symbiot &middot; model <b>"+esc(m.model||'?')+"</b>"+(m.source?" &middot; via "+esc(m.source):"")+"</div>";return;}
if(d.type==='folder'){var chips='';(d.langs||[]).concat(d.tools||[]).forEach(function(x){chips+="<span class='tag'>"+esc(x)+"</span>";});el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>project folder &middot; not a git repo &middot; "+(d.files||0)+" files</div><div class='chips'>"+chips+"</div><div class='k' style='font-family:ui-monospace,monospace'>"+esc(d.path||'')+"</div><div class='k'>Tasks can be sent here too &mdash; the agent runs in this folder.</div>";return;}
if(d.type==='person'){var st=d.stats||{};el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>"+st.repos+" repos &middot; "+st.commits+" commits &middot; "+st.languages+" languages &middot; "+st.tools+" tools"+(st.agents?" &middot; "+st.agents+" agents/editors":"")+"</div>";return;}}
var reviewCache={};var IDEAS=[];var IREPO="";
function hideReview(){var el=document.getElementById('review');el.classList.add('hidden');el.innerHTML='';}
function reviewHtml(name,body,verdict,ideas,tasks,footer){IDEAS=ideas||[];IREPO=name;
var h="<h4>AI review &middot; <span class='rname'>"+esc(name)+"</span></h4><div class='body'>"+esc(body)+"</div>";
if(verdict)h+="<div class='verdict'>&#9878;&#65039; "+esc(verdict)+"</div>";
if(ideas&&ideas.length){h+="<div class='ideas'><h4>Ideas worth doing &middot; tick to add to Tasks</h4>";
ideas.forEach(function(idea,i){var t=(tasks||[]).filter(function(x){return x.text===idea&&x.repo===name;})[0];var tid=t?t.id:"";
h+="<label class='idea'><input type='checkbox' class='ideachk' data-idx='"+i+"' data-tid='"+esc(tid)+"'"+(t?" checked":"")+"><span>"+esc(idea)+"</span></label>";});
h+="</div>";}
else h+="<div class='muted' style='margin-top:10px'>No new features suggested &mdash; the verdict above is the call.</div>";
if(footer)h+="<div class='rfoot'>"+esc(footer)+"</div>";
return h;}
function wireIdeas(){document.querySelectorAll('.ideachk').forEach(function(cb){cb.addEventListener('change',function(){
var idea=IDEAS[+cb.getAttribute('data-idx')];if(idea==null)return;
if(cb.checked){api('/api/tasks/add',{text:idea,repo:IREPO}).then(function(it){if(it&&it.id)cb.setAttribute('data-tid',it.id);});}
else{var id=cb.getAttribute('data-tid');if(id){api('/api/tasks/remove',{id:id}).then(function(){cb.setAttribute('data-tid','');});}}});});}
function loadReview(name,path){var el=document.getElementById('review');el.classList.remove('hidden');
if(reviewCache[path]){var c=reviewCache[path];api('/api/tasks').then(function(tasks){el.innerHTML=reviewHtml(name,c.text,c.verdict,c.ideas,tasks,c.footer);wireIdeas();});return;}
el.innerHTML="<h4>AI review &middot; <span class='rname'>"+esc(name)+"</span></h4><div class='body'>Reading the project&hellip;</div>";
Promise.all([api('/api/review',{path:path}),api('/api/tasks')]).then(function(res){var r=res[0]||{},tasks=res[1]||[];
if(r.error==='not-connected'){el.innerHTML="<h4>AI review &middot; <span class='rname'>"+esc(name)+"</span></h4><div class='body'>Connect a model in Settings to get a review - Ollama is free and runs locally.</div>"+(r.footer?"<div class='rfoot'>"+esc(r.footer)+"</div>":"");return;}
var body=r.text||'(no output)';reviewCache[path]={text:body,verdict:r.verdict||"",ideas:r.ideas||[],footer:r.footer};el.innerHTML=reviewHtml(name,body,r.verdict||"",r.ideas||[],tasks,r.footer);wireIdeas();});}
var ALLTASKS=[];var TFILTER={type:'',repo:''};var TARCH=false;
var TORDER=['Fixes','Tests & CI','Security','Performance','Refactor','UI/UX','Docs','Features & other'];
function taskRow(t,arch){return "<div class='task"+(t.done?" done":"")+"' data-id='"+esc(t.id)+"'>"+(arch?"":"<input type='checkbox' class='taskchk' title='mark done (auto-archives on sync)'"+(t.done?" checked":"")+">")+"<span class='t'>"+esc(t.text)+"</span>"+(t.repo?"<span class='rp'>"+esc(t.repo)+"</span>":"")+(arch?"<button class='rm restore' title='restore to active'>&#8630;</button>":"<button class='rm' title='remove'>&times;</button>")+"</div>";}
function wireTaskRows(el){el.querySelectorAll('.task').forEach(function(row){var id=row.getAttribute('data-id');
var cb=row.querySelector('.taskchk');if(cb)cb.addEventListener('change',function(){api('/api/tasks/toggle',{id:id}).then(function(){row.classList.toggle('done');});});
var rm=row.querySelector('.rm');if(rm&&rm.classList.contains('restore'))rm.addEventListener('click',function(){api('/api/tasks/restore',{id:id}).then(loadArchived);});
else if(rm)rm.addEventListener('click',function(){api('/api/tasks/remove',{id:id}).then(function(){row.remove();});});});}
function fchip(dim,val,label){var on=(TFILTER[dim]||'')===val;return "<button class='fchip"+(on?' on':'')+"' data-dim='"+dim+"' data-val='"+esc(val)+"'>"+esc(label)+"</button>";}
function renderFilter(){var box=document.getElementById('taskfilter');
if(TARCH){box.innerHTML="<button class='fchip on' id='archtoggle'>&#8617; back to active</button>";document.getElementById('archtoggle').addEventListener('click',function(){loadTasks();});return;}
var types={},repos={};ALLTASKS.forEach(function(t){types[t.type||'Features & other']=1;if(t.repo)repos[t.repo]=1;});
var fb="<span class='fl'>Type</span>"+fchip('type','','All')+Object.keys(types).sort(function(a,b){return TORDER.indexOf(a)-TORDER.indexOf(b);}).map(function(t){return fchip('type',t,t);}).join('');
fb+="<span class='fl'>Repo</span>"+fchip('repo','','All')+Object.keys(repos).sort().map(function(r){return fchip('repo',r,r);}).join('');
fb+="<button class='fchip' id='archtoggle' style='margin-left:auto'>&#128451; archived</button>";
box.innerHTML=fb;
box.querySelectorAll('.fchip[data-dim]').forEach(function(c){c.addEventListener('click',function(){TFILTER[c.getAttribute('data-dim')]=c.getAttribute('data-val');renderTasks();});});
document.getElementById('archtoggle').addEventListener('click',loadArchived);}
function renderTasks(){var el=document.getElementById('tasklist');TARCH=false;renderFilter();
var list=ALLTASKS.filter(function(t){return !t.review&&(!TFILTER.type||(t.type||'Features & other')===TFILTER.type)&&(!TFILTER.repo||t.repo===TFILTER.repo);});
if(!list.length){el.innerHTML="<div class='muted' style='margin-top:12px'>"+(ALLTASKS.length?"Nothing matches this filter.":"No tasks yet. Tick ideas in a repo review, or add one above.")+"</div>";return;}
var groups={};list.forEach(function(t){var ty=t.type||'Features & other';(groups[ty]=groups[ty]||[]).push(t);});
var keys=Object.keys(groups).sort(function(a,b){var ia=TORDER.indexOf(a),ib=TORDER.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});
var h="";keys.forEach(function(ty){h+="<div class='tgroup'>"+esc(ty)+" <span class='tcount'>"+groups[ty].length+"</span></div>";groups[ty].forEach(function(t){h+=taskRow(t,false);});});
el.innerHTML=h;wireTaskRows(el);}
function loadTasks(){TARCH=false;api('/api/tasks/sync',{}).then(function(){api('/api/tasks').then(function(list){ALLTASKS=list;renderTasks();});loadPending();});}
function loadPending(){api('/api/pending').then(function(list){var el=document.getElementById('reviewlist');if(!list||!list.length){el.innerHTML='';return;}
var n=0;list.forEach(function(r){n+=r.tasks.length;});
var h="<div class='tgroup' style='color:var(--amber)'>Awaiting your review <span class='tcount'>"+n+"</span></div>";
list.forEach(function(r){var ch=r.files.length?(r.files.length+" file"+(r.files.length>1?"s":"")+" changed"+(r.stat?" &middot; "+esc(r.stat):"")):"no uncommitted changes";
h+="<div class='rcard' data-repo='"+esc(r.repo)+"'><div class='rhead'><b>"+esc(r.repo)+"</b><span class='muted'>"+(r.path?"on "+esc(r.branch||'?')+" &middot; "+ch:"repo not found on disk")+"</span></div>";
r.tasks.forEach(function(t){h+="<div class='task' data-id='"+esc(t.id)+"'><span class='t'>"+esc(t.text)+"</span><button class='rm sendback' title='not right - send back to the agent (unticks it)'>&#8630;</button></div>";});
h+="<div class='row'><button class='act approve'"+(r.path?"":" disabled")+" title='commit on a branch, push, open a PR, then archive'>Approve &rarr; "+(r.files.length?"PR":"archive")+"</button>"+(r.files.length?"<button class='ghost showdiff'>Show diff</button>":"")+"</div><div class='rdiff hidden'></div></div>";});
el.innerHTML=h;
el.querySelectorAll('.rcard').forEach(function(card){var repo=card.getAttribute('data-repo');
card.querySelectorAll('.sendback').forEach(function(b){b.addEventListener('click',function(){api('/api/pending/sendback',{id:b.closest('.task').getAttribute('data-id')}).then(loadTasks);});});
var sd=card.querySelector('.showdiff'),pre=card.querySelector('.rdiff');
if(sd)sd.addEventListener('click',function(){if(!pre.classList.contains('hidden')){pre.classList.add('hidden');sd.textContent='Show diff';return;}
pre.textContent='Loading...';pre.classList.remove('hidden');sd.textContent='Hide diff';api('/api/pending/diff?repo='+encodeURIComponent(repo)).then(function(d){pre.textContent=(d&&d.diff)||'(no changes)';});});
var ap=card.querySelector('.approve');if(ap)ap.addEventListener('click',function(){ap.disabled=true;ap.textContent='Committing & pushing...';
api('/api/pending/approve',{repo:repo}).then(function(r){var o=document.getElementById('reviewout');
if(!r||r.error){ap.disabled=false;ap.textContent='Approve - retry';o.innerHTML="<div class='note err'>"+esc(repo)+": "+esc((r&&r.error)||'failed')+"</div>";return;}
var m="&#10003; <b>"+esc(repo)+"</b>: approved "+r.approved+" task"+(r.approved>1?"s":"");
if(r.commit)m+=" &middot; committed <code>"+esc(r.commit)+"</code> on <code>"+esc(r.branch)+"</code>";
if(r.pr)m+=" &middot; <a href='"+esc(r.pr)+"' target='_blank' rel='noopener'>open PR</a>";
if(r.note)m+="<div class='muted'>"+esc(r.note)+"</div>";
o.innerHTML="<div class='note ok'>"+m+"</div>";loadTasks();});});});});}
function loadArchived(){TARCH=true;api('/api/tasks?archived=1').then(function(list){ALLTASKS=list;renderFilter();var el=document.getElementById('tasklist');
if(!list.length){el.innerHTML="<div class='muted' style='margin-top:12px'>Nothing archived yet. Completed tasks land here.</div>";return;}
var h="<div class='tgroup'>Archived <span class='tcount'>"+list.length+"</span></div>";list.forEach(function(t){h+=taskRow(t,true);});el.innerHTML=h;wireTaskRows(el);});}
var agentsTimer=null;
function stopAgentsPoll(){if(agentsTimer){clearTimeout(agentsTimer);agentsTimer=null;}}
function fmtE(ms){var s=Math.floor(ms/1000);if(s<60)return s+'s';var m=Math.floor(s/60);return m+'m '+(s%60)+'s';}
function loadAgents(){api('/api/agents').then(function(list){var el=document.getElementById('agentslist');
if(!list||!list.length){el.innerHTML="<div class='muted' style='margin-top:12px'>No agents yet. In <b>Tasks</b>, tick ideas and hit <b>Send to repos</b> (with an agent command set in Settings) &mdash; you'll watch it work here.</div>";stopAgentsPoll();return;}
el.innerHTML=list.map(function(a){var cls=a.status==='running'?'run':(a.status==='done'?'ok':'fail');
var st=a.status==='running'?('working &middot; '+fmtE(a.elapsed)):(esc(a.status)+' &middot; '+fmtE(a.elapsed)+(a.exitCode!=null?' &middot; exit '+a.exitCode:''));
var b="<div class='dh'><span class='adot "+cls+"'></span><span class='dn'>"+esc(a.name)+"</span><span class='dd'>"+st+"</span></div>";
if(a.status==='running')b+="<div class='bar'><i></i></div>";
var ch=a.changed;
if(ch&&(ch.dirty||ch.stat||(ch.commits&&ch.commits.length))){
  var parts=[];
  if(ch.dirty)parts.push('<b>'+ch.dirty+'</b> file'+(ch.dirty>1?'s':'')+' changed');
  if(ch.stat)parts.push(esc(ch.stat));
  if(parts.length)b+="<div class='changed'>What it did &middot; "+parts.join(' &middot; ')+"</div>";
  if(ch.commits&&ch.commits.length)b+="<div class='commits'>"+ch.commits.map(function(c){return "<div><code>"+esc(c.hash)+"</code> "+esc(c.msg)+"</div>";}).join("")+"</div>";
}else if(a.status==='done'){
  b+="<div class='changed muted'>No file changes detected (the agent may have only planned or asked).</div>";
}
b+="<pre class='alogout'>"+esc((a.tail&&a.tail.trim())||'(waiting for output…)')+"</pre>";
return "<div class='agent'>"+b+"</div>";}).join("");
el.querySelectorAll('.alogout').forEach(function(p){p.scrollTop=p.scrollHeight;});
var anyRunning=list.some(function(a){return a.status==='running';});
stopAgentsPoll();if(anyRunning&&current==='agents')agentsTimer=setTimeout(loadAgents,2000);});}
function loadDrift(){var out=document.getElementById('driftout');out.innerHTML="<div class='muted' style='margin-top:12px'>Reading your repos&hellip;</div>";
var ci=document.getElementById('driftci').checked?'1':'0';var ft=document.getElementById('driftfetch').checked?'1':'0';
api('/api/drift?ci='+ci+'&fetch='+ft).then(function(d){driftLoaded=true;var repos=d.repos||[];var risky=repos.filter(function(r){return r.flags.some(function(f){return f.level==='warn';});});
var h="<div class='k' style='margin:10px 0'><b>"+repos.length+"</b> repos &middot; <b>"+risky.length+"</b> with risks"+(d.partial?" &middot; <span class='err'>partial &mdash; the scan hit its time limit</span>":"")+"</div>";
repos.forEach(function(r){if(!r.flags.length)return;var warn=r.flags.some(function(f){return f.level==='warn';});
h+="<div class='drift'><div class='dh'><span class='"+(warn?'dot-w':'dot-c')+"'></span><span class='dn'>"+esc(r.name)+"</span><span class='dd'>"+esc(r.def)+(r.fetchAgeDays!=null&&r.fetchAgeDays>3?" &middot; fetch "+r.fetchAgeDays+"d old":"")+"</span></div><ul>";
r.flags.forEach(function(f){h+="<li class='"+esc(f.level)+"'>"+(f.level==='warn'?'&#9888; ':'&middot; ')+esc(f.text)+(f.evidence?" <span class='ev'>["+esc(f.evidence)+"]</span>":"")+"</li>";});
h+="</ul></div>";});
var clean=repos.filter(function(r){return !r.flags.length;}).map(function(r){return r.name;});
if(clean.length)h+="<div class='muted' style='margin-top:10px'>clean: "+esc(clean.join(", "))+"</div>";
if(!repos.length)h+="<div class='muted'>No repos found under your home folder.</div>";
out.innerHTML=h;});}
function addTaskUI(){var i=document.getElementById('newtask');var v=(i.value||'').trim();if(!v)return;api('/api/tasks/add',{text:v,repo:''}).then(function(){i.value='';loadTasks();});}
function pushTasksUI(){var o=document.getElementById('pushout');var btn=document.getElementById('pushtasks');btn.disabled=true;
o.innerHTML="<div class='muted' style='margin-top:10px'><span class='dot-c' style='background:var(--amber)'></span> Writing .symbiot/TASKS.md into your repos&hellip;</div>";
api('/api/tasks/push',{type:TFILTER.type||'',repo:TFILTER.repo||''}).then(function(r){btn.disabled=false;
if(r.empty){o.innerHTML="<div class='muted' style='margin-top:10px'>No open tasks to send. Tick ideas in a repo review, or add tasks above.</div>";return;}
var n=(r.written||[]).length;var h="<div class='drift' style='margin-top:10px'><div class='dh'><span class='dot-c'></span><span class='dn'>Done &mdash; wrote "+n+" file"+(n===1?"":"s")+"</span></div>";
if(n){h+="<ul>";r.written.forEach(function(w){h+="<li class='info'>&#10003; <b>"+esc(w.name)+"</b> <span class='ev'>"+esc(w.file)+" ("+w.count+" task"+(w.count===1?"":"s")+")</span></li>";});h+="</ul>";}
if(r.unresolved&&r.unresolved.length){h+="<div class='dd' style='margin-top:6px'>&#9888; not written (repo not found under your home folder): "+esc(r.unresolved.map(function(u){return u.name;}).join(", "))+"</div>";}
if(r.handoff&&r.written&&r.written.length){r.written.forEach(function(w){api('/api/open',{path:w.path});});h+="<div class='dd' style='margin-top:8px'>&#129302; Handed "+n+" repo(s) to your agent &mdash; opening the <b>Agents</b> tab to watch it work&hellip;</div>";setTimeout(function(){setTab('agents');},500);}
else{h+="<div class='dd' style='margin-top:8px'>Set an <b>agent command</b> in Settings to auto-run it on send (and watch it in the Agents tab). For now, tell your agent: <b>“Read .symbiot/TASKS.md and implement the unchecked items.”</b></div>";}
h+="</div>";
o.innerHTML=h;}).catch(function(e){btn.disabled=false;o.innerHTML="<div class='err' style='margin-top:10px'>Couldn&#39;t write tasks: "+esc(String((e&&e.message)||e))+"</div>";});}
function loadAgentCfg(){api('/api/agentcfg').then(function(d){document.getElementById('agentcmd').value=d.cmd||'';
var chips=[];(d.agents||[]).forEach(function(a){chips.push(a);});(d.editors||[]).forEach(function(e){chips.push(e);});
var box=document.getElementById('agentpresets');
if(!chips.length){box.innerHTML="<span class='muted' style='font-size:12px'>Nothing detected on PATH &mdash; type your own command above.</span>";return;}
box.innerHTML="<span class='muted' style='font-size:12px'>Detected &mdash; click to use:</span><br>"+chips.map(function(c,i){return "<button class='ghost preset' data-i='"+i+"' style='padding:4px 10px;font-size:12px;margin:5px 5px 0 0'>"+esc(c.label)+"</button>";}).join("");
box.querySelectorAll('.preset').forEach(function(btn){btn.addEventListener('click',function(){document.getElementById('agentcmd').value=chips[+btn.getAttribute('data-i')].tmpl;saveAgent();});});});}
function saveAgent(){api('/api/agentcmd',{cmd:document.getElementById('agentcmd').value});}
function loadScanRoots(){api('/api/scanroots').then(function(d){var box=document.getElementById('scanroots');var roots=d.effective||[];
box.innerHTML=roots.map(function(r){var custom=(d.roots||[]).indexOf(r)>=0;return "<div class='task' data-p='"+esc(r)+"'><span class='t' style='font-family:ui-monospace,monospace;font-size:12px'>"+esc(r)+"</span>"+(r===d.home?"<span class='rp'>home</span>":"")+(custom?"<button class='rm rmroot' title='remove'>&times;</button>":"")+"</div>";}).join("");
box.querySelectorAll('.rmroot').forEach(function(btn){btn.addEventListener('click',function(){api('/api/scanroots/remove',{path:btn.closest('.task').getAttribute('data-p')}).then(function(){loadScanRoots();mapLoaded=false;driftLoaded=false;});});});});}
function addRootUI(){var i=document.getElementById('newroot');var v=(i.value||'').trim();if(!v)return;var n=document.getElementById('scanrootnote');
api('/api/scanroots/add',{path:v}).then(function(r){if(r.error){n.innerHTML="<span class='err'>"+esc(r.error)+"</span>";return;}i.value='';n.textContent='Added — the Map/Drift will rescan.';loadScanRoots();mapLoaded=false;driftLoaded=false;});}
function setupLocalUI(){var o=document.getElementById('setupout');o.innerHTML="Setting up a local model&hellip;";
api('/api/setup-local',{}).then(function(r){if(r.error==='not-installed'){var i=r.install||{};o.innerHTML="Ollama isn't installed. Run this once, then click again:<div class='out2'>"+esc(i.cmd||'')+"</div><div class='muted' style='font-size:11px'>or download: "+esc(i.alt||'https://ollama.com/download')+"</div>";return;}
o.innerHTML="Pulling <b>"+esc(r.model)+"</b> &mdash; watch it in the <b>Agents</b> tab. Symbiot switches to it automatically when the download finishes.";setTimeout(function(){setTab('agents');},700);}).catch(function(e){o.innerHTML="<span class='err'>Setup failed: "+esc(String((e&&e.message)||e))+"</span>";});}
function selectNode(id){sel=id;render();updateBar(id);var n=nodeById(id);api('/api/node?id='+encodeURIComponent(id)).then(showDetail);
if(n&&n.type==='repo'&&n.meta&&n.meta.path){loadReview(n.label,n.meta.path);}else{hideReview();}}
function screenToGraph(el,ev){var rc=el.getBoundingClientRect();var mx=(ev.clientX-rc.left)/rc.width*GW;var my=(ev.clientY-rc.top)/rc.height*GH;return {x:(mx-view.x)/view.k,y:(my-view.y)/view.k};}
function initGraphEvents(){var el=document.getElementById('graph');var mode=null,moved=0,sx=0,sy=0,ox=0,oy=0,downId=null,dnode=null;
function nodeAt(ev){var t=ev.target;var g=t&&t.closest?t.closest('.node'):null;return g?g.getAttribute('data-id'):null;}
el.addEventListener('wheel',function(ev){ev.preventDefault();if(!GRAPH)return;var rc=el.getBoundingClientRect();var mx=(ev.clientX-rc.left)/rc.width*GW;var my=(ev.clientY-rc.top)/rc.height*GH;var nk=Math.max(0.3,Math.min(4,view.k*(ev.deltaY<0?1.12:0.89)));view.x=mx-(mx-view.x)*(nk/view.k);view.y=my-(my-view.y)*(nk/view.k);view.k=nk;render();},{passive:false});
el.addEventListener('pointerdown',function(ev){if(!GRAPH)return;moved=0;sx=ev.clientX;sy=ev.clientY;ox=view.x;oy=view.y;downId=nodeAt(ev);if(downId){mode='node';dnode=nodeById(downId);}else{mode='pan';}try{el.setPointerCapture(ev.pointerId);}catch(e){}});
el.addEventListener('pointermove',function(ev){
if(!mode){updateBar(nodeAt(ev));return;}
var dx=ev.clientX-sx,dy=ev.clientY-sy;moved+=Math.abs(dx)+Math.abs(dy);if(moved<4)return;
if(mode==='node'&&dnode){var p=screenToGraph(el,ev);dnode.x=p.x;dnode.y=p.y;render();}
else if(mode==='pan'){var rc=el.getBoundingClientRect();view.x=ox+dx/rc.width*GW;view.y=oy+dy/rc.height*GH;render();}});
el.addEventListener('pointerup',function(ev){var id=downId,wasClick=moved<6;mode=null;dnode=null;downId=null;
if(id){selectNode(id);}else if(wasClick){sel=null;hideDetail();hideReview();render();updateBar(null);}});
el.addEventListener('mouseleave',function(){if(!mode)updateBar(null);}); }
function scanLine(s){return 'Mapping your work… '+s.phase+(s.total?' '+s.done+'/'+s.total:'')+(s.item?' · '+s.item:'')+' · '+Math.round((s.elapsed||0)/1000)+'s';}
function loadMap(){var p=document.getElementById("profile");p.textContent="Mapping your work...";document.getElementById("graph").innerHTML="";sel=null;hideDetail();hideReview();var done=false;
function poll(){if(done)return;api('/api/scan').then(function(s){if(done)return;if(s&&s.active&&s.phase)p.textContent=scanLine(s);setTimeout(poll,600);}).catch(function(){});}
setTimeout(poll,400);
api("/api/map").then(function(g){done=true;mapLoaded=true;if(!g.nodes||!g.nodes.length){p.textContent="No git repositories found under your home folder.";return;}GRAPH=g;layout(g.nodes,g.edges);view={k:1,x:0,y:0};p.innerHTML=profileLine(g)+(g.stats&&g.stats.partial?" &middot; <span class='err'>partial &mdash; the scan hit its time limit</span>":"");render();});}
function fitBadge(m){return m.fits?"<span class='tag'>fits your RAM</span>":"<span class='tag' style='background:#3a2a12;border-color:#6b4a1f;color:#F2A541'>needs more RAM</span>";}
function loadRec(){var out=document.getElementById('recout');out.innerHTML="<div class='muted'>Reading your hardware...</div>";
api('/api/models').then(function(d){var hw=d.hardware,rec=d.rec;
var h="<div class='k'><b>"+hw.ramGB+" GB</b> RAM &middot; "+hw.cpuCount+"-core &middot; "+esc(hw.platform)+"/"+esc(hw.arch)+(hw.gpu?" &middot; GPU: "+esc(hw.gpu.name)+(hw.gpu.vramGB?" ("+hw.gpu.vramGB+"GB)":""):"")+"</div>";
h+="<div class='ideas'><h4>Local models &middot; free via Ollama</h4>";
rec.local.forEach(function(m){h+="<div class='idea' style='justify-content:space-between'><span><b>"+esc(m.tier)+"</b> &middot; <code>ollama pull "+esc(m.model)+"</code> <span class='muted'>~"+m.needGB+"GB &middot; "+esc(m.note)+"</span></span> "+fitBadge(m)+"</div>";});
h+="<div class='muted' style='margin-top:6px'>Best fit: <b>"+esc(rec.best)+"</b> &mdash; pull it, then pick <b>Local model (Ollama)</b> above.</div></div>";
h+="<div class='ideas'><h4>Paid models &middot; bring an API key</h4>";
rec.paid.forEach(function(p){h+="<div class='idea'><span><b>"+esc(p.provider)+"</b> &middot; "+esc(p.tier)+" &middot; <code>"+esc(p.model)+"</code> <span class='muted'>&middot; "+esc(p.note)+"</span></span></div>";});
h+="</div>";out.innerHTML=h;});}
document.getElementById('remap').addEventListener('click',loadMap);
document.getElementById('recbtn').addEventListener('click',loadRec);
document.getElementById('setuplocal').addEventListener('click',setupLocalUI);
document.getElementById('addroot').addEventListener('click',addRootUI);
document.getElementById('newroot').addEventListener('keydown',function(e){if(e.key==='Enter')addRootUI();});
document.getElementById('driftrun').addEventListener('click',function(){driftLoaded=false;loadDrift();});
document.getElementById('agentsrefresh').addEventListener('click',loadAgents);
document.getElementById('addtask').addEventListener('click',addTaskUI);
document.getElementById('pushtasks').addEventListener('click',pushTasksUI);
document.getElementById('agentcmd').addEventListener('change',saveAgent);
document.getElementById('newtask').addEventListener('keydown',function(e){if(e.key==='Enter')addTaskUI();});
var SRV_STARTED=null,srvDown=false,updBusy=false;
function ubar(){return document.getElementById('updatebar');}
function heartbeat(fresh){
  api('/api/ping'+(fresh?'?fresh=1':'')).then(function(p){
    var b=ubar();
    var ve=document.getElementById('ver');if(ve&&p.version)ve.textContent='v'+p.version;
    if(SRV_STARTED===null){SRV_STARTED=p.started;}
    else if(p.started!==SRV_STARTED){location.reload();return;}
    if(srvDown){location.reload();return;}
    if(updBusy)return;
    if(p.latest&&p.newer){
      b.className='updatebar show';
      b.innerHTML="A new Symbiot ("+esc(p.latest)+") is available &mdash; you're on "+esc(p.version)+". <button id='doupd'>Update &amp; restart</button>";
      var btn=document.getElementById('doupd');if(btn)btn.onclick=doUpdate;
    }else{b.className='updatebar';}
  }).catch(function(){srvDown=true;var b=ubar();b.className='updatebar reconnect show';b.textContent='Reconnecting to Symbiot…';});
}
function doUpdate(){updBusy=true;var b=ubar();b.className='updatebar show';b.textContent='Updating & restarting… this page will reload itself when it is back.';api('/api/update',{});}
setInterval(heartbeat,4000);heartbeat(true);
window.addEventListener('focus',function(){heartbeat(true);}); // re-check for updates when you come back to the window
initGraphEvents();syncP();refresh();loadMap();loadAgentCfg();loadScanRoots();
</script></body></html>`;
