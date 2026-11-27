import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ApiError, get, post, put } from '../api/client'
import type { DuplicateMatch, Gender, Patient, PatientInput } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Icon } from '../components/Icon'
import { usePage } from '../components/page'
import { dobLabel, fmtAbha, fmtDateTime, genderLabel } from '../lib/format'
import { useHospital } from '../lib/useHospital'

const EMPTY: PatientInput = {
  full_name: '', gender: '', dob: '', age_years: '', mobile: '', address_line: '', city: '', state: '', pin_code: '',
  email: '', blood_group: '', emergency_contact_name: '', emergency_contact_mobile: '',
  id_proof_type: '', id_proof_number: '', abha_number: '',
}

const reasonLabel: Record<string, string> = { name: 'Name', dob: 'DOB', mobile: 'Mobile' }

function fromPatient(p: Patient): PatientInput {
  return {
    full_name: p.full_name, gender: p.gender,
    dob: p.dob_is_estimated ? '' : p.dob, age_years: p.dob_is_estimated ? String(p.age_years) : '',
    mobile: p.mobile, address_line: p.address_line, city: p.city, state: p.state, pin_code: p.pin_code,
    email: p.email ?? '', blood_group: p.blood_group ?? '', emergency_contact_name: p.emergency_contact_name ?? '',
    emergency_contact_mobile: p.emergency_contact_mobile ?? '', id_proof_type: p.id_proof_type ?? '',
    id_proof_number: p.id_proof_number ?? '', abha_number: p.abha_number ? fmtAbha(p.abha_number) : '',
  }
}

function ageFromDob(dob: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null
  const d = new Date(`${dob}T00:00:00`)
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--
  return age >= 0 ? age : null
}

const today = () => new Date().toISOString().slice(0, 10)

