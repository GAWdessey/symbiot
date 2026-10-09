// symbiot — a QR code for pairing your phone (phone.mjs): byte mode, error
// correction level M, versions 1 to 20 (up to 666 bytes), with no dependency.
// qrMatrix(text) gives the modules (true is dark); qrSvg(text) an SVG of them with
// the quiet zone around, sized by the viewBox so the page scales it.
// ISO/IEC 18004: the layout tables below are its level M rows.

// [EC codewords per block, blocks in group 1, data codewords each, blocks in group 2, data codewords each]
const M_BLOCKS = [null,
  [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
  [30, 1, 50, 4, 51], [22, 6, 36, 2, 37], [22, 8, 37, 1, 38], [24, 4, 40, 5, 41], [24, 5, 41, 5, 42],
  [28, 7, 45, 3, 46], [28, 10, 46, 1, 47], [26, 9, 43, 4, 44], [26, 3, 44, 11, 45], [26, 3, 41, 13, 42]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90]];
const REMAINDER = (v) => (v >= 2 && v <= 6 ? 7 : v >= 14 && v <= 20 ? 3 : 0);
const MAX_VERSION = 20;
const dataCodewords = (v) => { const [, b1, d1, b2, d2] = M_BLOCKS[v]; return b1 * d1 + b2 * d2; };
const countBits = (v) => (v < 10 ? 8 : 16);

// ---- Reed-Solomon over GF(256), polynomial 0x11D --------------------------------
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function generator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) { const next = new Array(g.length + 1).fill(0); g.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); }); g = next; }
  return g;
}
function ecFor(data, n) {
  const g = generator(n), r = [...data, ...new Array(n).fill(0)];
  for (let i = 0; i < data.length; i++) { const f = r[i]; if (f) for (let j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], f); }
  return r.slice(data.length);
}

// ---- the codewords ---------------------------------------------------------------
function versionFor(bytes) {
  for (let v = 1; v <= MAX_VERSION; v++) if (4 + countBits(v) + bytes.length * 8 <= dataCodewords(v) * 8) return v;
  return 0;
}
function codewords(bytes, v) {
  const bits = [], put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, countBits(v)); for (const b of bytes) put(b, 8);
  const cap = dataCodewords(v) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0; data.length < cap / 8; pad ^= 1) data.push(pad ? 0x11 : 0xec);
  // split into blocks, each with its EC codewords; then interleave column by column
  const [ec, b1, d1, b2, d2] = M_BLOCKS[v], blocks = [];
  let at = 0;
  for (let i = 0; i < b1 + b2; i++) { const n = i < b1 ? d1 : d2, d = data.slice(at, at + n); at += n; blocks.push({ d, e: ecFor(d, ec) }); }
  const out = [], longest = Math.max(d1, d2);
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

