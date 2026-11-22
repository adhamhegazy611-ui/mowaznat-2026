// عرض شيت الموازنة جوه الموقع للقراءة بس (حسابات الكتايب): من غير تنزيل ومن غير تعديل
import { useEffect, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { api } from '../lib/api'

type Cell = { t: string; s: CSSProperties; rs: number; cs: number; num: boolean }
type Sheet = { name: string; rtl: boolean; widths: number[]; rows: { h?: number; cells: (Cell | null)[] }[] }

const MAX_R = 3000, MAX_C = 120

const argb = (c?: { argb?: string }) => {
  const v = c?.argb
  if (!v || v.length < 6) return undefined
  const hex = v.length === 8 ? v.slice(2) : v
  return '#' + hex
}

function valText(v: unknown, numFmt?: string): { t: string; num: boolean } {
  if (v == null) return { t: '', num: false }
  if (typeof v === 'number') {
    if (numFmt && numFmt.includes('%')) return { t: (v * 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%', num: true }
    return { t: v.toLocaleString('en-US', { maximumFractionDigits: 2 }), num: true }
  }
  if (v instanceof Date) return { t: v.toLocaleDateString('ar-EG'), num: false }
  if (typeof v === 'boolean') return { t: v ? 'TRUE' : 'FALSE', num: false }
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string; error?: string; hyperlink?: string }
    if (o.richText) return { t: o.richText.map((r) => r.text).join(''), num: false }
    if ('result' in o) return valText(o.result, numFmt)
    if (o.error) return { t: o.error, num: false }
    if (o.text != null) return { t: String(o.text), num: false }
    return { t: '', num: false }
  }
  return { t: String(v), num: false }
}

function colNum(s: string) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n }
function parseRef(r: string) { const m = /^([A-Z]+)(\d+)$/.exec(r)!; return { c: colNum(m[1]), r: +m[2] } }

function parseCsv(txt: string): Sheet {
  const rows = txt.replace(/\r/g, '').split('\n').filter((l, i, a) => l || i < a.length - 1).slice(0, MAX_R)
  const data = rows.map((l) => l.split(/[,;\t]/))
  const nc = Math.min(MAX_C, Math.max(1, ...data.map((r) => r.length)))
  return {
    name: 'الشيت', rtl: true, widths: Array(nc).fill(110),
    rows: data.map((r) => ({ cells: Array.from({ length: nc }, (_, i) => ({ t: r[i] ?? '', s: {}, rs: 1, cs: 1, num: false })) })),
  }
}

