import { useMemo, useState } from 'react'
import { COLUMNS, cellBg, emptyProject, type Column, type FieldKey } from '../lib/columns'
import type { Mark, Project, Reviewer } from '../lib/types'
import { BLANK, QUICK_LABEL, quickPass, type QuickKey, computeTotals, copyText, displayValue, fmtDate, fmtNum, loadPref, normalize, savePref, todayStr } from '../lib/util'
import { exportToExcel } from '../lib/exportExcel'
import ColumnFilter, { type SortDir } from './ColumnFilter'
import ProjectForm from './ProjectForm'
import { api } from '../lib/api'

interface Props {
  projects: Project[]
  reviewers: Reviewer[]
  canEdit: boolean
  isAdmin: boolean
  toast: (m: string) => void
  reload: () => void
  initialFilters?: Partial<Record<FieldKey, string[]>>
  initialQuick?: QuickKey | null
}

type Filters = Partial<Record<FieldKey, string[]>>
const PREF_COLS = 'mowazanat-cols-v1'
const NEXT: Record<string, Mark> = { '✓': '✗', '✗': null, null: '✓' }

export default function ProjectsPage({ projects, reviewers, canEdit, isAdmin, toast, reload, initialFilters, initialQuick }: Props) {
  const [q, setQ] = useState('')
  const [quick, setQuick] = useState<QuickKey | null>(initialQuick ?? null)
  const [filters, setFilters] = useState<Filters>(initialFilters ?? {})
  const [sort, setSort] = useState<{ key: FieldKey; dir: SortDir } | null>(null)
  const [hidden, setHidden] = useState<string[]>(() =>
    loadPref(PREF_COLS, COLUMNS.filter((c) => c.hiddenByDefault).map((c) => c.key)),
  )
  const [pop, setPop] = useState<{ col: Column; rect: DOMRect } | null>(null)
  const [colsMenu, setColsMenu] = useState<DOMRect | null>(null)
  const [editing, setEditing] = useState<Project | Omit<Project, 'id'> | null>(null)

  const visible = COLUMNS.filter((c) => !hidden.includes(c.key))

  // رقم «م» = ترتيب المشروع في القائمة كلها (زي معادلة =A3+1 في الشيت)
  const seqOf = useMemo(() => {
    const m = new Map<number, number>()
    projects.forEach((p, i) => m.set(p.id, i + 1))
    return m
  }, [projects])

  const matchSearch = (p: Project) => {
    if (!q.trim()) return true
    const n = normalize(q)
    return COLUMNS.some((c) => normalize(displayValue(p, c)).includes(n))
  }
  const passes = (p: Project, except?: FieldKey) =>
    (Object.entries(filters) as [FieldKey, string[]][]).every(([k, vals]) => {
      if (k === except) return true
      const col = COLUMNS.find((c) => c.key === k)!
      return vals.includes(displayValue(p, col) || BLANK)
    })

  // الكروت بتتحسب على الفلاتر من غير الفلتر السريع، والجدول بيطبّق الفلتر السريع كمان
  const base = useMemo(
    () => projects.filter((p) => matchSearch(p) && passes(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, q, filters],
  )
  const rows = useMemo(() => {
    let r = base.filter((p) => quickPass(p, quick))
    if (sort) {
      const col = COLUMNS.find((c) => c.key === sort.key)!
      const numeric = ['int', 'num', 'seq'].includes(col.kind)
      r = [...r].sort((a, b) => {
        const av = a[sort.key], bv = b[sort.key]
        if (av == null || av === '') return 1
        if (bv == null || bv === '') return -1
        const c = numeric ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), 'ar')
        return sort.dir === 'asc' ? c : -c
      })
    }
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, quick, sort])

  const totals = computeTotals(rows)
  const kpi = computeTotals(base)

  // دمج خانة «ك» للصفوف المتتالية اللي ليها نفس الكتيبة (زي الخلايا المدمجة في الشيت)
  const batSpan = useMemo(() => {
    const span = new Map<number, number>() // id → rowSpan (0 = مدموجة في اللي فوقها)
    for (let i = 0; i < rows.length; ) {
      const b = rows[i].battalion
      let j = i + 1
      if (b) while (j < rows.length && rows[j].battalion === b) j++
      span.set(rows[i].id, j - i)
      for (let k = i + 1; k < j; k++) span.set(rows[k].id, 0)
      i = j
    }
    return span
  }, [rows])
  const activeFilterKeys = Object.keys(filters) as FieldKey[]

  const cycleMark = async (p: Project, key: FieldKey) => {
    const next = NEXT[String(p[key])]
    try {
      await api.patchProject(p.id, { [key]: next } as Partial<Project>)
      reload()
    } catch (e) {
      toast('مقدرتش أحفظ: ' + (e as Error).message)
    }
  }

  const setColHidden = (key: string, hide: boolean) => {
    const n = hide ? [...hidden, key] : hidden.filter((k) => k !== key)
    setHidden(n)
    savePref(PREF_COLS, n)
  }

  const renderCell = (p: Project, c: Column) => {
    const v = p[c.key]
    switch (c.kind) {
      case 'seq':
        return seqOf.get(p.id)
      case 'mark':
        return (
          <button
            className={'mark-btn' + (canEdit ? ' can' : '') + (v === '✓' ? ' m-ok' : v === '✗' ? ' m-no' : '')}
            title={canEdit ? 'اضغط للتغيير: ✓ ← ✗ ← فاضي' : undefined}
            onClick={(e) => {
              if (!canEdit) return
              e.stopPropagation()
              void cycleMark(p, c.key)
            }}
          >
            {(v as string) ?? ''}
          </button>
        )
      case 'num':
        return fmtNum(v as number)
      case 'date':
        return fmtDate(v as string)
      case 'path':
        return v ? (
          <div className="path" title={v as string}>
            <span>{String(v).split(/[\\/]/).pop()}</span>
            <button
              className="copy"
              onClick={(e) => {
                e.stopPropagation()
                copyText(v as string)
                toast('اتنسخ مسار الملف ✓')
              }}
            >
              نسخ
            </button>
          </div>
        ) : null
      case 'longtext':
        return v ? <div className="clamp" title={v as string}>{v as string}</div> : null
      case 'text':
        if (c.key === 'name')
          return (
            <>
              {v as string}
              {p.sector && hidden.includes('sector') && <span className="sector">{p.sector}</span>}
            </>
          )
        return (v as string) ?? ''
      default:
        return v == null ? '' : String(v)
    }
  }

  const cellStyle = (p: Project, c: Column) => {
    const bg = cellBg(p.colors, c.key)
    return bg ? { background: bg } : undefined
  }

  return (
    <>
      <div className="page-head">
        <h1>موقف المشاريع المتوقفة</h1>
        <span className="date">{todayStr()}</span>
        <span className="sub">
          {rows.length === projects.length ? `${projects.length} مشروع` : `${rows.length} من ${projects.length} مشروع`}
        </span>
      </div>

      <div className="kpis">
        <Kpi k="عدد المشاريع" v={kpi.count} on={quick === null} onClick={() => setQuick(null)} />
        <Kpi k="المقايسات المتوقفة" v={kpi.stopped} q="stopped" quick={quick} setQuick={setQuick} />
        <Kpi k="مقايسات تم تسليمها" v={kpi.delivered} q="delivered" quick={quick} setQuick={setQuick} />
        <Kpi k="لوحات ✓" v={kpi.marks.st_drawings} of={kpi.count} q="st_drawings" quick={quick} setQuick={setQuick} />
        <Kpi k="موازنة ✓" v={kpi.marks.st_budget} of={kpi.count} q="st_budget" quick={quick} setQuick={setQuick} />
        <Kpi k="ذاتي ✓" v={kpi.marks.st_self} of={kpi.count} q="st_self" quick={quick} setQuick={setQuick} />
        <Kpi k="عقود ✓" v={kpi.marks.st_contracts} of={kpi.count} q="st_contracts" quick={quick} setQuick={setQuick} />
        <Kpi k="الموازنة موجودة" v={kpi.budgetFound} of={kpi.count} q="budget" quick={quick} setQuick={setQuick} />
        <Kpi k="شامل (مليون)" v={fmtNum(kpi.incl, 1)} q="incl" quick={quick} setQuick={setQuick} />
      </div>

      <div className="toolbar">
        <div className="search">
          <span aria-hidden>🔍</span>
          <input placeholder="ابحث في كل الأعمدة… (اسم مشروع، مراجع، ملاحظة)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => setEditing(emptyProject((projects.at(-1)?.sort_order ?? 0) + 1))}>
            + مشروع جديد
          </button>
        )}
        <button className="btn" onClick={(e) => setColsMenu(e.currentTarget.getBoundingClientRect())}>
          الأعمدة
        </button>
        <button className="btn" onClick={() => void exportToExcel(rows, visible).catch((e) => toast('فشل التصدير: ' + e.message))}>
          تصدير Excel
        </button>
        <button className="btn" onClick={() => window.print()}>
          طباعة
        </button>
        {(activeFilterKeys.length > 0 || q || sort || quick) && (
          <button
            className="btn ghost"
            onClick={() => {
              setFilters({})
              setQ('')
              setSort(null)
              setQuick(null)
            }}
          >
            مسح كل الفلاتر
          </button>
        )}
      </div>

      {(activeFilterKeys.length > 0 || quick) && (
        <div className="active-filters">
          {quick && (
            <span className="chip">
              {QUICK_LABEL[quick]}
              <button aria-label="إزالة" onClick={() => setQuick(null)}>×</button>
            </span>
          )}
          {activeFilterKeys.map((k) => {
            const col = COLUMNS.find((c) => c.key === k)!
            const vals = filters[k]!
            return (
              <span className="chip" key={k}>
                {col.label}: {vals.length <= 2 ? vals.join('، ') : `${vals.length} قيم`}
                <button
                  aria-label="إزالة"
                  onClick={() => {
                    const n = { ...filters }
                    delete n[k]
                    setFilters(n)
                  }}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}

      <div className="sheet-wrap">
        <table className="sheet">
          <colgroup>
            {visible.map((c) => (
              <col key={c.key} style={{ width: c.width, minWidth: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visible.map((c, i) => (
                <th key={c.key} className={i === 0 ? 'sticky-1' : c.key === 'name' ? 'sticky-2' : undefined} style={{ width: c.width, minWidth: c.width, maxWidth: c.width }}>
                  <div className="th-inner">
                    <span className="lbl">{c.label}</span>
                    <button
                      className={'fbtn' + (filters[c.key] || sort?.key === c.key ? ' on' : '')}
                      title="فلتر وترتيب"
                      onClick={(e) => setPop({ col: c, rect: e.currentTarget.getBoundingClientRect() })}
                    >
                      {sort?.key === c.key ? (sort.dir === 'asc' ? '↑' : '↓') : '▼'}
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} onClick={() => setEditing(p)}>
                {visible.map((c, i) => {
                  const st = cellStyle(p, c)
                  const cls = ['c-' + c.kind, i === 0 ? 'sticky-1' : c.key === 'name' ? 'sticky-2' : '']
                    .filter(Boolean)
                    .join(' ')
                  if (c.key === 'battalion') {
                    const span = batSpan.get(p.id) ?? 1
                    if (span === 0) return null
                    return (
                      <td
                        key={c.key}
                        rowSpan={span}
                        className={cls + ' c-bat-merged'}
                        onClick={(e) => e.stopPropagation()}
                        style={{ maxWidth: c.width }}
                      >
                        {p.battalion ?? ''}
                      </td>
                    )
                  }
                  return (
                    <td key={c.key} className={cls} style={{ ...st, maxWidth: c.width }}>
                      {renderCell(p, c)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              {visible.map((c, i) => (
                <td key={c.key} className={i === 0 ? 'sticky-1' : c.key === 'name' ? 'sticky-2' : undefined}>
                  {footer(c, totals)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
        {rows.length === 0 && <div className="empty">مفيش مشاريع مطابقة للبحث أو الفلاتر.</div>}
      </div>

      {pop && (
        <ColumnFilter
          key={pop.col.key}
          col={pop.col}
          rows={projects.filter((p) => matchSearch(p) && passes(p, pop.col.key))}
          selected={filters[pop.col.key]}
          anchor={pop.rect}
          sortDir={sort?.key === pop.col.key ? sort.dir : null}
          onSort={(dir) => {
            setSort(dir ? { key: pop.col.key, dir } : null)
            setPop(null)
          }}
          onApply={(vals) => {
            const n = { ...filters }
            if (vals) n[pop.col.key] = vals
            else delete n[pop.col.key]
            setFilters(n)
          }}
          onClose={() => setPop(null)}
        />
      )}

      {colsMenu && (
        <>
          <div className="pop-backdrop" onClick={() => setColsMenu(null)} />
          <div className="pop" style={{ width: 340, top: colsMenu.bottom + 4, left: Math.max(8, Math.min(colsMenu.left, window.innerWidth - 348)) }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>الأعمدة الظاهرة</div>
            <div className="cols-menu">
              {COLUMNS.filter((c) => c.key !== 'sort_order' && c.key !== 'name').map((c) => (
                <label key={c.key}>
                  <input type="checkbox" checked={!hidden.includes(c.key)} onChange={(e) => setColHidden(c.key, !e.target.checked)} />
                  {c.label}
                </label>
              ))}
            </div>
            <div className="acts">
              <button
                className="btn small"
                onClick={() => {
                  const n = COLUMNS.filter((c) => c.hiddenByDefault).map((c) => c.key)
                  setHidden(n)
                  savePref(PREF_COLS, n)
                }}
              >
                زي الشيت
              </button>
              <button
                className="btn small"
                onClick={() => {
                  setHidden([])
                  savePref(PREF_COLS, [])
                }}
              >
                إظهار الكل
              </button>
            </div>
          </div>
        </>
      )}

      {editing && (
        <ProjectForm
          initial={editing}
          reviewers={reviewers}
          projects={projects}
          canEdit={canEdit}
          isAdmin={isAdmin}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null)
            toast(msg)
            reload()
          }}
        />
      )}
    </>
  )
}

function Kpi({ k, v, of, q, quick, setQuick, on, onClick }: {
  k: string
  v: number | string
  of?: number
  q?: QuickKey
  quick?: QuickKey | null
  setQuick?: (q: QuickKey | null) => void
  on?: boolean
  onClick?: () => void
}) {
  const active = on ?? (q != null && quick === q)
  const click = onClick ?? (() => setQuick?.(active ? null : q!))
  return (
    <button type="button" className={'kpi click' + (active ? ' on' : '')} onClick={click} aria-pressed={active}>
      <div className="k">{k}</div>
      <div className="v">
        {v}
        {of != null && <small> / {of}</small>}
      </div>
    </button>
  )
}

function footer(c: Column, t: ReturnType<typeof computeTotals>) {
  switch (c.key) {
    case 'sort_order':
      return 'الاجمالى'
    case 'name':
      return `${t.count} مشروع`
    case 'stopped_count':
      return t.stopped
    case 'delivered_count':
      return t.delivered
    case 'st_drawings':
    case 'st_budget':
    case 'st_self':
    case 'st_contracts':
      return `${t.marks[c.key]} ✓`
    case 'total_incl':
      return fmtNum(t.incl, 1)
    case 'total_excl':
      return fmtNum(t.excl, 1)
    case 'budget_status':
      return `موجودة: ${t.budgetFound}`
    default:
      return ''
  }
}
