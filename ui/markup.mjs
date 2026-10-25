// symbiot — the page's markup: the header, every panel and its controls.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `</style></head><body>
<div id="onb" class="onb hidden" role="dialog" aria-modal="true" aria-labelledby="onbt"><div class="onbin"><div class="onbdots" id="onbdots"></div><div id="onbbody"></div></div></div>
<div id="liquid" aria-label="Symbiot">
<canvas id="lq" aria-hidden="true"></canvas>
<div id="lqorbits"></div>
<div id="lqline" aria-live="polite"></div>
<div id="phhome" role="region" aria-label="Home"><nav id="phnav" aria-label="The rest of Symbiot"></nav><div id="phpc"></div></div>
<button type="button" id="lqprojects" aria-controls="lqrelay" aria-expanded="false">Projects</button>
<div id="lqrelay" role="region" aria-label="Your projects: what their agents did, ask and suggest"></div>
<div id="lqgroups"></div>
<div id="lqneedt"><span>Needs you</span><small>only you can do these</small></div>
<div id="lqnext" role="region" aria-label="What can be done next"></div>
<div id="lqdrops"></div>
<button type="button" id="lqback">&lsaquo; Home</button>
<h2 id="lqscene"></h2>
<span id="lqsort" role="radiogroup" aria-label="Order the projects"><button type="button" role="radio" data-sort="need" aria-checked="true">Needs you</button><button type="button" role="radio" data-sort="recent" aria-checked="false">Recent</button><button type="button" role="radio" data-sort="name" aria-checked="false">A&ndash;Z</button></span>
<button type="button" id="lqgo" title="start every task that's waiting, each in its repo's agent"></button>
<button type="button" id="lqcore" title="talk to Symbiot"></button>
<div id="lqmore"></div>
<div id="lqtalk" aria-live="polite"></div>
<div id="lqtalkbar"></div>
<div id="lqatts" aria-live="polite"></div>
<form id="lqform" class="lqglass"><label for="lqask" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Talk to Symbiot</label><textarea id="lqask" rows="1" autocomplete="off" placeholder="Talk to Symbiot, or tell it what to do (paste a screenshot to show it)"></textarea><button type="button" id="lqmic" class="hidden" aria-label="Talk to Symbiot" aria-pressed="false" title="Talk: click, then speak"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><button type="submit" id="lqsend" aria-label="Send"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></form>
</div>

