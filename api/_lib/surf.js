// قراءة سطوح Civil 3D (AECC_TIN_SURFACE) من بيانات الـ DWG الخام (dwgread -O JSON)
// بيطلّع نقط السطح بمناسيبها، ولو السطح «سطح فرق» (Volume Surface) بيحسب الردم والحفر.
const Delaunator = require('./delaunator');

function bytesFromHex(h) { const n = h.length >> 1, b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; }
function shifted(b, s) { if (!s) return b; const o = new Uint8Array(b.length - 1); for (let i = 0; i < o.length; i++) o[i] = ((b[i] << s) | (b[i + 1] >> (8 - s))) & 255; return o; }
const plaus = (v) => isFinite(v) && Math.abs(v) > 1e4 && Math.abs(v) < 1e8;

// النقط متخزنة كسجلات (x, y, z, flags) كل واحدة 4 أرقام double
function decodePoints(hex) {
  const raw = bytesFromHex(hex); let best = null;
  for (let s = 0; s < 8; s++) {
    const b = shifted(raw, s), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let a = 0; a < 8; a++) {
      const n = Math.floor((b.length - a) / 8); if (n < 16) continue;
      const d = new Float64Array(n); for (let i = 0; i < n; i++) d[i] = dv.getFloat64(a + 8 * i, true);
      let c = 0; for (let i = 0; i + 4 < n; i++) if (plaus(d[i]) && plaus(d[i + 1]) && plaus(d[i + 4])) c++;
      if (!best || c > best.c) best = { c, d };
    }
  }
  if (!best || best.c < 10) return null;
  const d = best.d, n = d.length;
  // أطول تتابع بخطوة 4
  let bs = -1, be = -1, cs = -1, prev = -10;
  for (let i = 0; i + 4 < n; i++) {
    if (plaus(d[i]) && plaus(d[i + 1]) && plaus(d[i + 4])) {
      if (i - prev === 4) { /* continue run */ } else cs = i;
      prev = i; if (i - cs > be - bs) { bs = cs; be = i; }
    }
  }
  let st = bs, en = be + 4;
  const near = (i, j) => isFinite(d[i]) && isFinite(d[i + 1]) && Math.abs(d[i] - d[j]) < 5000 && Math.abs(d[i + 1] - d[j + 1]) < 5000;
  while (st - 4 >= 0 && near(st - 4, st)) st -= 4;
  while (en + 5 < n && near(en + 4, en)) en += 4;
  const pts = [];
  for (let i = st; i <= en; i += 4) if (isFinite(d[i + 2])) pts.push([d[i], d[i + 1], d[i + 2]]);
  return pts;
}

// حجم الجزء الموجب من دالة خطية على مثلث (ردم) — والسالب بنفس الدالة على -z
function posVol(A, z1, z2, z3) {
  const z = [z1, z2, z3].sort((p, q) => p - q); const [a, b, c] = z, tot = A * (a + b + c) / 3;
  if (a >= 0) return tot;
  if (b >= 0) return tot - A * a * a * a / ((a - b) * (a - c)) / 3;
  if (c > 0) return A * c * c * c / ((c - a) * (c - b)) / 3;
  return 0;
}

function volumeOf(pts, maxEdge = 30) {
  const ox = pts[0][0], oy = pts[0][1];
  const seen = new Set(), P = [];
  for (const p of pts) { const k = Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4); if (seen.has(k)) continue; seen.add(k); P.push(p); }
  const co = new Float64Array(P.length * 2); P.forEach((p, i) => { co[2 * i] = p[0] - ox; co[2 * i + 1] = p[1] - oy; });
  const dl = new Delaunator(co), t = dl.triangles;
  let area = 0, fill = 0, cut = 0; const keep = [];
  for (let i = 0; i < t.length; i += 3) {
    const a = P[t[i]], b = P[t[i + 1]], c = P[t[i + 2]];
    const L = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
    if (L > maxEdge) continue;
    const A = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    area += A; fill += posVol(A, a[2], b[2], c[2]); cut += posVol(A, -a[2], -b[2], -c[2]);
    keep.push(t[i], t[i + 1], t[i + 2]);
  }
  return { area, fill, cut, P, tris: keep };
}

