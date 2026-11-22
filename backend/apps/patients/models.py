from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

from apps.core.models import Sequence, TimeStampedModel

mobile_validator = RegexValidator(r"^[6-9]\d{9}$", "Enter a 10-digit Indian mobile number.")
pin_validator = RegexValidator(r"^\d{6}$", "Enter a 6-digit PIN code.")


class Patient(TimeStampedModel):
    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"
        OTHER = "O", "Other"

    class BloodGroup(models.TextChoices):
        A_POS = "A+", "A+"
        A_NEG = "A-", "A-"
        B_POS = "B+", "B+"
        B_NEG = "B-", "B-"
        AB_POS = "AB+", "AB+"
        AB_NEG = "AB-", "AB-"
        O_POS = "O+", "O+"
        O_NEG = "O-", "O-"

    uhid = models.CharField("UHID", max_length=32, unique=True, editable=False)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True)
    gender = models.CharField(max_length=1, choices=Gender.choices)
    date_of_birth = models.DateField(null=True, blank=True)
    age_years = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text="Used when the exact date of birth is not known."
    )
    mobile = models.CharField(max_length=10, validators=[mobile_validator], db_index=True)
    email = models.EmailField(blank=True)
    address_line = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pin_code = models.CharField(max_length=6, validators=[pin_validator])
    blood_group = models.CharField(max_length=3, choices=BloodGroup.choices, blank=True)
    emergency_contact_name = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True)
    id_proof_type = models.CharField(max_length=30, blank=True)
    id_proof_number = models.CharField(max_length=50, blank=True)
    abha_number = models.CharField("ABHA number", max_length=17, blank=True)
    consent_given_at = models.DateTimeField(help_text="When the patient agreed to the use of their data.")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["first_name", "last_name"])]

    def __str__(self):
        return f"{self.uhid} {self.full_name}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def age(self):
        if self.date_of_birth:
            today = timezone.localdate()
            dob = self.date_of_birth
            return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return self.age_years

    def save(self, *args, **kwargs):
        if not self.uhid:
            year = timezone.localdate().year
            number = Sequence.next_value("uhid", str(year))
            self.uhid = f"{settings.HOSPITAL_CODE}-{year}-{number:06d}"
        super().save(*args, **kwargs)
