# Open Source References

TraceMind is an integration-heavy research workbench. It builds on established open-source frameworks and open academic APIs rather than reinventing every layer.

## Application Frameworks

- [React](https://react.dev/) powers the frontend component model.
- [Vite](https://vite.dev/guide/) powers frontend development and builds.
- [Express](https://expressjs.com/) powers the backend HTTP API.
- [Prisma](https://www.prisma.io/docs) provides database schema and client tooling.
- [SQLite](https://sqlite.org/) is used for lightweight local development.
- [PostgreSQL](https://www.postgresql.org/) is used by the Docker Compose stack.
- [Redis](https://redis.io/) is included for cache and queue-ready infrastructure.

## Frontend and QA Libraries

- [React Router](https://reactrouter.com/) supports application routing.
- [Tailwind CSS](https://tailwindcss.com/) supports utility-first styling.
- [Vitest](https://vitest.dev/) supports unit tests.
- [Playwright](https://playwright.dev/) supports end-to-end tests.
- [Zod](https://zod.dev/) supports runtime schema validation.

## AI and Model Provider APIs

- [OpenAI API](https://platform.openai.com/docs) compatible endpoints can be routed through Omni Gateway.
- [Anthropic API](https://docs.anthropic.com/) is supported through the backend model layer.
- [Google Gemini API](https://ai.google.dev/gemini-api/docs) is supported through the backend model layer.
- BigModel/GLM compatible endpoints can be configured through the Omni provider settings.

## Academic Data and Reading Ecosystem

- [arXiv API](https://info.arxiv.org/help/api/index.html) informs paper discovery.
- [OpenAlex](https://docs.openalex.org/) informs open scholarly metadata lookup.
- [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) informs DOI and bibliographic metadata lookup.
- [Semantic Scholar API](https://www.semanticscholar.org/product/api) informs citation and paper metadata lookup.
- [Zotero Web API](https://www.zotero.org/support/dev/web_api/v3/start) informs export and reference-management workflows.
- [PyMuPDF](https://pymupdf.readthedocs.io/) informs local PDF parsing and extraction scripts.

## Design Influence

TraceMind borrows the idea of a contextual research workspace from modern reading, note-taking, and AI assistant products: keep the source, evidence, model output, and user judgment adjacent. The project does not vendor or copy those products; it implements its own topic/node/evidence workflow on top of the open components listed above.
