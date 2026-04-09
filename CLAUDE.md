# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Project Management MVP — a Kanban board web app with AI chat. See `AGENTS.md` for business requirements and `docs/PLAN.md` for the 10-part build plan. Always read `docs/PLAN.md` before starting work.

**Stack:** Next.js 16 frontend (TypeScript, Tailwind v4, dnd-kit) + Python FastAPI backend + SQLite + Docker. FastAPI serves the statically built Next.js site at `/`. AI via OpenRouter (`openai/gpt-oss-120b`). Package manager for Python: `uv`.

**Auth:** Hardcoded credentials — username `user`, password `password`. One board per user.

## Docker / Running the App

```bash
./scripts/start.sh   # build image and run container on http://localhost:8000
./scripts/stop.sh    # stop and remove container
```

The container is named `pm-app`. The image tag is `pm-app`. Port 8000 is exposed. `.env` in the project root is passed into the container automatically.

## Backend

FastAPI app in `backend/`. Entry point: `backend/main.py`.

- Serves static files from `static/` at `/`
- API routes at `/api/`
- `GET /api/health` — liveness check

Run locally (without Docker) from `backend/`:
```bash
uv sync --dev
uv run uvicorn main:app --reload --port 8000
uv run pytest tests/   # backend unit tests
```

The Dockerfile is a two-stage build: Stage 1 builds the Next.js frontend (`npm run build` → `frontend/out/`); Stage 2 copies that output as `static/` for FastAPI to serve. The `static/` directory at the project root is a placeholder used only for local backend development without Docker.

## Frontend Commands

All run from `frontend/`:

```bash
npm run dev          # dev server on http://127.0.0.1:3000
npm run build        # production build (outputs to out/ for FastAPI to serve)
npm run lint         # eslint
npm run test         # vitest unit tests (run once)
npm run test:unit:watch  # vitest in watch mode
npm run test:e2e     # playwright e2e (requires dev server running or starts one)
npm run test:all     # unit + e2e
```

Run a single vitest test file:
```bash
npx vitest run src/components/KanbanBoard.test.tsx
```

## Frontend Architecture

```
frontend/src/
  app/          # Next.js App Router — page.tsx renders <KanbanBoard />
  components/   # KanbanBoard, KanbanColumn, KanbanCard, KanbanCardPreview, NewCardForm
  lib/
    kanban.ts   # Core types (Card, Column, BoardData), moveCard logic, createId
  test/         # vitest setup
```

`KanbanBoard` owns all board state. Column operations (rename, add card, delete card) and drag-and-drop are handled here via dnd-kit. `moveCard` in `lib/kanban.ts` is pure logic — easy to unit test. IDs are generated with `createId(prefix)`.

Unit tests live alongside source files (`*.test.ts/tsx`). E2e tests are in `frontend/tests/`.

## Color Scheme (CSS variables)

- `--accent-yellow`: `#ecad0a`
- `--primary-blue`: `#209dd7`
- `--secondary-purple`: `#753991`
- `--navy-dark`: `#032147`
- `--gray-text`: `#888888`

## Coding Standards

- No over-engineering. No unnecessary defensive programming. No extra features.
- Use latest versions of libraries and idiomatic approaches.
- No emojis anywhere — code, comments, docs.
- When hitting issues, identify root cause with evidence before fixing.


## DETAILED PLAN

@docs/PLAN.md