import { useEffect, useState } from 'react'
import { api, type SignupRequest } from '../lib/api'

const batOf = (u: string) => u.match(/\d+/)?.[0] ?? null

export default function SignupRequests({ onClose, onChanged, toast }: {
  onClose: () => void
  onChanged: () => void
  toast: (m: string) => void
}) {
  const [rows, setRows] = useState<SignupRequest[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => api.listSignupRequests().then(setRows).catch((e) => { toast('خطأ: ' + e.message); setRows([]) })
  useEffect(() => {
    void load()
  }, [])

  const approve = async (r: SignupRequest) => {
    setBusy(r.user_id)
    try {
      const bat = await api.approveSignup(r.user_id)
      toast(`اتقبل ✓ — ${r.username}: مشاهد لكتيبة ${bat} في المقايسات والموازنات`)
      await load()
      onChanged()
    } catch (e) {
      toast('خطأ: ' + (e as Error).message)
    }
    setBusy(null)
  }
  const reject = async (r: SignupRequest) => {
    if (!confirm(`رفض طلب ${r.username}؟ الحساب هيتمسح.`)) return
    setBusy(r.user_id)
    try {
      await api.rejectSignup(r.user_id)
      toast('اتحذف الطلب')
      await load()
      onChanged()
    } catch (e) {
      toast('خطأ: ' + (e as Error).message)
    }
    setBusy(null)
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(640px, 100%)' }}>
        <div className="modal-head">
          <h2>طلبات إنشاء الحسابات</h2>
          <button className="btn small ghost" onClick={onClose}>إغلاق ✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0, color: 'var(--ink-3)', fontSize: 13 }}>
            لما تقبل الطلب، الحساب بيبقى <b>مشاهد فقط</b> للكتيبة اللي رقمها في اسم الحساب (زي <b>k44</b> = كتيبة ٤٤)، في «متابعة المقايسات» و«موازنات»، ومش بيقدر يعدّل أي حاجة.
          </p>
          {rows == null ? (
            <div className="spinner">جاري التحميل…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '18px 0', color: 'var(--ink-3)', textAlign: 'center' }}>مفيش طلبات جديدة دلوقتي</div>
          ) : (
            rows.map((r) => {
              const bat = batOf(r.username)
              return (
                <div key={r.user_id} className="rev-row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <b dir="ltr">{r.username}</b>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                      {new Date(r.created_at).toLocaleString('ar-EG')} —{' '}
                      {bat ? <span>مشاهد لكتيبة <b>{bat}</b></span> : <span style={{ color: 'var(--no)' }}>الاسم مفيهوش رقم كتيبة — اقبله من «متابعة المقايسات»</span>}
                    </div>
                  </div>
                  <button className="btn small primary" disabled={!bat || busy === r.user_id} onClick={() => void approve(r)}>✓ قبول</button>
                  <button className="btn small danger" disabled={busy === r.user_id} onClick={() => void reject(r)}>✕ رفض</button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
