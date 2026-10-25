// symbiot — agents and their questions: the Questions page, what runs left you, an agent's work live.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// Questions, options and ideas an agent left in .symbiot/QUESTIONS.md (any
// agent: it's a file). Answers go to .symbiot/ANSWERS.md; "Send & continue"
// re-runs the agent so it picks them up. Text stays out of attributes (esc()
// doesn't escape quotes) — rows carry indexes into AGENTLIST instead.
var AGENTLIST=[],QDRAFT={};
function agentById(id){for(var i=0;i<AGENTLIST.length;i++)if(AGENTLIST[i].id===id)return AGENTLIST[i];return null;}
function nQs(a){return (a.ask&&a.ask.questions)?a.ask.questions.length:0;}
// A question that needs a release shows it next to the installed and npm versions;
// until it's out and installed, an answer saying it's done or tried isn't offered.
var DONEOPT=/^(done|did (it|both|that)|i('ve| have)? (did|done|tried)|tried it|it (worked|works|clicked|looks|landed|opened)|looks right)([^a-z]|$)/i;
function relHtml(rl){return "<div class='qrel"+(rl.waiting?" wait":"")+"'>Needs "+esc(rl.name+" "+rl.needs)+" &middot; installed: "+esc(rl.installed||'none')+" &middot; on npm: "+esc(rl.npm||'unknown')+
(rl.waiting==='npm'?" &middot; not published yet, so this can't be done yet":rl.waiting==='install'?" &middot; "+(rl.name==='symbiot'?"update Symbiot first":"install it first"):"")+"</div>";}
function askHtml(a){var k=a.ask;if(!k)return '';var qs=k.questions||[],ss=k.suggestions||[],aw=k.away||[];if(!qs.length&&!ss.length&&!aw.length)return '';
var h="<div class='aq' data-id='"+esc(a.id)+"'>";
if(qs.length){h+="<h4><i class=ic-ask></i> "+qs.length+" question"+(qs.length>1?"s":"")+" for you</h4>";
qs.forEach(function(q,i){var rl=q.release;h+="<div class='q' data-i='"+i+"'>"+(q.task?"<div class='qfor' title='"+escQ(q.task)+"'>for: "+esc(q.task)+"</div>":"")+"<div class='qt'>"+esc(q.shown||q.q)+"</div>"+(q.context?"<div class='qc'>"+codeText(q.context)+"</div>":"")+(rl?relHtml(rl):"");
(q.options||[]).forEach(function(o,j){var off=rl&&rl.waiting&&DONEOPT.test(o);h+="<label class='opt"+(off?" off":"")+"'><input type='radio' name='q_"+esc(a.id)+"_"+i+"' value='"+j+"'"+(off?" disabled":"")+"><span>"+whoHtml((q.labels&&q.labels[j])||o)+(off?" <i>(once "+esc(rl.name+" "+rl.needs)+" is installed)</i>":"")+"</span></label>";});
h+="<input class='qother' placeholder='"+((q.options&&q.options.length)?"or answer in your own words":"your answer")+"'></div>";});
h+="<div class='row'><button class='act qsend' title='save the answers and hand the repo back to your agent'>Send answers &amp; continue</button><button class='ghost qsave' title='save the answers for the next run'>Save only</button></div>";}
if(ss.length){var shown=IDEASOPEN[a.path]?ss.length:(k.ideasShown||ss.length),nf=ss.filter(function(s){return s.from;}).length;h+="<h4><i class=ic-idea></i> "+(!nf?"Ideas from the agent":nf===ss.length?"Ideas for "+esc(a.name)+" from other agents":"Ideas for "+esc(a.name))+"</h4>";ss.forEach(function(s,i){if(i>=shown)return;h+=ideaHtml(s,i,'');});
if(ss.length>shown)h+="<div class='row'><button class='ghost qmore' title='the agent ranks its ideas best first: weigh these two before adding more'>"+(ss.length-shown)+" more idea"+(ss.length-shown>1?"s":"")+", ranked lower</button></div>";}
// ideas it had for another lane are on that lane's card (agents.mjs routeIdeas): here, one line saying where they went
if(aw.length)h+="<details class='ideasent'><summary title='they show on that project&#39;s card, where + task adds them to its tasks'><i class=ic-idea></i> "+(k.sent||[]).map(function(x){return x.n+" idea"+(x.n>1?"s":"")+" sent to "+esc(x.repo);}).join(", ")+"</summary>"+aw.map(function(s,i){return ideaHtml(s,i,'1');}).join('')+"</details>";
return h+"</div>";}
function ideaHtml(s,i,w){var dw=w?" data-w='1'":"";return "<div class='idea'><span style='flex:1'>"+esc(s.text)+(s.from?" <span class='tag' title='the "+escQ(s.from)+" agent had this idea for this project'>from "+esc(s.from)+"</span>":s.other?" <span class='tag' title='this idea is for another project, so + task adds it to that one'>for "+esc(s.repo)+"</span>":"")+"</span>"+(s.added?"<span class='tag'>in Tasks</span>":"<button class='ghost qidea' data-i='"+i+"'"+dw+" style='padding:3px 9px;font-size:12px'>+ task</button><button class='ghost qskip' data-i='"+i+"'"+dw+" title='turn this idea down: the next one moves up, and the agent is told not to suggest it again' style='padding:3px 9px;font-size:12px'>Skip</button>")+"</div>";}
function ideaOf(a,btn){return (btn.getAttribute('data-w')?a.ask.away||[]:a.ask.suggestions||[])[+btn.getAttribute('data-i')];}
var IDEASOPEN={};
function qKeyOf(qe){var box=qe.closest('.aq');var a=box&&agentById(box.getAttribute('data-id'));var q=a&&a.ask.questions[+qe.getAttribute('data-i')];return q?a.path+'|'+q.q:'';}
// the typed answer is kept in localStorage too (bdSet, the same key as its blob on Home): a reload or a restart keeps it
if(document.addEventListener)document.addEventListener('input',function(ev){var t=ev.target;if(!t||!t.classList||!t.classList.contains('qother')||!t.closest)return;var qe=t.closest('.aq .q'),k=qe&&qKeyOf(qe);if(k)bdSet(k,t.value,null,null,'desk');});
function saveDrafts(el){el.querySelectorAll('.aq .q').forEach(function(qe){var k=qKeyOf(qe);if(!k)return;var pick=qe.querySelector('input[type=radio]:checked'),t=qe.querySelector('.qother').value;QDRAFT[k]={o:pick?pick.value:'',t:t};if(t||bdAll()[k])bdSet(k,t,null,null,'desk');});}
function restoreDrafts(el){el.querySelectorAll('.aq .q').forEach(function(qe){var k=qKeyOf(qe),d=QDRAFT[k];if(!d&&k){var b=bdAll()[k];if(b&&b.text)d={o:'',t:b.text};}if(!d)return;qe.querySelectorAll('input[type=radio]').forEach(function(r){r.checked=!r.disabled&&r.value===d.o;});qe.querySelector('.qother').value=d.t||'';});}
function collectAnswers(box,a){var out=[];box.querySelectorAll('.q').forEach(function(qe){var q=a.ask.questions[+qe.getAttribute('data-i')];if(!q)return;
var other=(qe.querySelector('.qother').value||'').trim();var pick=qe.querySelector('input[type=radio]:checked');var ans=other||(pick?q.options[+pick.value]:'');if(ans)out.push({q:q.q,a:ans});});return out;}
function wireAsks(el){el.querySelectorAll('.aq').forEach(function(box){var a=agentById(box.getAttribute('data-id'));if(!a||!a.ask)return;
function send(rerun){var msg=document.getElementById(box.closest('#panel-asks')?'asksmsg':'agentsmsg');var ans=collectAnswers(box,a);
if(!ans.length){msg.innerHTML="<div class='note err'>Pick an option or type an answer first.</div>";return;}
box.querySelectorAll('button').forEach(function(b){b.disabled=true;});
api('/api/agents/answer',{path:a.path,answers:ans,rerun:rerun}).then(function(r){
if(!r||r.error){box.querySelectorAll('button').forEach(function(b){b.disabled=false;});msg.innerHTML="<div class='note err'>"+esc((r&&r.error)||'failed')+"</div>";return;}
ans.forEach(function(x){var k=a.path+'|'+x.q;delete QDRAFT[k];bdSet(k,'');}); // sent: its drafts go
if(r.talk){box.querySelectorAll('button').forEach(function(b){b.disabled=false;});box.querySelectorAll('input.qother').forEach(function(i){i.value='';});msg.innerHTML="<div class='lqblob'>"+blobTalk(r.talk,a.name)+"</div><div class='muted'>The question stays open: answer it when you're ready.</div>";return;}
msg.innerHTML="<div class='note ok'>&#10003; Saved "+r.saved+" answer"+(r.saved>1?"s":"")+" for <b>"+esc(a.name)+"</b> in .symbiot/ANSWERS.md"+(r.rerun?" &middot; your agent is picking them up now.":".")+(r.yours&&r.yours.length?"<div class='err'><i class=ic-person></i> Still yours to do: "+esc(r.yours.join(' '))+"</div>":"")+(r.note?"<div class='muted'>"+esc(r.note)+"</div>":"")+"</div>";loadAgents();if(current==='asks')loadAsks();});}
var s1=box.querySelector('.qsend'),s2=box.querySelector('.qsave');
if(s1)s1.addEventListener('click',function(){send(true);});if(s2)s2.addEventListener('click',function(){send(false);});
var more=box.querySelector('.qmore');if(more)more.addEventListener('click',function(){IDEASOPEN[a.path]=true;loadAgents();});
box.querySelectorAll('.qidea').forEach(function(btn){btn.addEventListener('click',function(){var s=ideaOf(a,btn);if(!s)return;btn.disabled=true;
var sk=btn.parentNode.querySelector('.qskip');if(sk)sk.remove();
api('/api/tasks/add',{text:s.text,repo:s.repo||a.lane||a.name}).then(function(){s.added=true;btn.outerHTML="<span class='tag'>in Tasks</span>";});});});
box.querySelectorAll('.qskip').forEach(function(btn){btn.addEventListener('click',function(){var s=ideaOf(a,btn);if(!s)return;btn.disabled=true;
api('/api/agents/skip',{path:s.path||a.path,text:s.text}).then(function(r){if(!r||r.error){btn.disabled=false;document.getElementById('agentsmsg').innerHTML="<div class='note err'>"+esc((r&&r.error)||'failed')+"</div>";return;}loadAgents();});});});});}
// A step of yours an answer picked (👤 You): the next run waits for it (agents.mjs waitingFor)
function waitHtml(a){var w=a.waiting;if(!w)return '';var fs=(w.files||[]).map(function(f){return "<code>"+esc(f)+"</code>";}).join(" or ");if(w.cmd)fs=(fs?fs+" or ":"")+"the agent command in Settings &rarr; Handoff";
return "<div class='aq'><h4><i class=ic-pause></i> Waiting on your step</h4><div class='qt'><i class=ic-person></i> "+esc(w.step)+"</div><div class='qc'>"+(fs?"Your agent "+(w.rerun?"starts by itself":"can start")+" once "+fs+" changes"+(w.rerun?", while Symbiot runs":"")+". Done it some other way?":"Your agent waits for it, so it doesn't stop on the same questions again.")+" Start it now once it's done.</div><div class='row'><button class='act wstart' data-id='"+esc(a.id)+"'>Start it now</button></div></div>";}
// A run that ended waiting on you (agents.mjs needsOf): your OK for what it would send or
// change, or a step only you can do, with what to check first. Answered as on Home.
function needsHtml(a){var n=a.needs;if(!n||n.waiting)return '';var ok=n.kind==='approve';
return "<div class='aq'><h4><i class=ic-person></i> "+(ok?"Waits for your OK":"Needs you")+"</h4><div class='qt'>"+esc(n.what)+"</div>"+(n.check?"<div class='qc'><b>Check first:</b> "+esc(n.check)+"</div>":"")
+(n.report&&n.report.id?"<div class='row'><button class='ghost nrep' data-rep='"+escQ(n.report.id)+"' title='opens it on Reports'>Read the report: "+esc(n.report.title)+" &rsaquo;</button></div>":"")
+"<div class='row'><button class='act ngo' data-id='"+esc(a.id)+"' title='"+(ok?"its agent goes ahead with it":"its agent checks it worked and carries on")+"'>"+(ok?"Go ahead":"I've done this")+"</button><button class='ghost nskip' data-id='"+esc(a.id)+"' title='it stops asking'>Skip</button></div></div>";}
function wireNeeds(el){el.querySelectorAll('.nrep').forEach(function(b){b.addEventListener('click',function(){showReport(b.getAttribute('data-rep'));});});el.querySelectorAll('.ngo,.nskip').forEach(function(btn){btn.addEventListener('click',function(){var a=agentById(btn.getAttribute('data-id'));if(!a)return;btn.disabled=true;var msg=document.getElementById('agentsmsg');
api('/api/home/answer',{id:'needs:'+a.id,pick:btn.classList.contains('ngo')?0:1}).then(function(r){msg.innerHTML=r&&!r.error?"<div class='note ok'>"+esc(a.name)+": "+esc(r.said||'Done.')+"</div>":"<div class='note err'>"+esc((r&&r.error)||'failed')+"</div>";loadAgents();}).catch(function(e){btn.disabled=false;msg.innerHTML="<div class='note err'>"+esc(String((e&&e.message)||e))+"</div>";});});});}
function wireWaits(el){el.querySelectorAll('.wstart').forEach(function(btn){btn.addEventListener('click',function(){var a=agentById(btn.getAttribute('data-id'));if(!a)return;btn.disabled=true;
api('/api/open',{path:a.path,force:true}).then(function(x){var msg=document.getElementById('agentsmsg');msg.innerHTML=x&&x.opened?"<div class='note ok'>&#10003; Started your agent in <b>"+esc(a.name)+"</b>.</div>":"<div class='note err'>"+esc(a.name)+": "+(x&&x.busy?"an agent is already running there.":x&&x.note?esc(x.note):"it didn&#39;t start. Check the command in Settings.")+"</div>";loadAgents();}).catch(function(e){btn.disabled=false;document.getElementById('agentsmsg').innerHTML="<div class='note err'>"+esc(String((e&&e.message)||e))+"</div>";});});});}
// What a run left for Symbiot's memory (.symbiot/REMEMBER.json, handback.mjs): nothing goes in until Remember
function factsHtml(a){var fs=a.remember;if(!fs||!fs.length)return '';
return "<div class='aq rfacts' data-id='"+esc(a.id)+"'><h4>&#129504; For Symbiot to remember</h4><div class='qc'>This run found "+fs.length+" lasting fact"+(fs.length>1?"s":"")+". Untick any you don&#39;t want, then Remember: every chat can use them from then on.</div>"+
fs.map(function(f,i){return "<label class='opt'><input type='checkbox' class='rfact' value='"+i+"' checked><span><b>"+esc(f.name)+"</b> <span class='muted'>("+esc(f.kind)+")</span>: "+esc(f.fact)+"</span></label>";}).join('')+
"<div class='row'><button class='act rkeep' title='put the ticked facts into what Symbiot remembers'>Remember</button><button class='ghost rskip' title='nothing goes into memory, and this run&#39;s facts aren&#39;t asked about again'>Skip</button></div></div>";}
function wireFacts(el){el.querySelectorAll('.rfacts').forEach(function(box){var a=agentById(box.getAttribute('data-id'));if(!a)return;
function send(skip){var msg=document.getElementById('agentsmsg');var only=[].slice.call(box.querySelectorAll('.rfact:checked')).map(function(c){return +c.value;});
if(!skip&&!only.length){msg.innerHTML="<div class='note err'>Tick at least one, or Skip.</div>";return;}
box.querySelectorAll('button').forEach(function(b){b.disabled=true;});
api('/api/agents/remember',skip?{path:a.path,skip:true}:{path:a.path,only:only}).then(function(r){
if(!r||r.error){box.querySelectorAll('button').forEach(function(b){b.disabled=false;});msg.innerHTML="<div class='note err'>"+esc((r&&r.error)||'failed')+"</div>";return;}
msg.innerHTML=skip?"<div class='note ok'>Skipped what <b>"+esc(a.name)+"</b> found: nothing went into memory.</div>":"<div class='note ok'>&#10003; Remembered "+r.remembered+" new fact"+(r.remembered===1?"":"s")+" from <b>"+esc(r.title||a.name)+"</b>"+(r.remembered<r.of?" (the rest were known already)":"")+".</div>";loadAgents();});}
var k=box.querySelector('.rkeep'),s=box.querySelector('.rskip');if(k)k.addEventListener('click',function(){send(false);});if(s)s.addEventListener('click',function(){send(true);});});}
// What this run handed to another lane (lanes.mjs handingOf): whether that lane has it yet, and if not, why; once it has, how far its run has got
// How far the run on a handover has got: its tasks ticked, and what it's doing now
function handProg(x){var b=[];if(x.progress)b.push(x.progress.done+' of '+x.progress.total+' ticked');if(x.doing)b.push(x.doing);return b.join(' \u00b7 ');}
function handHtml(a){var hs=a.handing;if(!hs||!hs.length)return '';
return "<div class='aq hand'><h4>Handed over</h4>"+hs.map(function(x){var pg=handProg(x);return "<div class='qc'><b>"+esc(x.lane)+"</b>: "+esc(x.text)+"<br><span"+(x.gone?" class='muted'":" style='color:var(--amber)'")+">"+esc(x.why)+"</span>"+(pg?"<br><span class='muted'>"+esc(pg)+"</span>":"")+"</div>";}).join('')+"</div>";}
function answering(){var f=document.activeElement;return !!(f&&f.closest&&f.closest('.aq'));}
// Handovers (lanes.mjs): what one lane's agent handed to another, and where it stands.
var LANEWORD={started:'working on it',held:'queued: that lane is busy',blocked:"didn't start",done:'done, reported back',error:"couldn't hand over"};
function loadLanes(){api('/api/lanes').then(function(d){var el=document.getElementById('laneslist');if(!el||!d)return;var hs=d.handoffs||[];
var row=function(h){
var back=h.result||h.error||(h.note?"It didn't start: "+h.note:''),more=(h.full?"<div>"+esc(h.full)+"</div>":"")+(back?"<div class='tres'>"+esc(back)+"</div>":"");
return "<div class='task'><span class='t'><b>"+esc(h.from)+"</b> &rarr; <b>"+esc(h.to)+"</b>: "+esc(String(h.text||'').split('**').join(''))+(h.n>1?" <span class='muted'>&times;"+h.n+"</span>":"")+(more?"<details class='tfull'><summary>"+(h.full?"in full":"what came back")+"</summary>"+more+"</details>":"")+"</span><span class='rp'"+(h.status==='error'||h.status==='blocked'?" style='color:var(--amber)'":"")+">"+esc(LANEWORD[h.status]||h.status)+"</span></div>";};
var seen={},uniq=[];hs.forEach(function(h){var k=h.from+'|'+h.to+'|'+h.status+'|'+h.text;if(seen[k]){seen[k].n++;return;}var c={};for(var x in h)c[x]=h[x];c.n=1;seen[k]=c;uniq.push(c);});
var live=uniq.filter(function(h){return h.status!=='done';}),fin=uniq.filter(function(h){return h.status==='done';});
whenFree(el,'lanes',function(){sameHtml(el,(live.length?"<div class='tgroup agg'>Handovers under way <span class='tcount'>"+live.length+"</span></div>"+live.slice(0,12).map(row).join(''):'')+(fin.length?"<details class='agdone'><summary class='tgroup agg'>Finished handovers <span class='tcount'>"+fin.length+"</span></summary>"+fin.slice(0,20).map(row).join('')+"</details>":''));});});}

// ---- an agent's work, live (work.mjs parses its stream) ------------------------------
var WKICON={read:"<path d='M2 4h5l1 1h6v8H2z'/>",edit:"<path d='M3 13l1-3 7-7 2 2-7 7z'/>",run:"<path d='M3 5l3 3-3 3M8 12h5'/>",search:"<circle cx='7' cy='7' r='4'/><path d='M10 10l3 3'/>",web:"<circle cx='8' cy='8' r='5.5'/><path d='M2.5 8h11M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11'/>",agent:"<path d='M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z'/>",connector:"<path d='M6 2v4M10 2v4M4 6h8v2a4 4 0 0 1-8 0zM8 12v2'/>",tool:"<circle cx='8' cy='8' r='2.5'/>"};
function wkIcon(k){return "<svg width='14' height='14' viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>"+(WKICON[k]||WKICON.tool)+"</svg>";}
function wkMs(ms){if(ms==null)return '';return ms<1000?ms+'ms':ms<60000?(ms/1000).toFixed(ms<10000?1:0)+'s':Math.round(ms/60000)+'m';}
function wkRing(done,total){var r=15,c=2*Math.PI*r,f=total?done/total:0;return "<svg width='40' height='40' viewBox='0 0 40 40' aria-label='"+done+" of "+total+" tasks done'><defs><linearGradient id='wkg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#FFFFFF'/><stop offset='1' stop-color='#6F7887'/></linearGradient></defs><circle cx='20' cy='20' r='"+r+"' fill='none' stroke='rgba(140,150,166,.25)' stroke-width='4'/><circle cx='20' cy='20' r='"+r+"' fill='none' stroke='url(#wkg)' stroke-width='4' stroke-linecap='round' stroke-dasharray='"+(c*f).toFixed(1)+" "+c.toFixed(1)+"' transform='rotate(-90 20 20)'/><text x='20' y='24' text-anchor='middle' font-size='10' font-weight='700' fill='currentColor'>"+done+"/"+total+"</text></svg>";}
function wkSpark(p){if(!p||p.length<2)return '';var m=Math.max.apply(null,p)||1,w=120,h=26,pts=p.map(function(v,i){return (i*w/(p.length-1)).toFixed(1)+','+(h-2-(v/m)*(h-4)).toFixed(1);}).join(' ');return "<svg width='"+w+"' height='"+h+"' viewBox='0 0 "+w+" "+h+"' aria-label='steps per minute'><polyline points='"+pts+"' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linejoin='round' opacity='.85'/></svg>";}
function workHtml(a){var w=a.work,pg=a.progress,run=a.status==='running',h='';
if(!w){if(run)h+="<div class='bar'><i></i></div>";if(pg)h+="<div class='wkstats'><span class='wkstat'><b>"+pg.done+"/"+pg.total+"</b> tasks ticked</span></div>";return h;}
var stats=[];if(w.model)stats.push("<span class='wkstat'>"+esc(w.model.split('[')[0])+"</span>");stats.push("<span class='wkstat'><b>"+w.count+"</b> step"+(w.count===1?'':'s')+"</span>");
if(w.turns!=null)stats.push("<span class='wkstat'><b>"+w.turns+"</b> turns</span>");if(w.tokens)stats.push("<span class='wkstat'><b>"+(w.tokens>999999?(w.tokens/1e6).toFixed(1)+'M':w.tokens>999?Math.round(w.tokens/1000)+'k':w.tokens)+"</b> tokens</span>");if(w.ctx)stats.push("<span class='wkstat' title='What it rereads with every step: the conversation so far. Past 60k, your next answer starts it fresh with a summary instead.'><b>"+(w.ctx>999?Math.round(w.ctx/1000)+'k':w.ctx)+"</b> context</span>");
if(w.cost!=null)stats.push("<span class='wkstat'><b>$"+w.cost.toFixed(2)+"</b></span>");if(w.tests)stats.push("<span class='wktest"+(w.tests.failed?' bad':'')+"'>"+w.tests.passed+" passed &middot; "+w.tests.failed+" failed</span>");if(w.errors)stats.push("<span class='wktest bad'>"+w.errors+" error"+(w.errors>1?'s':'')+"</span>");
if(run&&w.doing)h+="<div class='wkdoing'>"+esc(w.doing)+"&hellip;</div>";
var first=(w.final||'').split(String.fromCharCode(10))[0];if(!run&&first)h+="<div class='wkfinal'>"+esc(first.length>180?first.slice(0,179)+'\u2026':first)+"</div>";
var boxes=[];
if(w.todos&&w.todos.length||pg){var td="<div class='wkbox'><div class='wkh'>"+(pg?wkRing(pg.done,pg.total):'')+"<span>its to-do list</span></div>";
(w.todos||[]).forEach(function(t){td+="<div class='wktodo "+esc(t.status)+"'><i></i><span>"+esc(t.status==='in_progress'?t.active:t.text)+"</span></div>";});
if(!(w.todos||[]).length)td+="<div class='muted' style='font-size:12px'>"+pg.done+" of "+pg.total+" task"+(pg.total===1?"":"s")+" done.</div>";boxes.push(td+"</div>");}
if(w.steps&&w.steps.length){var sp="<div class='wkbox'><div class='wkh'><span>what it did</span><span style='margin-left:auto'>"+wkSpark(w.pace)+"</span></div>";
w.steps.slice(-10).forEach(function(x){sp+="<div class='wkstep "+esc(x.status)+"'>"+wkIcon(x.kind)+"<span class='wt'><b>"+esc(x.verb)+"</b> "+esc(x.target||'')+"</span>"+(x.tests?"<span class='wktest"+(x.tests.failed?' bad':'')+"'>"+x.tests.passed+"&#10003; "+x.tests.failed+"&#10007;</span>":"")+"<span class='wm'>"+(x.status==='running'?'&hellip;':wkMs(x.ms))+"</span></div>";});
if(w.count>10)sp+="<div class='muted' style='font-size:11px;margin-top:4px'>and "+(w.count-10)+" earlier step"+(w.count-10>1?'s':'')+"</div>";boxes.push(sp+"</div>");}
var fs=Object.keys(w.files||{});if(fs.length){var mx=Math.max.apply(null,fs.map(function(f){return w.files[f];}))||1,fb="<div class='wkbox'><div class='wkh'><span>files it changed</span></div>";
fs.sort(function(x,y){return w.files[y]-w.files[x];}).slice(0,8).forEach(function(f){fb+="<div class='wkfile'><span class='fn'>"+esc(f)+"</span><span class='fb'><i style='width:"+Math.round(100*w.files[f]/mx)+"%'></i></span><span class='wm'>"+w.files[f]+"&times;</span></div>";});boxes.push(fb+"</div>");}
var todoBox=boxes.length&&(w.todos&&w.todos.length||pg)?boxes.shift():'';
if(todoBox)h+="<div class='wk'>"+todoBox+"</div>";
h+="<details class='wkraw'><summary>details: steps, files, cost</summary><div class='wkstats'>"+stats.join('')+"</div>"+(boxes.length?"<div class='wk'>"+boxes.join('')+"</div>":"")+(!run&&w.final?"<div class='wkfinal'>"+esc(w.final)+"</div>":"")+"</details>";
return h;}
// The Questions page (next to Reports): every agent's open questions and suggestions, the same cards as on
// the Workdesk, answered the same way. Not redrawn under someone typing an answer.
// Home's own cards come too (a run's OK or step, read from the job record): the page said "Nothing to answer right
// now" while Home, Workdesk and Map showed 2 or 3 waiting (critic, 25 Oct 2026).
function loadAsks(){Promise.all([api('/api/agents'),api('/api/home').catch(function(){return null;})]).then(function(r){var list=r[0],home=r[1]||{},el=$('askslist');if(!el||!list)return;if(answering()||selIn(el))return;saveDrafts(el);AGENTLIST=list;
var xs=list.filter(function(a){return a.ask&&((a.ask.questions||[]).length||(a.ask.suggestions||[]).length||(a.ask.away||[]).length);}),asked={};
xs.forEach(function(a){if((a.ask.questions||[]).length)asked[a.path]=1;});
var cards=(home.you||[]).filter(function(y){return y.kind==='ask'&&!(y.path&&asked[y.path]);});
el.innerHTML=xs.length||cards.length?cards.map(function(y,i){return "<div class='tgroup agg'>"+esc(y.name||lqProjName(y.repo)||'Symbiot')+"</div><div class='lqblob askcard' data-c='"+i+"'>"+blobBody(y,false)+"</div>";}).join('')+xs.map(function(a){return "<div class='tgroup agg'>"+esc(rlLane(a.name))+"</div>"+askHtml(a);}).join(''):"<div class='muted' style='margin-top:12px'>Nothing to answer right now. When an agent has a question or an idea for you, it shows here.</div>";
el.querySelectorAll('.askcard').forEach(function(box){wireBlob(box,cards[+box.getAttribute('data-c')],{done:loadAsks});});
wireAsks(el);restoreDrafts(el);});}
function loadAgents(){loadLanes();loadParked(agentsDraw);phoneApprovedNote();}
// What was approved from your phone today (phone.mjs), above the agents: it wasn't you at this desk.
function phoneApprovedNote(){var el=$('phoneappr');if(!el)return;var ap=(LQ.home&&LQ.home.phoneApproved)||[];
el.innerHTML=ap.map(function(a){return "<div class='note "+(a.status==='failed'?'err':'ok')+"'>"+(a.status==='waiting'?"Approving <b>"+esc(a.repo)+"</b> from "+esc(a.phone)+" as soon as "+esc(a.why||'it can')+".":a.status==='failed'?"Approving <b>"+esc(a.repo)+"</b> from "+esc(a.phone)+" failed: "+esc(a.error||''):(a.status==='approving'?"Approving ":"&#10003; Approved ")+"<b>"+esc(a.repo)+"</b> from "+esc(a.phone)+", "+agoTxt(a.at)+(a.pr?" &middot; <a href='"+esc(okUrl(a.pr))+"' target='_blank' rel='noopener'>its PR</a>":""))+"</div>";}).join('');}
// Agents, in order: what needs you (a question, a step of yours), what's at work, and
// what's finished, folded away (open stays open across refreshes). A run whose handover
// hasn't gone to its lane yet stays out with what's at work, not folded away.
var AGDONEOPEN=false;
// ended cleanly with its task list not all ticked, nothing asked of you: it checks again on its next turn
function agentPaused(a){return a.status==='done'&&!!a.progress&&a.progress.total>0&&a.progress.done<a.progress.total&&!a.waiting&&!a.needs&&!nQs(a);}
function agentGroups(list,fn){var needs=[],run=[],paused=[],done=[];list.forEach(function(a){if(nQs(a)||a.waiting||a.needs)needs.push(a);else if(a.status==='running'||(a.handing||[]).some(function(x){return !x.gone;}))run.push(a);else if(agentPaused(a))paused.push(a);else done.push(a);});
var g=function(t,xs){return xs.length?"<div class='tgroup agg'>"+t+" <span class='tcount'>"+xs.length+"</span></div>"+xs.map(fn).join(''):'';};
return g('Needs you',needs)+g('At work',run)+g('Paused',paused)+(done.length?"<details class='agdone'"+(AGDONEOPEN?' open':'')+"><summary class='tgroup agg'>Finished <span class='tcount'>"+done.length+"</span></summary>"+done.map(fn).join('')+"</details>":'');}
// Polled every 8 s while a run is going (was 2 s: three requests each, which the server took
// longer than that to answer, so the agent's own calls queued behind the page watching it, 15 Oct 2026)
function agentsDraw(){api('/api/agents').then(function(list){var el=document.getElementById('agentslist');
if(!list||!list.length){AGENTLIST=[];el.innerHTML="<div class='muted' style='margin-top:12px'>No agents yet. In <b>Tasks</b>, tick ideas and hit <b>Send to repos</b> (with an agent command set in Settings) &mdash; you'll watch it work here.</div>";stopAgentsPoll();return;}
var anyRunning=list.some(function(a){return a.status==='running';});
if(answering()||selIn(el)){stopAgentsPoll();if(anyRunning&&current==='tasks')agentsTimer=setTimeout(loadAgents,8000);else selWait('agents',loadAgents);return;} // don't re-render under someone typing an answer, or selecting text to copy
saveDrafts(el);AGENTLIST=list;
var agentBlock=function(a){var pz=agentPaused(a),cls=a.status==='running'?'run':pz?'paused':(a.status==='done'?'ok':'fail');
// One status in plain words on the block, the rest behind "details" (review of 20 Oct 2026, Q5: "done ·
// 60m 0s · turn ended, waiting on something outside it · ran before Symbiot last started · waits for your OK")
var more=[],hw=(a.handing||[]).filter(function(x){return !x.gone;}).length,amber=true;
var st=nQs(a)?'Waiting for your answer':a.needs&&!a.needs.waiting?(a.needs.kind==='approve'?'Waiting for your OK':'Needs you'):a.waiting?'Waiting on your step':hw?(hw>1?hw+' handovers':'A handover')+' not sent yet':a.status!=='running'&&a.progress&&a.progress.waiting?'Not done: '+(a.progress.waiting>1?a.progress.waiting+' items wait, first ':'it waits on ')+esc(String(a.progress.on||'something outside the run').replace(/^.*\\(waits on:?\\s*/i,'').replace(/\\)\\s*$/,'')):a.phase==='stuck'?'May be stuck: '+(a.line&&a.line.looping?'going round in circles':'no move for '+((a.line&&a.line.quiet)||'?')+' min'):(amber=false,a.status==='running'?'Working':pz?'Paused: '+a.progress.done+' of '+a.progress.total+' done, it carries on next turn':a.status==='done'?'Finished':'Stopped');
st=amber?"<span style='color:var(--amber)'>"+st+"</span>":st;
more.push((a.status==='running'?'working for ':'ran for ')+fmtE(a.elapsed));if(a.status!=='running'&&a.exitCode!=null&&a.exitCode!==0)more.push('exit code '+a.exitCode);
if(pz&&a.work&&a.work.restOn)more.push(esc(a.work.restOn));if(a.phase==='waiting')more.push('its turn ended, waiting on something outside it');
if(a.fromHeld)more.push("started on the tasks held for the last run");
if(a.earlier)more.push(a.status==='running'?"started outside this window":"ran before Symbiot last started");
if(a.remember&&a.remember.length)more.push("found "+a.remember.length+" thing"+(a.remember.length>1?"s":"")+" to remember");
if(a.held!=null){var hn=a.held.length,ht=a.held.map(function(t){return "&bull; "+esc(t).replace(/'/g,'&#39;');}).join('&#10;');
ht+=(hn?'&#10;&#10;':'')+(a.status==='running'?"Sent while this agent was running. They wait in .symbiot/TASKS.next.md, replace TASKS.md when it finishes (keeping its ticks), and an agent starts on them then.":"They wait in .symbiot/TASKS.next.md for the agent running in this folder to finish. After that, an agent starts on them the next time the Tasks tab checks this repo, or send again.");
st+=" &middot; <span style='color:var(--amber);cursor:help' title='"+ht+"'><i class=ic-pause></i> "+(hn?hn+" task"+(hn>1?"s":"")+" held":"tasks held")+"</span>";}
// a repo's run can be parked from here in one click: its tasks start no runs until it's unparked
var pk=!/\\/drafts\\/act-[^/]*$/.test(String(a.path||''))&&a.path,parked=pk&&PARKED.paths.indexOf(a.path)>=0;
if(parked)st+=" &middot; <span style='color:var(--amber)'>parked: no new runs</span>";
if(!pk)st=projChip({project:a.project})+st; // an ops run: which project it's for, from the record
var b="<div class='dh'><span class='orb "+cls+"'></span><span class='dn'>"+esc(String(a.name||'').split('**').join('').replace(/^(Agent:\s*)What['’]s needed:\s*/i,'$1'))+"</span><span class='dd'>"+st+"</span>"+(pk?"<button type='button' class='ghost apark' data-on='"+(parked?'0':'1')+"' title='"+(parked?"let its tasks start agent runs again":"stop its tasks starting agent runs, until you unpark it")+"'>"+(parked?'Unpark':'Park')+"</button>":"")+"</div>";
if(more.length)b+="<details class='adet'><summary>details</summary><div class='muted'>"+more.join(' &middot; ')+"</div></details>";
b+=workHtml(a);
var ch=a.changed;
if(ch&&(ch.dirty||ch.stat||(ch.commits&&ch.commits.length))){
  var parts=[];
  if(ch.dirty)parts.push('<b>'+ch.dirty+'</b> file'+(ch.dirty>1?'s':'')+' changed');
  if(ch.stat)parts.push(esc(ch.stat));
  if(parts.length)b+="<div class='changed'>What it did &middot; "+parts.join(' &middot; ')+"</div>";
  if(ch.commits&&ch.commits.length)b+="<div class='commits'>"+ch.commits.map(function(c){return "<div><code>"+esc(c.hash)+"</code> "+esc(c.msg)+"</div>";}).join("")+"</div>";
}else if(a.status==='done'){
  b+="<div class='changed muted'>No files changed.</div>";
}
b+=waitHtml(a)+needsHtml(a)+askHtml(a)+handHtml(a)+factsHtml(a);
b+=a.work?("<details class='wkraw'><summary>what it said, in full</summary><pre class='alogout'>"+esc((a.tail&&a.tail.trim())||'(nothing yet)')+"</pre></details>"):("<pre class='alogout'>"+esc((a.tail&&a.tail.trim())||'(waiting for output…)')+"</pre>");
return "<div class='agent' data-i='"+list.indexOf(a)+"'>"+b+"</div>";};
el.innerHTML=agentGroups(list,agentBlock);var dn=el.querySelector('.agdone');if(dn)dn.addEventListener('toggle',function(){AGDONEOPEN=dn.open;});
el.querySelectorAll('.alogout').forEach(function(p){p.scrollTop=p.scrollHeight;});
restoreDrafts(el);wireAsks(el);wireWaits(el);wireNeeds(el);wireFacts(el);lqLight();
wdJump();
el.querySelectorAll('.apark').forEach(function(btn){btn.addEventListener('click',function(){var g=AGENTLIST[+btn.closest('.agent').getAttribute('data-i')];if(!g)return;btn.disabled=true;lqPark('',btn.getAttribute('data-on')==='1',function(err){btn.disabled=false;$('agentsmsg').innerHTML=err?"<div class='note err'>"+esc(err)+"</div>":'';loadAgents();},g.path);});});
stopAgentsPoll();if(anyRunning&&current==='tasks')agentsTimer=setTimeout(loadAgents,8000);});}
function loadDrift(){var out=document.getElementById('driftout');out.innerHTML="<div class='muted' style='margin-top:12px'>Reading your repos&hellip;</div>";
var ci=document.getElementById('driftci').checked?'1':'0';var ft=document.getElementById('driftfetch').checked?'1':'0';
api('/api/drift?ci='+ci+'&fetch='+ft).then(function(d){driftLoaded=true;var repos=d.repos||[];var risky=repos.filter(function(r){return r.flags.some(function(f){return f.level==='warn';});});
var unsaved=repos.filter(function(r){return r.flags.some(function(f){return f.unsaved;});}).length;
var h="<div class='k' style='margin:10px 0'><b>"+repos.length+"</b> repos &middot; <b>"+risky.length+"</b> at risk"+(unsaved?" &middot; <b>"+unsaved+"</b> with work not saved to git":"")+(d.partial?" &middot; <span class='err'>partial &mdash; the scan hit its time limit</span>":"")+"</div>";
repos.forEach(function(r){if(!r.flags.length)return;var warn=r.flags.some(function(f){return f.level==='warn';});
h+="<div class='drift"+(warn?' risk':'')+"'><div class='dh'><span class='dbead' aria-hidden='true'></span><span class='dn'>"+esc(rlLane(r.name))+"</span><span class='dd'>"+esc(r.def)+(r.fetchAgeDays!=null&&r.fetchAgeDays>3?" &middot; fetch "+r.fetchAgeDays+"d old":"")+"</span></div><ul>";
r.flags.forEach(function(f){h+="<li class='"+esc(f.level)+"'>"+esc(f.text)+(f.evidence?" <span class='ev'>["+esc(f.evidence)+"]</span>":"")+"</li>";});
h+="</ul></div>";});
var clean=repos.filter(function(r){return !r.flags.length;}).map(function(r){return r.name;});
if(clean.length)h+="<div class='muted' style='margin-top:10px'>clean: "+esc(clean.join(", "))+"</div>";
if(!repos.length)h+="<div class='muted' style='overflow-wrap:anywhere'>No repos found under "+esc(d.base||"your home folder")+".</div>"; // a long path wraps rather than widening the panel on a phone
out.innerHTML=h;});}
function pushTasksUI(){var o=document.getElementById('pushout');var btn=document.getElementById('pushtasks');btn.disabled=true;
o.innerHTML="<div class='muted' style='margin-top:10px'><span class='dot-c' style='background:var(--amber)'></span> Writing .symbiot/TASKS.md into your repos&hellip;</div>";
api('/api/tasks/push',{type:TFILTER.type||'',repo:TFILTER.repo||''}).then(function(r){
if(r.empty){btn.disabled=false;o.innerHTML="<div class='muted' style='margin-top:10px'>No open tasks to send. Tell Symbiot what to do in the bar at the bottom, or tick ideas in a repo review.</div>";return;}
var n=(r.written||[]).length;var opens=[];
// one line, its paths on hover: the review cards below it stay in view
var h="<div class='drift pushed'><div class='dh'><span class='dot-c'></span><span class='dn'>Sent to "+n+" repo"+(n===1?"":"s")+"</span><span class='dd'>"+(r.written||[]).map(function(w){return "<span title='"+esc(w.file).replace(/'/g,'&#39;')+"'>&#10003; <b>"+esc(w.name)+"</b> ("+w.count+" task"+(w.count===1?"":"s")+(w.held?", <i class=ic-pause></i> held till its running agent finishes":"")+")</span>";}).join(" &middot; ")+"</span></div>";
if(r.unresolved&&r.unresolved.length){var names=r.unresolved.map(function(u){return u.name;}).join(", ");var hasNoRepo=r.unresolved.some(function(u){return u.name==='(no repo)';});h+="<div class='dd' style='margin-top:6px'><i class=ic-warn></i> not sent: "+esc(names)+". "+(hasNoRepo?"Tell Symbiot in the bar at the bottom which project it&#39;s for, so it has somewhere to go.":"That repo isn't in the map &mdash; add its folder in Settings.")+"</div>";}
if(r.handoff&&r.written&&r.written.length){opens=r.written.map(function(w){return api('/api/open',{path:w.path}).then(function(x){if(x&&x.blocked){var d=document.createElement('div');d.className='dd';d.innerHTML="<i class=ic-pause></i> <b>"+esc(w.name)+"</b>: "+esc(x.note)+" <button class='ghost' style='padding:2px 8px;font-size:12px'>Start it anyway</button>";d.querySelector('button').addEventListener('click',function(){this.disabled=true;api('/api/open',{path:w.path,force:true}).then(function(y){d.innerHTML=y&&y.opened?"&#10003; Started an agent in <b>"+esc(w.name)+"</b>.":"<i class=ic-warn></i> <b>"+esc(w.name)+"</b>: "+(y&&y.busy?"an agent is already running there.":y&&y.note?esc(y.note):"it didn&#39;t start. Check the command in Settings.");});});o.appendChild(d);}if(x&&x.busy){var d=document.createElement('div');d.className='dd';d.innerHTML="<i class=ic-warn></i> <b>"+esc(w.name)+"</b> already has an agent running, so another wasn&#39;t started. "+(x.auto?"Its new tasks are held, and an agent starts on them when it finishes.":"Its new tasks are held until it finishes. After that, an agent starts on them the next time this tab checks the repo, or send again.");o.appendChild(d);}}).catch(function(){});});h+="<div class='dd'><i class=ic-bot></i> Handed "+n+" repo"+(n===1?"":"s")+" to your agent &mdash; opening the <b>Agents</b> tab to watch it work&hellip;</div>";setTimeout(function(){setTab('agents');},500);}
else{h+="<div class='dd' style='margin-top:8px'>Set an <b>agent command</b> in Settings to auto-run it on send (and watch it on the Workdesk). For now, tell your agent: <b>“Read .symbiot/TASKS.md and implement the unchecked items.”</b></div>";}
h+="</div>";
o.innerHTML=h;
// re-enable only once every handoff has started (or been refused), so a double click can't send twice
Promise.all(opens).then(function(){btn.disabled=false;});}).catch(function(e){btn.disabled=false;o.innerHTML="<div class='err' style='margin-top:10px'>Couldn&#39;t write tasks: "+esc(String((e&&e.message)||e))+"</div>";});}
// Connectors linked to Claude (claude.ai's Drive, Gmail…) reach Claude runs only: say which, or that this command doesn't get them.
var CONNECTORS=[],LINKCONN=[];
// a site linked in Symbiot (Links) only signs Symbiot's browser in: without Claude's own connector for it, runs have no tools for it
function linkGap(){var off=LINKCONN.filter(function(x){return !x.ready;});if(!off.length)return '';var n=off.map(function(x){return "<b>"+esc(x.name)+"</b>";}).join(' and '),one=off.length===1;
return "&#9993;&#65039; "+n+(one?" is":" are")+" linked in Symbiot, but not "+(off.some(function(x){return x.connector;})?"ready ":"")+"as a Claude connector, so your agent&#39;s runs have no tools for "+(one?"it":"them")+": linking a site here signs Symbiot&#39;s browser in, not Claude. Connect "+n+" in claude.ai &rarr; Settings &rarr; Connectors, and the next run gets "+(one?"it":"them")+" by itself. Until then a run sees only what&#39;s new there (Watch).";}
function renderConnectors(){var el=document.getElementById('agentconnectors'),gap=linkGap();if(!CONNECTORS.length){el.innerHTML=/^\\s*claude\\b/.test(document.getElementById('agentcmd').value)?gap:'';return;}
var nm=function(c){return "<b>"+esc(c.name.replace(/^claude\\.ai\\s+/i,''))+"</b>";},ready=CONNECTORS.filter(function(c){return c.ready;}),wait=CONNECTORS.filter(function(c){return !c.ready;});
var cmd=document.getElementById('agentcmd').value;if(/orca-ide/.test(cmd)&&/claude/.test(cmd)){el.innerHTML="<i class=ic-plug></i> Claude in Orca&#39;s tab asks you before it uses your connectors ("+CONNECTORS.map(nm).join(", ")+").";return;}
if(!/^\\s*claude\\b/.test(cmd)){el.innerHTML="<i class=ic-plug></i> Your Claude connectors ("+CONNECTORS.map(nm).join(", ")+") reach Claude Code runs only. This command isn&#39;t Claude, so its runs can&#39;t use them.";return;}
el.innerHTML=(ready.length?"<i class=ic-plug></i> Your agent&#39;s runs can use "+ready.map(nm).join(", ")+": linked to Claude, so each run allows their tools.":"")+(wait.length?(ready.length?" ":"<i class=ic-plug></i> ")+wait.map(nm).join(", ")+(wait.length===1?" needs":" need")+" authorizing in your claude.ai connector settings first.":"")+(gap?" "+gap:"");}
function loadAgentCfg(){api('/api/agentcfg').then(function(d){document.getElementById('agentcmd').value=d.cmd||'';
CONNECTORS=(d.connectors&&d.connectors.list)||[];LINKCONN=(d.connectors&&d.connectors.links)||[];renderConnectors();
var chips=[];(d.agents||[]).forEach(function(a){chips.push(a);});(d.editors||[]).forEach(function(e){chips.push(e);});
var box=document.getElementById('agentpresets');
if(!chips.length){box.innerHTML="<span class='muted' style='font-size:12px'>Nothing detected on PATH &mdash; type your own command above.</span>";return;}
// Agents leave changes for review; an editor preset only opens the repo, so say so.
var na=(d.agents||[]).length;function chip(c,i){return "<button class='ghost preset' data-i='"+i+"' style='padding:4px 10px;font-size:12px;margin:5px 5px 0 0'>"+esc(c.label)+"</button>";}
var h="<span class='muted' style='font-size:12px'>Detected &mdash; click to use:</span><br>"+chips.slice(0,na).map(chip).join("");
if(chips.length>na)h+="<div class='muted' style='font-size:12px;margin-top:8px'>Editors &mdash; opens only, no review:</div>"+chips.slice(na).map(function(c,i){return chip(c,na+i);}).join("");
box.innerHTML=h;
box.querySelectorAll('.preset').forEach(function(btn){btn.addEventListener('click',function(){document.getElementById('agentcmd').value=chips[+btn.getAttribute('data-i')].tmpl;saveAgent();});});});}
function saveAgent(){renderConnectors();api('/api/agentcmd',{cmd:document.getElementById('agentcmd').value});}
function grant(kind){var i=document.getElementById(kind==='tool'?'granttool':'grantdir');var v=(i.value||'').trim();if(!v)return;var body={};body[kind]=v;api('/api/agent/grant',body).then(function(r){var n=document.getElementById('grantnote');if(!r||r.error){n.className='note err';n.textContent=(r&&r.error)||'could not grant';return;}i.value='';n.className='note ok';n.textContent=(kind==='tool'?'Command allowed':'Folder allowed')+' — the agent can use it on its next run.';if(r.cmd)document.getElementById('agentcmd').value=r.cmd;});}
function loadScanRoots(){api('/api/scanroots').then(function(d){var box=document.getElementById('scanroots');var roots=d.effective||[];
box.innerHTML=roots.map(function(r){var custom=(d.roots||[]).indexOf(r)>=0;return "<div class='task' data-p='"+esc(r)+"'><span class='t' style='font-family:ui-monospace,monospace;font-size:12px'>"+esc(r)+"</span>"+(r===d.home?"<span class='rp'>home</span>":"")+(custom?"<button class='rm rmroot' title='remove'>&times;</button>":"")+"</div>";}).join("")+(!d.searching&&d.searched&&!d.found?"<p class='muted' style='font-size:12px'>The last search found no projects in these folders. I'll keep looking; add a folder if yours is somewhere else.</p>":"");
box.querySelectorAll('.rmroot').forEach(function(btn){btn.addEventListener('click',function(){api('/api/scanroots/remove',{path:btn.closest('.task').getAttribute('data-p')}).then(function(){loadScanRoots();mapLoaded=false;driftLoaded=false;});});});});}
function addRootUI(){var i=document.getElementById('newroot');var v=(i.value||'').trim();if(!v)return;var n=document.getElementById('scanrootnote');
api('/api/scanroots/add',{path:v}).then(function(r){if(r.error){n.innerHTML="<span class='err'>"+esc(r.error)+"</span>";return;}i.value='';n.textContent='Added — the Map/Drift will rescan.';loadScanRoots();mapLoaded=false;driftLoaded=false;});}
// Knowledge folders (knowledge.mjs): what's read in each, its examples, and what
// isn't read yet (Word, PDF, Excel). Clicking one puts it in the boxes to change its examples.
function knowRows(d){var box=$('knowroots');var fs=(d&&d.folders)||[];
box.innerHTML=fs.length?fs.map(function(f){var nr=Object.keys(f.notRead||{}).map(function(k){return f.notRead[k]+' '+k;}).join(', ');
return "<div class='task' data-p='"+esc(f.path)+"' data-x='"+esc((f.examples||[]).join(', '))+"'><span class='t knowedit' style='font-family:ui-monospace,monospace;font-size:12px;cursor:pointer' title='Change its examples'>"+esc(f.path)+"<br><span class='muted' style='font-family:inherit'>"+f.files+" file"+(f.files===1?"":"s")+" read"+(f.cases?" &middot; "+f.cases+" case"+(f.cases===1?"":"s"):"")+(f.items?" &middot; "+f.items+" open item"+(f.items===1?"":"s"):"")+(nr?" &middot; not read yet: "+esc(nr):"")+"</span></span><span class='rp' title='Worked examples: never used as facts'>examples: "+esc((f.examples||[]).join(', ')||'none')+(f.exampleFiles?" ("+f.exampleFiles+")":"")+"</span><button class='rm rmknow' title='remove'>&times;</button></div>";}).join(""):"";
box.querySelectorAll('.rmknow').forEach(function(btn){btn.addEventListener('click',function(){var n=$('knownote');n.textContent='Removing…';api('/api/knowledge/remove',{path:btn.closest('.task').getAttribute('data-p')}).then(function(r){n.textContent=r.error?r.error:'Removed: chats no longer quote it.';knowRows(r.error?d:r);});});});
box.querySelectorAll('.knowedit').forEach(function(s){s.addEventListener('click',function(){var t=s.closest('.task');$('newknow').value=t.getAttribute('data-p');$('newknowex').value=t.getAttribute('data-x')||'none';$('addknow').textContent='Save';$('newknowex').focus();});});}
function loadKnowledge(){api('/api/knowledge').then(knowRows);loadChecks();}
// Checks (checks.mjs): where two of the folders' files disagree (a deadline on
// someone's leave, a customer's renewal date given twice), the most pressing
// first, each with the files to open. Checked again whenever a file changes.
function checksHtml(c){if(!c||!c.folders||!c.folders.length)return '';var cl=c.clashes||[];
var row=function(x){return "<div class='task'><span class='t'>"+(x.severity==='high'?"<b style='color:var(--amber)'>&#9679;</b> ":"")+esc(x.text)+"<div class='muted' style='font-size:12px'>"+(x.files||[]).map(function(f){return "<code>"+esc(f)+"</code>";}).join(' &middot; ')+"</div></span></div>";};
return "<div class='tgroup' style='margin-top:14px"+(cl.length?";color:var(--amber)":"")+"'>Where your files disagree <span class='tcount'>"+cl.length+"</span></div><div class='row' style='margin:2px 0 6px'><span class='muted' style='flex:1;font-size:12.5px'>"+(cl.length?"Two files saying different things: a date on someone&#39;s leave, a holiday or an office day, or a customer&#39;s renewal, price, users or owner told two ways. Examples aren&#39;t checked.":"Nothing disagrees: dates, leave, holidays and customers line up across the files.")+(c.at?" Checked "+agoTxt(c.at)+".":"")+"</span><button type='button' class='ghost' id='checksrun'>Check again</button></div>"+
cl.slice(0,6).map(row).join('')+(cl.length>6?"<details class='tfull'><summary>"+(cl.length-6)+" more</summary>"+cl.slice(6,200).map(row).join('')+"</details>":"");}
function loadChecks(run){var el=$('knowchecks');if(!el)return;if(run)el.innerHTML="<div class='muted' style='margin-top:12px'>Checking&hellip;</div>";
(run?api('/api/knowledge/checks/run',{}):api('/api/knowledge/checks')).then(function(c){el.innerHTML=checksHtml(c);var b=$('checksrun');if(b)b.addEventListener('click',function(){loadChecks(true);});}).catch(function(){});}
function addKnowUI(){var i=$('newknow'),x=$('newknowex');var v=(i.value||'').trim();if(!v)return;var n=$('knownote');n.textContent='Reading it…';
api('/api/knowledge/add',{path:v,examples:(x.value||'').trim()}).then(function(r){if(r.error){n.innerHTML="<span class='err'>"+esc(r.error)+"</span>";return;}i.value='';x.value='';$('addknow').textContent='Add folder';var f=(r.folders||[]).filter(function(y){return y.path===v||y.cite===v;})[0];n.textContent=f?'Read '+f.files+' files'+(f.exampleFiles?', '+f.exampleFiles+' of them examples':'')+'. Chats can quote them now.':'Saved.';knowRows(r);loadChecks(true);});}
// In the Android app (window.SymbiotAndroid): Termux keeps its home folder
// private, so only a Symbiot running there sees those projects. The app can show
// that one instead of its own, from the link Termux opens.
function phoneTermux(){var A=window.SymbiotAndroid,t={};if(A&&A.termux){try{t=JSON.parse(A.termux())||{};}catch(e){}}return t;}
function loadPhone(){var t=phoneTermux();if(!t.installed&&!t.on)return;$('phonebox').classList.remove('hidden');
$('phonenote').innerHTML=t.on?"This window shows the Symbiot running in Termux, so it sees the projects in Termux's home folder and runs your agents there. The app's own Symbiot sees only shared storage.":"Termux keeps its home folder (<code>~</code>) private, so the app's own Symbiot can't see the projects there. Symbiot running in Termux can, and this app can show it. <b>Open Termux</b> copies the command that starts it (it installs Node and Symbiot there first if they're missing). Paste it in Termux, and Termux opens it here.";
var b=$('phonebtn');b.textContent=t.on?"Use the app's own Symbiot":"Open Termux";b.onclick=function(){if(t.on)SymbiotAndroid.builtIn();else SymbiotAndroid.openTermux();};}
`;