// json: ناتج dwgread -O JSON (نص)
function surfaces(jsonText) {
  const J = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
  const cls = {}; (J.CLASSES || []).forEach((c) => { cls[c.number] = c.dxfname; });
  const out = [];
  for (const o of J.OBJECTS || []) {
    if (o.entity !== 'UNKNOWN_ENT' || !/TIN_SURFACE|VOLUME_SURFACE/i.test(cls[o.type] || '') || !o.unknown_bits) continue;
    const pts = decodePoints(o.unknown_bits); if (!pts || pts.length < 10) continue;
    const zs = pts.map((p) => p[2]).sort((a, b) => a - b), med = zs[zs.length >> 1];
    const s = { handle: Array.isArray(o.handle) ? o.handle[2] : o.handle, layer: Array.isArray(o.layer) ? o.layer[2] : null, points: pts.length, zmin: zs[0], zmax: zs[zs.length - 1] };
    // سطح الفرق: مناسيبه حوالين الصفر (فيه موجب وسالب وقيم صغيرة)
    const small = pts.filter((p) => Math.abs(p[2]) < 30);
    s.volume = Math.abs(med) < 15 && small.length > pts.length * 0.9 && zs[0] < 0 && zs[zs.length - 1] > 0;
    if (s.volume) {
      const v = volumeOf(small);
      Object.assign(s, { area: v.area, fill: v.fill, cut: v.cut, points: v.P.length, zmin: Math.min(...v.P.map((p) => p[2])), zmax: Math.max(...v.P.map((p) => p[2])), _v: v });
    }
    out.push(s);
  }
  return out;
}


// مجموعات للحصر: كل سطح فرق = مجموعة «surface» فيها الردم والحفر + شبكة ألوان للعرض
function surfaceGroups(jsonText, origin) {
  const ss = surfaces(jsonText), out = [], other = ss.filter((s) => !s.volume).length;
  ss.filter((s) => s.volume).forEach((s, idx) => {
    const v = s._v, P = v.P, t = v.tris;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    P.forEach((p) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; });
    const ox = origin && isFinite(origin[0]) ? origin[0] : x0, oy = origin && isFinite(origin[1]) ? origin[1] : y0;
    const cs = Math.max((x1 - x0), (y1 - y0)) / 160 || 1, nx = Math.ceil((x1 - x0) / cs) + 1, ny = Math.ceil((y1 - y0) / cs) + 1;
    const sw = new Float64Array(nx * ny), sz = new Float64Array(nx * ny);
    for (let i = 0; i < t.length; i += 3) {
      const a = P[t[i]], b = P[t[i + 1]], c = P[t[i + 2]];
      const A = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
      const k = Math.floor(((a[1] + b[1] + c[1]) / 3 - y0) / cs) * nx + Math.floor(((a[0] + b[0] + c[0]) / 3 - x0) / cs);
      sw[k] += A; sz[k] += A * (a[2] + b[2] + c[2]) / 3;
    }
    const z = Array.from(sw, (w, k) => (w > 0 ? Math.round(sz[k] / w * 100) : null));
    const R = (q) => Math.round(q * 100) / 100;
    out.push({
      key: 'S|' + s.handle, kind: 'surface', layer: ss.filter((q) => q.volume).length > 1 ? 'سطح الفرق ' + (idx + 1) : 'سطح الفرق', handle: s.handle, color: 0, hex: '#f5b301',
      n: P.length, tris: t.length / 3, area: +v.area.toFixed(3), fill: +v.fill.toFixed(3), cut: +v.cut.toFixed(3), length: 0, paint: 0,
      zmin: +s.zmin.toFixed(3), zmax: +s.zmax.toFixed(3), maxEdge: 30, items: [],
      ext: [R(x0 - ox), R(y0 - oy), R(x1 - ox), R(y1 - oy)],
      geom: [{ t: 'g', x0: R(x0 - ox), y0: R(y0 - oy), cs: +cs.toFixed(3), nx, ny, z }],
    });
  });
  return { groups: out, other };
}

// عدد عناصر Civil 3D حسب النوع (محاور، كوريدور، قطاعات، سطوح ...)
function civilCounts(J) {
  const cls = {}; (J.CLASSES || []).forEach((c) => { cls[c.number] = c.dxfname; });
  const n = {}; for (const o of J.OBJECTS || []) { const k = cls[o.type]; if (o.entity === 'UNKNOWN_ENT' && k && /^AEC/.test(k)) n[k] = (n[k] || 0) + 1; }
  return n;
}

module.exports = { civilCounts, surfaces, surfaceGroups, decodePoints, volumeOf };
