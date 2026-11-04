from rest_framework.response import Response
from rest_framework.views import exception_handler


def friendly_exception_handler(exc, context):
    """Return errors as {"error": "<readable message>", "details": {...}}."""
    response = exception_handler(exc, context)
    if response is None:
        return Response({"error": "Something went wrong on our side. Please try again."}, status=500)
    data = response.data
    if isinstance(data, dict) and "detail" in data:
        response.data = {"error": str(data["detail"])}
    else:
        response.data = {"error": "Please fix the highlighted fields.", "details": data}
    return response
