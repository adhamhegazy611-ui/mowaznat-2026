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
  console.log('analyzed status', out.c, 'in', Date.now() - t0, 'ms', out.o.error || '', (out.o.groups || []).length, 'groups');
  if (out.c !== 200 || !out.o.groups) return call('finish', { id: job.id, ok: false, error: out.o.error || 'تعذّر قراءة اللوحة' });
  const up = await realFetch(job.upload, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify(out.o) });
  if (!up.ok) return call('finish', { id: job.id, ok: false, error: 'رفع النتيجة ' + up.status });
  return call('finish', { id: job.id, ok: true });
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
