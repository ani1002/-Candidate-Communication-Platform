from django.contrib import admin

from .models import BulkBatch, Candidate, Message, MessageStatusEvent

admin.site.register(Candidate)
admin.site.register(BulkBatch)
admin.site.register(Message)
admin.site.register(MessageStatusEvent)
