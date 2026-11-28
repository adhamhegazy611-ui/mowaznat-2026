// تجربة: مقارنة سطوح اللوحة (الأرض الطبيعية) بنموذج الارتفاعات العالمي Copernicus DEM GLO-30
// (رادار TanDEM-X 2011–2015 — نفس الداتا اللي Google Earth Engine بيستخدمها). بيتشغل على سيرفر GitHub بس.
// مبيطبعش أي إحداثيات أو أرقام مشروع في اللوج — النتيجة بتتحفظ في ملخص الشغلانة في قاعدة البيانات.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const DEPS = '/tmp/demdeps';
function deps() {
  if (!fs.existsSync(DEPS + '/node_modules/geotiff') || !fs.existsSync(DEPS + '/node_modules/proj4')) {
    fs.mkdirSync(DEPS, { recursive: true }); fs.writeFileSync(DEPS + '/package.json', '{}');
    cp.execSync('npm i --no-audit --no-fund --silent geotiff@2.1.3 proj4@2.11.0', { cwd: DEPS, stdio: 'ignore', timeout: 180000 });
  }
  return { proj4: require(DEPS + '/node_modules/proj4'), GT: require(DEPS + '/node_modules/geotiff') };
}
const CRS = {
  'UTM 35N': '+proj=utm +zone=35 +datum=WGS84 +units=m',
  'UTM 36N': '+proj=utm +zone=36 +datum=WGS84 +units=m',
  'UTM 37N': '+proj=utm +zone=37 +datum=WGS84 +units=m',
  'الحزام الأحمر': '+proj=tmerc +lat_0=30 +lon_0=31 +k=1 +x_0=615000 +y_0=810000 +ellps=helmert +towgs84=-130,110,-13,0,0,0,0 +units=m',
  'الحزام البنفسجي': '+proj=tmerc +lat_0=30 +lon_0=27 +k=1 +x_0=700000 +y_0=200000 +ellps=helmert +towgs84=-130,110,-13,0,0,0,0 +units=m',
  'البنفسجي الممتد': '+proj=tmerc +lat_0=30 +lon_0=27 +k=1 +x_0=700000 +y_0=1200000 +ellps=helmert +towgs84=-130,110,-13,0,0,0,0 +units=m',
  'الحزام الأزرق': '+proj=tmerc +lat_0=30 +lon_0=35 +k=1 +x_0=300000 +y_0=1100000 +ellps=helmert +towgs84=-130,110,-13,0,0,0,0 +units=m',
};
const tileUrl = (lat, lon) => { const a = (lat >= 0 ? 'N' : 'S') + String(Math.abs(lat)).padStart(2, '0') + '_00', o = (lon >= 0 ? 'E' : 'W') + String(Math.abs(lon)).padStart(3, '0') + '_00', n = 'Copernicus_DSM_COG_10_' + a + '_' + o + '_DEM'; return 'https://copernicus-dem-30m.s3.amazonaws.com/' + n + '/' + n + '.tif'; };
// قراءة الارتفاع لنقط كتير: بنقرا نافذة واحدة من كل بلاطة (درجة × درجة) تغطي النقط
async function sampler(GT) {
  const cache = new Map();
  const tile = async (la, lo) => { const k = la + ',' + lo; if (!cache.has(k)) cache.set(k, GT.fromUrl(tileUrl(la, lo)).then((t) => t.getImage()).catch(() => null)); return cache.get(k); };
  return async (pts) => { // pts: [[lon,lat]] → ارتفاعات (bilinear)
    const out = new Array(pts.length).fill(null), by = new Map();
    pts.forEach((p, i) => { const k = Math.floor(p[1]) + ',' + Math.floor(p[0]); (by.get(k) || by.set(k, []).get(k)).push(i); });
    for (const [k, idx] of by) {
      const [la, lo] = k.split(',').map(Number), im = await tile(la, lo); if (!im) continue;
      const W = im.getWidth(), H = im.getHeight(), [ox, oy] = im.getOrigin(), [rx, ry] = im.getResolution();
      const px = idx.map((i) => [(pts[i][0] - ox) / rx - 0.5, (pts[i][1] - oy) / ry - 0.5]);
      const x0 = Math.max(0, Math.floor(Math.min(...px.map((p) => p[0])))), x1 = Math.min(W - 1, Math.ceil(Math.max(...px.map((p) => p[0]))) + 1);
      const y0 = Math.max(0, Math.floor(Math.min(...px.map((p) => p[1])))), y1 = Math.min(H - 1, Math.ceil(Math.max(...px.map((p) => p[1]))) + 1);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4e7) continue;
      const r = (await im.readRasters({ window: [x0, y0, x1 + 1, y1 + 1], samples: [0] }))[0], ww = x1 - x0 + 1;
      idx.forEach((i, j) => {
        const fx = px[j][0] - x0, fy = px[j][1] - y0, ix = Math.floor(fx), iy = Math.floor(fy); if (ix < 0 || iy < 0 || ix + 1 >= ww || iy + 1 > y1 - y0) return;
        const g = (a, b) => r[(iy + b) * ww + ix + a], tx = fx - ix, ty = fy - iy;
        const v = g(0, 0) * (1 - tx) * (1 - ty) + g(1, 0) * tx * (1 - ty) + g(0, 1) * (1 - tx) * ty + g(1, 1) * tx * ty;
        if (isFinite(v) && v > -500) out[i] = v;
      });
    }
    return out;
  };
}
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
function stats(d) {
  const n = d.length; if (!n) return null; const m = d.reduce((t, x) => t + x, 0) / n, sd = Math.sqrt(d.reduce((t, x) => t + (x - m) ** 2, 0) / n), md = q(d, 0.5);
  return { n, mean: r2(m), median: r2(md), sd: r2(sd), p10: r2(q(d, 0.1)), p90: r2(q(d, 0.9)), gt1: r2(100 * d.filter((x) => Math.abs(x - md) > 1).length / n), gt2: r2(100 * d.filter((x) => Math.abs(x - md) > 2).length / n) };
}
// buf = ملف DWG. بيرجع مقارنة كل سطح بالـ DEM + أنسب نظام إحداثيات
async function demCheck(buf, groups) {
  const t0 = Date.now(); const { proj4, GT } = deps();
  const S = require('../api/_lib/surf.js'), f = '/tmp/dem_in.dwg'; fs.writeFileSync(f, buf);
  const p = cp.spawn(path.join(__dirname, '../api/_bin/dwgread'), ['-O', 'JSON', f], { stdio: ['ignore', 'pipe', 'ignore'] });
  const sc = await S.scanDwgStream(p.stdout); const ss = S.surfaces(sc).filter((s) => s.tin && s.tin.V && s.tin.V.length > 10);
  const el = ss.filter((s) => !s.volume);
  if (!ss.length) return { note: 'مفيش سطوح' };
  const pick = (V, n) => { const st = Math.max(1, Math.floor(V.length / n)), o = []; for (let i = 0; i < V.length && o.length < n; i += st) o.push(V[i]); return o; };
  const smp = await sampler(GT);
  // نظام الإحداثيات: اللي بيوقّع النقط جوه مصر وأقرب فرق مع الـ DEM
  const ref = el.slice().sort((a, b) => b.tin.V.length - a.tin.V.length)[0], rp = pick(ref.tin.V, 300);
  let best = null; const tried = [];
  for (const [nm, def] of Object.entries(CRS)) {
    let ll; try { ll = rp.map((v) => proj4(def, 'WGS84', [v[0], v[1]])); } catch (e) { continue; }
    const c = ll[Math.floor(ll.length / 2)]; if (!(c[1] > 21 && c[1] < 32.5 && c[0] > 24 && c[0] < 37)) continue;
    const z = await smp(ll), d = []; z.forEach((h, i) => { if (h != null) d.push(h - rp[i][2]); });
    if (d.length < 20) continue; const mad = q(d.map((x) => Math.abs(x - q(d, 0.5))), 0.5);
    tried.push([nm, d.length, r2(q(d, 0.5)), r2(mad)]);
    if (!best || mad < best.mad) best = { nm, def, mad };
  }
  if (!best) return { note: 'معرفتش أحدد مكان اللوحة على الخريطة', tried };
  const res = { crs: best.nm, tried, surfaces: [], ms: 0 };
  for (const s of el.slice(0, 60)) {
    const V = pick(s.tin.V, 1500), ll = V.map((v) => proj4(best.def, 'WGS84', [v[0], v[1]])), z = await smp(ll), d = [];
    z.forEach((h, i) => { if (h != null) d.push(h - V[i][2]); });
    res.surfaces.push({ name: s.name, pts: s.tin.V.length, area: Math.round(s.area || 0), ...stats(d) });
    if (Date.now() - t0 > 400000) break;
  }
  // الكميات لو الأرض الطبيعية = الـ DEM بدل سطح اللوحة: نفس التصميم، على شبكة 5م جوه حدود سطح التصميم
  res.pairs = [];
  const tins = ss.filter((s) => !s.volume), big = tins.slice().sort((a, b) => b.area - a.area)[0];
  const pairs = (groups || []).filter((g) => g.src === 's2s' && g.baseName && g.compName).sort((a, b) => (b.cut + b.fill) - (a.cut + a.fill)).slice(0, 4);
  for (const g of pairs) {
    const B = tins.find((s) => s.name === g.baseName), C = tins.find((s) => s.name === g.compName); if (!B || !C) continue;
    const zc = S.tinLookup(C.tin), zb = S.tinLookup(B.tin); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    C.tin.V.forEach((v) => { if (v[0] < x0) x0 = v[0]; if (v[0] > x1) x1 = v[0]; if (v[1] < y0) y0 = v[1]; if (v[1] > y1) y1 = v[1]; });
    const step = Math.max(5, Math.sqrt((x1 - x0) * (y1 - y0) / 60000)), P = [];
    for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) { const c = zc(x, y), b = zb(x, y); if (c != null && b != null) P.push([x, y, c, b]); }
    if (!P.length) continue;
    const z = await smp(P.map((p2) => proj4(best.def, 'WGS84', [p2[0], p2[1]]))), A = step * step;
    let cs = 0, fs2 = 0, cd = 0, fd = 0, c2 = 0, f2 = 0, k = 0; const dd = [], dc = [];
    P.forEach((p2, i) => { const h = z[i]; if (h == null) return; k++; const db = p2[2] - p2[3], dm = p2[2] - h, dn = h - p2[3]; if (db > 0) fs2 += db * A; else cs -= db * A; if (dm > 0) fd += dm * A; else cd -= dm * A; if (dn > 0) f2 += dn * A; else c2 -= dn * A; dd.push(h - p2[3]); dc.push(h - p2[2]); });
    // dem: الـ DEM مكان السطح الأول (الأساس) · dem2: الـ DEM مكان السطح التاني — (الحفر/الردم من الأساس للتاني)
    res.pairs.push({ layer: g.layer, base: g.baseName, comp: g.compName, step: r2(step), cells: k, area: Math.round(k * A), drawing: { cut: Math.round(cs), fill: Math.round(fs2) }, dem: { cut: Math.round(cd), fill: Math.round(fd) }, dem2: { cut: Math.round(c2), fill: Math.round(f2) }, baseDiff: stats(dd), compDiff: stats(dc) });
    if (Date.now() - t0 > 270000) break;
  }
  // ICESat-2 (ليزر ناسا 2018 → 2026): نقط أرض دقيقة (±0.3م) على مسارات بتعدي فوق المشروع
  try {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; el.forEach((s) => s.tin.V.forEach((v) => { if (v[0] < x0) x0 = v[0]; if (v[0] > x1) x1 = v[0]; if (v[1] < y0) y0 = v[1]; if (v[1] > y1) y1 = v[1]; }));
    const pad = 100, cn = [[x0 - pad, y0 - pad], [x1 + pad, y0 - pad], [x1 + pad, y1 + pad], [x0 - pad, y1 + pad], [x0 - pad, y0 - pad]].map((c) => proj4(best.def, 'WGS84', c));
    // مسارات ICESat-2 اللي عدت فوق المشروع (CMR بتاع ناسا) وبعدين قراءة جزئية لملفات ATL08 بتوكن Earthdata
    const lo = cn.map((c) => c[0]), la = cn.map((c) => c[1]), bbox = [Math.min(...lo), Math.min(...la), Math.max(...lo), Math.max(...la)];
    const g = await (await fetch('https://cmr.earthdata.nasa.gov/search/granules.json?short_name=ATL08&version=007&bounding_box=' + bbox.map((v) => v.toFixed(5)).join(',') + '&page_size=500&sort_key=start_date')).json();
    const ents = (g.feed && g.feed.entry) || [];
    const urls = ents.map((e) => ((e.links || []).find((l) => /^https:\/\/data\.nsidc\.earthdatacloud.*\.h5$/.test(l.href)) || {}).href).filter(Boolean);
    res.cmr = { n: ents.length, urls: urls.length };
    fs.writeFileSync('/tmp/is2_in.json', JSON.stringify({ bbox, urls }));
    cp.execSync('pip install -q h5py requests pyproj numpy >/dev/null 2>&1 || pip install -q --break-system-packages h5py requests pyproj numpy >/dev/null 2>&1', { stdio: 'ignore', timeout: 240000 });
    cp.execSync('python3 ' + path.join(__dirname, 'is2.py'), { stdio: 'inherit', timeout: 900000 });
    const J = JSON.parse(fs.readFileSync('/tmp/is2_out.json', 'utf8'));
    const is2 = { n: J.pts.length, err: J.err, files: J.files, fail: J.fail, dates: {}, surfaces: [] };
    J.pts.forEach((p2) => { is2.dates[p2[3]] = (is2.dates[p2[3]] || 0) + 1; });
    if (J.pts.length) {
      const xy = J.pts.map((p2) => proj4('WGS84', best.def, [p2[1], p2[0]]));
      const zd = await smp(J.pts.map((p2) => [p2[1], p2[0]]));
      const dd = []; J.pts.forEach((p2, i) => { if (zd[i] != null) dd.push(p2[2] - zd[i]); }); is2.vsCopernicus = stats(dd); // الأرض اتغيرت قد إيه من 2015
      for (const s of el) {
        const f = S.tinLookup(s.tin), d = [], byd = {};
        J.pts.forEach((p2, i) => { const z = f(xy[i][0], xy[i][1]); if (z == null) return; const v = p2[2] - z; d.push(v); (byd[p2[3]] || (byd[p2[3]] = [])).push(v); });
        if (d.length) is2.surfaces.push({ name: s.name, ...stats(d), byDate: Object.fromEntries(Object.entries(byd).map(([k, v]) => [k, [v.length, r2(q(v, 0.5))]])) });
      }
    }
    res.is2 = is2;
  } catch (e) { res.is2 = { err: String(e && e.message || e).slice(0, 300) }; }
  const c0 = proj4(best.def, 'WGS84', [rp[0][0], rp[0][1]]); res.at = [r2(c0[1]), r2(c0[0])];
  res.ms = Date.now() - t0;
  return res;
}
module.exports = { demCheck };
