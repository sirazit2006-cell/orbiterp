# OrbitERP

Hospital ERP for a private hospital: patient registration, appointments, OPD and billing first, with IPD, pharmacy, lab, inventory, accounting and HR to follow.

Built to the **Hospital ERP: Patient Flow Spec (v1)** and the **OPD Patient Flow v1** design.

| Layer | Choice |
| --- | --- |
| Web app | React 19 + TypeScript 7, Vite 8, React Router 8 (`frontend/`) |
| API | Laravel 13 on PHP 8.3+, REST, JWT access + rotating refresh tokens (`backend/`) |
| Database | MySQL 8 (InnoDB, utf8mb4). SQLite works for a quick local try and in tests. |
| Delivery | Docker Compose, GitHub Actions (API tests on MySQL and SQLite, web type check, lint and build) |

## Status

| Module | State |
| --- | --- |
| 1. Patient registration | **Done**: search, new patient with duplicate check, profile, registration card and sticker |
| 2. Appointments and doctor schedules | Next |
| 3. OPD consultation | Later |
| 4. OPD billing | Later |

## Module 1: Patient registration

- **UHID** issued on save, like `HOSP-2026-000123` (prefix from `UHID_PREFIX`, running number per year, safe when two desks save at once).
- **Search** from one box by mobile, name or UHID, with an Any / Mobile / Name / UHID switch. Press `/` anywhere to jump to it, arrow keys and Enter to open.
- **Required fields**: full name, gender, date of birth *or* age, mobile, address, city, state, PIN. **Optional**: email, blood group, emergency contact, ID proof type and number, photo, ABHA number.
- **Duplicate check** on mobile + name + date of birth while typing and again on save. Reception picks "Same patient, open profile" or "New patient, save anyway" (the override is noted in the audit log). One mobile can belong to several family members.
- **Consent** (DPDP Act 2023) must be ticked before a patient can be saved; the time and the user are stored.
- **Edits** to name, date of birth or gender need a reason. Every create, edit, view and print is written to an append-only audit log with old and new values; the profile shows it on the Audit trail tab.
- **Registration card and file sticker** with a Code 128 barcode of the UHID: print from the browser, or download a server-made PDF.
- **Roles** are checked on the server for every call: reception and admin register and edit; nurse, doctor and billing can find and view patients.
- **Sign-in**: own username and password, 15-minute access tokens, refresh tokens that die after 30 idle minutes, and the screen signs out after 15 minutes without use.

Visit history and bills on the profile are placeholders until Modules 2 to 4 land.

## Run it locally

Needs PHP 8.3+ (with pdo_mysql or pdo_sqlite, gd, intl, mbstring, zip), Composer and Node 22+.

```bash
# API
cd backend
composer install
cp .env.example .env          # set DB_* for MySQL, or DB_CONNECTION=sqlite for a quick try
php artisan key:generate
php artisan migrate --seed --seeder=DemoSeeder   # demo staff + sample patients
php artisan serve             # http://127.0.0.1:8000

# Web app (second terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173, proxies /api to :8000
```

Demo logins (DemoSeeder only, password `password`): `meena` and `farah` (reception), `nurse`, `dr.kapoor` (doctor), `cashier` (billing), plus `admin` / `ChangeMe@123`.

For a real install run only `php artisan migrate --seed` (roles and the admin account), set `ADMIN_INITIAL_PASSWORD`, and change it after first sign-in.

Or with Docker: see the comments at the top of `docker-compose.yml`.

## Tests

```bash
cd backend && php artisan test        # 23 tests: auth, UHID, validation, duplicates, search, roles, audit, photo, PDF
cd frontend && npm run lint && npm run build
```

## Hospital details on printouts

Set `HOSPITAL_NAME`, `HOSPITAL_ADDRESS`, `HOSPITAL_PHONE` and `HOSPITAL_OPD_HOURS` in `backend/.env`. A logo upload comes with the Hospital settings screen.

## API (Module 1)

All under `/api`, JSON, `Authorization: Bearer <access token>`.

| Method and path | Who | What |
| --- | --- | --- |
| `POST auth/login`, `POST auth/refresh`, `POST auth/logout`, `GET auth/me` | anyone | Sign-in and token rotation |
| `GET patients?q=&by=any\|mobile\|name\|uhid` | all roles | Search (3+ characters) |
| `GET patients/recent`, `GET patients/stats` | all roles | Front desk panels |
| `GET patients/{id}` | all roles | Profile and family on the same mobile (logged as a view) |
| `POST patients/duplicates` | reception, admin | Live duplicate check |
| `POST patients` | reception, admin | Register; `409` with matches on a likely duplicate unless `confirm_new_patient` |
| `PUT patients/{id}` | reception, admin | Edit; `change_reason` needed for name, DOB or gender |
| `POST patients/{id}/photo`, `GET patients/{id}/photo` | reception, admin / all | Photo |
| `GET patients/{id}/audit` | reception, admin | Audit trail |
| `GET patients/{id}/card.pdf?layout=card\|sticker\|both`, `POST patients/{id}/printed` | reception, admin | Card and sticker |
