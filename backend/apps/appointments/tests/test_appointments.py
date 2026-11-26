from datetime import date, time, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.appointments import services
from apps.appointments.models import Appointment, DoctorLeave, DoctorSchedule
from apps.core.models import AuditLog
from apps.masters.models import Department, Doctor
from apps.patients.models import Patient


def next_weekday(weekday, after=None):
    """The next date (after today) that falls on ``weekday``."""
    day = (after or timezone.localdate()) + timedelta(days=1)
    while day.weekday() != weekday:
        day += timedelta(days=1)
    return day


@pytest.fixture
def doctor(make_user):
    user = make_user("dr.desai", ["doctor"])
    dept = Department.objects.create(name="General Medicine", code="GM")
    doc = Doctor.objects.create(
        user=user, department=dept, registration_no="R1",
        first_visit_fee=Decimal("500"), follow_up_fee=Decimal("300"), follow_up_days=7,
    )
    for weekday in range(7):
        DoctorSchedule.objects.create(
            doctor=doc, weekday=weekday, start_time=time(10), end_time=time(11), slot_minutes=15
        )
    return doc


@pytest.fixture
def patient(db):
    return Patient.objects.create(
        first_name="Ramesh", gender="M", age_years=45, mobile="9876543210", address_line="x",
        city="Ahmedabad", state="Gujarat", pin_code="380001", consent_given_at=timezone.now(),
    )


def other_patient(mobile="9123456789"):
    return Patient.objects.create(
        first_name="Sita", gender="F", age_years=30, mobile=mobile, address_line="x",
        city="Ahmedabad", state="Gujarat", pin_code="380001", consent_given_at=timezone.now(),
    )


@pytest.mark.django_db
def test_slots_list_four_quarter_hours_and_mark_booked(client_for, doctor, patient):
    day = next_weekday(0)
    reception = client_for("reception")
    res = reception.get(f"/api/doctors/{doctor.id}/slots/?date={day}")
    slots = res.data["sessions"][0]["slots"]
    assert [s["time"] for s in slots] == ["10:00", "10:15", "10:30", "10:45"]
    assert all(s["available"] for s in slots)
    reception.post("/api/appointments/", {"patient": patient.id, "doctor": doctor.id, "date": day, "slot_time": "10:15"})
    slots = reception.get(f"/api/doctors/{doctor.id}/slots/?date={day}").data["sessions"][0]["slots"]
    assert [s["available"] for s in slots] == [True, False, True, True]


@pytest.mark.django_db
def test_booking_rules(client_for, doctor, patient):
    day = next_weekday(1)
    reception = client_for("reception")
    ok = reception.post("/api/appointments/", {"patient": patient.id, "doctor": doctor.id, "date": day, "slot_time": "10:00"})
    assert ok.status_code == 201, ok.data
    assert ok.data["status"] == "booked" and ok.data["visit_type"] == "new" and ok.data["token_no"] is None

    taken = reception.post(
        "/api/appointments/", {"patient": other_patient().id, "doctor": doctor.id, "date": day, "slot_time": "10:00"}
    )
    assert taken.status_code == 400 and "already booked" in str(taken.data)

    twice = reception.post("/api/appointments/", {"patient": patient.id, "doctor": doctor.id, "date": day, "slot_time": "10:30"})
    assert "open appointment" in str(twice.data)

    off_grid = reception.post(
        "/api/appointments/", {"patient": other_patient("9000000001").id, "doctor": doctor.id, "date": day, "slot_time": "10:10"}
    )
    assert "no OPD slot" in str(off_grid.data)

    past = reception.post(
        "/api/appointments/",
        {"patient": other_patient("9000000002").id, "doctor": doctor.id, "date": date(2020, 1, 6), "slot_time": "10:00"},
    )
    assert "past" in str(past.data)


@pytest.mark.django_db
def test_session_cap_blocks_extra_bookings(client_for, doctor):
    day = next_weekday(2)
    DoctorSchedule.objects.filter(doctor=doctor, weekday=2).update(max_patients=1)
    reception = client_for("reception")
    first = reception.post("/api/appointments/", {"patient": other_patient("9000000003").id, "doctor": doctor.id, "date": day, "slot_time": "10:00"})
    assert first.status_code == 201
    second = reception.post("/api/appointments/", {"patient": other_patient("9000000004").id, "doctor": doctor.id, "date": day, "slot_time": "10:30"})
    assert "full" in str(second.data)


