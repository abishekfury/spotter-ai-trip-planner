# Multi-stage Dockerfile for Weather-Aware Truck Routing

# Stage 1: Build Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend & Unified Server
FROM python:3.11-slim AS runner
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV DJANGO_DEBUG=false

# Install dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# Copy source code
COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Collect static files with WhiteNoise
WORKDIR /app/backend
RUN DJANGO_DEBUG=true python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "truck_routing.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]
