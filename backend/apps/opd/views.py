from django.db.models import Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.appointments.models import Appointment
from apps.core.audit import snapshot, write_audit
from apps.core.models import AuditLog
from apps.patients.models import Patient

from .models import Amendment, Consultation, Vitals
from .serializers import AmendmentSerializer, ConsultationSerializer, VitalsSerializer

ALL_STAFF = ("admin", "reception", "nurse", "doctor", "cashier")


def _doctor(user):
    return getattr(user, "doctor_profile", None) if user.has_role("doctor") else None


def treats_patient(user, patient):
    """Admins, and doctors who have seen or been referred the patient, may read clinical records."""
    if user.has_role("admin"):
        return True
    doctor = _doctor(user)
    if not doctor:
        return False
    return (
        Appointment.objects.filter(patient=patient, doctor=doctor).exists()
        or Consultation.objects.filter(appointment__patient=patient, referral_doctor=doctor).exists()
    )


def _appointment(request, pk):
    appt = get_object_or_404(Appointment.objects.select_related("patient", "doctor__user"), pk=pk)
    if not request.user.has_role(*ALL_STAFF):
        raise PermissionDenied()
    return appt


@api_view(["GET", "PUT"])
def vitals(request, pk):
    appt = _appointment(request, pk)
    instance = Vitals.objects.filter(appointment=appt).first()
    if request.method == "GET":
        if not instance:
            return Response(None)
        return Response(VitalsSerializer(instance).data)

    user = request.user
    own_doctor = _doctor(user) == appt.doctor
    if not (user.has_role("admin", "nurse") or own_doctor):
        raise PermissionDenied("Only nurses and the patient's doctor record vitals.")
    if appt.status not in (Appointment.Status.CHECKED_IN, Appointment.Status.WITH_DOCTOR):
        raise ValidationError({"status": "Vitals are recorded after check-in and before the visit is completed."})
    serializer = VitalsSerializer(instance, data=request.data, partial=bool(instance))
    serializer.is_valid(raise_exception=True)
    before = snapshot(instance) if instance else None
    saved = serializer.save(appointment=appt, updated_by=user, **({} if instance else {"created_by": user}))
    write_audit(request, AuditLog.Action.UPDATE if before else AuditLog.Action.CREATE, saved, {"after": snapshot(saved)})
    return Response(VitalsSerializer(saved).data, status=status.HTTP_200_OK if before else status.HTTP_201_CREATED)


@api_view(["GET", "PUT"])
def consultation(request, pk):
    appt = _appointment(request, pk)
    user = request.user
    instance = Consultation.objects.filter(appointment=appt).first()

    if request.method == "GET":
        if not treats_patient(user, appt.patient):
            raise PermissionDenied("Clinical notes are visible only to the patient's doctors.")
        if instance:
            write_audit(request, AuditLog.Action.VIEW, instance)
        return Response(ConsultationSerializer(instance).data if instance else None)

    if _doctor(user) != appt.doctor:
        raise PermissionDenied("Only the patient's doctor can write the consultation.")
    if appt.status not in (Appointment.Status.WITH_DOCTOR, Appointment.Status.COMPLETED):
        raise ValidationError({"status": "Call the patient in before writing the consultation."})
    if instance and instance.is_locked:
        raise ValidationError({"detail": "This consultation is locked. Add an amendment instead."})
    serializer = ConsultationSerializer(instance, data=request.data, context={"appointment": appt})
    serializer.is_valid(raise_exception=True)
    saved, created = serializer.save_for(appt, user)
    write_audit(
        request, AuditLog.Action.CREATE if created else AuditLog.Action.UPDATE, saved,
        {"diagnoses": [d.text for d in saved.diagnoses.all()], "prescriptions": saved.prescriptions.count()},
    )
    return Response(ConsultationSerializer(saved).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class AmendInput(serializers.Serializer):
    text = serializers.CharField(max_length=5000)


@api_view(["POST"])
def amend(request, pk):
    appt = _appointment(request, pk)
    if _doctor(request.user) != appt.doctor:
        raise PermissionDenied("Only the patient's doctor can amend the consultation.")
    consultation = get_object_or_404(Consultation, appointment=appt)
    body = AmendInput(data=request.data)
    body.is_valid(raise_exception=True)
    amendment = Amendment.objects.create(consultation=consultation, text=body.validated_data["text"], author=request.user)
    write_audit(request, AuditLog.Action.CREATE, amendment, {"text": amendment.text})
    return Response(AmendmentSerializer(amendment).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def clinical_history(request, pk):
    """Every past visit of a patient with vitals and consultation, newest first."""
    patient = get_object_or_404(Patient, pk=pk)
    if not treats_patient(request.user, patient):
        raise PermissionDenied("Clinical history is visible only to the patient's doctors.")
    visits = (
        Appointment.objects.filter(patient=patient)
        .filter(Q(vitals__isnull=False) | Q(consultation__isnull=False))
        .select_related("doctor__user", "doctor__department", "vitals", "consultation")
        .prefetch_related("consultation__diagnoses", "consultation__prescriptions", "consultation__investigations__service", "consultation__amendments__author")
        .order_by("-date", "-id")
        .distinct()
    )
    write_audit(request, AuditLog.Action.VIEW, patient, {"history": True})
    rows = []
    for v in visits[:50]:
        vit = getattr(v, "vitals", None)
        con = getattr(v, "consultation", None)
        rows.append(
            {
                "appointment": v.id,
                "date": v.date,
                "doctor_name": str(v.doctor),
                "department_name": v.doctor.department.name,
                "status": v.status,
                "vitals": VitalsSerializer(vit).data if vit else None,
                "consultation": ConsultationSerializer(con).data if con else None,
            }
        )
    return Response(rows)


@api_view(["GET"])
def follow_ups(request):
    """Patients whose doctor asked them back on ``date`` and who have no appointment with that doctor yet."""
    if not request.user.has_role("admin", "reception"):
        raise PermissionDenied()
    date = parse_date(request.query_params.get("date", "")) or timezone.localdate()
    booked = Appointment.objects.filter(
        patient=OuterRef("appointment__patient"),
        doctor=OuterRef("appointment__doctor"),
        date__gte=date,
    ).exclude(status__in=[Appointment.Status.CANCELLED, Appointment.Status.NO_SHOW])
    due = (
        Consultation.objects.filter(follow_up_date=date)
        .annotate(already_booked=Exists(booked))
        .filter(already_booked=False)
        .select_related("appointment__patient", "appointment__doctor__user")
    )
    return Response(
        [
            {
                "patient": c.appointment.patient_id,
                "patient_name": c.appointment.patient.full_name,
                "patient_uhid": c.appointment.patient.uhid,
                "patient_mobile": c.appointment.patient.mobile,
                "doctor": c.appointment.doctor_id,
                "doctor_name": str(c.appointment.doctor),
                "follow_up_date": c.follow_up_date,
                "last_visit": c.appointment.date,
            }
            for c in due
        ]
    )


@api_view(["GET"])
def hospital(request):
    from django.conf import settings

    return Response(
        {
            "name": settings.HOSPITAL_NAME,
            "address": settings.HOSPITAL_ADDRESS,
            "phone": settings.HOSPITAL_PHONE,
            "gstin": settings.HOSPITAL_GSTIN,
        }
    )
