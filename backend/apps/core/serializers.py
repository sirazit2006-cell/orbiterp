from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import AuditLog, Role, User


class MeSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "full_name", "email", "roles", "is_superuser"]
        read_only_fields = fields

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    roles = serializers.ListField(child=serializers.ChoiceField(choices=Role.choices), allow_empty=True)

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "phone", "roles", "is_active", "password"]

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError({"password": "A password is required for a new user."})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        validated_data.pop("created_by", None)
        validated_data.pop("updated_by", None)
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        validated_data.pop("updated_by", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", default=None, read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "at", "username", "action", "table", "record_id", "changes", "ip_address"]
