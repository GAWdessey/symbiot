// symbiot UI — heartbeat: reload on server restart, and the update bar.
// One <script> block (see ui.mjs).
export const UPDATE_JS = `
var SRV_STARTED=null,srvDown=false,updBusy=false;
function ubar(){return document.getElementById('updatebar');}
function heartbeat(fresh){
  api('/api/ping'+(fresh?'?fresh=1':'')).then(function(p){
    var b=ubar();
    var ve=document.getElementById('ver');if(ve&&p.version)ve.textContent='v'+p.version;
    if(SRV_STARTED===null){SRV_STARTED=p.started;}
    else if(p.started!==SRV_STARTED){location.reload();return;}
    if(srvDown){location.reload();return;}
    if(updBusy)return;
    // Loop guard: if we already tried to update to this version and we're still
    // not on it after the restart, the install isn't advancing — stop offering
    // the button (which just loops) and tell them to update manually.
    var tried=null;try{tried=localStorage.getItem('symbiot_update_tried');}catch(e){}
    if(tried){
      if(p.version!==tried){try{localStorage.removeItem('symbiot_update_tried');}catch(e){} } // advanced → success, clear
      else if(p.latest&&p.newer){ // still on the same version → the install didn't advance
        b.className='updatebar reconnect show';
        b.innerHTML="Auto-update to "+esc(p.latest)+" didn't take (still on "+esc(p.version)+"). Run <code>npm install -g symbiot@latest</code> in a terminal, then restart.";
        return;
      }
    }
    if(p.latest&&p.newer){
      b.className='updatebar show';
      b.innerHTML="A new Symbiot ("+esc(p.latest)+") is available &mdash; you're on "+esc(p.version)+". <button id='doupd'>Update &amp; restart</button>";
      var btn=document.getElementById('doupd');if(btn)btn.onclick=doUpdate;
    }else{b.className='updatebar';}
  }).catch(function(){srvDown=true;var b=ubar();b.className='updatebar reconnect show';b.textContent='Reconnecting to Symbiot…';});
}
function doUpdate(){updBusy=true;try{localStorage.setItem('symbiot_update_tried',document.getElementById('ver').textContent.replace(/^v/,''));}catch(e){}var b=ubar();b.className='updatebar show';b.textContent='Updating & restarting… this page will reload itself when it is back.';api('/api/update',{});}
setInterval(heartbeat,4000);heartbeat(true);
window.addEventListener('focus',function(){heartbeat(true);}); // re-check for updates when you come back to the window
`;
