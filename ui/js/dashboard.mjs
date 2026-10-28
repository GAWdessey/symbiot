// symbiot — the Dashboard and Reports.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// ---- Dashboard: a card per page you watch (your inbox, GitHub, WhatsApp…), what's new on each ----
var BOARD=null;
// a chat's line says who its last message is from (watch.mjs fromOf): only unread ones count as waiting on you
var CHATFROM={them:'unread from them',you:'you sent the last one',unknown:'nothing unread, maybe yours'};
// Talk it over (watch.mjs boardChat): a chat on a card, open by its id, with what's half typed kept across a refresh
var BTALK={},BTALKDRAFT={},BTALKBUSY=0;
var TALKHINT="<div class='muted' style='font-size:12px'>Go over what's new here with your AI: what needs you, and what to say to whom. Then click <b>Draft a reply</b> on one, and your agent writes it the way you agreed here. Your AI is sent what this card lists (for mail: the sender, subject and preview).</div>";
function talking(){var f=document.activeElement;return BTALKBUSY>0||!!(f&&f.closest&&f.closest('.btalk'));}
var BOARDH=24;
function loadBoard(){api('/api/watch/board?hours='+BOARDH).then(function(b){if(b&&b.cards){BOARD=b;if(!talking())renderBoard();}});loadAwaiting();}
function boardMsg(cls,html){$('boardmsg').innerHTML="<div class='note "+cls+"'>"+html+"</div>";}

