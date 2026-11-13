"""Thin API views: validate input, delegate to services, map errors to HTTP."""

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import RouteRequestSerializer
from .services.geocoding import search_places
from .services.planner import plan_trip
from .services.weather import WeatherUnavailable

logger = logging.getLogger(__name__)


class HealthCheckView(APIView):
    def get(self, request):
        return Response({"status": "healthy", "service": "Weather-Aware Truck Routing API"})


class GeocodeView(APIView):
    def get(self, request):
        return Response(search_places(request.query_params.get("q", "")))


class RouteCalculationView(APIView):
    def post(self, request):
        serializer = RouteRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Invalid request.", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        v = serializer.validated_data
        try:
            payload = plan_trip(
                (v["origin"]["lat"], v["origin"]["lng"]),
                (v["destination"]["lat"], v["destination"]["lng"]),
                v["departure_time"],
                v["load_weight"],
                v["sample_interval_miles"],
            )
        except WeatherUnavailable as exc:
            return Response({"error": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        payload["request_params"].update(origin=v["origin"], destination=v["destination"])
        return Response(payload)
