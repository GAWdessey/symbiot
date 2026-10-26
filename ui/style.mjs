// symbiot — the page's stylesheet: every look (ferro, glass, pearl) and every size.
// Part of the app page: ui.mjs joins the parts in order. Plain text in a template literal,
// as ui.mjs was: no backticks or dollar-brace inside.
export default `<style>
@font-face{font-family:'Geist';src:url('/fonts/Geist-Variable.woff2') format('woff2');font-weight:100 900;font-style:normal;font-display:swap}
:root{--ink:#0E1A1F;--ink2:#15262C;--ink3:#1D333A;--line:#24404A;--bone:#F4F1EA;--text:#B7C9C4;--faint:#7E9690;--green:#3DDC97;--amber:#F2A541;--green-dim:#16322D;--sans:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
/* ---- the liquid: the app's home (adapt.mjs shapes it, home.mjs fills it) ---- */
/* Your colours, from the system, live: light/dark, contrast, transparency, forced colours. */
body.lq-light{--ink:#F4F6F9;--ink2:#FFFFFF;--ink3:#EDF0F4;--line:#D3D9E2;--bone:#0F1720;--text:#2B3644;--faint:#5C6878;--green:#0B7A55;--amber:#9A5200;--green-dim:#DDF2E9}
body.lq-look-ferro{--ink:#0B0C0E;--ink2:#131518;--ink3:#1B1E22;--line:#2A2E34;--bone:#F3F0EA;--text:#C9CDD3;--faint:#8A919B;--green-dim:#17241F}
body.lq-contrast{--line:#9FB3BB;--faint:#C9D6D2}
body.lq-light.lq-contrast{--line:#4A5565;--faint:#2B3644;--text:#10151C}
#liquid{display:none}
body.lq-liquid #liquid{display:block;position:fixed;inset:0;z-index:0;overflow:hidden;background:#08090B}
body.lq-liquid.lq-light #liquid{background:#EBEEF0}
body.lq-liquid.lq-look-pearl #liquid{background:#EDECE9}
#lq{position:absolute;inset:0;width:100%;height:100%;display:block}
body.lq-forced #lq{display:none}
#lqdrops{position:absolute;inset:0;pointer-events:none}
.lqd{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;border-radius:14px;border:1px solid transparent;background:transparent;color:#ECE9E4;font:600 13.5px/1.25 var(--sans);letter-spacing:-.005em;pointer-events:auto;transition:opacity .5s ease,background-color .2s ease,border-color .2s ease;will-change:transform;text-shadow:0 1px 10px rgba(0,0,0,.6)}
.lqd .lt .lm{display:block;font-weight:500;font-size:11.5px;color:#8A919B;margin-top:1px}
.lqd .lt{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:7px;min-height:32px;padding:4px 8px;cursor:pointer;text-align:center;max-width:170px}
.lqd.lq-proj .lt{flex-direction:column;gap:1px;max-width:190px}
.lqd.lq-run .lt{flex-direction:column;gap:1px;max-width:220px}
.lqd.lq-band .lt{flex-direction:column;align-items:flex-start;gap:1px;text-align:left;max-width:270px;width:270px;padding:2px 6px;min-height:0}
.lqd.lq-band .lt>span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.lqd.lq-band .lt .lm{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-width:100%}
.lqd.lq-band small,.lqd.lq-band .lgo{display:none}
.lqd.lq-proj .lt .lm{font-weight:500;font-size:11.5px;color:#8A919B;max-width:180px;-webkit-line-clamp:1}
body.lq-light .lqd.lq-proj .lt .lm,body.lq-light .lqd.lq-run .lt .lm{color:#5A6470}
.lqd.lq-you .lt::before,.lqd.lq-lit .lt::before{content:'';flex:none;width:7px;height:7px;border-radius:50%;background:#F2A541;box-shadow:0 0 0 3px rgba(242,165,65,.2)}
.lqd .lt span{overflow:hidden;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:12.5px;line-height:1.3;overflow-wrap:anywhere}
.lqd .lgo{display:none;margin:4px 10px 10px;min-height:38px;padding:0 16px;border-radius:999px;border:1px solid #FFFFFF;background:linear-gradient(180deg,#FFFFFF 0%,#D2D8E1 44%,#8E97A6 56%,#E6EAF0 100%);color:#06080B;font:700 12.5px var(--sans);cursor:pointer}
.lqd.open{z-index:5;border-radius:18px;background:rgba(16,18,21,.92);border-color:rgba(255,255,255,.12);box-shadow:0 24px 50px -20px rgba(0,0,0,.8);text-shadow:none;backdrop-filter:blur(12px)}.lqd.open .lt span{white-space:normal}.lqd.open .lt{max-width:280px}.lqd.open .lgo{display:block}
.lqd .lt:focus-visible,.lqd .lgo:focus-visible{outline:2px solid currentColor;outline-offset:2px;border-radius:999px}
.lqmb{min-height:44px;padding:8px 14px;border-radius:999px;border:1px solid rgba(220,228,240,.35);background:rgba(4,5,7,.72);backdrop-filter:blur(10px);color:#EEF2F8;font:600 13.5px var(--sans);cursor:pointer}
body.lq-light .lqmb{background:rgba(255,255,255,.86);color:#10151C;border-color:rgba(20,30,45,.25)}
.lqd small{display:none;font-weight:500;font-size:12.5px;line-height:1.4;color:#A1A8B1;max-width:260px;padding:0 15px 2px;text-align:center}.lqd.open small{display:block}
.lqd:hover .lt span{text-decoration:underline;text-decoration-color:rgba(255,255,255,.35);text-underline-offset:4px}
.lqd:focus-visible,#lqcore:focus-visible,#lqask:focus-visible{outline:2px solid currentColor;outline-offset:3px}
body.lq-light .lqd{color:#151A21;text-shadow:0 1px 8px rgba(255,255,255,.7)}
body.lq-light .lqd .lt .lm{color:#5A6470}
body.lq-light .lqd.open{background:rgba(255,255,255,.94);border-color:rgba(20,30,45,.1);box-shadow:0 24px 50px -24px rgba(30,45,60,.45)}
body.lq-light .lqd small{color:#4A5565}
body.lq-light .lqd:hover .lt span{text-decoration-color:rgba(21,26,33,.35)}
body.lq-contrast .lqd{background:#000;color:#FFF;border:2px solid #FFF}
body.lq-contrast .lqd small{color:#FFF}
body.lq-light.lq-contrast .lqd{background:#FFF;color:#000;border:2px solid #000}
body.lq-light.lq-contrast .lqd small{color:#000}
body.lq-solid .lqd,body.lq-solid .lqglass{backdrop-filter:none;background:#05070A}
body.lq-light.lq-solid .lqd,body.lq-light.lq-solid .lqglass{background:#FFFFFF}
body.lq-touch .lqd .lt{min-height:48px}
body.lq-keys .lqd:focus{outline:2px solid currentColor;outline-offset:3px}
#lqcore{position:absolute;left:0;top:0;padding:4px 8px;border:0;border-radius:12px;background:transparent;color:#F3F0EA;font:600 16px/1.25 var(--sans);letter-spacing:-.01em;text-align:center;cursor:pointer;transition:opacity .6s ease;white-space:normal;text-wrap:balance}
body.lq-light #lqcore{color:#151A21}
/* Pearl's sphere is a mirror, bright over its horizon and dark under it, so its words sit on a soft pearl plate that reads on both */
body.lq-look-pearl #lqcore.in{padding:10px 18px;border-radius:50%;background:radial-gradient(closest-side,rgba(250,250,248,.9) 0%,rgba(250,250,248,.78) 55%,rgba(250,250,248,0) 100%);text-shadow:0 0 1px #fff,0 0 8px rgba(255,255,255,.9)}
body.lq-look-pearl.lq-contrast #lqcore.in{background:#FFFFFF;border-radius:16px;text-shadow:none}
.lqglass{background:rgba(4,5,8,.78);border:1px solid rgba(220,228,240,.32);backdrop-filter:blur(14px)}
body.lq-light .lqglass{background:rgba(255,255,255,.82);border-color:rgba(20,30,45,.2)}
#lqform{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);width:min(640px,calc(100vw - 32px));display:flex;align-items:flex-end;gap:8px;padding:5px 5px 5px 6px;border-radius:20px;z-index:3;color:#ECE9E4}
#lqform.lqglass{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(16px)}
body.lq-light #lqform{color:#151A21}
body.lq-light #lqform.lqglass{background:rgba(255,255,255,.62);border-color:rgba(255,255,255,.9);box-shadow:0 20px 50px -30px rgba(30,45,60,.5)}
#lqask{flex:1;min-width:0;display:block;box-sizing:border-box;height:44px;min-height:44px;max-height:126px;padding:11px 12px;border:0;border-radius:14px;background:transparent;color:inherit;font:400 15.5px/22px var(--sans);outline:none;resize:none;overflow-y:hidden;overflow-wrap:anywhere;scrollbar-width:thin;scrollbar-color:rgba(236,233,228,.25) transparent}
#lqask.full{overflow-y:auto}body.lq-light #lqask{scrollbar-color:rgba(21,26,33,.25) transparent}
#lqask::-webkit-scrollbar{width:6px}#lqask::-webkit-scrollbar-thumb{background:rgba(236,233,228,.25);border-radius:3px}body.lq-light #lqask::-webkit-scrollbar-thumb{background:rgba(21,26,33,.25)}#lqask::-webkit-scrollbar-track{background:transparent}
#lqask::placeholder{color:#7A818B}
body.lq-light #lqask::placeholder{color:#6A7480}
#lqsend{flex:none;width:40px;height:40px;padding:0;display:grid;place-items:center;border-radius:50%;border:0;background:#F3F0EA;color:#0A0B0D;cursor:pointer}
body.lq-light #lqsend{background:#151A21;color:#FFFFFF}
body.lq-look-pearl #lqsend{background:linear-gradient(180deg,#FFFFFF 0%,#F1F2F5 60%,#E6E9EE 100%);color:#1B1E23;box-shadow:0 1px 2px rgba(21,26,33,.10),0 8px 18px -10px rgba(40,52,74,.45),inset 0 0 0 1px rgba(21,26,33,.10)}
#lqtalk{position:absolute;left:50%;bottom:88px;transform:translateX(-50%);width:min(640px,calc(100vw - 32px));display:flex;flex-direction:column;gap:16px;z-index:3;max-height:min(34vh,320px);overflow-x:hidden;overflow-y:auto;scrollbar-width:none;padding-top:90px;scroll-behavior:smooth;-webkit-mask-image:linear-gradient(to bottom,transparent 0,rgba(0,0,0,.12) 22%,rgba(0,0,0,.6) 48%,#000 72%);mask-image:linear-gradient(to bottom,transparent 0,rgba(0,0,0,.12) 22%,rgba(0,0,0,.6) 48%,#000 72%);transition:max-height .3s ease}
#lqtalk:hover,#lqtalk:focus-within,#lqtalk.back{max-height:min(56vh,560px);-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 60px);mask-image:linear-gradient(to bottom,transparent 0,#000 60px)}
#lqtalk .lqmsg{transition:opacity .4s ease}
#lqtalk:hover .lqmsg,#lqtalk.back .lqmsg{opacity:1 !important}
#lqtalk::-webkit-scrollbar{display:none}
/* the chat's own bar, between what was said and the input: Minimize shrinks it back to the
   input, and the Home under it comes back; minimized, one tap on "Chat · n" reopens it, history kept */
#lqtalkbar{position:absolute;left:50%;bottom:calc(26px + var(--lqfh,56px));transform:translateX(-50%);width:min(640px,calc(100vw - 32px));display:none;align-items:center;gap:10px;z-index:3;pointer-events:none;color:#8A919B;font:500 12px var(--sans)}
body.lq-chat #lqtalkbar,body.lq-chatmin #lqtalkbar{display:flex}
body.lq-chat #lqtalk{bottom:calc(64px + var(--lqfh,56px))}
body.lq-chatmin #lqtalk{display:none}
#lqtalkbar .lqtb-t{flex:1;min-width:0;padding-left:4px;letter-spacing:.02em}
#lqtalkbar .lqtb-t::after{content:'';display:inline-block;vertical-align:middle;width:calc(100% - 140px);max-width:420px;height:1px;margin-left:10px;background:linear-gradient(90deg,rgba(236,233,228,.18),rgba(236,233,228,0))}
#lqtalkbar button{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);backdrop-filter:blur(10px);color:#C9CDD3;font:500 12.5px var(--sans);cursor:pointer}
#lqtalkbar button:hover{border-color:rgba(255,255,255,.28);color:#ECE9E4}
#lqtalkbar button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
body.lq-chatmin #lqtalkbar{justify-content:center}
body.lq-light #lqtalkbar{color:#5A6470}
body.lq-light #lqtalkbar .lqtb-t::after{background:linear-gradient(90deg,rgba(21,26,33,.16),rgba(21,26,33,0))}
body.lq-light #lqtalkbar button{border-color:rgba(21,26,33,.12);background:rgba(255,255,255,.62);color:#2B3644}
body.lq-light #lqtalkbar button:hover{border-color:rgba(21,26,33,.3);color:#151A21}
body.lq-look-pearl #lqtalkbar button{background:linear-gradient(180deg,#FFFFFF 0%,#F1F2F5 60%,#E6E9EE 100%);color:#1B1E23;border-color:rgba(21,26,33,.10);box-shadow:0 1px 2px rgba(21,26,33,.10),0 8px 18px -10px rgba(40,52,74,.45)}
body.lq-touch #lqtalkbar button{min-height:40px}
body.lq-pooled #lqtalkbar{display:none}
.lqmsg{align-self:flex-start;max-width:92%;padding:0;border:0;background:none;color:#ECE9E4;font-size:15px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;text-shadow:0 1px 12px rgba(0,0,0,.7)}
.lqmsg.me{align-self:flex-end;max-width:80%;padding:8px 14px;border-radius:18px;background:rgba(255,255,255,.09);color:#C9CDD3;font-size:14.5px;text-shadow:none}
body.lq-light .lqmsg{color:#151A21;text-shadow:0 1px 10px rgba(255,255,255,.8)}
body.lq-light .lqmsg.me{background:rgba(21,26,33,.07);color:#151A21;text-shadow:none}
body.lq-look-pearl .lqmsg.me{background:#1B1E23;color:#F4F4F2}
#lqmore{position:absolute;right:16px;bottom:92px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;z-index:3}
body.lq-liquid header{position:fixed;top:0;left:0;right:0;z-index:4;background:transparent;pointer-events:none}
body.lq-liquid header .status,body.lq-liquid header .ver,body.lq-liquid #lqlook,body.lq-liquid #lqupd{pointer-events:auto} /* the header lets clicks through to the liquid; Updates wasn't on this list, so it couldn't be clicked (22 Oct 2026) */
#lqlook{display:none}
#lqlow{display:none}
body.lq-liquid #lqlow{display:inline-flex;align-items:center;pointer-events:auto;margin-left:8px;min-height:34px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#8A919B;font:500 12.5px var(--sans);cursor:pointer}
body.lq-liquid #lqlow[aria-pressed='true']{background:#F3F0EA;color:#0A0B0D;border-color:#F3F0EA}
#lqlow:focus-visible{outline:2px solid currentColor;outline-offset:2px}
body.lq-light #lqlow{background:rgba(21,26,33,.05);border-color:rgba(21,26,33,.1);color:#5A6470}
body.lq-light #lqlow[aria-pressed='true']{background:#151A21;color:#FFFFFF;border-color:#151A21}
body.lq-touch #lqlow{min-height:40px}
body.lq-low *,body.lq-low *::before,body.lq-low *::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
body.lq-liquid #lqlook{display:inline-flex;gap:2px;margin-left:10px;padding:3px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)}
#lqlook button{min-height:28px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:#8A919B;font:500 12.5px var(--sans);cursor:pointer}
#lqlook button[aria-checked='true']{background:#F3F0EA;color:#0A0B0D}
#lqlook button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
body.lq-light #lqlook{background:rgba(21,26,33,.05);border-color:rgba(21,26,33,.1)}
body.lq-light #lqlook button{color:#5A6470}
body.lq-light #lqlook button[aria-checked='true']{background:#151A21;color:#FFFFFF}
body.lq-touch #lqlook button{min-height:40px}
/* a phone's width: the version and the three looks on one line, none cut off. The name and the status line went past the screen's edge there (the status, wrapped, made the header 116px tall), and what the status says is on Home. Low GPU goes too: it ran off the edge, under an open panel's Close (15 Oct 2026) */
@media (max-width:520px){body.lq-liquid header .brand,body.lq-liquid header .status,body.lq-liquid #lqlow{display:none}body.lq-liquid header .ver{white-space:nowrap;padding:2px 6px}body.lq-liquid #lqlook{margin-left:6px}#lqlook button{padding:0 8px;font-size:12px}}
body.lq-liquid header .brand{letter-spacing:.38em;font-weight:500;text-transform:uppercase}
body.lq-liquid main{display:none}
body.lq-liquid.lq-pooled main{display:block;position:fixed;top:64px;left:max(12px,4vw);right:max(12px,4vw);bottom:88px;z-index:5;border-radius:24px;background:var(--ink);border:1px solid rgba(220,228,240,.25);box-shadow:0 30px 80px -30px rgba(0,0,0,.8)}
#lqsinkrow{display:none}
#lqwhy{display:none}
body.lq-liquid.lq-pooled #lqwhy.on{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px;color:#8A919B;font-size:13px;line-height:1.5}
#lqwhy .lqmb{min-height:34px;padding:5px 13px;font-size:13px}
body.lq-light #lqwhy{color:#5A6470}
body.lq-liquid.lq-pooled #lqsinkrow{display:flex;justify-content:space-between;align-items:center;gap:12px;position:sticky;top:0;z-index:2;margin:-8px -6px 10px;padding:6px 6px 10px;border-bottom:1px solid rgba(220,228,240,.12);background:#06080B}
body.lq-liquid.lq-light.lq-pooled #lqsinkrow{background:#F6F8FB;border-bottom-color:rgba(20,30,45,.1)}
/* where you are: the section (or the project) you opened, named large at the top of its panel */
.lqwhere{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px;min-width:0}
.lqcrumb{font:500 12.5px var(--sans);color:var(--faint);letter-spacing:.02em}
.lqcrumb::after{content:'\\203A';margin-left:8px}
#lqtitle{margin:0;font:650 24px/1.15 var(--sans);letter-spacing:-.02em;color:var(--bone);overflow-wrap:anywhere}
#lqtitle .lqpk{margin-left:10px;font:600 11.5px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--amber);vertical-align:middle}
#lqpark{align-self:center;padding:5px 12px;font-size:12.5px}
/* what the open panel does to itself (its Refresh) sits beside Close */
.lqacts,#lqtools{display:flex;align-items:center;gap:8px;flex:0 0 auto}#lqtools:empty,#lqtools:not(:has(>:not(.hidden))){display:none}
#pushtasks{padding:7px 14px;font-size:13px}
/* a phone's width: the panel's buttons drop under its name, rather than the name breaking mid-word (Workd/esk) to share the line with them (15 Oct 2026) */
@media (max-width:520px){body.lq-liquid.lq-pooled #lqsinkrow{flex-wrap:wrap}.lqwhere{flex:1 1 auto}.lqacts{margin-left:auto}#lqtitle{font-size:21px;overflow-wrap:break-word}}
#lqscene{display:none}
body.lq-work:not(.lq-pooled) #lqscene{display:block;position:absolute;left:50%;top:50px;transform:translateX(-50%);z-index:3;margin:0;font:650 24px/1.15 var(--sans);letter-spacing:-.02em;color:#F3F0EA;text-shadow:0 1px 12px rgba(0,0,0,.6);pointer-events:none;white-space:nowrap}
body.lq-light.lq-work #lqscene{color:#151A21;text-shadow:0 1px 10px rgba(255,255,255,.8)}
@media (max-width:700px){body.lq-work:not(.lq-pooled) #lqscene{left:auto;right:16px;transform:none;font-size:19px;top:58px}}
/* Quit: an X in the window's corner, like closing any app */
body.lq-liquid footer{position:fixed;right:12px;top:10px;border:0;padding:0;z-index:4}
body.lq-liquid header{padding-right:60px}
#quit{width:32px;height:32px;color:var(--faint)}
#quit:hover{color:var(--bone)}
body.lq-light #quit{border-color:rgba(20,30,45,.16);background:rgba(255,255,255,.6)}
/* the AI, the agent: no status while they work; only when one's missing, and then it's urgent */
.status.urgent{color:var(--amber);font-weight:600;cursor:pointer}
.status.hidden{display:none}
.lqd.lqblob.urgent{border-color:rgba(229,72,77,.7)}
.lqd.lqblob.urgent .lt span::before{content:'';display:inline-block;width:7px;height:7px;margin-right:7px;border-radius:50%;background:#E5484D;vertical-align:middle}
.lqd.lq-proj.lq-parked{opacity:.62}
.dh .apark{margin-left:auto;flex:none;padding:3px 11px;font-size:12px}
/* a review card for a run that stopped partway: what it waits on, and its questions first */
.rcard .partly{margin:8px 0 4px;padding:8px 10px;border-left:3px solid var(--amber);border-radius:0 10px 10px 0;background:rgba(242,165,65,.08);color:var(--bone);font-size:13px;line-height:1.45}
.rcard .partly b{color:var(--amber)}
body.lq-pooled #lqtalk,body.lq-pooled #lqmore,body.lq-pooled #lqcore{display:none}
/* the work view says where things stand in its line under the heading, not in the core */
body.lq-work #lqcore{display:none}
body.lq-pooled #lqgo,body.lq-pooled.lq-work #lqgo.on{display:none}
body.lq-talking .lqd{opacity:.55}
@media (prefers-reduced-motion: reduce){.lqd,#lqcore{transition:none}}
/* ---- the Symbiot look on every part: glass over the liquid, chrome, a silver edge ---- */
body.lq-liquid.lq-pooled main{background:rgba(6,8,11,.86);backdrop-filter:blur(20px) saturate(1.25);border:1px solid transparent;background-clip:padding-box;box-shadow:0 0 0 1px rgba(214,222,234,.22),0 40px 90px -30px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.12)}
body.lq-liquid.lq-light.lq-pooled main{background:rgba(246,248,251,.9);box-shadow:0 0 0 1px rgba(20,30,45,.14),0 40px 90px -40px rgba(20,30,45,.45),inset 0 1px 0 #FFFFFF}
body.lq-liquid.lq-solid.lq-pooled main{backdrop-filter:none;background:var(--ink)}
body.lq-liquid .task,body.lq-liquid .agent,body.lq-liquid .rcard,body.lq-liquid .bcard,body.lq-liquid .drift,body.lq-liquid .q,body.lq-liquid .out,body.lq-liquid .tchat{background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.02));border:1px solid rgba(220,228,240,.16);border-radius:16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 12px 30px -24px rgba(0,0,0,.9)}
body.lq-liquid.lq-light .task,body.lq-liquid.lq-light .agent,body.lq-liquid.lq-light .rcard,body.lq-liquid.lq-light .bcard,body.lq-liquid.lq-light .drift,body.lq-liquid.lq-light .q,body.lq-liquid.lq-light .out,body.lq-liquid.lq-light .tchat{background:linear-gradient(180deg,#FFFFFF,#F2F4F8);border-color:rgba(20,30,45,.12);box-shadow:inset 0 1px 0 #FFFFFF,0 12px 28px -24px rgba(20,30,45,.5)}
body.lq-liquid button.act{background:#F3F0EA;color:#0A0B0D;border:0;border-radius:999px;box-shadow:none;font-weight:600}
body.lq-liquid button.act:hover{background:#FFFFFF}
body.lq-liquid.lq-light button.act{background:#151A21;color:#FFFFFF}
body.lq-liquid.lq-look-pearl button.act,body.lq-look-pearl #lqgo.on,body.lq-liquid.lq-look-pearl .updatebar.show{background:linear-gradient(180deg,#FFFFFF 0%,#F1F2F5 60%,#E6E9EE 100%);color:#1B1E23;box-shadow:0 1px 2px rgba(21,26,33,.10),0 8px 18px -10px rgba(40,52,74,.45),inset 0 0 0 1px rgba(21,26,33,.10)}
body.lq-liquid button.ghost{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:999px;color:var(--bone);backdrop-filter:blur(6px)}
body.lq-liquid.lq-light button.ghost{background:rgba(255,255,255,.7);border-color:rgba(20,30,45,.18)}
body.lq-liquid input,body.lq-liquid select,body.lq-liquid textarea{border-radius:12px;border:1px solid rgba(220,228,240,.2);background:rgba(255,255,255,.04);color:var(--bone)}
body.lq-liquid.lq-light input,body.lq-liquid.lq-light select,body.lq-liquid.lq-light textarea{background-color:#FFFFFF;border-color:rgba(20,30,45,.18)}
body.lq-liquid input:focus,body.lq-liquid select:focus,body.lq-liquid textarea:focus{outline:none;border-color:rgba(255,255,255,.7);box-shadow:0 0 0 3px rgba(200,210,224,.18)}
body.lq-liquid .tgroup{color:#C9D1DC;letter-spacing:.16em}
body.lq-liquid.lq-light .tgroup{color:#3B4656}
body.lq-liquid h2,body.lq-liquid h3{letter-spacing:-.01em}
body.lq-liquid .fchip.on{background:#F3F0EA;color:#0A0B0D;border-color:#F3F0EA}
body.lq-liquid.lq-light .fchip.on{background:#151A21;color:#FFFFFF;border-color:#151A21}
body.lq-contrast.lq-liquid .task,body.lq-contrast.lq-liquid .agent{border:2px solid currentColor}

/* the work scene: tasks and agents in the liquid, with spheres revolving round what's at work */
#lqorbits{position:absolute;inset:0;pointer-events:none}
#lqgroups{position:absolute;inset:0;pointer-events:none}
.lqg{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:1px;padding:4px 10px;border:0;border-radius:12px;background:transparent;color:#ECE9E4;font:600 17px/1.15 var(--sans);letter-spacing:-.01em;cursor:pointer;transition:opacity .5s ease;will-change:transform;text-shadow:0 1px 12px rgba(0,0,0,.6)}
.lqg small{font:400 12px var(--sans);color:#8A919B;letter-spacing:0}
.lqg:hover span{text-decoration:underline;text-underline-offset:5px;text-decoration-color:rgba(255,255,255,.3)}
.lqg:focus-visible{outline:2px solid currentColor;outline-offset:2px}
body.lq-light .lqg{color:#151A21;text-shadow:0 1px 10px rgba(255,255,255,.8)}
body.lq-light .lqg small{color:#5A6470}
body.lq-pooled #lqgroups{display:none}
.lqorbit{position:absolute;left:0;top:0;pointer-events:none;transition:opacity .5s ease}
.lqorbit span{position:absolute;inset:0;animation:lqorbit 3.4s linear infinite}
.lqorbit span:nth-child(2){animation-duration:4.6s;animation-delay:-1.6s}
.lqorbit span:nth-child(3){animation-duration:5.8s;animation-delay:-3.9s;animation-direction:reverse}
.lqorbit i{position:absolute;left:50%;top:0;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFFFFF 0%,#C9CFD9 35%,#6F7887 75%,#2A2F38 100%);box-shadow:0 0 8px rgba(255,255,255,.35)}
.lqorbit.ask i{background:radial-gradient(circle at 35% 30%,#FFF4E2 0%,#F2A541 50%,#7A4A10 100%)}
@keyframes lqorbit{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.lqorbit span{animation:none}.lqorbit span:nth-child(2){transform:rotate(120deg)}.lqorbit span:nth-child(3){transform:rotate(240deg)}}
#lqgo,#lqback,#lqsort{display:none}
/* Go is docked in the corner, small: it never sits between you and the spheres */
body.lq-work #lqgo.on{display:inline-flex;position:absolute;left:112px;top:48px;z-index:4;align-items:center;gap:6px;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(220,228,240,.3);background:rgba(4,5,7,.6);backdrop-filter:blur(8px);color:#EEF2F8;font:600 13px var(--sans);cursor:pointer}
body.lq-work #lqgo.on::before{content:'';width:7px;height:7px;border-radius:50%;background:#3DDC97}
body.lq-work #lqgo.on:hover{border-color:rgba(220,228,240,.6)}
body.lq-work #lqgo.on:focus-visible{outline:2px solid currentColor;outline-offset:2px}
body.lq-light.lq-work #lqgo.on{background:rgba(255,255,255,.8);color:#10151C;border-color:rgba(20,30,45,.2)}
body.lq-light.lq-work #lqgo.on::before{background:#0B7A55}
body.lq-touch.lq-work #lqgo.on{min-height:44px}

/* the lanes' order, in the Projects scene: what needs you first, the most recent, or by name */
body.lq-work.lq-byproj #lqsort{display:inline-flex;position:absolute;left:112px;top:52px;z-index:4;gap:2px;padding:3px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)}
#lqsort button{min-height:36px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:#8A919B;font:500 12.5px var(--sans);cursor:pointer}
#lqsort button[aria-checked='true']{background:#F3F0EA;color:#0A0B0D}
#lqsort button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
body.lq-light #lqsort{background:rgba(21,26,33,.05);border-color:rgba(21,26,33,.1)}
body.lq-light #lqsort button{color:#5A6470}
body.lq-light #lqsort button[aria-checked='true']{background:#151A21;color:#FFFFFF}
body.lq-look-pearl #lqsort button[aria-checked='true']{background:linear-gradient(180deg,#FFFFFF 0%,#F1F2F5 60%,#E6E9EE 100%);color:#1B1E23}
body.lq-touch #lqsort button{min-height:44px}
body.lq-pooled #lqsort{display:none!important}
@media (max-width:700px){body.lq-work.lq-byproj #lqsort{left:16px;top:104px}}
/* home's needs-you band: each lit lane orb, a liquid line, and its blob: the project,
   the question in a line, its two answers (or your own words), and what opens it */
#lqneedt{display:none;position:absolute;left:0;top:0;flex-direction:row;align-items:center;flex-wrap:wrap;gap:4px 12px;max-width:calc(100vw - 24px);color:#ECE9E4;font:600 17px/1.15 var(--sans);letter-spacing:-.01em;text-shadow:0 1px 12px rgba(0,0,0,.6);pointer-events:none;transition:opacity .5s ease}
#lqneedt small{font:400 12px var(--sans);color:#8A919B;letter-spacing:0}
#lqneedt.on{display:flex}
body.lq-light #lqneedt{color:#151A21;text-shadow:0 1px 10px rgba(255,255,255,.8)}
body.lq-light #lqneedt small{color:#5A6470}
body.lq-pooled #lqneedt,body.lq-work #lqneedt{display:none}
.lqd.lqblob{width:250px;align-items:stretch;gap:6px;padding:9px 11px 11px;border-radius:18px;background:rgba(12,14,17,.84);border-color:rgba(242,165,65,.38);backdrop-filter:blur(12px);box-shadow:0 18px 40px -22px rgba(0,0,0,.85);text-shadow:none;font-weight:500}
.lqd.lqblob .lt{max-width:none;justify-content:space-between;min-height:28px;padding:0 2px;font:700 13px var(--sans);gap:6px}
.lqd.lqblob .lt::before{display:none}
.lqd.lqblob .lt span{-webkit-line-clamp:1;font-size:13px}
.lqd.lqblob .lt i{font-style:normal;color:#8A919B;font-weight:500;flex:none}
.lqblob .bq{font-size:12.5px;line-height:1.35;color:#C9CDD3;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;cursor:pointer}
.lqblob .bq.open{display:block;-webkit-line-clamp:unset;line-clamp:none}
.lqblob .bq code,.agent .dd code,.q .qc code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;background:rgba(127,127,127,.16);border-radius:4px;padding:0 4px}
.lqblob .bq code.bcode,.q .qc code.bcode{display:block;white-space:pre-wrap;margin:4px 0;padding:6px 8px;border-radius:7px}
.bproj{display:inline-block;flex:none;font:500 10.5px/1.5 var(--sans);letter-spacing:.02em;padding:0 7px;margin-right:6px;border-radius:999px;border:1px solid var(--line);color:var(--faint);max-width:9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle}
.lqd.lqblob .lt .bproj{-webkit-line-clamp:unset;font-size:10.5px}
.bproj.none{font-style:italic}
.lqblob .bo{display:flex;flex-direction:column;gap:5px}
.lqblob .nopt,.lqblob .bfree,.lqblob .bfx button{all:unset;box-sizing:border-box;cursor:pointer;font:500 12.5px/1.3 var(--sans)}
.lqblob .nopt{display:block;width:100%;min-height:34px;padding:7px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#ECE9E4}
.lqblob .nopt span.bt{display:block;white-space:normal;overflow-wrap:anywhere}
.lqblob .nopt.rec{background:#F3F0EA;color:#0A0B0D;border-color:#F3F0EA}
.lqblob .nopt:hover{border-color:rgba(255,255,255,.45)}
.lqblob .nopt .who{font-size:11px;padding:0 6px;margin-right:4px;background:transparent;color:inherit;border:1px solid currentColor;opacity:.8}
.lqblob .bfree{align-self:flex-start;padding:2px 2px;color:#8A919B;font-size:12px;text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(255,255,255,.25)}
.lqblob .bfx{display:flex;gap:6px}
.lqblob .bfx input{flex:1;min-width:0;min-height:34px;padding:0 10px;border-radius:12px;border:1px solid rgba(220,228,240,.25);background:rgba(255,255,255,.05);color:inherit;font:400 13px var(--sans)}
.lqblob .bfx button{padding:0 12px;border-radius:12px;background:#F3F0EA;color:#0A0B0D;font-weight:600}
.lqblob .bfx.hidden{display:none}
.lqblob .bmore{font-size:11.5px;color:#8A919B}
/* a drafted reply on its card, as it will look where it goes (watch.mjs draftCard) */
.dmsg{border-radius:14px;padding:8px 11px;max-height:132px;overflow:auto;font:400 13px/1.42 var(--sans);text-align:left}
.dmsg .dmto{font-size:11.5px;font-weight:600;margin-bottom:4px}
.dmsg .dmb{white-space:pre-wrap;overflow-wrap:anywhere}
.dm-social{background:#FFFFFF;color:#191919;border:1px solid #E0DFDC}.dm-social .dmto{color:#0A66C2}
.dm-chat{background:#D9FDD3;color:#111B21;margin-left:16px;border-top-right-radius:4px}.dm-chat .dmto{color:#1F7A4C}
.dm-mail{background:#FFFFFF;color:#202124;border:1px solid #DADCE0}.dm-mail .dmto{color:#5F6368}
.lqblob .btalk{margin:6px 0 2px;display:flex;flex-direction:column;gap:4px;max-height:180px;overflow-y:auto}
.lqblob .btm{font-size:12px;line-height:1.35;padding:5px 8px;border-radius:9px;overflow-wrap:anywhere;color:#C9CDD3;background:rgba(255,255,255,.05)}
.lqblob .btm.me{align-self:flex-end;max-width:85%;background:rgba(232,176,75,.12)}
.lqblob .btm.ag{align-self:flex-start;max-width:95%}
.lqblob .btm b{font-weight:600;margin-right:4px;color:#E8EAED}
body.lq-light .lqblob .btm{color:#2B3644;background:rgba(0,0,0,.05)}
body.lq-light .lqblob .btm.me{background:rgba(176,120,20,.12)}
body.lq-light .lqblob .btm b{color:#141A22}
.lqblob .bdoing{font-size:11.5px;line-height:1.3;color:#8A919B;margin-bottom:3px;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}.lqblob .bdoing i{margin-right:4px;vertical-align:-1px}
body.lq-light .lqblob .bdoing{color:#5A6470}body.lq-contrast .lqblob .bdoing{color:inherit}
.lqblob .bwhy{font-size:11.5px;line-height:1.3;color:#8A919B;margin-top:3px;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}
.lqblob .nopt .brec{display:block;font-style:normal;font-size:10.5px;opacity:.7;margin-top:1px}
body.lq-light .lqblob .bwhy{color:#5A6470}
.lqblob .bgo{font-size:12px;line-height:1.35;color:#C9CDD3;margin-top:6px;overflow:hidden;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}
.lqblob .bgo b{font-weight:600;color:#F3F0EA}
.lqblob .bmoney{font-size:12px;line-height:1.35;color:#E8C27A;margin-top:3px;font-weight:600;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}
body.lq-light .lqblob .bgo{color:#2B3644}body.lq-light .lqblob .bgo b{color:#151A21}body.lq-light .lqblob .bmoney{color:#7A4F00}
body.lq-contrast .lqblob .bgo,body.lq-contrast .lqblob .bgo b,body.lq-contrast .lqblob .bmoney{color:inherit}
body.lq-look-pearl .lqblob .nopt.rec.bgoyes,body.lq-look-pearl .aq .qgoyes{background:linear-gradient(180deg,#4A505A 0%,#2A2E35 55%,#1B1E23 100%);color:#FFFFFF;border-color:#1B1E23}
#lqupd{position:relative;margin-left:10px}
#lqupd .lqupb{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#ECE9E4;border-radius:999px;padding:5px 12px;font:500 12.5px var(--sans);cursor:pointer;min-height:30px}
#lqupd .lqupl{display:none;position:absolute;left:0;top:calc(100% + 6px);z-index:60;width:min(460px,calc(100vw - 32px));max-height:60vh;overflow-y:auto;background:#15191F;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:6px;box-shadow:0 12px 40px rgba(0,0,0,.45)}
#lqupd.open .lqupl{display:block}
@media (max-width:640px){#lqupd{position:fixed;top:54px;left:16px;right:auto;margin:0;z-index:61}#lqupd .lqupb{padding:4px 10px;font-size:12px;min-height:28px}#lqupd .lqupl{position:fixed;left:16px;right:16px;top:90px;width:auto}}
#lqupd .lqupi{display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;font-size:12.5px;line-height:1.35;color:#C9CDD3}
#lqupd .lqupm{flex-direction:column;align-items:stretch;gap:6px}#lqupd .lqupmh{display:flex;align-items:center;justify-content:space-between}
#lqupd .lqmv{display:flex;flex-direction:column;gap:4px;padding:6px 0}#lqupd .lqmv+.lqmv{border-top:1px dashed rgba(255,255,255,.07)}
#lqupd .lqmt{font-size:12.5px;line-height:1.4;overflow-wrap:anywhere}#lqupd .lqmrow{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
#lqupd .lqmrow button{font-size:11.5px;padding:3px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:inherit;cursor:pointer}
#lqupd .lqmrow .lqdo{background:#ECE9E4;color:#151A21;border-color:transparent;font-weight:600}
#lqupd .lqms{font-size:11px;opacity:.65}
#lqupd .lqask{display:flex;gap:6px}#lqupd .lqask input{flex:1;min-width:0;width:auto;padding:6px 10px;font-size:12px;border-radius:10px;min-height:0}#lqupd .lqask button{font-size:12px;padding:5px 12px;border-radius:10px;width:auto}
#lqupd .lqans{font-size:12px;line-height:1.4;white-space:pre-wrap;opacity:.9}#lqupd .lqans.err{color:#E88}
body.lq-light #lqupd .lqmrow button{border-color:rgba(20,30,45,.14);background:rgba(20,30,45,.04)}body.lq-light #lqupd .lqmrow .lqdo{background:#151A21;color:#FFFFFF}body.lq-light #lqupd .lqmv+.lqmv{border-top-color:rgba(20,30,45,.08)}
#lqupd .lqupi+.lqupi{border-top:1px solid rgba(255,255,255,.06)}
#lqupd .lqupt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}#lqupd .lqupt{cursor:pointer}#lqupd .lqupt.full{display:block;-webkit-line-clamp:unset;line-clamp:none;overflow:visible}
#lqupd .lqupt b{color:#ECE9E4;font-weight:600}
#lqupd .lqupr,#lqupd .lqupx{border:1px solid rgba(255,255,255,.14);background:transparent;color:#ECE9E4;border-radius:8px;padding:4px 9px;font:500 12px var(--sans);cursor:pointer;min-height:28px}
body.lq-light #lqupd .lqupb{border-color:rgba(20,30,45,.16);background:#FFFFFF;color:#151A21}
body.lq-light #lqupd .lqupl{background:#FFFFFF;border-color:rgba(20,30,45,.12);box-shadow:0 12px 40px rgba(20,30,45,.18)}
body.lq-light #lqupd .lqupi{color:#2B3644}
body.lq-light #lqupd .lqupi+.lqupi{border-top-color:rgba(20,30,45,.08)}
body.lq-light #lqupd .lqupt b{color:#151A21}
body.lq-light #lqupd .lqupr,body.lq-light #lqupd .lqupx{border-color:rgba(20,30,45,.16);color:#151A21}
.lqblob .bfor{font-size:11.5px;line-height:1.3;color:#8A919B;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.lqblob .bwait{font-size:11.5px;line-height:1.3;color:#E0B25A;display:flex;align-items:center;gap:5px}
body.lq-light .lqblob .bwait{color:#8A5A00}
/* the work a question asks about is done already (lanes.mjs doneSince); a click's own feedback: the button pressed, Sending…, or what went wrong */
.lqblob .brun{margin:8px 0;padding:9px;border:1px solid rgba(232,168,124,.35);border-radius:10px;background:rgba(0,0,0,.22)}.lqblob .brun-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:12.5px}.lqblob .brun-term,.lqblob .brun-copy{font:inherit;font-size:12px;padding:4px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:inherit;cursor:pointer}.lqblob .brun-i{margin:6px 0}.lqblob .brun-w{font-size:12px;opacity:.85;margin-bottom:3px}.lqblob .brun-c{display:flex;gap:6px;align-items:flex-start}.lqblob .brun-c pre{flex:1;margin:0;padding:6px 8px;border-radius:7px;background:rgba(0,0,0,.45);font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;user-select:all}.lqblob .brun-n{font-size:11.5px;opacity:.75;margin:6px 0}
body.lq-light .lqblob .brun{background:rgba(0,0,0,.04)}body.lq-light .lqblob .brun-c pre{background:rgba(0,0,0,.07)}body.lq-light .lqblob .brun-term,body.lq-light .lqblob .brun-copy{border-color:rgba(0,0,0,.25);background:rgba(0,0,0,.05)}
.lqblob .bdone{font-size:12px;line-height:1.35;color:#7FD8A6;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.lqblob .bst{font-size:12px;line-height:1.35;color:#8A919B}.lqblob .bst:empty{display:none}.lqblob .bst.err{color:#F2A541}
.lqblob .nopt.pressed,.lqblob .bfx button.pressed{opacity:1;box-shadow:inset 0 0 0 2px currentColor}
.lqblob.sending .nopt:not(.pressed),.lqblob.sending .bfx button:not(.pressed),.lqblob.sending .bfree{opacity:.45;cursor:default}
.lqblob.sending .nopt:hover{border-color:rgba(255,255,255,.16)}
.lqblob .nopt:focus-visible,.lqblob .bfree:focus-visible,.lqblob .bfx button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
/* a card's own dismiss, top right: the card goes, Undo brings it back (lqUndo) */
.lqblob:not(.lqd){position:relative}.lqd.lqblob>.lt,.lqblob>.nhead{padding-right:30px}
.lqblob .bx{all:unset;box-sizing:border-box;position:absolute;top:7px;right:7px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#8A919B;font:400 18px/1 var(--sans)}
.lqblob .bx:hover{color:#ECE9E4;background:rgba(255,255,255,.09)}.lqblob .bx:focus-visible{outline:2px solid currentColor;outline-offset:1px}
body.lq-light .lqblob .bx{color:#5A6470}body.lq-light .lqblob .bx:hover{color:#151A21;background:rgba(20,30,45,.07)}body.lq-contrast .lqblob .bx{color:inherit}
.lqd .lrm{all:unset;box-sizing:border-box;position:absolute;top:0;right:-26px;width:24px;height:24px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(12,14,17,.72);color:#C9CDD3;font:400 16px/1 var(--sans);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:.6;transition:opacity .15s ease;text-shadow:none}
.lqd:hover .lrm,.lqd .lrm:focus-visible,body.lq-touch .lqd .lrm{opacity:1}.lqd .lrm:hover{color:#FFFFFF;border-color:rgba(255,255,255,.5)}.lqd .lrm:focus-visible{outline:2px solid currentColor;outline-offset:2px}
body.lq-light .lqd .lrm{background:rgba(255,255,255,.88);color:#3A4552;border-color:rgba(20,30,45,.2)}body.lq-light .lqd .lrm:hover{color:#151A21;border-color:rgba(20,30,45,.45)}
body.lq-contrast .lqd .lrm{background:inherit;color:inherit;border:2px solid currentColor;opacity:1}
#undobar{position:fixed;left:50%;bottom:104px;transform:translate(-50%,12px);z-index:80;display:flex;align-items:center;gap:12px;max-width:min(560px,calc(100vw - 32px));padding:8px 8px 8px 16px;border-radius:999px;background:var(--ink2);color:var(--bone);border:1px solid var(--line);box-shadow:0 18px 40px -18px rgba(0,0,0,.6);font:500 13px/1.35 var(--sans);opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease}
#undobar.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}#undobar span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
#undobar .undo{flex:none;min-height:32px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--amber);font:700 12.5px var(--sans);cursor:pointer}#undobar .undo:hover{border-color:var(--amber)}#undobar .undo:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.lqblob.gone{opacity:0!important;filter:blur(8px);transition:opacity .6s ease,filter .6s ease;pointer-events:none!important}
body.lq-light .lqd.lqblob{background:rgba(255,255,255,.94);border-color:rgba(154,82,0,.32);box-shadow:0 18px 40px -26px rgba(30,45,60,.5)}
body.lq-light .lqblob .bq{color:#2B3644}
body.lq-light .lqblob .nopt{background:#FFFFFF;border-color:rgba(20,30,45,.16);color:#151A21}
body.lq-light .lqblob .nopt.rec{background:#151A21;color:#FFFFFF;border-color:#151A21}
body.lq-light .lqblob .bfx input{background:#FFFFFF;border-color:rgba(20,30,45,.18)}
body.lq-light .lqblob .bfx button{background:#151A21;color:#FFFFFF}
body.lq-light .lqblob .bfree,body.lq-light .lqd.lqblob .lt i,body.lq-light .lqblob .bmore,body.lq-light .lqblob .bfor,body.lq-light .lqblob .bst{color:#5A6470}
body.lq-light .lqblob .bdone{color:#1F7A4C}body.lq-light .lqblob .bst.err{color:#9A5200}
body.lq-look-pearl .lqblob .nopt.rec,body.lq-look-pearl .lqblob .bfx button{background:linear-gradient(180deg,#FFFFFF 0%,#F1F2F5 60%,#E6E9EE 100%);color:#1B1E23;border-color:rgba(0,0,0,.08)}
body.lq-contrast .lqblob .nopt{border:2px solid currentColor}
body.lq-touch .lqblob .nopt,body.lq-touch .lqblob .bfx input{min-height:44px}
body.lq-talking .lqd.lqblob{opacity:.55}
@media (prefers-reduced-motion: reduce){.lqblob.gone{transition:none}}
/* next up: with nothing waiting on you, a few things that can be done next, each with its gain and one tap */
#lqnext{display:none;position:absolute;left:0;top:0;box-sizing:border-box;flex-direction:column;gap:6px;padding:10px 12px 12px;border-radius:18px;background:rgba(12,14,17,.84);border:1px solid rgba(220,228,240,.16);backdrop-filter:blur(12px);box-shadow:0 18px 40px -22px rgba(0,0,0,.85);color:#ECE9E4;font:500 13px/1.3 var(--sans);z-index:2;transition:opacity .5s ease}
#lqnext.on{display:flex}
#lqnext .nxh{display:flex;align-items:baseline;gap:10px;padding:0 2px}
#lqnext .nxh span{font:600 15px var(--sans);letter-spacing:-.01em}
#lqnext .nxh small{flex:1;font:400 12px var(--sans);color:#8A919B}
#lqnext .nxx{all:unset;box-sizing:border-box;cursor:pointer;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:18px;color:#8A919B}
#lqnext .nxx:hover{color:#ECE9E4;background:rgba(255,255,255,.08)}
#lqnext ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
#lqnext ol.two{display:grid;grid-template-columns:1fr 1fr}
#lqnext .nxpg{all:unset;box-sizing:border-box;cursor:pointer;min-height:28px;padding:2px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);font:500 12px var(--sans);color:#C9CDD3}
body.lq-light #lqnext .nxpg{border-color:rgba(20,30,45,.16);color:#2B3644}
#lqnext .nxpg:focus-visible{outline:2px solid currentColor;outline-offset:2px}
#lqnext li{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 12px;border-radius:13px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);transition:opacity .5s ease,filter .5s ease}
#lqnext li.gone{opacity:0;filter:blur(6px);pointer-events:none}
#lqnext .nxt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
#lqnext .nxt b{font-weight:600;font-size:13px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
#lqnext .nxt span{font-size:12px;color:#9AA1AB;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
#lqnext .nxgo{all:unset;box-sizing:border-box;cursor:pointer;flex:none;min-height:32px;padding:6px 12px;border-radius:12px;background:#F3F0EA;color:#0A0B0D;font:600 12.5px var(--sans);white-space:nowrap}
#lqnext .nxerr{flex-basis:100%;margin-top:6px;font-size:12px;color:#E8A87C}
#lqnext .nxgo:disabled{opacity:.5;cursor:default}
#lqnext .nxx:focus-visible,#lqnext .nxgo:focus-visible{outline:2px solid currentColor;outline-offset:2px}
body.lq-light #lqnext{background:rgba(255,255,255,.94);border-color:rgba(20,30,45,.12);box-shadow:0 18px 40px -26px rgba(30,45,60,.5);color:#151A21}
body.lq-light #lqnext li{background:#FFFFFF;border-color:rgba(20,30,45,.12)}
body.lq-light #lqnext .nxh small,body.lq-light #lqnext .nxx,body.lq-light #lqnext .nxt span{color:#5A6470}
body.lq-light #lqnext .nxx:hover{color:#151A21;background:rgba(20,30,45,.06)}
body.lq-light #lqnext .nxgo{background:#151A21;color:#FFFFFF}
body.lq-look-pearl #lqnext .nxgo{background:linear-gradient(180deg,#FFFFFF 0%,#F1F2F5 60%,#E6E9EE 100%);color:#1B1E23;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
body.lq-contrast #lqnext li{border:2px solid currentColor}
body.lq-touch #lqnext .nxgo,body.lq-touch #lqnext .nxx,body.lq-touch #lqnext .nxpg{min-height:44px;min-width:44px}
body.lq-talking #lqnext{opacity:.55}
body.lq-pooled #lqnext,body.lq-work #lqnext{display:none}
@media (max-width:520px){#lqnext .nxh small{display:none}#lqnext .nxh span{flex:1}}
@media (prefers-reduced-motion: reduce){#lqnext li{transition:none}}
/* what lit an orb, lit up where it opens: the project's asks, its Approve, its held handovers */
.lit{scroll-margin-top:72px;position:relative;box-shadow:0 0 0 2px #F2A541,0 0 0 7px rgba(242,165,65,.18)!important;border-radius:16px;animation:lqlit 1.6s ease-out 2}
@keyframes lqlit{0%{box-shadow:0 0 0 2px #F2A541,0 0 0 18px rgba(242,165,65,.35)}100%{box-shadow:0 0 0 2px #F2A541,0 0 0 7px rgba(242,165,65,.18)}}
@media (prefers-reduced-motion: reduce){.lit{animation:none}}
/* Settings' first steps: in order, each ticking itself, gone once all are done */
#firststeps ol{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
#firststeps li{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:14px;border:1px solid var(--line)}
#firststeps li.next{border-color:var(--amber)}
#firststeps .fsn{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font:700 12.5px var(--sans);border:1.5px solid var(--faint);color:var(--faint)}
#firststeps li.done .fsn{background:var(--green);border-color:var(--green);color:var(--ink)}
#firststeps li.next .fsn{border-color:var(--amber);color:var(--amber)}
#firststeps .fst{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
#firststeps .fst b{color:var(--bone);font-weight:600}
#firststeps li.done .fst b{color:var(--text)}
#firststeps .fst span{font-size:12.5px;color:var(--faint);overflow-wrap:anywhere}
#firststeps li button{flex:none;padding:5px 12px;font-size:12.5px}
#needsbox:empty{display:none}
#pushout .pushed{margin-top:6px;padding:10px 14px}#pushout .pushed .dh{flex-wrap:wrap;row-gap:2px}#pushout .pushed .dd{font-size:12.5px;line-height:1.5}#pushout>.dd{margin-top:4px}
#needsbox{margin:4px 0 12px}
#needsbox .nitem{display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:12px 14px;margin-top:8px}
#needsbox .nitem .nopt{max-width:720px}
#needsbox .nhead{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
#needsbox .nhead b{color:var(--bone)}
#needsbox .nopts{display:flex;flex-wrap:wrap;gap:6px}
#needsbox .nopts button{max-width:100%;text-align:left;white-space:normal}
body.lq-work #lqback{display:inline-flex;position:absolute;left:16px;top:52px;z-index:4;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid rgba(220,228,240,.3);background:rgba(4,5,7,.6);backdrop-filter:blur(8px);color:#EEF2F8;font:600 14px var(--sans);cursor:pointer}
body.lq-light.lq-work #lqback{background:rgba(255,255,255,.8);color:#10151C;border-color:rgba(20,30,45,.2)}
body.lq-pooled #lqgo,body.lq-pooled #lqback,body.lq-pooled #lqorbits,body.lq-work #lqgroups{display:none}
.lqd.lq-ready{border-color:#F2A541}
.lqd.lq-park{border-style:dashed}
/* the live work of an agent: what it's doing, its to-dos, its steps, its files, its pace */
.wk{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px;margin-top:10px}
.wkbox{border-radius:14px;padding:10px 12px;background:rgba(255,255,255,.035);border:1px solid rgba(220,228,240,.12)}
body.lq-light .wkbox{background:#F6F8FB;border-color:rgba(20,30,45,.1)}
.wkh{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-bottom:6px;display:flex;gap:6px;align-items:center}
.wkstats{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.wkstat{font-size:11.5px;padding:3px 9px;border-radius:999px;border:1px solid rgba(220,228,240,.2);color:var(--text);white-space:nowrap}
.wkstat b{color:var(--bone)}
.wkdoing{margin-top:10px;font-size:14px;font-weight:600;background:linear-gradient(90deg,#8C96A6 0%,#FFFFFF 40%,#8C96A6 60%,#8C96A6 100%);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lqshim 2.2s linear infinite}
body.lq-light .wkdoing{background-image:linear-gradient(90deg,#4A5565 0%,#0F1720 40%,#4A5565 60%,#4A5565 100%)}
@keyframes lqshim{0%{background-position:120% 0}100%{background-position:-120% 0}}
.wktodo{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.4;padding:3px 0}
.wktodo i{flex:none;width:12px;height:12px;margin-top:2px;border-radius:50%;border:1.5px solid var(--faint)}
.wktodo.in_progress i{border-color:var(--bone);background:conic-gradient(var(--bone) 0 50%,transparent 50%);animation:lqspin 1.4s linear infinite}
.wktodo.completed i{border-color:var(--green);background:var(--green)}
.wktodo.completed span{color:var(--faint);text-decoration:line-through}
@keyframes lqspin{to{transform:rotate(360deg)}}
.wkstep{display:flex;gap:8px;align-items:center;font-size:12.5px;padding:3px 0;min-width:0}
.wkstep svg{flex:none;opacity:.85}
.wkstep .wt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wkstep .wt b{font-weight:600;color:var(--bone)}
.wkstep .wm{flex:none;font-size:11px;color:var(--faint)}
.wkstep.error .wt{color:#FF8A75}.wkstep.running .wt{color:var(--bone)}
.wktest{font-size:11px;padding:1px 7px;border-radius:999px;background:rgba(61,220,151,.14);color:var(--green);white-space:nowrap}
.wktest.bad{background:rgba(255,138,117,.16);color:#FF8A75}
.wkfile{display:flex;gap:8px;align-items:center;font-size:12px;padding:2px 0}
.wkfile .fn{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Menlo,Consolas,monospace}
.wkfile .fb{flex:1;height:6px;border-radius:3px;background:rgba(220,228,240,.12);overflow:hidden}
.wkfile .fb i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#8E97A6,#FFFFFF)}
body.lq-light .wkfile .fb i{background:linear-gradient(90deg,#6F7887,#0F1720)}
.wkfinal{margin-top:10px;font-size:13px;line-height:1.55;white-space:pre-wrap}
.wkraw summary{cursor:pointer;font-size:12px;color:var(--faint);margin-top:10px}
.orb{flex:none;display:inline-block;width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFFFFF 0%,#C9CFD9 30%,#6F7887 70%,#2A2F38 100%);box-shadow:0 0 0 1px rgba(255,255,255,.25)}
.orb.run{animation:lqpulse 1.6s ease-in-out infinite}.orb.paused{background:radial-gradient(circle at 35% 30%,#FFF1CF 0%,#F2B94B 45%,#7A5A12 100%)}.orb.fail{background:radial-gradient(circle at 35% 30%,#FFE1DA 0%,#FF8A75 45%,#7A2A1C 100%)}
@keyframes lqpulse{0%,100%{transform:scale(1);box-shadow:0 0 0 1px rgba(255,255,255,.25)}50%{transform:scale(1.18);box-shadow:0 0 14px 2px rgba(255,255,255,.35)}}
details.steps{margin-top:6px;white-space:normal;font-size:12.5px;color:var(--faint);text-shadow:none}
details.steps summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:6px}
details.steps summary::-webkit-details-marker{display:none}
details.steps summary::before{content:'';width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .2s ease}
details.steps[open] summary::before{transform:rotate(45deg)}
details.steps ul{margin:6px 0 0;padding:0 0 0 12px;list-style:none;border-left:1px solid var(--line);display:flex;flex-direction:column;gap:3px}
.lqmsg .lqalts{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px;color:#8A919B;font-size:13px}
.lqmsg .lqalts .lqmb{min-height:36px;padding:6px 14px;font-size:13px;text-shadow:none}
body.lq-light .lqmsg .lqalts{color:#5A6470}
.lqmsg details.steps{color:#8A919B}
body.lq-light .lqmsg details.steps{color:#5A6470}
.thinking{background:linear-gradient(90deg,#8C96A6 0%,#FFFFFF 40%,#8C96A6 60%,#8C96A6 100%);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent !important;animation:lqshim 2.2s linear infinite}
body.lq-light .thinking{background-image:linear-gradient(90deg,#4A5565 0%,#0F1720 40%,#4A5565 60%,#4A5565 100%)}
@media (prefers-reduced-motion: reduce){.wkdoing,.thinking,.orb.run,.wktodo.in_progress i{animation:none}}


*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--ink);color:var(--text);font-family:var(--sans);font-size:14px;display:flex;flex-direction:column}
header{padding:16px 18px 10px;display:flex;align-items:center;gap:10px}
.dot{width:10px;height:10px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green)}
header .dot{width:22px;height:22px;border-radius:6px;background:center/contain no-repeat url('/favicon.svg?small=1');box-shadow:none}
.brand{font-weight:700;color:var(--bone);font-size:16px}
.status{margin-left:auto;font-size:12px;color:var(--faint);text-align:right;max-width:52%}
.rtabs{display:flex;gap:6px;border-bottom:1px solid var(--line);margin-bottom:8px;overflow-x:auto}
.tab{padding:9px 14px;border:0;background:none;color:var(--faint);font:inherit;font-weight:600;cursor:pointer;border-bottom:2px solid transparent}
.tab.active{color:var(--bone);border-bottom-color:var(--green)}
main{flex:1;overflow:auto;padding:16px 18px}
.row{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
/* an open report: its back-to-all-reports row rides along while the report scrolls under it */
#reportslist:has(#reportback){position:sticky;top:0;z-index:3;background:var(--ink);padding-bottom:4px}
button.act{background:var(--green);color:var(--ink);border:0;border-radius:10px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer}
button.act:hover{filter:brightness(1.08)}
button.ghost{background:var(--ink3);color:var(--bone);border:1px solid var(--line);border-radius:10px;padding:9px 14px;font:inherit;font-weight:600;cursor:pointer}
button.ghost:hover{border-color:var(--faint)}
.out{white-space:pre-wrap;background:var(--ink2);border:1px solid var(--line);border-radius:12px;padding:16px;min-height:180px;color:var(--bone);line-height:1.6}
.muted{color:var(--faint)}
label{display:block;font-size:12px;color:var(--faint);margin:14px 0 5px}
select,input{width:100%;background:var(--ink);border:1px solid var(--line);border-radius:9px;padding:10px 12px;color:var(--bone);font:inherit}
select:focus,input:focus{outline:none;border-color:var(--green)}
a{color:var(--green);cursor:pointer}.hidden{display:none}
.note{font-size:12px;margin-top:10px}.ok{color:var(--green)}.err{color:var(--amber)}
.updatebar{display:none;align-items:center;gap:12px;padding:9px 16px;font-size:13px;font-weight:600;background:var(--green);color:var(--ink)}
.updatebar.show{display:flex}
body.lq-liquid .updatebar.show{position:fixed;top:10px;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 24px);z-index:20;border-radius:999px;border:0;background:#F3F0EA;color:#06080B;box-shadow:0 14px 40px -14px rgba(0,0,0,.7)}
body.lq-liquid.lq-light .updatebar.show{background:#151A21;color:#FFFFFF}
body.lq-liquid .updatebar.show.reconnect{background:var(--amber)}
body.lq-liquid #appbar.updatebar.show{top:58px}
.updatebar.reconnect{background:var(--amber)}
.whatsnew{display:none;padding:10px 16px;font-size:13px;background:var(--ink2);border-bottom:1px solid var(--line);max-height:40vh;overflow:auto}
.whatsnew.show{display:block}
body.lq-liquid .whatsnew.show{position:fixed;top:60px;left:50%;transform:translateX(-50%);width:min(660px,calc(100vw - 32px));z-index:8;border:1px solid rgba(220,228,240,.25);border-radius:20px;background:rgba(6,8,11,.82);backdrop-filter:blur(16px);box-shadow:0 30px 70px -30px rgba(0,0,0,.85)}
body.lq-liquid.lq-light .whatsnew.show{background:rgba(255,255,255,.9);border-color:rgba(20,30,45,.15)}
.updatebar button,.updatebar a.b{font:inherit;font-weight:700;border:0;border-radius:8px;padding:5px 12px;background:var(--ink);color:var(--bone);cursor:pointer;text-decoration:none}
.ver{font-size:11px;color:var(--faint);background:var(--ink3);border:1px solid var(--line);border-radius:999px;padding:2px 8px;margin-left:2px;font-family:ui-monospace,Menlo,Consolas,monospace}
footer{padding:10px 18px;border-top:1px solid var(--line);display:flex}
.profile{font-size:13px;margin-bottom:8px;line-height:1.5;overflow-wrap:anywhere}
.profile b{color:var(--bone)}
.maprow{display:flex;gap:12px;align-items:stretch}
.detail{width:290px;flex:none;background:var(--ink2);border:1px solid var(--line);border-radius:12px;padding:14px;overflow:auto;max-height:62vh}
.detail h3{margin:0 0 4px;color:var(--bone);font-size:15px}
.detail .k{font-size:12px;color:var(--faint);margin-top:8px}
.detail ul{margin:6px 0 0;padding-left:18px}.detail li{margin:2px 0}
.detail .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.tag{display:inline-flex;font-size:11px;padding:4px 9px;border-radius:999px;background:var(--green-dim);border:1px solid #2a6b52;color:var(--green)}
.review{margin-top:12px;background:var(--ink2);border:1px solid var(--line);border-radius:12px;padding:16px;min-height:120px}
.review h4{margin:0 0 8px;color:var(--green);font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:700}
.review .body{color:var(--text);line-height:1.65;font-size:14px;white-space:pre-wrap}
.review .rname{color:var(--bone);font-weight:600}
.rfoot{margin-top:12px;font-size:11px;color:var(--faint);font-family:ui-monospace,Menlo,Consolas,monospace;border-top:1px solid var(--line);padding-top:8px;line-height:1.5}
.verdict{margin-top:12px;padding:10px 12px;border-left:3px solid var(--amber);background:var(--ink3);border-radius:0 8px 8px 0;color:var(--bone);font-size:13.5px;line-height:1.5}
.ideas{margin-top:14px}
.ideas h4{margin:0 0 6px;color:var(--amber);font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700}
.idea{display:flex;align-items:flex-start;gap:9px;padding:5px 0;font-size:13.5px;color:var(--text)}
.idea input{margin-top:3px;flex:none;width:15px;height:15px;cursor:pointer}
.ideasent summary{cursor:pointer;font-size:12px;color:var(--faint);margin-top:8px}
.task{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--line);border-radius:9px;margin-top:8px;background:var(--ink2)}
.task input[type=checkbox]{width:16px;height:16px;flex:none;cursor:pointer}
.task .t{flex:1;min-width:0;overflow-wrap:anywhere}
.task .tmodel{width:auto;flex:0 0 auto;max-width:110px;min-height:0;padding:5px 26px 5px 10px;font-size:12px} /* the model pick sits beside the task; the global select{width:100%} took the row and hid every task's text (22 Oct 2026) */
body.lq-liquid .task .tmodel{padding:5px 28px 5px 10px;border-radius:10px}.task.done .t{color:var(--faint);text-decoration:line-through}
.task:has(.tfull[open]){align-items:flex-start}.tfull summary{cursor:pointer;font-size:12px;color:var(--faint);margin-top:4px}.tfull div{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:6px;font-size:13px;line-height:1.5}.tfull div+.tres{border-top:1px solid var(--line);padding-top:6px}
.task .rp{font-size:11px;color:var(--faint);background:var(--ink3);border:1px solid var(--line);border-radius:999px;padding:2px 8px}
.task .rm{background:none;border:0;color:var(--faint);cursor:pointer;font-size:18px;line-height:1}
/* its pickers (lane, model) as wide as what they say: at width:100% the model picker took the row, and the task's words had none left */
.task select.tmodel{width:auto;flex:none;max-width:14em;padding:4px 30px 4px 10px;font-size:12px;border-radius:9px}
.task select.tlane{color:var(--faint)}
@media (max-width:640px){.task{flex-wrap:wrap}.task .t{flex:1 1 calc(100% - 50px)}.task select.tlane{max-width:9.5em}} /* a phone: the words keep their line, the pickers go under them */
.task select.tlane.bad{color:var(--amber);border-color:var(--amber)}
.task .rm:hover{color:var(--amber)}
.tgroup{margin:14px 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--green);font-weight:700}
.tcount{color:var(--faint);font-weight:400}
.taskfilter{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:10px 0 2px}
.fl{font-size:10px;color:var(--faint);text-transform:uppercase;letter-spacing:.12em;margin:0 2px 0 8px}
.fchip{font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid var(--line);background:var(--ink3);color:var(--text);cursor:pointer;font:inherit}
.fchip.on{background:var(--green-dim);border-color:#2a6b52;color:var(--green)}
.task .rm.restore{color:var(--green);font-size:15px}
.task .ask{background:none;border:0;color:var(--faint);cursor:pointer;font-size:14px;line-height:1;padding:0 2px}
.task .ask:hover,.task .ask.on,.task .ask.has{color:var(--green)}
.tchat{border:1px solid var(--line);border-top:0;border-radius:0 0 9px 9px;margin-top:-3px;padding:8px 11px 10px;background:var(--ink2)}
.tchat .msg{margin-top:6px;font-size:13px;line-height:1.55;white-space:pre-wrap}
.tchat .msg.q{color:var(--bone)}.tchat .msg.q:before{content:'You: ';color:var(--faint)}
.tchat .msg.a{color:var(--text);background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.tchat .row{margin:8px 0 0}.tchat .askclear{font-size:12px}
.rcard{border:1px solid var(--amber);border-radius:11px;padding:10px 12px;margin-top:8px}
.rcard .rhead{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.rcard .rhead .muted{font-size:12px}
.rcard .row{margin-top:8px}.rcard .task{margin-top:6px}
.rcard .rtasks{margin-top:10px}.rcard .rtn{font-size:12px}
.rcard .rtask .t{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer}.rcard .rtask.open .t{display:block}
#reviewlist .rcard{scroll-margin-top:44px}.rcard .rmorebtn{margin-top:8px}.rothers{margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px}
.pcard .ptext{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px;color:var(--bone);font-size:13.5px;line-height:1.55}
.pcard textarea.pedit{display:block;width:100%;min-height:150px;margin-top:8px;background:var(--ink);border:1px solid var(--line);border-radius:9px;padding:10px 12px;color:var(--bone);font:inherit;font-size:13.5px;line-height:1.55;resize:vertical}
.pcard textarea.pedit:focus{outline:none;border-color:var(--green)}
.pcard .psrc{margin-top:8px;font-size:12px;color:var(--faint)}.pcard .psrc summary{cursor:pointer}.pcard .psrc div{margin-top:3px;overflow-wrap:anywhere}
.pcard .pchars{font-size:11px;color:var(--faint);margin-left:auto}
.pcard .pshow{margin-top:8px;font-size:12.5px;color:var(--text)}
.pcard .pmedia{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.pcard .pthumb{position:relative;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--ink);line-height:0}
.pcard .pthumb img,.pcard .pthumb video{display:block;max-height:150px;max-width:260px;width:auto;height:auto}
.pcard .pthumb .pmdel{position:absolute;top:4px;right:4px;padding:0 7px;min-height:0;line-height:20px;font-size:15px;border-radius:999px;background:var(--ink);opacity:.85}
.pcard .pthumb .pmdel:hover,.pcard .pthumb .pmdel:focus-visible{opacity:1}
.pcard .pform input.purl{min-width:0}
body.lq-liquid .rcard.pcard,body.lq-liquid.lq-light .rcard.pcard{border-left:3px solid var(--amber)}
.tag.cust{background:transparent;border-color:var(--amber);color:var(--amber)}
/* Marketing: the product an item markets, a quiet word before it; what needs you, ruled amber; the Add row */
.mkp{display:inline-block;margin-right:8px;padding-right:8px;border-right:1px solid var(--line);font:600 10.5px/1.4 var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--green);vertical-align:1px}
.mkdoc{border:1px solid #8884;border-radius:8px;padding:10px 14px;font-size:13px;overflow-x:auto}.mkdoc table{border-collapse:collapse}.mkdoc th,.mkdoc td{border:1px solid #8886;padding:3px 8px;text-align:left}.mkdoc h3,.mkdoc h4,.mkdoc h5{margin:10px 0 4px}
.mkst{font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);color:var(--faint)}.mkst.approved{color:var(--green);border-color:var(--green)}.mkst.posted{color:var(--green);border-color:var(--green);background:var(--green-dim)}.mkst.superseded{text-decoration:line-through}
/* Marketing overview: a card a product, its numbers big and their labels small; the week's report pinned under */
#mkover{margin-top:8px}.mkov{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px;align-items:start}
.mkoc{display:flex;flex-direction:column;gap:12px;min-width:0;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--ink2)}
body.lq-liquid .mkoc,body.lq-liquid .mkrep{border-radius:18px;border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.035)}body.lq-liquid.lq-light .mkoc,body.lq-liquid.lq-light .mkrep{border-color:rgba(21,26,33,.08);background:rgba(255,255,255,.75)}
.mkoc h3{margin:0;font:600 15px var(--sans);color:var(--bone)}.mkoc h4{margin:0 0 4px;font:600 12px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
.mkoc ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.mkoc li{font-size:14px;line-height:1.4;color:var(--text);overflow-wrap:anywhere}
.mkoc li b{font-weight:600;color:var(--bone)}.mkoc .mkwhen{display:block;font-size:12.5px;color:var(--faint)}
.mkstats{display:flex;gap:24px;flex-wrap:wrap}.mkstats div{display:flex;flex-direction:column}.mkstats strong{font:600 24px/1.1 var(--sans);color:var(--bone)}.mkstats .mkno{line-height:24px}.mkstats small{font-size:12px;color:var(--faint)}
.mkoc .mkno,.mkopen .mkno{font-size:13px;color:var(--faint)}.mkoc .mkwait li{border-left:3px solid var(--amber);padding-left:10px}
.mkopen{margin:16px 0 0;font-size:14px;color:var(--text)}.mkopen b{font-weight:600;color:var(--amber)}
.mkrep{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:16px;padding:16px;border:1px solid var(--line);border-left:3px solid var(--green);border-radius:12px;background:var(--ink2)}
.mkrep div{flex:1 1 320px;min-width:0}.mkrep h3{margin:0 0 4px;font:600 15px var(--sans);color:var(--bone)}.mkrep p{margin:0;font-size:14px;line-height:1.45;color:var(--text)}.mkrep small{display:block;margin-bottom:4px;font:600 11.5px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--green)}
.mkrep button{min-height:40px}
/* the pick tray: a card a capture, its blur boxes on it (solid: blurred; dashed: shown), each a click to switch; Use puts it on a post */
.mktray{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,380px),1fr));gap:14px;align-items:start}
.mkcap{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--ink2)}
body.lq-liquid .mkcap{border-radius:18px;border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.035)}body.lq-liquid.lq-light .mkcap{border-color:rgba(21,26,33,.08);background:rgba(255,255,255,.75)}
.mkcap.busy .mkshot{opacity:.6}.mkshot{position:relative;line-height:0;border-radius:8px;overflow:hidden;background:var(--ink3)}.mkshot img,.mkshot video{display:block;width:100%;height:auto}
.mkbox{all:unset;box-sizing:border-box;position:absolute;border:1.5px dashed var(--amber);border-radius:3px;cursor:pointer;background:rgba(242,165,65,.08)}.mkbox.on{border:1.5px solid var(--green);background:rgba(10,12,14,.28)}
.mkbox:hover{box-shadow:0 0 0 2px rgba(255,255,255,.55)}.mkbox:focus-visible{outline:2px solid var(--bone);outline-offset:1px}
.mkcapt{font-size:13px;line-height:1.45;color:var(--text);overflow-wrap:anywhere}.mkcapm{font-size:11.5px;color:var(--faint)}
.mkuse{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.mkuse button{padding:4px 10px;font-size:12px}#mktray .mkuse select{width:auto;max-width:100%;min-height:0;padding:4px 30px 4px 10px;border-radius:999px;font-size:12px;background-position:right 11px center}
/* capturing a product (capture.mjs), a capture to look over first, and a blur box you draw */
.mkcaprow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 14px}.mkcaprow select,.mkcaprow input{width:auto;min-width:0;min-height:0;padding:6px 12px;border-radius:999px;font-size:13px}.mkcaprow input{flex:1 1 220px}.mkcaprow select{padding-right:30px;background-position:right 11px center}
.mkcapst{flex-basis:100%;font-size:12.5px;line-height:1.45;color:var(--faint)}.mkcapst:empty{display:none}.mkcapst.err{color:var(--amber)}.mkcapst.ok{color:var(--green)}
.mkreview{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 10px;border-radius:10px;border:1px solid var(--amber);font-size:12.5px;line-height:1.45;color:var(--text)}.mkreview span{flex:1 1 200px}.mkreview button{padding:4px 10px;font-size:12px}
.mkcapst2{font-size:12px;color:var(--faint)}.mkcapst2:empty{display:none}.mkcapst2.err{color:var(--amber)}
.mkdrawpad{display:none;position:absolute;inset:0;cursor:crosshair;touch-action:none;z-index:2}.mkcap.drawing .mkdrawpad{display:block}.mkcap.drawing .mkshot{outline:2px dashed var(--bone);outline-offset:2px}
.mkdrawn{position:absolute;border:1.5px solid var(--bone);background:rgba(10,12,14,.35);border-radius:3px;pointer-events:none}
.mkchipx{all:unset;cursor:pointer;margin-left:2px;padding:0 6px;border-radius:999px;font:600 12px/1.5 var(--sans);color:var(--faint)}.mkchipx:hover,.mkchipx:focus-visible{color:var(--bone);outline:2px solid var(--bone);outline-offset:1px}
.mkchips{display:flex;flex-wrap:wrap;gap:5px}.mkchip{all:unset;box-sizing:border-box;cursor:pointer;padding:2px 9px;border-radius:999px;border:1px dashed var(--amber);color:var(--text);font:500 11.5px/1.5 var(--sans)}.mkchip.on{border:1px solid var(--green);color:var(--green)}.mkchip:hover,.mkchip:focus-visible{outline:2px solid var(--bone);outline-offset:1px}.mkshot .mkbox.hl{box-shadow:0 0 0 2px var(--bone)}
.blogpost{max-width:680px;background:#fff;color:#1c1c1c;border:1px solid #e0dfdc;border-radius:10px;padding:18px 22px;font:16px/1.6 Georgia,"Times New Roman",serif}.blogmeta{font:12px system-ui,sans-serif;color:#767676;text-transform:uppercase;letter-spacing:.04em}.blogh{margin:6px 0 12px;font:700 26px/1.25 Georgia,serif;color:#111}.blogbody p{margin:0 0 12px}.blogbody ul{margin:0 0 12px;padding-left:22px}.blogbody a{color:#0b5fa5}
.hnpost{max-width:680px;background:#f6f6ef;color:#000;border:1px solid #d9d9cf;border-radius:6px;padding:0 0 10px;font:14px/1.45 Verdana,Geneva,sans-serif}.hnbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#ff6600;padding:4px 8px;border-radius:6px 6px 0 0;font-size:13px}.hnbar span{font-size:11px}.hny{border:1px solid #fff;color:#fff;padding:0 5px}.hnrow{display:flex;gap:12px;padding:8px 10px 0}.hnk{flex:0 0 96px;color:#828282;font-size:12px}.hnt{font-weight:700}.hnu{color:#828282}.hnc{flex:1;min-width:0}.hnc p{margin:0 0 9px}.hnc ul{margin:0 0 9px;padding-left:20px}.hnc a{color:#000;text-decoration:underline}
.mkpv{margin:6px 0 14px}.mkpv .mkpvact{margin-top:8px}.mkpv .pchars{font-size:11px;color:var(--faint)}
/* a draft opened large (mkBig): its pictures and video near full size, its text in reading type, where it goes; Approve, Edit and Skip on it */
#mktasks .task[data-rel],#mkneeds .mkneed[data-rel],#boardposts .pcard{cursor:pointer}.mkpv .lipost,.mkpv .rdpost{cursor:zoom-in}
.mkbig{position:fixed;inset:0;z-index:950;display:flex;align-items:center;justify-content:center;padding:28px;background:rgba(3,4,6,.62);backdrop-filter:blur(6px)}
.mkbigin{position:relative;display:flex;flex-direction:column;width:min(1240px,100%);max-height:100%;border-radius:22px;background:rgba(10,12,15,.94);border:1px solid rgba(255,255,255,.12);box-shadow:0 0 0 1px rgba(214,222,234,.1),0 40px 90px -30px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(20px) saturate(1.25);color:var(--text);overflow:hidden}
body.lq-light .mkbig{background:rgba(40,44,52,.38)}body.lq-light .mkbigin{background:rgba(250,250,251,.97);border-color:rgba(21,26,33,.1);box-shadow:0 40px 90px -30px rgba(20,24,30,.45)}
body.lq-solid .mkbig,body.lq-solid .mkbigin{backdrop-filter:none}
.mkbighead{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:16px 18px 14px 22px;border-bottom:1px solid var(--line)}
.mkbighead h2{flex:1 1 260px;margin:0;font:650 19px/1.3 var(--sans);color:var(--bone);letter-spacing:-.01em}
.mkbigto{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;border:1px solid var(--line);font-size:12.5px;color:var(--text);white-space:nowrap}.mkbigto b{color:var(--bone);font-weight:600}
.mkbigx{all:unset;box-sizing:border-box;cursor:pointer;width:38px;height:38px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);color:var(--bone);font-size:22px;line-height:1}.mkbigx:hover,.mkbigx:focus-visible{outline:2px solid var(--bone);outline-offset:1px}
.mkbigbody{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,1fr);gap:24px;padding:20px 22px;overflow:auto;min-height:0}
.mkbigbody.textonly{grid-template-columns:minmax(0,760px);justify-content:center}
@media(max-width:920px){.mkbig{padding:10px}.mkbigbody{grid-template-columns:1fr}}
.mkbigmedia{display:flex;flex-direction:column;gap:10px;min-width:0}
.mkbigmain{position:relative;border-radius:14px;overflow:hidden;background:rgba(0,0,0,.35);line-height:0;border:1px solid var(--line)}body.lq-light .mkbigmain{background:#eceae6}
.mkbigmain img,.mkbigmain video{display:block;width:100%;max-height:68vh;object-fit:contain}.mkbigmain img{cursor:zoom-in}
.mkbigthumbs{display:flex;gap:8px;flex-wrap:wrap}.mkbigthumbs button{all:unset;cursor:pointer;box-sizing:border-box;width:84px;height:56px;border-radius:9px;overflow:hidden;border:2px solid transparent;opacity:.7;background:rgba(0,0,0,.3)}.mkbigthumbs button.on{border-color:var(--bone);opacity:1}.mkbigthumbs button:hover,.mkbigthumbs button:focus-visible{opacity:1;outline:2px solid var(--bone);outline-offset:1px}.mkbigthumbs img,.mkbigthumbs video{width:100%;height:100%;object-fit:cover;pointer-events:none}
.mkbignone{padding:18px;border-radius:14px;border:1px dashed var(--amber);font-size:14px;line-height:1.5;color:var(--text)}
.mkbigtext{min-width:0}.mkbigtitle{margin:0 0 10px;font:650 18px/1.4 var(--sans);color:var(--bone)}.mkbigtitle small{display:block;font:500 12px var(--sans);color:var(--faint);margin-bottom:3px;letter-spacing:.02em}
.mkbigbodyt{white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px;line-height:1.62;color:var(--bone)}.mkbig .lihash{color:#71b7fb}body.lq-light .mkbig .lihash{color:#0a66c2}
.mkbigbody textarea{display:block;width:100%;min-height:46vh;box-sizing:border-box;background:var(--ink);border:1px solid var(--line);border-radius:12px;padding:12px 14px;color:var(--bone);font:16px/1.6 var(--sans);resize:vertical}.mkbigbody textarea:focus{outline:none;border-color:var(--green)}
.mkbigmeta{margin-top:12px;font-size:12.5px;color:var(--faint)}.mkbig .linotes{margin-top:12px;font-size:13.5px}
.mkbigfoot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 22px 16px;border-top:1px solid var(--line)}.mkbigfoot .mkbigsay{flex:1 1 220px;font-size:13px;color:var(--faint);line-height:1.45}.mkbigfoot .mkbigsay.err{color:var(--amber)}.mkbigfoot .mkbigsay.ok{color:var(--green)}
/* one picture alone: arrows, or a swipe, between a post's pictures and video */
.mkzoom{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:56px 72px;background:rgba(0,0,0,.9);touch-action:pan-y}
.mkzoom img,.mkzoom video{max-width:100%;max-height:100%;border-radius:8px;object-fit:contain;user-select:none}
.mkzoom .mkzx,.mkzoom .mkzp,.mkzoom .mkzn{all:unset;box-sizing:border-box;position:absolute;cursor:pointer;width:46px;height:46px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);color:#F3F0EA;font-size:24px;line-height:1}
.mkzoom .mkzx:hover,.mkzoom .mkzp:hover,.mkzoom .mkzn:hover,.mkzoom button:focus-visible{background:rgba(255,255,255,.2);outline:2px solid #F3F0EA;outline-offset:1px}
.mkzoom .mkzx{top:14px;right:16px}.mkzoom .mkzp{left:14px;top:50%;margin-top:-23px}.mkzoom .mkzn{right:14px;top:50%;margin-top:-23px}
.mkzoom .mkzc{position:absolute;left:0;right:0;bottom:14px;text-align:center;color:#C9CDD3;font:500 13px var(--sans)}
@media(max-width:700px){.mkzoom{padding:56px 8px}.mkzoom .mkzp,.mkzoom .mkzn{top:auto;bottom:8px;margin:0}}
.mkbigb{padding:4px 10px;font-size:12px}.mkshot img{cursor:zoom-in}.mkcap.drawing .mkshot img{cursor:crosshair}
.lipost{max-width:552px;background:#fff;color:#191919;border:1px solid #e0dfdc;border-radius:10px;padding:12px 16px 4px;font:14px/1.43 -apple-system,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.liauth{display:flex;gap:8px;align-items:flex-start;margin-bottom:10px}
.liav{flex:0 0 48px;width:48px;height:48px;border-radius:50%;object-fit:cover;background:#0a66c2;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:17px}
.liwho{display:flex;flex-direction:column;min-width:0}.liwho b{font-weight:600;font-size:14px}.liwho small{font-size:12px;color:rgba(0,0,0,.6);line-height:1.33}
.litext{white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:8px}
.lihash{color:#0a66c2;font-weight:600}
.limore{background:none;border:0;padding:0 0 0 2px;min-height:0;color:rgba(0,0,0,.6);font:inherit;cursor:pointer}.limore:hover{color:#0a66c2;text-decoration:underline}
.limedia{display:block;width:calc(100% + 32px);margin:0 -16px 4px;max-height:560px;object-fit:contain;background:#f3f2ef}
.libar{display:flex;justify-content:space-around;border-top:1px solid #e0dfdc;padding:6px 0;color:rgba(0,0,0,.6);font-weight:600;font-size:13px}
/* the other platforms' posts, each as its own feed shows it (mkPreviewHtml) */
.lipost.xpost{border-radius:16px;border-color:#cfd9de;color:#0f1419;padding:12px 16px 4px}.xpost .liav{flex-basis:40px;width:40px;height:40px;background:#0f1419;font-size:15px}.xpost .liwho{flex-direction:row;flex-wrap:wrap;gap:4px;align-items:baseline}.xpost .liwho b{font-weight:700;font-size:15px}.xpost .liwho small{font-size:15px;color:#536471}.xpost .lihash{color:#1d9bf0;font-weight:400}.xpost .limedia{width:100%;margin:0 0 8px;border-radius:16px;border:1px solid #cfd9de}.xpost .libar{border-top:0;justify-content:space-between;font-weight:400;color:#536471}
.lipost.igpost{border-radius:8px;border-color:#dbdbdb;padding:0;color:#000}.igpost .liauth{padding:10px 12px;margin:0;align-items:center}.igpost .liav{flex-basis:32px;width:32px;height:32px;font-size:12px;background:linear-gradient(45deg,#f09433,#dc2743,#bc1888)}.igpost .limedia{width:100%;margin:0;aspect-ratio:4/5;object-fit:cover;background:#000}.igpost .libar{border-top:0;justify-content:flex-start;gap:16px;padding:8px 12px 4px;font-size:20px;color:#000}.igpost .litext{padding:0 12px 10px;margin:0}.igpost .lihash{color:#00376b;font-weight:400}.ignomedia{padding:60px 16px;text-align:center;background:#fafafa;color:#8e8e8e;font-size:13px}
.lipost.fbpost{border-radius:8px;border-color:#dddfe2;color:#050505}.fbpost .liav{flex-basis:40px;width:40px;height:40px;background:#1877f2;font-size:15px}.fbpost .liwho small{color:#65676b}.fbpost .lihash{color:#216fdb;font-weight:400}.fbpost .libar{border-top:1px solid #ced0d4;color:#65676b}
.mkchgf{margin-top:8px;flex-wrap:wrap}.mkchgf.hidden{display:none}.mkpv .pchars.err{color:var(--amber)}.mkchgf textarea{flex:1 1 100%;min-height:72px;font:13px/1.45 var(--sans)}.mkasked{margin-top:8px;font-size:12.5px}
/* a Reddit draft as Reddit shows it: its subreddit and who posts it, its title, its flair, the body */
.rdpost{max-width:640px;background:#fff;color:#1c1c1c;border:1px solid #d4d7d9;border-radius:10px;padding:10px 16px 4px;font:14px/1.5 -apple-system,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.rdhead{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:12px;color:#576f76}.rdhead b{color:#1c1c1c;font-weight:700}
.rdic{flex:none;width:24px;height:24px;border-radius:50%;background:#ff4500;color:#fff;display:inline-flex;align-items:center;justify-content:center;font:700 11px/1 -apple-system,system-ui,sans-serif}
.rdtitle{margin:8px 0 6px;font-weight:600;font-size:18px;line-height:1.35;color:#1c1c1c;overflow-wrap:anywhere}
.rdflair{display:inline-block;margin:0 0 8px;padding:1px 9px;border-radius:999px;background:#e5ebee;color:#1c1c1c;font-size:12px;font-weight:600}
.rdbody{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0 8px}.rdbody code{background:#eef1f3;padding:0 4px;border-radius:4px;font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace}
.rdmedia{display:block;width:100%;max-height:560px;object-fit:contain;background:#0e1113;border-radius:12px;margin:6px 0 8px}
.rdbar{display:flex;gap:18px;border-top:1px solid #e5ebee;padding:6px 0;color:#576f76;font-weight:600;font-size:12.5px}
.linotes{margin-top:8px;font-size:12.5px;color:var(--text)}.linotes summary{cursor:pointer;color:var(--faint)}.linotest{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0;color:var(--text)}
.mkneeds{margin-bottom:14px;padding:4px 0 4px 12px;border-left:2px solid var(--amber)}
.mkneeds.lit{border-radius:0 16px 16px 0}
#panel-marketing .pcard.lit{border-radius:11px}
.mkadd{flex-wrap:wrap;margin:8px 0 6px}.mkadd .mkl{font-size:12px;color:var(--faint)}.mkadd .mkprod{flex:0 0 160px;width:160px}.mkadd .mktext{flex:1;min-width:220px}
@media (max-width:600px){.mkadd .mkprod{flex:1 1 100%;width:auto}.mkadd .mktext{min-width:0}}
/* a phone's width: the capture row's fields take the full line rather than scrolling the panel sideways (15 Oct 2026) */
@media (max-width:520px){.mkcaprow select,.mkcaprow input{flex:1 1 100%!important;max-width:100%}.mkcaprow button{flex:1 1 auto}}
.rrow{cursor:pointer}.rrow:hover,.rrow:focus-visible{border-color:var(--green)}.rrow.rnew{border-left:3px solid var(--amber)}
.repacts{margin-top:10px}.repidea{cursor:pointer;align-items:flex-start;gap:8px}.repidea input{margin-top:3px}
.out.rdoc{white-space:normal;line-height:1.55;font-size:14px;padding:18px 22px;overflow-wrap:anywhere}
.rdoc h2{font-size:21px;margin:4px 0 10px;color:var(--bone)}.rdoc h3{font-size:16px;margin:22px 0 8px;color:var(--bone)}.rdoc h4,.rdoc h5,.rdoc h6{font-size:14px;margin:16px 0 6px;color:var(--bone)}
.rdoc p{margin:8px 0}.rdoc ul,.rdoc ol{margin:6px 0;padding-left:22px}.rdoc li{margin:3px 0}.rdoc hr{border:0;border-top:1px solid var(--line);margin:16px 0}
.rdoc code{font-size:12.5px;background:var(--ink3);border:1px solid var(--line);border-radius:5px;padding:0 4px}.rdoc pre{background:var(--ink3);border:1px solid var(--line);border-radius:9px;padding:10px 12px;overflow:auto}.rdoc pre code{background:none;border:0;padding:0}
.rdoc pre.prose{font-family:inherit;white-space:pre-wrap;overflow-wrap:anywhere;overflow:visible}.rdoc pre.prose code{font-family:inherit;font-size:14px;line-height:1.5}
.rdoc img.rimg{display:block;max-width:min(100%,560px);height:auto;margin:10px 0;border:1px solid var(--line);border-radius:9px;cursor:zoom-in}.rdoc .rimgmiss{display:inline-block;margin:6px 0;padding:6px 10px;border:1px dashed var(--amber);border-radius:8px;color:var(--faint);font-size:13px}
/* an open report's way back, kept in view under the page's header while the report scrolls (top: repStick) */
.rbackbar{position:sticky;top:var(--rbtop,0px);z-index:3;display:flex;align-items:center;gap:10px;margin:10px -10px 4px;padding:8px 10px;border-radius:14px;background:rgba(6,8,11,.9);backdrop-filter:blur(14px);box-shadow:0 1px 0 rgba(220,228,240,.12)}
.rbackbar button{flex:none}.rbackbar .rbpath{flex:1;min-width:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl;text-align:left}
body.lq-light .rbackbar{background:rgba(246,248,251,.95);box-shadow:0 1px 0 rgba(20,30,45,.1)}body.lq-solid .rbackbar{backdrop-filter:none;background:var(--ink)}
@media(max-width:520px){.rbackbar .rbpath{display:none}}
.rzoom{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:24px}.rzoom img{max-width:100%;max-height:100%;border-radius:8px}
.rdoc blockquote{margin:8px 0;padding:2px 12px;border-left:3px solid var(--line);color:var(--faint)}.rdoc a{color:var(--green)}
.rdoc .rtable{overflow-x:auto;margin:10px 0}.rdoc table{border-collapse:collapse;font-size:13px;min-width:100%}.rdoc th,.rdoc td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}.rdoc th{background:var(--ink3);color:var(--bone);font-weight:600}
.rdiff{max-height:360px;overflow:auto;font-size:11px;line-height:1.45;background:var(--ink2);border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:8px;white-space:pre}
.drift{border:1px solid var(--line);border-radius:10px;margin-top:10px;padding:12px 14px;background:var(--ink2)}
.drift .dh,.agent .dh{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.drift .dn,.agent .dn{color:var(--bone);font-weight:600}
.drift .dd,.agent .dd{color:var(--faint);font-size:12px}
.agent .adet{font-size:12px;margin:2px 0 4px}.agent .adet summary{cursor:pointer;color:var(--faint);list-style:none;display:inline}.agent .adet summary::-webkit-details-marker{display:none}.agent .adet[open] summary{margin-right:6px}.agent .adet>div{display:inline}
.drift ul{margin:8px 0 0;padding:0;list-style:none}
.drift li{padding:3px 0;font-size:13.5px}
.drift li.warn{color:var(--amber)}
.drift .ev{color:var(--faint);font-family:ui-monospace,Menlo,monospace;font-size:11px}
.dot-w{width:9px;height:9px;border-radius:50%;background:var(--amber);display:inline-block}
.dot-c{width:9px;height:9px;border-radius:50%;background:var(--green);display:inline-block}
.lgroup{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0 0}.lgroup .fl{min-width:64px;margin-left:0}
.lnk{display:inline-flex;align-items:center;gap:4px}.lnk .fchip{display:inline-flex;align-items:center;gap:6px}
.lnk.ok .fchip{border-color:#2a6b52}.lnk.signin .fchip,.lnk.signedout .fchip,.lnk.error .fchip{border-color:var(--amber)}
.lnk .lst{font-size:11px;color:var(--faint)}.lnk .lmore,.lnk .lrm{background:none;border:0;color:var(--faint);cursor:pointer;font-size:14px;padding:0 2px}.lnk .lrm:hover{color:var(--amber)}
.agent{border:1px solid var(--line);border-radius:10px;margin-top:10px;padding:12px 14px;background:var(--ink2)}
.adot{width:10px;height:10px;border-radius:50%;display:inline-block;flex:none}
.adot.run{background:var(--amber);animation:pulse 1s ease-in-out infinite}
.adot.ok{background:var(--green)} .adot.fail{background:#E5695B}
.changed{margin-top:8px;font-size:12.5px;color:var(--bone);background:var(--green-dim);border:1px solid #2a6b52;border-radius:8px;padding:7px 10px}
.changed.muted{color:var(--faint);background:var(--ink3);border-color:var(--line)}
.changed b{color:var(--green)}
.commits{margin-top:6px;font-size:12px;color:var(--text);font-family:ui-monospace,Menlo,Consolas,monospace}
.commits code{color:var(--amber);margin-right:6px}
@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(242,165,65,.5)}50%{opacity:.4;box-shadow:0 0 0 5px rgba(242,165,65,0)}}
.aq{margin-top:10px;border:1px solid var(--amber);border-radius:9px;padding:10px 12px;background:var(--ink)}
.aq h4{margin:4px 0 6px;color:var(--amber);font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}
.aq .q{padding:8px 0;border-bottom:1px solid var(--line)}
.aq .qt{color:var(--bone);font-weight:600;font-size:13.5px}
.aq .qc{color:var(--faint);font-size:12.5px;margin-top:3px;line-height:1.5}
.aq .qfor,.pcq .qfor{color:var(--faint);font-size:12px;margin-bottom:3px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.aq label.opt{display:flex;gap:8px;align-items:flex-start;margin:6px 0 0;font-size:13px;color:var(--text);cursor:pointer}
.aq .opt input{width:auto;margin-top:3px;flex:none}
.who{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:0 7px;margin-right:2px;white-space:nowrap}
.who.you{color:var(--amber);border:1px solid var(--amber)}.who.agent{color:var(--green);border:1px solid var(--green)}
.aq .qrel{font-size:12px;margin-top:4px;color:var(--green)}.aq .qrel.wait{color:var(--amber)}
.aq label.opt.off{color:var(--faint);cursor:default}.aq .opt.off i{font-size:12px}
.aq .qother{margin-top:7px;padding:7px 10px;font-size:13px}
.aq .row{margin:10px 0 2px}
.aq .qgo{font-size:13px;line-height:1.45;color:var(--text);margin-top:6px}.aq .qgo b{font-weight:600}
.aq .qmoney{font-size:13px;margin-top:4px;color:var(--amber);font-weight:600}
.aq .qgob{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.aq .qgob button{min-height:40px;padding:8px 16px}
.goes{margin-top:8px;font-size:12.5px;color:var(--faint);line-height:1.5}.goes .gor{padding:5px 0}.goes .goh{display:flex;flex-wrap:wrap;column-gap:10px;align-items:baseline}.goes b{color:var(--text);font-weight:600}.goes .gow{overflow-wrap:anywhere}
.goes .ok{color:var(--green)}.goes .bad{color:var(--amber)}
label.check{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--text);margin:6px 0}
label.check input{width:auto}
.alogout{white-space:pre-wrap;background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;color:var(--text);max-height:260px;overflow:auto}
.bar{height:3px;background:var(--green-dim);border-radius:2px;overflow:hidden;margin-top:8px}
.bar > i{display:block;height:100%;width:35%;background:var(--green);border-radius:2px;animation:slide 1.3s ease-in-out infinite}
@keyframes slide{0%{margin-left:-35%}100%{margin-left:100%}}
.out2{white-space:pre-wrap;background:var(--ink);border:1px solid var(--line);border-radius:9px;padding:10px;margin-top:10px;font-size:13px;line-height:1.55;color:var(--bone)}
.mapbar{margin-top:8px;font-size:12.5px;color:var(--text);background:var(--ink3);border:1px solid var(--line);border-radius:9px;padding:9px 12px;min-height:18px;font-family:ui-monospace,Menlo,Consolas,monospace}
.mapbar b{color:var(--bone)}
.legend{display:flex;gap:14px;align-items:center;margin-top:10px;font-size:12px;color:var(--faint);flex-wrap:wrap}
.scrwrap{position:relative;margin-top:10px;border:1px solid var(--line);border-radius:10px;overflow:hidden;cursor:crosshair;user-select:none;touch-action:none;background:var(--ink2)}
.scrwrap img{display:block;width:100%;height:auto;pointer-events:none}
.scrbox{position:absolute;border:2px solid var(--green);background:rgba(61,220,151,.12);pointer-events:none}
.scrbox span{position:absolute;left:0;top:0;font-size:11px;background:var(--green);color:var(--ink);padding:1px 6px;white-space:nowrap}
.scrbox.draw{border:2px dashed var(--amber);background:rgba(242,165,65,.14)}
.board{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px}

/* ---- finer details: the controls every panel shares, in the look ---- */
.iconbtn{display:inline-grid;place-items:center;width:36px;height:36px;padding:0;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:var(--bone);cursor:pointer;transition:background-color .15s ease}
.iconbtn:hover{background:rgba(255,255,255,.1)}
.iconbtn.wide{display:inline-flex;gap:7px;width:auto;padding:0 14px;font:500 13px var(--sans)}
.iconbtn:focus-visible,.seg button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
body.lq-light .iconbtn{border-color:rgba(21,26,33,.12);background:rgba(21,26,33,.04)}
body.lq-light .iconbtn:hover{background:rgba(21,26,33,.08)}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
.seg button{min-height:30px;padding:0 13px;border:0;border-radius:999px;background:transparent;color:var(--faint);font:500 12.5px var(--sans);cursor:pointer}
.seg button[aria-checked='true']{background:#F3F0EA;color:#0A0B0D}
body.lq-light .seg{background:rgba(21,26,33,.04);border-color:rgba(21,26,33,.1)}
body.lq-light .seg button[aria-checked='true']{background:#151A21;color:#FFFFFF}
body.lq-liquid select{-webkit-appearance:none;appearance:none;padding:8px 34px 8px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238A919B' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 13px center;color:var(--bone);font:500 13px var(--sans);color-scheme:dark;cursor:pointer}
body.lq-liquid select option{background:#131518;color:#ECE9E4}
body.lq-liquid.lq-light select{border-color:rgba(21,26,33,.14);background-color:rgba(21,26,33,.04);color-scheme:light}
body.lq-liquid.lq-light select option{background:#FFFFFF;color:#151A21}
/* the Dashboard's head */
.bhead{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:2px 0 4px}
.bsumw{flex:1;min-width:220px}
.bsum{font:500 16px/1.4 var(--sans);color:var(--bone);text-wrap:balance}
.bsum b{font-weight:600}
.bsub{font-size:12.5px;color:var(--faint);margin-top:2px}
.blane .blsub{font-size:11.5px;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
/* Connections */
.cxh{display:flex;flex-direction:column;gap:2px;margin:26px 0 12px}
.cxh span{font:600 15px var(--sans);color:var(--bone)}
.cxh small{font-size:12.5px;color:var(--faint)}
.cxg{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:18px 28px}
.cxc{min-width:0}
.cxl{font:500 11px var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-bottom:4px}
.lnk.cx{display:flex;align-items:center;gap:0}
.cx .lbtn{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:9px;flex:1;min-width:0;min-height:32px;padding:4px 8px;margin-left:-8px;border-radius:10px;cursor:pointer}
.cx .lbtn:hover{background:rgba(255,255,255,.05)}
.cx .lbtn:focus-visible{outline:2px solid currentColor;outline-offset:1px}
body.lq-light .cx .lbtn:hover{background:rgba(21,26,33,.05)}
.cxb{flex:none;width:11px;height:11px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--faint);opacity:.6}
.cx.ok .cxb{opacity:1;box-shadow:0 0 0 1px rgba(255,255,255,.08);background:radial-gradient(circle at 34% 28%,#FFFFFF 0,#C9CFD9 20%,#5B626D 58%,#121418 100%)}
body.lq-light .cx.ok .cxb{box-shadow:0 1px 2px rgba(0,0,0,.25);background:radial-gradient(circle at 34% 28%,#FFFFFF 0,#E3E6EA 22%,#9BA2AC 55%,#3A3F46 100%)}
.cx.signin .cxb,.cx.signedout .cxb,.cx.error .cxb{opacity:1;box-shadow:inset 0 0 0 2px var(--amber),0 0 10px rgba(242,165,65,.35)}
.cxn{font:500 13.5px var(--sans);color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cxa{flex:none;font-size:12px;color:var(--faint);opacity:.55}.cxa.ready{color:var(--bone);opacity:1}
.cxlg{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px}.cxh .cxlg .cxlgf{display:inline-flex;align-items:center;gap:6px;margin-left:8px;font:inherit;color:inherit}
.cx.ok .cxn{color:var(--bone)}
.cxs{margin-left:auto;padding-left:8px;font-size:11.5px;color:var(--faint);white-space:nowrap}
.cx.signin .cxs,.cx.signedout .cxs,.cx.error .cxs{color:var(--amber)}
.cx.off .cxs{opacity:0;transition:opacity .15s ease}
.cx.off:hover .cxs,.cx.off .lbtn:focus-visible .cxs,body.lq-touch .cx.off .cxs{opacity:1}
.cx .lmore,.cx .lrm{display:none;border:0;background:transparent;color:var(--faint);font:500 12px var(--sans);padding:4px 6px;border-radius:8px;cursor:pointer}
.cx .lmore:hover{color:var(--bone)}.cx .lrm:hover{color:var(--amber)}
.cx:hover .lmore,.cx:hover .lrm,.cx:focus-within .lmore,.cx:focus-within .lrm,body.lq-touch .cx .lmore,body.lq-touch .cx .lrm{display:inline-flex}
.cxall{display:flex;align-items:baseline;gap:8px;margin:6px 0 10px;font-size:13px;cursor:pointer}.cxall small{color:var(--muted,#8A919B)}
.cx .lact{display:none;border:1px solid var(--line);background:transparent;color:var(--faint);font:500 11px var(--sans);padding:2px 8px;border-radius:999px;cursor:pointer}
.cx:hover .lact,.cx:focus-within .lact,body.lq-touch .cx .lact,.cx .lact.on{display:inline-flex}.cx .lact.on{color:var(--amber);border-color:var(--amber)}.cx .lact:hover{color:var(--bone)}
/* the card list, quiet */
body.lq-liquid .board .bcard{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);border-radius:16px;box-shadow:none}
body.lq-liquid.lq-light .board .bcard{background:rgba(255,255,255,.6);border-color:rgba(21,26,33,.08)}
body.lq-liquid .board .bcard.has{border-color:rgba(242,165,65,.35)}
body.lq-liquid .bcard .bc{font:300 30px/1.1 var(--sans);letter-spacing:-.02em;color:var(--faint)}
body.lq-liquid .bcard.has .bc{color:var(--amber)}
body.lq-liquid .bcard .bbrief{border-left:2px solid var(--line);background:transparent;padding:2px 0 2px 12px;color:var(--text)}


/* the Map, in the liquid */
#lmap,#lmtools{display:none}
body.lq-liquid #lmap{display:block;position:relative;flex:1;min-width:0;height:64vh;min-height:420px;border-radius:18px;overflow:hidden;isolation:isolate;background:#08090B;box-shadow:0 0 0 1px rgba(255,255,255,.08);touch-action:none;cursor:grab}
body.lq-liquid #lmap:active{cursor:grabbing}
body.lq-liquid.lq-light #lmap{background:#EBEEF0;box-shadow:0 0 0 1px rgba(21,26,33,.08)}
body.lq-look-pearl #lmap{background:#EDECE9}
#lmc{position:absolute;inset:0;width:100%;height:100%;display:block}
#lmlines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#lmlines line{stroke:rgba(255,255,255,.12);stroke-width:1;stroke-dasharray:2 4}
#lmlines line.hot{stroke:rgba(255,255,255,.4)}
body.lq-light #lmlines line{stroke:rgba(21,26,33,.14)}body.lq-light #lmlines line.hot{stroke:rgba(21,26,33,.45)}
#lmov{position:absolute;inset:0;pointer-events:none}
.lml{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:0;padding:2px 6px;border:0;border-radius:8px;background:transparent;color:#ECE9E4;font:inherit;text-align:center;white-space:nowrap;max-width:158px;pointer-events:auto;cursor:pointer;transition:opacity .25s ease;will-change:transform;text-shadow:0 1px 10px rgba(0,0,0,.7)}
.lml b,.lml span{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.lml b{font:600 13px/1.2 var(--sans)}
.lml span{font:400 11.5px/1.3 var(--sans);color:#8A919B}
.lml.dormant{opacity:.55}.lml.far{opacity:.3}.lml.near b{color:#F2A541}
.lml.need span{color:#F2A541}.lml.tiny span{display:none}body.lq-light .lml.need span{color:#A85F0A}
.lml:focus-visible{outline:2px solid currentColor;outline-offset:2px}
body.lq-light .lml{color:#151A21;text-shadow:0 1px 8px rgba(255,255,255,.8)}body.lq-light .lml span{color:#5A6470}body.lq-light .lml.near b{color:#A85F0A}
.lmlane{position:absolute;left:0;top:0;display:flex;align-items:baseline;gap:8px;padding:2px 0;border:0;background:transparent;font:500 11px var(--sans);letter-spacing:.12em;text-transform:uppercase;color:#8A919B;white-space:nowrap;pointer-events:auto;cursor:pointer;will-change:transform}
.lmlane small{font:inherit;letter-spacing:0;color:#5E656F}.lmlane span{letter-spacing:.04em;text-transform:none;font-size:11px;color:#5E656F;opacity:0;transition:opacity .15s ease}.lmlane:hover span,.lmlane:focus-visible span,.lmlane[aria-expanded='false'] span{opacity:1}
.lmlane:hover{color:#ECE9E4}.lmlane.need{color:#F2A541}.lmlane:focus-visible{outline:2px solid currentColor;outline-offset:3px;border-radius:4px}
body.lq-light .lmlane{color:#5A6470}body.lq-light .lmlane small,body.lq-light .lmlane span{color:#8A919B}body.lq-light .lmlane:hover{color:#151A21}body.lq-light .lmlane.need{color:#A85F0A}
.lmring{position:absolute;left:0;top:0;border-radius:50%;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35);pointer-events:none}
body.lq-light .lmring{box-shadow:inset 0 0 0 1.5px rgba(21,26,33,.35)}
.lmring.group{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35),0 0 0 4px rgba(255,255,255,.06),0 0 0 8px rgba(255,255,255,.03)}.lmring.need{box-shadow:inset 0 0 0 1.5px rgba(242,165,65,.8)}
body.lq-light .lmring.group{box-shadow:inset 0 0 0 1.5px rgba(21,26,33,.35),0 0 0 4px rgba(21,26,33,.06),0 0 0 8px rgba(21,26,33,.03)}body.lq-light .lmring.need{box-shadow:inset 0 0 0 1.5px rgba(168,95,10,.8)}
.lmtip{position:absolute;left:0;top:0;width:300px;max-width:calc(100% - 20px);padding:12px 14px;border-radius:16px;background:rgba(16,18,21,.94);border:1px solid rgba(255,255,255,.1);box-shadow:0 24px 50px -20px rgba(0,0,0,.8);color:#ECE9E4;opacity:0;pointer-events:none;transition:opacity .15s ease;z-index:3}
.lmtip.on{opacity:1}
.lmtip b{font:600 13.5px var(--sans)}
.lmtip .lmts{display:block;font-size:12px;color:#8A919B;margin-top:1px}
.lmtip .lmtn{margin-top:8px;display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:#C9CDD3}
.lmtip .lmtn b{font-size:12.5px;color:#F2A541}
body.lq-light .lmtip{background:rgba(255,255,255,.96);border-color:rgba(21,26,33,.1);color:#151A21;box-shadow:0 24px 50px -24px rgba(30,45,60,.45)}
body.lq-light .lmtip .lmtn{color:#2B3644}body.lq-light .lmtip .lmtn b{color:#A85F0A}
.lmzoom{position:absolute;right:12px;top:10px;display:flex;flex-direction:row;gap:6px;z-index:2}
.lmzoom .iconbtn{width:30px;height:30px;font:500 16px var(--sans)}
body.lq-liquid #lmtools{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.lmrow{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px}
.lmk{font:500 11px var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-right:6px;min-width:110px}
.lmt{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--text);font:500 13px var(--sans);padding:4px 8px;border-radius:8px;cursor:pointer}
.lmt:hover{background:rgba(255,255,255,.05);color:var(--bone)}body.lq-light .lmt:hover{background:rgba(21,26,33,.05)}
.lmt small{font-size:11px;color:var(--faint)}
.lmnear{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
.lmnear button{all:unset;box-sizing:border-box;display:flex;flex-direction:column;width:100%;padding:6px 8px;margin-left:-8px;border-radius:10px;cursor:pointer}
.lmnear button:hover{background:rgba(255,255,255,.05)}body.lq-light .lmnear button:hover{background:rgba(21,26,33,.05)}
.lmnear button:focus-visible{outline:2px solid currentColor}
.lmnear b{font:600 13px var(--sans);color:var(--bone)}.lmnear span{font-size:12px;color:var(--faint)}
.lmweeks{display:flex;align-items:flex-end;gap:3px;height:30px;margin-top:6px}
.lmweeks i{flex:1;min-width:4px;border-radius:2px;background:var(--faint);opacity:.6}
.lmweeks i:last-child{background:var(--bone);opacity:1}
body.lq-liquid .detail{width:310px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:16px;max-height:64vh}
body.lq-liquid.lq-light .detail{background:rgba(255,255,255,.6);border-color:rgba(21,26,33,.08)}
body.lq-liquid .detail h3{font:600 17px var(--sans);letter-spacing:-.01em}
body.lq-liquid .detail .k{font:500 11px var(--sans);letter-spacing:.1em;text-transform:uppercase;margin-top:14px}
body.lq-liquid .detail .tag{border:0;background:rgba(255,255,255,.06);border-radius:999px;padding:3px 9px;font-size:12px;color:var(--text)}
body.lq-liquid.lq-light .detail .tag{background:rgba(21,26,33,.05)}
body.lq-liquid .profile{font-size:14px;color:var(--text);margin-bottom:10px}
.screensbox{margin-top:22px;border-top:1px solid var(--line);padding-top:12px}
.screensbox > summary{cursor:pointer;list-style:none;display:flex;align-items:baseline;gap:8px}
.screensbox > summary::-webkit-details-marker{display:none}
.screensbox > summary::before{content:'';width:5px;height:5px;border-right:1.5px solid var(--faint);border-bottom:1.5px solid var(--faint);transform:rotate(-45deg);transition:transform .2s ease;align-self:center}
.screensbox[open] > summary::before{transform:rotate(45deg)}
.screensbox .note{max-width:80ch}
@media (max-width:720px){body.lq-liquid .maprow{flex-direction:column}body.lq-liquid .detail{width:auto;max-height:none}.lmk{min-width:0;width:100%}}
i[class^=ic-]{display:inline-block;width:1.05em;height:1.05em;vertical-align:-.17em;background:currentColor;-webkit-mask:var(--ic) center/contain no-repeat;mask:var(--ic) center/contain no-repeat;font-style:normal}
.ic-chat{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 5h16v11H9l-5 4z'/%3E%3C/svg%3E")}
.ic-plug{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5'/%3E%3C/svg%3E")}
.ic-person{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M4 21a8 8 0 0 1 16 0'/%3E%3C/svg%3E")}
.ic-bot{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='8' width='16' height='12' rx='3'/%3E%3Cpath d='M12 3v5M9 14h.01M15 14h.01'/%3E%3C/svg%3E")}
.ic-archive{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='5' rx='1'/%3E%3Cpath d='M5 9v11h14V9M10 13h4'/%3E%3C/svg%3E")}
.ic-idea{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.9 1 1.5 1 2.5h6c0-1 .2-1.6 1-2.5A6 6 0 0 0 12 3z'/%3E%3C/svg%3E")}
.ic-ask{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01'/%3E%3C/svg%3E")}
.ic-pause{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 5v14M15 5v14'/%3E%3C/svg%3E")}
.ic-warn{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3l10 18H2zM12 10v4M12 18h.01'/%3E%3C/svg%3E")}
.ic-x{--ic:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 6l12 12M18 6L6 18'/%3E%3C/svg%3E")}

/* ---- every panel, in the look ---- */
body.lq-liquid input[type=checkbox],body.lq-liquid input[type=radio]{-webkit-appearance:none;appearance:none;flex:none;width:18px;height:18px;margin:0;border-radius:50%;border:1.5px solid rgba(255,255,255,.3);background:transparent;cursor:pointer;display:inline-grid;place-items:center;transition:background-color .15s ease,border-color .15s ease;vertical-align:-4px}
body.lq-liquid input[type=checkbox]:checked{border-color:transparent;background:radial-gradient(circle at 34% 28%,#FFFFFF 0,#C9CFD9 20%,#5B626D 58%,#121418 100%)}
body.lq-liquid input[type=radio]:checked{border-color:#F3F0EA;background:radial-gradient(circle,#F3F0EA 0 4px,transparent 4.5px)}
body.lq-liquid.lq-light input[type=checkbox],body.lq-liquid.lq-light input[type=radio]{border-color:rgba(21,26,33,.3)}
body.lq-liquid.lq-light input[type=checkbox]:checked{background:radial-gradient(circle at 34% 28%,#FFFFFF 0,#E3E6EA 22%,#9BA2AC 55%,#3A3F46 100%)}
body.lq-liquid.lq-light input[type=radio]:checked{border-color:#151A21;background:radial-gradient(circle,#151A21 0 4px,transparent 4.5px)}
body.lq-liquid input[type=checkbox]:focus-visible,body.lq-liquid input[type=radio]:focus-visible{outline:2px solid currentColor;outline-offset:2px}
body.lq-liquid .switch input[type=checkbox],body.lq-liquid input[type=checkbox].sw{width:34px;height:20px;border-radius:999px;background:rgba(255,255,255,.1);border:0;position:relative}
body.lq-liquid .switch input[type=checkbox]::after,body.lq-liquid input[type=checkbox].sw::after{content:'';position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:50%;background:#8A919B;transition:transform .18s ease,background-color .18s ease}
body.lq-liquid .switch input[type=checkbox]:checked,body.lq-liquid input[type=checkbox].sw:checked{background:#F3F0EA}
body.lq-liquid .switch input[type=checkbox]:checked::after,body.lq-liquid input[type=checkbox].sw:checked::after{transform:translateX(14px);background:#0A0B0D}
body.lq-liquid.lq-light .switch input[type=checkbox],body.lq-liquid.lq-light input[type=checkbox].sw{background:rgba(21,26,33,.12)}
body.lq-liquid.lq-light .switch input[type=checkbox]:checked,body.lq-liquid.lq-light input[type=checkbox].sw:checked{background:#151A21}
body.lq-liquid.lq-light .switch input[type=checkbox]:checked::after,body.lq-liquid.lq-light input[type=checkbox].sw:checked::after{background:#FFFFFF}
body.lq-liquid .fchip{border:1px solid rgba(255,255,255,.1);background:transparent;color:var(--text);font:500 12.5px var(--sans);padding:5px 11px}
body.lq-liquid .fchip:hover{border-color:rgba(255,255,255,.22);color:var(--bone)}
body.lq-liquid.lq-light .fchip{border-color:rgba(21,26,33,.12)}
body.lq-liquid .tag{background:rgba(255,255,255,.06);border:0;color:var(--text)}
body.lq-liquid.lq-light .tag{background:rgba(21,26,33,.05)}
body.lq-liquid .note{border-radius:12px}
/* write-ups */
.wuhead{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;max-width:680px;margin:4px auto 18px}
.wut{margin:0;font:600 26px/1.15 var(--sans);letter-spacing:-.02em;color:var(--bone)}
.wus{font-size:13px;color:var(--faint);margin-top:4px}
.wua{display:flex;align-items:center;gap:8px}
#copy.done{color:#F2A541}
.swl{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px}.swl small{color:var(--faint)}
body.lq-liquid .out{max-width:680px;margin:0 auto;min-height:0;padding:0;background:transparent;border:0;border-radius:0;white-space:normal;font-size:15.5px;line-height:1.7;color:var(--text)}
body.lq-liquid .out.muted{padding:48px 0;text-align:center;color:var(--faint)}
body.lq-liquid .out h3,body.lq-liquid .out h4{margin:22px 0 6px;font:600 15px var(--sans);letter-spacing:.01em;color:var(--bone)}
body.lq-liquid .out h3{font-size:17px}
body.lq-liquid .out p{margin:0 0 10px}
body.lq-liquid .out ul{margin:4px 0 12px;padding-left:20px}
body.lq-liquid .out li{margin:3px 0}
body.lq-liquid .out li::marker{color:var(--faint)}
body.lq-liquid .out b{color:var(--bone);font-weight:600}
body.lq-liquid .rfoot{max-width:680px;margin:18px auto 0;font-family:var(--sans);border-top:1px solid var(--line)}
/* tasks */
body.lq-liquid .task{gap:12px;padding:11px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03);margin-top:6px;transition:background-color .15s ease}
body.lq-liquid .task:hover{background:rgba(255,255,255,.055)}
body.lq-liquid.lq-light .task{border-color:rgba(21,26,33,.07);background:rgba(255,255,255,.55)}
body.lq-liquid.lq-light .task:hover{background:rgba(255,255,255,.85)}
body.lq-liquid .task .t{font-size:14px;line-height:1.5;color:var(--text)}
body.lq-liquid .task .rp{background:transparent;border:0;padding:0;font-size:12px;color:var(--faint);white-space:nowrap}
body.lq-liquid .task .ask,body.lq-liquid .task .rm{display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;min-width:28px;padding:0 6px;height:28px;border-radius:8px;font-size:15px;color:var(--faint)}
body.lq-liquid .task .rm{opacity:0;transition:opacity .15s ease}
body.lq-liquid .task:hover .rm,body.lq-liquid .task .rm:focus-visible,body.lq-touch .task .rm{opacity:1}
body.lq-liquid .task .ask:hover,body.lq-liquid .task .rm:hover{background:rgba(255,255,255,.07);color:var(--bone)}
body.lq-liquid .task .ask.has,body.lq-liquid .task .ask.on{color:var(--bone)}
body.lq-liquid #panel-tasks > .note,body.lq-liquid #panel-tasks .tnote{font-size:12.5px}
/* agents' questions */
body.lq-liquid .aq{border:1px solid rgba(255,255,255,.08);border-left:2px solid var(--amber);border-radius:14px;background:rgba(255,255,255,.03);padding:12px 16px}
body.lq-liquid.lq-light .aq{border-color:rgba(21,26,33,.08);border-left-color:var(--amber);background:rgba(255,255,255,.55)}
body.lq-liquid .aq h4{font:600 11px var(--sans);letter-spacing:.1em;display:flex;align-items:center;gap:6px}
body.lq-liquid .aq .q{border-bottom-color:var(--line);padding:14px 16px;margin-top:8px}
body.lq-liquid .aq label.opt{gap:10px;padding:4px 0;align-items:center}
body.lq-liquid .aq .opt input{margin-top:0}
body.lq-liquid .who{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;background:rgba(255,255,255,.07);font-size:12px;font-weight:600;color:var(--bone);white-space:nowrap}
body.lq-liquid.lq-light .who{background:rgba(21,26,33,.06)}
/* drift */
body.lq-liquid .drift{border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03);border-radius:14px;padding:14px 16px}
body.lq-liquid.lq-light .drift{border-color:rgba(21,26,33,.07);background:rgba(255,255,255,.55)}
.dbead{flex:none;width:12px;height:12px;border-radius:50%;background:radial-gradient(circle at 34% 28%,#FFFFFF 0,#C9CFD9 20%,#5B626D 58%,#121418 100%)}
body.lq-light .dbead{background:radial-gradient(circle at 34% 28%,#FFFFFF 0,#E3E6EA 22%,#9BA2AC 55%,#3A3F46 100%)}
.drift.risk .dbead{background:radial-gradient(circle at 34% 28%,#FFF4E2 0,#F2A541 45%,#7A4A10 100%);box-shadow:0 0 10px rgba(242,165,65,.4)}
body.lq-liquid .drift .dn{font-size:14.5px}
body.lq-liquid .drift ul{margin:8px 0 0 20px}
body.lq-liquid .drift li{position:relative;padding:3px 0 3px 14px;font-size:13.5px;color:var(--text)}
body.lq-liquid .drift li::before{content:'';position:absolute;left:0;top:11px;width:5px;height:5px;border-radius:50%;background:var(--faint)}
body.lq-liquid .drift li.warn{color:var(--bone)}
body.lq-liquid .drift li.warn::before{background:var(--amber);box-shadow:0 0 6px rgba(242,165,65,.6)}
body.lq-liquid .drift .ev{font-family:var(--sans);font-size:11.5px}

/* links in the look's ink */
body.lq-liquid main a{color:var(--bone);text-decoration:underline;text-decoration-color:rgba(255,255,255,.3);text-underline-offset:3px;cursor:pointer}
body.lq-liquid.lq-light main a{text-decoration-color:rgba(21,26,33,.3)}
/* Settings: one column of titled cards */
body.lq-liquid #panel-settings{max-width:780px;margin:0 auto;display:flex;flex-direction:column;gap:14px;padding-bottom:20px}
body.lq-liquid .sset{border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03);border-radius:18px;padding:18px 20px}
body.lq-liquid.lq-light .sset{border-color:rgba(21,26,33,.07);background:rgba(255,255,255,.55)}
body.lq-liquid .sset.hidden,body.lq-liquid #panel-settings.hidden{display:none}
#quota{position:fixed;right:14px;bottom:14px;z-index:70;font:500 12px/1 var(--sans)}
#quota .qpill{display:flex;align-items:center;gap:7px;padding:8px 12px;border-radius:999px;cursor:pointer;color:#ECE9E4;background:rgba(10,11,14,.88);border:1px solid rgba(220,228,240,.18);backdrop-filter:blur(10px);max-width:calc(100vw - 28px);white-space:nowrap}
#quota .qdot{width:8px;height:8px;border-radius:50%;background:#46C282;flex:none}
#quota.near .qpill{border-color:#F2A541;color:#F2A541}#quota.near .qdot{background:#F2A541}
#quota.hit .qpill{border-color:#E5484D;background:#3A1114;color:#FFD9DA}#quota.hit .qdot{background:#E5484D;animation:qpulse 1.6s infinite}
@keyframes qpulse{50%{opacity:.35}}
#quota .qpop{display:none;position:absolute;right:0;bottom:calc(100% + 8px);width:min(340px,calc(100vw - 28px));padding:12px 14px;border-radius:14px;background:rgba(10,11,14,.96);color:#ECE9E4;border:1px solid rgba(220,228,240,.18);box-shadow:0 20px 50px -20px rgba(0,0,0,.8);font-weight:400;line-height:1.4}
#quota.open .qpop{display:block}
#quota .qrow{padding:8px 0;border-top:1px solid rgba(220,228,240,.12)}#quota .qrow:first-child{border-top:0;padding-top:0}
#quota .qrow b{font-weight:600}#quota .qrow small{display:block;color:#A1A8B1;font-size:11.5px}
#quota .qbar{height:5px;border-radius:3px;background:rgba(220,228,240,.14);margin:4px 0 2px;overflow:hidden}#quota .qbar i{display:block;height:100%;background:#46C282}
#quota .qbar.near i{background:#F2A541}#quota .qbar.hit i{background:#E5484D}
body.lq-light #quota .qpill,body.lq-light #quota .qpop{background:rgba(255,255,255,.96);color:#151A21;border-color:rgba(20,30,45,.18)}body.lq-light #quota.hit .qpill{background:#FDECEC;color:#8A1C20}body.lq-light #quota.near .qpill{color:#9A5200}
#qbanner{display:none;margin:0 0 10px;padding:9px 12px;border-radius:10px;border:1px solid #E5484D;background:rgba(229,72,77,.12);font-size:13px}#qbanner.show{display:block}
#i18nnote{position:fixed;left:16px;bottom:16px;z-index:60;max-width:calc(100vw - 32px);padding:8px 14px;border-radius:999px;font-size:13px;background:rgba(10,11,14,.88);color:#ECE9E4;border:1px solid rgba(220,228,240,.18);opacity:0;transition:opacity .4s;pointer-events:none}#i18nnote.on{opacity:1}body.lq-light #i18nnote{background:rgba(255,255,255,.94);color:#151A21;border-color:rgba(20,30,45,.15)}
.licproj{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.licproj .chip{display:inline-flex;align-items:center;gap:8px;padding:4px 6px 4px 12px;border:1px solid var(--line);border-radius:999px;font-size:13px}.licproj .chip button{padding:2px 8px;font-size:12px}
.ssh{margin:0 0 10px;font:600 16px var(--sans);letter-spacing:-.01em;color:var(--bone);display:flex;align-items:baseline;gap:8px}
.ssh .muted{font-weight:400;font-size:12.5px}
/* the Vault page (vaultview.mjs): grouped by service, one picked in a detail pane, what needs a look; no value until it's unlocked */
#panel-vault,#vaultmsg{--vred:#F07B7F;--vdig:#8CC2FF;--vsym:#F2B766}#panel-vault{max-width:1080px;margin:0 auto;--vred:#F07B7F;--vdig:#8CC2FF;--vsym:#F2B766;--vsoft:rgba(255,255,255,.045);--vsel:rgba(255,255,255,.085)}
body.lq-light #vaultmsg{--vred:#B42318}body.lq-light #panel-vault button.vdanger{color:#fff}body.lq-light #panel-vault{--vred:#B42318;--vdig:#1D5FC4;--vsym:#9A5200;--vsoft:rgba(21,26,33,.045);--vsel:rgba(21,26,33,.075)}
.vsl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.vbar{display:flex;align-items:center;gap:10px;margin:2px 0 12px}
.vsearch{position:relative;flex:1;min-width:0}
.vsearch svg{position:absolute;left:13px;top:50%;margin-top:-8px;width:16px;height:16px;color:var(--faint);pointer-events:none}
#panel-vault .vsearch input{width:100%;min-height:42px;padding:0 40px 0 38px;border-radius:12px;font-size:14px}
.vsearch kbd{position:absolute;right:10px;top:50%;transform:translateY(-50%);font:500 12px var(--sans);color:var(--faint);border:1px solid var(--line);border-radius:6px;padding:1px 7px;pointer-events:none}
.vsearch input:focus+kbd,.vsearch input:not(:placeholder-shown)+kbd{display:none}
.vchip{display:flex;align-items:center;gap:6px;min-height:42px;padding:0 6px 0 12px;border-radius:12px;border:1px solid var(--line);font-size:13.5px;color:var(--text);white-space:nowrap}
.vchip svg{width:15px;height:15px;flex:none}
.vchip.open{border-color:var(--green);color:var(--bone)}.vchip.open svg{color:var(--green)}
.vchip b{font-weight:600;color:var(--bone)}
.vchip button{min-height:32px;padding:0 10px;border-radius:8px;font-size:13px}
#panel-vault button.vtxt{background:transparent;border:0;color:var(--bone);font-weight:600;padding:0 8px;min-height:32px;cursor:pointer}
#panel-vault .vadd{min-height:42px;display:flex;align-items:center;gap:6px;padding:0 16px}
.vadd svg{width:15px;height:15px}
.vfilt{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px}
#panel-vault .vfilt button{min-height:34px;padding:0 13px;border-radius:999px;font:500 13px var(--sans);background:transparent;border:1px solid var(--line);color:var(--text);display:flex;align-items:center;gap:7px;cursor:pointer}
#panel-vault .vfilt button[aria-pressed="true"]{background:var(--bone);color:var(--ink);border-color:var(--bone)}
.vfilt i{font-style:normal;color:var(--faint)}.vfilt button[aria-pressed="true"] i{color:inherit;opacity:.7}
.vdot{width:8px;height:8px;border-radius:50%;background:var(--amber);flex:none}
.vsplit{display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:18px;align-items:start}
.vlist{min-width:0}
#panel-vault.vsolo .vsplit{grid-template-columns:minmax(0,1fr)}#panel-vault.vsolo .vlist{display:none}#panel-vault.vsolo .vdetail{position:static;width:100%;max-width:640px;margin:0 auto}
.vgh{display:flex;align-items:center;gap:8px;padding:14px 10px 4px;font:600 12.5px var(--sans);color:var(--faint)}.vgh:first-child{padding-top:2px}
.vgh i{font-style:normal;font-weight:400}
#panel-vault .vrow{display:flex;align-items:center;gap:11px;width:100%;min-height:54px;padding:8px 10px;margin:1px 0;border-radius:11px;border:0;background:transparent;text-align:left;color:inherit;cursor:pointer;font:inherit}
#panel-vault .vrow:hover{background:var(--vsoft)}
#panel-vault .vrow[aria-selected="true"]{background:var(--vsel)}
.vrow .vt{flex:1;min-width:0}
.vrow .vt b,.vrow .vt span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vrow .vt b{font:600 14px/1.35 var(--sans);color:var(--bone)}
.vrow .vt span{font-size:12.5px;line-height:1.4;color:var(--faint)}
.vmono{flex:none;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font:600 14px var(--sans);color:hsl(var(--h) 75% 84%);background:hsl(var(--h) 30% 23%)}
body.lq-light .vmono{color:hsl(var(--h) 55% 28%);background:hsl(var(--h) 60% 90%)}
.vdetail{position:sticky;top:var(--vtop,12px);min-width:0;border:1px solid var(--line);border-radius:16px;background:var(--ink2);padding:22px}
.vdh{display:flex;align-items:center;gap:14px;min-width:0}
.vdh .vmono{width:50px;height:50px;border-radius:14px;font-size:21px}
.vdh .vtt{flex:1;min-width:0}
.vdh h2{margin:0;font:600 20px/1.25 var(--sans);color:var(--bone);overflow-wrap:anywhere}
.vdh p{margin:3px 0 0;font-size:13px;color:var(--faint)}
.vdact{display:flex;gap:6px;flex:none}
#panel-vault .vdact button,#panel-vault .vbtn{min-height:38px;padding:0 13px;font-size:13.5px}
#panel-vault button.vdel{background:transparent;border:1px solid var(--line);color:var(--vred)}
#panel-vault button.vdel:hover{border-color:var(--vred)}
#panel-vault button.vdanger{background:var(--vred);color:#1B0B0C;border:0;border-radius:10px;font:inherit;font-weight:600;cursor:pointer}
.vissue{display:flex;gap:10px 14px;align-items:center;flex-wrap:wrap;margin:18px 0 0;padding:12px 14px;border-radius:12px;border:1px solid color-mix(in srgb,var(--amber) 40%,transparent);background:color-mix(in srgb,var(--amber) 9%,transparent);font-size:13.5px;line-height:1.45;color:var(--text)}
.vissue p{flex:1 1 240px;margin:0;display:flex;gap:9px;align-items:baseline}.vissue p .vdot{position:relative;top:-1px}
.vissue .vib{display:flex;gap:6px}
.vfield{margin-top:18px;border:1px solid var(--line);border-radius:12px;background:var(--vsoft)}
.vfl{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 14px 0;font-size:12.5px;color:var(--faint);min-height:20px}.vfl.vfl2{padding:8px 8px 0 14px}
.vval{display:flex;align-items:center;gap:8px;padding:6px 8px 8px 14px;min-height:54px}
.vval code{flex:1;min-width:0;font:500 15.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--bone);overflow-wrap:anywhere;user-select:all}
.vval code.vhid{letter-spacing:.16em;color:var(--faint);user-select:none;white-space:nowrap;overflow:hidden}
.vval code .vd{color:var(--vdig)}.vval code .vs{color:var(--vsym)}
#panel-vault .vval button,#panel-vault .vcode button{min-height:38px;min-width:70px;padding:0 12px;font:600 13.5px var(--sans);display:flex;align-items:center;justify-content:center;gap:6px}
.vval button svg,.vcode button svg{width:15px;height:15px}
#panel-vault .vval button[data-va='copy'],#panel-vault .vcode button{min-width:124px;padding:0 10px}
.vcodes{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:6px;padding:6px 10px 10px}
.vcode{display:flex;align-items:center;gap:6px;padding:4px 4px 4px 10px;border-radius:9px;background:var(--ink);font:500 14px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--bone);min-height:46px}
.vcode span{flex:1;min-width:0;overflow-wrap:anywhere}
.vcode.used span{text-decoration:line-through;color:var(--faint)}.vcode.used em{font:400 12.5px var(--sans);color:var(--faint);padding-right:8px}
.vok{min-height:20px;padding:0 14px 10px;font-size:12.5px;color:var(--green)}
.vok:empty{display:none}.vok.vbad{color:var(--vred)}
.vbadn{display:block;margin-top:4px;font-size:12.5px;color:var(--vred)}
.vmeta{margin:20px 0 0;display:grid;grid-template-columns:max-content minmax(0,1fr);gap:9px 18px;font-size:13.5px;line-height:1.45}
.vmeta dt{color:var(--faint)}.vmeta dd{margin:0;color:var(--text);min-width:0;overflow-wrap:anywhere}
.vmeta code{font:500 13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--ink);color:var(--bone);padding:2px 7px;border-radius:6px}
.vmeta button{margin-left:6px}
#panel-vault .vmeta button.vtxt{min-height:28px;padding:0 6px;font-size:12.5px;color:var(--faint)}
#panel-vault .vmeta button.vtxt svg{width:13px;height:13px;vertical-align:-2px;margin-right:4px}
.vform{display:grid;gap:12px;margin-top:2px}
.vform label{display:grid;gap:5px;font-size:13px;color:var(--faint)}.vform .vhint{font-size:12px;line-height:1.4;color:var(--faint)}.vmeta .vnosite{color:var(--faint)}
#panel-vault .vform input,#vaultsheet input,#vaultsheet textarea{width:100%;min-height:42px;font-size:14.5px;border-radius:10px;box-sizing:border-box}
#vaultsheet textarea{min-height:120px;padding:10px 12px;font:500 14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;resize:vertical}
.vsb{display:flex;align-items:center;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:6px}
#panel-vault .vsb button,#vaultsheet .vsb button{min-height:40px;padding:0 16px}
.vconfirm{margin-top:18px;padding:14px 16px;border-radius:12px;border:1px solid var(--vred);background:color-mix(in srgb,var(--vred) 8%,transparent);font-size:14px;line-height:1.45;color:var(--text)}
.vconfirm p{margin:0 0 10px}
.vempty{padding:36px 22px;text-align:center;font-size:14px;line-height:1.55;color:var(--faint);border:1px dashed var(--line);border-radius:14px}
.vempty b{display:block;margin-bottom:4px;font:600 15px var(--sans);color:var(--bone)}
.vempty .vsb{justify-content:center;margin-top:14px}
.vskel{height:54px;margin:1px 0;border-radius:11px;background:var(--vsoft)}
.vlog{margin:22px 4px 0;font-size:13px;color:var(--faint)}
.vlog summary{cursor:pointer;min-height:40px;display:flex;align-items:center;font-weight:500}
.vlog .vlr{display:flex;gap:10px;padding:6px 0;border-top:1px solid var(--line)}.vlog .vlr b{color:var(--text);font-weight:500;flex:1;min-width:0;overflow-wrap:anywhere}
#panel-vault .vback{display:none}
#vaultmsg{position:fixed;left:16px;right:16px;bottom:104px;margin:0 auto;width:fit-content;max-width:560px;box-sizing:border-box;z-index:85;display:flex;align-items:center;gap:12px;padding:10px 10px 10px 16px;border-radius:12px;background:var(--bone);color:var(--ink);font-size:14px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.ownpress{margin-top:12px;font-size:13px}.ownpress>b{display:block;margin-bottom:2px;color:var(--bone)}
@media (max-width:600px){#ownrow,#linerow{flex-direction:column;align-items:stretch;gap:10px}#ownrow>button,#linerow>button{width:100%;min-height:40px}}
.ownsteps{margin:6px 0 4px;padding-left:22px}.ownsteps li{margin:4px 0}.ownpathrow{display:flex;gap:8px;align-items:center;margin-top:4px}.ownpath{flex:1;min-width:0;overflow-wrap:anywhere;word-break:break-all;font-size:12.5px;line-height:1.5}.owncopy{flex:none}
#vaultmsg:empty{display:none}#vaultmsg.err{background:var(--vred);color:#1B0B0C}body.lq-light #vaultmsg.err{color:#fff}
#vaultmsg button{min-height:32px;padding:0 12px;border-radius:8px;border:0;background:rgba(0,0,0,.12);color:inherit;font:600 13.5px var(--sans);cursor:pointer}
#vaultsheet{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:16px;background:rgba(4,6,8,.55)}
#vaultsheet.hidden{display:none}
.vsheet{width:min(430px,100%);max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;border-radius:18px;background:var(--ink2);border:1px solid var(--line);padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.45)}
.vsheet .vmono{width:44px;height:44px;border-radius:13px;margin-bottom:14px}
.vsheet .vlockic{display:grid;place-items:center;width:44px;height:44px;border-radius:13px;margin-bottom:14px;background:var(--vsoft);color:var(--bone)}.vsheet .vlockic svg{width:20px;height:20px}
.vsheet h3{margin:0 0 6px;font:600 18px/1.3 var(--sans);color:var(--bone)}
.vsheet>p{margin:0 0 16px;font-size:14px;line-height:1.5;color:var(--text)}
.vsheet .vform{gap:12px}
.verr{min-height:0;font-size:13px;line-height:1.45;color:var(--vred)}.verr:empty{display:none}
.vfine{margin:16px 0 0;font-size:12.5px;line-height:1.5;color:var(--faint)}
.vfine code{font:500 12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--text)}
.vcheck{display:flex!important;grid-template-columns:none!important;align-items:center;gap:8px!important;color:var(--text)!important;font-size:13.5px!important;cursor:pointer}
.vcheck input{appearance:auto;-webkit-appearance:checkbox;width:18px!important;min-height:18px!important;height:18px;margin:0;padding:0;border-radius:4px;accent-color:var(--green)}
.vpw{position:relative}.vpw input{padding-right:70px}
#vaultsheet .vpw button{position:absolute;right:5px;top:5px;min-height:32px;padding:0 10px;font-size:12.5px}
body.lq-liquid #panel-vault{--vtop:74px}body.lq-liquid .vdetail{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.035)}
body.lq-liquid.lq-light .vdetail{border-color:rgba(21,26,33,.09);background:rgba(255,255,255,.7)}
body.lq-liquid .vfield,body.lq-liquid .vchip,body.lq-liquid .vfilt button{border-color:rgba(255,255,255,.1)}
body.lq-liquid.lq-light .vfield,body.lq-liquid.lq-light .vchip,body.lq-liquid.lq-light .vfilt button{border-color:rgba(21,26,33,.12)}
body.lq-liquid .vchip.open{border-color:var(--green)}
body.lq-liquid .vsheet{background:#16181C}body.lq-liquid.lq-light .vsheet{background:#FBFBFA}
@media (max-width:760px){
.vsplit{grid-template-columns:minmax(0,1fr)}
#panel-vault.vone .vlist,#panel-vault.vone .vfilt,#panel-vault.vone .vbar{display:none}
#panel-vault:not(.vone) .vdetail{display:none}
#panel-vault.vsolo .vdetail{display:block}
.vdetail{position:static;padding:16px;border-radius:14px}
#panel-vault .vback{display:flex;align-items:center;gap:4px;min-height:40px;margin:0 0 10px;padding:0 10px 0 4px;background:transparent;border:0;color:var(--bone);font:600 14px var(--sans);cursor:pointer}
.vdh{flex-wrap:wrap}.vdact{width:100%}.vdact button{flex:1}
.vchip .vcl{display:none}
#panel-vault .vadd span{display:none}#panel-vault .vadd{padding:0 13px}
.vcodes{grid-template-columns:minmax(0,1fr)}#panel-vault .vcode button{min-width:44px;min-height:40px}#panel-vault .vcode button .vbl{display:none}
#vaultmsg{bottom:96px}
.vbar{flex-wrap:wrap}.vsearch{flex:1 1 100%}.vchip{flex:1}
.vfilt{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-left:-2px;padding:0 2px 2px}.vfilt::-webkit-scrollbar{display:none}#panel-vault .vfilt button{flex:none}
.vmeta{grid-template-columns:minmax(0,1fr);gap:2px}.vmeta dd{margin-bottom:10px}#panel-vault .vmeta button.vtxt{min-height:40px}
}
body.lq-liquid.lq-light .vlock.open{border-color:var(--green)}
@media (max-width:560px){.vrow{grid-template-columns:minmax(0,1fr)}.vrow .va{grid-column:1;grid-row:auto;margin-top:6px}.vrow .va button{flex:1}.vlock input{flex:1 1 100%;width:100%}.vlock button{flex:1}}
body.lq-liquid .sset > label:not(.check):not(.swl){display:block;font:500 12.5px var(--sans);color:var(--faint);margin:12px 0 6px}
body.lq-liquid .sset label.check{display:flex;align-items:center;gap:10px;margin:8px 0;color:var(--text);font-size:13.5px}
body.lq-liquid .sset .note{font-size:12.5px;max-width:70ch}
body.lq-liquid .sset .cxh{margin-top:0}
/* the Close bar carries the panel's own ground, so what scrolls under it stays clean */
/* top: the panel's padding (main's 16px), so it sticks at the very top edge: scrolled content no longer shows in a strip above it */
body.lq-liquid.lq-pooled #lqsinkrow{top:-16px;margin:-14px -14px 10px;padding:10px 10px 8px;background:#06080B;border-radius:22px 22px 0 0}
body.lq-liquid.lq-light.lq-pooled #lqsinkrow{background:#F6F8FB}

/* Agents: needs you, at work, finished (folded) */
.agdone{margin-top:6px}
.agdone > summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px}
.agdone > summary::-webkit-details-marker{display:none}
.agdone > summary::before{content:'';width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .2s ease}
.agdone[open] > summary::before{transform:rotate(45deg)}
.tgroup.agg{margin-top:16px}
/* the relay: Agents on the Tasks screen, a line and a blob per project */
#lqline,#lqrelay{display:none}
body.lq-work:not(.lq-pooled) #lqline{display:block;position:absolute;left:50%;top:84px;transform:translateX(-50%);z-index:3;max-width:calc(100% - 32px);text-align:center;font:400 13.5px/1.4 var(--sans);color:#A1A8B1;text-shadow:0 1px 10px rgba(0,0,0,.7)}
#lqline b{color:#F2A541;font-weight:600}
body.lq-light #lqline{color:#2E3743;text-shadow:none}body.lq-light #lqline b{color:#9A5200}
body.lq-work:not(.lq-pooled) #lqrelay:not(:empty){display:flex;flex-direction:column;gap:12px;position:absolute;right:16px;top:116px;bottom:96px;width:min(420px,32vw);overflow-y:auto;scrollbar-width:none;z-index:4;padding:2px 2px 24px;-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 28px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 28px),transparent)}
#lqrelay::-webkit-scrollbar{display:none}
@media (max-width:899px){body.lq-work:not(.lq-pooled) #lqrelay:not(:empty){display:none}}
.rly{flex:none;display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:20px;background:rgba(14,16,19,.86);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(14px);box-shadow:0 22px 50px -28px rgba(0,0,0,.9);color:#ECE9E4}
.rly.lit{border-color:rgba(242,165,65,.35)}
body.lq-light .rly{background:rgba(255,255,255,.92);border-color:rgba(21,26,33,.08);color:#151A21;box-shadow:0 22px 50px -30px rgba(30,45,60,.45)}
body.lq-light .rly.lit{border-color:rgba(154,82,0,.3)}
.rlh{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.rlh b{font:600 15px var(--sans);letter-spacing:-.01em}
.rls{font:500 11.5px var(--sans);color:#8A919B;white-space:nowrap}
.rly.lit .rls{color:#F2A541}body.lq-light .rly.lit .rls{color:#9A5200}
.rlsum{margin:0;font-size:13.5px;line-height:1.45;color:#C9CDD3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
body.lq-light .rlsum{color:#2B3644}
.lqblob.rlask{position:static;display:flex;flex-direction:column;gap:7px;padding:10px 12px;border-radius:14px;background:rgba(242,165,65,.06);border:1px solid rgba(242,165,65,.22)}
.lqblob.rlask .nhead{font-size:12px;color:#8A919B}.lqblob.rlask .nhead b{font-weight:600;color:inherit}
.lqblob.rlask .bq{font-size:13px}
body.lq-light .lqblob.rlask{background:rgba(154,82,0,.05);border-color:rgba(154,82,0,.2)}
.rly .rlok{align-self:flex-start}
.rlk{margin-top:2px;font:500 11px var(--sans);letter-spacing:.1em;text-transform:uppercase;color:#8A919B}
.rli{display:flex;align-items:flex-start;gap:10px;padding:6px 0;border-top:1px solid rgba(255,255,255,.06);font-size:13px;line-height:1.4;color:#C9CDD3;transition:opacity .3s ease}
.rli > span:first-child{flex:1;min-width:0}
.rli.gone{opacity:0}
.rlfrom{font-size:11px;color:#8A919B;white-space:nowrap}
.rlsent{font-size:12px;color:#8A919B}
body.lq-light .rlsent{color:#5B6573}
body.lq-light .rli{border-top-color:rgba(21,26,33,.07);color:#2B3644}
.rlia{flex:none;display:flex;gap:2px}
.rlia button,.rlf button{all:unset;box-sizing:border-box;cursor:pointer;padding:3px 7px;border-radius:8px;font:500 12px var(--sans);color:#8A919B}
.rlia button:hover,.rlf button:hover{color:#ECE9E4;background:rgba(255,255,255,.06)}
body.lq-light .rlia button:hover,body.lq-light .rlf button:hover{color:#151A21;background:rgba(21,26,33,.05)}
.rlia .rladd{color:#ECE9E4}body.lq-light .rlia .rladd{color:#151A21}
.rlia button:focus-visible,.rlf button:focus-visible{outline:2px solid currentColor;outline-offset:1px}
.rldone{font-size:12px;color:#8A919B}
.rlf{display:flex;justify-content:space-between;margin:2px -7px -4px}

/* waiting on replies: a ring on the inbox's current, a thread to now */
.bwait{position:absolute;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;padding:0;border-radius:50%;border:2px solid #F2A541;background:rgba(8,9,11,.6);cursor:pointer;z-index:2;box-shadow:0 0 12px rgba(242,165,65,.35)}
.bwait.in{background:#F2A541}
.bwait.early{border-style:dashed}
.bwait:focus-visible{outline:2px solid var(--bone);outline-offset:3px}
body.lq-light .bwait{background:rgba(255,255,255,.8);border-color:#B86A0C}body.lq-light .bwait.in{background:#B86A0C}
.bwthread{position:absolute;height:0;border-top:1.5px dashed rgba(242,165,65,.45);pointer-events:none}
body.lq-light .bwthread{border-top-color:rgba(184,106,12,.45)}
.btip .bwask{margin-top:6px;font-size:12.5px;color:var(--faint)}
.btip .bwnote{font-size:11.5px;color:var(--faint);margin-left:4px}
/* drafts to post: a shelf of cards */
.pshead{display:flex;flex-direction:column;gap:2px;margin:24px 0 10px}
.pshead span{font:600 15px var(--sans);color:var(--bone)}
.pshead small{font-size:12.5px;color:var(--faint);overflow-wrap:anywhere} /* a folder path in it wraps rather than widening the panel on a phone (15 Oct 2026) */
/* Marketing's 4-week test: a row a week; the week you're in marked, the ones to come faint */
.mkwrap{overflow-x:auto}.mktab{width:100%;border-collapse:collapse;font-size:13px}
.mktab th{font:500 11px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--faint);text-align:left;padding:6px 10px 8px 0;border-bottom:1px solid var(--line);white-space:nowrap}
.mktab td{padding:9px 10px 9px 0;border-bottom:1px solid var(--line);color:var(--text);vertical-align:baseline}.mktab td b{color:var(--bone)}
.mktab td.n{font-variant-numeric:tabular-nums}.mktab tr[aria-current] td{color:var(--bone)}.mktab tr[aria-current] td:first-child{box-shadow:inset 2px 0 0 var(--amber);padding-left:8px}
.pshelf{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;align-items:start}
body.lq-liquid .pshelf .pcard{position:relative;display:flex;flex-direction:column;gap:10px;margin:0;padding:16px 18px;border-radius:20px;border:1px solid rgba(255,255,255,.08);border-left:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035)}
body.lq-liquid.lq-light .pshelf .pcard{background:rgba(255,255,255,.75);border-color:rgba(21,26,33,.08)}
body.lq-liquid .pshelf .pcard.editing{grid-column:1/-1}
.pshelf .pcard .rhead{display:flex;flex-direction:column;gap:1px}
.pshelf .pcard .rhead b{font:600 15px var(--sans);color:var(--bone)}
.pshelf .pcard .rhead .muted{font-size:12px}
.pshelf .ptext{white-space:pre-wrap;font-size:14px;line-height:1.55;color:var(--text);max-height:9.5em;overflow:hidden;-webkit-mask-image:linear-gradient(to bottom,#000 60%,transparent);mask-image:linear-gradient(to bottom,#000 60%,transparent)}
.pshelf .pcard.open .ptext{max-height:none;-webkit-mask-image:none;mask-image:none}
.pshelf .pmore{all:unset;cursor:pointer;align-self:flex-start;font:500 12.5px var(--sans);color:var(--faint);text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(127,127,127,.4)}
.pshelf .pmore:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.pshelf .pedit{min-height:260px;font:14px/1.55 var(--sans)}
.pshelf .pcard .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:2px}
.pshelf .psrc summary{font-size:12px;color:var(--faint);cursor:pointer}

/* a project's tasks: calm cards, two lines a task (click for all), no repo name inside its own page */
.wdagents{margin-top:26px;padding-top:16px;border-top:1px solid var(--line)}
.tnhow{margin:2px 0 8px}
.tnhow > summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:7px;font:500 12.5px var(--sans);color:var(--faint)}
.tnhow > summary::-webkit-details-marker{display:none}
.tnhow > summary::before{content:'?';display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;border:1px solid currentColor;font-size:10.5px;font-weight:600}
.tnhow .note{margin-top:6px;max-width:80ch}
body.lq-liquid #panel-tasks .task .t{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer}
body.lq-liquid #panel-tasks .rcard .rtask .t{-webkit-line-clamp:1}
body.lq-liquid #panel-tasks .task.open .t{display:block;-webkit-line-clamp:unset;overflow:visible}
#tasklist.onerepo .task .rp,.rcard .task .rp{display:none}
body.lq-liquid .rcard{border:1px solid rgba(242,165,65,.3);border-radius:20px;padding:16px 18px 14px;background:rgba(255,255,255,.035);box-shadow:none;margin-top:10px}
body.lq-liquid.lq-light .rcard{background:rgba(255,255,255,.75);border-color:rgba(154,82,0,.25)}
/* a long card's Approve row sticks to the panel's bottom edge (bottom: main's padding) while the card is in view, so it's never scrolled out of reach */
body.lq-liquid .rcard>.ract{position:sticky;bottom:-16px;z-index:1;margin:8px -18px 0;padding:12px 18px 10px;background:linear-gradient(180deg,rgba(9,11,15,0),rgba(9,11,15,.97) 14px)}
body.lq-liquid.lq-light .rcard>.ract{background:linear-gradient(180deg,rgba(248,249,251,0),rgba(248,249,251,.96) 14px)}
body.lq-liquid .rcard .rhead b{font:600 16px var(--sans);letter-spacing:-.01em}
body.lq-liquid .rcard .task{margin-top:6px;padding:9px 12px;border-radius:12px}
.rwork{display:flex;align-items:center;gap:9px;margin:10px 0 2px;font-size:13px;color:var(--text)}
.rwork i{flex:none;width:9px;height:9px;border-radius:50%;background:#F2A541;box-shadow:0 0 0 0 rgba(242,165,65,.5);animation:rwork 1.8s ease-out infinite}
@keyframes rwork{0%{box-shadow:0 0 0 0 rgba(242,165,65,.5)}100%{box-shadow:0 0 0 9px rgba(242,165,65,0)}}
@media (prefers-reduced-motion: reduce){.rwork i{animation:none}}

/* scrollbars, everywhere: thin, no arrows, in the look's ink */
body.lq-liquid,body.lq-liquid *{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.16) transparent}
body.lq-liquid.lq-light,body.lq-liquid.lq-light *{scrollbar-color:rgba(21,26,33,.18) transparent}
body.lq-liquid ::-webkit-scrollbar{width:8px;height:8px}
body.lq-liquid ::-webkit-scrollbar-button{display:none}
body.lq-liquid ::-webkit-scrollbar-track{background:transparent}
body.lq-liquid ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:999px}
body.lq-liquid.lq-light ::-webkit-scrollbar-thumb{background:rgba(21,26,33,.16)}

/* screenshots in the talk */
#lqatts{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);width:min(640px,calc(100vw - 32px));display:flex;gap:8px;z-index:3;pointer-events:none}
#lqatts:empty{display:none}
.lqatt{position:relative;pointer-events:auto}
.lqatt img{display:block;width:64px;height:48px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.2);box-shadow:0 8px 20px -10px rgba(0,0,0,.8)}
.lqatt button{position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;border:0;background:#F3F0EA;color:#0A0B0D;font:600 13px/20px var(--sans);text-align:center;cursor:pointer;padding:0}
body.lq-light .lqatt img{border-color:rgba(21,26,33,.15)}body.lq-light .lqatt button{background:#151A21;color:#FFFFFF}
#lqform.drop{outline:2px dashed rgba(242,165,65,.7);outline-offset:4px}
.lqmimgs{display:flex;gap:6px;margin-bottom:6px}.lqmimgs img{width:120px;max-height:90px;object-fit:cover;border-radius:8px}

/* Away (Super and the key above Tab): the orb, the time and what's going on, on every screen; nothing else */
#lqaway{display:none}
body.lq-away{cursor:none;overflow:hidden}
body.lq-away #lq{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;display:block!important}
body.lq-away>*:not(#liquid):not(#lqaway):not(script),body.lq-away #liquid>*:not(#lq){display:none!important}
body.lq-away #liquid{display:block!important;position:fixed!important;inset:0!important}
body.lq-away #lqaway{display:block;position:fixed;left:0;top:0;width:440px;text-align:center;pointer-events:none;z-index:5;color:#F3F0EA;text-shadow:0 1px 14px rgba(0,0,0,.65);will-change:transform;transition:opacity .6s}
#lqaway .awt{font:300 68px/1 var(--sans);letter-spacing:-.03em;font-variant-numeric:tabular-nums}
#lqaway .awd{margin-top:10px;font:500 12px var(--sans);letter-spacing:.16em;text-transform:uppercase;opacity:.55}
#lqaway .aws{margin-top:20px;font:400 15px/1.6 var(--sans);opacity:.9}
#lqaway .aws b{color:var(--amber);font-weight:600}
#lqaway .awr{display:block;font-size:13.5px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lqaway .awh{margin-top:16px;font-size:11.5px;opacity:.32}
body.lq-light #lqaway{color:#151A21;text-shadow:0 1px 12px rgba(255,255,255,.8)}
body.lq-light #lqaway .aws b{color:#9A5200}

/* Setup: the first run, over everything, until it's done */
/* Your phone: the QR that pairs it, the line saying how fresh the copy is, an agent's question answered from the phone */
.pqr{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:10px 0}
.pqr .qrimg{flex:none;width:188px;height:188px;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 8px 26px -12px rgba(0,0,0,.55)}
.pqr .qrimg svg{display:block;width:100%;height:100%}
.pqr .qrtxt{flex:1;min-width:190px;font-size:13.5px;line-height:1.55;color:var(--text)}
.pqr .qrtxt .muted{display:block;margin-top:6px;font-size:12.5px}
.pqr .code{letter-spacing:3px;margin-right:-3px;white-space:nowrap}
#pcline{font-size:13.5px;line-height:1.5;color:var(--faint);margin:2px 0 8px}
#pcline b{color:var(--amber);font-weight:600}
.pcwait{font-size:11px;color:var(--amber);white-space:nowrap}
.pcq{padding:12px 13px;border:1px solid var(--line);border-radius:12px;margin-top:8px;background:var(--ink2)}
.pcq .qn{font-size:12px;color:var(--faint)}
.pcbubble{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.4;margin:8px 0 6px;padding:9px 11px;border-radius:12px 12px 12px 3px;background:var(--ink);border:1px solid var(--line);max-height:260px;overflow:auto}
.pcchips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px}.pcchips span{font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid var(--line);color:var(--faint)}
.pcown[hidden]{display:none}
.pccode{font-size:12px;color:var(--faint);margin:0 0 8px}.pccode .ghost{font-size:12px;padding:5px 10px}.pccode .act{display:block;width:100%;font-size:14px;text-align:left;white-space:normal;line-height:1.4;height:auto;padding:8px 12px;margin-bottom:4px}
.pcq .qq{font-size:13.5px;line-height:1.5;color:var(--text);margin:4px 0 8px;overflow-wrap:anywhere}
.pcq .opts{display:flex;flex-direction:column;gap:6px;align-items:stretch}
.pcq .opts button{text-align:left;white-space:normal;line-height:1.4;height:auto;padding:8px 12px}
.pcq form{display:flex;gap:8px;margin-top:8px}.pcq form input{flex:1;min-width:0}
.pcq ul{margin:6px 0 8px;padding-left:18px;font-size:13px;line-height:1.5;color:var(--text)}
/* Home on a phone paired with your computer (lqPhone): a plain list to act on, no liquid. What needs you and the tasks first, the rest of Symbiot one tap away in a row along the top */
#phhome{display:none}
body.lq-phone:not(.lq-work):not(.lq-pooled) #phhome{display:block;position:absolute;left:0;right:0;top:64px;bottom:84px;z-index:3;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;padding:0 16px 24px;color:var(--text);font-family:var(--sans)}
#phhome::-webkit-scrollbar{display:none}
body.lq-phone:not(.lq-work):not(.lq-pooled) :is(#lq,#lqdrops,#lqgroups,#lqneedt,#lqnext,#lqcore,#lqorbits,#lqrelay,#lqmore,#lqline,#lqgo){display:none}
body.lq-phone:not(.lq-work):not(.lq-pooled) #liquid{background:var(--ink)}
#phnav{position:sticky;top:0;z-index:2;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:8px 16px 10px;background:var(--ink)}
#phnav::-webkit-scrollbar{display:none}
#phnav button{flex:none;display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:6px 13px;border-radius:999px;border:1px solid var(--line);background:var(--ink2);color:var(--text);font:500 13px/1 var(--sans);cursor:pointer}
#phnav button b{font-weight:600;color:var(--amber)}
#phnav button.lit{border-color:var(--amber)}
#phhome #pcline{font-size:12.5px;line-height:1.45;color:var(--faint);margin:4px 0 2px}
#phhome #pcline b{color:var(--amber)}
#phhome .pshead{margin:14px 0 8px}
#phhome .mkneeds{margin-top:10px}
#phhome .pcadd input{flex:1 1 100%}#phhome .pcadd select{flex:1 1 0}
#phyou{margin:10px 0 0}
#phyou .phyi{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;margin-top:6px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--ink2);color:var(--text);font:inherit;text-align:left;cursor:pointer}
#phyou .phyi b{font-weight:600;font-size:13.5px}
#phyou .phyi span{font-size:12.5px;line-height:1.4;color:var(--faint)}
#phyou .phyi.urgent{border-color:var(--amber)}
.pcadd{display:flex;gap:8px;margin:8px 0 2px;flex-wrap:wrap}.pcadd input{flex:1;min-width:150px}.pcadd select{flex:0 1 160px;min-width:0}
.pcfound{display:flex;flex-direction:column;gap:6px;margin-top:8px}
body.lq-hline:not(.lq-work):not(.lq-pooled):not(.lq-chat):not(.lq-onb) #lqline{display:block;position:absolute;left:50%;top:auto;bottom:100px;transform:translateX(-50%);z-index:3;max-width:calc(100% - 32px);text-align:center;font:400 13.5px/1.4 var(--sans);color:#A1A8B1;text-shadow:0 1px 10px rgba(0,0,0,.7)}
body.lq-hline.lq-light:not(.lq-work):not(.lq-pooled):not(.lq-chat):not(.lq-onb) #lqline{color:#2E3743;text-shadow:none}
.onb{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(5,6,8,.74);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}
.onb.hidden{display:none}
.onbin{width:min(700px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;padding:30px 32px 26px;border-radius:28px;background:rgba(19,21,25,.9);border:1px solid rgba(255,255,255,.08);box-shadow:0 30px 80px -30px rgba(0,0,0,.9);color:var(--text)}
.onbdots{display:flex;gap:6px;margin-bottom:22px}.onbdots i{display:block;height:4px;flex:1;border-radius:4px;background:rgba(255,255,255,.1)}.onbdots i.on{background:var(--amber)}.onbdots i.past{background:rgba(242,165,65,.45)}
.onb h2{margin:0 0 8px;font:650 28px/1.15 var(--sans);letter-spacing:-.02em;color:var(--bone)}
.onbl{margin:0 0 20px;font-size:15px;line-height:1.55;color:var(--faint)}
.onbcards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:6px 0 20px}
.onbcard{padding:16px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}
.onbcard b{display:block;margin-bottom:6px;font:600 15px var(--sans);color:var(--bone)}.onbcard span{font-size:13.5px;line-height:1.5;color:var(--faint)}
.onbnote{font-size:13px;color:var(--faint);margin:0 0 18px}
.onbok{display:flex;gap:10px;align-items:flex-start;padding:14px 16px;border-radius:16px;background:rgba(79,190,140,.08);border:1px solid rgba(79,190,140,.25);margin-bottom:18px;font-size:14.5px;line-height:1.5}
.onbok i{flex:none;width:20px;height:20px;border-radius:50%;background:#4FBE8C;color:#06120C;font:700 12px/20px var(--sans);text-align:center;font-style:normal}
.onbbox{padding:16px;border-radius:18px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);margin-bottom:12px}
.onbbox h3{margin:0 0 6px;font:600 15px var(--sans);color:var(--bone)}.onbbox p{margin:0 0 10px;font-size:13.5px;line-height:1.5;color:var(--faint)}
.onbbox code{font-size:12.5px;padding:1px 6px;border-radius:6px;background:rgba(255,255,255,.08)}
.onbrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.onbrow input,.onbrow select{flex:1;min-width:160px}
.onbnav{display:flex;align-items:center;gap:10px;margin-top:22px}.onbnav .sp{flex:1}
.onbnav .back{background:none;border:0;color:var(--faint);font:500 13.5px var(--sans);cursor:pointer;padding:6px 2px}
.onbnote .back{background:none;border:0;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:2px;cursor:pointer}.onb .act:disabled{opacity:.45;cursor:not-allowed}
.onbrepos{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}.onbrepos span{padding:5px 10px;border-radius:999px;font-size:12.5px;background:rgba(255,255,255,.06);color:var(--text)}
.onbspin{display:inline-block;width:12px;height:12px;margin-right:8px;border-radius:50%;border:2px solid rgba(242,165,65,.3);border-top-color:var(--amber);animation:onbspin 1s linear infinite;vertical-align:-1px}
@keyframes onbspin{to{transform:rotate(360deg)}}
.onbgrp{margin:16px 0 6px;font:600 11px var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.onbapp{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.03);margin-bottom:6px}
.onbapp .nm{flex:1;font-size:14px;color:var(--bone)}.onbapp .st{font-size:12.5px;color:var(--faint)}.onbapp .st.ok{color:#4FBE8C}.onbapp .st.wait{color:var(--amber)}
.onbapp button{padding:5px 12px;font-size:12.5px}
.onborb{display:block;width:72px;height:72px;margin:0 0 14px;border-radius:18px}
.onbfoot{position:sticky;bottom:-26px;margin:12px -32px -26px;padding:12px 32px 22px;background:#15171B;border-top:1px solid rgba(255,255,255,.06)}.onbfoot .onbnav{margin-top:6px}.onbfoot .onbnote{margin:0}
body.lq-light .onbfoot{background:#FFFFFF;border-top-color:rgba(21,26,33,.07)}
.onbtour{margin:6px 0 0;padding:0 0 0 18px;font-size:14px;line-height:1.7;color:var(--text)}
body.lq-light .onb{background:rgba(236,239,244,.7)}
body.lq-light .onbin{background:rgba(255,255,255,.92);border-color:rgba(21,26,33,.08);box-shadow:0 30px 80px -30px rgba(40,52,74,.45)}
body.lq-light .onbcard,body.lq-light .onbbox,body.lq-light .onbapp{background:rgba(21,26,33,.035);border-color:rgba(21,26,33,.07)}
body.lq-light .onbdots i{background:rgba(21,26,33,.1)}body.lq-light .onbdots i.on{background:var(--amber)}body.lq-light .onbdots i.past{background:rgba(242,165,65,.5)}body.lq-light .onbrepos span{background:rgba(21,26,33,.06)}body.lq-light .onbbox code{background:rgba(21,26,33,.07)}
@media(max-width:640px){.onbcards{grid-template-columns:1fr}.onbin{padding:22px 18px}}

/* Talking to Symbiot: the mic on the talk bar, amber while it listens */
#lqmic{flex:none;width:40px;height:40px;padding:0;display:grid;place-items:center;border-radius:50%;border:0;background:transparent;color:inherit;cursor:pointer;opacity:.72;transition:opacity .15s,background .15s}
#lqmic:hover,#lqmic:focus-visible{opacity:1;background:rgba(255,255,255,.07)}
body.lq-light #lqmic:hover,body.lq-light #lqmic:focus-visible{background:rgba(21,26,33,.06)}
#lqmic.on{opacity:1;background:#F2A541;color:#0A0B0D;animation:lqmicpulse 1.4s ease-in-out infinite}
#lqmic.conv{opacity:1;box-shadow:0 0 0 2px rgba(242,165,65,.55)}
@keyframes lqmicpulse{0%,100%{box-shadow:0 0 0 4px rgba(242,165,65,.28)}50%{box-shadow:0 0 0 11px rgba(242,165,65,.05)}}
@media (prefers-reduced-motion: reduce){#lqmic.on{animation:none;box-shadow:0 0 0 4px rgba(242,165,65,.28)}}
#lqmic.hidden{display:none}
/* the Dashboard as a stream: time runs left to right, a current per feed, now on the right */
.bstream{position:relative;margin-top:10px;border-radius:18px;overflow:hidden;isolation:isolate;background:#08090B;box-shadow:0 0 0 1px rgba(255,255,255,.08)}
body.lq-light .bstream{background:#EBEEF0;box-shadow:0 0 0 1px rgba(21,26,33,.08)}
body.lq-look-pearl .bstream{background:#EDECE9}
.bstream.none{display:none}
#bsc{position:absolute;inset:0;width:100%;height:100%;display:block}
#bsov{position:absolute;inset:0}
body.lq-liquid .bcard.blane{position:absolute;left:16px;width:186px;padding:0;border:0;background:transparent;box-shadow:none;transform:translateY(-50%)}
.blane .bln{font:600 14px/1.2 var(--sans);color:var(--bone);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.blane .blc{font-size:12px;color:var(--faint);margin-top:1px}
.blane .blc b{color:var(--amber);font-weight:600}
.blane .bla{display:flex;flex-wrap:wrap;gap:0 2px;margin:3px 0 0 -6px}
.blane .bla button,.btip .bta button.quiet{border:0;background:transparent;color:var(--faint);font:500 12px var(--sans);padding:4px 6px;border-radius:8px;cursor:pointer}
.blane .bla button:hover{color:var(--bone)}
.blane .ble{font-size:11.5px;color:#E5484D;margin-top:2px}
.blb{position:absolute;right:16px;width:230px;text-align:right;font-size:12.5px;line-height:1.4;color:var(--faint);transform:translateY(-50%);pointer-events:none}
.blines{position:absolute;left:0;top:0;pointer-events:none;color:#FFFFFF;overflow:visible}
body.lq-light .blines{color:#151A21}
.btick{position:absolute;bottom:12px;font-size:11px;color:var(--faint);transform:translateX(-50%);pointer-events:none}
.bnow{position:absolute;top:18px;bottom:30px;width:1px;background:linear-gradient(180deg,transparent,rgba(255,255,255,.25),transparent);pointer-events:none}
body.lq-light .bnow{background:linear-gradient(180deg,transparent,rgba(21,26,33,.25),transparent)}
.bbead{position:absolute;left:0;top:0;border:0;padding:0;border-radius:50%;background:transparent;cursor:pointer;will-change:transform}
.bbead:focus-visible{outline:2px solid var(--bone);outline-offset:2px}
.btip{position:absolute;left:0;top:0;width:300px;max-width:calc(100% - 24px);z-index:4;opacity:0;pointer-events:none;transition:opacity .18s ease}
.btip.on{opacity:1;pointer-events:auto}
body.lq-liquid .btip .bcard{padding:12px 14px;border-radius:16px;background:rgba(16,18,21,.95);border:1px solid rgba(255,255,255,.1);box-shadow:0 24px 50px -20px rgba(0,0,0,.8)}
body.lq-liquid.lq-light .btip .bcard{background:rgba(255,255,255,.96);border-color:rgba(21,26,33,.1);box-shadow:0 24px 50px -24px rgba(30,45,60,.45)}
.btip .bi{display:block !important;border:0 !important;padding:0 !important}
.btip .btf{font:600 13px var(--sans);color:var(--bone)}
.btip .btf span{font-weight:400;color:var(--faint)}
.btip .btx{margin:3px 0 10px;font-size:14px;color:var(--text);overflow-wrap:anywhere}
.btip .bta{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.btip .bta button:not(.quiet){border:0;border-radius:999px;padding:7px 13px;font:600 12.5px var(--sans);background:#F3F0EA;color:#0A0B0D;cursor:pointer}
body.lq-light .btip .bta button:not(.quiet){background:#151A21;color:#FFFFFF}
.blist{margin-top:12px}
.blist summary{cursor:pointer;color:var(--faint);font-size:13px;list-style:none}
.blist summary::-webkit-details-marker{display:none}
.blist summary::before{content:'';display:inline-block;width:5px;height:5px;margin-right:8px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);vertical-align:2px;transition:transform .2s ease}
.blist[open] summary::before{transform:rotate(45deg)}
#boardtalk .bcard{margin-top:12px}
@media (max-width:720px){.blb{display:none}body.lq-liquid .bcard.blane{width:96px}.blane .bla{display:none}}
.bcard{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--ink2);min-width:0}
.bcard.has{border-color:#2a6b52}
.bcard .bh{display:flex;gap:8px;align-items:center}.bcard .bn{color:var(--bone);font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bcard .bc{font-size:26px;font-weight:700;color:var(--faint);margin-top:6px}.bcard.has .bc{color:var(--green)}
.bcard .bl{font-size:12px;color:var(--faint)}
.bcard .bi{display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--line);font-size:13px;color:var(--text)}
.bcard .bi{flex-wrap:wrap}.bcard .bi .t{flex:1 1 150px;min-width:0;overflow-wrap:anywhere}.bcard .bi button{padding:4px 9px;font-size:12px}
.bcard .tchat{border-top:1px solid var(--line);border-radius:9px;margin-top:8px}
.bcard .bbrief{white-space:pre-line;margin:8px 0;padding:8px 10px;border-left:3px solid var(--green);background:var(--ink3);border-radius:0 8px 8px 0;font-size:13px;color:var(--bone)}
@media(max-width:760px){.maprow{flex-direction:column}.detail{width:auto;max-height:none}}
@media(max-width:600px){#screenname,#pagesite{flex:1 1 100%!important}.tab{flex:none;padding:9px 11px}header{padding:12px 14px 8px}main{padding:12px}}
`;
