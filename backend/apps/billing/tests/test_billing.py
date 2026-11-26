from datetime import date, time, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.appointments.models import Appointment
from apps.billing.models import Bill, financial_year
from apps.core.models import AuditLog
from apps.masters.models import Department, Doctor, Service
from apps.opd.models import Consultation, InvestigationOrder
from apps.patients.models import Patient

D = Decimal


@pytest.fixture
def world(make_user):
    dept = Department.objects.create(name="General Medicine", code="GM")
    doc_user = make_user("dr.a", ["doctor"])
    doctor = Doctor.objects.create(
        user=doc_user, department=dept, registration_no="R1", first_visit_fee=D("500"), follow_up_fee=D("300")
    )
    patient = Patient.objects.create(
        first_name="Ramesh", gender="M", age_years=45, mobile="9876543210", address_line="x",
        city="Ahmedabad", state="Gujarat", pin_code="380001", consent_given_at=timezone.now(),
    )
    cbc = Service.objects.create(code="CBC", name="CBC", category="lab", price=D("300"))
    xray = Service.objects.create(code="XR", name="X-ray chest", category="radiology", price=D("400"))
    cream = Service.objects.create(code="CREAM", name="Moisturiser", category="other", price=D("100"), tax_code="gst18")
    cashier_user = make_user("cash", ["cashier"])
    cashier = APIClient()
    cashier.force_authenticate(cashier_user)
    cashier.post("/api/shifts/open/", {"opening_cash": "1000"})
    return {"doctor": doctor, "patient": patient, "cbc": cbc, "xray": xray, "cream": cream, "cashier": cashier, "cashier_user": cashier_user}


def checked_in(world, visit_type="new"):
    appt = Appointment.objects.create(
        patient=world["patient"], doctor=world["doctor"], date=timezone.localdate(), slot_time=time(10), visit_type=visit_type
    )
    appt.status = Appointment.Status.CHECKED_IN
    appt.token_no = 1
    appt.save()
    return appt


@pytest.mark.django_db
def test_check_in_opens_bill_with_consultation_fee(world):
    appt = checked_in(world)
    bill = Bill.objects.get(appointment=appt)
    assert bill.status == "draft" and bill.bill_no is None
    item = bill.items.get()
    assert (item.category, item.rate, item.amount) == ("consultation", D("500.00"), D("500.00"))
    assert bill.net_total == D("500.00")


@pytest.mark.django_db
def test_follow_up_uses_follow_up_fee(world):
    appt = checked_in(world, visit_type="follow_up")
    assert Bill.objects.get(appointment=appt).net_total == D("300.00")


@pytest.mark.django_db
def test_walk_in_booking_opens_bill(client_for, world):
    res = client_for("reception").post(
        "/api/appointments/", {"patient": world["patient"].id, "doctor": world["doctor"].id, "date": str(timezone.localdate()), "source": "walk_in"}
    )
    assert res.status_code == 201
    assert Bill.objects.filter(appointment=res.data["id"]).exists()


@pytest.mark.django_db
def test_ordered_tests_show_as_pending_and_can_be_added(world):
    appt = checked_in(world)
    consult = Consultation.objects.create(appointment=appt)
    order = InvestigationOrder.objects.create(consultation=consult, service=world["cbc"])
    c = world["cashier"]
    bill = c.get(f"/api/bills/?appointment={appt.id}").data["results"][0]
    detail = c.get(f"/api/bills/{bill['id']}/").data
    assert [o["service_name"] for o in detail["pending_orders"]] == ["CBC"]
    res = c.post(f"/api/bills/{bill['id']}/add_item/", {"order": order.id})
    assert res.status_code == 200, res.data
    assert res.data["net_total"] == "800.00" and res.data["pending_orders"] == []
    order.refresh_from_db()
    assert order.status == "billed"
    # Removing the line puts the order back to pending.
    line = [i for i in res.data["items"] if i["order"] == order.id][0]
    res = c.post(f"/api/bills/{bill['id']}/remove_item/{line['id']}/")
    assert res.data["net_total"] == "500.00" and len(res.data["pending_orders"]) == 1


@pytest.mark.django_db
def test_gst_on_taxable_items(world):
    c = world["cashier"]
    bill = c.post("/api/bills/", {"patient": world["patient"].id}).data
    res = c.post(f"/api/bills/{bill['id']}/add_item/", {"service": world["cream"].id, "qty": 2})
    assert (res.data["subtotal"], res.data["tax_total"], res.data["net_total"]) == ("200.00", "36.00", "236.00")


