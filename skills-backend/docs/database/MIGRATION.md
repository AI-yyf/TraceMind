# Database and deployment migration notes

## Current default

The repository currently defaults to:
- Prisma
- SQLite for lightweight local development
- backend port `3303`

That means `PostgreSQL` is available, but it is not the mandatory day-one local setup for this repository.

## When PostgreSQL or Redis becomes worth it

Move to a heavier deployment shape when you actually need one of these:
- a shared multi-user environment
- persistent queues or more complex job orchestration
- stronger concurrency, backup, or service deployment requirements
- the full stack defined in the root `docker-compose.yml`

## Default local development path

```bash
cd skills-backend
npm install
npm run dev
```

The effective database is controlled by `prisma/schema.prisma` and your local `DATABASE_URL`. The current repository and test flow still support SQLite-based development.

## If you migrate to PostgreSQL

Treat it as an explicit architecture decision rather than a casual local step:

1. Update the datasource provider in `prisma/schema.prisma`.
2. Update `DATABASE_URL`.
3. Regenerate the Prisma client.
4. Run the migration or `db push`.
5. Re-verify backend routes, schedulers, research jobs, and model configuration flows.

## Docker path

The root `docker-compose.yml` already provides a fuller environment with PostgreSQL, Redis, and application services. If you use that path, trust the ports and service names defined in compose instead of older historical notes.

## Current recommendation

- For fast local development, prefer SQLite.
- For a fuller orchestrated stack, use the root `docker-compose.yml`.
- For a formal database migration, record the reason clearly in the PR description or an issue before implementation.
