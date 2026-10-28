import { useCallback, useEffect, useState } from 'react'
import { api, DEMO, type Session } from './lib/api'
import type { Project, Reviewer } from './lib/types'
import Login from './components/Login'
import ProjectsPage from './components/ProjectsPage'
import SummaryPage from './components/SummaryPage'
import AdminPage from './components/AdminPage'
import HistoryList from './components/HistoryList'
import type { HistoryEntry } from './lib/types'
import type { FieldKey } from './lib/columns'
import type { QuickKey } from './lib/util'

type Page = 'projects' | 'summary' | 'history' | 'admin'
const ROLE_AR = { admin: 'مدير', editor: 'محرر', viewer: 'مشاهد' } as const

const pageFromHash = (): Page => {
  const h = window.location.hash.replace('#', '') as Page
  return ['projects', 'summary', 'history', 'admin'].includes(h) ? h : 'projects'
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [page, setPage] = useState<Page>(pageFromHash)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [reviewers, setReviewers] = useState<Reviewer[]>([])
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [toastMsg, setToastMsg] = useState('')
  const [preset, setPreset] = useState<{ filters: Partial<Record<FieldKey, string[]>>; quick?: QuickKey | null; n: number }>({ filters: {}, n: 0 })

  const toast = useCallback((m: string) => {
    setToastMsg(m)
    window.setTimeout(() => setToastMsg((x) => (x === m ? '' : x)), 2600)
  }, [])

  const loadSession = useCallback(() => {
    api.getSession().then(setSession).catch(() => setSession(null))
  }, [])

  useEffect(() => {
    loadSession()
    return api.onAuthChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        const p = prompt('اكتب كلمة المرور الجديدة (٦ حروف على الأقل)')
        if (p) {
          try {
            await api.updatePassword(p)
            alert('اتغيّرت كلمة المرور ✓')
          } catch (e) {
            alert((e as Error).message)
          }
        }
      }
      loadSession()
    })
  }, [loadSession])

  const loadProjects = useCallback(() => {
    api.listProjects().then(setProjects).catch((e) => toast('مقدرتش أحمّل المشاريع: ' + e.message))
  }, [toast])
  const loadReviewers = useCallback(() => {
    api.listReviewers().then(setReviewers).catch(() => {})
  }, [])

  useEffect(() => {
    if (!session) return
    loadProjects()
    loadReviewers()
    return api.onProjectsChange(loadProjects)
  }, [session, loadProjects, loadReviewers])

  useEffect(() => {
    const h = () => setPage(pageFromHash())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])

  useEffect(() => {
    if (page === 'history' && session) api.listHistory().then(setHistory).catch(() => setHistory([]))
  }, [page, session, projects])

  const go = (p: Page) => {
    window.location.hash = p
    setPage(p)
  }

  if (session === undefined) return <div className="spinner">جاري التحميل…</div>
  if (!session) return <Login onDone={loadSession} />

  if (!session.role)
    return (
      <div className="login-wrap">
        <div className="login">
          <h1>موازنات</h1>
          <p>
            أهلاً {session.name}. حسابك شغّال، بس لسه ماخدش صلاحية على «موازنات». اطلب من المدير يفعّلهولك من صفحة الإدارة.
          </p>
          <button className="btn" onClick={() => api.signOut().then(loadSession)}>خروج</button>
        </div>
      </div>
    )

  const canEdit = session.role === 'admin' || session.role === 'editor'
  const isAdmin = session.role === 'admin'

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="logo">م</span>
          موازنات
        </div>
        <nav className="nav">
          <button className={page === 'projects' ? 'active' : ''} onClick={() => go('projects')}>مشروعات الطرق</button>
          <button className={page === 'summary' ? 'active' : ''} onClick={() => go('summary')}>الملخص</button>
          <button className={page === 'history' ? 'active' : ''} onClick={() => go('history')}>سجل التعديلات</button>
          {isAdmin && (
            <button className={page === 'admin' ? 'active' : ''} onClick={() => go('admin')}>الإدارة</button>
          )}
        </nav>
        <div className="user">
          <span className="who">{session.name}</span>
          <span className="role">{ROLE_AR[session.role]}</span>
          {session.battalions?.length ? (
            <span className="scope-chip" title="الحساب ده بيشوف مشاريع الكتايب دي بس">
              {session.battalions.map((b) => (isNaN(+b) ? b : 'ك' + b)).join('، ')}
            </span>
          ) : null}
          <button onClick={() => api.signOut().then(DEMO ? loadProjects : loadSession)}>{DEMO ? 'ترجيع البيانات' : 'خروج'}</button>
        </div>
      </header>
      {DEMO && (
        <div className="demo-banner">
          وضع تجريبي: البيانات من الشيت ومتسجّلة في المتصفح ده بس. بعد ربط Supabase (ملف .env) البيانات هتبقى مشتركة بين الكل وبتسجيل دخول.
        </div>
      )}
      <main>
        {projects == null ? (
          <div className="spinner">جاري تحميل المشاريع…</div>
        ) : page === 'summary' ? (
          <SummaryPage
            projects={projects}
            reviewers={reviewers}
            onPick={({ key, values }) => {
              setPreset({ filters: { [key]: values }, n: preset.n + 1 })
              go('projects')
            }}
            onQuick={(quick) => {
              setPreset({ filters: {}, quick, n: preset.n + 1 })
              go('projects')
            }}
          />
        ) : page === 'history' ? (
          <>
            <div className="page-head"><h1>سجل التعديلات</h1><span className="sub">آخر ٣٠٠ تعديل — مين عدّل إيه وإمتى</span></div>
            <div className="card">{history == null ? <div className="spinner">جاري التحميل…</div> : <HistoryList items={history} />}</div>
          </>
        ) : page === 'admin' && isAdmin ? (
          <AdminPage reviewers={reviewers} projects={projects} reloadReviewers={loadReviewers} toast={toast} me={session.userId} />
        ) : (
          <ProjectsPage
            key={preset.n}
            initialFilters={preset.filters}
            initialQuick={preset.quick}
            projects={projects}
            reviewers={reviewers}
            canEdit={canEdit}
            isAdmin={isAdmin}
            toast={toast}
            reload={loadProjects}
            defaultBattalion={session.battalions?.[0] ?? null}
          />
        )}
      </main>
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  )
}
