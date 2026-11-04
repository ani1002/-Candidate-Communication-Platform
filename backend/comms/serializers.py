from django.conf import settings
from rest_framework import serializers

from .models import Candidate, Message


class CandidateSerializer(serializers.ModelSerializer):
    last_message = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = Candidate
        fields = ["id", "name", "phone", "email", "created_at", "last_message", "status"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {"phone": {"error_messages": {"unique": "A candidate with this phone number already exists."}}}

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        return value

    def get_last_message(self, obj):
        return getattr(obj, "latest_message_at", None)

    def get_status(self, obj):
        return getattr(obj, "latest_message_status", None)

    def to_internal_value(self, data):
        # Clean the phone BEFORE field validators run, so "+91 98765-43210" is accepted.
        data = data.copy() if hasattr(data, "copy") else dict(data)
        phone = data.get("phone")
        if isinstance(phone, str):
            data["phone"] = "".join(ch for ch in phone if ch not in " -()")
        return super().to_internal_value(data)


class MessageSerializer(serializers.ModelSerializer):
    candidate_name = serializers.CharField(source="candidate.name", read_only=True)
    candidate_phone = serializers.CharField(source="candidate.phone", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Message
        fields = [
            "id", "candidate", "candidate_name", "candidate_phone", "batch", "body",
            "status", "status_label", "failure_code", "failure_reason", "is_retryable",
            "attempt_count", "created_at", "sent_at", "updated_at",
        ]
        read_only_fields = fields


class SendMessageSerializer(serializers.Serializer):
    candidate_id = serializers.IntegerField()
    body = serializers.CharField(max_length=1000)

    def validate_body(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Message cannot be empty.")
        return value

    def validate_candidate_id(self, value):
        if not Candidate.objects.filter(id=value).exists():
            raise serializers.ValidationError("Candidate not found.")
        return value


class BulkSendSerializer(serializers.Serializer):
    candidate_ids = serializers.ListField(
        child=serializers.IntegerField(), allow_empty=False, max_length=settings.MAX_BULK_RECIPIENTS
    )
    body = serializers.CharField(max_length=1000)

    def validate_body(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Message cannot be empty.")
        return value

    def validate_candidate_ids(self, ids):
        ids = list(dict.fromkeys(ids))  # drop duplicates, keep order
        found = set(Candidate.objects.filter(id__in=ids).values_list("id", flat=True))
        missing = [i for i in ids if i not in found]
        if missing:
            raise serializers.ValidationError(f"Candidates not found: {missing}")
        return ids


class BulkDeleteSerializer(serializers.Serializer):
    candidate_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        max_length=settings.MAX_BULK_RECIPIENTS,
    )

    def validate_candidate_ids(self, ids):
        return list(dict.fromkeys(ids))
