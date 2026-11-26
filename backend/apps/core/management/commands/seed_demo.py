"""Load demo departments, staff and doctors so a fresh install can be tried at once.

Every demo account uses the password given with --password (default: ChangeMe@2026).
Do not run this on the production database.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from datetime import time

from apps.appointments.models import DoctorSchedule
from apps.core.models import Role, User
from apps.masters.models import Department, Doctor

DEPARTMENTS = [
    ("General Medicine", "GM"),
    ("Paediatrics", "PED"),
    ("Orthopaedics", "ORTH"),
    ("Gynaecology", "GYN"),
    ("Cardiology", "CARD"),
    ("ENT", "ENT"),
    ("Dermatology", "DERM"),
]

STAFF = [
    ("admin", "Hospital", "Admin", [Role.ADMIN]),
    ("reception1", "Riya", "Shah", [Role.RECEPTION]),
    ("nurse1", "Anita", "Patel", [Role.NURSE]),
    ("cashier1", "Kunal", "Mehta", [Role.CASHIER]),
]

DOCTORS = [
    ("dr.desai", "Amit", "Desai", "GM", "Physician", "GMC-10001", 500, 300),
    ("dr.joshi", "Neha", "Joshi", "PED", "Paediatrician", "GMC-10002", 600, 300),
    ("dr.rao", "Vikram", "Rao", "ORTH", "Orthopaedic surgeon", "GMC-10003", 700, 400),
]


class Command(BaseCommand):
    help = "Create demo departments, staff accounts, doctors and their OPD schedules."

    def add_arguments(self, parser):
        parser.add_argument("--password", default="ChangeMe@2026")

    @transaction.atomic
    def handle(self, *args, password, **options):
        for name, code in DEPARTMENTS:
            Department.objects.get_or_create(code=code, defaults={"name": name})

        for username, first, last, roles in STAFF:
            self._user(username, first, last, roles, password, superuser=username == "admin")

        for username, first, last, dept, spec, reg, fee, follow_fee in DOCTORS:
            user = self._user(username, first, last, [Role.DOCTOR], password)
            Doctor.objects.get_or_create(
                user=user,
                defaults={
                    "department": Department.objects.get(code=dept),
                    "specialization": spec,
                    "registration_no": reg,
                    "first_visit_fee": Decimal(fee),
                    "follow_up_fee": Decimal(follow_fee),
                },
            )
            doctor = user.doctor_profile
            if not doctor.schedules.exists():
                # Monday to Saturday, morning OPD 10:00-13:00 in 15-minute slots, evening OPD 17:00-19:00.
                for weekday in range(6):
                    DoctorSchedule.objects.create(doctor=doctor, weekday=weekday, start_time=time(10), end_time=time(13))
                    DoctorSchedule.objects.create(doctor=doctor, weekday=weekday, start_time=time(17), end_time=time(19))
        self.stdout.write(self.style.SUCCESS(f"Demo data ready. Log in as admin / {password}"))

    def _user(self, username, first, last, roles, password, superuser=False):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"first_name": first, "last_name": last, "roles": [str(r) for r in roles]},
        )
        if created:
            user.set_password(password)
            user.is_staff = superuser
            user.is_superuser = superuser
            user.save()
        return user
