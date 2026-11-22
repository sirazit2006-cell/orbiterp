from rest_framework import serializers

from apps.core.models import Role, User

from .models import Department, Doctor


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ["id", "name", "code", "is_active"]


class DoctorSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="__str__", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())

    class Meta:
        model = Doctor
        fields = [
            "id", "user", "name", "department", "department_name", "specialization", "qualification",
            "registration_no", "first_visit_fee", "follow_up_fee", "follow_up_days", "is_active",
        ]

    def validate_user(self, user):
        if Role.DOCTOR not in user.roles:
            raise serializers.ValidationError("This user does not have the doctor role.")
        return user
