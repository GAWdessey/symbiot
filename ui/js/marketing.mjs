// symbiot — Posts and the Marketing lane: drafts, previews, the pick tray, the overview.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// ---- Posts (post.mjs): the week's real work as drafts waiting on you: Approve, Edit, Skip. Nothing is posted
// until you approve one: then Marketing's agent posts it through Symbiot's signed-in browser ----
var POSTS=null,PEDIT={},PBUSY=0,PMSG='',PFORM={},PSEEN='';
// what the last action said: kept across a re-render (the list refreshes right after an Approve)
function postsMsg(cls,html){PMSG=html?"<div class='note "+cls+"'>"+html+"</div>":'';var o=$('postsmsg');if(o){o.innerHTML=PMSG;}}
// unchanged since the last look: left as it is, so a playing video or a half-typed page stays
function loadPostsUI(){api('/api/posts').then(function(p){if(!p||!p.posts)return;POSTS=p;var f=document.activeElement,k=JSON.stringify(p);if(PBUSY||(f&&f.closest&&f.closest('#boardposts')&&/^(TEXTAREA|INPUT)$/.test(f.tagName)))return;if(k===PSEEN&&$('boardposts')&&$('boardposts').innerHTML)return;PSEEN=k;renderPosts();});}
// a draft's pictures and video, each with a way off it, and the page form (From a page) when it's open
function pmediaSrc(x,a){return '/api/posts/media?post='+encodeURIComponent(x.id)+'&m='+encodeURIComponent(a.id)+'&t='+encodeURIComponent(T);}
function pmediaHtml(x){var m=x.media||[],h='',pf=PFORM[x.id],c=POSTS.clip||{min:3,max:30};
if(m.length)h+="<div class='pmedia'>"+m.map(function(a){var src=pmediaSrc(x,a),what=a.from==='page'?'picture of '+(a.url||a.name):a.from==='clip'?'clip of '+(a.url||a.name):(a.name||a.kind);
return "<div class='pthumb' data-m='"+escQ(a.id)+"' title='"+escQ(what)+"'>"+(a.kind==='video'?"<video src='"+escQ(src)+"' controls muted playsinline preload='metadata'></video>":"<img src='"+escQ(src)+"' alt='"+escQ(what)+"'>")
+"<button class='ghost pmdel' title='take it off this draft' aria-label='Remove "+escQ(a.kind)+"'>&times;</button></div>";}).join('')+"</div>";
if(pf)h+="<div class='row pform'><input class='purl' placeholder='a page: localhost:3000, your site, github.com/you' value='"+escQ(pf.url||'')+"' style='flex:1'>"
+"<button class='ghost ppic' title='the page as it looks now, sharp enough for a feed'>Take a picture</button>"
+"<select class='psecs' title='how long the clip runs' style='flex:0 0 auto;width:auto'>"+[5,8,15,30].filter(function(s){return s>=c.min&&s<=c.max;}).map(function(s){return "<option value='"+s+"'"+(s===(pf.secs||8)?" selected":"")+">"+s+" s</option>";}).join('')+"</select>"
+"<button class='ghost pclip'"+(POSTS.canClip?" title='records the page, scrolling slowly down it, as an MP4'":" disabled title='recording a clip needs ffmpeg, which isn&#39;t installed'")+">Record a clip</button>"
+"<button class='ghost pfclose'>Cancel</button></div>";
return h;}
function renderPosts(){var p=POSTS,el=$('boardposts');if(!el||!p)return;var L=p.labels||{},h='';
// it can't draft yet (no AI, or neither LinkedIn linked nor examples in voice.md): one line, not a block a new user meets first
if(!p.posts.length&&p.canDraft===false){var need=[];if(!p.connected)need.push('an AI is connected (Settings)');if(!p.linkedin&&!p.voice.count)need.push('LinkedIn is linked, or <code>'+esc(p.voice.file)+'</code> has a few of your posts');
el.innerHTML="<div class='pshead'><span>Drafts to post</span><small>Symbiot drafts your week&#39;s LinkedIn posts from your git, in your voice, once "+need.join(', and ')+".</small></div>"+(!p.linkedin?"<div class='row'><button class='ghost plink' title='sign in to LinkedIn once in Symbiot&#39;s browser: it reads your posts for your voice, and replies to them show here'>Link LinkedIn</button></div>":"");
var pl=el.querySelector('.plink');if(pl)pl.addEventListener('click',function(){pl.disabled=true;api('/api/links/link',{id:'linkedin'}).then(function(r){pl.disabled=false;mkMsg(r&&!r.error?'ok':'err',r&&!r.error?"Opened LinkedIn in Symbiot&#39;s browser. Sign in as you normally do, then close that window.":esc((r&&r.error)||'failed'));});});return;}
if(p.posts.length){h+="<div class='pshead'><span>Drafts to post</span><small>"+p.posts.length+" waiting on you &middot; Approve one and Marketing&#39;s agent schedules it on LinkedIn for the next free day</small></div><div class='pshelf'>";
h+=p.posts.map(function(x){var ed=Object.prototype.hasOwnProperty.call(PEDIT,x.id);
return "<div class='rcard pcard"+(ed?" editing":"")+"' data-id='"+escQ(x.id)+"'><div class='rhead'><b>"+mkProd(mkPostProduct(x.id))+esc(L[x.kind]||x.kind)+"</b><span class='muted'>LinkedIn &middot; drafted "+agoTxt(x.drafted)+(x.edited?" &middot; edited":"")+"</span></div>"
+(ed?"<textarea class='pedit' maxlength='3000'>"+esc(PEDIT[x.id])+"</textarea>":"<div class='ptext'>"+esc(x.text)+"</div><button type='button' class='pmore' aria-expanded='false'>Read it all</button>")
+(x.show&&!(x.media||[]).length?"<div class='pshow'><span class='muted'>Picture idea:</span> "+esc(x.show)+"</div>":"")
+pmediaHtml(x)
+(x.sources&&x.sources.length?"<details class='psrc'><summary>From git: "+x.sources.length+" thing"+(x.sources.length===1?"":"s")+" it says</summary>"+x.sources.map(function(s){return "<div>"+esc(s)+"</div>";}).join('')+"</details>":"")
+"<div class='row'>"+(ed?"<button class='act psave'>Save</button><button class='ghost pcancel'>Cancel</button><span class='pchars'>"+String(PEDIT[x.id]).length+" / 3000</span>"
:"<button class='act papprove' title='your yes: Marketing&#39;s agent schedules it on LinkedIn for the next free day (one post a day) through Symbiot&#39;s signed-in browser, exactly as it reads here, with its picture or video'>Approve</button><button class='ghost pedit-btn' title='change its words here'>Edit</button><button class='ghost pskip' title='drop this draft (it stays in the log)'>Skip</button>"
+"<button class='ghost pmadd' title='a picture or video of yours: PNG, JPG, GIF, MP4, MOV or WebM'>Add picture or video</button>"+(PFORM[x.id]?"":"<button class='ghost pmfrom' title='a picture, or a short clip, of a web page (your app on localhost too)'>From a page</button>")
+"<input type='file' class='pmfile hidden' accept='image/png,image/jpeg,image/gif,video/mp4,video/quicktime,video/webm'>")+"</div></div>";}).join('')+"</div>";}
else h+="<div class='row' style='margin-top:10px'><span class='muted' style='flex:1'>"+(p.voice.count?"Posts: draft this week&#39;s 3 LinkedIn posts from your git, in your voice ("+p.voice.count+" example"+(p.voice.count===1?"":"s")+"). Nothing is posted until you approve one, and then Marketing&#39;s agent posts it."
:"Posts: Symbiot drafts LinkedIn posts from your week&#39;s git in your own voice, once it has examples of your posts. Link LinkedIn (below) and click <b>Fill from LinkedIn</b>, or paste 5&ndash;10 of your posts into <code>"+esc(p.voice.file)+"</code>, a line of --- between each.")+"</span>"
+"<button class='ghost pvoice' title='reads your recent posts on LinkedIn in Symbiot&#39;s signed-in browser into voice.md, which you can read over'>Fill from LinkedIn</button>"
+"<button class='ghost pdraft'"+(p.voice.count?" title='your AI drafts 3 posts from your last 7 days of commits, release tags and changelog; each must cite what git shows'":" disabled title='add example posts first'")+">Draft this week&#39;s posts</button></div>";
el.innerHTML=h+"<div id='postsmsg'>"+PMSG+"</div>";
el.querySelectorAll('.pcard').forEach(function(c){if(c.classList.contains('editing'))return;c.title='open it large';c.addEventListener('click',function(ev){if(ev.target.closest('button,a,input,select,textarea,video,label,summary,details'))return;mkBig({post:c.getAttribute('data-id')},c);});});
el.querySelectorAll('.pmore').forEach(function(b){b.addEventListener('click',function(){var c=b.closest('.pcard'),on=c.classList.toggle('open');b.setAttribute('aria-expanded',on?'true':'false');b.textContent=on?'Show less':'Read it all';});});
function post(btn){var id=btn.closest('.pcard').getAttribute('data-id');return p.posts.filter(function(x){return x.id===id;})[0];}
el.querySelectorAll('.papprove').forEach(function(btn){btn.addEventListener('click',function(){var x=post(btn);if(!x)return;btn.disabled=true;postsMsg('','');
api('/api/posts/approve',{id:x.id}).then(function(r){if(!r||r.error){btn.disabled=false;postsMsg('err',esc((r&&r.error)||'failed'));return;}
postsMsg(r.handed&&r.handed.error?'err':'ok',(r.handed&&r.handed.error?'':'&#10003; ')+esc(r.note||'Approved.'));loadPostsUI();}).catch(function(e){btn.disabled=false;postsMsg('err',esc(String((e&&e.message)||e)));});});});
// pictures and video: yours (a file), or a picture or clip of a page; each comes off with its &times;
function pmediaDone(btn,label){return function(r){PBUSY=Math.max(0,PBUSY-1);if(btn){btn.disabled=false;if(label)btn.textContent=label;}if(!r||r.error){postsMsg('err',esc((r&&r.error)||'failed'));return;}
if(r.media&&r.post)delete PFORM[r.post.id];var f=document.activeElement;if(f&&f.blur&&f.closest&&f.closest('#boardposts'))f.blur();postsMsg('','');loadPostsUI();};}
function pfail(btn,label){return function(e){PBUSY=Math.max(0,PBUSY-1);if(btn){btn.disabled=false;if(label)btn.textContent=label;}postsMsg('err',esc(String((e&&e.message)||e)));};}
el.querySelectorAll('.pmadd').forEach(function(btn){var inp=btn.parentNode.querySelector('.pmfile');btn.addEventListener('click',function(){if(inp)inp.click();});
if(inp)inp.addEventListener('change',function(){var x=post(btn),f=inp.files&&inp.files[0];if(!x||!f)return;btn.disabled=true;btn.textContent='Adding…';PBUSY++;postsMsg('','');
fetch('/api/posts/media/add?id='+encodeURIComponent(x.id)+'&name='+encodeURIComponent(f.name),{method:'POST',headers:{'x-symbiot-token':T,'content-type':'application/octet-stream'},body:f}).then(function(r){return r.json();})
.then(pmediaDone(btn,'Add picture or video'),pfail(btn,'Add picture or video'));});});
el.querySelectorAll('.pmfrom').forEach(function(btn){btn.addEventListener('click',function(){var x=post(btn);if(!x)return;PFORM[x.id]={url:p.lastUrl||'',secs:8};renderPosts();var i=el.querySelector(".pcard[data-id='"+x.id+"'] .purl");if(i){i.focus();i.select();}});});
el.querySelectorAll('.pform').forEach(function(row){var x=post(row),i=row.querySelector('.purl'),s=row.querySelector('.psecs');if(!x)return;
i.addEventListener('input',function(){PFORM[x.id].url=i.value;});if(s)s.addEventListener('change',function(){PFORM[x.id].secs=Number(s.value)||8;});
i.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();row.querySelector('.ppic').click();}if(e.key==='Escape'){delete PFORM[x.id];renderPosts();}});
row.querySelector('.pfclose').addEventListener('click',function(){delete PFORM[x.id];renderPosts();});
function shoot(btn,clip){if(!i.value.trim()){i.focus();return;}var label=btn.textContent,secs=s?Number(s.value)||8:8;btn.disabled=true;btn.textContent=clip?'Recording '+secs+' s…':'Taking it…';PBUSY++;postsMsg('','');
api('/api/posts/media/page',{id:x.id,url:i.value.trim(),clip:clip,seconds:secs}).then(pmediaDone(btn,label),pfail(btn,label));}
row.querySelector('.ppic').addEventListener('click',function(){shoot(this,false);});row.querySelector('.pclip').addEventListener('click',function(){shoot(this,true);});});
el.querySelectorAll('.pmdel').forEach(function(btn){btn.addEventListener('click',function(){var x=post(btn),m=btn.closest('.pthumb').getAttribute('data-m');if(!x)return;btn.disabled=true;PBUSY++;
api('/api/posts/media/remove',{id:x.id,m:m}).then(pmediaDone(null,''),pfail(null,''));});});
el.querySelectorAll('.pedit-btn').forEach(function(btn){btn.addEventListener('click',function(){var x=post(btn);if(!x)return;PEDIT[x.id]=x.text;renderPosts();var t=el.querySelector(".pcard[data-id='"+x.id+"'] textarea");if(t)t.focus();});});
el.querySelectorAll('textarea.pedit').forEach(function(t){t.addEventListener('input',function(){var id=t.closest('.pcard').getAttribute('data-id');PEDIT[id]=t.value;var c=t.closest('.pcard').querySelector('.pchars');if(c)c.textContent=t.value.length+' / 3000';});});
el.querySelectorAll('.pcancel').forEach(function(btn){btn.addEventListener('click',function(){var x=post(btn);if(x)delete PEDIT[x.id];renderPosts();});});
el.querySelectorAll('.psave').forEach(function(btn){btn.addEventListener('click',function(){var x=post(btn);if(!x)return;btn.disabled=true;PBUSY++;
api('/api/posts/edit',{id:x.id,text:PEDIT[x.id]}).then(function(r){PBUSY=Math.max(0,PBUSY-1);btn.disabled=false;if(!r||r.error){postsMsg('err',esc((r&&r.error)||'failed'));return;}
delete PEDIT[x.id];x.text=r.post.text;x.edited=r.post.edited;renderPosts();postsMsg(r.unsupported?'err':'ok',r.unsupported?"Saved. Note: git doesn&#39;t show "+esc(r.unsupported.join(', '))+". It&#39;s your post, so it stays as you wrote it.":"&#10003; Saved.");}).catch(function(e){PBUSY=Math.max(0,PBUSY-1);btn.disabled=false;postsMsg('err',esc(String((e&&e.message)||e)));});});});
el.querySelectorAll('.pskip').forEach(function(btn){btn.addEventListener('click',function(){var x=post(btn);if(!x)return;btn.disabled=true;postsMsg('','');
api('/api/posts/skip',{id:x.id}).then(function(r){if(!r||r.error){btn.disabled=false;postsMsg('err',esc((r&&r.error)||'failed'));return;}loadPostsUI();}).catch(function(e){btn.disabled=false;postsMsg('err',esc(String((e&&e.message)||e)));});});});
var dr=el.querySelector('.pdraft');if(dr)dr.addEventListener('click',function(){dr.disabled=true;postsMsg('','');dr.textContent='Drafting…';PBUSY++;
api('/api/posts/draft',{}).then(function(r){PBUSY=Math.max(0,PBUSY-1);dr.disabled=false;dr.textContent="Draft this week's posts";if(!r||r.error){postsMsg('err',esc((r&&r.error)||'failed'));return;}
POSTS.posts=r.posts;renderPosts();var said=[];if(r.retried)said.push("The first try kept none (each claimed what git doesn't show), so I tried again.");if(r.pictures)said.push((r.pictures===1?"One draft names a screen of an app you run here: its picture's on it already.":r.pictures+" drafts name a screen of an app you run here: their pictures are on them already.")+" Keep or remove it.");if(r.dropped&&r.dropped.length)said.push("Dropped "+r.dropped.length+": "+r.dropped.map(function(d){return (L[d.kind]||d.kind)+(d.cited?" (it claimed "+d.unsupported.join(', ')+", which git doesn't show)":" (it cited nothing from git)");}).join('; '));if(said.length)postsMsg('muted',esc(said.join(' ')));loadPostsUI();}).catch(function(e){PBUSY=Math.max(0,PBUSY-1);dr.disabled=false;dr.textContent="Draft this week's posts";postsMsg('err',esc(String((e&&e.message)||e)));});});
var vb=el.querySelector('.pvoice');if(vb)vb.addEventListener('click',function(){vb.disabled=true;postsMsg('','');vb.textContent='Reading LinkedIn…';
api('/api/posts/voice',{confirmed:true}).then(function(r){vb.disabled=false;vb.textContent='Fill from LinkedIn';if(!r||r.error){postsMsg('err',esc((r&&r.error)||'failed'));return;}
postsMsg('ok',"&#10003; Added "+r.added+" of your LinkedIn posts: "+r.total+" in <code>"+esc(r.file)+"</code>. Read them over, and delete any that don&#39;t sound like you.");loadPostsUI();}).catch(function(e){vb.disabled=false;vb.textContent='Fill from LinkedIn';postsMsg('err',esc(String((e&&e.message)||e)));});});}
// ---- Marketing: what you post about your work (post.mjs), who answers, and the 4-week test ----
// Off the Dashboard, which shows only what you watch. Its orb shows on Home once posts
// can be drafted, or are (home.mjs marketing).
var MKT=null;
function mkMsg(cls,html){var o=$('mkmsg')||document.querySelector('#reportbody .repmsg');if(o)o.innerHTML=html?"<div class='note "+cls+"'>"+html+"</div>":'';}
function loadMarketing(){loadPostsUI();loadMkTray();api('/api/marketing').then(function(d){if(d&&!d.error){MKT=d;renderMarketing();renderMkLane();if(POSTS)renderPosts();}});}
// The Marketing lane (home.mjs marketingState): what needs you there first (its agent's
// questions, its work waiting for your OK, the week's drafts), then its tasks, each tagged
// with the product it markets, an Add for a new one, what its agent drafted, and other
// lanes' tasks about marketing, which move to it in a click. Opened from its lit orb, what
// needs you is lit (MKLIT).
var MKLIT=false;
function mkProd(p){return p?"<span class='mkp'>"+esc(p)+"</span>":"";}
function mkPostProduct(id){var ns=(MKT&&MKT.lane&&MKT.lane.needs)||[];for(var i=0;i<ns.length;i++)if(ns[i].id==='draft:'+id)return ns[i].product||'';return '';}
// A draft its agent wrote, as the platform will show it (marketing.mjs draftPreview): who
// it's from, its text with its own line breaks, cut where the feed cuts it ("…see more"),
// its hashtags, its picture or video; Approve and Skip beside it; its agent's notes apart,
// folded away below. Approve is your only step: its agent then posts it through Symbiot's
// signed-in browser, with this text.
var MKPV='';
function mkTags(t){return String(t||'').split(/(#[A-Za-z0-9_]+)/g).map(function(x,i){return i%2?"<span class='lihash'>"+esc(x)+"</span>":esc(x);}).join('');}
function mkMediaSrc(rel){return '/api/marketing/media?rel='+encodeURIComponent(rel)+'&t='+encodeURIComponent(T);}
// Reddit's markdown, as far as a preview needs it: its text as written, a span in backticks as code.
// A card's words with code shown as code: a fenced block as a box of its own (its language word
// dropped), inline code as code (review of 20 Oct 2026, Q5: a sudo line showed as backticks in prose).
function codeText(t){var f=String.fromCharCode(96,96,96);return String(t||'').split(f).map(function(x,i,all){if(i%2&&i<all.length-1){var nl=x.indexOf(String.fromCharCode(10)),c=nl>=0&&/^[a-z0-9+-]*$/i.test(x.slice(0,nl).trim())?x.slice(nl+1):x;return "<code class='bcode'>"+esc(c.trim())+"</code>";}return mkRdText((i%2?f:'')+x);}).join('');}
// The project a card is about (home.mjs projectFor), before its name: shown when the name doesn't
// say it already (an ops run's card), or "no project" when the record names none.
function projChip(y){if(!y||y.project===undefined||(y.repo&&y.project===y.repo))return '';return "<span class='bproj"+(y.project?'':' none')+"' title='"+escQ(y.project?'which project this is about':'this run was started for no project')+"'>"+esc(y.project||'no project')+"</span>";}
function mkRdText(t){var bt=String.fromCharCode(96);return String(t||'').split(bt).map(function(x,i,all){return i%2&&i<all.length-1?"<code>"+esc(x)+"</code>":esc((i%2?bt:'')+x);}).join('');}
function mkRedditHtml(p){var a=p.author||{},who=p.handle||(a.name?'you ('+a.name+')':'you');
return "<div class='rdpost' aria-label='Reddit preview'><div class='rdhead'><span class='rdic' aria-hidden='true'>r/</span><b>"+esc(p.where||'Reddit')+"</b><span>&middot; "+(p.when?"scheduled for "+esc(p.when):"now")+" &middot; posted by "+esc(who)+"</span></div>"
+"<div class='rdtitle'>"+esc(p.title||'')+"</div>"+(p.flair?"<span class='rdflair'>"+esc(p.flair)+"</span>":"")
+(p.media||[]).map(function(m){return m.kind==='video'?"<video class='rdmedia' src='"+escQ(mkMediaSrc(m.rel))+"' controls muted playsinline preload='metadata'></video>":"<img class='rdmedia' src='"+escQ(mkMediaSrc(m.rel))+"' alt='"+escQ(m.name)+"'>";}).join('')
+"<div class='rdbody'>"+mkRdText(p.body)+"</div><div class='rdbar'><span>&#8679; Vote &#8681;</span><span>Comments</span><span>Award</span><span>Share</span></div></div>";}
// Paragraphs and bullets as a blog or a comment lays them out: blank-line paragraphs, "- " lists,
// bare links made clickable. Everything is escaped first.
function mkProse(t){var NL=String.fromCharCode(10),out=[],li=[],flush=function(){if(li.length){out.push('<ul>'+li.join('')+'</ul>');li=[];}},lk=function(s){return esc(s).replace(/(https?:\\/\\/[^\\s<]+[^\\s<.,;:!?)])/g,function(u){return "<a href='"+u+"' target='_blank' rel='noopener'>"+u+"</a>";});};
String(t||'').split(NL+NL).forEach(function(blk){var ls=blk.split(NL),para=[];ls.forEach(function(l){var m=l.match(/^\\s*[-*]\\s+(.*)$/);if(m){if(para.length){out.push('<p>'+para.join('<br>')+'</p>');para=[];}li.push('<li>'+lk(m[1])+'</li>');}else{flush();if(l.trim())para.push(lk(l));}});flush();if(para.length)out.push('<p>'+para.join('<br>')+'</p>');});return out.join('');}
// A blog post, whole (never cut at a "see more"): its first line is the headline.
function mkBlogHtml(p){var NL=String.fromCharCode(10),ls=String(p.body||'').split(NL),head=ls[0],rest=ls.slice(1).join(NL).replace(/^\\s+/,'');
return "<div class='blogpost' aria-label='blog post preview'><div class='blogmeta'>"+esc(p.product||'Blog')+" &middot; "+(p.when?"scheduled for "+esc(p.when):"now")+"</div><h2 class='blogh'>"+esc(head)+"</h2><div class='blogbody'>"+mkProse(rest)+"</div>"+mkMediaHtml(p)+"</div>";}
// A Show HN as Hacker News's submit page will get it: the title, the site's address, and the
// first comment (the post's text, then its First comment section) that goes under the new item.
function mkHnHtml(p){var h=p.hn||{},NL=String.fromCharCode(10),first=[h.text,p.comment].filter(Boolean).join(NL+NL);
return "<div class='hnpost' aria-label='Hacker News preview'><div class='hnbar'><b class='hny'>Y</b><b>Submit</b><span>"+(p.when?"scheduled for "+esc(p.when)+" (SAST)":"now")+" &middot; from your Hacker News account, through Symbiot&#39;s browser</span></div>"
+"<div class='hnrow'><span class='hnk'>title</span><span class='hnt'>"+esc(h.title||'')+"</span></div><div class='hnrow'><span class='hnk'>url</span><span class='hnu'>"+esc(h.url||'(no link found in the first comment)')+"</span></div>"
+"<div class='hnrow'><span class='hnk'>first comment</span><div class='hnc'>"+mkProse(first)+"</div></div></div>";}
// Each draft as its own platform shows it (its platform: line): LinkedIn's post, X's card,
// Instagram's picture and caption, Facebook's post, Reddit's post with its subreddit and
// title. A Reddit draft shown as a LinkedIn post can't be judged (the user, 2026-10-10).
var MKLIMIT={linkedin:3000,x:280,twitter:280,instagram:2200,facebook:63206,reddit:40000,hackernews:40000,blog:100000};
function mkMediaHtml(p,cls){return (p.media||[]).map(function(m){return m.kind==='video'?"<video class='limedia' src='"+escQ(mkMediaSrc(m.rel))+"' controls muted playsinline preload='metadata'></video>":"<img class='limedia' src='"+escQ(mkMediaSrc(m.rel))+"' alt='"+escQ(m.name)+"'>";}).join('');}
function mkAv(p,a,cls){var who=p.account||p.product||a.name||'';return a.avatar&&!p.account&&!p.product?"<img class='"+cls+"' src='"+escQ(mkMediaSrc('avatar'))+"' alt=''>":"<span class='"+cls+"'>"+esc(String(who).replace(/^@/,'').slice(0,2).toUpperCase())+"</span>";}
function mkPostHtml(p){var a=p.author||{},pl=p.platform==='twitter'?'x':p.platform,when=p.when?"Scheduled for "+esc(p.when):"Now";
var who=esc(String(p.account||p.product||a.name||'').replace(/^@/,'')),handle=p.account?'@'+esc(String(p.account).replace(/^@/,'')):'';
if(pl==='x')return "<div class='lipost xpost' aria-label='X preview'><div class='liauth'>"+mkAv(p,a,'liav')+"<div><div class='liwho'><b>"+who+"</b>"+(handle?"<small>"+handle+"</small>":"")+"<small>&middot; "+when+"</small></div>"
+"<div class='litext'>"+mkTags(p.body)+"</div>"+mkMediaHtml(p)+"<div class='libar'><span>&#128172;</span><span>&#8645;</span><span>&#9825;</span><span>&#128202;</span><span>&#10697;</span></div></div></div></div>";
if(pl==='instagram')return "<div class='lipost igpost' aria-label='Instagram preview'><div class='liauth'>"+mkAv(p,a,'liav')+"<div class='liwho'><b>"+(handle?esc(String(p.account).replace(/^@/,'')):who)+"</b><small>"+when+"</small></div></div>"
+((p.media||[]).length?mkMediaHtml(p):"<div class='ignomedia'>Instagram needs a picture or video, and this draft has none.</div>")
+"<div class='libar'><span>&#9825;</span><span>&#128172;</span><span>&#10148;</span></div><div class='litext'><b>"+(handle?esc(String(p.account).replace(/^@/,'')):who)+"</b> "+mkTags(p.body)+"</div></div>";
if(pl==='facebook')return "<div class='lipost fbpost' aria-label='Facebook preview'><div class='liauth'>"+mkAv(p,a,'liav')+"<div class='liwho'><b>"+who+"</b><small>"+when+" &middot; &#127760;</small></div></div>"
+"<div class='litext'>"+mkTags(p.body)+"</div>"+mkMediaHtml(p)+"<div class='libar'><span>Like</span><span>Comment</span><span>Share</span></div></div>";
if(pl==='reddit')return mkRedditHtml(p);
if(pl==='hackernews'&&p.hn)return mkHnHtml(p);
if(pl==='blog')return mkBlogHtml(p);
var li=pl==='linkedin',plat=li?'LinkedIn':(p.platform||'post');
return "<div class='lipost' aria-label='"+escQ(plat)+" preview'><div class='liauth'>"+(a.avatar?"<img class='liav' src='"+escQ(mkMediaSrc('avatar'))+"' alt=''>":"<span class='liav'>"+esc(a.initials||'')+"</span>")
+"<div class='liwho'><b>"+esc(a.name||'')+"</b>"+(a.headline?"<small>"+esc(a.headline)+"</small>":"")+"<small>"+when+" &middot; &#127760;</small></div></div>"
+"<div class='litext'>"+(li&&p.cut?mkTags(p.shown)+"&hellip;<button type='button' class='limore'>see more</button>":mkTags(p.body))+"</div>"
+mkMediaHtml(p)+(li?"<div class='libar'><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div>":"")+"</div>";}
function mkPreviewHtml(p){var h=mkPostHtml(p),lim=MKLIMIT[p.platform]||0,reddit=/reddit/i.test(p.platform||'');
if(p.reopened)h="<div class='note err'>Edited since you "+esc(p.reopened.was==='approved'?'approved':p.reopened.was==='skipped'?'rejected':'asked for a change to')+" it "+agoTxt(p.reopened.at)+": that answer no longer holds, so it needs your OK again.</div>"+h;
if(p.hn&&!p.hn.signedIn&&p.status!=='posted'&&p.status!=='superseded')h+="<div class='note err'>Symbiot&#39;s browser isn&#39;t signed in to "+esc(p.hn.host)+", which its agent needs to submit this. <button type='button' class='act mksign'>Sign in to "+esc(p.hn.name)+"</button></div>";
if((p.missing||[]).length)h+="<div class='note err'>It names "+p.missing.map(function(m){return "<code>"+esc(m)+"</code>";}).join(', ')+", which isn&#39;t next to it.</div>";
var fin=p.status==='posted'||p.status==='superseded',pn={linkedin:'LinkedIn',x:'X',instagram:'Instagram',facebook:'Facebook',reddit:'Reddit',hackernews:'Hacker News',blog:'the blog'},on=pn[p.postedOn]||p.postedOn;
var done=p.status==='posted'?"Posted"+(on?" on "+esc(on):"")+(p.posted?", "+esc(new Date(p.posted).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})):"")+(p.url?" &middot; <a href='"+esc(okUrl(p.url))+"' target='_blank' rel='noopener'>see it</a>":"")+". It isn&#39;t approved or posted again"+(p.edited?", though its file changed since":"")+"."
:p.status==='superseded'?"Superseded"+((p.by||[]).length?" by "+p.by.map(function(b){return "<code>"+esc(b)+"</code>";}).join(', '):"")+": it won&#39;t be posted."
:p.status==='approved'?"Approved "+agoTxt(p.statusAt)+": its agent "+(p.when?"schedules":"posts")+" it through Symbiot&#39;s browser, with this text.":p.status==='skipped'?"Rejected "+agoTxt(p.statusAt)+": it won&#39;t be posted."
:p.status==='change'?"You asked for a change "+agoTxt(p.statusAt)+": its agent redrafts it, and the new version comes back here for your OK.":"";
h+="<div class='row mkpvact'>"+(fin||p.status==='approved'?"":"<button class='act mkok'>Approve"+(p.when?", schedule it":", post it")+"</button>")+(fin?"":"<button class='ghost mkchg' aria-expanded='false'>Change it</button>")+(fin||p.status==='skipped'?"":"<button class='ghost mkskip'>Reject</button>")
+"<span class='muted' style='font-size:12px;flex:1'>"+(done||(p.when?"Its agent schedules it for "+esc(p.when)+" once you approve.":"Its agent posts it once you approve."))+"</span><span class='pchars"+(lim&&p.chars>lim?" err":"")+"'>"+(reddit?"title "+String(p.title||'').length+" / 300 &middot; ":"")+p.chars+(lim?" / "+lim:"")+"</span></div>";
if(p.status==='change'&&p.ask)h+="<div class='mkasked muted'>What you asked: &ldquo;"+esc(p.ask)+"&rdquo;</div>";
if(!fin)h+="<form class='row mkchgf hidden'><textarea class='mkchgt' maxlength='4000' placeholder='What should change? Its agent redrafts this same post and brings it back for your OK.' aria-label='What to change'></textarea><button type='submit' class='act'>Send to its agent</button><button type='button' class='ghost mkchgx'>Cancel</button></form>";
h+="<details class='linotes'><summary>Its notes</summary>"+(p.notes?"<div class='linotest'>"+esc(p.notes)+"</div>":"<div class='muted'>None.</div>")+"<button type='button' class='ghost mkfile' title='open the draft in your editor'>Edit the file</button></details>";
return h;}
// A file that isn't a social post (a store listing, schedule, plan, brief, script): shown as a
// document with its markdown rendered (tables too), Copy, and for a listing Mark done. Never Approve, post it.
function mkInline(x){return esc(x).split('**').map(function(s,i){return i%2?'<b>'+s+'</b>':s;}).join('');}
function mkMd(t){var NL=String.fromCharCode(10),L=String(t||'').split(NL),o=[],i=0,cells=function(r){var c=r.trim().split('|');if(c[0]==='')c.shift();if(c.length&&c[c.length-1]==='')c.pop();return c.map(function(x){return x.trim();});};
while(i<L.length){var tl=L[i].trim(),m;
if(tl===''){i++;continue;}
if(tl.charAt(0)==='|'&&i+1<L.length&&L[i+1].trim().charAt(0)==='|'&&L[i+1].indexOf('-')>=0&&L[i+1].replace(/[|:\\-\\s]/g,'')===''){var hd=cells(tl);o.push("<table class='mkdt'><thead><tr>"+hd.map(function(c){return '<th>'+mkInline(c)+'</th>';}).join('')+'</tr></thead><tbody>');i+=2;
while(i<L.length&&L[i].trim().charAt(0)==='|'){o.push('<tr>'+cells(L[i]).map(function(c){return '<td>'+mkInline(c)+'</td>';}).join('')+'</tr>');i++;}o.push('</tbody></table>');continue;}
if((m=tl.match(/^(#{1,4})\\s+(.*)$/))){var n=Math.min(m[1].length+2,6);o.push('<h'+n+'>'+mkInline(m[2])+'</h'+n+'>');i++;continue;}
if(/^[-*]\\s+/.test(tl)){o.push('<ul>');while(i<L.length&&/^[-*]\\s+/.test(L[i].trim())){o.push('<li>'+mkInline(L[i].trim().replace(/^[-*]\\s+/,''))+'</li>');i++;}o.push('</ul>');continue;}
var para=[];while(i<L.length&&L[i].trim()!==''&&L[i].trim().charAt(0)!=='|'&&!/^(#{1,4}\\s|[-*]\\s)/.test(L[i].trim())){para.push(mkInline(L[i]));i++;}
if(!para.length){o.push('<p>'+mkInline(L[i])+'</p>');i++;}else o.push('<p>'+para.join('<br>')+'</p>');}
return o.join('');}
function mkDocHtml(p){return "<div class='mkdoc' aria-label='document preview'>"+mkMd(p.text)+"</div><div class='row mkpvact'><button class='act mkcopy'>Copy</button>"+(p.type==='listing'&&!p.done?"<button class='ghost mkdone'>Mark done</button>":p.type==='plan'&&!p.done?"<button class='act mkdone' data-accept='1' title='Agree to this plan: nothing is posted from it'>Accept</button>":"")+"<button class='ghost mkfile' title='open the file in your editor'>Edit the file</button><span class='muted' style='font-size:12px;flex:1'>"+(p.done?(p.type==='plan'?"Accepted. ":"Marked done. "):"")+"A "+esc(p.type||'document')+", not a social post: nothing is posted from it.</span></div>";}
function mkPreview(box,rel){if(!box.innerHTML)box.innerHTML="<div class='muted'>Loading&hellip;</div>";
api('/api/marketing/draft?rel='+encodeURIComponent(rel)).then(function(p){if(MKPV!==rel&&!box.classList.contains('repcard'))return;if(!p||p.error){box.innerHTML="<div class='note err'>"+esc((p&&p.error)||'failed')+"</div>";return;}
if(p.isPost===false){box.innerHTML=mkDocHtml(p);var cp=box.querySelector('.mkcopy');if(cp)cp.addEventListener('click',function(){var done=function(){mkMsg('ok','Copied.');};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(p.text).then(done,function(){mkMsg('err','Couldn&#39;t copy it.');});else mkMsg('err','Couldn&#39;t copy it.');});
var dn=box.querySelector('.mkdone');if(dn)dn.addEventListener('click',function(){dn.disabled=true;var acc=dn.getAttribute('data-accept')==='1';api('/api/marketing/draft/answer',acc?{rel:rel,status:'approved'}:{rel:rel,done:true}).then(function(r){if(!r||r.error){dn.disabled=false;mkMsg('err',esc((r&&r.error)||'failed'));return;}mkMsg('ok',acc?'Accepted.':'Marked done.');loadMarketing();mkPreview(box,rel);});});
var fl0=box.querySelector('.mkfile');if(fl0)fl0.addEventListener('click',function(){api('/api/marketing/open',{rel:rel}).then(function(r){if(r&&r.error)mkMsg('err',esc(r.error));});});return;}
box.innerHTML=mkPreviewHtml(p);
var lp=box.querySelector('.lipost,.rdpost');if(lp){lp.title='open it large';lp.addEventListener('click',function(ev){if(ev.target.closest('button,a,video'))return;mkBig({rel:rel},lp);});}
var mo=box.querySelector('.limore');if(mo)mo.addEventListener('click',function(){box.querySelector('.litext').innerHTML=mkTags(p.body);});
var fl=box.querySelector('.mkfile');if(fl)fl.addEventListener('click',function(){api('/api/marketing/open',{rel:rel}).then(function(r){if(r&&r.error)mkMsg('err',esc(r.error));});});
var sg=box.querySelector('.mksign');if(sg&&p.hn)sg.addEventListener('click',function(){sg.disabled=true;openSignIn({site:p.hn.host,name:p.hn.name},function(t,ok){sg.disabled=false;mkMsg(ok?'ok':'err',esc(t));});});
var cg=box.querySelector('.mkchg'),cf=box.querySelector('.mkchgf');
if(cg&&cf){cg.addEventListener('click',function(){var o=cf.classList.toggle('hidden');cg.setAttribute('aria-expanded',String(!o));if(!o)cf.querySelector('textarea').focus();});
cf.querySelector('.mkchgx').addEventListener('click',function(){cf.classList.add('hidden');cg.setAttribute('aria-expanded','false');});
cf.addEventListener('submit',function(e){e.preventDefault();var t=cf.querySelector('textarea'),sb=cf.querySelector('button[type=submit]'),v=t.value.trim();if(!v){t.focus();return;}sb.disabled=true;
api('/api/marketing/draft/answer',{rel:rel,change:v}).then(function(r){if(!r||r.error){sb.disabled=false;mkMsg('err',esc((r&&r.error)||'failed'));return;}mkMsg('ok',esc(r.said||'Sent.'));loadMarketing();mkPreview(box,rel);}).catch(function(e2){sb.disabled=false;mkMsg('err',esc(String((e2&&e2.message)||e2)));});});}
box.querySelectorAll('.mkok,.mkskip').forEach(function(b){b.addEventListener('click',function(){var skip=b.classList.contains('mkskip');b.disabled=true;
api('/api/marketing/draft/answer',{rel:rel,skip:skip}).then(function(r){if(!r||r.error){b.disabled=false;mkMsg('err',esc((r&&r.error)||'failed'));return;}mkMsg('ok',esc(r.said||'Done.'));loadMarketing();if(box.classList.contains('repcard'))mkPreview(box,rel);}).catch(function(e){b.disabled=false;mkMsg('err',esc(String((e&&e.message)||e)));});});});}).catch(function(e){box.innerHTML="<div class='note err'>"+esc(String((e&&e.message)||e))+"</div>";});}
// A draft opened large (MKBIG): its pictures and video near full size (a click: one alone,
// arrows or a swipe between them), its whole text in reading type, which product it's for
// and where it goes (LinkedIn, r/ClaudeAI), and Approve, Edit and Skip on it, so nothing
// needs zooming and nothing needs closing first. Esc, its X, or a click outside close it.
// A lane draft ({rel}: marketing.mjs draftPreview) or a post on the board ({post}: POSTS).
var MKBIG=null,MKZOOM=null;
var MKPLAT={hackernews:'Hacker News',blog:'Blog',linkedin:'LinkedIn',reddit:'Reddit',x:'X',twitter:'X',instagram:'Instagram',facebook:'Facebook',threads:'Threads',mastodon:'Mastodon',bluesky:'Bluesky',youtube:'YouTube',tiktok:'TikTok'};
function mkPlat(p){p=String(p||'').toLowerCase();return MKPLAT[p]||(p?p.charAt(0).toUpperCase()+p.slice(1):'');}
function mkBigClose(){var o=$('mkbig');if(o)o.remove();var by=MKBIG&&MKBIG.by;MKBIG=null;if(by&&by.isConnected&&by.focus){try{by.focus({preventScroll:true});}catch(x){}}}
function mkBig(what,by){MKBIG={rel:what.rel||'',post:what.post||'',by:by||document.activeElement,edit:null,say:'',cls:''};var o=$('mkbig');if(!o){o=document.createElement('div');o.id='mkbig';o.className='mkbig';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-labelledby','mkbigt');document.body.appendChild(o);
o.addEventListener('pointerdown',function(ev){o.downOut=ev.target===o;});o.addEventListener('click',function(ev){if(ev.target===o&&o.downOut)mkBigClose();});}
o.innerHTML="<div class='mkbigin'><div class='mkbighead'><h2 id='mkbigt'>Loading&hellip;</h2><button type='button' class='mkbigx' aria-label='Close' title='Close (Esc)'>&times;</button></div></div>";o.querySelector('.mkbigx').addEventListener('click',mkBigClose);o.querySelector('.mkbigx').focus();
mkBigLoad();}
function mkBigLoad(){if(!MKBIG)return;var m=MKBIG;
if(m.post){var x=((POSTS&&POSTS.posts)||[]).filter(function(p){return p.id===m.post;})[0];if(!x){mkBigRender({error:"That draft isn&#39;t waiting any more."});return;}
mkBigRender({kind:'post',x:x,product:mkPostProduct(x.id),platform:'linkedin',title:((POSTS.labels||{})[x.kind])||x.kind,body:x.text,media:(x.media||[]).map(function(a){return {src:pmediaSrc(x,a),kind:a.kind==='video'?'video':'image',name:a.name||a.kind};}),chars:String(x.text||'').length,limit:3000,meta:"Drafted "+agoTxt(x.drafted)+(x.edited?", edited since":"")});return;}
api('/api/marketing/draft?rel='+encodeURIComponent(m.rel)).then(function(p){if(MKBIG!==m)return;if(!p||p.error){mkBigRender({error:esc((p&&p.error)||'failed')});return;}
mkBigRender({kind:'lane',p:p,product:p.product,platform:p.platform,where:p.where,flair:p.flair,handle:p.handle||'',when:p.when,title:p.title,body:p.body,media:(p.media||[]).map(function(a){return {src:mkMediaSrc(a.rel),kind:a.kind,name:a.name};}),missing:p.missing||[],chars:p.chars,limit:/reddit/i.test(p.platform||'')?40000:3000,notes:p.notes,status:p.status,final:p.status==='posted'||p.status==='superseded'});}).catch(function(e){mkBigRender({error:esc(String((e&&e.message)||e))});});}
function mkBigRender(d){var o=$('mkbig');if(!o||!MKBIG)return;var m=MKBIG;m.d=d;var inn=o.querySelector('.mkbigin');
if(d.error){inn.innerHTML="<div class='mkbighead'><h2 id='mkbigt'>Draft</h2><button type='button' class='mkbigx' aria-label='Close' title='Close (Esc)'>&times;</button></div><div class='mkbigbody textonly'><div class='note err'>"+d.error+"</div></div>";inn.querySelector('.mkbigx').addEventListener('click',mkBigClose);return;}
var reddit=/reddit/i.test(d.platform||''),plat=mkPlat(d.platform)||'LinkedIn',to=reddit?esc(d.where||'Reddit'):d.where?plat+' &middot; '+esc(d.where):plat;
var head="<div class='mkbighead'>"+mkProd(d.product)+"<h2 id='mkbigt'>"+esc(reddit?(d.product?d.product+' on Reddit':'A Reddit post'):d.title||'Draft')+"</h2><span class='mkbigto' title='where it goes'>to <b>"+to+"</b>"+(d.flair?" &middot; flair "+esc(d.flair):"")+(d.handle?" &middot; as "+esc(d.handle):"")+(d.when?" &middot; "+esc(d.when):"")+"</span><button type='button' class='mkbigx' aria-label='Close' title='Close (Esc)'>&times;</button></div>";
var ms=d.media||[],i=Math.min(m.at||0,Math.max(0,ms.length-1));m.at=i;
var media=ms.length?"<div class='mkbigmedia'><div class='mkbigmain'>"+(ms[i].kind==='video'?"<video src='"+escQ(ms[i].src)+"' controls playsinline preload='metadata'></video>":"<img src='"+escQ(ms[i].src)+"' alt='"+escQ(ms[i].name||'')+"' title='see it alone (arrows go through them)' tabindex='0'>")+"</div>"
+(ms.length>1?"<div class='mkbigthumbs' role='tablist' aria-label='Its pictures and video'>"+ms.map(function(a,k){return "<button type='button' role='tab' data-k='"+k+"' aria-selected='"+(k===i)+"' class='"+(k===i?'on':'')+"' title='"+escQ(a.name||'')+"'>"+(a.kind==='video'?"<video src='"+escQ(a.src)+"' muted preload='metadata'></video>":"<img src='"+escQ(a.src)+"' alt=''>")+"</button>";}).join('')+"</div>":"")
+((d.missing||[]).length?"<div class='mkbignone'>It also names "+d.missing.map(function(x){return "<code>"+esc(x)+"</code>";}).join(', ')+", which isn&#39;t next to it yet.</div>":"")+"</div>"
:"";
var editing=m.edit!=null,text="<div class='mkbigtext'>"+(!ms.length&&(d.missing||[]).length?"<div class='mkbignone' style='margin-bottom:16px'>Its picture or video, <code>"+d.missing.map(esc).join('</code>, <code>')+"</code>, isn&#39;t next to it yet, so it&#39;d go out without it.</div>":"")+(reddit&&d.title?"<p class='mkbigtitle'><small>Its title</small>"+esc(d.title)+"</p>":"")
+(editing?"<label for='mkbigedit' style='position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)'>Its text</label><textarea id='mkbigedit' maxlength='"+(d.limit||3000)+"'>"+esc(m.edit)+"</textarea>":"<div class='mkbigbodyt'>"+(reddit?mkRdText(d.body):mkTags(d.body))+"</div>")
+"<div class='mkbigmeta'>"+(editing?String(m.edit).length:d.chars)+" / "+(d.limit||3000)+" characters"+(d.meta?" &middot; "+esc(d.meta):"")+"</div>"
+(d.kind==='lane'?"<details class='linotes'><summary>Its notes</summary>"+(d.notes?"<div class='linotest'>"+esc(d.notes)+"</div>":"<div class='muted'>None.</div>")+"</details>":(d.x&&d.x.sources&&d.x.sources.length?"<details class='linotes'><summary>From git: "+d.x.sources.length+" thing"+(d.x.sources.length===1?"":"s")+" it says</summary>"+d.x.sources.map(function(s){return "<div class='linotest'>"+esc(s)+"</div>";}).join('')+"</details>":""))+"</div>";
var st=d.status,done=d.kind==='lane'?(d.final?(st==='posted'?"Posted: it isn&#39;t approved or posted again.":"Superseded: it won&#39;t be posted."):st==='approved'?"Approved: its agent "+(d.when?"schedules":"posts")+" it through Symbiot&#39;s browser, with this text.":st==='skipped'?"Skipped: it won&#39;t be posted.":""):"";
var act=d.final?"":editing?"<button class='act mkbsave'>Save</button><button class='ghost mkbcancel'>Cancel</button>"
:(st==='approved'?"":"<button class='act mkbok'>Approve"+(d.kind==='lane'?(d.when?", schedule it":", post it"):"")+"</button>")+(d.kind==='lane'?"<button class='ghost mkbfile' title='open the draft in your editor'>Edit the file</button>":"<button class='ghost mkbedit' title='change its words here'>Edit</button>")+(st==='skipped'?"":"<button class='ghost mkbskip' title='drop this draft: it won&#39;t be posted'>Skip</button>");
var say=m.say||done||(d.kind==='lane'?(d.when?"Its agent schedules it for "+esc(d.when)+" once you approve.":"Its agent posts it once you approve."):"Approve it and Marketing&#39;s agent schedules it on LinkedIn for the next free day, as it reads here.");
inn.innerHTML=head+"<div class='mkbigbody"+(media?"":" textonly")+"'>"+media+text+"</div><div class='mkbigfoot'>"+act+"<span class='mkbigsay "+(m.cls||'')+"' role='status'>"+say+"</span></div>";
inn.querySelector('.mkbigx').addEventListener('click',mkBigClose);
var mi=inn.querySelector('.mkbigmain img');if(mi){mi.addEventListener('click',function(){mkZoom(ms,m.at,mi);});mi.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();mkZoom(ms,m.at,mi);}});}
inn.querySelectorAll('.mkbigthumbs button').forEach(function(b){b.addEventListener('click',function(){m.at=+b.getAttribute('data-k');mkBigRender(d);var t=$('mkbig')&&$('mkbig').querySelector(".mkbigthumbs button[data-k='"+m.at+"']");if(t)t.focus();});});
var said=function(cls,t){m.cls=cls;m.say=t;var e=inn.querySelector('.mkbigsay');if(e){e.className='mkbigsay '+cls;e.innerHTML=t;}};
var busy=function(b){inn.querySelectorAll('.mkbigfoot button').forEach(function(x){x.disabled=!!b;});};
inn.querySelectorAll('.mkbok,.mkbskip').forEach(function(b){b.addEventListener('click',function(){var skip=b.classList.contains('mkbskip');busy(true);said('',skip?'Skipping it&hellip;':'Approving it&hellip;');
if(d.kind==='post'){var cb=document.querySelector("#boardposts .pcard[data-id='"+m.post+"'] "+(skip?'.pskip':'.papprove'));if(!cb){busy(false);said('err',"Couldn&#39;t find it on the page any more.");return;}cb.click();said('ok',skip?"Skipped: it won&#39;t be posted.":"Approved: Marketing&#39;s agent posts it on LinkedIn, as it reads here.");inn.querySelectorAll('.mkbok,.mkbskip,.mkbedit').forEach(function(x){x.remove();});return;}
api('/api/marketing/draft/answer',{rel:m.rel,skip:skip}).then(function(r){busy(false);if(!r||r.error){said('err',esc((r&&r.error)||'failed'));return;}m.say=esc(r.said||'Done.');m.cls='ok';loadMarketing();mkBigLoad();}).catch(function(e){busy(false);said('err',esc(String((e&&e.message)||e)));});});});
var fb=inn.querySelector('.mkbfile');if(fb)fb.addEventListener('click',function(){api('/api/marketing/open',{rel:m.rel}).then(function(r){said(r&&r.error?'err':'ok',r&&r.error?esc(r.error):"Opened in your editor. Save it there, and this shows the change when you open it again.");});});
var eb=inn.querySelector('.mkbedit');if(eb)eb.addEventListener('click',function(){m.edit=d.body||'';m.say='';mkBigRender(d);var t=$('mkbigedit');if(t)t.focus();});
var ta=inn.querySelector('#mkbigedit');if(ta)ta.addEventListener('input',function(){m.edit=ta.value;var mt=inn.querySelector('.mkbigmeta');if(mt)mt.firstChild.nodeValue=ta.value.length+" / "+(d.limit||3000)+" characters";});
var cc=inn.querySelector('.mkbcancel');if(cc)cc.addEventListener('click',function(){m.edit=null;mkBigRender(d);});
var sv=inn.querySelector('.mkbsave');if(sv)sv.addEventListener('click',function(){PEDIT[m.post]=m.edit;renderPosts();var cb=document.querySelector("#boardposts .pcard[data-id='"+m.post+"'] .psave");if(!cb){said('err',"Couldn&#39;t find it on the page any more.");return;}cb.click();m.edit=null;m.say="Saved.";m.cls='ok';setTimeout(mkBigLoad,900);});}
// One picture (or video) alone, as big as the window: arrows, the buttons or a swipe go
// through the rest of them; Esc, its X or a click beside it close it.
function mkZoom(list,i,by){if(!list||!list.length)return;mkZoomClose();var z=document.createElement('div');z.className='mkzoom';z.setAttribute('role','dialog');z.setAttribute('aria-modal','true');z.setAttribute('aria-label','Picture');document.body.appendChild(z);MKZOOM={list:list,i:Math.max(0,Math.min(i||0,list.length-1)),el:z,by:by||document.activeElement};
var sx=null;z.addEventListener('pointerdown',function(e){sx=e.clientX;z.downOut=e.target===z;});z.addEventListener('pointerup',function(e){if(sx==null)return;var dx=e.clientX-sx;sx=null;if(Math.abs(dx)>50&&MKZOOM&&MKZOOM.list.length>1){mkZoomGo(dx<0?1:-1);z.swiped=true;}});
z.addEventListener('click',function(e){if(z.swiped){z.swiped=false;return;}if(e.target===z&&z.downOut)mkZoomClose();});mkZoomShow();}
function mkZoomShow(){var Z=MKZOOM;if(!Z)return;var a=Z.list[Z.i],n=Z.list.length,z=Z.el;
z.innerHTML=(a.kind==='video'?"<video src='"+escQ(a.src)+"' controls autoplay playsinline></video>":"<img src='"+escQ(a.src)+"' alt='"+escQ(a.name||'')+"' draggable='false'>")+"<button type='button' class='mkzx' aria-label='Close' title='Close (Esc)'>&times;</button>"
+(n>1?"<button type='button' class='mkzp' aria-label='Previous' title='Previous (&larr;)'>&lsaquo;</button><button type='button' class='mkzn' aria-label='Next' title='Next (&rarr;)'>&rsaquo;</button>":"")+"<div class='mkzc'>"+(n>1?(Z.i+1)+" of "+n+(a.name?" &middot; ":""):"")+esc(a.name||'')+"</div>";
z.querySelector('.mkzx').addEventListener('click',mkZoomClose);var p=z.querySelector('.mkzp'),q=z.querySelector('.mkzn');if(p)p.addEventListener('click',function(){mkZoomGo(-1);});if(q)q.addEventListener('click',function(){mkZoomGo(1);});(q||z.querySelector('.mkzx')).focus();}
function mkZoomGo(d){var Z=MKZOOM;if(!Z)return;Z.i=(Z.i+d+Z.list.length)%Z.list.length;mkZoomShow();if(MKBIG&&MKBIG.d&&Z.by&&Z.by.closest&&Z.by.closest('#mkbig'))MKBIG.at=Z.i;}
function mkZoomClose(){var Z=MKZOOM;MKZOOM=null;if(!Z)return;Z.el.remove();if(MKBIG&&MKBIG.d&&Z.by&&Z.by.closest&&Z.by.closest('#mkbig')){mkBigRender(MKBIG.d);var mi=$('mkbig')&&$('mkbig').querySelector('.mkbigmain img');if(mi)mi.focus();}else if(Z.by&&Z.by.isConnected&&Z.by.focus){try{Z.by.focus({preventScroll:true});}catch(x){}}}
// Esc closes the picture first, then the draft; arrows go through the pictures
if(document.addEventListener)document.addEventListener('keydown',function(e){if(MKZOOM){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();mkZoomClose();}else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();mkZoomGo(e.key==='ArrowRight'?1:-1);}return;}
if(MKBIG){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();mkBigClose();return;}var d=MKBIG.d,t=e.target;if(d&&(d.media||[]).length>1&&(e.key==='ArrowRight'||e.key==='ArrowLeft')&&!(t&&t.closest&&t.closest('textarea,input,select,video'))){e.preventDefault();MKBIG.at=((MKBIG.at||0)+(e.key==='ArrowRight'?1:-1)+d.media.length)%d.media.length;mkBigRender(d);}}},true);
function renderMkLane(){var L=(MKT&&MKT.lane)||null,nd=$('mkneeds'),el=$('mktasks');if(!nd||!el)return;if(!L){nd.innerHTML='';el.innerHTML='';return;}
var ns=L.needs||[],lbl={ask:'Answer',approve:'Review',draft:'Show it',post:'Preview'},kind={ask:'its agent asks',approve:'waits for your OK',draft:'a draft to post',post:'a post to approve'};
nd.innerHTML=ns.length?"<div class='mkneeds"+(MKLIT?" lit":"")+"'><div class='pshead'><span>Needs you &middot; "+ns.length+"</span><small>only you can do these</small></div>"+ns.map(function(n,i){return "<div class='task mkneed' data-i='"+i+"'"+(n.kind==='post'?" data-rel='"+escQ(n.rel)+"' title='open it large'":"")+"><span class='t'>"+mkProd(n.product)+esc(n.text)+" <span class='muted' style='font-size:11px'>"+kind[n.kind]+"</span></span><button class='"+(i?'ghost':'act')+" mkact'>"+lbl[n.kind]+"</button></div>";}).join('')+"</div>":'';
nd.querySelectorAll('.mkact').forEach(function(b){b.addEventListener('click',function(){var n=ns[+b.closest('.mkneed').getAttribute('data-i')];if(!n)return;
if(n.kind==='post'){mkBig({rel:n.rel},b);return;}
if(n.kind==='draft'){var c=document.querySelector("#boardposts .pcard[data-id='"+n.id.slice(6)+"']");if(c){document.querySelectorAll('#panel-marketing .lit').forEach(function(x){if(x!==c)x.classList.remove('lit');});c.classList.add('lit');if(c.scrollIntoView)c.scrollIntoView({block:'center',behavior:'smooth'});}return;}
lqFocus({kind:'proj',repo:'marketing'});});});
nd.querySelectorAll('.mkneed[data-rel]').forEach(function(r){r.addEventListener('click',function(ev){if(ev.target.closest('button,a,input,select,textarea'))return;mkBig({rel:r.getAttribute('data-rel')},r);});});
var prods=L.products||[],ln=L.lane||[],els=L.elsewhere||[],fs=L.files||[],st={waiting:'waiting',working:'its agent is at work',review:'done, waits for your OK'};
var h="<div class='pshead'><span>Marketing lane</span><small>"+(ln.length?ln.length+" task"+(ln.length>1?"s":"")+(L.working?" &middot; its agent is at work":L.waiting?" &middot; "+L.waiting+" waiting for its agent":""):"Its own agent, for every product: tell it what to make, and say which product it&#39;s for.")+"</small></div>"
+"<form class='row mkadd'><label class='mkl' for='mkprod'>Product</label><input id='mkprod' class='mkprod' list='mkprodlist' autocomplete='off' placeholder='Symbiot, Bookly&hellip;' maxlength='40'><datalist id='mkprodlist'>"+prods.map(function(p){return "<option value='"+escQ(p)+"'>";}).join('')+"</datalist><label class='mkl' for='mktext' style='position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)'>Task</label><input id='mktext' class='mktext' autocomplete='off' placeholder='A launch post, a demo video, a campaign&hellip;' maxlength='4000'><button type='submit' class='act'>Add</button></form>"
+ln.map(function(t){return "<div class='task' data-id='"+escQ(t.id)+"'><span class='t'>"+mkProd(t.product)+esc(t.text)+" <span class='muted' style='font-size:11px'>"+st[t.status]+"</span></span><button class='ghost mkopen' data-repo='marketing' title='open it on the Workdesk'>Open</button></div>";}).join('')
+(L.waiting&&!L.working?"<div class='row'><button class='act mkgo'>Start its agent</button><span class='muted' style='font-size:12px'>it drafts; nothing is posted until you approve its preview</span></div>":"")
+(fs.length?"<div class='pshead' style='margin-top:14px'><span>What its agent drafted</span><small>in the lane&#39;s folder, newest first</small></div>"+fs.slice(0,10).map(function(f){return "<div class='task' data-rel='"+escQ(f.rel)+"'><span class='t'>"+mkProd(f.product)+esc(f.name)+" <span class='muted' style='font-size:11px'>"+agoTxt(f.at)+"</span>"+(f.status?" <span class='mkst "+f.status+"'>"+esc(f.status)+"</span>":"")+"</span><button class='"+(MKPV===f.rel?'act':'ghost')+" mkprev' aria-expanded='"+(MKPV===f.rel)+"' title='see it as the post will look'>"+(MKPV===f.rel?'Hide':'Preview')+"</button></div><div class='mkpv"+(MKPV===f.rel?'':' hidden')+"' data-rel='"+escQ(f.rel)+"'></div>";}).join(''):"")
+(els.length?"<div class='pshead' style='margin-top:14px'><span>About marketing, in other projects</span><small>Move one here and Marketing&#39;s agent takes it, for its product</small></div>"+els.map(function(t){return "<div class='task' data-id='"+escQ(t.id)+"'><span class='t'>"+mkProd(t.product)+esc(t.text)+" <span class='muted' style='font-size:11px'>"+esc(t.name||t.repo||'no project')+"</span></span><button class='ghost mkmove'>Move to Marketing</button><button class='ghost mkopen' data-repo='"+escQ(t.repo||'')+"' title='open its project on the Workdesk'>Open</button></div>";}).join(''):"");
var keep=document.activeElement,typed=keep&&keep.closest&&keep.closest('#mktasks .mkadd')?[($('mkprod')||{}).value,($('mktext')||{}).value,keep.id]:null;
el.innerHTML=h;if(typed){$('mkprod').value=typed[0]||'';$('mktext').value=typed[1]||'';var f0=$(typed[2]);if(f0&&f0.focus)f0.focus();}
var fm=el.querySelector('.mkadd');if(fm)fm.addEventListener('submit',function(ev){ev.preventDefault();var t=$('mktext'),pr=$('mkprod'),bt=fm.querySelector('button');if(!t.value.trim()){t.focus();return;}bt.disabled=true;
api('/api/marketing/task',{text:t.value,product:pr.value}).then(function(r){bt.disabled=false;if(!r||r.error){mkMsg('err',esc((r&&r.error)||'failed'));return;}mkMsg('ok',r.duplicate?"It&#39;s on Marketing&#39;s list already.":"Added to Marketing"+(pr.value?" for "+esc(pr.value):"")+". Start its agent when you&#39;re ready.");t.value='';loadMarketing();}).catch(function(e){bt.disabled=false;mkMsg('err',esc(String((e&&e.message)||e)));});});
el.querySelectorAll('.mkopen').forEach(function(b){b.addEventListener('click',function(){TFILTER.id='';TFILTER.repo=b.getAttribute('data-repo')||'';TFILTER.type='';lqPool('tasks');if(typeof loadTasks==='function')loadTasks();});});
el.querySelectorAll('.mkmove').forEach(function(b){b.addEventListener('click',function(){var id=b.closest('.task').getAttribute('data-id');b.disabled=true;api('/api/marketing/move',{id:id}).then(function(r){if(!r||r.error){b.disabled=false;mkMsg('err',esc((r&&r.error)||'failed'));return;}mkMsg('ok',"Moved to Marketing: its agent takes it from now on.");loadMarketing();});});});
el.querySelectorAll('.mkprev').forEach(function(b){b.addEventListener('click',function(){var rel=b.closest('.task').getAttribute('data-rel');MKPV=MKPV===rel?'':rel;renderMkLane();});});
el.querySelectorAll('.task[data-rel]').forEach(function(r){r.title='open it large';r.addEventListener('click',function(ev){if(ev.target.closest('button,a,input,select,textarea'))return;mkBig({rel:r.getAttribute('data-rel')},r);});});
if(MKPV){var pv=null;el.querySelectorAll('.mkpv').forEach(function(x){if(x.getAttribute('data-rel')===MKPV)pv=x;});if(pv)mkPreview(pv,MKPV);else MKPV='';}
var g=el.querySelector('.mkgo');if(g)g.addEventListener('click',function(){g.disabled=true;api('/api/marketing/go',{}).then(function(r){if(!r||r.error){g.disabled=false;mkMsg('err',esc((r&&r.error)||'It didn&#39;t start.'));return;}mkMsg('ok',r.queued?"Its agent takes them once the run there now finishes.":"Marketing&#39;s agent started. It&#39;s on the Workdesk, and what it drafts waits here for your OK.");loadMarketing();}).catch(function(e){g.disabled=false;mkMsg('err',esc(String((e&&e.message)||e)));});});
if(MKLIT){MKLIT=false;var lit=nd.querySelector('.mkneeds');if(lit&&lit.scrollIntoView)lit.scrollIntoView({block:'start'});}}
// The pick tray (tray.mjs): every capture its agent took of a product, blurred where it
// shows something private. Its blur boxes sit on it, solid where it's blurred and dashed
// where it shows; a click switches one (a clip's box at the same place in each moment, at
// once) and the capture is blurred again. Use puts it on a post (its media: line) in one
// click: the posts it was taken for each have a button, any other is in the list.
var MKTRAY=null;
function loadMkTray(){api('/api/marketing/tray').then(function(d){if(d&&!d.error){MKTRAY=d.trays||[];MKPRODUCTS=d.products||[];renderMkTray();}});}
function mkTraySrc(rel,at){return '/api/marketing/tray/media?rel='+encodeURIComponent(rel)+'&v='+Math.round(at||0)+'&t='+encodeURIComponent(T);}
// a capture's boxes, one a place: a clip has the same box in each moment it shows there
function mkBoxes(c){var g={},out=[];(c.regions||[]).forEach(function(r){var k=[r.x,r.y,r.w,r.h].join();if(!g[k]){g[k]={x:r.x,y:r.y,w:r.w,h:r.h,kind:r.kind,ids:[],on:0};out.push(g[k]);}g[k].ids.push(r.id);if(r.on)g[k].on++;});out.forEach(function(b){b.all=b.on===b.ids.length;});return out;}
var MKKIND={still:'Picture',clip:'Clip',reel:'Reel'};
// Capture a product: Symbiot takes its key screens itself (capture.mjs), blurred before they reach the tray
var MKPRODUCTS=[],MKCAPBUSY=false,MKCAP={sel:0,url:'',cls:'',say:''}; // kept through a redraw
function mkCapRow(){
return "<div class='pshead'><span>Capture a product</span><small>Symbiot opens it in a browser of its own, takes its key screens as pictures and short clips, and blurs anything private before it reaches the tray: names, emails, numbers, keys, what&#39;s typed in, chats, faces and pictures. No demo video needed.</small></div>"
+"<div class='mkcaprow'>"+(MKPRODUCTS.length?"<select id='mkcapp' aria-label='Product to capture'>"+MKPRODUCTS.map(function(p,i){return "<option value='"+i+"'"+(i===MKCAP.sel?" selected":"")+">"+esc(p.name)+(p.tray?" (has a tray)":"")+"</option>";}).join('')+"</select>":"<input id='mkcapname' placeholder='Its name' aria-label='Product to capture' autocomplete='off' value='"+escQ(MKCAP.name||'')+"' style='flex:0 1 160px'>")
+"<input id='mkcapurl' placeholder='Its address, if not running here' title='Its address, if it isnplaceholder='Its address, if it isn&#39;t running here (http://localhost:3000)' aria-label='Its address'#39;t running here: http://localhost:3000, or where itplaceholder='Its address, if it isn&#39;t running here (http://localhost:3000)' aria-label='Its address'#39;s deployed' aria-label='Its address' autocomplete='off' value='"+escQ(MKCAP.url)+"'><button type='button' class='act' id='mkcapgo'"+(MKCAPBUSY?" disabled":"")+">"+(MKCAPBUSY?"Capturing&hellip;":"Capture")+"</button><div class='mkcapst"+(MKCAP.cls?" "+MKCAP.cls:"")+"' id='mkcapst' role='status'>"+esc(MKCAP.say)+"</div></div>";}
function renderMkTray(){var el=$('mktray');if(!el)return;var ts=MKTRAY||[];
var h=ts.map(function(t,ti){var open=(t.drafts||[]).filter(function(d){return d.status!=='posted'&&d.status!=='superseded';});
return "<div class='pshead'><span>Pick tray &middot; "+esc(t.product)+"</span><small>"+t.items.length+" capture"+(t.items.length===1?"":"s")+", blurred where "+(t.items.length===1?"it shows":"they show")+" something private. Click a box to blur it or show it; Use puts one on a post.</small></div><div class='mktray'>"
+t.items.map(function(c,ci){var bx=mkBoxes(c),n=bx.filter(function(b){return b.all;}).length;
var shot=c.show?(c.showKind==='video'?"<video src='"+escQ(mkTraySrc(c.show,c.at))+"' muted loop playsinline controls preload='metadata'></video>":"<img src='"+escQ(mkTraySrc(c.show,c.at))+"' alt='"+escQ(c.caption||c.name)+"' loading='lazy'>"):"<div class='muted' style='padding:20px;line-height:1.4'>Not rendered yet.</div>";
shot+=bx.map(function(b,bi){var p=function(v){return Math.round(v*10000)/100+'%';};return "<button type='button' class='mkbox"+(b.all?" on":"")+"' data-b='"+bi+"' aria-pressed='"+b.all+"' style='left:"+p(b.x)+";top:"+p(b.y)+";width:"+p(b.w)+";height:"+p(b.h)+"' title='"+escQ(b.kind+(b.all?": blurred. Click to show it":": shown. Click to blur it"))+"' aria-label='"+escQ(b.kind+(b.all?", blurred":", shown"))+"'></button>";}).join('');
var fr=(c.for||[]).map(function(f){return t.folder+'/'+f;}),mine=open.filter(function(d){return fr.indexOf(d.rel)>=0;}),rest=open.filter(function(d){return fr.indexOf(d.rel)<0;});
var look=c.review?"<div class='mkreview'><span>"+esc(c.review)+"</span><button type='button' class='ghost mklooked'>Looked it over</button></div>":"";
var use=c.review?"":c.use?mine.map(function(d){var di=t.drafts.indexOf(d);return (d.media||[]).indexOf(c.use)>=0?"<span class='mkst approved' title='its picture or video now'>on "+esc(d.name)+"</span>":"<button type='button' class='ghost mkuseb' data-d='"+di+"'>Use for "+esc(d.name)+"</button>";}).join('')
+(rest.length?"<select class='mkusel' aria-label='Use it for another post'><option value=''>"+(mine.length?"Another post":"Use for a post")+"&hellip;</option>"+rest.map(function(d){return "<option value='"+t.drafts.indexOf(d)+"'"+((d.media||[]).indexOf(c.use)>=0?" disabled":"")+">"+esc(d.name)+((d.media||[]).indexOf(c.use)>=0?" (on it)":"")+"</option>";}).join('')+"</select>":""):"";
var canDraw=c.blur&&c.kind!=='reel'&&c.show,big=c.show?"<button type='button' class='ghost mkbigb' title='see it large: arrows go through the tray'>Open large</button>":"";
return "<div class='mkcap' data-t='"+ti+"' data-c='"+ci+"'><div class='mkshot'>"+shot+(canDraw?"<div class='mkdrawpad' aria-hidden='true'></div>":"")+"</div><div class='mkcapt'>"+esc(c.caption||c.name)+"</div><div class='mkcapm'>"+esc(MKKIND[c.kind]||c.kind)+(c.screen?" &middot; "+esc(c.screen):"")+(bx.length?" &middot; "+n+" of "+bx.length+" box"+(bx.length===1?"":"es")+" blurred":c.kind==='reel'?" &middot; its clips&#39; blur":" &middot; nothing to blur")+"</div>"+(bx.length?"<div class='mkchips'>"+bx.map(function(b,bi){var hand=(c.regions||[]).filter(function(r){return r.hand&&[r.x,r.y,r.w,r.h].join()===[b.x,b.y,b.w,b.h].join();})[0];
return "<span style='display:inline-flex;align-items:center'><button type='button' class='mkchip"+(b.all?" on":"")+"' data-b='"+bi+"' aria-pressed='"+b.all+"' title='"+escQ(b.all?"blurred: click to show it":"shown: click to blur it")+"'>"+esc(b.kind)+(b.all?" &middot; blurred":" &middot; shown")+"</button>"+(hand?"<button type='button' class='mkchipx' data-id='"+escQ(String(hand.id))+"' title='Remove this box you drew' aria-label='Remove this box you drew'>&times;</button>":"")+"</span>";}).join('')+"</div>":"")
+look+(use?"<div class='mkuse'>"+use+"</div>":"")+(canDraw||big?"<div class='mkuse'>"+big+(canDraw?"<button type='button' class='ghost mkdraw' aria-pressed='false' title='Drag across the capture to blur that part too'>Draw a blur box</button><span class='mkcapst2' role='status'></span>":"")+"</div>":"")+"</div>";}).join('')+"</div>";}).join('');
h=mkCapRow()+h;
if(sameHtml(el,h))return;
var at=function(x){var c=x.closest('.mkcap');return {t:ts[+c.getAttribute('data-t')],c:ts[+c.getAttribute('data-t')].items[+c.getAttribute('data-c')],el:c};};
el.querySelectorAll('.mkchip').forEach(function(c){var box=function(){return c.closest('.mkcap').querySelector(".mkbox[data-b='"+c.getAttribute('data-b')+"']");};c.addEventListener('mouseenter',function(){var x=box();if(x)x.classList.add('hl');});c.addEventListener('mouseleave',function(){var x=box();if(x)x.classList.remove('hl');});});
el.querySelectorAll('.mkbox,.mkchip').forEach(function(b){b.addEventListener('click',function(){var a=at(b),g=mkBoxes(a.c)[+b.getAttribute('data-b')];if(!g||a.el.classList.contains('busy'))return;a.el.classList.add('busy');
api('/api/marketing/tray/blur',{tray:a.t.rel,name:a.c.name,id:g.ids,on:!g.all}).then(function(r){a.el.classList.remove('busy');if(!r||r.error){mkMsg('err',esc((r&&r.error)||'failed'));return;}
mkMsg(r.rendered?'ok':'err',r.rendered?(g.all?"Shown: that box isn&#39;t blurred in it now.":"Blurred: that box is blurred in it now."):"Saved, but it isn&#39;t "+(g.all?"shown":"blurred")+" in the picture yet: "+esc(r.note||'it couldn&#39;t be blurred'));loadMkTray();}).catch(function(e){a.el.classList.remove('busy');mkMsg('err',esc(String((e&&e.message)||e)));});});});
var useIt=function(x,d){var a=at(x),dr=a.t.drafts[d];if(!dr)return;x.disabled=true;
api('/api/marketing/tray/use',{rel:dr.rel,file:a.c.use}).then(function(r){x.disabled=false;if(!r||r.error){mkMsg('err',esc((r&&r.error)||'failed'));return;}mkMsg('ok',"&ldquo;"+esc(dr.name)+"&rdquo; now shows "+esc(a.c.caption||a.c.name)+"."+(r.reopened?" It was approved with another, so it asks for your OK again.":""));loadMarketing();}).catch(function(e){x.disabled=false;mkMsg('err',esc(String((e&&e.message)||e)));});};
el.querySelectorAll('.mkuseb').forEach(function(b){b.addEventListener('click',function(){useIt(b,+b.getAttribute('data-d'));});});
// a capture large, alone: a click on its picture (not on a box), or Open large; arrows go through its tray
var zoomAt=function(x){var a=at(x),shown=a.t.items.filter(function(c){return c.show;});mkZoom(shown.map(function(c){return {src:mkTraySrc(c.show,c.at),kind:c.showKind==='video'?'video':'image',name:c.caption||c.name};}),Math.max(0,shown.indexOf(a.c)),x);};
el.querySelectorAll('.mkshot img').forEach(function(im){im.addEventListener('click',function(){if(!im.closest('.mkcap').classList.contains('drawing'))zoomAt(im);});});
el.querySelectorAll('.mkbigb').forEach(function(b){b.addEventListener('click',function(){zoomAt(b);});});
el.querySelectorAll('.mkusel').forEach(function(s){s.addEventListener('change',function(){if(s.value!=='')useIt(s,+s.value);});});
// looked over: then it can go on a post
el.querySelectorAll('.mklooked').forEach(function(b){b.addEventListener('click',function(){var a=at(b);b.disabled=true;
api('/api/marketing/tray/reviewed',{tray:a.t.rel,name:a.c.name}).then(function(r){b.disabled=false;if(!r||r.error){mkMsg('err',esc((r&&r.error)||'failed'));return;}loadMkTray();}).catch(function(){b.disabled=false;});});});
// a box you drew, removed
el.querySelectorAll('.mkchipx').forEach(function(b){b.addEventListener('click',function(){var a=at(b);if(a.el.classList.contains('busy'))return;a.el.classList.add('busy');
api('/api/marketing/tray/box',{tray:a.t.rel,name:a.c.name,remove:b.getAttribute('data-id')}).then(function(r){a.el.classList.remove('busy');if(!r||r.error){mkMsg('err',esc((r&&r.error)||'failed'));return;}loadMkTray();}).catch(function(){a.el.classList.remove('busy');});});});
// Draw a blur box: drag across the capture; the box is blurred in it (a clip: all the way through)
el.querySelectorAll('.mkdraw').forEach(function(b){b.addEventListener('click',function(){var card=b.closest('.mkcap'),on=!card.classList.contains('drawing');card.classList.toggle('drawing',on);b.setAttribute('aria-pressed',on?'true':'false');b.textContent=on?'Cancel drawing':'Draw a blur box';
var st=card.querySelector('.mkcapst2');if(st){st.className='mkcapst2';st.textContent=on?'Drag across what to blur.':'';}});});
el.querySelectorAll('.mkdrawpad').forEach(function(pad){var card=pad.closest('.mkcap'),shot=card.querySelector('.mkshot'),st=card.querySelector('.mkcapst2'),start=null,box=null;
var pt=function(e){var r=shot.getBoundingClientRect();return {x:Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),y:Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))};};
var place=function(a,c){var x=Math.min(a.x,c.x),y=Math.min(a.y,c.y),w=Math.abs(a.x-c.x),hh=Math.abs(a.y-c.y);box.style.left=(x*100)+'%';box.style.top=(y*100)+'%';box.style.width=(w*100)+'%';box.style.height=(hh*100)+'%';return {x:x,y:y,w:w,h:hh};};
pad.addEventListener('pointerdown',function(e){e.preventDefault();start=pt(e);box=document.createElement('div');box.className='mkdrawn';shot.appendChild(box);place(start,start);try{pad.setPointerCapture(e.pointerId);}catch(x){}});
pad.addEventListener('pointermove',function(e){if(start)place(start,pt(e));});
pad.addEventListener('pointerup',function(e){if(!start)return;var bx=place(start,pt(e));start=null;var a=at(pad);
if(bx.w<0.01||bx.h<0.01){box.remove();if(st){st.className='mkcapst2 err';st.textContent='Drag across what to blur: that was a click.';}return;}
card.classList.add('busy');if(st){st.className='mkcapst2';st.textContent='Blurring it…';}
api('/api/marketing/tray/box',{tray:a.t.rel,name:a.c.name,box:bx}).then(function(r){card.classList.remove('busy');if(!r||r.error){box.remove();if(st){st.className='mkcapst2 err';st.textContent=(r&&r.error)||'failed';}return;}
mkMsg(r.rendered?'ok':'err',r.rendered?"Blurred: the box you drew is blurred in it now.":"Saved, but it isn&#39;t blurred in it yet: "+esc(r.note||'it couldn&#39;t be blurred'));card.classList.remove('drawing');loadMkTray();}).catch(function(x){card.classList.remove('busy');box.remove();if(st){st.className='mkcapst2 err';st.textContent=String((x&&x.message)||x);}});});});
// Capture: one product at a time, a minute or two; what it says shows under the button
var cs=$('mkcapp'),cu=$('mkcapurl'),cn=$('mkcapname');if(cs)cs.addEventListener('change',function(){MKCAP.sel=+cs.value;});if(cn)cn.addEventListener('input',function(){MKCAP.name=cn.value;});if(cu)cu.addEventListener('input',function(){MKCAP.url=cu.value;});
var say=function(cls,t){MKCAP.cls=cls;MKCAP.say=t;var st=$('mkcapst');if(st){st.className='mkcapst'+(cls?' '+cls:'');st.textContent=t;}};
var go=$('mkcapgo');if(go)go.addEventListener('click',function(){var p=cs?MKPRODUCTS[+cs.value]:{name:(cn&&cn.value||'').trim()};if(MKCAPBUSY)return;if(!p||!p.name){say('err','Say which product: its name.');return;}MKCAPBUSY=true;go.disabled=true;go.textContent='Capturing…';say('','Capturing '+p.name+': its key screens, a picture each and a few short clips, blurred before they reach the tray. A minute or two.');
api('/api/marketing/capture',{product:p.name,url:($('mkcapurl').value||'').trim()}).then(function(r){MKCAPBUSY=false;var g=$('mkcapgo');if(g){g.disabled=false;g.textContent='Capture';}
if(!r||r.error){say('err',(r&&r.error)||'It didn’t capture.');return;}
say('ok',r.note+(r.skipped||[]).map(function(x){return x.clip?' No clip of '+x.path+': '+x.why+'.':' Skipped '+x.path+': '+x.why+'.';}).join('')+(r.seed?' It has demo data ('+r.seed+'): capture with that loaded, not real data.':''));loadMkTray();}).catch(function(x){MKCAPBUSY=false;var g=$('mkcapgo');if(g){g.disabled=false;g.textContent='Capture';}say('err',String((x&&x.message)||x));});});}
var MKDAY=function(s){var d=new Date(s+'T00:00:00');return isNaN(d)?s:d.toLocaleDateString(undefined,{day:'numeric',month:'short'});};
// The overview at the top (mkoverview.mjs): a card a product, then the newest weekly report pinned.
function mkDate(ms){var d=new Date(ms);return d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}).replace(',','')+', '+d.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit',hour12:false});}
function renderMkOver(){var el=$('mkover');if(!el)return;var o=MKT&&MKT.overview;if(!o){el.innerHTML='';return;}
var nn=function(n){return n==null?"<span class='mkno'>No numbers yet</span>":'<strong>'+n.toLocaleString('en-ZA')+'</strong>';};
var h="<div class='pshead' style='margin-top:16px'><span>Marketing overview</span><small>By product: what is scheduled, what waits on you, and the week&#39;s numbers.</small></div>";
if(!o.products.length)h+="<div class='note'>Nothing scheduled or waiting yet. When Marketing&#39;s agent schedules a post or drafts one for you, it shows here under its product.</div>";
else h+="<div class='mkov'>"+o.products.map(function(p){var t=p.total;
return "<section class='mkoc' aria-label='"+escQ(p.name)+"'><h3>"+esc(p.name)+"</h3>"
+"<div><h4>Scheduled</h4>"+(p.scheduled.length?"<ul>"+p.scheduled.map(function(x){return "<li><b>"+esc(x.title)+"</b><span class='mkwhen'>"+esc(mkDate(x.when))+" &middot; "+esc(x.platform)+"</span></li>";}).join('')+"</ul>":"<span class='mkno'>Nothing scheduled.</span>")+"</div>"
+"<div class='mkwait'><h4>Waiting on your approval</h4>"+(p.waiting.length?"<ul>"+p.waiting.map(function(x){return "<li>"+esc(x.title)+"</li>";}).join('')+"</ul>":"<span class='mkno'>Nothing waiting.</span>")+"</div>"
+"<div><h4>This week</h4>"+(t?"<div class='mkstats'><div>"+nn(t.reach)+"<small>reach</small></div><div>"+nn(t.reactions)+"<small>reactions</small></div><div>"+nn(t.clicks)+"<small>clicks</small></div></div><ul style='margin-top:8px'>"+p.numbers.map(function(x){return "<li>"+esc(x.title)+"<span class='mkwhen'>"+(x.reach!=null?x.reach.toLocaleString('en-ZA')+' reach':'no reach numbers yet')+' &middot; '+(x.reactions!=null?x.reactions+' reactions':'no reaction numbers yet')+(x.clicks!=null?' &middot; '+x.clicks+' clicks':'')+"</span></li>";}).join('')+"</ul>":"<span class='mkno'>no numbers yet</span>")+"</div></section>";}).join('')+"</div>";
if(o.open&&o.open.length)h+="<p class='mkopen'><b>Open:</b> "+o.open.map(function(x){return (x.tag?esc(x.tag)+': ':'')+esc(x.text);}).join(' &middot; ')+"</p>";
var r=o.report;
h+=r?"<div class='mkrep'><div><small>Latest weekly report</small><h3>"+esc(r.title)+"</h3>"+(r.result?"<p>"+esc(r.result.charAt(0).toUpperCase()+r.result.slice(1))+"</p>":'')+"</div>"+(r.id?"<button class='ghost mkrepgo'>Open the full report</button>":'')+"</div>":"<div class='mkrep'><div><small>Latest weekly report</small><p class='mkno'>No weekly report yet. When Marketing&#39;s agent writes one, the newest is pinned here.</p></div></div>";
el.innerHTML=h;var g=el.querySelector('.mkrepgo');if(g)g.addEventListener('click',function(){showReport(r.id);});}
function renderMarketing(){var d=MKT,r=$('mkreplies'),t=$('mktest');renderMkOver();if(!d||!r||!t)return;var rs=d.replies||[];
r.innerHTML="<div class='pshead'><span>Replies</span><small>"+(!d.linkedin?"Link LinkedIn, and comments on and mentions of your posts show here, marked when they may be a customer.":rs.length?"On LinkedIn in the last 30 days. Draft a reply leaves one in the comment box for you to post.":"None on LinkedIn in the last 30 days. Comments on and mentions of your posts show here, marked when they may be a customer.")+"</small></div>"
+rs.map(function(n){return "<div class='task' data-id='"+escQ(n.id)+"'><span class='t'>"+esc(n.text)+custTag(n)+" <span class='muted' style='font-size:11px'>"+agoTxt(n.ts)+"</span></span><button class='ghost mkdraft' title='your agent drafts a reply in your voice and leaves it in the comment box, never posted'>Draft a reply</button></div>";}).join('');
r.querySelectorAll('.mkdraft').forEach(function(b){b.addEventListener('click',function(){var id=b.closest('.task').getAttribute('data-id');b.disabled=true;
api('/api/watch/draft',{id:id}).then(function(x){b.disabled=false;mkMsg(x&&!x.error?'ok':'err',x&&!x.error?DRAFTING_SOCIAL:esc((x&&x.error)||'failed'));}).catch(function(e){b.disabled=false;mkMsg('err',esc(String((e&&e.message)||e)));});});});
var T4=d.test;if(!T4){t.innerHTML='';return;}
var pk=(T4.packages||[]).join(', '),now=T4.week,over=T4.rows.every(function(x){return x.over;});
var cell=function(x,v,extra){return x.started?"<td class='n'>"+v+(extra?" <span class='muted'>("+extra+")</span>":"")+"</td>":"<td class='n muted'>&ndash;</td>";};
var h="<div class='pshead'><span>The 4-week test</span><small>"+(over?"Done: "+MKDAY(T4.start)+" to "+MKDAY(T4.end)+".":now?"Week "+now+" of 4 ("+MKDAY(T4.start)+" to "+MKDAY(T4.end)+").":"Starts "+MKDAY(T4.start)+", runs to "+MKDAY(T4.end)+".")+" Does posting bring anyone? Real replies, installs or pricing questions say it does.</small></div>"
+"<div class='mkwrap'><table class='mktab'><thead><tr><th>Week</th><th>Posts published</th><th>Replies</th><th title='LinkedIn&#39;s own count: Who viewed your profile'>Profile visits</th><th"+(pk?" title='npm downloads of "+escQ(pk)+"'":"")+">Installs</th><th>Pricing questions</th></tr></thead><tbody>"
+T4.rows.map(function(x){return "<tr"+(x.started?"":" class='later'")+(x.started&&!x.over?" aria-current='true'":"")+"><td><b>"+x.week+"</b> <span class='muted'>"+MKDAY(x.from)+"&ndash;"+MKDAY(x.to)+"</span></td>"
+cell(x,x.published,x.media?x.media+" with a picture":"")+cell(x,x.replies,x.customers?x.customers+" maybe a customer":"")
+(x.started?"<td class='n muted' title='LinkedIn&#39;s own count: its analytics on each post, and Who viewed your profile'>on LinkedIn</td>":"<td class='n muted'>&ndash;</td>")
+cell(x,x.installs==null?"&ndash;":Number(x.installs).toLocaleString())+cell(x,x.pricing)+"</tr>";}).join('')+"</tbody></table></div>"
+"<div class='muted' style='font-size:12px;margin-top:6px'>"+(pk?"Installs: npm downloads of "+esc(pk)+". Releases, mirrors and CI download too, so trust replies and pricing questions more. ":"")+"Replies and pricing questions come from LinkedIn&#39;s notifications, which Symbiot watches once LinkedIn is linked.</div>";
t.innerHTML=h;}
`;
