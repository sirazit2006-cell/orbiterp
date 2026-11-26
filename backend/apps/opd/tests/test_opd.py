from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.appointments.models import Appointment
from apps.core.models import AuditLog
from apps.masters.models import Department, Doctor, Medicine, Service
from apps.opd.models import Consultation, InvestigationOrder
from apps.patients.models import Patient


def api_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def setup(make_user):
    dept = Department.objects.create(name="General Medicine", code="GM")

    def doctor(username, reg):
        user = make_user(username, ["doctor"])
        return Doctor.objects.create(
            user=user, department=dept, registration_no=reg,
            first_visit_fee=Decimal("500"), follow_up_fee=Decimal("300"),
        )

    doc = doctor("dr.a", "R1")
    other = doctor("dr.b", "R2")
    patient = Patient.objects.create(
        first_name="Ramesh", gender="M", age_years=45, mobile="9876543210", address_line="x",
        city="Ahmedabad", state="Gujarat", pin_code="380001", consent_given_at=timezone.now(),
    )
    appt = Appointment.objects.create(
        patient=patient, doctor=doc, date=timezone.localdate(), status=Appointment.Status.WITH_DOCTOR, token_no=1
    )
    cbc = Service.objects.create(code="CBC", name="CBC", category="lab", price=Decimal("300"))
    xray = Service.objects.create(code="XR", name="X-ray chest", category="radiology", price=Decimal("400"))
    para = Medicine.objects.create(name="Paracetamol", strength="500 mg")
    return {"doc": doc, "other": other, "patient": patient, "appt": appt, "cbc": cbc, "xray": xray, "para": para}


CONSULT = {
    "complaints": "Fever for 3 days",
    "examination": "Throat congested",
    "advice": "Plenty of fluids",
}


@pytest.mark.django_db
def test_nurse_records_vitals_and_bmi_is_calculated(client_for, setup):
    nurse = client_for("nurse")
    url = f"/api/appointments/{setup['appt'].id}/vitals/"
    res = nurse.put(url, {"height_cm": "170", "weight_kg": "72.3", "bp_systolic": 130, "bp_diastolic": 85, "pulse": 88})
    assert res.status_code == 201, res.data
    assert res.data["bmi"] == "25.0"
    again = nurse.put(url, {"temperature_f": "101.2"})
    assert again.status_code == 200 and again.data["pulse"] == 88 and again.data["temperature_f"] == "101.2"
    bad = nurse.put(url, {"bp_systolic": 80, "bp_diastolic": 90})
    assert "bp_diastolic" in bad.data
    assert client_for("reception").put(url, {"pulse": 90}).status_code == 403


@pytest.mark.django_db
def test_doctor_writes_full_consultation(setup):
    s = setup
    doc = api_for(s["doc"].user)
    payload = {
        **CONSULT,
        "follow_up_date": str(timezone.localdate() + timedelta(days=7)),
        "diagnoses": [{"text": "Acute pharyngitis", "icd10_code": "J02.9"}, {"text": " "}],
        "prescriptions": [
            {"medicine": s["para"].id, "dose": "1 tab", "frequency": "1-1-1", "duration": "3 days", "instructions": "after food"},
            {"medicine_name": "Betadine gargle", "frequency": "3 times a day", "duration": "5 days", "route": "other"},
        ],
        "investigations": [{"service": s["cbc"].id}],
    }
    res = doc.put(f"/api/appointments/{s['appt'].id}/consultation/", payload)
    assert res.status_code == 201, res.data
    assert [d["text"] for d in res.data["diagnoses"]] == ["Acute pharyngitis"]
    assert [p["medicine_name"] for p in res.data["prescriptions"]] == ["Paracetamol 500 mg", "Betadine gargle"]
    assert res.data["investigations"][0]["service_name"] == "CBC"
    assert res.data["referral_doctor_name"] is None

    # Saving again replaces the lists.
    res = doc.put(f"/api/appointments/{s['appt'].id}/consultation/", {**payload, "investigations": [{"service": s["xray"].id}]})
    assert res.status_code == 200
    assert [i["service_name"] for i in res.data["investigations"]] == ["X-ray chest"]


@pytest.mark.django_db
def test_billed_investigations_are_kept(setup):
    s = setup
    doc = api_for(s["doc"].user)
    url = f"/api/appointments/{s['appt'].id}/consultation/"
    doc.put(url, {**CONSULT, "investigations": [{"service": s["cbc"].id}]})
    InvestigationOrder.objects.update(status=InvestigationOrder.Status.BILLED)
    res = doc.put(url, {**CONSULT, "investigations": [{"service": s["xray"].id}]})
    assert sorted(i["service_name"] for i in res.data["investigations"]) == ["CBC", "X-ray chest"]


