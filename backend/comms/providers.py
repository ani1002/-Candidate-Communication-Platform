"""Thin client for the external communication provider.

All provider-specific knowledge (URLs, error codes) lives here and in
`friendly_error`, so the rest of the app only deals with ProviderError.
"""
import requests
from django.conf import settings
from twilio.base.exceptions import TwilioException, TwilioRestException
from twilio.rest import Client

# code -> (message for the recruiter, can retrying help?)
FRIENDLY_ERRORS = {
    "INVALID_RECIPIENT": (
        "This phone number is not valid or is not on WhatsApp. Please check the number.",
        False,
    ),
    "DELIVERY_FAILED": (
        "The message could not be delivered to the candidate's phone. They may be offline "
        "or have blocked messages.",
        True,
    ),
    "RATE_LIMITED": (
        "Too many messages were sent in a short time. The provider asked us to slow down.",
        True,
    ),
    "PROVIDER_UNAVAILABLE": (
        "The messaging service is temporarily unavailable. Please try again in a few minutes.",
        True,
    ),
    "TIMEOUT": (
        "The messaging service took too long to respond. Please try again.",
        True,
    ),
    "PROVIDER_ERROR": (
        "The messaging service reported an unexpected problem. Please try again later.",
        True,
    ),
    "REJECTED": ("The messaging service rejected this request.", False),
    "CONFIGURATION_ERROR": ("The WhatsApp messaging provider is not configured correctly.", False),
}


def friendly_error(code):
    """Returns (recruiter-friendly text, retryable)."""
    return FRIENDLY_ERRORS.get(code, FRIENDLY_ERRORS["PROVIDER_ERROR"])


class ProviderError(Exception):
    def __init__(self, code, detail="", retry_after=None):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail
        self.retry_after = retry_after

    @property
    def retryable(self):
        return friendly_error(self.code)[1]


class DummyWhatsAppProvider:
    name = "dummy_whatsapp"

    def send(self, to, body, reference):
        """Send one message. Returns the provider's message id. Raises ProviderError."""
        url = f"{settings.PROVIDER_BASE_URL}/v1/messages"
        try:
            resp = requests.post(
                url,
                json={"to": to, "body": body, "reference": reference},
                headers={"Authorization": f"Bearer {settings.PROVIDER_API_KEY}"},
                timeout=settings.PROVIDER_TIMEOUT_SECONDS,
            )
        except requests.Timeout:
            raise ProviderError("TIMEOUT", "request timed out")
        except requests.ConnectionError:
            raise ProviderError("PROVIDER_UNAVAILABLE", "could not connect to provider")
        except requests.RequestException as exc:
            raise ProviderError("PROVIDER_ERROR", str(exc))

        if resp.status_code in (200, 201, 202):
            try:
                return resp.json()["id"]
            except (ValueError, KeyError):
                raise ProviderError("PROVIDER_ERROR", "provider response had no id")

        # Error responses
        try:
            payload = resp.json()
        except ValueError:
            payload = {}
        code = payload.get("code")
        detail = payload.get("message", resp.text[:200])

        if resp.status_code == 429:
            retry_after = None
            try:
                retry_after = float(resp.headers.get("Retry-After", ""))
            except ValueError:
                pass
            raise ProviderError("RATE_LIMITED", detail, retry_after=retry_after)
        if resp.status_code in (502, 503, 504):
            raise ProviderError("PROVIDER_UNAVAILABLE", detail)
        if resp.status_code >= 500:
            raise ProviderError("PROVIDER_ERROR", detail)
        if code == "INVALID_RECIPIENT":
            raise ProviderError("INVALID_RECIPIENT", detail)
        raise ProviderError("REJECTED", detail)


class TwilioWhatsAppProvider:
    name = "twilio_whatsapp"

    def __init__(self):
        account_sid = settings.TWILIO_ACCOUNT_SID
        auth_token = settings.TWILIO_AUTH_TOKEN
        self.from_number = settings.TWILIO_WHATSAPP_FROM
        if not account_sid or not auth_token or not self.from_number:
            raise ProviderError("CONFIGURATION_ERROR", "Twilio WhatsApp environment variables are missing")
        if not self.from_number.startswith("whatsapp:+"):
            raise ProviderError(
                "CONFIGURATION_ERROR",
                "TWILIO_WHATSAPP_FROM must use the format whatsapp:+14155238886",
            )
        self.client = Client(account_sid, auth_token)

    def send(self, to, body, reference):
        """Create a WhatsApp message through Twilio and return its SID."""
        recipient = to if to.startswith("whatsapp:") else f"whatsapp:{to}"
        callback_url = settings.TWILIO_STATUS_CALLBACK_URL
        kwargs = {
            "from_": self.from_number,
            "to": recipient,
            "body": body,
        }
        if callback_url:
            kwargs["status_callback"] = f"{callback_url}?reference={reference}"

        try:
            message = self.client.messages.create(**kwargs)
        except TwilioRestException as exc:
            if exc.status == 429 or exc.code == 20429:
                raise ProviderError("RATE_LIMITED", exc.msg or str(exc))
            if exc.status is not None and exc.status >= 500:
                raise ProviderError("PROVIDER_UNAVAILABLE", exc.msg or str(exc))
            if exc.code in (21211, 63003, 63007):
                raise ProviderError("INVALID_RECIPIENT", exc.msg or str(exc))
            if exc.code in (20003, 20005):
                raise ProviderError("CONFIGURATION_ERROR", exc.msg or str(exc))
            raise ProviderError("REJECTED", exc.msg or str(exc))
        except TwilioException as exc:
            raise ProviderError("PROVIDER_ERROR", str(exc))

        if not message.sid:
            raise ProviderError("PROVIDER_ERROR", "Twilio response did not contain a message SID")
        return message.sid


def get_provider(name=None):
    provider_name = (name or settings.MESSAGE_PROVIDER).strip().lower()
    providers = {
        "dummy_whatsapp": DummyWhatsAppProvider,
        "twilio_whatsapp": TwilioWhatsAppProvider,
    }
    provider_class = providers.get(provider_name)
    if provider_class is None:
        raise ProviderError("CONFIGURATION_ERROR", f"Unsupported message provider: {provider_name}")
    return provider_class()
