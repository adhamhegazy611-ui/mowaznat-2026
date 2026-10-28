import { useMemo } from 'react'
import type { Project, Reviewer } from '../lib/types'
import { computeTotals, fmtNum, type QuickKey } from '../lib/util'

interface Props {
  projects: Project[]
  reviewers: Reviewer[]
  onPick: (filter: { key: 'reviewer' | 'battalion'; value: string }) => void
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

  const byStatus = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of projects) {
      const k = (p.action_taken ?? '').trim() || 'غير محدد'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
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
        <Card k="غير شامل (مليون)" v={fmtNum(t.excl, 1)} onClick={() => onQuick(null)} />
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
          <h3>ما تم اجراؤه</h3>
          <div className="table-scroll">
            <table className="plain">
              <tbody>
                {byStatus.map(([k, n]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td style={{ width: 60 }}><b>{n}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>حسب المراجع <span className="sub" style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-3)' }}>— اضغط على الاسم يفتح مشاريعه</span></h3>
        <GroupTable rows={byReviewer} first="المراجع" onPick={(v) => onPick({ key: 'reviewer', value: v })} />
      </div>
      <div className="card">
        <h3>حسب الكتيبة</h3>
        <GroupTable rows={byBattalion} first="ك" onPick={(v) => onPick({ key: 'battalion', value: v })} />
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