@pytest.mark.django_db
def test_only_the_patients_doctor_writes_and_reads(client_for, setup):
    s = setup
    url = f"/api/appointments/{s['appt'].id}/consultation/"
    assert api_for(s["other"].user).put(url, CONSULT).status_code == 403
    assert client_for("nurse").put(url, CONSULT).status_code == 403
    api_for(s["doc"].user).put(url, CONSULT)
    assert client_for("reception").get(url).status_code == 403
    assert api_for(s["other"].user).get(url).status_code == 403
    assert client_for("admin").get(url).status_code == 200
    assert AuditLog.objects.filter(table="opd_consultation", action="view").exists()


@pytest.mark.django_db
def test_referral_lets_the_other_doctor_read_history(setup):
    s = setup
    doc = api_for(s["doc"].user)
    doc.put(f"/api/appointments/{s['appt'].id}/consultation/", {**CONSULT, "referral_doctor": s["other"].id, "referral_note": "ENT opinion"})
    history = api_for(s["other"].user).get(f"/api/patients/{s['patient'].id}/clinical-history/")
    assert history.status_code == 200
    assert history.data[0]["consultation"]["referral_doctor_name"] == str(s["other"])
    self_ref = doc.put(f"/api/appointments/{s['appt'].id}/consultation/", {**CONSULT, "referral_doctor": s["doc"].id})
    assert "referral_doctor" in self_ref.data


@pytest.mark.django_db
def test_consultation_locks_after_24_hours_and_amendments_are_added(setup):
    s = setup
    doc = api_for(s["doc"].user)
    url = f"/api/appointments/{s['appt'].id}/consultation/"
    doc.put(url, CONSULT)
    Appointment.objects.filter(pk=s["appt"].pk).update(
        status=Appointment.Status.COMPLETED, completed_at=timezone.now() - timedelta(hours=25)
    )
    locked = doc.put(url, {**CONSULT, "advice": "changed"})
    assert locked.status_code == 400 and "locked" in str(locked.data)
    amended = doc.post(url + "amend/", {"text": "CBC normal, continue treatment"})
    assert amended.status_code == 201
    data = doc.get(url).data
    assert data["is_locked"] and data["advice"] == "Plenty of fluids"
    assert data["amendments"][0]["text"] == "CBC normal, continue treatment"


@pytest.mark.django_db
def test_consultation_needs_patient_called_in(setup):
    s = setup
    Appointment.objects.filter(pk=s["appt"].pk).update(status=Appointment.Status.CHECKED_IN)
    res = api_for(s["doc"].user).put(f"/api/appointments/{s['appt'].id}/consultation/", CONSULT)
    assert res.status_code == 400 and "Call the patient in" in str(res.data)


@pytest.mark.django_db
def test_follow_up_must_be_after_visit_and_shows_until_booked(client_for, setup):
    s = setup
    doc = api_for(s["doc"].user)
    url = f"/api/appointments/{s['appt'].id}/consultation/"
    today = timezone.localdate()
    assert "follow_up_date" in doc.put(url, {**CONSULT, "follow_up_date": str(today)}).data
    due_date = today + timedelta(days=7)
    doc.put(url, {**CONSULT, "follow_up_date": str(due_date)})
    reception = client_for("reception")
    due = reception.get(f"/api/opd/follow-ups/?date={due_date}").data
    assert [d["patient_uhid"] for d in due] == [s["patient"].uhid]
    Appointment.objects.create(patient=s["patient"], doctor=s["doc"], date=due_date)
    assert reception.get(f"/api/opd/follow-ups/?date={due_date}").data == []


@pytest.mark.django_db
def test_history_lists_past_visits_newest_first(setup):
    s = setup
    old = Appointment.objects.create(
        patient=s["patient"], doctor=s["doc"], date=timezone.localdate() - timedelta(days=30),
        status=Appointment.Status.COMPLETED, completed_at=timezone.now() - timedelta(days=30),
    )
    Consultation.objects.create(appointment=old, complaints="Old cough")
    api_for(s["doc"].user).put(f"/api/appointments/{s['appt'].id}/consultation/", CONSULT)
    rows = api_for(s["doc"].user).get(f"/api/patients/{s['patient'].id}/clinical-history/").data
    assert [r["consultation"]["complaints"] for r in rows] == ["Fever for 3 days", "Old cough"]


@pytest.mark.django_db
def test_prescription_needs_a_medicine(setup):
    s = setup
    res = api_for(s["doc"].user).put(
        f"/api/appointments/{s['appt'].id}/consultation/",
        {**CONSULT, "prescriptions": [{"frequency": "1-0-1", "duration": "5 days"}]},
    )
    assert res.status_code == 400 and "prescriptions" in res.data
