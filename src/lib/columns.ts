import type { CellColor, Project } from './types'

export type ColKind = 'seq' | 'text' | 'longtext' | 'int' | 'num' | 'person' | 'date' | 'mark' | 'path' | 'battalion'
export type FieldKey = Exclude<keyof Project, 'id' | 'colors' | 'updated_at'>

export interface Column {
  key: FieldKey
  label: string
  kind: ColKind
  width: number
  /** hidden by default — the same columns that are hidden in the Excel sheet */
  hiddenByDefault?: boolean
  /** Excel column letter in «موقف المشاريع (2)» */
  excel: string
}

// نفس ترتيب أعمدة الشيت بالظبط (A → Y)
export const COLUMNS: Column[] = [
  { key: 'sort_order', label: 'م', kind: 'seq', width: 52, excel: 'A' },
  { key: 'name', label: 'بيان الاعمال', kind: 'text', width: 300, excel: 'B' },
  { key: 'sector', label: 'القطاع', kind: 'text', width: 130, excel: 'C' },
  { key: 'stopped_count', label: 'عدد المقايسات المتوقفة', kind: 'int', width: 96, hiddenByDefault: true, excel: 'D' },
  { key: 'delivered_count', label: 'مقايسات تم تسليمها', kind: 'int', width: 96, excel: 'E' },
  { key: 'battalion', label: 'الكتيبة', kind: 'battalion', width: 84, excel: 'F' },
  { key: 'reviewer', label: 'المراجع', kind: 'person', width: 124, excel: 'G' },
  { key: 'pricing_by', label: 'تسعير', kind: 'person', width: 124, hiddenByDefault: true, excel: 'H' },
  { key: 'contracts_reviewer', label: 'مراجعة العقود', kind: 'person', width: 124, hiddenByDefault: true, excel: 'I' },
  { key: 'self_reviewer', label: 'مراجعة الذاتي', kind: 'person', width: 124, excel: 'J' },
  { key: 'date_drawings', label: 'تاريخ مراجعة اللوحات', kind: 'date', width: 112, excel: 'K' },
  { key: 'date_pricing', label: 'تاريخ تسعير', kind: 'date', width: 112, hiddenByDefault: true, excel: 'L' },
  { key: 'date_contracts', label: 'تاريخ مراجعة العقود', kind: 'date', width: 112, hiddenByDefault: true, excel: 'M' },
  { key: 'date_self', label: 'تاريخ مراجعة الذاتي', kind: 'date', width: 112, excel: 'N' },
  { key: 'st_drawings', label: 'لوحات', kind: 'mark', width: 64, excel: 'O' },
  { key: 'st_budget', label: 'موازنة', kind: 'mark', width: 64, excel: 'P' },
  { key: 'st_self', label: 'ذاتي', kind: 'mark', width: 64, excel: 'Q' },
  { key: 'st_contracts', label: 'عقود', kind: 'mark', width: 64, excel: 'R' },
  { key: 'blocked_on', label: 'متوقف على', kind: 'longtext', width: 240, excel: 'S' },
  { key: 'action_taken', label: 'ما تم اجراؤه', kind: 'longtext', width: 230, excel: 'T' },
  { key: 'total_incl', label: 'شامل (مليون)', kind: 'num', width: 96, excel: 'U' },
  { key: 'total_excl', label: 'غير شامل (مليون)', kind: 'num', width: 96, excel: 'V' },
  { key: 'budget_status', label: 'موقف الموازنة', kind: 'text', width: 190, excel: 'W' },
  { key: 'file_path', label: 'مكان المشروع', kind: 'path', width: 150, excel: 'X' },
  { key: 'notes', label: 'ملاحظات مكتب التصميمات', kind: 'longtext', width: 280, excel: 'Y' },
]

export const MARK_KEYS: FieldKey[] = ['st_drawings', 'st_budget', 'st_self', 'st_contracts']

// ألوان الشيت الأصلية (Excel fill colors)
export const COLOR_HEX: Record<CellColor, string> = {
  green: '#92D050',
  darkgreen: '#00B050',
  orange: '#FFC000',
  yellow: '#FFFF00',
  red: '#FF0000',
}
export const COLOR_LABEL: Record<CellColor, string> = {
  green: 'أخضر',
  darkgreen: 'أخضر غامق',
  orange: 'برتقالي',
  yellow: 'أصفر',
  red: 'أحمر',
}
export const COLOR_ORDER: CellColor[] = ['green', 'darkgreen', 'orange', 'yellow', 'red']

// قيم شائعة من الشيت عشان تظهر اقتراحات وقت الكتابة
export const ACTION_SUGGESTIONS = [
  'تم الاعتماد في الهيئة',
  'جاري الاعتماد في الهيئة',
  'جاهز للتسليم للهيئة',
  'تم مراجعة اللوحات',
  'تم مراجعة لوحات فقط',
]
export const BUDGET_STATUS_SUGGESTIONS = [
  'موجودة',
  'مطلوب الموازنة مختومة',
  'منتظر اعتماد هيل من الكتيبة',
  'منتظر الموازنة مختومة مسعره من الكتيبة',
  'منتظر الموازنة مختومة بعد التسعير من الكتيبة',
  'منتظر الموازنة مختومة من الكتيبة + الذاتى',
  'منتظر من الكتيبة',
]
export const BLOCKED_SUGGESTIONS = [
  'اللوحات + الموازنة',
  'تعديل استرشادي الهيئة + الموازنة',
  'اعتماد هيل',
  'تم الاعتماد',
]

export const emptyProject = (sort_order: number): Omit<Project, 'id'> => ({
  sort_order,
  name: '',
  sector: null,
  stopped_count: null,
  delivered_count: null,
  battalion: null,
  reviewer: null,
  pricing_by: null,
  contracts_reviewer: null,
  self_reviewer: null,
  date_drawings: null,
  date_pricing: null,
  date_contracts: null,
  date_self: null,
  st_drawings: null,
  st_budget: null,
  st_self: null,
  st_contracts: null,
  blocked_on: null,
  action_taken: null,
  total_incl: null,
  total_excl: null,
  budget_status: null,
  file_path: null,
  notes: null,
  colors: {},
})
