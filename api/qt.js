// /api/qt — حصر كميات لوحة: بيجيب الـ DWG من التخزين، يحوّله DXF، ويرجّع المجموعات (هاتش/خطوط/بلوكات) بكمياتها
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, fork } = require('child_process');
const zlib = require('zlib');
const { analyze } = require('./_lib/qt');

// شغل تقيل في عملية منفصلة (الذاكرة بترجع لما تخلص)
function work(msg, ms) {
  return new Promise((resolve, reject) => {
    const w = fork(path.join(__dirname, '_lib', 'worker.js'), [], { execArgv: ['--max-old-space-size=1700'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let done = false; const t = setTimeout(() => { if (!done) { done = true; w.kill('SIGKILL'); reject(new Error('timeout')); } }, ms);
    w.on('message', (m) => { if (done) return; done = true; clearTimeout(t); w.kill(); m.ok ? resolve(m.r) : reject(new Error(m.error)); });
    w.on('exit', (c, sig) => { if (done) return; done = true; clearTimeout(t); reject(new Error('worker exit ' + (sig || c))); });
    w.send(msg);
  });
}

const URL_ = 'https://qadrtqtydtgzachfzpqw.supabase.co';
const ANON = 'sb_publishable_YWBHuhE3Eb3Qs9VkOP1jEA_335B_9SB';

function bin(name = 'dwg2dxf') {
  const src = path.join(process.cwd(), 'api', '_bin', name);
  try { fs.accessSync(src, fs.constants.X_OK); return src; } catch (e) { /* ممكن الملف يتنسخ من غير صلاحية تشغيل */ }
  const dst = path.join(os.tmpdir(), name);
  if (!fs.existsSync(dst)) { fs.copyFileSync(src, dst); fs.chmodSync(dst, 0o755); }
  return dst;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.query && req.query.probe) { // فحص إن المحوّل شغال على السيرفر
    try { const o = spawnSync(bin(), ['--version'], { encoding: 'utf8', timeout: 10000 }); return res.status(200).json({ ok: o.status === 0, out: String(o.stdout || o.stderr || o.error || '').slice(0, 200) }); }
    catch (e) { return res.status(500).json({ ok: false, error: String(e.message || e) }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const p = String((body && body.path) || '');
  if (!/^[\w\-./]+$/.test(p) || p.includes('..')) return res.status(400).json({ error: 'bad path' });

  // اللوحة من التخزين بصلاحية المستخدم نفسه (التخزين مقفول على الأدمن)
  // اللوح الكبيرة متخزنة مضغوطة على أجزاء: «…dwg.gzpN» → الأجزاء «.0 … .N-1»
  const gm = /\.gzp(\d+)$/.exec(p), parts = gm ? Array.from({ length: Math.min(+gm[1], 20) }, (_, i) => p + '.' + i) : [p];
  const bufs = [];
  for (const pp of parts) {
    const r = await fetch(URL_ + '/storage/v1/object/qt/' + pp.split('/').map(encodeURIComponent).join('/'), { headers: { apikey: ANON, Authorization: 'Bearer ' + token } });
    if (r.status === 400 || r.status === 404) return res.status(404).json({ error: 'الملف مش موجود' });
    if (r.status === 401 || r.status === 403) return res.status(403).json({ error: 'مش مسموح' });
    if (!r.ok) return res.status(502).json({ error: 'storage ' + r.status });
    bufs.push(Buffer.from(await r.arrayBuffer()));
  }
  let buf = Buffer.concat(bufs); bufs.length = 0;
  if (gm) { try { buf = zlib.gunzipSync(buf); } catch (e) { return res.status(400).json({ error: 'تعذّر فك ضغط اللوحة' }); } }
  const big = buf.length > 40 * 1048576;

  const id = Math.random().toString(36).slice(2);
  const tmpIn = path.join(os.tmpdir(), id + '.dwg'), tmpOut = path.join(os.tmpdir(), id + '.dxf'), tmpJ = path.join(os.tmpdir(), id + '.json');
  try {
    let dxf, l1 = false;
    if (/\.dxf(\.gzp\d+)?$/i.test(p) || buf.subarray(0, 64).toString('latin1').includes('SECTION')) dxf = buf.toString('utf8');
    else {
      const head = buf.subarray(0, 6).toString('latin1');
      if (!/^AC\d{4}$/.test(head)) return res.status(400).json({ error: 'الملف مش DWG' });
      fs.writeFileSync(tmpIn, buf);
      buf = null;
      const out = spawnSync(bin(), ['-y', '-o', tmpOut, tmpIn], { timeout: big ? 170000 : 50000, encoding: 'utf8', maxBuffer: 1 << 24 });
      if (!fs.existsSync(tmpOut)) return res.status(422).json({ error: 'تعذّر قراءة اللوحة', detail: String(out.stderr || out.error || '').slice(-400), version: head });
      l1 = true;
    }
    // اللوح الكبيرة: التحليل في عملية منفصلة
    const result = dxf != null && dxf.length < 30e6 ? analyze(dxf, l1) : await work(dxf != null ? (fs.writeFileSync(tmpOut, dxf), { mode: 'dxf', file: tmpOut, unlink: true }) : { mode: 'dxf', file: tmpOut, latin1: true, unlink: true }, 200000);
    dxf = null;
    // سطوح Civil 3D: بتتقرا من بيانات الـ DWG الخام (dwg2dxf بيسيبها كعناصر Proxy)
    if (fs.existsSync(tmpIn) && result.warnings.some((w) => /Civil 3D/.test(w))) {
      try {
        // الـ JSON بيتقرا وهو طالع من dwgread (من غير ما يتكتب على الديسك — في اللوح الكبيرة بيوصل لمئات الميجات)
        const sg = await work({ mode: 'civ', bin: bin('dwgread'), file: tmpIn, origin: result.groups.length ? result.origin : null, timeout: big ? 120000 : 60000 }, big ? 200000 : 90000);
        {
          if (result.inv) result.inv.civil = sg.civil;
          if (sg.groups.length) {
            result.groups.unshift(...sg.groups);
            result.warnings = result.warnings.filter((w) => !/Civil 3D/.test(w));
            if (!result.groups.some((g) => g.kind !== 'surface')) { const e = sg.groups[0].ext; result.bbox = [0, 0, e[2], e[3]]; sg.groups.forEach((g) => { g.geom[0].x0 -= e[0]; g.geom[0].y0 -= e[1]; }); }
          }
        }
      } catch (e) { result.warnings.push('تعذّر قراءة سطوح Civil 3D'); }
    }
    result.warnings = result.warnings.filter((w) => !/Civil 3D/.test(w));
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: 'خطأ أثناء الحصر', detail: String(e && e.message || e).slice(0, 300) });
  } finally {
    for (const f of [tmpIn, tmpOut, tmpJ]) { try { fs.unlinkSync(f); } catch (e) { /* */ } }
  }
};
