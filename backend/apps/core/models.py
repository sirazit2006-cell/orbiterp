from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models, transaction
from django.utils import timezone


class Role(models.TextChoices):
    ADMIN = "admin", "Admin"
    RECEPTION = "reception", "Reception"
    NURSE = "nurse", "Nurse"
    DOCTOR = "doctor", "Doctor"
    CASHIER = "cashier", "Billing cashier"


class User(AbstractUser):
    """A staff member. Roles are stored as a list so one person can hold several."""

    roles = models.JSONField(default=list, blank=True)
    phone = models.CharField(max_length=15, blank=True)

    def has_role(self, *roles):
        if self.is_superuser:
            return True
        return any(role in self.roles for role in roles)

    def clean(self):
        super().clean()
        valid = set(Role.values)
        self.roles = sorted({r for r in self.roles if r in valid})


class TimeStampedModel(models.Model):
    """Who created or last changed a row, and when."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        abstract = True


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = "create", "Create"
        UPDATE = "update", "Update"
        DELETE = "delete", "Delete"
        VIEW = "view", "View"

    at = models.DateTimeField(default=timezone.now, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")
    action = models.CharField(max_length=10, choices=Action.choices)
    table = models.CharField(max_length=64, db_index=True)
    record_id = models.CharField(max_length=64, db_index=True)
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-at"]

    def __str__(self):
        return f"{self.at:%Y-%m-%d %H:%M} {self.user} {self.action} {self.table}#{self.record_id}"


class Sequence(models.Model):
    """Gap-free counters for UHIDs, bill numbers and receipts, one row per name and period."""

    name = models.CharField(max_length=32)
    period = models.CharField(max_length=16)
    last_value = models.PositiveBigIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["name", "period"], name="uniq_sequence_period")]

    @classmethod
    def next_value(cls, name, period):
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(name=name, period=period)
            seq.last_value += 1
            seq.save(update_fields=["last_value"])
            return seq.last_value