@pytest.mark.django_db
def test_split_payment_numbers_and_status(world):
    appt = checked_in(world)
    bill_id = Bill.objects.get(appointment=appt).id
    c = world["cashier"]
    first = c.post(f"/api/bills/{bill_id}/pay/", {"mode": "cash", "amount": "200"})
    assert first.status_code == 201, first.data
    fy = financial_year()
    assert first.data["bill_no"] == f"OPB/{fy}/000001"
    assert first.data["status"] == "partly_paid" and first.data["balance"] == "300.00"
    # Items are frozen once money is taken.
    assert c.post(f"/api/bills/{bill_id}/add_item/", {"service": world["cbc"].id}).status_code == 400
    no_ref = c.post(f"/api/bills/{bill_id}/pay/", {"mode": "upi", "amount": "300"})
    assert "reference" in no_ref.data
    over = c.post(f"/api/bills/{bill_id}/pay/", {"mode": "cash", "amount": "301"})
    assert "amount" in over.data
    done = c.post(f"/api/bills/{bill_id}/pay/", {"mode": "upi", "amount": "300", "reference": "UPI123"})
    assert done.data["status"] == "paid" and done.data["balance"] == "0.00"
    assert [p["receipt_no"] for p in done.data["payments"]] == [f"RCP/{fy}/000001", f"RCP/{fy}/000002"]


@pytest.mark.django_db
def test_payment_needs_open_shift(make_user, world):
    appt = checked_in(world)
    other = APIClient()
    other.force_authenticate(make_user("cash2", ["cashier"]))
    res = other.post(f"/api/bills/{Bill.objects.get(appointment=appt).id}/pay/", {"mode": "cash", "amount": "100"})
    assert "shift" in res.data


@pytest.mark.django_db
def test_discount_limit_and_admin_override(client_for, world):
    c = world["cashier"]
    bill = c.post("/api/bills/", {"patient": world["patient"].id}).data
    c.post(f"/api/bills/{bill['id']}/add_item/", {"service": world["xray"].id})
    assert c.post(f"/api/bills/{bill['id']}/discount/", {"percent": "5", "reason": ""}).status_code == 400
    ok = c.post(f"/api/bills/{bill['id']}/discount/", {"percent": "10", "reason": "Senior citizen"})
    assert ok.data["net_total"] == "360.00" and ok.data["discount_reason"] == "Senior citizen"
    too_much = c.post(f"/api/bills/{bill['id']}/discount/", {"percent": "25", "reason": "Staff family"})
    assert too_much.status_code == 403
    admin = client_for("admin")
    approved = admin.post(f"/api/bills/{bill['id']}/discount/", {"amount": "100", "reason": "Staff family"})
    assert approved.data["net_total"] == "300.00" and approved.data["discount_approved_by_name"] == "admin"
    removed = c.post(f"/api/bills/{bill['id']}/discount/", {"amount": "0", "reason": ""})
    assert removed.data["net_total"] == "400.00" and removed.data["discount_reason"] == ""


@pytest.mark.django_db
def test_refund_and_cancel_rules(client_for, world):
    appt = checked_in(world)
    bill_id = Bill.objects.get(appointment=appt).id
    c = world["cashier"]
    c.post(f"/api/bills/{bill_id}/pay/", {"mode": "cash", "amount": "500"})
    assert "Refund" in str(c.post(f"/api/bills/{bill_id}/cancel/", {"reason": "Doctor unavailable"}).data)
    assert c.post(f"/api/bills/{bill_id}/refund/", {"mode": "cash", "amount": "100", "reason": ""}).status_code == 400
    part = c.post(f"/api/bills/{bill_id}/refund/", {"mode": "cash", "amount": "100", "reason": "Overcharged"})
    assert part.status_code == 201 and part.data["status"] == "paid" and part.data["balance"] == "0.00"
    # Cashier limit is 500 per refund; 400 left to refund is within it.
    full = c.post(f"/api/bills/{bill_id}/refund/", {"mode": "cash", "amount": "400", "reason": "Doctor unavailable"})
    assert full.data["status"] == "refunded"
    # Cashier cannot cancel a bill that had payments; admin can, once refunded.
    assert c.post(f"/api/bills/{bill_id}/cancel/", {"reason": "Doctor unavailable"}).status_code == 403
    admin = client_for("admin")
    assert admin.post(f"/api/bills/{bill_id}/cancel/", {"reason": "Doctor unavailable"}).data["status"] == "cancelled"


@pytest.mark.django_db
def test_large_refund_needs_admin(world):
    c = world["cashier"]
    bill = c.post("/api/bills/", {"patient": world["patient"].id}).data
    c.post(f"/api/bills/{bill['id']}/add_item/", {"service": world["xray"].id, "qty": 2})
    c.post(f"/api/bills/{bill['id']}/pay/", {"mode": "card", "amount": "800", "reference": "SLIP9"})
    assert c.post(f"/api/bills/{bill['id']}/refund/", {"mode": "card", "amount": "800", "reason": "Scan not done"}).status_code == 403


