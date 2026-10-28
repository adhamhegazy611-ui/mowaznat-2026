import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { HistoryEntry, Profile, Project, ProjectInput, Reviewer, Role } from './types'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** لو مفيش مفاتيح Supabase الموقع بيشتغل «وضع تجريبي» على بيانات الشيت ومحفوظ في المتصفح بس */
export const DEMO = !URL || !KEY

export interface Session {
  userId: string
  email: string
  name: string
  /** null = عنده حساب في المقايسات بس مالوش صلاحية على «موازنات» */
  role: Role | null
}

/** نفس نظام المقايسات: اسم المستخدم بيتحوّل لإيميل username@mo2ysaat.app */
export const LOGIN_DOMAIN = '@mo2ysaat.app'
export const toEmail = (u: string) => (u.includes('@') ? u.trim() : u.trim().toLowerCase() + LOGIN_DOMAIN)

export interface Api {
  getSession(): Promise<Session | null>
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string, fullName: string): Promise<void>
  resetPassword(email: string): Promise<void>
  signOut(): Promise<void>
  onAuthChange(cb: (event: string) => void): () => void
  updatePassword(password: string): Promise<void>

  listProjects(): Promise<Project[]>
  saveProject(p: ProjectInput): Promise<Project>
  patchProject(id: number, patch: Partial<Project>): Promise<void>
  deleteProject(id: number): Promise<void>
  onProjectsChange(cb: () => void): () => void

  listReviewers(): Promise<Reviewer[]>
  saveReviewer(r: Partial<Reviewer> & { name: string }): Promise<void>
  deleteReviewer(id: number): Promise<void>

  listProfiles(): Promise<Profile[]>
  setRole(id: string, role: Role | null): Promise<void>

  listHistory(projectId?: number): Promise<HistoryEntry[]>
}

// ------------------------------------------------------------------
// Supabase
// ------------------------------------------------------------------
function supabaseApi(sb: SupabaseClient): Api {
  const must = <T,>(r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message)
    return r.data
  }
  return {
    async getSession() {
      const { data } = await sb.auth.getSession()
      const u = data.session?.user
      if (!u) return null
      const { data: me } = await sb.rpc('mz_me').maybeSingle<{ username: string; role: Role | null }>()
      const username = me?.username ?? (u.email ?? '').split('@')[0]
      return { userId: u.id, email: u.email ?? '', name: username, role: me?.role ?? null }
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email: toEmail(email), password })
      if (error) throw new Error(translateAuthError(error.message))
    },
    async signUp(email, password, fullName) {
      const { error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
      if (error) throw new Error(translateAuthError(error.message))
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      if (error) throw new Error(translateAuthError(error.message))
    },
    async signOut() {
      await sb.auth.signOut()
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => cb(event))
      return () => data.subscription.unsubscribe()
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password })
      if (error) throw new Error(translateAuthError(error.message))
    },

    async listProjects() {
      return must(await sb.from('mz_projects').select('*').order('sort_order').order('id')) as Project[]
    },
    async saveProject(p) {
      const { id, updated_at, ...rest } = p as Project
      void updated_at
      if (id) return must(await sb.from('mz_projects').update(rest).eq('id', id).select().single()) as Project
      return must(await sb.from('mz_projects').insert(rest).select().single()) as Project
    },
    async patchProject(id, patch) {
      must(await sb.from('mz_projects').update(patch).eq('id', id))
    },
    async deleteProject(id) {
      must(await sb.from('mz_projects').delete().eq('id', id))
    },
    onProjectsChange(cb) {
      const ch = sb
        .channel('mz-projects-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mz_projects' }, () => cb())
        .subscribe()
      return () => {
        sb.removeChannel(ch)
      }
    },

    async listReviewers() {
      return must(await sb.from('mz_reviewers').select('*').order('sort_order').order('id')) as Reviewer[]
    },
    async saveReviewer(r) {
      if (r.id) must(await sb.from('mz_reviewers').update({ name: r.name, active: r.active, sort_order: r.sort_order }).eq('id', r.id))
      else must(await sb.from('mz_reviewers').insert({ name: r.name, sort_order: r.sort_order ?? 99 }))
    },
    async deleteReviewer(id) {
      must(await sb.from('mz_reviewers').delete().eq('id', id))
    },

    async listProfiles() {
      const rows = must(await sb.rpc('mz_list_users')) as { user_id: string; username: string; role: Role | null }[]
      return rows.map((r) => ({ id: r.user_id, email: r.username, full_name: r.username, role: r.role }))
    },
    async setRole(id, role) {
      must(await sb.rpc('mz_set_role', { p_user: id, p_role: role }))
    },

    async listHistory(projectId) {
      let q = sb.from('mz_history').select('*').order('created_at', { ascending: false }).limit(300)
      if (projectId) q = q.eq('project_id', projectId)
      return must(await q) as HistoryEntry[]
    },
  }
}

