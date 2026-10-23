// symbiot — write-ups, the task list and re-filing, task Q&A, and Approve.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// The write-ups as a document: # headings, - bullets, **bold**; everything escaped first.
function mdLite(t){var out=[],list=false;String(t||'').split(String.fromCharCode(10)).forEach(function(line){var l=line.trim(),b=function(x){var p=esc(x).split('**');return p.map(function(s,i){return i%2?'<b>'+s+'</b>':s;}).join('');};
if(l.indexOf('- ')===0||l.indexOf('* ')===0||l.indexOf('• ')===0){if(!list){out.push('<ul>');list=true;}out.push('<li>'+b(l.slice(2))+'</li>');return;}
if(list){out.push('</ul>');list=false;}if(!l){return;}var h=0;while(l.charAt(h)==='#')h++;if(h&&l.charAt(h)===' '){out.push('<h'+Math.min(4,h+2)+'>'+b(l.slice(h+1))+'</h'+Math.min(4,h+2)+'>');return;}
out.push('<p>'+b(l)+'</p>');});if(list)out.push('</ul>');return out.join('');}
function wuHead(){var t=$('wutitle'),u=$('wusub');if(!t||!u)return;var c=typeof current==='string'?current:'week',d=new Date(),f=function(x){return x.toLocaleDateString(undefined,{day:'numeric',month:'short'});};
if(c==='standup'){t.textContent='Your standup';u.textContent='Yesterday and today, from your local git';}else if(c==='todo'){t.textContent='Still on your plate';u.textContent='What your repos say is unfinished';}else{var a=new Date(d.getTime()-6*86400000);t.textContent='Your week';u.textContent=f(a)+' to '+f(d)+', from your local git';}}
function profileLine(g){var repos=g.nodes.filter(function(n){return n.type==="repo";});var base=lmTilde(g.stats.base)||"your home folder";
if(g.stats.noStorage)return "Symbiot can't see your phone's files yet, so it can't find your projects. Android calls this <b>All files access</b>."+(window.SymbiotAndroid?" <button class='act' id='allowfiles'>Allow file access</button>":"");
if(!repos.length)return "No git repositories found under "+esc(base)+" yet."+(g.stats.android?" Projects in Termux's home folder (<code>~</code>) are private to Termux, so no other app can see them."+(phoneTermux().installed?" Symbiot running in Termux can, and this app can show it: <button class='act' id='usetermux'>Open Termux</button> copies the command that starts it. Paste it there, and Termux opens it here. Or keep":" Keep")+" your projects in shared storage: in Termux, run <code>termux-setup-storage</code> and work under <code>~/storage/shared</code>.":"");var langs=g.nodes.filter(function(n){return n.type==="lang";}).map(function(n){return n.label;});var top=repos.slice().sort(function(a,b){return (b.meta.commits||0)-(a.meta.commits||0);})[0];var more=(g.stats.roots||[]).filter(function(r){return r!==base;}).length;var s="Scanned <b>"+esc(base)+"</b>"+(more?" and "+more+" more folder"+(more>1?"s":""):"")+" &middot;<b>"+g.stats.repos+"</b> repos &middot; <b>"+g.stats.commits+"</b> of your commits &middot; <b>"+(g.stats.files||0)+"</b> files &middot; ";s+=langs.length?("mostly <b>"+esc(langs.slice(0,3).join(", "))+"</b>"):"no languages detected";if(top)s+=" &middot; most active: <b>"+esc(top.label)+"</b>";return s;}
function nodeById(id){for(var i=0;i<GRAPH.nodes.length;i++)if(GRAPH.nodes[i].id===id)return GRAPH.nodes[i];return null;}
function hideDetail(){document.getElementById('detail').classList.add('hidden');}
function ago(sec){if(!sec)return'';var s=Math.floor(Date.now()/1000)-sec;if(s<3600)return Math.max(1,Math.floor(s/60))+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago';}
function agentBadge(d){if(!d.agents||!d.agents.length)return'';return d.agents.map(function(a){return "<div style='margin-top:8px;font-size:12px;color:var(--bone);background:var(--green-dim);border:1px solid #2a6b52;border-radius:8px;padding:6px 9px'>&#9889; worked via <b>"+esc(a.agent)+"</b>"+(a.last?" &middot; "+ago(a.last):"")+"</div>";}).join('');}
function showDetail(d){var el=document.getElementById('detail');el.classList.remove('hidden');
if(d.error){el.innerHTML="<h3>&mdash;</h3><div class='k'>"+esc(d.error)+"</div>";return;}
if(d.type==='repo'){var chips="";['branch: '+(d.branch||'?'),d.commits+' commits',(d.dirty?d.dirty+' uncommitted':'clean'),(d.last?'last '+d.last:'')].concat(d.langs||[]).concat(d.tools||[]).forEach(function(x){if(x)chips+="<span class='tag'>"+esc(x)+"</span>";});
el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='chips'>"+chips+"</div>"+lmWeeks(d)+lmNearHtml('repo:'+d.path)+agentBadge(d)+"<button class='act' id='suggest' style='margin-top:12px'>Suggest next steps</button><div id='sugout'></div>";lmNearWire(el);
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
var ALLTASKS=[];var PENDTASKS=[];var TFILTER={type:'',repo:'',id:''};var TARCH=false;
var TORDER=['Fixes','Tests & CI','Security','Performance','Refactor','UI/UX','Docs','Features & other'];
function liveBadge(t){return t.liveState==='pending'?"<span class='rp' title='"+esc(t.liveNote||'')+"'>merged, not live</span><button class='ghost markLive' title='Deployed and checked on the live site: mark it live'>live</button>":t.liveState==='live'?"<span class='rp' title='"+esc(t.liveNote||'')+"'>live</span>":t.liveState==='failed'?"<span class='rp' style='color:var(--amber)' title='"+esc(t.liveNote||'')+"'>deploy not live</span><button class='ghost markLive' title='Deployed and checked on the live site: mark it live'>live</button>":"";}
function taskRow(t,arch){return "<div class='task"+(t.done?" done":"")+"' data-id='"+esc(t.id)+"'>"+(arch?"":"<input type='checkbox' class='taskchk' title='mark done (auto-archives on sync)'"+(t.done?" checked":"")+">")+"<span class='t'>"+esc(t.full?t.text.replace(/ Full text: \\x60[^\\x60]*\\x60/,''):t.text)+(t.full?"<details class='tfull'><summary>full text</summary><div>"+esc(t.full)+"</div></details>":"")+"</span>"+(!arch&&!t.done&&!t.review&&TLANES.length?lanePick(t):t.repo?"<span class='rp'>"+esc(t.repo)+"</span>":"")+(arch&&t.removedBy?"<span class='rp' title='An approved task "+(t.merged?"merged it into another":"dropped it")+". Restore it to keep it.'>"+(t.merged?"merged":"dropped")+"</span>":"")+(arch&&t.dropped?"<span class='rp' title='An agent deleted it from TASKS.md, as you said to drop it. Restore it to keep it.'>dropped</span>":"")+(arch&&t.cancelled?"<span class='rp' title='You removed it. Restore it to bring it back.'>removed</span>":"")+(arch&&t.finding?"<span class='rp' title='"+escQ('Ticked by itself: '+t.finding+'. Restore it if there is something to do.')+"'>finding</span>":"")+liveBadge(t)+(arch||t.done?"":modelPick(t))+askBtn(t)+(arch?"<button class='rm restore' title='restore to active'>&#8630;</button>":"<button class='rm' title='Remove: it goes to the Archive (Undo brings it back)' aria-label='Remove this task'>&times;</button>")+"</div>";}
// Its lane, and the others it can be re-filed in: one under a name that's no lane (an ops run's title)
// is picked up by nothing, so it says so until it's given one (tasks.mjs refileTask)
var TLANES=[];
function lanePick(t){var o=TLANES.slice();if(t.repo&&o.indexOf(t.repo)<0)o.unshift(t.repo);if(!t.repo)o.unshift('');return "<select class='tmodel tlane"+(t.unplaced?" bad":"")+"' title='"+escQ(t.unplaced?'Filed under '+t.repo+', which is no lane, so nothing picks it up: pick its lane':'Its lane: pick another to re-file it there')+"' aria-label='Lane'>"+o.map(function(x){return "<option value='"+esc(x)+"'"+((t.repo||'')===x?" selected":"")+">"+esc(x?(x===t.repo&&t.unplaced?lqShort(String(x).replace(/^Agent:\\s*/,'').replace(/\\*+/g,''),28)+' (no lane)':x):'no lane')+"</option>";}).join('')+"</select>";}
function modelPick(t){var o=[['','Auto'],['local','Local'],['haiku','Haiku'],['sonnet','Sonnet'],['opus','Opus'],['fable','Fable']];return "<select class='tmodel' title='Which model runs this task. Auto picks one by the task and its lane.' aria-label='Model'>"+o.map(function(x){return "<option value='"+x[0]+"'"+((t.model||'')===x[0]?" selected":"")+">"+x[1]+"</option>";}).join('')+"</select>";}
function wireTaskRows(el){el.querySelectorAll('.task').forEach(function(row){var id=row.getAttribute('data-id');
var cb=row.querySelector('.taskchk');if(cb)cb.addEventListener('change',function(){api('/api/tasks/toggle',{id:id}).then(function(){row.classList.toggle('done');});});
wireAsk(row,id);
var ml=row.querySelector('.markLive');if(ml)ml.addEventListener('click',function(){api('/api/tasks/live',{id:id}).then(function(){(ALLTASKS.find(function(x){return x.id===id;})||{}).liveState='live';loadArchived();});});
var lp=row.querySelector('.tlane');if(lp)lp.addEventListener('change',function(){if(!lp.value)return;lp.disabled=true;api('/api/tasks/lane',{id:id,repo:lp.value}).then(function(r){if(!r||r.error){lp.disabled=false;var t0=taskById(id);lp.value=(t0&&t0.repo)||'';lp.title=(r&&r.error)||'It didn’t move.';return;}loadTasks();});});
var mp=row.querySelector('.tmodel:not(.tlane)');if(mp)mp.addEventListener('change',function(){api('/api/tasks/model',{id:id,model:mp.value});var t=taskById(id);if(t){if(mp.value)t.model=mp.value;else delete t.model;}});
var rm=row.querySelector('.rm');if(rm&&rm.classList.contains('restore'))rm.addEventListener('click',function(){api('/api/tasks/restore',{id:id}).then(loadArchived);});
else if(rm)rm.addEventListener('click',function(){rm.disabled=true;api('/api/tasks/cancel',{id:id}).then(function(r){if(!r||r.error){rm.disabled=false;lqSaid((r&&r.error)||'It didn’t go. Try again.',true);return;}var nx=row.nextElementSibling;if(nx&&nx.classList.contains('tchat'))nx.remove();row.remove();ALLTASKS=ALLTASKS.filter(function(x){return x.id!==id;});LQ.fresh=true;
var tx=row.querySelector('.t');lqUndo('Removed: '+lqShort(tx?tx.textContent:'the task',70),function(){return api('/api/tasks/restore',{id:id});});}).catch(function(e){rm.disabled=false;lqSaid(String((e&&e.message)||e),true);});});});}
// Per-task Q&A: the button opens a thread under the row; answers come from the
// connected model, grounded in the task's repo (and its pending changes).
function askBtn(t){var n=(t.chat||[]).length;return "<button class='ask"+(n?" has":"")+"' title='"+(n?"questions &amp; answers about this task":"ask a question about this task")+"'><i class=ic-chat></i>"+(n?" "+Math.ceil(n/2):"")+"</button>";}
function taskById(id){var all=PENDTASKS.concat(ALLTASKS);for(var i=0;i<all.length;i++)if(all[i].id===id)return all[i];return null;}
function stepsHtml(st){return st&&st.length?"<details class='steps'><summary>"+st.length+(st.length>1?' steps':' step')+" &middot; "+esc(String(st[0]).charAt(0).toLowerCase()+String(st[0]).slice(1))+"</summary><ul>"+st.map(function(x){return "<li>"+esc(x)+"</li>";}).join('')+"</ul></details>":"";}
function chatMsgs(chat){return (chat||[]).map(function(m){return "<div class='msg "+(m.role==='user'?'q':'a')+"'>"+esc(m.text)+(m.role==='user'?'':stepsHtml(m.steps))+"</div>";}).join("");}
var CHATHINT="<div class='muted' style='font-size:12px'>Ask anything about this task &mdash; what it means, how to approach it, or what the agent changed. Answers draw on the repo&#39;s commits, README and rules.</div>";
function wireAsk(row,id){var b=row.querySelector('.ask');if(b)b.addEventListener('click',function(){toggleChat(row,id);});}
function toggleChat(row,id){var btn=row.querySelector('.ask');var nx=row.nextElementSibling;
if(nx&&nx.classList.contains('tchat')){nx.remove();btn.classList.remove('on');return;}
var t=taskById(id)||{id:id};btn.classList.add('on');
row.insertAdjacentHTML('afterend',"<div class='tchat'><div class='msgs'>"+((t.chat&&t.chat.length)?chatMsgs(t.chat):CHATHINT)+"</div><div class='row'><input class='askq' placeholder='Ask about this task...' style='flex:1'><button class='ghost asksend'>Ask</button><a class='askclear' title='forget this conversation'>clear</a></div></div>");
var box=row.nextElementSibling,inp=box.querySelector('.askq'),send=box.querySelector('.asksend'),msgs=box.querySelector('.msgs');
function ask(){var q=(inp.value||'').trim();if(!q||send.disabled)return;send.disabled=true;inp.value='';
if(!(t.chat&&t.chat.length))msgs.innerHTML='';
msgs.insertAdjacentHTML('beforeend',chatMsgs([{role:'user',text:q}])+"<div class='msg a muted thinking'>Thinking&hellip;</div>");
api('/api/tasks/chat',{id:id,question:q}).then(function(r){send.disabled=false;var th=msgs.querySelector('.thinking');if(th)th.remove();
if(r.error==='not-connected'){msgs.insertAdjacentHTML('beforeend',"<div class='msg a'>Connect a model in Settings to ask questions - Ollama is free and runs locally.</div>");return;}
if(r.error){msgs.insertAdjacentHTML('beforeend',"<div class='msg a err'>"+esc(r.error)+"</div>");return;}
t.chat=r.chat||[];msgs.innerHTML=chatMsgs(t.chat);btn.className='ask on has';btn.innerHTML="<i class=ic-chat></i> "+Math.ceil(t.chat.length/2);}).catch(function(e){send.disabled=false;var th=msgs.querySelector('.thinking');if(th)th.remove();msgs.insertAdjacentHTML('beforeend',"<div class='msg a err'>"+esc(String((e&&e.message)||e))+"</div>");});}
send.addEventListener('click',ask);inp.addEventListener('keydown',function(e){if(e.key==='Enter')ask();});
box.querySelector('.askclear').addEventListener('click',function(){api('/api/tasks/chat/clear',{id:id}).then(function(){t.chat=[];msgs.innerHTML=CHATHINT;btn.className='ask on';btn.innerHTML='<i class=ic-chat></i>';});});
inp.focus();}
function fchip(dim,val,label){var on=(TFILTER[dim]||'')===val;return "<button class='fchip"+(on?' on':'')+"' data-dim='"+dim+"' data-val='"+esc(val)+"'>"+esc(label)+"</button>";}
function renderFilter(){var box=document.getElementById('taskfilter');
if(TFILTER.id&&!TARCH){box.innerHTML="<button class='fchip on' id='alltasks'>&#8592; All tasks</button><span class='fl'>Just this task</span>";document.getElementById('alltasks').addEventListener('click',function(){TFILTER.id='';renderTasks();});return;}
if(TARCH){box.innerHTML="<button class='fchip on' id='archtoggle'>&#8617; back to active</button>";document.getElementById('archtoggle').addEventListener('click',function(){loadTasks();});return;}
var types={},repos={};ALLTASKS.forEach(function(t){types[t.type||'Features & other']=1;if(t.repo)repos[t.repo]=1;});
var fb="<span class='fl'>Type</span>"+fchip('type','','All')+Object.keys(types).sort(function(a,b){return TORDER.indexOf(a)-TORDER.indexOf(b);}).map(function(t){return fchip('type',t,t);}).join('');
fb+="<span class='fl'>Repo</span>"+fchip('repo','','All')+Object.keys(repos).sort().map(function(r){return fchip('repo',r,r);}).join('');
fb+="<button class='fchip' id='archtoggle' style='margin-left:auto'><i class=ic-archive></i> archived</button>";
box.innerHTML=fb;
box.querySelectorAll('.fchip[data-dim]').forEach(function(c){c.addEventListener('click',function(){TFILTER[c.getAttribute('data-dim')]=c.getAttribute('data-val');renderTasks();});});
document.getElementById('archtoggle').addEventListener('click',loadArchived);}
function renderTasks(){var el=document.getElementById('tasklist');TARCH=false;if(el&&el.classList)el.classList.toggle('onerepo',!!TFILTER.repo);renderFilter();renderNeeds();lqTitle();
var list=ALLTASKS.filter(function(t){return !t.review&&(!TFILTER.type||(t.type||'Features & other')===TFILTER.type)&&(!TFILTER.repo||t.repo===TFILTER.repo)&&(!TFILTER.id||t.id===TFILTER.id);});
if(!list.length){el.innerHTML="<div class='muted' style='margin-top:12px'>"+(ALLTASKS.length?"Nothing matches this filter.":"No tasks queued. Tell Symbiot one in the bar at the bottom, or tick ideas in a repo review on the Map.")+"</div>";return;}
var groups={};list.forEach(function(t){var ty=t.type||'Features & other';(groups[ty]=groups[ty]||[]).push(t);});
var keys=Object.keys(groups).sort(function(a,b){var ia=TORDER.indexOf(a),ib=TORDER.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});
var h="";keys.forEach(function(ty){h+="<div class='tgroup'>"+esc(ty)+" <span class='tcount'>"+groups[ty].length+"</span></div>";groups[ty].forEach(function(t){h+=taskRow(t,false);});});
el.innerHTML=h;wireTaskRows(el);}
function loadTasks(){TARCH=false;api('/api/tasks/sync',{}).then(function(){api('/api/tasks/lanes').then(function(d){TLANES=(d&&d.lanes)||[];},function(){}).then(function(){api('/api/tasks').then(function(list){ALLTASKS=list;renderTasks();wdJump();});});loadPending();});}
// While an agent is still working in a repo on the review list, its Approve is
// greyed out; check again every few seconds, and when it finishes, sync (its last
// ticks land in review) so Approve unlocks without reopening the tab. The poll
// only re-renders on a change, so an open diff or chat isn't closed under you.
var pendTimer=null,PENDRUN='';
function pendRunning(list){return (list||[]).filter(function(r){return r.running||r.shipping;}).map(function(r){return r.repo+(r.shipping?' '+r.shipping.step:'');}).join('\\n');}
function pendPoll(){if(pendTimer){clearTimeout(pendTimer);pendTimer=null;}if(!PENDRUN||current!=='tasks')return;
pendTimer=setTimeout(function(){pendTimer=null;if(current!=='tasks')return;api('/api/pending').then(function(list){if(pendRunning(list)===PENDRUN||selIn($('panel-tasks')))pendPoll();else loadTasks();}).catch(pendPoll);},4000);}
// Approve opens on what you came for: in a project, only its card (the others are a
// click away, PENDALL), with its Approve button first and its tasks one line each, three
// shown (RTASKS). Clicking Review and approve on Home met the whole list: every project's
// card, every task in full, 3600px before the button (2026-10-12).
var PENDALL=false,RTASKS=3;
// Approved work that didn't get as far as a PR (the server's unsent): why, in words, and
// a retry, kept on the card until it's sent. bookly's four Approves were committed and
// never pushed, and the page said "nothing to merge" (2026-10-13).
var UNSENT_WHY={conflicts:"It clashes with main as GitHub has it now, so it wasn't pushed.",tests:"Its tests failed here, so it wasn't pushed.",push:"It wasn't pushed to GitHub.",pr:"It went up to GitHub, but no PR was opened."};
function unsentBox(un){var n=un.ahead||0,when=un.at?new Date(un.at).toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
return "<div class='note err runsent'><b>Approved"+(when?" "+esc(when):"")+", not on GitHub yet.</b> "+esc(un.headline||UNSENT_WHY[un.why]||UNSENT_WHY.push)+"<details class='muted'><summary>Details</summary>"+(un.note?esc(un.note)+"<br>":"")+"Committed <code>"+esc(un.commit||'')+"</code> on <code>"+esc(un.branch||'')+"</code>"+(n?" &middot; "+n+" commit"+(n>1?"s":"")+" GitHub doesn&rsquo;t have":"")+"</details>"+
"<div class='row' style='margin-top:6px'><button class='act sendagain' title='rebase on main, test, push and open the PR'>Send again</button>"+(un.why==='tests'?"<button class='ghost sendanyway' title='push and open the PR without running the tests on this computer: CI runs them on the PR'>Send without the tests here</button>":"")+"<button class='ghost leaveunsent' title='stop showing this: it was sent by hand, or isn&rsquo;t wanted'>Leave it</button></div></div>";}
function loadPending(){var el0=document.getElementById('reviewlist'),fr=TFILTER.repo;
if(el0&&!el0.innerHTML&&fr&&LQ.focus&&LQ.focus.kind==='approve'&&LQ.focus.repo===fr)el0.innerHTML="<div class='tgroup' style='color:var(--amber)'>Waiting for your OK</div><div class='muted rwait'>Getting "+esc(fr)+"'s changes ready&hellip;</div>";
api('/api/pending').then(function(list){var el=document.getElementById('reviewlist');PENDTASKS=[];PENDRUN=pendRunning(list);pendPoll();
if(!list||!list.length){el.innerHTML='';lqLight();return;}
var repo0=TFILTER.repo,mine=repo0&&!PENDALL?list.filter(function(r){return r.repo===repo0;}):[],others=mine.length?list.filter(function(r){return r.repo!==repo0;}):[];
if(mine.length)list=mine;else if(repo0&&!PENDALL){el.innerHTML='';lqLight();return;}
var n=0;list.forEach(function(r){n+=r.tasks.length||1;});
// nothing here waits on you (an agent still at work, or changes no task is ticked for): the heading says so, not "Waiting for your OK"
var idle=list.every(function(r){return r.running||r.leftover;});
var h=idle?"<div class='tgroup'>Uncommitted changes, not waiting on you</div>":"<div class='tgroup' style='color:var(--amber)'>"+(mine.length?"Waiting for your OK":"Awaiting your review <span class='tcount'>"+n+"</span>")+"</div>";
list.forEach(function(r){var top='';
if(r.unsent&&!r.tasks.length&&!r.files.length){h+="<div class='rcard' data-repo='"+esc(r.repo)+"'><div class='rhead'><b>"+esc(r.repo)+"</b><span class='muted'>on "+esc(r.branch||'?')+" &middot; no uncommitted changes</span></div>"+unsentBox(r.unsent)+"</div>";return;}
var ch=r.files.length?(r.files.length+" file"+(r.files.length>1?"s":"")+" changed"+(r.stat?" &middot; "+esc(r.stat):"")):"no uncommitted changes";
h+="<div class='rcard' data-repo='"+esc(r.repo)+"'"+(r.publishesOnMerge?" data-pom='1'":"")+"><div class='rhead'><b>"+esc(r.repo)+"</b><span class='muted'>"+(r.path?"on "+esc(r.branch||'?')+" &middot; "+ch:"repo not found on disk")+"</span></div>";
if(r.unsent)h+=unsentBox(r.unsent);
top=h;h='';var nt=r.tasks.length;
if(nt)h+="<div class='rtasks'><div class='muted rtn'>"+nt+" finished task"+(nt>1?"s":"")+" in it"+(nt>RTASKS?", the first "+RTASKS+" below":"")+". Click one to read it all.</div>";
r.tasks.forEach(function(t,i){PENDTASKS.push(t);if(i===RTASKS)h+="<div class='rmore hidden'>";h+="<div class='task rtask' data-id='"+esc(t.id)+"'><span class='t' title='click to read it all'>"+esc(t.text)+"</span>"+askBtn(t)+"<button class='rm sendback' title='not right - send back to the agent (unticks it)'>&#8630;</button></div>";});
if(nt>RTASKS)h+="</div><button type='button' class='ghost rmorebtn'>Show the other "+(nt-RTASKS)+"</button>";
if(nt)h+="</div>";
// a run that stopped on questions or a handover: partly done, and what it waits on, in plain words
var pd=r.partly,pq=pd&&pd.questions||0,ph=(pd&&pd.handed)||[];
if(pd)h+="<div class='partly'><b>Partly done:</b> "+esc([pq?pq+" question"+(pq>1?"s":"")+" for you":"",ph.length?ph.map(function(x){return x.lane+" is on “"+x.text+"”";}).join(', '):""].filter(Boolean).join(', and '))+". "+(r.untasked?"The changes so far can be approved now, or once it's finished.":"")+"</div>";
else if(r.round)h+="<div class='muted' style='margin:6px 0'>A finished round of &ldquo;"+esc(r.round.text.length>160?r.round.text.slice(0,159).replace(/\\s+\\S*$/,'')+'\u2026':r.round.text)+"&rdquo;, which is still going. Approve it and this round goes out as a PR; the task stays open for the rest.</div>";
// where changes no task is ticked for came from (which run, when) and what to do, in one line (tasks.mjs origin)
else if(r.untasked&&!r.running)h+="<div class='muted rorigin' style='margin:6px 0'>"+esc(r.origin||"Uncommitted changes with no ticked task behind them. Check the diff before you approve.")+"</div>";
// The repo's open tasks: tick the ones these changes finished, and they're approved with them instead of going out again on the next send.
var opn=(r.open||[]).filter(function(o){return !o.round;});
if(r.untasked&&opn.length&&!r.running){var said=opn.some(function(o){return o.finished;});h+="<div class='muted' style='margin:6px 0'>Did these changes finish any of "+esc(r.repo)+"'s open tasks? Tick them and they're approved with the changes, so they don't come back as new tasks"+(said?". Ticked already: the run's summary says it finished them.":".")+"</div>";
opn.forEach(function(o){h+="<label class='idea'><input type='checkbox' class='tickopen' data-id='"+esc(o.id)+"'"+(o.finished?" checked":"")+"><span>"+esc(o.text)+(o.finished?" <span class='tag'>run says done</span>":"")+"</span></label>";});}
// an agent still editing the checkout (its own run, or one from a folder of its own): who, since when, and no Approve until it's done
if(r.running)h+="<div class='rwork'><i aria-hidden='true'></i>"+esc(r.origin||"An agent is still at work here. Its changes may be half done, so there's nothing to approve until it finishes.")+"</div>";
// Approve already at it (an earlier click, here, on Home or the phone): say so and lock the button, which
// read "Approve → archive" once the commit was in and only met "Already approving here" (19 Oct 2026)
var sh=r.shipping,shAt=sh&&sh.since?new Date(sh.since).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'';
if(sh)h+="<div class='rwork rship'><i aria-hidden='true'></i>Approving now, since "+esc(shAt)+": "+esc(sh.step||'starting')+". It finishes by itself, and how it went shows here.</div>";
// A repo that publishes on merge (ur.npm) is measured from the version npm has,
// and a bump publishes it once merged; otherwise from the last v* tag, tagged by hand.
var ur=r.unreleased;if(ur&&ur.npm)h+="<div class='muted' style='margin:6px 0'><span class='err'>Unreleased:</span> "+(ur.pending?"<code>"+esc(ur.base)+"</code> is at <b>"+esc(ur.pending)+"</b>, which isn't on npm yet. This repo publishes when a version bump merges, so it should appear shortly; if it doesn't, check the publish workflow's run on GitHub.":"<code>"+esc(ur.base)+"</code> has "+ur.ahead+" commit"+(ur.ahead>1?"s":"")+" merged since <b>"+esc(ur.since)+"</b> went to npm. This repo publishes on merge, but only when the version changes, so they wait for the next bump. "+(ur.bump?"These changes bump it to <b>"+esc(ur.bump)+"</b>: it publishes when this PR merges.":r.bumpOffer&&r.files.length?"Approve can bump it in this PR (below), so it publishes when the PR merges.":"Bump the version in a PR to publish them."))+"</div>";
else if(ur)h+="<div class='muted' style='margin:6px 0'><span class='err'>Unreleased:</span> <code>"+esc(ur.base)+"</code> is "+ur.ahead+" commit"+(ur.ahead>1?"s":"")+" past <code>"+esc(ur.tag)+"</code>, so merged work isn't released yet. "+(ur.bump?"These changes bump the version to <b>"+esc(ur.bump)+"</b>: after the PR merges, tag <code>v"+esc(ur.bump)+"</code> on <code>"+esc(ur.base)+"</code> to release it.":r.bumpOffer&&r.files.length?"Approve can bump the version in this PR (below); tag it after the PR merges to release it.":"Bump the version (here or in a later PR) and tag it to release it.")+"</div>";
// The version is already released (its v* tag exists, or npm has it) and these changes keep it:
// Approve bumps it in the PR too, a patch unless you pick otherwise.
var bo=r.bumpOffer;if(bo&&r.files.length)h+="<div class='row' style='margin:6px 0;font-size:12px'><span class='muted'>Version</span><select class='bumpsel' title='bump the version in package.json (and the lockfile) in this PR' style='flex:0 0 auto;width:auto'><option value='patch'>bump to "+esc(bo.patch)+" (patch)</option><option value='minor'>bump to "+esc(bo.minor)+" (minor)</option><option value=''>keep "+esc(bo.version)+"</option></select></div>";
h+="<div class='row ract'>"+(pq&&r.path?"<button class='act answerq' data-path='"+esc(r.path).replace(/'/g,'&#39;')+"'>Answer its question"+(pq>1?"s":"")+"</button>":"")+(r.running&&!sh?"<button class='ghost atwork' disabled title='an agent is still editing this repo'>Agent at work</button>":"<button class='"+(pd||r.leftover?'ghost':'act')+" approve'"+(pd?" data-partly='1'":"")+(r.leftover?" data-leftover='1'":"")+(r.path&&!sh?"":" disabled")+(sh?" title='Approve is already putting this in'>Approving &middot; "+esc(sh.step||'starting'):r.round?" data-untasked='1' data-round='1' title='commit this round on a branch, push and open a PR; the task stays open'>Approve this round &rarr; PR":r.untasked?" data-untasked='1' title='commit on a branch, push and open a PR, without a task'>Approve changes without a task &rarr; PR":" title='commit on a branch, push, open a PR, then archive'>Approve &rarr; "+(r.files.length?"PR":"archive"))+"</button>")+(r.files.length?"<button class='ghost showdiff'>Show diff</button>":"")+"<label title='Queue GitHub auto-merge so this PR lands once its CI checks pass. Needs Allow auto-merge on the repo.' style='margin-left:auto;font-size:12px;color:var(--faint);display:flex;align-items:center;gap:6px'><input type='checkbox' class='amtoggle' style='width:auto'"+(r.autoMerge?" checked":"")+"> auto-merge on green CI</label></div><div class='rdiff hidden'></div>";
var act=h.slice(h.lastIndexOf("<div class='row ract'>")),bump=h.lastIndexOf("<div class='row' style='margin:6px 0;font-size:12px'><span class='muted'>Version</span>"),body=h.slice(0,h.lastIndexOf("<div class='row ract'>"));
var bsel=bump>=0?body.slice(bump):'';if(bump>=0)body=body.slice(0,bump);
h=top+bsel+act+body+"</div>";});
if(others.length)h+="<div class='muted rothers'>Also waiting for your OK: "+others.map(function(r){return esc(r.repo);}).join(', ')+" <button type='button' class='ghost rallbtn'>Show them</button></div>";
el.innerHTML=h;
var ra=el.querySelector('.rallbtn');if(ra)ra.addEventListener('click',function(){PENDALL=true;loadPending();});
el.querySelectorAll('.rcard').forEach(function(card){var repo=card.getAttribute('data-repo');
var rmb=card.querySelector('.rmorebtn'),rm=card.querySelector('.rmore');if(rmb&&rm)rmb.addEventListener('click',function(){var shut=rm.classList.toggle('hidden');rmb.textContent=shut?'Show the other '+rm.children.length:'Show fewer';});
card.querySelectorAll('.task').forEach(function(row){wireAsk(row,row.getAttribute('data-id'));});
card.querySelectorAll('.sendback').forEach(function(b){b.addEventListener('click',function(){api('/api/pending/sendback',{id:b.closest('.task').getAttribute('data-id')}).then(loadTasks);});});
var sa=card.querySelectorAll('.sendagain,.sendanyway');sa.forEach(function(b){b.addEventListener('click',function(){var o=document.getElementById('reviewout');sa.forEach(function(x){x.disabled=true;});b.textContent='Sending...';
api('/api/pending/send',{repo:repo,untested:b.classList.contains('sendanyway')}).then(function(r){
o.innerHTML=r&&r.pr?"<div class='note ok'>&#10003; <b>"+esc(repo)+"</b>: sent &middot; <a href='"+esc(okUrl(r.pr))+"' target='_blank' rel='noopener'>open PR</a>"+(r.note?"<div class='muted'>"+esc(r.note)+"</div>":"")+"</div>":"<div class='note err'>"+esc(repo)+": "+esc((r&&(r.error||r.note))||'failed')+"</div>";loadPending();});});});
var lv=card.querySelector('.leaveunsent');if(lv)lv.addEventListener('click',function(){lv.disabled=true;api('/api/pending/leave',{repo:repo}).then(loadPending);});
var amt=card.querySelector('.amtoggle');if(amt)amt.addEventListener('change',function(){api('/api/automerge',{repo:repo,on:amt.checked});});
var sd=card.querySelector('.showdiff'),pre=card.querySelector('.rdiff');
if(sd)sd.addEventListener('click',function(){if(!pre.classList.contains('hidden')){pre.classList.add('hidden');sd.textContent='Show diff';return;}
pre.textContent='Loading...';pre.classList.remove('hidden');sd.textContent='Hide diff';api('/api/pending/diff?repo='+encodeURIComponent(repo)).then(function(d){pre.textContent=(d&&d.diff)||'(no changes)';});});
var ap=card.querySelector('.approve'),bs=card.querySelector('.bumpsel'),tk=card.querySelectorAll('.tickopen');
function ticks(){var ids=[];tk.forEach(function(c){if(c.checked)ids.push(c.getAttribute('data-id'));});return ids;}
var so=ap&&ap.getAttribute('data-partly'),rd=ap&&ap.getAttribute('data-round'); // partly done: Approve takes what's there so far, the quieter choice
var lo=ap&&ap.getAttribute('data-leftover'); // changes no task is ticked for: Approve stays the quieter button until one is
function apLabel(){var n=ticks().length,w=n?", with "+n+" finished task"+(n>1?"s":""):"";if(ap&&lo)ap.className=(n?'act':'ghost')+' approve';if(ap&&!ap.disabled)ap.innerHTML=so?"Approve the changes so far"+w+" &rarr; PR":rd?"Approve this round"+w+" &rarr; PR":n?"Approve changes with "+n+" finished task"+(n>1?"s":"")+" &rarr; PR":"Approve changes without a task &rarr; PR";}
tk.forEach(function(c){c.addEventListener('change',apLabel);});if(tk.length||so)apLabel();
var aq=card.querySelector('.answerq');if(aq)aq.addEventListener('click',function(){lqFocus({kind:'ask',repo:repo,path:aq.getAttribute('data-path')});});
if(ap)ap.addEventListener('click',function(){var tick=ticks(),yes={};ap.disabled=true;ap.textContent='Committing & pushing...';
function go(){api(ap.getAttribute('data-untasked')?'/api/pending/approve-changes':'/api/pending/approve',{repo:repo,bump:bs?bs.value:'',tick:tick,confirm:yes.confirm,allowShared:yes.allowShared}).then(done);}
// a ship that outlasts its request goes on as a job (tasks.mjs shipJob): asked how it's going until it's done
function done(r){if(r&&r.job){setTimeout(function(){api('/api/pending/job?repo='+encodeURIComponent(repo)).then(function(j){if(j&&j.done)return done(j.result);if(j&&j.working){ap.textContent='Approving'+(j.step?': '+j.step:'')+'...';return done({job:repo});}ap.disabled=false;apLabel();loadTasks();});},3000);return;}var o=document.getElementById('reviewout');
if(r&&r.ask){var ob=document.getElementById('reviewout');ap.disabled=false;apLabel();ob.innerHTML="<div class='note'>"+esc(repo)+": "+esc(r.error)+(r.waiting?" Files: "+esc((r.shared||[]).slice(0,4).join(', ')):"")+"<div class='row' style='margin-top:6px'><button class='act askyes'>"+(r.untasked?"Commit them":"Approve anyway")+"</button><button class='ghost askno'>"+(r.waiting?"Wait for it":"Not now")+"</button></div></div>";
ob.querySelector('.askyes').addEventListener('click',function(){ap.disabled=true;ap.textContent='Committing & pushing...';ob.innerHTML='';if(r.untasked)yes.confirm=true;else yes.allowShared=true;go();});
ob.querySelector('.askno').addEventListener('click',function(){ob.innerHTML='';});return;}
if(!r||r.error){ap.disabled=false;ap.textContent='Approve - retry';o.innerHTML="<div class='note err'>"+esc(repo)+": "+esc((r&&r.error)||'failed')+"</div>";return;}
var m=(r.unsent?"<b>Not on GitHub yet.</b> "+(r.headline?esc(r.headline)+" ":""):"&#10003; ")+"<b>"+esc(repo)+"</b>: approved "+(r.round?"a round of its task, which stays open"+(r.approved?", and "+r.approved+" finished task"+(r.approved>1?"s":""):""):r.approved?r.approved+" task"+(r.approved>1?"s":""):"changes without a task");
if(r.commit&&!r.unsent)m+=" &middot; committed <code>"+esc(r.commit)+"</code> on <code>"+esc(r.branch)+"</code>";
if(r.pr)m+=" &middot; <a href='"+esc(okUrl(r.pr))+"' target='_blank' rel='noopener'>open PR</a>";
if(r.bumped&&card.getAttribute('data-pom'))m+="<div class='muted'>Bumps the version to <b>"+esc(r.bumped)+"</b>. It publishes to npm when the PR merges.</div>";
else if(r.bumped)m+="<div class='muted'>Bumps the version to <b>"+esc(r.bumped)+"</b>. After the PR merges, run <code>git pull &amp;&amp; git tag v"+esc(r.bumped)+" &amp;&amp; git push origin --tags</code> on <code>"+esc(r.base||'main')+"</code> to release it.</div>";
if(r.autoMerge==='queued')m+=" &middot; will auto-merge when CI passes";
else if(r.autoMerge==='unavailable')m+="<div class='muted'>auto-merge not enabled for this repo on GitHub (Settings &rarr; General &rarr; Allow auto-merge)"+(r.autoMergeErr?": "+esc(r.autoMergeErr):"")+"</div>";
if(r.live&&r.live.text)m+="<div class='muted'><b>"+(r.live.state==='pending'?"Not live yet.":"Live.")+"</b> "+esc(r.live.text)+(r.live.asked?" The question to deploy it is waiting on the Workdesk.":"")+"</div>";
if(r.note)m+=r.unsent?"<details class='muted'><summary>Details</summary>"+esc(r.note)+"</details>":"<div class='muted'>"+esc(r.note)+"</div>";
o.innerHTML="<div class='note "+(r.unsent?"err":"ok")+"'>"+m+"</div>";loadTasks();}go();});});lqLight();});}
function loadArchived(){TARCH=true;lqTitle();var nb=$('needsbox');if(nb)nb.innerHTML='';api('/api/tasks?archived=1').then(function(list){ALLTASKS=list;renderFilter();var el=document.getElementById('tasklist');
if(!list.length){el.innerHTML="<div class='muted' style='margin-top:12px'>Nothing archived yet. Completed tasks land here.</div>";return;}
var h="<div class='tgroup'>Archived <span class='tcount'>"+list.length+"</span></div>";list.forEach(function(t){h+=taskRow(t,true);});el.innerHTML=h;wireTaskRows(el);});}
var agentsTimer=null;
function stopAgentsPoll(){if(agentsTimer){clearTimeout(agentsTimer);agentsTimer=null;}}
function fmtE(ms){var s=Math.floor(ms/1000);if(s<60)return s+'s';var m=Math.floor(s/60);return m+'m '+(s%60)+'s';}
`;
