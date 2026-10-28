import { useMemo } from 'react'
import type { Project, Reviewer } from '../lib/types'
import { BLANK, computeTotals, fmtNum, normalize, type QuickKey } from '../lib/util'

interface Props {
  projects: Project[]
  reviewers: Reviewer[]
  onPick: (filter: { key: 'reviewer' | 'battalion' | 'action_taken'; values: string[] }) => void
  onQuick: (q: QuickKey | null) => void
}

const STAGES = [
  ['st_drawings', 'لوحات'],
  ['st_budget', 'موازنة'],
  ['st_self', 'ذاتي'],
  ['st_contracts', 'عقود'],
] as const

export default function SummaryPage({ projects, reviewers, onPick, onQuick }: Props) {
  const t = computeTotals(projects)

  const byReviewer = useMemo(() => {
    const names = [...reviewers.map((r) => r.name), ...projects.map((p) => p.reviewer ?? '')].filter(
      (v, i, a) => a.indexOf(v) === i,
    )
    return names
      .map((name) => {
        const rows = projects.filter((p) => (p.reviewer ?? '') === name)
        return { name: name || 'بدون مراجع', key: name, ...computeTotals(rows) }
      })
      .filter((r) => r.count > 0)
  }, [projects, reviewers])

  const byBattalion = useMemo(() => {
    const m = new Map<string, Project[]>()
    for (const p of projects) {
      const k = p.battalion ?? ''
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return [...m.entries()]
      .map(([k, rows]) => ({ name: k || 'غير محددة', key: k, ...computeTotals(rows) }))
      .sort((a, b) => b.count - a.count)
  }, [projects])

  // «ما تم اجراؤه» متجمّع: «جاري الاعتماد في الهيئة بتاريخ ...» و«جاري الاعتماد في الهيئه» بيتحسبوا مع بعض
  const byStatus = useMemo(() => {
    const m = new Map<string, { label: string; values: Set<string>; n: number }>()
    for (const p of projects) {
      const raw = (p.action_taken ?? '').trim()
      const head = raw.split('\n')[0].replace(/\s*بتاريخ.*$/, '').replace(/[\s/]+$/, '').trim()
      const key = head ? normalize(head) : ''
      const g = m.get(key) ?? { label: head || 'غير محدد', values: new Set<string>(), n: 0 }
      g.values.add(raw || BLANK)
      g.n++
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [projects])

  const pct = (n: number) => (t.count ? Math.round((n / t.count) * 100) : 0)

  return (
    <>
      <div className="page-head">
        <h1>الملخص</h1>
        <span className="sub">كل الأرقام محسوبة لحظياً من جدول المشاريع</span>
      </div>

      <div className="kpis">
        <Card k="عدد المشاريع" v={t.count} onClick={() => onQuick(null)} />
        <Card k="المقايسات المتوقفة" v={t.stopped} onClick={() => onQuick('stopped')} />
        <Card k="مقايسات تم تسليمها" v={t.delivered} onClick={() => onQuick('delivered')} />
        <Card k="الموازنة موجودة" v={t.budgetFound} of={t.count} onClick={() => onQuick('budget')} />
        <Card k="شامل (مليون)" v={fmtNum(t.incl, 1)} onClick={() => onQuick('incl')} />
        <Card k="غير شامل (مليون)" v={fmtNum(t.excl, 1)} onClick={() => onQuick('excl')} />
      </div>

      <div className="two">
        <div className="card">
          <h3>تقدّم المراحل</h3>
          {STAGES.map(([k, l]) => (
            <div className="stage click" key={k} onClick={() => onQuick(k)} title="اضغط يفتح المشاريع">
              <span>{l}</span>
              <div className="bar"><i style={{ width: pct(t.marks[k]) + '%' }} /></div>
              <b>{t.marks[k]} ✓ ({pct(t.marks[k])}%)</b>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>ما تم اجراؤه <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-3)' }}>— اضغط على أي سطر يفتح مشاريعه</span></h3>
          <div className="table-scroll">
            <table className="plain">
              <tbody>
                {byStatus.map((g) => (
                  <tr
                    key={g.label}
                    className="click"
                    title="اضغط يفتح المشاريع"
                    onClick={() => onPick({ key: 'action_taken', values: [...g.values] })}
                  >
                    <td>{g.label}</td>
                    <td style={{ width: 60 }}><b>{g.n}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>حسب المراجع <span className="sub" style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-3)' }}>— اضغط على الاسم يفتح مشاريعه</span></h3>
        <GroupTable rows={byReviewer} first="المراجع" onPick={(v) => onPick({ key: 'reviewer', values: [v || BLANK] })} />
      </div>
      <div className="card">
        <h3>حسب الكتيبة</h3>
        <GroupTable rows={byBattalion} first="ك" onPick={(v) => onPick({ key: 'battalion', values: [v || BLANK] })} />
      </div>
    </>
  )
}

type Row = ReturnType<typeof computeTotals> & { name: string; key: string }
function GroupTable({ rows, first, onPick }: { rows: Row[]; first: string; onPick: (v: string) => void }) {
  return (
    <div className="table-scroll">
      <table className="plain">
        <thead>
          <tr>
            <th>{first}</th>
            <th>المشاريع</th>
            <th>المتوقفة</th>
            <th>تم تسليمها</th>
            <th>لوحات ✓</th>
            <th>موازنة ✓</th>
            <th>ذاتي ✓</th>
            <th>عقود ✓</th>
            <th>الموازنة موجودة</th>
            <th>شامل (مليون)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="click" onClick={() => onPick(r.key)}>
              <td><b>{r.name}</b></td>
              <td>{r.count}</td>
              <td>{r.stopped}</td>
              <td>{r.delivered}</td>
              <td>{r.marks.st_drawings}</td>
              <td>{r.marks.st_budget}</td>
              <td>{r.marks.st_self}</td>
              <td>{r.marks.st_contracts}</td>
              <td>{r.budgetFound}</td>
              <td>{fmtNum(r.incl, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Card({ k, v, of, onClick }: { k: string; v: number | string; of?: number; onClick: () => void }) {
  return (
    <button type="button" className="kpi click" onClick={onClick} title="اضغط يفتح المشاريع">
      <div className="k">{k}</div>
      <div className="v">
        {v}
        {of != null && <small> / {of}</small>}
      </div>
    </button>
  )
}
