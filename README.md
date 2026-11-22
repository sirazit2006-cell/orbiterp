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
| Appointments and doctor schedules | Next |
| OPD consultation | Planned |
| OPD billing | Planned |

## Project layout

```
backend/            Django project
  config/           settings, URLs
  apps/core/        users, roles, audit log, number sequences
  apps/masters/     departments, doctors
  apps/patients/    patient registration
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
| `/api/users/`, `/api/audit-logs/` | Admin only |

Patients and users are never deleted through the API; they are marked inactive instead.
