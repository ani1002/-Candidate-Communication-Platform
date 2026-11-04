from datetime import datetime
from unittest import mock

from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient
from twilio.request_validator import RequestValidator

from . import services
from .models import Candidate, Message, MessageStatusEvent
from .providers import ProviderError, TwilioSMSProvider

SECRET = {"HTTP_X_WEBHOOK_SECRET": "dummy-webhook-secret"}


def fake_send(self, to, body, reference):
    """Behaves like the dummy provider's magic numbers, without any network."""
    tail = to[-4:]
    if tail == "0001":
        raise ProviderError("INVALID_RECIPIENT", "bad number")
    if tail == "0002":
        raise ProviderError("PROVIDER_UNAVAILABLE", "down")
    return f"SM{reference}"


@override_settings(SEND_SYNC=True, RETRY_BACKOFF_SECONDS=0, MAX_SEND_ATTEMPTS=3)
@mock.patch("comms.providers.DummySMSProvider.send", fake_send)
class PlatformTests(TransactionTestCase):
    def setUp(self):
        self.api = APIClient()
        self.rahul = Candidate.objects.create(name="Rahul Sharma", phone="+919876543210", email="r@x.com")
        self.bad = Candidate.objects.create(name="Bad Number", phone="+919999990001")
        self.down = Candidate.objects.create(name="Outage", phone="+919999990002")

    def hook(self, message, status, event_id, **extra):
        body = {"event_id": event_id, "status": status, "reference": str(message.id), **extra}
        return self.api.post("/api/webhooks/provider/", body, format="json", **SECRET)

    # ---- candidates ----
    def test_add_list_search_detail(self):
        r = self.api.post("/api/candidates/", {"name": "Priya Shah", "phone": "+91 98765 00000", "email": "p@x.com"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["phone"], "+919876500000")
        self.assertIsNone(r.json()["last_message"])
        self.assertIsNone(r.json()["status"])
        self.assertEqual(self.api.get("/api/candidates/").json()["count"], 4)
        self.assertEqual(self.api.get("/api/candidates/?search=priya").json()["count"], 1)
        self.assertEqual(self.api.get(f"/api/candidates/{self.rahul.id}/").json()["name"], "Rahul Sharma")

    def test_candidate_list_and_detail_include_latest_message_status(self):
        Message.objects.create(candidate=self.rahul, body="Older", status=Message.Status.SENT)
        latest = Message.objects.create(candidate=self.rahul, body="Latest", status=Message.Status.FAILED)

        list_response = self.api.get("/api/candidates/").json()
        candidates_by_id = {candidate["id"]: candidate for candidate in list_response["results"]}
        rahul = candidates_by_id[self.rahul.id]
        candidate_without_messages = candidates_by_id[self.bad.id]
        detail = self.api.get(f"/api/candidates/{self.rahul.id}/").json()

        self.assertEqual(rahul["status"], Message.Status.FAILED)
        self.assertEqual(detail["status"], Message.Status.FAILED)
        self.assertEqual(
            datetime.fromisoformat(rahul["last_message"].replace("Z", "+00:00")),
            latest.created_at,
        )
        self.assertEqual(
            datetime.fromisoformat(detail["last_message"].replace("Z", "+00:00")),
            latest.created_at,
        )
        self.assertIsNone(candidate_without_messages["status"])
        self.assertIsNone(candidate_without_messages["last_message"])

    def test_candidate_validation_friendly_errors(self):
        r = self.api.post("/api/candidates/", {"name": "X", "phone": "12345"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("country code", r.json()["error"])
        dup = self.api.post("/api/candidates/", {"name": "Dup", "phone": "+919876543210"}, format="json")
        self.assertEqual(dup.status_code, 400)
        self.assertIn("already exists", dup.json()["error"])

    def test_delete_candidate_cascades_messages(self):
        message = Message.objects.create(candidate=self.rahul, body="Interview update")

        response = self.api.delete(f"/api/candidates/{self.rahul.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Candidate.objects.filter(id=self.rahul.id).exists())
        self.assertFalse(Message.objects.filter(id=message.id).exists())

    def test_bulk_delete_returns_deleted_and_missing_ids(self):
        message = Message.objects.create(candidate=self.rahul, body="Interview update")

        response = self.api.post(
            "/api/candidates/bulk-delete/",
            {"candidate_ids": [self.rahul.id, 99999]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"deleted": [self.rahul.id], "not_found": [99999]})
        self.assertFalse(Candidate.objects.filter(id=self.rahul.id).exists())
        self.assertFalse(Message.objects.filter(id=message.id).exists())

    def test_bulk_delete_rejects_empty_or_invalid_ids(self):
        empty = self.api.post("/api/candidates/bulk-delete/", {"candidate_ids": []}, format="json")
        invalid = self.api.post("/api/candidates/bulk-delete/", {"candidate_ids": ["nope"]}, format="json")

        self.assertEqual(empty.status_code, 400)
        self.assertEqual(invalid.status_code, 400)

    # ---- single send ----
    def test_send_single(self):
        r = self.api.post("/api/messages/", {"candidate_id": self.rahul.id, "body": "Hello"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["status"], "sent")
        self.assertTrue(Message.objects.get().provider_message_id)

    def test_send_empty_body_rejected(self):
        r = self.api.post("/api/messages/", {"candidate_id": self.rahul.id, "body": "  "}, format="json")
        self.assertEqual(r.status_code, 400)

    # ---- failures ----
    def test_invalid_recipient_is_permanent_and_friendly(self):
        r = self.api.post("/api/messages/", {"candidate_id": self.bad.id, "body": "Hi"}, format="json")
        data = r.json()
        self.assertEqual(data["status"], "failed")
        self.assertFalse(data["is_retryable"])
        self.assertEqual(data["attempt_count"], 1)  # no pointless retries
        self.assertIn("not valid", data["failure_reason"])
        self.assertNotIn("Exception", data["failure_reason"])

    def test_temporary_failure_retries_then_fails_as_retryable(self):
        r = self.api.post("/api/messages/", {"candidate_id": self.down.id, "body": "Hi"}, format="json")
        data = r.json()
        self.assertEqual(data["status"], "failed")
        self.assertTrue(data["is_retryable"])
        self.assertEqual(data["attempt_count"], 3)
        self.assertIn("temporarily unavailable", data["failure_reason"])

    # ---- bulk ----
    def test_bulk_one_failure_does_not_block_others(self):
        r = self.api.post(
            "/api/messages/bulk/",
            {"candidate_ids": [self.rahul.id, self.bad.id, self.down.id], "body": "Interview tomorrow"},
            format="json",
        )
        self.assertEqual(r.status_code, 201)
        batch = self.api.get(f"/api/batches/{r.json()['id']}/").json()
        self.assertEqual(batch["total"], 3)
        self.assertEqual(batch["summary"]["sent"], 1)
        self.assertEqual(batch["summary"]["failed"], 2)
        by_name = {m["candidate_name"]: m for m in batch["messages"]}
        self.assertEqual(by_name["Rahul Sharma"]["status"], "sent")
        self.assertEqual(by_name["Bad Number"]["status"], "failed")

    def test_bulk_validation(self):
        self.assertEqual(self.api.post("/api/messages/bulk/", {"candidate_ids": [], "body": "x"}, format="json").status_code, 400)
        r = self.api.post("/api/messages/bulk/", {"candidate_ids": [9999], "body": "x"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("not found", r.json()["error"])

    def test_bulk_duplicate_ids_send_once(self):
        r = self.api.post("/api/messages/bulk/", {"candidate_ids": [self.rahul.id, self.rahul.id], "body": "x"}, format="json")
        self.assertEqual(r.json()["total"], 1)

    # ---- webhooks ----
    def test_status_progression_and_history(self):
        m = services.create_messages([self.rahul], "Hi")[0]
        self.assertEqual(self.hook(m, "sent", "e0").json()["result"], "applied")
        self.assertEqual(self.hook(m, "delivered", "e1").json()["result"], "applied")
        m.refresh_from_db()
        self.assertEqual(m.status, "delivered")
        hist = self.api.get(f"/api/candidates/{self.rahul.id}/messages/").json()
        self.assertEqual(hist["messages"][0]["status"], "delivered")
        self.assertEqual(hist["messages"][0]["body"], "Hi")

    def test_duplicate_webhook_is_ignored(self):
        m = services.create_messages([self.rahul], "Hi")[0]
        self.assertEqual(self.hook(m, "delivered", "same").json()["result"], "applied")
        r = self.hook(m, "delivered", "same")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["result"], "duplicate")
        self.assertEqual(MessageStatusEvent.objects.filter(event_id="same").count(), 1)

    def test_out_of_order_update_never_moves_status_backward(self):
        m = services.create_messages([self.rahul], "Hi")[0]
        self.hook(m, "delivered", "e1")
        self.assertEqual(self.hook(m, "sent", "e2").json()["result"], "ignored")
        m.refresh_from_db()
        self.assertEqual(m.status, "delivered")

    def test_delivery_failure_webhook(self):
        m = services.create_messages([self.rahul], "Hi")[0]
        self.hook(m, "failed", "e1", error_code="DELIVERY_FAILED")
        m.refresh_from_db()
        self.assertEqual(m.status, "failed")
        self.assertTrue(m.is_retryable)
        self.assertTrue(m.failure_reason)

    def test_failed_after_delivery_is_ignored(self):
        m = services.create_messages([self.rahul], "Hi")[0]
        self.hook(m, "delivered", "e1")
        self.hook(m, "failed", "e2")
        m.refresh_from_db()
        self.assertEqual(m.status, "delivered")

    def test_webhook_before_send_finishes_does_not_regress(self):
        """Delivered arrives first; the send task finishing later must not set it back to 'sent'."""
        m = Message.objects.create(candidate=self.rahul, body="Hi")
        self.hook(m, "delivered", "e1")
        services._mark_sent(m.id, "SM_x")
        m.refresh_from_db()
        self.assertEqual(m.status, "delivered")
        self.assertEqual(m.provider_message_id, "SM_x")

    def test_webhook_security_and_validation(self):
        m = services.create_messages([self.rahul], "Hi")[0]
        body = {"event_id": "e", "status": "delivered", "reference": str(m.id)}
        self.assertEqual(self.api.post("/api/webhooks/provider/", body, format="json").status_code, 401)
        self.assertEqual(self.api.post("/api/webhooks/provider/", {"status": "delivered"}, format="json", **SECRET).status_code, 400)
        unknown = {"event_id": "e9", "status": "delivered", "reference": "99999"}
        self.assertEqual(self.api.post("/api/webhooks/provider/", unknown, format="json", **SECRET).status_code, 404)

    @override_settings(
        TWILIO_ACCOUNT_SID="ACtest",
        TWILIO_AUTH_TOKEN="test-auth-token",
        TWILIO_SMS_FROM="+14155550123",
        TWILIO_SMS_STATUS_CALLBACK_URL="https://example.test/api/webhooks/twilio-sms/",
    )
    @mock.patch("comms.providers.Client")
    def test_twilio_provider_sends_sms_and_status_callback(self, client_factory):
        client_factory.return_value.messages.create.return_value.sid = "SM1234567890"

        provider = TwilioSMSProvider()
        provider_sid = provider.send("+919876543210", "Interview update", "42")

        self.assertEqual(provider_sid, "SM1234567890")
        client_factory.return_value.messages.create.assert_called_once_with(
            from_="+14155550123",
            to="+919876543210",
            body="Interview update",
            status_callback="https://example.test/api/webhooks/twilio-sms/?reference=42",
        )

    @override_settings(
        TWILIO_ACCOUNT_SID="ACtest",
        TWILIO_AUTH_TOKEN="test-auth-token",
        TWILIO_SMS_FROM="+14155550123",
    )
    @mock.patch("comms.providers.Client")
    def test_twilio_send_failure_has_recruiter_friendly_sms_error(self, client_factory):
        from twilio.base.exceptions import TwilioRestException

        client_factory.return_value.messages.create.side_effect = TwilioRestException(
            status=400,
            uri="/Messages",
            msg="Raw Twilio error",
            code=21614,
        )

        message = Message.objects.create(
            candidate=self.rahul,
            body="Interview update",
            provider="twilio_sms",
        )
        services.send_message(message.id)

        message.refresh_from_db()
        self.assertEqual(message.status, Message.Status.FAILED)
        self.assertEqual(message.failure_code, "21614")
        self.assertIn("valid mobile number", message.failure_reason)
        self.assertFalse(message.is_retryable)
        client_factory.return_value.messages.create.assert_called_once()
        history = self.api.get(f"/api/candidates/{self.rahul.id}/messages/").json()
        self.assertEqual(history["messages"][0]["failure_reason"], message.failure_reason)

    @override_settings(
        TWILIO_ACCOUNT_SID="",
        TWILIO_AUTH_TOKEN="",
        TWILIO_SMS_FROM="",
    )
    def test_twilio_provider_configuration_failure_is_recorded_without_retry(self):
        message = Message.objects.create(
            candidate=self.rahul,
            body="Interview update",
            provider="twilio_sms",
        )

        services.send_message(message.id)

        message.refresh_from_db()
        self.assertEqual(message.status, Message.Status.FAILED)
        self.assertEqual(message.failure_code, "CONFIGURATION_ERROR")
        self.assertFalse(message.is_retryable)

    @override_settings(
        TWILIO_AUTH_TOKEN="test-auth-token",
        TWILIO_SMS_STATUS_CALLBACK_URL="https://example.test/api/webhooks/twilio-sms/",
    )
    def test_twilio_status_webhook_verifies_signature_and_updates_message(self):
        message = Message.objects.create(
            candidate=self.rahul,
            body="Interview update",
            provider="twilio_sms",
            provider_message_id="SM1234567890",
        )
        callback_url = f"https://example.test/api/webhooks/twilio-sms/?reference={message.id}"
        payload = {
            "MessageSid": "SM1234567890",
            "MessageStatus": "delivered",
        }
        signature = RequestValidator("test-auth-token").compute_signature(callback_url, payload)

        response = self.api.post(
            f"/api/webhooks/twilio-sms/?reference={message.id}",
            data="MessageSid=SM1234567890&MessageStatus=delivered",
            content_type="application/x-www-form-urlencoded",
            HTTP_X_TWILIO_SIGNATURE=signature,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"result": "applied"})
        message.refresh_from_db()
        self.assertEqual(message.status, Message.Status.DELIVERED)

    @override_settings(
        TWILIO_AUTH_TOKEN="test-auth-token",
        TWILIO_SMS_STATUS_CALLBACK_URL="https://example.test/api/webhooks/twilio-sms/",
    )
    def test_twilio_status_webhook_rejects_invalid_signature(self):
        response = self.api.post(
            "/api/webhooks/twilio-sms/?reference=1",
            data="MessageSid=SM1234567890&MessageStatus=delivered",
            content_type="application/x-www-form-urlencoded",
            HTTP_X_TWILIO_SIGNATURE="invalid",
        )

        self.assertEqual(response.status_code, 401)

    @override_settings(
        TWILIO_AUTH_TOKEN="test-auth-token",
        TWILIO_SMS_STATUS_CALLBACK_URL="https://example.test/api/webhooks/twilio-sms/",
    )
    def test_twilio_delivery_failure_records_friendly_reason(self):
        message = Message.objects.create(
            candidate=self.rahul,
            body="Interview update",
            provider="twilio_sms",
            provider_message_id="SM1234567890",
            status=Message.Status.SENT,
        )
        callback_url = f"https://example.test/api/webhooks/twilio-sms/?reference={message.id}"
        payload = {
            "MessageSid": "SM1234567890",
            "MessageStatus": "failed",
            "ErrorCode": "21614",
            "ErrorMessage": "Raw provider details",
        }
        signature = RequestValidator("test-auth-token").compute_signature(callback_url, payload)

        response = self.api.post(
            f"/api/webhooks/twilio-sms/?reference={message.id}",
            data=(
                "MessageSid=SM1234567890&MessageStatus=failed&ErrorCode=21614"
                "&ErrorMessage=Raw+provider+details"
            ),
            content_type="application/x-www-form-urlencoded",
            HTTP_X_TWILIO_SIGNATURE=signature,
        )

        self.assertEqual(response.status_code, 200)
        message.refresh_from_db()
        self.assertEqual(message.status, Message.Status.FAILED)
        self.assertEqual(message.failure_code, "21614")
        self.assertIn("valid mobile number", message.failure_reason)
        self.assertFalse(message.is_retryable)

    def test_sending_twice_is_prevented(self):
        m = services.create_messages([self.rahul], "Hi")[0]
        with mock.patch("comms.providers.DummySMSProvider.send") as send:
            services.send_message(m.id)  # already sent -> must not call provider
            send.assert_not_called()

    def test_empty_history(self):
        hist = self.api.get(f"/api/candidates/{self.rahul.id}/messages/").json()
        self.assertEqual(hist["messages"], [])
