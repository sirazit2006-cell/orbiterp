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
  qualification: string;
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
  has_vitals: boolean;
  has_consultation: boolean;
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

export interface Vitals {
  id?: number;
  height_cm: string | null;
  weight_kg: string | null;
  bmi?: string | null;
  temperature_f: string | null;
  pulse: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  spo2: number | null;
  respiratory_rate: number | null;
  blood_sugar: number | null;
  allergies: string;
  chief_complaint: string;
  recorded_by?: string | null;
  updated_at?: string;
}

export interface Medicine {
  id: number;
  name: string;
  generic_name: string;
  form: string;
  strength: string;
  label: string;
}

export interface Service {
  id: number;
  code: string;
  name: string;
  category: "consultation" | "registration" | "procedure" | "lab" | "radiology" | "other";
  category_label: string;
  price: string;
  tax_code: string;
}

export interface PrescriptionLine {
  medicine: number | null;
  medicine_name: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string;
  route_label?: string;
  instructions: string;
}

export interface Consultation {
  id: number;
  complaints: string;
  history: string;
  examination: string;
  advice: string;
  follow_up_date: string | null;
  referral_doctor: number | null;
  referral_doctor_name: string | null;
  referral_note: string;
  diagnoses: { text: string; icd10_code: string }[];
  prescriptions: PrescriptionLine[];
  investigations: { id?: number; service: number; service_name?: string; category?: string; notes: string; status?: string }[];
  amendments: { id: number; text: string; author_name: string; created_at: string }[];
  is_locked: boolean;
  locked_at: string | null;
  updated_at: string;
}

export interface HistoryVisit {
  appointment: number;
  date: string;
  doctor_name: string;
  department_name: string;
  status: AppointmentStatus;
  vitals: Vitals | null;
  consultation: Consultation | null;
}

export interface FollowUpDue {
  patient: number;
  patient_name: string;
  patient_uhid: string;
  patient_mobile: string;
  doctor: number;
  doctor_name: string;
  follow_up_date: string;
  last_visit: string;
}

export interface Hospital {
  name: string;
  address: string;
  phone: string;
  gstin: string;
  cashier_discount_limit_percent: number;
  cashier_refund_limit: number;
}

export type BillStatus = "draft" | "partly_paid" | "paid" | "cancelled" | "refunded";
export type PayMode = "cash" | "card" | "upi";

export interface BillSummary {
  id: number;
  bill_no: string | null;
  date: string;
  patient: number;
  patient_name: string;
  patient_uhid: string;
  appointment: number | null;
  doctor_name: string | null;
  status: BillStatus;
  status_label: string;
  net_total: string;
  paid_total: string;
  refunded_total: string;
  balance: string;
  created_at: string;
}

export interface BillItem {
  id: number;
  service: number | null;
  category: Service["category"];
  description: string;
  qty: number;
  rate: string;
  discount: string;
  tax_code: string;
  tax_amount: string;
  amount: string;
  order: number | null;
}

export interface PaymentRow {
  id: number;
  receipt_no: string;
  mode: PayMode;
  mode_label: string;
  amount: string;
  reference: string;
  received_by_name: string;
  received_at: string;
}

export interface RefundRow {
  id: number;
  refund_no: string;
  mode: PayMode;
  mode_label: string;
  amount: string;
  reason: string;
  refunded_by_name: string;
  refunded_at: string;
}

export interface Bill extends BillSummary {
  patient_mobile: string;
  patient_age: number | null;
  patient_gender: "M" | "F" | "O";
  subtotal: string;
  discount_total: string;
  tax_total: string;
  discount_reason: string;
  discount_approved_by_name: string | null;
  cancel_reason: string;
  is_editable: boolean;
  items: BillItem[];
  payments: PaymentRow[];
  refunds: RefundRow[];
  pending_orders: { id: number; service: number; service_name: string; price: string }[];
  visit_bills: { id: number; bill_no: string | null; status: BillStatus; net_total: string }[];
}

export interface VisitPendingOrders {
  appointment: number;
  patient: number;
  patient_name: string;
  patient_uhid: string;
  doctor_name: string;
  token_no: number | null;
  orders: { id: number; service_name: string; price: number | string }[];
  total: number | string;
}

type ModeTotals = Record<PayMode, { received: number | string; refunded: number | string }>;

export interface Shift {
  id: number;
  cashier: number;
  cashier_name: string;
  opened_at: string;
  opening_cash: string;
  closed_at: string | null;
  expected_cash: string | null;
  counted_cash: string | null;
  difference: string | null;
  note: string;
  status: "open" | "closed";
  totals: { by_mode: ModeTotals; expected_cash: number | string };
}

export interface CollectionReport {
  from: string;
  to: string;
  modes: Record<PayMode, { label: string; received: number | string; refunded: number | string; net: number | string }>;
  total_received: number | string;
  total_refunded: number | string;
  net: number | string;
  cashiers: { name: string; received: number | string; refunded: number | string; receipts: number }[];
  billed_by_category: { category: string; total: number | string }[];
  bills: { count: number; unpaid: number };
  discounts: { bill: number; bill_no: string | null; patient: string; amount: string; reason: string; by: string }[];
  refunds: RefundRow[];
  cancelled: { bill: number; bill_no: string | null; patient: string; reason: string }[];
}
