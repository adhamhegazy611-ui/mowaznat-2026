import type { Project } from './types'
import type { Column, FieldKey } from './columns'

export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export const fmtNum = (v: number | null | undefined, digits = 2) =>
  v == null ? '' : v.toLocaleString('en-US', { maximumFractionDigits: digits })

export const fmtDate = (v: string | null) => {
  if (!v) return ''
  const [y, m, d] = v.split('-')
  return `${d}/${m}/${y}`
}

/** القيمة اللي بتظهر في الفلتر والبحث لأي خانة */
export function displayValue(p: Project, col: Column): string {
  const v = p[col.key as keyof Project]
  if (v == null || v === '') return ''
  if (col.kind === 'date') return fmtDate(v as string)
  if (col.kind === 'num') return fmtNum(v as number)
  return String(v).trim()
}

export const BLANK = '(فارغة)'

export function normalize(s: string) {
  return s
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export interface Totals {
  count: number
  stopped: number
  delivered: number
  marks: Record<string, number>
  budgetFound: number
  incl: number
  excl: number
}

export function computeTotals(rows: Project[]): Totals {
  const marks: Record<string, number> = { st_drawings: 0, st_budget: 0, st_self: 0, st_contracts: 0 }
  let stopped = 0, delivered = 0, budgetFound = 0, incl = 0, excl = 0
  for (const p of rows) {
    stopped += p.stopped_count ?? 0
    delivered += p.delivered_count ?? 0
    incl += Number(p.total_incl ?? 0)
    excl += Number(p.total_excl ?? 0)
    if (p.budget_status && /^موجود[ةه]$/.test(p.budget_status.trim())) budgetFound++
    for (const k of Object.keys(marks)) if (p[k as FieldKey] === '✓') marks[k]++
  }
  return { count: rows.length, stopped, delivered, marks, budgetFound, incl, excl }
}

export function copyText(t: string) {
  try {
    void navigator.clipboard.writeText(t)
    return true
  } catch {
    return false
  }
}

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
export function savePref(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

// ---------- الفلاتر السريعة (لما تدوس على كارت من الكروت اللي فوق) ----------
export type QuickKey = 'stopped' | 'delivered' | 'st_drawings' | 'st_budget' | 'st_self' | 'st_contracts' | 'budget' | 'incl' | 'excl'
export const QUICK_LABEL: Record<QuickKey, string> = {
  stopped: 'فيها مقايسات متوقفة',
  delivered: 'فيها مقايسات تم تسليمها',
  st_drawings: 'لوحات ✓',
  st_budget: 'موازنة ✓',
  st_self: 'ذاتي ✓',
  st_contracts: 'عقود ✓',
  budget: 'الموازنة موجودة',
  incl: 'ليها قيمة شامل',
  excl: 'ليها قيمة غير شامل',
}
export function quickPass(p: Project, k: QuickKey | null): boolean {
  switch (k) {
    case null:
      return true
    case 'stopped':
      return (p.stopped_count ?? 0) > 0
    case 'delivered':
      return (p.delivered_count ?? 0) > 0
    case 'budget':
      return !!p.budget_status && /^موجود[ةه]$/.test(p.budget_status.trim())
    case 'incl':
      return p.total_incl != null
    case 'excl':
      return p.total_excl != null
    default:
      return p[k] === '✓'
  }
}

/** «71-44» → [71, 44] ، «ك91-97» → [91, 97] — نفس mz_bat_tokens في قاعدة البيانات */
export function batTokens(b: string | null | undefined): string[] {
  return (b ?? '')
    .replace(/ك/g, '')
    .split(/[-–,/+]/)
    .map((x) => x.trim())
    .filter(Boolean)
}
