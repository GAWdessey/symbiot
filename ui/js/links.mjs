// symbiot — linked sites (the plugs) and what Symbiot remembers.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// The plug marks the sites your agent's runs can use too, before you link them: only
// those Claude has a connector for, and only with Claude Code as your agent (agents.mjs
// linkReach). Faint until you've connected it in claude.ai.
function reachOf(d,id){var r=d.reach,s=r&&r.claude&&r.sites&&r.sites[id];return s||null;}
function linksHtml(d,board){var anyR=d.items.some(function(it){return reachOf(d,it.id);});
var h="<div class='cxh'><span>Connections</span><small>"+(d.linked?"What Symbiot watches for you. Link more to see what arrives there, here and in Week and Standup.":"Link your work to see what arrives there, here and in Week and Standup.")+"</small>"
+(anyR?"<small class='cxlg'><i class='ic-plug cxa ready' aria-hidden='true'></i> your agent&#39;s runs can use it too, through Claude&#39;s connector for it <span class='cxlgf'><i class='ic-plug cxa' aria-hidden='true'></i> faint: once you connect it in claude.ai (Settings &rarr; Connectors)</span></small>":"")+"</div>";
if(d.chrome)h+="<label class='cxall'><input type='checkbox' class='lactall'"+(d.actAll?" checked":"")+"> Agents may click and type on any site in your Chrome <small>sending, posting, paying and deleting still wait for your Go</small></label>";
if(d.error)h+="<div class='note err'>"+esc(d.error)+"</div>";
h+="<div class='cxg'>"+d.groups.map(function(g){return "<div class='cxc'><div class='cxl'>"+esc(g)+"</div>"+d.items.filter(function(x){return x.group===g;}).map(function(it){var on=it.state!=='off';
var rc=reachOf(d,it.id),rt=rc?(rc.ready?" Your agent's runs can use it too, through Claude's "+rc.connector.replace(/^claude\.ai\s+/i,'')+" connector.":" Your agent's runs can use it too once you connect "+rc.name+" in claude.ai → Settings → Connectors (only you can sign in there)."):'';
return "<div class='lnk cx "+escQ(it.state)+"' data-id='"+escQ(it.id)+"'><button type='button' class='lbtn' title='"+escQ(String(it.note||(on?'open '+it.url+' to sign in again':'sign in at '+it.url+' and link it')).replace(/\.?\s*$/,rt?'.':'')+rt)+"'><span class='cxb' aria-hidden='true'></span><span class='cxn'>"+esc(it.name)+"</span>"+(rc?"<i class='ic-plug cxa"+(rc.ready?" ready":"")+"' role='img' aria-label='"+escQ(rc.ready?"agent runs can use it too":"agent runs can use it once connected in claude.ai")+"'></i>":"")+"<span class='cxs'>"+(on?esc(LINKWORD[it.state]||''):'Link')+"</span></button>"+
(on?"<button type='button' class='lmore' title='check it now' aria-label='Check "+escQ(it.name)+" now'>&#8635;</button>"+(d.chrome?"<button type='button' class='lact"+(it.act?" on":"")+"' aria-pressed='"+(it.act?"true":"false")+"' title='"+escQ(it.act?"Agents may click, type and fill here in your own Chrome. Anything that sends, posts, pays or deletes still waits for your Go on a card. Click to make it read-only again.":"Agents only read this site in your own Chrome. Click to let them click, type and fill here too: anything that sends, posts, pays or deletes waits for your Go on a card.")+"'>"+(it.act?"Acts":"Reads")+"</button>":"")+"<button type='button' class='lrm' title='unlink: stop watching it and stop trusting it'>Unlink</button>":"")+"</div>";}).join('')+"</div>";}).join('')+"</div>";
// what a check that couldn't confirm a sign-in found (links.mjs foundNote), in plain sight
var nn=d.items.filter(function(it){return (it.state==='signin'&&it.note)||it.warn;}).map(function(it){return it.state==='signin'&&it.note?it:{name:it.name,note:it.warn};});
if(nn.length)h+="<div class='note muted'>"+nn.map(function(it){return "<div><b>"+esc(it.name)+"</b>: "+esc(it.note)+"</div>";}).join('')+"</div>";return h;}
function linksOut(html){var o=document.getElementById('linksmsg');if(o)o.innerHTML=html;var b=document.getElementById('boardmsg');if(b&&LINKS&&!LINKS.linked)b.innerHTML=html;}
function sbOpen(url){api('/api/browser/open',url?{url:url}:{}).then(function(r){if(r&&r.error)linksOut("<div class='note err'>"+esc(r.error)+"</div>");}).catch(function(){});}
function renderLinks(){if(!LINKS)return;['links','boardlinks'].forEach(function(id){var el=document.getElementById(id);if(!el)return;
el.innerHTML=linksHtml(LINKS,id==='boardlinks');
var all=el.querySelector('.lactall');if(all)all.addEventListener('change',function(){all.disabled=true;api('/api/links/actall',{on:all.checked}).then(function(r){if(r&&r.error)linksOut("<div class='note err'>"+esc(r.error)+"</div>");else if(r&&r.items){LINKS=r;renderLinks();}});});
el.querySelectorAll('.lnk').forEach(function(sp){var lid=sp.getAttribute('data-id'),nm=sp.querySelector('.cxn'),name=nm?nm.textContent:sp.querySelector('.lbtn').textContent;
sp.querySelector('.lbtn').addEventListener('click',function(){linksOut("<div class='note muted'>Opening "+esc(name)+"&hellip;</div>");
api('/api/links/link',{id:lid}).then(function(r){if(!r||r.error){linksOut("<div class='note err'>"+esc(name)+": "+esc((r&&r.error)||'failed')+"</div>");loadLinks();return;}
linksOut("<div class='note ok'>Opened the Symbiot Browser with "+esc(name)+". Sign in there as you normally do, then click Done in the Symbiot Browser: Symbiot checks it within a minute.</div>");loadLinks();
[20000,60000,120000].forEach(function(ms){setTimeout(loadLinks,ms);});});});
var m=sp.querySelector('.lmore');if(m)m.addEventListener('click',function(){m.disabled=true;api('/api/links/check',{id:lid}).then(function(r){m.disabled=false;
if(r&&r.busy)linksOut("<div class='note muted'>The Symbiot Browser is open. Click Done in it when you’ve signed in, then check again.</div>");else if(r&&r.error)linksOut("<div class='note err'>"+esc(r.error)+"</div>");loadLinks();loadBoard();});});
var ac=sp.querySelector('.lact');if(ac)ac.addEventListener('click',function(){ac.disabled=true;api('/api/links/act',{id:lid,on:!ac.classList.contains('on')}).then(function(r){if(r&&r.error)linksOut("<div class='note err'>"+esc(r.error)+"</div>");else if(r&&r.items){LINKS=r;renderLinks();}});});
var x=sp.querySelector('.lrm');if(x)x.addEventListener('click',function(){api('/api/links/unlink',{id:lid}).then(function(){linksOut('');loadLinks();loadTrusted();loadBoard();});});});});}
// What Symbiot remembers (mind.mjs): a row per thing, with what it knows; × forgets one.
function loadMind(){api('/api/mind').then(function(d){var el=document.getElementById('mindlist');if(!el||!d)return;var ns=d.nodes||[];
el.innerHTML=ns.length?ns.slice(0,60).map(function(n){return "<div class='task' data-id='"+escQ(n.id)+"'><span class='t'><b>"+esc(n.name)+"</b> <span class='muted' style='font-size:11px'>"+esc(n.kind)+"</span><br><span class='muted' style='font-size:12px'>"+esc(n.facts.join(' · '))+"</span></span><button class='rm forgetone' title='forget this'>&times;</button></div>";}).join('')+"<div class='row' style='margin-top:8px'><button class='ghost' id='forgetall'>Forget everything</button></div>":"<div class='muted' style='font-size:12px;margin-top:6px'>Nothing yet. It fills in as you talk to Symbiot on the Dashboard and in Tasks.</div>";
el.querySelectorAll('.forgetone').forEach(function(b){b.addEventListener('click',function(){api('/api/mind/forget',{id:b.closest('.task').getAttribute('data-id')}).then(loadMind);});});
var fa=document.getElementById('forgetall');if(fa)fa.addEventListener('click',function(){api('/api/mind/forget',{id:'all'}).then(loadMind);});});}
function loadLinks(){api('/api/links').then(function(d){if(d&&d.items){LINKS=d;renderLinks();}});}
// This computer's connection (lineblocks.mjs): the last check of its address against two proxy
// lists, and the sites that refused it, each with Forget for when it's been sorted out.
function lineHtml(d){var l=d&&d.line,h='';
if(l&&l.ip){var said=l.lists.map(function(x){return x.error?x.name+" didn't answer":x.name+(x.proxy?' lists it as ':' calls it ')+x.kind;}).join('; ');
h+="<div class='note "+(l.listed?'err':'ok')+"'>Your address "+esc(l.ip)+": "+esc(said)+'. '+(l.listed?"A site that uses a list like that may refuse this computer, your own Chrome included: do steps on such a site on your phone, on mobile data.":"No proxy list here calls it a proxy.")+" <span class='muted'>Checked "+esc(agoTxt(l.at))+".</span></div>";}
var s=(d&&d.sites)||[];
if(s.length)h+="<div class='note muted'>Refused this computer's connection, so their steps go to your phone on mobile data:</div>"+s.map(function(x){return "<div class='task' data-h='"+escQ(x.host)+"'><span class='t'><b>"+esc(x.host)+"</b><br><span class='muted'>"+esc(String(x.why||'').replace(/^it ([a-z])/,function(m,c){return c.toUpperCase();}))+", since "+esc(vaultDate(x.at)||x.at)+"</span>"+(x.review?" &middot; <a href='"+escQ(x.review)+"' target='_blank' rel='noopener'>its review form</a>":'')+"</span><button type='button' class='ghost lineforget' aria-label='Forget "+escQ(x.host)+"'>Forget</button></div>";}).join('');
return h;}
var LINE=null;
function loadLine(){var b=document.getElementById('linebox');if(!b)return;api('/api/line').then(function(d){LINE=d;b.innerHTML=lineHtml(d);lineWire(b);}).catch(function(){});}
function lineWire(b){b.querySelectorAll('.lineforget').forEach(function(x){x.addEventListener('click',function(){x.disabled=true;api('/api/line/forget',{host:x.closest('.task').getAttribute('data-h')}).then(loadLine);});});}
function lineCheck(){var b=document.getElementById('linebox'),k=document.getElementById('linecheck');if(!b||!k)return;k.disabled=true;k.textContent='Checking…';
api('/api/line/check',{}).then(function(r){k.disabled=false;k.textContent=r&&r.error?'Check':'Check again';if(r&&r.error){b.innerHTML="<div class='note err'>"+esc(r.error)+"</div>"+lineHtml(LINE);lineWire(b);return;}loadLine();}).catch(function(){k.disabled=false;k.textContent='Check';b.innerHTML="<div class='note err'>Couldn't reach Symbiot to check.</div>"+lineHtml(LINE);lineWire(b);});}
// Your own Chrome (ownchrome.mjs): Set up writes the extension's folder and registers its host
// with each Chromium browser here; then the steps to load it in Chrome once, or, once it's
// connected, the sites Chrome allowed it and those waiting for an Allow on its toolbar button.
// The presses you said Go or Don't to, in your Chrome or through a connector: what, where, when, which agent, what came of it
function pressesHtml(ps){if(!ps||!ps.length)return '';return "<div class='ownpress'><b>After your Go</b>"+goesHtml(ps)+"</div>";}
function ownHtml(d){return ownSetHtml(d)+pressesHtml(d&&d.presses);}
function ownSetHtml(d){if(!d||!d.setUp)return '';var h='';
if(d.connected){var on=(d.origins||[]).map(function(o){return o.replace(/^https?:[/][/]/,'');});
h+="<div class='note "+(d.stopped?'err':'ok')+"'>"+(d.stopped?"Stopped from Symbiot's button in Chrome's toolbar: press Start there to let it work again.":"Connected to your Chrome (extension "+esc(d.version||'')+"). "+(on.length?"It may work on "+esc(on.join(', '))+'.':"No site is allowed there yet."))+"</div>";
if((d.asks||[]).length)h+="<div class='note muted'>Waiting for your Allow in Chrome: "+esc(d.asks.map(function(o){return o.replace(/^https?:[/][/]/,'');}).join(', '))+". Click Symbiot's button in Chrome's toolbar and press Allow.</div>";
return h;}
h+="<div class='note muted'>Load it in Chrome once:</div><ol class='ownsteps'><li>In Chrome, go to <b>chrome://extensions</b> and turn on <b>Developer mode</b> (top right).</li><li>Press <b>Load unpacked</b> and choose this folder:<div class='ownpathrow'><code class='ownpath'>"+esc(d.folder)+"</code><button type='button' class='ghost owncopy' aria-label='Copy the folder'>Copy</button></div></li><li>Keep Chrome open: it connects by itself, and this says so.</li></ol>";
if((d.hosts||[]).length)h+="<div class='note muted'>Ready on this computer for "+esc(d.hosts.join(', '))+".</div>";
return h;}
function loadOwn(){var b=document.getElementById('ownbox'),k=document.getElementById('ownset');if(!b)return;api('/api/own-chrome').then(function(d){b.innerHTML=ownHtml(d);if(k)k.textContent=d&&d.setUp?'Set up again':'Set up';ownWire(b,d);}).catch(function(){});}
function ownWire(b,d){var c=b.querySelector('.owncopy');if(c)c.addEventListener('click',function(){var done=function(){c.textContent='Copied';setTimeout(function(){c.textContent='Copy';},1500);};try{navigator.clipboard.writeText(d.folder).then(done,function(){fallbackCopy(d.folder);done();});}catch(e){fallbackCopy(d.folder);done();}});}
function ownSetUp(){var b=document.getElementById('ownbox'),k=document.getElementById('ownset');if(!b||!k)return;k.disabled=true;
api('/api/own-chrome/setup',{}).then(function(d){k.disabled=false;if(d&&d.error){b.innerHTML="<div class='note err'>"+esc(d.error)+"</div>";return;}if(d&&!(d.browsers||[]).length&&!d.connected){b.innerHTML="<div class='note err'>No Chrome, Chromium, Brave or Edge was found on this computer.</div>";return;}loadOwn();}).catch(function(){k.disabled=false;b.innerHTML="<div class='note err'>Couldn't reach Symbiot to set it up.</div>";});}
// Sign in to a site for agents: the Symbiot Browser opens on it (links.mjs addSite:
// added under Connections → Your sites, trusted, checked once you click Done there).
// From Settings, a trusted site, a card or a reply that asks you to sign in. s: { site } or { id }.
function signInSaid(nm){return 'Opened the Symbiot Browser with '+nm+'. Sign in there as you normally do, then click Done in the Symbiot Browser: Settings → Connections shows when it’s signed in.';}
function openSignIn(s,say){if(!s||(!s.site&&!s.id)){say('There’s no site to open for this sign-in. Add it in Settings → Connections.',false);return;}api('/api/links/site',s.id?{id:s.id}:{site:s.site}).then(function(r){var nm=(r&&r.item&&r.item.name)||s.name||s.site||'it';
if(!r||r.error){say(nm+': '+((r&&r.error)||'it didn’t open'),false);return;}say(signInSaid(nm),true);loadLinks();loadTrusted();[20000,60000,120000].forEach(function(ms){setTimeout(loadLinks,ms);});}).catch(function(e){say(String((e&&e.message)||e),false);});}
function addSiteUI(){var i=document.getElementById('addsite'),v=((i&&i.value)||'').trim();if(!v)return;openSignIn({site:v},function(t,ok){if(ok)i.value='';linksOut("<div class='note "+(ok?'ok':'err')+"'>"+esc(t)+"</div>");});}
// Trusted sites: where Screens' Press and Type don't ask first (headless.mjs).
function loadTrusted(){api('/api/screens/trusted').then(function(d){var box=document.getElementById('trustedsites');var sites=(d&&d.sites)||[];
box.innerHTML=sites.length?sites.map(function(h){return "<div class='task' data-h='"+esc(h)+"'><span class='t' style='font-family:ui-monospace,monospace;font-size:12px'>"+esc(h)+"</span><button class='ghost tsign' title='open "+esc(h)+" in the Symbiot Browser, to sign in for agents'>Sign in</button><button class='rm rmtrusted' title='stop trusting it: press and type ask first again'>&times;</button></div>";}).join(""):"<div class='muted' style='font-size:12px'>None yet: Press and Type ask first on every site.</div>";
box.querySelectorAll('.tsign').forEach(function(btn){btn.addEventListener('click',function(){var h=btn.closest('.task').getAttribute('data-h');openSignIn({site:h},function(t,ok){var n=document.getElementById('trustednote');if(n)n.innerHTML="<span class='"+(ok?'ok':'err')+"'>"+esc(t)+"</span>";});});});
box.querySelectorAll('.rmtrusted').forEach(function(btn){btn.addEventListener('click',function(){api('/api/screens/trusted/remove',{site:btn.closest('.task').getAttribute('data-h')}).then(function(){loadTrusted();loadScreensUI();});});});});}
`;
