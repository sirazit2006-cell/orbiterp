# OrbitERP

Hospital ERP for a private hospital (about 200 OPD patients a day, 15+ doctors). Built with React, Django REST Framework and MySQL.

Version 1 covers the outpatient flow: patient registration, appointments, OPD consultation and OPD billing. IPD, lab, radiology, pharmacy, inventory, accounting and HR follow in later phases.

## What is built so far

| Area | Status |
| --- | --- |
| Login with JWT, auto sign-out after 15 idle minutes | Done |
| Roles: admin, reception, nurse, doctor, billing cashier | Done |
| Audit log of every create, update and patient-record view | Done |
| Departments and doctors (with fees and registration numbers) | Done (API + Django admin) |
| Patient registration with UHID, duplicate check, consent, search | Done |
| Doctor weekly schedules and leave | Done |
| Appointments: slot booking, walk-ins, check-in with tokens, reschedule, cancel, no-show | Done |
| OPD queue per doctor and waiting-room "now serving" display | Done |
| OPD consultation: vitals, notes, diagnosis (ICD-10), prescription, test orders, follow-up, referral, printed prescription | Done |
| Medicine list and service tariff masters | Done (API + Django admin) |
| OPD billing | Next |

## Project layout

```
backend/            Django project
  config/           settings, URLs
  apps/core/        users, roles, audit log, number sequences
  apps/masters/     departments, doctors, medicines, service tariff
  apps/patients/    patient registration
  apps/appointments/ doctor schedules, leave, appointments, token queue
  apps/opd/         vitals, consultations, prescriptions, test orders, amendments
frontend/           React + TypeScript + Ant Design (Vite)
docker-compose.yml  MySQL + API + web app for a server
```

## Run on a server with Docker

```bash
cp .env.example .env          # then set real passwords and a secret key
docker compose up -d --build
docker compose exec backend python manage.py createsuperuser
```

The app is then at http://localhost:8080 (change `HTTP_PORT` in `.env`). Set the superuser's roles to `["admin"]` in Django admin at `/admin/`.

## Develop locally

Backend (needs Python 3.12+ and a MySQL 8 database, or SQLite for a quick try):

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
export DJANGO_DEBUG=1 DB_ENGINE=sqlite      # or DB_NAME / DB_USER / DB_PASSWORD / DB_HOST for MySQL
python manage.py migrate
python manage.py seed_demo                  # demo departments, staff and doctors
python manage.py runserver
```

Frontend (needs Node 20+):

```bash
cd frontend
npm install
npm run dev                                 # http://localhost:5173, proxies /api to :8000
```

Demo logins created by `seed_demo` (password `ChangeMe@2026`): `admin`, `reception1`, `nurse1`, `cashier1`, `dr.desai`, `dr.joshi`, `dr.rao`. Never run `seed_demo` on the production database.

## Tests

```bash
cd backend && pytest
cd frontend && npm run build
```

## API overview

| Endpoint | Who can use it |
| --- | --- |
| `POST /api/auth/token/`, `POST /api/auth/token/refresh/`, `GET /api/auth/me/` | Everyone |
| `/api/patients/` (`?q=` searches mobile, name or UHID), `/api/patients/duplicates/` | Reception writes; nurse, doctor, cashier read |
| `/api/departments/`, `/api/doctors/` | Admin writes; all staff read |
| `/api/schedules/`, `/api/doctor-leaves/` | Admin writes; all staff read |
| `/api/doctors/{id}/slots/?date=` | All staff |
| `/api/appointments/` with actions `check_in`, `cancel`, `no_show`, `reschedule` | Reception writes; all staff read (a doctor sees only their own) |
| `/api/appointments/{id}/start/`, `/complete/` | The patient's doctor |
| `/api/appointments/queue/?doctor=` | All staff |
| `/api/appointments/{id}/vitals/` | Nurse or the patient's doctor writes; all staff read |
| `/api/appointments/{id}/consultation/` (and `/amend/`) | The patient's doctor writes; doctors who treated or were referred the patient, and admins, read |
| `/api/patients/{id}/clinical-history/` | Same as consultation reads |
| `/api/opd/follow-ups/?date=` | Reception, admin |
| `/api/medicines/`, `/api/services/` | Admin writes; all staff read |
| `/api/users/`, `/api/audit-logs/` | Admin only |

Patients and users are never deleted through the API; they are marked inactive instead.
