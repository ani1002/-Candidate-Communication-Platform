# Candidate Communication Platform

A web app for recruiters to manage candidates, send individual or bulk SMS messages, and review
message status and communication history.

The project has a **Next.js frontend** and a **Django REST API**. For local development, a
separate Flask dummy SMS provider simulates message delivery and provider failures without
contacting real phone numbers. Twilio SMS is available when real messaging credentials and an
SMS-capable Twilio number are configured.

> **SMS costs money.** The dummy provider is free for local testing, but it does not deliver
> actual text messages. Twilio trial accounts may only send to verified recipient numbers.
> Standard SMS does not provide read receipts.

## Features

- Add, search, filter, select, and delete candidates.
- Send a message to one or multiple selected candidates.
- View each candidate's message history, timestamp, latest status, and failure explanation.
- Track SMS as `pending`, `sent`, `delivered`, or `failed`.
- Receive provider status callbacks; reject invalid Twilio webhook signatures.
- Retry transient provider errors and report common failures in recruiter-friendly language.
- Simulate delivery, temporary outages, rate limits, and failures with the local dummy provider.

## Technology

| Area | Technologies |
|---|---|
| Frontend | Next.js App Router, React, TypeScript, Material UI, Redux Toolkit |
| Backend | Python, Django, Django REST Framework |
| Local SMS simulation | Flask |
| Real SMS provider | Twilio Programmable Messaging |
| Local database | SQLite |

## Architecture

```text
Browser (Next.js)
    |
    | REST / JSON
    v
Django REST API ---- creates message records and queues sends
    |
    +---- Dummy SMS provider (Flask, local development)
    |
    +---- Twilio SMS (when MESSAGE_PROVIDER=twilio_sms)
                   |
                   +---- signed status callback -> Django
```

The backend stores candidates, messages, batches, and provider status events in SQLite. A small
in-process thread pool sends messages asynchronously; the database record is created before the
send is queued. Provider-specific API calls and error mapping live in
[`backend/comms/providers.py`](./backend/comms/providers.py). Candidate/message API views are in
[`backend/comms/views.py`](./backend/comms/views.py).

## Run locally

You need Python, Node.js, and npm. The commands below use PowerShell on Windows; equivalent
commands for macOS/Linux are shown afterward.

### 1. Install Python dependencies and migrate the database

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python backend\manage.py migrate
```

### 2. Start the dummy SMS provider

Open a second terminal at the repository root:

```powershell
.\.venv\Scripts\Activate.ps1
cd dummy_provider
python app.py
```

It listens on `http://127.0.0.1:5001`. This provider simulates SMS; it does not send messages to
mobile networks.

### 3. Start the Django API

Open a third terminal at the repository root:

```powershell
.\.venv\Scripts\Activate.ps1
python backend\manage.py runserver
```

The API is available at `http://127.0.0.1:8000`.

### 4. Start the frontend

Open another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The frontend uses the Django API by default. Its local example
environment file is [`frontend/.env.local.example`](./frontend/.env.local.example). Copy it to
`frontend/.env.local` if you want to configure the API URL or switch to the in-memory frontend
demo:

```powershell
Copy-Item .env.local.example .env.local
```

Set `NEXT_PUBLIC_USE_MOCK=true` to use frontend-only in-memory data. This demo does not persist
data and does not send real SMS. Restart the frontend after changing its environment variables.

### macOS/Linux quick commands

From the repository root, create and activate a virtual environment, install dependencies, and
migrate:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python backend/manage.py migrate
```

Then start the Flask provider in one terminal:

```bash
cd dummy_provider
python app.py
```

Start Django in another terminal from the repository root:

```bash
python backend/manage.py runserver
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

## Send real SMS with Twilio

You need a Twilio account and an SMS-capable Twilio number. Configure these variables in the
**backend process environment** or your backend host's environment settings:

