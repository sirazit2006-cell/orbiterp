import { useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Icon } from '../components/Icon'

export default function Login() {
  const { signIn, notice } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // LoginRoute redirects as soon as the user is set.
      await signIn(username.trim(), password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Check the network and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="cb col" style={{ gap: 16, padding: 28 }}>
          <div className="brand"><i><Icon name="plus" lg /></i><div>OrbitERP<small>Sign in to your counter</small></div></div>
          {notice && <div className="al amb"><Icon name="info" /><div>{notice}</div></div>}
          {error && <div className="al red" role="alert"><Icon name="warn" /><div>{error}</div></div>}
          <div className="fld"><label className="lbl" htmlFor="u">Username</label>
            <input className="inp" id="u" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
          <div className="fld"><label className="lbl" htmlFor="pw">Password</label>
            <input className="inp" id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <button className="btn p l" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="hint" style={{ margin: 0 }}>Use your own login. Shared logins are not allowed, and you are signed out after 15 minutes without activity.</p>
        </div>
      </form>
    </div>
  )
}
