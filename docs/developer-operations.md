# Developer Operations

This page collects the commands and release hygiene expected for TraceMind development.

## Install

```bash
cd skills-backend
npm install
npm run db:generate

cd ../frontend
npm install
```

## Run

Backend:

```bash
cd skills-backend
npm run dev
```

Frontend:

```bash
cd frontend
npm run dev
```

Health check:

```bash
curl http://localhost:3303/health
```

## Quality Gates

Frontend:

```bash
cd frontend
npm run lint
npm run type-check
npm run test -- --run
npm run build
```

Backend:

```bash
cd skills-backend
npm run lint
npm run type-check
npm run test
npm run build
```

End-to-end tests:

```bash
cd frontend
npm run test:e2e
```

## Repository Hygiene

Tracked:

- source code
- Prisma schema and migrations
- curated topic configuration
- curated generated demo data needed by the frontend
- public documentation

Ignored:

- `AGENTS.md` and other local agent instruction overlays
- `node_modules/`, `dist/`, and TypeScript build info
- screenshots and visual QA output
- Playwright result folders
- local uploads and logs
- `codeexample/` external code dumps
- duplicate frontend generated snapshots

## Release Checklist

1. Confirm `git status --short` contains only intentional changes.
2. Run frontend and backend quality gates relevant to the change.
3. Confirm no API keys, uploads, screenshots, or local agent notes are staged.
4. Update docs when route contracts, model configuration, generated data, or user workflows change.
5. Commit with a decision-oriented message and push `main`.
