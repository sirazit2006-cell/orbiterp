import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { apiBlob, get, post } from '../api/client'
import type { Patient } from '../api/types'
import { Barcode } from '../components/Barcode'
import { Icon } from '../components/Icon'
import { dobLabel, fmtDate, fmtMobile, genderLabel } from '../lib/format'
import { useHospital } from '../lib/useHospital'

type Layout = 'card' | 'sticker' | 'both'

export default function RegistrationCard() {
  const { id } = useParams()
  const hospital = useHospital()?.hospital
  const [p, setP] = useState<Patient | null>(null)
  const [layout, setLayout] = useState<Layout>('card')
  const [copies, setCopies] = useState(1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    get<{ data: Patient }>(`/patients/${id}`).then((r) => {
      setP(r.data)
      document.title = `Registration card · ${r.data.full_name} · OrbitERP`
    })
  }, [id])

  if (!p) return <div className="cardpage">Loading…</div>

  const g = genderLabel[p.gender]

  async function printNow() {
    post(`/patients/${id}/printed`, { layout, copies }).catch(() => undefined)
    for (let i = 0; i < copies; i++) window.print()
  }

  async function downloadPdf() {
    setBusy(true)
    setMsg(null)
    try {
      const blob = await apiBlob(`/patients/${id}/card.pdf?layout=${layout}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `registration-${p!.uhid}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch {
      setMsg('Could not create the PDF. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cardpage">
      <div className="row no-print" style={{ gap: 16, marginBottom: 24 }}>
        <div><div style={{ fontSize: 22, fontWeight: 600 }}>Registration card and sticker</div>
          <div className="mut">Print preview for {p.full_name} · <span className="mono">{p.uhid}</span></div></div>
      </div>

      <div className={`print-area only-${layout}`}>
        <div className="card-wrap" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* card front */}
          <div className="pc" style={{ width: 480, height: 302, borderRadius: 14, background: '#fff', boxShadow: 'var(--sh2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'var(--navy)', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
              <div style={{ width: 42, height: 42, border: '1.5px dashed #6F8CA3', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#9FB6C8', textAlign: 'center', lineHeight: 1.1 }}>LOGO</div>
              <div><div style={{ fontWeight: 600, fontSize: 16 }}>{hospital?.name}</div><div style={{ fontSize: 11.5, color: '#9FB6C8', letterSpacing: '.06em' }}>OUTPATIENT REGISTRATION CARD</div></div>
            </div>
            <div style={{ padding: '16px 20px 0', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.01em' }}>{p.full_name}</div>
              <div className="mut" style={{ fontSize: 13.5 }}>{g} · {p.age_years} yrs · DOB {dobLabel(p)} · {fmtMobile(p.mobile, true)}</div>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', gap: 18, paddingBottom: 16 }}>
                <div style={{ flex: 1 }}><div className="xs mut" style={{ marginBottom: 2 }}>UHID</div><div className="mono b" style={{ fontSize: 20, letterSpacing: '.01em' }}>{p.uhid}</div></div>
                <div style={{ width: 176 }}><Barcode value={p.uhid} /><div className="mono" style={{ fontSize: 10.5, textAlign: 'center', marginTop: 2, color: 'var(--mut)' }}>{p.uhid}</div></div>
              </div>
            </div>
          </div>
          {/* card back */}
          <div className="pc" style={{ width: 480, height: 302, borderRadius: 14, background: '#fff', boxShadow: 'var(--sh2)', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Please carry this card on every visit</div>
            <div className="mut" style={{ fontSize: 13.5 }}>Quote your UHID at the front desk, appointment calls and billing. Your UHID stays the same for life.</div>
            <hr className="d" style={{ margin: '6px 0' }} />
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div><span className="mut">Address</span> &nbsp; {hospital?.address}</div>
              <div><span className="mut">Phone</span> &nbsp; {hospital?.phone}</div>
              <div><span className="mut">OPD hours</span> &nbsp; {hospital?.opd_hours}</div>
            </div>
            <div style={{ marginTop: 'auto', fontSize: 11.5, color: 'var(--mut)' }}>Your data is used only for your care and billing. Ask the front desk for a copy or correction.</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, marginTop: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* sticker */}
          <div className="sticker-wrap">
            <div className="sm b no-print" style={{ marginBottom: 8 }}>File sticker · 62 × 29 mm</div>
            <div className="pc" style={{ width: 420, height: 196, borderRadius: 6, background: '#fff', boxShadow: 'var(--sh2)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span className="b" style={{ fontSize: 19 }}>{p.full_name}</span><span className="mut" style={{ fontSize: 13 }}>{g[0]} · {p.age_years} Y</span></div>
              <div className="mono b" style={{ fontSize: 15 }}>{p.uhid}</div>
              <div style={{ marginTop: 'auto' }}><Barcode value={p.uhid} height={52} /></div>
              <div className="xs mut" style={{ marginTop: 3 }}>Registered {fmtDate(p.registered_at)} · {fmtMobile(p.mobile, true)}</div>
            </div>
          </div>
          {/* print panel */}
          <section className="card no-print" style={{ flex: 1, minWidth: 320 }}>
            <div className="ch">Print</div>
            <div className="cb g2">
              <div className="fld"><span className="lbl" id="pl">Print</span>
                <div className="seg" style={{ alignSelf: 'flex-start' }} role="radiogroup" aria-labelledby="pl">
                  {(['card', 'sticker', 'both'] as Layout[]).map((l) => (
                    <button key={l} type="button" role="radio" aria-checked={layout === l} className={layout === l ? 'on' : ''} onClick={() => setLayout(l)}>{l[0].toUpperCase() + l.slice(1)}</button>
                  ))}
                </div></div>
              <div className="fld"><label className="lbl" htmlFor="cp">Copies</label>
                <input className="inp" id="cp" type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></div>
              <div className="fld" style={{ gridColumn: '1/-1' }}><span className="hint">Choose the card printer or the 62 × 29 mm thermal label printer in the print dialog. Turn on “Background graphics” so the card header prints in colour.</span></div>
            </div>
            {msg && <div className="cb" style={{ paddingTop: 0 }}><div className="al red"><Icon name="warn" /><div>{msg}</div></div></div>}
            <div className="cf">
              <button className="btn p" type="button" onClick={printNow}><Icon name="print" />Print now</button>
              <button className="btn" type="button" onClick={downloadPdf} disabled={busy}><Icon name="download" />{busy ? 'Preparing…' : 'Download PDF'}</button>
              <div className="sp" /><Link className="btn g" to={`/patients/${p.id}`}>Back to profile</Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
