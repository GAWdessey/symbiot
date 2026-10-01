// symbiot UI — Map tab: the force-directed graph, node details, and the AI
// repo review with its tick-to-add ideas. One <script> block (see ui.mjs).
export const MAP_JS = `
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
function ago(sec){if(!sec)return'';var s=Math.floor(Date.now()/1000)-sec;if(s<3600)return Math.max(1,Math.floor(s/60))+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago';}
function agentBadge(d){if(!d.agents||!d.agents.length)return'';return d.agents.map(function(a){return "<div style='margin-top:8px;font-size:12px;color:var(--bone);background:var(--green-dim);border:1px solid #2a6b52;border-radius:8px;padding:6px 9px'>&#9889; worked via <b>"+esc(a.agent)+"</b>"+(a.last?" &middot; "+ago(a.last):"")+"</div>";}).join('');}
function showDetail(d){var el=document.getElementById('detail');el.classList.remove('hidden');
if(d.error){el.innerHTML="<h3>&mdash;</h3><div class='k'>"+esc(d.error)+"</div>";return;}
if(d.type==='repo'){var chips="";['branch: '+(d.branch||'?'),d.commits+' commits',(d.dirty?d.dirty+' uncommitted':'clean'),(d.last?'last '+d.last:'')].concat(d.langs||[]).concat(d.tools||[]).forEach(function(x){if(x)chips+="<span class='tag'>"+esc(x)+"</span>";});
el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='chips'>"+chips+"</div>"+agentBadge(d)+"<button class='act' id='suggest' style='margin-top:12px'>Suggest next steps</button><div id='sugout'></div>";
document.getElementById('suggest').addEventListener('click',function(){var o=document.getElementById('sugout');o.innerHTML="<div class='out2'>Thinking...</div>";api('/api/suggest',{path:d.path}).then(function(r){if(r.error==='not-connected'){o.innerHTML="<div class='out2'>Connect a model in Settings to get suggestions - Ollama is free and runs locally.</div>";return;}o.innerHTML="<div class='out2'>"+esc(r.text||'(no output)')+"</div>"+(r.footer?"<div class='rfoot'>"+esc(r.footer)+"</div>":"");});});return;}
if(d.type==='lang'||d.type==='tool'){var lis=(d.repos||[]).map(function(r){return "<li>"+esc(r)+"</li>";}).join("");el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>Used in "+((d.repos||[]).length)+" repos</div><ul>"+lis+"</ul>";return;}
if(d.type==='agent'){var m=d.meta||{};el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>"+(m.kind==='agent'?'AI coding agent you have installed':'editor you have installed')+"</div>"+(m.cmd?"<div class='out2' style='font-size:11px'>"+esc(m.cmd)+"</div>":"");return;}
if(d.type==='ai'){var m=d.meta||{};el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>Currently powering Symbiot &middot; model <b>"+esc(m.model||'?')+"</b>"+(m.source?" &middot; via "+esc(m.source):"")+"</div>";return;}
if(d.type==='folder'){var chips='';(d.langs||[]).concat(d.tools||[]).forEach(function(x){chips+="<span class='tag'>"+esc(x)+"</span>";});el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>project folder &middot; not a git repo &middot; "+(d.files||0)+" files</div><div class='chips'>"+chips+"</div><div class='k' style='font-family:ui-monospace,monospace'>"+esc(d.path||'')+"</div>"+agentBadge(d)+"<button class='act' id='suggest' style='margin-top:12px'>Overview &amp; suggestions</button><div id='sugout'></div><div class='k' style='margin-top:8px'>Tasks can be sent here too &mdash; the agent runs in this folder.</div>";document.getElementById('suggest').addEventListener('click',function(){var o=document.getElementById('sugout');o.innerHTML="<div class='out2'>Thinking...</div>";api('/api/suggest',{path:d.path}).then(function(r){if(r.error==='not-connected'){o.innerHTML="<div class='out2'>Connect a model in Settings to get an overview - Ollama is free and runs locally.</div>";return;}o.innerHTML="<div class='out2'>"+esc(r.text||'(no output)')+"</div>"+(r.footer?"<div class='rfoot'>"+esc(r.footer)+"</div>":"");});});return;}
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
api("/api/map").then(function(g){done=true;mapLoaded=true;if(!g.nodes||!g.nodes.length){p.textContent="No git repositories found under your home folder.";return;}GRAPH=g;fillTaskRepos();layout(g.nodes,g.edges);view={k:1,x:0,y:0};p.innerHTML=profileLine(g)+(g.stats&&g.stats.partial?" &middot; <span class='err'>partial &mdash; the scan hit its time limit</span>":"");render();});}
document.getElementById('remap').addEventListener('click',loadMap);
`;
