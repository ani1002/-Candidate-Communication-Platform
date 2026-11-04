# Candidate Communication Platform: Backend

Django + DRF main app, plus a **separate** dummy SMS provider (Flask) for local development and
a Twilio SMS provider for configured deployments.

## Run (3 terminals)

```bash
pip install -r requirements.txt

# 1) one-time DB setup
cd backend && python manage.py migrate

# 2) optional dummy provider for local development (port 5001)
cd dummy_provider && python app.py            # STEP_DELAY=1 python app.py  for faster updates

# 3) Django API (port 8000)
cd backend && python manage.py runserver

# tests (no servers needed)
cd backend && python manage.py test comms
```

No Redis/Celery needed: sending uses a small background thread pool.

## Twilio SMS setup

The dummy SMS provider remains the default and does not send real text messages. To send SMS
through Twilio, use a Twilio account and an SMS-capable phone number, then configure these
**backend process environment variables** before starting Django. Never put Twilio credentials
in the frontend or `NEXT_PUBLIC_` variables:

```powershell
$env:MESSAGE_PROVIDER = "twilio_sms"
$env:TWILIO_ACCOUNT_SID = "AC..."
$env:TWILIO_AUTH_TOKEN = "..."
$env:TWILIO_SMS_FROM = "+14155550123"
$env:TWILIO_SMS_STATUS_CALLBACK_URL = "https://your-public-host/api/webhooks/twilio-sms/"
python manage.py runserver
```

`TWILIO_SMS_FROM` must be your Twilio SMS-capable number in E.164 format. Twilio SMS is a paid
service; costs, number availability, trial-account restrictions, and destination-country
permissions depend on your Twilio account. Recipients must have consented to receive your texts.
The callback URL must be the exact public HTTPS endpoint reachable by Twilio. For local testing,
expose the Django port with a secure tunnel and set its HTTPS callback URL here. Delivery updates
are signature-verified using the Twilio auth token. If the callback URL is omitted, SMS can still
be submitted to Twilio, but delivery statuses will not be updated. SMS delivery reports can show
sent, delivered, or failed; standard SMS does not provide a read receipt.

## API

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/candidates/?search=` | list / search (paginated: `count`, `results`; includes latest `last_message` and `status`, null if no messages) |
| POST | `/api/candidates/` | add `{name, phone (+countrycode), email?}` |
| GET, DELETE | `/api/candidates/<id>/` | details / delete one (message history is deleted too) |
| POST | `/api/candidates/bulk-delete/` | delete `{candidate_ids: [1,2,3]}`; returns `deleted` and `not_found` IDs |
| GET | `/api/candidates/<id>/messages/` | communication history, newest first |
| POST | `/api/messages/` | send one `{candidate_id, body}` |
| POST | `/api/messages/bulk/` | send many `{candidate_ids: [..], body}` -> returns batch |
| GET | `/api/batches/<id>/` | per-candidate results + `summary` counts (poll this) |
| GET | `/api/messages/<id>/` | one message |
| POST | `/api/webhooks/provider/` | provider status updates (header `X-Webhook-Secret`) |
| POST | `/api/webhooks/twilio-sms/` | signed Twilio SMS delivery status callback |

Set `MESSAGE_PROVIDER=twilio_sms` to route new messages through Twilio; existing stored messages
are migrated to the SMS provider name. Twilio credentials and sender configuration are read only
from backend environment variables. Twilio delivery callbacks require the configured public HTTPS
`TWILIO_SMS_STATUS_CALLBACK_URL`.

Errors are always `{"error": "readable text", "details": {...}}`.
Bulk delete requires a non-empty list of positive candidate IDs. Unknown IDs are skipped and
returned in `not_found`; deleting candidates also deletes their linked messages and history.
Statuses: `pending -> sent -> delivered`, or `failed` (with `failure_reason`, `is_retryable`).
SMS does not provide read receipts.

## Dummy provider magic numbers (last 4 digits)

| Number ends | Behaviour |
|---|---|
| 0001 | invalid recipient (permanent fail) |
| 0002 | provider down, 503 (retried, then failed as retryable) |
| 0003 | rate limited, 429 + Retry-After (retried, then failed as retryable) |
| 0004 | accepted, then delivery fails via webhook |
| 0005 | delivered |
| 0006 | flaky: 503 twice, then succeeds (shows auto-retry) |
| other | sent, delivered |

## How the tricky parts work

- **Bulk:** one `Message` row per candidate, all created `pending` in one transaction, then queued
  individually. One failure never affects the others.
- **Duplicate webhook:** every update is stored in `MessageStatusEvent` with a unique `event_id`;
  a repeat is ignored (still answers 200).
- **Out-of-order updates:** statuses have a rank (sent < delivered); an update is applied
  only if it moves forward. `failed` only applies before delivery.
- **Webhook racing the send:** we send our own message id as `reference` and the provider echoes it,
  so the webhook finds the message even before the provider id is saved.
- **Failures:** provider errors are mapped to a code, a friendly message and a retryable flag
  (`providers.py`). Temporary ones auto-retry up to 3 times with backoff; permanent ones fail at once.
- **No double send:** a message is sent only while it is `pending`.

## Known limits (honest list)

- Thread pool is in-process: if the server dies mid-send, messages stay `pending` (rows survive,
  but nothing re-queues them automatically). Celery + Redis would fix this.
- Dummy provider keeps messages in memory.
- No auth (single recruiter), no manual retry endpoint yet.
- Webhook uses a shared secret header, not per-request signatures.
