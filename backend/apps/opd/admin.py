from django.contrib import admin

from .models import Amendment, Consultation, Vitals


@admin.register(Vitals)
class VitalsAdmin(admin.ModelAdmin):
    list_display = ("appointment", "bp_systolic", "bp_diastolic", "pulse", "temperature_f", "spo2")


@admin.register(Consultation)
class ConsultationAdmin(admin.ModelAdmin):
    list_display = ("appointment", "follow_up_date", "updated_at")

    def has_change_permission(self, request, obj=None):
        return False


admin.site.register(Amendment)
