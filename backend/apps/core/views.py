from rest_framework import mixins, viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .audit import AuditedViewSetMixin
from .models import AuditLog, Role, User
from .permissions import IsAdmin
from .serializers import AuditLogSerializer, MeSerializer, UserSerializer


@api_view(["GET"])
def me(request):
    return Response(MeSerializer(request.user).data)


@api_view(["GET"])
def roles(request):
    return Response([{"value": value, "label": label} for value, label in Role.choices])


class UserViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    queryset = User.objects.order_by("username")
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
    search_fields = ["username", "first_name", "last_name", "email"]
    http_method_names = ["get", "post", "patch", "head", "options"]  # deactivate, never delete


class AuditLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = AuditLog.objects.select_related("user")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]
    filterset_fields = ["action", "table", "record_id", "user"]
