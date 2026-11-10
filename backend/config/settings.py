import os
from pathlib import Path
import os
import dj_database_url


BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-secret-change-me")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "comms",
]

MIDDLEWARE = [
    "comms.middleware.SimpleCorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

WSGI_APPLICATION = "config.wsgi.application"

# DATABASES = {
#     "default": {
#         "ENGINE": "django.db.backends.sqlite3",
#         "NAME": BASE_DIR / "db.sqlite3",
#         # Background send threads write at the same time as requests.
#         "OPTIONS": {"timeout": 20},
#     }
# }
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600
    )
}
if not os.environ.get("DATABASE_URL"):
    DATABASES["default"]["OPTIONS"] = {"timeout": 20}
AUTH_PASSWORD_VALIDATORS = []
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],  # single-recruiter tool, no auth
    "DEFAULT_PERMISSION_CLASSES": [],
    "EXCEPTION_HANDLER": "comms.views.api_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}

# ---- Communication provider ----
MESSAGE_PROVIDER = os.environ.get("MESSAGE_PROVIDER", "dummy_sms").strip().lower()
PROVIDER_BASE_URL = os.environ.get("PROVIDER_BASE_URL", "http://127.0.0.1:5001")
PROVIDER_API_KEY = os.environ.get("PROVIDER_API_KEY", "dummy-provider-key")
PROVIDER_TIMEOUT_SECONDS = 5
# Shared secret the provider sends with every webhook so strangers can't fake updates.
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "dummy-webhook-secret")

# Twilio SMS credentials must be configured as server-side environment variables.
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_SMS_FROM = os.environ.get("TWILIO_SMS_FROM", "")
# Public HTTPS URL ending in /api/webhooks/twilio-sms/; use a tunnel for local development.
TWILIO_SMS_STATUS_CALLBACK_URL = os.environ.get("TWILIO_SMS_STATUS_CALLBACK_URL", "").rstrip("/")

# ---- Sending behaviour ----
# Messages are sent by a small background thread pool so one slow/failed
# message never blocks the others. Set SEND_SYNC=True to run inline (tests).
SEND_SYNC = False
SEND_WORKERS = 4
# Temporary failures (timeout, 503, 429) are retried automatically this many
# times in total, waiting RETRY_BACKOFF_SECONDS * 2**attempt between tries.
MAX_SEND_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 1
MAX_BULK_RECIPIENTS = 500
