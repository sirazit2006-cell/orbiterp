from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.appointments.models import Appointment


@receiver(post_save, sender=Appointment)
def open_visit_bill(sender, instance, **kwargs):
    """Start the visit's bill with the consultation fee as soon as the patient is checked in."""
    if instance.status == Appointment.Status.CHECKED_IN and not instance.bills.exists():
        from .services import visit_bill

        visit_bill(instance, user=instance.updated_by)
