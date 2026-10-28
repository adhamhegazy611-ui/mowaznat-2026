import { useEffect, useState } from 'react'
import { api, DEMO } from '../lib/api'
import type { Profile, Reviewer, Role } from '../lib/types'

const ROLE_AR: Record<Role, string> = { admin: 'مدير (كل الصلاحيات)', editor: 'محرر (إضافة وتعديل)', viewer: 'مشاهد (عرض فقط)' }

export default function AdminPage({ reviewers, reloadReviewers, toast, me }: {
  reviewers: Reviewer[]
  reloadReviewers: () => void
  toast: (m: string) => void
  me: string
}) {
  const [users, setUsers] = useState<Profile[] | null>(null)
  const [newName, setNewName] = useState('')
  const [names, setNames] = useState<Record<number, string>>({})

  const loadUsers = () => api.listProfiles().then(setUsers).catch((e) => toast(e.message))
  useEffect(() => {
    void loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn()
      toast(ok)
      reloadReviewers()
    } catch (e) {
      toast('خطأ: ' + (e as Error).message)
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>الإدارة</h1>
      </div>
      <div className="two">
        <div className="card">
          <h3>المراجعين</h3>
          <p style={{ marginTop: -6, color: 'var(--ink-3)', fontSize: 13 }}>
            دي القائمة المنسدلة اللي بتظهر في أعمدة المراجع والتسعير والعقود والذاتي (زي X1:AD1 في الشيت).
          </p>
          {reviewers.map((r, i) => (
            <div className="rev-row" key={r.id}>
              <input
                type="text"
                value={names[r.id] ?? r.name}
                onChange={(e) => setNames({ ...names, [r.id]: e.target.value })}
                onBlur={() => {
                  const v = (names[r.id] ?? r.name).trim()
                  if (v && v !== r.name) void run(() => api.saveReviewer({ ...r, name: v }), 'اتغيّر الاسم ✓')
                }}
              />
              <button
                className="btn small"
                disabled={i === 0}
                title="لفوق"
                onClick={() =>
                  void run(async () => {
                    const prev = reviewers[i - 1]
                    await api.saveReviewer({ ...r, sort_order: prev.sort_order })
                    await api.saveReviewer({ ...prev, sort_order: r.sort_order === prev.sort_order ? r.sort_order + 1 : r.sort_order })
                  }, 'اتغيّر الترتيب')
                }
              >
                ↑
              </button>
              <label className="muted">
                <input
                  type="checkbox"
                  checked={r.active}
                  onChange={(e) => void run(() => api.saveReviewer({ ...r, active: e.target.checked }), 'اتحفظ ✓')}
                />{' '}
                نشط
              </label>
              <button
                className="btn small danger"
                onClick={() => confirm(`حذف ${r.name} من القائمة؟ (المشاريع المسجّلة باسمه هتفضل زي ما هي)`) && void run(() => api.deleteReviewer(r.id), 'اتحذف')}
              >
                حذف
              </button>
            </div>
          ))}
          <form
            className="rev-row"
            onSubmit={(e) => {
              e.preventDefault()
              const v = newName.trim()
              if (!v) return
              void run(() => api.saveReviewer({ name: v, sort_order: (reviewers.at(-1)?.sort_order ?? 0) + 1 }), 'اتضاف ✓')
              setNewName('')
            }}
          >
            <input type="text" placeholder="اسم مراجع جديد" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn small primary">إضافة</button>
          </form>
        </div>

        <div className="card">
          <h3>المستخدمين والصلاحيات</h3>
          {DEMO ? (
            <p style={{ color: 'var(--ink-3)' }}>في الوضع التجريبي مفيش مستخدمين. بعد ربط Supabase أي حد يسجّل هيظهر هنا وتقدر تدّيله صلاحية.</p>
          ) : users == null ? (
            <div className="spinner">جاري التحميل…</div>
          ) : (
            <div className="table-scroll">
              <table className="plain">
                <thead>
                  <tr>
                    <th>اسم المستخدم</th>
                    
                    <th>الصلاحية</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name}</td>
                      <td>
                        <select
                          value={u.role ?? ''}
                          disabled={u.id === me}
                          onChange={async (e) => {
                            try {
                              await api.setRole(u.id, (e.target.value || null) as Role | null)
                              toast('اتغيّرت الصلاحية ✓')
                              void loadUsers()
                            } catch (err) {
                              toast('خطأ: ' + (err as Error).message)
                            }
                          }}
                        >
                          <option value="">بدون دخول</option>
                          {(Object.keys(ROLE_AR) as Role[]).map((r) => (
                            <option key={r} value={r}>{ROLE_AR[r]}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ color: 'var(--ink-3)', fontSize: 12.5, marginBottom: 0 }}>
            دي نفس حسابات «متابعة المقايسات». الحساب الجديد بيتعمل ويتوافق عليه هناك، وبعدها تدّيله صلاحية على «موازنات» من هنا.
          </p>
        </div>
      </div>
    </>
  )
}