@pytest.mark.django_db
def test_shift_close_matches_cash_and_needs_note_on_difference(world):
    appt = checked_in(world)
    c = world["cashier"]
    bill_id = Bill.objects.get(appointment=appt).id
    c.post(f"/api/bills/{bill_id}/pay/", {"mode": "cash", "amount": "300"})
    c.post(f"/api/bills/{bill_id}/pay/", {"mode": "card", "amount": "200", "reference": "S1"})
    shift = c.get("/api/shifts/current/").data
    assert shift["totals"]["expected_cash"] == D("1300.00")
    assert shift["totals"]["by_mode"]["card"]["received"] == D("200.00")
    short = c.post(f"/api/shifts/{shift['id']}/close/", {"counted_cash": "1290"})
    assert "note" in short.data
    closed = c.post(f"/api/shifts/{shift['id']}/close/", {"counted_cash": "1290", "note": "Gave 10 change from own pocket"})
    assert closed.data["status"] == "closed" and closed.data["difference"] == "-10.00"
    assert c.get("/api/shifts/current/").data is None
    assert "shift" in c.post(f"/api/bills/{bill_id}/refund/", {"mode": "cash", "amount": "10", "reason": "x"}).data


@pytest.mark.django_db
def test_collection_report(client_for, world):
    appt = checked_in(world)
    c = world["cashier"]
    bill_id = Bill.objects.get(appointment=appt).id
    c.post(f"/api/bills/{bill_id}/pay/", {"mode": "cash", "amount": "300"})
    c.post(f"/api/bills/{bill_id}/pay/", {"mode": "upi", "amount": "200", "reference": "U1"})
    c.post(f"/api/bills/{bill_id}/refund/", {"mode": "cash", "amount": "50", "reason": "Rounding"})
    admin = client_for("admin")
    yesterday = str(timezone.localdate() - timedelta(days=1))
    assert admin.get("/api/reports/collection/", {"from": yesterday, "to": yesterday}).data["total_received"] == 0
    report = admin.get("/api/reports/collection/").data
    assert report["modes"]["cash"]["net"] == D("250.00")
    assert report["total_received"] == D("500.00") and report["net"] == D("450.00")
    assert report["cashiers"][0]["receipts"] == 2
    assert report["billed_by_category"] == [{"category": "consultation", "total": D("500.00")}]
    assert client_for("doctor").get("/api/reports/collection/").status_code == 403


@pytest.mark.django_db
def test_doctors_and_nurses_cannot_see_bills(client_for, world):
    assert client_for("doctor").get("/api/bills/").status_code == 403
    assert client_for("nurse").get("/api/bills/").status_code == 403


@pytest.mark.django_db
def test_payments_are_audited(world):
    appt = checked_in(world)
    world["cashier"].post(f"/api/bills/{Bill.objects.get(appointment=appt).id}/pay/", {"mode": "cash", "amount": "500"})
    assert AuditLog.objects.filter(table="billing_payment", action="create").count() == 1


def test_financial_year_label():
    assert financial_year(date(2026, 3, 31)) == "25-26"
    assert financial_year(date(2026, 4, 1)) == "26-27"


@pytest.mark.django_db
def test_shift_list_filters_by_day(client_for, world):
    today = str(timezone.localdate())
    admin = client_for("admin")
    res = admin.get("/api/shifts/", {"from": today, "to": today})
    assert res.status_code == 200 and res.data["count"] == 1
    assert admin.get("/api/shifts/", {"from": "2099-01-01"}).data["count"] == 0
    assert admin.get("/api/hospital/").data["cashier_refund_limit"] == 500


@pytest.mark.django_db
def test_tests_ordered_after_paying_go_on_a_second_bill(world):
    """Common counter flow: consultation paid at check-in, tests paid after the doctor."""
    appt = checked_in(world)
    c = world["cashier"]
    visit = Bill.objects.get(appointment=appt)
    c.post(f"/api/bills/{visit.id}/pay/", {"mode": "cash", "amount": "500"})
    consult = Consultation.objects.create(appointment=appt)
    InvestigationOrder.objects.create(consultation=consult, service=world["cbc"])
    InvestigationOrder.objects.create(consultation=consult, service=world["xray"])

    waiting = c.get("/api/bills/pending-orders/").data
    assert len(waiting) == 1 and waiting[0]["appointment"] == appt.id and waiting[0]["total"] == D("700.00")
    # The paid visit bill still shows them, so the cashier is reminded on that screen too.
    assert len(c.get(f"/api/bills/{visit.id}/").data["pending_orders"]) == 2

    second = c.post(f"/api/bills/bill-orders/{appt.id}/")
    assert second.status_code == 200, second.data
    assert second.data["id"] != visit.id and second.data["net_total"] == "700.00"
    assert [b["id"] for b in second.data["visit_bills"]] == [visit.id]
    assert c.get("/api/bills/pending-orders/").data == []
    assert c.post(f"/api/bills/bill-orders/{appt.id}/").status_code == 400
    # Asking for the visit's bill now opens the one still to be paid.
    assert c.post(f"/api/bills/for-appointment/{appt.id}/").data["id"] == second.data["id"]


@pytest.mark.django_db
def test_pending_orders_join_an_unpaid_visit_bill(world):
    appt = checked_in(world)
    consult = Consultation.objects.create(appointment=appt)
    InvestigationOrder.objects.create(consultation=consult, service=world["cbc"])
    res = world["cashier"].post(f"/api/bills/bill-orders/{appt.id}/")
    assert res.data["id"] == Bill.objects.get(appointment=appt).id and res.data["net_total"] == "800.00"
