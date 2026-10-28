export type Mark = '✓' | '✗' | null
export type CellColor = 'green' | 'darkgreen' | 'orange' | 'yellow' | 'red'
export type Role = 'admin' | 'editor' | 'viewer'

export interface Project {
  id: number
  sort_order: number
  name: string
  sector: string | null
  stopped_count: number | null
  delivered_count: number | null
  battalion: string | null
  reviewer: string | null
  pricing_by: string | null
  contracts_reviewer: string | null
  self_reviewer: string | null
  date_drawings: string | null
  date_pricing: string | null
  date_contracts: string | null
  date_self: string | null
  st_drawings: Mark
  st_budget: Mark
  st_self: Mark
  st_contracts: Mark
  blocked_on: string | null
  action_taken: string | null
  total_incl: number | null
  total_excl: number | null
  budget_status: string | null
  file_path: string | null
  notes: string | null
  colors: Partial<Record<keyof Project, CellColor>>
  updated_at?: string
}

export type ProjectInput = Omit<Project, 'id'> & { id?: number }

export interface Reviewer {
  id: number
  name: string
  sort_order: number
  active: boolean
}

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: Role | null
  /** null = كل المشاريع */
  battalions: string[] | null
}

export interface HistoryEntry {
  id: number
  project_id: number | null
  project_name: string | null
  action: 'insert' | 'update' | 'delete'
  changes: Record<string, [unknown, unknown]> | null
  user_email: string | null
  created_at: string
}
