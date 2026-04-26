# Architecture

TraceMind is built around a research loop:

```text
topic intent
  -> academic search
  -> candidate filtering
  -> PDF/evidence extraction
  -> research node modeling
  -> judgment and synthesis
  -> grounded conversation
  -> exportable artifacts
```

## Main Components

- `frontend/`: React + Vite application for the research workbench, topic pages, node reading, settings, and Prompt Studio.
- `skills-backend/`: Express API, Prisma persistence, search aggregation, PDF extraction, topic runtime services, scheduling, and model routing.
- `generated-data/`: curated topic/paper data and static paper assets used by the app.
- `model-runtime/`: experimental connector runtime for model and agent integrations.

## Frontend Boundary

The frontend owns:

- routing and page composition
- topic, node, research, settings, prompt studio, and workbench UI
- i18n and bilingual display state
- local reading workspace state
- typed API access and client-side presentation models

The frontend does not own long-running research orchestration. It asks the backend to search, generate, extract, configure models, or synchronize topic data.

## Backend Boundary

The backend owns:

- API route contracts under `/api/*`
- model configuration and Omni Gateway routing
- academic search providers and source health
- PDF, figure, formula, and evidence extraction
- topic graph, paper association, research reports, and scheduler services
- generated runtime materialization from `topic-config/` into `generated-data/`

## Data Boundary

TraceMind separates three data classes:

- Source code and configuration: tracked in Git.
- Curated demo/runtime data: tracked when required for the application to render useful examples.
- Local runtime output: ignored by Git, including screenshots, Playwright result folders, uploads, local agent notes, and temporary search dumps.

## Model Boundary

Model calls should go through Omni Gateway and model configuration services. Direct provider calls are kept behind connectors and service boundaries so the UI can switch providers without code changes.

## Reliability Posture

TraceMind is designed to keep evidence and uncertainty visible. The product should prefer a grounded partial answer over a polished unsupported claim.
