import type { Project } from './types'
import { nameKey } from './util'

/** سطر من شيت «موقف المقايسات المتوقفة» = مقايسة واحدة */
export interface SheetRow {
  battalion: string
  company: string
  project: string
  note: string
}

/** كل المقايسات اللي ليها نفس اسم المشروع في الشيت */
export interface SheetGroup {
  key: string
  name: string
  battalion: string
  rows: SheetRow[]
  note: string
  projectId: number | null
  how: 'alias' | 'exact' | 'guess' | 'none' | 'ignored'
}

// ---------- قراءة الشيت ----------
type CellLike = { value: unknown; isMerged?: boolean; master?: { value: unknown } }

function text(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return v.toLocaleDateString('ar-EG')
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string }
    if (o.richText) return o.richText.map((r) => r.text).join('').trim()
    if ('result' in o) return text(o.result)
    if (o.text) return String(o.text).trim()
  }
  return String(v).trim()
}
const cellText = (c: CellLike) => text(c.isMerged && c.master ? c.master.value : c.value)

export async function readSheet(file: File): Promise<SheetRow[]> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())

  for (const ws of wb.worksheets) {
    // نلاقي صف العناوين: فيه «المشروع»
    let headerRow = 0
    const col = { bat: 0, company: 0, project: 0, note: 0 }
    ws.eachRow((row, r) => {
      if (headerRow) return
      row.eachCell((c, i) => {
        const t = text(c.value)
        if (/^المشروع/.test(t)) col.project = i
        else if (/الكتيب/.test(t)) col.bat = i
        else if (/الشرك/.test(t)) col.company = i
        else if (/ملاحظ/.test(t)) col.note = i
      })
      if (col.project) headerRow = r
    })
    if (!headerRow) continue

    const out: SheetRow[] = []
    let lastProject = ''
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const first = text(row.getCell(1).value)
      if (/^(إ|ا)جمال/.test(first)) break
      const get = (i: number) => (i ? cellText(row.getCell(i) as unknown as CellLike) : '')
      const company = get(col.company)
      let project = get(col.project)
      const note = get(col.note)
      if (!project && !company) continue
      // خانة المشروع فاضية في نص مجموعة → نفس المشروع اللي فوقها
      if (!project) project = lastProject
      lastProject = project
      out.push({ battalion: get(col.bat), company, project, note })
    }
    if (out.length) return out
  }
  throw new Error('مش لاقي في الشيت عمود اسمه «المشروع». اتأكد إنه نفس شكل شيت موقف المقايسات المتوقفة.')
}

// ---------- الملاحظة اللي بتتكتب في «متوقف على» ----------
export function buildNote(rows: SheetRow[]): string {
  const byNote = new Map<string, string[]>()
  for (const r of rows) {
    const n = r.note.trim()
    byNote.set(n, [...(byNote.get(n) ?? []), r.company.trim()].filter(Boolean))
  }
  const companies = (list: string[]) => {
    const m = new Map<string, number>()
    list.forEach((c) => m.set(c, (m.get(c) ?? 0) + 1))
    return [...m].map(([c, n]) => (n > 1 ? `${c} (${n})` : c))
  }
  if (byNote.size === 1) {
    const [[n, cs]] = [...byNote]
    const list = [...new Set(cs)]
    return [n, list.length ? `(${list.join(' – ')})` : ''].filter(Boolean).join(' ')
  }
  return [...byNote].map(([n, cs]) => `${companies(cs).join('، ')}: ${n || '—'}`).join('\n')
}

// ---------- المطابقة ----------
const STOP = new Set(['مشروع', 'موازنه', 'لاعمال', 'اعمال', 'تطوير', 'ب', 'و', 'في', 'من', 'مع', 'ال', 'علي', 'الي'])
// «مينا» و«ميناء»، «الصناعه» و«الصناعيه»، «ومداخل» و«مداخل»: نقارن أول 4 حروف من غير «و/ب/ل» و«ال»
const stem = (w: string) => {
  const x = w.replace(/^[وبلف]?ال/, '')
  const y = x === w && /^[وبلف]/.test(w) && w.length > 4 ? w.slice(1) : x
  return y.slice(0, 4)
}
const stems = (k: string) => [...new Set(k.split(' ').filter((w) => w.length > 1 && !STOP.has(w)).map(stem))]

