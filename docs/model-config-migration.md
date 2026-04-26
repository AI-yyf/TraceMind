# Model Configuration

TraceMind supports multiple model providers through the Omni Gateway. The intended path is:

1. Use environment variables only for bootstrap defaults.
2. Store provider settings through `/api/model-configs`.
3. Let feature services call Omni Gateway rather than provider SDKs directly.

## Bootstrap Variables

`skills-backend/.env.example` documents the common bootstrap values:

```bash
OMNI_DEFAULT_PROVIDER=bigmodel
OMNI_DEFAULT_BASE_URL=https://open.bigmodel.cn/api/paas/v4
OMNI_DEFAULT_API_KEY=replace-with-your-key
OMNI_LANGUAGE_MODEL=glm-5
OMNI_MULTIMODAL_MODEL=glm-4.6v
```

Provider-specific keys such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_API_KEY` are also supported as fallbacks.

## Runtime Slots

TraceMind distinguishes model roles instead of assuming one model is good for everything:

- language model: planning, reading, synthesis, chat
- multimodal model: figures, screenshots, visual evidence
- role overrides: specialized node writer, vision reader, or future task-specific roles

## Security Rules

- Never commit real credentials.
- Do not hardcode provider keys in frontend code.
- Prefer provider-compatible base URLs and model names in configuration.
- Keep provider validation in backend schemas so bad settings fail early.

## User Workflow

1. Start backend and frontend.
2. Open Settings.
3. Add or update model provider credentials.
4. Test connectivity.
5. Use the selected model profile in research workflows.
