// حصر الكميات من لوحة DXF (اللي اتحوّلت من DWG)
// بيقرا الهاتشات (مساحة صافية بعد طرح الجزر) والخطوط (أطوال بالأقواس + نسبة الدهان للخط المتقطع) والبلوكات (عدد)
// ويجمعهم في مجموعات حسب الطبقة واللون والنوع.

const SEG = 48; // عدد نقط كل قوس في الرسم والمساحة

function parseDXF(text) {
  const L = text.split(/\r?\n/);
  const P = [];
  for (let i = 0; i + 1 < L.length; i += 2) P.push([L[i].trim(), L[i + 1].replace(/\r$/, '')]);
  const ents = [], layers = {}, ltypes = {}, header = {}, blocks = {};
  let sec = null, tab = null, cur = null, blk = null, i = 0;
  const flush = () => {
    if (cur) {
      if (sec === 'ENTITIES') ents.push(cur);
      else if (sec === 'BLOCKS') {
        if (cur.t === 'BLOCK') { const d = dict(cur.g); blk = { name: d['2'] || '', base: [+d['10'] || 0, +d['20'] || 0], ents: [] }; }
        else if (cur.t === 'ENDBLK') { if (blk && blk.name && !/^\*(model|paper)_space/i.test(blk.name)) blocks[blk.name] = blk; blk = null; }
        else if (blk) blk.ents.push(cur);
      }
      else if (tab === 'LAYER' && cur.t === 'LAYER') { const d = dict(cur.g); layers[d['2']] = { lt: d['6'] || 'Continuous', color: Math.abs(+d['62'] || 7), off: (+d['62'] || 0) < 0, frozen: !!((+d['70'] || 0) & 1) }; }
      else if (tab === 'LTYPE' && cur.t === 'LTYPE') { const d = dict(cur.g); ltypes[(d['2'] || '').toUpperCase()] = cur.g.filter((x) => x[0] === '49').map((x) => +x[1]); }
    }
    cur = null;
  };
  for (; i < P.length; i++) {
    const [c, v] = P[i];
    if (c === '0') {
      flush();
      if (v === 'SECTION') { sec = P[i + 1] && P[i + 1][0] === '2' ? P[i + 1][1].trim() : null; i++; continue; }
      if (v === 'ENDSEC') { sec = null; tab = null; continue; }
      if (sec === 'TABLES' && v === 'TABLE') { tab = P[i + 1] && P[i + 1][1].trim(); i++; continue; }
      if (v === 'ENDTAB') { tab = null; continue; }
      if (sec === 'ENTITIES' || sec === 'TABLES' || sec === 'BLOCKS') cur = { t: v, g: [] };
      continue;
    }
    if (sec === 'HEADER' && c === '9') { const nx = P[i + 1]; if (nx) header[v.trim()] = nx[1].trim(); continue; }
    if (cur) cur.g.push([c, v]);
  }
  flush();
  return { ents, layers, ltypes, header, blocks };
}
function dict(g) { const d = {}; for (const [c, v] of g) if (!(c in d)) d[c] = v.trim(); return d; }

