import type { Project } from './types'
import { COLUMNS, cellBg, type Column } from './columns'
import { computeTotals, todayStr } from './util'

/** تصدير نفس شكل الشيت: RTL، صف العنوان، الألوان، صف الإجمالي، تجميد الهيدر وفلتر */
export async function exportToExcel(rows: Project[], visible: Column[]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('موقف المشاريع', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  })
  const cols = COLUMNS.filter((c) => visible.includes(c))
  ws.columns = cols.map((c) => ({ key: c.key, width: Math.max(8, Math.round(c.width / 7)) }))

  const border = { style: 'thin' as const, color: { argb: 'FF7F7F7F' } }
  const allBorders = { top: border, left: border, bottom: border, right: border }
  const font = { name: 'Arial', size: 11 }

  // صف 1: التاريخ + العنوان
  ws.getCell(1, 1).value = todayStr()
  ws.mergeCells(1, 2, 1, cols.length)
  const title = ws.getCell(1, 2)
  title.value = 'موقف المشاريع المتوقفة'
  title.font = { ...font, size: 16, bold: true }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  // صف 2: العناوين
  const head = ws.getRow(2)
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1)
    cell.value = c.label
    cell.font = { ...font, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
    cell.border = allBorders
  })
  head.height = 36

  rows.forEach((p, ri) => {
    const r = ws.getRow(3 + ri)
    cols.forEach((c, ci) => {
      const cell = r.getCell(ci + 1)
      let v: unknown = c.key === 'sort_order' ? ri + 1 : p[c.key]
      if (c.kind === 'date' && v) v = new Date(v as string)
      if (c.kind === 'num' && v != null) v = Number(v)
      cell.value = (v ?? null) as never
      if (c.kind === 'date') cell.numFmt = 'yyyy/mm/dd'
      cell.font = font
      cell.border = allBorders
      cell.alignment = {
        vertical: 'middle',
        wrapText: true,
        horizontal: c.kind === 'longtext' || c.kind === 'text' || c.kind === 'path' ? 'right' : 'center',
      }
      const bg = c.key === 'battalion' ? undefined : cellBg(p.colors, c.key)
      if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg.slice(1).toUpperCase() } }
      if (c.key === 'battalion') cell.font = { ...font, bold: true }
    })
  })

  // دمج خانة «ك» للصفوف المتتالية اللي ليها نفس الكتيبة
  const bi = cols.findIndex((c) => c.key === 'battalion')
  if (bi >= 0) {
    for (let i = 0; i < rows.length; ) {
      let j = i + 1
      if (rows[i].battalion) while (j < rows.length && rows[j].battalion === rows[i].battalion) j++
      if (j - i > 1) ws.mergeCells(3 + i, bi + 1, 2 + j, bi + 1)
      i = j
    }
  }

  // صف الإجمالي
  const t = computeTotals(rows)
  const tr = ws.getRow(3 + rows.length)
  cols.forEach((c, i) => {
    const cell = tr.getCell(i + 1)
    cell.border = allBorders
    cell.font = { ...font, bold: true }
    cell.alignment = { horizontal: 'center' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
    if (c.key === 'sort_order') cell.value = 'الاجمالى'
    else if (c.key === 'name') cell.value = `${t.count} مشروع`
    else if (c.key === 'stopped_count') cell.value = t.stopped
    else if (c.key === 'delivered_count') cell.value = t.delivered
    else if (c.kind === 'mark') cell.value = t.marks[c.key]
    else if (c.key === 'total_incl') cell.value = Math.round(t.incl * 100) / 100
    else if (c.key === 'total_excl') cell.value = Math.round(t.excl * 100) / 100
    else if (c.key === 'budget_status') cell.value = `موجودة: ${t.budgetFound}`
  })

  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + rows.length, column: cols.length } }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const d = new Date()
  a.download = `موقف المشاريع ${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
