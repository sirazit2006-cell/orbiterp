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
