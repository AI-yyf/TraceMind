# TraceMind Documentation

This directory is the public documentation entry for TraceMind. It describes the product as it exists in the repository, not temporary planning notes.

## Start Here

1. [Getting Started](getting-started.md): install, configure, and run the frontend/backend.
2. [Architecture](architecture.md): the end-to-end research loop and major system boundaries.
3. [Backend Research Architecture](backend-research-architecture.md): API routes, search aggregation, PDF extraction, scheduling, and model routing.
4. [Model Configuration](model-config-migration.md): how model providers and runtime slots are configured.
5. [Developer Operations](developer-operations.md): local development, tests, quality gates, and release hygiene.
6. [Roadmap](roadmap.md): current completeness level and next product milestones.
7. [Open Source References](open-source-references.md): frameworks, APIs, and prior art used by or referenced by TraceMind.

## User Introductions in 8 Languages

TraceMind currently supports eight UI languages. The user-facing project introduction is mirrored in the same set:

- [中文](i18n/README.zh-CN.md)
- [English](i18n/README.en-US.md)
- [日本語](i18n/README.ja-JP.md)
- [한국어](i18n/README.ko-KR.md)
- [Deutsch](i18n/README.de-DE.md)
- [Français](i18n/README.fr-FR.md)
- [Español](i18n/README.es-ES.md)
- [Русский](i18n/README.ru-RU.md)

## Documentation Principles

- Public docs explain stable concepts, supported workflows, and real commands.
- Local agent instructions, screenshots, temporary QA output, and one-off planning files are intentionally excluded from the public repository.
- When code changes route contracts, model configuration, or generated data requirements, update these docs in the same pull request.
