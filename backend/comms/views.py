import hashlib
import hmac
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.db.models import Count, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework import status as http
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListCreateAPIView, RetrieveAPIView, RetrieveDestroyAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView, exception_handler
from twilio.request_validator import RequestValidator

from . import services
from .models import BulkBatch, Candidate, Message
from .serializers import (
    BulkDeleteSerializer,
    BulkSendSerializer,
    CandidateSerializer,
    MessageSerializer,
    SendMessageSerializer,
)


def api_exception_handler(exc, context):
    """Every error looks like {"error": "<readable text>", "details": {...}}."""
    response = exception_handler(exc, context)
    if response is None:
        return Response(
            {"error": "Something went wrong on our side. Please try again."},
            status=http.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    if isinstance(exc, ValidationError):
        details = response.data
        first = _first_error(details)
        response.data = {"error": first or "Please check the form and try again.", "details": details}
    else:
        detail = response.data.get("detail") if isinstance(response.data, dict) else None
        response.data = {"error": str(detail or "Request failed.")}
    return response


def _first_error(details):
    if isinstance(details, dict):
        for field, value in details.items():
            msg = _first_error(value)
            if msg:
                return msg if field in ("non_field_errors", "detail") else f"{field}: {msg}"
    elif isinstance(details, list) and details:
        return _first_error(details[0])
    elif details:
        return str(details)
    return None


class Pagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200


def candidates_with_latest_message(queryset):
    latest_message = Message.objects.filter(candidate_id=OuterRef("pk")).order_by("-created_at", "-id")
    latest_message_date = latest_message.annotate(
        message_date=Coalesce("sent_at", "created_at")
    ).values("message_date")[:1]
    return queryset.annotate(
        latest_message_status=Subquery(latest_message.values("status")[:1]),
        latest_message_at=Subquery(latest_message_date),
    )


# --------------------------------------------------------------------------
# Candidates
# --------------------------------------------------------------------------
class CandidateListCreate(ListCreateAPIView):
    """GET /api/candidates/?search=rahul   |   POST /api/candidates/"""

    serializer_class = CandidateSerializer
    pagination_class = Pagination

    def get_queryset(self):
        qs = candidates_with_latest_message(Candidate.objects.all())
        term = self.request.query_params.get("search", "").strip()
        if term:
            qs = qs.filter(
                Q(name__icontains=term) | Q(phone__icontains=term) | Q(email__icontains=term)
            )
        return qs


class CandidateDetail(RetrieveDestroyAPIView):
    queryset = candidates_with_latest_message(Candidate.objects.all())
    serializer_class = CandidateSerializer


class BulkDeleteCandidates(APIView):
    """POST /api/candidates/bulk-delete/ {"candidate_ids": [1, 2, 3]}"""

    def post(self, request):
        serializer = BulkDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = serializer.validated_data["candidate_ids"]

        with transaction.atomic():
            found = set(Candidate.objects.filter(id__in=ids).values_list("id", flat=True))
            deleted = [candidate_id for candidate_id in ids if candidate_id in found]
            Candidate.objects.filter(id__in=deleted).delete()

        return Response(
            {
                "deleted": deleted,
                "not_found": [candidate_id for candidate_id in ids if candidate_id not in found],
            }
        )


class CandidateHistory(APIView):
    """GET /api/candidates/<id>/messages/  - newest first."""

    def get(self, request, pk):
        candidate = get_object_or_404(candidates_with_latest_message(Candidate.objects.all()), pk=pk)
        messages = candidate.messages.select_related("candidate")
        return Response(
            {
                "candidate": CandidateSerializer(candidate).data,
                "messages": MessageSerializer(messages, many=True).data,
            }
        )


# --------------------------------------------------------------------------
# Messages
# --------------------------------------------------------------------------
class SendMessage(APIView):
    """POST /api/messages/  {"candidate_id": 1, "body": "..."}"""

    def post(self, request):
        ser = SendMessageSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        candidate = Candidate.objects.get(id=ser.validated_data["candidate_id"])
        (message,) = services.create_messages([candidate], ser.validated_data["body"])
        message.refresh_from_db()
        return Response(MessageSerializer(message).data, status=http.HTTP_201_CREATED)


class MessageDetail(RetrieveAPIView):
    queryset = Message.objects.select_related("candidate")
    serializer_class = MessageSerializer


def _batch_payload(batch):
    messages = batch.messages.select_related("candidate").order_by("id")
    counts = dict(batch.messages.values_list("status").annotate(n=Count("id")))
    return {
        "id": batch.id,
        "body": batch.body,
        "created_at": batch.created_at,
        "total": sum(counts.values()),
        "summary": {s: counts.get(s, 0) for s in Message.Status.values},
        "messages": MessageSerializer(messages, many=True).data,
    }


class BulkSend(APIView):
    """POST /api/messages/bulk/  {"candidate_ids": [1,2,3], "body": "..."}

    Returns immediately with one pending message per candidate. Poll
    GET /api/batches/<id>/ to see each candidate's individual result."""

    def post(self, request):
        ser = BulkSendSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ids = ser.validated_data["candidate_ids"]
        by_id = {c.id: c for c in Candidate.objects.filter(id__in=ids)}
        candidates = [by_id[i] for i in ids]
        batch, _ = services.create_bulk(candidates, ser.validated_data["body"])
        return Response(_batch_payload(batch), status=http.HTTP_201_CREATED)


class BatchDetail(APIView):
    def get(self, request, pk):
        return Response(_batch_payload(get_object_or_404(BulkBatch, pk=pk)))


# --------------------------------------------------------------------------
# Provider webhook
# --------------------------------------------------------------------------
class ProviderWebhook(APIView):
    """POST /api/webhooks/provider/

    Body: {"event_id", "status", "reference" (our message id), "message_id" (provider's id),
           "error_code" (only for failed)}
    Always answers 200 for valid, known updates - including repeats - so the provider
    stops retrying."""

    authentication_classes = []
    permission_classes = []

    def post(self, request):
        secret = request.headers.get("X-Webhook-Secret", "")
        if not hmac.compare_digest(secret, settings.WEBHOOK_SECRET):
            return Response({"error": "Invalid webhook secret."}, status=http.HTTP_401_UNAUTHORIZED)

        data = request.data if isinstance(request.data, dict) else {}
        event_id, new_status = data.get("event_id"), data.get("status")
        if not event_id or new_status not in Message.Status.values:
            return Response(
                {"error": "event_id and a valid status are required."}, status=http.HTTP_400_BAD_REQUEST
            )
        try:
            result = services.apply_status_update(
                event_id=str(event_id),
                status=new_status,
                reference=data.get("reference"),
                provider_message_id=data.get("message_id"),
                payload=data,
            )
        except services.UnknownMessage:
            return Response({"error": "Unknown message."}, status=http.HTTP_404_NOT_FOUND)
        return Response({"result": result})


class TwilioStatusWebhook(APIView):
    """Receive signed Twilio SMS delivery updates."""

    authentication_classes = []
    permission_classes = []
    parser_classes = [FormParser, MultiPartParser]

    def post(self, request):
        auth_token = settings.TWILIO_AUTH_TOKEN
        callback_url = settings.TWILIO_SMS_STATUS_CALLBACK_URL
        if not auth_token or not callback_url:
            return Response(
                {"error": "Twilio status callbacks are not configured."},
                status=http.HTTP_503_SERVICE_UNAVAILABLE,
            )

        reference = request.query_params.get("reference", "")
        expected_url = callback_url
        if reference:
            expected_url = f"{expected_url}?{urlencode({'reference': reference})}"
        signature = request.headers.get("X-Twilio-Signature", "")
        validator = RequestValidator(auth_token)
        if not signature or not validator.validate(expected_url, request.data, signature):
            return Response({"error": "Invalid Twilio signature."}, status=http.HTTP_401_UNAUTHORIZED)

        data = request.data.dict()
        sid = data.get("MessageSid", "")
        provider_status = data.get("MessageStatus", "").lower()
        if not sid or not provider_status:
            return Response(
                {"error": "MessageSid and MessageStatus are required."},
                status=http.HTTP_400_BAD_REQUEST,
            )

        status_map = {
            "sent": Message.Status.SENT,
            "delivered": Message.Status.DELIVERED,
            "failed": Message.Status.FAILED,
            "undelivered": Message.Status.FAILED,
        }
        mapped_status = status_map.get(provider_status)
        if mapped_status is None:
            # Twilio also sends intermediate states such as queued and sending.
            return Response({"result": "ignored"})

        error_code = data.get("ErrorCode")
        event_id = hashlib.sha256(f"{sid}:{provider_status}:{error_code or ''}".encode()).hexdigest()
        try:
            result = services.apply_status_update(
                event_id=event_id,
                status=mapped_status,
                reference=reference or None,
                provider_message_id=sid,
                payload={
                    **data,
                    "error_code": (
                        str(error_code or "DELIVERY_FAILED")
                        if mapped_status == Message.Status.FAILED
                        else error_code
                    ),
                },
            )
        except services.UnknownMessage:
            return Response({"error": "Unknown message."}, status=http.HTTP_404_NOT_FOUND)
        return Response({"result": result})
