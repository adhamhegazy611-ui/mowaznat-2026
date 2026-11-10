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
function surfaces(src) {
  // src: ناتج scanDwgJson أو JSON كامل من dwgread
  let list;
  if (src && src.tins) list = src.tins.map((o) => ({ handle: o.handle, layer: null, bits: o.bits }));
  else { const J = typeof src === 'string' ? JSON.parse(src) : src; const cls = {}; (J.CLASSES || []).forEach((c) => { cls[c.number] = c.dxfname; });
    list = (J.OBJECTS || []).filter((o) => o.entity === 'UNKNOWN_ENT' && /TIN_SURFACE|VOLUME_SURFACE/i.test(cls[o.type] || '') && o.unknown_bits).map((o) => ({ handle: Array.isArray(o.handle) ? o.handle[2] : o.handle, layer: Array.isArray(o.layer) ? o.layer[2] : null, bits: o.unknown_bits })); }
  const out = [];
  for (const o of list) {
    let t = null; try { t = decodeTin(o.bits); } catch (e) { t = null; }
    if (t && t.T && t.T.length) {
      // المثلثات الظاهرة بس (اللي Civil حاسبها) — نفس أرقام Volume Dashboard
      const used = new Set(); t.T.forEach((tr) => tr.forEach((i) => used.add(i)));
      const zs = [...used].map((i) => t.V[i][2]).sort((a, b) => a - b), med = zs[zs.length >> 1];
      const s = { handle: o.handle, layer: o.layer, points: used.size, zmin: zs[0], zmax: zs[zs.length - 1], tin: t, exact: true };
      s.volume = Math.abs(med) < 15 && zs[0] < 0 && zs[zs.length - 1] > 0 && zs.filter((z) => Math.abs(z) < 30).length > zs.length * 0.9;
      const v = tinVolume(t); s.area = v.area;
      if (s.volume) Object.assign(s, { fill: v.fill, cut: v.cut, _v: { P: t.V, tris: flat3(t.T) } });
      out.push(s); continue;
    }
    // احتياطي: النقط بس (الطريقة القديمة)
    const pts = decodePoints(o.bits); if (!pts || pts.length < 10) continue;
    const zs = pts.map((p) => p[2]).sort((a, b) => a - b), med = zs[zs.length >> 1];
    const s = { handle: o.handle, layer: o.layer, points: pts.length, zmin: zs[0], zmax: zs[zs.length - 1] };
    const small = pts.filter((p) => Math.abs(p[2]) < 30);
    s.volume = Math.abs(med) < 15 && small.length > pts.length * 0.9 && zs[0] < 0 && zs[zs.length - 1] > 0;
    if (s.volume) { const v = volumeOf(small); Object.assign(s, { area: v.area, fill: v.fill, cut: v.cut, points: v.P.length, _v: v }); }
    out.push(s);
  }
  return out;
}



