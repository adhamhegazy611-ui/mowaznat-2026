import { useEffect, useState, type ReactNode } from 'react'
import { isUrl, openSheet } from '../lib/files'
import {
  ACTION_SUGGESTIONS,
  BUDGET_STATUS_SUGGESTIONS,
  COLOR_HEX,
  COLOR_LABEL,
  COLOR_ORDER,
  COLUMNS,
  type FieldKey,
} from '../lib/columns'
import type { CellColor, HistoryEntry, Mark, Project, Reviewer } from '../lib/types'
import { api } from '../lib/api'
import { copyText } from '../lib/util'
import HistoryList from './HistoryList'

type Draft = Project | Omit<Project, 'id'>

interface Props {
  initial: Draft
  reviewers: Reviewer[]
  projects: Project[]
  canEdit: boolean
  isAdmin: boolean
  onClose: () => void
  onSaved: (msg: string) => void
}

const label = (k: FieldKey) => COLUMNS.find((c) => c.key === k)!.label

function Swatches({ color, ro, onColor }: { color: CellColor | null; ro: boolean; onColor: (c: CellColor | null) => void }) {
  if (ro && !color) return null
  return (
    <span className="swatches" title="لون الخانة">
      {!ro && <button type="button" className={'sw none' + (!color ? ' on' : '')} onClick={() => onColor(null)} title="بدون لون" />}
      {COLOR_ORDER.filter((c) => !ro || color === c).map((c) => (
        <button
          type="button"
          key={c}
          className={'sw' + (color === c ? ' on' : '')}
          style={{ background: COLOR_HEX[c] }}
          title={COLOR_LABEL[c]}
          onClick={() => !ro && onColor(c)}
        />
      ))}
    </span>
  )
}

interface FieldProps {
  k: FieldKey
  children: ReactNode
  wide?: boolean
  hint?: string
  color: CellColor | null
  ro: boolean
  onColor: (c: CellColor | null) => void
}
function Field({ k, children, wide, hint, color, ro, onColor }: FieldProps) {
  return (
    <div className={'field' + (wide ? ' wide' : '')}>
      <div className="lab">
        {label(k)}
        {hint && <span className="x">{hint}</span>}
        <Swatches color={color} ro={ro} onColor={onColor} />
      </div>
      {children}
    </div>
  )
}

