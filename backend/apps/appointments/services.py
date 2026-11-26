"""Booking rules for appointments, kept out of the views so they can be tested directly."""

from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.models import Sequence
from apps.masters.models import Doctor

from .models import Appointment, DoctorLeave, DoctorSchedule


def on_leave(doctor, date):
    return DoctorLeave.objects.filter(doctor=doctor, from_date__lte=date, to_date__gte=date).exists()


def sessions_for(doctor, date):
    return DoctorSchedule.objects.filter(doctor=doctor, weekday=date.weekday(), is_active=True).order_by("start_time")


def available_slots(doctor, date):
    """Every slot of the doctor's sessions on ``date``, each marked free or taken.

    Returns a list of sessions: {"session": id, "start", "end", "full", "slots": [{"time", "available"}]}.
    """
    if on_leave(doctor, date):
        return []
    taken = set(
        Appointment.objects.filter(doctor=doctor, date=date, status__in=Appointment.ACTIVE, slot_time__isnull=False)
        .values_list("slot_time", flat=True)
    )
    now = timezone.localtime()
    result = []
    for session in sessions_for(doctor, date):
        times = session.slot_times()
        booked_in_session = sum(1 for t in taken if session.start_time <= t < session.end_time)
        full = session.max_patients is not None and booked_in_session >= session.max_patients
        slots = []
        for t in times:
            past = date < now.date() or (date == now.date() and t <= now.time())
            slots.append({"time": t.strftime("%H:%M"), "available": not (full or past or t in taken)})
        result.append(
            {
                "session": session.id,
                "start": session.start_time.strftime("%H:%M"),
                "end": session.end_time.strftime("%H:%M"),
                "full": full,
                "slots": slots,
            }
        )
    return result


def visit_type_for(patient, doctor, date):
    """Follow-up if the patient completed a visit with this doctor within the doctor's follow-up window."""
    window_start = date - timedelta(days=doctor.follow_up_days)
    recent = Appointment.objects.filter(
        patient=patient,
        doctor=doctor,
        status=Appointment.Status.COMPLETED,
        date__gte=window_start,
        date__lt=date,
    ).exists()
    return Appointment.VisitType.FOLLOW_UP if recent else Appointment.VisitType.NEW


def _check_slot(doctor, date, slot_time, exclude_id=None):
    if on_leave(doctor, date):
        raise ValidationError({"date": "The doctor is on leave that day."})
    session = next(
        (s for s in sessions_for(doctor, date) if s.start_time <= slot_time < s.end_time and slot_time in s.slot_times()),
        None,
    )
    if session is None:
        raise ValidationError({"slot_time": "The doctor has no OPD slot at that time."})
    if datetime.combine(date, slot_time) <= timezone.localtime().replace(tzinfo=None):
        raise ValidationError({"slot_time": "That slot is already in the past."})
    active = Appointment.objects.filter(doctor=doctor, date=date, status__in=Appointment.ACTIVE).exclude(pk=exclude_id)
    if active.filter(slot_time=slot_time).exists():
        raise ValidationError({"slot_time": "That slot is already booked."})
    if session.max_patients is not None:
        in_session = active.filter(slot_time__gte=session.start_time, slot_time__lt=session.end_time).count()
        if in_session >= session.max_patients:
            raise ValidationError({"slot_time": "This session is full."})


def _next_token(doctor, date):
    return Sequence.next_value(f"token-{doctor.pk}", date.isoformat())