// ---- the matrix ------------------------------------------------------------------
// Function patterns (finders, timing, alignment, format and version areas) are
// marked in `fixed`, so the data and the masks go around them.
function frame(v) {
  const n = 17 + 4 * v, m = Array.from({ length: n }, () => new Array(n).fill(false)), fixed = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r, c, dark) => { if (r >= 0 && r < n && c >= 0 && c < n) { m[r][c] = dark; fixed[r][c] = true; } };
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]])
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      set(r0 + r, c0 + c, ring !== 2 && ring !== 4 && r >= 0 && r <= 6 && c >= 0 && c <= 6);
    }
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const pos = ALIGN[v];
  for (const r of pos) for (const c of pos) {
    if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  for (let i = 0; i < 9; i++) { if (!fixed[8][i]) set(8, i, false); if (!fixed[i][8]) set(i, 8, false); }
  for (let i = 0; i < 8; i++) { set(8, n - 1 - i, false); set(n - 1 - i, 8, false); }
  set(n - 8, 8, true); // the dark module, beside the bottom-left format bits
  if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { set(i, n - 11 + j, false); set(n - 11 + j, i, false); }
  return { n, m, fixed };
}
// The data modules in placement order: two columns at a time from the right,
// up then down, skipping the vertical timing column.
function dataOrder(n, fixed) {
  const out = [];
  for (let right = n - 1, up = true; right > 0; right -= 2, up = !up) {
    if (right === 6) right = 5;
    for (let i = 0; i < n; i++) { const r = up ? n - 1 - i : i; for (const c of [right, right - 1]) if (!fixed[r][c]) out.push([r, c]); }
  }
  return out;
}
const MASKS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
const bch = (val, gen, genBits) => { let v = val << (genBits - 1); for (let i = 31 - Math.clz32(v); i >= genBits - 1; i--) if ((v >>> i) & 1) v ^= gen << (i - genBits + 1); return v; };
// level M is 00; the 15 bits go around the top-left finder and split between the other two
function formatBits(mask) { const d = (0 << 3) | mask; return ((d << 10) | bch(d, 0x537, 11)) ^ 0x5412; }
function placeFormat(m, n, mask) {
  const f = formatBits(mask), bit = (i) => ((f >>> i) & 1) === 1;
  for (let i = 0; i < 15; i++) {
    const b = bit(i);
    // around the top-left finder
    if (i < 6) m[i][8] = b; else if (i < 8) m[i + 1][8] = b; else if (i === 8) m[8][7] = b; else m[8][14 - i] = b;
    // the copy, split between the top-right and bottom-left finders
    if (i < 8) m[8][n - 1 - i] = b; else m[n - 15 + i][8] = b;
  }
}
function placeVersion(m, n, v) {
  if (v < 7) return;
  const bits = (v << 12) | bch(v, 0x1f25, 13);
  for (let i = 0; i < 18; i++) { const b = ((bits >>> i) & 1) === 1, r = Math.floor(i / 3), c = n - 11 + (i % 3); m[r][c] = b; m[c][r] = b; }
}
function penalty(m, n) {
  let p = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
    let run = 1;
    for (let j = 1; j <= n; j++) {
      const a = j < n ? (pass ? m[j][i] : m[i][j]) : null, b = pass ? m[j - 1][i] : m[i][j - 1];
      if (a === b) run++; else { if (run >= 5) p += run - 2; run = 1; }
    }
  }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3; }
  const pat = [true, false, true, true, true, false, true], at = (r, c, horiz) => (horiz ? m[r][c] : m[c][r]);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) for (let j = 0; j + 7 <= n; j++) {
    if (!pat.every((x, k) => at(i, j + k, !pass) === x)) continue;
    const light = (from) => { for (let k = from; k < from + 4; k++) if (k >= 0 && k < n && at(i, k, !pass)) return false; return true; };
    if (light(j - 4)) p += 40;
    if (light(j + 7)) p += 40;
  }
  let dark = 0; for (const row of m) for (const x of row) if (x) dark++;
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return p;
}
function qrMatrix(text, { mask = -1 } = {}) {
  const bytes = [...Buffer.from(String(text), "utf8")], v = versionFor(bytes);
  if (!v) throw new Error("too long for a QR code here");
  const words = codewords(bytes, v), { n, m, fixed } = frame(v), order = dataOrder(n, fixed);
  const bits = []; for (const w of words) for (let i = 7; i >= 0; i--) bits.push((w >>> i) & 1);
  for (let i = 0; i < REMAINDER(v); i++) bits.push(0);
  let best = null;
  for (let k = 0; k < 8; k++) {
    if (mask >= 0 && k !== mask) continue;
    const t = m.map((row) => row.slice());
    order.forEach(([r, c], i) => { t[r][c] = (bits[i] === 1) !== MASKS[k](r, c); });
    placeFormat(t, n, k); placeVersion(t, n, v);
    const score = mask >= 0 ? 0 : penalty(t, n);
    if (!best || score < best.score) best = { score, t, k };
  }
  return { version: v, mask: best.k, size: n, modules: best.t };
}
// An SVG of it, black on white with the 4-module quiet zone a camera needs.
function qrSvg(text) {
  const { size, modules } = qrMatrix(text), q = 4, all = size + 2 * q;
  let d = "";
  modules.forEach((row, r) => row.forEach((dark, c) => { if (dark) d += `M${c + q} ${r + q}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${all} ${all}" shape-rendering="crispEdges"><rect width="${all}" height="${all}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

export { qrMatrix, qrSvg, M_BLOCKS, ALIGN, REMAINDER, frame, dataOrder, MASKS, countBits };
