// symbiot UI — Agents tab: live status and output of handed-off agents.
// One <script> block (see ui.mjs).
export const AGENTS_JS = `
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
document.getElementById('agentsrefresh').addEventListener('click',loadAgents);
`;
