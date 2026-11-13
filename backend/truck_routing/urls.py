"""
URL configuration for truck_routing project.
"""

from pathlib import Path
from django.contrib import admin
from django.urls import path, include, re_path
from django.http import HttpResponse, FileResponse
from django.conf import settings

def serve_react(request):
    index_file = settings.FRONTEND_DIR / 'index.html'
    if index_file.exists():
        return FileResponse(open(index_file, 'rb'), content_type='text/html')
    return HttpResponse("SafeHaul API is running. Run `cd frontend && npm run build` to compile frontend.", content_type="text/plain")

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('routing_core.urls')),
    re_path(r'^(?!api|admin|static).*$', serve_react, name='react-app'),
]
