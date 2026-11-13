"""
URL configuration for routing_core app.
"""

from django.urls import path
from .views import HealthCheckView, GeocodeView, RouteCalculationView

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('geocode/', GeocodeView.as_view(), name='geocode'),
    path('routes/', RouteCalculationView.as_view(), name='calculate-routes'),
]
