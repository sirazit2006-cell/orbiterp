from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel


class Department(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=10, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Doctor(TimeStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="doctor_profile")
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="doctors")
    specialization = models.CharField(max_length=100, blank=True)
    qualification = models.CharField(max_length=150, blank=True)
    registration_no = models.CharField("medical registration no.", max_length=50, unique=True)
    first_visit_fee = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    follow_up_fee = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    follow_up_days = models.PositiveSmallIntegerField(default=7)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["user__first_name", "user__last_name"]

    def __str__(self):
        return f"Dr. {self.user.get_full_name() or self.user.username}"


class Medicine(TimeStampedModel):
    """Simple medicine list for prescriptions. Becomes the pharmacy item master in a later phase."""

    class Form(models.TextChoices):
        TABLET = "tablet", "Tablet"
        CAPSULE = "capsule", "Capsule"
        SYRUP = "syrup", "Syrup"
        INJECTION = "injection", "Injection"
        DROPS = "drops", "Drops"
        OINTMENT = "ointment", "Ointment / cream"
        INHALER = "inhaler", "Inhaler"
        OTHER = "other", "Other"

    name = models.CharField(max_length=150)
    generic_name = models.CharField(max_length=150, blank=True)
    form = models.CharField(max_length=12, choices=Form.choices, default=Form.TABLET)
    strength = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["name", "strength", "form"], name="uniq_medicine")]

    def __str__(self):
        return " ".join(p for p in [self.name, self.strength] if p)


class Service(TimeStampedModel):
    """A chargeable item in the hospital tariff: consultation, procedure, lab test, scan."""

    class Category(models.TextChoices):
        CONSULTATION = "consultation", "Consultation"
        REGISTRATION = "registration", "Registration"
        PROCEDURE = "procedure", "Procedure"
        LAB = "lab", "Laboratory test"
        RADIOLOGY = "radiology", "Radiology"
        OTHER = "other", "Other"

    class TaxCode(models.TextChoices):
        EXEMPT = "exempt", "GST exempt"
        GST_5 = "gst5", "GST 5%"
        GST_12 = "gst12", "GST 12%"
        GST_18 = "gst18", "GST 18%"

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=150)
    category = models.CharField(max_length=15, choices=Category.choices)
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    tax_code = models.CharField(max_length=6, choices=TaxCode.choices, default=TaxCode.EXEMPT)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["category", "name"]

    def __str__(self):
        return f"{self.name} ({self.code})"
