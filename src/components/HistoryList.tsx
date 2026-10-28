import { COLUMNS } from '../lib/columns'
import type { HistoryEntry } from '../lib/types'

const ACT: Record<string, string> = { insert: 'إضافة مشروع', update: 'تعديل', delete: 'حذف مشروع' }
const COLOR_AR: Record<string, string> = { green: 'أخضر', darkgreen: 'أخضر غامق', orange: 'برتقالي', yellow: 'أصفر', red: 'أحمر' }

const fieldLabel = (k: string) => COLUMNS.find((c) => c.key === k)?.label ?? (k === 'colors' ? 'الألوان' : k)

function show(v: unknown): string {
  if (v == null || v === '') return 'فاضي'
  if (typeof v === 'object') {
    const e = Object.entries(v as Record<string, string>)
    return e.length ? e.map(([k, c]) => `${fieldLabel(k)}: ${COLOR_AR[c] ?? c}`).join('، ') : 'بدون'
  }
  return String(v)
}

export default function HistoryList({ items, showProject = true }: { items: HistoryEntry[]; showProject?: boolean }) {
  if (!items.length) return <div className="empty">لسه مفيش تعديلات متسجّلة.</div>
  return (
    <ul className="hist">
      {items.map((h) => (
        <li key={h.id}>
          <div className="meta">
            <span className="act">{ACT[h.action] ?? h.action}</span>
            {showProject && h.project_name && <b style={{ color: 'var(--ink)' }}>{h.project_name}</b>}
            <span>{h.user_email ?? '—'}</span>
            <span>{new Date(h.created_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
          {h.action === 'update' && h.changes && (
            <div className="ch">
              {Object.entries(h.changes)
                .filter(([k]) => k !== 'updated_at')
                .map(([k, [o, n]]) => (
                  <div key={k}>
                    <b>{fieldLabel(k)}:</b> <del>{show(o)}</del> ← <ins>{show(n)}</ins>
                  </div>
                ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
