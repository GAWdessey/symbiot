# Symbiot brand facts

Compiled 2026-10-09 · repo version **0.58.2** (`package.json`, commit `d08c23c`). On that date npm's latest published version is **0.58.1** (registry.npmjs.org/symbiot, `dist-tags.latest`).

This is a fact sheet for a designer who is making the definitive Symbiot icon/logo and can't see the app or the code. It reports what exists and cites a source for each fact. Where something isn't there, it says "not found". It gives no design opinions.

How to read the references:
- Paths are relative to `/home/garthsghost/orca/projects/symbiot` unless they start with `/`.
- Line numbers refer to commit `d08c23c`. While this was written, another run had uncommitted edits in the working tree (a marketing "pick tray", `tray.mjs`), which shift some `ui.mjs` line numbers. Those edits change nothing brand-related.
- `symbiot-desktop` means `/home/garthsghost/orca/projects/symbiot-desktop`.
- `desktop/` means the desktop app's folder on `main` of this repo (PR #149, merged 2026-10-09, after this report was first written). It isn't on this branch yet; its line numbers are `main`'s. npm's latest is now **0.58.2**.

---

## 1. What Symbiot is

**Description (from its own copy).** Symbiot is an app that runs on the user's own computer, for developers and small teams.
- **Where it started:** a CLI that "reads your **local git activity** and writes the update you'd actually send — your weekly summary, your standup, or what's still on your plate" (`README.md:5-8`).
- **What it is now:** a desktop assistant that "watches what you work on and what comes in, hands tasks to your coding agent, and only asks you what only you can do" (`site/index.html:7`, `:117`).
- **How it runs:**
  - It uses the user's Claude subscription through Claude Code. It can also use an Anthropic, OpenAI or Google key, or a local model.
  - It opens in a chrome-less browser window.
  - Sources: `README.md:43-63`, `site/index.html:191`.
- **Home screen:** "one surface of liquid silver that shapes itself to you, with no settings … leave it alone and it rests as one orb" (`CHANGELOG.md:297`).
- **Android:** it also runs as a sideloaded APK (`android/AndroidManifest.xml:2-4`).

**Who uses it.**
- README: "For developers and small teams who owe someone an update every week (a manager, a client, a standup, the team channel)" (`README.md:29-36`).
- The website addresses a less technical user: "Install it. Set it up once. Get on with your day." / "No terminal, no keys to copy, nothing to configure by hand" (`site/index.html:144-145`).

**Tone in use (quoted, not judged).**
- **Calm and low-attention:**
  - "Talk to it, or don't … just glance at the orb. It keeps working while you get on with your day" (`site/index.html:149`).
  - "There are no settings for any of this: it adapts to you" (`README.md:688-689`).
  - The Away screen shows "counts only, never anyone's words" (`README.md:720`).
- **An agent that acts:**
  - "It works … hands tasks to your coding agent, which does them on its own" (`site/index.html:135`).
  - "Symbiosis: agents work on their own" (`README.md:475`).
- **Guarded:**
  - "Nothing is pushed, published or deleted behind your back" (`site/index.html:135`).
  - "Anything that goes out in your name waits for your OK" (`site/index.html:192`).
- **Copy style:** plain, second person, sentence case. The headlines are "Your work, handled alongside you." / "One orb that knows what needs you." / "Get Symbiot." (`site/index.html:116`, `:131`, `:157`).
- **Onboarding:** "Meet Symbiot — It works alongside you, so your time goes on what only you can do." It is followed by three cards: It watches / It works / It asks (`ui.mjs:3256-3257`).

**The 3–5 words users would most likely use** (all taken from the copy and metadata):
- **"assistant":** the Linux launcher sets `GenericName=Assistant` and `Keywords=assistant;agents;tasks;week;standup;` (`desktop.mjs:186-189`).
- **"the orb"** (`site/index.html:131`, `:136`, `:149`, and throughout the README).
- **"agents" / "coding agent"** (`README.md:36`, `site/index.html:135`).
- **"weekly update" / "standup":** npm keywords include `standup` and `weekly-update` (registry.npmjs.org/symbiot); see also `README.md:3`.
- The site's own three verbs are "watches · works · asks" (`site/index.html:134-136`).

**What the name "symbiot" is meant to evoke.**
- An explicit statement: **not found**.
- The closest stated facts: the product names its features with symbiosis and biology terms. Under the heading "Named for Symbiot.": "Agents working on their own is **Symbiosis** … the guard that stops what only you do is **the membrane**; your answer going back into the same conversation is **one mind**; agents deciding what can be undone themselves is **instinct**" (`CHANGELOG.md:179`).
- The recurring phrase is "alongside you" (`site/index.html:6`, `:116`; `ui.mjs:3256`).

**Direct competitors.**
- Named anywhere in the repo or on the site: **not found**.
- These tools *are* named, but as things Symbiot works with:
  - Coding agents: "Claude Code, Codex (OpenAI), Aider, Cursor agent, Gemini CLI" (`README.md:409-410`).
  - Editors: "VS Code, Cursor, Windsurf, Zed, Sublime" (`README.md:424`).
  - Orca (`README.md:419`).
  - Apps it reads: Gmail, Notion, LinkedIn, WhatsApp, Jira & Confluence, Linear, Asana, Trello, Google Drive (`README.md:430`, `:736`).

*INFERENCE (not stated in any file):* in a dock, taskbar or app menu, the icon will most likely sit beside Claude / Claude Code, Cursor, VS Code, Windsurf, Zed, ChatGPT/Codex and Orca, plus mail and chat apps. The closest product category is "AI assistant / agent manager for developers".

---

## 2. Existing visual identity

### 2.1 Two identities exist side by side

| Identity | Where it is used today | Core colours |
|---|---|---|
| **Old "green dot"**: a glowing green status dot on dark teal ink | Base `:root` CSS tokens (`ui.mjs:12`); the header `.dot`, still shown top left in the app (`ui.mjs:387`, `:1056`); the Android launcher and notification icon (`android/res/drawable/ic_symbiot.xml`); the Android native "Starting Symbiot…" page (`android/src/co/symbiot/app/MainActivity.java:247-254`); `symbiot-desktop` on `origin/main` (a plain green disc) and on branch `symbiot/7-tasks-2026-10-05` (green dot with an orbiting companion dot, drawn by `scripts/make-icons.py`) | `#0E1A1F` ink, `#3DDC97` green, `#F4F1EA` bone |
| **Current "liquid orb"**: a black liquid-metal sphere with a rose rim and an amber glow, in three looks | The Home liquid (WebGL); `icon.svg` / `site/icon.svg` (identical files); `icon.ico`; the window favicon; the Linux app-menu icon; the website hero; the desktop app's icons (`desktop/assets/`) | Ferrofluid near-blacks `#030304`–`#3A3D44`, rim `#B0466E`, glow/amber `#F2A541`, bone `#F3F0EA` |

### 2.2 Looks: every look and what it changes

**The looks.**
- There are three: `ferro` ("Ferrofluid", the default), `glass` ("Glass") and `pearl` ("Pearl"). No other look exists in the code.
- They are switched with the radio group `#lqlook` in the header, in the order Glass · Ferrofluid · Pearl (`ui.mjs:1056`).
- The choice is stored in `localStorage['symbiot-look']` and saved to the config as `look` via `POST /api/look` (`ui.mjs:2688-2689`, `server.mjs:429`).
- How the copy describes them: "Ferrofluid (glossy black liquid metal, lit like a studio), Glass (clear droplets that bend the colours behind them) and Pearl (silver lit like a product photo)" (`CHANGELOG.md:270`, `README.md:607-610`).

**What a look changes** (`lqTheme()` at `ui.mjs:2690-2697`, `lqDraw` at `ui.mjs:3194`):
1. **Body classes:** `lq-look-<look>`, plus `lq-light` for **glass and pearl**. The code is `th.light = look !== 'ferro'`, so Ferrofluid is the only dark look.
2. **CSS custom properties:** see 2.3.
3. **The WebGL shader branch** `uStyle`: glass = 0, ferro = 1, pearl = 2 (see 2.6).
4. **The `#liquid` background:** ferro `#08090B`, glass `#EBEEF0`, pearl `#EDECE9` (`ui.mjs:20-22`).
5. **The window title-bar colour** (`<meta name="theme-color">`): ferro `#08090B`, glass `#E9ECEE`, pearl `#ECEBE8`, and `Canvas` under forced colours (`ui.mjs:2695`).
6. **The favicon / window icon and the onboarding orb image,** via `/favicon.svg?look=…` (`ui.mjs:3319`, `:3256`).
7. **The Linux app-menu icon file** (`desktop.mjs:179-183`).
8. **Pearl only:**
   - chrome-gradient buttons
   - a dark user chat bubble
   - a pearl "plate" behind the core orb's words

   Sources: `ui.mjs:62-64`, `:78`, `:100`, `:107`, `:172`, `:221`, `:269`, `:300`.

