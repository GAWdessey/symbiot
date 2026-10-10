// symbiot — the `symbiot app` page, served at / by index.mjs (cmdApp).
//
// Self-contained HTML served at / — no backticks or ${} inside (it lives in a
// template literal). Talks to the local API with the per-launch token.
// Kept apart from the CLI/server so UI edits can't break the backend (and vice
// versa); test/smoke.mjs boots the real page and exercises every handler.
export const EMBEDDED_UI = `<!doctype html><html><head><meta charset="utf8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" id="themecolor" content="#08090B">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><meta name="color-scheme" content="dark light"><title>Symbiot</title>
<style>
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
body.lq-liquid header .status,body.lq-liquid header .ver,body.lq-liquid #lqlook{pointer-events:auto}
#lqlook{display:none}
body.lq-liquid #lqlook{display:inline-flex;gap:2px;margin-left:10px;padding:3px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)}
#lqlook button{min-height:28px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:#8A919B;font:500 12.5px var(--sans);cursor:pointer}
#lqlook button[aria-checked='true']{background:#F3F0EA;color:#0A0B0D}
#lqlook button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
body.lq-light #lqlook{background:rgba(21,26,33,.05);border-color:rgba(21,26,33,.1)}
body.lq-light #lqlook button{color:#5A6470}
body.lq-light #lqlook button[aria-checked='true']{background:#151A21;color:#FFFFFF}
body.lq-touch #lqlook button{min-height:40px}
body.lq-liquid header .brand{letter-spacing:.38em;font-weight:500;text-transform:uppercase}
body.lq-liquid .tabs{display:none}
body.lq-liquid main{display:none}
body.lq-liquid.lq-pooled main{display:block;position:fixed;top:64px;left:max(12px,4vw);right:max(12px,4vw);bottom:88px;z-index:5;border-radius:24px;background:var(--ink);border:1px solid rgba(220,228,240,.25);box-shadow:0 30px 80px -30px rgba(0,0,0,.8)}
#lqsinkrow{display:none}
#lqwhy{display:none}
body.lq-liquid.lq-pooled #lqwhy.on{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px;color:#8A919B;font-size:13px;line-height:1.5}
#lqwhy .lqmb{min-height:34px;padding:5px 13px;font-size:13px}
body.lq-light #lqwhy{color:#5A6470}
body.lq-liquid.lq-pooled #lqsinkrow{display:flex;justify-content:space-between;align-items:center;gap:12px;position:sticky;top:0;z-index:2;margin:-8px -6px 10px;padding:6px 6px 10px;border-bottom:1px solid rgba(220,228,240,.12);background:rgba(6,8,11,.9);backdrop-filter:blur(14px)}
body.lq-liquid.lq-light.lq-pooled #lqsinkrow{background:rgba(246,248,251,.94);border-bottom-color:rgba(20,30,45,.1)}
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
.lqblob .bq{font-size:12.5px;line-height:1.35;color:#C9CDD3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.lqblob .bo{display:flex;flex-direction:column;gap:5px}
.lqblob .nopt,.lqblob .bfree,.lqblob .bfx button{all:unset;box-sizing:border-box;cursor:pointer;font:500 12.5px/1.3 var(--sans)}
.lqblob .nopt{display:block;width:100%;min-height:34px;padding:7px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#ECE9E4}
.lqblob .nopt span.bt{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
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
.lqblob .bfor{font-size:11.5px;line-height:1.3;color:#8A919B;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.lqblob .nopt:focus-visible,.lqblob .bfree:focus-visible,.lqblob .bfx button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.lqblob.gone{opacity:0!important;filter:blur(8px);transition:opacity .6s ease,filter .6s ease;pointer-events:none!important}
body.lq-light .lqd.lqblob{background:rgba(255,255,255,.94);border-color:rgba(154,82,0,.32);box-shadow:0 18px 40px -26px rgba(30,45,60,.5)}
body.lq-light .lqblob .bq{color:#2B3644}
body.lq-light .lqblob .nopt{background:#FFFFFF;border-color:rgba(20,30,45,.16);color:#151A21}
body.lq-light .lqblob .nopt.rec{background:#151A21;color:#FFFFFF;border-color:#151A21}
body.lq-light .lqblob .bfx input{background:#FFFFFF;border-color:rgba(20,30,45,.18)}
body.lq-light .lqblob .bfx button{background:#151A21;color:#FFFFFF}
body.lq-light .lqblob .bfree,body.lq-light .lqd.lqblob .lt i,body.lq-light .lqblob .bmore,body.lq-light .lqblob .bfor{color:#5A6470}
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
.orb.run{animation:lqpulse 1.6s ease-in-out infinite}.orb.fail{background:radial-gradient(circle at 35% 30%,#FFE1DA 0%,#FF8A75 45%,#7A2A1C 100%)}
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
.tabs{display:flex;gap:6px;padding:0 14px;border-bottom:1px solid var(--line)}
.tab{padding:9px 14px;border:0;background:none;color:var(--faint);font:inherit;font-weight:600;cursor:pointer;border-bottom:2px solid transparent}
.tab.active{color:var(--bone);border-bottom-color:var(--green)}
main{flex:1;overflow:auto;padding:16px 18px}
.row{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
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
#graph{flex:1;width:100%;height:62vh;min-height:340px;background:var(--ink2);border:1px solid var(--line);border-radius:12px;touch-action:none;cursor:grab}
#graph:active{cursor:grabbing}
#graph text{font-family:var(--sans);fill:var(--text);font-size:11px;pointer-events:none}
#graph .lbl-me{fill:var(--bone);font-weight:700;font-size:13px}
.detail{width:290px;flex:none;background:var(--ink2);border:1px solid var(--line);border-radius:12px;padding:14px;overflow:auto;max-height:62vh}
.detail h3{margin:0 0 4px;color:var(--bone);font-size:15px}
.detail .k{font-size:12px;color:var(--faint);margin-top:8px}
.detail ul{margin:6px 0 0;padding-left:18px}.detail li{margin:2px 0}
.detail .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.tag{display:inline-flex;font-size:11px;padding:4px 9px;border-radius:999px;background:var(--green-dim);border:1px solid #2a6b52;color:var(--green)}
.mapbar{margin-top:8px;font-size:12.5px;color:var(--text);background:var(--ink3);border:1px solid var(--line);border-radius:9px;padding:9px 12px;min-height:18px;font-family:ui-monospace,Menlo,Consolas,monospace}
.mapbar b{color:var(--bone)}
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
.task{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--line);border-radius:9px;margin-top:8px;background:var(--ink2)}
.task input[type=checkbox]{width:16px;height:16px;flex:none;cursor:pointer}
.task .t{flex:1;min-width:0;overflow-wrap:anywhere}.task.done .t{color:var(--faint);text-decoration:line-through}
.task:has(.tfull[open]){align-items:flex-start}.tfull summary{cursor:pointer;font-size:12px;color:var(--faint);margin-top:4px}.tfull div{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:6px;font-size:13px;line-height:1.5}.tfull div+.tres{border-top:1px solid var(--line);padding-top:6px}
.task .rp{font-size:11px;color:var(--faint);background:var(--ink3);border:1px solid var(--line);border-radius:999px;padding:2px 8px}
.task .rm{background:none;border:0;color:var(--faint);cursor:pointer;font-size:18px;line-height:1}
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
.mkst{font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);color:var(--faint)}.mkst.approved{color:var(--green);border-color:var(--green)}.mkst.posted{color:var(--green);border-color:var(--green);background:var(--green-dim)}.mkst.superseded{text-decoration:line-through}
/* the pick tray: a card a capture, its blur boxes on it (solid: blurred; dashed: shown), each a click to switch; Use puts it on a post */
.mktray{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,380px),1fr));gap:14px;align-items:start}
.mkcap{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--ink2)}
body.lq-liquid .mkcap{border-radius:18px;border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.035)}body.lq-liquid.lq-light .mkcap{border-color:rgba(21,26,33,.08);background:rgba(255,255,255,.75)}
.mkcap.busy .mkshot{opacity:.6}.mkshot{position:relative;line-height:0;border-radius:8px;overflow:hidden;background:var(--ink3)}.mkshot img,.mkshot video{display:block;width:100%;height:auto}
.mkbox{all:unset;box-sizing:border-box;position:absolute;border:1.5px dashed var(--amber);border-radius:3px;cursor:pointer;background:rgba(242,165,65,.08)}.mkbox.on{border:1.5px solid var(--green);background:rgba(10,12,14,.28)}
.mkbox:hover{box-shadow:0 0 0 2px rgba(255,255,255,.55)}.mkbox:focus-visible{outline:2px solid var(--bone);outline-offset:1px}
.mkcapt{font-size:13px;line-height:1.45;color:var(--text);overflow-wrap:anywhere}.mkcapm{font-size:11.5px;color:var(--faint)}
.mkuse{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.mkuse button{padding:4px 10px;font-size:12px}#mktray .mkuse select{width:auto;max-width:100%;min-height:0;padding:4px 30px 4px 10px;border-radius:999px;font-size:12px;background-position:right 11px center}
.mkchips{display:flex;flex-wrap:wrap;gap:5px}.mkchip{all:unset;box-sizing:border-box;cursor:pointer;padding:2px 9px;border-radius:999px;border:1px dashed var(--amber);color:var(--text);font:500 11.5px/1.5 var(--sans)}.mkchip.on{border:1px solid var(--green);color:var(--green)}.mkchip:hover,.mkchip:focus-visible{outline:2px solid var(--bone);outline-offset:1px}.mkshot .mkbox.hl{box-shadow:0 0 0 2px var(--bone)}
.mkpv{margin:6px 0 14px}.mkpv .mkpvact{margin-top:8px}.mkpv .pchars{font-size:11px;color:var(--faint)}
.lipost{max-width:552px;background:#fff;color:#191919;border:1px solid #e0dfdc;border-radius:10px;padding:12px 16px 4px;font:14px/1.43 -apple-system,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.liauth{display:flex;gap:8px;align-items:flex-start;margin-bottom:10px}
.liav{flex:0 0 48px;width:48px;height:48px;border-radius:50%;object-fit:cover;background:#0a66c2;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:17px}
.liwho{display:flex;flex-direction:column;min-width:0}.liwho b{font-weight:600;font-size:14px}.liwho small{font-size:12px;color:rgba(0,0,0,.6);line-height:1.33}
.litext{white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:8px}
.lihash{color:#0a66c2;font-weight:600}
.limore{background:none;border:0;padding:0 0 0 2px;min-height:0;color:rgba(0,0,0,.6);font:inherit;cursor:pointer}.limore:hover{color:#0a66c2;text-decoration:underline}
.limedia{display:block;width:calc(100% + 32px);margin:0 -16px 4px;max-height:560px;object-fit:contain;background:#f3f2ef}
.libar{display:flex;justify-content:space-around;border-top:1px solid #e0dfdc;padding:6px 0;color:rgba(0,0,0,.6);font-weight:600;font-size:13px}
.linotes{margin-top:8px;font-size:12.5px;color:var(--text)}.linotes summary{cursor:pointer;color:var(--faint)}.linotest{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0;color:var(--text)}
.mkneeds{margin-bottom:14px;padding:4px 0 4px 12px;border-left:2px solid var(--amber)}
.mkneeds.lit{border-radius:0 16px 16px 0}
#panel-marketing .pcard.lit{border-radius:11px}
.mkadd{flex-wrap:wrap;margin:8px 0 6px}.mkadd .mkl{font-size:12px;color:var(--faint)}.mkadd .mkprod{flex:0 0 160px;width:160px}.mkadd .mktext{flex:1;min-width:220px}
@media (max-width:600px){.mkadd .mkprod{flex:1 1 100%;width:auto}}
.rrow{cursor:pointer}.rrow:hover,.rrow:focus-visible{border-color:var(--green)}.rrow.rnew{border-left:3px solid var(--amber)}
.repacts{margin-top:10px}.repidea{cursor:pointer;align-items:flex-start;gap:8px}.repidea input{margin-top:3px}
.out.rdoc{white-space:normal;line-height:1.55;font-size:14px;padding:18px 22px;overflow-wrap:anywhere}
.rdoc h2{font-size:21px;margin:4px 0 10px;color:var(--bone)}.rdoc h3{font-size:16px;margin:22px 0 8px;color:var(--bone)}.rdoc h4,.rdoc h5,.rdoc h6{font-size:14px;margin:16px 0 6px;color:var(--bone)}
.rdoc p{margin:8px 0}.rdoc ul,.rdoc ol{margin:6px 0;padding-left:22px}.rdoc li{margin:3px 0}.rdoc hr{border:0;border-top:1px solid var(--line);margin:16px 0}
.rdoc code{font-size:12.5px;background:var(--ink3);border:1px solid var(--line);border-radius:5px;padding:0 4px}.rdoc pre{background:var(--ink3);border:1px solid var(--line);border-radius:9px;padding:10px 12px;overflow:auto}.rdoc pre code{background:none;border:0;padding:0}
.rdoc pre.prose{font-family:inherit;white-space:pre-wrap;overflow-wrap:anywhere;overflow:visible}.rdoc pre.prose code{font-family:inherit;font-size:14px;line-height:1.5}
.rdoc img.rimg{display:block;max-width:min(100%,560px);height:auto;margin:10px 0;border:1px solid var(--line);border-radius:9px;cursor:zoom-in}.rdoc .rimgmiss{display:inline-block;margin:6px 0;padding:6px 10px;border:1px dashed var(--amber);border-radius:8px;color:var(--faint);font-size:13px}
.rzoom{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:24px}.rzoom img{max-width:100%;max-height:100%;border-radius:8px}
.rdoc blockquote{margin:8px 0;padding:2px 12px;border-left:3px solid var(--line);color:var(--faint)}.rdoc a{color:var(--green)}
.rdoc .rtable{overflow-x:auto;margin:10px 0}.rdoc table{border-collapse:collapse;font-size:13px;min-width:100%}.rdoc th,.rdoc td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}.rdoc th{background:var(--ink3);color:var(--bone);font-weight:600}
.rdiff{max-height:360px;overflow:auto;font-size:11px;line-height:1.45;background:var(--ink2);border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:8px;white-space:pre}
.drift{border:1px solid var(--line);border-radius:10px;margin-top:10px;padding:12px 14px;background:var(--ink2)}
.drift .dh,.agent .dh{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.drift .dn,.agent .dn{color:var(--bone);font-weight:600}
.drift .dd,.agent .dd{color:var(--faint);font-size:12px}
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
.aq label.opt{display:flex;gap:8px;align-items:flex-start;margin:6px 0 0;font-size:13px;color:var(--text);cursor:pointer}
.aq .opt input{width:auto;margin-top:3px;flex:none}
.who{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:0 7px;margin-right:2px;white-space:nowrap}
.who.you{color:var(--amber);border:1px solid var(--amber)}.who.agent{color:var(--green);border:1px solid var(--green)}
.aq .qrel{font-size:12px;margin-top:4px;color:var(--green)}.aq .qrel.wait{color:var(--amber)}
.aq label.opt.off{color:var(--faint);cursor:default}.aq .opt.off i{font-size:12px}
.aq .qother{margin-top:7px;padding:7px 10px;font-size:13px}
.aq .row{margin:10px 0 2px}
label.check{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--text);margin:6px 0}
label.check input{width:auto}
.alogout{white-space:pre-wrap;background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;color:var(--text);max-height:260px;overflow:auto}
.bar{height:3px;background:var(--green-dim);border-radius:2px;overflow:hidden;margin-top:8px}
.bar > i{display:block;height:100%;width:35%;background:var(--green);border-radius:2px;animation:slide 1.3s ease-in-out infinite}
@keyframes slide{0%{margin-left:-35%}100%{margin-left:100%}}
.out2{white-space:pre-wrap;background:var(--ink);border:1px solid var(--line);border-radius:9px;padding:10px;margin-top:10px;font-size:13px;line-height:1.55;color:var(--bone)}
.legend{display:flex;gap:14px;align-items:center;margin-top:10px;font-size:12px;color:var(--faint);flex-wrap:wrap}
.lg{display:inline-flex;gap:6px;align-items:center}
.lg i{width:10px;height:10px;border-radius:50%;display:inline-block}
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
/* the card list, quiet */
body.lq-liquid .board .bcard{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);border-radius:16px;box-shadow:none}
body.lq-liquid.lq-light .board .bcard{background:rgba(255,255,255,.6);border-color:rgba(21,26,33,.08)}
body.lq-liquid .board .bcard.has{border-color:rgba(242,165,65,.35)}
body.lq-liquid .bcard .bc{font:300 30px/1.1 var(--sans);letter-spacing:-.02em;color:var(--faint)}
body.lq-liquid .bcard.has .bc{color:var(--amber)}
body.lq-liquid .bcard .bbrief{border-left:2px solid var(--line);background:transparent;padding:2px 0 2px 12px;color:var(--text)}


/* the Map, in the liquid */
#lmap,#lmtools{display:none}
body.lq-liquid #graph,body.lq-liquid #mapbar,body.lq-liquid .legend .lg,body.lq-liquid .legend > .muted{display:none}
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
body.lq-liquid .aq .q{border-bottom-color:var(--line)}
body.lq-liquid .aq label.opt{gap:10px;padding:4px 0}
body.lq-liquid .aq .opt input{margin-top:1px}
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
#i18nnote{position:fixed;left:16px;bottom:16px;z-index:60;max-width:calc(100vw - 32px);padding:8px 14px;border-radius:999px;font-size:13px;background:rgba(10,11,14,.88);color:#ECE9E4;border:1px solid rgba(220,228,240,.18);opacity:0;transition:opacity .4s;pointer-events:none}#i18nnote.on{opacity:1}body.lq-light #i18nnote{background:rgba(255,255,255,.94);color:#151A21;border-color:rgba(20,30,45,.15)}
.licproj{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.licproj .chip{display:inline-flex;align-items:center;gap:8px;padding:4px 6px 4px 12px;border:1px solid var(--line);border-radius:999px;font-size:13px}.licproj .chip button{padding:2px 8px;font-size:12px}
.ssh{margin:0 0 10px;font:600 16px var(--sans);letter-spacing:-.01em;color:var(--bone);display:flex;align-items:baseline;gap:8px}
.ssh .muted{font-weight:400;font-size:12.5px}
body.lq-liquid .sset > label:not(.check):not(.swl){display:block;font:500 12.5px var(--sans);color:var(--faint);margin:12px 0 6px}
body.lq-liquid .sset label.check{display:flex;align-items:center;gap:10px;margin:8px 0;color:var(--text);font-size:13.5px}
body.lq-liquid .sset .note{font-size:12.5px;max-width:70ch}
body.lq-liquid .sset .cxh{margin-top:0}
/* the Close bar carries the panel's own ground, so what scrolls under it stays clean */
/* top: the panel's padding (main's 16px), so it sticks at the very top edge: scrolled content no longer shows in a strip above it */
body.lq-liquid.lq-pooled #lqsinkrow{top:-16px;margin:-14px -14px 10px;padding:10px 10px 8px;background:linear-gradient(180deg,rgba(6,8,11,.97) 70%,rgba(6,8,11,0));border-radius:22px 22px 0 0}
body.lq-liquid.lq-light.lq-pooled #lqsinkrow{background:linear-gradient(180deg,rgba(246,248,251,.98) 70%,rgba(246,248,251,0))}

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
.lqblob.rlask .bq{-webkit-line-clamp:4;font-size:13px}
body.lq-light .lqblob.rlask{background:rgba(154,82,0,.05);border-color:rgba(154,82,0,.2)}
.rly .rlok{align-self:flex-start}
.rlk{margin-top:2px;font:500 11px var(--sans);letter-spacing:.1em;text-transform:uppercase;color:#8A919B}
.rli{display:flex;align-items:flex-start;gap:10px;padding:6px 0;border-top:1px solid rgba(255,255,255,.06);font-size:13px;line-height:1.4;color:#C9CDD3;transition:opacity .3s ease}
.rli > span:first-child{flex:1;min-width:0}
.rli.gone{opacity:0}
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
.pshead small{font-size:12.5px;color:var(--faint)}
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
.pcq .qq{font-size:13.5px;line-height:1.5;color:var(--text);margin:4px 0 8px;overflow-wrap:anywhere}
.pcq .opts{display:flex;flex-direction:column;gap:6px;align-items:stretch}
.pcq .opts button{text-align:left;white-space:normal;line-height:1.4;height:auto;padding:8px 12px}
.pcq form{display:flex;gap:8px;margin-top:8px}.pcq form input{flex:1;min-width:0}
.pcq ul{margin:6px 0 8px;padding-left:18px;font-size:13px;line-height:1.5;color:var(--text)}
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
@media(max-width:600px){#screenname,#pagesite{flex:1 1 100%!important}.tabs{overflow-x:auto;scrollbar-width:none;padding:0 8px;gap:0}.tabs::-webkit-scrollbar{display:none}.tab{flex:none;padding:9px 11px}header{padding:12px 14px 8px}main{padding:12px}}
</style></head><body>
<div id="onb" class="onb hidden" role="dialog" aria-modal="true" aria-labelledby="onbt"><div class="onbin"><div class="onbdots" id="onbdots"></div><div id="onbbody"></div></div></div>
<div id="liquid" aria-label="Symbiot">
<canvas id="lq" aria-hidden="true"></canvas>
<div id="lqorbits"></div>
<div id="lqline" aria-live="polite"></div>
<div id="lqrelay" aria-label="Your projects: what their agents did, ask and suggest"></div>
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
<header><span class="dot" role="img" aria-label="Symbiot"></span><span class="brand">Symbiot</span><span class="ver" id="ver"></span><span id="lqlook" role="radiogroup" aria-label="Look"><button type="button" role="radio" data-look="glass" aria-checked="false">Glass</button><button type="button" role="radio" data-look="ferro" aria-checked="true">Ferrofluid</button><button type="button" role="radio" data-look="pearl" aria-checked="false">Pearl</button></span><span class="status" id="status">...</span></header>
<div class="tabs">
<button class="tab active" data-tab="map">Map</button>
<button class="tab" data-tab="board" id="boardtab">Dashboard</button>
<button class="tab" data-tab="drift">Drift</button>
<button class="tab" data-tab="week">Week</button>
<button class="tab" data-tab="standup">Standup</button>
<button class="tab" data-tab="todo">Todo</button>
<button class="tab" data-tab="tasks">Workdesk</button>
<button class="tab" data-tab="reports">Reports</button><button class="tab" data-tab="marketing">Marketing</button>
<button class="tab" data-tab="settings">Settings</button>
</div>
<main>
<div id="lqsinkrow"><div class="lqwhere"><span id="lqcrumb" class="lqcrumb">Home</span><h2 id="lqtitle" aria-live="polite"></h2><button type="button" class="ghost hidden" id="lqpark"></button></div><div class="lqacts"><span id="lqtools"><button class="ghost hidden" type="button" id="pushtasks" title="Write .symbiot/TASKS.md into each repo for your coding agent">Send to repos</button></span><button class="iconbtn wide" type="button" id="lqsink" title="close it: it sinks back into the liquid (Esc, or right-click)"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Close</button></div></div><div id="lqwhy" aria-live="polite"></div>
<section id="panel-map">
<div class="profile muted" id="profile">Mapping your work&hellip;</div>
<div class="maprow">
<div id="lmap" class="lmap"><canvas id="lmc" aria-hidden="true"></canvas><svg id="lmlines" aria-hidden="true"></svg><div id="lmov"></div><div id="lmtip" class="lmtip" role="status" aria-live="polite"></div><div class="lmzoom"><button type="button" class="iconbtn" id="lmin" aria-label="Zoom in">+</button><button type="button" class="iconbtn" id="lmout" aria-label="Zoom out">&minus;</button><button type="button" class="iconbtn" id="lmfit" aria-label="Fit the map" title="Fit the map"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 5V1h4M13 5V1H9M1 9v4h4M13 9v4H9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div></div>
<svg id="graph" viewBox="0 0 960 620" preserveAspectRatio="xMidYMid meet"></svg>
<aside id="detail" class="detail hidden"></aside>
</div>
<div id="lmtools" class="lmtools"></div>
<div id="mapbar" class="mapbar">Hover a node for a summary &middot; click for details &middot; drag to move</div>
<div class="legend">
<span class="lg"><i style="background:var(--green)"></i>you</span>
<span class="lg"><i style="background:var(--bone)"></i>repos</span>
<span class="lg"><i style="background:var(--amber)"></i>languages</span>
<span class="lg"><i style="background:#6bb3ff"></i>tools</span>
<span class="lg"><i style="background:#c58af9"></i>agents</span>
<span class="lg"><i style="background:#5fe3b0"></i>AI</span>
<span class="lg"><i style="background:#b7a98c"></i>folders (no git)</span>
<span class="muted" style="margin-left:8px">scroll to zoom &middot; drag to pan &middot; click a node</span>
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
<section id="panel-marketing" class="hidden">
<div class="row"><span class="muted" style="flex:1">Marketing for every product you make, in a lane of its own: its agent drafts posts, demo videos, launches and campaigns, each tagged with the product it&#39;s for. You approve each post&#39;s preview; then its agent posts it, through Symbiot&#39;s signed-in browser, with exactly that text.</span></div>
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
<label class="muted swl"><input type="checkbox" class="sw" id="driftci"> Check CI <small>(needs gh, experimental)</small></label>
<button class="ghost" id="driftrun">Rescan</button></div>
<div id="driftout"></div>
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
<div class="note muted" id="agentsandbox" style="margin-top:6px"></div>
<div id="agentpresets" style="margin-top:8px"></div>
<div class="note muted" id="agentconnectors"></div>
<div id="grantbox" style="margin-top:10px">
<label style="font-size:12px;color:var(--faint)">When an agent asks to run something or read a folder, grant it here instead of editing the command:</label>
<div class="row" style="margin-top:6px"><input id="granttool" placeholder="allow a command, e.g. python3 or pytest" style="flex:1"><button class="ghost" id="granttoolbtn">Allow command</button></div>
<div class="row" style="margin-top:6px"><input id="grantdir" placeholder="allow a folder, e.g. /home/you/GoSolr" style="flex:1"><button class="ghost" id="grantdirbtn">Allow folder</button></div>
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
<h3 class="ssh">What Symbiot remembers</h3>
<div class="note muted" style="margin-top:2px">Every chat in the app is the same Symbiot. What's worth knowing on another page (who someone is, which account is what, what you decided) is kept here, on this computer only, and each chat gets just the parts its question touches.</div>
<div id="mindlist"></div>
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
<footer><button class="iconbtn" type="button" id="quit" style="margin-left:auto" title="Quit" aria-label="Quit"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button></footer>
<script>
var T=new URLSearchParams(window.location.search).get('t')||'';
function api(path,body){return fetch(path,{method:body?'POST':'GET',headers:{'x-symbiot-token':T,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json();});}
var KEYURL={claude:'https://claude.com/claude-code',anthropic:'https://console.anthropic.com/settings/keys',openai:'https://platform.openai.com/api-keys',gemini:'https://aistudio.google.com/apikey',ollama:'https://ollama.com'};
var DEFMODEL={claude:'your plan’s default',anthropic:'claude-opus-5-5',openai:'gpt-4o-mini',gemini:'gemini-1.5-flash',ollama:'llama3.1'};
function $(id){return document.getElementById(id);}
// Live updates never pull text out from under your selection. A refresh that would
// redraw what you're selecting in waits until you let it go (selWait), and a redraw
// with nothing new leaves the nodes as they are (sameHtml), so copying works while
// updates arrive.
function selIn(el){try{var s=window.getSelection&&window.getSelection();if(!el||!s||s.isCollapsed||!s.rangeCount)return false;return !!(el.contains&&(el.contains(s.anchorNode)||el.contains(s.focusNode)));}catch(e){return false;}}
var SELWAIT={};function selWait(key,f){SELWAIT[key]=f;}
if(document.addEventListener)document.addEventListener('selectionchange',function(){var ks=Object.keys(SELWAIT);if(!ks.length)return;var s=window.getSelection&&window.getSelection();if(s&&!s.isCollapsed)return;var w=SELWAIT;SELWAIT={};ks.forEach(function(k){try{w[k]();}catch(e){}});});
function whenFree(el,key,f){if(selIn(el)){selWait(key,f);return false;}f();return true;}
function sameHtml(el,h){if(el._h===h)return true;el.innerHTML=h;el._h=h;return false;}
// As sameHtml, but the card you're typing in (a child of el with data-key, holding
// the focus) stays the very same node: the rest is rebuilt around it, and it takes
// its new twin's place and data-i without leaving the page, so its text, focus and
// cursor survive. Home redrew every card on any change (a count, an agent's step)
// and wiped a half-typed answer (2026-10-09). With no twin (the card's gone) it's
// rebuilt as usual: its draft is kept anyway (bdSet). Its content may be a redraw
// behind, so the next call draws it afresh.
function keepTyping(el,h){if(el._h===h)return true;
var f=document.activeElement,k=f&&f!==document.body&&el.contains&&el.contains(f)&&f.closest?f.closest('[data-key]'):null;
if(!k||k.parentNode!==el){el.innerHTML=h;el._h=h;return false;}
var t=document.createElement('div');t.innerHTML=h;var key=k.getAttribute('data-key'),twin=null;
for(var c=t.firstChild;c;c=c.nextSibling)if(c.getAttribute&&c.getAttribute('data-key')===key){twin=c;break;}
if(!twin){el.innerHTML=h;el._h=h;return false;}
if(twin.getAttribute('data-i')!==null)k.setAttribute('data-i',twin.getAttribute('data-i'));
while(el.firstChild&&el.firstChild!==k)el.removeChild(el.firstChild);while(k.nextSibling)el.removeChild(k.nextSibling);
while(t.firstChild&&t.firstChild!==twin)el.insertBefore(t.firstChild,k);t.removeChild(twin);while(t.firstChild)el.appendChild(t.firstChild);
el._h='';return false;}
var current='map',WDJUMP=0;var mapLoaded=false;var driftLoaded=false;
var COLORS={person:'#3DDC97',repo:'#F4F1EA',lang:'#F2A541',tool:'#6bb3ff',agent:'#c58af9',ai:'#5fe3b0',folder:'#b7a98c'};
function tabs(){return document.querySelectorAll('.tab');}
// Opened as Agents (its agents, a run's question): the Workdesk, at its agents, once
// the tasks above them and the agents are drawn; not if you've moved, or something's lit.
function wdJump(){if(!WDJUMP||current!=='tasks')return;if(Date.now()-WDJUMP>5000){WDJUMP=0;return;}var wa=$('panel-agents');if(document.querySelector('main .lit'))return;if(wa&&wa.scrollIntoView)wa.scrollIntoView({block:'start'});}
(function(){var m=document.querySelector('main');if(m&&m.addEventListener)['wheel','pointerdown','keydown','touchstart'].forEach(function(e){m.addEventListener(e,function(){WDJUMP=0;},{passive:true});});})();
function setTab(tab){WDJUMP=0;if(tab==='agents'){tab='tasks';WDJUMP=Date.now();}current=tab;tabs().forEach(function(t){t.classList.toggle('active',t.dataset.tab===tab);});
var isMap=tab==='map',isSet=tab==='settings',isTasks=tab==='tasks',isDrift=tab==='drift',isBoard=tab==='board',isRun=(tab==='week'||tab==='standup'||tab==='todo');
$('panel-map').classList.toggle('hidden',!isMap);
$('panel-board').classList.toggle('hidden',!isBoard);if(isBoard){loadBoard();loadLinks();}
$('panel-run').classList.toggle('hidden',!isRun);
$('panel-settings').classList.toggle('hidden',!isSet);if(isSet){loadFirstSteps();licLoad();langLoad();}
$('panel-tasks').classList.toggle('hidden',!isTasks);
$('panel-drift').classList.toggle('hidden',!isDrift);
$('panel-reports').classList.toggle('hidden',tab!=='reports');if(tab==='reports')loadReports();
$('panel-marketing').classList.toggle('hidden',tab!=='marketing');if(tab==='marketing')loadMarketing();
$('panel-computer').classList.toggle('hidden',tab!=='computer');if(tab==='computer')loadComputer();
if(isRun){$('what').textContent=tab;wuHead();WUTEXT='';$('out').textContent=WUEMPTY;$('out').classList.add('muted');$('copy').classList.add('hidden');$('outfoot').style.display='none';if(tab==='week')showLatestWeek();}
if(isMap&&!mapLoaded)loadMap();
if(isTasks)loadTasks();
if(isDrift&&!driftLoaded)loadDrift();
if(isTasks)loadAgents(); else stopAgentsPoll();
lqTitle();if(isTasks&&TFILTER.repo)loadParked(lqTitle);}
// First steps, at the top of Settings, in order: connect an AI, where your work is,
// your agent, link one site (and whether agent runs can use it), a company folder
// (optional, or skipped). Each ticks itself as it's done anywhere in Settings; Go
// takes you to its part, lit up. The block goes once all are done.
var FSKIP='symbiot-skip-company';
function fsKey(id){return id==='company'?FSKIP:'symbiot-skip-'+id;}
function fsSkipped(id){try{return !!(window.localStorage&&window.localStorage.getItem(fsKey(id||'company')));}catch(e){return false;}}
// The app in your language (lang.mjs). Its own words on screen are swapped for their
// translation (your AI makes each once; they're kept, so it's instant after that).
// Numbers stay out of what's translated: "3 at work" is "{#} at work". Your content
// (tasks, chats, drafts, write-ups, names, code, anything typed) is never touched,
// and new things are translated as they appear.
var I18N={on:false,lang:'',map:{},want:{},tried:{},timer:0,busy:false,orig:new WeakMap(),attrs:new WeakMap(),dirty:[],raf:0,obs:null};
var I18N_SKIP="[data-nt],.t,.tfull,.lqmsg,.dmsg,.wkfinal,.wkraw,.rname,.btf,#lqtalk,code,pre,kbd,textarea,script,style,svg";
var I18N_W=String.fromCharCode(32,9,10,13,160);
var I18N_WS=new RegExp('['+I18N_W+']+','g'),I18N_EDGE=new RegExp('^(['+I18N_W+']*)([^]*?)(['+I18N_W+']*)$');
var I18N_NUM=/[0-9]+([.,][0-9]+)?/g;
function i18nKey(s){return String(s).replace(I18N_WS,' ').trim().replace(I18N_NUM,'{#}');}
function i18nOk(k){if(!k||k.length>400||!/[A-Za-z]/.test(k))return false;if(/@|:[/][/]|[/][A-Za-z0-9._-]+[/]/.test(k))return false;if(/^[a-z0-9._-]+$/.test(k)&&/[._0-9-]/.test(k))return false;return true;}
function i18nFill(src,tr){var nums=String(src).match(I18N_NUM)||[],i=0;return tr.replace(/[{]#[}]/g,function(){return nums[i++]||'';});}
function i18nOne(v){var m=String(v).match(I18N_EDGE),core=m?m[2]:String(v),k=i18nKey(core);if(!i18nOk(k))return null;var tr=I18N.map[k];
if(tr==null){if(!I18N.tried[k]){I18N.want[k]=1;i18nLater();}return null;}return (m?m[1]:'')+i18nFill(core,tr)+(m?m[3]:'');}
function i18nSkip(el){return !el||!!(el.closest&&el.closest(I18N_SKIP))||!!el.isContentEditable;}
function i18nText(n){var o=I18N.orig.get(n),v=n.nodeValue,src=o&&v===o.tr?o.src:v,out=i18nOne(src);if(out!=null&&out!==v){I18N.orig.set(n,{src:src,tr:out});n.nodeValue=out;}}
function i18nAttrs(el){if(/^(TEXTAREA|INPUT)$/.test(el.tagName||"")?i18nSkip(el.parentElement):i18nSkip(el))return;['placeholder','title','aria-label'].forEach(function(a){if(!el.hasAttribute||!el.hasAttribute(a))return;var rec=I18N.attrs.get(el)||{},cur=el.getAttribute(a),src=rec[a]&&cur===rec[a].tr?rec[a].src:cur,out=i18nOne(src);if(out!=null&&out!==cur){rec[a]={src:src,tr:out};I18N.attrs.set(el,rec);el.setAttribute(a,out);}});}
function i18nWalk(root){if(!I18N.on||!root)return;
if(root.nodeType===3){if(!i18nSkip(root.parentElement))i18nText(root);return;}
if(root.nodeType!==1||!root.isConnected)return;i18nAttrs(root);if(i18nSkip(root))return;root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(i18nAttrs);
var w=document.createTreeWalker(root,5,{acceptNode:function(n){if(n.nodeType===1)return (n.matches(I18N_SKIP)||n.isContentEditable)?2:3;return 1;}}),t;
while((t=w.nextNode()))i18nText(t);}
function i18nLater(){if(I18N.timer)return;I18N.timer=setTimeout(i18nFlush,350);}
function i18nFlush(){I18N.timer=0;if(I18N.busy){i18nLater();return;}var ks=Object.keys(I18N.want).slice(0,400);if(!ks.length)return;
ks.forEach(function(k){delete I18N.want[k];I18N.tried[k]=1;});I18N.busy=true;i18nNote(true);
api('/api/i18n',{lang:I18N.lang,strings:ks}).then(function(r){var m=(r&&r.map)||{};for(var k in m)I18N.map[k]=m[k];I18N.busy=false;i18nWalk(document.body);if(Object.keys(I18N.want).length)i18nLater();else i18nNote(false);}).catch(function(){I18N.busy=false;i18nNote(false);});}
// the first time in a language there's a lot to translate: say so, quietly, until it's done
function i18nNote(on){var el=$('i18nnote');if(on&&Object.keys(I18N.map).length<150){if(!el){el=document.createElement('div');el.id='i18nnote';el.setAttribute('data-nt','');el.setAttribute('role','status');document.body.appendChild(el);}el.textContent='Translating Symbiot into '+((LANG&&(LANG.own||LANG.name))||I18N.lang)+'… the first time takes a minute.';el.className='on';}else if(!on&&el){el.className='';}}
function i18nWatch(){if(I18N.obs||typeof MutationObserver!=='function')return;
I18N.obs=new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==='childList')m.addedNodes.forEach(function(n){I18N.dirty.push(n);});else I18N.dirty.push(m.target);});
if(!I18N.raf)I18N.raf=requestAnimationFrame(function(){I18N.raf=0;var d=I18N.dirty;I18N.dirty=[];d.forEach(function(n){i18nWalk(n);});});});
I18N.obs.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});}
function i18nStart(){api('/api/language/set',{auto:(navigator.languages&&navigator.languages[0])||navigator.language||''}).then(function(st){if(!st||!st.lang)return;I18N.lang=st.lang;LANG=st;
try{document.documentElement.lang=st.lang;}catch(e){}
if(st.english)return;I18N.on=true;
api('/api/i18n/all?lang='+encodeURIComponent(st.lang)).then(function(r){I18N.map=(r&&r.map)||{};i18nWalk(document.body);i18nWatch();}).catch(function(){i18nWatch();});}).catch(function(){});}
// Settings: the language, your computer's or any you name
var LANG=null;
function langLoad(){api('/api/language').then(langRender).catch(function(){});}
function langRender(st){var el=$('langbox');if(!el||!st)return;LANG=st;
el.innerHTML="<p>Symbiot is in <b data-nt>"+esc(st.own||st.name)+"</b>"+(st.chosen?'.':', the language your computer uses.')+"</p>"+
"<div class='row' style='margin-top:8px'><input id='langin' placeholder='Any language: Afrikaans, isiZulu, Português, 日本語…' style='flex:1'><button class='act' id='languse'>Use it</button>"+(st.chosen?"<button class='ghost' id='langauto'>Use my computer’s language</button>":"")+"</div>"+
"<p class='muted' style='margin-top:8px'>Symbiot writes to you in it, and its own words are translated by your AI the first time you see them, then kept.</p>";
var go=function(v){api('/api/language/set',{chosen:v}).then(function(){location.reload();}).catch(function(){});};
var u=$('languse');if(u)u.addEventListener('click',function(){var v=($('langin').value||'').trim();if(v)go(v);});
var a=$('langauto');if(a)a.addEventListener('click',function(){go('');});}
// Symbiot Free and Pro (licence.mjs): where you stand, a key in or out, Free's 3 projects.
function licDate(ms){try{return new Date(ms).toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'});}catch(e){return '';}}
function licLoad(){api('/api/licence').then(licRender).catch(function(){});}
function licRender(st,msg){var el=$('licbox');if(!el||!st)return;var h='';
if(st.plan==='owner')h+="<p>Owner key"+(st.email?' for '+esc(st.email):'')+": everything, including Symbiot working on its own code.</p>";
else if(st.plan==='pro'){h+="<p><b>Pro</b>"+(st.email?' for '+esc(st.email):'')+(st.expires?', until '+esc(licDate(st.expires)):'')+'.</p>';
if(st.grace)h+="<p class='onbnote'>Your key has ended. Pro carries on for "+st.grace+" more day"+(st.grace===1?'':'s')+": renew it to keep it.</p>";
else if(st.renewSoon)h+="<p class='muted'>It ends in "+st.renewSoon+" day"+(st.renewSoon===1?'':'s')+".</p>";}
else if(st.plan==='trial')h+="<p><b>Pro trial</b>: "+st.trialDaysLeft+" day"+(st.trialDaysLeft===1?'':'s')+" left. After that Symbiot carries on as Free, unless you add a Pro key.</p>";
else h+="<p><b>Free</b>: one agent at a time, up to "+st.free.projects+" projects and one inbox or chat."+(st.trialEnded?' Your Pro trial has ended.':'')+"</p>";
if(st.keyProblem)h+="<p class='onbnote'>"+esc(st.keyProblem)+"</p>";
if(st.plan==='free'||st.plan==='trial'){
if(st.projects&&st.projects.length)h+="<p class='muted' style='margin-top:10px'>Free’s "+st.free.projects+" projects: the first ones Symbiot worked in.</p><div class='licproj'>"+st.projects.map(function(p,i){return "<span class='chip'>"+esc(p.name)+" <button class='back' data-i='"+i+"' title='Free this slot for another project'>free up</button></span>";}).join(' ')+"</div>";
h+="<p style='margin-top:12px'>Pro: as many agents at once as you like, every project, every inbox and chat, the marketing lane and Approve-and-ship. "+esc(st.price)+". <a href='"+esc(st.upgrade)+"' target='_blank' rel='noopener'>Get Pro</a></p>";}
if(st.plan!=='owner'){h+="<div class='row' style='margin-top:10px'>"+(st.plan==='pro'?"<button class='ghost' id='licclear'>Remove this key</button>":"<textarea id='lickey' rows='2' placeholder='Paste your Pro key (it starts SYM1-)' style='flex:1'></textarea><button class='act' id='licsave'>Add key</button>")+"</div>";}
if(msg)h+="<p class='onbnote' style='margin-top:8px'>"+esc(msg)+"</p>";
el.innerHTML=h;
var sv=$('licsave');if(sv)sv.addEventListener('click',function(){var k=($('lickey').value||'').trim();if(!k)return;api('/api/licence/key',{key:k}).then(function(r){if(r&&r.error){licRender(st,r.error);return;}licRender(r,'Thanks: Symbiot Pro is on.');}).catch(function(){});});
var cl=$('licclear');if(cl)cl.addEventListener('click',function(){api('/api/licence/clear',{}).then(function(r){licRender(r);}).catch(function(){});});
el.querySelectorAll('.licproj button[data-i]').forEach(function(b){b.addEventListener('click',function(){var p=st.projects[+b.getAttribute('data-i')];if(!p)return;api('/api/licence/project/free',{path:p.path}).then(function(r){licRender(r);}).catch(function(){});});});}
function loadFirstSteps(){api('/api/firststeps').then(function(f){var el=$('firststeps');if(!el||!f||!f.steps)return;
var st=f.steps.map(function(s){return s.optional&&!s.done&&fsSkipped(s.id)?Object.assign({},s,{done:true,skipped:true}):s;}),next=st.filter(function(s){return !s.done;})[0];
if(!next){el.innerHTML='';el.classList.add('hidden');return;}el.classList.remove('hidden');
el.innerHTML="<h3 class='ssh'>First steps</h3><div class='note muted' style='margin-top:2px'>In this order: each one ticks itself once it&#39;s done.</div><ol>"+st.map(function(s,i){return "<li class='"+(s.done?'done':s===next?'next':'')+"'><span class='fsn' aria-hidden='true'>"+(s.done?'&#10003;':(i+1))+"</span><span class='fst'><b>"+esc(s.title)+(s.optional?" <span class='muted' style='font-weight:400'>(optional)</span>":"")+"</b><span>"+(s.skipped?'skipped':esc(s.sub))+"</span></span>"+(s.done?"<span class='sr' style='position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)'>done</span>":"<button type='button' class='"+(s===next?'act':'ghost')+" fsgo' data-id='"+s.id+"'>"+(s===next?'Do it now':'Go')+"</button>"+(s.optional?"<button type='button' class='ghost fsskip' data-id='"+s.id+"'>Skip</button>":""))+"</li>";}).join('')+"</ol>";
el.querySelectorAll('.fsgo').forEach(function(b){b.addEventListener('click',function(){var id=b.getAttribute('data-id'),a=$(SETFOCUS[id==='site'?'links':id]||''),s=a&&a.closest?a.closest('.sset'):null;if(!s)return;
document.querySelectorAll('#panel-settings .lit').forEach(function(x){x.classList.remove('lit');});s.classList.add('lit');if(s.scrollIntoView)s.scrollIntoView({block:'start',behavior:'smooth'});var c=s.querySelector('select,input,button');if(c&&c.focus){try{c.focus({preventScroll:true});}catch(e){c.focus();}}});});
el.querySelectorAll('.fsskip').forEach(function(sk){sk.addEventListener('click',function(){try{if(window.localStorage)window.localStorage.setItem(fsKey(sk.getAttribute('data-id')),'1');}catch(e){}loadFirstSteps();});});});}
var fsTimer=null;(function(){var ps=$('panel-settings');if(ps&&ps.addEventListener){var again=function(){if(fsTimer)clearTimeout(fsTimer);fsTimer=setTimeout(function(){if(current==='settings')whenFree($('firststeps'),'firststeps',loadFirstSteps);},1800);};ps.addEventListener('click',again);ps.addEventListener('change',again);}})();
var tabPicked=false;tabs().forEach(function(t){t.addEventListener('click',function(){tabPicked=true;setTab(t.dataset.tab);});});
// Watching a page (your inbox, GitHub)? The app opens on the Dashboard instead of
// the Map, unless you've picked a tab already. The Map still loads behind it.
// A link to a screen (#reports, #board…) opens on it: how symbiot post's picture of
// "the new Reports view" shows that view, not home.
function lqDeep(){var h=String(location.hash||'').slice(1);if(!h||!LQNAMES[h])return;setTimeout(function(){tabPicked=true;lqPool(h);},400);}
function firstTab(){api('/api/watch/board').then(function(b){if(b&&b.cards&&b.cards.length&&!tabPicked&&current==='map')setTab('board');}).catch(function(){});}
// The AI in use isn't shown while it works (it's noise); only when none is
// connected, as an urgent line that opens its part of Settings. Home has it out
// front too, with the agent and the connectors runs use (home.mjs).
var SUBLINE='';
function refresh(){api('/api/status').then(function(s){if(s&&s.connected&&s.provider){var pv=$('provider');if(pv&&!pv.getAttribute('data-touched')){pv.value=s.provider;SUBLINE=s.provider==='claude'?'Connected: '+s.line+'. No key needed.':'';syncP();}}var st=$('status');if(!st)return;st.classList.toggle('hidden',!!s.connected);st.classList.toggle('urgent',!s.connected);st.textContent=s.connected?'':"No AI connected: Symbiot can't work. Connect one \\u203a";});}
// the status opens Settings: on a phone its tab is scrolled out of sight
$('status').addEventListener('click',function(){var b=document.body;if(b&&b.classList&&b.classList.contains('lq-liquid')&&typeof lqFocus==='function'){lqFocus({kind:'setup',focus:'ai'});return;}setTab('settings');var t=document.querySelector('.tab[data-tab=settings]');if(t&&t.scrollIntoView)t.scrollIntoView({block:'nearest',inline:'nearest'});});
// Where you are: the section you opened, named at the top of its panel (and the
// tab lit, without the liquid); a project's own name when Tasks shows only its
// tasks, with Park (lqParkBtn). The work scene says which it is too.
var PARKED={repos:[],paths:[]};
function lqProjName(repo){var L=typeof LQ!=='undefined'?LQ:{},w=(L.workData&&L.workData.projects)||[],y=(L.home&&L.home.you)||[],p=w.filter(function(x){return x.repo===repo;})[0]||y.filter(function(x){return x.repo===repo&&x.name;})[0];return (p&&p.name)||repo;}
function lqTitle(){var t=$('lqtitle'),c=$('lqcrumb');tabs().forEach(function(x){x.setAttribute('aria-current',x.dataset.tab===current?'page':'false');});if(!t)return;
var tf=typeof TFILTER!=='undefined'&&TFILTER||{},arch=typeof TARCH!=='undefined'&&TARCH,proj=current==='tasks'&&!arch&&tf.repo?tf.repo:'',names=typeof LQNAMES!=='undefined'?LQNAMES:{},name=current==='tasks'&&arch?'Archive':(names[current]||current);
if(proj)name=lqProjName(proj);var parked=!!proj&&PARKED.repos.indexOf(proj)>=0;
if(c)c.textContent=proj?'Projects':'Home';t.innerHTML=esc(name)+(parked?"<span class='lqpk'>parked</span>":'');
var pk=$('lqpark');if(pk){pk.classList.toggle('hidden',!proj);pk.textContent=parked?'Unpark':'Park this project';pk.title=parked?'let its tasks start agent runs again':'stop its tasks starting agent runs, until you unpark it';pk.setAttribute('data-repo',proj);}
// the open panel's own Refresh sits beside Close, not under it on the panel's top line
var wa=$('panel-agents');if(wa&&wa.classList)wa.classList.toggle('hidden',!!arch); // the Archive is only what's done
var tl=$('lqtools');if(tl&&tl.appendChild)['agents','reports'].forEach(function(p){var b=$(p+'refresh'),row=$('panel-'+p);row=row&&row.querySelector('.row');if(!b)return;if(p===current||(p==='agents'&&current==='tasks'&&!arch)){if(b.parentNode!==tl)tl.appendChild(b);}else if(b.parentNode===tl&&row&&row.appendChild)row.appendChild(b);});
var pt=$('pushtasks');if(pt&&pt.classList)pt.classList.toggle('hidden',current!=='tasks'||!!arch);
try{document.title=name+' \\u00b7 Symbiot';}catch(e){}}
function lqPark(repo,on,then,path){api('/api/lanes/park',{repo:repo,path:path||'',on:on}).then(function(r){if(r&&r.error){if(then)then(r.error);return;}loadParked(function(){lqTitle();if(then)then('');if(LQ.scene==='work')lqLoadWork();});});}
function loadParked(then){api('/api/lanes/parked').then(function(p){PARKED={repos:(p&&p.repos)||[],paths:(p&&p.paths)||[]};if(then)then();}).catch(function(){if(then)then();});}
$('lqpark').addEventListener('click',function(){var b=$('lqpark'),repo=b.getAttribute('data-repo');if(!repo)return;b.disabled=true;lqPark(repo,PARKED.repos.indexOf(repo)<0,function(err){b.disabled=false;$('pushout').innerHTML=err?"<div class='note err'>"+esc(err)+"</div>":"<div class='note ok'>"+esc(PARKED.repos.indexOf(repo)>=0?lqProjName(repo)+" is parked: its tasks start no agent runs until you unpark it.":lqProjName(repo)+" is unparked: Go, or a send, starts its tasks again.")+"</div>";});});
var WUEMPTY='Nothing written yet. Symbiot reads your local git and writes it up for you.',WUTEXT='';
$('write').addEventListener('click',function(){$('out').textContent='Writing it up from your local git…';$('out').classList.add('muted');$('copy').classList.add('hidden');
api('/api/run',{cmd:current}).then(function(r){var f=$('outfoot');if(r.error==='not-connected'){$('out').textContent='Not connected yet - open Settings and pick an AI.';f.style.display='none';return;}
// a week is saved to weeks/ as well (r.file), like Settings' Write it now
var foot=[r.footer,r.file?'Saved to '+r.file:'',r.error&&r.text&&r.error!==r.text?r.error:''].filter(Boolean).join(' · ');
WUTEXT=r.text||'';$('out').innerHTML=r.text?mdLite(r.text):'(no output)';$('out').classList.remove('muted');$('copy').classList.remove('hidden');if(foot){f.textContent=foot;f.style.display='block';}else{f.style.display='none';}});});
$('copy').addEventListener('click',function(){var c=$('copy');try{navigator.clipboard.writeText(WUTEXT||$('out').textContent);}catch(e){}c.setAttribute('title','Copied');c.classList.add('done');setTimeout(function(){c.setAttribute('title','Copy');c.classList.remove('done');},1400);});
function syncP(){var p=$('provider').value;var local=p==='ollama',sub=p==='claude';$('keyWrap').classList.toggle('hidden',local||sub);$('baseWrap').classList.toggle('hidden',!local);var sw=$('subWrap');if(sw){sw.classList.toggle('hidden',!sub);sw.textContent=sub?(SUBLINE||'Uses Claude Code signed in on this computer with your Claude account. Not signed in yet? Run  claude  once in a terminal and sign in, then Save.'):'';}
$('getkey').textContent=local?'About Ollama':'Where do I get a key?';$('modelHint').textContent='(default '+DEFMODEL[p]+')';$('model').placeholder='(blank = '+DEFMODEL[p]+')';}
$('provider').addEventListener('change',function(){$('provider').setAttribute('data-touched','1');syncP();});
$('getkey').addEventListener('click',function(){window.open(KEYURL[$('provider').value],'_blank');});
$('save').addEventListener('click',function(){var p=$('provider').value;$('saveMsg').textContent='checking...';$('saveMsg').className='note muted';
var cfg={provider:p,model:$('model').value.trim()};if(p==='ollama')cfg.baseUrl=$('baseUrl').value.trim();else cfg.key=$('key').value.trim();
api('/api/connect',cfg).then(function(r){$('saveMsg').textContent=r.message||(r.ok?'Connected.':'Could not connect.');$('saveMsg').className='note '+(r.ok?'ok':'err');if(r.ok){$('key').value='';refresh();}});});
$('quit').addEventListener('click',function(){api('/api/quit');document.body.innerHTML='<div style=\\'padding:40px;color:#7E9690;font-family:sans-serif\\'>Symbiot stopped. You can close this window.</div>';});
var GRAPH=null,sel=null,view={k:1,x:0,y:0},GW=960,GH=620;
function esc(s){return String(s).replace(/[&<>]/g,function(ch){return ch==='&'?'&amp;':ch==='<'?'&lt;':'&gt;';});}
// An agent's option, with its who-acts markers as badges: 👤 You (you do this
// step) and 🤖 Agent (picking it is enough; the next run does it). Escaped first.
function whoHtml(o){return esc(o).replace(/👤[ ]*(You:|You(?=[ ]))?/g,"<span class='who you'><i class=ic-person></i> You</span> ").replace(/🤖[ ]*(Agent:|Agent(?=[ ]))?/g,"<span class='who agent'><i class=ic-bot></i> Agent</span> ");}
function layout(nodes,edges){var idx={};nodes.forEach(function(n){n.x=GW/2+(Math.random()-0.5)*GW*0.8;n.y=GH/2+(Math.random()-0.5)*GH*0.8;n.vx=0;n.vy=0;idx[n.id]=n;});
for(var it=0;it<340;it++){for(var i=0;i<nodes.length;i++)for(var j=i+1;j<nodes.length;j++){var a=nodes[i],b=nodes[j];var dx=a.x-b.x,dy=a.y-b.y;var d2=dx*dx+dy*dy+0.01;var d=Math.sqrt(d2);var f=4600/d2;a.vx+=f*dx/d;a.vy+=f*dy/d;b.vx-=f*dx/d;b.vy-=f*dy/d;}
edges.forEach(function(e){var a=idx[e.source],b=idx[e.target];if(!a||!b)return;var dx=b.x-a.x,dy=b.y-a.y;var d=Math.sqrt(dx*dx+dy*dy)+0.01;var f=(d-115)*0.03;a.vx+=f*dx/d;a.vy+=f*dy/d;b.vx-=f*dx/d;b.vy-=f*dy/d;});
nodes.forEach(function(n){n.vx+=(GW/2-n.x)*0.002;n.vy+=(GH/2-n.y)*0.002;n.x+=Math.max(-9,Math.min(9,n.vx));n.y+=Math.max(-9,Math.min(9,n.vy));n.vx*=0.86;n.vy*=0.86;n.x=Math.max(30,Math.min(GW-30,n.x));n.y=Math.max(24,Math.min(GH-28,n.y));});}}
function nbrs(id){var s={};s[id]=1;GRAPH.edges.forEach(function(e){if(e.source===id)s[e.target]=1;if(e.target===id)s[e.source]=1;});return s;}
function render(){if(!GRAPH)return;var idx={};GRAPH.nodes.forEach(function(n){idx[n.id]=n;});var nb=sel?nbrs(sel):null;
var s="<defs><radialGradient id='lqsilver' cx='35%' cy='30%' r='75%'><stop offset='0%' stop-color='#FFFFFF'/><stop offset='35%' stop-color='#C9CFD9'/><stop offset='75%' stop-color='#6F7887'/><stop offset='100%' stop-color='#2A2F38'/></radialGradient></defs><g id='vp' transform='translate("+view.x.toFixed(1)+","+view.y.toFixed(1)+") scale("+view.k.toFixed(3)+")'>";
GRAPH.edges.forEach(function(e){var a=idx[e.source],b=idx[e.target];if(!a||!b)return;var op=nb?((nb[e.source]&&nb[e.target])?0.75:0.06):0.45;s+="<line x1='"+a.x.toFixed(1)+"' y1='"+a.y.toFixed(1)+"' x2='"+b.x.toFixed(1)+"' y2='"+b.y.toFixed(1)+"' stroke='"+(LQ.theme&&LQ.theme.light?'#8E97A6':'#5C6878')+"' stroke-width='1' opacity='"+op+"'/>";});
GRAPH.nodes.forEach(function(n){var r=Math.max(5,Math.sqrt(n.weight)*2);var col=COLORS[n.type]||"#888";var op=nb?(nb[n.id]?1:0.14):0.95;var title=esc(n.label)+(n.meta?(" - "+(n.meta.commits||0)+" commits"):"");
s+="<g class='node' data-id='"+esc(n.id)+"' opacity='"+op+"'><circle cx='"+n.x.toFixed(1)+"' cy='"+n.y.toFixed(1)+"' r='"+r.toFixed(1)+"' fill='url(#lqsilver)' stroke='"+col+"' stroke-width='"+(n.id===sel?2.5:1.2)+"'"+(n.id===sel?" stroke-opacity='1'":" stroke-opacity='0.7'")+"><title>"+title+"</title></circle>";
var cls=n.type==="person"?"lbl-me":"";s+="<text x='"+n.x.toFixed(1)+"' y='"+(n.y+r+12).toFixed(1)+"' text-anchor='middle' class='"+cls+"'>"+esc(n.label)+"</text></g>";});
document.getElementById("graph").innerHTML=s+"</g>";}

// ---- the Map, in the liquid -------------------------------------------------------
// Your repos and project folders as droplets in the look, in lanes by kind: what
// needs you first (a question or a review waiting), then repos with your commits, the
// other repos, folders without git, and the act-* folders agent runs work in, as one
// group until you open it. Each lane runs newest first on a grid as wide as the map,
// so no two labels meet however many there are, and a lane's name folds it away.
// The page scrolls down the lanes; ctrl+scroll (a pinch), + and - zoom. Point at a
// droplet: the ones most like it (mapknn.mjs) light up and say why. Click: its details.
var LM={G:null,on:false,all:[],items:[],edges:[],lanes:[],shut:{runs:true},view:{k:1,x:0,y:0},hot:null,pan:null,built:false,lw:0,ch:0,cw:172,x0:0};
var LMLANES=[['need','Needs you'],['mine','Your repos'],['other','Other repos'],['folders','Folders without git'],['runs','Agent run folders']];
function lmTilde(p){p=String(p||'');var parts=p.split('/');return (parts[1]==='home'||parts[1]==='Users')&&parts.length>2?'~'+(parts.length>3?'/'+parts.slice(3).join('/'):''):p;}
function lmName(id){var n=GRAPH&&nodeById(id);return n?n.label:String(id).split('/').pop();}
function lmNearHtml(id){var k=GRAPH&&GRAPH.knn,ns=k&&k.neighbours&&k.neighbours[id];if(!ns||!ns.length)return '';
return "<div class='k'>Most like it</div><ul class='lmnear'>"+ns.map(function(n){return "<li><button type='button' data-id='"+escQ(n.id)+"'><b>"+esc(lmName(n.id))+"</b><span>"+esc(n.why.join('; ')||'a little alike')+"</span></button></li>";}).join('')+"</ul>";}
function lmNearWire(el){if(el&&el.querySelectorAll)el.querySelectorAll('.lmnear button').forEach(function(b){b.addEventListener('click',function(){selectNode(b.getAttribute('data-id'));});});}
function lmWeeks(d){var n=GRAPH&&nodeById('repo:'+d.path),w=n&&n.meta&&n.meta.weeks;if(!w||!w.length)return '';var mx=Math.max.apply(null,w.concat([1]));
return "<div class='k'>Your last 12 weeks</div><div class='lmweeks' role='img' aria-label='"+w.join(', ')+" commits a week'>"+w.map(function(x){return "<i style='height:"+Math.max(2,Math.round(28*x/mx))+"px' title='"+x+" commits'></i>";}).join('')+"</div>";}
// what needs you (home.mjs workScene): per project, a question or work ready for your
// OK; per run folder, the questions its run left you
function lmNeeds(){var o={repo:{},path:{}};((LQ.workData&&LQ.workData.projects)||[]).forEach(function(p){var s=p.asks?p.asks+' question'+(p.asks>1?'s':'')+' for you':p.ready?'ready for your OK':'';if(s)o.repo[p.repo]=s;
(p.qs||[]).forEach(function(q){if(q.path&&!o.path[q.path])o.path[q.path]=String(q.q||'a question for you');});});return o;}
// when it was last worked on: its last commit, or an agent's last session there
function lmWhen(m){var t=m&&m.last?Date.parse(m.last)||0:0;((m&&m.agents)||[]).forEach(function(a){if(a.last*1000>t)t=a.last*1000;});return t;}
function lmBuild(g){var el=$('lmap');if(!el||!g)return;LM.g=g;LM.knn=g.knn||{neighbours:{},edges:[],clusters:[],vitality:{}};
if(!LQ.workData){LQ.workData={};api('/api/work').then(function(w){LQ.workData=w||{};if(LM.g===g)lmBuild(g);}).catch(function(){});}
var nodes=g.nodes.filter(function(n){return n.type==='repo'||n.type==='folder';}),mx=1,need=lmNeeds();nodes.forEach(function(n){var c=(n.meta&&n.meta.commits)||0;if(c>mx)mx=c;});
LM.all=nodes.map(function(n){var m=n.meta||{},v=LM.knn.vitality[n.id]||0,c=m.commits||0,run=/^act-[0-9a-f]{6,}$/i.test(n.label),fold=n.type==='folder'||run,nd=need.path[m.path]||(run?'':need.repo[n.label]||'');
return {id:n.id,n:n,v:v,c:c,fold:fold,run:run,when:lmWhen(m),need:nd,lane:nd?'need':run?'runs':fold?'folders':c?'mine':'other',r:fold?9:(11+15*Math.sqrt(c/mx))*(0.75+0.25*v),x:0,y:0};});
lmLayout(true);
// the rest of what you build with, as a quiet row under the map
var L=LM.all,tl=$('lmtools');if(tl){var langs={};L.forEach(function(a){((a.n.meta&&a.n.meta.langs)||[]).forEach(function(x){langs[x]=(langs[x]||0)+1;});});
var lg=Object.keys(langs).sort(function(x,y){return langs[y]-langs[x];});var tools=g.nodes.filter(function(n){return n.type==='tool'||n.type==='agent'||n.type==='ai';});
tl.innerHTML=(lg.length?"<div class='lmrow'><span class='lmk'>Languages</span>"+lg.map(function(x){return "<button type='button' class='lmt' data-id='lang:"+escQ(x)+"'>"+esc(x)+"<small>"+langs[x]+"</small></button>";}).join('')+"</div>":"")+
(tools.length?"<div class='lmrow'><span class='lmk'>You build with</span>"+tools.map(function(n){return "<button type='button' class='lmt' data-id='"+escQ(n.id)+"'>"+esc(n.label)+"</button>";}).join('')+"</div>":"");
tl.querySelectorAll('.lmt').forEach(function(b){b.addEventListener('click',function(){selectNode(b.getAttribute('data-id'));});});}
if(!LM.built){LM.built=true;lmWire();}lmStart();}
// The lanes on a grid as wide as the map is now: a cell a droplet, its name under it.
function lmLayout(fit){var el=$('lmap');if(!el)return;var w=el.clientWidth||900,CW=LM.cw,RH=92,cols=Math.max(1,Math.floor((w-40)/CW)),x0=Math.max(20,(w-cols*CW)/2),y=18,items=[],lanes=[];
LMLANES.forEach(function(D){var m=LM.all.filter(function(a){return a.lane===D[0];}).sort(function(a,b){return b.when-a.when||b.c-a.c||(a.n.label<b.n.label?-1:1);});if(!m.length)return;
var shut=!!LM.shut[D[0]],show=!shut?m:D[0]==='runs'?[{id:'group:runs',group:true,n:{label:m.length+' agent runs',meta:{}},fold:true,r:17,v:1,c:0,need:'',when:m[0].when,lane:'runs',x:0,y:0}]:[];
lanes.push({key:D[0],title:D[1],n:m.length,shut:shut,y:y});y+=30;
show.forEach(function(a,i){a.x=x0+CW/2+(i%cols)*CW;a.y=y+30+Math.floor(i/cols)*RH;items.push(a);});y+=Math.ceil(show.length/cols)*RH+16;});
LM.items=items;LM.lanes=lanes;LM.ch=y;LM.x0=x0;LM.lw=w;LM.lk=null;if(el.style)el.style.height=Math.max(300,Math.round(y))+'px'; // as tall as its lanes: the page scrolls, not the map
if(LM.hot&&items.indexOf(LM.hot)<0)LM.hot=null;
var byId={};items.forEach(function(a){byId[a.id]=a;});LM.edges=(LM.knn.edges||[]).filter(function(e){return byId[e.a]&&byId[e.b];}).map(function(e){return {a:byId[e.a],b:byId[e.b],sim:e.sim};});
var ov=$('lmov');if(ov){ov.innerHTML=items.map(function(a,i){var m=a.n.meta||{},sub=a.group?'act-* folders &middot; show them':a.need?esc(a.need):a.fold?(a.run?'agent run':'folder')+(a.when?' &middot; '+lmAgo(a.when):', no git'):(a.c?a.c+(a.c===1?' commit':' commits'):'not yours')+(m.last?' &middot; '+lmAgo(m.last):'');
return "<button type='button' class='lml"+(a.v<0.25&&!a.fold&&!a.need?' dormant':'')+(a.fold?' fold':'')+(a.need?' need':'')+"' data-i='"+i+"' title='"+escQ(a.n.label)+"'><b>"+esc(a.n.label)+"</b><span>"+sub+"</span></button>";}).join('')+
lanes.map(function(L,i){return "<button type='button' class='lmlane"+(L.key==='need'?' need':'')+"' data-l='"+i+"' aria-expanded='"+(L.shut?'false':'true')+"' title='"+(L.shut?'show':'fold')+" this lane'>"+esc(L.title)+"<small>"+L.n+"</small><span>"+(L.shut?'show':'fold')+"</span></button>";}).join('')+
items.filter(function(a){return a.fold;}).map(function(a){return "<i class='lmring"+(a.group?' group':'')+(a.need?' need':'')+"' data-id='"+escQ(a.id)+"'></i>";}).join('');
LM.labs=[].slice.call(ov.querySelectorAll('.lml[data-i]'));LM.lnb=[].slice.call(ov.querySelectorAll('.lmlane'));LM.rings=[].slice.call(ov.querySelectorAll('.lmring'));
LM.labs.forEach(function(b){var a=items[+b.getAttribute('data-i')];b.addEventListener('click',function(){lmPick(a);});b.addEventListener('pointerenter',function(){lmHot(a);});b.addEventListener('focus',function(){lmHot(a);});b.addEventListener('pointerleave',function(){lmHot(null);});b.addEventListener('blur',function(){lmHot(null);});});
LM.lnb.forEach(function(b){var L=lanes[+b.getAttribute('data-l')];b.addEventListener('click',function(){LM.shut[L.key]=!L.shut;lmLayout(false);});});}
if(fit)lmFit();}
// a droplet clicked: its details, or the act-* group opened
// what needs you opens where you answer it, like its lane on Home
function lmPick(a){if(!a)return;if(a.group){LM.shut.runs=false;lmHot(null);lmLayout(false);return;}if(a.need){lmHot(null);lqFocus({kind:'proj',repo:a.run?'ops':a.n.label,path:a.run?(a.n.meta||{}).path:''});return;}selectNode(a.id);}
function lmAgo(day){var t=typeof day==='number'?day:Date.parse(day);if(!t)return day;var d=Math.round((Date.now()-t)/86400000);return d<=0?'today':d===1?'yesterday':d<14?d+' days ago':d<60?Math.round(d/7)+' weeks ago':Math.round(d/30)+' months ago';}
function lmFit(){var el=$('lmap');if(!el||!LM.all.length)return;if(el.clientWidth&&Math.abs(el.clientWidth-LM.lw)>4)lmLayout(false);LM.view={k:1,x:0,y:0};}
function lmHot(a){LM.hot=a;var tip=$('lmtip');var near={};if(a&&GRAPH&&GRAPH.knn)(GRAPH.knn.neighbours[a.id]||[]).forEach(function(n){near[n.id]=n;});
(LM.labs||[]).forEach(function(b){var it=LM.items[+b.getAttribute('data-i')];if(b.classList&&it){b.classList.toggle('near',!!(a&&near[it.id]));b.classList.toggle('far',!!(a&&it!==a&&!near[it.id]));}});
if(!tip)return;if(!a){tip.className='lmtip';return;}if(a.group){tip.innerHTML="<b>"+esc(a.n.label)+"</b><span class='lmts'>the act-* folders Symbiot's agent runs work in</span><div class='lmtn'>Click to show them all.</div>";tip.className='lmtip on';return;}
var m=a.n.meta||{},ns=(GRAPH&&GRAPH.knn&&GRAPH.knn.neighbours[a.id])||[];
tip.innerHTML="<b>"+esc(a.n.label)+"</b><span class='lmts'>"+(a.need?esc(a.need)+' &middot; ':'')+(a.run?'the folder an agent run worked in':a.fold?'a project folder, not a git repo':(m.commits||0)+((m.commits||0)===1?' commit':' commits')+(m.last?' &middot; last '+lmAgo(m.last):'')+(m.branch?' &middot; on '+esc(m.branch):''))+"</span>"+(ns.length?"<div class='lmtn'>"+ns.map(function(n){return "<div><b>"+esc(lmName(n.id))+"</b> "+esc(n.why.join('; ')||'a little alike')+"</div>";}).join('')+"</div>":"<div class='lmtn'>Nothing else is much like it.</div>");tip.className='lmtip on';}
function lmS(p){return {x:p.x*LM.view.k+LM.view.x,y:p.y*LM.view.k+LM.view.y};}
function lmWire(){var el=$('lmap');if(!el||!el.addEventListener)return;
el.addEventListener('wheel',function(e){if(!e||!e.ctrlKey)return;e.preventDefault();var r=el.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,k0=LM.view.k,k=Math.max(0.4,Math.min(3,k0*Math.exp(-e.deltaY*0.004)));LM.view.x=mx-(mx-LM.view.x)*k/k0;LM.view.y=my-(my-LM.view.y)*k/k0;LM.view.k=k;},{passive:false});
el.addEventListener('pointerdown',function(e){if(e.target&&e.target.closest&&e.target.closest('button,.lmtip'))return;LM.pan={x:e.clientX,y:e.clientY,vx:LM.view.x,vy:LM.view.y,moved:false};if(el.setPointerCapture)el.setPointerCapture(e.pointerId);});
el.addEventListener('pointermove',function(e){if(LM.pan){var dx=e.clientX-LM.pan.x,dy=e.clientY-LM.pan.y;if(Math.abs(dx)+Math.abs(dy)>3)LM.pan.moved=true;LM.view.x=LM.pan.vx+dx;LM.view.y=LM.pan.vy+dy;return;}
var r=el.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,hit=null;LM.items.forEach(function(a){var p=lmS(a);if(!hit&&Math.hypot(mx-p.x,my-p.y)<=a.r*LM.view.k+6)hit=a;});if(hit!==LM.hot&&!(e.target&&e.target.closest&&e.target.closest('.lml')))lmHot(hit);});
el.addEventListener('pointerup',function(e){var p=LM.pan;LM.pan=null;if(p&&!p.moved&&LM.hot&&!(e.target&&e.target.closest&&e.target.closest('button')))lmPick(LM.hot);});
el.addEventListener('pointerleave',function(){if(!LM.pan)lmHot(null);});
var zi=$('lmin'),zo=$('lmout'),zf=$('lmfit');function z(f){var w=el.clientWidth/2,h=el.clientHeight/2,k0=LM.view.k,k=Math.max(0.4,Math.min(3,k0*f));LM.view.x=w-(w-LM.view.x)*k/k0;LM.view.y=h-(h-LM.view.y)*k/k0;LM.view.k=k;}
if(zi)zi.addEventListener('click',function(){z(1.25);});if(zo)zo.addEventListener('click',function(){z(0.8);});if(zf)zf.addEventListener('click',lmFit);}
function lmStart(){if(LM.on)return;var raf=typeof window.requestAnimationFrame==='function'?function(f){return window.requestAnimationFrame(f);}:null;if(!raf)return;LM.on=true;
var loop=function(){var p=$('panel-map'),el=$('lmap');if(!p||!el||!el.offsetParent){LM.on=false;return;}LM.fr=(LM.fr||0)+1;if(LM.fr%glEvery(true)===0)lmFrame();raf(loop);};raf(loop);}
function lmFrame(){var el=$('lmap'),cv=$('lmc');if(!el||!cv||!LM.items.length)return;if(!LM.G)LM.G=lqGL(cv,64);var w=el.clientWidth,h=el.clientHeight,t=LM.t=(LM.t||0)+0.016,still=LQ.theme&&LQ.theme.still;
if(w&&Math.abs(w-LM.lw)>4)lmLayout(false);
// kept on the lanes: no scrolling past the top or the last lane
var V=LM.view,k=V.k,lo=Math.min(12,h-LM.ch*k-12);V.y=Math.max(lo,Math.min(12,V.y));V.x=Math.max(Math.min(0,w-LM.lw*k)-40,Math.min(Math.max(0,w-LM.lw*k)+40,V.x));
var P=LM.items.map(function(a,i){var p=lmS(a);if(!still){p.x+=Math.sin(t*0.4+i*1.7)*1.5;p.y+=Math.cos(t*0.35+i*2.3)*1.5;}return p;});
// a name never wider than its cell, whatever the zoom
if(LM.lk!==k){LM.lk=k;(LM.labs||[]).forEach(function(b){if(b.style)b.style.maxWidth=Math.max(44,Math.round(LM.cw*k-14))+'px';if(b.classList)b.classList.toggle('tiny',k<0.75);});}
(LM.labs||[]).forEach(function(b){var i=+b.getAttribute('data-i'),a=LM.items[i],p=P[i];if(!b.style||!a)return;b.style.transform='translate('+Math.round(p.x-(b.offsetWidth||0)/2)+'px,'+Math.round(p.y+a.r*k+4)+'px)';});
(LM.lnb||[]).forEach(function(b){var L=LM.lanes[+b.getAttribute('data-l')];if(b.style&&L)b.style.transform='translate('+Math.round(LM.x0*k+V.x)+'px,'+Math.round(L.y*k+V.y)+'px)';});
(LM.rings||[]).forEach(function(rg){var i=-1;LM.items.forEach(function(a,j){if(a.id===rg.getAttribute('data-id'))i=j;});if(i<0||!rg.style)return;var R=Math.round(LM.items[i].r*k);rg.style.width=rg.style.height=(2*R)+'px';rg.style.transform='translate('+Math.round(P[i].x-R)+'px,'+Math.round(P[i].y-R)+'px)';});
var tip=$('lmtip');if(tip&&LM.hot){var hi=LM.items.indexOf(LM.hot),hp=P[hi];if(hp){var tw=tip.offsetWidth||280,th=tip.offsetHeight||100,tx=Math.max(10,Math.min(w-tw-10,hp.x+LM.hot.r*k+16)),ty=Math.max(10,Math.min(h-th-10,hp.y-th/2));if(tx<hp.x&&hp.x+LM.hot.r*k+16+tw>w)tx=Math.max(10,hp.x-LM.hot.r*k-16-tw);tip.style.transform='translate('+Math.round(tx)+'px,'+Math.round(ty)+'px)';}}
// what the droplet you point at is most like, as faint lines to them
var sv=$('lmlines');if(sv){var ln='';if(LM.hot)LM.edges.forEach(function(e){if(e.a!==LM.hot&&e.b!==LM.hot)return;var a=P[LM.items.indexOf(e.a)],b=P[LM.items.indexOf(e.b)];ln+="<line x1='"+a.x.toFixed(1)+"' y1='"+a.y.toFixed(1)+"' x2='"+b.x.toFixed(1)+"' y2='"+b.y.toFixed(1)+"' class='hot'/>";});sv.innerHTML=ln;}
var G=LM.G;if(!G)return;var gl=G.gl,d=glDpr(2),W=Math.max(1,Math.floor(w*d)),H=Math.max(1,Math.floor(h*d));if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;gl.viewport(0,0,W,H);}
var o=G.out;for(var z=0;z<o.length;z++)o[z]=0;var n=0,put=function(x,y,r,a){if(n>=64||r<=0)return;o[n*4]=x/w;o[n*4+1]=y/h;o[n*4+2]=r;o[n*4+3]=a||0;n++;};
// only what's in view: the lanes can hold more than the liquid draws at once
LM.items.forEach(function(a,i){var R=a.r*k;if(!a.fold&&P[i].y>-R-20&&P[i].y<h+R+20&&P[i].x>-R-20&&P[i].x<w+R+20)put(P[i].x,P[i].y,R*(LM.hot===a?1.08:1),a.need?1:0);});
var th=LQ.theme||{},U=G.U;gl.uniform2f(U.uRes,W,H);gl.uniform1f(U.uT,t);gl.uniform1f(U.uDpr,d);gl.uniform4fv(U.uB,o);gl.uniform3f(U.uRip,0,0,-10);gl.uniform1f(U.uStyle,th.look==='glass'?0:th.look==='pearl'?2:1);gl.uniform1f(U.uContrast,th.contrast?1:0);gl.uniform1f(U.uExposure,th.night?0.82:1);gl.drawArrays(gl.TRIANGLES,0,3);}

// The write-ups as a document: # headings, - bullets, **bold**; everything escaped first.
function mdLite(t){var out=[],list=false;String(t||'').split(String.fromCharCode(10)).forEach(function(line){var l=line.trim(),b=function(x){var p=esc(x).split('**');return p.map(function(s,i){return i%2?'<b>'+s+'</b>':s;}).join('');};
if(l.indexOf('- ')===0||l.indexOf('* ')===0||l.indexOf('• ')===0){if(!list){out.push('<ul>');list=true;}out.push('<li>'+b(l.slice(2))+'</li>');return;}
if(list){out.push('</ul>');list=false;}if(!l){return;}var h=0;while(l.charAt(h)==='#')h++;if(h&&l.charAt(h)===' '){out.push('<h'+Math.min(4,h+2)+'>'+b(l.slice(h+1))+'</h'+Math.min(4,h+2)+'>');return;}
out.push('<p>'+b(l)+'</p>');});if(list)out.push('</ul>');return out.join('');}
function wuHead(){var t=$('wutitle'),u=$('wusub');if(!t||!u)return;var c=typeof current==='string'?current:'week',d=new Date(),f=function(x){return x.toLocaleDateString(undefined,{day:'numeric',month:'short'});};
if(c==='standup'){t.textContent='Your standup';u.textContent='Yesterday and today, from your local git';}else if(c==='todo'){t.textContent='Still on your plate';u.textContent='What your repos say is unfinished';}else{var a=new Date(d.getTime()-6*86400000);t.textContent='Your week';u.textContent=f(a)+' to '+f(d)+', from your local git';}}
function profileLine(g){var repos=g.nodes.filter(function(n){return n.type==="repo";});var base=lmTilde(g.stats.base)||"your home folder";
if(g.stats.noStorage)return "Symbiot can't see your phone's files yet, so it can't find your projects. Android calls this <b>All files access</b>."+(window.SymbiotAndroid?" <button class='act' id='allowfiles'>Allow file access</button>":"");
if(!repos.length)return "No git repositories found under "+esc(base)+" yet."+(g.stats.android?" Projects in Termux's home folder (<code>~</code>) are private to Termux, so no other app can see them."+(phoneTermux().installed?" Symbiot running in Termux can, and this app can show it: <button class='act' id='usetermux'>Open Termux</button> copies the command that starts it. Paste it there, and Termux opens it here. Or keep":" Keep")+" your projects in shared storage: in Termux, run <code>termux-setup-storage</code> and work under <code>~/storage/shared</code>.":"");var langs=g.nodes.filter(function(n){return n.type==="lang";}).map(function(n){return n.label;});var top=repos.slice().sort(function(a,b){return (b.meta.commits||0)-(a.meta.commits||0);})[0];var more=(g.stats.roots||[]).filter(function(r){return r!==base;}).length;var s="Scanned <b>"+esc(base)+"</b>"+(more?" and "+more+" more folder"+(more>1?"s":""):"")+" &middot;<b>"+g.stats.repos+"</b> repos &middot; <b>"+g.stats.commits+"</b> of your commits &middot; <b>"+(g.stats.files||0)+"</b> files &middot; ";s+=langs.length?("mostly <b>"+esc(langs.slice(0,3).join(", "))+"</b>"):"no languages detected";if(top)s+=" &middot; most active: <b>"+esc(top.label)+"</b>";return s;}
function nodeById(id){for(var i=0;i<GRAPH.nodes.length;i++)if(GRAPH.nodes[i].id===id)return GRAPH.nodes[i];return null;}
function summarize(n){if(!n)return "";if(n.type==='repo'){var m=n.meta||{};var bits=[m.commits+' commits'];if(m.branch)bits.push('branch '+m.branch);if(m.last)bits.push('last '+m.last);if(typeof m.files==='number')bits.push(m.files+' files');if(m.langs&&m.langs.length)bits.push(m.langs.join(', '));if(m.tools&&m.tools.length)bits.push(m.tools.join(', '));return "<b>"+esc(n.label)+"</b>  "+esc(m.path||'')+"  —  "+esc(bits.join('  ·  '));}if(n.type==='lang')return "<b>"+esc(n.label)+"</b>  —  language (click to see repos)";if(n.type==='tool')return "<b>"+esc(n.label)+"</b>  —  tool (click to see repos)";if(n.type==='person')return "<b>"+esc(n.label)+"</b>  —  you";return "<b>"+esc(n.label)+"</b>";}
function updateBar(id){var bar=document.getElementById('mapbar');if(!bar)return;var n=id?nodeById(id):(sel?nodeById(sel):null);bar.innerHTML=n?summarize(n):"Hover a node for a summary &middot; click for details &middot; drag to move";}
function hideDetail(){document.getElementById('detail').classList.add('hidden');}
function ago(sec){if(!sec)return'';var s=Math.floor(Date.now()/1000)-sec;if(s<3600)return Math.max(1,Math.floor(s/60))+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago';}
function agentBadge(d){if(!d.agents||!d.agents.length)return'';return d.agents.map(function(a){return "<div style='margin-top:8px;font-size:12px;color:var(--bone);background:var(--green-dim);border:1px solid #2a6b52;border-radius:8px;padding:6px 9px'>&#9889; worked via <b>"+esc(a.agent)+"</b>"+(a.last?" &middot; "+ago(a.last):"")+"</div>";}).join('');}
function showDetail(d){var el=document.getElementById('detail');el.classList.remove('hidden');
if(d.error){el.innerHTML="<h3>&mdash;</h3><div class='k'>"+esc(d.error)+"</div>";return;}
if(d.type==='repo'){var chips="";['branch: '+(d.branch||'?'),d.commits+' commits',(d.dirty?d.dirty+' uncommitted':'clean'),(d.last?'last '+d.last:'')].concat(d.langs||[]).concat(d.tools||[]).forEach(function(x){if(x)chips+="<span class='tag'>"+esc(x)+"</span>";});
el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='chips'>"+chips+"</div>"+lmWeeks(d)+lmNearHtml('repo:'+d.path)+agentBadge(d)+"<button class='act' id='suggest' style='margin-top:12px'>Suggest next steps</button><div id='sugout'></div>";lmNearWire(el);
document.getElementById('suggest').addEventListener('click',function(){var o=document.getElementById('sugout');o.innerHTML="<div class='out2'>Thinking...</div>";api('/api/suggest',{path:d.path}).then(function(r){if(r.error==='not-connected'){o.innerHTML="<div class='out2'>Connect a model in Settings to get suggestions - Ollama is free and runs locally.</div>";return;}o.innerHTML="<div class='out2'>"+esc(r.text||'(no output)')+"</div>"+(r.footer?"<div class='rfoot'>"+esc(r.footer)+"</div>":"");});});return;}
if(d.type==='lang'||d.type==='tool'){var lis=(d.repos||[]).map(function(r){return "<li>"+esc(r)+"</li>";}).join("");el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>Used in "+((d.repos||[]).length)+" repos</div><ul>"+lis+"</ul>";return;}
if(d.type==='agent'){var m=d.meta||{};el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>"+(m.kind==='agent'?'AI coding agent you have installed':'editor you have installed')+"</div>"+(m.cmd?"<div class='out2' style='font-size:11px'>"+esc(m.cmd)+"</div>":"");return;}
if(d.type==='ai'){var m=d.meta||{};el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>Currently powering Symbiot &middot; model <b>"+esc(m.model||'?')+"</b>"+(m.source?" &middot; via "+esc(m.source):"")+"</div>";return;}
if(d.type==='folder'){var chips='';(d.langs||[]).concat(d.tools||[]).forEach(function(x){chips+="<span class='tag'>"+esc(x)+"</span>";});el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>project folder &middot; not a git repo &middot; "+(d.files||0)+" files</div><div class='chips'>"+chips+"</div><div class='k' style='font-family:ui-monospace,monospace'>"+esc(d.path||'')+"</div>"+agentBadge(d)+"<button class='act' id='suggest' style='margin-top:12px'>Overview &amp; suggestions</button><div id='sugout'></div><div class='k' style='margin-top:8px'>Tasks can be sent here too &mdash; the agent runs in this folder.</div>";document.getElementById('suggest').addEventListener('click',function(){var o=document.getElementById('sugout');o.innerHTML="<div class='out2'>Thinking...</div>";api('/api/suggest',{path:d.path}).then(function(r){if(r.error==='not-connected'){o.innerHTML="<div class='out2'>Connect a model in Settings to get an overview - Ollama is free and runs locally.</div>";return;}o.innerHTML="<div class='out2'>"+esc(r.text||'(no output)')+"</div>"+(r.footer?"<div class='rfoot'>"+esc(r.footer)+"</div>":"");});});return;}
if(d.type==='person'){var st=d.stats||{};el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='k'>"+st.repos+" repos &middot; "+st.commits+" commits &middot; "+st.languages+" languages &middot; "+st.tools+" tools"+(st.agents?" &middot; "+st.agents+" agents/editors":"")+"</div>";return;}}
var reviewCache={};var IDEAS=[];var IREPO="";
function hideReview(){var el=document.getElementById('review');el.classList.add('hidden');el.innerHTML='';}
function reviewHtml(name,body,verdict,ideas,tasks,footer){IDEAS=ideas||[];IREPO=name;
var h="<h4>AI review &middot; <span class='rname'>"+esc(name)+"</span></h4><div class='body'>"+esc(body)+"</div>";
if(verdict)h+="<div class='verdict'>&#9878;&#65039; "+esc(verdict)+"</div>";
if(ideas&&ideas.length){h+="<div class='ideas'><h4>Ideas worth doing &middot; tick to add to Tasks</h4>";
ideas.forEach(function(idea,i){var t=(tasks||[]).filter(function(x){return x.text===idea&&x.repo===name;})[0];var tid=t?t.id:"";
h+="<label class='idea'><input type='checkbox' class='ideachk' data-idx='"+i+"' data-tid='"+esc(tid)+"'"+(t?" checked":"")+"><span>"+esc(idea)+"</span></label>";});
h+="</div>";}
else h+="<div class='muted' style='margin-top:10px'>No new features suggested &mdash; the verdict above is the call.</div>";
if(footer)h+="<div class='rfoot'>"+esc(footer)+"</div>";
return h;}
function wireIdeas(){document.querySelectorAll('.ideachk').forEach(function(cb){cb.addEventListener('change',function(){
var idea=IDEAS[+cb.getAttribute('data-idx')];if(idea==null)return;
if(cb.checked){api('/api/tasks/add',{text:idea,repo:IREPO}).then(function(it){if(it&&it.id)cb.setAttribute('data-tid',it.id);});}
else{var id=cb.getAttribute('data-tid');if(id){api('/api/tasks/remove',{id:id}).then(function(){cb.setAttribute('data-tid','');});}}});});}
function loadReview(name,path){var el=document.getElementById('review');el.classList.remove('hidden');
if(reviewCache[path]){var c=reviewCache[path];api('/api/tasks').then(function(tasks){el.innerHTML=reviewHtml(name,c.text,c.verdict,c.ideas,tasks,c.footer);wireIdeas();});return;}
el.innerHTML="<h4>AI review &middot; <span class='rname'>"+esc(name)+"</span></h4><div class='body'>Reading the project&hellip;</div>";
Promise.all([api('/api/review',{path:path}),api('/api/tasks')]).then(function(res){var r=res[0]||{},tasks=res[1]||[];
if(r.error==='not-connected'){el.innerHTML="<h4>AI review &middot; <span class='rname'>"+esc(name)+"</span></h4><div class='body'>Connect a model in Settings to get a review - Ollama is free and runs locally.</div>"+(r.footer?"<div class='rfoot'>"+esc(r.footer)+"</div>":"");return;}
var body=r.text||'(no output)';reviewCache[path]={text:body,verdict:r.verdict||"",ideas:r.ideas||[],footer:r.footer};el.innerHTML=reviewHtml(name,body,r.verdict||"",r.ideas||[],tasks,r.footer);wireIdeas();});}
var ALLTASKS=[];var PENDTASKS=[];var TFILTER={type:'',repo:''};var TARCH=false;
var TORDER=['Fixes','Tests & CI','Security','Performance','Refactor','UI/UX','Docs','Features & other'];
function taskRow(t,arch){return "<div class='task"+(t.done?" done":"")+"' data-id='"+esc(t.id)+"'>"+(arch?"":"<input type='checkbox' class='taskchk' title='mark done (auto-archives on sync)'"+(t.done?" checked":"")+">")+"<span class='t'>"+esc(t.full?t.text.replace(/ Full text: \\x60[^\\x60]*\\x60/,''):t.text)+(t.full?"<details class='tfull'><summary>full text</summary><div>"+esc(t.full)+"</div></details>":"")+"</span>"+(t.repo?"<span class='rp'>"+esc(t.repo)+"</span>":"")+(arch&&t.removedBy?"<span class='rp' title='An approved task "+(t.merged?"merged it into another":"dropped it")+". Restore it to keep it.'>"+(t.merged?"merged":"dropped")+"</span>":"")+(arch&&t.dropped?"<span class='rp' title='An agent deleted it from TASKS.md, as you said to drop it. Restore it to keep it.'>dropped</span>":"")+askBtn(t)+(arch?"<button class='rm restore' title='restore to active'>&#8630;</button>":"<button class='rm' title='remove'>&times;</button>")+"</div>";}
function wireTaskRows(el){el.querySelectorAll('.task').forEach(function(row){var id=row.getAttribute('data-id');
var cb=row.querySelector('.taskchk');if(cb)cb.addEventListener('change',function(){api('/api/tasks/toggle',{id:id}).then(function(){row.classList.toggle('done');});});
wireAsk(row,id);
var rm=row.querySelector('.rm');if(rm&&rm.classList.contains('restore'))rm.addEventListener('click',function(){api('/api/tasks/restore',{id:id}).then(loadArchived);});
else if(rm)rm.addEventListener('click',function(){api('/api/tasks/remove',{id:id}).then(function(){var nx=row.nextElementSibling;if(nx&&nx.classList.contains('tchat'))nx.remove();row.remove();});});});}
// Per-task Q&A: the button opens a thread under the row; answers come from the
// connected model, grounded in the task's repo (and its pending changes).
function askBtn(t){var n=(t.chat||[]).length;return "<button class='ask"+(n?" has":"")+"' title='"+(n?"questions &amp; answers about this task":"ask a question about this task")+"'><i class=ic-chat></i>"+(n?" "+Math.ceil(n/2):"")+"</button>";}
function taskById(id){var all=PENDTASKS.concat(ALLTASKS);for(var i=0;i<all.length;i++)if(all[i].id===id)return all[i];return null;}
function stepsHtml(st){return st&&st.length?"<details class='steps'><summary>"+st.length+(st.length>1?' steps':' step')+" &middot; "+esc(String(st[0]).charAt(0).toLowerCase()+String(st[0]).slice(1))+"</summary><ul>"+st.map(function(x){return "<li>"+esc(x)+"</li>";}).join('')+"</ul></details>":"";}
function chatMsgs(chat){return (chat||[]).map(function(m){return "<div class='msg "+(m.role==='user'?'q':'a')+"'>"+esc(m.text)+(m.role==='user'?'':stepsHtml(m.steps))+"</div>";}).join("");}
var CHATHINT="<div class='muted' style='font-size:12px'>Ask anything about this task &mdash; what it means, how to approach it, or what the agent changed. Answers draw on the repo&#39;s commits, README and rules.</div>";
function wireAsk(row,id){var b=row.querySelector('.ask');if(b)b.addEventListener('click',function(){toggleChat(row,id);});}
function toggleChat(row,id){var btn=row.querySelector('.ask');var nx=row.nextElementSibling;
if(nx&&nx.classList.contains('tchat')){nx.remove();btn.classList.remove('on');return;}
var t=taskById(id)||{id:id};btn.classList.add('on');
row.insertAdjacentHTML('afterend',"<div class='tchat'><div class='msgs'>"+((t.chat&&t.chat.length)?chatMsgs(t.chat):CHATHINT)+"</div><div class='row'><input class='askq' placeholder='Ask about this task...' style='flex:1'><button class='ghost asksend'>Ask</button><a class='askclear' title='forget this conversation'>clear</a></div></div>");
var box=row.nextElementSibling,inp=box.querySelector('.askq'),send=box.querySelector('.asksend'),msgs=box.querySelector('.msgs');
function ask(){var q=(inp.value||'').trim();if(!q||send.disabled)return;send.disabled=true;inp.value='';
if(!(t.chat&&t.chat.length))msgs.innerHTML='';
msgs.insertAdjacentHTML('beforeend',chatMsgs([{role:'user',text:q}])+"<div class='msg a muted thinking'>Thinking&hellip;</div>");
api('/api/tasks/chat',{id:id,question:q}).then(function(r){send.disabled=false;var th=msgs.querySelector('.thinking');if(th)th.remove();
if(r.error==='not-connected'){msgs.insertAdjacentHTML('beforeend',"<div class='msg a'>Connect a model in Settings to ask questions - Ollama is free and runs locally.</div>");return;}
if(r.error){msgs.insertAdjacentHTML('beforeend',"<div class='msg a err'>"+esc(r.error)+"</div>");return;}
t.chat=r.chat||[];msgs.innerHTML=chatMsgs(t.chat);btn.className='ask on has';btn.innerHTML="<i class=ic-chat></i> "+Math.ceil(t.chat.length/2);}).catch(function(e){send.disabled=false;var th=msgs.querySelector('.thinking');if(th)th.remove();msgs.insertAdjacentHTML('beforeend',"<div class='msg a err'>"+esc(String((e&&e.message)||e))+"</div>");});}
send.addEventListener('click',ask);inp.addEventListener('keydown',function(e){if(e.key==='Enter')ask();});
box.querySelector('.askclear').addEventListener('click',function(){api('/api/tasks/chat/clear',{id:id}).then(function(){t.chat=[];msgs.innerHTML=CHATHINT;btn.className='ask on';btn.innerHTML='<i class=ic-chat></i>';});});
inp.focus();}
function fchip(dim,val,label){var on=(TFILTER[dim]||'')===val;return "<button class='fchip"+(on?' on':'')+"' data-dim='"+dim+"' data-val='"+esc(val)+"'>"+esc(label)+"</button>";}
function renderFilter(){var box=document.getElementById('taskfilter');
if(TARCH){box.innerHTML="<button class='fchip on' id='archtoggle'>&#8617; back to active</button>";document.getElementById('archtoggle').addEventListener('click',function(){loadTasks();});return;}
var types={},repos={};ALLTASKS.forEach(function(t){types[t.type||'Features & other']=1;if(t.repo)repos[t.repo]=1;});
var fb="<span class='fl'>Type</span>"+fchip('type','','All')+Object.keys(types).sort(function(a,b){return TORDER.indexOf(a)-TORDER.indexOf(b);}).map(function(t){return fchip('type',t,t);}).join('');
fb+="<span class='fl'>Repo</span>"+fchip('repo','','All')+Object.keys(repos).sort().map(function(r){return fchip('repo',r,r);}).join('');
fb+="<button class='fchip' id='archtoggle' style='margin-left:auto'><i class=ic-archive></i> archived</button>";
box.innerHTML=fb;
box.querySelectorAll('.fchip[data-dim]').forEach(function(c){c.addEventListener('click',function(){TFILTER[c.getAttribute('data-dim')]=c.getAttribute('data-val');renderTasks();});});
document.getElementById('archtoggle').addEventListener('click',loadArchived);}
function renderTasks(){var el=document.getElementById('tasklist');TARCH=false;if(el&&el.classList)el.classList.toggle('onerepo',!!TFILTER.repo);renderFilter();renderNeeds();lqTitle();
var list=ALLTASKS.filter(function(t){return !t.review&&(!TFILTER.type||(t.type||'Features & other')===TFILTER.type)&&(!TFILTER.repo||t.repo===TFILTER.repo);});
if(!list.length){el.innerHTML="<div class='muted' style='margin-top:12px'>"+(ALLTASKS.length?"Nothing matches this filter.":"No tasks queued. Tell Symbiot one in the bar at the bottom, or tick ideas in a repo review on the Map.")+"</div>";return;}
var groups={};list.forEach(function(t){var ty=t.type||'Features & other';(groups[ty]=groups[ty]||[]).push(t);});
var keys=Object.keys(groups).sort(function(a,b){var ia=TORDER.indexOf(a),ib=TORDER.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});
var h="";keys.forEach(function(ty){h+="<div class='tgroup'>"+esc(ty)+" <span class='tcount'>"+groups[ty].length+"</span></div>";groups[ty].forEach(function(t){h+=taskRow(t,false);});});
el.innerHTML=h;wireTaskRows(el);}
function loadTasks(){TARCH=false;api('/api/tasks/sync',{}).then(function(){api('/api/tasks').then(function(list){ALLTASKS=list;renderTasks();wdJump();});loadPending();});}
// While an agent is still working in a repo on the review list, its Approve is
// greyed out; check again every few seconds, and when it finishes, sync (its last
// ticks land in review) so Approve unlocks without reopening the tab. The poll
// only re-renders on a change, so an open diff or chat isn't closed under you.
var pendTimer=null,PENDRUN='';
function pendRunning(list){return (list||[]).filter(function(r){return r.running;}).map(function(r){return r.repo;}).join('\\n');}
function pendPoll(){if(pendTimer){clearTimeout(pendTimer);pendTimer=null;}if(!PENDRUN||current!=='tasks')return;
pendTimer=setTimeout(function(){pendTimer=null;if(current!=='tasks')return;api('/api/pending').then(function(list){if(pendRunning(list)===PENDRUN||selIn($('panel-tasks')))pendPoll();else loadTasks();}).catch(pendPoll);},4000);}
function loadPending(){api('/api/pending').then(function(list){var el=document.getElementById('reviewlist');PENDTASKS=[];PENDRUN=pendRunning(list);pendPoll();
if(!list||!list.length){el.innerHTML='';lqLight();return;}
var n=0;list.forEach(function(r){n+=r.tasks.length||1;});
var h="<div class='tgroup' style='color:var(--amber)'>Awaiting your review <span class='tcount'>"+n+"</span></div>";
list.forEach(function(r){var ch=r.files.length?(r.files.length+" file"+(r.files.length>1?"s":"")+" changed"+(r.stat?" &middot; "+esc(r.stat):"")):"no uncommitted changes";
h+="<div class='rcard' data-repo='"+esc(r.repo)+"'"+(r.publishesOnMerge?" data-pom='1'":"")+"><div class='rhead'><b>"+esc(r.repo)+"</b><span class='muted'>"+(r.path?"on "+esc(r.branch||'?')+" &middot; "+ch:"repo not found on disk")+"</span></div>";
r.tasks.forEach(function(t){PENDTASKS.push(t);h+="<div class='task' data-id='"+esc(t.id)+"'><span class='t'>"+esc(t.text)+"</span>"+askBtn(t)+"<button class='rm sendback' title='not right - send back to the agent (unticks it)'>&#8630;</button></div>";});
// a run that stopped on questions or a handover: partly done, and what it waits on, in plain words
var pd=r.partly,pq=pd&&pd.questions||0,ph=(pd&&pd.handed)||[];
if(pd)h+="<div class='partly'><b>Partly done:</b> "+esc([pq?pq+" question"+(pq>1?"s":"")+" for you":"",ph.length?ph.map(function(x){return x.lane+" is on “"+x.text+"”";}).join(', '):""].filter(Boolean).join(', and '))+". "+(r.untasked?"The changes so far can be approved now, or once it's finished.":"")+"</div>";
else if(r.untasked)h+="<div class='muted' style='margin:6px 0'>Uncommitted changes with no ticked task behind them. Check the diff before you approve.</div>";
// The repo's open tasks: tick the ones these changes finished, and they're approved with them instead of going out again on the next send.
if(r.untasked&&r.open&&r.open.length){var said=r.open.some(function(o){return o.finished;});h+="<div class='muted' style='margin:6px 0'>Did these changes finish any of "+esc(r.repo)+"'s open tasks? Tick them and they're approved with the changes, so they don't come back as new tasks"+(said?". Ticked already: the run's summary says it finished them.":".")+"</div>";
r.open.forEach(function(o){h+="<label class='idea'><input type='checkbox' class='tickopen' data-id='"+esc(o.id)+"'"+(o.finished?" checked":"")+"><span>"+esc(o.text)+(o.finished?" <span class='tag'>run says done</span>":"")+"</span></label>";});}
if(r.running)h+="<div class='rwork'><i aria-hidden='true'></i>Agent still working: its changes may be half done. Approve unlocks when it finishes.</div>";
// A repo that publishes on merge (ur.npm) is measured from the version npm has,
// and a bump publishes it once merged; otherwise from the last v* tag, tagged by hand.
var ur=r.unreleased;if(ur&&ur.npm)h+="<div class='muted' style='margin:6px 0'><span class='err'>Unreleased:</span> "+(ur.pending?"<code>"+esc(ur.base)+"</code> is at <b>"+esc(ur.pending)+"</b>, which isn't on npm yet. This repo publishes when a version bump merges, so it should appear shortly; if it doesn't, check the publish workflow's run on GitHub.":"<code>"+esc(ur.base)+"</code> has "+ur.ahead+" commit"+(ur.ahead>1?"s":"")+" merged since <b>"+esc(ur.since)+"</b> went to npm. This repo publishes on merge, but only when the version changes, so they wait for the next bump. "+(ur.bump?"These changes bump it to <b>"+esc(ur.bump)+"</b>: it publishes when this PR merges.":r.bumpOffer&&r.files.length?"Approve can bump it in this PR (below), so it publishes when the PR merges.":"Bump the version in a PR to publish them."))+"</div>";
else if(ur)h+="<div class='muted' style='margin:6px 0'><span class='err'>Unreleased:</span> <code>"+esc(ur.base)+"</code> is "+ur.ahead+" commit"+(ur.ahead>1?"s":"")+" past <code>"+esc(ur.tag)+"</code>, so merged work isn't released yet. "+(ur.bump?"These changes bump the version to <b>"+esc(ur.bump)+"</b>: after the PR merges, tag <code>v"+esc(ur.bump)+"</code> on <code>"+esc(ur.base)+"</code> to release it.":r.bumpOffer&&r.files.length?"Approve can bump the version in this PR (below); tag it after the PR merges to release it.":"Bump the version (here or in a later PR) and tag it to release it.")+"</div>";
// The version is already released (its v* tag exists, or npm has it) and these changes keep it:
// Approve bumps it in the PR too, a patch unless you pick otherwise.
var bo=r.bumpOffer;if(bo&&r.files.length)h+="<div class='row' style='margin:6px 0;font-size:12px'><span class='muted'>Version</span><select class='bumpsel' title='bump the version in package.json (and the lockfile) in this PR' style='flex:0 0 auto;width:auto'><option value='patch'>bump to "+esc(bo.patch)+" (patch)</option><option value='minor'>bump to "+esc(bo.minor)+" (minor)</option><option value=''>keep "+esc(bo.version)+"</option></select></div>";
h+="<div class='row ract'>"+(pq&&r.path?"<button class='act answerq' data-path='"+esc(r.path).replace(/'/g,'&#39;')+"'>Answer its question"+(pq>1?"s":"")+"</button>":"")+"<button class='"+(pd?'ghost':'act')+" approve'"+(pd?" data-partly='1'":"")+(r.path&&!r.running?"":" disabled")+(r.running?" title='the agent is still editing this repo'>"+(r.untasked?"Approve changes without a task":"Approve")+" &middot; agent still working":r.untasked?" data-untasked='1' title='commit on a branch, push and open a PR, without a task'>Approve changes without a task &rarr; PR":" title='commit on a branch, push, open a PR, then archive'>Approve &rarr; "+(r.files.length?"PR":"archive"))+"</button>"+(r.files.length?"<button class='ghost showdiff'>Show diff</button>":"")+"<label title='Queue GitHub auto-merge so this PR lands once its CI checks pass. Needs Allow auto-merge on the repo.' style='margin-left:auto;font-size:12px;color:var(--faint);display:flex;align-items:center;gap:6px'><input type='checkbox' class='amtoggle' style='width:auto'"+(r.autoMerge?" checked":"")+"> auto-merge on green CI</label></div><div class='rdiff hidden'></div></div>";});
el.innerHTML=h;
el.querySelectorAll('.rcard').forEach(function(card){var repo=card.getAttribute('data-repo');
card.querySelectorAll('.task').forEach(function(row){wireAsk(row,row.getAttribute('data-id'));});
card.querySelectorAll('.sendback').forEach(function(b){b.addEventListener('click',function(){api('/api/pending/sendback',{id:b.closest('.task').getAttribute('data-id')}).then(loadTasks);});});
var amt=card.querySelector('.amtoggle');if(amt)amt.addEventListener('change',function(){api('/api/automerge',{repo:repo,on:amt.checked});});
var sd=card.querySelector('.showdiff'),pre=card.querySelector('.rdiff');
if(sd)sd.addEventListener('click',function(){if(!pre.classList.contains('hidden')){pre.classList.add('hidden');sd.textContent='Show diff';return;}
pre.textContent='Loading...';pre.classList.remove('hidden');sd.textContent='Hide diff';api('/api/pending/diff?repo='+encodeURIComponent(repo)).then(function(d){pre.textContent=(d&&d.diff)||'(no changes)';});});
var ap=card.querySelector('.approve'),bs=card.querySelector('.bumpsel'),tk=card.querySelectorAll('.tickopen');
function ticks(){var ids=[];tk.forEach(function(c){if(c.checked)ids.push(c.getAttribute('data-id'));});return ids;}
var so=ap&&ap.getAttribute('data-partly'); // partly done: Approve takes what's there so far, the quieter choice
function apLabel(){var n=ticks().length;if(ap&&!ap.disabled)ap.innerHTML=so?"Approve the changes so far"+(n?", with "+n+" finished task"+(n>1?"s":""):"")+" &rarr; PR":n?"Approve changes with "+n+" finished task"+(n>1?"s":"")+" &rarr; PR":"Approve changes without a task &rarr; PR";}
tk.forEach(function(c){c.addEventListener('change',apLabel);});if(tk.length||so)apLabel();
var aq=card.querySelector('.answerq');if(aq)aq.addEventListener('click',function(){lqFocus({kind:'ask',repo:repo,path:aq.getAttribute('data-path')});});
if(ap)ap.addEventListener('click',function(){var tick=ticks();ap.disabled=true;ap.textContent='Committing & pushing...';
api(ap.getAttribute('data-untasked')?'/api/pending/approve-changes':'/api/pending/approve',{repo:repo,bump:bs?bs.value:'',tick:tick}).then(function(r){var o=document.getElementById('reviewout');
if(!r||r.error){ap.disabled=false;ap.textContent='Approve - retry';o.innerHTML="<div class='note err'>"+esc(repo)+": "+esc((r&&r.error)||'failed')+"</div>";return;}
var m="&#10003; <b>"+esc(repo)+"</b>: approved "+(r.approved?r.approved+" task"+(r.approved>1?"s":""):"changes without a task");
if(r.commit)m+=" &middot; committed <code>"+esc(r.commit)+"</code> on <code>"+esc(r.branch)+"</code>";
if(r.pr)m+=" &middot; <a href='"+esc(r.pr)+"' target='_blank' rel='noopener'>open PR</a>";
if(r.bumped&&card.getAttribute('data-pom'))m+="<div class='muted'>Bumps the version to <b>"+esc(r.bumped)+"</b>. It publishes to npm when the PR merges.</div>";
else if(r.bumped)m+="<div class='muted'>Bumps the version to <b>"+esc(r.bumped)+"</b>. After the PR merges, run <code>git pull &amp;&amp; git tag v"+esc(r.bumped)+" &amp;&amp; git push origin --tags</code> on <code>"+esc(r.base||'main')+"</code> to release it.</div>";
if(r.autoMerge==='queued')m+=" &middot; will auto-merge when CI passes";
else if(r.autoMerge==='unavailable')m+="<div class='muted'>auto-merge not enabled for this repo on GitHub (Settings &rarr; General &rarr; Allow auto-merge)"+(r.autoMergeErr?": "+esc(r.autoMergeErr):"")+"</div>";
if(r.note)m+="<div class='muted'>"+esc(r.note)+"</div>";
o.innerHTML="<div class='note ok'>"+m+"</div>";loadTasks();});});});lqLight();});}
function loadArchived(){TARCH=true;lqTitle();var nb=$('needsbox');if(nb)nb.innerHTML='';api('/api/tasks?archived=1').then(function(list){ALLTASKS=list;renderFilter();var el=document.getElementById('tasklist');
if(!list.length){el.innerHTML="<div class='muted' style='margin-top:12px'>Nothing archived yet. Completed tasks land here.</div>";return;}
var h="<div class='tgroup'>Archived <span class='tcount'>"+list.length+"</span></div>";list.forEach(function(t){h+=taskRow(t,true);});el.innerHTML=h;wireTaskRows(el);});}
var agentsTimer=null;
function stopAgentsPoll(){if(agentsTimer){clearTimeout(agentsTimer);agentsTimer=null;}}
function fmtE(ms){var s=Math.floor(ms/1000);if(s<60)return s+'s';var m=Math.floor(s/60);return m+'m '+(s%60)+'s';}
// Questions, options and ideas an agent left in .symbiot/QUESTIONS.md (any
// agent: it's a file). Answers go to .symbiot/ANSWERS.md; "Send & continue"
// re-runs the agent so it picks them up. Text stays out of attributes (esc()
// doesn't escape quotes) — rows carry indexes into AGENTLIST instead.
var AGENTLIST=[],QDRAFT={};
function agentById(id){for(var i=0;i<AGENTLIST.length;i++)if(AGENTLIST[i].id===id)return AGENTLIST[i];return null;}
function nQs(a){return (a.ask&&a.ask.questions)?a.ask.questions.length:0;}
// A question that needs a release shows it next to the installed and npm versions;
// until it's out and installed, an answer saying it's done or tried isn't offered.
var DONEOPT=/^(done|did (it|both|that)|i('ve| have)? (did|done|tried)|tried it|it (worked|works|clicked|looks|landed|opened)|looks right)([^a-z]|$)/i;
function relHtml(rl){return "<div class='qrel"+(rl.waiting?" wait":"")+"'>Needs "+esc(rl.name+" "+rl.needs)+" &middot; installed: "+esc(rl.installed||'none')+" &middot; on npm: "+esc(rl.npm||'unknown')+
(rl.waiting==='npm'?" &middot; not published yet, so this can't be done yet":rl.waiting==='install'?" &middot; "+(rl.name==='symbiot'?"update Symbiot first":"install it first"):"")+"</div>";}
function askHtml(a){var k=a.ask;if(!k)return '';var qs=k.questions||[],ss=k.suggestions||[];if(!qs.length&&!ss.length)return '';
var h="<div class='aq' data-id='"+esc(a.id)+"'>";
if(qs.length){h+="<h4><i class=ic-ask></i> "+qs.length+" question"+(qs.length>1?"s":"")+" for you</h4>";
qs.forEach(function(q,i){var rl=q.release;h+="<div class='q' data-i='"+i+"'><div class='qt'>"+esc(q.q)+"</div>"+(q.context?"<div class='qc'>"+esc(q.context)+"</div>":"")+(rl?relHtml(rl):"");
(q.options||[]).forEach(function(o,j){var off=rl&&rl.waiting&&DONEOPT.test(o);h+="<label class='opt"+(off?" off":"")+"'><input type='radio' name='q_"+esc(a.id)+"_"+i+"' value='"+j+"'"+(off?" disabled":"")+"><span>"+whoHtml(o)+(off?" <i>(once "+esc(rl.name+" "+rl.needs)+" is installed)</i>":"")+"</span></label>";});
h+="<input class='qother' placeholder='"+((q.options&&q.options.length)?"or answer in your own words":"your answer")+"'></div>";});
h+="<div class='row'><button class='act qsend' title='save the answers and hand the repo back to your agent'>Send answers &amp; continue</button><button class='ghost qsave' title='save the answers for the next run'>Save only</button></div>";}
if(ss.length){var shown=IDEASOPEN[a.path]?ss.length:(k.ideasShown||ss.length);h+="<h4><i class=ic-idea></i> Ideas from the agent</h4>";ss.forEach(function(s,i){if(i>=shown)return;h+="<div class='idea'><span style='flex:1'>"+esc(s.text)+(s.other?" <span class='tag' title='this idea is for another project, so + task adds it to that one'>for "+esc(s.repo)+"</span>":"")+"</span>"+(s.added?"<span class='tag'>in Tasks</span>":"<button class='ghost qidea' data-i='"+i+"' style='padding:3px 9px;font-size:12px'>+ task</button><button class='ghost qskip' data-i='"+i+"' title='turn this idea down: the next one moves up, and the agent is told not to suggest it again' style='padding:3px 9px;font-size:12px'>Skip</button>")+"</div>";});
if(ss.length>shown)h+="<div class='row'><button class='ghost qmore' title='the agent ranks its ideas best first: weigh these two before adding more'>"+(ss.length-shown)+" more idea"+(ss.length-shown>1?"s":"")+", ranked lower</button></div>";}
return h+"</div>";}
var IDEASOPEN={};
function qKeyOf(qe){var box=qe.closest('.aq');var a=box&&agentById(box.getAttribute('data-id'));var q=a&&a.ask.questions[+qe.getAttribute('data-i')];return q?a.path+'|'+q.q:'';}
// the typed answer is kept in localStorage too (bdSet, the same key as its blob on Home): a reload or a restart keeps it
if(document.addEventListener)document.addEventListener('input',function(ev){var t=ev.target;if(!t||!t.classList||!t.classList.contains('qother')||!t.closest)return;var qe=t.closest('.aq .q'),k=qe&&qKeyOf(qe);if(k)bdSet(k,t.value,null,null,'desk');});
function saveDrafts(el){el.querySelectorAll('.aq .q').forEach(function(qe){var k=qKeyOf(qe);if(!k)return;var pick=qe.querySelector('input[type=radio]:checked'),t=qe.querySelector('.qother').value;QDRAFT[k]={o:pick?pick.value:'',t:t};if(t||bdAll()[k])bdSet(k,t,null,null,'desk');});}
function restoreDrafts(el){el.querySelectorAll('.aq .q').forEach(function(qe){var k=qKeyOf(qe),d=QDRAFT[k];if(!d&&k){var b=bdAll()[k];if(b&&b.text)d={o:'',t:b.text};}if(!d)return;qe.querySelectorAll('input[type=radio]').forEach(function(r){r.checked=!r.disabled&&r.value===d.o;});qe.querySelector('.qother').value=d.t||'';});}
function collectAnswers(box,a){var out=[];box.querySelectorAll('.q').forEach(function(qe){var q=a.ask.questions[+qe.getAttribute('data-i')];if(!q)return;
var other=(qe.querySelector('.qother').value||'').trim();var pick=qe.querySelector('input[type=radio]:checked');var ans=other||(pick?q.options[+pick.value]:'');if(ans)out.push({q:q.q,a:ans});});return out;}
function wireAsks(el){el.querySelectorAll('.aq').forEach(function(box){var a=agentById(box.getAttribute('data-id'));if(!a||!a.ask)return;
function send(rerun){var msg=document.getElementById('agentsmsg');var ans=collectAnswers(box,a);
if(!ans.length){msg.innerHTML="<div class='note err'>Pick an option or type an answer first.</div>";return;}
box.querySelectorAll('button').forEach(function(b){b.disabled=true;});
api('/api/agents/answer',{path:a.path,answers:ans,rerun:rerun}).then(function(r){
if(!r||r.error){box.querySelectorAll('button').forEach(function(b){b.disabled=false;});msg.innerHTML="<div class='note err'>"+esc((r&&r.error)||'failed')+"</div>";return;}
ans.forEach(function(x){var k=a.path+'|'+x.q;delete QDRAFT[k];bdSet(k,'');}); // sent: its drafts go
msg.innerHTML="<div class='note ok'>&#10003; Saved "+r.saved+" answer"+(r.saved>1?"s":"")+" for <b>"+esc(a.name)+"</b> in .symbiot/ANSWERS.md"+(r.rerun?" &middot; your agent is picking them up now.":".")+(r.yours&&r.yours.length?"<div class='err'><i class=ic-person></i> Still yours to do: "+esc(r.yours.join(' '))+"</div>":"")+(r.note?"<div class='muted'>"+esc(r.note)+"</div>":"")+"</div>";loadAgents();});}
var s1=box.querySelector('.qsend'),s2=box.querySelector('.qsave');
if(s1)s1.addEventListener('click',function(){send(true);});if(s2)s2.addEventListener('click',function(){send(false);});
var more=box.querySelector('.qmore');if(more)more.addEventListener('click',function(){IDEASOPEN[a.path]=true;loadAgents();});
box.querySelectorAll('.qidea').forEach(function(btn){btn.addEventListener('click',function(){var s=a.ask.suggestions[+btn.getAttribute('data-i')];if(!s)return;btn.disabled=true;
var sk=btn.parentNode.querySelector('.qskip');if(sk)sk.remove();
api('/api/tasks/add',{text:s.text,repo:s.repo||a.name}).then(function(){s.added=true;btn.outerHTML="<span class='tag'>in Tasks</span>";});});});
box.querySelectorAll('.qskip').forEach(function(btn){btn.addEventListener('click',function(){var s=a.ask.suggestions[+btn.getAttribute('data-i')];if(!s)return;btn.disabled=true;
api('/api/agents/skip',{path:a.path,text:s.text}).then(function(r){if(!r||r.error){btn.disabled=false;document.getElementById('agentsmsg').innerHTML="<div class='note err'>"+esc((r&&r.error)||'failed')+"</div>";return;}loadAgents();});});});});}
// A step of yours an answer picked (👤 You): the next run waits for it (agents.mjs waitingFor)
function waitHtml(a){var w=a.waiting;if(!w)return '';var fs=(w.files||[]).map(function(f){return "<code>"+esc(f)+"</code>";}).join(" or ");if(w.cmd)fs=(fs?fs+" or ":"")+"the agent command in Settings &rarr; Handoff";
return "<div class='aq'><h4><i class=ic-pause></i> Waiting on your step</h4><div class='qt'><i class=ic-person></i> "+esc(w.step)+"</div><div class='qc'>"+(fs?"Your agent "+(w.rerun?"starts by itself":"can start")+" once "+fs+" changes"+(w.rerun?", while Symbiot runs":"")+". Done it some other way?":"Your agent waits for it, so it doesn't stop on the same questions again.")+" Start it now once it's done.</div><div class='row'><button class='act wstart' data-id='"+esc(a.id)+"'>Start it now</button></div></div>";}
// A run that ended waiting on you (agents.mjs needsOf): your OK for what it would send or
// change, or a step only you can do, with what to check first. Answered as on Home.
function needsHtml(a){var n=a.needs;if(!n||n.waiting)return '';var ok=n.kind==='approve';
return "<div class='aq'><h4><i class=ic-person></i> "+(ok?"Waits for your OK":"Needs you")+"</h4><div class='qt'>"+esc(n.what)+"</div>"+(n.check?"<div class='qc'><b>Check first:</b> "+esc(n.check)+"</div>":"")
+"<div class='row'><button class='act ngo' data-id='"+esc(a.id)+"' title='"+(ok?"its agent goes ahead with it":"its agent checks it worked and carries on")+"'>"+(ok?"Go ahead":"Done it")+"</button><button class='ghost nskip' data-id='"+esc(a.id)+"' title='it stops asking'>Skip</button></div></div>";}
function wireNeeds(el){el.querySelectorAll('.ngo,.nskip').forEach(function(btn){btn.addEventListener('click',function(){var a=agentById(btn.getAttribute('data-id'));if(!a)return;btn.disabled=true;var msg=document.getElementById('agentsmsg');
api('/api/home/answer',{id:'needs:'+a.id,pick:btn.classList.contains('ngo')?0:1}).then(function(r){msg.innerHTML=r&&!r.error?"<div class='note ok'>"+esc(a.name)+": "+esc(r.said||'Done.')+"</div>":"<div class='note err'>"+esc((r&&r.error)||'failed')+"</div>";loadAgents();}).catch(function(e){btn.disabled=false;msg.innerHTML="<div class='note err'>"+esc(String((e&&e.message)||e))+"</div>";});});});}
function wireWaits(el){el.querySelectorAll('.wstart').forEach(function(btn){btn.addEventListener('click',function(){var a=agentById(btn.getAttribute('data-id'));if(!a)return;btn.disabled=true;
api('/api/open',{path:a.path,force:true}).then(function(x){var msg=document.getElementById('agentsmsg');msg.innerHTML=x&&x.opened?"<div class='note ok'>&#10003; Started your agent in <b>"+esc(a.name)+"</b>.</div>":"<div class='note err'>"+esc(a.name)+": "+(x&&x.busy?"an agent is already running there.":x&&x.note?esc(x.note):"it didn&#39;t start. Check the command in Settings.")+"</div>";loadAgents();}).catch(function(e){btn.disabled=false;document.getElementById('agentsmsg').innerHTML="<div class='note err'>"+esc(String((e&&e.message)||e))+"</div>";});});});}
// What a run left for Symbiot's memory (.symbiot/REMEMBER.json, handback.mjs): nothing goes in until Remember
function factsHtml(a){var fs=a.remember;if(!fs||!fs.length)return '';
return "<div class='aq rfacts' data-id='"+esc(a.id)+"'><h4>&#129504; For Symbiot to remember</h4><div class='qc'>This run found "+fs.length+" lasting fact"+(fs.length>1?"s":"")+". Untick any you don&#39;t want, then Remember: every chat can use them from then on.</div>"+
fs.map(function(f,i){return "<label class='opt'><input type='checkbox' class='rfact' value='"+i+"' checked><span><b>"+esc(f.name)+"</b> <span class='muted'>("+esc(f.kind)+")</span>: "+esc(f.fact)+"</span></label>";}).join('')+
"<div class='row'><button class='act rkeep' title='put the ticked facts into what Symbiot remembers'>Remember</button><button class='ghost rskip' title='nothing goes into memory, and this run&#39;s facts aren&#39;t asked about again'>Skip</button></div></div>";}
function wireFacts(el){el.querySelectorAll('.rfacts').forEach(function(box){var a=agentById(box.getAttribute('data-id'));if(!a)return;
function send(skip){var msg=document.getElementById('agentsmsg');var only=[].slice.call(box.querySelectorAll('.rfact:checked')).map(function(c){return +c.value;});
if(!skip&&!only.length){msg.innerHTML="<div class='note err'>Tick at least one, or Skip.</div>";return;}
box.querySelectorAll('button').forEach(function(b){b.disabled=true;});
api('/api/agents/remember',skip?{path:a.path,skip:true}:{path:a.path,only:only}).then(function(r){
if(!r||r.error){box.querySelectorAll('button').forEach(function(b){b.disabled=false;});msg.innerHTML="<div class='note err'>"+esc((r&&r.error)||'failed')+"</div>";return;}
msg.innerHTML=skip?"<div class='note ok'>Skipped what <b>"+esc(a.name)+"</b> found: nothing went into memory.</div>":"<div class='note ok'>&#10003; Remembered "+r.remembered+" new fact"+(r.remembered===1?"":"s")+" from <b>"+esc(r.title||a.name)+"</b>"+(r.remembered<r.of?" (the rest were known already)":"")+".</div>";loadAgents();});}
var k=box.querySelector('.rkeep'),s=box.querySelector('.rskip');if(k)k.addEventListener('click',function(){send(false);});if(s)s.addEventListener('click',function(){send(true);});});}
function answering(){var f=document.activeElement;return !!(f&&f.closest&&f.closest('.aq'));}
// Handovers (lanes.mjs): what one lane's agent handed to another, and where it stands.
var LANEWORD={started:'working on it',held:'queued: that lane is busy',blocked:"didn't start",done:'done, reported back',error:"couldn't hand over"};
function loadLanes(){api('/api/lanes').then(function(d){var el=document.getElementById('laneslist');if(!el||!d)return;var hs=d.handoffs||[];
var row=function(h){
var back=h.result||h.error||(h.note?"It didn't start: "+h.note:''),more=(h.full?"<div>"+esc(h.full)+"</div>":"")+(back?"<div class='tres'>"+esc(back)+"</div>":"");
return "<div class='task'><span class='t'><b>"+esc(h.from)+"</b> &rarr; <b>"+esc(h.to)+"</b>: "+esc(String(h.text||'').split('**').join(''))+(h.n>1?" <span class='muted'>&times;"+h.n+"</span>":"")+(more?"<details class='tfull'><summary>"+(h.full?"in full":"what came back")+"</summary>"+more+"</details>":"")+"</span><span class='rp'"+(h.status==='error'||h.status==='blocked'?" style='color:var(--amber)'":"")+">"+esc(LANEWORD[h.status]||h.status)+"</span></div>";};
var seen={},uniq=[];hs.forEach(function(h){var k=h.from+'|'+h.to+'|'+h.status+'|'+h.text;if(seen[k]){seen[k].n++;return;}var c={};for(var x in h)c[x]=h[x];c.n=1;seen[k]=c;uniq.push(c);});
var live=uniq.filter(function(h){return h.status!=='done';}),fin=uniq.filter(function(h){return h.status==='done';});
whenFree(el,'lanes',function(){sameHtml(el,(live.length?"<div class='tgroup agg'>Handovers under way <span class='tcount'>"+live.length+"</span></div>"+live.slice(0,12).map(row).join(''):'')+(fin.length?"<details class='agdone'><summary class='tgroup agg'>Finished handovers <span class='tcount'>"+fin.length+"</span></summary>"+fin.slice(0,20).map(row).join('')+"</details>":''));});});}

// ---- an agent's work, live (work.mjs parses its stream) ------------------------------
var WKICON={read:"<path d='M2 4h5l1 1h6v8H2z'/>",edit:"<path d='M3 13l1-3 7-7 2 2-7 7z'/>",run:"<path d='M3 5l3 3-3 3M8 12h5'/>",search:"<circle cx='7' cy='7' r='4'/><path d='M10 10l3 3'/>",web:"<circle cx='8' cy='8' r='5.5'/><path d='M2.5 8h11M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11'/>",agent:"<path d='M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z'/>",connector:"<path d='M6 2v4M10 2v4M4 6h8v2a4 4 0 0 1-8 0zM8 12v2'/>",tool:"<circle cx='8' cy='8' r='2.5'/>"};
function wkIcon(k){return "<svg width='14' height='14' viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>"+(WKICON[k]||WKICON.tool)+"</svg>";}
function wkMs(ms){if(ms==null)return '';return ms<1000?ms+'ms':ms<60000?(ms/1000).toFixed(ms<10000?1:0)+'s':Math.round(ms/60000)+'m';}
function wkRing(done,total){var r=15,c=2*Math.PI*r,f=total?done/total:0;return "<svg width='40' height='40' viewBox='0 0 40 40' aria-label='"+done+" of "+total+" tasks done'><defs><linearGradient id='wkg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#FFFFFF'/><stop offset='1' stop-color='#6F7887'/></linearGradient></defs><circle cx='20' cy='20' r='"+r+"' fill='none' stroke='rgba(140,150,166,.25)' stroke-width='4'/><circle cx='20' cy='20' r='"+r+"' fill='none' stroke='url(#wkg)' stroke-width='4' stroke-linecap='round' stroke-dasharray='"+(c*f).toFixed(1)+" "+c.toFixed(1)+"' transform='rotate(-90 20 20)'/><text x='20' y='24' text-anchor='middle' font-size='10' font-weight='700' fill='currentColor'>"+done+"/"+total+"</text></svg>";}
function wkSpark(p){if(!p||p.length<2)return '';var m=Math.max.apply(null,p)||1,w=120,h=26,pts=p.map(function(v,i){return (i*w/(p.length-1)).toFixed(1)+','+(h-2-(v/m)*(h-4)).toFixed(1);}).join(' ');return "<svg width='"+w+"' height='"+h+"' viewBox='0 0 "+w+" "+h+"' aria-label='steps per minute'><polyline points='"+pts+"' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linejoin='round' opacity='.85'/></svg>";}
function workHtml(a){var w=a.work,pg=a.progress,run=a.status==='running',h='';
if(!w){if(run)h+="<div class='bar'><i></i></div>";if(pg)h+="<div class='wkstats'><span class='wkstat'><b>"+pg.done+"/"+pg.total+"</b> tasks ticked</span></div>";return h;}
var stats=[];if(w.model)stats.push("<span class='wkstat'>"+esc(w.model.split('[')[0])+"</span>");stats.push("<span class='wkstat'><b>"+w.count+"</b> step"+(w.count===1?'':'s')+"</span>");
if(w.turns!=null)stats.push("<span class='wkstat'><b>"+w.turns+"</b> turns</span>");if(w.tokens)stats.push("<span class='wkstat'><b>"+(w.tokens>999999?(w.tokens/1e6).toFixed(1)+'M':w.tokens>999?Math.round(w.tokens/1000)+'k':w.tokens)+"</b> tokens</span>");
if(w.cost!=null)stats.push("<span class='wkstat'><b>$"+w.cost.toFixed(2)+"</b></span>");if(w.tests)stats.push("<span class='wktest"+(w.tests.failed?' bad':'')+"'>"+w.tests.passed+" passed &middot; "+w.tests.failed+" failed</span>");if(w.errors)stats.push("<span class='wktest bad'>"+w.errors+" error"+(w.errors>1?'s':'')+"</span>");
if(run&&w.doing)h+="<div class='wkdoing'>"+esc(w.doing)+"&hellip;</div>";
var first=(w.final||'').split(String.fromCharCode(10))[0];if(!run&&first)h+="<div class='wkfinal'>"+esc(first.length>180?first.slice(0,179)+'\u2026':first)+"</div>";
var boxes=[];
if(w.todos&&w.todos.length||pg){var td="<div class='wkbox'><div class='wkh'>"+(pg?wkRing(pg.done,pg.total):'')+"<span>its to-do list</span></div>";
(w.todos||[]).forEach(function(t){td+="<div class='wktodo "+esc(t.status)+"'><i></i><span>"+esc(t.status==='in_progress'?t.active:t.text)+"</span></div>";});
if(!(w.todos||[]).length)td+="<div class='muted' style='font-size:12px'>No list of its own: "+pg.done+" of "+pg.total+" tasks ticked in TASKS.md.</div>";boxes.push(td+"</div>");}
if(w.steps&&w.steps.length){var sp="<div class='wkbox'><div class='wkh'><span>what it did</span><span style='margin-left:auto'>"+wkSpark(w.pace)+"</span></div>";
w.steps.slice(-10).forEach(function(x){sp+="<div class='wkstep "+esc(x.status)+"'>"+wkIcon(x.kind)+"<span class='wt'><b>"+esc(x.verb)+"</b> "+esc(x.target||'')+"</span>"+(x.tests?"<span class='wktest"+(x.tests.failed?' bad':'')+"'>"+x.tests.passed+"&#10003; "+x.tests.failed+"&#10007;</span>":"")+"<span class='wm'>"+(x.status==='running'?'&hellip;':wkMs(x.ms))+"</span></div>";});
if(w.count>10)sp+="<div class='muted' style='font-size:11px;margin-top:4px'>and "+(w.count-10)+" earlier step"+(w.count-10>1?'s':'')+"</div>";boxes.push(sp+"</div>");}
var fs=Object.keys(w.files||{});if(fs.length){var mx=Math.max.apply(null,fs.map(function(f){return w.files[f];}))||1,fb="<div class='wkbox'><div class='wkh'><span>files it changed</span></div>";
fs.sort(function(x,y){return w.files[y]-w.files[x];}).slice(0,8).forEach(function(f){fb+="<div class='wkfile'><span class='fn'>"+esc(f)+"</span><span class='fb'><i style='width:"+Math.round(100*w.files[f]/mx)+"%'></i></span><span class='wm'>"+w.files[f]+"&times;</span></div>";});boxes.push(fb+"</div>");}
var todoBox=boxes.length&&(w.todos&&w.todos.length||pg)?boxes.shift():'';
if(todoBox)h+="<div class='wk'>"+todoBox+"</div>";
h+="<details class='wkraw'><summary>details: steps, files, cost</summary><div class='wkstats'>"+stats.join('')+"</div>"+(boxes.length?"<div class='wk'>"+boxes.join('')+"</div>":"")+(!run&&w.final?"<div class='wkfinal'>"+esc(w.final)+"</div>":"")+"</details>";
return h;}
function loadAgents(){loadLanes();loadParked(agentsDraw);phoneApprovedNote();}
// What was approved from your phone today (phone.mjs), above the agents: it wasn't you at this desk.
function phoneApprovedNote(){var el=$('phoneappr');if(!el)return;var ap=(LQ.home&&LQ.home.phoneApproved)||[];
el.innerHTML=ap.map(function(a){return "<div class='note "+(a.status==='failed'?'err':'ok')+"'>"+(a.status==='failed'?"Approving <b>"+esc(a.repo)+"</b> from "+esc(a.phone)+" failed: "+esc(a.error||''):(a.status==='approving'?"Approving ":"&#10003; Approved ")+"<b>"+esc(a.repo)+"</b> from "+esc(a.phone)+", "+agoTxt(a.at)+(a.pr?" &middot; <a href='"+escQ(a.pr)+"' target='_blank' rel='noopener'>its PR</a>":""))+"</div>";}).join('');}
// Agents, in order: what needs you (a question, a step of yours), what's at work, and
// what's finished, folded away (open stays open across refreshes).
var AGDONEOPEN=false;
function agentGroups(list,fn){var needs=[],run=[],done=[];list.forEach(function(a){if(nQs(a)||a.waiting||a.needs)needs.push(a);else if(a.status==='running')run.push(a);else done.push(a);});
var g=function(t,xs){return xs.length?"<div class='tgroup agg'>"+t+" <span class='tcount'>"+xs.length+"</span></div>"+xs.map(fn).join(''):'';};
return g('Needs you',needs)+g('At work',run)+(done.length?"<details class='agdone'"+(AGDONEOPEN?' open':'')+"><summary class='tgroup agg'>Finished <span class='tcount'>"+done.length+"</span></summary>"+done.map(fn).join('')+"</details>":'');}
function agentsDraw(){api('/api/agents').then(function(list){var el=document.getElementById('agentslist');
if(!list||!list.length){AGENTLIST=[];el.innerHTML="<div class='muted' style='margin-top:12px'>No agents yet. In <b>Tasks</b>, tick ideas and hit <b>Send to repos</b> (with an agent command set in Settings) &mdash; you'll watch it work here.</div>";stopAgentsPoll();return;}
var anyRunning=list.some(function(a){return a.status==='running';});
if(answering()||selIn(el)){stopAgentsPoll();if(anyRunning&&current==='tasks')agentsTimer=setTimeout(loadAgents,2000);else selWait('agents',loadAgents);return;} // don't re-render under someone typing an answer, or selecting text to copy
saveDrafts(el);AGENTLIST=list;
var agentBlock=function(a){var cls=a.status==='running'?'run':(a.status==='done'?'ok':'fail');
var st=a.status==='running'?('working &middot; '+fmtE(a.elapsed)):(esc(a.status)+' &middot; '+fmtE(a.elapsed)+(a.exitCode!=null?' &middot; exit '+a.exitCode:''));
if(a.fromHeld)st+=" &middot; started on the tasks held for the last run";
if(a.earlier)st+=" &middot; "+(a.status==='running'?"started outside this window":"ran before Symbiot last started");
if(a.waiting)st+=" &middot; <span style='color:var(--amber)'>waiting on your step</span>";
if(nQs(a))st+=" &middot; <span style='color:var(--amber)'>needs your answers</span>";
if(a.needs&&!a.needs.waiting)st+=" &middot; <span style='color:var(--amber)'>"+(a.needs.kind==='approve'?"waits for your OK":"needs you")+"</span>";
if(a.remember&&a.remember.length)st+=" &middot; <span style='color:var(--amber)'>found "+a.remember.length+" thing"+(a.remember.length>1?"s":"")+" to remember</span>";
if(a.held!=null){var hn=a.held.length,ht=a.held.map(function(t){return "&bull; "+esc(t).replace(/'/g,'&#39;');}).join('&#10;');
ht+=(hn?'&#10;&#10;':'')+(a.status==='running'?"Sent while this agent was running. They wait in .symbiot/TASKS.next.md, replace TASKS.md when it finishes (keeping its ticks), and an agent starts on them then.":"They wait in .symbiot/TASKS.next.md for the agent running in this folder to finish. After that, an agent starts on them the next time the Tasks tab checks this repo, or send again.");
st+=" &middot; <span style='color:var(--amber);cursor:help' title='"+ht+"'><i class=ic-pause></i> "+(hn?hn+" task"+(hn>1?"s":"")+" held":"tasks held")+"</span>";}
// a repo's run can be parked from here in one click: its tasks start no runs until it's unparked
var pk=!/\\/drafts\\/act-[^/]*$/.test(String(a.path||''))&&a.path,parked=pk&&PARKED.paths.indexOf(a.path)>=0;
if(parked)st+=" &middot; <span style='color:var(--amber)'>parked: no new runs</span>";
var b="<div class='dh'><span class='orb "+cls+"'></span><span class='dn'>"+esc(String(a.name||'').split('**').join('').replace(/^(Agent:\s*)What['’]s needed:\s*/i,'$1'))+"</span><span class='dd'>"+st+"</span>"+(pk?"<button type='button' class='ghost apark' data-on='"+(parked?'0':'1')+"' title='"+(parked?"let its tasks start agent runs again":"stop its tasks starting agent runs, until you unpark it")+"'>"+(parked?'Unpark':'Park')+"</button>":"")+"</div>";
b+=workHtml(a);
var ch=a.changed;
if(ch&&(ch.dirty||ch.stat||(ch.commits&&ch.commits.length))){
  var parts=[];
  if(ch.dirty)parts.push('<b>'+ch.dirty+'</b> file'+(ch.dirty>1?'s':'')+' changed');
  if(ch.stat)parts.push(esc(ch.stat));
  if(parts.length)b+="<div class='changed'>What it did &middot; "+parts.join(' &middot; ')+"</div>";
  if(ch.commits&&ch.commits.length)b+="<div class='commits'>"+ch.commits.map(function(c){return "<div><code>"+esc(c.hash)+"</code> "+esc(c.msg)+"</div>";}).join("")+"</div>";
}else if(a.status==='done'){
  b+="<div class='changed muted'>No file changes detected (the agent may have only planned or asked).</div>";
}
b+=waitHtml(a)+needsHtml(a)+askHtml(a)+factsHtml(a);
b+=a.work?("<details class='wkraw'><summary>what it said, in full</summary><pre class='alogout'>"+esc((a.tail&&a.tail.trim())||'(nothing yet)')+"</pre></details>"):("<pre class='alogout'>"+esc((a.tail&&a.tail.trim())||'(waiting for output…)')+"</pre>");
return "<div class='agent' data-i='"+list.indexOf(a)+"'>"+b+"</div>";};
el.innerHTML=agentGroups(list,agentBlock);var dn=el.querySelector('.agdone');if(dn)dn.addEventListener('toggle',function(){AGDONEOPEN=dn.open;});
el.querySelectorAll('.alogout').forEach(function(p){p.scrollTop=p.scrollHeight;});
restoreDrafts(el);wireAsks(el);wireWaits(el);wireNeeds(el);wireFacts(el);lqLight();
wdJump();
el.querySelectorAll('.apark').forEach(function(btn){btn.addEventListener('click',function(){var g=AGENTLIST[+btn.closest('.agent').getAttribute('data-i')];if(!g)return;btn.disabled=true;lqPark('',btn.getAttribute('data-on')==='1',function(err){btn.disabled=false;$('agentsmsg').innerHTML=err?"<div class='note err'>"+esc(err)+"</div>":'';loadAgents();},g.path);});});
stopAgentsPoll();if(anyRunning&&current==='tasks')agentsTimer=setTimeout(loadAgents,2000);});}
function loadDrift(){var out=document.getElementById('driftout');out.innerHTML="<div class='muted' style='margin-top:12px'>Reading your repos&hellip;</div>";
var ci=document.getElementById('driftci').checked?'1':'0';var ft=document.getElementById('driftfetch').checked?'1':'0';
api('/api/drift?ci='+ci+'&fetch='+ft).then(function(d){driftLoaded=true;var repos=d.repos||[];var risky=repos.filter(function(r){return r.flags.some(function(f){return f.level==='warn';});});
var h="<div class='k' style='margin:10px 0'><b>"+repos.length+"</b> repos &middot; <b>"+risky.length+"</b> with risks"+(d.partial?" &middot; <span class='err'>partial &mdash; the scan hit its time limit</span>":"")+"</div>";
repos.forEach(function(r){if(!r.flags.length)return;var warn=r.flags.some(function(f){return f.level==='warn';});
h+="<div class='drift"+(warn?' risk':'')+"'><div class='dh'><span class='dbead' aria-hidden='true'></span><span class='dn'>"+esc(r.name)+"</span><span class='dd'>"+esc(r.def)+(r.fetchAgeDays!=null&&r.fetchAgeDays>3?" &middot; fetch "+r.fetchAgeDays+"d old":"")+"</span></div><ul>";
r.flags.forEach(function(f){h+="<li class='"+esc(f.level)+"'>"+esc(f.text)+(f.evidence?" <span class='ev'>["+esc(f.evidence)+"]</span>":"")+"</li>";});
h+="</ul></div>";});
var clean=repos.filter(function(r){return !r.flags.length;}).map(function(r){return r.name;});
if(clean.length)h+="<div class='muted' style='margin-top:10px'>clean: "+esc(clean.join(", "))+"</div>";
if(!repos.length)h+="<div class='muted'>No repos found under "+esc(d.base||"your home folder")+".</div>";
out.innerHTML=h;});}
function pushTasksUI(){var o=document.getElementById('pushout');var btn=document.getElementById('pushtasks');btn.disabled=true;
o.innerHTML="<div class='muted' style='margin-top:10px'><span class='dot-c' style='background:var(--amber)'></span> Writing .symbiot/TASKS.md into your repos&hellip;</div>";
api('/api/tasks/push',{type:TFILTER.type||'',repo:TFILTER.repo||''}).then(function(r){
if(r.empty){btn.disabled=false;o.innerHTML="<div class='muted' style='margin-top:10px'>No open tasks to send. Tell Symbiot what to do in the bar at the bottom, or tick ideas in a repo review.</div>";return;}
var n=(r.written||[]).length;var opens=[];
// one line, its paths on hover: the review cards below it stay in view
var h="<div class='drift pushed'><div class='dh'><span class='dot-c'></span><span class='dn'>Sent to "+n+" repo"+(n===1?"":"s")+"</span><span class='dd'>"+(r.written||[]).map(function(w){return "<span title='"+esc(w.file).replace(/'/g,'&#39;')+"'>&#10003; <b>"+esc(w.name)+"</b> ("+w.count+" task"+(w.count===1?"":"s")+(w.held?", <i class=ic-pause></i> held till its running agent finishes":"")+")</span>";}).join(" &middot; ")+"</span></div>";
if(r.unresolved&&r.unresolved.length){var names=r.unresolved.map(function(u){return u.name;}).join(", ");var hasNoRepo=r.unresolved.some(function(u){return u.name==='(no repo)';});h+="<div class='dd' style='margin-top:6px'><i class=ic-warn></i> not sent: "+esc(names)+". "+(hasNoRepo?"Tell Symbiot in the bar at the bottom which project it&#39;s for, so it has somewhere to go.":"That repo isn't in the map &mdash; add its folder in Settings.")+"</div>";}
if(r.handoff&&r.written&&r.written.length){opens=r.written.map(function(w){return api('/api/open',{path:w.path}).then(function(x){if(x&&x.blocked){var d=document.createElement('div');d.className='dd';d.innerHTML="<i class=ic-pause></i> <b>"+esc(w.name)+"</b>: "+esc(x.note)+" <button class='ghost' style='padding:2px 8px;font-size:12px'>Start it anyway</button>";d.querySelector('button').addEventListener('click',function(){this.disabled=true;api('/api/open',{path:w.path,force:true}).then(function(y){d.innerHTML=y&&y.opened?"&#10003; Started an agent in <b>"+esc(w.name)+"</b>.":"<i class=ic-warn></i> <b>"+esc(w.name)+"</b>: "+(y&&y.busy?"an agent is already running there.":y&&y.note?esc(y.note):"it didn&#39;t start. Check the command in Settings.");});});o.appendChild(d);}if(x&&x.busy){var d=document.createElement('div');d.className='dd';d.innerHTML="<i class=ic-warn></i> <b>"+esc(w.name)+"</b> already has an agent running, so another wasn&#39;t started. "+(x.auto?"Its new tasks are held, and an agent starts on them when it finishes.":"Its new tasks are held until it finishes. After that, an agent starts on them the next time this tab checks the repo, or send again.");o.appendChild(d);}}).catch(function(){});});h+="<div class='dd'><i class=ic-bot></i> Handed "+n+" repo"+(n===1?"":"s")+" to your agent &mdash; opening the <b>Agents</b> tab to watch it work&hellip;</div>";setTimeout(function(){setTab('agents');},500);}
else{h+="<div class='dd' style='margin-top:8px'>Set an <b>agent command</b> in Settings to auto-run it on send (and watch it on the Workdesk). For now, tell your agent: <b>“Read .symbiot/TASKS.md and implement the unchecked items.”</b></div>";}
h+="</div>";
o.innerHTML=h;
// re-enable only once every handoff has started (or been refused), so a double click can't send twice
Promise.all(opens).then(function(){btn.disabled=false;});}).catch(function(e){btn.disabled=false;o.innerHTML="<div class='err' style='margin-top:10px'>Couldn&#39;t write tasks: "+esc(String((e&&e.message)||e))+"</div>";});}
// Connectors linked to Claude (claude.ai's Drive, Gmail…) reach Claude runs only: say which, or that this command doesn't get them.
var CONNECTORS=[],LINKCONN=[];
// a site linked in Symbiot (Links) only signs Symbiot's browser in: without Claude's own connector for it, runs have no tools for it
function linkGap(){var off=LINKCONN.filter(function(x){return !x.ready;});if(!off.length)return '';var n=off.map(function(x){return "<b>"+esc(x.name)+"</b>";}).join(' and '),one=off.length===1;
return "&#9993;&#65039; "+n+(one?" is":" are")+" linked in Symbiot, but not "+(off.some(function(x){return x.connector;})?"ready ":"")+"as a Claude connector, so your agent&#39;s runs have no tools for "+(one?"it":"them")+": linking a site here signs Symbiot&#39;s browser in, not Claude. Connect "+n+" in claude.ai &rarr; Settings &rarr; Connectors, and the next run gets "+(one?"it":"them")+" by itself. Until then a run sees only what&#39;s new there (Watch).";}
function renderConnectors(){var el=document.getElementById('agentconnectors'),gap=linkGap();if(!CONNECTORS.length){el.innerHTML=/^\\s*claude\\b/.test(document.getElementById('agentcmd').value)?gap:'';return;}
var nm=function(c){return "<b>"+esc(c.name.replace(/^claude\\.ai\\s+/i,''))+"</b>";},ready=CONNECTORS.filter(function(c){return c.ready;}),wait=CONNECTORS.filter(function(c){return !c.ready;});
var cmd=document.getElementById('agentcmd').value;if(/orca-ide/.test(cmd)&&/claude/.test(cmd)){el.innerHTML="<i class=ic-plug></i> Claude in Orca&#39;s tab asks you before it uses your connectors ("+CONNECTORS.map(nm).join(", ")+").";return;}
if(!/^\\s*claude\\b/.test(cmd)){el.innerHTML="<i class=ic-plug></i> Your Claude connectors ("+CONNECTORS.map(nm).join(", ")+") reach Claude Code runs only. This command isn&#39;t Claude, so its runs can&#39;t use them.";return;}
el.innerHTML=(ready.length?"<i class=ic-plug></i> Your agent&#39;s runs can use "+ready.map(nm).join(", ")+": linked to Claude, so each run allows their tools.":"")+(wait.length?(ready.length?" ":"<i class=ic-plug></i> ")+wait.map(nm).join(", ")+(wait.length===1?" needs":" need")+" authorizing in your claude.ai connector settings first.":"")+(gap?" "+gap:"");}
function loadAgentCfg(){api('/api/agentcfg').then(function(d){document.getElementById('agentcmd').value=d.cmd||'';
CONNECTORS=(d.connectors&&d.connectors.list)||[];LINKCONN=(d.connectors&&d.connectors.links)||[];renderConnectors();
var chips=[];(d.agents||[]).forEach(function(a){chips.push(a);});(d.editors||[]).forEach(function(e){chips.push(e);});
var box=document.getElementById('agentpresets');
if(!chips.length){box.innerHTML="<span class='muted' style='font-size:12px'>Nothing detected on PATH &mdash; type your own command above.</span>";return;}
// Agents leave changes for review; an editor preset only opens the repo, so say so.
var na=(d.agents||[]).length;function chip(c,i){return "<button class='ghost preset' data-i='"+i+"' style='padding:4px 10px;font-size:12px;margin:5px 5px 0 0'>"+esc(c.label)+"</button>";}
var h="<span class='muted' style='font-size:12px'>Detected &mdash; click to use:</span><br>"+chips.slice(0,na).map(chip).join("");
if(chips.length>na)h+="<div class='muted' style='font-size:12px;margin-top:8px'>Editors &mdash; opens only, no review:</div>"+chips.slice(na).map(function(c,i){return chip(c,na+i);}).join("");
box.innerHTML=h;
box.querySelectorAll('.preset').forEach(function(btn){btn.addEventListener('click',function(){document.getElementById('agentcmd').value=chips[+btn.getAttribute('data-i')].tmpl;saveAgent();});});});}
function saveAgent(){renderConnectors();api('/api/agentcmd',{cmd:document.getElementById('agentcmd').value});}
function grant(kind){var i=document.getElementById(kind==='tool'?'granttool':'grantdir');var v=(i.value||'').trim();if(!v)return;var body={};body[kind]=v;api('/api/agent/grant',body).then(function(r){var n=document.getElementById('grantnote');if(!r||r.error){n.className='note err';n.textContent=(r&&r.error)||'could not grant';return;}i.value='';n.className='note ok';n.textContent=(kind==='tool'?'Command allowed':'Folder allowed')+' — the agent can use it on its next run.';if(r.cmd)document.getElementById('agentcmd').value=r.cmd;});}
function loadScanRoots(){api('/api/scanroots').then(function(d){var box=document.getElementById('scanroots');var roots=d.effective||[];
box.innerHTML=roots.map(function(r){var custom=(d.roots||[]).indexOf(r)>=0;return "<div class='task' data-p='"+esc(r)+"'><span class='t' style='font-family:ui-monospace,monospace;font-size:12px'>"+esc(r)+"</span>"+(r===d.home?"<span class='rp'>home</span>":"")+(custom?"<button class='rm rmroot' title='remove'>&times;</button>":"")+"</div>";}).join("")+(!d.searching&&d.searched&&!d.found?"<p class='muted' style='font-size:12px'>The last search found no projects in these folders. I'll keep looking; add a folder if yours is somewhere else.</p>":"");
box.querySelectorAll('.rmroot').forEach(function(btn){btn.addEventListener('click',function(){api('/api/scanroots/remove',{path:btn.closest('.task').getAttribute('data-p')}).then(function(){loadScanRoots();mapLoaded=false;driftLoaded=false;});});});});}
function addRootUI(){var i=document.getElementById('newroot');var v=(i.value||'').trim();if(!v)return;var n=document.getElementById('scanrootnote');
api('/api/scanroots/add',{path:v}).then(function(r){if(r.error){n.innerHTML="<span class='err'>"+esc(r.error)+"</span>";return;}i.value='';n.textContent='Added — the Map/Drift will rescan.';loadScanRoots();mapLoaded=false;driftLoaded=false;});}
// Knowledge folders (knowledge.mjs): what's read in each, its examples, and what
// isn't read yet (Word, PDF, Excel). Clicking one puts it in the boxes to change its examples.
function knowRows(d){var box=$('knowroots');var fs=(d&&d.folders)||[];
box.innerHTML=fs.length?fs.map(function(f){var nr=Object.keys(f.notRead||{}).map(function(k){return f.notRead[k]+' '+k;}).join(', ');
return "<div class='task' data-p='"+esc(f.path)+"' data-x='"+esc((f.examples||[]).join(', '))+"'><span class='t knowedit' style='font-family:ui-monospace,monospace;font-size:12px;cursor:pointer' title='Change its examples'>"+esc(f.path)+"<br><span class='muted' style='font-family:inherit'>"+f.files+" file"+(f.files===1?"":"s")+" read"+(f.cases?" &middot; "+f.cases+" case"+(f.cases===1?"":"s"):"")+(f.items?" &middot; "+f.items+" open item"+(f.items===1?"":"s"):"")+(nr?" &middot; not read yet: "+esc(nr):"")+"</span></span><span class='rp' title='Worked examples: never used as facts'>examples: "+esc((f.examples||[]).join(', ')||'none')+(f.exampleFiles?" ("+f.exampleFiles+")":"")+"</span><button class='rm rmknow' title='remove'>&times;</button></div>";}).join(""):"";
box.querySelectorAll('.rmknow').forEach(function(btn){btn.addEventListener('click',function(){var n=$('knownote');n.textContent='Removing…';api('/api/knowledge/remove',{path:btn.closest('.task').getAttribute('data-p')}).then(function(r){n.textContent=r.error?r.error:'Removed: chats no longer quote it.';knowRows(r.error?d:r);});});});
box.querySelectorAll('.knowedit').forEach(function(s){s.addEventListener('click',function(){var t=s.closest('.task');$('newknow').value=t.getAttribute('data-p');$('newknowex').value=t.getAttribute('data-x')||'none';$('addknow').textContent='Save';$('newknowex').focus();});});}
function loadKnowledge(){api('/api/knowledge').then(knowRows);loadChecks();}
// Checks (checks.mjs): where two of the folders' files disagree (a deadline on
// someone's leave, a customer's renewal date given twice), the most pressing
// first, each with the files to open. Checked again whenever a file changes.
function checksHtml(c){if(!c||!c.folders||!c.folders.length)return '';var cl=c.clashes||[];
var row=function(x){return "<div class='task'><span class='t'>"+(x.severity==='high'?"<b style='color:var(--amber)'>&#9679;</b> ":"")+esc(x.text)+"<div class='muted' style='font-size:12px'>"+(x.files||[]).map(function(f){return "<code>"+esc(f)+"</code>";}).join(' &middot; ')+"</div></span></div>";};
return "<div class='tgroup' style='margin-top:14px"+(cl.length?";color:var(--amber)":"")+"'>Where your files disagree <span class='tcount'>"+cl.length+"</span></div><div class='row' style='margin:2px 0 6px'><span class='muted' style='flex:1;font-size:12.5px'>"+(cl.length?"Two files saying different things: a date on someone&#39;s leave, a holiday or an office day, or a customer&#39;s renewal, price, users or owner told two ways. Examples aren&#39;t checked.":"Nothing disagrees: dates, leave, holidays and customers line up across the files.")+(c.at?" Checked "+agoTxt(c.at)+".":"")+"</span><button type='button' class='ghost' id='checksrun'>Check again</button></div>"+
cl.slice(0,6).map(row).join('')+(cl.length>6?"<details class='tfull'><summary>"+(cl.length-6)+" more</summary>"+cl.slice(6,200).map(row).join('')+"</details>":"");}
function loadChecks(run){var el=$('knowchecks');if(!el)return;if(run)el.innerHTML="<div class='muted' style='margin-top:12px'>Checking&hellip;</div>";
(run?api('/api/knowledge/checks/run',{}):api('/api/knowledge/checks')).then(function(c){el.innerHTML=checksHtml(c);var b=$('checksrun');if(b)b.addEventListener('click',function(){loadChecks(true);});}).catch(function(){});}
function addKnowUI(){var i=$('newknow'),x=$('newknowex');var v=(i.value||'').trim();if(!v)return;var n=$('knownote');n.textContent='Reading it…';
api('/api/knowledge/add',{path:v,examples:(x.value||'').trim()}).then(function(r){if(r.error){n.innerHTML="<span class='err'>"+esc(r.error)+"</span>";return;}i.value='';x.value='';$('addknow').textContent='Add folder';var f=(r.folders||[]).filter(function(y){return y.path===v||y.cite===v;})[0];n.textContent=f?'Read '+f.files+' files'+(f.exampleFiles?', '+f.exampleFiles+' of them examples':'')+'. Chats can quote them now.':'Saved.';knowRows(r);loadChecks(true);});}
// In the Android app (window.SymbiotAndroid): Termux keeps its home folder
// private, so only a Symbiot running there sees those projects. The app can show
// that one instead of its own, from the link Termux opens.
function phoneTermux(){var A=window.SymbiotAndroid,t={};if(A&&A.termux){try{t=JSON.parse(A.termux())||{};}catch(e){}}return t;}
function loadPhone(){var t=phoneTermux();if(!t.installed&&!t.on)return;$('phonebox').classList.remove('hidden');
$('phonenote').innerHTML=t.on?"This window shows the Symbiot running in Termux, so it sees the projects in Termux's home folder and runs your agents there. The app's own Symbiot sees only shared storage.":"Termux keeps its home folder (<code>~</code>) private, so the app's own Symbiot can't see the projects there. Symbiot running in Termux can, and this app can show it. <b>Open Termux</b> copies the command that starts it (it installs Node and Symbiot there first if they're missing). Paste it in Termux, and Termux opens it here.";
var b=$('phonebtn');b.textContent=t.on?"Use the app's own Symbiot":"Open Termux";b.onclick=function(){if(t.on)SymbiotAndroid.builtIn();else SymbiotAndroid.openTermux();};}
// Your phone (phone.mjs). On the computer: switch it on and it shows a QR (and a code)
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
h+="<div class='note muted'>Its tasks, what needs you and its agents&rsquo; questions are on Home, in <b>On "+esc(d.name)+"</b>: tick, add, answer and approve from there. While Symbiot runs on this phone it asks every 2 minutes (and as soon as this phone&rsquo;s network changes), and shows what Watch found there as a notification.</div>";}
else{if(d.old)h+="<div class='note err'>"+esc(d.error||'')+"</div>";
h+="<div class='note muted' style='margin-top:2px'>"+(window.SymbiotAndroid?"<b>Scan the code your computer shows:</b> in Symbiot on your computer, open Settings &rarr; <b>Your phone</b> and switch it on. Point this phone&rsquo;s camera at the QR, and tap its link. Or type its address and code here:":"In Symbiot on your computer, open Settings &rarr; <b>Your phone</b> and switch it on: it shows its address and a 6-digit code. Type both here.")+"</div>"+
"<div class='row'><input id='paddr' placeholder='your computer&rsquo;s address, e.g. 192.168.8.50:7392' style='flex:1'><input id='pcode' placeholder='code' inputmode='numeric' style='flex:0 0 90px'><button class='act' id='ppair'>Pair</button></div>"+
"<div class='row' style='margin-top:4px'><button class='ghost' id='pfind'>Look for it on this network</button></div><div id='pfound' class='pcfound'></div>";}
if(!d.notify)h+="<div class='note err'>Notifications from Termux need the Termux:API app: install it, then run <b>pkg install termux-api</b> in Termux.</div>";}
else{h+="<label class='check'><input type='checkbox' id='plinkon'"+(d.on?" checked":"")+"> Let the Symbiot app on my phone show my work here, and send back what I do on it</label>";
if(d.on&&d.error)h+="<div class='note err'>"+esc(d.error)+"</div>";
else if(d.on&&d.listening){h+=d.code&&d.qr?phoneQr(d,"Settings &rarr; <b>Your phone</b>"):"<div class='row' style='margin-top:4px'><button class='ghost' id='pnewcode'>Pair a phone</button></div>";
h+=(d.phones||[]).map(function(p){return "<div class='task' data-id='"+escQ(p.id)+"'><span class='t'>"+esc(p.name)+" <span class='muted' style='font-size:12px'>paired "+agoTxt(p.added)+" &middot; "+phoneSeen(p)+"</span></span><button class='rm punpair' title='unpair it: it gets nothing more, and what it queued (an approve too) is refused'>&times;</button></div>";}).join('');
var rl=d.relay||{};if((d.phones||[]).length)h+="<label class='check'><input type='checkbox' id='prelay'"+(rl.on!==false?" checked":"")+"> Away from home too, through symbiot.co.za</label><div class='note muted' style='margin-top:0'>"+(rl.on===false?"Off: your phone reaches this computer only on your Wi-Fi.":rl.connected?"Connected. Away from home, what your phone and this computer send each other passes through symbiot.co.za, sealed: it can&rsquo;t read it, and keeps none of it. At home nothing goes through it.":"Not connected yet"+(rl.error?": "+esc(rl.error):"")+". Away from home, what they send passes through symbiot.co.za, sealed: it can&rsquo;t read it.")+"</div>";}
h+="<div class='note muted'>"+(d.on?"Symbiot listens on port "+d.port+" of your network for this alone: pairing, then sealed requests from a phone that paired. Everything between them is encrypted with a key the two agree when they pair, and a phone can only add and tick tasks, answer your agents and approve. The rest of Symbiot stays on this computer. Pairing fails? A firewall here may need to allow port "+d.port+".":"Your tasks, what needs you, your agents&rsquo; questions and what Watch finds, on your phone through the Symbiot app there: tick, add, answer and approve from it, sealed between the two.")+"</div>";}
if(msg)h+="<div class='note "+(msg.ok?"ok":"err")+"'>"+esc(msg.text)+"</div>";
box.innerHTML=h;
var on=$('plinkon');if(on)on.addEventListener('change',function(){on.disabled=true;api('/api/phone/link',{on:on.checked}).then(function(x){renderPhoneLink(x);});});
var rlb=$('prelay');if(rlb)rlb.addEventListener('change',function(){rlb.disabled=true;api('/api/phone/relay',{on:rlb.checked}).then(function(x){renderPhoneLink(x);});});
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
function renderComputer(){var d=PCV,el=$('pcbody'),ln=$('pcline');if(!el||!ln)return;
if(d&&d.name&&LQNAMES.computer!=='On '+d.name){LQNAMES.computer='On '+d.name;lqTitle();}
if(!d||d.role!=='phone'||!d.paired||d.old){ln.innerHTML=d&&d.old?"<b>"+esc(d.error||'')+"</b>":'';el.innerHTML="<div class='note muted'>"+(d&&d.role==='computer'?"This is your computer: your phone shows this, there.":"Not paired with a computer yet.")+" <button class='ghost' id='pcsettings'>Your phone, in Settings</button></div>";var g=$('pcsettings');if(g)g.addEventListener('click',function(){lqFocus({kind:'setup',focus:'phone'});lqPool('settings');});return;}
var c=d.copy,wait=d.queued?" &middot; "+d.queued+" change"+(d.queued>1?"s":"")+" waiting to send":"";
ln.innerHTML=d.away?"<b>"+esc(d.name)+" is out of reach.</b> Showing what it sent "+(d.heard?"at "+esc(pcTime(d.heard)):"last")+"."+wait:(c?"From "+esc(d.name)+", "+(d.heard?agoTxt(d.heard):"just now")+(d.via==='relay'?" through the relay":"")+"."+wait:"Asking "+esc(d.name)+" for its work&hellip;");
if(!c){el.innerHTML="<div class='row'><button class='ghost' id='pcnow'>Ask it now</button></div>";var n0=$('pcnow');if(n0)n0.addEventListener('click',function(){n0.disabled=true;api('/api/phone/check',{}).then(loadComputer);});return;}
var h='',W="<span class='pcwait'> waiting to send</span>";
(c.notes||[]).forEach(function(n){h+="<div class='task' data-note='"+escQ(n.id)+"'><span class='t err'>"+esc(n.error)+(n.what?" <span class='muted'>("+esc(n.what)+")</span>":"")+"</span><button class='ghost pcnote'>OK</button></div>";});
var asks=c.asks||[],aps=c.approves||[],needs=c.needs||[];
if(asks.length||aps.length||needs.length){h+="<div class='mkneeds lit'><div class='pshead'><span>Needs you &middot; "+(asks.length+aps.length+needs.length)+"</span><small>on "+esc(d.name)+"</small></div>";
asks.forEach(function(a,i){var q=(a.questions||[])[0]||{};h+="<div class='pcq' data-ask='"+i+"'><div class='qn'>"+esc(a.name)+" asks"+((a.questions||[]).length>1?" &middot; 1 of "+a.questions.length:"")+"</div><div class='qq'>"+esc(q.q||'')+"</div>"+
(a.waiting?"<div class='note' style='margin:0'>You answered: "+esc((a.answered||[])[0]||'')+W+"</div>":"<div class='opts'>"+(q.options||[]).map(function(o,j){return "<button class='"+(j?'ghost':'act')+" pcopt' data-j='"+j+"'>"+esc(o)+"</button>";}).join('')+"</div><form class='pcown'><input placeholder='Or say it in your own words' maxlength='2000'><button class='ghost' type='submit'>Send</button></form>")+"</div>";});
aps.forEach(function(a,i){h+="<div class='pcq' data-ap='"+i+"'><div class='qn'>"+esc(a.repo)+" &middot; waiting for your Approve</div><div class='qq'>"+(a.tasks.length?a.tasks.length+" task"+(a.tasks.length>1?"s":"")+" done":"Changes without a task")+" &middot; <span class='muted'>"+esc(a.stat||(a.files+" file"+(a.files===1?"":"s")+" changed"))+"</span></div>"+(a.tasks.length?"<ul>"+a.tasks.map(function(t){return "<li>"+esc(t.text)+"</li>";}).join('')+"</ul>":"")+
(a.waiting?"<div class='note' style='margin:0'>Approved here"+W+"</div>":"<div class='row' style='margin:0'><button class='act pcapprove'>Approve</button><span class='muted' style='font-size:12px'>exactly this: if the work changes before your computer gets it, it isn&rsquo;t approved</span></div>")+"</div>";});
needs.forEach(function(n){h+="<div class='task'><span class='t'>"+esc(n.title)+" <span class='muted' style='font-size:12px'>"+esc(n.sub)+" &middot; on your computer</span></span></div>";});
h+="</div>";}
(c.recent||[]).slice(-3).forEach(function(r){h+="<div class='note "+(r.status==='failed'?'err':'ok')+"'>"+(r.status==='approving'?"Approving "+esc(r.repo)+" (from "+esc(r.phone)+")&hellip;":r.status==='failed'?"Approving "+esc(r.repo)+" from "+esc(r.phone)+" failed: "+esc(r.error||''):"&#10003; "+esc(r.repo)+" approved from "+esc(r.phone)+(r.pr?" &middot; <a href='"+escQ(r.pr)+"' target='_blank' rel='noopener'>its PR</a>":""))+"</div>";});
var open=(c.tasks||[]).filter(function(t){return !t.done;}),done=(c.tasks||[]).filter(function(t){return t.done;}),repos=[];(c.tasks||[]).forEach(function(t){if(t.repo&&repos.indexOf(t.repo)<0)repos.push(t.repo);});
h+="<div class='pshead' style='margin-top:14px'><span>Tasks &middot; "+open.length+" open</span><small>on "+esc(d.name)+"</small></div>";
h+="<form class='pcadd'><input id='pctask' placeholder='Add a task' maxlength='4000' autocomplete='off'><select id='pcrepo' aria-label='Which project'><option value=''>No project</option>"+repos.sort().map(function(r){return "<option value='"+escQ(r)+"'>"+esc(r)+"</option>";}).join('')+"</select><button class='act' type='submit'>Add</button></form>";
h+=open.concat(done.slice(0,8)).map(function(t){return "<div class='task"+(t.done?" done":"")+"' data-id='"+escQ(t.id)+"'><input type='checkbox' class='pctick'"+(t.done?" checked":"")+(String(t.id).indexOf('q:')===0?" disabled":"")+" aria-label='done'><span class='t'>"+esc(t.text)+(t.repo?" <span class='rp'>"+esc(t.repo)+"</span>":"")+(t.review?" <span class='muted' style='font-size:11px'>done by its agent, waits for your Approve</span>":"")+(t.waiting?W:"")+"</span></div>";}).join('');
if((c.watch||[]).length)h+="<div class='pshead' style='margin-top:14px'><span>What Watch found</span><small>on "+esc(d.name)+", today</small></div>"+c.watch.map(function(w){return "<div class='task'><span class='t'><b>"+esc(w.name)+"</b> <span class='muted' style='font-size:12px'>"+esc(w.label)+"</span>"+(w.items||[]).map(function(i){return "<br><span style='font-size:13px'>"+esc(i.text)+"</span>";}).join('')+"</span></div>";}).join('');
var typed=$('pctask')?[$('pctask').value,$('pcrepo').value,document.activeElement&&document.activeElement.id]:null;
el.innerHTML=h;if(typed){$('pctask').value=typed[0]||'';$('pcrepo').value=typed[1]||'';if(typed[2]==='pctask')$('pctask').focus();}
el.querySelectorAll('.pcnote').forEach(function(b){b.addEventListener('click',function(){api('/api/phone/note',{id:b.closest('.task').getAttribute('data-note')}).then(function(x){PCV=x;renderComputer();});});});
el.querySelectorAll('.pcq[data-ask]').forEach(function(box){var a=asks[+box.getAttribute('data-ask')],q=(a.questions||[])[0]||{};if(a.waiting)return;
var send=function(t){if(!t)return;pcDo('agent.answer',{path:a.path,answers:[{q:q.q,a:t}]});};
box.querySelectorAll('.pcopt').forEach(function(b){b.addEventListener('click',function(){send((q.options||[])[+b.getAttribute('data-j')]);});});
var f=box.querySelector('form');if(f)f.addEventListener('submit',function(ev){ev.preventDefault();send(f.querySelector('input').value.trim());});});
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
function escQ(t){return esc(t).replace(/'/g,'&#39;');}
// Connections: a column per kind of site; each site a bead in the look: solid when
// linked, amber when it wants you to sign in, hollow when it isn't linked. Link,
// check (↻) and Unlink show on hover (always on touch).
// The plug marks the sites your agent's runs can use too, before you link them: only
// those Claude has a connector for, and only with Claude Code as your agent (agents.mjs
// linkReach). Faint until you've connected it in claude.ai.
function reachOf(d,id){var r=d.reach,s=r&&r.claude&&r.sites&&r.sites[id];return s||null;}
function linksHtml(d,board){var anyR=d.items.some(function(it){return reachOf(d,it.id);});
var h="<div class='cxh'><span>Connections</span><small>"+(d.linked?"What Symbiot watches for you. Link more to see what arrives there, here and in Week and Standup.":"Link your work to see what arrives there, here and in Week and Standup.")+"</small>"
+(anyR?"<small class='cxlg'><i class='ic-plug cxa ready' aria-hidden='true'></i> your agent&#39;s runs can use it too, through Claude&#39;s connector for it <span class='cxlgf'><i class='ic-plug cxa' aria-hidden='true'></i> faint: once you connect it in claude.ai (Settings &rarr; Connectors)</span></small>":"")+"</div>";
if(d.error)h+="<div class='note err'>"+esc(d.error)+"</div>";
h+="<div class='cxg'>"+d.groups.map(function(g){return "<div class='cxc'><div class='cxl'>"+esc(g)+"</div>"+d.items.filter(function(x){return x.group===g;}).map(function(it){var on=it.state!=='off';
var rc=reachOf(d,it.id),rt=rc?(rc.ready?" Your agent's runs can use it too, through Claude's "+rc.connector.replace(/^claude\.ai\s+/i,'')+" connector.":" Your agent's runs can use it too once you connect "+rc.name+" in claude.ai → Settings → Connectors (only you can sign in there)."):'';
return "<div class='lnk cx "+escQ(it.state)+"' data-id='"+escQ(it.id)+"'><button type='button' class='lbtn' title='"+escQ(String(it.note||(on?'open '+it.url+' to sign in again':'sign in at '+it.url+' and link it')).replace(/\.?\s*$/,rt?'.':'')+rt)+"'><span class='cxb' aria-hidden='true'></span><span class='cxn'>"+esc(it.name)+"</span>"+(rc?"<i class='ic-plug cxa"+(rc.ready?" ready":"")+"' role='img' aria-label='"+escQ(rc.ready?"agent runs can use it too":"agent runs can use it once connected in claude.ai")+"'></i>":"")+"<span class='cxs'>"+(on?esc(LINKWORD[it.state]||''):'Link')+"</span></button>"+
(on?"<button type='button' class='lmore' title='check it now' aria-label='Check "+escQ(it.name)+" now'>&#8635;</button><button type='button' class='lrm' title='unlink: stop watching it and stop trusting it'>Unlink</button>":"")+"</div>";}).join('')+"</div>";}).join('')+"</div>";return h;}
function linksOut(html){var o=document.getElementById('linksmsg');if(o)o.innerHTML=html;var b=document.getElementById('boardmsg');if(b&&LINKS&&!LINKS.linked)b.innerHTML=html;}
function sbOpen(url){api('/api/browser/open',url?{url:url}:{}).then(function(r){if(r&&r.error)linksOut("<div class='note err'>"+esc(r.error)+"</div>");}).catch(function(){});}
function renderLinks(){if(!LINKS)return;['links','boardlinks'].forEach(function(id){var el=document.getElementById(id);if(!el)return;
el.innerHTML=linksHtml(LINKS,id==='boardlinks');
el.querySelectorAll('.lnk').forEach(function(sp){var lid=sp.getAttribute('data-id'),nm=sp.querySelector('.cxn'),name=nm?nm.textContent:sp.querySelector('.lbtn').textContent;
sp.querySelector('.lbtn').addEventListener('click',function(){linksOut("<div class='note muted'>Opening "+esc(name)+"&hellip;</div>");
api('/api/links/link',{id:lid}).then(function(r){if(!r||r.error){linksOut("<div class='note err'>"+esc(name)+": "+esc((r&&r.error)||'failed')+"</div>");loadLinks();return;}
linksOut("<div class='note ok'>Opened the Symbiot Browser with "+esc(name)+". Sign in there as you normally do, then click Done in the Symbiot Browser: Symbiot checks it within a minute.</div>");loadLinks();
[20000,60000,120000].forEach(function(ms){setTimeout(loadLinks,ms);});});});
var m=sp.querySelector('.lmore');if(m)m.addEventListener('click',function(){m.disabled=true;api('/api/links/check',{id:lid}).then(function(r){m.disabled=false;
if(r&&r.busy)linksOut("<div class='note muted'>The Symbiot Browser is open. Click Done in it when you’ve signed in, then check again.</div>");else if(r&&r.error)linksOut("<div class='note err'>"+esc(r.error)+"</div>");loadLinks();loadBoard();});});
var x=sp.querySelector('.lrm');if(x)x.addEventListener('click',function(){api('/api/links/unlink',{id:lid}).then(function(){linksOut('');loadLinks();loadTrusted();loadBoard();});});});});}
// What Symbiot remembers (mind.mjs): a row per thing, with what it knows; × forgets one.
function loadMind(){api('/api/mind').then(function(d){var el=document.getElementById('mindlist');if(!el||!d)return;var ns=d.nodes||[];
el.innerHTML=ns.length?ns.slice(0,60).map(function(n){return "<div class='task' data-id='"+escQ(n.id)+"'><span class='t'><b>"+esc(n.name)+"</b> <span class='muted' style='font-size:11px'>"+esc(n.kind)+"</span><br><span class='muted' style='font-size:12px'>"+esc(n.facts.join(' · '))+"</span></span><button class='rm forgetone' title='forget this'>&times;</button></div>";}).join('')+"<div class='row' style='margin-top:8px'><button class='ghost' id='forgetall'>Forget everything</button></div>":"<div class='muted' style='font-size:12px;margin-top:6px'>Nothing yet. It fills in as you talk to Symbiot on the Dashboard and in Tasks.</div>";
el.querySelectorAll('.forgetone').forEach(function(b){b.addEventListener('click',function(){api('/api/mind/forget',{id:b.closest('.task').getAttribute('data-id')}).then(loadMind);});});
var fa=document.getElementById('forgetall');if(fa)fa.addEventListener('click',function(){api('/api/mind/forget',{id:'all'}).then(loadMind);});});}
function loadLinks(){api('/api/links').then(function(d){if(d&&d.items){LINKS=d;renderLinks();}});}
// Sign in to a site for agents: the Symbiot Browser opens on it (links.mjs addSite:
// added under Connections → Your sites, trusted, checked once you click Done there).
// From Settings, a trusted site, a card or a reply that asks you to sign in. s: { site } or { id }.
function signInSaid(nm){return 'Opened the Symbiot Browser with '+nm+'. Sign in there as you normally do, then click Done in the Symbiot Browser: Settings → Connections shows when it’s signed in.';}
function openSignIn(s,say){if(!s||(!s.site&&!s.id))return;api('/api/links/site',s.id?{id:s.id}:{site:s.site}).then(function(r){var nm=(r&&r.item&&r.item.name)||s.name||s.site||'it';
if(!r||r.error){say(nm+': '+((r&&r.error)||'it didn’t open'),false);return;}say(signInSaid(nm),true);loadLinks();loadTrusted();[20000,60000,120000].forEach(function(ms){setTimeout(loadLinks,ms);});}).catch(function(e){say(String((e&&e.message)||e),false);});}
function addSiteUI(){var i=document.getElementById('addsite'),v=((i&&i.value)||'').trim();if(!v)return;openSignIn({site:v},function(t,ok){if(ok)i.value='';linksOut("<div class='note "+(ok?'ok':'err')+"'>"+esc(t)+"</div>");});}
// Trusted sites: where Screens' Press and Type don't ask first (headless.mjs).
function loadTrusted(){api('/api/screens/trusted').then(function(d){var box=document.getElementById('trustedsites');var sites=(d&&d.sites)||[];
box.innerHTML=sites.length?sites.map(function(h){return "<div class='task' data-h='"+esc(h)+"'><span class='t' style='font-family:ui-monospace,monospace;font-size:12px'>"+esc(h)+"</span><button class='ghost tsign' title='open "+esc(h)+" in the Symbiot Browser, to sign in for agents'>Sign in</button><button class='rm rmtrusted' title='stop trusting it: press and type ask first again'>&times;</button></div>";}).join(""):"<div class='muted' style='font-size:12px'>None yet: Press and Type ask first on every site.</div>";
box.querySelectorAll('.tsign').forEach(function(btn){btn.addEventListener('click',function(){var h=btn.closest('.task').getAttribute('data-h');openSignIn({site:h},function(t,ok){var n=document.getElementById('trustednote');if(n)n.innerHTML="<span class='"+(ok?'ok':'err')+"'>"+esc(t)+"</span>";});});});
box.querySelectorAll('.rmtrusted').forEach(function(btn){btn.addEventListener('click',function(){api('/api/screens/trusted/remove',{site:btn.closest('.task').getAttribute('data-h')}).then(function(){loadTrusted();loadScreensUI();});});});});}
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
function selectNode(id){sel=id;render();updateBar(id);var n=nodeById(id);api('/api/node?id='+encodeURIComponent(id)).then(showDetail);
if(n&&n.type==='repo'&&n.meta&&n.meta.path){loadReview(n.label,n.meta.path);}else{hideReview();}}
function screenToGraph(el,ev){var rc=el.getBoundingClientRect();var mx=(ev.clientX-rc.left)/rc.width*GW;var my=(ev.clientY-rc.top)/rc.height*GH;return {x:(mx-view.x)/view.k,y:(my-view.y)/view.k};}
function initGraphEvents(){var el=document.getElementById('graph');var mode=null,moved=0,sx=0,sy=0,ox=0,oy=0,downId=null,dnode=null;
function nodeAt(ev){var t=ev.target;var g=t&&t.closest?t.closest('.node'):null;return g?g.getAttribute('data-id'):null;}
el.addEventListener('wheel',function(ev){ev.preventDefault();if(!GRAPH)return;var rc=el.getBoundingClientRect();var mx=(ev.clientX-rc.left)/rc.width*GW;var my=(ev.clientY-rc.top)/rc.height*GH;var nk=Math.max(0.3,Math.min(4,view.k*(ev.deltaY<0?1.12:0.89)));view.x=mx-(mx-view.x)*(nk/view.k);view.y=my-(my-view.y)*(nk/view.k);view.k=nk;render();},{passive:false});
el.addEventListener('pointerdown',function(ev){if(!GRAPH)return;moved=0;sx=ev.clientX;sy=ev.clientY;ox=view.x;oy=view.y;downId=nodeAt(ev);if(downId){mode='node';dnode=nodeById(downId);}else{mode='pan';}try{el.setPointerCapture(ev.pointerId);}catch(e){}});
el.addEventListener('pointermove',function(ev){
if(!mode){updateBar(nodeAt(ev));return;}
var dx=ev.clientX-sx,dy=ev.clientY-sy;moved+=Math.abs(dx)+Math.abs(dy);if(moved<4)return;
if(mode==='node'&&dnode){var p=screenToGraph(el,ev);dnode.x=p.x;dnode.y=p.y;render();}
else if(mode==='pan'){var rc=el.getBoundingClientRect();view.x=ox+dx/rc.width*GW;view.y=oy+dy/rc.height*GH;render();}});
el.addEventListener('pointerup',function(ev){var id=downId,wasClick=moved<6;mode=null;dnode=null;downId=null;
if(id){selectNode(id);}else if(wasClick){sel=null;hideDetail();hideReview();render();updateBar(null);}});
el.addEventListener('mouseleave',function(){if(!mode)updateBar(null);}); }
function scanLine(s){return 'Mapping your work… '+s.phase+(s.total?' '+s.done+'/'+s.total:'')+(s.item?' · '+s.item:'')+' · '+Math.round((s.elapsed||0)/1000)+'s';}
function loadMap(){var p=document.getElementById("profile");p.textContent="Mapping your work...";document.getElementById("graph").innerHTML="";sel=null;hideDetail();hideReview();var done=false;
function poll(){if(done)return;api('/api/scan').then(function(s){if(done)return;if(s&&s.active&&s.phase)p.textContent=scanLine(s);setTimeout(poll,600);}).catch(function(){});}
setTimeout(poll,400);
api("/api/map").then(function(g){done=true;mapLoaded=true;if(!g.nodes||!g.nodes.length){p.textContent="No git repositories found under your home folder.";return;}GRAPH=g;layout(g.nodes,g.edges);lmBuild(g);view={k:1,x:0,y:0};p.innerHTML=profileLine(g)+(g.stats&&g.stats.partial?" &middot; <span class='err'>partial &mdash; the scan hit its time limit</span>":"");var af=$('allowfiles');if(af)af.addEventListener('click',function(){SymbiotAndroid.storage();});var ut=$('usetermux');if(ut)ut.addEventListener('click',function(){SymbiotAndroid.openTermux();});render();});}
// The Android app calls this when you come back having allowed file access, so
// the map rescans instead of staying empty.
window.symbiotStorageGranted=function(){if(current==='map')loadMap();else mapLoaded=false;};
// Screens: a screenshot plus named regions, the blueprint (screens.mjs). Drag on
// the image to mark a region; coordinates are the screenshot's own pixels.
// Names stay out of attributes (esc() doesn't escape quotes): rows carry indexes.
var SCREENS=[],SCREEN=null,SDRAG=null,SPEND=null,SCLICKDELAY=3,STYPEENTER=true,MONITORS=[],SWHICH=[];
// With several displays, Capture asks which: each one as its own screen, one of
// them, or (not on macOS) all of them in one image. The choice is remembered.
function loadMonitorsUI(){api('/api/screens/monitors').then(function(x){MONITORS=(x&&x.monitors)||[];var sel=$('screenwhich');
if(MONITORS.length<2){SWHICH=[];sel.innerHTML='';sel.classList.add('hidden');renderScreen();return;}
SWHICH=[['each','each display']].concat(MONITORS.map(function(m){return [m.name,esc(m.name)+(m.where?' ('+esc(m.where)+')':'')+' only &middot; '+m.w+'&times;'+m.h];}));if(!x||x.whole!==false)SWHICH.push(['all','all displays in one image']);
var saved='',at=0;try{saved=localStorage.getItem('symbiot_screenwhich')||'';}catch(e){}SWHICH.forEach(function(o,i){if(o[0]===saved)at=i;});
sel.innerHTML=SWHICH.map(function(o,i){return "<option value='"+i+"'>"+o[1]+"</option>";}).join('');sel.value=String(at);sel.classList.remove('hidden');renderScreen();});}
function screenWhich(){var sel=$('screenwhich'),o=SWHICH[+sel.value];return (!sel.classList.contains('hidden')&&o)?o[0]:'all';}
function loadScreensUI(){api('/api/screens').then(function(list){SCREENS=list||[];var id=SCREEN&&SCREEN.id;SCREEN=null;SCREENS.forEach(function(s){if(s.id===id)SCREEN=s;});renderScreenList();renderScreen();});}
function renderScreenList(){var box=$('screenlist');if(!SCREENS.length){box.innerHTML="<span class='muted' style='font-size:12px'>No screens yet.</span>";return;}
box.innerHTML="<span class='fl'>Screens</span>"+SCREENS.map(function(s,i){return "<button class='fchip"+(SCREEN&&SCREEN.id===s.id?" on":"")+"' data-i='"+i+"'>"+esc(s.name)+" <span class='tcount'>"+(s.regions||[]).length+"</span></button>";}).join('');
box.querySelectorAll('.fchip').forEach(function(b){b.addEventListener('click',function(){var s=SCREENS[+b.getAttribute('data-i')];SCREEN=(SCREEN&&s&&SCREEN.id===s.id)?null:s;SPEND=null;renderScreenList();renderScreen();});});}
function scrPct(v,of){return (v/of*100).toFixed(3)+'%';}
function scrBox(r,s,cls){return "<div class='scrbox"+(cls?" "+cls:"")+"' style='left:"+scrPct(r.x,s.w)+";top:"+scrPct(r.y,s.h)+";width:"+scrPct(r.w,s.w)+";height:"+scrPct(r.h,s.h)+"'>"+(r.label?"<span>"+esc(r.label)+"</span>":"")+"</div>";}
function renderScreen(){var v=$('screenview'),s=SCREEN;if(!s){v.innerHTML='';return;}
var h="<div class='row' style='margin-top:10px'><input id='scrname' title='rename this screen' style='flex:1'><span class='muted'>"+(s.monitor?esc(s.monitor.name)+(s.monitor.where?" ("+esc(s.monitor.where)+")":"")+" &middot; ":"")+s.w+" &times; "+s.h+" px</span>"+(s.page?"<button class='ghost' id='scrremap' title='open this page in the hidden browser again and map it as it is now'>Map again</button>"+(watchOf(s)?"<button class='ghost' id='scrwatch' title='Symbiot reads this page every few minutes and tells you what&#39;s new: click to stop'>Watching &#10003;</button>":"<button class='ghost' id='scrwatch' title='read this page again every few minutes while Symbiot runs, and tell me what&#39;s new on it'>Watch</button>"):"")+(!s.monitor&&!s.page&&MONITORS.length>1?"<button class='ghost' id='scrsplit' title='cut this screenshot into one screen per display, regions included (this one stays)'>Split by display</button>":"")+"<button class='ghost' id='scrcopy' title='copy the regions and their coordinates as JSON'>Copy blueprint</button><button class='ghost' id='scrdel'>Delete</button></div>";
// a page taller than its window: where this screen is on it, and Scroll to map the rest
var sc=s.page&&s.page.scroll,up=sc&&sc.y>0,down=sc&&sc.y<sc.max,whole=!!sc; // whole: the page, or a list inside it (Gmail's) opened out
if(s.page)h+="<div class='row' style='margin-top:6px'><span class='muted' style='font-size:12px;flex:1;overflow-wrap:anywhere'>Mapped in the hidden browser: "+esc(s.page.url)+(sc?" &middot; <b>"+(up&&down?"more above and below":down?"more below":"the end of the page")+"</b>: a map only has what fits in the window, so scroll to map the rest"+(whole?", or map the whole page at once":""):s.page.full?" &middot; <b>the whole page</b>, in one tall screenshot":"")+"</span>"+(up?"<button class='ghost scrscroll' data-to='up' title='scroll up in the hidden browser and map what&#39;s there as a new screen'>&uarr; Scroll up</button>":"")+(down?"<button class='ghost scrscroll' data-to='down' title='scroll down in the hidden browser and map what&#39;s there as a new screen'>Scroll down &darr;</button>":"")+(whole?"<button class='ghost scrwhole' title='map all of this page in one tall screenshot, every button, link and field on it, as a new screen'>Whole page &varr;</button>":"")+"</div>";
h+="<div class='scrwrap' id='scrwrap'><img src='/api/screens/image?id="+encodeURIComponent(s.id)+"&t="+encodeURIComponent(T)+"' alt='' draggable='false'>"+(s.regions||[]).map(function(r){return scrBox(r,s,'');}).join('')+(SPEND?scrBox(SPEND,s,'draw'):"")+"<div class='scrbox draw hidden' id='scrdraw'></div></div>";
h+="<div class='mapbar' id='scrbar'>Drag on the screenshot to mark a region &middot; coordinates are screenshot pixels</div>";
h+="<div class='row"+(SPEND?"":" hidden")+"' id='scrlabel' style='margin-top:8px'><input id='scrlabelin' placeholder='name this region, e.g. Merge button' style='flex:1'><button class='act' id='scrlabelok'>Add region</button><button class='ghost' id='scrlabelno'>Cancel</button></div>";
var rs=(s.blueprint&&s.blueprint.regions)||[];
if(rs.length&&s.page)h+="<div class='row' style='margin-top:8px'><span class='muted' style='font-size:12px;flex:1'><b>Press</b> clicks it in the hidden browser, on the real site and signed in as you, then maps the page it leads to as a new screen. <b>Type</b> fills in a field there the same way. "+(s.trusted?"This site is one of your trusted sites, so they go ahead without asking.":"They ask first, every time, unless you add this site to Trusted sites in Settings.")+"</span>"+(rs.some(function(r){return r.kind==='field';})?"<label class='check' style='flex:0 0 auto;margin:0' title='after typing, press Enter: how a search or a one-line form is sent'><input type='checkbox' id='screnter' style='width:auto'"+(STYPEENTER?" checked":"")+"> Type, then Enter</label>":"")+"</div>";
else if(rs.length)h+="<div class='row' style='margin-top:8px'><span class='muted' style='font-size:12px;flex:1'><b>Click here</b> moves your mouse to a region's centre and clicks, on your real screen. It asks first, every time.</span><select id='scrclickdelay' title='wait first, so you can bring the right window to the front' style='flex:0 0 auto;width:auto'>"+[0,3,5,10].map(function(d){return "<option value='"+d+"'"+(d===SCLICKDELAY?" selected":"")+">"+(d?"click in "+d+"s":"click now")+"</option>";}).join('')+"</select></div>";
h+="<div id='scrregions'>"+(rs.length?rs.map(function(r,i){return "<div class='task' data-i='"+i+"'><span class='t'><b>"+esc(r.label)+"</b>"+(r.kind?" <span class='tcount'>"+esc(r.kind)+"</span>":"")+" <span class='muted' style='font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px'>x "+r.x+", y "+r.y+" &middot; "+r.w+"&times;"+r.h+" &middot; centre ("+r.center.x+", "+r.center.y+")</span></span>"+(s.page?(r.kind==='field'?"<button class='ghost scrtype' title='type into this field in the hidden browser and map the result'>Type</button>":"")+"<button class='ghost scrpress' title='click this in the hidden browser and map where it leads'>Press</button>":"<button class='ghost scrclick' title='move the mouse to the centre of this region and click there'>Click here</button>")+"<button class='rm scrrm' title='remove this region'>&times;</button></div>";}).join(''):"<div class='muted' style='font-size:12px;margin-top:8px'>No regions yet.</div>")+"</div>";
v.innerHTML=h;wireScreen();}
function scrPoint(ev){var rc=$('scrwrap').querySelector('img').getBoundingClientRect(),s=SCREEN;if(!rc.width||!rc.height)return {x:0,y:0};return {x:Math.max(0,Math.min(s.w-1,Math.round((ev.clientX-rc.left)/rc.width*s.w))),y:Math.max(0,Math.min(s.h-1,Math.round((ev.clientY-rc.top)/rc.height*s.h)))};}
function scrRect(a,b){return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)};}
function screenErr(msg){$('screenmsg').innerHTML="<div class='note err'>"+esc(msg)+"</div>";}
function screenSaved(s){if(!s||s.error){screenErr((s&&s.error)||'could not save');return;}$('screenmsg').innerHTML='';SCREENS=SCREENS.map(function(x){return x.id===s.id?s:x;});SCREEN=s;SPEND=null;renderScreenList();renderScreen();}
function saveRegions(regions){api('/api/screens/regions',{id:SCREEN.id,regions:regions}).then(screenSaved);}
function wireScreen(){var s=SCREEN,wrap=$('scrwrap'),bar=$('scrbar'),draw=$('scrdraw'),nm=$('scrname');
nm.value=s.name;
nm.addEventListener('change',function(){var n=(nm.value||'').trim();if(n)api('/api/screens/rename',{id:s.id,name:n}).then(screenSaved);});
$('scrcopy').addEventListener('click',function(){var b=$('scrcopy');navigator.clipboard.writeText(JSON.stringify(s.blueprint,null,2));b.textContent='Copied';setTimeout(function(){b.textContent='Copy blueprint';},1400);});
$('scrdel').addEventListener('click',function(){if(typeof confirm==='function'&&!confirm('Delete this screen and its regions?'))return;api('/api/screens/remove',{id:s.id}).then(function(){SCREEN=null;SPEND=null;loadScreensUI();});});
var sp=$('scrsplit');if(sp)sp.addEventListener('click',function(){sp.disabled=true;$('screenmsg').innerHTML="<div class='note muted'>Splitting&hellip;</div>";api('/api/screens/split',{id:s.id}).then(function(x){sp.disabled=false;screenAdded(x);if(x&&x.screens)$('screenmsg').insertAdjacentHTML('beforeend',"<div class='note muted'>The whole image is still there too. Delete it if you don't need it.</div>");}).catch(function(e){sp.disabled=false;screenErr(String((e&&e.message)||e));});});
wrap.addEventListener('pointerdown',function(ev){if(ev.button)return;ev.preventDefault();SDRAG=scrPoint(ev);try{wrap.setPointerCapture(ev.pointerId);}catch(e){}});
wrap.addEventListener('pointermove',function(ev){var p=scrPoint(ev);if(!SDRAG){bar.innerHTML='<b>x '+p.x+', y '+p.y+'</b> &middot; drag to mark a region';return;}
var r=scrRect(SDRAG,p);bar.innerHTML='<b>x '+r.x+', y '+r.y+' &middot; '+r.w+'&times;'+r.h+'</b>';draw.classList.remove('hidden');draw.style.left=scrPct(r.x,s.w);draw.style.top=scrPct(r.y,s.h);draw.style.width=scrPct(r.w,s.w);draw.style.height=scrPct(r.h,s.h);});
wrap.addEventListener('pointerup',function(ev){if(!SDRAG)return;var r=scrRect(SDRAG,scrPoint(ev));SDRAG=null;if(r.w<4||r.h<4){draw.classList.add('hidden');return;}SPEND=r;renderScreen();$('scrlabelin').focus();});
function addPending(){if(!SPEND)return;saveRegions((s.regions||[]).concat([{label:($('scrlabelin').value||'').trim(),x:SPEND.x,y:SPEND.y,w:SPEND.w,h:SPEND.h}]));}
$('scrlabelok').addEventListener('click',addPending);
$('scrlabelin').addEventListener('keydown',function(e){if(e.key==='Enter')addPending();else if(e.key==='Escape'){SPEND=null;renderScreen();}});
$('scrlabelno').addEventListener('click',function(){SPEND=null;renderScreen();});
$('scrregions').querySelectorAll('.scrrm').forEach(function(b){b.addEventListener('click',function(){var i=+b.closest('.task').getAttribute('data-i');saveRegions((s.regions||[]).filter(function(r,j){return j!==i;}));});});
var cd=$('scrclickdelay');if(cd)cd.addEventListener('change',function(){SCLICKDELAY=+cd.value||0;});
$('scrregions').querySelectorAll('.scrclick').forEach(function(b){b.addEventListener('click',function(){clickUI(s,+b.closest('.task').getAttribute('data-i'),b);});});
$('scrregions').querySelectorAll('.scrpress').forEach(function(b){b.addEventListener('click',function(){pressUI(s,+b.closest('.task').getAttribute('data-i'),b);});});
$('scrregions').querySelectorAll('.scrtype').forEach(function(b){b.addEventListener('click',function(){typeUI(s,+b.closest('.task').getAttribute('data-i'),b);});});
var te=$('screnter');if(te)te.addEventListener('change',function(){STYPEENTER=!!te.checked;});
var rm=$('scrremap');if(rm)rm.addEventListener('click',function(){mapUI(s.page.url,rm);});
document.querySelectorAll('#screenview .scrscroll').forEach(function(b){b.addEventListener('click',function(){scrollUI(s,b.getAttribute('data-to'),b);});});
document.querySelectorAll('#screenview .scrwhole').forEach(function(b){b.addEventListener('click',function(){wholeUI(s,b);});});
var wb=$('scrwatch');if(wb)wb.addEventListener('click',function(){watchUI(s,wb);});}
// Watch (watch.mjs): a mapped page read again every few minutes while Symbiot
// runs, and what's new on it. Only reads: nothing there is pressed or typed.
var WATCH={watches:[],news:[],every:[5,15,30,60]};
function watchOf(s){var w=null;(WATCH.watches||[]).forEach(function(x){if(s&&s.page&&x.url===s.page.url)w=x;});return w;}
function agoTxt(t){var m=Math.max(0,(Date.now()-t)/60000);return m<1.5?'just now':m<90?Math.round(m)+' min ago':m<2160?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago';}
function loadWatchUI(){api('/api/watch').then(function(d){if(d&&d.watches)WATCH=d;renderWatch();});loadBoard();}
function watchUI(s,b){var w=watchOf(s);
if(w){if(typeof confirm==='function'&&!confirm('Stop watching '+w.name+'? What it found goes too.'))return;api('/api/watch/remove',{id:w.id}).then(function(){api('/api/watch').then(function(d){if(d&&d.watches)WATCH=d;renderWatch();renderScreen();});});return;}
b.disabled=true;api('/api/watch/add',{screen:s.id,every:15}).then(function(x){b.disabled=false;if(!x||x.error){screenErr((x&&x.error)||'failed');return;}
$('screenmsg').innerHTML="<div class='note ok'>&#10003; Watching "+esc(x.name)+". Symbiot reads it every "+x.every+" minutes while it runs (first within a minute, to learn what's there) and notifies you of anything new. It's listed under Watching, just below.</div>";
api('/api/watch').then(function(d){if(d&&d.watches)WATCH=d;renderWatch();renderScreen();});});}
function renderWatch(){var box=$('watchbox'),ws=WATCH.watches||[],ns=WATCH.news||[],bs=WATCH.briefs||[],h='';
var gh=ws.some(function(w){return String(w.url).indexOf('://github.com/notifications')>=0;});
if(ws.length){h+="<div class='tgroup'>Watching <span class='tcount'>read again while Symbiot runs &middot; only reads, never presses</span></div>";
h+=ws.map(function(w,i){return "<div class='task' data-i='"+i+"'><span class='t'><b>"+esc(w.name)+"</b> <span class='muted' style='font-size:12px'>"+(w.checked?"read "+agoTxt(w.checked):w.last?"tried "+agoTxt(w.last):"first read within a minute")+(w.via==='gh'?" &middot; through gh":"")+"</span>"+(w.error?"<br><span class='err' style='font-size:12px'>"+esc(w.error)+"</span>":"")+"</span><select class='wevery' title='how often to read it' style='flex:0 0 auto;width:auto'>"+(WATCH.every||[]).map(function(m){return "<option value='"+m+"'"+(m===w.every?" selected":"")+">every "+m+" min</option>";}).join('')+"</select><button class='ghost wcheck' title='read it now'>Check now</button><button class='rm wrm' title='stop watching it'>&times;</button></div>";}).join('');}
// GitHub's notifications need no map: gh reads them (watch.mjs readGitHub)
if(!gh)h+="<div class='row' style='margin-top:8px'><span class='muted' style='font-size:12px;flex:1'>Watch GitHub too: new review requests, failed CI runs and mentions reach you the same way. With the GitHub CLI signed in (<b>gh auth login</b>), Symbiot reads them through it; without, it reads github.com/notifications in its browser (click Sign in above with github.com first).</span><button class='ghost' id='wgithub'>Watch GitHub</button></div>";
if(ws.length){h+="<label class='check' style='margin-top:8px'><input type='checkbox' id='wbrief'"+(WATCH.brief?" checked":"")+"> <span>Brief me: the AI connected in Settings says what needs me and what can wait, here and in the notification. <span class='muted'>It's sent what's new: for mail, the sender, subject and preview. With a local Ollama model nothing leaves this computer.</span></span></label>";
var b0=bs[0]&&ns.some(function(n){return n.ts===bs[0].ts&&n.watch===bs[0].watch;})?bs[0]:null;
if(b0)h+="<div class='note' style='white-space:pre-line;margin-top:6px'><b>Brief</b> <span class='muted' style='font-size:12px'>"+esc(b0.name)+" &middot; "+b0.count+" new &middot; "+agoTxt(b0.ts)+"</span><br>"+esc(b0.text)+"</div>";
h+=ns.length?"<div class='row' style='margin-top:8px'><span class='fl' style='margin-left:0;flex:1'>New &middot; "+ns.length+"</span><button class='ghost' id='wclear' title='clear this list (Symbiot still remembers what it has seen)'>Clear</button></div>"+ns.slice(0,20).map(function(n,i){return "<div class='task' data-i='"+i+"'><span class='t'>"+esc(n.text)+" <span class='muted' style='font-size:12px'>"+esc(n.name)+" &middot; "+agoTxt(n.ts)+"</span>"+custTag(n)+"</span>"+(n.href?"<button class='ghost wopen' title='open it in your browser'>Open</button>":"")+(n.mail||n.chat||n.social?"<button class='ghost wdraft' title='"+(n.chat?DRAFT_CHAT_TIP:n.social?DRAFT_SOCIAL_TIP:"your coding agent opens it in your inbox through Screens, writes a reply and leaves it in Drafts. It never presses Send")+"'>"+(n.drafted?"Drafted &middot; again":"Draft a reply")+"</button>":"")+(n.chat&&n.drafted?"<button class='ghost wopenwa' title='"+OPEN_WA_TIP+"'>Open in WhatsApp</button>":"")+"</div>";}).join('')
:"<div class='muted' style='font-size:12px;margin-top:6px'>Nothing new yet. New rows show up here, and as a notification. Standup counts what's waiting on you, and your agent reads them with <b>symbiot watch new</b>.</div>";}
box.innerHTML=h;
var wg=$('wgithub');if(wg)wg.addEventListener('click',function(){wg.disabled=true;api('/api/watch/add',{site:'github',every:5}).then(function(x){wg.disabled=false;if(!x||x.error){screenErr((x&&x.error)||'failed');return;}
$('screenmsg').innerHTML="<div class='note ok'>&#10003; Watching "+esc(x.name)+" every "+x.every+" minutes while Symbiot runs. The first read, within a minute, learns what's unread there now; after that, a new review request or failed CI run notifies you.</div>";loadWatchUI();});});
var wbr=$('wbrief');if(wbr)wbr.addEventListener('change',function(){api('/api/watch/brief',{on:wbr.checked}).then(loadWatchUI);});
box.querySelectorAll('.wevery').forEach(function(sel){sel.addEventListener('change',function(){var w=ws[+sel.closest('.task').getAttribute('data-i')];api('/api/watch/every',{id:w.id,every:+sel.value}).then(loadWatchUI);});});
box.querySelectorAll('.wrm').forEach(function(b){b.addEventListener('click',function(){var w=ws[+b.closest('.task').getAttribute('data-i')];if(typeof confirm==='function'&&!confirm('Stop watching '+w.name+'? What it found goes too.'))return;api('/api/watch/remove',{id:w.id}).then(function(){api('/api/watch').then(function(d){if(d&&d.watches)WATCH=d;renderWatch();renderScreen();});});});});
box.querySelectorAll('.wcheck').forEach(function(b){b.addEventListener('click',function(){var w=ws[+b.closest('.task').getAttribute('data-i')];b.disabled=true;b.textContent='Reading…';
api('/api/watch/check',{id:w.id}).then(function(x){b.disabled=false;b.textContent='Check now';if(!x||x.error){screenErr((x&&x.error)||'failed');loadWatchUI();return;}
$('screenmsg').innerHTML="<div class='note "+(x["new"]&&x["new"].length?"ok":"muted")+"'>"+watchCheckMsg(w,x)+"</div>";loadWatchUI();}).catch(function(e){b.disabled=false;b.textContent='Check now';screenErr(String((e&&e.message)||e));});});});
box.querySelectorAll('.wopen').forEach(function(b){b.addEventListener('click',function(){var n=ns[+b.closest('.task').getAttribute('data-i')];if(n&&/^https?:/.test(n.href))window.open(n.href,'_blank','noopener');});});
// Draft a reply (watch.mjs draftReply): handed to your agent, which never sends it
box.querySelectorAll('.wdraft').forEach(function(b){b.addEventListener('click',function(){var n=ns[+b.closest('.task').getAttribute('data-i')];b.disabled=true;
api('/api/watch/draft',{id:n.id}).then(function(x){b.disabled=false;if(!x||x.error){screenErr((x&&x.error)||'failed');return;}
$('screenmsg').innerHTML="<div class='note ok'>"+(x.chat?DRAFTING_CHAT:x.social?DRAFTING_SOCIAL:DRAFTING)+"</div>";loadWatchUI();}).catch(function(e){b.disabled=false;screenErr(String((e&&e.message)||e));});});});
box.querySelectorAll('.wopenwa').forEach(function(b){b.addEventListener('click',function(){openChatUI(ns[+b.closest('.task').getAttribute('data-i')],b,function(cls,html){$('screenmsg').innerHTML="<div class='note "+cls+"'>"+html+"</div>";});});});
var wc=$('wclear');if(wc)wc.addEventListener('click',function(){api('/api/watch/clear',{}).then(loadWatchUI);});}
// what Check now found, for Watching and the Dashboard
function watchCheckMsg(w,x){return x.busy?"The hidden browser is busy with a map, press or type. It reads "+esc(w.name)+" once that's done.":x.learned!=null?"Read "+esc(x.name)+": learned the "+x.learned+" things listed there now. From here on, anything new is noted.":x["new"]&&x["new"].length?"&#10003; "+x["new"].length+" new on "+esc(x.name)+".":"Read "+esc(x.name)+": nothing new.";}
// a chat (WhatsApp): the reply is typed into the chat's message box in Symbiot's browser, unsent
var DRAFT_CHAT_TIP="your coding agent opens the chat in Symbiot&#39;s hidden browser and types a reply into its message box, unsent. It never presses Send or Enter";
var DRAFTING_CHAT="&#10003; Your agent is drafting a reply in that chat. It opens WhatsApp in Symbiot's hidden browser, types the reply into the chat's message box and leaves it there unsent: it never presses Send or Enter. Once it's done (the Agents tab), click <b>Open in WhatsApp</b> on the message: the chat shows the reply in its box, for you to read and send.";
// Open in WhatsApp (watch.mjs openChat): Symbiot's browser, as a window, at web.whatsapp.com
var OPEN_WA_TIP="open WhatsApp in Symbiot&#39;s browser, where the chat shows your agent&#39;s reply in its message box, for you to read and send";
function openChatUI(n,b,say){if(!n)return;b.disabled=true;
api('/api/watch/open-chat',{id:n.id}).then(function(x){b.disabled=false;if(!x||x.error){say('err',esc((x&&x.error)||'failed'));return;}
say('ok',"&#10003; Opened WhatsApp in the Symbiot Browser. The chat shows your agent's reply in its message box: read it, change it if you like, and send it there. Close the window when you're done, so Watch can read WhatsApp again.");}).catch(function(e){b.disabled=false;say('err',esc(String((e&&e.message)||e)));});}
var DRAFTING="&#10003; Your agent is drafting a reply to it. It opens the email in your inbox through Screens, writes the reply and leaves it in Drafts for you to read and send: it never presses Send. Follow it, and answer anything it asks, in the Agents tab.";
// a LinkedIn comment or mention (watch.mjs socialBrief): typed into the comment box, never posted
var DRAFT_SOCIAL_TIP="your coding agent opens it on LinkedIn in Symbiot&#39;s hidden browser and types a reply into the comment box, unposted. It never presses Post, Comment, Reply or Send";
var DRAFTING_SOCIAL="&#10003; Your agent is drafting a reply to it. It opens the comment on LinkedIn in Symbiot's hidden browser, types the reply into the comment box and leaves it there, never posted: it can't press Post, Comment, Reply or Send. It also writes the reply under <b>The reply</b> in its brief (the Agents tab), for you to paste and post yourself.";
// asks how to install it, about pricing or about team use (post.mjs maybeCustomer)
var CUSTWHY={pricing:'asks about pricing',install:'asks how to install it',team:'asks about team use'};
function custTag(n){return n.customer?" <span class='tag cust' title='"+escQ(CUSTWHY[n.customer]||'')+"'>maybe a customer</span>":"";}
// ---- Posts (post.mjs): the week's real work as drafts waiting on you: Approve, Edit, Skip. Nothing is posted
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
if(p.posts.length){h+="<div class='pshead'><span>Drafts to post</span><small>"+p.posts.length+" waiting on you &middot; Approve one and Marketing&#39;s agent posts it on LinkedIn</small></div><div class='pshelf'>";
h+=p.posts.map(function(x){var ed=Object.prototype.hasOwnProperty.call(PEDIT,x.id);
return "<div class='rcard pcard"+(ed?" editing":"")+"' data-id='"+escQ(x.id)+"'><div class='rhead'><b>"+mkProd(mkPostProduct(x.id))+esc(L[x.kind]||x.kind)+"</b><span class='muted'>LinkedIn &middot; drafted "+agoTxt(x.drafted)+(x.edited?" &middot; edited":"")+"</span></div>"
+(ed?"<textarea class='pedit' maxlength='3000'>"+esc(PEDIT[x.id])+"</textarea>":"<div class='ptext'>"+esc(x.text)+"</div><button type='button' class='pmore' aria-expanded='false'>Read it all</button>")
+(x.show&&!(x.media||[]).length?"<div class='pshow'><span class='muted'>Picture idea:</span> "+esc(x.show)+"</div>":"")
+pmediaHtml(x)
+(x.sources&&x.sources.length?"<details class='psrc'><summary>From git: "+x.sources.length+" thing"+(x.sources.length===1?"":"s")+" it says</summary>"+x.sources.map(function(s){return "<div>"+esc(s)+"</div>";}).join('')+"</details>":"")
+"<div class='row'>"+(ed?"<button class='act psave'>Save</button><button class='ghost pcancel'>Cancel</button><span class='pchars'>"+String(PEDIT[x.id]).length+" / 3000</span>"
:"<button class='act papprove' title='your yes: Marketing&#39;s agent posts it on LinkedIn through Symbiot&#39;s signed-in browser, exactly as it reads here, with its picture or video'>Approve</button><button class='ghost pedit-btn' title='change its words here'>Edit</button><button class='ghost pskip' title='drop this draft (it stays in the log)'>Skip</button>"
+"<button class='ghost pmadd' title='a picture or video of yours: PNG, JPG, GIF, MP4, MOV or WebM'>Add picture or video</button>"+(PFORM[x.id]?"":"<button class='ghost pmfrom' title='a picture, or a short clip, of a web page (your app on localhost too)'>From a page</button>")
+"<input type='file' class='pmfile hidden' accept='image/png,image/jpeg,image/gif,video/mp4,video/quicktime,video/webm'>")+"</div></div>";}).join('')+"</div>";}
else h+="<div class='row' style='margin-top:10px'><span class='muted' style='flex:1'>"+(p.voice.count?"Posts: draft this week&#39;s 3 LinkedIn posts from your git, in your voice ("+p.voice.count+" example"+(p.voice.count===1?"":"s")+"). Nothing is posted until you approve one, and then Marketing&#39;s agent posts it."
:"Posts: Symbiot drafts LinkedIn posts from your week&#39;s git in your own voice, once it has examples of your posts. Link LinkedIn (below) and click <b>Fill from LinkedIn</b>, or paste 5&ndash;10 of your posts into <code>"+esc(p.voice.file)+"</code>, a line of --- between each.")+"</span>"
+"<button class='ghost pvoice' title='reads your recent posts on LinkedIn in Symbiot&#39;s signed-in browser into voice.md, which you can read over'>Fill from LinkedIn</button>"
+"<button class='ghost pdraft'"+(p.voice.count?" title='your AI drafts 3 posts from your last 7 days of commits, release tags and changelog; each must cite what git shows'":" disabled title='add example posts first'")+">Draft this week&#39;s posts</button></div>";
el.innerHTML=h+"<div id='postsmsg'>"+PMSG+"</div>";
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
function mkMsg(cls,html){var o=$('mkmsg');if(o)o.innerHTML=html?"<div class='note "+cls+"'>"+html+"</div>":'';}
function loadMarketing(){loadPostsUI();loadMkTray();api('/api/marketing').then(function(d){if(d&&!d.error){MKT=d;renderMarketing();renderMkLane();if(POSTS)renderPosts();}});}
// The Marketing lane (home.mjs marketingState): what needs you there first (its agent's
// questions, its work waiting for your OK, the week's drafts), then its tasks, each tagged
// with the product it markets, an Add for a new one, what its agent drafted, and other
// lanes' tasks about marketing, which move to it in a click. Opened from its lit orb, what
// needs you is lit (MKLIT).
var MKLIT=false;
function mkProd(p){return p?"<span class='mkp'>"+esc(p)+"</span>":"";}
function mkPostProduct(id){var ns=(MKT&&MKT.lane&&MKT.lane.needs)||[];for(var i=0;i<ns.length;i++)if(ns[i].id==='draft:'+id)return ns[i].product||'';return '';}
function loadMkTasks(){renderMkLane();}
// A draft its agent wrote, as the platform will show it (marketing.mjs draftPreview): who
// it's from, its text with its own line breaks, cut where the feed cuts it ("…see more"),
// its hashtags, its picture or video; Approve and Skip beside it; its agent's notes apart,
// folded away below. Approve is your only step: its agent then posts it through Symbiot's
// signed-in browser, with this text.
var MKPV='';
function mkTags(t){return String(t||'').split(/(#[A-Za-z0-9_]+)/g).map(function(x,i){return i%2?"<span class='lihash'>"+esc(x)+"</span>":esc(x);}).join('');}
function mkMediaSrc(rel){return '/api/marketing/media?rel='+encodeURIComponent(rel)+'&t='+encodeURIComponent(T);}
function mkPreviewHtml(p){var a=p.author||{},plat=p.platform==='linkedin'?'LinkedIn':(p.platform||'post');
var h="<div class='lipost' aria-label='"+escQ(plat)+" preview'><div class='liauth'>"+(a.avatar?"<img class='liav' src='"+escQ(mkMediaSrc('avatar'))+"' alt=''>":"<span class='liav'>"+esc(a.initials||'')+"</span>")
+"<div class='liwho'><b>"+esc(a.name||'')+"</b>"+(a.headline?"<small>"+esc(a.headline)+"</small>":"")+"<small>"+(p.when?"Scheduled for "+esc(p.when):"Now")+" &middot; &#127760;</small></div></div>"
+"<div class='litext'>"+(p.cut?mkTags(p.shown)+"&hellip;<button type='button' class='limore'>see more</button>":mkTags(p.body))+"</div>"
+(p.media||[]).map(function(m){return m.kind==='video'?"<video class='limedia' src='"+escQ(mkMediaSrc(m.rel))+"' controls muted playsinline preload='metadata'></video>":"<img class='limedia' src='"+escQ(mkMediaSrc(m.rel))+"' alt='"+escQ(m.name)+"'>";}).join('')
+"<div class='libar'><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div></div>";
if((p.missing||[]).length)h+="<div class='note err'>It names "+p.missing.map(function(m){return "<code>"+esc(m)+"</code>";}).join(', ')+", which isn&#39;t next to it.</div>";
var fin=p.status==='posted'||p.status==='superseded',on=p.postedOn==='linkedin'?'LinkedIn':p.postedOn;
var done=p.status==='posted'?"Posted"+(on?" on "+esc(on):"")+(p.posted?", "+esc(new Date(p.posted).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})):"")+(p.url?" &middot; <a href='"+escQ(p.url)+"' target='_blank' rel='noopener'>see it</a>":"")+". It isn&#39;t approved or posted again"+(p.edited?", though its file changed since":"")+"."
:p.status==='superseded'?"Superseded"+((p.by||[]).length?" by "+p.by.map(function(b){return "<code>"+esc(b)+"</code>";}).join(', '):"")+": it won&#39;t be posted."
:p.status==='approved'?"Approved "+agoTxt(p.statusAt)+": its agent "+(p.when?"schedules":"posts")+" it through Symbiot&#39;s browser, with this text.":p.status==='skipped'?"Skipped "+agoTxt(p.statusAt)+": it won&#39;t be posted.":"";
h+="<div class='row mkpvact'>"+(fin||p.status==='approved'?"":"<button class='act mkok'>Approve"+(p.when?", schedule it":", post it")+"</button>")+(fin||p.status==='skipped'?"":"<button class='ghost mkskip'>Skip</button>")
+"<span class='muted' style='font-size:12px;flex:1'>"+(done||(p.when?"Its agent schedules it for "+esc(p.when)+" once you approve.":"Its agent posts it once you approve."))+"</span><span class='pchars'>"+p.chars+" / 3000</span></div>";
h+="<details class='linotes'><summary>Its notes</summary>"+(p.notes?"<div class='linotest'>"+esc(p.notes)+"</div>":"<div class='muted'>None.</div>")+"<button type='button' class='ghost mkfile' title='open the draft in your editor'>Edit the file</button></details>";
return h;}
function mkPreview(box,rel){if(!box.innerHTML)box.innerHTML="<div class='muted'>Loading&hellip;</div>";
api('/api/marketing/draft?rel='+encodeURIComponent(rel)).then(function(p){if(MKPV!==rel)return;if(!p||p.error){box.innerHTML="<div class='note err'>"+esc((p&&p.error)||'failed')+"</div>";return;}
box.innerHTML=mkPreviewHtml(p);
var mo=box.querySelector('.limore');if(mo)mo.addEventListener('click',function(){box.querySelector('.litext').innerHTML=mkTags(p.body);});
var fl=box.querySelector('.mkfile');if(fl)fl.addEventListener('click',function(){api('/api/marketing/open',{rel:rel}).then(function(r){if(r&&r.error)mkMsg('err',esc(r.error));});});
box.querySelectorAll('.mkok,.mkskip').forEach(function(b){b.addEventListener('click',function(){var skip=b.classList.contains('mkskip');b.disabled=true;
api('/api/marketing/draft/answer',{rel:rel,skip:skip}).then(function(r){if(!r||r.error){b.disabled=false;mkMsg('err',esc((r&&r.error)||'failed'));return;}mkMsg('ok',esc(r.said||'Done.'));loadMarketing();}).catch(function(e){b.disabled=false;mkMsg('err',esc(String((e&&e.message)||e)));});});});}).catch(function(e){box.innerHTML="<div class='note err'>"+esc(String((e&&e.message)||e))+"</div>";});}
function renderMkLane(){var L=(MKT&&MKT.lane)||null,nd=$('mkneeds'),el=$('mktasks');if(!nd||!el)return;if(!L){nd.innerHTML='';el.innerHTML='';return;}
var ns=L.needs||[],lbl={ask:'Answer',approve:'Review',draft:'Show it',post:'Preview'},kind={ask:'its agent asks',approve:'waits for your OK',draft:'a draft to post',post:'a post to approve'};
nd.innerHTML=ns.length?"<div class='mkneeds"+(MKLIT?" lit":"")+"'><div class='pshead'><span>Needs you &middot; "+ns.length+"</span><small>only you can do these</small></div>"+ns.map(function(n,i){return "<div class='task mkneed' data-i='"+i+"'><span class='t'>"+mkProd(n.product)+esc(n.text)+" <span class='muted' style='font-size:11px'>"+kind[n.kind]+"</span></span><button class='"+(i?'ghost':'act')+" mkact'>"+lbl[n.kind]+"</button></div>";}).join('')+"</div>":'';
nd.querySelectorAll('.mkact').forEach(function(b){b.addEventListener('click',function(){var n=ns[+b.closest('.mkneed').getAttribute('data-i')];if(!n)return;
if(n.kind==='post'){MKPV=n.rel;renderMkLane();var pv=null;document.querySelectorAll('#mktasks .mkpv').forEach(function(x){if(x.getAttribute('data-rel')===n.rel)pv=x;});if(pv&&pv.scrollIntoView)pv.scrollIntoView({block:'start',behavior:'smooth'});return;}
if(n.kind==='draft'){var c=document.querySelector("#boardposts .pcard[data-id='"+n.id.slice(6)+"']");if(c){document.querySelectorAll('#panel-marketing .lit').forEach(function(x){if(x!==c)x.classList.remove('lit');});c.classList.add('lit');if(c.scrollIntoView)c.scrollIntoView({block:'center',behavior:'smooth'});}return;}
lqFocus({kind:'proj',repo:'marketing'});});});
var prods=L.products||[],ln=L.lane||[],els=L.elsewhere||[],fs=L.files||[],st={waiting:'waiting',working:'its agent is at work',review:'done, waits for your OK'};
var h="<div class='pshead'><span>Marketing lane</span><small>"+(ln.length?ln.length+" task"+(ln.length>1?"s":"")+(L.working?" &middot; its agent is at work":L.waiting?" &middot; "+L.waiting+" waiting for its agent":""):"Its own agent, for every product: tell it what to make, and say which product it&#39;s for.")+"</small></div>"
+"<form class='row mkadd'><label class='mkl' for='mkprod'>Product</label><input id='mkprod' class='mkprod' list='mkprodlist' autocomplete='off' placeholder='Symbiot, Dailify&hellip;' maxlength='40'><datalist id='mkprodlist'>"+prods.map(function(p){return "<option value='"+escQ(p)+"'>";}).join('')+"</datalist><label class='mkl' for='mktext' style='position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)'>Task</label><input id='mktext' class='mktext' autocomplete='off' placeholder='A launch post, a demo video, a campaign&hellip;' maxlength='4000'><button type='submit' class='act'>Add</button></form>"
+ln.map(function(t){return "<div class='task' data-id='"+escQ(t.id)+"'><span class='t'>"+mkProd(t.product)+esc(t.text)+" <span class='muted' style='font-size:11px'>"+st[t.status]+"</span></span><button class='ghost mkopen' data-repo='marketing' title='open it on the Workdesk'>Open</button></div>";}).join('')
+(L.waiting&&!L.working?"<div class='row'><button class='act mkgo'>Start its agent</button><span class='muted' style='font-size:12px'>it drafts; nothing is posted until you approve its preview</span></div>":"")
+(fs.length?"<div class='pshead' style='margin-top:14px'><span>What its agent drafted</span><small>in the lane&#39;s folder, newest first</small></div>"+fs.slice(0,10).map(function(f){return "<div class='task' data-rel='"+escQ(f.rel)+"'><span class='t'>"+mkProd(f.product)+esc(f.name)+" <span class='muted' style='font-size:11px'>"+agoTxt(f.at)+"</span>"+(f.status?" <span class='mkst "+f.status+"'>"+esc(f.status)+"</span>":"")+"</span><button class='"+(MKPV===f.rel?'act':'ghost')+" mkprev' aria-expanded='"+(MKPV===f.rel)+"' title='see it as the post will look'>"+(MKPV===f.rel?'Hide':'Preview')+"</button></div><div class='mkpv"+(MKPV===f.rel?'':' hidden')+"' data-rel='"+escQ(f.rel)+"'></div>";}).join(''):"")
+(els.length?"<div class='pshead' style='margin-top:14px'><span>About marketing, in other projects</span><small>Move one here and Marketing&#39;s agent takes it, for its product</small></div>"+els.map(function(t){return "<div class='task' data-id='"+escQ(t.id)+"'><span class='t'>"+mkProd(t.product)+esc(t.text)+" <span class='muted' style='font-size:11px'>"+esc(t.name||t.repo||'no project')+"</span></span><button class='ghost mkmove'>Move to Marketing</button><button class='ghost mkopen' data-repo='"+escQ(t.repo||'')+"' title='open its project on the Workdesk'>Open</button></div>";}).join(''):"");
var keep=document.activeElement,typed=keep&&keep.closest&&keep.closest('#mktasks .mkadd')?[($('mkprod')||{}).value,($('mktext')||{}).value,keep.id]:null;
el.innerHTML=h;if(typed){$('mkprod').value=typed[0]||'';$('mktext').value=typed[1]||'';var f0=$(typed[2]);if(f0&&f0.focus)f0.focus();}
var fm=el.querySelector('.mkadd');if(fm)fm.addEventListener('submit',function(ev){ev.preventDefault();var t=$('mktext'),pr=$('mkprod'),bt=fm.querySelector('button');if(!t.value.trim()){t.focus();return;}bt.disabled=true;
api('/api/marketing/task',{text:t.value,product:pr.value}).then(function(r){bt.disabled=false;if(!r||r.error){mkMsg('err',esc((r&&r.error)||'failed'));return;}mkMsg('ok',r.duplicate?"It&#39;s on Marketing&#39;s list already.":"Added to Marketing"+(pr.value?" for "+esc(pr.value):"")+". Start its agent when you&#39;re ready.");t.value='';loadMarketing();}).catch(function(e){bt.disabled=false;mkMsg('err',esc(String((e&&e.message)||e)));});});
el.querySelectorAll('.mkopen').forEach(function(b){b.addEventListener('click',function(){TFILTER.repo=b.getAttribute('data-repo')||'';TFILTER.type='';lqPool('tasks');if(typeof loadTasks==='function')loadTasks();});});
el.querySelectorAll('.mkmove').forEach(function(b){b.addEventListener('click',function(){var id=b.closest('.task').getAttribute('data-id');b.disabled=true;api('/api/marketing/move',{id:id}).then(function(r){if(!r||r.error){b.disabled=false;mkMsg('err',esc((r&&r.error)||'failed'));return;}mkMsg('ok',"Moved to Marketing: its agent takes it from now on.");loadMarketing();});});});
el.querySelectorAll('.mkprev').forEach(function(b){b.addEventListener('click',function(){var rel=b.closest('.task').getAttribute('data-rel');MKPV=MKPV===rel?'':rel;renderMkLane();});});
if(MKPV){var pv=null;el.querySelectorAll('.mkpv').forEach(function(x){if(x.getAttribute('data-rel')===MKPV)pv=x;});if(pv)mkPreview(pv,MKPV);else MKPV='';}
var g=el.querySelector('.mkgo');if(g)g.addEventListener('click',function(){g.disabled=true;api('/api/marketing/go',{}).then(function(r){if(!r||r.error){g.disabled=false;mkMsg('err',esc((r&&r.error)||'It didn&#39;t start.'));return;}mkMsg('ok',r.queued?"Its agent takes them once the run there now finishes.":"Marketing&#39;s agent started. It&#39;s on the Workdesk, and what it drafts waits here for your OK.");loadMarketing();}).catch(function(e){g.disabled=false;mkMsg('err',esc(String((e&&e.message)||e)));});});
if(MKLIT){MKLIT=false;var lit=nd.querySelector('.mkneeds');if(lit&&lit.scrollIntoView)lit.scrollIntoView({block:'start'});}}
// The pick tray (tray.mjs): every capture its agent took of a product, blurred where it
// shows something private. Its blur boxes sit on it, solid where it's blurred and dashed
// where it shows; a click switches one (a clip's box at the same place in each moment, at
// once) and the capture is blurred again. Use puts it on a post (its media: line) in one
// click: the posts it was taken for each have a button, any other is in the list.
var MKTRAY=null;
function loadMkTray(){api('/api/marketing/tray').then(function(d){if(d&&!d.error){MKTRAY=d.trays||[];renderMkTray();}});}
function mkTraySrc(rel,at){return '/api/marketing/tray/media?rel='+encodeURIComponent(rel)+'&v='+Math.round(at||0)+'&t='+encodeURIComponent(T);}
// a capture's boxes, one a place: a clip has the same box in each moment it shows there
function mkBoxes(c){var g={},out=[];(c.regions||[]).forEach(function(r){var k=[r.x,r.y,r.w,r.h].join();if(!g[k]){g[k]={x:r.x,y:r.y,w:r.w,h:r.h,kind:r.kind,ids:[],on:0};out.push(g[k]);}g[k].ids.push(r.id);if(r.on)g[k].on++;});out.forEach(function(b){b.all=b.on===b.ids.length;});return out;}
var MKKIND={still:'Picture',clip:'Clip',reel:'Reel'};
function renderMkTray(){var el=$('mktray');if(!el)return;var ts=MKTRAY||[];
var h=ts.map(function(t,ti){var open=(t.drafts||[]).filter(function(d){return d.status!=='posted'&&d.status!=='superseded';});
return "<div class='pshead'><span>Pick tray &middot; "+esc(t.product)+"</span><small>"+t.items.length+" capture"+(t.items.length===1?"":"s")+", blurred where "+(t.items.length===1?"it shows":"they show")+" something private. Click a box to blur it or show it; Use puts one on a post.</small></div><div class='mktray'>"
+t.items.map(function(c,ci){var bx=mkBoxes(c),n=bx.filter(function(b){return b.all;}).length;
var shot=c.show?(c.showKind==='video'?"<video src='"+escQ(mkTraySrc(c.show,c.at))+"' muted loop playsinline controls preload='metadata'></video>":"<img src='"+escQ(mkTraySrc(c.show,c.at))+"' alt='"+escQ(c.caption||c.name)+"' loading='lazy'>"):"<div class='muted' style='padding:20px;line-height:1.4'>Not rendered yet.</div>";
shot+=bx.map(function(b,bi){var p=function(v){return Math.round(v*10000)/100+'%';};return "<button type='button' class='mkbox"+(b.all?" on":"")+"' data-b='"+bi+"' aria-pressed='"+b.all+"' style='left:"+p(b.x)+";top:"+p(b.y)+";width:"+p(b.w)+";height:"+p(b.h)+"' title='"+escQ(b.kind+(b.all?": blurred. Click to show it":": shown. Click to blur it"))+"' aria-label='"+escQ(b.kind+(b.all?", blurred":", shown"))+"'></button>";}).join('');
var fr=(c.for||[]).map(function(f){return t.folder+'/'+f;}),mine=open.filter(function(d){return fr.indexOf(d.rel)>=0;}),rest=open.filter(function(d){return fr.indexOf(d.rel)<0;});
var use=c.use?mine.map(function(d){var di=t.drafts.indexOf(d);return (d.media||[]).indexOf(c.use)>=0?"<span class='mkst approved' title='its picture or video now'>on "+esc(d.name)+"</span>":"<button type='button' class='ghost mkuseb' data-d='"+di+"'>Use for "+esc(d.name)+"</button>";}).join('')
+(rest.length?"<select class='mkusel' aria-label='Use it for another post'><option value=''>"+(mine.length?"Another post":"Use for a post")+"&hellip;</option>"+rest.map(function(d){return "<option value='"+t.drafts.indexOf(d)+"'"+((d.media||[]).indexOf(c.use)>=0?" disabled":"")+">"+esc(d.name)+((d.media||[]).indexOf(c.use)>=0?" (on it)":"")+"</option>";}).join('')+"</select>":""):"";
return "<div class='mkcap' data-t='"+ti+"' data-c='"+ci+"'><div class='mkshot'>"+shot+"</div><div class='mkcapt'>"+esc(c.caption||c.name)+"</div><div class='mkcapm'>"+esc(MKKIND[c.kind]||c.kind)+(c.screen?" &middot; "+esc(c.screen):"")+(bx.length?" &middot; "+n+" of "+bx.length+" box"+(bx.length===1?"":"es")+" blurred":c.kind==='reel'?" &middot; its clips&#39; blur":" &middot; nothing to blur")+"</div>"+(bx.length?"<div class='mkchips'>"+bx.map(function(b,bi){return "<button type='button' class='mkchip"+(b.all?" on":"")+"' data-b='"+bi+"' aria-pressed='"+b.all+"' title='"+escQ(b.all?"blurred: click to show it":"shown: click to blur it")+"'>"+esc(b.kind)+(b.all?" &middot; blurred":" &middot; shown")+"</button>";}).join('')+"</div>":"")+(use?"<div class='mkuse'>"+use+"</div>":"")+"</div>";}).join('')+"</div>";}).join('');
if(sameHtml(el,h))return;
var at=function(x){var c=x.closest('.mkcap');return {t:ts[+c.getAttribute('data-t')],c:ts[+c.getAttribute('data-t')].items[+c.getAttribute('data-c')],el:c};};
el.querySelectorAll('.mkchip').forEach(function(c){var box=function(){return c.closest('.mkcap').querySelector(".mkbox[data-b='"+c.getAttribute('data-b')+"']");};c.addEventListener('mouseenter',function(){var x=box();if(x)x.classList.add('hl');});c.addEventListener('mouseleave',function(){var x=box();if(x)x.classList.remove('hl');});});
el.querySelectorAll('.mkbox,.mkchip').forEach(function(b){b.addEventListener('click',function(){var a=at(b),g=mkBoxes(a.c)[+b.getAttribute('data-b')];if(!g||a.el.classList.contains('busy'))return;a.el.classList.add('busy');
api('/api/marketing/tray/blur',{tray:a.t.rel,name:a.c.name,id:g.ids,on:!g.all}).then(function(r){a.el.classList.remove('busy');if(!r||r.error){mkMsg('err',esc((r&&r.error)||'failed'));return;}
mkMsg(r.rendered?'ok':'err',r.rendered?(g.all?"Shown: that box isn&#39;t blurred in it now.":"Blurred: that box is blurred in it now."):"Saved, but it isn&#39;t "+(g.all?"shown":"blurred")+" in the picture yet: "+esc(r.note||'it couldn&#39;t be blurred'));loadMkTray();}).catch(function(e){a.el.classList.remove('busy');mkMsg('err',esc(String((e&&e.message)||e)));});});});
var useIt=function(x,d){var a=at(x),dr=a.t.drafts[d];if(!dr)return;x.disabled=true;
api('/api/marketing/tray/use',{rel:dr.rel,file:a.c.use}).then(function(r){x.disabled=false;if(!r||r.error){mkMsg('err',esc((r&&r.error)||'failed'));return;}mkMsg('ok',"&ldquo;"+esc(dr.name)+"&rdquo; now shows "+esc(a.c.caption||a.c.name)+"."+(r.reopened?" It was approved with another, so it asks for your OK again.":""));loadMarketing();}).catch(function(e){x.disabled=false;mkMsg('err',esc(String((e&&e.message)||e)));});};
el.querySelectorAll('.mkuseb').forEach(function(b){b.addEventListener('click',function(){useIt(b,+b.getAttribute('data-d'));});});
el.querySelectorAll('.mkusel').forEach(function(s){s.addEventListener('change',function(){if(s.value!=='')useIt(s,+s.value);});});}
var MKDAY=function(s){var d=new Date(s+'T00:00:00');return isNaN(d)?s:d.toLocaleDateString(undefined,{day:'numeric',month:'short'});};
function renderMarketing(){var d=MKT,r=$('mkreplies'),t=$('mktest');if(!d||!r||!t)return;var rs=d.replies||[];
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
// ---- Dashboard: a card per page you watch (your inbox, GitHub, WhatsApp…), what's new on each ----
var BOARD=null;
// a chat's line says who its last message is from (watch.mjs fromOf): only unread ones count as waiting on you
var CHATFROM={them:'unread from them',you:'you sent the last one',unknown:'nothing unread, maybe yours'};
// Talk it over (watch.mjs boardChat): a chat on a card, open by its id, with what's half typed kept across a refresh
var BTALK={},BTALKDRAFT={},BTALKBUSY=0;
var TALKHINT="<div class='muted' style='font-size:12px'>Go over what's new here with your AI: what needs you, and what to say to whom. Then click <b>Draft a reply</b> on one, and your agent writes it the way you agreed here. Your AI is sent what this card lists (for mail: the sender, subject and preview).</div>";
function talking(){var f=document.activeElement;return BTALKBUSY>0||!!(f&&f.closest&&f.closest('.btalk'));}
var BOARDH=24;
function loadBoard(){api('/api/watch/board?hours='+BOARDH).then(function(b){if(b&&b.cards){BOARD=b;if(!talking())renderBoard();}});loadAwaiting();}
function boardMsg(cls,html){$('boardmsg').innerHTML="<div class='note "+cls+"'>"+html+"</div>";}

// Replies an agent's email waits on (handback.mjs): Symbiot watches your inbox for them, and hands each on when it's in
var AWAITWORD={waiting:'waiting',replied:'replied',error:"replied, but the next step didn't start"};
var AWAITS=[];
// An email an agent waits on a reply to sits on your inbox's current as a ring, where it was
// sent, with a thread to now: hollow while it waits, filled once the reply is in. Only with
// no inbox current to put it on does it fall back to a list here.
function bsWaitWord(){var n=(AWAITS||[]).filter(function(w){return w.status==='waiting';}).length;return n?' · waiting on '+n+(n===1?' reply':' replies'):'';}
function bsMailLane(){var cs=(BS.b&&BS.b.cards)||[];for(var i=0;i<cs.length;i++)if(cs[i].source==='mail')return i;return -1;}
function loadAwaiting(){api('/api/awaiting').then(function(d){var el=$('boardawait');if(!el||!d)return;var ws=d.waits||[];AWAITS=ws;if(BS.b)bsBuild(BS.b);
if(!ws.length){el.innerHTML='';return;}var open=ws.filter(function(w){return w.status==='waiting';}).length,s=d.sight;
// nothing can see the reply arrive: no inbox watched, or the one watched is signed out
var blind=s&&!s.sees?"<div class='note err'>"+((s.signedOut||[]).length?esc(s.signedOut[0])+" is signed out, so a reply would go unseen. Under Screens, type its address and click Sign in, sign in once and close the window.":"Symbiot can&#39;t see your inbox, so a reply would go unseen. Watch your inbox (map it under Screens, then Watch), or turn on Email in Settings.")+"</div>":"";
if(bsMailLane()>=0){el.innerHTML=blind;return;}
el.innerHTML="<div class='tgroup' style='margin-top:14px'>Waiting on replies <span class='tcount'>"+open+"</span></div><div class='muted' style='font-size:12px;margin-bottom:6px'>Emails your agents sent that need an answer. Symbiot looks for each reply in your inbox itself, and when one is in, the agent that does the next step starts on it. You don&#39;t have to say they replied.</div>"+blind+
ws.map(function(w){var who=(w.to||[]).join(', ')||'?',st=w.status==='waiting'?'waiting since '+agoTxt(w.sent):(AWAITWORD[w.status]||w.status)+(w.reply?' '+agoTxt(w.reply.ts):'')+(w.handed?' &rarr; '+(w.handed==='ops'?'an agent':esc(w.handed)+'&#39;s agent')+' has the next step':'');
return "<div class='task'><span class='t'><b>"+esc(who)+"</b>: "+esc(w.subject)+(w.asked?"<div class='muted' style='font-size:12px'>asked for: "+esc(w.asked)+"</div>":"")+(w.error?"<div class='note err'>"+esc(w.error)+"</div>":"")+"</span><span class='rp'"+(w.status==='waiting'?" style='color:var(--amber)'":"")+">"+st+"</span>"+(w.status==='waiting'?"<button class='ghost astop' data-id='"+esc(w.id)+"' title='stop looking for this reply' style='padding:3px 9px;font-size:12px'>Stop waiting</button>":"")+"</div>";}).join('');
el.querySelectorAll('.astop').forEach(function(btn){btn.addEventListener('click',function(){btn.disabled=true;api('/api/awaiting/stop',{id:btn.getAttribute('data-id')}).then(function(r){if(!r||r.error){btn.disabled=false;boardMsg('err',esc((r&&r.error)||'failed'));return;}loadAwaiting();});});});});}
// ---- Reports (reports.mjs): what agents wrote up in their .symbiot/, newest first, the
// unread ones marked. Opening one shows it here, as HTML the app made (escaped first).
var REPS=[],REPOPEN='';
function kb(n){return n<1024?n+' B':Math.round(n/1024)+' KB';}
function loadReports(){api('/api/reports').then(function(d){REPS=(d&&d.reports)||[];if(!REPOPEN)renderReports();}).catch(function(e){$('reportslist').innerHTML="<div class='note err'>"+esc(String((e&&e.message)||e))+"</div>";});}
function renderReports(){var el=$('reportslist');$('reportview').innerHTML='';REPOPEN='';
if(!REPS.length){el.innerHTML="<div class='muted' style='margin-top:12px'>No reports yet. When an agent writes up findings, an audit or a plan, it leaves it as a .md file in its folder&#39;s .symbiot, and it shows up here.</div>";return;}
var n=REPS.filter(function(r){return r.new;}).length;
el.innerHTML="<div class='tgroup' style='display:flex;align-items:center;gap:8px"+(n?";color:var(--amber)":"")+"'>"+(n?n+' unread':'All read')+" <span class='tcount'>of "+REPS.length+"</span>"+(n?"<button class='ghost' id='reportsseen' style='margin-left:auto;padding:3px 9px;font-size:12px;letter-spacing:0;text-transform:none'>Mark all read</button>":"")+"</div>"+
REPS.map(function(r,i){var where=!r.run||r.run===r.lane?esc(r.lane):r.run.indexOf(r.lane+':')===0?esc(r.run):esc(r.lane)+' &middot; '+esc(r.run);
return "<div class='task rrow"+(r.new?" rnew":"")+"' data-i='"+i+"' tabindex='0' role='button' title='"+escQ(r.file)+"'><span class='t'><b>"+esc(r.title)+"</b><div class='muted' style='font-size:12px'>"+(r.new?"<span style='color:var(--amber)'>unread</span> &middot; ":"")+where+" &middot; "+esc(r.name)+" &middot; "+kb(r.size)+(r.running?" &middot; <span style='color:var(--amber)'>its agent is still writing</span>":"")+"</div></span><span class='rp'>"+agoTxt(r.mtime)+"</span></div>";}).join('');
el.querySelectorAll('.rrow').forEach(function(row){var go=function(){openReport(REPS[+row.getAttribute('data-i')]);};row.addEventListener('click',go);row.addEventListener('keydown',function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();go();}});});
var s=$('reportsseen');if(s)s.addEventListener('click',function(){s.disabled=true;api('/api/reports/seen',{}).then(function(){loadReports();lqLoad(false);});});}
function openReport(r){if(!r)return;REPOPEN=r.id;var v=$('reportview');$('reportslist').innerHTML="<div class='row' style='margin-top:10px'><button class='ghost' id='reportback'>&larr; All reports</button><span class='muted' style='font-size:12px;overflow-wrap:anywhere'>"+esc(r.file)+"</span></div>";
$('reportback').addEventListener('click',function(){loadReports();renderReports();});v.innerHTML="<div class='out rdoc muted'>Opening&hellip;</div>";
api('/api/reports/read?id='+encodeURIComponent(r.id)).then(function(d){if(REPOPEN!==r.id)return;if(!d||d.error){v.innerHTML="<div class='note err'>"+esc((d&&d.error)||'failed')+"</div>";return;}
v.innerHTML="<div class='out rdoc'>"+d.html+"</div>"+repActsHtml(d);repImgs(v);repActsWire(v,d);var m=document.querySelector('main');if(m&&m.scrollTo)m.scrollTo(0,0);lqLoad(false);}).catch(function(e){v.innerHTML="<div class='note err'>"+esc(String((e&&e.message)||e))+"</div>";});}
$('reportsrefresh').addEventListener('click',function(){REPOPEN='';loadReports();});
// Its end: 2-4 ideas drawn from it, ticked straight onto the Workdesk in its lane, and a box
// to ask about it here (home.mjs reportIdeasAdd, reportAsk); a draft gets Approve / Reject.
// A report's images: their src carries the token; one that won't load says so; a click enlarges it.
function repImgs(v){v.querySelectorAll('img.rimg').forEach(function(im){im.addEventListener('error',function(){var s=document.createElement('span');s.className='rimgmiss';s.textContent='\u{1F5BC} Image missing: '+(im.alt||'')+' \u00b7 '+decodeURIComponent((im.getAttribute('data-src').split('&src=')[1]||''));im.replaceWith(s);});
im.addEventListener('click',function(){var z=document.createElement('div');z.className='rzoom';var b=document.createElement('img');b.src=im.src;b.alt=im.alt;z.appendChild(b);z.addEventListener('click',function(){z.remove();});document.addEventListener('keydown',function k(e){if(e.key==='Escape'){z.remove();document.removeEventListener('keydown',k);}});document.body.appendChild(z);});
im.src=im.getAttribute('data-src')+'&t='+encodeURIComponent(T);});}
function repActsHtml(d){var lane=d.lane==='ops'?'ops':esc(d.lane||'its lane'),h="<div class='out rdoc repacts'>";
if(d.draft)h+="<div class='pshead'><span>This is a draft</span><small>"+(d.decided?"you "+esc(d.decided)+" it":"only you decide: its agent goes ahead once you approve")+"</small></div><div class='row'><button class='act repdraft' data-ok='1'>Approve</button><button class='ghost repdraft' data-ok=''>Reject</button></div>";
else if((d.ideas||[]).length)h+="<div class='pshead'><span>Ideas from it</span><small>tick any to put them on the Workdesk, in "+lane+"</small></div>"+d.ideas.map(function(t,i){return "<label class='task repidea'><input type='checkbox' data-i='"+i+"'"+(i<3?" checked":"")+"> <span class='t'>"+esc(t)+"</span></label>";}).join('')+"<div class='row'><button class='act repadd'>Add to the Workdesk</button></div>";
h+="<form class='row repask' style='margin-top:12px'><input class='repq' autocomplete='off' maxlength='2000' placeholder='Ask Symbiot about this report&hellip;' style='flex:1'><button type='submit' class='ghost'>Ask</button></form><div class='repmsg'></div></div>";return h;}
function repActsWire(v,d){var msg=v.querySelector('.repmsg'),say=function(k,t){msg.innerHTML="<div class='note "+k+"'>"+t+"</div>";};
var add=v.querySelector('.repadd');if(add)add.addEventListener('click',function(){var picks=[];v.querySelectorAll('.repidea input').forEach(function(c){if(c.checked)picks.push(d.ideas[+c.getAttribute('data-i')]);});if(!picks.length){say('err','Tick an idea first.');return;}add.disabled=true;
api('/api/reports/ideas',{id:d.id,ideas:picks}).then(function(r){add.disabled=false;if(!r||r.error){say('err',esc((r&&r.error)||'failed'));return;}say('ok',esc(r.said));lqLoad(false);}).catch(function(e){add.disabled=false;say('err',esc(String((e&&e.message)||e)));});});
v.querySelectorAll('.repdraft').forEach(function(b){b.addEventListener('click',function(){var ok=!!b.getAttribute('data-ok');v.querySelectorAll('.repdraft').forEach(function(x){x.disabled=true;});
api('/api/reports/draft',{id:d.id,approve:ok}).then(function(r){if(!r||r.error){v.querySelectorAll('.repdraft').forEach(function(x){x.disabled=false;});say('err',esc((r&&r.error)||'failed'));return;}say('ok',esc(r.said));}).catch(function(e){say('err',esc(String((e&&e.message)||e)));});});});
var f=v.querySelector('.repask');if(f)f.addEventListener('submit',function(ev){ev.preventDefault();var q=f.querySelector('.repq'),bt=f.querySelector('button');if(!q.value.trim()){q.focus();return;}bt.disabled=true;say('muted','Thinking&hellip;');
api('/api/reports/ask',{id:d.id,question:q.value}).then(function(r){bt.disabled=false;if(!r||r.error){say('err',r&&r.error==='not-connected'?'Connect an AI in Settings to ask about it.':esc((r&&r.error)||'failed'));return;}msg.innerHTML="<div class='out' style='white-space:pre-wrap'>"+esc(r.answer||'')+"</div>";q.value='';lqLoad(false);}).catch(function(e){bt.disabled=false;say('err',esc(String((e&&e.message)||e)));});});}
// ---- the Dashboard as a stream ----------------------------------------------------
// Time runs left to right, one current per feed, "now" on the right. Each message
// is a bead placed when it arrived: amber and bigger when it needs you, small when
// read. A bead opens a popover with that message's own actions (the same buttons as
// the list below, wired by renderBoard's wire, each time it's drawn); a feed's name
// carries its Seen (its beads leave the stream: what's seen isn't waiting), Talk and
// Check now. Drawn in the look's liquid, with its own canvas.
var BS={G:null,beads:[],hot:null,on:false,b:null},BWIRE=null;
// A feed's short name: "Inbox - you@x.com - x Mail" reads as Inbox, with the address under it.
function bsName(c){var parts=String(c.name||'').split(' - '),acct=parts.filter(function(x){return x.indexOf('@')>=0;})[0]||'';return {n:parts[0]||c.name||'',sub:acct};}
function bsGeom(){var el=$('bstream'),w=(el&&el.clientWidth)||900,n=((BS.b&&BS.b.cards)||[]).length,narrow=w<720;
return {w:w,h:Math.max(300,80+n*118+44),x0:narrow?130:220,x1:w-(narrow?36:280),narrow:narrow,n:n};}
function bsBuild(b){BS.b=b;var ov=$('bsov'),el=$('bstream');if(!ov||!el)return;var cs=b.cards||[];if(!cs.length){ov.innerHTML='';return;}
var g=bsGeom();BS.gw=g.w;if(el.style)el.style.height=g.h+'px';var now=Date.now(),H=(b.hours||24)*3600000,laneY=function(i){return 60+(g.h-110)*(i+0.5)/Math.max(1,g.n);};
// every lane's line in one drawing, the same for each feed: none can come out without its line
var html="<svg class='blines' width='"+g.w+"' height='"+g.h+"' aria-hidden='true'><defs><linearGradient id='bslg' gradientUnits='userSpaceOnUse' x1='"+(g.x0-24)+"' x2='"+g.x1+"'><stop offset='0' stop-color='currentColor' stop-opacity='0'/><stop offset='.06' stop-color='currentColor' stop-opacity='.12'/><stop offset='.94' stop-color='currentColor' stop-opacity='.12'/><stop offset='1' stop-color='currentColor' stop-opacity='0'/></linearGradient></defs>"+cs.map(function(c,i){return "<rect class='bline' x='"+(g.x0-24)+"' y='"+Math.round(laneY(i))+"' width='"+(g.x1-g.x0+24)+"' height='1' fill='url(#bslg)'/>";}).join('')+"</svg>";
cs.forEach(function(c,i){var y=laneY(i);
var nm=bsName(c);html+="<div class='bcard blane' data-i='"+i+"' style='top:"+Math.round(y)+"px'><div class='bln' title='"+esc(c.name+(c.url?' \u00b7 '+c.url:''))+"'>"+esc(nm.n)+"</div>"+(nm.sub?"<div class='blsub'>"+esc(nm.sub)+"</div>":"")+"<div class='blc' title='"+(c.checked?"read "+agoTxt(c.checked):"")+"'>"+(c.count?"<b>"+esc(c.label)+"</b>":"quiet")+"</div><div class='bla'>"+(c.count?"<button class='bseen' title='set this feed back to 0: only what comes in after counts'>Seen</button>":"")+"<button class='btalkbtn' title='talk what&#39;s new here over with your AI before you draft a reply'>Talk"+((c.chat||[]).length?" "+Math.ceil(c.chat.length/2):"")+"</button><button class='bcheck' title='read it now'>Check now</button></div>"+(c.error?"<div class='ble'>"+esc(c.error)+"</div>":"")+"</div>";
if(c.brief&&!g.narrow)html+="<div class='blb' style='top:"+Math.round(y)+"px'>"+esc(c.brief.text.length>150?c.brief.text.slice(0,149)+'…':c.brief.text)+"</div>";});
var marks=b.hours===24?[18,12,6]:b.hours===72?[48,24]:[120,72,24];
marks.forEach(function(m){html+="<span class='btick' style='left:"+Math.round(g.x0+(1-m/(b.hours||24))*(g.x1-g.x0))+"px'>"+(m<48?m+'h ago':Math.round(m/24)+' days ago')+"</span>";});
html+="<span class='btick' style='left:"+g.x1+"px'>now</span><div class='bnow' style='left:"+g.x1+"px'></div>";
var old={};BS.beads.forEach(function(x){old[x.key]=x;});BS.beads=[];
cs.forEach(function(c,i){(c.items||[]).forEach(function(n,j){var age=Math.max(0,now-(n.ts||now));if(age>H)return;var key=c.id+':'+(n.id||j),o=old[key];
BS.beads.push({key:key,i:i,j:j,n:n,need:!!n.need&&!!(n.mail||n.chat),tx:g.x0+(1-age/H)*(g.x1-g.x0),ty:laneY(i),tr:n.need&&(n.mail||n.chat)?13:n.read?6:9,x:o?o.x:g.x1,y:o?o.y:laneY(i),r:o?o.r:0});});
});
html+=BS.beads.map(function(x,k){return "<button type='button' class='bbead' data-k='"+k+"' aria-label='"+esc(x.n.text||'')+"'></button>";}).join('');
var byLane={};BS.beads.forEach(function(x){(byLane[x.i]=byLane[x.i]||[]).push(x);});Object.keys(byLane).forEach(function(k){var L=byLane[k].slice().sort(function(a,b){return a.tx-b.tx;}),run=0;for(var q=1;q<L.length;q++){if(L[q].tx-L[q-1].tx<26){run++;L[q].ty+=(run%2?-1:1)*Math.ceil(run/2)*20;}else run=0;}});
var ml=bsMailLane();BS.waits=[];if(ml>=0)(AWAITS||[]).forEach(function(w,k){if(w.status!=='waiting'&&!(w.reply&&now-w.reply.ts<H))return;var sent=w.sent||now,age=Math.max(0,now-sent),x=g.x0+(1-Math.min(age,H)/H)*(g.x1-g.x0),y=laneY(ml)+(k%2?14:-14);BS.waits.push({w:w,x:x,y:y});
html+=(w.status==='waiting'?"<div class='bwthread' style='left:"+Math.round(x)+"px;width:"+Math.max(0,Math.round(g.x1-x))+"px;top:"+Math.round(y)+"px'></div>":"")+"<button type='button' class='bwait"+(w.status==='waiting'?'':' in')+(age>H?' early':'')+"' data-w='"+(BS.waits.length-1)+"' style='left:"+Math.round(x)+"px;top:"+Math.round(y)+"px' aria-label='"+escQ((w.status==='waiting'?'waiting on a reply from ':'reply in from ')+(w.to||[]).join(', '))+"'></button>";});
html+="<div class='btip' role='dialog' aria-live='polite'></div>";ov.innerHTML=html;
ov.querySelectorAll('.bwait').forEach(function(b){var i=+b.getAttribute('data-w');b.addEventListener('pointerenter',function(){bsShowWait(i);});b.addEventListener('focus',function(){bsShowWait(i);});b.addEventListener('click',function(){bsShowWait(i);});});
BS.btns=[];ov.querySelectorAll('.bbead').forEach(function(bt){BS.btns.push(bt);var k=+bt.getAttribute('data-k');bt.addEventListener('pointerenter',function(){bsShow(k);});bt.addEventListener('focus',function(){bsShow(k);});bt.addEventListener('click',function(){bsShow(k);});});
if(el.addEventListener&&!BS.wired){BS.wired=true;el.addEventListener('pointerleave',function(){bsShow(null);});el.addEventListener('keydown',function(e){if(e&&e.key==='Escape')bsShow(null);});}
if(BWIRE)BWIRE(ov);BS.hot=null;bsStart();}
function bsShowWait(i){var tip=document.querySelector('#bsov .btip'),x=BS.waits&&BS.waits[i];if(!tip||!x)return;BS.hot=null;BS.hotWait=i;var w=x.w,who=(w.to||[]).join(', ')||'?';
tip.innerHTML="<div class='bcard'><div class='bi'><div class='btf'>"+(w.status==='waiting'?'Waiting on a reply':'Reply in')+" <span>&middot; "+esc(who)+" &middot; "+(w.status==='waiting'?'sent '+agoTxt(w.sent):agoTxt(w.reply&&w.reply.ts))+"</span></div><div class='btx'>"+esc(w.subject||'')+(w.asked?"<div class='bwask'>Asked for: "+esc(w.asked)+"</div>":"")+(w.handed&&w.status!=='waiting'?"<div class='bwask'>"+(w.handed==='ops'?'An agent':esc(w.handed)+'&#39;s agent')+" has the next step.</div>":"")+(w.error?"<div class='bwask err'>"+esc(w.error)+"</div>":"")+"</div><div class='bta'>"+(w.status==='waiting'?"<button class='quiet bwstop'>Stop waiting</button><span class='bwnote'>Symbiot watches your inbox for it, and hands it on when it's in.</span>":"")+"</div></div></div>";tip.className='btip on';
var st=tip.querySelector('.bwstop');if(st)st.addEventListener('click',function(){st.disabled=true;api('/api/awaiting/stop',{id:w.id}).then(function(r){if(!r||r.error){st.disabled=false;boardMsg('err',esc((r&&r.error)||'failed'));return;}bsShow(null);loadAwaiting();});});}
function bsShow(k){var tip=document.querySelector('#bsov .btip');if(!tip)return;BS.hot=k;BS.hotWait=null;if(k==null||!BS.beads[k]){tip.className='btip';return;}
var x=BS.beads[k],c=BS.b.cards[x.i],n=x.n;tip.innerHTML="<div class='bcard' data-i='"+x.i+"'><div class='bi' data-j='"+x.j+"'><div class='btf'>"+esc(n.name||bsName(c).n)+" <span>&middot; "+esc(bsName(c).n)+" &middot; "+agoTxt(n.ts)+(n.from&&CHATFROM[n.from]?" &middot; "+CHATFROM[n.from]:"")+(n.read?" &middot; read":"")+"</span></div><div class='btx'>"+esc(n.text||'')+"</div><div class='bta'>"+(n.mail||n.chat?"<button class='bdraft'>"+(n.drafted?"Drafted &middot; again":"Draft a reply")+"</button>":"")+(n.href?"<button class='bopen"+(n.mail||n.chat?" quiet":"")+"'>Open</button>":"")+(n.chat&&n.drafted?"<button class='bopenwa quiet'>Open in WhatsApp</button>":"")+"</div></div></div>";
tip.className='btip on';if(BWIRE)BWIRE(tip);}
function bsStart(){if(BS.on)return;var raf=typeof window.requestAnimationFrame==='function'?function(f){return window.requestAnimationFrame(f);}:null;if(!raf)return;BS.on=true;
var loop=function(){var p=$('panel-board'),el=$('bstream');if(!p||!el||!p.offsetParent||(el.classList&&el.classList.contains('none'))){BS.on=false;return;}BS.fr=(BS.fr||0)+1;if(BS.fr%glEvery(true)===0)bsFrame();raf(loop);};raf(loop);}
function bsFrame(){var el=$('bstream'),cv=$('bsc');if(!el||!cv)return;if(!BS.G)BS.G=lqGL(cv,40);var g=bsGeom();if(BS.b&&BS.gw!==g.w){bsBuild(BS.b);g=bsGeom();}var t=LQ.t||0,still=LQ.theme&&LQ.theme.still;
BS.beads.forEach(function(x,k){var hot=BS.hot===k;x.x+=(x.tx-x.x)*0.12;x.y+=((x.ty+(still?0:Math.sin(t*0.8+k*1.3)*2))-x.y)*0.12;x.r+=((x.tr*(hot?1.35:1))-x.r)*0.15;
var bt=BS.btns&&BS.btns[k];if(bt&&bt.style){var R=Math.max(14,x.r+6);bt.style.width=bt.style.height=(2*R)+'px';bt.style.transform='translate('+Math.round(x.x-R)+'px,'+Math.round(x.y-R)+'px)';}});
var tip=document.querySelector('#bsov .btip');if(tip&&BS.hotWait!=null&&BS.waits&&BS.waits[BS.hotWait]){var wx=BS.waits[BS.hotWait],tw2=tip.offsetWidth||300,th2=tip.offsetHeight||140,tx2=Math.max(12,Math.min(g.w-tw2-12,wx.x-tw2/2)),ty2=wx.y-th2-16;if(ty2<8)ty2=wx.y+16;tip.style.transform='translate('+Math.round(tx2)+'px,'+Math.round(ty2)+'px)';}
else if(tip&&BS.hot!=null&&BS.beads[BS.hot]){var x=BS.beads[BS.hot],tw=tip.offsetWidth||300,th=tip.offsetHeight||120,tx=Math.max(12,Math.min(g.w-tw-12,x.x-tw/2)),ty=x.y-x.r-th-14;if(ty<8)ty=x.y+x.r+14;tip.style.transform='translate('+Math.round(tx)+'px,'+Math.round(ty)+'px)';}
var G=BS.G;if(!G)return;var gl=G.gl,d=glDpr(3),W=Math.max(1,Math.floor(g.w*d)),H=Math.max(1,Math.floor(g.h*d));if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;gl.viewport(0,0,W,H);}
var o=G.out;for(var i=0;i<o.length;i++)o[i]=0;var k=0,put=function(px,py,r,a){if(k>=40)return;o[k*4]=px/g.w;o[k*4+1]=py/g.h;o[k*4+2]=Math.max(0,r);o[k*4+3]=a;k++;};
(BS.b.cards||[]).forEach(function(c,i){put(g.x1,60+(g.h-110)*(i+0.5)/Math.max(1,g.n),c.count?9+2*Math.min(c.count,6):5,0);});
BS.beads.forEach(function(x){put(x.x,x.y,x.r,x.need?1:0);});
var th=LQ.theme||{},U=G.U;gl.uniform2f(U.uRes,W,H);gl.uniform1f(U.uT,t);gl.uniform1f(U.uDpr,d);gl.uniform4fv(U.uB,o);gl.uniform3f(U.uRip,0,0,-10);gl.uniform1f(U.uStyle,th.look==='glass'?0:th.look==='pearl'?2:1);gl.uniform1f(U.uContrast,th.contrast?1:0);gl.uniform1f(U.uExposure,th.night?0.82:1);gl.drawArrays(gl.TRIANGLES,0,3);}
function renderBoard(){var b=BOARD,cs=b.cards,el=$('board');
var tab=$('boardtab');if(tab)tab.textContent='Dashboard'+(b.total?' · '+b.total:'');
var bst=$('bstream');if(bst&&bst.classList)bst.classList.toggle('none',!cs.length);var bl=$('blist');if(bl&&!cs.length)bl.open=true;
if(!cs.length){$('boardsum').textContent='Everything you watch, side by side.';
el.innerHTML="<div style='grid-column:1/-1'><div class='note muted' style='margin-top:0'>Nothing watched yet. Map your inbox, a chat (web.whatsapp.com) or any page under <b>Screens</b> on the Map tab and click <b>Watch</b> on it, or click <b>Watch GitHub</b> there. Each one gets a card here with what's new on it.</div><div class='row' style='margin-top:8px'><button class='ghost' id='boardgo'>Go to Screens</button></div></div>";
$('boardgo').addEventListener('click',function(){setTab('map');var sbx=$('screensbox');if(sbx)sbx.open=true;var w=$('watchbox');if(w&&w.scrollIntoView)w.scrollIntoView({block:'center'});});return;}
var when=b.hours===24?'since yesterday':b.hours===72?'in the last 3 days':'in the last 7 days';
var lastRead=0;cs.forEach(function(c){if(c.checked>lastRead)lastRead=c.checked;});var sub=$('boardsub');if(sub)sub.textContent=(lastRead?'Read '+agoTxt(lastRead)+' \u00b7 ':'')+cs.length+(cs.length===1?' feed':' feeds')+bsWaitWord();
var waiting=cs.filter(function(c){return c.count;}).map(function(c){return c.label+(c.source==='page'?' on '+c.name:'');});
$('boardsum').innerHTML=waiting.length?"<b style='color:var(--bone)'>Waiting on you "+when+":</b> "+esc(waiting.join(', ')):"Nothing new "+when+" on the "+cs.length+" thing"+(cs.length===1?"":"s")+" you watch.";
el.innerHTML=cs.map(function(c,i){var nt=Math.ceil(((c.chat||[]).length)/2);
return "<div class='bcard"+(c.count?" has":"")+"' data-i='"+i+"'><div class='bh'><span class='bn' title='"+esc(c.url)+"'>"+esc(bsName(c).n)+"</span>"+(c.count?"<button class='ghost bseen' title='set this card back to 0: only what comes in after counts. It stays under Watching, and the other cards keep theirs' style='padding:4px 9px;font-size:12px'>Seen</button>":"")+"<button class='ghost btalkbtn' title='talk what&#39;s new here over with your AI before you draft a reply' style='padding:4px 9px;font-size:12px'>Talk"+(nt?" "+nt:"")+"</button><button class='ghost bcheck' title='read it now' style='padding:4px 9px;font-size:12px'>Check now</button></div>"
+"<div class='bc'>"+c.count+"</div><div class='bl'>"+esc(c.count?c.label.replace(/^\\d+ /,''):'nothing new')+" &middot; "+(c.checked?"read "+agoTxt(c.checked):c.last?"tried "+agoTxt(c.last):"first read within a minute")+(c.via==='gh'?" &middot; through gh":"")+"</div>"
+(c.error?"<div class='note err'>"+esc(c.error)+"</div>":"")
+(c.brief?"<div class='bbrief'>"+esc(c.brief.text)+"</div>":"")
+c.items.map(function(n,j){return "<div class='bi' data-j='"+j+"'><span class='t'>"+esc(n.text)+" <span class='muted' style='font-size:11px'>"+agoTxt(n.ts)+(n.from&&CHATFROM[n.from]?" &middot; "+CHATFROM[n.from]:"")+(n.read?" &middot; read":"")+"</span>"+custTag(n)+"</span>"+(n.href?"<button class='ghost bopen' title='open it in your browser'>Open</button>":"")+(n.mail||n.chat||n.social?"<button class='ghost bdraft' title='"+(n.chat?DRAFT_CHAT_TIP:n.social?DRAFT_SOCIAL_TIP:"your coding agent writes a reply and leaves it in Drafts. It never presses Send")+"'>"+(n.drafted?"Drafted &middot; again":"Draft a reply")+"</button>":"")+(n.chat&&n.drafted?"<button class='ghost bopenwa' title='"+OPEN_WA_TIP+"'>Open in WhatsApp</button>":"")+"</div>";}).join('')
+(c.count>c.items.length?"<div class='bl' style='margin-top:6px'>&hellip;and "+(c.count-c.items.length)+" more</div>":"")
+"</div>";}).join('');
var tk=$('boardtalk');if(tk)tk.innerHTML=cs.map(function(c,i){var nt=Math.ceil(((c.chat||[]).length)/2);return BTALK[c.id]?"<div class='bcard' data-i='"+i+"'><div class='bh'><span class='bn'>Talking over "+esc(c.name)+"</span><button class='ghost btalkbtn' style='padding:4px 9px;font-size:12px'>Close</button></div><div class='tchat btalk'><div class='msgs'>"+(nt?chatMsgs(c.chat):TALKHINT)+"</div><div class='row'><input class='talkq' placeholder='Ask about these, or say how to answer one...' style='flex:1'><button class='ghost talksend'>Ask</button><a class='talkclear' title='forget this conversation'>clear</a></div></div></div>":"";}).join('');
BWIRE=wire;bsBuild(b);
function card(btn){return cs[+btn.closest('.bcard').getAttribute('data-i')];}
function wire(el){if(!el||!el.querySelectorAll)return;
el.querySelectorAll('.btalkbtn').forEach(function(btn){btn.addEventListener('click',function(){var c=card(btn);BTALK[c.id]=!BTALK[c.id];renderBoard();var tk2=$('boardtalk'),q=BTALK[c.id]&&tk2&&tk2.querySelector(".bcard[data-i='"+cs.indexOf(c)+"'] .talkq");if(q&&q.focus)q.focus();});});
el.querySelectorAll('.btalk').forEach(function(box){var c=card(box),inp=box.querySelector('.talkq'),send=box.querySelector('.talksend'),msgs=box.querySelector('.msgs');
inp.value=BTALKDRAFT[c.id]||'';inp.addEventListener('input',function(){BTALKDRAFT[c.id]=inp.value;});
function ask(){var q=(inp.value||'').trim();if(!q||send.disabled)return;send.disabled=true;inp.value='';BTALKDRAFT[c.id]='';BTALKBUSY++;
if(!(c.chat&&c.chat.length))msgs.innerHTML='';
msgs.insertAdjacentHTML('beforeend',chatMsgs([{role:'user',text:q}])+"<div class='msg a muted thinking'>Thinking&hellip;</div>");
function done(){BTALKBUSY=Math.max(0,BTALKBUSY-1);send.disabled=false;var th=msgs.querySelector('.thinking');if(th)th.remove();}
api('/api/watch/chat',{id:c.id,question:q}).then(function(r){done();
if(r.error==='not-connected'){msgs.insertAdjacentHTML('beforeend',"<div class='msg a'>Connect a model in Settings to talk it over - Ollama is free and runs locally.</div>");return;}
if(r.error){msgs.insertAdjacentHTML('beforeend',"<div class='msg a err'>"+esc(r.error)+"</div>");return;}
c.chat=r.chat||[];msgs.innerHTML=chatMsgs(c.chat);var tb=box.closest('.bcard').querySelector('.btalkbtn');if(tb)tb.innerHTML='<i class=ic-chat></i> '+Math.ceil(c.chat.length/2);}).catch(function(e){done();msgs.insertAdjacentHTML('beforeend',"<div class='msg a err'>"+esc(String((e&&e.message)||e))+"</div>");});}
send.addEventListener('click',ask);inp.addEventListener('keydown',function(e){if(e.key==='Enter')ask();});
box.querySelector('.talkclear').addEventListener('click',function(){api('/api/watch/chat/clear',{id:c.id}).then(function(){c.chat=[];msgs.innerHTML=TALKHINT;var tb=box.closest('.bcard').querySelector('.btalkbtn');if(tb)tb.innerHTML='<i class=ic-chat></i>';});});});
el.querySelectorAll('.bopenwa').forEach(function(btn){btn.addEventListener('click',function(){openChatUI(item(btn),btn,boardMsg);});});
function item(btn){return card(btn).items[+btn.closest('.bi').getAttribute('data-j')];}
el.querySelectorAll('.bcheck').forEach(function(btn){btn.addEventListener('click',function(){var c=card(btn);btn.disabled=true;btn.textContent='Reading…';
api('/api/watch/check',{id:c.id}).then(function(x){if(!x||x.error)boardMsg('err',esc((x&&x.error)||'failed'));else boardMsg(x["new"]&&x["new"].length?'ok':'muted',watchCheckMsg(c,x));loadWatchUI();}).catch(function(e){btn.disabled=false;btn.textContent='Check now';boardMsg('err',esc(String((e&&e.message)||e)));});});});
// Seen: its count and blobs go at once, and it's saved (watch.json), so only what comes in after counts
el.querySelectorAll('.bseen').forEach(function(btn){btn.addEventListener('click',function(){var c=card(btn);if(!c)return;btn.disabled=true;
b.total=Math.max(0,(b.total||0)-(c.count||0));c.count=0;c.items=[];delete c.brief;renderBoard();
api('/api/watch/seen',{id:c.id}).then(function(x){if(!x||x.error)boardMsg('err',esc((x&&x.error)||'failed'));else $('boardmsg').innerHTML='';loadBoard();lqLoad(false);}).catch(function(e){boardMsg('err',esc(String((e&&e.message)||e)));loadBoard();});});});
el.querySelectorAll('.bopen').forEach(function(btn){btn.addEventListener('click',function(){var n=item(btn);if(n&&/^https?:/.test(n.href))window.open(n.href,'_blank','noopener');});});
el.querySelectorAll('.bdraft').forEach(function(btn){btn.addEventListener('click',function(){var n=item(btn);btn.disabled=true;
api('/api/watch/draft',{id:n.id}).then(function(x){btn.disabled=false;if(!x||x.error){boardMsg('err',esc((x&&x.error)||'failed'));return;}boardMsg('ok',x.chat?DRAFTING_CHAT:x.social?DRAFTING_SOCIAL:DRAFTING);loadWatchUI();}).catch(function(e){btn.disabled=false;boardMsg('err',esc(String((e&&e.message)||e)));});});});}
wire(el);wire($('boardtalk'));}
$('boardrefresh').addEventListener('click',loadBoard);
if(document.addEventListener)document.addEventListener('click',function(ev){var t=ev&&ev.target;if(!t||!t.closest)return;var tx=t.closest('#panel-tasks .task .t');if(!tx||t.closest('a,button,input,textarea,summary'))return;var sel=window.getSelection?String(window.getSelection()):'';if(sel)return;var row=tx.closest('.task');if(row&&row.classList)row.classList.toggle('open');});
// a repo run's sandbox, under Symbiosis: on, or what this computer still needs for it (agents.mjs sandboxState)
function sandboxNote(r){var el=$('agentsandbox');if(!el)return;var b=r&&r.sandbox;if(!b||!r.full){el.innerHTML='';return;}
el.innerHTML=b.ready&&b.on?"<b>Sandboxed</b> &middot; a repo run&rsquo;s commands also write only in its repo, your folders and the npm and download caches, and can&rsquo;t reach your keys or step out of it. Ops runs, whose job is this computer, keep the membrane alone.":b.unsupported||!b.on?'':"<b>Not sandboxed yet</b> &middot; repo runs would also be held to their repo and your folders, but this computer needs "+b.missing.map(function(m){return '<code>'+esc(m)+'</code>';}).join(' and ')+" first (<code>sudo apt install "+esc(b.missing.map(function(m){return m==='bwrap'?'bubblewrap':m;}).join(' '))+"</code>). Until then they have the membrane.";}
var atr=$('agenttrust');if(atr&&atr.addEventListener){api('/api/agent/trust').then(function(r){if(r)atr.checked=!!r.full;sandboxNote(r);}).catch(function(){});atr.addEventListener('change',function(){api('/api/agent/trust/set',{full:atr.checked}).then(function(r){if(r)atr.checked=!!r.full;sandboxNote(r);});});}
var bw=$('boardwin');if(bw&&bw.querySelectorAll)bw.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){BOARDH=+b.getAttribute('data-h')||24;bw.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-checked',x===b?'true':'false');});loadBoard();});});
// A web page, mapped by itself in the hidden browser (headless.mjs): no capture,
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
if(w.latest)n.push("Latest write-up: "+esc(new Date(w.latest.at).toLocaleString())+" &middot; <span style='font-family:ui-monospace,monospace'>"+esc(w.latest.file)+"</span> (also in the Week tab)");
n.push(a.on&&a.phone==='app'?"Symbiot starts in the background when the phone starts, and keeps running with its window closed (Stop it from its notification).":a.on&&a.phone?"Termux:Boot starts it from <span style='font-family:ui-monospace,monospace'>"+esc(a.file)+"</span> when the phone starts. Open Termux:Boot once after installing it, so Android lets it run.":a.on?"Starts at login from <span style='font-family:ui-monospace,monospace'>"+esc(a.file)+"</span>. Run <b>symbiot app</b> to open its window.":"The weekly write-up happens while Symbiot is running, so start it at login to have it every week. A week missed while the computer was off is written when Symbiot next starts.");
$('desktopnote').innerHTML=n.join('<br>');}
function loadDesktop(err){api('/api/desktop').then(function(d){if(d&&err)d.error=err;renderDesktop(d);});}
function saveWeekly(){api('/api/desktop/weekly',{on:$('weeklyon').checked,day:$('weeklyday').value,hour:$('weeklyhour').value}).then(function(){loadDesktop();});}
function saveAutostart(){api('/api/desktop/autostart',{on:$('autostart').checked}).then(function(a){loadDesktop(a&&a.error);});}
function weeklyNow(){var b=$('weeklynow');b.disabled=true;b.textContent='Writing...';
api('/api/desktop/weekly/run',{}).then(function(r){b.disabled=false;b.textContent='Write it now';loadDesktop(r&&r.error?(r.error==='not-connected'?'Connect an AI above first.':r.error):'');});}
function showLatestWeek(){api('/api/desktop').then(function(d){var l=d&&d.weekly&&d.weekly.latest;if(!l||current!=='week'||$('out').textContent!==WUEMPTY)return;
WUTEXT=l.text;$('out').innerHTML=mdLite(l.text);$('out').classList.remove('muted');$('copy').classList.remove('hidden');var f=$('outfoot');f.textContent='Written automatically '+new Date(l.at).toLocaleString()+' · '+l.file+(l.footer?' · '+l.footer:'');f.style.display='block';});}
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
document.getElementById('remap').addEventListener('click',loadMap);
document.getElementById('recbtn').addEventListener('click',loadRec);
document.getElementById('setuplocal').addEventListener('click',setupLocalUI);
document.getElementById('addroot').addEventListener('click',addRootUI);
document.getElementById('newroot').addEventListener('keydown',function(e){if(e.key==='Enter')addRootUI();});
$('addknow').addEventListener('click',addKnowUI);
['newknow','newknowex'].forEach(function(id){$(id).addEventListener('keydown',function(e){if(e.key==='Enter')addKnowUI();});});
document.getElementById('addtrusted').addEventListener('click',addTrustedUI);
document.getElementById('addsitego').addEventListener('click',addSiteUI);
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
function heartbeat(fresh){
  var q=[];if(fresh)q.push('fresh=1');if(WIN_ID){q.push('w='+WIN_ID);if(WIN_NEW)q.push('new=1');}
  api('/api/ping'+(q.length?'?'+q.join('&'):'')).then(function(p){
    if(WIN_ID){WIN_NEW=false;if(p&&p.window&&p.window!==WIN_ID){if(!$('winold'))winOld();return;}}
    var b=ubar();
    var ve=document.getElementById('ver');if(ve&&p.version){ve.textContent='v'+p.version+(p.sandbox?' · sandbox':'');if(p.sandbox){ve.title='A brand-new Symbiot to try first run in (symbiot app --fresh): its own empty home, none of your data, accounts or memory. It is deleted when you quit.';ve.style.color='var(--amber)';}}
    if(SRV_STARTED===null){SRV_STARTED=p.started;appBar(p);}
    else if(p.started!==SRV_STARTED){location.reload();return;}
    if(srvDown){location.reload();return;}
    if(updBusy||selIn(b))return; // not under text you're selecting in it
    // Loop guard: if we already tried to update to this version and we're still
    // not on it after the restart, the install isn't advancing — stop offering
    // the button (which just loops) and tell them to update manually.
    var tried=null;try{tried=localStorage.getItem('symbiot_update_tried');}catch(e){}
    if(tried){
      if(p.version!==tried){try{localStorage.removeItem('symbiot_update_tried');}catch(e){} } // advanced → success, clear
      else if(p.retrying){ // npm hasn't finished publishing it: the app is trying again by itself
        b.className='updatebar show';b.innerHTML="Updating to "+esc(p.retrying.target)+": npm is still publishing it, so Symbiot tries again every 30 seconds (try "+p.retrying.attempt+" of 5). Nothing to do.";return;
      }
      else if(p.latest&&p.newer){ // still on the same version → the install didn't advance
        b.className='updatebar reconnect show';
        b.innerHTML="Auto-update to "+esc(p.latest)+" didn't take (still on "+esc(p.version)+"). Run <code>npm install -g symbiot@latest</code> in a terminal, then restart.";
        return;
      }
    }
    if(p.latest&&p.newer){
      b.className='updatebar show';
      b.innerHTML="A new Symbiot ("+esc(p.latest)+") is available &mdash; you're on "+esc(p.version)+". <button id='updnew'>What&#39;s new</button> <button id='doupd'>Update &amp; restart</button>";
      var btn=document.getElementById('doupd');if(btn)btn.onclick=doUpdate;
      var nb=document.getElementById('updnew');if(nb)nb.onclick=function(){api('/api/whatsnew?latest=1').then(function(r){showNews(r,"What Symbiot "+(r.version||p.latest)+" brings",false);});};
    }else{b.className='updatebar';}
  }).catch(function(){srvDown=true;var b=ubar();b.className='updatebar reconnect show';b.textContent='Reconnecting to Symbiot…';});
}
// Symbiot in Termux, open in the phone's browser: offer Symbiot's Android app,
// which shows this same Symbiot full screen (Chrome hands an intent:// link to it)
function appBar(p){var b=$('appbar');if(!b||!p.termux||window.SymbiotAndroid||typeof navigator==='undefined'||!/Android/i.test(navigator.userAgent||''))return;
  try{if(localStorage.getItem('symbiot_appbar_off'))return;}catch(e){}
  var go=('intent://'+location.host+'/'+location.search+'#Intent;scheme=symbiot;package=co.symbiot.app;end').replace(/'/g,'%27');
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
function doUpdate(){updBusy=true;try{localStorage.setItem('symbiot_update_tried',document.getElementById('ver').textContent.replace(/^v/,''));}catch(e){}var b=ubar();b.className='updatebar show';b.textContent='Updating & restarting… this page will reload itself when it is back.';api('/api/update',{});}
setInterval(heartbeat,4000);heartbeat(true);
window.addEventListener('focus',function(){heartbeat(true);}); // re-check for updates when you come back to the window


// ---- the work scene ------------------------------------------------------------------
// The Workdesk, in the liquid: what each agent is doing (spheres revolve round
// it while it works), what's done and waiting for your OK, and what's waiting its
// turn. One Go starts what's waiting. A tap opens the details; nothing else to read.
function lqWork(){lqRemember();LQ.scene='work';LQ.mode='aware';var sc=$('lqscene');if(sc)sc.textContent=LQ.workBy==='project'?'Projects':'Workdesk';var b=document.body;if(b&&b.classList){b.classList.add('lq-work');b.classList.toggle('lq-byproj',LQ.workBy==='project');b.classList.remove('lq-pooled');}lqLoadWork();
if(LQ.workTimer)clearInterval(LQ.workTimer);LQ.workTimer=setInterval(function(){if(LQ.scene==='work'&&LQ.mode!=='pool')lqLoadWork();},5000);}
function lqHome(){lqRemember();LQ.scene='home';LQ.relaySig='';var rl=$('lqrelay');if(rl)rl.innerHTML='';var li=$('lqline');if(li)li.innerHTML='';var b=document.body;if(b&&b.classList){b.classList.remove('lq-work');b.classList.remove('lq-byproj');b.classList.remove('lq-pooled');}if(LQ.workTimer){clearInterval(LQ.workTimer);LQ.workTimer=null;}LQ.mode='aware';lqLoad(true);}

// ---- the relay: Agents, on the Tasks screen ----------------------------------------
// One line for where everything stands, then a blob per project with something to say:
// what its agent did or is doing, what it asks you (its answers as buttons, as on
// home), Review and approve when it's ready, and the extra tasks it suggests (+ task
// or Skip). You needn't open Agents; it's still there for the detail.
function lqLineText(w){var nr=(w.running||[]).length,nq=0,ni=0,nk=(w.ready||[]).length,nw=w.waitingCount||0;(w.projects||[]).forEach(function(p){nq+=p.asks||0;ni+=(p.ideas||[]).length;});
var bits=[];if(nq)bits.push('<b>'+nq+' question'+(nq>1?'s':'')+' for you</b>');if(nk)bits.push('<b>'+nk+' ready for your OK</b>');if(nr)bits.push(nr+' at work');if(nw)bits.push(nw+' waiting');if(ni)bits.push(ni+' suggested task'+(ni>1?'s':''));
return bits.length?bits.join(' &middot; '):'All quiet: nothing at work, nothing asking you.';}
function lqRelayList(w){return lqSortLanes((w.projects||[]).filter(function(p){return p.summary||(p.qs&&p.qs.length)||p.ready||(p.ideas&&p.ideas.length);}).slice());}
function lqRelayOn(){var S=lqSize();return LQ.scene==='work'&&S.w>=900&&lqRelayList(LQ.workData||{}).length>0;}
function lqRelay(){var el=$('lqrelay'),ln=$('lqline'),w=LQ.workData||{};if(ln)ln.innerHTML=LQ.scene==='work'?lqLineText(w):'';if(!el)return;
var ps=lqRelayList(w),sig=JSON.stringify(ps.map(function(p){return [p.repo,p.summary,p.state,p.ready,(p.qs||[]).map(function(q){return q.q;}),(p.ideas||[]).map(function(i){return i.full;}),p.parked];}));
if(el.contains&&document.activeElement&&el.contains(document.activeElement)&&el.innerHTML)return;if(sig===LQ.relaySig&&el.innerHTML)return;LQ.relaySig=sig;
if(!ps.length){el.innerHTML='';return;}
el.innerHTML=ps.map(function(p,i){var nm=p.name||p.repo,q=(p.qs||[])[0],st=p.parked?'parked':(p.qs&&p.qs.length)?'asks you':p.ready?'ready for your OK':p.state||'';
var h="<section class='rly"+((p.qs&&p.qs.length)||p.ready?' lit':'')+"' data-i='"+i+"'><div class='rlh'><b>"+esc(nm)+"</b>"+(st?"<span class='rls'>"+esc(st)+"</span>":"")+"</div>";
if(p.summary)h+="<p class='rlsum' title='"+escQ(p.summary)+"'>"+esc(p.summary)+"</p>";
if(q)h+="<div class='lqblob rlask'>"+blobBody({kind:'ask',name:nm,repo:p.repo,q:q.q,options:q.options,path:q.path,fix:q.fix,id:q.id,sub:q.sub,draft:q.draft,signInTo:q.signInTo,more:Math.max(0,(p.asks||p.qs.length)-1)},false)+"</div>";
if(p.ready)h+="<button type='button' class='act rlok'>Review and approve</button>";
if(p.ideas&&p.ideas.length)h+="<div class='rlk'>Extra tasks it suggests</div>"+p.ideas.map(function(d,j){return "<div class='rli' data-j='"+j+"'><span title='"+escQ(d.full)+"'>"+esc(d.text)+"</span><span class='rlia'><button type='button' class='rladd'>+ task</button><button type='button' class='rlskip'>Skip</button></span></div>";}).join('');
return h+"<div class='rlf'><button type='button' class='rlopen'>Its tasks &rsaquo;</button><button type='button' class='rlag'>Its agents &rsaquo;</button></div></section>";}).join('');
el.querySelectorAll('.rly').forEach(function(box){var p=ps[+box.getAttribute('data-i')],q=(p.qs||[])[0],nm=p.name||p.repo;
var ab=box.querySelector('.rlask');if(ab&&q)wireBlob(ab,{kind:'ask',name:nm,repo:p.repo,q:q.q,options:q.options,path:q.path,fix:q.fix,id:q.id},{done:function(){LQ.relaySig='';lqLoadWork();}});
var ok=box.querySelector('.rlok');if(ok)ok.addEventListener('click',function(){lqOpen({kind:'proj',repo:p.repo,lit:true});});
box.querySelector('.rlopen').addEventListener('click',function(){lqOpen({kind:'proj',repo:p.repo});});
box.querySelector('.rlag').addEventListener('click',function(){lqPool('agents');});
box.querySelectorAll('.rli').forEach(function(row){var d=p.ideas[+row.getAttribute('data-j')],a=row.querySelector('.rladd'),k=row.querySelector('.rlskip');
a.addEventListener('click',function(){a.disabled=k.disabled=true;api('/api/tasks/add',{text:d.full,repo:d.repo}).then(function(r){if(!r||r.error){a.disabled=k.disabled=false;lqSaid(nm+': '+((r&&r.error)||'couldn’t add it'),true);return;}row.querySelector('.rlia').innerHTML="<span class='rldone'>in Tasks</span>";lqSaid('Added to '+nm+'’s tasks.');});});
k.addEventListener('click',function(){a.disabled=k.disabled=true;api('/api/agents/skip',{path:d.path,text:d.full}).then(function(r){if(!r||r.error){a.disabled=k.disabled=false;lqSaid(nm+': '+((r&&r.error)||'couldn’t skip it'),true);return;}if(row.classList)row.classList.add('gone');setTimeout(function(){row.remove();},300);});});});});}
function lqLoadWork(){api('/api/work').then(function(w){LQ.workData=w||{};lqRedraw();}).catch(function(){});}
// New data, drawn: unless you're selecting text on the surface, then once you let go
function lqRedraw(){whenFree($('liquid'),'liquid',function(){if(LQ.scene==='work')lqBuildWork();else lqBuild();});}
function lqBuildWork(){lqRelay();if(LQ.workBy==='project'){lqBuildProjects();return;}var w=LQ.workData||{},S=lqSize(),cx=S.w/2,cy=S.h*0.5,list=[];LQ.bw=S.w;LQ.bh=S.h;if(lqRelayOn()){var RW=Math.min(420,S.w*0.32)+28;S={w:S.w-RW,h:S.h,s:S.s};cx=S.w/2;}
var vx=Math.max(0.5,Math.min(S.s*1.3,(S.w/2-90)/400)),vy=Math.max(0.35,Math.min(S.s*0.8,(S.h-cy-230)/400,(cy-160)/400)),rs=Math.min(S.s,(vx+vy)/1.5);
var run=(w.running||[]).slice(0,3),ready=(w.ready||[]).slice(0,2),wait=(w.waiting||[]).slice(0,5),extra=(w.waitingCount||0)-wait.length;
run.forEach(function(r,i){var ang=Math.PI+(i+1)*Math.PI/(run.length+1);var pg=r.step?' · step '+r.step+' of '+r.of:r.progress?' · '+r.progress.done+' of '+r.progress.total+' done':'';
list.push({id:r.id,kind:'run',repo:r.name,shape:'agents',ask:r.waiting||!!(r.quiet||r.looping),title:r.doing,sub:r.name+pg+(r.eta?' · '+r.eta:'')+(r.waiting?' · has a question for you':'')+(r.quiet||r.looping?' · '+runWarn(r).replace(/ · $/,''):''),r:58*rs,tx:cx+Math.cos(ang)*190*vx,ty:cy+Math.sin(ang)*130*vy});});
ready.forEach(function(r,i){var ang=-Math.PI/2+(i-(ready.length-1)/2)*0.9;list.push({id:r.id,kind:'ready',repo:r.repo,shape:'tasks',title:'Ready for your OK',sub:r.repo+(r.count?' · '+r.count+' task'+(r.count>1?'s':'')+' done':''),r:48*rs,tx:cx+Math.cos(ang)*300*vx,ty:cy+Math.sin(ang)*300*vy});});
wait.forEach(function(t,i){var ang=Math.PI/2+(i-(wait.length-1)/2)*0.55;var y=t.why||{};list.push({id:t.id,kind:'wait',repo:t.repo,shape:'tasks',title:t.text,sub:y.text||(t.repo+(t.busy?' · after the current one':' · waiting')),ask:!!(y.stuck||y.path),focus:y.path||'',r:30*rs,tx:cx+Math.cos(ang)*300*vx,ty:cy+Math.sin(ang)*260*vy});});
if(extra>0)list.push({id:'morewait',kind:'more',shape:'tasks',title:'+'+extra+' more waiting',sub:'see them all',r:24*rs,tx:S.w-Math.max(80,S.w*0.1),ty:S.h-230});
lqGrow(list,cx,cy,vx,vy);list.forEach(function(d){d.ax=d.tx;d.ay=d.ty;});
var wl=[];list.forEach(function(d,i){if(d.kind!=='wait'&&d.kind!=='ready')return;list.forEach(function(e,j){if(e.kind==='run'&&e.repo===d.repo)wl.push([j,i,0.5]);});});lqSeed(list,wl,cx,cy,vx,vy);lqNear(list,wl,cx,cy,92*rs,S);lqRelax(list,S,cx,cy,92*S.s);
var old={};LQ.drops.forEach(function(d){old[d.id]=d;});
LQ.drops=list.map(function(d){var o=old[d.id];d.x=o?o.x:cx;d.y=o?o.y:cy;d.vx=o?o.vx:0;d.vy=o?o.vy:0;d.cr=o?o.cr:0;return d;});
var nr=(w.running||[]).length,nw=w.waitingCount||0,nk=(w.ready||[]).length;
LQ.coreText=(nr?nr+' at work':'Nobody at work')+(nw?' · '+nw+' waiting':'')+(nk?' · '+nk+' ready for your OK':'');
var go=$('lqgo');if(go){var n=w.canGo||0;go.textContent=n?'Go \u00b7 start '+n+' task'+(n>1?'s':''):'';if(go.classList)go.classList.toggle('on',n>0);}
lqLabels();}
// Projects: a sphere per lane with work on it, sized by how much is going on, its
// state under its name (the name people use: CallForge AI is Dailify); spheres orbit
// while an agent works, amber (lit) when something there needs you. In order
// (lqSort: what needs you first, the most recent, or A to Z), clockwise from the
// left (the screen is wider than it's tall), so where one sits says where it ranks
// and stays put while nothing changes;
// the quieter rest under one "more". A click opens that project's tasks, and a
// lit one opens with what lit it lit up (lqFocus).
var LANESORT='need';try{LANESORT=(window.localStorage&&window.localStorage.getItem('symbiot-lanesort'))||'need';}catch(e){}
function lqSortLanes(ps){if(LANESORT==='name')return ps.sort(function(a,b){var x=String(a.name||a.repo).toLowerCase(),y=String(b.name||b.repo).toLowerCase();return x<y?-1:x>y?1:0;});
if(LANESORT==='recent')return ps.sort(function(a,b){return (b.last||0)-(a.last||0)||(b.lit?1:0)-(a.lit?1:0);});return ps;}
function lqSort(s){LANESORT=s;try{if(window.localStorage)window.localStorage.setItem('symbiot-lanesort',s);}catch(e){}var g=$('lqsort');if(g&&g.querySelectorAll)g.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-checked',b.getAttribute('data-sort')===s?'true':'false');});lqAct();if(LQ.scene==='work'&&LQ.workBy==='project')lqBuildProjects();}
function lqBuildProjects(){var w=LQ.workData||{},S=lqSize(),cx=S.w/2,cy=S.h*0.5,list=[];LQ.bw=S.w;LQ.bh=S.h;if(lqRelayOn()){var RW=Math.min(420,S.w*0.32)+28;S={w:S.w-RW,h:S.h,s:S.s};cx=S.w/2;}
var vx=Math.max(0.5,Math.min(S.s*1.3,(S.w/2-90)/400)),vy=Math.max(0.35,Math.min(S.s*0.8,(S.h-cy-230)/400,(cy-160)/400)),rs=Math.min(S.s,(vx+vy)/1.5);
var all=lqSortLanes((w.projects||[]).slice()),cap=S.w<700?5:7,ps=all.slice(0,cap),rest=all.slice(cap),slots=Math.max(3,ps.length+(rest.length?1:0));
ps.forEach(function(p,i){var ang=Math.PI+i*2*Math.PI/slots,load=p.waiting+2*p.ready+(p.running?3:0)+2*Math.min(2,p.asks||0);
var sub=p.asks?p.asks+' question'+(p.asks>1?'s':'')+' for you':p.ready?'ready for your OK':p.runs>1?p.runs+' agents at work':p.running?(p.running.ask?'has a question for you':p.running.quiet||p.running.looping?runWarn(p.running).replace(/ · $/,''):p.running.line?String(p.running.line)+(p.running.eta?' · '+p.running.eta:''):'agent at work: '+String(p.running.doing||'').toLowerCase()):p.waiting+' task'+(p.waiting>1?'s':'')+' waiting';if(p.parked)sub='parked \\u00b7 '+sub;
list.push({id:'proj:'+p.repo,kind:'proj',repo:p.repo,shape:'tasks',title:p.name||p.repo,sub:sub,orbit:!!p.running,ask:!!p.lit,lit:!!p.lit,parked:!!p.parked,r:(30+7*Math.min(6,load))*rs,tx:cx+Math.cos(ang)*260*vx,ty:cy+Math.sin(ang)*260*vy});});
if(rest.length){var am=Math.PI+ps.length*2*Math.PI/slots;list.push({id:'moreproj',kind:'more',title:'+'+rest.length+' more',sub:'quieter: '+rest.map(function(p){return p.name||p.repo;}).join(' · '),lanes:rest.map(function(p){return {repo:p.repo,name:p.name||p.repo,lit:!!p.lit};}),r:24*rs,tx:cx+Math.cos(am)*260*vx,ty:cy+Math.sin(am)*260*vy});}

list.forEach(function(d){d.ax=d.tx;d.ay=d.ty;});lqRelax(list,S,cx,cy,92*S.s);
var old={};LQ.drops.forEach(function(d){old[d.id]=d;});
LQ.drops=list.map(function(d){var o=old[d.id];d.x=o?o.x:cx;d.y=o?o.y:cy;d.vx=o?o.vx:0;d.vy=o?o.vy:0;d.cr=o?o.cr:0;return d;});
var n=w.projectCount||list.length,nr=(w.running||[]).length,nw=w.waitingCount||0;
LQ.coreText=n?n+' project'+(n>1?'s':'')+(nr?' \u00b7 '+nr+' at work':'')+(nw?' \u00b7 '+nw+' tasks waiting':''):'No projects with work on them yet. Tell me what to do.';
var go=$('lqgo');if(go){var k=w.canGo||0;go.textContent=k?'Go \u00b7 start '+k+' task'+(k>1?'s':''):'';if(go.classList)go.classList.toggle('on',k>0);}
lqLabels();}
function lqGoWork(){var go=$('lqgo');if(go)go.disabled=true;api('/api/work/go',{}).then(function(r){if(go)go.disabled=false;
var t=r&&r.error?r.error:r.started||r.queued?(r.started?'Started '+r.started:'')+(r.started&&r.queued?', ':'')+(r.queued?r.queued+' queued behind work already going':'')+'.':(r&&r.note)||(r&&r.parked?'':'Nothing waiting to start.');
if(r&&r.parked&&r.parked.length)t=(t?t+' ':'')+'Not started, parked: '+r.parked.map(lqProjName).join(', ')+'.';
LQ.talk.push({me:false,text:t});LQ.talk=LQ.talk.slice(-8);lqTalkShow(false);LQ.ripple=[0.5,0.5,LQ.t];lqLoadWork();}).catch(function(){if(go)go.disabled=false;});}
// ---- the liquid: the app's home ---------------------------------------------------
// One silver surface is the app. Its droplets: what only you can do, what's new on
// what you watch, and the parts of the app, sized and placed from how you use them
// (adapt.mjs: Fitts, Hick, hysteresis); filled from real data (home.mjs). Opening
// one pools it: that part's panel opens over the liquid. Droplets move as
// critically damped springs that push each other apart, and the liquid they hold
// comes out of the core (mass is conserved). Your colours come from the system,
// live: light or dark, contrast, transparency, forced colours, your accent, night.
var LQ={drops:[],btns:[],core:{x:0,y:0,cr:0},mode:'aware',last:'',lastAct:Date.now(),talk:[],talking:false,theme:{},ripple:[0.5,0.5,-10],t:0,pointer:null,touch:false,frame:0};
var LQNAMES={board:'Dashboard',map:'Map',tasks:'Workdesk',agents:'Workdesk',week:'Week',standup:'Standup',todo:'Todo',drift:'Drift',settings:'Settings',reports:'Reports',marketing:'Marketing',computer:'Your computer'};
var LQ_REST=60000,LQ_MAX=11;
function lqMM(q){try{return !!(window.matchMedia&&window.matchMedia(q).matches);}catch(e){return false;}}
function lqLookGet(){var l='';try{l=window.localStorage&&window.localStorage.getItem('symbiot-look')||'';}catch(e){}return l==='glass'||l==='pearl'?l:'ferro';}
function lqLook(l){try{if(window.localStorage)window.localStorage.setItem('symbiot-look',l);}catch(e){}lqTheme();lqIcon(l);api('/api/look',{look:l}).catch(function(){});var g=$('lqlook');if(g&&g.querySelectorAll)g.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-checked',b.getAttribute('data-look')===l?'true':'false');});LQ.ripple=[0.5,0.47,LQ.t||0];}
function lqTheme(){var look=lqLookGet();var th={look:look,light:look!=='ferro',contrast:lqMM('(prefers-contrast: more)'),forced:lqMM('(forced-colors: active)'),solid:lqMM('(prefers-reduced-transparency: reduce)'),still:lqMM('(prefers-reduced-motion: reduce)'),wide:lqMM('(color-gamut: p3)'),night:false,accent:null};
var h=new Date().getHours();th.night=h>=22||h<6;
try{if(document.createElement&&typeof getComputedStyle==='function'&&document.body&&document.body.appendChild){var a=document.createElement('span'),b=document.createElement('span');a.style.color='AccentColor';b.style.color='CanvasText';document.body.appendChild(a);document.body.appendChild(b);
if(a.style.color){var ca=getComputedStyle(a).color,cb=getComputedStyle(b).color;if(ca&&ca!==cb){var m=ca.match(/[0-9.]+/g);if(m&&m.length>=3)th.accent=[m[0]/255,m[1]/255,m[2]/255];}}a.remove();b.remove();}}catch(e){}
// the window's own bar takes the look's colour, so it reads as part of the app, not a frame round it
var tc=document.getElementById('themecolor');if(tc&&tc.setAttribute)tc.setAttribute('content',th.forced?'Canvas':look==='pearl'?'#ECEBE8':look==='glass'?'#E9ECEE':'#08090B');
var bd=document.body;if(bd&&bd.classList){bd.classList.toggle('lq-light',th.light);['ferro','glass','pearl'].forEach(function(l){bd.classList.toggle('lq-look-'+l,l===look);});bd.classList.toggle('lq-contrast',th.contrast);bd.classList.toggle('lq-solid',th.solid||th.contrast);bd.classList.toggle('lq-forced',th.forced);}
LQ.theme=th;return th;}
function lqSize(){var el=$('liquid');var w=(el&&el.clientWidth)||window.innerWidth||1280,h=(el&&el.clientHeight)||window.innerHeight||800;return {w:w,h:h,s:Math.max(0.55,Math.min(1.15,Math.min(w,h)/860))};}
function lqLoad(commit){if(LQ.scene==='work'){lqLoadWork();return;}var fresh=LQ.fresh;LQ.fresh=false;Promise.all([api('/api/adapt?from='+encodeURIComponent(LQ.last)+(commit?'&commit=1':'')+(LQ.touch?'&touch=1':'')),api('/api/home'+(fresh?'?fresh=1':''))]).then(function(r){LQ.adapt=r[0]||{};LQ.home=r[1]||{};lqRedraw();if(r[1]&&r[1].you)bdOrphans(r[1].you);}).catch(function(){});}
// A droplet's own place: a steady nudge in angle and distance from its id, so the
// layout reads as grown, not ruled, and stays put from one visit to the next.
// Home, in zones: what needs you in a band across the top (lqNeeds), then the app's
// parts by P.A.R.A., each group in its own part of the screen below it: Projects
// (work with an end) up left, Areas (what you keep up with) up right, Resources (to
// look things up in) down left, the Archive (what's done) sunk low; and what's new on
// what you watch (Watching) as a zone of its own on the right.
var PARA_OF={tasks:'p',agents:'p',todo:'p',marketing:'p',board:'a',week:'a',standup:'a',map:'r',drift:'r',settings:'r',reports:'r'};
var PARA_NAME={p:'Projects',a:'Areas',w:'Watching',r:'Resources',x:'Archive'},PARA_SUB={p:'work with an end',a:'what you keep up with',w:'new on what you watch',r:'to look things up in',x:'what’s done'};
var PARA_ANG={p:-2.55,a:-0.6,w:0.3,r:2.6,x:1.25},PARA_LIVE={p:0.45,a:0.3,w:0.3,r:0.12,x:0};
function lqPara(d){return d.kind==='you'?'n':d.band?'b':d.kind==='archive'?'x':d.kind==='feed'&&d.shape!=='reports'?'w':PARA_OF[d.shape]||'p';}
function lqParaGo(g){lqAct();if(g==='p'){lqWorkBy('project');return;}if(g==='a'||g==='w'){lqUse('board');lqPool('board');return;}if(g==='r'){lqUse('map');lqPool('map');return;}lqArchive();}
// The needs-you band: a lit orb per thing only you can do, its blob beside it (the
// project, the question, its two answers), as many across as fit, in a steady
// order (questions, then Approves, then first steps); the rest a page on.
var LQ_BLOBW=250,LQ_NEEDY=128;
function lqNeeds(h,S){var rank={ask:0,approve:1,setup:2},rk=function(y){return y.urgent?(y.id==='setup:ai'?-3:y.id==='setup:agent'?-2:-1):rank[y.kind]||0;},ys=(h.you||[]).slice().sort(function(a,b){return rk(a)-rk(b)||(a.id<b.id?-1:a.id>b.id?1:0);});
var nb=lqNextBox(h,S);if(!ys.length)return {items:[],bottom:nb,x:0,page:0,pages:1,count:0};
var R=Math.round(24*Math.max(0.85,Math.min(1.1,S.s))),unit=3*R+22+LQ_BLOBW,gap=28,cols=Math.max(1,Math.min(3,Math.floor((S.w-24+gap)/(unit+gap)))),pages=Math.max(1,Math.ceil(ys.length/cols));
LQ.needPage=(LQ.needPage||0)%pages;
// the card you're typing in stays in view: a new one ahead of it doesn't page it away
var fa=document.activeElement,tb=fa&&fa.closest?fa.closest('#lqdrops .lqblob[data-key]'):null;if(tb){var tk=tb.getAttribute('data-key');for(var ti=0;ti<ys.length;ti++)if(bdKey(ys[ti])===tk){LQ.needPage=Math.floor(ti/cols);break;}}
var shown=ys.slice(LQ.needPage*cols,LQ.needPage*cols+cols),x0=Math.max(12,(S.w-(shown.length*unit+(shown.length-1)*gap))/2);
var tall=(shown.some(function(y){return y.kind==='ask'&&(y.options||[]).length;})?172:116)+(shown.some(function(y){return y.fix==='handover';})?16:0)+(shown.some(function(y){return y.draft;})?150:0);
// the band is as tall as its tallest card really is: two long answers, the own-words
// box open and "+4 more questions" made Post 1's card 60px taller than the guess, over
// the mailbox agent's name in the band below (2026-10-09). lqBlobFit lays out again
// when a card grows or shrinks.
LQ.needEst=tall;var mh=lqBlobH();if(mh)tall=Math.max(tall,mh-8);LQ.needTall=tall;
var items=shown.map(function(y,i){return {id:y.id,kind:'you',blob:true,item:y,shape:y.shape,title:y.title,sub:y.sub,r:R,tx:x0+i*(unit+gap)+R,ty:LQ_NEEDY+R,ax:0,ay:0};});
return {items:items,bottom:items.length?LQ_NEEDY+tall+20:0,x:x0,page:LQ.needPage,pages:pages,count:ys.length};}
// The agents at work, a band of their own under the needs-you band (or the header):
// a small orb each, its lane's name in full and, under it, where it is in its brief
// ("step 2 of 4: …"), what it's on and how long it has left, amber once it has gone
// quiet or round in circles. Among the groups they pushed the headings off their
// own orbs and squeezed the names letter by letter (2026-10-08), so they never join
// a group: the groups lay out under the band, as if it were the header.
var LQ_RUNW=270;
function lqRunBand(h,S,y){var rs=(h.runs||[]);if(!rs.length)return {items:[],bottom:0};
var R=Math.round(15*Math.max(0.85,Math.min(1.1,S.s))),unit=2*R+50+LQ_RUNW,gap=22,cols=Math.max(1,Math.min(4,Math.floor((S.w-24+gap)/(unit+gap)))),shown=rs.slice(0,cols);
var x0=Math.max(12,(S.w-(shown.length*unit+(shown.length-1)*gap))/2),y0=Math.max(y||0,84)+18;
var items=shown.map(function(x,i){return {id:x.id,kind:'run',band:true,shape:'agents',repo:x.repo,title:x.name,sub:runWarn(x)+x.line+(x.eta?' · '+x.eta:''),ask:!!(x.quiet||x.looping),r:R,tx:x0+i*(unit+gap)+R,ty:y0+22,ax:0,ay:0};});
return {items:items,bottom:y0+44+16,more:rs.length-shown.length};}
// Next up, where the needs-you band would be: with nothing waiting on you (and only
// then), a few things that CAN be done next (home.mjs nextUp), each with its gain
// and one tap that starts an agent or makes a task. × puts the box away until what
// it suggests changes. Gives the band's bottom (0 when it isn't shown).
function lqNextList(h){if(LQ.scene==='work'||(h.you||[]).length)return [];var ns=h.next||[],sig=ns.map(function(s){return s.id;}).join('|'),off='';try{off=(window.localStorage&&window.localStorage.getItem('symbiot-next-off'))||'';}catch(e){}return sig&&off!==sig?ns:[];}
function lqNextBox(h,S){var el=$('lqnext'),all=lqNextList(h);if(!el){LQ.nextList=all;return 0;}
if(!all.length){LQ.nextList=[];if(el.classList)el.classList.remove('on');sameHtml(el,'');return 0;}
// as many as fit without crowding the liquid under it (like the band): two across on a wide screen, a page on for the rest
var two=S.w>=1100,per=two?4:S.w<600||S.h<620?1:S.h>=760?3:2,pages=Math.ceil(all.length/per);LQ.nextPage=(LQ.nextPage||0)%pages;var ns=all.slice(LQ.nextPage*per,LQ.nextPage*per+per),w=Math.min(two?1040:600,S.w-24);LQ.nextList=ns;
if(!sameHtml(el,"<div class='nxh'><span>What could be done next</span><small>one tap each, if you like</small>"+(pages>1?"<button type='button' class='nxpg'>"+(LQ.nextPage+1)+" of "+pages+" &rsaquo;</button>":"")+"<button type='button' class='nxx' aria-label='put these suggestions away' title='put these away'>&times;</button></div><ol"+(two&&ns.length>1?" class='two'":"")+">"+ns.map(function(s,i){return "<li data-i='"+i+"'><div class='nxt'><b title='"+escQ(s.title)+"'>"+esc(s.title)+"</b><span title='"+escQ(s.gain+' · '+s.time)+"'>"+esc(s.gain)+" &middot; "+esc(s.time)+"</span></div><button type='button' class='nxgo' data-i='"+i+"'>"+esc(s.label)+"</button></li>";}).join('')+"</ol>")){
var x=el.querySelector('.nxx');if(x)x.addEventListener('click',function(){var sig=((LQ.home&&LQ.home.next)||[]).map(function(s){return s.id;}).join('|');try{if(window.localStorage)window.localStorage.setItem('symbiot-next-off',sig);}catch(e){}lqAct();lqBuild();});
var pg=el.querySelector('.nxpg');if(pg)pg.addEventListener('click',function(){LQ.nextPage=(LQ.nextPage||0)+1;lqAct();lqBuild();});
el.querySelectorAll('.nxgo').forEach(function(b){b.addEventListener('click',function(){var s=(LQ.nextList||[])[+b.getAttribute('data-i')],li=b.closest?b.closest('li'):null;if(!s)return;lqAct();b.disabled=true;
api('/api/home/next',{id:s.id}).then(function(r){if(!r||r.error){b.disabled=false;lqSaid((r&&r.error)||'It didn’t start. Try again.');return;}lqSaid(r.said||'Started.');if(li&&li.classList)li.classList.add('gone');LQ.fresh=true;setTimeout(function(){lqLoad(false);},650);}).catch(function(e){b.disabled=false;lqSaid(String((e&&e.message)||e));});});});}
if(el.classList)el.classList.add('on');if(el.style){el.style.width=w+'px';el.style.transform='translate('+Math.round((S.w-w)/2)+'px,'+(LQ_NEEDY-30)+'px)';}
return LQ_NEEDY-30+(el.offsetHeight||(48+Math.ceil(ns.length/(two?2:1))*58))+24;}
// a blob's top sits 4px above LQ_NEEDY and the band's bottom LQ_NEEDY+tall+20: mh-8 leaves 12px between
function lqBlobH(){var m=0,el=$('lqdrops');if(el&&el.querySelectorAll)el.querySelectorAll('.lqblob').forEach(function(b){if(b.offsetHeight>m)m=b.offsetHeight;});return m;}
function lqBlobFit(){if(LQ.needTall==null||LQ.scene==='work')return;var mh=lqBlobH(),want=Math.max(LQ.needEst||0,mh?mh-8:0);if(Math.abs(want-LQ.needTall)>2)lqBuild();}
function lqNeedPage(){LQ.needPage=(LQ.needPage||0)+1;lqAct();lqBuild();}
function lqArchive(){lqPool('tasks');LQ.arch=true;if(typeof loadArchived==='function')loadArchived();}
function lqOrg(id,k){var h=k*977;id=String(id);for(var i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))|0;return ((h>>>0)%1000)/1000;}
function lqGrow(list,cx,cy,vx,vy){list.forEach(function(d){var x=(d.tx-cx)/vx,y=(d.ty-cy)/vy,an=Math.atan2(y,x)+(lqOrg(d.id,1)-0.5)*0.7,rr=Math.sqrt(x*x+y*y)*(0.78+0.44*lqOrg(d.id,2));d.tx=cx+Math.cos(an)*rr*vx;d.ty=cy+Math.sin(an)*rr*vy;});}
// Nearest neighbours, in the liquid: each droplet is drawn towards the ones it's
// linked to (its k nearest, from adapt.mjs, or the part or repo it belongs to),
// pushed off the rest, and loosely held at its own distance from the core. A few
// hundred fixed steps, so the same links give the same picture every time.
// Linked droplets settle just past their separation; unlinked ones keep a wider gap,
// so clusters read as groups. Only the distance from the core is held (the likely
// nearer); the angle is free, so there's no ring for them to fall into.
function lqNear(list,links,cx,cy,cr,S){if(!links.length)return;var gap=36*S.s,lk={};links.forEach(function(l){lk[l[0]+','+l[1]]=1;lk[l[1]+','+l[0]]=1;});
for(var it=0;it<320;it++){links.forEach(function(l){var a=list[l[0]],b=list[l[1]],dx=b.tx-a.tx,dy=b.ty-a.ty,d=Math.sqrt(dx*dx+dy*dy)||1,L=lqSep(a,b,dx,dy)+10,f=(d-L)*0.08*Math.max(0.4,Math.min(1,l[2]*4))/d;if(d>L){a.tx+=dx*f;a.ty+=dy*f;b.tx-=dx*f;b.ty-=dy*f;}});
for(var i=0;i<list.length;i++){var a=list[i];for(var j=i+1;j<list.length;j++){var b=list[j],dx=b.tx-a.tx,dy=b.ty-a.ty,d=Math.sqrt(dx*dx+dy*dy)||1,mn=lqSep(a,b,dx,dy)+(lk[i+','+j]?0:gap);if(d<mn){var f=(mn-d)*0.2/d;a.tx-=dx*f;a.ty-=dy*f;b.tx+=dx*f;b.ty+=dy*f;}}
a.tx+=(cx-a.tx)*0.004;a.ty+=(cy-a.ty)*0.004;var ex=a.tx-cx,ey=a.ty-cy,ed=Math.sqrt(ex*ex+ey*ey)||1,mn2=cr+a.r+60;if(ed<mn2){a.tx=cx+ex/ed*mn2;a.ty=cy+ey/ed*mn2;}}}}
// Seed by cluster: the linked groups (union-find) each get their own arc, sized to
// the group, in the order of where they'd have been, with a steady offset; members
// sit together, alternately nearer and further. lqNear then only polishes.
function lqSeed(list,links,cx,cy,vx,vy,keyOf,angOf){var par=list.map(function(_,i){return i;});function root(i){while(par[i]!==i)i=par[i]=par[par[i]];return i;}links.forEach(function(l){par[root(l[0])]=root(l[1]);});
var groups={};list.forEach(function(d,i){if(d.kind==='more')return;var r=keyOf?keyOf(d):root(i);(groups[r]=groups[r]||[]).push(i);});
var gs=Object.keys(groups).map(function(k){var g=groups[k];return {key:k,m:g,ang:Math.atan2(g.reduce(function(t,i){return t+(list[i].ay-cy)/vy;},0),g.reduce(function(t,i){return t+(list[i].ax-cx)/vx;},0))};});
gs.sort(function(a,b){return a.ang-b.ang;});var tot=gs.reduce(function(t,g){return t+g.m.length+0.8;},0),acc=gs.length?gs[0].ang-(gs[0].m.length+0.8)/tot*Math.PI:0;
gs.forEach(function(g){var span=(g.m.length+0.8)/tot*2*Math.PI,mid=acc+span/2+(lqOrg(list[g.m[0]].id,3)-0.5)*span*0.25;acc+=span;if(angOf){span=Math.min(1.5,span);mid=angOf(g.key)+(lqOrg(list[g.m[0]].id,3)-0.5)*0.2;}
g.m.forEach(function(i,k){var d=list[i],rr=Math.sqrt(Math.pow((d.ax-cx)/vx,2)+Math.pow((d.ay-cy)/vy,2))*(k%2?1.22:0.92),th=mid+(k-(g.m.length-1)/2)*Math.min(0.62,span/Math.max(1,g.m.length)*0.8);d.tx=cx+Math.cos(th)*rr*vx;d.ty=cy+Math.sin(th)*rr*vy;});});}
function runWarn(x){return x.quiet?'no progress in '+x.quiet+' min · ':x.looping?'repeating the same step · ':'';}
function lqLinks(list,near){var at={},links=[],same=function(l){return lqPara(list[l[0]])===lqPara(list[l[1]]);};list.forEach(function(d,i){if(d.kind==='shape')at[d.shape]=i;});
list.forEach(function(d,i){if(d.kind==='shape')((near||{})[d.shape]||[]).forEach(function(n){var j=at[n.id];if(j!=null&&j>i)links.push([i,j,n.w]);else if(j!=null&&j<i&&!links.some(function(l){return l[0]===j&&l[1]===i;}))links.push([j,i,n.w]);});
else if((d.kind==='you'||d.kind==='feed')&&at[d.shape]!=null)links.push([at[d.shape],i,0.5]);});return links.filter(same);}
// One calm line on Home, never a pop-up: on a phone, that your computer is out of reach
// and what you see is its copy, from when; on the computer, what was approved from your phone today.
function lqHomeLine(h){var el=$('lqline'),b=document.body,t='',pc=h.computer,ap=(h.phoneApproved||[]).slice(-1)[0];
if(pc&&pc.away)t="<b>"+esc(pc.name)+" is out of reach.</b> Showing what it sent "+(pc.heard?"at "+esc(pcTime(pc.heard)):"last")+(pc.queued?" · "+pc.queued+" change"+(pc.queued>1?"s":"")+" waiting to send":"")+".";
else if(pc&&pc.old)t="<b>Pair this phone with "+esc(pc.name)+" again:</b> the link between them is sealed now.";
else if(ap)t=ap.status==='failed'?"<b>Approving "+esc(ap.repo)+" from "+esc(ap.phone)+" failed:</b> "+esc(ap.error||''):(ap.status==='approving'?"Approving ":"Approved ")+esc(ap.repo)+" from "+esc(ap.phone)+" at "+esc(pcTime(ap.at))+".";
if(b&&b.classList)b.classList.toggle('lq-hline',!!t);if(el&&LQ.scene!=='work'&&el.innerHTML!==t)el.innerHTML=t;}
function lqBuild(){var a=LQ.adapt||{},h=LQ.home||{},S=lqSize(),list=[];LQ.bw=S.w;LQ.bh=S.h;
// the band first: everything else sits under it, round a core centred in what's left
var need=lqNeeds(h,S),band=lqRunBand(h,S,need.bottom),top=band.bottom||need.bottom,cx=S.w/2,cy=top?Math.max(S.h*0.47,(top+60+S.h-200)/2):S.h*0.47;LQ.cy=cy;LQ.top=top;LQ.need=need;
// Marketing only once posts can be drafted, or are (home.mjs): a new user meets what they watch first
var mk=function(id){return id!=='agents'&&(id!=='marketing'||!!h.marketing);}; // and Agents is the Workdesk (tasks), one orb
var feeds=(h.feeds||[]).slice(0,2),lay=((a.layout&&a.layout.items)||[]).filter(function(it){return mk(it.id);}),more=((a.layout&&a.layout.more)||[]).filter(mk);
var vx=Math.max(0.5,Math.min(S.s*1.3,(S.w/2-90)/400)),vy=Math.max(0.35,Math.min(S.s*0.8,(S.h-cy-230)/400,(cy-(top?top+60:160))/400));var rs=Math.min(S.s,(vx+vy)/1.5);var room=Math.max(3,LQ_MAX-feeds.length-1-(top?2:0));
var repNew=(h.feeds||[]).filter(function(f){return f.id==='feed:reports';})[0],repOut=repNew&&feeds.indexOf(repNew)<0; // new reports, when their own droplet didn't fit
// what has something for you is never only under "more": unread reports, and Marketing once it can draft;
// each takes the place of the least likely part shown, which goes under "more" instead
var vis=lay.slice(0,room);['reports','marketing'].forEach(function(id){if(id==='reports'?!repOut:!h.marketing)return;if(vis.some(function(it){return it.id===id;}))return;var vi=-1;vis.forEach(function(it,i){if(['tasks','reports','marketing'].indexOf(it.id)<0&&(vi<0||it.p<vis[vi].p))vi=i;});if(vi<0)return;var v=vis[vi];vis[vi]={id:id,p:v.p,r:v.r,d:v.d,angle:v.angle};more=more.filter(function(m){return m!==id;});more.push(v.id);});
lay.slice(room).forEach(function(it){if(!vis.some(function(x){return x.id===it.id;})&&more.indexOf(it.id)<0)more.push(it.id);});lay=vis;
// Marketing's orb is lit (amber, like a lane that asks) when something there needs you, and orbits while its agent works
var mkh=h.marketing||{},mkSub=mkh.needs?mkh.needs+(mkh.needs>1?' need you':' needs you'):mkh.working?'its agent is at work':'';
lay.slice(0,room).forEach(function(it){var mko=it.id==='marketing';list.push({id:'shape:'+it.id,kind:'shape',shape:it.id,title:LQNAMES[it.id]||it.id,sub:it.id==='reports'&&repOut?repNew.count+' new':mko?mkSub:'',ask:mko&&!!mkh.needs,orbit:mko&&!!mkh.working,r:it.r*rs,tx:cx+Math.cos(it.angle)*it.d*vx,ty:cy+Math.sin(it.angle)*it.d*vy});});
feeds.forEach(function(f,i){var ang=Math.PI/2+(i-(feeds.length-1)/2)*0.7;var fn=bsName({name:f.title});list.push({id:f.id,kind:'feed',shape:f.shape,title:fn.n+(fn.sub?' · '+fn.sub.split('@').pop():''),sub:f.sub,r:(28+5*Math.min(f.count||1,5))*rs,tx:cx+Math.cos(ang)*300*vx,ty:cy+Math.sin(ang)*300*vy});});
// on a phone paired with your computer: its droplet, lit when something there needs you (phone.mjs)
var pc=h.computer;if(pc&&!pc.old){var pn=pc.asks+pc.approves,pang=Math.PI/2+((feeds.length+1)/2)*0.7;list.push({id:'computer',kind:'feed',shape:'computer',title:'On '+pc.name,sub:pc.away?'out of reach · its copy':pn?pn+(pn>1?' need you':' needs you'):pc.tasks+' open task'+(pc.tasks===1?'':'s'),ask:pn>0,r:(32+4*Math.min(pn,5))*rs,tx:cx+Math.cos(pang)*300*vx,ty:cy+Math.sin(pang)*300*vy});}
// on the computer: your phone, and when it last asked (a droplet only while one's paired)
var phs=h.phones||[];if(phs.length){var p0=phs.slice().sort(function(x,y){return (y.seen||0)-(x.seen||0);})[0],gang=Math.PI/2+((feeds.length+1)/2)*0.7;list.push({id:'phones',kind:'feed',shape:'settings',title:phs.length>1?phs.length+' phones':p0.name,sub:p0.old?'pair it again':p0.seen?'seen '+agoTxt(p0.seen)+(p0.via==='relay'?', away':''):'hasn’t asked yet',ask:!!p0.old,r:28*rs,tx:cx+Math.cos(gang)*300*vx,ty:cy+Math.sin(gang)*300*vy});}
list.push({id:'archive',kind:'archive',shape:'tasks',title:'Archive',sub:'what’s done: archived tasks',r:26*rs,tx:cx+Math.cos(PARA_ANG.x)*330*vx,ty:cy+Math.sin(PARA_ANG.x)*330*vy});
list.forEach(function(d){var g=lqPara(d);d.live=PARA_LIVE[g];if(g==='r')d.r*=0.82;if(g==='x')d.r*=0.85;if(d.shape==='tasks'&&d.kind==='shape'&&h.working)d.orbit=true;});
var mr=more.length?[{id:'more',kind:'more',title:'more',sub:more.map(function(m){return LQNAMES[m]||m;}).join(' · '),more:more.slice(),r:24*S.s}]:[],zl=list.concat(mr),zc=lqZones(zl,S,top,92*S.s);
if(zc){LQ.cy=zc.cy;list=zl;}else{
lqGrow(list,cx,cy,vx,vy);list.forEach(function(d){d.ax=d.tx;d.ay=d.ty;});var lks=lqLinks(list,a.near);lqSeed(list,lks,cx,cy,vx,vy,lqPara,function(g){return PARA_ANG[g];});lqNear(list,lks,cx,cy,92*rs,S);
// Solve it. If this screen can't hold them all clear of each other (lqRelax), the
// least likely part goes under "more" (Hick: fewer, not cramped) and it solves
// again. What only you can do and your feeds always stay out.
var base=list.slice(),cur=null,tries=0;base.forEach(function(d){d.r0=d.r;d.tx0=d.tx;d.ty0=d.ty;});
for(;;){cur=base.slice();if(more.length)cur.push({id:'more',kind:'more',title:'more',sub:more.map(function(m){return LQNAMES[m]||m;}).join(' · '),more:more.slice(),r0:24*S.s,tx0:S.w-Math.max(70,S.w*0.08),ty0:top?top+90:150});
cur.forEach(function(d){d.r=d.r0;d.tx=d.tx0;d.ty=d.ty0;});if(lqRelax(cur,S,cx,cy,92*S.s,top?top+60:0)||tries++>=8)break;
var q=-1;for(var z=base.length-1;z>=0;z--)if(base[z].kind==='shape'){q=z;break;}if(q<0)break;more.push(base[q].shape);base.splice(q,1);}
list=cur;}
list=list.concat(need.items,band.items);var old={};LQ.drops.forEach(function(d){old[d.id]=d;});
// a new blob grows where it belongs, rather than sweeping out of the core across the rest
LQ.drops=list.map(function(d){var o=old[d.id];d.x=o?o.x:d.blob?d.tx:cx;d.y=o?o.y:d.blob?d.ty:cy;d.vx=o?o.vx:0;d.vy=o?o.vy:0;d.cr=o?o.cr:0;return d;});
var n=(h.you||[]).length,w=h.working||0,qt=(h.runs||[]).filter(function(x){return x.quiet||x.looping;}).length,wk=w?w+' agent'+(w>1?'s':'')+' working'+(qt?' ('+qt+' stalled)':''):'';
LQ.coreText=n?(n+(n>1?' things need':' thing needs')+' only you'+(w?' · '+wk:'')):(w?wk+' · nothing needs you':'Nothing needs you right now');
lqHomeLine(h);
var b=document.body;if(b&&b.classList){b.classList.toggle('lq-touch',!!(a.modes&&a.modes.touch)||LQ.touch);b.classList.toggle('lq-keys',!!(a.modes&&a.modes.keyboard));}
LQ.talkWeight=(a.modes&&a.modes.talkWeight)||0.35;
lqLabels();}
// Home in zones, on a screen wide enough for them: the core in the middle of what's
// under the band; Projects then Resources to its left, Areas then Watching (with the
// Archive and "more" at its end) to its right; each a row with its name at its outer
// end, so the droplets, which flow out of the core, never cross a name on their way
// (on the right, names next to the core had the Dashboard orb sitting on "what you
// keep up with" until it landed). Fixed places in a fixed order, so nothing overlaps
// and each part is where it was last time. Sizes still come from how you use them (adapt.mjs), all scaled
// by one factor when the screen is short, so they stay comparable. null when they
// can't fit (a narrow or very short screen): the liquid's own layout then.
var ZONE_ORDER=['tasks','agents','todo','marketing','board','week','standup','map','drift','settings','reports'],ZONE_KIND={shape:0,feed:1,archive:2,more:3};
function lqZones(list,S,top,coreR){LQ.zoneT=null;if(S.w<1000||S.h<540)return null;
var y0=top?top+10:96,y1=S.h-180,mid=(y0+y1)/2,cx=S.w/2,gapC=coreR+36,colW=S.w/2-gapC-20,titleW=150;if(colW-titleW<250||mid-y0<70)return null;
var cells={p:[cx-gapC-colW,y0,mid],a:[cx+gapC,y0,mid],r:[cx-gapC-colW,mid,y1],w:[cx+gapC,mid,y1]},by={},plan={},k=1;
var spare=[];list.forEach(function(d){var g=lqPara(d);if(g==='x'||d.kind==='more'){spare.push(d);return;}(by[g]=by[g]||[]).push(d);});
// the Archive and "more" go at the end of the shortest row (lower rows first), so no row overflows
spare.forEach(function(d){var g=['r','w','a','p'].reduce(function(b,x){return ((by[x]||[]).length<(by[b]||[]).length)?x:b;},'r');(by[g]=by[g]||[]).push(d);});
Object.keys(by).forEach(function(g){var c=cells[g];if(!c){k=0;return;}
var m=by[g].sort(function(a,b){var ka=ZONE_KIND[a.kind]||0,kb=ZONE_KIND[b.kind]||0;if(ka!==kb)return ka-kb;var ia=ZONE_ORDER.indexOf(a.shape),ib=ZONE_ORDER.indexOf(b.shape);return (ia<0?99:ia)-(ib<0?99:ib)||(a.id<b.id?-1:1);});
// neighbours in a row keep the liquid's rule (lqSep: past where their metal would bridge, ~3.4r apart) and room for their tags
var R=0;m.forEach(function(d){R=Math.max(R,d.r);});var av=colW-titleW,fitW=function(per){var s=av/per;return s<128?0:(s-6)/(3.4*R);},per=m.length;
if(fitW(per)<0.6&&m.length>1)per=Math.ceil(m.length/2);var rows=Math.ceil(m.length/per);
k=Math.min(k,fitW(per),((c[2]-c[1])/rows-46)/(2*R));plan[g]={m:m,per:per,rows:rows,stepX:av/per};});
if(k<0.55)return null;k=Math.min(1,k);LQ.zoneT={};
Object.keys(plan).forEach(function(g){var c=cells[g],p=plan[g],rowH=(c[2]-c[1])/p.rows,right=g==='a'||g==='w',x0=c[0]+(right?0:titleW)+(colW-titleW)/2;
LQ.zoneT[g]=[right?c[0]+colW-titleW/2:c[0]+titleW/2,c[1]+rowH/2-13];
p.m.forEach(function(d,i){d.r*=k;var row=Math.floor(i/p.per),n=Math.min(p.per,p.m.length-row*p.per);d.tx=x0+(i%p.per-(n-1)/2)*p.stepX;d.ty=c[1]+row*rowH+rowH/2-13;});});
return {cy:mid};}
// Force-directed layout, solved once per change: push overlapping targets apart
// (each droplet's circle plus its label below or above), and off the core, within
// the screen. Deterministic, so the same data gives the same layout.
// The one rule for how far apart two droplets sit: past where their metal would
// bridge (r²/d² fields sum to 1 midway at d = 2·√(r1²+r2²)), with a margin so the
// wobble can't flicker a bridge open and shut, and room for their labels when
// they share a column. Used once, when the layout is solved; nothing fights it live.
// Tags float on their spheres, so two on the same row also keep a tag's width apart.
function lqSep(a,b,dx,dy){var m=Math.max(a.r+b.r+70,2.4*Math.sqrt(a.r*a.r+b.r*b.r))+(Math.abs(dx)<150?48:0);return dy!=null&&Math.abs(dy)<56?Math.max(m,232):m;}
// Solve the layout: push targets apart until every pair keeps lqSep (and clear
// of the core), within the screen. If they can't all fit, every droplet gives up
// a little of its size (the liquid is conserved, not crowded) and it solves again.
function lqRelax(L,S,cx,cy,coreR,top){var n=L.length,y0=top||140;
// each sphere's tag, roughly: up to 170px wide, one or two lines, under it
var lqLb=function(d){if(!d._lb){var t=typeof lqShort==='function'?lqShort(d.title,42):String(d.title||''),w=Math.min(170,t.length*6.6+18);d._lb={w:d.title?w:0,h:d.title?(t.length*6.6+18>170?42:26)+(d.kind==='proj'?16:0):0};}return d._lb;};
for(var pass=0;pass<6;pass++){
for(var it=0;it<220;it++){var moved=0;for(var i=0;i<n;i++){var a=L[i];
for(var j=i+1;j<n;j++){var b=L[j],dx=a.tx-b.tx,dy=a.ty-b.ty,dd=Math.sqrt(dx*dx+dy*dy)||0.01,mn=lqSep(a,b,dx,dy);if(dd<mn){var f=(mn-dd)/2/dd;a.tx+=dx*f;a.ty+=dy*f;b.tx-=dx*f;b.ty-=dy*f;moved++;}
var la=lqLb(a),lb=lqLb(b),sg=a.tx>=b.tx?1:-1,ox=0;if(Math.abs(a.tx-b.tx)<(la.w+lb.w)/2+10&&Math.abs((a.ty+a.r+4+la.h/2)-(b.ty+b.r+4+lb.h/2))<(la.h+lb.h)/2+4)ox=(la.w+lb.w)/2+10-Math.abs(a.tx-b.tx);else if(Math.abs(a.tx-b.tx)<la.w/2+b.r+6&&a.ty+a.r+4<b.ty+b.r&&a.ty+a.r+4+la.h>b.ty-b.r)ox=la.w/2+b.r+6-Math.abs(a.tx-b.tx);else if(Math.abs(a.tx-b.tx)<lb.w/2+a.r+6&&b.ty+b.r+4<a.ty+a.r&&b.ty+b.r+4+lb.h>a.ty-a.r)ox=lb.w/2+a.r+6-Math.abs(a.tx-b.tx);if(ox>0.5){a.tx+=sg*ox/2;b.tx-=sg*ox/2;moved++;}}
var cdx=a.tx-cx,cdy=a.ty-cy,cd=Math.sqrt(cdx*cdx+cdy*cdy)||0.01,cm=Math.max(a.r+coreR+70,2.4*Math.sqrt(a.r*a.r+coreR*coreR));if(cd<cm){a.tx+=cdx*(cm-cd)/cd;a.ty+=cdy*(cm-cd)/cd;moved++;}
a.tx=Math.max(a.r+60,Math.min(S.w-a.r-60,a.tx));a.ty=Math.max(y0+a.r,Math.min(S.h-200-a.r,a.ty));}if(!moved)break;}
var bad=false;for(var i2=0;i2<n&&!bad;i2++)for(var j2=i2+1;j2<n;j2++){var p=L[i2],q=L[j2],ddx=p.tx-q.tx,ddy=p.ty-q.ty;if(Math.sqrt(ddx*ddx+ddy*ddy)<lqSep(p,q,ddx,ddy)-1){bad=true;break;}}
if(!bad)return true;L.forEach(function(x){x.r*=0.9;});coreR*=0.9;}return false;}
// A sphere's tag, short: no markdown, no (§5 of .symbiot/BRIEF…) or path asides, cut
// at a word near n characters. The whole text stays on the tag's title.
function lqShort(t,n){t=String(t||'').split('**').join('').split(String.fromCharCode(96)).join('').split(String.fromCharCode(10)).join(' ');var out='',buf='',depth=0;
for(var i=0;i<t.length;i++){var ch=t.charAt(i);if(ch==='('){depth++;buf+=ch;continue;}if(depth){buf+=ch;if(ch===')'){depth--;if(!depth){if(buf.indexOf('§')<0&&buf.indexOf('/')<0&&buf.indexOf('.symbiot')<0)out+=buf;buf='';}}continue;}out+=ch;}
while(out.indexOf('  ')>=0)out=out.split('  ').join(' ');[' :',' ,',' ;',' .'].forEach(function(x){out=out.split(x).join(x.charAt(1));});out=out.trim();n=n||42;if(out.length>n){out=out.slice(0,n);var k=out.lastIndexOf(' ');if(k>n*0.6)out=out.slice(0,k);out=out.replace(/[ ,;:.-]+$/,'')+'…';}return out;}
// The same tags as last time stay the same nodes (sameHtml): a refresh with nothing
// new doesn't touch them, so text you're selecting in a blob stays selected. Their
// handlers read the droplet by its place (data-i) when clicked, not from when drawn.
function lqLabels(){var el=$('lqdrops');if(!el)return;
var dropAt=function(b){return LQ.drops[+b.getAttribute('data-i')];};
var same=keepTyping(el,LQ.drops.map(function(d,i){if(d.blob)return "<div class='lqd lq-you lqblob"+(d.item.urgent?' urgent':'')+"' data-i='"+i+"' data-key='"+escQ(bdKey(d.item))+"' role='group' aria-label='"+escQ(String(d.item.name||d.item.title||'')+': '+String(d.item.q||d.item.sub||''))+"'>"+blobBody(d.item,true)+"</div>";
return "<div class='lqd lq-"+d.kind+(d.band?' lq-band':'')+(d.parked?' lq-parked':'')+(d.ask&&d.kind==='shape'?' lq-lit':'')+(LQ.openTag===d.id?' open':'')+"' data-i='"+i+"'><button type='button' class='lt' title='"+escQ(String(d.title||'').split('**').join('')+(d.sub?' · '+d.sub:''))+"' aria-expanded='"+(LQ.openTag===d.id)+"'><span>"+esc(lqShort(d.title,42))+"</span>"+((d.kind==='proj'||d.kind==='wait'||d.kind==='run')&&d.sub?"<span class='lm'>"+esc(lqShort(d.sub,d.kind==='proj'?40:56))+"</span>":"")+"</button>"+(d.sub?"<small>"+esc(d.sub)+"</small>":"")+"<button type='button' class='lgo'>Open &rsaquo;</button></div>";}).join(''));
if(!same){LQ.btns=[];LQ.lts=[];el.querySelectorAll('.lqd').forEach(function(b){LQ.btns.push(b);var d=dropAt(b),lt=b.querySelector('.lt'),go=b.querySelector('.lgo');LQ.lts.push(lt);
if(b._wired)return;b._wired=true; // the blob kept through the redraw (keepTyping) is wired already
if(lt)lt.addEventListener('click',function(ev){lqOpen(dropAt(b),ev);});
if(go)go.addEventListener('click',function(ev){LQ.openTag=null;lqOpen(dropAt(b),ev);});
if(d&&d.blob)wireBlob(b,d.item,{sent:function(){var x=dropAt(b);if(x)x.gone=true;},done:function(){LQ.fresh=true;lqLoad(false);},say:lqSaid,grew:lqBlobFit});});setTimeout(lqBlobFit,0);}
var nt=$('lqneedt'),nd=LQ.scene!=='work'&&LQ.need;if(nt){var on=!!(nd&&nd.items.length);if(nt.classList)nt.classList.toggle('on',on);
if(on){if(!sameHtml(nt,"<span>Needs you"+(nd.count>1?" &middot; "+nd.count:"")+"</span><small>only you can do these</small>"+(nd.pages>1?"<button type='button' class='lqmb lqneedpg' style='pointer-events:auto;min-height:32px;padding:4px 12px;font-size:12.5px'>"+(nd.page+1)+" of "+nd.pages+" &rsaquo;</button>":""))){var pg=nt.querySelector('.lqneedpg');if(pg)pg.addEventListener('click',lqNeedPage);}
if(nt.style)nt.style.transform='translate('+Math.round(nd.x)+'px,'+(LQ_NEEDY-46)+'px)';}}
var oe=$('lqorbits');if(oe&&!sameHtml(oe,LQ.drops.map(function(d,i){return d.kind==='run'||d.orbit?"<div class='lqorbit"+(d.ask?' ask':'')+"' data-i='"+i+"'><span><i></i></span><span><i></i></span><span><i></i></span></div>":'';}).join(''))){LQ.orbs=[];oe.querySelectorAll('.lqorbit').forEach(function(o){LQ.orbs.push(o);});}
LQ.drops.forEach(function(d){if(d.x===d.tx&&d.y===d.ty)return;if(!LQ.frame){d.x=d.tx;d.y=d.ty;d.cr=d.r;}});lqStep();
var ge=$('lqgroups');if(ge){var gs={};if(LQ.scene!=='work')LQ.drops.forEach(function(d){if(d.kind!=='more')gs[lqPara(d)]=1;});if(!sameHtml(ge,['p','a','w','r'].filter(function(g){return gs[g];}).map(function(g){return "<button type='button' class='lqg' data-g='"+g+"'><span>"+PARA_NAME[g]+"</span><small>"+PARA_SUB[g]+"</small></button>";}).join(''))){LQ.gbtns=[];ge.querySelectorAll('.lqg').forEach(function(b){LQ.gbtns.push(b);b.addEventListener('click',function(){lqParaGo(b.getAttribute('data-g'));});});}}
lqCoreText($('lqcore'),LQ.coreText||'');}
// the core's words, set only when they change: rewriting them every frame lost a selection in them at once
function lqCoreText(c,t){if(c&&c._t!==t){c.textContent=t;c._t=t;}}
// Tapping a sphere (or its name) opens its tag; tapping it again, or elsewhere, closes it.
function lqTag(id){LQ.openTag=LQ.openTag===id?null:id;lqAct();LQ.btns.forEach(function(b,i){var d=LQ.drops[+b.getAttribute('data-i')],on=!!d&&d.id===LQ.openTag;if(b.classList)b.classList.toggle('open',on);var lt=LQ.lts&&LQ.lts[i];if(lt&&lt.setAttribute)lt.setAttribute('aria-expanded',on?'true':'false');});}
function lqVia(ev){return LQ.talking?'talk':ev&&ev.pointerType==='touch'?'touch':ev&&ev.detail===0?'key':'click';}
function lqUse(shape,ev,via){if(shape==='agents')shape='tasks'; // one Workdesk
api('/api/adapt/use',{shape:shape,from:LQ.last,via:via||lqVia(ev)});LQ.last=shape;}
function lqOpen(d,ev){if(!d)return;lqAct();
if(d.kind==='more'){LQ.moreOpen=!LQ.moreOpen;lqMore(d);return;}
if(d.kind==='archive'){lqArchive();return;}
if(d.kind==='shape'&&d.shape==='marketing'&&d.ask)MKLIT=true;
if(d.kind==='you'&&d.item){if(d.x!=null){var S1=lqSize();LQ.ripple=[d.x/S1.w,d.y/S1.h,LQ.t];}lqUse(d.shape||'agents',ev);lqFocus(d.item);return;}
if(d.kind==='wait'&&d.focus){lqFocus({kind:'proj',repo:d.repo,path:d.focus});return;}
if(d.kind==='proj'){if(d.lit||d.repo==='ops'){lqFocus({kind:'proj',repo:d.repo});return;}TFILTER.repo=d.repo;TFILTER.type='';lqPool('tasks');if(typeof loadTasks==='function')loadTasks();return;}
// where your files disagree: the checks, lit up in Settings, and these clashes reached you (it dissolves)
if(d.id==='phones'){lqUse('settings',ev);lqFocus({kind:'setup',focus:'phone'});return;}
if(d.id==='feed:clash'){api('/api/knowledge/checks/seen',{}).catch(function(){});if(LQ.home)LQ.home.feeds=(LQ.home.feeds||[]).filter(function(f){return f.id!=='feed:clash';});lqUse('settings',ev);loadChecks();lqFocus({kind:'setup',focus:'checks'});return;}
var S=lqSize();LQ.ripple=[d.x/S.w,d.y/S.h,LQ.t];if(LQ.scene==='work'){lqPool(d.shape||'agents');return;}lqUse(d.shape||'board',ev);lqGo(d.shape||'board');}
function lqMore(d){var el=$('lqmore');if(!el)return;if(!LQ.moreOpen||!d){el.innerHTML='';return;}
if(d.lanes){el.innerHTML=d.lanes.map(function(p,i){return "<button type='button' class='lqmb lqm' data-i='"+i+"'>"+(p.lit?"<span style='color:#F2A541'>&#9679;</span> ":"")+esc(p.name)+"</button>";}).join('');
el.querySelectorAll('.lqm').forEach(function(b){b.addEventListener('click',function(){var p=d.lanes[+b.getAttribute('data-i')];LQ.moreOpen=false;el.innerHTML='';if(p)lqOpen({kind:'proj',repo:p.repo,lit:p.lit});});});return;}
el.innerHTML=(d.more||[]).map(function(s){return "<button type='button' class='lqmb lqm' data-s='"+s+"'>"+esc(LQNAMES[s]||s)+"</button>";}).join('');
el.querySelectorAll('.lqm').forEach(function(b){b.addEventListener('click',function(ev){var s=b.getAttribute('data-s');LQ.moreOpen=false;el.innerHTML='';lqUse(s,ev);lqGo(s);});});}
function lqGo(shape){if(shape==='tasks'||shape==='agents'){lqWorkBy('task');return;}lqPool(shape);}
// A blob: what only you can do, in a few words. A question: the project (its name
// as people say it), the question in a line, its two answers as buttons (the one
// it recommends first), or your own words; an Approve or a first step: the one
// button that opens it. On home (home=true) its name opens the project lit up.
// A drafted reply as it will look: a LinkedIn message, a WhatsApp bubble or an email, the reply only.
function draftHtml(d){var where=d.kind==='social'?'LinkedIn':d.kind==='chat'?'WhatsApp':(d.platform||'email');return "<div class='dmsg dm-"+escQ(d.kind||'mail')+"' aria-label='the reply, as it will be sent'><div class='dmto'>"+(d.to?'To '+esc(d.to)+' · ':'')+esc(d.platform||where)+"</div><div class='dmb'>"+esc(d.text||'')+"</div></div>";}
function blobOpt(o){return String(o||'').replace(/[ ]*[(]recommended[)][ ]*$/i,'');}
// What you type in a blob's own-words box, kept per question (its folder and the
// question, else its id) in localStorage as you type: a redraw, a reload or a restart brings it
// back, with the cursor where it was, and it goes only once the answer is sent. A
// week-old one is dropped. One whose question went (answered elsewhere) is said in
// Home's talk with what you wrote (bdOrphans), never dropped silently.
var BDKEY='symbiot-blobdrafts',BDKEEP=7*86400000;
function bdKey(y){return y.path&&y.q?String(y.path)+'|'+String(y.q):String(y.id||'')+'|'+String(y.q||y.sub||'');} // the same question on Home, the Workdesk and a project
function bdAll(){try{var a=JSON.parse(localStorage.getItem(BDKEY)||'{}');return a&&typeof a==='object'?a:{};}catch(e){return {};}}
function bdGet(y){var d=bdAll()[bdKey(y)];return d&&d.text?d:null;}
function bdSet(y,text,s,e,src){var a=bdAll(),k=typeof y==='string'?y:bdKey(y),now=Date.now();if(text)a[k]={text:String(text),at:now,s:s,e:e,name:y.name||y.repo||'',q:y.q||'',src:src||'blob'};else delete a[k];
for(var x in a)if(now-(a[x].at||0)>BDKEEP)delete a[x];try{localStorage.setItem(BDKEY,JSON.stringify(a));}catch(er){}}
function bdOrphans(you){var a=bdAll(),keys={},ch=false;(you||[]).forEach(function(y){if(y.kind==='ask')keys[bdKey(y)]=1;});
for(var k in a){var d=a[k];if(keys[k]||d.told||!d.text||d.src==='desk')continue;d.told=1;ch=true;lqSaid('Your answer to '+(d.name||'an agent')+' wasn’t sent: '+(d.q?'“'+lqShort(d.q,70)+'” ':'its question ')+'was answered or closed elsewhere. What you wrote: “'+d.text+'”');}
if(ch)try{localStorage.setItem(BDKEY,JSON.stringify(a));}catch(e){}}
function blobBody(y,home){var h='',nm=y.name||y.repo||(y.kind==='setup'?y.title:'')||'';
h+=home?"<button type='button' class='lt' title='open "+escQ(nm)+", with this lit up'><span>"+esc(lqShort(nm,30))+"</span><i>open &rsaquo;</i></button>":"<div class='nhead'><b>"+esc(nm)+(y.kind==='ask'?" asks":"")+"</b>"+(y.more?"<span class='muted'>+"+y.more+" more on its block in Agents</span>":"")+"</div>";
if(y.kind!=='ask')return h+"<div class='bq'>"+esc(y.kind==='approve'?String(y.sub||'').replace(/ · only you decide$/,''):String(y.sub||'').charAt(0).toUpperCase()+String(y.sub||'').slice(1)+'.')+"</div><div class='bo'><button type='button' class='nopt rec ngo'><span class='bt'>"+(y.kind==='approve'?'Review and approve':y.id==='setup:inbox'?(y.signin?'Sign in again':'Show me your inbox'):y.id==='setup:ai'?'Connect an AI':y.pick?'Use '+y.pick.name:y.urgent?'Reconnect':'Open Settings')+"</span></button></div>";
var os=y.options||[];if(y.draft)h+=draftHtml(y.draft);h+="<div class='bq' title='"+escQ((y.q||'')+(y.why?' ('+y.why+')':''))+"'>"+esc(y.q||y.sub||'')+"</div>";
if(y.fix==='handover'&&y.sub)h+="<div class='bfor' title='"+escQ(y.sub)+"'>for: "+esc(y.sub)+"</div>";
if(y.signInTo)h+="<div class='bo'><button type='button' class='nopt bsign' title='opens "+escQ(y.signInTo.name)+" in the Symbiot Browser: sign in there, then click Done'><span class='bt'>Sign in to "+esc(y.signInTo.name)+" &rsaquo;</span></button></div>";
if(os.length)h+="<div class='bo'>"+os.map(function(o,j){return "<button type='button' class='nopt"+(j===0&&/[(]recommended[)]/i.test(o)?' rec':'')+"' data-j='"+j+"' title='"+escQ(o)+"'><span class='bt'>"+whoHtml(blobOpt(o))+"</span></button>";}).join('')+"</div><button type='button' class='bfree' aria-expanded='false'>"+(y.draft?'Change it':'or answer in your own words')+"</button>";
h+="<form class='bfx"+(os.length?' hidden':'')+"'><input placeholder='"+(y.draft?'what to change':'your answer')+"' aria-label='"+(y.draft?'what to change in the reply':'your answer to '+escQ(nm))+"'><button type='submit'>"+(y.draft?'Redraft':'Send')+"</button></form>";
if(home&&y.more)h+="<span class='bmore'>+"+y.more+" more question"+(y.more>1?'s':'')+" after this one</span>";
return h;}
// Answering in a blob is answering on the agent's block in Agents (Send answers &
// continue): saved to its ANSWERS.md, and its agent picks it up. Then it dissolves.
function wireBlob(box,y,o){o=o||{};var say=o.say||lqSaid,nm=y.name||y.repo||'the agent';
var lock=function(on){box.querySelectorAll('button,input').forEach(function(b){b.disabled=on;});};
var send=function(ans,j){ans=String(ans||'').trim();if(!ans||(!y.path&&!y.fix))return;lock(true);
(y.fix?api('/api/home/answer',j!=null?{id:y.id,pick:j}:{id:y.id,text:ans}):api('/api/agents/answer',{path:y.path,answers:[{q:y.q,a:ans}],rerun:true})).then(function(r){
if(!r||r.error){lock(false);say(nm+': '+((r&&r.error)||'the answer didn’t save. Try again on its block on the Workdesk.'),true);return;}
say(y.fix?nm+': '+(r.said||'Done.'):'Sent to '+(r.lane||nm)+'. '+(r.yours&&r.yours.length?'Still yours to do: '+r.yours.join(' '):r.rerun?'Its agent is picking it up now.':(r.note||'Saved in its ANSWERS.md.')));
bdSet(y,'');if(o.sent)o.sent();if(box.classList)box.classList.add('gone');setTimeout(function(){if(o.done)o.done();},650);}).catch(function(e){lock(false);say(nm+': '+String((e&&e.message)||e),true);});};
box.querySelectorAll('.nopt[data-j]').forEach(function(b){b.addEventListener('click',function(){var j=+b.getAttribute('data-j');send((y.options||[])[j],j);});});
var bs=box.querySelector('.bsign');if(bs)bs.addEventListener('click',function(){bs.disabled=true;openSignIn(y.signInTo,function(t,ok){bs.disabled=false;say(t,!ok);});});
var fr=box.querySelector('.bfree'),fx=box.querySelector('.bfx'),fi=fx&&fx.querySelector('input');
if(fi){var dr=bdGet(y);if(dr&&!fi.value){fi.value=dr.text;if(fx.classList)fx.classList.remove('hidden');if(fr)fr.setAttribute('aria-expanded','true');try{if(dr.s!=null)fi.setSelectionRange(dr.s,dr.e!=null?dr.e:dr.s);}catch(e){}}
var keep=function(){bdSet(y,fi.value,fi.selectionStart,fi.selectionEnd);};['input','keyup','mouseup','select'].forEach(function(t){fi.addEventListener(t,keep);});}
if(fr&&fx)fr.addEventListener('click',function(){var shut=fx.classList.toggle('hidden');fr.setAttribute('aria-expanded',shut?'false':'true');var i=fx.querySelector('input');if(!shut&&i&&i.focus)i.focus();if(o.grew)o.grew();});
if(o.grew&&fi&&fx&&!fx.classList.contains('hidden'))setTimeout(o.grew,0); // a draft brought back opened it
if(fx)fx.addEventListener('submit',function(ev){if(ev&&ev.preventDefault)ev.preventDefault();var i=fx.querySelector('input');send(i&&i.value);});
var go=box.querySelector('.ngo');if(go)go.addEventListener('click',function(){if(!y.pick){lqFocus(y);return;}
// Pick your agent: the one Symbiot found, in one click; Settings has the others
lock(true);api('/api/agentcmd',{cmd:y.pick.tmpl}).then(function(r){if(!r||r.error){lock(false);say((r&&r.error)||'It didn’t save. Pick it in Settings.',true);return;}
say('Your agent is '+y.pick.name+' now: Send to repos and Go hand your tasks to it.');if(box.classList)box.classList.add('gone');LQ.fresh=true;setTimeout(function(){if(o.done)o.done();else lqLoad(false);},650);}).catch(function(e){lock(false);say(String((e&&e.message)||e),true);});});}
function lqSaid(t){LQ.talk.push({me:false,text:t});LQ.talk=LQ.talk.slice(-8);lqTalkShow(false);}
// A lit orb opens its project with what lit it lit up and in view (lqLight): a
// repo's questions and its Approve, under "Needs you here" at the top of its
// tasks, with its held handovers; an ops run's question on its block in Agents;
// a first step on its part of Settings.
function lqFocus(y){lqAct();y=y||{};LQ.focus={kind:y.kind||'',repo:y.repo||'',path:y.path||'',focus:y.focus||'',shown:false};
document.querySelectorAll('main .lit').forEach(function(x){x.classList.remove('lit');}); // only what this orb lit stays lit
if(y.kind==='setup'){lqPool('settings');setTimeout(lqLight,300);return;}
if(!y.repo||y.repo==='ops'){lqPool('agents');return;}
TFILTER.repo=y.repo;TFILTER.type='';lqPool('tasks');
api('/api/home?fresh=1').then(function(h){if(h&&h.you)LQ.home=h;renderNeeds();}).catch(function(){});}
// Needs you here: what only you can do in the project the Tasks list is filtered
// to, at its top, each answerable where it is; its held handovers under them.
function renderNeeds(){var el=$('needsbox');if(!el)return;var repo=TFILTER.repo;
// what an answer here said stays with the project it was about, not under the next one's cards
var po=$('pushout');if(po&&po.getAttribute('data-needs')!==null&&po.getAttribute('data-needs')!==String(repo||'')){po.innerHTML='';po.removeAttribute('data-needs');}if(!repo||TARCH){el.innerHTML='';return;}
var ys=((LQ.home&&LQ.home.you)||[]).filter(function(y){return y.repo===repo&&y.kind==='ask';});
var paint=function(held){if(TFILTER.repo!==repo)return;if(!ys.length&&!held.length){el.innerHTML='';lqLight();return;}
keepTyping(el,"<div class='tgroup' style='color:var(--amber)'>Needs you here <span class='tcount'>"+(ys.length+held.length)+"</span></div>"+
ys.map(function(y,i){return "<div class='task nitem lqblob' data-k='"+i+"' data-key='"+escQ(bdKey(y))+"'>"+blobBody(y,false)+"</div>";}).join('')+
held.map(function(x){return "<div class='task nitem'><div class='nhead'><b>"+esc(x.from)+" &rarr; "+esc(x.to)+"</b><span class='muted'>handed over, "+esc(LANEWORD.held)+"</span></div><div class='bq'>"+esc(x.text)+"</div></div>";}).join(''));
el.querySelectorAll('.nitem[data-k]').forEach(function(box){var y=ys[+box.getAttribute('data-k')];if(!y||box._wired)return;box._wired=true;
if(y.kind==='ask')wireBlob(box,y,{say:function(t,bad){var o=$('pushout');o.innerHTML="<div class='note "+(bad?'err':'ok')+"'>"+esc(t)+"</div>";o.setAttribute('data-needs',String(repo||''));},done:function(){LQ.home.you=(LQ.home.you||[]).filter(function(x){return x!==y;});LQ.fresh=true;renderNeeds();}});
else{var rv=box.querySelector('.ngo');if(rv){rv.innerHTML="<span class='bt'>Review it below</span>";rv.addEventListener('click',function(){var rc=null;document.querySelectorAll('#reviewlist .rcard').forEach(function(c){if(c.getAttribute('data-repo')===repo)rc=c;});if(!rc)return;rc.classList.add('lit');if(rc.scrollIntoView)rc.scrollIntoView({block:'center',behavior:'smooth'});var ap=rc.querySelector('.approve');if(ap&&ap.focus)ap.focus({preventScroll:true});});}}});
lqLight();};
api('/api/lanes').then(function(d){paint(((d&&d.handoffs)||[]).filter(function(x){return x.status==='held'&&(x.to===repo||x.from===repo);}));}).catch(function(){paint([]);});}
// What lit the orb, lit up where it opened (.lit): the first in view, and with only
// one, its first answer focused. Again after each re-render, but scrolled to once.
var SETFOCUS={ai:'provider',work:'scanroots',agent:'agentcmd',links:'links',company:'knowroots',checks:'knowchecks',phone:'phonelink'};
function lqLight(){var f=LQ.focus;if(!f||LQ.mode!=='pool')return;var things=[],also=[];
if(f.kind==='setup'){var a=$(SETFOCUS[f.focus]||''),s=a&&a.closest?a.closest('.sset'):null;if(f.focus==='checks'&&a)things.push(a);else if(s)things.push(s);}
else if(current==='tasks'&&f.repo&&f.repo!=='ops'){document.querySelectorAll('#needsbox .nitem').forEach(function(e){things.push(e);});document.querySelectorAll('#reviewlist .rcard').forEach(function(e){if(e.getAttribute('data-repo')===f.repo)(things.length?also:things).push(e);});}
else if(current==='tasks'){document.querySelectorAll('#agentslist .agent[data-i]').forEach(function(e){var g=AGENTLIST[+e.getAttribute('data-i')];if(g&&(nQs(g)||g.waiting)&&(f.path?g.path===f.path:/act-[0-9a-f]+$/.test(String(g.path))))things.push(e);});}
things.concat(also).forEach(function(e){if(e.classList)e.classList.add('lit');});
if(!things.length||f.shown)return;f.shown=true;var e0=things[0];if(e0.scrollIntoView)e0.scrollIntoView({block:'start',behavior:'smooth'});
if(things.length===1&&e0.querySelector){var c=e0.querySelector('.nopt,.aq input[type=radio],.qother,button.approve,select,input');if(c&&c.focus){try{c.focus({preventScroll:true});}catch(e){c.focus();}}}}
// The work, by task (the Workdesk) or by project (the Projects group): the same scene, a step in the history each.
function lqWorkBy(by){if(LQ.scene==='work'&&LQ.workBy===by&&LQ.mode!=='pool')return;lqRemember();LQ.back=true;LQ.workBy=by;try{lqWork();}finally{LQ.back=false;}}
// Back, one step: every move between screens (home, the Tasks scene, a panel, the
// Archive) notes where you were; a right-click (or the mouse's back button) returns
// there. In a text field or over selected text the browser's own menu stays.
function lqState(){return {by:LQ.workBy||'task',scene:LQ.scene==='work'?'work':'home',pool:LQ.mode==='pool'?(LQ.poolShape||null):null,arch:LQ.mode==='pool'&&!!LQ.arch};}
function lqRemember(){if(LQ.back)return;LQ.hist=LQ.hist||[];var s=lqState(),top=LQ.hist[LQ.hist.length-1];if(top&&top.scene===s.scene&&top.pool===s.pool&&top.arch===s.arch)return;LQ.hist.push(s);if(LQ.hist.length>40)LQ.hist.shift();}
function lqBack(){var h=LQ.hist||[],s=h.pop(),cur=lqState();if(!s){if(cur.pool)s={scene:cur.scene,pool:null};else if(cur.scene==='work')s={scene:'home',pool:null};else return;}
LQ.back=true;try{if(s.scene==='work'&&(cur.scene!=='work'||cur.by!==s.by)){LQ.workBy=s.by||'task';lqWork();}else if(s.scene==='home'&&cur.scene==='work')lqHome();
if(s.pool){if(s.arch)lqArchive();else lqPool(s.pool);}else if(LQ.mode==='pool')lqSink();}finally{LQ.back=false;}}
function lqPool(shape){lqWhy(null);if(shape==='map'&&LM.items&&LM.items.length)setTimeout(function(){lmFit();lmStart();},60);lqRemember();LQ.poolShape=shape;LQ.arch=false;tabPicked=true;setTab(shape);var b=document.body;if(b&&b.classList)b.classList.add('lq-pooled');LQ.mode='pool';var m=document.querySelector('main');if(m){m.scrollTop=0;if(m.focus)m.focus();}}
function lqSink(){lqWhy(null);lqRemember();LQ.focus=null;var b=document.body;if(b&&b.classList)b.classList.remove('lq-pooled');LQ.mode='aware';lqAct();lqLoad(false);}
function lqAct(){if(AWAY)return;LQ.lastAct=Date.now();if(LQ.mode==='rest'){LQ.mode='aware';lqLoad(true);}}
function lqTalkMode(on){LQ.talking=on;var b=document.body;if(b&&b.classList)b.classList.toggle('lq-talking',on);}
// Minimize: the chat shrinks back to its input and Home comes back as it was; what was
// said stays (LQ.talk), and "Chat · n" above the input opens it again. Esc, the chat's
// Minimize, or a click outside it do it; sending a message opens it again.
LQ.talkMin=false;
function lqTalkBar(){var el=$('lqtalkbar'),n=LQ.talk.length,b=document.body;if(!n)LQ.talkMin=false;if(b&&b.classList){b.classList.toggle('lq-chat',n>0&&!LQ.talkMin);b.classList.toggle('lq-chatmin',n>0&&LQ.talkMin);}if(!el)return;
var up="<svg width='12' height='12' viewBox='0 0 12 12' aria-hidden='true'><path d='M2.5 7.5 6 4l3.5 3.5' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>",down="<svg width='12' height='12' viewBox='0 0 12 12' aria-hidden='true'><path d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>";
var h=!n?'':LQ.talkMin?"<button type='button' class='lqtb-open' aria-expanded='false' aria-controls='lqtalk' title='open the chat again'>"+up+"Chat &middot; "+n+" message"+(n>1?'s':'')+"</button>":"<span class='lqtb-t'>Chat with Symbiot</span><button type='button' class='lqtb-min' aria-expanded='true' aria-controls='lqtalk' title='minimize the chat (Esc): Home comes back, the chat stays'>Minimize"+down+"</button>";
if(!sameHtml(el,h)){var bt=el.querySelector('button');if(bt)bt.addEventListener('click',function(){if(LQ.talkMin)lqChatOpen();else lqChatMin();});}}
function lqChatMin(){if(!LQ.talk.length||LQ.talkMin)return;LQ.talkMin=true;var i=$('lqask');if(i&&i.blur&&document.activeElement===i)i.blur();lqTalkMode(false);lqTalkBar();lqAct();}
function lqChatOpen(){LQ.talkMin=false;lqTalkMode(true);lqTalkShow(false);lqAct();var i=$('lqask');if(i&&i.focus)i.focus();}
function lqTalkShow(wait){var el=$('lqtalk');if(!el)return;var n=LQ.talk.length;el.innerHTML=LQ.talk.map(function(m,i){var age=n-1-i,op=age<2?1:age===2?0.7:age===3?0.45:0.25;return "<div class='lqmsg"+(m.me?' me':'')+"' style='opacity:"+op+"'>"+(m.imgs&&m.imgs.length?"<span class='lqmimgs'>"+m.imgs.map(function(d){return "<img src='"+d+"' alt='your screenshot'>";}).join('')+"</span>":"")+esc(m.text)+lqAltsHtml(m.go)+(m.signInTo?"<span class='lqalts'><button type='button' class='lqmb lqsign' data-i='"+i+"'>Sign in to "+esc(m.signInTo.name)+"</button></span>":"")+stepsHtml(m.steps)+"</div>";}).join('')+(wait?"<div class='lqmsg thinking'>Thinking: recalling what it knows, reading what's here&hellip;</div>":'');if(el.scrollHeight)el.scrollTop=el.scrollHeight;
el.querySelectorAll('[data-go]').forEach(function(b){b.addEventListener('click',function(){lqNav(b.getAttribute('data-go'));});});
el.querySelectorAll('.lqsign').forEach(function(b){b.addEventListener('click',function(){var m=LQ.talk[+b.getAttribute('data-i')];if(m)openSignIn(m.signInTo,function(t){lqSaid(t);});});});
// scrolled up to read back: the whole history shows, clear; back at the bottom it rolls on again
if(!el.wired&&el.addEventListener){el.wired=true;el.addEventListener('scroll',function(){var up=el.scrollHeight-el.scrollTop-el.clientHeight>24;if(el.classList)el.classList.toggle('back',up);});}lqTalkBar();}
// Screenshots in the talk: paste one (Ctrl+V) or drop it on the bar; it shows as a
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
var VOICE={rec:null,on:false,spoke:false,final:'',base:'',err:'',ph:''};
function voiceOk(){return !!(window.SpeechRecognition||window.webkitSpeechRecognition);}
function voiceMic(on){var m=$('lqmic');if(!m)return;m.classList.toggle('on',on);m.setAttribute('aria-pressed',on?'true':'false');m.setAttribute('aria-label',on?'Stop listening':'Talk to Symbiot');var a=$('lqask');if(a){if(on){VOICE.ph=a.getAttribute('placeholder')||'';a.setAttribute('placeholder','Listening… speak, then pause to send');}else if(VOICE.ph)a.setAttribute('placeholder',VOICE.ph);}}
function voiceSay(t){LQ.talkMin=false;lqTalkMode(true);LQ.talk.push({me:false,text:t});LQ.talk=LQ.talk.slice(-8);lqTalkShow(false);}
var VOICE_WHY={'not-allowed':'Symbiot couldn’t use your microphone. Allow it for this window (the icon at the top of the window, or your system’s privacy settings), then click the mic again.','service-not-allowed':'Symbiot couldn’t use your microphone. Allow it for this window, then click the mic again.','audio-capture':'No microphone was found. Plug one in, or check it’s switched on, then try again.','network':'Talking needs an internet connection: your browser turns speech into text online.'};
function voiceToggle(){
if(VOICE.on){try{VOICE.rec.stop();}catch(e){}return;}
voiceStop();
var R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return;
var r;try{r=new R();}catch(e){return;}
var ask=$('lqask');VOICE.rec=r;VOICE.final='';VOICE.err='';VOICE.base=((ask&&ask.value)||'').trim();
r.lang=navigator.language||'en-US';r.interimResults=true;r.continuous=false;r.maxAlternatives=1;
r.onstart=function(){VOICE.on=true;voiceMic(true);lqAct();};
r.onresult=function(ev){var interim='';for(var i=ev.resultIndex;i<ev.results.length;i++){var t=ev.results[i][0].transcript;if(ev.results[i].isFinal)VOICE.final+=t;else interim+=t;}
if(ask){ask.value=((VOICE.base?VOICE.base+' ':'')+(VOICE.final+interim)).replace(/ +/g,' ').trim();lqGrowAsk();}};
r.onerror=function(ev){VOICE.err=(ev&&ev.error)||'';};
r.onend=function(){VOICE.on=false;voiceMic(false);VOICE.rec=null;var said=((ask&&ask.value)||'').trim(),why=VOICE_WHY[VOICE.err];
if(why){voiceSay(why);return;}
if(VOICE.final.trim()&&said){VOICE.spoke=true;lqSay();}};
try{r.start();}catch(e){VOICE.on=false;voiceMic(false);}}
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
function voiceClean(t){var clean=String(t||'').replace(/\\s*[\\u2190-\\u21ff\\u2794-\\u27bf\\u27f5-\\u27ff]\\s*/g,', ').replace(/(^|[.?!:]), /g,'$1 ').replace(/[*_#>|]+/g,' ').replace(new RegExp(String.fromCharCode(96),'g'),'').replace(/https?:[^ ]+/g,'a link').replace(/ +/g,' ').trim();
if(clean.length>700){var cut=clean.slice(0,700),at=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('? '),cut.lastIndexOf('! '));clean=(at>200?cut.slice(0,at+1):cut)+' The rest is on screen.';}
return clean;}
function voiceSystem(text,v){if(!window.speechSynthesis||!text)return;try{var u=new SpeechSynthesisUtterance(text);if(v)u.voice=v;u.lang=voiceLang();u.rate=1.02;window.speechSynthesis.cancel();window.speechSynthesis.speak(u);}catch(e){}}
// a sentence at a time, so the first is heard while the next is made
function voiceSentences(t){var out=[],cur='';t.split(' ').forEach(function(w){cur+=(cur?' ':'')+w;var e=w.charAt(w.length-1);if((e==='.'||e==='?'||e==='!')&&cur.length>24){out.push(cur);cur='';}});if(cur)out.push(cur);return out;}
function voiceOwn(text,lang){var my=SPEAK.n,parts=voiceSentences(text),got=[];
var make=function(i){if(i>=parts.length||got[i])return;got[i]=fetch('/api/voice/say',{method:'POST',headers:{'x-symbiot-token':T,'content-type':'application/json'},body:JSON.stringify({text:parts[i],lang:lang})}).then(function(r){if((r.headers.get('content-type')||'').indexOf('audio')<0)throw new Error('no audio');return r.blob();});};
var play=function(i){if(my!==SPEAK.n||i>=parts.length)return;make(i);make(i+1);
got[i].then(function(b){if(my!==SPEAK.n)return;var a=new Audio(URL.createObjectURL(b));SPEAK.audio=a;a.onended=function(){try{URL.revokeObjectURL(a.src);}catch(e){}play(i+1);};var pl=a.play();if(pl&&pl.catch)pl.catch(function(){});})
.catch(function(){if(my!==SPEAK.n)return;SPEAK.own=null;var nat=voiceNatural();voiceSystem(parts.slice(i).join(' '),nat&&nat.any);});};
play(0);}
function voiceSpeak(t){if(!t)return;voiceStop();var clean=voiceClean(t);if(!clean)return;var nat=voiceNatural();
if(nat&&nat.best){voiceSystem(clean,nat.best);return;}
var lang=voiceLang(),go=function(st){if(st&&st.state==='ready'){voiceOwn(clean,lang);return;}
if(st&&(st.state==='missing'||st.state==='failed')&&!SPEAK.asked){SPEAK.asked=true;api('/api/voice/prepare',{lang:lang}).catch(function(){});}
voiceSystem(clean,nat&&nat.any);};
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
else if(LQNAMES[to]){lqUse(to,null,'talk');lqGo(to);}
else return;
lqWhy(g&&g.to===to?g:null);}
function lqAltsHtml(g){return g&&g.alts&&g.alts.length?"<span class='lqalts'>Or: "+g.alts.map(function(a){return "<button type='button' class='lqmb' data-go='"+escQ(a.to)+"'>"+esc(a.label||a.to)+"</button>";}).join('')+"</span>":'';}
function lqWhy(g){var el=$('lqwhy');if(!el)return;var on=!!(g&&(g.why||(g.alts&&g.alts.length)));if(el.classList)el.classList.toggle('on',on);
el.innerHTML=on?(g.why?"<span>"+esc(g.why)+"</span>":'')+(g.alts&&g.alts.length?"<span>Or:</span>"+g.alts.map(function(a){return "<button type='button' class='lqmb' data-go='"+escQ(a.to)+"'>"+esc(a.label||a.to)+"</button>";}).join(''):''):'';
if(on)el.querySelectorAll('[data-go]').forEach(function(b){b.addEventListener('click',function(){lqNav(b.getAttribute('data-go'));});});}
function lqSay(){var spoke=VOICE.spoke;VOICE.spoke=false;var i=$('lqask');var q=((i&&i.value)||'').trim(),shots=LQ.atts.slice();if(!q&&!shots.length)return;if(!q)q='Take a look at this screenshot.';i.value='';lqGrowAsk();LQ.atts=[];lqAttsShow();lqAct();
var low=q.toLowerCase().replace(/^(please |can you |could you )/,''),hit=lqNavHit(q);
if(hit){lqNav(hit);return;}
if(/^(go|start|go for it|start them|start it)[.! ]*$/.test(low)){lqTalkMode(true);lqGoWork();return;}
if(/^(home|back)[.! ]*$/.test(low)&&LQ.scene==='work'){lqHome();return;}
LQ.talkMin=false;lqTalkMode(true);LQ.talk.push({me:true,text:q,imgs:shots.map(function(a){return a.data;})});LQ.talk=LQ.talk.slice(-8);lqTalkShow(true);
api('/api/home/ask',{question:q,images:shots}).then(function(r){LQ.talk.push({me:false,steps:r.steps||[],go:r.go||null,signInTo:r.signInTo||null,text:r.error==='not-connected'?'Connect an AI in Settings to talk to me. Say "open settings".':(r.answer||r.error||'(no answer)')});if(spoke)voiceSpeak(r.spoken||LQ.talk[LQ.talk.length-1].text);LQ.talk=LQ.talk.slice(-8);lqTalkShow(false);LQ.ripple=[0.5,0.47,LQ.t];if(r.go&&r.go.to){lqNav(r.go.to,r.go);return;}lqLoad(false);}).catch(function(e){LQ.talk.push({me:false,text:String((e&&e.message)||e)});lqTalkShow(false);});}
// The physics: each droplet a critically damped spring to its place (no wobble,
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
var GLSOFT=false,GLSTILL=false;try{GLSTILL=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(e){}
function glEvery(busy){return GLSOFT||GLSTILL?(busy?3:12):1;}
function glDpr(max){return GLSOFT?0.34:Math.min(window.devicePixelRatio||1,max);}
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
var now=(window.performance&&performance.now)?performance.now():Date.now(),t=(now-G.t0)/1000,th=LQ.theme,slow=GLSOFT||GLSTILL,still=th.still||slow,o=G.out;LQ.t=t;
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
if(slow){var sig=W+'|'+H+'|'+th.look+th.night+th.contrast;for(var q=0;q<o.length;q++)sig+=','+Math.round(o[q]*400);if(sig===G.sig)return;G.sig=sig;}
var U=G.U;gl.uniform2f(U.uRes,W,H);gl.uniform1f(U.uT,slow?0:t);gl.uniform1f(U.uDpr,d);gl.uniform4fv(U.uB,o);gl.uniform3f(U.uRip,LQ.ripple[0],LQ.ripple[1],still?-10:LQ.ripple[2]);
gl.uniform1f(U.uStyle,th.look==='glass'?0:th.look==='pearl'?2:1);gl.uniform1f(U.uContrast,th.contrast?1:0);gl.uniform1f(U.uExposure,th.night?0.82:1);
gl.drawArrays(gl.TRIANGLES,0,3);}

// ---- Away (Super and the key above Tab) ------------------------------------------------------------
// ?away=1 from "symbiot away": this window is one of the screens. One screen: the
// orb rests in the middle. More: it bounces across their shared area (gw x gh) at
// the same pace in every window from the same start (t0), each drawing it while it's
// over its own part (ax, ay, aw x ah), so it crosses from screen to screen. Under it,
// the time and what's going on, counts only. Any key or click closes every window.
var AWAY=null;
(function(){try{var q=new URLSearchParams(location.search);if(q.get('away')!=='1')return;var n=function(k,d){var v=Number(q.get(k));return isFinite(v)&&q.get(k)!==null?v:d;};
AWAY={n:n('n',1),ax:n('ax',0),ay:n('ay',0),aw:n('aw',0),ah:n('ah',0),gw:n('gw',0),gh:n('gh',0),t0:n('t0',Date.now()),since:Date.now(),shown:Date.now()};}catch(e){}})();
var pingpong=function(d,L){if(L<=0)return 0;var m=d%(2*L);if(m<0)m+=2*L;return m<=L?m:2*L-m;};
function lqAwayPos(S){var cx=S.w/2,cy=S.h*0.42;if(!AWAY||AWAY.n<2||!AWAY.gw||!AWAY.aw)return {x:cx,y:cy};
var k=S.w/AWAY.aw,R=220,L=AWAY.gw-2*R,M=AWAY.gh-2*R,t=(Date.now()-AWAY.t0)/1000,v=95;
var gx=R+pingpong(v*t*0.83+L/2,L),gy=R+pingpong(v*t*0.56+M/2,M);
return {x:(gx-AWAY.ax)*k,y:(gy-AWAY.ay)*k};}
function awShort(t){t=String(t||'');var cut=[' - ',' \u00b7 ',' | '];cut.forEach(function(c){var i=t.indexOf(c);if(i>0)t=t.slice(0,i);});return t.trim();}
function awStatus(){var el=$('awstat');if(!el)return;Promise.all([api('/api/home').catch(function(){return {};}),api('/api/work').catch(function(){return {};})]).then(function(r){var h=r[0]||{},w=r[1]||{},out=[];
var runs=(w.running||[]).slice(0,4),nr=(w.running||[]).length||h.working||0;
out.push(nr?'<b>'+nr+' agent'+(nr===1?'':'s')+' at work</b>':'No agent at work');
runs.forEach(function(x){out.push("<span class='awr'>"+esc(x.lane||x.name||'')+': '+esc(runWarn(x)+(x.line||x.doing||'working on it')+(x.eta?' · '+x.eta:''))+'</span>');});
var y=h.youCount||0;out.push(y?'<b>'+y+' thing'+(y===1?'':'s')+' only you can do</b>':'Nothing needs you');
var fd=(h.feeds||[]).filter(function(f){return f.count;}).slice(0,4).map(function(f){return esc(awShort(f.title))+' '+f.count;});if(fd.length)out.push('Waiting: '+fd.join(' \u00b7 '));
el.innerHTML=out.join('<br>');}).catch(function(){});}
function awTick(){var tm=$('awtime'),dt=$('awdate');if(!tm)return;var d=new Date(),p=function(x){return (x<10?'0':'')+x;};tm.textContent=p(d.getHours())+':'+p(d.getMinutes());
dt.textContent=d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})+' \u00b7 away since '+p(new Date(AWAY.since).getHours())+':'+p(new Date(AWAY.since).getMinutes());}
function awPlace(){var o=$('lqaway');if(!o||!LQ.core)return;var S=lqSize(),c=LQ.core,h=o.offsetHeight||220,x=c.x-220,below=c.y+c.cr+30,y=below+h<S.h-10?below:c.y-c.cr-30-h;
o.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px)';o.style.opacity=(c.x+220<0||c.x-220>S.w)?'0':'1';}
// Its own screen, full: Chrome lists the screens (its profile lets this address see
// them) and puts this window full screen on the si-th, left to right; their places
// come from there too (scaled, as the page sees them). No list: full screen where it is.
function awayScreen(){var si=0;try{si=Number(new URLSearchParams(location.search).get('si'))||0;}catch(e){}
var fs=function(scr){var el=document.documentElement;try{var p=scr?el.requestFullscreen({screen:scr}):el.requestFullscreen();if(p&&p.catch)p.catch(function(){});}catch(e){}};
if(!AWAY||AWAY.n<2||!window.getScreenDetails){fs(null);return;} // one window: full screen where it is
window.getScreenDetails().then(function(d){var L=((d&&d.screens)||[]).slice().sort(function(a,b){return a.left-b.left||a.top-b.top;}),t=L[si]||L[0];if(!t){fs(null);return;}
var mn=function(f){return Math.min.apply(null,L.map(f));},mx=function(f){return Math.max.apply(null,L.map(f));},x0=mn(function(s){return s.left;}),y0=mn(function(s){return s.top;});
AWAY.n=L.length;AWAY.ax=t.left-x0;AWAY.ay=t.top-y0;AWAY.aw=t.width;AWAY.ah=t.height;AWAY.gw=mx(function(s){return s.left+s.width;})-x0;AWAY.gh=mx(function(s){return s.top+s.height;})-y0;
fs(t);}).catch(function(){fs(null);});}
function awayInit(){if(!AWAY||!document.body)return;document.body.classList.add('lq-away');LQ.mode='rest';awayScreen();
var o=document.createElement('div');o.id='lqaway';o.innerHTML="<div class='awt' id='awtime'></div><div class='awd' id='awdate'></div><div class='aws' id='awstat'></div><div class='awh'>Any key or click to come back</div>";document.body.appendChild(o);
awTick();awStatus();setInterval(awTick,5000);setInterval(awStatus,15000);
var bye=function(ev){if(Date.now()-AWAY.shown<1500)return;if(ev&&ev.type==='keydown'&&['Meta','OS','Super','Shift','Control','Alt','Hyper'].indexOf(ev.key)>=0)return;api('/api/away',{open:false}).catch(function(){});};
['keydown','mousedown','touchstart','wheel'].forEach(function(t){document.addEventListener(t,bye,true);});
var raf=window.requestAnimationFrame&&function(f){return window.requestAnimationFrame(f);};if(raf){var loop=function(){awPlace();raf(loop);};raf(loop);}}

// ---- Setup: the first run --------------------------------------------------------
// A new Symbiot shows this before anything else (home.mjs onboarding): what it is, your
// AI, where your work is, your agent, every app you use (connected, or "I don't use
// it"), your documents, then Home. Where you are is kept, so closing it resumes there.
var ONB=null,ONB_T=null,ONB_NAMES={computer:'Your computer',welcome:'Welcome',ai:'Your AI',work:'Your work',agent:'Your agent',apps:'Your apps',docs:'Documents',phone:'Your phone',done:'Done'};
function onbStep(d){var st=(ONB&&ONB.steps)||[],k=st.indexOf(ONB&&ONB.step);return st[k+d]||'';} // the step before (-1) or after (1) this one
function onbLoad(fresh){return api('/api/onboarding'+(fresh?'?fresh=1':'')).then(function(o){ONB=o;var el=$('onb');if(!el)return;if(!o||!o.pending){el.classList.add('hidden');document.body.classList.remove('lq-onb');if(ONB_T){clearInterval(ONB_T);ONB_T=null;}return;}
el.classList.remove('hidden');document.body.classList.add('lq-onb');onbRender();
if(!ONB_T)ONB_T=setInterval(function(){if(ONB&&ONB.pending&&['ai','work','agent','apps','phone','computer'].indexOf(ONB.step)>=0&&!onbBusy())onbLoad(ONB.step==='ai');},2500);}).catch(function(){});}
// not while you're typing in it
function onbBusy(){var a=document.activeElement;return !!(a&&$('onb').contains(a)&&(a.tagName==='INPUT'||a.tagName==='SELECT'));}
function onbGo(step){api('/api/onboarding/set',{step:step}).then(function(o){ONB=o;onbRender();var b=$('onbbody');if(b&&b.parentNode)b.parentNode.scrollTop=0;});}
function onbNav(prev,next,label,ok){return "<div class='onbnav'>"+(prev?"<button class='back' data-go='"+prev+"'>Back</button>":"")+"<span class='sp'></span>"+(next?"<button class='act' data-go='"+next+"'"+(ok===false?' disabled':'')+">"+esc(label||'Continue')+"</button>":"")+"</div>";}
function onbRender(){var o=ONB,b=$('onbbody'),d=$('onbdots');if(!o||!b)return;var st=o.steps||[],k=st.indexOf(o.step);
d.innerHTML=st.map(function(x,i){return "<i class='"+(i===k?'on':i<k?'past':'')+"' title='"+esc(ONB_NAMES[x]||x)+"'></i>";}).join('');
var h='';
if(o.step==='welcome'){
h="<img class='onborb' src='/favicon.svg?look="+encodeURIComponent(lqLookGet()||'ferro')+"' alt=''><h2 id='onbt'>Meet Symbiot</h2><p class='onbl'>It works alongside you, so your time goes on what only you can do.</p><div class='onbcards'>"+
[['It watches','What you work on and what comes in: your projects, your mail, chats and code.'],['It works','It hands tasks to your coding agent, which does them on its own and tells you what it did.'],['It asks','Only what only you can do: a sign-in, a decision, your OK before anything goes out.']].map(function(c){return "<div class='onbcard'><b>"+c[0]+"</b><span>"+c[1]+"</span></div>";}).join('')+
"</div><p class='onbnote'>Setup takes a few minutes: your AI, your work, your agent and every app you use. Symbiot starts finding your projects meanwhile.</p>"+onbNav(onbStep(-1), 'ai', 'Set it up');}
else if(o.step==='ai'){var a=o.ai||{},c=a.claude||{};
h="<h2 id='onbt'>Your AI</h2><p class='onbl'>Symbiot thinks with an AI: it reads what comes in, talks with you and writes for you.</p>";
if(a.connected)h+="<div class='onbok'><i>✓</i><div>Symbiot is using <b>"+esc(a.line)+"</b>"+(a.provider==='claude'?". It’s the Claude account you’re signed in with in Claude Code: no key, nothing extra to pay.":".")+"</div></div>";
else h+="<div class='onbbox'><h3>Your Claude subscription (recommended)</h3><p>Symbiot thinks through Claude Code, Anthropic’s own app, with your Claude account: no key, and nothing extra to pay.</p>"+
(c.installing?"<p><span class='onbspin'></span>Installing Claude Code… this takes about a minute.</p>":
 !c.installed?"<button class='act' id='onbccinst'>Install Claude Code</button>"+(c.installError?"<p class='onbnote' style='margin-top:10px'>"+esc(c.installError)+"</p>":""):
 c.signingIn?"<p><span class='onbspin'></span>Sign in on the page that opened in your browser. This ticks itself when you’re done.</p><div class='onbrow'><input id='onbcccode' placeholder='If the page shows a code, paste it here'><button class='ghost' id='onbccsend'>Send</button></div>":
 "<p>Claude Code is installed. Now sign in with your Claude account.</p><button class='act' id='onbccsign'>Sign in with Claude</button>"+(c.signinError?"<p class='onbnote' style='margin-top:10px'>"+esc(c.signinError)+"</p>":""))+
"<p class='onbnote' style='margin:12px 0 0'>Already done it yourself? <button class='back' id='onbrecheck' style='padding:0'>Check again</button></p></div>"+
"<div class='onbbox'><h3>Or an API key, or a free local model</h3><div class='onbrow'><select id='onbprov'><option value='anthropic'>Claude (Anthropic) API key</option><option value='openai'>OpenAI API key</option><option value='gemini'>Gemini API key</option><option value='ollama'>Local model (Ollama), no key</option></select><input id='onbkey' type='password' placeholder='paste your key'><button class='ghost' id='onbconnect'>Connect</button></div><p id='onbaimsg' style='margin:8px 0 0'></p></div>";
h+=onbNav('welcome','work','Continue',!!a.connected);}
else if(o.step==='work'){var w=o.work||{};
h="<h2 id='onbt'>Your work</h2><p class='onbl'>Symbiot finds the projects on this computer, so it knows what you’re working on and where to send each task.</p>";
h+=w.searching||!w.at?"<p><span class='onbspin'></span>Looking through your folders"+(w.total?": "+w.done+" of "+w.total+" checked":"")+"…</p>":"<p>"+(w.count?"Found <b>"+w.count+"</b> project"+(w.count>1?'s':'')+". Is that all of them? If one’s missing, add the folder it’s in below.":"I searched your folders and found no projects. Add the folder they’re in.")+"</p>";
if(w.repos&&w.repos.length)h+="<div class='onbrepos'>"+w.repos.slice(0,40).map(function(r){return "<span title='"+esc(r.path)+"'>"+esc(r.name)+"</span>";}).join('')+(w.count>40?"<span>and "+(w.count-40)+" more</span>":"")+"</div>";
h+="<div class='onbbox' style='margin-top:14px'><p>Looking in: "+((w.roots||[]).map(function(r){return "<code>"+esc(r)+"</code>";}).join(' ')||'your home folder')+"</p><div class='onbrow'><input id='onbroot' placeholder='Add a folder, e.g. ~/work'><button class='ghost' id='onbaddroot'>Add</button></div></div>";
h+=onbNav('ai','agent');}
else if(o.step==='agent'){var g=o.agent||{},cur=(g.agents||[]).find(function(x){return x.tmpl===g.cmd;}),pk=g.pick;
h="<h2 id='onbt'>Your agent</h2><p class='onbl'>Your coding agent takes the tasks Symbiot hands it and does them on its own, inside that project. Symbiot stops it from pushing to main, publishing, deleting outside the project or touching your keys.</p>";
if(g.cmd)h+="<div class='onbok'><i>✓</i><div>Tasks go to <b>"+esc(cur?cur.label:'your agent')+"</b>.</div></div>";
else if(pk)h+="<div class='onbbox'><h3>"+esc(pk.name)+" is on this computer</h3><p>"+esc(pk.label)+"</p><button class='act' id='onbuse' data-cmd='"+esc(pk.tmpl)+"'>Use "+esc(pk.name)+"</button></div>";
else h+="<div class='onbbox'><h3>No coding agent found</h3><p>Install Claude Code (<code>npm install -g @anthropic-ai/claude-code</code>) to let Symbiot hand work over. You can carry on and add it later in Settings.</p></div>";
h+=onbNav('work','apps');}
else if(o.step==='apps'){var ap=o.apps||[],left=ap.filter(function(x){return !x.skipped&&x.state==='off';}).length;
h="<h2 id='onbt'>Your apps</h2><p class='onbl'>Connect every app you use, so Symbiot sees what comes in. Each opens in a window to sign in; Symbiot keeps the sign-in on this computer. Mark the ones you don’t use.</p>";
(o.groups||[]).forEach(function(gp){var rows=ap.filter(function(x){return x.group===gp;});if(!rows.length)return;h+="<div class='onbgrp'>"+esc(gp)+"</div>";
rows.forEach(function(x){var stt=x.skipped?"<span class='st'>Not used</span><button class='ghost' data-unskip='"+esc(x.id)+"'>Undo</button>":
x.state==='off'?"<button class='act' data-link='"+esc(x.id)+"'>Connect</button><button class='ghost' data-skip='"+esc(x.id)+"'>I don’t use it</button>":
x.state==='ok'?"<span class='st ok'>✓ Connected"+(x.agents?" · your agents can use it too":"")+"</span>":
"<span class='st wait'>"+(x.state==='signedout'?'Signed out':'Sign in in the window that opened')+"</span><button class='ghost' data-check='"+esc(x.id)+"'>Check</button><button class='ghost' data-link='"+esc(x.id)+"'>Open again</button>";
h+="<div class='onbapp'><span class='nm'>"+esc(x.name)+"</span>"+stt+"</div>";});});
h+="<div class='onbfoot'><p class='onbnote'>"+(left?left+" left to decide. ":"All decided. ")+(left?"<button class='ghost' id='onbskiprest'>I don’t use the rest</button>":"")+"</p>"+onbNav('agent','docs','Continue',!!o.decided)+"</div>";}
else if(o.step==='docs'){var fs=(o.docs||{}).folders||[];
h="<h2 id='onbt'>Your documents</h2><p class='onbl'>Optional. A folder of your company’s documents lets Symbiot quote them when you ask, and spot where they disagree (a deadline on someone’s leave, a price told two ways).</p>";
if(fs.length)h+="<div class='onbok'><i>✓</i><div>"+fs.map(function(f){return "<code>"+esc(f)+"</code>";}).join(' ')+"</div></div>";
h+="<div class='onbbox'><div class='onbrow'><input id='onbdoc' placeholder='A folder, e.g. ~/Company'><button class='ghost' id='onbadddoc'>Add</button></div><p id='onbdocmsg' style='margin:8px 0 0'></p></div>";
h+=onbNav('apps',onbStep(1),fs.length?'Continue':'Skip for now');}
else if(o.step==='phone'){var pp=o.phone||{},pn=pp.phones||[];
h="<h2 id='onbt'>Your phone</h2><p class='onbl'>Optional. Your tasks, what needs you and your agents’ questions on your phone, with Symbiot’s app there: tick, add, answer and approve from it, at home or away.</p>";
if(pn.length)h+="<div class='onbok'><i>✓</i><div>Paired: <b>"+esc(pn.join(', '))+"</b>. Your work is on it now.</div></div>";
else if(pp.on&&pp.listening&&pp.qr)h+="<div class='onbbox'>"+phoneQr(pp,"Symbiot’s Settings → <b>Your phone</b>")+"<p class='onbnote' style='margin:0'>Away from home, what they send passes through symbiot.co.za, sealed: it can’t read it. No app on your phone yet? It’s at <a href='https://symbiot.co.za' target='_blank' rel='noopener'>symbiot.co.za</a>.</p></div>";
else h+=(pp.error?"<p class='onbnote err'>"+esc(pp.error)+"</p>":"")+"<div class='onbbox'><h3>Pair the app on your phone</h3><p>This computer shows a code for your phone to scan. It listens on your Wi-Fi for your phone alone, and everything between the two is sealed with a key they agree.</p><button class='act' id='onbphone'>"+(pp.on&&pp.listening?'New code':'Show the code')+"</button></div>";
h+=onbNav('docs','done',pn.length?'Continue':'I don’t have the app');}
else if(o.step==='computer'){var pc0=o.phone||{};
h="<h2 id='onbt'>Your computer</h2><p class='onbl'>Does Symbiot run on your computer? Pair this phone with it and your work there is here too: your tasks, what needs you, your agents’ questions, and Approve, at home or away.</p>";
if(pc0.paired)h+="<div class='onbok'><i>✓</i><div>Paired with <b>"+esc(pc0.name)+"</b>. Its work is on Home, in its own droplet.</div></div><div class='onbnav'><button class='back' data-go='welcome'>Also use Symbiot on this phone</button><span class='sp'></span><button class='act' id='onbfinish'>Open Symbiot</button></div>";
else h+="<div class='onbbox'><h3>Scan the code your computer shows</h3><p>In Symbiot on your computer, open Settings → <b>Your phone</b> and switch it on: it shows a QR. Point this phone’s camera at it and tap its link.</p><p id='onbpairmsg' class='onbnote' style='margin:0'></p></div>"+
"<div class='onbbox'><h3>Or type its address and code</h3><div class='onbrow'><input id='onbpaddr' placeholder='e.g. 192.168.8.50:7392'><input id='onbpcode' placeholder='code' inputmode='numeric' style='flex:0 0 100px;min-width:0'><button class='ghost' id='onbppair'>Pair</button></div><div class='onbrow' style='margin-top:8px'><button class='ghost' id='onbpfind'>Look for it on this network</button></div><div id='onbpfound' class='pcfound'></div></div>"+
"<div class='onbnav'><span class='sp'></span><button class='act' data-go='welcome'>No computer: use Symbiot on this phone</button></div>";}
else{var conn=(o.apps||[]).filter(function(x){return x.state!=='off'&&!x.skipped;}).length;
h="<h2 id='onbt'>You’re set up</h2><p class='onbl'>Here’s what Symbiot has to work with. You can change any of it in Settings.</p><div class='onbbox'><p>"+
[(o.ai&&o.ai.connected?'✓ ':'· ')+'AI: '+esc((o.ai&&o.ai.line)||'not connected'),(((o.work||{}).count)?'✓ ':'· ')+((o.work||{}).count||0)+' project'+(((o.work||{}).count)===1?'':'s'),(o.agent&&o.agent.cmd?'✓ ':'· ')+'Agent: '+(o.agent&&o.agent.cmd?'ready':'none yet'),(conn?'✓ ':'· ')+(conn?conn+' app'+(conn===1?'':'s')+' connected':'no apps connected yet')].concat(o.phone&&o.phone.role==='computer'?[((o.phone.phones||[]).length?'✓ Phone: '+esc(o.phone.phones.join(', ')):'· Phone: not paired (Settings → Your phone)')]:o.phone&&o.phone.paired?['✓ Computer: '+esc(o.phone.name)]:[]).join('<br>')+
"</p></div><h3 style='margin:18px 0 4px;font:600 15px var(--sans);color:var(--bone)'>Finding your way</h3><ul class='onbtour'><li>Each orb is a place: tap it to open it, right-click to go back.</li><li>Amber means something needs you.</li><li>Talk to Symbiot at the bottom: ask anything, or tell it what to do.</li></ul>"+
"<div class='onbnav'><button class='back' data-go='"+onbStep(-1)+"'>Back</button><span class='sp'></span><button class='act' id='onbfinish'>Open Symbiot</button></div>";}
b.innerHTML=h;
b.querySelectorAll('[data-go]').forEach(function(x){x.addEventListener('click',function(){onbGo(x.getAttribute('data-go'));});});
var on=function(id,f){var x=$(id);if(x)x.addEventListener('click',f);};
on('onbrecheck',function(){onbLoad(true);});
on('onbccinst',function(){api('/api/claude/install',{}).then(function(){onbLoad(true);});});
on('onbccsign',function(){api('/api/claude/signin',{}).then(function(){onbLoad(true);});});
on('onbccsend',function(){var v=$('onbcccode').value.trim();if(!v)return;api('/api/claude/code',{code:v}).then(function(){onbLoad(true);});});
on('onbconnect',function(){var pv=$('onbprov').value,m=$('onbaimsg');m.textContent='Checking…';api('/api/connect',{provider:pv,key:$('onbkey').value.trim(),model:''}).then(function(r){m.textContent=r.message||'';onbLoad(true);});});
var pvs=$('onbprov');if(pvs)pvs.addEventListener('change',function(){$('onbkey').style.display=pvs.value==='ollama'?'none':'';});
on('onbaddroot',function(){var v=$('onbroot').value.trim();if(!v)return;api('/api/scanroots/add',{path:v}).then(function(){onbLoad();});});
on('onbuse',function(){var c=$('onbuse').getAttribute('data-cmd');api('/api/agentcmd',{cmd:c}).then(function(){onbLoad();});});
on('onbskiprest',function(){api('/api/onboarding/set',{skipRest:true}).then(function(r){ONB=r;onbRender();});});
on('onbadddoc',function(){var v=$('onbdoc').value.trim();if(!v)return;api('/api/knowledge/add',{path:v}).then(function(r){$('onbdocmsg').textContent=r&&r.error?r.error:'';onbLoad();});});
on('onbfinish',function(){api('/api/onboarding/done',{}).then(function(){onbLoad();LQ.fresh=true;lqLoad(true);});});
on('onbphone',function(){var x=$('onbphone');x.disabled=true;api(ONB.phone&&ONB.phone.on&&ONB.phone.listening?'/api/phone/code':'/api/phone/link',{on:true}).then(function(){onbLoad();});});
on('onbppair',function(){var m=$('onbpairmsg'),x=$('onbppair');x.disabled=true;api('/api/phone/pair',{address:$('onbpaddr').value,code:$('onbpcode').value}).then(function(r){x.disabled=false;if(r&&r.error){if(m)m.textContent=r.error;return;}onbLoad();LQ.fresh=true;});});
on('onbpfind',function(){phoneFind($('onbpfind'),$('onbpfound'),function(u){$('onbpaddr').value=u.replace(/^http:[/][/]/,'');$('onbpcode').focus();});});
b.querySelectorAll('[data-link]').forEach(function(x){x.addEventListener('click',function(){x.disabled=true;api('/api/links/link',{id:x.getAttribute('data-link')}).then(function(){onbLoad();});});});
b.querySelectorAll('[data-check]').forEach(function(x){x.addEventListener('click',function(){x.disabled=true;api('/api/links/check',{id:x.getAttribute('data-check')}).then(function(){onbLoad();});});});
b.querySelectorAll('[data-skip]').forEach(function(x){x.addEventListener('click',function(){api('/api/onboarding/set',{skip:x.getAttribute('data-skip')}).then(function(r){ONB=r;onbRender();});});});
b.querySelectorAll('[data-unskip]').forEach(function(x){x.addEventListener('click',function(){api('/api/onboarding/set',{unskip:x.getAttribute('data-unskip')}).then(function(r){ONB=r;onbRender();});});});}
function lqIcon(l){var q='/favicon.svg?look='+encodeURIComponent(l||'ferro'),k=document.querySelector('link[rel=icon]');if(k)k.setAttribute('href',q+'&small=1');var d=document.querySelector('header .dot');if(d)d.style.backgroundImage="url('"+q+"&small=1')";document.querySelectorAll('img.onborb').forEach(function(im){im.src=q;});}
function lqInit(){var bd=document.body;if(!bd||!bd.classList)return;lqIcon(lqLookGet());lqTheme();try{i18nStart();}catch(e){}bd.classList.add('lq-liquid');
['(prefers-color-scheme: light)','(prefers-contrast: more)','(forced-colors: active)','(prefers-reduced-transparency: reduce)','(prefers-reduced-motion: reduce)'].forEach(function(q){try{var mq=window.matchMedia&&window.matchMedia(q);if(mq&&mq.addEventListener)mq.addEventListener('change',lqTheme);else if(mq&&mq.addListener)mq.addListener(lqTheme);}catch(e){}});
if(document.addEventListener){document.addEventListener('contextmenu',function(ev){var b=document.body,t=ev&&ev.target;if(!b||!b.classList||!b.classList.contains('lq-liquid'))return;if(t&&t.closest&&t.closest('input,textarea,select,[contenteditable]'))return;var sel=window.getSelection?String(window.getSelection()):'';if(sel)return;ev.preventDefault();lqBack();});
document.addEventListener('mouseup',function(ev){var b=document.body;if(ev&&ev.button===3&&b&&b.classList&&b.classList.contains('lq-liquid')){ev.preventDefault();lqBack();}});}
var L=$('liquid');if(L&&L.addEventListener){L.addEventListener('click',function(ev){var t=ev&&ev.target;if(t&&t.closest&&t.closest('button,input,form,.lqd'))return;var x=ev.clientX,y=ev.clientY,hit=null;LQ.drops.forEach(function(d){if(!hit&&Math.hypot(x-d.x,y-d.y)<=d.cr+8)hit=d;});if(hit)lqOpen(hit,ev);else if(LQ.openTag)lqTag(LQ.openTag);});L.addEventListener('pointermove',function(ev){LQ.pointer=[ev.clientX,ev.clientY];if(ev.pointerType==='touch')LQ.touch=true;lqAct();});L.addEventListener('pointerdown',function(ev){if(ev.pointerType==='touch')LQ.touch=true;lqAct();});}
var mic=$('lqmic');if(mic&&voiceOk()){mic.classList.remove('hidden');mic.addEventListener('click',function(){voiceToggle();});try{if(window.speechSynthesis)window.speechSynthesis.getVoices();}catch(e){}}
var f=$('lqform');if(f&&f.addEventListener)f.addEventListener('submit',function(ev){if(ev&&ev.preventDefault)ev.preventDefault();lqSay();});
var ia=$('lqask');if(ia&&ia.addEventListener){ia.addEventListener('paste',function(ev){var it=(ev.clipboardData&&ev.clipboardData.items)||[],got=false;for(var k=0;k<it.length;k++){if(it[k].kind==='file'&&String(it[k].type).indexOf('image/')===0){lqAttach(it[k].getAsFile());got=true;}}if(got)ev.preventDefault();});
var fm=$('lqform');if(fm&&fm.addEventListener){fm.addEventListener('dragover',function(ev){ev.preventDefault();if(fm.classList)fm.classList.add('drop');});fm.addEventListener('dragleave',function(){if(fm.classList)fm.classList.remove('drop');});fm.addEventListener('drop',function(ev){ev.preventDefault();if(fm.classList)fm.classList.remove('drop');var fs=(ev.dataTransfer&&ev.dataTransfer.files)||[];for(var k=0;k<fs.length;k++)lqAttach(fs[k]);});}
ia.addEventListener('focus',function(){if(!LQ.talkMin)lqTalkMode(true);lqAct();});ia.addEventListener('blur',function(){if(!ia.value&&!LQ.talk.length)lqTalkMode(false);});ia.addEventListener('input',lqGrowAsk);
// Enter sends, Shift+Enter is a new line (and Enter mid-composition, an IME's, is the IME's)
ia.addEventListener('keydown',function(ev){if(ev&&ev.key==='Enter'&&!ev.shiftKey&&!ev.isComposing&&ev.keyCode!==229){ev.preventDefault();lqSay();return;}});
ia.addEventListener('keydown',function(ev){if(ev&&ev.key==='Escape'){if(LQ.mode==='pool'){lqSink();return;}if(LQ.talk.length&&!LQ.talkMin){lqChatMin();return;}if(LQ.scene==='work'&&!ia.value){lqHome();return;}ia.value='';lqGrowAsk();lqTalkMode(false);if(ia.blur)ia.blur();}});}
// Esc anywhere on Home, or a click outside the chat (its messages, its bar, the input), minimizes it
if(document.addEventListener){document.addEventListener('keydown',function(ev){var t=ev&&ev.target;if(!ev||ev.key!=='Escape'||!LQ.talk.length||LQ.talkMin||LQ.mode==='pool')return;if(t&&t.closest&&t.closest('#lqform,main,input,textarea,select'))return;lqChatMin();});
document.addEventListener('pointerdown',function(ev){var t=ev&&ev.target;if(!LQ.talk.length||LQ.talkMin||LQ.mode==='pool')return;if(t&&t.closest&&t.closest('#lqtalk,#lqtalkbar,#lqform,#lqatts'))return;lqChatMin();},true);}
var co=$('lqcore');if(co&&co.addEventListener)co.addEventListener('click',function(){var i=$('lqask');if(i&&i.focus)i.focus();});
var sk=$('lqsink');if(sk&&sk.addEventListener)sk.addEventListener('click',lqSink);
var bk=$('lqback');if(bk&&bk.addEventListener)bk.addEventListener('click',lqHome);
var lk=$('lqlook');if(lk&&lk.querySelectorAll){var cur=lqLookGet();lk.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-checked',b.getAttribute('data-look')===cur?'true':'false');b.addEventListener('click',function(){lqLook(b.getAttribute('data-look'));});});}
var gb=$('lqgo');if(gb&&gb.addEventListener)gb.addEventListener('click',lqGoWork);
var so=$('lqsort');if(so&&so.querySelectorAll)so.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-checked',b.getAttribute('data-sort')===LANESORT?'true':'false');b.addEventListener('click',function(){lqSort(b.getAttribute('data-sort'));});});
var mn=document.querySelector('main');if(mn&&mn.addEventListener)mn.addEventListener('keydown',function(ev){if(ev&&ev.key==='Escape')lqSink();});
lqLoad(true);
// the only clocks: rest when left alone, fresh data now and then, the hour (night)
setInterval(function(){if(LQ.mode==='aware'&&!LQ.talking&&Date.now()-LQ.lastAct>LQ_REST)LQ.mode='rest';if(LQ.mode!=='pool')lqLoad(false);var h=new Date().getHours(),n=h>=22||h<6;if(n!==LQ.theme.night)lqTheme();},30000);
var G=lqGL();if(G){try{lqStep();lqDraw(G);}catch(e){}}if(typeof window.requestAnimationFrame!=='function')return;var raf=function(f){return window.requestAnimationFrame(f);};
function frame(){if(!document.hidden){LQ.frame++;if(LQ.mode!=='pool'||LQ.frame%3===0)lqStep();var every=(GLSOFT||GLSTILL)?glEvery(LQ.mode==='aware'):LQ.mode==='pool'?6:LQ.mode==='rest'?2:1;if(G&&LQ.frame%every===0)lqDraw(G);}raf(frame);} // moves every frame; drawn less at rest, behind a panel, without a GPU
raf(frame);}

initGraphEvents();syncP();refresh();firstTab();lqInit();onbLoad();var sbo=$('sbopen');if(sbo)sbo.addEventListener('click',function(){sbOpen('');});var rr=$('rerunsetup');if(rr)rr.addEventListener('click',function(){api('/api/onboarding/restart',{}).then(function(){lqSink();onbLoad();});});awayInit();lqDeep();loadWhatsNew();loadAgentCfg();loadScanRoots();loadKnowledge();loadPhone();loadLinks();loadMind();loadTrusted();loadMail();loadScreensUI();loadMonitorsUI();loadDesktop();loadWatchUI();setInterval(function(){whenFree(document.querySelector('main'),'watch',loadWatchUI);},60000);loadPhoneLink();
</script></body></html>`;
