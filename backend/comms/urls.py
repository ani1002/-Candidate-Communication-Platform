from django.urls import path

from . import views

urlpatterns = [
    path("candidates/", views.CandidateListCreate.as_view()),
    path("candidates/bulk-delete/", views.BulkDeleteCandidates.as_view()),
    path("candidates/<int:pk>/", views.CandidateDetail.as_view()),
    path("candidates/<int:pk>/messages/", views.CandidateHistory.as_view()),
    path("messages/", views.SendMessage.as_view()),
    path("messages/bulk/", views.BulkSend.as_view()),
    path("messages/<int:pk>/", views.MessageDetail.as_view()),
    path("batches/<int:pk>/", views.BatchDetail.as_view()),
    path("webhooks/provider/", views.ProviderWebhook.as_view()),
    path("webhooks/twilio-sms/", views.TwilioStatusWebhook.as_view()),
]
