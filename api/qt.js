// /api/qt — حصر كميات لوحة: بيجيب الـ DWG من التخزين، يحوّله DXF، ويرجّع المجموعات (هاتش/خطوط/بلوكات) بكمياتها
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { analyze } = require('./_lib/qt');

const URL_ = 'https://qadrtqtydtgzachfzpqw.supabase.co';
const ANON = 'sb_publishable_YWBHuhE3Eb3Qs9VkOP1jEA_335B_9SB';

function bin() {
  const src = path.join(process.cwd(), 'api', '_bin', 'dwg2dxf');
  try { fs.accessSync(src, fs.constants.X_OK); return src; } catch (e) { /* ممكن الملف يتنسخ من غير صلاحية تشغيل */ }
  const dst = path.join(os.tmpdir(), 'dwg2dxf');
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
  const r = await fetch(URL_ + '/storage/v1/object/qt/' + p.split('/').map(encodeURIComponent).join('/'), { headers: { apikey: ANON, Authorization: 'Bearer ' + token } });
  if (r.status === 400 || r.status === 404) return res.status(404).json({ error: 'الملف مش موجود' });
  if (r.status === 401 || r.status === 403) return res.status(403).json({ error: 'مش مسموح' });
  if (!r.ok) return res.status(502).json({ error: 'storage ' + r.status });
  const buf = Buffer.from(await r.arrayBuffer());

  const id = Math.random().toString(36).slice(2);
  const tmpIn = path.join(os.tmpdir(), id + '.dwg'), tmpOut = path.join(os.tmpdir(), id + '.dxf');
  try {
    let dxf;
    if (/\.dxf$/i.test(p) || buf.subarray(0, 64).toString('latin1').includes('SECTION')) dxf = buf.toString('utf8');
    else {
      const head = buf.subarray(0, 6).toString('latin1');
      if (!/^AC\d{4}$/.test(head)) return res.status(400).json({ error: 'الملف مش DWG' });
      fs.writeFileSync(tmpIn, buf);
      const out = spawnSync(bin(), ['-y', '-o', tmpOut, tmpIn], { timeout: 50000, encoding: 'utf8', maxBuffer: 1 << 24 });
      if (!fs.existsSync(tmpOut)) return res.status(422).json({ error: 'تعذّر قراءة اللوحة', detail: String(out.stderr || out.error || '').slice(-400), version: head });
      dxf = fs.readFileSync(tmpOut, 'utf8');
    }
    const result = analyze(dxf);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: 'خطأ أثناء الحصر', detail: String(e && e.message || e).slice(0, 300) });
  } finally {
    for (const f of [tmpIn, tmpOut]) { try { fs.unlinkSync(f); } catch (e) { /* */ } }
  }
};
