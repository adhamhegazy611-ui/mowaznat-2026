import { useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { Project } from '../lib/types'
import { groupAndMatch, planChanges, readSheet, type SheetGroup } from '../lib/importStopped'

const HOW: Record<SheetGroup['how'], { label: string; cls: string }> = {
  alias: { label: 'متطابق', cls: 'ok' },
  exact: { label: 'متطابق', cls: 'ok' },
  guess: { label: 'اتأكد منه', cls: 'warn' },
  none: { label: 'مش لاقيه', cls: 'bad' },
  ignored: { label: 'متجاهَل', cls: 'muted' },
}

/** زرار «تحديث المقايسات المتوقفة من Excel» في صفحة الإدارة */
export default function ImportStopped({ projects, toast, reload }: {
  projects: Project[]
  toast: (m: string) => void
  reload: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [groups, setGroups] = useState<SheetGroup[] | null>(null)
  const [picked, setPicked] = useState<Record<string, number | null>>({}) // اختيارات المدير اليدوية
  const [zeroOthers, setZeroOthers] = useState(true)

  const sorted = useMemo(() => [...projects].sort((a, b) => a.sort_order - b.sort_order), [projects])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    try {
      const [rows, aliases] = await Promise.all([readSheet(f), api.listAliases()])
      setGroups(groupAndMatch(rows, projects, aliases))
      setPicked({})
      setFileName(f.name)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const effective = useMemo(
    () => (groups ?? []).map((g) => (g.key in picked ? { ...g, projectId: picked[g.key], how: (picked[g.key] == null ? 'ignored' : 'alias') as SheetGroup['how'] } : g)),
    [groups, picked],
  )
  const changes = useMemo(() => planChanges(effective, projects, zeroOthers), [effective, projects, zeroOthers])
  const total = effective.reduce((n, g) => n + g.rows.length, 0)
  const used = effective.filter((g) => g.projectId != null).reduce((n, g) => n + g.rows.length, 0)
  const unresolved = effective.filter((g) => g.how === 'none').length

  const apply = async () => {
    setBusy(true)
    try {
      // نحفظ الربط اللي اتعمل بإيد أو بالتخمين عشان المرة الجاية يتطابق لوحده
      const aliasRows = effective
        .filter((g) => g.how !== 'exact' && (g.key in picked || g.how === 'guess' || g.how === 'none'))
        .map((g) => ({ alias: g.key, project_id: g.projectId }))
      await api.saveAliases(aliasRows)
      for (const c of changes) await api.patchProject(c.id, c.to)
      toast(`اتحدّث ${changes.length} مشروع من الشيت ✓`)
      setGroups(null)
      reload()
    } catch (e) {
      toast('خطأ: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3>تحديث المقايسات المتوقفة من Excel</h3>
      <p style={{ marginTop: -6, color: 'var(--ink-3)', fontSize: 13 }}>
        ارفع شيت «موقف المقايسات المتوقفة» (الكتيبة / الشركة / المشروع / ملاحظات). الموقع هيعدّ المقايسات لكل مشروع ويكتب
        الملاحظات في «متوقف على»، وهيوريك كل حاجة قبل ما يحفظ.
      </p>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>
        {busy && !groups ? 'جاري القراءة…' : '⬆ رفع شيت Excel'}
      </button>

      {groups && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && setGroups(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <h2>مراجعة التحديث — {fileName}</h2>
              <button className="btn ghost small" onClick={() => setGroups(null)} disabled={busy}>✕</button>
            </div>
            <div className="modal-body">
              <div className="import-sum">
                <span><b>{total}</b> مقايسة في الشيت</span>
                <span><b>{used}</b> هتتسجل على <b>{new Set(effective.filter((g) => g.projectId != null).map((g) => g.projectId)).size}</b> مشروع</span>
                {total - used > 0 && <span className="muted">{total - used} متجاهَلة</span>}
                {unresolved > 0 && <span className="bad">{unresolved} اسم مش لاقيله مشروع — اختاره أو سيبه متجاهَل</span>}
              </div>

              <div className="table-scroll">
                <table className="plain import">
                  <thead>
                    <tr>
                      <th>المشروع في الشيت</th>
                      <th>ك</th>
                      <th>العدد</th>
                      <th>اللي هيتكتب في «متوقف على»</th>
                      <th>المشروع في الموقع</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {effective.map((g) => (
                      <tr key={g.key}>
                        <td><b>{g.name}</b></td>
                        <td>{g.battalion}</td>
                        <td>{g.rows.length}</td>
                        <td className="note">{g.note}</td>
                        <td>
                          <select
                            value={g.projectId ?? ''}
                            onChange={(e) => setPicked({ ...picked, [g.key]: e.target.value ? Number(e.target.value) : null })}
                          >
                            <option value="">— تجاهل (مش هيتسجل) —</option>
                            {sorted.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name.replace(/\s+/g, ' ').slice(0, 70)}{p.battalion ? ` (ك${p.battalion})` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td><span className={'tag ' + HOW[g.how].cls}>{HOW[g.how].label}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="zero">
                <input type="checkbox" checked={zeroOthers} onChange={(e) => setZeroOthers(e.target.checked)} />
                المشاريع اللي مش في الشيت: عدد المقايسات المتوقفة يبقى صفر (الشيت هو الموقف الحالي)
              </label>
              <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '6px 0 0' }}>
                {changes.length ? `هيتغيّر ${changes.length} مشروع.` : 'مفيش أي تغيير — الموقع متحدّث بالفعل.'} الربط اللي بتختاره بإيدك
                بيتحفظ، والمرة الجاية بيتطابق لوحده.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn primary" disabled={busy || !changes.length} onClick={apply}>
                {busy ? 'جاري الحفظ…' : `حفظ التحديث (${changes.length})`}
              </button>
              <button className="btn" disabled={busy} onClick={() => setGroups(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
