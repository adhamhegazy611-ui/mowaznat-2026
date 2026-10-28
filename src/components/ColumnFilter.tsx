import { useMemo, useState } from 'react'
import type { Column } from '../lib/columns'
import type { Project } from '../lib/types'
import { BLANK, displayValue, normalize } from '../lib/util'

export type SortDir = 'asc' | 'desc'

interface Props {
  col: Column
  rows: Project[]
  selected: string[] | undefined
  anchor: DOMRect
  sortDir: SortDir | null
  onSort: (dir: SortDir | null) => void
  onApply: (values: string[] | undefined) => void
  onClose: () => void
}

/** نفس فكرة فلتر الإكسيل (AutoFilter): ترتيب + قائمة القيم بعلامات صح */
export default function ColumnFilter({ col, rows, selected, anchor, sortDir, onSort, onApply, onClose }: Props) {
  const [q, setQ] = useState('')
  const values = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const v = displayValue(r, col) || BLANK
      m.set(v, (m.get(v) ?? 0) + 1)
    }
    const arr = [...m.entries()]
    const numeric = col.kind === 'int' || col.kind === 'num' || col.kind === 'seq'
    arr.sort((a, b) => {
      if (a[0] === BLANK) return 1
      if (b[0] === BLANK) return -1
      if (numeric) return parseFloat(a[0].replace(/,/g, '')) - parseFloat(b[0].replace(/,/g, ''))
      return a[0].localeCompare(b[0], 'ar')
    })
    return arr
  }, [rows, col])

  const [checked, setChecked] = useState<Set<string>>(() => new Set(selected ?? values.map((v) => v[0])))
  const shown = q ? values.filter(([v]) => normalize(v).includes(normalize(q))) : values
  const allShownChecked = shown.every(([v]) => checked.has(v))

  const toggle = (v: string) => {
    const n = new Set(checked)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    setChecked(n)
  }
  const toggleAll = () => {
    const n = new Set(checked)
    shown.forEach(([v]) => (allShownChecked ? n.delete(v) : n.add(v)))
    setChecked(n)
  }
  const apply = () => {
    // لو في بحث: اعتبر النتيجة هي الاختيار (زي الإكسيل)
    const base = q ? new Set(shown.filter(([v]) => checked.has(v)).map(([v]) => v)) : checked
    const all = values.every(([v]) => base.has(v))
    onApply(all ? undefined : [...base])
    onClose()
  }

  const width = 270
  let left = anchor.right - width
  if (left < 8) left = 8
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
  const top = Math.min(anchor.bottom + 4, window.innerHeight - 440)

  return (
    <>
      <div className="pop-backdrop" onClick={onClose} />
      <div className="pop" style={{ left, top: Math.max(8, top) }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{col.label}</div>
        <div className="sorts">
          <button className={'btn small' + (sortDir === 'asc' ? ' primary' : '')} onClick={() => onSort(sortDir === 'asc' ? null : 'asc')}>
            ترتيب تصاعدي ↑
          </button>
          <button className={'btn small' + (sortDir === 'desc' ? ' primary' : '')} onClick={() => onSort(sortDir === 'desc' ? null : 'desc')}>
            تنازلي ↓
          </button>
        </div>
        <input type="search" placeholder="بحث في القيم…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="list">
          <label>
            <input type="checkbox" checked={allShownChecked} onChange={toggleAll} />
            <b>(تحديد الكل)</b>
          </label>
          {shown.map(([v, n]) => (
            <label key={v}>
              <input type="checkbox" checked={checked.has(v)} onChange={() => toggle(v)} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v}>
                {v}
              </span>
              <span className="cnt">{n}</span>
            </label>
          ))}
        </div>
        <div className="acts">
          <button className="btn small primary" onClick={apply}>
            تطبيق
          </button>
          <button
            className="btn small"
            onClick={() => {
              onApply(undefined)
              onClose()
            }}
          >
            مسح الفلتر
          </button>
          <button className="btn small ghost" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </div>
    </>
  )
}