// ---------- هندسة ----------
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function bulgeArc(p1, p2, b, out) { // يضيف نقط القوس (من غير p1 و p2)
  const th = 4 * Math.atan(b), c = dist(p1, p2); if (!c) return 0;
  const r = c / (2 * Math.sin(th / 2));
  const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2, dx = (p2[0] - p1[0]) / c, dy = (p2[1] - p1[1]) / c, h = r * Math.cos(th / 2);
  const cx = mx - dy * h, cy = my + dx * h, a0 = Math.atan2(p1[1] - cy, p1[0] - cx), R = Math.abs(r);
  if (out) for (let s = 1; s < SEG; s++) { const a = a0 + th * s / SEG; out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  return Math.abs(r * th);
}
function lwpoly(g) { // [[x,y,bulge]], closed
  const pts = []; let cur = null;
  for (const [c, v] of g) { if (c === '10') { cur = [+v, 0, 0]; pts.push(cur); } else if (c === '20' && cur) cur[1] = +v; else if (c === '42' && cur) cur[2] = +v; }
  return { pts, closed: ((+dict(g)['70'] || 0) & 1) === 1 };
}
function polyGeom(pts, closed) { // length + densified points + exact area (closed)
  const out = []; let len = 0, A = 0; const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n]; out.push([a[0], a[1]]);
    len += a[2] ? bulgeArc(a, b, a[2], out) : dist(a, b);
    A += (a[0] * b[1] - b[0] * a[1]) / 2 + segA(a, b, a[2]);
  }
  if (closed) out.exact = Math.abs(A);
  if (!closed && n) out.push([pts[n - 1][0], pts[n - 1][1]]);
  return { len, pts: out };
}
const segA = (p1, p2, b) => { if (!b) return 0; const th = 4 * Math.atan(b), c = dist(p1, p2); if (!c) return 0; const r = c / (2 * Math.sin(th / 2)); return r * r * (th - Math.sin(th)) / 2; };
const sarea = (p) => { let s = 0; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
function inside(pt, poly) { let c = false; const [x, y] = pt; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [x1, y1] = poly[i], [x2, y2] = poly[j]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c = !c; } return c; }
function arcPts(cx, cy, r, a1, a2, ccw, withFirst = true) { // درجات
  let s = a1, e = a2;
  if (ccw) { while (e < s) e += 360; } else { s = -a1; e = -a2; while (e > s) e -= 360; }
  const out = [];
  for (let k = withFirst ? 0 : 1; k <= SEG; k++) { const a = (s + (e - s) * k / SEG) * Math.PI / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return { pts: out, len: Math.abs((e - s) * Math.PI / 180 * r) };
}

// حدود الهاتش → مضلعات
function hatchPaths(g) {
  const k0 = g.findIndex((x) => x[0] === '91'); if (k0 < 0) return [];
  const np = +g[k0][1]; let k = k0 + 1; const paths = [];
  const num = () => +g[k++][1];
  while (paths.length < np && k < g.length) {
    if (g[k][0] !== '92') { k++; continue; }
    const flag = num(); const poly = []; let exA = 0; const chain = [];
    if (flag & 2) {
      const hasB = num(); k++; /*73*/ const n = num(); const pts = [];
      for (let i = 0; i < n; i++) { const x = num(), y = num(); let b = 0; if (hasB && g[k] && g[k][0] === '42') b = num(); pts.push([x, y, b]); }
      for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; poly.push([a[0], a[1]]); if (a[2]) bulgeArc(a, b, a[2], poly); exA += (a[0] * b[1] - b[0] * a[1]) / 2 + segA(a, b, a[2]); }
    } else {
      const n = num();
      for (let i = 0; i < n; i++) {
        const t = num(); const d = {};
        const read = (codes) => { while (k < g.length && codes.includes(g[k][0])) { const c = g[k][0]; if (c === '10' || c === '20') { (d[c] = d[c] || []).push(+g[k][1]); } else d[c] = +g[k][1]; k++; } };
        if (t === 1) { read(['10', '20', '11', '21']); poly.push([d['10'][0], d['20'][0]]); chain.push({ a: [d['10'][0], d['20'][0]], b: [d['11'], d['21']], s: 0 }); }
        else if (t === 2) {
          read(['10', '20', '40', '50', '51', '73']); const ccw = d['73'] !== 0; const a = arcPts(d['10'][0], d['20'][0], d['40'], d['50'], d['51'], ccw);
          const st = a.pts[0], en = a.pts[a.pts.length - 1]; let sw = a.len / d['40']; if (!ccw) sw = -sw;
          chain.push({ a: st, b: en, s: d['40'] * d['40'] * (sw - Math.sin(sw)) / 2 * (ccw ? 1 : 1) }); a.pts.pop(); poly.push(...a.pts);
        }
        else if (t === 3) { read(['10', '20', '11', '21', '40', '50', '51', '73']); const cx = d['10'][0], cy = d['20'][0], mx = d['11'], my = d['21'], ra = d['40'], R = Math.hypot(mx, my), rot = Math.atan2(my, mx); let s = d['50'], e = d['51']; if (d['73'] === 0) { s = -s; e = -e; } while (e < s && d['73'] !== 0) e += 360; for (let q = 0; q < SEG; q++) { const a = (s + (e - s) * q / SEG) * Math.PI / 180; const x = R * Math.cos(a), y = R * ra * Math.sin(a); poly.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); } }
        else if (t === 4) { // spline: نستخدم نقط التحكم/النقط المناسبة
          k += 0; read(['94', '73', '74', '95', '96', '40', '42', '97', '11', '21', '12', '22', '13', '23']);
          const cps = []; while (k < g.length && g[k][0] === '10') { const x = num(), y = num(); cps.push([x, y]); if (g[k] && g[k][0] === '42') k++; }
          read(['97', '11', '21', '12', '22', '13', '23']);
          poly.push(...cps);
        } else break;
      }
    }
    // مراجع الحدود الأصلية (97 + 330)
    while (k < g.length && (g[k][0] === '97' || g[k][0] === '330')) k++;
    if (!(flag & 2)) { exA = 0; let ok = true; for (const c of chain) exA += (c.a[0] * c.b[1] - c.b[0] * c.a[1]) / 2 + c.s; if (chain.length !== 0 && poly.length && chain.length < 1) ok = false; if (!chain.length || !ok) exA = null; }
    if (poly.length >= 3) paths.push({ flag, pts: poly, exact: exA == null ? null : Math.abs(exA) });
  }
  return paths;
}
function hatchArea(paths) {
  const areas = paths.map((p) => (p.exact != null && isFinite(p.exact) ? p.exact : Math.abs(sarea(p.pts))));
  const depth = paths.map((p, j) => { const probe = p.pts.filter((_, i) => i % Math.max(1, Math.floor(p.pts.length / 12)) === 0); return paths.reduce((s, q, m) => { if (m === j) return s; const inn = probe.filter((pt) => inside(pt, q.pts)).length; return s + (inn > probe.length / 2 ? 1 : 0); }, 0); });
  let net = 0; const parts = [];
  paths.forEach((p, j) => { const sg = depth[j] % 2 ? -1 : 1; net += sg * areas[j]; parts.push({ a: areas[j], hole: sg < 0 }); });
  return { net, parts, depth };
}

