import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ApiError, get } from '../api/client'
import type { AuditEntry, Patient } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { usePage } from '../components/page'
import { dobLabel, fmtAbha, fmtDate, fmtDateTime, fmtMobile, fullAddress, genderLabel } from '../lib/format'

type Tab = 'details' | 'visits' | 'bills' | 'audit'

const fieldLabel: Record<string, string> = {
  full_name: 'Name', gender: 'Gender', dob: 'Date of birth', dob_is_estimated: 'DOB from age', mobile: 'Mobile',
  address_line: 'Address', city: 'City', state: 'State', pin_code: 'PIN', email: 'Email', blood_group: 'Blood group',
  emergency_contact_name: 'Emergency contact', emergency_contact_mobile: 'Emergency mobile', id_proof_type: 'ID proof type',
  id_proof_number: 'ID proof number', abha_number: 'ABHA number', photo: 'Photo', photo_path: 'Photo', is_active: 'Active',
}
const actionLabel: Record<string, [string, string]> = {
  create: ['Registered', 'grn'], update: ['Edited', 'amb'], view: ['Viewed', ''], print: ['Printed', 'blu'],
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

function VisitsEmpty() {
  return <div className="empty"><b>No visits yet</b>Visits appear here once appointments and OPD go live (Modules 2 and 3).</div>
}
function BillsEmpty() {
  return <div className="empty"><b>No bills yet</b>Bills appear here once OPD billing goes live (Module 4).</div>
}

export default function PatientProfile() {
  const { id } = useParams()
  const { can } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const [p, setP] = useState<Patient | null>(null)
  const [family, setFamily] = useState<Patient[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('details')
  const [audit, setAudit] = useState<AuditEntry[] | null>(null)
  const [flash, setFlash] = useState<string | null>((loc.state as { flash?: string } | null)?.flash ?? null)
  const canEdit = can('reception', 'admin')

  usePage(p?.full_name ?? 'Patient', ['Front desk', { label: 'Patients', to: '/patients' }, p?.full_name ?? '…'])

  useEffect(() => {
    setP(null); setAudit(null); setTab('details'); setError(null)
    get<{ data: Patient; family: Patient[] }>(`/patients/${id}`)
      .then((r) => { setP(r.data); setFamily(r.family) })
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'No patient with this ID.' : 'Could not load this patient.'))
  }, [id])

  useEffect(() => {
    if (!flash) return
    nav('.', { replace: true, state: null })
    const t = window.setTimeout(() => setFlash(null), 6000)
    return () => window.clearTimeout(t)
  }, [flash, nav])

  useEffect(() => {
    if (tab === 'audit' && audit === null && canEdit) {
      get<{ data: AuditEntry[] }>(`/patients/${id}/audit`).then((r) => setAudit(r.data)).catch(() => setAudit([]))
    }
  }, [tab, audit, id, canEdit])

  if (error) return <div className="al red"><Icon name="warn" /><div>{error} <Link to="/patients">Back to search</Link></div></div>
  if (!p) return <div className="empty">Loading…</div>

  const tabs: [Tab, string, number | null][] = [
    ['details', 'Details', null], ['visits', 'Visit history', 0], ['bills', 'Bills', 0],
    ...(canEdit ? [['audit', 'Audit trail', null] as [Tab, string, null]] : []),
  ]

  return (
    <>
      {flash && <div className="al grn toast" role="status"><Icon name="check" /><div><b>{flash}</b></div></div>}
      <section className="card">
        <div className="cb row wrap" style={{ gap: '20px 28px' }}>
          <Avatar name={p.full_name} patientId={p.id} hasPhoto={p.has_photo} large />
          <div>
            <div className="row wrap" style={{ gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>{p.full_name}</h1>
              {p.consent_at ? <span className="chip grn nd">Consent on file</span> : <span className="chip red nd">No consent recorded</span>}
              {!p.is_active && <span className="chip red nd">Inactive</span>}
            </div>
            <div className="mut" style={{ marginTop: 4 }}>{genderLabel[p.gender]} · {p.age_years} yrs · {dobLabel(p)} · <span className="mono">{fmtMobile(p.mobile, true)}</span></div>
            <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
              <span className="mono b">{p.uhid}</span>
              {p.blood_group && <span className="chip out nd">Blood group {p.blood_group}</span>}
            </div>
          </div>
          <div className="sp" />
          <div className="row wrap">
            {canEdit && <Link className="btn" to={`/patients/${p.id}/card`}><Icon name="print" />Print card</Link>}
            {canEdit && <Link className="btn" to={`/patients/${p.id}/edit`}>Edit details</Link>}
            <button className="btn p" type="button" disabled title="Appointments arrive in Module 2">Book appointment</button>
          </div>
        </div>
        <div className="tabs" role="tablist" style={{ padding: '0 18px' }}>
          {tabs.map(([t, label, count]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
              {label}{count !== null && <span className="chip nd out">{count}</span>}
            </button>
          ))}
        </div>
      </section>

      {tab === 'details' && (
        <div className="split">
          <div className="l col" style={{ gap: 20 }}>
            <section className="card"><div className="ch">Visit history <small>Newest first</small></div><VisitsEmpty /></section>
            <section className="card"><div className="ch">Recent bills</div><BillsEmpty /></section>
          </div>
          <aside className="rt col" style={{ gap: 16 }}>
            <section className="card"><div className="ch">Contact and address</div>
              <dl className="cb kv" style={{ margin: 0 }}>
                <dt>Mobile</dt><dd className="mono">{fmtMobile(p.mobile, true)}</dd>
                <dt>Email</dt><dd>{p.email || <span className="mut">Not added</span>}</dd>
                <dt>Address</dt><dd>{fullAddress(p)}</dd>
                <dt>Emergency</dt><dd>{p.emergency_contact_name || p.emergency_contact_mobile
                  ? <>{p.emergency_contact_name}{p.emergency_contact_name && p.emergency_contact_mobile ? ' · ' : ''}<span className="mono">{fmtMobile(p.emergency_contact_mobile)}</span></>
                  : <span className="mut">Not added</span>}</dd>
              </dl></section>
            <section className="card"><div className="ch">Identity</div>
              <dl className="cb kv" style={{ margin: 0 }}>
                <dt>UHID</dt><dd className="mono">{p.uhid}</dd>
                <dt>Registered</dt><dd>{fmtDate(p.registered_at)}{p.registered_by ? ` by ${p.registered_by.name}` : ''}</dd>
                <dt>ABHA number</dt><dd className={p.abha_number ? 'mono' : 'mut'}>{p.abha_number ? fmtAbha(p.abha_number) : 'Not added'}</dd>
                <dt>ID proof</dt><dd>{p.id_proof_type ? `${p.id_proof_type} · ${p.id_proof_number_masked}` : <span className="mut">Not added</span>}</dd>
                <dt>Consent</dt><dd>{p.consent_at ? fmtDateTime(p.consent_at) : <span className="mut">Not recorded</span>}</dd>
              </dl></section>
            <section className="card"><div className="ch">Family on this mobile <small>{family.length}</small></div>
              <div className="cb col" style={{ gap: 10 }}>
                {family.length ? family.map((f) => (
                  <Link key={f.id} className="row" to={`/patients/${f.id}`} style={{ color: 'var(--ink)' }}>
                    <Avatar name={f.full_name} patientId={f.id} hasPhoto={f.has_photo} />
                    <div><div className="b">{f.full_name}</div><div className="sm mut mono">{f.uhid}</div></div>
                  </Link>
                )) : <span className="hint">No one else is registered on this mobile.</span>}
              </div></section>
          </aside>
        </div>
      )}

      {tab === 'visits' && <section className="card"><div className="ch">Visit history</div><VisitsEmpty /></section>}
      {tab === 'bills' && <section className="card"><div className="ch">Bills</div><BillsEmpty /></section>}

      {tab === 'audit' && (
        <section className="card"><div className="ch">Audit trail <small>Every view, change and print of this record. Entries cannot be edited.</small></div>
          {audit === null ? <div className="empty">Loading…</div> : (
            <div className="tw"><table className="tbl">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
              <tbody>
                {audit.map((a) => {
                  const [label, color] = actionLabel[a.action] ?? [a.action, '']
                  const changed = a.action === 'update' ? Object.keys({ ...a.old_value, ...a.new_value }) : []
                  return (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.at)}</td>
                      <td>{a.user ?? <span className="mut">System</span>}</td>
                      <td><span className={`chip nd ${color}`}>{label}</span></td>
                      <td>
                        {a.note && <div className="sm" style={{ marginBottom: changed.length ? 6 : 0 }}>{a.note}</div>}
                        {changed.length > 0 && (
                          <div className="diff">{changed.map((k) => (
                            <span key={k} style={{ display: 'contents' }}>
                              <span className="mut">{fieldLabel[k] ?? k}</span>
                              <span><del>{show(a.old_value?.[k])}</del> → <ins>{show(a.new_value?.[k])}</ins></span>
                            </span>
                          ))}</div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody></table></div>
          )}
        </section>
      )}
    </>
  )
}
