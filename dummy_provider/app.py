"""Dummy SMS provider. Runs as its own service, separate from Django.

    python app.py            # listens on http://127.0.0.1:5001

API
  POST /v1/messages   {"to": "+91...", "body": "...", "reference": "<caller's id>"}
                      -> 202 {"id": "SM..."}  or an error (see magic numbers)
  GET  /v1/messages/<id>   current status of a message
  GET  /health

After accepting a message it calls the main app's webhook with
sent -> delivered (with small delays), like a real SMS provider.
Webhook calls are sent twice for "delivered" to prove the receiver is idempotent.

Magic phone numbers (last 4 digits) to simulate problems:
  0001  invalid recipient          -> 400 INVALID_RECIPIENT (permanent)
  0002  provider outage            -> 503 (temporary)
  0003  rate limited               -> 429 + Retry-After (temporary)
  0004  accepted, then delivery fails -> webhook "failed"
  0005  accepted and delivered -> webhook stops at "delivered"
  0006  flaky: first 2 calls 503, then works -> shows automatic retry
  anything else                    -> sent, delivered
"""
import os
import threading
import time
import uuid

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

API_KEY = os.environ.get("PROVIDER_API_KEY", "dummy-provider-key")
WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "http://127.0.0.1:8000/api/webhooks/provider/")
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "dummy-webhook-secret")
STEP_DELAY = float(os.environ.get("STEP_DELAY", "2"))  # seconds between status updates

MESSAGES = {}  # id -> dict
FLAKY_CALLS = {}  # phone -> number of calls so far
lock = threading.Lock()


def fire_webhook(msg, status, error_code=None):
    payload = {
        "event_id": f"evt_{uuid.uuid4().hex[:12]}",
        "message_id": msg["id"],
        "reference": msg["reference"],
        "status": status,
    }
    if error_code:
        payload["error_code"] = error_code
    msg["status"] = status
    # Deliver; retry a few times if the main app is down, like real providers do.
    for attempt in range(4):
        try:
            r = requests.post(
                WEBHOOK_URL, json=payload, headers={"X-Webhook-Secret": WEBHOOK_SECRET}, timeout=5
            )
            if r.status_code < 500:
                return payload
        except requests.RequestException:
            pass
        time.sleep(2 ** attempt)
    return payload


def lifecycle(msg):
    phone_tail = msg["to"][-4:]
    time.sleep(STEP_DELAY)
    fire_webhook(msg, "sent")
    time.sleep(STEP_DELAY)
    if phone_tail == "0004":
        fire_webhook(msg, "failed", error_code="DELIVERY_FAILED")
        return
    payload = fire_webhook(msg, "delivered")
    # Duplicate delivery of the exact same event: receiver must ignore it.
    try:
        requests.post(WEBHOOK_URL, json=payload, headers={"X-Webhook-Secret": WEBHOOK_SECRET}, timeout=5)
    except requests.RequestException:
        pass


@app.post("/v1/messages")
def send():
    if request.headers.get("Authorization") != f"Bearer {API_KEY}":
        return jsonify(code="UNAUTHORIZED", message="Bad API key"), 401

    data = request.get_json(silent=True) or {}
    to, body = data.get("to", ""), data.get("body", "")
    if not to or not body:
        return jsonify(code="BAD_REQUEST", message="'to' and 'body' are required"), 400

    tail = to[-4:]
    if tail == "0001":
        return jsonify(code="INVALID_RECIPIENT", message=f"{to} is not a valid SMS number"), 400
    if tail == "0002":
        return jsonify(code="SERVICE_UNAVAILABLE", message="Provider is down"), 503
    if tail == "0003":
        resp = jsonify(code="RATE_LIMITED", message="Too many requests")
        resp.headers["Retry-After"] = "2"
        return resp, 429
    if tail == "0006":
        with lock:
            FLAKY_CALLS[to] = FLAKY_CALLS.get(to, 0) + 1
            if FLAKY_CALLS[to] <= 2:
                return jsonify(code="SERVICE_UNAVAILABLE", message="Temporary glitch"), 503

    msg = {
        "id": f"SM{uuid.uuid4().hex[:16]}",
        "to": to,
        "body": body,
        "reference": data.get("reference"),
        "status": "queued",
    }
    MESSAGES[msg["id"]] = msg
    threading.Thread(target=lifecycle, args=(msg,), daemon=True).start()
    return jsonify(id=msg["id"], status="queued"), 202


@app.get("/v1/messages/<msg_id>")
def get_message(msg_id):
    msg = MESSAGES.get(msg_id)
    if not msg:
        return jsonify(code="NOT_FOUND", message="Unknown message"), 404
    return jsonify(id=msg["id"], status=msg["status"], to=msg["to"])


@app.get("/health")
def health():
    return jsonify(status="ok", messages=len(MESSAGES))


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5001")), threaded=True)
