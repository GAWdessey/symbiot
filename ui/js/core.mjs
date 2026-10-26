// symbiot — shared helpers: the API, redraws that keep your selection, panels, Settings' first steps, language, licence, where you are.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `var T=(function(){var q=new URLSearchParams(location.search),t=q.get('t')||window.SYMBIOT_T||'';try{if(t)sessionStorage.setItem('symbiot_t',t);else t=sessionStorage.getItem('symbiot_t')||'';}catch(e){}if(q.has('t')||q.has('p')){q.delete('t');q.delete('p');try{history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);}catch(e){}}return t;})(); // the token leaves the address bar (history, the window title) and stays in this tab for reloads (15 Oct 2026)
function api(path,body){return fetch(path,{method:body?'POST':'GET',headers:{'x-symbiot-token':T,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json();});}
// a GET that gives up after ms (the heartbeat: a stalled server is told apart from a lost one)
function apiIn(ms,path){return fetch(path,{headers:{'x-symbiot-token':T},signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(ms):undefined}).then(function(r){return r.json();});}
var KEYURL={claude:'https://claude.com/claude-code',anthropic:'https://console.anthropic.com/settings/keys',openai:'https://platform.openai.com/api-keys',gemini:'https://aistudio.google.com/apikey',ollama:'https://ollama.com'};
var DEFMODEL={claude:'your plan’s default',anthropic:'claude-opus-5-5',openai:'gpt-4o-mini',gemini:'gemini-flash-latest',ollama:'llama3.1'};
function $(id){return document.getElementById(id);}
// Live updates never pull text out from under your selection. A refresh that would
// redraw what you're selecting in waits until you let it go (selWait), and a redraw
// with nothing new leaves the nodes as they are (sameHtml), so copying works while
// updates arrive.
function selIn(el){try{var s=window.getSelection&&window.getSelection();if(!el||!s||s.isCollapsed||!s.rangeCount)return false;return !!(el.contains&&(el.contains(s.anchorNode)||el.contains(s.focusNode)));}catch(e){return false;}}
var SELWAIT={};function selWait(key,f){SELWAIT[key]=f;}
if(document.addEventListener)document.addEventListener('selectionchange',function(){var ks=Object.keys(SELWAIT);if(!ks.length)return;var s=window.getSelection&&window.getSelection();if(s&&!s.isCollapsed)return;var w=SELWAIT;SELWAIT={};ks.forEach(function(k){try{w[k]();}catch(e){}});});
function whenFree(el,key,f){if(selIn(el)){selWait(key,f);return false;}f();return true;}
function sameHtml(el,h){if(el._h===h)return true;el.innerHTML=h;el._h=h;return false;}
// As sameHtml, but the card you're typing in (a child of el with data-key, holding
// the focus) stays the very same node: the rest is rebuilt around it, and it takes
// its new twin's place and data-i without leaving the page, so its text, focus and
// cursor survive. Home redrew every card on any change (a count, an agent's step)
// and wiped a half-typed answer (2026-10-09). With no twin (the card's gone) it's
// rebuilt as usual: its draft is kept anyway (bdSet). Its content may be a redraw
// behind, so the next call draws it afresh.
function keepTyping(el,h){if(el._h===h)return true;
var f=document.activeElement,k=f&&f!==document.body&&el.contains&&el.contains(f)&&f.closest?f.closest('[data-key]'):null;
if(!k||k.parentNode!==el){el.innerHTML=h;el._h=h;return false;}
var t=document.createElement('div');t.innerHTML=h;var key=k.getAttribute('data-key'),twin=null;
for(var c=t.firstChild;c;c=c.nextSibling)if(c.getAttribute&&c.getAttribute('data-key')===key){twin=c;break;}
if(!twin){el.innerHTML=h;el._h=h;return false;}
if(twin.getAttribute('data-i')!==null)k.setAttribute('data-i',twin.getAttribute('data-i'));
while(el.firstChild&&el.firstChild!==k)el.removeChild(el.firstChild);while(k.nextSibling)el.removeChild(k.nextSibling);
while(t.firstChild&&t.firstChild!==twin)el.insertBefore(t.firstChild,k);t.removeChild(twin);while(t.firstChild)el.appendChild(t.firstChild);
el._h='';return false;}
var current='map',WDJUMP=0;var mapLoaded=false;var driftLoaded=false;
// Opened as Agents (its agents, a run's question): the Workdesk, at its agents, once
// the tasks above them and the agents are drawn; not if you've moved, or something's lit.
function wdJump(){if(!WDJUMP||current!=='tasks')return;if(Date.now()-WDJUMP>5000){WDJUMP=0;return;}var wa=$('panel-agents');if(document.querySelector('main .lit'))return;if(wa&&wa.scrollIntoView)wa.scrollIntoView({block:'start'});}
(function(){var m=document.querySelector('main');if(m&&m.addEventListener)['wheel','pointerdown','keydown','touchstart'].forEach(function(e){m.addEventListener(e,function(){WDJUMP=0;},{passive:true});});})();
// Settings' and the phone's data load when their panel opens, not with the page: it fired
// ~22 requests for panels not on screen on every open, one listing the displays (15 Oct 2026)
function setTab(tab){WDJUMP=0;if(tab==='agents'){tab='tasks';WDJUMP=Date.now();}current=tab;
var isMap=tab==='map',isSet=tab==='settings',isTasks=tab==='tasks',isDrift=tab==='drift',isBoard=tab==='board',isRun=(tab==='week'||tab==='standup'||tab==='todo');
$('panel-map').classList.toggle('hidden',!isMap);
$('panel-board').classList.toggle('hidden',!isBoard);if(isBoard){loadBoard();loadLinks();}
$('panel-run').classList.toggle('hidden',!isRun);
$('panel-settings').classList.toggle('hidden',!isSet);if(isSet){loadFirstSteps();licLoad();langLoad();intuLoad();ovrLoad();loadAgentCfg();loadScanRoots();loadKnowledge();loadLinks();loadLine();loadMind();loadSecrets();triLoad();loadTrusted();loadMail();loadDesktop();loadPhoneLink();}
$('panel-tasks').classList.toggle('hidden',!isTasks);
$('panel-drift').classList.toggle('hidden',!isDrift);
$('panel-reports').classList.toggle('hidden',tab!=='reports');if(tab==='reports')loadReports();
$('panel-asks').classList.toggle('hidden',tab!=='asks');if(tab==='asks')loadAsks();
$('panel-marketing').classList.toggle('hidden',tab!=='marketing');if(tab==='marketing')loadMarketing();
$('panel-computer').classList.toggle('hidden',tab!=='computer');if(tab==='computer')loadComputer();
$('panel-vault').classList.toggle('hidden',tab!=='vault');if(tab==='vault'){vaultSay('');loadVault();}else{if(VLT.del)vaultFlush();if(VLT.token||Object.keys(VLT.shown).length)vaultLockNow();else if($('vaultmsg')&&$('vaultmsg').innerHTML)vaultSay('');} // leaving it locks it
if(isRun){$('what').textContent=tab;wuHead();WUTEXT='';$('out').textContent=WUEMPTY;$('out').classList.add('muted');$('copy').classList.add('hidden');$('outfoot').style.display='none';if(tab==='week')showLatestWeek();}
if(isMap&&!mapLoaded)loadMap();
if(isTasks)loadTasks();
if(isDrift&&!driftLoaded)loadDrift();
if(isTasks)loadAgents(); else stopAgentsPoll();
lqTitle();if(isTasks&&TFILTER.repo)loadParked(lqTitle);}
// First steps, at the top of Settings, in order: connect an AI, where your work is,
// your agent, link one site (and whether agent runs can use it), a company folder
// (optional, or skipped). Each ticks itself as it's done anywhere in Settings; Go
// takes you to its part, lit up. The block goes once all are done.
var FSKIP='symbiot-skip-company';
function fsKey(id){return id==='company'?FSKIP:'symbiot-skip-'+id;}
function fsSkipped(id){try{return !!(window.localStorage&&window.localStorage.getItem(fsKey(id||'company')));}catch(e){return false;}}
// The app in your language (lang.mjs). Its own words on screen are swapped for their
// translation (your AI makes each once; they're kept, so it's instant after that).
// Numbers stay out of what's translated: "3 at work" is "{#} at work". Your content
// (tasks, chats, drafts, write-ups, names, code, anything typed) is never touched,
// and new things are translated as they appear.
var I18N={on:false,lang:'',map:{},want:{},tried:{},timer:0,busy:false,orig:new WeakMap(),attrs:new WeakMap(),dirty:[],raf:0,obs:null};
var I18N_SKIP="[data-nt],.t,.tfull,.lqmsg,.dmsg,.wkfinal,.wkraw,.rname,.btf,#lqtalk,code,pre,kbd,textarea,script,style,svg";
var I18N_W=String.fromCharCode(32,9,10,13,160);
var I18N_WS=new RegExp('['+I18N_W+']+','g'),I18N_EDGE=new RegExp('^(['+I18N_W+']*)([^]*?)(['+I18N_W+']*)$');
var I18N_NUM=/[0-9]+([.,][0-9]+)?/g;
function i18nKey(s){return String(s).replace(I18N_WS,' ').trim().replace(I18N_NUM,'{#}');}
function i18nOk(k){if(!k||k.length>400||!/[A-Za-z]/.test(k))return false;if(/@|:[/][/]|[/][A-Za-z0-9._-]+[/]/.test(k))return false;if(/^[a-z0-9._-]+$/.test(k)&&/[._0-9-]/.test(k))return false;return true;}
function i18nFill(src,tr){var nums=String(src).match(I18N_NUM)||[],i=0;return tr.replace(/[{]#[}]/g,function(){return nums[i++]||'';});}
function i18nOne(v){var m=String(v).match(I18N_EDGE),core=m?m[2]:String(v),k=i18nKey(core);if(!i18nOk(k))return null;var tr=I18N.map[k];
if(tr==null){if(!I18N.tried[k]){I18N.want[k]=1;i18nLater();}return null;}return (m?m[1]:'')+i18nFill(core,tr)+(m?m[3]:'');}
function i18nSkip(el){return !el||!!(el.closest&&el.closest(I18N_SKIP))||!!el.isContentEditable;}
function i18nText(n){var o=I18N.orig.get(n),v=n.nodeValue,src=o&&v===o.tr?o.src:v,out=i18nOne(src);if(out!=null&&out!==v){I18N.orig.set(n,{src:src,tr:out});n.nodeValue=out;}}
function i18nAttrs(el){if(/^(TEXTAREA|INPUT)$/.test(el.tagName||"")?i18nSkip(el.parentElement):i18nSkip(el))return;['placeholder','title','aria-label'].forEach(function(a){if(!el.hasAttribute||!el.hasAttribute(a))return;var rec=I18N.attrs.get(el)||{},cur=el.getAttribute(a),src=rec[a]&&cur===rec[a].tr?rec[a].src:cur,out=i18nOne(src);if(out!=null&&out!==cur){rec[a]={src:src,tr:out};I18N.attrs.set(el,rec);el.setAttribute(a,out);}});}
function i18nWalk(root){if(!I18N.on||!root)return;
if(root.nodeType===3){if(!i18nSkip(root.parentElement))i18nText(root);return;}
if(root.nodeType!==1||!root.isConnected)return;i18nAttrs(root);if(i18nSkip(root))return;root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(i18nAttrs);
var w=document.createTreeWalker(root,5,{acceptNode:function(n){if(n.nodeType===1)return (n.matches(I18N_SKIP)||n.isContentEditable)?2:3;return 1;}}),t;
while((t=w.nextNode()))i18nText(t);}
function i18nLater(){if(I18N.timer)return;I18N.timer=setTimeout(i18nFlush,350);}
function i18nFlush(){I18N.timer=0;if(I18N.busy){i18nLater();return;}var ks=Object.keys(I18N.want).slice(0,400);if(!ks.length)return;
ks.forEach(function(k){delete I18N.want[k];I18N.tried[k]=1;});I18N.busy=true;i18nNote(true);
api('/api/i18n',{lang:I18N.lang,strings:ks}).then(function(r){var m=(r&&r.map)||{};for(var k in m)I18N.map[k]=m[k];I18N.busy=false;i18nWalk(document.body);if(Object.keys(I18N.want).length)i18nLater();else i18nNote(false);}).catch(function(){I18N.busy=false;i18nNote(false);});}
// the first time in a language there's a lot to translate: say so, quietly, until it's done
function i18nNote(on){var el=$('i18nnote');if(on&&Object.keys(I18N.map).length<150){if(!el){el=document.createElement('div');el.id='i18nnote';el.setAttribute('data-nt','');el.setAttribute('role','status');document.body.appendChild(el);}el.textContent='Translating Symbiot into '+((LANG&&(LANG.own||LANG.name))||I18N.lang)+'… the first time takes a minute.';el.className='on';}else if(!on&&el){el.className='';}}
function i18nWatch(){if(I18N.obs||typeof MutationObserver!=='function')return;
I18N.obs=new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==='childList')m.addedNodes.forEach(function(n){I18N.dirty.push(n);});else I18N.dirty.push(m.target);});
if(!I18N.raf)I18N.raf=requestAnimationFrame(function(){I18N.raf=0;var d=I18N.dirty;I18N.dirty=[];d.forEach(function(n){i18nWalk(n);});});});
I18N.obs.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});}
function i18nStart(){api('/api/language/set',{auto:(navigator.languages&&navigator.languages[0])||navigator.language||''}).then(function(st){if(!st||!st.lang)return;I18N.lang=st.lang;LANG=st;
try{document.documentElement.lang=st.lang;}catch(e){}
if(st.english)return;I18N.on=true;
api('/api/i18n/all?lang='+encodeURIComponent(st.lang)).then(function(r){I18N.map=(r&&r.map)||{};i18nWalk(document.body);i18nWatch();}).catch(function(){i18nWatch();});}).catch(function(){});}
// Settings: the language, your computer's or any you name
var LANG=null;
function langLoad(){api('/api/language').then(langRender).catch(function(){});}
// Settings → On its own (intuition.mjs): the switch, saved as you tick it
function intuRender(d){if(!d||d.error)return;var box=$('intumode');if(!box)return;box.querySelectorAll('button').forEach(function(b){b.classList.toggle('act',b.getAttribute('data-m')===d.mode);b.classList.toggle('ghost',b.getAttribute('data-m')!==d.mode);});
$('intunote').textContent=d.mode==='watch'&&!d.chosen&&d.watchUntil?'Watching until '+new Date(d.watchUntil).toLocaleString([], {weekday:'short',hour:'2-digit',minute:'2-digit'})+', then it acts, unless you choose here.':d.mode==='watch'?'It tells you what it would have done, on Updates and in the digest, and does nothing.':d.mode==='off'?'Off: it does nothing on its own.':'';
var f=$('intufocus');if(f&&document.activeElement!==f)f.value=d.focus||'';
var t=(d.promoted||[]);$('intutiers').innerHTML=t.length?"<b style='font-size:13px'>Allowed without asking</b>"+t.map(function(x){return "<div class='row' style='margin-top:4px;align-items:center'><span style='flex:1;font-size:13px'>"+esc(x.kind)+" <small class='muted'>"+(x.promoted?'allowed: you said yes '+x.approvals+' times':x.approvals+' of '+d.after+' yeses')+"</small></span>"+(x.promoted||x.approvals?"<button type='button' class='ghost intrev' data-k='"+escQ(x.kind)+"'>Revoke</button>":"")+"</div>";}).join(''):'';
$('intutiers').querySelectorAll('.intrev').forEach(function(b){b.addEventListener('click',function(){api('/api/intuition/revoke',{kind:b.getAttribute('data-k')}).then(intuRender);});});}
// Settings → Customisations (overrides.mjs): what's active (each with Revert), proposals (Apply / Not now), the kill switch
function ovrRender(d){if(!d||d.error)return;var sw=$('ovrswitch');if(!sw)return;
sw.querySelectorAll('button').forEach(function(b){var on=b.getAttribute('data-on')==='1';b.classList.toggle('act',on===!!d.on);b.classList.toggle('ghost',on!==!!d.on);});
$('ovrself').querySelectorAll('button').forEach(function(b){b.classList.toggle('act',b.getAttribute('data-m')===d.selfChange);b.classList.toggle('ghost',b.getAttribute('data-m')!==d.selfChange);});
var h='';if((d.proposals||[]).length)h+="<b style='font-size:13px'>Proposed</b>"+d.proposals.map(function(p){return "<div class='ovri' style='margin-top:6px'><div style='font-size:13px'>"+esc(p.rule)+"</div><small class='muted'>"+esc(p.why)+(p.evidence&&p.evidence.length?": &ldquo;"+p.evidence.slice(0,2).map(esc).join('&rdquo;, &ldquo;')+"&rdquo;":"")+"</small><div class='row' style='margin-top:4px'><button type='button' class='act ovrapply' data-id='"+escQ(p.id)+"'>Apply</button><button type='button' class='ghost ovrno' data-id='"+escQ(p.id)+"'>Not now</button></div></div>";}).join('');
h+="<b style='font-size:13px;display:block;margin-top:8px'>Active</b>"+((d.active||[]).length?d.active.map(function(a){return "<div class='row' style='margin-top:4px;align-items:center'><span style='flex:1;font-size:13px'>"+esc(a.what)+" <small class='muted'>"+(a.by==='symbiot'?'proposed by Symbiot, applied with your OK':'yours')+" &middot; "+esc(new Date(a.at).toLocaleDateString())+(a.why?" &middot; "+esc(a.why):"")+"</small></span><button type='button' class='ghost ovrrev' data-id='"+escQ(a.id)+"'>Revert</button></div>";}).join(''):"<div class='muted' style='font-size:12px'>None yet.</div>");
if((d.errors||[]).length)h+="<div class='note err' style='margin-top:6px'>Not loaded: "+d.errors.map(function(e){return esc(e.file)+" ("+esc(e.why)+")";}).join('; ')+"</div>";
var el=$('ovrlist');el.innerHTML=h;
el.querySelectorAll('.ovrapply').forEach(function(b){b.addEventListener('click',function(){b.disabled=true;b.textContent='Checking…';api('/api/overrides/apply',{id:b.getAttribute('data-id')}).then(function(r){if(r&&r.error){b.disabled=false;b.textContent='Apply';el.insertAdjacentHTML('afterbegin',"<div class='note err'>"+esc(r.error)+"</div>");return;}ovrLoad();});});});
el.querySelectorAll('.ovrno').forEach(function(b){b.addEventListener('click',function(){api('/api/overrides/dismiss',{id:b.getAttribute('data-id')}).then(ovrLoad);});});
el.querySelectorAll('.ovrrev').forEach(function(b){b.addEventListener('click',function(){b.disabled=true;api('/api/overrides/revert',{id:b.getAttribute('data-id')}).then(ovrRender);});});}
function ovrLoad(){var sw=$('ovrswitch');if(!sw)return;api('/api/overrides/state').then(ovrRender).catch(function(){});if(sw._wired)return;sw._wired=true;
sw.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){api('/api/overrides/switch',{on:b.getAttribute('data-on')==='1'}).then(ovrRender);});});
$('ovrself').querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){api('/api/overrides/selfchange',{mode:b.getAttribute('data-m')}).then(ovrRender);});});}
function intuLoad(){var box=$('intumode');if(!box)return;api('/api/intuition/state').then(intuRender).catch(function(){});if(box._wired)return;box._wired=true;
box.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){api('/api/intuition',{mode:b.getAttribute('data-m')}).then(intuRender);});});
$('intusave').addEventListener('click',function(){api('/api/intuition/focus',{text:$('intufocus').value}).then(function(d){$('intusaved').textContent=d&&!d.error?'Saved.':((d&&d.error)||'');intuRender(d);});});}
function langRender(st){var el=$('langbox');if(!el||!st)return;LANG=st;
el.innerHTML="<p>Symbiot is in <b data-nt>"+esc(st.own||st.name)+"</b>"+(st.chosen?'.':', the language your computer uses.')+"</p>"+
"<div class='row' style='margin-top:8px'><input id='langin' placeholder='Any language: Afrikaans, isiZulu, Português, 日本語…' style='flex:1'><button class='act' id='languse'>Use it</button>"+(st.chosen?"<button class='ghost' id='langauto'>Use my computer’s language</button>":"")+"</div>"+
"<p class='muted' style='margin-top:8px'>Symbiot writes to you in it, and its own words are translated by your AI the first time you see them, then kept.</p>";
var go=function(v){api('/api/language/set',{chosen:v}).then(function(){location.reload();}).catch(function(){});};
var u=$('languse');if(u)u.addEventListener('click',function(){var v=($('langin').value||'').trim();if(v)go(v);});
var a=$('langauto');if(a)a.addEventListener('click',function(){go('');});}
// Symbiot Free and Pro (licence.mjs): where you stand, a key in or out, Free's 3 projects.
function licDate(ms){try{return new Date(ms).toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'});}catch(e){return '';}}
function licLoad(){api('/api/licence').then(licRender).catch(function(){});}
function licRender(st,msg){var el=$('licbox');if(!el||!st)return;var h='';
if(st.plan==='owner')h+="<p>Owner key"+(st.email?' for '+esc(st.email):'')+": everything, including Symbiot working on its own code.</p>";
else if(st.plan==='pro'){h+="<p><b>Pro</b>"+(st.email?' for '+esc(st.email):'')+(st.expires?', until '+esc(licDate(st.expires)):st.renews?', renewing '+(st.renews==='yearly'?'each year':'each month')+' with your subscription: nothing to paste again':'')+'.</p>';
if(st.grace)h+="<p class='onbnote'>Your key has ended. Pro carries on for "+st.grace+" more day"+(st.grace===1?'':'s')+": renew it to keep it.</p>";
else if(st.renewSoon)h+="<p class='muted'>It ends in "+st.renewSoon+" day"+(st.renewSoon===1?'':'s')+".</p>";}
else if(st.plan==='trial')h+="<p><b>Pro trial</b>: "+st.trialDaysLeft+" day"+(st.trialDaysLeft===1?'':'s')+" left. After that Symbiot carries on as Free, unless you add a Pro key.</p>";
else h+="<p><b>Free</b>: one agent at a time, up to "+st.free.projects+" projects and one inbox or chat."+(st.trialEnded?' Your Pro trial has ended.':'')+"</p>";
if(st.keyProblem)h+="<p class='onbnote'>"+esc(st.keyProblem)+"</p>";
if(st.plan==='free'||st.plan==='trial'){
if(st.projects&&st.projects.length)h+="<p class='muted' style='margin-top:10px'>Free’s "+st.free.projects+" projects: the first ones Symbiot worked in.</p><div class='licproj'>"+st.projects.map(function(p,i){return "<span class='chip'>"+esc(p.name)+" <button class='back' data-i='"+i+"' title='Free this slot for another project'>free up</button></span>";}).join(' ')+"</div>";
h+="<p style='margin-top:12px'>Pro: as many agents at once as you like, every project, every inbox and chat, the marketing lane and Approve-and-ship. "+esc(st.price)+". <a href='"+esc(okUrl(st.upgrade))+"' target='_blank' rel='noopener'>Get Pro</a></p>";}
if(st.plan!=='owner'){h+="<div class='row' style='margin-top:10px'>"+(st.plan==='pro'?"<button class='ghost' id='licclear'>Remove this key</button>":"<textarea id='lickey' rows='2' placeholder='Paste your Pro key (it starts SYM1-)' style='flex:1'></textarea><button class='act' id='licsave'>Add key</button>")+"</div>";}
if(msg)h+="<p class='onbnote' style='margin-top:8px'>"+esc(msg)+"</p>";
el.innerHTML=h;
var sv=$('licsave');if(sv)sv.addEventListener('click',function(){var k=($('lickey').value||'').trim();if(!k)return;api('/api/licence/key',{key:k}).then(function(r){if(r&&r.error){licRender(st,r.error);return;}licRender(r,'Thanks: Symbiot Pro is on.');}).catch(function(){});});
var cl=$('licclear');if(cl)cl.addEventListener('click',function(){api('/api/licence/clear',{}).then(function(r){licRender(r);}).catch(function(){});});
el.querySelectorAll('.licproj button[data-i]').forEach(function(b){b.addEventListener('click',function(){var p=st.projects[+b.getAttribute('data-i')];if(!p)return;api('/api/licence/project/free',{path:p.path}).then(function(r){licRender(r);}).catch(function(){});});});}
function loadFirstSteps(){api('/api/firststeps').then(function(f){var el=$('firststeps');if(!el||!f||!f.steps)return;
var st=f.steps.map(function(s){return s.optional&&!s.done&&fsSkipped(s.id)?Object.assign({},s,{done:true,skipped:true}):s;}),next=st.filter(function(s){return !s.done;})[0];
if(!next){el.innerHTML='';el.classList.add('hidden');return;}el.classList.remove('hidden');
el.innerHTML="<h3 class='ssh'>First steps</h3><div class='note muted' style='margin-top:2px'>In this order: each one ticks itself once it&#39;s done.</div><ol>"+st.map(function(s,i){return "<li class='"+(s.done?'done':s===next?'next':'')+"'><span class='fsn' aria-hidden='true'>"+(s.done?'&#10003;':(i+1))+"</span><span class='fst'><b>"+esc(s.title)+(s.optional?" <span class='muted' style='font-weight:400'>(optional)</span>":"")+"</b><span>"+(s.skipped?'skipped':esc(s.sub))+"</span></span>"+(s.done?"<span class='sr' style='position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)'>done</span>":"<button type='button' class='"+(s===next?'act':'ghost')+" fsgo' data-id='"+s.id+"'>"+(s===next?'Do it now':'Go')+"</button>"+(s.optional?"<button type='button' class='ghost fsskip' data-id='"+s.id+"'>Skip</button>":""))+"</li>";}).join('')+"</ol>";
el.querySelectorAll('.fsgo').forEach(function(b){b.addEventListener('click',function(){var id=b.getAttribute('data-id'),a=$(SETFOCUS[id==='site'?'links':id]||''),s=a&&a.closest?a.closest('.sset'):null;if(!s)return;
document.querySelectorAll('#panel-settings .lit').forEach(function(x){x.classList.remove('lit');});s.classList.add('lit');if(s.scrollIntoView)s.scrollIntoView({block:'start',behavior:'smooth'});var c=s.querySelector('select,input,button');if(c&&c.focus){try{c.focus({preventScroll:true});}catch(e){c.focus();}}});});
el.querySelectorAll('.fsskip').forEach(function(sk){sk.addEventListener('click',function(){try{if(window.localStorage)window.localStorage.setItem(fsKey(sk.getAttribute('data-id')),'1');}catch(e){}loadFirstSteps();});});});}
var fsTimer=null;(function(){var ps=$('panel-settings');if(ps&&ps.addEventListener){var again=function(){if(fsTimer)clearTimeout(fsTimer);fsTimer=setTimeout(function(){if(current==='settings')whenFree($('firststeps'),'firststeps',loadFirstSteps);},1800);};ps.addEventListener('click',again);ps.addEventListener('change',again);}})();
var tabPicked=false;
// Watching a page (your inbox, GitHub)? The app opens on the Dashboard instead of
// the Map, unless you've picked a tab already. The Map still loads behind it.
// A link to a screen (#reports, #board…) opens on it: how symbiot post's picture of
// "the new Reports view" shows that view, not home.
function lqDeep(){var h=String(location.hash||'').slice(1);if(!h||!LQNAMES[h])return;setTimeout(function(){tabPicked=true;lqPool(h);},400);}
function firstTab(){api('/api/watch/board').then(function(b){var own=((b&&b.cards)||[]).filter(function(c){return c.source!=='status'||c.count;});if(own.length&&!tabPicked&&current==='map')lqPool('board');}).catch(function(){});} // Symbiot's own Status watch, with nothing new, doesn't make the Dashboard the first page // lqPool: setTab alone showed nothing in the liquid (main stays hidden until pooled) and left current wrong (15 Oct 2026)
// The AI in use isn't shown while it works (it's noise); only when none is
// connected, as an urgent line that opens its part of Settings. Home has it out
// front too, with the agent and the connectors runs use (home.mjs).
var SUBLINE='';
function refresh(){api('/api/status').then(function(s){if(s&&s.connected&&s.provider){var pv=$('provider');if(pv&&!pv.getAttribute('data-touched')){pv.value=s.provider;SUBLINE=s.provider==='claude'?'Connected: '+s.line+'. No key needed.':'';syncP();}}var st=$('status');if(!st)return;st.classList.toggle('hidden',!!s.connected);st.classList.toggle('urgent',!s.connected);st.textContent=s.connected?'':"No AI connected: Symbiot can't work. Connect one \\u203a";});}
// the status opens Settings: on a phone its tab is scrolled out of sight
$('status').addEventListener('click',function(){var b=document.body;if(b&&b.classList&&b.classList.contains('lq-liquid')&&typeof lqFocus==='function'){lqFocus({kind:'setup',focus:'ai'});return;}setTab('settings');var t=document.querySelector('.tab[data-tab=settings]');if(t&&t.scrollIntoView)t.scrollIntoView({block:'nearest',inline:'nearest'});});
// Where you are: the section you opened, named at the top of its panel (and the
// tab lit, without the liquid); a project's own name when Tasks shows only its
// tasks, with Park (lqParkBtn). The work scene says which it is too.
var PARKED={repos:[],paths:[]};
function lqProjName(repo){var L=typeof LQ!=='undefined'?LQ:{},w=(L.workData&&L.workData.projects)||[],y=(L.home&&L.home.you)||[],p=w.filter(function(x){return x.repo===repo;})[0]||y.filter(function(x){return x.repo===repo&&x.name;})[0];return (p&&p.name)||repo;}
function lqTitle(){var t=$('lqtitle'),c=$('lqcrumb');if(!t)return;
var tf=typeof TFILTER!=='undefined'&&TFILTER||{},arch=typeof TARCH!=='undefined'&&TARCH,proj=current==='tasks'&&!arch&&tf.repo?tf.repo:'',names=typeof LQNAMES!=='undefined'?LQNAMES:{},name=current==='tasks'&&arch?'Archive':(names[current]||current);
if(proj)name=lqProjName(proj);var parked=!!proj&&PARKED.repos.indexOf(proj)>=0;
if(c)c.textContent=proj?'Projects':'Home';t.innerHTML=esc(name)+(parked?"<span class='lqpk'>parked</span>":'');
var pk=$('lqpark');if(pk){pk.classList.toggle('hidden',!proj);pk.textContent=parked?'Unpark':'Park this project';pk.title=parked?'let its tasks start agent runs again':'stop its tasks starting agent runs, until you unpark it';pk.setAttribute('data-repo',proj);}
// the open panel's own Refresh sits beside Close, not under it on the panel's top line
var wa=$('panel-agents');if(wa&&wa.classList)wa.classList.toggle('hidden',!!arch); // the Archive is only what's done
var tl=$('lqtools');if(tl&&tl.appendChild)['agents','reports'].forEach(function(p){var b=$(p+'refresh'),row=$('panel-'+p);row=row&&row.querySelector('.row');if(!b)return;if(p===current||(p==='agents'&&current==='tasks'&&!arch)){if(b.parentNode!==tl)tl.appendChild(b);}else if(b.parentNode===tl&&row&&row.appendChild)row.appendChild(b);});
var pt=$('pushtasks');if(pt&&pt.classList)pt.classList.toggle('hidden',current!=='tasks'||!!arch);
try{document.title=name+' \\u00b7 Symbiot';}catch(e){}}
function lqPark(repo,on,then,path){api('/api/lanes/park',{repo:repo,path:path||'',on:on}).then(function(r){if(r&&r.error){if(then)then(r.error);return;}loadParked(function(){lqTitle();if(then)then('');if(LQ.scene==='work')lqLoadWork();});});}
function loadParked(then){api('/api/lanes/parked').then(function(p){PARKED={repos:(p&&p.repos)||[],paths:(p&&p.paths)||[]};if(then)then();}).catch(function(){if(then)then();});}
$('lqpark').addEventListener('click',function(){var b=$('lqpark'),repo=b.getAttribute('data-repo');if(!repo)return;b.disabled=true;lqPark(repo,PARKED.repos.indexOf(repo)<0,function(err){b.disabled=false;$('pushout').innerHTML=err?"<div class='note err'>"+esc(err)+"</div>":"<div class='note ok'>"+esc(PARKED.repos.indexOf(repo)>=0?lqProjName(repo)+" is parked: its tasks start no agent runs until you unpark it.":lqProjName(repo)+" is unparked: Go, or a send, starts its tasks again.")+"</div>";});});
var WUEMPTY='Nothing written yet. Symbiot reads your local git and writes it up for you.',WUTEXT='';
$('write').addEventListener('click',function(){$('out').textContent='Writing it up from your local git…';$('out').classList.add('muted');$('copy').classList.add('hidden');
api('/api/run',{cmd:current}).then(function(r){var f=$('outfoot');if(r.error==='not-connected'){$('out').textContent='Not connected yet - open Settings and pick an AI.';f.style.display='none';return;}
// a week is saved to weeks/ as well (r.file), like Settings' Write it now
var foot=[r.footer,r.file?'Saved to '+r.file:'',r.error&&r.text&&r.error!==r.text?r.error:''].filter(Boolean).join(' · ');
WUTEXT=r.text||'';$('out').innerHTML=r.text?mdLite(r.text):'(no output)';$('out').classList.remove('muted');$('copy').classList.remove('hidden');if(foot){f.textContent=foot;f.style.display='block';}else{f.style.display='none';}});});
$('copy').addEventListener('click',function(){var c=$('copy');try{navigator.clipboard.writeText(WUTEXT||$('out').textContent);}catch(e){}c.setAttribute('title','Copied');c.classList.add('done');setTimeout(function(){c.setAttribute('title','Copy');c.classList.remove('done');},1400);});
function syncP(){var p=$('provider').value;var local=p==='ollama',sub=p==='claude';$('keyWrap').classList.toggle('hidden',local||sub);$('baseWrap').classList.toggle('hidden',!local);var sw=$('subWrap');if(sw){sw.classList.toggle('hidden',!sub);sw.textContent=sub?(SUBLINE||'Uses Claude Code signed in on this computer with your Claude account. Not signed in yet? Run  claude  once in a terminal and sign in, then Save.'):'';}
$('getkey').textContent=local?'About Ollama':'Where do I get a key?';$('modelHint').textContent='(default '+DEFMODEL[p]+')';$('model').placeholder='(blank = '+DEFMODEL[p]+')';}
$('provider').addEventListener('change',function(){$('provider').setAttribute('data-touched','1');syncP();});
$('getkey').addEventListener('click',function(){window.open(KEYURL[$('provider').value],'_blank');});
$('save').addEventListener('click',function(){var p=$('provider').value;$('saveMsg').textContent='checking...';$('saveMsg').className='note muted';
var cfg={provider:p,model:$('model').value.trim()};if(p==='ollama')cfg.baseUrl=$('baseUrl').value.trim();else cfg.key=$('key').value.trim();
api('/api/connect',cfg).then(function(r){$('saveMsg').textContent=r.message||(r.ok?'Connected.':'Could not connect.');$('saveMsg').className='note '+(r.ok?'ok':'err');if(r.ok){$('key').value='';refresh();}});});
$('quit').addEventListener('click',function(){api('/api/quit');document.body.innerHTML='<div style=\\'padding:40px;color:#7E9690;font-family:sans-serif\\'>Symbiot stopped. You can close this window.</div>';});
var GRAPH=null;
// Text into HTML, quotes too: a message's subject landed in aria-label='…' and a quote in it closed the attribute (15 Oct 2026)
function esc(s){return String(s).replace(/[&<>"']/g,function(ch){return ch==='&'?'&amp;':ch==='<'?'&lt;':ch==='>'?'&gt;':ch==='"'?'&quot;':'&#39;';});}
// A link out of what an agent or a site said: only a web address, never javascript: or the like
function okUrl(u){u=String(u||'');return /^https?:\\/\\//i.test(u)?u:'';}
// An agent's option, with its who-acts markers as badges: 👤 You (you do this
// step) and 🤖 Agent (picking it is enough; the next run does it). Escaped first.
function whoHtml(o){return esc(o).replace(/👤[ ]*(You:|You(?=[ ]))?/g,"<span class='who you'><i class=ic-person></i> You</span> ").replace(/🤖[ ]*(Agent:|Agent(?=[ ]))?/g,"<span class='who agent'><i class=ic-bot></i> Agent</span> ");}

`;