async function loadSheets(buf: ArrayBuffer, name: string): Promise<Sheet[]> {
  if (/\.csv$/i.test(name)) return [parseCsv(new TextDecoder().decode(buf))]
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(buf) } catch {
    throw new Error('الشيت ده بصيغة Excel قديمة (xls/xlsb) ومينفعش يتعرض هنا — اطلب من الأدمن يرفعه بصيغة xlsx')
  }
  const out: Sheet[] = []
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== 'visible') continue
    const nr = Math.min(MAX_R, ws.rowCount), nc = Math.min(MAX_C, ws.columnCount)
    if (!nr || !nc) continue
    // الخلايا المدموجة
    const span = new Map<string, { rs: number; cs: number }>(), covered = new Set<string>()
    const merges: string[] = ((ws as unknown as { model?: { merges?: string[] } }).model?.merges) ?? []
    for (const m of merges) {
      const [a, b] = m.split(':'); if (!a || !b) continue
      const A = parseRef(a), B = parseRef(b)
      span.set(A.r + ',' + A.c, { rs: B.r - A.r + 1, cs: B.c - A.c + 1 })
      for (let r = A.r; r <= B.r; r++) for (let c = A.c; c <= B.c; c++) if (r !== A.r || c !== A.c) covered.add(r + ',' + c)
    }
    const hidC = new Set<number>(), widths: number[] = []
    for (let c = 1; c <= nc; c++) { const col = ws.getColumn(c); if (col.hidden) hidC.add(c); widths.push(Math.round((col.width || 10) * 7.5)) }
    const rows: Sheet['rows'] = []
    for (let r = 1; r <= nr; r++) {
      const row = ws.getRow(r)
      if (row.hidden) continue
      const cells: (Cell | null)[] = []
      for (let c = 1; c <= nc; c++) {
        if (hidC.has(c)) continue
        const k = r + ',' + c
        if (covered.has(k)) { cells.push(null); continue }
        const cell = row.getCell(c)
        const { t, num } = valText(cell.value, cell.numFmt)
        const st = cell.style || {}
        const s: CSSProperties = {}
        if (st.font?.bold) s.fontWeight = 700
        if (st.font?.italic) s.fontStyle = 'italic'
        const fc = argb(st.font?.color as { argb?: string }); if (fc && fc !== '#000000') s.color = fc
        const fill = st.fill as { type?: string; fgColor?: { argb?: string } } | undefined
        if (fill?.type === 'pattern') { const bg = argb(fill.fgColor); if (bg) s.background = bg }
        const h = st.alignment?.horizontal; if (h === 'center' || h === 'centerContinuous') s.textAlign = 'center'; else if (h === 'left') s.textAlign = 'left'; else if (h === 'right') s.textAlign = 'right'
        if (st.alignment?.wrapText) s.whiteSpace = 'pre-wrap'
        const sp = span.get(k)
        cells.push({ t, s, rs: sp?.rs ?? 1, cs: sp?.cs ?? 1, num })
      }
      rows.push({ h: row.height ? Math.round(row.height * 1.33) : undefined, cells })
    }
    // نشيل الصفوف الفاضية في الآخر
    while (rows.length && rows[rows.length - 1].cells.every((x) => !x || !x.t)) rows.pop()
    const rtl = !!(ws.views && ws.views[0] && (ws.views[0] as { rightToLeft?: boolean }).rightToLeft)
    out.push({ name: ws.name, rtl, widths: widths.filter((_, i) => !hidC.has(i + 1)), rows })
  }
  if (!out.length) throw new Error('الشيت فاضي')
  return out
}

function Viewer({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null)
  const [err, setErr] = useState('')
  const [i, setI] = useState(0)
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const url = await api.sheetUrl(path, '', false)
        const r = await fetch(url); if (!r.ok) throw new Error('مقدرتش أفتح الشيت (' + r.status + ')')
        const sh = await loadSheets(await r.arrayBuffer(), name || path)
        if (!dead) setSheets(sh)
      } catch (e) { if (!dead) setErr((e as Error).message) }
    })()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    return () => { dead = true; document.removeEventListener('keydown', k) }
  }, [path, name, onClose])
  const sh = sheets?.[i]
  return (
    <div className="sv-back" onClick={onClose}>
      <div className="sv" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
        <div className="sv-hd">
          <span className="file-link xls" style={{ pointerEvents: 'none' }}><span className="fi">XLS</span>{name || 'شيت الموازنة'}</span>
          <span className="sv-ro">👁 عرض بس</span>
          <button className="btn small" onClick={onClose}>إغلاق ✕</button>
        </div>
        {sheets && sheets.length > 1 && (
          <div className="sv-tabs">{sheets.map((s, k) => <button key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)}>{s.name}</button>)}</div>
        )}
        <div className="sv-body">
          {err ? <div className="sv-msg err">{err}</div> : !sh ? <div className="sv-msg">جاري فتح الشيت…</div> : (
            <table className="sv-t" dir={sh.rtl ? 'rtl' : 'ltr'}>
              <colgroup>{sh.widths.map((w, k) => <col key={k} style={{ width: w }} />)}</colgroup>
              <tbody>
                {sh.rows.map((r, ri) => (
                  <tr key={ri} style={r.h ? { height: r.h } : undefined}>
                    {r.cells.map((c, ci) => c && (
                      <td key={ci} rowSpan={c.rs > 1 ? c.rs : undefined} colSpan={c.cs > 1 ? c.cs : undefined}
                        style={{ ...(c.num && !c.s.textAlign ? { textAlign: 'end', direction: 'ltr' } : null), ...c.s }}>{c.t}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

/** يفتح الشيت للعرض بس جوه الموقع */
export function viewSheet(path: string, name?: string | null) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const close = () => { root.unmount(); host.remove() }
  root.render(<Viewer path={path} name={name || ''} onClose={close} />)
}
