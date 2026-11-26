from django.contrib import admin

from .models import Bill, Payment, Refund, Shift


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Bill)
class BillAdmin(ReadOnlyAdmin):
    list_display = ("bill_no", "date", "patient", "status", "net_total", "paid_total", "refunded_total")
    list_filter = ("status", "date")
    search_fields = ("bill_no", "patient__uhid")


@admin.register(Payment)
class PaymentAdmin(ReadOnlyAdmin):
    list_display = ("receipt_no", "received_at", "bill", "mode", "amount", "received_by")
    list_filter = ("mode",)


@admin.register(Refund)
class RefundAdmin(ReadOnlyAdmin):
    list_display = ("refund_no", "refunded_at", "bill", "mode", "amount", "refunded_by")


@admin.register(Shift)
class ShiftAdmin(ReadOnlyAdmin):
    list_display = ("cashier", "opened_at", "closed_at", "opening_cash", "expected_cash", "counted_cash", "difference", "status")
