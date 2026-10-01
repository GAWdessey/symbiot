// symbiot UI — Settings tab: provider/key, agent command, scan folders,
// model recommendations and local-model setup. One <script> block (see ui.mjs).
export const SETTINGS_JS = `
function syncP(){var p=$('provider').value;var local=p==='ollama';$('keyWrap').classList.toggle('hidden',local);$('baseWrap').classList.toggle('hidden',!local);
$('getkey').textContent=local?'About Ollama':'Where do I get a key?';$('modelHint').textContent='(default '+DEFMODEL[p]+')';$('model').placeholder='(blank = '+DEFMODEL[p]+')';}
$('provider').addEventListener('change',syncP);
$('getkey').addEventListener('click',function(){window.open(KEYURL[$('provider').value],'_blank');});
$('save').addEventListener('click',function(){var p=$('provider').value;$('saveMsg').textContent='checking...';$('saveMsg').className='note muted';
var cfg={provider:p,model:$('model').value.trim()};if(p==='ollama')cfg.baseUrl=$('baseUrl').value.trim();else cfg.key=$('key').value.trim();
api('/api/connect',cfg).then(function(r){$('saveMsg').textContent=r.message||(r.ok?'Connected.':'Could not connect.');$('saveMsg').className='note '+(r.ok?'ok':'err');if(r.ok){$('key').value='';refresh();}});});
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
document.getElementById('recbtn').addEventListener('click',loadRec);
document.getElementById('setuplocal').addEventListener('click',setupLocalUI);
document.getElementById('addroot').addEventListener('click',addRootUI);
document.getElementById('newroot').addEventListener('keydown',function(e){if(e.key==='Enter')addRootUI();});
document.getElementById('agentcmd').addEventListener('change',saveAgent);
`;
