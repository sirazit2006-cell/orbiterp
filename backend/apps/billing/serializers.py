from rest_framework import serializers

from apps.masters.models import Service
from apps.opd.models import InvestigationOrder
from apps.patients.models import Patient

from .models import Bill, BillItem, Payment, Refund, Shift


class BillItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = BillItem
        fields = ["id", "service", "category", "description", "qty", "rate", "discount", "tax_code", "tax_amount", "amount", "order"]


class PaymentSerializer(serializers.ModelSerializer):
    mode_label = serializers.CharField(source="get_mode_display", read_only=True)
    received_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = ["id", "receipt_no", "mode", "mode_label", "amount", "reference", "received_by_name", "received_at"]

    def get_received_by_name(self, obj):
        return obj.received_by.get_full_name() or obj.received_by.username


class RefundSerializer(serializers.ModelSerializer):
    mode_label = serializers.CharField(source="get_mode_display", read_only=True)
    refunded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Refund
        fields = ["id", "refund_no", "mode", "mode_label", "amount", "reason", "refunded_by_name", "refunded_at"]

    def get_refunded_by_name(self, obj):
        return obj.refunded_by.get_full_name() or obj.refunded_by.username


class PendingOrderSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source="service.name")
    price = serializers.DecimalField(source="service.price", max_digits=10, decimal_places=2)

    class Meta:
        model = InvestigationOrder
        fields = ["id", "service", "service_name", "price"]


class BillListSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_uhid = serializers.CharField(source="patient.uhid", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    balance = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = Bill
        fields = [
            "id", "bill_no", "date", "patient", "patient_name", "patient_uhid", "appointment", "doctor_name",
            "status", "status_label", "net_total", "paid_total", "refunded_total", "balance", "created_at",
        ]

    def get_doctor_name(self, obj):
        return str(obj.appointment.doctor) if obj.appointment_id else None


class BillSerializer(BillListSerializer):
    items = BillItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    refunds = RefundSerializer(many=True, read_only=True)
    pending_orders = serializers.SerializerMethodField()
    is_editable = serializers.BooleanField(read_only=True)
    patient_mobile = serializers.CharField(source="patient.mobile", read_only=True)
    patient_age = serializers.IntegerField(source="patient.age", read_only=True)
    patient_gender = serializers.CharField(source="patient.gender", read_only=True)
    discount_approved_by_name = serializers.SerializerMethodField()
    visit_bills = serializers.SerializerMethodField()

    class Meta(BillListSerializer.Meta):
        fields = BillListSerializer.Meta.fields + [
            "patient_mobile", "patient_age", "patient_gender", "subtotal", "discount_total", "tax_total",
            "discount_reason", "discount_approved_by_name", "cancel_reason", "is_editable",
            "items", "payments", "refunds", "pending_orders", "visit_bills",
        ]

    def get_pending_orders(self, obj):
        from .services import pending_orders

        return PendingOrderSerializer(pending_orders(obj), many=True).data

    def get_visit_bills(self, obj):
        if not obj.appointment_id:
            return []
        others = Bill.objects.filter(appointment=obj.appointment_id).exclude(pk=obj.pk).order_by("id")
        return [{"id": b.id, "bill_no": b.bill_no, "status": b.status, "net_total": b.net_total} for b in others]

    def get_discount_approved_by_name(self, obj):
        u = obj.discount_approved_by
        return (u.get_full_name() or u.username) if u else None


class NewBillSerializer(serializers.Serializer):
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.filter(is_active=True))


class AddItemSerializer(serializers.Serializer):
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.filter(is_active=True), required=False, allow_null=True)
    order = serializers.PrimaryKeyRelatedField(queryset=InvestigationOrder.objects.all(), required=False, allow_null=True)
    description = serializers.CharField(max_length=200, required=False, allow_blank=True)
    rate = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True)
    qty = serializers.IntegerField(min_value=1, max_value=999, default=1)
    discount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, default=0)


class DiscountSerializer(serializers.Serializer):
    percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, required=False)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False)
    reason = serializers.CharField(max_length=255, allow_blank=True)

    def validate(self, attrs):
        if ("percent" in attrs) == ("amount" in attrs):
            raise serializers.ValidationError("Give either a percentage or an amount.")
        return attrs


class PaymentInputSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=Payment.Mode.choices)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    reference = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")


class RefundInputSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=Payment.Mode.choices)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    reason = serializers.CharField(max_length=255, allow_blank=True)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255, allow_blank=True)


class ShiftSerializer(serializers.ModelSerializer):
    cashier_name = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = [
            "id", "cashier", "cashier_name", "opened_at", "opening_cash", "closed_at", "expected_cash",
            "counted_cash", "difference", "note", "status", "totals",
        ]

    def get_cashier_name(self, obj):
        return obj.cashier.get_full_name() or obj.cashier.username

    def get_totals(self, obj):
        return obj.totals()
