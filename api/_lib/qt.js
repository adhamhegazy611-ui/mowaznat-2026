// حصر الكميات من لوحة DXF (اللي اتحوّلت من DWG)
// بيقرا الهاتشات (مساحة صافية بعد طرح الجزر) والخطوط (أطوال بالأقواس + نسبة الدهان للخط المتقطع) والبلوكات (عدد)
// ويجمعهم في مجموعات حسب الطبقة واللون والنوع.

const SEG = 48; // عدد نقط كل قوس في الرسم والمساحة

function parseDXF(text) {
  const L = text.split(/\r?\n/);
  const P = [];
  for (let i = 0; i + 1 < L.length; i += 2) P.push([L[i].trim(), L[i + 1].replace(/\r$/, '')]);
  const ents = [], layers = {}, ltypes = {}, header = {};
  let sec = null, tab = null, cur = null, i = 0;
  const flush = () => { if (cur) { if (sec === 'ENTITIES') ents.push(cur); else if (tab === 'LAYER' && cur.t === 'LAYER') { const d = dict(cur.g); layers[d['2']] = { lt: d['6'] || 'Continuous', color: Math.abs(+d['62'] || 7), off: (+d['62'] || 0) < 0, frozen: (+d['70'] || 0) & 1 }; } else if (tab === 'LTYPE' && cur.t === 'LTYPE') { const d = dict(cur.g); ltypes[(d['2'] || '').toUpperCase()] = cur.g.filter((x) => x[0] === '49').map((x) => +x[1]); } } cur = null; };
  for (; i < P.length; i++) {
    const [c, v] = P[i];
    if (c === '0') {
      flush();
      if (v === 'SECTION') { sec = P[i + 1] && P[i + 1][0] === '2' ? P[i + 1][1].trim() : null; i++; continue; }
      if (v === 'ENDSEC') { sec = null; tab = null; continue; }
      if (sec === 'TABLES' && v === 'TABLE') { tab = P[i + 1] && P[i + 1][1].trim(); i++; continue; }
      if (v === 'ENDTAB') { tab = null; continue; }
      if (sec === 'ENTITIES' || sec === 'TABLES') cur = { t: v, g: [] };
      continue;
    }
    if (sec === 'HEADER' && c === '9') { const nx = P[i + 1]; if (nx) header[v.trim()] = nx[1].trim(); continue; }
    if (cur) cur.g.push([c, v]);
  }
  flush();
  return { ents, layers, ltypes, header };
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

function analyze(text) {
  const { ents, layers, ltypes, header } = parseDXF(text);
  const ltscale = +header.$LTSCALE || 1;
  const groups = new Map(); const warn = new Set(); let proxy = 0;
  const G = (key, base) => { if (!groups.has(key)) groups.set(key, { key, ...base, n: 0, area: 0, length: 0, paint: 0, items: [], geom: [] }); return groups.get(key); };
  const colorOf = (d) => { const c = +d['62']; if (c && c !== 256 && c !== 0) return Math.abs(c); const ly = layers[d['8']]; return ly ? ly.color : 7; };
  for (const e of ents) {
    const d = dict(e.g); if (d['67'] === '1') continue; // ورقة (paper space)
    const layer = d['8'] || '0', color = colorOf(d);
    if (e.t === 'ACAD_PROXY_ENTITY') { proxy++; continue; }
    if (e.t === 'HATCH') {
      const pat = d['2'] || 'SOLID';
      const paths = hatchPaths(e.g); if (!paths.length) continue;
      const h = hatchArea(paths);
      const gr = G(`H|${layer}|${pat}|${color}`, { kind: 'hatch', layer, pat, color, hex: aciHex(color) });
      gr.n++; gr.area += h.net;
      gr.items.push({ net: +h.net.toFixed(3), parts: h.parts.map((p) => ({ a: +p.a.toFixed(3), hole: p.hole })) });
      gr.geom.push({ t: 'h', polys: paths.map((p) => p.pts) });
      continue;
    }
    let geo = null, closed = false, area = 0;
    if (e.t === 'LWPOLYLINE') { const p = lwpoly(e.g); closed = p.closed; geo = polyGeom(p.pts, closed); if (closed) area = geo.pts.exact; }
    else if (e.t === 'LINE') { const a = [+d['10'], +d['20']], b = [+d['11'], +d['21']]; geo = { len: dist(a, b), pts: [a, b] }; }
    else if (e.t === 'ARC') { const a = arcPts(+d['10'], +d['20'], +d['40'], +d['50'], +d['51'], true); geo = a; }
    else if (e.t === 'CIRCLE') { const r = +d['40']; const a = arcPts(+d['10'], +d['20'], r, 0, 360, true); geo = { len: 2 * Math.PI * r, pts: a.pts }; closed = true; area = Math.PI * r * r; }
    else if (e.t === 'INSERT') {
      const bn = d['2'] || '?'; const gr = G(`B|${layer}|${bn}`, { kind: 'block', layer, block: bn, color, hex: aciHex(color) });
      gr.n++; gr.geom.push({ t: 'p', at: [+d['10'] || 0, +d['20'] || 0] }); continue;
    }
    else if (e.t === 'SPLINE') { const pts = []; e.g.forEach(([c, v], i) => { if (c === '11') pts.push([+v, +e.g[i + 1][1]]); }); if (!pts.length) e.g.forEach(([c, v], i) => { if (c === '10') pts.push([+v, +e.g[i + 1][1]]); }); let len = 0; for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]); geo = { len, pts }; warn.add('فيه خطوط Spline اتحسب طولها تقريبي'); }
    else continue;
    if (!geo) continue;
    let lt = (d['6'] || 'BYLAYER').toUpperCase(); if (lt === 'BYLAYER') lt = ((layers[layer] && layers[layer].lt) || 'CONTINUOUS').toUpperCase(); if (lt === 'BYBLOCK') lt = 'CONTINUOUS';
    const ratio = lt === 'CONTINUOUS' ? 1 : dashRatio(ltypes[lt]);
    const gr = G(`L|${layer}|${color}`, { kind: 'line', layer, color, hex: aciHex(color), lt: new Set() });
    gr.lt.add(lt); gr.n++; gr.length += geo.len; gr.paint += geo.len * ratio; gr.area += area;
    gr.items.push({ t: e.t, len: +geo.len.toFixed(3), closed, area: +area.toFixed(3), lt, ratio: +ratio.toFixed(4) });
    gr.geom.push({ t: 'l', pts: geo.pts, closed });
  }
  if (proxy) warn.add(`اللوحة فيها ${proxy} عنصر Civil 3D (سطوح/كوريدور/قطاعات) مش بيتقروا برا Civil 3D`);
  // bbox
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (p) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
  const out = [...groups.values()].map((gr) => {
    gr.geom.forEach((g) => { if (g.t === 'h') g.polys.forEach((p) => p.forEach(ext)); else if (g.t === 'l') g.pts.forEach(ext); else ext(g.at); });
    return { ...gr, lt: gr.lt ? [...gr.lt] : undefined, area: +gr.area.toFixed(3), length: +gr.length.toFixed(3), paint: +gr.paint.toFixed(3) };
  });
  // تبسيط الرسم: إحداثيات نسبية بدقة سنتيمتر
  const R = (v, o) => Math.round((v - o) * 100) / 100;
  out.forEach((gr) => { gr.geom = gr.geom.map((g) => g.t === 'h' ? { t: 'h', polys: g.polys.map((p) => p.map((q) => [R(q[0], x0), R(q[1], y0)])) } : g.t === 'l' ? { t: 'l', closed: g.closed, pts: g.pts.map((q) => [R(q[0], x0), R(q[1], y0)]) } : { t: 'p', at: [R(g.at[0], x0), R(g.at[1], y0)] }); });
  out.sort((a, b) => (a.kind === 'hatch' ? 0 : a.kind === 'line' ? 1 : 2) - (b.kind === 'hatch' ? 0 : b.kind === 'line' ? 1 : 2) || b.area - a.area || b.length - a.length);
  return { groups: out, bbox: [0, 0, R(x1, x0), R(y1, y0)], origin: [x0, y0], warnings: [...warn], entities: ents.length };
}

module.exports = { analyze, parseDXF, hatchPaths, hatchArea };
