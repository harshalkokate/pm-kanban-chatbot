# Stage 1: Build Next.js frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Python backend
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Install backend dependencies (cached layer)
COPY backend/pyproject.toml backend/
RUN cd backend && uv sync --no-dev

# Copy built frontend as static files
COPY --from=frontend-builder /app/frontend/out/ static/

# Copy backend source
COPY backend/ backend/

EXPOSE 8000
WORKDIR /app/backend
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
