import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'

/** الدخول بنفس حساب «متابعة المقايسات» (اسم المستخدم + كلمة المرور) */
export default function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await api.signIn(username, password)
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login">
        <h1>موازنات</h1>
        <p>متابعة مشروعات الطرق والموازنات</p>
        <form onSubmit={submit}>
          <div className="field">
            <div className="lab">اسم المستخدم</div>
            <input
              className="ltr"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <div className="lab">كلمة المرور</div>
            <input
              type="password"
              className="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {err && <div className="err">{err}</div>}
          <button className="btn primary" disabled={busy}>
            {busy ? '…' : 'دخول'}
          </button>
        </form>
        <p style={{ margin: '14px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>
          نفس اسم المستخدم وكلمة المرور بتوع «متابعة المقايسات». الحسابات الجديدة بتتعمل من هناك، والمدير بيدّيها صلاحية هنا.
        </p>
      </div>
    </div>
  )
}
