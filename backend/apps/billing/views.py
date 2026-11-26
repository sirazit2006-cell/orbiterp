from datetime import datetime, time, timedelta

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.appointments.models import Appointment
from apps.core.audit import write_audit
from apps.core.models import AuditLog
from apps.core.permissions import role_permission

from . import services
from .models import ZERO, Bill, Payment, Refund, Shift, money
from .serializers import (
    AddItemSerializer,
    BillListSerializer,
    BillSerializer,
    DiscountSerializer,
    NewBillSerializer,
    PaymentInputSerializer,
    PaymentSerializer,
    ReasonSerializer,
    RefundInputSerializer,
    RefundSerializer,
    ShiftSerializer,
)

BILLING_ROLES = ("cashier", "reception")


def day_range(start, end):
    """[start 00:00, day after end 00:00) in the hospital's time zone.

    Plain datetime bounds instead of ``__date`` lookups: those need MySQL's time zone tables,
    which a fresh MySQL install often lacks, and then silently match nothing.
    """
    tz = timezone.get_current_timezone()
    since = datetime.combine(start, time.min, tzinfo=tz)
    until = datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz)
    return since, until
BillingPermission = role_permission(read=BILLING_ROLES, write=BILLING_ROLES)


class BillViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [BillingPermission]
    filterset_fields = {"status": ["exact", "in"], "date": ["exact", "gte", "lte"], "patient": ["exact"], "appointment": ["exact"]}
    search_fields = ["bill_no", "patient__first_name", "patient__last_name", "patient__uhid", "patient__mobile"]
    ordering_fields = ["date", "created_at", "bill_no"]

    def get_queryset(self):
        return Bill.objects.select_related("patient", "appointment__doctor__user").prefetch_related(
            "items", "payments__received_by", "refunds__refunded_by"
        )

    def get_serializer_class(self):
        return BillListSerializer if self.action == "list" else BillSerializer

    def _respond(self, bill, code=status.HTTP_200_OK):
        bill = self.get_queryset().get(pk=bill.pk)
        return Response(BillSerializer(bill).data, status=code)

    def create(self, request):
        """A bill not tied to a visit, e.g. a walk-in lab test or a procedure."""
        body = NewBillSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        bill = Bill.objects.create(patient=body.validated_data["patient"], created_by=request.user, updated_by=request.user)
        write_audit(request, AuditLog.Action.CREATE, bill)
        return self._respond(bill, status.HTTP_201_CREATED)

    def _visit(self, appointment_id):
        appt = get_object_or_404(Appointment, pk=appointment_id)
        if appt.status in (Appointment.Status.CANCELLED, Appointment.Status.NO_SHOW):
            raise ValidationError({"detail": "This appointment was cancelled or missed."})
        return appt

    @action(detail=False, methods=["post"], url_path=r"for-appointment/(?P<appointment_id>\d+)")
    def for_appointment(self, request, appointment_id=None):
        """The visit's bill to work on: one still to be paid if there is one, else the first."""
        appt = self._visit(appointment_id)
        first = services.visit_bill(appt, user=request.user)
        open_bill = (
            Bill.objects.filter(appointment=appt, status__in=[Bill.Status.DRAFT, Bill.Status.PARTLY_PAID], net_total__gt=0)
            .order_by("-id")
            .first()
        )
        return self._respond(open_bill or first)

    @action(detail=False, methods=["get"], url_path="pending-orders")
    def pending_orders(self, request):
        """Visits whose ordered tests are not billed yet, so the counter can call those patients."""
        day = parse_date(request.query_params.get("date", "")) or timezone.localdate()
        return Response(services.visits_with_pending_orders(day))

    @action(detail=False, methods=["post"], url_path=r"bill-orders/(?P<appointment_id>\d+)")
    def bill_orders(self, request, appointment_id=None):
        bill = services.bill_pending_orders(self._visit(appointment_id), user=request.user)
        write_audit(request, AuditLog.Action.UPDATE, bill, {"billed_orders": True})
        return self._respond(bill)

    @action(detail=True, methods=["post"])
    def add_item(self, request, pk=None):
        body = AddItemSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        bill = services.add_item(self.get_object(), user=request.user, **body.validated_data)
        write_audit(request, AuditLog.Action.UPDATE, bill, {"added": {k: str(v) for k, v in request.data.items()}})
        return self._respond(bill)

    @action(detail=True, methods=["post"], url_path=r"remove_item/(?P<item_id>\d+)")
    def remove_item(self, request, pk=None, item_id=None):
        bill = services.remove_item(self.get_object(), int(item_id), user=request.user)
        write_audit(request, AuditLog.Action.UPDATE, bill, {"removed_item": item_id})
        return self._respond(bill)

    @action(detail=True, methods=["post"])
    def discount(self, request, pk=None):
        body = DiscountSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        bill = services.apply_bill_discount(self.get_object(), user=request.user, **body.validated_data)
        write_audit(request, AuditLog.Action.UPDATE, bill, {"discount": str(bill.discount_total), "reason": bill.discount_reason})
        return self._respond(bill)

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        body = PaymentInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        payment = services.take_payment(self.get_object(), user=request.user, **body.validated_data)
        write_audit(request, AuditLog.Action.CREATE, payment, {"receipt": payment.receipt_no, "amount": str(payment.amount), "mode": payment.mode})
        return self._respond(payment.bill, status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def refund(self, request, pk=None):
        body = RefundInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        ref = services.refund(self.get_object(), user=request.user, **body.validated_data)
        write_audit(request, AuditLog.Action.CREATE, ref, {"refund": ref.refund_no, "amount": str(ref.amount), "reason": ref.reason})
        return self._respond(ref.bill, status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        body = ReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        bill = services.cancel(self.get_object(), user=request.user, reason=body.validated_data["reason"])
        write_audit(request, AuditLog.Action.UPDATE, bill, {"status": "cancelled", "reason": bill.cancel_reason})
        return self._respond(bill)


class ShiftViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = ShiftSerializer
    permission_classes = [BillingPermission]
    filterset_fields = ["status", "cashier"]

    def get_queryset(self):
        qs = Shift.objects.select_related("cashier")
        if not self.request.user.has_role("admin"):
            qs = qs.filter(cashier=self.request.user)
        # ?from=&to= picks shifts opened on those days (local time).
        start = parse_date(self.request.query_params.get("from", ""))
        if start:
            since, until = day_range(start, parse_date(self.request.query_params.get("to", "")) or start)
            qs = qs.filter(opened_at__gte=since, opened_at__lt=until)
        return qs

    @action(detail=False, methods=["get"])
    def current(self, request):
        shift = services.open_shift_for(request.user)
        return Response(ShiftSerializer(shift).data if shift else None)

    @action(detail=False, methods=["post"])
    def open(self, request):
        shift = services.open_shift(request.user, request.data.get("opening_cash") or 0)
        write_audit(request, AuditLog.Action.CREATE, shift, {"opening_cash": str(shift.opening_cash)})
        return Response(ShiftSerializer(shift).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        if request.data.get("counted_cash") in (None, ""):
            raise ValidationError({"counted_cash": "Enter the cash you counted."})
        shift = services.close_shift(
            self.get_object(), user=request.user, counted_cash=request.data["counted_cash"], note=request.data.get("note", "")
        )
        write_audit(request, AuditLog.Action.UPDATE, shift, {"closed": True, "difference": str(shift.difference)})
        return Response(ShiftSerializer(shift).data)


@api_view(["GET"])
def collection_report(request):
    """Money in and out on one day (or a date range), by payment mode and by cashier."""
    if not request.user.has_role("admin", "cashier"):
        raise PermissionDenied()
    start = parse_date(request.query_params.get("from", "")) or timezone.localdate()
    end = parse_date(request.query_params.get("to", "")) or start
    since, until = day_range(start, end)
    payments = Payment.objects.filter(received_at__gte=since, received_at__lt=until)
    refunds = Refund.objects.filter(refunded_at__gte=since, refunded_at__lt=until)
    if not request.user.has_role("admin"):
        payments = payments.filter(received_by=request.user)
        refunds = refunds.filter(refunded_by=request.user)

    modes = {m: {"label": label, "received": ZERO, "refunded": ZERO} for m, label in Payment.Mode.choices}
    for row in payments.values("mode").annotate(total=Sum("amount")):
        modes[row["mode"]]["received"] = money(row["total"])
    for row in refunds.values("mode").annotate(total=Sum("amount")):
        modes[row["mode"]]["refunded"] = money(row["total"])
    for m in modes.values():
        m["net"] = money(m["received"] - m["refunded"])

    cashiers = {}
    for row in payments.values("received_by__username", "received_by__first_name", "received_by__last_name").annotate(total=Sum("amount"), count=Count("id")):
        name = f"{row['received_by__first_name']} {row['received_by__last_name']}".strip() or row["received_by__username"]
        cashiers[name] = {"received": money(row["total"]), "receipts": row["count"], "refunded": ZERO}
    for row in refunds.values("refunded_by__username", "refunded_by__first_name", "refunded_by__last_name").annotate(total=Sum("amount")):
        name = f"{row['refunded_by__first_name']} {row['refunded_by__last_name']}".strip() or row["refunded_by__username"]
        cashiers.setdefault(name, {"received": ZERO, "receipts": 0, "refunded": ZERO})["refunded"] = money(row["total"])

    bills = Bill.objects.filter(date__gte=start, date__lte=end)
    discounted = bills.filter(discount_total__gt=0).exclude(status=Bill.Status.CANCELLED).select_related("patient", "discount_approved_by")
    cancelled = bills.filter(status=Bill.Status.CANCELLED).select_related("patient")
    by_category = (
        bills.exclude(status__in=[Bill.Status.CANCELLED, Bill.Status.DRAFT])
        .values("items__category")
        .annotate(total=Sum("items__amount"))
        .order_by("-total")
    )
    return Response(
        {
            "from": start,
            "to": end,
            "modes": modes,
            "total_received": money(sum((m["received"] for m in modes.values()), ZERO)),
            "total_refunded": money(sum((m["refunded"] for m in modes.values()), ZERO)),
            "net": money(sum((m["net"] for m in modes.values()), ZERO)),
            "cashiers": [{"name": k, **v} for k, v in sorted(cashiers.items())],
            "billed_by_category": [{"category": r["items__category"], "total": money(r["total"] or 0)} for r in by_category if r["items__category"]],
            "bills": {
                "count": bills.exclude(status=Bill.Status.CANCELLED).count(),
                "unpaid": bills.filter(Q(status=Bill.Status.DRAFT) | Q(status=Bill.Status.PARTLY_PAID)).exclude(net_total=0).count(),
            },
            "discounts": [
                {"bill": b.id, "bill_no": b.bill_no, "patient": b.patient.full_name, "amount": b.discount_total,
                 "reason": b.discount_reason,
                 "by": (b.discount_approved_by.get_full_name() or b.discount_approved_by.username) if b.discount_approved_by else ""}
                for b in discounted
            ],
            "refunds": RefundSerializer(refunds.select_related("refunded_by", "bill"), many=True).data,
            "cancelled": [{"bill": b.id, "bill_no": b.bill_no, "patient": b.patient.full_name, "reason": b.cancel_reason} for b in cancelled],
        }
    )
