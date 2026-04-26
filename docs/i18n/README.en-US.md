# TraceMind

TraceMind is an AI personal research workbench for serious reading and investigation. It connects paper discovery, evidence extraction, research nodes, judgment writing, and grounded follow-up into one traceable loop.

It is not just a chatbot or a paper list. It helps individual researchers maintain a long-running research workspace around a topic.

## What It Solves

- Research material is scattered across paper databases, PDFs, notes, and chat history.
- AI answers can sound fluent while hiding the evidence path.
- Research topics evolve over time, but ordinary chat tools lack durable topic memory.

TraceMind keeps papers, figures, formulas, citations, nodes, and conversations in one context so researchers can inspect the evidence behind each claim.

## How To Use It

1. Start the backend and frontend.
2. Configure a language model and optional vision model in Settings.
3. Create or open a research topic.
4. Run paper discovery and review candidates.
5. Read node pages with evidence, figures, formulas, and citations.
6. Continue grounded questioning in the workbench and export artifacts.

## How It Works

TraceMind combines a React + Vite frontend, an Express + Prisma backend, an Omni model gateway, and curated generated data. The backend aggregates academic search sources, extracts PDF evidence, builds topic nodes, and routes model calls through a configurable gateway.

## Reference Ecosystem

TraceMind uses or references React, Vite, Express, Prisma, Playwright, Vitest, PyMuPDF, arXiv, OpenAlex, Crossref, Semantic Scholar, Zotero, and related open academic infrastructure.
