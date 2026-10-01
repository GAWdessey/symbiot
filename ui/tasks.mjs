// symbiot UI — Tasks tab: the task list and filters, per-task Q&A chat,
// "Awaiting your review" (approve / send back), archive, and Send to repos.
// One <script> block (see ui.mjs).
export const TASKS_JS = `
var ALLTASKS=[];var PENDTASKS=[];var TFILTER={type:'',repo:''};var TARCH=false;
var TORDER=['Fixes','Tests & CI','Security','Performance','Refactor','UI/UX','Docs','Features & other'];
function taskRow(t,arch){return "<div class='task"+(t.done?" done":"")+"' data-id='"+esc(t.id)+"'>"+(arch?"":"<input type='checkbox' class='taskchk' title='mark done (auto-archives on sync)'"+(t.done?" checked":"")+">")+"<span class='t'>"+esc(t.text)+"</span>"+(t.repo?"<span class='rp'>"+esc(t.repo)+"</span>":"")+askBtn(t)+(arch?"<button class='rm restore' title='restore to active'>&#8630;</button>":"<button class='rm' title='remove'>&times;</button>")+"</div>";}
function wireTaskRows(el){el.querySelectorAll('.task').forEach(function(row){var id=row.getAttribute('data-id');
var cb=row.querySelector('.taskchk');if(cb)cb.addEventListener('change',function(){api('/api/tasks/toggle',{id:id}).then(function(){row.classList.toggle('done');});});
wireAsk(row,id);
var rm=row.querySelector('.rm');if(rm&&rm.classList.contains('restore'))rm.addEventListener('click',function(){api('/api/tasks/restore',{id:id}).then(loadArchived);});
else if(rm)rm.addEventListener('click',function(){api('/api/tasks/remove',{id:id}).then(function(){var nx=row.nextElementSibling;if(nx&&nx.classList.contains('tchat'))nx.remove();row.remove();});});});}
// Per-task Q&A: the button opens a thread under the row; answers come from the
// connected model, grounded in the task's repo (and its pending changes).
function askBtn(t){var n=(t.chat||[]).length;return "<button class='ask"+(n?" has":"")+"' title='"+(n?"questions &amp; answers about this task":"ask a question about this task")+"'>&#128172;"+(n?" "+Math.ceil(n/2):"")+"</button>";}
function taskById(id){var all=PENDTASKS.concat(ALLTASKS);for(var i=0;i<all.length;i++)if(all[i].id===id)return all[i];return null;}
function chatMsgs(chat){return (chat||[]).map(function(m){return "<div class='msg "+(m.role==='user'?'q':'a')+"'>"+esc(m.text)+"</div>";}).join("");}
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
t.chat=r.chat||[];msgs.innerHTML=chatMsgs(t.chat);btn.className='ask on has';btn.innerHTML="&#128172; "+Math.ceil(t.chat.length/2);}).catch(function(e){send.disabled=false;var th=msgs.querySelector('.thinking');if(th)th.remove();msgs.insertAdjacentHTML('beforeend',"<div class='msg a err'>"+esc(String((e&&e.message)||e))+"</div>");});}
send.addEventListener('click',ask);inp.addEventListener('keydown',function(e){if(e.key==='Enter')ask();});
box.querySelector('.askclear').addEventListener('click',function(){api('/api/tasks/chat/clear',{id:id}).then(function(){t.chat=[];msgs.innerHTML=CHATHINT;btn.className='ask on';btn.innerHTML='&#128172;';});});
inp.focus();}
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
function loadPending(){api('/api/pending').then(function(list){var el=document.getElementById('reviewlist');PENDTASKS=[];if(!list||!list.length){el.innerHTML='';return;}
var n=0;list.forEach(function(r){n+=r.tasks.length;});
var h="<div class='tgroup' style='color:var(--amber)'>Awaiting your review <span class='tcount'>"+n+"</span></div>";
list.forEach(function(r){var ch=r.files.length?(r.files.length+" file"+(r.files.length>1?"s":"")+" changed"+(r.stat?" &middot; "+esc(r.stat):"")):"no uncommitted changes";
h+="<div class='rcard' data-repo='"+esc(r.repo)+"'><div class='rhead'><b>"+esc(r.repo)+"</b><span class='muted'>"+(r.path?"on "+esc(r.branch||'?')+" &middot; "+ch:"repo not found on disk")+"</span></div>";
r.tasks.forEach(function(t){PENDTASKS.push(t);h+="<div class='task' data-id='"+esc(t.id)+"'><span class='t'>"+esc(t.text)+"</span>"+askBtn(t)+"<button class='rm sendback' title='not right - send back to the agent (unticks it)'>&#8630;</button></div>";});
h+="<div class='row'><button class='act approve'"+(r.path?"":" disabled")+" title='commit on a branch, push, open a PR, then archive'>Approve &rarr; "+(r.files.length?"PR":"archive")+"</button>"+(r.files.length?"<button class='ghost showdiff'>Show diff</button>":"")+"<label title='Queue GitHub auto-merge so this PR lands once its CI checks pass. Needs Allow auto-merge on the repo.' style='margin-left:auto;font-size:12px;color:var(--faint);display:flex;align-items:center;gap:6px'><input type='checkbox' class='amtoggle' style='width:auto'"+(r.autoMerge?" checked":"")+"> auto-merge on green CI</label></div><div class='rdiff hidden'></div></div>";});
el.innerHTML=h;
el.querySelectorAll('.rcard').forEach(function(card){var repo=card.getAttribute('data-repo');
card.querySelectorAll('.task').forEach(function(row){wireAsk(row,row.getAttribute('data-id'));});
card.querySelectorAll('.sendback').forEach(function(b){b.addEventListener('click',function(){api('/api/pending/sendback',{id:b.closest('.task').getAttribute('data-id')}).then(loadTasks);});});
var amt=card.querySelector('.amtoggle');if(amt)amt.addEventListener('change',function(){api('/api/automerge',{repo:repo,on:amt.checked});});
var sd=card.querySelector('.showdiff'),pre=card.querySelector('.rdiff');
if(sd)sd.addEventListener('click',function(){if(!pre.classList.contains('hidden')){pre.classList.add('hidden');sd.textContent='Show diff';return;}
pre.textContent='Loading...';pre.classList.remove('hidden');sd.textContent='Hide diff';api('/api/pending/diff?repo='+encodeURIComponent(repo)).then(function(d){pre.textContent=(d&&d.diff)||'(no changes)';});});
var ap=card.querySelector('.approve');if(ap)ap.addEventListener('click',function(){ap.disabled=true;ap.textContent='Committing & pushing...';
api('/api/pending/approve',{repo:repo}).then(function(r){var o=document.getElementById('reviewout');
if(!r||r.error){ap.disabled=false;ap.textContent='Approve - retry';o.innerHTML="<div class='note err'>"+esc(repo)+": "+esc((r&&r.error)||'failed')+"</div>";return;}
var m="&#10003; <b>"+esc(repo)+"</b>: approved "+r.approved+" task"+(r.approved>1?"s":"");
if(r.commit)m+=" &middot; committed <code>"+esc(r.commit)+"</code> on <code>"+esc(r.branch)+"</code>";
if(r.pr)m+=" &middot; <a href='"+esc(r.pr)+"' target='_blank' rel='noopener'>open PR</a>";
if(r.autoMerge==='queued')m+=" &middot; will auto-merge when CI passes";
else if(r.autoMerge==='unavailable')m+="<div class='muted'>auto-merge not enabled for this repo on GitHub (Settings &rarr; General &rarr; Allow auto-merge)"+(r.autoMergeErr?": "+esc(r.autoMergeErr):"")+"</div>";
if(r.note)m+="<div class='muted'>"+esc(r.note)+"</div>";
o.innerHTML="<div class='note ok'>"+m+"</div>";loadTasks();});});});});}
function loadArchived(){TARCH=true;api('/api/tasks?archived=1').then(function(list){ALLTASKS=list;renderFilter();var el=document.getElementById('tasklist');
if(!list.length){el.innerHTML="<div class='muted' style='margin-top:12px'>Nothing archived yet. Completed tasks land here.</div>";return;}
var h="<div class='tgroup'>Archived <span class='tcount'>"+list.length+"</span></div>";list.forEach(function(t){h+=taskRow(t,true);});el.innerHTML=h;wireTaskRows(el);});}
function fillTaskRepos(){var sel=document.getElementById('newtaskrepo');if(!sel||!GRAPH)return;var cur=sel.value;var names=GRAPH.nodes.filter(function(n){return n.type==='repo'||n.type==='folder';}).map(function(n){return n.label;}).sort();sel.innerHTML="<option value=''>repo…</option>"+names.map(function(n){return "<option value='"+esc(n)+"'"+(n===cur?" selected":"")+">"+esc(n)+"</option>";}).join("");}
function addTaskUI(){var i=document.getElementById('newtask');var v=(i.value||'').trim();if(!v)return;var repo=(document.getElementById('newtaskrepo')||{}).value||'';api('/api/tasks/add',{text:v,repo:repo}).then(function(){i.value='';TFILTER={type:'',repo:''};loadTasks();});}
function pushTasksUI(){var o=document.getElementById('pushout');var btn=document.getElementById('pushtasks');btn.disabled=true;
o.innerHTML="<div class='muted' style='margin-top:10px'><span class='dot-c' style='background:var(--amber)'></span> Writing .symbiot/TASKS.md into your repos&hellip;</div>";
api('/api/tasks/push',{type:TFILTER.type||'',repo:TFILTER.repo||''}).then(function(r){btn.disabled=false;
if(r.empty){o.innerHTML="<div class='muted' style='margin-top:10px'>No open tasks to send. Tick ideas in a repo review, or add tasks above.</div>";return;}
var n=(r.written||[]).length;var h="<div class='drift' style='margin-top:10px'><div class='dh'><span class='dot-c'></span><span class='dn'>Done &mdash; wrote "+n+" file"+(n===1?"":"s")+"</span></div>";
if(n){h+="<ul>";r.written.forEach(function(w){h+="<li class='info'>&#10003; <b>"+esc(w.name)+"</b> <span class='ev'>"+esc(w.file)+" ("+w.count+" task"+(w.count===1?"":"s")+")</span></li>";});h+="</ul>";}
if(r.unresolved&&r.unresolved.length){var names=r.unresolved.map(function(u){return u.name;}).join(", ");var hasNoRepo=r.unresolved.some(function(u){return u.name==='(no repo)';});h+="<div class='dd' style='margin-top:6px'>&#9888; not sent: "+esc(names)+". "+(hasNoRepo?"Pick a repo in the dropdown next to <b>Add</b> so the task has somewhere to go.":"That repo isn't in the map &mdash; add its folder in Settings.")+"</div>";}
if(r.handoff&&r.written&&r.written.length){r.written.forEach(function(w){api('/api/open',{path:w.path});});h+="<div class='dd' style='margin-top:8px'>&#129302; Handed "+n+" repo(s) to your agent &mdash; opening the <b>Agents</b> tab to watch it work&hellip;</div>";setTimeout(function(){setTab('agents');},500);}
else{h+="<div class='dd' style='margin-top:8px'>Set an <b>agent command</b> in Settings to auto-run it on send (and watch it in the Agents tab). For now, tell your agent: <b>“Read .symbiot/TASKS.md and implement the unchecked items.”</b></div>";}
h+="</div>";
o.innerHTML=h;}).catch(function(e){btn.disabled=false;o.innerHTML="<div class='err' style='margin-top:10px'>Couldn&#39;t write tasks: "+esc(String((e&&e.message)||e))+"</div>";});}
document.getElementById('addtask').addEventListener('click',addTaskUI);
document.getElementById('pushtasks').addEventListener('click',pushTasksUI);
document.getElementById('newtask').addEventListener('keydown',function(e){if(e.key==='Enter')addTaskUI();});
`;