function translateAuthError(m: string): string {
  if (/invalid login/i.test(m)) return 'اسم المستخدم أو كلمة المرور غلط'
  if (/email not confirmed/i.test(m)) return 'لازم تأكد البريد الأول من الرسالة اللي وصلتك'
  if (/already registered/i.test(m)) return 'البريد ده مسجّل قبل كده'
  if (/at least 6/i.test(m)) return 'كلمة المرور لازم تكون ٦ حروف على الأقل'
  return m
}

// ------------------------------------------------------------------
// وضع تجريبي (من غير Supabase) — البيانات في localStorage
// ------------------------------------------------------------------
type SeedFile = { reviewers: string[]; projects: (Omit<Project, 'id'> & { source_row?: number })[] }

function demoApi(): Api {
  const KEY_DB = 'mowazanat-demo-v1'
  type DB = { projects: Project[]; reviewers: Reviewer[]; history: HistoryEntry[]; seq: number }
  const fresh = (): DB => {
    // بيانات المشاريع الحقيقية في Supabase بس، مش جوه الكود (عشان الريبو والموقع عامّين)
    const s: SeedFile = { reviewers: [], projects: [] }
    const projects = s.projects.map((p, i) => {
      const { source_row, ...rest } = p
      void source_row
      return { ...rest, id: i + 1 } as Project
    })
    return {
      projects,
      reviewers: s.reviewers.map((name, i) => ({ id: i + 1, name, sort_order: i + 1, active: true })),
      history: [],
      seq: 1000,
    }
  }
  let mem: DB | null = null
  const load = (): DB => {
    if (mem) return mem
    try {
      const raw = localStorage.getItem(KEY_DB)
      if (raw) mem = JSON.parse(raw) as DB
    } catch {
      /* ignore */
    }
    if (!mem) mem = fresh()
    return mem
  }
  const save = () => {
    try {
      localStorage.setItem(KEY_DB, JSON.stringify(mem))
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l())
  }
  const listeners = new Set<() => void>()
  const log = (p: Project, action: HistoryEntry['action'], changes: HistoryEntry['changes'] = null) => {
    const db = load()
    db.history.unshift({
      id: ++db.seq,
      project_id: p.id,
      project_name: p.name,
      action,
      changes,
      user_email: 'demo@mowazanat',
      created_at: new Date().toISOString(),
    })
  }
  const diff = (a: Project, b: Project) => {
    const d: Record<string, [unknown, unknown]> = {}
    for (const k of Object.keys(b) as (keyof Project)[]) {
      if (k === 'updated_at') continue
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) d[k] = [a[k], b[k]]
    }
    return d
  }
  const session: Session = { userId: 'demo', email: 'demo@mowazanat', name: 'وضع تجريبي', role: 'admin' }

  return {
    async getSession() {
      return session
    },
    async signIn() {},
    async signUp() {},
    async resetPassword() {},
    async signOut() {
      if (confirm('ترجيع البيانات التجريبية لأصلها (زي الشيت)؟')) {
        mem = fresh()
        save()
      }
    },
    onAuthChange() {
      return () => {}
    },
    async updatePassword() {},
    async listProjects() {
      return [...load().projects].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    },
    async saveProject(p) {
      const db = load()
      const now = new Date().toISOString()
      if (p.id) {
        const i = db.projects.findIndex((x) => x.id === p.id)
        const next = { ...db.projects[i], ...p, updated_at: now } as Project
        const d = diff(db.projects[i], next)
        db.projects[i] = next
        if (Object.keys(d).length) log(next, 'update', d)
        save()
        return next
      }
      const created = { ...p, id: ++db.seq, updated_at: now } as Project
      db.projects.push(created)
      log(created, 'insert')
      save()
      return created
    },
    async patchProject(id, patch) {
      const db = load()
      const i = db.projects.findIndex((x) => x.id === id)
      const next = { ...db.projects[i], ...patch, updated_at: new Date().toISOString() }
      const d = diff(db.projects[i], next)
      db.projects[i] = next
      if (Object.keys(d).length) log(next, 'update', d)
      save()
    },
    async deleteProject(id) {
      const db = load()
      const p = db.projects.find((x) => x.id === id)
      db.projects = db.projects.filter((x) => x.id !== id)
      if (p) log(p, 'delete')
      save()
    },
    onProjectsChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async listReviewers() {
      return [...load().reviewers].sort((a, b) => a.sort_order - b.sort_order)
    },
    async saveReviewer(r) {
      const db = load()
      if (r.id) db.reviewers = db.reviewers.map((x) => (x.id === r.id ? { ...x, ...r } : x))
      else db.reviewers.push({ id: ++db.seq, name: r.name, sort_order: r.sort_order ?? 99, active: true })
      save()
    },
    async deleteReviewer(id) {
      const db = load()
      db.reviewers = db.reviewers.filter((x) => x.id !== id)
      save()
    },
    async listProfiles() {
      return [{ id: 'demo', email: 'demo@mowazanat', full_name: 'وضع تجريبي', role: 'admin' }]
    },
    async setRole() {},
    async listHistory(projectId) {
      const h = load().history
      return projectId ? h.filter((x) => x.project_id === projectId) : h
    },
  }
}

export const api: Api = DEMO ? demoApi() : supabaseApi(createClient(URL!, KEY!))