**Variants that change colours but are not looks.** Each is driven by the OS:
- `lq-contrast`: from `prefers-contrast: more`.
- `lq-solid`: from `prefers-reduced-transparency`, or turned on by contrast.
- `lq-forced`: from `forced-colors: active`. It hides the WebGL canvas.
- **Night** (22:00–06:00 local time): dims the liquid.

### 2.3 CSS custom properties (exact values; `ui.mjs:12`, `:15-18`)

| Token | `:root` (base = old green identity) | `body.lq-look-ferro` | `body.lq-light` (Glass and Pearl) | `body.lq-contrast` | `body.lq-light.lq-contrast` |
|---|---|---|---|---|---|
| `--ink` (page bg) | `#0E1A1F` | `#0B0C0E` | `#F4F6F9` | – | – |
| `--ink2` | `#15262C` | `#131518` | `#FFFFFF` | – | – |
| `--ink3` | `#1D333A` | `#1B1E22` | `#EDF0F4` | – | – |
| `--line` | `#24404A` | `#2A2E34` | `#D3D9E2` | `#9FB3BB` | `#4A5565` |
| `--bone` (headings) | `#F4F1EA` | `#F3F0EA` | `#0F1720` | – | – |
| `--text` | `#B7C9C4` | `#C9CDD3` | `#2B3644` | – | `#10151C` |
| `--faint` | `#7E9690` | `#8A919B` | `#5C6878` | `#C9D6D2` | `#2B3644` |
| `--green` | `#3DDC97` | (inherits `#3DDC97`) | `#0B7A55` | – | – |
| `--amber` | `#F2A541` | (inherits `#F2A541`) | `#9A5200` | – | – |
| `--green-dim` | `#16322D` | `#17241F` | `#DDF2E9` | – | – |
| `--sans` | `'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif` | | | | |

Glass and Pearl share every CSS token. They differ only in four places: the liquid shader, the liquid background, theme-color, and Pearl's chrome controls.

### 2.4 Every other hex colour in the app's CSS (`ui.mjs` `<style>`, lines 10–1030)

The colours are grouped by role. `[n]` is the number of rules that use the colour.

**Liquid surfaces and backgrounds**
- `#08090B`: Ferrofluid liquid, Map and stream background; also the default `theme-color` (`ui.mjs:8`).
- `#EBEEF0`: Glass liquid, Map and stream background.
- `#EDECE9`: Pearl liquid, Map and stream background.
- `#05070A`: opaque ("solid") droplet and glass panels in the dark look.
- `#15171B`: onboarding footer (dark).
- `#F6F8FB`: work box (light).
- `#F2F4F8`: end of the light card gradient.

**Text and ink**
- `#F3F0EA` [18]: Ferrofluid "bone". Used for the core orb's words (`#lqcore`), the send button, the active look pill and the main buttons (`button.act`).
- `#ECE9E4` [16]: droplet labels, chat text and talk-bar text in the dark look.
- `#151A21` [35]: the main dark ink in the light looks (labels, send-button background, active pills).
- `#0A0B0D` [13]: text on bone-coloured buttons.
- `#1B1E23`: Pearl chrome-button text and the Pearl user-bubble background. `#F4F4F2` is the Pearl user-bubble text.
- **Dark-look greys:** `#C9CDD3`, `#8A919B` [25], `#A1A8B1`, `#9AA1AB`, `#7A818B` (placeholder text).
- **Light-look greys:** `#5A6470` [12], `#4A5565`, `#2B3644`, `#2E3743`, `#3B4656`, `#6A7480` (placeholder text), `#10151C`, `#0F1720`.
- `#C9D1DC`: group headings (dark look).

**Accent colours**
- `#F2A541` [19]: **amber = "needs you"**. Used on lit droplet dots, amber orbiting spheres, the mic when it's on, and pulses (`ui.mjs:40`, `:200`, `:309`, `:537`, `:974`).
- `#9A5200`, `#A85F0A`, `#B86A0C`: amber in the light looks.
- `#3DDC97`: the base green. It still colours the header `.dot` and the `#lqgo.on::before` dot.
- `#0B7A55`: green in the light looks.
- `#2A6B52`: green for tag and chip borders.
- `#4FBE8C`, `#06120C`: onboarding "ok" ticks.

**Silver and chrome (the "liquid silver" family)**
- **Silver sphere gradient:** `#FFFFFF → #C9CFD9 → #6F7887 → #2A2F38`. Used for the orbiting spheres (`.lqorbit i`), the agent status orb (`.orb`) and the Map nodes (`lqsilver`) (`ui.mjs:199`, `:368`, `:1362`).
- **Chrome button** (`.lqd .lgo`): `#FFFFFF 0% → #D2D8E1 44% → #8E97A6 56% → #E6EAF0 100%`, text `#06080B` (`ui.mjs:37`).
- **Pearl chrome:** `#FFFFFF 0% → #F1F2F5 60% → #E6E9EE 100%`, text `#1B1E23` (`ui.mjs:78`).
- **Checkbox and bead silvers:** dark `#5B626D`, `#121418`; light `#E3E6EA`, `#9BA2AC`, `#3A3F46`.
- **Other silvers:** `#EEF2F8`, `#8E97A6`, `#8C96A6`, `#5E656F`.

**Status colours**
- **Error / fail:**
  - `#FF8A75`
  - the fail sphere `#FFE1DA → #FF8A75 → #7A2A1C` (`ui.mjs:369`)
  - `#E5695B` (fail dot)
  - `#E5484D` (urgent red dot, `ui.mjs:151`)
- **"Asks you" sphere:** `#FFF4E2 → #F2A541 → #7A4A10` (`ui.mjs:200`).

