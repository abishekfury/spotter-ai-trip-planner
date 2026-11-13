#!/usr/bin/env bash
set -e

echo "=== Starting SafeHaul Weather-Aware Truck Routing ==="

# Check if frontend dist exists
if [ ! -d "frontend/dist" ]; then
  echo "Building React frontend..."
  cd frontend
  npm install
  npm run build
  cd ..
fi

echo "Starting Django backend on http://127.0.0.1:8000..."
cd backend
if [ -d ".venv" ]; then
  .venv/bin/python manage.py migrate --noinput
  .venv/bin/python manage.py collectstatic --noinput
  .venv/bin/python manage.py runserver 0.0.0.0:8000
else
  python manage.py migrate --noinput
  python manage.py collectstatic --noinput
  python manage.py runserver 0.0.0.0:8000
fi
