from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.core import views as core_views
from apps.masters.views import DepartmentViewSet, DoctorViewSet
from apps.patients.views import PatientViewSet

router = DefaultRouter()
router.register("users", core_views.UserViewSet)
router.register("audit-logs", core_views.AuditLogViewSet)
router.register("departments", DepartmentViewSet)
router.register("doctors", DoctorViewSet)
router.register("patients", PatientViewSet)


def health(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", core_views.me, name="me"),
    path("api/roles/", core_views.roles, name="roles"),
    path("api/", include(router.urls)),
]
