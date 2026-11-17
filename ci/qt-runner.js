// سيرفر اللوح الضخمة (GitHub Actions، ذاكرة 16 جيجا): بياخد الشغل من طابور qt_jobs ويحصر بنفس كود /api/qt
// التحقق بـ GitHub OIDC — مفيش أي سر متخزن هنا.
const FN = 'https://qadrtqtydtgzachfzpqw.supabase.co/functions/v1/qt-runner';
const STORE = 'https://qadrtqtydtgzachfzpqw.supabase.co/storage/v1/object/qt/';
const realFetch = global.fetch;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function oidc() {
  const r = await realFetch(process.env.ACTIONS_ID_TOKEN_REQUEST_URL + '&audience=qt-runner', { headers: { Authorization: 'Bearer ' + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN } });
  return (await r.json()).value;
}
let call = async function (action, extra) {
  const r = await realFetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await oidc()) }, body: JSON.stringify({ action, ...extra }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(action + ' ' + r.status + ' ' + JSON.stringify(j));
  return j;
};
async function run(job) {
  const t0 = Date.now(), parts = {};
  const names = /\.gzp(\d+)$/.test(job.path) ? job.urls.map((_, i) => job.path + '.' + i) : [job.path];
  for (let i = 0; i < job.urls.length; i++) { const r = await realFetch(job.urls[i]); if (!r.ok) throw new Error('download ' + r.status); parts[names[i]] = Buffer.from(await r.arrayBuffer()); }
  console.log('downloaded', Object.values(parts).reduce((s, b) => s + b.length, 0), 'bytes in', Date.now() - t0, 'ms');
  // نفس الـ handler بتاع Vercel، بس التخزين بيتقرا من اللي اتنزل
  global.fetch = async (u, o) => {
    if (typeof u === 'string' && u.startsWith(STORE)) { const k = decodeURIComponent(u.slice(STORE.length)); const b = parts[k]; if (!b) return { status: 404, ok: false }; return { status: 200, ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; }
    return realFetch(u, o);
  };
  const handler = require('../api/qt.js');
  const out = await new Promise((resolve) => {
    const res = { c: 200, setHeader() {}, status(c) { this.c = c; return this; }, json(o) { resolve({ c: this.c, o }); return this; } };
    handler({ method: 'POST', headers: { authorization: 'Bearer runner' }, body: { path: job.path }, query: {} }, res).catch((e) => resolve({ c: 500, o: { error: String(e && e.message || e) } }));
  });
  global.fetch = realFetch;
  try { // تشخيص: جمع المقارنات المنفصلة (نفس دالة الصفحة)
    const src = require('fs').readFileSync(require('path').join(__dirname, '../index.html'), 'utf8');
    const qtDisjoint = eval('(' + /function qtDisjoint[\s\S]*?\n}\n/.exec(src)[0] + ')');
    { const c = (out.o.groups || []).filter((g) => g.src === 's2s' && g.cut > 0.5 && g.cut / g.area < 15); const G = c.map((g) => (g.geom || []).find((t) => t && t.t === 'g'));
      const on = (g, x, y) => { const i = Math.floor((x - g.x0) / g.cs), j = Math.floor((y - g.y0) / g.cs); return i >= 0 && j >= 0 && i < g.nx && j < g.ny && g.z[j * g.nx + i] != null; };
      const cl = G.map((g) => { const o = []; if (g) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (g.z[j * g.nx + i] != null) o.push([g.x0 + (i + 0.5) * g.cs, g.y0 + (j + 0.5) * g.cs]); return o; });
      c.forEach((a, ia) => console.log('OV', a.layer, 'cells', cl[ia].length, 'cs', G[ia] && G[ia].cs, c.map((b, ib) => ib === ia || !G[ib] ? '' : Math.round(100 * cl[ia].filter(([x, y]) => on(G[ib], x, y)).length / Math.max(1, cl[ia].length))).join(','))); }
    for (const em of ['cut', 'fill']) { const d = qtDisjoint(out.o.groups || [], em); console.log('DJ', em, d ? d.length + ' parts = ' + d.reduce((t, g) => t + g[em], 0).toFixed(2) : 'null'); }
  } catch (e) { console.log('DJ fail', e.message); }
  // تشخيص: لو فيه عناصر Civil ومطلعش ولا سطح
  const ty = out.o.inv && out.o.inv.types || {};
  if (ty.ACAD_PROXY_ENTITY && !(out.o.groups || []).some((g) => g.kind === 'surface') && !/\.gzp/.test(job.path)) {
    try {
      const fs = require('fs'), f = '/tmp/dbg.dwg'; fs.writeFileSync(f, parts[job.path]);
      const r = require('child_process').spawnSync(require('path').join(__dirname, '../api/_bin/dwgread'), ['-O', 'JSON', '-o', '/tmp/dbg.json', f], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 600000 });
      console.log('DBG dwgread status', r.status, r.signal, 'stderr tail:', String(r.stderr || '').slice(-1500));
      const J = fs.existsSync('/tmp/dbg.json') ? fs.readFileSync('/tmp/dbg.json', 'latin1') : '';
      console.log('DBG json bytes', J.length, 'UNKNOWN_ENT', (J.match(/"entity": "UNKNOWN_ENT"/g) || []).length, 'UNKNOWN_OBJ', (J.match(/UNKNOWN_OBJ/g) || []).length);
      const ci = J.indexOf('"CLASSES": ['); console.log('DBG classes idx', ci, 'objects idx', J.indexOf('"OBJECTS": ['));
      console.log('DBG AEC classes', (J.slice(ci, ci + 400000).match(/"dxfname": "AEC[^"]*"/g) || []).slice(0, 60).join(' '));
      console.log('DBG head', J.slice(0, 600));
    } catch (e) { console.log('DBG fail', e.message); }
  }
  console.log('analyzed status', out.c, 'in', Date.now() - t0, 'ms', out.o.error || '', (out.o.groups || []).length, 'groups');
  if (out.c !== 200 || !out.o.groups) return call('finish', { id: job.id, ok: false, error: out.o.error || 'تعذّر قراءة اللوحة' });
  const up = await realFetch(job.upload, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify(out.o) });
  if (!up.ok) return call('finish', { id: job.id, ok: false, error: 'رفع النتيجة ' + up.status });
  // ملخص صغير للمجموعات (من غير الرسم) — للمراجعة من قاعدة البيانات
  const summary = (out.o.groups || []).slice(0, 400).map((g) => ({ kind: g.kind, layer: g.layer, pat: g.pat, color: g.color, n: g.n, area: g.area && +g.area.toFixed(3), length: g.length && +g.length.toFixed(3), paint: g.paint && +g.paint.toFixed(3), cut: g.cut && +g.cut.toFixed(2), fill: g.fill && +g.fill.toFixed(2), src: g.src, hid: g.hid, blk: g.blk, overlap: g.overlap, parts: g.items ? g.items.length : undefined }));
  return call('finish', { id: job.id, ok: true, summary: { groups: summary, warnings: out.o.warnings, bbox: out.o.bbox, inv: out.o.inv && { types: out.o.inv.types, civil: out.o.inv.civil, layerCount: out.o.inv.layerCount, texts: (out.o.inv.texts || []).slice(0, 150).map((t) => t.t) } } });
}
module.exports = { run, setCall: (f) => { call = f; } };
if (require.main === module) (async () => {
  const end = Date.now() + (+process.env.QT_POLL_SEC || 280) * 1000;
  while (Date.now() < end) {
    let c; try { c = await call('claim'); } catch (e) { console.log('claim failed', e.message); await sleep(15000); continue; }
    if (!c.job) { await sleep(c.retry ? 1000 : 15000); continue; }
    console.log('job', c.job.id);
    try { await run(c.job); } catch (e) { console.log('job failed', e.message); try { await call('finish', { id: c.job.id, ok: false, error: String(e.message).slice(0, 300) }); } catch (e2) { /* */ } }
  }
})();