// نسبة الدهان للخط المتقطع
function dashRatio(pat) { if (!pat || !pat.length) return 1; let on = 0, tot = 0; for (const x of pat) { tot += Math.abs(x); if (x >= 0) on += x; } return tot > 0 ? on / tot : 1; }

const ACI = { 1: '#e53935', 2: '#fdd835', 3: '#43a047', 4: '#00acc1', 5: '#1e88e5', 6: '#d81b60', 7: '#455a64', 8: '#757575', 9: '#bdbdbd' };
const aciHex = (c) => ACI[c] || (c >= 10 && c < 250 ? `hsl(${Math.round(((c - 10) / 240) * 360)},65%,45%)` : '#607d8b');

// تحويلات: [a,b,c,d,e,f] → x' = a x + c y + e ، y' = b x + d y + f
const TI = [1, 0, 0, 1, 0, 0];
const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const app = (T, p) => [T[0] * p[0] + T[2] * p[1] + T[4], T[1] * p[0] + T[3] * p[1] + T[5]];
const det = (T) => T[0] * T[3] - T[1] * T[2];
const MIRX = [-1, 0, 0, 1, 0, 0]; // نظام إحداثيات الكائن (OCS) لما الاتجاه -Z
const plen = (pts, closed) => { let l = 0; for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]); if (closed && pts.length > 2) l += dist(pts[pts.length - 1], pts[0]); return l; };
function mtextClean(t) {
  return String(t || '').replace(/\\P/g, '\n').replace(/\\[ACcFfHhQTWwLlOoKk][^;\\]*;?/g, '').replace(/\\S([^;]*)[\^#/]([^;]*);/g, '$1/$2').replace(/\\[LlOoKk]/g, '').replace(/[{}]/g, '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/\\~/g, ' ').replace(/[ \t]+/g, ' ').trim();
}
const TNAME = { LINE: 'خط', LWPOLYLINE: 'بولي لاين', POLYLINE: 'بولي لاين 2D/3D', ARC: 'قوس', CIRCLE: 'دائرة', ELLIPSE: 'قطع ناقص', SPLINE: 'Spline', HATCH: 'هاتش', INSERT: 'بلوك', TEXT: 'نص', MTEXT: 'نص', ATTRIB: 'نص بلوك', DIMENSION: 'أبعاد', MULTILEADER: 'Leader', LEADER: 'Leader', ACAD_TABLE: 'جدول', POINT: 'نقطة', SOLID: 'Solid', '3DFACE': '3D Face', ACAD_PROXY_ENTITY: 'عنصر Civil 3D', IMAGE: 'صورة', VIEWPORT: 'Viewport', WIPEOUT: 'Wipeout', MLINE: 'Mline' };

// رسومات عناصر Civil 3D المحفوظة جوه الملف (Proxy graphics): بنطلع منها اسم النوع والمستطيل اللي حواليه
function proxyGfx(g) {
  const hex = g.filter((x) => x[0] === '310').map((x) => x[1].trim()).join(''); if (hex.length < 16) return null;
  const b = Buffer.from(hex, 'hex'); let o = 8, cls = '', n; try { n = b.readInt32LE(4); } catch (e) { return null; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n && o + 8 <= b.length; i++) {
    const sz = b.readInt32LE(o), t = b.readInt32LE(o + 4), d = o + 8; if (sz < 8) break;
    if ((t === 6 || t === 7) && d + 4 <= b.length) { const m = b.readInt32LE(d); for (let k = 0; k < m && d + 4 + k * 24 + 16 <= b.length; k++) { const x = b.readDoubleLE(d + 4 + k * 24), y = b.readDoubleLE(d + 12 + k * 24); if (isFinite(x) && isFinite(y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } }
    else if (t === 36 && !cls) { let k = d + 96, str = ''; while (k + 1 < o + sz) { const c = b.readUInt16LE(k); if (!c) break; str += String.fromCharCode(c); k += 2; } cls = str.replace(/\s*\(.*\)\s*$/, '').replace(/^AeccDb/, '').trim(); }
    o += sz;
  }
  return isFinite(x0) ? { cls, box: [x0, y0, x1, y1] } : null;
}

function analyze(text) {
  const { ents, layers, ltypes, header, blocks } = parseDXF(text);
  const groups = new Map(); const warn = new Set(); let proxy = 0;
  const inv = new Map(), types = {}, texts = [], dims = [], civ = [];
  const LY = (n) => { if (!inv.has(n)) { const l = layers[n] || {}; inv.set(n, { name: n, color: l.color || 7, hid: !!(l.off || l.frozen), hatch: 0, harea: 0, line: 0, len: 0, block: 0, text: 0, other: 0 }); } return inv.get(n); };
  const G = (key, base) => { if (!groups.has(key)) groups.set(key, { key, ...base, n: 0, area: 0, length: 0, paint: 0, items: [], geom: [] }); return groups.get(key); };
  const layerOf = (d, ctx) => { const l = d['8'] || '0'; return l === '0' && ctx.layer ? ctx.layer : l; };
  const colorOf = (d, ly, ctx) => { const c = +d['62']; if (c === 0 && ctx.color) return ctx.color; if (c && c !== 256 && c !== 0) return Math.abs(c); const l = layers[ly]; return l ? l.color : 7; };
  const hidOf = (ly) => !!(layers[ly] && (layers[ly].off || layers[ly].frozen));
  let budget = 400000; // حماية من البلوكات المتداخلة الضخمة

  function walk(list, T, ctx) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.t === 'VERTEX' || e.t === 'SEQEND') continue;
      if (--budget < 0) { warn.add('اللوحة كبيرة جداً — اتقرا جزء من البلوكات بس'); return; }
      const d = dict(e.g); if (!ctx.blk && d['67'] === '1') continue; // ورقة (paper space)
      if (d['60'] === '1') continue; // عنصر مخفي
      const layer = layerOf(d, ctx), color = colorOf(d, layer, ctx), lv = LY(layer);
      types[e.t] = (types[e.t] || 0) + 1;
      const ocs = (+d['230'] || 1) < 0, Te = ocs ? mul(T, MIRX) : T, dt = Math.abs(det(Te)), sc = Math.sqrt(dt);
      const uni = Math.abs(Math.hypot(Te[0], Te[1]) - Math.hypot(Te[2], Te[3])) < 1e-9 * Math.max(1, Math.hypot(Te[0], Te[1]));
      const sfx = ctx.blk ? '|@' + ctx.blk : '', extra = ctx.blk ? { blk: ctx.blk } : {}, hid = hidOf(layer) || !!ctx.hid;
      if (e.t === 'ACAD_PROXY_ENTITY') { proxy++; lv.other++; const pg = proxyGfx(e.g); if (pg && civ.length < 3000) civ.push({ cls: pg.cls, l: layer, box: [app(T, [pg.box[0], pg.box[1]]), app(T, [pg.box[2], pg.box[3]])] }); continue; }
      if (e.t === 'HATCH') {
        const pat = d['2'] || 'SOLID';
        const paths = hatchPaths(e.g); if (!paths.length) { lv.other++; continue; }
        paths.forEach((p) => { p.pts = p.pts.map((q) => app(Te, q)); if (p.exact != null) p.exact *= dt; });
        const h = hatchArea(paths);
        const gr = G(`H|${layer}|${pat}|${color}${sfx}`, { kind: 'hatch', layer, pat, color, hex: aciHex(color), hid, ...extra });
        gr.n++; gr.area += h.net; lv.hatch++; lv.harea += h.net;
        gr.items.push({ net: +h.net.toFixed(3), parts: h.parts.map((p) => ({ a: +p.a.toFixed(3), hole: p.hole })) });
        gr.geom.push({ t: 'h', polys: paths.map((p) => p.pts) });
        continue;
      }
      if (e.t === 'INSERT') {
        const bn = d['2'] || '?', B = blocks[bn];
        const nc = Math.max(1, +d['70'] || 1), nr = Math.max(1, +d['71'] || 1), cs = +d['44'] || 0, rs = +d['45'] || 0;
        const sx = d['41'] != null ? +d['41'] : 1, sy = d['42'] != null ? +d['42'] : 1, r = (+d['50'] || 0) * Math.PI / 180;
        const gr = G(`B|${layer}|${bn}${sfx}`, { kind: 'block', layer, block: bn, color, hex: aciHex(color), hid, ...extra });
        // النصوص المربوطة بالبلوك (Attributes)
        if (d['66'] === '1') for (let j = i + 1; j < list.length && list[j].t !== 'SEQEND'; j++) if (list[j].t === 'ATTRIB') { const ad = dict(list[j].g); const tx = mtextClean(ad['1']); if (tx) { texts.push({ l: layerOf(ad, ctx), t: tx, tag: ad['2'], at: app(mul(T, (+ad['230'] || 1) < 0 ? MIRX : TI), [+ad['10'] || 0, +ad['20'] || 0]), blk: bn }); LY(layerOf(ad, ctx)).text++; } }
        for (let ci = 0; ci < nc; ci++) for (let ri = 0; ri < nr; ri++) {
          const ins = [(+d['10'] || 0) + (ci * cs * Math.cos(r) - ri * rs * Math.sin(r)), (+d['20'] || 0) + (ci * cs * Math.sin(r) + ri * rs * Math.cos(r))];
          const at = app(Te, ins); gr.n++; lv.block++; gr.geom.push({ t: 'p', at });
          if (B && (ctx.depth || 0) < 8 && B.ents.length) {
            const Ti = mul(Te, [Math.cos(r) * sx, Math.sin(r) * sx, -Math.sin(r) * sy, Math.cos(r) * sy, ins[0], ins[1]]);
            walk(B.ents, mul(Ti, [1, 0, 0, 1, -B.base[0], -B.base[1]]), { layer, color, blk: ctx.blk || bn, depth: (ctx.depth || 0) + 1, hid });
          }
        }
        continue;
      }
      if (e.t === 'TEXT' || e.t === 'MTEXT' || e.t === 'ATTDEF') {
        if (e.t === 'ATTDEF') continue;
        let tx = e.t === 'MTEXT' ? e.g.filter((x) => x[0] === '3').map((x) => x[1]).join('') + (d['1'] != null ? e.g.filter((x) => x[0] === '1').map((x) => x[1]).join('') : '') : d['1'];
        tx = mtextClean(tx); if (!tx) continue;
        const at = app(e.t === 'MTEXT' ? T : Te, [+d['10'] || 0, +d['20'] || 0]);
        texts.push({ l: layer, t: tx, at, h: +((+d['40'] || 0) * sc).toFixed(2), ...(ctx.blk ? { blk: ctx.blk } : {}) }); lv.text++;
        continue;
      }
      if (e.t === 'DIMENSION') { const m = +d['42']; const tx = mtextClean(d['1'] || ''); dims.push({ l: layer, v: isFinite(m) ? +m.toFixed(3) : null, t: tx && tx !== '<>' ? tx.replace('<>', isFinite(m) ? m.toFixed(2) : '') : null }); lv.other++; continue; }
      if (e.t === 'ACAD_TABLE') { const cells = e.g.filter((x) => x[0] === '1' || x[0] === '302').map((x) => mtextClean(x[1])).filter(Boolean); if (cells.length) texts.push({ l: layer, t: cells.join(' | '), at: app(T, [+d['10'] || 0, +d['20'] || 0]), table: true }); lv.text++; continue; }
      let pts = null, len = 0, closed = false, area = 0;
      if (e.t === 'LWPOLYLINE') { const p = lwpoly(e.g); closed = p.closed; const g = polyGeom(p.pts, closed); pts = g.pts; len = g.len * sc; if (closed) area = g.pts.exact * dt; }
      else if (e.t === 'POLYLINE') {
        const fl = +d['70'] || 0; if (fl & (16 | 64)) { lv.other++; warn.add('فيه أسطح Mesh / Polyface اتعدّت (مش خطوط)'); continue; }
        const vs = []; for (let j = i + 1; j < list.length && list[j].t !== 'SEQEND'; j++) if (list[j].t === 'VERTEX') { const vd = dict(list[j].g); if ((+vd['70'] || 0) & 16) continue; vs.push([+vd['10'] || 0, +vd['20'] || 0, +vd['42'] || 0, +vd['30'] || 0]); }
        if (vs.length < 2) continue; closed = !!(fl & 1); const g = polyGeom(vs, closed); pts = g.pts; len = g.len * sc; if (closed) area = g.pts.exact * dt;
        const is3 = !!(fl & 8); if (is3) { let l3 = 0; for (let j = 1; j < vs.length; j++) l3 += Math.hypot(vs[j][0] - vs[j - 1][0], vs[j][1] - vs[j - 1][1], vs[j][3] - vs[j - 1][3]); if (Math.abs(l3 - g.len) > 0.01) warn.add('فيه بولي لاين 3D — الطول المحسوب أفقي (مسقط)، زي الحصر العادي'); }
      }
      else if (e.t === 'LINE') { pts = [[+d['10'], +d['20']], [+d['11'], +d['21']]]; len = dist(pts[0], pts[1]); if (!ctx.blk) { /* LINE بإحداثيات عالمية */ } len *= sc; }
      else if (e.t === 'ARC') { const a = arcPts(+d['10'], +d['20'], +d['40'], +d['50'], +d['51'], true); pts = a.pts; len = a.len * sc; }
      else if (e.t === 'CIRCLE') { const r = +d['40']; pts = arcPts(+d['10'], +d['20'], r, 0, 360, true).pts; len = 2 * Math.PI * r * sc; closed = true; area = Math.PI * r * r * dt; }
      else if (e.t === 'ELLIPSE') {
        const cx = +d['10'], cy = +d['20'], mx = +d['11'], my = +d['21'], ra = +d['40'] || 1; let t0 = +d['41'] || 0, t1 = d['42'] != null ? +d['42'] : 2 * Math.PI; if (t1 <= t0) t1 += 2 * Math.PI;
        pts = []; for (let k = 0; k <= SEG * 2; k++) { const t = t0 + (t1 - t0) * k / (SEG * 2); pts.push([cx + mx * Math.cos(t) - my * ra * Math.sin(t), cy + my * Math.cos(t) + mx * ra * Math.sin(t)]); }
        len = plen(pts) * sc; closed = Math.abs(t1 - t0 - 2 * Math.PI) < 1e-6; if (closed) area = Math.PI * Math.hypot(mx, my) ** 2 * ra * dt;
      }
      else if (e.t === 'SPLINE') { pts = []; e.g.forEach(([c, v], k) => { if (c === '11') pts.push([+v, +e.g[k + 1][1]]); }); if (!pts.length) e.g.forEach(([c, v], k) => { if (c === '10') pts.push([+v, +e.g[k + 1][1]]); }); len = plen(pts) * sc; warn.add('فيه خطوط Spline اتحسب طولها تقريبي'); }
      else { lv.other++; continue; }
      if (!pts || !pts.length) continue;
      const lineT = e.t === 'LINE' || e.t === 'SPLINE' || e.t === 'ELLIPSE' ? T : Te; // دول بإحداثيات عالمية مش OCS
      pts = pts.map((q) => app(lineT, q));
      if (!uni) len = plen(pts, closed && e.t !== 'CIRCLE');
      let lt = (d['6'] || 'BYLAYER').toUpperCase(); if (lt === 'BYLAYER') lt = ((layers[layer] && layers[layer].lt) || 'CONTINUOUS').toUpperCase(); if (lt === 'BYBLOCK') lt = 'CONTINUOUS';
      const ratio = lt === 'CONTINUOUS' ? 1 : dashRatio(ltypes[lt]);
      const gr = G(`L|${layer}|${color}${sfx}`, { kind: 'line', layer, color, hex: aciHex(color), lt: new Set(), hid, ...extra });
      gr.lt.add(lt); gr.n++; gr.length += len; gr.paint += len * ratio; gr.area += area; lv.line++; lv.len += len;
      gr.items.push({ t: e.t, len: +len.toFixed(3), closed, area: +area.toFixed(3), lt, ratio: +ratio.toFixed(4) });
      gr.geom.push({ t: 'l', pts, closed });
    }
  }
  walk(ents, TI, {});
  if (proxy) warn.add(`اللوحة فيها ${proxy} عنصر Civil 3D (سطوح/كوريدور/قطاعات) مش بيتقروا برا Civil 3D`);
  // bbox (من العناصر الظاهرة بس، عشان العناصر البعيدة متصغّرش الرسمة)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (p) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
  const out = [...groups.values()].map((gr) => {
    gr.geom.forEach((g) => { if (g.t === 'h') g.polys.forEach((p) => p.forEach(ext)); else if (g.t === 'l') g.pts.forEach(ext); else ext(g.at); });
    return { ...gr, lt: gr.lt ? [...gr.lt] : undefined, area: +gr.area.toFixed(3), length: +gr.length.toFixed(3), paint: +gr.paint.toFixed(3) };
  });
  if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; texts.forEach((t) => ext(t.at)); }
  // تبسيط الرسم: إحداثيات نسبية بدقة سنتيمتر
  const R = (v, o) => Math.round((v - o) * 100) / 100;
  out.forEach((gr) => { gr.geom = gr.geom.map((g) => g.t === 'h' ? { t: 'h', polys: g.polys.map((p) => p.map((q) => [R(q[0], x0), R(q[1], y0)])) } : g.t === 'l' ? { t: 'l', closed: g.closed, pts: g.pts.map((q) => [R(q[0], x0), R(q[1], y0)]) } : { t: 'p', at: [R(g.at[0], x0), R(g.at[1], y0)] }); });
  out.sort((a, b) => (a.hid ? 1 : 0) - (b.hid ? 1 : 0) || (a.blk ? 1 : 0) - (b.blk ? 1 : 0) || (a.kind === 'hatch' ? 0 : a.kind === 'line' ? 1 : 2) - (b.kind === 'hatch' ? 0 : b.kind === 'line' ? 1 : 2) || b.area - a.area || b.length - a.length);
  const lys = [...inv.values()].filter((l) => l.hatch || l.line || l.block || l.text || l.other).map((l) => ({ ...l, harea: +l.harea.toFixed(3), len: +l.len.toFixed(3), hex: aciHex(l.color) })).sort((a, b) => b.harea - a.harea || b.len - a.len || b.block - a.block);
  const cv = civ.map((c) => ({ cls: c.cls, l: c.l, box: [R(Math.min(c.box[0][0], c.box[1][0]), x0), R(Math.min(c.box[0][1], c.box[1][1]), y0), R(Math.max(c.box[0][0], c.box[1][0]), x0), R(Math.max(c.box[0][1], c.box[1][1]), y0)] }));
  const tx = texts.slice(0, 4000).map((t) => ({ ...t, at: [R(t.at[0], x0), R(t.at[1], y0)] }));
  if (texts.length > 4000) warn.add('اللوحة فيها نصوص كتير — اتعرض أول 4000');
  const usedBlocks = new Set(out.filter((g) => g.kind === 'block').map((g) => g.block));
  return {
    groups: out, bbox: [0, 0, R(x1, x0), R(y1, y0)], origin: [x0, y0], warnings: [...warn], entities: ents.length,
    inv: { layers: lys, types, texts: tx, civ: cv, dims: dims.slice(0, 2000), blocks: { defined: Object.keys(blocks).length, used: usedBlocks.size }, layerCount: Object.keys(layers).length, hiddenLayers: Object.keys(layers).filter((k) => layers[k].off || layers[k].frozen) },
  };
}

module.exports = { analyze, parseDXF, hatchPaths, hatchArea, TNAME };
