import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { get } from '../api/client'
import type { Patient } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { usePage } from '../components/page'
import { ageGender, fmtDate, fmtMobile, fmtTime, isToday } from '../lib/format'

type By = 'any' | 'mobile' | 'name' | 'uhid'
const BY: [By, string][] = [['any', 'Any'], ['mobile', 'Mobile'], ['name', 'Name'], ['uhid', 'UHID']]

interface RecentRow { patient: Patient; last_activity_at: string; registered_today: boolean }
interface Stats { registered_today: number; registered_by_me_today: number; total_patients: number }

export default function PatientSearch() {
  usePage('Patients', ['Front desk', 'Patients'])
  const { can } = useAuth()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [by, setBy] = useState<By>((params.get('by') as By) || 'any')
  const [results, setResults] = useState<Patient[] | null>(null)
  const [sharedMobile, setSharedMobile] = useState<string | null>(null)
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const canRegister = can('reception', 'admin')

  // "/" from anywhere focuses the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    get<{ data: RecentRow[] }>('/patients/recent').then((r) => setRecent(r.data)).catch(() => undefined)
    get<Stats>('/patients/stats').then(setStats).catch(() => undefined)
  }, [])

  // Debounced search as you type.
  useEffect(() => {
    const text = q.trim()
    setParams(text ? { q: text, ...(by !== 'any' ? { by } : {}) } : {}, { replace: true })
    if (text.length < 3) { setResults(null); setError(null); return }
    setLoading(true)
    const t = window.setTimeout(() => {
      get<{ data: Patient[]; shared_mobile: string | null }>(`/patients?q=${encodeURIComponent(text)}&by=${by}`)
        .then((r) => { setResults(r.data); setSharedMobile(r.shared_mobile); setSelected(0); setError(null) })
        .catch(() => setError('Search failed. Try again.'))
        .finally(() => setLoading(false))
    }, 220)
    return () => window.clearTimeout(t)
  }, [q, by, setParams])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // "/" is the focus shortcut; don't type it into an empty box.
    if (e.key === '/' && !e.currentTarget.value) { e.preventDefault(); return }
    if (!results?.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); nav(`/patients/${results[selected].id}`) }
  }

  // Prefill the new-patient form with what was typed.
  const text = q.trim()
  const digits = text.replace(/\D/g, '')
  const prefill = /^[\d\s+-]+$/.test(text) && digits.length >= 10 ? `?mobile=${digits.slice(-10)}` : /^[a-z .'-]+$/i.test(text) ? `?name=${encodeURIComponent(text)}` : ''

  const heading = results === null ? '' : results.length === 0
    ? `No patients match “${text}”`
    : sharedMobile ? `${results.length} patients on mobile ${fmtMobile(sharedMobile)}` : `${results.length} ${results.length === 1 ? 'patient' : 'patients'} found`

  return (
    <>
      <div className="ph">
        <div><h1>Patients</h1><p>Find a returning patient by mobile number, name or UHID.</p></div>
        <div className="sp" />
        {canRegister && <Link className="btn p l" to={`/patients/new${prefill}`}><Icon name="plus" />Register new patient</Link>}
      </div>

      <section className="card">
        <div className="cb col" style={{ gap: 14 }}>
          <div className="sch"><Icon name="search" lg />
            <input ref={input} className="inp" style={{ minHeight: 54, fontSize: 18, paddingLeft: 46 }} aria-label="Search patients"
              placeholder="Mobile number, name or UHID" autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} />
          </div>
          <div className="row wrap" style={{ gap: 16 }}>
            <div className="seg" role="radiogroup" aria-label="Search by">
              {BY.map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={by === v} className={by === v ? 'on' : ''} onClick={() => setBy(v)}>{label}</button>
              ))}
            </div>
            <span className="hint">Press <span className="kbd">/</span> from anywhere to search. Type 3 or more characters. <span className="kbd">↑</span> <span className="kbd">↓</span> to pick, <span className="kbd">Enter</span> to open.</span>
          </div>
        </div>
      </section>

      {error && <div className="al red"><Icon name="warn" /><div>{error}</div></div>}

      {results !== null && (
        <section className="card" aria-busy={loading}>
          <div className="ch">{heading} {sharedMobile && <small>One mobile number can belong to several family members.</small>}</div>
          {results.length > 0 ? (
            <div className="tw"><table className="tbl">
              <thead><tr><th>Patient</th><th>UHID</th><th>Mobile</th><th>Last visit</th><th className="r">Actions</th></tr></thead>
              <tbody>
                {results.map((p, i) => (
                  <tr key={p.id} className={`click${i === selected ? ' sel' : ''}`} onClick={() => nav(`/patients/${p.id}`)}>
                    <td><div className="row"><Avatar name={p.full_name} patientId={p.id} hasPhoto={p.has_photo} /><div><div className="b">{p.full_name}</div><div className="sm mut">{ageGender(p)}</div></div></div></td>
                    <td className="mono">{p.uhid}</td>
                    <td className="mono">{fmtMobile(p.mobile)}</td>
                    <td>{p.last_visit ? fmtDate(p.last_visit.date) : <span className="mut">No visits yet</span>}</td>
                    <td className="r" onClick={(e) => e.stopPropagation()}><div className="row" style={{ justifyContent: 'flex-end' }}>
                      <Link className="btn s" to={`/patients/${p.id}`}>Open profile</Link>
                      <button className="btn s p" type="button" disabled title="Appointments arrive in Module 2">Book visit</button>
                    </div></td>
                  </tr>
                ))}
              </tbody></table></div>
          ) : (
            <div className="empty"><b>No match</b>Check the spelling or number, or search by another field.</div>
          )}
          {canRegister && <div className="cf"><span className="mut sm">Not the patient you are looking for?</span><Link className="btn s" to={`/patients/new${prefill}`}>Register as new patient</Link></div>}
        </section>
      )}

      <div className="split">
        <section className="card l">
          <div className="ch">Recent patients <small>Registered or opened at this desk today</small></div>
          {recent.length ? (
            <div className="tw"><table className="tbl">
              <thead><tr><th>Patient</th><th>UHID</th><th>Registered</th><th>Status today</th><th></th></tr></thead>
              <tbody>
                {recent.map(({ patient: p, registered_today }) => (
                  <tr key={p.id}>
                    <td><div className="b">{p.full_name}</div><div className="sm mut">{ageGender(p)}</div></td>
                    <td className="mono">{p.uhid}</td>
                    <td>{isToday(p.registered_at) ? fmtTime(p.registered_at) : fmtDate(p.registered_at)}</td>
                    <td>{registered_today ? <span className="chip blu">New registration</span> : <span className="chip out">Returning</span>}</td>
                    <td className="r"><Link to={`/patients/${p.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody></table></div>
          ) : <div className="empty"><b>No patients yet today</b>Patients you register or open will be listed here.</div>}
        </section>
        <aside className="rt col" style={{ gap: 16 }}>
          <div className="card"><div className="ch">Front desk today</div>
            <div className="cb col" style={{ gap: 16 }}>
              <div className="row">
                <div className="sp"><div className="mut sm">Registered</div><div style={{ fontSize: 26, fontWeight: 600 }}>{stats?.registered_today ?? '–'}</div></div>
                <div className="dv" />
                <div className="sp"><div className="mut sm">By you</div><div style={{ fontSize: 26, fontWeight: 600 }}>{stats?.registered_by_me_today ?? '–'}</div></div>
                <div className="dv" />
                <div className="sp"><div className="mut sm">All patients</div><div style={{ fontSize: 26, fontWeight: 600 }}>{stats?.total_patients ?? '–'}</div></div>
              </div>
            </div></div>
          <div className="card"><div className="ch">Quick actions</div>
            <div className="cb col" style={{ gap: 10 }}>
              {canRegister && <Link className="btn" style={{ justifyContent: 'flex-start' }} to="/patients/new"><Icon name="plus" />Register new patient</Link>}
              <button className="btn" style={{ justifyContent: 'flex-start' }} type="button" disabled title="Appointments arrive in Module 2">Check in a booked patient</button>
              <button className="btn" style={{ justifyContent: 'flex-start' }} type="button" disabled title="Tokens arrive in Module 2">Issue walk-in token</button>
              <span className="hint">To reprint a registration card, open the patient and choose Print card.</span>
            </div></div>
        </aside>
      </div>
    </>
  )
}
