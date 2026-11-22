from django.utils import timezone
from rest_framework import serializers

from .models import Patient


class PatientSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    age = serializers.IntegerField(read_only=True)
    consent_given = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = Patient
        fields = [
            "id", "uhid", "first_name", "last_name", "full_name", "gender", "date_of_birth", "age_years", "age",
            "mobile", "email", "address_line", "city", "state", "pin_code", "blood_group",
            "emergency_contact_name", "emergency_contact_phone", "id_proof_type", "id_proof_number",
            "abha_number", "consent_given", "consent_given_at", "is_active", "created_at",
        ]
        read_only_fields = ["uhid", "consent_given_at", "created_at"]

    def validate_date_of_birth(self, value):
        if value and value > timezone.localdate():
            raise serializers.ValidationError("Date of birth cannot be in the future.")
        return value

    def validate(self, attrs):
        dob = attrs.get("date_of_birth", getattr(self.instance, "date_of_birth", None))
        age = attrs.get("age_years", getattr(self.instance, "age_years", None))
        if dob is None and age is None:
            raise serializers.ValidationError({"date_of_birth": "Enter a date of birth or an age."})
        if self.instance is None and not attrs.get("consent_given"):
            raise serializers.ValidationError({"consent_given": "Patient consent is required to register."})
        if attrs.pop("consent_given", False) and self.instance is None:
            attrs["consent_given_at"] = timezone.now()
        return attrs


class PatientListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    age = serializers.IntegerField(read_only=True)

    class Meta:
        model = Patient
        fields = ["id", "uhid", "full_name", "gender", "age", "mobile", "city", "created_at"]
