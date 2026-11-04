from django.core.validators import RegexValidator
from django.db import models

E164 = RegexValidator(
    regex=r"^\+[1-9]\d{7,14}$",
    message="Enter the phone number with country code, e.g. +919876543210.",
)


class Candidate(models.Model):
    name = models.CharField(max_length=120, db_index=True)
    phone = models.CharField(max_length=16, unique=True, validators=[E164])
    email = models.EmailField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.name} ({self.phone})"


class BulkBatch(models.Model):
    """Groups the individual messages created by one bulk send."""

    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class Message(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        DELIVERED = "delivered", "Delivered"
        FAILED = "failed", "Failed"

    # Order of the happy path. A message may only move forward along it.
    RANK = {"pending": 0, "sent": 1, "delivered": 2}

    candidate = models.ForeignKey(Candidate, on_delete=models.CASCADE, related_name="messages")
    batch = models.ForeignKey(
        BulkBatch, null=True, blank=True, on_delete=models.SET_NULL, related_name="messages"
    )
    body = models.TextField()
    provider = models.CharField(max_length=30, default="dummy_sms")
    provider_message_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)

    # Failure details (only filled when status == failed)
    failure_code = models.CharField(max_length=40, blank=True, default="")
    failure_reason = models.CharField(max_length=255, blank=True, default="")  # friendly text
    is_retryable = models.BooleanField(default=False)

    attempt_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["candidate", "-created_at"])]


class MessageStatusEvent(models.Model):
    """Every status update we receive. `event_id` is unique so a repeated webhook is ignored."""

    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="events")
    event_id = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=12)
    raw_payload = models.JSONField(default=dict)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
