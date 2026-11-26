from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from apps.appointments.models import Appointment
from apps.core.models import TimeStampedModel
from apps.masters.models import Doctor, Medicine, Service

LOCK_AFTER = timedelta(hours=24)


class Vitals(TimeStampedModel):
    """Recorded by the nurse (or doctor) before the consultation. One set per visit."""

    appointment = models.OneToOneField(Appointment, on_delete=models.PROTECT, related_name="vitals")
    height_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True,
                                    validators=[MinValueValidator(20), MaxValueValidator(250)])
    weight_kg = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True,
                                    validators=[MinValueValidator(Decimal("0.5")), MaxValueValidator(350)])
    temperature_f = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True,
                                        validators=[MinValueValidator(90), MaxValueValidator(110)])
    pulse = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(20), MaxValueValidator(250)])
    bp_systolic = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(50), MaxValueValidator(260)])
    bp_diastolic = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(30), MaxValueValidator(160)])
    spo2 = models.PositiveSmallIntegerField("SpO2 %", null=True, blank=True, validators=[MinValueValidator(50), MaxValueValidator(100)])
    respiratory_rate = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(5), MaxValueValidator(60)])
    blood_sugar = models.PositiveSmallIntegerField("random blood sugar mg/dL", null=True, blank=True,
                                                   validators=[MinValueValidator(20), MaxValueValidator(700)])
    allergies = models.CharField(max_length=255, blank=True)
    chief_complaint = models.CharField(max_length=255, blank=True)

    @property
    def bmi(self):
        if self.height_cm and self.weight_kg:
            metres = Decimal(self.height_cm) / 100
            return round(Decimal(self.weight_kg) / (metres * metres), 1)
        return None


class Consultation(TimeStampedModel):
    appointment = models.OneToOneField(Appointment, on_delete=models.PROTECT, related_name="consultation")
    complaints = models.TextField(blank=True)
    history = models.TextField(blank=True)
    examination = models.TextField(blank=True)
    advice = models.TextField(blank=True)
    follow_up_date = models.DateField(null=True, blank=True)
    referral_doctor = models.ForeignKey(Doctor, null=True, blank=True, on_delete=models.PROTECT, related_name="referrals_in")
    referral_note = models.CharField(max_length=255, blank=True)

    @property
    def locked_at(self):
        done = self.appointment.completed_at
        return done + LOCK_AFTER if done else None

    @property
    def is_locked(self):
        return self.locked_at is not None and timezone.now() >= self.locked_at


class Diagnosis(models.Model):
    consultation = models.ForeignKey(Consultation, on_delete=models.CASCADE, related_name="diagnoses")
    text = models.CharField(max_length=255)
    icd10_code = models.CharField("ICD-10 code", max_length=10, blank=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]


class PrescriptionItem(models.Model):
    class Route(models.TextChoices):
        ORAL = "oral", "Oral"
        TOPICAL = "topical", "Topical"
        IV = "iv", "IV"
        IM = "im", "IM"
        SC = "sc", "Subcutaneous"
        INHALED = "inhaled", "Inhaled"
        EYE = "eye", "Eye"
        EAR = "ear", "Ear"
        NASAL = "nasal", "Nasal"
        OTHER = "other", "Other"

    consultation = models.ForeignKey(Consultation, on_delete=models.CASCADE, related_name="prescriptions")
    medicine = models.ForeignKey(Medicine, null=True, blank=True, on_delete=models.PROTECT)
    medicine_name = models.CharField(max_length=200, help_text="As printed; kept even if the master changes.")
    dose = models.CharField(max_length=50, blank=True)
    frequency = models.CharField(max_length=50, help_text="e.g. 1-0-1")
    duration = models.CharField(max_length=50, help_text="e.g. 5 days")
    route = models.CharField(max_length=10, choices=Route.choices, default=Route.ORAL)
    instructions = models.CharField(max_length=255, blank=True, help_text="e.g. after food")
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]


class InvestigationOrder(models.Model):
    class Status(models.TextChoices):
        ORDERED = "ordered", "Ordered"
        BILLED = "billed", "Billed"
        CANCELLED = "cancelled", "Cancelled"

    consultation = models.ForeignKey(Consultation, on_delete=models.CASCADE, related_name="investigations")
    service = models.ForeignKey(Service, on_delete=models.PROTECT)
    notes = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ORDERED)

    class Meta:
        ordering = ["id"]


class Amendment(models.Model):
    """A dated addition to a locked consultation. The original record is never changed."""

    consultation = models.ForeignKey(Consultation, on_delete=models.PROTECT, related_name="amendments")
    text = models.TextField()
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
