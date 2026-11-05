# Candidate Communication Platform

A recruiter-focused web application for managing candidates, sending individual or bulk SMS
messages through a local dummy provider, and tracking message status and communication history.

> **Demo only:** The dummy provider simulates SMS. It does not send messages to real phone
> numbers or contact a mobile network.

## Features

- Add, search, filter, select, and delete candidates.
- Validate candidate names, email addresses, and phone numbers in E.164 format.
- Send a message to one candidate or the same message to multiple candidates.
- Track each bulk recipient independently, including failures.
- View a candidate's communication history, timestamps, message statuses, and failure details.
- Receive provider status callbacks and safely ignore duplicate or outdated updates.
- Automatically retry temporary provider errors and show recruiter-friendly error messages.
- Simulate delivery, permanent failures, temporary outages, and rate limits.

## Technology

| Area | Technologies |
|---|---|
| Frontend | Next.js, React, TypeScript, Material UI, Redux Toolkit |
| Backend | Python, Django, Django REST Framework |
| Dummy message provider | Flask |
| Database | SQLite |

## Architecture

```text
Browser (Next.js)
    | REST / JSON
    v
Django REST API ---- stores candidates, messages, batches, and status events
    |
    | HTTP
    v
Flask dummy SMS provider ---- sends status callbacks to Django
```

The dummy provider runs as a separate local service to model an external communication provider.
The backend creates message records and sends messages asynchronously using an in-process worker
pool. Provider integration and error handling are implemented in
[`backend/comms/providers.py`](./backend/comms/providers.py); API views are in
[`backend/comms/views.py`](./backend/comms/views.py).

## Requirements

- Python 3.10 or later
- Node.js and npm

## Run locally on Windows

Run commands from the repository root unless noted otherwise. Open a separate terminal for each
service.

### 1. Create a Python environment, install dependencies, and migrate the database

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python backend\manage.py migrate
```

### 2. Start the dummy provider

In a second terminal:

```powershell
.\.venv\Scripts\Activate.ps1
cd dummy_provider
python app.py
```

The provider listens on `http://127.0.0.1:5001`.

### 3. Start the Django API

In a third terminal at the repository root:

```powershell
.\.venv\Scripts\Activate.ps1
python backend\manage.py runserver
```

The API listens on `http://127.0.0.1:8000`.

### 4. Start the frontend

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. By default, the frontend uses the Django API at
`http://127.0.0.1:8000`. To change the API URL, set `NEXT_PUBLIC_API_URL` in
`frontend/.env.local`; see [`frontend/.env.local.example`](./frontend/.env.local.example).
Set `NEXT_PUBLIC_USE_MOCK=true` to run the frontend-only in-memory demo instead. That mode does
not persist data or send messages. Restart the frontend after changing environment variables.

## Run locally on macOS or Linux

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python backend/manage.py migrate
```

Start each service in a separate terminal with the virtual environment activated:

```bash
cd dummy_provider && python app.py
```

```bash
python backend/manage.py runserver
```

```bash
cd frontend && npm install && npm run dev
```

Then open `http://localhost:3000`.

## Dummy-provider scenarios

The last four digits of a candidate's phone number control the simulated outcome:

| Last four digits | Simulated result |
|---|---|
| `0001` | Invalid recipient; permanent failure |
| `0002` | Provider unavailable; temporary failure and automatic retries |
| `0003` | Rate limited; temporary failure and automatic retries |
| `0004` | Message accepted, then delivery fails |
| `0005` | Message is delivered |
| `0006` | Two temporary failures, then successful send |
| Any other digits | Message is sent and delivered |

These are test scenarios, not real phone-number checks or delivery guarantees.

## API overview

All endpoints are prefixed with `/api/`.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/candidates/?search=<text>` | Search and list candidates |
| `POST` | `/candidates/` | Create a candidate |
| `GET` | `/candidates/<id>/` | Retrieve a candidate |
| `DELETE` | `/candidates/<id>/` | Delete a candidate and its communication history |
| `POST` | `/candidates/bulk-delete/` | Delete multiple candidates |
| `GET` | `/candidates/<id>/messages/` | Retrieve a candidate's communication history |
| `POST` | `/messages/` | Send one message: `{"candidate_id": 1, "body": "Hello"}` |
| `POST` | `/messages/bulk/` | Send bulk: `{"candidate_ids": [1, 2], "body": "Hello"}` |
| `GET` | `/messages/<id>/` | Retrieve a message and its delivery or failure details |
| `GET` | `/batches/<id>/` | Retrieve bulk-send results and status counts |
| `POST` | `/webhooks/provider/` | Receive status callbacks from the dummy provider |

Phone numbers must include a country code in E.164 format, for example `+919876543210`. Bulk
sends create an independently tracked message for each candidate and return a batch ID.

## Tests and checks

From the repository root:

```powershell
python backend\manage.py test comms
```

For the frontend TypeScript check:

```powershell
cd frontend
npm run typecheck
```

## Assumptions and limitations

- This demo sends simulated SMS only. It does not send real SMS or WhatsApp messages.
- SMS does not provide read receipts; statuses are `pending`, `sent`, `delivered`, or `failed`.
- The dummy provider and its in-memory state are intended for local development and demonstrations.
- Temporary send failures are retried automatically. Recruiters cannot manually retry failed
  messages from the interface.
- Message templates, scheduled messages, provider-health monitoring, and recruiter
  authentication are not implemented.
- The backend uses SQLite and an in-process thread pool. Pending sends are not automatically
  re-queued if the backend stops.
- The API has no recruiter authentication and uses permissive CORS for development. Do not expose
  it publicly with real candidate data without adding authentication, production settings,
  restricted CORS, and persistent database storage.
