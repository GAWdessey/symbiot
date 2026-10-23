// symbiot — the liquid itself: the droplets' physics and the metaball surface on the GPU.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `// The physics: each droplet a critically damped spring to its place (no wobble,
// no overshoot), pushed off its neighbours and the core where they'd overlap.
function lqStep(){var S0=lqSize();if(S0.w!==LQ.bw||S0.h!==LQ.bh){if(LQ.scene==='work'&&LQ.workData)lqBuildWork();else if(LQ.adapt)lqBuild();}var S=S0,cx=S.w/2,cy=(LQ.scene!=='work'&&LQ.cy)||S.h*0.47,k=0.022,c=2*Math.sqrt(k),th=LQ.theme,still=th.still,rest=LQ.mode==='rest',pool=LQ.mode==='pool',talk=LQ.talking&&!pool;
if(AWAY){LQ.mode='rest';rest=true;pool=false;talk=false;var ap=lqAwayPos(S);cx=ap.x;cy=ap.y;} // away: the orb at rest, where the bounce has it
var core=LQ.core,ctx=cx,cty=talk?S.h-44:cy,ctr=(rest?140:pool?50:talk?54+30*(LQ.talkWeight||0.35):92)*S.s;
if(!core.x){core.x=cx;core.y=cy;}core.x+=(ctx-core.x)*(still?1:0.06);core.y+=(cty-core.y)*(still?1:0.06);core.cr+=(ctr-core.cr)*(still?1:0.05);
var D=LQ.drops,N=D.length;
for(var i=0;i<N;i++){var d=D[i],tx=d.tx,ty=d.ty,tr=d.gone?0:d.r;
if(rest){tx=cx+Math.cos(i*1.3)*16;ty=cy+Math.sin(i*1.3)*16;tr=d.r*0.6;}
else if(pool){tx=cx+(i-(N-1)/2)*40*S.s;ty=S.h-40;tr=13*S.s;}
else if(talk&&!d.blob&&!d.band){var t0=(LQ.scene!=='work'&&LQ.top)||S.h*0.12;ty=t0+(d.ty-t0)*0.55;}
var ax=k*(tx-d.x)-c*d.vx,ay=k*(ty-d.y)-c*d.vy;
if(still){d.x=tx;d.y=ty;d.vx=0;d.vy=0;}else{d.vx+=ax;d.vy+=ay;d.x+=d.vx;d.y+=d.vy;}
if(!rest&&!pool){d.x=Math.max(d.cr+12,Math.min(S.w-d.cr-12,d.x));d.y=Math.max((d.blob||d.band?60:140)+d.cr,Math.min(S.h-150-d.cr-50,d.y));}
d.cr+=(tr-d.cr)*(still?1:0.06);
var b=LQ.btns[i];if(b&&b.offsetWidth)d.lw=b.offsetWidth;if(b&&b.style){b.style.transform=d.blob?'translate('+Math.round(d.x+2*d.r+22)+'px,'+Math.round(d.y-d.r-4)+'px)':d.band?'translate('+Math.round(d.x+d.r+30)+'px,'+Math.round(d.y-(b.offsetHeight||36)/2)+'px)':'translate('+Math.round(d.x-(b.offsetWidth||0)/2)+'px,'+Math.round(d.y+d.cr+(d.kind==='run'?28:4))+'px)';var show=!rest&&!pool;b.style.opacity=show?'1':'0';b.style.pointerEvents=show?'auto':'none';var lt=LQ.lts&&LQ.lts[i];if(lt)lt.tabIndex=show?0:-1;}}
var gplaced=[];(LQ.gbtns||[]).forEach(function(gb){var g=gb.getAttribute('data-g'),top=1e9,sx=0,nn=0;D.forEach(function(d){if(d.kind!=='more'&&lqPara(d)===g){top=Math.min(top,d.y-d.cr);sx+=d.x;nn++;}});if(!nn||!gb.style)return;var gw=gb.offsetWidth||0,gh=gb.offsetHeight||0,zt=LQ.scene!=='work'&&LQ.zoneT&&LQ.zoneT[g];if(zt){gb.style.transform='translate('+Math.round(zt[0]-gw/2)+'px,'+Math.round(zt[1]-gh/2)+'px)';gplaced.push([zt[0]-gw/2,zt[1]-gh/2,zt[0]+gw/2,zt[1]+gh/2]);}else{var gx=Math.max(12,Math.min(lqSize().w-gw-12,sx/nn-gw/2)),gy=top-gh-30;
// off any droplet it would sit on (the "more" droplet, another group's): above it instead
for(var pass=0;pass<3;pass++)D.forEach(function(d){if(d.blob||lqPara(d)===g&&d.kind!=='more')return;var l=d.x-d.cr-6,r=d.x+d.cr+6,t=d.y-d.cr-6,b=d.y+d.cr+(d.lw?24:6);if(gx<r&&gx+gw>l&&gy<b&&gy+gh>t)gy=t-gh-4;});
gy=Math.max(LQ.scene!=='work'&&LQ.top?LQ.top:48,gy);
// nor on another group's heading ("Watching" was drawn over "Areas"): beside it instead, on the side its own group is
for(var ps=0;ps<3;ps++)gplaced.forEach(function(p){if(gx<p[2]+6&&gx+gw>p[0]-6&&gy<p[3]+4&&gy+gh>p[1]-4)gx=gx+gw/2<(p[0]+p[2])/2?p[0]-gw-12:p[2]+12;});gx=Math.max(12,Math.min(lqSize().w-gw-12,gx));
gplaced.push([gx,gy,gx+gw,gy+gh]);gb.style.transform='translate('+Math.round(gx)+'px,'+Math.round(gy)+'px)';}var gshow=!rest&&!pool&&!talk;gb.style.opacity=gshow?'1':'0';gb.style.pointerEvents=gshow?'auto':'none';gb.tabIndex=gshow?0:-1;});
var ntl=$('lqneedt');if(ntl&&ntl.style)ntl.style.opacity=rest?'0':'1';var nxb=$('lqnext');if(nxb&&nxb.style){nxb.style.opacity=rest?'0':'';nxb.style.pointerEvents=rest?'none':'';}
(LQ.orbs||[]).forEach(function(o){var d=D[+o.getAttribute('data-i')];if(!d||!o.style)return;var R=Math.round(d.cr+20);o.style.width=o.style.height=(2*R)+'px';o.style.transform='translate('+Math.round(d.x-R)+'px,'+Math.round(d.y-R)+'px)';o.style.opacity=rest||pool?'0':'1';});
var cb=$('lqcore');if(cb&&cb.style){var inC=core.cr>60;if(cb.classList)cb.classList.toggle('in',inC&&!rest);cb.style.maxWidth=inC?Math.round(core.cr*1.5)+'px':'340px';var cw=cb.offsetWidth||0,chh=cb.offsetHeight||0;
// too small a core for its words (a phone): under the header, which wraps there; and not at all when the needs band says it already
var hd=document.querySelector?document.querySelector('header'):null,below=Math.max(56,((hd&&hd.offsetHeight)||0)+8),said=!inC&&!rest&&LQ.scene!=='work'&&LQ.need&&LQ.need.items&&LQ.need.items.length;
cb.style.transform='translate('+Math.round(cx-cw/2)+'px,'+(rest||inC?(inC?Math.round(core.y-chh/2):Math.round(core.y+core.cr+14)):LQ.scene==='work'?112:below)+'px)';var ct=rest?(LQ.coreText||'All handled'):talk||pool||said?'':(LQ.coreText||'');lqCoreText(cb,ct);cb.style.opacity=ct?'1':'0';cb.style.pointerEvents=ct?'auto':'none';}}
// The liquid: a metaball surface (Σ r²/d² = 1) shaded as chrome, on the GPU.
var LQ_FS=['precision highp float;',
'uniform vec2 uRes;uniform float uT;uniform float uDpr;uniform vec4 uB[NB];uniform vec3 uRip;uniform float uStyle;uniform float uContrast;uniform float uExposure;',
'float field(vec2 p){float f=0.0;for(int i=0;i<NB;i++){vec4 b=uB[i];if(b.z<=0.0)continue;float r=b.z*uDpr;vec2 d=p-b.xy*uRes;f+=r*r/(dot(d,d)+1.0);}vec2 q=p/uDpr;return f*(1.0+0.025*sin(q.x*0.011+uT*0.7)*cos(q.y*0.009-uT*0.55)+0.012*sin(q.x*0.031-q.y*0.027+uT*1.3));}',
'float tint(vec2 p){float f=0.0,t=0.0;for(int i=0;i<NB;i++){vec4 b=uB[i];if(b.z<=0.0)continue;float r=b.z*uDpr;vec2 d=p-b.xy*uRes;float c=r*r/(dot(d,d)+1.0);f+=c;t+=c*b.w;}return t/max(f,0.0001);}',
'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
'vec3 glassBg(vec2 p){vec2 q=p/uRes;vec3 c=vec3(0.918,0.927,0.936);',
'vec2 a=vec2(0.22+0.05*sin(uT*0.13),0.28+0.06*cos(uT*0.11));vec2 b=vec2(0.8+0.04*cos(uT*0.09),0.22+0.05*sin(uT*0.15));vec2 e=vec2(0.52+0.06*sin(uT*0.07),0.62);',
'c=mix(c,vec3(0.56,0.79,0.80),0.6*exp(-dot(q-a,q-a)*6.0));c=mix(c,vec3(0.98,0.79,0.60),0.55*exp(-dot(q-b,q-b)*7.0));c=mix(c,vec3(0.72,0.76,0.93),0.45*exp(-dot(q-e,q-e)*5.0));',
'vec2 gp=mod(p,22.0*uDpr)-11.0*uDpr;c-=0.07*smoothstep(1.7*uDpr,0.7*uDpr,length(gp));return c;}',
'float box(vec2 d,vec2 c,vec2 s){vec2 k=abs(d-c)/s;return 1.0-smoothstep(0.55,1.0,max(k.x,k.y));}',
'vec3 irid(float x){return 0.5+0.5*cos(6.2832*(vec3(0.0,0.33,0.67)+x));}',
'void main(){vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);float f=field(p);float e=1.5*uDpr;',
'vec2 g=vec2(field(p+vec2(e,0.0))-field(p-vec2(e,0.0)),field(p+vec2(0.0,e))-field(p-vec2(0.0,e)))/(2.0*e);float gm=length(g)+0.00001;',
'float sd=(f-1.0)/gm;float m=smoothstep(-0.75*uDpr,0.75*uDpr,sd);vec2 gn=g/gm;',
'vec2 rc=uRip.xy*uRes;float rd=distance(p,rc)/uDpr;float age=uT-uRip.z;float ring=0.0;if(age>0.0&&age<4.0){float w=rd-age*300.0;ring=sin(w*0.07)*exp(-abs(w)*0.02)*(1.0-age/4.0);}',
'vec2 rdir=normalize(p-rc+0.001);float rho=clamp(1.0/sqrt(max(f,0.0001)),0.0,1.0);',
'vec3 n=normalize(vec3(-gn*rho+ring*0.18*rdir,sqrt(max(0.0,1.0-rho*rho))+0.02));',
'vec3 r=vec3(2.0*n.z*n.xy,2.0*n.z*n.z-1.0);float fs=field(p-vec2(0.0,12.0*uDpr));float gr=hash(floor(p))-0.5;vec3 col;vec3 ink=vec3(0.0);float tf=tint(p);vec3 amb=vec3(0.95,0.62,0.22);',
'if(uStyle<0.5){',
'vec3 bg=glassBg(p+rdir*ring*6.0*uDpr);bg-=0.09*smoothstep(0.45,1.0,fs)*(1.0-m);',
'vec2 off=n.xy*34.0*uDpr*rho;vec3 rf=vec3(glassBg(p+off*0.9).r,glassBg(p+off).g,glassBg(p+off*1.1).b);',
'rf=mix(rf,vec3(dot(rf,vec3(0.33))),0.15)*vec3(0.985,0.995,1.0)+0.03;float fr=pow(1.0-n.z,3.0);rf=mix(rf,vec3(1.0),fr*0.6);rf=mix(rf,rf*vec3(1.08,0.86,0.62),tf*0.55);',
'rf+=vec3(1.0)*pow(max(dot(n,normalize(vec3(-0.35,-0.6,1.0))),0.0),140.0)*0.95;rf+=vec3(1.0,0.97,0.92)*pow(max(dot(n,normalize(vec3(0.5,0.65,1.0))),0.0),24.0)*0.12;',
'rf-=0.10*smoothstep(2.4*uDpr,0.0,sd);col=mix(bg,rf,m)+gr*0.008;',
'}else if(uStyle<1.5){',
'vec2 q=p/uRes;vec3 bg=vec3(0.03,0.034,0.04)+0.045*exp(-dot(q-vec2(0.5,0.2),q-vec2(0.5,0.2))*3.0);bg*=1.0-0.35*length(q-0.5);',
'bg+=vec3(0.025,0.026,0.03)*smoothstep(0.5,1.0,fs)*(1.0-m)+vec3(0.5,0.55,0.62)*abs(ring)*0.05;',
'float R=mix(0.16,1.0,pow(1.0-n.z,3.0));',
'vec3 env=vec3(1.0,0.99,0.97)*box(r.xy,vec2(-0.42,-0.58),vec2(0.30,0.15))*1.2+vec3(0.85,0.9,1.0)*box(r.xy,vec2(0.78,-0.05),vec2(0.07,0.55))*0.55+vec3(0.6,0.5,0.4)*box(r.xy,vec2(0.0,0.85),vec2(0.9,0.12))*0.10;',
'vec3 c=vec3(0.010,0.011,0.013)+env*R+irid((1.0-n.z)*1.3+0.15)*pow(1.0-n.z,2.2)*0.22;c+=amb*tf*(0.05+0.7*pow(1.0-n.z,2.0));c+=vec3(0.06)*smoothstep(1.8*uDpr,0.0,sd);',
'col=mix(bg,c,m)+gr*0.012;ink=vec3(1.0);',
'}else{',
'vec2 q=p/uRes;vec3 bg=vec3(0.929,0.925,0.917)-0.06*length(q-vec2(0.5,0.35));bg-=vec3(0.13,0.13,0.12)*smoothstep(0.45,1.0,fs)*(1.0-m)+vec3(0.2)*abs(ring)*0.05;',
'vec3 env=mix(vec3(0.96,0.965,0.97),vec3(0.36,0.38,0.42),smoothstep(-0.7,0.75,r.y));env=mix(env,vec3(0.62,0.6,0.57),smoothstep(0.55,1.0,r.y)*0.6);',
'env+=vec3(1.0)*box(r.xy,vec2(-0.45,-0.5),vec2(0.32,0.2))*0.55+vec3(1.0)*box(r.xy,vec2(0.72,-0.1),vec2(0.08,0.45))*0.35;',
'vec3 c=env*mix(0.82,1.0,pow(1.0-n.z,2.0))+irid((1.0-n.z)*0.9+0.55)*pow(1.0-n.z,1.6)*0.10;c=mix(c,c*vec3(1.1,0.86,0.6),tf*0.6);c-=0.08*smoothstep(1.6*uDpr,0.0,sd);',
'col=mix(bg,c,m)+gr*0.014;',
'}',
'float line=(smoothstep(-2.0*uDpr,0.0,sd)-smoothstep(0.0,2.0*uDpr,sd))*uContrast;col=mix(col,ink,line);col*=mix(1.0,uExposure,0.5);',
'gl_FragColor=vec4(col,1.0);}'].join('');
function lqFS(n){return LQ_FS.split('NB').join(String(n));}
var LQ_NB=32; // metaballs home can draw: the core, the droplets, the lines to their blobs, the one at your pointer
// No graphics card (WebGL drawn by the CPU: SwiftShader, llvmpipe), any steady drawing
// keeps several cores spinning (measured: 2.4-6 cores at full speed, 0.9 at 2 a second,
// 0.06 not drawing). Then, or when the system asks for less motion, the liquid draws at
// a third of the resolution, without the breathing, and only when something moved (Home), at most
// 20 a second while you use it and 5 at rest. glDpr: the pixel ratio a canvas draws at;
// glEvery: draw 1 frame in n.
// Low GPU (GLLOW, the header's switch, kept on this computer): the same, at half the
// resolution, and no blur behind the glass (body.lq-low). The full liquid kept a graphics
// card at full clock all day, the window open behind others (2026-10-12). And whatever you
// pick, a window you aren't using (glFocused) draws the same way, only when something moved.
var GLSOFT=false,GLSTILL=false,GLLOW=false;try{GLSTILL=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(e){}
try{GLLOW=!!(window.localStorage&&window.localStorage.getItem('symbiot-lowgpu')==='1');}catch(e){}
function glFocused(){try{return !document.hasFocus||document.hasFocus();}catch(e){return true;}}
function glLight(){return GLSOFT||GLSTILL||GLLOW||!glFocused();}
function glEvery(busy){return glLight()?(busy?3:12):1;}
function glDpr(max){return GLSOFT?0.34:GLLOW?0.5:Math.min(window.devicePixelRatio||1,max);}
function glLow(on){GLLOW=!!on;try{if(window.localStorage)window.localStorage.setItem('symbiot-lowgpu',GLLOW?'1':'0');}catch(e){}
if(document.body&&document.body.classList)document.body.classList.toggle('lq-low',GLLOW);var b=$('lqlow');if(b)b.setAttribute('aria-pressed',GLLOW?'true':'false');}
function lqGL(c,n){c=c||$('lq');n=n||LQ_NB;if(!c||!c.getContext)return null;var gl=null;try{gl=c.getContext('webgl',{antialias:false,alpha:false});}catch(e){}if(!gl)return null;
try{var dbg=gl.getExtension('WEBGL_debug_renderer_info'),rn=String(dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)).toLowerCase();if(['swiftshader','llvmpipe','softpipe','software'].some(function(k){return rn.indexOf(k)>=0;}))GLSOFT=true;}catch(e){}
function sh(t,src){var o=gl.createShader(t);gl.shaderSource(o,src);gl.compileShader(o);return o;}
var pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}'));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,lqFS(n)));gl.linkProgram(pr);
if(!gl.getProgramParameter(pr,gl.LINK_STATUS))return null;gl.useProgram(pr);
var bf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,bf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
var al=gl.getAttribLocation(pr,'a');gl.enableVertexAttribArray(al);gl.vertexAttribPointer(al,2,gl.FLOAT,false,0,0);
var U={};['uRes','uT','uDpr','uB','uRip','uStyle','uContrast','uExposure'].forEach(function(n){U[n]=gl.getUniformLocation(pr,n);});
return {gl:gl,c:c,U:U,out:new Float32Array(n*4),t0:(window.performance&&performance.now)?performance.now():Date.now()};}
function lqDraw(G){var gl=G.gl,c=G.c,S=lqSize(),d=glDpr(3),W=Math.max(1,Math.floor(S.w*d)),H=Math.max(1,Math.floor(S.h*d));
if(c.width!==W||c.height!==H){c.width=W;c.height=H;gl.viewport(0,0,W,H);}
var now=(window.performance&&performance.now)?performance.now():Date.now(),t=(now-G.t0)/1000,th=LQ.theme,slow=glLight(),still=th.still||slow,o=G.out;LQ.t=t;
for(var i=0;i<o.length;i++)o[i]=0;var NB=o.length/4;
var put=function(k,x,y,r,a,lv){if(k>NB-1)return;var w=still?0:(k===0?1:lv!=null?lv:0.3);o[k*4]=x/S.w+Math.sin(t*1.3+k*1.7)*0.004*w;o[k*4+1]=y/S.h+Math.cos(t*1.1+k*2.3)*0.005*w;o[k*4+2]=Math.max(0,r)*(1+0.035*Math.sin(t*2.0+k)*w);o[k*4+3]=a||0;};
put(0,LQ.core.x,LQ.core.y,LQ.core.cr);var k=1,tend=[];
LQ.drops.forEach(function(dr){put(k++,dr.x,dr.y,dr.cr,dr.kind==='you'||dr.ask?1:0,dr.live);if(dr.tendril&&LQ.mode==='aware'&&!LQ.talking)tend.push(dr);});
// a tendril is a chain of blobs close enough to always bridge (spaced at under 2.8r),
// never one blob floating in the gap: drawn whole or not at all
tend.forEach(function(dr){var dx=dr.x-LQ.core.x,dy=dr.y-LQ.core.y,len=Math.sqrt(dx*dx+dy*dy)||1,gap=len-LQ.core.cr-dr.cr;if(gap<=8)return;var n=Math.max(1,Math.min(3,Math.ceil(gap/40))),sp=gap/(n+1),rr=sp/2;if(k+n>NB-1)return;for(var m=1;m<=n;m++){var at=LQ.core.cr+sp*m;put(k++,LQ.core.x+dx/len*at,LQ.core.y+dy/len*at,rr);}});
// the liquid line from a lit orb to its blob (which sits 2r+22 right of it, clear of the orb): four drops close enough to always
// bridge, the last under the blob's edge, so the blob hangs off the orb; drawn whole or not at all
if(LQ.mode!=='rest'&&LQ.mode!=='pool')LQ.drops.forEach(function(dr){if(!dr.blob||dr.gone||dr.cr<6||k+4>NB-1)return;var x1=dr.x+dr.cr+8,x2=dr.x+2*dr.r+28,st=(x2-x1)/3;put(k++,x1,dr.y,7*Math.min(1,dr.cr/dr.r),1,0.2);put(k++,x1+st,dr.y,6,1,0.2);put(k++,x1+2*st,dr.y,6,1,0.2);put(k++,x2,dr.y,10,1,0.2);});
var P=LQ.pointer;if(P&&LQ.mode==='aware'&&!LQ.talking){var best=null,bd=1e9;[LQ.core].concat(LQ.drops).forEach(function(g){if(g.cr<18)return;var dd=Math.hypot(P[0]-g.x,P[1]-g.y)-g.cr;if(dd<bd){bd=dd;best=g;}});
// a bulge toward the pointer, its tip always on the orb's edge: reaching further, it hung in the gap as an orb of its own with no label (2026-10-08)
if(best&&bd<230){var dx=P[0]-best.x,dy=P[1]-best.y,dl=Math.hypot(dx,dy)||1,tr=8+20*(1-Math.max(0,bd)/230),reach=Math.min(dl,best.cr+tr*0.6);put(NB-1,best.x+dx/dl*reach,best.y+dy/dl*reach,tr);}}
// drawn seldom (no GPU, or less motion asked for): still, and only when something moved
if(slow){var sig=W+'|'+H+'|'+th.look+th.night+th.contrast+GLLOW;for(var q=0;q<o.length;q++)sig+=','+Math.round(o[q]*400);if(sig===G.sig)return;G.sig=sig;}
var U=G.U;gl.uniform2f(U.uRes,W,H);gl.uniform1f(U.uT,slow?0:t);gl.uniform1f(U.uDpr,d);gl.uniform4fv(U.uB,o);gl.uniform3f(U.uRip,LQ.ripple[0],LQ.ripple[1],still?-10:LQ.ripple[2]);
gl.uniform1f(U.uStyle,th.look==='glass'?0:th.look==='pearl'?2:1);gl.uniform1f(U.uContrast,th.contrast?1:0);gl.uniform1f(U.uExposure,th.night?0.82:1);
gl.drawArrays(gl.TRIANGLES,0,3);}

`;