export default function ProjectForm({ initial, reviewers, projects, canEdit, isAdmin, onClose, onSaved }: Props) {
  const [d, setD] = useState<Draft>(() => ({ ...initial, colors: { ...(initial.colors ?? {}) } }))
  const [tab, setTab] = useState<'data' | 'history'>('data')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  // شيت الموازنة: ملف جديد مستني الحفظ، أو طلب شيل الشيت الحالي
  const [sheetFile, setSheetFile] = useState<File | null>(null)
  const [dropSheet, setDropSheet] = useState(false)
  const isNew = !('id' in d) || !d.id
  const ro = !canEdit

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    if (tab === 'history' && !isNew && history == null)
      api.listHistory((d as Project).id).then(setHistory).catch(() => setHistory([]))
  }, [tab, isNew, d, history])

  const set = <K extends keyof Project>(k: K, v: Project[K]) => setD((x) => ({ ...x, [k]: v }))
  const setColor = (k: FieldKey, c: CellColor | null) =>
    setD((x) => {
      const colors = { ...x.colors }
      if (c) colors[k] = c
      else delete colors[k]
      return { ...x, colors }
    })

  // أسماء المراجعين: القائمة + أي اسم موجود في البيانات
  const people = [
    ...reviewers.filter((r) => r.active).map((r) => r.name),
    ...new Set(
      projects.flatMap((p) => [p.reviewer, p.pricing_by, p.contracts_reviewer, p.self_reviewer]).filter((x): x is string => !!x),
    ),
  ].filter((v, i, a) => a.indexOf(v) === i)
  const battalions = [...new Set(projects.map((p) => p.battalion).filter(Boolean))] as string[]
  const distinct = (k: FieldKey, extra: string[]) =>
    [...new Set([...extra, ...projects.map((p) => p[k] as string | null).filter(Boolean)])] as string[]

  const save = async () => {
    if (!d.name.trim()) return setErr('اكتب بيان الأعمال (اسم المشروع)')
    setBusy(true)
    setErr('')
    try {
      const oldPath = (initial as Project).sheet_path ?? null
      const saved = await api.saveProject({ ...d, name: d.name.trim() })
      if (sheetFile) {
        const path = await api.uploadSheet(saved.id, sheetFile)
        await api.patchProject(saved.id, { sheet_path: path, sheet_name: sheetFile.name })
        if (oldPath) await api.removeSheet(oldPath).catch(() => {})
      } else if (dropSheet && oldPath) {
        await api.patchProject(saved.id, { sheet_path: null, sheet_name: null })
        await api.removeSheet(oldPath).catch(() => {})
      }
      onSaved(isNew ? 'اتضاف المشروع ✓' : 'اتحفظت التعديلات ✓')
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!confirm(`حذف «${d.name}» نهائياً؟`)) return
    setBusy(true)
    try {
      await api.deleteProject((d as Project).id)
      onSaved('اتحذف المشروع')
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  const fp = (k: FieldKey) => ({ k, color: d.colors[k] ?? null, ro, onColor: (c: CellColor | null) => setColor(k, c) })

  const txt = (k: FieldKey, list?: string) => (
    <input
      type="text"
      value={(d[k] as string) ?? ''}
      readOnly={ro}
      list={list}
      onChange={(e) => set(k, (e.target.value || null) as never)}
    />
  )
  const area = (k: FieldKey) => (
    <textarea value={(d[k] as string) ?? ''} readOnly={ro} onChange={(e) => set(k, (e.target.value || null) as never)} />
  )
  const num = (k: FieldKey, step = 'any') => (
    <input
      type="number"
      step={step}
      value={(d[k] as number | null) ?? ''}
      readOnly={ro}
      onChange={(e) => set(k, (e.target.value === '' ? null : Number(e.target.value)) as never)}
    />
  )
  const date = (k: FieldKey) => (
    <input type="date" value={(d[k] as string) ?? ''} readOnly={ro} onChange={(e) => set(k, (e.target.value || null) as never)} />
  )
  const person = (k: FieldKey) => (
    <select value={(d[k] as string) ?? ''} disabled={ro} onChange={(e) => set(k, (e.target.value || null) as never)}>
      <option value="">—</option>
      {people.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  )
  const mark = (k: FieldKey) => {
    const v = d[k] as Mark
    const b = (val: Mark, cls: string, txt: string) => (
      <button type="button" disabled={ro} className={(v === val ? 'on ' : '') + cls} onClick={() => set(k, val as never)}>
        {txt}
      </button>
    )
    return (
      <Field {...fp(k)}>
        <div className="tri">
          {b('✓', 'ok', '✓')}
          {b('✗', 'no', '✗')}
          {b(null, 'na', '—')}
        </div>
      </Field>
    )
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{isNew ? 'مشروع جديد' : d.name}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="إغلاق">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {!isNew && (
            <div className="tabs">
              <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>
                البيانات
              </button>
              <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
                سجل التعديلات
              </button>
            </div>
          )}

          {tab === 'history' ? (
            history == null ? <div className="spinner">جاري التحميل…</div> : <HistoryList items={history} showProject={false} />
          ) : (
            <>
              <fieldset>
                <legend>المشروع</legend>
                <div className="grid">
                  <Field {...fp('name')} wide>
                    {txt('name')}
                  </Field>
                  <Field {...fp('sector')} hint="(لو المشروع مقسّم قطاعات)">
                    {txt('sector')}
                  </Field>
                  <Field {...fp('battalion')} hint="مثال: 92 أو 71-44">
                    {txt('battalion', 'dl-bat')}
                  </Field>
                  <Field {...fp('stopped_count')}>{num('stopped_count', '1')}</Field>
                  <Field {...fp('delivered_count')}>{num('delivered_count', '1')}</Field>
                  <div className="field">
                    <div className="lab">الترتيب (م)</div>
                    <input
                      type="number"
                      value={d.sort_order}
                      readOnly={ro}
                      onChange={(e) => set('sort_order', Number(e.target.value))}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend>المراحل</legend>
                <div className="marks">
                  {mark('st_drawings')}
                  {mark('st_budget')}
                  {mark('st_self')}
                  {mark('st_contracts')}
                </div>
              </fieldset>

              <fieldset>
                <legend>المراجعين والتواريخ</legend>
                <div className="grid">
                  <Field {...fp('reviewer')}>{person('reviewer')}</Field>
                  <Field {...fp('pricing_by')}>{person('pricing_by')}</Field>
                  <Field {...fp('contracts_reviewer')}>{person('contracts_reviewer')}</Field>
                  <Field {...fp('self_reviewer')}>{person('self_reviewer')}</Field>
                  <Field {...fp('date_drawings')}>{date('date_drawings')}</Field>
                  <Field {...fp('date_pricing')}>{date('date_pricing')}</Field>
                  <Field {...fp('date_contracts')}>{date('date_contracts')}</Field>
                  <Field {...fp('date_self')}>{date('date_self')}</Field>
                </div>
              </fieldset>

              <fieldset>
                <legend>الموقف</legend>
                <div className="grid">
                  <Field {...fp('blocked_on')} wide>
                    {area('blocked_on')}
                  </Field>
                  <Field {...fp('action_taken')} wide>
                    <input
                      type="text"
                      list="dl-act"
                      value={d.action_taken ?? ''}
                      readOnly={ro}
                      onChange={(e) => set('action_taken', e.target.value || null)}
                    />
                  </Field>
                  <Field {...fp('budget_status')}>{txt('budget_status', 'dl-bud')}</Field>
                  <Field {...fp('total_incl')}>{num('total_incl')}</Field>
                  <Field {...fp('total_excl')}>{num('total_excl')}</Field>
                </div>
              </fieldset>

              <fieldset>
                <legend>الملف والملاحظات</legend>
                <div className="grid">
                  <Field {...fp('file_path')} wide>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        className="ltr"
                        value={d.file_path ?? ''}
                        readOnly={ro}
                        onChange={(e) => set('file_path', e.target.value || null)}
                        placeholder="الصق لينك الملف (Google Drive أو OneDrive) — Excel أو PDF"
                      />
                      {d.file_path && isUrl(d.file_path) && (
                        <a className="btn small" href={d.file_path.trim()} target="_blank" rel="noopener noreferrer">
                          فتح
                        </a>
                      )}
                      {d.file_path && !isUrl(d.file_path) && (
                        <button type="button" className="btn small" onClick={() => copyText(d.file_path!)}>
                          نسخ
                        </button>
                      )}
                    </div>
                  </Field>
                  <div className="field wide">
                    <div className="lab">شيت الموازنة (Excel)<span className="x">بيظهر في «مكان المشروع» كلينك «فتح الشيت»</span></div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {sheetFile ? (
                        <span className="file-link xls"><span className="fi">XLS</span>{sheetFile.name} — هيترفع لما تحفظ</span>
                      ) : d.sheet_path && !dropSheet ? (
                        <a className="file-link xls" href="#" title="فتح الشيت"
                          onClick={(e) => { e.preventDefault(); openSheet(d.sheet_path!, d.sheet_name).catch((x) => setErr((x as Error).message)) }}>
                          <span className="fi">XLS</span>{d.sheet_name || 'فتح الشيت'}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>{dropSheet ? 'الشيت هيتشال لما تحفظ' : 'مفيش شيت مرفوع'}</span>
                      )}
                      {!ro && (
                        <label className="btn small" style={{ cursor: 'pointer' }}>
                          {d.sheet_path || sheetFile ? 'تغيير الشيت' : 'رفع شيت Excel'}
                          <input type="file" hidden accept=".xlsx,.xlsm,.xls,.xlsb,.csv"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              e.target.value = ''
                              if (!f) return
                              if (f.size > 50 * 1024 * 1024) return setErr('الشيت أكبر من 50 ميجا')
                              setErr('')
                              setSheetFile(f)
                              setDropSheet(false)
                            }} />
                        </label>
                      )}
                      {!ro && (sheetFile || (d.sheet_path && !dropSheet)) && (
                        <button type="button" className="btn small" onClick={() => { if (sheetFile) setSheetFile(null); else setDropSheet(true) }}>
                          {sheetFile ? 'إلغاء' : 'شيل الشيت'}
                        </button>
                      )}
                    </div>
                  </div>
                  <Field {...fp('notes')} wide>
                    {area('notes')}
                  </Field>
                </div>
              </fieldset>

              <datalist id="dl-bat">
                {battalions.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <datalist id="dl-act">
                {distinct('action_taken', ACTION_SUGGESTIONS).map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <datalist id="dl-bud">
                {distinct('budget_status', BUDGET_STATUS_SUGGESTIONS).map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              {err && <div className="login"><div className="err">{err}</div></div>}
            </>
          )}
        </div>
        <div className="modal-foot">
          {canEdit && tab === 'data' && (
            <button className="btn primary" disabled={busy} onClick={save}>
              {busy ? 'جاري الحفظ…' : 'حفظ'}
            </button>
          )}
          <button className="btn" onClick={onClose}>
            {canEdit ? 'إلغاء' : 'إغلاق'}
          </button>
          <span className="spacer" />
          {isAdmin && !isNew && (
            <button className="btn danger" disabled={busy} onClick={remove}>
              حذف المشروع
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