@transaction.atomic
def book(*, patient, doctor, date, slot_time=None, source=Appointment.Source.PHONE, reason="", user=None):
    # Lock the doctor row so two desks cannot book the same slot at the same moment.
    doctor = Doctor.objects.select_for_update().get(pk=doctor.pk)
    if not doctor.is_active:
        raise ValidationError({"doctor": "This doctor is not active."})
    if not patient.is_active:
        raise ValidationError({"patient": "This patient record is inactive."})
    if Appointment.objects.filter(
        patient=patient, doctor=doctor, date=date, status__in=[Appointment.Status.BOOKED, Appointment.Status.CHECKED_IN]
    ).exists():
        raise ValidationError({"patient": "This patient already has an open appointment with this doctor that day."})

    walk_in = source == Appointment.Source.WALK_IN
    if walk_in:
        if date != timezone.localdate():
            raise ValidationError({"date": "Walk-ins can only be registered for today."})
        if on_leave(doctor, date):
            raise ValidationError({"date": "The doctor is on leave today."})
        slot_time = None
    else:
        if slot_time is None:
            raise ValidationError({"slot_time": "Choose a slot."})
        _check_slot(doctor, date, slot_time)

    appt = Appointment(
        patient=patient,
        doctor=doctor,
        date=date,
        slot_time=slot_time,
        source=source,
        reason=reason,
        visit_type=visit_type_for(patient, doctor, date),
        created_by=user,
        updated_by=user,
    )
    if walk_in:
        appt.status = Appointment.Status.CHECKED_IN
        appt.checked_in_at = timezone.now()
        appt.token_no = _next_token(doctor, date)
    appt.save()
    return appt


@transaction.atomic
def reschedule(appt, *, date, slot_time, user=None):
    if appt.status != Appointment.Status.BOOKED:
        raise ValidationError({"status": "Only a booked appointment can be rescheduled."})
    Doctor.objects.select_for_update().get(pk=appt.doctor_id)
    _check_slot(appt.doctor, date, slot_time, exclude_id=appt.pk)
    appt.date = date
    appt.slot_time = slot_time
    appt.needs_reschedule = False
    appt.visit_type = visit_type_for(appt.patient, appt.doctor, date)
    appt.updated_by = user
    appt.save()
    return appt


@transaction.atomic
def transition(appt, action, *, user=None, cancel_reason=""):
    allowed_from, target = Appointment.TRANSITIONS[action]
    appt = Appointment.objects.select_for_update().get(pk=appt.pk)
    if appt.status not in allowed_from:
        raise ValidationError({"status": f"Cannot {action.replace('_', ' ')} an appointment that is {appt.get_status_display().lower()}."})
    now = timezone.now()
    if action == "check_in":
        if appt.date != timezone.localdate():
            raise ValidationError({"date": "Patients can only be checked in on the day of the appointment."})
        appt.token_no = _next_token(appt.doctor, appt.date)
        appt.checked_in_at = now
    elif action == "start":
        appt.started_at = now
    elif action == "complete":
        if not hasattr(appt, "consultation"):
            raise ValidationError({"detail": "Save the consultation notes before completing the visit."})
        appt.completed_at = now
        appt.started_at = appt.started_at or now
    elif action == "cancel":
        if not cancel_reason.strip():
            raise ValidationError({"cancel_reason": "Give a reason for cancelling."})
        appt.cancel_reason = cancel_reason.strip()
    appt.status = target
    appt.updated_by = user
    appt.save()
    return appt


def flag_leave_conflicts(leave):
    """Mark booked appointments that fall inside a new leave so reception can move them."""
    return Appointment.objects.filter(
        doctor=leave.doctor,
        date__gte=leave.from_date,
        date__lte=leave.to_date,
        status=Appointment.Status.BOOKED,
    ).update(needs_reschedule=True)


def refresh_leave_flags(doctor):
    """Clear the reschedule flag on bookings no longer covered by any of the doctor's leave."""
    flagged = Appointment.objects.filter(doctor=doctor, needs_reschedule=True, status=Appointment.Status.BOOKED)
    for appt in flagged:
        if not on_leave(doctor, appt.date):
            appt.needs_reschedule = False
            appt.save(update_fields=["needs_reschedule", "updated_at"])


def future_bookings_in_session(session):
    """How many upcoming booked appointments fall inside a weekly session."""
    upcoming = Appointment.objects.filter(
        doctor=session.doctor,
        date__gte=timezone.localdate(),
        status=Appointment.Status.BOOKED,
        slot_time__gte=session.start_time,
        slot_time__lt=session.end_time,
    ).only("date")
    return sum(1 for a in upcoming if a.date.weekday() == session.weekday)
