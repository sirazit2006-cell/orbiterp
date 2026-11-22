import pytest
from django.utils import timezone

from apps.core.models import AuditLog
from apps.patients.models import Patient

NEW_PATIENT = {
    "first_name": "Ramesh",
    "last_name": "Kumar",
    "gender": "M",
    "date_of_birth": "1980-05-14",
    "mobile": "9876543210",
    "address_line": "12 MG Road",
    "city": "Ahmedabad",
    "state": "Gujarat",
    "pin_code": "380001",
    "consent_given": True,
}


@pytest.mark.django_db
def test_reception_registers_patient_with_uhid(client_for, settings):
    settings.HOSPITAL_CODE = "HOSP"
    res = client_for("reception").post("/api/patients/", NEW_PATIENT, format="json")
    assert res.status_code == 201, res.data
    year = timezone.localdate().year
    assert res.data["uhid"] == f"HOSP-{year}-000001"
    assert res.data["consent_given_at"] is not None
    second = client_for("admin").post("/api/patients/", {**NEW_PATIENT, "mobile": "9876500000"}, format="json")
    assert second.data["uhid"] == f"HOSP-{year}-000002"


@pytest.mark.django_db
def test_registration_needs_consent_and_dob_or_age(client_for):
    client = client_for("reception")
    no_consent = {**NEW_PATIENT, "consent_given": False}
    assert "consent_given" in client.post("/api/patients/", no_consent, format="json").data
    no_age = {k: v for k, v in NEW_PATIENT.items() if k != "date_of_birth"}
    assert "date_of_birth" in client.post("/api/patients/", no_age, format="json").data
    with_age = {**no_age, "age_years": 45}
    assert client.post("/api/patients/", with_age, format="json").status_code == 201


@pytest.mark.django_db
def test_invalid_mobile_and_pin_rejected(client_for):
    res = client_for("reception").post(
        "/api/patients/", {**NEW_PATIENT, "mobile": "12345", "pin_code": "38"}, format="json"
    )
    assert res.status_code == 400
    assert set(res.data) >= {"mobile", "pin_code"}


@pytest.mark.django_db
def test_doctor_can_read_but_not_register(client_for):
    doctor = client_for("doctor")
    assert doctor.get("/api/patients/").status_code == 200
    assert doctor.post("/api/patients/", NEW_PATIENT, format="json").status_code == 403


@pytest.mark.django_db
def test_patients_cannot_be_deleted(client_for):
    client = client_for("admin")
    pid = client.post("/api/patients/", NEW_PATIENT, format="json").data["id"]
    assert client.delete(f"/api/patients/{pid}/").status_code == 405


@pytest.mark.django_db
def test_search_by_mobile_name_and_uhid(client_for):
    client = client_for("reception")
    created = client.post("/api/patients/", NEW_PATIENT, format="json").data
    client.post("/api/patients/", {**NEW_PATIENT, "first_name": "Sita", "mobile": "9123456789"}, format="json")
    assert [p["uhid"] for p in client.get("/api/patients/?q=98765").data["results"]] == [created["uhid"]]
    assert [p["uhid"] for p in client.get("/api/patients/?q=ram kum").data["results"]] == [created["uhid"]]
    assert client.get(f"/api/patients/?q={created['uhid'].lower()}").data["count"] == 1


@pytest.mark.django_db
def test_duplicate_check_matches_mobile_or_name_and_dob(client_for):
    client = client_for("reception")
    client.post("/api/patients/", NEW_PATIENT, format="json")
    assert len(client.get("/api/patients/duplicates/?mobile=9876543210").data) == 1
    assert len(client.get("/api/patients/duplicates/?first_name=ramesh&date_of_birth=1980-05-14").data) == 1
    assert client.get("/api/patients/duplicates/?mobile=9000000000").data == []


@pytest.mark.django_db
def test_edits_and_views_are_audited(client_for):
    client = client_for("reception")
    pid = client.post("/api/patients/", NEW_PATIENT, format="json").data["id"]
    client.patch(f"/api/patients/{pid}/", {"city": "Surat"}, format="json")
    client_for("doctor").get(f"/api/patients/{pid}/")
    logs = AuditLog.objects.filter(table="patients_patient", record_id=str(pid))
    assert set(logs.values_list("action", flat=True)) == {"create", "update", "view"}
    update = logs.get(action="update")
    assert update.changes == {"city": {"from": "Ahmedabad", "to": "Surat"}}
    assert Patient.objects.get(pk=pid).updated_by.username == "reception"
