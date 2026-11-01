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
  const batBars = byBattalion.map((b) => ({ label: b.name === 'غير محددة' ? b.name : isNaN(+b.name) ? b.name : 'ك' + b.name, n: b.count, key: b.key }))

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>الملخص</h1>
          <div className="sub">كل الأرقام محسوبة لحظياً من جدول المشروعات — اضغط على أي رقم يفتح مشروعاته</div>
        </div>
      </div>

      <div className="kpis">
        <Card k="عدد المشروعات" v={t.count} onClick={() => onQuick(null)} />
        <Card k="المقايسات المتوقفة" v={t.stopped} onClick={() => onQuick('stopped')} />
        <Card k="مقايسات تم تسليمها" v={t.delivered} onClick={() => onQuick('delivered')} />
        <Card k="الموازنة موجودة" v={t.budgetFound} of={t.count} onClick={() => onQuick('budget')} />
        <Card k="شامل (مليون)" v={fmtNum(t.incl, 1)} onClick={() => onQuick('incl')} />
        <Card k="غير شامل (مليون)" v={fmtNum(t.excl, 1)} onClick={() => onQuick('excl')} />
      </div>

      <div className="section-title"><h2>تقدّم المراحل</h2><span>نسبة المشروعات اللي المرحلة دي فيها ✓</span></div>
      <div className="stages">
        {STAGES.map(([k, l]) => (
          <button type="button" className="stage-card" key={k} onClick={() => onQuick(k)} title="اضغط يفتح المشروعات">
            <div className="top">
              <span className="name">{l}</span>
              <span className="pct">{pct(t.marks[k])}%</span>
            </div>
            <div className="track"><i style={{ width: pct(t.marks[k]) + '%' }} /></div>
            <span className="meta">{t.marks[k]} من {t.count} مشروع</span>
          </button>
        ))}
      </div>

      <div className="section-title"><h2>الموقف</h2></div>
      <div className="dash-grid">
        <div className="panel">
          <h3>ما تم اجراؤه</h3>
          <div className="hint">عدد المشروعات في كل حالة</div>
          <BarList
            items={byStatus.map((g) => ({ label: g.label, n: g.n, key: g.label }))}
            onPick={(key) => {
              const g = byStatus.find((x) => x.label === key)!
              onPick({ key: 'action_taken', values: [...g.values] })
            }}
          />
        </div>
        <div className="panel">
          <h3>المشروعات حسب الكتيبة</h3>
          <div className="hint">عدد المشروعات لكل كتيبة</div>
          <BarList items={batBars} onPick={(key) => onPick({ key: 'battalion', values: [key || BLANK] })} />
        </div>
      </div>

      <div className="section-title"><h2>حسب المراجع</h2><span>اضغط على الاسم يفتح مشروعاته</span></div>
      <div className="panel">
        <GroupTable rows={byReviewer} first="المراجع" onPick={(v) => onPick({ key: 'reviewer', values: [v || BLANK] })} />
      </div>

      <div className="section-title"><h2>تفاصيل الكتايب</h2></div>
      <div className="panel">
        <GroupTable rows={byBattalion} first="ك" onPick={(v) => onPick({ key: 'battalion', values: [v || BLANK] })} />
      </div>
    </>
  )
}

function BarList({ items, onPick }: { items: { label: string; n: number; key: string }[]; onPick: (key: string) => void }) {
  const max = Math.max(1, ...items.map((i) => i.n))
  return (
    <div className="barlist">
      {items.map((i) => (
        <button key={i.key + i.label} onClick={() => onPick(i.key)} title={`${i.label}: ${i.n} — اضغط يفتح المشروعات`}>
          <span className="lbl">{i.label}</span>
          <span className="trk"><i style={{ width: (i.n / max) * 100 + '%' }} /></span>
          <span className="num">{i.n}</span>
        </button>
      ))}
    </div>
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
            <th>المشروعات</th>
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
    <button type="button" className="kpi click" onClick={onClick} title="اضغط يفتح المشروعات">
      <div className="k">{k}</div>
      <div className="v">
        {v}
        {of != null && <small> / {of}</small>}
      </div>
      {of != null && of > 0 && <div className="meter"><i style={{ width: (Number(v) / of) * 100 + '%' }} /></div>}
    </button>
  )
}
