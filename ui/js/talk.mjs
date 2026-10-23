// symbiot — talking to Symbiot: pasted screenshots, the talk box, the mic and voice.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// Screenshots in the talk: paste one (Ctrl+V) or drop it on the bar; it shows as a
// thumbnail above it, goes with what you say, and the model sees it.
LQ.atts=[];
function lqAttsShow(){var el=$('lqatts');if(!el)return;el.innerHTML=LQ.atts.map(function(a,i){return "<span class='lqatt'><img src='"+a.data+"' alt='screenshot "+(i+1)+"'><button type='button' data-i='"+i+"' aria-label='remove screenshot "+(i+1)+"'>&times;</button></span>";}).join('');
el.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){LQ.atts.splice(+b.getAttribute('data-i'),1);lqAttsShow();});});}
function lqAttach(file){if(!file||['image/png','image/jpeg','image/webp','image/gif'].indexOf(file.type)<0||file.size>8*1024*1024||LQ.atts.length>=4)return;var r=new FileReader();r.onload=function(){LQ.atts.push({data:String(r.result)});lqAttsShow();};r.readAsDataURL(file);}
// The talk box wraps and grows with what's typed, to five lines, then scrolls.
function lqGrowAsk(){var i=$('lqask');if(!i||!i.style)return;i.style.height='auto';var h=Math.min(126,Math.max(44,i.scrollHeight||44));i.style.height=h+'px';if(i.classList)i.classList.toggle('full',(i.scrollHeight||0)>126);var f=$('lqform'),b=document.body;if(f&&f.offsetHeight&&b&&b.style&&b.style.setProperty)b.style.setProperty('--lqfh',f.offsetHeight+'px');}

