import type { Gender, Patient } from '../api/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-11-22" or ISO datetime -> "22 Nov 2026" */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value)
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function fmtTime(value: string): string {
  const d = new Date(value)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDateTime(value: string): string {
  return `${fmtDate(value)}, ${fmtTime(value)}`
}

export function isToday(value: string): boolean {
  return new Date(value).toDateString() === new Date().toDateString()
}

/** "Sun, 22 Nov 2026" */
export function fmtToday(): string {
  const d = new Date()
  return `${DAYS[d.getDay()]}, ${fmtDate(d.toISOString())}`
}

/** "9876543210" -> "98765 43210" */
export function fmtMobile(m: string | null | undefined, withCode = false): string {
  if (!m) return ''
  const s = `${m.slice(0, 5)} ${m.slice(5)}`
  return withCode ? `+91 ${s}` : s
}

export function fmtAbha(a: string | null): string {
  if (!a) return ''
  return `${a.slice(0, 2)}-${a.slice(2, 6)}-${a.slice(6, 10)}-${a.slice(10)}`
}

export const genderLabel: Record<Gender, string> = { male: 'Male', female: 'Female', other: 'Other' }

export function initials(name: string): string {
  const parts = name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function dobLabel(p: Pick<Patient, 'dob' | 'dob_is_estimated'>): string {
  return p.dob_is_estimated ? `approx. ${p.dob.slice(0, 4)}` : fmtDate(p.dob)
}

/** "41 yrs · Male" */
export function ageGender(p: Pick<Patient, 'age_years' | 'gender'>): string {
  return `${p.age_years} ${p.age_years === 1 ? 'yr' : 'yrs'} · ${genderLabel[p.gender]}`
}

export function fullAddress(p: Patient): string {
  return `${p.address_line}, ${p.city}, ${p.state} ${p.pin_code}`
}
