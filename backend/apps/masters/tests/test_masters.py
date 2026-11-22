import pytest

from apps.masters.models import Department


@pytest.mark.django_db
def test_staff_can_read_departments_but_only_admin_creates(client_for):
    Department.objects.create(name="General Medicine", code="GM")
    nurse = client_for("nurse")
    assert nurse.get("/api/departments/").status_code == 200
    assert nurse.post("/api/departments/", {"name": "ENT", "code": "ENT"}).status_code == 403
    assert client_for("admin").post("/api/departments/", {"name": "ENT", "code": "ENT"}).status_code == 201


@pytest.mark.django_db
def test_doctor_profile_requires_doctor_role(client_for, make_user):
    dept = Department.objects.create(name="General Medicine", code="GM")
    clerk = make_user("clerk", ["reception"])
    doc = make_user("dr.a", ["doctor"])
    admin = client_for("admin")
    base = {"department": dept.id, "registration_no": "R1", "first_visit_fee": "500", "follow_up_fee": "300"}
    assert admin.post("/api/doctors/", {**base, "user": clerk.id}).status_code == 400
    res = admin.post("/api/doctors/", {**base, "user": doc.id})
    assert res.status_code == 201, res.data
    assert res.data["department_name"] == "General Medicine"


@pytest.mark.django_db
def test_seed_demo_runs_twice_without_error():
    from django.core.management import call_command

    call_command("seed_demo", verbosity=0)
    call_command("seed_demo", verbosity=0)
    assert Department.objects.count() == 7
