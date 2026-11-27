export type RoleCode = 'reception' | 'nurse' | 'doctor' | 'billing' | 'admin'

export interface User {
  id: number
  username: string
  name: string
  desk: string | null
  roles: RoleCode[]
}

export type Gender = 'male' | 'female' | 'other'

export interface Patient {
  id: number
  uhid: string
  full_name: string
  gender: Gender
  dob: string
  dob_is_estimated: boolean
  age_years: number
  mobile: string
  address_line: string
  city: string
  state: string
  pin_code: string
  email: string | null
  blood_group: string | null
  emergency_contact_name: string | null
  emergency_contact_mobile: string | null
  id_proof_type: string | null
  id_proof_number_masked: string | null
  id_proof_number?: string | null
  abha_number: string | null
  has_photo: boolean
  consent_at: string | null
  registered_at: string
  registered_by?: { id: number; name: string }
  is_active: boolean
  last_visit: null | { date: string; doctor: string }
}

export interface DuplicateMatch {
  patient: Patient
  reasons: ('name' | 'dob' | 'mobile')[]
  strong: boolean
}

export interface AuditEntry {
  id: number
  action: string
  at: string
  user: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  note: string | null
}

export interface HospitalSettings {
  hospital: { name: string; address: string; phone: string; opd_hours: string; uhid_prefix: string }
  options: { blood_groups: string[]; id_proof_types: string[] }
}

export interface PatientInput {
  full_name: string
  gender: Gender | ''
  dob: string
  age_years: string
  mobile: string
  address_line: string
  city: string
  state: string
  pin_code: string
  email: string
  blood_group: string
  emergency_contact_name: string
  emergency_contact_mobile: string
  id_proof_type: string
  id_proof_number: string
  abha_number: string
}
