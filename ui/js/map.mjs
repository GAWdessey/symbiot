// symbiot — the Map, in the liquid: your repos and folders as droplets in lanes.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// ---- the Map, in the liquid -------------------------------------------------------
// Your repos and project folders as droplets in the look, in lanes by kind: what
// needs you first (a question or a review waiting), then repos with your commits, the
// other repos, folders without git, and the act-* folders agent runs work in, as one
// group until you open it. Each lane runs newest first on a grid as wide as the map,
// so no two labels meet however many there are, and a lane's name folds it away.
// The page scrolls down the lanes; ctrl+scroll (a pinch), + and - zoom. Point at a
// droplet: the ones most like it (mapknn.mjs) light up and say why. Click: its details.
var LM={G:null,on:false,all:[],items:[],edges:[],lanes:[],shut:{runs:true},view:{k:1,x:0,y:0},hot:null,pan:null,built:false,lw:0,ch:0,cw:172,x0:0};
var LMLANES=[['need','Needs you'],['mine','Your repos'],['other','Other repos'],['folders','Folders without git'],['runs','Agent run folders']];
function lmTilde(p){p=String(p||'');var parts=p.split('/');return (parts[1]==='home'||parts[1]==='Users')&&parts.length>2?'~'+(parts.length>3?'/'+parts.slice(3).join('/'):''):p;}
function lmName(id){var n=GRAPH&&nodeById(id);return n?n.label:String(id).split('/').pop();}
function lmNearHtml(id){var k=GRAPH&&GRAPH.knn,ns=k&&k.neighbours&&k.neighbours[id];if(!ns||!ns.length)return '';
return "<div class='k'>Most like it</div><ul class='lmnear'>"+ns.map(function(n){return "<li><button type='button' data-id='"+escQ(n.id)+"'><b>"+esc(lmName(n.id))+"</b><span>"+esc(n.why.join('; ')||'a little alike')+"</span></button></li>";}).join('')+"</ul>";}
function lmNearWire(el){if(el&&el.querySelectorAll)el.querySelectorAll('.lmnear button').forEach(function(b){b.addEventListener('click',function(){selectNode(b.getAttribute('data-id'));});});}
function lmWeeks(d){var n=GRAPH&&nodeById('repo:'+d.path),w=n&&n.meta&&n.meta.weeks;if(!w||!w.length)return '';var mx=Math.max.apply(null,w.concat([1]));
return "<div class='k'>Your last 12 weeks</div><div class='lmweeks' role='img' aria-label='"+w.join(', ')+" commits a week'>"+w.map(function(x){return "<i style='height:"+Math.max(2,Math.round(28*x/mx))+"px' title='"+x+" commits'></i>";}).join('')+"</div>";}
// what needs you (home.mjs workScene): per project, a question or work ready for your
// OK; per run folder, the questions its run left you
function lmNeeds(){var o={repo:{},path:{}};((LQ.workData&&LQ.workData.projects)||[]).forEach(function(p){var s=p.asks?p.asks+' question'+(p.asks>1?'s':'')+' for you':p.shipping?'approving: '+p.shipping:p.ready?'ready for your OK':'';if(s)o.repo[p.repo]=s;
(p.qs||[]).forEach(function(q){if(q.path&&!o.path[q.path])o.path[q.path]=String(q.q||'a question for you');});});return o;}
// when it was last worked on: its last commit, or an agent's last session there
function lmWhen(m){var t=m&&m.last?Date.parse(m.last)||0:0;((m&&m.agents)||[]).forEach(function(a){if(a.last*1000>t)t=a.last*1000;});return t;}
function lmBuild(g){var el=$('lmap');if(!el||!g)return;LM.g=g;LM.knn=g.knn||{neighbours:{},edges:[],clusters:[],vitality:{}};
if(!LQ.workData){LQ.workData={};api('/api/work').then(function(w){LQ.workData=w||{};if(LM.g===g)lmBuild(g);}).catch(function(){});}
var nodes=g.nodes.filter(function(n){return n.type==='repo'||n.type==='folder';}),mx=1,need=lmNeeds();nodes.forEach(function(n){var c=(n.meta&&n.meta.commits)||0;if(c>mx)mx=c;});
LM.all=nodes.map(function(n){var m=n.meta||{},v=LM.knn.vitality[n.id]||0,c=m.commits||0,run=/^act-[0-9a-f]{6,}$/i.test(n.label),fold=n.type==='folder'||run,nd=need.path[m.path]||(run?'':need.repo[n.label]||'');
return {id:n.id,n:n,v:v,c:c,fold:fold,run:run,when:lmWhen(m),need:nd,lane:nd?'need':run?'runs':fold?'folders':c?'mine':'other',r:fold?9:(11+15*Math.sqrt(c/mx))*(0.75+0.25*v),x:0,y:0};});
lmLayout(true);
// the rest of what you build with, as a quiet row under the map
var L=LM.all,tl=$('lmtools');if(tl){var langs={};L.forEach(function(a){((a.n.meta&&a.n.meta.langs)||[]).forEach(function(x){langs[x]=(langs[x]||0)+1;});});
var lg=Object.keys(langs).sort(function(x,y){return langs[y]-langs[x];});var tools=g.nodes.filter(function(n){return n.type==='tool'||n.type==='agent'||n.type==='ai';});
tl.innerHTML=(lg.length?"<div class='lmrow'><span class='lmk'>Languages</span>"+lg.map(function(x){return "<button type='button' class='lmt' data-id='lang:"+escQ(x)+"'>"+esc(x)+"<small>"+langs[x]+"</small></button>";}).join('')+"</div>":"")+
(tools.length?"<div class='lmrow'><span class='lmk'>You build with</span>"+tools.map(function(n){return "<button type='button' class='lmt' data-id='"+escQ(n.id)+"'>"+esc(n.label)+"</button>";}).join('')+"</div>":"");
tl.querySelectorAll('.lmt').forEach(function(b){b.addEventListener('click',function(){selectNode(b.getAttribute('data-id'));});});}
if(!LM.built){LM.built=true;lmWire();}lmStart();}
// The lanes on a grid as wide as the map is now: a cell a droplet, its name under it.
function lmLayout(fit){var el=$('lmap');if(!el)return;var w=el.clientWidth||900,CW=LM.cw,RH=92,cols=Math.max(1,Math.floor((w-40)/CW)),x0=Math.max(20,(w-cols*CW)/2),y=18,items=[],lanes=[];
LMLANES.forEach(function(D){var m=LM.all.filter(function(a){return a.lane===D[0];}).sort(function(a,b){return b.when-a.when||b.c-a.c||(a.n.label<b.n.label?-1:1);});if(!m.length)return;
var shut=!!LM.shut[D[0]],show=!shut?m:D[0]==='runs'?[{id:'group:runs',group:true,n:{label:m.length+' agent runs',meta:{}},fold:true,r:17,v:1,c:0,need:'',when:m[0].when,lane:'runs',x:0,y:0}]:[];
lanes.push({key:D[0],title:D[1],n:m.length,shut:shut,y:y});y+=30;
show.forEach(function(a,i){a.x=x0+CW/2+(i%cols)*CW;a.y=y+30+Math.floor(i/cols)*RH;items.push(a);});y+=Math.ceil(show.length/cols)*RH+16;});
LM.items=items;LM.lanes=lanes;LM.ch=y;LM.x0=x0;LM.lw=w;LM.lk=null;if(el.style)el.style.height=Math.max(300,Math.round(y))+'px'; // as tall as its lanes: the page scrolls, not the map
if(LM.hot&&items.indexOf(LM.hot)<0)LM.hot=null;
var byId={};items.forEach(function(a){byId[a.id]=a;});LM.edges=(LM.knn.edges||[]).filter(function(e){return byId[e.a]&&byId[e.b];}).map(function(e){return {a:byId[e.a],b:byId[e.b],sim:e.sim};});
var ov=$('lmov');if(ov){ov.innerHTML=items.map(function(a,i){var m=a.n.meta||{},sub=a.group?'act-* folders &middot; show them':a.need?esc(a.need):a.fold?(a.run?'agent run':'folder')+(a.when?' &middot; '+lmAgo(a.when):', no git'):(a.c?a.c+(a.c===1?' commit':' commits'):'not yours')+(m.last?' &middot; '+lmAgo(m.last):'');
return "<button type='button' class='lml"+(a.v<0.25&&!a.fold&&!a.need?' dormant':'')+(a.fold?' fold':'')+(a.need?' need':'')+"' data-i='"+i+"' title='"+escQ(a.n.label)+"'><b>"+esc(a.n.label)+"</b><span>"+sub+"</span></button>";}).join('')+
lanes.map(function(L,i){return "<button type='button' class='lmlane"+(L.key==='need'?' need':'')+"' data-l='"+i+"' aria-expanded='"+(L.shut?'false':'true')+"' title='"+(L.shut?'show':'fold')+" this lane'>"+esc(L.title)+"<small>"+L.n+"</small><span>"+(L.shut?'show':'fold')+"</span></button>";}).join('')+
items.filter(function(a){return a.fold;}).map(function(a){return "<i class='lmring"+(a.group?' group':'')+(a.need?' need':'')+"' data-id='"+escQ(a.id)+"'></i>";}).join('');
LM.labs=[].slice.call(ov.querySelectorAll('.lml[data-i]'));LM.lnb=[].slice.call(ov.querySelectorAll('.lmlane'));LM.rings=[].slice.call(ov.querySelectorAll('.lmring'));
LM.labs.forEach(function(b){var a=items[+b.getAttribute('data-i')];b.addEventListener('click',function(){lmPick(a);});b.addEventListener('pointerenter',function(){lmHot(a);});b.addEventListener('focus',function(){lmHot(a);});b.addEventListener('pointerleave',function(){lmHot(null);});b.addEventListener('blur',function(){lmHot(null);});});
LM.lnb.forEach(function(b){var L=lanes[+b.getAttribute('data-l')];b.addEventListener('click',function(){LM.shut[L.key]=!L.shut;lmLayout(false);});});}
if(fit)lmFit();}
// a droplet clicked: its details, or the act-* group opened
// what needs you opens where you answer it, like its lane on Home
function lmPick(a){if(!a)return;if(a.group){LM.shut.runs=false;lmHot(null);lmLayout(false);return;}if(a.need){lmHot(null);lqFocus({kind:'proj',repo:a.run?'ops':a.n.label,path:a.run?(a.n.meta||{}).path:''});return;}selectNode(a.id);}
function lmAgo(day){var t=typeof day==='number'?day:Date.parse(day);if(!t)return day;var d=Math.round((Date.now()-t)/86400000);return d<=0?'today':d===1?'yesterday':d<14?d+' days ago':d<60?Math.round(d/7)+' weeks ago':Math.round(d/30)+' months ago';}
function lmFit(){var el=$('lmap');if(!el||!LM.all.length)return;if(el.clientWidth&&Math.abs(el.clientWidth-LM.lw)>4)lmLayout(false);LM.view={k:1,x:0,y:0};}
function lmHot(a){LM.hot=a;var tip=$('lmtip');var near={};if(a&&GRAPH&&GRAPH.knn)(GRAPH.knn.neighbours[a.id]||[]).forEach(function(n){near[n.id]=n;});
(LM.labs||[]).forEach(function(b){var it=LM.items[+b.getAttribute('data-i')];if(b.classList&&it){b.classList.toggle('near',!!(a&&near[it.id]));b.classList.toggle('far',!!(a&&it!==a&&!near[it.id]));}});
if(!tip)return;if(!a){tip.className='lmtip';return;}if(a.group){tip.innerHTML="<b>"+esc(a.n.label)+"</b><span class='lmts'>the act-* folders Symbiot's agent runs work in</span><div class='lmtn'>Click to show them all.</div>";tip.className='lmtip on';return;}
var m=a.n.meta||{},ns=(GRAPH&&GRAPH.knn&&GRAPH.knn.neighbours[a.id])||[];
tip.innerHTML="<b>"+esc(a.n.label)+"</b><span class='lmts'>"+(a.need?esc(a.need)+' &middot; ':'')+(a.run?'the folder an agent run worked in':a.fold?'a project folder, not a git repo':(m.commits||0)+((m.commits||0)===1?' commit':' commits')+(m.last?' &middot; last '+lmAgo(m.last):'')+(m.branch?' &middot; on '+esc(m.branch):''))+"</span>"+(ns.length?"<div class='lmtn'>"+ns.map(function(n){return "<div><b>"+esc(lmName(n.id))+"</b> "+esc(n.why.join('; ')||'a little alike')+"</div>";}).join('')+"</div>":"<div class='lmtn'>Nothing else is much like it.</div>");tip.className='lmtip on';}
function lmS(p){return {x:p.x*LM.view.k+LM.view.x,y:p.y*LM.view.k+LM.view.y};}
function lmWire(){var el=$('lmap');if(!el||!el.addEventListener)return;
el.addEventListener('wheel',function(e){if(!e||!e.ctrlKey)return;e.preventDefault();var r=el.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,k0=LM.view.k,k=Math.max(0.4,Math.min(3,k0*Math.exp(-e.deltaY*0.004)));LM.view.x=mx-(mx-LM.view.x)*k/k0;LM.view.y=my-(my-LM.view.y)*k/k0;LM.view.k=k;},{passive:false});
el.addEventListener('pointerdown',function(e){if(e.target&&e.target.closest&&e.target.closest('button,.lmtip'))return;LM.pan={x:e.clientX,y:e.clientY,vx:LM.view.x,vy:LM.view.y,moved:false};if(el.setPointerCapture)el.setPointerCapture(e.pointerId);});
el.addEventListener('pointermove',function(e){if(LM.pan){var dx=e.clientX-LM.pan.x,dy=e.clientY-LM.pan.y;if(Math.abs(dx)+Math.abs(dy)>3)LM.pan.moved=true;LM.view.x=LM.pan.vx+dx;LM.view.y=LM.pan.vy+dy;return;}
var r=el.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,hit=null;LM.items.forEach(function(a){var p=lmS(a);if(!hit&&Math.hypot(mx-p.x,my-p.y)<=a.r*LM.view.k+6)hit=a;});if(hit!==LM.hot&&!(e.target&&e.target.closest&&e.target.closest('.lml')))lmHot(hit);});
el.addEventListener('pointerup',function(e){var p=LM.pan;LM.pan=null;if(p&&!p.moved&&LM.hot&&!(e.target&&e.target.closest&&e.target.closest('button')))lmPick(LM.hot);});
el.addEventListener('pointerleave',function(){if(!LM.pan)lmHot(null);});
var zi=$('lmin'),zo=$('lmout'),zf=$('lmfit');function z(f){var w=el.clientWidth/2,h=el.clientHeight/2,k0=LM.view.k,k=Math.max(0.4,Math.min(3,k0*f));LM.view.x=w-(w-LM.view.x)*k/k0;LM.view.y=h-(h-LM.view.y)*k/k0;LM.view.k=k;}
if(zi)zi.addEventListener('click',function(){z(1.25);});if(zo)zo.addEventListener('click',function(){z(0.8);});if(zf)zf.addEventListener('click',lmFit);}
function lmStart(){if(LM.on)return;var raf=typeof window.requestAnimationFrame==='function'?function(f){return window.requestAnimationFrame(f);}:null;if(!raf)return;LM.on=true;
var loop=function(){var p=$('panel-map'),el=$('lmap');if(!p||!el||!el.offsetParent){LM.on=false;return;}LM.fr=(LM.fr||0)+1;if(LM.fr%glEvery(true)===0)lmFrame();raf(loop);};raf(loop);}
function lmFrame(){var el=$('lmap'),cv=$('lmc');if(!el||!cv||!LM.items.length)return;if(!LM.G)LM.G=lqGL(cv,64);var w=el.clientWidth,h=el.clientHeight,t=LM.t=(LM.t||0)+0.016,still=LQ.theme&&LQ.theme.still;
if(w&&Math.abs(w-LM.lw)>4)lmLayout(false);
// kept on the lanes: no scrolling past the top or the last lane
var V=LM.view,k=V.k,lo=Math.min(12,h-LM.ch*k-12);V.y=Math.max(lo,Math.min(12,V.y));V.x=Math.max(Math.min(0,w-LM.lw*k)-40,Math.min(Math.max(0,w-LM.lw*k)+40,V.x));
var P=LM.items.map(function(a,i){var p=lmS(a);if(!still){p.x+=Math.sin(t*0.4+i*1.7)*1.5;p.y+=Math.cos(t*0.35+i*2.3)*1.5;}return p;});
// a name never wider than its cell, whatever the zoom
if(LM.lk!==k){LM.lk=k;(LM.labs||[]).forEach(function(b){if(b.style)b.style.maxWidth=Math.max(44,Math.round(LM.cw*k-14))+'px';if(b.classList)b.classList.toggle('tiny',k<0.75);});}
(LM.labs||[]).forEach(function(b){var i=+b.getAttribute('data-i'),a=LM.items[i],p=P[i];if(!b.style||!a)return;b.style.transform='translate('+Math.round(p.x-(b.offsetWidth||0)/2)+'px,'+Math.round(p.y+a.r*k+4)+'px)';});
(LM.lnb||[]).forEach(function(b){var L=LM.lanes[+b.getAttribute('data-l')];if(b.style&&L)b.style.transform='translate('+Math.round(LM.x0*k+V.x)+'px,'+Math.round(L.y*k+V.y)+'px)';});
(LM.rings||[]).forEach(function(rg){var i=-1;LM.items.forEach(function(a,j){if(a.id===rg.getAttribute('data-id'))i=j;});if(i<0||!rg.style)return;var R=Math.round(LM.items[i].r*k);rg.style.width=rg.style.height=(2*R)+'px';rg.style.transform='translate('+Math.round(P[i].x-R)+'px,'+Math.round(P[i].y-R)+'px)';});
var tip=$('lmtip');if(tip&&LM.hot){var hi=LM.items.indexOf(LM.hot),hp=P[hi];if(hp){var tw=tip.offsetWidth||280,th=tip.offsetHeight||100,tx=Math.max(10,Math.min(w-tw-10,hp.x+LM.hot.r*k+16)),ty=Math.max(10,Math.min(h-th-10,hp.y-th/2));if(tx<hp.x&&hp.x+LM.hot.r*k+16+tw>w)tx=Math.max(10,hp.x-LM.hot.r*k-16-tw);tip.style.transform='translate('+Math.round(tx)+'px,'+Math.round(ty)+'px)';}}
// what the droplet you point at is most like, as faint lines to them
var sv=$('lmlines');if(sv){var ln='';if(LM.hot)LM.edges.forEach(function(e){if(e.a!==LM.hot&&e.b!==LM.hot)return;var a=P[LM.items.indexOf(e.a)],b=P[LM.items.indexOf(e.b)];ln+="<line x1='"+a.x.toFixed(1)+"' y1='"+a.y.toFixed(1)+"' x2='"+b.x.toFixed(1)+"' y2='"+b.y.toFixed(1)+"' class='hot'/>";});sv.innerHTML=ln;}
var G=LM.G;if(!G)return;var gl=G.gl,d=glDpr(2),W=Math.max(1,Math.floor(w*d)),H=Math.max(1,Math.floor(h*d));if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;gl.viewport(0,0,W,H);}
var o=G.out;for(var z=0;z<o.length;z++)o[z]=0;var n=0,put=function(x,y,r,a){if(n>=64||r<=0)return;o[n*4]=x/w;o[n*4+1]=y/h;o[n*4+2]=r;o[n*4+3]=a||0;n++;};
// only what's in view: the lanes can hold more than the liquid draws at once
LM.items.forEach(function(a,i){var R=a.r*k;if(!a.fold&&P[i].y>-R-20&&P[i].y<h+R+20&&P[i].x>-R-20&&P[i].x<w+R+20)put(P[i].x,P[i].y,R*(LM.hot===a?1.08:1),a.need?1:0);});
var th=LQ.theme||{},U=G.U;gl.uniform2f(U.uRes,W,H);gl.uniform1f(U.uT,t);gl.uniform1f(U.uDpr,d);gl.uniform4fv(U.uB,o);gl.uniform3f(U.uRip,0,0,-10);gl.uniform1f(U.uStyle,th.look==='glass'?0:th.look==='pearl'?2:1);gl.uniform1f(U.uContrast,th.contrast?1:0);gl.uniform1f(U.uExposure,th.night?0.82:1);gl.drawArrays(gl.TRIANGLES,0,3);}

`;
