export type Role = "admin" | "reception" | "nurse" | "doctor" | "cashier";

export interface Me {
  id: number;
  username: string;
  full_name: string;
  roles: Role[];
  is_superuser: boolean;
}

export interface PatientSummary {
  id: number;
  uhid: string;
  full_name: string;
  gender: "M" | "F" | "O";
  age: number | null;
  mobile: string;
  city: string;
  created_at: string;
}

export interface Patient extends PatientSummary {
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  age_years: number | null;
  email: string;
  address_line: string;
  state: string;
  pin_code: string;
  blood_group: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  id_proof_type: string;
  id_proof_number: string;
  abha_number: string;
  consent_given_at: string;
  is_active: boolean;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
}

export interface Doctor {
  id: number;
  user: number;
  name: string;
  department: number;
  department_name: string;
  specialization: string;
  registration_no: string;
  first_visit_fee: string;
  follow_up_fee: string;
  is_active: boolean;
}

export type AppointmentStatus = "booked" | "checked_in" | "with_doctor" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  id: number;
  patient: number;
  patient_name: string;
  patient_uhid: string;
  patient_mobile: string;
  patient_age: number | null;
  patient_gender: "M" | "F" | "O";
  doctor: number;
  doctor_name: string;
  department_name: string;
  date: string;
  slot_time: string | null;
  source: "phone" | "walk_in";
  visit_type: "new" | "follow_up";
  status: AppointmentStatus;
  status_label: string;
  token_no: number | null;
  checked_in_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  reason: string;
  cancel_reason: string;
  needs_reschedule: boolean;
  created_at: string;
}

export interface SlotSession {
  session: number;
  start: string;
  end: string;
  full: boolean;
  slots: { time: string; available: boolean }[];
}

export interface DoctorSlots {
  doctor: number;
  date: string;
  on_leave: boolean;
  sessions: SlotSession[];
}

export interface Queue {
  doctor: number;
  date: string;
  current: Appointment[];
  waiting: Appointment[];
  done: Appointment[];
}

export interface Schedule {
  id: number;
  doctor: number;
  doctor_name: string;
  weekday: number;
  weekday_name: string;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  max_patients: number | null;
  is_active: boolean;
}

export interface Leave {
  id: number;
  doctor: number;
  doctor_name: string;
  from_date: string;
  to_date: string;
  reason: string;
  flagged_appointments?: number;
}
