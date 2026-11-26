from django.db import transaction
from rest_framework import serializers

from apps.masters.models import Medicine, Service

from .models import Amendment, Consultation, Diagnosis, InvestigationOrder, PrescriptionItem, Vitals


class VitalsSerializer(serializers.ModelSerializer):
    bmi = serializers.DecimalField(max_digits=5, decimal_places=1, read_only=True)
    recorded_by = serializers.SerializerMethodField()

    class Meta:
        model = Vitals
        fields = [
            "id", "height_cm", "weight_kg", "bmi", "temperature_f", "pulse", "bp_systolic", "bp_diastolic",
            "spo2", "respiratory_rate", "blood_sugar", "allergies", "chief_complaint", "recorded_by", "updated_at",
        ]

    def get_recorded_by(self, obj):
        user = obj.updated_by or obj.created_by
        return (user.get_full_name() or user.username) if user else None

    def validate(self, attrs):
        sys_ = attrs.get("bp_systolic", getattr(self.instance, "bp_systolic", None))
        dia = attrs.get("bp_diastolic", getattr(self.instance, "bp_diastolic", None))
        if (sys_ is None) != (dia is None):
            raise serializers.ValidationError({"bp_systolic": "Enter both systolic and diastolic, or neither."})
        if sys_ is not None and dia is not None and dia >= sys_:
            raise serializers.ValidationError({"bp_diastolic": "Diastolic must be lower than systolic."})
        return attrs


class DiagnosisSerializer(serializers.ModelSerializer):
    text = serializers.CharField(max_length=255, allow_blank=True)  # blank rows from the form are dropped on save

    class Meta:
        model = Diagnosis
        fields = ["text", "icd10_code"]


class PrescriptionItemSerializer(serializers.ModelSerializer):
    medicine = serializers.PrimaryKeyRelatedField(queryset=Medicine.objects.all(), required=False, allow_null=True)
    medicine_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    route_label = serializers.CharField(source="get_route_display", read_only=True)

    class Meta:
        model = PrescriptionItem
        fields = ["medicine", "medicine_name", "dose", "frequency", "duration", "route", "route_label", "instructions"]

    def validate(self, attrs):
        if not attrs.get("medicine_name"):
            if not attrs.get("medicine"):
                raise serializers.ValidationError({"medicine_name": "Choose or type a medicine."})
            attrs["medicine_name"] = str(attrs["medicine"])
        return attrs


class InvestigationOrderSerializer(serializers.ModelSerializer):
    service = serializers.PrimaryKeyRelatedField(
        queryset=Service.objects.filter(is_active=True, category__in=[Service.Category.LAB, Service.Category.RADIOLOGY, Service.Category.PROCEDURE])
    )
    service_name = serializers.CharField(source="service.name", read_only=True)
    category = serializers.CharField(source="service.category", read_only=True)

    class Meta:
        model = InvestigationOrder
        fields = ["id", "service", "service_name", "category", "notes", "status"]
        read_only_fields = ["status"]


class AmendmentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = Amendment
        fields = ["id", "text", "author_name", "created_at"]

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.username


class ConsultationSerializer(serializers.ModelSerializer):
    """Read and write a whole consultation; the lists are replaced on every save."""

    diagnoses = DiagnosisSerializer(many=True, required=False)
    prescriptions = PrescriptionItemSerializer(many=True, required=False)
    investigations = InvestigationOrderSerializer(many=True, required=False)
    amendments = AmendmentSerializer(many=True, read_only=True)
    referral_doctor_name = serializers.SerializerMethodField()
    is_locked = serializers.BooleanField(read_only=True)
    locked_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Consultation
        fields = [
            "id", "complaints", "history", "examination", "advice", "follow_up_date",
            "referral_doctor", "referral_doctor_name", "referral_note",
            "diagnoses", "prescriptions", "investigations", "amendments",
            "is_locked", "locked_at", "updated_at",
        ]

    def get_referral_doctor_name(self, obj):
        return str(obj.referral_doctor) if obj.referral_doctor else None

    def validate_follow_up_date(self, value):
        appt = self.context["appointment"]
        if value and value <= appt.date:
            raise serializers.ValidationError("The follow-up date must be after the visit.")
        return value

    def validate_referral_doctor(self, value):
        if value and value == self.context["appointment"].doctor:
            raise serializers.ValidationError("A patient cannot be referred to the same doctor.")
        return value

    @transaction.atomic
    def save_for(self, appointment, user):
        data = dict(self.validated_data)
        diagnoses = data.pop("diagnoses", None)
        prescriptions = data.pop("prescriptions", None)
        investigations = data.pop("investigations", None)
        consultation, created = Consultation.objects.get_or_create(
            appointment=appointment, defaults={"created_by": user, "updated_by": user}
        )
        for key, value in data.items():
            setattr(consultation, key, value)
        consultation.updated_by = user
        consultation.save()

        if diagnoses is not None:
            consultation.diagnoses.all().delete()
            Diagnosis.objects.bulk_create(
                Diagnosis(consultation=consultation, position=i, **d) for i, d in enumerate(diagnoses) if d["text"].strip()
            )
        if prescriptions is not None:
            consultation.prescriptions.all().delete()
            PrescriptionItem.objects.bulk_create(
                PrescriptionItem(consultation=consultation, position=i, **p) for i, p in enumerate(prescriptions)
            )
        if investigations is not None:
            # Orders already billed stay; the rest are replaced by what was sent.
            kept = set(consultation.investigations.filter(status=InvestigationOrder.Status.BILLED).values_list("service_id", flat=True))
            consultation.investigations.exclude(status=InvestigationOrder.Status.BILLED).delete()
            InvestigationOrder.objects.bulk_create(
                InvestigationOrder(consultation=consultation, **o) for o in investigations if o["service"].pk not in kept
            )
        self.instance = consultation
        return consultation, created