const flat3 = (T) => { const o = new Int32Array(T.length * 3); for (let i = 0; i < T.length; i++) { o[3 * i] = T[i][0]; o[3 * i + 1] = T[i][1]; o[3 * i + 2] = T[i][2]; } return o; };
// ===== قراءة مثلثات سطح Civil 3D بالظبط (النقط + المثلثات + المخفي منها) =====
function decodeTin(hex) {
  const n8 = hex.length >> 1, raw = new Uint8Array(n8); for (let i = 0; i < n8; i++) raw[i] = parseInt(hex.substr(i * 2, 2), 16);
  const plaus = (v) => isFinite(v) && Math.abs(v) > 1e3 && Math.abs(v) < 1e8;
  // bit-level reader
  const byteAt = (bp) => { const i = bp >> 3, s = bp & 7; return s ? ((raw[i] << s) | (raw[i + 1] >> (8 - s))) & 255 : raw[i]; };
  const tmp = new DataView(new ArrayBuffer(8));
  const f64 = (bp) => { for (let k = 0; k < 8; k++) tmp.setUint8(k, byteAt(bp + 8 * k)); return tmp.getFloat64(0, true); };
  const i32 = (bp) => { for (let k = 0; k < 4; k++) tmp.setUint8(k, byteAt(bp + 8 * k)); return tmp.getInt32(0, true); };
  const NB = n8 * 8 - 64;
  // 1) find vertex block: records of 32 bytes (x,y,z,int,int); search best bit offset in first part
  let best = null;
  for (let s = 0; s < 8; s++) for (let a = 0; a < 32; a++) {
    // quick scan: count plausible x,y at stride 32 bytes starting at byte a
    let c = 0, first = -1, run = 0, bestRun = 0, bestFirst = -1;
    for (let bp = a * 8 + s; bp + 256 < NB && c < 400000; bp += 256) {
      if (plaus(f64(bp)) && plaus(f64(bp + 64))) { if (run === 0) first = bp; run++; if (run > bestRun) { bestRun = run; bestFirst = first; } } else run = 0;
      c++; if (c > 2000 && bestRun < 10) break;
    }
    if (!best || bestRun > best.n) best = { n: bestRun, bp: bestFirst };
  }
  if (!best || best.n < 3) return null;
  const V = []; for (let i = 0, bp = best.bp; i < best.n; i++, bp += 256) V.push([f64(bp), f64(bp + 64), f64(bp + 128)]);
  // the run may stop one short if the last record is partial (x,y,z only) — include it if x,y plausible
  { const bp = best.bp + best.n * 256; if (plaus(f64(bp)) && plaus(f64(bp + 64))) V.push([f64(bp), f64(bp + 64), f64(bp + 128)]); }
  const NV = V.length, vend = best.bp + NV * 256;
  // 2) find triangle block: count then records of 8 int32 (v1 v2 v3 n1 n2 n3 flag -1)
  const okRec = (bp, C) => { const v1 = i32(bp), v2 = i32(bp + 32), v3 = i32(bp + 64), e = i32(bp + 224); if (e !== -1) return false; if (v1 < 0 || v2 < 0 || v3 < 0 || v1 >= NV || v2 >= NV || v3 >= NV) return false; for (let k = 3; k < 6; k++) { const nb = i32(bp + 32 * k); if (nb < -1 || nb >= C) return false; } return true; };
  let tb = -1, C = 0;
  for (let bp = vend - 512; bp < vend + 4096 && tb < 0; bp++) { const c = i32(bp); if (c < 1 || c > 50e6) continue; let ok = true; for (let k = 0; k < 20 && ok; k++) ok = okRec(bp + 32 + k * 256, c); if (ok) { tb = bp + 32; C = c; } }
  if (tb < 0) return { V, T: null };
  const T = []; let hid = 0;
  for (let i = 0; i < C; i++) { const bp = tb + i * 256; if (bp + 256 > NB) break; const f = i32(bp + 192); if (f & 1) { hid++; continue; } T.push([i32(bp), i32(bp + 32), i32(bp + 64)]); }
  return { V, T, C, hid };
}
function posVol2(A, z1, z2, z3) { const z = [z1, z2, z3].sort((p, q) => p - q); const [a, b, c] = z, tot = A * (a + b + c) / 3; if (a >= 0) return tot; if (b >= 0) return tot - A * a * a * a / ((a - b) * (a - c)) / 3; if (c > 0) return A * c * c * c / ((c - a) * (c - b)) / 3; return 0; }
function tinVolume(t) { let area = 0, fill = 0, cut = 0; for (const [i, j, k] of t.T) { const a = t.V[i], b = t.V[j], c = t.V[k]; const A = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2; area += A; fill += posVol2(A, a[2], b[2], c[2]); cut += posVol2(A, -a[2], -b[2], -c[2]); } return { area, fill, cut }; }

// ===== حجم Surface to Surface بالظبط: تقاطع مثلثات السطحين =====
function planes(t) { return t.T.map(([i, j, k]) => { const a = t.V[i], b = t.V[j], c = t.V[k]; const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; const nz = ux * vy - uy * vx; if (Math.abs(nz) < 1e-12) return null; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz; // z = a.z - (nx (x-ax) + ny (y-ay))/nz
    return { p: [a, b, c], ax: a[0], ay: a[1], az: a[2], gx: -nx / nz, gy: -ny / nz, z0: Math.min(a[2], b[2], c[2]), z1: Math.max(a[2], b[2], c[2]), x0: Math.min(a[0], b[0], c[0]), x1: Math.max(a[0], b[0], c[0]), y0: Math.min(a[1], b[1], c[1]), y1: Math.max(a[1], b[1], c[1]) }; }).filter(Boolean); }
const zAt = (P, x, y) => { const z = P.az + P.gx * (x - P.ax) + P.gy * (y - P.ay); return Math.min(P.z1, Math.max(P.z0, z)); };
function clip(poly, a, b) { // keep left side of edge a->b (CCW triangles)
  const out = []; const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p); if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); } }
  return out; }
const ccw = (p) => { const [a, b, c] = p; return ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 0 ? p : [a, c, b]; };
const polyArea = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
function integ(poly, d) { // ∫d (linear) over polygon = area * d(centroid)
  if (poly.length < 3) return 0; const A = polyArea(poly); if (Math.abs(A) < 1e-12) return 0;
  let cx = 0, cy = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], f = p[0] * q[1] - q[0] * p[1]; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; }
  cx /= 6 * A; cy /= 6 * A; return Math.abs(A) * d(cx, cy); }
