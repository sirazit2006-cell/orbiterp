from django.contrib import admin

from .models import Department, Doctor, Medicine, Service

admin.site.register(Department)
admin.site.register(Doctor)


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = ("name", "strength", "form", "generic_name", "is_active")
    search_fields = ("name", "generic_name")


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "category", "price", "tax_code", "is_active")
    list_filter = ("category", "is_active")
    search_fields = ("name", "code")
