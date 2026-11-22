from decimal import Decimal

from django.forms.models import model_to_dict
from rest_framework.response import Response

from .models import AuditLog

SKIP_FIELDS = {"created_at", "updated_at", "created_by", "updated_by", "password"}


def snapshot(instance):
    data = model_to_dict(instance)
    return {k: _plain(v) for k, v in data.items() if k not in SKIP_FIELDS}


def _plain(value):
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if hasattr(value, "pk"):
        return value.pk
    return value


def client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def write_audit(request, action, instance, changes=None):
    AuditLog.objects.create(
        user=request.user if request.user.is_authenticated else None,
        action=action,
        table=instance._meta.db_table,
        record_id=str(instance.pk),
        changes=changes or {},
        ip_address=client_ip(request),
    )


class AuditedViewSetMixin:
    """Writes an AuditLog row for every create, update and delete.

    Set ``audit_views = True`` on a viewset to also log each single-record view,
    which the spec requires for patient records.
    """

    audit_views = False

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        write_audit(self.request, AuditLog.Action.CREATE, instance, {"after": snapshot(instance)})

    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        instance = serializer.save(updated_by=self.request.user)
        after = snapshot(instance)
        diff = {k: {"from": before.get(k), "to": v} for k, v in after.items() if before.get(k) != v}
        if diff:
            write_audit(self.request, AuditLog.Action.UPDATE, instance, diff)

    def perform_destroy(self, instance):
        write_audit(self.request, AuditLog.Action.DELETE, instance, {"before": snapshot(instance)})
        instance.delete()

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if self.audit_views:
            write_audit(request, AuditLog.Action.VIEW, instance)
        return Response(self.get_serializer(instance).data)
