#!/bin/bash
set -e

cd "$(dirname "$0")/.."

[ -f .env ] || touch .env

mkdir -p data

docker build -t pm-app .
docker run -d \
  --name pm-app \
  -p 8000:8000 \
  -v "$(pwd)/data:/app/data" \
  --env-file .env \
  pm-app

echo "App running at http://localhost:8000"
