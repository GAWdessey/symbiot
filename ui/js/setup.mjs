// symbiot — Away (Super + the key above Tab) and Setup, the first run.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// ---- Away (Super and the key above Tab) ------------------------------------------------------------
// ?away=1 from "symbiot away": this window is one of the screens. One screen: the
// orb rests in the middle. More: it bounces across their shared area (gw x gh) at
// the same pace in every window from the same start (t0), each drawing it while it's
// over its own part (ax, ay, aw x ah), so it crosses from screen to screen. Under it,
// the time and what's going on, counts only. Any key or click closes every window.
var AWAY=null;
(function(){try{var q=new URLSearchParams(location.search);if(q.get('away')!=='1')return;var n=function(k,d){var v=Number(q.get(k));return isFinite(v)&&q.get(k)!==null?v:d;};
AWAY={n:n('n',1),ax:n('ax',0),ay:n('ay',0),aw:n('aw',0),ah:n('ah',0),gw:n('gw',0),gh:n('gh',0),t0:n('t0',Date.now()),since:Date.now(),shown:Date.now()};}catch(e){}})();
var pingpong=function(d,L){if(L<=0)return 0;var m=d%(2*L);if(m<0)m+=2*L;return m<=L?m:2*L-m;};
function lqAwayPos(S){var cx=S.w/2,cy=S.h*0.42;if(!AWAY||AWAY.n<2||!AWAY.gw||!AWAY.aw)return {x:cx,y:cy};
var k=S.w/AWAY.aw,R=220,L=AWAY.gw-2*R,M=AWAY.gh-2*R,t=(Date.now()-AWAY.t0)/1000,v=95;
var gx=R+pingpong(v*t*0.83+L/2,L),gy=R+pingpong(v*t*0.56+M/2,M);
return {x:(gx-AWAY.ax)*k,y:(gy-AWAY.ay)*k};}
function awShort(t){t=String(t||'');var cut=[' - ',' \u00b7 ',' | '];cut.forEach(function(c){var i=t.indexOf(c);if(i>0)t=t.slice(0,i);});return t.trim();}
function awStatus(){var el=$('awstat');if(!el)return;Promise.all([api('/api/home').catch(function(){return {};}),api('/api/work').catch(function(){return {};})]).then(function(r){var h=r[0]||{},w=r[1]||{},out=[];
var runs=(w.running||[]).slice(0,4),nr=(w.running||[]).length||h.working||0;
out.push(nr?'<b>'+nr+' agent'+(nr===1?'':'s')+' at work</b>':'No agent at work');
runs.forEach(function(x){out.push("<span class='awr'>"+esc(x.lane||x.name||'')+': '+esc(runWarn(x)+(x.line||x.doing||'working on it')+(x.eta?' · '+x.eta:''))+'</span>');});
var y=h.youCount||0;out.push(y?'<b>'+y+' thing'+(y===1?'':'s')+' only you can do</b>':'Nothing needs you');
var fd=(h.feeds||[]).filter(function(f){return f.count;}).slice(0,4).map(function(f){return esc(awShort(f.title))+' '+f.count;});if(fd.length)out.push('Waiting: '+fd.join(' \u00b7 '));
el.innerHTML=out.join('<br>');}).catch(function(){});}
function awTick(){var tm=$('awtime'),dt=$('awdate');if(!tm)return;var d=new Date(),p=function(x){return (x<10?'0':'')+x;};tm.textContent=p(d.getHours())+':'+p(d.getMinutes());
dt.textContent=d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})+' \u00b7 away since '+p(new Date(AWAY.since).getHours())+':'+p(new Date(AWAY.since).getMinutes());}
function awPlace(){var o=$('lqaway');if(!o||!LQ.core)return;var S=lqSize(),c=LQ.core,h=o.offsetHeight||220,x=c.x-220,below=c.y+c.cr+30,y=below+h<S.h-10?below:c.y-c.cr-30-h;
o.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px)';o.style.opacity=(c.x+220<0||c.x-220>S.w)?'0':'1';}
// Its own screen, full: Chrome lists the screens (its profile lets this address see
// them) and puts this window full screen on the si-th, left to right; their places
// come from there too (scaled, as the page sees them). No list: full screen where it is.
function awayScreen(){var si=0;try{si=Number(new URLSearchParams(location.search).get('si'))||0;}catch(e){}
var fs=function(scr){var el=document.documentElement;try{var p=scr?el.requestFullscreen({screen:scr}):el.requestFullscreen();if(p&&p.catch)p.catch(function(){});}catch(e){}};
if(!AWAY||AWAY.n<2||!window.getScreenDetails){fs(null);return;} // one window: full screen where it is
window.getScreenDetails().then(function(d){var L=((d&&d.screens)||[]).slice().sort(function(a,b){return a.left-b.left||a.top-b.top;}),t=L[si]||L[0];if(!t){fs(null);return;}
var mn=function(f){return Math.min.apply(null,L.map(f));},mx=function(f){return Math.max.apply(null,L.map(f));},x0=mn(function(s){return s.left;}),y0=mn(function(s){return s.top;});
AWAY.n=L.length;AWAY.ax=t.left-x0;AWAY.ay=t.top-y0;AWAY.aw=t.width;AWAY.ah=t.height;AWAY.gw=mx(function(s){return s.left+s.width;})-x0;AWAY.gh=mx(function(s){return s.top+s.height;})-y0;
fs(t);}).catch(function(){fs(null);});}
function awayInit(){if(!AWAY||!document.body)return;document.body.classList.add('lq-away');LQ.mode='rest';awayScreen();
var o=document.createElement('div');o.id='lqaway';o.innerHTML="<div class='awt' id='awtime'></div><div class='awd' id='awdate'></div><div class='aws' id='awstat'></div><div class='awh'>Any key or click to come back</div>";document.body.appendChild(o);
awTick();awStatus();setInterval(awTick,5000);setInterval(awStatus,15000);
var bye=function(ev){if(Date.now()-AWAY.shown<1500)return;if(ev&&ev.type==='keydown'&&['Meta','OS','Super','Shift','Control','Alt','Hyper'].indexOf(ev.key)>=0)return;api('/api/away',{open:false}).catch(function(){});};
['keydown','mousedown','touchstart','wheel'].forEach(function(t){document.addEventListener(t,bye,true);});
var raf=window.requestAnimationFrame&&function(f){return window.requestAnimationFrame(f);};if(raf){var loop=function(){awPlace();raf(loop);};raf(loop);}}

