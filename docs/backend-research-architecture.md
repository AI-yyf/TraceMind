# Backend Research Architecture

TraceMind's backend is an Express application with Prisma persistence, academic search aggregation, PDF extraction, topic runtime services, and model routing.

## API Surface

The backend exposes stable routes under `/api/*`:

- `/api/topics`: topic dashboard, topic graph, topic runtime views
- `/api/papers`: paper metadata and reading assets
- `/api/nodes`: research node views and node-level evidence
- `/api/search`: academic search aggregation
- `/api/pdf`: PDF extraction and grounding
- `/api/research`: research reports and research actions
- `/api/tasks`: scheduled/background task status
- `/api/model-configs`: model provider configuration
- `/api/omni`: unified model gateway operations
- `/api/prompt-templates`: Prompt Studio and external-agent job packages
- `/api/evidence`: evidence references and traceable support material
- `/api/zotero`: reference-management export

Health checks are available at `/health` and `/api/health`.

## Research Pipeline

The research loop is implemented as layered services:

1. Topic configuration starts from `skills-backend/topic-config/`.
2. Topic materialization writes runtime data into `generated-data/app-data/`.
3. Search aggregation collects academic candidates from provider services.
4. PDF and grounding services extract text, figures, formulas, and citations.
5. Topic/node services connect papers to research stages and node views.
6. Editorial services generate structured reading and synthesis artifacts.
7. Scheduler services keep longer-running topic refresh and monitoring workflows separate from request/response paths.

## Model Gateway

Model calls should be routed through the Omni layer:

- `src/services/omni/gateway.ts`: runtime dispatch
- `src/services/omni/config-store.ts`: persisted provider configuration
- `src/services/omni/catalog.ts`: model/provider capability catalog
- `src/services/omni/validation-schemas.ts`: provider configuration validation

This keeps provider credentials and model choices out of UI code and avoids hardcoded SDK calls in feature services.

## Search Providers

Search provider services live under `src/services/search/`:

- arXiv integration through topic/search services
- OpenAlex metadata lookup
- Crossref DOI and bibliography lookup
- Semantic Scholar paper/citation lookup
- source health tracking

The aggregator is responsible for deduplication, normalization, and scoring. Feature code should call the aggregator instead of calling providers directly.

## PDF and Evidence

PDF extraction combines TypeScript service orchestration with Python helper scripts for parsing and rendering. Extracted assets are served through controlled static routes and normalized into evidence records so generated summaries can point back to source material.

## Generated Data

`generated-data/app-data/` is the frontend-readable runtime snapshot. `generated-data/public/papers/` contains curated paper assets used by demo topics and local exploration. Temporary screenshots, search dumps, and QA references are ignored.

## Operational Rules

- Keep long-running work outside synchronous request handlers.
- Do not commit real API keys or local uploads.
- Use Prisma migrations for schema changes.
- Prefer extending existing topic/search/model services over adding parallel pathways.