export default function PatientForm() {
  const { id } = useParams()
  const editing = !!id
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const hospital = useHospital()

  const [original, setOriginal] = useState<Patient | null>(null)
  const [form, setForm] = useState<PatientInput>(() => ({
    ...EMPTY,
    mobile: params.get('mobile') ?? '',
    full_name: params.get('name') ?? '',
  }))
  const [consent, setConsent] = useState(false)
  const [reason, setReason] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [matches, setMatches] = useState<DuplicateMatch[]>([])
  const [confirmNew, setConfirmNew] = useState(false)
  const [saving, setSaving] = useState<null | 'save' | 'print'>(null)
  const [now] = useState(() => new Date().toISOString())
  const fileInput = useRef<HTMLInputElement>(null)
  const topRef = useRef<HTMLDivElement>(null)

  usePage(editing ? 'Edit patient' : 'Register new patient', editing
    ? ['Front desk', { label: 'Patients', to: '/patients' }, ...(original ? [{ label: original.full_name, to: `/patients/${original.id}` }] : []), 'Edit']
    : ['Front desk', { label: 'Patients', to: '/patients' }, 'New patient'])

  useEffect(() => {
    if (!id) return
    get<{ data: Patient }>(`/patients/${id}`).then((r) => { setOriginal(r.data); setForm(fromPatient(r.data)) })
      .catch(() => setFormError('Could not load this patient.'))
  }, [id])

  const set = <K extends keyof PatientInput>(k: K, v: PatientInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => {
      const { [k]: _drop, ...rest } = e
      void _drop
      return rest
    })
  }

  // Live duplicate check on name + mobile + date of birth.
  const dupKey = `${form.full_name.trim().toLowerCase()}|${form.mobile.replace(/\D/g, '').slice(-10)}|${form.dob}|${form.age_years}`
  useEffect(() => {
    const mobile = form.mobile.replace(/\D/g, '').slice(-10)
    const hasNameDob = form.full_name.trim().length >= 3 && (form.dob || form.age_years)
    if (mobile.length < 10 && !hasNameDob) { setMatches([]); return }
    const t = window.setTimeout(() => {
      post<{ data: DuplicateMatch[] }>('/patients/duplicates', {
        full_name: form.full_name.trim() || null,
        mobile: mobile.length === 10 ? mobile : null,
        dob: form.dob || null,
        age_years: form.dob ? null : form.age_years || null,
        except_id: id ? Number(id) : null,
      }).then((r) => { setMatches(r.data); setConfirmNew(false) }).catch(() => undefined)
    }, 350)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupKey, id])

  const strong = matches.find((m) => m.strong)
  const sameMobile = matches.filter((m) => m.reasons.includes('mobile')).length

  const identityChanged = useMemo(() => {
    if (!original) return false
    const o = fromPatient(original)
    return form.full_name.trim() !== o.full_name || form.gender !== o.gender || form.dob !== o.dob || form.age_years !== o.age_years
  }, [form, original])

  useEffect(() => {
    if (!photo) { setPhotoPreview(null); return }
    const url = URL.createObjectURL(photo)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  async function submit(e: FormEvent | null, then: 'save' | 'print') {
    e?.preventDefault()
    if (!editing && strong && !confirmNew) {
      setFormError('Choose “Same patient” or “New patient, save anyway” on the duplicate warning first.')
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    setSaving(then)
    setFormError(null)
    const body = {
      ...form,
      dob: form.dob || null,
      age_years: form.dob ? null : form.age_years || null,
      ...(editing ? { change_reason: reason || null } : { consent, confirm_new_patient: confirmNew }),
    }
    try {
      const res = editing
        ? await put<{ data: Patient }>(`/patients/${id}`, body)
        : await post<{ data: Patient }>('/patients', body)
      if (photo) {
        const fd = new FormData()
        fd.append('photo', photo)
        await post(`/patients/${res.data.id}/photo`, fd).catch(() => setFormError('Saved, but the photo could not be uploaded. Try again from Edit details.'))
      }
      const flash = editing ? 'Changes saved.' : `Registered. UHID ${res.data.uhid} issued.`
      nav(then === 'print' ? `/patients/${res.data.id}/card` : `/patients/${res.data.id}`, { state: { flash } })
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setErrors(err.fieldErrors)
        setFormError('Some fields need attention.')
      } else if (err instanceof ApiError && err.status === 409) {
        setMatches((err.body.matches as DuplicateMatch[]) ?? [])
        setFormError(null)
        topRef.current?.scrollIntoView({ behavior: 'smooth' })
      } else {
        setFormError(err instanceof Error ? err.message : 'Could not save.')
      }
    } finally {
      setSaving(null)
    }
  }

  const fe = (k: string) => errors[k] ? <span className="err-t">{errors[k]}</span> : null
  const cls = (k: string, extra = '') => `inp${errors[k] ? ' err' : ''}${extra ? ` ${extra}` : ''}`
  const age = form.dob ? ageFromDob(form.dob) : null

  if (editing && !original && !formError) return <div className="empty">Loading…</div>

  return (
    <form onSubmit={(e) => submit(e, 'save')} noValidate>
      <div className="col" style={{ gap: 20 }}>
        <div className="ph" ref={topRef}>
          <div>
            <h1>{editing ? `Edit ${original?.full_name ?? 'patient'}` : 'Register new patient'}</h1>
            <p>{editing ? 'Changes are saved to the audit trail with the old and new value.' : <>A permanent UHID is issued when you save. Fields marked <span style={{ color: 'var(--red)' }}>*</span> are required.</>}</p>
          </div>
          <div className="sp" />
          {editing ? <span className="chip nd out mono">{original?.uhid}</span> : <span className="chip nd out">UHID assigned on save</span>}
        </div>

        <div className="split">
          <div className="l col" style={{ gap: 20 }}>
            {strong && !editing && (
              <div className={`al ${confirmNew ? 'blu' : 'amb'}`} role="alert"><Icon name={confirmNew ? 'info' : 'warn'} lg />
                <div className="sp">
                  <b>{confirmNew ? 'Will be saved as a new patient' : `Possible duplicate: ${strong.patient.full_name} matches on mobile, name and date of birth`}</b>
                  <div style={{ margin: '2px 0 10px' }}>
                    UHID {strong.patient.uhid} · {genderLabel[strong.patient.gender]} · {dobLabel(strong.patient)} · {strong.patient.city}
                    {strong.patient.last_visit ? '' : ` · registered ${fmtDateTime(strong.patient.registered_at).split(',')[0]}`}
                  </div>
                  <div className="row wrap">
                    <Link className="btn s p" to={`/patients/${strong.patient.id}`}>Same patient, open profile</Link>
                    {confirmNew
                      ? <button className="btn s" type="button" onClick={() => setConfirmNew(false)}>Undo</button>
                      : <button className="btn s" type="button" onClick={() => { setConfirmNew(true); setFormError(null) }}>New patient, save anyway</button>}
                  </div>
                </div>
              </div>
            )}
            {formError && <div className="al red" role="alert"><Icon name="warn" /><div>{formError}</div></div>}

            <section className="card"><div className="ch">Basic details</div>
              <div className="cb g2">
                <div className="fld" style={{ gridColumn: '1/-1' }}><label className="lbl" htmlFor="n">Full name <i>*</i></label>
                  <input className={cls('full_name')} id="n" autoFocus={!editing} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} autoComplete="off" />{fe('full_name')}</div>
                <div className="fld"><span className="lbl" id="g-l">Gender <i>*</i></span>
                  <div className="seg" style={{ alignSelf: 'flex-start' }} role="radiogroup" aria-labelledby="g-l">
                    {(['male', 'female', 'other'] as Gender[]).map((g) => (
                      <button key={g} type="button" role="radio" aria-checked={form.gender === g} className={form.gender === g ? 'on' : ''} onClick={() => set('gender', g)}>{genderLabel[g]}</button>
                    ))}
                  </div>{fe('gender')}</div>
                <div className="fld"><label className="lbl" htmlFor="d">Date of birth <i>*</i></label>
                  <input className={cls('dob')} id="d" type="date" max={today()} min="1900-01-02" value={form.dob}
                    onChange={(e) => { set('dob', e.target.value); if (e.target.value) set('age_years', '') }} />
                  <div className="age hint"><label htmlFor="age">{age !== null ? `Age ${age} years. Or enter age:` : 'Or enter age:'}</label>
                    <input className={cls('age_years')} id="age" inputMode="numeric" value={form.age_years}
                      onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); set('age_years', v); if (v) set('dob', '') }} /> years</div>
                  {fe('dob') ?? fe('age_years')}</div>
                <div className="fld"><label className="lbl" htmlFor="m">Mobile number <i>*</i></label>
                  <input className={cls('mobile', sameMobile > 0 ? 'err' : '')} id="m" inputMode="tel" placeholder="98765 43210" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
                  {fe('mobile') ?? (sameMobile > 0
                    ? <span className="hint" style={{ color: 'var(--red)' }}>Already used by {sameMobile} {sameMobile === 1 ? 'patient' : 'patients'}. Family members are allowed.</span>
                    : <span className="hint">10-digit mobile. One number can be shared by a family.</span>)}</div>
                <div className="fld"><label className="lbl" htmlFor="e">Email</label>
                  <input className={cls('email')} id="e" type="email" placeholder="name@example.com" value={form.email} onChange={(e) => set('email', e.target.value)} />{fe('email')}</div>
              </div></section>

            <section className="card"><div className="ch">Address</div>
              <div className="cb g3">
                <div className="fld" style={{ gridColumn: '1/-1' }}><label className="lbl" htmlFor="a">Address <i>*</i></label>
                  <input className={cls('address_line')} id="a" value={form.address_line} onChange={(e) => set('address_line', e.target.value)} />{fe('address_line')}</div>
                <div className="fld"><label className="lbl" htmlFor="c">City <i>*</i></label>
                  <input className={cls('city')} id="c" value={form.city} onChange={(e) => set('city', e.target.value)} />{fe('city')}</div>
                <div className="fld"><label className="lbl" htmlFor="s">State <i>*</i></label>
                  <input className={cls('state')} id="s" list="states" value={form.state} onChange={(e) => set('state', e.target.value)} />{fe('state')}</div>
                <div className="fld"><label className="lbl" htmlFor="p">PIN code <i>*</i></label>
                  <input className={cls('pin_code', 'mono')} id="p" inputMode="numeric" maxLength={6} value={form.pin_code} onChange={(e) => set('pin_code', e.target.value.replace(/\D/g, ''))} />{fe('pin_code')}</div>
              </div></section>

            <section className="card"><div className="ch">Additional details <small>Optional</small></div>
              <div className="cb g3">
                <div className="fld"><label className="lbl" htmlFor="bg">Blood group</label>
                  <select className={cls('blood_group')} id="bg" value={form.blood_group} onChange={(e) => set('blood_group', e.target.value)}>
                    <option value="">Select</option>{hospital?.options.blood_groups.map((b) => <option key={b}>{b}</option>)}
                  </select>{fe('blood_group')}</div>
                <div className="fld"><label className="lbl" htmlFor="ec">Emergency contact name</label>
                  <input className={cls('emergency_contact_name')} id="ec" value={form.emergency_contact_name} onChange={(e) => set('emergency_contact_name', e.target.value)} />{fe('emergency_contact_name')}</div>
                <div className="fld"><label className="lbl" htmlFor="ecm">Emergency contact mobile</label>
                  <input className={cls('emergency_contact_mobile')} id="ecm" inputMode="tel" value={form.emergency_contact_mobile} onChange={(e) => set('emergency_contact_mobile', e.target.value)} />{fe('emergency_contact_mobile')}</div>
                <div className="fld"><label className="lbl" htmlFor="ip">ID proof type</label>
                  <select className={cls('id_proof_type')} id="ip" value={form.id_proof_type} onChange={(e) => set('id_proof_type', e.target.value)}>
                    <option value="">Select</option>{hospital?.options.id_proof_types.map((t) => <option key={t}>{t}</option>)}
                  </select>{fe('id_proof_type')}</div>
                <div className="fld"><label className="lbl" htmlFor="in">ID proof number</label>
                  <input className={cls('id_proof_number', 'mono')} id="in" value={form.id_proof_number} onChange={(e) => set('id_proof_number', e.target.value)} />{fe('id_proof_number')}</div>
                <div className="fld"><label className="lbl" htmlFor="ab">ABHA number</label>
                  <input className={cls('abha_number', 'mono')} id="ab" placeholder="XX-XXXX-XXXX-XXXX" value={form.abha_number} onChange={(e) => set('abha_number', e.target.value)} />{fe('abha_number')}</div>
                <div className="fld"><span className="lbl">Photo</span>
                  <div className="row">
                    {photoPreview && <span className="av"><img src={photoPreview} alt="New photo" /></span>}
                    <button className="btn" type="button" onClick={() => fileInput.current?.click()}><Icon name="camera" />{photo ? 'Change photo' : original?.has_photo ? 'Replace photo' : 'Capture or upload photo'}</button>
                  </div>
                  <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" capture="user" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                  <span className="hint">JPEG, PNG or WebP, up to 4 MB.</span></div>
              </div></section>

            {editing ? (
              <section className="card"><div className="ch">Reason for change {identityChanged && <small>Required when name, date of birth or gender change</small>}</div>
                <div className="cb col">
                  <div className="fld"><label className="lbl" htmlFor="rs">Reason {identityChanged && <i>*</i>}</label>
                    <input className={cls('change_reason')} id="rs" placeholder="For example: spelling as on Aadhaar card" value={reason} onChange={(e) => { setReason(e.target.value); setErrors(({ change_reason: _x, ...r }) => (void _x, r)) }} />{fe('change_reason')}</div>
                </div>
                <div className="cf"><button className="btn p l" type="submit" disabled={!!saving}>{saving ? 'Saving…' : 'Save changes'}</button><div className="sp" /><Link className="btn g" to={`/patients/${id}`}>Cancel</Link></div>
              </section>
            ) : (
              <section className="card"><div className="ch">Consent to use data</div>
                <div className="cb col">
                  <label className="chk"><input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErrors(({ consent: _x, ...r }) => (void _x, r)) }} />
                    <span><b>Patient consents to use of their data for care and billing</b>
                      <span className="hint" style={{ display: 'block' }}>Under the Digital Personal Data Protection Act, 2023. The patient may ask for a copy or correction at any time. Consent is stored with date and time.</span></span></label>
                  {fe('consent')}
                </div>
                <div className="cf">
                  <button className="btn p l" type="submit" disabled={!!saving}>{saving === 'save' ? 'Saving…' : 'Save and issue UHID'}</button>
                  <button className="btn l" type="button" disabled={!!saving} onClick={() => submit(null, 'print')}>{saving === 'print' ? 'Saving…' : 'Save and print card'}</button>
                  <div className="sp" /><Link className="btn g" to="/patients">Cancel</Link>
                </div></section>
            )}
          </div>

          <aside className="rt col" style={{ gap: 16 }}>
            <div className="card"><div className="ch">System fields</div>
              <dl className="cb kv" style={{ margin: 0 }}>
                <dt>UHID</dt><dd className={original ? 'mono' : 'mut'}>{original?.uhid ?? 'Issued on save'}</dd>
                <dt>Registered on</dt><dd>{fmtDateTime(original?.registered_at ?? now)}</dd>
                <dt>Registered by</dt><dd>{original?.registered_by?.name ?? user?.name}</dd>
              </dl></div>
            <div className="card"><div className="ch">Matches found <small>{matches.length}</small></div>
              {matches.length ? (
                <div className="tw"><table className="tbl"><tbody>
                  {matches.map((m) => (
                    <tr key={m.patient.id} className={m.strong ? 'sel' : ''}>
                      <td><Link to={`/patients/${m.patient.id}`} className="b" style={{ color: 'var(--ink)' }}>{m.patient.full_name}</Link><div className="sm mut mono">{m.patient.uhid}</div></td>
                      <td className="r"><span className={`chip nd${m.strong ? ' amb' : ''}`}>{m.reasons.map((r) => reasonLabel[r]).join(', ')}</span></td>
                    </tr>
                  ))}
                </tbody></table></div>
              ) : <div className="cb hint">Patients with the same mobile, or the same name and date of birth, show up here as you type.</div>}
            </div>
            <div className="al blu"><Icon name="info" /><div>Name, date of birth and gender are locked after saving. Later edits need a reason and are logged with the old and new value.</div></div>
          </aside>
        </div>
      </div>
      <datalist id="states">{STATES.map((s) => <option key={s} value={s} />)}</datalist>
    </form>
  )
}

const STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands',
  'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry']
