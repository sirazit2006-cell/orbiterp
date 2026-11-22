from rest_framework import viewsets

from apps.core.audit import AuditedViewSetMixin
from apps.core.permissions import role_permission

from .models import Department, Doctor
from .serializers import DepartmentSerializer, DoctorSerializer

# Every signed-in role needs to read the masters; only admins change them.
StaffReadAdminWrite = role_permission(read=("reception", "nurse", "doctor", "cashier"))


class DepartmentViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["is_active"]
    search_fields = ["name", "code"]
    http_method_names = ["get", "post", "patch", "head", "options"]


class DoctorViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    queryset = Doctor.objects.select_related("user", "department")
    serializer_class = DoctorSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["department", "is_active"]
    search_fields = ["user__first_name", "user__last_name", "specialization", "registration_no"]
    http_method_names = ["get", "post", "patch", "head", "options"]
