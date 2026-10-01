// symbiot UI — core: the API helper, shared state, tab switching, the
// Week/Standup/Todo panel and Quit. Loaded first: the view scripts use its
// api(), $() and esc(). One <script> block of the page ui.mjs assembles.
export const CORE_JS = `
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
if(isTasks){fillTaskRepos();loadTasks();}
if(isDrift&&!driftLoaded)loadDrift();
if(isAgents)loadAgents(); else stopAgentsPoll();}
tabs().forEach(function(t){t.addEventListener('click',function(){setTab(t.dataset.tab);});});
function refresh(){api('/api/status').then(function(s){$('status').textContent=s.connected?s.line:'Not connected - open Settings';});}
$('write').addEventListener('click',function(){$('out').textContent='Writing...';$('out').classList.add('muted');$('copy').classList.add('hidden');
api('/api/run',{cmd:current}).then(function(r){var f=$('outfoot');if(r.error==='not-connected'){$('out').textContent='Not connected yet - open Settings and pick an AI.';f.style.display='none';return;}
$('out').textContent=r.text||'(no output)';$('out').classList.remove('muted');$('copy').classList.remove('hidden');if(r.footer){f.textContent=r.footer;f.style.display='block';}else{f.style.display='none';}});});
$('copy').addEventListener('click',function(){navigator.clipboard.writeText($('out').textContent);$('copy').textContent='Copied';setTimeout(function(){$('copy').textContent='Copy';},1400);});
$('quit').addEventListener('click',function(){api('/api/quit');document.body.innerHTML='<div style=\\'padding:40px;color:#7E9690;font-family:sans-serif\\'>Symbiot stopped. You can close this window.</div>';});
var GRAPH=null,sel=null,view={k:1,x:0,y:0},GW=960,GH=620;
function esc(s){return String(s).replace(/[&<>]/g,function(ch){return ch==='&'?'&amp;':ch==='<'?'&lt;':'&gt;';});}
`;