| Variable | Purpose |
|---|---|
| `MESSAGE_PROVIDER` | Set to `twilio_sms` |
| `TWILIO_ACCOUNT_SID` | Twilio account or subaccount SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_SMS_FROM` | Your SMS-capable Twilio number in E.164 format, e.g. `+12545550123` |
| `TWILIO_SMS_STATUS_CALLBACK_URL` | Optional public HTTPS callback ending in `/api/webhooks/twilio-sms/` |

PowerShell example (replace placeholders locally; **never commit real values**):

```powershell
$env:MESSAGE_PROVIDER = "twilio_sms"
$env:TWILIO_ACCOUNT_SID = "AC..."
$env:TWILIO_AUTH_TOKEN = "..."
$env:TWILIO_SMS_FROM = "+12545550123"
$env:TWILIO_SMS_STATUS_CALLBACK_URL = "https://your-public-host/api/webhooks/twilio-sms/"
python backend\manage.py runserver
```

The project reads environment variables with Python's `os.environ`; it does not automatically
load `backend/.env`. Set variables in the shell before starting Django, or use your hosting
platform's environment-variable settings. Keep the Auth Token server-side only—never put it in
the frontend or a `NEXT_PUBLIC_` variable.

Twilio requires the sender number to belong to the configured account and support SMS. Trial
accounts may restrict recipients to verified numbers; number capabilities, destination-country
rules, consent requirements, and costs depend on the account and destination. The `+1` sender in
the example is illustrative and may not be able to send internationally.

For status updates, Twilio must be able to reach the callback URL over public HTTPS. For local
development, use a secure tunnel to expose the Django server and set the callback URL to that
tunnel address. The webhook verifies Twilio's signature using `TWILIO_AUTH_TOKEN`. SMS supports
delivery states, not read receipts.

## API overview

All endpoints are prefixed with `/api/`.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/candidates/?search=<text>` | Search and list candidates (paginated) |
| `POST` | `/candidates/` | Create a candidate |
| `GET` | `/candidates/<id>/` | Retrieve a candidate |
| `DELETE` | `/candidates/<id>/` | Delete a candidate and their message history |
| `POST` | `/candidates/bulk-delete/` | Delete multiple candidates |
| `GET` | `/candidates/<id>/messages/` | Retrieve candidate communication history |
| `POST` | `/messages/` | Send one message: `{"candidate_id": 1, "body": "Hello"}` |
| `POST` | `/messages/bulk/` | Send to multiple candidates: `{"candidate_ids": [1, 2], "body": "Hello"}` |
| `GET` | `/messages/<id>/` | Retrieve a message and its delivery/failure details |
| `GET` | `/batches/<id>/` | Retrieve bulk-send results and status counts |
| `POST` | `/webhooks/twilio-sms/` | Receive signed Twilio SMS status callbacks |
| `POST` | `/webhooks/provider/` | Receive dummy-provider callbacks (requires `X-Webhook-Secret`) |

Candidate phone numbers must include a country code in E.164 format, for example
`+919876543210`. Bulk sends create an individual message record for each candidate and return a
batch ID; query the batch endpoint to view each recipient's result.

## Dummy SMS test cases

The dummy provider uses the last four digits of the recipient phone number to simulate outcomes:

| Last four digits | Simulated result |
|---|---|
| `0001` | Invalid recipient; permanent failure |
| `0002` | Provider unavailable; retried, then fails |
| `0003` | Rate limited; retried, then fails |
| `0004` | Accepted, then delivery fails via callback |
| `0005` | Delivered |
| `0006` | Two temporary failures, then successful send |
| Other | Sent and delivered |

These are simulation rules only; they do not represent actual phone-number validity.

## Tests and checks

From the repository root:

```powershell
python backend\manage.py test comms
cd frontend
npm run typecheck
```

## Deployment and security notes

- Deploy the frontend and Django API as separate services; the frontend's
  `NEXT_PUBLIC_API_URL` must point to the deployed API.
- The backend currently uses SQLite. For deployment, use storage that persists across restarts;
  ephemeral filesystems can lose the database. A hosted database such as PostgreSQL requires
  additional database configuration in the backend.
- The API currently has no recruiter authentication and uses permissive CORS for development.
  Do not expose it publicly with real candidate data until authentication, restricted CORS,
  production Django settings, and appropriate database backups are configured.
- The background send thread pool is process-local. If the server stops during a send, pending
  rows remain in the database but are not automatically re-queued after restart.
- Provider status updates are deduplicated and older updates cannot move a message backward.
- Messages are sent only while their status is `pending`, preventing duplicate sends from
  repeated worker calls.

## Assumptions and limitations

- This app sends **SMS**, not WhatsApp.
- SMS does not report whether a recipient read a message.
- Real SMS delivery requires an external provider account and may incur fees.
- The local dummy provider is for development and demonstrations only.
- Recruiter authentication, manual retry, and persistent background job processing are not
  implemented.
