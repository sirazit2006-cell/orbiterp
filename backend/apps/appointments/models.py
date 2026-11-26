from datetime import datetime, timedelta

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel
from apps.masters.models import Doctor
from apps.patients.models import Patient


class Weekday(models.IntegerChoices):
    MONDAY = 0, "Monday"
    TUESDAY = 1, "Tuesday"
    WEDNESDAY = 2, "Wednesday"
    THURSDAY = 3, "Thursday"
    FRIDAY = 4, "Friday"
    SATURDAY = 5, "Saturday"
    SUNDAY = 6, "Sunday"


class DoctorSchedule(TimeStampedModel):
    """One OPD session in a doctor's weekly template, e.g. Monday 10:00-13:00 in 15-minute slots."""

    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="schedules")
    weekday = models.PositiveSmallIntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_minutes = models.PositiveSmallIntegerField(default=15, validators=[MinValueValidator(5), MaxValueValidator(120)])
    max_patients = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text="Cap on booked patients for this session; empty means one per slot."
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["doctor", "weekday", "start_time"]

    def __str__(self):
        return f"{self.doctor} {self.get_weekday_display()} {self.start_time:%H:%M}-{self.end_time:%H:%M}"

    def clean(self):
        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValidationError({"end_time": "The session must end after it starts."})
        overlapping = DoctorSchedule.objects.filter(
            doctor=self.doctor_id, weekday=self.weekday, is_active=True,
            start_time__lt=self.end_time, end_time__gt=self.start_time,
        ).exclude(pk=self.pk)
        if self.is_active and overlapping.exists():
            raise ValidationError("This session overlaps another session for the same doctor and day.")

    def slot_times(self):
        """Start times of every slot in this session."""
        day = datetime(2000, 1, 1)
        current = datetime.combine(day, self.start_time)
        end = datetime.combine(day, self.end_time)
        step = timedelta(minutes=self.slot_minutes)
        times = []
        while current + step <= end:
            times.append(current.time())
            current += step
        return times


class DoctorLeave(TimeStampedModel):
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="leaves")
    from_date = models.DateField()
    to_date = models.DateField()
    reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-from_date"]

    def __str__(self):
        return f"{self.doctor} on leave {self.from_date} to {self.to_date}"

    def clean(self):
        if self.from_date and self.to_date and self.from_date > self.to_date:
            raise ValidationError({"to_date": "The leave must end on or after its first day."})


class Appointment(TimeStampedModel):
    class Status(models.TextChoices):
        BOOKED = "booked", "Booked"
        CHECKED_IN = "checked_in", "Checked in"
        WITH_DOCTOR = "with_doctor", "With doctor"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        NO_SHOW = "no_show", "No-show"

    class Source(models.TextChoices):
        PHONE = "phone", "Phone / desk booking"
        WALK_IN = "walk_in", "Walk-in"

    class VisitType(models.TextChoices):
        NEW = "new", "First visit"
        FOLLOW_UP = "follow_up", "Follow-up"

    # Which status can move to which, and which role may make the move.
    TRANSITIONS = {
        "check_in": ({Status.BOOKED}, Status.CHECKED_IN),
        "start": ({Status.CHECKED_IN}, Status.WITH_DOCTOR),
        "complete": ({Status.WITH_DOCTOR, Status.CHECKED_IN}, Status.COMPLETED),
        "cancel": ({Status.BOOKED, Status.CHECKED_IN}, Status.CANCELLED),
        "no_show": ({Status.BOOKED}, Status.NO_SHOW),
    }
    ACTIVE = (Status.BOOKED, Status.CHECKED_IN, Status.WITH_DOCTOR, Status.COMPLETED)

    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="appointments")
    doctor = models.ForeignKey(Doctor, on_delete=models.PROTECT, related_name="appointments")
    date = models.DateField(db_index=True)
    slot_time = models.TimeField(null=True, blank=True, help_text="Empty for walk-ins.")
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.PHONE)
    visit_type = models.CharField(max_length=10, choices=VisitType.choices, default=VisitType.NEW)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.BOOKED, db_index=True)
    token_no = models.PositiveIntegerField(null=True, blank=True)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    reason = models.CharField("reason for visit", max_length=255, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)
    needs_reschedule = models.BooleanField(default=False, help_text="Set when the doctor goes on leave that day.")

    class Meta:
        ordering = ["date", "slot_time", "token_no"]
        indexes = [models.Index(fields=["doctor", "date", "status"])]

    def __str__(self):
        when = f"{self.slot_time:%H:%M}" if self.slot_time else "walk-in"
        return f"{self.patient.uhid} with {self.doctor} on {self.date} {when}"
