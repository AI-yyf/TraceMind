# Getting Started

TraceMind runs as a Vite frontend and an Express/Prisma backend. Local development uses SQLite by default; Docker Compose provides PostgreSQL and Redis for a production-like stack.

## Prerequisites

- Node.js 18 or newer
- npm 9 or newer
- Python 3.10+ when using PDF extraction scripts
- Docker and Docker Compose when running the full stack

## Backend

```bash
cd skills-backend
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

The backend listens on `http://localhost:3303` by default.

Health check:

```bash
curl http://localhost:3303/health
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend listens on `http://localhost:5173` by default.

## Model Configuration

TraceMind can run with mocked or local data for browsing, but AI-assisted generation requires model credentials. Configure providers in `skills-backend/.env` for initial bootstrap, then prefer the in-app settings/model configuration APIs for ongoing changes.

Common variables:

```bash
OMNI_DEFAULT_PROVIDER=bigmodel
OMNI_DEFAULT_BASE_URL=https://open.bigmodel.cn/api/paas/v4
OMNI_DEFAULT_API_KEY=replace-with-your-key
OMNI_LANGUAGE_MODEL=glm-5
OMNI_MULTIMODAL_MODEL=glm-4.6v
```

Do not commit real API keys.

## Docker Compose

```bash
docker compose up --build
```

Services:

- `frontend`: Nginx-served built frontend
- `backend`: Express API server
- `postgres`: production-like database
- `redis`: cache and queue-ready infrastructure

## First Workflow

1. Open the frontend.
2. Configure a language model and optional multimodal model in Settings.
3. Create or open a research topic.
4. Run search/discovery to gather candidate papers.
5. Inspect papers, evidence, figures, and node-level summaries.
6. Use Workbench or Prompt Studio for grounded follow-up and generation.
