from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.audit import AuditedViewSetMixin
from apps.core.permissions import role_permission

from .models import Patient
from .serializers import PatientListSerializer, PatientSerializer

PatientPermission = role_permission(read=("nurse", "doctor", "cashier"), write=("reception",))


class PatientViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """Patients are never deleted; set is_active to false instead."""

    queryset = Patient.objects.all()
    permission_classes = [PatientPermission]
    filterset_fields = ["gender", "is_active", "city"]
    http_method_names = ["get", "post", "patch", "head", "options"]
    audit_views = True

    def get_serializer_class(self):
        return PatientListSerializer if self.action == "list" else PatientSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("q", "").strip()
        if q:
            terms = q.split()
            if q.isdigit():
                qs = qs.filter(Q(mobile__startswith=q) | Q(uhid__endswith=q))
            elif "-" in q:  # looks like a UHID
                qs = qs.filter(uhid__iexact=q)
            else:
                for term in terms:
                    qs = qs.filter(Q(first_name__istartswith=term) | Q(last_name__istartswith=term))
        return qs

    @action(detail=False, methods=["get"])
    def duplicates(self, request):
        """Possible existing records for the same person, shown before a new registration is saved."""
        mobile = request.query_params.get("mobile", "").strip()
        first_name = request.query_params.get("first_name", "").strip()
        dob = request.query_params.get("date_of_birth", "").strip()
        if not mobile and not (first_name and dob):
            return Response([])
        filters = Q()
        if mobile:
            filters |= Q(mobile=mobile)
        if first_name and dob:
            filters |= Q(first_name__iexact=first_name, date_of_birth=dob)
        matches = Patient.objects.filter(filters, is_active=True)[:10]
        return Response(PatientListSerializer(matches, many=True).data)
