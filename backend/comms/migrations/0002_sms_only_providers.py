from django.db import migrations, models


def migrate_legacy_providers(apps, schema_editor):
    Message = apps.get_model("comms", "Message")
    Message.objects.filter(provider="dummy_whatsapp").update(provider="dummy_sms")
    Message.objects.filter(provider="twilio_whatsapp").update(provider="twilio_sms")
    Message.objects.filter(status="read").update(status="delivered")


class Migration(migrations.Migration):
    dependencies = [("comms", "0001_initial")]

    operations = [
        migrations.RunPython(migrate_legacy_providers, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="message",
            name="provider",
            field=models.CharField(default="dummy_sms", max_length=30),
        ),
        migrations.AlterField(
            model_name="message",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("sent", "Sent"),
                    ("delivered", "Delivered"),
                    ("failed", "Failed"),
                ],
                default="pending",
                max_length=12,
            ),
        ),
    ]
