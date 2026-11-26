"""Billing rules: building bills, discounts, payments, refunds and cash shifts."""

from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.appointments.models import Appointment
from apps.core.models import Sequence
from apps.masters.models import Service
from apps.opd.models import InvestigationOrder

from .models import ZERO, Bill, BillItem, Payment, Refund, Shift, financial_year, money


def _number(prefix):
    fy = financial_year()
    return f"{prefix}/{fy}/{Sequence.next_value(prefix.lower(), fy):06d}"


def _discount_limit_pct():
    return Decimal(str(getattr(settings, "CASHIER_DISCOUNT_LIMIT_PERCENT", 10)))


def _refund_limit():
    return Decimal(str(getattr(settings, "CASHIER_REFUND_LIMIT", 500)))


def _locked_bill(bill):
    return Bill.objects.select_for_update().get(pk=bill.pk)


def _save_totals(bill, user):
    bill.recalculate()
    bill.refresh_status()
    bill.updated_by = user
    bill.save()
    return bill


# ---------------------------------------------------------------- building a bill


@transaction.atomic
def visit_bill(appointment, user=None):
    """The visit's bill, created with the consultation fee the first time it is asked for."""
    existing = Bill.objects.filter(appointment=appointment).order_by("id").first()
    if existing:
        return existing
    doctor = appointment.doctor
    follow_up = appointment.visit_type == Appointment.VisitType.FOLLOW_UP
    bill = Bill.objects.create(
        patient=appointment.patient, appointment=appointment, date=appointment.date, created_by=user, updated_by=user
    )
    item = BillItem(
        bill=bill,
        service=Service.objects.filter(code=f"CONS-{doctor.pk}").first(),
        category=Service.Category.CONSULTATION,
        description=f"Consultation, {doctor}{' (follow-up)' if follow_up else ''}",
        rate=doctor.follow_up_fee if follow_up else doctor.first_visit_fee,
    )
    item.compute()
    item.save()
    return _save_totals(bill, user)


def pending_orders(bill):
    """Tests the doctor ordered for this visit that are not on the bill yet."""
    if not bill.appointment_id:
        return InvestigationOrder.objects.none()
    return pending_orders_for(bill.appointment_id)


def visits_with_pending_orders(date):
    """Checked-in visits on ``date`` whose ordered tests are not on any bill yet."""
    orders = (
        InvestigationOrder.objects.filter(
            status=InvestigationOrder.Status.ORDERED,
            consultation__appointment__date=date,
        )
        .exclude(consultation__appointment__status__in=[Appointment.Status.CANCELLED, Appointment.Status.NO_SHOW])
        .select_related("service", "consultation__appointment__patient", "consultation__appointment__doctor__user")
        .order_by("consultation__appointment__token_no", "id")
    )
    visits = {}
    for o in orders:
        appt = o.consultation.appointment
        v = visits.setdefault(
            appt.pk,
            {
                "appointment": appt.pk, "patient": appt.patient_id, "patient_name": appt.patient.full_name,
                "patient_uhid": appt.patient.uhid, "doctor_name": str(appt.doctor), "token_no": appt.token_no,
                "orders": [], "total": ZERO,
            },
        )
        v["orders"].append({"id": o.pk, "service_name": o.service.name, "price": o.service.price})
        v["total"] = money(v["total"] + o.service.price)
    return list(visits.values())


@transaction.atomic
def bill_pending_orders(appointment, *, user):
    """Put every pending test order of a visit on a bill: the visit's open bill if it can still be
    changed, otherwise a new bill for the same visit."""
    orders = list(pending_orders_for(appointment))
    if not orders:
        raise ValidationError({"detail": "This visit has no tests waiting to be billed."})
    bill = (
        Bill.objects.filter(appointment=appointment, status=Bill.Status.DRAFT, paid_total=0).order_by("-id").first()
        or Bill.objects.create(patient=appointment.patient, appointment=appointment, created_by=user, updated_by=user)
    )
    for order in orders:
        bill = add_item(bill, user=user, order=order)
    return bill


