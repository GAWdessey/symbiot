// symbiot — Screens (screenshots and their regions) and Watch.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// The Android app calls this when you come back having allowed file access, so
// the map rescans instead of staying empty.
window.symbiotStorageGranted=function(){if(current==='map')loadMap(true);else mapLoaded=false;};
// Opens a screen by name, as the tab bar did before the liquid: the Android app, tests
window.symbiotOpen=function(name){lqPool(name);};
// Screens: a screenshot plus named regions, the blueprint (screens.mjs). Drag on
// the image to mark a region; coordinates are the screenshot's own pixels.
// Names stay out of attributes (esc() doesn't escape quotes): rows carry indexes.
var SCREENS=[],SCREEN=null,SDRAG=null,SPEND=null,SCLICKDELAY=3,STYPEENTER=true,MONITORS=[],SWHICH=[];
// With several displays, Capture asks which: each one as its own screen, one of
// them, or (not on macOS) all of them in one image. The choice is remembered.
function loadMonitorsUI(){api('/api/screens/monitors').then(function(x){MONITORS=(x&&x.monitors)||[];var sel=$('screenwhich');
if(MONITORS.length<2){SWHICH=[];sel.innerHTML='';sel.classList.add('hidden');renderScreen();return;}
SWHICH=[['each','each display']].concat(MONITORS.map(function(m){return [m.name,esc(m.name)+(m.where?' ('+esc(m.where)+')':'')+' only &middot; '+m.w+'&times;'+m.h];}));if(!x||x.whole!==false)SWHICH.push(['all','all displays in one image']);
var saved='',at=0;try{saved=localStorage.getItem('symbiot_screenwhich')||'';}catch(e){}SWHICH.forEach(function(o,i){if(o[0]===saved)at=i;});
sel.innerHTML=SWHICH.map(function(o,i){return "<option value='"+i+"'>"+o[1]+"</option>";}).join('');sel.value=String(at);sel.classList.remove('hidden');renderScreen();});}
function screenWhich(){var sel=$('screenwhich'),o=SWHICH[+sel.value];return (!sel.classList.contains('hidden')&&o)?o[0]:'all';}
function loadScreensUI(){api('/api/screens').then(function(list){SCREENS=list||[];var id=SCREEN&&SCREEN.id;SCREEN=null;SCREENS.forEach(function(s){if(s.id===id)SCREEN=s;});renderScreenList();renderScreen();});}
function renderScreenList(){var box=$('screenlist');if(!SCREENS.length){box.innerHTML="<span class='muted' style='font-size:12px'>No screens yet.</span>";return;}
box.innerHTML="<span class='fl'>Screens</span>"+SCREENS.map(function(s,i){return "<button class='fchip"+(SCREEN&&SCREEN.id===s.id?" on":"")+"' data-i='"+i+"'>"+esc(s.name)+" <span class='tcount'>"+(s.regions||[]).length+"</span></button>";}).join('');
box.querySelectorAll('.fchip').forEach(function(b){b.addEventListener('click',function(){var s=SCREENS[+b.getAttribute('data-i')];SCREEN=(SCREEN&&s&&SCREEN.id===s.id)?null:s;SPEND=null;renderScreenList();renderScreen();});});}
function scrPct(v,of){return (v/of*100).toFixed(3)+'%';}
function scrBox(r,s,cls){return "<div class='scrbox"+(cls?" "+cls:"")+"' style='left:"+scrPct(r.x,s.w)+";top:"+scrPct(r.y,s.h)+";width:"+scrPct(r.w,s.w)+";height:"+scrPct(r.h,s.h)+"'>"+(r.label?"<span>"+esc(r.label)+"</span>":"")+"</div>";}
function renderScreen(){var v=$('screenview'),s=SCREEN;if(!s){v.innerHTML='';return;}
var h="<div class='row' style='margin-top:10px'><input id='scrname' title='rename this screen' style='flex:1'><span class='muted'>"+(s.monitor?esc(s.monitor.name)+(s.monitor.where?" ("+esc(s.monitor.where)+")":"")+" &middot; ":"")+s.w+" &times; "+s.h+" px</span>"+(s.page?"<button class='ghost' id='scrremap' title='open this page in the hidden browser again and map it as it is now'>Map again</button>"+(watchOf(s)?"<button class='ghost' id='scrwatch' title='Symbiot reads this page every few minutes and tells you what&#39;s new: click to stop'>Watching &#10003;</button>":"<button class='ghost' id='scrwatch' title='read this page again every few minutes while Symbiot runs, and tell me what&#39;s new on it'>Watch</button>"):"")+(!s.monitor&&!s.page&&MONITORS.length>1?"<button class='ghost' id='scrsplit' title='cut this screenshot into one screen per display, regions included (this one stays)'>Split by display</button>":"")+"<button class='ghost' id='scrcopy' title='copy the regions and their coordinates as JSON'>Copy blueprint</button><button class='ghost' id='scrdel'>Delete</button></div>";
// a page taller than its window: where this screen is on it, and Scroll to map the rest
var sc=s.page&&s.page.scroll,up=sc&&sc.y>0,down=sc&&sc.y<sc.max,whole=!!sc; // whole: the page, or a list inside it (Gmail's) opened out
if(s.page)h+="<div class='row' style='margin-top:6px'><span class='muted' style='font-size:12px;flex:1;overflow-wrap:anywhere'>Mapped in the hidden browser: "+esc(s.page.url)+(sc?" &middot; <b>"+(up&&down?"more above and below":down?"more below":"the end of the page")+"</b>: a map only has what fits in the window, so scroll to map the rest"+(whole?", or map the whole page at once":""):s.page.full?" &middot; <b>the whole page</b>, in one tall screenshot":"")+"</span>"+(up?"<button class='ghost scrscroll' data-to='up' title='scroll up in the hidden browser and map what&#39;s there as a new screen'>&uarr; Scroll up</button>":"")+(down?"<button class='ghost scrscroll' data-to='down' title='scroll down in the hidden browser and map what&#39;s there as a new screen'>Scroll down &darr;</button>":"")+(whole?"<button class='ghost scrwhole' title='map all of this page in one tall screenshot, every button, link and field on it, as a new screen'>Whole page &varr;</button>":"")+"</div>";
h+="<div class='scrwrap' id='scrwrap'><img src='/api/screens/image?id="+encodeURIComponent(s.id)+"&t="+encodeURIComponent(T)+"' alt='' draggable='false'>"+(s.regions||[]).map(function(r){return scrBox(r,s,'');}).join('')+(SPEND?scrBox(SPEND,s,'draw'):"")+"<div class='scrbox draw hidden' id='scrdraw'></div></div>";
h+="<div class='mapbar' id='scrbar'>Drag on the screenshot to mark a region &middot; coordinates are screenshot pixels</div>";
h+="<div class='row"+(SPEND?"":" hidden")+"' id='scrlabel' style='margin-top:8px'><input id='scrlabelin' placeholder='name this region, e.g. Merge button' style='flex:1'><button class='act' id='scrlabelok'>Add region</button><button class='ghost' id='scrlabelno'>Cancel</button></div>";
var rs=(s.blueprint&&s.blueprint.regions)||[];
if(rs.length&&s.page)h+="<div class='row' style='margin-top:8px'><span class='muted' style='font-size:12px;flex:1'><b>Press</b> clicks it in the hidden browser, on the real site and signed in as you, then maps the page it leads to as a new screen. <b>Type</b> fills in a field there the same way. "+(s.trusted?"This site is one of your trusted sites, so they go ahead without asking.":"They ask first, every time, unless you add this site to Trusted sites in Settings.")+"</span>"+(rs.some(function(r){return r.kind==='field';})?"<label class='check' style='flex:0 0 auto;margin:0' title='after typing, press Enter: how a search or a one-line form is sent'><input type='checkbox' id='screnter' style='width:auto'"+(STYPEENTER?" checked":"")+"> Type, then Enter</label>":"")+"</div>";
else if(rs.length)h+="<div class='row' style='margin-top:8px'><span class='muted' style='font-size:12px;flex:1'><b>Click here</b> moves your mouse to a region's centre and clicks, on your real screen. It asks first, every time.</span><select id='scrclickdelay' title='wait first, so you can bring the right window to the front' style='flex:0 0 auto;width:auto'>"+[0,3,5,10].map(function(d){return "<option value='"+d+"'"+(d===SCLICKDELAY?" selected":"")+">"+(d?"click in "+d+"s":"click now")+"</option>";}).join('')+"</select></div>";
h+="<div id='scrregions'>"+(rs.length?rs.map(function(r,i){return "<div class='task' data-i='"+i+"'><span class='t'><b>"+esc(r.label)+"</b>"+(r.kind?" <span class='tcount'>"+esc(r.kind)+"</span>":"")+" <span class='muted' style='font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px'>x "+r.x+", y "+r.y+" &middot; "+r.w+"&times;"+r.h+" &middot; centre ("+r.center.x+", "+r.center.y+")</span></span>"+(s.page?(r.kind==='field'?"<button class='ghost scrtype' title='type into this field in the hidden browser and map the result'>Type</button>":"")+"<button class='ghost scrpress' title='click this in the hidden browser and map where it leads'>Press</button>":"<button class='ghost scrclick' title='move the mouse to the centre of this region and click there'>Click here</button>")+"<button class='rm scrrm' title='remove this region'>&times;</button></div>";}).join(''):"<div class='muted' style='font-size:12px;margin-top:8px'>No regions yet.</div>")+"</div>";
v.innerHTML=h;wireScreen();}
function scrPoint(ev){var rc=$('scrwrap').querySelector('img').getBoundingClientRect(),s=SCREEN;if(!rc.width||!rc.height)return {x:0,y:0};return {x:Math.max(0,Math.min(s.w-1,Math.round((ev.clientX-rc.left)/rc.width*s.w))),y:Math.max(0,Math.min(s.h-1,Math.round((ev.clientY-rc.top)/rc.height*s.h)))};}
function scrRect(a,b){return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)};}
function screenErr(msg){$('screenmsg').innerHTML="<div class='note err'>"+esc(msg)+"</div>";}
function screenSaved(s){if(!s||s.error){screenErr((s&&s.error)||'could not save');return;}$('screenmsg').innerHTML='';SCREENS=SCREENS.map(function(x){return x.id===s.id?s:x;});SCREEN=s;SPEND=null;renderScreenList();renderScreen();}
function saveRegions(regions){api('/api/screens/regions',{id:SCREEN.id,regions:regions}).then(screenSaved);}
function wireScreen(){var s=SCREEN,wrap=$('scrwrap'),bar=$('scrbar'),draw=$('scrdraw'),nm=$('scrname');
nm.value=s.name;
nm.addEventListener('change',function(){var n=(nm.value||'').trim();if(n)api('/api/screens/rename',{id:s.id,name:n}).then(screenSaved);});
$('scrcopy').addEventListener('click',function(){var b=$('scrcopy');navigator.clipboard.writeText(JSON.stringify(s.blueprint,null,2));b.textContent='Copied';setTimeout(function(){b.textContent='Copy blueprint';},1400);});
$('scrdel').addEventListener('click',function(){if(typeof confirm==='function'&&!confirm('Delete this screen and its regions?'))return;api('/api/screens/remove',{id:s.id}).then(function(){SCREEN=null;SPEND=null;loadScreensUI();});});
var sp=$('scrsplit');if(sp)sp.addEventListener('click',function(){sp.disabled=true;$('screenmsg').innerHTML="<div class='note muted'>Splitting&hellip;</div>";api('/api/screens/split',{id:s.id}).then(function(x){sp.disabled=false;screenAdded(x);if(x&&x.screens)$('screenmsg').insertAdjacentHTML('beforeend',"<div class='note muted'>The whole image is still there too. Delete it if you don't need it.</div>");}).catch(function(e){sp.disabled=false;screenErr(String((e&&e.message)||e));});});
wrap.addEventListener('pointerdown',function(ev){if(ev.button)return;ev.preventDefault();SDRAG=scrPoint(ev);try{wrap.setPointerCapture(ev.pointerId);}catch(e){}});
wrap.addEventListener('pointermove',function(ev){var p=scrPoint(ev);if(!SDRAG){bar.innerHTML='<b>x '+p.x+', y '+p.y+'</b> &middot; drag to mark a region';return;}
var r=scrRect(SDRAG,p);bar.innerHTML='<b>x '+r.x+', y '+r.y+' &middot; '+r.w+'&times;'+r.h+'</b>';draw.classList.remove('hidden');draw.style.left=scrPct(r.x,s.w);draw.style.top=scrPct(r.y,s.h);draw.style.width=scrPct(r.w,s.w);draw.style.height=scrPct(r.h,s.h);});
wrap.addEventListener('pointerup',function(ev){if(!SDRAG)return;var r=scrRect(SDRAG,scrPoint(ev));SDRAG=null;if(r.w<4||r.h<4){draw.classList.add('hidden');return;}SPEND=r;renderScreen();$('scrlabelin').focus();});
function addPending(){if(!SPEND)return;saveRegions((s.regions||[]).concat([{label:($('scrlabelin').value||'').trim(),x:SPEND.x,y:SPEND.y,w:SPEND.w,h:SPEND.h}]));}
$('scrlabelok').addEventListener('click',addPending);
$('scrlabelin').addEventListener('keydown',function(e){if(e.key==='Enter')addPending();else if(e.key==='Escape'){SPEND=null;renderScreen();}});
$('scrlabelno').addEventListener('click',function(){SPEND=null;renderScreen();});
$('scrregions').querySelectorAll('.scrrm').forEach(function(b){b.addEventListener('click',function(){var i=+b.closest('.task').getAttribute('data-i');saveRegions((s.regions||[]).filter(function(r,j){return j!==i;}));});});
var cd=$('scrclickdelay');if(cd)cd.addEventListener('change',function(){SCLICKDELAY=+cd.value||0;});
$('scrregions').querySelectorAll('.scrclick').forEach(function(b){b.addEventListener('click',function(){clickUI(s,+b.closest('.task').getAttribute('data-i'),b);});});
$('scrregions').querySelectorAll('.scrpress').forEach(function(b){b.addEventListener('click',function(){pressUI(s,+b.closest('.task').getAttribute('data-i'),b);});});
$('scrregions').querySelectorAll('.scrtype').forEach(function(b){b.addEventListener('click',function(){typeUI(s,+b.closest('.task').getAttribute('data-i'),b);});});
var te=$('screnter');if(te)te.addEventListener('change',function(){STYPEENTER=!!te.checked;});
var rm=$('scrremap');if(rm)rm.addEventListener('click',function(){mapUI(s.page.url,rm);});
document.querySelectorAll('#screenview .scrscroll').forEach(function(b){b.addEventListener('click',function(){scrollUI(s,b.getAttribute('data-to'),b);});});
document.querySelectorAll('#screenview .scrwhole').forEach(function(b){b.addEventListener('click',function(){wholeUI(s,b);});});
var wb=$('scrwatch');if(wb)wb.addEventListener('click',function(){watchUI(s,wb);});}
// Watch (watch.mjs): a mapped page read again every few minutes while Symbiot
// runs, and what's new on it. Only reads: nothing there is pressed or typed.
var WATCH={watches:[],news:[],every:[5,15,30,60]};
function watchOf(s){var w=null;(WATCH.watches||[]).forEach(function(x){if(s&&s.page&&x.url===s.page.url)w=x;});return w;}
function agoTxt(t){var m=Math.max(0,(Date.now()-t)/60000);return m<1.5?'just now':m<90?Math.round(m)+' min ago':m<2160?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago';}
function loadWatchUI(){api('/api/watch').then(function(d){if(d&&d.watches)WATCH=d;renderWatch();});loadBoard();}
function watchUI(s,b){var w=watchOf(s);
if(w){if(typeof confirm==='function'&&!confirm('Stop watching '+w.name+'? What it found goes too.'))return;api('/api/watch/remove',{id:w.id}).then(function(){api('/api/watch').then(function(d){if(d&&d.watches)WATCH=d;renderWatch();renderScreen();});});return;}
b.disabled=true;api('/api/watch/add',{screen:s.id,every:15}).then(function(x){b.disabled=false;if(!x||x.error){screenErr((x&&x.error)||'failed');return;}
$('screenmsg').innerHTML="<div class='note ok'>&#10003; Watching "+esc(x.name)+". Symbiot reads it every "+x.every+" minutes while it runs (first within a minute, to learn what's there) and notifies you of anything new. It's listed under Watching, just below.</div>";
api('/api/watch').then(function(d){if(d&&d.watches)WATCH=d;renderWatch();renderScreen();});});}
function renderWatch(){var box=$('watchbox'),ws=WATCH.watches||[],ns=WATCH.news||[],bs=WATCH.briefs||[],h='';
var gh=ws.some(function(w){return String(w.url).indexOf('://github.com/notifications')>=0;});
if(ws.length){h+="<div class='tgroup'>Watching <span class='tcount'>read again while Symbiot runs &middot; only reads, never presses</span></div>";
h+=ws.map(function(w,i){return "<div class='task' data-i='"+i+"'><span class='t'><b>"+esc(w.name)+"</b> <span class='muted' style='font-size:12px'>"+(w.checked?"read "+agoTxt(w.checked):w.last?"tried "+agoTxt(w.last):"first read within a minute")+(w.via==='gh'?" &middot; through gh":"")+"</span>"+(w.error?"<br><span class='err' style='font-size:12px'>"+esc(w.error)+"</span>":"")+"</span><select class='wevery' title='how often to read it' style='flex:0 0 auto;width:auto'>"+(WATCH.every||[]).map(function(m){return "<option value='"+m+"'"+(m===w.every?" selected":"")+">every "+m+" min</option>";}).join('')+"</select><button class='ghost wcheck' title='read it now'>Check now</button><button class='rm wrm' title='stop watching it'>&times;</button></div>";}).join('');}
// GitHub's notifications need no map: gh reads them (watch.mjs readGitHub)
if(!gh)h+="<div class='row' style='margin-top:8px'><span class='muted' style='font-size:12px;flex:1'>Watch GitHub too: new review requests, failed CI runs and mentions reach you the same way. With the GitHub CLI signed in (<b>gh auth login</b>), Symbiot reads them through it; without, it reads github.com/notifications in its browser (click Sign in above with github.com first).</span><button class='ghost' id='wgithub'>Watch GitHub</button></div>";
if(ws.length){h+="<label class='check' style='margin-top:8px'><input type='checkbox' id='wbrief'"+(WATCH.brief?" checked":"")+"> <span>Brief me: the AI connected in Settings says what needs me and what can wait, here and in the notification. <span class='muted'>It's sent what's new: for mail, the sender, subject and preview. With a local Ollama model nothing leaves this computer.</span></span></label>";
var b0=bs[0]&&ns.some(function(n){return n.ts===bs[0].ts&&n.watch===bs[0].watch;})?bs[0]:null;
if(b0)h+="<div class='note' style='white-space:pre-line;margin-top:6px'><b>Brief</b> <span class='muted' style='font-size:12px'>"+esc(b0.name)+" &middot; "+b0.count+" new &middot; "+agoTxt(b0.ts)+"</span><br>"+esc(b0.text)+"</div>";
h+=ns.length?"<div class='row' style='margin-top:8px'><span class='fl' style='margin-left:0;flex:1'>New &middot; "+ns.length+"</span><button class='ghost' id='wclear' title='clear this list (Symbiot still remembers what it has seen)'>Clear</button></div>"+ns.slice(0,20).map(function(n,i){return "<div class='task' data-i='"+i+"'><span class='t'>"+esc(n.text)+" <span class='muted' style='font-size:12px'>"+esc(n.name)+" &middot; "+agoTxt(n.ts)+"</span>"+custTag(n)+"</span>"+(n.href?"<button class='ghost wopen' title='open it in your browser'>Open</button>":"")+(n.mail||n.chat||n.social?"<button class='ghost wdraft' title='"+(n.chat?DRAFT_CHAT_TIP:n.social?DRAFT_SOCIAL_TIP:"your coding agent opens it in your inbox through Screens, writes a reply and leaves it in Drafts. It never presses Send")+"'>"+(n.drafted?"Drafted &middot; again":"Draft a reply")+"</button>":"")+(n.chat&&n.drafted?"<button class='ghost wopenwa' title='"+OPEN_WA_TIP+"'>Open in WhatsApp</button>":"")+"</div>";}).join('')
:"<div class='muted' style='font-size:12px;margin-top:6px'>Nothing new yet. New rows show up here, and as a notification. Standup counts what's waiting on you, and your agent reads them with <b>symbiot watch new</b>.</div>";}
box.innerHTML=h;
var wg=$('wgithub');if(wg)wg.addEventListener('click',function(){wg.disabled=true;api('/api/watch/add',{site:'github',every:5}).then(function(x){wg.disabled=false;if(!x||x.error){screenErr((x&&x.error)||'failed');return;}
$('screenmsg').innerHTML="<div class='note ok'>&#10003; Watching "+esc(x.name)+" every "+x.every+" minutes while Symbiot runs. The first read, within a minute, learns what's unread there now; after that, a new review request or failed CI run notifies you.</div>";loadWatchUI();});});
var wbr=$('wbrief');if(wbr)wbr.addEventListener('change',function(){api('/api/watch/brief',{on:wbr.checked}).then(loadWatchUI);});
box.querySelectorAll('.wevery').forEach(function(sel){sel.addEventListener('change',function(){var w=ws[+sel.closest('.task').getAttribute('data-i')];api('/api/watch/every',{id:w.id,every:+sel.value}).then(loadWatchUI);});});
box.querySelectorAll('.wrm').forEach(function(b){b.addEventListener('click',function(){var w=ws[+b.closest('.task').getAttribute('data-i')];if(typeof confirm==='function'&&!confirm('Stop watching '+w.name+'? What it found goes too.'))return;api('/api/watch/remove',{id:w.id}).then(function(){api('/api/watch').then(function(d){if(d&&d.watches)WATCH=d;renderWatch();renderScreen();});});});});
box.querySelectorAll('.wcheck').forEach(function(b){b.addEventListener('click',function(){var w=ws[+b.closest('.task').getAttribute('data-i')];b.disabled=true;b.textContent='Reading…';
api('/api/watch/check',{id:w.id}).then(function(x){b.disabled=false;b.textContent='Check now';if(!x||x.error){screenErr((x&&x.error)||'failed');loadWatchUI();return;}
$('screenmsg').innerHTML="<div class='note "+(x["new"]&&x["new"].length?"ok":"muted")+"'>"+watchCheckMsg(w,x)+"</div>";loadWatchUI();}).catch(function(e){b.disabled=false;b.textContent='Check now';screenErr(String((e&&e.message)||e));});});});
box.querySelectorAll('.wopen').forEach(function(b){b.addEventListener('click',function(){var n=ns[+b.closest('.task').getAttribute('data-i')];if(n&&/^https?:/.test(n.href))window.open(n.href,'_blank','noopener');});});
// Draft a reply (watch.mjs draftReply): handed to your agent, which never sends it
box.querySelectorAll('.wdraft').forEach(function(b){b.addEventListener('click',function(){var n=ns[+b.closest('.task').getAttribute('data-i')];b.disabled=true;
api('/api/watch/draft',{id:n.id}).then(function(x){b.disabled=false;if(!x||x.error){screenErr((x&&x.error)||'failed');return;}
$('screenmsg').innerHTML="<div class='note ok'>"+(x.chat?DRAFTING_CHAT:x.social?DRAFTING_SOCIAL:DRAFTING)+"</div>";loadWatchUI();}).catch(function(e){b.disabled=false;screenErr(String((e&&e.message)||e));});});});
box.querySelectorAll('.wopenwa').forEach(function(b){b.addEventListener('click',function(){openChatUI(ns[+b.closest('.task').getAttribute('data-i')],b,function(cls,html){$('screenmsg').innerHTML="<div class='note "+cls+"'>"+html+"</div>";});});});
var wc=$('wclear');if(wc)wc.addEventListener('click',function(){api('/api/watch/clear',{}).then(loadWatchUI);});}
// what Check now found, for Watching and the Dashboard
function watchCheckMsg(w,x){return x.busy?"The hidden browser is busy with a map, press or type. It reads "+esc(w.name)+" once that's done.":x.learned!=null?"Read "+esc(x.name)+": learned the "+x.learned+" things listed there now. From here on, anything new is noted.":x["new"]&&x["new"].length?"&#10003; "+x["new"].length+" new on "+esc(x.name)+".":"Read "+esc(x.name)+": nothing new.";}
// a chat (WhatsApp): the reply is typed into the chat's message box in Symbiot's browser, unsent
var DRAFT_CHAT_TIP="your coding agent opens the chat in Symbiot&#39;s hidden browser and types a reply into its message box, unsent. It never presses Send or Enter";
var DRAFTING_CHAT="&#10003; Your agent is drafting a reply in that chat. It opens WhatsApp in Symbiot's hidden browser, types the reply into the chat's message box and leaves it there unsent: it never presses Send or Enter. Once it's done (the Agents tab), click <b>Open in WhatsApp</b> on the message: the chat shows the reply in its box, for you to read and send.";
// Open in WhatsApp (watch.mjs openChat): Symbiot's browser, as a window, at web.whatsapp.com
var OPEN_WA_TIP="open WhatsApp in Symbiot&#39;s browser, where the chat shows your agent&#39;s reply in its message box, for you to read and send";
function openChatUI(n,b,say){if(!n)return;b.disabled=true;
api('/api/watch/open-chat',{id:n.id}).then(function(x){b.disabled=false;if(!x||x.error){say('err',esc((x&&x.error)||'failed'));return;}
say('ok',"&#10003; Opened WhatsApp in the Symbiot Browser. The chat shows your agent's reply in its message box: read it, change it if you like, and send it there. Close the window when you're done, so Watch can read WhatsApp again.");}).catch(function(e){b.disabled=false;say('err',esc(String((e&&e.message)||e)));});}
var DRAFTING="&#10003; Your agent is drafting a reply to it. It opens the email in your inbox through Screens, writes the reply and leaves it in Drafts for you to read and send: it never presses Send. Follow it, and answer anything it asks, in the Agents tab.";
// a LinkedIn comment or mention (watch.mjs socialBrief): typed into the comment box, never posted
var DRAFT_SOCIAL_TIP="your coding agent opens it on LinkedIn in Symbiot&#39;s hidden browser and types a reply into the comment box, unposted. It never presses Post, Comment, Reply or Send";
var DRAFTING_SOCIAL="&#10003; Your agent is drafting a reply to it. It opens the comment on LinkedIn in Symbiot's hidden browser, types the reply into the comment box and leaves it there, never posted: it can't press Post, Comment, Reply or Send. It also writes the reply under <b>The reply</b> in its brief (the Agents tab), for you to paste and post yourself.";
// asks how to install it, about pricing or about team use (post.mjs maybeCustomer)
var CUSTWHY={pricing:'asks about pricing',install:'asks how to install it',team:'asks about team use'};
function custTag(n){return n.customer?" <span class='tag cust' title='"+escQ(CUSTWHY[n.customer]||'')+"'>maybe a customer</span>":"";}
`;