<div id="updatebar" class="updatebar"></div>
<div id="appbar" class="updatebar"></div>
<div id="whatsnew" class="whatsnew"></div>
<header><span class="dot" role="img" aria-label="Symbiot"></span><span class="brand">Symbiot</span><span class="ver" id="ver"></span><span id="lqlook" role="radiogroup" aria-label="Look"><button type="button" role="radio" data-look="glass" aria-checked="false">Glass</button><button type="button" role="radio" data-look="ferro" aria-checked="true">Ferrofluid</button><button type="button" role="radio" data-look="pearl" aria-checked="false">Pearl</button></span><button type="button" id="lqlow" aria-pressed="false" title="Low GPU: Home's liquid drawn at half the resolution and only when something changes, with no blur behind the glass. Easier on your graphics card and battery.">Low GPU</button><span id="lqupd"></span><span class="status" id="status">...</span></header>
<main>
<div id="lqsinkrow"><div class="lqwhere"><span id="lqcrumb" class="lqcrumb">Home</span><h2 id="lqtitle" aria-live="polite"></h2><button type="button" class="ghost hidden" id="lqpark"></button></div><div class="lqacts"><span id="lqtools"><button class="ghost hidden" type="button" id="pushtasks" title="Write .symbiot/TASKS.md into each repo for your coding agent">Send to repos</button></span><button class="iconbtn wide" type="button" id="lqsink" title="close it: it sinks back into the liquid (Esc, or right-click)"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Close</button></div></div><div id="lqwhy" aria-live="polite"></div>
<section id="panel-map">
<div class="profile muted" id="profile">Mapping your work&hellip;</div>
<div class="maprow">
<div id="lmap" class="lmap"><canvas id="lmc" aria-hidden="true"></canvas><svg id="lmlines" aria-hidden="true"></svg><div id="lmov"></div><div id="lmtip" class="lmtip" role="status" aria-live="polite"></div><div class="lmzoom"><button type="button" class="iconbtn" id="lmin" aria-label="Zoom in">+</button><button type="button" class="iconbtn" id="lmout" aria-label="Zoom out">&minus;</button><button type="button" class="iconbtn" id="lmfit" aria-label="Fit the map" title="Fit the map"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 5V1h4M13 5V1H9M1 9v4h4M13 9v4H9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div></div>
<aside id="detail" class="detail hidden"></aside>
</div>
<div id="lmtools" class="lmtools"></div>
<div class="legend">
<button class="ghost" id="remap" style="margin-left:auto">Rescan</button>
</div>
<div id="review" class="review hidden"></div>
<details id="screensbox" class="screensbox"><summary><span class="tgroup">Screens</span> <span class="tcount">experimental &middot; blueprints for screen automation</span></summary>
<div class="note muted" style="margin-top:2px">Capture a screen, then drag a box over each part that matters (a button, a field, a menu) and name it. Each region keeps its pixel coordinates and its centre, ready for automation to aim at. With more than one display, pick which one to capture, or one screen per display. <b>Click here</b> on a region clicks its centre on your real screen, after you confirm. Or let Symbiot do it all for a web page: <b>Map page</b> opens it in a hidden browser, takes its screenshot and marks every button, link and field by itself, and <b>Press</b> on one of them follows it there and maps the next page; <b>Type</b> on a field types into it there. A map only has what fits in the window, so on a longer page <b>Scroll down</b> maps the next part, or <b>Whole page</b> maps all of it in one tall screenshot (where a list scrolls inside the page, like Gmail's mail, that list opened out: a whole inbox on one screen). Only a mapped page is typed into: nothing types on your real screen. <b>Watch</b> on a mapped page (your inbox, say) has Symbiot read it again every few minutes while it runs and tell you what's new there.</div>
<div class="row" style="margin-top:10px"><input id="pagesite" placeholder="a web page to map by itself: gmail, github.com/pulls or a web address" style="flex:1"><button class="act" id="mappage">Map page</button><button class="ghost" id="pagesignin" title="open this site in Symbiot's own browser as a window, to sign in once; close it when you're done">Sign in</button></div>
<div class="row" style="margin-top:10px"><input id="screenname" placeholder="name the screen, e.g. GitHub PR page" style="flex:1"><select id="screenwhich" class="hidden" title="which display to capture" style="flex:0 0 auto;width:auto"></select><select id="screendelay" title="wait first, so you can bring the right window to the front" style="flex:0 0 auto;width:auto"><option value="0">now</option><option value="3">in 3s</option><option value="5">in 5s</option><option value="10">in 10s</option></select><button class="ghost" id="capture">Capture screen</button><button class="ghost" id="screenload" title="use a PNG screenshot you already have">Load image</button><input type="file" id="screenfile" accept="image/png" class="hidden"></div>
<div id="screenmsg"></div>
<div id="watchbox"></div>
<div id="screenlist" class="taskfilter"></div>
<div id="screenview"></div>
</details>
</section>
<section id="panel-board" class="hidden">
<div class="bhead"><div class="bsumw"><div id="boardsum" class="bsum">Everything you watch, side by side.</div><div id="boardsub" class="bsub"></div></div><div class="seg" id="boardwin" role="radiogroup" aria-label="How far back"><button type="button" role="radio" data-h="24" aria-checked="true">24 hours</button><button type="button" role="radio" data-h="72" aria-checked="false">3 days</button><button type="button" role="radio" data-h="168" aria-checked="false">7 days</button></div><button type="button" class="iconbtn" id="boardrefresh" title="Refresh" aria-label="Refresh"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
<div id="boardmsg"></div>
<div id="bstream" class="bstream"><canvas id="bsc" aria-hidden="true"></canvas><div id="bsov"></div></div>
<div id="boardtalk"></div>
<div id="boardawait"></div>
<details id="blist" class="blist"><summary>All of it as a list</summary><div id="board" class="board"></div></details>
<div id="boardlinks"></div>
</section>
<section id="panel-run" class="hidden">
<div class="wuhead"><div><h2 class="wut" id="wutitle">Your week</h2><div class="wus" id="wusub">The last 7 days, from your local git</div></div><div class="wua"><button class="iconbtn hidden" id="copy" title="Copy" aria-label="Copy"><svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 11V3a1 1 0 0 1 1-1h7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button><button class="act" id="write">Write my <span id="what">week</span></button></div></div>
<div class="out muted" id="out">Nothing written yet. Symbiot reads your local git and writes it up for you.</div>
<div class="rfoot" id="outfoot" style="display:none"></div>
</section>
<section id="panel-tasks" class="hidden">
<details class="tnhow"><summary>How the Workdesk works</summary><div class="note muted">Everything handed to an agent, in one place: what needs you, work awaiting your review, tasks queued for later, and below them the agents at work, their questions and the handovers between them. To add a task, tell Symbiot in the bar at the bottom: it files it under the right project. To give tasks to your agent, use <b>Send to repos</b> at the top, beside Close &mdash; filter by tag below to choose which. As the agent finishes each one it lands in <b>Awaiting your review</b>: <b>Approve</b> commits it on a branch and opens a PR, <b>&#8630;</b> sends it back. Ticking a task yourself marks it done (it auto-archives). Click <b><i class=ic-chat></i></b> on a task to ask questions about it.</div></details>
<div id="qbanner" role="status"></div>
<div id="needsbox"></div>
<div id="pushout"></div>
<div id="reviewout"></div>
<div id="reviewlist"></div>
<div id="taskfilter" class="taskfilter"></div>
<div id="tasklist"></div>
<div id="panel-agents" class="wdagents">
<div class="row"><span class="muted" style="flex:1"><span class="tgroup" style="margin-right:8px">Agents and handovers</span>What each agent is doing, live, and the work handed between them. Questions, options and ideas an agent leaves for you show up on its block, whichever model it runs.</span><button class="iconbtn" id="agentsrefresh" title="Refresh" aria-label="Refresh"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
<div id="phoneappr"></div>
<div id="agentsmsg"></div>
<div id="laneslist"></div>
<div id="agentslist"></div>
</div>
</section>
<section id="panel-reports" class="hidden">
<div class="row"><span class="muted" style="flex:1">What agents wrote up for you (findings, audits, plans), newest first. They leave each one in a project's .symbiot folder; it shows here as soon as it's written.</span><button class="iconbtn" id="reportsrefresh" title="Refresh" aria-label="Refresh"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
<div id="reportslist"></div>
<div id="reportview"></div>
</section>
<section id="panel-asks" class="hidden">
<div class="row"><span class="muted" style="flex:1">What your agents are asking you, and what they suggest doing next, in one place. Answer here and the agent carries on.</span></div>
<div id="asksmsg"></div>
<div id="askslist"></div>
</section>
<section id="panel-marketing" class="hidden">
<div class="row"><span class="muted" style="flex:1">Marketing for every product you make, in a lane of its own: its agent drafts posts, demo videos, launches and campaigns, each tagged with the product it&#39;s for. You approve each post&#39;s preview; then its agent posts it, through Symbiot&#39;s signed-in browser, with exactly that text.</span></div>
<div id="mkover"></div>
<div id="mkmsg"></div>
<div id="mkneeds"></div>
<div id="mktasks"></div>
<div id="mktray"></div>
<div id="boardposts"></div>
<div id="mkreplies"></div>
<div id="mktest"></div>
</section>
<section id="panel-computer" class="hidden">
<div id="pcline" aria-live="polite"></div>
<div id="pcmsg"></div>
<div id="pcbody"></div>
</section>
<section id="panel-drift" class="hidden">
<div class="row"><span class="muted">What's out of sync, stuck or at risk across your repos — local git facts.</span>
<label class="muted swl" style="margin-left:auto"><input type="checkbox" class="sw" id="driftfetch"> Fetch latest</label>
<label class="muted swl"><input type="checkbox" class="sw" id="driftci"> Check CI on GitHub</label>
<button class="ghost" id="driftrun">Rescan</button></div>
<div id="driftout"></div>
</section>
<section id="panel-vault" class="hidden" aria-label="Vault">
<div class="vbar">
<div class="vsearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><label for="vaultsearch" class="vsl">Search the vault</label><input id="vaultsearch" type="search" autocomplete="off" spellcheck="false" placeholder="Search names, services or emails"><kbd aria-hidden="true">/</kbd></div>
<div id="vaultlock" class="vchip" aria-live="polite"></div>
<button class="act vadd" type="button" data-va="add" aria-label="Add a login, key or code"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Add</span></button>
</div>
<div id="vaultfilters" class="vfilt" role="group" aria-label="Show"></div>
<div class="vsplit">
<div class="vlist"><div id="vaultlist" role="listbox" aria-label="Saved logins, keys and codes"></div>
<details id="vaultlogbox" class="vlog"><summary>Recent activity</summary><div id="vaultlog"></div></details></div>
<div id="vaultdetail" class="vdetail"></div>
</div>
<div id="vaultmsg" role="status" aria-live="polite"></div>
<div id="vaultsheet" class="hidden" role="dialog" aria-modal="true" aria-labelledby="vaultsheett"></div>
</section>
<section id="panel-settings" class="hidden">
<div id="firststeps" class="sset hidden" aria-live="polite"></div>
<div class="sset" id="langset"><h3 class="ssh">Language</h3><div id="langbox"><span class="muted">…</span></div></div>
<div class="sset" id="licset"><h3 class="ssh">Symbiot Pro</h3><div id="licbox"><span class="muted">Checking…</span></div></div>
<div class="sset"><h3 class="ssh">Setup</h3><div class="row"><span class="muted" style="flex:1">Walk through setup again: your AI, your work, your agent, your apps and your phone.</span><button class="ghost" id="rerunsetup">Run setup again</button></div></div>
<div class="sset"><h3 class="ssh">Your AI</h3>
<label>Which AI should Symbiot write with?</label>
<select id="provider">
<option value="claude">Your Claude subscription (Claude Code) - no key</option>
<option value="anthropic">Claude (Anthropic) - API key</option>
<option value="openai">OpenAI (GPT)</option>
<option value="gemini">Gemini (Google)</option>
<option value="ollama">Local model (Ollama) - free, no key</option>
</select>
<div class="note muted">With a Claude subscription (Pro or Max), Symbiot answers through <b>Claude Code</b> signed in on this computer: no key, no extra bill. Otherwise a hosted model needs an API key, or run <b>Ollama</b> locally for a free, private option (nothing leaves your machine).</div>
<div id="subWrap" class="note hidden"></div>
<div id="keyWrap"><label>API key</label><input id="key" type="password" placeholder="paste your key">
<div class="note"><a id="getkey">Where do I get a key?</a></div></div>
<div id="baseWrap" class="hidden"><label>Ollama URL</label><input id="baseUrl" type="text" value="http://localhost:11434"></div>
<label>Model <span class="muted" id="modelHint"></span></label>
<input id="model" type="text" placeholder="(blank = default)">
<div class="row" style="margin-top:16px"><button class="act" id="save">Save &amp; connect</button>
<span class="note" id="saveMsg"></span></div>
</div>
<div class="sset" id="intuset"><h3 class="ssh">On its own</h3><div class="note muted">Symbiot moves work forward without being asked: it picks up stalled work, prepares what you'll need next and tells you what it notices. Reading and internal work it just does; anything that goes out (an email, a message, a push) it asks you first, until you've said yes to that kind 3 times; deleting and paying it always asks.</div><div class="row" style="margin-top:6px" id="intumode"><button type="button" class="ghost" data-m="off">Off</button><button type="button" class="ghost" data-m="watch">Watch: tell me what you'd do</button><button type="button" class="ghost" data-m="act">Act</button></div><div class="muted" id="intunote" style="font-size:12px;margin-top:4px"></div><div style="margin-top:10px"><b style="font-size:13px">Your focus</b> <small class="muted">what it reads before it does anything: goals, projects, people who matter, what to ignore</small><textarea id="intufocus" rows="9" style="width:100%;margin-top:6px;font:13px/1.45 ui-monospace,monospace"></textarea><div class="row" style="margin-top:6px"><button type="button" class="ghost" id="intusave">Save focus</button><span class="muted" id="intusaved" style="font-size:12px"></span></div></div><div id="intutiers" style="margin-top:8px"></div></div>
<div class="sset" id="ovrset"><h3 class="ssh">Customisations</h3><div class="note muted">Your own changes to how Symbiot works: extra rules for its agents, adjustments to how it words cards and judges questions, your own triggers. They live in your folder, survive updates, and can never loosen a safety rule. Symbiot may propose one when you keep pushing back on the same thing; it goes in only with your OK, after a check that Symbiot still runs with it, and every change can be undone.</div><div class="row" style="margin-top:6px" id="ovrswitch"><button type="button" class="ghost" data-on="1">On</button><button type="button" class="ghost" data-on="0">Off: base behaviour</button></div><div class="row" style="margin-top:6px;align-items:center" id="ovrself"><span class="muted" style="font-size:12px">Symbiot's own proposals:</span><button type="button" class="ghost" data-m="ask">Ask me first</button><button type="button" class="ghost" data-m="auto">Apply rules by themselves</button></div><div id="ovrlist" style="margin-top:8px"></div></div>
<div class="sset">
<h3 class="ssh">Folders to scan for repos</h3>
<div id="scanroots"></div>
<div class="row" style="margin-top:6px"><input id="newroot" placeholder="/path/to/folder  (or ~/work) — where your projects live" style="flex:1"><button class="ghost" id="addroot">Add folder</button></div>
<div class="note muted" id="scanrootnote">Point Symbiot at where your work lives — inside or outside your home folder. Defaults to your home folder.</div>
</div>
<div class="sset">
<h3 class="ssh">Knowledge folders</h3>
<div id="knowroots"></div>
<div class="row" style="margin-top:6px"><input id="newknow" placeholder="~/Company — documents your chats can quote" style="flex:1"><input id="newknowex" placeholder="examples: templates/" title="Paths inside it that hold worked examples, comma-separated" style="width:190px"><button class="ghost" id="addknow">Add folder</button></div>
<div class="note muted" id="knownote">Chats quote these files (Markdown, CSV, text) and say which one. Paths listed as examples (<code>templates/</code> unless you say otherwise: any folder of that name) are worked examples, never used as facts; so is a file whose front matter says <code>example: true</code>. Click a folder to change its examples.</div>
<div id="knowchecks"></div>
</div>
<div id="phonebox" class="hidden sset">
<h3 class="ssh">Projects in Termux</h3>
<div class="note muted" id="phonenote"></div>
<div class="row" style="margin-top:6px"><button class="ghost" id="phonebtn"></button></div>
</div>
<div class="sset">
<h3 class="ssh">Hand off to your agent when you "Send to repos"</h3>
<input id="agentcmd" type="text" placeholder="e.g.  aider --message &quot;{prompt}&quot; --yes   ·   code {dir}   ·   leave blank to just write the file">
<div class="note muted">Runs in each repo after tasks are written. Use <b>{dir}</b> = repo path, <b>{prompt}</b> = the task instruction. Works with any agent or editor &mdash; it's your command.</div>
<label class="check swl" style="margin-top:12px"><input type="checkbox" class="sw" id="agenttrust" checked> <span><b>Symbiosis</b> &middot; agents work on their own. They do the work without stopping to ask permission. <b>The membrane</b> still stops pushing to main, publishing, deleting outside their folder, sudo, reading your keys and changing Symbiot's settings. Off: they ask before anything outside their allow list.</span></label>
<label class="check" style="margin-top:12px"><span><b>Agents at once in one project</b> &middot; tasks that don't clash run side by side, each in a copy of the repo of its own, and merge back when they finish. </span><input type="number" id="parcap" min="1" max="8" style="width:56px"></label>
<div class="note muted" id="parnote" style="margin-top:6px"></div>
<div class="note muted" id="agentsandbox" style="margin-top:6px"></div>
<div id="agentpresets" style="margin-top:8px"></div>
<div class="note muted" id="agentconnectors"></div>
<div id="grantbox" style="margin-top:10px">
<label style="font-size:12px;color:var(--faint)">When an agent asks to run something or read a folder, grant it here instead of editing the command:</label>
<div class="row" style="margin-top:6px"><input id="granttool" placeholder="allow a command, e.g. python3 or pytest" style="flex:1"><button class="ghost" id="granttoolbtn">Allow command</button></div>
<div class="row" style="margin-top:6px"><input id="grantdir" placeholder="allow a folder, e.g. /home/you/SunCo" style="flex:1"><button class="ghost" id="grantdirbtn">Allow folder</button></div>
<div class="note" id="grantnote"></div>
</div>
</div>
<div class="sset">
<div class="row" id="sbrow" style="margin-bottom:12px"><span style="flex:1"><b>The Symbiot Browser</b><br><span class="muted">Symbiot’s own browser window, where you sign in to your sites once so Symbiot can read them for you.</span></span><button class="act" id="sbopen">Open the Symbiot Browser</button></div>
<div id="links"></div>
<div class="row" style="margin-top:8px"><input id="addsite" placeholder="Add a site: the page you see once signed in, e.g. www.domains.co.za/client/dashboard" aria-label="add a site to sign in to" style="flex:1"><button class="act" id="addsitego">Add and sign in</button></div>
<div id="linksmsg"></div>
<div class="note muted" id="linksnote">For a whole team, one <b>links.json</b> in Symbiot's config folder adds your company's own sites and hides the ones you don't use, so everyone gets the same buttons.</div>
</div>
<div class="sset">
<h3 class="ssh">How well it asks you</h3>
<div class="note muted" style="margin-top:2px">Every question an agent puts to you is checked first, so only what's truly yours reaches you. This counts the ones that got through and shouldn't have: you said so on the card ("you should know this"), or its agent answered it itself. Those are shown to the checker as what not to ask again.</div>
<div id="triagestats"></div>
</div>
<div class="sset">
<h3 class="ssh">What Symbiot remembers</h3>
<div class="note muted" style="margin-top:2px">Every chat in the app is the same Symbiot. What's worth knowing on another page (who someone is, which account is what, what you decided) is kept here, on this computer only, and each chat gets just the parts its question touches.</div>
<div id="mindlist"></div>
</div>
<div class="sset">
<h3 class="ssh">Secrets</h3>
<div id="secretslist"></div>
<div class="note muted">Passwords, recovery codes and tokens you hand over are kept in the Vault, not in chat. An agent reads one by name when it needs it. Look one up, add, rename or delete them there.</div>
<div class="row" style="margin-top:10px"><span class="muted" style="flex:1">Show or copy one with your vault PIN:</span><button class="ghost" type="button" id="openvault">Open the Vault</button></div>
</div>
<div class="sset">
<h3 class="ssh">Trusted sites for Screens <span class="muted">(experimental)</span></h3>
<div id="trustedsites"></div>
<div class="row" style="margin-top:6px"><input id="newtrusted" placeholder="a site, e.g. mail.google.com or github.com" style="flex:1"><button class="ghost" id="addtrusted">Trust site</button></div>
<div class="note muted" id="trustednote">To sign in to a site for agents, use <b>Sign in</b> next to it, or <b>Add a site</b> under Connections. On a mapped page from one of these sites, <b>Press</b> and <b>Type</b> go ahead without asking, for you and for agents (<b>symbiot screens press</b> / <b>type</b>), signed in as you. A site covers its subdomains: google.com covers mail.google.com. Everywhere else, each one asks first. Only you add sites, here: Symbiot gives agents no command for it.</div>
</div>
<div class="sset">
<h3 class="ssh">Email &mdash; add what you sent to Week and Standup <span class="muted">(experimental)</span></h3>
<label class="check"><input type="checkbox" id="mailon"> Use my sent email (subjects &amp; recipients only)</label>
<div id="mailsources"></div>
<div class="row" style="margin-top:6px"><input id="newmail" placeholder="add a mail folder or .mbox file  (e.g. a Google Takeout export)" style="flex:1"><button class="ghost" id="addmail">Add</button><button class="ghost" id="mailpreview">Preview</button></div>
<input id="mailaddrs" type="text" placeholder="your email addresses, comma-separated  (only needed for a whole-mailbox export)">
<div class="note muted" id="mailnote">No API, no OAuth, no password: Symbiot reads the mail your desktop mail app (Thunderbird, Apple Mail, Evolution, mutt&hellip;) already keeps on this computer, or an exported .mbox &mdash; so anyone can link theirs. Headers only, never a message body; off until you tick it. Experimental: tested with mbox and Maildir, not yet on real Apple Mail, Evolution or KMail stores.</div>
<div id="mailout"></div>
</div>
<div class="sset">
<h3 class="ssh">Weekly write-up and start at login</h3>
<label class="check"><input type="checkbox" id="weeklyon"> Write my week and send me a desktop notification every</label>
<div class="row" style="margin-top:2px"><select id="weeklyday" style="width:auto"><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option></select><span class="muted">at</span><select id="weeklyhour" style="width:auto"></select><button class="ghost" id="weeklynow" title="write it now and send the notification, to check it works">Write it now</button></div>
<label class="check"><input type="checkbox" id="autostart"> <span id="autostartlbl">Start Symbiot in the background when I log in (no window)</span></label>
<div class="note muted" id="desktopnote"></div>
</div>
<div class="sset">
<h3 class="ssh">Your phone <span class="muted">(experimental)</span></h3>
<div id="phonelink"></div>
</div>
<div class="sset">
<h3 class="ssh">Local models <span class="muted">(experimental)</span></h3>
<button class="ghost" id="recbtn">Recommend models for my machine</button>
<button class="ghost" id="setuplocal" style="margin-left:8px">Set up a free local model</button>
<div id="setupout" class="note muted" style="margin-top:10px"></div>
<div id="recout" style="margin-top:12px"></div>
</div>
</section>
</main>
<div id="quota" class="hidden" aria-live="polite"><div class="qpop" id="qpop"></div><button class="qpill" type="button" id="qpill" aria-haspopup="true" title="AI usage limits"><span class="qdot"></span><span id="qtext"></span></button></div>
<footer><button class="iconbtn" type="button" id="quit" style="margin-left:auto" title="Quit" aria-label="Quit"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button></footer>
`;