@pytest.mark.django_db
def test_doctor_on_leave_has_no_slots_and_leave_flags_bookings(client_for, doctor, patient):
    day = next_weekday(3)
    reception = client_for("reception")
    appt = reception.post("/api/appointments/", {"patient": patient.id, "doctor": doctor.id, "date": day, "slot_time": "10:00"}).data
    admin = client_for("admin")
    leave = admin.post("/api/doctor-leaves/", {"doctor": doctor.id, "from_date": day, "to_date": day, "reason": "Conference"})
    assert leave.status_code == 201 and leave.data["flagged_appointments"] == 1
    assert Appointment.objects.get(pk=appt["id"]).needs_reschedule
    slots = reception.get(f"/api/doctors/{doctor.id}/slots/?date={day}").data
    assert slots["on_leave"] and slots["sessions"] == []

    new_day = next_weekday(4)
    moved = reception.post(f"/api/appointments/{appt['id']}/reschedule/", {"date": new_day, "slot_time": "10:45"})
    assert moved.status_code == 200, moved.data
    assert moved.data["needs_reschedule"] is False and moved.data["date"] == str(new_day)


@pytest.mark.django_db
def test_walk_in_gets_token_immediately_and_tokens_increase(client_for, doctor, patient):
    today = timezone.localdate()
    reception = client_for("reception")
    a = reception.post("/api/appointments/", {"patient": patient.id, "doctor": doctor.id, "date": today, "source": "walk_in"})
    b = reception.post("/api/appointments/", {"patient": other_patient().id, "doctor": doctor.id, "date": today, "source": "walk_in"})
    assert a.status_code == 201, a.data
    assert (a.data["status"], a.data["token_no"]) == ("checked_in", 1)
    assert b.data["token_no"] == 2
    tomorrow = reception.post(
        "/api/appointments/",
        {"patient": other_patient("9000000005").id, "doctor": doctor.id, "date": today + timedelta(days=1), "source": "walk_in"},
    )
    assert "only be registered for today" in str(tomorrow.data)


@pytest.mark.django_db
def test_full_visit_flow_and_queue(client_for, doctor, patient):
    today = timezone.localdate()
    appt = Appointment.objects.create(patient=patient, doctor=doctor, date=today, slot_time=time(10))
    reception = client_for("reception")
    checked = reception.post(f"/api/appointments/{appt.id}/check_in/")
    assert checked.status_code == 200 and checked.data["token_no"] == 1

    # Reception cannot start a consultation; the patient's doctor can.
    assert reception.post(f"/api/appointments/{appt.id}/start/").status_code == 403
    from rest_framework.test import APIClient

    doc_client = APIClient()
    doc_client.force_authenticate(doctor.user)
    queue = doc_client.get("/api/appointments/queue/").data
    assert [r["id"] for r in queue["waiting"]] == [appt.id]
    assert doc_client.post(f"/api/appointments/{appt.id}/start/").data["status"] == "with_doctor"
    assert doc_client.get("/api/appointments/queue/").data["current"][0]["id"] == appt.id
    assert doc_client.post(f"/api/appointments/{appt.id}/complete/").data["status"] == "completed"

    again = reception.post(f"/api/appointments/{appt.id}/cancel/", {"cancel_reason": "x"})
    assert again.status_code == 400

    statuses = AuditLog.objects.filter(table="appointments_appointment", record_id=str(appt.id)).order_by("id").values_list("changes", flat=True)
    assert [c["status"]["to"] for c in statuses] == ["checked_in", "with_doctor", "completed"]


@pytest.mark.django_db
def test_other_doctor_cannot_see_or_start(client_for, doctor, patient, make_user):
    other_user = make_user("dr.other", ["doctor"])
    Doctor.objects.create(
        user=other_user, department=doctor.department, registration_no="R2",
        first_visit_fee=Decimal("500"), follow_up_fee=Decimal("300"),
    )
    appt = Appointment.objects.create(
        patient=patient, doctor=doctor, date=timezone.localdate(), status=Appointment.Status.CHECKED_IN, token_no=1
    )
    from rest_framework.test import APIClient

    other = APIClient()
    other.force_authenticate(other_user)
    assert other.get("/api/appointments/").data["count"] == 0
    assert other.post(f"/api/appointments/{appt.id}/start/").status_code == 404


