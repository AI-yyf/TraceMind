# Roadmap

This roadmap describes the public baseline after repository cleanup.

## Stable Baseline

- Frontend workbench routes are present for home, topic, node, research, settings, Prompt Studio, and workbench views.
- Backend routes are present for topics, papers, nodes, search, PDF, research, tasks, model configs, Omni, prompt templates, evidence, sync, and Zotero export.
- Generated demo data and static paper assets are available for local exploration.
- Eight UI languages are defined: Chinese, English, Japanese, Korean, German, French, Spanish, and Russian.
- Local-only development artifacts are ignored and removed from Git tracking.

## Near-Term Priorities

- Harden long-running research tasks with a persistent queue layer.
- Add clearer source health dashboards for academic providers.
- Improve PDF extraction fallbacks for difficult formulas, scans, and figure captions.
- Expand export formats for research reports, node articles, and Zotero workflows.
- Publish a stable API contract for third-party integrations.

## Product Direction

TraceMind should become a research memory system, not just a paper search app. Future work should strengthen:

- reproducible evidence trails
- topic-level memory across sessions
- human approval points for uncertain AI output
- transparent model/provider selection
- multilingual research reading and writing

## Non-Goals

- Replacing peer review or expert judgment.
- Hiding uncertainty behind fluent prose.
- Committing local credentials, uploads, screenshots, or agent scratch files.
