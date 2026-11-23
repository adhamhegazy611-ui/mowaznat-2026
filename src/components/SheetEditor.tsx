// تعديل شيت الموازنة جوه الموقع: الشيت اللي جاي من فولدر Drive بيتفتح في محرر Google Sheets
// التعديل بيتحفظ على Drive نفسه، والموقع بياخد النسخة الجديدة في التحديث (كل يوم ١٠ بالليل أو من «حدّث من Drive»)
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { api } from '../lib/api'
import { ZoomBar, useZoom } from './ZoomBar'

/** رقم ملف Drive من مسار الشيت (الشيتات اللي اتربطت من الفولدر بتتحفظ باسم drive-<id>.xlsx) */
export const driveIdOf = (path?: string | null) => (/drive-([\w-]{20,})\.\w+$/.exec(path || '') || [])[1] || ''

function Editor({ id, name, isAdmin, onClose }: { id: string; name: string; isAdmin: boolean; onClose: () => void }) {
  const url = 'https://docs.google.com/spreadsheets/d/' + id + '/edit?rtpof=true&sd=true'
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [z, setZ] = useZoom('se')
  const sync = async () => {
    setBusy(true); setMsg('⏳ بيحدّث الموقع من Drive…')
    try { const r = await api.driveSync(); setMsg('✓ ' + r.summary) } catch (e) { setMsg('⚠️ ' + (e as Error).message) }
    setBusy(false)
  }
  return (
    <div className="sv-back" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sv" style={{ width: 'min(1600px,100%)', height: '96vh' }}>
        <div className="sv-hd" style={{ flexWrap: 'wrap' }}>
          <b>{name || 'شيت الموازنة'}</b>
          <span className="sv-ro" style={{ background: '#fff4e0', color: '#9a5b00' }}>✏️ تعديل — بيتحفظ لوحده على Drive</span>
          <div style={{ display: 'flex', gap: 6, marginInlineStart: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
            <ZoomBar z={z} set={setZ} />
            {isAdmin && <button type="button" className="btn small" disabled={busy} onClick={() => void sync()}>💾 خلصت — حدّث الموقع</button>}
            <a className="btn small" href={url} target="_blank" rel="noopener noreferrer">↗ فتح في تاب جديد</a>
            <button type="button" className="btn small" onClick={onClose}>✕ إغلاق</button>
          </div>
          {msg && <div style={{ width: '100%', fontSize: 13, fontWeight: 600 }}>{msg}</div>}
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
          <iframe title="شيت الموازنة" src={url} allow="clipboard-read; clipboard-write"
            style={{ position: 'absolute', top: 0, left: 0, border: 0, background: '#fff', width: 100 / z + '%', height: 100 / z + '%', transform: 'scale(' + z + ')', transformOrigin: '0 0' }} />
        </div>
        <div style={{ fontSize: 12, color: '#5b6b63', padding: '6px 12px', borderTop: '1px solid #dfe5e1' }}>
          لازم تكون داخل على حساب Google اللي عنده صلاحية تعديل على الملف. لو الشيت مظهرش هنا، دوس «↗ فتح في تاب جديد».
        </div>
      </div>
    </div>
  )
}

/** بيفتح محرر الشيت لو الشيت جاي من Drive — بيرجّع false لو مش من Drive (ساعتها بيتنزّل زي الأول) */
export function editSheet(path: string, name?: string | null, isAdmin = false): boolean {
  const id = driveIdOf(path)
  if (!id) return false
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const close = () => { root.unmount(); host.remove() }
  root.render(<Editor id={id} name={name || ''} isAdmin={isAdmin} onClose={close} />)
  return true
}