/** درجة التشابه: الكلمات النادرة (زي «قويسنا» و«العوينات») وزنها أكبر من الكلمات المتكررة (زي «مطار» و«طرق») */
function makeScorer(projectKeys: string[]) {
  const df = new Map<string, number>()
  for (const k of projectKeys) for (const s of stems(k)) df.set(s, (df.get(s) ?? 0) + 1)
  const N = projectKeys.length
  const idf = (s: string) => Math.log(1 + N / (1 + (df.get(s) ?? 0)))
  return (sheetKey: string, projectKey: string) => {
    const a = stems(sheetKey), b = new Set(stems(projectKey))
    if (!a.length) return 0
    const total = a.reduce((n, s) => n + idf(s), 0)
    const shared = a.filter((s) => b.has(s)).reduce((n, s) => n + idf(s), 0)
    return shared / total
  }
}

export function groupAndMatch(rows: SheetRow[], projects: Project[], aliases: Map<string, number | null>): SheetGroup[] {
  const groups = new Map<string, SheetGroup>()
  for (const r of rows) {
    const key = nameKey(r.project)
    const g = groups.get(key) ?? { key, name: r.project.trim(), battalion: r.battalion, rows: [], note: '', projectId: null, how: 'none' as const }
    if (!g.battalion && r.battalion) g.battalion = r.battalion
    g.rows.push(r)
    groups.set(key, g)
  }
  const pkeys = projects.map((p) => ({ p, k: nameKey(p.name) }))
  const score = makeScorer(pkeys.map((x) => x.k))
  for (const g of groups.values()) {
    g.note = buildNote(g.rows)
    if (aliases.has(g.key)) {
      const id = aliases.get(g.key) ?? null
      if (id == null) { g.how = 'ignored'; continue }
      if (projects.some((p) => p.id === id)) { g.projectId = id; g.how = 'alias'; continue }
    }
    const exact = pkeys.find((x) => x.k === g.key)
    if (exact) { g.projectId = exact.p.id; g.how = 'exact'; continue }
    let best: { id: number; s: number } | null = null
    for (const { p, k } of pkeys) {
      const s = score(g.key, k)
      if (s > (best?.s ?? 0)) best = { id: p.id, s }
    }
    if (best && best.s >= 0.75) { g.projectId = best.id; g.how = 'guess' }
  }
  return [...groups.values()]
}

// ---------- التغييرات اللي هتتحفظ ----------
export interface Change {
  id: number
  name: string
  from: { stopped_count: number | null; blocked_on: string | null }
  to: { stopped_count: number; blocked_on?: string | null }
}

export function planChanges(groups: SheetGroup[], projects: Project[], zeroOthers: boolean): Change[] {
  const byProject = new Map<number, { count: number; notes: string[] }>()
  for (const g of groups) {
    if (g.projectId == null) continue
    const x = byProject.get(g.projectId) ?? { count: 0, notes: [] }
    x.count += g.rows.length
    x.notes.push(g.note)
    byProject.set(g.projectId, x)
  }
  const out: Change[] = []
  for (const p of projects) {
    const x = byProject.get(p.id)
    const from = { stopped_count: p.stopped_count, blocked_on: p.blocked_on }
    if (x) {
      const note = x.notes.join('\n')
      if (p.stopped_count !== x.count || (p.blocked_on ?? '') !== note)
        out.push({ id: p.id, name: p.name, from, to: { stopped_count: x.count, blocked_on: note } })
    } else if (zeroOthers && (p.stopped_count ?? 0) !== 0) {
      out.push({ id: p.id, name: p.name, from, to: { stopped_count: 0 } })
    }
  }
  return out
}
