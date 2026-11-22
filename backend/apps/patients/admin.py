from django.contrib import admin

from .models import Patient


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ("uhid", "full_name", "gender", "mobile", "city", "created_at")
    search_fields = ("uhid", "mobile", "first_name", "last_name")
    readonly_fields = ("uhid",)