// ---- Setup: the first run --------------------------------------------------------
// A new Symbiot shows this before anything else (home.mjs onboarding): what it is, your
// AI, where your work is, your agent, every app you use (connected, or "I don't use
// it"), your documents, then Home. Where you are is kept, so closing it resumes there.
var ONB=null,ONB_T=null,ONB_NAMES={computer:'Your computer',welcome:'Welcome',ai:'Your AI',work:'Your work',agent:'Your agent',apps:'Your apps',docs:'Documents',phone:'Your phone',done:'Done'};
function onbStep(d){var st=(ONB&&ONB.steps)||[],k=st.indexOf(ONB&&ONB.step);return st[k+d]||'';} // the step before (-1) or after (1) this one
function onbLoad(fresh){return api('/api/onboarding'+(fresh?'?fresh=1':'')).then(function(o){ONB=o;var el=$('onb');if(!el)return;if(!o||!o.pending){el.classList.add('hidden');document.body.classList.remove('lq-onb');if(ONB_T){clearInterval(ONB_T);ONB_T=null;}return;}
el.classList.remove('hidden');document.body.classList.add('lq-onb');onbRender();
if(!ONB_T)ONB_T=setInterval(function(){if(ONB&&ONB.pending&&['ai','work','agent','apps','phone','computer'].indexOf(ONB.step)>=0&&!onbBusy())onbLoad(ONB.step==='ai');},2500);}).catch(function(){});}
// not while you're typing in it
function onbBusy(){var a=document.activeElement;return !!(a&&$('onb').contains(a)&&(a.tagName==='INPUT'||a.tagName==='SELECT'));}
function onbGo(step){api('/api/onboarding/set',{step:step}).then(function(o){ONB=o;onbRender();var b=$('onbbody');if(b&&b.parentNode)b.parentNode.scrollTop=0;});}
function onbNav(prev,next,label,ok,later,tip){return "<div class='onbnav'>"+(prev?"<button class='back' data-go='"+prev+"'>Back</button>":"")+"<span class='sp'></span>"+(later&&ok===false&&next?"<button class='back' data-go='"+next+"' title='"+esc(tip||'Home keeps asking until it’s done')+"'>"+esc(later)+"</button>":"")+(next?"<button class='act' data-go='"+next+"'"+(ok===false?' disabled':'')+">"+esc(label||'Continue')+"</button>":"")+"</div>";}
function onbRender(){var o=ONB,b=$('onbbody'),d=$('onbdots');if(!o||!b)return;var st=o.steps||[],k=st.indexOf(o.step);
d.innerHTML=st.map(function(x,i){return "<i class='"+(i===k?'on':i<k?'past':'')+"' title='"+esc(ONB_NAMES[x]||x)+"'></i>";}).join('');
var h='';
if(o.step==='welcome'){
h="<img class='onborb' src='/favicon.svg?look="+encodeURIComponent(lqLookGet()||'ferro')+"' alt=''><h2 id='onbt'>Meet Symbiot</h2><p class='onbl'>It works alongside you, so your time goes on what only you can do.</p><div class='onbcards'>"+
[['It watches','What you work on and what comes in: your projects, your mail, chats and code.'],['It works','It hands tasks to your coding agent, which does them on its own and tells you what it did.'],['It asks','Only what only you can do: a sign-in, a decision, your OK before anything goes out.']].map(function(c){return "<div class='onbcard'><b>"+c[0]+"</b><span>"+c[1]+"</span></div>";}).join('')+
"</div><p class='onbnote'>Setup takes a few minutes: your AI, your work, your agent and every app you use. Symbiot starts finding your projects meanwhile.</p>"+(onbStep(1)==='done'?"<div class='onbnav'><button class='back' data-go='"+onbStep(-1)+"'>Back</button><span class='sp'></span><button class='act' id='onbfinish'>Open Symbiot</button></div>":onbNav(onbStep(-1), 'ai', 'Set it up'));}
else if(o.step==='ai'){var a=o.ai||{},c=a.claude||{};
h="<h2 id='onbt'>Your AI</h2><p class='onbl'>Symbiot thinks with an AI: it reads what comes in, talks with you and writes for you.</p>";
if(a.connected)h+="<div class='onbok'><i>✓</i><div>Symbiot is using <b>"+esc(a.line)+"</b>"+(a.provider==='claude'?". It’s the Claude account you’re signed in with in Claude Code: no key, nothing extra to pay.":".")+"</div></div>";
else h+="<div class='onbbox'><h3>Your Claude subscription (recommended)</h3><p>Symbiot thinks through Claude Code, Anthropic’s own app, with your Claude account: no key, and nothing extra to pay.</p>"+
(c.installing?"<p><span class='onbspin'></span>Installing Claude Code… this takes about a minute.</p>":
 !c.installed?"<button class='act' id='onbccinst'>Install Claude Code</button>"+(c.installError?"<p class='onbnote' style='margin-top:10px'>"+esc(c.installError)+"</p>":""):
 c.signingIn?"<p><span class='onbspin'></span>Sign in on the page that opened in your browser. This ticks itself when you’re done.</p><div class='onbrow'><input id='onbcccode' placeholder='If the page shows a code, paste it here'><button class='ghost' id='onbccsend'>Send</button></div>":
 "<p>Claude Code is installed. Now sign in with your Claude account.</p><button class='act' id='onbccsign'>Sign in with Claude</button>"+(c.signinError?"<p class='onbnote' style='margin-top:10px'>"+esc(c.signinError)+"</p>":""))+
"<p class='onbnote' style='margin:12px 0 0'>Already done it yourself? <button class='back' id='onbrecheck' style='padding:0'>Check again</button></p></div>"+
"<div class='onbbox'><h3>Or an API key, or a free local model</h3><div class='onbrow'><select id='onbprov'><option value='anthropic'>Claude (Anthropic) API key</option><option value='openai'>OpenAI API key</option><option value='gemini'>Gemini API key</option><option value='ollama'>Local model (Ollama), no key</option></select><input id='onbkey' type='password' placeholder='paste your key'><button class='ghost' id='onbconnect'>Connect</button></div><p id='onbaimsg' style='margin:8px 0 0'></p></div>";
h+=onbNav('welcome','work','Continue',!!a.connected,'Set up later');}
else if(o.step==='work'){var w=o.work||{};
h="<h2 id='onbt'>Your work</h2><p class='onbl'>Symbiot finds the projects on this computer, so it knows what you’re working on and where to send each task.</p>";
h+=w.searching||!w.at?"<p><span class='onbspin'></span>Looking through your folders"+(w.total?": "+w.done+" of "+w.total+" checked":"")+"…</p>":"<p>"+(w.count?"Found <b>"+w.count+"</b> project"+(w.count>1?'s':'')+". Is that all of them? If one’s missing, add the folder it’s in below.":"I searched your folders and found no projects. Add the folder they’re in.")+"</p>";
if(w.repos&&w.repos.length)h+="<div class='onbrepos'>"+w.repos.slice(0,40).map(function(r){return "<span title='"+esc(r.path)+"'>"+esc(r.name)+"</span>";}).join('')+(w.count>40?"<span>and "+(w.count-40)+" more</span>":"")+"</div>";
h+="<div class='onbbox' style='margin-top:14px'><p>Looking in: "+((w.roots||[]).map(function(r){return "<code>"+esc(r)+"</code>";}).join(' ')||'your home folder')+"</p><div class='onbrow'><input id='onbroot' placeholder='Add a folder, e.g. ~/work'><button class='ghost' id='onbaddroot'>Add</button></div></div>";
h+=onbNav('ai','agent');}
else if(o.step==='agent'){var g=o.agent||{},cur=(g.agents||[]).find(function(x){return x.tmpl===g.cmd;}),pk=g.pick;
h="<h2 id='onbt'>Your agent</h2><p class='onbl'>Your coding agent takes the tasks Symbiot hands it and does them on its own, inside that project. Symbiot stops it from pushing to main, publishing, deleting outside the project or touching your keys.</p>";
if(g.cmd)h+="<div class='onbok'><i>✓</i><div>Tasks go to <b>"+esc(cur?cur.label:'your agent')+"</b>.</div></div>";
else if(pk)h+="<div class='onbbox'><h3>"+esc(pk.name)+" is on this computer</h3><p>"+esc(pk.label)+"</p><button class='act' id='onbuse' data-cmd='"+esc(pk.tmpl)+"'>Use "+esc(pk.name)+"</button></div>";
else h+="<div class='onbbox'><h3>No coding agent found</h3><p>Install Claude Code (<code>npm install -g @anthropic-ai/claude-code</code>) to let Symbiot hand work over. You can carry on and add it later in Settings.</p></div>";
h+=onbNav('work','apps');}
else if(o.step==='apps'){var ap=o.apps||[],left=ap.filter(function(x){return !x.skipped&&x.state==='off';}).length;
h="<h2 id='onbt'>Your apps</h2><p class='onbl'>Connect every app you use, so Symbiot sees what comes in. Each opens in a window to sign in; Symbiot keeps the sign-in on this computer. Mark the ones you don’t use.</p>";
(o.groups||[]).forEach(function(gp){var rows=ap.filter(function(x){return x.group===gp;});if(!rows.length)return;h+="<div class='onbgrp'>"+esc(gp)+"</div>";
rows.forEach(function(x){var stt=x.skipped?"<span class='st'>Not used</span><button class='ghost' data-unskip='"+esc(x.id)+"'>Undo</button>":
x.state==='off'?"<button class='act' data-link='"+esc(x.id)+"'>Connect</button><button class='ghost' data-skip='"+esc(x.id)+"'>I don’t use it</button>":
x.state==='ok'?"<span class='st ok'>✓ Connected"+(x.agents?" · your agents can use it too":"")+"</span>":
"<span class='st wait'>"+(x.state==='signedout'?'Signed out':'Sign in in the window that opened')+"</span><button class='ghost' data-check='"+esc(x.id)+"'>Check</button><button class='ghost' data-link='"+esc(x.id)+"'>Open again</button>";
h+="<div class='onbapp'><span class='nm'>"+esc(x.name)+"</span>"+stt+"</div>";});});
h+="<div class='onbfoot'><p class='onbnote'>"+(left?left+" left to decide. ":"All decided. ")+(left?"<button class='ghost' id='onbskiprest'>I don’t use the rest</button>":"")+"</p>"+onbNav('agent','docs','Continue',!!o.decided,'Set up later','Connect the rest any time in Settings, under Connections')+"</div>";}
else if(o.step==='docs'){var fs=(o.docs||{}).folders||[];
h="<h2 id='onbt'>Your documents</h2><p class='onbl'>Optional. A folder of your company’s documents lets Symbiot quote them when you ask, and spot where they disagree (a deadline on someone’s leave, a price told two ways).</p>";
if(fs.length)h+="<div class='onbok'><i>✓</i><div>"+fs.map(function(f){return "<code>"+esc(f)+"</code>";}).join(' ')+"</div></div>";
h+="<div class='onbbox'><div class='onbrow'><input id='onbdoc' placeholder='A folder, e.g. ~/Company'><button class='ghost' id='onbadddoc'>Add</button></div><p id='onbdocmsg' style='margin:8px 0 0'></p></div>";
h+=onbNav('apps',onbStep(1),fs.length?'Continue':'Skip for now');}
else if(o.step==='phone'){var pp=o.phone||{},pn=pp.phones||[];
h="<h2 id='onbt'>Your phone</h2><p class='onbl'>Optional. Your tasks, what needs you and your agents’ questions on your phone, with Symbiot’s app there: tick, add, answer and approve from it, at home or away.</p>";
if(pn.length)h+="<div class='onbok'><i>✓</i><div>Paired: <b>"+esc(pn.join(', '))+"</b>. Your work is on it now.</div></div>";
else if(pp.on&&pp.listening&&pp.qr)h+="<div class='onbbox'>"+phoneQr(pp,"Symbiot’s Settings → <b>Your phone</b>")+"<p class='onbnote' style='margin:0'>Away from home, what they send passes through symbiot.co.za, sealed: it can’t read it. No app on your phone yet? It’s at <a href='https://symbiot.co.za' target='_blank' rel='noopener'>symbiot.co.za</a>.</p></div>";
else h+=(pp.error?"<p class='onbnote err'>"+esc(pp.error)+"</p>":"")+"<div class='onbbox'><h3>Pair the app on your phone</h3><p>This computer shows a code for your phone to scan. It listens on your Wi-Fi for your phone alone, and everything between the two is sealed with a key they agree.</p><button class='act' id='onbphone'>"+(pp.on&&pp.listening?'New code':'Show the code')+"</button></div>";
h+=onbNav('docs','done',pn.length?'Continue':'I don’t have the app');}
else if(o.step==='computer'){var pc0=o.phone||{};
h="<h2 id='onbt'>Your computer</h2><p class='onbl'>Does Symbiot run on your computer? Pair this phone with it and your work there is here too: your tasks, what needs you, your agents’ questions, and Approve, at home or away.</p>";
if(pc0.paired)h+="<div class='onbok'><i>✓</i><div>Paired with <b>"+esc(pc0.name)+"</b>. Its work is on Home, in its own droplet.</div></div><div class='onbnav'><button class='back' data-go='welcome'>Also use Symbiot on this phone</button><span class='sp'></span><button class='act' id='onbfinish'>Open Symbiot</button></div>";
else h+="<div class='onbbox'><h3>Scan the code your computer shows</h3><p>In Symbiot on your computer, open Settings → <b>Your phone</b> and switch it on: it shows a QR. Point this phone’s camera at it and tap its link.</p><p id='onbpairmsg' class='onbnote' style='margin:0'></p></div>"+
"<div class='onbbox'><h3>Or type its address and code</h3><div class='onbrow'><input id='onbpaddr' placeholder='e.g. 192.168.8.50:7392'><input id='onbpcode' placeholder='code' inputmode='numeric' style='flex:0 0 100px;min-width:0'><button class='ghost' id='onbppair'>Pair</button></div><div class='onbrow' style='margin-top:8px'><button class='ghost' id='onbpfind'>Look for it on this network</button></div><div id='onbpfound' class='pcfound'></div></div>"+
"<div class='onbnav'><span class='sp'></span><button class='act' data-go='welcome'>No computer: use Symbiot on this phone</button></div>";}
else{var conn=(o.apps||[]).filter(function(x){return x.state!=='off'&&!x.skipped;}).length;
h="<h2 id='onbt'>You’re set up</h2><p class='onbl'>Here’s what Symbiot has to work with. You can change any of it in Settings.</p><div class='onbbox'><p>"+
[(o.ai&&o.ai.connected?'✓ ':'· ')+'AI: '+esc((o.ai&&o.ai.line)||'not connected'),(((o.work||{}).count)?'✓ ':'· ')+((o.work||{}).count||0)+' project'+(((o.work||{}).count)===1?'':'s'),(o.agent&&o.agent.cmd?'✓ ':'· ')+'Agent: '+(o.agent&&o.agent.cmd?'ready':'none yet'),(conn?'✓ ':'· ')+(conn?conn+' app'+(conn===1?'':'s')+' connected':'no apps connected yet')].concat(o.pro&&o.pro.plan==='trial'?['✓ Pro: free for '+o.pro.trialDaysLeft+' more day'+(o.pro.trialDaysLeft===1?'':'s')+', then Free unless you add a key (Settings → Symbiot Pro)'+(o.pro.upgrade?". <a href='"+esc(okUrl(o.pro.upgrade))+"' target='_blank' rel='noopener'>Get Pro</a>":'')]:o.pro&&(o.pro.plan==='pro'||o.pro.plan==='owner')?['✓ Pro']:[]).concat(o.phone&&o.phone.role==='computer'?[((o.phone.phones||[]).length?'✓ Phone: '+esc(o.phone.phones.join(', ')):'· Phone: not paired (Settings → Your phone)')]:o.phone&&o.phone.paired?['✓ Computer: '+esc(o.phone.name)]:[]).join('<br>')+
"</p></div><h3 style='margin:18px 0 4px;font:600 15px var(--sans);color:var(--bone)'>Finding your way</h3><ul class='onbtour'><li>Each orb is a place: tap it to open it, right-click to go back.</li><li>Amber means something needs you.</li><li>Talk to Symbiot at the bottom: ask anything, or tell it what to do. It remembers what you tell it (Settings → What Symbiot remembers).</li><li>Paste a password or a key there and it goes into Symbiot’s vault, never into the chat or a file.</li><li>Pick a look at the top: Glass, Ferrofluid or Pearl.</li></ul>"+
"<div class='onbnav'><button class='back' data-go='"+onbStep(-1)+"'>Back</button><span class='sp'></span><button class='act' id='onbfinish'>Open Symbiot</button></div>";}
b.innerHTML=h;
b.querySelectorAll('[data-go]').forEach(function(x){x.addEventListener('click',function(){onbGo(x.getAttribute('data-go'));});});
var on=function(id,f){var x=$(id);if(x)x.addEventListener('click',f);};
on('onbrecheck',function(){onbLoad(true);});
on('onbccinst',function(){api('/api/claude/install',{}).then(function(){onbLoad(true);});});
on('onbccsign',function(){api('/api/claude/signin',{}).then(function(){onbLoad(true);});});
on('onbccsend',function(){var v=$('onbcccode').value.trim();if(!v)return;api('/api/claude/code',{code:v}).then(function(){onbLoad(true);});});
on('onbconnect',function(){var pv=$('onbprov').value,m=$('onbaimsg');m.textContent='Checking…';api('/api/connect',{provider:pv,key:$('onbkey').value.trim(),model:''}).then(function(r){m.textContent=r.message||'';onbLoad(true);});});
var pvs=$('onbprov');if(pvs)pvs.addEventListener('change',function(){$('onbkey').style.display=pvs.value==='ollama'?'none':'';});
on('onbaddroot',function(){var v=$('onbroot').value.trim();if(!v)return;api('/api/scanroots/add',{path:v}).then(function(){onbLoad();});});
on('onbuse',function(){var c=$('onbuse').getAttribute('data-cmd');api('/api/agentcmd',{cmd:c}).then(function(){onbLoad();});});
on('onbskiprest',function(){api('/api/onboarding/set',{skipRest:true}).then(function(r){ONB=r;onbRender();});});
on('onbadddoc',function(){var v=$('onbdoc').value.trim();if(!v)return;api('/api/knowledge/add',{path:v}).then(function(r){$('onbdocmsg').textContent=r&&r.error?r.error:'';onbLoad();});});
on('onbfinish',function(){api('/api/onboarding/done',{}).then(function(){onbLoad();LQ.fresh=true;lqLoad(true);});});
on('onbphone',function(){var x=$('onbphone');x.disabled=true;api(ONB.phone&&ONB.phone.on&&ONB.phone.listening?'/api/phone/code':'/api/phone/link',{on:true}).then(function(){onbLoad();});});
on('onbppair',function(){var m=$('onbpairmsg'),x=$('onbppair');x.disabled=true;api('/api/phone/pair',{address:$('onbpaddr').value,code:$('onbpcode').value}).then(function(r){x.disabled=false;if(r&&r.error){if(m)m.textContent=r.error;return;}onbLoad();LQ.fresh=true;});});
on('onbpfind',function(){phoneFind($('onbpfind'),$('onbpfound'),function(u){$('onbpaddr').value=u.replace(/^http:[/][/]/,'');$('onbpcode').focus();});});
b.querySelectorAll('[data-link]').forEach(function(x){x.addEventListener('click',function(){x.disabled=true;api('/api/links/link',{id:x.getAttribute('data-link')}).then(function(){onbLoad();});});});
b.querySelectorAll('[data-check]').forEach(function(x){x.addEventListener('click',function(){x.disabled=true;api('/api/links/check',{id:x.getAttribute('data-check')}).then(function(){onbLoad();});});});
b.querySelectorAll('[data-skip]').forEach(function(x){x.addEventListener('click',function(){api('/api/onboarding/set',{skip:x.getAttribute('data-skip')}).then(function(r){ONB=r;onbRender();});});});
b.querySelectorAll('[data-unskip]').forEach(function(x){x.addEventListener('click',function(){api('/api/onboarding/set',{unskip:x.getAttribute('data-unskip')}).then(function(r){ONB=r;onbRender();});});});}
function lqIcon(l){var q='/favicon.svg?look='+encodeURIComponent(l||'ferro'),k=document.querySelector('link[rel=icon]');if(k)k.setAttribute('href',q+'&small=1');var d=document.querySelector('header .dot');if(d)d.style.backgroundImage="url('"+q+"&small=1')";document.querySelectorAll('img.onborb').forEach(function(im){im.src=q;});}
function lqInit(){var bd=document.body;if(!bd||!bd.classList)return;lqIcon(lqLookGet());lqTheme();try{i18nStart();}catch(e){}bd.classList.add('lq-liquid');
['(prefers-color-scheme: light)','(prefers-contrast: more)','(forced-colors: active)','(prefers-reduced-transparency: reduce)','(prefers-reduced-motion: reduce)'].forEach(function(q){try{var mq=window.matchMedia&&window.matchMedia(q);if(mq&&mq.addEventListener)mq.addEventListener('change',lqTheme);else if(mq&&mq.addListener)mq.addListener(lqTheme);}catch(e){}});
if(document.addEventListener){document.addEventListener('contextmenu',function(ev){var b=document.body,t=ev&&ev.target;if(!b||!b.classList||!b.classList.contains('lq-liquid'))return;if(t&&t.closest&&t.closest('input,textarea,select,[contenteditable]'))return;var sel=window.getSelection?String(window.getSelection()):'';if(sel)return;ev.preventDefault();lqBack();});
document.addEventListener('mouseup',function(ev){var b=document.body;if(ev&&ev.button===3&&b&&b.classList&&b.classList.contains('lq-liquid')){ev.preventDefault();lqBack();}});}
var L=$('liquid');if(L&&L.addEventListener){L.addEventListener('click',function(ev){var t=ev&&ev.target;if(t&&t.closest&&t.closest('button,input,form,.lqd'))return;var x=ev.clientX,y=ev.clientY,hit=null;LQ.drops.forEach(function(d){if(!hit&&Math.hypot(x-d.x,y-d.y)<=d.cr+8)hit=d;});if(hit)lqOpen(hit,ev);else if(LQ.openTag)lqTag(LQ.openTag);});L.addEventListener('pointermove',function(ev){LQ.pointer=[ev.clientX,ev.clientY];if(ev.pointerType==='touch')LQ.touch=true;lqAct();});L.addEventListener('pointerdown',function(ev){if(ev.pointerType==='touch')LQ.touch=true;lqAct();});}
var mic=$('lqmic');if(mic&&voiceOk()){mic.classList.remove('hidden');mic.addEventListener('click',function(){voiceToggle();});try{if(window.speechSynthesis)window.speechSynthesis.getVoices();}catch(e){}}
var f=$('lqform');if(f&&f.addEventListener)f.addEventListener('submit',function(ev){if(ev&&ev.preventDefault)ev.preventDefault();lqSay();});
var ia=$('lqask');if(ia&&ia.addEventListener){ia.addEventListener('paste',function(ev){var it=(ev.clipboardData&&ev.clipboardData.items)||[],got=false;for(var k=0;k<it.length;k++){if(it[k].kind==='file'&&String(it[k].type).indexOf('image/')===0){lqAttach(it[k].getAsFile());got=true;}}if(got)ev.preventDefault();});
var fm=$('lqform');if(fm&&fm.addEventListener){fm.addEventListener('dragover',function(ev){ev.preventDefault();if(fm.classList)fm.classList.add('drop');});fm.addEventListener('dragleave',function(){if(fm.classList)fm.classList.remove('drop');});fm.addEventListener('drop',function(ev){ev.preventDefault();if(fm.classList)fm.classList.remove('drop');var fs=(ev.dataTransfer&&ev.dataTransfer.files)||[];for(var k=0;k<fs.length;k++)lqAttach(fs[k]);});}
ia.addEventListener('focus',function(){if(!LQ.talkMin)lqTalkMode(true);lqAct();});ia.addEventListener('blur',function(){if(!ia.value&&!LQ.talk.length)lqTalkMode(false);});ia.addEventListener('input',lqGrowAsk);
// Enter sends, Shift+Enter is a new line (and Enter mid-composition, an IME's, is the IME's)
ia.addEventListener('keydown',function(ev){if(ev&&ev.key==='Enter'&&!ev.shiftKey&&!ev.isComposing&&ev.keyCode!==229){ev.preventDefault();lqSay();return;}});
ia.addEventListener('keydown',function(ev){if(ev&&ev.key==='Escape'){if(LQ.mode==='pool'){lqSink();return;}if(LQ.talk.length&&!LQ.talkMin){lqChatMin();return;}if(LQ.scene==='work'&&!ia.value){lqHome();return;}ia.value='';lqGrowAsk();lqTalkMode(false);if(ia.blur)ia.blur();}});}
// Esc anywhere on Home, or a click outside the chat (its messages, its bar, the input), minimizes it
if(document.addEventListener){document.addEventListener('keydown',function(ev){var t=ev&&ev.target;if(!ev||ev.key!=='Escape'||!LQ.talk.length||LQ.talkMin||LQ.mode==='pool')return;if(t&&t.closest&&t.closest('#lqform,main,input,textarea,select'))return;lqChatMin();});
document.addEventListener('pointerdown',function(ev){var t=ev&&ev.target;if(!LQ.talk.length||LQ.talkMin||LQ.mode==='pool')return;if(t&&t.closest&&t.closest('#lqtalk,#lqtalkbar,#lqform,#lqatts'))return;lqChatMin();},true);}
var co=$('lqcore');if(co&&co.addEventListener)co.addEventListener('click',function(){var i=$('lqask');if(i&&i.focus)i.focus();});
var sk=$('lqsink');if(sk&&sk.addEventListener)sk.addEventListener('click',lqSink);
var bk=$('lqback');if(bk&&bk.addEventListener)bk.addEventListener('click',lqHome);
var pj=$('lqprojects');if(pj&&pj.addEventListener)pj.addEventListener('click',lqProjToggle);
glLow(GLLOW);var lw=$('lqlow');if(lw&&lw.addEventListener)lw.addEventListener('click',function(){glLow(!GLLOW);});
var lk=$('lqlook');if(lk&&lk.querySelectorAll){var cur=lqLookGet();lk.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-checked',b.getAttribute('data-look')===cur?'true':'false');b.addEventListener('click',function(){lqLook(b.getAttribute('data-look'));});});}
var gb=$('lqgo');if(gb&&gb.addEventListener)gb.addEventListener('click',lqGoWork);
var so=$('lqsort');if(so&&so.querySelectorAll)so.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-checked',b.getAttribute('data-sort')===LANESORT?'true':'false');b.addEventListener('click',function(){lqSort(b.getAttribute('data-sort'));});});
var mn=document.querySelector('main');if(mn&&mn.addEventListener)mn.addEventListener('keydown',function(ev){if(ev&&ev.key==='Escape')lqSink();});
lqLoad(true);
// the only clocks: rest when left alone, fresh data now and then, the hour (night)
setInterval(function(){if(LQ.mode==='aware'&&!LQ.talking&&Date.now()-LQ.lastAct>LQ_REST)LQ.mode='rest';if(LQ.mode!=='pool')lqLoad(false);var h=new Date().getHours(),n=h>=22||h<6;if(n!==LQ.theme.night)lqTheme();},30000);
var G=lqGL();if(G){try{lqStep();lqDraw(G);}catch(e){}}if(typeof window.requestAnimationFrame!=='function')return;var raf=function(f){return window.requestAnimationFrame(f);};
function frame(){if(!document.hidden){LQ.frame++;if(LQ.mode!=='pool'||LQ.frame%3===0)lqStep();var every=glLight()?glEvery(LQ.mode==='aware'):LQ.mode==='pool'?6:LQ.mode==='rest'?2:1;if(G&&LQ.frame%every===0&&!(LQ.phone&&LQ.scene!=='work'&&LQ.mode!=='pool'))lqDraw(G);}raf(frame);} // moves every frame; drawn less at rest, behind a panel, without a GPU, with Low GPU or in a window not in use; not at all under a phone's Home list
raf(frame);}

syncP();refresh();firstTab();lqInit();qInit();onbLoad();var sbo=$('sbopen');if(sbo)sbo.addEventListener('click',function(){sbOpen('');});var rr=$('rerunsetup');if(rr)rr.addEventListener('click',function(){api('/api/onboarding/restart',{}).then(function(){lqSink();onbLoad();});});awayInit();lqDeep();loadWhatsNew();loadPhone(); // loadPhone: the Termux note, from the page itself (no request)
// Screens and Watch (the box under the Map) load when the box opens (Settings': setTab)
var sbx=$('screensbox');function loadScreensBox(){loadScreensUI();loadMonitorsUI();loadWatchUI();}
if(sbx&&sbx.addEventListener)sbx.addEventListener('toggle',function(){if(sbx.open)loadScreensBox();});
setInterval(function(){if(current==='map'&&sbx&&sbx.open)whenFree(document.querySelector('main'),'watch',loadWatchUI);},60000);
`;
