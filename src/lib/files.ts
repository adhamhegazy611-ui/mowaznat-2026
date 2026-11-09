// لينك ملف المشروع (Google Drive / OneDrive / أي لينك): بيتعرض زرار يفتح الملف
import { api } from './api'

/** بيفتح شيت الموازنة المرفوع: لينك مؤقت (10 دقايق) بينزّل الملف باسمه الأصلي فيفتح على Excel */
export async function openSheet(path: string, name?: string | null) {
  const url = await api.sheetUrl(path, name || '')
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export const isUrl = (v: string) => /^\s*https?:\/\//i.test(v)

export function fileKind(url: string): { tag: string; label: string; cls: string } {
  const u = url.toLowerCase()
  if (/\.pdf(\?|#|$)/.test(u) || u.includes('/pdf')) return { tag: 'PDF', label: 'فتح الملف', cls: 'pdf' }
  if (/\.(xlsx?|xlsm|csv)(\?|#|$)/.test(u) || u.includes('docs.google.com/spreadsheets') || u.includes(':x:'))
    return { tag: 'XLS', label: 'فتح الشيت', cls: 'xls' }
  if (/\.(docx?)(\?|#|$)/.test(u) || u.includes('docs.google.com/document') || u.includes(':w:'))
    return { tag: 'DOC', label: 'فتح الملف', cls: 'doc' }
  return { tag: '↗', label: 'فتح الملف', cls: 'any' }
}