def pending_orders_for(appointment):
    return InvestigationOrder.objects.filter(
        consultation__appointment=appointment, status=InvestigationOrder.Status.ORDERED
    ).select_related("service", "consultation")


@transaction.atomic
def add_item(bill, *, user, service=None, description="", rate=None, qty=1, discount=ZERO, order=None):
    bill = _locked_bill(bill)
    if not bill.is_editable:
        raise ValidationError({"detail": "Items can only be changed before any payment is taken."})
    if order is not None:
        if order.consultation.appointment_id != bill.appointment_id or order.status != InvestigationOrder.Status.ORDERED:
            raise ValidationError({"order": "That test order does not belong to this visit or is already billed."})
        service = order.service
    if service is None and (not description or rate is None):
        raise ValidationError({"service": "Choose a service, or give a description and a rate."})
    item = BillItem(
        bill=bill,
        service=service,
        category=service.category if service else Service.Category.OTHER,
        description=description or service.name,
        rate=money(rate if rate is not None else service.price),
        qty=qty,
        discount=money(discount),
        tax_code=service.tax_code if service else Service.TaxCode.EXEMPT,
        order=order,
    )
    _check_discount(user, item.discount, item.qty * item.rate)
    item.compute()
    item.save()
    if order is not None:
        order.status = InvestigationOrder.Status.BILLED
        order.save(update_fields=["status"])
    return _save_totals(bill, user)


@transaction.atomic
def remove_item(bill, item_id, *, user):
    bill = _locked_bill(bill)
    if not bill.is_editable:
        raise ValidationError({"detail": "Items can only be changed before any payment is taken."})
    item = bill.items.filter(pk=item_id).first()
    if item is None:
        raise ValidationError({"item": "No such item on this bill."})
    if item.order_id:
        InvestigationOrder.objects.filter(pk=item.order_id).update(status=InvestigationOrder.Status.ORDERED)
    item.delete()
    return _save_totals(bill, user)


def _check_discount(user, discount, gross):
    if discount <= 0 or gross <= 0:
        return
    if discount > gross:
        raise ValidationError({"discount": "The discount cannot be more than the amount."})
    pct = discount * 100 / gross
    if pct > _discount_limit_pct() and not user.has_role("admin"):
        raise PermissionDenied(
            f"Discounts above {_discount_limit_pct()}% need an admin. Ask an admin to apply this discount."
        )


@transaction.atomic
def apply_bill_discount(bill, *, user, percent=None, amount=None, reason):
    """Spread a whole-bill discount across the items in proportion to their value."""
    bill = _locked_bill(bill)
    if not bill.is_editable:
        raise ValidationError({"detail": "Discounts can only be given before any payment is taken."})
    items = list(bill.items.all())
    gross = sum((i.qty * i.rate for i in items), ZERO)
    if gross <= 0:
        raise ValidationError({"detail": "The bill has no items to discount."})
    total = money(gross * Decimal(percent) / 100) if percent is not None else money(amount or 0)
    if total > 0 and not reason.strip():
        raise ValidationError({"reason": "Give a reason for the discount."})
    _check_discount(user, total, gross)
    remaining = total
    for idx, item in enumerate(items):
        line_gross = item.qty * item.rate
        share = remaining if idx == len(items) - 1 else money(total * line_gross / gross)
        item.discount = min(share, line_gross)
        remaining -= item.discount
        item.compute()
        item.save()
    bill.discount_reason = reason.strip() if total > 0 else ""
    bill.discount_approved_by = user if total > 0 else None
    return _save_totals(bill, user)


# ---------------------------------------------------------------- money in and out


def open_shift_for(user):
    return Shift.objects.filter(cashier=user, status=Shift.Status.OPEN).first()


def _require_shift(user):
    shift = open_shift_for(user)
    if not shift:
        raise ValidationError({"shift": "Open your cash shift before taking or returning money."})
    return shift