function halfPos(poly, d) { const out = []; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], dp = d(p[0], p[1]), dq = d(q[0], q[1]); if (dp >= 0) out.push(p); if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); } } return out; }
function s2s(A0, B0) {
  // local coordinates (precision) — shift both surfaces by the same origin
  const ox = A0.V[0][0], oy = A0.V[0][1], sh = (t) => ({ T: t.T, V: t.V.map((v) => [v[0] - ox, v[1] - oy, v[2]]) });
  const A = sh(A0), B = sh(B0);
  const PA = planes(A), PB = planes(B);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; PA.forEach((p) => { x0 = Math.min(x0, p.x0); y0 = Math.min(y0, p.y0); x1 = Math.max(x1, p.x1); y1 = Math.max(y1, p.y1); });
  const cs = Math.max(1, Math.sqrt((x1 - x0) * (y1 - y0) / Math.max(1, PA.length)) * 2), G = new Map(), key = (i, j) => i * 1e6 + j;
  PA.forEach((p, n) => { for (let i = Math.floor((p.x0 - x0) / cs); i <= Math.floor((p.x1 - x0) / cs); i++) for (let j = Math.floor((p.y0 - y0) / cs); j <= Math.floor((p.y1 - y0) / cs); j++) { const k = key(i, j); let a = G.get(k); if (!a) G.set(k, a = []); a.push(n); } });
  let area = 0, fill = 0, cut = 0; const seen = new Int32Array(PA.length).fill(-1);
  PB.forEach((pb, nb) => {
    const tb = ccw(pb.p.map((v) => [v[0], v[1]]));
    for (let i = Math.floor((pb.x0 - x0) / cs); i <= Math.floor((pb.x1 - x0) / cs); i++) for (let j = Math.floor((pb.y0 - y0) / cs); j <= Math.floor((pb.y1 - y0) / cs); j++) {
      const a = G.get(key(i, j)); if (!a) continue;
      for (const na of a) { if (seen[na] === nb) continue; seen[na] = nb; const pa = PA[na]; if (pa.x1 < pb.x0 || pa.x0 > pb.x1 || pa.y1 < pb.y0 || pa.y0 > pb.y1) continue;
        const ta = ccw(pa.p.map((v) => [v[0], v[1]])); let poly = tb; for (let e = 0; e < 3 && poly.length; e++) poly = clip(poly, ta[e], ta[(e + 1) % 3]);
        if (poly.length < 3) continue; const ar = Math.abs(polyArea(poly)); if (ar < 1e-9) continue; area += ar;
        const d = (x, y) => zAt(pb, x, y) - zAt(pa, x, y), nd = (x, y) => -d(x, y);
        fill += integ(halfPos(poly, d), d); cut += integ(halfPos(poly, nd), nd); }
    }
  });
  return { area, fill, cut };
}

// قراءة خفيفة لناتج dwgread -O JSON من غير JSON.parse للملف كله (اللوح الكبيرة ممكن تبقى مئات الميجا)
function scanDwgJson(text) {
  const out = { classes: {}, tins: [], counts: {} };
  const ci = text.indexOf('"CLASSES": ['), oi = text.indexOf('"OBJECTS": [');
  if (ci >= 0 && oi > ci) { try { const seg = text.slice(ci + 11, text.lastIndexOf(']', oi) + 1).replace(/(-?)\b(nan|inf)\b/gi, 'null'); JSON.parse(seg).forEach((c) => { out.classes[c.number] = c.dxfname; }); } catch (e) { /* */ } }
  const re = /"entity": "UNKNOWN_ENT",\s*"index": \d+,\s*"type": (\d+),\s*"handle": \[\d+,\d+,(\d+)\]/g; let m;
  while ((m = re.exec(text))) {
    const ty = +m[1], dn = out.classes[ty] || ''; if (/^AEC/.test(dn)) out.counts[dn] = (out.counts[dn] || 0) + 1;
    if (!/TIN_SURFACE|VOLUME_SURFACE/i.test(dn)) continue;
    const ub = text.indexOf('"unknown_bits": "', m.index), nx = text.indexOf('"entity":', m.index + 20);
    if (ub < 0 || (nx >= 0 && ub > nx)) continue;
    const e = text.indexOf('"', ub + 17); out.tins.push({ handle: +m[2], cls: dn, bits: text.slice(ub + 17, e) }); re.lastIndex = e;
  }
  return out;
}