@pytest.mark.django_db
def test_follow_up_within_window(client_for, doctor, patient):
    today = timezone.localdate()
    Appointment.objects.create(
        patient=patient, doctor=doctor, date=today - timedelta(days=3), status=Appointment.Status.COMPLETED
    )
    assert services.visit_type_for(patient, doctor, today) == "follow_up"
    assert services.visit_type_for(patient, doctor, today + timedelta(days=10)) == "new"


@pytest.mark.django_db
def test_cancel_needs_reason_and_no_show_only_when_booked(client_for, doctor, patient):
    day = next_weekday(5)
    reception = client_for("reception")
    appt = reception.post("/api/appointments/", {"patient": patient.id, "doctor": doctor.id, "date": day, "slot_time": "10:00"}).data
    assert reception.post(f"/api/appointments/{appt['id']}/cancel/", {"cancel_reason": " "}).status_code == 400
    assert reception.post(f"/api/appointments/{appt['id']}/cancel/", {"cancel_reason": "Patient called"}).data["status"] == "cancelled"
    assert reception.post(f"/api/appointments/{appt['id']}/no_show/").status_code == 400
    # The freed slot can be booked again.
    again = reception.post("/api/appointments/", {"patient": patient.id, "doctor": doctor.id, "date": day, "slot_time": "10:00"})
    assert again.status_code == 201


@pytest.mark.django_db
def test_schedule_overlap_rejected_and_only_admin_edits(client_for, doctor):
    payload = {"doctor": doctor.id, "weekday": 0, "start_time": "10:30", "end_time": "12:00", "slot_minutes": 15}
    assert client_for("reception").post("/api/schedules/", payload).status_code == 403
    admin = client_for("admin")
    assert "overlaps" in str(admin.post("/api/schedules/", payload).data)
    ok = admin.post("/api/schedules/", {**payload, "start_time": "17:00", "end_time": "19:00"})
    assert ok.status_code == 201, ok.data
    backwards = admin.post("/api/schedules/", {**payload, "weekday": 1, "start_time": "15:00", "end_time": "14:00"})
    assert "end_time" in backwards.data


@pytest.mark.django_db
def test_check_in_only_on_the_day(client_for, doctor, patient):
    day = next_weekday(6)
    reception = client_for("reception")
    appt = reception.post("/api/appointments/", {"patient": patient.id, "doctor": doctor.id, "date": day, "slot_time": "10:00"}).data
    assert "on the day" in str(reception.post(f"/api/appointments/{appt['id']}/check_in/").data)


def test_leave_model_rejects_backwards_dates(doctor):
    from django.core.exceptions import ValidationError

    with pytest.raises(ValidationError):
        DoctorLeave(doctor=doctor, from_date=date(2026, 1, 5), to_date=date(2026, 1, 4)).clean()


@pytest.mark.django_db
def test_removing_leave_clears_flags_and_used_session_cannot_be_deleted(client_for, doctor, patient):
    day = next_weekday(0)
    reception = client_for("reception")
    appt = reception.post("/api/appointments/", {"patient": patient.id, "doctor": doctor.id, "date": day, "slot_time": "10:00"}).data
    admin = client_for("admin")
    leave = admin.post("/api/doctor-leaves/", {"doctor": doctor.id, "from_date": day, "to_date": day}).data
    assert Appointment.objects.get(pk=appt["id"]).needs_reschedule
    admin.delete(f"/api/doctor-leaves/{leave['id']}/")
    assert not Appointment.objects.get(pk=appt["id"]).needs_reschedule

    session = DoctorSchedule.objects.get(doctor=doctor, weekday=0)
    res = admin.delete(f"/api/schedules/{session.id}/")
    assert res.status_code == 400 and "Switch it off" in str(res.data)
    empty = DoctorSchedule.objects.get(doctor=doctor, weekday=6)
    assert admin.delete(f"/api/schedules/{empty.id}/").status_code == 204
