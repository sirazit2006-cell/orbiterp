from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.core.audit import AuditedViewSetMixin, write_audit
from apps.core.models import AuditLog
from apps.core.permissions import role_permission
from apps.masters.models import Doctor

from . import services
from .models import Appointment, DoctorLeave, DoctorSchedule
from .serializers import (
    AppointmentSerializer,
    CancelSerializer,
    DoctorLeaveSerializer,
    DoctorScheduleSerializer,
    RescheduleSerializer,
)

ALL_STAFF = ("reception", "nurse", "doctor", "cashier")
StaffReadAdminWrite = role_permission(read=ALL_STAFF)
AppointmentPermission = role_permission(read=ALL_STAFF, write=("reception",))


def _date_param(request, name="date", default_today=True):
    raw = request.query_params.get(name)
    if not raw:
        return timezone.localdate() if default_today else None
    value = parse_date(raw)
    if value is None:
        raise ValidationError({name: "Use the format YYYY-MM-DD."})
    return value


class DoctorScheduleViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    queryset = DoctorSchedule.objects.select_related("doctor__user")
    serializer_class = DoctorScheduleSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["doctor", "weekday", "is_active"]
    pagination_class = None

    def perform_destroy(self, instance):
        upcoming = services.future_bookings_in_session(instance)
        if upcoming:
            raise ValidationError(
                {"detail": f"{upcoming} upcoming appointment(s) use this session. Switch it off instead, or move them first."}
            )
        super().perform_destroy(instance)


class DoctorLeaveViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    queryset = DoctorLeave.objects.select_related("doctor__user")
    serializer_class = DoctorLeaveSerializer
    permission_classes = [StaffReadAdminWrite]
    filterset_fields = ["doctor"]

    def perform_create(self, serializer):
        super().perform_create(serializer)
        serializer.instance.flagged_appointments = services.flag_leave_conflicts(serializer.instance)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        services.refresh_leave_flags(serializer.instance.doctor)
        serializer.instance.flagged_appointments = services.flag_leave_conflicts(serializer.instance)

    def perform_destroy(self, instance):
        doctor = instance.doctor
        super().perform_destroy(instance)
        services.refresh_leave_flags(doctor)


@api_view(["GET"])
def doctor_slots(request, pk):
    """Free and taken slots for one doctor on one date (default today)."""
    doctor = get_object_or_404(Doctor, pk=pk)
    date = _date_param(request)
    return Response(
        {
            "doctor": doctor.pk,
            "date": date,
            "on_leave": services.on_leave(doctor, date),
            "sessions": services.available_slots(doctor, date),
        }
    )


class AppointmentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Appointments are created and moved only through booking rules; there is no free-form edit or delete."""

    serializer_class = AppointmentSerializer
    permission_classes = [AppointmentPermission]
    filterset_fields = {
        "doctor": ["exact"],
        "patient": ["exact"],
        "status": ["exact", "in"],
        "date": ["exact", "gte", "lte"],
        "needs_reschedule": ["exact"],
        "source": ["exact"],
    }
    search_fields = ["patient__first_name", "patient__last_name", "patient__uhid", "patient__mobile"]
    ordering_fields = ["date", "slot_time", "token_no", "created_at"]

    def get_queryset(self):
        qs = Appointment.objects.select_related("patient", "doctor__user", "doctor__department")
        user = self.request.user
        # A doctor with no other role sees only their own appointments.
        if not user.has_role("admin", "reception", "nurse", "cashier"):
            profile = getattr(user, "doctor_profile", None)
            qs = qs.filter(doctor=profile) if profile else qs.none()
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        appt = services.book(
            patient=data["patient"],
            doctor=data["doctor"],
            date=data["date"],
            slot_time=data.get("slot_time"),
            source=data.get("source", Appointment.Source.PHONE),
            reason=data.get("reason", ""),
            user=request.user,
        )
        write_audit(request, AuditLog.Action.CREATE, appt, {"status": appt.status, "date": str(appt.date)})
        return Response(self.get_serializer(appt).data, status=status.HTTP_201_CREATED)

    def _move(self, request, name, **kwargs):
        appt = self.get_object()
        before = appt.status
        appt = services.transition(appt, name, user=request.user, **kwargs)
        write_audit(request, AuditLog.Action.UPDATE, appt, {"status": {"from": before, "to": appt.status}})
        return Response(self.get_serializer(appt).data)

    def _require_doctor_or_admin(self, appt):
        user = self.request.user
        if user.has_role("admin"):
            return
        if user.has_role("doctor") and getattr(user, "doctor_profile", None) == appt.doctor:
            return
        raise PermissionDenied("Only the patient's doctor can do this.")

    @action(detail=True, methods=["post"])
    def check_in(self, request, pk=None):
        return self._move(request, "check_in")

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        body = CancelSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        return self._move(request, "cancel", cancel_reason=body.validated_data["cancel_reason"])

    @action(detail=True, methods=["post"])
    def no_show(self, request, pk=None):
        return self._move(request, "no_show")

    @action(detail=True, methods=["post"])
    def reschedule(self, request, pk=None):
        body = RescheduleSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        appt = self.get_object()
        before = {"date": str(appt.date), "slot_time": str(appt.slot_time)}
        appt = services.reschedule(appt, user=request.user, **body.validated_data)
        write_audit(
            request, AuditLog.Action.UPDATE, appt,
            {"rescheduled": {"from": before, "to": {"date": str(appt.date), "slot_time": str(appt.slot_time)}}},
        )
        return Response(self.get_serializer(appt).data)

    # Doctor actions: a doctor (not reception) moves patients through the consultation.
    @action(detail=True, methods=["post"], permission_classes=[role_permission(read=ALL_STAFF, write=("doctor",))])
    def start(self, request, pk=None):
        self._require_doctor_or_admin(self.get_object())
        return self._move(request, "start")

    @action(detail=True, methods=["post"], permission_classes=[role_permission(read=ALL_STAFF, write=("doctor",))])
    def complete(self, request, pk=None):
        self._require_doctor_or_admin(self.get_object())
        return self._move(request, "complete")

    @action(detail=False, methods=["get"])
    def queue(self, request):
        """Today's token queue for one doctor: who is with the doctor, who is waiting, who is done."""
        doctor_id = request.query_params.get("doctor")
        if not doctor_id:
            profile = getattr(request.user, "doctor_profile", None)
            if not profile:
                raise ValidationError({"doctor": "Choose a doctor."})
            doctor_id = profile.pk
        date = _date_param(request)
        qs = self.get_queryset().filter(doctor_id=doctor_id, date=date, token_no__isnull=False).order_by("token_no")
        rows = self.get_serializer(qs, many=True).data
        by_status = lambda s: [r for r in rows if r["status"] == s]  # noqa: E731
        return Response(
            {
                "doctor": int(doctor_id),
                "date": date,
                "current": by_status(Appointment.Status.WITH_DOCTOR),
                "waiting": by_status(Appointment.Status.CHECKED_IN),
                "done": by_status(Appointment.Status.COMPLETED),
            }
        )
