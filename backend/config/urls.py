from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.appointments.views import AppointmentViewSet, DoctorLeaveViewSet, DoctorScheduleViewSet, doctor_slots
from apps.billing.views import BillViewSet, ShiftViewSet, collection_report
from apps.core import views as core_views
from apps.masters.views import DepartmentViewSet, DoctorViewSet, MedicineViewSet, ServiceViewSet
from apps.opd import views as opd_views
from apps.patients.views import PatientViewSet

router = DefaultRouter()
router.register("users", core_views.UserViewSet)
router.register("audit-logs", core_views.AuditLogViewSet)
router.register("departments", DepartmentViewSet)
router.register("doctors", DoctorViewSet)
router.register("patients", PatientViewSet)
router.register("medicines", MedicineViewSet)
router.register("services", ServiceViewSet)
router.register("bills", BillViewSet, basename="bill")
router.register("shifts", ShiftViewSet, basename="shift")
router.register("schedules", DoctorScheduleViewSet)
router.register("doctor-leaves", DoctorLeaveViewSet)
router.register("appointments", AppointmentViewSet, basename="appointment")


def health(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", core_views.me, name="me"),
    path("api/roles/", core_views.roles, name="roles"),
    path("api/doctors/<int:pk>/slots/", doctor_slots, name="doctor_slots"),
    path("api/hospital/", opd_views.hospital, name="hospital"),
    path("api/appointments/<int:pk>/vitals/", opd_views.vitals, name="vitals"),
    path("api/appointments/<int:pk>/consultation/", opd_views.consultation, name="consultation"),
    path("api/appointments/<int:pk>/consultation/amend/", opd_views.amend, name="consultation_amend"),
    path("api/patients/<int:pk>/clinical-history/", opd_views.clinical_history, name="clinical_history"),
    path("api/opd/follow-ups/", opd_views.follow_ups, name="follow_ups"),
    path("api/reports/collection/", collection_report, name="collection_report"),
    path("api/", include(router.urls)),
]
