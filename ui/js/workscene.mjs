// symbiot — the work scene: the Workdesk in the liquid, and the relay of agents.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// ---- the work scene ------------------------------------------------------------------
// The Workdesk, in the liquid: what each agent is doing (spheres revolve round
// it while it works), what's done and waiting for your OK, and what's waiting its
// turn. One Go starts what's waiting. A tap opens the details; nothing else to read.
function lqWork(){lqRemember();LQ.scene='work';LQ.mode='aware';var sc=$('lqscene');if(sc)sc.textContent=LQ.workBy==='project'?'Projects':'Workdesk';var b=document.body;if(b&&b.classList){b.classList.add('lq-work');b.classList.toggle('lq-byproj',LQ.workBy==='project');b.classList.remove('lq-pooled');}lqLoadWork();
if(LQ.workTimer)clearInterval(LQ.workTimer);LQ.workTimer=setInterval(function(){if(LQ.scene==='work'&&LQ.mode!=='pool')lqLoadWork();},5000);}
function lqHome(){lqRemember();LQ.scene='home';LQ.relaySig='';var rl=$('lqrelay');if(rl)rl.innerHTML='';var li=$('lqline');if(li)li.innerHTML='';var b=document.body;if(b&&b.classList){b.classList.remove('lq-work');b.classList.remove('lq-projopen');b.classList.remove('lq-byproj');b.classList.remove('lq-pooled');}if(LQ.workTimer){clearInterval(LQ.workTimer);LQ.workTimer=null;}LQ.mode='aware';lqLoad(true);}

