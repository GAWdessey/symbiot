// symbiot — the Vault page: the list, the detail, the unlock box, add, rename, delete.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// The Vault page (vaultview.mjs): what's saved, grouped by the service it's for, the one you
// pick in a pane beside the list (on a phone, a page of its own), and what needs a look: a name
// that says nothing, a value saved twice, a file's name taken for a password. No value is in the
// page until it's unlocked with the vault PIN: the unlock box comes up over the page, where you
// are, then does what you pressed, and the unlock holds while you use it (the server renews it on
// each use, VLT.until). Values it showed live only here (VLT.shown) and go when it locks, when you
// leave the page or the window is hidden. A copied value leaves the clipboard after VCLIP_MS
// (vaultClip); a delete waits VDEL_MS for Undo. Nothing here is sent to the AI or kept elsewhere.
var VLT={list:[],token:'',until:0,shown:{},q:'',f:'all',sel:'',one:false,pin:true,wait:0,waitTo:0,log:[],then:null,busy:false,mode:'',state:'load',ok:{},del:null,sheet:''},VLT_T=null,VCLIP_MS=30000,VCLIP={t:null,v:'',pend:false},VDEL_MS=8000,VMSG_T=null;
var VIC={lock:"<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><rect x='4' y='11' width='16' height='10' rx='2.5'/><path d='M8 11V7.5a4 4 0 0 1 8 0V11'/></svg>",
open:"<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><rect x='4' y='11' width='16' height='10' rx='2.5'/><path d='M8 11V7.5a4 4 0 0 1 7.7-1.5'/></svg>",
eye:"<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z'/><circle cx='12' cy='12' r='3'/></svg>",
copy:"<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><rect x='9' y='9' width='12' height='12' rx='2.5'/><path d='M5 15V5.5A2.5 2.5 0 0 1 7.5 3H15'/></svg>",
check:"<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='m5 12.5 4.5 4.5L19 7.5'/></svg>",
back:"<svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='m15 5-7 7 7 7'/></svg>"};
var VKINDS={pw:['Password','PIN'],key:['API key or token','Account ID'],code:['Recovery codes','One-time code']};
function vaultOpen(){return !!VLT.token&&VLT.until>Date.now();}
function vaultLeft(ms){var s=Math.max(0,Math.ceil(ms/1000));return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2);}
function vaultDate(t){try{return new Date(t).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});}catch(e){return '';}}
function vaultHue(s){var h=0;s=String(s||'');for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%360;return h;}
function vaultMono(g){var l=String(g||'?').replace(/[^A-Za-z0-9]/g,'').charAt(0).toUpperCase()||'?';return "<span class='vmono' style='--h:"+vaultHue(g)+"' aria-hidden='true'>"+esc(l)+"</span>";}
function vaultSub(e){var p=[e.kind];if(e.account)p.push(e.account);if(e.count>1)p.push(e.left+' of '+e.count+' unused');return p.join(' · ');}
function vaultFmt(v){return String(v).split('').map(function(c){var x=esc(c);return /[0-9]/.test(c)?"<span class='vd'>"+x+"</span>":/[A-Za-z]/.test(c)?x:"<span class='vs'>"+x+"</span>";}).join('');}
function vaultFind(n){return VLT.list.filter(function(x){return x.name===n;})[0]||null;}
// a note at the foot of the screen, where it's seen wherever you pressed; undo: a button that calls it
function vaultSay(t,cls,undo,ms){var m=$('vaultmsg');if(!m)return;if(VMSG_T){clearTimeout(VMSG_T);VMSG_T=null;}m.className=cls||'';m.innerHTML=t?"<span>"+esc(t)+"</span>"+(undo?"<button type='button' id='vaultundo'>Undo</button>":''):'';
var u=$('vaultundo');if(u&&undo)u.addEventListener('click',function(){undo();vaultSay('');});if(t)VMSG_T=setTimeout(function(){vaultSay('');},ms||(undo?VDEL_MS:4500));}
function vaultDrop(){VLT.token='';VLT.until=0;VLT.shown={};VLT.ok={};if(VLT_T){clearInterval(VLT_T);VLT_T=null;}}
function vaultFlush(){var d=VLT.del;if(!d)return;VLT.del=null;clearTimeout(d.t);api('/api/vault/delete',{name:d.name,token:d.token}).then(function(r){if(r&&r.error)vaultSay("Couldn't delete it: "+r.error,'err');loadVault();}).catch(function(){});}
function vaultLockNow(){vaultFlush();if(VLT.token)api('/api/vault/lock',{token:VLT.token}).catch(function(){});vaultDrop();VLT.then=null;if(VLT.mode==='rename'||VLT.mode==='delete')VLT.mode='';vaultClose();if(current==='vault')vaultDraw();}
function vaultTick(){if(VLT.wait&&VLT.waitTo<=Date.now()){VLT.wait=0;if(VLT.sheet==='unlock')vaultSheet('unlock');}
var w=$('vaultwait');if(w)w.textContent=vaultLeft(VLT.waitTo-Date.now());
if(VLT.token&&!vaultOpen()){vaultDrop();if(VLT.mode==='rename'||VLT.mode==='delete')VLT.mode='';vaultSay('Locked again: values are hidden.');vaultDraw();return;}
var s=$('vaultleft');if(s)s.textContent=vaultLeft(VLT.until-Date.now());if(!VLT.token&&!VLT.wait&&VLT_T){clearInterval(VLT_T);VLT_T=null;}}
function vaultTimer(){if(!VLT_T)VLT_T=setInterval(vaultTick,1000);}
function vaultHeld(r){if(r&&r.until){VLT.until=r.until;}}
function loadVault(){if(!VLT.list.length&&VLT.state!=='ok'){VLT.state='load';vaultDraw();}
api('/api/vault',{token:VLT.token}).then(function(d){if(!d||d.error){VLT.state='err';VLT.why=(d&&d.error)||'';vaultDraw();return;}
VLT.state='ok';VLT.list=d.entries||[];VLT.pin=!!d.pin;VLT.wait=d.wait||0;VLT.waitTo=Date.now()+VLT.wait;if(VLT.wait)vaultTimer();VLT.log=d.log||[];if(!d.unlocked)vaultDrop();else{VLT.until=d.unlocked;vaultTimer();}vaultDraw();}).catch(function(){VLT.state='err';VLT.why='';vaultDraw();});}
function vaultKind(e,f){if(f==='all')return true;if(f==='look')return !!(e.issues&&e.issues.length);var k=VKINDS[f];return k?k.indexOf(e.kind)>=0:e.kind==='Secret';}
function vaultMatch(e,q){if(!q)return true;return (e.label+' '+e.name+' '+e.group+' '+e.kind+' '+(e.account||'')).toLowerCase().indexOf(q)>=0;}
function vaultVisible(){var del=VLT.del&&VLT.del.name;return VLT.list.filter(function(e){return e.name!==del&&vaultKind(e,VLT.f)&&vaultMatch(e,VLT.q);}).sort(function(a,b){var ga=a.group==='Other'?'~':a.group.toLowerCase(),gb=b.group==='Other'?'~':b.group.toLowerCase();return ga<gb?-1:ga>gb?1:a.short.toLowerCase()<b.short.toLowerCase()?-1:1;});}
function vaultFilters(){var del=VLT.del&&VLT.del.name,all=VLT.list.filter(function(e){return e.name!==del;}),n=function(f){return all.filter(function(e){return vaultKind(e,f);}).length;},look=n('look');
var fs=[['all','All',all.length]].concat(look?[['look','Needs a look',look]]:[]).concat([['pw','Passwords',n('pw')],['key','Keys and IDs',n('key')],['code','Codes',n('code')],['other','Other',n('other')]]).filter(function(x){return x[0]==='all'||x[0]===VLT.f||x[2]>0;});
return fs.map(function(x){return "<button type='button' data-va='filter' data-f='"+x[0]+"' aria-pressed='"+(VLT.f===x[0])+"'>"+(x[0]==='look'?"<span class='vdot' aria-hidden='true'></span>":'')+esc(x[1])+" <i>"+x[2]+"</i></button>";}).join('');}
function vaultChip(){if(vaultOpen())return VIC.open+"<span>Unlocked <b id='vaultleft'>"+vaultLeft(VLT.until-Date.now())+"</b></span><button type='button' class='vtxt' data-va='lock'>Lock</button>";
if(!VLT.pin)return VIC.lock+"<span class='vcl'>No PIN yet</span><button type='button' class='vtxt' data-va='unlockchip'>Set a PIN</button>";
return VIC.lock+"<span class='vcl'>Locked</span><button type='button' class='vtxt' data-va='unlockchip'>Unlock</button>";}
// The list: each service's entries under its name, A to Z, "Other" last
function vaultListHtml(list){var out='',g=null,cnt={};list.forEach(function(e){cnt[e.group]=(cnt[e.group]||0)+1;});
list.forEach(function(e){if(e.group!==g){g=e.group;out+="<div class='vgh' role='presentation'>"+esc(g)+" <i>"+cnt[g]+"</i></div>";}
var look=e.issues&&e.issues.length;out+="<button type='button' class='vrow' role='option' data-va='pick' data-n='"+escQ(e.name)+"' aria-selected='"+(VLT.sel===e.name)+"'>"+vaultMono(e.group)+"<span class='vt'><b>"+esc(e.short||e.label)+"</b><span>"+esc(vaultSub(e))+"</span></span>"+(look?"<span class='vdot' title='Needs a look'></span><span class='vsl'>Needs a look</span>":'')+"</button>";});return out;}
// One value field: hidden, shown (digits and symbols coloured, so 0 and O, 1 and l read apart), or a set of codes
function vaultField(e){var sh=VLT.shown[e.name],n=escQ(e.name),ok=VLT.ok[e.name]||'',lab=e.count>1?(e.kind==='Recovery codes'?'Codes':'Values')+' · '+e.left+' of '+e.count+' unused':e.kind;
var head="<div class='vfl'><span>"+esc(lab)+"</span>"+(sh?"<span>Hides when the vault locks</span>":'')+"</div>";
if(sh&&sh.length>1){var order=sh.map(function(x,i){return {x:x,i:i};}).sort(function(a,b){return (a.x.used?1:0)-(b.x.used?1:0)||a.i-b.i;});
return "<div class='vfield'><div class='vfl vfl2'><span>"+esc(lab)+" · hides when the vault locks</span><span class='vval' style='padding:0;min-height:0'><button type='button' class='ghost' data-va='hide' data-n='"+n+"'>"+VIC.eye+"Hide</button></span></div><div class='vcodes'>"+order.map(function(o){return "<div class='vcode"+(o.x.used?" used":"")+"'><span>"+vaultFmt(o.x.v)+"</span>"+(o.x.used?"<em>used</em>":"<button type='button' class='ghost' data-va='copyone' data-n='"+n+"' data-i='"+o.i+"' aria-label='Copy code "+(o.i+1)+"'>"+(ok==='c'+o.i?VIC.check+'Copied':VIC.copy+'Copy')+"</button>")+"</div>";}).join('')+"</div><div class='vok' role='status'>"+(ok?'Copied. It leaves the clipboard in '+Math.round(VCLIP_MS/1000)+' seconds.':'')+"</div></div>";}
var val=sh?"<code>"+vaultFmt(sh[0].v)+"</code>":"<code class='vhid' aria-label='Hidden'>&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</code>";
return "<div class='vfield'>"+head+"<div class='vval'>"+val+"<button type='button' class='ghost' data-va='"+(sh?'hide':'show')+"' data-n='"+n+"'>"+VIC.eye+(sh?'Hide':'Show')+"</button><button type='button' class='ghost' data-va='copy' data-n='"+n+"'>"+(ok==='c'?VIC.check+'Copied':VIC.copy+'Copy')+"</button></div><div class='vok' role='status'>"+(ok?'Copied. It leaves the clipboard in '+Math.round(VCLIP_MS/1000)+' seconds.':'')+"</div></div>";}
function vaultIssue(e,x){var n=escQ(e.name),b='';
if(x.kind==='vague')b="<button type='button' class='ghost vbtn' data-va='rename' data-n='"+n+"'>Rename</button>";
else if(x.kind==='same')b=(vaultFind(x.other)?"<button type='button' class='ghost vbtn' data-va='pick' data-n='"+escQ(x.other)+"'>Open the other</button>":'')+"<button type='button' class='ghost vbtn vdel' data-va='del' data-n='"+n+"'>Delete this one</button>";
else if(x.kind==='file'&&!VLT.shown[e.name])b="<button type='button' class='ghost vbtn' data-va='show' data-n='"+n+"'>Show it</button><button type='button' class='ghost vbtn vdel' data-va='del' data-n='"+n+"'>Delete</button>";
else if(x.kind==='file'||x.kind==='spent')b="<button type='button' class='ghost vbtn vdel' data-va='del' data-n='"+n+"'>Delete</button>";
return "<div class='vissue'><p><span class='vdot' aria-hidden='true'></span><span>"+esc(x.text)+"</span></p><div class='vib'>"+b+"</div></div>";}
function vaultLast(name){var l=VLT.log.filter(function(x){return x.name===name;})[0];if(!l)return 'Not yet, on this computer';return ({copy:'Copied',reveal:'Shown',add:'Added',rename:'Renamed'}[l.act]||'Changed')+' '+agoTxt(l.at);}
function vaultDetailHtml(e){var n=escQ(e.name),back=VLT.one?"<button type='button' class='vback' data-va='back'>"+VIC.back+"All items</button>":'';
var head;
if(VLT.mode==='rename'){var lab=e.account?e.label.replace(e.account,'').replace(/[(][ ]*[)]/,'').trim():e.label;
head="<div class='vdh'>"+vaultMono(e.group)+"<div class='vtt'><h2>Rename</h2><p>Agents will ask for it by its new name.</p></div></div><div class='vform' style='margin-top:16px'><label>What it's for<input id='vaultrn' value='"+escQ(lab)+"' autocomplete='off' spellcheck='false' maxlength='80'></label><label>Account or email (optional)<input id='vaultra' value='"+escQ(e.account||'')+"' autocomplete='off' spellcheck='false' maxlength='80'></label><div class='verr' id='vaultrerr' role='alert'></div><div class='vsb'><button type='button' class='ghost' data-va='cancel'>Cancel</button><button type='button' class='act' data-va='renamesave' data-n='"+n+"'>Save</button></div></div>";}
else head="<div class='vdh'>"+vaultMono(e.group)+"<div class='vtt'><h2>"+esc(e.label)+"</h2><p>"+esc([e.group==='Other'?'':e.group,e.kind].filter(Boolean).join(' · '))+"</p></div><div class='vdact'><button type='button' class='ghost' data-va='rename' data-n='"+n+"'>Rename</button><button type='button' class='ghost vdel' data-va='del' data-n='"+n+"'>Delete</button></div></div>";
var conf=VLT.mode==='delete'?"<div class='vconfirm' role='alert'><p><b>Delete “"+esc(e.label)+"”?</b> Agents that use it will have to ask you for it again. You can undo this for a few seconds.</p><div class='vsb' style='justify-content:flex-start'><button type='button' class='vdanger' data-va='delyes' data-n='"+n+"'>Delete</button><button type='button' class='ghost' data-va='cancel'>Keep it</button></div></div>":'';
var iss=VLT.mode?'':(e.issues||[]).map(function(x){return vaultIssue(e,x);}).join('');
var meta="<dl class='vmeta'>"+(e.account?"<dt>Account</dt><dd>"+esc(e.account)+"</dd>":'')+"<dt>Saved</dt><dd>"+esc(vaultDate(e.saved)||'Unknown')+"</dd><dt>Last shown or copied</dt><dd>"+esc(vaultLast(e.name))+"</dd><dt>Agents ask for</dt><dd><code>"+esc(e.name)+"</code><button type='button' class='vtxt' data-va='copyname' data-n='"+n+"'>Copy name</button></dd></dl>";
return back+head+conf+iss+(VLT.mode==='rename'?'':vaultField(e)+meta);}
function vaultEmptyDetail(){return "<div class='vempty'><b>Pick one to see it</b>Its value stays hidden until you unlock the vault.</div>";}
function vaultDraw(){if(current!=='vault')return;var pv=$('panel-vault'),box=$('vaultlist'),det=$('vaultdetail'),ch=$('vaultlock'),fl=$('vaultfilters');if(!box||!det)return;
if(ch){ch.innerHTML=vaultChip();ch.classList.toggle('open',vaultOpen());}
var bar=pv&&pv.querySelector('.vbar'),lg=$('vaultlogbox');
if(VLT.state!=='ok'){if(fl)fl.innerHTML='';if(lg)lg.style.display='none';pv.classList.remove('vone');
if(VLT.state==='load'){box.innerHTML="<div class='vskel'></div><div class='vskel'></div><div class='vskel'></div><div class='vskel'></div>";det.innerHTML="<div class='vskel' style='height:180px'></div>";if(bar)bar.style.display='';}
else{if(bar)bar.style.display='none';box.innerHTML='';det.style.display='';det.innerHTML="<div class='vempty' role='alert'><b>Couldn't open the vault</b>"+(VLT.why?esc(VLT.why):'Symbiot may have stopped. Nothing in the vault has changed.')+"<div class='vsb'><button type='button' class='ghost' data-va='retry'>Try again</button></div></div>";}return;}
if(bar)bar.style.display='';
if(!VLT.list.length){if(fl)fl.innerHTML='';if(lg)lg.style.display='none';pv.classList.remove('vone');box.innerHTML='';det.innerHTML="<div class='vempty'><b>Nothing saved yet</b>Passwords, keys and codes you paste into a chat, or that an agent saves for you, are kept here. You can add one yourself too.<div class='vsb'><button type='button' class='act' data-va='add'>Add one</button></div></div>";return;}
if(fl)fl.innerHTML=vaultFilters();if(lg)lg.style.display='';
var list=vaultVisible(),phone=window.innerWidth<=760;
if(!list.length){box.innerHTML="<div class='vempty'><b>Nothing matches</b>"+(VLT.q?'Try part of a name, a service or an email address.':'Nothing of this kind is saved.')+"<div class='vsb'><button type='button' class='ghost' data-va='clear'>Show everything</button></div></div>";}
else box.innerHTML=vaultListHtml(list);
if(!phone&&!vaultFind(VLT.sel)&&list.length)VLT.sel=list[0].name;
var e=vaultFind(VLT.sel);if(phone&&!e)VLT.one=false;
pv.classList.toggle('vone',!!(phone&&VLT.one&&e));
det.innerHTML=e?vaultDetailHtml(e):vaultEmptyDetail();
var rs=box.querySelector("[aria-selected='true']");if(rs)rs.tabIndex=0;
var lb=$('vaultlog');if(lb)lb.innerHTML=VLT.log.length?VLT.log.slice(0,12).map(function(x){return "<div class='vlr'><b>"+esc(x.label||x.name)+"</b><span>"+esc(({copy:'copied',reveal:'shown',add:'added',rename:'renamed','delete':'deleted'}[x.act]||x.act)+' '+agoTxt(x.at))+"</span></div>";}).join(''):"<div class='vlr'>Nothing shown, copied or changed yet.</div>";
if(VLT.mode==='rename'){var ri=$('vaultrn');if(ri&&document.activeElement!==ri&&document.activeElement!==$('vaultra')){ri.focus();ri.select();}}}
// ---- the unlock box, and adding one: over the page, where you are ------------------------
function vaultSheet(kind,o){o=o||{};var s=$('vaultsheet');if(!s)return;VLT.sheet=kind;var h='';
if(kind==='unlock'&&!VLT.pin)h="<div class='vsheet'><div class='vlockic'>"+VIC.lock+"</div><h3 id='vaultsheett'>Create your vault PIN</h3><p>You'll type it to show, copy or change what's saved here. At least 6 characters. Symbiot keeps only a scrambled form of it, which can't be turned back into your PIN.</p><div class='vform'><label>New PIN<input id='vaultpin' type='password' autocomplete='new-password'></label><label>The same PIN again<input id='vaultpin2' type='password' autocomplete='new-password'></label><div class='verr' id='vaulterr' role='alert'></div><div class='vsb'><button type='button' class='ghost' data-va='close'>Cancel</button><button type='button' class='act' data-va='unlock'>Create PIN</button></div></div></div>";
else if(kind==='unlock')h="<div class='vsheet'><div class='vlockic'>"+VIC.lock+"</div><h3 id='vaultsheett'>Unlock the vault</h3><p>"+esc(VLT.then&&VLT.then.why?VLT.then.why+'. ':'')+"It stays unlocked while you use it and locks 5 minutes after.</p><div class='vform'>"+(VLT.wait?"<div class='verr' role='alert'>Too many wrong tries. You can try again in <b id='vaultwait'>"+vaultLeft(VLT.waitTo-Date.now())+"</b>.</div><div class='vsb'><button type='button' class='ghost' data-va='close'>Close</button></div>":"<label>Vault PIN<input id='vaultpin' type='password' autocomplete='current-password'></label><div class='verr' id='vaulterr' role='alert'>"+esc(o.err||'')+"</div><div class='vsb'><button type='button' class='ghost' data-va='close'>Cancel</button><button type='button' class='act' data-va='unlock'>Unlock</button></div>")+"</div><p class='vfine'>Forgot it? Run <code>symbiot secret pin-reset</code> in a terminal, then set a new one. What's saved stays as it is.</p></div>";
else if(kind==='add')h="<div class='vsheet'><h3 id='vaultsheett'>Add to the vault</h3><p>Your agents can use it by its name; nobody sees the value without your PIN.</p><div class='vform'><label>What it's for<input id='vaddl' placeholder='e.g. Twilio auth token' autocomplete='off' spellcheck='false' maxlength='80'></label><label>Account or email (optional)<input id='vadda' autocomplete='off' spellcheck='false' maxlength='80'></label><label id='vaddvl'>Password, key or code<span class='vpw'><input id='vaddv' type='password' autocomplete='off' spellcheck='false'><button type='button' class='ghost' data-va='peekadd'>Show</button></span></label><label id='vaddcl' style='display:none'>Codes, one per line<textarea id='vaddc' spellcheck='false'></textarea></label><label class='vcheck'><input type='checkbox' id='vaddm' data-va='many'> It's a set of codes</label><div class='verr' id='vaulterr' role='alert'></div><div class='vsb'><button type='button' class='ghost' data-va='close'>Cancel</button><button type='button' class='act' data-va='addsave'>Save</button></div></div></div>";
s.innerHTML=h;s.classList.remove('hidden');var f=s.querySelector('input:not([type=checkbox]),button.act,button.ghost');if(f&&f.focus)f.focus();}
function vaultClose(){var s=$('vaultsheet');if(!s)return;var was=VLT.sheet;s.classList.add('hidden');s.innerHTML='';VLT.sheet='';if(was&&!vaultOpen())VLT.then=null;var r=document.querySelector("#vaultlist [aria-selected='true']");if(was&&r&&r.focus)r.focus();}
// Do it now if it's unlocked, else ask for the PIN first and then do it
function vaultNeed(a){if(vaultOpen()){vaultRun(a);return;}VLT.then=a;vaultSheet('unlock');}
function vaultRun(a){if(!a)return;if(a.act==='add'){vaultSheet('add');return;}if(a.act==='rename'){VLT.sel=a.name;VLT.mode='rename';vaultDraw();return;}if(a.act==='del'){VLT.sel=a.name;VLT.mode='delete';vaultDraw();return;}vaultGet(a.name,a.act,a.i);}
function vaultUnlock(){if(VLT.busy)return;var p1=$('vaultpin'),p2=$('vaultpin2'),er=$('vaulterr'),pin=p1?p1.value:'';var say=function(t){if(er)er.textContent=t;};
if(!pin){say('Type your vault PIN first.');if(p1)p1.focus();return;}
if(!VLT.pin&&pin.length<6){say('Make it at least 6 characters.');p1.focus();return;}
if(!VLT.pin&&p2&&p2.value!==pin){say("The two PINs don't match.");p2.focus();return;}
VLT.busy=true;say('');var b=document.querySelector("#vaultsheet [data-va='unlock']");if(b){b.disabled=true;b.textContent=VLT.pin?'Unlocking…':'Creating…';}
api(VLT.pin?'/api/vault/unlock':'/api/vault/pin',{pin:pin}).then(function(r){VLT.busy=false;
if(!r||!r.ok){if(r&&r.wait){VLT.wait=r.wait;VLT.waitTo=Date.now()+r.wait;vaultTimer();}vaultSheet('unlock',{err:(r&&r.error)||"Couldn't unlock it."});return;}
var was=!VLT.pin;VLT.pin=true;VLT.wait=0;VLT.token=r.token;VLT.until=r.until||Date.now()+(r.unlockMs||300000);vaultTimer();var then=VLT.then;VLT.then=null;vaultClose();if(was)vaultSay('Your vault PIN is set, and the vault is unlocked.','');vaultDraw();vaultRun(then);}).catch(function(){VLT.busy=false;vaultSheet('unlock',{err:"Couldn't reach Symbiot to unlock it."});});}
// Show or Copy (i: one code of a set)
function vaultGet(name,act,i){var e=vaultFind(name);if(!vaultOpen()){vaultDrop();vaultNeed({act:act,name:name,i:i,why:(act==='copy'||act==='copyone'?'To copy':'To show')+' “'+(e?e.label:name)+'”'});return;}
api('/api/vault/value',{name:name,token:VLT.token,act:act==='reveal'||act==='show'?'reveal':'copy'}).then(function(r){if(r&&r.locked){vaultDrop();vaultNeed({act:act,name:name,i:i,why:'To '+(act==='show'?'show':'copy')+' “'+(e?e.label:name)+'”'});vaultDraw();return;}
if(!r||!r.ok){vaultSay((r&&r.error)||"Couldn't read it.",'err');return;}vaultHeld(r);
VLT.log.unshift({at:Date.now(),name:name,label:e&&e.label,act:act==='show'?'reveal':'copy'});
if(act==='show'){VLT.shown[name]=r.values;vaultDraw();return;}
var v=act==='copyone'?r.values[+i]:(r.values.filter(function(x){return !x.used;})[0]||r.values[0]);if(v)vaultCopied(name,v.v,act==='copyone'?'c'+i:'c');}).catch(function(){vaultSay("Couldn't reach Symbiot.",'err');});}
function vaultCopied(name,v,key){vaultClip(v).then(function(ok){if(!ok){vaultSay("This window can't use the clipboard. Press Show and select it instead.",'err');return;}VLT.ok[name]=key;vaultDraw();setTimeout(function(){if(VLT.ok[name]===key){delete VLT.ok[name];vaultDraw();}},2500);});}
function vaultRenameSave(name){var l=$('vaultrn'),a=$('vaultra'),er=$('vaultrerr');if(!l||!l.value.trim()){if(er)er.textContent="Say what it's for: that's its name.";if(l)l.focus();return;}
if(!vaultOpen()){vaultNeed({act:'rename',name:name,why:'To rename it'});return;}
api('/api/vault/rename',{name:name,label:l.value,account:a?a.value:'',token:VLT.token}).then(function(r){if(r&&r.locked){vaultDrop();vaultNeed({act:'rename',name:name,why:'To rename it'});return;}
if(!r||!r.ok){if(er)er.textContent=(r&&r.error)||"Couldn't rename it.";return;}vaultHeld(r);
if(VLT.shown[name]&&r.name!==name){VLT.shown[r.name]=VLT.shown[name];delete VLT.shown[name];}VLT.mode='';VLT.sel=r.name;vaultSay('Renamed. Agents now ask for it by its new name.');loadVault();}).catch(function(){if(er)er.textContent="Couldn't reach Symbiot.";});}
function vaultDelete(name){var e=vaultFind(name);if(!e)return;if(!vaultOpen()){vaultNeed({act:'del',name:name,why:'To delete “'+e.label+'”'});return;}
vaultFlush();var vis=vaultVisible(),at=vis.indexOf(e),next=vis[at+1]||vis[at-1];VLT.del={name:name,token:VLT.token,t:setTimeout(vaultFlush,VDEL_MS)};VLT.mode='';delete VLT.shown[name];VLT.sel=next?next.name:'';VLT.one=false;vaultDraw();
vaultSay('Deleted “'+e.label+'”.','',function(){if(VLT.del&&VLT.del.name===name){clearTimeout(VLT.del.t);VLT.del=null;VLT.sel=name;vaultDraw();}});}
function vaultAddSave(){var l=$('vaddl'),a=$('vadda'),m=$('vaddm'),er=$('vaulterr'),vals;
var nl=String.fromCharCode(10);vals=m&&m.checked?String(($('vaddc')||{}).value||'').split(nl).map(function(x){return x.trim();}).filter(Boolean):[String(($('vaddv')||{}).value||'')].filter(function(x){return x.trim();});
if(!l||!l.value.trim()){if(er)er.textContent="Say what it's for: that's its name.";if(l)l.focus();return;}
if(!vals.length){if(er)er.textContent=m&&m.checked?'Paste the codes, one per line.':'Paste the password, key or code.';return;}
if(!vaultOpen()){vaultClose();vaultNeed({act:'add',why:'To add it'});return;}
api('/api/vault/add',{label:l.value,account:a?a.value:'',values:vals,token:VLT.token}).then(function(r){if(r&&r.locked){vaultClose();vaultDrop();vaultNeed({act:'add',why:'To add it'});return;}
if(!r||!r.ok){if(er)er.textContent=(r&&r.error)||"Couldn't save it.";return;}vaultHeld(r);vaultClose();VLT.sel=r.name;VLT.f='all';VLT.q='';var s=$('vaultsearch');if(s)s.value='';vaultSay('Saved. Agents can ask for it by its name.');loadVault();}).catch(function(){if(er)er.textContent="Couldn't reach Symbiot.";});}
// A copied value is wiped from the clipboard VCLIP_MS later. Where that can't happen yet (the
// window isn't focused, so the browser refuses), it's wiped as soon as the window has focus again.
function vaultClip(text,env){env=env||{};var clip=env.clip||(typeof navigator!=='undefined'&&navigator.clipboard)||null,later=env.later||setTimeout,stop=env.stop||clearTimeout;
if(!clip||!clip.writeText)return Promise.resolve(false);
return clip.writeText(String(text)).then(function(){if(VCLIP.t)stop(VCLIP.t);VCLIP.v=String(text);VCLIP.pend=false;VCLIP.t=later(function(){VCLIP.t=null;vaultUnclip(clip);},VCLIP_MS);return true;},function(){return false;});}
function vaultUnclip(clip){if(!VCLIP.v)return Promise.resolve(false);return clip.writeText('').then(function(){VCLIP.v='';VCLIP.pend=false;return true;},function(){VCLIP.pend=true;return false;});}
if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('focus',function(){if(VCLIP.pend&&typeof navigator!=='undefined'&&navigator.clipboard)vaultUnclip(navigator.clipboard);});
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('visibilitychange',function(){if(document.hidden&&VLT.token)vaultLockNow();});
// One listener for the page's buttons (data-va), and its keys: / to search, arrows through the list, Esc to close
function vaultAct(b){var a=b.getAttribute('data-va'),n=b.getAttribute('data-n');
if(a==='pick'){VLT.sel=n;VLT.mode='';VLT.one=true;vaultDraw();var r=document.querySelector("#vaultlist [aria-selected='true']");if(r&&window.innerWidth>760&&r.focus)r.focus();else{var d=$('vaultdetail');if(d&&d.scrollIntoView)d.scrollIntoView({block:'start'});}}
else if(a==='filter'){VLT.f=b.getAttribute('data-f');vaultDraw();}
else if(a==='clear'){VLT.f='all';VLT.q='';var s=$('vaultsearch');if(s)s.value='';vaultDraw();}
else if(a==='show'||a==='copy'||a==='copyone')vaultGet(n,a,b.getAttribute('data-i'));
else if(a==='hide'){delete VLT.shown[n];vaultDraw();}
else if(a==='copyname')vaultClip(n).then(function(ok){vaultSay(ok?'Copied its name.':"This window can't use the clipboard.",ok?'':'err');});
else if(a==='rename')vaultNeed({act:'rename',name:n,why:'To rename it'});
else if(a==='renamesave')vaultRenameSave(n);
else if(a==='del')vaultNeed({act:'del',name:n,why:'To delete it'});
else if(a==='delyes')vaultDelete(n);
else if(a==='cancel'){VLT.mode='';vaultDraw();}
else if(a==='back'){VLT.one=false;VLT.mode='';vaultDraw();var r2=document.querySelector("#vaultlist [aria-selected='true']");if(r2&&r2.focus)r2.focus();}
else if(a==='lock'){vaultLockNow();vaultSay('Locked. Values are hidden.');}
else if(a==='unlockchip'){VLT.then=null;vaultSheet('unlock');}
else if(a==='add')vaultNeed({act:'add',why:'To add to it'});
else if(a==='addsave')vaultAddSave();
else if(a==='peekadd'){var v=$('vaddv');if(v){v.type=v.type==='password'?'text':'password';b.textContent=v.type==='password'?'Show':'Hide';}}
else if(a==='many'){var on=b.checked;$('vaddvl').style.display=on?'none':'';$('vaddcl').style.display=on?'':'none';}
else if(a==='unlock')vaultUnlock();
else if(a==='close')vaultClose();
else if(a==='retry')loadVault();}
(function(){var pv=$('panel-vault');if(!pv||!pv.addEventListener)return;var vm=$('vaultmsg');if(vm&&document.body&&typeof document.body.appendChild==='function'&&vm.parentNode!==document.body)try{document.body.appendChild(vm);}catch(e){}
pv.addEventListener('click',function(ev){var b=ev.target&&ev.target.closest&&ev.target.closest('[data-va]');if(!b||!pv.contains(b))return;if(b.getAttribute('data-va')==='many')return vaultAct(b);vaultAct(b);});
var sh=$('vaultsheet');if(sh&&sh.addEventListener)sh.addEventListener('mousedown',function(ev){if(ev.target===sh)vaultClose();});
pv.addEventListener('keydown',function(ev){var t=ev.target;if(ev.key==='Escape'){var done=true;if(VLT.sheet)vaultClose();else if(VLT.mode){VLT.mode='';vaultDraw();}else if(VLT.one&&window.innerWidth<=760){VLT.one=false;vaultDraw();}else if(t&&t.id==='vaultsearch'&&t.value){t.value='';VLT.q='';vaultDraw();}else done=false;if(done){ev.preventDefault();ev.stopPropagation();}return;}
if(ev.key==='Enter'&&t&&t.id&&(t.id==='vaultpin'||t.id==='vaultpin2')){vaultUnlock();ev.preventDefault();return;}
if(ev.key==='Enter'&&t&&(t.id==='vaultrn'||t.id==='vaultra')){vaultRenameSave(VLT.sel);ev.preventDefault();return;}
if(ev.key==='Enter'&&t&&(t.id==='vaddl'||t.id==='vadda'||t.id==='vaddv')){vaultAddSave();ev.preventDefault();return;}
if(VLT.sheet&&ev.key==='Tab'){var f=[].slice.call(sh.querySelectorAll('input,button,textarea')).filter(function(x){return !x.disabled&&x.offsetParent;});if(f.length){var i=f.indexOf(document.activeElement);if(ev.shiftKey&&i<=0){f[f.length-1].focus();ev.preventDefault();}else if(!ev.shiftKey&&i===f.length-1){f[0].focus();ev.preventDefault();}}return;}
if((ev.key==='ArrowDown'||ev.key==='ArrowUp')&&t&&(t.classList&&t.classList.contains('vrow')||t.id==='vaultsearch')){var rows=[].slice.call(document.querySelectorAll('#vaultlist .vrow'));if(!rows.length)return;var k=rows.indexOf(t),j=t.id==='vaultsearch'?0:Math.max(0,Math.min(rows.length-1,k+(ev.key==='ArrowDown'?1:-1)));ev.preventDefault();VLT.sel=rows[j].getAttribute('data-n');VLT.mode='';vaultDraw();var nr=document.querySelector("#vaultlist [aria-selected='true']");if(nr&&nr.focus){nr.focus();if(nr.scrollIntoView)nr.scrollIntoView({block:'nearest'});}}});
if(document.addEventListener)document.addEventListener('keydown',function(ev){if(current!=='vault'||ev.key!=='/'||VLT.sheet)return;var t=ev.target,tag=t&&t.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||(t&&t.isContentEditable))return;var s=$('vaultsearch');if(s){ev.preventDefault();s.focus();}});
var s=$('vaultsearch');if(s&&s.addEventListener)s.addEventListener('input',function(){VLT.q=String(s.value||'').trim().toLowerCase();vaultDraw();});
if(window.addEventListener)window.addEventListener('resize',function(){if(current==='vault')vaultDraw();});
var o=$('openvault');if(o&&o.addEventListener)o.addEventListener('click',function(){if(typeof lqPool==='function'&&document.body.classList.contains('lq-liquid'))lqPool('vault');else setTab('vault');});})();
// Settings: how many are saved and what needs a look; the Vault is where they're looked up and kept tidy
// How well it asks you (triage.mjs triageStats): this week's questions, the misses, and the week before's
function triLoad(){api('/api/triage/stats').then(function(d){var box=document.getElementById('triagestats');if(!box||!d||!d.week)return;var w=d.week,b=d.before,pc=function(r){return r===null?'':Math.round(r*100)+'%';};
var line=w.shown?("<b>"+w.shown+"</b> question"+(w.shown===1?'':'s')+" came to you this week; <b>"+w.misses+"</b> shouldn't have"+(w.misses?" ("+[w.needless?w.needless+" you said weren't yours":"",w.withdrawn?w.withdrawn+" its agent answered itself":""].filter(Boolean).join(", ")+")":"")+(w.rate!==null?" · "+pc(w.rate):"")):"No questions came to you this week.";
var prev=b.shown?" Last week: "+b.misses+" of "+b.shown+(b.rate!==null?" ("+pc(b.rate)+")":"")+".":"";
box.innerHTML="<div style='font-size:13.5px;line-height:1.5;margin-top:8px'>"+line+"."+esc(prev)+"</div>"+(d.recent&&d.recent.length?"<div class='muted' style='font-size:12.5px;margin-top:8px'>Lately:</div>"+d.recent.map(function(x){return "<div style='font-size:12.5px;margin-top:4px'>“"+esc(String(x.q).slice(0,110))+"”"+(x.said?" <span class='muted'>— you said “"+esc(String(x.said).slice(0,80))+"”</span>":" <span class='muted'>— its agent answered it</span>")+"</div>";}).join(''):"");}).catch(function(){});}
function loadSecrets(){api('/api/vault',{}).then(function(d){var box=document.getElementById('secretslist');if(!box)return;var s=(d&&d.entries)||[],look=s.filter(function(e){return e.issues&&e.issues.length;}).length;
box.innerHTML="<div class='muted' style='font-size:13px'>"+(s.length?s.length+' saved'+(look?' · '+look+' need'+(look===1?'s':'')+' a look':''):'None saved yet.')+"</div>";});}
function addTrustedUI(){var i=document.getElementById('newtrusted');var v=(i.value||'').trim();if(!v)return;var n=document.getElementById('trustednote');
api('/api/screens/trusted/add',{site:v}).then(function(r){if(!r||r.error){n.innerHTML="<span class='err'>"+esc((r&&r.error)||'failed')+"</span>";return;}i.value='';loadTrusted();loadScreensUI();});}
// Email: opt-in, read from mail already on this computer (no API) — see mail.mjs.
function renderMail(d){if(!d)return;document.getElementById('mailon').checked=!!d.enabled;document.getElementById('mailaddrs').value=(d.addresses||[]).join(', ');
var rows=(d.detected||[]).map(function(s){return "<div class='task'><span class='t' style='font-family:ui-monospace,monospace;font-size:12px'>"+esc(s.path)+"</span><span class='rp'>"+esc(s.kind)+"</span></div>";});
(d.sources||[]).forEach(function(p,i){rows.push("<div class='task' data-i='"+i+"'><span class='t' style='font-family:ui-monospace,monospace;font-size:12px'>"+esc(p)+"</span><span class='rp'>added</span><button class='rm rmmail' title='remove'>&times;</button></div>");});
var box=document.getElementById('mailsources');
box.innerHTML=rows.length?rows.join(''):"<div class='muted' style='font-size:12px;margin-top:6px'>No mail app data found on this computer. Use a desktop mail app, or add an export (Google Takeout gives you an .mbox).</div>";
box.querySelectorAll('.rmmail').forEach(function(btn){btn.addEventListener('click',function(){var p=(d.sources||[])[+btn.closest('.task').getAttribute('data-i')];if(p)api('/api/mail/set',{remove:p}).then(renderMail);});});
if(d.error)document.getElementById('mailout').innerHTML="<div class='note err'>"+esc(d.error)+(d.site?" <button class='ghost' id='mailtrust'>Trust "+esc(d.site)+"</button>":"")+"</div>";
// a website typed into the mail box: one click trusts it instead (you clicking, in Settings)
var mt=document.getElementById('mailtrust');if(mt)mt.addEventListener('click',function(){api('/api/screens/trusted/add',{site:d.site}).then(function(r){var o=document.getElementById('mailout');
if(!r||r.error){o.innerHTML="<div class='note err'>"+esc((r&&r.error)||'failed')+"</div>";return;}document.getElementById('newmail').value='';o.innerHTML="<div class='note ok'>&#10003; "+esc(r.host)+" is now a trusted site (listed just above).</div>";loadTrusted();loadScreensUI();});});}
function loadMail(){api('/api/mail').then(renderMail);}
function setMailOn(){api('/api/mail/set',{enabled:document.getElementById('mailon').checked}).then(renderMail);}
function saveMailAddrs(){api('/api/mail/set',{addresses:document.getElementById('mailaddrs').value}).then(renderMail);}
function addMailUI(){var i=document.getElementById('newmail');var v=(i.value||'').trim();if(!v)return;document.getElementById('mailout').innerHTML='';
api('/api/mail/set',{add:v}).then(function(d){if(d&&!d.error)i.value='';renderMail(d);});}
function previewMail(){var o=document.getElementById('mailout');o.innerHTML="<div class='muted' style='margin-top:8px'>Reading your sent mail&hellip;</div>";
api('/api/mail/preview?days=7').then(function(r){var items=(r&&r.items)||[];
if(!items.length){o.innerHTML="<div class='muted' style='margin-top:8px'>Nothing sent in the last 7 days found in these sources.</div>";return;}
o.innerHTML="<div class='out2'><b>"+r.count+"</b> sent in the last 7 days &mdash; what a write-up would see:<br>"+items.map(function(x){return esc(x.date)+" &nbsp;"+esc(x.subject)+" &nbsp;&rarr; "+esc((x.to||[]).join(', ')||'?');}).join("<br>")+"</div>";});}
function setupLocalUI(){var o=document.getElementById('setupout');o.innerHTML="Setting up a local model&hellip;";
api('/api/setup-local',{}).then(function(r){if(r.error==='not-installed'){var i=r.install||{};o.innerHTML="Ollama isn't installed. Run this once, then click again:<div class='out2'>"+esc(i.cmd||'')+"</div><div class='muted' style='font-size:11px'>or download: "+esc(i.alt||'https://ollama.com/download')+"</div>";return;}
o.innerHTML="Pulling <b>"+esc(r.model)+"</b> &mdash; watch it on the <b>Workdesk</b>. Symbiot switches to it automatically when the download finishes.";setTimeout(function(){setTab('agents');},700);}).catch(function(e){o.innerHTML="<span class='err'>Setup failed: "+esc(String((e&&e.message)||e))+"</span>";});}
function selectNode(id){var n=nodeById(id);api('/api/node?id='+encodeURIComponent(id)).then(showDetail);
if(n&&n.type==='repo'&&n.meta&&n.meta.path){loadReview(n.label,n.meta.path);}else{hideReview();}}
function scanLine(s){return 'Mapping your work… '+s.phase+(s.total?' '+s.done+'/'+s.total:'')+(s.item?' · '+s.item:'')+' · '+Math.round((s.elapsed||0)/1000)+'s';}
// fresh (Rescan): a new scan; else the last Map at once, the server scanning again behind it when it's old (scan.mjs mapNow)
function loadMap(fresh){var p=document.getElementById("profile");p.textContent="Mapping your work...";hideDetail();hideReview();var done=false;
function poll(){if(done)return;api('/api/scan').then(function(s){if(done)return;if(s&&s.active&&s.phase)p.textContent=scanLine(s);setTimeout(poll,600);}).catch(function(){});}
setTimeout(poll,400);
api("/api/map"+(fresh===true?"?fresh=1":"")).then(function(g){done=true;mapLoaded=true;if(!g.nodes||!g.nodes.length){p.textContent="No git repositories found under your home folder.";return;}GRAPH=g;lmBuild(g);p.innerHTML=profileLine(g)+(g.stats&&g.stats.partial?" &middot; <span class='err'>partial &mdash; the scan hit its time limit</span>":"");var af=$('allowfiles');if(af)af.addEventListener('click',function(){SymbiotAndroid.storage();});var ut=$('usetermux');if(ut)ut.addEventListener('click',function(){SymbiotAndroid.openTermux();});});}
`;
