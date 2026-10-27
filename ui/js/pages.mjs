// symbiot — mapped web pages, real clicks, screenshot permission, the weekly write-up, the heartbeat.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// A web page, mapped by itself in the hidden browser (headless.mjs): no capture,
// When, as people say it: "today at 11:46", "yesterday at 09:05", "24 Oct at 18:30" (24-hour, day first): never
// a US "10/25/2026, 11:46:48 AM" (critic, 25 Oct 2026).
function whenWords(t){var d=new Date(t);if(isNaN(d))return '';var p=function(n){return (n<10?'0':'')+n;},hm=p(d.getHours())+':'+p(d.getMinutes()),now=new Date(),day=function(x){return new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime();},diff=Math.round((day(now)-day(d))/86400000),M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
return diff===0?'today at '+hm:diff===1?'yesterday at '+hm:d.getDate()+' '+M[d.getMonth()]+(d.getFullYear()!==now.getFullYear()?' '+d.getFullYear():'')+' at '+hm;}
// no dragging. It takes a few seconds, so the button says so meanwhile.
function mapUI(site,b){site=(site||'').trim();if(!site){screenErr('Type a site to map first: gmail, github.com/pulls or a web address.');return;}b.disabled=true;
$('screenmsg').innerHTML="<div class='note muted'>Opening "+esc(site)+" in the hidden browser and mapping it&hellip;</div>";
api('/api/screens/map',{site:site,name:b.id==='mappage'?($('screenname').value||''):''}).then(function(x){b.disabled=false;if(x&&!x.error&&b.id==='mappage')$('pagesite').value='';screenAdded(x);if(x&&!x.error)$('screenmsg').innerHTML=x.note?"<div class='note muted'>"+esc(x.note)+"</div>":"<div class='note ok'>&#10003; Mapped "+esc(x.name)+": "+(x.regions||[]).length+" buttons, links and fields.</div>";}).catch(function(e){b.disabled=false;screenErr(String((e&&e.message)||e));});}
// Scroll: only looks, so it never asks. The part of the page it lands on is a new screen.
function scrollUI(s,to,b){b.disabled=true;$('screenmsg').innerHTML="<div class='note muted'>Scrolling "+esc(to)+" and mapping&hellip;</div>";
api('/api/screens/scroll',{id:s.id,to:to}).then(function(x){b.disabled=false;screenAdded(x);if(x&&!x.error)$('screenmsg').innerHTML="<div class='note ok'>&#10003; Scrolled "+esc(to)+" and mapped what's there: "+(x.regions||[]).length+" buttons, links and fields.</div>";}).catch(function(e){b.disabled=false;screenErr(String((e&&e.message)||e));});}
// Whole page: the hidden browser's window made as tall as the page, so one screen has all of it. Only looks, too.
function wholeUI(s,b){b.disabled=true;$('screenmsg').innerHTML="<div class='note muted'>Mapping the whole page in one tall screenshot&hellip;</div>";
api('/api/screens/whole',{id:s.id}).then(function(x){b.disabled=false;screenAdded(x);if(x&&!x.error)$('screenmsg').innerHTML=x.note?"<div class='note muted'>"+esc(x.note)+"</div>":"<div class='note ok'>&#10003; Mapped the whole page: "+(x.regions||[]).length+" buttons, links and fields, "+x.h+" pixels tall.</div>";}).catch(function(e){b.disabled=false;screenErr(String((e&&e.message)||e));});}
// Press: a real click on the real site (signed in as you), so it asks first,
// unless the site is one you trust (Settings).
function pressUI(s,i,b){var r=(s.regions||[])[i];if(!r)return;
if(!s.trusted&&(typeof confirm!=='function'||!confirm("Press “"+r.label+"”"+(r.kind?" ("+r.kind+")":"")+" on "+((s.page&&s.page.title)||s.name)+"?\\n\\nSymbiot clicks it in its hidden browser, on the real site and signed in as you, then maps where it leads.")))return;
b.disabled=true;$('screenmsg').innerHTML="<div class='note muted'>Pressing “"+esc(r.label)+"”&hellip;</div>";
api('/api/screens/press',{id:s.id,region:r.id,confirmed:!s.trusted}).then(function(x){b.disabled=false;screenAdded(x);if(x&&!x.error)$('screenmsg').innerHTML="<div class='note "+(x.found?"ok":"muted")+"'>"+(x.found?"&#10003; Pressed “"+esc(x.pressed)+"”":"Couldn't find “"+esc(x.pressed)+"” on the page again, so it pressed the same spot")+" and mapped where it led: "+esc(x.name)+".</div>";}).catch(function(e){b.disabled=false;screenErr(String((e&&e.message)||e));});}
// Type: you give the text, it's typed into the field in the hidden browser (then
// Enter, if ticked) and the result is mapped. Asks first unless the site is trusted.
function typeUI(s,i,b){var r=(s.regions||[])[i];if(!r||typeof prompt!=='function')return;var enter=STYPEENTER;
var text=prompt("Type into “"+r.label+"” on "+((s.page&&s.page.title)||s.name)+(enter?", then press Enter":"")+":","");if(text===null||(!text&&!enter))return;
if(!s.trusted&&(typeof confirm!=='function'||!confirm("Type “"+text+"” into “"+r.label+"”"+(enter?" and press Enter":"")+"?\\n\\nSymbiot types it in its hidden browser, on the real site and signed in as you, then maps the result.")))return;
b.disabled=true;$('screenmsg').innerHTML="<div class='note muted'>Typing into “"+esc(r.label)+"”&hellip;</div>";
api('/api/screens/type',{id:s.id,region:r.id,text:text,enter:enter,confirmed:!s.trusted}).then(function(x){b.disabled=false;screenAdded(x);if(x&&!x.error)$('screenmsg').innerHTML="<div class='note "+(x.found?"ok":"muted")+"'>"+(x.found?"&#10003; Typed into “"+esc(x.typed)+"”":"Couldn't find “"+esc(x.typed)+"” on the page again, so it typed at the same spot")+(x.entered?", pressed Enter":"")+" and mapped the result: "+esc(x.name)+"."+(x.entered?"":" It stays typed in for a few minutes: press the form's button on this screen to send it.")+"</div>";}).catch(function(e){b.disabled=false;screenErr(String((e&&e.message)||e));});}
function signInUI(){var site=($('pagesite').value||'').trim();if(!site){screenErr('Type the site to sign in to first.');return;}
api('/api/screens/signin',{site:site}).then(function(x){if(!x||x.error){screenErr((x&&x.error)||'failed');return;}$('screenmsg').innerHTML="<div class='note muted'>Opened "+esc(x.url)+" in Symbiot's own browser. Sign in there, then close that window and click Map page: the hidden browser keeps the sign-in.</div>";}).catch(function(e){screenErr(String((e&&e.message)||e));});}
// A real click: confirmed every time (no confirm() to ask with means no click).
function clickUI(s,i,b){var r=(s.regions||[])[i],c=s.blueprint&&s.blueprint.regions[i];if(!r||!c)return;var d=SCLICKDELAY;
var q="Move your mouse to “"+r.label+"” at ("+c.center.x+", "+c.center.y+")"+(s.monitor?" on "+s.monitor.name+(s.monitor.where?" ("+s.monitor.where+")":""):"")+" and click there"+(d?" in "+d+" seconds":" now")+"?\\n\\nIt clicks whatever is at that spot on your screen"+(d?" by then, so bring the right window to the front.":".")+(s.via==='loaded'?"\\n\\nThis screen was loaded from an image: check it matches your screen now.":"");
if(typeof confirm!=='function'||!confirm(q))return;
b.disabled=true;$('screenmsg').innerHTML="<div class='note muted'>"+(d?"Clicking “"+esc(r.label)+"” in "+d+"s &mdash; bring the right window to the front&hellip;":"Clicking&hellip;")+"</div>";
api('/api/screens/click',{id:s.id,region:r.id,delay:d,confirmed:true}).then(function(x){b.disabled=false;if(!x||x.error){screenErr((x&&x.error)||'failed');return;}
$('screenmsg').innerHTML="<div class='note ok'>&#10003; Clicked “"+esc(x.label)+"” at ("+x.x+", "+x.y+") with "+esc(x.via)+".</div>";}).catch(function(e){b.disabled=false;screenErr(String((e&&e.message)||e));});}
// One screen, or { screens } (one per display); a note says why a capture was kept whole.
function screenAdded(s){if(!s||s.error){screenErr((s&&s.error)||'failed');if(s&&s.blocked)allowShotsBtn(s.blocked);return;}var list=s.screens||[s];
$('screenmsg').innerHTML=s.note?"<div class='note muted'>"+esc(s.note)+"</div>":list.length>1?"<div class='note ok'>&#10003; One screen per display: "+list.map(function(x){return esc(x.monitor?x.monitor.name+(x.monitor.where?" ("+x.monitor.where+")":""):x.name);}).join(', ')+".</div>":'';
$('screenname').value='';SCREEN=list[0];SPEND=null;loadScreensUI();}
function captureUI(){var b=$('capture'),d=+($('screendelay').value||0);b.disabled=true;
$('screenmsg').innerHTML="<div class='note muted'>"+(d?"Capturing in "+d+"s &mdash; bring the window you want to the front&hellip;":"Capturing&hellip;")+"</div>";
api('/api/screens/capture',{name:$('screenname').value||'',delay:d,which:screenWhich()}).then(function(s){b.disabled=false;screenAdded(s);loadMonitorsUI();}).catch(function(e){b.disabled=false;screenErr(String((e&&e.message)||e));});}
// The desktop's screenshot permission is off for the app Symbiot was started
// from: turn it on (asked first, it covers every app started that way), then capture.
function allowShotsBtn(app){$('screenmsg').insertAdjacentHTML('beforeend',"<div class='row' style='margin-top:6px'><button class='act' id='scrallow'>Allow screenshots</button></div>");
$('scrallow').addEventListener('click',function(){if(typeof confirm!=='function'||!confirm("Turn screenshots on for apps started from "+app+"?\\n\\nYour desktop keeps this permission per app, and Symbiot shares it with "+app+", so it covers every app started that way, not only Symbiot."))return;
$('scrallow').disabled=true;api('/api/screens/allow',{confirmed:true}).then(function(x){if(!x||x.error){screenErr((x&&x.error)||'failed');return;}captureUI();}).catch(function(e){screenErr(String((e&&e.message)||e));});});}
function pickImageUI(){var f=$('screenfile');if(f&&f.click)f.click();}
function importUI(){var f=$('screenfile'),file=f&&f.files&&f.files[0];if(!file)return;$('screenmsg').innerHTML="<div class='note muted'>Loading&hellip;</div>";
var rd=new FileReader();rd.onload=function(){api('/api/screens/import',{name:$('screenname').value||file.name.replace(/[.]png$/i,''),png:rd.result}).then(function(s){f.value='';screenAdded(s);});};rd.readAsDataURL(file);}
// Weekly write-up + start at login (desktop.mjs). The Week tab shows the latest
// write-up until you write a new one.
function renderDesktop(d){if(!d)return;var w=d.weekly||{},a=d.autostart||{};$('weeklyon').checked=!!w.on;$('weeklyday').value=String(w.day);$('weeklyhour').value=String(w.hour);$('autostart').checked=!!a.on;
if(a.phone)$('autostartlbl').textContent=a.phone==='app'?'Start Symbiot in the background when the phone starts':'Start Symbiot in the background when the phone starts (needs the Termux:Boot app)';
var n=[];if(d.error)n.push("<span class='err'>"+esc(d.error)+"</span>");
if(w.latest)n.push("Latest write-up: written "+esc(whenWords(w.latest.at))+" (it's on the Week page)");
n.push(a.on&&a.phone==='app'?"Symbiot starts in the background when the phone starts, and keeps running with its window closed (Stop it from its notification).":a.on&&a.phone?"Termux:Boot starts it from <span style='font-family:ui-monospace,monospace'>"+esc(a.file)+"</span> when the phone starts. Open Termux:Boot once after installing it, so Android lets it run.":a.on?"Starts at login from <span style='font-family:ui-monospace,monospace'>"+esc(a.file)+"</span>. Run <b>symbiot app</b> to open its window.":"The weekly write-up happens while Symbiot is running, so start it at login to have it every week. A week missed while the computer was off is written when Symbiot next starts.");
$('desktopnote').innerHTML=n.join('<br>');}
function loadDesktop(err){api('/api/desktop').then(function(d){if(d&&err)d.error=err;renderDesktop(d);});}
function saveWeekly(){api('/api/desktop/weekly',{on:$('weeklyon').checked,day:$('weeklyday').value,hour:$('weeklyhour').value}).then(function(){loadDesktop();});}
function saveAutostart(){api('/api/desktop/autostart',{on:$('autostart').checked}).then(function(a){loadDesktop(a&&a.error);});}
function weeklyNow(){var b=$('weeklynow');b.disabled=true;b.textContent='Writing...';
api('/api/desktop/weekly/run',{}).then(function(r){b.disabled=false;b.textContent='Write it now';loadDesktop(r&&r.error?(r.error==='not-connected'?'Connect an AI above first.':r.error):'');});}
function showLatestWeek(){api('/api/desktop').then(function(d){var l=d&&d.weekly&&d.weekly.latest;if(!l||current!=='week'||$('out').textContent!==WUEMPTY)return;
WUTEXT=l.text;$('out').innerHTML=mdLite(l.text);$('out').classList.remove('muted');$('copy').classList.remove('hidden');var f=$('outfoot');f.textContent='Written '+whenWords(l.at)+(l.footer?' · '+l.footer:'');f.style.display='block';});}
function fitBadge(m){return m.fits?"<span class='tag'>fits your RAM</span>":"<span class='tag' style='background:#3a2a12;border-color:#6b4a1f;color:#F2A541'>needs more RAM</span>";}
function loadRec(){var out=document.getElementById('recout');out.innerHTML="<div class='muted'>Reading your hardware...</div>";
api('/api/models').then(function(d){var hw=d.hardware,rec=d.rec;
var h="<div class='k'><b>"+hw.ramGB+" GB</b> RAM &middot; "+hw.cpuCount+"-core &middot; "+esc(hw.platform)+"/"+esc(hw.arch)+(hw.gpu?" &middot; GPU: "+esc(hw.gpu.name)+(hw.gpu.vramGB?" ("+hw.gpu.vramGB+"GB)":""):"")+"</div>";
h+="<div class='ideas'><h4>Local models &middot; free via Ollama</h4>";
rec.local.forEach(function(m){h+="<div class='idea' style='justify-content:space-between'><span><b>"+esc(m.tier)+"</b> &middot; <code>ollama pull "+esc(m.model)+"</code> <span class='muted'>~"+m.needGB+"GB &middot; "+esc(m.note)+"</span></span> "+fitBadge(m)+"</div>";});
h+="<div class='muted' style='margin-top:6px'>Best fit: <b>"+esc(rec.best)+"</b> &mdash; pull it, then pick <b>Local model (Ollama)</b> above.</div></div>";
h+="<div class='ideas'><h4>Paid models &middot; bring an API key</h4>";
rec.paid.forEach(function(p){h+="<div class='idea'><span><b>"+esc(p.provider)+"</b> &middot; "+esc(p.tier)+" &middot; <code>"+esc(p.model)+"</code> <span class='muted'>&middot; "+esc(p.note)+"</span></span></div>";});
h+="</div>";out.innerHTML=h;});}
document.getElementById('remap').addEventListener('click',function(){loadMap(true);});
document.getElementById('recbtn').addEventListener('click',loadRec);
document.getElementById('setuplocal').addEventListener('click',setupLocalUI);
document.getElementById('addroot').addEventListener('click',addRootUI);
document.getElementById('newroot').addEventListener('keydown',function(e){if(e.key==='Enter')addRootUI();});
$('addknow').addEventListener('click',addKnowUI);
['newknow','newknowex'].forEach(function(id){$(id).addEventListener('keydown',function(e){if(e.key==='Enter')addKnowUI();});});
document.getElementById('addtrusted').addEventListener('click',addTrustedUI);
document.getElementById('addsitego').addEventListener('click',addSiteUI);var lck=document.getElementById('linecheck');if(lck)lck.addEventListener('click',lineCheck);var ows=document.getElementById('ownset');if(ows)ows.addEventListener('click',ownSetUp);
document.getElementById('addsite').addEventListener('keydown',function(e){if(e.key==='Enter')addSiteUI();});
document.getElementById('newtrusted').addEventListener('keydown',function(e){if(e.key==='Enter')addTrustedUI();});
document.getElementById('driftrun').addEventListener('click',function(){driftLoaded=false;loadDrift();});
document.getElementById('agentsrefresh').addEventListener('click',loadAgents);
document.getElementById('pushtasks').addEventListener('click',pushTasksUI);
document.getElementById('agentcmd').addEventListener('change',saveAgent);
document.getElementById('granttoolbtn').addEventListener('click',function(){grant('tool');});
document.getElementById('grantdirbtn').addEventListener('click',function(){grant('dir');});
document.getElementById('granttool').addEventListener('keydown',function(e){if(e.key==='Enter')grant('tool');});
document.getElementById('grantdir').addEventListener('keydown',function(e){if(e.key==='Enter')grant('dir');});
document.getElementById('mailon').addEventListener('change',setMailOn);
document.getElementById('mailaddrs').addEventListener('change',saveMailAddrs);
document.getElementById('addmail').addEventListener('click',addMailUI);
document.getElementById('newmail').addEventListener('keydown',function(e){if(e.key==='Enter')addMailUI();});
document.getElementById('mailpreview').addEventListener('click',previewMail);
document.getElementById('capture').addEventListener('click',captureUI);
document.getElementById('screenload').addEventListener('click',pickImageUI);
document.getElementById('mappage').addEventListener('click',function(){mapUI($('pagesite').value,$('mappage'));});
document.getElementById('pagesite').addEventListener('keydown',function(e){if(e.key==='Enter')mapUI($('pagesite').value,$('mappage'));});
document.getElementById('pagesignin').addEventListener('click',signInUI);
document.getElementById('screenfile').addEventListener('change',importUI);
document.getElementById('screenwhich').addEventListener('change',function(){try{localStorage.setItem('symbiot_screenwhich',screenWhich());}catch(e){}});
document.getElementById('weeklyon').addEventListener('change',saveWeekly);
document.getElementById('weeklyday').addEventListener('change',saveWeekly);
document.getElementById('weeklyhour').addEventListener('change',saveWeekly);
document.getElementById('weeklynow').addEventListener('click',weeklyNow);
document.getElementById('autostart').addEventListener('change',saveAutostart);
(function(){var h='';for(var i=0;i<24;i++)h+="<option value='"+i+"'>"+(i<10?'0':'')+i+":00</option>";document.getElementById('weeklyhour').innerHTML=h;})();
var SRV_STARTED=null,srvDown=false,updBusy=false;
try{localStorage.removeItem('symbiot_update_tried');}catch(e){} // the old page-side guess (see heartbeat)
function ubar(){return document.getElementById('updatebar');}
// One Symbiot window, not a pile: each window has an id, says so the first time it
// asks, and the server remembers the newest. An older one closes itself, unless it's
// the one you're in (it says so and can take over; so does a tab the browser won't
// close). Away's windows don't count, nor does a headless browser: an agent taking a
// screenshot of Home closed the user's window each time (2026-10-08).
function winHeadless(){var n=window.navigator||{};return !!n.webdriver||/Headless/i.test(n.userAgent||'');}
var WIN_ID=/[?&]away=1(&|$)/.test(location.search||'')||winHeadless()?'':Math.random().toString(36).slice(2,12),WIN_NEW=true; // read from the address: AWAY is set further down
function winTakeOver(){WIN_NEW=true;var o=$('winold');if(o)o.remove();heartbeat(false);}
function winOld(){if(!(document.hasFocus&&document.hasFocus()))try{window.close();}catch(e){}setTimeout(function(){if($('winold')||!document.body)return;var o=document.createElement('div');o.id='winold';o.className='updatebar reconnect show';o.innerHTML="Symbiot is open in a newer window. <button class='ghost' id='wintake'>Use this one</button>";document.body.appendChild(o);var t=$('wintake');if(t)t.onclick=winTakeOver;},400);}
// A ping that gets no answer within 5 s says so in the bar (Symbiot is busy…) rather than
// nothing: a stalled server looked like dead buttons (15 Oct 2026). Not a lost server: no reload.
function heartbeat(fresh){
  var q=[];if(fresh)q.push('fresh=1');if(WIN_ID){q.push('w='+WIN_ID);if(WIN_NEW)q.push('new=1');}
  apiIn(5000,'/api/ping'+(q.length?'?'+q.join('&'):'')).then(function(p){
    if(WIN_ID){WIN_NEW=false;if(p&&p.window&&p.window!==WIN_ID){if(!$('winold'))winOld();return;}}
    var b=ubar();
    var ve=document.getElementById('ver');if(ve&&p.version){ve.textContent='v'+p.version+(p.sandbox?' · sandbox':'');if(p.sandbox){ve.title='A brand-new Symbiot to try first run in (symbiot app --fresh): its own empty home, none of your data, accounts or memory. It is deleted when you quit.';ve.style.color='var(--amber)';}}
    if(SRV_STARTED===null){SRV_STARTED=p.started;appBar(p);}
    else if(p.started!==SRV_STARTED){location.reload();return;}
    if(srvDown){location.reload();return;}
    if(updBusy||selIn(b))return; // not under text you're selecting in it
    // An update in flight, from any window: where it is, and no button (a second
    // click started a second npm install over the first, and they collided).
    if(p.updating){var w=p.updating,m=Math.max(0,Math.floor((Date.now()-(w.since||Date.now()))/60000));b.className='updatebar show';
      b.innerHTML=w.retrying?"Updating to "+esc(w.target)+" once npm has its download (a few minutes after a release): looking every "+Math.round((w.every||30000)/1000)+" seconds, for up to "+Math.round((w.wait||1200000)/60000)+" minutes"+(m?" ("+m+" so far)":"")+". Nothing to do.":w.installed&&w.waitFor?esc(w.target)+" is installed. Symbiot restarts on it once nothing&rsquo;s running ("+esc(w.waitFor)+" now), and this page reloads.":"Updating to "+esc(w.target)+"&hellip; Symbiot restarts by itself when it&rsquo;s in, and this page reloads.";return;}
    // The last one didn't go through: what npm said, and Try again (not a terminal). One
    // that installed but came back on the old version is one of these too, with why: the
    // server keeps where an update got to. The page used to guess that from any restart
    // after a click, and said "didn't take" with npm never run (2026-10-12).
    var f=p.updateFailed;
    if(f&&p.latest&&p.newer&&f.target===p.latest){b.className='updatebar reconnect show';
      b.innerHTML="The update to "+esc(f.target)+" didn&rsquo;t go through: "+esc(String(f.error||'npm stopped').replace(/[.]$/,''))+". You&rsquo;re still on "+esc(p.version)+". <button id='doupd'>Try again</button>";
      var ab=document.getElementById('doupd');if(ab)ab.onclick=doUpdate;return;}
    if(p.latest&&p.newer){
      b.className='updatebar show';
      var au=p.autoUpdate,auw=!au?"":au.why==="busy"?" It updates by itself once nothing&rsquo;s running ("+esc(au.busy||"an agent is working")+" now).":au.why==="download"?" It updates by itself once npm has its download.":" It updates by itself in a minute or two, as nothing&rsquo;s running.";
      b.innerHTML="A new Symbiot ("+esc(p.latest)+") is available &mdash; you're on "+esc(p.version)+"."+auw+" <button id='updnew'>What&#39;s new</button> <button id='doupd'>Update &amp; restart</button>";
      var btn=document.getElementById('doupd');if(btn)btn.onclick=doUpdate;
      var nb=document.getElementById('updnew');if(nb)nb.onclick=function(){api('/api/whatsnew?latest=1').then(function(r){showNews(r,"What Symbiot "+(r.version||p.latest)+" brings",false);});};
    }else{b.className='updatebar';}
  }).catch(function(e){var b=ubar();if(e&&e.name==='TimeoutError'){if(!srvDown&&!updBusy){b.className='updatebar show';b.textContent='Symbiot is busy… (no answer for 5 seconds; it catches up by itself)';}return;}
    srvDown=true;b.className='updatebar reconnect show';b.textContent='Reconnecting to Symbiot…';
    // the cards keep their last state, dimmed, with when that was (Home's work scene, lqRelay)
    if(document.body&&document.body.classList&&!document.body.classList.contains('lq-offline')){document.body.classList.add('lq-offline');try{if(typeof lqRelay==='function'&&LQ.scene==='work')lqRelay();}catch(e2){}}});
}
// Symbiot in Termux, open in the phone's browser: offer Symbiot's Android app,
// which shows this same Symbiot full screen (Chrome hands an intent:// link to it)
function appBar(p){var b=$('appbar');if(!b||!p.termux||window.SymbiotAndroid||typeof navigator==='undefined'||!/Android/i.test(navigator.userAgent||''))return;
  try{if(localStorage.getItem('symbiot_appbar_off'))return;}catch(e){}
  var go=('intent://'+location.host+'/?t='+encodeURIComponent(T)+'#Intent;scheme=symbiot;package=co.symbiot.app;end').replace(/'/g,'%27'); // the token is no longer in the address (T above)
  b.className='updatebar show';b.innerHTML="Got Symbiot's Android app? It shows this Symbiot full screen. <a class='b' href='"+esc(go)+"'>Open in the app</a> <button id='appbaroff'>Hide</button>";
  $('appbaroff').onclick=function(){b.className='updatebar';try{localStorage.setItem('symbiot_appbar_off','1');}catch(e){}};}
// What's new (server.mjs whatsNew, from CHANGELOG.md): what an update brings, from its package on npm, and
// once after an update, what came with it, until Got it
function showNews(r,title,after){var el=$('whatsnew');if(!el)return;var cs=(r&&r.changes)||[];
if(!cs.length){if(after||!r){el.className='whatsnew';return;}el.className='whatsnew show';el.innerHTML="<div class='row'><span style='flex:1'>"+esc(r.error||"No changelog for "+(r.version||'that version')+" yet.")+"</span><button class='ghost' id='wnok'>Close</button></div>";$('wnok').onclick=function(){el.className='whatsnew';};return;}
var md=function(s){return esc(s).replace(/\\x60([^\\x60]+)\\x60/g,'<code>$1</code>').replace(/\\*\\*([^*]+)\\*\\*/g,'<b>$1</b>');};
el.className='whatsnew show';el.innerHTML="<div class='row'><b style='flex:1;color:var(--bone)'>"+esc(title)+"</b><button class='ghost' id='wnok'>"+(after?'Got it':'Close')+"</button></div>"
+cs.map(function(c){return "<div style='margin-top:8px'><b>"+esc(c.version)+"</b>"+(c.date?" <span class='muted'>"+esc(c.date)+"</span>":"")+"<ul style='margin:4px 0 0 18px;padding:0'>"+c.items.slice(0,12).map(function(x){return "<li>"+md(x)+"</li>";}).join('')+(c.items.length>12?"<li class='muted'>&hellip;and "+(c.items.length-12)+" more</li>":"")+"</ul></div>";}).join('');
$('wnok').onclick=function(){el.className='whatsnew';if(after)api('/api/whatsnew/seen',{});};}
function loadWhatsNew(){api('/api/whatsnew').then(function(r){if(r&&r.changes&&r.changes.length)showNews(r,"What's new in Symbiot "+r.version,true);});}
function doUpdate(){updBusy=true;var b=ubar();b.className='updatebar show';b.textContent='Updating & restarting… this page will reload itself when it is back.';
  // still waiting for npm's download (or already under way): the heartbeat shows where it is
  api('/api/update',{}).then(function(r){if(r&&(r.waiting||r.already||r.error)){updBusy=false;if(r.error){b.className='updatebar reconnect show';b.textContent=r.error;}}});}
setInterval(heartbeat,4000);heartbeat(true);
window.addEventListener('focus',function(){heartbeat(true);}); // re-check for updates when you come back to the window


`;
