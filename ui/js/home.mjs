// symbiot — the liquid Home: zones, the needs-you band, agents at work, blobs, cards and their talk.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// ---- the liquid: the app's home ---------------------------------------------------
// One silver surface is the app. Its droplets: what only you can do, what's new on
// what you watch, and the parts of the app, sized and placed from how you use them
// (adapt.mjs: Fitts, Hick, hysteresis); filled from real data (home.mjs). Opening
// one pools it: that part's panel opens over the liquid. Droplets move as
// critically damped springs that push each other apart, and the liquid they hold
// comes out of the core (mass is conserved). Your colours come from the system,
// live: light or dark, contrast, transparency, forced colours, your accent, night.
var LQ={drops:[],btns:[],core:{x:0,y:0,cr:0},mode:'aware',last:'',lastAct:Date.now(),talk:[],talking:false,theme:{},ripple:[0.5,0.5,-10],t:0,pointer:null,touch:false,frame:0};
var LQNAMES={board:'Dashboard',map:'Map',tasks:'Workdesk',agents:'Workdesk',week:'Week',standup:'Standup',todo:'Todo',drift:'Drift',settings:'Settings',reports:'Reports',asks:'Questions',marketing:'Marketing',computer:'Your computer',vault:'Vault'};
var LQ_REST=60000,LQ_MAX=11;
function lqMM(q){try{return !!(window.matchMedia&&window.matchMedia(q).matches);}catch(e){return false;}}
function lqLookGet(){var l='';try{l=window.localStorage&&window.localStorage.getItem('symbiot-look')||'';}catch(e){}return l==='glass'||l==='pearl'?l:'ferro';}
function lqLook(l){try{if(window.localStorage)window.localStorage.setItem('symbiot-look',l);}catch(e){}lqTheme();lqIcon(l);api('/api/look',{look:l}).catch(function(){});var g=$('lqlook');if(g&&g.querySelectorAll)g.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-checked',b.getAttribute('data-look')===l?'true':'false');});LQ.ripple=[0.5,0.47,LQ.t||0];}
function lqTheme(){var look=lqLookGet();var th={look:look,light:look!=='ferro',contrast:lqMM('(prefers-contrast: more)'),forced:lqMM('(forced-colors: active)'),solid:lqMM('(prefers-reduced-transparency: reduce)'),still:lqMM('(prefers-reduced-motion: reduce)'),wide:lqMM('(color-gamut: p3)'),night:false,accent:null};
var h=new Date().getHours();th.night=h>=22||h<6;
try{if(document.createElement&&typeof getComputedStyle==='function'&&document.body&&document.body.appendChild){var a=document.createElement('span'),b=document.createElement('span');a.style.color='AccentColor';b.style.color='CanvasText';document.body.appendChild(a);document.body.appendChild(b);
if(a.style.color){var ca=getComputedStyle(a).color,cb=getComputedStyle(b).color;if(ca&&ca!==cb){var m=ca.match(/[0-9.]+/g);if(m&&m.length>=3)th.accent=[m[0]/255,m[1]/255,m[2]/255];}}a.remove();b.remove();}}catch(e){}
// the window's own bar takes the look's colour, so it reads as part of the app, not a frame round it
var tc=document.getElementById('themecolor');if(tc&&tc.setAttribute)tc.setAttribute('content',th.forced?'Canvas':look==='pearl'?'#ECEBE8':look==='glass'?'#E9ECEE':'#08090B');
var bd=document.body;if(bd&&bd.classList){bd.classList.toggle('lq-light',th.light);['ferro','glass','pearl'].forEach(function(l){bd.classList.toggle('lq-look-'+l,l===look);});bd.classList.toggle('lq-contrast',th.contrast);bd.classList.toggle('lq-solid',th.solid||th.contrast);bd.classList.toggle('lq-forced',th.forced);}
LQ.theme=th;return th;}
function lqSize(){var el=$('liquid');var w=(el&&el.clientWidth)||window.innerWidth||1280,h=(el&&el.clientHeight)||window.innerHeight||800;return {w:w,h:h,s:Math.max(0.55,Math.min(1.15,Math.min(w,h)/860))};}
function lqLoad(commit){if(LQ.scene==='work'){lqLoadWork();return;}var fresh=LQ.fresh;LQ.fresh=false;Promise.all([api('/api/adapt?from='+encodeURIComponent(LQ.last)+(commit?'&commit=1':'')+(LQ.touch?'&touch=1':'')),api('/api/home'+(fresh?'?fresh=1':''))]).then(function(r){LQ.adapt=r[0]||{};LQ.home=r[1]||{};lqRedraw();if(r[1]&&r[1].you)bdOrphans(r[1].you);}).catch(function(){});}
// A droplet's own place: a steady nudge in angle and distance from its id, so the
// layout reads as grown, not ruled, and stays put from one visit to the next.
// Home, in zones: what needs you in a band across the top (lqNeeds), then the app's
// parts by P.A.R.A., each group in its own part of the screen below it: Projects
// (work with an end) up left, Areas (what you keep up with) up right, Resources (to
// look things up in) down left, the Archive (what's done) sunk low; and what's new on
// what you watch (Watching) as a zone of its own on the right.
var PARA_OF={tasks:'p',agents:'p',todo:'p',marketing:'p',board:'a',week:'a',standup:'a',map:'r',drift:'r',settings:'r',reports:'r',vault:'r'};
var PARA_NAME={p:'Projects',a:'Areas',w:'Watching',r:'Resources',x:'Archive'},PARA_SUB={p:'work with an end',a:'what you keep up with',w:'new on what you watch',r:'to look things up in',x:'what’s done'};
var PARA_ANG={p:-2.55,a:-0.6,w:0.3,r:2.6,x:1.25},PARA_LIVE={p:0.45,a:0.3,w:0.3,r:0.12,x:0};
function lqPara(d){return d.kind==='you'?'n':d.band?'b':d.kind==='archive'?'x':d.kind==='feed'&&d.shape!=='reports'?'w':PARA_OF[d.shape]||'p';}
function lqParaGo(g){lqAct();if(g==='p'){lqWorkBy('project');return;}if(g==='a'||g==='w'){lqUse('board');lqPool('board');return;}if(g==='r'){lqUse('map');lqPool('map');return;}lqArchive();}
// The needs-you band: a lit orb per thing only you can do, its blob beside it (the
// project, the question, its two answers), as many across as fit, in a steady
// order (questions, then Approves, then first steps); the rest a page on.
var LQ_BLOBW=250,LQ_NEEDY=128;
function lqNeeds(h,S){var rank={ask:0,approve:1,setup:2},rk=function(y){return y.urgent?(y.id==='setup:ai'?-3:y.id==='setup:agent'?-2:-1):rank[y.kind]||0;},ys=(h.you||[]).filter(function(y){return !blobSent(y);}).sort(function(a,b){return rk(a)-rk(b)||(a.id<b.id?-1:a.id>b.id?1:0);});
var nb=lqNextBox(h,S);if(!ys.length)return {items:[],bottom:nb,x:0,page:0,pages:1,count:0};
var R=Math.round(24*Math.max(0.85,Math.min(1.1,S.s))),unit=3*R+22+LQ_BLOBW,gap=28,cols=Math.max(1,Math.min(3,Math.floor((S.w-24+gap)/(unit+gap)))),pages=Math.max(1,Math.ceil(ys.length/cols));
LQ.needPage=(LQ.needPage||0)%pages;
// the card you're typing in stays in view: a new one ahead of it doesn't page it away
var fa=document.activeElement,tb=fa&&fa.closest?fa.closest('#lqdrops .lqblob[data-key]'):null;if(tb){var tk=tb.getAttribute('data-key');for(var ti=0;ti<ys.length;ti++)if(bdKey(ys[ti])===tk){LQ.needPage=Math.floor(ti/cols);break;}}
else for(var hi=0;hi<ys.length;hi++)if(blobHeld(bdKey(ys[hi]))){LQ.needPage=Math.floor(hi/cols);break;} // one you pressed, sending or saying why it didn't
var shown=ys.slice(LQ.needPage*cols,LQ.needPage*cols+cols),x0=Math.max(12,(S.w-(shown.length*unit+(shown.length-1)*gap))/2);
var tall=(shown.some(function(y){return y.kind==='ask'&&(y.options||[]).length;})?172:116)+(shown.some(function(y){return y.task||y.fix==='handover';})?16:0)+(shown.some(function(y){return y.draft;})?150:0);
// the band is as tall as its tallest card really is: two long answers, the own-words
// box open and "+4 more questions" made Post 1's card 60px taller than the guess, over
// the mailbox agent's name in the band below (2026-10-09). lqBlobFit lays out again
// when a card grows or shrinks.
LQ.needEst=tall;var mh=lqBlobH();if(mh)tall=Math.max(tall,mh-8);LQ.needTall=tall;
var items=shown.map(function(y,i){return {id:y.id,kind:'you',blob:true,item:y,shape:y.shape,title:y.title,sub:y.sub,r:R,tx:x0+i*(unit+gap)+R,ty:LQ_NEEDY+R,ax:0,ay:0};});
return {items:items,bottom:items.length?LQ_NEEDY+tall+20:0,x:x0,page:LQ.needPage,pages:pages,count:ys.length};}
// The agents at work, a band of their own under the needs-you band (or the header):
// a small orb each, its lane's name in full and, under it, where it is in its brief
// ("step 2 of 4: …"), what it's on and how long it has left, amber once it has gone
// quiet or round in circles. Among the groups they pushed the headings off their
// own orbs and squeezed the names letter by letter (2026-10-08), so they never join
// a group: the groups lay out under the band, as if it were the header.
var LQ_RUNW=270;
function lqRunBand(h,S,y){var rs=(h.runs||[]);if(!rs.length)return {items:[],bottom:0};
var R=Math.round(15*Math.max(0.85,Math.min(1.1,S.s))),unit=2*R+50+LQ_RUNW,gap=22,cols=Math.max(1,Math.min(4,Math.floor((S.w-24+gap)/(unit+gap)))),shown=rs.slice(0,cols);
var x0=Math.max(12,(S.w-(shown.length*unit+(shown.length-1)*gap))/2),y0=Math.max(y||0,84)+18;
var items=shown.map(function(x,i){return {id:x.id,kind:'run',band:true,shape:'agents',repo:x.repo,title:x.name,sub:runWarn(x)+x.line+(x.eta?' · '+x.eta:''),ask:!!(x.quiet||x.looping),r:R,tx:x0+i*(unit+gap)+R,ty:y0+22,ax:0,ay:0};});
return {items:items,bottom:y0+44+16,more:rs.length-shown.length};}
// Next up, where the needs-you band would be: with nothing waiting on you (and only
// then), a few things that CAN be done next (home.mjs nextUp), each with its gain
// and one tap that starts an agent or makes a task. × puts the box away until what
// it suggests changes. Gives the band's bottom (0 when it isn't shown).
function lqNextList(h){if(LQ.scene==='work'||(h.you||[]).length)return [];var ns=h.next||[],sig=ns.map(function(s){return s.id;}).join('|'),off='';try{off=(window.localStorage&&window.localStorage.getItem('symbiot-next-off'))||'';}catch(e){}return sig&&off!==sig?ns:[];}
function lqNextBox(h,S){var el=$('lqnext'),all=lqNextList(h);if(!el){LQ.nextList=all;return 0;}
if(!all.length){LQ.nextList=[];if(el.classList)el.classList.remove('on');sameHtml(el,'');return 0;}
// as many as fit without crowding the liquid under it (like the band): two across on a wide screen, a page on for the rest
var two=S.w>=1100,per=two?4:S.w<600||S.h<620?1:S.h>=760?3:2,pages=Math.ceil(all.length/per);LQ.nextPage=(LQ.nextPage||0)%pages;var ns=all.slice(LQ.nextPage*per,LQ.nextPage*per+per),w=Math.min(two?1040:600,S.w-24);LQ.nextList=ns;
if(!sameHtml(el,"<div class='nxh'><span>What could be done next</span><small>one tap each, if you like</small>"+(pages>1?"<button type='button' class='nxpg'>"+(LQ.nextPage+1)+" of "+pages+" &rsaquo;</button>":"")+"<button type='button' class='nxx' aria-label='put these suggestions away' title='put these away'>&times;</button></div><ol"+(two&&ns.length>1?" class='two'":"")+">"+ns.map(function(s,i){return "<li data-i='"+i+"'><div class='nxt'><b title='"+escQ(s.title)+"'>"+esc(s.title)+"</b><span title='"+escQ(s.gain+' · '+s.time)+"'>"+esc(s.gain)+" &middot; "+esc(s.time)+"</span></div><button type='button' class='nxgo' data-i='"+i+"'>"+esc(s.label)+"</button></li>";}).join('')+"</ol>")){
var x=el.querySelector('.nxx');if(x)x.addEventListener('click',function(){var sig=((LQ.home&&LQ.home.next)||[]).map(function(s){return s.id;}).join('|');try{if(window.localStorage)window.localStorage.setItem('symbiot-next-off',sig);}catch(e){}lqAct();lqBuild();});
var pg=el.querySelector('.nxpg');if(pg)pg.addEventListener('click',function(){LQ.nextPage=(LQ.nextPage||0)+1;lqAct();lqBuild();});
el.querySelectorAll('.nxgo').forEach(function(b){b.addEventListener('click',function(){var s=(LQ.nextList||[])[+b.getAttribute('data-i')],li=b.closest?b.closest('li'):null;if(!s)return;lqAct();b.disabled=true;
api('/api/home/next',{id:s.id}).then(function(r){if(!r||r.error){b.disabled=false;var em=(r&&r.error)||'It didn’t start. Try again.';lqSaid(em);var nt=li&&li.querySelector?li.querySelector('.nxerr'):null;if(!nt&&li&&li.appendChild&&document.createElement){nt=document.createElement('div');nt.className='nxerr';li.appendChild(nt);}if(nt)nt.textContent=em;LQ.fresh=true;setTimeout(function(){lqLoad(false);},650);return;}lqSaid(r.said||'Started.');if(li&&li.classList)li.classList.add('gone');LQ.fresh=true;setTimeout(function(){lqLoad(false);},650);}).catch(function(e){b.disabled=false;lqSaid(String((e&&e.message)||e));});});});}
if(el.classList)el.classList.add('on');if(el.style){el.style.width=w+'px';el.style.transform='translate('+Math.round((S.w-w)/2)+'px,'+(LQ_NEEDY-30)+'px)';}
return LQ_NEEDY-30+(el.offsetHeight||(48+Math.ceil(ns.length/(two?2:1))*58))+24;}
// a blob's top sits 4px above LQ_NEEDY and the band's bottom LQ_NEEDY+tall+20: mh-8 leaves 12px between
function lqBlobH(){var m=0,el=$('lqdrops');if(el&&el.querySelectorAll)el.querySelectorAll('.lqblob').forEach(function(b){if(b.offsetHeight>m)m=b.offsetHeight;});return m;}
// Not from inside its own lay-out: a held card says "Sending…" again as it's drawn, its
// grew came back here and the band laid out over and over until the stack ran out (CI,
// 0.66.10 publish, 2026-10-19). The setTimeout at the end of lqLabels measures it after.
function lqBlobFit(){if(LQ.needTall==null||LQ.scene==='work'||LQ.fitting)return;var mh=lqBlobH(),want=Math.max(LQ.needEst||0,mh?mh-8:0);if(Math.abs(want-LQ.needTall)>2){LQ.fitting=true;try{lqBuild();}finally{LQ.fitting=false;}}}
function lqNeedPage(){LQ.needPage=(LQ.needPage||0)+1;lqAct();lqBuild();}
function lqArchive(){lqPool('tasks');LQ.arch=true;if(typeof loadArchived==='function')loadArchived();}
function lqOrg(id,k){var h=k*977;id=String(id);for(var i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))|0;return ((h>>>0)%1000)/1000;}
function lqGrow(list,cx,cy,vx,vy){list.forEach(function(d){var x=(d.tx-cx)/vx,y=(d.ty-cy)/vy,an=Math.atan2(y,x)+(lqOrg(d.id,1)-0.5)*0.7,rr=Math.sqrt(x*x+y*y)*(0.78+0.44*lqOrg(d.id,2));d.tx=cx+Math.cos(an)*rr*vx;d.ty=cy+Math.sin(an)*rr*vy;});}
// Nearest neighbours, in the liquid: each droplet is drawn towards the ones it's
// linked to (its k nearest, from adapt.mjs, or the part or repo it belongs to),
// pushed off the rest, and loosely held at its own distance from the core. A few
// hundred fixed steps, so the same links give the same picture every time.
// Linked droplets settle just past their separation; unlinked ones keep a wider gap,
// so clusters read as groups. Only the distance from the core is held (the likely
// nearer); the angle is free, so there's no ring for them to fall into.
function lqNear(list,links,cx,cy,cr,S){if(!links.length)return;var gap=36*S.s,lk={};links.forEach(function(l){lk[l[0]+','+l[1]]=1;lk[l[1]+','+l[0]]=1;});
for(var it=0;it<320;it++){links.forEach(function(l){var a=list[l[0]],b=list[l[1]],dx=b.tx-a.tx,dy=b.ty-a.ty,d=Math.sqrt(dx*dx+dy*dy)||1,L=lqSep(a,b,dx,dy)+10,f=(d-L)*0.08*Math.max(0.4,Math.min(1,l[2]*4))/d;if(d>L){a.tx+=dx*f;a.ty+=dy*f;b.tx-=dx*f;b.ty-=dy*f;}});
for(var i=0;i<list.length;i++){var a=list[i];for(var j=i+1;j<list.length;j++){var b=list[j],dx=b.tx-a.tx,dy=b.ty-a.ty,d=Math.sqrt(dx*dx+dy*dy)||1,mn=lqSep(a,b,dx,dy)+(lk[i+','+j]?0:gap);if(d<mn){var f=(mn-d)*0.2/d;a.tx-=dx*f;a.ty-=dy*f;b.tx+=dx*f;b.ty+=dy*f;}}
a.tx+=(cx-a.tx)*0.004;a.ty+=(cy-a.ty)*0.004;var ex=a.tx-cx,ey=a.ty-cy,ed=Math.sqrt(ex*ex+ey*ey)||1,mn2=cr+a.r+60;if(ed<mn2){a.tx=cx+ex/ed*mn2;a.ty=cy+ey/ed*mn2;}}}}
// Seed by cluster: the linked groups (union-find) each get their own arc, sized to
// the group, in the order of where they'd have been, with a steady offset; members
// sit together, alternately nearer and further. lqNear then only polishes.
function lqSeed(list,links,cx,cy,vx,vy,keyOf,angOf){var par=list.map(function(_,i){return i;});function root(i){while(par[i]!==i)i=par[i]=par[par[i]];return i;}links.forEach(function(l){par[root(l[0])]=root(l[1]);});
var groups={};list.forEach(function(d,i){if(d.kind==='more')return;var r=keyOf?keyOf(d):root(i);(groups[r]=groups[r]||[]).push(i);});
var gs=Object.keys(groups).map(function(k){var g=groups[k];return {key:k,m:g,ang:Math.atan2(g.reduce(function(t,i){return t+(list[i].ay-cy)/vy;},0),g.reduce(function(t,i){return t+(list[i].ax-cx)/vx;},0))};});
gs.sort(function(a,b){return a.ang-b.ang;});var tot=gs.reduce(function(t,g){return t+g.m.length+0.8;},0),acc=gs.length?gs[0].ang-(gs[0].m.length+0.8)/tot*Math.PI:0;
gs.forEach(function(g){var span=(g.m.length+0.8)/tot*2*Math.PI,mid=acc+span/2+(lqOrg(list[g.m[0]].id,3)-0.5)*span*0.25;acc+=span;if(angOf){span=Math.min(1.5,span);mid=angOf(g.key)+(lqOrg(list[g.m[0]].id,3)-0.5)*0.2;}
g.m.forEach(function(i,k){var d=list[i],rr=Math.sqrt(Math.pow((d.ax-cx)/vx,2)+Math.pow((d.ay-cy)/vy,2))*(k%2?1.22:0.92),th=mid+(k-(g.m.length-1)/2)*Math.min(0.62,span/Math.max(1,g.m.length)*0.8);d.tx=cx+Math.cos(th)*rr*vx;d.ty=cy+Math.sin(th)*rr*vy;});});}
function runWarn(x){return x.quiet?'no progress in '+x.quiet+' min · ':x.looping?'repeating the same step · ':'';}
function lqLinks(list,near){var at={},links=[],same=function(l){return lqPara(list[l[0]])===lqPara(list[l[1]]);};list.forEach(function(d,i){if(d.kind==='shape')at[d.shape]=i;});
list.forEach(function(d,i){if(d.kind==='shape')((near||{})[d.shape]||[]).forEach(function(n){var j=at[n.id];if(j!=null&&j>i)links.push([i,j,n.w]);else if(j!=null&&j<i&&!links.some(function(l){return l[0]===j&&l[1]===i;}))links.push([j,i,n.w]);});
else if((d.kind==='you'||d.kind==='feed')&&at[d.shape]!=null)links.push([at[d.shape],i,0.5]);});return links.filter(same);}
// One calm line on Home, never a pop-up: on a phone, that your computer is out of reach
// and what you see is its copy, from when; on the computer, what was approved from your phone today.
function lqHomeLine(h){var el=$('lqline'),b=document.body,t='',pc=h.computer,ap=(h.phoneApproved||[]).slice(-1)[0];
if(pc&&pc.away)t="<b>"+esc(pc.name)+" is out of reach.</b> Showing what it sent "+(pc.heard?"at "+esc(pcTime(pc.heard)):"last")+(pc.queued?" · "+pc.queued+" change"+(pc.queued>1?"s":"")+" waiting to send":"")+".";
else if(pc&&pc.old)t="<b>Pair this phone with "+esc(pc.name)+" again:</b> the link between them is sealed now.";
else if(h.phoneUsbFail)t="<b>Your phone didn&rsquo;t pair over the cable.</b> "+esc(h.phoneUsbFail.why)+" Nothing more is sent to it: pair it from Settings &rarr; Your phone when you&rsquo;re ready.";
else if(ap)t=ap.status==='waiting'?"Approving "+esc(ap.repo)+" from "+esc(ap.phone)+" as soon as "+esc(ap.why||'it can')+".":ap.status==='failed'?"<b>Approving "+esc(ap.repo)+" from "+esc(ap.phone)+" failed:</b> "+esc(ap.error||''):(ap.status==='approving'?"Approving ":"Approved ")+esc(ap.repo)+" from "+esc(ap.phone)+" at "+esc(pcTime(ap.at))+".";
if(!t&&qPaused())t='<b>'+esc(qPaused())+'</b>';
if(!t&&h.browserSince)t="<b>The Symbiot Browser is open</b>, since "+esc(pcTime(h.browserSince))+" ("+esc(agoTxt(h.browserSince))+"). Agents read from a copy of its sign-ins meanwhile, and it closes by itself after "+(h.browserIdle||20)+" minutes unused.";
if(b&&b.classList)b.classList.toggle('lq-hline',!!t);if(el&&LQ.scene!=='work'&&el.innerHTML!==t)el.innerHTML=t;}
// Home on a phone paired with your computer: what you act on there, read at a glance.
// Not the liquid (its groups, orbs and the computer's work behind a droplet: "the UI on
// the phone is bloated", 2026-10-12), but a plain list: how fresh the computer's copy
// is, what needs you there (its agents' questions, its Approves) answered in place,
// then its tasks, to tick or add (the computer's panel, renderComputer, moved here).
// What this phone itself needs comes after the computer's (renderComputer puts it there): its questions and Approves as
// they are, its setup together in one, as Settings has it. The rest of Symbiot is a
// row along the top, one tap each. false when this isn't a paired phone: the liquid.
var PH_NAV=['settings','reports','board','map','week','standup','marketing']; // not the Workdesk: the computer's tasks are this list, and the phone's own was empty
function lqPhone(h){var on=!!(h&&h.computer),b=document.body,el=$('phhome'),slot=$('phpc'),pc=$('panel-computer');LQ.phone=on;
if(b&&b.classList)b.classList.toggle('lq-phone',on);
// the computer's view lives on Home while this is a paired phone, and in its panel otherwise
if(slot&&pc){['pcline','pcmsg','pcbody'].forEach(function(id){var n=$(id),to=on?slot:pc;if(n&&n.parentNode!==to)to.appendChild(n);});
if(!$('phyou')){var py=document.createElement('div');py.id='phyou';slot.appendChild(py);}}
if(!on||!el)return false;
// under the header, however tall it is (taller for a finger)
var hd=document.querySelector('header'),hb=hd&&hd.getBoundingClientRect?Math.round(hd.getBoundingClientRect().bottom):0;if(hb>0&&el.style)el.style.top=hb+'px';
var rep=((h.feeds||[]).filter(function(f){return f.id==='feed:reports';})[0]||{}).count||0,mk=h.marketing||null;
var nav=$('phnav');if(nav&&!sameHtml(nav,PH_NAV.filter(function(s){return s!=='marketing'||mk;}).map(function(s){var n=s==='reports'?rep:s==='marketing'?(mk.needs||0):0;return "<button type='button' data-s='"+s+"'"+(n?" class='lit'":"")+">"+esc(LQNAMES[s]||s)+(n?" <b>"+n+"</b>":"")+"</button>";}).join('')))
nav.querySelectorAll('button').forEach(function(x){x.addEventListener('click',function(ev){var s=x.getAttribute('data-s');lqAct();if(s==='marketing'&&mk&&mk.needs)MKLIT=true;lqUse(s,ev);lqGo(s);});});
LQ.drops=[];LQ.need=null;LQ.coreText='';lqLabels();
phYou(h);
// fresh from the computer now and then, never while you're typing an answer or a task here
var fa=document.activeElement,typing=fa&&el.contains&&el.contains(fa)&&/^(INPUT|TEXTAREA|SELECT)$/.test(fa.tagName||'');
if(!typing&&(!PCV||Date.now()-(LQ.pcAt||0)>20000)){LQ.pcAt=Date.now();loadComputer();}
return true;}
function phYou(h){var el=$('phyou');if(!el)return;var ys=(h&&h.you)||[],setup=ys.filter(function(y){return y.kind==='setup';}),rest=ys.filter(function(y){return y.kind!=='setup';}),rows=rest.slice();
if(setup.length)rows.push({kind:'setup',id:'phone:setup',urgent:setup.some(function(y){return y.urgent;}),shape:'settings',focus:setup[0].focus,title:setup.length>1?setup.length+' things to set up':setup[0].title,sub:setup.length>1?setup.map(function(y){return y.title;}).join(' · '):setup[0].sub});
if(!sameHtml(el,rows.length?"<div class='pshead'><span>Needs you on this phone &middot; "+rows.length+"</span></div>"+rows.map(function(y,i){return "<button type='button' class='phyi"+(y.urgent?' urgent':'')+"' data-i='"+i+"'><b>"+esc(y.title)+"</b><span>"+esc(y.sub||'')+"</span></button>";}).join(''):''))
el.querySelectorAll('.phyi').forEach(function(x){x.addEventListener('click',function(ev){var y=rows[+x.getAttribute('data-i')];if(y)lqOpen({kind:'you',item:y,shape:y.shape},ev);});});}
function lqBuild(){var a=LQ.adapt||{},h=LQ.home||{},S=lqSize(),list=[];LQ.bw=S.w;LQ.bh=S.h;
// the talk box's hint in full where it fits; on a phone it was cut off mid-word
var ask=$('lqask'),nar=S.w<520;if(ask&&LQ.askNarrow!==nar){LQ.askNarrow=nar;ask.setAttribute('placeholder',nar?'Tell Symbiot what to do':'Talk to Symbiot, or tell it what to do (paste a screenshot to show it)');}
if(lqPhone(h))return;
// the band first: everything else sits under it, round a core centred in what's left
var need=lqNeeds(h,S),band=lqRunBand(h,S,need.bottom),top=band.bottom||need.bottom,cx=S.w/2,cy=top?Math.max(S.h*0.47,(top+60+S.h-200)/2):S.h*0.47;LQ.cy=cy;LQ.top=top;LQ.need=need;
// Marketing only once posts can be drafted, or are (home.mjs): a new user meets what they watch first
var mk=function(id){return id!=='agents'&&(id!=='marketing'||!!h.marketing);}; // and Agents is the Workdesk (tasks), one orb
var feeds=(h.feeds||[]).slice(0,2),lay=((a.layout&&a.layout.items)||[]).filter(function(it){return mk(it.id);}),more=((a.layout&&a.layout.more)||[]).filter(mk);
var vx=Math.max(0.5,Math.min(S.s*1.3,(S.w/2-90)/400)),vy=Math.max(0.35,Math.min(S.s*0.8,(S.h-cy-230)/400,(cy-(top?top+60:160))/400));var rs=Math.min(S.s,(vx+vy)/1.5);var room=Math.max(3,LQ_MAX-feeds.length-1-(top?2:0));
var repNew=(h.feeds||[]).filter(function(f){return f.id==='feed:reports';})[0],repOut=repNew&&feeds.indexOf(repNew)<0; // new reports, when their own droplet didn't fit
// what has something for you is never only under "more": unread reports, and Marketing once it can draft;
// each takes the place of the least likely part shown, which goes under "more" instead
var vis=lay.slice(0,room);['reports','marketing'].forEach(function(id){if(id==='reports'?!repOut:!h.marketing)return;if(vis.some(function(it){return it.id===id;}))return;var vi=-1;vis.forEach(function(it,i){if(['tasks','reports','marketing'].indexOf(it.id)<0&&(vi<0||it.p<vis[vi].p))vi=i;});if(vi<0)return;var v=vis[vi];vis[vi]={id:id,p:v.p,r:v.r,d:v.d,angle:v.angle};more=more.filter(function(m){return m!==id;});more.push(v.id);});
lay.slice(room).forEach(function(it){if(!vis.some(function(x){return x.id===it.id;})&&more.indexOf(it.id)<0)more.push(it.id);});lay=vis;
// Marketing's orb is lit (amber, like a lane that asks) when something there needs you, and orbits while its agent works
var mkh=h.marketing||{},mkSub=mkh.needs?mkh.needs+(mkh.needs>1?' need you':' needs you'):mkh.working?'its agent is at work':'';
lay.slice(0,room).forEach(function(it){var mko=it.id==='marketing';list.push({id:'shape:'+it.id,kind:'shape',shape:it.id,title:LQNAMES[it.id]||it.id,sub:it.id==='reports'&&repOut?repNew.count+' new':mko?mkSub:'',ask:mko&&!!mkh.needs,orbit:mko&&!!mkh.working,r:it.r*rs,tx:cx+Math.cos(it.angle)*it.d*vx,ty:cy+Math.sin(it.angle)*it.d*vy});});
feeds.forEach(function(f,i){var ang=Math.PI/2+(i-(feeds.length-1)/2)*0.7;var fn=bsName({name:f.title});list.push({id:f.id,kind:'feed',shape:f.shape,title:fn.n+(fn.sub?' · '+fn.sub.split('@').pop():''),sub:f.sub,r:(28+5*Math.min(f.count||1,5))*rs,tx:cx+Math.cos(ang)*300*vx,ty:cy+Math.sin(ang)*300*vy});});
// on a phone paired with your computer: its droplet, lit when something there needs you (phone.mjs)
var pc=h.computer;if(pc&&!pc.old){var pn=pc.asks+pc.approves,pang=Math.PI/2+((feeds.length+1)/2)*0.7;list.push({id:'computer',kind:'feed',shape:'computer',title:'On '+pc.name,sub:pc.away?'out of reach · its copy':pn?pn+(pn>1?' need you':' needs you'):pc.tasks+' open task'+(pc.tasks===1?'':'s'),ask:pn>0,r:(32+4*Math.min(pn,5))*rs,tx:cx+Math.cos(pang)*300*vx,ty:cy+Math.sin(pang)*300*vy});}
// on the computer: your phone, and when it last asked (a droplet only while one's paired)
var phs=h.phones||[];if(phs.length){var p0=phs.slice().sort(function(x,y){return (y.seen||0)-(x.seen||0);})[0],gang=Math.PI/2+((feeds.length+1)/2)*0.7;list.push({id:'phones',kind:'feed',shape:'settings',title:phs.length>1?phs.length+' phones':p0.name,sub:p0.old?'pair it again':p0.seen?'seen '+agoTxt(p0.seen)+(p0.via==='relay'?', away':''):'hasn’t asked yet',ask:!!p0.old,r:28*rs,tx:cx+Math.cos(gang)*300*vx,ty:cy+Math.sin(gang)*300*vy});}
list.push({id:'archive',kind:'archive',shape:'tasks',title:'Archive',sub:'what’s done: archived tasks',r:26*rs,tx:cx+Math.cos(PARA_ANG.x)*330*vx,ty:cy+Math.sin(PARA_ANG.x)*330*vy});
list.forEach(function(d){var g=lqPara(d);d.live=PARA_LIVE[g];if(g==='r')d.r*=0.82;if(g==='x')d.r*=0.85;if(d.shape==='tasks'&&d.kind==='shape'&&h.working)d.orbit=true;});
var mr=more.length?[{id:'more',kind:'more',title:'more',sub:more.map(function(m){return LQNAMES[m]||m;}).join(' · '),more:more.slice(),r:24*S.s}]:[],zl=list.concat(mr),zc=lqZones(zl,S,top,92*S.s);
if(zc){LQ.cy=zc.cy;list=zl;}else{
lqGrow(list,cx,cy,vx,vy);list.forEach(function(d){d.ax=d.tx;d.ay=d.ty;});var lks=lqLinks(list,a.near);lqSeed(list,lks,cx,cy,vx,vy,lqPara,function(g){return PARA_ANG[g];});lqNear(list,lks,cx,cy,92*rs,S);
// Solve it. If this screen can't hold them all clear of each other (lqRelax), the
// least likely part goes under "more" (Hick: fewer, not cramped) and it solves
// again. What only you can do and your feeds always stay out.
var base=list.slice(),cur=null,tries=0;base.forEach(function(d){d.r0=d.r;d.tx0=d.tx;d.ty0=d.ty;});
for(;;){cur=base.slice();if(more.length)cur.push({id:'more',kind:'more',title:'more',sub:more.map(function(m){return LQNAMES[m]||m;}).join(' · '),more:more.slice(),r0:24*S.s,tx0:S.w-Math.max(70,S.w*0.08),ty0:top?top+90:150});
cur.forEach(function(d){d.r=d.r0;d.tx=d.tx0;d.ty=d.ty0;});if(lqRelax(cur,S,cx,cy,92*S.s,top?top+60:0)||tries++>=8)break;
var q=-1;for(var z=base.length-1;z>=0;z--)if(base[z].kind==='shape'){q=z;break;}if(q<0)break;more.push(base[q].shape);base.splice(q,1);}
list=cur;}
list=list.concat(need.items,band.items);var old={};LQ.drops.forEach(function(d){old[d.id]=d;});
// a new blob grows where it belongs, rather than sweeping out of the core across the rest
LQ.drops=list.map(function(d){var o=old[d.id];d.x=o?o.x:d.blob?d.tx:cx;d.y=o?o.y:d.blob?d.ty:cy;d.vx=o?o.vx:0;d.vy=o?o.vy:0;d.cr=o?o.cr:0;return d;});
var n=(h.you||[]).length,w=h.working||0,qt=(h.runs||[]).filter(function(x){return x.quiet||x.looping;}).length,wk=w?w+' agent'+(w>1?'s':'')+' working'+(qt?' ('+qt+' stalled)':''):'';
LQ.coreText=n?(n+(n>1?' things need':' thing needs')+' only you'+(w?' · '+wk:'')):(w?wk+' · nothing needs you':'Nothing needs you right now');
lqHomeLine(h);
var b=document.body;if(b&&b.classList){b.classList.toggle('lq-touch',!!(a.modes&&a.modes.touch)||LQ.touch);b.classList.toggle('lq-keys',!!(a.modes&&a.modes.keyboard));}
LQ.talkWeight=(a.modes&&a.modes.talkWeight)||0.35;
lqLabels();}
// Home in zones, on a screen wide enough for them: the core in the middle of what's
// under the band; Projects then Resources to its left, Areas then Watching (with the
// Archive and "more" at its end) to its right; each a row with its name at its outer
// end, so the droplets, which flow out of the core, never cross a name on their way
// (on the right, names next to the core had the Dashboard orb sitting on "what you
// keep up with" until it landed). Fixed places in a fixed order, so nothing overlaps
// and each part is where it was last time. Sizes still come from how you use them (adapt.mjs), all scaled
// by one factor when the screen is short, so they stay comparable. null when they
// can't fit (a narrow or very short screen): the liquid's own layout then.
var ZONE_ORDER=['tasks','agents','todo','marketing','board','week','standup','map','drift','settings','vault','reports'],ZONE_KIND={shape:0,feed:1,archive:2,more:3};
function lqZones(list,S,top,coreR){LQ.zoneT=null;if(S.w<1000||S.h<540)return null;
var y0=top?top+10:96,y1=S.h-180,mid=(y0+y1)/2,cx=S.w/2,gapC=coreR+36,colW=S.w/2-gapC-20,titleW=150;if(colW-titleW<250||mid-y0<70)return null;
var cells={p:[cx-gapC-colW,y0,mid],a:[cx+gapC,y0,mid],r:[cx-gapC-colW,mid,y1],w:[cx+gapC,mid,y1]},by={},plan={},k=1;
var spare=[];list.forEach(function(d){var g=lqPara(d);if(g==='x'||d.kind==='more'){spare.push(d);return;}(by[g]=by[g]||[]).push(d);});
// the Archive and "more" go at the end of the shortest row (lower rows first), so no row overflows
spare.forEach(function(d){var g=['r','w','a','p'].reduce(function(b,x){return ((by[x]||[]).length<(by[b]||[]).length)?x:b;},'r');(by[g]=by[g]||[]).push(d);});
Object.keys(by).forEach(function(g){var c=cells[g];if(!c){k=0;return;}
var m=by[g].sort(function(a,b){var ka=ZONE_KIND[a.kind]||0,kb=ZONE_KIND[b.kind]||0;if(ka!==kb)return ka-kb;var ia=ZONE_ORDER.indexOf(a.shape),ib=ZONE_ORDER.indexOf(b.shape);return (ia<0?99:ia)-(ib<0?99:ib)||(a.id<b.id?-1:1);});
// neighbours in a row keep the liquid's rule (lqSep: past where their metal would bridge, ~3.4r apart) and room for their tags
var R=0;m.forEach(function(d){R=Math.max(R,d.r);});var av=colW-titleW,fitW=function(per){var s=av/per;return s<128?0:(s-6)/(3.4*R);},per=m.length;
if(fitW(per)<0.6&&m.length>1)per=Math.ceil(m.length/2);var rows=Math.ceil(m.length/per);
k=Math.min(k,fitW(per),((c[2]-c[1])/rows-46)/(2*R));plan[g]={m:m,per:per,rows:rows,stepX:av/per};});
if(k<0.55)return null;k=Math.min(1,k);LQ.zoneT={};
Object.keys(plan).forEach(function(g){var c=cells[g],p=plan[g],rowH=(c[2]-c[1])/p.rows,right=g==='a'||g==='w',x0=c[0]+(right?0:titleW)+(colW-titleW)/2;
LQ.zoneT[g]=[right?c[0]+colW-titleW/2:c[0]+titleW/2,c[1]+rowH/2-13];
p.m.forEach(function(d,i){d.r*=k;var row=Math.floor(i/p.per),n=Math.min(p.per,p.m.length-row*p.per);d.tx=x0+(i%p.per-(n-1)/2)*p.stepX;d.ty=c[1]+row*rowH+rowH/2-13;});});
return {cy:mid};}
// Force-directed layout, solved once per change: push overlapping targets apart
// (each droplet's circle plus its label below or above), and off the core, within
// the screen. Deterministic, so the same data gives the same layout.
// The one rule for how far apart two droplets sit: past where their metal would
// bridge (r²/d² fields sum to 1 midway at d = 2·√(r1²+r2²)), with a margin so the
// wobble can't flicker a bridge open and shut, and room for their labels when
// they share a column. Used once, when the layout is solved; nothing fights it live.
// Tags float on their spheres, so two on the same row also keep a tag's width apart.
function lqSep(a,b,dx,dy){var m=Math.max(a.r+b.r+70,2.4*Math.sqrt(a.r*a.r+b.r*b.r))+(Math.abs(dx)<150?48:0);return dy!=null&&Math.abs(dy)<56?Math.max(m,232):m;}
// Solve the layout: push targets apart until every pair keeps lqSep (and clear
// of the core), within the screen. If they can't all fit, every droplet gives up
// a little of its size (the liquid is conserved, not crowded) and it solves again.
function lqRelax(L,S,cx,cy,coreR,top){var n=L.length,y0=top||140;
// each sphere's tag, roughly: up to 170px wide, one or two lines, under it
var lqLb=function(d){if(!d._lb){var t=typeof lqShort==='function'?lqShort(d.title,42):String(d.title||''),w=Math.min(170,t.length*6.6+18);d._lb={w:d.title?w:0,h:d.title?(t.length*6.6+18>170?42:26)+(d.kind==='proj'?16:0):0};}return d._lb;};
for(var pass=0;pass<6;pass++){
for(var it=0;it<220;it++){var moved=0;for(var i=0;i<n;i++){var a=L[i];
for(var j=i+1;j<n;j++){var b=L[j],dx=a.tx-b.tx,dy=a.ty-b.ty,dd=Math.sqrt(dx*dx+dy*dy)||0.01,mn=lqSep(a,b,dx,dy);if(dd<mn){var f=(mn-dd)/2/dd;a.tx+=dx*f;a.ty+=dy*f;b.tx-=dx*f;b.ty-=dy*f;moved++;}
var la=lqLb(a),lb=lqLb(b),sg=a.tx>=b.tx?1:-1,ox=0;if(Math.abs(a.tx-b.tx)<(la.w+lb.w)/2+10&&Math.abs((a.ty+a.r+4+la.h/2)-(b.ty+b.r+4+lb.h/2))<(la.h+lb.h)/2+4)ox=(la.w+lb.w)/2+10-Math.abs(a.tx-b.tx);else if(Math.abs(a.tx-b.tx)<la.w/2+b.r+6&&a.ty+a.r+4<b.ty+b.r&&a.ty+a.r+4+la.h>b.ty-b.r)ox=la.w/2+b.r+6-Math.abs(a.tx-b.tx);else if(Math.abs(a.tx-b.tx)<lb.w/2+a.r+6&&b.ty+b.r+4<a.ty+a.r&&b.ty+b.r+4+lb.h>a.ty-a.r)ox=lb.w/2+a.r+6-Math.abs(a.tx-b.tx);if(ox>0.5){a.tx+=sg*ox/2;b.tx-=sg*ox/2;moved++;}}
var cdx=a.tx-cx,cdy=a.ty-cy,cd=Math.sqrt(cdx*cdx+cdy*cdy)||0.01,cm=Math.max(a.r+coreR+70,2.4*Math.sqrt(a.r*a.r+coreR*coreR));if(cd<cm){a.tx+=cdx*(cm-cd)/cd;a.ty+=cdy*(cm-cd)/cd;moved++;}
a.tx=Math.max(a.r+60,Math.min(S.w-a.r-60,a.tx));a.ty=Math.max(y0+a.r,Math.min(S.h-200-a.r,a.ty));}if(!moved)break;}
var bad=false;for(var i2=0;i2<n&&!bad;i2++)for(var j2=i2+1;j2<n;j2++){var p=L[i2],q=L[j2],ddx=p.tx-q.tx,ddy=p.ty-q.ty;if(Math.sqrt(ddx*ddx+ddy*ddy)<lqSep(p,q,ddx,ddy)-1){bad=true;break;}}
if(!bad)return true;L.forEach(function(x){x.r*=0.9;});coreR*=0.9;}return false;}
// A sphere's tag, short: no markdown, no (§5 of .symbiot/BRIEF…) or path asides, cut
// at a word near n characters. The whole text stays on the tag's title.
function lqShort(t,n){t=String(t||'').split('**').join('').split(String.fromCharCode(96)).join('').split(String.fromCharCode(10)).join(' ');var out='',buf='',depth=0;
for(var i=0;i<t.length;i++){var ch=t.charAt(i);if(ch==='('){depth++;buf+=ch;continue;}if(depth){buf+=ch;if(ch===')'){depth--;if(!depth){if(buf.indexOf('§')<0&&buf.indexOf('/')<0&&buf.indexOf('.symbiot')<0)out+=buf;buf='';}}continue;}out+=ch;}
while(out.indexOf('  ')>=0)out=out.split('  ').join(' ');[' :',' ,',' ;',' .'].forEach(function(x){out=out.split(x).join(x.charAt(1));});out=out.trim();n=n||42;if(out.length>n){out=out.slice(0,n);var k=out.lastIndexOf(' ');if(k>n*0.6)out=out.slice(0,k);out=out.replace(/[ ,;:.-]+$/,'')+'…';}return out;}
// The same tags as last time stay the same nodes (sameHtml): a refresh with nothing
// new doesn't touch them, so text you're selecting in a blob stays selected. Their
// handlers read the droplet by its place (data-i) when clicked, not from when drawn.
function lqLabels(){var el=$('lqdrops');if(!el)return;
var dropAt=function(b){return LQ.drops[+b.getAttribute('data-i')];};
var same=keepTyping(el,LQ.drops.map(function(d,i){if(d.blob)return "<div class='lqd lq-you lqblob"+(d.item.urgent?' urgent':'')+"' data-i='"+i+"' data-key='"+escQ(bdKey(d.item))+"' role='group' aria-label='"+escQ(String(d.item.name||d.item.title||'')+': '+String(d.item.q||d.item.sub||''))+"'>"+blobBody(d.item,true)+"</div>";
return "<div class='lqd lq-"+d.kind+(d.band?' lq-band':'')+(d.parked?' lq-parked':'')+(d.ask&&d.kind==='shape'?' lq-lit':'')+(LQ.openTag===d.id?' open':'')+"' data-i='"+i+"'><button type='button' class='lt' title='"+escQ(String(d.title||'').split('**').join('')+(d.sub?' · '+d.sub:''))+"' aria-expanded='"+(LQ.openTag===d.id)+"'><span>"+esc(lqShort(d.title,42))+"</span>"+((d.kind==='proj'||d.kind==='wait'||d.kind==='run'||d.ask)&&(d.sub||d.ask)?"<span class='lm'>"+esc(lqShort(d.sub||'needs a look',d.kind==='proj'?40:56))+"</span>":"")+"</button>"+(d.sub?"<small>"+esc(d.sub)+"</small>":"")+"<button type='button' class='lgo'>Open &rsaquo;</button>"+(d.kind==='wait'&&String(d.id).indexOf('task:')===0?"<button type='button' class='lrm' title='Remove this task: it goes to the Archive (Undo brings it back)' aria-label='Remove this task'>&times;</button>":"")+"</div>";}).join(''));
if(!same){LQ.btns=[];LQ.lts=[];el.querySelectorAll('.lqd').forEach(function(b){LQ.btns.push(b);var d=dropAt(b),lt=b.querySelector('.lt'),go=b.querySelector('.lgo');LQ.lts.push(lt);
if(b._wired)return;b._wired=true; // the blob kept through the redraw (keepTyping) is wired already
if(lt)lt.addEventListener('click',function(ev){lqOpen(dropAt(b),ev);});
if(go)go.addEventListener('click',function(ev){LQ.openTag=null;lqOpen(dropAt(b),ev);});
var rmv=b.querySelector('.lrm');if(rmv)rmv.addEventListener('click',function(){var x=dropAt(b),tid=x&&String(x.id).replace(/^task:/,'');if(!tid)return;rmv.disabled=true;api('/api/tasks/cancel',{id:tid}).then(function(r){if(!r||r.error){rmv.disabled=false;lqSaid((r&&r.error)||'It didn’t go. Try again.',true);return;}
LQ.openTag=null;x.gone=true;lqUndo('Removed: '+lqShort(x.title,70),function(){return api('/api/tasks/restore',{id:tid});});lqLoadWork();}).catch(function(e){rmv.disabled=false;lqSaid(String((e&&e.message)||e),true);});});
if(d&&d.blob)wireBlob(b,d.item,{sent:function(){var x=dropAt(b);if(x)x.gone=true;},done:function(){LQ.fresh=true;lqLoad(false);},say:lqSaid,grew:lqBlobFit});});setTimeout(lqBlobFit,0);}
var nt=$('lqneedt'),nd=LQ.scene!=='work'&&LQ.need;if(nt){var on=!!(nd&&nd.items.length);if(nt.classList)nt.classList.toggle('on',on);
if(on){if(!sameHtml(nt,"<span>Needs you"+(nd.count>1?" &middot; "+nd.count:"")+"</span><small>only you can do these</small>"+(nd.pages>1?"<button type='button' class='lqmb lqneedpg' style='pointer-events:auto;min-height:32px;padding:4px 12px;font-size:12.5px'>"+(nd.page+1)+" of "+nd.pages+" &rsaquo;</button>":""))){var pg=nt.querySelector('.lqneedpg');if(pg)pg.addEventListener('click',lqNeedPage);}
if(nt.style)nt.style.transform='translate('+Math.round(nd.x)+'px,'+(LQ_NEEDY-46)+'px)';}}
var oe=$('lqorbits');if(oe&&!sameHtml(oe,LQ.drops.map(function(d,i){return d.kind==='run'||d.orbit?"<div class='lqorbit"+(d.ask?' ask':'')+"' data-i='"+i+"'><span><i></i></span><span><i></i></span><span><i></i></span></div>":'';}).join(''))){LQ.orbs=[];oe.querySelectorAll('.lqorbit').forEach(function(o){LQ.orbs.push(o);});}
LQ.drops.forEach(function(d){if(d.x===d.tx&&d.y===d.ty)return;if(!LQ.frame){d.x=d.tx;d.y=d.ty;d.cr=d.r;}});lqStep();
var ge=$('lqgroups');if(ge){var gs={};if(LQ.scene!=='work')LQ.drops.forEach(function(d){if(d.kind!=='more')gs[lqPara(d)]=1;});if(!sameHtml(ge,['p','a','w','r'].filter(function(g){return gs[g];}).map(function(g){return "<button type='button' class='lqg' data-g='"+g+"'><span>"+PARA_NAME[g]+"</span><small>"+PARA_SUB[g]+"</small></button>";}).join(''))){LQ.gbtns=[];ge.querySelectorAll('.lqg').forEach(function(b){LQ.gbtns.push(b);b.addEventListener('click',function(){lqParaGo(b.getAttribute('data-g'));});});}}
lqCoreText($('lqcore'),LQ.coreText||'');}
// the core's words, set only when they change: rewriting them every frame lost a selection in them at once
function lqCoreText(c,t){if(c&&c._t!==t){c.textContent=t;c._t=t;}}
// Tapping a sphere (or its name) opens its tag; tapping it again, or elsewhere, closes it.
function lqTag(id){LQ.openTag=LQ.openTag===id?null:id;lqAct();LQ.btns.forEach(function(b,i){var d=LQ.drops[+b.getAttribute('data-i')],on=!!d&&d.id===LQ.openTag;if(b.classList)b.classList.toggle('open',on);var lt=LQ.lts&&LQ.lts[i];if(lt&&lt.setAttribute)lt.setAttribute('aria-expanded',on?'true':'false');});}
function lqVia(ev){return LQ.talking?'talk':ev&&ev.pointerType==='touch'?'touch':ev&&ev.detail===0?'key':'click';}
function lqUse(shape,ev,via){if(shape==='agents')shape='tasks'; // one Workdesk
api('/api/adapt/use',{shape:shape,from:LQ.last,via:via||lqVia(ev)});LQ.last=shape;}
function lqOpen(d,ev){if(!d)return;lqAct();
if(d.kind==='more'){LQ.moreOpen=!LQ.moreOpen;lqMore(d);return;}
if(d.kind==='archive'){lqArchive();return;}
if(d.kind==='shape'&&d.shape==='marketing'&&d.ask)MKLIT=true;
if(d.kind==='you'&&d.item){if(d.x!=null){var S1=lqSize();LQ.ripple=[d.x/S1.w,d.y/S1.h,LQ.t];}lqUse(d.shape||'agents',ev);lqFocus(d.item);return;}
if(d.kind==='wait'&&d.focus){lqFocus({kind:'proj',repo:d.repo,path:d.focus});return;}
if(d.kind==='proj'){if(d.lit||d.repo==='ops'){lqFocus({kind:'proj',repo:d.repo});return;}TFILTER.id='';TFILTER.repo=d.repo;TFILTER.type='';lqPool('tasks');if(typeof loadTasks==='function')loadTasks();return;}
// where your files disagree: the checks, lit up in Settings, and these clashes reached you (it dissolves)
if(d.id==='phones'){lqUse('settings',ev);lqFocus({kind:'setup',focus:'phone'});return;}
if(d.id==='feed:clash'){api('/api/knowledge/checks/seen',{}).catch(function(){});if(LQ.home)LQ.home.feeds=(LQ.home.feeds||[]).filter(function(f){return f.id!=='feed:clash';});lqUse('settings',ev);loadChecks();lqFocus({kind:'setup',focus:'checks'});return;}
var S=lqSize();LQ.ripple=[d.x/S.w,d.y/S.h,LQ.t];if(LQ.scene==='work'){lqPool(d.shape||'agents');return;}lqUse(d.shape||'board',ev);lqGo(d.shape||'board');}
function lqMore(d){var el=$('lqmore');if(!el)return;if(!LQ.moreOpen||!d){el.innerHTML='';return;}
if(d.lanes){el.innerHTML=d.lanes.map(function(p,i){return "<button type='button' class='lqmb lqm' data-i='"+i+"'>"+(p.lit?"<span style='color:#F2A541'>&#9679;</span> ":"")+esc(p.name)+"</button>";}).join('');
el.querySelectorAll('.lqm').forEach(function(b){b.addEventListener('click',function(){var p=d.lanes[+b.getAttribute('data-i')];LQ.moreOpen=false;el.innerHTML='';if(p)lqOpen({kind:'proj',repo:p.repo,lit:p.lit});});});return;}
el.innerHTML=(d.more||[]).map(function(s){return "<button type='button' class='lqmb lqm' data-s='"+s+"'>"+esc(LQNAMES[s]||s)+"</button>";}).join('');
el.querySelectorAll('.lqm').forEach(function(b){b.addEventListener('click',function(ev){var s=b.getAttribute('data-s');LQ.moreOpen=false;el.innerHTML='';lqUse(s,ev);lqGo(s);});});}
function lqGo(shape){if(shape==='tasks'||shape==='agents'){lqWorkBy('task');return;}lqPool(shape);}
// A blob: what only you can do, in a few words. A question: the project (its name
// as people say it), the question in a line, its two answers as buttons (the one
// it recommends first), or your own words; an Approve or a north star: the one
// button that opens it. On home (home=true) its name opens the project lit up.
// A drafted reply as it will look: a LinkedIn message, a WhatsApp bubble or an email, the reply only.
function draftHtml(d){var where=d.kind==='social'?'LinkedIn':d.kind==='chat'?'WhatsApp':(d.platform||'email');return "<div class='dmsg dm-"+escQ(d.kind||'mail')+"' aria-label='the reply, as it will be sent'><div class='dmto'>"+(d.to?'To '+esc(d.to)+' · ':'')+esc(d.platform||where)+"</div><div class='dmb'>"+esc(d.text||'')+"</div></div>";}
// Undo, for a card dismissed or a task removed: a bar at the foot of the screen for 9 s. back()
// makes the call that brings it back; then Home, the Workdesk and the open project draw again.
var UNDO={t:null};
function lqUndo(text,back){var el=$('undobar');if(!el){el=document.createElement('div');el.id='undobar';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.appendChild(el);}
clearTimeout(UNDO.t);el.innerHTML="<span title='"+escQ(text)+"'>"+esc(text)+"</span><button type='button' class='undo'>Undo</button>";el.className='on';
var b=el.querySelector('.undo');b.addEventListener('click',function(){b.disabled=true;clearTimeout(UNDO.t);Promise.resolve(back()).then(function(r){el.className='';if(r&&r.error){lqSaid(r.error,true);return;}lqRefresh();}).catch(function(e){el.className='';lqSaid(String((e&&e.message)||e),true);});});
UNDO.t=setTimeout(function(){el.className='';},9000);}
function lqRefresh(){LQ.fresh=false;LQ.relaySig='';api('/api/home?fresh=1').then(function(h){LQ.home=h||{};if(LQ.scene==='work')lqLoadWork();else lqRedraw();if(typeof renderNeeds==='function')renderNeeds();if(!TARCH&&$('tasklist'))api('/api/tasks').then(function(l){ALLTASKS=l||[];renderTasks();});else if(TARCH)loadArchived();}).catch(function(){});}
function blobOpt(o){return String(o||'').replace(/[ ]*[(]recommended[)][ ]*$/i,'');}
// What you type in a blob's own-words box, kept per question (its folder and the
// question, else its id) in localStorage as you type: a redraw, a reload or a restart brings it
// back, with the cursor where it was, and it goes only once the answer is sent. A
// week-old one is dropped. One whose question went (answered elsewhere) is said in
// Home's talk with what you wrote (bdOrphans), never dropped silently.
var BDKEY='symbiot-blobdrafts',BDKEEP=7*86400000;
function bdKey(y){var q=y.raw||y.q;return y.path&&q?String(y.path)+'|'+String(q):String(y.id||'')+'|'+String(q||y.sub||'');} // the same question on Home, the Workdesk and a project
function bdAll(){try{var a=JSON.parse(localStorage.getItem(BDKEY)||'{}');return a&&typeof a==='object'?a:{};}catch(e){return {};}}
function bdGet(y){var d=bdAll()[bdKey(y)];return d&&d.text?d:null;}
function bdSet(y,text,s,e,src){var a=bdAll(),k=typeof y==='string'?y:bdKey(y),now=Date.now();if(text)a[k]={text:String(text),at:now,s:s,e:e,name:y.name||y.repo||'',q:y.q||'',src:src||'blob'};else delete a[k];
for(var x in a)if(now-(a[x].at||0)>BDKEEP)delete a[x];try{localStorage.setItem(BDKEY,JSON.stringify(a));}catch(er){}}
function bdOrphans(you){var a=bdAll(),keys={},ch=false;(you||[]).forEach(function(y){if(y.kind==='ask')keys[bdKey(y)]=1;});
for(var k in a){var d=a[k];if(keys[k]||d.told||!d.text||d.src==='desk')continue;d.told=1;ch=true;lqSaid('Your answer to '+(d.name||'an agent')+' wasn’t sent: '+(d.q?'“'+lqShort(d.q,70)+'” ':'its question ')+'was answered or closed elsewhere. What you wrote: “'+d.text+'”');}
if(ch)try{localStorage.setItem(BDKEY,JSON.stringify(a));}catch(e){}}
// A card is a conversation with its agent (home.mjs cardTalk): what the user asked on it and what
// the agent said back, under its question, which stays open until it's answered.
var BLOBTALK={};
function blobTalk(t,nm){if(!t||!t.length)return '';return "<div class='btalk'>"+t.slice(-6).map(function(m){return "<div class='btm "+(m.from==='you'?'me':'ag')+"'><b>"+(m.from==='you'?'You':'Agent')+"</b> "+esc(m.text)+"</div>";}).join('')+"</div>";}
// A card opens with its agent saying what it's on and what it has done (y.doing from the card writer, else
// "I'm on it: <its job>. So far: …"), then the one thing it needs: a card that was only the task's words read
// as the user's job ("how should i know you are the one thats manning it not me", 22 Oct 2026).
function fallbackCopy(t){try{var a=document.createElement("textarea");a.value=t;a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();document.execCommand("copy");document.body.removeChild(a);}catch(e){}}
// A step that is commands to run: Open terminal, each command in a box of its own with Copy (run them one
// at a time, in order, each is checked before the next), then Done. 24 Oct 2026: "if it needs me to do
// something it needs to be more direct."
function runHtml(y){var r=y.run||[],h="<div class='brun'><div class='brun-h'><b>Run "+(r.length>1?'these, one at a time':'this')+"</b><button type='button' class='brun-term' title='opens a terminal on this computer"+(y.path?', in '+escQ(y.path):'')+"'>Open terminal</button></div>";
r.forEach(function(c,i){h+="<div class='brun-i'>"+(c.what||r.length>1?"<div class='brun-w'>"+(r.length>1?(i+1)+'. ':'')+esc(c.what||'')+"</div>":'')+"<div class='brun-c'><pre>"+esc(c.cmd)+"</pre><button type='button' class='brun-copy' data-i='"+i+"'>Copy</button></div></div>";});
return h+"<div class='brun-n'>"+(r.length>1?'Run each, wait for it to finish, then the next. ':'')+"When it has run, press Done. If it fails, tell the agent what it said.</div><div class='bo'><button type='button' class='nopt rec brun-done'><span class='bt'>Done</span></button></div></div>";}
function blobBody(y,home){var h='',nm=y.name||y.repo||(y.kind==='setup'?y.title:'')||'';
if(!y.local)h+="<button type='button' class='bx' title='Dismiss: it won&#39;t show here again (Undo brings it back)' aria-label='Dismiss this card'>&times;</button>";
var pc=projChip(y);
h+=home?"<button type='button' class='lt' title='open "+escQ(nm)+", with this lit up'>"+pc+"<span>"+esc(lqShort(nm,pc?22:30))+"</span><i>open &rsaquo;</i></button>":"<div class='nhead'>"+pc+"<b>"+esc(nm)+(y.kind==='ask'?" asks":"")+"</b>"+(y.more?"<span class='muted'>+"+y.more+" more on its block in Agents</span>":"")+"</div>";
if(y.kind!=='ask')return h+"<div class='bq'>"+esc(y.kind==='approve'?String(y.sub||'').replace(/ · only you decide$/,''):String(y.sub||'').charAt(0).toUpperCase()+String(y.sub||'').slice(1)+'.')+"</div><div class='bo'><button type='button' class='nopt rec ngo'><span class='bt'>"+(y.kind==='approve'?'Review and approve':y.kind==='lane'?'Pick its lane':y.id==='setup:inbox'?(y.signin?'Sign in again':'Show me your inbox'):y.id==='setup:ai'?'Connect an AI':y.pick?'Use '+y.pick.name:y.urgent?'Reconnect':'Open Settings')+"</span></button></div>";
var os=y.options||[];if(y.draft)h+=draftHtml(y.draft);if(y.status)h+="<div class='bwait'><i class=ic-pause></i> "+esc(y.status)+"</div>";var tk=String(y.task||'').replace(/^Agent:\\s*/,'').replace(/^New job[^:.]{0,40}:\\s*/i,''),dn=y.doing||((tk&&tk.slice(0,24)!==String(nm).slice(0,24)?"I'm on it: "+tk+(/[.!?…]$/.test(tk)?'':'.'):'')+(y.done?' So far: '+y.done:'')).trim();if(dn)h+="<div class='bdoing' title='"+escQ(dn)+"'><i class=ic-bot></i>"+esc(dn)+"</div>";h+="<div class='bq' title='"+escQ((y.q||'')+(y.why?' ('+y.why+')':''))+"'>"+codeText(y.q||y.sub||'')+"</div>"+(y.why?"<div class='bwhy' title='"+escQ(y.why)+"'>"+esc(y.why)+"</div>":"")+blobTalk(y.talk||BLOBTALK[bdKey(y)],nm);
if(y.report&&y.report.id)h+="<div class='bo'><button type='button' class='nopt brep' title='opens it on Reports'><span class='bt'>Read the report: "+esc(lqShort(y.report.title,60))+" &rsaquo;</span></button></div>";
if(y.fix==='handover'&&y.sub)h+="<div class='bfor' title='"+escQ(y.sub)+"'>for: "+esc(y.sub)+"</div>";
if(y.done&&typeof y.done==='object'&&y.done.lane)h+="<div class='bdone' title='"+escQ(y.done.text)+"'>"+esc(y.done.lane)+" has done this already: "+esc(y.done.text)+"</div>"; // (a string is what the agent says it has done so far, shown above)
if(y.doneBy&&y.doneBy.lane&&y.doneBy.text)h+="<div class='bdone' title='"+escQ(y.doneBy.text)+"'>Already done by "+esc(y.doneBy.lane)+"&#39;s agent: "+esc(y.doneBy.text)+"</div>";
if(y.run&&y.run.length)h+=runHtml(y);
if(y.shared)h+="<div class='bdone' title='"+escQ("Your answer to "+y.shared.lane+": "+y.shared.a+" (its agent has it too, and checks whether it settles this)")+"'>Got your answer to "+esc(lqShort(y.shared.lane,40))+": &ldquo;"+esc(lqShort(y.shared.a,80))+"&rdquo;</div>";
if(y.signInTo)h+="<div class='bo'><button type='button' class='nopt bsign' title='opens "+escQ(y.signInTo.name)+" in the Symbiot Browser: sign in there, then click Done'><span class='bt'>Sign in to "+esc(y.signInTo.name)+" &rsaquo;</span></button></div>";
// the recommended answer first and marked (the card writer's pick, else the agent's "(recommended)"), each
// button saying what pressing it does on hover; the order is only how they're shown, data-j is the answer
var rec=(y.rec!=null&&y.rec>=0&&y.rec<os.length)?y.rec:os.reduce(function(a,o,j){return a<0&&(os.length===1||/[(]recommended[)]/i.test(o))?j:a;},-1),ord=os.map(function(o,j){return j;});if(rec>0){ord.splice(rec,1);ord.unshift(rec);}
if(os.length)h+="<div class='bo'>"+ord.map(function(j){var o=os[j];return "<button type='button' class='nopt"+(j===rec?' rec':'')+"' data-j='"+j+"' title='"+escQ((y.tips&&y.tips[j])||(os.length===1?o:(y.labels&&y.labels[j])||o))+"'><span class='bt'>"+whoHtml(blobOpt((y.labels&&y.labels[j])||o))+"</span>"+(j===rec&&os.length>1?"<i class='brec'>recommended</i>":"")+"</button>";}).join('')+(y.tellAgent?"<button type='button' class='nopt btell'><span class='bt'>Tell the agent what you found</span></button>":"")+"</div><button type='button' class='bfree' aria-expanded='false'>"+(y.draft?'Change it':'or answer in your own words')+"</button>";
h+="<form class='bfx"+(os.length?' hidden':'')+"'><input placeholder='"+(y.draft?'what to change':'your answer')+"' aria-label='"+(y.draft?'what to change in the reply':'your answer to '+escQ(nm))+"'><button type='submit'>"+(y.draft?'Redraft':'Send')+"</button></form>";
if(home&&y.more)h+="<span class='bmore'>+"+y.more+" more question"+(y.more>1?'s':'')+" after this one</span>";
return h+"<div class='bst' role='status' aria-live='polite'></div>";}
// Answering in a blob is answering on the agent's block in Agents (Send answers &
// continue): saved to its ANSWERS.md, and its agent picks it up. Then it dissolves.
// A click shows at once: the button pressed, Sending… on the card, then the card goes, or
// says on itself what went wrong (a word in Home's talk alone went unseen: the Allow
// pressed again and again on 2026-10-12). One answer per question at a time (BLOBBUSY),
// through a redraw too, and a card answered stays away until Home has heard (BLOBSENT).
// What a click that failed said stays on its card through a redraw for a minute (BLOBFAIL),
// and that card, or one sending, stays on the page shown (blobHeld): pressing lets go of the
// focus, so a refresh paged it away with what it said (CI, 0.66.4 publish, 2026-10-16).
var BLOBBUSY={},BLOBSENT={},BLOBSENT_FOR=120000,BLOBFAIL={},BLOBFAIL_FOR=60000;
function blobFailed(k){var x=BLOBFAIL[k];return x&&Date.now()-x.at<BLOBFAIL_FOR?x.t:'';}
function blobHeld(k){return !!BLOBBUSY[k]||!!blobFailed(k);}
function blobSent(y){var t=BLOBSENT[bdKey(y)];return !!t&&Date.now()-t<BLOBSENT_FOR;}
function wireBlob(box,y,o){o=o||{};var say=o.say||lqSaid,nm=y.name||y.repo||'the agent',key=bdKey(y);
var lock=function(on){box.querySelectorAll('button,input').forEach(function(b){b.disabled=on;});};
var st=function(t,bad){var e=box.querySelector('.bst');if(!e)return;e.textContent=t||'';if(e.classList)e.classList.toggle('err',!!bad);if(o.grew)o.grew();};
var busy=function(on,b){if(box.classList)box.classList.toggle('sending',on);if(box.setAttribute)box.setAttribute('aria-busy',on?'true':'false');box.querySelectorAll('.pressed').forEach(function(x){x.classList.remove('pressed');});if(on&&b&&b.classList)b.classList.add('pressed');lock(on);};
var send=function(ans,j,b){ans=String(ans||'').trim();if(!ans||(!y.path&&!y.fix)||BLOBBUSY[key])return;BLOBBUSY[key]=1;delete BLOBFAIL[key];busy(true,b);st('Sending…');
var fail=function(t){delete BLOBBUSY[key];BLOBFAIL[key]={t:t,at:Date.now()};busy(false);st(t,true);say(nm+': '+t,true);};
(y.fix?api('/api/home/answer',j!=null?{id:y.id,pick:j}:{id:y.id,text:ans}):api('/api/agents/answer',{path:y.path,answers:[{q:y.raw||y.q,a:ans}],rerun:true})).then(function(r){
if(!r||r.error){fail((r&&r.error)||'the answer didn’t save. Try again on its block on the Workdesk.');return;}
// a question on the card, not its answer: the agent's reply goes under it, and the card stays
// sent either way: the box empties and its kept draft goes, else the next redraw put the words back in it (22 Oct 2026)
var clear=function(){bdSet(y,'');box.querySelectorAll('.bfx input,input.qother').forEach(function(i){i.value='';});};
if(r.keep){delete BLOBBUSY[key];clear();busy(false);st(r.said||'');return;}
if(r.talk){delete BLOBBUSY[key];clear();BLOBTALK[key]=r.talk;y.talk=r.talk;busy(false);st('');var tk=box.querySelector('.btalk'),html=blobTalk(r.talk,nm);if(tk)tk.outerHTML=html;else{var bq=box.querySelector('.bq');if(bq&&bq.insertAdjacentHTML)bq.insertAdjacentHTML('afterend',html);}if(o.grew)o.grew();return;}
delete BLOBBUSY[key];BLOBSENT[key]=Date.now();clear();st(r.already?'Answered already.':'Sent.');
say(y.fix?nm+': '+(r.said||'Done.'):r.already?nm+': '+r.note:'Sent to '+(r.lane||nm)+'. '+(r.report?'It is written already: Reports, \u201c'+r.report+'\u201d. ':'')+((r.also||[]).length?'Also given to '+r.also.join(', ')+', on the same work. ':'')+(r.yours&&r.yours.length?'Still yours to do: '+r.yours.join(' '):r.rerun?'Its agent is picking it up now.':(r.note||'Saved in its ANSWERS.md.')));
bdSet(y,'');if(o.sent)o.sent();if(box.classList)box.classList.add('gone');setTimeout(function(){if(o.done)o.done();},650);}).catch(function(e){fail(String((e&&e.message)||e));});};
if(BLOBBUSY[key]){busy(true);st('Sending…');} // drawn again while its answer is on its way
else if(blobFailed(key))st(blobFailed(key),true);
// Dismiss: the card goes from Home, the Workdesk and its project (home.mjs dismissCard), its draft with it; Undo brings it back
var bx=box.querySelector('.bx');if(bx)bx.addEventListener('click',function(){if(BLOBBUSY[key])return;bx.disabled=true;api('/api/home/dismiss',{key:key}).then(function(r){if(!r||r.error){bx.disabled=false;st((r&&r.error)||'It didn’t go. Try again.',true);return;}
bdSet(y,'');BLOBSENT[key]=Date.now();if(o.sent)o.sent();if(box.classList)box.classList.add('gone');setTimeout(function(){if(o.done)o.done();},650);
lqUndo('Dismissed: '+lqShort(y.kind==='ask'?(y.q||y.sub||nm):(y.title||y.sub||nm),70),function(){delete BLOBSENT[key];return api('/api/home/dismiss',{key:key,undo:true});});}).catch(function(e){bx.disabled=false;st(String((e&&e.message)||e),true);});});
box.querySelectorAll('.nopt[data-j]').forEach(function(b){b.addEventListener('click',function(){var j=+b.getAttribute('data-j');send((y.options||[])[j],j,b);});});
// Sign in says so at once on the card itself, and keeps the focus there while it opens. A disabled
// button let go of it, Home redrew the card plain meanwhile, and what it said went only to Home's
// chat, hidden when that's down: the click seemed to do nothing (2026-10-16).
var bs=box.querySelector('.bsign');if(bs)bs.addEventListener('click',function(){if(bs._busy)return;bs._busy=true;var sn=y.signInTo.name||y.signInTo.site||'the site';
st('Opening '+sn+' in the Symbiot Browser… a few seconds, longer if an agent is using it.');try{bs.focus();}catch(e){}
openSignIn(y.signInTo,function(t,ok){bs._busy=false;st(t,!ok);say(t,!ok);});});
var bt2=box.querySelector('.brun-term');if(bt2)bt2.addEventListener('click',function(){bt2.disabled=true;fetch('/api/terminal/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:y.path||''})}).then(function(r){return r.json();}).then(function(r){bt2.disabled=false;st(r&&r.ok?'Opened a terminal ('+r.via+').':(r&&r.error)||'Could not open a terminal.',!(r&&r.ok));}).catch(function(){bt2.disabled=false;st('Could not open a terminal.',true);});});
box.querySelectorAll('.brun-copy').forEach(function(b){b.addEventListener('click',function(){var c=(y.run||[])[+b.getAttribute('data-i')];if(!c)return;var done=function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy';},1500);};try{navigator.clipboard.writeText(c.cmd).then(done,function(){fallbackCopy(c.cmd);done();});}catch(e){fallbackCopy(c.cmd);done();}});});
var bdn=box.querySelector('.brun-done');if(bdn)bdn.addEventListener('click',function(){var tgt=(y.options||[]).length?box.querySelector('.nopt[data-j].rec')||box.querySelector('.nopt[data-j]'):null;if(tgt)tgt.click();else st('Tell the agent it is done in the box below.');}); // Done is the card's own recommended answer, the one that says it is done
var brp=box.querySelector('.brep');if(brp)brp.addEventListener('click',function(){showReport(y.report.id);});
var btl=box.querySelector('.btell');if(btl)btl.addEventListener('click',function(){var fr=box.querySelector('.bfree');if(fr&&fr.getAttribute('aria-expanded')!=='true')fr.click();var inp=box.querySelector('.bfx input');if(inp){inp.placeholder='what you found';inp.focus();}}); // the report its agent wrote, open on Reports
var bqx=box.querySelector('.bq');if(bqx)bqx.addEventListener('click',function(ev){if(ev&&ev.target&&ev.target.closest&&ev.target.closest('a,button'))return;bqx.classList.toggle('open');}); // two lines; a tap shows it all
var fr=box.querySelector('.bfree'),fx=box.querySelector('.bfx'),fi=fx&&fx.querySelector('input');
if(fi){var dr=bdGet(y);if(dr&&!fi.value){fi.value=dr.text;if(fx.classList)fx.classList.remove('hidden');if(fr)fr.setAttribute('aria-expanded','true');try{if(dr.s!=null)fi.setSelectionRange(dr.s,dr.e!=null?dr.e:dr.s);}catch(e){}}
// keep: a box drawn again while its answer went fires late events, which mustn't bring back the draft Send cleared
var keep=function(){if(BLOBBUSY[key]||blobSent(y))return;bdSet(y,fi.value,fi.selectionStart,fi.selectionEnd);};['input','keyup','mouseup','select'].forEach(function(t){fi.addEventListener(t,keep);});}
if(fr&&fx)fr.addEventListener('click',function(){var shut=fx.classList.toggle('hidden');fr.setAttribute('aria-expanded',shut?'false':'true');var i=fx.querySelector('input');if(!shut&&i&&i.focus)i.focus();if(o.grew)o.grew();});
if(o.grew&&fi&&fx&&!fx.classList.contains('hidden'))setTimeout(o.grew,0); // a draft brought back opened it
if(fx)fx.addEventListener('submit',function(ev){if(ev&&ev.preventDefault)ev.preventDefault();var i=fx.querySelector('input');if(!i||!String(i.value||'').trim()){st('Type your answer first.',true);if(i&&i.focus)i.focus();return;}send(i.value,null,fx.querySelector('button'));});
var go=box.querySelector('.ngo');if(go)go.addEventListener('click',function(){if(!y.pick){lqFocus(y);return;}
// Pick your agent: the one Symbiot found, in one click; Settings has the others
lock(true);api('/api/agentcmd',{cmd:y.pick.tmpl}).then(function(r){if(!r||r.error){lock(false);say((r&&r.error)||'It didn’t save. Pick it in Settings.',true);return;}
say('Your agent is '+y.pick.name+' now: Send to repos and Go hand your tasks to it.');if(box.classList)box.classList.add('gone');LQ.fresh=true;setTimeout(function(){if(o.done)o.done();else lqLoad(false);},650);}).catch(function(e){lock(false);say(String((e&&e.message)||e),true);});});}
function lqSaid(t){LQ.talk.push({me:false,text:t});LQ.talk=LQ.talk.slice(-8);lqTalkShow(false);}
// A lit orb opens its project with what lit it lit up and in view (lqLight): a
// repo's questions and its Approve, under "Needs you here" at the top of its
// tasks, with its held handovers; an ops run's question on its block in Agents;
// a north star on its part of Settings.
function lqFocus(y){lqAct();y=y||{};PENDALL=false;LQ.focus={kind:y.kind||'',repo:y.repo||'',path:y.path||'',focus:y.focus||'',shown:false};
document.querySelectorAll('main .lit').forEach(function(x){x.classList.remove('lit');}); // only what this orb lit stays lit
if(y.kind==='setup'){lqPool('settings');setTimeout(lqLight,300);return;}
if(!y.repo||y.repo==='ops'){lqPool('agents');return;}
TFILTER.id='';TFILTER.repo=y.repo;TFILTER.type='';lqPool('tasks');
api('/api/home?fresh=1').then(function(h){if(h&&h.you)LQ.home=h;renderNeeds();}).catch(function(){});}
// Needs you here: what only you can do in the project the Tasks list is filtered
// to, at its top, each answerable where it is; its held handovers under them.
function renderNeeds(){var el=$('needsbox');if(!el)return;var repo=TFILTER.repo;
// what an answer here said stays with the project it was about, not under the next one's cards
var po=$('pushout');if(po&&po.getAttribute('data-needs')!==null&&po.getAttribute('data-needs')!==String(repo||'')){po.innerHTML='';po.removeAttribute('data-needs');}if(!repo||TARCH){el.innerHTML='';return;}
var ys=((LQ.home&&LQ.home.you)||[]).filter(function(y){return y.repo===repo&&y.kind==='ask';});
var paint=function(held){if(TFILTER.repo!==repo)return;if(!ys.length&&!held.length){el.innerHTML='';lqLight();return;}
keepTyping(el,"<div class='tgroup' style='color:var(--amber)'>Needs you here <span class='tcount'>"+(ys.length+held.length)+"</span></div>"+
ys.map(function(y,i){return "<div class='task nitem lqblob' data-k='"+i+"' data-key='"+escQ(bdKey(y))+"'>"+blobBody(y,false)+"</div>";}).join('')+
held.map(function(x){return "<div class='task nitem'><div class='nhead'><b>"+esc(x.from)+" &rarr; "+esc(x.to)+"</b><span class='muted'>handed over, "+esc(LANEWORD.held)+"</span></div><div class='bq'>"+esc(x.text)+"</div></div>";}).join(''));
el.querySelectorAll('.nitem[data-k]').forEach(function(box){var y=ys[+box.getAttribute('data-k')];if(!y||box._wired)return;box._wired=true;
if(y.kind==='ask')wireBlob(box,y,{say:function(t,bad){var o=$('pushout');o.innerHTML="<div class='note "+(bad?'err':'ok')+"'>"+esc(t)+"</div>";o.setAttribute('data-needs',String(repo||''));},done:function(){LQ.home.you=(LQ.home.you||[]).filter(function(x){return x!==y;});LQ.fresh=true;renderNeeds();}});
else{var rv=box.querySelector('.ngo');if(rv){rv.innerHTML="<span class='bt'>Review it below</span>";rv.addEventListener('click',function(){var rc=null;document.querySelectorAll('#reviewlist .rcard').forEach(function(c){if(c.getAttribute('data-repo')===repo)rc=c;});if(!rc)return;rc.classList.add('lit');if(rc.scrollIntoView)rc.scrollIntoView({block:'center',behavior:'smooth'});var ap=rc.querySelector('.approve');if(ap&&ap.focus)ap.focus({preventScroll:true});});}}});
lqLight();};
api('/api/lanes').then(function(d){paint(((d&&d.handoffs)||[]).filter(function(x){return x.status==='held'&&(x.to===repo||x.from===repo);}));}).catch(function(){paint([]);});}
// What lit the orb, lit up where it opened (.lit): the first in view, and with only
// one, its first answer focused. Again after each re-render, but scrolled to once.
var SETFOCUS={ai:'provider',work:'scanroots',agent:'agentcmd',links:'links',company:'knowroots',checks:'knowchecks',phone:'phonelink'};
function lqLight(){var f=LQ.focus;if(!f||LQ.mode!=='pool')return;var things=[],also=[];
if(f.kind==='setup'){var a=$(SETFOCUS[f.focus]||''),s=a&&a.closest?a.closest('.sset'):null;if(f.focus==='checks'&&a)things.push(a);else if(s)things.push(s);}
else if(current==='tasks'&&f.repo&&f.repo!=='ops'){document.querySelectorAll('#needsbox .nitem').forEach(function(e){things.push(e);});document.querySelectorAll('#reviewlist .rcard').forEach(function(e){if(e.getAttribute('data-repo')===f.repo)(things.length?also:things).push(e);});}
else if(current==='tasks'){document.querySelectorAll('#agentslist .agent[data-i]').forEach(function(e){var g=AGENTLIST[+e.getAttribute('data-i')];if(g&&(nQs(g)||g.waiting)&&(f.path?g.path===f.path:/act-[0-9a-f]+$/.test(String(g.path))))things.push(e);});}
things.concat(also).forEach(function(e){if(e.classList)e.classList.add('lit');});
if(!things.length||f.shown)return;f.shown=true;var e0=things[0];if(e0.scrollIntoView)e0.scrollIntoView({block:'start',behavior:'smooth'});
if(things.length===1&&e0.querySelector){var c=e0.querySelector('.nopt,.aq input[type=radio],.qother,button.approve,select,input');if(c&&c.focus){try{c.focus({preventScroll:true});}catch(e){c.focus();}}}}
// The work, by task (the Workdesk) or by project (the Projects group): the same scene, a step in the history each.
function lqWorkBy(by){if(LQ.scene==='work'&&LQ.workBy===by&&LQ.mode!=='pool')return;lqRemember();LQ.back=true;LQ.workBy=by;try{lqWork();}finally{LQ.back=false;}}
// Back, one step: every move between screens (home, the Tasks scene, a panel, the
// Archive) notes where you were; a right-click (or the mouse's back button) returns
// there. In a text field or over selected text the browser's own menu stays.
function lqState(){return {by:LQ.workBy||'task',scene:LQ.scene==='work'?'work':'home',pool:LQ.mode==='pool'?(LQ.poolShape||null):null,arch:LQ.mode==='pool'&&!!LQ.arch};}
function lqRemember(){if(LQ.back)return;LQ.hist=LQ.hist||[];var s=lqState(),top=LQ.hist[LQ.hist.length-1];if(top&&top.scene===s.scene&&top.pool===s.pool&&top.arch===s.arch)return;LQ.hist.push(s);if(LQ.hist.length>40)LQ.hist.shift();}
function lqBack(){var h=LQ.hist||[],s=h.pop(),cur=lqState();if(!s){if(cur.pool)s={scene:cur.scene,pool:null};else if(cur.scene==='work')s={scene:'home',pool:null};else return;}
LQ.back=true;try{if(s.scene==='work'&&(cur.scene!=='work'||cur.by!==s.by)){LQ.workBy=s.by||'task';lqWork();}else if(s.scene==='home'&&cur.scene==='work')lqHome();
if(s.pool){if(s.arch)lqArchive();else lqPool(s.pool);}else if(LQ.mode==='pool')lqSink();}finally{LQ.back=false;}}
function lqPool(shape){if(shape==='computer'&&LQ.phone){lqSink();return;}lqWhy(null);if(shape==='map'&&LM.items&&LM.items.length)setTimeout(function(){lmFit();lmStart();},60);lqRemember();LQ.poolShape=shape;LQ.arch=false;tabPicked=true;setTab(shape);var b=document.body;if(b&&b.classList)b.classList.add('lq-pooled');LQ.mode='pool';var m=document.querySelector('main');if(m){m.scrollTop=0;if(m.focus)m.focus();}}
function lqSink(){lqWhy(null);lqRemember();LQ.focus=null;var b=document.body;if(b&&b.classList)b.classList.remove('lq-pooled');LQ.mode='aware';lqAct();lqLoad(false);}
function lqAct(){if(AWAY)return;LQ.lastAct=Date.now();if(LQ.mode==='rest'){LQ.mode='aware';lqLoad(true);}}
function lqTalkMode(on){LQ.talking=on;var b=document.body;if(b&&b.classList)b.classList.toggle('lq-talking',on);}
// Minimize: the chat shrinks back to its input and Home comes back as it was; what was
// said stays (LQ.talk), and "Chat · n" above the input opens it again. Esc, the chat's
// Minimize, or a click outside it do it; sending a message opens it again.
LQ.talkMin=false;
function lqTalkBar(){var el=$('lqtalkbar'),n=LQ.talk.length,b=document.body;if(!n)LQ.talkMin=false;if(b&&b.classList){b.classList.toggle('lq-chat',n>0&&!LQ.talkMin);b.classList.toggle('lq-chatmin',n>0&&LQ.talkMin);}if(!el)return;
var up="<svg width='12' height='12' viewBox='0 0 12 12' aria-hidden='true'><path d='M2.5 7.5 6 4l3.5 3.5' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>",down="<svg width='12' height='12' viewBox='0 0 12 12' aria-hidden='true'><path d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>";
var h=!n?'':LQ.talkMin?"<button type='button' class='lqtb-open' aria-expanded='false' aria-controls='lqtalk' title='open the chat again'>"+up+"Chat &middot; "+n+" message"+(n>1?'s':'')+"</button>":"<span class='lqtb-t'>Chat with Symbiot</span><button type='button' class='lqtb-min' aria-expanded='true' aria-controls='lqtalk' title='minimize the chat (Esc): Home comes back, the chat stays'>Minimize"+down+"</button>";
if(!sameHtml(el,h)){var bt=el.querySelector('button');if(bt)bt.addEventListener('click',function(){if(LQ.talkMin)lqChatOpen();else lqChatMin();});}}
function lqChatMin(){if(!LQ.talk.length||LQ.talkMin)return;LQ.talkMin=true;var i=$('lqask');if(i&&i.blur&&document.activeElement===i)i.blur();lqTalkMode(false);lqTalkBar();lqAct();}
function lqChatOpen(){LQ.talkMin=false;lqTalkMode(true);lqTalkShow(false);lqAct();var i=$('lqask');if(i&&i.focus)i.focus();}
function lqTalkShow(wait){var el=$('lqtalk');if(!el)return;var n=LQ.talk.length;el.innerHTML=LQ.talk.map(function(m,i){var age=n-1-i,op=age<2?1:age===2?0.7:age===3?0.45:0.25;return "<div class='lqmsg"+(m.me?' me':'')+"' style='opacity:"+op+"'>"+(m.imgs&&m.imgs.length?"<span class='lqmimgs'>"+m.imgs.map(function(d){return "<img src='"+d+"' alt='your screenshot'>";}).join('')+"</span>":"")+esc(m.text)+lqAltsHtml(m.go)+(m.signInTo?"<span class='lqalts'><button type='button' class='lqmb lqsign' data-i='"+i+"'>Sign in to "+esc(m.signInTo.name)+"</button></span>":"")+stepsHtml(m.steps)+"</div>";}).join('')+(wait?"<div class='lqmsg thinking'>Thinking: recalling what it knows, reading what's here&hellip;</div>":'');if(el.scrollHeight)el.scrollTop=el.scrollHeight;
el.querySelectorAll('[data-go]').forEach(function(b){b.addEventListener('click',function(){lqNav(b.getAttribute('data-go'));});});
el.querySelectorAll('.lqsign').forEach(function(b){b.addEventListener('click',function(){var m=LQ.talk[+b.getAttribute('data-i')];if(m)openSignIn(m.signInTo,function(t){lqSaid(t);});});});
// scrolled up to read back: the whole history shows, clear; back at the bottom it rolls on again
if(!el.wired&&el.addEventListener){el.wired=true;el.addEventListener('scroll',function(){var up=el.scrollHeight-el.scrollTop-el.clientHeight>24;if(el.classList)el.classList.toggle('back',up);});}lqTalkBar();}
`;