// مجموعات للحصر: كل سطح فرق = مجموعة «surface» فيها الردم والحفر + شبكة ألوان للعرض
function surfaceGroups(src, origin) {
  const ss = surfaces(src), out = [], vols = ss.filter((s) => s.volume), other = ss.length - vols.length;
  const R = (q) => Math.round(q * 100) / 100;
  let O = origin && isFinite(origin[0]) ? origin : null;
  // شبكة ألوان للعرض من المثلثات
  const grid = (P, t, d) => {
    const used = new Set(Array.from(t)); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    used.forEach((i) => { const p = P[i]; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; });
    if (!O) O = [x0, y0]; const ox = O[0], oy = O[1];
    const cs = Math.max((x1 - x0), (y1 - y0)) / 160 || 1, nx = Math.ceil((x1 - x0) / cs) + 1, ny = Math.ceil((y1 - y0) / cs) + 1;
    const sw = new Float64Array(nx * ny), sz = new Float64Array(nx * ny);
    for (let i = 0; i < t.length; i += 3) {
      const a = P[t[i]], b = P[t[i + 1]], c = P[t[i + 2]];
      const A = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
      const k = Math.floor(((a[1] + b[1] + c[1]) / 3 - y0) / cs) * nx + Math.floor(((a[0] + b[0] + c[0]) / 3 - x0) / cs);
      sw[k] += A; sz[k] += A * (d ? d(a, b, c) : (a[2] + b[2] + c[2]) / 3);
    }
    const z = Array.from(sw, (w, k) => (w > 0 ? Math.round(sz[k] / w * 100) : null));
    return { ext: [R(x0 - ox), R(y0 - oy), R(x1 - ox), R(y1 - oy)], geom: [{ t: 'g', x0: R(x0 - ox), y0: R(y0 - oy), cs: +cs.toFixed(3), nx, ny, z }] };
  };
  vols.forEach((s, idx) => {
    const g = grid(s._v.P, s._v.tris);
    out.push({
      key: 'S|' + s.handle, kind: 'surface', layer: vols.length > 1 ? 'سطح الفرق ' + (idx + 1) : 'سطح الفرق', handle: s.handle, color: 0, hex: '#f5b301', exact: !!s.exact,
      n: s.points, tris: s._v.tris.length / 3, area: +s.area.toFixed(3), fill: +s.fill.toFixed(3), cut: +s.cut.toFixed(3), length: 0, paint: 0,
      zmin: +s.zmin.toFixed(3), zmax: +s.zmax.toFixed(3), maxEdge: s.exact ? 0 : 30, items: [], ext: g.ext, geom: g.geom,
    });
  });
  // Surface to Surface: كل سطحين متداخلين (الأكبر = الأرض الطبيعية، الأصغر = التصميم)
  const tins = ss.filter((s) => !s.volume && s.exact && s.tin && s.tin.T.length).sort((a, b) => b.area - a.area);
  const pairs = [];
  for (let i = 0; i < tins.length; i++) for (let j = i + 1; j < tins.length; j++) {
    const A = tins[i], B = tins[j]; if (A.area < 1.5 * B.area) continue; if (A.zmax < B.zmin - 50 || B.zmax < A.zmin - 50) continue;
    let r; try { r = s2s(A.tin, B.tin); } catch (e) { continue; }
    if (r.area < 0.02 * B.area || r.area < 50) continue;
    pairs.push({ A, B, r, ia: i + 1, ib: j + 1 });
  }
  const lab = (s, n) => 'سطح ' + n + ' (منسوب ' + s.zmin.toFixed(1) + '–' + s.zmax.toFixed(1) + '، ' + Math.round(s.area).toLocaleString('en') + ' م²)';
  pairs.forEach(({ A, B, r, ia, ib }) => {
    const BT = B.tin, t = flat3(BT.T);
    const g = grid(BT.V, t);
    out.push({
      key: 'SS|' + A.handle + '|' + B.handle, kind: 'surface', src: 's2s', layer: 'من ' + lab(A, ia) + ' لـ ' + lab(B, ib), base: lab(A, ia), comp: lab(B, ib), handle: B.handle, color: 0, hex: '#22c55e', exact: true,
      n: B.points, tris: BT.T.length, area: +r.area.toFixed(3), fill: +r.fill.toFixed(3), cut: +r.cut.toFixed(3), length: 0, paint: 0,
      zmin: +B.zmin.toFixed(3), zmax: +B.zmax.toFixed(3), items: [], ext: g.ext, geom: g.geom,
    });
  });
  return { groups: out, other, tins: tins.length };
}

// عدد عناصر Civil 3D حسب النوع (محاور، كوريدور، قطاعات، سطوح ...)
function civilCounts(J) {
  if (J && J.counts) return J.counts;
  const cls = {}; (J.CLASSES || []).forEach((c) => { cls[c.number] = c.dxfname; });
  const n = {}; for (const o of J.OBJECTS || []) { const k = cls[o.type]; if (o.entity === 'UNKNOWN_ENT' && k && /^AEC/.test(k)) n[k] = (n[k] || 0) + 1; }
  return n;
}

module.exports = { civilCounts, surfaces, surfaceGroups, decodePoints, volumeOf, decodeTin, tinVolume, s2s, scanDwgJson };
