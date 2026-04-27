# Contributing to TraceMind

Thank you for helping improve TraceMind. The project values changes that make personal research workflows more traceable, reliable, understandable, and self-hostable.

TraceMind is not trying to be a generic AI demo. Contributions should strengthen its identity as an AI personal research workbench: evidence first, memory over chat, nodes over folders, and human judgment at the center.

## Development Setup

1. Install dependencies in `skills-backend/` and `frontend/`.
2. Copy `skills-backend/.env.example` to `skills-backend/.env`.
3. Run `npm run db:generate` in `skills-backend/`.
4. Start backend and frontend in separate terminals.

See [README.md](README.md) for the full public project overview and startup commands.

## Before Opening a Pull Request

- Keep changes focused and reversible.
- Do not commit API keys, local uploads, screenshots, Playwright results, or local agent notes.
- Update documentation when user workflows, routes, model configuration, or generated data contracts change.
- Explain user impact in the PR summary, not only implementation details.
- Call out known limitations honestly, especially for AI-generated or evidence-extraction behavior.
- Run relevant quality gates:

```bash
cd frontend
npm run lint
npm run type-check
npm run test -- --run

cd ../skills-backend
npm run lint
npm run type-check
npm run test
```

## Code Style

- Prefer existing services and utilities before adding new abstractions.
- Keep model-provider calls behind backend gateways.
- Keep long-running research work out of synchronous request handlers.
- Make evidence and uncertainty visible in user-facing AI output.
- Prefer small, reviewable changes over broad rewrites.
- Preserve i18n patterns for user-facing UI text.
- Keep generated demo data intentional and redistributable.

## Documentation Style

Public documentation should be practical and user-facing. A good TraceMind doc should help a new user answer:

- What problem does this solve?
- When should I use it, and when should I not?
- How do I run it locally?
- How does evidence move through the system?
- What are the current limits and risks?

Avoid committing temporary plans, local execution logs, one-off debugging notes, private screenshots, or agent instructions. If a change affects the public workflow, update `README.md` and any translated README files under `docs/` that need to stay aligned.

## Good First Contribution Areas

- Improve a specific document with clearer examples or fewer assumptions.
- Add tests around search, evidence extraction, model configuration, or API contracts.
- Improve error states and empty states in the research workbench.
- Add safe export formats that preserve source metadata.
- Improve i18n coverage without changing product meaning.
