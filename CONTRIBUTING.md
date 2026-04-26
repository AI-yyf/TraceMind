# Contributing to TraceMind

Thank you for helping improve TraceMind. The project values changes that make research workflows more traceable, reliable, and understandable.

## Development Setup

1. Install dependencies in `skills-backend/` and `frontend/`.
2. Copy `skills-backend/.env.example` to `skills-backend/.env`.
3. Run `npm run db:generate` in `skills-backend/`.
4. Start backend and frontend in separate terminals.

See [Getting Started](docs/getting-started.md) for full commands.

## Before Opening a Pull Request

- Keep changes focused and reversible.
- Do not commit API keys, local uploads, screenshots, Playwright results, or local agent notes.
- Update documentation when user workflows, routes, model configuration, or generated data contracts change.
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

## Documentation Style

Public documentation should be practical and user-facing. Avoid committing temporary plans, local execution logs, or one-off debugging notes.
