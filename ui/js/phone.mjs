// symbiot — your phone: pairing, its codes, the computers it finds.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// Your phone (phone.mjs). On the computer: switch it on and it shows a QR (and a code)
// to pair the app on your phone with; the phones paired, when each last asked and how
// (your Wi-Fi, or the relay away from home), and the relay's switch. On the phone:
// pair by scanning (the app opens the QR's link), or by the address and code typed in,
// with the computers it finds on this network listed; then Check now and Forget.
function loadPhoneLink(msg){api('/api/phone').then(function(d){renderPhoneLink(d,msg);});}
function phoneQr(d,where){var ad=(d.addresses||[]).map(function(a){return a+':'+d.port;});
return "<div class='pqr'><div class='qrimg' role='img' aria-label='QR code to pair your phone'>"+(d.qr||'')+"</div><div class='qrtxt'><b>Scan it with your phone&rsquo;s camera.</b> Symbiot&rsquo;s app on your phone opens and pairs with this computer."+
"<span class='muted'>No camera, or Symbiot in Termux? On the phone, in "+where+", type "+(ad.length?"the address <b>"+esc(ad[0])+"</b>"+(ad.length>1?" (or "+esc(ad.slice(1).join(', '))+")":"")+" and ":"this computer&rsquo;s address and ")+"the code <b class='code'>"+esc(d.code)+"</b>. It works for 10 minutes.</span></div></div>";}
function phoneSeen(p){return p.old?"<span class='err'>paired before the link was sealed: pair it again</span>":(p.seen?"asked "+agoTxt(p.seen)+(p.via==='relay'?" through the relay":p.via==='wifi'?" on your Wi-Fi":""):"hasn&rsquo;t asked yet");}
function renderPhoneLink(d,msg){if(!d||!d.role)return;var box=$('phonelink'),h='';if(!box)return;
if(d.role==='phone'){
if(d.paired&&!d.old){h+="<div class='task'><span class='t'>Paired with <b>"+esc(d.name)+"</b> <span class='muted' style='font-size:12px'>"+esc(d.url||'')+(d.last?" &middot; asked "+agoTxt(d.last)+(d.via==='relay'?" through the relay":""):"")+"</span>"+(d.error?"<br><span class='err' style='font-size:12px'>"+esc(d.error)+"</span>":"")+"</span><button class='ghost' id='pcheck' title='ask your computer now'>Check now</button><button class='rm' id='pforget' title='forget it: its copy here goes too'>&times;</button></div>";
h+="<div class='note muted'>Its tasks, what needs you and its agents&rsquo; questions are on Home, in <b>On "+esc(d.name)+"</b>: tick, add, answer and approve from there. While Symbiot runs on this phone it asks every 2 minutes"+(d.termux?"":" (and as soon as this phone&rsquo;s network changes)")+", and tells you, with a notification, what Watch found there and what newly needs you: an agent&rsquo;s question, work waiting for your Approve.</div>";}
else{if(d.old)h+="<div class='note err'>"+esc(d.error||'')+"</div>";
h+="<div class='note muted' style='margin-top:2px'>"+(window.SymbiotAndroid?"<b>Scan the code your computer shows:</b> in Symbiot on your computer, open Settings &rarr; <b>Your phone</b> and switch it on. Point this phone&rsquo;s camera at the QR, and tap its link. Or type its address and code here:":"In Symbiot on your computer, open Settings &rarr; <b>Your phone</b> and switch it on: it shows its address and a 6-digit code. Type both here.")+"</div>"+
"<div class='row'><input id='paddr' placeholder='your computer&rsquo;s address, e.g. 192.168.8.50:7392' style='flex:1'><input id='pcode' placeholder='code' inputmode='numeric' style='flex:0 0 90px'><button class='act' id='ppair'>Pair</button></div>"+
"<div class='row' style='margin-top:4px'><button class='ghost' id='pfind'>Look for it on this network</button></div><div id='pfound' class='pcfound'></div>";}
if(!d.notify)h+="<div class='note err'>Notifications from Termux need the Termux:API app: install it, then run <b>pkg install termux-api</b> in Termux.</div>";}
else{h+="<label class='check'><input type='checkbox' id='plinkon'"+(d.on?" checked":"")+"> Let the Symbiot app on my phone show my work here, and send back what I do on it</label>";
if(d.on&&d.error){h+="<div class='note err'>"+esc(d.error)+"</div>";if(d.holder)h+="<div class='row' style='margin-top:4px'>"+(d.holder.symbiot?"<button class='ghost' id='pfree'>Free it</button> ":"")+"<input id='pport' type='number' min='1024' max='65535' value='"+(d.port+1)+"' style='width:90px'> <button class='ghost' id='pusport'>Use a different port</button></div>";}
else if(d.on&&d.listening){h+=d.code&&d.qr?phoneQr(d,"Settings &rarr; <b>Your phone</b>"):"<div class='row' style='margin-top:4px'><button class='ghost' id='pnewcode'>Pair a phone</button></div>";
h+=(d.phones||[]).map(function(p){return "<div class='task' data-id='"+escQ(p.id)+"'><span class='t'>"+esc(p.name)+" <span class='muted' style='font-size:12px'>paired "+agoTxt(p.added)+" &middot; "+phoneSeen(p)+"</span></span><button class='rm punpair' title='unpair it: it gets nothing more, and what it queued (an approve too) is refused'>&times;</button></div>";}).join('');
var rl=d.relay||{};if((d.phones||[]).length)h+="<label class='check'><input type='checkbox' id='prelay'"+(rl.on!==false?" checked":"")+"> Away from home too, through symbiot.co.za</label><div class='note muted' style='margin-top:0'>"+(rl.on===false?"Off: your phone reaches this computer only on your Wi-Fi.":rl.connected?"Connected. Away from home, what your phone and this computer send each other passes through symbiot.co.za, sealed: it can&rsquo;t read it, and keeps none of it. At home nothing goes through it.":"Not connected yet"+(rl.error?": "+esc(rl.error):"")+". Away from home, what they send passes through symbiot.co.za, sealed: it can&rsquo;t read it.")+"</div>";}
h+="<div class='note muted'>"+(d.on?"Symbiot listens on port "+d.port+" of your network for this alone: pairing, then sealed requests from a phone that paired. Everything between them is encrypted with a key the two agree when they pair, and a phone can only add and tick tasks, answer your agents and approve. The rest of Symbiot stays on this computer. Pairing fails? A firewall here may need to allow port "+d.port+".":"Your tasks, what needs you, your agents&rsquo; questions and what Watch finds, on your phone through the Symbiot app there: tick, add, answer and approve from it, sealed between the two.")+"</div>";}
if(msg)h+="<div class='note "+(msg.ok?"ok":"err")+"'>"+esc(msg.text)+"</div>";
box.innerHTML=h;
var on=$('plinkon');if(on)on.addEventListener('change',function(){on.disabled=true;api('/api/phone/link',{on:on.checked}).then(function(x){renderPhoneLink(x);});});
var rlb=$('prelay');if(rlb)rlb.addEventListener('change',function(){rlb.disabled=true;api('/api/phone/relay',{on:rlb.checked}).then(function(x){renderPhoneLink(x);});});
var pf=$('pfree');if(pf)pf.addEventListener('click',function(){pf.disabled=true;api('/api/phone/free',{}).then(function(x){renderPhoneLink(x);});});
var pu=$('pusport');if(pu)pu.addEventListener('click',function(){pu.disabled=true;api('/api/phone/port',{port:$('pport').value}).then(function(x){renderPhoneLink(x);});});
var nc=$('pnewcode');if(nc)nc.addEventListener('click',function(){api('/api/phone/code',{}).then(function(x){renderPhoneLink(x);});});
box.querySelectorAll('.punpair').forEach(function(b){b.addEventListener('click',function(){if(typeof confirm==='function'&&!confirm('Unpair this phone? It gets nothing more from here, and what it queued (an approve too) is refused.'))return;api('/api/phone/unpair',{id:b.closest('.task').getAttribute('data-id')}).then(function(x){renderPhoneLink(x);});});});
var pp=$('ppair');if(pp)pp.addEventListener('click',function(){var a=$('paddr').value,cd=$('pcode').value;pp.disabled=true;pp.textContent='Pairing...';api('/api/phone/pair',{address:a,code:cd}).then(function(x){renderPhoneLink(x,x&&x.error?{text:x.error}:{ok:true,text:'Paired. What needs you on '+x.name+' is on Home now.'});if(x&&x.error&&$('paddr')){$('paddr').value=a;$('pcode').value=cd;}if(x&&!x.error){LQ.fresh=true;lqLoad(true);}});});
var pf0=$('pfind');if(pf0)pf0.addEventListener('click',function(){phoneFind(pf0,$('pfound'),function(u){var i=$('paddr');if(i)i.value=u.replace(/^http:[/][/]/,'');var c0=$('pcode');if(c0&&c0.focus)c0.focus();});});
var pc=$('pcheck');if(pc)pc.addEventListener('click',function(){pc.disabled=true;api('/api/phone/check',{}).then(function(x){renderPhoneLink(x,x&&!x.error?{ok:true,text:x.shown?'Showed '+x.shown+' notification(s).':'Asked: nothing new.'}:null);});});
var pf=$('pforget');if(pf)pf.addEventListener('click',function(){if(typeof confirm==='function'&&!confirm('Forget your computer? Its notifications stop, and its copy here goes, with any change not sent yet.'))return;api('/api/phone/forget',{}).then(function(x){renderPhoneLink(x);LQ.fresh=true;lqLoad(true);});});}
// On your computer, on your phone (phone.mjs computerView): the copy of your computer's
// work this phone keeps, so it shows with the computer off. First a line saying how
// fresh it is (out of reach: since when), then what needs you there (its agents'
// questions, its work waiting for your Approve), its tasks (tick, or add one), and
// what Watch found. What you do here shows at once, marked "waiting to send" until the
// computer has it; what it couldn't apply is said here, in plain words.
var PCV=null;
function loadComputer(){api('/api/phone').then(function(d){PCV=d;renderComputer();}).catch(function(){});}
function pcDo(op,args,then){api('/api/phone/do',{op:op,args:args}).then(function(d){if(d&&d.refused){$('pcmsg').innerHTML="<div class='note err'>"+esc(d.refused)+"</div>";}else $('pcmsg').innerHTML='';if(d&&d.role){PCV=d;renderComputer();}if(then)then(d);LQ.fresh=true;});}
function pcTime(t){var d=new Date(t),n=new Date();return d.toDateString()===n.toDateString()?d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):d.toLocaleString([],{weekday:'short',hour:'2-digit',minute:'2-digit'});}
// A code card's answers on Android: one that only restates the switch ("👤 You (only you: the SMS code): let your phone pass it on",
// what the brief has agents write) answered the card when pressed for the switch, so the card left and no code could come
// (21 Oct 2026). With the switch on the card, that answer isn't shown: the switch is the card's main button instead.
function pcSwitchOpt(o){o=String(o||'');return /^\\s*\\u{1F464}[^)]*\\b(?:codes?|sms|otp|pin)\\b/iu.test(o)||/\\bphone (?:to )?pass(?:es)? (?:it|the code|codes?) on\\b/i.test(o);}
function pcOpts(q,sw){return (q.options||[]).map(function(o,j){return {j:j,o:o,label:(q.labels&&q.labels[j])||o};}).filter(function(x){return !(sw&&pcSwitchOpt(x.o));});}
function renderComputer(){var d=PCV,el=$('pcbody'),ln=$('pcline');if(!el||!ln)return;
if(d&&d.name&&LQNAMES.computer!=='On '+d.name){LQNAMES.computer='On '+d.name;lqTitle();}
if(!d||d.role!=='phone'||!d.paired||d.old){ln.innerHTML=d&&d.old?"<b>"+esc(d.error||'')+"</b>":'';el.innerHTML="<div class='note muted'>"+(d&&d.role==='computer'?"This is your computer: your phone shows this, there.":"Not paired with a computer yet.")+" <button class='ghost' id='pcsettings'>Your phone, in Settings</button></div>";var g=$('pcsettings');if(g)g.addEventListener('click',function(){lqFocus({kind:'setup',focus:'phone'});lqPool('settings');});return;}
var c=d.copy,wait=d.queued?" &middot; "+d.queued+" change"+(d.queued>1?"s":"")+" waiting to send":"";
ln.innerHTML=d.away?"<b>"+esc(d.name)+" is out of reach.</b> Showing what it sent "+(d.heard?"at "+esc(pcTime(d.heard)):"last")+"."+wait:(c?"From "+esc(d.name)+", "+(d.heard?agoTxt(d.heard):"just now")+(d.via==='relay'?" through the relay":"")+"."+wait:"Asking "+esc(d.name)+" for its work&hellip;");
if(!c){el.innerHTML="<div class='row'><button class='ghost' id='pcnow'>Ask it now</button></div>";var n0=$('pcnow');if(n0)n0.addEventListener('click',function(){n0.disabled=true;api('/api/phone/check',{}).then(loadComputer);});return;}
var h='',W="<span class='pcwait'> waiting to send</span>";
(c.notes||[]).forEach(function(n){h+="<div class='task' data-note='"+escQ(n.id)+"'><span class='t err'>"+esc(n.error)+(n.what?" <span class='muted'>("+esc(n.what)+")</span>":"")+"</span><button class='ghost pcnote'>OK</button></div>";});
var asks=c.asks||[],aps=c.approves||[],needs=c.needs||[],prs=c.proofs||[],codesOn=c.codesOn||[],AND=window.SymbiotAndroid&&SymbiotAndroid.codes?SymbiotAndroid:null;
if(asks.length||aps.length||needs.length||prs.length){h+="<div class='mkneeds lit'><div class='pshead'><span>Needs you &middot; "+(asks.length+aps.length+needs.length+prs.length)+"</span><small>on "+esc(d.name)+"</small></div>";
prs.forEach(function(p,i){h+="<div class='pcq pcproof' data-proof='"+i+"'><div class='qn'>"+esc(p.name)+" &middot; check it before it goes out</div><div class='qq'>"+esc(p.title)+"</div>"+(p.to||p.kind!=='text'?"<div class='qfor pcto'>"+esc({sms:'SMS',whatsapp:'WhatsApp',pdf:'PDF',email:'Email',text:'Message'}[p.kind]||'Message')+(p.to?" to "+esc(p.to):"")+"</div>":"")+
(p.body?"<div class='pcbubble'>"+esc(p.body)+"</div>":"")+((p.buttons||[]).length?"<div class='pcchips'>"+p.buttons.map(function(b){return "<span>"+esc(b)+"</span>";}).join('')+"</div>":"")+(p.file?"<div class='muted' style='font-size:12px'>"+esc(p.file)+"</div>":"")+
(p.waiting?"<div class='note' style='margin:0'>You said: "+esc(p.answered||'')+W+"</div>":"<div class='opts'><button class='act pcsend'>Send</button><button class='ghost pcchange'>Change</button></div><form class='pcown' hidden><input placeholder='What should change?' maxlength='2000'><button class='ghost' type='submit'>Send back</button></form>")+"</div>";});
asks.forEach(function(a,i){var q=(a.questions||[])[0]||{},sw=!!(q.code&&AND);h+="<div class='pcq' data-ask='"+i+"'><div class='qn'>"+(a.project!==undefined&&a.project!==a.name?projChip({project:a.project}):"")+esc(a.name)+" asks"+((a.questions||[]).length>1?" &middot; 1 of "+a.questions.length:"")+"</div>"+(q.task?"<div class='qfor' title='"+escQ(q.task)+"'>for: "+esc(q.task)+"</div>":"")+"<div class='qq'>"+esc(q.shown||q.q||'')+"</div>"+
(a.waiting?"<div class='note' style='margin:0'>You answered: "+esc((a.answered||[])[0]||'')+W+"</div>":(sw?"<div class='pccode'>"+(codesOn.indexOf(q.code.key)>=0?"This phone passes on the code "+esc(q.code.site)+" texts you, and only that. <button class='ghost pccodes' data-on='0'>Stop</button>":"<button class='act pccodes' data-on='1'>Let this phone pass on "+esc(q.code.site)+"&rsquo;s code</button><span class='muted'>the code only, once, then it&rsquo;s gone</span>")+"</div>":"")+"<div class='opts'>"+pcOpts(q,sw).map(function(x,k){return "<button class='"+(k||sw?'ghost':'act')+" pcopt' data-j='"+x.j+"'>"+esc(x.label)+"</button>";}).join('')+"</div><form class='pcown'><input placeholder='Or say it in your own words' maxlength='2000'><button class='ghost' type='submit'>Send</button></form>")+"</div>";});
aps.forEach(function(a,i){h+="<div class='pcq' data-ap='"+i+"'><div class='qn'>"+esc(a.repo)+" &middot; waiting for your Approve</div><div class='qq'>"+(a.tasks.length?a.tasks.length+" task"+(a.tasks.length>1?"s":"")+" done":"Changes without a task")+" &middot; <span class='muted'>"+esc(a.stat||(a.files+" file"+(a.files===1?"":"s")+" changed"))+"</span></div>"+(a.tasks.length?"<ul>"+a.tasks.map(function(t){return "<li>"+esc(t.text)+"</li>";}).join('')+"</ul>":"")+
(a.waiting?"<div class='note' style='margin:0'>Approved here"+W+"</div>":"<div class='row' style='margin:0'><button class='act pcapprove'>Approve</button><span class='muted' style='font-size:12px'>exactly this: if the work changes before your computer gets it, it isn&rsquo;t approved</span></div>")+"</div>";});
needs.forEach(function(n){h+="<div class='task'><span class='t'>"+esc(n.title)+" <span class='muted' style='font-size:12px'>"+esc(n.sub)+" &middot; on your computer</span></span></div>";});
h+="</div>";}
if(LQ.phone)h+="<div class='phyouslot'></div>"; // on a phone's Home: what this phone needs, after what the computer does
(c.recent||[]).slice(-3).forEach(function(r){h+="<div class='note "+(r.status==='failed'?'err':'ok')+"'>"+(r.status==='approving'?"Approving "+esc(r.repo)+" (from "+esc(r.phone)+")&hellip;":r.status==='waiting'?"Approving "+esc(r.repo)+" (from "+esc(r.phone)+") as soon as "+esc(r.why||'it can')+".":r.status==='failed'?"Approving "+esc(r.repo)+" from "+esc(r.phone)+" failed: "+esc(r.error||''):"&#10003; "+esc(r.repo)+" approved from "+esc(r.phone)+(r.pr?" &middot; <a href='"+esc(okUrl(r.pr))+"' target='_blank' rel='noopener'>its PR</a>":""))+"</div>";});
var open=(c.tasks||[]).filter(function(t){return !t.done;}),done=(c.tasks||[]).filter(function(t){return t.done;}),repos=[];(c.tasks||[]).forEach(function(t){if(t.repo&&repos.indexOf(t.repo)<0)repos.push(t.repo);});
h+="<div class='pshead' style='margin-top:14px'><span>Tasks &middot; "+open.length+" open</span><small>on "+esc(d.name)+"</small></div>";
h+="<form class='pcadd'><input id='pctask' placeholder='Add a task' maxlength='4000' autocomplete='off'><select id='pcrepo' aria-label='Which project'><option value=''>No project</option>"+repos.sort().map(function(r){return "<option value='"+escQ(r)+"'>"+esc(r)+"</option>";}).join('')+"</select><button class='act' type='submit'>Add</button></form>";
h+=open.concat(done.slice(0,8)).map(function(t){return "<div class='task"+(t.done?" done":"")+"' data-id='"+escQ(t.id)+"'><input type='checkbox' class='pctick'"+(t.done?" checked":"")+(String(t.id).indexOf('q:')===0?" disabled":"")+" aria-label='done'><span class='t'>"+esc(t.text)+(t.repo?" <span class='rp'>"+esc(t.repo)+"</span>":"")+(t.review?" <span class='muted' style='font-size:11px'>done by its agent, waits for your Approve</span>":"")+(t.waiting?W:"")+"</span></div>";}).join('');
if((c.watch||[]).length)h+="<div class='pshead' style='margin-top:14px'><span>What Watch found</span><small>on "+esc(d.name)+", today</small></div>"+c.watch.map(function(w){return "<div class='task'><span class='t'><b>"+esc(w.name)+"</b> <span class='muted' style='font-size:12px'>"+esc(w.label)+"</span>"+(w.items||[]).map(function(i){return "<br><span style='font-size:13px'>"+esc(i.text)+"</span>";}).join('')+"</span></div>";}).join('');
var typed=$('pctask')?[$('pctask').value,$('pcrepo').value,document.activeElement&&document.activeElement.id]:null;
var py=$('phyou');if(py&&el.contains(py))el.parentNode.appendChild(py);
el.innerHTML=h;var pys=el.querySelector('.phyouslot');if(pys&&py)pys.parentNode.replaceChild(py,pys);if(typed){$('pctask').value=typed[0]||'';$('pcrepo').value=typed[1]||'';if(typed[2]==='pctask')$('pctask').focus();}
el.querySelectorAll('.pcnote').forEach(function(b){b.addEventListener('click',function(){api('/api/phone/note',{id:b.closest('.task').getAttribute('data-note')}).then(function(x){PCV=x;renderComputer();});});});
el.querySelectorAll('.pcq[data-ask]').forEach(function(box){var a=asks[+box.getAttribute('data-ask')],q=(a.questions||[])[0]||{};if(a.waiting)return;
var send=function(t){if(!t)return;pcDo('agent.answer',{path:a.path,answers:[{q:q.q,a:t}]});};
box.querySelectorAll('.pcopt').forEach(function(b){b.addEventListener('click',function(){send((q.options||[])[+b.getAttribute('data-j')]);});});
var f=box.querySelector('form');if(f)f.addEventListener('submit',function(ev){ev.preventDefault();send(f.querySelector('input').value.trim());});});
el.querySelectorAll('.pccodes').forEach(function(b){b.addEventListener('click',function(){var a=asks[+b.closest('.pcq').getAttribute('data-ask')],q=(a.questions||[])[0]||{},on=b.getAttribute('data-on')==='1';
if(on&&AND){var st={};try{st=JSON.parse(AND.codes())||{};}catch(e){}if(!st.allowed)AND.allowCodes();} // Android's own switch first: Notification access
b.disabled=true;api('/api/phone/codes',{key:q.code.key,on:on}).then(function(x){if(x&&x.role){PCV=x;renderComputer();}});});});
el.querySelectorAll('.pcq[data-proof]').forEach(function(box){var p=prs[+box.getAttribute('data-proof')];if(p.waiting)return;var f=box.querySelector('form');
box.querySelector('.pcsend').addEventListener('click',function(){pcDo('proof.answer',{path:p.path,id:p.id,send:true});});
box.querySelector('.pcchange').addEventListener('click',function(){f.hidden=false;f.querySelector('input').focus();});
f.addEventListener('submit',function(ev){ev.preventDefault();var t=f.querySelector('input').value.trim();if(t)pcDo('proof.answer',{path:p.path,id:p.id,change:t});});});
el.querySelectorAll('.pcq[data-ap]').forEach(function(box){var a=aps[+box.getAttribute('data-ap')],b=box.querySelector('.pcapprove');if(!b)return;b.addEventListener('click',function(){if(typeof confirm==='function'&&!confirm('Approve '+a.repo+'? It goes out as Approve on your computer does: committed, a PR opened, and a release if the version changed.'))return;b.disabled=true;pcDo('pending.approve',{repo:a.repo,sum:a.sum});});});
el.querySelectorAll('.pctick').forEach(function(cb){cb.addEventListener('change',function(){pcDo('task.setDone',{id:cb.closest('.task').getAttribute('data-id'),done:cb.checked});});});
var fm=el.querySelector('.pcadd');if(fm)fm.addEventListener('submit',function(ev){ev.preventDefault();var t=$('pctask');if(!t.value.trim()){t.focus();return;}pcDo('task.add',{text:t.value,repo:$('pcrepo').value},function(x){if(x&&!x.refused){var i=$('pctask');if(i)i.value='';}});});}
// A pairing link the Android app was opened with (the QR, scanned): pair with it here.
// In Setup's "Your computer" step it shows there; anywhere else, the computer's droplet opens.
window.symbiotPairLink=function(link){api('/api/phone/pair',{link:String(link||'')}).then(function(x){
if(ONB&&ONB.pending){var show=function(){if(x&&x.error){var m=$('onbpairmsg');if(m)m.textContent=x.error;}}; // Setup goes to "Your computer", where it shows paired, or why not
if((ONB.steps||[]).indexOf('computer')>=0&&ONB.step!=='computer')api('/api/onboarding/set',{step:'computer'}).then(function(){return onbLoad();}).then(show).catch(show);else{var r=onbLoad();if(r&&r.then)r.then(show);else show();}return;}
renderPhoneLink(x,x&&x.error?{text:x.error}:{ok:true,text:'Paired with '+x.name+'.'});if(x&&!x.error){LQ.fresh=true;lqLoad(true);lqPool('computer');}else lqPool('settings');});};
// The computers saying they're here on this network (phone.mjs findComputers): a tap fills the address in.
function phoneFind(btn,el,pick){if(!el)return;btn.disabled=true;btn.textContent='Looking...';api('/api/phone/find').then(function(r){btn.disabled=false;btn.textContent='Look again';var f=(r&&r.found)||[];
el.innerHTML=f.length?f.map(function(x,i){return "<button class='ghost' data-i='"+i+"' style='text-align:left'>"+esc(x.name)+" <span class='muted'>"+esc(x.url.replace(/^http:[/][/]/,''))+"</span></button>";}).join(''):"<div class='note muted' style='margin:0'>None found. Is Symbiot running on your computer with Your phone switched on, and is this phone on the same Wi-Fi?</div>";
el.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){pick(f[+b.getAttribute('data-i')].url);});});}).catch(function(){btn.disabled=false;btn.textContent='Look again';});}
// Link your work (links.mjs): one button per standard site. A click opens it in
// Symbiot's browser to sign in, trusts it and watches it. Its dot: grey not
// linked, amber waiting for you to sign in (or signed out), green linked. Shown
// in Settings, and on the Dashboard until something is linked.
var LINKS=null;
var LINKWORD={ok:'linked',signin:'sign in, then close it',signedout:'signed out',error:'needs a fix'};
function escQ(t){return esc(t);} // esc escapes quotes itself now; kept for its callers
// Connections: a column per kind of site; each site a bead in the look: solid when
// linked, amber when it wants you to sign in, hollow when it isn't linked. Link,
// check (↻) and Unlink show on hover (always on touch).
`;