// ---- Talking to Symbiot ------------------------------------------------------------
// The mic on the talk bar: click, speak, and what you say shows in the bar as you say
// it; a pause sends it, as Enter would. Speech becomes text in the browser itself
// (Chrome and Edge, no key); where it can't, there's no mic. When you spoke, the
// answer is read out too (typed, it stays quiet), and talking again cuts it off.
var VOICE={rec:null,on:false,spoke:false,final:'',base:'',err:'',ph:'',convo:false,quiet:0,timer:0};
function voiceOk(){return !!(window.SpeechRecognition||window.webkitSpeechRecognition);}
function voiceMic(on){var m=$('lqmic');if(!m)return;m.classList.toggle('on',on);m.setAttribute('aria-pressed',on?'true':'false');m.classList.toggle('conv',!!VOICE.convo&&!on);m.setAttribute('aria-label',on?'Stop listening':VOICE.convo?'End conversation':'Talk to Symbiot');var a=$('lqask');if(a){if(on){VOICE.ph=a.getAttribute('placeholder')||'';a.setAttribute('placeholder',VOICE.convo?'Listening… speak, then pause to send. Say "end conversation" to stop.':'Listening… speak, then pause to send');}else if(VOICE.ph)a.setAttribute('placeholder',VOICE.ph);}}
function voiceSay(t){LQ.talkMin=false;lqTalkMode(true);LQ.talk.push({me:false,text:t});LQ.talk=LQ.talk.slice(-8);lqTalkShow(false);}
var VOICE_WHY={'not-allowed':'Symbiot couldn’t use your microphone. Allow it for this window (the icon at the top of the window, or your system’s privacy settings), then click the mic again.','service-not-allowed':'Symbiot couldn’t use your microphone. Allow it for this window, then click the mic again.','audio-capture':'No microphone was found. Plug one in, or check it’s switched on, then try again.','network':'Talking needs an internet connection: your browser turns speech into text online.'};
// A click starts a conversation: after each spoken answer the mic reopens by itself, until you
// say "end conversation" (or "stop", "that's all"), click the mic, or stay quiet for two rounds.
function voiceToggle(){
if(VOICE.on){VOICE.convo=false;try{VOICE.rec.stop();}catch(e){}return;}
if(VOICE.convo){voiceEnd();return;}
VOICE.convo=true;VOICE.quiet=0;voiceStop();voiceListen();}
function voiceEnd(why){VOICE.convo=false;clearTimeout(VOICE.timer);voiceStop();voiceMic(VOICE.on);if(why)voiceSay(why);}
function voiceResume(){if(!VOICE.convo||VOICE.on)return;clearTimeout(VOICE.timer);VOICE.timer=setTimeout(function(){if(VOICE.convo&&!VOICE.on)voiceListen();},350);}
var VOICE_BYE=/^(?:ok(?:ay)?,? |please )?(?:end (?:the )?conversation|stop(?: (?:listening|talking))?|that'?s all|that is all|goodbye|bye)[.! ]*$/i;
function voiceListen(){
var R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return;
var r;try{r=new R();}catch(e){return;}
var ask=$('lqask');VOICE.rec=r;VOICE.final='';VOICE.err='';VOICE.base=((ask&&ask.value)||'').trim();
r.lang=navigator.language||'en-US';r.interimResults=true;r.continuous=false;r.maxAlternatives=1;
r.onstart=function(){VOICE.on=true;voiceMic(true);lqAct();};
r.onresult=function(ev){var interim='';for(var i=ev.resultIndex;i<ev.results.length;i++){var t=ev.results[i][0].transcript;if(ev.results[i].isFinal)VOICE.final+=t;else interim+=t;}
if(ask){ask.value=((VOICE.base?VOICE.base+' ':'')+(VOICE.final+interim)).replace(/ +/g,' ').trim();lqGrowAsk();}};
r.onerror=function(ev){VOICE.err=(ev&&ev.error)||'';};
r.onend=function(){VOICE.on=false;VOICE.rec=null;var said=((ask&&ask.value)||'').trim(),why=VOICE_WHY[VOICE.err];
if(why){VOICE.convo=false;voiceMic(false);voiceSay(why);return;}
if(VOICE.final.trim()&&VOICE_BYE.test(VOICE.final.trim())){if(ask){ask.value=VOICE.base;lqGrowAsk();}voiceEnd('Conversation ended.');return;}
if(VOICE.final.trim()&&said){VOICE.quiet=0;voiceMic(false);VOICE.spoke=true;lqSay();return;}
voiceMic(false);if(VOICE.convo){if(++VOICE.quiet>=2)voiceEnd('I stopped listening because it went quiet. Click the mic to talk again.');else voiceResume();}};
try{r.start();}catch(e){VOICE.on=false;VOICE.convo=false;voiceMic(false);}}
// Speaking, with no voice to choose: the system's own when it has a natural one
// (Edge on Windows, Macs with Apple's better voices, phones), in your region's accent if it has that too;
// otherwise Symbiot's own (voice.mjs: Piper on this computer), fetched once in the
// background the first time, with the system's voice meanwhile. Plain words only: the
// reply's spoken version (mind.mjs spokenLine), and no arrows read out as "right arrow".
var SPEAK={audio:null,n:0,own:null,asked:false};
function voiceLang(){return navigator.language||'en-US';}
function voiceTag(v){return String((v&&v.lang)||'').toLowerCase().split('_').join('-');}
function voiceNatural(){if(!window.speechSynthesis)return null;var tag=voiceLang().toLowerCase().split('_').join('-'),lang=tag.slice(0,2);
var vs=window.speechSynthesis.getVoices().filter(function(v){return voiceTag(v).indexOf(lang)===0;});
// modern voices only: Edge's Natural ones, Apple's Premium and Enhanced. Chrome's Google voices and espeak sound robotic.
var good=vs.filter(function(v){return /natural|neural|enhanced|premium|siri/i.test(v.name||'')&&!/espeak|google/i.test(v.name||'');});
if(!good.length&&/android|iphone|ipad/i.test(navigator.userAgent||''))good=vs; // a phone's own voices are good ones
good.sort(function(a,b){return (voiceTag(b)===tag)-(voiceTag(a)===tag);});
return {best:good[0]||null,any:good[0]||vs[0]||null};}
function voiceStop(){SPEAK.n++;try{if(window.speechSynthesis)window.speechSynthesis.cancel();}catch(e){}if(SPEAK.audio){try{SPEAK.audio.pause();}catch(e){}SPEAK.audio=null;}}
// How the voices say our names (Piper and the system's own both mangle them), and the things that
// read badly letter by letter: paths, ids, file names, versions, short-forms.
var VOICE_SAY=[[/symbiot/gi,'Simbeeot'],[/gawdessey/gi,'Gaw dessy'],[/meridian/gi,'Meridian'],[/pigeonly/gi,'Pigeonly'],[/workdesk/gi,'work desk'],[/quartz/gi,'Dayman'],[/\\bnpm\\b/gi,'N P M'],[/\\badb\\b/gi,'A D B'],[/\\bPRs?\\b/g,'P R'],[/\\bAPI\\b/g,'A P I'],[/\\bURLs?\\b/g,'U R L'],[/\\bPWA\\b/g,'P W A'],[/\\bCLI\\b/g,'C L I'],[/\\bCI\\b/g,'C I'],[/\\bSSH\\b/g,'S S H'],[/\\bTTS\\b/g,'T T S']];
function voiceSayable(t){var s=String(t||'');
s=s.replace(/(^|[\\s(])(?:~|\\.{1,2})?\\/[\\w.~\\-]+(?:\\/[\\w.~\\-]*)+/g,'$1a file path');
s=s.replace(/\\b[a-z]+-(?=[a-f]*\\d)[0-9a-f]{6,}\\b/g,'an id').replace(/\\b(?=[a-f]*\\d)[0-9a-f]{8,}\\b/g,'an id');
s=s.replace(/\\b([\\w\\-]+)\\.(?:mjs|cjs|js|json|md|html|css|ts|sh|png|log)\\b/g,'$1 file');
s=s.replace(/\\bv?(\\d+)\\.(\\d+)\\.(\\d+)\\b/g,'$1 point $2 point $3');
VOICE_SAY.forEach(function(p){s=s.replace(p[0],p[1]);});
return s;}
function voiceClean(t){var clean=voiceSayable(t).replace(/\\s*[\\u2190-\\u21ff\\u2794-\\u27bf\\u27f5-\\u27ff]\\s*/g,', ').replace(/(^|[.?!:]), /g,'$1 ').replace(/[*_#>|]+/g,' ').replace(new RegExp(String.fromCharCode(96),'g'),'').replace(/https?:[^ ]+/g,'a link').replace(/ +/g,' ').trim();
if(clean.length>700){var cut=clean.slice(0,700),at=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('? '),cut.lastIndexOf('! '));clean=(at>200?cut.slice(0,at+1):cut)+' The rest is on screen.';}
return clean;}
function voiceSystem(text,v,done){if(!window.speechSynthesis||!text){if(done)done();return;}try{var u=new SpeechSynthesisUtterance(text);if(v)u.voice=v;u.lang=voiceLang();u.rate=1.02;if(done){u.onend=done;u.onerror=done;}window.speechSynthesis.cancel();window.speechSynthesis.speak(u);}catch(e){if(done)done();}}
// the first sentence alone (heard while the rest is made), then about two at a time: fewer joins to hear
function voiceSentences(t){var out=[],cur='';t.split(' ').forEach(function(w){cur+=(cur?' ':'')+w;var e=w.charAt(w.length-1);if((e==='.'||e==='?'||e==='!')&&cur.length>(out.length?110:24)){out.push(cur);cur='';}});if(cur)out.push(cur);return out;}
function voiceOwn(text,lang,done){var my=SPEAK.n,parts=voiceSentences(text),got=[];
var make=function(i){if(i>=parts.length||got[i])return;got[i]=fetch('/api/voice/say',{method:'POST',headers:{'x-symbiot-token':T,'content-type':'application/json'},body:JSON.stringify({text:parts[i],lang:lang})}).then(function(r){if((r.headers.get('content-type')||'').indexOf('audio')<0)throw new Error('no audio');return r.blob();});};
var play=function(i){if(my!==SPEAK.n)return;if(i>=parts.length){if(done)done();return;}make(i);make(i+1);
got[i].then(function(b){if(my!==SPEAK.n)return;var a=new Audio(URL.createObjectURL(b));SPEAK.audio=a;a.onended=function(){try{URL.revokeObjectURL(a.src);}catch(e){}play(i+1);};var pl=a.play();if(pl&&pl.catch)pl.catch(function(){});})
.catch(function(){if(my!==SPEAK.n)return;SPEAK.own=null;var nat=voiceNatural();voiceSystem(parts.slice(i).join(' '),nat&&nat.any,done);});};
play(0);}
function voiceSpeak(t,done){if(!t){if(done)done();return;}voiceStop();var clean=voiceClean(t);if(!clean){if(done)done();return;}var nat=voiceNatural();
if(nat&&nat.best){voiceSystem(clean,nat.best,done);return;}
var lang=voiceLang(),go=function(st){if(st&&st.state==='ready'){voiceOwn(clean,lang,done);return;}
if(st&&(st.state==='missing'||st.state==='failed')&&!SPEAK.asked){SPEAK.asked=true;api('/api/voice/prepare',{lang:lang}).catch(function(){});}
voiceSystem(clean,nat&&nat.any,done);};
if(SPEAK.own&&SPEAK.own.state==='ready')go(SPEAK.own);else api('/api/voice?lang='+encodeURIComponent(lang)).then(function(st){SPEAK.own=st;go(st);}).catch(function(){go(null);});}
// Chrome lists its voices only after a first ask
try{if(window.speechSynthesis)window.speechSynthesis.getVoices();}catch(e){}
// Going somewhere by asking: "take me to reports" (or "navigate me to tasks", "open my
// week") opens it here, with no wait for the model; anything vaguer goes to the model,
// whose reply can carry a page to open (mind.mjs goOf: { to, why, alts }), and the
// pages it might have meant instead, a tap each under its reply.
var LQ_NAV_ALIAS={dashboard:'board',cards:'board',tasks:'tasks',agents:'tasks',workdesk:'tasks',home:'home','home page':'home',archive:'archive'};
function lqNavHit(q){var low=String(q||'').toLowerCase().replace(/[.!?]+$/,'').replace(/^(hey |ok |okay )?(symbiot,? )?/,'').replace(/^(please |can you |could you |would you )+/,'').replace(/ please$/,'').trim();
var v=low.match(/^(?:open(?: up)?|show(?: me)?|go(?: back)? to|take me(?: back)?(?: to)?|navigate(?: me)? to|bring up|switch to|jump to|go(?: back)?)(?: the| my)? (.+)$/),t=(v?v[1]:low).replace(/ (page|tab|screen)$/,'').trim();
if(!v&&t!=='dashboard'&&!LQNAMES[t]&&!Object.keys(LQNAMES).some(function(k){return LQNAMES[k].toLowerCase()===t;}))return '';
if(v&&t==='home')return 'home';if(LQ_NAV_ALIAS[t]&&(v||t!=='home'))return LQ_NAV_ALIAS[t];
var hit='';Object.keys(LQNAMES).forEach(function(k){if(!hit&&(LQNAMES[k].toLowerCase()===t||k===t))hit=k;});return hit;}
// g: the model's go, when it picked the page: its reason and the other pages, shown on the
// page it opened too (the chat sinks under an open page).
function lqNav(to,g){to=String(to||'');lqTalkMode(true);
if(to==='home'){if(LQ.mode==='pool')lqSink();if(LQ.scene==='work')lqHome();return;}
if(to==='archive'){lqUse('tasks',null,'talk');lqArchive();}
else if(to.indexOf('lane:')===0)lqOpen({kind:'proj',repo:to.slice(5)});
else if(to.indexOf('task:')===0){TFILTER.id=to.slice(5);TFILTER.repo='';TFILTER.type='';lqUse('tasks',null,'talk');lqGo('tasks');if(typeof loadTasks==='function')loadTasks();}
else if(LQNAMES[to]){lqUse(to,null,'talk');lqGo(to);}
else return;
lqWhy(g&&g.to===to?g:null);}
function lqAltsHtml(g){return g&&g.alts&&g.alts.length?"<span class='lqalts'>Or: "+g.alts.map(function(a){return "<button type='button' class='lqmrow' data-go='"+escQ(a.to)+"'>"+esc(a.label||a.to)+"</button>";}).join('')+"</span>":'';}
function lqWhy(g){var el=$('lqwhy');if(!el)return;var on=!!(g&&(g.why||(g.alts&&g.alts.length)));if(el.classList)el.classList.toggle('on',on);
el.innerHTML=on?(g.why?"<span>"+esc(g.why)+"</span>":'')+(g.alts&&g.alts.length?"<span>Or:</span>"+g.alts.map(function(a){return "<button type='button' class='lqmrow' data-go='"+escQ(a.to)+"'>"+esc(a.label||a.to)+"</button>";}).join(''):''):'';
if(on)el.querySelectorAll('[data-go]').forEach(function(b){b.addEventListener('click',function(){lqNav(b.getAttribute('data-go'));});});}
function lqSay(){var spoke=VOICE.spoke;VOICE.spoke=false;var i=$('lqask');var q=((i&&i.value)||'').trim(),shots=LQ.atts.slice();if(!q&&!shots.length)return;if(!q)q='Take a look at this screenshot.';i.value='';lqGrowAsk();LQ.atts=[];lqAttsShow();lqAct();
var low=q.toLowerCase().replace(/^(please |can you |could you )/,''),hit=lqNavHit(q);
if(hit){lqNav(hit);if(spoke)voiceResume();return;}
if(/^(go|start|go for it|start them|start it)[.! ]*$/.test(low)){lqTalkMode(true);lqGoWork();return;}
if(/^(home|back)[.! ]*$/.test(low)&&LQ.scene==='work'){lqHome();return;}
LQ.talkMin=false;lqTalkMode(true);LQ.talk.push({me:true,text:q,imgs:shots.map(function(a){return a.data;})});LQ.talk=LQ.talk.slice(-8);lqTalkShow(true);
api('/api/home/ask',{question:q,images:shots}).then(function(r){LQ.talk.push({me:false,steps:r.steps||[],go:r.go||null,signInTo:r.signInTo||null,text:r.error==='not-connected'?'Connect an AI in Settings to talk to me. Say "open settings".':(r.answer||r.error||'(no answer)')});if(spoke)voiceSpeak(r.spoken||LQ.talk[LQ.talk.length-1].text,voiceResume);LQ.talk=LQ.talk.slice(-8);lqTalkShow(false);LQ.ripple=[0.5,0.47,LQ.t];if(r.go&&r.go.to){lqNav(r.go.to,r.go);return;}lqLoad(false);}).catch(function(e){LQ.talk.push({me:false,text:String((e&&e.message)||e)});lqTalkShow(false);voiceResume();});}
`;
