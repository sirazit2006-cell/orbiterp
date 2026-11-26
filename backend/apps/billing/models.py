from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Sum
from django.utils import timezone

from apps.appointments.models import Appointment
from apps.core.models import TimeStampedModel
from apps.masters.models import Service
from apps.opd.models import InvestigationOrder
from apps.patients.models import Patient

ZERO = Decimal("0.00")
TAX_RATES = {"exempt": Decimal("0"), "gst5": Decimal("5"), "gst12": Decimal("12"), "gst18": Decimal("18")}


def money(value):
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def financial_year(day=None):
    """Indian financial year label for a date, e.g. 2026-11-26 -> '26-27'."""
    day = day or timezone.localdate()
    start = day.year if day.month >= 4 else day.year - 1
    return f"{start % 100:02d}-{(start + 1) % 100:02d}"


class Shift(models.Model):
    """One cashier's session at the counter, from opening cash to the counted close."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="shifts")
    opened_at = models.DateTimeField(default=timezone.now)
    opening_cash = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(0)])
    closed_at = models.DateTimeField(null=True, blank=True)
    expected_cash = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    counted_cash = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    difference = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=6, choices=Status.choices, default=Status.OPEN)

    class Meta:
        ordering = ["-opened_at"]

    def __str__(self):
        return f"{self.cashier} {self.opened_at:%d %b %H:%M}"

    def totals(self):
        """Money taken and returned in this shift, by payment mode."""
        by_mode = {mode: {"received": ZERO, "refunded": ZERO} for mode, _ in Payment.Mode.choices}
        for row in self.payments.values("mode").annotate(total=Sum("amount")):
            by_mode[row["mode"]]["received"] = money(row["total"])
        for row in self.refunds.values("mode").annotate(total=Sum("amount")):
            by_mode[row["mode"]]["refunded"] = money(row["total"])
        cash = by_mode["cash"]
        return {
            "by_mode": by_mode,
            "expected_cash": money(self.opening_cash + cash["received"] - cash["refunded"]),
        }


class Bill(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PARTLY_PAID = "partly_paid", "Partly paid"
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    bill_no = models.CharField(max_length=30, unique=True, null=True, blank=True, help_text="Given when the first payment is taken.")
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="bills")
    # A visit can have more than one bill: the consultation is often paid at check-in and the
    # tests the doctor orders are paid on a second bill afterwards.
    appointment = models.ForeignKey(Appointment, null=True, blank=True, on_delete=models.PROTECT, related_name="bills")
    date = models.DateField(default=timezone.localdate, db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT, db_index=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    net_total = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    paid_total = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    refunded_total = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    discount_reason = models.CharField(max_length=255, blank=True)
    discount_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    cancel_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return self.bill_no or f"Draft bill #{self.pk}"

    @property
    def balance(self):
        """What the patient still owes. Refunds give money back; they do not reopen the bill."""
        if self.status in (self.Status.CANCELLED, self.Status.REFUNDED):
            return ZERO
        return max(money(self.net_total - self.paid_total), ZERO)

    @property
    def is_editable(self):
        return self.status == self.Status.DRAFT and self.paid_total == ZERO

    def recalculate(self):
        items = list(self.items.all())
        self.subtotal = money(sum((i.qty * i.rate for i in items), ZERO))
        self.discount_total = money(sum((i.discount for i in items), ZERO))
        self.tax_total = money(sum((i.tax_amount for i in items), ZERO))
        self.net_total = money(sum((i.amount for i in items), ZERO))

    def refresh_status(self):
        if self.status == self.Status.CANCELLED:
            return
        received = self.paid_total
        if self.refunded_total and self.refunded_total >= received and received > 0:
            self.status = self.Status.REFUNDED
        elif received == ZERO:
            self.status = self.Status.DRAFT
        elif received >= self.net_total:
            self.status = self.Status.PAID
        else:
            self.status = self.Status.PARTLY_PAID


class BillItem(models.Model):
    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name="items")
    service = models.ForeignKey(Service, null=True, blank=True, on_delete=models.PROTECT)
    category = models.CharField(max_length=15, choices=Service.Category.choices)
    description = models.CharField(max_length=200)
    qty = models.PositiveSmallIntegerField(default=1, validators=[MinValueValidator(1)])
    rate = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO, validators=[MinValueValidator(0)])
    tax_code = models.CharField(max_length=6, choices=Service.TaxCode.choices, default=Service.TaxCode.EXEMPT)
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    order = models.OneToOneField(InvestigationOrder, null=True, blank=True, on_delete=models.PROTECT, related_name="bill_item")

    class Meta:
        ordering = ["id"]

    def compute(self):
        gross = money(self.qty * self.rate)
        self.discount = money(min(self.discount or ZERO, gross))
        taxable = gross - self.discount
        self.tax_amount = money(taxable * TAX_RATES[self.tax_code] / 100)
        self.amount = money(taxable + self.tax_amount)


class Payment(models.Model):
    class Mode(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        UPI = "upi", "UPI"

    receipt_no = models.CharField(max_length=30, unique=True)
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name="payments")
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name="payments")
    mode = models.CharField(max_length=5, choices=Mode.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    reference = models.CharField(max_length=60, blank=True, help_text="Card slip or UPI transaction ID.")
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    received_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["received_at"]


class Refund(models.Model):
    refund_no = models.CharField(max_length=30, unique=True)
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name="refunds")
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name="refunds")
    mode = models.CharField(max_length=5, choices=Payment.Mode.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    reason = models.CharField(max_length=255)
    refunded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    refunded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["refunded_at"]
