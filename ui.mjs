// symbiot — the `symbiot app` page, served at / by index.mjs (cmdApp).
//
// Self-contained HTML served at / — no backticks or ${} inside (it lives in a
// template literal). Talks to the local API with the per-launch token.
// Kept apart from the CLI/server so UI edits can't break the backend (and vice
// versa); test/smoke.mjs boots the real page and exercises every handler.
export const EMBEDDED_UI = `<!doctype html><html><head><meta charset="utf8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Symbiot</title>
<style>
:root{--ink:#0E1A1F;--ink2:#15262C;--ink3:#1D333A;--line:#24404A;--bone:#F4F1EA;--text:#B7C9C4;--faint:#7E9690;--green:#3DDC97;--amber:#F2A541;--green-dim:#16322D;--sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
/* ---- the liquid: the app's home (adapt.mjs shapes it, home.mjs fills it) ---- */
/* Your colours, from the system, live: light/dark, contrast, transparency, forced colours. */
body.lq-light{--ink:#F4F6F9;--ink2:#FFFFFF;--ink3:#EDF0F4;--line:#D3D9E2;--bone:#0F1720;--text:#2B3644;--faint:#5C6878;--green:#0B7A55;--amber:#9A5200;--green-dim:#DDF2E9}
body.lq-contrast{--line:#9FB3BB;--faint:#C9D6D2}
body.lq-light.lq-contrast{--line:#4A5565;--faint:#2B3644;--text:#10151C}
#liquid{display:none}
body.lq-liquid #liquid{display:block;position:fixed;inset:0;z-index:0;overflow:hidden;background:#030405}
body.lq-liquid.lq-light #liquid{background:#EDEFF3}
#lq{position:absolute;inset:0;width:100%;height:100%;display:block}
body.lq-forced #lq{display:none}
#lqdrops{position:absolute;inset:0;pointer-events:none}
.lqd{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:44px;padding:8px 14px;border-radius:999px;border:1px solid rgba(220,228,240,.35);background:rgba(4,5,7,.72);backdrop-filter:blur(10px);color:#EEF2F8;font:600 14px/1.15 var(--sans);white-space:nowrap;cursor:pointer;pointer-events:auto;transition:opacity .5s ease;will-change:transform}
.lqd small{font-weight:500;font-size:12px;color:#A9B3C2;max-width:300px;overflow:hidden;text-overflow:ellipsis}
.lqd.lq-you{border-color:rgba(255,255,255,.9)}
.lqd:hover{border-color:rgba(255,255,255,.95)}
.lqd:focus-visible,#lqcore:focus-visible,#lqask:focus-visible{outline:2px solid currentColor;outline-offset:3px}
body.lq-light .lqd{background:rgba(255,255,255,.84);color:#10151C;border-color:rgba(20,30,45,.25)}
body.lq-light .lqd small{color:#4A5565}
body.lq-light .lqd.lq-you{border-color:#10151C}
body.lq-contrast .lqd{background:#000;color:#FFF;border:2px solid #FFF}
body.lq-contrast .lqd small{color:#FFF}
body.lq-light.lq-contrast .lqd{background:#FFF;color:#000;border:2px solid #000}
body.lq-light.lq-contrast .lqd small{color:#000}
body.lq-solid .lqd,body.lq-solid .lqglass{backdrop-filter:none;background:#05070A}
body.lq-light.lq-solid .lqd,body.lq-light.lq-solid .lqglass{background:#FFFFFF}
body.lq-touch .lqd{min-height:48px;padding:11px 16px}
body.lq-keys .lqd:focus{outline:2px solid currentColor;outline-offset:3px}
#lqcore{position:absolute;left:0;top:0;min-height:44px;padding:0 16px;border:1px solid rgba(220,228,240,.22);border-radius:999px;background:rgba(4,5,7,.6);backdrop-filter:blur(8px);color:#C3CBD7;font:500 13px var(--sans);letter-spacing:.05em;cursor:pointer;transition:opacity .6s ease;white-space:nowrap}
body.lq-light #lqcore{color:#2B3644;background:rgba(255,255,255,.78);border-color:rgba(20,30,45,.18)}
.lqglass{background:rgba(4,5,8,.78);border:1px solid rgba(220,228,240,.32);backdrop-filter:blur(14px)}
body.lq-light .lqglass{background:rgba(255,255,255,.82);border-color:rgba(20,30,45,.2)}
#lqform{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);width:min(640px,calc(100vw - 32px));display:flex;gap:8px;padding:6px;border-radius:999px;z-index:3;color:#EEF2F8}
body.lq-light #lqform{color:#10151C}
#lqask{flex:1;min-width:0;min-height:48px;padding:0 18px;border:0;border-radius:999px;background:transparent;color:inherit;font:400 16px var(--sans);outline:none}
#lqsend{min-height:48px;padding:0 20px;border-radius:999px;border:1px solid #FFFFFF;background:linear-gradient(180deg,#FFFFFF 0%,#C9CFD9 45%,#8E97A6 55%,#E6EAF0 100%);color:#06080B;font:600 14px var(--sans);cursor:pointer}
#lqtalk{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);width:min(640px,calc(100vw - 32px));display:flex;flex-direction:column;gap:8px;z-index:3;max-height:46vh;overflow:auto}
.lqmsg{align-self:flex-start;max-width:85%;padding:10px 14px;border-radius:16px;background:rgba(4,5,8,.84);border:1px solid rgba(220,228,240,.3);color:#E8ECF3;line-height:1.45;white-space:pre-wrap}
.lqmsg.me{align-self:flex-end}
body.lq-light .lqmsg{background:#FFFFFF;color:#10151C;border-color:rgba(20,30,45,.2)}
#lqmore{position:absolute;right:16px;bottom:92px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;z-index:3}
body.lq-liquid header{position:fixed;top:0;left:0;right:0;z-index:4;background:transparent;pointer-events:none}
body.lq-liquid header .status,body.lq-liquid header .ver{pointer-events:auto}
body.lq-liquid header .brand{letter-spacing:.38em;font-weight:500;text-transform:uppercase}
body.lq-liquid .tabs{display:none}
body.lq-liquid main{display:none}
body.lq-liquid.lq-pooled main{display:block;position:fixed;top:64px;left:max(12px,4vw);right:max(12px,4vw);bottom:88px;z-index:5;border-radius:24px;background:var(--ink);border:1px solid rgba(220,228,240,.25);box-shadow:0 30px 80px -30px rgba(0,0,0,.8)}
#lqsinkrow{display:none}
body.lq-liquid.lq-pooled #lqsinkrow{display:flex;justify-content:flex-end;position:sticky;top:0;z-index:2;margin:-8px -6px 6px}
body.lq-liquid footer{position:fixed;right:12px;top:38px;border:0;padding:0;z-index:4}
body.lq-pooled #lqtalk,body.lq-pooled #lqmore,body.lq-pooled #lqcore{display:none}
body.lq-talking .lqd{opacity:.55}
@media (prefers-reduced-motion: reduce){.lqd,#lqcore{transition:none}}
/* ---- the Symbiot look on every part: glass over the liquid, chrome, a silver edge ---- */
body.lq-liquid.lq-pooled main{background:rgba(6,8,11,.86);backdrop-filter:blur(20px) saturate(1.25);border:1px solid transparent;background-clip:padding-box;box-shadow:0 0 0 1px rgba(214,222,234,.22),0 40px 90px -30px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.12)}
body.lq-liquid.lq-light.lq-pooled main{background:rgba(246,248,251,.9);box-shadow:0 0 0 1px rgba(20,30,45,.14),0 40px 90px -40px rgba(20,30,45,.45),inset 0 1px 0 #FFFFFF}
body.lq-liquid.lq-solid.lq-pooled main{backdrop-filter:none;background:var(--ink)}
.lqedge{position:fixed;top:64px;left:max(12px,4vw);right:max(12px,4vw);bottom:88px;z-index:6;border-radius:24px;pointer-events:none;padding:1px;background:linear-gradient(115deg,rgba(255,255,255,.0) 0%,rgba(255,255,255,.75) 18%,rgba(140,150,166,.3) 32%,rgba(255,255,255,.0) 48%,rgba(230,236,244,.6) 66%,rgba(255,255,255,0) 82%);background-size:260% 260%;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:lqsheen 9s linear infinite;display:none}
body.lq-liquid.lq-pooled .lqedge{display:block}
@keyframes lqsheen{0%{background-position:0% 50%}100%{background-position:260% 50%}}
body.lq-liquid .task,body.lq-liquid .agent,body.lq-liquid .rcard,body.lq-liquid .bcard,body.lq-liquid .drift,body.lq-liquid .q,body.lq-liquid .out,body.lq-liquid .tchat{background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.02));border:1px solid rgba(220,228,240,.16);border-radius:16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 12px 30px -24px rgba(0,0,0,.9)}
body.lq-liquid.lq-light .task,body.lq-liquid.lq-light .agent,body.lq-liquid.lq-light .rcard,body.lq-liquid.lq-light .bcard,body.lq-liquid.lq-light .drift,body.lq-liquid.lq-light .q,body.lq-liquid.lq-light .out,body.lq-liquid.lq-light .tchat{background:linear-gradient(180deg,#FFFFFF,#F2F4F8);border-color:rgba(20,30,45,.12);box-shadow:inset 0 1px 0 #FFFFFF,0 12px 28px -24px rgba(20,30,45,.5)}
body.lq-liquid button.act{background:linear-gradient(180deg,#FFFFFF 0%,#D2D8E1 44%,#8E97A6 56%,#E6EAF0 100%);color:#06080B;border:1px solid rgba(255,255,255,.9);border-radius:999px;box-shadow:0 6px 18px -10px rgba(0,0,0,.7)}
body.lq-liquid button.ghost{background:rgba(255,255,255,.05);border:1px solid rgba(220,228,240,.28);border-radius:999px;color:var(--bone);backdrop-filter:blur(6px)}
body.lq-liquid.lq-light button.ghost{background:rgba(255,255,255,.7);border-color:rgba(20,30,45,.18)}
body.lq-liquid input,body.lq-liquid select,body.lq-liquid textarea{border-radius:12px;border:1px solid rgba(220,228,240,.2);background:rgba(255,255,255,.04);color:var(--bone)}
body.lq-liquid.lq-light input,body.lq-liquid.lq-light select,body.lq-liquid.lq-light textarea{background:#FFFFFF;border-color:rgba(20,30,45,.18)}
body.lq-liquid input:focus,body.lq-liquid select:focus,body.lq-liquid textarea:focus{outline:none;border-color:rgba(255,255,255,.7);box-shadow:0 0 0 3px rgba(200,210,224,.18)}
body.lq-liquid .tgroup{color:#C9D1DC;letter-spacing:.16em}
body.lq-liquid.lq-light .tgroup{color:#3B4656}
body.lq-liquid h2,body.lq-liquid h3{letter-spacing:-.01em}
body.lq-liquid .fchip.on{background:linear-gradient(180deg,#FFFFFF,#C9D1DC);color:#06080B;border-color:#FFFFFF}
body.lq-contrast.lq-liquid .task,body.lq-contrast.lq-liquid .agent{border:2px solid currentColor}
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
.msg .steps,.lqmsg .steps{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.steps span{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid rgba(220,228,240,.22);color:var(--faint);white-space:nowrap}
.thinking{background:linear-gradient(90deg,#8C96A6 0%,#FFFFFF 40%,#8C96A6 60%,#8C96A6 100%);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent !important;animation:lqshim 2.2s linear infinite}
body.lq-light .thinking{background-image:linear-gradient(90deg,#4A5565 0%,#0F1720 40%,#4A5565 60%,#4A5565 100%)}
@media (prefers-reduced-motion: reduce){.lqedge,.wkdoing,.thinking,.orb.run,.wktodo.in_progress i{animation:none}}


*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--ink);color:var(--text);font-family:var(--sans);font-size:14px;display:flex;flex-direction:column}
header{padding:16px 18px 10px;display:flex;align-items:center;gap:10px}
.dot{width:10px;height:10px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green)}
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
body.lq-liquid .updatebar.show{position:fixed;top:10px;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 24px);z-index:20;border-radius:999px;border:1px solid #FFFFFF;background:linear-gradient(180deg,#FFFFFF 0%,#D2D8E1 44%,#8E97A6 56%,#E6EAF0 100%);color:#06080B;box-shadow:0 14px 40px -14px rgba(0,0,0,.7)}
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
@media(max-width:600px){#panel-tasks .row>#newtask,#screenname,#pagesite{flex:1 1 100%!important}.tabs{overflow-x:auto;scrollbar-width:none;padding:0 8px;gap:0}.tabs::-webkit-scrollbar{display:none}.tab{flex:none;padding:9px 11px}header{padding:12px 14px 8px}main{padding:12px}}
</style></head><body>
<div id="liquid" aria-label="Symbiot">
<canvas id="lq" aria-hidden="true"></canvas>
<div id="lqdrops"></div>
<button type="button" id="lqcore" title="talk to Symbiot"></button>
<div id="lqmore"></div>
<div id="lqtalk" aria-live="polite"></div>
<form id="lqform" class="lqglass"><label for="lqask" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Talk to Symbiot</label><input id="lqask" autocomplete="off" placeholder="Talk to Symbiot, or tell it what to do"><button type="submit" id="lqsend">Send</button></form>
</div>

<div id="updatebar" class="updatebar"></div>
<div id="appbar" class="updatebar"></div>
<div id="whatsnew" class="whatsnew"></div>
<header><span class="dot"></span><span class="brand">Symbiot</span><span class="ver" id="ver"></span><span class="status" id="status">...</span></header>
<div class="tabs">
<button class="tab active" data-tab="map">Map</button>
<button class="tab" data-tab="board" id="boardtab">Dashboard</button>
<button class="tab" data-tab="drift">Drift</button>
<button class="tab" data-tab="week">Week</button>
<button class="tab" data-tab="standup">Standup</button>
<button class="tab" data-tab="todo">Todo</button>
<button class="tab" data-tab="tasks">Tasks</button>
<button class="tab" data-tab="agents">Agents</button>
<button class="tab" data-tab="settings">Settings</button>
</div>
<main>
<div class="lqedge" aria-hidden="true"></div><div id="lqsinkrow"><button class="ghost" type="button" id="lqsink" title="close it: it sinks back into the liquid (Esc)">Sink back</button></div>
<section id="panel-map">
<div class="profile muted" id="profile">Mapping your work&hellip;</div>
<div class="maprow">
<svg id="graph" viewBox="0 0 960 620" preserveAspectRatio="xMidYMid meet"></svg>
<aside id="detail" class="detail hidden"></aside>
</div>
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
<div style="margin-top:22px;border-top:1px solid var(--line);padding-top:4px">
<div class="tgroup">Screens <span class="tcount">experimental &middot; blueprints for screen automation</span></div>
<div class="note muted" style="margin-top:2px">Capture a screen, then drag a box over each part that matters (a button, a field, a menu) and name it. Each region keeps its pixel coordinates and its centre, ready for automation to aim at. With more than one display, pick which one to capture, or one screen per display. <b>Click here</b> on a region clicks its centre on your real screen, after you confirm. Or let Symbiot do it all for a web page: <b>Map page</b> opens it in a hidden browser, takes its screenshot and marks every button, link and field by itself, and <b>Press</b> on one of them follows it there and maps the next page; <b>Type</b> on a field types into it there. A map only has what fits in the window, so on a longer page <b>Scroll down</b> maps the next part, or <b>Whole page</b> maps all of it in one tall screenshot (where a list scrolls inside the page, like Gmail's mail, that list opened out: a whole inbox on one screen). Only a mapped page is typed into: nothing types on your real screen. <b>Watch</b> on a mapped page (your inbox, say) has Symbiot read it again every few minutes while it runs and tell you what's new there.</div>
<div class="row" style="margin-top:10px"><input id="pagesite" placeholder="a web page to map by itself: gmail, github.com/pulls or a web address" style="flex:1"><button class="act" id="mappage">Map page</button><button class="ghost" id="pagesignin" title="open this site in Symbiot's own browser as a window, to sign in once; close it when you're done">Sign in</button></div>
<div class="row" style="margin-top:10px"><input id="screenname" placeholder="name the screen, e.g. GitHub PR page" style="flex:1"><select id="screenwhich" class="hidden" title="which display to capture" style="flex:0 0 auto;width:auto"></select><select id="screendelay" title="wait first, so you can bring the right window to the front" style="flex:0 0 auto;width:auto"><option value="0">now</option><option value="3">in 3s</option><option value="5">in 5s</option><option value="10">in 10s</option></select><button class="ghost" id="capture">Capture screen</button><button class="ghost" id="screenload" title="use a PNG screenshot you already have">Load image</button><input type="file" id="screenfile" accept="image/png" class="hidden"></div>
<div id="screenmsg"></div>
<div id="watchbox"></div>
<div id="screenlist" class="taskfilter"></div>
<div id="screenview"></div>
</div>
</section>
<section id="panel-board" class="hidden">
<div class="row"><span class="muted" id="boardsum" style="flex:1">Everything you watch, side by side.</span><select id="boardhours" title="how far back" style="flex:0 0 auto;width:auto"><option value="24">last 24 hours</option><option value="72">last 3 days</option><option value="168">last 7 days</option></select><button class="ghost" id="boardrefresh">Refresh</button></div>
<div id="boardmsg"></div>
<div id="boardlinks"></div>
<div id="board" class="board"></div>
</section>
<section id="panel-run" class="hidden">
<div class="row"><button class="act" id="write">Write my <span id="what">week</span></button>
<button class="ghost hidden" id="copy">Copy</button>
<span class="muted">Reads your local git and writes it up.</span></div>
<div class="out muted" id="out">Nothing yet - hit the button.</div>
<div class="rfoot" id="outfoot" style="display:none"></div>
</section>
<section id="panel-tasks" class="hidden">
<div class="row"><input id="newtask" placeholder="Add a task..." style="flex:1"><select id="newtaskrepo" title="Which repo this task is for (needed to send it to an agent)" style="flex:0 0 auto;max-width:180px"><option value="">repo…</option></select><button class="act" id="addtask">Add</button><button class="ghost" id="pushtasks" title="Write .symbiot/TASKS.md into each repo for your coding agent">Send to repos</button></div>
<div class="note muted" style="margin-top:2px">To give tasks to your agent, use <b>Send to repos</b> &mdash; filter by tag below to choose which. As the agent finishes each one it lands in <b>Awaiting your review</b>: <b>Approve</b> commits it on a branch and opens a PR, <b>&#8630;</b> sends it back. Ticking a task yourself marks it done (it auto-archives). Click <b>&#128172;</b> on a task to ask questions about it.</div>
<div id="pushout"></div>
<div id="reviewout"></div>
<div id="reviewlist"></div>
<div id="taskfilter" class="taskfilter"></div>
<div id="tasklist"></div>
</section>
<section id="panel-agents" class="hidden">
<div class="row"><span class="muted">Agents Symbiot has handed work to — live status and output. Questions, options and ideas an agent leaves for you show up on its block, whichever model it runs.</span><button class="ghost" id="agentsrefresh" style="margin-left:auto">Refresh</button></div>
<div id="agentsmsg"></div>
<div id="laneslist"></div>
<div id="agentslist"></div>
</section>
<section id="panel-drift" class="hidden">
<div class="row"><span class="muted">What's out of sync, stuck or at risk across your repos — local git facts.</span>
<label class="muted" style="margin-left:auto"><input type="checkbox" id="driftfetch"> fetch latest</label>
<label class="muted"><input type="checkbox" id="driftci"> check CI (needs gh, experimental)</label>
<button class="ghost" id="driftrun">Rescan</button></div>
<div id="driftout"></div>
</section>
<section id="panel-settings" class="hidden">
<label>Which AI should Symbiot write with?</label>
<select id="provider">
<option value="anthropic">Claude (Anthropic)</option>
<option value="openai">OpenAI (GPT)</option>
<option value="gemini">Gemini (Google)</option>
<option value="ollama">Local model (Ollama) - free, no key</option>
</select>
<div class="note muted">The Map above needs no key. For the write-ups, a hosted model needs an API key - or run <b>Ollama</b> locally for a free, private option (nothing leaves your machine).</div>
<div id="keyWrap"><label>API key</label><input id="key" type="password" placeholder="paste your key">
<div class="note"><a id="getkey">Where do I get a key?</a></div></div>
<div id="baseWrap" class="hidden"><label>Ollama URL</label><input id="baseUrl" type="text" value="http://localhost:11434"></div>
<label>Model <span class="muted" id="modelHint"></span></label>
<input id="model" type="text" placeholder="(blank = default)">
<div class="row" style="margin-top:16px"><button class="act" id="save">Save &amp; connect</button>
<span class="note" id="saveMsg"></span></div>
<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<label>Folders to scan for repos</label>
<div id="scanroots"></div>
<div class="row" style="margin-top:6px"><input id="newroot" placeholder="/path/to/folder  (or ~/work) — where your projects live" style="flex:1"><button class="ghost" id="addroot">Add folder</button></div>
<div class="note muted" id="scanrootnote">Point Symbiot at where your work lives — inside or outside your home folder. Defaults to your home folder.</div>
</div>
<div id="phonebox" class="hidden" style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<label>Projects in Termux</label>
<div class="note muted" id="phonenote"></div>
<div class="row" style="margin-top:6px"><button class="ghost" id="phonebtn"></button></div>
</div>
<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<label>Hand off to your agent when you "Send to repos"</label>
<input id="agentcmd" type="text" placeholder="e.g.  aider --message &quot;{prompt}&quot; --yes   ·   code {dir}   ·   leave blank to just write the file">
<div class="note muted">Runs in each repo after tasks are written. Use <b>{dir}</b> = repo path, <b>{prompt}</b> = the task instruction. Works with any agent or editor &mdash; it's your command.</div>
<div id="agentpresets" style="margin-top:8px"></div>
<div class="note muted" id="agentconnectors"></div>
<div id="grantbox" style="margin-top:10px">
<label style="font-size:12px;color:var(--faint)">When an agent asks to run something or read a folder, grant it here instead of editing the command:</label>
<div class="row" style="margin-top:6px"><input id="granttool" placeholder="allow a command, e.g. python3 or pytest" style="flex:1"><button class="ghost" id="granttoolbtn">Allow command</button></div>
<div class="row" style="margin-top:6px"><input id="grantdir" placeholder="allow a folder, e.g. /home/you/GoSolr" style="flex:1"><button class="ghost" id="grantdirbtn">Allow folder</button></div>
<div class="note" id="grantnote"></div>
</div>
</div>
<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<label>Link your work</label>
<div class="note muted" style="margin-top:2px">One click per site you work in: it opens the site in Symbiot's own browser, where you sign in the usual way (its own login, SSO and 2FA; Symbiot never sees your password). Symbiot then trusts the site and watches its inbox or notifications, so what arrives there shows on the Dashboard and in Week and Standup. Close the window when you're signed in.</div>
<div id="links"></div>
<div id="linksmsg"></div>
<div class="note muted" id="linksnote">For a whole team, one <b>links.json</b> in Symbiot's config folder adds your company's own sites and hides the ones you don't use, so everyone gets the same buttons.</div>
</div>
<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<label>What Symbiot remembers</label>
<div class="note muted" style="margin-top:2px">Every chat in the app is the same Symbiot. What's worth knowing on another page (who someone is, which account is what, what you decided) is kept here, on this computer only, and each chat gets just the parts its question touches.</div>
<div id="mindlist"></div>
</div>
<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<label>Trusted sites for Screens <span class="muted">(experimental)</span></label>
<div id="trustedsites"></div>
<div class="row" style="margin-top:6px"><input id="newtrusted" placeholder="a site, e.g. mail.google.com or github.com" style="flex:1"><button class="ghost" id="addtrusted">Trust site</button></div>
<div class="note muted" id="trustednote">On a mapped page from one of these sites, <b>Press</b> and <b>Type</b> go ahead without asking, for you and for agents (<b>symbiot screens press</b> / <b>type</b>), signed in as you. A site covers its subdomains: google.com covers mail.google.com. Everywhere else, each one asks first. Only you add sites, here: Symbiot gives agents no command for it.</div>
</div>
<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<label>Email &mdash; add what you sent to Week and Standup <span class="muted">(experimental)</span></label>
<label class="check"><input type="checkbox" id="mailon"> Use my sent email (subjects &amp; recipients only)</label>
<div id="mailsources"></div>
<div class="row" style="margin-top:6px"><input id="newmail" placeholder="add a mail folder or .mbox file  (e.g. a Google Takeout export)" style="flex:1"><button class="ghost" id="addmail">Add</button><button class="ghost" id="mailpreview">Preview</button></div>
<input id="mailaddrs" type="text" placeholder="your email addresses, comma-separated  (only needed for a whole-mailbox export)">
<div class="note muted" id="mailnote">No API, no OAuth, no password: Symbiot reads the mail your desktop mail app (Thunderbird, Apple Mail, Evolution, mutt&hellip;) already keeps on this computer, or an exported .mbox &mdash; so anyone can link theirs. Headers only, never a message body; off until you tick it. Experimental: tested with mbox and Maildir, not yet on real Apple Mail, Evolution or KMail stores.</div>
<div id="mailout"></div>
</div>
<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<label>Weekly write-up and start at login</label>
<label class="check"><input type="checkbox" id="weeklyon"> Write my week and send me a desktop notification every</label>
<div class="row" style="margin-top:2px"><select id="weeklyday" style="width:auto"><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option></select><span class="muted">at</span><select id="weeklyhour" style="width:auto"></select><button class="ghost" id="weeklynow" title="write it now and send the notification, to check it works">Write it now</button></div>
<label class="check"><input type="checkbox" id="autostart"> <span id="autostartlbl">Start Symbiot in the background when I log in (no window)</span></label>
<div class="note muted" id="desktopnote"></div>
</div>
<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<label>Watch on your phone <span class="muted">(experimental)</span></label>
<div id="phonelink"></div>
</div>
<div style="margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
<label>Local models <span class="muted">(experimental)</span></label>
<button class="ghost" id="recbtn">Recommend models for my machine</button>
<button class="ghost" id="setuplocal" style="margin-left:8px">Set up a free local model</button>
<div id="setupout" class="note muted" style="margin-top:10px"></div>
<div id="recout" style="margin-top:12px"></div>
</div>
</section>
</main>
<footer><button class="ghost" id="quit" style="margin-left:auto">Quit</button></footer>
<script>
var T=new URLSearchParams(window.location.search).get('t')||'';
function api(path,body){return fetch(path,{method:body?'POST':'GET',headers:{'x-symbiot-token':T,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json();});}
var KEYURL={anthropic:'https://console.anthropic.com/settings/keys',openai:'https://platform.openai.com/api-keys',gemini:'https://aistudio.google.com/apikey',ollama:'https://ollama.com'};
var DEFMODEL={anthropic:'claude-opus-5-5',openai:'gpt-4o-mini',gemini:'gemini-1.5-flash',ollama:'llama3.1'};
function $(id){return document.getElementById(id);}
var current='map';var mapLoaded=false;var driftLoaded=false;
var COLORS={person:'#3DDC97',repo:'#F4F1EA',lang:'#F2A541',tool:'#6bb3ff',agent:'#c58af9',ai:'#5fe3b0',folder:'#b7a98c'};
function tabs(){return document.querySelectorAll('.tab');}
function setTab(tab){current=tab;tabs().forEach(function(t){t.classList.toggle('active',t.dataset.tab===tab);});
var isMap=tab==='map',isSet=tab==='settings',isTasks=tab==='tasks',isDrift=tab==='drift',isAgents=tab==='agents',isBoard=tab==='board',isRun=(tab==='week'||tab==='standup'||tab==='todo');
$('panel-map').classList.toggle('hidden',!isMap);
$('panel-board').classList.toggle('hidden',!isBoard);if(isBoard){loadBoard();loadLinks();}
$('panel-run').classList.toggle('hidden',!isRun);
$('panel-settings').classList.toggle('hidden',!isSet);
$('panel-tasks').classList.toggle('hidden',!isTasks);
$('panel-drift').classList.toggle('hidden',!isDrift);
$('panel-agents').classList.toggle('hidden',!isAgents);
if(isRun){$('what').textContent=tab;$('out').textContent='Nothing yet - hit the button.';$('out').classList.add('muted');$('copy').classList.add('hidden');$('outfoot').style.display='none';if(tab==='week')showLatestWeek();}
if(isMap&&!mapLoaded)loadMap();
if(isTasks){fillTaskRepos();loadTasks();}
if(isDrift&&!driftLoaded)loadDrift();
if(isAgents)loadAgents(); else stopAgentsPoll();}
var tabPicked=false;tabs().forEach(function(t){t.addEventListener('click',function(){tabPicked=true;setTab(t.dataset.tab);});});
// Watching a page (your inbox, GitHub)? The app opens on the Dashboard instead of
// the Map, unless you've picked a tab already. The Map still loads behind it.
function firstTab(){api('/api/watch/board').then(function(b){if(b&&b.cards&&b.cards.length&&!tabPicked&&current==='map')setTab('board');}).catch(function(){});}
function refresh(){api('/api/status').then(function(s){$('status').textContent=s.connected?s.line:'Not connected - open Settings';});}
// the status opens Settings: on a phone its tab is scrolled out of sight
$('status').style.cursor='pointer';$('status').addEventListener('click',function(){setTab('settings');var t=document.querySelector('.tab[data-tab=settings]');if(t&&t.scrollIntoView)t.scrollIntoView({block:'nearest',inline:'nearest'});});
$('write').addEventListener('click',function(){$('out').textContent='Writing...';$('out').classList.add('muted');$('copy').classList.add('hidden');
api('/api/run',{cmd:current}).then(function(r){var f=$('outfoot');if(r.error==='not-connected'){$('out').textContent='Not connected yet - open Settings and pick an AI.';f.style.display='none';return;}
// a week is saved to weeks/ as well (r.file), like Settings' Write it now
var foot=[r.footer,r.file?'Saved to '+r.file:'',r.error&&r.text&&r.error!==r.text?r.error:''].filter(Boolean).join(' · ');
$('out').textContent=r.text||'(no output)';$('out').classList.remove('muted');$('copy').classList.remove('hidden');if(foot){f.textContent=foot;f.style.display='block';}else{f.style.display='none';}});});
$('copy').addEventListener('click',function(){navigator.clipboard.writeText($('out').textContent);$('copy').textContent='Copied';setTimeout(function(){$('copy').textContent='Copy';},1400);});
function syncP(){var p=$('provider').value;var local=p==='ollama';$('keyWrap').classList.toggle('hidden',local);$('baseWrap').classList.toggle('hidden',!local);
$('getkey').textContent=local?'About Ollama':'Where do I get a key?';$('modelHint').textContent='(default '+DEFMODEL[p]+')';$('model').placeholder='(blank = '+DEFMODEL[p]+')';}
$('provider').addEventListener('change',syncP);
$('getkey').addEventListener('click',function(){window.open(KEYURL[$('provider').value],'_blank');});
$('save').addEventListener('click',function(){var p=$('provider').value;$('saveMsg').textContent='checking...';$('saveMsg').className='note muted';
var cfg={provider:p,model:$('model').value.trim()};if(p==='ollama')cfg.baseUrl=$('baseUrl').value.trim();else cfg.key=$('key').value.trim();
api('/api/connect',cfg).then(function(r){$('saveMsg').textContent=r.message||(r.ok?'Connected.':'Could not connect.');$('saveMsg').className='note '+(r.ok?'ok':'err');if(r.ok){$('key').value='';refresh();}});});
$('quit').addEventListener('click',function(){api('/api/quit');document.body.innerHTML='<div style=\\'padding:40px;color:#7E9690;font-family:sans-serif\\'>Symbiot stopped. You can close this window.</div>';});
var GRAPH=null,sel=null,view={k:1,x:0,y:0},GW=960,GH=620;
function esc(s){return String(s).replace(/[&<>]/g,function(ch){return ch==='&'?'&amp;':ch==='<'?'&lt;':'&gt;';});}
// An agent's option, with its who-acts markers as badges: 👤 You (you do this
// step) and 🤖 Agent (picking it is enough; the next run does it). Escaped first.
function whoHtml(o){return esc(o).replace(/👤[ ]*(You:|You(?=[ ]))?/g,"<span class='who you'>&#128100; You</span> ").replace(/🤖[ ]*(Agent:|Agent(?=[ ]))?/g,"<span class='who agent'>&#129302; Agent</span> ");}
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
function profileLine(g){var repos=g.nodes.filter(function(n){return n.type==="repo";});var base=g.stats.base||"your home folder";
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
el.innerHTML="<h3>"+esc(d.label)+"</h3><div class='chips'>"+chips+"</div>"+agentBadge(d)+"<button class='act' id='suggest' style='margin-top:12px'>Suggest next steps</button><div id='sugout'></div>";
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
function askBtn(t){var n=(t.chat||[]).length;return "<button class='ask"+(n?" has":"")+"' title='"+(n?"questions &amp; answers about this task":"ask a question about this task")+"'>&#128172;"+(n?" "+Math.ceil(n/2):"")+"</button>";}
function taskById(id){var all=PENDTASKS.concat(ALLTASKS);for(var i=0;i<all.length;i++)if(all[i].id===id)return all[i];return null;}
function stepsHtml(st){return st&&st.length?"<div class='steps'>"+st.map(function(x){return "<span>"+esc(x)+"</span>";}).join('')+"</div>":"";}
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
t.chat=r.chat||[];msgs.innerHTML=chatMsgs(t.chat);btn.className='ask on has';btn.innerHTML="&#128172; "+Math.ceil(t.chat.length/2);}).catch(function(e){send.disabled=false;var th=msgs.querySelector('.thinking');if(th)th.remove();msgs.insertAdjacentHTML('beforeend',"<div class='msg a err'>"+esc(String((e&&e.message)||e))+"</div>");});}
send.addEventListener('click',ask);inp.addEventListener('keydown',function(e){if(e.key==='Enter')ask();});
box.querySelector('.askclear').addEventListener('click',function(){api('/api/tasks/chat/clear',{id:id}).then(function(){t.chat=[];msgs.innerHTML=CHATHINT;btn.className='ask on';btn.innerHTML='&#128172;';});});
inp.focus();}
function fchip(dim,val,label){var on=(TFILTER[dim]||'')===val;return "<button class='fchip"+(on?' on':'')+"' data-dim='"+dim+"' data-val='"+esc(val)+"'>"+esc(label)+"</button>";}
function renderFilter(){var box=document.getElementById('taskfilter');
if(TARCH){box.innerHTML="<button class='fchip on' id='archtoggle'>&#8617; back to active</button>";document.getElementById('archtoggle').addEventListener('click',function(){loadTasks();});return;}
var types={},repos={};ALLTASKS.forEach(function(t){types[t.type||'Features & other']=1;if(t.repo)repos[t.repo]=1;});
var fb="<span class='fl'>Type</span>"+fchip('type','','All')+Object.keys(types).sort(function(a,b){return TORDER.indexOf(a)-TORDER.indexOf(b);}).map(function(t){return fchip('type',t,t);}).join('');
fb+="<span class='fl'>Repo</span>"+fchip('repo','','All')+Object.keys(repos).sort().map(function(r){return fchip('repo',r,r);}).join('');
fb+="<button class='fchip' id='archtoggle' style='margin-left:auto'>&#128451; archived</button>";
box.innerHTML=fb;
box.querySelectorAll('.fchip[data-dim]').forEach(function(c){c.addEventListener('click',function(){TFILTER[c.getAttribute('data-dim')]=c.getAttribute('data-val');renderTasks();});});
document.getElementById('archtoggle').addEventListener('click',loadArchived);}
function renderTasks(){var el=document.getElementById('tasklist');TARCH=false;renderFilter();
var list=ALLTASKS.filter(function(t){return !t.review&&(!TFILTER.type||(t.type||'Features & other')===TFILTER.type)&&(!TFILTER.repo||t.repo===TFILTER.repo);});
if(!list.length){el.innerHTML="<div class='muted' style='margin-top:12px'>"+(ALLTASKS.length?"Nothing matches this filter.":"No tasks yet. Tick ideas in a repo review, or add one above.")+"</div>";return;}
var groups={};list.forEach(function(t){var ty=t.type||'Features & other';(groups[ty]=groups[ty]||[]).push(t);});
var keys=Object.keys(groups).sort(function(a,b){var ia=TORDER.indexOf(a),ib=TORDER.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});
var h="";keys.forEach(function(ty){h+="<div class='tgroup'>"+esc(ty)+" <span class='tcount'>"+groups[ty].length+"</span></div>";groups[ty].forEach(function(t){h+=taskRow(t,false);});});
el.innerHTML=h;wireTaskRows(el);}
function loadTasks(){TARCH=false;api('/api/tasks/sync',{}).then(function(){api('/api/tasks').then(function(list){ALLTASKS=list;renderTasks();});loadPending();});}
// While an agent is still working in a repo on the review list, its Approve is
// greyed out; check again every few seconds, and when it finishes, sync (its last
// ticks land in review) so Approve unlocks without reopening the tab. The poll
// only re-renders on a change, so an open diff or chat isn't closed under you.
var pendTimer=null,PENDRUN='';
function pendRunning(list){return (list||[]).filter(function(r){return r.running;}).map(function(r){return r.repo;}).join('\\n');}
function pendPoll(){if(pendTimer){clearTimeout(pendTimer);pendTimer=null;}if(!PENDRUN||current!=='tasks')return;
pendTimer=setTimeout(function(){pendTimer=null;if(current!=='tasks')return;api('/api/pending').then(function(list){if(pendRunning(list)!==PENDRUN)loadTasks();else pendPoll();}).catch(pendPoll);},4000);}
function loadPending(){api('/api/pending').then(function(list){var el=document.getElementById('reviewlist');PENDTASKS=[];PENDRUN=pendRunning(list);pendPoll();
if(!list||!list.length){el.innerHTML='';return;}
var n=0;list.forEach(function(r){n+=r.tasks.length||1;});
var h="<div class='tgroup' style='color:var(--amber)'>Awaiting your review <span class='tcount'>"+n+"</span></div>";
list.forEach(function(r){var ch=r.files.length?(r.files.length+" file"+(r.files.length>1?"s":"")+" changed"+(r.stat?" &middot; "+esc(r.stat):"")):"no uncommitted changes";
h+="<div class='rcard' data-repo='"+esc(r.repo)+"'"+(r.publishesOnMerge?" data-pom='1'":"")+"><div class='rhead'><b>"+esc(r.repo)+"</b><span class='muted'>"+(r.path?"on "+esc(r.branch||'?')+" &middot; "+ch:"repo not found on disk")+"</span></div>";
r.tasks.forEach(function(t){PENDTASKS.push(t);h+="<div class='task' data-id='"+esc(t.id)+"'><span class='t'>"+esc(t.text)+"</span>"+askBtn(t)+"<button class='rm sendback' title='not right - send back to the agent (unticks it)'>&#8630;</button></div>";});
if(r.untasked)h+="<div class='muted' style='margin:6px 0'>Uncommitted changes with no ticked task behind them. Check the diff before you approve.</div>";
// The repo's open tasks: tick the ones these changes finished, and they're approved with them instead of going out again on the next send.
if(r.untasked&&r.open&&r.open.length){var said=r.open.some(function(o){return o.finished;});h+="<div class='muted' style='margin:6px 0'>Did these changes finish any of "+esc(r.repo)+"'s open tasks? Tick them and they're approved with the changes, so they don't come back as new tasks"+(said?". Ticked already: the run's summary says it finished them.":".")+"</div>";
r.open.forEach(function(o){h+="<label class='idea'><input type='checkbox' class='tickopen' data-id='"+esc(o.id)+"'"+(o.finished?" checked":"")+"><span>"+esc(o.text)+(o.finished?" <span class='tag'>run says done</span>":"")+"</span></label>";});}
if(r.running)h+="<div class='muted' style='margin:6px 0'>&#9203; Agent still working: its changes may be half done. Approve unlocks when it finishes.</div>";
// A repo that publishes on merge (ur.npm) is measured from the version npm has,
// and a bump publishes it once merged; otherwise from the last v* tag, tagged by hand.
var ur=r.unreleased;if(ur&&ur.npm)h+="<div class='muted' style='margin:6px 0'><span class='err'>Unreleased:</span> "+(ur.pending?"<code>"+esc(ur.base)+"</code> is at <b>"+esc(ur.pending)+"</b>, which isn't on npm yet. This repo publishes when a version bump merges, so it should appear shortly; if it doesn't, check the publish workflow's run on GitHub.":"<code>"+esc(ur.base)+"</code> has "+ur.ahead+" commit"+(ur.ahead>1?"s":"")+" merged since <b>"+esc(ur.since)+"</b> went to npm. This repo publishes on merge, but only when the version changes, so they wait for the next bump. "+(ur.bump?"These changes bump it to <b>"+esc(ur.bump)+"</b>: it publishes when this PR merges.":r.bumpOffer&&r.files.length?"Approve can bump it in this PR (below), so it publishes when the PR merges.":"Bump the version in a PR to publish them."))+"</div>";
else if(ur)h+="<div class='muted' style='margin:6px 0'><span class='err'>Unreleased:</span> <code>"+esc(ur.base)+"</code> is "+ur.ahead+" commit"+(ur.ahead>1?"s":"")+" past <code>"+esc(ur.tag)+"</code>, so merged work isn't released yet. "+(ur.bump?"These changes bump the version to <b>"+esc(ur.bump)+"</b>: after the PR merges, tag <code>v"+esc(ur.bump)+"</code> on <code>"+esc(ur.base)+"</code> to release it.":r.bumpOffer&&r.files.length?"Approve can bump the version in this PR (below); tag it after the PR merges to release it.":"Bump the version (here or in a later PR) and tag it to release it.")+"</div>";
// The version is already released (its v* tag exists, or npm has it) and these changes keep it:
// Approve bumps it in the PR too, a patch unless you pick otherwise.
var bo=r.bumpOffer;if(bo&&r.files.length)h+="<div class='row' style='margin:6px 0;font-size:12px'><span class='muted'>Version</span><select class='bumpsel' title='bump the version in package.json (and the lockfile) in this PR' style='flex:0 0 auto;width:auto'><option value='patch'>bump to "+esc(bo.patch)+" (patch)</option><option value='minor'>bump to "+esc(bo.minor)+" (minor)</option><option value=''>keep "+esc(bo.version)+"</option></select></div>";
h+="<div class='row'><button class='act approve'"+(r.path&&!r.running?"":" disabled")+(r.running?" title='the agent is still editing this repo'>"+(r.untasked?"Approve changes without a task":"Approve")+" &middot; agent still working":r.untasked?" data-untasked='1' title='commit on a branch, push and open a PR, without a task'>Approve changes without a task &rarr; PR":" title='commit on a branch, push, open a PR, then archive'>Approve &rarr; "+(r.files.length?"PR":"archive"))+"</button>"+(r.files.length?"<button class='ghost showdiff'>Show diff</button>":"")+"<label title='Queue GitHub auto-merge so this PR lands once its CI checks pass. Needs Allow auto-merge on the repo.' style='margin-left:auto;font-size:12px;color:var(--faint);display:flex;align-items:center;gap:6px'><input type='checkbox' class='amtoggle' style='width:auto'"+(r.autoMerge?" checked":"")+"> auto-merge on green CI</label></div><div class='rdiff hidden'></div></div>";});
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
function apLabel(){var n=ticks().length;if(ap&&!ap.disabled)ap.innerHTML=n?"Approve changes with "+n+" finished task"+(n>1?"s":"")+" &rarr; PR":"Approve changes without a task &rarr; PR";}
tk.forEach(function(c){c.addEventListener('change',apLabel);});if(tk.length)apLabel();
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
o.innerHTML="<div class='note ok'>"+m+"</div>";loadTasks();});});});});}
function loadArchived(){TARCH=true;api('/api/tasks?archived=1').then(function(list){ALLTASKS=list;renderFilter();var el=document.getElementById('tasklist');
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
if(qs.length){h+="<h4>&#10067; "+qs.length+" question"+(qs.length>1?"s":"")+" for you</h4>";
qs.forEach(function(q,i){var rl=q.release;h+="<div class='q' data-i='"+i+"'><div class='qt'>"+esc(q.q)+"</div>"+(q.context?"<div class='qc'>"+esc(q.context)+"</div>":"")+(rl?relHtml(rl):"");
(q.options||[]).forEach(function(o,j){var off=rl&&rl.waiting&&DONEOPT.test(o);h+="<label class='opt"+(off?" off":"")+"'><input type='radio' name='q_"+esc(a.id)+"_"+i+"' value='"+j+"'"+(off?" disabled":"")+"><span>"+whoHtml(o)+(off?" <i>(once "+esc(rl.name+" "+rl.needs)+" is installed)</i>":"")+"</span></label>";});
h+="<input class='qother' placeholder='"+((q.options&&q.options.length)?"or answer in your own words":"your answer")+"'></div>";});
h+="<div class='row'><button class='act qsend' title='save the answers and hand the repo back to your agent'>Send answers &amp; continue</button><button class='ghost qsave' title='save the answers for the next run'>Save only</button></div>";}
if(ss.length){var shown=IDEASOPEN[a.path]?ss.length:(k.ideasShown||ss.length);h+="<h4>&#128161; Ideas from the agent</h4>";ss.forEach(function(s,i){if(i>=shown)return;h+="<div class='idea'><span style='flex:1'>"+esc(s.text)+(s.other?" <span class='tag' title='this idea is for another project, so + task adds it to that one'>for "+esc(s.repo)+"</span>":"")+"</span>"+(s.added?"<span class='tag'>in Tasks</span>":"<button class='ghost qidea' data-i='"+i+"' style='padding:3px 9px;font-size:12px'>+ task</button><button class='ghost qskip' data-i='"+i+"' title='turn this idea down: the next one moves up, and the agent is told not to suggest it again' style='padding:3px 9px;font-size:12px'>Skip</button>")+"</div>";});
if(ss.length>shown)h+="<div class='row'><button class='ghost qmore' title='the agent ranks its ideas best first: weigh these two before adding more'>"+(ss.length-shown)+" more idea"+(ss.length-shown>1?"s":"")+", ranked lower</button></div>";}
return h+"</div>";}
var IDEASOPEN={};
function qKeyOf(qe){var box=qe.closest('.aq');var a=box&&agentById(box.getAttribute('data-id'));var q=a&&a.ask.questions[+qe.getAttribute('data-i')];return q?a.path+'|'+q.q:'';}
function saveDrafts(el){el.querySelectorAll('.aq .q').forEach(function(qe){var k=qKeyOf(qe);if(!k)return;var pick=qe.querySelector('input[type=radio]:checked');QDRAFT[k]={o:pick?pick.value:'',t:qe.querySelector('.qother').value};});}
function restoreDrafts(el){el.querySelectorAll('.aq .q').forEach(function(qe){var d=QDRAFT[qKeyOf(qe)];if(!d)return;qe.querySelectorAll('input[type=radio]').forEach(function(r){r.checked=!r.disabled&&r.value===d.o;});qe.querySelector('.qother').value=d.t||'';});}
function collectAnswers(box,a){var out=[];box.querySelectorAll('.q').forEach(function(qe){var q=a.ask.questions[+qe.getAttribute('data-i')];if(!q)return;
var other=(qe.querySelector('.qother').value||'').trim();var pick=qe.querySelector('input[type=radio]:checked');var ans=other||(pick?q.options[+pick.value]:'');if(ans)out.push({q:q.q,a:ans});});return out;}
function wireAsks(el){el.querySelectorAll('.aq').forEach(function(box){var a=agentById(box.getAttribute('data-id'));if(!a||!a.ask)return;
function send(rerun){var msg=document.getElementById('agentsmsg');var ans=collectAnswers(box,a);
if(!ans.length){msg.innerHTML="<div class='note err'>Pick an option or type an answer first.</div>";return;}
box.querySelectorAll('button').forEach(function(b){b.disabled=true;});
api('/api/agents/answer',{path:a.path,answers:ans,rerun:rerun}).then(function(r){
if(!r||r.error){box.querySelectorAll('button').forEach(function(b){b.disabled=false;});msg.innerHTML="<div class='note err'>"+esc((r&&r.error)||'failed')+"</div>";return;}
msg.innerHTML="<div class='note ok'>&#10003; Saved "+r.saved+" answer"+(r.saved>1?"s":"")+" for <b>"+esc(a.name)+"</b> in .symbiot/ANSWERS.md"+(r.rerun?" &middot; your agent is picking them up now.":".")+(r.yours&&r.yours.length?"<div class='err'>&#128100; Still yours to do: "+esc(r.yours.join(' '))+"</div>":"")+(r.note?"<div class='muted'>"+esc(r.note)+"</div>":"")+"</div>";loadAgents();});}
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
return "<div class='aq'><h4>&#9208; Waiting on your step</h4><div class='qt'>&#128100; "+esc(w.step)+"</div><div class='qc'>"+(fs?"Your agent "+(w.rerun?"starts by itself":"can start")+" once "+fs+" changes"+(w.rerun?", while Symbiot runs":"")+". Done it some other way?":"Your agent waits for it, so it doesn't stop on the same questions again.")+" Start it now once it's done.</div><div class='row'><button class='act wstart' data-id='"+esc(a.id)+"'>Start it now</button></div></div>";}
function wireWaits(el){el.querySelectorAll('.wstart').forEach(function(btn){btn.addEventListener('click',function(){var a=agentById(btn.getAttribute('data-id'));if(!a)return;btn.disabled=true;
api('/api/open',{path:a.path,force:true}).then(function(x){var msg=document.getElementById('agentsmsg');msg.innerHTML=x&&x.opened?"<div class='note ok'>&#10003; Started your agent in <b>"+esc(a.name)+"</b>.</div>":"<div class='note err'>"+esc(a.name)+": "+(x&&x.busy?"an agent is already running there.":"it didn&#39;t start. Check the command in Settings.")+"</div>";loadAgents();}).catch(function(e){btn.disabled=false;document.getElementById('agentsmsg').innerHTML="<div class='note err'>"+esc(String((e&&e.message)||e))+"</div>";});});});}
function answering(){var f=document.activeElement;return !!(f&&f.closest&&f.closest('.aq'));}
// Handovers (lanes.mjs): what one lane's agent handed to another, and where it stands.
var LANEWORD={started:'working on it',held:'queued: that lane is busy',done:'done, reported back',error:"couldn't hand over"};
function loadLanes(){api('/api/lanes').then(function(d){var el=document.getElementById('laneslist');if(!el||!d)return;var hs=d.handoffs||[];
el.innerHTML=hs.length?"<div class='tgroup'>Handovers <span class='tcount'>"+hs.length+"</span></div>"+hs.slice(0,12).map(function(h){
var back=h.result||h.error,more=(h.full?"<div>"+esc(h.full)+"</div>":"")+(back?"<div class='tres'>"+esc(back)+"</div>":"");
return "<div class='task'><span class='t'><b>"+esc(h.from)+"</b> &rarr; <b>"+esc(h.to)+"</b>: "+esc(h.text)+(more?"<details class='tfull'><summary>"+(h.full?"in full":"what came back")+"</summary>"+more+"</details>":"")+"</span><span class='rp'"+(h.status==='error'?" style='color:var(--amber)'":"")+">"+esc(LANEWORD[h.status]||h.status)+"</span></div>";}).join(''):'';});}

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
h+="<div class='wkstats'>"+stats.join('')+"</div>";
if(run&&w.doing)h+="<div class='wkdoing'>"+esc(w.doing)+"&hellip;</div>";
var boxes=[];
if(w.todos&&w.todos.length||pg){var td="<div class='wkbox'><div class='wkh'>"+(pg?wkRing(pg.done,pg.total):'')+"<span>its to-do list</span></div>";
(w.todos||[]).forEach(function(t){td+="<div class='wktodo "+esc(t.status)+"'><i></i><span>"+esc(t.status==='in_progress'?t.active:t.text)+"</span></div>";});
if(!(w.todos||[]).length)td+="<div class='muted' style='font-size:12px'>No list of its own: "+pg.done+" of "+pg.total+" tasks ticked in TASKS.md.</div>";boxes.push(td+"</div>");}
if(w.steps&&w.steps.length){var sp="<div class='wkbox'><div class='wkh'><span>what it did</span><span style='margin-left:auto'>"+wkSpark(w.pace)+"</span></div>";
w.steps.slice(-10).forEach(function(x){sp+="<div class='wkstep "+esc(x.status)+"'>"+wkIcon(x.kind)+"<span class='wt'><b>"+esc(x.verb)+"</b> "+esc(x.target||'')+"</span>"+(x.tests?"<span class='wktest"+(x.tests.failed?' bad':'')+"'>"+x.tests.passed+"&#10003; "+x.tests.failed+"&#10007;</span>":"")+"<span class='wm'>"+(x.status==='running'?'&hellip;':wkMs(x.ms))+"</span></div>";});
if(w.count>10)sp+="<div class='muted' style='font-size:11px;margin-top:4px'>and "+(w.count-10)+" earlier step"+(w.count-10>1?'s':'')+"</div>";boxes.push(sp+"</div>");}
var fs=Object.keys(w.files||{});if(fs.length){var mx=Math.max.apply(null,fs.map(function(f){return w.files[f];}))||1,fb="<div class='wkbox'><div class='wkh'><span>files it changed</span></div>";
fs.sort(function(x,y){return w.files[y]-w.files[x];}).slice(0,8).forEach(function(f){fb+="<div class='wkfile'><span class='fn'>"+esc(f)+"</span><span class='fb'><i style='width:"+Math.round(100*w.files[f]/mx)+"%'></i></span><span class='wm'>"+w.files[f]+"&times;</span></div>";});boxes.push(fb+"</div>");}
if(boxes.length)h+="<div class='wk'>"+boxes.join('')+"</div>";
if(!run&&w.final)h+="<div class='wkfinal'>"+esc(w.final)+"</div>";
return h;}
function loadAgents(){loadLanes();api('/api/agents').then(function(list){var el=document.getElementById('agentslist');
if(!list||!list.length){AGENTLIST=[];el.innerHTML="<div class='muted' style='margin-top:12px'>No agents yet. In <b>Tasks</b>, tick ideas and hit <b>Send to repos</b> (with an agent command set in Settings) &mdash; you'll watch it work here.</div>";stopAgentsPoll();return;}
var anyRunning=list.some(function(a){return a.status==='running';});
if(answering()){stopAgentsPoll();if(anyRunning&&current==='agents')agentsTimer=setTimeout(loadAgents,2000);return;} // don't re-render under someone typing an answer
saveDrafts(el);AGENTLIST=list;
el.innerHTML=list.map(function(a){var cls=a.status==='running'?'run':(a.status==='done'?'ok':'fail');
var st=a.status==='running'?('working &middot; '+fmtE(a.elapsed)):(esc(a.status)+' &middot; '+fmtE(a.elapsed)+(a.exitCode!=null?' &middot; exit '+a.exitCode:''));
if(a.fromHeld)st+=" &middot; started on the tasks held for the last run";
if(a.earlier)st+=" &middot; "+(a.status==='running'?"started outside this window":"ran before Symbiot last started");
if(a.waiting)st+=" &middot; <span style='color:var(--amber)'>waiting on your step</span>";
if(nQs(a))st+=" &middot; <span style='color:var(--amber)'>needs your answers</span>";
if(a.held!=null){var hn=a.held.length,ht=a.held.map(function(t){return "&bull; "+esc(t).replace(/'/g,'&#39;');}).join('&#10;');
ht+=(hn?'&#10;&#10;':'')+(a.status==='running'?"Sent while this agent was running. They wait in .symbiot/TASKS.next.md, replace TASKS.md when it finishes (keeping its ticks), and an agent starts on them then.":"They wait in .symbiot/TASKS.next.md for the agent running in this folder to finish. After that, an agent starts on them the next time the Tasks tab checks this repo, or send again.");
st+=" &middot; <span style='color:var(--amber);cursor:help' title='"+ht+"'>&#9208; "+(hn?hn+" task"+(hn>1?"s":"")+" held":"tasks held")+"</span>";}
var b="<div class='dh'><span class='orb "+cls+"'></span><span class='dn'>"+esc(a.name)+"</span><span class='dd'>"+st+"</span></div>";
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
b+=waitHtml(a)+askHtml(a);
b+=a.work?("<details class='wkraw'><summary>what it said, in full</summary><pre class='alogout'>"+esc((a.tail&&a.tail.trim())||'(nothing yet)')+"</pre></details>"):("<pre class='alogout'>"+esc((a.tail&&a.tail.trim())||'(waiting for output…)')+"</pre>");
return "<div class='agent'>"+b+"</div>";}).join("");
el.querySelectorAll('.alogout').forEach(function(p){p.scrollTop=p.scrollHeight;});
restoreDrafts(el);wireAsks(el);wireWaits(el);
stopAgentsPoll();if(anyRunning&&current==='agents')agentsTimer=setTimeout(loadAgents,2000);});}
function loadDrift(){var out=document.getElementById('driftout');out.innerHTML="<div class='muted' style='margin-top:12px'>Reading your repos&hellip;</div>";
var ci=document.getElementById('driftci').checked?'1':'0';var ft=document.getElementById('driftfetch').checked?'1':'0';
api('/api/drift?ci='+ci+'&fetch='+ft).then(function(d){driftLoaded=true;var repos=d.repos||[];var risky=repos.filter(function(r){return r.flags.some(function(f){return f.level==='warn';});});
var h="<div class='k' style='margin:10px 0'><b>"+repos.length+"</b> repos &middot; <b>"+risky.length+"</b> with risks"+(d.partial?" &middot; <span class='err'>partial &mdash; the scan hit its time limit</span>":"")+"</div>";
repos.forEach(function(r){if(!r.flags.length)return;var warn=r.flags.some(function(f){return f.level==='warn';});
h+="<div class='drift'><div class='dh'><span class='"+(warn?'dot-w':'dot-c')+"'></span><span class='dn'>"+esc(r.name)+"</span><span class='dd'>"+esc(r.def)+(r.fetchAgeDays!=null&&r.fetchAgeDays>3?" &middot; fetch "+r.fetchAgeDays+"d old":"")+"</span></div><ul>";
r.flags.forEach(function(f){h+="<li class='"+esc(f.level)+"'>"+(f.level==='warn'?'&#9888; ':'&middot; ')+esc(f.text)+(f.evidence?" <span class='ev'>["+esc(f.evidence)+"]</span>":"")+"</li>";});
h+="</ul></div>";});
var clean=repos.filter(function(r){return !r.flags.length;}).map(function(r){return r.name;});
if(clean.length)h+="<div class='muted' style='margin-top:10px'>clean: "+esc(clean.join(", "))+"</div>";
if(!repos.length)h+="<div class='muted'>No repos found under "+esc(d.base||"your home folder")+".</div>";
out.innerHTML=h;});}
function fillTaskRepos(){var sel=document.getElementById('newtaskrepo');if(!sel||!GRAPH)return;var cur=sel.value;var names=GRAPH.nodes.filter(function(n){return n.type==='repo'||n.type==='folder';}).map(function(n){return n.label;}).sort();sel.innerHTML="<option value=''>repo…</option>"+names.map(function(n){return "<option value='"+esc(n)+"'"+(n===cur?" selected":"")+">"+esc(n)+"</option>";}).join("");}
function addTaskUI(){var i=document.getElementById('newtask');var v=(i.value||'').trim();if(!v)return;var repo=(document.getElementById('newtaskrepo')||{}).value||'';api('/api/tasks/add',{text:v,repo:repo}).then(function(){i.value='';TFILTER={type:'',repo:''};loadTasks();});}
function pushTasksUI(){var o=document.getElementById('pushout');var btn=document.getElementById('pushtasks');btn.disabled=true;
o.innerHTML="<div class='muted' style='margin-top:10px'><span class='dot-c' style='background:var(--amber)'></span> Writing .symbiot/TASKS.md into your repos&hellip;</div>";
api('/api/tasks/push',{type:TFILTER.type||'',repo:TFILTER.repo||''}).then(function(r){
if(r.empty){btn.disabled=false;o.innerHTML="<div class='muted' style='margin-top:10px'>No open tasks to send. Tick ideas in a repo review, or add tasks above.</div>";return;}
var n=(r.written||[]).length;var opens=[];var h="<div class='drift' style='margin-top:10px'><div class='dh'><span class='dot-c'></span><span class='dn'>Done &mdash; wrote "+n+" file"+(n===1?"":"s")+"</span></div>";
if(n){h+="<ul>";r.written.forEach(function(w){h+="<li class='info'>&#10003; <b>"+esc(w.name)+"</b> <span class='ev'>"+esc(w.file)+" ("+w.count+" task"+(w.count===1?"":"s")+")</span>"+(w.held?" <span class='ev'>&#9208; held: an agent is still running there, so these land when it finishes</span>":"")+"</li>";});h+="</ul>";}
if(r.unresolved&&r.unresolved.length){var names=r.unresolved.map(function(u){return u.name;}).join(", ");var hasNoRepo=r.unresolved.some(function(u){return u.name==='(no repo)';});h+="<div class='dd' style='margin-top:6px'>&#9888; not sent: "+esc(names)+". "+(hasNoRepo?"Pick a repo in the dropdown next to <b>Add</b> so the task has somewhere to go.":"That repo isn't in the map &mdash; add its folder in Settings.")+"</div>";}
if(r.handoff&&r.written&&r.written.length){opens=r.written.map(function(w){return api('/api/open',{path:w.path}).then(function(x){if(x&&x.blocked){var d=document.createElement('div');d.className='dd';d.innerHTML="&#9208; <b>"+esc(w.name)+"</b>: "+esc(x.note)+" <button class='ghost' style='padding:2px 8px;font-size:12px'>Start it anyway</button>";d.querySelector('button').addEventListener('click',function(){this.disabled=true;api('/api/open',{path:w.path,force:true}).then(function(y){d.innerHTML=y&&y.opened?"&#10003; Started an agent in <b>"+esc(w.name)+"</b>.":"&#9888; <b>"+esc(w.name)+"</b>: "+(y&&y.busy?"an agent is already running there.":"it didn&#39;t start. Check the command in Settings.");});});o.appendChild(d);}if(x&&x.busy){var d=document.createElement('div');d.className='dd';d.innerHTML="&#9888; <b>"+esc(w.name)+"</b> already has an agent running, so another wasn&#39;t started. "+(x.auto?"Its new tasks are held, and an agent starts on them when it finishes.":"Its new tasks are held until it finishes. After that, an agent starts on them the next time this tab checks the repo, or send again.");o.appendChild(d);}}).catch(function(){});});h+="<div class='dd' style='margin-top:8px'>&#129302; Handed "+n+" repo(s) to your agent &mdash; opening the <b>Agents</b> tab to watch it work&hellip;</div>";setTimeout(function(){setTab('agents');},500);}
else{h+="<div class='dd' style='margin-top:8px'>Set an <b>agent command</b> in Settings to auto-run it on send (and watch it in the Agents tab). For now, tell your agent: <b>“Read .symbiot/TASKS.md and implement the unchecked items.”</b></div>";}
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
var cmd=document.getElementById('agentcmd').value;if(/orca-ide/.test(cmd)&&/claude/.test(cmd)){el.innerHTML="&#128268; Claude in Orca&#39;s tab asks you before it uses your connectors ("+CONNECTORS.map(nm).join(", ")+").";return;}
if(!/^\\s*claude\\b/.test(cmd)){el.innerHTML="&#128268; Your Claude connectors ("+CONNECTORS.map(nm).join(", ")+") reach Claude Code runs only. This command isn&#39;t Claude, so its runs can&#39;t use them.";return;}
el.innerHTML=(ready.length?"&#128268; Your agent&#39;s runs can use "+ready.map(nm).join(", ")+": linked to Claude, so each run allows their tools.":"")+(wait.length?(ready.length?" ":"&#128268; ")+wait.map(nm).join(", ")+(wait.length===1?" needs":" need")+" authorizing in your claude.ai connector settings first.":"")+(gap?" "+gap:"");}
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
box.innerHTML=roots.map(function(r){var custom=(d.roots||[]).indexOf(r)>=0;return "<div class='task' data-p='"+esc(r)+"'><span class='t' style='font-family:ui-monospace,monospace;font-size:12px'>"+esc(r)+"</span>"+(r===d.home?"<span class='rp'>home</span>":"")+(custom?"<button class='rm rmroot' title='remove'>&times;</button>":"")+"</div>";}).join("");
box.querySelectorAll('.rmroot').forEach(function(btn){btn.addEventListener('click',function(){api('/api/scanroots/remove',{path:btn.closest('.task').getAttribute('data-p')}).then(function(){loadScanRoots();mapLoaded=false;driftLoaded=false;});});});});}
function addRootUI(){var i=document.getElementById('newroot');var v=(i.value||'').trim();if(!v)return;var n=document.getElementById('scanrootnote');
api('/api/scanroots/add',{path:v}).then(function(r){if(r.error){n.innerHTML="<span class='err'>"+esc(r.error)+"</span>";return;}i.value='';n.textContent='Added — the Map/Drift will rescan.';loadScanRoots();mapLoaded=false;driftLoaded=false;});}
// In the Android app (window.SymbiotAndroid): Termux keeps its home folder
// private, so only a Symbiot running there sees those projects. The app can show
// that one instead of its own, from the link Termux opens.
function phoneTermux(){var A=window.SymbiotAndroid,t={};if(A&&A.termux){try{t=JSON.parse(A.termux())||{};}catch(e){}}return t;}
function loadPhone(){var t=phoneTermux();if(!t.installed&&!t.on)return;$('phonebox').classList.remove('hidden');
$('phonenote').innerHTML=t.on?"This window shows the Symbiot running in Termux, so it sees the projects in Termux's home folder and runs your agents there. The app's own Symbiot sees only shared storage.":"Termux keeps its home folder (<code>~</code>) private, so the app's own Symbiot can't see the projects there. Symbiot running in Termux can, and this app can show it. <b>Open Termux</b> copies the command that starts it (it installs Node and Symbiot there first if they're missing). Paste it in Termux, and Termux opens it here.";
var b=$('phonebtn');b.textContent=t.on?"Use the app's own Symbiot":"Open Termux";b.onclick=function(){if(t.on)SymbiotAndroid.builtIn();else SymbiotAndroid.openTermux();};}
// Watch on your phone (phone.mjs): the computer lets a paired phone ask what
// Watch found; the phone pairs once with its address and code, then asks every 2 minutes.
function loadPhoneLink(msg){api('/api/phone').then(function(d){renderPhoneLink(d,msg);});}
function renderPhoneLink(d,msg){if(!d||!d.role)return;var box=$('phonelink'),h='';
if(d.role==='phone'){
if(d.paired){h+="<div class='task'><span class='t'>Paired with <b>"+esc(d.name)+"</b> <span class='muted' style='font-size:12px'>"+esc(d.url)+(d.last?" &middot; asked "+agoTxt(d.last):"")+"</span>"+(d.error?"<br><span class='err' style='font-size:12px'>"+esc(d.error)+"</span>":"")+"</span><button class='ghost' id='pcheck' title='ask your computer now'>Check now</button><button class='rm' id='pforget' title='stop getting its notifications'>&times;</button></div>";
h+="<div class='note muted'>While Symbiot runs on this phone, it asks your computer every 2 minutes and shows what Watch found there as a notification, with its brief if you switched that on there.</div>";}
else h+="<div class='row'><input id='paddr' placeholder='your computer&rsquo;s address, e.g. 192.168.8.50:7392' style='flex:1'><input id='pcode' placeholder='code' inputmode='numeric' style='flex:0 0 90px'><button class='act' id='ppair'>Pair</button></div><div class='note muted'>Get what Watch finds on your computer (new mail, review requests, failed CI runs) as notifications here. On your computer, in Symbiot&rsquo;s Settings, tick <b>Watch on your phone</b>: it shows its address and a 6-digit code. Type both here. The phone has to be on the same Wi-Fi.</div>";
if(!d.notify)h+="<div class='note err'>Notifications from Termux need the Termux:API app: install it, then run <b>pkg install termux-api</b> in Termux.</div>";}
else{h+="<label class='check'><input type='checkbox' id='plinkon'"+(d.on?" checked":"")+"> Let the Symbiot app on my phone get Watch&rsquo;s notifications, over this network</label>";
if(d.on&&d.error)h+="<div class='note err'>"+esc(d.error)+"</div>";
else if(d.on&&d.listening){var ad=(d.addresses||[]).map(function(a){return a+":"+d.port;});
h+=d.code?"<div class='note ok'>On your phone, open Symbiot &rarr; Settings &rarr; <b>Watch on your phone</b>, and type the address <b>"+esc(ad[0]||"(this computer&rsquo;s address)")+"</b>"+(ad.length>1?" <span class='muted'>(or "+esc(ad.slice(1).join(", "))+")</span>":"")+" and the code <b style='letter-spacing:2px'>"+esc(d.code)+"</b>. <span class='muted'>The code works for 10 minutes.</span></div>"
:"<div class='row' style='margin-top:4px'><button class='ghost' id='pnewcode'>Pair a phone</button></div>";
h+=(d.phones||[]).map(function(p){return "<div class='task' data-id='"+esc(p.id)+"'><span class='t'>"+esc(p.name)+" <span class='muted' style='font-size:12px'>paired "+agoTxt(p.added)+(p.seen?" &middot; asked "+agoTxt(p.seen):"")+"</span></span><button class='rm punpair' title='unpair it: it gets nothing more'>&times;</button></div>";}).join('');}
h+="<div class='note muted'>"+(d.on?"Symbiot listens on port "+d.port+" of your network for this alone: the pairing code, then what&rsquo;s new for a phone that paired. Nothing can be changed from there, and the rest of Symbiot stays on this computer. What&rsquo;s new (your mail&rsquo;s senders and subjects) crosses your Wi-Fi unencrypted, so use it on a network you trust. Pairing fails? A firewall here may need to allow port "+d.port+".":"New mail, review requests and failed CI runs that Watch finds here, as notifications on your phone, through the Symbiot app there. It asks this computer every 2 minutes while both are running, on the same Wi-Fi.")+"</div>";}
if(msg)h+="<div class='note "+(msg.ok?"ok":"err")+"'>"+esc(msg.text)+"</div>";
box.innerHTML=h;
var on=$('plinkon');if(on)on.addEventListener('change',function(){on.disabled=true;api('/api/phone/link',{on:on.checked}).then(function(x){renderPhoneLink(x);});});
var nc=$('pnewcode');if(nc)nc.addEventListener('click',function(){api('/api/phone/code',{}).then(function(x){renderPhoneLink(x);});});
box.querySelectorAll('.punpair').forEach(function(b){b.addEventListener('click',function(){if(typeof confirm==='function'&&!confirm('Unpair this phone? It gets no more notifications from here.'))return;api('/api/phone/unpair',{id:b.closest('.task').getAttribute('data-id')}).then(function(x){renderPhoneLink(x);});});});
var pp=$('ppair');if(pp)pp.addEventListener('click',function(){var a=$('paddr').value,cd=$('pcode').value;pp.disabled=true;pp.textContent='Pairing...';api('/api/phone/pair',{address:a,code:cd}).then(function(x){renderPhoneLink(x,x&&x.error?{text:x.error}:{ok:true,text:'Paired. What Watch finds on '+x.name+' shows up here as a notification.'});if(x&&x.error&&$('paddr')){$('paddr').value=a;$('pcode').value=cd;}});});
var pc=$('pcheck');if(pc)pc.addEventListener('click',function(){pc.disabled=true;api('/api/phone/check',{}).then(function(x){renderPhoneLink(x,x&&!x.error?{ok:true,text:x.shown?'Showed '+x.shown+' notification(s).':'Asked: nothing new.'}:null);});});
var pf=$('pforget');if(pf)pf.addEventListener('click',function(){if(typeof confirm==='function'&&!confirm('Forget your computer? Its notifications stop.'))return;api('/api/phone/forget',{}).then(function(x){renderPhoneLink(x);});});}
// Link your work (links.mjs): one button per standard site. A click opens it in
// Symbiot's browser to sign in, trusts it and watches it. Its dot: grey not
// linked, amber waiting for you to sign in (or signed out), green linked. Shown
// in Settings, and on the Dashboard until something is linked.
var LINKS=null;
var LINKWORD={ok:'linked',signin:'sign in, then close the window',signedout:'signed out',error:'needs a fix'};
function escQ(t){return esc(t).replace(/'/g,'&#39;');}
function linksHtml(d,board){var h=board?"<div class='note muted'>Link your work to see what arrives there here, and in Week and Standup:</div>":"";
if(d.error)h+="<div class='note err'>"+esc(d.error)+"</div>";
d.groups.forEach(function(g){h+="<div class='lgroup'><span class='fl'>"+esc(g)+"</span>";
d.items.filter(function(x){return x.group===g;}).forEach(function(it){var on=it.state!=='off';
h+="<span class='lnk "+escQ(it.state)+"' data-id='"+escQ(it.id)+"'><button class='fchip lbtn' title='"+escQ(it.note||(on?'open '+it.url+' to sign in again':'sign in at '+it.url+' and link it'))+"'><span class='dot-c' style='background:"+(it.state==='ok'?'var(--green)':on?'var(--amber)':'var(--line)')+"'></span>"+esc(it.name)+"</button>"+
(on?"<span class='lst'>"+esc(LINKWORD[it.state]||'')+"</span><button class='lmore' title='check it now'>&#8635;</button><button class='lrm' title='unlink: stop watching it and stop trusting it'>&times;</button>":"")+"</span>";});
h+="</div>";});return h;}
function linksOut(html){var o=document.getElementById('linksmsg');if(o)o.innerHTML=html;var b=document.getElementById('boardmsg');if(b&&LINKS&&!LINKS.linked)b.innerHTML=html;}
function renderLinks(){if(!LINKS)return;['links','boardlinks'].forEach(function(id){var el=document.getElementById(id);if(!el)return;
if(id==='boardlinks'&&LINKS.linked){el.innerHTML='';return;}
el.innerHTML=linksHtml(LINKS,id==='boardlinks');
el.querySelectorAll('.lnk').forEach(function(sp){var lid=sp.getAttribute('data-id'),name=sp.querySelector('.lbtn').textContent;
sp.querySelector('.lbtn').addEventListener('click',function(){linksOut("<div class='note muted'>Opening "+esc(name)+"&hellip;</div>");
api('/api/links/link',{id:lid}).then(function(r){if(!r||r.error){linksOut("<div class='note err'>"+esc(name)+": "+esc((r&&r.error)||'failed')+"</div>");loadLinks();return;}
linksOut("<div class='note ok'>Opened "+esc(name)+" in Symbiot's browser. Sign in there as you normally do, then close that window: Symbiot checks it within a minute.</div>");loadLinks();
[20000,60000,120000].forEach(function(ms){setTimeout(loadLinks,ms);});});});
var m=sp.querySelector('.lmore');if(m)m.addEventListener('click',function(){m.disabled=true;api('/api/links/check',{id:lid}).then(function(r){m.disabled=false;
if(r&&r.busy)linksOut("<div class='note muted'>Symbiot's browser is busy (a sign-in window is open?). Close it, then check again.</div>");else if(r&&r.error)linksOut("<div class='note err'>"+esc(r.error)+"</div>");loadLinks();loadBoard();});});
var x=sp.querySelector('.lrm');if(x)x.addEventListener('click',function(){api('/api/links/unlink',{id:lid}).then(function(){linksOut('');loadLinks();loadTrusted();loadBoard();});});});});}
// What Symbiot remembers (mind.mjs): a row per thing, with what it knows; × forgets one.
function loadMind(){api('/api/mind').then(function(d){var el=document.getElementById('mindlist');if(!el||!d)return;var ns=d.nodes||[];
el.innerHTML=ns.length?ns.slice(0,60).map(function(n){return "<div class='task' data-id='"+escQ(n.id)+"'><span class='t'><b>"+esc(n.name)+"</b> <span class='muted' style='font-size:11px'>"+esc(n.kind)+"</span><br><span class='muted' style='font-size:12px'>"+esc(n.facts.join(' · '))+"</span></span><button class='rm forgetone' title='forget this'>&times;</button></div>";}).join('')+"<div class='row' style='margin-top:8px'><button class='ghost' id='forgetall'>Forget everything</button></div>":"<div class='muted' style='font-size:12px;margin-top:6px'>Nothing yet. It fills in as you talk to Symbiot on the Dashboard and in Tasks.</div>";
el.querySelectorAll('.forgetone').forEach(function(b){b.addEventListener('click',function(){api('/api/mind/forget',{id:b.closest('.task').getAttribute('data-id')}).then(loadMind);});});
var fa=document.getElementById('forgetall');if(fa)fa.addEventListener('click',function(){api('/api/mind/forget',{id:'all'}).then(loadMind);});});}
function loadLinks(){api('/api/links').then(function(d){if(d&&d.items){LINKS=d;renderLinks();}});}
// Trusted sites: where Screens' Press and Type don't ask first (headless.mjs).
function loadTrusted(){api('/api/screens/trusted').then(function(d){var box=document.getElementById('trustedsites');var sites=(d&&d.sites)||[];
box.innerHTML=sites.length?sites.map(function(h){return "<div class='task' data-h='"+esc(h)+"'><span class='t' style='font-family:ui-monospace,monospace;font-size:12px'>"+esc(h)+"</span><button class='rm rmtrusted' title='stop trusting it: press and type ask first again'>&times;</button></div>";}).join(""):"<div class='muted' style='font-size:12px'>None yet: Press and Type ask first on every site.</div>";
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
o.innerHTML="Pulling <b>"+esc(r.model)+"</b> &mdash; watch it in the <b>Agents</b> tab. Symbiot switches to it automatically when the download finishes.";setTimeout(function(){setTab('agents');},700);}).catch(function(e){o.innerHTML="<span class='err'>Setup failed: "+esc(String((e&&e.message)||e))+"</span>";});}
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
api("/api/map").then(function(g){done=true;mapLoaded=true;if(!g.nodes||!g.nodes.length){p.textContent="No git repositories found under your home folder.";return;}GRAPH=g;fillTaskRepos();layout(g.nodes,g.edges);view={k:1,x:0,y:0};p.innerHTML=profileLine(g)+(g.stats&&g.stats.partial?" &middot; <span class='err'>partial &mdash; the scan hit its time limit</span>":"");var af=$('allowfiles');if(af)af.addEventListener('click',function(){SymbiotAndroid.storage();});var ut=$('usetermux');if(ut)ut.addEventListener('click',function(){SymbiotAndroid.openTermux();});render();});}
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
h+=ns.length?"<div class='row' style='margin-top:8px'><span class='fl' style='margin-left:0;flex:1'>New &middot; "+ns.length+"</span><button class='ghost' id='wclear' title='clear this list (Symbiot still remembers what it has seen)'>Clear</button></div>"+ns.slice(0,20).map(function(n,i){return "<div class='task' data-i='"+i+"'><span class='t'>"+esc(n.text)+" <span class='muted' style='font-size:12px'>"+esc(n.name)+" &middot; "+agoTxt(n.ts)+"</span></span>"+(n.href?"<button class='ghost wopen' title='open it in your browser'>Open</button>":"")+(n.mail||n.chat?"<button class='ghost wdraft' title='"+(n.chat?DRAFT_CHAT_TIP:"your coding agent opens it in your inbox through Screens, writes a reply and leaves it in Drafts. It never presses Send")+"'>"+(n.drafted?"Drafted &middot; again":"Draft a reply")+"</button>":"")+(n.chat&&n.drafted?"<button class='ghost wopenwa' title='"+OPEN_WA_TIP+"'>Open in WhatsApp</button>":"")+"</div>";}).join('')
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
$('screenmsg').innerHTML="<div class='note ok'>"+(x.chat?DRAFTING_CHAT:DRAFTING)+"</div>";loadWatchUI();}).catch(function(e){b.disabled=false;screenErr(String((e&&e.message)||e));});});});
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
say('ok',"&#10003; Opened WhatsApp in Symbiot's browser, in a window of its own. The chat shows your agent's reply in its message box: read it, change it if you like, and send it there. Close the window when you're done, so Watch can read WhatsApp again.");}).catch(function(e){b.disabled=false;say('err',esc(String((e&&e.message)||e)));});}
var DRAFTING="&#10003; Your agent is drafting a reply to it. It opens the email in your inbox through Screens, writes the reply and leaves it in Drafts for you to read and send: it never presses Send. Follow it, and answer anything it asks, in the Agents tab.";
// ---- Dashboard: a card per page you watch (your inbox, GitHub, WhatsApp…), what's new on each ----
var BOARD=null;var BOARDICON={mail:'&#9993;&#65039;',github:'&#128276;',chat:'&#128172;',page:'&#127760;'};
// a chat's line says who its last message is from (watch.mjs fromOf): only unread ones count as waiting on you
var CHATFROM={them:'unread from them',you:'you sent the last one',unknown:'nothing unread, maybe yours'};
// Talk it over (watch.mjs boardChat): a chat on a card, open by its id, with what's half typed kept across a refresh
var BTALK={},BTALKDRAFT={},BTALKBUSY=0;
var TALKHINT="<div class='muted' style='font-size:12px'>Go over what's new here with your AI: what needs you, and what to say to whom. Then click <b>Draft a reply</b> on one, and your agent writes it the way you agreed here. Your AI is sent what this card lists (for mail: the sender, subject and preview).</div>";
function talking(){var f=document.activeElement;return BTALKBUSY>0||!!(f&&f.closest&&f.closest('.btalk'));}
function loadBoard(){api('/api/watch/board?hours='+(+$('boardhours').value||24)).then(function(b){if(b&&b.cards){BOARD=b;if(!talking())renderBoard();}});}
function boardMsg(cls,html){$('boardmsg').innerHTML="<div class='note "+cls+"'>"+html+"</div>";}
function renderBoard(){var b=BOARD,cs=b.cards,el=$('board');
var tab=$('boardtab');if(tab)tab.textContent='Dashboard'+(b.total?' · '+b.total:'');
if(!cs.length){$('boardsum').textContent='Everything you watch, side by side.';
el.innerHTML="<div style='grid-column:1/-1'><div class='note muted' style='margin-top:0'>Nothing watched yet. Map your inbox, a chat (web.whatsapp.com) or any page under <b>Screens</b> on the Map tab and click <b>Watch</b> on it, or click <b>Watch GitHub</b> there. Each one gets a card here with what's new on it.</div><div class='row' style='margin-top:8px'><button class='ghost' id='boardgo'>Go to Screens</button></div></div>";
$('boardgo').addEventListener('click',function(){setTab('map');var w=$('watchbox');if(w&&w.scrollIntoView)w.scrollIntoView({block:'center'});});return;}
var when=b.hours===24?'since yesterday':b.hours===72?'in the last 3 days':'in the last 7 days';
var waiting=cs.filter(function(c){return c.count;}).map(function(c){return c.label+(c.source==='page'?' on '+c.name:'');});
$('boardsum').innerHTML=waiting.length?"<b style='color:var(--bone)'>Waiting on you "+when+":</b> "+esc(waiting.join(', ')):"Nothing new "+when+" on the "+cs.length+" thing"+(cs.length===1?"":"s")+" you watch.";
el.innerHTML=cs.map(function(c,i){var nt=Math.ceil(((c.chat||[]).length)/2);
return "<div class='bcard"+(c.count?" has":"")+"' data-i='"+i+"'><div class='bh'><span>"+(BOARDICON[c.source]||BOARDICON.page)+"</span><span class='bn' title='"+esc(c.url)+"'>"+esc(c.name)+"</span>"+(c.count?"<button class='ghost bseen' title='set this card back to 0: only what comes in after counts. It stays under Watching, and the other cards keep theirs' style='padding:4px 9px;font-size:12px'>Seen</button>":"")+"<button class='ghost btalkbtn' title='talk what&#39;s new here over with your AI before you draft a reply' style='padding:4px 9px;font-size:12px'>&#128172;"+(nt?" "+nt:"")+"</button><button class='ghost bcheck' title='read it now' style='padding:4px 9px;font-size:12px'>Check now</button></div>"
+"<div class='bc'>"+c.count+"</div><div class='bl'>"+esc(c.count?c.label.replace(/^\\d+ /,''):'nothing new')+" &middot; "+(c.checked?"read "+agoTxt(c.checked):c.last?"tried "+agoTxt(c.last):"first read within a minute")+(c.via==='gh'?" &middot; through gh":"")+"</div>"
+(c.error?"<div class='note err'>"+esc(c.error)+"</div>":"")
+(c.brief?"<div class='bbrief'>"+esc(c.brief.text)+"</div>":"")
+c.items.map(function(n,j){return "<div class='bi' data-j='"+j+"'><span class='t'>"+esc(n.text)+" <span class='muted' style='font-size:11px'>"+agoTxt(n.ts)+(n.from&&CHATFROM[n.from]?" &middot; "+CHATFROM[n.from]:"")+(n.read?" &middot; read":"")+"</span></span>"+(n.href?"<button class='ghost bopen' title='open it in your browser'>Open</button>":"")+(n.mail||n.chat?"<button class='ghost bdraft' title='"+(n.chat?DRAFT_CHAT_TIP:"your coding agent writes a reply and leaves it in Drafts. It never presses Send")+"'>"+(n.drafted?"Drafted &middot; again":"Draft a reply")+"</button>":"")+(n.chat&&n.drafted?"<button class='ghost bopenwa' title='"+OPEN_WA_TIP+"'>Open in WhatsApp</button>":"")+"</div>";}).join('')
+(c.count>c.items.length?"<div class='bl' style='margin-top:6px'>&hellip;and "+(c.count-c.items.length)+" more</div>":"")
+(BTALK[c.id]?"<div class='tchat btalk'><div class='msgs'>"+(nt?chatMsgs(c.chat):TALKHINT)+"</div><div class='row'><input class='talkq' placeholder='Ask about these, or say how to answer one...' style='flex:1'><button class='ghost talksend'>Ask</button><a class='talkclear' title='forget this conversation'>clear</a></div></div>":"")+"</div>";}).join('');
function card(btn){return cs[+btn.closest('.bcard').getAttribute('data-i')];}
el.querySelectorAll('.btalkbtn').forEach(function(btn){btn.addEventListener('click',function(){var c=card(btn);BTALK[c.id]=!BTALK[c.id];renderBoard();var q=BTALK[c.id]&&el.querySelector(".bcard[data-i='"+cs.indexOf(c)+"'] .talkq");if(q&&q.focus)q.focus();});});
el.querySelectorAll('.btalk').forEach(function(box){var c=card(box),inp=box.querySelector('.talkq'),send=box.querySelector('.talksend'),msgs=box.querySelector('.msgs');
inp.value=BTALKDRAFT[c.id]||'';inp.addEventListener('input',function(){BTALKDRAFT[c.id]=inp.value;});
function ask(){var q=(inp.value||'').trim();if(!q||send.disabled)return;send.disabled=true;inp.value='';BTALKDRAFT[c.id]='';BTALKBUSY++;
if(!(c.chat&&c.chat.length))msgs.innerHTML='';
msgs.insertAdjacentHTML('beforeend',chatMsgs([{role:'user',text:q}])+"<div class='msg a muted thinking'>Thinking&hellip;</div>");
function done(){BTALKBUSY=Math.max(0,BTALKBUSY-1);send.disabled=false;var th=msgs.querySelector('.thinking');if(th)th.remove();}
api('/api/watch/chat',{id:c.id,question:q}).then(function(r){done();
if(r.error==='not-connected'){msgs.insertAdjacentHTML('beforeend',"<div class='msg a'>Connect a model in Settings to talk it over - Ollama is free and runs locally.</div>");return;}
if(r.error){msgs.insertAdjacentHTML('beforeend',"<div class='msg a err'>"+esc(r.error)+"</div>");return;}
c.chat=r.chat||[];msgs.innerHTML=chatMsgs(c.chat);var tb=box.closest('.bcard').querySelector('.btalkbtn');if(tb)tb.innerHTML='&#128172; '+Math.ceil(c.chat.length/2);}).catch(function(e){done();msgs.insertAdjacentHTML('beforeend',"<div class='msg a err'>"+esc(String((e&&e.message)||e))+"</div>");});}
send.addEventListener('click',ask);inp.addEventListener('keydown',function(e){if(e.key==='Enter')ask();});
box.querySelector('.talkclear').addEventListener('click',function(){api('/api/watch/chat/clear',{id:c.id}).then(function(){c.chat=[];msgs.innerHTML=TALKHINT;var tb=box.closest('.bcard').querySelector('.btalkbtn');if(tb)tb.innerHTML='&#128172;';});});});
el.querySelectorAll('.bopenwa').forEach(function(btn){btn.addEventListener('click',function(){openChatUI(item(btn),btn,boardMsg);});});
function item(btn){return card(btn).items[+btn.closest('.bi').getAttribute('data-j')];}
el.querySelectorAll('.bcheck').forEach(function(btn){btn.addEventListener('click',function(){var c=card(btn);btn.disabled=true;btn.textContent='Reading…';
api('/api/watch/check',{id:c.id}).then(function(x){if(!x||x.error)boardMsg('err',esc((x&&x.error)||'failed'));else boardMsg(x["new"]&&x["new"].length?'ok':'muted',watchCheckMsg(c,x));loadWatchUI();}).catch(function(e){btn.disabled=false;btn.textContent='Check now';boardMsg('err',esc(String((e&&e.message)||e)));});});});
el.querySelectorAll('.bseen').forEach(function(btn){btn.addEventListener('click',function(){var c=card(btn);btn.disabled=true;
api('/api/watch/seen',{id:c.id}).then(function(x){if(!x||x.error){btn.disabled=false;boardMsg('err',esc((x&&x.error)||'failed'));return;}$('boardmsg').innerHTML='';loadBoard();}).catch(function(e){btn.disabled=false;boardMsg('err',esc(String((e&&e.message)||e)));});});});
el.querySelectorAll('.bopen').forEach(function(btn){btn.addEventListener('click',function(){var n=item(btn);if(n&&/^https?:/.test(n.href))window.open(n.href,'_blank','noopener');});});
el.querySelectorAll('.bdraft').forEach(function(btn){btn.addEventListener('click',function(){var n=item(btn);btn.disabled=true;
api('/api/watch/draft',{id:n.id}).then(function(x){btn.disabled=false;if(!x||x.error){boardMsg('err',esc((x&&x.error)||'failed'));return;}boardMsg('ok',x.chat?DRAFTING_CHAT:DRAFTING);loadWatchUI();}).catch(function(e){btn.disabled=false;boardMsg('err',esc(String((e&&e.message)||e)));});});});}
$('boardrefresh').addEventListener('click',loadBoard);$('boardhours').addEventListener('change',loadBoard);
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
function showLatestWeek(){api('/api/desktop').then(function(d){var l=d&&d.weekly&&d.weekly.latest;if(!l||current!=='week'||$('out').textContent!=='Nothing yet - hit the button.')return;
$('out').textContent=l.text;$('out').classList.remove('muted');$('copy').classList.remove('hidden');var f=$('outfoot');f.textContent='Written automatically '+new Date(l.at).toLocaleString()+' · '+l.file+(l.footer?' · '+l.footer:'');f.style.display='block';});}
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
document.getElementById('addtrusted').addEventListener('click',addTrustedUI);
document.getElementById('newtrusted').addEventListener('keydown',function(e){if(e.key==='Enter')addTrustedUI();});
document.getElementById('driftrun').addEventListener('click',function(){driftLoaded=false;loadDrift();});
document.getElementById('agentsrefresh').addEventListener('click',loadAgents);
document.getElementById('addtask').addEventListener('click',addTaskUI);
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
document.getElementById('newtask').addEventListener('keydown',function(e){if(e.key==='Enter')addTaskUI();});
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
function heartbeat(fresh){
  api('/api/ping'+(fresh?'?fresh=1':'')).then(function(p){
    var b=ubar();
    var ve=document.getElementById('ver');if(ve&&p.version)ve.textContent='v'+p.version;
    if(SRV_STARTED===null){SRV_STARTED=p.started;appBar(p);}
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

// ---- the liquid: the app's home ---------------------------------------------------
// One silver surface is the app. Its droplets: what only you can do, what's new on
// what you watch, and the parts of the app, sized and placed from how you use them
// (adapt.mjs: Fitts, Hick, hysteresis); filled from real data (home.mjs). Opening
// one pools it: that part's panel opens over the liquid. Droplets move as
// critically damped springs that push each other apart, and the liquid they hold
// comes out of the core (mass is conserved). Your colours come from the system,
// live: light or dark, contrast, transparency, forced colours, your accent, night.
var LQ={drops:[],btns:[],core:{x:0,y:0,cr:0},mode:'aware',last:'',lastAct:Date.now(),talk:[],talking:false,theme:{},ripple:[0.5,0.5,-10],t:0,pointer:null,touch:false,frame:0};
var LQNAMES={board:'Dashboard',map:'Map',tasks:'Tasks',agents:'Agents',week:'Week',standup:'Standup',todo:'Todo',drift:'Drift',settings:'Settings'};
var LQ_REST=60000,LQ_MAX=11;
function lqMM(q){try{return !!(window.matchMedia&&window.matchMedia(q).matches);}catch(e){return false;}}
function lqTheme(){var th={light:lqMM('(prefers-color-scheme: light)'),contrast:lqMM('(prefers-contrast: more)'),forced:lqMM('(forced-colors: active)'),solid:lqMM('(prefers-reduced-transparency: reduce)'),still:lqMM('(prefers-reduced-motion: reduce)'),wide:lqMM('(color-gamut: p3)'),night:false,accent:null};
var h=new Date().getHours();th.night=h>=22||h<6;
try{if(document.createElement&&typeof getComputedStyle==='function'&&document.body&&document.body.appendChild){var a=document.createElement('span'),b=document.createElement('span');a.style.color='AccentColor';b.style.color='CanvasText';document.body.appendChild(a);document.body.appendChild(b);
if(a.style.color){var ca=getComputedStyle(a).color,cb=getComputedStyle(b).color;if(ca&&ca!==cb){var m=ca.match(/[0-9.]+/g);if(m&&m.length>=3)th.accent=[m[0]/255,m[1]/255,m[2]/255];}}a.remove();b.remove();}}catch(e){}
var bd=document.body;if(bd&&bd.classList){bd.classList.toggle('lq-light',th.light);bd.classList.toggle('lq-contrast',th.contrast);bd.classList.toggle('lq-solid',th.solid||th.contrast);bd.classList.toggle('lq-forced',th.forced);}
LQ.theme=th;return th;}
function lqSize(){var el=$('liquid');var w=(el&&el.clientWidth)||window.innerWidth||1280,h=(el&&el.clientHeight)||window.innerHeight||800;return {w:w,h:h,s:Math.max(0.55,Math.min(1.15,Math.min(w,h)/860))};}
function lqLoad(commit){Promise.all([api('/api/adapt?from='+encodeURIComponent(LQ.last)+(commit?'&commit=1':'')+(LQ.touch?'&touch=1':'')),api('/api/home')]).then(function(r){LQ.adapt=r[0]||{};LQ.home=r[1]||{};lqBuild();}).catch(function(){});}
function lqBuild(){var a=LQ.adapt||{},h=LQ.home||{},S=lqSize(),cx=S.w/2,cy=S.h*0.47,list=[];LQ.bw=S.w;LQ.bh=S.h;
var you=(h.you||[]).slice(0,3),feeds=(h.feeds||[]).slice(0,2),lay=(a.layout&&a.layout.items)||[],more=((a.layout&&a.layout.more)||[]).slice();
var vx=Math.max(0.5,Math.min(S.s*1.3,(S.w/2-90)/400)),vy=Math.max(0.35,Math.min(S.s*0.8,(S.h-cy-230)/400,(cy-160)/400));var rs=Math.min(S.s,(vx+vy)/1.5);var room=Math.max(3,LQ_MAX-you.length-feeds.length-1);lay.slice(room).forEach(function(it){more.push(it.id);});
lay.slice(0,room).forEach(function(it){list.push({id:'shape:'+it.id,kind:'shape',shape:it.id,title:LQNAMES[it.id]||it.id,sub:'',r:it.r*rs,tx:cx+Math.cos(it.angle)*it.d*vx,ty:cy+Math.sin(it.angle)*it.d*vy});});
you.forEach(function(y,i){var ang=-Math.PI/2+(i-(you.length-1)/2)*0.6;list.push({id:y.id,kind:'you',shape:y.shape,title:y.title,sub:y.sub,r:50*rs,tx:cx+Math.cos(ang)*230*vx,ty:cy+Math.sin(ang)*230*vy*1.05,tendril:true});});
feeds.forEach(function(f,i){var ang=Math.PI/2+(i-(feeds.length-1)/2)*0.7;list.push({id:f.id,kind:'feed',shape:f.shape,title:f.title,sub:f.sub,r:(28+5*Math.min(f.count||1,5))*rs,tx:cx+Math.cos(ang)*300*vx,ty:cy+Math.sin(ang)*300*vy});});
// Solve it. If this screen can't hold them all clear of each other (lqRelax), the
// least likely part goes under "more" (Hick: fewer, not cramped) and it solves
// again. What only you can do and your feeds always stay out.
var base=list.slice(),cur=null,tries=0;base.forEach(function(d){d.r0=d.r;d.tx0=d.tx;d.ty0=d.ty;});
for(;;){cur=base.slice();if(more.length)cur.push({id:'more',kind:'more',title:'more',sub:more.map(function(m){return LQNAMES[m]||m;}).join(' · '),more:more.slice(),r0:24*S.s,tx0:S.w-Math.max(70,S.w*0.08),ty0:150});
cur.forEach(function(d){d.r=d.r0;d.tx=d.tx0;d.ty=d.ty0;});if(lqRelax(cur,S,cx,cy,92*rs)||tries++>=8)break;
var q=-1;for(var z=base.length-1;z>=0;z--)if(base[z].kind==='shape'){q=z;break;}if(q<0)break;more.push(base[q].shape);base.splice(q,1);}
list=cur;var old={};LQ.drops.forEach(function(d){old[d.id]=d;});
LQ.drops=list.map(function(d){var o=old[d.id];d.x=o?o.x:cx;d.y=o?o.y:cy;d.vx=o?o.vx:0;d.vy=o?o.vy:0;d.cr=o?o.cr:0;return d;});
var n=(h.you||[]).length,w=h.working||0;
LQ.coreText=n?(n+(n>1?' things need':' thing needs')+' only you'+(w?' · '+w+' agent'+(w>1?'s':'')+' working':'')):(w?w+' agent'+(w>1?'s':'')+' working · nothing needs you':'All handled');
var b=document.body;if(b&&b.classList){b.classList.toggle('lq-touch',!!(a.modes&&a.modes.touch)||LQ.touch);b.classList.toggle('lq-keys',!!(a.modes&&a.modes.keyboard));}
LQ.talkWeight=(a.modes&&a.modes.talkWeight)||0.35;
lqLabels();}
// Force-directed layout, solved once per change: push overlapping targets apart
// (each droplet's circle plus its label below or above), and off the core, within
// the screen. Deterministic, so the same data gives the same layout.
// The one rule for how far apart two droplets sit: past where their metal would
// bridge (r²/d² fields sum to 1 midway at d = 2·√(r1²+r2²)), with a margin so the
// wobble can't flicker a bridge open and shut, and room for their labels when
// they share a column. Used once, when the layout is solved; nothing fights it live.
function lqSep(a,b,dx){return Math.max(a.r+b.r+70,2.4*Math.sqrt(a.r*a.r+b.r*b.r))+(Math.abs(dx)<150?48:0);}
// Solve the layout: push targets apart until every pair keeps lqSep (and clear
// of the core), within the screen. If they can't all fit, every droplet gives up
// a little of its size (the liquid is conserved, not crowded) and it solves again.
function lqRelax(L,S,cx,cy,coreR){var n=L.length;
for(var pass=0;pass<6;pass++){
for(var it=0;it<220;it++){var moved=0;for(var i=0;i<n;i++){var a=L[i];
for(var j=i+1;j<n;j++){var b=L[j],dx=a.tx-b.tx,dy=a.ty-b.ty,dd=Math.sqrt(dx*dx+dy*dy)||0.01,mn=lqSep(a,b,dx);if(dd<mn){var f=(mn-dd)/2/dd;a.tx+=dx*f;a.ty+=dy*f;b.tx-=dx*f;b.ty-=dy*f;moved++;}}
var cdx=a.tx-cx,cdy=a.ty-cy,cd=Math.sqrt(cdx*cdx+cdy*cdy)||0.01,cm=Math.max(a.r+coreR+70,2.4*Math.sqrt(a.r*a.r+coreR*coreR));if(cd<cm){a.tx+=cdx*(cm-cd)/cd;a.ty+=cdy*(cm-cd)/cd;moved++;}
a.tx=Math.max(a.r+60,Math.min(S.w-a.r-60,a.tx));a.ty=Math.max(140+a.r,Math.min(S.h-200-a.r,a.ty));}if(!moved)break;}
var bad=false;for(var i2=0;i2<n&&!bad;i2++)for(var j2=i2+1;j2<n;j2++){var p=L[i2],q=L[j2],ddx=p.tx-q.tx,ddy=p.ty-q.ty;if(Math.sqrt(ddx*ddx+ddy*ddy)<lqSep(p,q,ddx)-1){bad=true;break;}}
if(!bad)return true;L.forEach(function(x){x.r*=0.9;});coreR*=0.9;}return false;}
function lqLabels(){var el=$('lqdrops');if(!el)return;
el.innerHTML=LQ.drops.map(function(d,i){return "<button type='button' class='lqd lq-"+d.kind+"' data-i='"+i+"'><span>"+esc(d.title)+"</span>"+(d.sub?"<small>"+esc(d.sub)+"</small>":"")+"</button>";}).join('');
LQ.btns=[];el.querySelectorAll('.lqd').forEach(function(b){LQ.btns.push(b);b.addEventListener('click',function(ev){lqOpen(LQ.drops[+b.getAttribute('data-i')],ev);});});
LQ.drops.forEach(function(d){if(d.x===d.tx&&d.y===d.ty)return;if(!LQ.frame){d.x=d.tx;d.y=d.ty;d.cr=d.r;}});lqStep();
var c=$('lqcore');if(c)c.textContent=LQ.coreText||'';}
function lqVia(ev){return LQ.talking?'talk':ev&&ev.pointerType==='touch'?'touch':ev&&ev.detail===0?'key':'click';}
function lqUse(shape,ev,via){api('/api/adapt/use',{shape:shape,from:LQ.last,via:via||lqVia(ev)});LQ.last=shape;}
function lqOpen(d,ev){if(!d)return;lqAct();
if(d.kind==='more'){LQ.moreOpen=!LQ.moreOpen;lqMore(d);return;}
var S=lqSize();LQ.ripple=[d.x/S.w,d.y/S.h,LQ.t];lqUse(d.shape||'board',ev);lqPool(d.shape||'board');}
function lqMore(d){var el=$('lqmore');if(!el)return;if(!LQ.moreOpen||!d){el.innerHTML='';return;}
el.innerHTML=(d.more||[]).map(function(s){return "<button type='button' class='lqd lqm' style='position:static' data-s='"+s+"'><span>"+esc(LQNAMES[s]||s)+"</span></button>";}).join('');
el.querySelectorAll('.lqm').forEach(function(b){b.addEventListener('click',function(ev){var s=b.getAttribute('data-s');LQ.moreOpen=false;el.innerHTML='';lqUse(s,ev);lqPool(s);});});}
function lqPool(shape){tabPicked=true;setTab(shape);var b=document.body;if(b&&b.classList)b.classList.add('lq-pooled');LQ.mode='pool';var m=document.querySelector('main');if(m&&m.focus)m.focus();}
function lqSink(){var b=document.body;if(b&&b.classList)b.classList.remove('lq-pooled');LQ.mode='aware';lqAct();lqLoad(false);}
function lqAct(){LQ.lastAct=Date.now();if(LQ.mode==='rest'){LQ.mode='aware';lqLoad(true);}}
function lqTalkMode(on){LQ.talking=on;var b=document.body;if(b&&b.classList)b.classList.toggle('lq-talking',on);}
function lqTalkShow(wait){var el=$('lqtalk');if(!el)return;el.innerHTML=LQ.talk.map(function(m){return "<div class='lqmsg"+(m.me?' me':'')+"'>"+esc(m.text)+stepsHtml(m.steps)+"</div>";}).join('')+(wait?"<div class='lqmsg thinking'>Thinking: recalling what it knows, reading what's here&hellip;</div>":'');if(el.scrollHeight)el.scrollTop=el.scrollHeight;}
function lqSay(){var i=$('lqask');var q=((i&&i.value)||'').trim();if(!q)return;i.value='';lqAct();
var low=q.toLowerCase().replace(/^(please |can you |could you )/,''),hit='';
Object.keys(LQNAMES).forEach(function(k){var nm=LQNAMES[k].toLowerCase();if(hit)return;['open ','show ','go to ','take me to '].forEach(function(v){if(low.indexOf(v+nm)===0||low.indexOf(v+'my '+nm)===0)hit=k;});if(low===nm)hit=k;});
if(hit){lqTalkMode(true);lqUse(hit,null,'talk');lqPool(hit);return;}
LQ.talk.push({me:true,text:q});LQ.talk=LQ.talk.slice(-8);lqTalkShow(true);
api('/api/home/ask',{question:q}).then(function(r){LQ.talk.push({me:false,steps:r.steps||[],text:r.error==='not-connected'?'Connect an AI in Settings to talk to me. Say "open settings".':(r.answer||r.error||'(no answer)')});LQ.talk=LQ.talk.slice(-8);lqTalkShow(false);LQ.ripple=[0.5,0.47,LQ.t];lqLoad(false);}).catch(function(e){LQ.talk.push({me:false,text:String((e&&e.message)||e)});lqTalkShow(false);});}
// The physics: each droplet a critically damped spring to its place (no wobble,
// no overshoot), pushed off its neighbours and the core where they'd overlap.
function lqStep(){var S0=lqSize();if(LQ.adapt&&(S0.w!==LQ.bw||S0.h!==LQ.bh))lqBuild();var S=S0,cx=S.w/2,cy=S.h*0.47,k=0.022,c=2*Math.sqrt(k),th=LQ.theme,still=th.still,rest=LQ.mode==='rest',pool=LQ.mode==='pool',talk=LQ.talking&&!pool;
var core=LQ.core,ctx=cx,cty=talk?S.h-44:cy,ctr=(rest?140:pool?50:talk?54+30*(LQ.talkWeight||0.35):92)*S.s;
if(!core.x){core.x=cx;core.y=cy;}core.x+=(ctx-core.x)*(still?1:0.06);core.y+=(cty-core.y)*(still?1:0.06);core.cr+=(ctr-core.cr)*(still?1:0.05);
var D=LQ.drops,N=D.length;
for(var i=0;i<N;i++){var d=D[i],tx=d.tx,ty=d.ty,tr=d.r;
if(rest){tx=cx+Math.cos(i*1.3)*16;ty=cy+Math.sin(i*1.3)*16;tr=d.r*0.6;}
else if(pool){tx=cx+(i-(N-1)/2)*40*S.s;ty=S.h-40;tr=13*S.s;}
else if(talk){ty=S.h*0.12+(d.ty-S.h*0.12)*0.55;}
var ax=k*(tx-d.x)-c*d.vx,ay=k*(ty-d.y)-c*d.vy;
if(still){d.x=tx;d.y=ty;d.vx=0;d.vy=0;}else{d.vx+=ax;d.vy+=ay;d.x+=d.vx;d.y+=d.vy;}
if(!rest&&!pool){d.x=Math.max(d.cr+12,Math.min(S.w-d.cr-12,d.x));d.y=Math.max(140+d.cr,Math.min(S.h-150-d.cr-50,d.y));}
d.cr+=(tr-d.cr)*(still?1:0.06);
var b=LQ.btns[i];if(b&&b.offsetWidth)d.lw=b.offsetWidth;if(b&&b.style){var up=d.y<core.y-core.cr*0.3;b.style.transform='translate('+Math.round(d.x)+'px,'+Math.round(up?d.y-d.cr-10:d.y+d.cr+10)+'px) translateX(-50%)'+(up?' translateY(-100%)':'');var show=!rest&&!pool;b.style.opacity=show?'1':'0';b.style.pointerEvents=show?'auto':'none';b.tabIndex=show?0:-1;}}
var cb=$('lqcore');if(cb&&cb.style){cb.style.transform='translate('+Math.round(cx)+'px,'+(rest?Math.round(core.y+core.cr+18):56)+'px) translateX(-50%)';var ct=rest?(LQ.coreText||'All handled'):talk||pool?'':(LQ.coreText||'');cb.textContent=ct;cb.style.opacity=ct?'1':'0';cb.style.pointerEvents=ct?'auto':'none';}}
// The liquid: a metaball surface (Σ r²/d² = 1) shaded as chrome, on the GPU.
var LQ_FS=['precision highp float;',
'uniform vec2 uRes;uniform float uT;uniform float uDpr;uniform vec3 uB[16];uniform vec3 uRip;uniform float uLight;uniform float uContrast;uniform vec4 uAccent;uniform float uExposure;',
'float field(vec2 p){float f=0.0;for(int i=0;i<16;i++){vec3 b=uB[i];float r=b.z*uDpr;vec2 d=p-b.xy*uRes;f+=r*r/(dot(d,d)+1.0);}vec2 q=p/uDpr;return f*(1.0+0.025*sin(q.x*0.011+uT*0.7)*cos(q.y*0.009-uT*0.55)+0.012*sin(q.x*0.031-q.y*0.027+uT*1.3));}',
'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
'vec3 env(vec3 r){float y=r.y;vec3 c=mix(mix(vec3(0.02,0.022,0.03),vec3(0.36,0.38,0.43),uLight),vec3(0.82,0.84,0.90),smoothstep(-0.35,0.55,y));c+=vec3(1.0)*pow(max(0.0,1.0-abs(y-0.18+0.04*sin(uT*0.3))*5.0),4.0)*1.1;c+=vec3(0.75,0.82,1.0)*pow(max(0.0,r.x),10.0)*0.9;c+=vec3(1.0,0.93,0.86)*pow(max(0.0,-r.x),14.0)*0.5;c*=0.92+0.08*sin(r.x*4.0+r.y*3.0+uT*0.4);return c;}',
'void main(){vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);float f=field(p);float e=2.0*uDpr;',
'float fx=field(p+vec2(e,0.0))-field(p-vec2(e,0.0));float fy=field(p+vec2(0.0,e))-field(p-vec2(0.0,e));',
'vec2 rc=uRip.xy*uRes;float rd=distance(p,rc)/uDpr;float age=uT-uRip.z;float ring=0.0;if(age>0.0&&age<4.0){float w=rd-age*300.0;ring=sin(w*0.07)*exp(-abs(w)*0.02)*(1.0-age/4.0);}',
'vec2 rdir=normalize(p-rc+0.001);fx+=ring*0.22*rdir.x;fy+=ring*0.22*rdir.y;',
'vec3 n=normalize(vec3(-fx*6.0,fy*6.0,1.0));vec3 r=reflect(vec3(0.0,0.0,-1.0),n);vec3 metal=env(r);',
'float fres=pow(1.0-n.z,2.0);metal=mix(metal,vec3(1.0),fres*0.25);metal*=0.86+0.14*smoothstep(1.0,4.0,f);',
'metal=mix(metal,metal*(0.55+0.9*uAccent.rgb),uAccent.a*0.3);',
'metal=mix(metal,metal*(1.0-0.5*fres)+0.04,uLight);metal*=uExposure;',
'vec2 uv=p/uRes;vec2 cell=floor(p/(2.0*uDpr));float s=step(0.9975,hash(cell))*(0.35+0.25*sin(uT*1.5+hash(cell+3.1)*6.28))*(1.0-uLight);',
'vec3 dark=vec3(0.012,0.014,0.02)+vec3(s);dark*=1.0-0.55*length(uv-0.5);dark+=vec3(0.05,0.055,0.07)*smoothstep(0.25,1.0,f);',
'vec3 pearl=vec3(0.93,0.94,0.955)-0.07*length(uv-0.5);pearl-=vec3(0.11)*smoothstep(0.3,1.0,f);',
'vec3 bg=mix(dark,pearl,uLight)*mix(1.0,uExposure,0.5);bg+=mix(vec3(0.55,0.6,0.7),vec3(-0.3),uLight)*abs(ring)*0.09;',
'float edge=mix(0.07,0.02,uContrast);float m=smoothstep(1.0-edge,1.0+edge,f);',
'float line=(smoothstep(0.86,0.97,f)-smoothstep(0.97,1.08,f))*uContrast;',
'vec3 col=mix(bg,metal,m);col=mix(col,mix(vec3(1.0),vec3(0.0),uLight),line);',
'gl_FragColor=vec4(col,1.0);}'].join('');
function lqGL(){var c=$('lq');if(!c||!c.getContext)return null;var gl=null;try{gl=c.getContext('webgl',{antialias:false,alpha:false});}catch(e){}if(!gl)return null;
function sh(t,src){var o=gl.createShader(t);gl.shaderSource(o,src);gl.compileShader(o);return o;}
var pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}'));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,LQ_FS));gl.linkProgram(pr);
if(!gl.getProgramParameter(pr,gl.LINK_STATUS))return null;gl.useProgram(pr);
var bf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,bf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
var al=gl.getAttribLocation(pr,'a');gl.enableVertexAttribArray(al);gl.vertexAttribPointer(al,2,gl.FLOAT,false,0,0);
var U={};['uRes','uT','uDpr','uB','uRip','uLight','uContrast','uAccent','uExposure'].forEach(function(n){U[n]=gl.getUniformLocation(pr,n);});
return {gl:gl,c:c,U:U,out:new Float32Array(48),t0:(window.performance&&performance.now)?performance.now():Date.now()};}
function lqDraw(G){var gl=G.gl,c=G.c,S=lqSize(),d=Math.min(window.devicePixelRatio||1,1.5),W=Math.max(1,Math.floor(S.w*d)),H=Math.max(1,Math.floor(S.h*d));
if(c.width!==W||c.height!==H){c.width=W;c.height=H;gl.viewport(0,0,W,H);}
var now=(window.performance&&performance.now)?performance.now():Date.now(),t=(now-G.t0)/1000,th=LQ.theme,still=th.still,o=G.out;LQ.t=t;
for(var i=0;i<48;i++)o[i]=0;
var put=function(k,x,y,r){if(k>15)return;var w=still?0:(k===0?1:0.3);o[k*3]=x/S.w+Math.sin(t*1.3+k*1.7)*0.004*w;o[k*3+1]=y/S.h+Math.cos(t*1.1+k*2.3)*0.005*w;o[k*3+2]=Math.max(0,r)*(1+0.035*Math.sin(t*2.0+k)*w);};
put(0,LQ.core.x,LQ.core.y,LQ.core.cr);var k=1,tend=[];
LQ.drops.forEach(function(dr){put(k++,dr.x,dr.y,dr.cr);if(dr.tendril&&LQ.mode==='aware'&&!LQ.talking)tend.push(dr);});
// a tendril is a chain of blobs close enough to always bridge (spaced at under 2.8r),
// never one blob floating in the gap: drawn whole or not at all
tend.forEach(function(dr){var dx=dr.x-LQ.core.x,dy=dr.y-LQ.core.y,len=Math.sqrt(dx*dx+dy*dy)||1,gap=len-LQ.core.cr-dr.cr;if(gap<=8)return;var n=Math.max(1,Math.min(3,Math.ceil(gap/40))),sp=gap/(n+1),rr=sp/2;if(k+n>15)return;for(var m=1;m<=n;m++){var at=LQ.core.cr+sp*m;put(k++,LQ.core.x+dx/len*at,LQ.core.y+dy/len*at,rr);}});
var P=LQ.pointer;if(P&&LQ.mode==='aware'&&!LQ.talking){var best=null,bd=1e9;[LQ.core].concat(LQ.drops).forEach(function(g){if(g.cr<18)return;var dd=Math.hypot(P[0]-g.x,P[1]-g.y)-g.cr;if(dd<bd){bd=dd;best=g;}});
if(best&&bd<230){var dx=P[0]-best.x,dy=P[1]-best.y,dl=Math.hypot(dx,dy)||1,reach=Math.min(dl,best.cr+70);put(15,best.x+dx/dl*reach,best.y+dy/dl*reach,8+20*(1-Math.max(0,bd)/230));}}
var U=G.U;gl.uniform2f(U.uRes,W,H);gl.uniform1f(U.uT,t);gl.uniform1f(U.uDpr,d);gl.uniform3fv(U.uB,o);gl.uniform3f(U.uRip,LQ.ripple[0],LQ.ripple[1],still?-10:LQ.ripple[2]);
gl.uniform1f(U.uLight,th.light?1:0);gl.uniform1f(U.uContrast,th.contrast?1:0);var ac=th.accent;gl.uniform4f(U.uAccent,ac?ac[0]:1,ac?ac[1]:1,ac?ac[2]:1,ac?1:0);gl.uniform1f(U.uExposure,th.night?0.82:1);
gl.drawArrays(gl.TRIANGLES,0,3);}
function lqInit(){var bd=document.body;if(!bd||!bd.classList)return;lqTheme();bd.classList.add('lq-liquid');
['(prefers-color-scheme: light)','(prefers-contrast: more)','(forced-colors: active)','(prefers-reduced-transparency: reduce)','(prefers-reduced-motion: reduce)'].forEach(function(q){try{var mq=window.matchMedia&&window.matchMedia(q);if(mq&&mq.addEventListener)mq.addEventListener('change',lqTheme);else if(mq&&mq.addListener)mq.addListener(lqTheme);}catch(e){}});
var L=$('liquid');if(L&&L.addEventListener){L.addEventListener('pointermove',function(ev){LQ.pointer=[ev.clientX,ev.clientY];if(ev.pointerType==='touch')LQ.touch=true;lqAct();});L.addEventListener('pointerdown',function(ev){if(ev.pointerType==='touch')LQ.touch=true;lqAct();});}
var f=$('lqform');if(f&&f.addEventListener)f.addEventListener('submit',function(ev){if(ev&&ev.preventDefault)ev.preventDefault();lqSay();});
var ia=$('lqask');if(ia&&ia.addEventListener){ia.addEventListener('focus',function(){lqTalkMode(true);lqAct();});ia.addEventListener('blur',function(){if(!ia.value&&!LQ.talk.length)lqTalkMode(false);});ia.addEventListener('keydown',function(ev){if(ev&&ev.key==='Escape'){if(LQ.mode==='pool'){lqSink();return;}ia.value='';LQ.talk=[];lqTalkShow(false);lqTalkMode(false);if(ia.blur)ia.blur();}});}
var co=$('lqcore');if(co&&co.addEventListener)co.addEventListener('click',function(){var i=$('lqask');if(i&&i.focus)i.focus();});
var sk=$('lqsink');if(sk&&sk.addEventListener)sk.addEventListener('click',lqSink);
var mn=document.querySelector('main');if(mn&&mn.addEventListener)mn.addEventListener('keydown',function(ev){if(ev&&ev.key==='Escape')lqSink();});
lqLoad(true);
// the only clocks: rest when left alone, fresh data now and then, the hour (night)
setInterval(function(){if(LQ.mode==='aware'&&!LQ.talking&&Date.now()-LQ.lastAct>LQ_REST)LQ.mode='rest';if(LQ.mode!=='pool')lqLoad(false);var h=new Date().getHours(),n=h>=22||h<6;if(n!==LQ.theme.night)lqTheme();},30000);
var G=lqGL();if(G){try{lqStep();lqDraw(G);}catch(e){}}if(typeof window.requestAnimationFrame!=='function')return;var raf=function(f){return window.requestAnimationFrame(f);};
function frame(){if(!document.hidden){LQ.frame++;if(LQ.mode!=='pool'||LQ.frame%3===0){lqStep();if(G)lqDraw(G);}}raf(frame);}
raf(frame);}

initGraphEvents();syncP();refresh();loadMap();firstTab();lqInit();loadWhatsNew();loadAgentCfg();loadScanRoots();loadPhone();loadLinks();loadMind();loadTrusted();loadMail();loadScreensUI();loadMonitorsUI();loadDesktop();loadWatchUI();setInterval(loadWatchUI,60000);loadPhoneLink();
</script></body></html>`;
