// The toolbar button: is Symbiot connected, which sites wait for your Allow (Chrome's own dialog,
// one site at a time), the sites it may work on (each with Forget), and Stop or Start.
const ask = (m) => chrome.runtime.sendMessage(m);
const el = (t, props = {}, kids = []) => { const e = Object.assign(document.createElement(t), props); e.append(...kids); return e; };
const host = (o) => o.replace(/^https?:\/\//, "").replace(/\/\*$/, "");

async function draw() {
  const s = await ask({ op: "state" });
  document.getElementById("state").textContent = s.stopped ? "Stopped: Symbiot can't use this Chrome until you press Start."
    : s.connected ? "Connected to Symbiot." : "Waiting for the Symbiot app on this computer.";
  const asks = document.getElementById("asks"); asks.replaceChildren();
  if (s.asks.length) asks.append(el("h2", { textContent: "Symbiot asks to work on" }), el("ul", {}, s.asks.map((o) => el("li", {}, [
    el("span", { textContent: host(o) }),
    el("button", { className: "go", type: "button", textContent: "Allow", onclick: async () => {
      // Chrome's dialog comes from this press: a site is only ever allowed by you
      const ok = await chrome.permissions.request({ origins: [o + "/*"] });
      if (ok) await ask({ op: "allowed", origin: o });
      draw();
    } }),
  ]))));
  const sites = document.getElementById("sites"); sites.replaceChildren();
  const mine = (s.origins || []).filter((o) => /^https?:\/\//.test(o));
  if (mine.length) sites.append(el("h2", { textContent: "Symbiot may work on" }), el("ul", {}, mine.map((o) => el("li", {}, [
    el("span", { textContent: host(o) }),
    el("button", { type: "button", textContent: "Forget", onclick: async () => { await ask({ op: "forget", origin: o.replace(/\/\*$/, "") }); draw(); } }),
  ]))));
  const b = document.getElementById("stop");
  b.textContent = s.stopped ? "Start" : "Stop";
  b.onclick = async () => { await ask({ op: s.stopped ? "start" : "stop" }); draw(); };
}
draw();