**Third-party look-alikes in reply and post previews (not Symbiot's brand)**
- `#0A66C2`: LinkedIn blue.
- `#D9FDD3`, `#111B21`, `#1F7A4C`: WhatsApp.
- `#202124`, `#DADCE0`, `#5F6368`: Gmail.
- `#E0DFDC`, `#191919`, `#F3F2EF`: LinkedIn post.

**Map node colours (JS, `ui.mjs:1268`)**
- `person #3DDC97`, `repo #F4F1EA`, `lang #F2A541`, `tool #6bb3ff`, `agent #c58af9`, `ai #5fe3b0`, `folder #b7a98c`.

**Recurring translucent values (glass panels)**
- **Dark:** `rgba(4,5,8,.78)`, `rgba(6,8,11,.86)`, `rgba(255,255,255,.055)`, with borders `rgba(220,228,240,.12–.35)`.
- **Light:** `rgba(255,255,255,.62–.94)`, with borders `rgba(20,30,45,.1–.25)`.
- **Blur:** `backdrop-filter: blur(12–20px)` (`ui.mjs:65-70`, `:164-165`).

### 2.5 Colours that come live from the OS (`lqTheme`, `ui.mjs:2690-2697`, verbatim)

```js
function lqTheme(){var look=lqLookGet();var th={look:look,light:look!=='ferro',contrast:lqMM('(prefers-contrast: more)'),forced:lqMM('(forced-colors: active)'),solid:lqMM('(prefers-reduced-transparency: reduce)'),still:lqMM('(prefers-reduced-motion: reduce)'),wide:lqMM('(color-gamut: p3)'),night:false,accent:null};
var h=new Date().getHours();th.night=h>=22||h<6;
try{if(document.createElement&&typeof getComputedStyle==='function'&&document.body&&document.body.appendChild){var a=document.createElement('span'),b=document.createElement('span');a.style.color='AccentColor';b.style.color='CanvasText';document.body.appendChild(a);document.body.appendChild(b);
if(a.style.color){var ca=getComputedStyle(a).color,cb=getComputedStyle(b).color;if(ca&&ca!==cb){var m=ca.match(/[0-9.]+/g);if(m&&m.length>=3)th.accent=[m[0]/255,m[1]/255,m[2]/255];}}a.remove();b.remove();}}catch(e){}
// the window's own bar takes the look's colour, so it reads as part of the app, not a frame round it
var tc=document.getElementById('themecolor');if(tc&&tc.setAttribute)tc.setAttribute('content',th.forced?'Canvas':look==='pearl'?'#ECEBE8':look==='glass'?'#E9ECEE':'#08090B');
var bd=document.body;if(bd&&bd.classList){bd.classList.toggle('lq-light',th.light);['ferro','glass','pearl'].forEach(function(l){bd.classList.toggle('lq-look-'+l,l===look);});bd.classList.toggle('lq-contrast',th.contrast);bd.classList.toggle('lq-solid',th.solid||th.contrast);bd.classList.toggle('lq-forced',th.forced);}
LQ.theme=th;return th;}
```

What each OS signal does:
- **Light/dark: not taken from the OS.**
  - `light` is set by the look (`look !== 'ferro'`).
  - A `prefers-color-scheme: light` listener exists (`ui.mjs:3321`), but it only re-runs `lqTheme`, which ignores the OS scheme.
  - The README says the colours follow "light or dark" from the system (`README.md:708-710`), but the code above decides it from the look.
- **High contrast** (`prefers-contrast: more`):
  - Turns on `lq-contrast` and `lq-solid`: the CSS overrides in 2.3, with opaque panels.
  - In the shader, `uContrast = 1` draws a ~2 px outline round the liquid: white in Ferrofluid, black in Glass and Pearl.
- **Reduced transparency:** turns on `lq-solid`, which gives opaque `#05070A` / `#FFFFFF` panels with no blur (`ui.mjs:56-57`).
- **Forced colours:**
  - Turns on `lq-forced`, which hides the WebGL canvas (`ui.mjs:24`).
  - `theme-color` becomes `Canvas`.
- **Reduced motion:** sets `th.still`. The liquid stops "breathing" and the CSS animations stop (`ui.mjs:202`, `:381`).
- **Accent colour: read, but not used.**
  - The CSS system colour `AccentColor` is read into `th.accent` as an RGB triplet.
  - Nothing else in `ui.mjs` reads `th.accent`; a grep finds only the assignment.
  - So the OS accent colour currently changes nothing.
- **Night** (22:00–06:00 local time):
  - Sets `uExposure = 0.82`.
  - The shader does `col *= mix(1.0, uExposure, 0.5)`, so the liquid is drawn at 91 % brightness.
  - It is re-checked every 30 s (`ui.mjs:3345`).
- **Wide gamut** (`color-gamut: p3`): read into `th.wide`, but not used.

### 2.6 How the Home orb / liquid is rendered

**Technique.**
- A full-screen WebGL 1 fragment shader draws a 2-D **metaball field**: Σ r²/d², with the surface where the sum is 1.
- The field is made of up to 32 balls: the core orb, the section droplets, tendrils, the liquid lines out to blobs, and a bulge toward the pointer.
- The balls are shaded per look: chrome/studio lighting (Ferrofluid), refraction (Glass) or mirror (Pearl) (`ui.mjs:3114-3154`).
- The canvas is `#lq` (`position:absolute; inset:0`), inside the fixed `#liquid` element (`ui.mjs:19-23`). The context is created with `antialias:false, alpha:false` (`ui.mjs:3166`).
- There is no SVG or CSS orb on Home.

**Size of the core orb** (`ui.mjs:2698`, `:3089`).
- Radius in CSS px = `base × s`, where `s = clamp(min(viewport width, viewport height) / 860, 0.55, 1.15)`.

| Mode | When | Core radius `base` | Position |
|---|---|---|---|
| `aware` (normal) | the default; after any activity | 92 | centred horizontally, at `0.47 × height` |
| `rest` (idle) | after 60 s with no activity (`LQ_REST=60000`, `ui.mjs:2686`, `:3345`); also the Away screen | 140; droplets shrink to 0.6 r and gather within 16 px of the centre; labels hide | centre |
| `talk` | the chat is open | 54 + 30 × talkWeight (talkWeight defaults to 0.35 and is learned in `adapt.mjs`) | bottom (`height − 44`) |
| `pool` | a panel is open over the liquid | 50; droplets line up along the bottom at 13 px each | centre |

- **Example:** on a 1920×1080 window, s = 1.15. The aware radius is then ≈ 106 px (≈ 212 px across) and the rest radius ≈ 161 px.
- **Easing:** the core moves 6 % of the way to its target position per frame, and its radius 5 % per frame.
- **Droplets** move as critically damped springs with k = 0.022 (`ui.mjs:3087-3099`).

**Breathing and animation** (`lqDraw`, `ui.mjs:3175-3195`).
- **Drift:** each ball's centre drifts ±0.4 % of the width and ±0.5 % of the height, on sines at 1.3 and 1.1 rad/s.
- **Pulse:** each ball's radius pulses ±3.5 % at 2 rad/s.
- **Weights:** both effects are weighted 1 for the core, 0.3 for droplets, and a per-droplet `live` value for agents at work.
- **Field waves:** the whole field is also modulated by slow waves of 2.5 % and 1.2 % (`field()` in the shader).
- **Ripple:** a ring spreads from a point at 300 px/s for 4 s. It fires on a droplet click, a look change and a chat answer (`ui.mjs:2689`, `:2900`, `:2905`, `:3084`).
- **Low-power mode:** with reduced motion, or a software renderer (SwiftShader, llvmpipe), the liquid draws at a 0.34 pixel ratio, without breathing, and only when something has moved (`ui.mjs:3156-3165`, `:3192`).

**Behaviour per state**
- **Idle:**
  - This is the `rest` mode above: one large orb.
  - The core text sits under it: "All handled", or the counts (`ui.mjs:3112`).
- **Thinking** (waiting for a chat answer):
  - The orb itself has no thinking state (**not found**).
  - The chat shows "Thinking: recalling what it knows, reading what's here…" with a silver shimmer on the text (`.thinking`: a `#8C96A6`/`#FFFFFF` gradient on a 2.2 s loop) (`ui.mjs:3005`, `:379`).
  - When the answer arrives, a ripple starts from (0.5, 0.47).
- **Working** (agents at work):
  - The core orb doesn't change (**not found**).
  - Each running agent's droplet gets three small silver spheres orbiting it (`.lqorbit`). They are 10 px, with periods of 3.4 s, 4.6 s and 5.8 s (the third orbits in reverse), and turn amber if that run is asking something (`ui.mjs:195-202`).
  - The core text reads like "2 at work · 1 waiting" (`ui.mjs:2642`).
  - In panels, the agent status `.orb` (14 px, silver) pulses from scale 1 to 1.18 over 1.6 s (`ui.mjs:368-370`).
- **Needs you:**
  - Droplets for "only you" items and asks are tinted amber inside the shader (ball weight `w = 1`):
    - Ferrofluid adds `amb = vec3(0.95,0.62,0.22)` = `#F29E38` toward the rim.
    - Glass multiplies the refracted colour by `(1.08,0.86,0.62)`.
    - Pearl multiplies its colour by `(1.1,0.86,0.6)`.
  - Lit lane droplets also get a 7 px `#F2A541` dot with a 3 px `rgba(242,165,65,.2)` halo (`ui.mjs:40`).
  - The site says "When something needs you, the orb glows amber" (`site/index.html:136`).
- **Error:**
  - The core orb has no error state (**not found**).
  - Urgent blobs get a `#E5484D` dot and an `rgba(229,72,77,.7)` border (`ui.mjs:150-151`).
  - Failed agent `.orb`s use `#FFE1DA → #FF8A75 → #7A2A1C` (`ui.mjs:369`).

**Shader colours, vec3 → hex** (sRGB, rounded; the multipliers listed above are not colours)

| Look | Role | vec3 | Hex |
|---|---|---|---|
| Glass | background base | `0.918,0.927,0.936` | `#EAECEF` |
| Glass | drifting colour blob A (teal) | `0.56,0.79,0.80` | `#8FC9CC` |
| Glass | drifting colour blob B (peach) | `0.98,0.79,0.60` | `#FAC999` |
| Glass | drifting colour blob E (periwinkle) | `0.72,0.76,0.93` | `#B8C2ED` |
| Glass | refraction tint | `0.985,0.995,1.0` | `#FBFEFF` |
| Glass | soft fill light | `1.0,0.97,0.92` | `#FFF7EB` |
| Glass | background dot grid | every 22 px, darkened by 0.07 | – |
| Ferrofluid | background base | `0.03,0.034,0.04` | `#08090A` |
| Ferrofluid | background glow peak, near the top (base + 0.045) | `0.075,0.079,0.085` | `#131416` |
| Ferrofluid | shadow under drops | `0.025,0.026,0.03` | `#060708` |
| Ferrofluid | ripple tint | `0.5,0.55,0.62` | `#808C9E` |
| Ferrofluid | metal base | `0.010,0.011,0.013` | `#030303` |
| Ferrofluid | key softbox reflection (upper left) | `1.0,0.99,0.97` | `#FFFCF7` |
| Ferrofluid | strip light (right) | `0.85,0.9,1.0` | `#D9E6FF` |
| Ferrofluid | floor bounce (bottom) | `0.6,0.5,0.4` | `#998066` |
| Ferrofluid | edge lift | `0.06` | `#0F0F0F` |
| Ferrofluid | amber "needs you" | `0.95,0.62,0.22` | `#F29E38` |
| Ferrofluid | iridescent rim | cosine palette `0.5+0.5·cos(2π·((0,0.33,0.67)+x))`, × 0.22 | (varies) |
| Pearl | background base | `0.929,0.925,0.917` | `#EDECEA` |
| Pearl | shadow under drops | `0.13,0.13,0.12` | `#21211F` |
| Pearl | sky reflection (top) | `0.96,0.965,0.97` | `#F5F6F7` |
| Pearl | horizon / underside | `0.36,0.38,0.42` | `#5C616B` |
| Pearl | ground bounce | `0.62,0.6,0.57` | `#9E9991` |

**Shader source, verbatim** (`ui.mjs:3114-3154`)

```js
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
```

**Per-frame ball positions and breathing, and uniforms, verbatim** (`ui.mjs:3175-3180`, `:3192-3195`)

```js
function lqDraw(G){var gl=G.gl,c=G.c,S=lqSize(),d=glDpr(3),W=Math.max(1,Math.floor(S.w*d)),H=Math.max(1,Math.floor(S.h*d));
if(c.width!==W||c.height!==H){c.width=W;c.height=H;gl.viewport(0,0,W,H);}
var now=(window.performance&&performance.now)?performance.now():Date.now(),t=(now-G.t0)/1000,th=LQ.theme,slow=GLSOFT||GLSTILL,still=th.still||slow,o=G.out;LQ.t=t;
for(var i=0;i<o.length;i++)o[i]=0;var NB=o.length/4;
var put=function(k,x,y,r,a,lv){if(k>NB-1)return;var w=still?0:(k===0?1:lv!=null?lv:0.3);o[k*4]=x/S.w+Math.sin(t*1.3+k*1.7)*0.004*w;o[k*4+1]=y/S.h+Math.cos(t*1.1+k*2.3)*0.005*w;o[k*4+2]=Math.max(0,r)*(1+0.035*Math.sin(t*2.0+k)*w);o[k*4+3]=a||0;};
put(0,LQ.core.x,LQ.core.y,LQ.core.cr);var k=1,tend=[];
// ... (tendrils, liquid lines, pointer bulge) ...
if(slow){var sig=W+'|'+H+'|'+th.look+th.night+th.contrast;for(var q=0;q<o.length;q++)sig+=','+Math.round(o[q]*400);if(sig===G.sig)return;G.sig=sig;}
var U=G.U;gl.uniform2f(U.uRes,W,H);gl.uniform1f(U.uT,slow?0:t);gl.uniform1f(U.uDpr,d);gl.uniform4fv(U.uB,o);gl.uniform3f(U.uRip,LQ.ripple[0],LQ.ripple[1],still?-10:LQ.ripple[2]);
gl.uniform1f(U.uStyle,th.look==='glass'?0:th.look==='pearl'?2:1);gl.uniform1f(U.uContrast,th.contrast?1:0);gl.uniform1f(U.uExposure,th.night?0.82:1);
gl.drawArrays(gl.TRIANGLES,0,3);}
```

**Core size per mode, verbatim** (`ui.mjs:3087-3090`)

```js
function lqStep(){var S0=lqSize();if(S0.w!==LQ.bw||S0.h!==LQ.bh){if(LQ.scene==='work'&&LQ.workData)lqBuildWork();else if(LQ.adapt)lqBuild();}var S=S0,cx=S.w/2,cy=(LQ.scene!=='work'&&LQ.cy)||S.h*0.47,k=0.022,c=2*Math.sqrt(k),th=LQ.theme,still=th.still,rest=LQ.mode==='rest',pool=LQ.mode==='pool',talk=LQ.talking&&!pool;
if(AWAY){LQ.mode='rest';rest=true;pool=false;talk=false;var ap=lqAwayPos(S);cx=ap.x;cy=ap.y;} // away: the orb at rest, where the bounce has it
var core=LQ.core,ctx=cx,cty=talk?S.h-44:cy,ctr=(rest?140:pool?50:talk?54+30*(LQ.talkWeight||0.35):92)*S.s;
if(!core.x){core.x=cx;core.y=cy;}core.x+=(ctx-core.x)*(still?1:0.06);core.y+=(cty-core.y)*(still?1:0.06);core.cr+=(ctr-core.cr)*(still?1:0.05);
```

**Orbiting "at work" spheres and the agent status orb, verbatim** (`ui.mjs:195-202`, `:368-370`)

```css
.lqorbit{position:absolute;left:0;top:0;pointer-events:none;transition:opacity .5s ease}
.lqorbit span{position:absolute;inset:0;animation:lqorbit 3.4s linear infinite}
.lqorbit span:nth-child(2){animation-duration:4.6s;animation-delay:-1.6s}
.lqorbit span:nth-child(3){animation-duration:5.8s;animation-delay:-3.9s;animation-direction:reverse}
.lqorbit i{position:absolute;left:50%;top:0;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFFFFF 0%,#C9CFD9 35%,#6F7887 75%,#2A2F38 100%);box-shadow:0 0 8px rgba(255,255,255,.35)}
.lqorbit.ask i{background:radial-gradient(circle at 35% 30%,#FFF4E2 0%,#F2A541 50%,#7A4A10 100%)}
@keyframes lqorbit{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.lqorbit span{animation:none}.lqorbit span:nth-child(2){transform:rotate(120deg)}.lqorbit span:nth-child(3){transform:rotate(240deg)}}
.orb{flex:none;display:inline-block;width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFFFFF 0%,#C9CFD9 30%,#6F7887 70%,#2A2F38 100%);box-shadow:0 0 0 1px rgba(255,255,255,.25)}
.orb.run{animation:lqpulse 1.6s ease-in-out infinite}.orb.fail{background:radial-gradient(circle at 35% 30%,#FFE1DA 0%,#FF8A75 45%,#7A2A1C 100%)}
@keyframes lqpulse{0%,100%{transform:scale(1);box-shadow:0 0 0 1px rgba(255,255,255,.25)}50%{transform:scale(1.18);box-shadow:0 0 14px 2px rgba(255,255,255,.35)}}
```

**App header brand mark, verbatim** (`ui.mjs:386-388`, `:120`, `:1056`)

What it shows:
- a 10 px green glowing dot,
- then the name.

On Home ("liquid" mode) the name reads **SYMBIOT**: uppercase, weight 500, letter-spacing 0.38em, 16 px.

```css
header{padding:16px 18px 10px;display:flex;align-items:center;gap:10px}
.dot{width:10px;height:10px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green)}
.brand{font-weight:700;color:var(--bone);font-size:16px}
body.lq-liquid header .brand{letter-spacing:.38em;font-weight:500;text-transform:uppercase}
```

```html
<header><span class="dot"></span><span class="brand">Symbiot</span><span class="ver" id="ver"></span><span id="lqlook" role="radiogroup" aria-label="Look"><button type="button" role="radio" data-look="glass" aria-checked="false">Glass</button><button type="button" role="radio" data-look="ferro" aria-checked="true">Ferrofluid</button><button type="button" role="radio" data-look="pearl" aria-checked="false">Pearl</button></span><span class="status" id="status">...</span></header>
```

**Website hero orb, verbatim** (`site/index.html:48-57`)

This is a separate CSS rendition:
- dark by default,
- pearl-like under `prefers-color-scheme: light`,
- it floats up and down 10 px on a 9 s loop.

```css
.orb{position:relative;width:min(300px,64vw);aspect-ratio:1;margin:0 auto 42px;border-radius:50%;
  background:radial-gradient(circle at 38% 32%,#4A4E57 0,#17181C 34%,#050506 70%);
  box-shadow:0 0 0 1.5px rgba(176,70,110,.45),0 0 90px 10px rgba(242,165,65,.10),0 40px 80px -30px rgba(0,0,0,.9);
  animation:float 9s ease-in-out infinite}
.orb::before{content:"";position:absolute;left:18%;top:15%;width:34%;height:19%;border-radius:50%;transform:rotate(-28deg);background:linear-gradient(#fff,rgba(255,255,255,0));opacity:.8;filter:blur(1px)}
.orb::after{content:"";position:absolute;right:18%;bottom:17%;width:22%;height:5%;border-radius:50%;transform:rotate(-30deg);background:#fff;opacity:.10}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]) .orb{background:radial-gradient(circle at 38% 32%,#FFFFFF 0,#ECE7DF 40%,#A99F92 100%);box-shadow:0 0 0 1.5px rgba(201,164,106,.5),0 0 90px 10px rgba(242,165,65,.12),0 40px 80px -30px rgba(80,60,40,.45)}}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]) .dot{background:radial-gradient(circle at 38% 32%,#FFFFFF 0,#ECE7DF 45%,#A99F92 100%);box-shadow:0 0 0 1px rgba(201,164,106,.5)}:root:not([data-theme="dark"]) .dot.amber{box-shadow:0 0 0 1.5px var(--amber),0 0 18px rgba(242,165,65,.35)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@media (prefers-reduced-motion: reduce){.orb{animation:none}html{scroll-behavior:auto}}
```

The website's feature-card dots are 38 px, in the same orb style (`site/index.html:74-75`):

```css
.dot{width:38px;height:38px;border-radius:50%;margin-bottom:18px;background:radial-gradient(circle at 38% 32%,#55595F 0,#16171B 45%,#050506 80%);box-shadow:0 0 0 1px rgba(176,70,110,.4)}
.dot.amber{box-shadow:0 0 0 1.5px var(--amber),0 0 18px rgba(242,165,65,.35)}
```

### 2.7 Fonts

**App**
- **Typeface:** Geist Variable (weights 100–900). It ships as `fonts/Geist-Variable.woff2` and is served at `/fonts/Geist-Variable.woff2` (`ui.mjs:11`, `server.mjs:254-257`).
- **Licence:** SIL OFL 1.1, "Copyright (c) 2023 Vercel, in collaboration with basement.studio" (`fonts/Geist-OFL.txt:1-3`).
- **Fallback:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (`ui.mjs:12`).
- **Monospace:** `ui-monospace, Menlo, Consolas, monospace` (`ui.mjs:362`).
- **Weights in use:** 400, 500, 600, 650 and 700.
- **Panel titles:** 650 weight, 24 px, letter-spacing −0.02em (`#lqtitle`, `ui.mjs:131`).

**symbiot.co.za**
- **Typeface:** the same Geist Variable file (`site/fonts/Geist-Variable.woff2`, byte-identical to `fonts/`).
- **Fallback:** `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` (`site/index.html:14`, `:18`).
- **H1:** 650, `clamp(38px,6vw,64px)`, letter-spacing −0.035em (`:58`).
- **Header name "SYMBIOT":** 600, 14 px, letter-spacing 0.32em (`:34`).
- **Kicker:** 600, 12 px, letter-spacing 0.16em, uppercase, amber (`:66`).

**Android native status page**
- `-apple-system, Roboto, sans-serif` (`MainActivity.java:249`).

### 2.8 Website colour tokens (`site/index.html:15-22`)

**Dark (default)**

| Role | Colours |
|---|---|
| Backgrounds | `--bg #0B0C0E`, `--bg2 #121418` |
| Text | `--text #C9CDD3`, `--bone #F3F0EA`, `--faint #8A9099` |
| Accents | `--amber #F2A541`, `--rim #B0466E` |
| Button | `--btn #F3F0EA`, `--btnText #0B0C0E` |
| `theme-color` | `#0B0C0E` (`:8`) |

**Light** (`prefers-color-scheme: light`)

| Role | Colours |
|---|---|
| Backgrounds | `--bg #F4F2EE`, `--bg2 #EBE8E2` |
| Text | `--text #3A414C`, `--bone #11151B`, `--faint #6B7380` |
| Accent | `--amber #B86A0C` |
| Button | `--btn #11151B`, `--btnText #FFFFFF` |

**Hero orb**

| Mode | Fill | Ring | Glow |
|---|---|---|---|
| Dark | radial `#4A4E57 0 → #17181C 34% → #050506 70%` | `rgba(176,70,110,.45)` (= `#B0466E`) | `rgba(242,165,65,.10)` |
| Light | radial `#FFFFFF → #ECE7DF 40% → #A99F92` | `rgba(201,164,106,.5)` (= `#C9A46A`) | – |

### 2.9 Corner radius and shape conventions

**In the app** (`ui.mjs` CSS; counts are rules)
- **`999px` (pill), 32 rules:** every primary and ghost button on Home (`button.act`, `button.ghost`), the look switch, the talk-bar buttons, `.lqmb`, `.lqd .lgo` and chips.
- **`50%` (circle), 30 rules:** the send button `#lqsend` (40×40), the mic, status dots, orbiting spheres, the Pearl core plate and beads.
- **`12px`, 15 rules:** `#lqcore`, inputs, selects and textareas on Home, group labels (`.lqg`) and small option buttons.
- **`8px`, 14 rules:** update-bar buttons, panel chat bubbles, diffs and images.
- **`18px`, 11 rules:** an opened droplet (`.lqd.open`), the user chat bubble (`.lqmsg.me`), the Needs-you blob, `#lqnext`, the Map panel, onboarding cards, and the onboarding orb image (`.onborb`, 72×72).
- **`14px`, 10 rules:** droplet labels (`.lqd`), the ask textarea, and Home cards (`.task`, `.agent`, `.drift`).
- **`9px`, 10 rules:** older panel inputs, `.task` and `.aq`.
- **`10px`, 9 rules:** older buttons, `.agent` and `.drift`.
- **`16px`, 7 rules:** glass cards on Home (`body.lq-liquid .task/.agent/.rcard/.bcard…`), `.lmtip` and `.onbok`.
- **`20px`, 5 rules:** the talk form (`#lqform`), `.rcard`, `.whatsnew` and marketing cards.
- **`24px`:** the pooled panel sheet (`body.lq-liquid.lq-pooled main`).
- **`28px`:** the onboarding inner box (`.onbin`).
- **2–6 px:** bars, code and scrollbar thumbs.
- **One-sided radii:**
  - `0 8px 8px 0`, `0 10px 10px 0` and `0 16px 16px 0` on callouts.
  - `22px 22px 0 0` on the panel header.

**On the website**
- Cards `24px` (`site/index.html:71`).
- Buttons `999px` (`:41`).
- The terminal box `18px` and its code `8px` (`:87-88`).
- The header icon: 30×30 with an `8px` radius (`:33`).

**On the icon tiles**
- `icon.svg`: a rounded square with `rx="58"` on a 256 viewBox (22.7 % of a side). It fills the whole canvas, with no inset.
- `symbiot-desktop/scripts/make-icons.py` (old art): a rounded square inset 100/1024, giving an 824 px body ("macOS's icon grid"), with a corner radius of 185/1024.
- Android `ic_symbiot.xml`: a full circle 100 dp across, on a 108 dp canvas.

---

## 3. Every place the icon appears

### 3.0 Icon files that exist today

Sizes were checked with `file`, `identify`, and a node script that reads the ICO/ICNS headers.

| File | Format and pixel sizes | Artwork |
|---|---|---|
| `icon.svg` (= `site/icon.svg`, byte-identical) | SVG, viewBox 256×256 | The Ferrofluid orb on a dark rounded square (verbatim below) |
| `icon.ico` (150 754 B) | ICO with 7 images: 16, 24, 32, 48, 64 and 128 as 32-bit BMP with alpha, plus 256 as PNG RGBA. Corners are transparent; the art fills 256×256 edge to edge | The Ferrofluid orb (a raster of `icon.svg`) |
| `android/res/drawable/ic_symbiot.xml` | Android VectorDrawable, 108×108 dp | **Old art:** a dark `#0E1A1F` circle (r = 50 dp) with a green `#3DDC97` disc (r = 24 dp). The file's comment reads "Symbiot's green dot on its dark ink, as in the app's header" |
| `symbiot-desktop/assets/`, branch `symbiot/7-tasks-2026-10-05` (checked out) | `icon.png` 512×512 RGBA (opaque body 412×412 at +50+50). `icon.icns` with PNG entries ic07 128, ic08 256, ic09 512, ic10 1024, ic11 32, ic12 64, ic13 256 and ic14 512; **no 16×16 @1x entry**. `icon.ico`, 7 PNG images, 16–256. `tray.png` 32×32. `trayTemplate.png` 16×16. `trayTemplate@2x.png` 32×32 | **Old art:** a green `#3DDC97` dot with a glow, a green orbit ring at alpha 90, and a bone `#F4F1EA` companion dot at 45° upper right, on a rounded square with an `#15262C → #0E1A1F` gradient and an `#24404A` edge. The tray versions are the same mark without the tile: green, or black for the template |
| `symbiot-desktop`, `origin/main` | `icon.png` 512×512, `tray.png` 32×32, `trayTemplate.png` 32×32 | **Older still:** a plain green disc |
| `desktop/assets/` on `main` of the `symbiot` repo (the desktop app, moved in from `symbiot-desktop` by PR #149, merged 2026-10-09) | `icon.png` 1024×1024 RGBA (full bleed, transparent corners). `icon.ico`, byte-identical to `symbiot/icon.ico`. `tray.png` 32×32 RGBA (the orb on its tile). `trayTemplate.png` 16×16 and `trayTemplate@2x.png` 32×32, grey with alpha (a solid black disc) | The Ferrofluid orb |

**`icon.svg`, verbatim**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <title>Symbiot</title>
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%">
      <stop offset="0" stop-color="#1B1D22"/>
      <stop offset="1" stop-color="#08090B"/>
    </radialGradient>
    <radialGradient id="orb" cx="40%" cy="34%" r="66%">
      <stop offset="0" stop-color="#3A3D44"/>
      <stop offset="0.45" stop-color="#121317"/>
      <stop offset="1" stop-color="#030304"/>
    </radialGradient>
    <radialGradient id="rim" cx="50%" cy="50%" r="50%">
      <stop offset="0.86" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.97" stop-color="#B0466E" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#F2A541" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="56%" r="50%">
      <stop offset="0.55" stop-color="#F2A541" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#F2A541" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="58" fill="url(#bg)"/>
  <circle cx="128" cy="136" r="96" fill="url(#glow)"/>
  <circle cx="128" cy="128" r="78" fill="url(#orb)"/>
  <circle cx="128" cy="128" r="78" fill="url(#rim)"/>
  <ellipse cx="102" cy="92" rx="30" ry="17" transform="rotate(-28 102 92)" fill="url(#shine)"/>
  <ellipse cx="160" cy="176" rx="22" ry="5" transform="rotate(-30 160 176)" fill="#FFFFFF" opacity="0.12"/>
</svg>
```

**How the look variants are made.** The stop colours above are swapped by string replacement (`desktop.mjs:164-178`, verbatim):

```js
// The orb in each look: Ferrofluid (icon.svg, dark), Glass (clear, on a cool light
// ground) and Pearl (white pearl, on a warm light ground). The app menu's icon and
// the window's follow the look you pick (setLauncherLook).
const LOOK_COLOURS = {
  glass: { bg: ["#F4F7FB", "#D9E1EC"], orb: ["#FFFFFF", "#C9D6E6", "#7F93AE"], rim: "#5B8DEF", glow: "#5B8DEF" },
  pearl: { bg: ["#F7F4EE", "#E6E0D5"], orb: ["#FFFFFF", "#ECE7DF", "#A99F92"], rim: "#C9A46A", glow: "#F2A541" },
};
function iconSvg(look = "ferro") {
  const base = readFileSync(ICON_SRC, "utf8"), c = LOOK_COLOURS[look];
  if (!c) return base;
  return base.replace('stop-color="#1B1D22"', `stop-color="${c.bg[0]}"`).replace('stop-color="#08090B"', `stop-color="${c.bg[1]}"`)
    .replace('stop-color="#3A3D44"', `stop-color="${c.orb[0]}"`).replace('stop-color="#121317"', `stop-color="${c.orb[1]}"`).replace('stop-color="#030304"', `stop-color="${c.orb[2]}"`)
    .replace('stop-color="#B0466E" stop-opacity="0.55"', `stop-color="${c.rim}" stop-opacity="0.45"`)
    .replace(/stop-color="#F2A541" stop-opacity="0\.16"/, `stop-color="${c.glow}" stop-opacity="0.18"`);
}
```

**The resulting app icon per look**

| Look | Tile background | Orb gradient | Rim | Glow | Specular |
|---|---|---|---|---|---|
| Ferrofluid | `#1B1D22 → #08090B` | `#3A3D44 → #121317 → #030304` | `#B0466E` @ .55 | `#F2A541` @ .16 | white |
| Glass | `#F4F7FB → #D9E1EC` | `#FFFFFF → #C9D6E6 → #7F93AE` | `#5B8DEF` | `#5B8DEF` | – |
| Pearl | `#F7F4EE → #E6E0D5` | `#FFFFFF → #ECE7DF → #A99F92` | `#C9A46A` | `#F2A541` | – |

**Is the in-app orb the same artwork as the app icon? No.**
- **The app icon** (`icon.svg` / `icon.ico`) is a static SVG sphere:
  - radial gradients, one rim ring, one glow and two specular ellipses,
  - on a rounded-square tile.
- **The in-app orb** is the live WebGL metaball (2.6):
  - no tile,
  - studio reflections and an iridescent rim,
  - it merges with the droplets.
- **What they share** is a palette idea: a near-black sphere, a white highlight at upper left, and amber.
- **The rim colour differs.** The icon's rose rim `#B0466E` appears nowhere in `ui.mjs`.
- **There are more renditions:**
  - The website hero orb is a third one, in CSS, and it does use `#B0466E`.
  - The header's green `.dot` and the Android icon are the older green identity.

### 3.1 Windows: `.ico`, Start menu, desktop, taskbar, tray

**What the platform requires**
- **App icon** (https://learn.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-construction, https://learn.microsoft.com/en-us/windows/win32/uxguide/vis-icons):
  - An `.ico` containing at least 16, 24, 32, 48 and 256 px.
  - Microsoft's full list: 16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96 and 256.
  - 32-bit with alpha. Transparency is allowed.
- **Where it shows:**
  - The Start menu and desktop shortcuts use 16–256 px, depending on the display scale and view.
  - The taskbar uses 24 px at 100 % scaling, and larger sizes at higher DPI.
  - It sits on the user's Start, taskbar or desktop colour: dark or light, Mica/acrylic, or a wallpaper.
- **Tray (notification area)** (https://learn.microsoft.com/en-us/windows/win32/shell/notification-area):
  - It uses the small-icon metric: 16×16 at 100 %, scaling with DPI.
  - It sits on the taskbar colour.
- **electron-builder:** needs `icon.ico` (or a PNG) of at least 256×256 (https://www.electron.build/icons).

**What exists today**
- **npm install** (`postinstall.mjs` → `installWindows`, `desktop.mjs:201-242`):
  - It copies `icon.ico` to `%APPDATA%\Symbiot\symbiot.ico` (`desktop.mjs:232`).
  - It makes `Symbiot.lnk` in the Start menu (`…\Start Menu\Programs\`) and on the desktop, with `IconLocation = symbiot.ico,0`.
  - This is the Ferrofluid art only; it does not follow the look.
- **Window / taskbar:**
  - The window is a Chrome or Edge `--app` window.
  - Its icon is the page favicon, `/favicon.svg?look=…`. The code comment says: "the window's own icon (its taskbar entry), the same orb as the app menu's" (`server.mjs:247`).
- **Tray (npm version):** none. There is no system-tray code in the `symbiot` repo.
- **Installer app** (`desktop/package.json` `build`, on `main` since PR #149):
  - electron-builder uses `win.icon = assets/icon.ico` (the Ferrofluid orb).
  - The installer is an NSIS one-click installer (`oneClick: true`) that makes desktop and Start-menu shortcuts named "Symbiot"; the file is `Symbiot-Setup.exe`.
  - The tray icon is `assets/tray.png`, 32×32: the orb on its dark tile (`desktop/main.js:41`).
- **symbiot-desktop committed branches:** old green art.
  - The `symbiot/7-tasks` branch uses `win.icon = assets/icon.ico`.
  - `origin/main` uses `icon.png`, a green disc.
- **Releases:**
  - The `publish.yml` desktop job attaches the installers to each release of `GarthGhostai/symbiot`. Release `apk-0.58.2` (the latest, checked 2026-10-09) carries `Symbiot-Setup.exe`, `Symbiot.dmg`, `symbiot.deb` and `Symbiot.AppImage`.
  - The site's download buttons link to them through `releases/latest/download/<file>` (`site/index.html:164-179` on `main`). The "Coming very soon" text this report first found is gone.

### 3.2 macOS: `.icns`, Dock, menu bar

**What the platform requires**
- **App icon** (https://developer.apple.com/design/human-interface-guidelines/app-icons):
  - A 1024×1024 master.
  - The `.icns` holds 16, 32, 128, 256 and 512 pt, each at @1x and @2x (16 → 1024 px).
  - The macOS icon is a rounded-rectangle body, about 824×824 inside the 1024 canvas, with room for a shadow. Transparency is allowed outside that body.
  - It sits on the Dock, Finder or Launchpad background, light or dark.
- **macOS 26 and later:** apps use Apple's layered Icon Composer format, and icons that don't fill the standard shape are widely reported to be shown on a system plate (https://developer.apple.com/icon-composer/).
- **Menu bar** (https://www.electronjs.org/docs/latest/api/native-image#template-image, https://www.electronjs.org/docs/latest/api/tray):
  - Use a **template image**: black plus alpha only, which macOS tints for light or dark menu bars.
  - Electron treats any file whose name ends in `Template` as a template image.
  - Recommended size: 16×16 @1x and 32×32 @2x.
- **electron-builder:** needs `icon.icns`, or a PNG of at least 512×512 (https://www.electron.build/icons).
- **DMG:** the window background is set with `dmg.background`; the default window is 540×380 (https://www.electron.build/dmg).

**What exists today**
- **npm install:**
  - `installLauncher` does nothing on macOS: it returns `{ skipped: true }` for anything other than win32 and linux (`desktop.mjs:245-247`).
  - So there is no app bundle and no Dock icon of its own. The Chrome `--app` window shows the favicon.
  - Start at login uses a LaunchAgent, `co.symbiot.app.plist` (`desktop.mjs:117`).
- **Installer app** (`desktop/package.json`):
  - `mac.icon = assets/icon.png` (the 1024×1024 Ferrofluid orb; electron-builder converts it).
  - It builds a universal DMG named `Symbiot.dmg`, in the productivity category.
  - There is no `.icns` and no `dmg.background`.
  - The menu bar uses `trayTemplate.png` (16×16) and its @2x (32×32), loaded as a template through the filename (`desktop/main.js:41`). Both are a solid black disc.
- **symbiot-desktop branch `symbiot/7-tasks`** (old green art):
  - `mac.icon = assets/icon.icns` (sizes listed in 3.0; no 16 px @1x).
  - The tray template is the ring, dot and companion mark in black, with `img.setTemplateImage(true)` (`symbiot-desktop/main.js:272-274`).
  - `app.dock.hide()`: it is a menu-bar-only app with no Dock icon (`main.js:283`).

### 3.3 Linux: `.desktop`, hicolor

**What the platform requires**
- **Icon Theme Spec** (https://specifications.freedesktop.org/icon-theme-spec/latest/):
  - Install icons into `hicolor/<size>x<size>/apps/` and/or `hicolor/scalable/apps/*.svg`. The common sizes are 16, 22, 24, 32, 48, 64, 128, 256 and 512.
  - "Minimally you should install a 48x48 icon in the hicolor theme."
- **Desktop entry:** the `.desktop` file names the icon in `Icon=` (https://specifications.freedesktop.org/desktop-entry-spec/latest/).
- **Format:** PNG or SVG, with transparency.
- **Background:** the icon sits on the dock, launcher or panel of the desktop environment (GNOME, COSMIC or KDE), light or dark.

**What exists today**
- **npm install** (`desktop.mjs:155-192`, `:244-258`):
  - It writes `~/.local/share/applications/symbiot.desktop` with:
    - `Name=Symbiot`
    - `GenericName=Assistant`
    - `Comment=Your work, your agents and what needs you, in one place`
    - `Icon=symbiot`
    - `Categories=Office;Utility;Development;`
    - `StartupWMClass=chrome-127.0.0.1__-Default`, which groups the Chrome app window under this icon
  - The icon is **only** `~/.local/share/icons/hicolor/scalable/apps/symbiot.svg`: `icon.svg` in the current look's colours. No PNG sizes are installed.
- **Autostart entry** (`~/.config/autostart/symbiot.desktop`): `NoDisplay=true`, and no icon (`desktop.mjs:150-153`).
- **Installer app** (`desktop/package.json`):
  - The AppImage and the `.deb` (`symbiot.deb`) use `linux.icon = assets/icon.png`: 1024×1024, Ferrofluid.
  - The package synopsis is "Your work, handled alongside you".
  - The tray icon is `tray.png`.
- **symbiot-desktop committed branches:** `linux.icon = assets/icon.png`, 512 px, green.

### 3.4 Favicon, apple-touch-icon, PWA / manifest

**What the platform requires**
- **Favicon** (https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel#icon):
  - `<link rel="icon">`. SVG works in current Chromium and Firefox.
  - `favicon.ico` (16/32/48) is the legacy fallback.
  - Tab and window chrome may be light or dark.
- **apple-touch-icon** (https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html):
  - A 180×180 PNG.
  - iOS fills transparent areas with black, so it should be opaque.
- **Web app manifest icons** (https://web.dev/articles/add-manifest, https://web.dev/articles/maskable-icon):
  - At least 192×192 and 512×512 PNG.
  - A `"purpose": "maskable"` icon must keep its content inside the central 80 % safe zone, a circle of 40 % radius.

**What exists today**
- **App:**
  - `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` (`ui.mjs:9`).
  - It is served by `server.mjs:247-252` from `iconSvg(look)`, so it follows the look.
  - `/favicon.ico` returns the same SVG, with `content-type image/svg+xml`.
  - `theme-color` is set per look (see 2.2).
  - apple-touch-icon and manifest: **not found**.
- **Website:**
  - `<link rel="icon" type="image/svg+xml" href="icon.svg">` (`site/index.html:9`).
  - A live check on 2026-10-09 found that `https://symbiot.co.za/favicon.ico`, `/apple-touch-icon.png`, `/manifest.json` and `/site.webmanifest` all return **404**.

### 3.5 Installer graphics

**What the platform requires** (electron-builder NSIS, https://www.electron.build/nsis)

| Graphic | Format and size | Used by |
|---|---|---|
| `installerSidebar` / `uninstallerSidebar` | BMP, **164×314** | assisted installer only |
| `installerHeader` | BMP, **150×57** | assisted installer only |
| `installerHeaderIcon` | ICO, shown above the progress bar; defaults to the app icon | one-click installer only |
| `installerIcon` / `uninstallerIcon` | ICO | both |

For the DMG, electron-builder takes a `background` image. The default window is 540×380; add an @2x version for Retina (https://www.electron.build/dmg).

**What exists today**
- None of these graphics exist.
- In `desktop/package.json`, `nsis` is `oneClick: true` and sets no installer icon, header or sidebar.
- `mac` sets no DMG background.
- No BMP files exist.
- No Inno Setup or other installer config was found.

### 3.6 symbiot.co.za: header, hero, Open Graph

The live site, fetched on 2026-10-09, is byte-identical to `site/index.html`. It is deployed from `site/` by `.github/workflows/pages.yml`.

- **Header:**
  - `icon.svg` is shown at **30×30 px** with `border-radius: 8px`, beside the name "SYMBIOT" (Geist 600, 14 px, letter-spacing 0.32em) (`site/index.html:30-34`, `:103`).
  - The bar is sticky and 64 px tall, with a translucent background: `color-mix(var(--bg) 78%)` with a 14 px blur.
- **Hero:**
  - A CSS orb, not the icon file.
  - It is square and circular, `width: min(300px, 64vw)`, and floats.
  - It sits on `#0B0C0E` in dark mode and `#F4F2EE` in light mode (`site/index.html:48-57`).
- **Open Graph** (`site/index.html:10-12`):
  - The page sets `og:title "Symbiot"`, `og:description` and `og:url`.
  - There is **no `og:image`** and no Twitter card.
  - The platform's recommended image size is 1200×630 px (https://developers.facebook.com/docs/sharing/webmasters/images/).
- **Footer:** text only, "© 2026 Ghost AI · Symbiot" (`site/index.html:200`).
- **theme-color:** `#0B0C0E`.

### 3.7 npm page

**What the platform requires**
- npm has no package-icon field: `package.json` defines none (https://docs.npmjs.com/cli/v10/configuring-npm/package-json).
- The package page renders the README, where images are allowed, and shows the publisher's avatar (https://docs.npmjs.com/about-package-readme-files).

**What exists today**
- The page itself, `https://www.npmjs.com/package/symbiot`, was **not checked**: it returned HTTP 403 (a Cloudflare challenge).
- The registry metadata (registry.npmjs.org/symbiot) has:
  - the description "Your week, written from your real work…"
  - 12 keywords
  - the homepage `github.com/GarthGhostai/symbiot#readme`
  - latest version 0.58.1
- `README.md` contains no images (no `![` and no `<img`), so the npm page shows no Symbiot artwork.

### 3.8 In-app spots

- **Window title bar:**
  - This is the Chrome or Edge `--app` window's own bar, titled "Symbiot".
  - Its colour comes from `theme-color` per look: `#08090B` / `#E9ECEE` / `#ECEBE8`.
  - Its icon is the favicon (`ui.mjs:8-9`, `:2695`).
- **App header (top left)** (`ui.mjs:386-388`, `:1056`):
  - It shows, in order: the 10×10 px green dot with a 12 px glow, "SYMBIOT", the version, and the look switch.
  - The dot uses `--green`: `#3DDC97` in Ferrofluid and `#0B7A55` in Glass and Pearl.
- **Home core:** the WebGL orb (see 2.6).
- **Away screen** (Super+\` or `symbiot away`):
  - The liquid orb at rest, full screen.
  - The time and the counts are shown in `#F3F0EA` (`ui.mjs:920-924`).
- **Onboarding, "Meet Symbiot":**
  - `<img class='onborb' src='/favicon.svg?look=…'>` at **72×72 px**, with `border-radius: 18px`.
  - This is the app icon in the current look's colours (`ui.mjs:960`, `:3256`).
- **Loading screen:**
  - Desktop and web: **not found**. There is no splash; the page renders directly.
  - Android has a native HTML page (`MainActivity.java:63-66`, `:230`, `:247-254`):
    - The title reads "Starting Symbiot…", "Symbiot couldn't start" or "Symbiot is stopped".
    - A 10 px `#3DDC97` dot with a 12 px glow sits beside the title.
    - The page background is `#0E1A1F`, and so are the status bar, the navigation bar and the WebView background.
- **About box:** **not found**.
- **Notifications** (`desktop.mjs:87-105`):
  - Linux: `notify-send --app-name=Symbiot`, with no icon argument.
  - Windows: a PowerShell balloon with the system "Information" icon.
  - macOS: `osascript display notification`, with no icon.
  - Android: the small icon is `R.drawable.ic_symbiot` (`SymbiotService.java:157`).

### 3.9 Android app launcher icon (`android/`)

**What the platform requires**
- **Adaptive icon** (API 26+; https://developer.android.com/develop/ui/views/launch/icon_design_adaptive):
  - Defined in `res/mipmap-anydpi-v26/ic_launcher.xml` as an `<adaptive-icon>` with a background layer and a foreground layer.
  - Each layer is **108×108 dp**. The visible area is 72×72 dp, masked by the launcher (circle, squircle and so on).
  - The **safe zone is a circle 66 dp across**.
  - An optional `<monochrome>` layer is used for themed icons on Android 13+.
- **Legacy PNG launcher icons** (https://developer.android.com/studio/write/create-app-icons):

  | Density | mdpi | hdpi | xhdpi | xxhdpi | xxxhdpi |
  |---|---|---|---|---|---|
  | Size (px) | 48 | 72 | 96 | 144 | 192 |

- **Notification small icon:**
  - 24×24 dp, white on transparent.
  - The system uses only its alpha, so any colours are dropped.

**What exists today**
- **The resource:**
  - `AndroidManifest.xml` sets `android:icon="@drawable/ic_symbiot"` (`AndroidManifest.xml:20`).
  - The only icon resource is `android/res/drawable/ic_symbiot.xml`.
  - It is a 108×108 dp **non-adaptive** VectorDrawable: an `#0E1A1F` disc 100 dp across plus an `#3DDC97` disc 48 dp across.
  - This is the old green art, last changed in commit `f608f6e` on 2026-10-03.
- **What's missing:** there is no `mipmap-*` folder, no `<adaptive-icon>`, no monochrome layer and no round icon.
- **Notification icon:** the same full-colour drawable is used as the notification small icon (`SymbiotService.java:157`).
- **Build and distribution:**
  - The build links with `aapt2 link --min-sdk-version 26 --target-sdk-version 28` (`android/build.sh:38-39`).
  - The APK is sideloaded, not on the Play Store, so there is no 512×512 store icon (`AndroidManifest.xml:2-4`).
- **In the app:** the WebView shows the same web UI, so the in-app looks and the orb apply on Android too.

---

## 4. Constraints

**Does the icon or orb follow the selected look at runtime?**

| Place | Follows the look? | How it's implemented |
|---|---|---|
| In-app orb / liquid | **Yes** | `lqLook(l)` saves the look and calls `lqTheme()`. `lqDraw` passes `uStyle` (glass 0 / ferro 1 / pearl 2) to the shader every frame (`ui.mjs:2689`, `:3194`). |
| Window / tab icon (favicon) | **Yes** | `lqIcon(l)` rewrites `<link rel=icon>` to `/favicon.svg?look=<look>` at start-up and on every switch (`ui.mjs:3319-3320`, `:2689`). The server renders it with `iconSvg(look)`, which string-replaces the stop colours of `icon.svg` with `LOOK_COLOURS` (`server.mjs:247-252`, `desktop.mjs:164-178`). |
| Onboarding orb image | **Yes** | It loads the same `/favicon.svg?look=…` (`ui.mjs:3256`). |
| Linux app-menu icon | **Yes** | `POST /api/look` saves `config.look` and calls `setLauncherLook(look)`, which rewrites `~/.local/share/icons/hicolor/scalable/apps/symbiot.svg` (`server.mjs:429`, `desktop.mjs:179-183`). `installLauncher` also writes the current look's SVG on each start (`desktop.mjs:254`). This is a stated feature: "The icon follows your look" (`CHANGELOG.md:80`, `README.md:54`). |
| Windows Start-menu and desktop shortcuts | **No** | They use the static Ferrofluid `icon.ico`, copied once (`desktop.mjs:232`). |
| Electron installer icons and tray | **No** | Static files. |
| Android launcher icon | **No** | Static file. |
| Website icon | **No** | Static file. The website's CSS hero orb switches between dark and pearl-like with the visitor's OS `prefers-color-scheme`, not with the app's look (`site/index.html:54-55`). |

**What this means for a new icon**
- **The SVG.** The look switching works by exact string replacement of `stop-color` values in `icon.svg` (`desktop.mjs:171-178`). A new SVG must either keep those stop colours or come with an updated `iconSvg()`.
- **The other icon files.** No script was found that generates `icon.ico` in the `symbiot` repo, or the PNG and tray files in `desktop/assets/`. The only icon script is `symbiot-desktop/scripts/make-icons.py`, and it draws the old green art.

The user's message was cut off here; further section-4 questions will be added when they send them.
