from rest_framework import serializers

from .models import Appointment, DoctorLeave, DoctorSchedule


class DoctorScheduleSerializer(serializers.ModelSerializer):
    weekday_name = serializers.CharField(source="get_weekday_display", read_only=True)
    doctor_name = serializers.CharField(source="doctor.__str__", read_only=True)

    class Meta:
        model = DoctorSchedule
        fields = [
            "id", "doctor", "doctor_name", "weekday", "weekday_name", "start_time", "end_time",
            "slot_minutes", "max_patients", "is_active",
        ]

    def validate(self, attrs):
        instance = DoctorSchedule(**{**self._current(), **attrs})
        instance.pk = getattr(self.instance, "pk", None)
        try:
            instance.clean()
        except Exception as exc:  # django ValidationError -> DRF error
            raise serializers.ValidationError(getattr(exc, "message_dict", None) or {"non_field_errors": exc.messages})
        return attrs

    def _current(self):
        if not self.instance:
            return {}
        return {f: getattr(self.instance, f) for f in ["doctor", "weekday", "start_time", "end_time", "slot_minutes", "max_patients", "is_active"]}


class DoctorLeaveSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source="doctor.__str__", read_only=True)
    flagged_appointments = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = DoctorLeave
        fields = ["id", "doctor", "doctor_name", "from_date", "to_date", "reason", "flagged_appointments"]

    def validate(self, attrs):
        start = attrs.get("from_date", getattr(self.instance, "from_date", None))
        end = attrs.get("to_date", getattr(self.instance, "to_date", None))
        if start and end and start > end:
            raise serializers.ValidationError({"to_date": "The leave must end on or after its first day."})
        return attrs


class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_uhid = serializers.CharField(source="patient.uhid", read_only=True)
    patient_mobile = serializers.CharField(source="patient.mobile", read_only=True)
    patient_age = serializers.IntegerField(source="patient.age", read_only=True)
    patient_gender = serializers.CharField(source="patient.gender", read_only=True)
    doctor_name = serializers.CharField(source="doctor.__str__", read_only=True)
    department_name = serializers.CharField(source="doctor.department.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    has_vitals = serializers.SerializerMethodField()
    has_consultation = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = [
            "id", "patient", "patient_name", "patient_uhid", "patient_mobile", "patient_age", "patient_gender",
            "doctor", "doctor_name", "department_name", "date", "slot_time", "source", "visit_type",
            "status", "status_label", "token_no", "checked_in_at", "started_at", "completed_at",
            "reason", "cancel_reason", "needs_reschedule", "has_vitals", "has_consultation", "created_at",
        ]
        read_only_fields = [
            "visit_type", "status", "token_no", "checked_in_at", "started_at", "completed_at",
            "cancel_reason", "needs_reschedule", "created_at",
        ]

    def get_has_vitals(self, obj):
        return hasattr(obj, "vitals")

    def get_has_consultation(self, obj):
        return hasattr(obj, "consultation")


class RescheduleSerializer(serializers.Serializer):
    date = serializers.DateField()
    slot_time = serializers.TimeField()


class CancelSerializer(serializers.Serializer):
    cancel_reason = serializers.CharField(max_length=255)