// Replies an agent's email waits on (handback.mjs): Symbiot watches your inbox for them, and hands each on when it's in
var AWAITWORD={waiting:'waiting',replied:'replied',error:"replied, but the next step didn't start"};
var AWAITS=[];
// An email an agent waits on a reply to sits on your inbox's current as a ring, where it was
// sent, with a thread to now: hollow while it waits, filled once the reply is in. Only with
// no inbox current to put it on does it fall back to a list here.
function bsWaitWord(){var n=(AWAITS||[]).filter(function(w){return w.status==='waiting';}).length;return n?' · waiting on '+n+(n===1?' reply':' replies'):'';}
function bsMailLane(){var cs=(BS.b&&BS.b.cards)||[];for(var i=0;i<cs.length;i++)if(cs[i].source==='mail')return i;return -1;}
function loadAwaiting(){api('/api/awaiting').then(function(d){var el=$('boardawait');if(!el||!d)return;var ws=d.waits||[];AWAITS=ws;if(BS.b)bsBuild(BS.b);
if(!ws.length){el.innerHTML='';return;}var open=ws.filter(function(w){return w.status==='waiting';}).length,s=d.sight;
// nothing can see the reply arrive: no inbox watched, or the one watched is signed out
var blind=s&&!s.sees?"<div class='note err'>"+((s.signedOut||[]).length?esc(s.signedOut[0])+" is signed out, so a reply would go unseen. Under Screens, type its address and click Sign in, sign in once and close the window.":"Symbiot can&#39;t see your inbox, so a reply would go unseen. Watch your inbox (map it under Screens, then Watch), or turn on Email in Settings.")+"</div>":"";
if(bsMailLane()>=0){el.innerHTML=blind;return;}
el.innerHTML="<div class='tgroup' style='margin-top:14px'>Waiting on replies <span class='tcount'>"+open+"</span></div><div class='muted' style='font-size:12px;margin-bottom:6px'>Emails your agents sent that need an answer. Symbiot looks for each reply in your inbox itself, and when one is in, the agent that does the next step starts on it. You don&#39;t have to say they replied.</div>"+blind+
ws.map(function(w){var who=(w.to||[]).join(', ')||'?',st=w.status==='waiting'?'waiting since '+agoTxt(w.sent):(AWAITWORD[w.status]||w.status)+(w.reply?' '+agoTxt(w.reply.ts):'')+(w.handed?' &rarr; '+(w.handed==='ops'?'an agent':esc(w.handed)+'&#39;s agent')+' has the next step':'');
return "<div class='task'><span class='t'><b>"+esc(who)+"</b>: "+esc(w.subject)+(w.asked?"<div class='muted' style='font-size:12px'>asked for: "+esc(w.asked)+"</div>":"")+(w.error?"<div class='note err'>"+esc(w.error)+"</div>":"")+"</span><span class='rp'"+(w.status==='waiting'?" style='color:var(--amber)'":"")+">"+st+"</span>"+(w.status==='waiting'?"<button class='ghost astop' data-id='"+esc(w.id)+"' title='stop looking for this reply' style='padding:3px 9px;font-size:12px'>Stop waiting</button>":"")+"</div>";}).join('');
el.querySelectorAll('.astop').forEach(function(btn){btn.addEventListener('click',function(){btn.disabled=true;api('/api/awaiting/stop',{id:btn.getAttribute('data-id')}).then(function(r){if(!r||r.error){btn.disabled=false;boardMsg('err',esc((r&&r.error)||'failed'));return;}loadAwaiting();});});});});}
// ---- Reports (reports.mjs): what agents wrote up in their .symbiot/, newest first, the
// unread ones marked. Opening one shows it here, as HTML the app made (escaped first).
var REPS=[],REPOPEN='',REPTAB='unread';
function kb(n){return n<1024?n+' B':Math.round(n/1024)+' KB';}
function loadReports(){api('/api/reports').then(function(d){REPS=(d&&d.reports)||[];if(!REPOPEN)renderReports();}).catch(function(e){$('reportslist').innerHTML="<div class='note err'>"+esc(String((e&&e.message)||e))+"</div>";});}
function renderReports(){var el=$('reportslist');$('reportview').innerHTML='';REPOPEN='';
if(!REPS.length){el.innerHTML="<div class='muted' style='margin-top:12px'>No reports yet. When an agent writes up findings or a plan, it shows here.</div>";return;}
var row=function(r,i){var where=r.source?esc(r.lane)+' &middot; '+esc(r.source):!r.run||r.run===r.lane?esc(r.lane):r.run.indexOf(r.lane+':')===0?esc(r.run):esc(r.lane)+' &middot; '+esc(r.run);
var steps=(r.steps||[]).map(function(t,j){return "<div class='task repidea rstep' data-i='"+i+"' data-s='"+j+"'><span class='t'>"+esc(t)+"</span><button class='act rsgo' title='hand just this step to "+escQ(r.lane)+"&#39;s agent'>Hand to agent</button><button class='ghost rsdone' title='already done: take it off this list'>Done</button><button class='ghost rsdrop' title='not worth doing: take it off this list'>Drop</button></div>";}).join('');
var ok=r.draft&&r.needs==='draft'&&!r.computer?"<div class='row' style='margin:2px 0 6px 12px'><button class='act rsapprove' data-i='"+i+"'>Approve</button></div>":'';
var all=(r.steps||[]).length>1?"<div class='row' style='margin:2px 0 6px'><button class='ghost rsall' data-i='"+i+"'>Hand all to agents</button></div>":'';
return "<div class='rwrap'>"+rowHtml(r,i,where)+(r.computer?'':ok+(steps?"<div class='rsteps' style='margin-left:12px'>"+steps+all+"</div>":''))+"<div class='rsmsg muted' style='font-size:12px;margin-left:12px'></div></div>";};
var rowHtml=function(r,i,where){
return "<div class='task rrow"+(r.new?" rnew":"")+"' data-i='"+i+"' tabindex='0' role='button' title='"+escQ(r.file)+"'><span class='t'><b>"+esc(r.title)+"</b><div class='muted' style='font-size:12px'>"+(r.new?"<span style='color:var(--amber)'>unread</span> &middot; ":"")+(r.needs==='draft'?"<span style='color:var(--amber)'>waiting for your OK</span> &middot; ":r.needs==='ideas'?"<span style='color:var(--amber)'>"+r.ideas+(r.ideas===1?" next step":" next steps")+"</span> &middot; ":"")+where+" &middot; "+esc(r.name)+" &middot; "+kb(r.size)+(r.computer?" &middot; from "+esc(r.computer):"")+(r.running?" &middot; <span style='color:var(--amber)'>its agent is still writing</span>":"")+"</div></span><span class='rp'>"+agoTxt(r.mtime)+"</span></div>";};
var tabOf=function(r){return r.new?'unread':r.needs?'action':'read';};
var cnt={unread:0,action:0,read:0};REPS.forEach(function(r){cnt[tabOf(r)]++;});
var TABS=[['unread','Unread'],['action','Read, open actions'],['read','Read and done']];
el.innerHTML="<div class='rtabs' id='reptabs' role='tablist'>"+TABS.map(function(t){return "<button class='tab"+(REPTAB===t[0]?" active":"")+"' role='tab' data-t='"+t[0]+"'>"+t[1]+" &middot; "+cnt[t[0]]+"</button>";}).join('')+(cnt.unread?"<button class='ghost' id='reportsseen' style='margin-left:auto;padding:3px 9px;font-size:12px;letter-spacing:0;text-transform:none;align-self:center'>Mark all read</button>":"")+"</div>"+
((function(){var by={},order=[];REPS.forEach(function(r,i){if(tabOf(r)!==REPTAB)return;if(!by[r.lane]){by[r.lane]=[];order.push(r.lane);}by[r.lane].push(row(r,i));});return order.map(function(l){return "<div class='tgroup' style='margin-top:14px'>"+esc(l)+" <span class='tcount'>"+by[l].length+"</span></div>"+by[l].join('');}).join('');})()||"<div class='muted' style='margin-top:12px'>Nothing here.</div>");
el.querySelectorAll('#reptabs .tab').forEach(function(b){b.addEventListener('click',function(){REPTAB=b.getAttribute('data-t');renderReports();});});
el.querySelectorAll('.rrow').forEach(function(row){var go=function(){openReport(REPS[+row.getAttribute('data-i')]);};row.addEventListener('click',go);row.addEventListener('keydown',function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();go();}});});
el.querySelectorAll('.rwrap button').forEach(function(b){b.addEventListener('click',function(ev){ev.stopPropagation();repRowAct(b);});});
var s=$('reportsseen');if(s)s.addEventListener('click',function(){s.disabled=true;api('/api/reports/seen',{}).then(function(){loadReports();lqLoad(false);});});}
// A step's buttons, on its row: Hand to agent (its lane's Workdesk), Done, Drop; Hand all; and Approve on a draft.
// The row drops what was dealt with at once; a report with no step left moves to Read and done by itself.
function repRowAct(b){var w=b.closest('.rwrap'),msg=w.querySelector('.rsmsg'),r=REPS[+b.getAttribute('data-i')||+(b.closest('[data-i]')||{getAttribute:function(){return -1;}}).getAttribute('data-i')];if(!r)return;
var say=function(t,bad){msg.innerHTML=bad?"<span style='color:var(--red,#e66)'>"+esc(t)+"</span>":esc(t);};
var btns=w.querySelectorAll('button');btns.forEach(function(x){x.disabled=true;});var fail=function(e){btns.forEach(function(x){x.disabled=false;});say(String((e&&e.error)||(e&&e.message)||e||'failed'),true);};
var cls=b.className,step=b.closest('.rstep'),t=step?r.steps[+step.getAttribute('data-s')]:null,call,left;
if(/rsapprove/.test(cls)){api('/api/reports/draft',{id:r.id,approve:true}).then(function(x){if(!x||x.error)return fail(x);r.needs='';r.steps=[];renderReports();lqLoad(false);}).catch(fail);return;}
if(/rsall/.test(cls)){call=api('/api/reports/ideas',{id:r.id,ideas:r.steps});left=[];}
else if(/rsgo/.test(cls)){call=api('/api/reports/ideas',{id:r.id,ideas:[t]});left=r.steps.filter(function(x){return x!==t;});}
else{call=api('/api/reports/dismiss',{id:r.id,ideas:[t],done:/rsdone/.test(cls)});left=r.steps.filter(function(x){return x!==t;});}
call.then(function(x){if(!x||x.error)return fail(x);r.steps=left;r.ideas=left.length;if(!left.length&&r.needs==='ideas')r.needs='';renderReports();lqLoad(false);}).catch(fail);}
// The way back sits at the top of the report itself (#reportview), so it stays in view, under
// the page's header, however long the report: on a long one the list was a long scroll up away.
function openReport(r){if(!r)return;REPOPEN=r.id;var w=$('reportview');$('reportslist').innerHTML='';
w.innerHTML="<div class='rbackbar' id='rbackbar'><button class='ghost' id='reportback'>&larr; All reports</button><span class='muted rbpath' title='"+escQ(r.file)+"'><bdi>"+esc(r.file)+"</bdi></span></div><div id='reportbody'><div class='out rdoc muted'>Opening&hellip;</div></div>";var v=$('reportbody');
$('reportback').addEventListener('click',function(){loadReports();renderReports();});repStick();
api('/api/reports/read?id='+encodeURIComponent(r.id)).then(function(d){if(REPOPEN!==r.id)return;if(!d||d.error){v.innerHTML="<div class='note err'>"+esc((d&&d.error)||'failed')+"</div>";return;}
v.innerHTML="<div class='out rdoc'>"+d.html+"</div>"+(d.remote?"":repActsHtml(d));repImgs(v);if(!d.remote)repActsWire(v,d);repStick();var m=document.querySelector('main');if(m&&m.scrollTo)m.scrollTo(0,0);lqLoad(false);}).catch(function(e){v.innerHTML="<div class='note err'>"+esc(String((e&&e.message)||e))+"</div>";});}
// A card's "Read the report": Reports, open on that one (its list when it's gone).
function showReport(id){lqPool('reports');REPOPEN=String(id||'');api('/api/reports').then(function(d){REPS=(d&&d.reports)||[];var r=REPS.filter(function(x){return x.id===id;})[0];if(r)openReport(r);else renderReports();}).catch(function(){REPOPEN='';loadReports();});}
$('reportsrefresh').addEventListener('click',function(){REPOPEN='';loadReports();});
// where the way back sticks: just under the page's own sticky header (#lqsinkrow), whatever its height
function repStick(){var b=$('rbackbar');if(!b)return;var s=$('lqsinkrow'),cs=s&&getComputedStyle(s),top=cs&&cs.position==='sticky'&&cs.display!=='none'?(parseFloat(cs.top)||0)+s.offsetHeight-1:0;b.style.setProperty('--rbtop',top+'px');}
if(window.addEventListener)window.addEventListener('resize',repStick);if(window.ResizeObserver&&$('lqsinkrow'))new ResizeObserver(repStick).observe($('lqsinkrow'));
// Its end: 2-4 ideas drawn from it, ticked straight onto the Workdesk in its lane, and a box
// to ask about it here (home.mjs reportIdeasAdd, reportAsk); a draft gets Approve / Reject.
// A report's images: their src carries the token; one that won't load says so; a click enlarges it.
function repImgs(v){v.querySelectorAll('img.rimg').forEach(function(im){im.addEventListener('error',function(){var s=document.createElement('span');s.className='rimgmiss';s.textContent='\u{1F5BC} Image missing: '+(im.alt||'')+' \u00b7 '+decodeURIComponent((im.getAttribute('data-src').split('&src=')[1]||''));im.replaceWith(s);});
im.addEventListener('click',function(){var z=document.createElement('div');z.className='rzoom';var b=document.createElement('img');b.src=im.src;b.alt=im.alt;z.appendChild(b);z.addEventListener('click',function(){z.remove();});document.addEventListener('keydown',function k(e){if(e.key==='Escape'){z.remove();document.removeEventListener('keydown',k);}});document.body.appendChild(z);});
im.src=im.getAttribute('data-src')+'&t='+encodeURIComponent(T);});}
function repActsHtml(d){var lane=d.lane==='ops'?'ops':esc(d.lane||'its lane'),h="<div class='out rdoc repacts'>";
if((d.cards||[]).length)h+="<div class='pshead'><span>"+(d.cards.length>1?'Drafts':'Draft')+" in this report, for your OK</span><small>exactly as "+(d.cards.length>1?'they':'it')+" will look when posted</small></div>"+d.cards.map(function(rel){return "<div class='mkpv repcard' data-rel='"+escQ(rel)+"'></div>";}).join('');
if(d.draft)h+="<div class='pshead'><span>This is a draft</span><small>"+(d.decided?"you "+esc(d.decided)+" it":"only you decide: its agent goes ahead once you approve")+"</small></div><div class='row'><button class='act repdraft' data-ok='1'>Approve</button><button class='ghost repdraft' data-ok=''>Reject</button></div>";
else if((d.ideas||[]).length)h+="<div class='pshead'><span>Ideas from it</span><small>tick any to put them on the Workdesk, in "+lane+"</small></div>"+d.ideas.map(function(t,i){return "<div class='task repidea'><label style='display:flex;gap:8px;flex:1'><input type='checkbox' data-i='"+i+"'"+(i<3?" checked":"")+"> <span class='t'>"+esc(t)+"</span></label><button class='act repone' data-i='"+i+"' title='put just this one on the Workdesk, in "+lane+"'>Hand to "+lane+"</button><button class='ghost repno' data-i='"+i+"' title='not worth doing: take it off this list'>Dismiss</button></div>";}).join('')+"<div class='row'><button class='ghost repadd'>Add the ticked ones</button></div>";
else if(d.handled&&Object.keys(d.handled).length)h+="<div class='muted' style='font-size:12px'>Every next step in it is handed over, done, dropped or superseded, so it sits under Read.</div>";
if(!d.draft&&d.handled&&Object.keys(d.handled).length&&(d.ideas||[]).length)h+="<div class='muted' style='font-size:12px;margin-top:6px'>Already dealt with: "+Object.keys(d.handled).map(function(k){return esc(k)+" ("+(d.handled[k]==='handed'?'handed over':d.handled[k]==='superseded'?'superseded':d.handled[k]==='done'?'done':'dismissed')+")";}).join('; ')+"</div>";
h+="<form class='row repask' style='margin-top:12px'><input class='repq' autocomplete='off' maxlength='2000' placeholder='Ask Symbiot about this report&hellip;' style='flex:1'><button type='submit' class='ghost'>Ask</button></form><div class='repmsg'></div></div>";return h;}
function repActsWire(v,d){var msg=v.querySelector('.repmsg'),say=function(k,t){msg.innerHTML="<div class='note "+k+"'>"+t+"</div>";};
v.querySelectorAll('.repcard').forEach(function(b){mkPreview(b,b.getAttribute('data-rel'));});
var add=v.querySelector('.repadd');if(add)add.addEventListener('click',function(){var picks=[];v.querySelectorAll('.repidea input').forEach(function(c){if(c.checked)picks.push(d.ideas[+c.getAttribute('data-i')]);});if(!picks.length){say('err','Tick an idea first.');return;}add.disabled=true;
api('/api/reports/ideas',{id:d.id,ideas:picks}).then(function(r){add.disabled=false;if(!r||r.error){say('err',esc((r&&r.error)||'failed'));return;}say('ok',esc(r.said));lqLoad(false);}).catch(function(e){add.disabled=false;say('err',esc(String((e&&e.message)||e)));});});
v.querySelectorAll('.repone,.repno').forEach(function(b){b.addEventListener('click',function(){var t=d.ideas[+b.getAttribute('data-i')],row=b.closest('.repidea'),btns=row.querySelectorAll('button');if(!t)return;btns.forEach(function(x){x.disabled=true;});
api(b.classList.contains('repone')?'/api/reports/ideas':'/api/reports/dismiss',{id:d.id,ideas:[t]}).then(function(r){if(!r||r.error){btns.forEach(function(x){x.disabled=false;});say('err',esc((r&&r.error)||'failed'));return;}row.style.opacity='.5';row.querySelector('input').checked=false;row.querySelector('input').disabled=true;say('ok',esc(r.said)+' It moves to Read once all its next steps are dealt with.');if(b.classList.contains('repone'))lqLoad(false);}).catch(function(e){btns.forEach(function(x){x.disabled=false;});say('err',esc(String((e&&e.message)||e)));});});});
v.querySelectorAll('.repdraft').forEach(function(b){b.addEventListener('click',function(){var ok=!!b.getAttribute('data-ok');v.querySelectorAll('.repdraft').forEach(function(x){x.disabled=true;});
api('/api/reports/draft',{id:d.id,approve:ok}).then(function(r){if(!r||r.error){v.querySelectorAll('.repdraft').forEach(function(x){x.disabled=false;});say('err',esc((r&&r.error)||'failed'));return;}say('ok',esc(r.said));}).catch(function(e){say('err',esc(String((e&&e.message)||e)));});});});
var f=v.querySelector('.repask');if(f)f.addEventListener('submit',function(ev){ev.preventDefault();var q=f.querySelector('.repq'),bt=f.querySelector('button');if(!q.value.trim()){q.focus();return;}bt.disabled=true;say('muted','Thinking&hellip;');
api('/api/reports/ask',{id:d.id,question:q.value}).then(function(r){bt.disabled=false;if(!r||r.error){say('err',r&&r.error==='not-connected'?'Connect an AI in Settings to ask about it.':esc((r&&r.error)||'failed'));return;}msg.innerHTML="<div class='out' style='white-space:pre-wrap'>"+esc(r.answer||'')+"</div>";q.value='';lqLoad(false);}).catch(function(e){bt.disabled=false;say('err',esc(String((e&&e.message)||e)));});});}
// ---- the Dashboard as a stream ----------------------------------------------------
// Time runs left to right, one current per feed, "now" on the right. Each message
// is a bead placed when it arrived: amber and bigger when it needs you, small when
// read. A bead opens a popover with that message's own actions (the same buttons as
// the list below, wired by renderBoard's wire, each time it's drawn); a feed's name
// carries its Seen (its beads leave the stream: what's seen isn't waiting), Talk and
// Check now. Drawn in the look's liquid, with its own canvas.
var BS={G:null,beads:[],hot:null,on:false,b:null},BWIRE=null;
// A feed's short name: "Inbox - you@x.com - x Mail" reads as Inbox, with the address under it.
function bsName(c){var parts=String(c.name||'').split(' - '),acct=parts.filter(function(x){return x.indexOf('@')>=0;})[0]||'';return {n:parts[0]||c.name||'',sub:acct};}
function bsGeom(){var el=$('bstream'),w=(el&&el.clientWidth)||900,n=((BS.b&&BS.b.cards)||[]).length,narrow=w<720;
return {w:w,h:Math.max(300,80+n*118+44),x0:narrow?130:220,x1:w-(narrow?36:280),narrow:narrow,n:n};}
function bsBuild(b){BS.b=b;var ov=$('bsov'),el=$('bstream');if(!ov||!el)return;var cs=b.cards||[];if(!cs.length){ov.innerHTML='';return;}
var g=bsGeom();BS.gw=g.w;if(el.style)el.style.height=g.h+'px';var now=Date.now(),H=(b.hours||24)*3600000,laneY=function(i){return 60+(g.h-110)*(i+0.5)/Math.max(1,g.n);};
// every lane's line in one drawing, the same for each feed: none can come out without its line
var html="<svg class='blines' width='"+g.w+"' height='"+g.h+"' aria-hidden='true'><defs><linearGradient id='bslg' gradientUnits='userSpaceOnUse' x1='"+(g.x0-24)+"' x2='"+g.x1+"'><stop offset='0' stop-color='currentColor' stop-opacity='0'/><stop offset='.06' stop-color='currentColor' stop-opacity='.12'/><stop offset='.94' stop-color='currentColor' stop-opacity='.12'/><stop offset='1' stop-color='currentColor' stop-opacity='0'/></linearGradient></defs>"+cs.map(function(c,i){return "<rect class='bline' x='"+(g.x0-24)+"' y='"+Math.round(laneY(i))+"' width='"+(g.x1-g.x0+24)+"' height='1' fill='url(#bslg)'/>";}).join('')+"</svg>";
cs.forEach(function(c,i){var y=laneY(i);
var nm=bsName(c);html+="<div class='bcard blane' data-i='"+i+"' style='top:"+Math.round(y)+"px'><div class='bln' title='"+esc(c.name+(c.url?' \u00b7 '+c.url:''))+"'>"+esc(nm.n)+"</div>"+(nm.sub?"<div class='blsub'>"+esc(nm.sub)+"</div>":"")+"<div class='blc' title='"+(c.checked?"read "+agoTxt(c.checked):"")+"'>"+(c.count?"<b>"+esc(c.label)+"</b>":"quiet")+"</div><div class='bla'>"+(c.count?"<button class='bseen' title='set this feed back to 0: only what comes in after counts'>Seen</button>":"")+"<button class='btalkbtn' title='talk what&#39;s new here over with your AI before you draft a reply'>Talk"+((c.chat||[]).length?" "+Math.ceil(c.chat.length/2):"")+"</button><button class='bcheck' title='read it now'>Check now</button></div>"+(c.error?"<div class='ble'>"+esc(c.error)+"</div>":"")+"</div>";
if(c.brief&&!g.narrow)html+="<div class='blb' style='top:"+Math.round(y)+"px'>"+esc(c.brief.text.length>150?c.brief.text.slice(0,149)+'…':c.brief.text)+"</div>";});
var marks=b.hours===24?[18,12,6]:b.hours===72?[48,24]:[120,72,24];
marks.forEach(function(m){html+="<span class='btick' style='left:"+Math.round(g.x0+(1-m/(b.hours||24))*(g.x1-g.x0))+"px'>"+(m<48?m+'h ago':Math.round(m/24)+' days ago')+"</span>";});
html+="<span class='btick' style='left:"+g.x1+"px'>now</span><div class='bnow' style='left:"+g.x1+"px'></div>";
var old={};BS.beads.forEach(function(x){old[x.key]=x;});BS.beads=[];
cs.forEach(function(c,i){(c.items||[]).forEach(function(n,j){var age=Math.max(0,now-(n.ts||now));if(age>H)return;var key=c.id+':'+(n.id||j),o=old[key];
BS.beads.push({key:key,i:i,j:j,n:n,need:!!n.need&&!!(n.mail||n.chat),tx:g.x0+(1-age/H)*(g.x1-g.x0),ty:laneY(i),tr:n.need&&(n.mail||n.chat)?13:n.read?6:9,x:o?o.x:g.x1,y:o?o.y:laneY(i),r:o?o.r:0});});
});
html+=BS.beads.map(function(x,k){return "<button type='button' class='bbead' data-k='"+k+"' aria-label='"+esc(x.n.text||'')+"'></button>";}).join('');
var byLane={};BS.beads.forEach(function(x){(byLane[x.i]=byLane[x.i]||[]).push(x);});Object.keys(byLane).forEach(function(k){var L=byLane[k].slice().sort(function(a,b){return a.tx-b.tx;}),run=0;for(var q=1;q<L.length;q++){if(L[q].tx-L[q-1].tx<26){run++;L[q].ty+=(run%2?-1:1)*Math.ceil(run/2)*20;}else run=0;}});
var ml=bsMailLane();BS.waits=[];if(ml>=0)(AWAITS||[]).forEach(function(w,k){if(w.status!=='waiting'&&!(w.reply&&now-w.reply.ts<H))return;var sent=w.sent||now,age=Math.max(0,now-sent),x=g.x0+(1-Math.min(age,H)/H)*(g.x1-g.x0),y=laneY(ml)+(k%2?14:-14);BS.waits.push({w:w,x:x,y:y});
html+=(w.status==='waiting'?"<div class='bwthread' style='left:"+Math.round(x)+"px;width:"+Math.max(0,Math.round(g.x1-x))+"px;top:"+Math.round(y)+"px'></div>":"")+"<button type='button' class='bwait"+(w.status==='waiting'?'':' in')+(age>H?' early':'')+"' data-w='"+(BS.waits.length-1)+"' style='left:"+Math.round(x)+"px;top:"+Math.round(y)+"px' aria-label='"+escQ((w.status==='waiting'?'waiting on a reply from ':'reply in from ')+(w.to||[]).join(', '))+"'></button>";});
html+="<div class='btip' role='dialog' aria-live='polite'></div>";ov.innerHTML=html;
ov.querySelectorAll('.bwait').forEach(function(b){var i=+b.getAttribute('data-w');b.addEventListener('pointerenter',function(){bsShowWait(i);});b.addEventListener('focus',function(){bsShowWait(i);});b.addEventListener('click',function(){bsShowWait(i);});});
BS.btns=[];ov.querySelectorAll('.bbead').forEach(function(bt){BS.btns.push(bt);var k=+bt.getAttribute('data-k');bt.addEventListener('pointerenter',function(){bsShow(k);});bt.addEventListener('focus',function(){bsShow(k);});bt.addEventListener('click',function(){bsShow(k);});});
if(el.addEventListener&&!BS.wired){BS.wired=true;el.addEventListener('pointerleave',function(){bsShow(null);});el.addEventListener('keydown',function(e){if(e&&e.key==='Escape')bsShow(null);});}
if(BWIRE)BWIRE(ov);BS.hot=null;bsStart();}
function bsShowWait(i){var tip=document.querySelector('#bsov .btip'),x=BS.waits&&BS.waits[i];if(!tip||!x)return;BS.hot=null;BS.hotWait=i;var w=x.w,who=(w.to||[]).join(', ')||'?';
tip.innerHTML="<div class='bcard'><div class='bi'><div class='btf'>"+(w.status==='waiting'?'Waiting on a reply':'Reply in')+" <span>&middot; "+esc(who)+" &middot; "+(w.status==='waiting'?'sent '+agoTxt(w.sent):agoTxt(w.reply&&w.reply.ts))+"</span></div><div class='btx'>"+esc(w.subject||'')+(w.asked?"<div class='bwask'>Asked for: "+esc(w.asked)+"</div>":"")+(w.handed&&w.status!=='waiting'?"<div class='bwask'>"+(w.handed==='ops'?'An agent':esc(w.handed)+'&#39;s agent')+" has the next step.</div>":"")+(w.error?"<div class='bwask err'>"+esc(w.error)+"</div>":"")+"</div><div class='bta'>"+(w.status==='waiting'?"<button class='quiet bwstop'>Stop waiting</button><span class='bwnote'>Symbiot watches your inbox for it, and hands it on when it's in.</span>":"")+"</div></div></div>";tip.className='btip on';
var st=tip.querySelector('.bwstop');if(st)st.addEventListener('click',function(){st.disabled=true;api('/api/awaiting/stop',{id:w.id}).then(function(r){if(!r||r.error){st.disabled=false;boardMsg('err',esc((r&&r.error)||'failed'));return;}bsShow(null);loadAwaiting();});});}
function bsShow(k){var tip=document.querySelector('#bsov .btip');if(!tip)return;BS.hot=k;BS.hotWait=null;if(k==null||!BS.beads[k]){tip.className='btip';return;}
var x=BS.beads[k],c=BS.b.cards[x.i],n=x.n;tip.innerHTML="<div class='bcard' data-i='"+x.i+"'><div class='bi' data-j='"+x.j+"'><div class='btf'>"+esc(n.name||bsName(c).n)+" <span>&middot; "+esc(bsName(c).n)+" &middot; "+agoTxt(n.ts)+(n.from&&CHATFROM[n.from]?" &middot; "+CHATFROM[n.from]:"")+(n.read?" &middot; read":"")+"</span></div><div class='btx'>"+esc(n.text||'')+"</div><div class='bta'>"+(n.mail||n.chat?"<button class='bdraft'>"+(n.drafted?"Drafted &middot; again":"Draft a reply")+"</button>":"")+(n.href?"<button class='bopen"+(n.mail||n.chat?" quiet":"")+"'>Open</button>":"")+(n.chat&&n.drafted?"<button class='bopenwa quiet'>Open in WhatsApp</button>":"")+"</div></div></div>";
tip.className='btip on';if(BWIRE)BWIRE(tip);}
function bsStart(){if(BS.on)return;var raf=typeof window.requestAnimationFrame==='function'?function(f){return window.requestAnimationFrame(f);}:null;if(!raf)return;BS.on=true;
var loop=function(){var p=$('panel-board'),el=$('bstream');if(!p||!el||!p.offsetParent||(el.classList&&el.classList.contains('none'))){BS.on=false;return;}BS.fr=(BS.fr||0)+1;if(BS.fr%glEvery(true)===0)bsFrame();raf(loop);};raf(loop);}
function bsFrame(){var el=$('bstream'),cv=$('bsc');if(!el||!cv)return;if(!BS.G)BS.G=lqGL(cv,40);var g=bsGeom();if(BS.b&&BS.gw!==g.w){bsBuild(BS.b);g=bsGeom();}var t=LQ.t||0,still=LQ.theme&&LQ.theme.still;
BS.beads.forEach(function(x,k){var hot=BS.hot===k;x.x+=(x.tx-x.x)*0.12;x.y+=((x.ty+(still?0:Math.sin(t*0.8+k*1.3)*2))-x.y)*0.12;x.r+=((x.tr*(hot?1.35:1))-x.r)*0.15;
var bt=BS.btns&&BS.btns[k];if(bt&&bt.style){var R=Math.max(14,x.r+6);bt.style.width=bt.style.height=(2*R)+'px';bt.style.transform='translate('+Math.round(x.x-R)+'px,'+Math.round(x.y-R)+'px)';}});
var tip=document.querySelector('#bsov .btip');if(tip&&BS.hotWait!=null&&BS.waits&&BS.waits[BS.hotWait]){var wx=BS.waits[BS.hotWait],tw2=tip.offsetWidth||300,th2=tip.offsetHeight||140,tx2=Math.max(12,Math.min(g.w-tw2-12,wx.x-tw2/2)),ty2=wx.y-th2-16;if(ty2<8)ty2=wx.y+16;tip.style.transform='translate('+Math.round(tx2)+'px,'+Math.round(ty2)+'px)';}
else if(tip&&BS.hot!=null&&BS.beads[BS.hot]){var x=BS.beads[BS.hot],tw=tip.offsetWidth||300,th=tip.offsetHeight||120,tx=Math.max(12,Math.min(g.w-tw-12,x.x-tw/2)),ty=x.y-x.r-th-14;if(ty<8)ty=x.y+x.r+14;tip.style.transform='translate('+Math.round(tx)+'px,'+Math.round(ty)+'px)';}
var G=BS.G;if(!G)return;var gl=G.gl,d=glDpr(3),W=Math.max(1,Math.floor(g.w*d)),H=Math.max(1,Math.floor(g.h*d));if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;gl.viewport(0,0,W,H);}
var o=G.out;for(var i=0;i<o.length;i++)o[i]=0;var k=0,put=function(px,py,r,a){if(k>=40)return;o[k*4]=px/g.w;o[k*4+1]=py/g.h;o[k*4+2]=Math.max(0,r);o[k*4+3]=a;k++;};
(BS.b.cards||[]).forEach(function(c,i){put(g.x1,60+(g.h-110)*(i+0.5)/Math.max(1,g.n),c.count?9+2*Math.min(c.count,6):5,0);});
BS.beads.forEach(function(x){put(x.x,x.y,x.r,x.need?1:0);});
var th=LQ.theme||{},U=G.U;gl.uniform2f(U.uRes,W,H);gl.uniform1f(U.uT,t);gl.uniform1f(U.uDpr,d);gl.uniform4fv(U.uB,o);gl.uniform3f(U.uRip,0,0,-10);gl.uniform1f(U.uStyle,th.look==='glass'?0:th.look==='pearl'?2:1);gl.uniform1f(U.uContrast,th.contrast?1:0);gl.uniform1f(U.uExposure,th.night?0.82:1);gl.drawArrays(gl.TRIANGLES,0,3);}
function renderBoard(){var b=BOARD,cs=b.cards,el=$('board');
// on a phone paired with your computer: the computer's cards, read here; Seen, Talk and Check now are the computer's (phone.mjs boardForPhone)
if(el.classList)el.classList.toggle('pcboard',!!b.computer);
if(b.computer&&!cs.length){$('boardsum').textContent='What '+b.computer+' watches, side by side.';el.innerHTML="<div style='grid-column:1/-1'><div class='note muted' style='margin-top:0'>Nothing is watched on "+esc(b.computer)+" yet. What it watches (your inbox, a chat, GitHub) shows here once it does.</div></div>";return;}
var tab=$('boardtab');if(tab)tab.textContent='Dashboard'+(b.total?' · '+b.total:'');
var bst=$('bstream');if(bst&&bst.classList)bst.classList.toggle('none',!cs.length);var bl=$('blist');if(bl&&!cs.length)bl.open=true;
if(!cs.length){$('boardsum').textContent='Everything you watch, side by side.';
el.innerHTML="<div style='grid-column:1/-1'><div class='note muted' style='margin-top:0'>Nothing watched yet. Map your inbox, a chat (web.whatsapp.com) or any page under <b>Screens</b> on the Map tab and click <b>Watch</b> on it, or click <b>Watch GitHub</b> there. Each one gets a card here with what's new on it.</div><div class='row' style='margin-top:8px'><button class='ghost' id='boardgo'>Go to Screens</button></div></div>";
$('boardgo').addEventListener('click',function(){setTab('map');var sbx=$('screensbox');if(sbx)sbx.open=true;var w=$('watchbox');if(w&&w.scrollIntoView)w.scrollIntoView({block:'center'});});return;}
var when=b.hours===24?'since yesterday':b.hours===72?'in the last 3 days':'in the last 7 days';
var lastRead=0;cs.forEach(function(c){if(c.checked>lastRead)lastRead=c.checked;});var sub=$('boardsub');if(sub)sub.textContent=(b.computer?'On '+b.computer+' \u00b7 ':'')+(lastRead?'Read '+agoTxt(lastRead)+' \u00b7 ':'')+cs.length+(cs.length===1?' feed':' feeds')+bsWaitWord();
var waiting=cs.filter(function(c){return c.count;}).map(function(c){return c.label+(c.source==='page'?' on '+c.name:'');});
$('boardsum').innerHTML=waiting.length?"<b style='color:var(--bone)'>Waiting on you "+when+":</b> "+esc(waiting.join(', ')):"Nothing new "+when+" on the "+cs.length+" thing"+(cs.length===1?"":"s")+" you watch.";
el.innerHTML=cs.map(function(c,i){var nt=Math.ceil(((c.chat||[]).length)/2);
return "<div class='bcard"+(c.count?" has":"")+"' data-i='"+i+"'><div class='bh'><span class='bn' title='"+esc(c.url)+"'>"+esc(bsName(c).n)+"</span>"+(c.count?"<button class='ghost bseen' title='set this card back to 0: only what comes in after counts. It stays under Watching, and the other cards keep theirs' style='padding:4px 9px;font-size:12px'>Seen</button>":"")+"<button class='ghost btalkbtn' title='talk what&#39;s new here over with your AI before you draft a reply' style='padding:4px 9px;font-size:12px'>Talk"+(nt?" "+nt:"")+"</button><button class='ghost bcheck' title='read it now' style='padding:4px 9px;font-size:12px'>Check now</button></div>"
+"<div class='bc'>"+c.count+"</div><div class='bl'>"+esc(c.count?c.label.replace(/^\\d+ /,''):'nothing new')+" &middot; "+(c.checked?"read "+agoTxt(c.checked):c.last?"tried "+agoTxt(c.last):"first read within a minute")+(c.via==='gh'?" &middot; through gh":"")+"</div>"
+(c.error?"<div class='note err'>"+esc(c.error)+"</div>":"")
+(c.brief?"<div class='bbrief'>"+esc(c.brief.text)+"</div>":"")
+c.items.map(function(n,j){return "<div class='bi' data-j='"+j+"'><span class='t'>"+esc(n.text)+" <span class='muted' style='font-size:11px'>"+agoTxt(n.ts)+(n.from&&CHATFROM[n.from]?" &middot; "+CHATFROM[n.from]:"")+(n.read?" &middot; read":"")+"</span>"+custTag(n)+"</span>"+(n.href?"<button class='ghost bopen' title='open it in your browser'>Open</button>":"")+(n.mail||n.chat||n.social?"<button class='ghost bdraft' title='"+(n.chat?DRAFT_CHAT_TIP:n.social?DRAFT_SOCIAL_TIP:"your coding agent writes a reply and leaves it in Drafts. It never presses Send")+"'>"+(n.drafted?"Drafted &middot; again":"Draft a reply")+"</button>":"")+(n.chat&&n.drafted?"<button class='ghost bopenwa' title='"+OPEN_WA_TIP+"'>Open in WhatsApp</button>":"")+"</div>";}).join('')
+(c.count>c.items.length?"<div class='bl' style='margin-top:6px'>&hellip;and "+(c.count-c.items.length)+" more</div>":"")
+"</div>";}).join('');
var tk=$('boardtalk');if(tk)tk.innerHTML=cs.map(function(c,i){var nt=Math.ceil(((c.chat||[]).length)/2);return BTALK[c.id]?"<div class='bcard' data-i='"+i+"'><div class='bh'><span class='bn'>Talking over "+esc(c.name)+"</span><button class='ghost btalkbtn' style='padding:4px 9px;font-size:12px'>Close</button></div><div class='tchat btalk'><div class='msgs'>"+(nt?chatMsgs(c.chat):TALKHINT)+"</div><div class='row'><input class='talkq' placeholder='Ask about these, or say how to answer one...' style='flex:1'><button class='ghost talksend'>Ask</button><a class='talkclear' title='forget this conversation'>clear</a></div></div></div>":"";}).join('');
BWIRE=wire;bsBuild(b);
function card(btn){return cs[+btn.closest('.bcard').getAttribute('data-i')];}
function wire(el){if(!el||!el.querySelectorAll)return;
el.querySelectorAll('.btalkbtn').forEach(function(btn){btn.addEventListener('click',function(){var c=card(btn);BTALK[c.id]=!BTALK[c.id];renderBoard();var tk2=$('boardtalk'),q=BTALK[c.id]&&tk2&&tk2.querySelector(".bcard[data-i='"+cs.indexOf(c)+"'] .talkq");if(q&&q.focus)q.focus();});});
el.querySelectorAll('.btalk').forEach(function(box){var c=card(box),inp=box.querySelector('.talkq'),send=box.querySelector('.talksend'),msgs=box.querySelector('.msgs');
inp.value=BTALKDRAFT[c.id]||'';inp.addEventListener('input',function(){BTALKDRAFT[c.id]=inp.value;});
function ask(){var q=(inp.value||'').trim();if(!q||send.disabled)return;send.disabled=true;inp.value='';BTALKDRAFT[c.id]='';BTALKBUSY++;
if(!(c.chat&&c.chat.length))msgs.innerHTML='';
msgs.insertAdjacentHTML('beforeend',chatMsgs([{role:'user',text:q}])+"<div class='msg a muted thinking'>Thinking&hellip;</div>");
function done(){BTALKBUSY=Math.max(0,BTALKBUSY-1);send.disabled=false;var th=msgs.querySelector('.thinking');if(th)th.remove();}
api('/api/watch/chat',{id:c.id,question:q}).then(function(r){done();
if(r.error==='not-connected'){msgs.insertAdjacentHTML('beforeend',"<div class='msg a'>Connect a model in Settings to talk it over - Ollama is free and runs locally.</div>");return;}
if(r.error){msgs.insertAdjacentHTML('beforeend',"<div class='msg a err'>"+esc(r.error)+"</div>");return;}
c.chat=r.chat||[];msgs.innerHTML=chatMsgs(c.chat);var tb=box.closest('.bcard').querySelector('.btalkbtn');if(tb)tb.innerHTML='<i class=ic-chat></i> '+Math.ceil(c.chat.length/2);}).catch(function(e){done();msgs.insertAdjacentHTML('beforeend',"<div class='msg a err'>"+esc(String((e&&e.message)||e))+"</div>");});}
send.addEventListener('click',ask);inp.addEventListener('keydown',function(e){if(e.key==='Enter')ask();});
box.querySelector('.talkclear').addEventListener('click',function(){api('/api/watch/chat/clear',{id:c.id}).then(function(){c.chat=[];msgs.innerHTML=TALKHINT;var tb=box.closest('.bcard').querySelector('.btalkbtn');if(tb)tb.innerHTML='<i class=ic-chat></i>';});});});
el.querySelectorAll('.bopenwa').forEach(function(btn){btn.addEventListener('click',function(){openChatUI(item(btn),btn,boardMsg);});});
function item(btn){return card(btn).items[+btn.closest('.bi').getAttribute('data-j')];}
el.querySelectorAll('.bcheck').forEach(function(btn){btn.addEventListener('click',function(){var c=card(btn);btn.disabled=true;btn.textContent='Reading…';
api('/api/watch/check',{id:c.id}).then(function(x){if(!x||x.error)boardMsg('err',esc((x&&x.error)||'failed'));else boardMsg(x["new"]&&x["new"].length?'ok':'muted',watchCheckMsg(c,x));loadWatchUI();}).catch(function(e){btn.disabled=false;btn.textContent='Check now';boardMsg('err',esc(String((e&&e.message)||e)));});});});
// Seen: its count and blobs go at once, and it's saved (watch.json), so only what comes in after counts
el.querySelectorAll('.bseen').forEach(function(btn){btn.addEventListener('click',function(){var c=card(btn);if(!c)return;btn.disabled=true;
b.total=Math.max(0,(b.total||0)-(c.count||0));c.count=0;c.items=[];delete c.brief;renderBoard();
api('/api/watch/seen',{id:c.id}).then(function(x){if(!x||x.error)boardMsg('err',esc((x&&x.error)||'failed'));else $('boardmsg').innerHTML='';loadBoard();lqLoad(false);}).catch(function(e){boardMsg('err',esc(String((e&&e.message)||e)));loadBoard();});});});
el.querySelectorAll('.bopen').forEach(function(btn){btn.addEventListener('click',function(){var n=item(btn);if(n&&/^https?:/.test(n.href))window.open(n.href,'_blank','noopener');});});
el.querySelectorAll('.bdraft').forEach(function(btn){btn.addEventListener('click',function(){var n=item(btn);btn.disabled=true;
api('/api/watch/draft',{id:n.id}).then(function(x){btn.disabled=false;if(!x||x.error){boardMsg('err',esc((x&&x.error)||'failed'));return;}boardMsg('ok',x.chat?DRAFTING_CHAT:x.social?DRAFTING_SOCIAL:DRAFTING);loadWatchUI();}).catch(function(e){btn.disabled=false;boardMsg('err',esc(String((e&&e.message)||e)));});});});}
wire(el);wire($('boardtalk'));}
$('boardrefresh').addEventListener('click',loadBoard);
if(document.addEventListener)document.addEventListener('click',function(ev){var t=ev&&ev.target;if(!t||!t.closest)return;var tx=t.closest('#panel-tasks .task .t');if(!tx||t.closest('a,button,input,textarea,summary'))return;var sel=window.getSelection?String(window.getSelection()):'';if(sel)return;var row=tx.closest('.task');if(row&&row.classList)row.classList.toggle('open');});
// a repo run's sandbox, under Symbiosis: on, or what this computer still needs for it (agents.mjs sandboxState)
function sandboxNote(r){var el=$('agentsandbox');if(!el)return;var b=r&&r.sandbox;if(!b||!r.full){el.innerHTML='';return;}
el.innerHTML=b.ready&&b.on?"<b>Sandboxed</b> &middot; a repo run&rsquo;s commands also write only in its repo, your folders and the npm and download caches, and can&rsquo;t reach your keys or step out of it. Ops runs, whose job is this computer, keep the membrane alone.":b.unsupported||!b.on?'':"<b>Not sandboxed yet</b> &middot; repo runs would also be held to their repo and your folders, but this computer needs "+b.missing.map(function(m){return '<code>'+esc(m)+'</code>';}).join(' and ')+" first (<code>sudo apt install "+esc(b.missing.map(function(m){return m==='bwrap'?'bubblewrap':m;}).join(' '))+"</code>). Until then they have the membrane.";}
var pcap=$('parcap');if(pcap&&pcap.addEventListener){var pnote=function(r){if(!r)return;pcap.value=r.setting;$('parnote').textContent=r.cap<r.setting?'Symbiot Free runs one agent at a time; Pro runs up to '+r.setting+'.':'';};api('/api/agent/parallel').then(pnote).catch(function(){});pcap.addEventListener('change',function(){api('/api/agent/parallel/set',{cap:Number(pcap.value)}).then(pnote);});}
var atr=$('agenttrust');if(atr&&atr.addEventListener){api('/api/agent/trust').then(function(r){if(r)atr.checked=!!r.full;sandboxNote(r);}).catch(function(){});atr.addEventListener('change',function(){api('/api/agent/trust/set',{full:atr.checked}).then(function(r){if(r)atr.checked=!!r.full;sandboxNote(r);});});}
var bw=$('boardwin');if(bw&&bw.querySelectorAll)bw.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){BOARDH=+b.getAttribute('data-h')||24;bw.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-checked',x===b?'true':'false');});loadBoard();});});
`;