// ---- the relay: Agents, on the Tasks screen ----------------------------------------
// One line for where everything stands, then a blob per project with something to say:
// what its agent did or is doing, what it asks you (its answers as buttons, as on
// home), Review and approve when it's ready, and the extra tasks it suggests (+ task
// or Skip). You needn't open Agents; it's still there for the detail.
// AI usage limits (quota.mjs): the meter in the corner, its details, and "paused for quota" on Home and the Workdesk.
var QUOTA=null;
function qPaused(){return QUOTA&&QUOTA.paused?QUOTA.pausedText:'';}
function qDraw(){var box=$('quota');if(!box)return;var q=QUOTA;
if(!q||!q.rows||!q.rows.length){box.classList.add('hidden');}else{box.classList.remove('hidden');box.classList.remove('near','hit');if(q.level==='near'||q.level==='hit')box.classList.add(q.level);$('qtext').textContent=q.text||'AI';
$('qpop').innerHTML=q.rows.map(function(r){var h="<div class='qrow'><b>"+esc(r.label)+"</b> &middot; "+esc(r.headline||'')+(r.windows||[]).map(function(w){var pc=w.used==null?0:w.used,lv=pc>=100?'hit':pc>=80?'near':'';return "<div class='qbar "+lv+"' title='"+esc(w.label)+"'><i style='width:"+pc+"%'></i></div><small>"+esc(w.label)+": "+(w.used==null?(w.over?'reset, no reading yet':'unknown'):w.used+'% used')+(w.resetText?(w.over?' &middot; reset '+esc(w.resetText):' &middot; resets '+esc(w.resetText)):'')+"</small>";}).join('')+"<small>from "+esc(r.source||'')+"</small></div>";return h;}).join('');}
var bn=$('qbanner');if(bn){var t=qPaused();bn.textContent=t;bn.classList.toggle('show',!!t);}
try{if(LQ.scene==='work')lqRelay();else lqHomeLine(LQ.home||{});}catch(e){}}
function qLoad(){api('/api/quota').then(function(q){QUOTA=q&&!q.error?q:null;qDraw();}).catch(function(){});}
function qInit(){var p=$('qpill');if(!p)return;p.addEventListener('click',function(ev){if(ev&&ev.stopPropagation)ev.stopPropagation();$('quota').classList.toggle('open');});if(document.addEventListener)document.addEventListener('click',function(ev){var b=$('quota');if(b&&ev&&ev.target&&b.contains&&!b.contains(ev.target))b.classList.remove('open');});qLoad();setInterval(qLoad,30000);}
function lqLineText(w){var nr=(w.running||[]).length,nq=0,ni=0,nk=(w.ready||[]).length,nw=w.waitingCount||0;(w.projects||[]).forEach(function(p){nq+=p.asks||0;ni+=(p.ideas||[]).length;});
var bits=[];if(nq)bits.push('<b>'+nq+' question'+(nq>1?'s':'')+' for you</b>');if(nk)bits.push('<b>'+nk+' ready for your OK</b>');if(nr)bits.push(nr+' at work');if(w.parkedCount)bits.push(w.parkedCount+' parked on others');if(nw)bits.push(nw+' waiting');if(ni)bits.push(ni+' suggested task'+(ni>1?'s':''));
var qp=qPaused();if(qp)bits.unshift('<b>'+esc(qp)+'</b>');return bits.length?bits.join(' &middot; '):'All quiet: nothing at work, nothing asking you.';}
function lqRelayList(w){return lqSortLanes((w.projects||[]).filter(function(p){return p.summary||p.now||(p.qs&&p.qs.length)||p.ready||p.shipping||(p.ideas&&p.ideas.length)||(p.handing&&p.handing.length);}).slice());}
// The column shows at 900 px and wider; on a phone the same cards open from "Projects · N" (lqRelayPhone).
// With nothing to show it's still there: loading (3 bars) or "No projects with work on them yet".
function lqRelayOn(){var S=lqSize();return LQ.scene==='work'&&S.w>=900;}
// A lane's first question as its card: drawn and wired from the one object, so a button it
// draws (Sign in to <site>) is never wired without what it opens (2026-10-14: it did nothing).
function rlAsk(p,nm,q){return {kind:'ask',name:nm,repo:p.repo,q:q.q,raw:q.raw,task:q.task,labels:q.labels,options:q.options,path:q.path,fix:q.fix,id:q.id,sub:q.sub,draft:q.draft,signInTo:q.signInTo,more:Math.max(0,(p.asks||p.qs.length)-1)};}
// The pill is one of 7 (cardwords.mjs pillOf); amber for the two that need you.
var RLAMBER={'Asks you':1,'Ready for your OK':1};
function rlLane(l){var n=String(l||'');if(n==='ops')return 'Ops';n=lqProjName(n)||n;if(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(n))n=n.replace(/[-_]+/g,' ');return n.charAt(0).toUpperCase()+n.slice(1);} // a lane as people say it: never a folder slug
function rlHand(x){var to=rlLane(x.lane)+(x.then?', then '+rlLane(x.then):'');return "<p class='rlhand' title='"+escQ(x.text)+"'><b>To "+esc(to)+":</b> "+esc(x.words||x.why)+(x.ask?" &middot; <button type='button' class='rlans' data-lane='"+escQ(x.ask)+"'>Answer &rsaquo;</button>":"")+"</p>";}
function rlTime(t){var d=new Date(t),p=function(n){return (n<10?'0':'')+n;};return p(d.getHours())+':'+p(d.getMinutes());}
var RLOPEN={}; // the cards whose summary is open (More), by lane
function lqRelay(){var el=$('lqrelay'),ln=$('lqline'),w=LQ.workData,off=document.body&&document.body.classList&&document.body.classList.contains('lq-offline');
if(ln)ln.innerHTML=LQ.scene==='work'?(w?lqLineText(w):'')+(off&&LQ.workAt?" &middot; <span class='rlwhen'>Last updated "+rlTime(LQ.workAt)+"</span>":''):'';if(!el)return;
var ps=lqRelayList(w||{}),sig=(w?'1':'0')+JSON.stringify(ps.map(function(p){return [p.repo,p.summary,p.now,p.pill,p.ready,p.shipping,(p.qs||[]).map(function(q){return q.q;}),(p.ideas||[]).map(function(i){return i.full;}),p.sent,p.parked,(p.handing||[]).map(function(x){return x.words+x.ask+x.then;})];}));
lqRelayPhone(ps.length);
if(el.contains&&document.activeElement&&el.contains(document.activeElement)&&el.innerHTML)return;if(sig===LQ.relaySig&&el.innerHTML){rlMeasure();return;}LQ.relaySig=sig;
if(!w){el.innerHTML="<span class='rlsr'>Loading your projects…</span>"+[0,1,2].map(function(){return "<section class='rly rlskel' aria-hidden='true'><i></i><i></i><i></i></section>";}).join('');return;}
if(!ps.length){el.innerHTML="<section class='rly rlempty'><b>No projects with work on them yet</b><p class='rlsum'>Tell Symbiot what to do in the box below.</p></section>";return;}
el.innerHTML=ps.map(function(p,i){var nm=p.name||p.repo,q=(p.qs||[])[0],st=p.pill||'Idle',amber=!!RLAMBER[st]||/^Needs your /.test(st);
var h="<section class='rly"+(amber?' lit':'')+"' data-i='"+i+"'><div class='rlh'><b>"+esc(nm)+"</b><span class='rls"+(st==='At work'?' rlgo':'')+"'>"+esc(st)+"</span></div>";
if(p.now)h+="<p class='rlnow'>"+esc(p.now)+"</p>";
if(p.summary&&!(q&&String(q.q||'').trim()===String(p.summary).trim()))h+="<p class='rlsum"+(RLOPEN[p.repo]?' open':'')+"'>"+esc(p.summary)+"</p><button type='button' class='rlmore' hidden aria-expanded='"+(RLOPEN[p.repo]?'true':'false')+"'>"+(RLOPEN[p.repo]?'Less':'More')+"</button>";
if(q)h+="<div class='lqblob rlask'>"+blobBody(rlAsk(p,nm,q),false)+"</div>";
if(p.ready)h+="<button type='button' class='act rlok'>Review and approve</button>";
if(p.handing&&p.handing.length)h+="<div class='rlk'>Handed over</div>"+p.handing.map(rlHand).join('');
if(p.ideas&&p.ideas.length)h+="<div class='rlk'>"+(p.ideas.every(function(d){return d.from;})?"Extra tasks other agents suggest":"Extra tasks it suggests")+"</div>"+p.ideas.map(function(d,j){return "<div class='rli' data-j='"+j+"'><span title='"+escQ(d.full)+"'>"+esc(d.text)+(d.from?" <small class='rlfrom'>from "+esc(rlLane(d.from))+"</small>":"")+"</span><span class='rlia'><button type='button' class='rladd'>+ task</button><button type='button' class='rlskip'>Skip</button></span></div>";}).join('');
if(p.sent&&p.sent.length)h+="<p class='rlsent' title='they show on that project&#39;s card'>"+p.sent.map(function(x){return "Sent "+x.n+" idea"+(x.n>1?"s":"")+" to "+esc(rlLane(x.repo));}).join(", ")+"</p>";
return h+"<div class='rlf'><button type='button' class='rlopen'>Its tasks &rsaquo;</button><button type='button' class='rlag'>Its agents &rsaquo;</button></div></section>";}).join('');
el.querySelectorAll('.rly').forEach(function(box){var p=ps[+box.getAttribute('data-i')],q=(p.qs||[])[0],nm=p.name||p.repo;
// More: only when the summary runs past its 3 lines; it opens the rest in place, Less closes it
var sm=box.querySelector('.rlsum'),mo=box.querySelector('.rlmore');if(sm&&mo){
mo.addEventListener('click',function(){var o=!RLOPEN[p.repo];RLOPEN[p.repo]=o;sm.classList.toggle('open',o);mo.textContent=o?'Less':'More';mo.setAttribute('aria-expanded',o?'true':'false');});}
var ab=box.querySelector('.rlask');if(ab&&q)wireBlob(ab,rlAsk(p,nm,q),{done:function(){LQ.relaySig='';lqLoadWork();}});
var ok=box.querySelector('.rlok');if(ok)ok.addEventListener('click',function(){lqOpen({kind:'proj',repo:p.repo,lit:true});});
box.querySelectorAll('.rlans').forEach(function(b){b.addEventListener('click',function(){lqOpen({kind:'proj',repo:b.getAttribute('data-lane'),lit:true});});});
box.querySelector('.rlopen').addEventListener('click',function(){lqOpen({kind:'proj',repo:p.repo});});
box.querySelector('.rlag').addEventListener('click',function(){lqPool('agents');});
box.querySelectorAll('.rli').forEach(function(row){rlIdea(row,p.ideas[+row.getAttribute('data-j')],nm);});});setTimeout(rlMeasure,0);}
// A suggested task's row: + task adds it; Skip fades it with an Undo for 5 s, and only then is it skipped.
// Undo and a failed skip put the row back here, wired again (the list doesn't redraw while focus is in it,
// and markup put back alone has no listeners: critic, 25 Oct 2026).
function rlIdea(row,d,nm){var acts=row.querySelector('.rlia'),a=row.querySelector('.rladd'),k=row.querySelector('.rlskip');if(!acts||!a||!k)return;var was=acts.innerHTML;
var back=function(){var had=row.contains(document.activeElement);row.classList.remove('skipped');acts.innerHTML=was;rlIdea(row,d,nm);var s=row.querySelector('.rlskip');if(had&&s&&s.focus)s.focus();};
a.addEventListener('click',function(){a.disabled=k.disabled=true;api('/api/tasks/add',{text:d.full,repo:d.repo}).then(function(r){if(!r||r.error){a.disabled=k.disabled=false;lqSaid(nm+': '+((r&&r.error)||'couldn’t add it'),true);return;}acts.innerHTML="<span class='rldone'>Added to "+esc(nm)+"’s tasks.</span>";lqSaid('Added to '+nm+'’s tasks.');});});
k.addEventListener('click',function(){var t;row.classList.add('skipped');acts.innerHTML="<span class='rldone'>Skipped</span><button type='button' class='rlundo'>Undo</button>";
var u=acts.querySelector('.rlundo');if(u.focus)u.focus();u.addEventListener('click',function(){clearTimeout(t);back();});
t=setTimeout(function(){api('/api/agents/skip',{path:d.path,text:d.full}).then(function(r){if(!r||r.error){back();lqSaid(nm+': '+((r&&r.error)||'couldn’t skip it'),true);LQ.relaySig='';return;}if(row.classList)row.classList.add('gone');setTimeout(function(){row.remove();LQ.relaySig='';},300);}).catch(function(){back();lqSaid(nm+': couldn’t skip it, the connection was lost',true);LQ.relaySig='';});},5000);});}
// More shows only on a summary past its 3 lines, measured while it's on screen (the phone's list is hidden until it opens)
function rlMeasure(){var el=$('lqrelay');if(!el)return;el.querySelectorAll('.rly').forEach(function(box){var sm=box.querySelector('.rlsum'),mo=box.querySelector('.rlmore');if(!sm||!mo||!sm.clientHeight)return;mo.hidden=!(sm.classList.contains('open')||sm.scrollHeight>sm.clientHeight+2);});}
// On a phone (under 900 px) the column has no room: "Projects · N" opens the same cards full width.
function lqRelayPhone(n){var b=$('lqprojects');if(!b)return;b.textContent='Projects · '+n;var on=document.body.classList.contains('lq-projopen');b.setAttribute('aria-expanded',on?'true':'false');}
function lqProjToggle(){var b=document.body;b.classList.toggle('lq-projopen');lqRelayPhone(lqRelayList(LQ.workData||{}).length);if(b.classList.contains('lq-projopen')){var el=$('lqrelay');if(el)el.scrollTop=0;setTimeout(rlMeasure,0);}}
function lqLoadWork(){api('/api/work').then(function(w){LQ.workData=w||{};LQ.workAt=Date.now();lqRedraw();}).catch(function(){});}
// New data, drawn: unless you're selecting text on the surface, then once you let go
// Updates: what Symbiot tells you (a goal done, a report written), kept off Needs you (needs.mjs), in
// the header: a count, and the list on a tap. Each can be read or put away.
// An update from intuition: each of its moves on a line with what you can do about it (Do it: carried out
// now, every gate still applies; Not useful: fewer like it; Open: its project), and an Ask box (22 Oct 2026:
// the list was lines with only a put-away).
function updMoves(u,i){return "<div class='lqupi lqupm' role='listitem' data-i='"+i+"'><div class='lqupmh'><b>"+esc(u.lane||'Symbiot')+"</b><button type='button' class='lqupx' aria-label='Put it away'>&times;</button></div>"+u.moves.map(function(m){return "<div class='lqmv' data-m='"+m.i+"'><span class='lqmt'>"+esc(m.line)+"</span><span class='lqmrow'>"+(m.state?"<small class='lqms'>"+esc(m.state)+"</small>":"")+(m.do?"<button type='button' class='lqdo'>"+esc(m.do)+"</button>":"")+(!m.state&&m.kind!=='focus'?"<button type='button' class='lqnot' title='Fewer like this'>Not useful</button>":"")+(m.lane?"<button type='button' class='lqop' title='Open "+escQ(m.lane)+"'>Open</button>":"")+"</span></div>";}).join('')+"<form class='lqask'><input placeholder='Ask about this, or tell it what to do' maxlength='2000'><button type='submit'>Ask</button></form><div class='lqans'></div>"+(u.report&&u.report.id?"<button type='button' class='lqupr'>Read</button>":"")+"</div>";}
function wireUpdMoves(r,u){var ans=r.querySelector('.lqans'),say=function(t,bad){if(ans){ans.textContent=t||'';ans.classList.toggle('err',!!bad);}};
r.querySelectorAll('.lqmv').forEach(function(mv){var i=+mv.getAttribute('data-m'),m=(u.moves||[]).filter(function(x){return x.i===i;})[0]||{};
var d=mv.querySelector('.lqdo');if(d)d.addEventListener('click',function(){d.disabled=true;api('/api/intuition/do',{id:u.id,i:i}).then(function(x){if(!x||x.error){d.disabled=false;say((x&&x.error)||'It didn’t start.',true);return;}say(x.said||'Started.');d.outerHTML="<small class='lqms'>"+(m.do==='Prepare it'?'asked':'done')+"</small>";var n=mv.querySelector('.lqnot');if(n)n.remove();});});
var n=mv.querySelector('.lqnot');if(n)n.addEventListener('click',function(){n.disabled=true;api('/api/intuition/not',{id:u.id,i:i}).then(function(x){say((x&&(x.said||x.error))||'');mv.style.opacity='.45';var b=mv.querySelector('.lqdo');if(b)b.remove();n.remove();});});
var o=mv.querySelector('.lqop');if(o)o.addEventListener('click',function(){var el=$('lqupd');if(el)el.classList.remove('open');lqFocus({repo:m.lane==='ops'?'':m.lane});});});
var f=r.querySelector('.lqask');if(f)f.addEventListener('submit',function(ev){ev.preventDefault();var q=f.querySelector('input'),t=String(q.value||'').trim();if(!t)return;var b=f.querySelector('button');b.disabled=true;say('Asking…');
api('/api/updates/ask',{id:u.id,text:t}).then(function(x){b.disabled=false;if(!x||x.error){say(x&&x.error==='not-connected'?'Connect an AI in Settings to ask about it.':((x&&x.error)||'failed'),true);return;}q.value='';say(x.answer||'');}).catch(function(e){b.disabled=false;say(String((e&&e.message)||e),true);});});}
function renderUpdates(){var el=$('lqupd');if(!el)return;var us=(LQ.home&&LQ.home.updates)||[];
if(!us.length){el.innerHTML='';return;}var open=el.classList&&el.classList.contains('open');
var html="<button type='button' class='lqupb' aria-expanded='"+(open?'true':'false')+"'>Updates &middot; "+us.length+"</button><div class='lqupl' role='list'>"+us.map(function(u,i){if(u.moves&&u.moves.length)return updMoves(u,i);return "<div class='lqupi' role='listitem' data-i='"+i+"'><span class='lqupt' title='"+escQ(u.title)+"'>"+(u.lane?"<b>"+esc(u.lane)+"</b> ":"")+esc(u.title)+"</span>"+(u.report&&u.report.id?"<button type='button' class='lqupr'>Read</button>":"")+(u.accept?"<button type='button' class='lqupr lqupa'>"+esc(u.accept.label||'OK')+"</button>":"")+"<button type='button' class='lqupx' aria-label='Put it away'>&times;</button></div>";}).join('')+"</div>";
if(sameHtml(el,html))return;el.querySelector('.lqupb').addEventListener('click',function(){el.classList.toggle('open');this.setAttribute('aria-expanded',el.classList.contains('open')?'true':'false');});
el.querySelectorAll('.lqupt').forEach(function(t){t.addEventListener('click',function(){t.classList.toggle('full');});}); // cut at two lines: a click shows it all
el.querySelectorAll('.lqupi').forEach(function(r){var u=us[+r.getAttribute('data-i')];if(u.moves&&u.moves.length)wireUpdMoves(r,u);var rd=r.querySelector('.lqupr');if(rd)rd.addEventListener('click',function(){el.classList.remove('open');showReport(u.report.id);});
var ac=r.querySelector('.lqupa');if(ac)ac.addEventListener('click',function(){r.style.opacity='.4';api(u.overrides?'/api/overrides/apply':'/api/intuition/accept',{id:u.accept.id}).then(function(d){if(u.overrides&&d&&d.error){r.style.opacity='';r.querySelector('.lqupt').textContent=d.error;return Promise.reject(0);}return api('/api/home/dismiss',{key:u.key});}).then(function(){LQ.home.updates=(LQ.home.updates||[]).filter(function(x){return x!==u;});renderUpdates();}).catch(function(){});});
r.querySelector('.lqupx').addEventListener('click',function(){r.style.opacity='.4';(u.goal?api('/api/agents/answer',{path:u.path,answers:[{q:u.q,a:u.answer}]}):u.overrides&&u.accept?api('/api/overrides/dismiss',{id:u.accept.id}):Promise.resolve()).then(function(){return api('/api/home/dismiss',{key:u.key});}).then(function(){LQ.home.updates=(LQ.home.updates||[]).filter(function(x){return x!==u;});renderUpdates();});});});}
function lqRedraw(){renderUpdates();whenFree($('liquid'),'liquid',function(){if(LQ.scene==='work')lqBuildWork();else lqBuild();});}
function lqBuildWork(){lqRelay();if(LQ.workBy==='project'){lqBuildProjects();return;}var w=LQ.workData||{},S=lqSize(),cx=S.w/2,cy=S.h*0.5,list=[];LQ.bw=S.w;LQ.bh=S.h;if(lqRelayOn()){var RW=Math.min(420,S.w*0.32)+28;S={w:S.w-RW,h:S.h,s:S.s};cx=S.w/2;}
var vx=Math.max(0.5,Math.min(S.s*1.3,(S.w/2-90)/400)),vy=Math.max(0.35,Math.min(S.s*0.8,(S.h-cy-230)/400,(cy-160)/400)),rs=Math.min(S.s,(vx+vy)/1.5);
var park=(w.parked||[]).slice(0,3),run=(w.running||[]).slice(0,3),ready=(w.ready||[]).slice(0,2),wait=(w.waiting||[]).slice(0,5),extra=(w.waitingCount||0)-wait.length;
run.forEach(function(r,i){var ang=Math.PI+(i+1)*Math.PI/(run.length+1);var pg=r.step?' · step '+r.step+' of '+r.of:r.progress?' · '+r.progress.done+' of '+r.progress.total+' done':'';
list.push({id:r.id,kind:'run',repo:r.name,shape:'agents',ask:r.waiting||!!(r.quiet||r.looping),title:r.doing,sub:r.name+pg+(r.eta?' · '+r.eta:'')+(r.waiting?' · has a question for you':'')+(r.quiet||r.looping?' · '+runWarn(r).replace(/ · $/,''):''),r:58*rs,tx:cx+Math.cos(ang)*190*vx,ty:cy+Math.sin(ang)*130*vy});});
ready.forEach(function(r,i){var ang=-Math.PI/2+(i-(ready.length-1)/2)*0.9;list.push({id:r.id,kind:'ready',repo:r.repo,shape:'tasks',title:'Ready for your OK',sub:r.repo+(r.count?' · '+r.count+' task'+(r.count>1?'s':'')+' done':''),r:48*rs,tx:cx+Math.cos(ang)*300*vx,ty:cy+Math.sin(ang)*300*vy});});
wait.forEach(function(t,i){var ang=Math.PI/2+(i-(wait.length-1)/2)*0.55;var y=t.why||{};list.push({id:t.id,kind:'wait',repo:t.repo,shape:'tasks',title:t.text,sub:y.text||(t.repo+(t.busy?' · after the current one':' · waiting')),ask:!!y.path,focus:y.path||'',r:30*rs,tx:cx+Math.cos(ang)*300*vx,ty:cy+Math.sin(ang)*260*vy});});
park.forEach(function(p,i){var ang=Math.PI*0.5+(i-(park.length-1)/2)*0.5;list.push({id:p.id,kind:'park',repo:p.lane,shape:'agents',title:p.text,sub:'parked \u00b7 waiting on '+p.who+(p.why?': '+p.why:''),r:34*rs,tx:cx+Math.cos(ang)*190*vx,ty:cy+Math.sin(ang)*190*vy});});
if(extra>0)list.push({id:'morewait',kind:'more',shape:'tasks',title:'+'+extra+' more waiting',sub:'see them all',r:24*rs,tx:S.w-Math.max(80,S.w*0.1),ty:S.h-230});
lqGrow(list,cx,cy,vx,vy);list.forEach(function(d){d.ax=d.tx;d.ay=d.ty;});
var wl=[];list.forEach(function(d,i){if(d.kind!=='wait'&&d.kind!=='ready')return;list.forEach(function(e,j){if(e.kind==='run'&&e.repo===d.repo)wl.push([j,i,0.5]);});});lqSeed(list,wl,cx,cy,vx,vy);lqNear(list,wl,cx,cy,92*rs,S);lqRelax(list,S,cx,cy,92*S.s);
var old={};LQ.drops.forEach(function(d){old[d.id]=d;});
LQ.drops=list.map(function(d){var o=old[d.id];d.x=o?o.x:cx;d.y=o?o.y:cy;d.vx=o?o.vx:0;d.vy=o?o.vy:0;d.cr=o?o.cr:0;return d;});
var nr=(w.running||[]).length,nw=w.waitingCount||0,nk=(w.ready||[]).length;
LQ.coreText=(nr?nr+' at work':'Nobody at work')+((w.parkedCount||0)?' · '+w.parkedCount+' parked on others':'')+(nw?' · '+nw+' waiting':'')+(nk?' · '+nk+' ready for your OK':'');
var go=$('lqgo');if(go){var n=w.canGo||0;go.textContent=n?'Go \u00b7 start '+n+' task'+(n>1?'s':''):'';if(go.classList)go.classList.toggle('on',n>0);}
lqLabels();}
// Projects: a sphere per lane with work on it, sized by how much is going on, its
// state under its name (the name people use: CallForge AI is Bookly); spheres orbit
// while an agent works, amber (lit) when something there needs you. In order
// (lqSort: what needs you first, the most recent, or A to Z), clockwise from the
// left (the screen is wider than it's tall), so where one sits says where it ranks
// and stays put while nothing changes;
// the quieter rest under one "more". A click opens that project's tasks, and a
// lit one opens with what lit it lit up (lqFocus).
var LANESORT='need';try{LANESORT=(window.localStorage&&window.localStorage.getItem('symbiot-lanesort'))||'need';}catch(e){}
function lqSortLanes(ps){if(LANESORT==='name')return ps.sort(function(a,b){var x=String(a.name||a.repo).toLowerCase(),y=String(b.name||b.repo).toLowerCase();return x<y?-1:x>y?1:0;});
if(LANESORT==='recent')return ps.sort(function(a,b){return (b.last||0)-(a.last||0)||(b.lit?1:0)-(a.lit?1:0);});return ps;}
function lqSort(s){LANESORT=s;try{if(window.localStorage)window.localStorage.setItem('symbiot-lanesort',s);}catch(e){}var g=$('lqsort');if(g&&g.querySelectorAll)g.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-checked',b.getAttribute('data-sort')===s?'true':'false');});lqAct();if(LQ.scene==='work'&&LQ.workBy==='project')lqBuildProjects();}
function lqBuildProjects(){var w=LQ.workData||{},S=lqSize(),cx=S.w/2,cy=S.h*0.5,list=[];LQ.bw=S.w;LQ.bh=S.h;if(lqRelayOn()){var RW=Math.min(420,S.w*0.32)+28;S={w:S.w-RW,h:S.h,s:S.s};cx=S.w/2;}
var vx=Math.max(0.5,Math.min(S.s*1.3,(S.w/2-90)/400)),vy=Math.max(0.35,Math.min(S.s*0.8,(S.h-cy-230)/400,(cy-160)/400)),rs=Math.min(S.s,(vx+vy)/1.5);
var all=lqSortLanes((w.projects||[]).slice()),cap=S.w<700?5:7,ps=all.slice(0,cap),rest=all.slice(cap),slots=Math.max(3,ps.length+(rest.length?1:0));
ps.forEach(function(p,i){var ang=Math.PI+i*2*Math.PI/slots,load=p.waiting+2*p.ready+(p.running?3:0)+2*Math.min(2,p.asks||0);
var sub=p.asks?p.asks+' question'+(p.asks>1?'s':'')+' for you':p.shipping?'approving: '+p.shipping:p.ready?'ready for your OK':p.runs>1?p.runs+' agents at work':p.running?(p.running.ask?'has a question for you':p.running.quiet||p.running.looping?runWarn(p.running).replace(/ · $/,''):p.running.line?String(p.running.line)+(p.running.eta?' · '+p.running.eta:''):'agent at work: '+String(p.running.doing||'').toLowerCase()):!p.waiting&&p.handing&&p.handing.length?(p.handing.some(function(x){return !x.gone;})?'a handover not sent yet':'handed over to '+p.handing[0].lane):p.waiting+' task'+(p.waiting>1?'s':'')+' waiting';if(p.parked)sub='parked \\u00b7 '+sub;
list.push({id:'proj:'+p.repo,kind:'proj',repo:p.repo,shape:'tasks',title:p.name||p.repo,sub:sub,orbit:!!p.running,ask:!!p.lit,lit:!!p.lit,parked:!!p.parked,r:(30+7*Math.min(6,load))*rs,tx:cx+Math.cos(ang)*260*vx,ty:cy+Math.sin(ang)*260*vy});});
if(rest.length){var am=Math.PI+ps.length*2*Math.PI/slots;list.push({id:'moreproj',kind:'more',title:'+'+rest.length+' more',sub:'quieter: '+rest.map(function(p){return p.name||p.repo;}).join(' · '),lanes:rest.map(function(p){return {repo:p.repo,name:p.name||p.repo,lit:!!p.lit};}),r:24*rs,tx:cx+Math.cos(am)*260*vx,ty:cy+Math.sin(am)*260*vy});}

list.forEach(function(d){d.ax=d.tx;d.ay=d.ty;});lqRelax(list,S,cx,cy,92*S.s);
var old={};LQ.drops.forEach(function(d){old[d.id]=d;});
LQ.drops=list.map(function(d){var o=old[d.id];d.x=o?o.x:cx;d.y=o?o.y:cy;d.vx=o?o.vx:0;d.vy=o?o.vy:0;d.cr=o?o.cr:0;return d;});
var n=w.projectCount||list.length,nr=(w.running||[]).length,nw=w.waitingCount||0;
LQ.coreText=n?n+' project'+(n>1?'s':'')+(nr?' \u00b7 '+nr+' at work':'')+(nw?' \u00b7 '+nw+' tasks waiting':''):'No projects with work on them yet. Tell me what to do.';
var go=$('lqgo');if(go){var k=w.canGo||0;go.textContent=k?'Go \u00b7 start '+k+' task'+(k>1?'s':''):'';if(go.classList)go.classList.toggle('on',k>0);}
lqLabels();}
function lqGoWork(){var go=$('lqgo');if(go)go.disabled=true;api('/api/work/go',{}).then(function(r){if(go)go.disabled=false;
var t=r&&r.error?r.error:r.started||r.queued?(r.started?'Started '+r.started:'')+(r.started&&r.queued?', ':'')+(r.queued?r.queued+' queued behind work already going':'')+'.':(r&&r.note)||(r&&r.parked?'':'Nothing waiting to start.');
if(r&&r.parked&&r.parked.length)t=(t?t+' ':'')+'Not started, parked: '+r.parked.map(lqProjName).join(', ')+'.';
LQ.talk.push({me:false,text:t});LQ.talk=LQ.talk.slice(-8);lqTalkShow(false);LQ.ripple=[0.5,0.5,LQ.t];lqLoadWork();}).catch(function(){if(go)go.disabled=false;});}
`;
