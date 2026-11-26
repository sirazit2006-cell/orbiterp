from django.contrib import admin

from .models import Appointment, DoctorLeave, DoctorSchedule


@admin.register(DoctorSchedule)
class DoctorScheduleAdmin(admin.ModelAdmin):
    list_display = ("doctor", "weekday", "start_time", "end_time", "slot_minutes", "max_patients", "is_active")
    list_filter = ("weekday", "is_active")


@admin.register(DoctorLeave)
class DoctorLeaveAdmin(admin.ModelAdmin):
    list_display = ("doctor", "from_date", "to_date", "reason")


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("date", "slot_time", "token_no", "patient", "doctor", "status", "source")
    list_filter = ("status", "source", "date")
    search_fields = ("patient__uhid", "patient__mobile", "patient__first_name")
    readonly_fields = [f.name for f in Appointment._meta.fields]

    def has_add_permission(self, request):
        return False