@transaction.atomic
def take_payment(bill, *, user, mode, amount, reference=""):
    bill = _locked_bill(bill)
    shift = _require_shift(user)
    amount = money(amount)
    if bill.status == Bill.Status.CANCELLED:
        raise ValidationError({"detail": "This bill is cancelled."})
    if bill.net_total <= 0:
        raise ValidationError({"detail": "The bill has nothing to pay."})
    if amount <= 0 or amount > bill.balance:
        raise ValidationError({"amount": f"Enter an amount between 0.01 and the balance of {bill.balance}."})
    if mode in (Payment.Mode.CARD, Payment.Mode.UPI) and not reference.strip():
        raise ValidationError({"reference": "Enter the card slip or UPI transaction number."})
    if not bill.bill_no:
        bill.bill_no = _number("OPB")
    payment = Payment.objects.create(
        receipt_no=_number("RCP"), bill=bill, shift=shift, mode=mode, amount=amount,
        reference=reference.strip(), received_by=user,
    )
    bill.paid_total = money(bill.paid_total + amount)
    _save_totals(bill, user)
    return payment


@transaction.atomic
def refund(bill, *, user, mode, amount, reason):
    bill = _locked_bill(bill)
    shift = _require_shift(user)
    amount = money(amount)
    refundable = money(bill.paid_total - bill.refunded_total)
    if not reason.strip():
        raise ValidationError({"reason": "Give a reason for the refund."})
    if amount <= 0 or amount > refundable:
        raise ValidationError({"amount": f"You can refund up to {refundable}."})
    if amount > _refund_limit() and not user.has_role("admin"):
        raise PermissionDenied(f"Refunds above {_refund_limit()} need an admin.")
    if mode == Payment.Mode.CASH:
        cash_in_drawer = shift.totals()["expected_cash"]
        if amount > cash_in_drawer:
            raise ValidationError({"amount": f"Only {cash_in_drawer} cash is in your drawer for this shift."})
    ref = Refund.objects.create(
        refund_no=_number("RFD"), bill=bill, shift=shift, mode=mode, amount=amount, reason=reason.strip(), refunded_by=user
    )
    bill.refunded_total = money(bill.refunded_total + amount)
    _save_totals(bill, user)
    return ref


@transaction.atomic
def cancel(bill, *, user, reason):
    bill = _locked_bill(bill)
    if not reason.strip():
        raise ValidationError({"reason": "Give a reason for cancelling."})
    if bill.status == Bill.Status.CANCELLED:
        raise ValidationError({"detail": "The bill is already cancelled."})
    if bill.paid_total - bill.refunded_total > 0:
        raise ValidationError({"detail": "Refund the money taken on this bill before cancelling it."})
    if bill.paid_total > 0 and not user.has_role("admin"):
        raise PermissionDenied("Only an admin can cancel a bill that had payments.")
    InvestigationOrder.objects.filter(bill_item__bill=bill).update(status=InvestigationOrder.Status.ORDERED)
    bill.status = Bill.Status.CANCELLED
    bill.cancel_reason = reason.strip()
    bill.updated_by = user
    bill.save()
    return bill


# ---------------------------------------------------------------- shifts


@transaction.atomic
def open_shift(user, opening_cash):
    if open_shift_for(user):
        raise ValidationError({"detail": "You already have an open shift."})
    return Shift.objects.create(cashier=user, opening_cash=money(opening_cash))


@transaction.atomic
def close_shift(shift, *, user, counted_cash, note=""):
    shift = Shift.objects.select_for_update().get(pk=shift.pk)
    if shift.status == Shift.Status.CLOSED:
        raise ValidationError({"detail": "This shift is already closed."})
    if shift.cashier != user and not user.has_role("admin"):
        raise PermissionDenied("Only the cashier who opened the shift, or an admin, can close it.")
    expected = shift.totals()["expected_cash"]
    counted = money(counted_cash)
    difference = money(counted - expected)
    if difference != 0 and not note.strip():
        raise ValidationError({"note": f"The count is off by {difference}. Add a note explaining the difference."})
    shift.expected_cash = expected
    shift.counted_cash = counted
    shift.difference = difference
    shift.note = note.strip()
    shift.closed_at = timezone.now()
    shift.status = Shift.Status.CLOSED
    shift.save()
    return shift
