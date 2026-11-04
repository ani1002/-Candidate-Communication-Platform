import logging
import time
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.db import IntegrityError, close_old_connections, transaction
from django.utils import timezone

from .models import BulkBatch, Message, MessageStatusEvent
from .providers import ProviderError, friendly_error, get_provider

log = logging.getLogger(__name__)

_executor = None


def _get_executor():
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=settings.SEND_WORKERS)
    return _executor


# --------------------------------------------------------------------------
# Creating messages
# --------------------------------------------------------------------------
def create_messages(candidates, body, batch=None):
    """Create one PENDING message per candidate, then queue each one for sending
    after the transaction commits (so the worker always finds the row)."""
    with transaction.atomic():
        messages = [
            Message.objects.create(
                candidate=c,
                body=body,
                batch=batch,
                provider=settings.MESSAGE_PROVIDER,
            )
            for c in candidates
        ]
        for m in messages:
            transaction.on_commit(lambda mid=m.id: dispatch(mid))
    return messages


def create_bulk(candidates, body):
    with transaction.atomic():
        batch = BulkBatch.objects.create(body=body)
        messages = create_messages(candidates, body, batch=batch)
    return batch, messages


def dispatch(message_id):
    if settings.SEND_SYNC:
        send_message(message_id)
    else:
        _get_executor().submit(_run_in_thread, message_id)


def _run_in_thread(message_id):
    try:
        send_message(message_id)
    except Exception:  # never let one message kill the worker
        log.exception("Unexpected error while sending message %s", message_id)
        _mark_failed(message_id, "PROVIDER_ERROR")
    finally:
        close_old_connections()


# --------------------------------------------------------------------------
# Sending
# --------------------------------------------------------------------------
def send_message(message_id):
    """Send one message. Temporary failures are retried with backoff;
    permanent ones fail straight away. Each message is independent."""
    message = Message.objects.select_related("candidate").get(id=message_id)
    if message.status != Message.Status.PENDING:
        return  # already handled, never send twice

    try:
        provider = get_provider(message.provider)
    except ProviderError as err:
        _mark_failed(message_id, err.code)
        return

    for attempt in range(1, settings.MAX_SEND_ATTEMPTS + 1):
        Message.objects.filter(id=message_id).update(attempt_count=attempt)
        try:
            provider_id = provider.send(
                to=message.candidate.phone, body=message.body, reference=str(message.id)
            )
        except ProviderError as err:
            log.warning("Message %s attempt %s failed: %s", message_id, attempt, err)
            if err.retryable and attempt < settings.MAX_SEND_ATTEMPTS:
                wait = err.retry_after or settings.RETRY_BACKOFF_SECONDS * (2 ** (attempt - 1))
                time.sleep(min(wait, 30))
                continue
            _mark_failed(message_id, err.code)
            return
        else:
            _mark_sent(message_id, provider_id)
            return


def _mark_sent(message_id, provider_id):
    with transaction.atomic():
        m = Message.objects.select_for_update().get(id=message_id)
        m.provider_message_id = provider_id
        m.sent_at = timezone.now()
        # A webhook may already have moved us past "sent": never go backwards.
        if m.status == Message.Status.PENDING:
            m.status = Message.Status.SENT
        m.save()


def _mark_failed(message_id, code):
    text, retryable = friendly_error(code)
    with transaction.atomic():
        m = Message.objects.select_for_update().get(id=message_id)
        if m.status == Message.Status.DELIVERED:
            return
        m.status = Message.Status.FAILED
        m.failure_code = code
        m.failure_reason = text
        m.is_retryable = retryable
        m.save()


# --------------------------------------------------------------------------
# Status updates coming from the provider (webhook)
# --------------------------------------------------------------------------
class UnknownMessage(Exception):
    pass


def apply_status_update(event_id, status, reference=None, provider_message_id=None, payload=None):
    """Returns 'applied', 'ignored' (older/irrelevant update) or 'duplicate'.

    * Same event_id twice  -> 'duplicate' (unique constraint), nothing changes.
    * Older status after a newer one (e.g. sent after delivered) -> 'ignored'.
    """
    message = None
    if reference and str(reference).isdigit():
        message = Message.objects.filter(id=int(reference)).first()
    if message is None and provider_message_id:
        message = Message.objects.filter(provider_message_id=provider_message_id).first()
    if message is None:
        raise UnknownMessage()

    with transaction.atomic():
        message = Message.objects.select_for_update().get(id=message.id)

        try:
            with transaction.atomic():
                MessageStatusEvent.objects.create(
                    message=message, event_id=event_id, status=status, raw_payload=payload or {}
                )
        except IntegrityError:
            return "duplicate"

        if provider_message_id and not message.provider_message_id:
            message.provider_message_id = provider_message_id

        current = message.status
        result = "ignored"

        if status == Message.Status.FAILED:
            # Only a message that has not yet reached the phone can fail.
            if current in (Message.Status.PENDING, Message.Status.SENT):
                code = (payload or {}).get("error_code") or "DELIVERY_FAILED"
                text, retryable = friendly_error(code)
                message.status = Message.Status.FAILED
                message.failure_code = code
                message.failure_reason = text
                message.is_retryable = retryable
                result = "applied"
        elif status in Message.RANK:
            if current != Message.Status.FAILED and Message.RANK[status] > Message.RANK[current]:
                message.status = status
                result = "applied"

        message.save()
        return result
