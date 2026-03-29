# Model Runtime

`model-runtime/` is the standalone multimodal access layer for this project.

It handles:

- provider abstraction for OpenAI-compatible APIs and Anthropic Messages
- agent-native skill envelopes for Codex, Claude Code, and similar tools
- a stable multimodal request shape
- environment-driven configuration
- CLI entry points for inspection, prompt packaging, and direct execution

## Supported providers

- `openai-compatible`
- `anthropic`
- `agent-skill`

## Example commands

```bash
npx ts-node model-runtime/src/cli.ts list
npx ts-node model-runtime/src/cli.ts inspect paper-tracker --topicId=agent
npx ts-node model-runtime/src/cli.ts prompt content-genesis-v2 --paperId=1706.03762 --topicId=transformer-innovation --agent=codex
npx ts-node model-runtime/src/cli.ts run orchestrator --topicId=agent --maxIterations=1 --provider=anthropic
```

## Environment variables

OpenAI-compatible:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

Anthropic:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`

## Storage rule

The runtime is intentionally thin: it points skill execution back to canonical files under `generated-data/app-data` instead of creating a new run-log hierarchy by default.
