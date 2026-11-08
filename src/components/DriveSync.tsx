import { useEffect, useState } from 'react'
import { api, type SyncEntry } from '../lib/api'

const when = (s: string) => new Date(s).toLocaleString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** التحديث من شيت «موقف المشاريع» على Google Drive — في صفحة الإدارة */
export default function DriveSync({ toast, reload }: { toast: (m: string) => void; reload: () => void }) {
  const [last, setLast] = useState<SyncEntry | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void api.lastSync().then(setLast).catch(() => {}) }, [])

  const run = async () => {
    setBusy(true)
    try {
      const r = await api.driveSync()
      setLast(r)
      toast('✓ ' + r.summary)
      reload()
    } catch (e) {
      toast('التحديث فشل: ' + (e as Error).message)
      void api.lastSync().then(setLast).catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3>التحديث من Google Drive</h3>
      <p style={{ marginTop: -6, color: 'var(--ink-3)', fontSize: 13 }}>
        الموقع بيتحدث لوحده كل يوم الصبح من شيت «موقف المشاريع» على Drive. الخانة الفاضية في الشيت مش بتمسح حاجة، ومفيش مشروع
        بيتحذف، ولينكات الملفات اللي في الموقع بتفضل زي ما هي.
      </p>
      {last && (
        <p style={{ fontSize: 13, margin: '0 0 10px', color: last.ok ? 'var(--ink-2)' : '#b42318' }}>
          {last.ok ? 'آخر تحديث: ' : '⚠️ آخر محاولة فشلت: '}<b>{when(last.at)}</b> — {last.summary}
        </p>
      )}
      <button className="btn primary" disabled={busy} onClick={run}>
        {busy ? '⏳ جاري التحديث…' : '🔄 حدّث من Drive دلوقتي'}
      </button>
    </div>
  )
}
